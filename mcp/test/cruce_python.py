"""Calcula con puente_luz.py los mismos casos que test/cruce.test.ts, con los datos guardados.

No usa la red: sustituye la descarga por los JSON de test/fixtures y fija el reloj.
Imprime un JSON con los resultados para que la prueba de TypeScript los compare.
"""
import json
import os
import sys
import tempfile
from datetime import datetime
from pathlib import Path

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parent.parent
os.environ["PUENTE_LUZ_CACHE"] = tempfile.mkdtemp(prefix="cruce_mcp_")
sys.path.insert(0, str(RAIZ))

import puente_luz as pl  # noqa: E402


def descarga_falsa(d):
    ruta = AQUI / "fixtures" / f"ree_{d.isoformat()}.json"
    if not ruta.exists():
        raise pl.NoPublicado(f"sin datos de prueba para {d}")
    return json.loads(ruta.read_text())


pl._descargar_dia = descarga_falsa
casos = json.loads(sys.argv[1])
salida = []
for caso in casos:
    fijo = datetime.fromisoformat(caso["ahora"]).astimezone(pl.timezone.utc)
    pl.ahora = lambda fijo=fijo: fijo
    args = dict(caso["args"])
    if caso["tipo"] == "resumen":
        res = pl.resumen_dia(**args, contrato={})
    elif caso["tipo"] == "bloque":
        res = pl.bloque_consecutivo(**args, contrato={}, sin_impuestos=True)
    elif caso["tipo"] == "umbral":
        res = pl.franjas_bajo_umbral(**args, contrato={}, sin_impuestos=True)
    else:
        raise SystemExit(f"tipo desconocido {caso['tipo']}")
    salida.append(res)
print(json.dumps(salida, ensure_ascii=False, default=str))
