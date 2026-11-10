"""high_risk is opt-in; when on it fires on the active model's critical band."""
import sqlite3

from scripts import compute_ghost_confidence as g


def test_high_risk_uses_critical_band(tmp_path):
    db = tmp_path / "g.db"
    c = sqlite3.connect(db)
    c.executescript("""
        CREATE TABLE aria_queue (vendor_id INTEGER, vendor_name TEXT, total_contracts INTEGER,
            total_value_mxn REAL, years_active INTEGER, avg_risk_score REAL, max_risk_score REAL,
            is_efos_definitivo INTEGER, is_sfp_sanctioned INTEGER, is_disappeared INTEGER,
            primary_sector_name TEXT, top_institution TEXT, pattern_confidences TEXT, primary_pattern TEXT);
        CREATE TABLE company_registry (vendor_id INTEGER, shell_flags TEXT, efos_stage TEXT, rfc_age_years REAL);
        CREATE TABLE contracts (vendor_id INTEGER, contract_date TEXT, risk_score REAL);
        INSERT INTO aria_queue (vendor_id, total_contracts, years_active, max_risk_score, primary_pattern)
            VALUES (1, 10, 5, 0, 'P2'), (2, 10, 5, 0, 'P2');
        INSERT INTO contracts VALUES (1, '2020-01-01', 0.61), (2, '2020-01-01', 0.55);
    """)
    c.commit(); c.close()
    sig = lambda: dict(sqlite3.connect(db).execute("SELECT vendor_id, sig_high_risk FROM ghost_confidence_scores"))
    g.run(db)
    assert sig() == {1: 0, 2: 0}
    g.run(db, with_high_risk=True)
    assert sig() == {1: 1, 2: 0}


def test_get_risk_level_active_model_uses_v6_bands():
    from api.config.constants import get_risk_level
    assert get_risk_level(0.55) == 'high'          # v0.8.5: critical starts at 0.60
    assert get_risk_level(0.60) == 'critical'
    assert get_risk_level(0.30) == 'medium'
    assert get_risk_level(0.55, 'v4.0') == 'critical'
    assert get_risk_level(0.36, 'v3.3') == 'high'
