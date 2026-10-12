# Pvpc-bridge: precio de la luz hora a hora, hecho entre una persona y dos agentes de IA

Pvpc-bridge descarga el precio de la luz de cada hora (PVPC) desde la API abierta de Red Eléctrica, lo pasa por un script puente que devuelve JSON y responde preguntas prácticas: cuáles son las horas más baratas, cuándo conviene poner un consumo grande o flexible (la lavadora, el lavavajillas, el termo, la carga del coche o un equipo que trabaja durante horas) y cuánto cuesta en euros de factura. Además dibuja la gráfica del día, pensada para mandarla a un chat con un texto corto que la explique a una persona.

La meta es tener una navaja suiza del mercado eléctrico español: precios, costes, impuestos y avisos para gastar mejor la energía, con datos abiertos y sin depender de nadie.

Pero este repositorio quiere enseñar algo más que un script. Es un **proyecto formativo** que documenta **la simbiosis**: cómo trabajan juntos una persona y dos agentes de IA de Sesame para sacar adelante un proyecto real, desde una idea en una llamada de voz hasta un repositorio con issues, ramas y pull requests. Lo hemos escrito para aprender nosotros y para que le sirva a quien quiera trabajar así.

## Quién hace qué

| Quién | Qué es | Su papel |
|---|---|---|
| **Joseba** ([@JosebaDG](https://github.com/JosebaDG)) | La persona | Tiene la necesidad, decide, valida los resultados y fusiona. |
| **Charlie** | Agente de Sesame con un espacio de trabajo Linux en la nube | Escribe y ejecuta el código, consulta las APIs, documenta y sube los cambios. |
| **Miles** | Agente de Sesame | Propone soluciones, revisa los PR de Charlie y se encarga de todo lo visual (gráficas, imágenes, capturas), porque Charlie no ve imágenes. Encontró la forma de conectar el espacio de trabajo con GitHub (una GitHub App con *device flow*). |

Charlie y Miles no hablan directamente: se coordinan por escrito en el [tablón de coordinación (#11)](https://github.com/JosebaDG/Pvpc-bridge/issues/11), y la persona lo lee y decide. Así ninguna decisión se toma entre agentes sin que ella la vea, y lo que hace uno lo revisa el otro. Las reglas completas están en [Roles y reglas](docs/simbiosis/02-roles-y-reglas.md).

## Por dónde empezar

**Si te interesa la simbiosis** (cómo trabajar con agentes de IA):

1. [La historia del proyecto](docs/simbiosis/01-historia.md), día a día.
2. [Roles y reglas de colaboración](docs/simbiosis/02-roles-y-reglas.md).
3. [El flujo de trabajo en GitHub](docs/simbiosis/03-flujo-github.md): ramas, PR, revisión humana e issues.
4. [Fricciones y aprendizajes](docs/simbiosis/04-fricciones-y-aprendizajes.md): lo que falló y cómo se resolvió.
5. [Cómo se conectó GitHub con *device flow*](docs/simbiosis/05-conectar-github-device-flow.md), sin secretos.
6. [Cómo replicarlo](docs/simbiosis/06-como-replicarlo.md) en tu propio proyecto.

**Si nunca has usado GitHub así**: la [guía de iniciación](docs/iniciacion-github.md) explica, paso a paso, cómo revisar y fusionar un pull request desde el navegador o el móvil.

**Si vienes por el precio de la luz**:

- [Documentación técnica del proyecto](docs/proyecto-precio-luz.md): el script, el contrato, los tramos, los impuestos y una factura real explicada línea a línea.
- [Guía práctica de la API REData](docs/guia-api-redata.md): endpoints, históricos, límites y trampas, comprobado con peticiones reales.

## Uso rápido

Solo hace falta Python 3 (biblioteca estándar; matplotlib solo para la gráfica).

```bash
git clone https://github.com/JosebaDG/Pvpc-bridge.git
cd Pvpc-bridge
cp contrato.ejemplo.json contrato.json     # pon aquí los datos de tu factura (no se sube: está en .gitignore)
python3 puente_luz.py resumen --dia hoy              # horas más baratas y más caras del día
python3 puente_luz.py bloque --horas 2 --potencia 2000   # mejor bloque seguido de 2 horas para un aparato de 2 kW
python3 puente_luz.py umbral --max-precio 0.10       # franjas por debajo de 10 céntimos
python3 puente_luz.py grafica --dia hoy --salida pvpc.png   # gráfica del día, lista para mandar a un chat
python3 aviso_nocturno.py                            # aviso de mañana: mejor bloque, imagen y mensaje corto
```

La salida es JSON, pensada para que la lea otro script, un cron o un agente. Todos los subcomandos están en la [documentación técnica](docs/proyecto-precio-luz.md#uso-rápido).

## Qué hay en el repositorio

| Ruta | Qué es |
|---|---|
| `puente_luz.py` | Script puente: descarga de REE, calcula bloques, repartos y costes, devuelve JSON. |
| `aviso_nocturno.py` | Aviso de cada noche: el bloque más barato de mañana con lo que dura, la gráfica para el móvil y una conclusión curiosa cruzada con `datos/`. Cómo está montado: [docs/aviso-nocturno.md](docs/aviso-nocturno.md). |
| `precios_luz_ree.py` | El primer script, más sencillo. Se conserva como ejemplo mínimo. |
| `contrato.ejemplo.json` | Contrato genérico (PVPC 2.0TD, península, valores de 2026). |
| `docs/` | Documentación técnica, guía de la API, guía de iniciación a GitHub y la carpeta `simbiosis/`. |
| `datos/` | Histórico de REE ya descargado en CSV (PVPC, mercado diario, generación y meteorología), con la caché de consultas, el manifiesto y las herramientas para actualizarlo. |
| `archivo/estudio-2026-10-09/` | Las pruebas del estudio de la API REData: respuestas reales, errores, scripts y el informe original. |
| `herramientas/github-device-flow/` | Los dos scripts con los que el agente se conecta a GitHub sin guardar contraseñas. |
| `.github/` | Plantillas de issues y PR, y una comprobación automática que no llama a ninguna API. |
| `CONTRIBUTING.md` | Cómo proponer cambios, seas persona o agente. |

## Estado y próximos pasos

El [aviso nocturno](docs/aviso-nocturno.md) ya funciona: cada noche a las 21:30 llega al chat la gráfica de mañana con el bloque más barato. Lo siguiente está en las [issues](https://github.com/JosebaDG/Pvpc-bridge/issues): un servidor MCP en Cloudflare Workers para que cualquier agente consulte los precios.

## Datos históricos y archivo del estudio

- [`datos/`](datos/README.md): el histórico ya descargado de REData (PVPC por horas desde junio de 2021, mercado diario desde 2014 y generación diaria desde 2011, más meteorología de Open-Meteo) en CSV, con las respuestas crudas, la caché de consultas, un manifiesto y un script que solo descarga lo que falta. Antes de pedir nada a REE, mira ahí. Las limitaciones y problemas encontrados están en [`datos/LIMITACIONES.md`](datos/LIMITACIONES.md).
- [`archivo/estudio-2026-10-09/`](archivo/estudio-2026-10-09/README.md): las pruebas del estudio de la API (respuestas reales, errores, archivo 70 de ESIOS, scripts y el informe original).

`datos/consultas/` solo guarda respuestas públicas de REE y Open-Meteo; la caché local de `puente_luz.py` no se publica. Los datos de REE no quedan cubiertos por la licencia del repositorio: sus condiciones de uso están en [`datos/README.md`](datos/README.md).

## Licencia

- **Código:** MIT, en [`LICENSE`](LICENSE).
- **Documentación:** CC BY 4.0, en [`docs/LICENSE.md`](docs/LICENSE.md).
- **Datos de REE y Open-Meteo:** tienen sus propias condiciones, en [`datos/README.md`](datos/README.md).

## Fuente de los datos

Los precios y datos de generación proceden de [Red Eléctrica (REData)](https://www.ree.es/es/datos/apidatos) y de [ESIOS](https://www.esios.ree.es/es/pvpc). Este proyecto no está vinculado a Red Eléctrica. Consultamos sus servidores con moderación y guardamos en caché lo ya descargado para no repetir peticiones.
