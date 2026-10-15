// Dueño: Miles. Pinta los textos de Simone (web/contenido/textos.json)
// en las secciones portada, puertas, como-funciona, instalar, preguntas, como-se-forma-el-precio,
// como-se-ha-hecho y equipo.
// Cada pintor busca su id en la página que esté abierta; si no está, no hace nada.
//
// Uso (desde main.js):
//   import { iniciarTextos } from './textos.js';
//   iniciarTextos();
//
// Seguridad: dentro de los textos solo se aceptan <strong>, <code> y <a> (con enlace http(s), #ancla
// o una página de esta web, como como-funciona.html#instalar).
// Cualquier otra etiqueta se muestra como texto. Por qué no innerHTML a pelo: si algún día entra
// un <script> o un onclick en el JSON, no debe ejecutarse. Los comandos se pintan con textContent,
// así que un < en un comando nunca se interpreta.

const ETIQUETAS = new Set(['STRONG', 'CODE', 'A']);
const ENLACE_VALIDO = /^(https?:\/\/|#|[a-z0-9-]+\.html(#[a-z0-9-]+)?$)/i;

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
  if (botones.childElementCount) seccion.append(botones); // sin botones, ni el hueco del margen
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

// Puertas de la portada: tarjetas que enteras son un enlace (.puerta de Maya). Sustituyen al texto
// de respaldo de index.html, que se queda para quien navega sin JavaScript. La primera es la principal.
// Solo enlaces a páginas de esta web o anclas: una puerta no saca al visitante fuera.
function pintarPuertas(contenedor, lista) {
  const puertas = lista
    .filter((p) => /^([a-z0-9-]+\.html|#)/i.test(p.enlace ?? ''))
    .map((p, i) => {
      const a = el('a', i === 0 ? 'puerta puerta--principal' : 'puerta', el('h3', null, p.titulo), parrafo(p.texto));
      a.href = p.enlace;
      return a;
    });
  if (puertas.length) contenedor.replaceChildren(...puertas);
}

// «Cómo se ha hecho»: es el título de su página, así que va en h1. Sustituye al texto de respaldo.
function pintarComoSeHaHecho(seccion, d) {
  const rejilla = el('div', 'rejilla',
    ...(d.tarjetas ?? []).map((t) => el('article', 'tarjeta', el('h3', null, t.titulo), parrafo(t.texto))));
  seccion.replaceChildren(
    el('h1', 'seccion__titulo', d.titulo),
    parrafo(d.entrada, 'seccion__entrada'),
    rejilla,
    d.historia ? parrafo(d.historia) : null,
  );
}

// «Cómo se forma el precio»: título de su página (h1), cuatro pasos en tarjetas y «El mercado por dentro».
// Cada ficha enseña el gancho; el detalle y la fuente van dentro de <details>, a un clic.
function pintarComoSeFormaElPrecio(seccion, d) {
  const pasos = el('div', 'rejilla',
    ...(d.pasos ?? []).map((p, i) => el('article', 'tarjeta', el('h3', null, `${i + 1}. ${p.titulo}`), parrafo(p.texto))));
  const m = d['mercado-por-dentro'];
  const fichas = m ? el('div', 'rejilla fichas', ...(m.fichas ?? []).map((f) => {
    const fuente = f.fuente && /^https?:\/\//i.test(f.fuente.href)
      ? el('p', 'nota', 'Fuente: ', Object.assign(el('a', null, f.fuente.texto), { href: f.fuente.href, rel: 'noopener' }))
      : null;
    return el('article', 'tarjeta ficha',
      el('h3', null, f.titulo),
      parrafo(f.gancho),
      el('details', 'ficha__detalle', el('summary', null, 'Ver el detalle'), parrafo(f.detalle), fuente));
  })) : null;
  seccion.replaceChildren(
    el('h1', 'seccion__titulo', d.titulo),
    parrafo(d.entrada, 'seccion__entrada'),
    pasos,
    m ? el('h2', 'seccion__titulo', m.titulo) : null,
    m?.entrada ? parrafo(m.entrada, 'seccion__entrada') : null,
    fichas,
  );
}

// «El equipo», dentro de «Cómo se ha hecho»: una tarjeta de una línea por miembro y las debilidades en .nota.
function pintarEquipo(seccion, d) {
  const rejilla = el('div', 'rejilla',
    ...(d.miembros ?? []).map((m) => el('article', 'tarjeta', el('h3', null, m.nombre), parrafo(m.papel))));
  seccion.replaceChildren(
    el('h2', 'seccion__titulo', d.titulo),
    rejilla,
    d.debilidades ? parrafo(d.debilidades, 'nota') : null,
  );
}

const PINTORES = {
  portada: pintarPortada,
  puertas: pintarPuertas,
  'como-funciona': pintarComoFunciona,
  instalar: pintarInstalar,
  preguntas: pintarPreguntas,
  'como-se-forma-el-precio': pintarComoSeFormaElPrecio,
  'como-se-ha-hecho': pintarComoSeHaHecho,
  equipo: pintarEquipo,
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
