# 本机制作路径。独立交付包仍由接收者选择输出位置。
[CmdletBinding(DefaultParameterSetName = 'Path')]
param(
    [Parameter(Mandatory, ParameterSetName = 'Check')]
    [switch]$Check,
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
    foreach ($line in $worktreeList) {
        if (-not $line.StartsWith('worktree ')) { continue }
        $registered = [IO.Path]::GetFullPath($line.Substring(9))
        if ($registered -ne $project -and
            [IO.Path]::GetDirectoryName($registered) -eq $driveRoot -and
            [IO.Path]::GetFileName($registered) -like 'gamemake-company-*') {
            throw "Git 仍登记了盘符根目录下的公司工作树：$registered"
        }
    }
}

# Apply the same guard when allocating a path, before the caller creates any files.
Assert-LocalWorkspace
if ($Check) {
    Write-Output "公司根目录和 Git 工作树路径检查通过：$project"
    return
}

if ($Name -notmatch '^[\p{L}\p{N}_-][\p{L}\p{N}._-]*$' -or $Name.EndsWith('.') -or
    $Name -match '^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)') {
    throw '名称须为单个文件名或目录名，如 studio-v1。'
}
$parent = $project
$sections = if ($Kind -eq 'output') { @('output') } else { @('company-workspace', $Kind) }
foreach ($section in $sections) {
    $parent = Join-Path $parent $section
    $dir = [IO.Directory]::CreateDirectory($parent)
    if ($dir.Attributes -band [IO.FileAttributes]::ReparsePoint) {
        throw "请使用项目内的实际目录：$parent"
    }
}
$target = Join-Path $parent $Name
$existing = Get-Item -LiteralPath $target -Force -ErrorAction SilentlyContinue
if ($existing -and ($existing.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
    throw "目标为路径链接：$target"
}
Write-Output $target
