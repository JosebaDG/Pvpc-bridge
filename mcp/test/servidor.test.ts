import { test } from "node:test";
import assert from "node:assert/strict";
import { atender } from "../src/servidor.ts";
import { creaObtenerDia, vaciarMemoria, type AlmacenKV } from "../src/ree.ts";
import { NoPublicado } from "../src/precios.ts";
import { ErrorEntrada } from "../src/tiempo.ts";
import { fetchFalso, ms, obtenerGuardado } from "./ayuda.ts";

const CLAVE = "clave-de-prueba-123";
const AHORA = () => ms("2026-10-15T09:20+02:00");
const dep = { clave: CLAVE, obtener: obtenerGuardado, ahora: AHORA };

function mcp(cuerpo: unknown, clave: string | null = CLAVE): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json, text/event-stream" };
  if (clave !== null) headers.Authorization = `Bearer ${clave}`;
  return new Request("https://mcp.example/mcp", { method: "POST", headers, body: JSON.stringify(cuerpo) });
}

const INICIO = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "prueba", version: "1" } },
};

test("sin clave o con clave mala: 401; sin clave configurada: 503", async () => {
  assert.equal((await atender(mcp(INICIO, null), dep)).status, 401);
  assert.equal((await atender(mcp(INICIO, "otra"), dep)).status, 401);
  assert.equal((await atender(mcp(INICIO), { ...dep, clave: undefined })).status, 503);
  assert.equal((await atender(mcp(INICIO), { ...dep, clave: "" })).status, 503);
});

test("portada y salud no piden clave ni dan datos", async () => {
  const salud = await atender(new Request("https://mcp.example/salud"), dep);
  assert.equal(salud.status, 200);
  assert.equal(((await salud.json()) as any).clave_configurada, true);
  assert.equal((await atender(new Request("https://mcp.example/"), dep)).status, 200);
  assert.equal((await atender(new Request("https://mcp.example/otra"), dep)).status, 404);
  assert.equal((await atender(new Request("https://mcp.example/mcp", { headers: { Authorization: `Bearer ${CLAVE}` } }), dep)).status, 405);
});

test("MCP: initialize, lista de herramientas y una llamada", async () => {
  const ini = await atender(mcp(INICIO), dep);
  assert.equal(ini.status, 200);
  const cuerpoIni = (await ini.json()) as any;
  assert.equal(cuerpoIni.result.serverInfo.name, "pvpc-bridge");

  const lista = (await (await atender(mcp({ jsonrpc: "2.0", id: 2, method: "tools/list" }), dep)).json()) as any;
  assert.deepEqual(lista.result.tools.map((t: { name: string }) => t.name).sort(), ["bloque", "precios", "resumen", "umbral"]);

  const llamada: any = await (
    await atender(mcp({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "bloque", arguments: { horas: 2, potencia_w: 2000, dia: "2026-10-15", desde: "10:00" } } }), dep)
  ).json();
  const datos = JSON.parse(llamada.result.content[0].text);
  assert.equal(datos.ok, true);
  assert.equal(datos.inicio, "2026-10-15T14:00+02:00");
});

test("MCP: un día sin publicar vuelve como error de la herramienta, no como caída", async () => {
  const r: any = await (
    await atender(mcp({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "precios", arguments: { dia: "manana" } } }), dep)
  ).json();
  assert.equal(r.result.isError, true);
  assert.equal(JSON.parse(r.result.content[0].text).error, "no_publicado");
});

test("caché: cada día se pide a REE una sola vez, también entre instancias con KV", async () => {
  vaciarMemoria();
  const guardado = new Map<string, string>();
  const kv: AlmacenKV = {
    async get(k) {
      return guardado.get(k) ?? null;
    },
    async put(k, v) {
      guardado.set(k, v);
    },
  };
  const { f, llamadas } = fetchFalso();
  const obtener = creaObtenerDia({ kv, fetch: f, ahora: AHORA });
  await obtener("2026-10-15");
  await obtener("2026-10-15");
  assert.equal(llamadas.length, 1);
  vaciarMemoria(); // como si fuera otra instancia del Worker
  await obtener("2026-10-15");
  assert.equal(llamadas.length, 1);
  // Mañana antes de las 20:00 no se pregunta: sería un 502 seguro.
  await assert.rejects(obtener("2026-10-16"), NoPublicado);
  assert.equal(llamadas.length, 1);
  // Una fecha que REE nunca tendrá es un error de entrada y tampoco se pide.
  await assert.rejects(obtener("1990-01-01"), ErrorEntrada);
  await assert.rejects(obtener("2026-10-17"), ErrorEntrada);
  assert.equal(llamadas.length, 1);
  // Desde las 20:00 sí se pregunta, y un día sin publicar se recuerda un rato sin volver a preguntar.
  const tarde = creaObtenerDia({ kv, fetch: f, ahora: () => ms("2026-10-15T20:05+02:00") });
  await assert.rejects(tarde("2026-10-16"), NoPublicado);
  await assert.rejects(tarde("2026-10-16"), NoPublicado);
  assert.equal(llamadas.length, 2);
  assert.equal(guardado.size, 1);
});
