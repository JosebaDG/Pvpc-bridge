// Dueño: Miles (equipo-agentes #5). Pinta los textos de Simone (web/contenido/textos.json)
// en las secciones portada, como-funciona, instalar y preguntas.
//
// Uso (desde main.js):
//   import { iniciarTextos } from './textos.js';
//   iniciarTextos();
//
// Seguridad: dentro de los textos solo se aceptan <strong>, <code> y <a> (con enlace http(s) o #).
// Cualquier otra etiqueta se muestra como texto. Por qué no innerHTML a pelo: si algún día entra
// un <script> o un onclick en el JSON, no debe ejecutarse. Los comandos se pintan con textContent,
// así que un < en un comando nunca se interpreta.

const ETIQUETAS = new Set(['STRONG', 'CODE', 'A']);
const ENLACE_VALIDO = /^(https?:\/\/|#)/i;

// Ruta relativa a este archivo, no a la página: funciona igual en local (/web/) y en Pages (/).
const RUTA_TEXTOS = new URL('../contenido/textos.json', import.meta.url);

// Convierte un texto con HTML limitado en nodos seguros.
function html(texto) {
  const plantilla = document.createElement('template');
  plantilla.innerHTML = texto ?? '';
  const fragmento = document.createDocumentFragment();
  for (const nodo of plantilla.content.childNodes) fragmento.append(limpiar(nodo));
  return fragmento;
}

function limpiar(nodo) {
  if (nodo.nodeType === Node.TEXT_NODE) return document.createTextNode(nodo.textContent);
  if (nodo.nodeType !== Node.ELEMENT_NODE) return document.createTextNode('');
  if (!ETIQUETAS.has(nodo.tagName)) return document.createTextNode(nodo.outerHTML);
  const limpio = document.createElement(nodo.tagName.toLowerCase());
  if (nodo.tagName === 'A') {
    const href = nodo.getAttribute('href') ?? '';
    if (ENLACE_VALIDO.test(href)) limpio.setAttribute('href', href);
    if (/^https?:/i.test(href)) limpio.setAttribute('rel', 'noopener');
  }
  for (const hijo of nodo.childNodes) limpio.append(limpiar(hijo));
  return limpio;
}

// Crea un elemento: el(etiqueta, clase, contenido). El contenido puede ser texto plano o nodos.
function el(etiqueta, clase, ...hijos) {
  const e = document.createElement(etiqueta);
  if (clase) e.className = clase;
  e.append(...hijos.filter((h) => h != null));
  return e;
}

const parrafo = (texto, clase) => el('p', clase, html(texto));

function titulos(seccion, datos) {
  seccion.append(el('h2', 'seccion__titulo', datos.titulo));
  if (datos.entrada) seccion.append(parrafo(datos.entrada, 'seccion__entrada'));
}

function pintarPortada(seccion, d) {
  const botones = el('p', 'portada__botones');
  (d.botones ?? []).forEach((b, i) => {
    const a = el('a', i === 0 ? 'boton' : 'boton boton--secundario', b.texto);
    if (ENLACE_VALIDO.test(b.enlace)) a.href = b.enlace;
    botones.append(a, ' ');
  });
  seccion.append(el('h1', null, d.titular), parrafo(d.entrada));
  if (d.detalle) seccion.append(parrafo(d.detalle, 'nota'));
  seccion.append(botones);
}

function pintarComoFunciona(seccion, d) {
  titulos(seccion, d);
  const rejilla = el('div', 'rejilla');
  d.pasos.forEach((p, i) => {
    rejilla.append(el('article', 'tarjeta', el('h3', null, `${i + 1}. ${p.titulo}`), parrafo(p.texto)));
  });
  const r = d.recuadro;
  if (r) {
    const lista = el('ul', null, ...r.puntos.map((t) => el('li', null, html(t))));
    const enlace = r.enlace && ENLACE_VALIDO.test(r.enlace.href)
      ? el('p', null, Object.assign(el('a', null, r.enlace.texto), { href: r.enlace.href }))
      : null;
    rejilla.append(el('aside', 'tarjeta tarjeta--ancha tarjeta--destacada', el('h3', null, r.titulo), lista, enlace));
  }
  seccion.append(rejilla);
}

function pintarInstalar(seccion, d) {
  titulos(seccion, d);
  if (d.requisitos?.length) {
    seccion.append(el('ul', null, ...d.requisitos.map((t) => el('li', null, html(t)))));
  }
  for (const c of d.comandos ?? []) {
    const codigo = el('code');
    codigo.textContent = c.comando; // nunca HTML
    seccion.append(parrafo(c.explicacion), el('pre', 'codigo', codigo));
  }
  if (d.nota) seccion.append(parrafo(d.nota, 'nota'));
}

function pintarPreguntas(seccion, d) {
  titulos(seccion, d);
  for (const p of d.lista ?? []) {
    seccion.append(el('details', null, el('summary', null, p.pregunta), parrafo(p.respuesta)));
  }
}

const PINTORES = {
  portada: pintarPortada,
  'como-funciona': pintarComoFunciona,
  instalar: pintarInstalar,
  preguntas: pintarPreguntas,
};

export async function iniciarTextos() {
  let textos;
  try {
    const r = await fetch(RUTA_TEXTOS);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    textos = await r.json();
  } catch (error) {
    console.error('No se han podido cargar los textos:', error);
    for (const id of Object.keys(PINTORES)) {
      document.getElementById(id)?.append(el('p', 'nota', 'No se han podido cargar los textos de esta sección.'));
    }
    return;
  }
  for (const [id, pintar] of Object.entries(PINTORES)) {
    const seccion = document.getElementById(id);
    if (!seccion || !textos[id]) continue;
    try {
      pintar(seccion, textos[id]);
    } catch (error) {
      console.error(`Error al pintar #${id}:`, error);
    }
  }
}
