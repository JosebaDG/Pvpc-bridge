#!/usr/bin/env python3
"""Compara el PVPC de datos/historico/ con el archivo 70 oficial de ESIOS guardado en el estudio.

No toca la red: usa las respuestas de archivo/estudio-2026-10-09/respuestas/esios/archivo70/.
Para contrastar otro día, descarga su archivo 70 (sin token) en esa carpeta como arch70_AAAA-MM-DD.json:
    https://api.esios.ree.es/archives/70/download_json?locale=es&date=AAAA-MM-DD

Uso: python3 datos/herramientas/comprobar_con_esios.py
"""
import csv
import glob
import json
import os
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
TOLERANCIA = 0.01  # €/MWh

pvpc = {}
for f in glob.glob(os.path.join(RAIZ, "datos/historico/pvpc_peninsula_horario/*.csv")):
    for r in csv.DictReader(open(f, encoding="utf-8")):
        pvpc.setdefault(r["fecha_hora_local"][:10], []).append(float(r["eur_mwh"]))

malos = 0
for f in sorted(glob.glob(os.path.join(RAIZ, "archivo/estudio-2026-10-09/respuestas/esios/archivo70/arch70_*.json"))):
    dia = os.path.basename(f)[7:17]
    filas = json.load(open(f, encoding="utf-8"))["PVPC"]
    esios = [float(x["PCB"].replace(".", "").replace(",", ".")) for x in filas]  # PCB = península
    nuestro = pvpc.get(dia)
    if not nuestro or len(nuestro) != len(esios):
        print(f"{dia}: no cuadra el número de horas ({len(esios)} en ESIOS, {len(nuestro or [])} en el CSV)")
        malos += 1
        continue
    dif = max(abs(a - b) for a, b in zip(esios, nuestro))
    ok = dif <= TOLERANCIA
    malos += not ok
    print(f"{dia}: {len(esios)} horas, diferencia máxima {dif:.3f} €/MWh -> {'coincide' if ok else 'NO COINCIDE'}")
sys.exit(1 if malos else 0)
