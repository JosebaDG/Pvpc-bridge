# Servidor MCP de Pvpc-bridge

Servidor [MCP](https://modelcontextprotocol.io) que da el precio de la luz PVPC 2.0TD de la península, hora a hora, a cualquier asistente o agente que hable MCP. Funciona en Cloudflare Workers, está escrito en TypeScript y pide una clave.

Los cálculos son los de [`puente_luz.py`](../puente_luz.py), traducidos a TypeScript. Las pruebas comparan los dos con los mismos datos, así que dan lo mismo.

## Herramientas

| Herramienta | Qué hace | Parámetros |
|---|---|---|
| `precios` | Precio de cada hora de un día, con su periodo P1/P2/P3 y el precio con impuestos. | `dia` |
| `resumen` | Horas más baratas y más caras, media del día y media por periodo. | `dia`, `n` |
| `bloque` | Mejor bloque seguido de N horas para un consumo, con su coste. | `horas`, `potencia_w`, `dia`, `desde`, `hasta` |
| `umbral` | Franjas seguidas por debajo de un precio. | `max_precio_eur_kwh`, `dia`, `desde`, `hasta`, `min_horas`, `potencia_w`, `con_impuestos` |

- `dia`: `hoy`, `manana` o `AAAA-MM-DD`, desde el 2021-06-01 (primer día del PVPC en REData) hasta mañana. Los precios de mañana salen hacia las 20:45, hora peninsular: antes de las 20:00 el servidor ni pregunta a REE y responde `no_publicado`.
- `desde` y `hasta`: `ahora`, `HH:MM` (`24:00` es medianoche) o una fecha y hora ISO. Sin desfase, se entiende hora peninsular.
- `bloque` sin `dia` mira desde ahora hasta el final de mañana, si ya está publicado. Con `dia: hoy` no propone horas pasadas.

Todas las horas van en hora peninsular. Los precios van en €/kWh **sin impuestos**, como los publica Red Eléctrica, y cada respuesta trae también el precio con impuestos genéricos de 2026: impuesto eléctrico del 5,11 % e IVA del 21 %. No incluye término de potencia, bono social ni alquiler del contador. El servidor no conoce ningún contrato privado.

Si un día aún no está publicado, la herramienta responde con `"error": "no_publicado"` y no se cae. Una fecha fuera de ese rango responde `"error": "entrada"` sin llegar a REE.

## Conectarse

La dirección es `https://pvpc-bridge-mcp.<subdominio>.workers.dev/mcp` (Streamable HTTP) y cada petición lleva la cabecera:

```
Authorization: Bearer <clave>
```

Por ejemplo, con Claude Code:

```bash
claude mcp add --transport http pvpc https://pvpc-bridge-mcp.<subdominio>.workers.dev/mcp \
  --header "Authorization: Bearer <clave>"
```

Con un cliente que solo habla por la entrada estándar (stdio), sirve de puente [`mcp-remote`](https://www.npmjs.com/package/mcp-remote):

```json
{
  "mcpServers": {
    "pvpc": {
      "command": "npx",
      "args": ["mcp-remote", "https://pvpc-bridge-mcp.<subdominio>.workers.dev/mcp",
               "--header", "Authorization: Bearer ${PVPC_CLAVE}"],
      "env": { "PVPC_CLAVE": "<clave>" }
    }
  }
}
```

`GET /salud` dice si el servidor está vivo, sin clave y sin datos. `GET /` explica en tres líneas qué es.

## Cómo está hecho

- **Sin sesiones.** Cada `POST /mcp` crea un servidor, responde en JSON y se olvida. No hace falta Durable Objects ni guardar estado.
- **Clave.** Va en el secreto `MCP_CLAVE` del Worker, nunca en el repositorio. Sin clave configurada, `/mcp` responde 503: el servidor se queda cerrado, no abierto por descuido. La comparación tarda lo mismo acierte o no.
- **Poca carga para Red Eléctrica.** Un día publicado no cambia, así que se guarda en memoria y en Workers KV (`PRECIOS`), y cada día se pide a REE una sola vez. Un «todavía no publicado» se recuerda 10 minutos.
- **Coste.** Cabe en el plan gratuito de Workers: 100.000 peticiones al día, y en KV 100.000 lecturas y 1.000 escrituras diarias. Este servidor escribe una vez por día de precios consultado.

| Archivo | Qué hay |
|---|---|
| `src/index.ts` | Entrada del Worker. |
| `src/servidor.ts` | Las cuatro herramientas, la clave y las rutas. |
| `src/precios.ts` | Los cálculos: periodos, bloque, umbral, resumen. Sin red. |
| `src/ree.ts` | Descarga de REData y caché. |
| `src/tiempo.ts` | Fechas y horas en hora peninsular, con los días de 23 y 25 horas. |
| `test/` | Pruebas con datos reales guardados de REE, incluida la comparación con `puente_luz.py`. |

## Probarlo en tu ordenador

Hace falta Node 22.18 o más moderno (y Python 3 para la comparación con `puente_luz.py`).

```bash
cd mcp
npm ci
npm run comprobar   # tipos
npm test            # pruebas, sin red
echo 'MCP_CLAVE=una-clave-local' > .dev.vars
npm run dev         # http://localhost:8787/mcp con datos reales de REE
```

`.dev.vars` no se sube: está en `.gitignore`.

## Desplegar

Se despliega a mano desde GitHub: **Actions > MCP > Run workflow**. Antes hay que guardar tres secretos en **Settings > Secrets and variables > Actions**:

| Secreto | Qué es |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Token de Cloudflare creado con la plantilla «Edit Cloudflare Workers». |
| `CLOUDFLARE_ACCOUNT_ID` | Identificador de la cuenta de Cloudflare (sale en la portada de Workers). |
| `MCP_CLAVE` | La clave de los clientes: larga y aleatoria, al menos 24 caracteres. |

El workflow pasa las pruebas, despliega, sube la clave como secreto del Worker y comprueba que `/mcp` sin clave da 401. La URL sale en el resumen del workflow. La primera vez, wrangler crea solo el espacio de KV.

Para cambiar la clave, se cambia el secreto `MCP_CLAVE` y se vuelve a lanzar el workflow.

## Fuente de los datos

Datos de [Red Eléctrica (REData)](https://www.ree.es/es/datos/apidatos). Pvpc-bridge no está vinculado a Red Eléctrica. Cada respuesta lleva la fuente y la hora de la consulta.
