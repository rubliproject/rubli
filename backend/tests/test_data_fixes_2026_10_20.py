"""Owner-approved data fixes 2026-10-20 (money paths, written test-first).

(The decimal-error rule, scripts/apply_amount_corrections.py, ships with batch 3b.)
2. /gap amounts from ComprasMX open data (scripts/gap_amounts_from_datos.py): per procedure,
   sum the open-data contracts (reject / fx_missing skipped), vendor = largest contract's
   proveedor, never a persona fisica.
"""
import sqlite3

import pytest

from scripts import gap_amounts_from_datos as gd

pytestmark = pytest.mark.no_db  # pure functions + in-memory DBs


# ---------- 2. gap amounts from datos ----------
def test_aggregate_procedure():
    rows = [  # (amount_mxn, amount_flag, proveedor, vendor_match)
        (1_000_000.0, None, "ACME SA DE CV", "matched"),
        (2_600_000.0, None, "JUAN PEREZ LOPEZ", "persona_fisica"),
        (9e12, "reject", "BAD SA", None),
        (5.0, "fx_missing", "USD SA", None),
    ]
    amt, vendor, flag = gd.aggregate(rows)
    assert amt == 3_600_000.0
    assert vendor is None           # largest usable contract is a persona fisica -> never its name
    assert flag is None


def test_aggregate_vendor_and_flag():
    amt, vendor, flag = gd.aggregate([(12e9, None, "MEGA SA DE CV", "matched"), (1e6, None, "MINI SA", None)])
    assert amt == 12e9 + 1e6 and vendor == "MEGA SA DE CV" and flag == "over_10b_review"


def test_aggregate_all_unusable_is_none():
    assert gd.aggregate([(9e12, "reject", "X", None)]) == (None, None, None)


def test_apply_gap_on_toy_db():
    c = sqlite3.connect(":memory:")
    c.execute("""CREATE TABLE gap_contracts (procedure_number TEXT, amount_mxn_best TEXT,
                 amount_mxn_recovered TEXT, amount_source TEXT, vendor TEXT, amount_review_flag TEXT)""")
    c.execute("""CREATE TABLE comprasmx_contracts (numero_procedimiento TEXT, amount_mxn REAL,
                 amount_flag TEXT, proveedor TEXT, vendor_match TEXT)""")
    c.executemany("INSERT INTO gap_contracts VALUES (?,?,?,?,?,?)", [
        ("P1", "15700000000", None, "estimated", "OCR VENDOR", "over_10b_review"),
        ("P2", None, None, "none", None, None),
        ("P3", "500", "500", "fallo_ocr", "", None),       # unmatched -> untouched
        ("P4", "7", None, "estimated", None, None),        # procedure on two gap rows: summing
        ("P4", "9", None, "estimated", None, None),        # onto both would double count -> untouched
    ])
    c.executemany("INSERT INTO comprasmx_contracts VALUES (?,?,?,?,?)", [
        ("P1", 3_600_000.0, None, "DATOS SA", None),
        ("P2", 100.0, None, "NUEVO SA DE CV", "matched"),
        ("P4", 50.0, None, "DUP SA", None)])
    stats = gd.apply(c)
    rows = {r[0]: r[1:] for r in c.execute(
        "SELECT procedure_number, CAST(amount_mxn_best AS REAL), amount_mxn_ocr, amount_source, vendor, "
        "amount_review_flag FROM gap_contracts")}
    assert rows["P1"] == (3_600_000.0, "15700000000", "datos", "OCR VENDOR", None)  # vendor kept (not empty)
    assert rows["P2"] == (100.0, None, "datos", "NUEVO SA DE CV", None)
    assert rows["P3"] == (500.0, "500", "fallo_ocr", "", None)
    assert stats["matched"] == 2 and stats["skipped_duplicate_procedure_rows"] == 2
    assert {r[0] for r in c.execute("SELECT amount_source FROM gap_contracts WHERE procedure_number='P4'")} == {"estimated"}
    gd.apply(c)  # idempotent: amount_mxn_ocr keeps the ORIGINAL OCR value
    assert c.execute("SELECT amount_mxn_ocr FROM gap_contracts WHERE procedure_number='P1'").fetchone()[0] == "15700000000"


def test_contracts_canon_view_builds_when_contracts_has_amount():
    # regression: the 100B cap rendered as "c.COALESCE(amount_mxn, 0)" -> sqlite syntax error
    from scripts._institution_canonical import install_contracts_canon
    c = sqlite3.connect(":memory:")
    c.execute("CREATE TABLE contracts (id INT, institution_id INT, vendor_id INT, amount_mxn REAL)")
    c.execute("CREATE TABLE institution_canonical (institution_id INT, canonical_id INT)")
    c.executemany("INSERT INTO contracts VALUES (?,?,?,?)", [(1, 5, 7, 10.0), (2, 6, 7, 2e11)])
    c.execute("INSERT INTO institution_canonical VALUES (6, 5)")
    install_contracts_canon(c)
    assert c.execute("SELECT id, institution_id FROM contracts_canon").fetchall() == [(1, 5)]


def test_aggregate_ignores_sub_peso_placeholders():
    # open-ended travel / fumigation contracts publish 1e-06 or 0.21 MXN; OCR had the real value
    assert gd.aggregate([(1e-06, None, "AGENCIA SA", None)]) == (None, None, None)
    assert gd.aggregate([(0.9, None, "GAS SA", None), (500.0, None, "GAS SA", None)])[0] == 500.0
