# Verify the local launcher with a failing command and a retry from the drive root.
$ErrorActionPreference = 'Stop'
$launcher = Join-Path $PSScriptRoot 'local-workspace.ps1'
$runtime = & $launcher -Kind output -Name tool-runtime
$project = Split-Path (Split-Path $runtime)
$scratch = Join-Path $runtime 'tmp'
$cache = Join-Path $runtime 'npm-cache'
$before = @{}
foreach ($key in @('TEMP','TMP','TMPDIR','npm_config_cache')) {
    $before[$key] = [Environment]::GetEnvironmentVariable($key,'Process')
}
$driveRoot = [IO.Path]::GetPathRoot($project)
Push-Location -LiteralPath $driveRoot
try {
    & $launcher -Run node -RunArguments @('-e','process.exit(23)')
    if ($LASTEXITCODE -ne 23) { throw 'Child exit status was lost' }
    $probe = 'console.log(JSON.stringify([process.cwd(),require("node:os").tmpdir(),process.env.TEMP,process.env.TMP,process.env.TMPDIR,process.env.npm_config_cache]))'
    $observed = & $launcher -Run node -RunArguments @('-e',$probe)
    if ($LASTEXITCODE -ne 0) { throw 'Child retry failed' }
    $expected = @($project,$scratch,$scratch,$scratch,$scratch,$cache)
    if (Compare-Object @($observed | ConvertFrom-Json) $expected -SyncWindow 0) {
        throw "Unexpected child paths: $observed"
    }
    foreach ($key in $before.Keys) {
        if ([Environment]::GetEnvironmentVariable($key,'Process') -cne $before[$key]) {
            throw "Caller environment changed: $key"
        }
    }
    if ((Get-Location).Path -ne $driveRoot) { throw 'Caller working directory changed' }
} finally {
    Pop-Location
}
Write-Output 'Child paths, exit code, retry and caller environment verified.'
