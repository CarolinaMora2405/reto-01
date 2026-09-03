# Solución técnica

## 1. Problema en una frase

La analista administrativa pierde tiempo y asume riesgo de error al transcribir datos repetidos de proveedor a formatos variables y reunir sus soportes.

## 2. Arquitectura

```text
React/Vite → API Fastify → ciclo del agente → adaptador LLM (OpenAI)
                              ↓
                    herramientas Zod
                    ↙                 ↘
          fixtures (solo lectura)      out (escritura)
```

El comportamiento vive en `agent/prompt.md`; las reglas de negocio, en `src/knowledge/registro-proveedor.md`; la ejecución, en `src/tools/proveedor.ts`. El servidor solo transporta solicitudes. El módulo bonus reexporta estas piezas canónicas para no crear copias divergentes.

## 3. Ciclo del agente

Cada turno agrega el mensaje a una sesión en memoria. El adaptador recibe mensajes y descripciones de herramientas. El ciclo valida argumentos con Zod, ejecuta la herramienta, registra un resumen visible y devuelve el resultado al modelo. Se detiene al recibir texto final o al llegar a 25 iteraciones. Existe un máximo de 12.000 tokens por sesión y timeout de 30 segundos.

Tras preparar un paquete, la sesión queda `awaitingConfirmation`. Solo una confirmación afirmativa en el mensaje inmediatamente siguiente permite llamar la simulación; cualquier otro mensaje consume y cancela esa oportunidad. La herramienta vuelve a exigir `confirmado: true`: el control no depende del prompt.

## 4. Modelo elegido

OpenAI con `gpt-4o-mini` por su function calling maduro, baja latencia y costo reducido; el nombre es configurable. El costo exacto cambia y debe verificarse antes de la defensa. Con un supuesto conservador de 6.000 tokens de entrada y 1.500 de salida por caso, se calcula multiplicando esos volúmenes por las tarifas vigentes. El adaptador propio permite sustituirlo sin tocar el ciclo.

## 5. Diseño del portal web

Usaría un navegador controlado con selectores accesibles y validaciones de dominio, pero limitaría la automatización a preparar/copiar valores. CAPTCHA, MFA y cambios de layout requieren intervención. Las credenciales vivirían en un gestor de secretos empresarial y serían introducidas por la persona, nunca pasarían por prompt, repositorio o logs. El humano inicia sesión, resuelve MFA/CAPTCHA, revisa y hace clic en **Enviar**; el agente únicamente sugiere correspondencias y llena un borrador reversible.

## 6. Decisiones y trade-offs

1. Mapeo determinista con glosario frente a mapeo libre por LLM: reduce flexibilidad, pero garantiza trazabilidad y evita alucinaciones.
2. Sesiones en memoria frente a base de datos: simplifica el reto y respeta el alcance; se pierden al reiniciar.
3. PDF nuevo frente a rellenar AcroForms: soporta los fixtures normalizados de forma fiable, aunque no preserva una plantilla gráfica real.
4. Confirmación en backend y herramienta frente a solo prompt: duplica una regla pequeña, pero una inyección de prompt no puede saltarse el control.
5. Reexportación en `modulo/` frente a copiar archivos: requiere conservar la estructura relativa, pero elimina divergencia funcional.

## 7. Supuestos

El entorno no incluía los fixtures prometidos, por lo que se crearon datos completamente ficticios ajustados al contrato y tres casos representativos. Se asumió que la fecha ISO permite comparar vigencias lexicográficamente, que las etiquetas son únicas por plantilla y que el PDF generado no debe reproducir identidad visual. El caso portal usa `plantilla-campos.json` como lista de campos aun cuando la tabla de entrada solo la exige expresamente para PDF.

## 8. Cobertura

| Historia | Estado | Pendiente para producción |
|---|---|---|
| HU-1 leer solicitud | Hecho | Parser de correos/adjuntos reales |
| HU-2 mapear | Hecho | Gobierno y versionado del maestro |
| HU-3 XLSX/PDF/portal | Hecho | Preservar plantillas reales y pruebas visuales |
| HU-4 paquete | Hecho | Firma y almacenamiento corporativo |
| HU-5 errores | Hecho | Observabilidad y alertas centralizadas |

## 9. Uso de IA

Se usó Codex de OpenAI para analizar el PRD, proponer la arquitectura, generar el primer borrador de código, fixtures ficticios, pruebas y documentación. Se revisó mediante compilación, pruebas y ejecución determinista. Se descartó delegar el mapeo de campos al modelo porque habría debilitado trazabilidad y seguridad; también se descartó automatizar portales reales por estar fuera de alcance y requerir credenciales.

## 10. Riesgos y mitigaciones

- Maestro desactualizado: dueño de datos, aprobación y versionado.
- Etiquetas nuevas: cola explícita de faltantes y ampliación revisada del glosario.
- Datos sensibles en logs: solo se registran resúmenes, nunca claves ni contenido bancario.
- Plantillas hostiles o corruptas: validación, límites de tamaño y aislamiento en producción.
- Costos/abuso: autenticación, cuotas por usuario, máximo de tokens e iteraciones.
- Concurrencia en filesystem: almacenamiento por trabajo con identificadores únicos y escritura atómica.
- Dependencia del proveedor: adaptador, reintentos acotados y métricas.

