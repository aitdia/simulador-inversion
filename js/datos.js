// Datos de cada empresa, de mediados de noviembre de 2026 (13-16 nov).
// Fuentes: totalrealreturns.com y chartrow.com (Sony, Santander, Amprius).
// back: rentabilidad total acumulada en % a 1, 2, 3, 5 y 10 años. yrs: años naturales en %, desde y0 (2016 si no se indica) hasta 2025.
// Campos opcionales: y0 (primer año con datos), cagr y cagrNota (ritmo histórico cuando no hay 10 años), dd:null si no hay dato.
// salida: empresas que acaban de empezar a cotizar y no tienen ningún año completo (yrs vacío, back null).
window.EMPRESAS=[
  {id:"NVDA",ytd:-12.48,sym:"NASDAQ:NVDA",name:"Nvidia",back:[-12.64,11.63,235.94,438.23,7445.64],dd:-66.34,ddNote:"desde 2012",yrs:[226.97,81.98,-30.81,76.94,122.29,125.48,-50.26,239.02,171.25,38.92]},
  {id:"ANT",ytd:null,sym:"NASDAQ:ANT",name:"Anthropic",back:null,dd:null,ddNote:"",y0:2026,yrs:[],salida:{fecha:"19/11/2026",precio:83,apertura:111.5,fuente:"CNN, CNBC y Yahoo Finanzas, 19/11/2026"}},
  {id:"SONY",ytd:5.7,sym:"NYSE:SONY",name:"Sony",back:[-8.1,null,null,11.4,368.8],dd:-50.9,ddNote:"en 10 años",yrs:[14.6,61.3,8.0,41.9,49.7,25.6,-39.3,24.3,11.9,21.3]},
  {id:"AAPL",ytd:31.51,sym:"NASDAQ:AAPL",name:"Apple",back:[30.98,59.53,95.29,143.36,1330.53],dd:-43.80,ddNote:"desde 2012",yrs:[12.48,48.46,-5.39,88.96,82.31,34.65,-26.40,49.01,30.71,9.05]},
  {id:"MSFT",ytd:9.01,sym:"NASDAQ:MSFT",name:"Microsoft",back:[4.95,25.15,46.22,62.11,899.62],dd:-37.15,ddNote:"desde 2012",yrs:[15.08,40.73,20.80,57.56,42.53,52.48,-28.02,58.19,12.93,15.58]},
  {id:"GOOGL",ytd:-5.32,sym:"NASDAQ:GOOGL",name:"Alphabet (Google)",back:[6.45,66.51,126.05,100.83,673.78],dd:-44.32,ddNote:"desde 2012",yrs:[1.86,32.93,-0.80,28.18,30.85,65.30,-39.09,58.32,36.01,65.99]},
  {id:"AMZN",ytd:15.53,sym:"NASDAQ:AMZN",name:"Amazon",back:[12.24,24.55,87.01,51.29,621.67],dd:-56.15,ddNote:"desde 2012",yrs:[10.95,55.96,28.43,23.03,76.26,2.38,-49.62,80.88,44.39,5.21]},
  {id:"META",ytd:-2.54,sym:"NASDAQ:META",name:"Meta",back:[5.57,11.36,96.80,90.04,444.31],dd:-76.74,ddNote:"desde 2012",yrs:[9.93,53.38,-25.71,56.57,33.09,23.13,-64.22,194.13,66.05,13.09]},
  {id:"TSLA",ytd:-13.23,sym:"NASDAQ:TSLA",name:"Tesla",back:[-2.93,18.16,74.43,13.28,3004.20],dd:-73.63,ddNote:"desde 2012",yrs:[-10.97,45.70,6.89,25.70,743.44,49.76,-65.03,101.72,62.52,11.36]},
  {id:"AMD",ytd:149.37,sym:"NASDAQ:AMD",name:"AMD",back:[115.38,283.39,357.28,261.12,7888.93],dd:-96.57,ddNote:"desde 1984",yrs:[295.12,-9.35,79.57,148.43,99.98,56.91,-54.99,127.59,-18.06,77.30]},
  {id:"NFLX",ytd:-35.21,sym:"NASDAQ:NFLX",name:"Netflix",back:[-45.38,-26.27,30.10,-11.62,427.39],dd:-81.99,ddNote:"desde 2002",yrs:[8.24,55.06,39.44,20.89,67.11,11.41,-51.05,65.11,83.07,5.19]},
  {id:"BABA",ytd:-35.02,sym:"NYSE:BABA",name:"Alibaba",back:[-40.41,5.26,21.84,-39.92,7.78],dd:-80.09,ddNote:"desde 2014",yrs:[8.05,96.37,-20.51,54.74,9.73,-48.96,-25.84,-10.85,11.74,75.77]},
  {id:"AMPX",ytd:-18.5,sym:"NYSE:AMPX",name:"Amprius",back:[-43.98,null,null,null,null],dd:-94.1,ddNote:"desde 2022",y0:2023,yrs:[-45.0,-28.5,205.5],cagr:-0.063,cagrNota:"desde que cotiza (2022)"},
  {id:"DIS",ytd:5.13,sym:"NYSE:DIS",name:"Disney",back:[13.82,5.55,29.54,-22.92,29.97],dd:-85.66,ddNote:"desde 1962",yrs:[0.67,4.76,3.61,33.51,25.27,-14.51,-43.91,4.26,24.44,3.30]},
  {id:"KO",ytd:45.06,sym:"NYSE:KO",name:"Coca-Cola",back:[43.51,70.39,89.76,104.83,228.73],dd:-68.24,ddNote:"desde 1962",yrs:[-0.36,14.38,6.77,20.60,2.47,11.37,10.61,-4.43,8.88,15.60]},
  {id:"SAN",ytd:4.7,sym:"NYSE:SAN",name:"Banco Santander",back:[20.4,null,null,274.4,250.6],dd:null,ddNote:"",yrs:[10.5,30.1,-28.5,-2.3,-26.3,10.4,-6.7,46.2,15.0,161.3]},
  {id:"SPY",ytd:12.29,sym:"AMEX:SPY",name:"S&P 500 (500 empresas)",back:[12.45,29.83,78.81,75.17,311.11],dd:-55.19,ddNote:"desde 1993",yrs:[12.00,21.71,-4.57,31.22,18.33,28.73,-18.18,26.18,24.89,17.72]}
];
