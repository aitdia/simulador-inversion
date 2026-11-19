// Mercado: lo que dicen los analistas de cada empresa (datos de js/mercado-datos.js)
// junto a su riesgo histórico (datos de js/datos.js).
(function(){
  "use strict";
  var S=window.SIM,M=window.MERCADO,$=function(id){return document.getElementById(id);};
  var orden="potencial";

  function esc(s){return String(s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});}
  function fecha(f){var p=f.split("-");return p[2]+"/"+p[1]+"/"+p[0];}
  function num(x,d){return x.toLocaleString("es-ES",{minimumFractionDigits:d,maximumFractionDigits:d,useGrouping:"always"});}
  function precio(e,x){var d=x>=1000?0:2;return e.moneda==="$"?"$"+num(x,d):num(x,d)+" "+e.moneda;}
  function pct(x){return (x>0?"+":"")+num(x,0)+" %";}

  // Datos calculados de cada empresa.
  var filas=M.empresas.map(function(e){
    var d=S.porId(e.id),total=e.votos?e.votos.reduce(function(a,b){return a+b;},0):0;
    return {e:e,d:d,nombre:d?d.name:e.id,
      potencial:e.objetivo?(e.objetivo/e.precio-1)*100:null,
      compra:total?(e.votos[0]+e.votos[1])/total*100:null,
      caida:d&&d.dd!==null?d.dd:null,
      anios:d?2025-d.y0+1:null};
  });

  var ORDENES={
    potencial:{nombre:"Más potencial según los analistas",clave:function(f){return f.potencial;},desc:true,
      texto:"Ordenadas por cuánto suben, de media, los precios objetivo de los analistas respecto al precio actual."},
    acuerdo:{nombre:"Más acuerdo entre analistas",clave:function(f){return f.compra===null?null:f.compra+(f.e.analistas||0)/1000;},desc:true,
      texto:"Ordenadas por el porcentaje de analistas que dicen comprar. A igualdad, gana la que sigue más gente."},
    riesgo:{nombre:"Menos caída en su historia",clave:function(f){return f.caida;},desc:true,
      texto:"Ordenadas por su peor caída histórica: arriba las que menos han llegado a caer. No mira la opinión de los analistas."}
  };

  function ordenadas(){
    var o=ORDENES[orden];
    return filas.slice().sort(function(a,b){
      var x=o.clave(a),y=o.clave(b);
      if(x===null&&y===null)return 0;if(x===null)return 1;if(y===null)return -1;
      return o.desc?y-x:x-y;
    });
  }

  function barra(v){
    if(!v)return "";
    var t=v.reduce(function(a,b){return a+b;},0),cls=["sb","b","h","s","ss"],nom=["Compra fuerte","Compra","Mantener","Venta","Venta fuerte"];
    return '<div class="votos" role="img" aria-label="'+v.map(function(n,i){return n+" "+nom[i];}).join(", ")+'">'+
      v.map(function(n,i){return n?'<i class="'+cls[i]+'" style="width:'+(n/t*100)+'%" title="'+nom[i]+': '+n+'"></i>':"";}).join("")+'</div>';
  }

  function tarjeta(f,i){
    var e=f.e;
    return '<article class="mk-card">'+
      '<div class="mk-top"><span class="mk-n">'+(i+1)+'</span><h3>'+esc(f.nombre)+'</h3>'+
      (f.potencial!==null?'<b class="mk-pot '+(f.potencial>=0?"up":"down")+'">'+pct(f.potencial)+'</b>':'')+'</div>'+
      (e.objetivo?'<p class="small">Precio '+precio(e,e.precio)+' · objetivo medio '+precio(e,e.objetivo)+'<br><span class="muted">Entre '+precio(e,e.bajo)+' y '+precio(e,e.alto)+'</span></p>':'<p class="small muted">Sin consenso disponible</p>')+
      barra(e.votos)+
      '<p class="small">'+(f.compra!==null?num(f.compra,0)+' % dicen comprar · '+e.analistas+' analistas':'')+'</p>'+
      '<div class="mk-riesgo small"><span>Peor caída histórica</span><b class="down">'+(f.caida!==null?pct(f.caida):"sin dato")+'</b></div>'+
      (e.nota?'<p class="small aviso-txt">'+esc(e.nota)+'</p>':'')+
      '<div class="acciones"><button type="button" class="mini" data-sim="'+e.id+'">Simularla</button><a class="mini" href="'+e.url+'" target="_blank" rel="noopener">Fuente</a></div>'+
      '<p class="small muted">Dato del '+fecha(e.fecha)+'</p></article>';
  }

  function pintar(){
    var o=ORDENES[orden],lista=ordenadas();
    $("mk-orden").value=orden;
    $("mk-titulo").textContent="Las 5 primeras: "+o.nombre.toLowerCase();
    $("mk-expl").textContent=o.texto;
    $("mk-top5").innerHTML=lista.slice(0,5).map(tarjeta).join("");
    $("mk-tabla").innerHTML=lista.map(function(f,i){
      var e=f.e;
      return '<tr><td class="num">'+(i+1)+'</td><td><b>'+esc(f.nombre)+'</b>'+(e.nota?'<span class="d">'+esc(e.nota)+'</span>':'')+'</td>'+
        '<td>'+(e.consenso||"—")+'</td><td class="num">'+(e.analistas||"—")+'</td>'+
        '<td class="num">'+(f.compra!==null?num(f.compra,0)+" %":"—")+'</td>'+
        '<td class="num">'+precio(e,e.precio)+'</td><td class="num">'+(e.objetivo?precio(e,e.objetivo):"—")+'</td>'+
        '<td class="num '+(f.potencial===null?"":f.potencial>=0?"up":"down")+'">'+(f.potencial!==null?pct(f.potencial):"—")+'</td>'+
        '<td class="num down">'+(f.caida!==null?pct(f.caida):"—")+'</td><td class="num">'+fecha(e.fecha)+'</td></tr>';
    }).join("");
  }

  $("mk-orden").innerHTML=Object.keys(ORDENES).map(function(k){return '<option value="'+k+'">'+ORDENES[k].nombre+'</option>';}).join("");
  $("mk-orden").addEventListener("change",function(e){orden=e.target.value;pintar();});
  $("mk-top5").addEventListener("click",function(e){
    var b=e.target.closest("[data-sim]");if(!b)return;
    var chip=document.querySelector('#chips button[data-id="'+b.dataset.sim+'"]');
    if(chip)chip.click();
    location.hash="#simulador";window.scrollTo(0,0);
  });
  $("mk-fecha").textContent="Buscado en "+M.fuente+" el "+fecha(M.consultado)+". Cada empresa lleva la fecha de su dato.";
  pintar();
})();
