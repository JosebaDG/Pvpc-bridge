// Utilidades de las pruebas: datos guardados de REE en vez de la red.

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { NoPublicado, parsearREE, type Tramo } from "../src/precios.ts";

const DIR = fileURLToPath(String(new URL("./fixtures/", import.meta.url)));

export function cuerpoGuardado(fecha: string): unknown | undefined {
  const ruta = `${DIR}ree_${fecha}.json`;
  return existsSync(ruta) ? JSON.parse(readFileSync(ruta, "utf8")) : undefined;
}

/** ObtenerDia que lee test/fixtures/ree_AAAA-MM-DD.json; si no existe, "no publicado". */
export async function obtenerGuardado(fecha: string): Promise<Tramo[]> {
  const cuerpo = cuerpoGuardado(fecha);
  if (!cuerpo) throw new NoPublicado(`sin datos de prueba para ${fecha}`);
  return parsearREE(cuerpo as Parameters<typeof parsearREE>[0], fecha);
}

/** Un fetch falso que responde como REE con los datos guardados y cuenta las llamadas. */
export function fetchFalso() {
  const llamadas: string[] = [];
  const f = (async (entrada: RequestInfo | URL) => {
    const url = String(entrada);
    llamadas.push(url);
    const fecha = /start_date=(\d{4}-\d{2}-\d{2})/.exec(url)?.[1] ?? "";
    const cuerpo = cuerpoGuardado(fecha);
    if (!cuerpo) {
      const error = {
        errors: [{ code: 502, status: "502", title: "Error en la consulta", detail: "Los datos solicitados no están disponibles" }],
      };
      return new Response(JSON.stringify(error), { status: 502, headers: { "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify(cuerpo), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  return { f, llamadas };
}

export const ms = (texto: string) => Date.parse(texto);
