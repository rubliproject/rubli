"""
Compute category statistics from contracts.category_id.

Creates/replaces:
  - category_stats: aggregate stats per category
  - category_yearly_stats: per-category per-year trends

Run from backend/ directory:
    python -m scripts.compute_category_stats
"""
import os
import sqlite3
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # the chain runs it as a plain file
from api.config.constants import DATA_LAST_YEAR, PUBLIC_REGISTER_SQL  # noqa: E402
import os as _os, sys as _sys  # noqa: E401
_sys.path.insert(0, _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__))))  # backend/ → api.* (also for `python scripts/x.py`)
from api.config.constants import proc_den, proc_known  # noqa: E402  DQ1 § 2

DB_PATH = Path(os.environ.get("DATABASE_PATH") or Path(__file__).parent.parent / "RUBLI_NORMALIZED.db")
# Same rows as the headline register (overview / /contracts): the shelves sum to it, never past it.
REGISTER_C = PUBLIC_REGISTER_SQL.replace("contract_year", "c.contract_year").replace("amount_mxn", "c.amount_mxn")


def compute_category_stats():
    print("=" * 60)
    print("COMPUTING CATEGORY STATISTICS")
    print("=" * 60)

    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA busy_timeout = 60000")
    conn.execute("PRAGMA journal_mode = WAL")
    cur = conn.cursor()
    # One transaction: the DROP + rebuild either lands whole or not at all
    # (the live /categories page reads this table).
    cur.execute("BEGIN IMMEDIATE")
    try:
        _build_category_stats(cur, t0 := time.time())
        compute_category_yearly_stats(conn, commit=False)
        conn.commit()
    except BaseException:
        conn.rollback()
        conn.close()
        raise

    # Summary
    cur.execute("SELECT COUNT(*) FROM category_stats WHERE total_contracts > 0")
    active = cur.fetchone()[0]
    cur.execute("SELECT SUM(total_contracts) FROM category_stats")
    total = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM category_yearly_stats")
    yearly_rows = cur.fetchone()[0]

    print(f"\n{'='*60}")
    print(f"DONE: {active} active categories, {total:,} categorized contracts")
    print(f"      {yearly_rows} yearly stat rows")
    print(f"      Total time: {time.time() - t0:.1f}s")
    print(f"{'='*60}")

    conn.close()


def _build_category_stats(cur, t0):
    # 1. Aggregate stats per category
    print("\n1. Computing category_stats...")

    cur.execute("DROP TABLE IF EXISTS category_stats")
    cur.execute("""
        CREATE TABLE category_stats (
            category_id INTEGER PRIMARY KEY,
            category_name TEXT NOT NULL,
            category_name_en TEXT,
            sector_id INTEGER,
            total_contracts INTEGER NOT NULL DEFAULT 0,
            total_value REAL NOT NULL DEFAULT 0.0,
            avg_risk REAL DEFAULT 0.0,
            high_risk_pct REAL DEFAULT 0.0,
            direct_award_pct REAL DEFAULT 0.0,
            single_bid_pct REAL DEFAULT 0.0,
            top_vendor_id INTEGER,
            top_vendor_name TEXT,
            top_institution_id INTEGER,
            top_institution_name TEXT
        )
    """)

    # Base stats per category
    cur.execute(f"""
        INSERT INTO category_stats (
            category_id, category_name, category_name_en, sector_id,
            total_contracts, total_value, avg_risk, high_risk_pct,
            direct_award_pct, single_bid_pct
        )
        SELECT
            cat.id,
            cat.name_es,
            cat.name_en,
            cat.sector_id,
            COUNT(c.id) as total_contracts,
            COALESCE(SUM(c.amount_mxn), 0) as total_value,
            COALESCE(AVG(c.risk_score), 0) as avg_risk,
            -- over scored contracts (ComprasMX loads unscored, risk_score NULL)
            CASE WHEN COUNT(c.risk_score) > 0
                 THEN ROUND(SUM(CASE WHEN c.risk_level IN ('high', 'critical') THEN 1.0 ELSE 0 END) / COUNT(c.risk_score) * 100, 1)
                 ELSE 0 END as high_risk_pct,
            CASE WHEN COUNT(c.id) > 0
                 THEN ROUND(SUM(CASE WHEN {proc_known('c.is_direct_award', 'c.contract_year')} = 1 THEN 1.0 ELSE 0 END) / {proc_den('c.is_direct_award', 'c.contract_year')} * 100, 1)
                 ELSE 0 END as direct_award_pct,
            CASE WHEN COUNT(c.id) > 0
                 THEN ROUND(SUM(CASE WHEN {proc_known('c.is_single_bid', 'c.contract_year')} = 1 THEN 1.0 ELSE 0 END) / {proc_den('c.is_single_bid', 'c.contract_year')} * 100, 1)
                 ELSE 0 END as single_bid_pct
        FROM categories cat
        LEFT JOIN contracts c ON c.category_id = cat.id
            AND {REGISTER_C}
        WHERE cat.is_active = 1
        GROUP BY cat.id
    """)
    print(f"   Base stats inserted in {time.time() - t0:.1f}s")

    # Top vendor per category
    t1 = time.time()
    cur.execute(f"""
        WITH ranked AS (
            SELECT
                c.category_id,
                c.vendor_id,
                v.name as vendor_name,
                COALESCE(SUM(c.amount_mxn), 0) as total_value,
                ROW_NUMBER() OVER (
                    PARTITION BY c.category_id
                    ORDER BY COALESCE(SUM(c.amount_mxn), 0) DESC, COUNT(*) DESC
                ) as rn
            FROM contracts c
            JOIN vendors v ON v.id = c.vendor_id
            WHERE c.category_id IS NOT NULL
              AND c.vendor_id IS NOT NULL
              AND {REGISTER_C}
            GROUP BY c.category_id, c.vendor_id
        )
        UPDATE category_stats
        SET top_vendor_id = ranked.vendor_id,
            top_vendor_name = ranked.vendor_name
        FROM ranked
        WHERE category_stats.category_id = ranked.category_id
          AND ranked.rn = 1
    """)
    print(f"   Top vendors updated in {time.time() - t1:.1f}s")

    # Top institution per category
    t2 = time.time()
    cur.execute(f"""
        WITH ranked AS (
            SELECT
                c.category_id,
                c.institution_id,
                i.name as inst_name,
                COALESCE(SUM(c.amount_mxn), 0) as total_value,
                ROW_NUMBER() OVER (
                    PARTITION BY c.category_id
                    ORDER BY COALESCE(SUM(c.amount_mxn), 0) DESC, COUNT(*) DESC
                ) as rn
            FROM contracts c
            JOIN institutions i ON i.id = c.institution_id
            WHERE c.category_id IS NOT NULL
              AND c.institution_id IS NOT NULL
              AND {REGISTER_C}
            GROUP BY c.category_id, c.institution_id
        )
        UPDATE category_stats
        SET top_institution_id = ranked.institution_id,
            top_institution_name = ranked.inst_name
        FROM ranked
        WHERE category_stats.category_id = ranked.category_id
          AND ranked.rn = 1
    """)
    print(f"   Top institutions updated in {time.time() - t2:.1f}s")


def compute_category_yearly_stats(conn, commit=True):
    """category_yearly_stats only — safe to re-run alone (e.g. after a
    contract_year fix) without wiping category_stats columns added by
    _precompute_category_cohort_counts / _refresh_category_avg_risk /
    _fix_category_accents."""
    cur = conn.cursor()
    print("\n2. Computing category_yearly_stats...")
    t3 = time.time()

    cur.execute("DROP TABLE IF EXISTS category_yearly_stats")
    cur.execute("""
        CREATE TABLE category_yearly_stats (
            category_id INTEGER NOT NULL,
            year INTEGER NOT NULL,
            contracts INTEGER NOT NULL DEFAULT 0,
            value REAL NOT NULL DEFAULT 0.0,
            avg_risk REAL DEFAULT 0.0,
            PRIMARY KEY (category_id, year)
        )
    """)

    cur.execute(f"""
        INSERT INTO category_yearly_stats (category_id, year, contracts, value, avg_risk)
        SELECT
            c.category_id,
            c.contract_year,
            COUNT(*) as contracts,
            COALESCE(SUM(c.amount_mxn), 0) as value,
            COALESCE(AVG(c.risk_score), 0) as avg_risk
        FROM contracts c
        WHERE c.category_id IS NOT NULL
          AND c.contract_year BETWEEN 2002 AND ?
          AND {REGISTER_C}
        GROUP BY c.category_id, c.contract_year
    """, (DATA_LAST_YEAR,))
    if commit:
        conn.commit()
    print(f"   Yearly stats computed in {time.time() - t3:.1f}s")


if __name__ == "__main__":
    import sys
    if "--yearly-only" in sys.argv:
        _conn = sqlite3.connect(str(DB_PATH))
        _conn.execute("PRAGMA busy_timeout = 60000")
        compute_category_yearly_stats(_conn)
        _conn.close()
    else:
        compute_category_stats()
