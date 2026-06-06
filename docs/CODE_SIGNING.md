# Firma Authenticode Para Windows

NextStepAI Voice usará **Azure Artifact Signing Public Trust** (antes Trusted Signing). Microsoft lo recomienda para aplicaciones distribuidas fuera de Microsoft Store y Electron Builder lo integra de forma nativa.

## Paso externo obligatorio

La firma pública no puede generarse dentro del repositorio. El propietario debe:

1. Crear y validar una cuenta de Azure Artifact Signing con modelo `Public Trust`.
2. Crear un perfil de certificado y una App Registration.
3. Asignar a esa App Registration el rol `Trusted Signing Certificate Profile Signer`.
4. Configurar en GitHub:

Secrets:

- `AZURE_TENANT_ID`
- `AZURE_CLIENT_ID`
- `AZURE_CLIENT_SECRET`

Variables:

- `AZURE_SIGNING_PUBLISHER_NAME`
- `AZURE_SIGNING_ENDPOINT`
- `AZURE_SIGNING_ACCOUNT_NAME`
- `AZURE_SIGNING_PROFILE_NAME`

Artifact Signing Public Trust está disponible para organizaciones de Estados Unidos, Canadá, Unión Europea y Reino Unido, y para desarrolladores individuales de Estados Unidos y Canadá.

## Construcción firmada

Localmente, con las mismas variables definidas:

```powershell
npm run release:signed
```

En GitHub Actions, ejecutar manualmente el workflow `Signed Windows Release`.

El proceso firma el ejecutable y el instalador y después falla automáticamente si cualquiera no presenta `Status: Valid`.

## Verificación independiente

```powershell
npm run release:verify-signature
```

No publicar un release estable mientras esta comprobación falle.
