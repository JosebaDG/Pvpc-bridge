// Dueño: Charlie.
// Dibuja las gráficas de la web sin librerías:
// - precio-hoy: 24 barras en SVG hecho a mano (SVG = dibujo con formas que el navegador escala sin
//   perder nitidez y que se puede inspeccionar como el resto de la página).
//   Cada barra lleva su precio escrito (tres decimales), como en puente_luz.py y aviso_nocturno.py.
//   En pantallas anchas, columnas con el precio encima; en móvil, filas con el precio al final.
//   Si el día no es hoy, la cabecera lo dice en grande y no hay «ahora» ni cifra de ahora.
//   Al deslizar o con las flechas no se repite el precio: se compara con el día anterior a esa hora.
// - historico: mapa de calor día × hora en canvas (canvas = un lienzo de píxeles; con unas 41.000
//   celdas es mucho más rápido que crear 41.000 elementos SVG) y la media mensual como línea.
// - acerto: tarjeta «¿Acertó el mercado?», debajo de la gráfica de hoy. Compara el tiempo que se
//   preveía para ayer cuando se fijó su precio con el que hizo, y la luz de ayer con la de anteayer.
// - apuesta: «¿Más barata o más cara mañana?», debajo de la anterior. Hasta las 12:00 (hora
//   peninsular), cuando cierra la subasta de mañana, se apuesta por la tarde (14 a 17 h); la racha
//   se guarda solo en el navegador.
// - equipo-tiempo: «El equipo en el tiempo», en SVG. Un carril por agente y una barra por PR,
//   desde que se abre hasta que se fusiona. Lee web/datos/actividad.json (datos públicos de GitHub).
//
// Uso (desde main.js):
//   import { iniciarGraficas } from './graficas.js';
//   iniciarGraficas();
// Busca #precio-hoy [data-grafica="hoy"], #precio-hoy [data-grafica="acerto"], #precio-hoy [data-grafica="apuesta"],
// #historico [data-grafica="historico"] y #equipo-tiempo [data-grafica="equipo"], y rellena los
// que haya en la página.

import {
  precioDelDia, precioDelDiaAnterior, compararPrecio, cargarHistorico, tercios, mejorBloque, PRIMER_AÑO,
  cargarActividad, ZONA, diaDeHoy, diaAnterior, tiempoPrevistoYReal, generacionDiaria,
  cargarDia, diaSiguiente, tiempoEnHoras, horaEnZona, pistasEjemplo,
} from './datos.js';

// ---------- Colores: solo variables CSS de Maya (web/css/tokens.css) ----------
// Lo que ella pidió para las gráficas: --c-barato, --c-medio y --c-caro para el precio,
// --c-tinta-2 para los ejes, --c-acento para marcar la hora actual y el mejor bloque, y
// --c-chispa solo como halo detrás de la hora actual (el lima como línea apenas se ve en claro).
// El segundo valor es una reserva con el color de Maya en modo claro: solo se usa si la variable
// aún no existe (mientras su PR #16 no esté en main). Cuando lo esté, se puede quitar.
const COLORES = {
  barato: ['--c-barato', '#0f9d76'],
  medio: ['--c-medio', '#e0a21b'],
  caro: ['--c-caro', '#e2474f'],
  tinta: ['--c-tinta', '#15171c'], // texto principal y línea de la media mensual
  eje: ['--c-tinta-2', '#565b66'], // etiquetas de los ejes
  rejilla: ['--c-borde', '#dcd8cf'], // líneas guía
  pista: ['--c-superficie-2', '#ebe8e1'], // relleno bajo la línea de la media mensual
  acento: ['--c-acento', '#3b5bfd'], // contorno del mejor bloque y marca de la hora actual
  chispa: ['--c-chispa', '#c8f03c'], // halo detrás de la hora actual
  superficie: ['--c-superficie', '#ffffff'], // celdas sin dato del mapa de calor
};
const color = (nombre) => `var(${COLORES[nombre][0]}, ${COLORES[nombre][1]})`;

// El canvas no entiende var(...): hay que convertir la variable en un color real.
// Truco: se pinta un elemento invisible con ese color, se lee el color calculado y se pasa por
// un canvas de 1×1 píxel para obtener siempre [rojo, verde, azul, opacidad].
function resolverColor(nombre, dentroDe) {
  const sonda = document.createElement('span');
  sonda.style.cssText = `position:absolute;visibility:hidden;color:${color(nombre)}`;
  dentroDe.appendChild(sonda);
  const css = getComputedStyle(sonda).color;
  sonda.remove();
  const c = document.createElement('canvas');
  c.width = c.height = 1;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = css;
  ctx.fillRect(0, 0, 1, 1);
  return Array.from(ctx.getImageData(0, 0, 1, 1).data);
}
const rgba = ([r, g, b, a], alfa = 1) => `rgba(${r},${g},${b},${((a / 255) * alfa).toFixed(3)})`;

// ---------- Formatos en español ----------
const num = (d) => new Intl.NumberFormat('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d });
const f3 = num(3);
const f2 = num(2);
// Unidades sin partir: espacio de no separación (\u00a0) entre la
// cifra y la unidad, y unión invisible (\u2060) tras la barra para que «€/kWh» no se corte en dos.
const UNIDAD = '\u00a0€/\u2060kWh';
const euros = (p) => `${f3.format(p)}${UNIDAD}`;
const dos = (n) => String(n).padStart(2, '0');
const tramo = (h) => `${dos(h)}–${dos((h + 1) % 24)} h`;
const aFecha = (f) => new Date(`${f}T12:00:00Z`);
const fechaLarga = (f) => new Intl.DateTimeFormat('es-ES', {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
}).format(aFecha(f)).replace(',', ''); // «miércoles 14 de octubre de 2026», sin coma
const diaSemana = (f) => new Intl.DateTimeFormat('es-ES', { weekday: 'long', timeZone: 'UTC' }).format(aFecha(f));
const fechaCorta = (f) => new Intl.DateTimeFormat('es-ES', {
  day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
}).format(aFecha(f));
const mesAño = (a, m) => new Intl.DateTimeFormat('es-ES', {
  month: 'long', year: 'numeric', timeZone: 'UTC',
}).format(new Date(Date.UTC(a, m - 1, 15)));
const NOMBRE_TERCIO = { barato: 'barata', medio: 'precio medio', caro: 'cara' };
const PALABRA_TERCIO = { barato: 'Hora barata', medio: 'Hora de precio medio', caro: 'Hora cara' };

// ---------- Utilidades ----------
const SVG = 'http://www.w3.org/2000/svg';
function el(etiqueta, attrs = {}, hijos = [], ns = null) {
  const n = ns ? document.createElementNS(ns, etiqueta) : document.createElement(etiqueta);
  let estilo = attrs.style || '';
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || k === 'style') continue;
    if (k === 'texto') n.textContent = v;
    // Un color con var(...) va en style: así lo entienden todos los navegadores, también en SVG.
    else if (typeof v === 'string' && v.startsWith('var(')) estilo += `;${k}:${v}`;
    else n.setAttribute(k, v);
  }
  if (estilo) n.setAttribute('style', estilo.replace(/^;/, ''));
  for (const h of [].concat(hijos)) if (h) n.append(h);
  return n;
}
const s = (etiqueta, attrs, hijos) => el(etiqueta, attrs, hijos, SVG);

// Marcas «redondas» para un eje (0,05 · 0,10 · 0,15...), unas 4 entre min y max.
function marcas(min, max, cuantas = 4) {
  const bruto = (max - min) / cuantas;
  const mag = 10 ** Math.floor(Math.log10(bruto));
  const paso = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((p) => p >= bruto);
  const lista = [];
  for (let v = Math.ceil(min / paso) * paso; v <= max + 1e-9; v += paso) lista.push(Math.round(v / paso) * paso);
  return lista;
}

// Vuelve a dibujar cuando cambia el ancho del contenedor (girar el móvil, redimensionar).
function alCambiarAncho(contenedor, dibujar) {
  let ancho = -1;
  let pendiente = false;
  const comprobar = () => {
    pendiente = false;
    const w = Math.round(contenedor.clientWidth);
    if (w > 0 && w !== ancho) { ancho = w; dibujar(w); }
  };
  new ResizeObserver(() => {
    if (!pendiente) { pendiente = true; requestAnimationFrame(comprobar); }
  }).observe(contenedor);
  comprobar();
}

function muestra(nombre, extra = '') {
  return el('span', {
    class: 'grafica-muestra',
    'aria-hidden': 'true',
    style: `display:inline-block;width:.9em;height:.9em;border-radius:.2em;vertical-align:-.1em;margin-right:.35em;background:${color(nombre)};${extra}`,
  });
}

function mostrarError(contenedor, texto) {
  contenedor.replaceChildren(el('p', { class: 'grafica-error', texto }));
}

// =====================================================================
// Precio de hoy: 24 barras en SVG
// =====================================================================

// Al volver a pintar la gráfica de hoy se quita el aviso de desplazamiento de la burbuja anterior.
let quitarAvisoBurbuja = () => {};

export function pintarPrecioHoy(contenedor, dia) {
  const { horas, fecha, esHoy, fuente } = dia;
  const grupo = tercios(horas);
  const bloque = mejorBloque(horas, 3);
  const precios = horas.map((h) => h.precio);
  const iMin = precios.indexOf(Math.min(...precios));
  const iMax = precios.indexOf(Math.max(...precios));
  const media = precios.reduce((a, b) => a + b, 0) / precios.length;
  const enBloque = (i) => i >= bloque.inicio && i <= bloque.fin;
  const destacada = (i) => i === iMin || i === iMax || enBloque(i); // su precio va en negrita
  const ahora = Date.now();
  // La hora actual solo existe si el día es hoy: con datos de otro día no hay «ahora».
  const iAhora = esHoy ? horas.findIndex((h) => ahora >= h.utc && ahora < h.utc + 3600e3) : -1;
  const tramoBloque = `${dos(horas[bloque.inicio].hora)}–${dos((horas[bloque.fin].hora + 1) % 24)} h`;

  // El título de la sección dice «hoy» solo cuando de verdad es hoy.
  const titulo = contenedor.closest('section')?.querySelector('.seccion__titulo');
  if (titulo) {
    titulo.textContent = esHoy
      ? 'El precio de la luz, hoy'
      : `El precio de la luz del ${fechaLarga(fecha).replace(/ de \d{4}$/, '')}`;
  }

  // Cabecera: la fecha en grande. Si no es hoy, otra etiqueta, otro estilo y la explicación,
  // para que de un vistazo nadie confunda el último día guardado con el de hoy.
  const cabecera = esHoy
    ? el('div', { class: 'grafica-fecha', 'data-estado': 'hoy', style: 'margin-bottom:1rem' }, [
      el('p', {
        style: 'margin:0;font-size:var(--t-l, 1.375rem);font-weight:var(--peso-fuerte, 760);line-height:1.15',
        texto: `Hoy, ${fechaLarga(fecha)}`,
      }),
      el('p', { class: 'nota', style: 'margin:.25rem 0 0', texto: fuente === 'redata' ? 'En directo de Red Eléctrica (REData).' : 'Datos del repositorio.' }),
    ])
    : el('div', {
      class: 'grafica-fecha', 'data-estado': 'atrasado', role: 'status',
      style: `margin-bottom:1rem;padding:.75rem 1rem;border-radius:var(--r-s, 8px);border:2px dashed ${color('eje')};background:${color('pista')}`,
    }, [
      el('p', {
        style: 'margin:0 0 .35rem;font-size:var(--t-xs, .8125rem);font-weight:var(--peso-fuerte, 760);letter-spacing:.06em;text-transform:uppercase',
        texto: 'Todavía no hay los de hoy',
      }),
      el('p', {
        style: 'margin:0;font-size:var(--t-xl, 2rem);font-weight:var(--peso-fuerte, 760);line-height:1.1;letter-spacing:-.02em',
        texto: `Datos del ${fechaLarga(fecha).replace(/ de \d{4}$/, '')}`,
      }),
      el('p', { class: 'nota', style: 'margin:.4rem 0 0', texto: 'No se ha podido leer el precio de hoy de Red Eléctrica, así que se muestra el último día guardado en el repositorio.' }),
    ]);

  const resumen = el('p', { class: 'grafica-resumen' }, [
    'Más barata: ', el('strong', { texto: tramo(horas[iMin].hora) }), `, ${euros(precios[iMin])}. `,
    'Más cara: ', el('strong', { texto: tramo(horas[iMax].hora) }), `, ${euros(precios[iMax])}. `,
    'Mejor bloque de 3 horas seguidas: ', el('strong', { texto: tramoBloque }), `, media ${euros(bloque.media)}. `,
    `Media del día: ${euros(media)}.`,
  ]);

  const detalle = el('p', {
    class: 'nota grafica-detalle', 'aria-live': 'polite', style: 'min-height:1.5em',
    texto: 'Toca una barra o desliza el dedo por la gráfica para ver el precio de cada hora. Con teclado, usa las flechas.',
  });

  // Burbuja del gesto (móvil). En filas la gráfica mide unos 650 px y el párrafo del detalle
  // queda debajo, fuera de la pantalla o tapado por la barra de apartados, justo mientras el dedo
  // recorre las horas. Mientras dura el gesto con dedo o lápiz, y salvo que ese párrafo se vea
  // entero a menos de dos filas del dedo, se enseña una copia de su frase fija en la pantalla,
  // cerca del dedo: justo encima,
  // con su borde de abajo a 44 px del punto que toca (algo más de una fila), para leerla sin
  // apartar la vista de la barra. Si arriba no cabe (dedo pegado al menú), pasa debajo, a 72 px:
  // la yema tapa más hacia abajo que hacia arriba. Y si aun así no cabe, se corre lo justo para
  // quedar entre el menú y la barra de apartados. Al soltar se va sola.
  // - Es solo para la vista (aria-hidden): el lector de pantalla sigue con el aria-live de siempre
  //   y no lo oye dos veces.
  // - Va en <body>, no en la tarjeta: así ningún antecesor con transform rompe el position:fixed.
  // - Estilos en línea con los tokens de Maya, sin tocar base.css; ella puede pasarlos a una clase.
  // - Se decide por la distancia del dedo al párrafo, no por si el párrafo se ve, y en cada
  //   movimiento. Antes bastaba con verlo entero al empezar el gesto: con la gráfica subida (las
  //   primeras barras fuera de la pantalla) el párrafo asomaba abajo, no salía la burbuja y la
  //   frase se leía solo al fondo de la pantalla, lejos del dedo; y si asomaba a medias, unas
  //   veces salía y otras no (se vio en un móvil real). Ahora solo se omite cuando el párrafo
  //   está entero en la zona libre y a menos de dos filas del dedo, porque entonces ya está junto
  //   a él. Para volver a salir pide media fila más: sin parpadeos en el límite.
  // - Si el navegador se queda el gesto para desplazar la página (pointercancel) o la página se
  //   mueve con la burbuja fuera de un gesto, se va al momento: fija en la pantalla, ya no
  //   señalaría la hora que se lee.
  // Descartado: mover el propio párrafo a position:fixed (la página saltaría al sacarlo del flujo
  // y el aria-live repetiría), desplazar la página hasta la frase (el dedo perdería su hora),
  // fijarla arriba o abajo de la pantalla (primera versión: con el dedo en medio se iba lejos y
  // tapaba la fecha) y dejarla a 3 o 4 filas (unos 110 px: el ojo tiene que saltar).
  document.querySelectorAll('.grafica-burbuja').forEach((b) => b.remove()); // si se vuelve a pintar
  const burbuja = el('div', {
    class: 'grafica-burbuja', 'aria-hidden': 'true', hidden: '',
    style: [
      'position:fixed', 'left:max(var(--e-4, 1rem), env(safe-area-inset-left))',
      'right:max(var(--e-4, 1rem), env(safe-area-inset-right))', 'z-index:11', 'max-width:32rem', 'margin-inline:auto',
      'padding:.6rem .9rem', 'border-radius:var(--r-m, 14px)', 'border:1px solid var(--c-borde, #d9d5cc)',
      'background:var(--c-superficie, #fff)', 'color:var(--c-tinta, #14161c)', 'box-shadow:var(--sombra, 0 8px 24px rgb(20 22 28 / .12))',
      'font-size:var(--t-s, .9375rem)', 'line-height:1.35', 'font-variant-numeric:tabular-nums', 'pointer-events:none',
    ].join(';'),
  });
  document.body.append(burbuja);
  let burbujaArriba = false;
  let soltarBurbuja = 0;
  // Zona libre de la pantalla: entre el menú de arriba (sticky) y la barra de apartados de abajo
  // (fija en el móvil). Si no hay barra abajo, hasta el borde de la ventana.
  const zonaLibre = () => {
    const alto = window.visualViewport?.height ?? window.innerHeight;
    const menu = document.querySelector('.menu')?.getBoundingClientRect();
    const barra = document.querySelector('.menu__lista')?.getBoundingClientRect();
    const arriba = menu && menu.bottom > 0 && menu.top <= 0 ? menu.bottom : 0;
    const abajo = barra && barra.top > alto / 2 && barra.height > 0 ? barra.top : alto;
    return { arriba, abajo };
  };
  // Alto de una fila de la gráfica en pantalla: en filas, el de la franja de las horas entre 24;
  // en columnas (barras verticales), el de una fila del móvil, unos 26 px.
  const altoFila = () => {
    const f = lienzo.querySelector('.grafica-franja-horas')?.getBoundingClientRect();
    return f && f.height > 0 ? f.height / horas.length : 26;
  };
  // Distancia en px del dedo al párrafo del detalle, si el párrafo se ve entero; si no, Infinity.
  const distanciaDetalle = (dedoY) => {
    const r = detalle.getBoundingClientRect();
    const z = zonaLibre();
    if (!(r.height > 0 && r.top >= z.arriba && r.bottom <= z.abajo)) return Infinity;
    return Math.max(r.top - dedoY, dedoY - r.bottom, 0);
  };
  let enGesto = false;
  const copiarFrase = () => {
    const copia = [...detalle.childNodes].map((n) => n.cloneNode(true));
    burbuja.replaceChildren(...copia);
    burbuja.querySelectorAll('.solo-lector').forEach((n) => n.remove()); // el precio de hoy ya va en la barra
  };
  const SEPARACION_ARRIBA = 44; // del punto del dedo al borde de abajo de la burbuja
  const SEPARACION_ABAJO = 72; // del punto del dedo al borde de arriba, cuando va debajo
  const VUELTA = 24; // margen para volver arriba: sin parpadeos en el límite
  const colocarBurbuja = (dedoY) => {
    const z = zonaLibre();
    const margen = 8;
    const h = burbuja.getBoundingClientRect().height;
    const topArriba = dedoY - SEPARACION_ARRIBA - h;
    const limite = z.arriba + margen;
    // Encima del dedo siempre que quepa. Ya debajo, solo vuelve arriba con VUELTA px de sobra.
    if (!burbujaArriba) burbujaArriba = topArriba >= limite + VUELTA;
    else if (topArriba < limite) burbujaArriba = false;
    const top = burbujaArriba ? topArriba : dedoY + SEPARACION_ABAJO;
    // Dentro de la zona libre: sin pisar el menú ni la barra de apartados.
    const minimo = z.arriba + margen;
    const maximo = Math.max(minimo, z.abajo - margen - h);
    burbuja.style.top = `${Math.round(Math.min(Math.max(top, minimo), maximo))}px`;
    burbuja.style.bottom = 'auto';
  };
  const gestoBurbuja = (ev, fase) => {
    if (ev.pointerType === 'mouse') return; // con ratón la frase ya se ve: la gráfica es baja
    clearTimeout(soltarBurbuja);
    if (fase === 'cancela') { // el navegador se ha quedado el gesto para desplazar la página
      enGesto = false;
      burbuja.hidden = true;
      return;
    }
    if (fase === 'fin') {
      enGesto = false;
      soltarBurbuja = setTimeout(() => { burbuja.hidden = true; }, 1500); // un momento para leerla
      return;
    }
    if (fase === 'inicio') enGesto = true;
    if (!enGesto) return;
    const cerca = 2 * altoFila();
    const distancia = distanciaDetalle(ev.clientY);
    if (burbuja.hidden ? distancia < cerca + altoFila() / 2 : distancia < cerca) {
      burbuja.hidden = true; // el párrafo ya está junto al dedo
      return;
    }
    copiarFrase();
    const nueva = burbuja.hidden;
    if (nueva) {
      burbujaArriba = true; // cada gesto empieza encima del dedo, si cabe
      burbuja.style.visibility = 'hidden'; // medirla sin que se vea en un sitio provisional
      burbuja.hidden = false;
    }
    colocarBurbuja(ev.clientY);
    burbuja.style.visibility = '';
  };
  quitarAvisoBurbuja();
  const alDesplazar = () => {
    if (!enGesto && !burbuja.hidden) { clearTimeout(soltarBurbuja); burbuja.hidden = true; }
  };
  addEventListener('scroll', alDesplazar, { passive: true });
  quitarAvisoBurbuja = () => removeEventListener('scroll', alDesplazar);

  // Comparación con el día anterior (ayer, si el día es hoy). El precio ya va escrito en cada
  // barra, así que al deslizar no se repite: se dice cómo estaba el día antes a esa misma hora.
  // Se carga después de dibujar (no retrasa la gráfica) y, si no hay datos, no se enseña nada.
  let anterior = null; // { fecha, porHora: Map(hora -> precio) }
  const nombreAnterior = esHoy ? 'ayer' : 'el día anterior';
  const tactil = matchMedia('(hover: none), (pointer: coarse)').matches;
  // Pista para descubrir el gesto, encima de la gráfica. Oculta hasta que haya datos del día antes.
  const pista = el('p', {
    class: 'nota grafica-pista', hidden: '', style: 'margin:0 0 .5rem',
    texto: tactil
      ? `Desliza por las barras para comparar con ${nombreAnterior}.`
      : `Pasa el ratón o usa las flechas para comparar con ${nombreAnterior}.`,
  });

  // Leyenda con las etiquetas .tramo de Maya: color y palabra siempre juntos (daltonismo).
  const leyenda = el('ul', { class: 'grafica-leyenda', style: 'list-style:none;padding:0;margin:0 0 1rem;display:flex;flex-wrap:wrap;align-items:center;gap:.5em 1em' }, [
    el('li', {}, el('span', { class: 'tramo tramo--barato', texto: 'Las 8 más baratas' })),
    el('li', {}, el('span', { class: 'tramo tramo--medio', texto: 'Las 8 del medio' })),
    el('li', {}, el('span', { class: 'tramo tramo--caro', texto: 'Las 8 más caras' })),
    el('li', {}, [muestra('superficie', `outline:2px solid ${color('acento')};outline-offset:-2px`), 'Mejor bloque de 3 h']),
    el('li', {}, [el('span', { 'aria-hidden': 'true', style: `display:inline-block;width:1.4em;vertical-align:.25em;margin-right:.35em;border-top:2px dashed ${color('eje')}` }), `Media del día, ${f3.format(media)}`]),
    // Hora actual: solo el halo chispa, sin contorno; el contorno de acento es del mejor bloque (punto 5).
    iAhora >= 0 ? el('li', {}, [muestra('chispa'), 'Hora actual']) : null,
  ]);

  // El precio de ahora, en grande (.cifra de Maya), con su tramo. Solo si el día es hoy.
  const ahoraBloque = iAhora >= 0
    ? el('div', { class: 'grafica-ahora', style: 'display:flex;flex-wrap:wrap;align-items:baseline;gap:.4em 1em;margin-bottom:1rem' }, [
      el('span', { class: 'cifra' }, [f3.format(precios[iAhora]), el('span', { class: 'cifra__unidad', texto: '€/kWh ahora' })]),
      el('span', { class: `tramo tramo--${grupo[iAhora]}`, texto: `${PALABRA_TERCIO[grupo[iAhora]]} · ${tramo(horas[iAhora].hora)}` }),
    ])
    : null;

  // Los mismos precios en una tabla, plegada: la alternativa accesible a la gráfica.
  const tabla = el('details', { class: 'grafica-tabla', style: 'margin:0 0 1rem' }, [
    el('summary', { texto: 'Ver los 24 precios en una tabla' }),
    el('table', { style: 'border-collapse:collapse;margin-top:.5rem;font-variant-numeric:tabular-nums' }, [
      el('caption', { class: 'nota', style: 'text-align:left', texto: `Precio por horas del ${fechaLarga(fecha)}, en €/kWh y sin impuestos` }),
      el('thead', {}, el('tr', {}, ['Hora', '€/kWh', 'Tramo'].map((t) => el('th', { scope: 'col', style: 'text-align:left;padding:.2em 1em .2em 0', texto: t })))),
      el('tbody', {}, horas.map((h, i) => el('tr', {}, [
        el('th', { scope: 'row', style: 'text-align:left;padding:.15em 1em .15em 0;font-weight:inherit', texto: tramo(h.hora) }),
        el('td', { style: 'text-align:right;padding:.15em 1em .15em 0', texto: f3.format(h.precio) }),
        el('td', { texto: `${NOMBRE_TERCIO[grupo[i]]}${enBloque(i) ? ', mejor bloque' : ''}${i === iAhora ? ', ahora' : ''}` }),
      ]))),
    ]),
  ]);

  const nota = el('p', { class: 'nota grafica-nota', texto: 'PVPC 2.0TD de la península, en €/kWh y sin impuestos. Fuente: Red Eléctrica (REE), REData.' });

  // position:relative para la franja táctil de las horas en el dibujo en filas (ver hacerDeslizable).
  const lienzo = el('div', { class: 'grafica-lienzo', style: 'position:relative' });
  contenedor.replaceChildren(...[cabecera, ahoraBloque, pista, lienzo, detalle, resumen, leyenda, tabla, nota].filter(Boolean));

  // Hora elegida (con el dedo, el ratón o el teclado). Vive fuera del SVG para que sobreviva
  // cuando se redibuja al cambiar el ancho. -1: todavía ninguna.
  let elegida = -1;
  let marcarEnDibujo = () => {}; // la pone el dibujo actual: mueve el marco y el foco
  // Frase de la hora i. Con datos del día antes: «12–13 h · ayer 0,192 · ▼ hoy un 23 % más barato».
  // El sentido va siempre en palabras (más barato, más caro, casi igual); la flecha y el color
  // solo lo refuerzan. El precio de hoy no se ve (ya está en la barra), pero el lector de pantalla
  // lo lee, porque en la barra va oculto para él. Sin datos del día antes, la frase de siempre.
  const escribirDetalle = (i) => {
    const h = horas[i];
    const ref = anterior?.porHora.get(h.hora);
    if (ref === undefined) {
      detalle.textContent = `${tramo(h.hora)}: ${euros(h.precio)} (${NOMBRE_TERCIO[grupo[i]]}${enBloque(i) ? ', dentro del mejor bloque' : ''}${i === iAhora ? ', ahora' : ''})`;
      return;
    }
    const cmp = compararPrecio(h.precio, ref);
    const sujeto = esHoy ? 'hoy' : `el ${diaSemana(fecha)}`;
    const quien = esHoy ? 'ayer' : diaSemana(anterior.fecha);
    const flecha = { barato: '▼', caro: '▲', igual: '=' }[cmp.sentido];
    const colorFlecha = { barato: color('barato'), caro: color('caro'), igual: color('eje') }[cmp.sentido];
    detalle.replaceChildren(
      `${tramo(h.hora)} · `,
      el('span', { class: 'solo-lector', texto: `${sujeto} ${euros(h.precio)}, ` }),
      `${quien} ${f3.format(ref)} · `,
      el('strong', {}, [
        // En «igual», sin símbolo: «hoy casi igual» ya lo dice.
        ...(cmp.sentido === 'igual' ? [] : [el('span', { 'aria-hidden': 'true', style: `color:${colorFlecha};margin-right:.25em`, texto: flecha })]),
        cmp.sentido === 'igual' ? `${sujeto} casi igual` : `${sujeto} ${cmp.texto}`,
      ]),
    );
  };
  const verDetalle = (i) => {
    if (i < 0 || i >= horas.length || i === elegida) return; // sin repetir el aviso de aria-live
    elegida = i;
    escribirDetalle(i);
    if (!burbuja.hidden) copiarFrase();
    marcarEnDibujo(i);
  };
  precioDelDiaAnterior(fecha).then((dia) => {
    if (!dia) return; // sin datos del día antes: ni pista ni comparación, y ningún error
    const porHora = new Map();
    for (const h of dia.horas) if (!porHora.has(h.hora)) porHora.set(h.hora, h.precio); // cambio de hora: la primera
    anterior = { fecha: dia.fecha, porHora };
    pista.hidden = false;
    if (elegida >= 0) escribirDetalle(elegida);
    else detalle.textContent = '';
    if (!burbuja.hidden) copiarFrase();
  }).catch((e) => console.warn('día anterior:', e));
  // Con el teclado solo se entra una vez en la gráfica (tabindex «itinerante»): la barra elegida,
  // o la actual, o la más barata. Dentro, las flechas mueven de hora en hora.
  const barraConFoco = () => (elegida >= 0 ? elegida : (iAhora >= 0 ? iAhora : iMin));
  const barraInteractiva = (barra, i) => {
    barra.setAttribute('tabindex', i === barraConFoco() ? '0' : '-1');
    barra.append(s('title', { texto: `${tramo(horas[i].hora)}: ${euros(horas[i].precio)} (${NOMBRE_TERCIO[grupo[i]]})` }));
    barra.addEventListener('click', () => verDetalle(i));
    barra.addEventListener('focus', () => verDetalle(i));
  };

  // Deslizar para ver el precio de cada hora.
  // - Pointer events: un solo código para ratón, dedo y lápiz. Al tocar, setPointerCapture hace
  //   que el SVG siga recibiendo el movimiento aunque el dedo salga de la barra, y se elige la
  //   hora más cercana al dedo (no hace falta acertar en la barra, que puede medir 1 px).
  // - touch-action: pan-y. En columnas, deslizar en horizontal recorre las horas y en vertical
  //   la página se desplaza como siempre. En filas (móvil) la gráfica mide unos 650 px: si se
  //   quedara el gesto vertical, la página no se podría desplazar con el dedo encima. Por eso,
  //   en filas, el gesto vertical solo se recoge en la franja de las horas, a la izquierda.
  // - Teclado: flechas (izquierda y arriba, anterior; derecha y abajo, siguiente), Inicio y Fin.
  //   El detalle se lee en el mismo párrafo aria-live de siempre.
  // Descartado: touch-action: none en toda la gráfica (bloquea el desplazamiento en el móvil) y
  // los eventos touch* (otro código aparte para el ratón).
  function hacerDeslizable(svg, barras, indiceEn, colocarMarco, franja = null) {
    const aIndice = (ev) => {
      const r = svg.getBoundingClientRect();
      const vb = svg.viewBox.baseVal;
      const i = indiceEn((ev.clientX - r.left) * (vb.width / r.width), (ev.clientY - r.top) * (vb.height / r.height));
      return Math.min(Math.max(i, 0), barras.length - 1); // fuera del dibujo, la hora del borde
    };
    for (const zona of [svg, franja].filter(Boolean)) {
      zona.addEventListener('pointerdown', (ev) => {
        if (ev.pointerType === 'mouse' && ev.button !== 0) return;
        zona.setPointerCapture(ev.pointerId);
        verDetalle(aIndice(ev));
        gestoBurbuja(ev, 'inicio');
      });
      zona.addEventListener('pointermove', (ev) => {
        // Con ratón basta pasar por encima; con dedo o lápiz, solo mientras se arrastra.
        if (ev.pointerType === 'mouse' || zona.hasPointerCapture(ev.pointerId)) {
          verDetalle(aIndice(ev));
          gestoBurbuja(ev, 'mueve');
        }
      });
      const soltar = (ev) => {
        if (zona.hasPointerCapture(ev.pointerId)) zona.releasePointerCapture(ev.pointerId);
        gestoBurbuja(ev, ev.type === 'pointercancel' ? 'cancela' : 'fin');
      };
      zona.addEventListener('pointerup', soltar);
      zona.addEventListener('pointercancel', soltar);
    }
    svg.addEventListener('keydown', (ev) => {
      const i = barras.indexOf(ev.target);
      if (i < 0) return;
      const ultimo = barras.length - 1;
      const destino = {
        ArrowLeft: i - 1, ArrowUp: i - 1, ArrowRight: i + 1, ArrowDown: i + 1, Home: 0, End: ultimo,
      }[ev.key];
      if (destino === undefined) return;
      ev.preventDefault(); // que las flechas no desplacen la página
      barras[Math.min(Math.max(destino, 0), ultimo)].focus(); // el foco llama a verDetalle
    });
    marcarEnDibujo = (i) => {
      barras.forEach((b, j) => b.setAttribute('tabindex', j === i ? '0' : '-1'));
      colocarMarco(i);
      // Si el foco ya está en la gráfica, va con la hora elegida (sin mover la página).
      if (barras.includes(document.activeElement) && document.activeElement !== barras[i]) {
        barras[i].focus({ preventScroll: true });
      }
    };
    if (elegida >= 0) colocarMarco(elegida); // tras redibujar, la hora elegida sigue marcada
  }
  // Marco de la hora elegida: contorno en tinta, distinto del acento (mejor bloque) y de la
  // chispa (ahora). Va el último para quedar encima y no recoge el puntero.
  const marcoElegida = () => s('rect', {
    fill: 'none', stroke: color('tinta'), 'stroke-width': 2, rx: 4, 'pointer-events': 'none',
    visibility: 'hidden', class: 'grafica-elegida',
  });
  const etiquetaSVG = `Precio por horas del ${fechaLarga(fecha)}${esHoy ? '' : ' (no es hoy: último día con datos)'}. ${resumen.textContent}`;

  // Dos dibujos según el ancho, los dos con el precio escrito en cada barra (como las gráficas
  // de puente_luz.py y aviso_nocturno.py), sin tener que tocarla:
  // - ancho: columnas; el precio va encima, en horizontal si cabe y en vertical si no.
  // - estrecho (móvil): las horas en filas y barras horizontales; el precio va al final de cada
  //   barra con letra legible, sin girar la cabeza.
  alCambiarAncho(lienzo, (W) => {
    const dibujo = W < 560 ? barrasEnFilas(W) : barrasEnColumnas(W);
    lienzo.replaceChildren(...[].concat(dibujo));
  });

  function barrasEnColumnas(W) {
    const fs = 12;
    const hueco = (W - 46) / horas.length;
    // ¿Cabe «0,123» en horizontal sobre la barra? Si no, se escribe en vertical, como en el aviso.
    const vertical = hueco < 42;
    const altoEtiqueta = vertical ? 44 : 18;
    const m = { izq: 40, der: 6, arr: 26 + altoEtiqueta, aba: iAhora >= 0 ? 40 : 26 };
    const H = 330 + (vertical ? 20 : 0);
    const anchoG = W - m.izq - m.der;
    const altoG = H - m.arr - m.aba;
    const yMin = Math.min(0, ...precios);
    const yMax = Math.max(...precios, 0.001);
    const y = (v) => m.arr + altoG * (1 - (v - yMin) / (yMax - yMin));
    const paso = anchoG / horas.length;
    const x = (i) => m.izq + i * paso;
    const anchoBarra = Math.max(2, paso * 0.78);

    const svg = s('svg', {
      viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': etiquetaSVG,
      style: `display:block;max-width:100%;height:auto;font-family:inherit;font-size:${fs}px;overflow:visible;touch-action:pan-y`,
    });
    const barras = [];

    for (const v of marcas(yMin, yMax)) {
      svg.append(
        s('line', { x1: m.izq, x2: W - m.der, y1: y(v), y2: y(v), stroke: v === 0 ? color('eje') : color('rejilla') }),
        s('text', { x: m.izq - 6, y: y(v), dy: '0.32em', 'text-anchor': 'end', fill: color('eje'), texto: f2.format(v) }),
      );
    }
    svg.append(s('text', { x: 0, y: 12, fill: color('eje'), texto: '€/kWh' }));

    // Mejor bloque de 3 horas: contorno en acento que abarca también los precios, y su rótulo.
    const xb = x(bloque.inicio);
    const wb = paso * (bloque.fin - bloque.inicio + 1);
    const cx = Math.min(Math.max(xb + wb / 2, m.izq + 70), W - m.der - 70);
    svg.append(
      s('rect', {
        x: xb + 1, y: 22, width: wb - 2, height: m.arr - 22 + altoG + 4, rx: 4,
        fill: 'none', stroke: color('acento'), 'stroke-width': 2, 'pointer-events': 'none',
      }),
      s('text', { x: cx, y: 15, 'text-anchor': 'middle', 'font-weight': 700, fill: color('acento'), texto: `Mejor bloque · ${f3.format(bloque.media)}` }),
    );

    if (iAhora >= 0) {
      svg.append(s('rect', {
        x: x(iAhora) + 1, y: 24, width: Math.max(2, paso - 2), height: m.arr - 24 + altoG + 2, rx: 4,
        fill: color('chispa'), 'pointer-events': 'none',
      }));
    }

    // Media del día: línea discontinua (como en el aviso nocturno).
    svg.append(s('line', {
      x1: m.izq, x2: W - m.der, y1: y(media), y2: y(media), stroke: color('eje'),
      'stroke-width': 1.5, 'stroke-dasharray': '5 4', 'pointer-events': 'none',
    }));

    horas.forEach((h, i) => {
      const y0 = y(Math.max(h.precio, 0));
      const y1 = y(Math.min(h.precio, 0));
      const barra = s('rect', {
        x: x(i) + (paso - anchoBarra) / 2, y: y0, width: anchoBarra, height: Math.max(1, y1 - y0),
        rx: Math.min(3, anchoBarra / 4), fill: color(grupo[i]), tabindex: 0, style: 'cursor:pointer',
      });
      barraInteractiva(barra, i);
      barras.push(barra);
      // El precio, encima de la barra (o encima del cero si es negativo). Tres decimales.
      const xc = x(i) + paso / 2;
      const yt = y(Math.max(h.precio, 0)) - 4;
      const precio = s('text', {
        x: xc, y: yt, fill: color('tinta'), 'pointer-events': 'none', 'aria-hidden': 'true',
        'font-weight': destacada(i) ? 700 : 400, style: 'font-variant-numeric:tabular-nums',
        ...(vertical
          ? { transform: `rotate(-90 ${xc} ${yt})`, dy: '0.35em', 'text-anchor': 'start' }
          : { 'text-anchor': 'middle' }),
        texto: f3.format(h.precio),
      });
      svg.append(barra, precio);
    });

    // Eje de horas: todas si caben, si no cada 3 (y siempre la actual).
    const cada = paso >= 24 ? 1 : 3;
    horas.forEach((h, i) => {
      const esAhora = i === iAhora;
      if (!esAhora && (h.hora % cada !== 0 || (i > 0 && horas[i - 1].hora === h.hora))) return;
      if (!esAhora && iAhora >= 0 && Math.abs(i - iAhora) * paso < 22) return; // no pisar la actual
      svg.append(s('text', {
        x: x(i) + paso / 2, y: H - m.aba + 16, 'text-anchor': 'middle',
        fill: esAhora ? color('acento') : color('eje'), 'font-weight': esAhora ? 700 : null, texto: dos(h.hora),
      }));
    });
    // «ahora», debajo de su hora: así no tapa el precio de la barra.
    if (iAhora >= 0) {
      const xa = Math.min(Math.max(x(iAhora) + paso / 2, m.izq + 18), W - m.der - 18);
      svg.append(s('text', {
        x: xa, y: H - m.aba + 32, 'text-anchor': 'middle', 'font-weight': 700, fill: color('acento'), texto: 'ahora',
      }));
    }

    // Deslizar: la columna más cercana a la x del puntero.
    const marco = marcoElegida();
    svg.append(marco);
    hacerDeslizable(svg, barras, (xv) => Math.floor((xv - m.izq) / paso), (i) => {
      marco.setAttribute('x', x(i) + 1);
      marco.setAttribute('y', m.arr - altoEtiqueta - 2);
      marco.setAttribute('width', Math.max(2, paso - 2));
      marco.setAttribute('height', altoEtiqueta + altoG + 4);
      marco.setAttribute('visibility', 'visible');
    });
    return svg;
  }

  function barrasEnFilas(W) {
    const fs = 13;
    const fila = 26;
    const m = { izq: 50, der: iAhora >= 0 ? 96 : 52, arr: 26, aba: 8 };
    const H = m.arr + fila * horas.length + m.aba;
    const anchoG = W - m.izq - m.der;
    const xMin = Math.min(0, ...precios);
    const xMax = Math.max(...precios, 0.001);
    const x = (v) => m.izq + anchoG * ((v - xMin) / (xMax - xMin));
    const yF = (i) => m.arr + i * fila;
    const altoBarra = fila * 0.7;

    const svg = s('svg', {
      viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': etiquetaSVG,
      style: `display:block;max-width:100%;height:auto;font-family:inherit;font-size:${fs}px;overflow:visible;touch-action:pan-y`,
    });
    const barras = [];

    // Franja de las horas: aquí el dedo puede subir y bajar para recorrerlas sin mover la página.
    // Un fondo suave la señala.
    svg.append(s('rect', {
      x: 2, y: m.arr, width: m.izq - 4, height: fila * horas.length, rx: 6, fill: color('pista'), 'pointer-events': 'none',
    }));

    svg.append(s('text', {
      x: 0, y: 15, 'font-weight': 700, fill: color('acento'),
      texto: `▭ Mejor bloque ${tramoBloque} · ${f3.format(bloque.media)}`,
    }));

    if (iAhora >= 0) {
      svg.append(s('rect', {
        x: 1, y: yF(iAhora) + 1, width: W - 2, height: fila - 2, rx: 4, fill: color('chispa'), 'pointer-events': 'none',
      }));
    }
    // El cero y la media del día (discontinua).
    svg.append(
      s('line', { x1: x(0), x2: x(0), y1: m.arr, y2: H - m.aba, stroke: color('eje') }),
      s('line', {
        x1: x(media), x2: x(media), y1: m.arr, y2: H - m.aba, stroke: color('eje'),
        'stroke-width': 1.5, 'stroke-dasharray': '5 4', 'pointer-events': 'none',
      }),
    );

    horas.forEach((h, i) => {
      const esAhora = i === iAhora;
      const yc = yF(i) + fila / 2;
      const x0 = x(Math.min(h.precio, 0));
      const x1 = x(Math.max(h.precio, 0));
      const barra = s('rect', {
        x: x0, y: yc - altoBarra / 2, width: Math.max(1, x1 - x0), height: altoBarra,
        rx: 3, fill: color(grupo[i]), tabindex: 0, style: 'cursor:pointer',
      });
      barraInteractiva(barra, i);
      barras.push(barra);
      svg.append(
        s('text', {
          x: m.izq - 8, y: yc, dy: '0.35em', 'text-anchor': 'end', style: 'font-variant-numeric:tabular-nums',
          fill: esAhora ? color('acento') : color('eje'), 'font-weight': esAhora ? 700 : null,
          texto: `${dos(h.hora)}–${dos((h.hora + 1) % 24)}`,
        }),
        barra,
        s('text', {
          x: x(Math.max(h.precio, 0)) + 6, y: yc, dy: '0.35em', fill: color('tinta'), 'pointer-events': 'none',
          'aria-hidden': 'true', 'font-weight': destacada(i) ? 700 : 400, style: 'font-variant-numeric:tabular-nums',
          texto: f3.format(h.precio),
        }, esAhora ? s('tspan', { fill: color('acento'), 'font-weight': 700, texto: '  ahora' }) : null),
      );
    });

    // Contorno del mejor bloque: abarca las filas enteras, precios incluidos.
    svg.append(s('rect', {
      x: 1, y: yF(bloque.inicio) + 1, width: W - 2, height: fila * (bloque.fin - bloque.inicio + 1) - 2, rx: 6,
      fill: 'none', stroke: color('acento'), 'stroke-width': 2, 'pointer-events': 'none',
    }));

    // Deslizar: la fila más cercana a la y del puntero. Encima de la columna de las horas va una
    // capa HTML con touch-action: none (en HTML es fiable; dentro del SVG no en todos los
    // navegadores), que es la que recoge el gesto vertical.
    const marco = marcoElegida();
    svg.append(marco);
    const franja = el('div', {
      class: 'grafica-franja-horas', 'aria-hidden': 'true',
      style: `position:absolute;left:0;top:${(100 * m.arr) / H}%;width:${(100 * m.izq) / W}%;`
        + `height:${(100 * fila * horas.length) / H}%;touch-action:none;cursor:ns-resize`,
    });
    hacerDeslizable(svg, barras, (xv, yv) => Math.floor((yv - m.arr) / fila), (i) => {
      marco.setAttribute('x', 1);
      marco.setAttribute('y', yF(i) + 1);
      marco.setAttribute('width', W - 2);
      marco.setAttribute('height', fila - 2);
      marco.setAttribute('visibility', 'visible');
    }, franja);
    return [svg, franja];
  }
}

// =====================================================================
// Histórico: mapa de calor día × hora en canvas + media mensual
// =====================================================================

const DIA_MS = 86400e3;
const numeroDia = (f) => Date.UTC(+f.slice(0, 4), +f.slice(5, 7) - 1, +f.slice(8, 10)) / DIA_MS;
const fechaDeNumero = (n) => new Date(n * DIA_MS).toISOString().slice(0, 10);

// Prepara los datos una sola vez: una matriz días × 24 horas, las medias de cada mes y los
// precios que marcan la escala de color.
function prepararHistorico(horas) {
  const inicio = numeroDia(`${PRIMER_AÑO}-01-01`);
  const datos = horas.filter((h) => h.fecha >= `${PRIMER_AÑO}-01-01`);
  const fin = numeroDia(datos.at(-1).fecha);
  const dias = fin - inicio + 1;
  const suma = new Float64Array(dias * 24);
  const cuenta = new Uint8Array(dias * 24);
  const meses = new Map();
  for (const h of datos) {
    // El día del cambio de hora de octubre tiene dos «02 h»: se promedian en la misma celda.
    // El de marzo no tiene «02 h»: esa celda se queda vacía.
    const k = (numeroDia(h.fecha) - inicio) * 24 + h.hora;
    suma[k] += h.precio;
    cuenta[k] += 1;
    const mes = h.fecha.slice(0, 7);
    const acc = meses.get(mes) || { suma: 0, n: 0 };
    acc.suma += h.precio;
    acc.n += 1;
    meses.set(mes, acc);
  }
  const celdas = new Float32Array(dias * 24).fill(NaN);
  for (let k = 0; k < celdas.length; k++) if (cuenta[k]) celdas[k] = suma[k] / cuenta[k];

  const medias = [...meses.entries()].sort().map(([mes, { suma: sm, n }]) => {
    const a = +mes.slice(0, 4);
    const mm = +mes.slice(5, 7);
    const d0 = Date.UTC(a, mm - 1, 1) / DIA_MS - inicio;
    const d1 = Math.min(Date.UTC(a, mm, 1) / DIA_MS - inicio, dias);
    return { a, mm, media: sm / n, centro: (d0 + d1) / 2 };
  });

  // Escala de color por percentiles de todo el histórico: así 2022 (precios disparados) no
  // deja todo lo demás del mismo color. P5 = color barato, mediana = medio, P95 = caro.
  const orden = Float64Array.from(datos, (h) => h.precio).sort();
  const pct = (p) => orden[Math.min(orden.length - 1, Math.floor(p * orden.length))];
  return { inicio, dias, celdas, medias, escala: [pct(0.05), pct(0.5), pct(0.95)] };
}

// «el sábado 17 de octubre de 2026» o, si los datos ya llegan a mañana (la publicación de las
// 21:30 guarda el precio de mañana), «mañana, domingo 18 de octubre de 2026».
const hastaCuando = (f) => (f > diaDeHoy() ? `mañana, ${fechaLarga(f)}` : `el ${fechaLarga(f)}`);

export function pintarHistorico(contenedor, horas) {
  const H = prepararHistorico(horas);
  const [pBajo, pMedio, pAlto] = H.escala;
  const ultimoDia = fechaDeNumero(H.inicio + H.dias - 1);

  const ayuda = 'Pasa el dedo o el ratón por el mapa para ver el precio de cada día y hora.';
  const detalle = el('p', { class: 'nota grafica-detalle', 'aria-live': 'polite', texto: ayuda });
  const leyenda = el('div', { class: 'grafica-leyenda grafica-escala', style: 'display:flex;align-items:center;gap:.6em;flex-wrap:wrap' }, [
    el('span', { texto: `≤ ${f3.format(pBajo)}` }),
    el('span', {
      'aria-hidden': 'true',
      style: `flex:1 1 8em;max-width:16em;height:.8em;border-radius:.4em;background:linear-gradient(to right, ${color('barato')}, ${color('medio')}, ${color('caro')})`,
    }),
    el('span', { texto: `≥\u00a0${f3.format(pAlto)}${UNIDAD}` }),
  ]);
  const nota = el('p', {
    class: 'nota grafica-nota',
    texto: `Desde el 1 de enero de ${PRIMER_AÑO} hasta ${hastaCuando(ultimoDia)}. El color va del 5 % de horas más baratas (${euros(pBajo)}) al 5 % más caras (${euros(pAlto)}), con la mediana (${euros(pMedio)}) en el centro. PVPC de la península, sin impuestos. Fuente: Red Eléctrica (REE), REData.`,
  });
  const canvas = el('canvas', {
    role: 'img',
    'aria-label': `Mapa de calor del precio de la luz por día y hora desde ${PRIMER_AÑO}, con la media de cada mes encima.`,
    style: 'display:block;width:100%;touch-action:pan-y;cursor:crosshair',
  });
  const lienzo = el('div', { class: 'grafica-lienzo' }, canvas);
  contenedor.replaceChildren(lienzo, detalle, leyenda, nota);

  let geo = null; // geometría del último dibujo, para saber qué hay bajo el dedo

  const dibujar = (W) => {
    const estrecho = W < 520;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const m = { izq: estrecho ? 30 : 38, der: 4 };
    const altoLinea = estrecho ? 70 : 100;
    const filaH = estrecho ? 8 : 10;
    const altoMapa = 24 * filaH;
    const yLinea = 16;
    const yMapa = yLinea + altoLinea + 12;
    const alto = yMapa + altoMapa + 24;
    const anchoG = W - m.izq - m.der;
    const fuente = getComputedStyle(contenedor).fontFamily || 'system-ui, sans-serif';
    const tam = estrecho ? 10 : 11;

    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(alto * dpr);
    canvas.style.height = `${alto}px`;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, alto);

    const cBarato = resolverColor('barato', contenedor);
    const cMedio = resolverColor('medio', contenedor);
    const cCaro = resolverColor('caro', contenedor);
    const cTinta = resolverColor('tinta', contenedor);
    const cEje = resolverColor('eje', contenedor);
    const cRejilla = resolverColor('rejilla', contenedor);
    const cPista = resolverColor('pista', contenedor);
    const cFondo = resolverColor('superficie', contenedor);

    const mezcla = (a, b, t) => [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t));
    const colorDe = (v) => {
      if (v <= pMedio) return mezcla(cBarato, cMedio, Math.max(0, (v - pBajo) / (pMedio - pBajo)));
      return mezcla(cMedio, cCaro, Math.min(1, (v - pMedio) / (pAlto - pMedio)));
    };

    // 1) Mapa de calor. Se calcula una imagen con una columna por píxel real de pantalla (si hay
    // más días que píxeles, cada columna promedia varios días) y se estira sin suavizar.
    const cols = Math.min(H.dias, Math.max(1, Math.round(anchoG * dpr)));
    const img = new ImageData(cols, 24);
    const diasDeCol = (c) => [Math.floor((c * H.dias) / cols), Math.max(Math.floor((c * H.dias) / cols) + 1, Math.floor(((c + 1) * H.dias) / cols))];
    for (let c = 0; c < cols; c++) {
      const [d0, d1] = diasDeCol(c);
      for (let hr = 0; hr < 24; hr++) {
        let sm = 0;
        let n = 0;
        for (let d = d0; d < d1; d++) {
          const v = H.celdas[d * 24 + hr];
          if (!Number.isNaN(v)) { sm += v; n++; }
        }
        const p = (hr * cols + c) * 4;
        if (n) {
          const [r, g, b] = colorDe(sm / n);
          img.data[p] = r; img.data[p + 1] = g; img.data[p + 2] = b; img.data[p + 3] = 255;
        } else {
          img.data[p] = cFondo[0]; img.data[p + 1] = cFondo[1]; img.data[p + 2] = cFondo[2]; img.data[p + 3] = cFondo[3];
        }
      }
    }
    const aux = document.createElement('canvas');
    aux.width = cols;
    aux.height = 24;
    aux.getContext('2d').putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(aux, m.izq, yMapa, anchoG, altoMapa);

    const xDia = (d) => m.izq + (d / H.dias) * anchoG;
    ctx.font = `${tam}px ${fuente}`;
    ctx.textBaseline = 'middle';

    // Horas a la izquierda del mapa.
    ctx.fillStyle = rgba(cEje);
    ctx.textAlign = 'right';
    for (const hr of [0, 6, 12, 18]) ctx.fillText(`${dos(hr)} h`, m.izq - 5, yMapa + hr * filaH + filaH / 2);

    // 2) Media mensual encima, con su propia escala.
    const maxMes = Math.max(...H.medias.map((x) => x.media));
    const ticks = marcas(0, maxMes * 1.05, 3);
    const topeMes = Math.max(ticks.at(-1), maxMes * 1.05);
    const yMes = (v) => yLinea + altoLinea * (1 - v / topeMes);
    ctx.lineWidth = 1;
    for (const v of ticks) {
      ctx.strokeStyle = rgba(v === 0 ? cEje : cRejilla);
      ctx.beginPath(); ctx.moveTo(m.izq, Math.round(yMes(v)) + 0.5); ctx.lineTo(W - m.der, Math.round(yMes(v)) + 0.5); ctx.stroke();
      ctx.fillText(f2.format(v), m.izq - 5, yMes(v));
    }
    ctx.textAlign = 'left';
    ctx.fillText('Media mensual, €/kWh', m.izq, 6);

    // Separadores de año en las dos bandas y el año debajo del mapa.
    const ultimoAño = +ultimoDia.slice(0, 4);
    ctx.textAlign = 'center';
    for (let a = PRIMER_AÑO; a <= ultimoAño; a++) {
      const d0 = Date.UTC(a, 0, 1) / DIA_MS - H.inicio;
      const d1 = Math.min(Date.UTC(a + 1, 0, 1) / DIA_MS - H.inicio, H.dias);
      if (a > PRIMER_AÑO) {
        const xa = Math.round(xDia(d0)) + 0.5;
        ctx.strokeStyle = rgba(cEje, 0.6);
        ctx.beginPath(); ctx.moveTo(xa, yLinea); ctx.lineTo(xa, yMapa + altoMapa + 4); ctx.stroke();
      }
      ctx.fillStyle = rgba(cEje);
      ctx.fillText(String(a), (xDia(d0) + xDia(d1)) / 2, yMapa + altoMapa + 13);
    }

    // La línea de la media mensual, con un relleno suave debajo.
    const puntos = H.medias.map((x) => [xDia(x.centro), yMes(x.media)]);
    ctx.beginPath();
    puntos.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
    ctx.lineTo(puntos.at(-1)[0], yMes(0)); ctx.lineTo(puntos[0][0], yMes(0)); ctx.closePath();
    ctx.fillStyle = rgba(cPista, 0.8);
    ctx.fill();
    ctx.beginPath();
    puntos.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
    ctx.strokeStyle = rgba(cTinta);
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.stroke();

    geo = { m, anchoG, yLinea, altoLinea, yMapa, altoMapa, filaH, cols, diasDeCol };
  };

  // Qué hay bajo el dedo o el ratón.
  const explicar = (ev) => {
    if (!geo) return;
    const r = canvas.getBoundingClientRect();
    const px = ev.clientX - r.left;
    const py = ev.clientY - r.top;
    const t = (px - geo.m.izq) / geo.anchoG;
    if (t < 0 || t >= 1) { detalle.textContent = ayuda; return; }
    if (py >= geo.yMapa && py < geo.yMapa + geo.altoMapa) {
      const c = Math.min(geo.cols - 1, Math.floor(t * geo.cols));
      const hr = Math.min(23, Math.floor((py - geo.yMapa) / geo.filaH));
      const [d0, d1] = geo.diasDeCol(c);
      let sm = 0;
      let n = 0;
      for (let d = d0; d < d1; d++) {
        const v = H.celdas[d * 24 + hr];
        if (!Number.isNaN(v)) { sm += v; n++; }
      }
      const f0 = fechaDeNumero(H.inicio + d0);
      const f1 = fechaDeNumero(H.inicio + d1 - 1);
      const cuando = f0 === f1 ? fechaCorta(f0) : `${fechaCorta(f0)} – ${fechaCorta(f1)} (media)`;
      detalle.textContent = n ? `${cuando}, ${tramo(hr)}: ${euros(sm / n)}` : `${cuando}, ${tramo(hr)}: sin dato`;
    } else if (py >= geo.yLinea - 4 && py < geo.yLinea + geo.altoLinea + 8) {
      const d = t * H.dias;
      const mes = H.medias.reduce((a, b) => (Math.abs(b.centro - d) < Math.abs(a.centro - d) ? b : a));
      detalle.textContent = `Media de ${mesAño(mes.a, mes.mm)}: ${euros(mes.media)}`;
    } else {
      detalle.textContent = ayuda;
    }
  };
  canvas.addEventListener('pointermove', explicar);
  canvas.addEventListener('pointerdown', explicar);
  canvas.addEventListener('pointerleave', () => { detalle.textContent = ayuda; });

  alCambiarAncho(lienzo, dibujar);
  // Si cambia el modo claro/oscuro, los colores de las variables cambian: se vuelve a dibujar.
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => dibujar(Math.round(lienzo.clientWidth)));
}

// =====================================================================
// El equipo en el tiempo: un carril por agente, una barra por PR
// =====================================================================
// Eje de tiempo con los huecos comprimidos: el equipo trabaja a ratos (el 12 por la tarde, el 14 por
// la tarde, el 15 por la mañana) y un eje lineal dejaría casi todo el ancho vacío y los PR de una
// misma hora apelotonados. Por eso, si pasan más de 3 h sin abrir ni fusionar nada, ese rato se
// dibuja como una franja gris estrecha. Se descartó un eje por días fijos: un PR de 1 minuto y uno
// de 3 horas se verían casi iguales.
// Dentro de cada carril, las barras que se pisarían bajan a otra fila, para que ningún número choque.

const HUECO_MS = 3 * 3600e3; // más de 3 h sin actividad: se comprime
const AIRE_MS = 20 * 60e3; // margen a cada lado de un rato con actividad
const ANCHO_HUECO = 20; // px de la franja comprimida
const MIN_RATO = 30; // px mínimos de un rato con actividad
const MIN_BARRA = 5; // px mínimos de una barra (hay PR que duran segundos)
const ALTO_EJE = 38;
const ALTO_CABECERA = 22; // nombre del agente
const ALTO_FILA = 26;
const LETRA = 11; // px de las etiquetas del dibujo
const anchoTexto = (t) => t.length * LETRA * 0.7; // estimación; fuente del sistema

const horaMin = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: ZONA });
const soloHora = new Intl.DateTimeFormat('es-ES', { hour: 'numeric', hourCycle: 'h23', timeZone: ZONA });
const diaCorto = new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric', timeZone: ZONA });
const diaClave = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: ZONA });
const diaYHora = (ms) => `${diaCorto.format(ms)}, ${horaMin.format(ms)}`;

function duracion(ms) {
  const min = Math.max(1, Math.round(ms / 60e3));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h < 24) return m ? `${h} h ${m} min` : `${h} h`;
  const d = Math.floor(h / 24);
  return `${d} ${d === 1 ? 'día' : 'días'} y ${h % 24} h`;
}

function prepararEquipo(datos) {
  const corte = Date.parse(datos.generado);
  const prs = datos.prs
    .filter((p) => p.autor && datos.agentes.includes(p.autor))
    .map((p) => {
      const estado = p.fusionado ? 'fusionado' : p.cerrado ? 'cerrado' : 'abierto';
      const fin = p.fusionado ? Date.parse(p.fusionado) : p.cerrado ? Date.parse(p.cerrado) : corte;
      return { ...p, estado, ini: Date.parse(p.abierto), fin };
    });
  // Ratos con actividad: se juntan los momentos (abrir, fusionar) separados por menos de HUECO_MS.
  const momentos = prs.flatMap((p) => [p.ini, p.fin]).sort((a, b) => a - b);
  const ratos = [];
  for (const t of momentos) {
    const ult = ratos[ratos.length - 1];
    if (ult && t - ult.hasta <= HUECO_MS) ult.hasta = Math.max(ult.hasta, t);
    else ratos.push({ desde: t, hasta: t });
  }
  for (const r of ratos) { r.desde -= AIRE_MS; r.hasta += AIRE_MS; }
  return { prs, ratos, corte, agentes: datos.agentes, sinAutor: datos.prs.length - prs.length };
}

// Convierte un instante en x. Cada rato ocupa un ancho proporcional a lo que dura (con un mínimo);
// los huecos entre ratos, ANCHO_HUECO cada uno.
function escalaComprimida(ratos, ancho) {
  const libre = ancho - (ratos.length - 1) * ANCHO_HUECO;
  const dur = ratos.map((r) => r.hasta - r.desde);
  let anchos = dur.map(() => 0);
  let fijos = new Set();
  for (let vuelta = 0; vuelta < 3; vuelta++) { // reparte, fija los que no llegan al mínimo y repite
    const restoPx = libre - fijos.size * MIN_RATO;
    const restoMs = dur.reduce((s, d, i) => s + (fijos.has(i) ? 0 : d), 0);
    anchos = dur.map((d, i) => (fijos.has(i) ? MIN_RATO : (restoPx * d) / restoMs));
    const nuevos = anchos.map((w, i) => (w < MIN_RATO ? i : -1)).filter((i) => i >= 0);
    if (nuevos.every((i) => fijos.has(i))) break;
    fijos = new Set([...fijos, ...nuevos]);
  }
  const x0 = [];
  let x = 0;
  anchos.forEach((w) => { x0.push(x); x += w + ANCHO_HUECO; });
  const aX = (t) => {
    for (let i = 0; i < ratos.length; i++) {
      const r = ratos[i];
      if (t < r.desde) {
        if (i === 0) return 0;
        const prev = ratos[i - 1];
        return x0[i - 1] + anchos[i - 1] + ((t - prev.hasta) / (r.desde - prev.hasta)) * ANCHO_HUECO;
      }
      if (t <= r.hasta) return x0[i] + ((t - r.desde) / (r.hasta - r.desde)) * anchos[i];
    }
    return ancho;
  };
  return { aX, x0, anchos };
}

export function pintarEquipo(contenedor, datos) {
  const { prs, ratos, corte, agentes } = prepararEquipo(datos);
  if (!prs.length) { mostrarError(contenedor, 'Todavía no hay PR que enseñar.'); return; }

  const porAgente = agentes.map((a) => ({ nombre: a, prs: prs.filter((p) => p.autor === a) }));
  const fusionados = prs.filter((p) => p.estado === 'fusionado').length;
  const abiertos = prs.filter((p) => p.estado === 'abierto').length;
  const primero = Math.min(...prs.map((p) => p.ini));

  const resumen = el('p', { class: 'grafica-resumen' }, [
    el('strong', { texto: `${prs.length} PR` }),
    ` desde el ${diaCorto.format(primero)}: `,
    porAgente.map((a) => `${a.nombre} ${a.prs.length}`).join(', '),
    `. ${fusionados} fusionados${abiertos ? `, ${abiertos} abierto${abiertos > 1 ? 's' : ''}` : ''}.`,
  ]);

  const ayuda = 'Toca o pasa el ratón por una barra para ver qué PR es. Con teclado, tabula por las barras.';
  const detalle = el('p', { class: 'nota grafica-detalle', 'aria-live': 'polite', style: 'min-height:3em', texto: ayuda });

  const leyenda = el('ul', { class: 'grafica-leyenda', style: 'list-style:none;padding:0;margin:0 0 1rem;display:flex;flex-wrap:wrap;align-items:center;gap:.5em 1em' }, [
    el('li', {}, [muestra('acento'), 'PR fusionado: de que se abre a que se fusiona']),
    abiertos ? el('li', {}, [muestra('superficie', `outline:2px dashed ${color('acento')};outline-offset:-2px`), 'PR abierto todavía']) : null,
    el('li', {}, [muestra('pista'), 'Horas sin actividad, comprimidas']),
  ]);

  // Lo mismo en una tabla plegada: la alternativa accesible al dibujo.
  const celda = 'text-align:left;padding:.2em 1em .2em 0;vertical-align:top';
  const tabla = el('details', { class: 'grafica-tabla', style: 'margin:0 0 1rem' }, [
    el('summary', { texto: `Ver los ${prs.length} PR en una tabla` }),
    el('div', { style: 'overflow-x:auto' }, el('table', { style: 'border-collapse:collapse;margin-top:.5rem;font-variant-numeric:tabular-nums' }, [
      el('caption', { class: 'nota', style: 'text-align:left', texto: 'PR de Pvpc-bridge, en hora de España' }),
      el('thead', {}, el('tr', {}, ['PR', 'Quién', 'Qué', 'Abierto', 'Fusionado', 'Duró'].map((t) => el('th', { scope: 'col', style: celda, texto: t })))),
      el('tbody', {}, prs.map((p) => el('tr', {}, [
        el('th', { scope: 'row', style: `${celda};font-weight:inherit` }, el('a', { href: p.url, rel: 'noopener', texto: `#${p.numero}` })),
        el('td', { style: celda, texto: p.autor }),
        el('td', { style: `${celda};min-width:14em`, texto: p.titulo }),
        el('td', { style: `${celda};white-space:nowrap`, texto: diaYHora(p.ini) }),
        el('td', { style: `${celda};white-space:nowrap`, texto: p.estado === 'fusionado' ? diaYHora(p.fin) : p.estado }),
        el('td', { style: `${celda};white-space:nowrap`, texto: p.estado === 'abierto' ? '—' : duracion(p.fin - p.ini) }),
      ]))),
    ])),
  ]);

  const nota = el('p', { class: 'nota grafica-nota' }, [
    'Todos los PR salen desde la misma cuenta de GitHub. Quién hizo cada uno se saca del «(Nombre)» del título, de la rama ',
    el('code', { texto: 'web/<nombre>' }), ' o de la firma de la descripción. Datos públicos de la API de GitHub a fecha del ',
    `${diaYHora(corte)}; los genera `,
    el('a', { href: 'https://github.com/JosebaDG/Pvpc-bridge/tree/main/herramientas/actividad-equipo', rel: 'noopener', texto: 'herramientas/actividad-equipo' }),
    '.',
  ]);

  const lienzo = el('div', { class: 'grafica-lienzo' });
  contenedor.replaceChildren(resumen, leyenda, lienzo, detalle, tabla, nota);

  let elegido = null;
  function mostrar(p) {
    elegido = p.numero;
    const cuando = p.estado === 'fusionado'
      ? `abierto el ${diaYHora(p.ini)}, fusionado a las ${horaMin.format(p.fin)}${diaClave.format(p.fin) !== diaClave.format(p.ini) ? ` del ${diaCorto.format(p.fin)}` : ''} (${duracion(p.fin - p.ini)})`
      : p.estado === 'abierto' ? `abierto el ${diaYHora(p.ini)}, aún sin fusionar` : `abierto el ${diaYHora(p.ini)}, cerrado sin fusionar`;
    detalle.replaceChildren(
      el('strong', { texto: `#${p.numero} · ${p.autor}` }), ` · ${p.titulo} · ${cuando}. `,
      el('a', { href: p.url, rel: 'noopener', texto: 'Ver en GitHub' }),
    );
    for (const g of lienzo.querySelectorAll('[data-pr]')) {
      g.querySelector('.barra').style.strokeWidth = g.dataset.pr === String(p.numero) ? '2.5' : '';
    }
  }

  function dibujar(ancho) {
    const { aX, x0, anchos } = escalaComprimida(ratos, ancho);

    // Filas dentro de cada carril: una barra baja de fila si su número chocaría con otra.
    const carriles = porAgente.map((a) => {
      const filas = [];
      const items = a.prs.slice().sort((p, q) => p.ini - q.ini).map((p) => {
        const xa = aX(p.ini);
        const w = Math.max(MIN_BARRA, aX(p.fin) - xa);
        const etiqueta = `#${p.numero}`;
        const lx = Math.min(xa, ancho - anchoTexto(etiqueta));
        const desde = Math.min(lx, xa);
        const hasta = Math.max(xa + w, lx + anchoTexto(etiqueta)) + 4;
        let fila = filas.findIndex((fin) => fin <= desde);
        if (fila < 0) { fila = filas.length; filas.push(0); }
        filas[fila] = hasta;
        return { p, xa, w, lx, etiqueta, fila };
      });
      return { nombre: a.nombre, items, filas: Math.max(1, filas.length) };
    });
    const alto = ALTO_EJE + carriles.reduce((s, c) => s + ALTO_CABECERA + c.filas * ALTO_FILA, 0) + 4;

    const svg = s('svg', {
      viewBox: `0 0 ${ancho} ${alto}`, width: ancho, height: alto, role: 'group',
      'aria-label': `Línea de tiempo de los ${prs.length} PR, un carril por agente`,
      style: `display:block;max-width:100%;font-family:var(--f-texto);font-size:${LETRA}px`,
    });

    // Franjas de los huecos comprimidos, de arriba abajo.
    for (let i = 0; i + 1 < ratos.length; i++) {
      svg.append(s('rect', { x: x0[i] + anchos[i], y: 0, width: ANCHO_HUECO, height: alto, fill: color('pista'), 'aria-hidden': 'true' }));
    }

    // Eje: el día al empezar cada rato (si cambia) y las horas en punto que quepan.
    const eje = s('g', { 'aria-hidden': 'true', fill: color('eje') });
    let finDia = -Infinity;
    let finHora = -Infinity;
    let diaAnterior = '';
    ratos.forEach((r, i) => {
      const dia = diaClave.format(r.desde + AIRE_MS);
      if (dia !== diaAnterior && x0[i] >= finDia) {
        const t = diaCorto.format(r.desde + AIRE_MS);
        const x = Math.min(x0[i], ancho - anchoTexto(t));
        eje.append(s('text', { x, y: 13, texto: t, style: `font-weight:var(--peso-medio);fill:${color('tinta')}` }));
        finDia = x + anchoTexto(t) + 8;
        diaAnterior = dia;
      }
      const pxHora = anchos[i] / ((r.hasta - r.desde) / 3600e3);
      const paso = [1, 2, 3, 4, 6, 12].find((k) => k * pxHora >= 34);
      if (!paso) return;
      for (let t = Math.ceil(r.desde / 3600e3) * 3600e3; t <= r.hasta; t += 3600e3) {
        const h = +soloHora.format(t);
        if (h % paso) continue;
        const x = aX(t);
        const etiqueta = `${h} h`;
        if (x - anchoTexto(etiqueta) / 2 < Math.max(0, finHora) || x + anchoTexto(etiqueta) / 2 > ancho) continue;
        eje.append(s('line', { x1: x, x2: x, y1: 32, y2: alto, stroke: color('rejilla'), 'stroke-width': 1 }));
        eje.append(s('text', { x, y: 29, 'text-anchor': 'middle', texto: etiqueta }));
        finHora = x + anchoTexto(etiqueta) / 2 + 6;
      }
    });
    svg.append(eje);

    let y = ALTO_EJE;
    for (const c of carriles) {
      svg.append(s('line', { x1: 0, x2: ancho, y1: y, y2: y, stroke: color('rejilla'), 'stroke-width': 1, 'aria-hidden': 'true' }));
      svg.append(s('text', { x: 0, y: y + 15, texto: c.nombre, 'aria-hidden': 'true', style: `font-size:${LETRA + 2}px;font-weight:var(--peso-fuerte);fill:${color('tinta')}` }));
      const base = y + ALTO_CABECERA;
      for (const it of c.items) {
        const yf = base + it.fila * ALTO_FILA;
        const abierto = it.p.estado !== 'fusionado';
        const g = s('g', {
          'data-pr': String(it.p.numero), tabindex: '0', role: 'button', style: 'cursor:pointer;outline-offset:2px',
          'aria-label': `PR ${it.p.numero} de ${it.p.autor}: ${it.p.titulo}. ${it.p.estado === 'fusionado' ? `Duró ${duracion(it.p.fin - it.p.ini)}` : it.p.estado}.`,
        }, [
          s('title', { texto: `#${it.p.numero} · ${it.p.autor} · ${it.p.titulo}` }),
          // Zona de toque más alta que la barra, para el dedo.
          s('rect', { x: Math.min(it.lx, it.xa), y: yf, width: Math.max(it.w, anchoTexto(it.etiqueta)), height: ALTO_FILA - 2, fill: 'transparent' }),
          s('text', { x: it.lx, y: yf + 10, texto: it.etiqueta, fill: color('eje') }),
          s('rect', {
            class: 'barra', x: it.xa, y: yf + 13, width: it.w, height: 9, rx: 2,
            fill: abierto ? color('superficie') : color('acento'), stroke: abierto ? color('acento') : color('tinta'),
            'stroke-width': abierto ? 1.5 : 0, 'stroke-dasharray': abierto ? '3 2' : null,
          }),
        ]);
        const elegir = () => mostrar(it.p);
        g.addEventListener('pointerenter', elegir);
        g.addEventListener('click', elegir);
        g.addEventListener('focus', elegir);
        svg.append(g);
      }
      y = base + c.filas * ALTO_FILA;
    }

    lienzo.replaceChildren(svg);
    const previo = prs.find((p) => p.numero === elegido);
    if (previo) mostrar(previo);
  }

  alCambiarAncho(lienzo, dibujar);
}

// =====================================================================
// Arranque
// =====================================================================

// =====================================================================
// «¿Acertó el mercado?»: ayer frente a lo que se esperaba
// =====================================================================
// El precio de cada día se decide el día antes a mediodía, con la previsión del tiempo de
// entonces (ficha 1 de «Cómo se forma el precio»). La tarjeta mira ayer, que ya ha pasado entero:
// - Tiempo: viento a 100 m y sol, previstos un día antes frente a lo que hubo (Open-Meteo,
//   media de los seis puntos del histórico). Por debajo del 10 % de diferencia, «acertó»; hasta
//   el 25 %, «casi»; más, «falló».
// - Generación real de eólica y fotovoltaica en España (REData), ayer frente a anteayer.
// - La luz de ayer frente a la de anteayer (media del día, sin impuestos).
// Son coincidencias, nunca causas: la tarjeta no dice «por eso». Si falta el tiempo o el precio,
// la tarjeta no se enseña y no sale ningún error. Va fuera de la gráfica, en su propia tarjeta.
// Se descartó comparar la tarde de hoy: el precio de hoy ya está fijado y la tarde aún no ha pasado.
const UMBRAL_ACIERTO = 0.10;
const UMBRAL_CASI = 0.25;
const f0 = num(0);
const f1 = num(1);

function veredicto(previsto, real) {
  const dif = previsto > 0 ? (real - previsto) / previsto : 0;
  const abs = Math.abs(dif);
  return { dif, pct: Math.round(abs * 100), nota: abs < UMBRAL_ACIERTO ? 'acerto' : abs < UMBRAL_CASI ? 'casi' : 'fallo' };
}
const PALABRA_NOTA = { acerto: 'Acertó', casi: 'Casi', fallo: 'Falló' };

export async function pintarAcerto(contenedor) {
  const hoy = diaDeHoy();
  const ayer = diaAnterior(hoy);
  const anteayer = diaAnterior(ayer);
  const [tiempo, precioAyer, precioAnteayer, gen] = await Promise.all([
    tiempoPrevistoYReal(ayer).catch(() => null),
    precioDelDiaAnterior(hoy).catch(() => null),
    precioDelDiaAnterior(ayer).catch(() => null),
    generacionDiaria(anteayer, ayer).catch(() => null),
  ]);
  if (!tiempo || !precioAyer || !precioAnteayer) {
    contenedor.hidden = true; // sin datos no hay juego, y tampoco error
    return;
  }

  const v = veredicto(tiempo.viento.previsto, tiempo.viento.real);
  const so = veredicto(tiempo.sol.previsto, tiempo.sol.real);
  const nombreAyer = `ayer, ${diaSemana(ayer)}`;
  const fraseViento = v.nota === 'acerto'
    ? 'el viento fue el previsto'
    : `sopló un ${v.pct}\u00a0% ${v.dif < 0 ? 'menos' : 'más'} de lo previsto`;
  const fraseSol = so.nota === 'acerto'
    ? 'el sol fue el previsto'
    : `hubo un ${so.pct}\u00a0% ${so.dif < 0 ? 'menos' : 'más'} de sol de lo previsto`;
  // Respuesta corta y su porqué, sin causas: «Sí», «A medias» o «No».
  const notas = [v.nota, so.nota];
  const respuesta = notas.every((n) => n === 'acerto') ? 'Sí'
    : notas.every((n) => n === 'fallo') ? 'No' : 'A medias';
  const porque = respuesta === 'Sí'
    ? `${nombreAyer[0].toUpperCase()}${nombreAyer.slice(1)}, el viento y el sol fueron los previstos.`
    : `${nombreAyer[0].toUpperCase()}${nombreAyer.slice(1)}, ${fraseViento} y ${fraseSol}.`;

  const media = (d) => d.horas.reduce((a, h) => a + h.precio, 0) / d.horas.length;
  const mAyer = media(precioAyer);
  const mAnteayer = media(precioAnteayer);
  const cmp = compararPrecio(mAyer, mAnteayer);
  const flecha = { barato: '▼', caro: '▲', igual: '=' }[cmp.sentido];
  const colorFlecha = { barato: color('barato'), caro: color('caro'), igual: color('eje') }[cmp.sentido];

  const fila = (titulo, previsto, real, unidad, ver, formato) => el('li', { class: 'juego__pista', 'data-nota': ver.nota }, [
    el('span', { class: 'juego__pista-titulo', texto: titulo }),
    ` previsto ${formato.format(previsto)}\u00a0${unidad} · hubo ${formato.format(real)}\u00a0${unidad} `,
    el('span', { class: 'tramo', 'data-nota': ver.nota, texto: ver.nota === 'acerto' ? PALABRA_NOTA.acerto : `${PALABRA_NOTA[ver.nota]} · ${ver.dif < 0 ? '−' : '+'}${ver.pct}\u00a0%` }),
  ]);

  const gAyer = gen?.get(ayer);
  const gAnte = gen?.get(anteayer);
  const gwh = (mwh) => `${f0.format(mwh / 1000)} GWh`;
  const generacion = gAyer?.eolica != null && gAyer?.solar != null && gAnte?.eolica != null && gAnte?.solar != null
    ? el('p', { class: 'nota juego__generacion' }, [
      'Lo que produjeron en España (REData): eólica ', el('strong', { texto: gwh(gAyer.eolica) }), ` (anteayer ${gwh(gAnte.eolica)}), `,
      'fotovoltaica ', el('strong', { texto: gwh(gAyer.solar) }), ` (anteayer ${gwh(gAnte.solar)}).`,
    ])
    : null;

  contenedor.hidden = false;
  contenedor.replaceChildren(...[
    el('h3', { class: 'juego__titulo', texto: '¿Acertó el mercado?' }),
    el('p', { class: 'juego__respuesta' }, [
      `${respuesta}. `,
      el('span', { texto: porque }),
    ]),
    el('p', { class: 'nota', texto: 'La energía de ayer se subastó anteayer a las 12:00, con la previsión del tiempo de entonces. Así salió esa previsión:' }),
    el('ul', { class: 'juego__pistas' }, [
      fila('Viento:', tiempo.viento.previsto, tiempo.viento.real, 'km/h', v, f0),
      fila('Sol:', tiempo.sol.previsto, tiempo.sol.real, 'kWh/m²', so, f1),
    ]),
    generacion,
    el('p', { class: 'juego__precio' }, [
      'La luz de ayer, sin impuestos: media ', el('strong', { texto: euros(mAyer) }), ', ',
      // En «igual», sin símbolo: «media 0,221 €/kWh, casi igual que anteayer.» (punto 10).
      ...(cmp.sentido === 'igual' ? [] : [el('span', { 'aria-hidden': 'true', style: `color:${colorFlecha};margin-right:.2em`, texto: flecha })]),
      cmp.sentido === 'igual' ? 'casi igual que anteayer.' : `${cmp.texto.replace(/o$/, 'a')} que anteayer.` // «la luz», en femenino,
    ]),
    // A la vista, la frase que evita leer el juego al revés; el método, plegado (nota de Simone).
    el('p', { class: 'nota', texto: 'Son coincidencias, no causas: cuando llega el día, la subasta ya está cerrada.' }),
    comoSeCalcula([
      'La media del día la mueven también los futuros, que suben o bajan todas las horas casi lo mismo. ',
      Object.assign(el('a', { texto: 'Por qué el precio se decide el día antes' }), { href: 'como-se-forma-el-precio.html' }),
      '. Viento a 100 m de altura y sol de media en seis puntos de la península (Lugo, Burgos, Zaragoza, Albacete, Badajoz y Bilbao), de Open-Meteo: la previsión de un día antes frente a su análisis más reciente. «Acertó» es menos de un 10 % de diferencia; «Casi», hasta un 25 %; «Falló», más.',
    ]),
  ].filter(Boolean));
}

// Nota de método de las dos tarjetas del juego, plegada tras el botón-píldora de las fichas
// (estilos .ficha__detalle y .juego__mas en base.css). Cerrada al pintar: si la tarjeta se
// vuelve a pintar (la apuesta a las 12:00), sale un pliegue nuevo y cerrado, sin restos.
function comoSeCalcula(contenido) {
  return el('details', { class: 'ficha__detalle juego__mas' }, [
    el('summary', { texto: 'Cómo se calcula' }),
    el('p', { class: 'nota juego__nota' }, contenido),
  ]);
}

// ---------- La apuesta: «¿Más barata o más cara mañana?» ----------
// Segunda parte del juego, en su propia tarjeta debajo de «¿Acertó el mercado?». Desde medianoche
// hasta las 12:00, hora peninsular, se elige si mañana de 14 a 17 h la luz será más barata o más
// cara que hoy, con dos pistas: viento y sol previstos. Cuando sale el precio (hacia las 20:45), la
// siguiente visita dice si se acertó y lleva la racha.
// - Se cierra a las 12:00 porque a esa hora cierra la subasta de mañana y OMIE publica sus precios
//   hacia las 13:00: desde entonces la respuesta se puede mirar. De 12:00 a la publicación la
//   tarjeta dice «Apuestas cerradas» y enseña la apuesta hecha, si la hay. Cada apuesta guarda
//   cuándo se hizo (hecha, en ms) y una guardada a las 12:00 o después no cuenta: se descarta al
//   resolver, sin sumar ni romper la racha.
// - Todo se guarda en este navegador (localStorage, clave CLAVE_APUESTA) y no sale de él: ni
//   servidor ni servicios nuevos. Sin localStorage (navegación privada de algunos navegadores),
//   la tarjeta no se enseña.
// - Se compara la media de 14 a 17 h, sin impuestos, de mañana frente a la de hoy. Si salen
//   iguales a tres decimales, empate: no cuenta ni rompe la racha.
// - La racha son los aciertos seguidos entre las apuestas hechas; un día sin apostar no la rompe.
// Se descartó apostar por el día entero: la media del día la mueven sobre todo los futuros, que
// suben o bajan todas las horas casi lo mismo; las horas de sol son las que más cambian con el tiempo.
const CLAVE_APUESTA = 'pvpc-bridge.apuesta.v1';
const HORAS_APUESTA = [14, 15, 16]; // de 14 a 17 h
const TEXTO_FRANJA = 'de 14 a 17 h';
const HORA_CIERRE = 12; // la subasta de mañana cierra a las 12:00, hora peninsular (ZONA)

// ¿Ese instante (ms) cae el día `dia`, en España, antes de las 12:00? 11:59 sí; 12:00 y 12:01, no.
const antesDelCierre = (instante, dia) => diaDeHoy(new Date(instante)) === dia
  && horaEnZona(new Date(instante)).hora < HORA_CIERRE;

function leerApuesta() {
  let crudo;
  try {
    crudo = localStorage.getItem(CLAVE_APUESTA);
    localStorage.setItem(`${CLAVE_APUESTA}.prueba`, '1');
    localStorage.removeItem(`${CLAVE_APUESTA}.prueba`);
  } catch {
    return null; // sin localStorage no hay apuesta
  }
  const vacio = { pendiente: null, ultimo: null, racha: { actual: 0, mejor: 0, jugadas: 0, aciertos: 0 } };
  try {
    const e = JSON.parse(crudo);
    const fecha = (f) => typeof f === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(f);
    const ok = e && e.racha && ['actual', 'mejor', 'jugadas', 'aciertos'].every((k) => Number.isInteger(e.racha[k]) && e.racha[k] >= 0)
      && (e.pendiente === null || (fecha(e.pendiente.dia) && fecha(e.pendiente.ref) && Number.isFinite(e.pendiente.refMedia)
        && Number.isFinite(e.pendiente.hecha) && ['barata', 'cara'].includes(e.pendiente.eleccion)));
    return ok ? { ...vacio, ...e } : vacio;
  } catch {
    return vacio;
  }
}
const guardarApuesta = (e) => { try { localStorage.setItem(CLAVE_APUESTA, JSON.stringify(e)); } catch { /* lleno o bloqueado */ } };

// Media de 14 a 17 h de un día, o null si falta alguna de esas horas.
function mediaFranja(horas) {
  const xs = (horas || []).filter((h) => HORAS_APUESTA.includes(h.hora)).map((h) => h.precio);
  return xs.length === HORAS_APUESTA.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}
const redondeo = (p) => Math.round(p * 1000); // a tres decimales, como se ve en pantalla

// Lo mismo con el precio del mercado diario (h.mercado, solo si el día vino de REData).
function mercadoFranja(horas) {
  const xs = (horas || []).filter((h) => HORAS_APUESTA.includes(h.hora) && Number.isFinite(h.mercado)).map((h) => h.mercado);
  return xs.length === HORAS_APUESTA.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

// ---------- Calendario: sábados, domingos y festivos de valle ----------
// Peajes y cargos van en valle las 24 horas los sábados, los domingos y los festivos nacionales
// de fecha fija. Es la lista de docs/proyecto-precio-luz.md (calendario.festivos_valle del
// contrato), como MM-DD. Los autonómicos, los locales y el Viernes Santo no cuentan.
const FESTIVOS_VALLE = ['01-01', '01-06', '05-01', '08-15', '10-12', '11-01', '12-06', '12-08', '12-25'];
const diaDeLaSemana = (f) => aFecha(f).getUTCDay(); // 0 domingo … 6 sábado
const esFestivoValle = (f) => FESTIVOS_VALLE.includes(f.slice(5));
const esLaborable = (f) => diaDeLaSemana(f) % 6 !== 0 && !esFestivoValle(f);

// Qué aviso de calendario lleva comparar `dia` con `ref` (el día anterior): 'sabado', 'lunes',
// 'festivo' o null. Uno como mucho, y solo en los cambios con cifras comprobadas:
// - 'festivo': un festivo de valle entre semana después de un laborable.
// - 'sabado': un sábado después de un laborable (con el viernes festivo, los dos ya van en valle).
// - 'lunes': un lunes laborable después de un domingo.
// Sin aviso: domingo tras sábado, laborables seguidos y el laborable que sigue a un festivo
// entre semana (de ese último no hay cifras: pocos casos).
function avisoCalendario(dia, ref) {
  if (!esLaborable(ref) && !(diaDeLaSemana(dia) === 1 && diaDeLaSemana(ref) === 0)) return null;
  if (esLaborable(ref) && esFestivoValle(dia) && diaDeLaSemana(dia) % 6 !== 0) return 'festivo';
  if (esLaborable(ref) && diaDeLaSemana(dia) === 6) return 'sabado';
  if (diaDeLaSemana(ref) === 0 && diaDeLaSemana(dia) === 1 && esLaborable(dia)) return 'lunes';
  return null;
}

// ---------- Ejemplo resuelto y manual de la apuesta (textos de Simone) ----------
// Los textos están en `apuesta` de web/contenido/textos.json (dueña: Simone); lo que va entre
// llaves lo rellena este código. Se lee el mismo JSON que pinta textos.js, una vez por visita.
const RUTA_TEXTOS = new URL('../contenido/textos.json', import.meta.url);
let textosApuesta = null;
function cargarTextosApuesta() {
  textosApuesta ??= fetch(RUTA_TEXTOS)
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => d?.apuesta ?? null)
    .catch(() => null);
  return textosApuesta;
}

// Rellena una plantilla de Simone y la convierte en nodos. Solo se acepta <strong> (lo único que
// usan estos textos) y como elemento de verdad; cualquier otra etiqueta sale como texto. Los
// valores se meten como texto, nunca como HTML. Se descartó innerHTML: un JSON con un <script>
// u onclick no debe ejecutarse nunca (la misma regla que textos.js).
function plantilla(texto, valores) {
  // Tras rellenar, las unidades no se parten: \u00a0 entre la cifra y la unidad y \u2060 tras la
  // barra de «€/kWh», como en euros().
  const rellenar = (s) => s.replace(/\{(\w+)\}/g, (m, k) => (k in valores ? String(valores[k]) : m))
    .replace(/(\d) (?=€\/kWh|%|km\/h|W\/m²)/g, '$1\u00a0')
    .replace(/€\/kWh/g, '€/\u2060kWh');
  return String(texto ?? '').split(/(<strong>[\s\S]*?<\/strong>)/).filter(Boolean)
    .map((parte) => (parte.startsWith('<strong>') && parte.endsWith('</strong>')
      ? el('strong', { texto: rellenar(parte.slice(8, -9)) })
      : rellenar(parte)));
}

// Ejemplo con el último día ya resuelto: «hoy» frente a «ayer», de 14 a 17 h. Se marca la opción
// que acertó, para que se lea como un día resuelto y no como una apuesta (ninguna si es empate).
// Marcado y estilos de Maya (.juego__ejemplo en base.css): botones disabled y el bueno con
// data-elegida. Devuelve null si falta algún precio o los textos.
function ejemploApuesta(t, ref, dia, horasRef, horasDia, pistas) {
  const mRef = mediaFranja(horasRef);
  const mDia = mediaFranja(horasDia);
  if (!t?.ejemplo || mRef === null || mDia === null) return null;
  const e = t.ejemplo;
  const empate = redondeo(mDia) === redondeo(mRef);
  const eleccion = mDia < mRef ? 'barata' : 'cara';
  const cmp = compararPrecio(mDia, mRef);
  const v = {
    dia: diaSemana(dia), dia_ref: diaSemana(ref), media_ref: euros(mRef), media_dia: euros(mDia), eleccion,
    comparacion: cmp.sentido === 'igual' ? 'casi igual' : cmp.texto.replace(/o$/, 'a'),
  };
  // Solo el mercado (indicador 600), si los dos días vinieron de REData. Sin él, el ejemplo sale igual.
  const mercRef = mercadoFranja(horasRef);
  const mercDia = mercadoFranja(horasDia);
  const conMercado = e.mercado && mercRef !== null && mercDia !== null;
  if (conMercado) Object.assign(v, { mercado_ref: f3.format(mercRef), mercado_dia: f3.format(mercDia) });
  const aviso = avisoCalendario(dia, ref);
  // La pista del mercado solo tiene sentido junto a la línea del mercado y con el aviso de sábado,
  // que es el caso del que da la cifra (85 de cada 100, no 97).
  const resultado = [...plantilla(empate ? e.empate : e.resultado, v)];
  if (conMercado) resultado.push(' ', ...plantilla(e.mercado, v));
  if (conMercado && aviso === 'sabado' && t.avisos?.pista_mercado) resultado.push(' ', ...plantilla(t.avisos.pista_mercado, v));
  if (pistas) {
    Object.assign(v, {
      viento_ref: f0.format(pistas.ref.viento), viento_dia: f0.format(pistas.dia.viento),
      sol_ref: f0.format(pistas.ref.sol), sol_dia: f0.format(pistas.dia.sol),
    });
  }
  const botones = ['barata', 'cara'].map((op) => el('button', {
    type: 'button', class: 'boton boton--secundario', disabled: '', 'data-elegida': !empate && op === eleccion ? '' : null,
    texto: `Más ${op}`,
  }));
  return el('div', { class: 'juego__ejemplo' }, [
    // Etiqueta, entrada y pregunta en un solo párrafo (marcado de Maya): una franja menos de alto.
    el('p', {}, [
      el('span', { class: 'juego__etiqueta', texto: e.etiqueta || 'Ejemplo' }),
      ...(e.entrada ? [...plantilla(e.entrada, v), ' '] : []), ...plantilla(e.pregunta, v),
    ]),
    pistas && e.pistas ? el('p', {}, plantilla(e.pistas, v)) : null,
    parrafoAviso(t, aviso),
    el('p', { class: 'juego__eleccion' }, botones),
    // Resultado, mercado y pista del mercado en un solo párrafo: la tarjeta no crece una franja más.
    el('p', { class: 'nota' }, resultado),
  ].filter(Boolean));
}

// El aviso de calendario (textos `apuesta.avisos` de textos.json) como párrafo, o null si no toca.
// «Mañana» en esos textos es el día que se apuesta: en el ejemplo, el día ya resuelto.
function parrafoAviso(t, aviso) {
  const texto = aviso && t?.avisos?.[aviso];
  return texto ? el('p', { class: 'nota juego__aviso' }, plantilla(texto, {})) : null;
}

// Manual de cuatro pasos (de la subasta al PVPC y qué lo mueve), plegado como «Cómo se calcula».
function manualApuesta(t) {
  const m = t?.manual;
  if (!m?.pasos?.length) return null;
  return el('details', { class: 'ficha__detalle juego__mas juego__manual' }, [
    el('summary', { texto: m.resumen || 'Cómo sale el precio de mañana' }),
    el('div', { class: 'juego__nota' }, [
      m.entrada ? el('p', { class: 'nota' }, plantilla(m.entrada, {})) : null,
      el('ol', { class: 'nota' }, m.pasos.map((p) => el('li', {}, [
        el('strong', { texto: p.titulo }), '. ', ...textoConEnlaces(p.texto),
      ]))),
    ].filter(Boolean)),
  ]);
}

// Como plantilla(), pero acepta también <a href="https://…"> (el manual enlaza a OMIE). Solo
// enlaces https absolutos o páginas de esta web; si no, el enlace sale como texto.
function textoConEnlaces(texto) {
  return String(texto ?? '').split(/(<a href="[^"]*">[\s\S]*?<\/a>)/).filter(Boolean).flatMap((parte) => {
    const m = parte.match(/^<a href="([^"]*)">([\s\S]*?)<\/a>$/);
    if (m && /^(https:\/\/|[a-z0-9-]+\.html(#[a-z0-9-]+)?$)/i.test(m[1])) {
      const a = el('a', { texto: m[2] });
      a.href = m[1];
      if (m[1].startsWith('https:')) a.rel = 'noopener';
      return [a];
    }
    return plantilla(parte, {});
  });
}

export async function pintarApuesta(contenedor) {
  const estado = leerApuesta();
  if (!estado) { contenedor.hidden = true; return; }
  const hoy = diaDeHoy();
  const manana = diaSiguiente(hoy);
  const [horasHoy, horasManana, tiempo] = await Promise.all([
    cargarDia(hoy), cargarDia(manana),
    tiempoEnHoras(hoy, manana, HORAS_APUESTA).catch(() => null),
  ]);
  const mHoy = mediaFranja(horasHoy);
  const mManana = mediaFranja(horasManana);
  const textos = await cargarTextosApuesta();

  // 1. Si hay una apuesta esperando y ya ha salido su precio, se resuelve. Una guardada a las
  //    12:00 o después de su día (con la respuesta ya decidida) no cuenta y se descarta.
  let recien = false;
  let p = estado.pendiente;
  if (p && !antesDelCierre(p.hecha, p.ref)) {
    estado.pendiente = null;
    guardarApuesta(estado);
    p = null;
  }
  if (p) {
    const horasDia = p.dia === manana ? horasManana : p.dia === hoy ? horasHoy : await cargarDia(p.dia);
    const m = mediaFranja(horasDia);
    if (m !== null) {
      const empate = redondeo(m) === redondeo(p.refMedia);
      const acierto = !empate && (p.eleccion === 'barata' ? m < p.refMedia : m > p.refMedia);
      const r = estado.racha;
      if (!empate) {
        r.jugadas += 1;
        if (acierto) { r.aciertos += 1; r.actual += 1; r.mejor = Math.max(r.mejor, r.actual); } else r.actual = 0;
      }
      estado.ultimo = { ...p, media: m, acierto, empate };
      estado.pendiente = null;
      guardarApuesta(estado);
      recien = true;
    }
  }
  if (mHoy === null && !estado.ultimo) { contenedor.hidden = true; return; }

  clearTimeout(contenedor.relojCierre);
  const sinPrecioManana = mHoy !== null && mManana === null;
  const abierta = sinPrecioManana && antesDelCierre(Date.now(), hoy); // antes de las 12:00
  const cerrada = sinPrecioManana && !abierta; // de 12:00 a que sale el precio de mañana
  const titulo = el('h3', { class: 'juego__titulo', texto: '¿Más barata o más cara mañana?' });
  const piezas = [titulo];

  // 2. El resultado de la última apuesta, mientras sea de hoy o de mañana (o recién resuelta).
  const u = estado.ultimo;
  if (u && (recien || u.dia >= hoy)) {
    const cmp = compararPrecio(u.media, u.refMedia);
    const como = cmp.sentido === 'igual' ? 'casi igual que' : `${cmp.texto.replace(/o$/, 'a')} que`;
    const palabra = u.empate ? 'Empate.' : u.acierto ? 'Acertaste.' : 'Esta vez no.';
    piezas.push(el('p', { class: 'juego__respuesta' }, [
      `${palabra} `,
      el('span', { texto: `Dijiste «más ${u.eleccion}». El ${diaSemana(u.dia)}, ${TEXTO_FRANJA}, la luz salió a ${euros(u.media)}, ${como} el ${diaSemana(u.ref)} (${f3.format(u.refMedia)}).` }),
    ]));
  }

  // 3. La pregunta, si aún se puede apostar; si no, cómo sale mañana frente a hoy.
  const estadoTexto = el('p', { class: 'nota juego__estado', 'aria-live': 'polite' });
  if (abierta) {
    // Si la página sigue abierta a las 12:00, la tarjeta se vuelve a pintar ya cerrada.
    const { hora, minuto, segundo } = horaEnZona();
    const faltan = (((HORA_CIERRE - hora) * 60 - minuto) * 60 - segundo) * 1000;
    contenedor.relojCierre = setTimeout(() => pintarApuesta(contenedor).catch(() => { contenedor.hidden = true; }), faltan + 1000);
    const botones = ['barata', 'cara'].map((op) => el('button', {
      type: 'button', class: 'boton boton--secundario', 'data-eleccion': op, 'aria-pressed': 'false', texto: `Más ${op}`,
    }));
    const marcar = () => {
      const elegida = estado.pendiente?.dia === manana ? estado.pendiente.eleccion : null;
      for (const b of botones) {
        const si = b.dataset.eleccion === elegida;
        b.setAttribute('aria-pressed', String(si));
        b.className = si ? 'boton' : 'boton boton--secundario';
      }
      estadoTexto.textContent = elegida
        ? `Tu apuesta: más ${elegida}. Puedes cambiarla hasta las 12:00 y lo sabrás cuando salga el precio de mañana, hacia las 20:45.`
        : 'Se puede apostar hasta las 12:00, hora peninsular.';
    };
    for (const b of botones) {
      b.addEventListener('click', () => {
        // Pulsado a las 12:00 o después con la página abierta desde antes: no se guarda.
        if (!antesDelCierre(Date.now(), hoy)) {
          pintarApuesta(contenedor).catch(() => { contenedor.hidden = true; });
          return;
        }
        estado.pendiente = { dia: manana, ref: hoy, refMedia: mHoy, eleccion: b.dataset.eleccion, hecha: Date.now() };
        guardarApuesta(estado);
        marcar();
      });
    }
    piezas.push(
      el('p', {}, [
        `¿Mañana, ${diaSemana(manana)}, ${TEXTO_FRANJA}, la luz será más barata o más cara que hoy? Hoy, a esas horas: `,
        el('strong', { texto: euros(mHoy) }), ' de media, sin impuestos.',
      ]),
      el('p', { class: 'juego__eleccion' }, botones),
      estadoTexto,
    );
    const tHoy = tiempo?.get(hoy);
    const tManana = tiempo?.get(manana);
    if (tHoy && tManana) {
      const pista = (nombre, a, b, unidad, formato) => el('li', { class: 'juego__pista' }, [
        el('span', { class: 'juego__pista-titulo', texto: nombre }),
        ` hoy ${formato.format(a)}\u00a0${unidad} · mañana ${formato.format(b)}\u00a0${unidad} (previsto)`,
      ]);
      piezas.push(
        el('p', { class: 'nota', texto: `Pistas, ${TEXTO_FRANJA}:` }),
        el('ul', { class: 'juego__pistas' }, [
          pista('Viento:', tHoy.viento, tManana.viento, 'km/h', f0),
          pista('Sol:', tHoy.sol, tManana.sol, 'W/m²', f0),
        ]),
      );
    }
    // Debajo de las pistas, si mañana es sábado, lunes o festivo: el calendario pesa más que el tiempo.
    piezas.push(parrafoAviso(textos, avisoCalendario(manana, hoy)));
    marcar();
  } else if (cerrada) {
    const tuya = estado.pendiente?.dia === manana ? estado.pendiente.eleccion : null;
    piezas.push(
      el('p', {}, [el('strong', { texto: 'Apuestas cerradas:' }), ' el precio de mañana ya está decidido y sale hacia las 20:45.']),
      el('p', { class: 'nota juego__estado' }, tuya
        ? [`Tu apuesta: más ${tuya} que hoy ${TEXTO_FRANJA} (`, el('strong', { texto: euros(mHoy) }), ' de media, sin impuestos).']
        : ['La próxima apuesta abre a medianoche y cierra a las 12:00.']),
    );
  } else if (mHoy !== null && mManana !== null && u?.dia === manana && (recien || u.dia >= hoy)) {
    // Ya se ha dicho arriba cómo sale mañana: solo cuándo vuelve la apuesta.
    piezas.push(el('p', { class: 'nota', texto: 'La próxima apuesta abre a medianoche y cierra a las 12:00.' }));
  } else if (mHoy !== null && mManana !== null) {
    const cmp = compararPrecio(mManana, mHoy);
    piezas.push(el('p', {}, [
      `Ya ha salido el precio de mañana: ${TEXTO_FRANJA}, `, el('strong', { texto: euros(mManana) }), ' de media, ',
      cmp.sentido === 'igual' ? 'casi igual que hoy' : `${cmp.texto.replace(/o$/, 'a')} que hoy`, ` (${f3.format(mHoy)}). `,
      'La próxima apuesta abre a medianoche y cierra a las 12:00.',
    ]));
  }

  // 3b. Con la apuesta cerrada (desde las 12:00 hasta medianoche), un ejemplo resuelto con hoy
  //     frente a ayer, en el sitio de las pistas. Sirve para entender el juego cuando
  //     no se puede apostar. Hoy y ayer ya los ha pedido la gráfica de hoy: ninguna consulta nueva
  //     a REE; solo una a Open-Meteo para las pistas, y sin ellas el ejemplo sale igual.
  //     Se descartó usar mañana frente a hoy cuando ya ha salido: repetiría la frase de arriba.
  if (!abierta && mHoy !== null) {
    const ayer = diaAnterior(hoy);
    const [horasAyer, pistas] = await Promise.all([
      cargarDia(ayer), pistasEjemplo(ayer, hoy, HORAS_APUESTA).catch(() => null),
    ]);
    const ejemplo = ejemploApuesta(textos, ayer, hoy, horasAyer, horasHoy, pistas);
    if (ejemplo) piezas.push(ejemplo);
  }

  // 4. La racha y de dónde sale todo.
  const r = estado.racha;
  if (r.jugadas > 0) {
    piezas.push(el('p', { class: 'juego__precio' }, [
      'Racha: ', el('strong', { texto: `${r.actual} seguid${r.actual === 1 ? 'o' : 'os'}` }),
      ` · mejor ${r.mejor} · ${r.aciertos} de ${r.jugadas} acertadas`,
    ]));
  }
  // A la vista, dónde se guarda la racha (es cuestión de confianza); el resto, plegado.
  piezas.push(
    el('p', { class: 'nota', texto: 'Tu apuesta y tu racha se quedan en este navegador.' }),
    manualApuesta(textos),
    comoSeCalcula([
      'Se apuesta hasta las 12:00 porque a esa hora cierra la subasta de mañana: desde entonces el precio está decidido y solo falta publicarlo (',
      Object.assign(el('a', { texto: 'por qué' }), { href: 'como-se-forma-el-precio.html' }),
      '). Pistas de Open-Meteo: media de los mismos seis puntos que en «¿Acertó el mercado?». Son coincidencias, no causas.',
    ]),
  );

  contenedor.hidden = false;
  contenedor.replaceChildren(...piezas.filter(Boolean));
}

export async function iniciarGraficas() {
  const hoy = document.querySelector('#precio-hoy [data-grafica="hoy"]');
  const historico = document.querySelector('#historico [data-grafica="historico"]');
  const equipo = document.querySelector('#equipo-tiempo [data-grafica="equipo"]');
  const acerto = document.querySelector('#precio-hoy [data-grafica="acerto"]');
  const apuesta = document.querySelector('#precio-hoy [data-grafica="apuesta"]');
  const tareas = [];
  if (hoy) {
    tareas.push(precioDelDia()
      .then((dia) => (dia ? pintarPrecioHoy(hoy, dia) : mostrarError(hoy, 'No hay precios disponibles ahora mismo.')))
      .catch((e) => { console.warn('precio-hoy:', e); mostrarError(hoy, 'No se ha podido dibujar el precio de hoy.'); }));
  }
  if (acerto) {
    tareas.push(pintarAcerto(acerto)
      .catch((e) => { console.warn('acerto:', e); acerto.hidden = true; }));
  }
  if (apuesta) {
    tareas.push(pintarApuesta(apuesta)
      .catch((e) => { console.warn('apuesta:', e); apuesta.hidden = true; }));
  }
  if (historico) {
    tareas.push(cargarHistorico()
      .then((horas) => (horas.length ? pintarHistorico(historico, horas) : mostrarError(historico, 'No se han encontrado los datos históricos.')))
      .catch((e) => { console.warn('historico:', e); mostrarError(historico, 'No se ha podido dibujar el histórico.'); }));
  }
  if (equipo) {
    tareas.push(cargarActividad()
      .then((datos) => pintarEquipo(equipo, datos))
      .catch((e) => { console.warn('equipo-tiempo:', e); mostrarError(equipo, 'No se ha podido dibujar la actividad del equipo.'); }));
  }
  await Promise.allSettled(tareas);
}
