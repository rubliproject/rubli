"""«Gasto a ciegas» (/gasto-a-ciegas; API keeps /no-se-ve): budget exercised (Cuenta Pública) vs contracts visible in the register.

Reads the tables written by scripts/precompute_budget_visibility.py (definitions in its docstring):
  GET /no-se-ve                 every entity (and the Tren Maya project) with its years — the page, cached
  GET /no-se-ve/{entity_key}    one entity: its years + its largest visible contracts per year (the drawer)
Amounts in MXN. It measures visibility, not corruption. No RFC is ever returned; personas físicas are unnamed.
"""
import json
import logging
import sqlite3

from fastapi import APIRouter, Depends, HTTPException, Path

from ..cache import app_cache
from ..dependencies import get_db_dep
from ..public_labels import public_vendor_name

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/no-se-ve", tags=["no-se-ve"])

_C = "no_se_ve"
_TTL = 3600
_YEAR_COLS = ("year", "ur_codes", "exercised_cap2356", "exercised_cap1", "exercised_cap4", "exercised_cap6",
              "exercised_total", "trusts_46101", "contracts_visible_mxn", "contracts_n", "contracts_da_mxn", "pct_visible")
_ENT_COLS = ("entity_key", "sort", "grp", "label_es", "label_en", "short", "cp_code", "ramo", "ur", "project_key",
             "institution_ids", "title_match")


def _q(conn: sqlite3.Connection, sql: str, args=()) -> list[sqlite3.Row]:
    try:
        return conn.execute(sql, args).fetchall()
    except sqlite3.OperationalError as e:
        if "no such table" in str(e):
            logger.error("budget tables missing — run scripts/precompute_budget_visibility.py (%s)", e)
            raise HTTPException(503, "budget visibility data unavailable")
        raise


def _entities(conn: sqlite3.Connection, key: str | None = None) -> list[dict]:
    where, args = ("WHERE m.entity_key = ?", (key,)) if key else ("", ())
    ents = [dict(zip(_ENT_COLS, r)) for r in _q(conn, f"SELECT {', '.join(_ENT_COLS)} FROM budget_ur_map m {where} ORDER BY sort", args)]
    years: dict[str, list[dict]] = {}
    for r in _q(conn, f"SELECT entity_key, {', '.join(_YEAR_COLS)} FROM budget_visibility "
                      f"{'WHERE entity_key = ?' if key else ''} ORDER BY entity_key, year", args):
        years.setdefault(r[0], []).append(dict(zip(_YEAR_COLS, r[1:])))
    for e in ents:
        e["institution_ids"] = json.loads(e["institution_ids"])
        e["years"] = years.get(e["entity_key"], [])
    # the board's sector dot (Los patrones): the sector of the entity's first register institution
    first = sorted({e["institution_ids"][0] for e in ents if e["institution_ids"]})
    sec = dict(_q(conn, f"SELECT id, sector_id FROM institutions WHERE id IN ({','.join('?' * len(first))})", first)) if first else {}
    for e in ents:
        e["sector_id"] = sec.get(e["institution_ids"][0]) if e["institution_ids"] else None
    return ents


@router.get("")
def page(conn: sqlite3.Connection = Depends(get_db_dep)) -> dict:
    hit = app_cache.get(_C, "page")
    if hit is not None:
        return hit
    ents = _entities(conn)
    if not ents:
        raise HTTPException(503, "budget visibility data unavailable")
    for e in ents:  # a project's spend by UR and year (the ribbon's bands): budget_exercised is ~30k rows, indexed by year
        if e["project_key"]:
            e["by_ur"] = [dict(zip(("year", "ramo", "ur", "exercised_cap2356"), r)) for r in _q(conn, """
                SELECT year, ramo, ur, SUM(ejercido) FROM budget_exercised
                WHERE project_key = ? AND cap IN (2, 3, 5, 6) GROUP BY 1, 2, 3 ORDER BY 1, 2, 3""", (e["project_key"],))]
    cp_years = sorted({y["year"] for e in ents for y in e["years"] if y["exercised_cap2356"] is not None})
    out = {"meta": {"cp_years": cp_years,
                    "sources": {"cp": "SHCP · Transparencia Presupuestaria · Datos abiertos · Cuenta Pública (gf_ecd_epe), MONTO_EJERCIDO",
                                "register": "RUBLI · CompraNet al 28 sep 2025 + ComprasMX"}},
           "entities": ents}
    app_cache.set(_C, "page", out, maxsize=64, ttl=_TTL)
    return out


@router.get("/{entity_key}")
def entity(entity_key: str = Path(..., pattern=r"^[a-z0-9-]{2,40}$"),
           conn: sqlite3.Connection = Depends(get_db_dep)) -> dict:
    hit = app_cache.get(_C, entity_key)
    if hit is not None:
        return hit
    ents = _entities(conn, entity_key)
    if not ents:
        raise HTTPException(404, "unknown entity")
    rows = _q(conn, """
        SELECT t.year, t.rank, c.id, c.amount_mxn, c.is_direct_award, c.procedure_type_normalized, c.title, c.risk_score,
               c.vendor_id, v.name, v.is_individual, v.rfc, c.institution_id, i.name, i.siglas,
               (SELECT MIN(q.ips_tier) FROM aria_queue q WHERE q.vendor_id = c.vendor_id) AS tier,
               c.contract_date, c.sector_id, cat.id, cat.name_es, cat.name_en
        FROM budget_visible_top t JOIN contracts c ON c.id = t.contract_id
        LEFT JOIN vendors v ON v.id = c.vendor_id LEFT JOIN institutions i ON i.id = c.institution_id
        LEFT JOIN categories cat ON cat.id = c.category_id AND cat.is_active = 1
        WHERE t.entity_key = ? ORDER BY t.year, t.rank""", (entity_key,))
    top: dict[str, list[dict]] = {}
    for (y, rank, cid, amt, da, proc, title, risk, vid, vname, ind, rfc, iid, iname, isig, tier,
         cdate, sid, catid, cat_es, cat_en) in rows:
        top.setdefault(str(y), []).append({
            "id": cid, "rank": rank, "amount_mxn": amt, "is_direct_award": bool(da), "procedure": proc,
            "title": title or None, "risk_score": risk,
            "vendor_id": vid, "vendor": (gate := public_vendor_name(vname, ind, rfc))[0],   # rfc only feeds the gate
            "vendor_is_individual": gate[1], "persona_fisica": gate[1], "institution_id": iid, "institution": iname, "siglas": isig, "aria_tier": tier,
            # the board row (Los patrones): day, sector dot, «Qué se compró»
            "contract_date": cdate, "sector_id": sid, "category_id": catid, "category_es": cat_es, "category_en": cat_en})
    ids = ents[0]["institution_ids"]
    insts = [dict(zip(("id", "name", "siglas"), r)) for r in _q(
        conn, f"SELECT id, name, siglas FROM institutions WHERE id IN ({','.join('?' * len(ids))}) ORDER BY id", ids)] if ids else []
    out = {**ents[0], "top": top, "institutions": insts}
    app_cache.set(_C, entity_key, out, maxsize=64, ttl=_TTL)
    return out
