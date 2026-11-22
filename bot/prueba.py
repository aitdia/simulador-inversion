#!/usr/bin/env python3
"""Prueba del bot con 10 años de historia, día a día y sin mirar el futuro.

1. Descarga de Yahoo Finance los cierres diarios de 10 años de todas las empresas del bot.
2. Recorre la historia día a día. Cada día el bot solo sabe lo que ha pasado hasta ese día:
   aprende de las señales cuyo resultado ya se conoce, y compra y vende con lo aprendido.
   El primer año solo aprende; a partir del segundo, opera.
3. Lo compara con meter el dinero en el S&P 500 y con repartirlo a partes iguales entre tus empresas.
4. Guarda el resultado en bot/prueba.json para la web.
5. Con --sembrar, arranca el bot en vivo con todo lo aprendido y con el último año de precios.

Usa precios ajustados (incluyen dividendos y splits) para la prueba, y precios normales para el bot en vivo.
Es una simulación con dinero ficticio: no es una recomendación de inversión.
"""
import heapq, json, os, sys, time, urllib.request
from datetime import datetime
from zoneinfo import ZoneInfo

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import motor  # noqa: E402

AQUI = os.path.dirname(os.path.abspath(__file__))
NY = ZoneInfo("America/New_York")
CACHE = os.environ.get("BOT_CACHE", "/tmp/bot-historia.json")


def descargar(syms):
    if os.path.exists(CACHE) and time.time() - os.path.getmtime(CACHE) < 12 * 3600:
        with open(CACHE) as f:
            return json.load(f)
    datos = {}
    for s in syms:
        url = "https://query1.finance.yahoo.com/v8/finance/chart/%s?range=10y&interval=1d" % s.replace(".", "-")
        for intento in range(3):
            try:
                req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
                with urllib.request.urlopen(req, timeout=30) as r:
                    j = json.loads(r.read().decode())
                res = j["chart"]["result"][0]
                ts = res["timestamp"]
                cl = res["indicators"]["quote"][0]["close"]
                adj = res["indicators"].get("adjclose", [{}])[0].get("adjclose", cl)
                serie = {}
                for t, c, a in zip(ts, cl, adj):
                    if c and a:
                        serie[datetime.fromtimestamp(t, NY).strftime("%Y-%m-%d")] = [round(c, 4), round(a, 4)]
                datos[s] = serie
                break
            except Exception as e:
                print("  %s: intento %d falló (%s)" % (s, intento + 1, e))
                time.sleep(3)
        time.sleep(0.4)
    with open(CACHE, "w") as f:
        json.dump(datos, f)
    return datos


def max_caida(vals):
    pico, peor = vals[0], 0.0
    for v in vals:
        pico = max(pico, v)
        peor = min(peor, v / pico - 1)
    return peor


def main():
    sembrar = "--sembrar" in sys.argv
    with open(os.path.join(AQUI, "config.json")) as f:
        cfg = json.load(f)
    syms = list(dict.fromkeys(cfg["tuyas"] + cfg["grandes"]))
    print("Descargando %d empresas…" % len(syms))
    datos = descargar(syms)
    faltan = [s for s in syms if s not in datos or len(datos[s]) < 2]
    if "SPY" not in datos:
        raise SystemExit("Sin datos del S&P 500 no se puede hacer la prueba.")
    cal = sorted(datos["SPY"])
    N = len(cal)
    print("Calendario: %s → %s (%d días). Sin datos: %s" % (cal[0], cal[-1], N, faltan or "ninguna"))

    # Series alineadas al calendario (None si ese día no cotizaba)
    adj = {s: [datos[s].get(f, [None, None])[1] for f in cal] for s in datos}
    cap = cfg["capital"]
    com = cfg["comision"]
    tam_base = cap / cfg["max_posiciones"]
    coste_pct = 2 * com / tam_base

    # 1) Señales y lo que habría pasado con cada forma de vender (se revela el día que se cierra)
    t0 = time.time()
    revelar = []           # heap: (día en que se sabe, regla, régimen, salida, rendimiento)
    senales_dia = [[] for _ in range(N)]
    regs = []
    hist_spy = []
    for t in range(N):
        p = adj["SPY"][t]
        regs.append(motor.regimen(hist_spy, p))
        hist_spy.append(p)
    pendientes = []        # señales recientes cuyo resultado aún no se conoce del todo (para el bot en vivo)
    for s in adj:
        serie = adj[s]
        hist, ultima = [], {}
        for t in range(N):
            p = serie[t]
            if p is None:
                continue
            ind = motor.indicadores(hist, p) if hist else None
            hist.append(p)
            if not ind:
                continue
            for rid in motor.senales(ind):
                if t - ultima.get(rid, -10 ** 9) < motor.SEPARACION:
                    continue
                ultima[rid] = t
                senales_dia[t].append((s, rid))
                idx = [j for j in range(t + 1, min(N, t + 1 + motor.MAX_DIAS)) if serie[j] is not None]
                camino = [serie[j] for j in idx]
                camino_spy = [adj["SPY"][j] for j in idx]
                falta = []
                for sid in motor.SALIDAS:
                    r = motor.ventaja(p, camino, adj["SPY"][t], camino_spy, sid, coste_pct)
                    if r is None:
                        falta.append(sid)
                        continue
                    heapq.heappush(revelar, (idx[r[1] - 1], rid, regs[t], sid, r[0]))
                if falta:
                    pendientes.append({"sym": s, "regla": rid, "regimen": regs[t], "fecha": cal[t],
                                       "precio": datos[s][cal[t]][0], "spy": datos["SPY"][cal[t]][0], "faltan": falta})
    print("Señales calculadas en %.0f s: %d casos por revelar." % (time.time() - t0, len(revelar)))

    # 2) Recorrido día a día
    INICIO = 252          # el primer año solo aprende
    est, rec = {}, {}
    efectivo, pos, ops = float(cap), {}, []
    sec = cfg.get("sectores", {})
    curva, ult = [], {}
    p0 = adj["SPY"][INICIO]
    u_spy = (cap - com) / p0
    tuyas = [s for s in cfg["tuyas"] if s != "SPY" and s in adj and adj[s][INICIO] is not None]
    u_ig = {s: (cap / len(tuyas) - com) / adj[s][INICIO] for s in tuyas}
    invertido = 0.0
    aparcado = 0.0          # participaciones del S&P 500 donde deja el dinero que no usa
    for t in range(N):
        motor.olvidar(est, rec)
        while revelar and revelar[0][0] <= t - 1:
            _, rid, reg, sid, rend = heapq.heappop(revelar)
            motor.anotar(est, rid, reg, sid, rend, rec)
        for s in adj:
            if adj[s][t] is not None:
                ult[s] = adj[s][t]
        if t < INICIO:
            continue
        fecha = cal[t]
        # ventas
        vendidas = set()
        for s in list(pos):
            q = pos[s]
            precio = adj[s][t]
            if precio is None:
                continue
            q["dias"] += 1
            g, pe, d = motor.SALIDAS[q["salida"]]
            r = precio / q["precio"] - 1
            if r >= g or r <= -pe or q["dias"] >= d:
                neto = q["acciones"] * precio - com
                efectivo += neto
                ops.append({"fecha": fecha, "sym": s, "regla": q["regla"], "dias": q["dias"],
                            "resultado": neto - q["coste"], "pct": (neto - q["coste"]) / q["coste"]})
                del pos[s]
                vendidas.add(s)
        # compras
        total = efectivo + sum(q["acciones"] * ult[s] for s, q in pos.items())
        cands = []
        total += aparcado * adj["SPY"][t]
        for s, rid in senales_dia[t]:
            f = motor.fiable(est, rid, regs[t], rec)
            if f:
                cands.append((f[0], s, rid, f[1]))
        cands.sort(reverse=True)
        for punt, s, rid, sid in cands:
            if s in pos or s in vendidas or len(pos) >= cfg["max_posiciones"]:
                continue
            # repartir el riesgo: pocas empresas por regla y por sector
            if sum(1 for q in pos.values() if q["regla"] == rid) >= cfg.get("max_por_regla", 99):
                continue
            if sec.get(s) != "Índice" and sum(1 for x in pos if sec.get(x) == sec.get(s)) >= cfg.get("max_por_sector", 99):
                continue
            gasto = total / cfg["max_posiciones"]
            if efectivo < gasto and aparcado > 0:      # saca del S&P 500 lo que le falta
                vende = min(aparcado, (gasto - efectivo + com) / adj["SPY"][t])
                aparcado -= vende
                efectivo += vende * adj["SPY"][t] - com
            gasto = min(gasto, efectivo)
            if gasto < cfg["minimo_compra"]:
                break
            precio = adj[s][t]
            efectivo -= gasto
            pos[s] = {"acciones": (gasto - com) / precio, "precio": precio, "coste": gasto, "regla": rid,
                      "salida": sid, "dias": 0}
        # lo que sobra (más de una posición en efectivo) lo deja en el S&P 500
        if cfg.get("aparcar_en_indice") and efectivo > 2 * total / cfg["max_posiciones"]:
            mete = efectivo - total / cfg["max_posiciones"]
            aparcado += (mete - com) / adj["SPY"][t]
            efectivo -= mete
        en_acciones = sum(q["acciones"] * ult[s] for s, q in pos.items())
        vb = efectivo + en_acciones + aparcado * ult["SPY"]
        invertido += en_acciones / vb
        vs = u_spy * ult["SPY"]
        vi = sum(u * ult[s] for s, u in u_ig.items())
        curva.append([fecha, vb, vs, vi])

    # 3) Resumen
    def cagr(v0, v1, dias):
        return (v1 / v0) ** (252 / dias) - 1 if dias > 0 else 0
    n = len(curva)
    final = curva[-1]
    serie = lambda k: [c[k] for c in curva]
    anual = {}
    for c in curva:
        anual.setdefault(c[0][:4], []).append(c)
    años = []
    previo = [None, cap, cap, cap]
    for a in sorted(anual):
        u = anual[a][-1]
        años.append({"anio": a, "bot": u[1] / previo[1] - 1, "spy": u[2] / previo[2] - 1, "iguales": u[3] / previo[3] - 1})
        previo = u
    ganadoras = [o for o in ops if o["resultado"] > 0]
    por_regla = {}
    for o in ops:
        x = por_regla.setdefault(o["regla"], {"n": 0, "ganadas": 0, "resultado": 0.0})
        x["n"] += 1
        x["ganadas"] += 1 if o["resultado"] > 0 else 0
        x["resultado"] += o["resultado"]
    for x in por_regla.values():
        x["resultado"] = round(x["resultado"], 2)
    semanal = [curva[i] for i in range(0, n, 5)] + ([curva[-1]] if (n - 1) % 5 else [])
    prueba = {
        "generado": datetime.now(NY).isoformat(timespec="minutes"),
        "desde": cal[0], "opera_desde": cal[INICIO], "hasta": cal[-1], "capital": cap, "comision": com,
        "iguales_empresas": tuyas, "sin_datos": faltan,
        "final": {"bot": round(final[1], 2), "spy": round(final[2], 2), "iguales": round(final[3], 2)},
        "anual_medio": {"bot": cagr(cap, final[1], n), "spy": cagr(cap, final[2], n), "iguales": cagr(cap, final[3], n)},
        "peor_caida": {"bot": max_caida(serie(1)), "spy": max_caida(serie(2)), "iguales": max_caida(serie(3))},
        "operaciones": len(ops), "ganadoras": len(ganadoras),
        "media_operacion": sum(o["pct"] for o in ops) / len(ops) if ops else 0,
        "en_acciones": invertido / max(1, n), "max_por_regla": cfg.get("max_por_regla"), "max_por_sector": cfg.get("max_por_sector"), "aparca_en_indice": bool(cfg.get("aparcar_en_indice")),
        "mejor": max(ops, key=lambda o: o["pct"]) if ops else None,
        "peor": min(ops, key=lambda o: o["pct"]) if ops else None,
        "anios": años, "por_regla": por_regla,
        "curva": [[c[0], round(c[1], 2), round(c[2], 2), round(c[3], 2)] for c in semanal],
    }
    for k in ("mejor", "peor"):
        if prueba[k]:
            prueba[k] = {x: (round(v, 4) if isinstance(v, float) else v) for x, v in prueba[k].items()}
    with open(os.path.join(AQUI, "prueba.json"), "w", encoding="utf-8") as f:
        json.dump(prueba, f, ensure_ascii=False, separators=(",", ":"))
    print("Bot: %.0f $ | S&P 500: %.0f $ | Tus empresas: %.0f $ | %d operaciones, %d ganadoras" % (
        final[1], final[2], final[3], len(ops), len(ganadoras)))
    for x in años:
        print("  %s  bot %+6.1f %%  spy %+6.1f %%  iguales %+6.1f %%" % (x["anio"], x["bot"] * 100, x["spy"] * 100, x["iguales"] * 100))

    if not sembrar:
        return
    # 4) Arrancar el bot en vivo con lo aprendido
    while revelar and revelar[0][0] <= N - 1:     # lo que ya se sabe al cierre del último día
        _, rid, reg, sid, rend = heapq.heappop(revelar)
        motor.anotar(est, rid, reg, sid, rend, rec)
    fd = os.path.join(AQUI, "datos.json")
    with open(fd, encoding="utf-8") as f:
        d = json.load(f)
    if d.get("posiciones") or d.get("operaciones"):
        raise SystemExit("El bot ya ha operado: no lo vuelvo a arrancar para no perder lo que ha hecho.")
    ultimo = cal[-1]
    d["version"] = 2
    d["est"] = {k: [round(x, 4) for x in v] for k, v in est.items()}
    d["rec"] = {k: [round(x, 4) for x in v] for k, v in rec.items()}
    d["sombra"] = [x for x in pendientes if x["fecha"] > cal[max(0, N - motor.MAX_DIAS - 5)]]
    d["reales"] = {}
    d.pop("reglas", None)
    d["aprendido_desde"] = cal[0]
    hist = {}
    for s in datos:
        fechas = sorted(f for f in datos[s] if f <= ultimo)[-300:]
        hist[s] = [[f, datos[s][f][0]] for f in fechas]
    d["regimen"] = motor.regimen([c for _, c in hist["SPY"][:-1]], hist["SPY"][-1][1])
    precio = {s: hist[s][-1][1] for s in hist if hist[s] and hist[s][-1][0] == ultimo}
    d["indice"] = {"fecha": ultimo, "precio": precio["SPY"], "unidades": (d["capital"] - com) / precio["SPY"]}
    mias = [s for s in cfg["tuyas"] if s != "SPY" and s in precio]
    d["iguales"] = {"fecha": ultimo, "empresas": mias,
                    "unidades": {s: (d["capital"] / len(mias) - com) / precio[s] for s in mias}}
    vi = sum(u * precio[s] for s, u in d["iguales"]["unidades"].items())
    d["curva"] = [[ultimo, round(d["efectivo"], 2), round(d["indice"]["unidades"] * precio["SPY"], 2), round(vi, 2)]]
    d["resumen_reglas"] = motor.resumen_reglas(est, rec)
    d["ultima"] = {"cuando": datetime.now(NY).isoformat(timespec="minutes"), "modo": "aprender",
                   "nota": "Ha aprendido de 10 años de historia (%s a %s). %d reglas fiables en mercado %s." % (
                       cal[0], ultimo, sum(1 for r in d["resumen_reglas"].values() if r.get(d["regimen"], {}).get("fiable")), d["regimen"])}
    with open(fd, "w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False, separators=(",", ":"))
    with open(os.path.join(AQUI, "historial.json"), "w", encoding="utf-8") as f:
        json.dump(hist, f, ensure_ascii=False, separators=(",", ":"))
    print("Bot en vivo arrancado: %d estadísticas, %d señales pendientes, mercado %s." % (len(d["est"]), len(d["sombra"]), d["regimen"]))


if __name__ == "__main__":
    main()
