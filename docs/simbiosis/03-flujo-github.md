# Flujo de trabajo en GitHub

GitHub es la mesa de trabajo común: aquí se apunta lo pendiente (issues), se proponen cambios (ramas y pull requests), se revisan (revisión humana) y se comprueba lo básico de forma automática (GitHub Actions).

## El ciclo de un cambio

1. **Issue.** Todo trabajo empieza como una issue: qué se quiere, por qué y cómo sabremos que está hecho. Puede abrirla la persona o un agente.
2. **Rama.** El agente crea una rama desde `main` con un nombre que diga qué contiene.
3. **Commits.** Cambios pequeños, con mensajes en español que expliquen el porqué.
4. **Pull request.** El agente abre un PR contra `main`, rellena la plantilla y enlaza la issue con `Closes #N`, para que se cierre sola al fusionar.
5. **Comprobaciones.** GitHub Actions ejecuta las [comprobaciones básicas](../../.github/workflows/comprobaciones.yml): que los scripts compilen, que el contrato de ejemplo se lea y que no se haya colado nada privado. No llaman a ninguna API.
6. **Revisión humana.** La persona lee el PR, comenta si algo no le encaja y, cuando le convence, lo aprueba.
7. **Fusión.** La persona pulsa el botón. Recomendado: *Squash and merge* para cambios pequeños, *Create a merge commit* cuando interese conservar los pasos.
8. **Limpieza.** Tras fusionar, GitHub ofrece borrar la rama. Puede hacerlo la persona; los agentes no borran nada.

La [guía de iniciación](../iniciacion-github.md) explica los pasos 6 a 8 con detalle, pantalla a pantalla.

## Nombres de ramas

| Prefijo | Para qué | Ejemplo |
|---|---|---|
| `docs/` | Documentación | `docs/simbiosis` |
| `feat/` | Funcionalidad nueva | `feat/servidor-mcp` |
| `fix/` | Corrección | `fix/eje-grafica` |
| `datos/` | Datos descargados o su tratamiento | `datos/historico-pvpc` |

## Etiquetas

| Etiqueta | Significado |
|---|---|
| `simbiosis` | Sobre cómo trabajamos persona y agentes. |
| `datos` | Histórico, caché, descarga de datos de REE. |
| `mcp` | Servidor MCP en Cloudflare Workers. |
| `automatización` | Avisos, tareas programadas, integración con otros scripts. |
| `decisión-humana` | Necesita que la persona decida algo antes de seguir. |
| `agente:charlie` | Lo lleva Charlie. |
| `agente:miles` | Lo lleva o lo revisa Miles. |
| `documentation`, `enhancement`, `bug`, `good first issue` | Las de serie de GitHub, con su significado habitual. |

## Hitos (milestones)

Las issues de una misma etapa se agrupan en un hito. El primero es **Fase 2: datos, MCP y aviso nocturno**. En la página del hito se ve de un vistazo cuánto falta.

## Quién firma los commits

Los commits salen con el autor de Joseba (`JosebaDG`), porque el repositorio es suyo y él responde de lo que se publica. La autoría real de cada parte se cuenta en la descripción del pull request y en esta documentación. El acceso de escritura del agente lo da la GitHub App, con permisos acotados y solo en los repositorios donde Joseba la ha instalado.
