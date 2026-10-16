import { test } from "node:test";
import assert from "node:assert/strict";
import { iso, limitesDia, resolverDia, resolverMomento, sumarDias, ErrorEntrada } from "../src/tiempo.ts";
import { periodo } from "../src/precios.ts";
import { ms } from "./ayuda.ts";

test("los días de cambio de hora duran 23 y 25 horas", () => {
  const largo = (f: string) => {
    const [a, b] = limitesDia(f);
    return (b - a) / 3_600_000;
  };
  assert.equal(largo("2026-10-15"), 24);
  assert.equal(largo("2026-03-29"), 23);
  assert.equal(largo("2025-10-26"), 25);
  assert.equal(largo("2026-10-25"), 25);
  assert.equal(iso(limitesDia("2026-10-15")[0]), "2026-10-15T00:00+02:00");
  assert.equal(iso(limitesDia("2026-12-01")[0]), "2026-12-01T00:00+01:00");
});

test("hoy y mañana se cuentan en hora de Madrid, no en UTC", () => {
  // 23:30 del 15 en UTC ya es día 16 en Madrid.
  const ahora = ms("2026-10-15T23:30:00Z");
  assert.equal(resolverDia("hoy", ahora), "2026-10-16");
  assert.equal(resolverDia("manana", ahora), "2026-10-17");
  assert.equal(resolverDia("mañana", ahora), "2026-10-17");
  assert.equal(resolverDia("2026-02-28", ahora), "2026-02-28");
  assert.equal(sumarDias("2026-12-31", 1), "2027-01-01");
  assert.throws(() => resolverDia("2026-02-30", ahora), ErrorEntrada);
  assert.throws(() => resolverDia("pasado", ahora), ErrorEntrada);
  // Fuera de lo que tiene REData: antes del 2021-06-01 o después de mañana.
  assert.equal(resolverDia("2021-06-01", ahora), "2021-06-01");
  assert.throws(() => resolverDia("2021-05-31", ahora), ErrorEntrada);
  assert.throws(() => resolverDia("1990-01-01", ahora), ErrorEntrada);
  assert.equal(resolverDia("2026-10-17", ahora), "2026-10-17");
  assert.throws(() => resolverDia("2026-10-18", ahora), ErrorEntrada);
  assert.throws(() => resolverDia("2030-01-01", ahora), ErrorEntrada);
});

test("momentos: ahora, HH:MM, 24:00 e ISO con y sin desfase", () => {
  const ahora = ms("2026-10-15T07:00:00Z");
  assert.equal(resolverMomento("ahora", "2026-10-15", ahora), ahora);
  assert.equal(iso(resolverMomento("14:30", "2026-10-15", ahora)!), "2026-10-15T14:30+02:00");
  assert.equal(iso(resolverMomento("24:00", "2026-10-15", ahora)!), "2026-10-16T00:00+02:00");
  assert.equal(iso(resolverMomento("2026-12-01T08:00", "2026-10-15", ahora)!), "2026-12-01T08:00+01:00");
  assert.equal(resolverMomento("2026-10-15T10:00+00:00", "2026-10-15", ahora), ms("2026-10-15T10:00:00Z"));
  assert.equal(resolverMomento(undefined, "2026-10-15", ahora), undefined);
  assert.throws(() => resolverMomento("25:00", "2026-10-15", ahora), ErrorEntrada);
});

test("periodos 2.0TD: laborable, fin de semana y festivo nacional", () => {
  assert.equal(periodo(ms("2026-10-15T10:00+02:00")), "P1"); // jueves
  assert.equal(periodo(ms("2026-10-15T08:00+02:00")), "P2");
  assert.equal(periodo(ms("2026-10-15T23:00+02:00")), "P2");
  assert.equal(periodo(ms("2026-10-15T03:00+02:00")), "P3");
  assert.equal(periodo(ms("2026-10-17T19:00+02:00")), "P3"); // sábado
  assert.equal(periodo(ms("2026-10-12T19:00+02:00")), "P3"); // lunes 12 de octubre, festivo
});
