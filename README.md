# Mi simulador de inversión

Web para simular antes de invertir, apuntar lo que compras y vendes, ver cuánto vale tu cartera y preparar los números de la renta. Funciona sin servidor: abre `index.html` con doble clic.

## Pestañas

- **Simulador:** pones una cantidad (de golpe, cada mes o las dos) y una empresa, y ves tres escenarios a 1, 2, 3, 5 y 7 años, ya restados comisiones e impuestos. También lo que habría pasado de verdad, cómo le fue cada año, una comparación con otra empresa y su gráfico en directo. Debajo de los escenarios, **10.000 futuros posibles**: el ordenador simula 10.000 caminos mes a mes (subiendo y bajando tanto como la empresa en su historia y creciendo de media como la bolsa) y te dice en cuántos de cada 100 pierdes, el resultado más normal y en cuántos doblas el dinero.
  - **Anthropic** empezó a cotizar el 19/11/2026 y no tiene historia: eliges a qué empresa supones que se parece en subidas y bajadas. No sale en Probar reparto por la misma razón.
- **Bot:** un bot que opera solo con 5.000 $ ficticios y aprende de sus resultados (ver abajo).
- **Mercado:** lo que dicen los analistas de cada empresa (consenso, precio objetivo medio y su rango, cuántos dicen comprar) junto a su peor caída histórica. Las 5 primeras según el orden que elijas: más potencial según los analistas, más acuerdo entre ellos o menos caída en su historia. Datos buscados en stockanalysis.com.
- **Probar reparto:** repartes dinero entre varias empresas y ves los escenarios de la mezcla.
- **Mis inversiones:** apuntas cada compra y venta (acciones, precio, importe y comisión). Ves lo que tienes, lo que te costó, cuánto vale y cuánto ganas o pierdes. Puedes editar y borrar operaciones, importar y exportar CSV y hacer copias de seguridad.
- **Renta:** las ganancias y pérdidas de tus ventas de cada año, calculadas por FIFO como pide Hacienda, con el impuesto aproximado y la regla de los dos meses. Se descargan en CSV para la gestora.
- **Plan:** cuánto poner al mes para llegar a una cifra, y cuánto comprar de cada empresa este mes para mantener el reparto que tú elijas.

## Archivos

- `index.html`: la estructura de la página.
- `css/estilos.css`: diseño (también para móvil).
- `js/datos.js`: los datos históricos de cada empresa. Para añadir una, copia una línea y cambia sus cifras.
- `js/simulador.js`: escenarios, comparación e historial de la pestaña Simulador.
- `js/grafico-directo.js`: el gráfico en directo de TradingView.
- `js/mercado-datos.js`: el consenso de analistas de cada empresa, con fecha. Para actualizarlo, cambia las cifras.
- `js/mercado.js`: la pestaña Mercado.
- `js/cartera.js`: la pestaña Probar reparto.
- `js/inversiones.js`: guardado de datos y cálculos de tu cartera real (FIFO, posiciones, regla de los dos meses, copia de seguridad).
- `js/compras.js`: la pestaña Mis inversiones.
- `js/renta.js`: la pestaña Renta.
- `js/plan.js`: la pestaña Plan.
- `js/pestanas.js`: el cambio entre pestañas.

## Datos y privacidad

- Todo se guarda en el navegador (localStorage), solo en ese navegador de ese dispositivo. Descarga una copia de seguridad de vez en cuando.
- Para tener lo mismo en el móvil y en el ordenador: exporta el CSV (o la copia) en uno e impórtalo en el otro.
- Precios automáticos (opcional): con una clave gratuita de finnhub.io. Los dólares se pasan a euros con el cambio del BCE (frankfurter.dev). Si no, pones el precio a mano.

## Avisos

- Los datos históricos de las empresas son de mediados de noviembre de 2026 y no se actualizan solos.
- Los escenarios no son predicciones y el cálculo de la renta es una estimación: manda el informe fiscal de tu bróker. No es asesoramiento financiero.


## El bot

- `bot/bot.py`: el bot (Python, sin librerías externas). `bot/config.json`: capital, comisión, límites y lista de empresas.
- `bot/datos.json` y `bot/historial.json`: su memoria. Los crea y actualiza él mismo; no hace falta tocarlos.
- `.github/workflows/bot.yml`: cuándo se ejecuta (GitHub Actions). De lunes a viernes: 15:00 prepara el día, 15:45-21:30 opera seis veces, 22:30 repasa y aprende; el sábado hace el resumen semanal.
- Necesita el secret `FINNHUB_KEY` en el repositorio y permisos de escritura para Actions.
- Cómo aprende: cada señal que se cumple se apunta "en sombra" y, a los 5 días, se mira si habría ganado o perdido ya con comisiones. Solo compra con reglas que lleven al menos 15 casos y ganen de media.
- Probar sin internet: `BOT_MOCK=1 BOT_AHORA=2026-11-23T10:45 python3 bot/bot.py operar`.
- Es dinero ficticio y un experimento de aprendizaje, no una recomendación de inversión.
