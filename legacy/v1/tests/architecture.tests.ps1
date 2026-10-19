[CmdletBinding()]
param(
  [string]$ArchitectureScript = (Join-Path $PSScriptRoot '../scripts/architecture.ps1'),
  [string]$ResultPath = (Join-Path ([IO.Path]::GetTempPath()) ('project-init-results-' + [Guid]::NewGuid().ToString('N') + '.json'))
)
$ErrorActionPreference = 'Stop'
$fixtureRoot = Join-Path ([IO.Path]::GetTempPath()) ('project-init-tests-' + [Guid]::NewGuid().ToString('N'))
$null = New-Item -ItemType Directory -Path $fixtureRoot
$engine = (Get-Process -Id $PID).Path
$results = New-Object 'Collections.Generic.List[object]'
$contextNames = @('project-overview','architecture','code-standards','ai-workflow-rules','ui-context','progress-tracker')
function Assert-True([bool]$Condition,[string]$Message) { if (-not $Condition) { throw $Message } }
function Invoke-Architecture([string]$Action,[string]$Review,[hashtable]$Extra=@{}) {
  $arguments = @('-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',$ArchitectureScript,'-Action',$Action,'-ReviewDirectory',$Review)
  foreach ($key in $Extra.Keys) { $arguments += ('-' + $key); $arguments += [string]$Extra[$key] }
  $priorPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try { $lines = & $engine @arguments 2>&1; $code = $LASTEXITCODE }
  finally { $ErrorActionPreference = $priorPreference }
  $output = ($lines | ForEach-Object { [string]$_ }) -join [Environment]::NewLine
  $json = $null
  if ($code -eq 0) { try { $json = $output | ConvertFrom-Json } catch { throw "Action $Action returned non-JSON success: $output" } }
  return [pscustomobject]@{exitCode=$code;output=$output;json=$json}
}
function Test-Case([string]$Id,[string]$Name,[scriptblock]$Body) {
  $timer = [Diagnostics.Stopwatch]::StartNew()
  try { & $Body; $passed=$true; $detail='Observed expected behavior' }
  catch { $passed=$false; $detail=$_.Exception.Message }
  $timer.Stop()
  $results.Add([pscustomobject]@{id=$Id;name=$Name;passed=$passed;detail=$detail;durationMs=$timer.ElapsedMilliseconds})
  $prefix = if ($passed) { 'PASS ' } else { 'FAIL ' }
  Write-Output ($prefix + $Id + ': ' + $Name)
  if (-not $passed) { Write-Output $detail }
}
function Write-Model([string]$Review,$Model) { $Model | ConvertTo-Json -Depth 50 | Set-Content -LiteralPath (Join-Path $Review 'design.json') -Encoding UTF8 }
function Read-Model([string]$Review) { return Get-Content -LiteralPath (Join-Path $Review 'design.json') -Raw | ConvertFrom-Json }
function Fill-Model([string]$Review,[string]$Name) {
  $model = Read-Model $Review
  $model.baseline.environment='synthetic local test fixture'
  $model.baseline.description="Synthetic design for $Name; no deployed app."
  $model.baseline.revisionNote='Test fixture source baseline retained locally'
  $model.components=@(@{id='desk';label="$Name desk";responsibility='Own and validate user requests';evidenceStatus='proposed';sources=@('Synthetic test brief')},@{id='store';label='Record store';responsibility='Persist account-owned request';evidenceStatus='proposed';sources=@('Synthetic test brief')})
  $model.edges=@(@{from='desk';to='store';label='Save validated owner request'})
  $model.journeys=@(@{id='request';label='Send a request';nodes=@(@{id='edit';label='Enter request'},@{id='saved';label='See saved request'});edges=@(@{from='edit';to='saved';label='Validation and persistence succeed'});failurePaths=@('Failed validation preserves input and explains correction')})
  $model.entities=@(@{id='request-record';label='Request';owner='Requesting account';fields=@('id','owner_id','requested_item')})
  $model.relationships=@()
  $model.permissions=@(@{role='requester';scope='Own request records';enforcedAt='Persistence owner check'})
  $model.requirements=@(@{id='R1';description='A requester can save and reopen an owned request';owner='desk';actor='requester';data='request-record';permission='Own records only';tests=@('T1');journeyIds=@('request')})
  $model.tests=@(@{id='T1';scenario='Owner saves; a second account cannot open the record';status='not_run'})
  $model.tasks=@(@{id='prepare';label='Agree data owner boundary';dependsOn=@()},@{id='build';label='Implement the approved owned-request flow';dependsOn=@('prepare')})
  $model.questions=@()
  Write-Model $Review $model
  foreach ($namePart in $contextNames) { "# $namePart`n`nSynthetic test design for $Name. Scope: owned requests. Existing source is preserved. App behavior has not been implemented or tested." | Set-Content -LiteralPath (Join-Path $Review "context/$namePart.md") -Encoding UTF8 }
}
function Record-TestReview([string]$Review) {
  $model = Read-Model $Review
  if (-not (Test-Path -LiteralPath $model.projectPath)) { $null = New-Item -ItemType Directory -Path $model.projectPath }
  $driftScript = Join-Path (Split-Path $ArchitectureScript -Parent) 'source-drift.ps1'
  $null = & $driftScript -Action Capture -ReviewDirectory $Review
  $null = & $driftScript -Action Reconcile -ReviewDirectory $Review -Actor 'SYNTHETIC_TEST_REVIEWER' -Text 'Synthetic source reconciliation fixture; no real review claimed.'
  $result=Invoke-Architecture 'RecordReview' $Review @{Actor='SYNTHETIC_TEST_REVIEWER';Text='SYNTHETIC TEST ONLY: exercise local audit record; no real independent review claimed.';Verdict='pass'}
  Assert-True ($result.exitCode -eq 0) $result.output
  return $result.json
}
function Record-TestApproval([string]$Review) {
  $result=Invoke-Architecture 'RecordApproval' $Review @{Actor='SYNTHETIC_TEST_OWNER';Text='SYNTHETIC TEST FIXTURE ONLY: local approval-path test, not real human authorization.'}
  Assert-True ($result.exitCode -eq 0) $result.output
  return $result.json
}
function Test-InvalidModel([string]$Name,[scriptblock]$Mutation,[string]$ExpectedIssue) {
  Test-Case $Name ('Validation rejects ' + $Name) {
    $model=$script:validModelText | ConvertFrom-Json
    & $Mutation $model
    Write-Model $newReview $model
    try {
      $result=Invoke-Architecture 'Validate' $newReview
      Assert-True ($result.exitCode -eq 0) $result.output
      Assert-True (-not $result.json.structuralPass) 'Invalid design incorrectly passed structural validation'
      Assert-True (($result.json.issues -join '|') -match $ExpectedIssue) ('Expected issue absent: ' + ($result.json.issues -join '|'))
    } finally { Set-Content -LiteralPath (Join-Path $newReview 'design.json') -Value $script:validModelText -Encoding UTF8 }
  }
}
$newProject=Join-Path $fixtureRoot 'Library request app'
$newReview=Join-Path $fixtureRoot 'Library architecture'
$existingProject=Join-Path $fixtureRoot 'Garden schedule app'
$existingReview=Join-Path $fixtureRoot 'Garden architecture'
$null=New-Item -ItemType Directory -Path $existingProject
'EXISTING SOURCE SENTINEL' | Set-Content -LiteralPath (Join-Path $existingProject 'source.txt') -Encoding UTF8
'# Existing instructions must remain byte-identical' | Set-Content -LiteralPath (Join-Path $existingProject 'AGENTS.md') -Encoding UTF8
$sourceHash=(Get-FileHash -LiteralPath (Join-Path $existingProject 'source.txt')).Hash
$agentsHash=(Get-FileHash -LiteralPath (Join-Path $existingProject 'AGENTS.md')).Hash
Test-Case 'init-new' 'New initialization writes review only, without app or Git scaffold' {
  $r=Invoke-Architecture 'Init' $newReview @{ProjectPath=$newProject;ProjectName='Library request desk';Mode='New'}
  Assert-True ($r.exitCode -eq 0) $r.output
  Assert-True (-not (Test-Path -LiteralPath $newProject)) 'New project path was created unexpectedly'
  Assert-True (Test-Path -LiteralPath (Join-Path $newReview 'design.json')) 'Missing review model'
  Assert-True (@(Get-ChildItem -LiteralPath $newReview -Recurse -Force | Where-Object { $_.Name -in @('.git','package.json','node_modules') }).Count -eq 0) 'Review contains application/Git scaffold'
}
Test-Case 'init-existing' 'Existing initialization preserves sentinel source and AGENTS bytes' {
  $r=Invoke-Architecture 'Init' $existingReview @{ProjectPath=$existingProject;ProjectName='Garden scheduling desk';Mode='Existing'}
  Assert-True ($r.exitCode -eq 0) $r.output
  Assert-True ((Get-FileHash -LiteralPath (Join-Path $existingProject 'source.txt')).Hash -eq $sourceHash) 'Existing source changed'
  Assert-True ((Get-FileHash -LiteralPath (Join-Path $existingProject 'AGENTS.md')).Hash -eq $agentsHash) 'Existing AGENTS changed'
  Assert-True (@(Get-ChildItem -LiteralPath $existingProject -Force).Count -eq 2) 'Unexpected files added to existing app'
}
Test-Case 'init-repeat' 'Repeat initialization refuses overwrite and retains review bytes' {
  $before=(Get-FileHash -LiteralPath (Join-Path $newReview 'design.json')).Hash
  $r=Invoke-Architecture 'Init' $newReview @{ProjectPath=$newProject;Mode='New'}
  Assert-True ($r.exitCode -ne 0) 'Repeat Init succeeded'
  Assert-True ($r.output -match 'already exists') $r.output
  Assert-True ((Get-FileHash -LiteralPath (Join-Path $newReview 'design.json')).Hash -eq $before) 'Existing review overwritten'
}
Test-Case 'init-missing-existing' 'Missing Existing project is rejected before review writes' {
  $target=Join-Path $fixtureRoot 'Missing-review'
  $r=Invoke-Architecture 'Init' $target @{ProjectPath=(Join-Path $fixtureRoot 'Missing-app');Mode='Existing'}
  Assert-True ($r.exitCode -ne 0) 'Missing existing app accepted'
  Assert-True ($r.output -match 'Existing project directory does not exist') $r.output
  Assert-True (-not (Test-Path -LiteralPath $target)) 'Rejected initialization wrote review'
}
Test-Case 'init-nonempty-new' 'New mode rejects a nonempty source directory' {
  $target=Join-Path $fixtureRoot 'Refused-review'
  $r=Invoke-Architecture 'Init' $target @{ProjectPath=$existingProject;Mode='New'}
  Assert-True ($r.exitCode -ne 0) 'Nonempty New app accepted'
  Assert-True ($r.output -match 'New mode refuses a nonempty project') $r.output
  Assert-True (-not (Test-Path -LiteralPath $target)) 'Rejected initialization wrote review'
}
Test-Case 'unfilled' 'Generated placeholders cannot pass structural validation' {
  $r=Invoke-Architecture 'Validate' $newReview
  Assert-True ($r.exitCode -eq 0) $r.output
  Assert-True (-not $r.json.structuralPass) 'Unfilled skeleton passed'
}
Fill-Model $newReview 'Library request desk'
Fill-Model $existingReview 'Garden scheduling desk'
$script:validModelText=Get-Content -LiteralPath (Join-Path $newReview 'design.json') -Raw
foreach ($targetReview in @($newReview,$existingReview)) {
  Test-Case ('valid-' + (Split-Path $targetReview -Leaf)) 'Filled generic design validates with real app tests explicitly not run' {
    $r=Invoke-Architecture 'Validate' $targetReview
    Assert-True ($r.exitCode -eq 0) $r.output
    Assert-True ([bool]$r.json.structuralPass) ($r.json.issues -join '|')
    Assert-True ((Read-Model $targetReview).tests[0].status -eq 'not_run') 'Synthetic design falsely marked app tests run'
  }
}
Test-InvalidModel 'broken-system-reference' {param($m) $m.edges[0].to='missing'} 'Broken or unlabeled system'
Test-InvalidModel 'broken-journey-reference' {param($m) $m.journeys[0].edges[0].to='missing'} 'Broken journey edge'
Test-InvalidModel 'broken-data-reference' {param($m) $m.relationships=@(@{from='request-record';to='missing';label='invalid'})} 'Broken data relationship'
Test-InvalidModel 'unknown-requirement-test' {param($m) $m.requirements[0].tests=@('missing')} 'Unknown test'
Test-InvalidModel 'unknown-requirement-journey' {param($m) $m.requirements[0].journeyIds=@('missing')} 'Unknown journey'
Test-InvalidModel 'missing-permissions' {param($m) $m.permissions=@()} 'Missing coverage: permissions'
Test-InvalidModel 'missing-journeys' {param($m) $m.journeys=@()} 'Missing coverage: journeys'
Test-InvalidModel 'task-cycle' {param($m) $m.tasks[0].dependsOn=@('build')} 'Task dependency cycle'
Test-InvalidModel 'unknown-task-dependency' {param($m) $m.tasks[1].dependsOn=@('missing')} 'Unknown task dependency'
Test-Case 'approval-without-review' 'Approval requires a passing current review' {
  $r=Invoke-Architecture 'RecordApproval' $newReview @{Actor='SYNTHETIC_TEST_OWNER';Text='Synthetic fixture approval-path test'}
  Assert-True ($r.exitCode -ne 0) 'Approval accepted without review'
}
Test-Case 'untracked-source-blocks-review' 'A design cannot pass review without source reconciliation' {
  $r=Invoke-Architecture 'RecordReview' $newReview @{Actor='SYNTHETIC_TEST_REVIEWER';Text='Fixture';Verdict='pass'}
  Assert-True ($r.exitCode -ne 0) 'PASS accepted without source reconciliation'
}
Test-Case 'blocking-question' 'Unresolved blocking question prevents approval despite structural pass and local review' {
  $m=Read-Model $newReview
  $m.questions=@(@{id='Q-block';question='Synthetic unresolved data ownership decision';blocking=$true;status='open'})
  Write-Model $newReview $m
  $null=Record-TestReview $newReview
  $r=Invoke-Architecture 'RecordApproval' $newReview @{Actor='SYNTHETIC_TEST_OWNER';Text='Synthetic fixture approval-path test'}
  Assert-True ($r.exitCode -ne 0) 'Approval accepted with blocker'
  $s=Invoke-Architecture 'Status' $newReview
  Assert-True (-not $s.json.readyForImplementationPlanning) 'Blocked model reported ready'
  Set-Content -LiteralPath (Join-Path $newReview 'design.json') -Value $script:validModelText -Encoding UTF8
}
Test-Case 'synthetic-audit-records' 'Synthetic local review/approval make architecture planning ready, never authorize app implementation' {
  $null=Record-TestReview $newReview
  $s=Record-TestApproval $newReview
  Assert-True ([bool]$s.readyForImplementationPlanning) 'Reviewed and approved fixture not ready'
  Assert-True (-not $s.appImplementationAuthorized) 'Architecture acceptance authorized implementation'
}
foreach ($relative in @('design.json','context/architecture.md','context/code-standards.md')) {
  Test-Case ('changed-' + $relative) 'Design or architecture/code context change invalidates both prior records' {
    $null=Record-TestReview $newReview
    $null=Record-TestApproval $newReview
    if ($relative -eq 'design.json') { $m=Read-Model $newReview; $m.baseline.description+=' Revised design scope.'; Write-Model $newReview $m }
    else { Add-Content -LiteralPath (Join-Path $newReview $relative) -Value "`nSynthetic revised architecture decision." -Encoding UTF8 }
    $r=Invoke-Architecture 'Status' $newReview
    Assert-True ($r.exitCode -eq 0) $r.output
    Assert-True (-not $r.json.reviewMatches) 'Stale review still matches'
    Assert-True (-not $r.json.approvalMatches) 'Stale approval still matches'
    Assert-True (-not $r.json.readyForImplementationPlanning) 'Changed design is ready without fresh review'
  }
}
Test-Case 'feedback-snapshot' 'Feedback snapshots exact design/context and blocks acceptance pending fresh review' {
  $null=Record-TestReview $newReview
  $null=Record-TestApproval $newReview
  $before=(Get-FileHash -LiteralPath (Join-Path $newReview 'design.json')).Hash
  $contextBefore=(Get-FileHash -LiteralPath (Join-Path $newReview 'context/architecture.md')).Hash
  $r=Invoke-Architecture 'Feedback' $newReview @{Text='SYNTHETIC TEST FEEDBACK: explain the recovery action'}
  Assert-True ($r.exitCode -eq 0) $r.output
  $entries=@(Get-Content -LiteralPath (Join-Path $newReview 'feedback.json') -Raw | ConvertFrom-Json)
  $snapshot=Join-Path $newReview $entries[-1].snapshot
  Assert-True ((Get-FileHash -LiteralPath (Join-Path $snapshot 'design.json')).Hash -eq $before) 'Snapshot model differs'
  Assert-True ((Get-FileHash -LiteralPath (Join-Path $snapshot 'context/architecture.md')).Hash -eq $contextBefore) 'Snapshot context differs'
  $s=Invoke-Architecture 'Status' $newReview
  Assert-True ([bool]$s.json.unansweredFeedback) 'Feedback not considered unanswered'
  Assert-True (-not $s.json.readyForImplementationPlanning) 'New feedback did not invalidate readiness'
  $a=Invoke-Architecture 'RecordApproval' $newReview @{Actor='SYNTHETIC_TEST_OWNER';Text='Synthetic test only'}
  Assert-True ($a.exitCode -ne 0) 'Approval accepted while feedback unanswered'
  Add-Content -LiteralPath (Join-Path $newReview 'context/architecture.md') -Value "`nFeedback resolution: retry preserves entered request." -Encoding UTF8
  $null=Record-TestReview $newReview
  $s=Record-TestApproval $newReview
  Assert-True ([bool]$s.readyForImplementationPlanning) 'Revised, freshly reviewed and approved fixture not ready'
  Assert-True ((Get-FileHash -LiteralPath (Join-Path $snapshot 'design.json')).Hash -eq $before) 'Snapshot changed after revision'
}
Test-Case 'source-preservation-final' 'All review, approval and feedback actions leave existing project bytes unchanged' {
  Assert-True ((Get-FileHash -LiteralPath (Join-Path $existingProject 'source.txt')).Hash -eq $sourceHash) 'Source sentinel changed'
  Assert-True ((Get-FileHash -LiteralPath (Join-Path $existingProject 'AGENTS.md')).Hash -eq $agentsHash) 'Existing AGENTS changed'
}
Test-Case 'source-drift-blocks-ready' 'Changed app code closes readiness until independently reconciled and reviewed' {
  $null=Record-TestReview $newReview
  $null=Record-TestApproval $newReview
  Set-Content -LiteralPath (Join-Path $newProject 'new-handler.js') -Value '// synthetic source change' -Encoding UTF8
  $s=Invoke-Architecture 'Status' $newReview
  Assert-True ($s.json.source.state -eq 'changed') 'Added source did not flag drift'
  Assert-True (-not $s.json.reviewMatches -and -not $s.json.readyForImplementationPlanning) 'Drift did not close readiness'
  $r=Invoke-Architecture 'RecordReview' $newReview @{Actor='SYNTHETIC_TEST_REVIEWER';Text='Fixture';Verdict='pass'}
  Assert-True ($r.exitCode -ne 0) 'PASS accepted while source reconciliation stale'
  $null=Record-TestReview $newReview
  $s=Invoke-Architecture 'Status' $newReview
  Assert-True ($s.json.source.state -eq 'current' -and $s.json.readyForImplementationPlanning) 'Reviewed code-only fixture could not resume unchanged approved design'
}
$report=[ordered]@{generatedAt=[DateTimeOffset]::UtcNow.ToString('o');script=$ArchitectureScript;scriptSha256=(Get-FileHash -LiteralPath $ArchitectureScript).Hash;fixtureRoot=$fixtureRoot;passed=@($results | Where-Object passed).Count;failed=@($results | Where-Object { -not $_.passed }).Count;tests=@($results.ToArray());limitations=@('All actors, reviews, approvals and feedback are synthetic and confined to disposable test fixtures.','Local records are not authenticated identities or security proof.','Validation tests establish structural and workflow behavior, not semantic architecture quality or live application behavior.','Renderer is intentionally outside this script test scope.','No application implementation, Git mutations, network requests, installs, or live integrations performed.')}
$report | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $ResultPath -Encoding UTF8
Write-Output ("Results: {0} passed, {1} failed. {2}" -f $report.passed,$report.failed,$ResultPath)
if ($report.failed -gt 0) { exit 1 }



