## - 2026-06-14

- **Added:** New native Windows Taskbar status overlays and binary badge tracking for downloading, recording, and inference states. Dual-mode hotkey settings layout supporting toggle and low-level "Push-to-Talk" hardware events.
- **Optimized (DevOps Overhaul):** Matrix compilation build pipeline splits inside GitHub Actions for `Legacy` vs `AVX2` binaries. Integrated pre-release native DLL extraction compression routines using UPX binary stripping tools.
# Changelog

Todos los cambios relevantes de NextStepAI Voice se documentan en este archivo.

## [1.0.0] - 2026-06-14

Primer lanzamiento candidato para Windows x64.

### AÃ±adido

- Dictado local mediante Whisper Base y Whisper Large v3 Turbo.
- Captura PCM sin compresiÃ³n mediante AudioWorklet, sin la pÃ©rdida introducida
  por MediaRecorder/Opus.
- Perfil MÃ¡xima PrecisiÃ³n con Large v3 Turbo Q8 y beam search.
- Atajo global `Ctrl+Shift+Space` para iniciar o detener una grabaciÃ³n.
- Atajo `Ctrl+Alt+Space` para reprocesar la Ãºltima grabaciÃ³n.
- Pegado automÃ¡tico, overlay flotante, historial local, formato hablado y
  diccionario personal.
- IntegraciÃ³n con la bandeja del sistema y cierre en segundo plano.
- Auto-Start nativo de Windows, con arranque silencioso mediante `--hidden`.
- Ajuste **Iniciar con Windows** para controlar el Auto-Start desde la interfaz.
- ConfiguraciÃ³n inicial que habilita Auto-Start en el primer lanzamiento
  empaquetado.
- Atajos globales configurables con rollback si Windows rechaza el cambio.
- OpciÃ³n experimental DirectML con fallback automÃ¡tico a CPU.
- MÃ©tricas visibles de latencia, factor de tiempo real y memoria.
- BÃºsqueda y exportaciÃ³n JSON del historial local.
- VAD local adaptativo con parada automÃ¡tica y periodo de gracia configurable.
- Persistencia JSON versionada fuera de `localStorage`, con escritura atÃ³mica,
  backup y recuperaciÃ³n.
- Helper Windows x64 autocontenido para captura de foco y pegado mediante APIs
  Win32 directas.
- Benchmark reproducible de modelos con WER, latencia y factor de tiempo real.
- Gate obligatorio de doce casos humanos antes del release firmado.

### Cambiado

- Arquitectura enfocada en dictado local y privado para Windows x64, informada
  por una revisiÃ³n competitiva frente a OpenWhispr.
- Empaquetado reducido a los binarios ONNX Runtime requeridos para Windows x64.
- Binarios nativos `.dll` y `.node` de ONNX Runtime desempaquetados del archivo
  ASAR para permitir su carga correcta.
- CachÃ© persistente de modelos alojada en `userData` para reutilizaciÃ³n offline.
- Inferencia de pruebas forzada a CPU y FP32 para ejecuciÃ³n predecible en CI.

### Privacidad y seguridad

- Audio, modelos, historial, preferencias y transcripciones permanecen locales.
- No se requieren cuentas, telemetrÃ­a ni servicios de transcripciÃ³n en la nube.
- ExclusiÃ³n de cachÃ©s de Hugging Face y modelos `.onnx` del instalador.
- Pipeline de firma preparado para SignTool con SHA-256 y timestamp RFC 3161.

### CompilaciÃ³n y lanzamiento

- ExclusiÃ³n de binarios ONNX Runtime para ARM64, Linux y macOS.
- ConservaciÃ³n de binarios Windows x64 necesarios para CPU y DirectML.
- VerificaciÃ³n del paquete para detectar arquitecturas no deseadas, binarios
  faltantes y modelos filtrados.
- Instalador NSIS x64 con nombre
  `NextStepAI-Voice-Setup-1.0.0-x64.exe`.

### Pruebas y QA

- Pruebas de humo de modelos con cachÃ© temporal aislada.
- VerificaciÃ³n del tamaÃ±o e integridad de archivos ONNX descargados.
- Pruebas del arranque oculto a la bandeja y del comportamiento de cierre.
- Checklist de cold start, persistencia offline y liberaciÃ³n de memoria.

### ComparaciÃ³n con OpenWhispr

- NextStepAI Voice mantiene una implementaciÃ³n independiente y especializada en
  Windows x64.
- Se prioriza una superficie de producto mÃ¡s pequeÃ±a: dictado local, operaciÃ³n
  offline, Auto-Start silencioso y paquete optimizado.
- OpenWhispr conserva un alcance mÃ¡s amplio y multiplataforma; no existe
  afiliaciÃ³n, dependencia de cÃ³digo ni compatibilidad implÃ­cita entre ambos
  proyectos.

### Limitaciones conocidas

- La inferencia de v1.0.0 se ejecuta en CPU, aunque el paquete conserva los
  binarios DirectML para trabajo futuro.
- El primer uso de cada modelo requiere una descarga desde la red.
- La publicaciÃ³n estable requiere firma con el certificado de producciÃ³n,
  aceptaciÃ³n humana en hardware adicional y validaciÃ³n de actualizaciÃ³n y
  rollback.
