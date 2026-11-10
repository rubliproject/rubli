"""Entity averages follow the DISPLAY score (docs/SCORING.md § Display score, 2026-10-28).

Contracts show `risk_score` (squashed above 0.60, < 0.95); `risk_score_v92` is the stored model score
(capped at 1.00). vendor_stats / institution_stats / vendors.avg_risk_score must average the score the
contracts display, so an entity average can never exceed its highest contract score."""
import sqlite3

import pytest

from scripts._refresh_stats_tables import refresh_institution_stats, refresh_vendor_stats


def _db():
    conn = sqlite3.connect(":memory:")
    conn.executescript("""
        CREATE TABLE contracts (id INTEGER, vendor_id INTEGER, institution_id INTEGER, sector_id INTEGER,
            amount_mxn REAL, contract_date TEXT, risk_score REAL, risk_level TEXT,
            is_direct_award INTEGER, is_single_bid INTEGER, risk_score_v92 REAL, contract_year INTEGER);
        CREATE TABLE vendor_stats (vendor_id INTEGER PRIMARY KEY, total_contracts INTEGER, total_value_mxn REAL,
            avg_risk_score REAL DEFAULT 0.0, high_risk_pct REAL DEFAULT 0.0, direct_award_pct REAL,
            single_bid_pct REAL, sector_count INTEGER, institution_count INTEGER,
            first_contract_year INTEGER, last_contract_year INTEGER, updated_at TIMESTAMP);
        CREATE TABLE institution_stats (institution_id INTEGER PRIMARY KEY, total_contracts INTEGER,
            total_value_mxn REAL, avg_risk_score REAL DEFAULT 0.0, high_risk_count INTEGER,
            high_risk_pct REAL DEFAULT 0.0, direct_award_count INTEGER, direct_award_pct REAL,
            single_bid_count INTEGER, single_bid_pct REAL, vendor_count INTEGER,
            first_contract_year INTEGER, last_contract_year INTEGER, updated_at TIMESTAMP);
        CREATE TABLE vendors (id INTEGER PRIMARY KEY, total_contracts INTEGER, total_amount_mxn REAL,
            avg_risk_score REAL);
        CREATE TABLE vendor_canonical (vendor_id INTEGER PRIMARY KEY, canonical_id INTEGER NOT NULL,
            group_size INTEGER NOT NULL, match_basis TEXT NOT NULL);
        -- vendor 11 is absorbed into 10; vendor 20 is a singleton (no vendor_canonical row)
        INSERT INTO vendor_canonical VALUES (10, 10, 2, 'rfc'), (11, 10, 2, 'rfc');
        -- stale pre-squash averages (avg of the capped 1.00 stored score)
        INSERT INTO vendors VALUES (10, 2, 2000, 1.0), (11, 1, 1000, 1.0), (20, 1, 1000, 0.99);
        INSERT INTO vendor_stats (vendor_id, avg_risk_score) VALUES (10, 1.0), (20, 0.99);
    """)
    # display risk_score < 0.95 while the stored risk_score_v92 sits at 1.00
    conn.executemany(
        "INSERT INTO contracts VALUES (?, ?, 1, 1, 1000, '2025-01-01', ?, 'critical', 0, 0, 1.0, 2025)",
        [(1, 10, 0.9496), (2, 11, 0.9490), (3, 20, 0.9495)],
    )
    return conn


@pytest.mark.no_db
def test_entity_avg_never_exceeds_max_display_score():
    conn = _db()
    refresh_vendor_stats(conn)
    refresh_institution_stats(conn)
    top = conn.execute("SELECT MAX(risk_score) FROM contracts").fetchone()[0]
    for table in ("vendor_stats", "institution_stats"):
        assert conn.execute(f"SELECT MAX(avg_risk_score) FROM {table}").fetchone()[0] <= top, table
    vs = dict(conn.execute("SELECT vendor_id, avg_risk_score FROM vendor_stats"))
    assert vs == {10: pytest.approx(0.9493), 20: pytest.approx(0.9495)}
    # vendors.avg_risk_score (rankings, peer percentile) follows vendor_stats for singletons too
    v = dict(conn.execute("SELECT id, avg_risk_score FROM vendors"))
    assert v[10] == pytest.approx(0.9493) and v[20] == pytest.approx(0.9495)  # 11 is absorbed: hidden by the API


def test_live_db_entity_avg_le_max_display_score():
    """Invariant on the real DB: a stale precompute (run before the squash) shows up here."""
    from api.dependencies import get_db

    with get_db() as conn:
        top = conn.execute("SELECT MAX(risk_score) FROM contracts").fetchone()[0]
        for table in ("vendor_stats", "institution_stats", "vendors JOIN vendor_stats vs ON vs.vendor_id = vendors.id"):
            avg = conn.execute(f"SELECT MAX({table.split()[0]}.avg_risk_score) FROM {table}").fetchone()[0]
            assert avg is None or avg <= top + 1e-9, f"{table.split()[0]}.avg_risk_score {avg} > max contract score {top}"
