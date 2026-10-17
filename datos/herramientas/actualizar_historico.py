#!/usr/bin/env python3
"""Descarga, sin molestar, solo lo que falta del histórico y regenera los CSV y el manifiesto.

Solo biblioteca estándar de Python 3.9 o superior.

Series:
  precios    PVPC 2.0TD peninsular (indicador 1001, desde el 1-6-2021) y precio del mercado
             diario o spot (indicador 600, desde el 1-1-2014). REData:
             mercados/precios-mercados-tiempo-real, time_trunc=hour, una petición por mes natural.
  generacion Generación diaria por tecnología (eólica, fotovoltaica, hidráulica, nuclear...),
             desde el 1-1-2011. REData: generacion/estructura-generacion, time_trunc=day,
             una petición por año natural, sin parámetros geo_* (ámbito nacional).
  meteo      Tiempo observado diario de Open-Meteo (no es de REE) en seis puntos, desde el
             1-1-2014. Una petición por punto y tramo de fechas.

Reglas de cortesía (no se pueden desactivar):
  - Nunca más de 31 días por petición de datos horarios ni más de un año de datos diarios.
  - Lo que ya está en la caché (datos/consultas/) no se vuelve a pedir. Solo se refrescan los
    tramos recientes (los que acaban hace 3 días o menos), y como mucho una vez cada 12 horas.
  - Pausa de al menos 3 segundos entre peticiones (5 por defecto, más un poco al azar).
  - Reintentos con espera creciente (30, 60 y 120 segundos) ante errores 5xx, 429 o sin
    respuesta; un único reintento ante un 400. Tras 3 fallos seguidos, se para todo.

Uso (desde la raíz del repositorio):
  python3 datos/herramientas/actualizar_historico.py --simular   # qué pediría, sin red
  python3 datos/herramientas/actualizar_historico.py             # descarga lo que falta
  python3 datos/herramientas/actualizar_historico.py --serie precios
  python3 datos/herramientas/actualizar_historico.py --solo-csv  # rehace CSV y manifiesto, sin red
  python3 datos/herramientas/actualizar_historico.py --serie precios --con-manana  # publicación diaria

El precio de mañana (--con-manana):
  REE publica el PVPC de mañana cada tarde (el «last-update» de sus respuestas suele marcar
  hacia las 20:45, hora peninsular). Con --con-manana, y solo a partir de las 21:00 en Madrid,
  el tramo que contiene mañana se vuelve a pedir si la copia guardada todavía no tiene el PVPC
  de mañana, aunque no hayan pasado 12 horas (como mucho una vez por hora). El último día del
  mes también se pide el tramo del mes siguiente, que solo tiene ese día. Si REE aún no lo ha
  publicado, no se insiste: se guarda lo que haya y se vuelve a intentar en la siguiente ejecución.
"""
from __future__ import annotations

import argparse
import csv
import glob
import gzip
import hashlib
import io
import json
import os
import random
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta, timezone

try:
    from zoneinfo import ZoneInfo
    MADRID = ZoneInfo("Europe/Madrid")
except Exception:  # sin base de datos de zonas horarias: se usa la hora del sistema
    MADRID = None

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cache_ree  # noqa: E402

RAIZ = cache_ree.RAIZ
DIR_HIST = os.path.join(RAIZ, "datos", "historico")
DIR_METEO_CRUDO = os.path.join(RAIZ, "datos", "consultas", "open_meteo")
MANIFIESTO = os.path.join(RAIZ, "datos", "manifiesto.json")
REGISTRO = os.path.join(RAIZ, "datos", "consultas", "registro_descargas.csv")

PAUSA_MINIMA = 3.0
ESPERAS_REINTENTO = (30, 60, 120)
MAX_FALLOS_SEGUIDOS = 3
HORAS_ENTRE_REFRESCOS = 12
HORA_MANANA = 21            # desde esta hora de Madrid se espera tener ya el PVPC de mañana
MINUTOS_ENTRE_REINTENTOS_MANANA = 60
ID_PVPC = "1001"

INICIO_SPOT = date(2014, 1, 1)
INICIO_PVPC = date(2021, 6, 1)
INICIO_GEN = date(2011, 1, 1)
INICIO_METEO = date(2014, 1, 1)
RETRASO_METEO_DIAS = 7  # el archivo de Open-Meteo (reanálisis) va unos días por detrás

PUNTOS_METEO = {
    # nombre: (latitud, longitud, por qué)
    "galicia_lugo": (43.01, -7.56, "zona eólica del interior de Galicia"),
    "castilla_leon_burgos": (42.34, -3.70, "páramos eólicos de Burgos"),
    "aragon_zaragoza": (41.65, -0.88, "valle del Ebro, cierzo y mucha eólica"),
    "castilla_la_mancha_albacete": (38.99, -1.86, "eólica y fotovoltaica de La Mancha"),
    "extremadura_badajoz": (38.88, -6.97, "mucha fotovoltaica"),
    "pais_vasco_bilbao": (43.26, -2.93, "punto de referencia del estudio inicial"),
}
VARIABLES_METEO = ("wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant,"
                   "shortwave_radiation_sum,temperature_2m_mean,precipitation_sum")
AGENTE = cache_ree.AGENTE


# ---------------------------------------------------------------- tramos que hay que tener

def _fin_de_mes(d: date) -> date:
    sig = date(d.year + (d.month == 12), d.month % 12 + 1, 1)
    return sig - timedelta(days=1)


def ahora_madrid() -> datetime:
    return datetime.now(MADRID) if MADRID else datetime.now()


def tramos_precios(hoy: date, hasta: date | None = None):
    """Un tramo por mes natural, de INICIO_SPOT al mes de `hasta` (por defecto, hoy)."""
    hasta = hasta or hoy
    d = INICIO_SPOT
    while d <= hasta:
        fin = _fin_de_mes(d)
        yield ("mercados", "precios-mercados-tiempo-real", f"{d}T00:00", f"{fin}T23:59", "hour", fin)
        d = fin + timedelta(days=1)


def tramos_generacion(hoy: date, hasta: date | None = None):
    for a in range(INICIO_GEN.year, hoy.year + 1):
        fin = date(a, 12, 31)
        yield ("generacion", "estructura-generacion", f"{a}-01-01T00:00", f"{fin}T23:59", "day", fin)


TRAMOS = {"precios": tramos_precios, "generacion": tramos_generacion}


# ---------------------------------------------------------------- red, con cortesía

class Cortes:
    def __init__(self, pausa: float):
        self.pausa = max(PAUSA_MINIMA, pausa)
        self.ultima = 0.0
        self.fallos_seguidos = 0
        self.peticiones = 0

    def esperar_turno(self):
        falta = self.ultima + self.pausa + random.uniform(0, 1.5) - time.monotonic()
        if falta > 0:
            time.sleep(falta)
        self.ultima = time.monotonic()
        self.peticiones += 1


def _registrar(serie, url, resultado, detalle=""):
    nuevo = not os.path.exists(REGISTRO)
    os.makedirs(os.path.dirname(REGISTRO), exist_ok=True)
    with open(REGISTRO, "a", newline="", encoding="utf-8") as f:
        w = csv.writer(f, lineterminator="\n")
        if nuevo:
            w.writerow(["momento_utc", "serie", "url", "resultado", "detalle"])
        w.writerow([datetime.now(timezone.utc).isoformat(timespec="seconds"), serie, url, resultado, detalle[:200]])


def _con_reintentos(cortes: Cortes, serie: str, url: str, pedir, reintentar: bool = True):
    """Ejecuta pedir() respetando pausas y reintentos. Devuelve el resultado o None.
    Con reintentar=False, un fallo no se reintenta ni cuenta para parar (días aún sin publicar)."""
    intento = 0
    while True:
        cortes.esperar_turno()
        try:
            r = pedir()
            cortes.fallos_seguidos = 0
            _registrar(serie, url, "ok")
            return r
        except cache_ree.ErrorREData as e:
            codigo = e.codigo
            _registrar(serie, url, f"error {codigo}", str(e))
            if not reintentar:
                print(f"   sin datos ({codigo}): se reintentará en la siguiente ejecución", flush=True)
                return None
            reintentable = codigo == 0 or codigo == 429 or codigo >= 500
            max_intentos = len(ESPERAS_REINTENTO) if reintentable else 1
            if intento < max_intentos:
                espera = ESPERAS_REINTENTO[intento]
                print(f"   error {codigo}; reintento en {espera} s", flush=True)
                time.sleep(espera)
                intento += 1
                continue
            cortes.fallos_seguidos += 1
            print(f"   sin datos tras {intento + 1} intentos: {e}", flush=True)
            if cortes.fallos_seguidos >= MAX_FALLOS_SEGUIDOS:
                sys.exit(f"{MAX_FALLOS_SEGUIDOS} fallos seguidos: paro para no insistir al servidor.")
            return None


def tiene_pvpc_de(entrada, dia: date) -> bool:
    """¿La copia guardada trae el PVPC completo de `dia` (23, 24 o 25 horas)?"""
    if entrada is None:
        return False
    d = cache_ree.leer(entrada["ruta"])
    for it in d.get("included", []):
        if str(it.get("id")) == ID_PVPC:
            n = sum(str(v.get("datetime", ""))[:10] == dia.isoformat() for v in it["attributes"]["values"])
            return n >= 23
    return False


def _falta_manana(entrada, ini: str, fin_tramo: date, manana: date | None) -> bool:
    """El tramo contiene mañana, la copia no trae su PVPC y hace más de una hora que se pidió."""
    if manana is None or not (date.fromisoformat(ini[:10]) <= manana <= fin_tramo):
        return False
    if entrada is None:
        return True
    if tiene_pvpc_de(entrada, manana):
        return False
    guardado = datetime.fromisoformat(entrada["guardado_en"])
    return datetime.now(timezone.utc) - guardado > timedelta(minutes=MINUTOS_ENTRE_REINTENTOS_MANANA)


def _necesita_red(entrada, fin_tramo: date, hoy: date) -> bool:
    if entrada is None:
        return True
    reciente = fin_tramo >= hoy - timedelta(days=cache_ree.DIAS_PROVISIONAL)
    if not reciente and not entrada.get("provisional"):
        return False
    guardado = datetime.fromisoformat(entrada["guardado_en"])
    return datetime.now(timezone.utc) - guardado > timedelta(hours=HORAS_ENTRE_REFRESCOS)


def descargar_redata(serie: str, hoy: date, cortes: Cortes, simular: bool, max_pet: int | None,
                     manana: date | None = None):
    pendientes = []
    for cat, w, ini, fin, tt, fin_tramo in TRAMOS[serie](hoy, manana):
        e = cache_ree.en_cache(cat, w, ini, fin, tt)
        por_manana = serie == "precios" and _falta_manana(e, ini, fin_tramo, manana)
        if por_manana or _necesita_red(e, fin_tramo, hoy):
            # Un tramo que solo tiene días futuros (el mes siguiente, el último día del mes) no se
            # reintenta: si REE aún no lo ha publicado, toca en la siguiente ejecución.
            futuro = date.fromisoformat(ini[:10]) > hoy
            pendientes.append((cat, w, ini, fin, tt, e is not None, por_manana, futuro))
    print(f"[{serie}] {len(pendientes)} peticiones pendientes", flush=True)
    for n, (cat, w, ini, fin, tt, refresco, por_manana, futuro) in enumerate(pendientes, 1):
        url = cache_ree.url_normalizada(cat, w, ini, fin, tt)
        motivo = " (para el precio de mañana)" if por_manana else " (refresco)" if refresco else ""
        print(f"  {n}/{len(pendientes)} {w} {ini[:10]} -> {fin[:10]}{motivo}", flush=True)
        if simular:
            continue
        if max_pet is not None and cortes.peticiones >= max_pet:
            print("  alcanzado --max-peticiones; el resto queda para otro día")
            return
        _con_reintentos(cortes, serie, url,
                        lambda: cache_ree.obtener(cat, w, ini, fin, tt, refrescar=refresco, avisar=False),
                        reintentar=not futuro)


def _url_meteo(lat, lon, ini: date, fin: date) -> str:
    q = urllib.parse.urlencode({"latitude": lat, "longitude": lon, "start_date": ini.isoformat(),
                                "end_date": fin.isoformat(), "daily": VARIABLES_METEO,
                                "timezone": "Europe/Madrid"})
    return f"https://archive-api.open-meteo.com/v1/archive?{q}"


def _meteo_hasta(nombre) -> date | None:
    ultimo = None
    for ruta in glob.glob(os.path.join(DIR_METEO_CRUDO, f"{nombre}_*.json.gz")):
        fin = date.fromisoformat(os.path.basename(ruta)[:-8].rsplit("_", 1)[1])
        ultimo = fin if ultimo is None or fin > ultimo else ultimo
    return ultimo


def descargar_meteo(hoy: date, cortes: Cortes, simular: bool, max_pet: int | None):
    fin = hoy - timedelta(days=RETRASO_METEO_DIAS)
    for nombre, (lat, lon, _) in PUNTOS_METEO.items():
        hasta = _meteo_hasta(nombre)
        ini = INICIO_METEO if hasta is None else hasta + timedelta(days=1)
        if ini > fin or (hasta is not None and (fin - hasta).days < 7):
            continue  # al día (no se pide por menos de una semana)
        url = _url_meteo(lat, lon, ini, fin)
        print(f"  [meteo] {nombre} {ini} -> {fin}", flush=True)
        if simular:
            continue
        if max_pet is not None and cortes.peticiones >= max_pet:
            return

        def pedir(url=url, nombre=nombre, ini=ini):
            req = urllib.request.Request(url, headers={"User-Agent": AGENTE})
            try:
                with urllib.request.urlopen(req, timeout=90) as r:
                    cuerpo = r.read()
            except urllib.error.HTTPError as e:
                raise cache_ree.ErrorREData(f"Open-Meteo devolvió {e.code}", e.code) from None
            except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
                raise cache_ree.ErrorREData(f"sin respuesta de Open-Meteo: {e}", 0) from None
            d = json.loads(cuerpo)
            if d.get("error"):
                raise cache_ree.ErrorREData(f"Open-Meteo: {d.get('reason')}", 400)
            os.makedirs(DIR_METEO_CRUDO, exist_ok=True)
            ruta = os.path.join(DIR_METEO_CRUDO, f"{nombre}_{ini}_{fin}.json.gz")
            with open(ruta, "wb") as fb, gzip.GzipFile(fileobj=fb, mode="wb", compresslevel=9, mtime=0) as f:
                f.write(cuerpo)
            return True
        _con_reintentos(cortes, "meteo", url, pedir)


# ---------------------------------------------------------------- de JSON crudo a CSV

def _utc(s: str) -> str:
    return datetime.fromisoformat(s.replace(".000", "")).astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _local(s: str) -> str:
    return s.replace(".000", "")


def _slug(t: str) -> str:
    t = unicodedata.normalize("NFKD", t).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "_", t).strip("_")


def _escribir_csv(ruta, cabecera, filas):
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    buf = io.StringIO()
    w = csv.writer(buf, lineterminator="\n")
    w.writerow(cabecera)
    w.writerows(filas)
    datos = buf.getvalue().encode("utf-8")
    with open(ruta, "wb") as f:
        f.write(datos)
    return {"ruta": os.path.relpath(ruta, RAIZ), "registros": len(filas), "bytes": len(datos),
            "sha256": hashlib.sha256(datos).hexdigest(),
            "desde": filas[0][0] if filas else None, "hasta": filas[-1][0] if filas else None}


ULTIMA_ACT = {}  # serie -> 'last-update' más reciente que declara REE en las respuestas


def _apuntar_actualizacion(serie, it):
    lu = it.get("attributes", {}).get("last-update")
    if lu and lu > ULTIMA_ACT.get(serie, ""):
        ULTIMA_ACT[serie] = lu


def _entradas(serie, hoy):
    usadas = []
    # Para los CSV se lee también el mes siguiente si ya está guardado (el último día del mes,
    # trae el PVPC de mañana).
    for cat, w, ini, fin, tt, _ in TRAMOS[serie](hoy, hoy + timedelta(days=1)):
        e = cache_ree.en_cache(cat, w, ini, fin, tt)
        if e:
            usadas.append(e)
    return usadas


def csv_precios(hoy):
    pvpc, spot = {}, {}
    entradas = _entradas("precios", hoy)
    for e in entradas:
        d = cache_ree.leer(e["ruta"])
        for it in d.get("included", []):
            destino = {"1001": pvpc, "600": spot}.get(str(it.get("id")))
            if destino is None:
                continue
            _apuntar_actualizacion("precios", it)
            for v in it["attributes"]["values"]:
                destino[_utc(v["datetime"])] = (_local(v["datetime"]), v["value"])
    archivos = {}
    for nombre, serie in (("pvpc_peninsula_horario", pvpc), ("spot_mercado_diario", spot)):
        por_anio = {}
        for u in sorted(serie):
            loc, val = serie[u]
            por_anio.setdefault(loc[:4], []).append([loc, u, val])
        archivos[nombre] = [
            _escribir_csv(os.path.join(DIR_HIST, nombre, f"{a}.csv"),
                          ["fecha_hora_local", "fecha_hora_utc", "eur_mwh"], filas)
            for a, filas in sorted(por_anio.items())]
    return archivos, entradas


def csv_generacion(hoy):
    entradas = _entradas("generacion", hoy)
    por_dia, columnas = {}, []
    for e in entradas:
        d = cache_ree.leer(e["ruta"])
        for it in d.get("included", []):
            _apuntar_actualizacion("generacion", it)
            col = _slug(it["attributes"]["title"]) + "_mwh"
            if col not in columnas:
                columnas.append(col)
            for v in it["attributes"]["values"]:
                por_dia.setdefault(v["datetime"][:10], {})[col] = v["value"]
    if "generacion_total_mwh" in columnas:  # el total, al final
        columnas.remove("generacion_total_mwh")
        columnas.append("generacion_total_mwh")
    por_anio = {}
    for dia in sorted(por_dia):
        fila = [dia] + [por_dia[dia].get(c, "") for c in columnas]
        por_anio.setdefault(dia[:4], []).append(fila)
    archivos = [_escribir_csv(os.path.join(DIR_HIST, "generacion_diaria", f"{a}.csv"), ["fecha"] + columnas, f)
                for a, f in sorted(por_anio.items())]
    return {"generacion_diaria": archivos}, entradas


def csv_meteo():
    archivos, crudos = [], []
    for nombre in PUNTOS_METEO:
        filas = {}
        cab = None
        for ruta in sorted(glob.glob(os.path.join(DIR_METEO_CRUDO, f"{nombre}_*.json.gz"))):
            with gzip.open(ruta, "rb") as f:
                raw = f.read()
            crudos.append({"ruta": os.path.relpath(ruta, RAIZ), "sha256_json": hashlib.sha256(raw).hexdigest()})
            dd = json.loads(raw)["daily"]
            claves = [k for k in dd if k != "time"]
            cab = cab or claves
            for i, dia in enumerate(dd["time"]):
                filas[dia] = [dd[k][i] if dd[k][i] is not None else "" for k in cab]
        if cab:
            archivos.append(_escribir_csv(os.path.join(DIR_HIST, "meteo_diaria_open_meteo", f"{nombre}.csv"),
                                          ["fecha"] + cab, [[d] + filas[d] for d in sorted(filas)]))
    return {"meteo_diaria_open_meteo": archivos}, crudos


# ---------------------------------------------------------------- manifiesto

def _resumen_entradas(entradas):
    if not entradas:
        return {}
    g = sorted(e["guardado_en"] for e in entradas)
    return {"consultas_en_cache": len(entradas),
            "consultas_semilla_inferida": sum(e["origen"] == "semilla_inferida" for e in entradas),
            "descargado_entre": [g[0], g[-1]],
            "bytes_json_descargados": sum(e["bytes_json"] for e in entradas)}


def generar(hoy):
    series = []
    arch_p, ent_p = csv_precios(hoy)
    arch_g, ent_g = csv_generacion(hoy)
    arch_m, crudos_m = csv_meteo()
    comun_p = {"fuente": "Red Eléctrica (REE), REData", "fuente_url": "https://www.ree.es/es/datos/apidatos",
               "endpoint": "https://apidatos.ree.es/es/datos/mercados/precios-mercados-tiempo-real",
               "parametros": {"time_trunc": "hour", "start_date": "AAAA-MM-01T00:00",
                              "end_date": "último día del mes T23:59"},
               "troceo": "una petición por mes natural (tope de REData: 31 días)",
               "unidad": "EUR/MWh, sin impuestos", **_resumen_entradas(ent_p),
               "ultima_actualizacion_declarada_por_ree": ULTIMA_ACT.get("precios")}
    series.append({"id": "pvpc_peninsula_horario", "descripcion": "PVPC 2.0TD, península, por horas (indicador 1001)",
                   "primer_dato_disponible": INICIO_PVPC.isoformat(), "paso": "1 hora", **comun_p,
                   "archivos": arch_p["pvpc_peninsula_horario"]})
    series.append({"id": "spot_mercado_diario", "descripcion": "Precio del mercado diario (spot), indicador 600",
                   "primer_dato_disponible": INICIO_SPOT.isoformat(),
                   "paso": "1 hora hasta 2024; 15 minutos desde el 1-1-2025", **comun_p,
                   "archivos": arch_p["spot_mercado_diario"],
                   "nota": "Sale de la misma respuesta que el PVPC: no cuesta peticiones extra."})
    series.append({"id": "generacion_diaria", "descripcion": "Generación diaria por tecnología, ámbito nacional",
                   "primer_dato_disponible": INICIO_GEN.isoformat(), "paso": "1 día",
                   "fuente": "Red Eléctrica (REE), REData", "fuente_url": "https://www.ree.es/es/datos/apidatos",
                   "endpoint": "https://apidatos.ree.es/es/datos/generacion/estructura-generacion",
                   "parametros": {"time_trunc": "day", "start_date": "AAAA-01-01T00:00", "end_date": "AAAA-12-31T23:59"},
                   "troceo": "una petición por año natural", "unidad": "MWh", **_resumen_entradas(ent_g),
                   "ultima_actualizacion_declarada_por_ree": ULTIMA_ACT.get("generacion"),
                   "archivos": arch_g["generacion_diaria"]})
    if arch_m["meteo_diaria_open_meteo"]:
        series.append({"id": "meteo_diaria_open_meteo",
                       "descripcion": "Tiempo observado diario en seis puntos (viento, rachas, radiación, temperatura, lluvia)",
                       "fuente": "Open-Meteo, Historical Weather API (no es de REE)",
                       "fuente_url": "https://open-meteo.com/en/docs/historical-weather-api",
                       "licencia": "CC BY 4.0 (https://open-meteo.com/en/licence)",
                       "endpoint": "https://archive-api.open-meteo.com/v1/archive",
                       "parametros": {"daily": VARIABLES_METEO, "timezone": "Europe/Madrid"},
                       "puntos": {k: {"latitud": v[0], "longitud": v[1], "motivo": v[2]} for k, v in PUNTOS_METEO.items()},
                       "unidades": "km/h, grados, MJ/m², °C, mm", "crudos": crudos_m,
                       "archivos": arch_m["meteo_diaria_open_meteo"]})
    for s in series:
        s["registros"] = sum(a["registros"] for a in s["archivos"])
        s["rango"] = [s["archivos"][0]["desde"], s["archivos"][-1]["hasta"]] if s["archivos"] else None
    man = {"generado_en": datetime.now(timezone.utc).isoformat(timespec="seconds"),
           "aviso_fuente": ("Fuente de los datos de precios y generación: Red Eléctrica (REE), REData, "
                            "https://www.ree.es/es/datos/apidatos. Uso informativo y no comercial según el "
                            "aviso legal de REE (https://www.ree.es/es/aviso-legal). Datos meteorológicos: "
                            "Open-Meteo.com, CC BY 4.0."),
           "generado_por": "datos/herramientas/actualizar_historico.py",
           "indice_de_consultas": "datos/consultas/indice.json",
           "series": series}
    with open(MANIFIESTO, "w", encoding="utf-8") as f:
        json.dump(man, f, ensure_ascii=False, indent=1)
        f.write("\n")
    for s in series:
        print(f"  {s['id']}: {s['registros']} registros, {len(s['archivos'])} archivos, {s['rango']}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--serie", choices=["precios", "generacion", "meteo", "todas"], default="todas")
    ap.add_argument("--pausa", type=float, default=5.0, help="segundos entre peticiones (mínimo 3)")
    ap.add_argument("--max-peticiones", type=int, default=None, help="tope de peticiones en esta ejecución")
    ap.add_argument("--simular", action="store_true", help="lista lo que pediría, sin tocar la red")
    ap.add_argument("--solo-csv", action="store_true", help="no descarga: rehace CSV y manifiesto desde la caché")
    ap.add_argument("--con-manana", action="store_true",
                    help=f"desde las {HORA_MANANA}:00 en Madrid, pide el PVPC de mañana si aún no está guardado")
    a = ap.parse_args()
    ahora = ahora_madrid()
    hoy = ahora.date()
    manana = None
    if a.con_manana:
        if ahora.hour >= HORA_MANANA:
            manana = hoy + timedelta(days=1)
            print(f"precio de mañana: se busca el del {manana}", flush=True)
        else:
            print(f"precio de mañana: antes de las {HORA_MANANA}:00 en Madrid no se busca", flush=True)
    if not a.solo_csv:
        cortes = Cortes(a.pausa)
        for s in (["precios", "generacion", "meteo"] if a.serie == "todas" else [a.serie]):
            if s == "meteo":
                descargar_meteo(hoy, cortes, a.simular, a.max_peticiones)
            else:
                descargar_redata(s, hoy, cortes, a.simular, a.max_peticiones, manana)
        print(f"peticiones hechas: {cortes.peticiones}")
    if not a.simular:
        generar(hoy)
    if manana is not None:
        e = next((cache_ree.en_cache(cat, w, ini, fin, tt)
                  for cat, w, ini, fin, tt, fin_t in tramos_precios(hoy, manana)
                  if date.fromisoformat(ini[:10]) <= manana <= fin_t), None)
        tiene = tiene_pvpc_de(e, manana)
        print(f"precio de mañana ({manana}): {'guardado' if tiene else 'todavía no publicado por REE'}")
        salida = os.environ.get("GITHUB_OUTPUT")
        if salida:
            with open(salida, "a", encoding="utf-8") as f:
                f.write(f"manana={'si' if tiene else 'no'}\n")


if __name__ == "__main__":
    main()
