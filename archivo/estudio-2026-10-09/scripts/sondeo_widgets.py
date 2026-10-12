import json, urllib.request, urllib.error, time, sys
cats = {
 "balance": ["balance-electrico"],
 "demanda": ["evolucion","variacion-componentes","variacion-componentes-movil","ire-general","ire-general-anual","ire-general-movil","ire-industria","ire-industria-anual","ire-industria-movil","ire-servicios","ire-servicios-anual","ire-servicios-movil","ire-otras","ire-otras-anual","ire-otras-movil","demanda-maxima-diaria","demanda-maxima-horaria","perdidas-transporte","potencia-maxima-instantanea","variacion-demanda","potencia-maxima-instantanea-variacion","potencia-maxima-instantanea-variacion-historico","variacion-componentes-anual","demanda-tiempo-real"],
 "generacion": ["estructura-generacion","evolucion-renovable-no-renovable","estructura-renovables","estructura-generacion-emisiones-asociadas","evolucion-estructura-generacion-emisiones-asociadas","no-renovables-detalle-emisiones-CO2","maxima-renovable","potencia-instalada","maxima-renovable-historico","maxima-sin-emisiones-historico"],
 "intercambios": ["francia-frontera","portugal-frontera","marruecos-frontera","andorra-frontera","lineas-francia","lineas-portugal","lineas-marruecos","lineas-andorra","francia-frontera-programado","portugal-frontera-programado","marruecos-frontera-programado","andorra-frontera-programado","enlace-baleares","frontera-fisicos","todas-fronteras-fisicos","frontera-programados","todas-fronteras-programados"],
 "transporte": ["energia-no-suministrada-ens","indice-indisponibilidad","tiempo-interrupcion-medio-tim","kilometros-lineas","indice-disponibilidad","numero-cortes","ens-tim","indice-disponibilidad-total"],
 "mercados": ["componentes-precio-energia-cierre-desglose","componentes-precio","energia-gestionada-servicios-ajuste","energia-restricciones","precios-restricciones","reserva-potencia-adicional","banda-regulacion-secundaria","energia-precios-regulacion-secundaria","energia-precios-regulacion-terciaria","energia-precios-gestion-desvios","coste-servicios-ajuste","volumen-energia-servicios-ajuste-variacion","precios-mercados-tiempo-real","energia-precios-ponderados-gestion-desvios-before","energia-precios-ponderados-gestion-desvios","energia-precios-ponderados-gestion-desvios-after"],
}
rng = {"hour":("2026-10-07T00:00","2026-10-07T23:59"),"day":("2026-09-01T00:00","2026-09-07T23:59"),
       "month":("2026-01-01T00:00","2026-08-31T23:59"),"year":("2023-01-01T00:00","2025-12-31T23:59")}
def get(url):
    try:
        with urllib.request.urlopen(urllib.request.Request(url,headers={"Accept":"application/json"}),timeout=40) as r:
            b=r.read(); return r.status,b
    except urllib.error.HTTPError as e: return e.code,e.read()
    except Exception as e: return 0,str(e).encode()
def summarize(b):
    d=json.loads(b); out=[]
    for s in d.get("included",[]):
        a=s["attributes"]
        if a.get("content"):
            for c in a["content"]:
                v=c["attributes"].get("values") or []; out.append((a["title"]+">"+c["attributes"]["title"],len(v)))
        else:
            v=a.get("values") or []; out.append((a["title"],len(v)))
    return out
res=[]
for cat,ws in cats.items():
    for w in ws:
        row={"cat":cat,"w":w}
        for tt,(s,e) in rng.items():
            st,b=get(f"https://apidatos.ree.es/es/datos/{cat}/{w}?start_date={s}&end_date={e}&time_trunc={tt}")
            info={"st":st,"bytes":len(b)}
            if st==200:
                try: info["ind"]=summarize(b)
                except Exception as ex: info["err"]=str(ex)
            row[tt]=info; time.sleep(0.25)
        res.append(row)
        print(cat,w,{k:(row[k]["st"],len(row[k].get("ind",[])),max([n for _,n in row[k].get("ind",[])] or [0])) for k in rng}, flush=True)
json.dump(res,open("results.json","w"),ensure_ascii=False,indent=1)
