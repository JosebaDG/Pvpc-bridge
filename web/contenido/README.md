# Textos de la web

Dueña: Simone.

Todos los textos de `portada`, `puertas`, `como-funciona`, `instalar`, `preguntas`, `como-se-forma-el-precio`, `como-se-ha-hecho` y `equipo` están en [`textos.json`](textos.json). Miles los pinta desde `web/js/textos.js`.

## La portada, corta

- **Qué se eligió:** un titular, dos frases y un solo botón, que baja a la gráfica de hoy. «Cómo funciona» e «Instálalo en 5 minutos» viven en su apartado, y la portada solo los anuncia en las puertas.
- **Por qué:** la portada tiene que encender la curiosidad en 10 segundos y dejar la gráfica en el primer pantallazo del móvil. El detalle está a un clic.
- **Qué se descartó:** el párrafo de detalle (datos abiertos, código abierto), que pasa a «Cómo se ha hecho», y el segundo botón, que competía con la gráfica.

## «Cómo se forma el precio», en fichas

- **Qué se eligió:** cuatro pasos cortos (de la subasta de mediodía a la factura) y la sección «El mercado por dentro»: seis fichas con un título, un gancho de una o dos frases y el detalle a un clic, cada una con su fuente.
- **Por qué:** Joseba pidió una idea por ficha y el detalle escondido. El gancho se entiende solo; quien quiera más abre la ficha.
- **Qué se descartó:** cifras que no están comprobadas en el repo o en la fuente oficial (por ejemplo, qué tecnología marcó el precio de cada hora: el repo aún no tiene esos datos) y cualquier relación de causa entre el tiempo y el precio que no salga de la fórmula.

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

equipo                             (como-se-ha-hecho.html, dentro del apartado)
  titulo
  miembros[]    { nombre, papel }   (5 tarjetas de una línea)
  debilidades   texto (se pinta como .nota)
```
