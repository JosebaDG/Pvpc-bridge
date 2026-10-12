# Informe: qué ofrece la API REData de Red Eléctrica y cuánto histórico cabe en tu espacio

> Nota añadida el 12 de octubre de 2026: este es el informe original del 9 de octubre, sin cambios. "Tu espacio" es la máquina de trabajo donde se hicieron las pruebas. Después se contrastó el PVPC negativo del 26 de septiembre con ESIOS (coincide) y se descargó el histórico, que está en `datos/historico/`. Ver `README.md` de esta carpeta y `datos/LIMITACIONES.md`.

REData es gratuita, sin token y da para minar patrones: tiene el PVPC hora a hora desde el 1 de junio de 2021, el precio del mercado diario desde 2014 y la generación eólica y fotovoltaica día a día desde 2011. Lo que no tiene es eólica o solar hora a hora, previsiones meteorológicas ni tu consumo del contador. Todo el histórico útil para empezar ocupa unos pocos megas, así que el espacio no es un problema.

Comprobado el 9 de octubre de 2026 leyendo la documentación oficial y lanzando unas 350 peticiones pequeñas desde tu espacio en la nube. No he descargado ningún histórico completo y no he tocado tu script ni la skill.

## Cómo se pide

Según la [documentación oficial de REData](https://www.ree.es/es/datos/apidatos), solo hay peticiones GET con esta forma:

`https://apidatos.ree.es/{idioma}/datos/{categoria}/{widget}?start_date=AAAA-MM-DDTHH:MM&end_date=AAAA-MM-DDTHH:MM&time_trunc=...`

- **idioma:** `es` o `en`.
- **categoria:** `balance`, `demanda`, `generacion`, `intercambios`, `transporte` o `mercados`.
- **time_trunc:** la documentación admite `hour`, `day`, `month` y `year`, pero cada widget acepta solo algunas (tabla de abajo).
- **Zona geográfica (opcional):** `geo_trunc=electric_system`, `geo_limit` (`peninsular`, `canarias`, `baleares`, `ceuta`, `melilla` o `ccaa`) y `geo_ids` (por ejemplo, 8741 es la península). Si filtras por zona, hay que mandar los tres. Sin ellos sale el total nacional o el peninsular, según el widget.
- **Respuesta:** JSON (JSON:API). Cada serie está en `included[].attributes.values[]`, con `value`, `percentage` y `datetime` (hora local con su desfase horario).

## Todo lo que hay dentro

He probado los 75 widgets de la documentación con las cuatro granularidades. En la tabla aparecen las que respondieron.

| Categoría | Widgets | Granularidad | Qué contienen |
|---|---|---|---|
| mercados | precios-mercados-tiempo-real | Solo hora | PVPC y precio del mercado diario (spot) |
| mercados | componentes-precio-energia-cierre-desglose | Mes, año | Lo que pesa en el precio cada mercado y cada servicio de ajuste |
| mercados | Restricciones, regulación secundaria y terciaria, desvíos, coste y volumen de ajuste | Mes, año | Energía y precios de los servicios de ajuste |
| generacion | estructura-generacion, estructura-renovables, evolucion-renovable-no-renovable | Día, mes, año | MWh por tecnología: eólica, fotovoltaica, hidráulica, nuclear, ciclo combinado, etc. |
| generacion | evolucion-estructura-generacion-emisiones-asociadas | Hora, día, mes, año | Generación con y sin emisiones de CO2 (la única de generación que llega a la hora) |
| generacion | no-renovables-detalle-emisiones-CO2 | Día, mes, año | Toneladas de CO2 por tecnología y tCO2/MWh |
| generacion | Máximos renovables e históricos | Mes, año | Récords |
| demanda | demanda-tiempo-real | Solo hora (llega cada 5 min) | Demanda real, prevista y programada |
| demanda | evolucion, perdidas-transporte | Día, mes, año | Demanda diaria |
| demanda | IRE (índices de consumo de industria y servicios), máximos, efecto de la temperatura y la laboralidad | Mes, año | Índices y variaciones |
| balance | balance-electrico | Día, mes, año | Balance completo: renovable, no renovable, almacenamiento y saldo |
| intercambios | Francia, Portugal, Marruecos, Andorra, por línea, enlace con Baleares | Día, mes, año | Importación, exportación y saldo |
| transporte | Energía no suministrada, disponibilidad, cortes, km de líneas | Mes, año | Calidad de la red |

Cinco widgets de la documentación devolvieron error 500 o 502 con todas las granularidades: potencia-instalada, variacion-demanda, componentes-precio, reserva-potencia-adicional y energia-precios-gestion-desvios. Puede que estén caídos o retirados.

## Las series que te interesan: desde cuándo y con qué límites

| Serie | Widget | Paso | Primer dato | Máximo por petición |
|---|---|---|---|---|
| PVPC | precios-mercados-tiempo-real | Hora | 1 jun 2021 | 31 días |
| Spot del mercado diario | precios-mercados-tiempo-real | Hora; cada 15 min desde el 1 ene 2025 | 1 ene 2014 | 31 días |
| Eólica y fotovoltaica | estructura-generacion | Día | 1 ene 2011 | 1 año (2 con paso mensual) |
| Con y sin emisiones de CO2 | evolucion-estructura-...-emisiones-asociadas | Hora | 1 ene 2014 | 1 mes |
| Demanda peninsular | demanda-tiempo-real | 5 min | 2019 (1 ene 2019 sí, 1 jul 2018 no) | Probé 30 días |

No hay PVPC antes de junio de 2021. Antes de esa fecha solo sale el spot. Lo más reciente: los datos diarios de generación de ayer (8 de octubre) ya estaban hoy.

## Límites y trampas comprobadas

- **Un error para todo.** Pedir un rango demasiado largo, una granularidad que el widget no admite o fechas sin datos devuelve lo mismo: un 400 con "Los datos solicitados no están disponibles en este momento". Parece una caída, pero no lo es. Por eso conviene trocear las peticiones: un mes para los datos horarios y un año para los diarios.
- **Sin token y sin límite publicado.** La documentación no indica límite de peticiones. Con pausas de 0,25 a 1 segundo no me bloqueó en ningún momento.
- **PVPC solo para la península.** Al pedir el PVPC de Canarias o Baleares da el error de arriba.
- **Marcas horarias sucias.** La serie horaria de CO2 trae 25 valores en días de 24 horas, con una hora repetida y mal etiquetada (00:00+01:00 en octubre). Hay que quitar duplicados y pasar todo a UTC. Los cambios de hora de marzo y octubre necesitan el mismo cuidado.
- **Un dato raro que conviene validar.** El 26 de septiembre de 2026 (sábado), entre las 12:00 y las 15:00, la API da un PVPC negativo de hasta -12,63 €/MWh. Antes de fiarte de los mínimos, compáralo con la gráfica oficial.

## Lo que la API no da

- **Tu consumo.** La demanda de REData es la del país o la península. El historial de tu contador lo tiene tu distribuidora, no esta API.
- **Eólica o solar hora a hora.** REData solo las da por día. Las tiene [ESIOS](https://api.esios.ree.es/), la otra API de Red Eléctrica, que agrupa sus indicadores por hora o por intervalos de 5, 10 o 15 minutos. Sin token responde 403 Forbidden (lo he comprobado), y su documentación tiene un apartado "Personal token request" para pedirlo. No he podido confirmar los números de indicador de la eólica y la solar porque sin token no se puede ver la lista.
- **Meteorología y previsiones.** REData no tiene viento ni borrascas. Para el tiempo observado, el archivo de Open-Meteo (`archive-api.open-meteo.com`) me dio, sin clave, viento a 100 metros y radiación hora a hora en Bilbao. Es una fuente externa, no de Red Eléctrica.

## Discontinuidades al comparar años

- **El PVPC cambió de fórmula.** Según el [Real Decreto 446/2023](https://www.boe.es/buscar/doc.php?id=BOE-A-2023-14048), desde 2024 una parte del precio de la energía va ligada al mercado a plazo: un 25 % en 2024, un 40 % en 2025 y un 55 % en 2026, y el resto sale del mercado diario e intradiario. Así que un PVPC de 2022 y uno de 2026 no se forman igual. Para estudiar el efecto del viento, el spot es la referencia más limpia, y el PVPC sirve para ver tu factura.
- **El spot cambia de paso.** En REData sale cada hora hasta 2024 y cada 15 minutos desde el 1 de enero de 2025. Para comparar, hay que agregarlo a la hora.
- **Unidades.** El PVPC y el spot vienen en €/MWh. Tu umbral de 10 céntimos por kWh equivale a 100 €/MWh.

## Cuánto ocupa

Lo he medido con respuestas reales:

| Lote | JSON bruto | CSV | CSV comprimido (gzip) |
|---|---|---|---|
| Un mes de precios (septiembre de 2026, PVPC y spot) | 291 KB | 194 KB | 20 KB |
| Solo el PVPC de ese mes (720 filas) | (viene en la misma respuesta) | 31 KB | 4 KB |
| Un año de generación diaria (2025, 17 tecnologías) | 560 KB | 324 KB | 50 KB |
| Un mes de CO2 por horas | 143 KB | 100 KB | 12 KB |
| Un mes de demanda cada 5 min | 3,2 MB | no medido | no medido |

Estimación para todo el histórico, a partir de esas medidas:

- **PVPC por horas, de junio de 2021 a hoy:** unas 46.900 filas, 65 peticiones mensuales y unos 12 MB de descarga. Guardado en CSV, unos 2 MB.
- **Generación diaria, de 2011 a hoy:** unos 5.760 días, 16 peticiones anuales y unos 9 MB de descarga. Con seis tecnologías, menos de 2 MB.
- **CO2 por horas, de 2014 a hoy:** unas 112.000 horas, unas 154 peticiones y unos 22 MB de descarga.
- **Demanda cada 5 minutos, de 2019 a hoy:** unos 280 MB de JSON. Es la única pesada. Mejor agregarla a horas o dejarla fuera.

En memoria, todo esto ocupa unas decenas de megas como mucho. Tu espacio en la nube tiene ahora unos 99 GB libres en disco y unos 7 GB de memoria disponible; son lecturas de hoy, no un límite garantizado. Python trae `sqlite3` y `csv` de serie, pero pandas no está instalado.

## Dataset inicial recomendado

Empieza con tres series, que caben en unos 4 MB:

1. **PVPC y spot por horas,** de junio de 2021 a hoy, con una petición por mes.
2. **Generación diaria de eólica, fotovoltaica, hidráulica, nuclear, ciclo combinado y total,** de 2014 a hoy, para que coincida con el spot. Con un año por petición.
3. **Viento y radiación diarios de Open-Meteo** en tres o cuatro puntos con muchos parques eólicos, para cruzar el tiempo con la generación.

Cómo organizarlo:

- **Caché en bruto:** un JSON por mes o por año (por ejemplo, `datos_ree/raw/precios/2024-01.json`). Si el archivo ya existe, no se vuelve a pedir. Solo se refrescan los dos últimos meses.
- **Datos limpios:** un único SQLite (`ree.db`) con tablas `precio_h`, `gen_d` y `meteo_d`. Fecha en UTC más una columna de hora local, y valores en €/MWh y MWh.
- **Primeras preguntas:** cuántas horas bajan de 100 €/MWh cada mes y a qué hora del día; si los días de mucha eólica traen un precio medio más bajo; y cuánto tarda en notarse una borrasca (relación entre la eólica de hoy y el precio de los días siguientes). Para que te hagas una idea: en septiembre de 2026, 149 de las 720 horas estuvieron por debajo de 100 €/MWh, y el PVPC medio fue de 183,97 €/MWh.

## Correlación no es predicción

Con este histórico verás relaciones del pasado, por ejemplo que más viento coincide con precios más bajos. Para adelantarte a la semana siguiente hace falta además una previsión del viento, que ni REData ni el tiempo observado incluyen. Lo honesto, como primer objetivo, es encontrar patrones estacionales y por horas. La predicción vendría después, si los patrones aguantan.

## Fuentes y método

- [Documentación de la API REData](https://www.ree.es/es/datos/apidatos), en ree.es: formato, parámetros, categorías y lista de widgets.
- [Documentación de la API ESIOS](https://api.esios.ree.es/): tipos de endpoint y petición de token personal.
- [Real Decreto 446/2023 en el BOE](https://www.boe.es/buscar/doc.php?id=BOE-A-2023-14048): pesos del mercado a plazo en el PVPC.
- Las fechas, los límites y los tamaños salen de peticiones de prueba hechas hoy. Si Red Eléctrica cambia algo, puede variar.
