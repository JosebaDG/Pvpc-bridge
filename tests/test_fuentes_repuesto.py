"""Pruebas de las fuentes de repuesto de puente_luz (sin red).

Se lanzan desde la raíz del repo con:
    python3 -m unittest discover -s tests -v

REData y la copia del repo se sustituyen por funciones falsas: nada sale a internet.
"""

import io
import json
import os
import sys
import tempfile
import unittest
import urllib.error
from datetime import date, datetime, timedelta
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import puente_luz as pl  # noqa: E402

DIA = date(2026, 11, 11)
PRECIOS = [175.3, 167.83, 151.46, 149.54, 155.65, 166.83, 184.06, 204.07, 259.64, 250.2,
           300.03, 298.31, 297.54, 298.43, 229.8, 228.49, 230.22, 228.13, 294.98, 294.83,
           296.71, 292.32, 202.96, 164.43]  # PVPC 2.0TD del 11/11/2026, €/MWh


def cuerpo_redata(d=DIA, precios=PRECIOS):
    valores = [{"value": p, "datetime": f"{d.isoformat()}T{h:02d}:00:00.000+01:00"}
               for h, p in enumerate(precios)]
    return {"included": [{"id": "1001", "type": "PVPC", "attributes": {"values": valores}}]}


def csv_historico(dias):
    filas = ["fecha_hora_local,fecha_hora_utc,eur_mwh"]
    for d, precios in dias:
        for h, p in enumerate(precios):
            local = datetime(d.year, d.month, d.day, h, tzinfo=pl.TZ)
            utc = local.astimezone(pl.timezone.utc)
            filas.append(f"{local.isoformat()},{utc.strftime('%Y-%m-%dT%H:%M:%SZ')},{p}")
    return "\n".join(filas) + "\n"


class RespuestaFalsa(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *a):
        self.close()


def error_403(*a, **k):
    raise pl.ErrorFuente("HTTP 403 de REE: <html><META NAME=\"ROBOTS\" ...")


class FuentesRepuesto(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        base = self.tmp.name
        self.parches = [
            mock.patch.object(pl, "CACHE_DIR", os.path.join(base, "cache")),
            mock.patch.object(pl, "ENTRADA_DIR", os.path.join(base, "entrada")),
        ]
        for p in self.parches:
            p.start()
        os.makedirs(pl.ENTRADA_DIR)
        self.urlopen_llamadas = []

    def tearDown(self):
        for p in self.parches:
            p.stop()
        self.tmp.cleanup()

    def espejo(self, texto=None, codigo=None):
        def falso(req, timeout=30):
            self.urlopen_llamadas.append(req.full_url)
            if codigo:
                raise urllib.error.HTTPError(req.full_url, codigo, "x", {}, None)
            return RespuestaFalsa(texto.encode("utf-8"))
        return mock.patch.object(pl.urllib.request, "urlopen", falso)

    def test_redata_bien_no_usa_repuesto(self):
        with mock.patch.object(pl, "_descargar_dia", return_value=cuerpo_redata()), \
                self.espejo(codigo=500):
            tramos = pl.tramos_dia(DIA, "pvpc")
        self.assertEqual(pl.ULTIMA_FUENTE, "redata")
        self.assertEqual(len(tramos), 24)
        self.assertEqual(self.urlopen_llamadas, [])

    def test_403_tira_del_fichero_de_entrada(self):
        with open(os.path.join(pl.ENTRADA_DIR, "redata_2026-11-11.json"), "w") as f:
            json.dump(cuerpo_redata(), f)
        with mock.patch.object(pl, "_descargar_dia", side_effect=error_403), \
                self.espejo(codigo=500):
            tramos = pl.tramos_dia(DIA, "pvpc")
        self.assertEqual(pl.ULTIMA_FUENTE, "entrada")
        self.assertAlmostEqual(min(t.eur_kwh for t in tramos), 0.14954)
        self.assertAlmostEqual(max(t.eur_kwh for t in tramos), 0.30003)
        self.assertTrue(os.path.exists(pl._marca_403()))

    def test_403_tira_de_la_copia_del_repo(self):
        texto = csv_historico([(DIA - timedelta(days=1), [200.0] * 24), (DIA, PRECIOS)])
        with mock.patch.object(pl, "_descargar_dia", side_effect=error_403), self.espejo(texto):
            tramos = pl.tramos_dia(DIA, "pvpc")
        self.assertEqual(pl.ULTIMA_FUENTE, "espejo")
        self.assertEqual([round(t.eur_kwh * 1000, 2) for t in tramos], PRECIOS)
        self.assertTrue(self.urlopen_llamadas[0].endswith("/pvpc_peninsula_horario/2026.csv"))
        # Mismo resultado que con REData: mismo formato de salida.
        with mock.patch.object(pl, "_descargar_dia", return_value=cuerpo_redata()):
            directo = pl._parsear(pl._descargar_dia(DIA), DIA, "pvpc")
        self.assertEqual(tramos, directo)

    def test_copia_del_repo_sin_el_dia_no_vale(self):
        texto = csv_historico([(DIA - timedelta(days=1), [200.0] * 24)])
        with mock.patch.object(pl, "_descargar_dia", side_effect=error_403), self.espejo(texto):
            with self.assertRaises(pl.ErrorFuente) as e:
                pl.tramos_dia(DIA, "pvpc")
        self.assertIn("REData: HTTP 403", str(e.exception))
        self.assertIn("espejo:", str(e.exception))
        self.assertFalse(os.path.exists(pl._cache_path(DIA, "pvpc")))

    def test_tras_403_no_se_insiste_con_redata(self):
        llamadas = []

        def contar(*a, **k):
            llamadas.append(1)
            error_403()

        with mock.patch.object(pl, "_descargar_dia", side_effect=contar), self.espejo(codigo=404):
            for _ in range(3):
                with self.assertRaises(pl.ErrorFuente):
                    pl.tramos_dia(DIA, "pvpc")
        self.assertEqual(len(llamadas), 1)

    def test_pausa_caduca_a_los_30_minutos(self):
        pl._apuntar_403()
        antes = os.path.getmtime(pl._marca_403()) - pl.PAUSA_TRAS_403_S - 1
        os.utime(pl._marca_403(), (antes, antes))
        self.assertFalse(pl._redata_en_pausa())

    def test_no_publicado_sigue_siendo_no_publicado(self):
        # REData contesta que mañana aún no está y la copia tampoco lo tiene:
        # esperar_publicacion debe poder seguir reintentando.
        texto = csv_historico([(DIA - timedelta(days=1), [200.0] * 24)])
        with mock.patch.object(pl, "_descargar_dia",
                               side_effect=pl.NoPublicado("REE aún no tiene precios")), \
                self.espejo(texto):
            with self.assertRaises(pl.NoPublicado):
                pl.tramos_dia(DIA, "pvpc")
        self.assertFalse(os.path.exists(pl._marca_403()))

    def test_cache_no_toca_la_red(self):
        with mock.patch.object(pl, "_descargar_dia", return_value=cuerpo_redata()):
            pl.tramos_dia(DIA, "pvpc")
        with mock.patch.object(pl, "_descargar_dia", side_effect=AssertionError("red")):
            tramos = pl.tramos_dia(DIA, "pvpc")
        self.assertEqual(pl.ULTIMA_FUENTE, "cache")
        self.assertEqual(len(tramos), 24)

    def test_cambio_de_hora_desde_la_copia(self):
        # 25/10/2026: día de 25 horas. La copia trae 25 filas y se aceptan.
        d = date(2026, 10, 25)
        ini, fin = pl.limites_dia(d)
        filas = ["fecha_hora_local,fecha_hora_utc,eur_mwh"]
        t = ini
        while t < fin:
            filas.append(f"{t.astimezone(pl.TZ).isoformat()},{t.strftime('%Y-%m-%dT%H:%M:%SZ')},100")
            t += timedelta(hours=1)
        with mock.patch.object(pl, "_descargar_dia", side_effect=error_403), \
                self.espejo("\n".join(filas)):
            tramos = pl.tramos_dia(d, "pvpc")
        self.assertEqual(len(tramos), 25)


if __name__ == "__main__":
    unittest.main()
