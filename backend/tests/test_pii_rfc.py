"""RFC privacy guard (api/pii.py) + strict registry matching (api/sanctions.py). No DB needed."""
import pytest
from fastapi import FastAPI
from fastapi.responses import JSONResponse, PlainTextResponse
from fastapi.testclient import TestClient

from api.pii import RfcRedactionMiddleware, public_rfc, redact_person_rfcs
from api.sanctions import _match, _RegistryIndex, normalize_name

PERSON = "PEGJ800101AB1"   # 13 chars, synthetic
COMPANY = "ABC010101AB1"   # 12 chars, synthetic

pytestmark = pytest.mark.no_db


def test_public_rfc_whitelists_company_only():
    assert public_rfc(COMPANY) == COMPANY
    assert public_rfc(f" {COMPANY.lower()} ") == COMPANY
    for bad in (PERSON, "10861.0", "sin_RFC", "", None):
        assert public_rfc(bad) is None


def test_redact_text_keeps_company_and_codes():
    txt = f"RFC: {PERSON} | empresa {COMPANY} | proc LA-012M7B997-E-1-2024"
    out = redact_person_rfcs(txt)
    assert PERSON not in out and COMPANY in out and "LA-012M7B997-E-1-2024" in out
    assert redact_person_rfcs("PEGJ801301AB1") == "PEGJ801301AB1"  # month 13: not an RFC


def test_middleware_redacts_json_and_skips_other_types():
    app = FastAPI()
    app.add_middleware(RfcRedactionMiddleware)
    app.get("/j")(lambda: JSONResponse({"memo": f"RFC {PERSON}", "rfc": COMPANY, "n": "Ñ"}))
    app.get("/t")(lambda: PlainTextResponse(PERSON))
    c = TestClient(app)
    body = c.get("/j").json()
    assert PERSON not in body["memo"] and body["rfc"] == COMPANY and body["n"] == "Ñ"
    assert c.get("/t").text == PERSON  # non-JSON untouched; call sites must use public_rfc


def test_sanction_match_is_strict():
    assert normalize_name("Constructora Pérez, S.A. de C.V.") == "CONSTRUCTORA PEREZ"
    idx = _RegistryIndex(
        [{"id": 1, "rfc": None, "company_name": "GRUPO CONSTRUCTOR DEL NORTE SA DE CV"}],
        "rfc", "company_name", {"GRUPO CONSTRUCTOR DEL NORTE": 1},
    )
    assert _match(idx, "GRUPO CONSTRUCTOR DE LA COSTA", None, 20) == []  # old 20-char prefix bug
    assert _match(idx, "Grupo Constructor del Norte S.A. de C.V.", None, 20)[0]["match_basis"] == "name"


def test_external_flags_sat_efos_drops_person_rfc(monkeypatch):
    import sqlite3
    from contextlib import contextmanager
    from api.routers import vendors

    db = sqlite3.connect(":memory:")
    db.row_factory = sqlite3.Row
    db.executescript(
        "CREATE TABLE vendors(id INTEGER, name TEXT, rfc TEXT);"
        "CREATE TABLE sat_efos_vendors(rfc TEXT, company_name TEXT, stage TEXT, dof_date TEXT);"
    )
    for i, rfc in ((1, PERSON), (2, COMPANY)):
        db.execute("INSERT INTO vendors VALUES (?,?,?)", (i, f"V{i}", rfc))
        db.execute("INSERT INTO sat_efos_vendors VALUES (?,?,?,?)", (rfc, f"V{i}", "definitivo", "2020-01-01"))
    monkeypatch.setattr(vendors, "get_db", contextmanager(lambda: (yield db)))
    assert vendors.get_vendor_external_flags(1)["sat_efos"]["rfc"] is None
    assert vendors.get_vendor_external_flags(2)["sat_efos"]["rfc"] == COMPANY
