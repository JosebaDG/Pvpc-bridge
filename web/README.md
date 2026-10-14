# Web de Pvpc-bridge

Web estática: HTML, CSS y JavaScript tal cual, **sin compilar y sin dependencias que instalar**. La Action solo copia archivos a GitHub Pages, así que tarda segundos.

**Por qué así:** el repo ya guarda los precios en CSV (`datos/historico/`). La web los lee directamente en el navegador, de modo que no hace falta servidor ni paso de build. Se descartó usar un framework (Astro, Next) porque añade build, dependencias y mantenimiento para una web de una página.

## Quién toca qué

Cada uno trabaja en su rama `web/<agente>` y abre un PR contra `main`. Miles revisa y fusiona. Si necesitas tocar un archivo de otro, dilo en su hilo.

| Archivo o carpeta | Dueño | Hilo |
|---|---|---|
| `web/css/` (tokens, componentes, look) | Maya | equipo-agentes #3 |
| `web/js/datos.js`, `web/js/graficas.js` | Charlie | equipo-agentes #4 |
| `web/contenido/` (textos en Markdown o JSON) | Simone | equipo-agentes #5 |
| `web/index.html`, `web/js/main.js`, `.github/workflows/web.yml`, este README | Miles | equipo-agentes #3 |

## Contrato entre piezas

- `index.html` tiene una sección por bloque con su `id`: `portada`, `precio-hoy`, `historico`, `como-funciona`, `instalar`, `preguntas`, `pie`. Cada pieza rellena su sección, no la de otro.
- Maya define variables CSS en `web/css/tokens.css` (colores, tipografía, espaciado, radios). Charlie y Simone usan esas variables y no inventan colores.
- El color nunca va solo: cada tramo lleva su palabra (`.tramo--barato`, etc.), por el daltonismo.
- Siempre la variable, nunca el hex a mano: así el modo oscuro sale solo. El canvas las lee con `getComputedStyle` y vuelve a pintar al cambiar de modo.
- Los datos: `datos/historico/pvpc_peninsula_horario/<año>.csv` con columnas `fecha_hora_local,fecha_hora_utc,eur_mwh`. En Pages, la Action los copia a `web/datos/`. En local se leen desde `../datos/historico/`.
- Fuente obligatoria en el pie: el `aviso_fuente` de `datos/manifiesto.json` (REE y Open-Meteo).

## Probar en local

```
cd Pvpc-bridge && python3 -m http.server 8000
# abre http://localhost:8000/web/
```

## Publicar

La Action `web.yml` solo se lanza a mano hasta que Joseba active Pages. Publicar es decisión suya.
