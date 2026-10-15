#!/usr/bin/env python3
"""Genera web/datos/actividad.json para la gráfica «El equipo en el tiempo».

Uso (desde la raíz del repo):
    python3 herramientas/actividad-equipo/actividad.py

Qué hace:
- Pide a la API pública de GitHub la lista de PR de JosebaDG/Pvpc-bridge (abiertos y cerrados),
  sin token: una petición por cada 100 PR. Sin token GitHub deja 60 peticiones por hora y por IP,
  de sobra para esto.
- Para cada PR guarda solo datos públicos: número, título, rama, cuándo se abrió, se fusionó o
  se cerró, y quién lo hizo.
- Escribe web/datos/actividad.json. La web lee ese archivo fijo, no la API en directo.

Por qué un JSON fijo y no la API desde el navegador: cada visita gastaría peticiones del límite
de 60 por hora de esa IP, y un archivo en el repo se revisa en el PR antes de publicarse.

Quién hizo cada PR: todos salen desde la misma cuenta de GitHub, así que el autor se saca, por
este orden, de:
  1. «(Nombre)» al final del título,
  2. la rama web/<nombre>,
  3. la firma «— Nombre» al final de la descripción,
  4. la tabla MANUAL de abajo, con la fuente de cada caso.
Si un PR nuevo no encaja en ninguno, el script avisa y lo deja como «sin autor»: la regla del
equipo desde el 15/10/2026 es que todos los títulos de PR acaben en «(Nombre)».

Solo usa la biblioteca estándar de Python.
"""
import json
import os
import re
import sys
import time
import urllib.request
from datetime import datetime, timezone

REPO = 'JosebaDG/Pvpc-bridge'
AGENTES = ['Miles', 'Charlie', 'Maya', 'Simone']
SALIDA = os.path.join(os.path.dirname(__file__), '..', '..', 'web', 'datos', 'actividad.json')

# PR sin «(Nombre)», sin rama web/<nombre> y sin firma. La fuente es pública y comprobable.
MANUAL = {
    7: ('Charlie', 'issue #1, apartado «Quién»: «Charlie escribe y abre el PR»'),
    10: ('Miles', 'descripción del PR #10, «Quién ha hecho qué»: «Miles hizo los cambios y abrió el PR»'),
}


def pedir(url):
    req = urllib.request.Request(url, headers={
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'pvpc-bridge-actividad',
    })
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def autor_de(pr):
    """Devuelve (autor, cómo se sabe) o (None, motivo)."""
    titulo = pr['title'].strip()
    m = re.search(r'\((' + '|'.join(AGENTES) + r')\)\s*$', titulo)
    if m:
        return m.group(1), 'título'
    rama = pr['head']['ref']
    m = re.match(r'web/(' + '|'.join(a.lower() for a in AGENTES) + r')\b', rama)
    if m:
        return m.group(1).capitalize(), 'rama'
    cuerpo = (pr.get('body') or '').strip()
    m = re.search(r'—\s*(' + '|'.join(AGENTES) + r')\s*$', cuerpo)
    if m:
        return m.group(1), 'firma'
    if pr['number'] in MANUAL:
        return MANUAL[pr['number']][0], 'tabla manual: ' + MANUAL[pr['number']][1]
    return None, 'sin autor'


def main():
    prs, pagina = [], 1
    while True:
        lote = pedir(f'https://api.github.com/repos/{REPO}/pulls?state=all&per_page=100&page={pagina}')
        prs += lote
        if len(lote) < 100:
            break
        pagina += 1
        time.sleep(2)  # con calma, aunque sea GitHub

    salida, sin_autor = [], []
    for pr in sorted(prs, key=lambda p: p['number']):
        autor, como = autor_de(pr)
        if not autor:
            sin_autor.append(pr['number'])
        salida.append({
            'numero': pr['number'],
            'titulo': pr['title'],
            'rama': pr['head']['ref'],
            'autor': autor,
            'como_se_sabe': como,
            'abierto': pr['created_at'],
            'fusionado': pr['merged_at'],
            'cerrado': pr['closed_at'],
            'url': pr['html_url'],
        })

    datos = {
        'repo': REPO,
        'generado': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
        'fuente': f'API pública de GitHub, /repos/{REPO}/pulls (sin token)',
        'agentes': AGENTES,
        'prs': salida,
    }
    os.makedirs(os.path.dirname(SALIDA), exist_ok=True)
    with open(SALIDA, 'w', encoding='utf-8') as f:
        json.dump(datos, f, ensure_ascii=False, indent=1)
        f.write('\n')
    print(f'{len(salida)} PR guardados en {os.path.normpath(SALIDA)}')
    if sin_autor:
        print('Aviso: PR sin autor reconocible (añádelos a MANUAL con su fuente):', sin_autor, file=sys.stderr)


if __name__ == '__main__':
    main()
