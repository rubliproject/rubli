"""
Migrate contracts.contract_year to the year of contract_date.

Why: contract_year was taken from the source FILE year for part of the
archive. 175,767 Structure-B rows from the 2010 file carry contract_year=2010
but a contract_date in 2011/2012 (320.6B MXN) -> fake 2010 spike, fake
2011-12 dip. This script realigns every row whose valid contract_date
(2002-01-01..2025-12-31) disagrees with contract_year. Rows with a NULL or
out-of-range date keep their contract_year (reported, not changed).

Also realigns the display-only year copies that are pure functions of the
year (sexenio_year, is_election_year) — only when they are consistent with
the old contract_year (see _derive). Model inputs (is_year_end,
contract_month, risk scores, z-features, factor_baselines, rolling stats)
are NOT touched; they are v0.9-retrain inputs.

Reversal: every changed row is recorded in `_mig_contract_year_backup`
(rowid, id, old/new values) and exported to CSV. `id` is NULL for ~8.3K
rows, so the rowid is the join key (valid until the next VACUUM).

Usage:
    python -m scripts.migrate_contract_year --db PATH [--dry-run] [--csv OUT]
    python -m scripts.migrate_contract_year --db PATH --rollback
"""
import argparse
import csv
import sqlite3
import time

DATE_YEAR = "CAST(strftime('%Y', contract_date) AS INTEGER)"
VALID_DATE = "strftime('%Y', contract_date) BETWEEN '2002' AND '2025'"
MISMATCH = f"{VALID_DATE} AND contract_year IS NOT {DATE_YEAR}"

BACKUP = "_mig_contract_year_backup"

# Observed derivations from contract_year (verified on a 1/1571 rowid sample):
# sexenio_year = ((year - 2000) % 6) + 1  (2006/2012/2018/2024 -> 1; NULL on some 2023-24 rows)
# is_election_year = 1 for federal election years (presidential + midterm).
ELECTION_YEARS = (2003, 2006, 2009, 2012, 2015, 2018, 2021, 2024)


def _sexenio_sql(col: str) -> str:
    return f"(({col} - 2000) % 6) + 1"


def _election_sql(col: str) -> str:
    return f"CASE WHEN {col} IN {ELECTION_YEARS} THEN 1 ELSE 0 END"


def profile(conn: sqlite3.Connection) -> list:
    rows = conn.execute(f"""
        SELECT source_structure, contract_year AS old_year, {DATE_YEAR} AS new_year,
               COUNT(*), ROUND(SUM(amount_mxn) / 1e9, 2)
        FROM contracts WHERE {MISMATCH}
        GROUP BY 1, 2, 3 ORDER BY 4 DESC
    """).fetchall()
    print("structure  old -> new   rows   value_B_MXN")
    for s, o, n, cnt, val in rows:
        print(f"  {s}   {o} -> {n}  {cnt:>8,}  {val:>10,.2f}")
    print(f"  TOTAL rows to change: {sum(r[3] for r in rows):,}")
    return rows


def migrate(db: str, dry_run: bool, csv_path: str | None) -> None:
    conn = sqlite3.connect(db, timeout=300)
    conn.execute("PRAGMA busy_timeout = 300000")
    t0 = time.time()

    nulls = conn.execute("""
        SELECT source_structure, contract_year, COUNT(*) FROM contracts
        WHERE contract_date IS NULL OR contract_date = ''
           OR strftime('%Y', contract_date) IS NULL
           OR strftime('%Y', contract_date) NOT BETWEEN '2002' AND '2025'
        GROUP BY 1, 2 ORDER BY 1, 2
    """).fetchall()
    print(f"rows kept as-is (NULL/invalid/out-of-range date): {sum(r[2] for r in nulls):,}")
    for s, y, cnt in nulls:
        print(f"  {s} {y}: {cnt:,}")

    rows = profile(conn)
    print(f"profile took {time.time() - t0:.0f}s")
    if dry_run or not rows:
        print("dry run — nothing written" if dry_run else "nothing to change (already migrated)")
        conn.close()
        return

    # Derived copies are re-derived row by row only where they still follow the
    # old contract_year (UPDATE RHS sees pre-update values); NULLs stay NULL.
    sets = [
        f"contract_year = {DATE_YEAR}",
        f"sexenio_year = CASE WHEN sexenio_year IS {_sexenio_sql('contract_year')} "
        f"THEN {_sexenio_sql(DATE_YEAR)} ELSE sexenio_year END",
        f"is_election_year = CASE WHEN is_election_year IS {_election_sql('contract_year')} "
        f"THEN {_election_sql(DATE_YEAR)} ELSE is_election_year END",
    ]

    try:
        conn.execute("BEGIN IMMEDIATE")
        conn.execute(f"""
            CREATE TABLE IF NOT EXISTS {BACKUP} (
                contract_rowid INTEGER NOT NULL, id INTEGER,
                old_year INTEGER, new_year INTEGER,
                old_sexenio_year INTEGER, old_is_election_year INTEGER,
                migrated_at TEXT DEFAULT (datetime('now'))
            )""")
        conn.execute(f"CREATE INDEX IF NOT EXISTS {BACKUP}_rowid ON {BACKUP}(contract_rowid, migrated_at)")
        n_backup = conn.execute(f"""
            INSERT INTO {BACKUP} (contract_rowid, id, old_year, new_year,
                                  old_sexenio_year, old_is_election_year)
            SELECT rowid, id, contract_year, {DATE_YEAR}, sexenio_year, is_election_year
            FROM contracts WHERE {MISMATCH}
        """).rowcount
        n_upd = conn.execute(
            f"UPDATE contracts SET {', '.join(sets)} WHERE {MISMATCH}"
        ).rowcount
        if n_upd != n_backup:
            raise RuntimeError(f"backup {n_backup} != updated {n_upd}")
        left = conn.execute(f"SELECT COUNT(*) FROM contracts WHERE {MISMATCH}").fetchone()[0]
        if left:
            raise RuntimeError(f"{left} mismatched rows remain")
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise
    print(f"updated {n_upd:,} rows (contract_year, sexenio_year, is_election_year) in {time.time() - t0:.0f}s")

    if csv_path:
        with open(csv_path, "w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            w.writerow(["contract_rowid", "id", "old_year", "new_year",
                        "old_sexenio_year", "old_is_election_year"])
            w.writerows(conn.execute(
                f"SELECT contract_rowid, id, old_year, new_year, old_sexenio_year, "
                f"old_is_election_year FROM {BACKUP} ORDER BY contract_rowid"))
        print(f"reversal CSV -> {csv_path}")
    conn.close()


def rollback(db: str) -> None:
    # Oldest backup row per contract wins (the pre-migration value).
    first = f"FROM {BACKUP} b WHERE b.contract_rowid = contracts.rowid ORDER BY b.migrated_at LIMIT 1"
    conn = sqlite3.connect(db, timeout=300)
    try:
        conn.execute("BEGIN IMMEDIATE")
        n = conn.execute(f"""
            UPDATE contracts SET
              contract_year    = (SELECT old_year {first}),
              sexenio_year     = (SELECT old_sexenio_year {first}),
              is_election_year = (SELECT old_is_election_year {first})
            WHERE rowid IN (SELECT contract_rowid FROM {BACKUP})
        """).rowcount
        conn.execute(f"DROP TABLE {BACKUP}")
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise
    print(f"rolled back {n:,} rows")
    conn.close()


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__.splitlines()[1])
    p.add_argument("--db", required=True)
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--rollback", action="store_true")
    p.add_argument("--csv", help="write reversal CSV here")
    a = p.parse_args()
    rollback(a.db) if a.rollback else migrate(a.db, a.dry_run, a.csv)
