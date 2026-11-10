"""ComprasMX row → contracts row reproduces what CompraNet stored for the same contract."""
import pytest

from scripts.integrate_comprasmx import _contract_date, contract_record

pytestmark = pytest.mark.no_db

# LO-09-642-009000960-N-5-2025, in both sources (CompraNet id 3018225)
ROW = {
    "fecha_firma": "2025-03-21 00:00:00", "fecha_inicio": "2025-04-01", "fecha_fin": "2025-06-29",
    "fecha_fallo": "2025-03-14 20:00:00", "fecha_publicacion": "2025-01-16 21:36:06",
    "fecha_apertura": "2025-02-05 17:30:00", "amount_mxn": 4157987.95, "importe_drc": 4157987.95,
    "tipo_procedimiento": "LICITACIÓN PÚBLICA", "tipo_contratacion": "OBRA PÚBLICA",
    "codigo_contrato": "C-2025-00027115", "numero_procedimiento": "LO-09-642-009000960-N-5-2025",
    "codigo_expediente": "E-2025-00007004", "titulo_contrato": "CONSERVACION PERIODICA", "titulo_expediente": None,
    "descripcion_contrato": "x", "partida_especifica": "62502", "caracter": "NACIONAL", "forma_participacion": "MIXTA",
    "moneda": "MXN", "contrato_marco": None, "compra_consolidada": "NO", "plurianual": "NO",
    "estatus_contrato": "FORMALIZADO", "articulo_excepcion": None, "caso_fortuito": "NO",
    "sector_id": 3, "category_id": 27, "category_source": "regex", "proveedor": "AGACEL AGREGADOS Y ASFALTOS SA DE CV",
}


def test_matches_compranet_semantics():
    r = contract_record(ROW, vendor_id=66409, institution_id=3671)
    assert r["source_structure"] == "E"
    assert (r["contract_date"], r["start_date"], r["end_date"], r["award_date"], r["publication_date"]) == (
        "2025-03-21", "2025-04-01", "2025-06-29", "2025-03-14", "2025-01-16")
    assert (r["contract_year"], r["contract_month"]) == (2025, 3)
    assert r["publication_delay_days"] == 64          # CompraNet stored 64
    assert r["sexenio_year"] == 2 and r["is_election_year"] == 0
    assert r["procedure_type_normalized"] == "licitacion" and r["is_direct_award"] == 0
    assert r["contract_type_normalized"] == "obra_publica"
    assert (r["is_framework"], r["is_consolidated"], r["is_multiannual"], r["is_high_value"]) == (0, 0, 0, 0)
    assert r["risk_score"] is None                    # scored only after the retrain


def test_flags_and_fallback_dates():
    r = contract_record({**ROW, "fecha_firma": None, "amount_mxn": 15e9, "plurianual": "SÍ", "moneda": "USD"}, 1, 1)
    assert r["contract_date"] == "2025-04-01"          # signing missing → start date
    assert r["is_high_value"] == 1 and r["is_multiannual"] == 1 and r["is_foreign_currency"] == 1


def test_no_future_contract_dates():
    r = contract_record({**ROW, "fecha_firma": None, "fecha_inicio": "2099-12-01"}, 1, 1)
    assert r["contract_date"] == "2025-01-16"          # future start date skipped → publication
    assert r["opening_date"] == "2025-02-05"


def test_undated_rows_wait():
    # only a future start and no signing/publication date → no contract date → integrate skips it
    assert _contract_date({**ROW, "fecha_firma": None, "fecha_publicacion": None, "fecha_inicio": "2099-12-01"}) is None
    assert _contract_date(ROW) is not None


def staging_db(path):
    """Synthetic DB: one contract already loaded (E), one CompraNet duplicate, one >100B and one
    waiting for a date — integrate's plan loads nothing. Shared with test_comprasmx_weekly."""
    import sqlite3
    c = sqlite3.connect(path)
    c.executescript("""
        CREATE TABLE institution_canonical (institution_id, canonical_id);
        CREATE TABLE vendor_canonical (vendor_id, canonical_id);
        CREATE TABLE contracts (id INT, source_structure TEXT, procedure_number TEXT, contract_number TEXT,
                                amount_mxn REAL, vendor_id INT, contract_date TEXT, risk_score REAL);
        CREATE TABLE comprasmx_contracts (codigo_contrato, numero_procedimiento, rfc, amount_mxn, fecha_firma,
                                          fecha_inicio, fecha_publicacion, institution_id, clave_institucion);
        INSERT INTO contracts VALUES (1, 'E', 'P1', 'C1', 100, 7, '2026-10-01', 0.1),
                                     (2, 'D', 'P2', 'X', 500, 8, '2025-05-01', 0.1);
        INSERT INTO comprasmx_contracts VALUES
          ('C1', 'P1', 'AAA', 100, '2026-10-01', NULL, '2026-10-02', 1, 'K'),
          ('C2', 'P2', 'BBB', 500, '2025-05-01', NULL, '2025-05-02', 1, 'K'),
          ('C3', 'P3', 'CCC', 2e11, '2026-10-01', NULL, '2026-10-02', 1, 'K'),
          ('C4', 'P4', 'DDD', 10, NULL, '2099-01-01', NULL, 1, 'K');
    """)
    c.commit()
    return c


UNLOADED = "INSERT INTO comprasmx_contracts VALUES ('C5', 'P5', 'EEE', 50, '2026-10-20', NULL, '2026-10-21', 1, 'K')"


def test_plan_counts_only_what_would_load(tmp_path):
    from scripts.integrate_comprasmx import plan_load
    c = staging_db(tmp_path / "t.db")
    plan, _ = plan_load(c, {})
    assert (plan["load"], plan["skip_dup"], plan["reject_100b"], plan["skip_undated"]) == (0, 2, 1, 1)
    c.execute(UNLOADED)  # staged by a run that died before integrate
    plan, to_load = plan_load(c, {})
    assert plan["load"] == 1 and to_load[0][0]["codigo_contrato"] == "C5"
