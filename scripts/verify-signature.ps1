$ErrorActionPreference = "Stop"

$installer = Get-ChildItem "release\NextStepAI-Voice-Setup-*.exe" |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1
$application = Get-Item "release\win-unpacked\NextStepAI Voice.exe"

if (-not $installer) {
  throw "No se encontro un instalador para verificar."
}

foreach ($artifact in @($installer, $application)) {
  $signature = Get-AuthenticodeSignature -FilePath $artifact.FullName
  if ($signature.Status -ne "Valid") {
    throw "Firma Authenticode invalida para $($artifact.Name): $($signature.Status)"
  }
  Write-Host "Firma valida: $($artifact.Name) - $($signature.SignerCertificate.Subject)"
}
