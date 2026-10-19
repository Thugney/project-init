[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][ValidateSet('Init','Validate','Render','Feedback','RecordReview','RecordApproval','Status')][string]$Action,
    [Parameter(Mandatory=$true)][string]$ReviewDirectory,
    [string]$ProjectPath,
    [ValidateSet('New','Existing')][string]$Mode = 'Existing',
    [string]$ProjectName,
    [string]$BriefPath,
    [string]$Text,
    [string]$Actor,
    [ValidateSet('pass','changes_requested')][string]$Verdict = 'changes_requested'
)
$ErrorActionPreference = 'Stop'
$reviewRoot = [IO.Path]::GetFullPath($ReviewDirectory)
$contextNames = @('project-overview','architecture','code-standards','ai-workflow-rules','ui-context','progress-tracker')

function Write-JsonFile($Value,[string]$Path) {
    $Value | ConvertTo-Json -Depth 70 | Set-Content -LiteralPath $Path -Encoding UTF8
}
function Read-JsonFile([string]$Path) { return Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json }
function Get-SourceStatus {
    try { return & (Join-Path $PSScriptRoot 'source-drift.ps1') -Action Check -ReviewDirectory $reviewRoot -AsObject }
    catch { return [pscustomobject]@{state='unavailable';sourceHash=$null;designHash=$null;reason=$_.Exception.Message} }
}
function Get-BundleHash {
    # Progress and decisions are deliberately outside the approved design bundle.
    $paths = @('design.json','context/project-overview.md','context/architecture.md','context/code-standards.md','context/ai-workflow-rules.md','context/ui-context.md')
    $buffer = New-Object IO.MemoryStream
    try {
        foreach ($relative in $paths) {
            $path = Join-Path $reviewRoot $relative
            if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Missing design input: $relative" }
            $bytes = [IO.File]::ReadAllBytes($path)
            $prefix = [Text.Encoding]::UTF8.GetBytes("$relative`n$($bytes.Length)`n")
            $buffer.Write($prefix,0,$prefix.Length); $buffer.Write($bytes,0,$bytes.Length)
        }
        $sha = [Security.Cryptography.SHA256]::Create()
        try { return ([BitConverter]::ToString($sha.ComputeHash($buffer.ToArray()))).Replace('-','').ToLowerInvariant() }
        finally { $sha.Dispose() }
    } finally { $buffer.Dispose() }
}
function Get-Validation {
    $model = Read-JsonFile (Join-Path $reviewRoot 'design.json')
    $issues = New-Object 'Collections.Generic.List[string]'
    if ($model.schemaVersion -ne 1) { $issues.Add('Unsupported or missing schemaVersion') }
    if (-not $model.project -or $model.mode -notin @('New','Existing')) { $issues.Add('Project name and New/Existing mode required') }
    if (-not $model.baseline.environment -or -not $model.baseline.description -or $model.baseline.description -match 'ARCHITECTURE_UNFILLED') { $issues.Add('Explain the source/environment baseline') }
    if ($model.mode -eq 'Existing' -and -not $model.baseline.commit -and -not $model.baseline.revisionNote) { $issues.Add('Existing project needs a commit or explicit non-Git revision description') }
    foreach ($group in @('components','requirements','tests','journeys','entities','permissions','tasks')) {
        if (@($model.$group).Count -eq 0 -or $null -eq $model.$group) { $issues.Add("Missing coverage: $group (use an explicit not-applicable entry with rationale when appropriate)") }
    }
    foreach ($group in @('components','requirements','tests','journeys','entities','tasks')) {
        $ids = @{}
        foreach ($entry in $model.$group) {
            if (-not $entry.id -or $ids.ContainsKey([string]$entry.id)) { $issues.Add("Missing or duplicate ID in $group") }
            else { $ids[[string]$entry.id] = $true }
        }
    }
    $components = @($model.components.id)
    foreach ($entry in $model.components) {
        if (-not $entry.label -or -not $entry.responsibility -or $entry.evidenceStatus -notin @('observed','proposed','not_applicable') -or @($entry.sources).Count -eq 0) { $issues.Add("Incomplete component: $($entry.id)") }
    }
    foreach ($edge in $model.edges) {
        if ($edge.from -notin $components -or $edge.to -notin $components -or -not $edge.label) { $issues.Add('Broken or unlabeled system connection') }
    }
    foreach ($journey in $model.journeys) {
        if (-not $journey.label -or @($journey.nodes).Count -eq 0 -or @($journey.failurePaths).Count -eq 0) { $issues.Add("Incomplete journey: $($journey.id)") }
        $ids = @($journey.nodes.id)
        if (@($ids | Select-Object -Unique).Count -ne $ids.Count -or @($journey.nodes | Where-Object { -not $_.id -or -not $_.label }).Count -gt 0) { $issues.Add("Invalid journey nodes: $($journey.id)") }
        foreach ($edge in $journey.edges) { if ($edge.from -notin $ids -or $edge.to -notin $ids -or -not $edge.label) { $issues.Add("Broken journey edge: $($journey.id)") } }
    }
    foreach ($entity in $model.entities) {
        if (-not $entity.label -or -not $entity.owner -or @($entity.fields).Count -eq 0) { $issues.Add("Incomplete data entity: $($entity.id)") }
    }
    foreach ($edge in $model.relationships) { if ($edge.from -notin @($model.entities.id) -or $edge.to -notin @($model.entities.id) -or -not $edge.label) { $issues.Add('Broken data relationship') } }
    foreach ($permission in $model.permissions) { if (-not $permission.role -or -not $permission.scope -or -not $permission.enforcedAt) { $issues.Add('Incomplete permission boundary') } }
    foreach ($requirement in $model.requirements) {
        if (-not $requirement.description -or -not $requirement.actor -or $requirement.owner -notin $components -or -not $requirement.data -or -not $requirement.permission -or @($requirement.tests).Count -eq 0 -or @($requirement.journeyIds).Count -eq 0) { $issues.Add("Incomplete requirement: $($requirement.id)") }
        foreach ($test in $requirement.tests) { if ($test -notin @($model.tests.id)) { $issues.Add("Unknown test: $test") } }
        foreach ($journey in $requirement.journeyIds) { if ($journey -notin @($model.journeys.id)) { $issues.Add("Unknown journey: $journey") } }
    }
    foreach ($test in $model.tests) { if (-not $test.scenario -or $test.status -notin @('not_run','pass','fail','blocked')) { $issues.Add("Incomplete test: $($test.id)") } }
    $resolved = @()
    foreach ($task in $model.tasks) {
        if (-not $task.label) { $issues.Add("Missing task label: $($task.id)") }
        foreach ($dependency in $task.dependsOn) { if ($dependency -notin @($model.tasks.id)) { $issues.Add("Unknown task dependency: $dependency") } }
    }
    do {
        $count = $resolved.Count
        foreach ($task in $model.tasks) { if ($task.id -notin $resolved -and @($task.dependsOn | Where-Object { $_ -notin $resolved }).Count -eq 0) { $resolved += $task.id } }
    } while ($resolved.Count -gt $count)
    if ($resolved.Count -ne @($model.tasks).Count) { $issues.Add('Task dependency cycle') }
    foreach ($name in $contextNames) {
        $path = Join-Path $reviewRoot "context/$name.md"
        if (-not (Test-Path -LiteralPath $path)) { $issues.Add("Missing context file: $name") }
        elseif ((Get-Content -LiteralPath $path -Raw) -match 'ARCHITECTURE_UNFILLED') { $issues.Add("Unfilled context: $name") }
    }
    foreach ($question in $model.questions) { if (-not $question.id -or -not $question.question -or $question.status -notin @('open','resolved')) { $issues.Add('Invalid architecture question') } }
    $blockers = @($model.questions | Where-Object { $_.blocking -and $_.status -ne 'resolved' } | ForEach-Object { $_.id })
    return [pscustomobject]@{structuralPass=$issues.Count -eq 0;issues=@($issues.ToArray());unresolvedBlockers=$blockers;artifactHash=(Get-BundleHash);limitation='Checks references and required coverage, not semantic correctness, real source evidence, or live behaviour. Review/approval records are auditable local records, not authenticated security credentials.'}
}
function Get-CurrentStatus {
    $validation = Get-Validation
    $source = Get-SourceStatus
    $reviewPath = Join-Path $reviewRoot 'review.json'; $approvalPath = Join-Path $reviewRoot 'approval.json'
    $review = if (Test-Path -LiteralPath $reviewPath) { Read-JsonFile $reviewPath } else { $null }
    $approval = if (Test-Path -LiteralPath $approvalPath) { Read-JsonFile $approvalPath } else { $null }
    $reviewMatches = $review -and $review.verdict -eq 'pass' -and $review.artifactHash -ceq $validation.artifactHash -and $source.state -eq 'current' -and $review.sourceHash -ceq $source.sourceHash
    $approvalMatches = $approval -and $approval.artifactHash -ceq $validation.artifactHash -and $approval.decision -eq 'approve'
    $feedbackPath = Join-Path $reviewRoot 'feedback.json'
    $feedback = if (Test-Path -LiteralPath $feedbackPath) { @(Read-JsonFile $feedbackPath) } else { @() }
    $lastFeedback = @($feedback | Select-Object -Last 1)
    $unansweredFeedback = $lastFeedback.Count -gt 0 -and (-not $review -or [DateTimeOffset]::Parse($lastFeedback[0].createdAt) -ge [DateTimeOffset]::Parse($review.createdAt))
    [pscustomobject]@{validation=$validation;source=$source;reviewMatches=[bool]$reviewMatches;approvalMatches=[bool]$approvalMatches;unansweredFeedback=[bool]$unansweredFeedback;readyForImplementationPlanning=($validation.structuralPass -and $source.state -eq 'current' -and $validation.unresolvedBlockers.Count -eq 0 -and $reviewMatches -and $approvalMatches -and -not $unansweredFeedback);appImplementationAuthorized=$false}
}

if ($Action -eq 'Init') {
    if (-not $ProjectPath) { throw 'Init requires ProjectPath' }
    $projectRoot = [IO.Path]::GetFullPath($ProjectPath)
    if (-not $ProjectName) { $ProjectName = Split-Path $projectRoot -Leaf }
    if ($Mode -eq 'Existing' -and -not (Test-Path -LiteralPath $projectRoot -PathType Container)) { throw 'Existing project directory does not exist' }
    if ($Mode -eq 'New' -and (Test-Path -LiteralPath $projectRoot) -and @(Get-ChildItem -LiteralPath $projectRoot -Force).Count -gt 0) { throw 'New mode refuses a nonempty project. Use Existing.' }
    if (Test-Path -LiteralPath $reviewRoot) { throw 'Review directory already exists. Use Status/Render/Feedback to resume; initialization never overwrites.' }
    $brief = if ($BriefPath) { Get-Content -LiteralPath $BriefPath -Raw } else { 'Product brief not yet supplied. Agent must collect intent before designing.' }
    New-Item -ItemType Directory -Force -Path (Join-Path $reviewRoot 'context'),(Join-Path $reviewRoot 'history') | Out-Null
    $baseline = [ordered]@{commit=$null;revisionNote=if($Mode -eq 'New'){'New project; no application code created'}else{'Agent must identify source revision and local changes'};environment='not inspected';description='ARCHITECTURE_UNFILLED'}
    $model = [ordered]@{schemaVersion=1;project=$ProjectName;mode=$Mode;projectPath=$projectRoot;baseline=$baseline;components=@();edges=@();journeys=@();entities=@();relationships=@();permissions=@();requirements=@();tests=@();tasks=@();questions=@(@{id='Q01';question='Clarify product intent and inspect the declared baseline';blocking=$true;status='open'})}
    Write-JsonFile $model (Join-Path $reviewRoot 'design.json')
    $brief | Set-Content -LiteralPath (Join-Path $reviewRoot 'brief.md') -Encoding UTF8
    $roles = @{
        'project-overview'='Purpose, users, goals, complete journeys, scope and exclusions. Distinguish source observations from product decisions.'
        'architecture'='Components, labelled connections, data, roles, interfaces, failure paths, operations, sources and unresolved decisions. Diagrams are rendered from design.json.'
        'code-standards'='Use the selected actual stack and existing conventions. No copied vendor/language defaults.'
        'ai-workflow-rules'='One bounded unit; diagrams before code; independent review; human feedback/revision; preserve existing work and approval boundaries.'
        'ui-context'='Preserve existing design for existing projects; agree a design for new projects. Document relevant responsive, accessibility and state behaviour.'
        'progress-tracker'='Current phase, completed evidence, remaining questions, latest feedback, review hash and next action. Never label app tests run without evidence.'
    }
    foreach ($name in $contextNames) { "# $name`n`nARCHITECTURE_UNFILLED`n`n$($roles[$name])" | Set-Content -LiteralPath (Join-Path $reviewRoot "context/$name.md") -Encoding UTF8 }
    $router = "# Architecture review workspace`n`nUse the project-init skill in architecture-first mode. Read brief.md, design.json, current feedback.json if present, and context/progress-tracker.md. Inspect only the selected project's allowed sources. Fill six context roles and the model; render review.html; obtain independent review; show the diagrams to the user. Revise from feedback before asking for acceptance of this exact bundle. No app scaffolding or implementation until the user accepts the architecture and authorizes a bounded next task. Existing project instructions remain authoritative.`n"
    $router | Set-Content -LiteralPath (Join-Path $reviewRoot 'AGENTS.md') -Encoding UTF8
    [pscustomobject]@{reviewDirectory=$reviewRoot;project=$ProjectName;mode=$Mode;next='Agent fills design.json and six context files from intent/evidence, then Render. No application code or Git actions performed.'} | ConvertTo-Json
    exit
}
if (-not (Test-Path -LiteralPath (Join-Path $reviewRoot 'design.json'))) { throw 'No initialized design.json at ReviewDirectory' }
switch ($Action) {
    'Validate' { Get-Validation | ConvertTo-Json -Depth 30 }
    'Status' { Get-CurrentStatus | ConvertTo-Json -Depth 30 }
    'Render' {
        $renderer = Join-Path $PSScriptRoot 'render-architecture.ps1'
        $source = Get-SourceStatus
        & $renderer -ModelPath (Join-Path $reviewRoot 'design.json') -OutputPath (Join-Path $reviewRoot 'review.html') -SourceState $source.state -SourceCheckedAt ([DateTimeOffset]::UtcNow.ToString('o'))
        Get-CurrentStatus | ConvertTo-Json -Depth 30
    }
    'Feedback' {
        if (-not $Text) { throw 'Feedback requires the actual user Text' }
        $hash = Get-BundleHash; $stamp = [DateTimeOffset]::UtcNow.ToString('o')
        $id = [Guid]::NewGuid().ToString('N')
        $snapshot = Join-Path $reviewRoot "history/$id"
        New-Item -ItemType Directory -Path $snapshot | Out-Null
        Copy-Item -LiteralPath (Join-Path $reviewRoot 'design.json') -Destination (Join-Path $snapshot 'design.json')
        Copy-Item -LiteralPath (Join-Path $reviewRoot 'context') -Destination (Join-Path $snapshot 'context') -Recurse
        $path = Join-Path $reviewRoot 'feedback.json'
        $entries = if (Test-Path -LiteralPath $path) { @(Read-JsonFile $path) } else { @() }
        $entries += [pscustomobject]@{id=$id;createdAt=$stamp;artifactHash=$hash;text=$Text;snapshot="history/$id"}
        Write-JsonFile @($entries) $path
        [pscustomobject]@{next='Agent revises model and affected context from this feedback, rerenders and obtains fresh review. Prior approval does not authorize the revised design.';feedbackId=$id} | ConvertTo-Json
    }
    'RecordReview' {
        if (-not $Text -or -not $Actor) { throw 'RecordReview requires reviewer Actor and actual review Text' }
        $validation = Get-Validation
        if ($Verdict -eq 'pass' -and -not $validation.structuralPass) { throw 'Cannot record PASS while structural checks fail' }
        $source = Get-SourceStatus
        if ($Verdict -eq 'pass' -and $source.state -ne 'current') { throw 'Cannot record PASS until source and design have an independent reconciliation. Capture, review, Reconcile, then RecordReview.' }
        Write-JsonFile ([ordered]@{verdict=$Verdict;actor=$Actor;evidence=$Text;artifactHash=$validation.artifactHash;sourceHash=$source.sourceHash;createdAt=[DateTimeOffset]::UtcNow.ToString('o')}) (Join-Path $reviewRoot 'review.json')
        Get-CurrentStatus | ConvertTo-Json -Depth 30
    }
    'RecordApproval' {
        if (-not $Text -or -not $Actor) { throw 'RecordApproval requires the actual human approval quote/reference in Text and human Actor. Never fabricate either.' }
        $status = Get-CurrentStatus
        if (-not $status.validation.structuralPass -or $status.validation.unresolvedBlockers.Count -gt 0 -or -not $status.reviewMatches -or $status.unansweredFeedback) { throw 'Design is not eligible for approval: resolve blockers/feedback and obtain fresh independent review first.' }
        Write-JsonFile ([ordered]@{decision='approve';actor=$Actor;evidence=$Text;artifactHash=$status.validation.artifactHash;createdAt=[DateTimeOffset]::UtcNow.ToString('o');scope='Architecture accepted; no implicit implementation, Git or deployment authorization'}) (Join-Path $reviewRoot 'approval.json')
        Get-CurrentStatus | ConvertTo-Json -Depth 30
    }
}
