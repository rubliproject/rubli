"""build_vendor_panorama — docs/PROFILE_CONTENT_VENDOR_2026-11-05.md § 1–4 (ficha, buyers, categories, risk in one cell)."""
import sqlite3

import pytest

from api.services.vendor_panorama import build_vendor_panorama

pytestmark = pytest.mark.no_db  # in-memory DB only


def _db() -> sqlite3.Connection:
    c = sqlite3.connect(":memory:", isolation_level=None)
    c.executescript(
        """
        CREATE TABLE institutions (id INTEGER PRIMARY KEY, name TEXT, siglas TEXT);
        CREATE TABLE institution_canonical (institution_id INTEGER PRIMARY KEY, canonical_id INTEGER NOT NULL);
        CREATE TABLE vendor_canonical (vendor_id INTEGER PRIMARY KEY, canonical_id INTEGER NOT NULL);
        CREATE TABLE categories (id INTEGER PRIMARY KEY, name_es TEXT, name_en TEXT);
        CREATE TABLE subcategory_definitions (id INTEGER PRIMARY KEY, category_id INT, code TEXT, name_es TEXT, name_en TEXT);
        CREATE TABLE contract_subcategory (contract_id INTEGER PRIMARY KEY, subcategory_id INT);
        CREATE TABLE contracts (id INTEGER PRIMARY KEY, vendor_id INT, institution_id INT, category_id INT,
            contract_year INT, contract_date TEXT, amount_mxn REAL, is_direct_award INT, risk_score REAL, source_structure TEXT);
        INSERT INTO institutions VALUES (1,'IMSS','IMSS'),(11,'IMSS VIEJO',NULL),(2,'ISSSTE','ISSSTE');
        INSERT INTO institution_canonical VALUES (1,1),(11,1),(2,2);
        INSERT INTO vendor_canonical VALUES (7,7),(17,7),(9,9);
        INSERT INTO categories VALUES (20,'Medicamentos','Medicines'),(26,'Obra','Works');
        INSERT INTO subcategory_definitions VALUES (100,20,'generic','Genéricos','Generics'),(101,20,'patent','Patente','Patent');
        INSERT INTO contracts VALUES
          (1,7,1,20,2008,'2008-05-01',100,1,0.80,'A'),        -- before 2011: procedure not coded
          (2,17,11,20,2020,'2020-03-01',300,0,0.30,'C'),      -- absorbed vendor + absorbed institution
          (3,7,2,26,2024,'2024-11-15',40,1,0.45,'D'),         -- Sheinbaum's side of the seam
          (4,7,1,20,2024,'2024-09-30',10,1,0.10,'D'),         -- AMLO's side
          (5,7,2,20,2025,'2025-06-01',200000000000,1,0.9,'E'),-- > 100B: rejected
          (6,7,2,20,2025,'2025-12-01',50,1,NULL,'E'),         -- ComprasMX, unscored
          (7,9,1,20,2025,'2025-01-01',999,1,0.9,'D');         -- another vendor
        INSERT INTO contract_subcategory VALUES (1,100),(2,101),(4,100),(6,100);
        """
    )
    return c


def test_history_folds_rejects_and_levels():
    r = build_vendor_panorama(_db(), 7)
    assert r["amount_mxn"] == 500 and r["contracts"] == 5
    assert r["levels"] == {"critical": 1, "high": 1, "medium": 1, "low": 1, "none": 1}
    assert r["da_pct"] == 75.0  # 2020 tendered, 3 direct; 2008 not coded
    assert r["first_year"] == 2008 and r["last_year"] == 2025
    assert [b["institution_id"] for b in r["buyers"]] == [1, 2] and r["buyers_n"] == 2
    imss = r["buyers"][0]
    assert imss["amount_mxn"] == 410 and imss["share_pct"] == 82.0 and imss["siglas"] == "IMSS"
    assert imss["years"] == [[2008, 100], [2020, 300], [2024, 10]]
    assert imss["gobs"] == {"calderon": 100, "amlo": 310}
    assert r["buyers"][1]["gobs"] == {"sheinbaum": 90}


def test_categories_and_subcategories():
    r = build_vendor_panorama(_db(), 7)
    assert [c["category_id"] for c in r["categories"]] == [20, 26]
    med = r["categories"][0]
    assert med["amount_mxn"] == 460 and med["name_es"] == "Medicamentos"
    assert [(s["code"], s["amount_mxn"]) for s in med["subs"]] == [("patent", 300), ("generic", 160)]


def test_hoy_since():
    r = build_vendor_panorama(_db(), 7, since="2024-10-01")
    assert r["amount_mxn"] == 90 and r["contracts"] == 2
    assert [b["institution_id"] for b in r["buyers"]] == [2]
    assert r["levels"]["high"] == 1 and r["levels"]["none"] == 1


def test_until_one_government():
    r = build_vendor_panorama(_db(), 7, since="2019-01-01", until="2024-09-30")
    assert r["amount_mxn"] == 310 and r["contracts"] == 2


# ── against the real DB (skipped without it) ──

def test_api_maypo_levels_match_contracts(client):
    r = client.get("/api/v1/vendors/2873/panorama")
    assert r.status_code == 200
    p = r.json()
    assert sum(p["levels"].values()) == p["contracts"] > 0
    assert p["buyers"] and abs(sum(b["share_pct"] for b in p["buyers"]) - 100) < 1  # 89 buyers, the 50 largest ≈ all
    hoy = client.get("/api/v1/vendors/2873/panorama?since=2024-10-01").json()
    assert 0 < hoy["contracts"] < p["contracts"] and all(set(b["gobs"]) <= {"sheinbaum"} for b in hoy["buyers"])
    k = client.get("/api/v1/vendors/2873/contracts?since=2024-10-01&risk_level=high&per_page=5").json()
    assert k["pagination"]["total"] == hoy["levels"]["high"]
    assert all(x["contract_date"] >= "2024-10-01" for x in k["data"])
    assert client.get("/api/v1/vendors/2873/panorama?since=2024-1").status_code == 422
    assert client.get("/api/v1/vendors/99999999/panorama").status_code == 404
