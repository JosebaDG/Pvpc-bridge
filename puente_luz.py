#!/usr/bin/env python3
"""Puente entre Red Eléctrica (REE) y tus scripts: precios de la luz -> decisiones.

Otros scripts lo importan (``import puente_luz``) o lo llaman por línea de
comandos y leen JSON por la salida estándar. Él se encarga de hablar con REE,
guardar caché, manejar el cambio de hora y avisar si los precios de mañana
todavía no están publicados.

Fuente: API pública REData de Red Eléctrica, sin token
  https://apidatos.ree.es/es/datos/mercados/precios-mercados-tiempo-real
  - serie "pvpc" (id 1001): término de facturación de energía activa del PVPC
    2.0TD, sistema peninsular, en tramos horarios. Es lo que paga por cada kWh
    un consumidor con PVPC: energía + PEAJES Y CARGOS del tramo de esa hora
    (por eso salta al pasar de valle a llano y a punta). Va SIN impuestos
    (impuesto eléctrico, IVA) y SIN término de potencia.
  - serie "spot" (id 600): precio del mercado mayorista diario, tramos de
    15 minutos. Referencia, no es lo que pagas.
  Desglose oficial por componentes (subcomando desglose): archivo público 70
  de ESIOS, sin token: api.esios.ree.es/archives/70/download_json?date=AAAA-MM-DD

Contrato (contrato.json junto a este script, o --contrato RUTA, o la variable
PUENTE_LUZ_CONTRATO; si no hay, contrato.ejemplo.json): potencia, peajes,
cargos, impuestos, festivos y tipo de tarifa (pvpc, fijo o periodos). Lo
explica README.md.

Impuestos: los costes (bloque, repartir, umbral) salen POR DEFECTO EN EUROS
DE FACTURA: precio × (1 + impuesto eléctrico) × (1 + IVA) del contrato
(≈ 1,2719 con los tipos de 2026). --sin-impuestos da el precio limpio, y
--impuestos FACTOR fuerza un factor a mano (compatibilidad). Cada JSON trae
"importes" con lo que incluye y lo que no cada cifra. Los precios por hora
(precios, resumen, grafica) siguen siendo los publicados por REE, sin
impuestos, para poder compararlos con su web; precios y resumen añaden el
periodo (P1/P2/P3) y el precio con impuestos de cada hora.

Cobertura: península. Canarias, Baleares, Ceuta y Melilla no salen en REData;
irían por ESIOS (api.esios.ree.es) con token personal.

Publicación: los precios de mañana aparecen hacia las 20:00-21:00 hora
peninsular (el PVPC del 9/10/2026 se actualizó el 8/10 a las 20:46). Antes,
la API responde 502 "no disponibles" y aquí se lanza NoPublicado.

LÍNEA DE COMANDOS (todo devuelve JSON; código de salida 0 ok, 2 no
publicado, 1 otro error):

  # Precios de hoy o de mañana
  python3 puente_luz.py precios --dia hoy
  python3 puente_luz.py precios --dia manana

  # Mejor bloque seguido de 6 h con el equipo a 750 W, desde ahora
  python3 puente_luz.py bloque --horas 6 --potencia 750

  # Repartir un trabajo largo de 16 h mañana en trozos de 2 a 4 h, con al
  # menos 1 h de pausa entre trozos (sin --pausa, dos trozos pueden quedar
  # pegados y el JSON lo marca con "pegado_al_anterior")
  python3 puente_luz.py repartir --horas 16 --dia manana --min 2 --max 4 --pausa 1 --potencia 750

  # Todas las franjas por debajo de 10 céntimos/kWh de hoy
  python3 puente_luz.py umbral --max-precio 0.10 --dia hoy

  # Gráfica PNG del día, lista para mandar a un chat (necesita matplotlib)
  python3 puente_luz.py grafica --dia hoy --salida pvpc_hoy.png

  # Contrato cargado, factor de impuestos, costes fijos y comprobación de la
  # factura de referencia
  python3 puente_luz.py contrato --comprobar-factura

  # Desglose oficial de cada hora (ESIOS): energía, peajes y cargos, ajuste
  # de futuros... y aviso si los peajes no cuadran con el contrato
  python3 puente_luz.py desglose --dia 2026-09-26

  Potencia: --potencia es el consumo TOTAL del aparato o del equipo en vatios.
  En un ordenador, si solo sabes lo que gasta la tarjeta gráfica, usa
  --gpu-w y --resto-w (resto = CPU, placa, discos, pérdidas de la fuente);
  el JSON avisa si el resto queda en 0.
  Ventana: --dia hoy|manana|AAAA-MM-DD y/o --desde/--hasta ("ahora", "HH:MM"
  del --dia, o fecha ISO). Sin ventana: desde ahora hasta el último precio
  publicado (hoy y, si ya está, mañana).
  Impuestos: por defecto, euros de factura con los tipos del contrato.
  --sin-impuestos para el precio limpio; --impuestos 1.27 fuerza un factor.
  En umbral, --max-precio se compara con el precio publicado por REE (el de
  su gráfica); --umbral-factura lo compara con el precio con impuestos.

DESDE PYTHON:

  import puente_luz as pl
  pl.bloque_consecutivo(horas=6, potencia_w=750)
  pl.repartir(horas=16, potencia_w=750, bloque_min_h=2, bloque_max_h=4,
              dia="manana")
  pl.franjas_bajo_umbral(0.10, dia="hoy")
  pl.precios("hoy")          # lista de dicts con inicio, fin, eur_kwh, periodo...
  pl.cargar_contrato()       # dict del contrato; pl.factor_impuestos(c)
  pl.bloque_consecutivo(6, 750, impuestos=1.0)   # precio limpio

Solo biblioteca estándar, salvo la gráfica (matplotlib). Python 3.9+.
"""
from __future__ import annotations

import argparse
import copy
import gzip
import json
import os
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

TZ = ZoneInfo("Europe/Madrid")
URL = "https://apidatos.ree.es/es/datos/mercados/precios-mercados-tiempo-real"
SERIES = {"pvpc": "1001", "spot": "600"}
CACHE_DIR = os.path.expanduser(os.environ.get("PUENTE_LUZ_CACHE", "~/.cache/puente_luz"))
NOTA_PRECIO = {
    "pvpc": "PVPC 2.0TD peninsular publicado por REE: energía + peajes y cargos de cada hora, "
            "sin impuestos ni término de potencia",
    "spot": "Mercado mayorista diario (referencia, no es el precio final)",
}
EPS = 1e-9
DIR = os.path.dirname(os.path.abspath(__file__))
URL_ESIOS_70 = "https://api.esios.ree.es/archives/70/download_json?locale=es&date={}"

# Tramos 2.0TD de lunes a viernes laborables (Circular CNMC 3/2020, art. 7).
# Sábados, domingos, 6 de enero y festivos nacionales de fecha fija: todo P3.
HORARIOS_2_0TD = {
    "peninsula": {"P1": [(10, 14), (18, 22)], "P2": [(8, 10), (14, 18), (22, 24)]},
    "ceuta_melilla": {"P1": [(11, 15), (19, 23)], "P2": [(8, 11), (15, 19), (23, 24)]},
}
HORARIOS_2_0TD["baleares"] = HORARIOS_2_0TD["canarias"] = HORARIOS_2_0TD["peninsula"]
ZONA_SISTEMA = {"canarias": ZoneInfo("Atlantic/Canary")}  # el resto, hora peninsular

# Valores por defecto si no hay contrato.json ni contrato.ejemplo.json
CONTRATO_DEFECTO = {
    "version": 1,
    "descripcion": "Por defecto: PVPC 2.0TD peninsular, impuestos de 2026",
    "tarifa": {"tipo": "pvpc", "peaje": "2.0TD", "sistema": "peninsula"},
    "energia": {"precio_fijo_eur_kwh": None,
                "precio_periodos_eur_kwh": {"P1": None, "P2": None, "P3": None},
                "incluye_peajes_cargos": True},
    "potencia": {"contratada_kw": {"P1": None, "P2": None}, "peajes_eur_kw_dia": {},
                 "cargos_eur_kw_dia": {}, "margen_comercializacion_eur_kw_dia": 0.0},
    "peajes_cargos_energia_eur_kwh": {"peajes": {}, "cargos": {}},
    "otros_fijos": {"bono_social_eur_dia": 0.0, "alquiler_contador_eur_dia": 0.0},
    "impuestos": {"impuesto_electrico": 0.0511269632, "impuesto_electrico_minimo_eur_mwh": 1.0,
                  "impuesto_electrico_base": ["potencia", "energia", "bono_social"], "iva": 0.21},
    "calendario": {"festivos_valle": ["01-01", "01-06", "05-01", "08-15", "10-12", "11-01",
                                     "12-06", "12-08", "12-25"], "festivos_valle_extra": []},
    "factura_referencia": None,
}


class NoPublicado(Exception):
    """Los precios del día pedido aún no están publicados (o están incompletos)."""


class ErrorFuente(Exception):
    """Fallo de red o respuesta inesperada de REE."""


@dataclass
class Tramo:
    inicio: datetime  # aware, UTC
    fin: datetime     # aware, UTC
    eur_kwh: float

    @property
    def horas(self) -> float:
        return (self.fin - self.inicio).total_seconds() / 3600

    def a_dict(self) -> dict:
        return {"inicio": iso(self.inicio), "fin": iso(self.fin),
                "eur_kwh": round(self.eur_kwh, 5)}


# ---------------------------------------------------------------- utilidades

def ahora() -> datetime:
    return datetime.now(timezone.utc)


def iso(t: datetime) -> str:
    return t.astimezone(TZ).isoformat(timespec="minutes")


def hhmm(t: datetime) -> str:
    return t.astimezone(TZ).strftime("%H:%M")


def resolver_dia(dia) -> date:
    if dia is None or dia == "hoy":
        return ahora().astimezone(TZ).date()
    if dia in ("manana", "mañana"):
        return ahora().astimezone(TZ).date() + timedelta(days=1)
    if isinstance(dia, date):
        return dia
    return date.fromisoformat(str(dia))


def limites_dia(d: date) -> tuple[datetime, datetime]:
    """Medianoche a medianoche en Madrid, en UTC (23 o 25 h los días de cambio)."""
    ini = datetime(d.year, d.month, d.day, tzinfo=TZ).astimezone(timezone.utc)
    n = d + timedelta(days=1)
    fin = datetime(n.year, n.month, n.day, tzinfo=TZ).astimezone(timezone.utc)
    return ini, fin


def resolver_momento(valor, dia_ref: date | None = None) -> datetime | None:
    if valor is None or isinstance(valor, datetime):
        return valor.astimezone(timezone.utc) if isinstance(valor, datetime) else None
    v = str(valor).strip().lower()
    if v == "ahora":
        return ahora()
    if len(v) <= 5 and ":" in v:  # HH:MM del día de referencia
        h, m = (int(x) for x in v.split(":"))
        d = dia_ref or resolver_dia("hoy")
        if h == 24:
            return limites_dia(d)[1]
        return datetime(d.year, d.month, d.day, h, m, tzinfo=TZ).astimezone(timezone.utc)
    t = datetime.fromisoformat(str(valor))
    if t.tzinfo is None:
        t = t.replace(tzinfo=TZ)
    return t.astimezone(timezone.utc)


# ----------------------------------------------------------------- contrato

def _sin_comentarios(x):
    if isinstance(x, dict):
        return {k: _sin_comentarios(v) for k, v in x.items() if not str(k).startswith("_")}
    if isinstance(x, list):
        return [_sin_comentarios(v) for v in x]
    return x


def _fundir(base: dict, encima: dict) -> dict:
    r = copy.deepcopy(base)
    for k, v in encima.items():
        if isinstance(v, dict) and isinstance(r.get(k), dict):
            r[k] = _fundir(r[k], v)
        else:
            r[k] = v
    return r


def cargar_contrato(ruta: str | None = None) -> dict:
    """Lee el contrato: ruta > $PUENTE_LUZ_CONTRATO > contrato.json > contrato.ejemplo.json.

    Las claves que empiezan por _ son comentarios. Lo que falte se rellena con
    CONTRATO_DEFECTO. El dict devuelto lleva "archivo" con la ruta leída (o None).
    """
    if isinstance(ruta, dict):
        c = _fundir(CONTRATO_DEFECTO, _sin_comentarios(ruta))
        c.setdefault("archivo", None)
        return c
    if ruta and not os.path.exists(ruta):
        raise ValueError(f"No existe el contrato {ruta}")
    candidatos = [ruta, os.environ.get("PUENTE_LUZ_CONTRATO"), os.path.join(DIR, "contrato.json"),
                  os.path.join(DIR, "contrato.ejemplo.json")]
    for cand in candidatos:
        if cand and os.path.exists(cand):
            with open(cand, encoding="utf-8") as f:
                try:
                    datos = json.load(f)
                except json.JSONDecodeError as e:
                    raise ValueError(f"El contrato {cand} no es JSON válido: {e}") from None
            c = _fundir(CONTRATO_DEFECTO, _sin_comentarios(datos))
            c["archivo"] = os.path.abspath(cand)
            break
    else:
        c = copy.deepcopy(CONTRATO_DEFECTO)
        c["archivo"] = None
    tipo = c["tarifa"].get("tipo")
    if tipo not in ("pvpc", "fijo", "periodos"):
        raise ValueError(f"tarifa.tipo debe ser pvpc, fijo o periodos (no {tipo!r})")
    if c["tarifa"].get("sistema", "peninsula") not in HORARIOS_2_0TD:
        raise ValueError(f"tarifa.sistema debe ser uno de {sorted(HORARIOS_2_0TD)}")
    if tipo == "fijo" and c["energia"].get("precio_fijo_eur_kwh") is None:
        raise ValueError("tarifa.tipo es fijo pero falta energia.precio_fijo_eur_kwh")
    if tipo == "periodos" and any(c["energia"]["precio_periodos_eur_kwh"].get(p) is None
                                  for p in ("P1", "P2", "P3")):
        raise ValueError("tarifa.tipo es periodos pero faltan precios en energia.precio_periodos_eur_kwh")
    return c


def factor_impuestos(contrato: dict) -> float:
    """Multiplicador que pasa un precio de energía sin impuestos a euros de factura.

    (1 + impuesto eléctrico) × (1 + IVA). Con 5,11269632 % y 21 %: 1,27186...
    """
    i = contrato["impuestos"]
    return (1 + float(i["impuesto_electrico"])) * (1 + float(i["iva"]))


def periodo_2_0td(t: datetime, contrato: dict | None = None) -> str:
    """P1 (punta), P2 (llano) o P3 (valle) del instante t según el peaje 2.0TD."""
    c = contrato or CONTRATO_DEFECTO
    sistema = c["tarifa"].get("sistema", "peninsula")
    local = t.astimezone(ZONA_SISTEMA.get(sistema, TZ))
    cal = c.get("calendario", {})
    festivos = set(cal.get("festivos_valle", [])) | set(cal.get("festivos_valle_extra", []))
    if local.weekday() >= 5 or local.strftime("%m-%d") in festivos or \
            local.date().isoformat() in festivos:
        return "P3"
    h = local.hour + local.minute / 60
    for p in ("P1", "P2"):
        if any(a <= h < b for a, b in HORARIOS_2_0TD[sistema][p]):
            return p
    return "P3"


def peajes_cargos_kwh(contrato: dict, periodo: str) -> float | None:
    pc = contrato.get("peajes_cargos_energia_eur_kwh", {})
    a, b = pc.get("peajes", {}).get(periodo), pc.get("cargos", {}).get(periodo)
    return None if a is None or b is None else a + b


def importes(contrato: dict, impuestos: float | None = None, sin_impuestos: bool = False) -> dict:
    """Qué incluyen las cifras de coste: modo, factor y listas incluye / no_incluye."""
    f_fact = factor_impuestos(contrato)
    if impuestos is not None:
        modo, factor = ("limpio" if abs(impuestos - 1) < EPS else "factor_manual"), float(impuestos)
    elif sin_impuestos:
        modo, factor = "limpio", 1.0
    else:
        modo, factor = "factura", f_fact
    tipo = contrato["tarifa"]["tipo"]
    if tipo == "pvpc":
        incluye = ["energía del PVPC de cada hora (mercado, ajustes, comercialización variable)",
                   "peajes y cargos de energía del tramo P1/P2/P3 de esa hora"]
    else:
        incluye = [f"precio de energía del contrato ({tipo})"]
        incluye.append("peajes y cargos de energía (ya dentro del precio del contrato)"
                       if contrato["energia"].get("incluye_peajes_cargos", True)
                       else "peajes y cargos de energía del contrato, sumados por el script")
    no_incluye = ["término de potencia", "bono social", "alquiler del contador"]
    i = contrato["impuestos"]
    tasas = [f"impuesto eléctrico {float(i['impuesto_electrico']) * 100:.8f}".rstrip("0").rstrip(".") + " %",
             f"IVA {float(i['iva']) * 100:g} %"]
    if modo == "factura":
        incluye += tasas
    elif modo == "limpio":
        no_incluye = tasas + no_incluye
    else:
        incluye.append(f"factor manual {factor:g} (en vez de los impuestos del contrato)")
    return {"modo": modo, "factor_impuestos": round(factor, 8),
            "factor_impuestos_contrato": round(f_fact, 8),
            "incluye": incluye, "no_incluye": no_incluye,
            "contrato": contrato.get("archivo"), "tarifa": tipo}


def _nota_costes(imp: dict) -> str:
    if imp["modo"] == "factura":
        return (f"Costes y precios medios en euros de factura: precio sin impuestos × "
                f"{imp['factor_impuestos']:.4f} (impuesto eléctrico e IVA). Sin potencia, bono social ni contador.")
    if imp["modo"] == "limpio":
        return "Costes y precios medios sin impuestos (precio limpio). Sin potencia, bono social ni contador."
    return f"Costes y precios medios × factor manual {imp['factor_impuestos']:g}."


def _tramos_contrato(d: date, contrato: dict) -> list[Tramo]:
    """Tramos horarios de un día para tarifas fijo/periodos (no hace falta REE)."""
    ini, fin = limites_dia(d)
    e = contrato["energia"]
    tramos, t = [], ini
    while t < fin:
        p = periodo_2_0td(t, contrato)
        precio = e["precio_fijo_eur_kwh"] if contrato["tarifa"]["tipo"] == "fijo" \
            else e["precio_periodos_eur_kwh"][p]
        if not e.get("incluye_peajes_cargos", True):
            extra = peajes_cargos_kwh(contrato, p)
            if extra is None:
                raise ValueError(f"Faltan peajes y cargos de energía de {p} en el contrato")
            precio += extra
        tramos.append(Tramo(t, t + timedelta(hours=1), float(precio)))
        t += timedelta(hours=1)
    return tramos


def _tramo_dict(t: Tramo, contrato: dict, serie: str = "pvpc") -> dict:
    r = t.a_dict()
    r["periodo"] = periodo_2_0td(t.inicio, contrato)
    if serie == "pvpc":
        r["eur_kwh_con_impuestos"] = round(t.eur_kwh * factor_impuestos(contrato), 5)
    return r


# ------------------------------------------------------------- descarga REE

def _cache_path(d: date, serie: str) -> str:
    return os.path.join(CACHE_DIR, f"{serie}_{d.isoformat()}.json")


def _descargar_dia(d: date) -> dict:
    q = f"?start_date={d}T00:00&end_date={d}T23:59&time_trunc=hour"
    req = urllib.request.Request(URL + q, headers={"Accept": "application/json",
                                                  "User-Agent": "puente_luz/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            cuerpo = json.load(r)
    except urllib.error.HTTPError as e:
        texto = e.read().decode("utf-8", "replace")
        if e.code == 502 and "no est" in texto and "disponibles" in texto:
            raise NoPublicado(f"REE aún no tiene precios del {d}") from None
        raise ErrorFuente(f"HTTP {e.code} de REE: {texto[:200]}") from None
    except (urllib.error.URLError, TimeoutError) as e:
        raise ErrorFuente(f"No se pudo conectar con REE: {e}") from None
    if "errors" in cuerpo:
        raise ErrorFuente(str(cuerpo["errors"])[:300])
    return cuerpo


def _parsear(cuerpo: dict, d: date, serie: str) -> list[Tramo]:
    ident = SERIES[serie]
    bloque = next((s for s in cuerpo.get("included", []) if str(s.get("id")) == ident), None)
    if bloque is None:
        raise NoPublicado(f"La respuesta de REE no trae la serie {serie} del {d}")
    ini_dia, fin_dia = limites_dia(d)
    puntos = sorted(
        (datetime.fromisoformat(v["datetime"]).astimezone(timezone.utc), float(v["value"]))
        for v in bloque["attributes"]["values"])
    puntos = [(t, p) for t, p in puntos if ini_dia <= t < fin_dia]
    if len(puntos) < 2:
        raise NoPublicado(f"Serie {serie} del {d} vacía o incompleta")
    paso = min(b[0] - a[0] for a, b in zip(puntos, puntos[1:]))
    esperados = round((fin_dia - ini_dia) / paso)
    if len(puntos) != esperados or puntos[0][0] != ini_dia:
        raise NoPublicado(f"Serie {serie} del {d} incompleta: {len(puntos)} de {esperados} tramos")
    return [Tramo(t, t + paso, p / 1000.0) for t, p in puntos]


def tramos_dia(dia="hoy", serie: str = "pvpc") -> list[Tramo]:
    """Tramos completos de un día. Lanza NoPublicado o ErrorFuente."""
    if serie not in SERIES:
        raise ValueError(f"serie debe ser una de {list(SERIES)}")
    d = resolver_dia(dia)
    ruta = _cache_path(d, serie)
    if os.path.exists(ruta):  # un día publicado y completo no cambia
        with open(ruta) as f:
            datos = json.load(f)
        return [Tramo(datetime.fromisoformat(x["inicio"]).astimezone(timezone.utc),
                      datetime.fromisoformat(x["fin"]).astimezone(timezone.utc),
                      x["eur_kwh"]) for x in datos]
    tramos = _parsear(_descargar_dia(d), d, serie)
    os.makedirs(CACHE_DIR, exist_ok=True)
    with open(ruta, "w") as f:
        json.dump([{"inicio": t.inicio.isoformat(), "fin": t.fin.isoformat(),
                    "eur_kwh": t.eur_kwh} for t in tramos], f)
    return tramos


def precios(dia="hoy", serie: str = "pvpc", contrato=None) -> list[dict]:
    """Precios publicados por REE (sin impuestos) con periodo 2.0TD y, en PVPC, el precio
    con los impuestos del contrato. Las claves inicio, fin y eur_kwh no cambian."""
    c = contrato if isinstance(contrato, dict) and "archivo" in contrato else cargar_contrato(contrato)
    return [_tramo_dict(t, c, serie) for t in tramos_dia(dia, serie)]


def esperar_publicacion(dia="manana", serie="pvpc", max_minutos=45, cada_minutos=5) -> list[Tramo]:
    """Reintenta hasta que REE publique el día. Lanza NoPublicado si se agota."""
    limite = time.monotonic() + max_minutos * 60
    while True:
        try:
            return tramos_dia(dia, serie)
        except NoPublicado:
            if time.monotonic() + cada_minutos * 60 > limite:
                raise
            time.sleep(cada_minutos * 60)


# ------------------------------------------------------------------ ventanas

def _tramos_precio(d: date, serie: str, contrato: dict | None) -> list[Tramo]:
    """Precio que se usa para decidir: REE si la tarifa es PVPC, el contrato si no."""
    if serie == "pvpc" and contrato and contrato["tarifa"]["tipo"] != "pvpc":
        return _tramos_contrato(d, contrato)
    return tramos_dia(d, serie)


def ventana(dia=None, desde=None, hasta=None, serie="pvpc",
            contrato: dict | None = None) -> tuple[list[Tramo], datetime, datetime, list[str]]:
    """Tramos recortados a [desde, hasta]. Sin dia: hoy + mañana si ya está."""
    avisos: list[str] = []
    tramos_dia = lambda x, s: _tramos_precio(resolver_dia(x), s, contrato)  # noqa: E731
    if dia is not None:
        d = resolver_dia(dia)
        tramos = tramos_dia(d, serie)
        ini, fin = limites_dia(d)
        des = resolver_momento(desde, d) or ini
        has = resolver_momento(hasta, d) or fin
    else:
        hoy = resolver_dia("hoy")
        tramos = tramos_dia(hoy, serie)
        try:
            tramos = tramos + tramos_dia(hoy + timedelta(days=1), serie)
        except NoPublicado:
            avisos.append("Los precios de mañana aún no están publicados; solo se mira hoy.")
        des = resolver_momento(desde, hoy) or ahora()
        has = resolver_momento(hasta, hoy) or tramos[-1].fin
    if dia is not None and des < ahora() and resolver_dia(dia) == resolver_dia("hoy") and desde is None:
        des = ahora()  # hoy sin --desde: no proponer horas ya pasadas
        avisos.append("Ventana de hoy desde este momento (las horas pasadas no cuentan).")
    if has > tramos[-1].fin:
        avisos.append(f"No hay precios después de {iso(tramos[-1].fin)}; la ventana se corta ahí.")
        has = tramos[-1].fin
    recortados = []
    for t in tramos:
        a, b = max(t.inicio, des), min(t.fin, has)
        if b - a > timedelta(0):
            recortados.append(Tramo(a, b, t.eur_kwh))
    if not recortados:
        raise ValueError("La ventana pedida no tiene ningún tramo con precio publicado.")
    return recortados, des, has, avisos


def _potencia_info(potencia_w: float, avisos: list[str]) -> dict:
    if potencia_w <= 0:
        raise ValueError("potencia_w debe ser > 0")
    return {"potencia_w": potencia_w, "kw": potencia_w / 1000}


def _coste(tramos: list[Tramo], ini: datetime, fin: datetime, kw: float) -> float:
    total = 0.0
    for t in tramos:
        a, b = max(t.inicio, ini), min(t.fin, fin)
        if b > a:
            total += t.eur_kwh * kw * (b - a).total_seconds() / 3600
    return total


def _continuo(tramos: list[Tramo], ini: datetime, fin: datetime) -> bool:
    cubierto = ini
    for t in tramos:
        if t.fin <= cubierto:
            continue
        if t.inicio > cubierto:
            return False
        cubierto = t.fin
        if cubierto >= fin:
            return True
    return cubierto >= fin


def _reparto_periodos(tramos: list[Tramo], ini: datetime, fin: datetime, kw: float,
                      contrato: dict) -> dict:
    """kWh de un intervalo repartidos por periodo 2.0TD (P1/P2/P3)."""
    r = {"P1": 0.0, "P2": 0.0, "P3": 0.0}
    for t in tramos:
        a, b = max(t.inicio, ini), min(t.fin, fin)
        if b > a:
            r[periodo_2_0td(a, contrato)] += kw * (b - a).total_seconds() / 3600
    return {k: round(v, 3) for k, v in r.items()}


def _preparar(contrato, impuestos, sin_impuestos):
    c = contrato if isinstance(contrato, dict) and "archivo" in contrato else cargar_contrato(contrato)
    return c, importes(c, impuestos, sin_impuestos)


def _base(serie, des, has, avisos, imp: dict, contrato: dict):
    fuente = "REE REData" if serie != "pvpc" or contrato["tarifa"]["tipo"] == "pvpc" \
        else f"contrato ({contrato['tarifa']['tipo']})"
    nota = NOTA_PRECIO[serie] if fuente == "REE REData" else \
        f"Precio de energía del contrato ({contrato['tarifa']['tipo']}), sin impuestos ni potencia"
    return {"ok": True, "serie": serie, "nota_precio": nota,
            "nota_costes": _nota_costes(imp),
            "factor_impuestos": imp["factor_impuestos"], "importes": imp,
            "ventana": {"desde": iso(des), "hasta": iso(has)},
            "fuente": fuente, "consultado": iso(ahora()), "avisos": avisos}


# ---------------------------------------------------------------- funciones

def bloque_consecutivo(horas: float, potencia_w: float, dia=None, desde=None, hasta=None,
                       serie="pvpc", impuestos: float | None = None, contrato=None,
                       sin_impuestos: bool = False) -> dict:
    """Bloque seguido más barato de `horas` dentro de la ventana.

    impuestos=None: euros de factura con los impuestos del contrato (por defecto).
    impuestos=1.0 o sin_impuestos=True: precio limpio. Otro número: factor manual.
    """
    c, imp = _preparar(contrato, impuestos, sin_impuestos)
    impuestos, f_fact = imp["factor_impuestos"], imp["factor_impuestos_contrato"]
    tramos, des, has, avisos = ventana(dia, desde, hasta, serie, c)
    pot = _potencia_info(potencia_w, avisos)
    dur = timedelta(hours=horas)
    candidatos = sorted({tramos[0].inicio} | {t.inicio for t in tramos})
    opciones = []
    for ini in candidatos:
        fin = ini + dur
        if fin > has + timedelta(seconds=1) or not _continuo(tramos, ini, fin):
            continue
        opciones.append((_coste(tramos, ini, fin, pot["kw"]) * impuestos, ini, fin))
    if not opciones:
        raise ValueError(f"No caben {horas} h seguidas en la ventana {iso(des)} - {iso(has)}.")
    coste, ini, fin = min(opciones)
    ya = opciones[0]
    peor = max(opciones)
    kwh = pot["kw"] * horas
    limpio = coste / impuestos
    r = _base(serie, des, has, avisos, imp, c)
    r.update({
        "tipo": "bloque_consecutivo", **pot, "horas": horas, "energia_kwh": round(kwh, 3),
        "inicio": iso(ini), "fin": iso(fin),
        "coste_estimado_eur": round(coste, 4),
        "precio_medio_eur_kwh": round(coste / kwh, 5),
        "coste_sin_impuestos_eur": round(limpio, 4),
        "coste_con_impuestos_eur": round(limpio * f_fact, 4),
        "energia_por_periodo_kwh": _reparto_periodos(tramos, ini, fin, pot["kw"], c),
        "comparacion": {
            "empezando_al_inicio_de_la_ventana": {"inicio": iso(ya[1]), "coste_eur": round(ya[0], 4)},
            "peor_bloque": {"inicio": iso(peor[1]), "coste_eur": round(peor[0], 4)},
            "ahorro_vs_inicio_ventana_eur": round(ya[0] - coste, 4)},
    })
    return r


def repartir(horas: float, potencia_w: float, bloque_min_h: float = 1, bloque_max_h: float | None = None,
             pausa_min_h: float = 0, dia=None, desde=None, hasta=None, serie="pvpc",
             impuestos: float | None = None, contrato=None, sin_impuestos: bool = False) -> dict:
    """Reparte `horas` de trabajo en trozos seguidos de entre bloque_min_h y
    bloque_max_h, separados al menos pausa_min_h, con el menor coste.
    Solo usa tramos enteros (un tramo empezado a medias se descarta).
    Impuestos: igual que bloque_consecutivo."""
    ct, imp = _preparar(contrato, impuestos, sin_impuestos)
    impuestos, f_fact = imp["factor_impuestos"], imp["factor_impuestos_contrato"]
    tramos, des, has, avisos = ventana(dia, desde, hasta, serie, ct)
    pot = _potencia_info(potencia_w, avisos)
    paso_h = max(t.horas for t in tramos)
    enteros = [t for t in tramos if abs(t.horas - paso_h) < EPS]
    if len(enteros) < len(tramos):
        avisos.append("Se descartan tramos a medias en los bordes de la ventana.")
    def en_pasos(h, nombre):
        n = h / paso_h
        if abs(n - round(n)) > 1e-6:
            avisos.append(f"{nombre} = {h} h no es múltiplo del tramo de {paso_h:g} h; se redondea hacia arriba.")
            return int(n) + 1
        return int(round(n))
    K = en_pasos(horas, "horas")
    a = max(1, en_pasos(bloque_min_h, "bloque_min_h"))
    b = en_pasos(bloque_max_h, "bloque_max_h") if bloque_max_h else K
    p = en_pasos(pausa_min_h, "pausa_min_h") if pausa_min_h else 0
    if a > b:
        raise ValueError("bloque_min_h no puede ser mayor que bloque_max_h")
    n = len(enteros)
    if K > n:
        raise ValueError(f"Pides {K * paso_h:g} h y la ventana solo tiene {n * paso_h:g} h con precio.")
    c = [t.eur_kwh * pot["kw"] * t.horas * impuestos for t in enteros]
    pref = [0.0]
    for x in c:
        pref.append(pref[-1] + x)
    def seguido(i, L):
        return all(enteros[j].fin == enteros[j + 1].inicio for j in range(i, i + L - 1))
    INF = float("inf")
    # dp[i][k]: coste mínimo colocando k tramos usando los tramos i..n-1
    dp = [[INF] * (K + 1) for _ in range(n + p + 2)]
    elec = [[None] * (K + 1) for _ in range(n + 1)]
    for i in range(n + p + 2):
        dp[i][0] = 0.0
    for i in range(n - 1, -1, -1):
        for k in range(1, K + 1):
            mejor, op = dp[i + 1][k], ("salta",)
            for L in range(a, min(b, k) + 1):
                if i + L > n or not seguido(i, L):
                    continue
                resto = 0.0 if k == L else dp[min(i + L + p, n + p + 1)][k - L]
                if i + L + p > n and k != L:
                    resto = INF
                v = pref[i + L] - pref[i] + resto
                if v < mejor - EPS:
                    mejor, op = v, ("bloque", L)
            dp[i][k], elec[i][k] = mejor, op
    if dp[0][K] == INF:
        raise ValueError("No hay forma de repartir esas horas con esos trozos dentro de la ventana.")
    bloques, i, k = [], 0, K
    while k > 0:
        op = elec[i][k]
        if op[0] == "salta":
            i += 1
            continue
        L = op[1]
        seg = enteros[i:i + L]
        coste = pref[i + L] - pref[i]
        kwh = pot["kw"] * L * paso_h
        pegado = bool(bloques) and bloques[-1]["fin"] == iso(seg[0].inicio)
        bloques.append({"inicio": iso(seg[0].inicio), "fin": iso(seg[-1].fin), "horas": L * paso_h,
                        "pegado_al_anterior": pegado,
                        "energia_kwh": round(kwh, 3), "coste_estimado_eur": round(coste, 4),
                        "precio_medio_eur_kwh": round(coste / kwh, 5),
                        "coste_sin_impuestos_eur": round(coste / impuestos, 4),
                        "coste_con_impuestos_eur": round(coste / impuestos * f_fact, 4),
                        "energia_por_periodo_kwh": _reparto_periodos(seg, seg[0].inicio, seg[-1].fin,
                                                                     pot["kw"], ct)})
        k -= L
        i += L + p
    total = dp[0][K]
    kwh_tot = pot["kw"] * K * paso_h
    r = _base(serie, des, has, avisos, imp, ct)
    r.update({"tipo": "repartir", **pot, "horas": K * paso_h, "energia_kwh": round(kwh_tot, 3),
              "restricciones": {"bloque_min_h": a * paso_h, "bloque_max_h": b * paso_h,
                                "pausa_min_h": p * paso_h, "tramo_h": paso_h},
              "bloques": bloques, "coste_estimado_eur": round(total, 4),
              "precio_medio_eur_kwh": round(total / kwh_tot, 5),
              "coste_sin_impuestos_eur": round(total / impuestos, 4),
              "coste_con_impuestos_eur": round(total / impuestos * f_fact, 4)})
    return r


def franjas_bajo_umbral(max_precio_eur_kwh: float, dia=None, desde=None, hasta=None, serie="pvpc",
                        min_horas: float = 0, potencia_w: float | None = None,
                        impuestos: float | None = None, contrato=None, sin_impuestos: bool = False,
                        umbral_factura: bool = False) -> dict:
    """Franjas seguidas con precio <= umbral.

    El umbral se compara con el precio publicado (sin impuestos), el de la gráfica de
    REE, salvo umbral_factura=True (precio con impuestos del contrato) o un factor
    manual en impuestos (se compara precio × factor, como antes).
    precio_medio_eur_kwh y precio_max_eur_kwh van en la misma base que el umbral.
    """
    c, imp = _preparar(contrato, impuestos, sin_impuestos)
    f_modo, f_fact = imp["factor_impuestos"], imp["factor_impuestos_contrato"]
    if imp["modo"] == "factor_manual":
        f_umbral, base_umbral = f_modo, f"precio publicado × factor manual {f_modo:g}"
    elif umbral_factura:
        f_umbral, base_umbral = f_fact, "precio con impuestos (euros de factura)"
    else:
        f_umbral, base_umbral = 1.0, "precio publicado sin impuestos (el de la gráfica de REE)"
    tramos, des, has, avisos = ventana(dia, desde, hasta, serie, c)
    franjas, actual = [], []
    for t in tramos + [None]:
        if t is not None and t.eur_kwh * f_umbral <= max_precio_eur_kwh + EPS and \
                (not actual or actual[-1].fin == t.inicio):
            actual.append(t)
            continue
        if actual:
            h = sum(x.horas for x in actual)
            if h + EPS >= min_horas:
                media = sum(x.eur_kwh * x.horas for x in actual) / h
                f = {"inicio": iso(actual[0].inicio), "fin": iso(actual[-1].fin), "horas": round(h, 3),
                     "precio_medio_eur_kwh": round(media * f_umbral, 5),
                     "precio_max_eur_kwh": round(max(x.eur_kwh for x in actual) * f_umbral, 5),
                     "precio_medio_con_impuestos_eur_kwh": round(media * f_fact, 5),
                     "periodos": sorted({periodo_2_0td(x.inicio, c) for x in actual})}
                if potencia_w:
                    kwh = potencia_w / 1000 * h
                    f["coste_estimado_eur"] = round(media * f_modo * kwh, 4)
                    f["coste_sin_impuestos_eur"] = round(media * kwh, 4)
                    f["coste_con_impuestos_eur"] = round(media * f_fact * kwh, 4)
                franjas.append(f)
        actual = [t] if t is not None and t.eur_kwh * f_umbral <= max_precio_eur_kwh + EPS else []
    r = _base(serie, des, has, avisos, imp, c)
    r.update({"tipo": "umbral", "max_precio_eur_kwh": max_precio_eur_kwh,
              "umbral_comparado_con": base_umbral, "franjas": franjas,
              "horas_totales": round(sum(f["horas"] for f in franjas), 3)})
    if potencia_w:
        r["potencia_w"] = potencia_w
    return r


def resumen_dia(dia="hoy", serie="pvpc", n=5, contrato=None) -> dict:
    c = contrato if isinstance(contrato, dict) and "archivo" in contrato else cargar_contrato(contrato)
    tramos = tramos_dia(dia, serie)
    orden = sorted(tramos, key=lambda t: t.eur_kwh)
    h = sum(t.horas for t in tramos)
    media = sum(t.eur_kwh * t.horas for t in tramos) / h
    r = {"ok": True, "tipo": "resumen", "serie": serie, "nota_precio": NOTA_PRECIO[serie],
         "dia": resolver_dia(dia).isoformat(), "tramos": len(tramos), "tramo_h": tramos[0].horas,
         "horas_dia": h,
         "media_eur_kwh": round(media, 5),
         "mas_baratos": [_tramo_dict(t, c, serie) for t in orden[:n]],
         "mas_caros": [_tramo_dict(t, c, serie) for t in orden[::-1][:n]],
         "fuente": "REE REData", "consultado": iso(ahora())}
    if serie == "pvpc":
        f = factor_impuestos(c)
        r["media_con_impuestos_eur_kwh"] = round(media * f, 5)
        r["factor_impuestos"] = round(f, 8)
        por = {}
        for t in tramos:
            por.setdefault(periodo_2_0td(t.inicio, c), []).append(t)
        r["media_por_periodo_eur_kwh"] = {p: round(sum(x.eur_kwh for x in v) / len(v), 5)
                                          for p, v in sorted(por.items())}
        if c["tarifa"]["tipo"] != "pvpc":
            r["avisos"] = ["Tu contrato no es PVPC: estos son los precios de REE, no los tuyos. "
                           "bloque, repartir y umbral sí usan los del contrato."]
    return r


def grafica(dia="hoy", salida=None, con_spot=False) -> dict:
    """PNG con el PVPC del día: una barra por cada hora (00-01, 01-02...), sin agrupar.

    El PVPC se cobra por horas, así que cada barra es el precio de esa hora tal cual lo da
    REE. El mayorista solo se añade si se pide (con_spot=True), como línea de referencia.
    """
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib.colors import LinearSegmentedColormap
    d = resolver_dia(dia)
    pvpc = tramos_dia(d, "pvpc")
    salida = salida or f"pvpc_{d.isoformat()}.png"
    n = len(pvpc)  # 24, o 23/25 en los días de cambio de hora
    ys = [t.eur_kwh for t in pvpc]
    etiquetas = [f"{hhmm(t.inicio)[:2]}-{hhmm(t.fin)[:2]}" for t in pvpc]
    media = sum(t.eur_kwh * t.horas for t in pvpc) / sum(t.horas for t in pvpc)
    i_min = min(range(n), key=lambda i: ys[i])
    i_max = max(range(n), key=lambda i: ys[i])
    lo, hi = min(ys), max(ys)
    cmap = LinearSegmentedColormap.from_list("luz", ["#2e9e44", "#f0c419", "#d9362b"])
    colores = [cmap((y - lo) / (hi - lo) if hi > lo else 0.5) for y in ys]

    fig, ax = plt.subplots(figsize=(13, 6), dpi=130)
    xs = list(range(n))
    barras = ax.bar(xs, ys, width=0.82, color=colores, edgecolor="#333", linewidth=0.4,
                    label="PVPC por hora (€/kWh, sin impuestos)")
    for i, (b, y) in enumerate(zip(barras, ys)):
        ax.text(b.get_x() + b.get_width() / 2, y + hi * 0.012, f"{y:.3f}", ha="center",
                va="bottom", fontsize=7.5, rotation=90,
                fontweight="bold" if i in (i_min, i_max) else "normal")
    ax.axhline(media, color="#555", linestyle="--", linewidth=1, label=f"Media del día {media:.4f}")
    if con_spot:
        try:
            spot = tramos_dia(d, "spot")
            # el mayorista viene cada 15 min: se pinta como línea fina sobre la posición horaria
            x0 = pvpc[0].inicio
            px = [((t.inicio - x0).total_seconds() / 3600) - 0.5 for t in spot] + \
                 [((spot[-1].fin - x0).total_seconds() / 3600) - 0.5]
            ax.stairs([t.eur_kwh for t in spot], px, color="#555", linewidth=1, alpha=0.7,
                      label="Mayorista (referencia)", baseline=None)
        except (NoPublicado, ErrorFuente):
            pass
    ax.set_xticks(xs)
    ax.set_xticklabels(etiquetas, rotation=60, ha="right", fontsize=8.5)
    ax.set_xlim(-0.6, n - 0.4)
    # desde 0 (o desde el precio más negativo) y con margen: ninguna barra queda recortada
    ax.set_ylim(min(0, lo * 1.25), max(hi, 0.001) * 1.18)
    if lo < 0:
        ax.axhline(0, color="#333", linewidth=0.8)
    ax.set_xlabel("Hora peninsular (cada barra es una hora)")
    ax.set_ylabel("€/kWh")
    ax.set_title(f"PVPC peninsular {d.strftime('%d/%m/%Y')}, precio de cada hora (REE, sin impuestos)\n"
                 f"Más barata {etiquetas[i_min]} h: {ys[i_min]:.4f}   "
                 f"Más cara {etiquetas[i_max]} h: {ys[i_max]:.4f}", fontsize=11)
    ax.grid(axis="y", alpha=0.3)
    ax.set_axisbelow(True)
    ax.legend(loc="upper left", fontsize=8)
    fig.tight_layout()
    fig.savefig(salida)
    plt.close(fig)
    barato, caro = pvpc[i_min], pvpc[i_max]
    return {"ok": True, "tipo": "grafica", "dia": d.isoformat(), "archivo": os.path.abspath(salida),
            "horas": n, "media_eur_kwh": round(media, 5),
            "min": barato.a_dict(), "max": caro.a_dict(), "fuente": "REE REData"}


# ------------------------------------------------------- contrato y factura

def _r2(x: float) -> float:
    return round(x + 1e-9, 2)


def estimar_factura(contrato=None, dias: int | None = None, kwh: dict | None = None,
                    coste_energia_medio_eur_kwh: float | None = None,
                    precio_kwh_periodo: dict | None = None) -> dict:
    """Recalcula una factura 2.0TD línea a línea, redondeando cada línea a céntimos.

    PVPC: energía = peajes + cargos de cada periodo + coste de la energía medio (el que
    trae la factura). Fijo/periodos: energía = kWh × precio del contrato.
    Sin argumentos usa contrato["factura_referencia"].
    """
    c = contrato if isinstance(contrato, dict) and "archivo" in contrato else cargar_contrato(contrato)
    ref = c.get("factura_referencia") or {}
    dias = dias or ref.get("dias")
    kwh = kwh or ref.get("kwh")
    if not dias or not kwh:
        raise ValueError("Faltan días y kWh por periodo (o factura_referencia en el contrato)")
    if coste_energia_medio_eur_kwh is None:
        coste_energia_medio_eur_kwh = ref.get("coste_energia_medio_eur_kwh")
    pot, imp, fij = c["potencia"], c["impuestos"], c["otros_fijos"]
    kw = pot["contratada_kw"]
    if kw.get("P1") is None or kw.get("P2") is None:
        raise ValueError("Falta potencia.contratada_kw (P1 y P2) en el contrato")
    lin: dict[str, float] = {}
    for p in ("P1", "P2"):
        lin[f"potencia_peajes_{p}"] = _r2(kw[p] * dias * pot["peajes_eur_kw_dia"][p])
        lin[f"potencia_cargos_{p}"] = _r2(kw[p] * dias * pot["cargos_eur_kw_dia"][p])
    lin["potencia_margen_comercializacion"] = _r2(kw["P1"] * dias * pot["margen_comercializacion_eur_kw_dia"])
    total_kwh = sum(kwh.values())
    tipo = c["tarifa"]["tipo"]
    pc = c["peajes_cargos_energia_eur_kwh"]
    if tipo == "pvpc":
        if coste_energia_medio_eur_kwh is None:
            raise ValueError("Para PVPC hace falta el coste de la energía medio de la factura")
        for p in ("P1", "P2", "P3"):
            lin[f"energia_peajes_{p}"] = _r2(kwh.get(p, 0) * pc["peajes"][p])
        for p in ("P1", "P2", "P3"):
            lin[f"energia_cargos_{p}"] = _r2(kwh.get(p, 0) * pc["cargos"][p])
        lin["energia_coste"] = _r2(total_kwh * coste_energia_medio_eur_kwh)
    else:
        e = c["energia"]
        for p in ("P1", "P2", "P3"):
            precio = (precio_kwh_periodo or {}).get(p) or (
                e["precio_fijo_eur_kwh"] if tipo == "fijo" else e["precio_periodos_eur_kwh"][p])
            if not e.get("incluye_peajes_cargos", True):
                precio += peajes_cargos_kwh(c, p) or 0
            lin[f"energia_{p}"] = _r2(kwh.get(p, 0) * precio)
    potencia = sum(v for k, v in lin.items() if k.startswith("potencia_"))
    energia = sum(v for k, v in lin.items() if k.startswith("energia_"))
    bono = _r2(dias * fij.get("bono_social_eur_dia", 0))
    contador = _r2(dias * fij.get("alquiler_contador_eur_dia", 0))
    partes = {"potencia": potencia, "energia": energia, "bono_social": bono, "alquiler_contador": contador}
    base_iee = sum(partes[k] for k in imp.get("impuesto_electrico_base", ["potencia", "energia"]))
    iee = base_iee * float(imp["impuesto_electrico"])
    iee_min = total_kwh / 1000 * float(imp.get("impuesto_electrico_minimo_eur_mwh", 0))
    iee_minimo_aplicado = iee < iee_min
    iee = _r2(max(iee, iee_min))
    subtotal = potencia + energia + bono + iee + contador
    iva = _r2(subtotal * float(imp["iva"]))
    total = _r2(subtotal + iva)
    r = {"dias": dias, "kwh": kwh, "kwh_total": total_kwh, "lineas_eur": lin,
         "potencia_eur": round(potencia, 2), "energia_eur": round(energia, 2),
         "bono_social_eur": bono, "base_impuesto_electrico_eur": round(base_iee, 2),
         "impuesto_electrico_eur": iee, "impuesto_electrico_minimo_aplicado": iee_minimo_aplicado,
         "alquiler_contador_eur": contador, "subtotal_sin_iva_eur": round(subtotal, 2),
         "iva_eur": iva, "total_eur": total,
         "precio_medio_total_eur_kwh": round(total / total_kwh, 5) if total_kwh else None,
         "nota": "Cada línea se redondea a céntimos, como en la factura. Base del impuesto eléctrico: "
                 + ", ".join(imp.get("impuesto_electrico_base", [])) + "; el contador va fuera."}
    if ref.get("total_factura_eur") is not None and dias == ref.get("dias") and kwh == ref.get("kwh"):
        r["total_factura_real_eur"] = ref["total_factura_eur"]
        r["diferencia_eur"] = round(total - ref["total_factura_eur"], 2)
        r["cuadra"] = abs(total - ref["total_factura_eur"]) < 0.015
    return r


def resumen_contrato(contrato=None, comprobar_factura: bool = False) -> dict:
    """Contrato cargado, factor de impuestos, costes fijos y peajes+cargos por periodo."""
    c = contrato if isinstance(contrato, dict) and "archivo" in contrato else cargar_contrato(contrato)
    f = factor_impuestos(c)
    pot, fij, imp = c["potencia"], c["otros_fijos"], c["impuestos"]
    kw = pot["contratada_kw"]
    r = {"ok": True, "tipo": "contrato", "archivo": c["archivo"], "descripcion": c.get("descripcion"),
         "tarifa": c["tarifa"], "factor_impuestos": round(f, 8),
         "factor_impuestos_detalle": f"(1 + {imp['impuesto_electrico']}) × (1 + {imp['iva']})",
         "peajes_mas_cargos_energia_eur_kwh": {p: (round(v, 6) if v is not None else None)
                                               for p in ("P1", "P2", "P3")
                                               for v in [peajes_cargos_kwh(c, p)]},
         "avisos": []}
    if kw.get("P1") is not None and kw.get("P2") is not None and pot.get("peajes_eur_kw_dia"):
        dia_pot = sum(kw[p] * (pot["peajes_eur_kw_dia"][p] + pot["cargos_eur_kw_dia"][p]) for p in ("P1", "P2")) \
            + kw["P1"] * pot["margen_comercializacion_eur_kw_dia"]
        bono, cont = fij.get("bono_social_eur_dia", 0), fij.get("alquiler_contador_eur_dia", 0)
        iee = (dia_pot + bono) * float(imp["impuesto_electrico"])
        con = (dia_pot + bono + iee + cont) * (1 + float(imp["iva"]))
        r["fijos_eur_dia"] = {"potencia": round(dia_pot, 5), "bono_social": bono, "alquiler_contador": cont,
                              "total_con_impuestos": round(con, 4),
                              "total_con_impuestos_30_dias": round(con * 30, 2)}
    else:
        r["avisos"].append("El contrato no trae potencia contratada: no se calculan los fijos.")
    if c["archivo"] is None:
        r["avisos"].append("No hay contrato.json ni contrato.ejemplo.json: valores por defecto.")
    elif os.path.basename(c["archivo"]) == "contrato.ejemplo.json":
        r["avisos"].append("Se está usando el contrato de EJEMPLO: copia contrato.ejemplo.json a contrato.json "
                           "y pon tus datos.")
    if comprobar_factura:
        r["factura"] = estimar_factura(c)
    return r


# ------------------------------------------------------- desglose ESIOS

def _num(s) -> float:
    return float(str(s).replace(".", "").replace(",", ".")) if isinstance(s, str) else float(s)


def desglose_esios(dia="hoy", contrato=None, contrastar: bool = True) -> dict:
    """Desglose oficial del PVPC 2.0TD de cada hora (archivo 70 de ESIOS, sin token).

    Componentes en €/kWh: mercado (PMH), servicios de ajuste (SAH), peajes y cargos
    (TEU), ajuste de mercados a plazo (TAH), comercialización variable (CCV), pagos
    por capacidad (PCAP) y el resto (FOM, FOS, INT, EDSR). Comprueba que los peajes y
    cargos cuadran con el contrato y, si contrastar, que el total es el de REData.
    """
    c = contrato if isinstance(contrato, dict) and "archivo" in contrato else cargar_contrato(contrato)
    d = resolver_dia(dia)
    col = "CYM" if c["tarifa"].get("sistema") == "ceuta_melilla" else "PCB"
    ruta = os.path.join(CACHE_DIR, f"esios70_{d.isoformat()}.json.gz")
    if os.path.exists(ruta):
        with gzip.open(ruta, "rt", encoding="utf-8") as f:
            cuerpo = json.load(f)
    else:
        req = urllib.request.Request(URL_ESIOS_70.format(d.isoformat()),
                                     headers={"Accept": "application/json", "User-Agent": "puente_luz/1.1"})
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                cuerpo = json.load(resp)
        except urllib.error.HTTPError as e:
            raise ErrorFuente(f"HTTP {e.code} de ESIOS (archivo 70)") from None
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
            raise ErrorFuente(f"No se pudo leer el archivo 70 de ESIOS: {e}") from None
        filas = cuerpo.get("PVPC") or []
        if not filas:
            raise NoPublicado(f"ESIOS aún no tiene el desglose del {d}")
        os.makedirs(CACHE_DIR, exist_ok=True)
        with gzip.open(ruta, "wt", encoding="utf-8") as f:
            json.dump(cuerpo, f)
    filas = cuerpo["PVPC"]
    ini, _ = limites_dia(d)
    otros = ("FOM", "FOS", "INT", "EDSR")
    horas, avisos = [], []
    for i, fila in enumerate(filas):
        t = ini + timedelta(hours=i)
        v = lambda k: _num(fila[k + col]) / 1000  # noqa: E731  €/MWh -> €/kWh
        total = _num(fila[col]) / 1000
        teu = v("TEU")
        p = periodo_2_0td(t, c)
        h = {"inicio": iso(t), "hora": fila.get("Hora"), "periodo": p,
             "pvpc_eur_kwh": round(total, 5),
             "peajes_y_cargos_eur_kwh": round(teu, 5),
             "energia_sin_peajes_eur_kwh": round(total - teu, 5),
             "mercado_diario_intradiario": round(v("PMH"), 5),
             "servicios_ajuste": round(v("SAH"), 5),
             "ajuste_mercados_plazo": round(v("TAH"), 5),
             "comercializacion_variable": round(v("CCV"), 5),
             "pagos_capacidad": round(v("PCAP"), 5),
             "otros": round(sum(v(k) for k in otros), 5),
             "con_impuestos_eur_kwh": round(total * factor_impuestos(c), 5)}
        esperado = peajes_cargos_kwh(c, p)
        if esperado is not None and abs(esperado - teu) > 0.00002:
            avisos.append(f"{h['hora']}: peajes y cargos en ESIOS {teu:.6f} €/kWh, en el contrato {esperado:.6f} "
                          f"({p}). ¿Han cambiado los peajes/cargos o es festivo/otro tramo?")
        horas.append(h)
    r = {"ok": True, "tipo": "desglose", "dia": d.isoformat(), "columna_esios": col,
         "fuente": URL_ESIOS_70.format(d.isoformat()),
         "nota": "€/kWh sin impuestos. pvpc = suma de todos los componentes. El ajuste de mercados a plazo "
                 "(RD 446/2023) es casi igual todas las horas del día y puede ser negativo.",
         "horas": horas, "avisos": avisos[:6] + ([f"... y {len(avisos) - 6} más"] if len(avisos) > 6 else [])}
    if contrastar and c["tarifa"].get("sistema", "peninsula") == "peninsula":
        try:
            ree = tramos_dia(d, "pvpc")
            if len(ree) == len(horas):
                dif = max(abs(a.eur_kwh - b["pvpc_eur_kwh"]) for a, b in zip(ree, horas))
                r["contraste_redata"] = {"max_diferencia_eur_kwh": round(dif, 6), "coincide": dif < 0.00002}
            else:
                r["contraste_redata"] = {"coincide": None,
                                         "detalle": f"REData {len(ree)} tramos, ESIOS {len(horas)}"}
        except (NoPublicado, ErrorFuente) as e:
            r["contraste_redata"] = {"coincide": None, "detalle": str(e)}
    neg = [h for h in horas if h["pvpc_eur_kwh"] < 0]
    if neg:
        r["horas_negativas"] = [h["hora"] for h in neg]
    return r


# ------------------------------------------------------------------- CLI

def _potencia_cli(args) -> tuple[float, list[str]]:
    avisos = []
    if args.potencia:
        return args.potencia, avisos
    if args.gpu_w:
        if not args.resto_w:
            avisos.append("Solo se ha dado la potencia de la GPU; el equipo entero consume más "
                          "(CPU, placa, discos, pérdidas de la fuente). Usa --resto-w o mide en el enchufe.")
        return args.gpu_w + (args.resto_w or 0), avisos
    raise SystemExit("Falta --potencia (W del equipo) o --gpu-w [--resto-w]")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Puente REE -> precios de la luz en JSON (lee contrato.json)")
    sub = ap.add_subparsers(dest="cmd", required=True)

    def comunes(p, potencia=True):
        p.add_argument("--dia", help="hoy | manana | AAAA-MM-DD")
        p.add_argument("--desde", help="ahora | HH:MM | fecha ISO")
        p.add_argument("--hasta", help="HH:MM | fecha ISO")
        p.add_argument("--serie", default="pvpc", choices=list(SERIES))
        p.add_argument("--impuestos", type=float, default=None,
                       help="factor manual (p. ej. 1.27); por defecto, impuestos del contrato")
        p.add_argument("--sin-impuestos", action="store_true", help="precio limpio, sin impuestos")
        p.add_argument("--contrato", help="ruta a contrato.json (por defecto, junto al script)")
        if potencia:
            p.add_argument("--potencia", type=float, help="W totales del equipo")
            p.add_argument("--gpu-w", type=float)
            p.add_argument("--resto-w", type=float)

    p = sub.add_parser("precios"); p.add_argument("--dia", default="hoy")
    p.add_argument("--serie", default="pvpc", choices=list(SERIES))
    p.add_argument("--esperar", type=float, default=0, help="minutos a reintentar si no está publicado")
    p.add_argument("--contrato")
    p = sub.add_parser("resumen"); p.add_argument("--dia", default="hoy")
    p.add_argument("--serie", default="pvpc", choices=list(SERIES))
    p.add_argument("--esperar", type=float, default=0)
    p.add_argument("--contrato")
    p = sub.add_parser("bloque"); comunes(p); p.add_argument("--horas", type=float, required=True)
    p = sub.add_parser("repartir"); comunes(p); p.add_argument("--horas", type=float, required=True)
    p.add_argument("--min", type=float, default=1, help="horas mínimas por trozo")
    p.add_argument("--max", type=float, help="horas máximas por trozo")
    p.add_argument("--pausa", type=float, default=0, help="horas mínimas entre trozos")
    p = sub.add_parser("umbral"); comunes(p, potencia=False)
    p.add_argument("--max-precio", type=float, required=True, help="€/kWh, p. ej. 0.10")
    p.add_argument("--min-horas", type=float, default=0)
    p.add_argument("--potencia", type=float)
    p.add_argument("--umbral-factura", action="store_true",
                   help="compara --max-precio con el precio con impuestos, no con el publicado")
    p = sub.add_parser("grafica"); p.add_argument("--dia", default="hoy")
    p.add_argument("--salida")
    p.add_argument("--con-spot", action="store_true", help="añade el mayorista como referencia")
    p.add_argument("--sin-spot", action="store_true", help="(obsoleto: ya es lo normal)")
    p = sub.add_parser("contrato"); p.add_argument("--contrato")
    p.add_argument("--comprobar-factura", action="store_true",
                   help="recalcula la factura de referencia del contrato y la compara con el total real")
    p = sub.add_parser("desglose"); p.add_argument("--dia", default="hoy"); p.add_argument("--contrato")
    p.add_argument("--sin-contraste", action="store_true", help="no compara con REData")

    a = ap.parse_args(argv)
    try:
        if a.cmd in ("precios", "resumen"):
            if a.esperar:
                esperar_publicacion(a.dia, a.serie, max_minutos=a.esperar)
            if a.cmd == "precios":
                r = {"ok": True, "tipo": "precios", "serie": a.serie, "nota_precio": NOTA_PRECIO[a.serie],
                     "dia": resolver_dia(a.dia).isoformat(), "tramos": precios(a.dia, a.serie, a.contrato)}
                if a.serie == "pvpc":
                    r["nota_con_impuestos"] = ("eur_kwh_con_impuestos = eur_kwh × factor de impuestos del "
                                               "contrato; periodo = tramo 2.0TD de esa hora")
            else:
                r = resumen_dia(a.dia, a.serie, contrato=a.contrato)
        elif a.cmd == "bloque":
            w, av = _potencia_cli(a)
            r = bloque_consecutivo(a.horas, w, a.dia, a.desde, a.hasta, a.serie, a.impuestos,
                                   a.contrato, a.sin_impuestos)
            r["avisos"] += av
        elif a.cmd == "repartir":
            w, av = _potencia_cli(a)
            r = repartir(a.horas, w, a.min, a.max, a.pausa, a.dia, a.desde, a.hasta, a.serie, a.impuestos,
                         a.contrato, a.sin_impuestos)
            r["avisos"] += av
        elif a.cmd == "umbral":
            r = franjas_bajo_umbral(a.max_precio, a.dia, a.desde, a.hasta, a.serie, a.min_horas,
                                    a.potencia, a.impuestos, a.contrato, a.sin_impuestos, a.umbral_factura)
        elif a.cmd == "contrato":
            r = resumen_contrato(a.contrato, a.comprobar_factura)
        elif a.cmd == "desglose":
            r = desglose_esios(a.dia, a.contrato, not a.sin_contraste)
        else:
            r = grafica(a.dia, a.salida, a.con_spot and not a.sin_spot)
    except NoPublicado as e:
        print(json.dumps({"ok": False, "error": "no_publicado", "detalle": str(e)}, ensure_ascii=False))
        return 2
    except (ErrorFuente, ValueError) as e:
        print(json.dumps({"ok": False, "error": type(e).__name__, "detalle": str(e)}, ensure_ascii=False))
        return 1
    print(json.dumps(r, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
