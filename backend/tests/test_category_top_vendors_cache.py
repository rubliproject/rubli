"""/categories/{id}/top-vendors sits behind cache.shared (audit 11-07: 15.5 s cold on prod), keyed by every param."""
import sqlite3
from contextlib import contextmanager

import pytest

from api.routers import categories

pytestmark = pytest.mark.no_db  # in-memory DB only


@pytest.fixture
def db(monkeypatch):
    c = sqlite3.connect(":memory:", check_same_thread=False)
    c.row_factory = sqlite3.Row
    c.executescript("""
        CREATE TABLE vendors (id INTEGER PRIMARY KEY, name TEXT);
        CREATE TABLE categories (id INTEGER PRIMARY KEY, name_es TEXT);
        CREATE TABLE contracts (id INTEGER PRIMARY KEY, vendor_id INT, institution_id INT, category_id INT, contract_year INT,
            amount_mxn REAL, risk_score REAL, is_direct_award INT, is_single_bid INT);
        INSERT INTO vendors VALUES (1,'ACME'),(2,'BETA');
        INSERT INTO categories VALUES (20,'Medicamentos');
        INSERT INTO contracts VALUES (1,1,1,20,2020,300,0.5,1,0),(2,2,1,20,2021,100,0.2,0,1),(3,1,1,20,2022,100,0.7,0,0);
    """)

    @contextmanager
    def fake_db():
        yield c
    monkeypatch.setattr(categories, "get_db", fake_db)
    categories._top_vendors_cache.clear()
    return c


def test_top_vendors_goes_through_shared_keyed_by_all_params(db, monkeypatch):
    calls = []

    def spy(key, ttl, compute, min_secs=0.0):
        calls.append(key)
        return compute()
    monkeypatch.setattr(categories, "shared", spy)
    out = categories.get_category_top_vendors(20, limit=5, scope="all")
    assert calls == ["shared:tv:20:5:all"]
    assert set(out) == {"category_id", "category_name", "scope", "total_value", "total_contracts", "hhi",
                        "concentration_label", "top3_share_pct", "data"}
    assert [v["vendor_id"] for v in out["data"]] == [1, 2]
    assert out["data"][0]["market_share_pct"] == 80.0 and out["total_contracts"] == 3
    # the in-process cache still answers the repeat without another shared read
    categories.get_category_top_vendors(20, limit=5, scope="all")
    assert len(calls) == 1


def test_top_vendors_unknown_category_404(db):
    with pytest.raises(categories.HTTPException) as e:
        categories.get_category_top_vendors(999, limit=5, scope="all")
    assert e.value.status_code == 404
