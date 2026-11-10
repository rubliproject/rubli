#!/usr/bin/env python3
"""
Refresh institution_stats and vendor_stats from current contracts table.

Run after any risk scoring run to sync derived stats with actual contract scores.
Uses risk_level column (pre-computed) for high-risk counts, and
recalculates all aggregate metrics from scratch.

High-risk thresholds (v6.x): critical >= 0.60, high >= 0.40
high_risk_pct = 100 * (critical + high) / scored contracts → stored as 0-100. Unscored rows
(risk_score NULL: ComprasMX until a model passes) stay out of avg_risk_score and of the
high_risk_pct denominator; an entity with no scored contract gets NULL for both.

Both tables are keyed by canonical ids and count the other dimension's canonical ids
(institution_stats.vendor_count, vendor_stats.institution_count).

--out-db OUT (counts only): copies today's institution_stats and vendor_stats into OUT
and recomputes just vendor_count / institution_count by canonical ids; every other
column is today's value. --db is only read (scripts/_out_db.py); swap with
scripts/swap_tables.py.
"""

import sqlite3
import logging
from pathlib import Path
import os
import os as _os, sys as _sys  # noqa: E401
_sys.path.insert(0, _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__))))  # backend/ → api.* (also for `python scripts/x.py`)
from api.config.constants import proc_den, proc_known  # noqa: E402  DQ1 § 2

try:
    from scripts._institution_canonical import install_contracts_canon, delete_absorbed_rows
    from scripts import _vendor_canonical as vcanon
    from scripts._out_db import open_db
except ImportError:  # run as a plain file from backend/scripts
    from _institution_canonical import install_contracts_canon, delete_absorbed_rows
    import _vendor_canonical as vcanon
    from _out_db import open_db

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

DB_PATH = Path(os.environ.get("DATABASE_PATH", str(Path(__file__).parent.parent / "RUBLI_NORMALIZED.db")))


def refresh_institution_stats(conn: sqlite3.Connection) -> None:
    log.info("Refreshing institution_stats from current contracts …")
    conn.execute("PRAGMA synchronous = OFF")

    # Canonical ids (scripts/migrate_institutions.py): absorbed ids fold into their
    # canonical row; the upsert also creates a row for a canonical id that had none.
    install_contracts_canon(conn, vendors=True)
    conn.execute(f"""
        INSERT INTO institution_stats (
            institution_id, total_contracts, total_value_mxn, avg_risk_score,
            high_risk_count, high_risk_pct, direct_award_count, direct_award_pct,
            single_bid_count, single_bid_pct, vendor_count,
            first_contract_year, last_contract_year, updated_at)
        SELECT s.*, CURRENT_TIMESTAMP
        FROM (
            SELECT
                institution_id,
                COUNT(*)                                                                 AS tc,
                SUM(COALESCE(amount_mxn, 0))                                             AS tv,
                AVG(risk_score)                                                          AS avg_r,
                SUM(CASE WHEN risk_level IN ('high','critical') THEN 1 ELSE 0 END)       AS hrc,
                ROUND(100.0 * SUM(CASE WHEN risk_level IN ('high','critical') THEN 1 ELSE 0 END) / NULLIF(COUNT(risk_score), 0), 2) AS hrp,
                SUM(CASE WHEN is_direct_award = 1 THEN 1 ELSE 0 END)                    AS dac,
                ROUND(100.0 * SUM(CASE WHEN {proc_known('is_direct_award')} = 1 THEN 1 ELSE 0 END) / {proc_den('is_direct_award')}, 2) AS dap,
                SUM(CASE WHEN is_single_bid = 1 THEN 1 ELSE 0 END)                      AS sbc,
                ROUND(100.0 * SUM(CASE WHEN {proc_known('is_single_bid')} = 1 THEN 1 ELSE 0 END) / {proc_den('is_single_bid')}, 2)  AS sbp,
                COUNT(DISTINCT vendor_id)                                                AS vc,
                MIN(CAST(strftime('%Y', contract_date) AS INTEGER))                      AS fcy,
                MAX(CAST(strftime('%Y', contract_date) AS INTEGER))                      AS lcy
            FROM contracts_canon
            WHERE institution_id IS NOT NULL
            GROUP BY institution_id
        ) s
        WHERE true
        ON CONFLICT(institution_id) DO UPDATE SET
            total_contracts    = excluded.total_contracts,
            total_value_mxn    = excluded.total_value_mxn,
            avg_risk_score     = excluded.avg_risk_score,
            high_risk_count    = excluded.high_risk_count,
            high_risk_pct      = excluded.high_risk_pct,
            direct_award_count = excluded.direct_award_count,
            direct_award_pct   = excluded.direct_award_pct,
            single_bid_count   = excluded.single_bid_count,
            single_bid_pct     = excluded.single_bid_pct,
            vendor_count       = excluded.vendor_count,
            first_contract_year = excluded.first_contract_year,
            last_contract_year  = excluded.last_contract_year,
            updated_at         = CURRENT_TIMESTAMP
    """)
    affected = conn.execute("SELECT changes()").fetchone()[0]
    dropped = delete_absorbed_rows(conn, "institution_stats")
    conn.commit()
    log.info("  %d absorbed-id rows dropped", dropped)

    total = conn.execute("SELECT COUNT(*) FROM institution_stats").fetchone()[0]
    log.info("  institution_stats refreshed: %d rows updated, %d total", affected, total)


def refresh_vendor_stats(conn: sqlite3.Connection) -> None:
    log.info("Refreshing vendor_stats from current contracts …")

    # Canonical ids (scripts/migrate_vendors.py): absorbed ids fold into their
    # canonical row; the upsert also creates a row for a canonical id that had none.
    install_contracts_canon(conn, vendors=True)
    conn.execute(f"""
        INSERT INTO vendor_stats (
            vendor_id, total_contracts, total_value_mxn, avg_risk_score,
            high_risk_pct, direct_award_pct, single_bid_pct, sector_count,
            institution_count, first_contract_year, last_contract_year, updated_at)
        SELECT s.*, CURRENT_TIMESTAMP
        FROM (
            SELECT
                vendor_id,
                COUNT(*)                                                                          AS tc,
                SUM(COALESCE(amount_mxn, 0))                                                      AS tv,
                AVG(risk_score)                                                                   AS avg_r,
                ROUND(100.0 * SUM(CASE WHEN risk_level IN ('high','critical') THEN 1 ELSE 0 END) / NULLIF(COUNT(risk_score), 0), 2) AS hrp,
                ROUND(100.0 * SUM(CASE WHEN {proc_known('is_direct_award')} = 1 THEN 1 ELSE 0 END) / {proc_den('is_direct_award')}, 2) AS dap,
                ROUND(100.0 * SUM(CASE WHEN {proc_known('is_single_bid')} = 1 THEN 1 ELSE 0 END) / {proc_den('is_single_bid')}, 2)   AS sbp,
                COUNT(DISTINCT sector_id)                                                          AS sc,
                COUNT(DISTINCT institution_id)                                                     AS ic,
                MIN(CAST(strftime('%Y', contract_date) AS INTEGER))                                AS fcy,
                MAX(CAST(strftime('%Y', contract_date) AS INTEGER))                                AS lcy
            FROM contracts_canon
            WHERE vendor_id IS NOT NULL
            GROUP BY vendor_id
        ) s
        WHERE true
        ON CONFLICT(vendor_id) DO UPDATE SET
            total_contracts     = excluded.total_contracts,
            total_value_mxn     = excluded.total_value_mxn,
            avg_risk_score      = excluded.avg_risk_score,
            high_risk_pct       = excluded.high_risk_pct,
            direct_award_pct    = excluded.direct_award_pct,
            single_bid_pct      = excluded.single_bid_pct,
            sector_count        = excluded.sector_count,
            institution_count   = excluded.institution_count,
            first_contract_year = excluded.first_contract_year,
            last_contract_year  = excluded.last_contract_year,
            updated_at          = CURRENT_TIMESTAMP
    """)
    affected = conn.execute("SELECT changes()").fetchone()[0]
    dropped = vcanon.delete_absorbed_rows(conn, "vendor_stats")
    # vendors.* totals feed /vendors/top and rankings: every row with a vendor_stats row
    # (canonical rows carry the group, singletons their own) — else a rescore leaves them stale
    # (docs/SCORING.md § Display score). Absorbed rows have no vendor_stats row.
    synced = conn.execute("""
        UPDATE vendors SET
            total_contracts  = vs.total_contracts,
            total_amount_mxn = vs.total_value_mxn,
            avg_risk_score   = vs.avg_risk_score
        FROM vendor_stats vs
        WHERE vs.vendor_id = vendors.id
    """).rowcount if conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'vendors'").fetchone() else 0
    conn.commit()
    log.info("  %d absorbed-id rows dropped, %d vendors rows synced", dropped, synced)

    total = conn.execute("SELECT COUNT(*) FROM vendor_stats").fetchone()[0]
    log.info("  vendor_stats refreshed: %d rows updated, %d total", affected, total)


COUNT_COLS = [  # (table, key, cross-dimension count column, counted id)
    ("institution_stats", "institution_id", "vendor_count", "vendor_id"),
    ("vendor_stats", "vendor_id", "institution_count", "institution_id"),
]


def refresh_counts_out_db(conn: sqlite3.Connection) -> None:
    install_contracts_canon(conn, vendors=True)
    for table, key, col, other in COUNT_COLS:
        conn.execute(f"INSERT INTO main.{table} SELECT * FROM src.{table}")
        changed = conn.execute(f"""
            UPDATE main.{table} SET {col} = a.n
            FROM (SELECT {key} AS k, COUNT(DISTINCT {other}) AS n
                  FROM contracts_canon WHERE {key} IS NOT NULL GROUP BY {key}) a
            WHERE a.k = {table}.{key} AND {table}.{col} IS NOT a.n
        """).rowcount
        conn.commit()
        log.info("  %s.%s: %d rows changed", table, col, changed)


def main() -> None:
    import argparse
    p = argparse.ArgumentParser(description="Refresh institution_stats and vendor_stats from contracts")
    p.add_argument("--institutions-only", action="store_true")
    p.add_argument("--vendors-only",      action="store_true")
    p.add_argument("--db",                default=str(DB_PATH))
    p.add_argument("--out-db",            default=None, help="counts-only rebuild into this DB; --db is only read")
    args = p.parse_args()

    if args.out_db:
        conn = open_db(args.db, args.out_db, [t for t, *_ in COUNT_COLS])
        refresh_counts_out_db(conn)
        conn.close()
        log.info("Done.")
        return

    conn = sqlite3.connect(args.db, timeout=120)
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA busy_timeout = 60000")

    if not args.vendors_only:
        refresh_institution_stats(conn)

    if not args.institutions_only:
        refresh_vendor_stats(conn)

    conn.close()
    log.info("Done.")


if __name__ == "__main__":
    main()
