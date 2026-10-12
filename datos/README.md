# Datos: histórico de precios y generación, y caché de consultas

Esta carpeta guarda el histórico ya descargado de la API REData de Red Eléctrica, para que nadie tenga que volver a pedírselo al servidor: el PVPC peninsular hora a hora desde el 1 de junio de 2021, el precio del mercado diario desde el 1 de enero de 2014 y la generación diaria por tecnología (eólica, fotovoltaica y el resto) desde el 1 de enero de 2011. Añade el tiempo observado de seis puntos de España, de Open-Meteo, para cruzarlo con la generación.

Descargado el 12 de octubre de 2026 con 175 peticiones pausadas: 153 meses de precios (septiembre de 2026 ya estaba guardado del estudio y no se volvió a pedir), 15 años de generación (2025 tampoco), 6 consultas de meteorología y un reintento. Ocupa unos 17 MB: 12,9 MB de CSV y 4,2 MB de respuestas crudas comprimidas. Ningún archivo pasa de 2 MB.

| Serie | Desde | Hasta | Registros |
|---|---|---|---|
| PVPC peninsular por horas | 1-6-2021 | 12-10-2026 | 47.040 |
| Mercado diario (spot) | 1-1-2014 | 13-10-2026 | 158.924 |
| Generación diaria por tecnología | 1-1-2011 | 12-10-2026 | 5.764 días |
| Meteorología diaria, seis puntos | 1-1-2014 | 5-10-2026 | 27.966 |

Las limitaciones de la API y los problemas que fueron saliendo están en [LIMITACIONES.md](LIMITACIONES.md).

## Qué hay

| Ruta | Qué es |
|---|---|
| `historico/pvpc_peninsula_horario/AAAA.csv` | PVPC 2.0TD de la península, una fila por hora, en €/MWh sin impuestos |
| `historico/spot_mercado_diario/AAAA.csv` | Precio del mercado diario (spot), en €/MWh: una fila por hora hasta 2024 y cada 15 minutos desde 2025 |
| `historico/generacion_diaria/AAAA.csv` | Generación de cada día por tecnología, en MWh, ámbito nacional |
| `historico/meteo_diaria_open_meteo/<punto>.csv` | Viento máximo, rachas, dirección dominante, radiación, temperatura media y lluvia de cada día en seis puntos |
| `manifiesto.json` | Cada serie con su fuente, endpoint, parámetros, rango, fecha de descarga, número de registros y el SHA-256 de cada CSV |
| `consultas/indice.json` | Índice de la caché: una entrada por consulta a REData, con su URL exacta, fecha de descarga y SHA-256 |
| `consultas/crudo/*.json.gz` | Cada respuesta de REData tal cual llegó, comprimida |
| `consultas/open_meteo/*.json.gz` | Las respuestas de Open-Meteo tal cual, comprimidas |
| `consultas/registro_descargas.csv` | Cada petición que se hizo, cuándo y con qué resultado |
| `herramientas/cache_ree.py` | La caché: devuelve la copia local si existe y solo descarga lo que falta |
| `herramientas/actualizar_historico.py` | Descarga solo lo que falta, con pausas, y rehace los CSV y el manifiesto |
| `herramientas/comprobar_con_esios.py` | Compara el PVPC de los CSV con el archivo 70 oficial de ESIOS, sin tocar la red |

Los CSV son derivados de las respuestas crudas, que son la fuente de verdad: si dudas de un CSV, bórralo y rehazlo con `--solo-csv`.

### Columnas

- **Precios:** `fecha_hora_local` (hora peninsular con su desfase, `+01:00` o `+02:00`), `fecha_hora_utc` y `eur_mwh`. Para pasar a €/kWh, divide entre 1000 (100 €/MWh son 0,10 €/kWh). Los días de cambio de hora tienen 23 o 25 filas; la hora UTC no se repite nunca.
- **Generación:** `fecha` y una columna por tecnología en MWh (`eolica_mwh`, `solar_fotovoltaica_mwh`, `hidraulica_mwh`, `nuclear_mwh`, `ciclo_combinado_mwh`...), con `generacion_total_mwh` al final. Una celda vacía es que REE no da esa tecnología ese día.
- **Meteo:** `fecha` y las variables diarias de Open-Meteo con su nombre original: `wind_speed_10m_max` y `wind_gusts_10m_max` (km/h), `wind_direction_10m_dominant` (grados), `shortwave_radiation_sum` (MJ/m²), `temperature_2m_mean` (°C) y `precipitation_sum` (mm). Los puntos y por qué se eligieron están en `manifiesto.json`.

## Comprobado contra ESIOS

El PVPC de los CSV coincide hora a hora con el archivo 70 oficial de ESIOS (columna PCB, península) en los ocho días que se guardaron en el estudio: 1-6-2021, 8-12-2025, 6-1-2026, 3-4-2026, 1-5-2026, 26-9-2026 (el del PVPC negativo), 8-10-2026 y 9-10-2026. Son 192 horas con diferencia cero. Para repetirlo sin tocar la red: `python3 datos/herramientas/comprobar_con_esios.py`.

## Cómo reciclar las consultas

Antes de pedir nada a REData, mira si ya está en la caché. Desde Python, en `datos/herramientas/`:

```python
from cache_ree import obtener

# Septiembre de 2026: sale de la caché sin tocar la red
d = obtener("mercados", "precios-mercados-tiempo-real",
            "2026-09-01T00:00", "2026-09-30T23:59", "hour")
```

`obtener` normaliza la consulta (fechas al minuto, parámetros ordenados), calcula su clave y, si está guardada, devuelve la copia local. Si no está, la descarga una vez, la guarda comprimida y la apunta en el índice. Los errores no se guardan.

Para aprovechar la caché, pide los mismos tramos que usa el histórico: meses naturales para los precios (del día 1 a las 00:00 al último día a las 23:59) y años naturales para la generación diaria. Un tramo distinto (por ejemplo, del 3 al 17) es otra consulta y saldría a la red. Si solo necesitas unos días, lee el CSV o pide el mes entero y recorta.

En terminal:

```bash
python3 datos/herramientas/cache_ree.py listar      # qué consultas hay guardadas
python3 datos/herramientas/cache_ree.py verificar   # comprueba los SHA-256 de todas
```

En el índice hay dos orígenes. `descarga` lleva la URL exacta que se pidió. `semilla_inferida` son respuestas reales del estudio del 9 de octubre de 2026 cuya URL no se apuntó y se dedujo del contenido (ver `archivo/estudio-2026-10-09/README.md`).

## Cómo actualizar sin saturar el servidor

```bash
python3 datos/herramientas/actualizar_historico.py --simular   # qué pediría, sin red
python3 datos/herramientas/actualizar_historico.py             # descarga solo lo que falta
```

El script recorre todos los tramos desde el inicio de cada serie y solo pide a la red los que no están en la caché, más el tramo en curso (el mes actual de precios, el año actual de generación), que refresca como mucho una vez cada 12 horas. Al día siguiente de una descarga completa, una actualización son dos o tres peticiones. Después rehace los CSV y el manifiesto.

Opciones: `--serie precios|generacion|meteo`, `--pausa` (segundos entre peticiones, 5 por defecto y nunca menos de 3), `--max-peticiones` (para repartir una descarga grande en varios días) y `--solo-csv` (no toca la red).

Solo usa la biblioteca estándar de Python 3.9 o superior.

## Regla de cortesía

REData es gratis, sin token y sin límite publicado. Que siga así depende de que no se abuse:

1. **Primero la caché y los CSV.** Lo que está aquí no se vuelve a pedir.
2. **Un mes como máximo por petición con paso horario** (el tope de REData es 31 días) y un año con paso diario.
3. **Una petición detrás de otra, nunca en paralelo, con varios segundos de pausa.** El script espera al menos 3 segundos (5 por defecto, más un poco al azar).
4. **Si falla, espera y no insistas.** Ante un 5xx, un 429 o sin respuesta, el script reintenta tras 30, 60 y 120 segundos. Ante un 400, reintenta una vez: en REData un 400 casi siempre significa que la consulta no tiene datos así, no que el servidor esté caído. Tras tres fallos seguidos, se para.
5. **Identíficate.** Las peticiones llevan un `User-Agent` con el nombre del proyecto y su enlace.
6. **No descargues lo que no necesitas.** La demanda cada 5 minutos ocupa unos 280 MB y aquí no está.

La descarga del 12 de octubre de 2026 cumplió estas reglas: cada petición y su resultado están en `consultas/registro_descargas.csv`.

## Qué no está, y por qué

- **Demanda cada 5 minutos (desde 2019):** unos 280 MB de descarga para un dato que conviene agregar a la hora. Si hace falta, mejor pedirla con `time_trunc=day` o agregada.
- **CO2 horario (desde 2014):** unas 154 peticiones y 22 MB más de descarga para una serie que no se está usando. Si algún día interesa, `cache_ree.py` sirve para pedirla mes a mes y guardarla.
- **Eólica y solar por horas:** REData no las da; están en ESIOS, con token.
- **Canarias, Baleares, Ceuta y Melilla:** REData no da su PVPC; hace falta ESIOS.

## Fuente, condiciones de uso y cómo citar

**Precios y generación:** Red Eléctrica (REE), [REData](https://www.ree.es/es/datos/apidatos). Según el [aviso legal de ree.es](https://www.ree.es/es/aviso-legal) (apartado 5.1), los contenidos y datos son de REE y se pueden publicar en una web o usar en materiales académicos con fines informativos y no comerciales, siempre que se cumplan cuatro condiciones:

1. Mencionar de forma clara a REE como fuente de la información y de los datos.
2. No alterar ni desnaturalizar el sentido de la información ni de los datos.
3. Mencionar la fecha de la última actualización.
4. No usar logotipos ni marcas de REE.

Por eso: estos datos **no** están bajo las licencias de este repositorio (MIT para el código, [`LICENSE`](../LICENSE), y CC BY 4.0 para la documentación, [`docs/LICENSE.md`](../docs/LICENSE.md)), no se pueden usar con fines comerciales sin autorización de REE, las respuestas crudas se guardan sin tocar y la fecha de última actualización que declara REE está en `manifiesto.json` (`ultima_actualizacion_declarada_por_ree`) y en cada respuesta (`last-update`). Para un uso que vaya más allá, consulta a REE.

Cita sugerida: *Datos: Red Eléctrica (REE), REData, https://www.ree.es/es/datos/apidatos, descargados el 12 de octubre de 2026.*

**Meteorología:** [Weather data by Open-Meteo.com](https://open-meteo.com/), con licencia [CC BY 4.0](https://open-meteo.com/en/licence). Se han pasado de JSON a CSV sin cambiar los valores.
