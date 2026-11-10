"""Subcategory tagging (classify_subcategories) + stable ids + the swap remap + firm dedupe.

Pure / temp-DB tests: no RUBLI database needed.
"""
import sqlite3
import subprocess
import sys
from pathlib import Path

import pytest

from scripts import classify_subcategories as cs
from scripts import compute_subcategory_stats as css

pytestmark = pytest.mark.no_db
BACKEND = Path(__file__).resolve().parents[1]

RULES = cs.build_rules()


def tag(cat: int, title: str, partida: str | None = None, flag: int = 0):
    ids = {f"{b['category_id']}:{s['code']}": s["code"] for b in css.SUBCATEGORY_DEFS for s in b["subcategories"]}
    (_, code, source, cons), = cs.classify_rows([(1, cat, title, None, partida, flag)], RULES, ids)
    return code, source, cons


def test_accents_no_longer_block_a_match():
    # «CURACIÓN» used to miss «curacion»; «DIÁLISIS» likewise
    assert tag(22, "ADQUISICIÓN DE INSUMOS PARA DIÁLISIS PERITONEAL")[0] == "dialysis_renal"


def test_consolidated_is_a_flag_not_a_subcategory():
    code, _, cons = tag(20, "COMPRA CONSOLIDADA DE VACUNAS 2024")
    assert code == "vaccines_biologics" and cons == 1
    code, src, cons = tag(20, "COMPRA CONSOLIDADA DE MEDICAMENTOS")
    assert code == "other_pharma" and src == "catch_all" and cons == 1
    assert "consolidated_purchases" not in {s["code"] for b in css.SUBCATEGORY_DEFS for s in b["subcategories"]}
    assert tag(20, "MEDICAMENTOS", flag=1)[2] == 1  # contracts.is_consolidated counts too


def test_drug_class_beats_patent_or_generic():
    assert tag(20, "ONCOLÓGICOS DE PATENTE (RITUXIMAB)")[0] == "oncology"
    assert tag(20, "MEDICAMENTOS 2024 (PATENTE)")[0] == "branded_drugs"


def test_buyer_name_does_not_decide_a_class():
    assert tag(20, "ADQUISICION DE MEDICAMENTOS HOSPITAL DE ONCOLOGIA CMN SIGLO XXI")[0] == "other_pharma"
    assert tag(20, "MEDICAMENTOS INSTITUTO NACIONAL DE CANCEROLOGIA")[0] == "other_pharma"
    assert tag(20, "MEDICAMENTOS INSTITUTO NACIONAL DE CARDIOLOGIA")[0] == "other_pharma"


@pytest.mark.parametrize("title,expected", [
    ("ADQUISICION DE BIENES TERAPEUTICOS DEL GRUPO 040", "controlled_substances"),
    ("ADQUISICIÓN DE MEDICAMENTO GRUPO DE SUMINISTRO 030", "formulas_nutrition"),
    ("CLAVE 020.000.3801.00", "vaccines_biologics"),
])
def test_compendio_group_codes(title, expected):
    assert tag(20, title) == (expected, "compendio", 0)


def test_mixed_or_generic_groups_decide_nothing():
    # 010 = «medicamentos» (no class); 010 + 040 is mixed
    assert tag(20, "ADQUISICIÓN DE MEDICAMENTO GRUPO 010 Y 040")[1] == "catch_all"
    assert tag(20, "ADQUISICION DE MEDICAMENTO, GRUPO DE SUMINISTRO 010")[1] == "catch_all"
    assert cs.compendio_groups(cs.normalize("GRUPOS 060, 070 Y 080")) == {"060", "070", "080"}


def test_partida_decides_only_when_unanimous():
    assert tag(23, "ADQUISICION", partida="25501") == ("lab_materials", "partida", 0)
    assert tag(23, "ADQUISICION", partida="25501, 25301")[1] == "catch_all"
    assert tag(69, "PÓLIZA", partida="34501") == ("property_damage", "partida", 0)


def test_new_definitions_split_on_text():
    assert tag(69, "SEGURO DE VIDA INSTITUCIONAL 2023-2026")[0] == "life_retirement"
    assert tag(69, "SEGURO DE DAÑOS OCASIONADOS POR FENÓMENOS NATURALES")[0] == "catastrophe"
    assert tag(23, "Servicio Médico Integral Estudios de Laboratorio Clínico")[0] == "lab_services"
    assert tag(22, "MANTENIMIENTO EN LA SONDA DE CAMPECHE")[0] == "oil_offshore_misfiled"


@pytest.mark.parametrize("cat,title,partida,expected", [
    # 63 Servicios de Limpieza
    (63, "LAVADO Y DESINFECCIÓN DE CISTERNAS Y TINACOS", None, "tanks_cisterns"),
    (63, "SERVICIO INTEGRAL DE LAVANDERÍA PARA EL PERIODO JUNIO - DICIEMBRE 2025", None, "laundry"),
    (63, "GRUPO 350 ARTÍCULOS Y QUÍMICOS DE ASEO PARA ÓRGANOS DE OPERACIÓN", None, "cleaning_supplies"),
    (63, "CONTRATACIÓN PLURIANUAL DEL SERVICIO INTEGRAL DE LIMPIEZA", "35801", "building_cleaning"),
    (63, "SERVICIO DE CONTROL DE PLAGAS", None, "fumigation_gardening"),
    (63, "SERVICIO SUBROGADO", "35901", "fumigation_gardening"),
    # 34 Servicios de TI
    (34, "SERVICIOS ADMINISTRADOS DE COMPUTO EN LA NUBE 6 (SADCON 6)", None, "data_center_cloud"),
    (34, "SERVICIO DE IMPRESION, DIGITALIZACION Y FOTOCOPIADO 5 (SIDYF5)", None, "managed_printing"),
    (34, "LICENCIAMIENTO MICROSOFT EMPRESARIAL", None, "licensing"),
    # 47 Impresión y Publicaciones
    (47, "IMPRESIÓN DE LIBROS DE TEXTO GRATUITOS CICLO ESCOLAR 2024-2025", None, "textbooks"),
    (47, "FOTOCOPIADO, IMPRESION Y DIGITALIZACION", "32301", "managed_copying"),
    (47, "SERVICIO DE IMPRESION PARA LA PROMOCION Y OPERACION DE LOS PROGRAMAS PARA EL BIENESTAR", None, "publications_promo"),
    # 75 Uniformes y Vestuario
    (75, "ADQUISICION DE CHALECOS ANTIBALAS NIVEL IV", "28301", "police_ballistic"),
    (75, "SERVICIO DE RECOLECCION, LAVADO, PLANCHADO Y ENTREGA DE ROPA", None, "laundry_rental"),
    (75, "BOTAS DIELECTRICAS DE TRABAJO", None, "protective_gear"),
    (75, "ROPA DE TRABAJO, CAMISOLA Y PANTALON,", None, "uniforms_workwear"),
    (75, "ADQUISICION DE CALZADO", None, "footwear"),
])
def test_added_definitions(cat, title, partida, expected):
    assert tag(cat, title, partida)[0] == expected


def test_category_without_definitions_stores_null():
    (_, sub, src, _), = cs.classify_rows([(1, 999, "X", None, None, 0)], RULES, {})
    assert sub is None and src is None


def _defs_db():
    c = sqlite3.connect(":memory:")
    c.execute("CREATE TABLE categories (id INTEGER PRIMARY KEY)")
    css.setup_schema(c)
    return c


DEFS_A = [{"category_id": 1, "subcategories": [
    {"code": "a", "name_en": "A", "name_es": "A", "keywords": "a"},
    {"code": "other", "name_en": "O", "name_es": "O", "keywords": "", "is_catch_all": True}]},
    {"category_id": 2, "subcategories": [
    {"code": "other", "name_en": "O2", "name_es": "O2", "keywords": "", "is_catch_all": True}]}]


def test_upsert_keeps_ids_and_drops_stale():
    c = _defs_db()
    first = css.upsert_definitions(c, DEFS_A)
    c.execute("INSERT INTO subcategory_stats (subcategory_id, category_id) VALUES (?, 1)", (first["1:a"],))
    defs_b = [{"category_id": 1, "subcategories": [
        {"code": "new", "name_en": "N", "name_es": "N", "keywords": "n"},
        {"code": "other", "name_en": "O", "name_es": "Otros", "keywords": "", "is_catch_all": True}]},
        DEFS_A[1]]
    second = css.upsert_definitions(c, defs_b)
    assert second["1:other"] == first["1:other"] and second["2:other"] == first["2:other"]
    assert "1:a" not in second
    assert c.execute("SELECT COUNT(*) FROM subcategory_stats").fetchone()[0] == 0
    assert c.execute("SELECT name_es FROM subcategory_definitions WHERE id = ?", (second["1:other"],)).fetchone()[0] == "Otros"


def test_firms_merge_on_group_or_suffix_free_name_not_people():
    k = css.firm_keys
    assert k(1, "INFRA, S.A. DE C.V.", None, 0) == k(2, "INFRA,S.A. DE C.V.", None, 0) == ("n:INFRA",)
    assert k(1, "LABORATORIOS DE BIOLOGICOS Y REACTIVOS DE MEXICO S.A. DE C.V", None, 0) ==         k(2, "LABORATORIOS DE BIOLOGICOS Y REACTIVOS DE MEXICO, S.A. DE C.", None, 0)
    assert k(1, "JUAN PEREZ LOPEZ", None, 1) != k(2, "JUAN PEREZ LOPEZ", None, 1)
    # a stale is_individual=1 on a company (vaccines list, 2026-11-03) does not keep it apart
    assert k(13908, "LABORATORIOS DE BIOLOGICOS Y REACTIVOS DE MEXICO, S.A. DE C.", None, 1) ==         k(38095, "LABORATORIOS DE BIOLOGICOS Y REACTIVOS DE MEXICO S.A. DE C.V", None, 0)
    assert k(68723, "OBRAS PORTUARIAS DE COATZACOALCOS", None, 1) == k(54, "OBRAS PORTUARIAS DE COATZACOALCOS, S.A. DE C.V.", None, 0)
    v = lambda count, name, value, risk, keys: {"count": count, "name": name, "value": value, "risk": risk, "keys": keys}
    merged = css.merge_vendors({
        1: v(2, "INFRA, S.A. DE C.V.", 10.0, 0.4, k(1, "INFRA, S.A. DE C.V.", None, 0)),
        2: v(1, "INFRA,S.A. DE C.V.", 3.0, 0.1, k(2, "INFRA,S.A. DE C.V.", None, 0)),
        # a grouped member and an ungrouped twin of the same name are one firm (the vaccines list had both)
        4: v(1, "LAB BIRMEX, S.A. DE C.", 2.0, 0.0, k(4, "LAB BIRMEX, S.A. DE C.", 9, 0)),
        5: v(1, "LAB BIRMEX SA DE CV", 1.0, 0.0, k(5, "LAB BIRMEX SA DE CV", None, 0)),
        6: v(1, "OTRA RAZON SOCIAL SA", 1.0, 0.0, k(6, "OTRA RAZON SOCIAL SA", 9, 0)),
        3: v(1, "AGA GAS", 5.0, 0.2, k(3, "AGA GAS", None, 0))})
    assert [(m["vendor_id"], m["value"], m["count"]) for m in merged] == [(1, 13.0, 3), (3, 5.0, 1), (4, 4.0, 3)]
    assert merged[0]["avg_risk"] == pytest.approx(0.5 / 3)


def _scratch_and_live(tmp_path):
    """live: ids 1:a=1, 1:other=2, 2:other=3. scratch: same codes inserted in another order + a new one."""
    live, scratch = tmp_path / "live.db", tmp_path / "scratch.db"
    for path, order in ((live, DEFS_A), (scratch, [DEFS_A[1], {"category_id": 1, "subcategories": [
            {"code": "b", "name_en": "B", "name_es": "B", "keywords": "b"}] + DEFS_A[0]["subcategories"]}])):
        c = sqlite3.connect(path)
        c.execute("CREATE TABLE categories (id INTEGER PRIMARY KEY)")
        c.execute("CREATE TABLE precomputed_stats (stat_key TEXT PRIMARY KEY, stat_value TEXT, updated_at TEXT)")
        for t in ("atlas_cohort_period_stats", "category_stats", "category_yearly_stats", "category_vendor_topn",
                  "category_vendor_institution_topn", "institution_category_stats"):
            c.execute(f"CREATE TABLE {t} (x INTEGER)")
        css.setup_schema(c)
        ids = css.upsert_definitions(c, order)
        c.execute(css.VENDOR_TOPN_SQL)
        if path == scratch:
            c.execute(cs.TABLE_SQL.format(name="contract_subcategory"))
            c.executemany("INSERT INTO contract_subcategory VALUES (?,?,?,0)",
                          [(10, ids["1:a"], "regex"), (11, ids["2:other"], "catch_all"),
                           (12, ids["1:b"], "regex"), (13, None, None)])
            c.executemany("INSERT INTO subcategory_stats (subcategory_id, category_id) VALUES (?,?)",
                          [(ids["1:a"], 1), (ids["2:other"], 2)])
            c.execute("INSERT INTO subcategory_vendor_topn VALUES (?,1,5,'V',1,1.0,0.1)", (ids["2:other"],))
        c.commit()
        c.close()
    return live, scratch


def test_swap_remaps_by_category_and_code(tmp_path):
    live, scratch = _scratch_and_live(tmp_path)
    r = subprocess.run([sys.executable, "-m", "scripts.swap_category_precomputes", "--live", str(live),
                        "--scratch", str(scratch), "--suffix", "t1", "--apply"],
                       cwd=BACKEND, capture_output=True, text=True)
    assert r.returncode == 0, r.stderr
    c = sqlite3.connect(live)
    key = dict(((cat, code), i) for i, cat, code in c.execute("SELECT id, category_id, code FROM subcategory_definitions"))
    assert key[(1, "a")] == 1 and key[(1, "other")] == 2 and key[(2, "other")] == 3  # live ids kept
    got = dict(c.execute("SELECT contract_id, subcategory_id FROM contract_subcategory"))
    assert got == {10: key[(1, "a")], 11: key[(2, "other")], 12: key[(1, "b")], 13: None}
    assert c.execute("SELECT subcategory_id FROM subcategory_vendor_topn").fetchone()[0] == key[(2, "other")]
    assert sorted(r[0] for r in c.execute("SELECT subcategory_id FROM subcategory_stats")) == \
        sorted([key[(1, "a")], key[(2, "other")]])


def test_example_title_keeps_whole_words():
    t = css.example_title("Adquisición de vacunas para el servicio de alergología del hospital regional " * 3)
    assert t.endswith("…") and len(t) <= 111 and not t[:-1].endswith(" ")
    assert css.example_title("Oxígeno medicinal") == "OXÍGENO MEDICINAL"


@pytest.mark.parametrize("title,ok", [
    ("LA-019GYR047-E53-2017 consolidada IMSS", False),
    ("CONSOLIDADO/INSABI/INRLGII/92/2023-2024 CSL behring, S.A. de C.V.", False),
    ("Medicamentos", False),
    ("Oxígeno medicinal domiciliario", True),
    ("AA-050GYR013-E226-2020 adquisición de medicamentos abacavir", False),
])
def test_example_says_what_was_bought(title, ok):
    assert css.good_example(title) is ok


def test_cleanest_examples_first():
    titles = [
        "COMPRA CONSOLIDADA DE MEDICAMENTOS (PATENTES)F5 PARA LOS EJERCICIOS 2025-2026",
        "METFORMINA/ GLIMEPIRIDA. TABLETA CADA TABLETA CONTIENE: CLORHIDRATO DE METFORMINA 500 MG.",
        "Adquisici�n de vacunas",                       # garbled
        "ADQUISICION DE VACUNAS CONTRA INFLUENZA",
        "Vacunas",                                           # a bare word
        "LA-019GYR047-E53-2017 vacunas",                     # folio
    ]
    picked = css.cleanest_examples(titles, 2)
    assert picked[0] == "ADQUISICION DE VACUNAS CONTRA INFLUENZA"
    assert all("�" not in t and "LA-019" not in t for t in picked)
    assert css.cleanest_examples([], 3) == []


def test_example_must_name_the_kind_and_text_hygiene():
    import re
    vac = re.compile(r"vacuna", re.IGNORECASE)
    titles = ["ADQUISICIÓN DE MEDICAMENTOS",                 # boilerplate: does not name the kind
              "ADQUISICIÃ³N DE VACUNAS PARA EL HOSPITAL",     # mojibake
              "VACUNAS «HEXAVALENTE» PARA NIÑOS Y NIÑAS",    # guillemets + Ñ are fine
              "ADQUISICION DE VACUNAS PARA NIÑOS",
              "ADQUISICIÓN DE VACUNAS PARA NIÑOS"]           # same once accents are stripped
    picked = css.cleanest_examples(titles, 5, vac)
    assert picked == ["ADQUISICION DE VACUNAS PARA NIÑOS", "VACUNAS «HEXAVALENTE» PARA NIÑOS Y NIÑAS"]
    assert css.cleanest_examples(["ADQUISICIÓN DE MEDICAMENTOS GENERALES"], 5, vac) == []


@pytest.mark.parametrize("title,expected", [
    # spot check 2026-11-03 (30 titles per medicine subcategory)
    ("HIPOCLORITO DE CALCIO TABLETAS", "other_pharma"),                       # a disinfectant, not a vitamin
    ("CARBONATO DE CALCIO / VITAMINA D3. TABLETA", "vitamins_supplements"),
    ("FORMULA PARA LACTANTES CON NECESIDADES ESPECIALES", "formulas_nutrition"),
    ("DIETA POLIMERICA A BASE DE CASEINATO DE CALCIO", "formulas_nutrition"),
    ("JERINGA PARA INSULINA, DE PLASTICO GRADO MEDICO", "other_pharma"),
    ("KIT PARA LA DETERMINACION CUANTITATIVA DE INSULINA EN SUERO", "other_pharma"),
    ("ADQUISICION DE INSULINA HUMANA", "insulin_diabetes"),
    ("KIT PARA DETERMINACION DE ANTIBIOTICOS DELVOTEST", "other_pharma"),
    ("MEROPENEM 500 MG", "antibiotics"),
    ("TERMOS Y TERMOMETROS PARA CAMPAÑA DE VACUNACION", "other_pharma"),
    ("ADQUISICIÓN DE VACUNA ANTIINFLUENZA", "vaccines_biologics"),
    ("ADQUISICIÓN DE MEDICAMENTOS Y PSICOTRÓPICOS", "other_pharma"),             # a general shelf
    ("ADQUISICIÓN DE MEDICAMENTOS GRUPO 040 (PSICOTRÓPICOS)", "controlled_substances"),
    ("MEDICAMENTO ANTIRRETROVIRAL PARA PACIENTES CON VIH", "antiretrovirals_hiv"),
    ("ADQUISICION DE LACTEOS GRUPO 030", "formulas_nutrition"),
    ("ADQUISICION DE MEDICAMENTOS, LACTEOS, PSICOTROPICOS Y ESTUPEFACIENTES", "other_pharma"),  # a general shelf          # \b restored (was a backspace)
])
def test_medicine_rules_spot_check(title, expected):
    assert tag(20, title)[0] == expected


def test_no_backspace_in_patterns():
    # a «\b» written through a non-raw string became U+0008 and silently disabled 27 word boundaries
    src = (BACKEND / "scripts" / "compute_subcategory_stats.py").read_text(encoding="utf-8")
    assert "\x08" not in src
