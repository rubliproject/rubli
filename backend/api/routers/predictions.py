"""«Predicción» tab: habits we back-tested (docs/PREDICTIONS_RESEARCH_2026-11-06.md), never risk or «corrupción».

Reads precomputed_stats['predictions'] (scripts/precompute_predictions.py):
  GET /predictions/institution/{id}                       next year's direct-award share ± the constant band
  GET /predictions/pair?vendor_id=&institution_id=        the pair's class (first-time / repeat, from its own
                                                          years, live) + that class's back-tested base rate
  GET /predictions/vendor/{id}                            «sigue ganando» decile rate + its main buyer (companies)
  GET /predictions/contract/{id}                          «contratos parecidos se repiten» decile rate (its triple)
  GET /predictions/category/{id}                          direct-award ±10, suppliers ±25 %, #1 churn
  (docs/PREDICTIONS_SPECIFIC_2026-11-07.md; features computed live, model + decile rates from the precompute)
Personas físicas get no prediction (reason 'persona_fisica'). No RFC or vendor name is returned.
"""
import json
import sqlite3

from fastapi import APIRouter, Depends, HTTPException, Path, Query

from ..cache import app_cache
from ..config.constants import proc_known
from ..dependencies import get_db_dep
from ..public_labels import is_persona_fisica
from scripts.precompute_predictions import CN_WHERE, STAT_KEY, decile_rate, streak, triple_features, vendor_features

router = APIRouter(prefix="/predictions", tags=["predictions"])
_C = "predictions"


def _payload(conn: sqlite3.Connection) -> dict:
    hit = app_cache.get(_C, "payload")
    if hit is not None:
        return hit
    row = conn.execute("SELECT stat_value FROM precomputed_stats WHERE stat_key = ?", (STAT_KEY,)).fetchone()
    if not row:
        raise HTTPException(503, "predictions not precomputed — run scripts/precompute_predictions.py")
    p = json.loads(row[0])
    app_cache.set(_C, "payload", p, maxsize=4, ttl=3600)
    return p


_DA = f"SUM({proc_known('is_direct_award')}), COUNT({proc_known('is_direct_award')})"  # as in the precompute


def _is_pf(conn: sqlite3.Connection, vendor_id: int) -> bool:
    v = conn.execute("SELECT is_individual, rfc FROM vendors WHERE id = ?", (vendor_id,)).fetchone()
    if not v:
        raise HTTPException(404, "vendor not found")
    return is_persona_fisica(v[0], v[1])


def _meta(p: dict) -> dict:
    return {"last_year": p["last_year"], "target_year": p["target_year"], "data_through": p["data_through"]}


@router.get("/pair")
def pair(vendor_id: int = Query(..., ge=1), institution_id: int = Query(..., ge=1),
         conn: sqlite3.Connection = Depends(get_db_dep)) -> dict:
    p = _payload(conn)
    out = {**_meta(p), "available": False, "reason": None}
    v = conn.execute("SELECT is_individual, rfc FROM vendors WHERE id = ?", (vendor_id,)).fetchone()
    if not v:
        raise HTTPException(404, "vendor not found")
    if is_persona_fisica(v[0], v[1]):
        return {**out, "reason": "persona_fisica"}
    years = {r[0] for r in conn.execute(
        f"SELECT DISTINCT contract_year FROM contracts WHERE vendor_id = ? AND institution_id = ? AND {CN_WHERE}",
        (vendor_id, institution_id))}
    if not years:
        return {**out, "reason": "no_data"}
    s = streak(years, p["last_year"])
    out["last_signed"] = max(years)
    if s == 0:
        return {**out, "reason": "not_recent"}
    cls = "first" if s == 1 else "repeat"
    r = p["pair_rates"]
    return {**out, "available": True, "streak": s, "pair_class": cls, "rate": r[cls]["rate"], "rate_n": r[cls]["n"],
            "base_rate": r["all"]["rate"], "test": r["test"]}


@router.get("/institution/{institution_id}")
def institution(institution_id: int = Path(..., ge=1), conn: sqlite3.Connection = Depends(get_db_dep)) -> dict:
    p = _payload(conn)
    f = p["institutions"].get(str(institution_id))
    base = {**_meta(p), "band": p["band"], "backtest": p["institution_backtest"]}
    if not f:
        return {**base, "available": False, "reason": "thin", "min_n": p["min_n"]}
    return {**base, "available": True, "reason": None, **f}


def _track(m: dict) -> dict:
    return {"n_test": m["n_test"], "base": m["base"], "auc": m["auc"], "test": m["test"]}


@router.get("/vendor/{vendor_id}")
def vendor(vendor_id: int = Path(..., ge=1), conn: sqlite3.Connection = Depends(get_db_dep)) -> dict:
    p = _payload(conn)
    out = {**_meta(p), "available": False, "reason": None}
    if _is_pf(conn, vendor_id):
        return {**out, "reason": "persona_fisica"}
    m = p["vendor"]
    by = {r[0]: (r[1], r[2] or 0.0, r[3] or 0, r[4] or 0) for r in conn.execute(
        f"SELECT institution_id, COUNT(*), SUM(amount_mxn), {_DA} FROM contracts "
        f"WHERE vendor_id = ? AND contract_year = ? AND institution_id IS NOT NULL AND {CN_WHERE} GROUP BY 1",
        (vendor_id, p["last_year"]))}
    x = vendor_features(by) if by else None
    if x is None:
        return {**out, "reason": "thin"}
    d, rate = decile_rate(m, x)
    top = max(by, key=lambda i: by[i][1])
    name = conn.execute("SELECT name FROM institutions WHERE id = ?", (top,)).fetchone()
    return {**out, "available": True, "decile": d, "rate": rate, **_track(m),
            "top_buyer": {"id": top, "name": name[0] if name else None}, "top_share": round(x[4], 3),
            "dep90": x[4] >= 0.9, "main_buyer_stays": m["main_buyer_stays"], "dep90_stays": m["dep90_stays"]}


@router.get("/contract/{contract_id}")
def contract(contract_id: int = Path(..., ge=1), conn: sqlite3.Connection = Depends(get_db_dep)) -> dict:
    p = _payload(conn)
    out = {**_meta(p), "available": False, "reason": None}
    c = conn.execute("SELECT vendor_id, institution_id, category_id FROM contracts WHERE id = ?", (contract_id,)).fetchone()
    if not c:
        raise HTTPException(404, "contract not found")
    if not all(c):
        return {**out, "reason": "no_data"}
    if _is_pf(conn, c[0]):
        return {**out, "reason": "persona_fisica"}
    ly = p["last_year"]
    yrs = {r[0]: (r[1], r[2] or 0.0, r[3] or 0, r[4] or 0) for r in conn.execute(
        f"SELECT contract_year, COUNT(*), SUM(amount_mxn), {_DA} FROM contracts WHERE vendor_id = ? AND institution_id = ? "
        f"AND category_id = ? AND contract_year IN (?, ?) AND {CN_WHERE} GROUP BY 1", (*c, ly - 1, ly))}
    if ly not in yrs:
        return {**out, "reason": "not_recent"}
    d, rate = decile_rate(p["contract"], triple_features(yrs[ly], (ly - 1) in yrs))
    return {**out, "available": True, "decile": d, "rate": rate, **_track(p["contract"])}


@router.get("/category/{category_id}")
def category(category_id: int = Path(..., ge=1), conn: sqlite3.Connection = Depends(get_db_dep)) -> dict:
    p = _payload(conn)
    k = p["category"]
    u = k["units"].get(str(category_id))
    return {**_meta(p), "available": u is not None, "band": p["band"], **(u or {}),
            **{key: v for key, v in k.items() if key != "units"}}
