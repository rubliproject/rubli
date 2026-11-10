"""Precompute the /categories «Hallazgos» payload (four findings, glyph matrix, drill
layer) into precomputed_stats['category_hallazgos'].

Port of the reviewed concept `_explore/categorias_concepts_2026-10-28/{scan,build}.py`
(REVIEW_6: 12/12 numbers match the DB). Rules:
- CompraNet aggregates exclude ComprasMX rows merged into contracts (source_structure 'E'),
  0 < amount <= 100B MXN, category_id NOT NULL.
- ComprasMX = gap_contracts 2025–26; every numeric TEXT column is CAST.
- No RFC leaves SQL. Personas físicas are named as CompraNet publishes them and flagged
  (`persona_fisica` ids; owner 2026-10-29, transparency); RFC-like names are dropped (clean_name).

- By sector (owner 11-06 «findings by sector»): `build(conn, sector)` reads only the contracts of that BUYER
  sector (contracts.sector_id / gap_contracts.sector_id, as the Bodega's filter); written to
  `category_hallazgos:{sector}` for 1–12. BIRMEX's lifetime figures are health's (sector 1) and national only.

    python -m scripts.precompute_category_hallazgos [--db PATH] [--print] [--sector N]
"""
import argparse
import json
import sqlite3
import time
from collections import defaultdict
from datetime import datetime, timezone

from api.public_labels import clean_name, pf_sql  # an RFC-as-name never ships

STAT_KEY = "category_hallazgos"
SECTOR_IDS = range(1, 13)


def stat_key(sector=None) -> str:
    return STAT_KEY if sector is None else f"{STAT_KEY}:{int(sector)}"


def _sec(sector, col="sector_id") -> str:
    """SQL guard for one buyer sector; the id is validated as an int 1-12, never user text."""
    if sector is None:
        return ""
    s = int(sector)
    if s not in SECTOR_IDS:
        raise ValueError(f"sector {sector!r} not in 1-12")
    return f" AND {col} = {s}"
MAX_CONTRACT_VALUE = 100_000_000_000  # reject above (data-validation rule)
FLAG_THRESHOLD = 10_000_000_000       # flag above
Y0, Y1 = 2010, 2025                   # matrix + share-over-time span (CompraNet horizon 2025)
MED, CURACION, EQUIPO, HOSP, LAB = 20, 22, 21, 24, 23
BIRMEX_IDS = (2066, 296)
# ComprasMX buyers are keyed by siglas; map the four that carry medicine money to CompraNet ids
MX_SIGLAS = {"BIRMEX": 2066, "IMSS": 251, "IMSS-BIENESTAR": 3780, "ISSSTE": 228}
INSABI, IMSS_B = 3744, 3780
CN_WHERE = (f"amount_mxn > 0 AND amount_mxn <= {MAX_CONTRACT_VALUE} AND category_id IS NOT NULL"
            " AND source_structure <> 'E'")
AMT = "CAST(amount_mxn_best AS REAL)"
MX_WHERE = "contract_year IN ('2025', '2026') AND category_id IS NOT NULL"


def _period(y: int) -> int:
    return 2 if y <= 2018 else 3 if y <= 2024 else 4   # 3 = 2019–24, 4 = 2025


def _scan(conn, sector=None):
    """One pass over CompraNet 2010–2025 → cat×year, cat×vendor×period(3,4), cat×inst×year(2019+)."""
    cy = defaultdict(lambda: [0, 0.0, 0.0, set(), set()])   # (cat, y) → n, m, da_m, vendors, insts
    cvp = defaultdict(lambda: [0, 0.0])                      # (cat, v, period) → n, m
    ciy = defaultdict(lambda: [0, 0.0, 0.0])                 # (cat, inst, y) → n, m, da_m
    q = (f"SELECT category_id, contract_year, vendor_id, institution_id, amount_mxn, is_direct_award"
         f" FROM contracts WHERE {CN_WHERE}{_sec(sector)} AND contract_year BETWEEN ? AND ?")
    for cat, y, v, i, m, da in conn.execute(q, (Y0, Y1)):
        a = cy[(cat, y)]
        a[0] += 1; a[1] += m
        if da: a[2] += m
        a[3].add(v); a[4].add(i)
        if y >= 2019:
            b = cvp[(cat, v, _period(y))]; b[0] += 1; b[1] += m
            d = ciy[(cat, i, y)]; d[0] += 1; d[1] += m
            if da: d[2] += m
    return cy, cvp, ciy


def _names(conn, ids):
    """vendor id → display name (raw case; the frontend formats; RFC-like names → None),
    and the set of those ids that are personas físicas (flagged, never hidden)."""
    ids = sorted({i for i in ids if i is not None})
    names, pf = {}, set()
    for k in range(0, len(ids), 900):
        chunk = ids[k:k + 900]
        sql = (f"SELECT id, name, {pf_sql()}"
               f" FROM vendors WHERE id IN ({','.join('?' * len(chunk))})")
        for i, name, is_pf in conn.execute(sql, chunk):
            names[i] = clean_name(name)
            if is_pf:
                pf.add(i)
    return names, pf


def build(conn, sector=None) -> dict:
    t0 = time.time()
    k = 1.0 if sector is None else 0.1             # money floors scale to one sector (national values unchanged)
    S, health = _sec(sector), sector in (None, 1)   # BIRMEX & co. are health buyers: their lifetime story is health's
    mxw = MX_WHERE + S
    cats = {r[0]: (r[1], r[2]) for r in conn.execute("SELECT id, name_es, name_en FROM categories")}
    n_active = conn.execute("SELECT COUNT(*) FROM category_stats").fetchone()[0]
    cy, cvp, ciy = _scan(conn, sector)

    M = defaultdict(dict)
    for (cat, y), a in cy.items():
        M[cat][y] = dict(n=a[0], m=a[1], dam=a[2], nv=len(a[3]), ni=len(a[4]))

    def agg(cat, ys):
        r = dict(n=0, m=0.0, dam=0.0)
        for y in ys:
            d = M[cat].get(y)
            if d:
                for k in r: r[k] += d[k]
        return r

    # federal money by year, with and without medicine (fed_da / fed_da_ex20 are derived client-side)
    fed = {}
    for y in range(Y0, Y1 + 1):
        m = sum(M[c][y]["m"] for c in M if y in M[c]); dam = sum(M[c][y]["dam"] for c in M if y in M[c])
        med = M[MED].get(y, dict(m=0.0, dam=0.0))
        fed[y] = dict(m=m, dam=dam, m20=med["m"], dam20=med["dam"])

    # ── ComprasMX (gap_contracts 2025–26) ──
    GY = {int(c): dict(n=n, m=m or 0.0, dam=dam or 0.0) for c, n, m, dam in conn.execute(
        f"SELECT category_id, COUNT(*), SUM({AMT}), SUM(CASE WHEN is_direct_award = '1' THEN {AMT} END)"
        f" FROM gap_contracts WHERE {mxw} GROUP BY 1")}
    mx = lambda c: GY.get(c, dict(n=0, m=0.0, dam=0.0))
    mx20 = {s or "": dict(n=n, m=m or 0.0, dam=dam or 0.0) for s, n, m, dam in conn.execute(
        f"SELECT institution_siglas, COUNT(*), SUM({AMT}), SUM(CASE WHEN is_direct_award = '1' THEN {AMT} END)"
        f" FROM gap_contracts WHERE {mxw} AND category_id = ? GROUP BY 1", (MED,))}
    zero = dict(n=0, m=0.0, dam=0.0)

    # ── F1: medicine stopped being tendered ──
    z = dict(n=0, m=0.0, dam=0.0, nv=0, ni=0)   # a sector that never bought the category: zero years, not a KeyError
    f1_years = [dict(y=y, n=d["n"], m=d["m"], da=d["dam"] / d["m"] if d["m"] else 0.0, nv=d["nv"], ni=d["ni"])
                for y in range(Y0, Y1 + 1) for d in [M[MED].get(y, z)]]

    def shift(cat):
        a, b = agg(cat, range(2013, 2019)), agg(cat, range(2023, 2026))
        return dict(cat=cat, before=a["dam"] / a["m"] if a["m"] else 0.0, after=b["dam"] / b["m"] if b["m"] else 0.0, m=b["m"])

    movers = sorted((shift(c) for c in M if agg(c, range(2013, 2019))["m"] >= 5e9 * k and agg(c, range(2023, 2026))["m"] >= 5e9 * k),
                    key=lambda r: -(r["after"] - r["before"]))
    m20 = mx(MED)
    f1 = dict(mx_n=m20["n"], mx_m=m20["m"], mx_da=m20["dam"] / m20["m"] if m20["m"] else 0.0,
              shifts={str(c): shift(c) for c in (MED, CURACION, EQUIPO, HOSP)}, down=movers[-2:][::-1])

    # ── F2: who buys the medicines ──
    BY = defaultdict(lambda: defaultdict(float)); BT = defaultdict(float)
    for (cat, i, y), d in ciy.items():
        if cat == MED: BY[i][y] += d[1]; BT[i] += d[1]
    top5 = sorted(BT, key=lambda i: -BT[i])[:5]
    series = [dict(id=i, vals=[BY[i].get(y, 0.0) for y in range(2019, 2026)],
                   mx=sum(g["m"] for s, g in mx20.items() if MX_SIGLAS.get(s) == i)) for i in top5]
    series.append(dict(id=0, vals=[sum(BY[i].get(y, 0.0) for i in BY if i not in top5) for y in range(2019, 2026)],
                       mx=sum(g["m"] for s, g in mx20.items() if MX_SIGLAS.get(s) not in top5)))
    bir = mx20.get("BIRMEX", zero)
    life_n, life_m = (conn.execute(
        f"SELECT COUNT(*), SUM(amount_mxn) FROM contracts WHERE institution_id IN (?, ?)"
        f" AND amount_mxn > 0 AND amount_mxn <= {MAX_CONTRACT_VALUE} AND contract_year <= 2025 AND source_structure <> 'E'",
        BIRMEX_IDS).fetchone() if health else (0, 0.0))
    life_y0 = conn.execute(
        f"SELECT MIN(contract_year) FROM contracts WHERE institution_id IN (?, ?) AND amount_mxn > 0"
        f" AND source_structure <> 'E'", BIRMEX_IDS).fetchone()[0]
    all_n, all_m = (conn.execute(
        f"SELECT COUNT(*), SUM({AMT}) FROM gap_contracts WHERE institution_siglas = 'BIRMEX' AND contract_year IN ('2025', '2026')").fetchone()
        if health else (0, 0.0))
    flagged = conn.execute(
        f"SELECT g.legacy_vendor_id, COALESCE(v.name, g.vendor), g.vendor_rfc_persona_fisica, COALESCE(v.is_individual, 0),"
        f" g.title, {AMT}, g.is_direct_award FROM gap_contracts g LEFT JOIN vendors v ON v.id = g.legacy_vendor_id"
        f" WHERE g.institution_siglas = 'BIRMEX' AND g.contract_year IN ('2025', '2026') AND {AMT} > ? ORDER BY 6 DESC",
        (FLAG_THRESHOLD,)).fetchall() if health else []
    big = [dict(vid=vid, name=clean_name(name) if name else None, pf=pf == "1" or bool(ind), title=title, m=m, da=da == "1")
           for vid, name, pf, ind, title, m, da in flagged]
    f2 = dict(series=series, mx_total=sum(g["m"] for g in mx20.values()),
              bir_mx_m=bir["m"], bir_mx_n=bir["n"], bir_mx_da=bir["dam"] / bir["m"] if bir["m"] else 0.0,
              imss_mx_m=mx20.get("IMSS", zero)["m"], bir_life_m=life_m or 0.0, bir_life_n=life_n, bir_life_y0=life_y0,
              bir_all_mx_m=all_m or 0.0, bir_all_mx_n=all_n, bir_flag_n=len(big), bir_flag_m=sum(b["m"] for b in big), big=big,
              imss2025=BY[251].get(2025, 0.0), imssb2025=BY[IMSS_B].get(2025, 0.0),
              insabi_last=max((y for y in BY[INSABI] if BY[INSABI][y] > 0), default=None),
              imssb_first=min((y for y in BY[IMSS_B] if BY[IMSS_B][y] > 0), default=None))

    # ── F3: one supplier keeps the category ──
    P = defaultdict(lambda: defaultdict(float)); PT = defaultdict(float); PN = {}
    for (cat, v, p), (n, m) in cvp.items():
        P[(cat, p)][v] += m; PT[(cat, p)] += m; PN[(cat, v, p)] = n

    def topv(cat, p):
        vs = P[(cat, p)]
        if not vs: return None
        v, m = max(vs.items(), key=lambda kv: kv[1])
        return dict(v=v, share=m / PT[(cat, p)])

    slope = []
    for (cat, p) in list(P):
        if p != 4 or PT[(cat, 4)] < 2e9 * k: continue
        t4, t3 = topv(cat, 4), topv(cat, 3)
        slope.append(dict(cat=cat, m=PT[(cat, 4)], v=t4["v"], n25=PN.get((cat, t4["v"], 4), 0), share=t4["share"],
                          share_before=P[(cat, 3)].get(t4["v"], 0) / PT[(cat, 3)] if PT[(cat, 3)] else 0.0,
                          top_before=t3["v"] if t3 else None, top_before_share=t3["share"] if t3 else 0.0))
    slope.sort(key=lambda r: -r["share"])
    owners = [r for r in slope if r["share"] >= .4]
    pick = {r["cat"] for r in owners} | {34, 57, 45}
    sh = lambda cat, v, p: P[(cat, p)].get(v, 0) / PT[(cat, p)] if PT[(cat, p)] else 0.0
    mx57 = dict(total=mx(57)["m"], **{k: conn.execute(
        f"SELECT COALESCE(SUM({AMT}), 0) FROM gap_contracts WHERE {mxw} AND category_id = 57 AND UPPER(vendor) LIKE ?",
        (f"%{k.upper()}%",)).fetchone()[0] for k in ("broxel", "toka")})
    f3 = dict(rows=[r for r in slope if r["cat"] in pick], n_all=len(slope), owner_cats=[r["cat"] for r in owners],
              before40=[r["cat"] for r in slope if r["top_before_share"] >= .4], mx57=mx57,
              toka25=sh(57, 102627, 4), toka_before=sh(57, 102627, 3))

    # ── F4: same category, another rule ──
    B = defaultdict(lambda: defaultdict(lambda: [0, 0.0, 0.0]))
    for (cat, i, y), d in ciy.items():
        if cat in (LAB, HOSP, MED, CURACION):
            b = B[cat][i]; b[0] += d[0]; b[1] += d[1]; b[2] += d[2]
    f4 = [dict(cat=c, rows=sorted((dict(id=i, n=b[0], m=b[1], da=b[2] / b[1]) for i, b in B[c].items() if b[1] >= 3e9 * k),
                                 key=lambda r: -r["m"])) for c in (LAB, HOSP, MED, CURACION)]

    # ── the glyph matrix: top 12 of 2023–25 + four that changed procedure or owner ──
    m2325 = {c: agg(c, range(2023, 2026))["m"] for c in M}
    top12 = sorted(m2325, key=lambda k: -m2325[k])[:12]
    matrix = []
    for cat in top12 + [c for c in (CURACION, 52, 70, 47) if c not in top12][:4]:
        t4 = topv(cat, 4); g = mx(cat)
        matrix.append(dict(cat=cat, m2325=m2325[cat], extra=cat not in top12,
                           cells=[[M[cat].get(y, {}).get("m", 0.0), (M[cat][y]["dam"] / M[cat][y]["m"]) if M[cat].get(y, {}).get("m") else None]
                                  for y in range(Y0, Y1 + 1)],
                           mx=[g["m"], g["dam"] / g["m"] if g["m"] else None],
                           top=dict(v=t4["v"], share=t4["share"]) if t4 else None))

    # ── drill: the six largest medicine contracts of 2024 ──
    drill = [dict(id=i, d=d, t=t, vid=v, iid=inst, m=m, da=bool(da), r=r) for i, d, t, v, inst, m, da, r in conn.execute(
        f"SELECT id, contract_date, title, vendor_id, institution_id, amount_mxn, is_direct_award, risk_score FROM contracts"
        f" WHERE {CN_WHERE}{S} AND category_id = ? AND contract_year = 2024 ORDER BY amount_mxn DESC LIMIT 6", (MED,))]

    # names only for the rows that ship (the slope's unshipped rows never reach the payload)
    shipped = f3["rows"] + [r for r in slope if r["cat"] in f3["before40"]]
    vids = [r["v"] for r in shipped] + [r["top_before"] for r in shipped] + [r["top"]["v"] for r in matrix if r["top"]] + [r["vid"] for r in drill]
    iids = [s["id"] for s in series] + [r["id"] for s in f4 for r in s["rows"]] + [r["iid"] for r in drill] + [251, 228, 2066, 3780]
    iids = [i for i in iids if i is not None]   # a sector series can carry the «others» id 0 or a null buyer
    vendors, pf_ids = _names(conn, vids)
    insts = {i: dict(name=n, siglas=s) for i, n, s in conn.execute(
        f"SELECT id, name, siglas FROM institutions WHERE id IN ({','.join('?' * len(set(iids)))})", sorted(set(iids)))}
    used = {r["cat"] for r in matrix} | {r["cat"] for r in slope} | {s["cat"] for s in f4} | {r["cat"] for r in movers}
    mx_asof = conn.execute("SELECT MAX(substr(publication_date, 1, 10)) FROM gap_contracts").fetchone()[0]

    return dict(
        version=1, sector=sector, computed_at=datetime.now(timezone.utc).isoformat(timespec="seconds"), mx_asof=mx_asof,
        n_categories=n_active, y0=Y0, y1=Y1,
        cats={c: dict(es=cats[c][0], en=cats[c][1]) for c in sorted(used) if c in cats},
        vendors=vendors, persona_fisica=sorted(pf_ids), institutions=insts, fed={y: fed[y] for y in fed},
        f1=f1, f1_years=f1_years, f2=f2, f3=f3, f4=f4, matrix=matrix, drill=drill,
        _seconds=round(time.time() - t0, 1),
    )


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=None)
    ap.add_argument("--print", action="store_true", help="print the payload, write nothing")
    ap.add_argument("--sector", type=int, default=None, help="one buyer sector (1-12); default: national + all 12")
    a = ap.parse_args()
    if a.db is None:
        from api.dependencies import DB_PATH
        a.db = str(DB_PATH)
    conn = sqlite3.connect(f"file:{a.db}?mode=ro" if a.print else a.db, uri=a.print, timeout=120)
    if a.print:
        print(json.dumps(build(conn, a.sector), ensure_ascii=False)); return
    for sector in ([a.sector] if a.sector is not None else [None, *SECTOR_IDS]):
        payload = build(conn, sector)
        conn.execute("BEGIN IMMEDIATE")
        conn.execute("INSERT OR REPLACE INTO precomputed_stats (stat_key, stat_value, updated_at) VALUES (?, ?, ?)",
                     (stat_key(sector), json.dumps(payload, ensure_ascii=False), payload["computed_at"]))
        conn.commit()
        print(f"{stat_key(sector)}: {len(json.dumps(payload))} bytes in {payload['_seconds']} s")


if __name__ == "__main__":
    main()
