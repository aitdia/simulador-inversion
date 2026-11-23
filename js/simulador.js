// Cálculo de escenarios y pintado de la página.
(function(){
  "use strict";
  var $=function(id){return document.getElementById(id);};
  var eur=new Intl.NumberFormat("es-ES",{style:"currency",currency:"EUR",maximumFractionDigits:0,useGrouping:"always"});
  var pc=function(x){return (x>0?"+":"")+x.toLocaleString("es-ES",{maximumFractionDigits:0,useGrouping:"always"})+" %";};
  var MARKET=0.07,Z10=1.2816,H=[1,2,3,5,7];

  var DATA=window.EMPRESAS;
  DATA.forEach(function(d){
    // Recién salida a bolsa: sin años completos no hay ritmo ni volatilidad propios.
    if(d.yrs.length<2){d.sinHistoria=true;d.vol=null;d.cagr=null;d.cagrNota="";d.worst=null;d.best=null;d.y0=d.y0||2026;return;}
    var l=d.yrs.map(function(y){return Math.log(1+y/100);}),m=l.reduce(function(a,b){return a+b;},0)/l.length;
    d.vol=Math.sqrt(l.reduce(function(a,b){return a+(b-m)*(b-m);},0)/(l.length-1));
    d.y0=d.y0||2016;
    // Ritmo histórico: 10 años si los hay; si no, el que traiga la empresa o el de sus años completos.
    if(d.back&&d.back[4]!==null){d.cagr=Math.pow(1+d.back[4]/100,1/10)-1;d.cagrNota="sus últimos 10 años";}
    else if(typeof d.cagr!=="number"){d.cagr=Math.exp(m)-1;d.cagrNota="sus años "+d.y0+"-2025";}
    d.worst=Math.min.apply(null,d.yrs);d.best=Math.max.apply(null,d.yrs);
  });
  // Lo que comparten las otras secciones (cartera y compras).
  window.SIM={DATA:DATA,eur:eur,pc:pc,H:H,MARKET:MARKET,Z10:Z10,porId:function(id){return DATA.filter(function(d){return d.id===id;})[0]||null;}};

  var state={id:"NVDA",amount:200,monthly:0,neto:true,fee:1,cmp:"SPY",parecida:"NVDA",mcT:5},custom=null;
  try{var s=JSON.parse(localStorage.getItem("simulador-inv")||"null");
    if(s&&typeof s.amount==="number")state.amount=s.amount;
    if(s&&typeof s.monthly==="number")state.monthly=s.monthly;
    if(s&&typeof s.neto==="boolean")state.neto=s.neto;
    if(s&&typeof s.fee==="number")state.fee=s.fee;
    if(s&&DATA.some(function(d){return d.id===s.cmp;}))state.cmp=s.cmp;
    if(s&&DATA.some(function(d){return d.id===s.id;}))state.id=s.id;
    if(s&&DATA.some(function(d){return d.id===s.parecida&&!d.sinHistoria;}))state.parecida=s.parecida;
    if(s&&H.indexOf(s.mcT)!==-1)state.mcT=s.mcT;}catch(e){}

  // Cuánto sube y baja: la suya, o la de la empresa parecida si no tiene historia.
  function volDe(d){return d.sinHistoria?(DATA.filter(function(x){return x.id===state.parecida;})[0]||DATA[0]).vol:d.vol;}
  function current(){return state.id==="_custom"&&custom?custom:DATA.filter(function(d){return d.id===state.id;})[0]||DATA[0];}
  // Impuesto sobre la ganancia al vender (tramos del ahorro 2026).
  function impuesto(g){
    if(g<=0)return 0;
    var b=[[6000,.19],[50000,.21],[200000,.23],[300000,.27],[Infinity,.30]],prev=0,t=0;
    for(var i=0;i<b.length;i++){if(g>prev)t+=(Math.min(g,b[i][0])-prev)*b[i][1];prev=b[i][0];}
    return t;
  }
  // Rentabilidad anual de cada escenario para un plazo de t años.
  function tasa(d,t,kind){
    if(kind==="mal")return Math.exp(Math.log(1+MARKET)-Z10*volDe(d)/Math.sqrt(t))-1;
    if(kind==="bolsa")return MARKET;
    return d.cagr;
  }
  // Valor tras t años con lo de ahora + lo de cada mes. Devuelve lo puesto, el valor y el neto tras vender.
  function simular(d,t,kind){
    var r=tasa(d,t,kind);if(r===null)return null;
    var rm=Math.pow(1+r,1/12)-1,n=Math.round(t*12),fee=state.neto?state.fee:0;
    var v=state.amount>0?Math.max(0,state.amount-fee):0,puesto=state.amount;
    for(var k=0;k<n;k++){
      if(k>0&&state.monthly>0){v+=Math.max(0,state.monthly-fee);puesto+=state.monthly;}
      v*=1+rm;
    }
    if(state.monthly>0){v+=Math.max(0,state.monthly-fee);puesto+=state.monthly;}
    var neto=v;
    if(state.neto){var venta=v>0?fee:0;neto=v-venta-impuesto(v-venta-puesto);}
    return {puesto:puesto,valor:v,neto:neto};
  }
  window.SIM_simular=simular;
  function cell(cls,v,a){if(v===null)return '<td class="'+cls+' muted"><span class="v">sin historia</span></td>';var g=(v/a-1)*100;return '<td class="'+cls+'"><span class="v">'+eur.format(v)+'</span><span class="d">'+pc(g)+'</span></td>';}

  function render(){
    var d=current(),a=state.amount;
    $("pick-name").textContent=d.name;
    $("chips").innerHTML=DATA.map(function(x){return '<button type="button" data-id="'+x.id+'" aria-pressed="'+(x.id===state.id)+'">'+x.name+'</button>';}).join("")+
      (custom?'<button type="button" data-id="_custom" aria-pressed="'+(state.id==="_custom")+'">'+custom.name+' (estimación)</button>':"");
    var quien=(a>0?eur.format(a):"")+(a>0&&state.monthly>0?" + ":"")+(state.monthly>0?eur.format(state.monthly)+" al mes":"");
    $("t-fwd").textContent="Cuánto podrías tener con "+(quien||"0 €")+" en "+d.name+(state.neto?", ya restados comisiones e impuestos":"");
    $("h-hot-t").textContent=d.sinHistoria?"Si repite su historia":"Si repite "+d.cagrNota;
    $("h-hot").textContent=d.sinHistoria?"aún no tiene":"un "+(d.cagr*100).toLocaleString("es-ES",{maximumFractionDigits:0})+" % al año";
    $("fwd").innerHTML=H.map(function(t){
      var mal=simular(d,t,"mal"),bol=simular(d,t,"bolsa"),rep=simular(d,t,"repite"),p=mal.puesto;
      if(p<=0)return '<tr><td class="yr">'+t+(t===1?" año":" años")+'</td><td colspan="4" class="muted">Pon una cantidad para ver los escenarios.</td></tr>';
      return '<tr><td class="yr">'+t+(t===1?" año":" años")+'<span class="d puesto-m">pones '+eur.format(p)+'</span></td><td class="aport"><span class="v">'+eur.format(p)+'</span></td>'+cell("bad",mal.neto,p)+cell("mid",bol.neto,p)+cell("hot",rep?rep.neto:null,p)+'</tr>';
    }).join("");
    $("fwd-note").textContent="Son escenarios, no predicciones. Nadie sabe cuál se cumplirá, y el resultado real puede quedar fuera de los tres."+
      (state.neto?" Se resta "+(state.fee>0?eur2(state.fee)+" de comisión en cada compra y al vender, y ":"")+"el impuesto sobre la ganancia (19 % hasta 6.000 €, más por encima) como si lo vendieras todo al final del plazo.":" Sin restar comisiones ni impuestos.");
    pintarComparacion(d);
    var w=$("hot-warn"),pb=$("proxy-box");
    pb.hidden=!d.sinHistoria;
    if(d.sinHistoria){
      $("proxy-sel").innerHTML=DATA.filter(function(x){return !x.sinHistoria;}).map(function(x){return '<option value="'+x.id+'"'+(x.id===state.parecida?" selected":"")+'>'+x.name+'</option>';}).join("");
    }
    if(d.sinHistoria){var sa=d.salida,par=SIMporId(state.parecida);w.hidden=false;w.textContent=d.name+" empezó a cotizar en bolsa el "+sa.fecha+": salió a "+usd(sa.precio)+" y abrió a "+usd(sa.apertura)+". No tiene ni un año de historia, así que no hay historia que repetir y no se sabe todavía cuánto sube y baja. Para la columna de «si le va mal» y los 10.000 casos de abajo se supone que se mueve tanto como "+par.name+" (puedes cambiarlo justo debajo). Ten en cuenta también que esta web la ha hecho Claude, la IA de Anthropic: contrasta lo que veas con otras fuentes.";}
    else if(d.cagr>0.25){w.hidden=false;w.textContent=d.name+" ha subido una media del "+(d.cagr*100).toFixed(0)+" % al año en "+d.cagrNota+". Muy pocas empresas mantienen ese ritmo otra década: cuanto más grande es una empresa, más difícil le resulta seguir multiplicándose. Toma la tercera columna como un techo optimista.";}
    else if(d.est){w.hidden=false;w.textContent="Los datos de "+d.name+" son una estimación de Claude a partir de lo que recuerda, sin comprobar con una fuente. Úsalos solo como orientación.";}
    else if(d.yrs.length<5){w.hidden=false;w.textContent=d.name+" lleva poco tiempo cotizando en bolsa, así que hay pocos años con los que calcular. Sus escenarios son mucho menos fiables que los de una empresa con una larga historia.";}
    else w.hidden=true;

    pintarCasos(d);
    var pp=$("past-panel");
    if(d.back){
      pp.hidden=false;
      $("t-past").textContent="Lo que habría pasado de verdad con "+eur.format(a)+" en "+d.name;
      var yrs=[1,2,3,5,10];
      $("past").innerHTML=yrs.map(function(y,i){
        var r=d.back[i];
        if(r===null)return '<tr><td class="yr">'+y+' años</td><td class="muted">sin dato</td><td class="muted">sin dato</td></tr>';
        var v=a*(1+r/100),g=v-a;
        return '<tr><td class="yr">'+y+(y===1?" año":" años")+'</td><td><span class="v">'+eur.format(v)+'</span></td><td><span class="v '+(g>=0?"up":"down")+'">'+(g>=0?"+":"")+eur.format(g)+' ('+pc(r)+')</span></td></tr>';
      }).join("");
      var per=d.y0+"-2025";
      $("facts").innerHTML=
        (d.dd!==null?'<div class="fact"><span>Peor caída '+d.ddNote+'</span><b>'+pc(d.dd)+'</b><span>'+eur.format(a)+' se quedaron en '+eur.format(a*(1+d.dd/100))+'</span></div>':'')+
        '<div class="fact"><span>Peor año ('+per+')</span><b>'+pc(d.worst)+'</b></div>'+
        '<div class="fact"><span>Mejor año ('+per+')</span><b>'+pc(d.best)+'</b></div>';
    }else pp.hidden=true;
    var yp=$("yr-panel");
    var ipo=$("ipo-facts");
    if(d.sinHistoria){
      yp.hidden=false;ipo.hidden=false;$("bars").innerHTML="";$("bars").style.minWidth="0";
      $("t-yr").textContent=d.name+" en bolsa";
      var sa2=d.salida;
      ipo.innerHTML='<div class="fact"><span>Precio de salida</span><b>'+usd(sa2.precio)+'</b><span>lo que pagaron quienes pidieron acciones antes</span></div>'+
        '<div class="fact"><span>Primer precio en bolsa ('+sa2.fecha+')</span><b>'+usd(sa2.apertura)+'</b><span>'+pc((sa2.apertura/sa2.precio-1)*100)+' sobre el de salida</span></div>';
      $("yr-note").textContent="Fuente: "+sa2.fuente+". El precio de ahora lo ves en el gráfico en directo.";
      var lv0=$("live");if(lv0){lv0.href="https://www.tradingview.com/symbols/"+d.sym.replace(":","-")+"/";lv0.textContent="Ver el gráfico en directo de "+d.name+" en TradingView";}
      if(window.__live)window.__live(d);
    }else if(d.yrs){
      yp.hidden=false;ipo.hidden=true;
      $("t-yr").textContent="Cuánto subió o bajó "+d.name+" cada año";
      var vals=d.yrs.concat([d.ytd]),CAP=250,PX=110;
      var maxP=Math.min(CAP,Math.max.apply(null,vals.concat([1]))),maxN=Math.max.apply(null,vals.map(function(v){return -v;}).concat([0]));
      var unit=PX/Math.max(maxP,maxN),negH=Math.ceil(maxN*unit)+4,capped=false;
      $("bars").innerHTML=vals.map(function(v,i){
        var h=Math.max(2,Math.min(Math.abs(v),CAP)*unit);if(v>CAP)capped=true;
        return '<div class="bcol"><span class="lab">'+pc(v)+'</span><div class="pos" style="height:'+PX+'px">'+(v>=0?'<i style="height:'+h+'px"></i>':'')+'</div><div class="neg" style="height:'+negH+'px">'+(v<0?'<i style="height:'+h+'px"></i>':'')+'</div><span class="yr">'+(i===vals.length-1?"2026*":d.y0+i)+'</span></div>';
      }).join("");
      $("bars").style.gridTemplateColumns="repeat("+vals.length+",minmax(44px,1fr))";
      $("bars").style.minWidth=(vals.length*50)+"px";
      $("yr-note").textContent="* 2026 hasta "+(d.dato?d.dato.split("-").reverse().join("/"):"mediados de noviembre")+"."+(capped?" Las barras de más del 250 % están recortadas; la cifra de arriba es la real.":"");
      var lv=$("live");if(lv){lv.href="https://www.tradingview.com/symbols/"+d.sym.replace(":","-")+"/";lv.textContent="Ver el gráfico en directo de "+d.name+" en TradingView";}
      if(window.__live)window.__live(d);
    }else yp.hidden=true;
    try{localStorage.setItem("simulador-inv",JSON.stringify({id:state.id==="_custom"?"NVDA":state.id,amount:a,monthly:state.monthly,neto:state.neto,fee:state.fee,cmp:state.cmp,parecida:state.parecida,mcT:state.mcT}));}catch(e){}
  }

  function usd(x){return x.toLocaleString("es-ES",{minimumFractionDigits:x%1?2:0,maximumFractionDigits:2})+" $";}
  function SIMporId(id){return DATA.filter(function(x){return x.id===id;})[0]||DATA[0];}

  // 10.000 futuros posibles: cada mes sube o baja al azar tanto como la empresa en su historia,
  // y de media (la mediana) crece como la bolsa. Semilla fija para que no cambie al recalcular.
  var CASOS=10000;
  function azar(sem){return function(){sem|=0;sem=sem+0x6D2B79F5|0;var t=Math.imul(sem^sem>>>15,1|sem);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};}
  function casos(d,t){
    var rnd=azar(20261119),sig=volDe(d)/Math.sqrt(12),mu=Math.log(1+MARKET)/12,n=Math.round(t*12),fee=state.neto?state.fee:0;
    var out=new Float64Array(CASOS),puesto=state.amount+state.monthly*n,z2=null;
    function normal(){if(z2!==null){var r=z2;z2=null;return r;}var u=1-rnd(),v=rnd(),m=Math.sqrt(-2*Math.log(u));z2=m*Math.sin(2*Math.PI*v);return m*Math.cos(2*Math.PI*v);}
    for(var c=0;c<CASOS;c++){
      var v=state.amount>0?Math.max(0,state.amount-fee):0;
      for(var k=0;k<n;k++){if(k>0&&state.monthly>0)v+=Math.max(0,state.monthly-fee);v*=Math.exp(mu+sig*normal());}
      if(state.monthly>0)v+=Math.max(0,state.monthly-fee);
      if(state.neto){var venta=v>0?fee:0;v=v-venta-impuesto(v-venta-puesto);}
      out[c]=v;
    }
    out.sort();
    return {v:out,puesto:puesto};
  }
  function pintarCasos(d){
    var T=state.mcT,box=$("mc-res");
    $("mc-t").value=String(T);
    $("t-mc").textContent="10.000 futuros posibles para "+d.name;
    var par=d.sinHistoria?SIMporId(state.parecida):d;
    $("mc-sub").textContent="El ordenador se inventa 10.000 caminos distintos de aquí a "+T+(T===1?" año":" años")+". En cada uno, mes a mes, "+d.name+" sube o baja al azar tanto como "+(d.sinHistoria?"lo ha hecho "+par.name:"lo ha hecho ella")+" en su historia, y de media crece como la bolsa (7 % al año). Así ves no solo un resultado, sino con qué frecuencia sale cada uno.";
    if(state.amount<=0&&state.monthly<=0){box.hidden=true;return;}
    box.hidden=false;
    var r=casos(d,T),v=r.v,p=r.puesto;
    function q(x){return v[Math.min(CASOS-1,Math.floor(x*CASOS))];}
    var pierde=0,dobla=0;for(var i=0;i<CASOS;i++){if(v[i]<p)pierde++;if(v[i]>=2*p)dobla++;}
    function de100(k){var x=k/CASOS*100;return x<1&&k>0?"menos de 1":String(Math.round(x));}
    $("mc-facts").innerHTML=
      '<div class="fact"><span>Acabas perdiendo dinero</span><b class="'+(pierde/CASOS>0.25?"down":"")+'">'+de100(pierde)+' de cada 100</b><span>terminas con menos de los '+eur.format(p)+' que pones</span></div>'+
      '<div class="fact"><span>Lo más normal</span><b>'+eur.format(q(0.5))+'</b><span>la mitad de los casos acaba por encima y la otra mitad por debajo</span></div>'+
      '<div class="fact"><span>1 de cada 10, peor que</span><b class="down">'+eur.format(q(0.1))+'</b><span>y 1 de cada 10, mejor que '+eur.format(q(0.9))+'</span></div>'+
      '<div class="fact"><span>Doblas lo que pones</span><b>'+de100(dobla)+' de cada 100</b><span>acabas con '+eur.format(2*p)+' o más</span></div>';
    // Histograma: del caso 1 % al 95 %, el resto en la última barra.
    var lo=Math.max(0,q(0.01)),hi=q(0.95),NB=18,w=(hi-lo)/NB||1,cnt=[];for(var b=0;b<=NB;b++)cnt.push(0);
    for(i=0;i<CASOS;i++){var k2=Math.floor((v[i]-lo)/w);cnt[Math.max(0,Math.min(NB,k2))]++;}
    var mx=Math.max.apply(null,cnt);
    $("mc-hist").innerHTML=cnt.map(function(c,b){
      var a0=lo+b*w,a1=a0+w,perd=b<NB&&a0+w/2<p;
      var tit=b===NB?"Más de "+eur.format(a0)+": "+c+" casos":"Entre "+eur.format(a0)+" y "+eur.format(a1)+": "+c+" casos";
      return '<i class="'+(perd?"pierde":"gana")+(b===NB?" cola":"")+'" style="height:'+Math.max(1,c/mx*100)+'%" title="'+tit+'"></i>';
    }).join("")+'<span class="marca" style="left:'+Math.max(0,Math.min(100,(p-lo)/(w*(NB+1))*100))+'%"><em>pones '+eur.format(p)+'</em></span>';
    $("mc-hist").setAttribute("aria-label","Reparto de los 10.000 resultados: "+de100(pierde)+" de cada 100 acaban perdiendo; el resultado más normal es "+eur.format(q(0.5)));
    $("mc-ejes").innerHTML='<span>'+eur.format(lo)+'</span><span>más de '+eur.format(hi)+'</span>';
    $("mc-note").textContent="Cada barra es un tramo de dinero final; cuanto más alta, más casos acaban ahí. En rojo, los tramos en los que pierdes. "+(state.neto?"Ya restados comisiones e impuestos. ":"")+"Es un ejercicio de probabilidad, no una predicción: supone que el futuro se mueve como el pasado y no tiene en cuenta sorpresas como una quiebra.";
  }
  function eur2(x){return x.toLocaleString("es-ES",{minimumFractionDigits:x%1?2:0,maximumFractionDigits:2})+" €";}
  // Comparación lado a lado a 5 años.
  function pintarComparacion(d){
    var otras=DATA.filter(function(x){return x.id!==d.id;});
    if(!otras.some(function(x){return x.id===state.cmp;}))state.cmp=(d.id==="SPY"?"NVDA":"SPY");
    var b=DATA.filter(function(x){return x.id===state.cmp;})[0];
    $("cmp-sel").innerHTML=otras.map(function(x){return '<option value="'+x.id+'"'+(x.id===b.id?" selected":"")+'>'+x.name+'</option>';}).join("");
    $("t-cmp").textContent=d.name+" frente a "+b.name;
    $("cmp-a").textContent=d.name;$("cmp-b").textContent=b.name;
    var T=5,a=state.amount;
    function fila(nombre,va,vb,fmt,alto){
      var ma=va!==null&&vb!==null&&(alto?va>vb:va<vb),mb=va!==null&&vb!==null&&(alto?vb>va:vb<va);
      return '<tr><td>'+nombre+'</td><td'+(ma?' class="mejor"':'')+'><span class="v">'+(va===null?"sin dato":fmt(va))+'</span></td><td'+(mb?' class="mejor"':'')+'><span class="v">'+(vb===null?"sin dato":fmt(vb))+'</span></td></tr>';
    }
    var sa=simular(d,T,"mal"),sb=simular(b,T,"mal"),ra=simular(d,T,"repite"),rb=simular(b,T,"repite");
    function cinco(x){return !x.back||x.back[3]===null?null:(a||100)*(1+x.back[3]/100);}
    var e=function(x){return eur.format(x);};
    $("cmp-body").innerHTML=(sa.puesto>0?
      fila("Si le va mal, a 5 años",sa.neto,sb.neto,e,true)+
      fila("Si repite su historia, a 5 años",ra?ra.neto:null,rb?rb.neto:null,e,true):"")+
      fila("Ritmo histórico al año",d.cagr===null?null:d.cagr*100,b.cagr===null?null:b.cagr*100,pc,true)+
      fila("Hace 5 años, de golpe ("+eur.format(a||100)+")",cinco(d),cinco(b),e,true)+
      fila("Peor caída",d.dd,b.dd,pc,true)+
      fila("Peor año",d.worst,b.worst,pc,true)+
      fila("Años de historia",d.sinHistoria?0:2025-d.y0+1,b.sinHistoria?0:2025-b.y0+1,function(x){return String(x);},true);
  }
  $("cmp-sel").addEventListener("change",function(e){state.cmp=e.target.value;render();});
  $("proxy-sel").addEventListener("change",function(e){state.parecida=e.target.value;render();});
  $("mc-t").addEventListener("change",function(e){state.mcT=parseInt(e.target.value,10);render();});
  function num(id,min,max,def){var v=parseFloat($(id).value);return isNaN(v)?def:Math.min(max,Math.max(min,v));}
  $("amount").addEventListener("input",function(){state.amount=num("amount",0,1000000,0);render();});
  $("monthly").addEventListener("input",function(){state.monthly=num("monthly",0,100000,0);render();});
  $("fee").addEventListener("input",function(){state.fee=num("fee",0,50,0);render();});
  $("neto").addEventListener("change",function(e){state.neto=e.target.checked;$("fee").disabled=!state.neto;render();});
  $("monthly").value=state.monthly;$("fee").value=state.fee;$("neto").checked=state.neto;$("fee").disabled=!state.neto;
  $("chips").addEventListener("click",function(e){var b=e.target.closest("button");if(!b)return;state.id=b.dataset.id;render();});
  $("amount").value=state.amount;
  render();
})();
