"""P5 on the deploy DB: contract_z_features is dropped there, so ARIA must recompute z_price_ratio
(regression for prod ARIA runs from 2026-10-22 giving P5 = 0 to every vendor)."""

import sqlite3
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))

from scripts.aria_pipeline import classify_patterns, compute_vendor_price_z

pytestmark = pytest.mark.no_db  # in-memory fixture; runs in CI without the full DB


def _deploy_like_db():
    c = sqlite3.connect(":memory:")
    c.executescript("""
        CREATE TABLE contracts (id INTEGER PRIMARY KEY, vendor_id INTEGER, sector_id INTEGER,
                                contract_year INTEGER, amount_mxn REAL);
        CREATE TABLE factor_baselines (factor_name TEXT, sector_id INTEGER, year INTEGER, scope TEXT,
                                       mean REAL, stddev REAL, count INTEGER);
        CREATE TABLE sector_price_baselines (sector_id INTEGER, contract_type TEXT, year INTEGER,
                                             percentile_50 REAL);
        INSERT INTO sector_price_baselines VALUES (3, 'all', NULL, 1000000);
        INSERT INTO factor_baselines VALUES ('price_ratio', 3, 2024, 'sector_year', 2.0, 4.0, 500),
                                            ('price_ratio', 3, 2025, 'sector_year', 9.0, 9.0, 5),
                                            ('price_ratio', 3, NULL, 'sector', 1.0, 2.0, 9000),
                                            ('price_ratio', NULL, NULL, 'global', 1.0, 1.0, 99999);
        -- vendor 1: ratios 14 and 2 in 2024 → z 3.0 and 0.0
        INSERT INTO contracts VALUES (1, 1, 3, 2024, 14000000), (2, 1, 3, 2024, 2000000);
        -- vendor 2: 2025 cell is thin (count 5) → sector fallback: ratio 101 → z 50 capped at 5
        INSERT INTO contracts VALUES (3, 2, 3, 2025, 101000000);
        -- vendor 3: amount over 100B is rejected → ratio 0 → z (0-2)/4
        INSERT INTO contracts VALUES (4, 3, 3, 2024, 200000000000);
    """)
    return c


def test_recomputes_price_z_without_contract_z_features():
    z = compute_vendor_price_z(_deploy_like_db(), [1, 2, 3])
    assert z[1]["max_z_price_ratio"] == pytest.approx(3.0)
    assert z[1]["avg_z_price_ratio"] == pytest.approx(1.5)
    assert z[1]["price_outlier_count"] == 1
    assert z[2]["max_z_price_ratio"] == pytest.approx(5.0)
    assert z[3]["max_z_price_ratio"] == pytest.approx(-0.5)
    assert z[3]["price_outlier_count"] == 0


def test_fallback_feeds_a_nonzero_p5():
    zf = compute_vendor_price_z(_deploy_like_db(), [1])[1]
    p = classify_patterns({"avg_z_price_ratio": zf["avg_z_price_ratio"],
                           "max_z_price_ratio": zf["max_z_price_ratio"],
                           "price_hypothesis_count": zf["price_outlier_count"]})
    assert p["P5"] > 0
