# NextStepAI Voice

Aplicacion de escritorio para convertir voz en texto con Whisper ejecutado localmente.

## Inicio facil en Windows

Haz doble clic en `Iniciar NextStepAI Voice.bat`. El archivo prepara y abre la aplicación automáticamente.

## Funciones

- Grabacion desde el microfono.
- Dos modos locales multilenguaje: Whisper Base para velocidad y Whisper Small para mayor precisión.
- Atajo global `Ctrl+Shift+Space` para iniciar y detener.
- Segundo atajo `Ctrl+Alt+Space` para reprocesar la ultima grabacion.
- Pegado automatico o copia al portapapeles.
- Limpieza opcional del texto y diccionario personal.
- Historial local configurable.
- Guia rapida, diagnostico y preferencias avanzadas.
- Burbuja flotante que no roba el foco al usar el atajo global.

## Ejecutar

```powershell
npm install
npm run build
npm start
```

La primera transcripcion de cada modo descarga su modelo Whisper. Despues queda almacenado en la cache local y la inferencia se realiza en el equipo. Al cambiar de modo, la aplicacion libera el modelo anterior de la memoria.

## Estado de produccion

La aplicacion se encuentra en beta funcional para Windows. Consulta `PRODUCTION_READINESS.md` para ver las validaciones completadas y los requisitos pendientes antes de un lanzamiento estable.
