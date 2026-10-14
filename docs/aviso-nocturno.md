# Aviso nocturno con las horas baratas de mañana

Cada noche a las 21:30, hora peninsular, Charlie manda por el chat de Sesame una imagen con los precios de mañana y un mensaje de tres líneas como mucho:

```
Mañana (martes 13/10), bloque más barato: 11:00-17:00 · 6 h · media 0,045 €/kWh con impuestos.
La hora más cara, 20:00-21:00, a 0,39 €/kWh.
Mañana se espera mucho sol. En los 49 días así de estas fechas desde 2024, de 12 a 16 h la luz se quedó en torno a 0,12 €/kWh, frente a 0,15 en los días grises.
```

(Las cifras son de ejemplo.) Sirve para mover consumos grandes o flexibles al mejor momento del día siguiente: la lavadora, el lavavajillas, el termo, la carga del coche o cualquier equipo que trabaje durante horas. Se pidió en el issue #4.

## Cómo funciona

```
21:30 (Europe/Madrid)  schedule de Sesame
        │
        ▼
skill "Aviso nocturno de horas baratas"  ──►  python3 aviso_nocturno.py
        │                                          │
        │                       1 petición a REData (PVPC de mañana, con caché)
        │                       1 petición a Open-Meteo (previsión de mañana, con caché)
        │                       histórico de datos/ (sin red)
        │                                          │
        ◄──────────── JSON con el mensaje + imagen PNG
        │
        ▼
mensaje de Charlie en el chat de Sesame, con la imagen
```

1. **Precios.** `aviso_nocturno.py` usa `puente_luz.py` para pedir a REData el PVPC peninsular de mañana, hora a hora. Es una sola petición y queda en la caché de siempre (`~/.cache/puente_luz/`). REE los publica hacia las 20:15; a las 21:30 lo normal es que ya estén.
2. **Bloque más barato.** Son las horas seguidas alrededor del precio más bajo del día que no se alejan de él más de un 15 % del recorrido del día (de la hora más barata a la más cara), con un margen mínimo de medio céntimo. Si salen varios tramos así (por ejemplo, la madrugada y el mediodía), gana el de precio medio más bajo. Así la duración la marca el propio día: un mediodía de sol con precios a cero da un bloque largo, y un día sin un valle claro da uno corto.
3. **Conclusión curiosa.** Explicada abajo.
4. **Imagen.** La gráfica de siempre (una barra por hora, de 00-01 a 23-00, con su precio, el eje desde 0 y sin cortar picos), con el bloque más barato sombreado y recuadrado. Arriba van, en letra grande, el bloque, lo que dura, su precio medio y la hora más cara, y debajo, la conclusión. Mide 1350 × 1650 píxeles, en vertical, para leerse en el móvil sin ampliar.
5. **Mensaje.** El JSON trae el texto listo para mandar (`mensaje`) y la ruta de la imagen (`imagen`).

**Precios con impuestos por defecto**, como el resto del proyecto: precio de REE × (1 + impuesto eléctrico) × (1 + IVA), con los tipos de `contrato.json` (o de `contrato.ejemplo.json` si no hay). No incluye el término de potencia, que se paga igual a cualquier hora. Con `--sin-impuestos` salen los precios tal cual los publica REE, para compararlos con su gráfica.

## La conclusión curiosa: correlación, no previsión

La previsión de mañana de Open-Meteo, en los seis puntos de `datos/manifiesto.json` (Lugo, Burgos, Zaragoza, Albacete, Badajoz y Bilbao), se cruza con el histórico de `datos/`: el tiempo observado en esos mismos puntos y los precios de esos días. Se comparan siempre **días de la misma época del año**, del 30 días antes al 30 días después de la fecha, en cada año.

Conclusiones posibles:

| Clave | Cuándo | Qué dice |
|---|---|---|
| `viento_pvpc` | Mañana se espera mucho viento (tercio más ventoso de esas fechas) | Cuánto más barata salió la luz, de media, en los días así desde 2024 que en el tercio con menos viento |
| `viento_spot` | Igual | Lo mismo con el mercado mayorista desde 2014, comparado dentro de cada año |
| `sol_centrales` | Mañana se espera mucho sol (tercio con más radiación) | En torno a qué precio se quedaron las horas de 12 a 16 en esos días desde 2024, frente a los días grises |
| `lluvia_pvpc` | Mañana se espera lluvia (tercio más lluvioso y al menos 2 mm) | Cuánto más barata o cara salió la luz en los días lluviosos desde 2024 que en los secos |
| `bloque_ranking` | El bloque de mañana está entre el 25 % mejor o el 25 % peor de esas fechas desde 2024 | Qué parte de esos días tuvo un bloque de la misma duración más barato |

Reglas para no inventar nada:

- **PVPC solo desde 2024.** El [Real Decreto 446/2023](https://www.boe.es/buscar/doc.php?id=BOE-A-2023-14048) cambió cómo se calcula el PVPC, así que los años anteriores no son comparables. El mercado mayorista sí se compara desde 2014, pero cada día se mide frente a la media de su propio año, para que 2022 no lo distorsione todo.
- **Listón de solidez.** Una conclusión solo sale si hay al menos 20 días parecidos en cada grupo, si la diferencia pasa del 8 % y si va en el mismo sentido en la mayoría de los años. Si ninguna pasa el listón, el aviso sale sin conclusión.
- **Se dice cuántos días hay detrás** y se cuenta en pasado ("salió", "se quedó"). No es una previsión del precio de mañana.
- **Rota.** Si varias valen, sale la que lleva más tiempo sin salir. Lo que ha salido se apunta en `~/.cache/puente_luz/aviso/conclusiones_usadas.json`.
- **Solo los casos de "mucho".** La previsión de Open-Meteo y su histórico (reanálisis) no son el mismo modelo. Comparados del 28 de septiembre al 5 de octubre de 2026, la previsión dio de media algo menos de viento (−1,3 km/h, un 8 %) y de radiación (−1 MJ/m²) que el histórico. Con ese sesgo, decir "mañana hace mucho viento" queda del lado prudente; decir "mañana hace poco viento" no, así que esos casos no se usan.

## Cortesía con los servidores

- **REData:** una petición por noche. Si los precios de mañana aún no están, el script termina con código 2 sin pedir nada a Open-Meteo, y el skill reintenta como mucho tres veces más, con 9 minutos de pausa. Si siguen sin salir, manda un aviso breve diciéndolo. Fuera de Sesame, `--reintentos 3 --pausa-min 15` hace lo mismo dentro del script (pausa mínima de 5 minutos).
- **Open-Meteo:** una petición por noche para los seis puntos a la vez, guardada en `~/.cache/puente_luz/aviso/`. Si falla, el aviso sale igual y solo se usa `bloque_ranking`, que no necesita previsión.
- **Histórico:** se lee de los CSV de `datos/`, sin tocar la red.

## Uso

```bash
python3 aviso_nocturno.py                                   # mañana; imagen en ./aviso_AAAA-MM-DD.png
python3 aviso_nocturno.py --dia hoy --salida /tmp/hoy.png --sin-estado   # prueba con hoy, sin apuntar la conclusión
python3 aviso_nocturno.py --sin-impuestos                   # precios publicados por REE
python3 aviso_nocturno.py --sin-conclusion                  # sin previsión ni cruce de datos
```

Códigos de salida: 0 si todo fue bien, 2 si los precios aún no están publicados (el JSON trae en `mensaje` el aviso breve) y 1 si hubo otro error. `PVPC_DATOS` cambia la carpeta del histórico (por defecto, `datos/` junto al script).

## Cómo está montado en Sesame

- **Skill propio de Charlie, "Aviso nocturno de horas baratas":** ejecuta el script desde una copia estable fuera del repositorio (con `puente_luz.py`, el histórico de `datos/historico/` y el `contrato.json` privado, que no se sube), reintenta si los precios no han salido y manda el mensaje con la imagen.
- **Schedule diario a las 21:30, zona `Europe/Madrid`** (cron `30 21 * * *`), que ejecuta ese skill.
- Cuando se cambie el script en `main`, hay que copiar la nueva versión a esa copia estable.

## Pendiente

- Una semana de avisos comparados con la [gráfica oficial de ESIOS](https://www.esios.ree.es/es/pvpc), como pide el #4.
- Solo península: Canarias, Baleares, Ceuta y Melilla necesitan ESIOS con token.
- El histórico de tiempo acaba el 5 de octubre de 2026. Para que la comparación siga al día conviene actualizarlo de vez en cuando con `datos/herramientas/actualizar_historico.py --serie meteo`.

Datos: Red Eléctrica (REE), [REData](https://www.ree.es/es/datos/apidatos). Tiempo: [Open-Meteo](https://open-meteo.com/), CC BY 4.0.
