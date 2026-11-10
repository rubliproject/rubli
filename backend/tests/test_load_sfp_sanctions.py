"""SFP sanctions loader — real-format rows from backend/data/proveedores_sancionados.csv.

The Jan-2021 directory CSV: «, \\t» separators, DD/MM/YYYY dates, PLAZO as text.
docs/PROCUREMENT_LAW_STUDY_2026-10-30.md § 3 / § 4.3.
"""
import sqlite3

import pytest

from scripts.load_sfp_sanctions import parse_csv, save_to_db

pytestmark = pytest.mark.no_db

HEADER = ("PROVEEDOR O CONTRATISTA, \tDEPENDENCIA, \tNUMERO DE EXPEDIENTE, \tHECHOS DE LA IRREGULARIDAD, "
          "\tOBJETO SOCIAL, \tSENTIDO DE RESOLUCION, \tFECHA DE NOTIFICACION, \tFECHA DE RESOLUCION, "
          "\tPLAZO, \tMONTO, \tNOMBRE DEL RESPONSABLE DE LA INFORMACION, \tFECHA DE ACTUALIZACION \n")
ROWS = [
    # ban: notified 06/12/2016, 4 years
    "A AND P INTERNATIONAL,\tPEMEX GAS Y PETROQUIMICA BASICA,\t0002/2016,\tLO PREVISTO,\t,"
    "\tSANCIONATORIA CON MULTA E INHABILITACIÓN,\t06/12/2016,\t06/12/2016,\t4 AÑOS,\t1.00,\t,\t14/01/2021 08:01\n",
    # fine only: resolution (06/08) precedes notification (19/08) — no ban, no end
    "3R INNOVACIÓN Y DISEÑO  S.A. DE  C.V.,\tINSTITUTO MEXICANO DEL SEGURO SOCIAL,\t0041/2013,\tNO FORMALIZO.,\tX,"
    "\tSANCIONATORIA CON MULTA,\t19/08/2014,\t06/08/2014,\t,\t90664.00,\tLIC. X,\t14/01/2021 08:01\n",
    # years + months, end clamps to month end
    "DIMEXPRESS  S. DE R.L. DE C.V.,\tINSTITUTO MEXICANO DEL SEGURO SOCIAL,\t0001/2019,\tH,\tO,"
    "\tSANCIONATORIA CON MULTA E INHABILITACIÓN,\t31/01/2019,\t30/01/2019,\t1 AÑO 1 MES,\t226424.00,\tR,\t14/01/2021 08:01\n",
    # 2006 row: no dates, plazo in words, month-name date elsewhere
    "COMPUTER QUICK DE MEXICO,\tDICONSA,\t0004/2006,\t,\tCOMPRA VENTA,\t,\t,\t,\tTRES MESES,\t,\t,\t14/01/2021 08:01\n",
    "JUAN PABLO EGUIA,\tCOMISION NACIONAL DE ZONAS,\t0001/2006,\t,\tCARPINTERIA,\t,\t30/Jun/2006,\t,\tTRES MESES,\t70,\t,\t14/01/2021 08:01,\textra\n",
]


def _parse():
    return {r["company_name"][:8]: r for r in parse_csv(HEADER + "".join(ROWS), source="test.csv")}


def test_ban_window_is_notification_plus_plazo():
    r = _parse()["A AND P "]
    assert (r["sanction_start"], r["sanction_end"]) == ("2016-12-06", "2020-12-06")
    assert r["plazo_months"] == 48 and r["plazo_text"] == "4 AÑOS"
    assert r["expediente"] == "0002/2016"


def test_fine_only_has_no_ban_end_and_keeps_resolution_date():
    r = _parse()["3R INNOV"]
    assert r["sanction_start"] == "2014-08-19"
    assert r["resolution_date"] == "2014-08-06"
    assert r["sanction_end"] is None and r["plazo_months"] is None


def test_years_and_months_with_month_end_clamp():
    r = _parse()["DIMEXPRE"]
    assert r["plazo_months"] == 13
    assert r["sanction_end"] == "2020-02-29"


def test_word_plazo_and_missing_or_month_name_dates():
    p = _parse()
    q = p["COMPUTER"]
    assert q["plazo_months"] == 3 and q["sanction_start"] is None and q["sanction_end"] is None
    j = p["JUAN PAB"]
    assert (j["sanction_start"], j["sanction_end"]) == ("2006-06-30", "2006-09-30")


def test_save_rebuilds_idempotently_and_keeps_legacy_table(tmp_path):
    db = tmp_path / "t.db"
    conn = sqlite3.connect(db)
    conn.executescript("""
        CREATE TABLE sfp_sanctions (id INTEGER PRIMARY KEY AUTOINCREMENT, rfc TEXT, company_name TEXT NOT NULL,
            sanction_type TEXT, sanction_start TEXT, sanction_end TEXT, amount_mxn REAL, authority TEXT,
            source_url TEXT, loaded_at TEXT);
        CREATE INDEX idx_sfp_sanctions_rfc ON sfp_sanctions(rfc);
        INSERT INTO sfp_sanctions (company_name, sanction_start, sanction_end, source_url)
            VALUES ('Rafael', NULL, NULL, 'https://x/servidores_publicos_sancionados.csv'),
                   ('A AND P INTERNATIONAL', '06/12/2016', '06/12/2016', 'old.csv');
    """)
    conn.commit()
    conn.close()
    recs = parse_csv(HEADER + "".join(ROWS), source="test.csv")
    assert save_to_db(recs, db) == len(ROWS)
    assert save_to_db(recs, db) == len(ROWS)  # second run: same table, no duplicates
    conn = sqlite3.connect(db)
    assert conn.execute("SELECT COUNT(*) FROM sfp_sanctions").fetchone()[0] == len(ROWS)
    assert conn.execute("SELECT COUNT(*) FROM sfp_sanctions_legacy").fetchone()[0] == 2  # rollback source
    assert conn.execute("SELECT COUNT(*) FROM sfp_sanctions WHERE company_name='Rafael'").fetchone()[0] == 0
    idx = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='sfp_sanctions'")}
    assert {"idx_sfp_sanctions_rfc", "idx_sfp_sanctions_name"} <= idx
