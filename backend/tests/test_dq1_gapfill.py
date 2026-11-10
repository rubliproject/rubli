"""DQ1 § 1 — gap-fill rows: repaired from the CSV, never inserted blank."""
import sqlite3

import pytest

from scripts import dq1_gapfill_repair as R
from scripts._validate_and_gapfill_comprasmx import gapfill_values

pytestmark = pytest.mark.no_db

CSV = {
    "Orden de gobierno": "APF", "Número de procedimiento": "AA-07-H0C-007H0C999-N-84-2024",
    "Importe DRC": "712217.5", "Título del contrato": "ELABORACIÓN DE SISTEMA DE GESTIÓN AMBIENTAL",
    "Descripción del contrato": "x", "Código del contrato": "C-2024-00118295", "Código del expediente": "E-2024-00086454",
    "Partida específica": "33303", "Fecha de firma del contrato": "2024-09-12 18:11:08",
    "Fecha de inicio del contrato": "02/09/2024", "Fecha de fin del contrato": "31/12/2024",
    "Fecha de publicación": "2024-08-13 23:49:53", "Fecha de fallo": "2024-08-30 00:00:00",
    "rfc": "A&E0509282Q9", "Proveedor o contratista": "ANALYSIS & EXPERTISE SC", "Estratificación": "PEQUEÑA",
    "País de la empresa": "MX", "Institución": "GRUPO AEROPORTUARIO OLMECA-MAYA-MEXICA", "Clave Institución": "007H0C",
}


def test_csv_fields_maps_title_number_date_year():
    f = R.csv_fields(CSV)
    assert f["title"].startswith("ELABORACIÓN") and f["contract_number"] == "C-2024-00118295"
    assert (f["contract_date"], f["contract_year"], f["contract_month"]) == ("2024-09-12", 2024, 9)
    assert f["start_date"] == "2024-09-02" and f["rfc"] == "A&E0509282Q9"


def test_signing_date_missing_falls_back_never_future():
    f = R.csv_fields({**CSV, "Fecha de firma del contrato": "", "Fecha de inicio del contrato": "01/01/2099"})
    assert f["contract_date"] == "2024-08-13"


def test_gapfill_refuses_blank_rows():
    assert gapfill_values(R.csv_fields(CSV))[0].startswith("ELABORACIÓN")
    assert gapfill_values(R.csv_fields({**CSV, "Título del contrato": ""})) is None
    assert gapfill_values(R.csv_fields({**CSV, "rfc": "", "Proveedor o contratista": ""})) is None
    assert gapfill_values(R.csv_fields({**CSV, "Fecha de firma del contrato": "", "Fecha de inicio del contrato": "",
                                        "Fecha de publicación": ""})) is None


def _db():
    c = sqlite3.connect(":memory:")
    c.executescript("""
        CREATE TABLE vendors (id INTEGER PRIMARY KEY, rfc TEXT, name TEXT, name_normalized TEXT,
            size_stratification TEXT, country_code TEXT, is_individual INTEGER, created_at TEXT);
        CREATE TABLE vendor_canonical (vendor_id INTEGER PRIMARY KEY, canonical_id INTEGER, group_size INTEGER, match_basis TEXT);
        CREATE TABLE institutions (id INTEGER PRIMARY KEY, name TEXT, name_normalized TEXT, siglas TEXT,
            clave_institucion TEXT, tipo TEXT, gobierno_nivel TEXT, created_at TEXT);
        CREATE TABLE contracts (id INTEGER PRIMARY KEY, source_structure TEXT, title TEXT, description TEXT,
            contract_number TEXT, expedient_code TEXT, partida_especifica TEXT, contract_date TEXT,
            contract_year INTEGER, contract_month INTEGER, is_year_end INTEGER, vendor_id INTEGER,
            institution_id INTEGER, procedure_number TEXT, amount_mxn REAL, start_date TEXT, end_date TEXT,
            award_date TEXT, publication_date TEXT, is_single_bid INTEGER, is_direct_award INTEGER);
        INSERT INTO vendors VALUES (10, 'A&E0509282Q9', 'ANALYSIS AND EXPERTISE', 'ANALYSIS AND EXPERTISE', NULL, 'MX', 0, NULL),
                                   (11, 'A&E0509282Q9', 'ANALYSIS & EXPERTISE SC', 'X', NULL, 'MX', 0, NULL);
        INSERT INTO vendor_canonical VALUES (10, 10, 2, 'rfc'), (11, 10, 2, 'rfc');
        INSERT INTO institutions VALUES (5, 'GAFSA', 'GAFSA', 'G', '007H0C', NULL, NULL, NULL);
        INSERT INTO contracts VALUES
          (1, 'D', NULL, 'gap-fill desc', NULL, 'E-1', '33303', NULL, 2025, 11, 1, NULL, NULL,
           'AA-07-H0C-007H0C999-N-84-2024', 712217.5, '2024-09-02', '2024-12-31', '2024-08-30', '2024-08-13', NULL, 0),
          (2, 'D', NULL, NULL, NULL, NULL, NULL, NULL, 2024, NULL, 0, NULL, NULL,
           'NO-SUCH-PROC', 5.0, NULL, NULL, NULL, NULL, NULL, 0),
          (3, 'D', 'kept', NULL, 'C-1', NULL, NULL, '2024-01-01', 2024, 1, 0, 10, 5, 'P', 1.0, NULL, NULL, NULL, NULL, 0, 0);
    """)
    return c


def test_repair_apply_and_rollback():
    c = _db()
    by_proc = {CSV["Número de procedimiento"]: [CSV]}
    dry = R.run(c, by_proc, apply=False)
    assert (dry["blank_rows"], dry["repaired"], dry["excluded"]) == (2, 1, 1)
    assert c.execute("SELECT title FROM contracts WHERE id = 1").fetchone()[0] is None  # dry run wrote nothing

    st = R.run(c, by_proc, apply=True)
    assert st["vendor_rfc"] == 1 and st["inst_clave"] == 1 and st["year_changed"] == 1
    row = c.execute("SELECT title, contract_number, contract_date, contract_year, vendor_id, institution_id, "
                    "is_single_bid, public_excluded FROM contracts WHERE id = 1").fetchone()
    assert row[1:] == ("C-2024-00118295", "2024-09-12", 2024, 10, 5, 1, 0)   # RFC → canonical 10, not a new vendor
    assert c.execute("SELECT public_excluded FROM contracts WHERE id = 2").fetchone()[0] == 1
    assert c.execute("SELECT COUNT(*) FROM vendors").fetchone()[0] == 2
    assert R.run(c, by_proc, apply=False)["blank_rows"] == 1                    # idempotent: only the excluded row left

    before = c.execute("SELECT * FROM dq1_gapfill_backup ORDER BY id").fetchall()
    R.run(c, by_proc, apply=True)                                              # second apply
    assert c.execute("SELECT * FROM dq1_gapfill_backup ORDER BY id").fetchall() == before   # backup untouched

    assert R.rollback(c) is True
    assert c.execute("SELECT title, description, expedient_code, partida_especifica, vendor_id, contract_year, "
                     "contract_month, is_year_end, public_excluded, is_single_bid FROM contracts WHERE id = 1").fetchone()         == (None, 'gap-fill desc', 'E-1', '33303', None, 2025, 11, 1, 0, None)   # lossless
    assert c.execute("SELECT public_excluded FROM contracts WHERE id = 2").fetchone()[0] == 0
    assert c.execute("SELECT title FROM contracts WHERE id = 3").fetchone()[0] == "kept"


def test_new_vendor_created_once_and_persona_fisica_never_name_merged():
    c = _db()
    res = R.Resolver(c)
    f = R.csv_fields({**CSV, "rfc": "GOMA800101AB1", "Proveedor o contratista": "ANALYSIS AND EXPERTISE"})
    basis, vid = res.vendor(f, create=True)
    assert basis == "new" and vid not in (10, 11)
    assert c.execute("SELECT is_individual FROM vendors WHERE id = ?", (vid,)).fetchone()[0] == 1
    assert res.vendor(f, create=True) == ("rfc", vid)


def test_rollback_without_backup_is_a_clean_no_op(capsys):
    c = _db()
    assert R.rollback(c) is False
    assert "nothing to roll back" in capsys.readouterr().out
