"""run_gt_auto_update must not inherit a stale read snapshot (weekly 2026-11-01: «database is locked»)."""
import sqlite3

import pytest

from scripts.aria_pipeline import run_gt_auto_update

pytestmark = pytest.mark.no_db


def test_gt_update_survives_a_concurrent_commit(tmp_path):
    db = tmp_path / "t.db"
    setup = sqlite3.connect(db)
    setup.execute("PRAGMA journal_mode=WAL")
    setup.execute("""CREATE TABLE aria_gt_updates (vendor_id INTEGER, vendor_name TEXT, action TEXT,
        confidence_level TEXT, match_confidence REAL, source TEXT, evidence_detail TEXT, aria_run_id TEXT,
        UNIQUE(vendor_id, aria_run_id))""")
    setup.execute("CREATE TABLE other (x INTEGER)")
    setup.commit()
    setup.close()

    a = sqlite3.connect(db, timeout=5)
    a.row_factory = sqlite3.Row
    # what the pipeline does before Module 8: temp-table DML (implicit BEGIN), then reads on main
    a.execute("CREATE TEMP TABLE IF NOT EXISTS _aria_vids (vendor_id INTEGER PRIMARY KEY)")
    a.execute("INSERT OR IGNORE INTO _aria_vids VALUES (1)")
    a.execute("SELECT COUNT(*) FROM aria_gt_updates").fetchone()

    b = sqlite3.connect(db, timeout=5)  # another writer commits meanwhile (backend, a cron)
    b.execute("INSERT INTO other VALUES (1)")
    b.commit()
    b.close()

    row = {"vendor_id": 7, "vendor_name": "X SA", "in_ground_truth": False, "is_efos_definitivo": True,
           "total_contracts": 5, "efos_rfc": "XXX010101AAA"}
    assert run_gt_auto_update([row], a, "run-1", dry_run=False) == (1, 0)
    assert a.execute("SELECT COUNT(*) FROM aria_gt_updates").fetchone()[0] == 1
    a.close()
