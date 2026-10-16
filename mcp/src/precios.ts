// Cálculos del PVPC, traducidos de puente_luz.py (precios, resumen, bloque y umbral).
//
// Todo es puro: recibe los tramos de cada día con una función y el instante "ahora".
// Así se prueba sin red y con el reloj que se quiera. La descarga y la caché están en ree.ts.

import { ErrorEntrada, fechaMadrid, iso, limitesDia, partesMadrid, resolverDia, resolverMomento, sumarDias } from "./tiempo.ts";

export interface Tramo {
  inicio: number; // ms UTC
  fin: number; // ms UTC
  eurKwh: number; // sin impuestos, como lo publica REE
}

/** Los precios de ese día aún no están publicados (o llegan incompletos). */
export class NoPublicado extends Error {}

/** Fallo de red o respuesta inesperada de REE. */
export class ErrorFuente extends Error {}

export type ObtenerDia = (fecha: string) => Promise<Tramo[]>;

const EPS = 1e-9;
const HORA_MS = 3_600_000;

export const FUENTE = {
  nombre: "Red Eléctrica (REData)",
  url: "https://www.ree.es/es/datos/apidatos",
  nota: "Datos de Red Eléctrica (REData). Pvpc-bridge no está vinculado a Red Eléctrica.",
};

export const NOTA_PRECIO =
  "PVPC 2.0TD peninsular publicado por REE: energía + peajes y cargos de cada hora, " +
  "sin impuestos ni término de potencia (€/kWh).";

// Impuestos genéricos de 2026 (los mismos que contrato.ejemplo.json). El servidor no conoce
// ningún contrato privado: el precio con impuestos es orientativo.
export const IMPUESTO_ELECTRICO = 0.0511269632;
export const IVA = 0.21;
export const FACTOR_IMPUESTOS = (1 + IMPUESTO_ELECTRICO) * (1 + IVA);

export const NOTA_IMPUESTOS =
  `Con impuestos = precio sin impuestos × ${FACTOR_IMPUESTOS.toFixed(4)} (impuesto eléctrico 5,11 % e IVA 21 %, ` +
  "valores genéricos de 2026). No incluye término de potencia, bono social ni alquiler del contador.";

// Tramos 2.0TD de lunes a viernes laborables en la península (Circular CNMC 3/2020, art. 7).
// Sábados, domingos y festivos nacionales de fecha fija: todo P3.
const P1: Array<[number, number]> = [[10, 14], [18, 22]];
const P2: Array<[number, number]> = [[8, 10], [14, 18], [22, 24]];
export const FESTIVOS_VALLE = ["01-01", "01-06", "05-01", "08-15", "10-12", "11-01", "12-06", "12-08", "12-25"];

export type Periodo = "P1" | "P2" | "P3";

export function periodo(ms: number): Periodo {
  const p = partesMadrid(ms);
  const mmdd = `${String(p.mes).padStart(2, "0")}-${String(p.dia).padStart(2, "0")}`;
  if (p.diaSemana >= 5 || FESTIVOS_VALLE.includes(mmdd)) return "P3";
  const h = p.hora + p.minuto / 60;
  if (P1.some(([a, b]) => a <= h && h < b)) return "P1";
  if (P2.some(([a, b]) => a <= h && h < b)) return "P2";
  return "P3";
}

function r(x: number, dec: number): number {
  const f = 10 ** dec;
  return Math.round(x * f) / f;
}

function horas(t: Tramo): number {
  return (t.fin - t.inicio) / HORA_MS;
}

export function tramoSalida(t: Tramo) {
  return {
    inicio: iso(t.inicio),
    fin: iso(t.fin),
    eur_kwh: r(t.eurKwh, 5),
    periodo: periodo(t.inicio),
    eur_kwh_con_impuestos: r(t.eurKwh * FACTOR_IMPUESTOS, 5),
  };
}

// ------------------------------------------------------------------ REE

interface RespuestaREE {
  included?: Array<{ id?: string | number; attributes?: { values?: Array<{ value: number; datetime: string }> } }>;
  errors?: unknown;
}

/** Serie PVPC (id 1001) de la respuesta de REData, comprobando que el día está completo. */
export function parsearREE(cuerpo: RespuestaREE, fecha: string): Tramo[] {
  if (cuerpo.errors) throw new ErrorFuente(JSON.stringify(cuerpo.errors).slice(0, 300));
  const serie = (cuerpo.included ?? []).find((s) => String(s.id) === "1001");
  if (!serie) throw new NoPublicado(`La respuesta de REE no trae el PVPC del ${fecha}`);
  const [ini, fin] = limitesDia(fecha);
  const puntos = (serie.attributes?.values ?? [])
    .map((v) => [Date.parse(v.datetime), Number(v.value)] as [number, number])
    .filter(([t, p]) => Number.isFinite(t) && Number.isFinite(p) && ini <= t && t < fin)
    .sort((a, b) => a[0] - b[0]);
  if (puntos.length < 2) throw new NoPublicado(`PVPC del ${fecha} vacío o incompleto`);
  let paso = Infinity;
  for (let i = 1; i < puntos.length; i++) paso = Math.min(paso, puntos[i][0] - puntos[i - 1][0]);
  const esperados = Math.round((fin - ini) / paso);
  if (puntos.length !== esperados || puntos[0][0] !== ini) {
    throw new NoPublicado(`PVPC del ${fecha} incompleto: ${puntos.length} de ${esperados} tramos`);
  }
  return puntos.map(([t, p]) => ({ inicio: t, fin: t + paso, eurKwh: p / 1000 }));
}

// ------------------------------------------------------------- herramientas

export async function precios(obtener: ObtenerDia, ahora: number, dia?: string) {
  const fecha = resolverDia(dia, ahora);
  const tramos = await obtener(fecha);
  const h = tramos.reduce((s, t) => s + horas(t), 0);
  const media = tramos.reduce((s, t) => s + t.eurKwh * horas(t), 0) / h;
  return {
    ok: true,
    tipo: "precios",
    dia: fecha,
    tramos: tramos.length,
    media_eur_kwh: r(media, 5),
    media_con_impuestos_eur_kwh: r(media * FACTOR_IMPUESTOS, 5),
    precios: tramos.map(tramoSalida),
    nota_precio: NOTA_PRECIO,
    nota_impuestos: NOTA_IMPUESTOS,
    fuente: FUENTE,
    consultado: iso(ahora),
  };
}

export async function resumen(obtener: ObtenerDia, ahora: number, dia?: string, n = 5) {
  if (!Number.isInteger(n) || n < 1 || n > 25) throw new ErrorEntrada("n debe ser un entero entre 1 y 25");
  const fecha = resolverDia(dia, ahora);
  const tramos = await obtener(fecha);
  const orden = [...tramos].sort((a, b) => a.eurKwh - b.eurKwh);
  const h = tramos.reduce((s, t) => s + horas(t), 0);
  const media = tramos.reduce((s, t) => s + t.eurKwh * horas(t), 0) / h;
  const por: Record<string, number[]> = {};
  for (const t of tramos) (por[periodo(t.inicio)] ??= []).push(t.eurKwh);
  const mediaPorPeriodo: Record<string, number> = {};
  for (const p of Object.keys(por).sort()) mediaPorPeriodo[p] = r(por[p].reduce((s, x) => s + x, 0) / por[p].length, 5);
  return {
    ok: true,
    tipo: "resumen",
    dia: fecha,
    tramos: tramos.length,
    media_eur_kwh: r(media, 5),
    media_con_impuestos_eur_kwh: r(media * FACTOR_IMPUESTOS, 5),
    media_por_periodo_eur_kwh: mediaPorPeriodo,
    mas_baratos: orden.slice(0, n).map(tramoSalida),
    mas_caros: [...orden].reverse().slice(0, n).map(tramoSalida),
    nota_precio: NOTA_PRECIO,
    nota_impuestos: NOTA_IMPUESTOS,
    fuente: FUENTE,
    consultado: iso(ahora),
  };
}

export interface Ventana {
  dia?: string;
  desde?: string;
  hasta?: string;
}

/** Tramos recortados a [desde, hasta]. Sin día: desde ahora, hoy y mañana si ya está publicado. */
export async function ventana(obtener: ObtenerDia, ahora: number, v: Ventana) {
  const avisos: string[] = [];
  let tramos: Tramo[];
  let des: number;
  let has: number;
  const hoy = fechaMadrid(ahora);
  if (v.dia !== undefined && v.dia !== "") {
    const fecha = resolverDia(v.dia, ahora);
    tramos = await obtener(fecha);
    const [ini, fin] = limitesDia(fecha);
    des = resolverMomento(v.desde, fecha, ahora) ?? ini;
    has = resolverMomento(v.hasta, fecha, ahora) ?? fin;
    if (des < ahora && fecha === hoy && (v.desde === undefined || v.desde === "")) {
      des = ahora; // hoy sin desde: no proponer horas ya pasadas
      avisos.push("Ventana de hoy desde este momento (las horas pasadas no cuentan).");
    }
  } else {
    tramos = await obtener(hoy);
    try {
      tramos = tramos.concat(await obtener(sumarDias(hoy, 1)));
    } catch (e) {
      if (!(e instanceof NoPublicado)) throw e;
      avisos.push("Los precios de mañana aún no están publicados; solo se mira hoy.");
    }
    des = resolverMomento(v.desde, hoy, ahora) ?? ahora;
    has = resolverMomento(v.hasta, hoy, ahora) ?? tramos[tramos.length - 1].fin;
  }
  const ultimo = tramos[tramos.length - 1].fin;
  if (has > ultimo) {
    avisos.push(`No hay precios después de ${iso(ultimo)}; la ventana se corta ahí.`);
    has = ultimo;
  }
  const recortados: Tramo[] = [];
  for (const t of tramos) {
    const a = Math.max(t.inicio, des);
    const b = Math.min(t.fin, has);
    if (b - a > 0) recortados.push({ inicio: a, fin: b, eurKwh: t.eurKwh });
  }
  if (recortados.length === 0) throw new ErrorEntrada("La ventana pedida no tiene ningún tramo con precio publicado.");
  return { tramos: recortados, des, has, avisos };
}

function coste(tramos: Tramo[], ini: number, fin: number, kw: number): number {
  let total = 0;
  for (const t of tramos) {
    const a = Math.max(t.inicio, ini);
    const b = Math.min(t.fin, fin);
    if (b > a) total += t.eurKwh * kw * ((b - a) / HORA_MS);
  }
  return total;
}

function continuo(tramos: Tramo[], ini: number, fin: number): boolean {
  let cubierto = ini;
  for (const t of tramos) {
    if (t.fin <= cubierto) continue;
    if (t.inicio > cubierto) return false;
    cubierto = t.fin;
    if (cubierto >= fin) return true;
  }
  return cubierto >= fin;
}

function repartoPeriodos(tramos: Tramo[], ini: number, fin: number, kw: number) {
  const rp: Record<Periodo, number> = { P1: 0, P2: 0, P3: 0 };
  for (const t of tramos) {
    const a = Math.max(t.inicio, ini);
    const b = Math.min(t.fin, fin);
    if (b > a) rp[periodo(a)] += (kw * (b - a)) / HORA_MS;
  }
  return { P1: r(rp.P1, 3), P2: r(rp.P2, 3), P3: r(rp.P3, 3) };
}

function base(des: number, has: number, avisos: string[], ahora: number) {
  return {
    ok: true,
    ventana: { desde: iso(des), hasta: iso(has) },
    avisos,
    nota_precio: NOTA_PRECIO,
    nota_impuestos: NOTA_IMPUESTOS,
    fuente: FUENTE,
    consultado: iso(ahora),
  };
}

/** Bloque seguido más barato de `horas` con un aparato de `potenciaW` vatios. */
export async function bloque(obtener: ObtenerDia, ahora: number, horasPedidas: number, potenciaW: number, v: Ventana = {}) {
  if (!(horasPedidas > 0) || horasPedidas > 48) throw new ErrorEntrada("horas debe estar entre 0 y 48");
  if (!(potenciaW > 0) || potenciaW > 100_000) throw new ErrorEntrada("potencia_w debe estar entre 0 y 100000 vatios");
  const { tramos, des, has, avisos } = await ventana(obtener, ahora, v);
  const kw = potenciaW / 1000;
  const dur = horasPedidas * HORA_MS;
  const candidatos = [...new Set([tramos[0].inicio, ...tramos.map((t) => t.inicio)])].sort((a, b) => a - b);
  const opciones: Array<[number, number, number]> = [];
  for (const ini of candidatos) {
    const fin = ini + dur;
    if (fin > has + 1000 || !continuo(tramos, ini, fin)) continue;
    opciones.push([coste(tramos, ini, fin, kw), ini, fin]);
  }
  if (opciones.length === 0) throw new ErrorEntrada(`No caben ${horasPedidas} h seguidas en la ventana ${iso(des)} - ${iso(has)}.`);
  // Como min() de tuplas en Python: el más barato y, si empatan, el que empieza antes.
  const porCoste = (a: [number, number, number], b: [number, number, number]) => a[0] - b[0] || a[1] - b[1];
  const [c, ini, fin] = [...opciones].sort(porCoste)[0];
  const peor = [...opciones].sort((a, b) => b[0] - a[0] || b[1] - a[1])[0];
  const ya = opciones[0];
  const kwh = kw * horasPedidas;
  return {
    ...base(des, has, avisos, ahora),
    tipo: "bloque",
    horas: horasPedidas,
    potencia_w: potenciaW,
    energia_kwh: r(kwh, 3),
    inicio: iso(ini),
    fin: iso(fin),
    precio_medio_eur_kwh: r(c / kwh, 5),
    coste_sin_impuestos_eur: r(c, 4),
    coste_con_impuestos_eur: r(c * FACTOR_IMPUESTOS, 4),
    energia_por_periodo_kwh: repartoPeriodos(tramos, ini, fin, kw),
    comparacion: {
      empezando_al_inicio_de_la_ventana: { inicio: iso(ya[1]), coste_con_impuestos_eur: r(ya[0] * FACTOR_IMPUESTOS, 4) },
      peor_bloque: { inicio: iso(peor[1]), coste_con_impuestos_eur: r(peor[0] * FACTOR_IMPUESTOS, 4) },
      ahorro_frente_al_inicio_con_impuestos_eur: r((ya[0] - c) * FACTOR_IMPUESTOS, 4),
    },
  };
}

export interface OpcionesUmbral extends Ventana {
  minHoras?: number;
  potenciaW?: number;
  /** true: el umbral se compara con el precio con impuestos; false (defecto): con el publicado por REE. */
  conImpuestos?: boolean;
}

/** Franjas seguidas con precio <= maxPrecio (€/kWh). */
export async function umbral(obtener: ObtenerDia, ahora: number, maxPrecio: number, o: OpcionesUmbral = {}) {
  if (!Number.isFinite(maxPrecio) || maxPrecio < -1 || maxPrecio > 10) {
    throw new ErrorEntrada("max_precio_eur_kwh debe ser un número en €/kWh, por ejemplo 0.10");
  }
  const minHoras = o.minHoras ?? 0;
  if (!(minHoras >= 0) || minHoras > 48) throw new ErrorEntrada("min_horas debe estar entre 0 y 48");
  if (o.potenciaW !== undefined && (!(o.potenciaW > 0) || o.potenciaW > 100_000)) {
    throw new ErrorEntrada("potencia_w debe estar entre 0 y 100000 vatios");
  }
  const f = o.conImpuestos ? FACTOR_IMPUESTOS : 1;
  const { tramos, des, has, avisos } = await ventana(obtener, ahora, o);
  const entra = (t: Tramo) => t.eurKwh * f <= maxPrecio + EPS;
  const franjas: Array<Record<string, unknown>> = [];
  let actual: Tramo[] = [];
  const cerrar = () => {
    if (actual.length === 0) return;
    const h = actual.reduce((s, x) => s + horas(x), 0);
    if (h + EPS >= minHoras) {
      const media = actual.reduce((s, x) => s + x.eurKwh * horas(x), 0) / h;
      const fr: Record<string, unknown> = {
        inicio: iso(actual[0].inicio),
        fin: iso(actual[actual.length - 1].fin),
        horas: r(h, 3),
        precio_medio_eur_kwh: r(media * f, 5),
        precio_max_eur_kwh: r(Math.max(...actual.map((x) => x.eurKwh)) * f, 5),
        precio_medio_con_impuestos_eur_kwh: r(media * FACTOR_IMPUESTOS, 5),
        periodos: [...new Set(actual.map((x) => periodo(x.inicio)))].sort(),
      };
      if (o.potenciaW) {
        const kwh = (o.potenciaW / 1000) * h;
        fr.coste_sin_impuestos_eur = r(media * kwh, 4);
        fr.coste_con_impuestos_eur = r(media * FACTOR_IMPUESTOS * kwh, 4);
      }
      franjas.push(fr);
    }
  };
  for (const t of tramos) {
    if (entra(t) && (actual.length === 0 || actual[actual.length - 1].fin === t.inicio)) {
      actual.push(t);
      continue;
    }
    cerrar();
    actual = entra(t) ? [t] : [];
  }
  cerrar();
  return {
    ...base(des, has, avisos, ahora),
    tipo: "umbral",
    max_precio_eur_kwh: maxPrecio,
    umbral_comparado_con: o.conImpuestos
      ? "precio con impuestos genéricos"
      : "precio publicado sin impuestos (el de la gráfica de REE)",
    franjas,
    horas_totales: r(franjas.reduce((s, x) => s + (x.horas as number), 0), 3),
    ...(o.potenciaW ? { potencia_w: o.potenciaW } : {}),
  };
}
