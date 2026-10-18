# Textos de la web

Dueña: Simone.

Todos los textos de `portada`, `puertas`, `como-funciona`, `instalar`, `preguntas`, `como-se-forma-el-precio`, `como-se-ha-hecho` y `equipo` están en [`textos.json`](textos.json). Miles los pinta desde `web/js/textos.js`.

## La portada, corta

- **Qué se eligió:** un titular, dos frases y un solo botón, que baja a la gráfica de hoy. «Cómo funciona» e «Instálalo en 5 minutos» viven en su apartado, y la portada solo los anuncia en las puertas.
- **Por qué:** la portada tiene que encender la curiosidad en 10 segundos y dejar la gráfica en el primer pantallazo del móvil. El detalle está a un clic.
- **Qué se descartó:** el párrafo de detalle (datos abiertos, código abierto), que pasa a «Cómo se ha hecho», y el segundo botón, que competía con la gráfica.

## «Cómo se forma el precio», en fichas

- **Qué se eligió:** cuatro pasos cortos (de la subasta de mediodía a la factura) y la sección «El mercado por dentro»: seis fichas con un título, un gancho de una o dos frases y el detalle a un clic, cada una con su fuente.
- **Por qué:** una idea por ficha y el detalle escondido. El gancho se entiende solo; quien quiera más abre la ficha.
- **Qué se descartó:** cifras que no están comprobadas en el repo o en la fuente oficial (por ejemplo, qué tecnología marcó el precio de cada hora: el repo aún no tiene esos datos) y cualquier relación de causa entre el tiempo y el precio que no salga de la fórmula.

## La apuesta: ejemplo, avisos y manual

- **Qué se eligió:** cuando la apuesta está cerrada, un ejemplo resuelto con el último día que ya tiene respuesta (pistas, apuesta y resultado), un aviso cuando mañana es sábado, lunes o festivo nacional, y un manual de cuatro pasos plegado. Los textos están en `apuesta` de `textos.json`; lo que va entre llaves lo rellena `graficas.js`.
- **Por qué:** hay que entender la mecánica antes de apostar, y la apuesta sirve para desmitificar el precio. El ejemplo enseña el juego sin explicarlo; el manual explica de dónde sale el precio. El aviso existe porque el calendario pesa más que el tiempo: sin él, el viernes la apuesta es casi regalada y parece que acierta el viento.
- **Qué se descartó:** un ejemplo inventado (tiene que ser un día real de nuestros datos) y avisos con cifras que no están comprobadas: los festivos no llevan porcentaje porque hay pocos casos.

**Las cifras de los avisos**, de `datos/historico`, media de 14 a 17 h, 176 pares de días de junio de 2023 a octubre de 2026:

- De viernes a sábado, el PVPC bajó el 97 % de las veces (de media, 39 €/MWh). Solo el mercado, el 85 % (18 €/MWh): el resto son peajes y cargos.
- De domingo a lunes, el PVPC subió el 97 % de las veces (43 €/MWh). Solo el mercado, el 91 % (28 €/MWh).

**Ejemplo con un día real** (precios de REData y pistas de Open-Meteo, consultados el 16 de octubre de 2026). Así debe leerse la tarjeta con estos datos:

> **Ejemplo.** ¿El sábado, de 14 a 17 h, más barata o más cara que el viernes (**0,089 €/kWh** de media, sin impuestos)?
> Pistas: viento 9 → 23 km/h y sol 530 → 342 W/m² (previsto).
> Ojo, mañana es sábado: de viernes a sábado, la luz bajó 97 de cada 100 veces.
> [Más barata] (marcado) [Más cara]
> Salió a **0,020 €/kWh**, un 77 % más barata. Solo el mercado: 0,096 → 0,002. Así baja 85 de cada 100 veces, no 97.

**Textos cortos, a propósito.** Con la apuesta cerrada, la tarjeta tiene que medir 780 px o menos a 390 de ancho, para tener margen bajo los 800 (con estos textos, 734 en nuestro navegador sin pantalla; antes, 781 y 967). Por eso los avisos dejan solo la cifra (el porqué del calendario está en el manual, paso «Qué lo mueve»), la pista del mercado va en una línea y el resumen del manual es «Cómo sale el precio».

En el ejemplo, además: la `entrada` va vacía y el precio de referencia va entre paréntesis dentro de la pregunta; el resultado ya no dice «acertaba “más barata”», porque lo dicen el botón marcado y «un 77 % más barata»; y la línea del mercado no repite «€/kWh», que ya sale en el mismo párrafo. Se descartó tocar el CSS, quitar piezas del ejemplo o quitar «(previsto)» de las pistas: cada pieza enseña algo, y acortar el texto basta.

En el ejemplo se marca la opción que salió, para que se lea como un día resuelto y no como una apuesta. Con un empate, la frase `empate`.

## Por qué JSON

- **Qué se eligió:** un solo archivo JSON, con una clave por cada `id` de sección de `index.html`.
- **Por qué:** la web no tiene build ni dependencias. El navegador lee JSON con `fetch`, sin nada más.
- **Qué se descartó:** Markdown, porque hace falta un programa que lo convierta a HTML (una librería o uno casero). Fragmentos de HTML, porque mezclan el texto con el marcado de Miles y las clases de Maya.

## Reglas

- Dentro de los textos solo van `<strong>`, `<code>` y `<a>`. Cualquier otra etiqueta se muestra como texto.
- Los comandos (`instalar.comandos[].comando`) van sin HTML: se pintan tal cual en un bloque de código.
- Los enlaces son absolutos a GitHub o a la fuente oficial. Los que empiezan por `#` llevan a otra sección de la misma página.
- Nada que el repositorio no haga. Cada dato sale del [README](../../README.md), de [`docs/proyecto-precio-luz.md`](../../docs/proyecto-precio-luz.md), de [`docs/aviso-nocturno.md`](../../docs/aviso-nocturno.md) o de [`datos/LIMITACIONES.md`](../../datos/LIMITACIONES.md).
- Sin cifras de ahorro: se explica cómo calcularlo con `puente_luz.py`.
- Las claves que empiezan por `_` son comentarios.

## Esquema

```
portada                            (index.html)
  titular       texto
  entrada       texto (la frase de 10 segundos)
  detalle       texto, opcional (hoy no se usa)
  botones[]     { texto, enlace }   opcional (hoy no se usa: la entrada ya invita a bajar a la gráfica)

puertas[]                          (index.html, tarjetas bajo la gráfica)
  { titulo, texto, enlace }         (enlace a otra página de la web)

como-funciona
  titulo, entrada
  pasos[]       { titulo, texto }   (4 pasos)
  recuadro      { titulo, puntos[], enlace: { texto, href } }

instalar
  titulo, entrada
  requisitos[]  texto
  comandos[]    { comando (sin HTML), explicacion }
  nota          texto

preguntas
  titulo
  lista[]       { pregunta, respuesta }   (se pintan con <details>)

como-se-ha-hecho                   (como-se-ha-hecho.html)
  titulo, entrada
  tarjetas[]    { titulo, texto }   (3: método, lo que falló, cómo replicarlo)
  historia      texto (enlace a docs/simbiosis/07-la-web.md)

como-se-forma-el-precio            (página nueva; Miles decide el HTML)
  titulo, entrada
  pasos[]       { titulo, texto }   (4 pasos)
  mercado-por-dentro
    titulo, entrada
    fichas[]    { titulo, gancho, detalle, fuente: { texto, href } }
                (gancho visible; detalle y fuente dentro de <details>)

apuesta                            (no es sección: la pinta graficas.js en la tarjeta de la apuesta)
  ejemplo       { etiqueta, entrada, pregunta, pistas, resultado, empate, mercado }
                ({dia}, {dia_ref}, {media_ref}, {media_dia}, {viento_*}, {sol_*}, {mercado_*},
                 {comparacion} y {eleccion} los rellena el código)
  avisos        { sabado, lunes, festivo, pista_mercado }   (uno como mucho)
  manual        { resumen, entrada, pasos[] { titulo, texto } }   (4 pasos, dentro de <details>)

equipo                             (como-se-ha-hecho.html, dentro del apartado)
  titulo
  miembros[]    { nombre, papel }   (5 tarjetas de una línea)
  debilidades   texto (se pinta como .nota)
```
