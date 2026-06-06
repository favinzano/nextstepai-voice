# Estrategia De Actualización Y Rollback

## Primer Release

La versión `1.0.0` utiliza actualizaciones manuales mediante instaladores versionados.

## Actualización

1. Publicar un instalador nuevo con versión semántica superior.
2. Ejecutar la suite de producción y checklist manual.
3. Instalar sobre la versión anterior sin borrar datos locales.
4. Confirmar historial, diccionario, preferencias y caché de modelos.
5. Publicar checksum SHA-256 junto al instalador.

## Rollback

1. Conservar los dos instaladores estables anteriores.
2. Desinstalar la versión problemática sin eliminar datos locales.
3. Instalar la versión estable anterior.
4. Verificar que preferencias e historial sigan disponibles.

## Reglas

- No cambiar formatos de almacenamiento local sin migración.
- No borrar datos locales durante actualización o desinstalación por defecto.
- Cambios incompatibles requieren respaldo y migración probada.
- Una versión no se publica si falla instalación sobre la versión anterior.
