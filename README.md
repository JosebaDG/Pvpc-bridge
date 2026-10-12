# Pvpc-bridge: precio de la luz hora a hora, hecho entre una persona y dos agentes de IA

Pvpc-bridge descarga el precio de la luz de cada hora (PVPC) desde la API abierta de Red Eléctrica, lo pasa por un script puente que devuelve JSON y responde preguntas prácticas: cuáles son las horas más baratas, cuándo conviene poner un consumo grande o flexible (la lavadora, el lavavajillas, el termo, la carga del coche o un equipo que trabaja durante horas) y cuánto cuesta en euros de factura. Además dibuja la gráfica del día, pensada para mandarla a un chat con un texto corto que la explique a una persona.

La meta es tener una navaja suiza del mercado eléctrico español: precios, costes, impuestos y avisos para gastar mejor la energía, con datos abiertos y sin depender de nadie.

Pero este repositorio quiere enseñar algo más que un script. Es un **proyecto formativo** que documenta **la simbiosis**: cómo trabajan juntos una persona y dos agentes de IA de Sesame para sacar adelante un proyecto real, desde una idea en una llamada de voz hasta un repositorio con issues, ramas y pull requests. Lo hemos escrito para aprender nosotros y para que le sirva a quien quiera trabajar así.

## Quién hace qué

| Quién | Qué es | Su papel |
|---|---|---|
| **Joseba** ([@JosebaDG](https://github.com/JosebaDG)) | La persona | Tiene la necesidad, decide, valida los resultados y fusiona. Hace de puente entre los dos agentes. |
| **Charlie** | Agente de Sesame con un espacio de trabajo Linux en la nube | Escribe y ejecuta el código, consulta las APIs, documenta y sube los cambios. |
| **Miles** | Agente de Sesame | Propone soluciones y revisa enfoques. Encontró la forma de conectar el espacio de trabajo con GitHub (una GitHub App con *device flow*). |

Charlie y Miles no pueden hablar entre sí: lo que uno dice al otro pasa por Joseba. Eso, lejos de ser un estorbo, mantiene a la persona en el centro de cada decisión. Las reglas completas están en [Roles y reglas](docs/simbiosis/02-roles-y-reglas.md).

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
```

La salida es JSON, pensada para que la lea otro script, un cron o un agente. Todos los subcomandos están en la [documentación técnica](docs/proyecto-precio-luz.md#uso-rápido).

## Qué hay en el repositorio

| Ruta | Qué es |
|---|---|
| `puente_luz.py` | Script puente: descarga de REE, calcula bloques, repartos y costes, devuelve JSON. |
| `precios_luz_ree.py` | El primer script, más sencillo. Se conserva como ejemplo mínimo. |
| `contrato.ejemplo.json` | Contrato genérico (PVPC 2.0TD, península, valores de 2026). |
| `docs/` | Documentación técnica, guía de la API, guía de iniciación a GitHub y la carpeta `simbiosis/`. |
| `herramientas/github-device-flow/` | Los dos scripts con los que el agente se conecta a GitHub sin guardar contraseñas. |
| `.github/` | Plantillas de issues y PR, y una comprobación automática que no llama a ninguna API. |
| `CONTRIBUTING.md` | Cómo proponer cambios, seas persona o agente. |

## Estado y próximos pasos

Lo que viene está en las [issues](https://github.com/JosebaDG/Pvpc-bridge/issues): un servidor MCP en Cloudflare Workers para que cualquier agente consulte los precios, una carpeta `datos/` con el histórico descargado con calma y un aviso nocturno con las horas baratas del día siguiente, que llegue al chat con la gráfica y un texto corto.

## Fuente de los datos

Los precios y datos de generación proceden de [Red Eléctrica (REData)](https://www.ree.es/es/datos/apidatos) y de [ESIOS](https://www.esios.ree.es/es/pvpc). Este proyecto no está vinculado a Red Eléctrica. Consultamos sus servidores con moderación y guardamos en caché lo ya descargado para no repetir peticiones.
