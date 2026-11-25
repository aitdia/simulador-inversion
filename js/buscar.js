// Pestaña Buscar: escribe una acción y ves su precio, gráfico, números, analistas, resultados y noticias.
// Datos de Finnhub (con la clave gratuita guardada en este navegador) y gráfico de TradingView.
(function(){
  "use strict";
  var $=function(id){return document.getElementById(id);};
  var API="https://finnhub.io/api/v1/";
  var actual=null,pedido=0,BOT=null;

  function clave(){return window.INV&&window.INV.ajustes&&window.INV.ajustes.clave||"";}
  function esc(s){return String(s==null?"":s).replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c];});}
  function fh(ruta){
    var k=clave();if(!k)return Promise.reject(new Error("sin clave"));
    return fetch(API+ruta+(ruta.indexOf("?")>-1?"&":"?")+"token="+encodeURIComponent(k)).then(function(r){
      if(r.status===429)throw new Error("límite");if(r.status===401||r.status===403)throw new Error("sin acceso");
      if(!r.ok)throw new Error("http "+r.status);return r.json();});
  }
  function suave(p){return p.then(function(x){return x;},function(){return null;});}
  var SIMB={USD:"$",EUR:"€",JPY:"¥",GBP:"£",CNY:"¥",HKD:"HK$",CAD:"C$",CHF:"CHF",KRW:"₩",TWD:"NT$",INR:"₹",AUD:"A$"};
  function num(x,d){return x==null||isNaN(x)?"—":Number(x).toLocaleString("es-ES",{minimumFractionDigits:d==null?2:d,maximumFractionDigits:d==null?2:d,useGrouping:"always"});}
  function mon(x,cur){return x==null||isNaN(x)?"—":num(x)+" "+(SIMB[cur]||cur||"$");}
  function pc(x,signo){return x==null||isNaN(x)?"—":((signo!==false&&x>0)?"+":"")+num(x,1)+" %";}
  function cls(x){return x>0?"up":x<0?"down":"";}
  function fechaEs(f){if(!f)return "—";var p=String(f).slice(0,10).split("-");return p[2]+"/"+p[1]+"/"+p[0];}
  function tamano(millones,cur){
    if(!millones)return "—";var s=SIMB[cur]||cur||"$";
    if(millones>=1e6)return num(millones/1e6,2)+" billones "+s;
    if(millones>=1e3)return num(millones/1e3,1)+" mil millones "+s;
    return num(millones,0)+" millones "+s;
  }

  // ---------- Datos propios de la web (si la empresa está en la lista) ----------
  function local(sym){
    var e=(window.EMPRESAS||[]).filter(function(x){return x.id===sym||String(x.sym).split(":")[1]===sym;})[0]||null;
    var m=e&&window.MERCADO?(window.MERCADO.empresas||[]).filter(function(x){return x.id===e.id;})[0]:null;
    return {e:e,m:m};
  }
  function cargarBot(){
    if(BOT)return Promise.resolve(BOT);
    return fetch("bot/datos.json?v="+Date.now(),{cache:"no-store"}).then(function(r){return r.ok?r.json():null;}).then(function(d){BOT=d;return d;}).catch(function(){return null;});
  }

  // ---------- Buscador ----------
  var temp=null;
  $("bs-q").addEventListener("input",function(){
    clearTimeout(temp);var q=this.value.trim();
    if(q.length<1||!clave())return;
    temp=setTimeout(function(){
      suave(fh("search?q="+encodeURIComponent(q))).then(function(r){
        if(!r||!r.result)return;
        $("bs-lista").innerHTML=ordenar(r.result).slice(0,10).map(function(x){
          return '<option value="'+esc(x.symbol)+'">'+esc(x.description)+'</option>';}).join("");
      });
    },300);
  });
  function ordenar(lista){
    var ok=["Common Stock","ADR","ETP","ETF","REIT","Closed-End Fund"];
    return lista.filter(function(x){return ok.indexOf(x.type)>-1||!x.type;})
      .sort(function(a,b){return (a.symbol.indexOf(".")>-1)-(b.symbol.indexOf(".")>-1);});
  }
  function resolver(q){
    q=q.trim();if(!q)return Promise.resolve(null);
    var ql=q.toLowerCase();
    var e=(window.EMPRESAS||[]).filter(function(x){return x.name.toLowerCase()===ql||x.id.toLowerCase()===ql;})[0];
    if(e)return Promise.resolve(String(e.sym).split(":")[1]||e.id);
    if(/^[A-Za-z0-9.\-]{1,10}$/.test(q)&&q===q.toUpperCase())return Promise.resolve(q);
    if(!clave())return Promise.resolve(q.toUpperCase());
    return suave(fh("search?q="+encodeURIComponent(q))).then(function(r){
      if(!r||!r.result||!r.result.length)return q.toUpperCase();
      var l=ordenar(r.result);
      var exacto=l.filter(function(x){return x.symbol.toUpperCase()===q.toUpperCase();})[0];
      return (exacto||l[0]||r.result[0]).symbol;
    });
  }
  $("bs-form").addEventListener("submit",function(ev){
    ev.preventDefault();
    var q=$("bs-q").value;$("bs-msg").textContent="Buscando…";
    resolver(q).then(function(sym){if(sym)abrir(sym);else $("bs-msg").textContent="";});
  });
  $("bs-guardar").addEventListener("click",function(){
    var v=$("bs-clave").value.trim();if(!v||!window.INV)return;
    window.INV.ajustes.clave=v;window.INV.guardar();$("bs-clave").value="";
    estadoClave();if(actual)abrir(actual);
  });
  function estadoClave(){$("bs-sin-clave").hidden=!!clave();}

  // Recientes
  function recientes(){try{return JSON.parse(localStorage.getItem("buscar-recientes"))||[];}catch(e){return [];}}
  function guardarReciente(sym){
    var r=recientes().filter(function(x){return x!==sym;});r.unshift(sym);r=r.slice(0,8);
    try{localStorage.setItem("buscar-recientes",JSON.stringify(r));}catch(e){}
    pintarRecientes();
  }
  function pintarRecientes(){
    var r=recientes();
    if(!r.length)r=["ANT","NVDA","AAPL","SONY","AMPX","SPY"];
    $("bs-recientes").innerHTML=r.map(function(s){return '<button type="button" data-s="'+esc(s)+'"'+(s===actual?' aria-pressed="true"':'')+'>'+esc(s)+'</button>';}).join("");
  }
  $("bs-recientes").addEventListener("click",function(e){var b=e.target.closest("button");if(b){$("bs-q").value=b.dataset.s;abrir(b.dataset.s);}});

  // ---------- Gráfico ----------
  var BOLSAS={MC:"BME",T:"TSE",L:"LSE",DE:"XETR",F:"FWB",PA:"EURONEXT",AS:"EURONEXT",BR:"EURONEXT",MI:"MIL",HK:"HKEX",TO:"TSX",SW:"SIX",KS:"KRX",SS:"SSE",SZ:"SZSE",AX:"ASX"};
  function simboloTV(sym){
    var p=sym.split(".");
    if(p.length===2&&BOLSAS[p[1]])return BOLSAS[p[1]]+":"+(p[1]==="HK"?String(+p[0]):p[0]);
    return sym;
  }
  function grafico(sym){
    var box=$("bs-tv");box.innerHTML="";
    var w=document.createElement("div");w.className="tradingview-widget-container";w.style.height="100%";
    var inner=document.createElement("div");inner.className="tradingview-widget-container__widget";inner.style.height="100%";w.appendChild(inner);
    var sc=document.createElement("script");sc.async=true;sc.src="https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    var dark=window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches;
    sc.text=JSON.stringify({autosize:true,symbol:simboloTV(sym),interval:"D",range:"12M",timezone:"Europe/Madrid",theme:dark?"dark":"light",style:"3",locale:"es",allow_symbol_change:true,hide_side_toolbar:false,support_host:"https://www.tradingview.com"});
    w.appendChild(sc);box.appendChild(w);
  }

  // ---------- Abrir una acción ----------
  function abrir(sym){
    sym=String(sym).trim().toUpperCase();if(!sym)return;
    var yo=++pedido;actual=sym;guardarReciente(sym);estadoClave();
    if(location.hash!=="#buscar")location.hash="#buscar";
    $("bs-res").hidden=false;$("bs-msg").textContent=clave()?"Cargando "+sym+"…":"";
    $("bs-nombre").textContent=sym;$("bs-sub").textContent="";$("bs-logo").hidden=true;
    ["bs-p","bs-dp","bs-hora"].forEach(function(id){$(id).textContent="";});
    ["bs-dia","bs-rango","bs-num","bs-rent","bs-anios","bs-an","bs-res-tri","bs-bot","bs-not","bs-acciones"].forEach(function(id){$(id).innerHTML="";});
    grafico(sym);
    var hoy=new Date(),hace=new Date(Date.now()-10*864e5),despues=new Date(Date.now()+150*864e5);
    var iso=function(d){return d.toISOString().slice(0,10);};
    var peticiones=clave()?[
      suave(fh("quote?symbol="+encodeURIComponent(sym))),
      suave(fh("stock/profile2?symbol="+encodeURIComponent(sym))),
      suave(fh("stock/metric?metric=all&symbol="+encodeURIComponent(sym))),
      suave(fh("stock/recommendation?symbol="+encodeURIComponent(sym))),
      suave(fh("stock/earnings?symbol="+encodeURIComponent(sym))),
      suave(fh("calendar/earnings?from="+iso(hoy)+"&to="+iso(despues)+"&symbol="+encodeURIComponent(sym))),
      suave(fh("company-news?symbol="+encodeURIComponent(sym)+"&from="+iso(hace)+"&to="+iso(hoy)))
    ]:[null,null,null,null,null,null,null].map(function(){return Promise.resolve(null);});
    Promise.all(peticiones.concat([cargarBot()])).then(function(r){
      if(yo!==pedido)return;
      pintar(sym,{q:r[0],perfil:r[1],met:r[2]&&r[2].metric,serie:r[2]&&r[2].series,rec:r[3],res:r[4],cal:r[5],not:r[6],bot:r[7]});
    });
  }

  function pintar(sym,x){
    var loc=local(sym),q=x.q&&x.q.c?x.q:null,pf=x.perfil&&x.perfil.name?x.perfil:null,m=x.met||{};
    var curQ=sym.indexOf(".")>-1&&pf?pf.currency:"USD";
    var curM=pf?(pf.currency||curQ):curQ;                 // los números de la empresa van en la moneda de su bolsa de origen
    var mezcla=curM!==curQ;
    var msg="";
    if(!clave())msg="Sin clave de Finnhub solo se ve el gráfico.";
    else if(!q&&!pf)msg="No encuentro «"+sym+"» o no hay conexión con Finnhub (si estás en España y hay fútbol, puede ser el bloqueo de LaLiga). El gráfico de abajo puede que sí salga.";
    else if(!q)msg="El plan gratuito de Finnhub no da el precio de esta bolsa. Prueba a buscar la misma empresa en EE. UU. (sin punto en el símbolo) o mira el gráfico.";
    $("bs-msg").textContent=msg;

    // Cabecera
    $("bs-nombre").textContent=pf?pf.name:(loc.e?loc.e.name:sym);
    $("bs-sub").textContent=[sym,pf&&pf.exchange,pf&&pf.finnhubIndustry,pf&&pf.country].filter(Boolean).join(" · ");
    if(pf&&pf.logo){$("bs-logo").src=pf.logo;$("bs-logo").hidden=false;}
    if(q){
      $("bs-p").textContent=mon(q.c,curQ);
      $("bs-dp").innerHTML='<span class="'+cls(q.d)+'">'+(q.d>0?"+":"")+num(q.d)+" ("+pc(q.dp)+") hoy</span>";
      $("bs-hora").textContent=q.t?"Precio de las "+new Date(q.t*1000).toLocaleString("es-ES",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}):"";
      $("bs-dia").innerHTML=[["Apertura",q.o],["Máximo de hoy",q.h],["Mínimo de hoy",q.l],["Cierre anterior",q.pc]].map(function(a){
        return '<div class="fact"><span>'+a[0]+'</span><b>'+mon(a[1],curQ)+'</b></div>';}).join("");
    }
    // Rango de 52 semanas
    var hi=m["52WeekHigh"],lo=m["52WeekLow"];
    if(hi&&lo){
      var dentro=q&&!mezcla?Math.max(0,Math.min(1,(q.c-lo)/(hi-lo))):null;
      $("bs-rango").innerHTML='<div class="small"><b>Último año:</b> entre '+mon(lo,curM)+' ('+fechaEs(m["52WeekLowDate"])+') y '+mon(hi,curM)+' ('+fechaEs(m["52WeekHighDate"])+')'+
        (dentro!=null?'. Ahora está un <b>'+pc((q.c/hi-1)*100)+'</b> respecto a su máximo.':(mezcla?' en su bolsa de origen ('+esc(curM)+').':'.'))+'</div>'+
        (dentro!=null?'<div class="bs-barra" role="img" aria-label="Posición del precio entre el mínimo y el máximo del año"><span style="left:'+(dentro*100).toFixed(1)+'%"></span></div><div class="bs-barra-ej small muted"><span>mínimo</span><span>máximo</span></div>':'');
    }
    // Botones
    var b=[];
    if(loc.e)b.push('<button type="button" class="btn sec" data-sim="'+esc(loc.e.id)+'">Simularla</button>');
    b.push('<a class="btn sec" target="_blank" rel="noopener" href="https://www.tradingview.com/symbols/'+esc(simboloTV(sym).replace(":","-"))+'/">TradingView</a>');
    b.push('<a class="btn sec" target="_blank" rel="noopener" href="https://finance.yahoo.com/quote/'+esc(sym)+'">Yahoo Finance</a>');
    if(pf&&pf.weburl)b.push('<a class="btn sec" target="_blank" rel="noopener" href="'+esc(pf.weburl)+'">Web de la empresa</a>');
    $("bs-acciones").innerHTML=b.join("");

    numeros(pf,m,curM,mezcla);
    rentabilidad(m,loc);
    analistas(x.rec,loc,q);
    resultados(x.res,x.cal,curM);
    bot(sym,x.bot);
    noticias(x.not,sym,pf);
  }

  function numeros(pf,m,cur,mezcla){
    var filas=[
      ["Tamaño de la empresa",pf?tamano(pf.marketCapitalization,pf.currency):"—","Lo que valen todas sus acciones juntas (capitalización)."],
      ["PER",m.peTTM!=null?num(m.peTTM,1)+" veces":"—","Cuántos años de beneficios pagas al precio de hoy. Más alto = el mercado espera que crezca mucho (o está cara)."],
      ["Beneficio por acción",m.epsTTM!=null?mon(m.epsTTM,cur):"—","Lo que ganó la empresa en los últimos 12 meses, repartido entre sus acciones."],
      ["Dividendo al año",m.currentDividendYieldTTM!=null?pc(m.currentDividendYieldTTM,false):"Ninguno","Lo que reparte a sus accionistas cada año, en % del precio."],
      ["Crecimiento de ventas",m.revenueGrowthTTMYoy!=null?pc(m.revenueGrowthTTMYoy):"—","Cuánto han crecido sus ventas en el último año frente al anterior."],
      ["Margen de beneficio",m.netProfitMarginTTM!=null?pc(m.netProfitMarginTTM,false):"—","De cada 100 que vende, cuánto le queda de beneficio."],
      ["Rentabilidad del capital (ROE)",m.roeTTM!=null?pc(m.roeTTM,false):"—","Lo que gana al año en relación con el dinero de sus accionistas."],
      ["Deuda / fondos propios",m["totalDebt/totalEquityQuarterly"]!=null?num(m["totalDebt/totalEquityQuarterly"],2):"—","Cuánto debe por cada euro de los accionistas. Más de 2 suele ser mucha deuda (en bancos es normal)."],
      ["Beta",m.beta!=null?num(m.beta,2):"—","Cuánto se mueve frente a la bolsa: 1 = igual, 2 = el doble (más riesgo), 0,5 = la mitad."],
      ["Salió a bolsa",pf&&pf.ipo?fechaEs(pf.ipo):"—","Desde cuándo cotiza."]
    ];
    $("bs-num-nota").textContent=mezcla?"Los números en dinero son de su bolsa de origen, en "+cur+".":"Pasa el ratón (o toca) cada dato para ver qué significa.";
    $("bs-num").innerHTML=filas.map(function(f){return '<div class="fact" title="'+esc(f[2])+'"><span>'+f[0]+'</span><b>'+f[1]+'</b><span class="bs-exp">'+f[2]+'</span></div>';}).join("");
    $("bs-sec-num").hidden=!pf&&!Object.keys(m).length;
  }

  function rentabilidad(m,loc){
    var t=[["Esta semana",m["5DayPriceReturnDaily"]],["Este mes",m.monthToDatePriceReturnDaily],["3 meses",m["13WeekPriceReturnDaily"]],["6 meses",m["26WeekPriceReturnDaily"]],["En lo que va de año",m.yearToDatePriceReturnDaily],["1 año",m["52WeekPriceReturnDaily"]]];
    var e=loc.e;
    if(e&&e.back){if(e.back[3]!=null)t.push(["5 años",e.back[3]]);if(e.back[4]!=null)t.push(["10 años",e.back[4]]);}
    if(e&&e.dd!=null)t.push(["Peor caída de su historia",e.dd]);
    t=t.filter(function(a){return a[1]!=null;});
    $("bs-rent").innerHTML=t.map(function(a){return '<div class="fact"><span>'+a[0]+'</span><b class="'+cls(a[1])+'">'+pc(a[1])+'</b></div>';}).join("");
    if(e&&e.yrs&&e.yrs.length){
      var y0=e.y0||2016;
      $("bs-anios").innerHTML='<p class="small"><b>Año a año</b> (con dividendos):</p><div class="bs-anios">'+e.yrs.map(function(v,i){
        return '<span class="'+cls(v)+'"><i>'+(y0+i)+'</i>'+pc(v)+'</span>';}).join("")+'</div>';
    }
    $("bs-sec-rent").hidden=!t.length;
  }

  function analistas(rec,loc,q){
    var h="",r=rec&&rec.length?rec[0]:null,mk=loc.m;
    if(r){
      var v=[r.strongBuy,r.buy,r.hold,r.sell,r.strongSell],tot=v.reduce(function(a,b){return a+b;},0);
      if(tot){
        var n=["Compra fuerte","Compra","Mantener","Venta","Venta fuerte"],c=["sb","b","h","s","ss"];
        h+='<p class="small">'+tot+' analistas en '+new Date(r.period).toLocaleDateString("es-ES",{month:"long",year:"numeric"})+': <b>'+Math.round((v[0]+v[1])/tot*100)+' %</b> dicen comprar.</p>'+
          '<div class="votos">'+v.map(function(x,i){return x?'<i class="'+c[i]+'" style="flex:'+x+'" title="'+n[i]+': '+x+'"></i>':"";}).join("")+'</div>'+
          '<div class="small muted">'+n.map(function(t,i){return t+": "+v[i];}).join(" · ")+'</div>';
        if(rec.length>1){
          h+='<p class="small muted">Meses anteriores: '+rec.slice(1,4).map(function(p){var t=p.strongBuy+p.buy+p.hold+p.sell+p.strongSell;return new Date(p.period).toLocaleDateString("es-ES",{month:"short"})+" "+(t?Math.round((p.strongBuy+p.buy)/t*100):0)+" % compra";}).join(" · ")+'</p>';
        }
      }
    }
    if(mk&&mk.objetivo){
      var p=q?q.c:mk.precio;
      h+='<p class="small"><b>Precio objetivo medio:</b> '+mon(mk.objetivo,"USD")+' (entre '+mon(mk.bajo,"USD")+' y '+mon(mk.alto,"USD")+'), un <b class="'+cls(mk.objetivo-p)+'">'+pc((mk.objetivo/p-1)*100)+'</b> sobre el precio actual. <span class="muted">Fuente: Yahoo Finance, '+fechaEs(mk.fecha)+'.</span></p>';
    }
    if(h)h+='<p class="small muted">Los analistas también se equivocan, y muchas veces van detrás del precio. Úsalo como una opinión más.</p>';
    $("bs-an").innerHTML=h;$("bs-sec-an").hidden=!h;
  }

  function resultados(res,cal,cur){
    var h="",prox=cal&&cal.earningsCalendar&&cal.earningsCalendar.filter(function(e){return e.epsActual==null;}).sort(function(a,b){return a.date<b.date?-1:1;})[0];
    if(prox)h+='<p class="small"><b>Próximos resultados:</b> '+fechaEs(prox.date)+(prox.hour==="amc"?" (después del cierre)":prox.hour==="bmo"?" (antes de la apertura)":"")+'. Ese día el precio suele moverse mucho.</p>';
    if(res&&res.length){
      h+='<div class="scroll"><table class="tabla-x"><thead><tr><th>Trimestre</th><th>Esperaban</th><th>Ganó</th><th>Sorpresa</th></tr></thead><tbody>'+
        res.slice(0,4).map(function(r){return '<tr><td>'+fechaEs(r.period)+'</td><td class="num">'+mon(r.estimate,cur)+'</td><td class="num">'+mon(r.actual,cur)+'</td><td class="num '+cls(r.surprisePercent)+'">'+pc(r.surprisePercent)+'</td></tr>';}).join("")+
        '</tbody></table></div><p class="small muted">Beneficio por acción de cada trimestre: lo que esperaban los analistas y lo que ganó de verdad. Una sorpresa positiva es que ganó más de lo esperado.</p>';
    }
    $("bs-res-tri").innerHTML=h;$("bs-sec-res").hidden=!h;
  }

  function bot(sym,d){
    if(!d){$("bs-sec-bot").hidden=true;return;}
    var vigila=d.precios&&d.precios[sym],pos=d.posiciones&&d.posiciones[sym];
    var ops=(d.operaciones||[]).filter(function(o){return o.sym===sym;});
    var sen=(d.sombra||[]).filter(function(x){return x.sym===sym;});
    var nom=function(r){return (d.resumen_reglas&&d.resumen_reglas[r]&&d.resumen_reglas[r].nombre)||r;};
    var h="";
    if(!vigila)h='<p class="small">El bot no vigila esta empresa: no está entre sus unas 110 empresas.</p>';
    else{
      h+='<p class="small">El bot vigila esta empresa.'+(pos?' <b>Ahora la tiene</b>: la compró el '+fechaEs(pos.fecha)+' a '+mon(pos.precio,"USD")+' porque '+esc(nom(pos.regla).toLowerCase())+'.':' Ahora no la tiene.')+'</p>';
      if(ops.length)h+='<p class="small">Operaciones con ella: '+ops.slice(-6).map(function(o){return (o.tipo==="compra"?"compra":"venta")+" el "+fechaEs(o.fecha)+(o.resultado!=null?" ("+(o.resultado>0?"+":"")+num(o.resultado)+" $)":"");}).join(", ")+'. <a href="#bot">Verlas en la pestaña Bot</a>.</p>';
      if(sen.length)h+='<p class="small">Señales que ha visto en ella últimamente (las usa para aprender): '+sen.slice(-5).map(function(x){return esc(nom(x.regla).toLowerCase())+" ("+fechaEs(x.fecha)+")";}).join("; ")+'.</p>';
    }
    $("bs-bot").innerHTML=h;$("bs-sec-bot").hidden=false;
  }

  function noticias(n,sym,pf){
    // Finnhub mezcla noticias generales: se quedan solo las que nombran a la empresa.
    if(n&&n.length){
      var base=sym.split(".")[0],nom=pf&&pf.name?pf.name.replace(/\b(Inc|Corp|Corporation|Group|Holdings?|Co|Ltd|plc|SA|NV|AG|Company|Class [A-C])\b\.?/gi,"").replace(/[.,]/g,"").trim().split(/\s+/)[0]:"";
      var re=new RegExp("\\b("+base.replace(/[^A-Za-z0-9]/g,"")+(nom&&nom.length>2?"|"+nom.replace(/[^A-Za-z0-9]/g,""):"")+")\\b","i");
      n=n.filter(function(x){return re.test(x.headline||"")||re.test(x.summary||"");});
    }
    if(!n||!n.length){$("bs-sec-not").hidden=true;return;}
    $("bs-sec-not").hidden=false;
    $("bs-not").innerHTML=n.slice(0,8).map(function(x){
      return '<li><a href="'+esc(x.url)+'" target="_blank" rel="noopener">'+esc(x.headline)+'</a><span class="small muted">'+esc(x.source)+' · '+new Date(x.datetime*1000).toLocaleString("es-ES",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})+'</span></li>';
    }).join("")+'<li class="small muted">Las noticias vienen en inglés, tal cual las publica cada medio.</li>';
  }

  $("bs-acciones").addEventListener("click",function(e){
    var b=e.target.closest("[data-sim]");if(!b)return;
    var chip=document.querySelector('#chips button[data-id="'+b.dataset.sim+'"]');if(chip)chip.click();
    location.hash="#simulador";
  });

  // Arranque
  pintarRecientes();estadoClave();
  window.addEventListener("hashchange",function(){if(location.hash==="#buscar")estadoClave();});
  window.BUSCAR={abrir:abrir};
})();
