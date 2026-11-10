"""B-02 (_security/backend.md): non-JSON exports bypass RfcRedactionMiddleware,
so persona-física RFCs (13 chars) must be stripped at the call site."""
import re

import pytest

# 4 letters + YYMMDD + 3 — persona física; matches anywhere in a CSV cell.
PERSON_RFC = re.compile(r"(?<![A-Za-z0-9&Ñ])[A-ZÑ&]{4}\d{6}[A-Z0-9]{3}(?![A-Za-z0-9])")


@pytest.mark.parametrize("qs", [
    "min_risk=0&limit=5000",
    "min_risk=0&risk_level=low&limit=5000",
    "min_risk=0&risk_level=medium&limit=5000",
])
def test_vendors_export_never_emits_person_rfc(client, qs):
    r = client.get(f"/api/v1/vendors/export?{qs}")
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/csv")
    assert not PERSON_RFC.search(r.text)


# ── B-08 / B-15: free-text RFCs + formula injection in every file writer ────

@pytest.mark.no_db
def test_export_cell_sanitizer_redacts_person_rfc():
    from api.routers.export import sanitize_csv_cell

    out = sanitize_csv_cell("Pago a GOMJ800101AB1 por servicios")
    assert not PERSON_RFC.search(out)
    assert sanitize_csv_cell("ABC800101AB1") == "ABC800101AB1"  # company RFC is public
    assert sanitize_csv_cell("=HYPERLINK(1)").startswith("'")


@pytest.mark.no_db
def test_dossier_zip_has_no_person_rfc_and_no_live_formula():
    import csv
    import io
    import zipfile

    from api.routers.dossier import _build_dossier_zip

    ctx = {
        "title": "T", "notes": "persona GOMJ800101AB1",
        "top_contracts": [{"id": 1, "title": "=cmd|' /C calc'!A0 GOMJ800101AB1", "vendor_name": "GOMJ800101AB1"}],
    }
    zf = zipfile.ZipFile(io.BytesIO(_build_dossier_zip(ctx)))
    for name in zf.namelist():
        assert not PERSON_RFC.search(zf.read(name).decode("utf-8")), name
    rows = list(csv.reader(io.StringIO(zf.read("contracts.csv").decode("utf-8"))))
    assert not rows[1][2].startswith("=")


# ── CLICKPATH_AUDIT_2026-10-30 #17: per-row RFC check on every file export ──

def _pf_and_company():
    """One persona física (13-char RFC) and one company (12-char RFC), both with contracts."""
    import sqlite3

    from api.dependencies import DB_PATH

    with sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True) as c:
        q = ("SELECT v.id, v.name, v.rfc FROM vendors v JOIN vendor_stats vs ON vs.vendor_id = v.id "
             "WHERE length(v.rfc) = ? AND v.is_individual = ? AND vs.total_contracts BETWEEN 2 AND 50 "
             "AND length(v.name) >= 8 LIMIT 1")
        return c.execute(q, (13, 1)).fetchone(), c.execute(q, (12, 0)).fetchone()


def _csv_col(text, col):
    import csv
    import io

    rows = list(csv.DictReader(io.StringIO(text)))
    assert rows, "export returned no rows"
    return {r[col] for r in rows}


def test_contracts_csv_blanks_pf_rfc_keeps_company(client):
    pf, co = _pf_and_company()
    r = client.get(f"/api/v1/export/contracts/csv?vendor_id={pf[0]}")
    assert r.status_code == 200
    assert _csv_col(r.text, "vendor_rfc") == {""} and pf[2] not in r.text
    r = client.get(f"/api/v1/export/contracts/csv?vendor_id={co[0]}")
    assert _csv_col(r.text, "vendor_rfc") == {co[2].strip().upper()}


def test_contracts_excel_blanks_pf_rfc_keeps_company(client):
    import io

    from openpyxl import load_workbook

    pf, co = _pf_and_company()
    for vendor, want in ((pf, {None}), (co, {co[2].strip().upper()})):
        r = client.get(f"/api/v1/export/contracts/excel?vendor_id={vendor[0]}")
        assert r.status_code == 200
        rows = list(load_workbook(io.BytesIO(r.content), read_only=True).active.iter_rows(values_only=True))
        i = rows[0].index("Vendor RFC")
        assert {row[i] for row in rows[1:]} == want


def test_vendors_csv_blanks_pf_rfc_keeps_company(client):
    pf, co = _pf_and_company()
    for vendor, want in ((pf, ""), (co, co[2].strip().upper())):
        r = client.get("/api/v1/export/vendors/csv", params={"search": vendor[1], "limit": 50})
        assert r.status_code == 200
        import csv
        import io
        row = next(x for x in csv.DictReader(io.StringIO(r.text)) if x["id"] == str(vendor[0]))
        assert row["rfc"] == want


# ── file exports write the stored RFC only through public_rfc (malformed 12-char values never leave) ──

@pytest.mark.no_db
@pytest.mark.parametrize("bad", ["1234567890AB", "AB1800101AB1", "ABC8001X1AB1", "AB-800101AB1", "10861.0", "AAAA800101AB1"])
def test_public_rfc_rejects_malformed_and_person(bad):
    from api.pii import public_rfc

    assert public_rfc(bad) is None
    assert public_rfc(" abc800101ab1 ") == "ABC800101AB1"


@pytest.mark.no_db
def test_every_file_export_selecting_rfc_calls_public_rfc():
    import ast
    import inspect

    from api.routers import export, vendors

    for mod in (export, vendors):
        for fn in ast.walk(ast.parse(inspect.getsource(mod))):
            if isinstance(fn, ast.FunctionDef):
                src = ast.get_source_segment(inspect.getsource(mod), fn)
                if "ELSE v.rfc" in src and ("csv" in src.lower() or "excel" in src.lower()):
                    assert "public_rfc(" in src, f"{mod.__name__}.{fn.name} writes v.rfc without public_rfc"
