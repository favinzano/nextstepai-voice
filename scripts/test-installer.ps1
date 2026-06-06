$ErrorActionPreference = "Stop"

$workspace = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$target = Join-Path $workspace ".tmp\installer-certification"
$installer = Join-Path $workspace "release\NextStepAI-Voice-Setup-1.0.0-x64.exe"

if (-not $target.StartsWith($workspace)) {
  throw "Installer test target is outside the workspace."
}

if (Test-Path -LiteralPath $target) {
  Remove-Item -LiteralPath $target -Recurse -Force
}

$install = Start-Process -FilePath $installer -ArgumentList @("/S", ("/D=" + $target)) -Wait -PassThru
if ($install.ExitCode -ne 0) {
  throw "Installer failed with exit code $($install.ExitCode)."
}

$executable = Join-Path $target "NextStepAI Voice.exe"
if (-not (Test-Path -LiteralPath $executable)) {
  throw "Installed executable is missing."
}

$app = Start-Process -FilePath $executable -PassThru
Start-Sleep -Seconds 8
$running = Get-Process | Where-Object { $_.Path -eq $executable }
if (-not $running) {
  throw "Installed application did not start."
}
$running | Stop-Process -Force

$dataDir = Join-Path $env:APPDATA "NextStepAI Voice"
New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
$marker = Join-Path $dataDir "release-preservation-test.marker"
Set-Content -LiteralPath $marker -Value "preserve"

$uninstaller = Join-Path $target "Uninstall NextStepAI Voice.exe"
$uninstall = Start-Process -FilePath $uninstaller -ArgumentList "/S" -Wait -PassThru
Start-Sleep -Seconds 3

if ($uninstall.ExitCode -ne 0) {
  throw "Uninstaller failed with exit code $($uninstall.ExitCode)."
}
if (Test-Path -LiteralPath $target) {
  throw "Installation directory remains after uninstall."
}
if (-not (Test-Path -LiteralPath $marker)) {
  throw "User data was removed during uninstall."
}

Remove-Item -LiteralPath $marker -Force
Write-Output "Installer certification passed."
