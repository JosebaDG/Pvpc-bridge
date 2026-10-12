#!/usr/bin/env python3
"""Caché local de consultas a REData (apidatos.ree.es). Solo biblioteca estándar.

Regla por defecto: si una consulta normalizada ya está guardada, se devuelve la copia
local y NO se toca la red. Solo se descarga lo que falta o lo que se pide refrescar.

- Cada respuesta descargada se guarda tal cual, comprimida, en datos/consultas/crudo/<clave>.json.gz.
- El índice es datos/consultas/indice.json: una entrada por consulta, con la URL, la fecha de
  descarga, el tamaño y el SHA-256 del JSON sin comprimir.
- Las "semillas" son respuestas reales del estudio del 9-10-2026 (en archivo/estudio-2026-10-09/)
  cuya URL exacta no quedó registrada: su URL se dedujo del contenido y se marca como
  origen "semilla_inferida".
- Una consulta cuyo final cae a DIAS_PROVISIONAL días o menos de la fecha de descarga se marca
  como provisional: REE puede corregir esos datos. Se reutiliza igual, con aviso, salvo que se
  pida refrescar_provisionales=True o refrescar=True.
- Las respuestas de error (4xx, 5xx, HTML) no se guardan: no se reutiliza un 502 pasajero.

Este módulo no hace pausas ni reintentos: de eso se encarga actualizar_historico.py.

Uso en Python (desde datos/herramientas/):
    from cache_ree import obtener
    d = obtener("mercados", "precios-mercados-tiempo-real",
                "2026-09-01T00:00", "2026-09-30T23:59", "hour")

Uso en terminal:
    python3 cache_ree.py listar
    python3 cache_ree.py verificar
    python3 cache_ree.py obtener mercados precios-mercados-tiempo-real 2026-09-01T00:00 2026-09-30T23:59 hour
"""
from __future__ import annotations

import gzip
import hashlib
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta, timezone

# Raíz del repositorio: datos/herramientas/cache_ree.py -> ../../
RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DIR_CACHE = os.path.join(RAIZ, "datos", "consultas")
DIR_DATOS = os.path.join(DIR_CACHE, "crudo")
INDICE = os.path.join(DIR_CACHE, "indice.json")
BASE = "https://apidatos.ree.es/es/datos"
DIAS_PROVISIONAL = 3
AGENTE = "Pvpc-bridge/1.0 (+https://github.com/JosebaDG/Pvpc-bridge; descarga pausada y con cache)"


class ErrorREData(RuntimeError):
    """Error devuelto por REData. 'codigo' es el estado HTTP (0 si no hubo respuesta)."""

    def __init__(self, mensaje: str, codigo: int = 0):
        super().__init__(mensaje)
        self.codigo = codigo


def _norm_fecha(s: str) -> str:
    """'2026-09-01' o '2026-09-01T00:00:00' -> '2026-09-01T00:00'."""
    s = s.strip()
    if len(s) == 10:
        s += "T00:00"
    return s[:16]


def url_normalizada(categoria: str, widget: str, inicio: str, fin: str, time_trunc: str, **extra) -> str:
    params = {"start_date": _norm_fecha(inicio), "end_date": _norm_fecha(fin),
              "time_trunc": time_trunc.strip().lower()}
    params.update({k: str(v) for k, v in extra.items() if v is not None})
    query = urllib.parse.urlencode(sorted(params.items()))
    return f"{BASE}/{categoria.strip('/').lower()}/{widget.strip('/')}?{query}"


def clave(url: str) -> str:
    return hashlib.sha256(url.encode()).hexdigest()[:20]


def cargar_indice() -> dict:
    if os.path.exists(INDICE):
        with open(INDICE, encoding="utf-8") as f:
            return json.load(f)
    return {"version": 1, "entradas": {}}


def guardar_indice(ind: dict) -> None:
    os.makedirs(DIR_CACHE, exist_ok=True)
    tmp = INDICE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(ind, f, ensure_ascii=False, indent=1, sort_keys=True)
        f.write("\n")
    os.replace(tmp, INDICE)


def leer(ruta_rel: str) -> dict:
    ruta = os.path.join(RAIZ, ruta_rel)
    abrir = gzip.open if ruta.endswith(".gz") else open
    with abrir(ruta, "rb") as f:
        return json.loads(f.read())


def _es_provisional(fin: str, descargado: str) -> bool:
    d_fin = date.fromisoformat(_norm_fecha(fin)[:10])
    d_desc = date.fromisoformat(descargado[:10])
    return d_fin >= d_desc - timedelta(days=DIAS_PROVISIONAL)


def _descargar(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": AGENTE})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            cuerpo = r.read()
    except urllib.error.HTTPError as e:
        raise ErrorREData(f"REData devolvió {e.code}: {e.read()[:200]!r}", e.code) from None
    except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
        raise ErrorREData(f"sin respuesta de REData: {e}", 0) from None
    try:
        datos = json.loads(cuerpo)
    except ValueError:
        raise ErrorREData("REData devolvió algo que no es JSON (¿página HTML de error?)", 502) from None
    if "errors" in datos:
        raise ErrorREData(f"REData devolvió error: {datos['errors']}", 400)
    return cuerpo


def en_cache(categoria, widget, inicio, fin, time_trunc, **extra) -> dict | None:
    """Devuelve la entrada del índice si la consulta está guardada (sin tocar la red)."""
    url = url_normalizada(categoria, widget, inicio, fin, time_trunc, **extra)
    e = cargar_indice()["entradas"].get(clave(url))
    if e and os.path.exists(os.path.join(RAIZ, e["ruta"])):
        return e
    return None


def obtener(categoria, widget, inicio, fin, time_trunc, refrescar=False,
            refrescar_provisionales=False, avisar=True, devolver_origen=False, **extra):
    """Devuelve el JSON de la consulta. Con devolver_origen=True devuelve (json, 'cache'|'red')."""
    url = url_normalizada(categoria, widget, inicio, fin, time_trunc, **extra)
    k = clave(url)
    ind = cargar_indice()
    e = ind["entradas"].get(k)
    if e and os.path.exists(os.path.join(RAIZ, e["ruta"])):
        caducar = refrescar or (refrescar_provisionales and e.get("provisional"))
        if not caducar:
            if avisar and e.get("provisional"):
                print(f"[cache_ree] aviso: copia provisional del {e['guardado_en'][:10]}; "
                      "usa refrescar_provisionales=True para actualizarla", file=sys.stderr)
            d = leer(e["ruta"])
            return (d, "cache") if devolver_origen else d
    cuerpo = _descargar(url)
    os.makedirs(DIR_DATOS, exist_ok=True)
    ruta_rel = f"datos/consultas/crudo/{k}.json.gz"
    # mtime=0 para que el .gz sea reproducible (mismo contenido -> mismos bytes)
    with open(os.path.join(RAIZ, ruta_rel), "wb") as fb:
        with gzip.GzipFile(fileobj=fb, mode="wb", compresslevel=9, mtime=0) as f:
            f.write(cuerpo)
    ahora = datetime.now(timezone.utc).isoformat(timespec="seconds")
    ind = cargar_indice()
    nueva = {
        "url": url, "ruta": ruta_rel, "origen": "descarga", "guardado_en": ahora,
        "bytes_json": len(cuerpo), "sha256_json": hashlib.sha256(cuerpo).hexdigest(),
        "provisional": _es_provisional(fin, ahora),
    }
    if e and e.get("origen") == "semilla_inferida":
        nueva["sustituye_a"] = {x: e.get(x) for x in ("ruta", "origen", "guardado_en", "sha256_json")}
    ind["entradas"][k] = nueva
    guardar_indice(ind)
    d = json.loads(cuerpo)
    return (d, "red") if devolver_origen else d


def registrar_semilla(ruta_rel, categoria, widget, inicio, fin, time_trunc, guardado_en, nota, **extra):
    """Apunta el índice a una respuesta real ya guardada en el repositorio, sin copiarla."""
    url = url_normalizada(categoria, widget, inicio, fin, time_trunc, **extra)
    with open(os.path.join(RAIZ, ruta_rel), "rb") as f:
        cuerpo = f.read()
    ind = cargar_indice()
    ind["entradas"][clave(url)] = {
        "url": url, "ruta": ruta_rel, "origen": "semilla_inferida", "guardado_en": guardado_en,
        "bytes_json": len(cuerpo), "sha256_json": hashlib.sha256(cuerpo).hexdigest(),
        "provisional": _es_provisional(fin, guardado_en), "nota": nota,
    }
    guardar_indice(ind)


def verificar() -> int:
    malos = 0
    for k, e in cargar_indice()["entradas"].items():
        ruta = os.path.join(RAIZ, e["ruta"])
        if not os.path.exists(ruta):
            print("FALTA", k, e["ruta"]); malos += 1; continue
        abrir = gzip.open if ruta.endswith(".gz") else open
        with abrir(ruta, "rb") as f:
            h = hashlib.sha256(f.read()).hexdigest()
        estado = "ok" if h == e["sha256_json"] else "HASH DISTINTO"
        malos += estado != "ok"
        print(estado, k, e["ruta"])
    return malos


def listar() -> None:
    for k, e in sorted(cargar_indice()["entradas"].items(), key=lambda x: x[1]["url"]):
        marca = " provisional" if e.get("provisional") else ""
        print(f"{k}  {e['origen']}{marca}\n    {e['url']}\n    -> {e['ruta']}")


if __name__ == "__main__":
    a = sys.argv[1:]
    if not a or a[0] == "listar":
        listar()
    elif a[0] == "verificar":
        sys.exit(1 if verificar() else 0)
    elif a[0] == "obtener" and len(a) >= 6:
        d = obtener(*a[1:6], refrescar="--refrescar" in a,
                    refrescar_provisionales="--refrescar-provisionales" in a)
        for it in d.get("included", []):
            at = it["attributes"]
            for b in [c["attributes"] for c in at.get("content") or []] or [at]:
                print(b["title"], len(b.get("values") or []))
    else:
        print(__doc__)
