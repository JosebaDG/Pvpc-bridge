#!/usr/bin/env python3
"""Aviso nocturno: el mejor bloque de horas de mañana, en una imagen y tres líneas.

Pensado para mandarlo a un chat cada noche (issue #4). Para el día pedido
(mañana por defecto):

1. Saca el PVPC peninsular por horas de REData con ``puente_luz`` (una
   petición, con la caché de siempre en ~/.cache/puente_luz/).
2. Busca el bloque más barato: las horas seguidas alrededor del precio más
   bajo que no se alejan de él más de un 15 % del recorrido del día (mínimo
   medio céntimo). Si hay varios tramos así (madrugada y mediodía), gana el de
   precio medio más bajo. Su duración sale del propio día: no hay que elegirla.
3. Pide a Open-Meteo la previsión de mañana en los seis puntos de
   ``datos/manifiesto.json`` (una petición, con caché) y la cruza con el
   histórico de ``datos/`` para sacar, si los datos dan para ello, una
   conclusión curiosa en una línea. Va rotando entre varias.
4. Dibuja la gráfica de siempre (una barra por hora, eje desde 0, sin cortar
   picos) con el bloque marcado, pensada para leerse en el móvil, y escribe un
   JSON con el mensaje listo para mandar.

Precios: por defecto, con los impuestos del contrato (impuesto eléctrico e
IVA, sin término de potencia), igual que ``puente_luz``. ``--sin-impuestos``
da el precio publicado por REE.

Conclusiones (correlación, no previsión). Se comparan días de la misma época
del año (30 días antes y después de la fecha, en cada año) según el tiempo
observado en los seis puntos:

- PVPC solo desde 2024: el Real Decreto 446/2023 cambió cómo se calcula, así
  que mezclar años anteriores falsearía la comparación. El mercado diario sí
  se compara desde 2014, pero relativo a la media de cada año.
- Solo sale una conclusión si hay al menos 20 días parecidos, la diferencia
  pasa del 8 % y va en el mismo sentido en la mayoría de los años. Si no hay
  ninguna así, no se pone ninguna.
- La previsión de Open-Meteo y su histórico (reanálisis) no son el mismo
  modelo: la previsión suele dar algo menos de viento y de radiación. Por eso
  solo se usan los casos de "mucho" (mucho viento, mucho sol, lluvia), que
  con ese sesgo quedan del lado prudente.

Uso:
  python3 aviso_nocturno.py                       # mañana, imagen en ./aviso_AAAA-MM-DD.png
  python3 aviso_nocturno.py --dia hoy --salida /tmp/prueba.png
  python3 aviso_nocturno.py --reintentos 3 --pausa-min 15   # si aún no han salido

Salida: JSON por la salida estándar. Código 0 si todo fue bien, 2 si los
precios aún no están publicados (el JSON trae un mensaje breve para avisar de
ello) y 1 si hubo otro error.

Solo biblioteca estándar, salvo la gráfica (matplotlib). Python 3.9+.
"""
from __future__ import annotations

import argparse
import csv
import glob
import json
import os
import statistics as st
import sys
import textwrap
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone

DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, DIR)
import puente_luz as pl  # noqa: E402

DATOS = os.environ.get("PVPC_DATOS", os.path.join(DIR, "datos"))
CACHE = os.path.join(pl.CACHE_DIR, "aviso")
URL_OPEN_METEO = "https://api.open-meteo.com/v1/forecast"
USER_AGENT = "Pvpc-bridge aviso nocturno (https://github.com/JosebaDG/Pvpc-bridge)"
VARIABLES = ("wind_speed_10m_max", "shortwave_radiation_sum", "temperature_2m_mean",
             "precipitation_sum")
PUNTOS_DEFECTO = {
    "galicia_lugo": (43.01, -7.56), "castilla_leon_burgos": (42.34, -3.70),
    "aragon_zaragoza": (41.65, -0.88), "castilla_la_mancha_albacete": (38.99, -1.86),
    "extremadura_badajoz": (38.88, -6.97), "pais_vasco_bilbao": (43.26, -2.93),
}
VENTANA_DIAS = 30        # días antes y después de la fecha, en cada año
MIN_DIAS = 20            # días parecidos mínimos en cada grupo
MIN_EFECTO = 0.08        # diferencia mínima (8 %)
DESDE_PVPC = "2024-01-01"  # RD 446/2023: el PVPC de antes no es comparable
DESDE_SPOT = "2014-01-01"
DIAS_SEMANA = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]


# ------------------------------------------------------------------ formato

def eur(x: float, dec: int = 2) -> str:
    return f"{x:.{dec}f}".replace(".", ",")


def eur_bloque(x: float) -> str:
    """Dos decimales; tres si el precio baja de 10 céntimos (para que no salga 0,00 o -0,01)."""
    return eur(x, 3 if abs(x) < 0.1 else 2)


def pct(x: float) -> str:
    return f"{abs(x) * 100:.0f} %"


# ----------------------------------------------------------- bloque barato

def bloque_mas_barato(tramos: list, factor: float) -> dict:
    """Horas seguidas cerca del mínimo del día (tolerancia: 15 % del recorrido)."""
    ys = [t.eur_kwh for t in tramos]
    lo, hi = min(ys), max(ys)
    umbral = lo + max(0.15 * (hi - lo), 0.005)
    tramos_ok, i = [], 0
    while i < len(ys):
        if ys[i] <= umbral:
            j = i
            while j + 1 < len(ys) and ys[j + 1] <= umbral:
                j += 1
            tramos_ok.append((i, j + 1))
            i = j + 1
        else:
            i += 1
    a, b = min(tramos_ok, key=lambda r: (st.mean(ys[r[0]:r[1]]), -(r[1] - r[0])))
    horas = sum(t.horas for t in tramos[a:b])
    media = sum(t.eur_kwh * t.horas for t in tramos[a:b]) / horas
    return {"i": a, "j": b, "inicio": pl.hhmm(tramos[a].inicio), "fin": pl.hhmm(tramos[b - 1].fin),
            "horas": horas, "media_eur_kwh": round(media * factor, 5),
            "media_sin_impuestos_eur_kwh": round(media, 5),
            "umbral_sin_impuestos_eur_kwh": round(umbral, 5)}


def media_mejor_bloque(ys: list, horas: int) -> float:
    """Media del bloque seguido de `horas` más barato (para comparar con el histórico)."""
    return min(st.mean(ys[k:k + horas]) for k in range(len(ys) - horas + 1))


# ------------------------------------------------------------ Open-Meteo

def puntos() -> dict:
    try:
        with open(os.path.join(DATOS, "manifiesto.json"), encoding="utf-8") as f:
            m = json.load(f)
        serie = next(s for s in m["series"] if s["id"] == "meteo_diaria_open_meteo")
        return {k: (v["latitud"], v["longitud"]) for k, v in serie["puntos"].items()}
    except (OSError, KeyError, StopIteration, ValueError):
        return dict(PUNTOS_DEFECTO)


def prevision(d: date) -> dict:
    """Media de los seis puntos para el día d. Una petición a Open-Meteo, con caché."""
    ruta = os.path.join(CACHE, f"open_meteo_{d.isoformat()}.json")
    if os.path.exists(ruta):
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)
    pts = puntos()
    q = {"latitude": ",".join(str(v[0]) for v in pts.values()),
         "longitude": ",".join(str(v[1]) for v in pts.values()),
         "daily": ",".join(VARIABLES), "timezone": "Europe/Madrid",
         "start_date": d.isoformat(), "end_date": d.isoformat()}
    req = urllib.request.Request(URL_OPEN_METEO + "?" + urllib.parse.urlencode(q, safe=","),
                                 headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        cuerpo = json.load(r)
    lista = cuerpo if isinstance(cuerpo, list) else [cuerpo]
    if len(lista) != len(pts):
        raise ValueError("Open-Meteo no devolvió todos los puntos")
    res = {"dia": d.isoformat(), "puntos": list(pts), "fuente": "Open-Meteo (previsión)",
           "consultado": datetime.now(timezone.utc).isoformat(timespec="seconds")}
    for v in VARIABLES:
        vals = [x["daily"][v][0] for x in lista]
        res[v] = round(st.mean(vals), 2) if all(isinstance(x, (int, float)) for x in vals) else None
    os.makedirs(CACHE, exist_ok=True)
    with open(ruta, "w", encoding="utf-8") as f:
        json.dump(res, f, ensure_ascii=False)
    return res


# ------------------------------------------------------------- histórico

def _precios_por_dia(carpeta: str, desde: str) -> dict:
    dias = defaultdict(list)
    for ruta in sorted(glob.glob(os.path.join(DATOS, "historico", carpeta, "*.csv"))):
        with open(ruta, encoding="utf-8") as f:
            for r in csv.DictReader(f):
                dia = r["fecha_hora_local"][:10]
                if dia >= desde:
                    dias[dia].append((int(r["fecha_hora_local"][11:13]), float(r["eur_mwh"]) / 1000))
    return dias


def cargar_historico() -> dict:
    met = defaultdict(lambda: defaultdict(list))
    n_puntos = 0
    for ruta in glob.glob(os.path.join(DATOS, "historico", "meteo_diaria_open_meteo", "*.csv")):
        n_puntos += 1
        with open(ruta, encoding="utf-8") as f:
            for r in csv.DictReader(f):
                for v in VARIABLES:
                    if r.get(v) not in (None, ""):
                        met[r["fecha"]][v].append(float(r[v]))
    meteo = {d: {v: st.mean(x[v]) for v in VARIABLES}
             for d, x in met.items() if n_puntos and all(len(x[v]) == n_puntos for v in VARIABLES)}
    return {"meteo": meteo, "pvpc": _precios_por_dia("pvpc_peninsula_horario", DESDE_PVPC),
            "spot": _precios_por_dia("spot_mercado_diario", DESDE_SPOT)}


def _en_ventana(dia: str, objetivo: date) -> bool:
    d = date.fromisoformat(dia)
    try:
        o = objetivo.replace(year=d.year)
    except ValueError:  # 29 de febrero
        o = objetivo.replace(year=d.year, day=28)
    return abs((d - o).days) <= VENTANA_DIAS and d < objetivo


def _terciles(valores: list) -> tuple[float, float]:
    v = sorted(valores)
    return v[len(v) // 3], v[(2 * len(v)) // 3]


def _comparar(dias_altos: list, dias_bajos: list, valor) -> dict | None:
    """Media de valor(día) en cada grupo, normalizada por año, y años que van en el mismo sentido."""
    if len(dias_altos) < MIN_DIAS or len(dias_bajos) < MIN_DIAS:
        return None
    por_anio = defaultdict(list)
    for d in dias_altos + dias_bajos:
        por_anio[d[:4]].append(valor(d))
    ref = {a: st.mean(v) for a, v in por_anio.items()}
    if any(abs(r) < 1e-6 for r in ref.values()):
        return None
    rel = lambda ds: st.mean(valor(d) / ref[d[:4]] for d in ds)  # noqa: E731
    efecto = rel(dias_altos) / rel(dias_bajos) - 1
    sentido, anios = 0, 0
    for a in ref:
        al = [d for d in dias_altos if d[:4] == a]
        ba = [d for d in dias_bajos if d[:4] == a]
        if len(al) >= 5 and len(ba) >= 5:
            anios += 1
            e = st.mean(valor(d) for d in al) / st.mean(valor(d) for d in ba) - 1
            sentido += (e > 0) == (efecto > 0)
    return {"efecto": efecto, "n_altos": len(dias_altos), "n_bajos": len(dias_bajos),
            "anios_mismo_sentido": sentido, "anios": anios,
            "solido": abs(efecto) >= MIN_EFECTO and anios >= 2 and sentido * 2 > anios}


def conclusiones(d: date, prev: dict | None, hist: dict, bloque: dict, factor: float) -> list[dict]:
    """Todas las conclusiones que los datos sostienen para el día d (puede ser ninguna)."""
    meteo, pvpc, spot = hist["meteo"], hist["pvpc"], hist["spot"]
    media_dia = lambda serie: (lambda dd: st.mean(p for _, p in serie[dd]))  # noqa: E731
    res = []

    def grupos(var: str, serie: dict):
        dias = [x for x in meteo if x in serie and _en_ventana(x, d)]
        if len(dias) < 3 * MIN_DIAS:
            return None
        t1, t2 = _terciles([meteo[x][var] for x in dias])
        return ([x for x in dias if meteo[x][var] >= t2], [x for x in dias if meteo[x][var] <= t1], t2)

    if prev:
        # Mucho viento: precio medio del día (PVPC desde 2024 y mercado diario desde 2014)
        v = prev.get("wind_speed_10m_max")
        for clave, serie, texto in (
                ("viento_pvpc", pvpc, "desde 2024, la luz salió de media un {p} más {s}a"),
                ("viento_spot", spot, "desde 2014, el mercado mayorista salió de media un {p} más {s}o")):
            g = grupos("wind_speed_10m_max", serie)
            if v is None or not g or v < g[2]:
                continue
            c = _comparar(g[0], g[1], media_dia(serie))
            if c and c["solido"]:
                s = "barat" if c["efecto"] < 0 else "car"
                res.append({"clave": clave, **c, "prevision": v, "umbral": round(g[2], 1),
                            "texto": (f"Mañana se espera mucho viento. En los {c['n_altos']} días así de "
                                      f"estas fechas " + texto.format(p=pct(c['efecto']), s=s) +
                                      " que en los de poco viento.")})
        # Mucho sol: precio de las horas centrales (12 a 16 h), PVPC desde 2024
        v = prev.get("shortwave_radiation_sum")
        g = grupos("shortwave_radiation_sum", pvpc)
        if v is not None and g and v >= g[2]:
            centrales = lambda dd: st.mean(p for h, p in pvpc[dd] if 12 <= h < 16)  # noqa: E731
            c = _comparar(g[0], g[1], centrales)
            if c and c["solido"] and c["efecto"] < 0:
                alto = st.median(centrales(x) for x in g[0]) * factor
                bajo = st.median(centrales(x) for x in g[1]) * factor
                res.append({"clave": "sol_centrales", **c, "prevision": v, "umbral": round(g[2], 1),
                            "mediana_soleados": round(alto, 4), "mediana_nublados": round(bajo, 4),
                            "texto": (f"Mañana se espera mucho sol. En los {c['n_altos']} días así de estas "
                                      f"fechas desde 2024, de 12 a 16 h la luz se quedó en torno a "
                                      f"{eur(alto)} €/kWh, frente a {eur(bajo)} en los días grises.")})
        # Lluvia: precio medio del día, PVPC desde 2024
        v = prev.get("precipitation_sum")
        g = grupos("precipitation_sum", pvpc)
        if v is not None and g and v >= max(g[2], 2.0):
            c = _comparar(g[0], g[1], media_dia(pvpc))
            if c and c["solido"]:
                s = "barata" if c["efecto"] < 0 else "cara"
                res.append({"clave": "lluvia_pvpc", **c, "prevision": v, "umbral": round(g[2], 1),
                            "texto": (f"Mañana se espera lluvia. En los {c['n_altos']} días lluviosos de "
                                      f"estas fechas desde 2024, la luz salió un {pct(c['efecto'])} más "
                                      f"{s} que en los secos.")})
    # El bloque de mañana frente a los mismos días de otros años (no necesita previsión)
    horas = max(1, round(bloque["horas"]))
    dias = [x for x in pvpc if _en_ventana(x, d) and len(pvpc[x]) >= 23]
    if len(dias) >= 3 * MIN_DIAS:
        hist_bloques = [media_mejor_bloque([p for _, p in pvpc[x]], horas) for x in dias]
        por_debajo = sum(b > bloque["media_sin_impuestos_eur_kwh"] for b in hist_bloques) / len(dias)
        cuando = "de mañana" if d == pl.resolver_dia("manana") else f"del {d.day}/{d.month}"
        mejores = round((1 - por_debajo) * 100)
        if por_debajo >= 0.75 and mejores == 0:
            texto = (f"Ninguno de los {len(dias)} días de estas fechas desde 2024 tuvo {horas} h "
                     f"seguidas tan baratas como las {cuando}.")
        elif por_debajo >= 0.75:
            texto = (("Un bloque así es raro" if mejores <= 10 else "Buen bloque") + f": solo el {mejores} % de los {len(dias)} días de estas fechas "
                     f"desde 2024 tuvo {horas} h seguidas más baratas que las {cuando}.")
        elif por_debajo <= 0.25:
            texto = (f"Ojo: el {mejores} % de los {len(dias)} días de estas fechas desde 2024 tuvo "
                     f"{horas} h seguidas más baratas que las {cuando}.")
        else:
            texto = None
        if texto:
            res.append({"clave": "bloque_ranking", "n": len(dias), "fraccion_mas_caros": round(por_debajo, 3),
                        "texto": texto})
    return res


def elegir(cands: list[dict], d: date, guardar: bool) -> dict | None:
    """Rota: gana la conclusión que lleva más tiempo sin salir (o la que nunca ha salido)."""
    if not cands:
        return None
    ruta = os.path.join(CACHE, "conclusiones_usadas.json")
    try:
        with open(ruta, encoding="utf-8") as f:
            usadas = json.load(f)
    except (OSError, ValueError):
        usadas = {}
    giro = d.toordinal() % len(cands)
    orden = cands[giro:] + cands[:giro]
    elegida = min(orden, key=lambda c: usadas.get(c["clave"], ""))
    if guardar:
        usadas[elegida["clave"]] = d.isoformat()
        os.makedirs(CACHE, exist_ok=True)
        with open(ruta, "w", encoding="utf-8") as f:
            json.dump(usadas, f, ensure_ascii=False, indent=1)
    return elegida


# ---------------------------------------------------------------- imagen

def imagen(d: date, tramos: list, factor: float, bloque: dict, caro: dict, media: float,
           conclusion: str | None, salida: str, con_impuestos: bool) -> str:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib.colors import LinearSegmentedColormap

    ys = [t.eur_kwh * factor for t in tramos]
    n = len(ys)
    etiquetas = [f"{pl.hhmm(t.inicio)[:2]}-{pl.hhmm(t.fin)[:2]}" for t in tramos]
    lo, hi = min(ys), max(ys)
    cmap = LinearSegmentedColormap.from_list("luz", ["#2e9e44", "#f0c419", "#d9362b"])
    colores = [cmap((y - lo) / (hi - lo) if hi > lo else 0.5) for y in ys]

    fig = plt.figure(figsize=(9, 11), dpi=150)
    ax = fig.add_axes([0.12, 0.13, 0.85, 0.52])
    i, j = bloque["i"], bloque["j"]
    ax.axvspan(i - 0.5, j - 0.5, color="#1f6fd1", alpha=0.12, zorder=0)
    barras = ax.bar(range(n), ys, width=0.8, color=colores, edgecolor="#333", linewidth=0.5, zorder=2)
    for k in range(i, j):
        barras[k].set_edgecolor("#1f4fa0")
        barras[k].set_linewidth(2.2)
    margen = max(hi, 0.001) * 0.015
    for k, y in enumerate(ys):
        ax.text(k, max(y, 0) + margen, eur(y), ha="center", va="bottom", rotation=90, fontsize=12.5,
                fontweight="bold" if i <= k < j or y == hi else "normal", zorder=3)
    ax.axhline(media, color="#555", linestyle="--", linewidth=1.2, zorder=1)
    ax.text(n - 0.4, media, f"media {eur(media)}", ha="right", va="bottom", fontsize=12, color="#444")
    ax.set_xticks(range(n))
    ax.set_xticklabels(etiquetas, rotation=90, fontsize=13)
    ax.set_xlim(-0.6, n - 0.4)
    ax.set_ylim(min(0, lo * 1.3), max(hi, 0.001) * 1.22)
    if lo < 0:
        ax.axhline(0, color="#333", linewidth=0.8)
    ax.tick_params(axis="y", labelsize=13)
    ax.set_ylabel("€/kWh" + (" con impuestos" if con_impuestos else " sin impuestos"), fontsize=12)
    ax.grid(axis="y", alpha=0.3, zorder=0)
    ax.set_axisbelow(True)
    for lado in ("top", "right"):
        ax.spines[lado].set_visible(False)
    ax.text((i + j - 1) / 2, max(hi, 0.001) * 1.2, "bloque más barato", ha="center", va="top",
            fontsize=11, color="#1f4fa0", fontweight="bold")

    dia_txt = f"{DIAS_SEMANA[d.weekday()].capitalize()} {d.strftime('%d/%m/%Y')}"
    fig.text(0.05, 0.965, f"Luz {dia_txt} · PVPC península", fontsize=19, fontweight="bold", va="top")
    fig.text(0.05, 0.915, f"Bloque más barato: {bloque['inicio']}-{bloque['fin']} · {horas_txt(bloque['horas'])}",
             fontsize=21, fontweight="bold", color="#1f4fa0", va="top")
    fig.text(0.05, 0.868, f"Precio medio del bloque: {eur_bloque(bloque['media_eur_kwh'])} €/kWh",
             fontsize=17, color="#1f4fa0", va="top")
    fig.text(0.05, 0.828, f"Hora más cara: {caro['inicio']}-{caro['fin']} a {eur(caro['eur_kwh'])} €/kWh",
             fontsize=15, color="#b0281f", va="top")
    if conclusion:
        fig.text(0.05, 0.788, "\n".join(textwrap.wrap(conclusion, 62)), fontsize=13.5, color="#333",
                 va="top", style="italic", linespacing=1.35)
    pie = ("Precios con impuesto eléctrico e IVA, sin término de potencia. " if con_impuestos
           else "Precios publicados por REE, sin impuestos. ")
    pie += "Fuente: Red Eléctrica (REData)"
    if conclusion:
        pie += "; tiempo: Open-Meteo. La conclusión compara días parecidos: es correlación, no previsión."
    fig.text(0.05, 0.015, "\n".join(textwrap.wrap(pie, 88)), fontsize=10.5, color="#666", va="bottom")
    fig.savefig(salida)
    plt.close(fig)
    return os.path.abspath(salida)


def horas_txt(h: float) -> str:
    return f"{h:g} h".replace(".", ",")


# ------------------------------------------------------------------ main

def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--dia", default="manana", help="manana (por defecto) | hoy | AAAA-MM-DD")
    ap.add_argument("--salida", help="PNG de salida (por defecto ./aviso_AAAA-MM-DD.png)")
    ap.add_argument("--contrato", help="ruta a contrato.json (por defecto, junto a puente_luz.py)")
    ap.add_argument("--sin-impuestos", action="store_true", help="precio publicado por REE, sin impuestos")
    ap.add_argument("--sin-conclusion", action="store_true", help="no pide la previsión ni cruza datos")
    ap.add_argument("--sin-estado", action="store_true", help="no apunta la conclusión usada (pruebas)")
    ap.add_argument("--reintentos", type=int, default=0, help="reintentos si aún no está publicado")
    ap.add_argument("--pausa-min", type=float, default=15, help="minutos entre reintentos (mínimo 5)")
    a = ap.parse_args(argv)
    d = pl.resolver_dia(a.dia)
    dia_txt = f"{DIAS_SEMANA[d.weekday()]} {d.day}/{d.month}"
    try:
        contrato = pl.cargar_contrato(a.contrato)
        factor = 1.0 if a.sin_impuestos else pl.factor_impuestos(contrato)
        intentos = 0
        while True:
            try:
                tramos = pl.tramos_dia(d, "pvpc")
                break
            except pl.NoPublicado:
                if intentos >= a.reintentos:
                    raise
                intentos += 1
                time.sleep(max(a.pausa_min, 5) * 60)
    except pl.NoPublicado as e:
        print(json.dumps({"ok": False, "publicado": False, "dia": d.isoformat(), "error": str(e),
                          "mensaje": (f"Los precios de la luz del {dia_txt} aún no han salido: Red Eléctrica "
                                      f"no los había publicado a las {pl.hhmm(pl.ahora())}. "
                                      "Pídemelos más tarde y te mando el bloque más barato.")},
                         ensure_ascii=False, indent=1))
        return 2
    except (pl.ErrorFuente, ValueError, OSError) as e:
        print(json.dumps({"ok": False, "dia": d.isoformat(), "error": str(e)}, ensure_ascii=False))
        return 1

    bloque = bloque_mas_barato(tramos, factor)
    k_caro = max(range(len(tramos)), key=lambda k: tramos[k].eur_kwh)
    caro = {"inicio": pl.hhmm(tramos[k_caro].inicio), "fin": pl.hhmm(tramos[k_caro].fin),
            "eur_kwh": round(tramos[k_caro].eur_kwh * factor, 5)}
    k_bar = min(range(len(tramos)), key=lambda k: tramos[k].eur_kwh)
    barata = {"inicio": pl.hhmm(tramos[k_bar].inicio), "fin": pl.hhmm(tramos[k_bar].fin),
              "eur_kwh": round(tramos[k_bar].eur_kwh * factor, 5)}
    media = sum(t.eur_kwh * t.horas for t in tramos) / sum(t.horas for t in tramos) * factor

    avisos, prev, cands, elegida = [], None, [], None
    if not a.sin_conclusion:
        try:
            prev = prevision(d)
        except (urllib.error.URLError, TimeoutError, ValueError, KeyError, OSError) as e:
            avisos.append(f"Sin previsión de Open-Meteo ({e}); solo se compara el bloque con el histórico.")
        try:
            hist = cargar_historico()
            cands = conclusiones(d, prev, hist, bloque, factor)
            elegida = elegir(cands, d, guardar=not a.sin_estado)
        except (OSError, ValueError, st.StatisticsError) as e:
            avisos.append(f"No se pudo cruzar con el histórico de datos/ ({e}).")
        if not elegida:
            avisos.append("Ninguna conclusión pasa el listón de solidez: hoy no se pone ninguna.")

    salida = a.salida or f"aviso_{d.isoformat()}.png"
    texto_conc = elegida["texto"] if elegida else None
    try:
        ruta = imagen(d, tramos, factor, bloque, caro, media, texto_conc, salida, not a.sin_impuestos)
    except ImportError:
        ruta = None
        avisos.append("Falta matplotlib: no hay imagen.")

    unidad = "€/kWh" + ("" if a.sin_impuestos else " con impuestos")
    lineas = [f"Mañana ({dia_txt}), bloque más barato: {bloque['inicio']}-{bloque['fin']} · "
              f"{horas_txt(bloque['horas'])} · media {eur_bloque(bloque['media_eur_kwh'])} {unidad}."
              if d == pl.resolver_dia("manana") else
              f"El {dia_txt}, bloque más barato: {bloque['inicio']}-{bloque['fin']} · "
              f"{horas_txt(bloque['horas'])} · media {eur_bloque(bloque['media_eur_kwh'])} {unidad}.",
              f"La hora más cara, {caro['inicio']}-{caro['fin']}, a {eur(caro['eur_kwh'])} €/kWh."]
    if texto_conc:
        lineas.append(texto_conc)
    r = {"ok": True, "publicado": True, "dia": d.isoformat(), "con_impuestos": not a.sin_impuestos,
         "factor_impuestos": round(factor, 8), "horas_dia": len(tramos),
         "bloque": {k: v for k, v in bloque.items() if k not in ("i", "j")},
         "hora_mas_barata": barata, "hora_mas_cara": caro, "media_eur_kwh": round(media, 5),
         "prevision": prev, "conclusion": elegida,
         "conclusiones_posibles": [c["clave"] for c in cands],
         "imagen": ruta, "mensaje": "\n".join(lineas), "avisos": avisos,
         "fuente": "REE REData" + ("; Open-Meteo" if prev else ""), "consultado": pl.iso(pl.ahora())}
    print(json.dumps(r, ensure_ascii=False, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
