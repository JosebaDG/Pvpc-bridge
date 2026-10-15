# Conectar GitHub con device flow: cómo un agente sube código sin ver una contraseña

El agente que ejecuta (Charlie) trabaja en un espacio Linux en la nube, sin navegador propio y sin las credenciales de la persona. La solución, propuesta por Miles, fue una **GitHub App** autorizada con el ***device flow*** de OAuth: el mismo mecanismo que usan las teles y las consolas para iniciar sesión, en el que te muestran un código corto y tú lo introduces en otro dispositivo.

## Cómo funciona, paso a paso

1. **Se crea una GitHub App** con permisos solo para lo necesario: contenidos, issues, pull requests, estados de commits, Pages y workflows. Se instala en el repositorio y se activa en ella la opción de *device flow*.
2. **El agente pide un código.** El script [`device_login.py`](../../herramientas/github-device-flow/device_login.py) llama a `https://github.com/login/device/code` con el *client ID* de la app (que es público) y recibe un código de usuario de ocho caracteres.
3. **La persona autoriza.** Abre `https://github.com/login/device` en su móvil o su ordenador, ya con su sesión iniciada, escribe el código y acepta. El agente nunca ve su contraseña ni su segundo factor.
4. **El agente recibe un token.** Mientras tanto, el script pregunta a GitHub cada pocos segundos. Cuando la persona acepta, recibe un token de acceso y un token de renovación, y los guarda en un archivo con permisos `600` (solo legible por su propietario), fuera del repositorio. No los imprime nunca.
5. **Se usa solo dentro de los comandos.** El script [`gh_token.py`](../../herramientas/github-device-flow/gh_token.py) devuelve un token válido y lo renueva solo cuando caduca (los de las GitHub Apps duran unas ocho horas). Se usa así, sin que el token aparezca escrito en ninguna parte:

```bash
git push "https://x-access-token:$(python3 gh_token.py perfil)@github.com/USUARIO/REPO.git" mi-rama 2>&1 \
  | sed -E 's#x-access-token:[^@]*@#x-access-token:***@#'

curl -s -H "Authorization: Bearer $(python3 gh_token.py perfil)" https://api.github.com/repos/USUARIO/REPO
```

El `sed` del primer comando tapa el token si git lo repitiera en un mensaje de error.

## Por qué esta solución y no otra

| Opción | Problema |
|---|---|
| Token personal pegado en el chat | El secreto queda en el historial de la conversación. |
| URL con el token guardada en `.git/config` | El secreto queda en disco, en texto claro, y es fácil que acabe en una salida mostrada. |
| *Git bundle* que sube la persona | Funciona, pero devuelve a la persona el trabajo mecánico en cada cambio. |
| **GitHub App con *device flow*** | La persona autoriza una vez con su sesión; permisos acotados; tokens que caducan y se renuevan; se puede revocar en cualquier momento. |

## Cómo revocar el acceso

Si algún día quieres cortar el acceso del agente: en GitHub, **Settings → Applications → Authorized GitHub Apps**, busca la app y pulsa *Revoke*. También puedes desinstalarla del repositorio en **Settings → Applications → Installed GitHub Apps**.

## Reglas que nos pusimos

- El token nunca aparece en el chat, en archivos del repositorio, en `.git/config` ni en ninguna salida mostrada.
- El remoto `origin` guarda la URL limpia, sin credenciales.
- Sin borrados, sin reescribir historial y sin *force push* en `main`.

Los scripts y cómo usarlos en tu propio proyecto están en [`herramientas/github-device-flow/`](../../herramientas/github-device-flow/README.md).
