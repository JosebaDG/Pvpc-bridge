// Servidor MCP de Pvpc-bridge: las cuatro herramientas y la puerta con clave.
//
// Va sin sesiones (modo "stateless" de Streamable HTTP): cada petición POST a /mcp crea un
// servidor nuevo, responde y se olvida. Así no hace falta Durable Objects ni guardar estado.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { bloque, ErrorFuente, FUENTE, NoPublicado, precios, resumen, umbral, type ObtenerDia } from "./precios.ts";
import { ErrorEntrada } from "./tiempo.ts";

export const VERSION = "0.1.0";

const dia = z
  .string()
  .optional()
  .describe("Día: hoy, manana o AAAA-MM-DD (hora peninsular). Los precios de mañana salen hacia las 20:15.");
const desde = z.string().optional().describe("Inicio de la ventana: ahora, HH:MM del día o fecha y hora ISO.");
const hasta = z.string().optional().describe("Final de la ventana: HH:MM del día (24:00 es medianoche) o fecha y hora ISO.");

function respuesta(datos: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(datos, null, 2) }] };
}

function fallo(e: unknown) {
  let error = "interno";
  if (e instanceof NoPublicado) error = "no_publicado";
  else if (e instanceof ErrorEntrada) error = "entrada";
  else if (e instanceof ErrorFuente) error = "fuente";
  const mensaje = e instanceof Error ? e.message : String(e);
  return { isError: true, content: [{ type: "text" as const, text: JSON.stringify({ ok: false, error, mensaje, fuente: FUENTE }, null, 2) }] };
}

async function proteger(fn: () => Promise<unknown>) {
  try {
    return respuesta(await fn());
  } catch (e) {
    return fallo(e);
  }
}

export function crearServidorMcp(obtener: ObtenerDia, ahora: () => number): McpServer {
  const s = new McpServer(
    { name: "pvpc-bridge", version: VERSION },
    {
      instructions:
        "Precio de la luz PVPC 2.0TD de la península, hora a hora, con datos de Red Eléctrica (REData). " +
        "Los precios van en €/kWh sin impuestos, como los publica REE; cada respuesta trae también el precio con impuestos genéricos. " +
        "Las horas van en hora peninsular. Cita a Red Eléctrica como fuente cuando uses estos datos.",
    },
  );
  const soloLectura = { readOnlyHint: true, openWorldHint: true };

  s.registerTool(
    "precios",
    {
      title: "Precios del día",
      description: "Precio PVPC de cada hora de un día, con su periodo P1/P2/P3 y el precio con impuestos genéricos.",
      inputSchema: { dia },
      annotations: soloLectura,
    },
    async (a) => proteger(() => precios(obtener, ahora(), a.dia)),
  );

  s.registerTool(
    "resumen",
    {
      title: "Resumen del día",
      description: "Horas más baratas y más caras de un día, media del día y media por periodo.",
      inputSchema: { dia, n: z.number().int().min(1).max(25).optional().describe("Cuántas horas baratas y caras devolver (5 por defecto).") },
      annotations: soloLectura,
    },
    async (a) => proteger(() => resumen(obtener, ahora(), a.dia, a.n ?? 5)),
  );

  s.registerTool(
    "bloque",
    {
      title: "Mejor bloque seguido",
      description:
        "Mejor bloque seguido de N horas para un consumo (lavadora, termo, coche...), con su coste. " +
        "Sin día: desde ahora, hoy y mañana si ya está publicado.",
      inputSchema: {
        horas: z.number().positive().max(48).describe("Horas seguidas que necesita el consumo, por ejemplo 2 o 1.5."),
        potencia_w: z.number().positive().max(100_000).describe("Consumo total del aparato en vatios, por ejemplo 2000."),
        dia,
        desde,
        hasta,
      },
      annotations: soloLectura,
    },
    async (a) => proteger(() => bloque(obtener, ahora(), a.horas, a.potencia_w, { dia: a.dia, desde: a.desde, hasta: a.hasta })),
  );

  s.registerTool(
    "umbral",
    {
      title: "Franjas por debajo de un precio",
      description:
        "Franjas seguidas con el precio por debajo de un máximo en €/kWh. Por defecto se compara con el precio " +
        "publicado por REE, sin impuestos (con_impuestos=true lo compara con el precio con impuestos).",
      inputSchema: {
        max_precio_eur_kwh: z.number().describe("Precio máximo en €/kWh, por ejemplo 0.10."),
        dia,
        desde,
        hasta,
        min_horas: z.number().min(0).max(48).optional().describe("Solo franjas de al menos estas horas."),
        potencia_w: z.number().positive().max(100_000).optional().describe("Si se da, calcula el coste de cada franja."),
        con_impuestos: z.boolean().optional().describe("Comparar el máximo con el precio con impuestos genéricos."),
      },
      annotations: soloLectura,
    },
    async (a) =>
      proteger(() =>
        umbral(obtener, ahora(), a.max_precio_eur_kwh, {
          dia: a.dia,
          desde: a.desde,
          hasta: a.hasta,
          minHoras: a.min_horas,
          potenciaW: a.potencia_w,
          conImpuestos: a.con_impuestos,
        }),
      ),
  );

  return s;
}

/** Compara la clave sin dar pistas por el tiempo que tarda (resumen SHA-256 de las dos). */
export async function claveCorrecta(recibida: string, buena: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(recibida)),
    crypto.subtle.digest("SHA-256", enc.encode(buena)),
  ]);
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  let dif = 0;
  for (let i = 0; i < x.length; i++) dif |= x[i] ^ y[i];
  return dif === 0;
}

function json(datos: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(datos, null, 2), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...extra },
  });
}

export interface Dependencias {
  clave: string | undefined;
  obtener: ObtenerDia;
  ahora?: () => number;
}

const PORTADA =
  "Pvpc-bridge MCP: precio de la luz PVPC hora a hora, con datos de Red Eléctrica (REData).\n" +
  "Servidor MCP (Streamable HTTP) en /mcp, con la cabecera Authorization: Bearer <clave>.\n" +
  "Herramientas: precios, resumen, bloque y umbral.\n" +
  "Código y documentación: https://github.com/JosebaDG/Pvpc-bridge/tree/main/mcp\n";

export async function atender(peticion: Request, dep: Dependencias): Promise<Response> {
  const url = new URL(peticion.url);
  if (url.pathname === "/" && peticion.method === "GET") {
    return new Response(PORTADA, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  if (url.pathname === "/salud" && peticion.method === "GET") {
    return json({ ok: true, servicio: "pvpc-bridge-mcp", version: VERSION, clave_configurada: Boolean(dep.clave) });
  }
  if (url.pathname !== "/mcp") return json({ ok: false, error: "no_existe" }, 404);

  // Sin clave configurada, el servidor no abre: mejor cerrado que público por descuido.
  if (!dep.clave) return json({ ok: false, error: "sin_clave", mensaje: "Falta configurar la clave del servidor (MCP_CLAVE)." }, 503);
  const cabecera = peticion.headers.get("Authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(cabecera.trim());
  if (!m || !(await claveCorrecta(m[1].trim(), dep.clave))) {
    return json({ ok: false, error: "no_autorizado", mensaje: "Falta la clave o no es correcta." }, 401, {
      "WWW-Authenticate": 'Bearer realm="pvpc-bridge"',
    });
  }

  if (peticion.method !== "POST") {
    // Sin sesiones no hay flujo de eventos que abrir con GET ni sesión que cerrar con DELETE.
    return json({ jsonrpc: "2.0", error: { code: -32000, message: "Método no permitido: usa POST" }, id: null }, 405, { Allow: "POST" });
  }

  const servidor = crearServidorMcp(dep.obtener, dep.ahora ?? Date.now);
  const transporte = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await servidor.connect(transporte);
  return transporte.handleRequest(peticion);
}
