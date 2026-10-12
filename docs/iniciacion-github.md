# Guía de iniciación a GitHub para este proyecto

Esta guía es para la persona del equipo: cómo seguir el trabajo de los agentes en GitHub, revisar sus propuestas y decidir qué entra en el proyecto. Todo se puede hacer desde el navegador; no hace falta instalar nada ni usar la terminal.

## Cinco palabras que conviene conocer

- **Repositorio:** la carpeta del proyecto en GitHub, con todo su historial.
- **`main`:** la rama principal, la versión "oficial" del proyecto.
- **Rama:** una copia de trabajo donde se hacen cambios sin tocar `main`.
- **Pull request (PR):** una propuesta para llevar los cambios de una rama a `main`. Se revisa, se comenta y, si convence, se fusiona.
- **Issue:** una tarea, una idea o un problema apuntado, con su conversación.

## Revisar un pull request

1. Entra en el repositorio y abre la pestaña **Pull requests**. Pulsa el PR que quieras revisar.
2. En la pestaña **Conversation** lee la descripción: qué cambia, por qué y qué tienes que mirar. Abajo verás si las comprobaciones automáticas han pasado (marca verde) o no (cruz roja).
3. En la pestaña **Files changed** ves cada archivo: en verde lo añadido, en rojo lo quitado. Para leer un documento ya formateado, pulsa el icono de documento (*Display the rich diff*) en la cabecera del archivo.
4. Si algo no te encaja, pasa el ratón por la línea, pulsa el **+** azul y escribe tu comentario. Los agentes lo leerán cuando les pases el enlace.
5. Cuando termines, pulsa **Review changes** (arriba a la derecha) y elige:
   - **Comment:** solo comentas.
   - **Approve:** te parece bien.
   - **Request changes:** hay que cambiar algo antes de fusionar.

Los agentes abren los PR con tu cuenta, a través de su GitHub App (verás tu nombre junto al de la app). Por eso GitHub no te dejará usar **Approve**: no se puede aprobar un PR propio. No pasa nada: deja un comentario con tu revisión y fusiona.

## Fusionar un pull request

1. En la pestaña **Conversation**, baja hasta el final.
2. Comprueba que pone que no hay conflictos (*This branch has no conflicts with the base branch*).
3. Pulsa la flecha junto al botón verde y elige el tipo de fusión:
   - **Create a merge commit:** conserva todos los commits de la rama. Bueno cuando cada paso cuenta algo.
   - **Squash and merge:** junta todos los commits en uno. Bueno para cambios pequeños.
4. Pulsa el botón verde y luego **Confirm merge**.
5. GitHub ofrecerá **Delete branch**. Puedes borrarla: los cambios ya están en `main` y la rama se puede restaurar desde el PR si hiciera falta.

Si el PR decía `Closes #N`, esa issue se cerrará sola.

## Desde el móvil

La app oficial de GitHub para iPhone y Android permite leer PR, comentar, aprobar y fusionar. Para revisar documentos largos es más cómodo el navegador.

## Trabajar con issues

- **Abrir una:** pestaña **Issues → New issue**, elige una plantilla (tarea, idea o error) y rellénala. Vale con dos líneas.
- **Etiquetas:** `decisión-humana` significa que los agentes te esperan a ti. Filtra por ella para ver qué tienes pendiente.
- **Hitos:** en **Issues → Milestones** ves cada etapa y cuánto le falta.
- **Pasar trabajo a un agente:** copia el enlace de la issue y dáselo a Charlie o a Miles en la conversación. Es más fiable que explicarlo de memoria.

## Si algo sale mal

- **Fusionaste algo que no querías:** en el PR fusionado aparece el botón **Revert**. Crea un PR nuevo que deshace el cambio, sin borrar historial.
- **Una comprobación está en rojo:** pulsa *Details* para ver qué falló y pásaselo a un agente. No fusiones hasta que esté en verde, salvo que sepas por qué falla.
- **Quieres cortar el acceso de los agentes:** mira la sección de revocar en [Conectar GitHub con *device flow*](simbiosis/05-conectar-github-device-flow.md#cómo-revocar-el-acceso).

## Tu primer ejercicio

El pull request que añadió esta guía es tu práctica: revísalo con los pasos de arriba, deja al menos un comentario y fusiónalo tú.
