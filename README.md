# Precio de la luz en España: horas baratas del PVPC con datos abiertos de Red Eléctrica

Este proyecto descarga el precio de la luz de cada hora desde la API abierta de Red Eléctrica (REE), lo pasa por un script puente que devuelve JSON y responde preguntas prácticas: cuáles son las horas más baratas, cuándo conviene lanzar un trabajo largo (por ejemplo, entrenar un modelo en una GPU de 600 W) y cuánto cuesta en euros de factura. También quiere servir para entender el mercado eléctrico español: de qué está hecho el precio de cada hora, por qué salta a las 8, a las 10 o a las 14, qué impuestos se pagan y cómo se lee una factura.

El punto de partida es un contrato doméstico real: PVPC con peaje 2.0TD en la península y 5,75 kW de potencia. Todo lo que depende del contrato está en un archivo de configuración, para que otra persona, o su agente de IA, lo adapte a su caso sin tocar el código.

Cómo leer este documento: cada afirmación lleva una de estas tres marcas.

- **[Verificado]**: comprobado en una fuente oficial (BOE, REE, ESIOS) o con datos reales descargados el 9 de octubre de 2026.
- **[Factura]**: valor tomado de una factura concreta (PVPC 2.0TD, del 18 de agosto al 15 de septiembre de 2026). Sirve de ejemplo; tu factura puede tener otros importes.
- **[Supuesto]**: decisión de diseño o simplificación que conviene revisar si cambia tu caso o la normativa.

## Archivos del proyecto

| Archivo | Qué es | ¿Se comparte? |
|---|---|---|
| `puente_luz.py` | Script puente: descarga, calcula y devuelve JSON por la salida estándar. Solo biblioteca estándar de Python (matplotlib solo para la gráfica). | Sí |
| `contrato.ejemplo.json` | Contrato genérico con los valores regulados de 2026 y comentarios en cada bloque. | Sí |
| `contrato.json` | Contrato del dueño del proyecto, sacado de su factura. Sin CUPS, nombre ni dirección, pero es personal. | No |
| `precios_luz_ree.py` | Primer script, más sencillo: horas baratas y mejor bloque. Se conserva como ejemplo mínimo. | Sí |
| `redata-api-red-electrica-guia.md` | Guía práctica de la API REData para GitHub: endpoints, límites, trampas, volumen de datos. | Sí |
| `informe_api_redata.md` | Informe completo de la exploración de la API (más largo que la guía). | Sí |
| `archivo_redata/` | Archivo local: respuestas reales guardadas, caché, páginas oficiales descargadas y herramientas. Tiene su propio README y es un repositorio git. | Revisar antes |
| Skill "Horas baratas de la luz" | Instrucciones para el asistente que usa el script cuando el usuario pregunta. | No aplica |

## Arquitectura

```
REData (REE, sin token)  ──►  puente_luz.py  ──►  JSON por stdout  ──►  otros scripts, agentes, cron
ESIOS archivo 70 (sin token) ─┘      ▲                                    (lanzar un entreno, avisar, graficar)
                                    │
                              contrato.json
           (tarifa, potencia, peajes y cargos, impuestos, festivos)
```

1. **Fuentes.** REData da el PVPC 2.0TD peninsular hora a hora (indicador 1001) y el mercado mayorista (indicador 600). El archivo 70 de ESIOS da el mismo PVPC desglosado en sus componentes. Ninguna de las dos pide token para esto. [Verificado]
2. **Script puente.** Cachea las respuestas en `~/.cache/puente_luz/`, calcula bloques, repartos y umbrales, y escribe un JSON con un código de salida claro: 0 si todo fue bien, 2 si los precios del día aún no están publicados y 1 si hubo otro error.
3. **Contrato.** Todo lo que cambia de un hogar a otro, o de un año a otro, vive en `contrato.json`. El script no tiene importes de factura escritos en el código.
4. **Consumidores.** Cualquier script o agente lee el JSON. Cada cifra de coste dice qué incluye y qué no (ver "Salida JSON").

## Uso rápido

```bash
python3 puente_luz.py resumen --dia hoy              # horas más baratas y más caras, media con y sin impuestos
python3 puente_luz.py bloque --horas 4 --gpu-w 600   # mejor bloque seguido desde ahora, en euros de factura
python3 puente_luz.py bloque --horas 4 --gpu-w 600 --sin-impuestos   # lo mismo, precio limpio
python3 puente_luz.py repartir --horas 10 --min 2 --max 4 --pausa 1 --potencia 750
python3 puente_luz.py umbral --max-precio 0.10       # franjas por debajo de 10 céntimos (precio publicado)
python3 puente_luz.py umbral --max-precio 0.10 --umbral-factura   # 10 céntimos ya con impuestos
python3 puente_luz.py precios --dia manana           # precio de cada hora, con periodo P1/P2/P3
python3 puente_luz.py grafica --dia hoy --salida pvpc.png
python3 puente_luz.py desglose --dia 2026-09-26      # de qué está hecho el precio de cada hora (ESIOS)
python3 puente_luz.py contrato --comprobar-factura   # factor de impuestos, fijos y la factura recalculada
```

Todos los subcomandos de cálculo aceptan `--dia hoy|manana|AAAA-MM-DD`, `--desde`, `--hasta` y `--contrato RUTA`. Los precios del día siguiente se publican hacia las 20:00 o 21:00, hora peninsular; antes de eso, `--dia manana` termina con código 2.

## El precio de la luz en España, sin mitos

### Qué pagas en una factura doméstica

Una factura de luz tiene dos partes de verdad y varios añadidos:

- **Término de potencia (fijo).** Pagas por cada kW contratado y por cada día, consumas o no. Incluye peajes de red, cargos del sistema y, en el PVPC, un margen de comercialización.
- **Término de energía (variable).** Pagas por cada kWh consumido. Aquí están el coste de producir la energía y, otra vez, peajes y cargos, ahora por kWh.
- **Añadidos.** La financiación del bono social (un importe por día), el alquiler del contador (por día), el impuesto especial sobre la electricidad y el IVA.

Mover el consumo de hora solo cambia el término de energía. Por eso el coste de un entreno que calcula el script no incluye potencia, bono social ni contador: esos importes se pagan igual hagas lo que hagas. [Supuesto, coherente con la factura]

### PVPC y mercado libre

- **PVPC (precio voluntario para el pequeño consumidor).** Es la tarifa regulada. Solo la ofrecen las comercializadoras de referencia, y el precio de la energía cambia cada hora según el mercado. Mucha gente la llama "tarifa de último recurso".
- **Mercado libre.** Cada comercializadora pone su precio: fijo todo el día, distinto por periodos (punta, llano y valle) o indexado al mercado con un margen. Los peajes y cargos son los mismos, pero normalmente van ya metidos dentro del precio por kWh que anuncian.

### De qué está hecho el precio de una hora del PVPC

El precio horario que publica REE para el PVPC 2.0TD (indicador 1001, "término de facturación de energía activa del PVPC 2.0TD") **ya incluye los peajes y cargos de energía del tramo de esa hora**. No incluye impuestos ni el término de potencia. [Verificado]

Cómo se ha comprobado: el archivo 70 de ESIOS da cada hora el total y sus componentes, y la suma de componentes coincide con el total (diferencia máxima de 0,02 €/MWh por redondeo) y con el valor de REData en las 24 horas. Uno de los componentes, "peajes y cargos" (TEU), vale exactamente lo que la factura desglosa como peajes más cargos de energía de cada periodo:

| Periodo | Peaje [Factura] | Cargo [Factura] | Suma | Componente TEU en ESIOS, 9/10/2026 |
|---|---|---|---|---|
| P1 punta | 0,033261 €/kWh | 0,064292 €/kWh | 0,097553 €/kWh | 97,55 €/MWh |
| P2 llano | 0,016409 €/kWh | 0,012858 €/kWh | 0,029267 €/kWh | 29,27 €/MWh |
| P3 valle | 0,000077 €/kWh | 0,003215 €/kWh | 0,003292 €/kWh | 3,29 €/MWh |

**Para no sumar peajes dos veces:** si trabajas con el precio horario de REE, ya llevas dentro peajes y cargos. La factura los separa en líneas propias y llama "coste de la energía" a lo que queda (precio de REE menos peajes y cargos). Son dos maneras de presentar el mismo dinero. En el script, los peajes y cargos de energía del contrato solo se usan para explicar la factura, para comprobar que ESIOS sigue cuadrando y para tarifas de mercado libre cuyo precio no los incluya.

Los componentes que da ESIOS para cada hora son estos (nombres de los indicadores de ESIOS; la correspondencia con las siglas del archivo es por nombre) [Verificado]:

| Sigla | Componente | Qué es, en pocas palabras |
|---|---|---|
| PMH | Mercado diario e intradiario | El precio de la energía en el mercado mayorista ("el pool"). |
| SAH | Servicios de ajuste | Lo que cuesta mantener el sistema equilibrado en tiempo real. |
| TAH | Término de ajuste de mercados a plazo | La parte de futuros que introdujo el RD 446/2023 (ver más abajo). Puede ser negativa. |
| TEU | Peajes y cargos | Redes (peajes, los fija la CNMC) y costes del sistema (cargos, los fija el Ministerio). Depende del periodo. |
| CCV | Coste de comercialización variable | Parte del margen del comercializador que va por kWh. |
| PCAP | Pago por capacidad | Pago a centrales de respaldo. En 2.0TD solo pesa en P1 y P2. |
| FOM, FOS, INT, EDSR | Financiación del operador del mercado y del sistema, interrumpibilidad, excedente o déficit de las subastas renovables | Pequeños, del orden de 0,3 €/MWh entre todos. |

Ejemplo real del viernes 9 de octubre de 2026, en €/kWh sin impuestos (salida de `desglose`):

| Hora | Periodo | Precio REE | Mercado | Ajuste futuros | Peajes y cargos | Con impuestos |
|---|---|---|---|---|---|---|
| 03-04 | P3 | 0,1773 | 0,1615 | -0,0162 | 0,0033 | 0,2255 |
| 13-14 | P1 | 0,1196 | -0,0002 | -0,0157 | 0,0976 | 0,1521 |
| 14-15 | P2 | 0,0514 | -0,0002 | -0,0160 | 0,0293 | 0,0654 |
| 20-21 | P1 | 0,3505 | 0,2303 | -0,0159 | 0,0976 | 0,4458 |

Tres lecciones de esta tabla:

- **El salto de las 14:00 es casi todo peaje.** De 13-14 a 14-15 el precio baja 0,0682 €/kWh, y 0,0683 son peajes y cargos que pasan de punta a llano. La energía apenas cambia.
- **El valle no siempre es lo más barato.** Ese día, la madrugada en valle (entre 0,17 y 0,23 €/kWh) fue más cara que el mediodía en punta (0,12) porque a mediodía la solar hunde el mercado. La media de P3 fue 0,1892 €/kWh y la de P1, 0,2229.
- **El pool estuvo en negativo y el PVPC no.** Entre las 11 y las 17 el mercado marcó unos -0,2 €/MWh, pero el PVPC se quedó en 0,05-0,12 €/kWh porque encima van servicios de ajuste, peajes y cargos.

### Los tramos 2.0TD y sus saltos

El peaje 2.0TD (consumidores de hasta 15 kW) divide la energía en tres periodos (Circular de la CNMC 3/2020, artículo 7). [Verificado]

| Periodo | Lunes a viernes laborables (península, Baleares y Canarias, hora local) | Ceuta y Melilla |
|---|---|---|
| P1 punta | 10-14 y 18-22 | 11-15 y 19-23 |
| P2 llano | 8-10, 14-18 y 22-24 | 8-11, 15-19 y 23-24 |
| P3 valle | 0-8 | 0-8 |

Sábados, domingos, el 6 de enero y los festivos nacionales de fecha fija son valle las 24 horas. Los festivos autonómicos y locales no cuentan, y tampoco los nacionales sin fecha fija, como el Viernes Santo. [Verificado: la Circular dice "festivos de ámbito nacional, definidos como tales en el año en curso, con exclusión tanto de los festivos sustituibles como de los que no tienen fecha fija", y en ESIOS los peajes y cargos son de valle todo el día el 8 de diciembre de 2025, el 6 de enero de 2026 y el 1 de mayo de 2026, y no lo son el Viernes Santo, 3 de abril de 2026.]

El script usa esta lista de festivos de valle, editable en `calendario.festivos_valle` del contrato: 1 de enero, 6 de enero, 1 de mayo, 15 de agosto, 12 de octubre, 1 de noviembre, 6, 8 y 25 de diciembre. [Supuesto: es la lista habitual; el calendario laboral del BOE de cada año puede marcar alguno como sustituible.] El lunes 12 de octubre de 2026 es Fiesta Nacional, así que ese día entero va en valle.

La potencia tiene solo dos periodos en 2.0TD: P1 (punta y llano, de 8 a 24 en laborables) y P2 (valle). Por eso la factura muestra potencia "P1" y "P2", y energía "P1", "P2" y "P3".

Los peajes y cargos cambian normalmente cada año: el componente de peajes y cargos de valle era 2,99 €/MWh el 8 de diciembre de 2025 y es 3,29 €/MWh en 2026. [Verificado en ESIOS]

### Futuros desde 2024: el RD 446/2023

Hasta 2023, la energía del PVPC seguía solo al mercado diario. El Real Decreto 446/2023 metió una parte de mercados a plazo (futuros) para suavizar el precio: el 25 % en 2024, el 40 % en 2025 y el 55 % a partir de 2026. El resto sigue al mercado diario e intradiario. [Verificado en el BOE]

En la fórmula del real decreto, el término de ajuste es TaE = (A − 1) · Pma + B · Ft, donde Pma es la media del mercado diario e intradiario del día, Ft el precio de los futuros, y en 2026 A = 0,45 y B = 0,55. En la práctica, cada día se resta el 55 % de la media diaria del mercado y se suma el 55 % del precio de futuros, casi la misma cantidad en todas las horas del día. [Verificado en el BOE y en ESIOS: el ajuste fue -0,0157 a -0,0164 €/kWh en todas las horas del 9 de octubre.]

Dos consecuencias prácticas:

- Al comparar años, el PVPC de 2024 en adelante no es comparable con el de antes. Para estudiar el efecto del viento o del sol en los precios es mejor mirar el mercado diario (indicador 600 de REData).
- Un día con la media del mercado alta y futuros baratos, el ajuste es muy negativo y arrastra hacia abajo todas las horas, también las que ya estaban cerca de cero.

### Precios negativos

- **Pool negativo:** real y cada vez más normal en horas de mucha solar o eólica. Significa que algunos generadores prefieren pagar a parar. Suele ser poco negativo (unos pocos €/MWh).
- **PVPC final negativo:** raro, porque encima del mercado van servicios de ajuste, peajes, cargos y comercialización. Pero puede pasar. El sábado 26 de septiembre de 2026 el PVPC fue negativo de 11 a 17 h, con un mínimo de -12,63 €/MWh (-0,01263 €/kWh) entre las 14 y las 15. Lo dan igual REData y el archivo oficial de ESIOS, hora por hora. [Verificado]

Por qué ocurrió ese día: era sábado (todo valle, peajes y cargos de solo 0,0033 €/kWh), el mercado a mediodía estaba casi a cero (0,0006 €/kWh a las 14) y el ajuste de futuros restó 0,046 €/kWh en todas las horas, porque la media del mercado de ese día fue alta (150 €/MWh). Los servicios de ajuste (0,026) y el resto no llegaron a compensarlo. [Verificado: componentes de ESIOS. La lectura de que los futuros estaban por debajo de la media diaria es una deducción a partir de la fórmula.]

En la factura, una hora negativa reduce el importe de la energía, y los impuestos se calculan sobre el total del periodo, no hora a hora. El script multiplica también los costes negativos por el factor de impuestos, lo que es correcto mientras el total de la factura sea positivo. [Supuesto]

### Impuestos

- **Impuesto especial sobre la electricidad:** 5,11269632 %. La base es la del IVA sin el propio impuesto (Ley 38/1992, artículos 97 y 99). La cuota no puede bajar de 1 €/MWh en usos domésticos (0,5 €/MWh en usos industriales); con precios normales ese mínimo no entra en juego. [Verificado en el BOE]
- **Qué entra en su base en la factura:** potencia, energía y bono social; el alquiler del contador queda fuera. Con esa base, la factura de ejemplo cuadra al céntimo; sin el bono social en la base, sale 64,06 €, 5 céntimos por debajo. [Factura]
- **IVA:** 21 % sobre todo lo anterior más el impuesto eléctrico y el contador. [Factura] En Canarias no hay IVA sino IGIC, y en Ceuta y Melilla, IPSI. [Supuesto: comprueba el tipo en tu factura.]
- **Factor para la energía:** cada euro de energía sin impuestos acaba costando (1 + 0,0511269632) × (1 + 0,21) = **1,27186** euros en la factura. Ese es el factor que usa el script por defecto. [Verificado: cálculo con los tipos legales]

## Ejemplo práctico: una factura real, línea a línea

Factura anonimizada de la comercializadora de referencia: PVPC 2.0TD, del 18 de agosto al 15 de septiembre de 2026 (29 días), 5,75 kW en P1 y P2, 252 kWh (53 en P1, 90 en P2 y 109 en P3, un 43 % en valle). Total: 64,11 €. [Factura]

`python3 puente_luz.py contrato --comprobar-factura` la recalcula línea a línea, redondeando cada línea a céntimos como hace la factura, y llega a los mismos 64,11 €:

| Concepto | Cálculo | Importe |
|---|---|---|
| Potencia P1, peajes | 5,75 kW × 29 d × 0,063904 | 10,66 € |
| Potencia P1, cargos | 5,75 × 29 × 0,011999 | 2,00 € |
| Potencia P2, peajes | 5,75 × 29 × 0,001216 | 0,20 € |
| Potencia P2, cargos | 5,75 × 29 × 0,000772 | 0,13 € |
| Margen de comercialización fijo | 5,75 × 29 × 0,008529 | 1,42 € |
| **Total potencia** | | **14,41 €** |
| Energía, peajes | 53 × 0,033261 + 90 × 0,016409 + 109 × 0,000077 | 1,76 + 1,48 + 0,01 € |
| Energía, cargos | 53 × 0,064292 + 90 × 0,012858 + 109 × 0,003215 | 3,41 + 1,16 + 0,35 € |
| Coste de la energía | 252 kWh × 0,104643 (media ponderada) | 26,37 € |
| **Total energía** | | **34,54 €** |
| Financiación del bono social | 29 d × 0,024688 | 0,72 € |
| Impuesto eléctrico | 5,11269632 % × (14,41 + 34,54 + 0,72) | 2,54 € |
| Alquiler del contador | 29 d × 0,02663 | 0,77 € |
| Subtotal sin IVA | | 52,98 € |
| IVA | 21 % × 52,98 | 11,13 € |
| **Total** | | **64,11 €** |

Qué se aprende de ella:

- **Unos 20,87 € de cada 30 días son fijos** (potencia, bono social y contador, con impuestos) aunque no se consuma nada. De ellos, el que depende de una decisión tuya es la potencia contratada.
- **El kWh medio, con todo, salió a 0,254 €.** El coste marginal de un kWh extra es menor que eso, porque la parte fija ya está pagada: es el precio de esa hora × 1,27186.
- **El "coste de la energía" de la factura (0,104643 €/kWh) no es el precio que ves en la web de REE.** Es la media, ponderada con tu consumo, del precio de REE menos peajes y cargos. Si sumas peajes, cargos y coste de la energía de cada periodo, vuelves al precio de REE.

## Configuración: contrato.json

El script busca el contrato en este orden: `--contrato RUTA`, la variable de entorno `PUENTE_LUZ_CONTRATO`, `contrato.json` junto al script y, si no hay, `contrato.ejemplo.json` (y lo avisa). Las claves que empiezan por `_` son comentarios. Todos los importes van sin impuestos, como en el desglose de la factura.

| Bloque | Claves | Para qué lo usa el script |
|---|---|---|
| `tarifa` | `tipo` (`pvpc`, `fijo`, `periodos`), `peaje` (`2.0TD`), `sistema` (`peninsula`, `baleares`, `canarias`, `ceuta_melilla`) | De dónde sale el precio y qué horario de periodos aplica. |
| `energia` | `precio_fijo_eur_kwh`, `precio_periodos_eur_kwh` (P1, P2, P3), `incluye_peajes_cargos` | Solo para mercado libre. Si `incluye_peajes_cargos` es false, el script suma los peajes y cargos del bloque siguiente. |
| `potencia` | `contratada_kw`, `peajes_eur_kw_dia`, `cargos_eur_kw_dia`, `margen_comercializacion_eur_kw_dia` | Costes fijos y comprobación de la factura. No afecta a qué hora es mejor. |
| `peajes_cargos_energia_eur_kwh` | `peajes` y `cargos` por periodo | Explicar la factura, avisar si ESIOS deja de cuadrar y completar precios de mercado libre. En PVPC no se suman al precio. |
| `otros_fijos` | `bono_social_eur_dia`, `alquiler_contador_eur_dia` | Costes fijos y factura. |
| `impuestos` | `impuesto_electrico`, `impuesto_electrico_minimo_eur_mwh`, `impuesto_electrico_base`, `iva` | Factor de impuestos de todos los costes y factura. |
| `calendario` | `festivos_valle` (MM-DD), `festivos_valle_extra` (MM-DD o AAAA-MM-DD) | Qué días laborables van enteros en valle. |
| `factura_referencia` | `dias`, `kwh` por periodo, `coste_energia_medio_eur_kwh`, `total_factura_eur` | Prueba de que el contrato está bien: `contrato --comprobar-factura` debe dar tu total. |

## Cómo adaptarlo a otro contrato

- **Otra potencia (PVPC):** cambia `potencia.contratada_kw` y, si tu factura trae otros importes, `otros_fijos`. Las horas baratas no cambian; solo los fijos.
- **Mercado libre con precio fijo:** `tarifa.tipo = "fijo"` y `energia.precio_fijo_eur_kwh`. El script ya no necesita a REE para decidir: con un precio fijo todas las horas cuestan lo mismo, así que el mejor bloque es el primero que quepa. Sirve para comparar con el PVPC.
- **Mercado libre por periodos:** `tarifa.tipo = "periodos"` y los tres precios en `energia.precio_periodos_eur_kwh`. El mejor bloque será el de más horas de valle.
- **Precio indexado al mercado:** no está implementado, porque cada comercializadora usa su fórmula. Se puede añadir un `tipo` nuevo en `_tramos_contrato()` que lea el mercado diario (serie `spot`) y aplique tu fórmula.
- **Baleares y Canarias:** REData solo se ha probado para la península. El archivo 70 de ESIOS trae el PVPC 2.0TD en dos columnas, PCB y CYM; por el nombre, PCB sería Península, Canarias y Baleares, y CYM, Ceuta y Melilla. [Supuesto pendiente de verificar] Para indicadores de generación por horas en los sistemas no peninsulares hace falta la API de ESIOS con token personal (cabecera `x-api-key`). En Canarias, ajusta también el impuesto indirecto (IGIC).
- **Ceuta y Melilla:** `tarifa.sistema = "ceuta_melilla"` cambia el horario de periodos, y `desglose` lee la columna CYM.
- **Peaje 3.0TD (más de 15 kW) u otros:** no soportado. Tiene seis periodos y temporadas; habría que ampliar `periodo_2_0td()`.

## Para agentes de IA: adaptar sin fricción

Esta sección es para el asistente que tenga que mantener o adaptar el proyecto.

**Dónde está cada cosa en `puente_luz.py`:**

- Contrato: `cargar_contrato()`, `CONTRATO_DEFECTO` (valores si no hay archivo), `factor_impuestos()`, `importes()` (qué incluye cada cifra).
- Periodos: `HORARIOS_2_0TD`, `ZONA_SISTEMA`, `periodo_2_0td()`.
- Precios: `tramos_dia()` (REData con caché), `_tramos_contrato()` (mercado libre), `ventana()`.
- Cálculos: `bloque_consecutivo()`, `repartir()`, `franjas_bajo_umbral()`, `resumen_dia()`, `precios()`.
- Factura: `estimar_factura()`, `resumen_contrato()`. Componentes oficiales: `desglose_esios()`.

**Salida JSON:** las claves que ya existían no han cambiado de nombre ni de significado estructural. En `bloque`, `repartir` y `umbral`:

- `coste_estimado_eur` y `precio_medio_eur_kwh` van en el modo pedido: por defecto **euros de factura** (con impuesto eléctrico e IVA). Hasta el 9 de octubre de 2026 iban sin impuestos; un script que lo dé por hecho debe añadir `--sin-impuestos`.
- `coste_sin_impuestos_eur` y `coste_con_impuestos_eur` están siempre, sea cual sea el modo.
- `importes` dice el modo (`factura`, `limpio` o `factor_manual`), el factor, y las listas `incluye` y `no_incluye`. `nota_costes` lo resume en una frase.
- `energia_por_periodo_kwh` reparte el consumo del bloque por P1, P2 y P3.
- En `umbral`, `umbral_comparado_con` dice si `--max-precio` se comparó con el precio publicado (por defecto) o con el de factura (`--umbral-factura`).
- En `precios` y `resumen`, `eur_kwh` sigue siendo el precio publicado por REE, sin impuestos; se añaden `periodo` y `eur_kwh_con_impuestos`.

**Supuestos del código:**

- El precio de REE ya lleva peajes y cargos; nunca se suman encima en PVPC.
- Los costes de entreno son marginales: sin potencia, bono social ni contador.
- El consumo se trata como constante durante el trabajo: `--potencia` (vatios del equipo entero) o `--gpu-w` más `--resto-w`. Con solo `--gpu-w`, el coste real será algo mayor y el JSON lo avisa.
- El mínimo del impuesto eléctrico (1 €/MWh) solo se aplica en `estimar_factura()`, no hora a hora.
- Horas en hora peninsular (Europe/Madrid), con los días de 23 y 25 horas resueltos.

**Qué comprobar cuando cambie la normativa (normalmente en enero):**

1. Ejecuta `python3 puente_luz.py desglose --dia hoy`. Si `avisos` dice que los peajes y cargos de ESIOS no cuadran con el contrato, actualiza `peajes_cargos_energia_eur_kwh` con los nuevos valores (la orden de peajes de la CNMC y la de cargos del Ministerio, o la primera factura del año).
2. Actualiza también los peajes y cargos de potencia, el margen de comercialización, el bono social y el contador con la primera factura del año, y pon esa factura en `factura_referencia`. `contrato --comprobar-factura` debe dar `"cuadra": true`.
3. Revisa los tipos de `impuestos` (el impuesto eléctrico y el IVA de la electricidad han tenido rebajas temporales en años anteriores).
4. Revisa el calendario laboral del BOE y añade a `festivos_valle_extra` lo que haga falta.
5. Si cambia la fórmula del PVPC (como en 2024), el script sigue funcionando porque usa el precio final de REE, pero la sección de futuros de este README habrá quedado vieja.
6. Si REData cambia de formato, falla `tramos_dia()`; compara con el archivo 70 de ESIOS.

**Pruebas mínimas tras cualquier cambio:** `precios`, `resumen`, `bloque`, `repartir`, `umbral`, `grafica`, `contrato --comprobar-factura` y `desglose` sobre un día pasado y fijo (por ejemplo `--dia 2026-10-09 --desde 00:00`), comparando con la salida anterior. `bloque ... --sin-impuestos` debe dar lo mismo que la versión antigua sin `--impuestos`.

## Relación con los otros documentos

- `redata-api-red-electrica-guia.md` es la guía de la API para compartir en GitHub. Este README es el del proyecto que la usa; la guía enlaza aquí para lo relativo a tarifas, tramos e impuestos.
- `informe_api_redata.md` es el informe largo de la exploración de la API. Se conserva tal cual, como registro.
- `archivo_redata/` guarda las pruebas: respuestas de REData, el archivo 70 de ESIOS de los días usados en este README (`respuestas/esios/archivo70/`) y las páginas del BOE consultadas (`paginas/`). Tiene su propio README.

## Qué se publica y qué no

Para un repositorio público: `README.md`, `puente_luz.py`, `precios_luz_ree.py`, `contrato.ejemplo.json` y la guía de la API. No publiques `contrato.json` (añádelo a `.gitignore`) ni la caché. Las facturas nunca: llevan CUPS, nombre y dirección. Los importes de la factura de ejemplo de este README no identifican a nadie.

## Pendiente de verificar

- Que la columna PCB del archivo 70 de ESIOS sea válida para Baleares y Canarias, y a qué hora local se aplica en Canarias.
- Que el lunes 12 de octubre de 2026 salga en valle todo el día en ESIOS (se podrá ver con `desglose` en cuanto se publique, la tarde del 11).
- El margen de comercialización fijo (0,008529 €/kW·día), el bono social (0,024688 €/día) y el contador (0,02663 €/día) se han tomado de la factura; no se han contrastado con su norma.
- La metodología completa del PVPC no se ha revisado más allá del término de futuros del RD 446/2023; los componentes y sus valores sí están comprobados en ESIOS.

## Fuentes oficiales

- [REData, API de datos de Red Eléctrica](https://www.ree.es/es/datos/apidatos): precios por hora, sin token.
- [PVPC en ESIOS](https://www.esios.ree.es/es/pvpc) y [API de ESIOS](https://api.esios.ree.es/): gráfica oficial, archivo 70 con el desglose y petición de token.
- [Circular 3/2020 de la CNMC](https://www.boe.es/buscar/act.php?id=BOE-A-2020-1066): metodología de peajes y periodos horarios (artículo 7).
- [Real Decreto 446/2023](https://www.boe.es/buscar/doc.php?id=BOE-A-2023-14048): futuros en el PVPC (25 %, 40 % y 55 %).
- [Ley 38/1992 de Impuestos Especiales](https://www.boe.es/buscar/act.php?id=BOE-A-1992-28741): impuesto sobre la electricidad (artículos 97 y 99).
