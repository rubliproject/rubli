"""GET /categories/cube with no precompute: an empty payload, never a 500 (SILVER 11-05)."""
import json
import sqlite3
from contextlib import contextmanager

import pytest

from api.routers import categories

pytestmark = pytest.mark.no_db


def _serve(monkeypatch, conn):
    @contextmanager
    def fake_db():
        yield conn
    monkeypatch.setattr(categories, "get_db", fake_db)
    categories._cube_cache.clear()


def test_missing_table_is_empty(monkeypatch):
    conn = sqlite3.connect(":memory:")
    _serve(monkeypatch, conn)
    assert categories.get_category_cube() == {"columns": [], "rows": []}


def test_missing_row_is_empty(monkeypatch):
    conn = sqlite3.connect(":memory:")
    conn.execute("CREATE TABLE precomputed_stats (stat_key TEXT PRIMARY KEY, stat_value TEXT, updated_at TIMESTAMP)")
    _serve(monkeypatch, conn)
    assert categories.get_category_cube() == {"columns": [], "rows": []}


def test_row_is_served_and_cached(monkeypatch):
    conn = sqlite3.connect(":memory:")
    conn.execute("CREATE TABLE precomputed_stats (stat_key TEXT PRIMARY KEY, stat_value TEXT, updated_at TIMESTAMP)")
    body = {"columns": ["category_id"], "rows": [[20, 1, "amlo", 3, 9.0, 1, 2]]}
    conn.execute("INSERT INTO precomputed_stats VALUES ('category_cube', ?, NULL)", (json.dumps(body),))
    _serve(monkeypatch, conn)
    assert categories.get_category_cube() == body
    conn.execute("DELETE FROM precomputed_stats")
    assert categories.get_category_cube() == body  # per-process cache (documented in the endpoint)
    categories._cube_cache.clear()
