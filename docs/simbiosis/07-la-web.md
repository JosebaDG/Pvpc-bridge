# Cómo se hizo la web, pull request a pull request

La web de Pvpc-bridge se hizo entre el miércoles 14 y el jueves 15 de octubre de 2026. La hicieron una persona y cuatro agentes de IA, cada uno dueño de unos archivos y en su propia rama. Esta página cuenta el orden en que llegó cada pieza y lo que salió mal.

## El reparto

- **Joseba** marca el rumbo, revisa y decide qué se publica.
- **Miles** monta los HTML, el JavaScript que une las piezas y revisa los pull requests.
- **Charlie** hace las gráficas con los datos de Red Eléctrica.
- **Maya** hace el diseño: colores, componentes y menú.
- **Simone** escribe los textos.

La tabla de quién toca qué está en el [README de la web](../../web/README.md). Sirve para que cuatro agentes trabajen a la vez sin pisarse.

## Las piezas, en orden

1. **[#15](https://github.com/JosebaDG/Pvpc-bridge/pull/15), esqueleto y reparto (Miles).** HTML, CSS y JavaScript tal cual, sin compilar. La web lee los CSV que ya guarda el repositorio. Se descartó un framework porque añade dependencias y un paso de compilación a una web pequeña.
2. **[#16](https://github.com/JosebaDG/Pvpc-bridge/pull/16), diseño (Maya).** Fuentes del sistema, sin descargas. Cada tramo de precio lleva su palabra al lado del color, para quien no distingue el rojo del verde.
3. **[#17](https://github.com/JosebaDG/Pvpc-bridge/pull/17), gráficas sin librerías (Charlie).** El precio de hoy en 24 barras y el histórico.
4. **[#18](https://github.com/JosebaDG/Pvpc-bridge/pull/18), textos (Simone).** Todos en un JSON que el navegador lee sin nada más.
5. **[#19](https://github.com/JosebaDG/Pvpc-bridge/pull/19), el precio en cada barra (Charlie).** Lo pidió Joseba, junto con que nadie confunda los precios de hoy con los de otro día.
6. **[#21](https://github.com/JosebaDG/Pvpc-bridge/pull/21) y [#23](https://github.com/JosebaDG/Pvpc-bridge/pull/23), menú y cuatro apartados (Maya y Miles).** La respuesta a la revisión de Joseba, que se cuenta abajo.
7. **[#24](https://github.com/JosebaDG/Pvpc-bridge/pull/24), deslizar por las barras (Charlie).** Pasar el dedo o el ratón por la gráfica para ver el precio de cada hora.

## Lo que salió mal

- **«Parece una biblia».** La primera versión era una sola página con todo dentro. Joseba pidió apartados, una portada corta con gancho y la gráfica de hoy en el centro. Se repartió en cuatro páginas con un menú que en el móvil queda abajo, al alcance del pulgar. **Lección:** que cada pieza esté bien no garantiza que el conjunto se lea bien. Hace falta alguien que mire la página entera como un visitante.
- **Los 50 píxeles de más.** En el móvil, la página se podía arrastrar hacia un lado. La causa era un resplandor decorativo de la portada que se salía de su caja. Se descartó esconder el desbordamiento con una línea de CSS, porque tapa el síntoma y esconde los fallos futuros. **Lección:** arreglar la causa, no el síntoma.
- **Una frase que prometía de más.** El texto del comando `umbral` no decía que compara precios sin impuestos. Lo vio un revisor y se corrigió contra la documentación técnica. **Lección:** cada texto se contrasta con lo que el código hace de verdad.
- **Un archivo que faltaba.** Un commit pintaba los textos con un archivo que no se había subido, y hubo que añadirlo en el siguiente. **Lección:** antes de abrir un pull request, probar la rama tal como está en GitHub, no la copia local.
- **Enlaces a sitios privados.** La web y su documentación enlazaban a sitios de trabajo internos que el público no puede abrir. Se quitaron en [#20](https://github.com/JosebaDG/Pvpc-bridge/pull/20) y [#22](https://github.com/JosebaDG/Pvpc-bridge/pull/22). **Lección:** en un repositorio público, lo que se quiera enseñar se copia aquí ya revisado, en vez de enlazarlo.
- **Agentes que hablan de más.** Cuando los agentes se coordinan por escrito, un hilo puede alargarse sin que la persona intervenga. Una regla lo corta: tras seis mensajes seguidos de agentes, el turno pasa a Joseba. **Lección:** la persona tiene que estar en el bucle por diseño, no solo cuando se acuerda.

## Lo que queda

La web ya está publicada en GitHub Pages. Se publica a mano, con una Action, cuando lo que se fusiona cambia lo que se ve, y Joseba revisa la versión publicada y dice lo que le chirría. Además, desde el 17 de octubre de 2026 se publica sola cada día a las 20:30, hora peninsular: la misma Action pone al día el histórico de precios y la actividad del equipo, los guarda en `main` y publica. Es la única publicación automática, y solo puede tocar datos. Hasta entonces el histórico se había quedado en el 12 de octubre, el día de la descarga. **Lección:** lo que tiene que estar al día cada día no puede depender de que alguien se acuerde. Lo siguiente es seguir mejorándola de versión en versión.
