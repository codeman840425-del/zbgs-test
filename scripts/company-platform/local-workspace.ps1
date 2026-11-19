# 本机制作路径。独立交付包仍由接收者选择输出位置。
[CmdletBinding(DefaultParameterSetName = 'Path')]
param(
    [Parameter(Mandatory, ParameterSetName = 'Check')]
    [switch]$Check,
    [Parameter(Mandatory, ParameterSetName = 'Run')]
    [ValidateNotNullOrEmpty()]
    [string]$Run,
    [Parameter(ParameterSetName = 'Run')]
    [string[]]$RunArguments = @(),
    [Parameter(Mandatory, ParameterSetName = 'Path')]
    [ValidateSet('worktrees', 'deliveries', 'production-trials', 'preview', 'inputs-and-receipts', 'output')]
    [string]$Kind,
    [Parameter(Mandatory, ParameterSetName = 'Path')]
    [string]$Name
)

$ErrorActionPreference = 'Stop'
$project = (Resolve-Path -LiteralPath 'F:/gamemake-company-platform-c1').ProviderPath
function Assert-LocalWorkspace {
    $driveRoot = [IO.Path]::GetPathRoot($project)
    $strays = @(Get-ChildItem -LiteralPath $driveRoot -Force | Where-Object {
        $_.FullName -ne $project -and
        ($_.Name -like 'gamemake-company-*' -or $_.Name -eq 'tmp-contact-test.mjs')
    })
    if ($strays.Count) {
        throw ("公司项目文件散落在盘符根目录：" + ($strays.FullName -join ', '))
    }
    # A manual move can hide a folder from the drive listing while Git still uses its old path.
    $worktreeList = @(git -C $project worktree list --porcelain)
    if ($LASTEXITCODE -ne 0) { throw '无法读取 Git 工作树登记。' }
    $managedTrees = [IO.Path]::Combine($project, 'company-workspace', 'worktrees') + [IO.Path]::DirectorySeparatorChar
    foreach ($line in $worktreeList) {
        if (-not $line.StartsWith('worktree ')) { continue }
        $registered = [IO.Path]::GetFullPath($line.Substring(9))
        if ($registered -ne $project -and
            [IO.Path]::GetDirectoryName($registered) -eq $driveRoot -and
            [IO.Path]::GetFileName($registered) -like 'gamemake-company-*') {
            throw "Git 仍登记了盘符根目录下的公司工作树：$registered"
        }
        if ($Check -and $registered.StartsWith($managedTrees, [StringComparison]::OrdinalIgnoreCase)) {
            # Check both Git pointers. Merely finding the directory also succeeds after a partial move.
            $pointer = Join-Path $registered '.git'
            if (-not [IO.File]::Exists($pointer)) { throw "已登记的工作树缺少 Git 指针：$pointer" }
            $record = [IO.File]::ReadAllText($pointer).Trim()
            if (-not $record.StartsWith('gitdir: ')) { throw "工作树的 Git 指针不可读：$pointer" }
            $metadata = [IO.Path]::GetFullPath([IO.Path]::Combine($registered, $record.Substring(8)))
            $backlink = Join-Path $metadata 'gitdir'
            if (-not [IO.File]::Exists($backlink)) { throw "Git 登记缺少工作树回指：$backlink" }
            $back = [IO.Path]::GetFullPath([IO.Path]::Combine($metadata, [IO.File]::ReadAllText($backlink).Trim()))
            if ($back -ne $pointer) { throw "Git 登记与实际工作树不一致：$pointer -> $back" }
        }
    }
}

# Apply the same guard when allocating a path, before the caller creates any files.
Assert-LocalWorkspace
function Get-ProjectDirectory([string[]]$Sections) {
    $parent = $project
    foreach ($section in $Sections) {
        $parent = Join-Path $parent $section
        $dir = [IO.Directory]::CreateDirectory($parent)
        if ($dir.Attributes -band [IO.FileAttributes]::ReparsePoint) {
            throw "请使用项目内的实际目录：$parent"
        }
    }
    return $parent
}

if ($PSCmdlet.ParameterSetName -eq 'Run') {
    $program = (Get-Command -Name $Run -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
    $tempDirectory = Get-ProjectDirectory @('output','tool-runtime','tmp')
    $npmCache = Get-ProjectDirectory @('output','tool-runtime','npm-cache')
    $settings = @{TEMP=$tempDirectory; TMP=$tempDirectory; TMPDIR=$tempDirectory; npm_config_cache=$npmCache}
    $previous = @{}
    Push-Location -LiteralPath $project
    try {
        foreach ($key in $settings.Keys) {
            $previous[$key] = [Environment]::GetEnvironmentVariable($key, 'Process')
            [Environment]::SetEnvironmentVariable($key, $settings[$key], 'Process')
        }
        & $program @RunArguments
        $result = $LASTEXITCODE
    } finally {
        foreach ($key in $previous.Keys) {
            if ($null -eq $previous[$key]) {
                Remove-Item -LiteralPath ('Env:' + $key) -ErrorAction SilentlyContinue
            } else {
                [Environment]::SetEnvironmentVariable($key, $previous[$key], 'Process')
            }
        }
        Pop-Location
    }
    exit $result
}
if ($Check) {
    $workspace = Join-Path $project 'company-workspace'
    $indexText = Get-Content -LiteralPath (Join-Path $workspace 'README.md') -Raw -Encoding UTF8
    $missing = foreach ($link in [regex]::Matches($indexText, '\]\(([^)]+)\)')) {
        $target = $link.Groups[1].Value.Trim('<', '>')
        if ($target -match '^(https?://|#)') { continue }
        $relative = $target.Split('#')[0]
        if (-not (Test-Path -LiteralPath (Join-Path $workspace $relative))) { $relative }
    }
    if ($missing) { throw ("本机工作区索引缺少目标：" + ($missing -join ', ')) }
    Write-Output "公司根目录、Git 工作树和本机索引链接检查通过：$project"
    return
}

if ($Name -notmatch '^[\p{L}\p{N}_-][\p{L}\p{N}._-]*$' -or $Name.EndsWith('.') -or
    $Name -match '^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)') {
    throw '名称须为单个文件名或目录名，如 studio-v1。'
}
$sections = if ($Kind -eq 'output') { @('output') } else { @('company-workspace', $Kind) }
$parent = Get-ProjectDirectory $sections
$target = Join-Path $parent $Name
$existing = Get-Item -LiteralPath $target -Force -ErrorAction SilentlyContinue
if ($existing -and ($existing.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
    throw "目标为路径链接：$target"
}
Write-Output $target
