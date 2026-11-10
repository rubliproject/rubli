"""apply_cat22_sonda_reclassify moves only Campeche oil rows out of cat 22; medical sondas and manual rows stay."""
import sqlite3

import pytest

from scripts.apply_cat22_sonda_reclassify import plan

pytestmark = pytest.mark.no_db


def test_plan_moves_only_campeche_regex_rows():
    c = sqlite3.connect(":memory:")
    c.execute("CREATE TABLE contracts (id INTEGER, title TEXT, description TEXT, sector_id INTEGER, category_id INTEGER, category_source TEXT, amount_mxn REAL)")
    c.executemany("INSERT INTO contracts VALUES (?,?,?,?,?,?,?)", [
        (1, "MANTENIMIENTO EN LA SONDA DE CAMPECHE", None, 4, 22, "regex", 1e9),
        (2, "Tendido de ducto", "en la Sonda Marina de Campeche", 4, 22, "fallback", 5e8),
        (3, "SONDA FOLEY 16 FR", None, 1, 22, "regex", 1e5),
        (4, "Obra en la Sonda de Campeche", None, 4, 22, "manual", 2e8),
    ])
    moved = {m[0] for m in plan(c)}
    assert moved == {1, 2}
