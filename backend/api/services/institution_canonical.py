"""Canonical institution identity (backend/scripts/migrate_institutions.py).

The ETL minted one institution id per name spelling and CompraNet era; the
institution_canonical table maps every id to the surviving canonical_id.
Precomputed tables (institution_stats & co.) are keyed by canonical id only.
On a DB without the table (pre-migration, test fixtures) every id is canonical.
"""
from __future__ import annotations

import sqlite3

ABSORBED_IDS_SQL = "SELECT institution_id FROM institution_canonical WHERE canonical_id <> institution_id"


def has_canonical(conn: sqlite3.Connection) -> bool:
    return conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'institution_canonical'"
    ).fetchone() is not None


def canonical_id(conn: sqlite3.Connection, institution_id: int) -> int:
    if not has_canonical(conn):
        return institution_id
    row = conn.execute(
        "SELECT canonical_id FROM institution_canonical WHERE institution_id = ?", (institution_id,)
    ).fetchone()
    return row[0] if row else institution_id


def group_ids(conn: sqlite3.Connection, canonical: int) -> list[int]:
    """Every raw institution id whose contracts belong to this canonical id."""
    if not has_canonical(conn):
        return [canonical]
    ids = [r[0] for r in conn.execute(
        "SELECT institution_id FROM institution_canonical WHERE canonical_id = ?", (canonical,))]
    return ids or [canonical]


def canonical_expr(conn: sqlite3.Connection, col: str) -> str:
    """SQL expression mapping an institution-id column to its canonical id."""
    if not has_canonical(conn):
        return col
    return f"COALESCE((SELECT canonical_id FROM institution_canonical WHERE institution_id = {col}), {col})"


def not_absorbed(conn: sqlite3.Connection, col: str) -> str:
    """SQL predicate: the id is canonical (absorbed ids are hidden from lists)."""
    return f"{col} NOT IN ({ABSORBED_IDS_SQL})" if has_canonical(conn) else "1 = 1"


# Buyer scope (scripts/classify_buyer_scope.py, docs/PLAN_INSTITUTION_SCOPE_2026-10-22.md):
# every page answers about federal buyers unless asked otherwise. Every id of a
# canonical group carries its group's buyer_level, so raw and canonical ids both work.
SCOPES: dict[str, tuple[str, ...] | None] = {
    "federal": ("federal",),
    "local": ("estatal", "municipal"),
    "estatal": ("estatal",),
    "municipal": ("municipal",),
    "all": None,
}


def parse_scope(value: str | None) -> str:
    """Unknown / absent -> 'federal' (the default every response states)."""
    return value if value in SCOPES else "federal"


def has_buyer_scope(conn: sqlite3.Connection) -> bool:
    return has_canonical(conn) and any(
        r[1] == "buyer_level" for r in conn.execute("PRAGMA table_info(institution_canonical)"))


def scope_predicate(conn: sqlite3.Connection, scope: str | None, col: str) -> tuple[str, list, str]:
    """(SQL predicate on an institution-id column, params, effective scope).
    On a DB without buyer_level the predicate is a no-op and the scope reads 'all'."""
    levels = SCOPES[parse_scope(scope)]
    if levels is None or not has_buyer_scope(conn):
        return "1 = 1", [], "all"
    marks = ", ".join("?" * len(levels))
    return (f"{col} IN (SELECT institution_id FROM institution_canonical WHERE buyer_level IN ({marks}))",
            list(levels), parse_scope(scope))


def buyer_levels(conn: sqlite3.Connection) -> dict[int, str]:
    """institution id (raw or canonical) -> buyer_level; empty without the column."""
    if not has_buyer_scope(conn):
        return {}
    return dict(conn.execute("SELECT institution_id, buyer_level FROM institution_canonical"))
