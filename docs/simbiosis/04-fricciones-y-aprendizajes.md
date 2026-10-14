# Fricciones y aprendizajes

Lo que no salió a la primera es lo que más enseña. Cada entrada dice qué pasó, cómo se resolvió y qué nos llevamos.

## 1. La gráfica parecía de bloques de dos horas

**Qué pasó.** La primera gráfica del PVPC parecía agrupar las horas de dos en dos. La persona, que conoce bien la gráfica oficial, lo vio enseguida.

**Cómo se resolvió.** Charlie revisó el código: los 24 precios eran correctos y nunca se juntaban. El fallo era solo visual, el eje ponía una marca cada dos horas. Se cambió a una barra por hora con su precio encima.

**Aprendizaje.** Un agente puede tener los datos bien y comunicarlos mal. La validación humana contra una referencia conocida (la gráfica oficial) es lo que lo detecta. Pedir siempre una forma de comparar con la fuente.

## 2. Un precio negativo que parecía un error

**Qué pasó.** La API devolvió un PVPC de -12,63 €/MWh el 26 de septiembre de 2026. Parecía un fallo.

**Cómo se resolvió.** En vez de corregirlo o esconderlo, se marcó como "por verificar" y se contrastó después con el archivo oficial de ESIOS, hora por hora. Era real: sábado en valle, mercado casi a cero a mediodía y un ajuste de futuros muy negativo.

**Aprendizaje.** Lo raro no se borra: se etiqueta y se comprueba. La explicación acabó siendo una de las partes más instructivas de la documentación.

## 3. Lo prometido frente a lo hecho

**Qué pasó.** El informe de la API proponía un primer paquete de datos de unos 4 MB. Al montar el archivo local se vio que ese paquete nunca se llegó a descargar, y que las URL de algunas respuestas guardadas eran deducidas, porque no se había apuntado la petición exacta.

**Cómo se resolvió.** Se dejó escrito en el propio archivo qué faltaba y qué era deducido. El histórico pasa a una issue propia.

**Aprendizaje.** Un agente debe distinguir entre lo que propone y lo que ha hecho, y la persona hace bien en preguntar. Para los datos: guardar siempre la petición exacta junto a la respuesta.

## 4. Subir a GitHub desde el espacio de trabajo del agente

**Qué pasó.** El código estaba en el espacio de trabajo en la nube de Charlie, y había que llevarlo a GitHub. Se probaron varias vías:

- **Una URL con un token dentro.** Se descartó: el token habría acabado en el chat o en la configuración de git, a la vista.
- **OAuth a través de Copilot.** Fallaba.
- **Un *git bundle*.** Charlie entregó el repositorio empaquetado en un solo archivo de 38 KB, para subirlo a mano. Funcionaba, pero obligaba a la persona a hacer el trabajo mecánico.

**Cómo se resolvió.** Miles propuso una GitHub App con *device flow*. Detalles en [Conectar GitHub con *device flow*](05-conectar-github-device-flow.md).

**Aprendizaje.** Cuando un agente se atasca, otro agente con otra perspectiva puede desatascarlo. Y la solución buena es la que no expone secretos: el agente nunca vio ninguna contraseña.

## 5. "¿Solo 38 KB?"

**Qué pasó.** Joseba se extrañó del tamaño del bundle. Esperaba algo mucho mayor, contando con el histórico de datos.

**Cómo se resolvió.** Se aclaró que el histórico aún no se había descargado: el repositorio solo tenía código y documentación, que en texto pesan muy poco.

**Aprendizaje.** Al entregar algo, decir qué contiene y qué no. Un número sin contexto genera dudas.

## 6. Dos agentes que no se hablan

**Qué pasó.** Charlie y Miles no tienen canal directo. Para que uno supiera lo que proponía el otro, Joseba pegaba los mensajes a mano.

**Cómo se resolvió.** Al principio, Joseba hacía de puente. Para reducir el copiar y pegar, el estado del proyecto pasó a GitHub (issues y pull requests), y después llegó el [tablón de coordinación (#11)](https://github.com/JosebaDG/Pvpc-bridge/issues/11): cada agente avisa ahí antes de abrir una rama, deja el enlace a su PR y lee el tablón en su revisión diaria.

**Aprendizaje.** Lo que parece una limitación tiene una ventaja: ninguna decisión se toma entre máquinas sin que la persona la vea. Los mensajes entre agentes deben ser autocontenidos.

## 7. Voz frente a texto

**Qué pasó.** Casi todo se decidió hablando, en llamadas de voz. Es cómodo y rápido, pero la voz no deja un rastro fácil de consultar.

**Cómo se resolvió.** Las decisiones se pasan a texto: en los resúmenes que deja el agente, en las issues y en esta carpeta.

**Aprendizaje.** Hablar para pensar, escribir para recordar. Cada llamada importante debería acabar en una issue o en un comentario de PR.

## 8. No saturar a quien te da los datos

**Qué pasó.** Para estudiar patrones hacen falta años de datos, y la API de Red Eléctrica es gratuita y abierta.

**Cómo se resolvió.** Joseba pidió expresamente no saturar el servidor: caché local de todo lo descargado, peticiones de un mes como máximo y con pausas, y un archivo local para reutilizar respuestas.

**Aprendizaje.** Un agente puede hacer cientos de peticiones en segundos. La persona pone la cortesía; el código la hace cumplir.
