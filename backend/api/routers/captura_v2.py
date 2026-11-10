"""«Captura» v2 — companies that live off one federal buyer (/captura «La gravedad» + «El candado»).

Reads the tables written by scripts/precompute_captura.py (definition in its docstring):
  GET /captura/plates                      meta + every buyer + every captive pair (compact, no year arrays)
  GET /captura/buyer/{institution_id}      one buyer + its pairs with year arrays (the drilled plate / lock strips)
  GET /captura/pair?vendor_id=&institution_id=   one pair + its 10 largest contracts with that buyer, its
                                           contracts by year and its procedure mix (the dock / the dissection)
  GET /captura/door?vendor_id=|institution_id=   the dossiers' small «Captura» door (null pair/buyer when not captive)
  GET /captura/majority                    «La mitad»: buyer-years where one company took >= 50 % (sexenios,
                                           the dots, the 2024–25 ledger) ← scripts/precompute_captura_majority.py
  GET /captura/majority/{institution_id}   one buyer's largest supplier, year by year
  GET /captura/casos                       «Casos»: ARIA tier of every current pair + the documented case's
                                           page (the ranking itself is lib/captura/casos.ts)
No RFC is ever selected; personas físicas never reach captura_pairs (pooled as counts per buyer).
"""
import json
import logging
import sqlite3

from fastapi import APIRouter, Depends, HTTPException, Query

from ..cache import app_cache
from ..config.constants import MAX_CONTRACT_VALUE
from ..dependencies import get_db_dep
from ..public_labels import DOCUMENTED_LINK_SQL, _norm_name, is_persona_fisica, is_public_entity, public_vendor_name
from ..services.institution_canonical import buyer_levels, scope_predicate
from ..config.constants import proc_known  # DQ1 § 2

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/captura", tags=["captura"])

_C = "captura_v2"  # one namespace per key kind: api/cache.py fixes maxsize at the first set
# compact pair tuple for the overview (order documented in meta.pair_fields)
_PAIR_FIELDS = ("vendor_id", "institution_id", "name", "m", "sh", "y0", "y1", "ny", "lock0", "lock1",
                "lockrun", "da", "flag", "post", "post_n", "gt", "risk")
_JSON_COLS = {"yrs", "y_total", "y_cap", "y_n"}
_SWITCH = "2025-09-28"  # CompraNet's last day (scripts/precompute_captura.py SWITCH)
_HALF = 0.5
_SEX = ((2002, 2006, "Fox"), (2007, 2012, "Calderón"), (2013, 2018, "Peña Nieto"), (2019, 2024, "AMLO"),
        (2025, 2025, "Sheinbaum"))


def _rows(conn: sqlite3.Connection, sql: str, args=()) -> list[dict]:
    try:
        cur = conn.execute(sql, args)
    except sqlite3.OperationalError as e:
        if "no such table" in str(e):
            logger.error("captura tables missing — run scripts/precompute_captura.py --write (%s)", e)
            raise HTTPException(503, "captura data unavailable")
        raise
    cols = [d[0] for d in cur.description]
    return [{c: (json.loads(v) if c in _JSON_COLS and isinstance(v, str) else v) for c, v in zip(cols, r)}
            for r in cur.fetchall()]


def _meta(conn) -> dict:
    r = _rows(conn, "SELECT v, updated_at FROM captura_meta WHERE k = 'meta'")
    if not r:
        logger.error("captura_meta empty — run scripts/precompute_captura.py --write")
        raise HTTPException(503, "captura data unavailable")
    return {**json.loads(r[0]["v"]), "updated_at": r[0]["updated_at"], "pair_fields": list(_PAIR_FIELDS)}


def _scoped_totals(t: dict, buyers: list[dict], pairs: list[dict]) -> dict:
    """meta.totals over one buyer scope, by the precompute's own formulas (scripts/precompute_captura.py).
    The *_examined / candidates / suspect counts stay all-buyer; pooled personas físicas come from the
    plate's buyers only (buyers without a captive pair hold none in captura_buyers)."""
    pp = [r for r in pairs if r["post_n"] > 0]
    n = max(1, len(pairs))
    mid = len(pairs) // 2
    return {**t,
            "pairs": len(pairs), "buyers": len(buyers), "money": sum(r["m"] for r in pairs),
            "m11": sum(r["m11"] for r in pairs),
            "da_money": round(sum(r["m11"] * r["da"] for r in pairs if r["da"] is not None)),
            "post_pairs": len(pp), "post_money": sum(r["post"] for r in pp),
            "pf_pairs": sum(b["pf_n"] for b in buyers), "pf_money": round(sum(b["pf_m"] for b in buyers)),
            "pub_pairs": sum(b["pub_n"] for b in buyers), "fp_pairs": sum(b["fp_n"] for b in buyers),
            "flagged": sum(r["flag"] for r in pairs),
            "doc": sum(1 for r in pairs if r["gt"] == "doc"), "lead": sum(1 for r in pairs if r["gt"] == "lead"),
            "p6": sum(r["p6"] for r in pairs), "top3_money": sum(b["cap"] for b in buyers[:3]),
            "share_mean": round(sum(r["sh"] for r in pairs) / n, 4),
            "years_median": sorted(r["ny"] for r in pairs)[mid] if pairs else 0,
            "lockrun_median": sorted(r["lockrun"] for r in pairs)[mid] if pairs else 0}


@router.get("/plates")
def plates(scope: str | None = Query(None, description="Buyer scope: federal (default) | local | all"),
           conn: sqlite3.Connection = Depends(get_db_dep)):
    pred, params, scope = scope_predicate(conn, scope if scope in ("federal", "local", "all") else None,
                                          "institution_id")
    hit = app_cache.get(f"{_C}_plates", scope)
    if hit is not None:
        return hit
    meta = _meta(conn)
    buyers = _rows(conn, f"SELECT * FROM captura_buyers WHERE {pred} ORDER BY cap DESC", params)
    levels = buyer_levels(conn)
    for b in buyers:
        b["level"] = levels.get(b["institution_id"])
    if scope == "all":
        pairs = _rows(conn, f"SELECT {', '.join(_PAIR_FIELDS)} FROM captura_pairs ORDER BY m DESC")
    else:
        pairs = _rows(conn, f"SELECT * FROM captura_pairs WHERE {pred} ORDER BY m DESC", params)
        meta["totals"] = _scoped_totals(meta["totals"], buyers, pairs)
    meta["scope"] = scope
    out = {"meta": meta, "buyers": buyers, "pairs": [[r[f] for f in _PAIR_FIELDS] for r in pairs]}
    app_cache.set(f"{_C}_plates", scope, out, maxsize=3, ttl=3600)
    return out


@router.get("/buyer/{institution_id}")
def buyer(institution_id: int, conn: sqlite3.Connection = Depends(get_db_dep)):
    key = f"b:{institution_id}"
    hit = app_cache.get(f"{_C}_buyer", key)
    if hit is not None:
        return hit
    b = _rows(conn, "SELECT * FROM captura_buyers WHERE institution_id = ?", (institution_id,))
    if not b:
        raise HTTPException(404, "buyer has no captive companies")
    out = {"buyer": b[0], "pairs": _rows(
        conn, "SELECT * FROM captura_pairs WHERE institution_id = ? ORDER BY m DESC", (institution_id,))}
    app_cache.set(f"{_C}_buyer", key, out, maxsize=512, ttl=3600)
    return out


def _members(conn, table: str, key: str, cid: int) -> list[int]:
    try:
        ids = {r[0] for r in conn.execute(f"SELECT {key} FROM {table} WHERE canonical_id = ?", (cid,))}
    except sqlite3.OperationalError as e:
        if "no such table" not in str(e):   # anything else would silently shrink the pair's contracts
            logger.error("captura pair members from %s failed: %s", table, e)
            raise HTTPException(503, "captura data unavailable")
        ids = set()
    return sorted(ids | {cid})


@router.get("/pair")
def pair(vendor_id: int = Query(..., ge=1), institution_id: int = Query(..., ge=1),
         conn: sqlite3.Connection = Depends(get_db_dep)):
    key = f"p:{vendor_id}:{institution_id}"
    hit = app_cache.get(f"{_C}_pair", key)
    if hit is not None:
        return hit
    p = _rows(conn, "SELECT * FROM captura_pairs WHERE vendor_id = ? AND institution_id = ?", (vendor_id, institution_id))
    if not p:
        raise HTTPException(404, "not a captive pair")
    vs = _members(conn, "vendor_canonical", "vendor_id", vendor_id)
    ins = _members(conn, "institution_canonical", "institution_id", institution_id)
    # CompraNet rows only (the ComprasMX rows in `contracts` are the pair's «post» slice), as the precompute
    where = (f"vendor_id IN ({','.join('?' * len(vs))}) AND institution_id IN ({','.join('?' * len(ins))})"
             " AND amount_mxn > 0 AND amount_mxn <= ? AND (contract_date IS NULL OR contract_date < ?)")
    args = (*vs, *ins, MAX_CONTRACT_VALUE, _SWITCH)
    contracts = _rows(conn, f"""SELECT id, contract_year AS year, amount_mxn, is_direct_award, title FROM contracts
                                WHERE {where} ORDER BY amount_mxn DESC LIMIT 10""", args)
    by_year = [[r["y"], r["n"], round(r["m"]), r["n_da"]] for r in _rows(
        conn, f"""SELECT contract_year AS y, COUNT(*) AS n, SUM(amount_mxn) AS m, SUM({proc_known('is_direct_award')} = 1) AS n_da
                  FROM contracts WHERE {where} GROUP BY 1 ORDER BY 1""", args)]
    proc = [{"type": r["t"], "n": r["n"], "m": round(r["m"])} for r in _rows(
        conn, f"""SELECT COALESCE(procedure_type_normalized, 'desconocido') AS t, COUNT(*) AS n, SUM(amount_mxn) AS m
                  FROM contracts WHERE {where} GROUP BY 1 ORDER BY 3 DESC""", args)]
    out = {"pair": p[0], "contracts": contracts, "by_year": by_year, "proc": proc}
    app_cache.set(f"{_C}_pair", key, out, maxsize=2048, ttl=3600)
    return out


def _canonical(conn, table: str, key: str, i: int) -> int:
    try:
        r = conn.execute(f"SELECT canonical_id FROM {table} WHERE {key} = ?", (i,)).fetchone()
    except sqlite3.OperationalError as e:
        if "no such table" not in str(e):
            raise
        return i
    return r[0] if r and r[0] else i


@router.get("/door")
def door(vendor_id: int | None = Query(None, ge=1), institution_id: int | None = Query(None, ge=1),
         conn: sqlite3.Connection = Depends(get_db_dep)):
    """The dossiers' «Captura» door: a vendor's captive pair (≥ 80 % from one buyer → at most one), or a
    buyer's captive count. 200 with a null pair/buyer when there is none (the door hides): absence is an
    expected state, and a 404 logged a console error on every dossier (launch audit 2026-10-28 S2)."""
    if (vendor_id is None) == (institution_id is None):
        raise HTTPException(422, "pass vendor_id or institution_id")
    key = f"d:{vendor_id}:{institution_id}"
    hit = app_cache.get(f"{_C}_door", key)
    if hit is not None:
        return hit
    if vendor_id is not None:
        v = _canonical(conn, "vendor_canonical", "vendor_id", vendor_id)
        r = _rows(conn, """SELECT p.vendor_id, p.institution_id, p.sh, p.m, p.y0, p.y1, b.siglas, b.name AS buyer
                           FROM captura_pairs p LEFT JOIN captura_buyers b ON b.institution_id = p.institution_id
                           WHERE p.vendor_id = ? ORDER BY p.sh DESC LIMIT 1""", (v,))
        out = {"pair": r[0] if r else None}
    else:
        i = _canonical(conn, "institution_canonical", "institution_id", institution_id)
        r = _rows(conn, "SELECT institution_id, siglas, n, cap, cap_share FROM captura_buyers WHERE institution_id = ?", (i,))
        out = {"buyer": r[0] if r else None}
    app_cache.set(f"{_C}_door", key, out, maxsize=2048, ttl=3600)
    return out


def _inst_names(conn) -> set:
    hit = app_cache.get(f"{_C}_instnames", "all")
    if hit is None:
        hit = {_norm_name(r[0]) for r in conn.execute("SELECT name FROM institutions")}
        app_cache.set(f"{_C}_instnames", "all", hit, maxsize=1, ttl=3600)
    return hit


def _majority_rows(conn, where: str = "", args=()) -> list[dict]:
    """captura_majority joined to names, sectors and the captive pairs. `kind`: co (a company, named) ·
    pf (persona física: named, labelled in the UI; owner policy 2026-10-29) · pub (another public body: named, not capture).
    The RFC is read only to tell a persona física apart; it never leaves this function."""
    rows = _rows(conn, f"""
        SELECT m.institution_id, m.year, m.total, m.top_m, m.vendor_id, m.n_vendors,
               v.name AS vname, v.is_individual, v.rfc, v.vendor_kind,
               i.name AS iname, i.siglas, COALESCE(i.sector_id, 12) AS sector_id,
               p.sh AS cap_sh, p.gt, p.risk, p.tier
        FROM captura_majority m
        LEFT JOIN vendors v ON v.id = m.vendor_id
        LEFT JOIN institutions i ON i.id = m.institution_id
        LEFT JOIN captura_pairs p ON p.vendor_id = m.vendor_id AND p.institution_id = m.institution_id
        {where} ORDER BY m.institution_id, m.year""", args)
    names = _inst_names(conn)
    out = []
    for r in rows:
        pf = is_persona_fisica(r["is_individual"], r["rfc"])
        pub = r["vendor_kind"] not in (None, "private") or is_public_entity(r["vname"], names)
        out.append({
            "institution_id": r["institution_id"], "inst": r["iname"], "siglas": r["siglas"], "sector_id": r["sector_id"],
            "year": r["year"], "total": round(r["total"]), "top_m": round(r["top_m"]),
            "share": round(r["top_m"] / r["total"], 4) if r["total"] else 0, "n_vendors": r["n_vendors"],
            "vendor_id": r["vendor_id"],
            "vendor": public_vendor_name(r["vname"], r["is_individual"], r["rfc"])[0],
            "kind": "pf" if pf else ("pub" if pub else "co"),
            "cap": int(r["cap_sh"] is not None), "gt": r["gt"], "risk": r["risk"], "tier": r["tier"],
        })
    return out


def majority_summary(rows: list[dict]) -> dict:
    """Sexenios, years, the dots (one per buyer-year with a majority holder) and the 2024–25 ledger
    (one row per buyer: its latest majority year, largest money first). Pure — pinned in tests."""
    half = [r for r in rows if r["share"] >= _HALF]
    sex = []
    for a, b, n in _SEX:
        ys = [r for r in rows if a <= r["year"] <= b]
        hs = [r for r in half if a <= r["year"] <= b]
        sex.append({"name": n, "a": a, "b": b, "buyer_years": len(ys), "half": len(hs),
                    "buyers": len({r["institution_id"] for r in ys}), "buyers_half": len({r["institution_id"] for r in hs}),
                    "money_half": round(sum(r["top_m"] for r in hs)), "spend_half": round(sum(r["total"] for r in hs))})
    years = []
    for y in sorted({r["year"] for r in rows}):
        ys = [r for r in rows if r["year"] == y]
        hs = [r for r in ys if r["share"] >= _HALF]
        years.append({"year": y, "buyer_years": len(ys), "half": len(hs), "money_half": round(sum(r["top_m"] for r in hs))})
    latest: dict = {}
    for r in half:
        if r["year"] >= 2024 and (r["institution_id"] not in latest or r["year"] > latest[r["institution_id"]]["year"]):
            latest[r["institution_id"]] = r
    ledger = sorted(latest.values(), key=lambda r: -r["top_m"])
    dots = [[r["institution_id"], r["year"], r["share"], r["kind"], r["cap"]] for r in half]
    inst = {r["institution_id"]: [r["inst"], r["siglas"], r["sector_id"]] for r in half}
    return {"sex": sex, "years": years, "dots": dots, "inst": inst, "ledger": ledger}


@router.get("/majority")
def majority(conn: sqlite3.Connection = Depends(get_db_dep)):
    hit = app_cache.get(f"{_C}_majority", "all")
    if hit is not None:
        return hit
    out = {"meta": {"floor": 100_000_000, "half": _HALF, "horizon": _SWITCH, "y0": 2002, "y1": 2025},
           **majority_summary(_majority_rows(conn))}
    app_cache.set(f"{_C}_majority", "all", out, maxsize=1, ttl=3600)
    return out


@router.get("/majority/{institution_id}")
def majority_buyer(institution_id: int, conn: sqlite3.Connection = Depends(get_db_dep)):
    key = f"m:{institution_id}"
    hit = app_cache.get(f"{_C}_majority_b", key)
    if hit is not None:
        return hit
    i = _canonical(conn, "institution_canonical", "institution_id", institution_id)
    out = {"institution_id": i, "half": _HALF, "years": _majority_rows(conn, "WHERE m.institution_id = ?", (i,))}
    app_cache.set(f"{_C}_majority_b", key, out, maxsize=512, ttl=3600)
    return out


def casos_evidence(conn) -> list[list]:
    """[vendor_id, institution_id, tier, slug] for every current captive pair (a contract with its buyer in
    2024–25). slug = the verified case page of a documented pair (DOCUMENTED_LINK_SQL), when it has one."""
    pairs = _rows(conn, "SELECT vendor_id, institution_id, tier, gt FROM captura_pairs WHERE y1 >= 2024")
    doc = sorted({p["vendor_id"] for p in pairs if p["gt"] == "doc"})
    slug: dict = {}
    if doc:
        try:
            rows = conn.execute(f"""
                SELECT gtv.vendor_id, s.slug
                FROM ground_truth_vendors gtv JOIN ground_truth_cases gtc ON gtc.id = gtv.case_id
                JOIN procurement_scandals s ON s.ground_truth_case_id = gtc.id AND s.is_verified = 1
                WHERE gtv.vendor_id IN ({','.join('?' * len(doc))}) AND {DOCUMENTED_LINK_SQL}
                ORDER BY gtc.provenance_tier, gtc.id""", doc).fetchall()
        except sqlite3.OperationalError as e:   # an older DB without slugs: the seal stays, the link hides
            logger.warning("captura casos: case links unavailable (%s)", e)
            rows = []
        for v, sl in rows:
            slug.setdefault(v, sl)
    return [[p["vendor_id"], p["institution_id"], p["tier"], slug.get(p["vendor_id"])] for p in pairs]


@router.get("/casos")
def casos(conn: sqlite3.Connection = Depends(get_db_dep)):
    hit = app_cache.get(f"{_C}_casos", "all")
    if hit is not None:
        return hit
    out = {"fields": ["vendor_id", "institution_id", "tier", "slug"], "pairs": casos_evidence(conn)}
    app_cache.set(f"{_C}_casos", "all", out, maxsize=1, ttl=3600)
    return out
