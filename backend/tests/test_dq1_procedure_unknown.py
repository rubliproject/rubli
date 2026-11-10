"""DQ1 § 2 — structure A procedure flags become unknown; stats exclude them; model inputs unchanged."""
import importlib.util
import sqlite3
from pathlib import Path

import pytest

from scripts import dq1_procedure_unknown as U

pytestmark = pytest.mark.no_db

_spec = importlib.util.spec_from_file_location("build_v10", Path(__file__).resolve().parents[2] / "_v10" / "build_v10.py")
b = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(b)


def _db():
    c = sqlite3.connect(":memory:")
    c.executescript("""
        CREATE TABLE contracts (id INTEGER PRIMARY KEY, source_structure TEXT, procedure_type TEXT, vendor_id INTEGER,
            institution_id INTEGER, sector_id INTEGER, procedure_number TEXT, partida_especifica TEXT,
            contract_date TEXT, publication_date TEXT, opening_date TEXT, amount_mxn REAL, contract_year INTEGER,
            is_direct_award INTEGER, is_single_bid INTEGER, is_year_end INTEGER, contract_number TEXT);
        INSERT INTO contracts (id, source_structure, procedure_type, contract_year, amount_mxn, is_direct_award, is_single_bid) VALUES
          (1, 'A', NULL, 2005, 10, 0, 1), (2, 'A', NULL, 2005, 10, 0, 0), (3, 'A', NULL, 2005, 10, 0, 1),
          (4, 'B', 'LICITACION PUBLICA', 2012, 10, 0, 1), (5, 'B', 'ADJUDICACION DIRECTA', 2012, 10, 1, 0),
          (6, 'B', 'LICITACION PUBLICA', 2012, 10, 0, 0);
    """)
    return c


# the denominators the stats scripts / routers now use
SB_PCT = ("SELECT contract_year, ROUND(100.0 * SUM(CASE WHEN is_single_bid = 1 THEN 1 ELSE 0 END) "
          "/ NULLIF(COUNT(is_single_bid), 0), 2) FROM contracts GROUP BY 1 ORDER BY 1")


def test_unknown_drops_out_of_shares_and_rollback_restores():
    c = _db()
    assert c.execute(SB_PCT).fetchall() == [(2005, 66.67), (2012, 33.33)]   # A counted as known before
    assert U.apply(c) == 3
    assert c.execute(SB_PCT).fetchall() == [(2005, None), (2012, 33.33)]     # 2002–2010: «no disponible»
    assert U.apply(c) == 0                                                   # idempotent
    # the single-bid rule (data-validation.md) can no longer re-flag A rows
    c.execute("UPDATE contracts SET is_single_bid = 1 WHERE is_direct_award = 0 AND id IN (1,2,3)")
    assert c.execute("SELECT COUNT(*) FROM contracts WHERE id IN (1,2,3) AND is_single_bid IS NOT NULL").fetchone()[0] == 0
    U.rollback(c)
    assert c.execute("SELECT is_direct_award, is_single_bid FROM contracts WHERE id = 1").fetchone() == (0, 1)


def test_model_inputs_unchanged_by_the_fix():
    c = _db()
    before = b.load(c)[0][["contract_id", "is_direct_award", "is_single_bid"]]
    U.apply(c)
    after = b.load(c)[0][["contract_id", "is_direct_award", "is_single_bid"]]
    assert before.astype(float).equals(after.astype(float))
