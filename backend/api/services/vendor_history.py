"""«Historial insuficiente» — how much vendor history the risk indicator saw (house fix F3).

The v0.9.2 features look only at the vendor's contracts in strictly earlier years (canonical
group, _v10/build_v10.py `n_prior_contracts`). With fewer than MIN_PRIOR_CONTRACTS of them the
indicator can barely rise: 0.29 % of those contracts read high, against ~12 % of the rest
(_explore/investigation_desk_2026-10-28/06_biases.md § H1). A low reading there means «no
data», not «low risk», so the UI prints «Historial insuficiente» instead. Scores are untouched.
"""
from __future__ import annotations

import sqlite3

from ..cache import app_cache
from . import vendor_canonical as vcanon

MIN_PRIOR_CONTRACTS = 3
CACHE = "thin_history"
_TTL = 3600


def _ids(conn: sqlite3.Connection, vendor_id: int) -> list[int]:
    return vcanon.group_ids(conn, vcanon.canonical_id(conn, vendor_id))


def contract_thin_history(conn: sqlite3.Connection, vendor_id: int | None, year: int | None) -> bool | None:
    """True when the vendor had < 3 contracts before `year`; None when either is unknown."""
    if vendor_id is None or year is None:
        return None
    key = f"c:{vendor_id}:{year}"
    hit = app_cache.get(CACHE, key)
    if hit is not None:
        return hit
    ids = _ids(conn, vendor_id)
    marks = ",".join("?" * len(ids))
    # LIMIT inside: stop counting at the threshold (idx_c_vendor_year), whatever the vendor's size.
    n = conn.execute(
        f"SELECT COUNT(*) FROM (SELECT 1 FROM contracts WHERE vendor_id IN ({marks}) AND contract_year < ? LIMIT ?)",
        (*ids, year, MIN_PRIOR_CONTRACTS),
    ).fetchone()[0]
    out = n < MIN_PRIOR_CONTRACTS
    app_cache.set(CACHE, key, out, maxsize=50_000, ttl=_TTL)
    return out


def vendor_thin_history(conn: sqlite3.Connection, vendor_id: int) -> bool | None:
    """True when most of the vendor's contracts were scored with < 3 prior contracts
    (its average indicator is then mostly a no-history reading); None without contracts."""
    key = f"v:{vendor_id}"
    hit = app_cache.get(CACHE, key)
    if hit is not None:
        return hit
    ids = _ids(conn, vendor_id)
    marks = ",".join("?" * len(ids))
    per_year = conn.execute(
        f"SELECT contract_year, COUNT(*) FROM contracts WHERE vendor_id IN ({marks}) AND contract_year IS NOT NULL "
        "GROUP BY contract_year ORDER BY contract_year",
        ids,
    ).fetchall()
    total = sum(n for _, n in per_year)
    if not total:
        return None
    prior = thin = 0
    for _, n in per_year:
        if prior < MIN_PRIOR_CONTRACTS:
            thin += n
        prior += n
    out = thin * 2 >= total
    app_cache.set(CACHE, key, out, maxsize=50_000, ttl=_TTL)
    return out


def stamp_contract_rows(conn: sqlite3.Connection, rows: list[dict]) -> None:
    """Set `thin_history` on each contract dict (list endpoints; ≤ 100 rows, cached per vendor-year)."""
    for r in rows:
        r["thin_history"] = contract_thin_history(conn, r.get("vendor_id"), r.get("contract_year"))
