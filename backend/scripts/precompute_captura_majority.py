"""Build captura_majority: per (canonical buyer, year) its largest supplier — /captura «La mitad» (F10).

Feeds GET /captura/majority and /captura/majority/{institution_id} (backend/api/routers/captura_v2.py).
The other side of /captura's «cautiva» (≥ 80 % of the COMPANY's income from one buyer): a buyer-year
has a «mayoría» when one company took ≥ 50 % of the BUYER's spend that year. Only buyer-years with
≥ 100 MDP of spend are stored (the floor that keeps one-contract buyers out); the share test is the
endpoint's, so every buyer-year ≥ 100 MDP keeps its top supplier (the dissection's «majority holder by year»).

  amounts: 0 < amount <= 100,000 MDP (contracts_canon drops the rest); CompraNet years 2002–2025, rows
  dated on/after the 2025-09-28 switch excluded (ComprasMX rows live in contracts as structure E).
  ids: canonical institution and vendor (institution_canonical / vendor_canonical).
One INSERT ... SELECT (no Python-side fetchall: the 1.5 GB prod backend OOM'd on that, 2026-10-26);
DELETE + INSERT commit together, so readers never see it empty. Personas físicas are stored as ids
only; the endpoint names and labels them, never with an RFC (api/public_labels.public_vendor_name).

    python -m scripts.precompute_captura_majority --db PATH                 # write into PATH
    python -m scripts.precompute_captura_majority --db SRC --out-db SIDE    # read SRC read-only, write SIDE
    python -m scripts.precompute_captura_majority --demo
"""
import argparse
import sqlite3
import time

try:
    from scripts._institution_canonical import install_contracts_canon
except ImportError:  # run as a plain file from backend/scripts
    from _institution_canonical import install_contracts_canon

FLOOR = 100_000_000          # a buyer-year counts when its spend >= 100 MDP
Y0, Y1, SWITCH = 2002, 2025, '2025-09-28'

DDL = """
CREATE TABLE IF NOT EXISTS captura_majority (
    institution_id INTEGER NOT NULL,
    year INTEGER NOT NULL,
    total REAL NOT NULL,       -- the buyer's spend that year
    top_m REAL NOT NULL,       -- its largest supplier's money that year
    vendor_id INTEGER NOT NULL,
    n_vendors INTEGER NOT NULL,
    PRIMARY KEY (institution_id, year)
) WITHOUT ROWID;
"""

FILL = f"""
INSERT INTO captura_majority
SELECT i, y, t, m, v, nv FROM (
  SELECT i, y, v, m, SUM(m) OVER w AS t, COUNT(*) OVER w AS nv,
         ROW_NUMBER() OVER (PARTITION BY i, y ORDER BY m DESC, v) AS rn
  FROM (SELECT institution_id AS i, contract_year AS y, vendor_id AS v, SUM(amount_mxn) AS m
        FROM contracts_canon
        WHERE amount_mxn > 0 AND institution_id IS NOT NULL AND vendor_id IS NOT NULL
          AND contract_year BETWEEN {Y0} AND {Y1} AND (contract_date IS NULL OR contract_date < '{SWITCH}')
        GROUP BY 1, 2, 3)
  WINDOW w AS (PARTITION BY i, y))
WHERE rn = 1 AND t >= {FLOOR}
"""


def build(conn: sqlite3.Connection) -> int:
    conn.executescript(DDL)
    install_contracts_canon(conn, vendors=True)
    conn.execute("BEGIN IMMEDIATE")
    try:
        conn.execute("DELETE FROM captura_majority")
        n = conn.execute(FILL).rowcount
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise
    return n


def _demo() -> None:
    c = sqlite3.connect(":memory:", isolation_level=None)
    c.executescript("""
        CREATE TABLE contracts (institution_id INTEGER, vendor_id INTEGER, amount_mxn REAL,
            contract_year INTEGER, contract_date TEXT);
        CREATE TABLE institution_canonical (institution_id INTEGER PRIMARY KEY, canonical_id INTEGER);
        CREATE TABLE vendor_canonical (vendor_id INTEGER PRIMARY KEY, canonical_id INTEGER);
        INSERT INTO institution_canonical VALUES (9, 9), (19, 9);
        INSERT INTO vendor_canonical VALUES (1, 1), (11, 1);
        INSERT INTO contracts VALUES
          (9, 1, 6e7, 2020, NULL), (19, 11, 1e7, 2020, NULL), (9, 2, 5e7, 2020, NULL),   -- 1 holds 70 of 120
          (9, 2, 2e11, 2021, NULL),                                                      -- > 100B: dropped
          (9, 3, 9e7, 2022, NULL),                                                       -- under the floor
          (9, 4, 3e8, 2025, '2025-10-01');                                               -- after the switch
    """)
    assert build(c) == 1
    assert build(c) == 1  # a rebuild replaces, never doubles
    rows = c.execute("SELECT * FROM captura_majority").fetchall()
    assert rows == [(9, 2020, 1.2e8, 7e7, 1, 2)], rows
    print("ok")


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--db", help="database with contracts (written into unless --out-db)")
    p.add_argument("--out-db", help="side DB to write captura_majority into; --db is then read-only")
    p.add_argument("--demo", action="store_true", help="run the self-check and exit")
    a = p.parse_args()
    if a.demo or not a.db:
        _demo()
        return
    t0 = time.time()
    if a.out_db:
        conn = sqlite3.connect(a.out_db, timeout=120, isolation_level=None, uri=True)
        conn.execute("ATTACH DATABASE ? AS src", (f"file:{a.db}?mode=ro",))
    else:
        conn = sqlite3.connect(a.db, timeout=120, isolation_level=None)
    n = build(conn)
    if not a.out_db:
        conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    print(f"captura_majority: {n:,} rows, {time.time() - t0:.1f}s -> {a.out_db or a.db}")


if __name__ == "__main__":
    main()
