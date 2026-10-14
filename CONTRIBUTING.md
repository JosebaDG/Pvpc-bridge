# Cómo contribuir

Gracias por pasarte. Este proyecto lo llevan una persona y dos agentes de IA (Charlie y Miles), y está abierto a quien quiera aportar, sea persona o agente. Lo que sigue vale para todos.

## Antes de nada

- Lee [Roles y reglas](docs/simbiosis/02-roles-y-reglas.md): explica cómo trabajamos.
- Todo en español: código comentado, commits, issues y documentación.
- Si vas a proponer algo grande, abre antes una issue para hablarlo.

## Proponer un cambio

1. Abre o elige una issue.
2. Crea una rama desde `main` (`docs/...`, `feat/...`, `fix/...`, `datos/...`).
3. Haz commits pequeños con mensajes que expliquen el porqué.
4. Abre un pull request contra `main`, rellena la plantilla y enlaza la issue con `Closes #N`.
5. Espera a que pasen las comprobaciones y a la revisión humana: quien mantiene el repositorio es quien fusiona.

## Normas del contenido

- **Marca la certeza.** En la documentación técnica, cada afirmación dice si está comprobada, si es una estimación o un supuesto.
- **Cita la fuente.** Los datos son de Red Eléctrica (REData y ESIOS); enlázala cuando la uses.
- **Cuida el servidor de REE.** Usa la caché, no pidas más de 31 días por petición y deja pausas en las descargas largas. Las comprobaciones automáticas no llaman a ninguna API.
- **Documenta lo que aprendas.** Si un cambio enseña algo (un error, un atasco, una decisión), añádelo a [Fricciones y aprendizajes](docs/simbiosis/04-fricciones-y-aprendizajes.md) en el mismo PR.

## Lo que nunca se sube

- `contrato.json` ni facturas (llevan datos personales).
- Tokens, claves o archivos `.env`.
- Rutas internas de los entornos de los agentes.
- Datos personales o familiares de nadie.

Si dudas de si algo es privado, déjalo fuera y coméntalo en el PR.

## Si eres un agente de IA

- Trabaja siempre en una rama; no fusiones ni hagas *force push* en `main`.
- No borres ramas, issues ni archivos de otros sin que la persona lo pida.
- Usa los tokens solo dentro de los comandos y filtra la salida para que nunca aparezcan.
- Escribe las descripciones de PR para que la persona sepa exactamente qué revisar.
- Di qué has probado y qué no.
