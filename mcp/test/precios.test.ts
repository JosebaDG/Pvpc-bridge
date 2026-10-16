import { test } from "node:test";
import assert from "node:assert/strict";
import { bloque, FACTOR_IMPUESTOS, NoPublicado, parsearREE, precios, resumen, umbral } from "../src/precios.ts";
import { ErrorEntrada } from "../src/tiempo.ts";
import { cuerpoGuardado, ms, obtenerGuardado } from "./ayuda.ts";

const AHORA = ms("2026-10-15T09:20+02:00");

test("lee la serie PVPC de REE y comprueba que el día está completo", () => {
  const normal = parsearREE(cuerpoGuardado("2026-10-15") as never, "2026-10-15");
  assert.equal(normal.length, 24);
  assert.equal(parsearREE(cuerpoGuardado("2025-10-26") as never, "2025-10-26").length, 25);
  assert.equal(parsearREE(cuerpoGuardado("2026-03-29") as never, "2026-03-29").length, 23);
  // Un día al que le falta una hora no se da por bueno.
  const cojo = structuredClone(cuerpoGuardado("2026-10-15")) as { included: Array<{ id: string; attributes: { values: unknown[] } }> };
  cojo.included.find((s) => String(s.id) === "1001")!.attributes.values.pop();
  assert.throws(() => parsearREE(cojo as never, "2026-10-15"), NoPublicado);
});

test("precios: 24 horas con periodo y precio con impuestos", async () => {
  const r = await precios(obtenerGuardado, AHORA, "2026-10-15");
  assert.equal(r.tramos, 24);
  assert.equal(r.precios[0].inicio, "2026-10-15T00:00+02:00");
  const h14 = r.precios.find((p) => p.inicio === "2026-10-15T14:00+02:00")!;
  assert.equal(h14.eur_kwh, 0.06335);
  assert.equal(h14.periodo, "P2");
  assert.equal(h14.eur_kwh_con_impuestos, Math.round(0.06335 * FACTOR_IMPUESTOS * 1e5) / 1e5);
  assert.match(r.fuente.nombre, /Red Eléctrica/);
});

test("resumen con n fuera de rango da error de entrada", async () => {
  await assert.rejects(resumen(obtenerGuardado, AHORA, "2026-10-15", 0), ErrorEntrada);
});

test("bloque de hoy no propone horas que ya han pasado", async () => {
  const r = await bloque(obtenerGuardado, AHORA, 2, 2000, { dia: "hoy" });
  assert.ok(ms(r.inicio) >= AHORA);
  assert.ok(r.avisos.some((a) => a.includes("desde este momento")));
});

test("bloque sin día avisa si mañana aún no está publicado", async () => {
  const r = await bloque(obtenerGuardado, AHORA, 1, 1000);
  assert.ok(r.avisos.some((a) => a.includes("mañana aún no están publicados")));
});

test("bloque que no cabe en la ventana da error de entrada", async () => {
  await assert.rejects(bloque(obtenerGuardado, AHORA, 5, 1000, { dia: "2026-10-15", desde: "20:00", hasta: "22:00" }), ErrorEntrada);
});

test("umbral con impuestos deja menos horas que sin impuestos", async () => {
  const sin = await umbral(obtenerGuardado, AHORA, 0.09, { dia: "2026-10-15" });
  const con = await umbral(obtenerGuardado, AHORA, 0.09, { dia: "2026-10-15", conImpuestos: true });
  assert.equal(sin.horas_totales, 2);
  assert.equal(con.horas_totales, 1);
});
