$ErrorActionPreference = "Stop"

$required = @(
  "AZURE_TENANT_ID",
  "AZURE_CLIENT_ID",
  "AZURE_CLIENT_SECRET",
  "AZURE_SIGNING_PUBLISHER_NAME",
  "AZURE_SIGNING_ENDPOINT",
  "AZURE_SIGNING_ACCOUNT_NAME",
  "AZURE_SIGNING_PROFILE_NAME"
)

$missing = $required | Where-Object { -not [Environment]::GetEnvironmentVariable($_) }
if ($missing.Count -gt 0) {
  throw "Faltan variables de Azure Artifact Signing: $($missing -join ', ')"
}

npm.cmd run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm.cmd run build:icons
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

npx.cmd electron-builder --win nsis `
  "--config.win.azureSignOptions.publisherName=$env:AZURE_SIGNING_PUBLISHER_NAME" `
  "--config.win.azureSignOptions.endpoint=$env:AZURE_SIGNING_ENDPOINT" `
  "--config.win.azureSignOptions.codeSigningAccountName=$env:AZURE_SIGNING_ACCOUNT_NAME" `
  "--config.win.azureSignOptions.certificateProfileName=$env:AZURE_SIGNING_PROFILE_NAME"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

& "$PSScriptRoot\verify-signature.ps1"
