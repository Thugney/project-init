[CmdletBinding()]
param([string]$ScriptPath)
$ErrorActionPreference = 'Stop'
if (-not $ScriptPath) { $ScriptPath = Join-Path (Split-Path $PSScriptRoot -Parent) 'scripts/source-drift.ps1' }
$testRoot = Join-Path ([IO.Path]::GetTempPath()) ('project-init-source-drift-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $testRoot | Out-Null
$checks = New-Object 'Collections.Generic.List[string]'
function Assert($Condition,[string]$Message) {
    if (-not $Condition) { throw "FAIL: $Message" }
    $checks.Add($Message)
}
function Put([string]$Path,[string]$Text) {
    $directory = Split-Path $Path -Parent
    if (-not (Test-Path -LiteralPath $directory)) { New-Item -ItemType Directory -Path $directory -Force | Out-Null }
    [IO.File]::WriteAllText($Path,$Text)
}
function Fixture([string]$Name,[switch]$Nested,[switch]$Empty) {
    $source = Join-Path $testRoot "$Name/source"
    $review = Join-Path $testRoot "$Name/review"
    if ($Nested) { $review = Join-Path $source 'planning/architecture' }
    New-Item -ItemType Directory -Path $source -Force | Out-Null
    Put (Join-Path $review 'design.json') (@{schemaVersion=1;mode=if($Empty){'New'}else{'Existing'};project=$Name;projectPath=$source} | ConvertTo-Json)
    foreach ($name in @('project-overview','architecture','code-standards','ai-workflow-rules','ui-context','progress-tracker')) { Put (Join-Path $review "context/$name.md") "# $name`nFixture context" }
    if (-not $Empty) { Put (Join-Path $source 'src/app.ps1') "'initial'" }
    return [pscustomobject]@{source=$source;review=$review}
}
function Check($Fixture) { & $ScriptPath -Action Check -ReviewDirectory $Fixture.review -AsObject }
function Capture($Fixture) { & $ScriptPath -Action Capture -ReviewDirectory $Fixture.review -AsObject }
function Reconcile($Fixture) { & $ScriptPath -Action Reconcile -ReviewDirectory $Fixture.review -Actor 'fixture-reviewer' -Text 'Synthetic test fixture evidence only; reviewed current candidate against fixture model and contexts.' -AsObject }
function MustFail([scriptblock]$Operation,[string]$Message) {
    $failed = $false
    try { & $Operation | Out-Null } catch { $failed = $true }
    Assert $failed $Message
}

$fixture = Fixture 'main' -Nested
$initial = Check $fixture
Assert ($initial.state -eq 'untracked' -and $initial.fileCount -eq 1) 'First check is untracked and excludes nested review'
$beforeCheck = @(Get-ChildItem -LiteralPath $fixture.review -File -Recurse | ForEach-Object { $_.FullName + ':' + (Get-FileHash -LiteralPath $_.FullName).Hash }) -join '|'
Check $fixture | Out-Null
$afterCheck = @(Get-ChildItem -LiteralPath $fixture.review -File -Recurse | ForEach-Object { $_.FullName + ':' + (Get-FileHash -LiteralPath $_.FullName).Hash }) -join '|'
Assert ($beforeCheck -ceq $afterCheck) 'Check writes no files'
$sourcePath = Join-Path $fixture.source 'src/app.ps1'
$sourceBefore = (Get-FileHash -LiteralPath $sourcePath).Hash
$sourceWriteBefore = (Get-Item -LiteralPath $sourcePath).LastWriteTimeUtc
MustFail { Reconcile $fixture } 'Reconcile refuses missing candidate'
$captured = Capture $fixture
Assert ($captured.state -eq 'untracked' -and -not (Test-Path -LiteralPath (Join-Path $fixture.review 'source-review.json'))) 'Capture does not reconcile'
Assert ((Reconcile $fixture).state -eq 'current') 'Actual fixture review reconciles captured source and design'
Assert ((Get-FileHash -LiteralPath $sourcePath).Hash -ceq $sourceBefore -and (Get-Item -LiteralPath $sourcePath).LastWriteTimeUtc -eq $sourceWriteBefore) 'Check Capture and Reconcile do not write source'
Put (Join-Path $fixture.source 'src/added.ps1') "'added'"
$state = Check $fixture
Assert ($state.state -eq 'changed' -and 'src/added.ps1' -in $state.added) 'Added source blocks current state'
Capture $fixture | Out-Null
Put $sourcePath "'edited'"
Assert ('src/app.ps1' -in (Check $fixture).modified) 'Edited source is listed as modified'
MustFail { Reconcile $fixture } 'Reconcile refuses source changed after capture'
Capture $fixture | Out-Null
Reconcile $fixture | Out-Null
[IO.File]::Delete((Join-Path $fixture.source 'src/added.ps1'))
Assert ('src/added.ps1' -in (Check $fixture).deleted) 'Deleted source is listed'
[IO.File]::Move($sourcePath,(Join-Path $fixture.source 'src/renamed.ps1'))
$renamed = Check $fixture
Assert ('src/app.ps1' -in $renamed.deleted -and 'src/renamed.ps1' -in $renamed.added) 'Rename is a deletion and addition'
Capture $fixture | Out-Null
Reconcile $fixture | Out-Null
$designPath = Join-Path $fixture.review 'design.json'
$originalDesign = [IO.File]::ReadAllText($designPath)
Put $designPath ($originalDesign + "`n ")
Assert ((Check $fixture).state -eq 'changed' -and (Check $fixture).designChanged) 'Design JSON byte change invalidates reconciliation'
Capture $fixture | Out-Null
Put (Join-Path $fixture.review 'context/architecture.md') '# Updated context'
MustFail { Reconcile $fixture } 'Reconcile refuses design context changed after capture'
Capture $fixture | Out-Null
Reconcile $fixture | Out-Null
foreach ($name in @('project-overview','architecture','code-standards','ai-workflow-rules','ui-context')) {
    Put (Join-Path $fixture.review "context/$name.md") ("# Changed $name " + [Guid]::NewGuid().ToString('N'))
    Assert ((Check $fixture).state -eq 'changed') "Design role $name invalidates reconciliation"
    Capture $fixture | Out-Null
    Reconcile $fixture | Out-Null
}
Put (Join-Path $fixture.review 'context/progress-tracker.md') '# A progress update'
Assert ((Check $fixture).state -eq 'current') 'Progress tracker is outside approved design hash'
$beforeExcluded = (Check $fixture).sourceHash
foreach ($relative in @('node_modules/pkg/a.js','.git/config','.next/server.js','.venv/lib/a.py','build/output.dll','.env','.env.local','private.key','certificate.pem','credentials.dev.json','secrets.json')) { Put (Join-Path $fixture.source $relative) 'excluded fixture content' }
Put (Join-Path $fixture.review 'unrelated-generated-file.txt') 'review output'
$excluded = Check $fixture
Assert ($excluded.state -eq 'current' -and $excluded.sourceHash -ceq $beforeExcluded) 'Dependency build secret and review files do not cause source drift'
Assert ($excluded.exclusions.observed.Count -ge 12 -and $excluded.limitation -match 'not a content scanner') 'Exclusions and coverage limitations are explicit'
$oldDesignHash = $excluded.designHash
Put (Join-Path $fixture.source 'src/renamed.ps1') "'reviewed comment-only change'"
Capture $fixture | Out-Null
$noImpact = Reconcile $fixture
Assert ($noImpact.state -eq 'current' -and $noImpact.designHash -ceq $oldDesignHash) 'Reviewer can reconcile source change with no model impact'
$captures = @(Get-ChildItem -LiteralPath (Join-Path $fixture.review 'history/source-captures') -File)
Assert ($captures.Count -gt 5 -and @(Get-ChildItem -LiteralPath (Join-Path $fixture.review 'history/source-reviews') -File).Count -gt 5) 'Capture and reconciliation preserve previous records'
Capture $fixture | Out-Null
MustFail { & $ScriptPath -Action Reconcile -ReviewDirectory $fixture.review -Actor ' ' -Text ' ' -AsObject } 'Reconcile rejects blank actor or evidence'
$candidatePath = Join-Path $fixture.review 'capture.json'
$candidate = Get-Content -LiteralPath $candidatePath -Raw | ConvertFrom-Json
$candidateArchive = Join-Path $fixture.review "history/source-captures/$($candidate.id).json"
[IO.File]::Delete($candidatePath)
Copy-Item -LiteralPath $candidateArchive -Destination $candidatePath
Assert ((Reconcile $fixture).state -eq 'current') 'Preserved candidate snapshot can recover deleted capture pointer'
$candidate = Get-Content -LiteralPath $candidatePath -Raw | ConvertFrom-Json
$candidate.createdAt = 'altered'
Put $candidatePath ($candidate | ConvertTo-Json -Depth 30)
MustFail { Reconcile $fixture } 'Reconcile rejects candidate altered from preserved capture'

$empty = Fixture 'empty-new' -Empty
Assert ((Check $empty).state -eq 'untracked' -and (Check $empty).fileCount -eq 0) 'An existing empty New source root is valid'
Capture $empty | Out-Null
Assert ((Reconcile $empty).state -eq 'current') 'Empty New source can be reconciled without scaffolding'
$missing = Fixture 'missing-root' -Empty
$missingModel = Get-Content -LiteralPath (Join-Path $missing.review 'design.json') -Raw | ConvertFrom-Json
$missingModel.projectPath = Join-Path $testRoot 'does-not-exist'
Put (Join-Path $missing.review 'design.json') ($missingModel | ConvertTo-Json)
Assert ((Check $missing).state -eq 'unavailable' -and -not (Test-Path -LiteralPath $missingModel.projectPath)) 'Missing New source root is unavailable and never created'
$missingContext = Fixture 'missing-context'
[IO.File]::Delete((Join-Path $missingContext.review 'context/ui-context.md'))
Assert ((Check $missingContext).state -eq 'unavailable') 'Missing required context is unavailable'
$missingDesign = Fixture 'missing-design'
[IO.File]::Delete((Join-Path $missingDesign.review 'design.json'))
Assert ((Check $missingDesign).state -eq 'unavailable') 'Missing design is unavailable'
$overlap = Fixture 'overlap'
$overlapModel = Get-Content -LiteralPath (Join-Path $overlap.review 'design.json') -Raw | ConvertFrom-Json
$overlapModel.projectPath = $overlap.review
Put (Join-Path $overlap.review 'design.json') ($overlapModel | ConvertTo-Json)
Assert ((Check $overlap).state -eq 'unavailable') 'Source root equal to review cannot appear empty and current'
$relocated = Fixture 'relocated' -Empty
Capture $relocated | Out-Null
Reconcile $relocated | Out-Null
$otherEmpty = Join-Path $testRoot 'another-empty-root'
New-Item -ItemType Directory -Path $otherEmpty | Out-Null
$relocatedModel = Get-Content -LiteralPath (Join-Path $relocated.review 'design.json') -Raw | ConvertFrom-Json
$relocatedModel.projectPath = $otherEmpty
Put (Join-Path $relocated.review 'design.json') ($relocatedModel | ConvertTo-Json)
Assert ((Check $relocated).state -eq 'changed') 'Changing source root to an identical empty tree invalidates reconciliation'
MustFail { Reconcile $relocated } 'Changing source root invalidates captured candidate'
$brokenRecord = Fixture 'broken-record'
Capture $brokenRecord | Out-Null
Reconcile $brokenRecord | Out-Null
$reviewRecord = Get-Content -LiteralPath (Join-Path $brokenRecord.review 'source-review.json') -Raw | ConvertFrom-Json
$reviewRecord.manifest[0].sha256 = ('0' * 64)
Put (Join-Path $brokenRecord.review 'source-review.json') ($reviewRecord | ConvertTo-Json -Depth 30)
Assert ((Check $brokenRecord).state -eq 'unavailable') 'Corrupt reviewed manifest fails closed'

$linkFixture = Fixture 'junction'
$target = Join-Path $testRoot 'junction-target'
Put (Join-Path $target 'outside.txt') 'outside root'
$link = Join-Path $linkFixture.source 'linked-directory'
$junctionCreated = $false
try { New-Item -ItemType Junction -Path $link -Target $target -ErrorAction Stop | Out-Null; $junctionCreated = $true } catch { }
if ($junctionCreated) {
    $linkState = Check $linkFixture
    Assert ($linkState.fileCount -eq 1 -and @($linkState.exclusions.observed | Where-Object { $_.reason -eq 'reparse-point' }).Count -eq 1) 'Junction directories are reported and never traversed'
    $linkedRootModel = Get-Content -LiteralPath (Join-Path $linkFixture.review 'design.json') -Raw | ConvertFrom-Json
    $linkedRootModel.projectPath = $link
    Put (Join-Path $linkFixture.review 'design.json') ($linkedRootModel | ConvertTo-Json)
    Assert ((Check $linkFixture).state -eq 'unavailable') 'Linked source root is unavailable'
}

# Hash algorithm parity: extract only Get-BundleHash from the sibling architecture script.
$architecturePath = Join-Path (Split-Path $ScriptPath -Parent) 'architecture.ps1'
$tokens = $null; $parseErrors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile($architecturePath,[ref]$tokens,[ref]$parseErrors)
$hashFunction = $ast.Find({param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Get-BundleHash'},$true)
$reviewRoot = $fixture.review
. ([scriptblock]::Create($hashFunction.Extent.Text))
Assert ((Get-BundleHash) -ceq (Check $fixture).designHash) 'Design hash exactly matches architecture.ps1 model plus five context algorithm'
$json = & $ScriptPath -Action Check -ReviewDirectory $fixture.review | ConvertFrom-Json
Assert ($json.state -eq 'current') 'Default output is parseable JSON'
[pscustomobject]@{passed=$checks.Count;checks=$checks.ToArray();powerShell=$PSVersionTable.PSVersion.ToString();junctionTest=if($junctionCreated){'passed'}else{'unavailable on this host'};fixtureDirectory=$testRoot;limitation='Synthetic local filesystem tests; reviewer evidence in fixtures is explicitly synthetic and does not certify a real architecture.'} | ConvertTo-Json -Depth 10
