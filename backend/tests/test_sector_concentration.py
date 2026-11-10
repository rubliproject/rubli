"""Pins the /sectors/{id}/concentration-history definition (LAUNCH_AUDIT_2026-10-30 § B4).

top_vendor_share = the largest vendor's share of the sector-year's contract VALUE
(public register: 0 < amount <= 100B MXN; vendors merged through vendor_canonical).
It used to plot the capped model feature `vendor_concentration` (Salud 4.3% vs the real 8.0%)."""
import sqlite3

import pytest

from scripts.precompute_sector_concentration import build

pytestmark = pytest.mark.no_db


def test_top_vendor_share_is_value_share_of_largest_vendor():
    c = sqlite3.connect(":memory:")
    c.executescript("""
        CREATE TABLE contracts (id INTEGER PRIMARY KEY, sector_id INTEGER, contract_year INTEGER,
                                vendor_id INTEGER, amount_mxn REAL);
        CREATE TABLE vendor_canonical (vendor_id INTEGER, canonical_id INTEGER);
        INSERT INTO vendor_canonical VALUES (3, 2);           -- vendor 3 is a duplicate of 2
        INSERT INTO contracts VALUES
          (1, 1, 2011, 1, 50), (2, 1, 2011, 2, 30), (3, 1, 2011, 3, 20),  -- 2+3 = 50 → tie, share 0.5
          (4, 1, 2011, 9, 2e11),                                          -- > 100B: decimal error, rejected
          (5, 1, 2011, 7, 0),                                             -- zero amount: not in register
          (6, 1, 2012, 1, 90), (7, 1, 2012, 2, 10),
          (8, 1, 2013, 1, 5),                                              -- 1 vendor: too thin to plot
          (9, 1, 2001, 1, 5), (10, 1, 2001, 2, 5);                         -- before the public register
    """)
    build(c, min_vendors=2)
    rows = {r[0]: r[1:] for r in c.execute(
        "SELECT year, top_vendor_share, total_value, vendor_count, gini FROM sector_year_concentration "
        "WHERE sector_id = 1")}
    assert sorted(rows) == [2011, 2012]
    assert rows[2011][:3] == (0.5, 100.0, 2)
    assert rows[2011][3] == pytest.approx(0.0)           # two equal canonical vendors
    assert rows[2012][:3] == (0.9, 100.0, 2)
    assert rows[2012][3] == pytest.approx(0.4)           # Gini of (10, 90)
