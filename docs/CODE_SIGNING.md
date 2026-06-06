# Firma De Código Para Windows

El release `1.0.0` no puede declararse firmado hasta disponer de un certificado Authenticode válido.

## Requisito

Adquirir un certificado de firma de código OV o EV emitido por una autoridad reconocida. EV ofrece mejor reputación inicial ante SmartScreen.

## Configuración Esperada

Electron Builder puede utilizar variables seguras durante CI:

- `CSC_LINK`: certificado codificado o ubicación segura.
- `CSC_KEY_PASSWORD`: contraseña del certificado.

Estas credenciales nunca deben almacenarse en Git.

## Verificación

Después de construir:

```powershell
Get-AuthenticodeSignature "release\NextStepAI-Voice-Setup-1.0.0-x64.exe"
Get-AuthenticodeSignature "release\win-unpacked\NextStepAI Voice.exe"
```

Ambos resultados deben mostrar `Status: Valid`.

## Regla De Publicación

No etiquetar el release como estable para distribución pública mientras el instalador y ejecutable aparezcan como `NotSigned`.
