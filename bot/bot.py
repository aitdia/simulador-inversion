#!/usr/bin/env python3
"""Bot de paper trading que aprende de sus resultados.

Opera con dinero ficticio. Nada de lo que hace es una recomendación de inversión.

Modos (primer argumento):
  preparar  antes de la apertura: deja anotado qué tiene y qué vigila. No opera.
  operar    con la bolsa abierta: vende lo que toca, busca señales y compra. Apunta señales en sombra.
  repasar   tras el cierre: guarda el cierre del día, evalúa las señales en sombra y aprende. No opera.
  semanal   fin de semana: resumen de la semana. No opera.

Memoria: bot/datos.json. Configuración: bot/config.json. Clave: variable de entorno FINNHUB_KEY.
Pruebas sin internet: BOT_MOCK=1 (precios inventados) y BOT_AHORA=2026-11-23T10:45 (hora de Nueva York).
"""
import json, math, os, random, sys, time, urllib.request, urllib.error
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

AQUI = os.path.dirname(os.path.abspath(__file__))
F_DATOS = os.path.join(AQUI, "datos.json")
F_HIST = os.path.join(AQUI, "historial.json")   # cierres diarios; solo cambia una vez al día
F_CONFIG = os.path.join(AQUI, "config.json")
NY = ZoneInfo("America/New_York")
MAX_HIST = 260          # cierres diarios que guarda por empresa (~1 año)
MAX_OPS = 2000
MAX_RESUMENES = 120


# ---------------------------------------------------------------- tiempo
def ahora():
    f = os.environ.get("BOT_AHORA")
    if f:
        return datetime.fromisoformat(f).replace(tzinfo=NY)
    return datetime.now(NY)


def hoy():
    return ahora().strftime("%Y-%m-%d")


def bolsa_abierta_por_hora(t):
    if t.weekday() >= 5:
        return False
    m = t.hour * 60 + t.minute
    return 9 * 60 + 30 <= m < 16 * 60


# ---------------------------------------------------------------- precios
class Finnhub:
    def __init__(self, clave):
        self.clave = clave
        self.ultima = 0.0

    def cotizacion(self, sym):
        url = "https://finnhub.io/api/v1/quote?symbol=%s&token=%s" % (sym, self.clave)
        for intento in range(3):
            espera = 1.05 - (time.time() - self.ultima)   # plan gratis: 60 por minuto
            if espera > 0:
                time.sleep(espera)
            self.ultima = time.time()
            try:
                with urllib.request.urlopen(url, timeout=20) as r:
                    d = json.loads(r.read().decode())
                if not d or not d.get("c"):
                    return None          # símbolo no disponible en el plan gratis
                return {"c": float(d["c"]), "dp": float(d.get("dp") or 0), "pc": float(d.get("pc") or 0), "t": int(d.get("t") or 0)}
            except urllib.error.HTTPError as e:
                if e.code == 429:
                    time.sleep(5)
                    continue
                if e.code in (401, 403):
                    raise SystemExit("Finnhub rechaza la clave (HTTP %d). Revisa el secret FINNHUB_KEY." % e.code)
                return None
            except Exception:
                time.sleep(2)
        return None


class Simulado:
    """Precios inventados, deterministas por día, para probar sin internet."""
    def __init__(self):
        self.cache = {}

    def _serie(self, sym):
        if sym not in self.cache:
            rnd = random.Random(sym)
            p = rnd.uniform(20, 400)
            vol = rnd.uniform(0.01, 0.04)
            dias = {}
            d = datetime(2026, 11, 2)
            for i in range(200):
                if d.weekday() < 5:
                    p *= math.exp(rnd.gauss(0.0003, vol))
                    dias[d.strftime("%Y-%m-%d")] = p
                d += timedelta(days=1)
            self.cache[sym] = dias
        return self.cache[sym]

    def cotizacion(self, sym):
        t = ahora()
        dias = self._serie(sym)
        claves = sorted(k for k in dias if k <= t.strftime("%Y-%m-%d"))
        if len(claves) < 2:
            return None
        c, pc = dias[claves[-1]], dias[claves[-2]]
        hora = t.hour + t.minute / 60
        if claves[-1] == t.strftime("%Y-%m-%d") and hora < 16:   # durante la sesión, a medio camino
            frac = max(0.0, (hora - 9.5) / 6.5)
            c = pc + (c - pc) * frac
        ts = int(t.timestamp()) if bolsa_abierta_por_hora(t) else int(datetime.fromisoformat(claves[-1] + "T16:00").replace(tzinfo=NY).timestamp())
        return {"c": c, "dp": (c / pc - 1) * 100, "pc": pc, "t": ts}


# ---------------------------------------------------------------- reglas
# Cada familia tiene variantes con distintos números: el bot aprende qué familia y qué número funcionan.
def reglas_iniciales():
    r = {}
    def add(fam, v, nombre):
        r["%s_%s" % (fam, v)] = {"familia": fam, "valor": v, "nombre": nombre,
                                  "n": 0, "suma": 0.0, "ganadas": 0, "real_n": 0, "real_suma": 0.0, "real_ganadas": 0}
    for v in (3, 5):
        add("caida_dia", v, "Cae más de un %d %% en el día" % v)
        add("subida_dia", v, "Sube más de un %d %% en el día" % v)
    for v in (6, 10):
        add("rebote_5d", v, "Ha caído más de un %d %% en 5 días" % v)
    for v in (5, 10):
        add("tendencia_20d", v, "Sube más de un %d %% en 20 días y está sobre su media" % v)
    add("maximo_20d", 0, "Marca su precio más alto de 20 días")
    add("minimo_20d", 0, "Marca su precio más bajo de 20 días")
    return r


def senales(sym, q, hist):
    """Reglas que se cumplen ahora para esta empresa."""
    out = []
    p, dp = q["c"], q["dp"]
    cierres = [c for _, c in hist]
    for v in (3, 5):
        if dp <= -v:
            out.append("caida_dia_%d" % v)
        if dp >= v:
            out.append("subida_dia_%d" % v)
    if len(cierres) >= 5:
        r5 = p / cierres[-5] - 1
        for v in (6, 10):
            if r5 <= -v / 100:
                out.append("rebote_5d_%d" % v)
    if len(cierres) >= 20:
        ult20 = cierres[-20:]
        media = sum(ult20) / 20
        r20 = p / cierres[-20] - 1
        for v in (5, 10):
            if r20 >= v / 100 and p > media:
                out.append("tendencia_20d_%d" % v)
        if p >= max(ult20):
            out.append("maximo_20d_0")
        if p <= min(ult20):
            out.append("minimo_20d_0")
    return out


def puntuacion(r):
    # Media con freno: con pocos casos se queda cerca de 0, para no fiarse de la suerte.
    return r["suma"] / (r["n"] + 5)


# ---------------------------------------------------------------- memoria
def cargar():
    with open(F_CONFIG, encoding="utf-8") as f:
        cfg = json.load(f)
    if os.path.exists(F_DATOS):
        with open(F_DATOS, encoding="utf-8") as f:
            d = json.load(f)
    else:
        d = {"version": 1, "moneda": "$", "inicio": hoy(), "capital": cfg["capital"], "efectivo": float(cfg["capital"]),
             "posiciones": {}, "operaciones": [], "precios": {}, "historial": {}, "sombra": [],
             "reglas": reglas_iniciales(), "curva": [], "indice": None, "resumenes": [], "ultima": None, "plan": None}
    for k, v in reglas_iniciales().items():   # reglas nuevas que se añadan más adelante
        d["reglas"].setdefault(k, v)
    d.pop("historial", None)
    d["historial"] = {}
    if os.path.exists(F_HIST):
        with open(F_HIST, encoding="utf-8") as f:
            d["historial"] = json.load(f)
    return cfg, d


def _escribir(ruta, obj):
    tmp = ruta + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
    os.replace(tmp, ruta)


def guardar(d, con_historial):
    d["operaciones"] = d["operaciones"][-MAX_OPS:]
    d["resumenes"] = d["resumenes"][-MAX_RESUMENES:]
    hist = d.pop("historial")
    _escribir(F_DATOS, d)
    if con_historial:
        _escribir(F_HIST, hist)


def universo(cfg):
    vistos, out = set(), []
    for s in cfg["tuyas"] + cfg["grandes"]:
        if s not in vistos:
            vistos.add(s)
            out.append(s)
    return out


def valor_total(d):
    v = d["efectivo"]
    for s, p in d["posiciones"].items():
        precio = d["precios"].get(s, {}).get("c", p["precio"])
        v += p["acciones"] * precio
    return v


def valor_indice(d):
    i = d.get("indice")
    if not i:
        return None
    precio = d["precios"].get("SPY", {}).get("c")
    return i["unidades"] * precio if precio else None


def r2(x):
    return round(x, 2)


def descargar(fuente, syms):
    out = {}
    for s in syms:
        q = fuente.cotizacion(s)
        if q:
            out[s] = q
    return out


# ---------------------------------------------------------------- modos
def operar(cfg, d, fuente, forzar=False):
    t = ahora()
    if not forzar and not bolsa_abierta_por_hora(t):
        return "La bolsa de EE. UU. está cerrada a esta hora; no hago nada."
    qs = descargar(fuente, universo(cfg))
    spy = qs.get("SPY")
    if not spy:
        return "No he podido obtener precios; no hago nada."
    if not forzar and t.timestamp() - spy["t"] > 30 * 60:
        return "Los precios no se mueven (festivo en EE. UU.); no hago nada."
    for s, q in qs.items():
        d["precios"][s] = q
    fecha, hora = t.strftime("%Y-%m-%d"), t.strftime("%H:%M")
    com = cfg["comision"]

    if not d.get("indice"):   # la comparación: el mismo dinero en el S&P 500 desde el primer día
        d["indice"] = {"fecha": fecha, "precio": spy["c"], "unidades": (d["capital"] - com) / spy["c"]}

    notas = []
    # 1) Ventas
    for s in list(d["posiciones"]):
        p = d["posiciones"][s]
        q = qs.get(s)
        if not q or p["fecha"] >= fecha:   # nunca vende el mismo día que compra
            continue
        rend = q["c"] / p["precio"] - 1
        dias = (datetime.fromisoformat(fecha) - datetime.fromisoformat(p["fecha"])).days
        motivo = None
        if rend >= cfg["objetivo_ganancia"]:
            motivo = "ha llegado al objetivo de ganancia (%s)" % pct(rend)
        elif rend <= -cfg["limite_perdida"]:
            motivo = "ha tocado el límite de pérdida (%s)" % pct(rend)
        elif dias >= cfg["dias_maximos"]:
            motivo = "lleva %d días sin llegar a nada" % dias
        if not motivo:
            continue
        importe = p["acciones"] * q["c"]
        neto = importe - com
        resultado = neto - p["coste"]
        d["efectivo"] += neto
        r = d["reglas"].get(p["regla"])
        if r:
            r["real_n"] += 1
            r["real_suma"] += resultado / p["coste"]
            r["real_ganadas"] += 1 if resultado > 0 else 0
        d["operaciones"].append({"fecha": fecha, "hora": hora, "tipo": "venta", "sym": s, "acciones": round(p["acciones"], 6),
                                 "precio": r2(q["c"]), "importe": r2(importe), "comision": com, "regla": p["regla"],
                                 "motivo": "Vende porque " + motivo, "resultado": r2(resultado),
                                 "resultado_pct": round(resultado / p["coste"] * 100, 2)})
        del d["posiciones"][s]
        notas.append("vende %s (%+.2f $)" % (s, resultado))

    # 2) Señales: todas se apuntan en sombra para aprender; solo se compran las de reglas fiables
    candidatas = []
    abiertas = {(x["sym"], x["regla"]) for x in d["sombra"]}
    for s, q in qs.items():
        for rid in senales(s, q, d["historial"].get(s, [])):
            if (s, rid) not in abiertas:
                d["sombra"].append({"sym": s, "regla": rid, "fecha": fecha, "precio": q["c"]})
                abiertas.add((s, rid))
            r = d["reglas"][rid]
            if r["n"] >= cfg["casos_para_fiarse"] and puntuacion(r) > 0:
                candidatas.append((puntuacion(r), s, rid))

    # 3) Compras: primero las señales de las reglas que mejor le han ido
    candidatas.sort(reverse=True)
    total = valor_total(d)
    tam = total / cfg["max_posiciones"]
    for punt, s, rid in candidatas:
        if s in d["posiciones"] or len(d["posiciones"]) >= cfg["max_posiciones"]:
            continue
        gasto = min(tam, d["efectivo"])
        if gasto < cfg["minimo_compra"]:
            break
        precio = qs[s]["c"]
        acciones = (gasto - com) / precio
        d["efectivo"] -= gasto
        d["posiciones"][s] = {"acciones": acciones, "precio": precio, "coste": gasto, "fecha": fecha, "regla": rid}
        r = d["reglas"][rid]
        d["operaciones"].append({"fecha": fecha, "hora": hora, "tipo": "compra", "sym": s, "acciones": round(acciones, 6),
                                 "precio": r2(precio), "importe": r2(gasto - com), "comision": com, "regla": rid,
                                 "motivo": "Compra porque %s. Esta regla ha dado de media %s en %d casos." % (r["nombre"].lower(), pct(r["suma"] / r["n"]), r["n"])})
        notas.append("compra %s" % s)

    sin_fiables = sum(1 for r in d["reglas"].values() if r["n"] >= cfg["casos_para_fiarse"] and puntuacion(r) > 0)
    msg = "Ha mirado %d empresas. " % len(qs)
    msg += ("Operaciones: " + ", ".join(notas) + ".") if notas else "No ha hecho ninguna operación."
    if not sin_fiables:
        msg += " Todavía no se fía de ninguna regla: sigue observando."
    return msg


def repasar(cfg, d, fuente, forzar=False):
    t = ahora()
    fecha = t.strftime("%Y-%m-%d")
    if not forzar and (t.weekday() >= 5 or t.hour < 16):
        return "La sesión de hoy no ha terminado; no repaso."
    qs = descargar(fuente, universo(cfg))
    spy = qs.get("SPY")
    if not spy:
        return "No he podido obtener precios; no repaso."
    dia_spy = datetime.fromtimestamp(spy["t"], NY).strftime("%Y-%m-%d") if spy["t"] else fecha
    if not forzar and dia_spy != fecha:
        return "Hoy no ha habido bolsa (festivo); no repaso."
    for s, q in qs.items():
        d["precios"][s] = q
        h = d["historial"].setdefault(s, [])
        if h and h[-1][0] == fecha:
            h[-1][1] = round(q["c"], 4)
        else:
            h.append([fecha, round(q["c"], 4)])
        del h[:-MAX_HIST]

    # Evaluar señales en sombra que ya han cumplido su plazo
    com = cfg["comision"]
    tam = max(cfg["minimo_compra"], valor_total(d) / cfg["max_posiciones"])
    coste_pct = 2 * com / tam     # comisión de compra y de venta, en % de una posición normal
    quedan, aprendidas = [], 0
    limite = (t - timedelta(days=45)).strftime("%Y-%m-%d")
    for x in d["sombra"]:
        if x["fecha"] < limite:      # empresa sin datos desde hace mucho: se descarta
            continue
        h = d["historial"].get(x["sym"], [])
        dias_despues = [c for f, c in h if f > x["fecha"]]
        if len(dias_despues) < cfg["horizonte_sombra"]:
            quedan.append(x)
            continue
        rend = dias_despues[cfg["horizonte_sombra"] - 1] / x["precio"] - 1 - coste_pct
        r = d["reglas"].get(x["regla"])
        if r:
            r["n"] += 1
            r["suma"] += rend
            r["ganadas"] += 1 if rend > 0 else 0
            aprendidas += 1
    d["sombra"] = quedan

    if not d.get("indice"):
        d["indice"] = {"fecha": fecha, "precio": spy["c"], "unidades": (d["capital"] - com) / spy["c"]}
    vb, vi = valor_total(d), valor_indice(d)
    if d["curva"] and d["curva"][-1][0] == fecha:
        d["curva"][-1] = [fecha, r2(vb), r2(vi)]
    else:
        d["curva"].append([fecha, r2(vb), r2(vi)])

    hoy_ops = [o for o in d["operaciones"] if o["fecha"] == fecha]
    mejores = sorted((x for x in d["reglas"].items() if x[1]["n"] >= cfg["casos_para_fiarse"]), key=lambda x: -puntuacion(x[1]))
    txt = "Cartera: %s $ (%s). Lo mismo en el S&P 500: %s $ (%s). " % (
        fmt(vb), pct(vb / d["capital"] - 1), fmt(vi), pct(vi / d["capital"] - 1))
    txt += "Hoy: %s. Ha aprendido de %s en sombra (%d pendientes). " % (
        plural(len(hoy_ops), "operación", "operaciones"), plural(aprendidas, "señal", "señales"), len(quedan))
    if mejores and puntuacion(mejores[0][1]) > 0:
        b = mejores[0][1]
        txt += "Su mejor regla ahora: «%s» (%s de media en %d casos, ya con comisiones)." % (b["nombre"], pct(b["suma"] / b["n"]), b["n"])
    elif mejores:
        txt += "Ninguna regla gana de media todavía después de comisiones, así que no compra."
    else:
        txt += "Aún no tiene suficientes casos para fiarse de ninguna regla."
    d["resumenes"] = [x for x in d["resumenes"] if not (x["fecha"] == fecha and x["tipo"] == "dia")]
    d["resumenes"].append({"fecha": fecha, "tipo": "dia", "texto": txt})
    return txt


def preparar(cfg, d):
    pos = d["posiciones"]
    vigila = []
    for s, p in pos.items():
        precio = d["precios"].get(s, {}).get("c", p["precio"])
        rend = precio / p["precio"] - 1
        if rend >= cfg["objetivo_ganancia"] * 0.7 or rend <= -cfg["limite_perdida"] * 0.7:
            vigila.append("%s (%s)" % (s, pct(rend)))
    fiables = [r["nombre"] for r in d["reglas"].values() if r["n"] >= cfg["casos_para_fiarse"] and puntuacion(r) > 0]
    txt = "Tiene %s y %s $ en efectivo. " % (plural(len(pos), "posición", "posiciones"), fmt(d["efectivo"]))
    txt += ("Cerca de vender: " + ", ".join(vigila) + ". ") if vigila else ""
    txt += ("Hoy usará: " + "; ".join(fiables) + ".") if fiables else "Hoy solo observará: ninguna regla es fiable todavía."
    d["plan"] = {"fecha": hoy(), "texto": txt}
    return txt


def semanal(cfg, d):
    t = ahora()
    desde = (t - timedelta(days=7)).strftime("%Y-%m-%d")
    ops = [o for o in d["operaciones"] if o["fecha"] > desde]
    ventas = [o for o in ops if o["tipo"] == "venta"]
    ganado = sum(o["resultado"] for o in ventas)
    curva = [c for c in d["curva"] if c[0] > desde]
    txt = "Semana: %d compras y %d ventas (resultado de las ventas: %s $). " % (len(ops) - len(ventas), len(ventas), ("+" if ganado >= 0 else "") + fmt(ganado))
    if len(curva) >= 1:
        ant = [c for c in d["curva"] if c[0] <= desde]
        base = ant[-1] if ant else [None, d["capital"], d["capital"]]
        fin = curva[-1]
        txt += "En la semana, la cartera %s y el S&P 500 %s. " % (pct(fin[1] / base[1] - 1), pct(fin[2] / base[2] - 1) if fin[2] and base[2] else "—")
    con = [(puntuacion(r), r) for r in d["reglas"].values() if r["n"] >= cfg["casos_para_fiarse"]]
    if con:
        con.sort(key=lambda x: -x[0])
        txt += "Regla que mejor va: «%s». La que peor: «%s»." % (con[0][1]["nombre"], con[-1][1]["nombre"])
    else:
        txt += "Todavía está reuniendo casos para saber qué reglas funcionan."
    d["resumenes"].append({"fecha": t.strftime("%Y-%m-%d"), "tipo": "semana", "texto": txt})
    return txt


def plural(n, uno, varios):
    return "%d %s" % (n, uno if n == 1 else varios)


def pct(x):
    return ("%+.1f" % (x * 100)).replace(".", ",") + " %"


def fmt(x):
    if x is None:
        return "—"
    return ("{:,.2f}".format(x)).replace(",", "X").replace(".", ",").replace("X", ".")


def main():
    modo = sys.argv[1] if len(sys.argv) > 1 else "operar"
    forzar = "--forzar" in sys.argv
    cfg, d = cargar()
    if os.environ.get("BOT_MOCK") == "1":
        fuente = Simulado()
    else:
        clave = os.environ.get("FINNHUB_KEY")
        fuente = Finnhub(clave) if clave else None
        if modo in ("operar", "repasar") and not fuente:
            raise SystemExit("Falta la clave: crea el secret FINNHUB_KEY en el repositorio.")
    if modo == "operar":
        nota = operar(cfg, d, fuente, forzar)
    elif modo == "repasar":
        nota = repasar(cfg, d, fuente, forzar)
    elif modo == "preparar":
        nota = preparar(cfg, d)
    elif modo == "semanal":
        nota = semanal(cfg, d)
    else:
        raise SystemExit("Modo desconocido: " + modo)
    d["ultima"] = {"cuando": ahora().isoformat(timespec="minutes"), "modo": modo, "nota": nota}
    guardar(d, modo == "repasar")
    print("[%s] %s" % (modo, nota))


if __name__ == "__main__":
    main()
