"""Sector-relative percentile (docs/BIAS_AUDIT_SECTOR_2026-11-09.md § 8 rec. 1).

`sector_pct` = PERCENT_RANK of the risk score within the record's own sector: 0 = lowest of its sector,
1 = highest. Contracts read it from `contract_sector_pct` (scripts/precompute_sector_pct.py, rerun after every
rescore); vendors compute it live from the cached vendor_stats peer distribution. None when unknown.
"""
import sqlite3
from bisect import bisect_left
from typing import Optional, Sequence

TABLE = "contract_sector_pct"


def contract_sector_pct(conn: sqlite3.Connection, contract_id: int) -> Optional[float]:
    if conn.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (TABLE,)).fetchone() is None:
        return None  # prod before the job ran
    row = conn.execute(f"SELECT sector_pct FROM {TABLE} WHERE contract_id = ?", (contract_id,)).fetchone()
    return None if row is None else row[0]


def pct_rank(sorted_values: Sequence[float], v: float) -> Optional[float]:
    """SQL PERCENT_RANK over a sorted sequence: (values strictly below v) / (n - 1)."""
    n = len(sorted_values)
    if n == 0:
        return None
    return 0.0 if n == 1 else min(1.0, bisect_left(sorted_values, v) / (n - 1))
