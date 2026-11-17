$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$toolRoot = Join-Path $projectRoot 'experiments/tools/vroid-2.14.0'
$installer = Join-Path $toolRoot 'VRoidStudio-v2.14.0-win.exe'
$appRoot = Join-Path $toolRoot 'app'
$dependencyRoot = Join-Path $projectRoot 'experiments/tools/vroid-mcp-1.1.0'
if (Test-Path -LiteralPath $appRoot) { throw 'Existing app directory: do not overwrite an installed candidate.' }
if ((Get-Item -LiteralPath $installer).Length -ne 483590400) { throw 'Incomplete installer download.' }
if ((Get-FileHash -LiteralPath $installer -Algorithm MD5).Hash -ne 'A98D3EE2F40207165E77C9ED5D51F594') { throw 'Official content MD5 mismatch.' }
$signature = Get-AuthenticodeSignature -LiteralPath $installer
if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'pixiv') { throw 'Installer publisher verification failed.' }
$installerArgs = @('/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART','/SP-','/CURRENTUSER','/NOICONS','/NOCLOSEAPPLICATIONS','/NORESTARTAPPLICATIONS',('/DIR="' + $appRoot + '"'),('/LOG="' + (Join-Path $toolRoot 'install.log') + '"'))
$process = Start-Process -FilePath $installer -ArgumentList $installerArgs -WindowStyle Hidden -PassThru -Wait
if ($process.ExitCode -ne 0) { throw "Installer failed: $($process.ExitCode)" }
$app = Join-Path $appRoot 'VRoidStudio.exe'
if (!(Test-Path -LiteralPath $app)) { throw 'Installed executable missing.' }
if ((Get-FileHash -LiteralPath (Join-Path $dependencyRoot 'bepinex-be788.zip') -Algorithm SHA256).Hash -ne 'F4CC496BD098A0DF4164B81E3737297707F13A47C2478DBA2F60EEFAB784817A') { throw 'BepInEx downloaded archive identity mismatch.' }
Expand-Archive -LiteralPath (Join-Path $dependencyRoot 'bepinex-be788.zip') -DestinationPath $appRoot
[ordered]@{
  installerExitCode = $process.ExitCode
  installerSHA256 = (Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash.ToLowerInvariant()
  signatureStatus = [string]$signature.Status
  signer = $signature.SignerCertificate.Subject
  appRoot = $appRoot
  executableVersion = (Get-Item -LiteralPath $app).VersionInfo.FileVersion
  next = 'Launch this isolated 2.14.0 once to finish BepInEx initialization, close only that new instance, then copy plugin/data and launch again.'
} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $toolRoot 'install-receipt.json') -Encoding utf8
Get-Content -LiteralPath (Join-Path $toolRoot 'install-receipt.json')
