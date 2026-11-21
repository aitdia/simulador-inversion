// Pestañas: muestra una sección u otra según el # de la dirección.
(function(){
  "use strict";
  var VISTAS=["simulador","mercado","cartera","compras","renta","plan","bot"];
  function mostrar(){
    var v=location.hash.replace("#","");
    if(VISTAS.indexOf(v)===-1)v="simulador";
    VISTAS.forEach(function(n){
      document.getElementById("v-"+n).hidden=(n!==v);
      var a=document.querySelector('.tabs a[href="#'+n+'"]');
      if(n===v)a.setAttribute("aria-current","page");else a.removeAttribute("aria-current");
    });
    window.dispatchEvent(new Event("resize"));
  }
  window.addEventListener("hashchange",mostrar);
  mostrar();
})();
