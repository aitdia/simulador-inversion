// Mis inversiones: apuntar operaciones, ver lo que tienes y cuánto vale.
(function(){
  "use strict";
  var S=window.SIM,I=window.INV,$=function(id){return document.getElementById(id);};
  var editando=null;          // id de la operación que se está editando
  var ultimos=[];             // los dos últimos campos tocados de acciones / precio / importe

  // ---------- Formulario ----------
  $("m-emp").innerHTML=S.DATA.map(function(d){return '<option value="'+d.id+'">'+d.name+'</option>';}).join("")+'<option value="otra">Otra…</option>';
  function reiniciarForm(){
    editando=null;ultimos=[];
    $("m-fecha").value=I.hoy();$("m-fecha").max=I.hoy();
    ["m-acciones","m-precio","m-importe","m-nota"].forEach(function(id){$(id).value="";});
    $("m-comision").value=I.ajustes.fee;
    $("m-guardar").textContent="Guardar operación";$("m-cancelar").hidden=true;
    $("t-form").textContent="Apuntar una operación";
    ["m-fecha","m-acciones","m-precio","m-importe","m-comision","m-otra"].forEach(function(id){error(id,"");});
    actualizarVenderTodo();
  }
  $("m-emp").addEventListener("change",function(e){$("m-otra-box").hidden=(e.target.value!=="otra");actualizarVenderTodo();});
  $("m-tipo").addEventListener("change",actualizarVenderTodo);
  $("m-otra").addEventListener("input",actualizarVenderTodo);
  $("m-fecha").addEventListener("change",actualizarVenderTodo);

  // Con dos de los tres campos (acciones, precio, importe) se calcula el tercero.
  function leerNum(id){var v=parseFloat(String($(id).value).replace(",","."));return isNaN(v)?null:v;}
  ["m-acciones","m-precio","m-importe"].forEach(function(id){
    $(id).addEventListener("input",function(){
      ultimos=ultimos.filter(function(x){return x!==id;});ultimos.push(id);if(ultimos.length>2)ultimos.shift();
      if(ultimos.length<2)return;
      var a=leerNum("m-acciones"),p=leerNum("m-precio"),im=leerNum("m-importe");
      var falta=["m-acciones","m-precio","m-importe"].filter(function(x){return ultimos.indexOf(x)===-1;})[0];
      if(falta==="m-importe"&&a>0&&p>0)$("m-importe").value=(Math.round(a*p*100)/100).toFixed(2);
      if(falta==="m-acciones"&&p>0&&im>0)$("m-acciones").value=+(im/p).toFixed(6);
      if(falta==="m-precio"&&a>0&&im>0)$("m-precio").value=+(im/a).toFixed(4);
    });
  });

  function opDelForm(){
    var emp=$("m-emp").value;
    return {id:editando||I.nuevoId(),fecha:$("m-fecha").value,tipo:$("m-tipo").value,emp:emp,
      nombre:emp==="otra"?$("m-otra").value.trim().slice(0,40):"",
      acciones:leerNum("m-acciones"),precio:leerNum("m-precio"),importe:leerNum("m-importe"),
      comision:leerNum("m-comision"),nota:$("m-nota").value.trim().slice(0,80)};
  }
  // Acciones que tenías de esa empresa en esa fecha (sin contar la operación que editas).
  function accionesEnFecha(o){
    var otras=I.ops.filter(function(x){return x.id!==editando&&x.fecha<=o.fecha;});
    var r=I.calcular(otras),k=I.clave(o);
    var p=r.posiciones.filter(function(x){return x.clave===k;})[0];
    return p?p.acciones:0;
  }
  function actualizarVenderTodo(){
    var o=opDelForm(),btn=$("m-todo");
    if(o.tipo!=="venta"||(o.emp==="otra"&&!o.nombre)){btn.hidden=true;return;}
    var t=accionesEnFecha(o);
    btn.hidden=!(t>0);btn.textContent="Vender todo ("+I.num(t,6)+" acciones)";btn.dataset.n=t;
  }
  $("m-todo").addEventListener("click",function(){
    $("m-acciones").value=+(+$("m-todo").dataset.n).toFixed(6);
    $("m-acciones").dispatchEvent(new Event("input"));
  });

  function error(id,msg){
    var el=$(id+"-err");if(el)el.textContent=msg||"";
    $(id).setAttribute("aria-invalid",msg?"true":"false");return !msg;
  }
  function validar(o){
    var ok=true;
    ok=error("m-fecha",!o.fecha?"Pon la fecha de la operación.":(o.fecha>I.hoy()?"La fecha no puede ser futura.":""))&&ok;
    if(o.emp==="otra")ok=error("m-otra",!o.nombre?"Escribe el nombre de la empresa.":"")&&ok;
    ok=error("m-acciones",!(o.acciones>0)?"Pon cuántas acciones (pueden ser fracciones, como 0,25).":"")&&ok;
    ok=error("m-precio",!(o.precio>0)?"Pon el precio por acción en euros.":"")&&ok;
    ok=error("m-importe",!(o.importe>0)?"Pon el importe en euros.":(o.importe>1000000?"El importe máximo es 1.000.000 €.":""))&&ok;
    ok=error("m-comision",(o.comision===null||o.comision<0)?"La comisión no puede ser negativa. Si no hubo, pon 0.":"")&&ok;
    if(ok&&Math.abs(o.acciones*o.precio-o.importe)>Math.max(0.05,o.importe*0.02))
      ok=error("m-importe","No cuadra: "+I.num(o.acciones,6)+" acciones a "+I.eur.format(o.precio)+" son "+I.eur.format(o.acciones*o.precio)+". Revisa los tres datos.");
    if(ok&&o.tipo==="venta"){
      var t=accionesEnFecha(o);
      if(o.acciones>t+1e-6)ok=error("m-acciones",t>0?"En esa fecha solo tenías "+I.num(t,6)+" acciones de "+I.nombre(o)+".":"En esa fecha no tenías acciones de "+I.nombre(o)+". Apunta antes la compra.")&&ok;
    }
    return ok;
  }
  $("m-form").addEventListener("submit",function(e){
    e.preventDefault();
    var o=opDelForm();
    if(!validar(o)){var bad=document.querySelector('#m-form [aria-invalid="true"]');if(bad)bad.focus();return;}
    o.importe=Math.round(o.importe*100)/100;o.comision=Math.round(o.comision*100)/100;
    if(editando){I.ops=I.ops.map(function(x){return x.id===editando?o:x;});}
    else I.ops.push(o);
    var era=editando;
    I.ajustes.fee=o.comision;
    var ok=I.guardar();
    // Si es la primera vez que apuntas esta empresa, usa su precio como precio actual.
    var k=I.clave(o);if(!I.precios[k]||I.precios[k].fecha<o.fecha){I.precios[k]={precio:o.precio,fecha:o.fecha,auto:false};I.guardar();}
    msg(ok?(era?"Cambios guardados.":"Operación guardada."):"Apuntada, pero el navegador no deja guardarla. Descarga una copia antes de cerrar.");
    reiniciarForm();$("m-acciones").focus();
  });
  $("m-cancelar").addEventListener("click",function(){reiniciarForm();msg("Edición cancelada.");});
  function msg(t){$("m-msg").textContent=t;}

  // ---------- Lista de operaciones ----------
  function pintarOps(){
    var lista=I.ops.slice().sort(function(a,b){return a.fecha<b.fecha?1:(a.fecha>b.fecha?-1:0);});
    $("m-vacio").hidden=lista.length>0;$("m-lista").hidden=!lista.length;
    $("m-tabla").innerHTML=lista.map(function(o){
      var sin=!(o.acciones>0);
      return '<tr><td>'+I.fechaEs(o.fecha)+'</td><td>'+I.esc(I.nombre(o))+(o.nota?'<span class="d">'+I.esc(o.nota)+'</span>':'')+
        (sin?'<span class="d aviso-txt">Sin acciones ni precio: no cuenta</span>':'')+'</td>'+
        '<td><span class="pill '+(o.tipo==="venta"?"venta":"compra")+'">'+(o.tipo==="venta"?"Venta":"Compra")+'</span></td>'+
        '<td class="num">'+(sin?"—":I.num(o.acciones,6))+'</td><td class="num">'+(sin?"—":I.eur.format(o.precio))+'</td>'+
        '<td class="num">'+I.eur.format(o.importe)+'</td><td class="num">'+I.eur.format(o.comision)+'</td>'+
        '<td class="botones"><button type="button" class="mini" data-edit="'+o.id+'">Editar</button>'+
        '<button type="button" class="del" data-del="'+o.id+'">Borrar</button></td></tr>';
    }).join("");
    var r=I.calcular();
    $("m-avisos").innerHTML=
      (r.sinAcciones.length?'<div class="warn">'+r.sinAcciones.length+(r.sinAcciones.length===1?" operación no tiene":" operaciones no tienen")+' acciones ni precio (son de la versión anterior). No cuentan en tu cartera ni en la renta: pulsa Editar y complétalas.</div>':'')+
      r.errores.map(function(x){return '<div class="warn">La venta del '+I.fechaEs(x.op.fecha)+' de '+I.esc(x.nombre)+' es de más acciones de las que tenías: faltan '+I.num(x.falta,6)+'. Revisa si te falta apuntar una compra.</div>';}).join("");
  }
  $("m-tabla").addEventListener("click",function(e){
    var b=e.target.closest("button");if(!b)return;
    if(b.dataset.del){
      if(b.dataset.ok!=="1"){b.dataset.ok="1";b.textContent="¿Seguro?";setTimeout(function(){if(b.isConnected){b.dataset.ok="";b.textContent="Borrar";}},4000);return;}
      I.ops=I.ops.filter(function(o){return o.id!==b.dataset.del;});
      if(editando===b.dataset.del)reiniciarForm();
      I.guardar();msg("Operación borrada.");
    }
    if(b.dataset.edit){
      var o=I.ops.filter(function(x){return x.id===b.dataset.edit;})[0];if(!o)return;
      editando=o.id;ultimos=["m-acciones","m-precio"];
      $("m-fecha").value=o.fecha;$("m-tipo").value=o.tipo;$("m-emp").value=S.porId(o.emp)?o.emp:"otra";
      $("m-otra-box").hidden=$("m-emp").value!=="otra";$("m-otra").value=o.nombre||"";
      $("m-acciones").value=o.acciones>0?o.acciones:"";$("m-precio").value=o.precio>0?o.precio:"";
      $("m-importe").value=o.importe;$("m-comision").value=o.comision;$("m-nota").value=o.nota||"";
      $("m-guardar").textContent="Guardar cambios";$("m-cancelar").hidden=false;
      $("t-form").textContent="Editar la operación del "+I.fechaEs(o.fecha);
      actualizarVenderTodo();
      $("t-form").scrollIntoView({behavior:"smooth",block:"start"});$("m-acciones").focus({preventScroll:true});
    }
  });

  // ---------- Posiciones ----------
  function pintarPosiciones(){
    var r=I.calcular(),pos=r.posiciones;
    $("p-vacio").hidden=pos.length>0;$("p-lista").hidden=!pos.length;
    var coste=0,valor=0,conPrecio=true;
    pos.forEach(function(p){coste+=p.coste;valor+=I.valorPos(p);if(p.precio===null)conPrecio=false;});
    var gl=valor-coste,realiz=r.ventas.reduce(function(a,v){return a+v.ganancia;},0);
    $("p-resumen").innerHTML=pos.length?
      '<div class="fact"><span>Vale ahora</span><b>'+I.eur.format(valor)+'</b>'+(conPrecio?'':'<span>Alguna sin precio actual: cuenta lo que costó</span>')+'</div>'+
      '<div class="fact"><span>Te costó</span><b>'+I.eur.format(coste)+'</b><span>con comisiones</span></div>'+
      '<div class="fact"><span>Ganas o pierdes si vendieras hoy</span><b class="'+(gl>=0?"up":"down")+'">'+(gl>=0?"+":"")+I.eur.format(gl)+'</b><span>'+(coste>0?I.pct(gl/coste*100):"")+', antes de impuestos</span></div>'+
      '<div class="fact"><span>Ya ganado o perdido en ventas</span><b class="'+(realiz>=0?"up":"down")+'">'+(realiz>=0?"+":"")+I.eur.format(realiz)+'</b><span>todas las ventas</span></div>':"";
    $("p-tabla").innerHTML=pos.map(function(p){
      var v=I.valorPos(p),g=v-p.coste,peso=valor>0?v/valor*100:0;
      var d=S.porId(p.emp);
      return '<tr><td><b>'+I.esc(p.nombre)+'</b><span class="d">'+I.num(peso,1)+' % de tu cartera</span></td>'+
        '<td class="num">'+I.num(p.acciones,6)+'</td><td class="num">'+I.eur.format(p.costeMedio)+'</td>'+
        '<td><input type="number" class="precio-in" min="0" step="0.01" inputmode="decimal" data-k="'+I.esc(p.clave)+'" value="'+(p.precio!==null?p.precio:"")+'" aria-label="Precio actual de '+I.esc(p.nombre)+' en euros">'+
        '<span class="d">'+(p.fechaPrecio?(p.auto?"automático, ":"")+I.fechaEs(p.fechaPrecio):"sin precio")+'</span></td>'+
        '<td class="num">'+I.eur.format(v)+'</td>'+
        '<td class="num '+(g>=0?"up":"down")+'">'+(g>=0?"+":"")+I.eur.format(g)+'<span class="d">'+(p.coste>0?I.pct(g/p.coste*100):"")+'</span></td>'+
        '<td>'+(d?'<a class="mini" href="https://www.tradingview.com/symbols/'+d.sym.replace(":","-")+'/" target="_blank" rel="noopener">Ver precio</a>':'')+'</td></tr>';
    }).join("");
  }
  $("p-tabla").addEventListener("change",function(e){
    var k=e.target.dataset.k;if(!k)return;
    var v=parseFloat(String(e.target.value).replace(",","."));
    if(isNaN(v)||v<=0){delete I.precios[k];}else I.precios[k]={precio:v,fecha:I.hoy(),auto:false};
    I.guardar();pmsg("Precio actualizado.");
  });
  function pmsg(t){$("p-msg").textContent=t;}

  // Precios automáticos (opcional): Finnhub para la cotización en dólares y el BCE (Frankfurter) para pasarla a euros.
  $("aj-clave").value=I.ajustes.clave||"";
  $("aj-guardar").addEventListener("click",function(){
    I.ajustes.clave=$("aj-clave").value.trim();I.guardar();
    $("aj-msg").textContent=I.ajustes.clave?"Clave guardada en este navegador. Ya puedes usar Actualizar precios.":"Clave borrada.";
  });
  $("p-auto").addEventListener("click",function(){
    var clave=I.ajustes.clave;
    if(!clave){pmsg("Para actualizar solos los precios necesitas una clave gratuita de Finnhub. Abre Precios automáticos, más abajo.");$("ajustes").open=true;return;}
    var pos=I.calcular().posiciones.filter(function(p){return S.porId(p.emp);});
    if(!pos.length){pmsg("No tienes empresas de la lista con precio automático. Pon el precio a mano.");return;}
    var btn=$("p-auto");btn.disabled=true;pmsg("Buscando precios…");
    fetch("https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR").then(function(r){if(!r.ok)throw new Error("divisa");return r.json();})
    .then(function(fx){
      var usdEur=fx&&fx.rates&&fx.rates.EUR;if(!usdEur)throw new Error("divisa");
      return Promise.all(pos.map(function(p){
        var sym=S.porId(p.emp).sym.split(":")[1];
        return fetch("https://finnhub.io/api/v1/quote?symbol="+encodeURIComponent(sym)+"&token="+encodeURIComponent(clave))
          .then(function(r){if(r.status===401||r.status===403)throw new Error("clave");if(!r.ok)throw new Error("red");return r.json();})
          .then(function(q){if(q&&q.c>0){I.precios[p.clave]={precio:Math.round(q.c*usdEur*100)/100,fecha:I.hoy(),auto:true};return 1;}return 0;})
          .catch(function(err){if(err.message==="clave")throw err;return 0;});
      }));
    }).then(function(res){
      var n=res.reduce(function(a,b){return a+b;},0);I.guardar();
      pmsg(n?"Precios actualizados ("+n+" de "+pos.length+"), pasados de dólares a euros con el cambio del BCE.":"No se ha podido obtener ningún precio. Ponlos a mano.");
    }).catch(function(err){
      pmsg(err.message==="clave"?"La clave de Finnhub no es válida. Revísala en Precios automáticos.":"No se han podido descargar los precios ahora. Comprueba la conexión o ponlos a mano.");
    }).then(function(){btn.disabled=false;});
  });

  // ---------- CSV ----------
  function n2(x){return (Math.round(x*1e6)/1e6).toString().replace(".",",");}
  $("m-csv").addEventListener("click",function(){
    if(!I.ops.length){msg("Todavía no hay operaciones que exportar.");return;}
    var q=function(s){return '"'+String(s).replace(/"/g,'""')+'"';};
    var filas=["Fecha;Tipo;Empresa;Acciones;Precio (EUR);Importe (EUR);Comisión (EUR);Nota"].concat(I.ops.slice().sort(function(a,b){return a.fecha<b.fecha?-1:1;}).map(function(o){
      return [I.fechaEs(o.fecha),o.tipo==="venta"?"Venta":"Compra",q(I.nombre(o)),o.acciones>0?n2(o.acciones):"",o.precio>0?n2(o.precio):"",n2(o.importe),n2(o.comision),q(o.nota||"")].join(";");}));
    descargar(new Blob(["﻿"+filas.join("\r\n")],{type:"text/csv;charset=utf-8"}),"mis-inversiones-"+I.hoy()+".csv");
    msg("CSV descargado. Se abre con Excel.");
  });
  function descargar(blob,nombre){
    var a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=nombre;
    document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(a.href);},2000);
  }
  function leerCSV(txt){
    var filas=[],fila=[],campo="",q=false;
    txt=txt.replace(/^﻿/,"");
    for(var i=0;i<txt.length;i++){
      var ch=txt[i];
      if(q){if(ch==='"'){if(txt[i+1]==='"'){campo+='"';i++;}else q=false;}else campo+=ch;}
      else if(ch==='"')q=true;
      else if(ch===";"){fila.push(campo);campo="";}
      else if(ch==="\n"||ch==="\r"){if(ch==="\r"&&txt[i+1]==="\n")i++;fila.push(campo);campo="";if(fila.some(function(c){return c!=="";}))filas.push(fila);fila=[];}
      else campo+=ch;
    }
    fila.push(campo);if(fila.some(function(c){return c!=="";}))filas.push(fila);
    return filas;
  }
  function numEs(s){s=String(s||"").trim();if(!s)return null;var v=parseFloat(s.replace(/\./g,"").replace(",","."));return isNaN(v)?null:v;}
  $("m-import").addEventListener("change",function(e){
    var f=e.target.files&&e.target.files[0];if(!f)return;
    var lector=new FileReader();
    lector.onload=function(){
      var filas=leerCSV(String(lector.result));e.target.value="";
      var cab=filas[0]?filas[0].map(function(c){return c.trim().toLowerCase();}):[];
      if(cab[0]!=="fecha"){msg("Ese archivo no es un CSV exportado desde esta web. Usa el botón Exportar CSV para crearlo.");return;}
      // Acepta el formato nuevo (con acciones y precio) y el antiguo (solo importe).
      var col=function(n){for(var i=0;i<cab.length;i++)if(cab[i].indexOf(n)===0)return i;return -1;};
      var cE=col("empresa"),cT=col("tipo"),cA=col("acciones"),cP=col("precio"),cI=col("importe"),cC=col("comisi"),cN=col("nota");
      var claves={},nuevas=0,repes=0,malas=0;
      function clave(o){return [o.fecha,o.tipo,I.nombre(o).toLowerCase(),o.importe.toFixed(2),o.comision.toFixed(2)].join("|");}
      I.ops.forEach(function(o){claves[clave(o)]=1;});
      filas.slice(1).forEach(function(c){
        var fp=(c[0]||"").trim().split("/");
        var fecha=fp.length===3?fp[2]+"-"+("0"+fp[1]).slice(-2)+"-"+("0"+fp[0]).slice(-2):"";
        var nom=(c[cE]||"").trim(),imp=numEs(c[cI]),com=numEs(c[cC]),acc=cA>=0?numEs(c[cA]):null,pre=cP>=0?numEs(c[cP]):null;
        if(!/^\d{4}-\d{2}-\d{2}$/.test(fecha)||!(imp>0)||com===null||com<0||!nom){malas++;return;}
        var d=S.DATA.filter(function(x){return x.name.toLowerCase()===nom.toLowerCase();})[0];
        var o={id:I.nuevoId(),fecha:fecha,tipo:/venta/i.test(c[cT]||"")?"venta":"compra",emp:d?d.id:"otra",nombre:d?"":nom.slice(0,40),
          acciones:acc>0?acc:null,precio:pre>0?pre:null,importe:Math.round(imp*100)/100,comision:Math.round(com*100)/100,nota:cN>=0?(c[cN]||"").trim().slice(0,80):""};
        var k=clave(o);if(claves[k]){repes++;return;}
        claves[k]=1;I.ops.push(o);nuevas++;
      });
      I.guardar();
      msg((nuevas===1?"Importada 1 operación.":"Importadas "+nuevas+" operaciones.")+
        (repes?" "+repes+(repes===1?" ya estaba y se ha saltado.":" ya estaban y se han saltado."):"")+
        (malas?" "+malas+(malas===1?" fila no se ha podido leer.":" filas no se han podido leer."):""));
    };
    lector.onerror=function(){msg("No se ha podido leer el archivo. Prueba otra vez.");};
    lector.readAsText(f,"utf-8");
  });

  // ---------- Copia de seguridad completa ----------
  var pendiente=null;
  $("b-bajar").addEventListener("click",function(){
    descargar(new Blob([JSON.stringify(I.copia(),null,1)],{type:"application/json"}),"copia-inversiones-"+I.hoy()+".json");
    $("b-msg").textContent="Copia descargada. Guárdala en un sitio seguro.";
  });
  $("b-subir").addEventListener("change",function(e){
    var f=e.target.files&&e.target.files[0];if(!f)return;
    var lector=new FileReader();
    lector.onload=function(){
      e.target.value="";
      try{pendiente=JSON.parse(String(lector.result));if(pendiente.app!=="simulador-inversion"||!Array.isArray(pendiente.ops))throw 0;}
      catch(x){pendiente=null;$("b-msg").textContent="Ese archivo no es una copia de esta web.";return;}
      $("b-msg").textContent="La copia tiene "+pendiente.ops.length+" operaciones, del "+I.fechaEs(pendiente.fecha||"")+". Sustituirá todo lo que tienes ahora en este navegador.";
      $("b-confirmar").hidden=false;
    };
    lector.readAsText(f,"utf-8");
  });
  $("b-si").addEventListener("click",function(){
    if(!pendiente)return;
    try{I.restaurar(pendiente);$("b-msg").textContent="Copia restaurada.";}catch(x){$("b-msg").textContent="No se ha podido restaurar la copia.";}
    pendiente=null;$("b-confirmar").hidden=true;
    if(window.CARTERA&&window.CARTERA.recargar)window.CARTERA.recargar();
  });
  $("b-no").addEventListener("click",function(){pendiente=null;$("b-confirmar").hidden=true;$("b-msg").textContent="Restauración cancelada.";});

  // Pasar lo que tienes a la pestaña Probar reparto.
  $("m-a-cartera").addEventListener("click",function(){
    var nuevas=I.calcular().posiciones.filter(function(p){return S.porId(p.emp)&&!S.porId(p.emp).sinHistoria;}).map(function(p){return {id:p.emp,amount:Math.round(I.valorPos(p))};})
      .filter(function(x){return x.amount>0;});
    if(!nuevas.length){pmsg("No tienes posiciones abiertas en empresas de la lista para probar.");return;}
    var fuera=I.calcular().posiciones.filter(function(p){return S.porId(p.emp)&&S.porId(p.emp).sinHistoria;}).map(function(p){return S.porId(p.emp).name;});
    window.CARTERA.poner(nuevas,fuera.length?"No se ha incluido "+fuera.join(" ni ")+": acaba de salir a bolsa y no tiene historia con la que calcular la mezcla.":"");location.hash="#cartera";
  });

  function pintar(){pintarOps();pintarPosiciones();actualizarVenderTodo();}
  I.alCambiar(pintar);
  reiniciarForm();pintar();
})();
