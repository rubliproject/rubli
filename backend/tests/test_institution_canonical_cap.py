"""contracts_canon must build on a real-shaped DB (canonical map + amount_mxn) and drop >100B rows.
fd1316ea emitted `c.COALESCE(amount_mxn, 0)`, a syntax error that broke every institution precompute."""
import sqlite3

import pytest

from scripts._institution_canonical import install_contracts_canon

pytestmark = pytest.mark.no_db


def test_canon_view_with_amount_and_canonical_map():
    c = sqlite3.connect(":memory:")
    c.executescript("""
        CREATE TABLE contracts (id INTEGER PRIMARY KEY, institution_id INTEGER, vendor_id INTEGER, amount_mxn REAL);
        CREATE TABLE institution_canonical (institution_id INTEGER, canonical_id INTEGER);
        CREATE TABLE vendor_canonical (vendor_id INTEGER, canonical_id INTEGER);
        INSERT INTO institution_canonical VALUES (2, 1);
        INSERT INTO contracts VALUES (1, 2, 5, 10.0), (2, 1, 5, 2e11);
    """)
    assert install_contracts_canon(c, vendors=True)
    assert c.execute("SELECT id, institution_id FROM contracts_canon").fetchall() == [(1, 1)]
