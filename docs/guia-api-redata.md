# API REData de Red Eléctrica: guía práctica comprobada

REData es la API abierta de Red Eléctrica (REE): se consulta por GET, sin token ni registro, y devuelve JSON. Sirve para estudiar históricos de precios y generación del sistema eléctrico español: PVPC horario desde el 1 de junio de 2021, precio del mercado diario (spot) desde el 1 de enero de 2014 y generación diaria por tecnología, eólica y fotovoltaica incluidas, desde el 1 de enero de 2011.

Este documento recoge lo que se comprobó haciendo peticiones reales el 9 de octubre de 2026: endpoints, parámetros, granularidades, límites, trampas y volumen de datos. Está escrito pensando en Python y solo usa la biblioteca estándar. No es una librería ni una documentación oficial: si REE cambia algo, los resultados pueden variar.

## Cómo leer este documento

- **Comprobado:** salió de una petición real hecha el 9 de octubre de 2026 (unas 350 peticiones pequeñas en total, más una segunda ronda de verificación ese mismo día).
- **Estimado:** cálculo a partir de muestras medidas, no de una descarga completa.
- **Hipótesis:** interpretación razonable que no se ha verificado.

Que una serie responda desde cierta fecha significa que hoy hay datos desde ahí, no que REE garantice ese límite para siempre.

## Forma de las peticiones

Según la [documentación oficial de REData](https://www.ree.es/es/datos/apidatos):

```text
https://apidatos.ree.es/{idioma}/datos/{categoria}/{widget}?start_date=AAAA-MM-DDTHH:MM&end_date=AAAA-MM-DDTHH:MM&time_trunc={granularidad}
```

| Parámetro | Valores |
|---|---|
| idioma | `es`, `en` |
| categoria | `balance`, `demanda`, `generacion`, `intercambios`, `transporte`, `mercados` |
| time_trunc | `hour`, `day`, `month`, `year` (cada widget admite solo algunas) |
| geo_trunc | `electric_system` (opcional) |
| geo_limit | `peninsular`, `canarias`, `baleares`, `ceuta`, `melilla`, `ccaa` (opcional) |
| geo_ids | por ejemplo `8741` = península, `8742` = Canarias, `8743` = Baleares (opcional) |

Los tres parámetros geográficos van juntos: si filtras por zona, manda los tres. Sin ellos, cada widget devuelve su ámbito por defecto (nacional o peninsular, según el caso).

La respuesta sigue el formato JSON:API. Cada serie está en `included[].attributes`, con `title` y una lista `values[]` de objetos `{value, percentage, datetime}`. Algunos widgets anidan las series un nivel más, en `included[].attributes.content[].attributes.values[]`. `datetime` es hora local española con su desfase (`+01:00` o `+02:00`).

### Ejemplo con curl

```bash
curl -s "https://apidatos.ree.es/es/datos/mercados/precios-mercados-tiempo-real?start_date=2026-09-26T00:00&end_date=2026-09-26T23:59&time_trunc=hour"
```

Devuelve dos series: `PVPC` (24 valores horarios) y `Precio mercado spot` (96 valores, uno cada 15 minutos). Ambas en €/MWh.

### Ejemplo en Python (solo biblioteca estándar)

Este código se ejecutó tal cual el 9 de octubre de 2026.

```python
import json
import time
import urllib.error
import urllib.parse
import urllib.request

BASE = "https://apidatos.ree.es/es/datos"


def redata(categoria, widget, inicio, fin, time_trunc, **geo):
    """Devuelve {titulo_serie: [(datetime, valor), ...]} o lanza RuntimeError."""
    params = {"start_date": inicio, "end_date": fin, "time_trunc": time_trunc, **geo}
    url = f"{BASE}/{categoria}/{widget}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=40) as r:
            data = json.load(r)
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"{e.code}: {e.read()[:200]!r}") from None
    series = {}
    for item in data.get("included", []):
        attrs = item["attributes"]
        # Algunos widgets anidan las series dentro de attributes.content
        bloques = [c["attributes"] for c in attrs.get("content") or []] or [attrs]
        for b in bloques:
            series[b["title"]] = [(v["datetime"], v["value"]) for v in b.get("values") or []]
    return series


if __name__ == "__main__":
    s = redata("mercados", "precios-mercados-tiempo-real",
               "2026-09-26T00:00", "2026-09-26T23:59", "hour")
    pvpc = s["PVPC"]
    print(len(pvpc), "horas; mínimo:", min(pvpc, key=lambda x: x[1]))
    time.sleep(0.5)
    g = redata("generacion", "estructura-generacion",
               "2011-01-01T00:00", "2011-01-03T23:59", "day")
    print("Eólica:", g["Eólica"])
```

Salida obtenida:

```text
24 horas; mínimo: ('2026-09-26T14:00:00.000+02:00', -12.63)
Eólica: [('2011-01-01T00:00:00.000+01:00', 30530.962), ('2011-01-02T00:00:00.000+01:00', 120932.782), ('2011-01-03T00:00:00.000+01:00', 77934.616)]
```

Para filtrar por zona: `redata(..., geo_trunc="electric_system", geo_limit="peninsular", geo_ids="8741")`.

## Qué hay dentro: barrido de widgets

Se probaron los 76 widgets de la lista de la documentación con las cuatro granularidades, usando rangos cortos (un día para `hour`, una semana para `day`, ocho meses para `month`, tres años para `year`). Estas son las combinaciones que respondieron (comprobado):

| Categoría | Widgets | Granularidad | Contenido |
|---|---|---|---|
| mercados | precios-mercados-tiempo-real | Solo hora | PVPC y spot |
| mercados | componentes-precio-energia-cierre-desglose | Mes, año | Peso de cada mercado y servicio de ajuste en el precio |
| mercados | Restricciones, regulación secundaria y terciaria, desvíos, coste y volumen de servicios de ajuste | Mes, año | Energía y precios de ajuste |
| generacion | estructura-generacion, estructura-renovables, evolucion-renovable-no-renovable | Día, mes, año | MWh por tecnología |
| generacion | evolucion-estructura-generacion-emisiones-asociadas | Hora, día, mes, año | Generación con y sin emisiones de CO2 (la única de generación con paso horario) |
| generacion | no-renovables-detalle-emisiones-CO2 | Día, mes, año | tCO2 por tecnología y tCO2/MWh |
| generacion | Máximos renovables e históricos | Mes, año | Récords |
| demanda | demanda-tiempo-real | Solo hora (valores cada 5 min) | Demanda real, prevista y programada |
| demanda | evolucion, perdidas-transporte | Día, mes, año | Demanda diaria |
| demanda | IRE, máximos, variación por componentes | Mes, año | Índices y variaciones |
| balance | balance-electrico | Día, mes, año | Balance renovable, no renovable, almacenamiento y saldo |
| intercambios | Francia, Portugal, Marruecos, Andorra, por línea, enlace con Baleares | Día, mes, año | Importación, exportación y saldo |
| transporte | Energía no suministrada, disponibilidad, cortes, km de líneas | Mes, año | Calidad de la red |

Cinco widgets de la documentación devolvieron 500 o 502 con todas las granularidades: `potencia-instalada`, `variacion-demanda`, `componentes-precio`, `reserva-potencia-adicional` y `energia-precios-gestion-desvios`. Puede que estén caídos o retirados (hipótesis).

## Series principales: desde cuándo y cuánto por petición

| Serie | Widget | Paso | Primer dato observado | Máximo por petición |
|---|---|---|---|---|
| PVPC | mercados/precios-mercados-tiempo-real | Hora | 1 jun 2021 | 31 días |
| Spot | mercados/precios-mercados-tiempo-real | Hora; 15 min desde 1 ene 2025 | 1 ene 2014 | 31 días |
| Generación por tecnología | generacion/estructura-generacion | Día | 1 ene 2011 | 1 año (2 con paso mensual) |
| Con y sin emisiones de CO2 | generacion/evolucion-estructura-generacion-emisiones-asociadas | Hora | 1 ene 2014 | 1 mes |
| Demanda peninsular | demanda/demanda-tiempo-real | 5 min | 2019 | Probado con 30 días |

Comprobaciones de los límites (todas del 9 de octubre de 2026):

- **PVPC:** el 31 de mayo de 2021 solo devuelve el spot; el 1 de junio de 2021 ya aparecen `PVPC` y spot, 24 valores cada uno.
- **Spot:** el 31 de diciembre de 2013 da error 400; el 1 de enero de 2014 devuelve 24 valores.
- **Generación diaria:** diciembre de 2010 da error 400; del 1 al 3 de enero de 2011 devuelve `Eólica` y `Solar fotovoltaica`.
- **Paso del spot:** el 15 de diciembre de 2024 trae 24 valores; desde el 1 de enero de 2025, 96 (cada 15 minutos). El PVPC sigue en 24 valores por día.
- **Demanda cada 5 minutos:** el 1 de enero de 2019 responde (288 valores); el 1 de julio de 2018 no.
- **Rango máximo de precios:** del 1 de septiembre al 2 de octubre de 2026 (32 días) devuelve error 400; un mes natural de 30 días funciona.
- **Frescura:** los datos diarios de generación del día anterior ya estaban disponibles.

## Límites y trampas

- **Un mismo 400 para todo.** Un rango demasiado largo, una granularidad no admitida o unas fechas sin datos devuelven lo mismo: HTTP 400 con `"Los datos solicitados no están disponibles en este momento"`. Parece una caída del servicio y no lo es. Trocea: un mes para datos horarios, un año para datos diarios.
- **Sin token y sin límite de peticiones publicado.** La documentación no menciona un límite. Con pausas de 0,25 a 1 segundo entre peticiones no hubo bloqueos. Sé amable con el servicio y cachea.
- **PVPC solo peninsular.** Pedirlo con `geo_limit=canarias` (`geo_ids=8742`) o `baleares` (`8743`) devuelve el 400 genérico.
- **El filtro geográfico cambia las series que salen.** En precios-mercados-tiempo-real, la petición sin filtro trae PVPC y spot; con el filtro peninsular (`8741`) solo devolvió `PVPC`.
- **Marcas horarias sucias.** La serie horaria de CO2 del 7 de octubre de 2026 trajo 25 valores en un día de 24 horas, con una hora repetida y etiquetada como `00:00+01:00` en pleno horario de verano. Deduplica, convierte todo a UTC y trata aparte los días de cambio de hora (marzo y octubre, de 23 y 25 horas).
- **Unidades.** PVPC y spot vienen en €/MWh. 100 €/MWh equivalen a 0,10 €/kWh.

## Anomalías que conviene contrastar

La API devuelve un PVPC negativo el sábado 26 de septiembre de 2026 entre las 12:00 y las 15:00, con un mínimo de -12,63 €/MWh a las 14:00 (-12,35 a las 13:00, -12,27 a las 15:00, -11,81 a las 12:00). Se comprobó dos veces el 9 de octubre de 2026 y el valor no cambió.

El spot también tuvo valores negativos esos días, pero mucho más pequeños: -1,14 €/MWh el 20 de septiembre a las 13:30.

Contrastado el 9 de octubre de 2026 con el archivo oficial de ESIOS (`https://api.esios.ree.es/archives/70/download_json?locale=es&date=2026-09-26`, sin token): el 26 de septiembre el PVPC fue negativo de 11:00 a 17:00, con mínimo de -12,63 €/MWh entre las 14:00 y las 15:00, y REData coincide con ESIOS en las 24 horas. No es un error de la API. Ese archivo da además cada hora desglosada (mercado, servicios de ajuste, peajes y cargos, ajuste de futuros...), y explica el caso: sábado en valle, mercado casi a cero a mediodía y un ajuste de futuros de unos -46 €/MWh en todas las horas. El porqué, con la factura y los tramos, está en la [documentación técnica del proyecto](proyecto-precio-luz.md).

## Discontinuidades al comparar años

- **Cambio de fórmula del PVPC desde 2024.** El [Real Decreto 446/2023](https://www.boe.es/buscar/doc.php?id=BOE-A-2023-14048) liga una parte del coste de la energía del PVPC al mercado a plazo: 25 % en 2024, 40 % en 2025 y 55 % en 2026; el resto sigue saliendo del mercado diario e intradiario. Un PVPC de 2022 y uno de 2026 no se forman igual. Para estudiar el efecto del viento o del sol sobre el precio, el spot es la referencia más limpia; el PVPC sirve para estimar la factura.
- **Cambio de paso del spot.** Horario hasta el 31 de diciembre de 2024, cuartohorario desde el 1 de enero de 2025. Para comparar años, agrega a la hora.
- **No hay PVPC antes de junio de 2021.** Antes solo está el spot.

## Volumen de datos

### Medido con respuestas reales

| Lote | JSON bruto | CSV | CSV con gzip |
|---|---|---|---|
| Un mes de precios (septiembre de 2026, PVPC y spot) | 291 KB | 194 KB | 20 KB |
| Solo el PVPC de ese mes (720 filas) | En la misma respuesta | 31 KB | 4 KB |
| Un año de generación diaria (2025, 17 tecnologías) | 560 KB | 324 KB | 50 KB |
| Un mes de CO2 horario (septiembre de 2026) | 143 KB | 100 KB | 12 KB |
| Un mes de demanda cada 5 minutos | 3,2 MB | No medido | No medido |

### Estimado para el histórico completo

Extrapolado de las muestras anteriores; no se descargó ningún histórico entero.

| Serie | Filas aprox. | Peticiones | Descarga | Guardado |
|---|---|---|---|---|
| PVPC horario, jun 2021 a oct 2026 | 46.900 | 65 (mensuales) | unos 12 MB | unos 2 MB en CSV |
| Generación diaria, 2011 a 2026 | 5.760 días | 16 (anuales) | unos 9 MB | menos de 2 MB con seis tecnologías |
| CO2 horario, 2014 a 2026 | 112.000 horas | unas 154 | unos 22 MB | no estimado |
| Demanda cada 5 min, 2019 a 2026 | no estimado | no estimado | unos 280 MB | conviene agregar a horas |

Un paquete inicial con precios horarios desde 2021, generación diaria desde 2014 y meteorología diaria de unos pocos puntos cabría en unos 4 MB (estimado).

## Lo que REData no da

Conviene separar tres tipos de dato que a menudo se mezclan:

- **Generación observada:** lo que realmente se produjo. REData la da por día y tecnología. La eólica y la solar con paso horario o menor están en ESIOS.
- **Previsiones:** lo que se espera que pase. REData no tiene previsiones de generación ni meteorológicas.
- **Consumo de un suministro concreto:** la demanda de REData es la del sistema. El consumo de un contador lo tiene la distribuidora del suministro, no REE.
- **Desglose del PVPC por componentes:** REData da el total. El archivo 70 de ESIOS (`https://api.esios.ree.es/archives/70/download_json?locale=es&date=AAAA-MM-DD`) lo da hora a hora y sin token: mercado, servicios de ajuste, peajes y cargos, ajuste de futuros, comercialización, pagos por capacidad. Probado el 9 de octubre de 2026 con días de 2021 a 2026.

Para qué significa cada componente, los tramos 2.0TD, los impuestos y cómo leer una factura, mira la [documentación técnica del proyecto](proyecto-precio-luz.md), que usa esta API.

## Posibles integraciones (no implementadas)

### ESIOS, la otra API de REE

[ESIOS](https://api.esios.ree.es/) ofrece indicadores con paso horario o de 5, 10 o 15 minutos y cubre también los sistemas no peninsulares. Su documentación tiene un apartado de petición de token personal, que va en la cabecera `x-api-key`.

Comprobado el 9 de octubre de 2026, sin token:

- `GET https://api.esios.ree.es/indicators` respondió 200 con una lista de 1.983 indicadores.
- Algunos indicadores responden sin token sin fechas, con los datos del día: el 1001 (término de energía del PVPC 2.0TD) y el 600.
- Con `start_date` y `end_date`, el 1001 respondió 403. Los de eólica (551, 1777) respondieron 403 incluso sin fechas.

Indicadores relevantes que aparecen en esa lista:

| ID | Nombre |
|---|---|
| 551 | Generación T.Real eólica |
| 1295 | Generación T.Real Solar fotovoltaica |
| 2038 | Generación T.Real eólica nacional |
| 2044 | Generación T.Real solar fotovoltaica nacional |
| 541 | Previsión de la producción eólica peninsular |
| 542 | Generación prevista Solar fotovoltaica |
| 1777 | Previsión diaria D+1 eólica |
| 1779 | Previsión diaria D+1 fotovoltaica |
| 1778 / 1780 | Previsión intradiaria H+3 eólica / fotovoltaica |
| 10358 | Previsión diaria D+1 eólica más fotovoltaica |

Con token, ESIOS daría la generación eólica y solar observada con paso fino y las previsiones de REE. No se ha probado con token.

### Open-Meteo para meteorología

Fuente externa, no de REE. Comprobado sin clave el 9 de octubre de 2026 con un punto de la cornisa cantábrica:

- **Histórico observado** (`archive-api.open-meteo.com/v1/archive`): devolvió viento a 100 m (km/h) y radiación de onda corta (W/m²) hora a hora, y en paso diario viento máximo a 10 m y radiación acumulada (MJ/m²).
- **Previsión** (`api.open-meteo.com/v1/forecast`): devolvió 168 horas (7 días) de viento a 100 m y radiación.

```bash
curl -s "https://archive-api.open-meteo.com/v1/archive?latitude=43.26&longitude=-2.93&start_date=2025-01-01&end_date=2025-01-02&daily=wind_speed_10m_max,shortwave_radiation_sum&timezone=Europe%2FMadrid"
```

Revisa las condiciones de uso de [Open-Meteo](https://open-meteo.com/) antes de usarlo en algo público o comercial.

## Estructura sugerida para un proyecto

Propuesta, no implementada:

- **Caché en bruto:** un JSON por mes (precios, CO2) o por año (generación diaria), por ejemplo `datos/raw/precios/2024-01.json`. Si el archivo existe, no se vuelve a pedir; solo se refrescan los dos últimos meses.
- **Datos limpios:** un SQLite con tablas como `precio_h`, `gen_d` y `meteo_d`, con fecha en UTC más una columna de hora local, y valores en €/MWh y MWh. `sqlite3` y `csv` vienen con Python.
- **Preguntas para empezar:** cuántas horas bajan de 100 €/MWh cada mes y a qué hora del día; si los días con mucha eólica tienen un spot medio más bajo; cuánto tarda en notarse en el precio un episodio de viento fuerte. Como referencia, en septiembre de 2026 hubo 149 de 720 horas con PVPC por debajo de 100 €/MWh, y el PVPC medio fue de 183,97 €/MWh (máximo 431,34; mínimo -12,63).

Correlación no es predicción. Con el histórico se ven relaciones pasadas; para anticipar precios hace falta además una previsión de viento y sol, como las de ESIOS o Open-Meteo.

## Fuentes

- [Documentación de la API REData](https://www.ree.es/es/datos/apidatos) (REE): formato, parámetros, categorías y lista de widgets.
- [API de ESIOS](https://api.esios.ree.es/) (REE): indicadores y petición de token personal.
- [Real Decreto 446/2023, BOE-A-2023-14048](https://www.boe.es/buscar/doc.php?id=BOE-A-2023-14048): nueva metodología del PVPC y pesos del mercado a plazo.
- [Open-Meteo](https://open-meteo.com/): datos meteorológicos históricos y previsiones.
- Fechas, límites, tamaños y valores: peticiones de prueba del 9 de octubre de 2026.
