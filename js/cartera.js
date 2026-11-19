// Probar reparto: reparte dinero entre varias empresas y calcula los escenarios del conjunto.
(function(){
  "use strict";
  var S=window.SIM,$=function(id){return document.getElementById(id);};
  var KEY="simulador-cartera";
  var filas=[{id:"NVDA",amount:100},{id:"SONY",amount:50},{id:"SPY",amount:50}];
  try{var g=JSON.parse(localStorage.getItem(KEY)||"null");
    if(Array.isArray(g)&&g.length){g=g.filter(function(f){return S.porId(f.id)&&!S.porId(f.id).sinHistoria&&f.amount>0;});if(g.length)filas=g;}}catch(e){}
  function guardar(){try{localStorage.setItem(KEY,JSON.stringify(filas));}catch(e){}}

  // Junta filas repetidas de la misma empresa.
  function agrupar(){
    var m={};filas.forEach(function(f){if(f.amount>0)m[f.id]=(m[f.id]||0)+f.amount;});
    return Object.keys(m).map(function(id){return {d:S.porId(id),amount:m[id]};});
  }
  // Rentabilidad de la cartera en cada año 2016-2025, con el reparto elegido.
  function calcular(pos){
    var total=pos.reduce(function(a,p){return a+p.amount;},0);
    // Solo los años en los que todas las empresas elegidas tienen datos.
    var desde=Math.max.apply(null,pos.map(function(p){return p.d.y0;}));
    var anual=[];for(var y=desde;y<=2025;y++){anual.push(pos.reduce(function(a,p){return a+p.amount/total*p.d.yrs[y-p.d.y0];},0));}
    var l=anual.map(function(r){return Math.log(1+r/100);}),m=l.reduce(function(a,b){return a+b;},0)/l.length;
    var vol=Math.sqrt(l.reduce(function(a,b){return a+(b-m)*(b-m);},0)/(l.length-1));
    var cagr=Math.exp(m)-1,corto=anual.length<5;
    // Con pocos años en común no hay bastante historia de la mezcla: se combinan los datos
    // de cada empresa por separado, suponiendo que caen a la vez (lo más prudente).
    if(corto){
      vol=pos.reduce(function(a,p){return a+p.amount/total*p.d.vol;},0);
      cagr=Math.exp(pos.reduce(function(a,p){return a+p.amount/total*Math.log(1+p.d.cagr);},0))-1;
    }
    return {corto:corto,desde:desde,total:total,anual:anual,vol:vol,cagr:cagr,peor:Math.min.apply(null,anual),mejor:Math.max.apply(null,anual)};
  }
  function celda(cls,v,a){return '<td class="'+cls+'"><span class="v">'+S.eur.format(v)+'</span><span class="d">'+S.pc((v/a-1)*100)+'</span></td>';}

  function pintar(){
    $("c-filas").innerHTML=filas.map(function(f,i){
      return '<div class="fila"><select data-i="'+i+'" aria-label="Empresa '+(i+1)+'">'+S.DATA.filter(function(d){return !d.sinHistoria;}).map(function(d){return '<option value="'+d.id+'"'+(d.id===f.id?" selected":"")+'>'+d.name+'</option>';}).join("")+'</select>'+
        '<input type="number" data-i="'+i+'" min="1" max="1000000" step="10" value="'+f.amount+'" aria-label="Euros en la empresa '+(i+1)+'"><span class="muted">€</span>'+
        '<button type="button" class="del" data-del="'+i+'" aria-label="Quitar fila '+(i+1)+'"'+(filas.length===1?" disabled":"")+'>Quitar</button></div>';
    }).join("");
    resultados();
  }
  function resultados(){
    var pos=agrupar(),box=$("c-res");
    if(!pos.length){box.hidden=true;return;}
    box.hidden=false;
    var c=calcular(pos),a=c.total;
    $("c-total").textContent="Total: "+S.eur.format(a);
    $("c-reparto").innerHTML=pos.map(function(p){return '<span><b class="num">'+Math.round(p.amount/a*100)+' %</b> '+p.d.name+'</span>';}).join("");
    $("c-hot-t").textContent=c.corto?"Si repite su historia":"Si repite "+c.desde+"-2025";
    $("c-hot").textContent="un "+(c.cagr*100).toFixed(0)+" % al año";
    $("c-tabla").innerHTML=S.H.map(function(t){
      var mal=a*Math.exp(Math.log(1+S.MARKET)*t-S.Z10*c.vol*Math.sqrt(t));
      return '<tr><td class="yr">'+t+(t===1?" año":" años")+'</td>'+celda("bad",mal,a)+celda("mid",a*Math.pow(1+S.MARKET,t),a)+celda("hot",a*Math.pow(1+c.cagr,t),a)+'</tr>';
    }).join("");
    // Compara el peor año de la mezcla con el de su empresa más arriesgada.
    var nota=$("c-nota");
    if(c.anual.length<5){
      nota.hidden=false;
      nota.textContent="Solo hay "+c.anual.length+" años en los que todas estas empresas tienen datos ("+c.desde+"-2025), porque alguna lleva poco tiempo en bolsa. Por eso los escenarios combinan la historia de cada empresa por separado y suponen que caen a la vez. Tómalos solo como orientación.";
      $("c-pie").textContent="Calculado con la historia de cada empresa por separado. Son escenarios, no predicciones.";
    }else if(pos.length>1){
      $("c-pie").textContent="Calculado con lo que rindió cada empresa en cada año de "+c.desde+" a 2025, manteniendo este reparto. Son escenarios, no predicciones.";
      var dura=pos.slice().sort(function(x,y){return x.d.worst-y.d.worst;})[0].d;
      nota.hidden=false;
      nota.textContent=c.peor>dura.worst+1
        ?"Repartir suavizó el golpe: el peor año de esta mezcla fue del "+S.pc(c.peor)+", mientras que el peor año de "+dura.name+" sola fue del "+S.pc(dura.worst)+". Cuanto más distintas sean las empresas entre sí, más se nota."
        :"Aquí repartir apenas cambia el peor año ("+S.pc(c.peor)+"): casi todo el peso está en empresas que caen a la vez. Mezclar con algo más amplio, como el S&P 500, lo suaviza más.";
    }else{nota.hidden=true;$("c-pie").textContent="Calculado con lo que rindió esta empresa en cada año de "+c.desde+" a 2025. Son escenarios, no predicciones.";}
    $("c-datos").innerHTML=
      '<div class="fact"><span>Peor año de la mezcla ('+c.desde+'-2025)</span><b>'+S.pc(c.peor)+'</b><span>'+S.eur.format(a)+' se habrían quedado en '+S.eur.format(a*(1+c.peor/100))+'</span></div>'+
      '<div class="fact"><span>Mejor año de la mezcla</span><b>'+S.pc(c.mejor)+'</b></div>'+
      '<div class="fact"><span>Empresas distintas</span><b>'+pos.length+'</b></div>';
  }

  $("c-filas").addEventListener("change",function(e){
    var i=e.target.dataset.i;if(i===undefined)return;
    if(e.target.tagName==="SELECT"){filas[i].id=e.target.value;guardar();resultados();}
  });
  $("c-filas").addEventListener("input",function(e){
    var i=e.target.dataset.i;if(i===undefined||e.target.tagName!=="INPUT")return;
    var v=parseFloat(e.target.value);filas[i].amount=(!isNaN(v)&&v>0)?Math.min(1000000,v):0;guardar();resultados();
  });
  $("c-filas").addEventListener("click",function(e){
    var i=e.target.dataset.del;if(i===undefined||filas.length===1)return;
    filas.splice(+i,1);guardar();pintar();
  });
  $("c-add").addEventListener("click",function(){
    var usadas=filas.map(function(f){return f.id;});
    var libre=S.DATA.filter(function(d){return !d.sinHistoria&&usadas.indexOf(d.id)===-1;})[0]||S.DATA[0];
    filas.push({id:libre.id,amount:50});guardar();pintar();
  });
  // Lo usa "Mis inversiones" para pasar tus posiciones a esta pestaña.
  window.CARTERA={poner:function(nuevas,aviso){filas=nuevas;guardar();pintar();var c=$("c-aviso");c.textContent=aviso||"";c.hidden=!aviso;}};
  pintar();
})();
