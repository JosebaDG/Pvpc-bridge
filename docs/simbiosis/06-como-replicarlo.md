# Cómo replicarlo: lecciones para trabajar con agentes de IA

Si quieres montar algo parecido (una persona con uno o varios agentes de IA sacando adelante un proyecto real), esto es lo que nos ha funcionado.

## Antes de empezar

1. **Empieza por una molestia real y pequeña.** Aquí fue consultar a mano el precio de la luz cada noche. Un problema concreto da requisitos concretos y una forma clara de comprobar el resultado.
2. **Dicta requisitos, no soluciones.** Joseba dijo qué quería (JSON, filtro por precio, repartir tareas, gráfica para validar) y dejó al agente decidir cómo.
3. **Pide desde el principio una forma de validar.** La gráfica diaria no era un adorno: era la manera de comparar con la fuente oficial. Y de paso se convirtió en una de las salidas más útiles del proyecto, porque una persona la entiende de un vistazo en un chat.

## Durante el trabajo

4. **Valida contra algo que conozcas.** La gráfica oficial, una factura real, el tamaño esperado de un archivo. El agente no tiene tu experiencia; tú sí.
5. **Exige que se distinga lo comprobado de lo supuesto.** Y lo hecho de lo propuesto. Pregunta "¿esto lo has probado?" sin miedo.
6. **Estudia antes de construir.** Pedir un informe de la API antes de añadir funciones evitó trampas (cambio de fórmula del PVPC en 2024, tope de 31 días, token de ESIOS).
7. **Separa lo privado desde el primer día.** Un `contrato.json` privado y un `contrato.ejemplo.json` público; `.gitignore` antes del primer commit.
8. **Usa un segundo agente cuando el primero se atasque.** Otra perspectiva desbloqueó GitHub en minutos.
9. **Sé el puente, y apróvechalo.** Si tus agentes no se hablan entre sí, cada idea pasa por ti: es tu oportunidad de entenderla antes de aceptarla.

## Con GitHub

10. **Da acceso con una GitHub App y *device flow*, no con contraseñas ni tokens pegados.** Ver [Conectar GitHub con *device flow*](05-conectar-github-device-flow.md).
11. **Los agentes abren PR; tú fusionas.** Es la forma de que aprendas qué entra en tu proyecto y de que nada se cuele.
12. **Convierte las llamadas en issues.** Lo que se decide hablando se olvida; lo que está en una issue, no.
13. **Automatiza las comprobaciones baratas.** Que el código compile y que no se suba nada privado se puede comprobar en cada PR sin esfuerzo.

## Lo que no hay que esperar

- **Que el agente acierte siempre a la primera.** No lo hace. Lo que sí hace es corregir rápido cuando se le señala el fallo.
- **Que los datos predigan el futuro.** Encontrar una correlación (viento y precio, por ejemplo) no es tener una predicción.
- **Que la persona sobre.** Sin alguien que decida qué importa y valide contra la realidad, los agentes producen mucho y aciertan menos.

## Una plantilla para tu primer encargo

> Quiero [resultado concreto] para [para qué lo usaré]. Lo necesito en [formato]. Debe [requisito 1], [requisito 2]. Quiero poder comprobarlo comparándolo con [referencia que conozco]. Dime qué has comprobado y qué no.
