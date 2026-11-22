// Pestaña Bot: enseña lo que guarda el bot (bot/datos.json) y, si hay clave de Finnhub, los precios en directo.
(function(){
  "use strict";
  var $=function(id){return document.getElementById(id);};
  var D=null,directo={},cargado=false;
  function esc(s){return String(s).replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c];});}
  function usd(x){return x===null||x===undefined||isNaN(x)?"—":x.toLocaleString("es-ES",{minimumFractionDigits:2,maximumFractionDigits:2,useGrouping:"always"})+" $";}
  function pc(x){return x===null||isNaN(x)?"—":(x>=0?"+":"")+(x*100).toLocaleString("es-ES",{minimumFractionDigits:1,maximumFractionDigits:1})+" %";}
  function cls(x){return x>0?"up":x<0?"down":"";}
  function fecha(f){var p=f.split("-");return p[2]+"/"+p[1]+"/"+p[0];}
  function nombre(s){var e=(window.SIM&&window.SIM.DATA||[]).filter(function(d){return d.id===s;})[0];return e?e.name+' <span class="muted small">'+s+'</span>':s;}
  function precio(s){if(directo[s])return directo[s].c;var p=D.precios[s];return p?p.c:null;}
  function puntuacion(r){return r.suma/(r.n+5);}

  function cargar(){
    var e=$("bt-estado");e.textContent="Cargando…";
    fetch("bot/datos.json?v="+Date.now(),{cache:"no-store"}).then(function(r){if(!r.ok)throw new Error(r.status);return r.json();})
      .then(function(d){D=d;pintar();if(clave()&&!Object.keys(directo).length)enDirecto();})
      .catch(function(){
        D=null;
        e.innerHTML=location.protocol==="file:"?"El bot solo se puede ver en la web publicada (aitdia.github.io/simulador-inversion), no abriendo el archivo en el PC.":"El bot todavía no ha hecho su primera ejecución. Cuando se ejecute, aparecerá aquí todo lo que hace.";
        ["bt-facts","bt-grafico","bt-pos","bt-reglas","bt-ops","bt-diario"].forEach(function(id){$(id).innerHTML="";});
      });
  }
  function clave(){return window.INV&&window.INV.ajustes&&window.INV.ajustes.clave;}

  function valores(){
    var v=D.efectivo;Object.keys(D.posiciones).forEach(function(s){var p=D.posiciones[s],c=precio(s);v+=p.acciones*(c===null?p.precio:c);});
    var spy=precio("SPY"),vi=D.indice&&spy?D.indice.unidades*spy:null;
    return {bot:v,spy:vi};
  }

  function pintar(){
    $("bt-capital").textContent=usd(D.capital);
    var u=D.ultima,est=$("bt-estado");
    var modos={operar:"miró el mercado",repasar:"repasó el día",preparar:"preparó el día",semanal:"hizo el resumen semanal"};
    if(u){var t=new Date(u.cuando);var hace=Math.round((Date.now()-t.getTime())/60000);
      var cuando=hace<60?"hace "+Math.max(1,hace)+" min":hace<1440?"hace "+Math.round(hace/60)+" h":"el "+t.toLocaleDateString("es-ES");
      est.innerHTML='<b>Última vez ('+cuando+', '+t.toLocaleTimeString("es-ES",{hour:"2-digit",minute:"2-digit"})+'):</b> '+(modos[u.modo]||u.modo)+'. '+esc(u.nota)+
        (hace>3*1440?' <span class="down">Hace días que no se ejecuta: mira la pestaña Actions del repositorio.</span>':"");}
    var v=valores(),cap=D.capital;
    var n=Object.keys(D.posiciones).length;
    var fiables=Object.keys(D.reglas).filter(function(k){var r=D.reglas[k];return r.n>=15&&puntuacion(r)>0;}).length;
    $("bt-facts").innerHTML=
      '<div class="fact"><span>El bot tiene</span><b class="'+cls(v.bot-cap)+'">'+usd(v.bot)+'</b><span>'+pc(v.bot/cap-1)+' desde que empezó ('+fecha(D.inicio)+')</span></div>'+
      '<div class="fact"><span>Con el S&amp;P 500 tendría</span><b class="'+cls((v.spy||cap)-cap)+'">'+usd(v.spy)+'</b><span>'+(v.spy?pc(v.spy/cap-1):"empieza a contar en su primera ejecución con bolsa abierta")+'</span></div>'+
      '<div class="fact"><span>Va '+(v.spy===null?"—":v.bot>=v.spy?"por delante":"por detrás")+'</span><b class="'+(v.spy===null?"":cls(v.bot-v.spy))+'">'+(v.spy===null?"—":usd(v.bot-v.spy))+'</b><span>frente al S&amp;P 500</span></div>'+
      '<div class="fact"><span>Ahora mismo</span><b>'+n+(n===1?" empresa":" empresas")+'</b><span>'+usd(D.efectivo)+' sin invertir · '+fiables+(fiables===1?" regla fiable":" reglas fiables")+'</span></div>';
    grafico();posiciones();reglas();operaciones();diario();
  }

  function grafico(){
    var c=D.curva.slice(),g=$("bt-grafico");
    var v=valores(),hoy=new Date().toISOString().slice(0,10);
    if(c.length&&Object.keys(directo).length&&v.spy!==null)c.push([hoy+" (ahora)",v.bot,v.spy]);
    if(c.length<2){g.innerHTML='<p class="small muted">La gráfica aparece cuando el bot lleve al menos dos días repasando el cierre.</p>';return;}
    var W=640,H=220,PL=8,PR=8,PT=10,PB=22,xs=[],min=Infinity,max=-Infinity;
    c.forEach(function(p){[p[1],p[2]].forEach(function(y){if(y!==null){min=Math.min(min,y);max=Math.max(max,y);}});});
    min=Math.min(min,D.capital);max=Math.max(max,D.capital);var pad=(max-min)*0.08||10;min-=pad;max+=pad;
    function X(i){return PL+(W-PL-PR)*i/(c.length-1);}function Y(y){return PT+(H-PT-PB)*(1-(y-min)/(max-min));}
    function linea(k){return c.map(function(p,i){return p[k]===null?"":(i&&c[i-1][k]!==null?"L":"M")+X(i).toFixed(1)+","+Y(p[k]).toFixed(1);}).join("");}
    var base=Y(D.capital);
    g.innerHTML='<svg viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none" aria-hidden="true">'+
      '<line x1="'+PL+'" x2="'+(W-PR)+'" y1="'+base+'" y2="'+base+'" class="g-base"/>'+
      '<path d="'+linea(2)+'" class="g-spy"/><path d="'+linea(1)+'" class="g-bot"/></svg>'+
      '<div class="bt-ejes small muted"><span>'+fecha(c[0][0])+'</span><span>línea gris: los '+usd(D.capital)+' del principio</span><span>'+(c[c.length-1][0].indexOf("ahora")>-1?"ahora":fecha(c[c.length-1][0]))+'</span></div>';
    g.setAttribute("aria-label","Evolución del bot frente al S&P 500: el bot tiene "+usd(v.bot)+" y el índice "+usd(v.spy));
  }

  function posiciones(){
    var ks=Object.keys(D.posiciones);
    if(!ks.length){$("bt-pos").innerHTML='<tr><td colspan="6" class="muted">Ahora no tiene ninguna acción. '+(Object.keys(D.reglas).some(function(k){var r=D.reglas[k];return r.n>=15&&puntuacion(r)>0;})?"Espera a que alguna de sus reglas fiables dé señal.":"Todavía está observando: no compra hasta tener reglas fiables.")+'</td></tr>';return;}
    $("bt-pos").innerHTML=ks.map(function(s){
      var p=D.posiciones[s],c=precio(s),val=c===null?null:p.acciones*c,g=val===null?null:val-p.coste,r=D.reglas[p.regla];
      return '<tr><td>'+nombre(s)+'</td><td class="num">'+fecha(p.fecha)+'</td><td class="num">'+usd(p.precio)+'</td><td class="num">'+usd(c)+(directo[s]?' <span class="small up">●</span>':"")+'</td>'+
        '<td class="num '+cls(g)+'">'+(g===null?"—":usd(g)+'<span class="d small">'+pc(g/p.coste)+'</span>')+'</td><td class="small">'+esc(r?r.nombre:p.regla)+'</td></tr>';
    }).join("");
  }

  function reglas(){
    var ks=Object.keys(D.reglas).sort(function(a,b){var ra=D.reglas[a],rb=D.reglas[b];return (rb.n>=15)-(ra.n>=15)||puntuacion(rb)-puntuacion(ra)||rb.n-ra.n;});
    $("bt-reglas").innerHTML=ks.map(function(k){
      var r=D.reglas[k],m=r.n?r.suma/r.n:null,estado;
      if(r.n<15)estado='<span class="muted">Reuniendo casos ('+r.n+' de 15)</span>';
      else if(puntuacion(r)>0)estado='<span class="up">Fiable: la usa para comprar</span>';
      else estado='<span class="down">No funciona: no la usa</span>';
      var real=r.real_n?r.real_n+' ('+pc(r.real_suma/r.real_n)+')':"—";
      return '<tr><td>'+esc(r.nombre)+'</td><td class="num">'+r.n+'</td><td class="num '+cls(m)+'">'+(m===null?"—":pc(m))+'</td><td class="num">'+(r.n?Math.round(r.ganadas/r.n*100)+" %":"—")+'</td><td class="num">'+real+'</td><td class="small">'+estado+'</td></tr>';
    }).join("");
  }

  function operaciones(){
    var ops=D.operaciones.slice(-40).reverse();
    if(!ops.length){$("bt-ops").innerHTML='<p class="small muted">Aún no ha hecho ninguna operación.</p>';return;}
    var ventas=D.operaciones.filter(function(o){return o.tipo==="venta";}),gan=ventas.filter(function(o){return o.resultado>0;}).length,tot=ventas.reduce(function(a,o){return a+o.resultado;},0);
    $("bt-ops").innerHTML=(ventas.length?'<p class="small">Ha cerrado '+ventas.length+(ventas.length===1?" operación":" operaciones")+': '+gan+' con ganancia y '+(ventas.length-gan)+' con pérdida, en total <b class="'+cls(tot)+'">'+usd(tot)+'</b> (ya con comisiones).</p>':"")+
      '<ul class="bt-lista">'+ops.map(function(o){
        return '<li><span class="bt-tag '+(o.tipo==="compra"?"c":"v")+'">'+(o.tipo==="compra"?"Compra":"Venta")+'</span> <b>'+nombre(o.sym)+'</b> <span class="muted small">'+fecha(o.fecha)+' '+o.hora+' (NY)</span>'+
          '<br><span class="small">'+o.acciones.toLocaleString("es-ES",{maximumFractionDigits:4})+' acciones a '+usd(o.precio)+(o.tipo==="venta"?' · resultado <b class="'+cls(o.resultado)+'">'+usd(o.resultado)+'</b> ('+pc(o.resultado_pct/100)+')':"")+'</span>'+
          '<br><span class="small muted">'+esc(o.motivo)+'</span></li>';
      }).join("")+'</ul>'+(D.operaciones.length>40?'<p class="small muted">Se muestran las 40 últimas.</p>':"");
  }

  function diario(){
    var items=D.resumenes.slice(-14).reverse();
    var plan=D.plan?'<p class="small"><b>Plan para el '+fecha(D.plan.fecha)+':</b> '+esc(D.plan.texto)+'</p>':"";
    $("bt-diario").innerHTML=plan+(items.length?'<ul class="bt-lista">'+items.map(function(x){
      return '<li><b>'+(x.tipo==="semana"?"Semana hasta el ":"")+fecha(x.fecha)+'</b><br><span class="small">'+esc(x.texto)+'</span></li>';}).join("")+'</ul>':'<p class="small muted">Cada noche, tras el cierre, el bot escribe aquí su resumen del día.</p>');
  }

  function enDirecto(){
    var k=clave(),m=$("bt-directo-msg");
    if(!D)return;
    if(!k){m.innerHTML='Para ver precios en directo, guarda tu clave de Finnhub en <a href="#compras">Mis inversiones</a> → Ajustes. Mientras tanto ves los de la última ejecución del bot.';return;}
    var syms=Object.keys(D.posiciones).concat(["SPY"]);
    m.textContent="Pidiendo precios…";
    Promise.all(syms.map(function(s){
      return fetch("https://finnhub.io/api/v1/quote?symbol="+encodeURIComponent(s)+"&token="+encodeURIComponent(k)).then(function(r){return r.ok?r.json():null;}).then(function(q){if(q&&q.c)directo[s]={c:q.c};}).catch(function(){});
    })).then(function(){
      var ok=Object.keys(directo).length;
      m.textContent=ok?"Precios en directo de las "+new Date().toLocaleTimeString("es-ES",{hour:"2-digit",minute:"2-digit"})+" (con la bolsa cerrada, son los del último cierre).":"No he podido conectar con Finnhub desde aquí. Si estás en España y hay fútbol, puede ser el bloqueo de LaLiga: prueba más tarde.";
      pintar();
    });
  }

  $("bt-recargar").addEventListener("click",function(){directo={};cargar();});
  $("bt-directo").addEventListener("click",function(){directo={};enDirecto();});
  function siVisible(){if(location.hash==="#bot"&&!cargado){cargado=true;cargar();}}
  window.addEventListener("hashchange",siVisible);siVisible();
})();
