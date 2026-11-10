"""refresh_sfp_sanctions: DOF title/body parsing, lifts, archive overlap, and the rebuild
(persona física RFCs never kept)."""
import json
import sqlite3

import pytest

from scripts import refresh_sfp_sanctions as mod

pytestmark = pytest.mark.no_db  # pure parsing + temp DB

HEAD = ("Circular por la que se comunica a las dependencias y entidades de la Administración Pública "
        "Federal, así como a las entidades federativas, que deberán abstenerse de aceptar propuestas o "
        "celebrar contratos con ")


def names(title):
    return [(n, pf) for n, pf, _ in mod.subjects_of(HEAD + title)]


def test_company_keeps_suffix_dot():
    assert names("la empresa BCC Transportes, Almacenajes y Logística, S.A. de C.V.") == [
        ("BCC Transportes, Almacenajes y Logística, S.A. de C.V.", False)]


def test_persona_fisica_phrases():
    assert names("el C. Nahín Hernández Herrera.") == [("Nahín Hernández Herrera", True)]
    assert names("la persona física con actividad empresarial el C. Víctor Manuel Mercado Huerta.") == [
        ("Víctor Manuel Mercado Huerta", True)]


def test_two_companies_and_representative():
    assert names("las personas morales Salini-Impregilo Mexicana, S. de R.L. de C.V. y Consorcio "
                 "Corporativo de Construcción en México, S.A. de C.V.") == [
        ("Salini-Impregilo Mexicana, S. de R.L. de C.V.", False),
        ("Consorcio Corporativo de Construcción en México, S.A. de C.V.", False)]
    assert names("la empresa Metales y Cobres de Ecatepec, S.A. de C.V. y la persona física que la "
                 "representó el ciudadano Arturo Rivas Escobar, incluso cuando este último pretenda") == [
        ("Metales y Cobres de Ecatepec, S.A. de C.V.", False), ("Arturo Rivas Escobar", True)]


def test_label_variants_and_no_label():
    assert names("la moral Zurich Pharma, S.A. de C.V.") == [("Zurich Pharma, S.A. de C.V.", False)]
    assert names("la persona jurídico colectiva denominada La Oficina, S.A. de C.V.") == [
        ("La Oficina, S.A. de C.V.", False)]
    assert names("Grupo Inetsa, S.A. de C.V.") == [("Grupo Inetsa, S.A. de C.V.", False)]
    assert names("la empresa Cldnet, S.A. de C.V. y/o la persona física que la representa el C. Ana Ruiz.") == [
        ("Cldnet, S.A. de C.V.", False), ("Ana Ruiz", True)]
    a = HEAD.replace("celebrar contratos con ", "celebrar contratos ")
    assert [n for n, _, _ in mod.subjects_of(a + "a la empresa HDI Seguros, S.A. de C.V.")] == ["HDI Seguros, S.A. de C.V."]
    assert [n for n, _, _ in mod.subjects_of(a + "al licitante Marco Antonio Ramírez Gámez.")] == ["Marco Antonio Ramírez Gámez"]
    assert names("la C. Martha Gómez Navarro, persona física.") == [("Martha Gómez Navarro", True)]


def test_rfc_and_expediente_in_title():
    s = mod.subjects_of(HEAD + "la empresa con razón social Soluciones Integrales, Sociedad Anónima de "
                               "Capital Variable con R.F.C. SIP111129GH7.")
    assert s == [("Soluciones Integrales, Sociedad Anónima de Capital Variable", False, "SIP111129GH7")]
    assert names("el C. Humberto Reyes Báez. (Expediente PISI-A-NC-DS-0017/2018)") == [
        ("Humberto Reyes Báez", True)]


def test_body_fields():
    b = mod.body_fields("Al margen un sello.- Órgano Interno de Control en Petróleos Mexicanos.- Área de "
                        "Responsabilidades.- Expediente: PA-0001/2026. ... imponerle una multa por la "
                        "cantidad de $1,234,567.80 ... deberán abstenerse ... por el plazo de 3 (TRES) MESES .")
    assert b == {"plazo_text": "3 (TRES) MESES", "plazo_months": 3, "amount_mxn": 1234567.8,
                 "expediente": "PA-0001/2026", "oic": "Órgano Interno de Control en Petróleos Mexicanos"}
    assert mod.body_fields("por el plazo de dos años")["plazo_months"] == 24
    assert mod.body_fields("multa de $900,000,000,000")["amount_mxn"] is None  # > 100B → reject


def _day(cache, iso, *titles):
    notes = [{"codNota": 100 + i, "titulo": t, "fecha": iso[8:] + iso[4:8] + iso[:4], "codOrgaDos": "SABG"}
             for i, t in enumerate(titles)]
    (cache / f"{iso}.json").write_text(json.dumps({"NotasMatutinas": notes}), encoding="utf-8")


def test_parse_lift_overlap_and_pf_rfc(tmp_path):
    _day(tmp_path, "2024-01-10",
         HEAD + "la empresa Alfa, S.A. de C.V.",
         HEAD + "la persona física Juan Pérez López con R.F.C. PELJ800101AB1.",
         HEAD + "la empresa Beta Servicios, S.A. de C.V.",
         "Aviso sin relación")
    _day(tmp_path, "2025-03-01",
         "Circular por la que se deja sin efectos la diversa que deberán abstenerse de aceptar propuestas "
         "o celebrar contratos con la empresa Alfa, S.A. de C.V.")
    (tmp_path / "notes").mkdir()
    (tmp_path / "notes" / "100.json").write_text(json.dumps({"Nota": {
        "cadenaContenido": "<p>abstenerse ... por el plazo de un año</p>"}}), encoding="utf-8")
    rows, lifts = mod.parse_dof(tmp_path)
    assert [(r["company_name"], r["rfc"], r["is_persona_fisica"]) for r in rows] == [
        ("Alfa, S.A. de C.V.", None, 0), ("Juan Pérez López", None, 1), ("Beta Servicios, S.A. de C.V.", None, 0)]
    alfa = rows[0]
    assert (alfa["sanction_start"], alfa["sanction_end"], alfa["plazo_months"]) == ("2024-01-11", "2025-01-11", 12)
    assert alfa["source_url"] == "https://www.dof.gob.mx/nota_detalle.php?codigo=100&fecha=10/01/2024"
    kept = mod.drop_lifted(rows, lifts)
    assert [r["company_name"] for r in kept] == ["Juan Pérez López", "Beta Servicios, S.A. de C.V."]
    archive = [{"company_name": "BETA SERVICIOS SA DE CV", "sanction_start": "2023-11-20"}]
    assert [r["company_name"] for r in mod.drop_overlap(archive, kept)] == ["Juan Pérez López"]


def test_rebuild_keeps_no_pf_rfc(tmp_path):
    cache = tmp_path / "dof"
    cache.mkdir()
    _day(cache, "2024-01-10", HEAD + "la persona física Juan Pérez López con R.F.C. PELJ800101AB1.",
         HEAD + "la empresa con razón social Gamma, S.A. de C.V. con R.F.C. GAM010101AB1.")
    db = tmp_path / "t.db"
    c = sqlite3.connect(db)  # pre-2026-10-31 shape → save_to_db keeps it as sfp_sanctions_legacy
    c.execute("CREATE TABLE sfp_sanctions (id INTEGER PRIMARY KEY, rfc TEXT, company_name TEXT NOT NULL, "
              "sanction_type TEXT, sanction_start TEXT, sanction_end TEXT, amount_mxn REAL, authority TEXT, "
              "source_url TEXT, loaded_at TEXT)")
    c.execute("INSERT INTO sfp_sanctions (rfc, company_name) VALUES ('PELJ800101AB1', 'OLD PERSONA')")
    c.commit()
    rows, stats = mod.build(cache, tmp_path / "missing.csv")
    assert stats["dof_new_vs_archive"] == 2
    bak = mod.backup_table(db)
    mod.save_to_db(rows, db)
    got = c.execute("SELECT company_name, rfc, is_persona_fisica FROM sfp_sanctions ORDER BY 1").fetchall()
    assert got == [("Gamma, S.A. de C.V.", "GAM010101AB1", 0), ("Juan Pérez López", None, 1)]
    assert c.execute(f"SELECT COUNT(*) FROM {bak}").fetchone()[0] == 1
    mod.save_to_db(rows, db)  # idempotent rebuild
    assert c.execute("SELECT COUNT(*) FROM sfp_sanctions").fetchone()[0] == 2


def test_parse_plazo_months_spanish_words_and_parens():
    from scripts.load_sfp_sanctions import parse_plazo_months as p
    assert p("DIECISÉIS MESES") == 16
    assert p("18 (dieciocho meses") == 18
    assert p("dieciocho (18) meses") == 18
    assert p("TREINTA (30) MESES") == 30
    assert p("VEINTIÚN MESES") == 21
    assert p("2I (veintiún) meses") == 21
    assert p("VEINTIDÓS MESES") == 22
    assert p("1 (UN) AÑO") == 12
    assert p("4 AÑOS") == 48
    assert p("1 AÑO 5 MESES") == 17
    assert p("") is None
