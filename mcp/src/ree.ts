// Descarga del PVPC desde REData con caché, para no pedir a REE más de lo necesario.
//
// Un día publicado y completo no cambia nunca, así que se guarda:
//   1. en memoria del Worker (dura lo que viva esa instancia), y
//   2. en Workers KV si hay un espacio enlazado como PRECIOS (lo comparten todas las instancias).
// Con KV, cada día se pide a REE una sola vez. Un "aún no publicado" solo se recuerda 10 minutos
// y solo en memoria, para no gastar escrituras de KV.

import { ErrorFuente, NoPublicado, parsearREE, type Tramo } from "./precios.ts";
import { comprobarRango, fechaMadrid, partesMadrid, sumarDias } from "./tiempo.ts";

export const URL_REE = "https://apidatos.ree.es/es/datos/mercados/precios-mercados-tiempo-real";
const ESPERA_MS = 15_000;
const NO_PUBLICADO_MS = 10 * 60_000;
/** REE publica el PVPC de mañana hacia las 20:15, hora peninsular: antes de las 20:00 ni se pregunta. */
const HORA_PUBLICACION = 20;
const MENSAJE_NO_PUBLICADO = (fecha: string) =>
  `REE aún no tiene precios del ${fecha} (salen hacia las 20:15, hora peninsular, del día anterior).`;
const VERSION_CACHE = "v1";

/** Lo que se usa de un espacio de Workers KV (así las pruebas pueden pasar uno falso). */
export interface AlmacenKV {
  get(clave: string): Promise<string | null>;
  put(clave: string, valor: string, opciones?: { expirationTtl?: number }): Promise<void>;
}

type Guardado = { tramos: Tramo[] } | { noPublicado: string; hasta: number };

const memoria = new Map<string, Guardado>();

/** Solo para las pruebas. */
export function vaciarMemoria(): void {
  memoria.clear();
}

export interface OpcionesDescarga {
  kv?: AlmacenKV;
  fetch?: typeof fetch;
  ahora?: () => number;
  /** Se llama cada vez que de verdad se pide algo a REE (para contar en las pruebas). */
  alPedir?: (url: string) => void;
}

export function urlDia(fecha: string): string {
  return `${URL_REE}?start_date=${fecha}T00:00&end_date=${fecha}T23:59&time_trunc=hour`;
}

export function creaObtenerDia(op: OpcionesDescarga = {}) {
  const pedir = op.fetch ?? fetch;
  const ahora = op.ahora ?? Date.now;
  return async function obtenerDia(fecha: string): Promise<Tramo[]> {
    const t = ahora();
    comprobarRango(fecha, t); // fecha válida y dentro de lo que REE puede tener, antes de nada
    if (fecha === sumarDias(fechaMadrid(t), 1) && partesMadrid(t).hora < HORA_PUBLICACION) {
      throw new NoPublicado(MENSAJE_NO_PUBLICADO(fecha)); // sería un 502 seguro: no se pide
    }
    const clave = `pvpc:${VERSION_CACHE}:${fecha}`;
    const enMemoria = memoria.get(clave);
    if (enMemoria) {
      if ("tramos" in enMemoria) return enMemoria.tramos;
      if (enMemoria.hasta > ahora()) throw new NoPublicado(enMemoria.noPublicado);
      memoria.delete(clave);
    }
    if (op.kv) {
      try {
        const texto = await op.kv.get(clave);
        if (texto) {
          const tramos = JSON.parse(texto) as Tramo[];
          memoria.set(clave, { tramos });
          return tramos;
        }
      } catch {
        // Si KV falla, se sigue con REE: mejor una petición de más que no responder.
      }
    }
    let tramos: Tramo[];
    try {
      tramos = await descargar(fecha, pedir, op.alPedir);
    } catch (e) {
      if (e instanceof NoPublicado) memoria.set(clave, { noPublicado: e.message, hasta: ahora() + NO_PUBLICADO_MS });
      throw e;
    }
    memoria.set(clave, { tramos });
    if (op.kv) {
      try {
        await op.kv.put(clave, JSON.stringify(tramos), { expirationTtl: 400 * 24 * 3600 });
      } catch {
        // La respuesta sirve igual; la próxima vez se volverá a intentar guardar.
      }
    }
    return tramos;
  };
}

async function descargar(fecha: string, pedir: typeof fetch, alPedir?: (url: string) => void): Promise<Tramo[]> {
  const url = urlDia(fecha);
  alPedir?.(url);
  const corte = new AbortController();
  const reloj = setTimeout(() => corte.abort(), ESPERA_MS);
  let res: Response;
  try {
    res = await pedir(url, {
      headers: { Accept: "application/json", "User-Agent": "pvpc-bridge-mcp/1.0 (+https://github.com/JosebaDG/Pvpc-bridge)" },
      signal: corte.signal,
    });
  } catch (e) {
    throw new ErrorFuente(`No se pudo conectar con REE: ${(e as Error).message ?? e}`);
  } finally {
    clearTimeout(reloj);
  }
  const texto = await res.text();
  if (!res.ok) {
    // REE responde 502 "Los datos solicitados no están disponibles" cuando el día aún no ha salido.
    let detalle = texto;
    try {
      detalle = JSON.stringify(JSON.parse(texto));
      detalle = JSON.parse(texto)?.errors?.[0]?.detail ?? detalle;
    } catch {
      // no era JSON
    }
    if (res.status === 502 && /no est(á|a)n disponibles/i.test(detalle)) {
      throw new NoPublicado(MENSAJE_NO_PUBLICADO(fecha));
    }
    throw new ErrorFuente(`HTTP ${res.status} de REE: ${detalle.slice(0, 200)}`);
  }
  let cuerpo: unknown;
  try {
    cuerpo = JSON.parse(texto);
  } catch {
    throw new ErrorFuente("REE devolvió algo que no es JSON");
  }
  return parsearREE(cuerpo as Parameters<typeof parsearREE>[0], fecha);
}
