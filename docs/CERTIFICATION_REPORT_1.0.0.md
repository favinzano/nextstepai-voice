# Reporte De Certificación 1.0.0

Fecha: 6 de junio de 2026  
Entorno validado: Windows 10 x64 `10.0.19045`

## Resultado

NextStepAI Voice `1.0.0` cumple la validación técnica automatizable disponible en el entorno actual. El release permanece como candidato, no como distribución pública estable, hasta resolver firma de código y pruebas humanas/multiequipo.

## Pruebas Aprobadas

- 33 casos del pipeline de texto.
- 7 casos de perfiles Whisper.
- 5 casos de almacenamiento y reparación de modelos.
- 3 casos reales de audio no verbal.
- Whisper Base y Whisper Small ejecutados desde el paquete Windows.
- Caché de modelos confirmada fuera del paquete, dentro de datos del usuario.
- Instalación NSIS silenciosa.
- Arranque desde instalación real.
- Desinstalación silenciosa.
- Eliminación de archivos de aplicación.
- Preservación de datos de usuario tras desinstalar.
- Auditoría npm completa: 0 vulnerabilidades.
- Checksum SHA-256 generado.

## Artefacto Validado

- `NextStepAI-Voice-Setup-1.0.0-x64.exe`
- Tamaño aproximado: 128 MB, sin incluir modelos descargables.
- SHA-256: `59cbed3becc5eba3f1142532c931984b685fa35ec25e7adf60b639e3e07439b9`

## Pendientes Externos

1. Firma Authenticode. Estado actual: `NotSigned`.
2. Matriz de aceptación con voces humanas, acentos, micrófonos y ruido.
3. Prueba independiente en Windows 11 y hardware adicional.
4. Prueba real de actualización/rollback cuando exista un segundo instalador versionado.
