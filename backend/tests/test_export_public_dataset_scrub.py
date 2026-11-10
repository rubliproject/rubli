"""Scrub rules of the public-dataset exporter (no DB needed)."""
from scripts import export_public_dataset as e


def test_name_redactor_masks_in_text_names():
    r = e.NameRedactor({"JUAN PEREZ LOPEZ": "PERSONA FISICA 7", "LUIS GOMEZ": "PERSONA FISICA 3"})
    assert r.sub("Honorarios de Juan  Perez Lopez") == "Honorarios de PERSONA FISICA 7"
    # 2-token names only in strict (curated-text) mode
    assert r.sub("pago a Luis Gomez") == "pago a Luis Gomez"
    strict = e.NameRedactor({"LUIS GOMEZ": "PERSONA FISICA 3"}, min_tokens=2)
    assert strict.sub("pago a Luis Gomez") == "pago a PERSONA FISICA 3"


def test_redact_text_keeps_urls_and_amounts():
    assert e._redact_text("ver https://dof.gob.mx/x y D:/data/f.csv") == "ver https://dof.gob.mx/x y [PATH]"
    assert e._redact_text("E:\\data\\x.csv y") == "[PATH] y"  # backslash paths too
    assert e._redact_text("host 10.0.0.1") == "host [IP]"
    assert e._redact_text("monto 1.234.567") == "monto 1.234.567"
    assert e._redact_text("RFC GOPL800101AB1") == "RFC [RFC]"
    assert e._redact_text("x@y.mx") == "[EMAIL]"


def test_persona_fisica_signals():
    assert e._row_is_individual(["GOPL800101AB1"], [])
    assert not e._row_is_individual(["ABC800101AB1"], [])  # persona moral
    assert e._row_is_individual([None], ["1"])
    assert e._row_is_individual([], ["fisica"])


def test_rfc_columns_dropped_and_table_scoped_drop():
    drop, _, keep = e.classify_columns(
        ["rfc", "vendor_rfc", "sig_invalid_rfc", "summary", "name"],
        {"investigation_cases.summary"}, set(), "drop", set(), "investigation_cases")
    assert set(drop) == {"rfc", "vendor_rfc", "summary"}
    assert set(keep) == {"sig_invalid_rfc", "name"}


def test_internal_tables_dropped():
    for t in ("_mig_contract_year_backup", "users", "user_issues", "_scoring_temp"):
        assert e.classify_table(t, None) == "drop"
    assert e.classify_table("contracts", None) == "publish"


def test_cast_text_numbers():
    assert e._cast(" 12.5 ", "REAL") == 12.5
    assert e._cast("1", "INTEGER") == 1
    assert e._cast("", "REAL") is None
    assert e._cast("abc", "REAL") == "abc"  # unparseable text is kept, not lost


def test_publication_gates_in_config():
    import json, os
    cfg = json.load(open(os.path.join(os.path.dirname(e.__file__), "public_dataset_config.json"), encoding="utf-8"))
    rf = cfg["row_filters"]
    assert rf["procurement_scandals"] == "is_verified = 1"
    assert "corroborated" in rf["investigation_cases"]
    assert "corroborated" in rf["case_vendors"] and "corroborated" in rf["case_questions"]
    assert cfg["table_overrides"]["aria_memos"] == "drop"


def test_export_has_no_unverified_scandals():
    """Checks a built export when RUBLI_PUBLIC_DB points at it (else skipped)."""
    import os, sqlite3
    import pytest
    for path in filter(None, os.environ.get("RUBLI_PUBLIC_DB", "").split(os.pathsep)):
        if not os.path.exists(path):
            pytest.skip(f"{path} not built")
        c = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
        assert c.execute("SELECT COUNT(*) FROM procurement_scandals WHERE is_verified IS NOT 1").fetchone()[0] == 0
        assert c.execute("SELECT COUNT(*) FROM investigation_cases "
                         "WHERE validation_status IS NOT 'corroborated'").fetchone()[0] == 0
        assert not c.execute("SELECT 1 FROM sqlite_master WHERE name='aria_memos'").fetchone()
        c.close()
    if not os.environ.get("RUBLI_PUBLIC_DB"):
        pytest.skip("RUBLI_PUBLIC_DB not set")


def test_ocr_names_without_legal_form_are_masked():
    from scripts.export_public_dataset import ocr_name_ok
    for person in ("SERGIOANDRESRAMOSLIZARRAGA", "ANABEL CASTRO SANCHEZ", "PerlaJazminArredondoQuiniones"):
        assert not ocr_name_ok(person)
    for firm in ("QUATTROAZULSADECV", "AXTEL SAB DE CV", "EN MEDICINA S.A. de C.V.", "PERSONA FISICA 123", None):
        assert ocr_name_ok(firm)

def test_date_stamped_rollback_tables_never_ship():
    from scripts.export_public_dataset import classify_table
    assert classify_table("aria_queue_pre_rerun_20261005", None) == "drop"
    assert classify_table("contracts_snapshot_20261006", None) == "drop"
    for keep in ("vendor_shap_v52", "contract_z_features_v2", "institution_scorecards_pre_reform", "aria_queue"):
        assert classify_table(keep, None) == "publish"


def test_model_rollback_snapshots_never_ship():
    # aria_queue_pre_b3b / _pre_v091 are rollback copies of the queue, not data (2026.11 dry run)
    for t in ("aria_queue_pre_b3b", "aria_queue_pre_v091", "contracts_pre_v092"):
        assert e.classify_table(t, None) == "drop"
    assert e.classify_table("institution_scorecards_pre_reform", None) == "publish"


def test_comprasmx_supplier_column_is_a_name_column():
    # comprasmx_contracts carries persona-física suppliers in `proveedor`; its rfc/flag are dropped,
    # so the name must be masked on the way out or it ships in clear
    assert "proveedor" in e.NAME_COLUMNS
