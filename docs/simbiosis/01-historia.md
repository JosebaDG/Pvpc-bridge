# Historia del proyecto: de mirar el precio a mano a un repositorio público

En cuatro días, del viernes 9 al lunes 12 de octubre de 2026, una costumbre manual (consultar cada noche el precio de la luz del día siguiente) se convirtió en un script, una guía práctica de la API de Red Eléctrica y un repositorio en GitHub. Esta es la cronología, con lo que hizo cada uno.

## Punto de partida

Joseba tiene contratado el PVPC, la tarifa regulada cuyo precio cambia cada hora. Cada noche, después de las 20:00, cuando Red Eléctrica publica los precios del día siguiente, miraba los precios a mano para decidir cuándo consumir.

La idea es sencilla y vale para cualquier hogar con PVPC: mover los consumos grandes que admiten espera (la lavadora, el lavavajillas, el termo, la carga del coche o un equipo que trabaja durante horas) a las horas más baratas. Con el precio cambiando cada hora, la diferencia dentro de un mismo día es enorme: el domingo 11 de octubre de 2026 el PVPC fue de prácticamente 0 a casi 29 céntimos el kWh, sin impuestos, según los datos de REData.

## Viernes 9 de octubre, mañana: la primera llamada

En una llamada de voz, Joseba propone a Charlie un proyecto de prueba en Python: sacar los precios horarios de Red Eléctrica y encontrar las horas más baratas. Dicta los requisitos:

- Un JSON con los mejores bloques de horas.
- Un filtro por precio máximo (por ejemplo, por debajo de 10 céntimos el kWh).
- Repartir un trabajo largo en varios bloques si no cabe en uno.
- Una gráfica diaria para compararla con la oficial y validar que los datos son correctos.

Y deja la decisión técnica en manos del agente. Charlie propone separar dos piezas: un **script puente** que hace el trabajo y devuelve JSON, y una **skill** (instrucciones guardadas para el asistente) que lo usa cuando Joseba pregunta.

Resultado de esa mañana: `precios_luz_ree.py` (el primer script, mínimo), `puente_luz.py` (el puente) y la primera gráfica. Charlie confirmó que la API REData de Red Eléctrica funciona sin token, y que en la prueba solo servía para la península.

## Primera corrección humana: la gráfica de "bloques de dos horas"

Joseba compara la gráfica con la oficial y ve algo raro: parece de bloques de dos horas, y el PVPC es horario. Charlie revisa el código y encuentra que los datos estaban bien (24 precios, uno por hora). El fallo era solo el eje, que ponía una marca cada dos horas. Se corrige: una barra por hora, con su precio encima y el eje desde cero.

Es el primer ejemplo de algo que se repite en todo el proyecto: **el agente produce, la persona valida contra la realidad**. Sin esa mirada, la gráfica habría seguido engañando.

## Viernes 9, mediodía: de la herramienta al estudio

Tras una conversación en casa surge otra pregunta: ¿hay relación entre la generación eólica y fotovoltaica y el precio de la luz? ¿Una borrasca de esta semana abarata la siguiente? Joseba no pide una funcionalidad nueva, pide **estudiar la API a fondo**: qué datos da, desde qué fecha, cuánto ocupan y qué límites tiene.

Charlie prueba todos los widgets de REData uno a uno y escribe un informe. Hallazgos principales:

- PVPC hora a hora desde el 1 de junio de 2021, mercado diario desde 2014, eólica y solar día a día desde 2011.
- Tope de 31 días por petición. Todo el PVPC desde 2021 son unos 12 MB de descarga.
- ESIOS tiene la generación hora a hora, pero pide token para pedir fechas.
- Trampa: desde 2024 el PVPC se calcula de otra forma ([Real Decreto 446/2023](https://www.boe.es/buscar/doc.php?id=BOE-A-2023-14048)), así que para estudiar el efecto del viento a lo largo de los años es mejor el precio del mercado diario.
- Un dato sospechoso: un PVPC negativo de -12,63 €/MWh el 26 de septiembre de 2026. Se marcó "por verificar" y más tarde se confirmó contra el archivo oficial de ESIOS: era real.
- Para el tiempo, Charlie añadió por su cuenta una fuente meteorológica abierta, [Open-Meteo](https://open-meteo.com/).

Y queda clara una idea: **correlación no es predicción**. Que los datos muestren un patrón no significa que sirvan para adivinar el precio de mañana. El ejercicio vale como ejercicio de programación y de minería de datos, no como oráculo.

Dos peticiones más salen de esa conversación:

- Un extracto para GitHub, un "manual de supervivencia" para que otros no tropiecen con las mismas piedras: es la [guía de la API](../guia-api-redata.md).
- Un archivo local, un "búnker de datos", con todas las respuestas y pruebas, para reciclar consultas y **no saturar el servidor de Red Eléctrica**.

## Después: contrato e impuestos

El script pasa de dar precios a dar euros de factura. Charlie separa todo lo que depende del hogar en `contrato.json` (privado, fuera del repositorio) y publica `contrato.ejemplo.json` con valores genéricos. Con una factura real se comprueba que el cálculo cuadra al céntimo, y el README crece hasta explicar de qué está hecho el precio de cada hora. Hoy ese contenido está en la [documentación técnica](../proyecto-precio-luz.md).

## Lunes 12 de octubre: rumbo a GitHub (y a un servidor MCP)

Se decide el siguiente paso grande: montar un **servidor MCP en Cloudflare Workers**, para que cualquier agente pueda consultar los precios. Joseba ya tiene cuenta en Cloudflare y la idea le convence. Pero antes hace falta algo más básico: que el código esté en GitHub.

Ahí llegan las fricciones (contadas en detalle en [Fricciones y aprendizajes](04-fricciones-y-aprendizajes.md)):

1. Subir desde el espacio de trabajo de Charlie con una URL que llevara un token dentro se descartó por seguridad.
2. Un intento con OAuth a través de Copilot fallaba.
3. Como salida provisional, Charlie entregó un *git bundle* de 38 KB. Sorprendió que pesara tan poco: el malentendido se aclaró enseguida, porque el histórico de datos aún no se había descargado y el repositorio solo tenía código y documentación.
4. Charlie y Miles no pueden hablar entre sí. Joseba hizo de puente, pegando los mensajes de uno al otro.

Fue Miles quien dio con la solución: una **GitHub App con *device flow***. Charlie pidió el código de dispositivo, Joseba lo autorizó en `github.com/login/device`, y Charlie hizo el primer push a `main`. Los detalles están en [Conectar GitHub con *device flow*](05-conectar-github-device-flow.md).

## Ese mismo lunes: documentar la simbiosis

Con el repositorio en marcha, Joseba lo dice claro: "ahora documentamos todo", "tiene que ser un proyecto formativo, que me sirva a mí y a la comunidad", "es la simbiosis la que hay que documentar". Y deja la forma en manos de los agentes: "sabéis ambos mejor que yo cómo exprimir la plataforma GitHub, yo os acompaño".

De ahí sale esta carpeta, la guía de iniciación a GitHub, las plantillas, las primeras issues y el primer pull request, que se revisa y fusiona a mano como parte del aprendizaje.
