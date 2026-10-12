#!/usr/bin/env python3
"""Device flow para GitHub Apps. Uso: device_login.py <perfil> <client_id>
Guarda el token en ~/.config/miles-github/<perfil>.json (chmod 600). Nunca imprime el token."""
import json, os, sys, time, urllib.request, urllib.parse

profile, client_id = sys.argv[1], sys.argv[2]
cfg_dir = os.path.expanduser("~/.config/miles-github")
os.makedirs(cfg_dir, mode=0o700, exist_ok=True)
state_file = os.path.join(cfg_dir, f"{profile}.status")

def post(url, data):
    req = urllib.request.Request(url, data=urllib.parse.urlencode(data).encode(), headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)

def status(msg):
    with open(state_file, "w") as f:
        f.write(msg + "\n")

d = post("https://github.com/login/device/code", {"client_id": client_id})
if "device_code" not in d:
    print("ERROR", d); sys.exit(1)
print("CODE", d["user_code"], d["verification_uri"], "expira_en", d["expires_in"], flush=True)
status("pending")

if os.fork():
    sys.exit(0)

interval = d.get("interval", 5)
deadline = time.time() + d["expires_in"]
while time.time() < deadline:
    time.sleep(interval)
    try:
        t = post("https://github.com/login/oauth/access_token", {
            "client_id": client_id, "device_code": d["device_code"],
            "grant_type": "urn:ietf:params:oauth:grant-type:device_code"})
    except Exception:
        continue
    if "access_token" in t:
        t["client_id"] = client_id
        t["obtained_at"] = int(time.time())
        path = os.path.join(cfg_dir, f"{profile}.json")
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "w") as f:
            json.dump(t, f)
        status("ok")
        sys.exit(0)
    err = t.get("error")
    if err == "slow_down":
        interval += 5
    elif err != "authorization_pending":
        status("error " + str(err)); sys.exit(1)
status("expired")
