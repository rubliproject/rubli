"""«El sexenio en curso» — GET /sexenio-actual returns precomputed_stats['sexenio_actual'] as written by
scripts/precompute_sexenio_actual.py (definition in its docstring). No RFC; personas físicas pooled."""
import json
import logging
import sqlite3
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from ..cache import app_cache, shared
from ..config.constants import COLUMN_ROWS_SQL
from ..dependencies import get_db_dep
from ..public_labels import clean_name, is_named_persona

logger = logging.getLogger(__name__)
router = APIRouter(tags=["sexenio"])


@router.get("/sexenio-actual")
def sexenio_actual(conn: sqlite3.Connection = Depends(get_db_dep)):
    try:
        row = conn.execute("SELECT stat_value, updated_at FROM precomputed_stats WHERE stat_key = 'sexenio_actual'").fetchone()
    except sqlite3.OperationalError:
        row = None
    if not row:
        logger.error("precomputed_stats['sexenio_actual'] missing — run scripts/precompute_sexenio_actual.py")
        raise HTTPException(404, "The current-term monitor has not been computed yet.")
    return {**json.loads(row[0]), "updated_at": row[1]}


@router.get("/recent-activity")
def recent_activity(conn: sqlite3.Connection = Depends(get_db_dep)):
    """The Portada's «Lo más reciente»: precomputed_stats['recent_activity'] (scripts/precompute_recent.py)."""
    try:
        row = conn.execute("SELECT stat_value, updated_at FROM precomputed_stats WHERE stat_key = 'recent_activity'").fetchone()
    except sqlite3.OperationalError:
        row = None
    if not row:
        raise HTTPException(404, "Recent activity has not been computed yet.")
    return {**json.loads(row[0]), "updated_at": row[1]}


@router.get("/rastro/trail")
def rastro_trail(conn: sqlite3.Connection = Depends(get_db_dep)):
    """«El rastreo de un peso»: precomputed_stats['rastro_trail'] (scripts/precompute_rastro.py), the shape of the
    frontend's bundled rastro.data.json. 404 → the page keeps its bundled pack."""
    try:
        row = conn.execute("SELECT stat_value FROM precomputed_stats WHERE stat_key = 'rastro_trail'").fetchone()
    except sqlite3.OperationalError:
        row = None
    if not row:
        raise HTTPException(404, "The trail has not been computed yet.")
    return json.loads(row[0])


EventType = Literal["award", "first_supplier", "critical", "direct_spike", "weekly_refresh", "month_close"]


@router.get("/events")
def events(type: Optional[EventType] = Query(None), limit: int = Query(50, ge=1, le=500),
           offset: int = Query(0, ge=0, le=10_000), conn: sqlite3.Connection = Depends(get_db_dep)):
    """The dated events feed, newest first: precomputed_stats['events_feed'] (scripts/precompute_events.py).
    `offset` pages it (the Portada board reads one group 24 at a time as it rolls into older contracts)."""
    try:
        row = conn.execute("SELECT stat_value, updated_at FROM precomputed_stats WHERE stat_key = 'events_feed'").fetchone()
    except sqlite3.OperationalError:
        row = None
    if not row:
        raise HTTPException(404, "The events feed has not been computed yet.")
    data = json.loads(row[0])
    ev = [e for e in data["events"] if type is None or e["type"] == type]
    return {"meta": data["meta"], "total": len(ev), "events": ev[offset:offset + limit], "updated_at": row[1]}


# The column's rows (scripts/precompute_sexenios_columna.py WHERE): CompraNet only, 0 < amount <= 100B, dated.
# ComprasMX (source_structure 'E') is left out here AND in the month's list (/contracts?column_rows=true) and its
# category split, so a month's cell, split and list count the same contracts. Constant SQL, no user input.
_COL_WHERE = COLUMN_ROWS_SQL
_CRIT = 0.60  # getRiskLevelFromScore «critical»
_MONTH = "CAST(substr(c.contract_date, 6, 2) AS INTEGER)"


def month_signals(conn: sqlite3.Connection, year: int) -> dict:
    """W7 risk months: per month the critical money (risk_score >= 0.60), the sector whose share of the month most
    exceeds its share of the year (lift in share points), and the month's largest critical contract; for the year,
    the largest supplier in its first year (vendor_stats.first_contract_year)."""
    cells = conn.execute(f"""
        SELECT {_MONTH} AS m, c.sector_id AS s, COUNT(*) AS n, SUM(c.amount_mxn) AS v,
               SUM(CASE WHEN c.risk_score >= {_CRIT} THEN c.amount_mxn ELSE 0 END) AS cv,
               SUM(CASE WHEN c.risk_score >= {_CRIT} THEN 1 ELSE 0 END) AS cn,
               SUM(CASE WHEN c.is_direct_award = 1 THEN c.amount_mxn ELSE 0 END) AS da
        FROM contracts c WHERE c.contract_year = ? AND {_COL_WHERE} GROUP BY m, s""", (year,)).fetchall()
    tops = {r[0]: r for r in conn.execute(f"""
        SELECT m, id, amount_mxn, title, vendor_id FROM (
          SELECT {_MONTH} AS m, c.id, c.amount_mxn, c.title, c.vendor_id,
                 ROW_NUMBER() OVER (PARTITION BY {_MONTH} ORDER BY c.amount_mxn DESC) AS k
          FROM contracts c WHERE c.contract_year = ? AND c.risk_score >= {_CRIT} AND {_COL_WHERE}) WHERE k = 1""", (year,))}
    year_v = sum(r[3] or 0 for r in cells)
    year_s: dict = {}
    for r in cells:
        year_s[r[1]] = year_s.get(r[1], 0) + (r[3] or 0)
    months = []
    for m in range(1, 13):
        rs = [r for r in cells if r[0] == m]
        v = sum(r[3] or 0 for r in rs)
        best = None
        for r in rs:
            if r[1] is None or not v or not year_v:
                continue
            share, base = (r[3] or 0) / v, year_s[r[1]] / year_v
            if best is None or share - base > best["lift"]:
                best = {"sector_id": r[1], "share": round(share, 4), "year_share": round(base, 4), "lift": round(share - base, 4)}
        top = None
        t = tops.get(m)
        if t:
            vr = conn.execute("SELECT id, name, is_individual, rfc FROM vendors WHERE id = ?", (t[4],)).fetchone() if t[4] else None
            top = {"id": t[1], "amount": round(t[2], 2), "title": t[3],
                   "vendor": {"id": vr[0], "name": clean_name(vr[1]), "persona_fisica": bool(is_named_persona(vr[2], vr[3], vr[1]))} if vr else None}
        months.append({
            "month": m, "contracts": sum(r[2] for r in rs), "value": round(v, 2),
            "crit_n": sum(r[5] or 0 for r in rs), "crit_value": round(sum(r[4] or 0 for r in rs), 2),
            "da_value": round(sum(r[6] or 0 for r in rs), 2), "top_sector": best, "top_crit": top,
        })
    crit_v = sum(x["crit_value"] for x in months)
    # the year's largest supplier whose first contract (vendor_stats) is this year — «Lo que destaca»
    nv = conn.execute(f"""
        SELECT c.vendor_id, SUM(c.amount_mxn) AS v, SUM(CASE WHEN c.risk_score >= {_CRIT} THEN 1 ELSE 0 END) AS cn
        FROM contracts c JOIN vendor_stats vs ON vs.vendor_id = c.vendor_id
        WHERE c.contract_year = ? AND vs.first_contract_year = ? AND {_COL_WHERE}
        GROUP BY c.vendor_id ORDER BY v DESC LIMIT 1""", (year, year)).fetchone()
    new_vendor = None
    if nv:
        vr = conn.execute("SELECT id, name, is_individual, rfc FROM vendors WHERE id = ?", (nv[0],)).fetchone()
        if vr:
            new_vendor = {"id": vr[0], "name": clean_name(vr[1]), "persona_fisica": bool(is_named_persona(vr[2], vr[3], vr[1])),
                          "value": round(nv[1], 2), "share": round(nv[1] / year_v, 4) if year_v else 0, "crit_n": nv[2]}
    return {"year": year, "value": round(year_v, 2), "contracts": sum(x["contracts"] for x in months),
            "crit_n": sum(x["crit_n"] for x in months), "crit_value": round(crit_v, 2),
            "crit_share": round(crit_v / year_v, 4) if year_v else None, "source": "compranet",
            "months": months, "new_vendor": new_vendor}


@router.get("/sexenios/month-signals")
def sexenios_month_signals(year: int = Query(..., ge=2002, le=2026), conn: sqlite3.Connection = Depends(get_db_dep)):
    """/administrations, an open year: 12 rows {month, value, crit_value, crit_n, da_value, top_sector{lift}, top_crit}."""
    hit = app_cache.get("sexenios_month_signals", str(year))
    if hit is not None:
        return hit
    out = shared(f"shared:sexenios/month-signals:{year}", 86400, lambda: month_signals(conn, year))  # all workers (owner 11-07 speed)
    app_cache.set("sexenios_month_signals", str(year), out, maxsize=32, ttl=86400)
    return out


@router.get("/sexenios/columna")
def sexenios_columna(conn: sqlite3.Connection = Depends(get_db_dep)):
    """«La columna» on /administrations: precomputed_stats['sexenios_columna'] (scripts/precompute_sexenios_columna.py)."""
    try:
        row = conn.execute("SELECT stat_value, updated_at FROM precomputed_stats WHERE stat_key = 'sexenios_columna'").fetchone()
    except sqlite3.OperationalError:
        row = None
    if not row:
        logger.error("precomputed_stats['sexenios_columna'] missing — run scripts/precompute_sexenios_columna.py")
        raise HTTPException(404, "The column has not been computed yet.")
    return {**json.loads(row[0]), "updated_at": row[1]}
