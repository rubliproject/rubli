"""«Panorama» of an institution (concept B2 «La columna», docs/PROFILE_CONTENT_INSTITUTION_2026-11-05.md § P1–P4).

One read-only pass set over the institution's contracts, optionally cut by `since` (ISO date, «Hoy» = this
government from 2024-10-01), `year` and `category_id`. CompraNet and ComprasMX (structure E) both count: the
ComprasMX load is already deduped against CompraNet (CLAUDE.md § Data Sources). Amounts > 100B MXN are
rejected; procedure shares count only coded years (PROCEDURE_TYPE_FIRST_YEAR, DQ1 § 2).

Returns the ficha totals, the 50 largest suppliers (+ «los demás» totals), the categories, and the per-year and
per-sexenio squares (each with its three largest suppliers). Raw ids fold into canonical institution/vendor ids.
Speed: the covering index idx_c_inst_panorama (INDEX_SQL; scripts/add_panorama_index.py) keeps IMSS (661K rows)
around 1.5 s; without it the same SQL falls back to idx_c_inst_vendor (~5 s warm).
"""
from __future__ import annotations

import sqlite3
from collections import defaultdict
from typing import Any, Optional

import numpy as np

from ..config.constants import MAX_CONTRACT_VALUE, PROCEDURE_TYPE_FIRST_YEAR
from ..public_labels import apply_public_labels, label_persona_names
from . import vendor_canonical as vcanon
from .institution_canonical import group_ids

INDEX_NAME = "idx_c_inst_panorama"
INDEX_SQL = (f"CREATE INDEX IF NOT EXISTS {INDEX_NAME} ON contracts(institution_id, contract_year, contract_date, "
             "vendor_id, category_id, amount_mxn, is_direct_award, risk_score)")
TOP_N = 50
HR = 0.40  # getRiskLevelFromScore «alto»

# (key, first year, last year): the year buckets the site uses (frontend lib/administrations.ts) — except the
# AMLO → Sheinbaum seam, cut by date like «Hoy»: Oct–Dec 2024 is Sheinbaum's (TERM_SEAM).
SEXENIOS = (("fox", 2002, 2006), ("calderon", 2007, 2012), ("epn", 2013, 2018), ("amlo", 2019, 2024), ("sheinbaum", 2024, 2030))
TERM_SEAM = "2024-10-01"
_KEYS = ("m", "n", "da", "dk", "dam", "rs", "rn", "hr")


def sexenio_of(year: int, after_seam: bool = False) -> Optional[str]:
    """`after_seam`: a 2024 contract dated on/after TERM_SEAM."""
    if year == 2024:
        return "sheinbaum" if after_seam else "amlo"
    for key, a, b in SEXENIOS:
        if a <= year <= b:
            return key
    return None


def _has(conn: sqlite3.Connection, kind: str, name: str) -> bool:
    return conn.execute("SELECT 1 FROM sqlite_master WHERE type = ? AND name = ?", (kind, name)).fetchone() is not None


def _absorbed(conn: sqlite3.Connection) -> dict[int, int]:
    if not vcanon.has_canonical(conn):
        return {}
    return dict(conn.execute("SELECT vendor_id, canonical_id FROM vendor_canonical WHERE canonical_id <> vendor_id"))


def _acc() -> dict[str, float]:
    return dict.fromkeys(_KEYS, 0)


def _pct(num: float, den: float) -> Optional[float]:
    return round(100.0 * num / den, 2) if den else None


def _agg(a: dict) -> dict:
    return {"amount_mxn": round(a["m"], 2), "contracts": int(a["n"]), "da_pct": _pct(a["da"], a["dk"]),
            "avg_risk": round(a["rs"] / a["rn"], 4) if a["rn"] else None, "hr_pct": _pct(a["hr"], a["n"])}


def build_panorama(conn: sqlite3.Connection, institution_id: int, since: Optional[str] = None,
                   year: Optional[int] = None, category_id: Optional[int] = None,
                   until: Optional[str] = None) -> dict[str, Any]:
    """`institution_id` must already be canonical. Read-only."""
    ids = group_ids(conn, institution_id)
    ph_i = ",".join("?" * len(ids))
    cut, cut_args = "", []
    if since:
        cut += " AND contract_year >= ? AND contract_date >= ?"
        cut_args += [int(since[:4]), since]
    if until:
        cut += " AND contract_year <= ? AND contract_date <= ?"
        cut_args += [int(until[:4]), until]
    if year is not None:
        cut += " AND contract_year = ?"
        cut_args.append(year)
    w = f"institution_id IN ({ph_i}) AND amount_mxn > 0 AND amount_mxn <= ?{cut}"
    args: list[Any] = [*ids, MAX_CONTRACT_VALUE, *cut_args]
    if category_id is not None:
        w += " AND category_id = ?"
        args.append(category_id)
    hint = f"INDEXED BY {INDEX_NAME}" if _has(conn, "index", INDEX_NAME) else ""
    k = PROCEDURE_TYPE_FIRST_YEAR
    measures = (f"SUM(amount_mxn), COUNT(*), SUM(CASE WHEN contract_year >= {k} AND is_direct_award = 1 THEN 1 ELSE 0 END),"
                f" SUM(CASE WHEN contract_year >= {k} AND is_direct_award IS NOT NULL THEN 1 ELSE 0 END),"
                f" SUM(CASE WHEN contract_year >= {k} AND is_direct_award = 1 THEN amount_mxn ELSE 0 END),"
                f" COALESCE(SUM(risk_score), 0), COUNT(risk_score), SUM(CASE WHEN risk_score >= {HR} THEN 1 ELSE 0 END)")

    # ONE pass · vendor × year × category, folded with numpy (IMSS: 147K groups; ~1.1 s SQL + ~0.2 s numpy —
    # three GROUP BYs plus a Python loop took 2.3 s). Vendor 0 / category 0 = none on record.
    rows = conn.execute(f"SELECT COALESCE(vendor_id, 0), contract_year, COALESCE(category_id, 0), {measures} "
                        f"FROM contracts {hint} WHERE {w} GROUP BY 1, 2, 3", args).fetchall()
    arr = np.array(rows, dtype=float).reshape(-1, 3 + len(_KEYS))
    vid_col, yr_col, cat_col, M = arr[:, 0].astype(np.int64), arr[:, 1].astype(np.int64), arr[:, 2].astype(np.int64), arr[:, 3:]
    # the term of each row by year; then Oct–Dec 2024 (a small index range) moves from AMLO to Sheinbaum
    SX_KEYS = [k for k, _, _ in SEXENIOS]
    sx_col = np.digitize(yr_col, [b + 1 for _, _, b in SEXENIOS[:-1]]).astype(np.int64)
    sx_col[(yr_col < SEXENIOS[0][1]) | (yr_col > SEXENIOS[-1][2])] = -1
    seam = conn.execute(f"SELECT COALESCE(vendor_id, 0), {measures} FROM contracts {hint} WHERE {w} AND contract_year = 2024 "
                        f"AND contract_date >= '{TERM_SEAM}' GROUP BY 1", args).fetchall()
    S = np.array(seam, dtype=float).reshape(-1, 1 + len(_KEYS))
    s_vid, s_M = S[:, 0].astype(np.int64), S[:, 1:]
    fold_early = _absorbed(conn)
    if fold_early and len(s_vid):
        s_vid = np.array([fold_early.get(int(v), int(v)) for v in s_vid], dtype=np.int64)
    i_sh, i_am = SX_KEYS.index("sheinbaum"), SX_KEYS.index("amlo")
    sx_key_all = np.concatenate([sx_col, np.full(len(s_vid), i_sh), np.full(len(s_vid), i_am)])
    sx_M_all = np.vstack([M, s_M, -s_M]) if len(s_vid) else M
    fold = fold_early
    if fold and len(vid_col):
        src = np.fromiter(fold.keys(), dtype=np.int64)
        dst = np.fromiter(fold.values(), dtype=np.int64)
        o = np.argsort(src)
        src, dst = src[o], dst[o]
        pos = np.clip(np.searchsorted(src, vid_col), 0, len(src) - 1)
        vid_col = np.where(src[pos] == vid_col, dst[pos], vid_col)
    sx_vid_all = np.concatenate([vid_col, s_vid, s_vid])
    as_acc = lambda v: dict(zip(_KEYS, (float(x) for x in v)))  # noqa: E731

    def group(col):
        keys, inv = np.unique(col, return_inverse=True)
        sums = np.stack([np.bincount(inv, M[:, j], len(keys)) for j in range(len(_KEYS))], axis=1) if len(keys) else np.zeros((0, len(_KEYS)))
        return keys, inv, sums

    vids, vinv, vsum = group(vid_col)
    yrs, yinv, ysum = group(yr_col)
    cks, _, csum = group(cat_col)
    total = as_acc(M.sum(axis=0)) if len(M) else _acc()
    years = {int(y): as_acc(ysum[i]) for i, y in enumerate(yrs)}
    cats = {int(c): as_acc(csum[i]) for i, c in enumerate(cks) if c != 0}
    n_vend = int((vids != 0).sum())
    order = np.argsort(-vsum[:, 0], kind="stable") if len(vids) else np.array([], dtype=np.int64)
    order = order[vids[order] != 0][:TOP_N]  # contracts without a vendor id count in the totals, never as a plate
    vend = {int(vids[i]): as_acc(vsum[i]) for i in order}
    top_ids = list(vend)

    # vendor × year amounts → each top supplier's years, each year's / sexenio's three largest
    pk, pinv = np.unique(vinv * len(yrs) + yinv, return_inverse=True) if len(M) else (np.array([], dtype=np.int64), None)
    pm = np.bincount(pinv, M[:, 0], len(pk)) if len(M) else np.array([])
    pv, py = vids[pk // max(1, len(yrs))], yrs[pk % max(1, len(yrs))]
    keep = pv != 0
    pv, py, pm = pv[keep], py[keep], pm[keep]
    vyear: dict[int, dict[int, float]] = defaultdict(dict)
    top_mask = np.isin(pv, top_ids)
    for v, y, m in zip(pv[top_mask].tolist(), py[top_mask].tolist(), pm[top_mask].tolist()):
        vyear[v][y] = m

    def top3_of(v_arr, m_arr, mask):
        if not mask.any():
            return []
        sel_v, sel_m = v_arr[mask], m_arr[mask]
        uv, ui = np.unique(sel_v, return_inverse=True)
        um = np.bincount(ui, sel_m, len(uv))
        o = np.argsort(-um, kind="stable")[:3]
        return [(int(uv[i]), float(um[i])) for i in o]

    yr_top = {int(y): top3_of(pv, pm, py == y) for y in yrs}
    # sexenios by term (the seam cut by date): totals and each one's three largest
    has_sx = sx_key_all >= 0
    sxk, sxinv = np.unique(sx_key_all, return_inverse=True)
    sxsum = np.stack([np.bincount(sxinv, sx_M_all[:, j], len(sxk)) for j in range(len(_KEYS))], axis=1) if len(sxk) else np.zeros((0, len(_KEYS)))
    sx_acc = {SX_KEYS[int(k)]: as_acc(sxsum[i]) for i, k in enumerate(sxk) if k >= 0}
    sv, sx_v, sx_m = sx_vid_all[has_sx], sx_key_all[has_sx], sx_M_all[has_sx, 0]
    sx_top = {key: top3_of(sv, sx_m, (sx_v == j) & (sv != 0)) for j, key in enumerate(SX_KEYS)}

    # main category of each top supplier under this cut (its plate's family hue)
    main_cat: dict[int, int] = {}
    if top_ids:
        cmask = np.isin(vid_col, top_ids) & (cat_col != 0)
        if cmask.any():
            ck, cinv = np.unique(np.stack([vid_col[cmask], cat_col[cmask]], axis=1), axis=0, return_inverse=True)
            cm = np.bincount(cinv.ravel(), M[cmask, 0], len(ck))
            for (v_, c_), m in sorted(zip(ck.tolist(), cm.tolist()), key=lambda t: t[1]):
                main_cat[v_] = c_  # ascending: the largest wins

    # first/last year with this buyer over ALL periods («sin contratos desde 20XX»): an IN-list on idx_c_inst_vendor
    span_all: dict[int, tuple[int, int]] = {}
    if top_ids:
        raw = [r for vid in top_ids for r in vcanon.group_ids(conn, vid)]
        base = f"institution_id IN ({ph_i}) AND vendor_id IN ({','.join('?' * len(raw))}) AND amount_mxn > 0 AND amount_mxn <= ?"
        for v, a, b in conn.execute(f"SELECT vendor_id, MIN(contract_year), MAX(contract_year) FROM contracts WHERE {base} GROUP BY 1", [*ids, *raw, MAX_CONTRACT_VALUE]):
            cv = fold.get(v, v)
            lo, hi = span_all.get(cv, (a, b))
            span_all[cv] = (min(lo, a), max(hi, b))

    top = list(vend.items())
    tot_m = total["m"]

    need = set(top_ids) | {v for t in [*yr_top.values(), *sx_top.values()] for v, _ in t}
    names: dict[int, str] = {}
    if need:
        nl = sorted(need)
        names = dict(conn.execute(f"SELECT id, name FROM vendors WHERE id IN ({','.join('?' * len(nl))})", nl))

    flags: dict[int, dict] = {}
    if top_ids and _has(conn, "table", "aria_queue"):
        cols = ("vendor_id", "primary_pattern", "in_ground_truth", "is_efos_definitivo", "is_sfp_sanctioned")
        rows = [dict(zip(cols, r)) for r in conn.execute(
            f"SELECT {', '.join(cols)} FROM aria_queue WHERE vendor_id IN ({','.join('?' * len(top_ids))})", top_ids)]
        flags = {d["vendor_id"]: d for d in apply_public_labels(conn, rows)}

    def mini(lst):
        out = label_persona_names(conn, [{"vendor_id": v, "vendor_name": names.get(v), "amount_mxn": round(m, 2)} for v, m in lst])
        return [{**d, "share_pct": _pct(d["amount_mxn"], tot_m)} for d in out]

    suppliers = []
    for vid, a in top:
        f = flags.get(vid, {})
        ys = vyear[vid]
        fy, ly = span_all.get(vid, (min(ys), max(ys)))
        suppliers.append({
            "vendor_id": vid, "vendor_name": names.get(vid), **_agg(a), "share_pct": _pct(a["m"], tot_m),
            "da_amount_mxn": round(a["dam"], 2), "first_year": min(ys), "last_year": max(ys),
            "first_year_all": fy, "last_year_all": ly,
            "years": [[y, round(m, 2)] for y, m in sorted(ys.items())],
            "main_category_id": main_cat.get(vid),
            "primary_pattern": f.get("primary_pattern"), "in_ground_truth": bool(f.get("in_ground_truth")),
            "efos": bool(f.get("is_efos_definitivo")), "sfp": bool(f.get("is_sfp_sanctioned")),
        })
    suppliers = label_persona_names(conn, suppliers)
    named = sum(s["amount_mxn"] for s in suppliers)

    cids = list(cats)
    cat_names: dict[int, tuple] = {}
    if cids and _has(conn, "table", "categories"):
        cat_names = {r[0]: (r[1], r[2]) for r in conn.execute(
            f"SELECT id, name_es, name_en FROM categories WHERE id IN ({','.join('?' * len(cids))})", cids)}

    return {
        "institution_id": institution_id, "since": since, "until": until, "year": year, "category_id": category_id,
        **_agg(total), "vendors": n_vend,
        "suppliers": suppliers,
        "rest": {"vendors": max(0, n_vend - len(suppliers)), "amount_mxn": round(max(0.0, tot_m - named), 2),
                 "contracts": max(0, int(total["n"]) - sum(s["contracts"] for s in suppliers))},
        "categories": [{"category_id": c, "name_es": cat_names.get(c, (None, None))[0], "name_en": cat_names.get(c, (None, None))[1],
                        "share_pct": _pct(a["m"], tot_m), **_agg(a)}
                       for c, a in sorted(cats.items(), key=lambda kv: -kv[1]["m"])][:12],
        "years": [{"year": y, **_agg(a), "top3": mini(yr_top.get(y, []))} for y, a in sorted(years.items())],
        "sexenios": [{"key": s, "from": a0, "to": b0, **_agg(sx_acc[s]), "top3": mini(sx_top.get(s, []))}
                     for s, a0, b0 in SEXENIOS if s in sx_acc and sx_acc[s]["n"] > 0],
    }
