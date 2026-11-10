"""«Historial insuficiente» (06_biases H1, house fix F3): a contract whose vendor had < 3 contracts
in strictly earlier years (canonical group, as the v0.9.2 features count them) cannot read «bajo»."""
import sqlite3

import pytest

from api.cache import app_cache
from api.services import vendor_history as vh

pytestmark = pytest.mark.no_db


def _db(with_canonical: bool = True) -> sqlite3.Connection:
    conn = sqlite3.connect(":memory:")
    conn.execute("CREATE TABLE contracts (id INTEGER PRIMARY KEY, vendor_id INTEGER, contract_year INTEGER)")
    rows = [
        # vendor 1: 2 contracts in 2018, 1 in 2019, 5 in 2020 → 2020 contracts have 3 prior
        *[(1, 2018)] * 2, (1, 2019), *[(1, 2020)] * 5,
        # vendor 2: 10 contracts, all in 2024 → none has prior history
        *[(2, 2024)] * 10,
        # vendors 3 + 4 are one canonical group: 2 + 2 contracts before 2022
        (3, 2020), (3, 2021), (4, 2020), (4, 2021), (3, 2022),
    ]
    conn.executemany("INSERT INTO contracts (vendor_id, contract_year) VALUES (?, ?)", rows)
    if with_canonical:
        conn.execute("CREATE TABLE vendor_canonical (vendor_id INTEGER, canonical_id INTEGER, group_size INTEGER, match_basis TEXT)")
        conn.executemany("INSERT INTO vendor_canonical VALUES (?, ?, 2, 'test')", [(3, 3), (4, 3)])
    return conn


def setup_function():
    app_cache.invalidate(vh.CACHE)


def test_contract_level_counts_strictly_prior_years():
    conn = _db()
    assert vh.contract_thin_history(conn, 1, 2018) is True    # 0 prior
    assert vh.contract_thin_history(conn, 1, 2020) is False   # 3 prior (2 + 1)
    assert vh.contract_thin_history(conn, 2, 2024) is True    # same-year contracts do not count


def test_contract_level_uses_the_canonical_group():
    conn = _db()
    assert vh.contract_thin_history(conn, 3, 2022) is False   # 2 own + 2 from vendor 4
    app_cache.invalidate(vh.CACHE)  # the cache is per process (one DB); a second DB needs a clear
    assert vh.contract_thin_history(_db(with_canonical=False), 3, 2022) is True


def test_unknown_inputs_are_none_not_false():
    conn = _db()
    assert vh.contract_thin_history(conn, None, 2020) is None
    assert vh.contract_thin_history(conn, 1, None) is None


def test_vendor_level_is_thin_when_most_contracts_were_scored_without_history():
    conn = _db()
    assert vh.vendor_thin_history(conn, 2) is True    # 10 of 10 had 0 prior
    assert vh.vendor_thin_history(conn, 1) is False   # 5 of 8 had ≥ 3 prior
    assert vh.vendor_thin_history(conn, 999) is None  # no contracts


def test_list_stamp_fills_each_row():
    conn = _db()
    rows = [{"vendor_id": 1, "contract_year": 2018}, {"vendor_id": 1, "contract_year": 2020}, {"vendor_id": None}]
    vh.stamp_contract_rows(conn, rows)
    assert [r["thin_history"] for r in rows] == [True, False, None]
