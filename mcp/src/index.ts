// Punto de entrada del Worker de Cloudflare.

import { creaObtenerDia, type AlmacenKV } from "./ree.ts";
import { atender } from "./servidor.ts";

export interface Env {
  /** Clave que tienen que mandar los clientes (secreto del Worker, nunca en el repositorio). */
  MCP_CLAVE?: string;
  /** Espacio de Workers KV para la caché de precios (opcional). */
  PRECIOS?: AlmacenKV;
}

export default {
  async fetch(peticion: Request, env: Env): Promise<Response> {
    const obtener = creaObtenerDia({ kv: env.PRECIOS });
    return atender(peticion, { clave: env.MCP_CLAVE, obtener });
  },
};
