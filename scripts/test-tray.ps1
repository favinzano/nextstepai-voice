$ErrorActionPreference = "Stop"

$application = (Resolve-Path "release\win-unpacked\NextStepAI Voice.exe").Path
$profile = Join-Path $env:TEMP ("nextstepai-tray-test-" + [Guid]::NewGuid())
New-Item -ItemType Directory -Path $profile | Out-Null
'{"closeBehavior":"tray"}' | Set-Content -Path (Join-Path $profile "app-preferences.json") -Encoding utf8

$process = Start-Process -FilePath $application -ArgumentList "--user-data-dir=$profile" -PassThru
try {
  Start-Sleep -Seconds 5
  $process.Refresh()
  if ($process.HasExited -or $process.MainWindowHandle -eq 0) {
    throw "La aplicacion empaquetada no abrio una ventana."
  }

  Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class WindowClose {
  [DllImport("user32.dll")]
  public static extern bool PostMessage(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);
}
"@
  [WindowClose]::PostMessage($process.MainWindowHandle, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null
  Start-Sleep -Seconds 3
  $process.Refresh()
  if ($process.HasExited) {
    throw "Cerrar la ventana termino el proceso en lugar de ocultarlo en la bandeja."
  }
  Write-Host "Tray close behavior passed."
}
finally {
  if (-not $process.HasExited) {
    Stop-Process -Id $process.Id -Force
  }
  Remove-Item -LiteralPath $profile -Recurse -Force -ErrorAction SilentlyContinue
}
