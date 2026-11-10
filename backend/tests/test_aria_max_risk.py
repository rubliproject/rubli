"""aria_queue.max_risk_score and the FP2 max amount come from contracts, not max_mahalanobis."""
import sqlite3

from scripts.aria_pipeline import load_vendor_contract_maxima, screen_false_positives


def test_load_vendor_contract_maxima():
    c = sqlite3.connect(":memory:")
    c.execute("CREATE TABLE contracts (vendor_id INTEGER, risk_score REAL, amount_mxn REAL)")
    c.executemany("INSERT INTO contracts VALUES (?, ?, ?)", [
        (1, 0.2, 5e6), (1, 0.71, 2e9),
        (2, None, 3e11),          # >100B reject never counts as the max
        (3, 0.05, None),
    ])
    risk, amt = load_vendor_contract_maxima(c)
    assert risk == {1: 0.71, 3: 0.05}
    assert amt == {1: 2e9}


def test_fp2_fires_on_single_giant_contract():
    c = sqlite3.connect(":memory:")
    hit = screen_false_positives("ACME SA", {"max_contract_amount": 2e9, "avg_contract_amount": 1e7}, c)
    miss = screen_false_positives("ACME SA", {"max_contract_amount": 2e9, "avg_contract_amount": 1e8}, c)
    assert hit["fp_data_error"] and not miss["fp_data_error"]
