// Renta: ganancias y pérdidas de tus ventas en cada año, para la declaración.
(function(){
  "use strict";
  var I=window.INV,$=function(id){return document.getElementById(id);};
  var anio=null;

  function pintar(){
    var r=I.calcular(),ventas=r.ventas;
    var anios={};anios[+I.hoy().slice(0,4)]=1;ventas.forEach(function(v){anios[v.anio]=1;});
    var lista=Object.keys(anios).map(Number).sort(function(a,b){return b-a;});
    if(anio===null||lista.indexOf(anio)===-1)anio=lista[0];
    $("r-anio").innerHTML=lista.map(function(a){return '<option value="'+a+'"'+(a===anio?" selected":"")+'>'+a+'</option>';}).join("");
    $("r-presenta").textContent="Se declara en la renta de "+anio+", que se presenta entre abril y junio de "+(anio+1)+".";

    var del=ventas.filter(function(v){return v.anio===anio;});
    var gan=0,per=0,bloq=0;
    del.forEach(function(v){if(v.ganancia>=0)gan+=v.ganancia;else if(v.dosMeses)bloq+=v.ganancia;else per+=v.ganancia;});
    var neto=gan+per,imp=I.impuesto(neto);
    $("r-resumen").innerHTML=
      '<div class="fact"><span>Ganancias</span><b class="up">+'+I.eur.format(gan)+'</b></div>'+
      '<div class="fact"><span>Pérdidas que puedes restar</span><b class="down">'+I.eur.format(per)+'</b></div>'+
      '<div class="fact"><span>Resultado</span><b class="'+(neto>=0?"up":"down")+'">'+(neto>=0?"+":"")+I.eur.format(neto)+'</b></div>'+
      '<div class="fact"><span>Impuesto aproximado</span><b>'+I.eur.format(imp)+'</b><span>'+(neto>0?"19 % hasta 6.000 €, más por encima":"Sin ganancia neta, no hay impuesto por ventas")+'</span></div>';

    $("r-vacio").hidden=del.length>0;$("r-lista").hidden=!del.length;
    $("r-vacio").textContent="No tienes ventas apuntadas en "+anio+". Solo pagas impuestos por lo que vendes: mientras no vendas, no hay nada que declarar por estas acciones.";
    $("r-tabla").innerHTML=del.map(function(v){
      return '<tr><td>'+I.fechaEs(v.op.fecha)+'</td><td>'+I.esc(v.nombre)+(v.dosMeses?'<span class="d aviso-txt">Regla de los dos meses: esta pérdida aún no se puede restar</span>':'')+'</td>'+
        '<td class="num">'+I.num(v.acciones,6)+'</td><td class="num">'+I.eur.format(v.transmision)+'</td><td class="num">'+I.eur.format(v.adquisicion)+'</td>'+
        '<td class="num '+(v.ganancia>=0?"up":"down")+'">'+(v.ganancia>=0?"+":"")+I.eur.format(v.ganancia)+'</td></tr>';
    }).join("");

    var av=[];
    if(bloq<0)av.push("Tienes "+I.eur.format(-bloq)+" de pérdidas bloqueadas por la regla de los dos meses: compraste acciones de la misma empresa dos meses antes o después de venderlas con pérdida. Esa pérdida se podrá restar cuando vendas esas acciones nuevas.");
    if(neto<0)av.push("Este año sales en pérdidas. Lo que no compenses se puede restar de las ganancias de los cuatro años siguientes.");
    if(r.errores.length)av.push("Hay ventas de más acciones de las que tenías. Revisa Mis inversiones: el cálculo de ese año puede no ser correcto.");
    if(r.sinCambio&&r.sinCambio.length)av.push(r.sinCambio.length+(r.sinCambio.length===1?" operación en dólares no tiene":" operaciones en dólares no tienen")+" el cambio de su día y no se cuentan aquí. Complétalas en Mis inversiones.");
    if(r.sinAcciones.length)av.push(r.sinAcciones.length+(r.sinAcciones.length===1?" operación no tiene":" operaciones no tienen")+" acciones ni precio y no se cuentan aquí. Complétalas en Mis inversiones.");
    $("r-avisos").innerHTML=av.map(function(t){return '<div class="warn">'+I.esc(t)+'</div>';}).join("");
  }
  $("r-anio").addEventListener("change",function(e){anio=+e.target.value;pintar();});

  $("r-csv").addEventListener("click",function(){
    var del=I.calcular().ventas.filter(function(v){return v.anio===anio;});
    if(!del.length){$("r-msg").textContent="No hay ventas en "+anio+" que exportar.";return;}
    var n=function(x){return x.toFixed(2).replace(".",",");},q=function(s){return '"'+String(s).replace(/"/g,'""')+'"';};
    var filas=["Fecha de venta;Empresa;Acciones;Valor de transmisión (EUR);Valor de adquisición (EUR);Ganancia o pérdida (EUR);Regla dos meses"].concat(del.map(function(v){
      return [I.fechaEs(v.op.fecha),q(v.nombre),String(Math.round(v.acciones*1e6)/1e6).replace(".",","),n(v.transmision),n(v.adquisicion),n(v.ganancia),v.dosMeses?"Sí":"No"].join(";");
    }));
    var a=document.createElement("a");a.href=URL.createObjectURL(new Blob(["﻿"+filas.join("\r\n")],{type:"text/csv;charset=utf-8"}));
    a.download="renta-"+anio+"-ventas.csv";document.body.appendChild(a);a.click();a.remove();
    $("r-msg").textContent="Descargado. Pásaselo a tu gestora junto con el informe fiscal de tu bróker.";
  });

  I.alCambiar(pintar);
  pintar();
})();
