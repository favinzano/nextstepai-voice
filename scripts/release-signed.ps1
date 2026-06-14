[CmdletBinding()]
param(
  [string]$CertificatePath = $env:SIGNING_PFX_PATH,
  [string]$CertificatePassword = $env:SIGNING_PFX_PASSWORD,
  [string]$TimestampUrl = $(if ($env:SIGNING_TIMESTAMP_URL) { $env:SIGNING_TIMESTAMP_URL } else { "http://timestamp.digicert.com" })
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$projectRoot = Split-Path -Parent $PSScriptRoot
$releaseDir = Join-Path $projectRoot "release"
$temporaryCertificatePath = $null

function Invoke-NativeCommand {
  param(
    [Parameter(Mandatory)]
    [string]$FilePath,

    [Parameter(Mandatory)]
    [string[]]$ArgumentList
  )

  Write-Host "> $FilePath $($ArgumentList -join ' ')"
  & $FilePath @ArgumentList
  if ($LASTEXITCODE -ne 0) {
    throw "El comando fallo con codigo de salida $LASTEXITCODE`: $FilePath"
  }
}

function Find-SignTool {
  if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT -or -not [Environment]::Is64BitOperatingSystem) {
    throw "La firma requiere Windows x64."
  }

  $sdkRoots = @()

  foreach ($registryPath in @(
    "HKLM:\SOFTWARE\Microsoft\Windows Kits\Installed Roots",
    "HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows Kits\Installed Roots"
  )) {
    if (Test-Path $registryPath) {
      $installedRoots = Get-ItemProperty -Path $registryPath -ErrorAction SilentlyContinue
      if ($installedRoots) {
        $kitsRootProperty = $installedRoots.PSObject.Properties["KitsRoot10"]
        if ($kitsRootProperty -and $kitsRootProperty.Value) { $sdkRoots += $kitsRootProperty.Value }
      }
    }
  }

  foreach ($programFilesRoot in @(${env:ProgramFiles(x86)}, $env:ProgramFiles)) {
    if ($programFilesRoot) {
      $sdkRoots += Join-Path $programFilesRoot "Windows Kits\10"
    }
  }

  $candidates = foreach ($sdkRoot in ($sdkRoots | Select-Object -Unique)) {
    $binRoot = Join-Path $sdkRoot "bin"
    if (-not (Test-Path $binRoot)) { continue }

    # Prefer the newest installed Windows 10/11 SDK x64 tool.
    Get-ChildItem -Path $binRoot -Directory -ErrorAction SilentlyContinue |
      Where-Object { $_.Name -match '^\d+\.\d+\.\d+\.\d+$' } |
      ForEach-Object {
        $path = Join-Path $_.FullName "x64\signtool.exe"
        if (Test-Path $path) {
          [PSCustomObject]@{
            Path = $path
            Version = [version]$_.Name
          }
        }
      }

    $unversionedPath = Join-Path $binRoot "x64\signtool.exe"
    if (Test-Path $unversionedPath) {
      [PSCustomObject]@{
        Path = $unversionedPath
        Version = [version]"0.0.0.0"
      }
    }
  }

  $signTool = $candidates | Sort-Object Version -Descending | Select-Object -First 1
  if (-not $signTool) {
    throw "No se encontro signtool.exe x64. Instala Windows 10/11 SDK con Desktop C++ Signing Tools."
  }

  return $signTool.Path
}

function Resolve-Certificate {
  if ($CertificatePath) {
    $resolved = Get-Item -LiteralPath $CertificatePath -ErrorAction Stop
    if ($resolved.PSIsContainer) {
      throw "La ruta del certificado apunta a un directorio: $CertificatePath"
    }
    return $resolved.FullName
  }

  if (-not $env:SIGNING_PFX_BASE64) {
    throw "Define SIGNING_PFX_PATH o SIGNING_PFX_BASE64 para proporcionar el certificado de firma."
  }

  $script:temporaryCertificatePath = Join-Path ([System.IO.Path]::GetTempPath()) "nextstepai-signing-$PID.pfx"
  try {
    $certificateBytes = [Convert]::FromBase64String($env:SIGNING_PFX_BASE64)
  } catch {
    throw "SIGNING_PFX_BASE64 no contiene un certificado PFX codificado en Base64 valido."
  }
  [System.IO.File]::WriteAllBytes($script:temporaryCertificatePath, $certificateBytes)
  return $script:temporaryCertificatePath
}

function Verify-Artifact {
  param(
    [Parameter(Mandatory)]
    [string]$SignTool,

    [Parameter(Mandatory)]
    [string]$ArtifactPath
  )

  Invoke-NativeCommand -FilePath $SignTool -ArgumentList @("verify", "/pa", "/all", "/v", $ArtifactPath)
}

function Test-CodeSigningCertificate {
  param(
    [Parameter(Mandatory)]
    [string]$Path,

    [string]$Password
  )

  $flags = [System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]::EphemeralKeySet
  $certificate = [System.Security.Cryptography.X509Certificates.X509Certificate2]::new($Path, $Password, $flags)
  try {
    if (-not $certificate.HasPrivateKey) {
      throw "El certificado PFX no contiene una clave privada."
    }
    if ($certificate.NotAfter.ToUniversalTime() -le [DateTime]::UtcNow.AddDays(30)) {
      throw "El certificado expira en menos de 30 dias: $($certificate.NotAfter.ToString('u'))"
    }
    $codeSigningOid = "1.3.6.1.5.5.7.3.3"
    $eku = $certificate.Extensions |
      Where-Object { $_ -is [System.Security.Cryptography.X509Certificates.X509EnhancedKeyUsageExtension] } |
      ForEach-Object { $_.EnhancedKeyUsages } |
      ForEach-Object { $_.Value }
    if ($codeSigningOid -notin $eku) {
      throw "El certificado no declara el uso extendido Code Signing."
    }
    Write-Host "Certificado valido para firma: $($certificate.Subject)"
  } finally {
    $certificate.Dispose()
  }
}

try {
  $timestampUri = $null
  if (-not [Uri]::TryCreate($TimestampUrl, [UriKind]::Absolute, [ref]$timestampUri) -or $timestampUri.Scheme -notin @("http", "https")) {
    throw "SIGNING_TIMESTAMP_URL debe ser una URL HTTP o HTTPS absoluta."
  }

  $signTool = Find-SignTool
  $pfxPath = Resolve-Certificate
  Test-CodeSigningCertificate -Path $pfxPath -Password $CertificatePassword
  Write-Host "SignTool: $signTool"

  Push-Location $projectRoot
  try {
    Invoke-NativeCommand -FilePath "npm.cmd" -ArgumentList @("run", "release:verify-acceptance")
    Invoke-NativeCommand -FilePath "npm.cmd" -ArgumentList @("run", "build")
    Invoke-NativeCommand -FilePath "npm.cmd" -ArgumentList @("run", "build:native")
    Invoke-NativeCommand -FilePath "npm.cmd" -ArgumentList @("run", "build:icons")
    Invoke-NativeCommand -FilePath "npm.cmd" -ArgumentList @("run", "pre-release")

    # Electron Builder invokes SignTool before update metadata is created.
    # These options produce /fd sha256 plus RFC 3161 /tr and /td sha256.
    $env:WIN_CSC_LINK = $pfxPath
    $env:WIN_CSC_KEY_PASSWORD = $CertificatePassword
    Invoke-NativeCommand -FilePath "npx.cmd" -ArgumentList @(
      "electron-builder",
      "--win", "nsis",
      "--x64",
      "--config.win.signtoolOptions.signingHashAlgorithms=sha256",
      "--config.win.signtoolOptions.rfc3161TimeStampServer=$TimestampUrl"
    )

    $application = Join-Path $releaseDir "win-unpacked\NextStepAI Voice.exe"
    $pasteHelper = Join-Path $releaseDir "win-unpacked\resources\native\win32-x64\NextStepAI.PasteHelper.exe"
    if (-not (Test-Path -LiteralPath $application)) {
      throw "No se encontro la aplicacion desempaquetada: $application"
    }
    $installer = Get-ChildItem -Path $releaseDir -Filter "NextStepAI-Voice-Setup-*-x64.exe" -File |
      Sort-Object LastWriteTimeUtc -Descending |
      Select-Object -First 1
    if (-not $installer) {
      throw "electron-builder no genero el instalador NSIS esperado."
    }
    Verify-Artifact -SignTool $signTool -ArtifactPath $application
    Verify-Artifact -SignTool $signTool -ArtifactPath $pasteHelper
    Verify-Artifact -SignTool $signTool -ArtifactPath $installer.FullName
    Invoke-NativeCommand -FilePath "npm.cmd" -ArgumentList @("run", "release:verify")
    Write-Host "Release firmado y verificado: $($installer.FullName)"
  } finally {
    Pop-Location
  }
} finally {
  if ($temporaryCertificatePath -and (Test-Path -LiteralPath $temporaryCertificatePath)) {
    Remove-Item -LiteralPath $temporaryCertificatePath -Force
  }
}
