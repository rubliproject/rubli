"""Precompute the «Predicción» tab payload into precomputed_stats['predictions'].

Two habits, back-tested in docs/PREDICTIONS_RESEARCH_2026-11-06.md (never risk, ARIA or «corrupción»):
1. Institution — next year's direct-award share by count = ½ last year + ½ its 3-year mean («si sigue como
   hasta ahora»), printed with a constant ±10-point band (memo § back-test 1: 3 in 4 land inside). Only
   institutions with ≥ MIN_N contracts in each of the 3 years. The script re-runs the same method on 2024
   (trained on 2021–23) and stores that score for the caveat line.
2. Pair (vendor × buyer) — base rate of signing again the next year, by pair class: «first» (signed in t,
   not in t−1) vs «repeat» (signed in t−1 and t), measured 2023→2024 (the last two full years). The memo's
   5-feature model (AUC 0.68) is NOT shipped: the tab prints the class base rate only. The endpoint reads
   the pair's own years live.
3. Specific lines (docs/PREDICTIONS_SPECIFIC_2026-11-07.md), companies only:
   - vendor «sigue ganando»: logistic (log n, log amount, direct share, # buyers, top-buyer share), fit on
     transitions T→T+1 for T ≤ 2022, tested on 2023→2024; the page prints the OBSERVED rate of its test decile.
     Plus «vuelve a venderle a su comprador principal» and the ≥90 %-one-buyer persistence, measured 2023→2024.
   - contract «contratos parecidos se repiten»: same for the (vendor, buyer, category) triple
     (log n, log amount, direct share, signed the year before).
   - category: direct-award share next year ±10, suppliers a year ±25 % (from the last FULL year, 2024),
     the #1-supplier churn, and the same churn per named subcategory (sub_churn).
   Only coefficients, decile edges and rates are stored; the endpoint computes a unit's features live.
CompraNet only: 0 < amount <= 100B MXN, source_structure <> 'E'; procedure flags only where coded (proc_known).
Aggregates only; no vendor id, name or RFC leaves this payload.

    python -m scripts.precompute_predictions [--db PATH] [--print]
"""
import argparse
import json
import sqlite3
import time
from collections import defaultdict
from datetime import datetime, timezone

import math

from api.config.constants import proc_known
from api.public_labels import pf_sql

STAT_KEY = "predictions"
MAX_CONTRACT_VALUE = 100_000_000_000
CN_WHERE = f"amount_mxn > 0 AND amount_mxn <= {MAX_CONTRACT_VALUE} AND source_structure <> 'E'"
LAST_YEAR = 2025          # last CompraNet year (to 28 Sep 2025)
BAND = 10                 # points; memo § back-test 1 («±10 covers 3 in 4»), kept constant on purpose
MIN_N = 30                # contracts per year, as in the memo's back-test
PAIR_T = 2023             # pair classes measured in 2023, outcome 2024


def blend(shares: list[float]) -> float:
    """shares oldest → latest (3 years): ½ last + ½ mean. The memo's best («½ last + ½ 3-yr»)."""
    return 0.5 * shares[-1] + 0.5 * sum(shares) / len(shares)


def forecast(counts: dict[int, tuple[int, int]], last: int) -> dict | None:
    """counts = {year: (n, direct)} for one institution → the forecast for last+1, or None if thin."""
    yrs = [last - 2, last - 1, last]
    if any(counts.get(y, (0, 0))[0] < MIN_N for y in yrs):
        return None
    shares = [100.0 * counts[y][1] / counts[y][0] for y in yrs]
    p = blend(shares)
    return {"point": round(p, 1), "low": round(max(0.0, p - BAND), 1), "high": round(min(100.0, p + BAND), 1),
            "last_share": round(shares[-1], 1), "n_last": counts[last][0]}


def backtest(by_inst: dict[int, dict[int, tuple[int, int]]], test_year: int) -> dict:
    """Same method, trained on test_year−3..−1, scored on test_year (≥ MIN_N in all 4 years)."""
    errs = []
    for c in by_inst.values():
        f = forecast(c, test_year - 1)
        if f is None or c.get(test_year, (0, 0))[0] < MIN_N:
            continue
        errs.append(abs(100.0 * c[test_year][1] / c[test_year][0] - f["point"]))
    n = len(errs)
    return {"year": test_year, "n": n, "mae": round(sum(errs) / n, 1) if n else None,
            "within_band": round(sum(e <= BAND for e in errs) / n, 3) if n else None}


def streak(years: set[int], last: int) -> int:
    """Consecutive signing years ending at `last` (0 if the pair did not sign in `last`)."""
    k = 0
    while (last - k) in years:
        k += 1
    return k


def pair_rates(pair_years: dict[tuple[int, int], set[int]], t: int) -> dict:
    """Of pairs that signed in t: share that signed again in t+1, for «first» (streak 1) vs «repeat» (≥2)."""
    tot = {"first": [0, 0], "repeat": [0, 0]}
    for ys in pair_years.values():
        s = streak(ys, t)
        if s == 0:
            continue
        c = tot["first" if s == 1 else "repeat"]
        c[0] += 1
        c[1] += (t + 1) in ys
    out = {k: {"n": n, "rate": round(a / n, 3) if n else None} for k, (n, a) in tot.items()}
    n_all = tot["first"][0] + tot["repeat"][0]
    out["all"] = {"n": n_all, "rate": round((tot["first"][1] + tot["repeat"][1]) / n_all, 3) if n_all else None}
    out["test"] = f"{t}→{t + 1}"
    return out


FIT_T = range(2016, 2023)   # training transitions T→T+1
TEST_T = 2023                # held-out 2023→2024


def sub_churn(conn: sqlite3.Connection, t: int = TEST_T) -> dict:
    """#1 supplier by money in subcategory-year t is still #1 in t+1. GREEN's rule: named subcategories only
    (no catch-all), ≥ 20 contracts and ≥ 3 suppliers in both years."""
    agg: dict = defaultdict(lambda: defaultdict(lambda: defaultdict(float)))   # sub → year → vendor → money
    cnt: dict = defaultdict(lambda: defaultdict(int))
    for sc, y, v, n, amt in conn.execute(
            f"SELECT cs.subcategory_id, c.contract_year, c.vendor_id, COUNT(*), SUM(c.amount_mxn) FROM contracts c "
            "JOIN contract_subcategory cs ON cs.contract_id = c.id "
            "JOIN subcategory_definitions sd ON sd.id = cs.subcategory_id AND COALESCE(sd.is_catch_all, 0) = 0 "
            f"WHERE {CN_WHERE.replace('amount_mxn', 'c.amount_mxn').replace('source_structure', 'c.source_structure')} "
            "AND c.vendor_id IS NOT NULL AND c.contract_year IN (?, ?) GROUP BY 1, 2, 3", (t, t + 1)):
        agg[sc][y][v] += amt or 0.0
        cnt[sc][y] += n
    stays = [max(ys[t], key=ys[t].get) == max(ys[t + 1], key=ys[t + 1].get)
             for sc, ys in agg.items()
             if all(cnt[sc][y] >= 20 and len(ys[y]) >= 3 for y in (t, t + 1))]
    return {"stay": round(sum(stays) / len(stays), 3) if stays else None, "n": len(stays), "test": f"{t}→{t + 1}"}


def vendor_features(by_buyer: dict) -> list[float] | None:
    """by_buyer = {institution_id: (n, amount, direct, coded)} for one company-year → features, or None if < 3 contracts."""
    n = sum(r[0] for r in by_buyer.values())
    if n < 3:
        return None
    amt = sum(r[1] for r in by_buyer.values())
    dn = sum(r[3] for r in by_buyer.values())
    top = max(r[1] for r in by_buyer.values())
    return [math.log1p(n), math.log1p(amt), (sum(r[2] for r in by_buyer.values()) / dn) if dn else 0.0,
            float(len(by_buyer)), top / amt if amt > 0 else 1.0]


def triple_features(cur: tuple, signed_before: bool) -> list[float]:
    n, amt, da, dn = cur
    return [math.log1p(n), math.log1p(amt), da / dn if dn else 0.0, float(signed_before)]


def fit_deciles(X_fit, y_fit, X_test, y_test) -> dict:
    """Logistic fit on train; deciles of the TEST predictions with their observed rates (what the page prints)."""
    import numpy as np
    from sklearn.linear_model import LogisticRegression
    from sklearn.metrics import roc_auc_score
    Xf, Xt = np.asarray(X_fit, float), np.asarray(X_test, float)
    mu, sd = Xf.mean(0), Xf.std(0) + 1e-9
    m = LogisticRegression(max_iter=1000).fit((Xf - mu) / sd, y_fit)
    pt = m.predict_proba((Xt - mu) / sd)[:, 1]
    edges = np.quantile(pt, np.linspace(0.1, 0.9, 9))
    dec = np.searchsorted(edges, pt, side="right")
    yt = np.asarray(y_test)
    return {"mu": mu.round(6).tolist(), "sd": sd.round(6).tolist(), "coef": m.coef_[0].round(6).tolist(),
            "intercept": round(float(m.intercept_[0]), 6), "edges": edges.round(6).tolist(),
            "rates": [round(float(yt[dec == d].mean()), 3) for d in range(10)],
            "n_test": int(len(yt)), "base": round(float(yt.mean()), 3), "auc": round(float(roc_auc_score(yt, pt)), 3),
            "test": f"{TEST_T}→{TEST_T + 1}"}


def decile_rate(model: dict, x: list[float]) -> tuple[int, float]:
    """Apply the stored model to one unit's features → (decile 0–9, observed test rate of that decile)."""
    z = model["intercept"] + sum(c * (v - m) / s for c, v, m, s in zip(model["coef"], x, model["mu"], model["sd"]))
    p = 1 / (1 + math.exp(-z))
    d = sum(p >= e for e in model["edges"])
    return d, model["rates"][d]


def build_specific(conn: sqlite3.Connection) -> dict:
    trip: dict = defaultdict(dict)
    vend: dict = defaultdict(lambda: defaultdict(dict))
    for v, i, k, y, n, amt, da, dn in conn.execute(
            f"SELECT vendor_id, institution_id, category_id, contract_year, COUNT(*), SUM(amount_mxn), "
            f"SUM({proc_known('is_direct_award')}), COUNT({proc_known('is_direct_award')}) FROM contracts "
            f"WHERE {CN_WHERE} AND institution_id IS NOT NULL AND contract_year BETWEEN 2015 AND ? "
            f"AND vendor_id IN (SELECT id FROM vendors WHERE NOT {pf_sql()}) GROUP BY 1, 2, 3, 4", (LAST_YEAR,)):
        row = (n, amt or 0.0, da or 0, dn or 0)
        if k is not None:
            trip[(v, i, k)][y] = row
        o = vend[v][y].get(i, (0, 0.0, 0, 0))
        vend[v][y][i] = tuple(a + b for a, b in zip(o, row))

    # vendor: wins any contract next year
    Xf, yf, Xt, yt = [], [], [], []
    stay_buyer, dep = [0, 0], [0, 0]
    for years in vend.values():
        for t in [*FIT_T, TEST_T]:
            if t not in years or (x := vendor_features(years[t])) is None:
                continue
            nxt = (t + 1) in years
            (Xt if t == TEST_T else Xf).append(x)
            (yt if t == TEST_T else yf).append(int(nxt))
            if t == TEST_T and nxt:
                buy = years[t]
                top_i = max(buy, key=lambda i: buy[i][1])
                stay_buyer[0] += 1
                stay_buyer[1] += top_i in years[t + 1]
                if x[4] >= 0.9:
                    nb = years[t + 1]
                    tot = sum(r[1] for r in nb.values())
                    dep[0] += 1
                    dep[1] += bool(tot > 0 and max(r[1] for r in nb.values()) / tot >= 0.9)
    vendor = fit_deciles(Xf, yf, Xt, yt)
    vendor["main_buyer_stays"] = {"rate": round(stay_buyer[1] / stay_buyer[0], 3), "n": stay_buyer[0]}
    vendor["dep90_stays"] = {"rate": round(dep[1] / dep[0], 3) if dep[0] else None, "n": dep[0]}

    # contract: the (vendor, buyer, category) triple signs again next year
    Xf, yf, Xt, yt = [], [], [], []
    for years in trip.values():
        for t in [*FIT_T, TEST_T]:
            if t in years:
                (Xt if t == TEST_T else Xf).append(triple_features(years[t], (t - 1) in years))
                (yt if t == TEST_T else yf).append(int((t + 1) in years))
    contract = fit_deciles(Xf, yf, Xt, yt)

    # category: direct-award share (last year) ±BAND, suppliers a year (last full year) ±25 %, #1 churn
    cy: dict = defaultdict(dict)
    for k, y, dn, da, nv in conn.execute(
            f"SELECT category_id, contract_year, COUNT({proc_known('is_direct_award')}), SUM({proc_known('is_direct_award')}), "
            f"COUNT(DISTINCT vendor_id) FROM contracts WHERE {CN_WHERE} AND category_id IS NOT NULL "
            "AND contract_year BETWEEN ? AND ? GROUP BY 1, 2", (TEST_T, LAST_YEAR)):
        cy[k][y] = [dn or 0, da or 0, nv]
    top: dict = {}
    for k, y, v, amt in conn.execute(
            f"SELECT category_id, contract_year, vendor_id, SUM(amount_mxn) FROM contracts WHERE {CN_WHERE} "
            "AND category_id IS NOT NULL AND vendor_id IS NOT NULL AND contract_year IN (?, ?) GROUP BY 1, 2, 3",
            (TEST_T, TEST_T + 1)):
        if (k, y) not in top or amt > top[(k, y)][1]:
            top[(k, y)] = (v, amt)
    share_hits, sup_hits, churn = [], [], []
    for k, ys in cy.items():
        a, b = ys.get(TEST_T), ys.get(TEST_T + 1)
        if a and b and a[0] >= 20 and b[0] >= 20:
            share_hits.append(abs(100 * a[1] / a[0] - 100 * b[1] / b[0]) <= BAND)
        if a and b and a[2] >= 3:
            sup_hits.append(abs(b[2] - a[2]) <= 0.25 * a[2])
        if (k, TEST_T) in top and (k, TEST_T + 1) in top:
            churn.append(top[(k, TEST_T)][0] == top[(k, TEST_T + 1)][0])
    cats = {}
    for k, ys in cy.items():
        last, full = ys.get(LAST_YEAR), ys.get(LAST_YEAR - 1)
        if last and last[0] >= 20 and full and full[2] >= 3:
            cats[str(k)] = {"share": round(100 * last[1] / last[0], 1), "suppliers": full[2]}
    category = {
        "units": cats,
        "share_within_band": round(sum(share_hits) / len(share_hits), 3), "share_n": len(share_hits),
        "suppliers_within_25": round(sum(sup_hits) / len(sup_hits), 3), "suppliers_n": len(sup_hits),
        "suppliers_year": LAST_YEAR - 1,
        "top_stays": round(sum(churn) / len(churn), 3), "top_n": len(churn), "test": f"{TEST_T}→{TEST_T + 1}",
        "sub_top_stays": sub_churn(conn),
    }
    return {"vendor": vendor, "contract": contract, "category": category}


def build(conn: sqlite3.Connection) -> dict:
    t0 = time.time()
    by_inst: dict[int, dict[int, tuple[int, int]]] = defaultdict(dict)
    for iid, y, n, da in conn.execute(
            f"SELECT institution_id, contract_year, COUNT({proc_known('is_direct_award')}), "
            f"SUM({proc_known('is_direct_award')}) FROM contracts "
            f"WHERE {CN_WHERE} AND institution_id IS NOT NULL AND contract_year BETWEEN ? AND ? GROUP BY 1, 2",
            (LAST_YEAR - 4, LAST_YEAR)):
        by_inst[iid][y] = (n or 0, da or 0)
    inst = {str(i): f for i, c in by_inst.items() if (f := forecast(c, LAST_YEAR))}

    pair_years: dict[tuple[int, int], set[int]] = defaultdict(set)
    for v, i, y in conn.execute(
            f"SELECT DISTINCT vendor_id, institution_id, contract_year FROM contracts WHERE {CN_WHERE} "
            "AND vendor_id IS NOT NULL AND institution_id IS NOT NULL AND contract_year BETWEEN ? AND ?",
            (PAIR_T - 1, PAIR_T + 1)):
        pair_years[(v, i)].add(y)

    return {
        "computed_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "last_year": LAST_YEAR, "target_year": LAST_YEAR + 1, "band": BAND, "min_n": MIN_N,
        "data_through": "2025-09-28",
        "institution_backtest": backtest(by_inst, LAST_YEAR - 1),
        "institutions": inst,
        "pair_rates": pair_rates(pair_years, PAIR_T),
        **build_specific(conn),
        "_seconds": round(time.time() - t0, 1),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=None)
    ap.add_argument("--print", action="store_true", help="print the payload summary, write nothing")
    a = ap.parse_args()
    if a.db is None:
        from api.dependencies import DB_PATH
        a.db = str(DB_PATH)
    conn = sqlite3.connect(f"file:{a.db}?mode=ro" if a.print else a.db, uri=a.print, timeout=120)
    payload = build(conn)
    if a.print:
        slim = {k: v for k, v in payload.items() if k != "institutions"}
        slim["category"] = {k: v for k, v in slim["category"].items() if k != "units"}
        print(json.dumps(slim, ensure_ascii=False))
        print(f"institutions with a forecast: {len(payload['institutions'])}")
        return
    conn.execute("BEGIN IMMEDIATE")
    conn.execute("INSERT OR REPLACE INTO precomputed_stats (stat_key, stat_value, updated_at) VALUES (?, ?, ?)",
                 (STAT_KEY, json.dumps(payload, ensure_ascii=False), payload["computed_at"]))
    conn.commit()
    print(f"{STAT_KEY}: {len(payload['institutions'])} institutions, pairs {payload['pair_rates']}, "
          f"backtest {payload['institution_backtest']}, {payload['_seconds']} s")


if __name__ == "__main__":
    main()
