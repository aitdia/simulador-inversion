#!/usr/bin/env python3
"""Bot de paper trading que aprende de sus resultados.

Opera con dinero ficticio. Nada de lo que hace es una recomendación de inversión.

Modos (primer argumento):
  preparar  antes de la apertura: deja anotado qué tiene y qué vigila. No opera.
  operar    con la bolsa abierta: vende lo que toca, busca señales y compra. Apunta las señales para aprender.
  repasar   tras el cierre: guarda el cierre del día, mira cómo acabaron las señales y aprende. No opera.
  semanal   fin de semana: resumen de la semana. No opera.

Lo que aprende está en motor.py. La prueba con 10 años de historia está en prueba.py.
Memoria: bot/datos.json y bot/historial.json. Configuración: bot/config.json. Clave: FINNHUB_KEY.
Pruebas sin internet: BOT_MOCK=1 (precios inventados) y BOT_AHORA=2026-11-23T10:45 (hora de Nueva York).
"""
import json, math, os, random, sys, time, urllib.request, urllib.error
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import motor  # noqa: E402

AQUI = os.path.dirname(os.path.abspath(__file__))
F_DATOS = os.path.join(AQUI, "datos.json")
F_HIST = os.path.join(AQUI, "historial.json")
F_CONFIG = os.path.join(AQUI, "config.json")
NY = ZoneInfo("America/New_York")
MAX_HIST = 300
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
        for _ in range(3):
            espera = 1.05 - (time.time() - self.ultima)   # plan gratis: 60 por minuto
            if espera > 0:
                time.sleep(espera)
            self.ultima = time.time()
            try:
                with urllib.request.urlopen(url, timeout=20) as r:
                    d = json.loads(r.read().decode())
                if not d or not d.get("c"):
                    return None
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
    """Precios inventados que siguen desde el último cierre guardado, para probar sin internet."""
    def __init__(self, hist):
        self.hist = hist
        self.cache = {}

    def _serie(self, sym):
        if sym not in self.cache:
            h = self.hist.get(sym) or [["2026-11-20", 100.0]]
            rnd = random.Random(sym)
            p, vol = h[-1][1], rnd.uniform(0.01, 0.035)
            dias, d = {h[-1][0]: p}, datetime.fromisoformat(h[-1][0])
            for _ in range(400):
                d += timedelta(days=1)
                if d.weekday() < 5:
                    p *= math.exp(rnd.gauss(0.0003, vol))
                    dias[d.strftime("%Y-%m-%d")] = p
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
        if claves[-1] == t.strftime("%Y-%m-%d") and hora < 16:
            c = pc + (c - pc) * max(0.0, (hora - 9.5) / 6.5)
        ts = int(t.timestamp()) if bolsa_abierta_por_hora(t) else int(datetime.fromisoformat(claves[-1] + "T16:00").replace(tzinfo=NY).timestamp())
        return {"c": c, "dp": (c / pc - 1) * 100, "pc": pc, "t": ts}


# ---------------------------------------------------------------- memoria
def cargar():
    with open(F_CONFIG, encoding="utf-8") as f:
        cfg = json.load(f)
    with open(F_DATOS, encoding="utf-8") as f:
        d = json.load(f)
    if d.get("version") != 2:
        raise SystemExit("La memoria del bot es de la versión anterior. Ejecuta: python3 bot/prueba.py --sembrar")
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
    for m in ("est", "rec"):
        d[m] = {k: [round(x, 4) for x in v] for k, v in d.get(m, {}).items()}
    hist = d.pop("historial")
    _escribir(F_DATOS, d)
    if con_historial:
        _escribir(F_HIST, hist)


def universo(cfg):
    return list(dict.fromkeys(cfg["tuyas"] + cfg["grandes"]))


def precio_de(d, s, por_defecto=None):
    p = d["precios"].get(s, {}).get("c")
    if p:
        return p
    h = d["historial"].get(s)
    return h[-1][1] if h else por_defecto


def valor_total(d):
    return d["efectivo"] + sum(p["acciones"] * precio_de(d, s, p["precio"]) for s, p in d["posiciones"].items())


def valor_indice(d):
    i = d.get("indice")
    p = precio_de(d, "SPY")
    return i["unidades"] * p if i and p else None


def valor_iguales(d):
    g = d.get("iguales")
    if not g:
        return None
    return sum(u * precio_de(d, s, 0) for s, u in g["unidades"].items())


def cierres(d, s):
    return [c for _, c in d["historial"].get(s, [])]


def dias_de_bolsa_desde(d, fecha, contar_hoy):
    n = sum(1 for f, _ in d["historial"].get("SPY", []) if f > fecha)
    if contar_hoy and (not d["historial"].get("SPY") or d["historial"]["SPY"][-1][0] < hoy()):
        n += 1
    return n


def coste_pct(cfg, d):
    tam = max(cfg["minimo_compra"], valor_total(d) / cfg["max_posiciones"])
    return 2 * cfg["comision"] / tam


def descargar(fuente, syms):
    out = {}
    for s in syms:
        q = fuente.cotizacion(s)
        if q:
            out[s] = q
    return out


# ---------------------------------------------------------------- formato
def plural(n, uno, varios):
    return "%d %s" % (n, uno if n == 1 else varios)


def pct(x):
    return ("%+.1f" % (x * 100)).replace(".", ",") + " %"


def fmt(x):
    if x is None:
        return "—"
    return ("{:,.2f}".format(x)).replace(",", "X").replace(".", ",").replace("X", ".")


def r2(x):
    return round(x, 2) if x is not None else None


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
    reg = motor.regimen(cierres(d, "SPY"), spy["c"])
    d["regimen"] = reg
    notas = []

    # 1) Ventas, con la forma de vender que eligió al comprar
    for s in list(d["posiciones"]):
        p = d["posiciones"][s]
        q = qs.get(s)
        if not q or p["fecha"] >= fecha:   # nunca vende el mismo día que compra
            continue
        g, pe, dias_max = motor.SALIDAS[p["salida"]]
        rend = q["c"] / p["precio"] - 1
        dias = dias_de_bolsa_desde(d, p["fecha"], True)
        motivo = None
        if rend >= g:
            motivo = "ha llegado a su objetivo de ganancia (%s)" % pct(rend)
        elif rend <= -pe:
            motivo = "ha tocado su límite de pérdida (%s)" % pct(rend)
        elif dias >= dias_max:
            motivo = "han pasado sus %d días de bolsa (%s)" % (dias_max, pct(rend))
        if not motivo:
            continue
        importe = p["acciones"] * q["c"]
        neto = importe - com
        resultado = neto - p["coste"]
        d["efectivo"] += neto
        x = d["reales"].setdefault(p["regla"], {"n": 0, "suma": 0.0, "ganadas": 0, "resultado": 0.0})
        x["n"] += 1
        x["suma"] += resultado / p["coste"]
        x["ganadas"] += 1 if resultado > 0 else 0
        x["resultado"] = r2(x["resultado"] + resultado)
        d["operaciones"].append({"fecha": fecha, "hora": hora, "tipo": "venta", "sym": s, "acciones": round(p["acciones"], 6),
                                 "precio": r2(q["c"]), "importe": r2(importe), "comision": com, "regla": p["regla"],
                                 "motivo": "Vende porque " + motivo + ".", "resultado": r2(resultado),
                                 "resultado_pct": round(resultado / p["coste"] * 100, 2), "dias": dias})
        del d["posiciones"][s]
        notas.append("vende %s (%s $)" % (s, ("+" if resultado >= 0 else "") + fmt(resultado)))

    # 2) Señales: todas se apuntan para aprender; solo compra con las reglas fiables en este tipo de mercado
    abiertas = {(x["sym"], x["regla"]) for x in d["sombra"]}
    cands = []
    for s, q in qs.items():
        for rid in motor.senales(motor.indicadores(cierres(d, s), q["c"])):
            if (s, rid) not in abiertas:
                d["sombra"].append({"sym": s, "regla": rid, "regimen": reg, "fecha": fecha, "precio": q["c"],
                                    "spy": spy["c"], "faltan": list(motor.SALIDAS)})
                abiertas.add((s, rid))
            f = motor.fiable(d["est"], rid, reg, d.setdefault("rec", {}))
            if f:
                cands.append((f[0], s, rid, f))

    # 3) Compras: primero las señales de las reglas que mejor le han ido
    cands.sort(key=lambda x: -x[0])
    tam = valor_total(d) / cfg["max_posiciones"]
    vendidas_hoy = {o["sym"] for o in d["operaciones"] if o["fecha"] == fecha and o["tipo"] == "venta"}
    sec = cfg.get("sectores", {})
    for _, s, rid, f in cands:
        if s in d["posiciones"] or s in vendidas_hoy or len(d["posiciones"]) >= cfg["max_posiciones"]:
            continue
        # repartir el riesgo: pocas empresas por regla y por sector
        if sum(1 for q in d["posiciones"].values() if q["regla"] == rid) >= cfg.get("max_por_regla", 99):
            continue
        if sec.get(s) != "Índice" and sum(1 for x in d["posiciones"] if sec.get(x) == sec.get(s)) >= cfg.get("max_por_sector", 99):
            continue
        gasto = min(tam, d["efectivo"])
        if gasto < cfg["minimo_compra"]:
            break
        precio = qs[s]["c"]
        acciones = (gasto - com) / precio
        _, sid, e, de = f
        d["efectivo"] -= gasto
        d["posiciones"][s] = {"acciones": acciones, "precio": precio, "coste": gasto, "fecha": fecha,
                              "regla": rid, "salida": sid, "regimen": reg, "sector": sec.get(s, "")}
        donde = "Con el mercado %s" % reg if de == reg else "Contando los dos tipos de mercado"
        d["operaciones"].append({"fecha": fecha, "hora": hora, "tipo": "compra", "sym": s, "acciones": round(acciones, 6),
                                 "precio": r2(precio), "importe": r2(gasto - com), "comision": com, "regla": rid,
                                 "salida": sid,
                                 "motivo": "Compra porque %s. %s, esta regla ha ganado de media %s más que el S&P 500 "
                                           "en %d casos si se vende así: %s." % (motor.NOMBRES[rid].lower(), donde,
                                                                                  pct(e[1] / e[0]), round(e[0]), motor.nombre_salida(sid))})
        notas.append("compra %s" % s)

    msg = "Ha mirado %d empresas con el mercado %s. " % (len(qs), reg)
    msg += ("Operaciones: " + ", ".join(notas) + ".") if notas else "No ha hecho ninguna operación."
    return msg


def repasar(cfg, d, fuente, forzar=False):
    t = ahora()
    if not forzar and (t.weekday() >= 5 or t.hour < 16):
        return "La sesión de hoy no ha terminado; no repaso."
    qs = descargar(fuente, universo(cfg))
    spy = qs.get("SPY")
    if not spy:
        return "No he podido obtener precios; no repaso."
    fecha = datetime.fromtimestamp(spy["t"], NY).strftime("%Y-%m-%d") if spy["t"] else t.strftime("%Y-%m-%d")
    if not forzar and fecha != t.strftime("%Y-%m-%d"):
        return "Hoy no ha habido bolsa (festivo); no repaso."
    dia_nuevo = not d["historial"].get("SPY") or d["historial"]["SPY"][-1][0] < fecha
    if dia_nuevo:
        motor.olvidar(d["est"], d.setdefault("rec", {}))   # cada día de bolsa, lo aprendido pesa un poco menos
    for s, q in qs.items():
        d["precios"][s] = q
        h = d["historial"].setdefault(s, [])
        if h and h[-1][0] == fecha:
            h[-1][1] = round(q["c"], 4)
        elif not h or h[-1][0] < fecha:
            h.append([fecha, round(q["c"], 4)])
        del h[:-MAX_HIST]

    # Cómo acabaron las señales apuntadas: con cada forma de vender, frente al S&P 500
    coste = coste_pct(cfg, d)
    spy_por_dia = dict(d["historial"].get("SPY", []))
    limite = (t - timedelta(days=70)).strftime("%Y-%m-%d")
    quedan, aprendidas = [], 0
    for x in d["sombra"]:
        if x["fecha"] < limite:
            continue
        camino, camino_spy = [], []
        for f, c in d["historial"].get(x["sym"], []):
            if f > x["fecha"] and f in spy_por_dia:
                camino.append(c)
                camino_spy.append(spy_por_dia[f])
        siguen = []
        for sid in x["faltan"]:
            r = motor.ventaja(x["precio"], camino, x["spy"], camino_spy, sid, coste)
            if r is None:
                siguen.append(sid)
            else:
                motor.anotar(d["est"], x["regla"], x["regimen"], sid, r[0], d.setdefault("rec", {}))
                aprendidas += 1
        if siguen:
            x["faltan"] = siguen
            quedan.append(x)
    d["sombra"] = quedan
    d["regimen"] = motor.regimen(cierres(d, "SPY")[:-1], spy["c"])
    d["resumen_reglas"] = motor.resumen_reglas(d["est"], d.setdefault("rec", {}))

    vb, vi, vg = valor_total(d), valor_indice(d), valor_iguales(d)
    if d["curva"] and d["curva"][-1][0] == fecha:
        d["curva"][-1] = [fecha, r2(vb), r2(vi), r2(vg)]
    else:
        d["curva"].append([fecha, r2(vb), r2(vi), r2(vg)])

    cap = d["capital"]
    hoy_ops = [o for o in d["operaciones"] if o["fecha"] == fecha]
    fiables = [k for k, v in d["resumen_reglas"].items() if v.get(d["regimen"], {}).get("fiable")]
    txt = "Bot: %s $ (%s). S&P 500: %s $ (%s). Tus empresas a partes iguales: %s $ (%s). " % (
        fmt(vb), pct(vb / cap - 1), fmt(vi), pct(vi / cap - 1), fmt(vg), pct(vg / cap - 1))
    txt += "Hoy: %s. Ha aprendido %s (%s pendientes). Mercado %s: se fía de %s." % (
        plural(len(hoy_ops), "operación", "operaciones"), plural(aprendidas, "resultado nuevo", "resultados nuevos"),
        len(quedan), d["regimen"], plural(len(fiables), "regla", "reglas"))
    d["resumenes"] = [x for x in d["resumenes"] if not (x["fecha"] == fecha and x["tipo"] == "dia")]
    d["resumenes"].append({"fecha": fecha, "tipo": "dia", "texto": txt})
    return txt


def preparar(cfg, d):
    vigila = []
    for s, p in d["posiciones"].items():
        g, pe, _ = motor.SALIDAS[p["salida"]]
        rend = precio_de(d, s, p["precio"]) / p["precio"] - 1
        if rend >= g * 0.7 or rend <= -pe * 0.7:
            vigila.append("%s (%s)" % (s, pct(rend)))
    reg = d.get("regimen", "alcista")
    fiables = [v["nombre"] for v in d.get("resumen_reglas", {}).values() if v.get(reg, {}).get("fiable")]
    txt = "Tiene %s y %s $ en efectivo. Mercado %s. " % (plural(len(d["posiciones"]), "posición", "posiciones"), fmt(d["efectivo"]), reg)
    txt += ("Cerca de vender: " + ", ".join(vigila) + ". ") if vigila else ""
    txt += ("Hoy comprará si ve alguna de sus %s fiables: %s." % (plural(len(fiables), "regla", "reglas"), "; ".join(fiables))) if fiables \
        else "Hoy no se fía de ninguna regla: solo observará."
    d["plan"] = {"fecha": hoy(), "texto": txt}
    return txt


def semanal(cfg, d):
    t = ahora()
    desde = (t - timedelta(days=7)).strftime("%Y-%m-%d")
    ops = [o for o in d["operaciones"] if o["fecha"] > desde]
    ventas = [o for o in ops if o["tipo"] == "venta"]
    ganado = sum(o["resultado"] for o in ventas)
    txt = "Semana: %d compras y %d ventas (resultado de las ventas: %s $). " % (len(ops) - len(ventas), len(ventas), ("+" if ganado >= 0 else "") + fmt(ganado))
    curva = [c for c in d["curva"] if c[0] > desde]
    if curva:
        ant = [c for c in d["curva"] if c[0] <= desde]
        base = ant[-1] if ant else d["curva"][0]
        fin = curva[-1]
        txt += "En la semana: bot %s, S&P 500 %s, tus empresas %s. " % (
            pct(fin[1] / base[1] - 1), pct(fin[2] / base[2] - 1) if fin[2] and base[2] else "—",
            pct(fin[3] / base[3] - 1) if len(fin) > 3 and fin[3] and len(base) > 3 and base[3] else "—")
    reales = sorted(d["reales"].items(), key=lambda x: -x[1]["resultado"])
    if reales:
        txt += "Regla que más le ha dado de verdad: «%s» (%s $)." % (motor.NOMBRES.get(reales[0][0], reales[0][0]), fmt(reales[0][1]["resultado"]))
    d["resumenes"].append({"fecha": t.strftime("%Y-%m-%d"), "tipo": "semana", "texto": txt})
    return txt


def main():
    modo = sys.argv[1] if len(sys.argv) > 1 else "operar"
    forzar = "--forzar" in sys.argv
    cfg, d = cargar()
    if os.environ.get("BOT_MOCK") == "1":
        fuente = Simulado(d["historial"])
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
