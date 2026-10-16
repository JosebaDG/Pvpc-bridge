// Fechas y horas en hora peninsular (Europe/Madrid), sin dependencias.
//
// Todo instante se guarda como milisegundos UTC (number). Las fechas de calendario van como
// texto "AAAA-MM-DD" del día en Madrid. Así se evita el lío de los objetos Date con zona.

export const ZONA = "Europe/Madrid";

const FORMATO = new Intl.DateTimeFormat("en-GB", {
  timeZone: ZONA,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  weekday: "short",
  hourCycle: "h23",
});

export interface Partes {
  anio: number;
  mes: number;
  dia: number;
  hora: number;
  minuto: number;
  segundo: number;
  /** 0 lunes ... 6 domingo, como weekday() de Python */
  diaSemana: number;
}

const DIAS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Fecha y hora de un instante en Madrid. */
export function partesMadrid(ms: number): Partes {
  const p: Record<string, string> = {};
  for (const x of FORMATO.formatToParts(new Date(ms))) p[x.type] = x.value;
  return {
    anio: Number(p.year),
    mes: Number(p.month),
    dia: Number(p.day),
    hora: Number(p.hour),
    minuto: Number(p.minute),
    segundo: Number(p.second),
    diaSemana: DIAS.indexOf(p.weekday),
  };
}

/** Diferencia de Madrid con UTC en minutos en ese instante (+60 en invierno, +120 en verano). */
export function desfaseMin(ms: number): number {
  const p = partesMadrid(ms);
  const comoUtc = Date.UTC(p.anio, p.mes - 1, p.dia, p.hora, p.minuto, p.segundo);
  return Math.round((comoUtc - Math.floor(ms / 1000) * 1000) / 60000);
}

/** Instante UTC de una hora local de Madrid. Pensado para horas que existen (las de medianoche siempre). */
export function madridAUtc(anio: number, mes: number, dia: number, hora = 0, minuto = 0): number {
  const local = Date.UTC(anio, mes - 1, dia, hora, minuto);
  let t = local - desfaseMin(local) * 60000;
  t = local - desfaseMin(t) * 60000;
  return t;
}

function dos(n: number): string {
  return String(n).padStart(2, "0");
}

/** "2026-10-15T08:00+02:00", igual que isoformat(timespec="minutes") en puente_luz.py. */
export function iso(ms: number): string {
  const p = partesMadrid(ms);
  const d = desfaseMin(ms);
  const signo = d >= 0 ? "+" : "-";
  const a = Math.abs(d);
  return `${p.anio}-${dos(p.mes)}-${dos(p.dia)}T${dos(p.hora)}:${dos(p.minuto)}${signo}${dos(Math.floor(a / 60))}:${dos(a % 60)}`;
}

/** "08:00" en hora de Madrid. */
export function hhmm(ms: number): string {
  const p = partesMadrid(ms);
  return `${dos(p.hora)}:${dos(p.minuto)}`;
}

/** Fecha "AAAA-MM-DD" de Madrid en ese instante. */
export function fechaMadrid(ms: number): string {
  const p = partesMadrid(ms);
  return `${p.anio}-${dos(p.mes)}-${dos(p.dia)}`;
}

const RE_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;

export function esFecha(texto: string): boolean {
  const m = RE_FECHA.exec(texto);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() + 1 === Number(m[2]) && d.getUTCDate() === Number(m[3]);
}

function trocear(fecha: string): [number, number, number] {
  const m = RE_FECHA.exec(fecha);
  if (!m || !esFecha(fecha)) throw new ErrorEntrada(`Fecha no válida: ${fecha} (usa AAAA-MM-DD, hoy o manana)`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

export function sumarDias(fecha: string, n: number): string {
  const [a, m, d] = trocear(fecha);
  const x = new Date(Date.UTC(a, m - 1, d + n));
  return `${x.getUTCFullYear()}-${dos(x.getUTCMonth() + 1)}-${dos(x.getUTCDate())}`;
}

/** Medianoche a medianoche en Madrid, en ms UTC (23 o 25 h los días de cambio de hora). */
export function limitesDia(fecha: string): [number, number] {
  const [a, m, d] = trocear(fecha);
  const [a2, m2, d2] = trocear(sumarDias(fecha, 1));
  return [madridAUtc(a, m, d), madridAUtc(a2, m2, d2)];
}

/** "hoy", "manana"/"mañana" o "AAAA-MM-DD" -> "AAAA-MM-DD". */
export function resolverDia(dia: string | undefined, ahora: number): string {
  const v = (dia ?? "hoy").trim().toLowerCase();
  const hoy = fechaMadrid(ahora);
  if (v === "hoy") return hoy;
  if (v === "manana" || v === "mañana") return sumarDias(hoy, 1);
  if (v === "ayer") return sumarDias(hoy, -1);
  trocear(v);
  return v;
}

/**
 * "ahora", "HH:MM" del día de referencia (24:00 es el final del día) o fecha y hora ISO.
 * Una fecha y hora sin desfase se entiende en hora de Madrid. undefined -> undefined.
 */
export function resolverMomento(valor: string | undefined, diaRef: string, ahora: number): number | undefined {
  if (valor === undefined || valor === null || String(valor).trim() === "") return undefined;
  const v = String(valor).trim().toLowerCase();
  if (v === "ahora") return ahora;
  const hm = /^(\d{1,2}):(\d{2})$/.exec(v);
  if (hm) {
    const h = Number(hm[1]);
    const mi = Number(hm[2]);
    if (h === 24 && mi === 0) return limitesDia(diaRef)[1];
    if (h > 23 || mi > 59) throw new ErrorEntrada(`Hora no válida: ${valor}`);
    const [a, m, d] = trocear(diaRef);
    return madridAUtc(a, m, d, h, mi);
  }
  const local = /^(\d{4})-(\d{2})-(\d{2})[t ](\d{2}):(\d{2})(?::\d{2})?$/.exec(v);
  if (local) {
    return madridAUtc(Number(local[1]), Number(local[2]), Number(local[3]), Number(local[4]), Number(local[5]));
  }
  const t = Date.parse(String(valor).trim());
  if (Number.isNaN(t)) throw new ErrorEntrada(`Momento no válido: ${valor} (usa ahora, HH:MM o fecha ISO)`);
  return t;
}

/** Error de los datos que manda quien pregunta (fecha mal escrita, horas que no caben...). */
export class ErrorEntrada extends Error {}
