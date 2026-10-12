# Archivo del estudio de la API REData (9 y 10 de octubre de 2026)

Aquí están las pruebas del estudio que dio lugar a la [guía de la API](../../docs/guia-api-redata.md): las respuestas reales que devolvieron REData y ESIOS, los errores, los scripts que se usaron y el informe original. Sirve para comprobar lo que dice la guía sin volver a preguntar al servidor.

El histórico completo de precios y generación no está aquí, sino en [`datos/`](../../datos/README.md). Las limitaciones y problemas encontrados están resumidos en [`datos/LIMITACIONES.md`](../../datos/LIMITACIONES.md).

## Qué hay

| Carpeta o archivo | Qué es | Real o derivado |
|---|---|---|
| `respuestas/redata/` | 9 respuestas de REData con datos (precios, CO2, generación, balance, demanda) | Real: el JSON tal cual |
| `respuestas/errores/` | 16 respuestas de error de REData (casi todas, `time_trunc=hour` no admitido) | Real |
| `respuestas/esios/indicadores_sin_token.json` | Lista de indicadores de ESIOS, que se puede pedir sin token | Real |
| `respuestas/esios/e_403.json`, `e2_403.json` | ESIOS pidiendo datos con fechas sin token: 403 | Real |
| `respuestas/esios/archivo70/` | Archivo 70 de ESIOS (PVPC desglosado) de 8 días entre 2021 y 2026 | Real |
| `registros/sondeo_widgets/` | Resultado del barrido de widgets de REData (qué responde y con qué paso) | Registro |
| `scripts/` | Tres scripts del estudio: el barrido de widgets, la comprobación de las fechas de inicio de cada serie y el ejemplo de la guía | Código |
| `graficas/` | La primera gráfica del PVPC, cuyo eje parecía de 2 horas, y la corregida, con una barra por hora | Derivado |
| `informe_api_redata.md` | El informe completo del 9 de octubre de 2026 | Documento |
| `fuentes.md` | Enlaces a las fuentes oficiales consultadas | Documento |
| `inventario.csv` | Cada archivo de esta carpeta con su tamaño, SHA-256 y procedencia | Índice |

Los scripts se ejecutaron en una máquina de trabajo, no en este repositorio. Se dejan como estaban, salvo una ruta temporal en `sondeo_widgets.py` que ahora escribe en la carpeta actual.

## Ojo: las URL de estas respuestas son deducidas

Cuando se descargaron no se apuntó la consulta exacta. La URL de cada respuesta de `respuestas/redata/` se ha deducido de los scripts y del propio contenido (primera y última fecha, paso de los valores, título de la serie). La hora final, 23:59, es una suposición. El contenido sí es real.

En la caché (`datos/consultas/indice.json`) figuran con `"origen": "semilla_inferida"`, apuntando a estos mismos archivos, sin copiarlos:

| Archivo | Consulta deducida | Paso |
|---|---|---|
| `pvpc_2026-09.json` | mercados/precios-mercados-tiempo-real, septiembre de 2026 | hour |
| `pvpc_1d.json` | mercados/precios-mercados-tiempo-real, 1 de octubre de 2025 | hour |
| `co2_2026-09.json` | generacion/evolucion-estructura-generacion-emisiones-asociadas, septiembre de 2026 | hour |
| `gen_2025_day.json` | generacion/estructura-generacion, todo 2025 | day |
| `gen_day.json` | generacion/estructura-generacion, 1 a 7 de octubre de 2025 | day |
| `balance_day.json` | balance/balance-electrico, 1 a 7 de octubre de 2025 | day |
| `dem_1d.json` | demanda/demanda-tiempo-real, 1 de octubre de 2025 | hour |
| `dem_rt_recent.json` | demanda/demanda-tiempo-real, 8 de octubre de 2026 | hour |

`comp_precio_h.json` (componentes del precio, 1 de septiembre de 2026) se guarda, pero no está en la caché porque su consulta no se puede deducir con seguridad.

## Qué se ha dejado fuera, y por qué

- **Salidas de consola de las herramientas de trabajo:** llevaban rutas internas de la máquina y no aportan nada que no esté en el informe o en `datos/LIMITACIONES.md`.
- **Copias de páginas web** (BOE, ESIOS, REE): son contenido de terceros. En su lugar, `fuentes.md` enlaza las fuentes oficiales.
- **Copias del script puente y del README del proyecto:** ya están en la raíz del repositorio, en su versión buena.
- **Derivados reproducibles:** la caché de `puente_luz.py` (precios ya pasados a €/kWh) y una base SQLite de prueba. Se rehacen en segundos a partir de las respuestas.
- **La configuración privada (`contrato.json`)**, tokens y credenciales: nunca se publican.

## Correcciones posteriores al informe

El informe es el del 9 de octubre de 2026 y se deja tal cual. Desde entonces:

- El PVPC negativo del 26 de septiembre de 2026 (-12,63 €/MWh) ya está contrastado con el archivo 70 de ESIOS: REData coincide en las 24 horas. Ver `respuestas/esios/archivo70/arch70_2026-09-26.json`.
- El "paquete inicial de unos 4 MB" y el histórico completo se descargaron el 12 de octubre de 2026 y están en `datos/historico/`.
