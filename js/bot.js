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
    var cd=D.comparar_desde,b0=cd?cd.valor:cap,f0=fecha(cd?cd.fecha:(D.indice?D.indice.fecha:D.inicio));
    var g=function(x){return x==null?"—":pc(x/b0-1);};
    $("bt-facts").innerHTML=
      '<div class="fact"><span>El bot tiene</span><b class="'+cls(v.bot-b0)+'">'+usd(v.bot)+'</b><span>'+g(v.bot)+' desde el '+f0+' · '+pc(v.bot/cap-1)+' desde que empezó con '+usd0(cap)+'</span></div>'+
      '<div class="fact"><span>Con el S&amp;P 500 tendría</span><b class="'+cls((v.spy||b0)-b0)+'">'+usd(v.spy)+'</b><span>'+(v.spy?g(v.spy)+" desde el "+f0+" · el bot va "+(v.bot>=v.spy?"<span class=\"fuerte up\">por delante</span>":"<span class=\"fuerte down\">por detrás</span>"):"")+'</span></div>'+
      '<div class="fact"><span>Con tus empresas a partes iguales</span><b class="'+cls((v.ig||b0)-b0)+'">'+usd(v.ig)+'</b><span>'+(v.ig?g(v.ig)+" desde el "+f0:"")+'</span></div>'+
      '<div class="fact"><span>Ahora mismo</span><b>'+n+(n===1?" empresa":" empresas")+'</b><span>'+usd(D.efectivo)+' sin invertir · mercado <span class="fuerte">'+reg+'</span> · '+nf+(nf===1?" regla fiable":" reglas fiables")+'</span></div>'+
      (cd?'<p class="small muted" style="grid-column:1/-1;margin:0">La comparación empieza el '+f0+' al cierre, cuando el bot ya había hecho sus primeras compras: los tres parten con el mismo dinero ('+usd(b0)+').</p>':'');
    grafico($("bt-grafico"),D.curva.slice(),true,b0);posiciones();reglas();operaciones();diario();
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
      '<div class="bt-ejes small muted"><span>'+fecha(c[0][0])+'</span><span>línea de puntos: '+usd0(cap)+', el punto de partida</span><span>'+(String(c[c.length-1][0]).indexOf("ahora")>-1?"ahora":fecha(c[c.length-1][0]))+'</span></div>';
    var u=c[c.length-1];
    g.setAttribute("aria-label","Bot "+usd0(u[1])+", S&P 500 "+usd0(u[2])+", tus empresas "+usd0(u[3]));
  }

  function posiciones(){
    var ks=Object.keys(D.posiciones);
    if(!ks.length){$("bt-pos").innerHTML='<tr><td colspan="6" class="muted">Ahora no tiene ninguna acción. Comprará cuando alguna empresa cumpla una de sus reglas fiables para el mercado de ahora.</td></tr>';return;}
    $("bt-pos").innerHTML=ks.map(function(s){
      var p=D.posiciones[s],c=precio(s),val=c===null?null:p.acciones*c,g=val===null?null:val-p.coste;
      return '<tr class="bt-clic" data-pos="'+esc(s)+'" tabindex="0" title="Ver en la gráfica"><td>'+nombre(s)+' <span class="bt-ver" aria-hidden="true">📈</span></td><td class="num">'+fecha(p.fecha)+'</td><td class="num">'+usd(p.precio)+'</td><td class="num">'+usd(c)+(directo[s]?' <span class="small up">●</span>':"")+'</td>'+
        '<td class="num '+cls(g)+'">'+(g===null?"—":usd(g)+'<span class="d small">'+pc(g/p.coste)+'</span>')+'</td><td class="small">'+esc(NOMBRES[p.regla]||p.regla)+'<span class="d muted">'+salida(p.salida)+'</span></td></tr>';
    }).join("");
  }

  function celda(x){
    if(!x)return '<td class="num muted">sin casos</td>';
    var est=x.fiable?'<span class="up">fiable</span>':x.casos<30?'<span class="muted">pocos casos</span>':x.media>0?'<span class="down">últimamente no</span>':'<span class="down">no gana</span>';
    var ult=x.rec_media===null||x.rec_media===undefined?"":'<span class="d small">últimamente <span class="'+cls(x.rec_media)+'">'+pc(x.rec_media)+'</span> ('+Math.round(x.rec_casos)+')</span>';
    return '<td class="num"><b class="'+cls(x.media)+'">'+pc(x.media)+'</b><span class="d small">'+Math.round(x.casos)+' casos · '+est+'</span>'+ult+'</td>';
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
        var i=D.operaciones.indexOf(o);
        return '<li class="bt-clic" data-op="'+i+'" tabindex="0"><span class="bt-tag '+(o.tipo==="compra"?"c":"v")+'">'+(o.tipo==="compra"?"Compra":"Venta")+'</span> <b>'+nombre(o.sym)+'</b> <span class="muted small">'+fecha(o.fecha)+' '+o.hora+' (hora de Nueva York)</span>'+
          '<br><span class="small">'+o.acciones.toLocaleString("es-ES",{maximumFractionDigits:4})+' acciones a '+usd(o.precio)+(o.tipo==="venta"?' · resultado <b class="'+cls(o.resultado)+'">'+usd(o.resultado)+'</b> ('+pc(o.resultado_pct/100)+')':"")+'</span>'+
          '<br><span class="small muted">'+esc(o.motivo)+'</span><br><span class="small bt-vertxt">📈 Ver en la gráfica</span></li>';
      }).join("")+'</ul>'+(D.operaciones.length>40?'<p class="small muted">Se muestran las 40 últimas.</p>':"");
  }

  // ---------- Explicación de una operación con su gráfica ----------
  var HIST=null;
  function cargarHist(){
    if(HIST)return Promise.resolve(HIST);
    return fetch("bot/historial.json?v="+Date.now(),{cache:"no-store"}).then(function(r){if(!r.ok)throw new Error(r.status);return r.json();}).then(function(h){HIST=h;return h;});
  }
  function partes(sid){var m=/g(\d+)_p(\d+)_d(\d+)/.exec(sid||"");return m?{g:+m[1]/100,p:+m[2]/100,d:+m[3]}:null;}
  // De una operación saca su compra y, si ya la vendió, su venta.
  function parDe(i){
    var o=D.operaciones[i],ci=-1;
    if(o.tipo==="compra")ci=i;else for(var j=i-1;j>=0;j--)if(D.operaciones[j].sym===o.sym&&D.operaciones[j].tipo==="compra"){ci=j;break;}
    if(ci<0)return null;
    var c=D.operaciones[ci],v=null;
    for(var k=ci+1;k<D.operaciones.length;k++){var x=D.operaciones[k];if(x.sym!==c.sym)continue;if(x.tipo==="venta"){v=x;}break;}
    var pos=D.posiciones[c.sym];
    var abierta=!v&&pos&&pos.fecha===c.fecha?pos:null;
    return {sym:c.sym,fecha:c.fecha,hora:c.hora,precio:c.precio,regla:c.regla,salida:c.salida||(abierta&&abierta.salida),regimen:abierta?abierta.regimen:null,motivo:c.motivo,venta:v,abierta:abierta};
  }
  function parDePos(s){
    var p=D.posiciones[s];
    for(var i=D.operaciones.length-1;i>=0;i--){var o=D.operaciones[i];if(o.sym===s&&o.tipo==="compra"&&o.fecha===p.fecha)return parDe(i);}
    return {sym:s,fecha:p.fecha,hora:"",precio:p.precio,regla:p.regla,salida:p.salida,regimen:p.regimen,motivo:"",venta:null,abierta:p};
  }

  function explicar(t){
    var dlg=$("bt-dlg");
    $("bt-dlg-tit").innerHTML=nombre(t.sym);
    $("bt-dlg-cuerpo").innerHTML='<p class="small muted">Cargando la gráfica…</p>';
    if(dlg.showModal&&!dlg.open)dlg.showModal();else dlg.setAttribute("open","");
    cargarHist().then(function(h){pintarExplicacion(t,h[t.sym]||[]);})
      .catch(function(){pintarExplicacion(t,[]);});
  }

  function pintarExplicacion(t,serie){
    var pl=partes(t.salida),obj=pl?t.precio*(1+pl.g):null,lim=pl?t.precio*(1-pl.p):null;
    var pts=serie.map(function(x){return {f:x[0],c:x[1]};});
    var ahora=t.abierta?precio(t.sym):null;
    // Si la compra o la venta fueron hoy, aún no está su cierre: se añade el precio al que operó.
    if(!pts.length||pts[pts.length-1].f<t.fecha)pts.push({f:t.fecha,c:t.precio});
    if(t.venta&&pts[pts.length-1].f<t.venta.fecha)pts.push({f:t.venta.fecha,c:t.venta.precio});
    if(t.abierta&&ahora!==null)pts.push({f:"ahora",c:ahora,ahora:true});
    // Ventana: 40 días antes de la compra hasta 10 después de la venta (o hasta hoy)
    var iC=pts.findIndex(function(x){return x.f>=t.fecha;});if(iC<0)iC=pts.length-1;
    var iV=t.venta?pts.findIndex(function(x){return x.f>=t.venta.fecha;}):-1;
    var desde=Math.max(0,iC-20),hasta=t.venta&&iV>=0?Math.min(pts.length-1,iV+10):pts.length-1;
    var w=pts.slice(desde,hasta+1);iC-=desde;if(iV>=0)iV-=desde;
    var grafico='<p class="small muted">No hay precios guardados de esta empresa para dibujarla.</p>';
    if(w.length>=2){
      var W=640,H=260,PL=8,PR=8,PT=14,PB=8,mn=Infinity,mx=-Infinity;
      w.forEach(function(x){mn=Math.min(mn,x.c);mx=Math.max(mx,x.c);});
      [t.precio,obj,lim,t.venta&&t.venta.precio].forEach(function(y){if(y){mn=Math.min(mn,y);mx=Math.max(mx,y);}});
      var pad=(mx-mn)*0.08||1;mn-=pad;mx+=pad;
      var X=function(i){return PL+(W-PL-PR)*i/(w.length-1);},Y=function(y){return PT+(H-PT-PB)*(1-(y-mn)/(mx-mn));};
      var linea=w.map(function(x,i){return (i?"L":"M")+X(i).toFixed(1)+","+Y(x.c).toFixed(1);}).join("");
      var hz=function(y,c,txt){return y?'<line x1="'+PL+'" x2="'+(W-PR)+'" y1="'+Y(y).toFixed(1)+'" y2="'+Y(y).toFixed(1)+'" class="'+c+'"/><text x="'+(PL+4)+'" y="'+(Y(y)-5).toFixed(1)+'" text-anchor="start" class="ex-txt '+c+'">'+txt+'</text>':"";};
      var punto=function(i,y,c,txt){var x=X(i),an=x>W-60?"end":x<60?"start":"middle";return '<circle cx="'+x.toFixed(1)+'" cy="'+Y(y).toFixed(1)+'" r="6" class="'+c+'"/><text x="'+(an==="end"?x-8:an==="start"?x+8:x).toFixed(1)+'" y="'+(Y(y)+(c==="ex-v"?22:-12)).toFixed(1)+'" text-anchor="'+an+'" class="ex-txt ex-et">'+txt+'</text>';};
      var finX=t.venta&&iV>=0?iV:w.length-1;
      grafico='<svg viewBox="0 0 '+W+' '+H+'" class="ex-svg" role="img" aria-label="Precio de '+esc(t.sym)+' con la compra y la venta del bot">'+
        (pl?'<rect x="'+X(iC).toFixed(1)+'" y="'+PT+'" width="'+Math.max(2,X(finX)-X(iC)).toFixed(1)+'" height="'+(H-PT-PB)+'" class="ex-tramo"/>':"")+
        hz(obj,"ex-obj","objetivo "+pc(pl&&pl.g))+hz(lim,"ex-lim","límite −"+(pl?Math.round(pl.p*100):"")+" %")+
        '<path d="'+linea+'" class="ex-linea"/>'+
        punto(iC,t.precio,"ex-c","compra")+(t.venta&&iV>=0?punto(iV,t.venta.precio,"ex-v","venta"):"")+
        (t.abierta&&ahora!==null?'<circle cx="'+X(w.length-1).toFixed(1)+'" cy="'+Y(ahora).toFixed(1)+'" r="4" class="ex-ahora"/>':"")+'</svg>'+
        '<div class="bt-ejes small muted"><span>'+fecha(w[0].f)+'</span><span>cierre de cada día'+(t.abierta?" y precio de ahora":"")+'</span><span>'+(w[w.length-1].ahora?"ahora":fecha(w[w.length-1].f))+'</span></div>';
    }
    // Texto
    var r=(D.resumen_reglas||{})[t.regla]||{},reg=t.regimen||D.regimen||"alcista",st=r[reg];
    var re=(D.reales||{})[t.regla];
    var html='<div class="ex-pasos">'+
      '<div><span class="bt-tag c">1 · Compra</span> El '+fecha(t.fecha)+(t.hora?' a las '+t.hora+' (Nueva York)':'')+', a '+usd(t.precio)+'. '+
        'Señal: <b>'+esc(r.nombre||NOMBRES[t.regla]||t.regla)+'</b>.'+(t.motivo?'<br><span class="small muted">'+esc(t.motivo)+'</span>':'')+'</div>'+
      (pl?'<div><span class="bt-tag n">2 · Plan de venta</span> Vender si llega a <b class="up">'+usd(obj)+'</b> ('+pc(pl.g)+'), si baja a <b class="down">'+usd(lim)+'</b> (−'+Math.round(pl.p*100)+' %) o, si no pasa ninguna de las dos, a los <b>'+pl.d+' días de bolsa</b>. Es la forma de vender que mejor le ha funcionado con esta señal.</div>':'')+
      (t.venta?'<div><span class="bt-tag v">3 · Venta</span> El '+fecha(t.venta.fecha)+' a '+usd(t.venta.precio)+'. '+esc(t.venta.motivo)+' Resultado: <b class="'+cls(t.venta.resultado)+'">'+usd(t.venta.resultado)+'</b> ('+pc(t.venta.resultado_pct/100)+'), ya con comisiones.'+
          (pl&&(t.venta.precio<lim*0.99||t.venta.precio>obj*1.01)?'<br><span class="small muted">Vendió más allá de su '+(t.venta.precio<lim?'límite':'objetivo')+' porque solo mira el precio una vez cada hora: entre una vuelta y otra el precio siguió moviéndose.</span>':'')+'</div>'
        :(t.abierta?'<div><span class="bt-tag n">3 · Ahora</span> Sigue comprada. '+(ahora!==null?'Va a <b>'+usd(ahora)+'</b>: <b class="'+cls(ahora-t.precio)+'">'+pc(ahora/t.precio-1)+'</b> desde la compra.':'')+'</div>':''))+
      '</div>';
    html+='<div class="ex-graf">'+grafico+'</div>'+
      '<div class="bt-leyenda small"><span><i class="l-bot"></i>Precio</span><span><i class="l-obj"></i>Objetivo</span><span><i class="l-lim"></i>Límite</span><span><i class="l-tramo"></i>Tiempo que la tuvo</span></div>';
    if(st)html+='<p class="small">Por qué se fía de esta señal: con el mercado '+reg+', en '+Math.round(st.casos)+' casos de su historia ha ganado de media <b class="'+cls(st.media)+'">'+pc(st.media)+'</b> más que el S&amp;P 500 y ha acertado el '+Math.round(st.acierta*100)+' % de las veces'+
      (st.rec_media!=null?'; últimamente, '+pc(st.rec_media)+' en '+Math.round(st.rec_casos)+' casos':'')+'.'+
      (re?' Con dinero ficticio de verdad la ha usado '+re.n+(re.n===1?' vez':' veces')+', con un resultado de <b class="'+cls(re.resultado)+'">'+usd(re.resultado)+'</b>.':'')+'</p>';
    html+='<p class="small muted">Ganar «más que el S&amp;P 500 de media» no quiere decir que acierte siempre: es una media de muchos casos, y cada operación suelta puede salir bien o mal.</p>';
    $("bt-dlg-cuerpo").innerHTML=html;
  }

  function alPulsar(e){
    var el=e.target.closest(".bt-clic");if(!el||!D)return;
    if(e.type==="keydown"&&e.key!=="Enter"&&e.key!==" ")return;
    if(e.type==="keydown")e.preventDefault();
    var t=el.dataset.pos?parDePos(el.dataset.pos):parDe(+el.dataset.op);
    if(t)explicar(t);
  }
  ["bt-pos","bt-ops"].forEach(function(id){$(id).addEventListener("click",alPulsar);$(id).addEventListener("keydown",alPulsar);});
  $("bt-dlg-cerrar").addEventListener("click",function(){var d=$("bt-dlg");if(d.close)d.close();else d.removeAttribute("open");});
  $("bt-dlg").addEventListener("click",function(e){if(e.target===this&&this.close)this.close();});

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
      '3) Hay mucha suerte: detalles mínimos del bot cambian mucho el resultado de los 10 años. '+
      'Por eso lo que cuenta de verdad es cómo le vaya a partir de ahora, con dinero ficticio, frente al S&amp;P 500.'+
      (P.variantes?'<div class="scroll" style="margin-top:10px"><table class="tabla-x tabla-bt"><thead><tr><th>Versión del bot (misma prueba de 10 años)</th><th>Acaba con</th><th>Peor caída</th></tr></thead><tbody>'+
        P.variantes.filas.map(function(v){return '<tr><td>'+esc(v[0])+'</td><td class="num">'+usd0(v[1])+'</td><td class="num down">'+pc(v[2])+'</td></tr>';}).join("")+
        '<tr><td class="small muted" colspan="3">S&amp;P 500 en la misma prueba: '+usd0(f.spy)+'. Cuanto más se protege el bot contra la suerte y contra jugárselo todo a una carta, menos gana: señal de que lo que ganaba de más era sobre todo suerte.</td></tr></tbody></table></div>':'');
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
