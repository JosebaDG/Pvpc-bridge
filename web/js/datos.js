// Dueño: Charlie.
// Lee el precio de la luz (PVPC 2.0TD, península, sin impuestos) y lo deja en €/kWh.
//
// De dónde salen los datos:
// - Histórico: los CSV del repo, uno por año, con columnas fecha_hora_local,fecha_hora_utc,eur_mwh.
//   En GitHub Pages la Action los copia a web/datos/; en local se leen de ../datos/historico/.
// - Hoy: primero REData en directo desde el navegador (REE permite leerla desde otra web: responde
//   con la cabecera CORS «Access-Control-Allow-Origin: *»). Si falla, el último día de los CSV.
// - Mañana: la publicación diaria de las 21:30 (hora peninsular) ya guarda en los CSV el PVPC de
//   mañana. Por eso el último día de los CSV puede ser mañana: lo que enseña «hoy» se filtra
//   siempre por la fecha de hoy, nunca por el último día del archivo.
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

// Hora, minuto y segundo en España (hora peninsular, 0-23), se abra la web desde donde se abra.
export function horaEnZona(ahora = new Date()) {
  const partes = new Intl.DateTimeFormat('en-GB', {
    timeZone: ZONA, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(ahora);
  const n = (tipo) => Number(partes.find((p) => p.type === tipo).value);
  return { hora: n('hour'), minuto: n('minute'), segundo: n('second') };
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

// Las horas de un día en los CSV del repo, o null si ese día no está completo (23, 24 o 25 horas).
export async function diaDelCSV(fecha) {
  const horas = agruparPorDia(await cargarAño(Number(fecha.slice(0, 4)))).get(fecha) || [];
  return horas.length >= 23 ? horas : null;
}

// ---------- Hoy en directo desde REData ----------

// Pide a REData el PVPC de un día. Es una petición GET sin cabeceras extra a propósito:
// REE contesta a GET con CORS abierto, pero rechaza (403) la «consulta previa» OPTIONS que
// el navegador haría si añadiéramos cabeceras propias. Devuelve null si algo falla.
// Cada día se pide una sola vez por visita: la gráfica de hoy, «¿Acertó el mercado?» y la
// apuesta comparten la misma respuesta (también si es null) y REE no recibe consultas repetidas.
// - El precio de mañana sale hacia las 20:45, hora peninsular: antes de las 20:00 no se pide
//   (REE contestaría 502 y sería una consulta perdida) y se da por «aun no ha salido» (null).
//   Ese null no se guarda, para que una tarjeta que se repinte después de las 20:00 sí lo pida.
//   Un día más allá de mañana nunca se pide.
const HORA_PUBLICACION = 20;
export function aunSinPublicar(fecha, ahora = new Date()) {
  const hoy = diaDeHoy(ahora);
  if (fecha <= hoy) return false;
  return fecha > diaSiguiente(hoy) || horaEnZona(ahora).hora < HORA_PUBLICACION;
}
const diasPedidos = new Map();
export function cargarDiaREData(fecha) {
  if (aunSinPublicar(fecha)) return Promise.resolve(null);
  if (!diasPedidos.has(fecha)) diasPedidos.set(fecha, pedirDiaREData(fecha));
  return diasPedidos.get(fecha);
}

// Como cargarDiaREData, pero si REData no responde mira los CSV del repo, que tras la publicación
// de las 21:30 ya traen el PVPC de mañana. Antes de que salga (aunSinPublicar) da null igual.
export async function cargarDia(fecha) {
  if (aunSinPublicar(fecha)) return null;
  return (await cargarDiaREData(fecha)) || diaDelCSV(fecha);
}

async function pedirDiaREData(fecha) {
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

// Fecha anterior a 'AAAA-MM-DD', también como 'AAAA-MM-DD' (a mediodía UTC: sin líos de cambio de hora).
export function diaAnterior(fecha) {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// Fecha siguiente a 'AAAA-MM-DD'.
export function diaSiguiente(fecha) {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// El día anterior a `fecha`, para comparar hora a hora. La misma cadena que para hoy:
// primero REData en directo y, si falla, el CSV del repo. Devuelve { fecha, horas, fuente }
// o null si no hay datos completos de ese día (la web entonces no enseña la comparación).
export async function precioDelDiaAnterior(fecha) {
  const ayer = diaAnterior(fecha);
  const directo = await cargarDiaREData(ayer);
  if (directo) return { fecha: ayer, horas: directo, fuente: 'redata' };
  const horas = await diaDelCSV(ayer);
  return horas ? { fecha: ayer, horas, fuente: 'csv' } : null;
}

// Compara un precio con el de otro día a la misma hora. Devuelve
// { sentido: 'barato' | 'caro' | 'igual', texto } con texto como «un 23 % más barato».
// - Diferencia menor del 2 %: «casi igual».
// - Si el precio de referencia está cerca de cero o es negativo (pasa con mucho sol), un
//   porcentaje no significa nada (de -0,01 a 0,02 sería «-300 %»): se da la diferencia en €/kWh.
// - Lo mismo si el precio de hoy es negativo: de 0,010 a -0,010 saldría «un 200 % más barato».
export function compararPrecio(precio, referencia) {
  const dif = precio - referencia;
  const sentido = dif < 0 ? 'barato' : 'caro';
  if (referencia >= 0.005 && precio >= 0) {
    const pct = Math.abs(dif) / referencia * 100;
    if (pct < 2) return { sentido: 'igual', texto: 'casi igual' };
    return { sentido, texto: `un ${Math.round(pct)}\u00a0% más ${sentido}` };
  }
  if (Math.abs(dif) < 0.001) return { sentido: 'igual', texto: 'casi igual' };
  const cifra = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(Math.abs(dif));
  return { sentido, texto: `${cifra}\u00a0€/\u2060kWh más ${sentido}` };
}

export function agruparPorDia(horas) {
  const m = new Map();
  for (const h of horas) {
    if (!m.has(h.fecha)) m.set(h.fecha, []);
    m.get(h.fecha).push(h);
  }
  return m;
}

// ---------- «¿Acertó el mercado?»: tiempo previsto, tiempo que hizo y generación real ----------

// Los seis puntos del histórico de meteo (datos/manifiesto.json): Lugo, Burgos, Zaragoza,
// Albacete, Badajoz y Bilbao. Repartidos por la península, cerca de zonas con eólica o solar.
const PUNTOS_METEO = [[43.01, -7.56], [42.34, -3.7], [41.65, -0.88], [38.99, -1.86], [38.88, -6.97], [43.26, -2.93]];
// API «Previous Runs» de Open-Meteo: gratis, sin clave y con CORS abierto. Para cada hora da la
// previsión más reciente (`variable`, lo más parecido a lo que hizo) y la que se hacía un día
// antes (`variable_previous_day1`), que es la que había cuando el mercado diario cerró.
const OPEN_METEO = 'https://previous-runs-api.open-meteo.com/v1/forecast';
const REDATA_GENERACION = 'https://apidatos.ree.es/es/datos/generacion/estructura-generacion';

async function pedirJSON(url, espera = ESPERA_REDATA_MS) {
  const corte = new AbortController();
  const reloj = setTimeout(() => corte.abort(), espera);
  try {
    const r = await fetch(url, { signal: corte.signal }); // GET sin cabeceras extra (ver cargarDiaREData)
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(reloj);
  }
}

const mediaDe = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

// Viento y sol de un día, previstos un día antes y los que hubo, de media en los seis puntos.
// Devuelve { viento: { previsto, real } en km/h a 100 m (media del día, la altura de los
// aerogeneradores), sol: { previsto, real } en kWh/m² (radiación del día) } o null.
export async function tiempoPrevistoYReal(fecha) {
  const vars = ['wind_speed_100m', 'shortwave_radiation'];
  const url = `${OPEN_METEO}?latitude=${PUNTOS_METEO.map((p) => p[0]).join(',')}`
    + `&longitude=${PUNTOS_METEO.map((p) => p[1]).join(',')}`
    + `&hourly=${vars.flatMap((v) => [v, `${v}_previous_day1`]).join(',')}`
    + `&start_date=${fecha}&end_date=${fecha}&timezone=${encodeURIComponent(ZONA)}`;
  const json = await pedirJSON(url);
  const puntos = [].concat(json || []); // con varios puntos, Open-Meteo devuelve una lista
  if (puntos.length !== PUNTOS_METEO.length) return null;
  const porPunto = (v, conv) => {
    const vals = puntos.map((p) => {
      const xs = p.hourly?.[v] ?? [];
      return xs.length >= 23 && xs.every(Number.isFinite) ? conv(xs) : NaN;
    });
    return vals.every(Number.isFinite) ? mediaDe(vals) : NaN;
  };
  const viento = (xs) => mediaDe(xs);
  const sol = (xs) => xs.reduce((a, b) => a + b, 0) / 1000; // W/m² cada hora -> kWh/m² del día
  const r = {
    viento: { previsto: porPunto('wind_speed_100m_previous_day1', viento), real: porPunto('wind_speed_100m', viento) },
    sol: { previsto: porPunto('shortwave_radiation_previous_day1', sol), real: porPunto('shortwave_radiation', sol) },
  };
  return Object.values(r).every((x) => Number.isFinite(x.previsto) && Number.isFinite(x.real)) ? r : null;
}

// API normal de previsión de Open-Meteo (gratis, sin clave, CORS abierto): para la apuesta.
const OPEN_METEO_PREVISION = 'https://api.open-meteo.com/v1/forecast';

// Viento a 100 m (km/h) y sol (W/m²) de media en unas horas de cada día, en los seis puntos.
// Para mañana es la previsión; para hoy, la más reciente del modelo. Devuelve
// Map(fecha -> { viento, sol }) o null si falta algo.
export async function tiempoEnHoras(desde, hasta, horas) {
  const url = `${OPEN_METEO_PREVISION}?latitude=${PUNTOS_METEO.map((p) => p[0]).join(',')}`
    + `&longitude=${PUNTOS_METEO.map((p) => p[1]).join(',')}`
    + '&hourly=wind_speed_100m,shortwave_radiation'
    + `&start_date=${desde}&end_date=${hasta}&timezone=${encodeURIComponent(ZONA)}`;
  const puntos = [].concat((await pedirJSON(url)) || []);
  if (puntos.length !== PUNTOS_METEO.length) return null;
  const m = new Map();
  for (const p of puntos) {
    const t = p.hourly?.time ?? [];
    t.forEach((iso, k) => {
      if (!horas.includes(Number(iso.slice(11, 13)))) return;
      const f = iso.slice(0, 10);
      if (!m.has(f)) m.set(f, { viento: [], sol: [] });
      m.get(f).viento.push(p.hourly.wind_speed_100m?.[k]);
      m.get(f).sol.push(p.hourly.shortwave_radiation?.[k]);
    });
  }
  const r = new Map();
  for (const [f, { viento, sol }] of m) {
    const completo = (xs) => xs.length === horas.length * PUNTOS_METEO.length && xs.every(Number.isFinite);
    if (completo(viento) && completo(sol)) r.set(f, { viento: mediaDe(viento), sol: mediaDe(sol) });
  }
  return r.size ? r : null;
}

// Pistas del ejemplo de la apuesta (un día ya resuelto): viento a 100 m (km/h) y sol (W/m²) de
// media en unas horas, en los seis puntos, con la API «Previous Runs» de Open-Meteo.
// - Día de referencia (`ref`): su análisis más reciente, lo que hizo aquella tarde.
// - Día apostado (`dia`): la previsión de un día antes, la que se veía la mañana de la apuesta.
// Así cuadra con lo que enseña la apuesta de verdad: «hoy» casi real y «mañana» previsto.
// Comprobado con el ejemplo de Simone (viernes 16 → sábado 17): 9 → 23 km/h y 530 → 342 W/m².
// Se pide una vez por visita: si la tarjeta se repinta (a las 12:00), reutiliza la respuesta.
// Devuelve { ref: { viento, sol }, dia: { viento, sol } } o null si falta algo.
const pistasPedidas = new Map();
export function pistasEjemplo(ref, dia, horas) {
  const clave = `${ref}|${dia}|${horas.join(',')}`;
  if (!pistasPedidas.has(clave)) pistasPedidas.set(clave, pedirPistasEjemplo(ref, dia, horas));
  return pistasPedidas.get(clave);
}
async function pedirPistasEjemplo(ref, dia, horas) {
  const vars = ['wind_speed_100m', 'shortwave_radiation'];
  const url = `${OPEN_METEO}?latitude=${PUNTOS_METEO.map((p) => p[0]).join(',')}`
    + `&longitude=${PUNTOS_METEO.map((p) => p[1]).join(',')}`
    + `&hourly=${vars.flatMap((v) => [v, `${v}_previous_day1`]).join(',')}`
    + `&start_date=${ref}&end_date=${dia}&timezone=${encodeURIComponent(ZONA)}`;
  const puntos = [].concat((await pedirJSON(url)) || []);
  if (puntos.length !== PUNTOS_METEO.length) return null;
  const media = (fecha, sufijo) => {
    const r = {};
    for (const [clave, v] of [['viento', vars[0]], ['sol', vars[1]]]) {
      const xs = puntos.flatMap((p) => (p.hourly?.time ?? [])
        .map((iso, k) => (iso.slice(0, 10) === fecha && horas.includes(Number(iso.slice(11, 13))) ? p.hourly[v + sufijo]?.[k] : undefined))
        .filter((x) => x !== undefined));
      if (xs.length !== horas.length * PUNTOS_METEO.length || !xs.every(Number.isFinite)) return null;
      r[clave] = mediaDe(xs);
    }
    return r;
  };
  const r = { ref: media(ref, ''), dia: media(dia, '_previous_day1') };
  return r.ref && r.dia ? r : null;
}

// Eólica y fotovoltaica reales de España, en MWh por día, de `desde` a `hasta` (REData).
// Devuelve Map(fecha -> { eolica, solar }) o null. REData no da la generación por horas.
export async function generacionDiaria(desde, hasta) {
  const json = await pedirJSON(`${REDATA_GENERACION}?start_date=${desde}T00:00&end_date=${hasta}T23:59&time_trunc=day`);
  const serie = (id) => (json?.included || []).find((s) => s.id === id)?.attributes?.values || [];
  const m = new Map();
  for (const [clave, id] of [['eolica', '10291'], ['solar', '1458']]) {
    for (const v of serie(id)) {
      const f = String(v.datetime).slice(0, 10);
      if (!m.has(f)) m.set(f, {});
      m.get(f)[clave] = v.value;
    }
  }
  return m.size ? m : null;
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

// ---------- Actividad del equipo (gráfica «El equipo en el tiempo») ----------

// Lee web/datos/actividad.json, que genera herramientas/actividad-equipo/actividad.py con la API
// pública de GitHub. Es un archivo fijo del repo: la web no llama a GitHub en directo.
// Misma ruta en local y en Pages, porque el archivo vive dentro de web/.
export async function cargarActividad() {
  const r = await fetch('datos/actividad.json');
  if (!r.ok) throw new Error(`actividad.json: HTTP ${r.status}`);
  return r.json();
}
