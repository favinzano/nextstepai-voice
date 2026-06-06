# Preparación Para Producción

Estado actual: beta funcional para Windows. Todavía no debe distribuirse como versión estable firmada.

## Verificado

- Compilación del renderer y comprobación sintáctica del proceso principal.
- Pipeline local con pruebas de limpieza, muletillas, espacios, emails, URLs y estructura.
- Whisper Base y Whisper Small cargados y probados localmente.
- Filtrado de salidas no verbales y alucinaciones breves conocidas.
- Captura mediante atajo global, overlay sin robo de foco y pegado en la aplicación activa.
- Procesamiento, diccionario e historial locales.
- Icono e identidad visual propios.
- Auditoría de dependencias de producción sin vulnerabilidades conocidas.

## Bloqueadores Antes Del Lanzamiento Estable

1. Crear instalador de Windows reproducible y probar instalación, actualización y desinstalación.
2. Firmar el ejecutable e instalador con un certificado de firma de código para reducir alertas de SmartScreen.
3. Ejecutar pruebas de aceptación con grabaciones reales:
   - Diferentes voces, acentos, micrófonos y niveles de ruido.
   - Dictados cortos y largos.
   - Emails, URLs, nombres propios y términos técnicos.
   - Medición de precisión, latencia y tasa de pegado exitoso.
4. Probar en Windows 10 y Windows 11, incluyendo equipos con poca memoria y CPU más lenta.
5. Definir política de privacidad, licencia del producto, términos de uso y canal de soporte.
6. Revisar licencias y avisos de terceros incluidos en la distribución.
7. Diseñar recuperación ante errores de descarga, caché dañada, falta de espacio y pérdida de conexión inicial.
8. Implementar una estrategia de actualizaciones y rollback.
9. Añadir pruebas automatizadas del instalador y una lista de comprobación manual para cada release.

## Comandos De Validación

```powershell
npm test
npm run test:production
npm run test:models
npm audit --omit=dev
```

`npm run test:models` descarga y valida Whisper Base y Whisper Small, por lo que requiere conexión en su primera ejecución.
