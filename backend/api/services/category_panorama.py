"""«Panorama» of a category or one of its subcategories (docs/PROFILE_CONTENT_CATEGORY_2026-11-05.md § 1–5 and
§ «Subcategory profile»; the category twin of institution_panorama / vendor_panorama).

One read-only GROUP BY over the category's contracts, optionally cut to one subcategory (by its stable `code`, never
the numeric id: prod and local ids differ) and by `since` / `until` (ISO dates; «Hoy» = this government from
2024-10-01). CompraNet and ComprasMX (structure E) both count once: the ComprasMX load is deduped against CompraNet
(CLAUDE.md § Data Sources). Amounts > 100B MXN are rejected; procedure shares count only coded years
(PROCEDURE_TYPE_FIRST_YEAR, DQ1 § 2). Risk levels use the display `risk_score` and the getRiskLevelFromScore ladder.

Returns the ficha totals (+ contracts per risk level, the money and count share of critical contracts, December's
share of the money), the years, the subcategories, the 10 largest suppliers and buyers, the 5 largest
supplier × buyer pairs, and the 8 largest contracts. Raw ids fold into canonical vendor / institution ids.
"""
from __future__ import annotations

import sqlite3
from collections import defaultdict
from typing import Any, Optional

from ..config.constants import MAX_CONTRACT_VALUE, PROCEDURE_TYPE_FIRST_YEAR
from ..public_labels import SPIKE_FLOOR, amount_flag, label_persona_names
from . import vendor_canonical as vcanon
from .institution_panorama import SEXENIOS, TERM_SEAM, sexenio_of

# covering index (scripts/add_panorama_index.py): without it Medicamentos (273K rows) reads every row from a cold
# disk — 169 s locally for Historia; the institution twin brought IMSS from ~5 s to 1.5 s.
INDEX_NAME = "idx_c_cat_panorama"
INDEX_SQL = (f"CREATE INDEX IF NOT EXISTS {INDEX_NAME} ON contracts(category_id, contract_year, contract_date, "
             "vendor_id, institution_id, amount_mxn, is_direct_award, risk_score)")
TOP_N = 10
TOP_PAIRS = 5
TOP_CONTRACTS = 8
LEVELS = ("critical", "high", "medium", "low", "none")
# frontend lib/constants getRiskLevelFromScore — keep in step
LEVEL_SQL = ("CASE WHEN c.risk_score IS NULL THEN 4 WHEN c.risk_score >= 0.60 THEN 0 WHEN c.risk_score >= 0.40 THEN 1 "
             "WHEN c.risk_score >= 0.25 THEN 2 ELSE 3 END")


class UnknownSubcategory(LookupError):
    pass


def _has(conn: sqlite3.Connection, kind: str, name: str) -> bool:
    return conn.execute("SELECT 1 FROM sqlite_master WHERE type = ? AND name = ?", (kind, name)).fetchone() is not None


def _acc() -> list[float]:
    return [0.0] * 8  # m, n, da, dk, rs, rn, hr (count), crit_m


def _pct(num: float, den: float) -> Optional[float]:
    return round(100.0 * num / den, 2) if den else None


def _agg(a: list[float], total_m: float) -> dict:
    return {"amount_mxn": round(a[0], 2), "contracts": int(a[1]), "share_pct": _pct(a[0], total_m),
            "da_pct": _pct(a[2], a[3]), "avg_risk": round(a[4] / a[5], 4) if a[5] else None,
            "hr_pct": _pct(a[6], a[1])}


def build_category_panorama(conn: sqlite3.Connection, category_id: int, since: Optional[str] = None,
                            until: Optional[str] = None, sub_code: Optional[str] = None, sector: Optional[int] = None,
                            year_from: Optional[int] = None, year_to: Optional[int] = None) -> dict[str, Any]:
    """Read-only. Raises UnknownSubcategory when `sub_code` is not a subcategory of this category."""
    has_defs = _has(conn, "table", "subcategory_definitions")
    has_sub = has_defs and _has(conn, "table", "contract_subcategory")
    sub_meta = None
    if sub_code is not None:
        row = conn.execute("SELECT id, code, name_es, name_en, COALESCE(is_catch_all, 0) FROM subcategory_definitions "
                           "WHERE category_id = ? AND code = ?", (category_id, sub_code)).fetchone() if has_sub else None
        if not row:
            raise UnknownSubcategory(sub_code)
        sub_meta = {"subcategory_id": row[0], "code": row[1], "name_es": row[2], "name_en": row[3], "is_catch_all": bool(row[4])}

    w = "c.category_id = ? AND COALESCE(c.amount_mxn, 0) <= ?"
    args: list[Any] = [category_id, MAX_CONTRACT_VALUE]
    if since:
        w += " AND c.contract_year >= ? AND c.contract_date >= ?"
        args += [int(since[:4]), since]
    if until:
        w += " AND c.contract_year <= ? AND c.contract_date <= ?"
        args += [int(until[:4]), until]
    # the /categories filters (AUDIT_JOURNALIST 11-07 P0): buyer sector + sexenio by contract year, the same cut as
    # precomputed category_cube, so the box and the profile print the same numbers
    if sector is not None:
        w += " AND COALESCE(c.sector_id, 12) = ?"
        args.append(sector)
    if year_from is not None:
        w += " AND c.contract_year >= ?"
        args.append(year_from)
    if year_to is not None:
        w += " AND c.contract_year <= ?"
        args.append(year_to)
    sjoin = "LEFT JOIN contract_subcategory cs ON cs.contract_id = c.id" if has_sub else ""
    sub = "COALESCE(cs.subcategory_id, 0)" if has_sub else "0"
    if sub_meta:
        w += " AND cs.subcategory_id = ?"
        args.append(sub_meta["subcategory_id"])
    canon = _has(conn, "table", "institution_canonical")
    inst = "COALESCE(ic.canonical_id, c.institution_id)" if canon else "c.institution_id"
    ijoin = "LEFT JOIN institution_canonical ic ON ic.institution_id = c.institution_id" if canon else ""
    k = PROCEDURE_TYPE_FIRST_YEAR
    # flagged amounts (public_labels.amount_flag: suspect decimal or > 10B «review») stay in the register list,
    # marked, but never make a total, a share or a leader (DEMO_TRUTHCHECK 11-07: one 35 bn ComprasMX vaccine row
    # made Liomont «the #1 seller» of Medicamentos)
    flagged = {cid: f for cid, amt, vid in conn.execute(
        f"SELECT c.id, c.amount_mxn, c.vendor_id FROM contracts c {sjoin} WHERE {w} AND c.amount_mxn > ?", [*args, SPIKE_FLOOR])
        if (f := amount_flag(conn, cid, amt, vid))}
    wf = w + (f" AND c.id NOT IN ({','.join('?' * len(flagged))})" if flagged else "")
    rows = conn.execute(
        f"""SELECT COALESCE(c.vendor_id, 0), COALESCE({inst}, 0), COALESCE(c.contract_year, 0), {sub}, {LEVEL_SQL},
                   CASE WHEN c.contract_year = 2024 AND c.contract_date >= '{TERM_SEAM}' THEN 1 ELSE 0 END,
                   COALESCE(SUM(c.amount_mxn), 0), COUNT(*),
                   SUM(CASE WHEN c.contract_year >= {k} AND c.is_direct_award = 1 THEN 1 ELSE 0 END),
                   SUM(CASE WHEN c.contract_year >= {k} AND c.is_direct_award IS NOT NULL THEN 1 ELSE 0 END),
                   COALESCE(SUM(c.risk_score), 0), COUNT(c.risk_score),
                   COALESCE(SUM(CASE WHEN substr(c.contract_date, 6, 2) = '12' THEN c.amount_mxn END), 0)
            FROM contracts c {ijoin} {sjoin}
            WHERE {wf}
            GROUP BY 1, 2, 3, 4, 5, 6""", [*args, *flagged]).fetchall()

    absorbed = dict(conn.execute("SELECT vendor_id, canonical_id FROM vendor_canonical WHERE canonical_id <> vendor_id")) \
        if vcanon.has_canonical(conn) else {}
    total = _acc()
    levels = [0] * len(LEVELS)
    dec_m = 0.0
    vendors: dict[int, list[float]] = defaultdict(_acc)
    buyers: dict[int, list[float]] = defaultdict(_acc)
    pairs: dict[tuple[int, int], list[float]] = defaultdict(_acc)
    years: dict[int, list[float]] = defaultdict(_acc)
    subs: dict[int, list[float]] = defaultdict(_acc)
    gobs: dict[str, list[float]] = defaultdict(_acc)
    for vid, iid, yr, sid, lvl, seam, m, n, da, dk, rs, rn, dm in rows:
        vid = absorbed.get(vid, vid)
        meas = (m, n, da or 0, dk or 0, rs, rn, n if lvl <= 1 else 0, m if lvl == 0 else 0)
        dec_m += dm
        levels[lvl] += n
        g = sexenio_of(yr, bool(seam)) if yr else None
        targets = [total, years[yr] if yr else None, gobs[g] if g else None, subs[sid] if sid else None, vendors[vid] if vid else None,
                   buyers[iid] if iid else None, pairs[(vid, iid)] if vid and iid else None]
        for a in targets:
            if a is not None:
                for j in range(8):
                    a[j] += meas[j]

    tm = total[0]
    rank = lambda d: sorted(d, key=lambda x: (-d[x][0], -d[x][1], x))  # noqa: E731
    top_v = rank(vendors)[:TOP_N]
    top_b = rank(buyers)[:TOP_N]
    top_p = rank(pairs)[:TOP_PAIRS]
    v_ids = sorted({*top_v, *(p[0] for p in top_p)})
    b_ids = sorted({*top_b, *(p[1] for p in top_p)})
    vnames = {r[0]: r[1] for r in conn.execute(
        f"SELECT id, name FROM vendors WHERE id IN ({','.join('?' * len(v_ids))})", v_ids)} if v_ids else {}
    bnames = {r[0]: (r[1], r[2]) for r in conn.execute(
        f"SELECT id, name, siglas FROM institutions WHERE id IN ({','.join('?' * len(b_ids))})", b_ids)} if b_ids else {}
    sub_defs: dict[int, tuple] = {}
    if has_defs and subs:
        ids = sorted(subs)
        sub_defs = {r[0]: r[1:] for r in conn.execute(
            f"SELECT id, code, name_es, name_en, COALESCE(is_catch_all, 0) FROM subcategory_definitions "
            f"WHERE id IN ({','.join('?' * len(ids))})", ids)}
    # the largest bought (the category's covering index idx_c_cat_amount walks the amounts from the top)
    top_k = conn.execute(
        f"""SELECT c.id, c.title, c.vendor_id, c.institution_id, i.name, c.amount_mxn, c.contract_date, c.contract_year,
                   c.is_direct_award, c.risk_score, c.source_structure
            FROM contracts c {sjoin} LEFT JOIN institutions i ON i.id = c.institution_id
            WHERE {w} ORDER BY c.amount_mxn DESC LIMIT {TOP_CONTRACTS}""", args).fetchall()
    kv_ids = sorted({r[2] for r in top_k if r[2]} - set(vnames))
    if kv_ids:
        vnames.update({r[0]: r[1] for r in conn.execute(
            f"SELECT id, name FROM vendors WHERE id IN ({','.join('?' * len(kv_ids))})", kv_ids)})

    suppliers = label_persona_names(conn, [{"vendor_id": v, "vendor_name": vnames.get(v), **_agg(vendors[v], tm)} for v in top_v])
    pair_rows = label_persona_names(conn, [{
        "vendor_id": v, "vendor_name": vnames.get(v), "institution_id": i, "institution_name": bnames.get(i, (None, None))[0],
        "siglas": bnames.get(i, (None, None))[1], **_agg(pairs[(v, i)], tm),
        # the pair's share of the BUYER's money in this category: «x of every 100 pesos it spent here»
        "of_buyer_pct": _pct(pairs[(v, i)][0], buyers[i][0]),
    } for v, i in top_p])
    contracts = label_persona_names(conn, [{
        "id": r[0], "title": r[1], "vendor_id": r[2], "vendor_name": vnames.get(r[2]), "institution_id": r[3],
        "institution_name": r[4], "amount_mxn": r[5], "contract_date": r[6], "contract_year": r[7],
        "is_direct_award": None if r[8] is None else bool(r[8]), "risk_score": r[9], "source_structure": r[10],
        "amount_flag": flagged.get(r[0]),
    } for r in top_k])
    yrs = sorted(years)
    none4 = (None, None, None, 0)
    return {
        "category_id": category_id, "sub": sub_meta, "since": since, "until": until,
        "sector": sector, "year_from": year_from, "year_to": year_to,
        **_agg(total, tm),
        "levels": dict(zip(LEVELS, levels)),
        "crit_pct": _pct(levels[0], total[1]), "crit_value_pct": _pct(total[7], tm),
        "dec_pct": _pct(dec_m, tm),
        "vendors_n": len(vendors), "buyers_n": len(buyers),
        "first_year": yrs[0] if yrs else None, "last_year": yrs[-1] if yrs else None,
        "years": [{"year": y, **_agg(years[y], tm)} for y in yrs],
        # per government, the AMLO → Sheinbaum seam cut by date (Oct–Dec 2024 is Sheinbaum's)
        "gobs": [{"key": key, "from": a, "to": b, **_agg(gobs[key], tm)} for key, a, b in SEXENIOS if key in gobs],
        "subs": [{"code": sub_defs.get(s, none4)[0], "name_es": sub_defs.get(s, none4)[1], "name_en": sub_defs.get(s, none4)[2],
                  "is_catch_all": bool(sub_defs.get(s, none4)[3]), **_agg(subs[s], tm)} for s in rank(subs)],
        "suppliers": suppliers,
        "buyers": [{"institution_id": i, "name": bnames.get(i, (None, None))[0], "siglas": bnames.get(i, (None, None))[1],
                    **_agg(buyers[i], tm)} for i in top_b],
        "pairs": pair_rows,
        "top_contracts": contracts,
    }
