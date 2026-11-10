"""api.persisted: slow endpoints served from precomputed_stats (weekend #11)."""
import json
import sqlite3

import pytest

from api import dependencies, persisted

pytestmark = pytest.mark.no_db


def test_stat_key_drops_none_sorts_and_has_no_commas():
    # swap_tables --stat-keys is comma-separated, so a key must never contain one
    k = persisted.stat_key("amount-histogram", min=1, exact="2,3", year_from=None)
    assert k == "slow:amount-histogram?exact=2%2C3&min=1"
    assert persisted.stat_key("pyod-agreement") == "slow:pyod-agreement"


def test_load_hit_miss_and_live_only(monkeypatch):
    uri = "file:test_persisted?mode=memory&cache=shared"  # no temp file: C: is full
    c = sqlite3.connect(uri, uri=True)  # held open so the shared memory DB lives
    c.execute("CREATE TABLE precomputed_stats (stat_key TEXT PRIMARY KEY, stat_value TEXT, updated_at TIMESTAMP)")
    c.execute("INSERT INTO precomputed_stats VALUES (?, ?, NULL)",
              (persisted.stat_key("x", a=1), json.dumps({"v": 1.5})))
    c.commit()
    monkeypatch.setattr(dependencies, "get_db_connection", lambda: sqlite3.connect(uri, uri=True))
    assert persisted.load("x", a=1) == {"v": 1.5}
    assert persisted.load("x", a=2) is None
    monkeypatch.setattr(persisted, "LIVE_ONLY", True)
    assert persisted.load("x", a=1) is None
    c.close()
