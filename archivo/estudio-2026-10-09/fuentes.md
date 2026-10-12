# Fuentes consultadas en el estudio

Durante el estudio se guardaron copias de algunas páginas web. No se publican: son contenido de terceros y caducan. Aquí van los enlaces a las fuentes oficiales, que son lo que hay que consultar.

## Red Eléctrica (REE)

- [REData, la API de datos de REE](https://www.ree.es/es/datos/apidatos): documentación oficial de la API (forma de las peticiones, parámetros, ejemplos). Es la página que se usó como referencia.
- [Aviso legal de ree.es](https://www.ree.es/es/aviso-legal): condiciones de uso de los contenidos y datos (apartado 5.1).
- [PVPC en ESIOS](https://www.esios.ree.es/es/pvpc): gráfica oficial del PVPC, para contrastar.
- [API de ESIOS](https://api.esios.ree.es/): documentación de la otra API de REE (indicadores, token, archivo 70).

## Normativa (BOE)

- [Real Decreto 446/2023](https://www.boe.es/buscar/doc.php?id=BOE-A-2023-14048): incorpora los futuros al PVPC (25 % en 2024, 40 % en 2025 y 55 % en 2026).
- [Circular 3/2020 de la CNMC](https://www.boe.es/buscar/act.php?id=BOE-A-2020-1066): metodología de peajes y periodos horarios.
- [Ley 38/1992 de Impuestos Especiales](https://www.boe.es/buscar/act.php?id=BOE-A-1992-28741): impuesto sobre la electricidad.

## Meteorología

- [Open-Meteo, Historical Weather API](https://open-meteo.com/en/docs/historical-weather-api): datos meteorológicos diarios usados en `datos/historico/meteo_diaria_open_meteo/`.
- [Licencia de Open-Meteo](https://open-meteo.com/en/licence): CC BY 4.0.

## Lo que no sirvió

De las copias que se hicieron, varias no aportaban nada y se descartaron sin más:

- Tres páginas de ree.es y de la documentación de REData que devolvieron "404 Not Found" (direcciones antiguas o mal deducidas).
- Una copia del BOE que resultó ser otra disposición (una sentencia del Tribunal Constitucional, BOE-A-2023-13959) en lugar del RD 446/2023: un error al deducir el identificador. El enlace correcto es el de arriba.
