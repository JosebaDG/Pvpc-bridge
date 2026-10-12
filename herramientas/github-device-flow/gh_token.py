#!/usr/bin/env python3
"""Uso: gh_token.py <perfil>  -> imprime un access token válido (lo renueva si hace falta).
Solo para usarlo dentro de comandos, nunca para mostrarlo en el chat."""
import json, os, sys, time, urllib.request, urllib.parse

path = os.path.expanduser(f"~/.config/miles-github/{sys.argv[1]}.json")
t = json.load(open(path))
if time.time() > t["obtained_at"] + t.get("expires_in", 28800) - 300:
    req = urllib.request.Request("https://github.com/login/oauth/access_token",
        data=urllib.parse.urlencode({"client_id": t["client_id"], "grant_type": "refresh_token",
                                     "refresh_token": t["refresh_token"]}).encode(),
        headers={"Accept": "application/json"})
    n = json.load(urllib.request.urlopen(req, timeout=30))
    if "access_token" not in n:
        sys.exit("REFRESH_FAILED: repite device_login.py")
    n["client_id"] = t["client_id"]; n["obtained_at"] = int(time.time())
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as f:
        json.dump(n, f)
    t = n
print(t["access_token"])
