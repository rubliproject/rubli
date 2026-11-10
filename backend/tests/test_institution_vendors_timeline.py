"""build_vendors_timeline — vendor × year cells for the institution dossier spine (owner 2026-10-27)."""
import sqlite3

import pytest

from api.routers.institutions import build_vendors_timeline
from scripts.precompute_institution_vendor_year import build as build_precompute

pytestmark = pytest.mark.no_db  # in-memory DB only


def _db() -> sqlite3.Connection:
    c = sqlite3.connect(":memory:", isolation_level=None)
    c.row_factory = sqlite3.Row
    c.executescript(
        """
        CREATE TABLE institutions (id INTEGER PRIMARY KEY, name TEXT, siglas TEXT);
        CREATE TABLE vendors (id INTEGER PRIMARY KEY, name TEXT);
        CREATE TABLE institution_canonical (institution_id INTEGER PRIMARY KEY, canonical_id INTEGER NOT NULL);
        CREATE TABLE vendor_canonical (vendor_id INTEGER PRIMARY KEY, canonical_id INTEGER NOT NULL);
        CREATE TABLE contracts (id INTEGER PRIMARY KEY, vendor_id INT, institution_id INT,
            contract_year INT, amount_mxn REAL, is_direct_award INT, risk_score REAL);
        INSERT INTO institutions VALUES (1,'INSTITUTO UNO','IU'),(11,'INSTITUTO UNO (OLD)',NULL),(2,'OTRO',NULL);
        INSERT INTO institution_canonical VALUES (1,1),(11,1),(2,2);
        INSERT INTO vendors VALUES (7,'SIETE SA'),(17,'SIETE SA DE CV'),(8,'OCHO'),(9,'NUEVE');
        INSERT INTO vendor_canonical VALUES (7,7),(17,7),(8,8),(9,9);
        INSERT INTO contracts (vendor_id,institution_id,contract_year,amount_mxn,is_direct_award,risk_score) VALUES
          (7,1,2020,100,1,0.8),(17,11,2020,300,0,0.4),(7,1,2021,50,1,NULL),
          (8,1,2020,20,1,0.2),(9,11,2021,10,0,0.1),
          (8,1,2021,200000000000,1,0.9),
          (8,2,2020,999,1,0.9);
        """
    )
    return c


def _check(r):
    assert r["top"] == 1 and r["n_vendors"] == 3
    assert [v["vendor_id"] for v in r["vendors"]] == [7, 8, 9]
    top = r["vendors"][0]
    # absorbed institution 11 and absorbed vendor 17 fold into 1 and 7
    assert top["name"] == "SIETE SA" and top["is_top"] and (top["first_year"], top["last_year"]) == (2020, 2021)
    assert top["amount_mxn"] == 450 and top["n_contracts"] == 3 and top["n_direct_award"] == 2
    c2020 = next(c for c in r["cells"] if c["vendor_id"] == 7 and c["year"] == 2020)
    assert c2020["avg_risk_score"] == pytest.approx(0.6)
    c2021 = next(c for c in r["cells"] if c["vendor_id"] == 7 and c["year"] == 2021)
    assert c2021["avg_risk_score"] is None and c2021["amount_mxn"] == 50
    others = {c["year"]: c for c in r["cells"] if c["vendor_id"] is None}
    assert others[2020]["amount_mxn"] == 20 and others[2021]["amount_mxn"] == 10  # the > 100B row is excluded
    assert others[2021]["avg_risk_score"] == pytest.approx(0.1)
    y = {x["year"]: x for x in r["years"]}
    assert y[2020]["amount_mxn"] == 420 and y[2020]["n_contracts"] == 3 and y[2020]["n_direct_award"] == 2
    assert y[2020]["top_vendor_id"] == 7 and y[2020]["top_vendor_name"] == "SIETE SA"
    assert y[2020]["top_share"] == pytest.approx(400 / 420, abs=1e-4)
    assert y[2020]["top5_share"] == 1
    assert y[2020]["hhi"] == pytest.approx((400 ** 2 + 20 ** 2) / 420 ** 2, abs=1e-4)


def test_live_query():
    _check(build_vendors_timeline(_db(), 1, top=1))


def test_precompute_matches_live():
    c = _db()
    build_precompute(c)
    assert c.execute("SELECT COUNT(*) FROM institution_vendor_year WHERE institution_id = 11").fetchone()[0] == 0
    _check(build_vendors_timeline(c, 1, top=1))


def test_empty_institution():
    r = build_vendors_timeline(_db(), 99, top=8)
    assert r["vendors"] == [] and r["cells"] == [] and r["years"] == [] and r["n_vendors"] == 0
