"""precompute_recent: 14-day window, >100B rejected, personas físicas never named."""
import sqlite3

import pytest

from scripts.precompute_recent import compute


@pytest.mark.no_db
def test_recent_window_and_privacy():
    c = sqlite3.connect(":memory:")
    c.execute("""CREATE TABLE comprasmx_contracts (codigo_contrato TEXT, fecha_publicacion TEXT, amount_mxn REAL,
        is_direct_award INT, is_persona_fisica INT, titulo_contrato TEXT, siglas TEXT, institucion TEXT,
        institution_id INT, proveedor TEXT, vendor_id INT, orden_gobierno TEXT)""")
    c.execute("CREATE TABLE contracts (id INT, contract_number TEXT, risk_level TEXT, risk_score REAL, source_structure TEXT)")
    rows = [("A", "2026-10-27 10:00", 5e6, 1, 0, "obra", "IMSS", "IMSS", 251, "ACME SA", 7, "APF"),
            ("B", "2026-10-20", 9e6, 0, 1, "servicio de JUAN PEREZ", "SEP", "SEP", 2, "JUAN PEREZ", 8, "APF"),
            ("C", "2026-10-14", 2e6, 0, 0, "bien", "SEP", "SEP", 2, "BETA SA", 9, "APF"),   # day 14: in
            ("D", "2026-10-13", 7e6, 0, 0, "bien", "SEP", "SEP", 2, "GAMMA SA", 10, "APF"),  # day 15: out
            ("E", "2026-10-26", 2e11, 0, 0, "error", "X", "X", 3, "ZETA SA", 11, "APF")]     # > 100B: out
    c.executemany("INSERT INTO comprasmx_contracts VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", rows)
    c.execute("INSERT INTO contracts VALUES (99, 'A', 'high', 0.5, 'E')")
    d = compute(c)
    assert d["newest"] == "2026-10-27" and d["start"] == "2026-10-14"
    assert d["n"] == 3 and d["value"] == 16e6 and d["buyers"] == 2
    top = d["largest"]
    assert [x["amount"] for x in top] == [9e6, 5e6, 2e6]
    assert top[0]["vendor"] == "JUAN PEREZ" and top[0]["persona_fisica"] and top[0]["vendor_id"] == 8  # named + labelled (10-29)
    assert top[0]["title"] is None                                        # the title can carry the name
    assert top[1]["contract_id"] == 99 and top[1]["risk_level"] == "high"  # scored rows carry their register id
