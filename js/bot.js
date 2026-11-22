// Pestaña Bot: enseña lo que guarda el bot (bot/datos.json), la prueba de 10 años (bot/prueba.json)
// y, si hay clave de Finnhub, los precios en directo.
(function(){
  "use strict";
  var $=function(id){return document.getElementById(id);};
  var D=null,P=null,directo={},cargado=false;
  var NOMBRES={};
  function esc(s){return String(s).replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c];});}
  function usd(x){return x===null||x===undefined||isNaN(x)?"—":x.toLocaleString("es-ES",{minimumFractionDigits:2,maximumFractionDigits:2,useGrouping:"always"})+" $";}
  function usd0(x){return x===null||x===undefined||isNaN(x)?"—":Math.round(x).toLocaleString("es-ES",{useGrouping:"always"})+" $";}
  function pc(x){return x===null||x===undefined||isNaN(x)?"—":(x>=0?"+":"")+(x*100).toLocaleString("es-ES",{minimumFractionDigits:1,maximumFractionDigits:1})+" %";}
  function cls(x){return x>0?"up":x<0?"down":"";}
  function fecha(f){var p=String(f).slice(0,10).split("-");return p[2]+"/"+p[1]+"/"+p[0];}
  function nombre(s){var e=(window.SIM&&window.SIM.DATA||[]).filter(function(d){return d.id===s;})[0];return e?e.name+' <span class="muted small">'+s+'</span>':s;}
  function salida(sid){var m=/g(\d+)_p(\d+)_d(\d+)/.exec(sid||"");return m?"vende al +"+m[1]+" %, al −"+m[2]+" % o a los "+m[3]+" días":"";}
  function precio(s){if(directo[s])return directo[s].c;var p=D.precios[s];return p?p.c:null;}
  function clave(){return window.INV&&window.INV.ajustes&&window.INV.ajustes.clave;}

  function cargar(){
    var e=$("bt-estado");e.textContent="Cargando…";
    var t=Date.now();
    Promise.all([
      fetch("bot/datos.json?v="+t,{cache:"no-store"}).then(function(r){if(!r.ok)throw new Error(r.status);return r.json();}),
      fetch("bot/prueba.json?v="+t,{cache:"no-store"}).then(function(r){return r.ok?r.json():null;}).catch(function(){return null;})
    ]).then(function(x){D=x[0];P=x[1];
      Object.keys(D.resumen_reglas||{}).forEach(function(k){NOMBRES[k]=D.resumen_reglas[k].nombre;});
      pintar();prueba();if(clave()&&!Object.keys(directo).length)enDirecto();})
    .catch(function(){
      D=null;
      e.innerHTML=location.protocol==="file:"?"El bot solo se puede ver en la web publicada (aitdia.github.io/simulador-inversion), no abriendo el archivo en el PC.":"No se han podido cargar los datos del bot. Prueba con Actualizar.";
    });
  }

  function valores(){
    var v=D.efectivo;Object.keys(D.posiciones).forEach(function(s){var p=D.posiciones[s],c=precio(s);v+=p.acciones*(c===null?p.precio:c);});
    var spy=precio("SPY"),vi=D.indice&&spy?D.indice.unidades*spy:null;
    var vg=null;if(D.iguales){vg=0;Object.keys(D.iguales.unidades).forEach(function(s){vg+=D.iguales.unidades[s]*(precio(s)||0);});}
    return {bot:v,spy:vi,ig:vg};
  }
  function fiables(reg){var r=D.resumen_reglas||{};return Object.keys(r).filter(function(k){return r[k][reg]&&r[k][reg].fiable;});}

  function pintar(){
    $("bt-capital").textContent=usd0(D.capital);
    var u=D.ultima,est=$("bt-estado");
    var modos={operar:"miró el mercado",repasar:"repasó el día",preparar:"preparó el día",semanal:"hizo el resumen semanal",aprender:"aprendió de la historia"};
    if(u){var t=new Date(u.cuando);var hace=Math.round((Date.now()-t.getTime())/60000);
      var cuando=hace<60?"hace "+Math.max(1,hace)+" min":hace<1440?"hace "+Math.round(hace/60)+" h":"el "+t.toLocaleDateString("es-ES");
      est.innerHTML='<b>Última vez ('+cuando+', '+t.toLocaleTimeString("es-ES",{hour:"2-digit",minute:"2-digit"})+'):</b> '+(modos[u.modo]||u.modo)+'. '+esc(u.nota)+
        (hace>4*1440?' <span class="down">Hace días que no se ejecuta: mira la pestaña Actions del repositorio.</span>':"");}
    var v=valores(),cap=D.capital,reg=D.regimen||"alcista";
    var n=Object.keys(D.posiciones).length,nf=fiables(reg).length;
    $("bt-facts").innerHTML=
      '<div class="fact"><span>El bot tiene</span><b class="'+cls(v.bot-cap)+'">'+usd(v.bot)+'</b><span>'+pc(v.bot/cap-1)+' desde el '+fecha(D.indice?D.indice.fecha:D.inicio)+'</span></div>'+
      '<div class="fact"><span>Con el S&amp;P 500 tendría</span><b class="'+cls((v.spy||cap)-cap)+'">'+usd(v.spy)+'</b><span>'+(v.spy?pc(v.spy/cap-1)+" · el bot va "+(v.bot>=v.spy?"<span class=\"fuerte up\">por delante</span>":"<span class=\"fuerte down\">por detrás</span>"):"")+'</span></div>'+
      '<div class="fact"><span>Con tus empresas a partes iguales</span><b class="'+cls((v.ig||cap)-cap)+'">'+usd(v.ig)+'</b><span>'+(v.ig?pc(v.ig/cap-1):"")+'</span></div>'+
      '<div class="fact"><span>Ahora mismo</span><b>'+n+(n===1?" empresa":" empresas")+'</b><span>'+usd(D.efectivo)+' sin invertir · mercado <span class="fuerte">'+reg+'</span> · '+nf+(nf===1?" regla fiable":" reglas fiables")+'</span></div>';
    grafico($("bt-grafico"),D.curva.slice(),true,cap);posiciones();reglas();operaciones();diario();
  }

  function grafico(g,c,conAhora,cap){
    var v=D?valores():null,hoy=new Date().toISOString().slice(0,10);
    if(conAhora&&c.length&&Object.keys(directo).length&&v.spy!==null)c.push([hoy+" (ahora)",v.bot,v.spy,v.ig]);
    if(c.length<2){g.innerHTML='<p class="small muted">La gráfica aparece cuando el bot lleve al menos dos días repasando el cierre.</p>';return;}
    var W=640,H=230,PL=6,PR=6,PT=10,PB=6,min=Infinity,max=-Infinity;
    c.forEach(function(p){[p[1],p[2],p[3]].forEach(function(y){if(y!==null&&y!==undefined){min=Math.min(min,y);max=Math.max(max,y);}});});
    min=Math.min(min,cap);max=Math.max(max,cap);var pad=(max-min)*0.08||10;min-=pad;max+=pad;
    function X(i){return PL+(W-PL-PR)*i/(c.length-1);}function Y(y){return PT+(H-PT-PB)*(1-(y-min)/(max-min));}
    function linea(k){return c.map(function(p,i){return p[k]===null||p[k]===undefined?"":(i&&c[i-1][k]!=null?"L":"M")+X(i).toFixed(1)+","+Y(p[k]).toFixed(1);}).join("");}
    var base=Y(cap);
    g.innerHTML='<svg viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none" aria-hidden="true">'+
      '<line x1="'+PL+'" x2="'+(W-PR)+'" y1="'+base+'" y2="'+base+'" class="g-base"/>'+
      '<path d="'+linea(3)+'" class="g-ig"/><path d="'+linea(2)+'" class="g-spy"/><path d="'+linea(1)+'" class="g-bot"/></svg>'+
      '<div class="bt-ejes small muted"><span>'+fecha(c[0][0])+'</span><span>línea de puntos: los '+usd0(cap)+' del principio</span><span>'+(String(c[c.length-1][0]).indexOf("ahora")>-1?"ahora":fecha(c[c.length-1][0]))+'</span></div>';
    var u=c[c.length-1];
    g.setAttribute("aria-label","Bot "+usd0(u[1])+", S&P 500 "+usd0(u[2])+", tus empresas "+usd0(u[3]));
  }

  function posiciones(){
    var ks=Object.keys(D.posiciones);
    if(!ks.length){$("bt-pos").innerHTML='<tr><td colspan="6" class="muted">Ahora no tiene ninguna acción. Comprará cuando alguna empresa cumpla una de sus reglas fiables para el mercado de ahora.</td></tr>';return;}
    $("bt-pos").innerHTML=ks.map(function(s){
      var p=D.posiciones[s],c=precio(s),val=c===null?null:p.acciones*c,g=val===null?null:val-p.coste;
      return '<tr><td>'+nombre(s)+'</td><td class="num">'+fecha(p.fecha)+'</td><td class="num">'+usd(p.precio)+'</td><td class="num">'+usd(c)+(directo[s]?' <span class="small up">●</span>':"")+'</td>'+
        '<td class="num '+cls(g)+'">'+(g===null?"—":usd(g)+'<span class="d small">'+pc(g/p.coste)+'</span>')+'</td><td class="small">'+esc(NOMBRES[p.regla]||p.regla)+'<span class="d muted">'+salida(p.salida)+'</span></td></tr>';
    }).join("");
  }

  function celda(x){
    if(!x)return '<td class="num muted">sin casos</td>';
    var est=x.fiable?'<span class="up">fiable</span>':x.casos<30?'<span class="muted">pocos casos</span>':'<span class="down">no gana</span>';
    return '<td class="num"><b class="'+cls(x.media)+'">'+pc(x.media)+'</b><span class="d small">'+Math.round(x.casos)+' casos · '+est+'</span></td>';
  }
  function reglas(){
    var r=D.resumen_reglas||{},reg=D.regimen||"alcista";$("bt-reg-txt").textContent=reg;
    var ks=Object.keys(r).sort(function(a,b){
      var A=r[a][reg],B=r[b][reg];return ((B&&B.fiable)-(A&&A.fiable))||((B?B.media:-9)-(A?A.media:-9));});
    $("bt-reglas").innerHTML=ks.map(function(k){
      var x=r[k],ahora=x[reg],re=(D.reales||{})[k];
      return '<tr'+(ahora&&ahora.fiable?' class="fila-fiable"':'')+'><td>'+esc(x.nombre)+'</td>'+celda(x.alcista)+celda(x.bajista)+
        '<td class="small">'+(ahora?salida(ahora.salida):"—")+'</td>'+
        '<td class="num">'+(re?re.n+'<span class="d small '+cls(re.resultado)+'">'+usd(re.resultado)+'</span>':"—")+'</td></tr>';
    }).join("");
  }

  function operaciones(){
    var ops=D.operaciones.slice(-40).reverse();
    if(!ops.length){$("bt-ops").innerHTML='<p class="small muted">Aún no ha hecho ninguna operación con dinero ficticio de verdad.</p>';return;}
    var ventas=D.operaciones.filter(function(o){return o.tipo==="venta";}),gan=ventas.filter(function(o){return o.resultado>0;}).length,tot=ventas.reduce(function(a,o){return a+o.resultado;},0);
    $("bt-ops").innerHTML=(ventas.length?'<p class="small">Ha cerrado '+ventas.length+(ventas.length===1?" operación":" operaciones")+': '+gan+' con ganancia y '+(ventas.length-gan)+' con pérdida, en total <b class="'+cls(tot)+'">'+usd(tot)+'</b> (ya con comisiones).</p>':"")+
      '<ul class="bt-lista">'+ops.map(function(o){
        return '<li><span class="bt-tag '+(o.tipo==="compra"?"c":"v")+'">'+(o.tipo==="compra"?"Compra":"Venta")+'</span> <b>'+nombre(o.sym)+'</b> <span class="muted small">'+fecha(o.fecha)+' '+o.hora+' (hora de Nueva York)</span>'+
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

  function prueba(){
    var box=$("bt-prueba");if(!P){box.hidden=true;return;}box.hidden=false;
    var f=P.final,cap=P.capital,am=P.anual_medio,pk=P.peor_caida;
    $("pr-intro").innerHTML='Así le habría ido al bot desde el '+fecha(P.opera_desde)+' hasta el '+fecha(P.hasta)+', empezando con '+usd0(cap)+'. Aprendió con el año anterior y, cada día, solo usó lo que había aprendido hasta ese día: nunca miró el futuro. Precios ajustados con dividendos, comisión de '+P.comision+' $ por operación.';
    function hecho(t,v,k){return '<div class="fact"><span>'+t+'</span><b class="'+cls(v-cap)+'">'+usd0(v)+'</b><span>'+pc(am[k])+' al año · peor caída '+pc(pk[k])+'</span></div>';}
    $("pr-facts").innerHTML=hecho("Bot",f.bot,"bot")+hecho("S&amp;P 500",f.spy,"spy")+hecho("Tus empresas a partes iguales",f.iguales,"iguales")+
      '<div class="fact"><span>Operaciones</span><b>'+P.operaciones.toLocaleString("es-ES")+'</b><span>'+Math.round(P.ganadoras/P.operaciones*100)+' % con ganancia · de media '+pc(P.media_operacion)+' cada una</span></div>';
    grafico($("pr-grafico"),P.curva,false,cap);
    var ganados=P.anios.filter(function(a){return a.bot>a.spy;}).length;
    $("pr-anios").innerHTML=P.anios.map(function(a,i){
      var parcial=i===0||i===P.anios.length-1;
      return '<tr><td>'+a.anio+(parcial?' <span class="muted small">(parcial)</span>':'')+'</td><td class="num '+cls(a.bot)+'">'+pc(a.bot)+'</td><td class="num '+cls(a.spy)+'">'+pc(a.spy)+'</td><td class="num '+cls(a.iguales)+'">'+pc(a.iguales)+'</td><td>'+(a.bot>a.spy?'<span class="up">Sí</span>':'<span class="down">No</span>')+'</td></tr>';
    }).join("")+'<tr><td colspan="5" class="small muted">Gana al S&amp;P 500 en '+ganados+' de '+P.anios.length+' años.</td></tr>';
    $("pr-ojo").innerHTML='<b>Ojo, este resultado es optimista.</b> '+
      '1) Las empresas que vigila son las grandes de <i>hoy</i>: hace 10 años nadie sabía que lo serían, y las que se hundieron por el camino no están en la lista. '+
      '2) «Tus empresas» las has elegido sabiendo cómo les ha ido (Nvidia, AMD…), así que esa línea parece mejor de lo que habría sido de verdad. '+
      '3) Hay mucha suerte: al cambiar un detalle mínimo del bot (no volver a comprar el mismo día lo que acaba de vender), el resultado de los 10 años pasó de unos 16.000 $ a casi 20.000 $. '+
      'Por eso lo que cuenta de verdad es cómo le vaya a partir de ahora, con dinero ficticio, frente al S&amp;P 500.';
  }

  function enDirecto(){
    var k=clave(),m=$("bt-directo-msg");
    if(!D)return;
    if(!k){m.innerHTML='Para ver precios en directo, guarda tu clave de Finnhub en <a href="#compras">Mis inversiones</a> → Precios automáticos. Mientras tanto ves los de la última ejecución del bot.';return;}
    var syms=Object.keys(D.posiciones).concat(["SPY"]).concat(D.iguales?D.iguales.empresas:[]);
    syms=syms.filter(function(s,i){return syms.indexOf(s)===i;});
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
