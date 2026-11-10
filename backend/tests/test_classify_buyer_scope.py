"""Buyer scope classifier (docs/PLAN_INSTITUTION_SCOPE_2026-10-22.md Phase 0)."""
import sqlite3

import pytest

from scripts.classify_buyer_scope import apply, build_plan, parse_municipality, parse_state

pytestmark = pytest.mark.no_db


def test_parse_state_from_siglas_prefix_and_name():
    assert parse_state("Q ROO-Secretaría de Salud", None) == "23"
    assert parse_state("OAX-Servicios de Salud de Oaxaca", None) == "20"
    assert parse_state("Servicios de Salud de Veracruz de Ignacio de la Llave", None) == "30"
    assert parse_state("Instituto de Vivienda del Estado de México", None) == "15"
    assert parse_state("Dirección de Obras", "TAMPS") == "28"
    # «México» alone is the country, never a state guess
    assert parse_state("Comisión Federal de Electricidad México", None) is None


def test_parse_municipality_within_state():
    assert parse_municipality("H. Ayuntamiento de Calvillo", "01") == "01003"
    assert parse_municipality("Municipio de Asientos, Aguascalientes", "01") == "01002"
    assert parse_municipality("Presidencia Municipal de San Pedro Garza García", "19") == "19019"
    # a municipality of another state never matches
    assert parse_municipality("Municipio de Calvillo", "19") is None
    assert parse_municipality("_Gobierno Municipal del Estado de Jalisco", "14") is None


def _db():
    c = sqlite3.connect(":memory:")
    c.executescript("""
        CREATE TABLE institutions (id INTEGER PRIMARY KEY, name TEXT, siglas TEXT);
        CREATE TABLE institution_canonical (institution_id INTEGER PRIMARY KEY, canonical_id INTEGER,
            level TEXT, state_inegi TEXT, municipality_inegi TEXT);
        INSERT INTO institutions VALUES
          (1, 'SECRETARIA DE SALUD', 'SSA'),
          (2, 'ADMINISTRACIÓN PORTUARIA INTEGRAL DE BAJA CALIFORNIA SUR S.A. DE C.V.', NULL),
          (3, 'BCS-Administración Portuaria Integral de Baja California Sur', NULL),
          (4, 'UNIVERSIDAD TECNOLÓGICA DE LEÓN', NULL),
          (5, 'H. Ayuntamiento de Calvillo', NULL),
          (6, 'OAX-Servicios de Salud de Oaxaca', NULL),
          (7, 'Centro de Investigación Científica de Yucatán, A.C.', NULL),
          (8, 'YUC-Centro de Investigación Científica de Yucatán', NULL),
          (9, 'Instituto Electoral', NULL);
        INSERT INTO institution_canonical VALUES
          (1, 1, 'federal', NULL, NULL),
          (2, 2, 'state', '03', NULL),
          (3, 2, 'state', '03', NULL),
          (4, 4, 'unknown', NULL, NULL),
          (5, 5, 'municipal', '01', NULL),
          (6, 6, 'state', NULL, NULL),
          (7, 7, 'federal', '31', NULL),
          (8, 7, 'state', '31', NULL),
          (9, 9, 'autonomous', NULL, NULL);
    """)
    return c


def test_plan_levels_overrides_and_group_consistency():
    got = {r["institution_id"]: (r["buyer_level"], r["state_code"], r["municipality_code"])
           for r in build_plan(_db())}
    assert got[1] == ("federal", None, None)
    assert got[2] == got[3] == ("federal", None, None)      # API BCS override, whole group
    assert got[4] == ("estatal", "11", None)                 # «unknown» tecnológica override
    assert got[5] == ("municipal", "01", "01003")            # municipality parsed from the name
    assert got[6] == ("estatal", "20", None)                 # state parsed when the column is empty
    assert got[7] == got[8] == ("federal", None, None)       # members follow their canonical row
    assert got[9] == ("federal", None, None)                 # autonomous counts as federal


def test_apply_is_idempotent():
    c = _db()
    assert apply(c, build_plan(c)) == 9
    assert apply(c, build_plan(c)) == 0
    assert c.execute("SELECT buyer_level, state_code, municipality_code FROM institution_canonical "
                     "WHERE institution_id = 5").fetchone() == ("municipal", "01", "01003")
