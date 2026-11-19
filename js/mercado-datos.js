// Consenso de analistas de cada empresa, buscado en stockanalysis.com el 19 de noviembre de 2026.
// Cada empresa trae su propia fecha: la del precio que usa la fuente.
// votos: [compra fuerte, compra, mantener, venta, venta fuerte] del último mes.
// Para actualizar: cambia las cifras y la fecha de cada línea.
window.MERCADO={
  consultado:"2026-11-19",
  fuente:"stockanalysis.com",
  empresas:[
    {id:"NVDA",fecha:"2026-11-18",moneda:"$",precio:151.15,objetivo:247.76,bajo:130,alto:425,analistas:62,consenso:"Compra",votos:[34,11,15,0,2],url:"https://stockanalysis.com/stocks/nvda/forecast"},
    {id:"SONY",fecha:"2026-09-14",moneda:"¥",precio:3771,objetivo:4866,bajo:3800,alto:6030,analistas:23,consenso:"Compra fuerte",votos:[17,4,2,0,0],url:"https://stockanalysis.com/quote/tyo/6758/forecast/",nota:"Datos de la bolsa de Tokio, en yenes"},
    {id:"AAPL",fecha:"2026-11-13",moneda:"$",precio:356.27,objetivo:346.37,bajo:250,alto:425,analistas:45,consenso:"Compra",votos:[20,6,13,3,3],url:"https://stockanalysis.com/stocks/aapl/forecast/"},
    {id:"MSFT",fecha:"2026-11-13",moneda:"$",precio:523.88,objetivo:636.12,bajo:440,alto:870,analistas:58,consenso:"Compra fuerte",votos:[41,12,5,0,0],url:"https://stockanalysis.com/stocks/msft/forecast"},
    {id:"GOOGL",fecha:"2026-11-13",moneda:"$",precio:295.77,objetivo:400.37,bajo:300,alto:500,analistas:58,consenso:"Compra fuerte",votos:[43,10,5,0,0],url:"https://stockanalysis.com/stocks/googl/forecast"},
    {id:"AMZN",fecha:"2026-11-13",moneda:"$",precio:266.66,objetivo:326.29,bajo:230,alto:405,analistas:62,consenso:"Compra fuerte",votos:[45,14,3,0,0],url:"https://stockanalysis.com/stocks/amzn/forecast"},
    {id:"META",fecha:"2026-11-06",moneda:"$",precio:610.15,objetivo:850.10,bajo:629.06,alto:1050,analistas:61,consenso:"Compra fuerte",votos:[45,9,6,0,1],url:"https://stockanalysis.com/stocks/meta/forecast"},
    {id:"ANT",fecha:"2026-11-19",moneda:"$",precio:111.5,objetivo:null,bajo:null,alto:null,analistas:null,consenso:null,votos:null,url:"https://www.cnn.com/2026/11/19/business/live-news/anthropic-ipo",nota:"Empezó a cotizar el 19/11/2026: salió a 83 $ y su primer precio en bolsa fue 111,50 $. Aún no hay precios objetivo de analistas; los bancos que dirigen una salida a bolsa suelen esperar unas semanas para publicarlos"},
    {id:"TSLA",fecha:"2026-11-13",moneda:"$",precio:390.22,objetivo:null,bajo:null,alto:null,analistas:null,consenso:null,votos:null,url:"https://stockanalysis.com/stocks/tsla/ratings",nota:"La fuente no mostraba un consenso completo de Tesla"},
    {id:"AMD",fecha:"2026-11-13",moneda:"$",precio:534.06,objetivo:657.74,bajo:525,alto:1250,analistas:54,consenso:"Compra fuerte",votos:[42,5,7,0,0],url:"https://stockanalysis.com/stocks/amd/forecast/"},
    {id:"NFLX",fecha:"2026-11-13",moneda:"$",precio:62.15,objetivo:84.76,bajo:57,alto:126,analistas:51,consenso:"Compra",votos:[26,7,16,0,2],url:"https://stockanalysis.com/stocks/nflx/forecast/"},
    {id:"BABA",fecha:"2026-10-26",moneda:"$",precio:100.25,objetivo:185.86,bajo:95.76,alto:239.63,analistas:41,consenso:"Compra fuerte",votos:[31,8,1,1,0],url:"https://stockanalysis.com/stocks/baba/forecast/"},
    {id:"AMPX",fecha:"2026-10-26",moneda:"$",precio:8.35,objetivo:22.10,bajo:14,alto:30,analistas:11,consenso:"Compra fuerte",votos:[10,1,0,0,0],url:"https://stockanalysis.com/stocks/ampx/forecast/",nota:"Pocos analistas: un solo cambio mueve mucho la media"},
    {id:"DIS",fecha:"2026-11-19",moneda:"$",precio:120.74,objetivo:131.34,bajo:86,alto:144,analistas:32,consenso:"Compra",votos:[22,5,4,0,1],url:"https://stockanalysis.com/stocks/DIS/forecast"},
    {id:"KO",fecha:"2026-11-06",moneda:"$",precio:95.67,objetivo:97.75,bajo:80,alto:106,analistas:25,consenso:"Compra",votos:[13,7,4,1,0],url:"https://stockanalysis.com/stocks/ko/forecast/"},
    {id:"SAN",fecha:"2026-10-05",moneda:"€",precio:12.32,objetivo:13.60,bajo:11.30,alto:15.30,analistas:20,consenso:"Compra",votos:[11,6,3,0,0],url:"https://stockanalysis.com/quote/bme/SAN/forecast/",nota:"Datos de la bolsa de Madrid, en euros"}
  ]
};
