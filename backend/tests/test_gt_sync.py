"""gt_sync: local (source of truth) -> prod GT copy. Temp DBs only."""
import sqlite3

import pytest

from scripts.gt_sync import apply, diff

pytestmark = pytest.mark.no_db


def _db(path, extra_col):
    conn = sqlite3.connect(path)
    cols = "id INTEGER PRIMARY KEY, case_id INTEGER, vendor_id INTEGER, is_false_positive INTEGER"
    conn.execute(f"CREATE TABLE ground_truth_vendors ({cols}{', label_tier TEXT' if extra_col else ''})")
    return conn


def test_dry_run_diff_then_apply(tmp_path):
    src, dst = _db(tmp_path / "local.db", True), _db(tmp_path / "prod.db", False)
    src.executemany("INSERT INTO ground_truth_vendors VALUES (?,?,?,?,?)",
                    [(1, 4, 441, 1, None), (2, 5, 9, 0, "C"), (3, 6, 7, 0, "D")])
    dst.executemany("INSERT INTO ground_truth_vendors VALUES (?,?,?,?)",
                    [(1, 4, 441, 0), (2, 5, 9, 0), (99, 1, 1, 0)])  # prod missed the Tradeco FP flag
    src.commit(), dst.commit()

    plan = diff(src, dst, tables=("ground_truth_vendors",))["ground_truth_vendors"]
    assert (plan["insert"], plan["update"], plan["target_only"]) == ([3], [1], [99])
    assert plan["missing_in_target"] == ["label_tier"]
    assert dst.execute("SELECT is_false_positive FROM ground_truth_vendors WHERE id=1").fetchone() == (0,)

    stamp = apply(src, dst, {"ground_truth_vendors": plan})
    rows = dst.execute("SELECT id, is_false_positive FROM ground_truth_vendors ORDER BY id").fetchall()
    assert rows == [(1, 1), (2, 0), (3, 0), (99, 0)]  # prod-only row kept without --delete
    assert dst.execute(f"SELECT count(*) FROM _gtsync_{stamp}_ground_truth_vendors").fetchone() == (3,)
    assert diff(src, dst, tables=("ground_truth_vendors",))["ground_truth_vendors"]["update"] == []
