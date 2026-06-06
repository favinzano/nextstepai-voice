# Preparación Para Producción

Estado actual: release candidate `1.0.0` funcional para Windows x64. Todavía no debe distribuirse públicamente como versión estable firmada.

## Verificado

- Compilación del renderer y comprobación sintáctica del proceso principal.
- Pipeline local con pruebas de limpieza, muletillas, espacios, emails, URLs y estructura.
- Whisper Base y Whisper Small cargados y probados localmente.
- Filtrado de salidas no verbales y alucinaciones breves conocidas.
- Captura mediante atajo global, overlay sin robo de foco y pegado en la aplicación activa.
- Procesamiento, diccionario e historial locales.
- Icono e identidad visual propios.
- Auditoría de dependencias de producción sin vulnerabilidades conocidas.
- Instalador NSIS reproducible, instalación, arranque y desinstalación validados.
- Ejecutable empaquetado validado con Whisper Base y Whisper Small.
- Caché de modelos persistente en datos del usuario y acción de reparación.
- Checksum SHA-256 generado automáticamente.
- Política de privacidad, términos, licencia y avisos de terceros.
- Estrategia de actualización manual y rollback documentada.
- CI de Windows para validar y construir artefactos.

## Bloqueadores Antes Del Lanzamiento Estable

1. Firmar el ejecutable e instalador con un certificado de firma de código para reducir alertas de SmartScreen.
2. Ejecutar pruebas de aceptación con grabaciones reales:
   - Diferentes voces, acentos, micrófonos y niveles de ruido.
   - Dictados cortos y largos.
   - Emails, URLs, nombres propios y términos técnicos.
   - Medición de precisión, latencia y tasa de pegado exitoso.
3. Probar en Windows 11 y en equipos adicionales con poca memoria y CPU más lenta. Windows 10 x64 ya fue validado en el entorno actual.
4. Validar instalación sobre una versión anterior y rollback cuando exista un segundo instalador versionado.

## Comandos De Validación

```powershell
npm test
npm run test:production
npm run test:models
npm run release:win
npm run release:verify
npm run release:test-models
npm run release:test-installer
npm audit --omit=dev
```

`npm run test:models` descarga y valida Whisper Base y Whisper Small, por lo que requiere conexión en su primera ejecución.
