# Plan De Pruebas De Aceptación

## Objetivo

Validar precisión, latencia, estabilidad y pegado con voces y equipos reales antes de declarar el release estable.

## Matriz Mínima

- Windows 10 x64 y Windows 11 x64.
- CPU de gama baja, media y alta.
- 8 GB, 16 GB y 32 GB de RAM.
- Micrófono integrado, USB y auriculares Bluetooth.
- Español caribeño, mexicano, sudamericano y peninsular.
- Ambientes silencioso, oficina y ruido moderado.

## Casos De Dictado

1. Mensaje breve sin muletillas.
2. Mensaje largo con pausas y conectores.
3. Email y URL hablados.
4. Nombres propios y términos del diccionario.
5. Audio con silencios prolongados.
6. Audio con repeticiones y autocorrecciones.
7. Cambio entre Whisper Base y Small.
8. Pegado en distintas aplicaciones.

## Métricas

- Exactitud de palabras y términos críticos.
- Tasa de emails/URLs correctos.
- Tiempo desde fin de grabación hasta pegado.
- Tasa de pegado exitoso.
- Número de alucinaciones ante silencio.
- Uso máximo de memoria y CPU.

## Criterios Propuestos

- 100% de pegado exitoso en aplicaciones soportadas.
- 0 transcripciones guardadas ante silencio.
- 100% de emails/URLs del corpus crítico correctamente formateados.
- Sin cierres inesperados durante 100 dictados consecutivos.
- Small debe superar o igualar a Base en precisión del corpus.
