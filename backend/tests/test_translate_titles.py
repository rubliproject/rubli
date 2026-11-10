"""translate_titles: normalisation keeps codes/acronyms, glossary fixes recurring terms (no MT model needed)."""
import sqlite3

import pytest

from scripts import translate_titles as T

pytestmark = pytest.mark.no_db


def test_normalize_caps_keeps_codes_and_acronyms():
    s, prot = T.normalize("ADQUISICION DE MEDICAMENTOS PARA EL IMSS  PARTIDA 25301 CLAVE 010.000.0104.00")
    assert s.startswith("Adquisición de medicamentos para el IMSS partida 25301")
    assert {"IMSS", "25301", "010.000.0104.00"} <= set(prot)


def test_normalize_leaves_mixed_case_alone():
    assert T.normalize("Servicio de energía eléctrica Junio")[0] == "Servicio de energía eléctrica Junio"


def test_post_edit_glossary():
    assert T.post_edit("Acquisition of medicines by Direct Adjudication") == "Purchase of medicines by direct award"


def test_output_table_shape(tmp_path):
    db = sqlite3.connect(tmp_path / "o.sqlite")
    db.execute(T.DDL)
    db.execute("INSERT INTO contract_title_en VALUES (?,?,?,?,?)", (T.title_hash("X"), "X", "X", T.MODEL_TAG, "t"))
    assert db.execute("SELECT count(*) FROM contract_title_en").fetchone()[0] == 1
    assert len(T.title_hash("X")) == 40
