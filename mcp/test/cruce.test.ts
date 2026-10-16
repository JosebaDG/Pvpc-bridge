// El servidor tiene que dar lo mismo que puente_luz.py con los mismos datos.
// Ejecuta test/cruce_python.py (sin red) y compara campo a campo.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { bloque, resumen, umbral } from "../src/precios.ts";
import { ms, obtenerGuardado } from "./ayuda.ts";

interface Caso {
  tipo: "resumen" | "bloque" | "umbral";
  ahora: string;
  args: Record<string, unknown>;
}

const CASOS: Caso[] = [
  { tipo: "resumen", ahora: "2026-10-15T09:00+02:00", args: { dia: "2026-10-15", n: 5 } },
  { tipo: "resumen", ahora: "2026-10-15T09:00+02:00", args: { dia: "2025-10-26", n: 3 } },
  { tipo: "resumen", ahora: "2026-10-15T09:00+02:00", args: { dia: "2026-03-29", n: 3 } },
  { tipo: "bloque", ahora: "2026-10-15T09:20+02:00", args: { horas: 2.5, potencia_w: 2000, dia: "hoy" } },
  { tipo: "bloque", ahora: "2026-10-15T09:20+02:00", args: { horas: 3, potencia_w: 1500, dia: "2025-10-26" } },
  { tipo: "bloque", ahora: "2026-10-15T09:20+02:00", args: { horas: 1.5, potencia_w: 800, dia: "2026-03-29", desde: "01:00", hasta: "06:00" } },
  { tipo: "bloque", ahora: "2026-10-15T18:45+02:00", args: { horas: 2, potencia_w: 3000 } },
  { tipo: "umbral", ahora: "2026-10-15T09:00+02:00", args: { max_precio_eur_kwh: 0.1, dia: "2025-10-26", min_horas: 1, potencia_w: 1000 } },
  { tipo: "umbral", ahora: "2026-10-15T09:00+02:00", args: { max_precio_eur_kwh: 0.15, dia: "2026-10-15" } },
  { tipo: "umbral", ahora: "2026-10-15T09:00+02:00", args: { max_precio_eur_kwh: 0.12, dia: "2026-03-29", min_horas: 2 } },
];

function python(): unknown[] | undefined {
  const guion = fileURLToPath(String(new URL("./cruce_python.py", import.meta.url)));
  try {
    return JSON.parse(execFileSync("python3", [guion, JSON.stringify(CASOS)], { encoding: "utf8" }));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw e;
  }
}

const esperado = python();

test("mismos resultados que puente_luz.py", { skip: esperado ? false : "no hay python3" }, async () => {
  for (const [i, caso] of CASOS.entries()) {
    const py = esperado![i] as Record<string, any>;
    const ahora = ms(caso.ahora);
    const a = caso.args as Record<string, any>;
    const etiqueta = `${caso.tipo} ${JSON.stringify(a)}`;
    if (caso.tipo === "resumen") {
      const ts = await resumen(obtenerGuardado, ahora, a.dia, a.n);
      assert.equal(ts.media_eur_kwh, py.media_eur_kwh, etiqueta);
      assert.equal(ts.media_con_impuestos_eur_kwh, py.media_con_impuestos_eur_kwh, etiqueta);
      assert.deepEqual(ts.media_por_periodo_eur_kwh, py.media_por_periodo_eur_kwh, etiqueta);
      assert.deepEqual(ts.mas_baratos, py.mas_baratos, etiqueta);
      assert.deepEqual(ts.mas_caros, py.mas_caros, etiqueta);
    } else if (caso.tipo === "bloque") {
      const ts = await bloque(obtenerGuardado, ahora, a.horas, a.potencia_w, { dia: a.dia, desde: a.desde, hasta: a.hasta });
      assert.equal(ts.inicio, py.inicio, etiqueta);
      assert.equal(ts.fin, py.fin, etiqueta);
      assert.deepEqual(ts.ventana, py.ventana, etiqueta);
      assert.equal(ts.coste_sin_impuestos_eur, py.coste_sin_impuestos_eur, etiqueta);
      assert.equal(ts.coste_con_impuestos_eur, py.coste_con_impuestos_eur, etiqueta);
      assert.equal(ts.precio_medio_eur_kwh, py.precio_medio_eur_kwh, etiqueta);
      assert.deepEqual(ts.energia_por_periodo_kwh, py.energia_por_periodo_kwh, etiqueta);
      assert.equal(ts.comparacion.empezando_al_inicio_de_la_ventana.inicio, py.comparacion.empezando_al_inicio_de_la_ventana.inicio, etiqueta);
      assert.equal(ts.comparacion.peor_bloque.inicio, py.comparacion.peor_bloque.inicio, etiqueta);
    } else {
      const ts = await umbral(obtenerGuardado, ahora, a.max_precio_eur_kwh, {
        dia: a.dia,
        minHoras: a.min_horas,
        potenciaW: a.potencia_w,
      });
      assert.equal(ts.franjas.length, py.franjas.length, etiqueta);
      for (const [j, f] of ts.franjas.entries()) {
        const g = py.franjas[j];
        assert.equal(f.inicio, g.inicio, etiqueta);
        assert.equal(f.fin, g.fin, etiqueta);
        assert.equal(f.horas, g.horas, etiqueta);
        assert.equal(f.precio_medio_eur_kwh, g.precio_medio_eur_kwh, etiqueta);
        assert.equal(f.precio_max_eur_kwh, g.precio_max_eur_kwh, etiqueta);
        if (a.potencia_w) assert.equal(f.coste_sin_impuestos_eur, g.coste_sin_impuestos_eur, etiqueta);
      }
    }
  }
});
