// Mis inversiones: datos guardados en el navegador y cálculos compartidos por
// las pestañas Mis inversiones, Renta y Plan.
//
// Cada operación: {id, fecha "AAAA-MM-DD", tipo "compra"|"venta", emp (id de datos.js u "otra"),
//                  nombre (si es "otra"), acciones, precio y importe en su moneda, moneda "EUR"|"USD",
//                  cambio (euros por 1 dólar ese día, solo si es USD), comision (€), nota}
// Las operaciones antiguas no tienen moneda: se tratan como euros.
// Para Hacienda todo se pasa a euros con el cambio del día de cada operación.
// Las ganancias se calculan con el método FIFO (primero en entrar, primero en salir),
// que es el que exige Hacienda en España para acciones iguales.
(function(){
  "use strict";
  var S=window.SIM;
  var K={ops:"simulador-compras",precios:"simulador-precios",ajustes:"simulador-ajustes",objetivos:"simulador-objetivos"};

  function leer(k,def){
    try{var v=JSON.parse(localStorage.getItem(k)||"null");return v===null?def:v;}catch(e){return def;}
  }
  function escribir(k,v){
    try{localStorage.setItem(k,JSON.stringify(v));return true;}catch(e){return false;}
  }

  var INV={
    ops:leer(K.ops,[]),
    precios:leer(K.precios,{}),      // {clave: {precio, fecha, auto}}
    ajustes:leer(K.ajustes,{}),      // {clave (Finnhub), fee}
    objetivos:leer(K.objetivos,[])   // [{id, pct}]
  };
  if(!Array.isArray(INV.ops))INV.ops=[];
  if(!INV.precios||typeof INV.precios!=="object")INV.precios={};
  if(!INV.ajustes||typeof INV.ajustes!=="object")INV.ajustes={};
  if(typeof INV.ajustes.fee!=="number")INV.ajustes.fee=1;
  if(!Array.isArray(INV.objetivos))INV.objetivos=[];

  var oyentes=[];
  INV.alCambiar=function(f){oyentes.push(f);};
  // Guarda todo y avisa a las pestañas para que se repinten. Devuelve false si el navegador no deja guardar.
  INV.guardar=function(){
    var ok=escribir(K.ops,INV.ops)&escribir(K.precios,INV.precios)&escribir(K.ajustes,INV.ajustes)&escribir(K.objetivos,INV.objetivos);
    oyentes.forEach(function(f){try{f();}catch(e){if(window.console)console.error(e);}});
    return !!ok;
  };

  // ---------- Monedas ----------
  INV.moneda=function(o){return o&&o.moneda==="USD"?"USD":"EUR";};
  // Euros por cada unidad de la moneda de la operación (null si falta el cambio de un dólar).
  INV.factor=function(o){return INV.moneda(o)==="USD"?(o.cambio>0?o.cambio:null):1;};
  // Cambio de hoy: euros por 1 dólar.
  INV.cambioHoy=function(){var c=INV.ajustes.cambio;return c&&c.valor>0?c.valor:null;};
  // Busca el cambio oficial del BCE de una fecha (o del último día con cambio antes de ella).
  // Devuelve una promesa con {valor: euros por dólar, fecha}.
  INV.tipoCambio=function(fecha){
    var url="https://data-api.ecb.europa.eu/service/data/EXR/D.USD.EUR.SP00.A?format=csvdata&lastNObservations=1&endPeriod="+encodeURIComponent(fecha);
    return fetch(url).then(function(r){if(!r.ok)throw new Error("bce");return r.text();}).then(function(t){
      var l=t.trim().split(/\r?\n/);if(l.length<2)throw new Error("bce");
      var cab=l[0].split(","),fila=l[l.length-1].split(",");
      var v=parseFloat(fila[cab.indexOf("OBS_VALUE")]),f=fila[cab.indexOf("TIME_PERIOD")];
      if(!(v>0))throw new Error("bce");
      return {valor:Math.round(1/v*1e6)/1e6,fecha:f};
    }).catch(function(){
      return fetch("https://api.frankfurter.dev/v1/"+encodeURIComponent(fecha)+"?base=USD&symbols=EUR").then(function(r){if(!r.ok)throw new Error("fx");return r.json();})
        .then(function(j){if(!(j&&j.rates&&j.rates.EUR>0))throw new Error("fx");return {valor:j.rates.EUR,fecha:j.date};});
    });
  };
  // Actualiza el cambio de hoy si no es de hoy (en segundo plano).
  INV.refrescarCambio=function(){
    var c=INV.ajustes.cambio;if(c&&c.consultado===INV.hoy())return Promise.resolve(c);
    return INV.tipoCambio(INV.hoy()).then(function(x){INV.ajustes.cambio={valor:x.valor,fecha:x.fecha,consultado:INV.hoy()};INV.guardar();return x;}).catch(function(){return null;});
  };

  // Utilidades de formato compartidas.
  INV.eur=new Intl.NumberFormat("es-ES",{style:"currency",currency:"EUR",minimumFractionDigits:2,maximumFractionDigits:2,useGrouping:"always"});
  INV.eur0=new Intl.NumberFormat("es-ES",{style:"currency",currency:"EUR",maximumFractionDigits:0,useGrouping:"always"});
  var usdF=new Intl.NumberFormat("es-ES",{minimumFractionDigits:2,maximumFractionDigits:2,useGrouping:"always"});
  INV.mon=function(x,moneda){return moneda==="USD"?usdF.format(x)+" $":INV.eur.format(x);};
  INV.num=function(x,dec){return x.toLocaleString("es-ES",{maximumFractionDigits:dec===undefined?4:dec,useGrouping:"always"});};
  INV.pct=function(x){return (x>0?"+":"")+x.toLocaleString("es-ES",{maximumFractionDigits:1})+" %";};
  INV.esc=function(s){return String(s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});};
  INV.hoy=function(){var d=new Date();return d.getFullYear()+"-"+("0"+(d.getMonth()+1)).slice(-2)+"-"+("0"+d.getDate()).slice(-2);};
  INV.fechaEs=function(f){var p=String(f).split("-");return p.length===3?p[2]+"/"+p[1]+"/"+p[0]:f;};
  INV.nuevoId=function(){return Date.now().toString(36)+Math.random().toString(36).slice(2,7);};

  INV.nombre=function(o){var d=S.porId(o.emp);return d?d.name:(o.nombre||"Sin nombre");};
  // Identifica la empresa de una operación (para agrupar compras y ventas de la misma).
  INV.clave=function(o){return o.emp==="otra"?"otra:"+String(o.nombre||"").trim().toLowerCase():o.emp;};

  // Impuesto del ahorro 2026 sobre una ganancia neta.
  INV.impuesto=function(g){
    if(g<=0)return 0;
    var b=[[6000,.19],[50000,.21],[200000,.23],[300000,.27],[Infinity,.30]],prev=0,t=0;
    for(var i=0;i<b.length;i++){if(g>prev)t+=(Math.min(g,b[i][0])-prev)*b[i][1];prev=b[i][0];}
    return t;
  };

  function sumarMeses(fecha,m){
    var d=new Date(fecha+"T12:00:00");d.setMonth(d.getMonth()+m);return d.toISOString().slice(0,10);
  }

  // Recorre las operaciones en orden y calcula posiciones abiertas y ventas con su ganancia.
  // ops: lista a usar (por defecto las guardadas). Así el formulario puede probar una operación antes de guardarla.
  INV.calcular=function(ops){
    ops=ops||INV.ops;
    var lista=ops.map(function(o,i){return {o:o,i:i};}).sort(function(a,b){
      if(a.o.fecha!==b.o.fecha)return a.o.fecha<b.o.fecha?-1:1;
      if(a.o.tipo!==b.o.tipo)return a.o.tipo==="compra"?-1:1;   // el mismo día, primero las compras
      return a.i-b.i;
    });
    var lotes={},info={},ventas=[],errores=[],sinAcciones=[],sinCambio=[];
    lista.forEach(function(x){
      var o=x.o,k=INV.clave(o);
      if(!info[k])info[k]={nombre:INV.nombre(o),emp:o.emp,moneda:INV.moneda(o)};
      var f=INV.factor(o);
      if(f===null){sinCambio.push(o);return;}
      if(!(o.acciones>0)){sinAcciones.push(o);return;}
      var L=lotes[k]=lotes[k]||[];
      if(o.tipo==="compra"){
        L.push({fecha:o.fecha,acciones:o.acciones,coste:o.importe*f+o.comision,costeMon:o.importe});
        return;
      }
      var quedan=o.acciones,coste=0;
      while(quedan>1e-9&&L.length){
        var l=L[0],usa=Math.min(quedan,l.acciones),parte=l.coste*usa/l.acciones;
        l.costeMon-=l.costeMon*usa/l.acciones;
        coste+=parte;l.coste-=parte;l.acciones-=usa;quedan-=usa;
        if(l.acciones<1e-9)L.shift();
      }
      var vendidas=o.acciones-quedan;
      if(quedan>1e-6)errores.push({op:o,nombre:INV.nombre(o),falta:quedan,tenia:vendidas});
      var parteVenta=vendidas/o.acciones;
      var transmision=o.importe*f*parteVenta-o.comision;
      ventas.push({op:o,clave:k,nombre:INV.nombre(o),acciones:vendidas,transmision:transmision,
        adquisicion:coste,ganancia:transmision-coste,anio:+o.fecha.slice(0,4)});
    });

    // Regla de los dos meses: una pérdida no se puede compensar todavía si se compraron
    // acciones de la misma empresa en los dos meses anteriores o posteriores a la venta.
    ventas.forEach(function(v){
      v.dosMeses=false;
      if(v.ganancia>=0)return;
      var desde=sumarMeses(v.op.fecha,-2),hasta=sumarMeses(v.op.fecha,2);
      v.dosMeses=ops.some(function(o){
        return o!==v.op&&o.tipo==="compra"&&INV.clave(o)===v.clave&&o.fecha>=desde&&o.fecha<=hasta;
      });
    });

    var posiciones=Object.keys(lotes).map(function(k){
      var acc=0,coste=0,costeMon=0;lotes[k].forEach(function(l){acc+=l.acciones;coste+=l.coste;costeMon+=l.costeMon;});
      var mon=info[k].moneda,p=INV.precios[k];
      // Un precio guardado en otra moneda (de antes de este cambio) no vale.
      var precio=p&&p.precio>0&&(p.moneda||"EUR")===mon?p.precio:null;
      var fx=mon==="USD"?INV.cambioHoy():1;
      return {clave:k,nombre:info[k].nombre,emp:info[k].emp,moneda:mon,acciones:acc,coste:coste,
        costeMedio:acc>0?coste/acc:0,precioMedio:acc>0?costeMon/acc:0,precio:precio,fechaPrecio:p?p.fecha:null,auto:p?!!p.auto:false,
        valor:precio!==null&&fx?acc*precio*fx:null};
    }).filter(function(p){return p.acciones>1e-9;});
    posiciones.sort(function(a,b){return (b.valor===null?b.coste:b.valor)-(a.valor===null?a.coste:a.valor);});

    return {posiciones:posiciones,ventas:ventas,errores:errores,sinAcciones:sinAcciones,sinCambio:sinCambio};
  };

  // Valor de una posición: con precio actual si lo hay; si no, lo que costó.
  INV.valorPos=function(p){return p.valor!==null?p.valor:p.coste;};

  // Copia de seguridad con todo lo que guarda la web (sin la clave de precios).
  INV.copia=function(){
    var cartera=leer("simulador-cartera",null);
    return {app:"simulador-inversion",version:2,fecha:INV.hoy(),ops:INV.ops,precios:INV.precios,
      objetivos:INV.objetivos,cartera:cartera,fee:INV.ajustes.fee};
  };
  INV.restaurar=function(c){
    if(!c||c.app!=="simulador-inversion"||!Array.isArray(c.ops))throw new Error("formato");
    INV.ops=c.ops.filter(function(o){return o&&/^\d{4}-\d{2}-\d{2}$/.test(o.fecha)&&(o.tipo==="compra"||o.tipo==="venta")&&o.importe>0;});
    INV.precios=c.precios&&typeof c.precios==="object"?c.precios:{};
    INV.objetivos=Array.isArray(c.objetivos)?c.objetivos:[];
    if(typeof c.fee==="number")INV.ajustes.fee=c.fee;
    if(Array.isArray(c.cartera))escribir("simulador-cartera",c.cartera);
    return INV.guardar();
  };

  // Pide al navegador que no borre estos datos para liberar espacio.
  try{if(navigator.storage&&navigator.storage.persist)navigator.storage.persist();}catch(e){}

  window.INV=INV;
})();
