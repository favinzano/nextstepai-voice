# Reporte De Certificación 1.0.0

Fecha: 6 de junio de 2026  
Entorno validado: Windows 10 x64 `10.0.19045`

## Resultado

NextStepAI Voice `1.0.0` cumple la validación técnica automatizable disponible en el entorno actual. El release permanece como candidato, no como distribución pública estable, hasta resolver firma de código y pruebas humanas/multiequipo.

## Pruebas Aprobadas

- 33 casos del pipeline de texto.
- 7 casos de perfiles Whisper.
- 5 casos de almacenamiento y reparación de modelos.
- 5 casos de preferencias de aplicación.
- 7 casos de migración y aislamiento de datos.
- 3 casos reales de audio no verbal.
- Whisper Base y Whisper Small ejecutados desde el paquete Windows.
- Caché de modelos confirmada fuera del paquete, dentro de datos del usuario.
- Instalación NSIS silenciosa.
- Arranque desde instalación real.
- Desinstalación silenciosa.
- Eliminación de archivos de aplicación.
- Preservación de datos de usuario tras desinstalar.
- Perfil de desarrollo separado del perfil instalado.
- Historial prerelease eliminado una sola vez sin eliminar ajustes ni diccionario.
- Cierre a bandeja validado desde el ejecutable empaquetado.
- Auditoría npm completa: 0 vulnerabilidades.
- Checksum SHA-256 generado.

## Artefacto Validado

- `NextStepAI-Voice-Setup-1.0.0-x64.exe`
- Tamaño aproximado: 128 MB, sin incluir modelos descargables.
- SHA-256: `cef74b484dfdf8ec464fad51f6d231d499a345ae7cce4bf6c8a89dc2fb0c72ed`

## Pendientes Externos

1. Completar la validación de identidad de Azure Artifact Signing y configurar credenciales. Estado verificable actual: `NotSigned`.
2. Matriz de aceptación con voces humanas, acentos, micrófonos y ruido.
3. Prueba independiente en Windows 11 y hardware adicional.
4. Prueba real de actualización/rollback cuando exista un segundo instalador versionado.
