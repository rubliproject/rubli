"""Cobertura CompraNet (proposals/coverage-badge.md): Cuenta Publica ETL on synthetic data."""
import csv
import sqlite3

import pytest

from scripts import load_cuenta_publica as lc

pytestmark = pytest.mark.no_db

HEADER_2018 = ["ciclo", "mes", "clave_concepto", "concepto", "tema", "ramo_o_entidad", "ambito",
               "tipo_informacion", "base_registro", "unidad_medida", "periodo_inicial",
               "periodo_final", "frecuencia", "difusion", "monto"]
HEADER_2019 = [h.replace("clave_concepto", "clave_de_concepto").replace("tipo_informacion", "tipo_de_informacion")
               .replace("base_registro", "base_de_registro").replace("unidad_medida", "unidad_de_medida")
               for h in HEADER_2018]
# entity, entity code, concept code, concept, moment, monthly amount in thousands
LINES = [
    ("Defensa Nacional", "A005", "11100", "Otros gastos de operacion", "Pagado", 1000.0),
    ("Defensa Nacional", "A005", "21100", "Inversion fisica directa", "Pagado", 500.0),
    ("Defensa Nacional", "A005", "11000", "Servicios personales", "Pagado", 9999.0),   # not procurement
    ("Comision Federal de Electricidad (CFE)", "A212", "11100", "Otros gastos de operacion", "Pagado", 4000.0),
    ("Petroleos Mexicanos (PEMEX)", "A215", "11100", "Otros gastos de operacion", "Pagado", 2000.0),
    ("Petroleos Mexicanos (PEMEX)", "A215", "11100", "Otros gastos de operacion", "Comprometido", 2500.0),
    ("Banco del Bienestar antes (BANSEFI)", "A278", "11100", "Otros gastos de operacion", "Pagado", 1000.0),
]


def _write_csvs(root):
    for year, header in ((2018, HEADER_2018), (2019, HEADER_2019)):
        d = root / str(year)
        d.mkdir(parents=True)
        with open(d / f"asignacion_ejecucion_{year}c.csv", "w", encoding="utf-8-sig", newline="") as f:
            w = csv.writer(f)
            w.writerow(header)
            for mes in ("Enero", "Febrero"):
                for ent, code, conc, name, moment, amt in LINES:
                    w.writerow([year, mes, code + conc + moment[0], name, "t", ent, "Federal", "Gasto",
                                moment, "Miles de Pesos", "x", "y", "Mensual", "z", amt])


def _db(path):
    c = sqlite3.connect(path)
    c.executescript("""
        CREATE TABLE institutions (id INTEGER PRIMARY KEY, name TEXT, siglas TEXT);
        CREATE TABLE institution_canonical (institution_id INTEGER, canonical_id INTEGER);
        CREATE TABLE institution_grades_v3 (institution_id INTEGER PRIMARY KEY, level TEXT);
        CREATE TABLE contracts (id INTEGER PRIMARY KEY, institution_id INTEGER, contract_year INTEGER, amount_mxn REAL);
    """)
    insts = [(1, "SECRETARIA DE LA DEFENSA NACIONAL", "SEDENA", "federal"),
             (2, "COMISION FEDERAL DE ELECTRICIDAD", "CFE", "federal"),
             (3, "PEMEX EXPLORACION Y PRODUCCION", "PEMEX", "federal"),
             (4, "Petroleos Mexicanos (Corporativo)", "PEMEX", "federal"),
             (5, "Banco del Bienestar, S.N.C., I.B.D.", None, "federal"),
             (6, "INSTITUTO SIN PRESUPUESTO PUBLICADO", None, "federal"),
             (7, "MUNICIPIO DE PRUEBA", None, "municipal"),
             (8, "SECRETARIA DE LA DEFENSA NACIONAL UNIDAD VIEJA", None, "federal")]
    for i, n, s, lvl in insts:
        c.execute("INSERT INTO institutions VALUES (?, ?, ?)", (i, n, s))
        c.execute("INSERT INTO institution_grades_v3 VALUES (?, ?)", (i, lvl))
    c.execute("INSERT INTO institution_canonical VALUES (9, 1)")     # absorbed id 9 -> SEDENA
    rows = [(1, 2018, 3_000_000.0), (9, 2019, 1_000_000.0), (1, 2017, 99e9),   # 2017 is outside the window
            (1, 2018, 2e11),                                                    # > 100B: rejected
            (3, 2018, 1_000_000.0), (4, 2019, 1_000_000.0), (5, 2018, 500_000.0)]
    c.executemany("INSERT INTO contracts (institution_id, contract_year, amount_mxn) VALUES (?, ?, ?)", rows)
    c.commit()
    return c


@pytest.fixture()
def env(tmp_path):
    _write_csvs(tmp_path / "raw")
    conn = _db(tmp_path / "t.db")
    yield conn, tmp_path / "raw"
    conn.close()


def _cov(conn):
    conn.row_factory = sqlite3.Row
    return {r["institution_id"]: dict(r) for r in conn.execute("SELECT * FROM institution_coverage_v1")}


def test_budget_reads_both_header_variants_in_pesos(env):
    _, raw = env
    rows = lc.read_budget(raw)
    sedena = [r for r in rows if r["entity_key"] == "DEFENSA NACIONAL" and r["concept_code"] == "11100"]
    assert sorted(r["year"] for r in sedena) == [2018, 2019]
    assert all(r["amount_mxn"] == 2 * 1000.0 * 1000 for r in sedena)   # 2 months x 1,000 miles
    assert all(len(r["months"]) == 2 for r in sedena)


def test_coverage_ratio_bands_and_scope(env):
    conn, raw = env
    budget = lc.read_budget(raw)
    maps, cov, rep = lc.compute(conn, budget)
    lc.write(conn, budget, maps, cov)
    c = _cov(conn)
    # SEDENA: (3M + absorbed 1M) / ((1000 + 500) miles x 2 months x 2 years) = 4M / 6M
    assert c[1]["status"] == "ok" and c[1]["match_rule"] == "secretaria"
    assert c[1]["ratio"] == pytest.approx(4 / 6) and c[1]["band"] == "alta"
    assert c[1]["scope"] == "ramo" and c[1]["is_lower_bound"] == 1
    # CFE: no CompraNet contracts in the window -> 0 -> baja
    assert c[2]["ratio"] == 0 and c[2]["band"] == "baja"
    # PEMEX family: both units share one ratio over the consolidated row (Pagado only)
    assert c[3]["entity_name"] == c[4]["entity_name"] == "Petroleos Mexicanos (PEMEX)"
    assert c[3]["ratio"] == c[4]["ratio"] == pytest.approx(2e6 / 8e6)
    assert c[3]["scope"] == "familia" and c[3]["group_size"] == 2
    assert c[3]["budget_comprometido_mxn"] == pytest.approx(10e6)
    # Reviewed alias + chained legal tails
    assert c[5]["match_rule"] == "alias" and c[5]["ratio"] == pytest.approx(500_000 / 4_000_000)
    # No budget row -> no badge; non-federal -> no badge; never a faked match
    assert c[6]["status"] == "sin_cotejo" and c[6]["ratio"] is None
    assert c[7]["status"] == "no_federal" and c[7]["band"] is None
    assert c[8]["status"] == "sin_cotejo"
    assert rep["matched"] == 5 and rep["unmatched"] == 2


def test_write_touches_only_coverage_tables(env):
    conn, raw = env
    before = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type = ?", ("table",))}
    budget = lc.read_budget(raw)
    lc.write(conn, budget, *lc.compute(conn, budget)[:2])
    after = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type = ?", ("table",))}
    assert after - before == {"budget_ejercido_annual", "budget_entity_institution_map", "institution_coverage_v1"}
    assert conn.execute("SELECT COUNT(*) FROM contracts").fetchone()[0] == 7


def test_entity_parts_and_norm():
    assert lc.entity_parts("Comisión Federal de Electricidad (CFE)")[1:] == ("COMISION FEDERAL DE ELECTRICIDAD", "CFE")
    assert lc.entity_parts("Servicios de Salud del IMSS (IMSS-BIENESTAR)")[2] == "IMSSBIENESTAR"
    assert lc._norm("Banco del Bienestar, S.N.C., I.B.D.") == "BANCO DEL BIENESTAR"
    assert lc.band_for(0.6) == "alta" and lc.band_for(0.2) == "parcial" and lc.band_for(0.19) == "baja"
