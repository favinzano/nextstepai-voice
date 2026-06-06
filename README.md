# NextStepAI Voice

Aplicacion de escritorio para convertir voz en texto con Whisper ejecutado localmente.

## Instalación En Windows

Para usuarios finales, utiliza el instalador versionado `NextStepAI-Voice-Setup-1.0.0-x64.exe`.

El archivo `Iniciar NextStepAI Voice.bat` se mantiene únicamente para desarrollo local.

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

Si una descarga queda incompleta o dañada, abre `Soporte` y selecciona `Reparar modelos`.

## Estado de produccion

La versión `1.0.0` se prepara como primer release para Windows x64. Consulta `PRODUCTION_READINESS.md` y `docs/RELEASE_CHECKLIST.md` antes de publicar un instalador.

## Soporte

Reporta incidencias en `https://github.com/favinzano/nextstepai-voice/issues`. Los diagnósticos copiados desde la aplicación no incluyen transcripciones.
