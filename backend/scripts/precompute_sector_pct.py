"""Precompute `contract_sector_pct` (docs/BIAS_AUDIT_SECTOR_2026-11-09.md § 8 rec. 1): each scored contract's
PERCENT_RANK of risk_score within its own sector, served as `sector_pct` on GET /contracts/{id}.

    python -m scripts.precompute_sector_pct --db RUBLI_NORMALIZED.db         # local
    python -m scripts.precompute_sector_pct --db /app/data/RUBLI_DEPLOY.db   # prod, after the backend deploy

A side table, not a contracts column: no UPDATE over 3.1M wide rows. Built under a temp name and swapped in one
transaction, so readers never see it half-filled. Idempotent; RERUN AFTER EVERY RESCORE (docs/SCORING.md).
"""
import argparse
import sqlite3
import time

from api.sector_pct import TABLE

NEW = f"{TABLE}_new"


def build(conn: sqlite3.Connection) -> int:
    conn.isolation_level = None  # explicit transactions
    conn.execute(f"DROP TABLE IF EXISTS {NEW}")
    conn.execute(f"CREATE TABLE {NEW} (contract_id INTEGER PRIMARY KEY, sector_pct REAL NOT NULL)")
    conn.execute("BEGIN")
    # OR IGNORE: contracts.id is not a declared key; a duplicate id keeps its first rank
    conn.execute(f"""
        INSERT OR IGNORE INTO {NEW} (contract_id, sector_pct)
        SELECT id, PERCENT_RANK() OVER (PARTITION BY sector_id ORDER BY risk_score)
        FROM contracts
        WHERE risk_score IS NOT NULL AND sector_id IS NOT NULL AND id IS NOT NULL
    """)
    conn.execute(f"DROP TABLE IF EXISTS {TABLE}")
    conn.execute(f"ALTER TABLE {NEW} RENAME TO {TABLE}")
    conn.execute("COMMIT")
    return conn.execute(f"SELECT COUNT(*) FROM {TABLE}").fetchone()[0]


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", required=True)
    db = ap.parse_args().db
    t = time.time()
    conn = sqlite3.connect(db, timeout=300)
    conn.execute("PRAGMA busy_timeout=300000")
    print("wal_checkpoint:", conn.execute("PRAGMA wal_checkpoint(TRUNCATE)").fetchone())
    n = build(conn)
    conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    conn.close()
    print(f"{TABLE}: {n:,} contracts ranked within their sector on {db} in {time.time() - t:.1f} s")
