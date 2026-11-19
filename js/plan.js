// Plan: cuánto poner al mes para llegar a una cifra, y cómo repartir la aportación de este mes.
(function(){
  "use strict";
  var S=window.SIM,I=window.INV,$=function(id){return document.getElementById(id);};

  // ---------- Objetivo ----------
  function valorCartera(){return I.calcular().posiciones.reduce(function(a,p){return a+I.valorPos(p);},0);}
  function num(id,min,max){var v=parseFloat(String($(id).value).replace(",","."));return isNaN(v)?null:Math.min(max,Math.max(min,v));}
  // Cuota mensual para llegar a "meta" en "anios" partiendo de "ya", con rentabilidad anual r.
  function cuota(meta,anios,ya,r){
    var n=Math.round(anios*12),rm=Math.pow(1+r,1/12)-1,fv=ya*Math.pow(1+rm,n),falta=meta-fv;
    if(falta<=0)return 0;
    return rm===0?falta/n:falta*rm/((Math.pow(1+rm,n)-1)*(1+rm));
  }
  function pintarObjetivo(){
    var meta=num("o-meta",1,1e8),anios=num("o-anios",1,50),ya=num("o-ya",0,1e8);
    if(meta===null||anios===null||ya===null){$("o-res").innerHTML='<p class="muted">Rellena los tres datos para ver el cálculo.</p>';return;}
    var esc=[[0,"Sin rentabilidad","solo ahorrando"],[0.04,"Si rinde un 4 % al año","prudente"],[0.07,"Si rinde un 7 % al año","media de la bolsa a largo plazo"],[0.10,"Si rinde un 10 % al año","optimista"]];
    $("o-res").innerHTML='<div class="facts">'+esc.map(function(e){
      var c=cuota(meta,anios,ya,e[0]);
      return '<div class="fact"><span>'+e[1]+'</span><b>'+(c<=0?"Ya llegas":I.eur0.format(Math.ceil(c))+" al mes")+'</b><span>'+e[2]+'</span></div>';
    }).join("")+'</div>'+
    '<p class="small muted">Para tener '+I.eur0.format(meta)+' dentro de '+anios+(anios===1?" año":" años")+' partiendo de '+I.eur0.format(ya)+'. Sin contar comisiones ni impuestos. Ninguna rentabilidad está garantizada: en los malos años la cifra puede quedarse lejos.</p>';
  }
  ["o-meta","o-anios","o-ya"].forEach(function(id){$(id).addEventListener("input",pintarObjetivo);});
  $("o-usar").addEventListener("click",function(){$("o-ya").value=Math.round(valorCartera());pintarObjetivo();});

  // ---------- Reparto mensual ----------
  if(!I.objetivos.length)I.objetivos=[{id:"SPY",pct:70},{id:"NVDA",pct:15},{id:"SONY",pct:15}];
  function opciones(sel){return S.DATA.map(function(d){return '<option value="'+d.id+'"'+(d.id===sel?" selected":"")+'>'+d.name+'</option>';}).join("");}
  function pintarObjetivos(){
    $("x-filas").innerHTML=I.objetivos.map(function(o,i){
      return '<div class="fila"><select data-i="'+i+'" aria-label="Empresa '+(i+1)+'">'+opciones(o.id)+'</select>'+
        '<input type="number" data-i="'+i+'" min="0" max="100" step="1" value="'+o.pct+'" aria-label="Porcentaje de la empresa '+(i+1)+'"><span class="muted">%</span>'+
        '<button type="button" class="del" data-del="'+i+'"'+(I.objetivos.length===1?" disabled":"")+'>Quitar</button></div>';
    }).join("");
    pintarReparto();
  }
  function pintarReparto(){
    var suma=I.objetivos.reduce(function(a,o){return a+(o.pct||0);},0);
    $("x-suma").textContent="Suma: "+I.num(suma,1)+" %";
    $("x-suma").className="num "+(Math.abs(suma-100)<0.01?"up":"down");
    var mes=num("x-mes",0,1e7),fee=num("x-fee",0,50);
    if(Math.abs(suma-100)>=0.01){$("x-res").innerHTML='<div class="warn">Los porcentajes tienen que sumar 100 %. Ahora suman '+I.num(suma,1)+' %.</div>';return;}
    if(!(mes>0)){$("x-res").innerHTML='<p class="muted">Pon cuánto vas a invertir este mes.</p>';return;}

    // Lo que ya tienes de cada empresa (con precio actual si lo has puesto).
    var tengo={},total=0;
    I.calcular().posiciones.forEach(function(p){var v=I.valorPos(p);total+=v;tengo[p.clave]=(tengo[p.clave]||0)+v;});
    var objs={};I.objetivos.forEach(function(o){objs[o.id]=(objs[o.id]||0)+o.pct;});
    var ids=Object.keys(objs),fin=total+mes;
    // Primero se compra lo que más se ha quedado por debajo de su porcentaje.
    var falta={},sumFalta=0;
    ids.forEach(function(id){falta[id]=Math.max(0,fin*objs[id]/100-(tengo[id]||0));sumFalta+=falta[id];});
    var compra={};
    ids.forEach(function(id){compra[id]=sumFalta>0?mes*falta[id]/sumFalta:mes*objs[id]/100;});
    var fuera=Object.keys(tengo).filter(function(k){return !objs[k];});

    $("x-res").innerHTML='<div class="scroll"><table class="izq tabla-x"><thead><tr><th>Empresa</th><th>Tienes ahora</th><th>Peso ahora</th><th>Objetivo</th><th>Comprar este mes</th></tr></thead><tbody>'+
      ids.sort(function(a,b){return compra[b]-compra[a];}).map(function(id){
        var d=S.porId(id),c=compra[id],t=tengo[id]||0,caro=c>0&&fee>0&&fee/c>0.01;
        return '<tr><td>'+I.esc(d?d.name:id)+'</td><td class="num">'+I.eur.format(t)+'</td><td class="num">'+(total>0?I.num(t/total*100,1)+" %":"—")+'</td><td class="num">'+I.num(objs[id],1)+' %</td>'+
          '<td class="num"><b>'+(c<0.5?"Nada":I.eur.format(c))+'</b>'+(caro?'<span class="d aviso-txt">La comisión sería un '+I.num(fee/c*100,1)+' %</span>':'')+'</td></tr>';
      }).join("")+'</tbody></table></div>'+
      (fuera.length?'<p class="small muted">Tienes acciones que no están en tu reparto ('+fuera.map(function(k){var p=I.calcular().posiciones.filter(function(x){return x.clave===k;})[0];return I.esc(p?p.nombre:k);}).join(", ")+'). Cuentan para el total, pero no se compran.</p>':'')+
      '<p class="small muted">Se reparte el dinero nuevo entre las empresas que se han quedado por debajo de su porcentaje, sin vender nada. '+(total>0?"Usa el valor actual de lo que tienes en Mis inversiones.":"Como aún no tienes nada apuntado, se reparte según tus porcentajes.")+' Es un cálculo para mantener el reparto que tú eliges, no una recomendación de qué comprar.</p>';
  }
  $("x-filas").addEventListener("change",function(e){
    var i=e.target.dataset.i;if(i===undefined)return;
    if(e.target.tagName==="SELECT"){I.objetivos[i].id=e.target.value;I.guardar();}
  });
  $("x-filas").addEventListener("input",function(e){
    var i=e.target.dataset.i;if(i===undefined||e.target.tagName!=="INPUT")return;
    var v=parseFloat(e.target.value);I.objetivos[i].pct=isNaN(v)?0:Math.max(0,Math.min(100,v));I.guardar();
  });
  $("x-filas").addEventListener("click",function(e){
    var i=e.target.dataset.del;if(i===undefined||I.objetivos.length===1)return;
    I.objetivos.splice(+i,1);I.guardar();pintarObjetivos();
  });
  $("x-add").addEventListener("click",function(){
    var usadas=I.objetivos.map(function(o){return o.id;});
    var libre=S.DATA.filter(function(d){return usadas.indexOf(d.id)===-1;})[0]||S.DATA[0];
    I.objetivos.push({id:libre.id,pct:0});I.guardar();pintarObjetivos();
  });
  $("x-mes").addEventListener("input",pintarReparto);
  $("x-fee").addEventListener("input",pintarReparto);
  $("x-fee").value=I.ajustes.fee;

  I.alCambiar(pintarReparto);
  pintarObjetivos();pintarObjetivo();
})();
