"""precompute_stats pattern counts read v0.9.2's as-of features (contract_features_v10).

contract_z_features was v0.9.1's look-ahead table; prod no longer has it, so counts read from
it failed silently and the old values stayed in precomputed_stats. Pins: same z thresholds on
contract_features_v10, and None (→ the key is dropped) when the table is absent.
"""
import sqlite3

import pytest

from scripts.precompute_stats import z_pattern_counts

pytestmark = pytest.mark.no_db


def _db(with_v10: bool) -> sqlite3.Cursor:
    c = sqlite3.connect(":memory:").cursor()
    c.execute("CREATE TABLE contract_z_features (contract_id INTEGER, z_same_day_count REAL, z_price_ratio REAL)")
    c.executemany("INSERT INTO contract_z_features VALUES (?, ?, ?)", [(i, 9.0, 9.0) for i in range(5)])  # stale, must be ignored
    if with_v10:
        c.execute("CREATE TABLE contract_features_v10 (contract_id INTEGER PRIMARY KEY, z_same_day_count REAL, z_price_ratio REAL)")
        c.executemany("INSERT INTO contract_features_v10 VALUES (?, ?, ?)", [
            (1, 1.5, 2.0),    # on both thresholds → not counted (strict >)
            (2, 1.6, 2.1),    # both
            (3, 3.0, None),   # split only
            (4, None, 5.0),   # outlier only
        ])
    return c


def test_counts_from_v10_with_the_old_thresholds():
    assert z_pattern_counts(_db(True)) == {"pattern_split_contracts": 2, "pattern_price_outlier": 2}


def test_absent_v10_gives_none_never_the_retired_table():
    assert z_pattern_counts(_db(False)) == {"pattern_split_contracts": None, "pattern_price_outlier": None}
