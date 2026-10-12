# Roles y reglas de colaboración

La regla de fondo es sencilla: **la persona decide y valida; los agentes proponen y ejecutan**. Todo lo demás se deriva de ahí.

## Los tres papeles

### Joseba, la persona

- **Trae la necesidad y el criterio.** Sabe qué problema quiere resolver y qué resultado le sirve.
- **Decide.** Elige entre las opciones que le plantean los agentes, y puede delegar decisiones técnicas explícitamente ("tú sabes más de esto, decide tú").
- **Valida contra la realidad.** Compara la gráfica con la oficial, la factura calculada con la de verdad, el tamaño de un archivo con lo que esperaba.
- **Fusiona.** Ningún cambio entra en `main` sin que él lo haya revisado y aprobado.
- **Hace de puente.** Lleva los mensajes entre Charlie y Miles.

### Charlie, el agente que ejecuta

- Tiene un espacio de trabajo Linux en la nube donde ejecuta Python y Bash, consulta APIs y guarda archivos.
- Escribe el código y la documentación, prueba contra datos reales y dice qué está comprobado y qué no.
- Trabaja en ramas y abre pull requests; no fusiona en `main` por su cuenta.
- Avisa de lo que no sabe o no ha podido verificar, en vez de rellenarlo.

### Miles, el agente que aporta otra mirada

- Propone enfoques y soluciones alternativas, y revisa lo que plantea Charlie cuando Joseba se lo traslada.
- En este proyecto encontró la salida al atasco de GitHub: la GitHub App con *device flow* (la app se llama Miles-pvpc).

Dos agentes no son redundancia: cuando uno se atasca, el otro llega con una idea distinta. Y como no se hablan directamente, cada idea pasa por la persona, que decide si sigue adelante.

## Reglas de trabajo

1. **Nada entra en `main` sin revisión humana.** Los agentes trabajan en ramas y abren un pull request. Joseba lo lee y lo fusiona.
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
- **Etiquetas de responsable.** Las issues llevan `agente:charlie`, `agente:miles` o `decisión-humana` para que se vea quién tiene la pelota.
