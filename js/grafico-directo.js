// Carga el gráfico en directo de TradingView para la empresa elegida.
(function(){
  "use strict";
  var lastSym=null;
  window.__live=function(d){
    if(d.sym===lastSym)return;lastSym=d.sym;
    document.getElementById("t-live").textContent="Gráfico en directo de "+d.name;
    var box=document.getElementById("tv");box.innerHTML="";
    var w=document.createElement("div");w.className="tradingview-widget-container";w.style.height="100%";
    var inner=document.createElement("div");inner.className="tradingview-widget-container__widget";inner.style.height="100%";w.appendChild(inner);
    var sc=document.createElement("script");sc.type="text/javascript";sc.async=true;
    sc.src="https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    var dark=window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches;
    sc.text=JSON.stringify({autosize:true,symbol:d.sym,interval:"D",timezone:"Europe/Madrid",theme:dark?"dark":"light",style:"3",locale:"es",allow_symbol_change:true,hide_side_toolbar:true,support_host:"https://www.tradingview.com"});
    w.appendChild(sc);box.appendChild(w);
  };
})();
