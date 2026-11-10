"""build_institutions_timeline — buyer × year cells for the vendor dossier spine (owner 2026-10-27)."""
import sqlite3

import pytest

from api.routers.vendors import build_institutions_timeline

pytestmark = pytest.mark.no_db  # in-memory DB only


def _db() -> sqlite3.Connection:
    c = sqlite3.connect(":memory:")
    c.row_factory = sqlite3.Row
    c.executescript(
        """
        CREATE TABLE institutions (id INTEGER PRIMARY KEY, name TEXT, siglas TEXT);
        CREATE TABLE contracts (id INTEGER PRIMARY KEY, vendor_id INT, institution_id INT,
            contract_year INT, amount_mxn REAL, is_direct_award INT, risk_score REAL);
        INSERT INTO institutions VALUES (1,'INSTITUTO UNO','IU'),(2,'DOS',NULL),(3,'TRES','T');
        INSERT INTO contracts (vendor_id,institution_id,contract_year,amount_mxn,is_direct_award,risk_score) VALUES
          (7,1,2020,100,1,0.8),(7,1,2020,300,0,0.4),(7,1,2021,50,1,NULL),
          (7,2,2020,20,1,0.2),(7,3,2021,10,0,0.1),
          (7,1,2021,200000000000,1,0.9),
          (8,1,2020,999,1,0.9);
        """
    )
    return c


def test_top_cells_others_and_years():
    r = build_institutions_timeline(_db(), 7, top=1)
    assert r["top"] == 1 and r["n_institutions"] == 3
    assert [i["institution_id"] for i in r["institutions"]] == [1, 2, 3]
    top = r["institutions"][0]
    assert top["siglas"] == "IU" and top["is_top"] and (top["first_year"], top["last_year"]) == (2020, 2021)
    assert top["amount_mxn"] == 450 and top["n_contracts"] == 3 and top["n_direct_award"] == 2
    c2020 = next(c for c in r["cells"] if c["institution_id"] == 1 and c["year"] == 2020)
    assert c2020["avg_risk_score"] == pytest.approx(0.6)
    c2021 = next(c for c in r["cells"] if c["institution_id"] == 1 and c["year"] == 2021)
    assert c2021["avg_risk_score"] is None and c2021["amount_mxn"] == 50  # the > 100B row is excluded
    others = {c["year"]: c for c in r["cells"] if c["institution_id"] is None}
    assert others[2020]["amount_mxn"] == 20 and others[2021]["amount_mxn"] == 10
    y = {x["year"]: x for x in r["years"]}
    assert y[2020]["amount_mxn"] == 420 and y[2020]["n_contracts"] == 3
    assert y[2020]["avg_risk_score"] == pytest.approx((0.8 + 0.4 + 0.2) / 3, abs=1e-4)


def test_empty_vendor():
    r = build_institutions_timeline(_db(), 99, top=8)
    assert r["institutions"] == [] and r["cells"] == [] and r["years"] == []
