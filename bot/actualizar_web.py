#!/usr/bin/env python3
"""Actualiza los datos de la web desde Yahoo Finance (gratis, sin clave).

- bot/web/empresas.js  (window.EMPRESAS): rentabilidades por año, a 1-10 años, en lo que va de año y peor caída.
  Lo usan el Simulador, Probar reparto y Mercado.
- bot/web/mercado.js   (window.MERCADO): lo que opinan los analistas: precio objetivo (medio, más bajo y más alto),
  cuántos analistas y sus votos de compra/venta.

Lo lanza el bot cada día de bolsa después de repasar (22:30 en España). También a mano:
  python3 bot/actualizar_web.py
Si algo falla con una empresa, se queda con sus datos anteriores.
"""
import http.cookiejar, json, os, re, sys, time, urllib.request
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

AQUI = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.join(AQUI, "web")
NY = ZoneInfo("America/New_York")
ULTIMO_ANIO = 2025      # último año completo que enseña la web (el simulador lo usa así)
PRIMER_ANIO = 2016


class Yahoo:
    def __init__(self):
        cj = http.cookiejar.CookieJar()
        self.op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
        self.op.addheaders = [("User-Agent", "Mozilla/5.0 (X11; Linux x86_64)")]
        self.crumb = None

    def _json(self, url):
        for intento in range(3):
            try:
                with self.op.open(url, timeout=30) as r:
                    return json.loads(r.read().decode())
            except Exception as e:
                ultimo = e
                time.sleep(2 + intento * 3)
        raise ultimo

    def serie(self, sym):
        j = self._json("https://query1.finance.yahoo.com/v8/finance/chart/%s?range=max&interval=1d" % sym)
        res = j["chart"]["result"][0]
        adj = res["indicators"].get("adjclose", [{}])[0].get("adjclose") or res["indicators"]["quote"][0]["close"]
        out = []
        for t, a in zip(res["timestamp"], adj):
            if a:
                out.append((datetime.fromtimestamp(t, NY).strftime("%Y-%m-%d"), a))
        return out

    def analistas(self, sym):
        if not self.crumb:
            try:
                self.op.open("https://fc.yahoo.com", timeout=15)
            except Exception:
                pass
            with self.op.open("https://query2.finance.yahoo.com/v1/test/getcrumb", timeout=15) as r:
                self.crumb = r.read().decode().strip()
        j = self._json("https://query2.finance.yahoo.com/v10/finance/quoteSummary/%s?modules=financialData,recommendationTrend&crumb=%s"
                       % (sym, urllib.request.quote(self.crumb)))
        return j["quoteSummary"]["result"][0]


def leer_js(ruta, var):
    """Lee un archivo window.X={...} o =[...] escrito como JS (claves sin comillas) y lo pasa a Python."""
    t = open(ruta, encoding="utf-8").read()
    t = t[t.index("window.%s=" % var) + len("window.%s=" % var):].rstrip().rstrip(";")
    t = re.sub(r"(?m)^\s*//[^\n]*", "", t)
    t = re.sub(r'([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:', r'\1"\2":', t)
    t = re.sub(r",(\s*[}\]])", r"\1", t)
    return json.loads(t)


def calcular(serie, previo):
    """Rentabilidades de la web a partir de los cierres ajustados (incluyen dividendos)."""
    if len(serie) < 30:
        return None
    fechas = [f for f, _ in serie]
    precio = dict(serie)
    ultima, p = serie[-1]
    hoy = datetime.fromisoformat(ultima)

    def en(fecha):          # último cierre en o antes de esa fecha
        import bisect
        i = bisect.bisect_right(fechas, fecha) - 1
        return precio[fechas[i]] if i >= 0 else None

    def fin_de(anio):
        f = "%d-12-31" % anio
        return en(f) if fechas[0] <= f else None

    back = []
    for k in (1, 2, 3, 5, 10):
        f = (hoy - timedelta(days=round(365.25 * k))).strftime("%Y-%m-%d")
        back.append(round((p / en(f) - 1) * 100, 2) if fechas[0] <= f else None)
    ytd = fin_de(hoy.year - 1)
    y0 = max(PRIMER_ANIO, int(fechas[0][:4]) + 1)
    yrs = []
    for a in range(y0, ULTIMO_ANIO + 1):
        ini, fin = fin_de(a - 1), fin_de(a)
        yrs.append(round((fin / ini - 1) * 100, 2))
    pico, peor = 0, 0
    for _, a in serie:
        pico = max(pico, a)
        peor = min(peor, a / pico - 1)
    out = dict(previo)
    out.update({"ytd": round((p / ytd - 1) * 100, 2) if ytd else None, "back": back, "yrs": yrs,
                "dd": round(peor * 100, 2), "ddNote": "desde %s" % fechas[0][:4], "dato": ultima})
    if y0 != PRIMER_ANIO:
        out["y0"] = y0
    else:
        out.pop("y0", None)
    for k in ("cagr", "cagrNota"):
        out.pop(k, None)
    if y0 > ULTIMO_ANIO:          # sin ningún año completo: la web la trata como recién salida a bolsa
        out.update({"yrs": [], "back": None, "y0": hoy.year})
    return out


CONSENSO = {"strong_buy": "Compra fuerte", "buy": "Compra", "hold": "Mantener", "underperform": "Venta", "sell": "Venta fuerte"}


def opinion(y, sym, previa, hoy):
    r = y.analistas(sym)
    fd = r.get("financialData", {})
    v = lambda k: (fd.get(k) or {}).get("raw")
    tr = [x for x in r.get("recommendationTrend", {}).get("trend", []) if x.get("period") == "0m"]
    votos = [tr[0]["strongBuy"], tr[0]["buy"], tr[0]["hold"], tr[0]["sell"], tr[0]["strongSell"]] if tr else None
    if votos and not sum(votos):
        votos = None
    e = {"id": previa["id"], "fecha": hoy, "moneda": "$", "precio": v("currentPrice"), "objetivo": v("targetMeanPrice"),
         "bajo": v("targetLowPrice"), "alto": v("targetHighPrice"), "analistas": v("numberOfAnalystOpinions"),
         "consenso": CONSENSO.get(fd.get("recommendationKey")), "votos": votos,
         "url": "https://finance.yahoo.com/quote/%s/analysis" % sym}
    for k in ("precio", "objetivo", "bajo", "alto"):
        if e[k] is not None:
            e[k] = round(e[k], 2)
    if not e["objetivo"]:
        e["nota"] = previa.get("nota") or "Todavía no hay precio objetivo de los analistas"
    if not e["precio"]:
        raise ValueError("sin precio")
    return e


def js(obj):
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"))


def main():
    os.makedirs(WEB, exist_ok=True)
    f_emp, f_mer = os.path.join(WEB, "empresas.js"), os.path.join(WEB, "mercado.js")
    empresas = leer_js(f_emp, "EMPRESAS")
    mercado = leer_js(f_mer, "MERCADO")
    y = Yahoo()
    hoy = datetime.now(NY).strftime("%Y-%m-%d")
    bien, mal = 0, []
    nuevas = []
    for d in empresas:
        sym = d["sym"].split(":")[1]
        try:
            n = calcular(y.serie(sym), d)
            nuevas.append(n or d)
            bien += 1
        except Exception as e:
            mal.append("%s (%s)" % (d["id"], e))
            nuevas.append(d)
        time.sleep(0.5)
    previas = {e["id"]: e for e in mercado["empresas"]}
    ops = []
    for d in nuevas:
        sym = d["sym"].split(":")[1]
        if d["id"] == "SPY":
            continue
        previa = previas.get(d["id"], {"id": d["id"]})
        try:
            ops.append(opinion(y, sym, previa, hoy))
        except Exception as e:
            mal.append("%s analistas (%s)" % (d["id"], e))
            if d["id"] in previas:
                ops.append(previas[d["id"]])
        time.sleep(0.5)
    cab = ("// Generado automáticamente por bot/actualizar_web.py el %s con datos de Yahoo Finance.\n"
           "// No lo edites a mano: se sobrescribe cada día de bolsa.\n" % hoy)
    with open(f_emp + ".tmp", "w", encoding="utf-8") as f:
        f.write(cab + "// back: %% acumulado a 1, 2, 3, 5 y 10 años. yrs: %% de cada año desde y0 (2016 si no se indica) hasta %d. "
                "dd: peor caída desde el máximo. Todo con dividendos.\n" % ULTIMO_ANIO)
        f.write("window.EMPRESAS=[\n" + ",\n".join("  " + js(d) for d in nuevas) + "\n];\n")
    with open(f_mer + ".tmp", "w", encoding="utf-8") as f:
        f.write(cab + "// votos: [compra fuerte, compra, mantener, venta, venta fuerte] del último mes. Precios en dólares.\n")
        f.write("window.MERCADO=" + js({"consultado": hoy, "fuente": "Yahoo Finance", "empresas": ops}) + ";\n")
    os.replace(f_emp + ".tmp", f_emp)
    os.replace(f_mer + ".tmp", f_mer)
    nota = "Web actualizada: %d de %d empresas." % (bien, len(empresas))
    if mal:
        nota += " Sin cambios: " + ", ".join(mal[:6])
    print(nota)
    return nota


if __name__ == "__main__":
    main()
