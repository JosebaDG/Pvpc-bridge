// Dueño: Charlie (equipo-agentes #4).
// Lee el precio de la luz (PVPC 2.0TD, península, sin impuestos) y lo deja en €/kWh.
//
// De dónde salen los datos:
// - Histórico: los CSV del repo, uno por año, con columnas fecha_hora_local,fecha_hora_utc,eur_mwh.
//   En GitHub Pages la Action los copia a web/datos/; en local se leen de ../datos/historico/.
// - Hoy: primero REData en directo desde el navegador (REE permite leerla desde otra web: responde
//   con la cabecera CORS «Access-Control-Allow-Origin: *»). Si falla, el último día de los CSV.
//
// Sin dependencias: solo fetch y JavaScript del navegador.

export const PRIMER_AÑO = 2022;
export const ZONA = 'Europe/Madrid';
const REDATA = 'https://apidatos.ree.es/es/datos/mercados/precios-mercados-tiempo-real';
const ESPERA_REDATA_MS = 8000;

// ---------- Fechas en hora de España ----------

// Fecha de hoy en España como 'AAAA-MM-DD', se abra la web desde donde se abra.
export function diaDeHoy(ahora = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(ahora);
}

// ---------- Rutas de los CSV ----------

// En local (python3 -m http.server) los CSV están fuera de web/; en Pages, dentro de web/datos/.
// Probamos primero la ruta que toca según dónde se abre la web y, si falla, la otra.
// Así no salen errores 404 en la consola en ninguno de los dos casos normales.
function esLocal() {
  const h = location.hostname;
  return location.protocol === 'file:' || h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h === '';
}

export function rutasCSV(año) {
  const pages = `datos/${año}.csv`;
  const local = `../datos/historico/pvpc_peninsula_horario/${año}.csv`;
  return esLocal() ? [local, pages] : [pages, local];
}

// ---------- Lectura y conversión ----------

// Cada hora queda así: { fecha: '2026-10-12', hora: 21, utc: <milisegundos>, precio: 0.30246 }
// precio en €/kWh sin impuestos (el CSV viene en €/MWh: se divide entre 1000).
// fecha y hora son las de España (las de fecha_hora_local), para que el cambio de hora no descuadre.
function filaAHora(local, utc, eurMwh) {
  const precio = Number(eurMwh) / 1000;
  if (!local || !Number.isFinite(precio)) return null;
  return {
    fecha: local.slice(0, 10),
    hora: Number(local.slice(11, 13)),
    utc: Date.parse(utc || local),
    precio,
  };
}

export function leerCSV(texto) {
  const lineas = texto.trim().split(/\r?\n/);
  const cab = lineas.shift().split(',');
  const iLocal = cab.indexOf('fecha_hora_local');
  const iUtc = cab.indexOf('fecha_hora_utc');
  const iPrecio = cab.indexOf('eur_mwh');
  const horas = [];
  for (const linea of lineas) {
    const c = linea.split(',');
    const h = filaAHora(c[iLocal], c[iUtc], c[iPrecio]);
    if (h) horas.push(h);
  }
  return horas;
}

const cacheAños = new Map();

// Devuelve las horas de un año. Si el CSV no existe (por ejemplo, el 1 de enero antes de
// actualizar los datos), devuelve una lista vacía en vez de romper la web.
export function cargarAño(año) {
  if (!cacheAños.has(año)) {
    cacheAños.set(año, (async () => {
      for (const ruta of rutasCSV(año)) {
        try {
          const r = await fetch(ruta);
          if (r.ok) return leerCSV(await r.text());
        } catch { /* probamos la otra ruta */ }
      }
      return [];
    })());
  }
  return cacheAños.get(año);
}

// Todas las horas desde PRIMER_AÑO hasta el año actual, ordenadas en el tiempo.
export async function cargarHistorico() {
  const ultimo = Number(diaDeHoy().slice(0, 4));
  const años = [];
  for (let a = PRIMER_AÑO; a <= ultimo; a++) años.push(a);
  const listas = await Promise.all(años.map(cargarAño));
  return listas.flat().sort((a, b) => a.utc - b.utc);
}

// ---------- Hoy en directo desde REData ----------

// Pide a REData el PVPC de un día. Es una petición GET sin cabeceras extra a propósito:
// REE contesta a GET con CORS abierto, pero rechaza (403) la «consulta previa» OPTIONS que
// el navegador haría si añadiéramos cabeceras propias. Devuelve null si algo falla.
export async function cargarDiaREData(fecha) {
  const url = `${REDATA}?start_date=${fecha}T00:00&end_date=${fecha}T23:59&time_trunc=hour`;
  const corte = new AbortController();
  const reloj = setTimeout(() => corte.abort(), ESPERA_REDATA_MS);
  try {
    const r = await fetch(url, { signal: corte.signal });
    if (!r.ok) return null;
    const json = await r.json();
    const serie = (json.included || []).find((s) => s.type === 'PVPC' || s.id === '1001');
    const valores = serie?.attributes?.values || [];
    const horas = valores
      .map((v) => filaAHora(v.datetime, v.datetime, v.value))
      .filter((h) => h && h.fecha === fecha);
    return horas.length >= 23 ? horas : null; // 23 o 25 horas los días de cambio de hora
  } catch {
    return null;
  } finally {
    clearTimeout(reloj);
  }
}

// ---------- El día que enseña la gráfica de hoy ----------

// Devuelve { fecha, horas, fuente: 'redata' | 'csv', esHoy }.
// Orden: REData en directo para hoy; si no responde, el día de hoy en el CSV; si el CSV
// aún no lo tiene, el último día completo del CSV (y esHoy = false para avisar en pantalla).
export async function precioDelDia() {
  const hoy = diaDeHoy();
  const directo = await cargarDiaREData(hoy);
  if (directo) return { fecha: hoy, horas: directo, fuente: 'redata', esHoy: true };

  const año = Number(hoy.slice(0, 4));
  let horas = await cargarAño(año);
  if (!horas.length) horas = await cargarAño(año - 1);
  const porDia = agruparPorDia(horas);
  const dias = [...porDia.keys()].filter((f) => f <= hoy && porDia.get(f).length >= 23).sort();
  const fecha = dias.at(-1);
  if (!fecha) return null;
  return { fecha, horas: porDia.get(fecha), fuente: 'csv', esHoy: fecha === hoy };
}

export function agruparPorDia(horas) {
  const m = new Map();
  for (const h of horas) {
    if (!m.has(h.fecha)) m.set(h.fecha, []);
    m.get(h.fecha).push(h);
  }
  return m;
}

// ---------- Cálculos para la gráfica de hoy ----------

// Reparte las horas del día en tres grupos del mismo tamaño ordenándolas por precio:
// el tercio más barato, el del medio y el más caro (con 24 horas, 8 en cada uno).
export function tercios(horas) {
  const orden = horas.map((h, i) => [h.precio, i]).sort((a, b) => a[0] - b[0]);
  const grupo = new Array(horas.length);
  orden.forEach(([, i], pos) => {
    const t = (pos * 3) / horas.length;
    grupo[i] = t < 1 ? 'barato' : t < 2 ? 'medio' : 'caro';
  });
  return grupo;
}

// Las n horas seguidas con la media más baja. Devuelve { inicio, fin, media } con índices
// de la lista (fin incluido).
export function mejorBloque(horas, n = 3) {
  let mejor = null;
  for (let i = 0; i + n <= horas.length; i++) {
    let suma = 0;
    for (let j = i; j < i + n; j++) suma += horas[j].precio;
    if (!mejor || suma < mejor.suma) mejor = { inicio: i, fin: i + n - 1, suma };
  }
  return mejor && { inicio: mejor.inicio, fin: mejor.fin, media: mejor.suma / n };
}
