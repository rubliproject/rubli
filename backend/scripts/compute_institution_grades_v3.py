#!/usr/bin/env python3
"""
Institution grades v3.0 -- offline compute (spec: .claude/designus/
institutions-uipro-2026-10-07/proposals/grading-v3.md, sections 3, 6 and 9).

Grades observable procurement behaviour on three pillars, each a risk rate in
[0, 1] (higher = worse), empirical-Bayes shrunk, scored half against a frozen
national benchmark and half against peers (level x family x size):

  competencia    direct award + multi-lot sweep + 1/2 restricted invitation,
                 mean of count share and value share (grading-v3 section 9:
                 single-lot single-winner procedures are NOT scored, because
                 COMPRANET lists winners, not bidders)
  proceso        mean(short ad among licitaciones, year-end share, same-day
                 same-vendor splitting share)
  concentracion  mean(supplier-value HHI, top-supplier value share), peer-only

Beside the grade (never mixed in): sanctions gate, model lens, GT / ARIA
vendor counts, trend, historical flag, Art. 41 exception share (2023+).

Writes ONLY three new tables:
  institution_grade_calibration  frozen anchors / cut points / priors (append)
  institution_grades_v3          one row per canonical institution (replaced)
  institution_grade_ledger       points ledger, 100 + sum(points) == score

Contracts are re-keyed through institution_canonical. No RFC is written.

    python -m scripts.compute_institution_grades_v3 --db D:/Python/yangwenli/backend/RUBLI_NORMALIZED.db
    ... --recalibrate   fit a new calibration row (owner approval required)
    ... --dry-run       compute and report, write nothing
"""
import argparse
import json
import logging
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("grades_v3")

DB_PATH = Path(__file__).parent.parent / "RUBLI_NORMALIZED.db"
METHOD_VERSION = "v3.0"
MAX_AMT = 100_000_000_000          # > 100B MXN = data error (CLAUDE.md)
MIN_CONTRACTS = 10
GRADED = ["competencia", "proceso", "concentracion"]
SUBS = {"competencia": ["nc_count", "nc_value"],
        "proceso": ["short", "ye", "split"],
        "concentracion": ["hhi", "top1"]}
GRADE_LETTERS = ["A", "B", "C", "D", "F"]
TIER_KEY = {"A": "Excelente", "B": "Satisfactorio", "C": "Regular",
            "D": "Deficiente", "F": "Critico"}

# Defaults for a fresh calibration (grading-v3 sections 3.5, 3.6, 9)
DEFAULT_PARAMS = {
    "w_abs": 0.5,
    "w_abs_pillar": {"concentracion": 0.0},
    "anchor_quantiles": [0.10, 0.90, 0.95],          # good, bad, red
    "sanction_anchor": [0.0, 0.01, 0.01],
    "grade_target_quantiles": [0.07, 0.25, 0.60, 0.90],
    "min_peers": 25,
    "hard_floor": 8,
    "active_since": 2022,
    "trend_years": [2018, 2025],
    "n_draws": 300,
    "seed": 7,
}

FAMILY = {
    "health_institution": "salud", "social_security": "salud",
    "educational": "educacion", "research_education": "educacion",
    "state_enterprise_energy": "empresa", "state_enterprise_infra": "empresa",
    "state_enterprise_finance": "empresa",
    "autonomous_constitutional": "autonomo", "judicial": "autonomo",
    "legislative": "autonomo", "municipal": "municipio",
}

SCHEMA = """
CREATE TABLE IF NOT EXISTS institution_grade_calibration (
    calibration_id  TEXT PRIMARY KEY,
    method_version  TEXT NOT NULL,
    params_json     TEXT NOT NULL,
    n_institutions  INTEGER,
    created_at      TEXT NOT NULL,
    approved_by     TEXT
);
CREATE TABLE IF NOT EXISTS institution_grades_v3 (
    institution_id          INTEGER PRIMARY KEY,
    calibration_id          TEXT NOT NULL,
    method_version          TEXT NOT NULL,
    window_start            INTEGER,
    window_end              INTEGER,
    n_contracts             INTEGER,
    total_value_mxn         REAL,
    score                   REAL,
    score_lo                REAL,
    score_hi                REAL,
    grade                   TEXT,
    tier_key                TEXT,
    provisional             INTEGER,
    p_grade                 REAL,
    red_flags               TEXT,
    sanction_gate           INTEGER,
    level                   TEXT,
    family                  TEXT,
    size_band               TEXT,
    peer_key                TEXT,
    peer_n                  INTEGER,
    pillar_competencia      REAL,
    pillar_proceso          REAL,
    pillar_concentracion    REAL,
    rate_competencia        REAL,
    rate_proceso            REAL,
    rate_concentracion      REAL,
    rate_sanciones          REAL,
    model_hr_value_share    REAL,
    single_winner_share     REAL,
    trend                   TEXT,
    trend_slope             REAL,
    trend_t                 REAL,
    last_year               INTEGER,
    is_historical           INTEGER,
    gt_vendor_count         INTEGER,
    aria_t1_vendor_count    INTEGER,
    sanctioned_vendor_count INTEGER,
    sanctioned_value_mxn    REAL,
    art41_da_share_2023     REAL,
    computed_at             TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS institution_grade_ledger (
    institution_id   INTEGER NOT NULL,
    calibration_id   TEXT NOT NULL,
    pillar           TEXT NOT NULL,
    item             TEXT NOT NULL,
    rate             REAL,
    national_median  REAL,
    peer_median      REAL,
    points           REAL NOT NULL,
    PRIMARY KEY (institution_id, pillar, item)
);
CREATE INDEX IF NOT EXISTS idx_grades_v3_grade ON institution_grades_v3(grade);
CREATE INDEX IF NOT EXISTS idx_grades_v3_level ON institution_grades_v3(level, family);
"""


# ---------------------------------------------------------------- loading
def _ids(conn, sql):
    try:
        return {r[0] for r in conn.execute(sql) if r[0] is not None}
    except sqlite3.OperationalError:
        return set()


def load_meta(conn):
    canon = dict(conn.execute(
        "SELECT institution_id, canonical_id FROM institution_canonical").fetchall())
    has_bl = any(r[1] == "buyer_level" for r in conn.execute("PRAGMA table_info(institution_canonical)"))
    inst = pd.read_sql(f"""
        SELECT i.id AS iid, i.institution_type AS itype,
               COALESCE(i.is_federal, 0) AS is_federal, k.level AS canon_level,
               {"k.buyer_level" if has_bl else "NULL"} AS buyer_level
        FROM institutions i LEFT JOIN institution_canonical k ON k.institution_id = i.id
    """, conn)
    flagged = _ids(conn, "SELECT vendor_id FROM aria_queue "
                         "WHERE is_efos_definitivo = 1 OR is_sfp_sanctioned = 1")
    # RFC is used only to match vendors to the SAT list; it never leaves this query.
    flagged |= _ids(conn, "SELECT v.id FROM vendors v JOIN sat_efos_vendors se "
                          "ON v.rfc = se.rfc AND se.stage = 'definitivo'")
    gt = _ids(conn, "SELECT DISTINCT vendor_id FROM ground_truth_vendors")
    t1 = _ids(conn, "SELECT vendor_id FROM aria_queue WHERE ips_tier = 1")
    return canon, inst, flagged, gt, t1


def load_contracts(conn, canon, window=None):
    """window = (start, end) ISO dates, inclusive. Rows with no contract_date
    count only when their contract_year lies wholly inside the window."""
    where, args = "", ()
    if window:
        y0 = int(window[0][:4]) + (window[0][5:] != "01-01")
        y1 = int(window[1][:4]) - (window[1][5:] != "12-31")
        where = (" AND (contract_date BETWEEN ? AND ? "
                 "OR (contract_date IS NULL AND contract_year BETWEEN ? AND ?))")
        args = (window[0], window[1], y0, y1)
    log.info("scanning contracts (one sequential read) %s ...", window or "")
    df = pd.read_sql("""
        SELECT institution_id AS iid, vendor_id AS vid, contract_year AS yr,
               contract_date AS cdate, procedure_number AS proc,
               amount_mxn AS amt, is_direct_award AS da, is_single_bid AS sb,
               procedure_type_normalized AS ptype, publication_delay_days AS pub,
               is_year_end AS ye, risk_score AS risk, exception_article AS exc
        FROM contracts NOT INDEXED
        WHERE institution_id IS NOT NULL""" + where, conn, params=args)
    df["iid"] = df.iid.map(canon).fillna(df.iid).astype(int)  # Sep 30 merges
    log.info("  %s rows", f"{len(df):,}")
    return df


# ---------------------------------------------------------------- aggregation
def aggregate(df, flagged, gt, t1):
    """Per-institution sums (index = canonical iid) and per (iid, year) frame."""
    v = np.where((df.amt > 0) & (df.amt <= MAX_AMT), df.amt, 0.0)
    da = df.da.fillna(0).astype(int) == 1
    comp = ~da
    sb = comp & (df.sb.fillna(0).astype(int) == 1)
    lots = df.groupby(["iid", "proc"]).proc.transform("size")   # NaN proc -> NaN
    sweep = sb & (lots >= 2)                                     # grading-v3 s.9
    inv = comp & ~sweep & (df.ptype == "invitacion")
    lic_ad = comp & (df.ptype == "licitacion") & df.pub.notna()
    hr = df.risk >= 0.40
    exc = df.exc.fillna("").str.upper()
    recent = df.yr >= 2023
    f = pd.DataFrame({
        "iid": df.iid, "yr": df.yr, "n": 1, "v": v, "v2": v ** 2,
        "n_da": da, "v_da": v * da, "n_sw": sweep, "v_sw": v * sweep,
        "n_inv": inv, "v_inv": v * inv, "n_single_winner": sb,
        "n_lic_ad": lic_ad, "n_lic_short": lic_ad & (df.pub < 15),
        "n_ye": df.ye.fillna(0) == 1, "n_hr": hr, "v_hr": v * hr,
        "n_da_23": da & recent, "n_da_art41_23": da & recent & exc.str.startswith("ART. 41"),
    })
    iy = f.groupby(["iid", "yr"], as_index=False).sum()
    a = f.drop(columns="yr").groupby("iid").sum()
    a["first_year"] = iy.groupby("iid").yr.min()
    a["last_year"] = iy.groupby("iid").yr.max()

    g = (df[df.cdate.notna()].assign(n=1)
         .groupby(["iid", "yr", "vid", "cdate"]).n.sum())
    a["n_split"] = g[g >= 3].groupby(level="iid").sum()
    a["n_split"] = a.n_split.fillna(0)

    iv = (pd.DataFrame({"iid": df.iid, "vid": df.vid, "v": v})
          .groupby(["iid", "vid"], as_index=False).v.sum())
    iv["s"] = iv.v / iv.groupby("iid").v.transform("sum").replace(0, np.nan)
    a["hhi"] = (iv.s ** 2).groupby(iv.iid).sum(min_count=1)
    a["top1"] = iv.groupby("iid").s.max()
    a["n_vendors"] = iv.groupby("iid").vid.nunique()
    flag = iv.vid.isin(flagged)
    a["v_flag"] = (iv.v * flag).groupby(iv.iid).sum()
    a["n_flag_vendors"] = flag.groupby(iv.iid).sum()
    a["gt_vendors"] = iv.vid.isin(gt).groupby(iv.iid).sum()
    a["t1_vendors"] = iv.vid.isin(t1).groupby(iv.iid).sum()

    a["ess"] = (a.v ** 2 / a.v2.replace(0, np.nan)).fillna(1).clip(lower=1)  # Kish
    vv = a.v.replace(0, np.nan)
    a["r_nc_count"] = (a.n_da + a.n_sw + 0.5 * a.n_inv) / a.n
    a["r_nc_value"] = ((a.v_da + a.v_sw + 0.5 * a.v_inv) / vv).fillna(a.r_nc_count)
    a["r_flag"] = (a.v_flag / vv).fillna(0)
    a["r_hr"] = (a.v_hr / vv).fillna(a.n_hr / a.n)
    return a.reset_index(), iy


# ---------------------------------------------------------------- peers
def peer_keys(df, min_peers, hard_floor):
    """level x family x size, falling back to level x family, then level.
    The reference set is always the WHOLE fallback set (grading-v3 s.3.2)."""
    legacy = np.where(df.is_federal == 1, "federal",
                      np.where((df.itype == "municipal") | (df.canon_level == "municipal"),
                               "municipal", "estatal"))
    # buyer scope (scripts/classify_buyer_scope.py) when present; «otro» peers with estatal
    bl = df.buyer_level.replace({"otro": "estatal"}) if "buyer_level" in df else None
    df["level"] = legacy if bl is None else bl.where(bl.notna(), legacy)
    df["family"] = df.itype.map(FAMILY).fillna("ejecutivo")
    k2 = df.level + "|" + df.family
    df.loc[k2.map(k2.value_counts()).values < min_peers, "family"] = "ejecutivo"
    df["size_band"] = pd.cut(df.n, [0, 99, 999, np.inf],
                             labels=["chica", "media", "grande"]).astype(str)
    df["k2"] = df.level + "|" + df.family
    df["k3"] = df.k2 + "|" + df.size_band
    n3 = df.k3.map(df.k3.value_counts()).values
    n2 = df.k2.map(df.k2.value_counts()).values
    n1 = df.level.map(df.level.value_counts()).values
    df["ref_kind"] = np.where(n3 >= min_peers, 3, np.where(n2 >= min_peers, 2, 1))
    df["peer_key"] = np.select([df.ref_kind == 3, df.ref_kind == 2], [df.k3, df.k2], df.level)
    df["peer_n"] = np.select([df.ref_kind == 3, df.ref_kind == 2], [n3, n2], n1)
    if (df.peer_n < hard_floor).any():
        bad = df.loc[df.peer_n < hard_floor, "peer_key"].unique().tolist()
        raise ValueError(f"peer reference set below hard floor {hard_floor}: {bad}")
    return df


def peer_median(df, rate):
    r = pd.Series(rate, index=df.index)
    m3 = r.groupby(df.k3).transform("median")
    m2 = r.groupby(df.k2).transform("median")
    m1 = r.groupby(df.level).transform("median")
    return np.select([df.ref_kind == 3, df.ref_kind == 2], [m3, m2], m1)


# ---------------------------------------------------------------- shrinkage
def eb_shrink(x, n, groups, priors=None):
    """Beta-binomial empirical Bayes per group (level x family). Prior (mu, k)
    fitted by method of moments unless frozen in `priors`. Returns
    (alpha, beta, fitted priors)."""
    x = np.asarray(x, float)
    n = np.maximum(np.asarray(n, float), 0)
    alpha, beta, fitted = np.zeros_like(x), np.zeros_like(x), {}
    for g in pd.unique(groups):
        m_ = groups == g
        if priors and g in priors:
            mu, k = priors[g]
        else:
            has = n[m_] > 0
            w = n[m_]
            r = np.where(has, x[m_] / np.maximum(n[m_], 1), 0)
            mu = float(np.clip(np.average(r, weights=w) if w.sum() > 0 else 0.5, 1e-4, 1 - 1e-4))
            var_obs = np.average((r - mu) ** 2, weights=w) if w.sum() > 0 else 0.0
            var_bin = mu * (1 - mu) * np.mean(1 / np.maximum(n[m_][has], 1)) if has.any() else 0.0
            k = float(np.clip(mu * (1 - mu) / max(var_obs - var_bin, 1e-6) - 1, 2, 500))
        fitted[g] = (mu, k)
        alpha[m_] = x[m_] + k * mu
        beta[m_] = n[m_] - x[m_] + k * (1 - mu)
    return alpha, np.maximum(beta, 1e-6), fitted


def shrink_all(df, priors=None):
    spec = {  # sub-rate -> (successes, trials); value rates use Kish effective N
        "nc_count": (df.n_da + df.n_sw + 0.5 * df.n_inv, df.n),
        "nc_value": (df.r_nc_value * df.ess, df.ess),
        "short": (df.n_lic_short, df.n_lic_ad),
        "ye": (df.n_ye, df.n),
        "split": (df.n_split, df.n),
        # HHI / top-1 are not binomial; same pseudo-count form (n = contracts).
        "hhi": (df.hhi.fillna(1) * df.n, df.n),
        "top1": (df.top1.fillna(1) * df.n, df.n),
        "flag": (df.r_flag * df.ess, df.ess),
    }
    fitted = {}
    for k, (x, n) in spec.items():
        df[f"{k}_a"], df[f"{k}_b"], fitted[k] = eb_shrink(
            x.values, n.values, df.k2.values, (priors or {}).get(k))
    return fitted


def sub_means(df):
    return {k: (df[f"{k}_a"] / (df[f"{k}_a"] + df[f"{k}_b"])).values
            for k in ["nc_count", "nc_value", "short", "ye", "split", "hhi", "top1", "flag"]}


def pillar_rates(df, rng=None):
    def post(key):
        a_, b_ = df[f"{key}_a"].values, df[f"{key}_b"].values
        return a_ / (a_ + b_) if rng is None else rng.beta(a_, b_)
    return {"competencia": 0.5 * post("nc_count") + 0.5 * post("nc_value"),
            "proceso": (post("short") + post("ye") + post("split")) / 3,
            "concentracion": 0.5 * post("hhi") + 0.5 * post("top1"),
            "sanciones": post("flag")}


# ---------------------------------------------------------------- scoring
def absolute(rate, anchor):
    good, bad = anchor[0], anchor[1]
    return 100 * np.clip((bad - rate) / (bad - good), 0, 1)


def pillar_weight(p, params):
    return params["w_abs_pillar"].get(p, params["w_abs"])


def score(rates, offset, params):
    """pillar = w * A(r) + (1 - w) * A(r - peer offset); total = mean of GRADED.
    Returns (pillars, total, red-flag pillar names per row)."""
    pill, red = {}, []
    for p in GRADED:
        w, anc = pillar_weight(p, params), params["anchors"][p]
        pill[p] = w * absolute(rates[p], anc) + (1 - w) * absolute(rates[p] - offset[p], anc)
        judged = rates[p] - (offset[p] if w == 0 else 0)
        red.append(np.where(judged >= anc[2], p, ""))
    total = np.mean([pill[p] for p in GRADED], axis=0)
    red_names = [[x for x in row if x] for row in zip(*red)]
    return pill, total, red_names


def to_grade(total, cuts, red_names=None, gate=None):
    g = np.select([total >= c for c in cuts], GRADE_LETTERS[:4], "F").astype(object)
    if red_names is not None:      # 1 red-flag pillar caps at B, 2+ cap at C
        nred = np.array([len(r) for r in red_names])
        g = np.where((nred == 1) & (g == "A"), "B", g)
        g = np.where((nred >= 2) & np.isin(g, ["A", "B"]), "C", g)
    if gate is not None:           # sanctions gate caps at C
        g = np.where(gate & np.isin(g, ["A", "B"]), "C", g)
    return g


def fit_calibration(df, ref, params):
    """Anchors = national quantiles of the shrunk rates; cut points = score
    quantiles. Fitted once, stored, then frozen (grading-v3 s.3.5-3.6)."""
    qs = params["anchor_quantiles"]
    anchors = {p: [float(x) for x in np.quantile(ref[p], qs)] for p in GRADED}
    anchors["sanciones"] = list(params["sanction_anchor"])
    params = {**params, "anchors": anchors}
    offset = offsets(df, ref)
    _, total, _ = score(ref, offset, params)
    cuts = [float(round(x)) for x in np.quantile(total, params["grade_target_quantiles"])[::-1]]
    return {**params, "cut_points": cuts}


def offsets(df, ref):
    return {p: peer_median(df, ref[p]) - np.median(ref[p]) for p in GRADED}


# ---------------------------------------------------------------- ledger
def penalty_ledger(df, ref, offset, pill, params):
    """Every point lost (or credited by the peer comparison) on the 0-100 total.
    Invariant: 100 + sum(points) == score. Sub-indicator rows share the pillar's
    absolute loss in proportion to their excess over the national P10."""
    rows, k, subs_all = [], len(GRADED), sub_means(df)
    for p in GRADED:
        anc = params["anchors"][p]
        a_r = absolute(ref[p], anc)
        loss = (100 - a_r) / k
        subs = {j: subs_all[j] for j in SUBS[p]}
        exc = {j: np.maximum(v - np.quantile(v, 0.10), 0) for j, v in subs.items()}
        tot = sum(exc.values())
        safe = np.where(tot > 0, tot, 1)
        for j, v in subs.items():
            share = np.where(tot > 0, exc[j] / safe, 1 / len(subs))
            rows.append(pd.DataFrame({
                "institution_id": df.iid.values, "pillar": p, "item": j, "rate": v,
                "national_median": float(np.median(v)), "peer_median": peer_median(df, v),
                "points": -loss * share}))
        nat = float(np.median(ref[p]))
        rows.append(pd.DataFrame({
            "institution_id": df.iid.values, "pillar": p, "item": "ajuste_pares",
            "rate": ref[p], "national_median": nat, "peer_median": offset[p] + nat,
            "points": (pill[p] - a_r) / k}))
    led = pd.concat(rows, ignore_index=True)
    caps = []
    for iid, names, gate, rf in zip(df.iid.values, df.red_names, df.sanction_gate.values,
                                    df.rate_sanciones.values):
        caps += [{"institution_id": iid, "pillar": n, "item": "bandera_roja_tope",
                  "rate": np.nan, "national_median": np.nan, "peer_median": np.nan,
                  "points": 0.0} for n in names]
        if gate:
            caps.append({"institution_id": iid, "pillar": "sanciones", "item": "tope_sanciones",
                         "rate": rf, "national_median": np.nan, "peer_median": np.nan,
                         "points": 0.0})
    if caps:
        led = pd.concat([led, pd.DataFrame(caps)], ignore_index=True)
    chk = 100 + led.groupby("institution_id").points.sum().reindex(df.iid.values).values
    if not np.allclose(chk, df.score.values, atol=1e-6):
        raise AssertionError("ledger does not sum to score")
    return led


# ---------------------------------------------------------------- trend
def trend_badge(iy, ids, years):
    """Weighted LS slope of the non-competitive count share; mejora / empeora
    only if |slope| >= 2 pp/yr and |t| >= 2 over >= 4 years with >= 5 contracts."""
    t = iy[(iy.yr >= years[0]) & (iy.yr <= years[1]) & (iy.n >= 5)].copy()
    t["r"] = (t.n_da + t.n_sw + 0.5 * t.n_inv) / t.n
    out = {}
    for iid, d in t.groupby("iid"):
        if len(d) < 4:
            continue
        x, y, w = d.yr.values.astype(float), d.r.values, d.n.values.astype(float)
        xm, ym = np.average(x, weights=w), np.average(y, weights=w)
        sxx = np.sum(w * (x - xm) ** 2)
        b = np.sum(w * (x - xm) * (y - ym)) / sxx
        resid = y - ym - b * (x - xm)
        se = np.sqrt(np.sum(w * resid ** 2) / (len(d) - 2) / sxx)
        tv = b / se if se > 0 else 0.0
        lab = ("empeora" if b > 0 else "mejora") if abs(b) >= 0.02 and abs(tv) >= 2 else "estable"
        out[iid] = (lab, float(b), float(tv))
    res = [out.get(i, ("sin_datos", None, None)) for i in ids]
    return [r[0] for r in res], [r[1] for r in res], [r[2] for r in res]


# ---------------------------------------------------------------- orchestration
def latest_calibration(conn):
    try:
        row = conn.execute("SELECT calibration_id, params_json FROM institution_grade_calibration "
                           "ORDER BY created_at DESC LIMIT 1").fetchone()
    except sqlite3.OperationalError:
        return None
    return (row[0], json.loads(row[1])) if row else None


def compute(conn, recalibrate=False, params=None, window=None):
    """Returns (grades, ledger, calibration) where calibration is
    {"calibration_id", "params", "is_new", "below_floor"}. Pure: writes nothing.
    window = (start, end) grades only the contracts dated inside it."""
    canon, inst, flagged, gt, t1 = load_meta(conn)
    a, iy = aggregate(load_contracts(conn, canon, window), flagged, gt, t1)
    df = a.merge(inst, on="iid", how="left")
    below = a.loc[a.n < MIN_CONTRACTS, ["iid", "n", "v"]]
    df = df[df.n >= MIN_CONTRACTS].reset_index(drop=True)

    frozen = None if recalibrate else latest_calibration(conn)
    if frozen:
        cal_id, params = frozen
        log.info("using frozen calibration %s", cal_id)
    else:
        params = {**DEFAULT_PARAMS, **(params or {})}
        cal_id = "CAL-GV3-" + datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
        log.info("fitting new calibration %s", cal_id)
    peer_keys(df, params["min_peers"], params["hard_floor"])
    fitted = shrink_all(df, params.get("priors"))
    ref = pillar_rates(df)
    if not frozen:
        params = fit_calibration(df, ref, params)
        params["priors"] = {k: {g: [float(m), float(s)] for g, (m, s) in v.items()}
                            for k, v in fitted.items()}

    offset = offsets(df, ref)
    pill, total, red = score(ref, offset, params)
    cuts = params["cut_points"]
    df["score"] = total
    df["red_names"] = red
    df["rate_sanciones"] = ref["sanciones"]
    df["sanction_gate"] = ref["sanciones"] >= params["anchors"]["sanciones"][2]
    df["grade"] = to_grade(total, cuts, red, df.sanction_gate.values)

    rng = np.random.default_rng(params["seed"])
    draws = np.array([score(pillar_rates(df, rng), offset, params)[1]
                      for _ in range(params["n_draws"])])
    df["score_lo"], df["score_hi"] = np.percentile(draws, [10, 90], axis=0)
    df["p_grade"] = np.mean(to_grade(draws, cuts) == to_grade(total, cuts), axis=0)
    df["provisional"] = (df.n < 30) | (df.p_grade < 0.5)

    ledger = penalty_ledger(df, ref, offset, pill, params)
    ledger.insert(1, "calibration_id", cal_id)
    trend, slope, tval = trend_badge(iy, df.iid.values, params["trend_years"])
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    grades = pd.DataFrame({
        "institution_id": df.iid, "calibration_id": cal_id, "method_version": METHOD_VERSION,
        "window_start": df.first_year, "window_end": df.last_year,
        "n_contracts": df.n, "total_value_mxn": df.v,
        "score": df.score, "score_lo": df.score_lo, "score_hi": df.score_hi,
        "grade": df.grade, "tier_key": df.grade.map(TIER_KEY),
        "provisional": df.provisional.astype(int), "p_grade": df.p_grade,
        "red_flags": [json.dumps(r) for r in red], "sanction_gate": df.sanction_gate.astype(int),
        "level": df.level, "family": df.family, "size_band": df.size_band,
        "peer_key": df.peer_key, "peer_n": df.peer_n,
        **{f"pillar_{p}": pill[p] for p in GRADED},
        **{f"rate_{p}": ref[p] for p in GRADED},
        "rate_sanciones": ref["sanciones"],
        "model_hr_value_share": df.r_hr,
        "single_winner_share": df.n_single_winner / df.n,
        "trend": trend, "trend_slope": slope, "trend_t": tval,
        "last_year": df.last_year,
        "is_historical": (df.last_year < params["active_since"]).astype(int),
        "gt_vendor_count": df.gt_vendors, "aria_t1_vendor_count": df.t1_vendors,
        "sanctioned_vendor_count": df.n_flag_vendors, "sanctioned_value_mxn": df.v_flag,
        "art41_da_share_2023": (df.n_da_art41_23 / df.n_da_23.replace(0, np.nan)),
        "computed_at": now,
    })
    return grades, ledger, {"calibration_id": cal_id, "params": params, "is_new": not frozen,
                            "n": len(grades), "created_at": now, "below_floor": below}


def _py(v):
    if v is None or (isinstance(v, float) and np.isnan(v)):
        return None
    if isinstance(v, (np.integer,)):
        return int(v)
    if isinstance(v, (np.floating,)):
        return None if np.isnan(v) else float(v)
    if isinstance(v, (np.bool_,)):
        return int(v)
    return v


def write(conn, grades, ledger, cal):
    """Touches only the three grades-v3 tables."""
    conn.executescript(SCHEMA)
    try:
        conn.execute("BEGIN")
        if cal["is_new"]:
            conn.execute("INSERT INTO institution_grade_calibration "
                         "(calibration_id, method_version, params_json, n_institutions, created_at) "
                         "VALUES (?, ?, ?, ?, ?)",
                         (cal["calibration_id"], METHOD_VERSION, json.dumps(cal["params"]),
                          cal["n"], cal["created_at"]))
        for table, frame in (("institution_grades_v3", grades), ("institution_grade_ledger", ledger)):
            conn.execute(f"DELETE FROM {table}")
            cols = list(frame.columns)
            sql = f"INSERT INTO {table} ({', '.join(cols)}) VALUES ({', '.join('?' * len(cols))})"
            conn.executemany(sql, ([_py(v) for v in row] for row in frame.itertuples(index=False)))
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise


# Presidential terms for the per-sexenio replay (institutions «El Tamiz en el
# tiempo»). Same frozen calibration and floor as the all-years grade; the peer
# reference set is the window's own cohort. is_direct_award is 0 for every
# contract 2002-2010 (and publication delay is NULL), so Competencia is not
# measurable there: Fox = "weak" (structure A, 2004 nearly empty), Calderon =
# "mixed" (~42% of its rows predate the flag). Sheinbaum stops at the feed
# freeze ("partial").
SEXENIOS = [("fox", "2002-01-01", "2006-11-30", "weak"),
            ("calderon", "2006-12-01", "2012-11-30", "mixed"),
            ("pena_nieto", "2012-12-01", "2018-11-30", "full"),
            ("amlo", "2018-12-01", "2024-09-30", "full"),
            ("sheinbaum", "2024-10-01", "2025-09-27", "partial")]
SEXENIO_TABLE = "institution_grades_v3_sexenio"
SEXENIO_SCHEMA = f"""
CREATE TABLE IF NOT EXISTS {SEXENIO_TABLE} (
    institution_id       INTEGER NOT NULL,
    sexenio              TEXT NOT NULL,
    window_start         TEXT NOT NULL,
    window_end           TEXT NOT NULL,
    calibration_id       TEXT NOT NULL,
    n_contracts          INTEGER NOT NULL,
    total_mxn            REAL,
    score                REAL,
    score_lo             REAL,
    score_hi             REAL,
    grade                TEXT,
    provisional          INTEGER,
    peer_key             TEXT,
    pillar_competencia   REAL,
    pillar_proceso       REAL,
    pillar_concentracion REAL,
    coverage_flag        TEXT NOT NULL,
    computed_at          TEXT NOT NULL,
    PRIMARY KEY (institution_id, sexenio)
);
"""


def compute_sexenios(conn):
    """One row per (canonical institution, sexenio) with any contract in the
    window. Below MIN_CONTRACTS: counts kept, score/grade NULL (never guessed)."""
    if latest_calibration(conn) is None:
        raise RuntimeError("no frozen calibration; the sexenio replay never recalibrates")
    out = []
    for key, start, end, flag in SEXENIOS:
        g, _, cal = compute(conn, window=(start, end))
        b = cal["below_floor"]
        frame = pd.concat([pd.DataFrame({
            "institution_id": g.institution_id, "n_contracts": g.n_contracts,
            "total_mxn": g.total_value_mxn, "score": g.score, "score_lo": g.score_lo,
            "score_hi": g.score_hi, "grade": g.grade, "provisional": g.provisional,
            "peer_key": g.peer_key, **{f"pillar_{p}": g[f"pillar_{p}"] for p in GRADED}}),
            pd.DataFrame({"institution_id": b.iid, "n_contracts": b.n, "total_mxn": b.v})],
            ignore_index=True)
        frame.insert(1, "sexenio", key)
        frame.insert(2, "window_start", start)
        frame.insert(3, "window_end", end)
        frame.insert(4, "calibration_id", cal["calibration_id"])
        frame["coverage_flag"] = flag
        frame["computed_at"] = cal["created_at"]
        log.info("%s: %d graded, %d below floor, %s", key, len(g), len(b),
                 g.grade.value_counts().sort_index().to_dict())
        out.append(frame)
    return pd.concat(out, ignore_index=True)


def write_sexenios(conn, frame):
    """Touches only institution_grades_v3_sexenio."""
    conn.executescript(SEXENIO_SCHEMA)
    cols = list(frame.columns)
    try:
        conn.execute("BEGIN")
        conn.execute(f"DELETE FROM {SEXENIO_TABLE}")
        conn.executemany(f"INSERT INTO {SEXENIO_TABLE} ({', '.join(cols)}) "
                         f"VALUES ({', '.join('?' * len(cols))})",
                         ([_py(v) for v in row] for row in frame.itertuples(index=False)))
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[1])
    ap.add_argument("--db", default=str(DB_PATH))
    ap.add_argument("--recalibrate", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--sexenios", action="store_true",
                    help=f"grade each presidential term into {SEXENIO_TABLE} only")
    args = ap.parse_args(argv)
    conn = sqlite3.connect(args.db, timeout=60)
    try:
        n = conn.execute("SELECT COUNT(*) FROM contracts").fetchone()[0]
    except sqlite3.OperationalError:
        n = 0
    if n == 0:
        log.error("no contracts in %s (worktree stub DB?) - pass --db", args.db)
        return 2
    log.info("db %s (%s contracts)", args.db, f"{n:,}")
    if args.sexenios:
        frame = compute_sexenios(conn)
        if not args.dry_run:
            write_sexenios(conn, frame)
            conn.execute("PRAGMA wal_checkpoint(PASSIVE)")
            log.info("wrote %s (%d rows)", SEXENIO_TABLE, len(frame))
        return 0
    grades, ledger, cal = compute(conn, recalibrate=args.recalibrate)
    log.info("graded %d institutions; grades %s; provisional %.1f%%; ledger rows %d",
             len(grades), grades.grade.value_counts().sort_index().to_dict(),
             100 * grades.provisional.mean(), len(ledger))
    if args.dry_run:
        return 0
    write(conn, grades, ledger, cal)
    conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    log.info("wrote institution_grades_v3 / institution_grade_ledger (calibration %s, new=%s)",
             cal["calibration_id"], cal["is_new"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
