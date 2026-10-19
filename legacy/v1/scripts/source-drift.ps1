[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][ValidateSet('Check','Capture','Reconcile')][string]$Action,
    [Parameter(Mandatory=$true)][string]$ReviewDirectory,
    [string]$Actor,
    [string]$Text,
    [switch]$AsObject
)
$ErrorActionPreference = 'Stop'
function Get-NormalPath([string]$Path) {
    $full = [IO.Path]::GetFullPath($Path)
    $root = [IO.Path]::GetPathRoot($full)
    if ($full.Equals($root,[StringComparison]::OrdinalIgnoreCase)) { return $root }
    return $full.TrimEnd('\','/')
}
$reviewRoot = Get-NormalPath $ReviewDirectory
$bundlePaths = @('design.json','context/project-overview.md','context/architecture.md','context/code-standards.md','context/ai-workflow-rules.md','context/ui-context.md')
$excludedDirectories = @('.git','node_modules','bower_components','vendor','.next','.nuxt','.output','dist','build','out','coverage','.cache','.turbo','.parcel-cache','.venv','venv','env','__pycache__','.pytest_cache','.mypy_cache','bin','obj','.ssh','.aws','.azure')
$secretPatterns = @('.env','.env.*','*.pem','*.key','*.pfx','*.p12','*.crt','*.cer','*.keystore','*.jks','id_rsa*','id_ed25519*','credentials*.json','secrets.*')
$limitation = 'Local file-content drift only; hashes do not establish architecture accuracy, reviewer identity, human acceptance, runtime behaviour, or implementation authorization. Excluded dependencies, generated files, secret-pattern files and reparse points are outside coverage. Secret patterns are not a content scanner. The scan is not a filesystem-atomic snapshot; concurrent edits after scanning are detected on the next check.'

function Test-Within([string]$Path,[string]$Root) {
    return $Path.Equals($Root,[StringComparison]::OrdinalIgnoreCase) -or $Path.StartsWith(($Root.TrimEnd('\','/') + [IO.Path]::DirectorySeparatorChar),[StringComparison]::OrdinalIgnoreCase)
}
function Assert-NoReparse([string]$Path) {
    $cursor = [IO.Path]::GetFullPath($Path)
    while ($cursor) {
        if (Test-Path -LiteralPath $cursor) {
            if (((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw "Reparse-point path is not traversed: $cursor" }
        }
        $parent = [IO.Path]::GetDirectoryName($cursor)
        if ($parent -eq $cursor) { break }
        $cursor = $parent
    }
}
function Get-Sha([byte[]]$Bytes) {
    $sha = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($sha.ComputeHash($Bytes))).Replace('-','').ToLowerInvariant() }
    finally { $sha.Dispose() }
}
function Read-Json([string]$Path) {
    Assert-NoReparse $Path
    return [IO.File]::ReadAllText($Path) | ConvertFrom-Json
}
function Get-DesignHash {
    # Deliberately identical to architecture.ps1 Get-BundleHash, including order and raw bytes.
    $buffer = New-Object IO.MemoryStream
    try {
        foreach ($relative in $bundlePaths) {
            $path = Join-Path $reviewRoot $relative
            Assert-NoReparse $path
            if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Missing design input: $relative" }
            $bytes = [IO.File]::ReadAllBytes($path)
            $prefix = [Text.Encoding]::UTF8.GetBytes("$relative`n$($bytes.Length)`n")
            $buffer.Write($prefix,0,$prefix.Length); $buffer.Write($bytes,0,$bytes.Length)
        }
        return Get-Sha $buffer.ToArray()
    } finally { $buffer.Dispose() }
}
function Get-ManifestHash($Manifest) {
    $buffer = New-Object Text.StringBuilder
    foreach ($file in $Manifest) {
        [void]$buffer.Append("$($file.path.Length):$($file.path)`n$($file.sha256)`n")
    }
    return Get-Sha ([Text.Encoding]::UTF8.GetBytes($buffer.ToString()))
}
function Get-SourceSnapshot {
    Assert-NoReparse $reviewRoot
    $designHash = Get-DesignHash
    $model = Read-Json (Join-Path $reviewRoot 'design.json')
    if ([string]::IsNullOrWhiteSpace([string]$model.projectPath)) { throw 'design.json requires projectPath' }
    if (-not [IO.Path]::IsPathRooted([string]$model.projectPath)) { throw 'projectPath must be absolute' }
    $sourceRoot = Get-NormalPath ([string]$model.projectPath)
    Assert-NoReparse $sourceRoot
    if (-not (Test-Path -LiteralPath $sourceRoot -PathType Container)) { throw "Source directory unavailable: $sourceRoot" }
    if (Test-Within $sourceRoot $reviewRoot) { throw 'Source root must be outside and distinct from the review directory' }
    $files = New-Object 'Collections.Generic.SortedDictionary[string,object]' ([StringComparer]::Ordinal)
    $excluded = New-Object 'Collections.Generic.List[object]'
    $pending = New-Object 'Collections.Generic.Stack[string]'
    $pending.Push($sourceRoot)
    while ($pending.Count -gt 0) {
        $directory = $pending.Pop()
        Assert-NoReparse $directory
        foreach ($entry in Get-ChildItem -LiteralPath $directory -Force -ErrorAction Stop) {
            $relative = $entry.FullName.Substring($sourceRoot.Length).TrimStart('\','/').Replace('\','/')
            $reason = $null
            if (Test-Within $entry.FullName $reviewRoot) { $reason = 'review-directory' }
            elseif (($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { $reason = 'reparse-point' }
            elseif ($entry.PSIsContainer -and $entry.Name -in $excludedDirectories) { $reason = 'dependency-build-cache-or-credential-directory' }
            else { foreach ($pattern in $secretPatterns) { if ($entry.Name -like $pattern) { $reason = 'secret-or-certificate-pattern'; break } } }
            if ($reason) { $excluded.Add([pscustomobject]@{path=$relative;reason=$reason}); continue }
            if ($entry.PSIsContainer) { $pending.Push($entry.FullName); continue }
            Assert-NoReparse $entry.FullName
            $before = Get-Item -LiteralPath $entry.FullName -Force
            $hash = (Get-FileHash -LiteralPath $entry.FullName -Algorithm SHA256 -ErrorAction Stop).Hash.ToLowerInvariant()
            $after = Get-Item -LiteralPath $entry.FullName -Force
            if ($before.Length -ne $after.Length -or $before.LastWriteTimeUtc -ne $after.LastWriteTimeUtc) { throw "Source changed during scan: $relative" }
            $files.Add($relative,[pscustomobject]@{path=$relative;sha256=$hash})
        }
    }
    if ((Get-DesignHash) -cne $designHash) { throw 'Design changed during source scan' }
    $manifest = @($files.Values)
    return [pscustomobject]@{sourceRoot=$sourceRoot;sourceHash=(Get-ManifestHash $manifest);designHash=$designHash;manifest=$manifest;excluded=@($excluded.ToArray() | Sort-Object path)}
}
function Assert-Record($Record) {
    if ($Record.schemaVersion -ne 1 -or $Record.sourceHash -notmatch '^[a-f0-9]{64}$' -or $Record.designHash -notmatch '^[a-f0-9]{64}$' -or $null -eq $Record.manifest -or -not $Record.sourceRoot) { throw 'Invalid source record schema' }
    $seen = New-Object 'Collections.Generic.HashSet[string]' ([StringComparer]::Ordinal)
    foreach ($file in $Record.manifest) {
        if (-not $file.path -or $file.sha256 -notmatch '^[a-f0-9]{64}$' -or -not $seen.Add([string]$file.path)) { throw 'Invalid or duplicate source manifest entry' }
    }
    if ((Get-ManifestHash @($Record.manifest)) -cne $Record.sourceHash) { throw 'Source record manifest hash mismatch' }
}
function Get-State($Snapshot) {
    $previous = $null
    $recordPath = Join-Path $reviewRoot 'source-review.json'
    if (Test-Path -LiteralPath $recordPath) {
        $previous = Read-Json $recordPath
        Assert-Record $previous
        if ([string]::IsNullOrWhiteSpace([string]$previous.actor) -or [string]::IsNullOrWhiteSpace([string]$previous.evidence)) { throw 'Source review is missing reviewer evidence' }
    }
    $old = New-Object 'Collections.Generic.Dictionary[string,string]' ([StringComparer]::Ordinal)
    if ($previous) { foreach ($file in $previous.manifest) { $old.Add([string]$file.path,[string]$file.sha256) } }
    $added = @(); $modified = @(); $deleted = @()
    foreach ($file in $Snapshot.manifest) {
        if (-not $old.ContainsKey($file.path)) { $added += $file.path }
        elseif ($old[$file.path] -cne $file.sha256) { $modified += $file.path }
        [void]$old.Remove($file.path)
    }
    $deleted = @($old.Keys | Sort-Object)
    $state = 'untracked'
    if ($previous) {
        $state = 'changed'
        if ($previous.sourceHash -ceq $Snapshot.sourceHash -and $previous.designHash -ceq $Snapshot.designHash -and $previous.sourceRoot -ceq $Snapshot.sourceRoot) { $state = 'current' }
    }
    return [pscustomobject]@{state=$state;sourceRoot=$Snapshot.sourceRoot;sourceHash=$Snapshot.sourceHash;designHash=$Snapshot.designHash;designChanged=[bool]($previous -and $previous.designHash -cne $Snapshot.designHash);added=@($added);modified=@($modified);deleted=@($deleted);fileCount=$Snapshot.manifest.Count;exclusions=[pscustomobject]@{directories=$excludedDirectories;filePatterns=$secretPatterns;reviewDirectory=$reviewRoot;reparsePoints='excluded, including linked roots and ancestors';observed=$Snapshot.excluded};limitation=$limitation;error=$null}
}
function Write-Record($Value,[string]$Relative,[switch]$Immutable) {
    $path = Join-Path $reviewRoot $Relative
    Assert-NoReparse $path
    $parent = Split-Path $path -Parent
    if (-not (Test-Path -LiteralPath $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
    $bytes = [Text.Encoding]::UTF8.GetBytes(($Value | ConvertTo-Json -Depth 40))
    if ($Immutable) {
        $stream = [IO.File]::Open($path,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
        try { $stream.Write($bytes,0,$bytes.Length) } finally { $stream.Dispose() }
    } else {
        $temporary = Join-Path $parent ('.source-drift-' + [Guid]::NewGuid().ToString('N') + '.tmp')
        [IO.File]::WriteAllBytes($temporary,$bytes)
        if (Test-Path -LiteralPath $path) { [IO.File]::Replace($temporary,$path,[NullString]::Value) }
        else { [IO.File]::Move($temporary,$path) }
    }
}

$snapshot = $null
try { $snapshot = Get-SourceSnapshot; $result = Get-State $snapshot }
catch {
    if ($Action -ne 'Check') { throw }
    $result = [pscustomobject]@{state='unavailable';sourceRoot=$null;sourceHash=$null;designHash=$null;designChanged=$null;added=@();modified=@();deleted=@();fileCount=$null;exclusions=[pscustomobject]@{directories=$excludedDirectories;filePatterns=$secretPatterns;reviewDirectory=$reviewRoot;reparsePoints='excluded';observed=@()};limitation=$limitation;error=$_.Exception.Message}
}
if ($Action -eq 'Capture') {
    $id = [Guid]::NewGuid().ToString('N')
    $candidate = [ordered]@{schemaVersion=1;id=$id;createdAt=[DateTimeOffset]::UtcNow.ToString('o');sourceRoot=$snapshot.sourceRoot;sourceHash=$snapshot.sourceHash;designHash=$snapshot.designHash;manifest=$snapshot.manifest;exclusions=$result.exclusions;limitation=$limitation}
    # Every candidate survives recapture; capture.json selects the latest candidate only.
    Write-Record $candidate "history/source-captures/$id.json" -Immutable
    Write-Record $candidate 'capture.json'
    $result | Add-Member -NotePropertyName candidateId -NotePropertyValue $id
    $result | Add-Member -NotePropertyName next -NotePropertyValue 'Independent reviewer inspects captured source/model/context evidence, updates design if needed and captures again, then records actual findings with Reconcile. Capture never reconciles or approves.'
}
if ($Action -eq 'Reconcile') {
    if ([string]::IsNullOrWhiteSpace($Actor) -or [string]::IsNullOrWhiteSpace($Text)) { throw 'Reconcile requires independent reviewer Actor and actual review evidence Text; never fabricate review or human acceptance.' }
    $candidatePath = Join-Path $reviewRoot 'capture.json'
    if (-not (Test-Path -LiteralPath $candidatePath -PathType Leaf)) { throw 'Reconcile requires an existing Capture reviewed by an independent reviewer' }
    $candidate = Read-Json $candidatePath
    Assert-Record $candidate
    if ($candidate.id -notmatch '^[a-f0-9]{32}$') { throw 'Invalid candidate identity' }
    $archivePath = Join-Path $reviewRoot "history/source-captures/$($candidate.id).json"
    Assert-NoReparse $archivePath
    if (-not (Test-Path -LiteralPath $archivePath -PathType Leaf) -or (Get-FileHash -LiteralPath $candidatePath).Hash -cne (Get-FileHash -LiteralPath $archivePath).Hash) { throw 'Candidate does not match its preserved capture; capture again and independently review' }
    if ($candidate.sourceHash -cne $snapshot.sourceHash -or $candidate.designHash -cne $snapshot.designHash -or $candidate.sourceRoot -cne $snapshot.sourceRoot) { throw 'Stale candidate: source or design changed since Capture. Capture again and independently review the new candidate.' }
    $recordPath = Join-Path $reviewRoot 'source-review.json'
    if (Test-Path -LiteralPath $recordPath) {
        $previous = Read-Json $recordPath
        Write-Record $previous ('history/source-reviews/' + [Guid]::NewGuid().ToString('N') + '.json') -Immutable
    }
    $record = [ordered]@{schemaVersion=1;id=[Guid]::NewGuid().ToString('N');candidateId=$candidate.id;createdAt=[DateTimeOffset]::UtcNow.ToString('o');actor=$Actor;evidence=$Text;sourceRoot=$snapshot.sourceRoot;sourceHash=$snapshot.sourceHash;designHash=$snapshot.designHash;manifest=$snapshot.manifest;exclusions=$result.exclusions;limitation=$limitation}
    Write-Record $record 'source-review.json'
    $result = Get-State (Get-SourceSnapshot)
}
if ($AsObject) { $result } else { $result | ConvertTo-Json -Depth 40 }
