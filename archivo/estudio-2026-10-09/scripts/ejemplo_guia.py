import json
import time
import urllib.error
import urllib.parse
import urllib.request

BASE = "https://apidatos.ree.es/es/datos"


def redata(categoria, widget, inicio, fin, time_trunc, **geo):
    """Devuelve {titulo_serie: [(datetime, valor), ...]} o lanza RuntimeError."""
    params = {"start_date": inicio, "end_date": fin, "time_trunc": time_trunc, **geo}
    url = f"{BASE}/{categoria}/{widget}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=40) as r:
            data = json.load(r)
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"{e.code}: {e.read()[:200]!r}") from None
    series = {}
    for item in data.get("included", []):
        attrs = item["attributes"]
        # Algunos widgets anidan las series dentro de attributes.content
        bloques = [c["attributes"] for c in attrs.get("content") or []] or [attrs]
        for b in bloques:
            series[b["title"]] = [(v["datetime"], v["value"]) for v in b.get("values") or []]
    return series


if __name__ == "__main__":
    s = redata("mercados", "precios-mercados-tiempo-real",
               "2026-09-26T00:00", "2026-09-26T23:59", "hour")
    pvpc = s["PVPC"]
    print(len(pvpc), "horas; mínimo:", min(pvpc, key=lambda x: x[1]))
    time.sleep(0.5)
    g = redata("generacion", "estructura-generacion",
               "2011-01-01T00:00", "2011-01-03T23:59", "day")
    print("Eólica:", g["Eólica"])
