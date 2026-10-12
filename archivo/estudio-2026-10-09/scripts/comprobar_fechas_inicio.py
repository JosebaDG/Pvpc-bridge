import json, urllib.request, urllib.error, time
B="https://apidatos.ree.es/es/datos"
def get(path, s, e, tt, extra=""):
    url=f"{B}/{path}?start_date={s}&end_date={e}&time_trunc={tt}{extra}"
    try:
        with urllib.request.urlopen(urllib.request.Request(url,headers={"Accept":"application/json"}),timeout=40) as r:
            d=json.load(r)
        out=[]
        for it in d.get("included",[]):
            a=it["attributes"]
            if a.get("content"):
                for c in a["content"]:
                    v=c["attributes"].get("values") or []
                    out.append((c["attributes"]["title"],len(v),v[0]["datetime"] if v else None))
            else:
                v=a.get("values") or []
                out.append((a["title"],len(v),v[0]["datetime"] if v else None))
        return 200,out
    except urllib.error.HTTPError as e:
        return e.code, e.read()[:120]
tests=[
("mercados/precios-mercados-tiempo-real","2021-05-31T00:00","2021-05-31T23:59","hour"),
("mercados/precios-mercados-tiempo-real","2021-06-01T00:00","2021-06-01T23:59","hour"),
("mercados/precios-mercados-tiempo-real","2013-12-31T00:00","2013-12-31T23:59","hour"),
("mercados/precios-mercados-tiempo-real","2014-01-01T00:00","2014-01-01T23:59","hour"),
("generacion/estructura-generacion","2010-12-01T00:00","2010-12-31T23:59","day"),
("generacion/estructura-generacion","2011-01-01T00:00","2011-01-03T23:59","day"),
("mercados/precios-mercados-tiempo-real","2026-09-01T00:00","2026-10-02T23:59","hour"),
]
for t in tests:
    st,o=get(*t); print(t[0].split('/')[1],t[1][:10],t[2][:10],t[3],st, [x for x in o if isinstance(o,list) and ('PVPC' in x[0] or 'spot' in x[0] or 'E' in x[0][:2] or 'Solar fotovoltaica' in x[0])] if st==200 else o); time.sleep(0.5)
