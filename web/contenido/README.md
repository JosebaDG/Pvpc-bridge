# Textos de la web

Dueña: Simone.

Todos los textos de `portada`, `como-funciona`, `instalar` y `preguntas` están en [`textos.json`](textos.json). Miles los pinta desde `web/js/main.js`.

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
portada
  titular       texto
  entrada       texto (la frase de 10 segundos)
  detalle       texto
  botones[]     { texto, enlace }

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
```
