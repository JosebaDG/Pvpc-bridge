// Dueño: Charlie (equipo-agentes #4).
// Dibuja las dos gráficas de la web sin librerías:
// - precio-hoy: 24 barras en SVG hecho a mano (SVG = dibujo con formas que el navegador escala sin
//   perder nitidez y que se puede inspeccionar como el resto de la página).
// - historico: mapa de calor día × hora en canvas (canvas = un lienzo de píxeles; con unas 41.000
//   celdas es mucho más rápido que crear 41.000 elementos SVG) y la media mensual como línea.
//
// Uso (desde main.js):
//   import { iniciarGraficas } from './graficas.js';
//   iniciarGraficas();
// Busca #precio-hoy [data-grafica="hoy"] y #historico [data-grafica="historico"] y los rellena.

import {
  precioDelDia, cargarHistorico, tercios, mejorBloque, PRIMER_AÑO,
} from './datos.js';

// ---------- Colores: solo variables CSS de Maya (web/css/tokens.css, equipo-agentes #3) ----------
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
const euros = (p) => `${f3.format(p)} €/kWh`;
const dos = (n) => String(n).padStart(2, '0');
const tramo = (h) => `${dos(h)}–${dos((h + 1) % 24)} h`;
const aFecha = (f) => new Date(`${f}T12:00:00Z`);
const fechaLarga = (f) => new Intl.DateTimeFormat('es-ES', {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
}).format(aFecha(f)).replace(',', ''); // «miércoles 14 de octubre de 2026», sin coma
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

export function pintarPrecioHoy(contenedor, dia) {
  const { horas, fecha, esHoy, fuente } = dia;
  const grupo = tercios(horas);
  const bloque = mejorBloque(horas, 3);
  const precios = horas.map((h) => h.precio);
  const iMin = precios.indexOf(Math.min(...precios));
  const iMax = precios.indexOf(Math.max(...precios));
  const ahora = Date.now();
  const iAhora = esHoy ? horas.findIndex((h) => ahora >= h.utc && ahora < h.utc + 3600e3) : -1;

  // Cabecera con la fecha bien visible, y aviso si no es hoy.
  const cabecera = esHoy
    ? el('p', { class: 'grafica-fecha', 'data-estado': 'hoy' }, [
      el('strong', { texto: `Hoy, ${fechaLarga(fecha)}` }),
      fuente === 'redata' ? ' · en directo de REData (REE)' : ' · datos del repositorio',
    ])
    : el('p', { class: 'grafica-fecha', 'data-estado': 'atrasado', role: 'status' }, [
      el('strong', { texto: `Datos del ${fechaLarga(fecha)}` }),
      ' · aún no hay precios de hoy, así que se muestra el último día con datos.',
    ]);

  const resumen = el('p', { class: 'grafica-resumen' }, [
    'Más barata: ', el('strong', { texto: tramo(horas[iMin].hora) }), `, ${euros(precios[iMin])}. `,
    'Más cara: ', el('strong', { texto: tramo(horas[iMax].hora) }), `, ${euros(precios[iMax])}. `,
    'Mejor bloque de 3 horas seguidas: ',
    el('strong', { texto: `${dos(horas[bloque.inicio].hora)}–${dos((horas[bloque.fin].hora + 1) % 24)} h` }),
    `, media ${euros(bloque.media)}.`,
  ]);

  const detalle = el('p', { class: 'nota grafica-detalle', 'aria-live': 'polite', texto: 'Toca una barra para ver su precio.' });

  // Leyenda con las etiquetas .tramo de Maya: color y palabra siempre juntos (daltonismo).
  const leyenda = el('ul', { class: 'grafica-leyenda', style: 'list-style:none;padding:0;margin:0 0 1rem;display:flex;flex-wrap:wrap;align-items:center;gap:.5em 1em' }, [
    el('li', {}, el('span', { class: 'tramo tramo--barato', texto: 'Las 8 más baratas' })),
    el('li', {}, el('span', { class: 'tramo tramo--medio', texto: 'Las 8 del medio' })),
    el('li', {}, el('span', { class: 'tramo tramo--caro', texto: 'Las 8 más caras' })),
    el('li', {}, [muestra('superficie', `outline:2px solid ${color('acento')};outline-offset:-2px`), 'Mejor bloque de 3 h']),
    iAhora >= 0 ? el('li', {}, [muestra('chispa', `outline:2px solid ${color('acento')};outline-offset:-2px`), 'Hora actual']) : null,
  ]);

  // El precio de ahora, en grande (.cifra de Maya), con su tramo. Solo si el día es hoy.
  const ahoraBloque = iAhora >= 0
    ? el('div', { class: 'grafica-ahora', style: 'display:flex;flex-wrap:wrap;align-items:baseline;gap:.4em 1em;margin-bottom:1rem' }, [
      el('span', { class: 'cifra' }, [f3.format(precios[iAhora]), el('span', { class: 'cifra__unidad', texto: '€/kWh ahora' })]),
      el('span', { class: `tramo tramo--${grupo[iAhora]}`, texto: `${PALABRA_TERCIO[grupo[iAhora]]} · ${tramo(horas[iAhora].hora)}` }),
    ])
    : null;

  const nota = el('p', { class: 'nota grafica-nota', texto: 'PVPC 2.0TD de la península, en €/kWh y sin impuestos. Fuente: Red Eléctrica (REE), REData.' });

  const lienzo = el('div', { class: 'grafica-lienzo' });
  contenedor.replaceChildren(...[cabecera, ahoraBloque, lienzo, detalle, resumen, leyenda, nota].filter(Boolean));

  const verDetalle = (i) => {
    detalle.textContent = `${tramo(horas[i].hora)}: ${euros(horas[i].precio)} (${NOMBRE_TERCIO[grupo[i]]}${i >= bloque.inicio && i <= bloque.fin ? ', dentro del mejor bloque' : ''}${i === iAhora ? ', ahora' : ''})`;
  };

  alCambiarAncho(lienzo, (W) => {
    const estrecho = W < 520;
    const H = estrecho ? 250 : 300;
    const m = { izq: 40, der: 6, arr: 34, aba: 26 };
    const anchoG = W - m.izq - m.der;
    const altoG = H - m.arr - m.aba;
    const yMin = Math.min(0, ...precios);
    const yMax = Math.max(...precios, 0.001) * 1.1;
    const y = (v) => m.arr + altoG * (1 - (v - yMin) / (yMax - yMin));
    const hueco = anchoG / horas.length;
    const x = (i) => m.izq + i * hueco;
    const anchoBarra = Math.max(2, hueco * 0.78);

    const svg = s('svg', {
      viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img',
      'aria-label': `Precio por horas del ${fechaLarga(fecha)}. ${resumen.textContent}`,
      style: `display:block;max-width:100%;height:auto;font-family:inherit;font-size:${estrecho ? 11 : 12}px;overflow:visible`,
    });

    // Rejilla horizontal con las etiquetas de precio.
    for (const v of marcas(yMin, yMax)) {
      svg.append(
        s('line', { x1: m.izq, x2: W - m.der, y1: y(v), y2: y(v), stroke: v === 0 ? color('eje') : color('rejilla') }),
        s('text', { x: m.izq - 6, y: y(v), dy: '0.32em', 'text-anchor': 'end', fill: color('eje'), texto: f2.format(v) }),
      );
    }
    svg.append(s('text', { x: 0, y: 12, fill: color('eje'), texto: '€/kWh' }));

    // Fondo del mejor bloque de 3 horas, con su etiqueta arriba.
    const xb = x(bloque.inicio);
    const wb = hueco * (bloque.fin - bloque.inicio + 1);
    const cx = Math.min(Math.max(xb + wb / 2, m.izq + 60), W - m.der - 60);
    svg.append(
      s('rect', {
        x: xb + 1, y: m.arr - 5, width: wb - 2, height: altoG + 4, rx: 4,
        fill: 'none', stroke: color('acento'), 'stroke-width': 2, 'pointer-events': 'none',
      }),
      s('text', { x: cx, y: m.arr - 12, 'text-anchor': 'middle', 'font-weight': 600, fill: color('acento'), texto: `Mejor bloque · ${f3.format(bloque.media)}` }),
    );

    // Hora actual: un halo «chispa» detrás de su barra (la marca en acento va después).
    if (iAhora >= 0) {
      svg.append(s('rect', {
        x: x(iAhora) + 1, y: m.arr - 6, width: Math.max(2, hueco - 2), height: altoG + 6, rx: 4,
        fill: color('chispa'), 'pointer-events': 'none',
      }));
    }

    // Las barras.
    horas.forEach((h, i) => {
      const y0 = y(Math.max(h.precio, 0));
      const y1 = y(Math.min(h.precio, 0));
      const barra = s('rect', {
        x: x(i) + (hueco - anchoBarra) / 2, y: y0, width: anchoBarra, height: Math.max(1, y1 - y0),
        rx: Math.min(3, anchoBarra / 4), fill: color(grupo[i]), tabindex: 0, style: 'cursor:pointer',
      }, s('title', { texto: `${tramo(h.hora)}: ${euros(h.precio)} (${NOMBRE_TERCIO[grupo[i]]})` }));
      barra.addEventListener('pointerenter', () => verDetalle(i));
      barra.addEventListener('click', () => verDetalle(i));
      barra.addEventListener('focus', () => verDetalle(i));
      svg.append(barra);
    });

    // Hora actual: contorno en acento sobre la barra y la etiqueta «ahora» encima.
    if (iAhora >= 0) {
      const h = horas[iAhora];
      const xa = x(iAhora) + hueco / 2;
      const ya = y(Math.max(h.precio, 0));
      svg.append(
        s('rect', {
          x: x(iAhora) + (hueco - anchoBarra) / 2 - 1.5, y: ya - 1.5, width: anchoBarra + 3,
          height: Math.max(1, y(Math.min(h.precio, 0)) - ya) + 3, rx: 3, fill: 'none',
          stroke: color('acento'), 'stroke-width': 2, 'pointer-events': 'none',
        }),
        s('text', {
          x: Math.min(Math.max(xa, m.izq + 18), W - m.der - 18), y: ya - 8, 'text-anchor': 'middle',
          'font-weight': 700, fill: color('acento'), 'pointer-events': 'none', texto: 'ahora',
        }),
      );
    }

    // Eje de horas: todas si caben, si no cada 3.
    const cada = hueco >= 24 ? 1 : 3;
    horas.forEach((h, i) => {
      if (h.hora % cada !== 0 || (i > 0 && horas[i - 1].hora === h.hora)) return;
      svg.append(s('text', {
        x: x(i) + hueco / 2, y: H - m.aba + 16, 'text-anchor': 'middle', fill: color('eje'), texto: dos(h.hora),
      }));
    });

    lienzo.replaceChildren(svg);
  });
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
    el('span', { texto: `≥ ${f3.format(pAlto)} €/kWh` }),
  ]);
  const nota = el('p', {
    class: 'nota grafica-nota',
    texto: `Desde el 1 de enero de ${PRIMER_AÑO} hasta el ${fechaLarga(ultimoDia)}. El color va del 5 % de horas más baratas (${euros(pBajo)}) al 5 % más caras (${euros(pAlto)}), con la mediana (${euros(pMedio)}) en el centro. PVPC de la península, sin impuestos. Fuente: Red Eléctrica (REE), REData.`,
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
// Arranque
// =====================================================================

export async function iniciarGraficas() {
  const hoy = document.querySelector('#precio-hoy [data-grafica="hoy"]');
  const historico = document.querySelector('#historico [data-grafica="historico"]');
  const tareas = [];
  if (hoy) {
    tareas.push(precioDelDia()
      .then((dia) => (dia ? pintarPrecioHoy(hoy, dia) : mostrarError(hoy, 'No hay precios disponibles ahora mismo.')))
      .catch((e) => { console.warn('precio-hoy:', e); mostrarError(hoy, 'No se ha podido dibujar el precio de hoy.'); }));
  }
  if (historico) {
    tareas.push(cargarHistorico()
      .then((horas) => (horas.length ? pintarHistorico(historico, horas) : mostrarError(historico, 'No se han encontrado los datos históricos.')))
      .catch((e) => { console.warn('historico:', e); mostrarError(historico, 'No se ha podido dibujar el histórico.'); }));
  }
  await Promise.allSettled(tareas);
}
