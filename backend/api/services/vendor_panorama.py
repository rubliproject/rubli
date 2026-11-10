"""«Panorama» of a vendor (docs/PROFILE_CONTENT_VENDOR_2026-11-05.md § 1–4; the vendor twin of institution_panorama).

One read-only GROUP BY over the vendor's contracts (every absorbed id folded in), optionally cut by `since` / `until`
(ISO dates; «Hoy» = this government from 2024-10-01). CompraNet and ComprasMX (structure E) both count once: the
ComprasMX load is deduped against CompraNet (CLAUDE.md § Data Sources). Amounts > 100B MXN are rejected; procedure
shares count only coded years (PROCEDURE_TYPE_FIRST_YEAR, DQ1 § 2).

Returns the ficha totals, the contracts per risk level (display `risk_score`, the getRiskLevelFromScore ladder
0.60 / 0.40 / 0.25), the 50 largest buyers (canonical institution ids, money per year and per government), and the
12 largest categories with their 5 largest subcategories (contract_subcategory).
"""
from __future__ import annotations

import sqlite3
from collections import defaultdict
from typing import Any, Optional

from ..config.constants import MAX_CONTRACT_VALUE, PROCEDURE_TYPE_FIRST_YEAR
from . import vendor_canonical as vcanon
from .institution_panorama import SEXENIOS, TERM_SEAM, sexenio_of

TOP_BUYERS = 50
TOP_CATS = 12
TOP_SUBS = 5
LEVELS = ("critical", "high", "medium", "low", "none")
# frontend lib/constants getRiskLevelFromScore — keep in step
LEVEL_SQL = ("CASE WHEN c.risk_score IS NULL THEN 4 WHEN c.risk_score >= 0.60 THEN 0 WHEN c.risk_score >= 0.40 THEN 1 "
             "WHEN c.risk_score >= 0.25 THEN 2 ELSE 3 END")


def _has(conn: sqlite3.Connection, kind: str, name: str) -> bool:
    return conn.execute("SELECT 1 FROM sqlite_master WHERE type = ? AND name = ?", (kind, name)).fetchone() is not None


def _acc() -> list[float]:
    return [0.0] * 6  # m, n, da, dk, rs, rn


def _add(a: list[float], r: list) -> None:
    for j in range(6):
        a[j] += r[j] or 0


def _pct(num: float, den: float) -> Optional[float]:
    return round(100.0 * num / den, 2) if den else None


def _agg(a: list[float], total_m: float) -> dict:
    return {"amount_mxn": round(a[0], 2), "contracts": int(a[1]), "share_pct": _pct(a[0], total_m),
            "da_pct": _pct(a[2], a[3]), "avg_risk": round(a[4] / a[5], 4) if a[5] else None}


def build_vendor_panorama(conn: sqlite3.Connection, vendor_id: int, since: Optional[str] = None,
                          until: Optional[str] = None) -> dict[str, Any]:
    """`vendor_id` must already be canonical. Read-only."""
    ids = vcanon.group_ids(conn, vendor_id)
    w = f"c.vendor_id IN ({','.join('?' * len(ids))}) AND COALESCE(c.amount_mxn, 0) <= ?"
    args: list[Any] = [*ids, MAX_CONTRACT_VALUE]
    if since:
        w += " AND c.contract_year >= ? AND c.contract_date >= ?"
        args += [int(since[:4]), since]
    if until:
        w += " AND c.contract_year <= ? AND c.contract_date <= ?"
        args += [int(until[:4]), until]
    canon = _has(conn, "table", "institution_canonical")
    inst = "COALESCE(ic.canonical_id, c.institution_id)" if canon else "c.institution_id"
    ijoin = "LEFT JOIN institution_canonical ic ON ic.institution_id = c.institution_id" if canon else ""
    has_sub = _has(conn, "table", "contract_subcategory")
    sub = "COALESCE(cs.subcategory_id, 0)" if has_sub else "0"
    sjoin = "LEFT JOIN contract_subcategory cs ON cs.contract_id = c.id" if has_sub else ""
    k = PROCEDURE_TYPE_FIRST_YEAR
    rows = conn.execute(
        f"""SELECT COALESCE({inst}, 0), COALESCE(c.contract_year, 0),
                   CASE WHEN c.contract_year = 2024 AND c.contract_date >= '{TERM_SEAM}' THEN 1 ELSE 0 END,
                   COALESCE(c.category_id, 0), {sub}, {LEVEL_SQL},
                   COALESCE(SUM(c.amount_mxn), 0), COUNT(*),
                   SUM(CASE WHEN c.contract_year >= {k} AND c.is_direct_award = 1 THEN 1 ELSE 0 END),
                   SUM(CASE WHEN c.contract_year >= {k} AND c.is_direct_award IS NOT NULL THEN 1 ELSE 0 END),
                   COALESCE(SUM(c.risk_score), 0), COUNT(c.risk_score)
            FROM contracts c {ijoin} {sjoin}
            WHERE {w}
            GROUP BY 1, 2, 3, 4, 5, 6""", args).fetchall()

    total = _acc()
    levels = [0] * len(LEVELS)
    buyers: dict[int, list[float]] = defaultdict(_acc)
    b_years: dict[int, dict[int, float]] = defaultdict(lambda: defaultdict(float))
    b_gobs: dict[int, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    cats: dict[int, list[float]] = defaultdict(_acc)
    subs: dict[int, dict[int, list[float]]] = defaultdict(lambda: defaultdict(_acc))
    years: set[int] = set()
    for iid, yr, seam, cid, sid, lvl, *meas in rows:
        _add(total, meas)
        levels[lvl] += int(meas[1])
        if yr:
            years.add(yr)
        if iid:
            _add(buyers[iid], meas)
            if yr:
                b_years[iid][yr] += meas[0]
                g = sexenio_of(yr, bool(seam))
                if g:
                    b_gobs[iid][g] += meas[0]
        if cid:
            _add(cats[cid], meas)
            if sid:
                _add(subs[cid][sid], meas)

    tm = total[0]
    top_b = sorted(buyers, key=lambda i: (-buyers[i][0], -buyers[i][1], i))[:TOP_BUYERS]
    names: dict[int, tuple] = {}
    if top_b:
        names = {r[0]: (r[1], r[2]) for r in conn.execute(
            f"SELECT id, name, siglas FROM institutions WHERE id IN ({','.join('?' * len(top_b))})", top_b)}
    top_c = sorted(cats, key=lambda c: -cats[c][0])[:TOP_CATS]
    cat_names: dict[int, tuple] = {}
    if top_c and _has(conn, "table", "categories"):
        cat_names = {r[0]: (r[1], r[2]) for r in conn.execute(
            f"SELECT id, name_es, name_en FROM categories WHERE id IN ({','.join('?' * len(top_c))})", top_c)}
    sub_ids = sorted({s for c in top_c for s in subs[c]})
    sub_names: dict[int, tuple] = {}
    if sub_ids and _has(conn, "table", "subcategory_definitions"):
        sub_names = {r[0]: (r[1], r[2], r[3]) for r in conn.execute(
            f"SELECT id, code, name_es, name_en FROM subcategory_definitions WHERE id IN ({','.join('?' * len(sub_ids))})", sub_ids)}

    gob_keys = [g for g, _, _ in SEXENIOS]
    none3 = (None, None, None)
    return {
        "vendor_id": vendor_id, "since": since, "until": until,
        **_agg(total, tm), "first_year": min(years) if years else None, "last_year": max(years) if years else None,
        "levels": dict(zip(LEVELS, levels)),
        "buyers_n": len(buyers),
        "buyers": [{
            "institution_id": i, "name": names.get(i, (None, None))[0], "siglas": names.get(i, (None, None))[1],
            **_agg(buyers[i], tm),
            "first_year": min(b_years[i]) if b_years[i] else None, "last_year": max(b_years[i]) if b_years[i] else None,
            "years": [[y, round(m, 2)] for y, m in sorted(b_years[i].items())],
            "gobs": {g: round(b_gobs[i][g], 2) for g in gob_keys if b_gobs[i].get(g)},
        } for i in top_b],
        "categories": [{
            "category_id": c, "name_es": cat_names.get(c, (None, None))[0], "name_en": cat_names.get(c, (None, None))[1],
            **_agg(cats[c], tm),
            "subs": [{"subcategory_id": s, "code": sub_names.get(s, none3)[0], "name_es": sub_names.get(s, none3)[1],
                      "name_en": sub_names.get(s, none3)[2], **_agg(subs[c][s], tm)}
                     for s in sorted(subs[c], key=lambda s: -subs[c][s][0])[:TOP_SUBS]],
        } for c in top_c],
    }
