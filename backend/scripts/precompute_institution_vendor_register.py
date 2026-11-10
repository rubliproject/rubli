"""Build institution_vendor_register: EVERY (institution, vendor) pair, ranked by spend.

institution_top_vendors keeps only the top 50 per institution BY CONTRACT COUNT, so
El Mapa's Z2 register (sorted by spend) missed big low-count suppliers (IMSS: a 3.05B
supplier sat outside the stored 50 while row 50 was 29.8M) and paging past 50 fell
into a live GROUP BY that timed out at IMSS scale. This table holds all ~630K pairs
(no rfc — PII never leaves vendors), keyed by canonical institution and vendor ids,
with the Z2 flag counts at rest. Other readers of institution_top_vendors are untouched.

    python -m scripts.precompute_institution_vendor_register --db PATH
"""
import argparse
import sqlite3
import time
from datetime import datetime, timezone

try:
    from scripts._institution_canonical import install_contracts_canon
except ImportError:  # run as a plain file from backend/scripts
    from _institution_canonical import install_contracts_canon

MAX_CONTRACT_VALUE = 100_000_000_000  # 100B MXN — reject above (data-validation rule)

DDL = """
CREATE TABLE IF NOT EXISTS institution_vendor_register (
    institution_id INTEGER NOT NULL,
    vendor_id INTEGER NOT NULL,
    vendor_name TEXT,
    contract_count INTEGER,
    total_value_mxn REAL,
    avg_risk_score REAL,
    first_year INTEGER,
    last_year INTEGER,
    rank_by_value INTEGER,
    hr_count INTEGER, da_count INTEGER, sb_count INTEGER,
    computed_at TEXT,
    PRIMARY KEY (institution_id, vendor_id)
);
CREATE INDEX IF NOT EXISTS idx_ivr_inst_rank ON institution_vendor_register(institution_id, rank_by_value);
"""

FILL = """
CREATE TEMP TABLE _ivr AS
SELECT institution_id, vendor_id, vendor_name, n, tv, ar, fy, ly,
       ROW_NUMBER() OVER (PARTITION BY institution_id ORDER BY tv DESC, n DESC, vendor_id) AS rk,
       hr, da, sb
FROM (
    SELECT c.institution_id, c.vendor_id, v.name AS vendor_name,
           COUNT(*) AS n, SUM(COALESCE(c.amount_mxn, 0)) AS tv, AVG(c.risk_score) AS ar,
           MIN(c.contract_year) AS fy, MAX(c.contract_year) AS ly,
           SUM(CASE WHEN c.risk_score >= 0.40 THEN 1 ELSE 0 END) AS hr,
           SUM(CASE WHEN c.is_direct_award = 1 THEN 1 ELSE 0 END) AS da,
           SUM(CASE WHEN c.is_single_bid = 1 THEN 1 ELSE 0 END) AS sb
    FROM contracts_canon c
    JOIN vendors v ON v.id = c.vendor_id
    WHERE c.institution_id IS NOT NULL
      AND COALESCE(c.amount_mxn, 0) <= ?
    GROUP BY c.institution_id, c.vendor_id
)
"""


def build(conn: sqlite3.Connection) -> int:
    conn.executescript(DDL)
    install_contracts_canon(conn, vendors=True)
    conn.execute("DROP TABLE IF EXISTS temp._ivr")
    conn.execute(FILL, (MAX_CONTRACT_VALUE,))  # the slow read happens before any write lock
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    conn.execute("BEGIN IMMEDIATE")
    try:
        conn.execute("DELETE FROM institution_vendor_register")
        n = conn.execute(
            "INSERT INTO institution_vendor_register SELECT institution_id, vendor_id, vendor_name, "
            "n, tv, ar, fy, ly, rk, hr, da, sb, ? FROM temp._ivr", (now,)).rowcount
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise
    conn.execute("DROP TABLE temp._ivr")
    return n


def _demo() -> None:
    c = sqlite3.connect(":memory:")
    c.executescript("""
        CREATE TABLE vendors (id INTEGER, name TEXT);
        CREATE TABLE contracts (institution_id INTEGER, vendor_id INTEGER, amount_mxn REAL,
            risk_score REAL, contract_year INTEGER, is_direct_award INTEGER, is_single_bid INTEGER);
        INSERT INTO vendors VALUES (1,'many small'),(2,'one big'),(3,'decimal error');
        INSERT INTO contracts VALUES (9,1,10,0.1,2020,1,0),(9,1,10,0.5,2021,1,0),(9,1,10,0.1,2022,0,1),
                                     (9,2,3e9,0.7,2019,0,0),(9,3,2e11,0.9,2019,1,0);""")
    assert build(c) == 2  # the >100B row is rejected
    rows = c.execute("SELECT vendor_id, rank_by_value, contract_count, hr_count, da_count, sb_count "
                     "FROM institution_vendor_register ORDER BY rank_by_value").fetchall()
    assert rows == [(2, 1, 1, 1, 0, 0), (1, 2, 3, 1, 2, 1)], rows  # spend rank, not count rank
    print("ok")


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--db", help="database to write institution_vendor_register into")
    p.add_argument("--demo", action="store_true", help="run the self-check and exit")
    a = p.parse_args()
    if a.demo or not a.db:
        _demo()
        return
    t0 = time.time()
    conn = sqlite3.connect(a.db, timeout=120, isolation_level=None)
    n = build(conn)
    conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    print(f"institution_vendor_register: {n:,} rows, {time.time() - t0:.1f}s -> {a.db}")


if __name__ == "__main__":
    main()
