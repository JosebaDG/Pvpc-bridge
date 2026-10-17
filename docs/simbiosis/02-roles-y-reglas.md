# Roles y reglas de colaboración

La regla de fondo es sencilla: **la persona decide y valida; los agentes proponen y ejecutan**. Todo lo demás se deriva de ahí.

## Los cinco papeles

### La persona (Joseba)

- **Trae la necesidad y el criterio.** Sabe qué problema quiere resolver y qué resultado le sirve.
- **Decide.** Elige entre las opciones que le plantean los agentes, y puede delegar decisiones técnicas explícitamente ("tú sabes más de esto, decide tú").
- **Valida contra la realidad.** Compara la gráfica con la oficial, la factura calculada con la de verdad, el tamaño de un archivo con lo que esperaba.
- **Revisa.** Ningún cambio entra en `main` sin revisión. Miles fusiona un pull request cuando la comprobación automática está en verde, no choca con `main`, él lo ha revisado y no deja abierta ninguna decisión de la persona: rumbo, diseño, gasto, datos, servicios externos nuevos o borrar algo. Si falta cualquiera de las cuatro, decide la persona, que además revisa la web publicada y dice lo que le chirría.
- **Tiene la última palabra.** Los agentes se coordinan en el [tablón #11](https://github.com/JosebaDG/Pvpc-bridge/issues/11); la persona lo lee y decide.

### Charlie, el agente que ejecuta

- Tiene un espacio de trabajo Linux en la nube donde ejecuta Python y Bash, consulta APIs y guarda archivos.
- Escribe el código y la documentación, prueba contra datos reales y dice qué está comprobado y qué no.
- Trabaja en ramas y abre pull requests; no fusiona en `main` por su cuenta.
- Avisa de lo que no sabe o no ha podido verificar, en vez de rellenarlo.

### Miles, el agente que aporta otra mirada

- Propone enfoques y soluciones alternativas, y revisa los pull requests de Charlie.
- Se encarga de todo lo visual (gráficas, imágenes, capturas), porque Charlie no puede ver imágenes. Así, lo que hace un agente lo comprueba otro distinto.
- En este proyecto encontró la salida al atasco de GitHub: la GitHub App con *device flow*.
- En la web coordina, monta el HTML y revisa los pull requests. Fusiona los que cumplen las cuatro condiciones de arriba y publica la web. Aparte, la web se publica sola cada día a las 21:30, hora peninsular, con el precio de mañana, el histórico y la actividad del equipo al día: es la única publicación automática y solo puede tocar datos.

### Maya, el agente del diseño

- Se encarga del diseño de la web: colores, componentes, el menú y que todo se lea bien en el móvil.
- Trabaja en su propia rama y abre pull requests, como los demás.

### Simone, el agente de los textos

- Escribe los textos de la web: que cada frase se entienda y no prometa nada que el repositorio no haga.
- Contrasta cada texto con el código y la documentación antes de abrir el pull request.

Varios agentes no son redundancia: cuando uno se atasca, otro llega con una idea distinta, y lo que hace uno lo revisa otro. Las decisiones de rumbo, diseño, gasto, datos, servicios externos nuevos o borrar algo siguen pasando por la persona.

## Reglas de trabajo

1. **Nada entra en `main` sin revisión.** Los agentes trabajan en ramas y abren un pull request. Miles lo fusiona si cumple las cuatro condiciones de arriba; si no, lo decide la persona.
2. **Comprobado, estimado o supuesto.** Cada afirmación técnica dice de dónde sale. Si no se ha podido verificar, se marca como pendiente.
3. **Los errores se cuentan.** Lo que falla va a [Fricciones y aprendizajes](04-fricciones-y-aprendizajes.md). Es la parte más formativa.
4. **Lo privado no se publica.** Ni tokens, ni `contrato.json`, ni facturas, ni rutas internas, ni datos personales. Ante la duda, se deja fuera y se dice en el pull request.
5. **Respeto a las fuentes.** Las APIs públicas se consultan con calma, con caché, y citando a Red Eléctrica como origen de los datos.
6. **Sin destrucción.** No se borra, no se reescribe el historial y no se hace *force push* en `main`.
7. **Las decisiones quedan escritas.** Si se decide algo en una llamada de voz, se apunta en la issue o el pull request correspondiente. La voz no deja rastro; GitHub sí.

## Cómo se pasa la información entre agentes

Charlie y Miles no comparten memoria ni canal. Lo que funciona:

- **Mensajes autocontenidos.** Cuando un agente prepara algo para el otro, lo escribe para que se entienda sin contexto: qué se intentó, qué falló, qué se pide.
- **GitHub como memoria compartida.** Las issues y los pull requests son el sitio donde ambos (y cualquiera) pueden leer el estado del proyecto. Pegar un enlace es más fiable que resumir de memoria.
- **El tablón de coordinación.** El [issue #11](https://github.com/JosebaDG/Pvpc-bridge/issues/11) es donde cada agente avisa antes de crear una rama, deja el enlace a su PR o le pregunta algo al otro. Los agentes lo leen en su revisión diaria.
- **Etiquetas de responsable.** Las issues llevan `agente:charlie`, `agente:miles` o `decisión-humana` para que se vea quién tiene la pelota.
