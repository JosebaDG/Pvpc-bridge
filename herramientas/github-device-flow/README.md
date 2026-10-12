# Scripts de device flow para GitHub Apps

Dos scripts de Python, sin dependencias externas, para que un agente que trabaja en un servidor sin navegador obtenga acceso a GitHub a través de una GitHub App, sin ver nunca la contraseña de la persona. Son los que se usan en este proyecto. La explicación completa está en [Conectar GitHub con *device flow*](../../docs/simbiosis/05-conectar-github-device-flow.md).

## Requisitos

- Una GitHub App con la opción **Enable Device Flow** activada, instalada en el repositorio y con los permisos mínimos que necesites.
- Su *client ID* (es público, no es un secreto).
- Python 3.

## Uso

```bash
# 1. Pedir el código. Imprime: CODE XXXX-XXXX https://github.com/login/device expira_en 899
python3 device_login.py mi-perfil CLIENT_ID_DE_TU_APP

# 2. La persona abre https://github.com/login/device, escribe el código y acepta.
#    El script sigue esperando en segundo plano y deja el estado en
#    ~/.config/miles-github/mi-perfil.status (pending, ok, expired o error).

# 3. Usar el token solo dentro de los comandos (se renueva solo al caducar).
curl -s -H "Authorization: Bearer $(python3 gh_token.py mi-perfil)" https://api.github.com/user
```

## Dónde se guarda el token

En `~/.config/miles-github/<perfil>.json`, con permisos `600` y fuera de cualquier repositorio. Los scripts nunca imprimen el token salvo `gh_token.py`, que existe precisamente para pasarlo a otro comando. No lo ejecutes suelto en una terminal compartida ni en un chat.

## Si la renovación falla

`gh_token.py` termina con `REFRESH_FAILED: repite device_login.py`. Los tokens de renovación también caducan (en las GitHub Apps, a los pocos meses) o se invalidan si se revoca la autorización. Basta con repetir el paso 1.
