"""
Unscored contracts (ComprasMX, source_structure 'E', risk_score NULL, model_version
'pending_score') count in totals but never in a risk share's denominator.

A TEMP `contracts` shadows the real table on a dedicated read-only connection that
api.dependencies.get_db_connection hands out for this module only (closing it drops the
shadow), so the live endpoints read only the synthetic rows below:
vendor V at institution I has 2 scored contracts (one critical) + 2 unscored.
High-risk share = 1 / 2 scored = 50 % (not 1 / 4 = 25 %).
"""
import sqlite3

import pytest

from api.cache import app_cache
from api.routers.sectors import _hr_pct

ROWS = [  # id, risk_score, risk_level, model_version, source_structure, is_direct_award
    (990000001, 0.70, "critical", "v0.9.1", "D", 0),
    (990000002, 0.10, "low", "v0.9.1", "D", 0),
    (990000003, None, None, "pending_score", "E", 1),
    (990000004, None, None, "pending_score", "E", 0),
]


@pytest.fixture(scope="module")
def synth(_isolated_db):
    import sys
    from api import dependencies as deps

    # the suite's conftest (registered by path, so not importable by name)
    open_isolated = next(m._open_isolated_connection for m in list(sys.modules.values())
                         if hasattr(m, "_open_isolated_connection"))
    conn = open_isolated()
    v, i = conn.execute(
        "SELECT vendor_id, institution_id FROM main.contracts WHERE vendor_id IS NOT NULL AND institution_id IS NOT NULL LIMIT 1"
    ).fetchone()
    conn.execute("CREATE TEMP TABLE contracts AS SELECT * FROM main.contracts WHERE 0")
    conn.executemany(
        "INSERT INTO temp.contracts (id, vendor_id, institution_id, sector_id, contract_year, contract_date, "
        "amount_mxn, title, risk_score, risk_level, risk_model_version, source_structure, is_direct_award, is_single_bid) "
        "VALUES (?, ?, ?, 1, 2025, '2025-06-01', 1000000, 'synthetic', ?, ?, ?, ?, ?, 0)",
        [(cid, v, i, rs, rl, mv, ss, da) for cid, rs, rl, mv, ss, da in ROWS],
    )
    conn.commit()
    shared = deps.get_db_connection
    deps.get_db_connection = lambda: conn
    app_cache.invalidate("contracts_field")
    yield v, i
    deps.get_db_connection = shared
    sqlite3.Connection.close(conn)  # the TEMP shadow dies with its connection
    app_cache.invalidate("contracts_field")


def test_hr_pct_uses_scored_levels():
    assert _hr_pct(1, [1, 0, 0, 1]) == 50.0  # low, medium, high, critical
    assert _hr_pct(0, [0, 0, 0, 0]) == 0


def test_field_hist_carries_scored_count(client, base_url, synth):
    v, _ = synth
    hist = client.get(f"{base_url}/contracts/field?vendor_id={v}&limit=10").json()["hist"]
    n, crit, scored = sum(h[2] for h in hist), sum(h[3] for h in hist), sum(h[6] for h in hist)
    assert (n, crit, scored) == (4, 1, 2)


def test_vendor_compare_share_over_scored(client, base_url, synth):
    v, _ = synth
    item = client.get(f"{base_url}/vendors/compare?ids={v}").json()["data"][0]
    assert item["total_contracts"] == 4
    assert item["high_risk_percentage"] == 50.0


def test_institution_compare_share_over_scored(client, base_url, synth):
    _, i = synth
    item = client.get(f"{base_url}/institutions/compare?ids={i}").json()["data"][0]
    hr = item.get("high_risk_pct", item.get("high_risk_percentage"))
    assert hr == 50.0


def test_institution_period_share_over_scored(client, base_url, synth):
    _, i = synth
    r = client.get(f"{base_url}/analysis/institution/{i}/period-comparison"
                   "?period1_start=2025&period1_end=2025&period2_start=2024&period2_end=2024")
    assert r.status_code == 200, r.text
    assert r.json()["period1"]["high_risk_pct"] == 50.0


def test_unscored_contract_is_listed_with_source_and_no_explanation(client, base_url, synth):
    v, _ = synth
    rows = {c["id"]: c for c in client.get(f"{base_url}/contracts?vendor_id={v}&per_page=10").json()["data"]}
    assert rows[990000003]["risk_score"] is None
    assert rows[990000003]["source_structure"] == "E"
    assert rows[990000003]["risk_model_version"] == "pending_score"
    ex = client.get(f"{base_url}/contracts/990000003/risk-explain").json()
    assert ex["risk_score"] is None and ex["explanation_available"] is False and ex["features"] == []


def test_refresh_stats_tables_skip_unscored():
    """Precompute (scripts/_refresh_stats_tables.py): avg + high_risk_pct over scored rows;
    an entity with no scored contract gets NULL, not 0."""
    from scripts._refresh_stats_tables import refresh_institution_stats, refresh_vendor_stats

    conn = sqlite3.connect(":memory:")
    conn.executescript("""
        CREATE TABLE contracts (id INTEGER, vendor_id INTEGER, institution_id INTEGER, sector_id INTEGER,
            amount_mxn REAL, contract_date TEXT, risk_score REAL, risk_level TEXT,
            is_direct_award INTEGER, is_single_bid INTEGER, contract_year INTEGER);
        CREATE TABLE vendor_stats (vendor_id INTEGER PRIMARY KEY, total_contracts INTEGER, total_value_mxn REAL,
            avg_risk_score REAL DEFAULT 0.0, high_risk_pct REAL DEFAULT 0.0, direct_award_pct REAL,
            single_bid_pct REAL, sector_count INTEGER, institution_count INTEGER,
            first_contract_year INTEGER, last_contract_year INTEGER, updated_at TIMESTAMP);
        CREATE TABLE institution_stats (institution_id INTEGER PRIMARY KEY, total_contracts INTEGER,
            total_value_mxn REAL, avg_risk_score REAL DEFAULT 0.0, high_risk_count INTEGER,
            high_risk_pct REAL DEFAULT 0.0, direct_award_count INTEGER, direct_award_pct REAL,
            single_bid_count INTEGER, single_bid_pct REAL, vendor_count INTEGER,
            first_contract_year INTEGER, last_contract_year INTEGER, updated_at TIMESTAMP);
    """)
    conn.executemany(
        "INSERT INTO contracts VALUES (?, ?, 1, 1, 1000, '2025-01-01', ?, ?, 0, 0, 2025)",
        [(1, 10, 0.7, "critical"), (2, 10, 0.1, "low"), (3, 10, None, None), (4, 20, None, None)],
    )
    refresh_vendor_stats(conn)
    refresh_institution_stats(conn)
    vs = {r[0]: r[1:] for r in conn.execute("SELECT vendor_id, total_contracts, avg_risk_score, high_risk_pct FROM vendor_stats")}
    assert vs[10] == (3, pytest.approx(0.4), 50.0)
    assert vs[20] == (1, None, None)
    assert conn.execute("SELECT total_contracts, high_risk_count, high_risk_pct FROM institution_stats").fetchone() == (4, 1, 50.0)
