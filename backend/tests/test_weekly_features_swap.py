"""_v10/build_v10.write: a killed or failed build never leaves contract_features_v10 missing or partial
(docs/SILENT_FAILURES_WEEKLY_2026-10-28.md § S5)."""
import importlib.util
import sqlite3
from pathlib import Path

import pandas as pd
import pytest

pytestmark = pytest.mark.no_db

_spec = importlib.util.spec_from_file_location("build_v10", Path(__file__).resolve().parents[2] / "_v10" / "build_v10.py")
b = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(b)


def _rows(db):
    c = sqlite3.connect(db)
    try:
        return sorted(c.execute(f"SELECT contract_id, contract_year FROM {b.TABLE}").fetchall())
    finally:
        c.close()


def test_write_swaps_in_a_complete_table(tmp_path):
    db = tmp_path / "t.db"
    b.write(db, pd.DataFrame({"contract_id": [1, 2], "contract_year": [2025, 2026], "x": [0.5, None]}))
    assert _rows(db) == [(1, 2025), (2, 2026)]
    b.write(db, pd.DataFrame({"contract_id": [1, 2, 3], "contract_year": [2025, 2026, 2026], "x": [1.0, 2.0, 3.0]}))
    assert _rows(db) == [(1, 2025), (2, 2026), (3, 2026)]
    c = sqlite3.connect(db)
    assert c.execute("SELECT name FROM sqlite_master WHERE name LIKE '%_new'").fetchall() == []
    assert c.execute("SELECT 1 FROM sqlite_master WHERE name = 'ix_cfv10_year'").fetchone()
    c.close()


def test_a_failed_build_keeps_the_previous_table(tmp_path):
    db = tmp_path / "t.db"
    b.write(db, pd.DataFrame({"contract_id": [1, 2], "contract_year": [2025, 2026]}))
    with pytest.raises(sqlite3.IntegrityError):  # duplicate key mid-insert stands in for a kill
        b.write(db, pd.DataFrame({"contract_id": [5, 5], "contract_year": [2026, 2026]}))
    assert _rows(db) == [(1, 2025), (2, 2026)]
    b.write(db, pd.DataFrame({"contract_id": [7], "contract_year": [2026]}))  # the next run recovers
    assert _rows(db) == [(7, 2026)]
