"""Motor de aprendizaje del bot: lo comparten el bot en vivo (bot.py) y la prueba con 10 años (prueba.py).

Ideas clave
- Reglas de compra: cada una es una situación concreta del precio (caída fuerte, cruce de media, RSI bajo...).
- Formas de vender: 12 combinaciones de objetivo de ganancia, límite de pérdida y días máximos.
- Tipo de mercado: alcista si el S&P 500 está por encima de su media de 200 días; bajista si está por debajo.
- Para cada regla, tipo de mercado y forma de vender se guarda lo que habría pasado (ya con comisiones)
  COMPARADO con haber tenido el S&P 500 esos mismos días. Una regla solo vale si gana al índice:
  si no, comprar a ciegas en un mercado que sube también "ganaría".
- Olvido gradual: cada día de bolsa lo aprendido pesa un poco menos, así se adapta si el mercado cambia.
- Solo se fía de una regla con al menos CASOS_MINIMOS casos y ganancia media positiva (con freno a la suerte).
"""

# ---------------------------------------------------------------- formas de vender
GANANCIAS = (0.05, 0.10, 0.20)
PERDIDAS = (0.05, 0.10)
DIAS = (10, 30)
SALIDAS = {}
for _g in GANANCIAS:
    for _p in PERDIDAS:
        for _d in DIAS:
            SALIDAS["g%d_p%d_d%d" % (_g * 100, _p * 100, _d)] = (_g, _p, _d)
MAX_DIAS = max(DIAS)

OLVIDO = 0.999          # cada día de bolsa, lo aprendido se multiplica por esto (vida media ~2,7 años de bolsa)
CASOS_MINIMOS = 30      # casos (ya con olvido) para fiarse de una regla
FRENO = 10              # casos imaginarios con resultado 0 que se suman, para no fiarse de la suerte
SEPARACION = MAX_DIAS   # días mínimos entre dos casos de la misma regla y empresa


def nombre_salida(sid):
    g, p, d = SALIDAS[sid]
    return "vender al +%d %%, al −%d %% o a los %d días" % (g * 100, p * 100, d)


# ---------------------------------------------------------------- reglas de compra
# (id, nombre, función que recibe los indicadores y dice si se cumple)
def _r(v, k):
    return v.get(k) is not None


REGLAS = []
def _regla(rid, nombre, f):
    REGLAS.append((rid, nombre, f))

for _v in (3, 5, 8):
    _regla("caida_dia_%d" % _v, "Cae más de un %d %% en el día" % _v, lambda i, v=_v: i["dp"] <= -v / 100)
for _v in (3, 5):
    _regla("subida_dia_%d" % _v, "Sube más de un %d %% en el día" % _v, lambda i, v=_v: i["dp"] >= v / 100)
for _v in (6, 10, 15):
    _regla("rebote_5d_%d" % _v, "Ha caído más de un %d %% en 5 días" % _v, lambda i, v=_v: _r(i, "r5") and i["r5"] <= -v / 100)
for _v in (5, 10):
    _regla("tendencia_20d_%d" % _v, "Sube más de un %d %% en 20 días y está sobre su media" % _v,
           lambda i, v=_v: _r(i, "r20") and i["r20"] >= v / 100 and i["p"] > i["sma20"])
_regla("maximo_20d", "Marca su precio más alto de 20 días", lambda i: _r(i, "max20") and i["p"] >= i["max20"])
_regla("minimo_20d", "Marca su precio más bajo de 20 días", lambda i: _r(i, "min20") and i["p"] <= i["min20"])
_regla("maximo_52s", "Marca su precio más alto del último año", lambda i: _r(i, "max252") and i["p"] >= i["max252"])
for _v in (20, 40):
    _regla("lejos_maximo_%d" % _v, "Está más de un %d %% por debajo de su máximo del año" % _v,
           lambda i, v=_v: _r(i, "max252") and i["p"] <= i["max252"] * (1 - v / 100))
for _v in (30, 20):
    _regla("rsi_bajo_%d" % _v, "RSI por debajo de %d (muy castigada)" % _v, lambda i, v=_v: _r(i, "rsi") and i["rsi"] < v)
for _v in (70, 80):
    _regla("rsi_alto_%d" % _v, "RSI por encima de %d (muy subida)" % _v, lambda i, v=_v: _r(i, "rsi") and i["rsi"] > v)
_regla("cruce_media50_arriba", "Cruza hacia arriba su media de 50 días",
       lambda i: _r(i, "sma50") and i["prev"] < i["sma50"] < i["p"])
_regla("cruce_media50_abajo", "Cruza hacia abajo su media de 50 días",
       lambda i: _r(i, "sma50") and i["prev"] > i["sma50"] > i["p"])
_regla("cruce_media200_arriba", "Cruza hacia arriba su media de 200 días",
       lambda i: _r(i, "sma200") and i["prev"] < i["sma200"] < i["p"])

NOMBRES = {rid: n for rid, n, _ in REGLAS}
REGIMENES = ("alcista", "bajista")


def senales(ind):
    """Reglas que se cumplen con estos indicadores."""
    if ind is None:
        return []
    return [rid for rid, _, f in REGLAS if f(ind)]


# ---------------------------------------------------------------- indicadores
def indicadores(hist, p):
    """hist: cierres anteriores (sin hoy), del más antiguo al más reciente. p: precio de hoy."""
    n = len(hist)
    if n < 1 or not p:
        return None
    i = {"p": p, "prev": hist[-1], "dp": p / hist[-1] - 1}
    if n >= 5:
        i["r5"] = p / hist[-5] - 1
    if n >= 20:
        u = hist[-20:]
        i["r20"] = p / hist[-20] - 1
        i["sma20"] = sum(u) / 20
        i["max20"] = max(u)
        i["min20"] = min(u)
    if n >= 50:
        i["sma50"] = sum(hist[-50:]) / 50
    if n >= 200:
        i["sma200"] = sum(hist[-200:]) / 200
    if n >= 252:
        i["max252"] = max(hist[-252:])
    if n >= 14:
        precios = hist[-14:] + [p]
        sube = baja = 0.0
        for a, b in zip(precios, precios[1:]):
            d = b - a
            if d > 0:
                sube += d
            else:
                baja -= d
        i["rsi"] = 100.0 if baja == 0 else 100 - 100 / (1 + sube / baja)
    return i


def regimen(hist_spy, p_spy):
    if len(hist_spy) < 200 or not p_spy:
        return "alcista"
    return "alcista" if p_spy > sum(hist_spy[-200:]) / 200 else "bajista"


# ---------------------------------------------------------------- salidas
def ventaja(p0, camino, spy0, camino_spy, sid, coste):
    """Lo que habría ganado esta forma de vender MENOS lo que habría hecho el S&P 500 esos días.
    Devuelve (ventaja, días) o None si aún no se sabe."""
    r = salir(p0, camino, sid)
    if r is None or len(camino_spy) < r[1]:
        return None
    return r[0] - coste - (camino_spy[r[1] - 1] / spy0 - 1), r[1]


def salir(p0, camino, sid):
    """camino: cierres de los días siguientes. Devuelve (rendimiento, días) o None si aún no se sabe."""
    g, pe, d = SALIDAS[sid]
    for k, c in enumerate(camino[:d], 1):
        r = c / p0 - 1
        if r >= g or r <= -pe or k == d:
            return r, k
    return None


# ---------------------------------------------------------------- lo aprendido
def clave(regla, reg, sid):
    return "%s|%s|%s" % (regla, reg, sid)


def anotar(est, regla, reg, sid, rend):
    e = est.setdefault(clave(regla, reg, sid), [0.0, 0.0, 0.0])
    e[0] += 1
    e[1] += rend
    e[2] += 1 if rend > 0 else 0


def olvidar(est, veces=1):
    f = OLVIDO ** veces
    for e in est.values():
        e[0] *= f
        e[1] *= f
        e[2] *= f


def puntuacion(e):
    return e[1] / (e[0] + FRENO)


def _junta(est, regla, sid):
    a = est.get(clave(regla, "alcista", sid), [0, 0, 0])
    b = est.get(clave(regla, "bajista", sid), [0, 0, 0])
    return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]


def mejor_salida(est, regla, reg):
    """La forma de vender con mejor puntuación para esta regla en este tipo de mercado.
    Si en este tipo de mercado aún no hay casos suficientes, usa los dos juntos.
    Devuelve (puntuacion, sid, stats, de_que_mercado) o None si no hay casos suficientes."""
    mejor = None
    for sid in SALIDAS:
        e = est.get(clave(regla, reg, sid))
        if e and e[0] >= CASOS_MINIMOS:
            s = puntuacion(e)
            if mejor is None or s > mejor[0]:
                mejor = (s, sid, e, reg)
    if mejor:
        return mejor
    for sid in SALIDAS:
        e = _junta(est, regla, sid)
        if e[0] >= CASOS_MINIMOS:
            s = puntuacion(e)
            if mejor is None or s > mejor[0]:
                mejor = (s, sid, e, "todos")
    return mejor


def fiable(est, regla, reg):
    m = mejor_salida(est, regla, reg)
    return m if m and m[0] > 0 else None


def resumen_reglas(est):
    """Para la web: por regla y tipo de mercado, su mejor forma de vender, cuántos casos y si se fía."""
    out = {}
    for rid, nombre, _ in REGLAS:
        fila = {"nombre": nombre}
        for reg in REGIMENES:
            m = None
            for sid in SALIDAS:
                e = est.get(clave(rid, reg, sid))
                if e and e[0] > 0 and (m is None or puntuacion(e) > m[0]):
                    m = (puntuacion(e), sid, e)
            if m:
                e = m[2]
                f = fiable(est, rid, reg)
                fila[reg] = {"casos": round(e[0], 1), "media": round(e[1] / e[0], 5),
                             "acierta": round(e[2] / e[0], 3), "salida": (f[1] if f else m[1]),
                             "fiable": bool(f)}
        out[rid] = fila
    return out
