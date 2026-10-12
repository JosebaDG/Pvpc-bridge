# Limitaciones y problemas encontrados

Todo lo que fue saliendo mientras se estudiaba la API REData de Red Eléctrica (del 9 al 12 de octubre de 2026) y se montaba este proyecto. Está pensado para que quien venga detrás no tropiece en las mismas piedras y no tenga que volver a preguntar al servidor lo que ya se sabe.

Cada punto dice si está **comprobado** (salió de una petición real), si es una **hipótesis** o si sigue **pendiente**. Las pruebas están en `archivo/estudio-2026-10-09/` y en `datos/consultas/`.

## Peticiones a REData

- **Tope de 31 días por petición con paso horario (comprobado).** Del 1 de septiembre al 2 de octubre de 2026 (32 días) da error 400; un mes natural funciona. Con paso diario cabe un año entero por petición (dos con paso mensual). Por eso la descarga va mes a mes para los precios y año a año para la generación.
- **El mismo 400 para todo (comprobado).** Un rango demasiado largo, un `time_trunc` que el widget no admite o unas fechas sin datos devuelven lo mismo: HTTP 400 con "Los datos solicitados no están disponibles en este momento". Parece una caída y no lo es. No sirve de nada insistir: hay que trocear o cambiar la consulta. Las respuestas de error guardadas están en `archivo/estudio-2026-10-09/respuestas/errores/`.
- **Casi ningún widget acepta `time_trunc=hour` (comprobado).** Balance, generación por tecnología, renovables y otros devuelven el 400 genérico con paso horario. Los precios sí lo admiten. `time_trunc` solo acepta `hour`, `day`, `month` y `year`.
- **No hay límite de peticiones publicado.** La documentación no dice nada. En el estudio, con pausas de 0,25 a 1 segundo, no hubo bloqueos; aun así, la descarga del histórico se hizo con pausas de 5 segundos y caché (ver la regla de cortesía en `datos/README.md`).
- **REData puede tardar varios segundos en responder (comprobado el 12-10-2026).** Una petición mensual de precios tarda a veces 5 o 6 segundos. Es otra razón para no repetir consultas.
- **Una fecha final en el futuro se acepta (comprobado el 12-10-2026).** Pedir octubre de 2026 entero el día 12 devuelve los datos que haya hasta ese momento. Gracias a eso, la consulta del mes en curso tiene siempre la misma URL y la caché la sustituye al refrescarla.

## Lo que REData no tiene

- **Solo la península para el PVPC (comprobado).** Pedirlo con `geo_limit=canarias` (`geo_ids=8742`) o `baleares` (`8743`) da el 400 genérico. Para Canarias, Baleares, Ceuta y Melilla hay que ir a ESIOS, que pide token. Pendiente: adaptar el proyecto a esos sistemas.
- **El filtro geográfico cambia las series (comprobado).** En `precios-mercados-tiempo-real`, sin filtro salen el PVPC y el spot; con el filtro peninsular (`8741`) solo sale el PVPC. Por eso el histórico se pide sin filtro.
- **Ni eólica ni solar por horas (comprobado).** REData da la generación por tecnología día a día. Con paso horario o menor está en ESIOS (con token).
- **Ni previsiones ni consumo del contador.** REData da lo que ya pasó en el sistema eléctrico. No tiene previsiones de generación ni del tiempo, y el consumo de un suministro concreto lo tiene la distribuidora, no REE.
- **El PVPC sale en total, sin desglose.** El desglose hora a hora (mercado, servicios de ajuste, peajes y cargos, ajuste de futuros...) está en el archivo 70 de ESIOS, que se puede descargar sin token (`https://api.esios.ree.es/archives/70/download_json?locale=es&date=AAAA-MM-DD`). Hay ocho días de ejemplo en `archivo/estudio-2026-10-09/respuestas/esios/archivo70/`.
- **La generación diaria sin parámetros `geo_*` es nacional.** La documentación dice que el ámbito por defecto es "nacional o peninsular, según el widget". Que en este caso es nacional se deduce de que salen "Motores diésel" y otras tecnologías que solo existen en las islas (hipótesis razonable, no confirmada por REE). Para compararla con el PVPC, que es peninsular, tenlo en cuenta.

## ESIOS, la otra API de REE

- **Pide token personal para pedir datos con fechas (comprobado).** Sin token da la lista de indicadores (guardada en `archivo/estudio-2026-10-09/respuestas/esios/indicadores_sin_token.json`), pero en cuanto se piden fechas devuelve 403 (`e_403.json` y `e2_403.json`). El token se pide en la web de ESIOS con el botón "Token Request" y va en la cabecera `x-api-key`.
- **El archivo 70 no pide token (comprobado).** Es la excepción útil: da el PVPC de cada día desglosado por componentes.

## Discontinuidades al comparar años

- **El PVPC cambia de fórmula desde 2024.** Según el [Real Decreto 446/2023](https://www.boe.es/buscar/doc.php?id=BOE-A-2023-14048), una parte del coste de la energía del PVPC se liga al mercado a plazo: el 25 % en 2024, el 40 % en 2025 y el 55 % en 2026. Un PVPC de 2022 y uno de 2026 no se forman igual. Para estudiar el efecto del viento o del sol sobre el precio, el spot es la referencia más limpia; el PVPC sirve para estimar la factura.
- **No hay PVPC antes del 1 de junio de 2021 (comprobado).** El 31 de mayo de 2021 solo sale el spot. Es cuando empezó la tarifa 2.0TD.
- **El spot pasa a cuartohorario el 1 de enero de 2025 (comprobado).** Hasta 2024, 24 valores al día; desde 2025, 96. El PVPC sigue en 24. Para comparar años, agrega el spot a la hora.
- **Primeros datos (comprobado).** Spot: el 31 de diciembre de 2013 da 400 y el 1 de enero de 2014 responde. Generación diaria: diciembre de 2010 da 400 y el 1 de enero de 2011 responde. Demanda cada 5 minutos: desde 2019.

## Marcas horarias

- **Horas repetidas y desfases raros (comprobado).** La serie horaria de CO2 del 7 de octubre de 2026 trajo 25 valores en un día de 24 horas, con una hora repetida y etiquetada como `00:00+01:00` en pleno horario de verano.
- **Días de 23 y 25 horas.** Los domingos de cambio de hora (marzo y octubre) tienen 23 y 25 horas. Los CSV de `datos/historico/` llevan la hora local con su desfase y la hora UTC, y se deduplican por la hora UTC.

## Anomalías contrastadas

- **PVPC negativo el 26 de septiembre de 2026 (comprobado y explicado).** REData da un mínimo de -12,63 €/MWh a las 14:00. Se contrastó el 9 de octubre de 2026 con el archivo 70 oficial de ESIOS: ese día el PVPC fue negativo de 11:00 a 17:00, con el mismo mínimo, y REData coincide con ESIOS en las 24 horas. No es un error. Fue un sábado en valle, con el mercado casi a cero a mediodía y un ajuste de futuros de unos -46 €/MWh en todas las horas. La respuesta de ESIOS está en `archivo/estudio-2026-10-09/respuestas/esios/archivo70/arch70_2026-09-26.json`. (En el informe original del 9 de octubre aún figura como pendiente: se comprobó después.)
- **Datos recientes que cambian.** REE corrige los datos de los últimos días y consolida los anuales meses después (la generación de 2025 tiene como última actualización mayo de 2026). Por eso la caché marca como provisional lo descargado hace 3 días o menos de su fecha final, y el script de actualización lo refresca.
- **La generación diaria llega hasta el día de la descarga.** El 12 de octubre de 2026 a mediodía, REData ya daba un valor para ese mismo día. Los últimos días de `generacion_diaria/2026.csv` son provisionales y cambiarán al refrescar.
- **Precios de mañana.** El PVPC del día siguiente se publica por la tarde (a partir de las 20:00 aproximadamente, hora peninsular). Antes de esa hora no hay datos de mañana. El spot del día siguiente aparece antes (el 12 de octubre de 2026 a primera hora de la tarde ya estaba el del 13).

## Open-Meteo

- **También limita (comprobado el 12-10-2026).** Al pedir doce años de datos diarios de seis puntos seguidos, con 5 segundos de pausa, la quinta petición devolvió 429 (demasiadas peticiones). Al reintentar 30 segundos después funcionó. Open-Meteo cuenta el peso de cada petición por los días y variables que pide, no solo el número de peticiones.
- **Va unos días por detrás.** El archivo histórico (reanálisis) no tiene los últimos días; el script pide hasta hace 7 días.
- **No es de REE.** Va con licencia CC BY 4.0 y hay que citar a Open-Meteo.

## Problemas de nuestro lado

- **Las URL de las respuestas del estudio son deducidas.** Cuando se descargaron el 9 de octubre de 2026 no se apuntó la consulta exacta. La URL de cada respuesta se dedujo de los scripts del estudio y del propio contenido (primera y última fecha, paso y título); la hora final (23:59) es una suposición. En `datos/consultas/indice.json` figuran como `semilla_inferida`. El contenido sí es real: es el JSON tal cual lo devolvió la API. Dos de ellas (septiembre de 2026 de precios y 2025 de generación) se aprovecharon para el histórico en vez de volver a pedirlas. Las descargas del 12 de octubre en adelante sí llevan la URL exacta.
- **`comp_precio_h.json` no está en la caché.** Son los componentes del precio del 1 de septiembre de 2026, pero su consulta no se puede deducir con seguridad.
- **El eje de la gráfica parecía de bloques de 2 horas.** La primera gráfica del PVPC (9 de octubre de 2026) parecía agrupar las horas de dos en dos. Los precios siempre fueron 24 valores horarios: el fallo era solo que el eje ponía una marca cada dos horas. Se corrigió con una barra y una etiqueta por hora y el eje desde 0. Las dos versiones están en `archivo/estudio-2026-10-09/graficas/`.
- **La potencia de una pieza no es el consumo del conjunto.** Para estimar el coste de un consumo grande (un termo, la carga del coche o un equipo que trabaja durante horas), usa lo que gasta el aparato completo, no la potencia de uno de sus componentes.
- **Algunas salidas de consola del estudio se perdieron** antes de archivarlas. Las que quedaban no se publican porque llevan rutas internas de la máquina de trabajo; lo que importaba de ellas está en este documento y en el informe.
- **El paquete inicial y el histórico no se descargaron hasta el 12 de octubre de 2026.** El informe del 9 de octubre los estimaba (unos 4 MB el paquete inicial); ahora están en `datos/historico/`.

## Pendiente

- Canarias y Baleares (necesitan ESIOS con token).
- Confirmar con REE que la generación sin `geo_*` es nacional.
- Que la columna PCB del archivo 70 de ESIOS valga para Baleares y Canarias, y a qué hora local se aplica en Canarias.
