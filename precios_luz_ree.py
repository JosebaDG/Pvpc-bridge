#!/usr/bin/env python3
"""Horas más baratas de la luz con la API pública de Red Eléctrica (REData).

Fuente: https://apidatos.ree.es  (sin token, sin registro)
Endpoint: /es/datos/mercados/precios-mercados-tiempo-real
Devuelve dos series en €/MWh:
  - PVPC (id 1001): término de energía del PVPC 2.0TD, precio al consumidor
    regulado (peajes y cargos incluidos, sin impuestos). Granularidad horaria.
  - Precio mercado spot (id 600): mercado diario mayorista (España).
    Granularidad de 15 minutos.

Uso:
  python3 precios_luz_ree.py                 # hoy, bloques de 1, 2 y 3 h
  python3 precios_luz_ree.py 2026-10-09 2.5  # fecha y duración en horas

Cobertura: REData sirve aquí el sistema peninsular (el filtro geo_limit=canarias
devolvió HTTP 400 en la prueba del 9/10/2026). Para Canarias, Baleares, Ceuta y
Melilla está ESIOS (api.esios.ree.es/indicators/1001): sin token solo da el día
en curso; con fechas pide token personal (cabecera x-api-key).
Solo biblioteca estándar de Python 3.9+.
"""
import json
import sys
import urllib.request
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

TZ = ZoneInfo("Europe/Madrid")
URL = "https://apidatos.ree.es/es/datos/mercados/precios-mercados-tiempo-real"


def descargar(dia: date) -> dict:
    q = f"?start_date={dia}T00:00&end_date={dia}T23:59&time_trunc=hour"
    req = urllib.request.Request(URL + q, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        d = json.load(r)
    if "errors" in d:
        raise RuntimeError(d["errors"])
    series = {}
    for s in d["included"]:
        vals = [(datetime.fromisoformat(v["datetime"]).astimezone(TZ), v["value"])
                for v in s["attributes"]["values"]]
        series[s["attributes"]["title"]] = sorted(vals)
    return series


def paso(vals):
    return vals[1][0] - vals[0][0] if len(vals) > 1 else timedelta(hours=1)


def bloque_mas_barato(vals, horas: float):
    """Ventana consecutiva de media mínima (consumo constante)."""
    n = round(timedelta(hours=horas) / paso(vals))
    if n < 1 or n > len(vals):
        return None
    precios = [p for _, p in vals]
    mejor = min(range(len(vals) - n + 1), key=lambda i: sum(precios[i:i + n]))
    media = sum(precios[mejor:mejor + n]) / n
    return vals[mejor][0], vals[mejor + n - 1][0] + paso(vals), media


def informe(series, duraciones):
    for nombre, vals in series.items():
        if not vals:
            continue
        p = paso(vals)
        print(f"\n== {nombre}  ({len(vals)} tramos de {int(p.total_seconds()//60)} min, €/MWh)")
        orden = sorted(vals, key=lambda x: x[1])
        fmt = lambda t: t.strftime("%H:%M")
        print("Más baratos:", ", ".join(f"{fmt(t)} {v:.2f}" for t, v in orden[:5]))
        print("Más caros:  ", ", ".join(f"{fmt(t)} {v:.2f}" for t, v in orden[-3:][::-1]))
        print(f"Media del día: {sum(v for _, v in vals)/len(vals):.2f}")
        for h in duraciones:
            b = bloque_mas_barato(vals, h)
            if b:
                ini, fin, media = b
                print(f"Mejor bloque de {h:g} h: {fmt(ini)}-{fmt(fin)}  media {media:.2f}"
                      f" (= {media/1000:.4f} €/kWh)")


if __name__ == "__main__":
    dia = date.fromisoformat(sys.argv[1]) if len(sys.argv) > 1 else datetime.now(TZ).date()
    duraciones = [float(sys.argv[2])] if len(sys.argv) > 2 else [1, 2, 3]
    print(f"Fecha {dia} | sistema peninsular | zona Europe/Madrid")
    informe(descargar(dia), duraciones)
