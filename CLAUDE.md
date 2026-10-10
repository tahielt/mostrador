# Mostrador

Agente de ventas que atiende WhatsApp Business e Instagram manejando un Android con ARTEMIS (MCP). Catálogo y pedidos en Google Sheets, cobros con Mercado Pago, aprobación humana SÍ/NO. Visión general y setup: `README.md`.

## Comandos
- `npm run demo` — flujo completo con teléfono, planilla y pagos simulados. Es la prueba de humo después de cada cambio.
- `npm test` — tests (`node:test`); incluye un server MCP falso de ARTEMIS en `test/fake-artemis.ts`.
- `npm run typecheck`

## Invariantes (todo cambio las mantiene)
- **Plata determinística**: precio, stock, totales y links los calcula el código desde el Catálogo. El LLM solo clasifica la intención y, opcionalmente, reescribe una plantilla ya correcta.
- **Verificador como compuerta**: todo texto generado pasa por `src/agente/verificador.ts`; si falla, sale la plantilla. Un dato nuevo que el agente pueda decir (montos, fechas, links) se agrega a `Permitido`.
- **Aprobación humana**: todo mensaje al cliente pasa por `ejecutar()` en `src/tareas/ciclo.ts`. Cobros, seguimientos, reclamos y envíos siempre con persona; `auto_simple` solo autoenvía precio/stock.
- **Un celular, un turno**: todo uso del teléfono va por `Turnos.usar()`.
- **Auditable**: cada propuesta, aprobación, envío y derivación queda en `logs/auditoria.jsonl` vía `auditar()`.

## Arquitectura (puertos y adaptadores)
Los puertos están en `src/tipos.ts` (`Datos`, `Telefono`, `Pagos`, `Aprobador`, `LLM`). Una integración nueva (WhatsApp Cloud API, IG Messaging API, aprobación por WhatsApp) es un adaptador nuevo que implementa el puerto; el pipeline no cambia.

## Estilo
Código conciso, nombres de dominio en español (pedido, catálogo, seguimiento), sin dependencias nuevas salvo que ahorren código real. Credenciales solo en `.env` y `credenciales/` (ignorados por git).
