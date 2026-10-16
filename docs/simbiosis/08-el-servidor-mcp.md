# El servidor MCP: de script a servicio

Hasta octubre de 2026, para saber cuál es la hora más barata había que ejecutar `puente_luz.py` en un ordenador. El servidor MCP hace que cualquier agente de IA pueda preguntarlo por internet. Esta página cuenta cómo se decidió y cómo se hizo. Se completará cuando esté desplegado.

## La decisión

La idea se apuntó el 12 de octubre en el [issue #2](https://github.com/JosebaDG/Pvpc-bridge/issues/2), con tres preguntas para Joseba. Estuvo parada cuatro días mientras se hacía la web, hasta que el 16 de octubre contestó «sí» a la propuesta de Miles:

- **TypeScript, no Python.** Python en Workers existe, pero TypeScript es lo habitual allí y tiene el kit oficial de MCP. El precio es tener el cálculo escrito dos veces.
- **Con clave, no público.** Un servidor abierto lo puede usar cualquiera, y cada uso acaba siendo una consulta a Red Eléctrica en nombre del proyecto.
- **Despliegue con GitHub Actions, no a mano.** El token de Cloudflare queda guardado como secreto del repositorio y nadie tiene que tenerlo en su ordenador ni pegarlo en un chat.

## Cómo se hizo

- **Un traductor con examen.** Los cálculos de `puente_luz.py` se pasaron a TypeScript, y una prueba ejecuta los dos con los mismos datos guardados de Red Eléctrica y compara cada cifra. Incluye los días de cambio de hora, que duran 23 y 25 horas. Si alguien cambia uno y no el otro, la comprobación automática se pone en rojo.
- **Sin estado.** Cada pregunta crea un servidor, responde y se olvida. Se descartó guardar sesiones porque las cuatro herramientas no lo necesitan y obligaba a usar un servicio más de Cloudflare.
- **Una consulta a REE por día.** Un día publicado no cambia, así que se guarda en Workers KV y no se vuelve a pedir. Es la condición que puso el issue desde el principio.
- **Cerrado por defecto.** Si falta la clave, el servidor no responde datos. Es mejor cerrado por un olvido que abierto por un olvido.
- **Desplegar es una decisión de la persona.** El código y el workflow los preparó un agente. Crear el token de Cloudflare, guardar los secretos y pulsar el botón de desplegar le tocan a Joseba, igual que publicar la web.

## Lo que aprendimos

- **Una decisión pendiente frena más que el trabajo.** El servidor se escribió y se probó en una mañana; la decisión esperó cuatro días. Proponer una opción concreta («TypeScript, con clave, con Actions») en vez de preguntar «¿qué prefieres?» fue lo que la desbloqueó: bastó un «sí».

Cómo conectarse y cómo desplegarlo: [mcp/README.md](../../mcp/README.md).
