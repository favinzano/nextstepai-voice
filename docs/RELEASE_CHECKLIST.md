# Checklist Manual De Release

## Antes De Construir

- [ ] El número de versión coincide en `package.json` y la interfaz.
- [ ] El árbol Git está limpio.
- [ ] `npm test` pasa.
- [ ] `npm run test:production` pasa.
- [ ] `npm run test:models` pasa con Base y Small.
- [ ] `npm run release:test-models` pasa desde el ejecutable empaquetado.
- [ ] `npm run release:test-installer` pasa.
- [ ] `npm audit --omit=dev` no reporta vulnerabilidades.

## Instalador

- [ ] El instalador muestra nombre, icono y licencia correctos.
- [ ] La instalación limpia funciona en Windows 10 x64.
- [ ] La instalación limpia funciona en Windows 11 x64.
- [ ] Los accesos directos de escritorio e Inicio funcionan.
- [ ] La aplicación inicia sin Node.js instalado.
- [ ] La actualización sobre la versión anterior conserva datos.
- [ ] La desinstalación elimina la aplicación.
- [ ] La desinstalación conserva datos locales por defecto.
- [ ] El rollback a la versión estable anterior funciona.

## Funcional

- [ ] Permiso de micrófono y selección de dispositivo.
- [ ] Atajo global inicia y termina grabación.
- [ ] Overlay no roba el foco.
- [ ] Pegado funciona en Bloc de notas, navegador, Office y un editor de código.
- [ ] Whisper Base descarga, transcribe y queda en caché.
- [ ] Whisper Small descarga, transcribe y queda en caché.
- [ ] Reparar modelos elimina una caché dañada y permite descargar nuevamente.
- [ ] Historial, diccionario y preferencias persisten tras reiniciar.
- [ ] Emails, URLs, muletillas, silencios y textos largos cumplen aceptación.

## Publicación

- [ ] Ejecutable e instalador firmados.
- [ ] Checksum SHA-256 publicado.
- [ ] Política de privacidad, términos, licencia y avisos incluidos.
- [ ] Notas de release publicadas.
- [ ] Canal de soporte confirmado.
