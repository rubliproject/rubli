"""resolve_gap_vendors pure functions (gap-relevo spec § Backend · recon-gap § 2)."""
from collections import Counter

import pytest

from scripts.resolve_gap_vendors import Segmenter, clean, is_junk

pytestmark = pytest.mark.no_db

SEG = Segmenter(Counter({"BRAND": 40, "AND": 900, "PUSH": 12, "LABORATORIOS": 3000, "PISA": 60,
                         "GRUPO": 5000, "FARMACEUTICO": 400, "TALLERES": 300, "DE": 90000,
                         "LOS": 8000, "BALLESTEROS": 20}))


def test_segmentation():
    assert SEG.segment("BRANDANDPUSH") == "BRAND AND PUSH"
    assert SEG.segment("LABORATORIOSPISA") == "LABORATORIOS PISA"
    assert SEG.segment("GRUPOFARMACEUTICO") == "GRUPO FARMACEUTICO"
    assert SEG.segment("TALLERESDELOSBALLESTEROS") == "TALLERES DE LOS BALLESTEROS"
    assert SEG.segment("PFIZER") == "PFIZER"  # short tokens are left alone


def test_resolve_strips_lead_number_and_normalises_legal_form():
    assert SEG.resolve("3588-BRANDANDPUSH SADECV") == ("BRAND AND PUSH S.A. de C.V.", "segmented")
    assert SEG.resolve("PFIZER SA DE CV") == ("PFIZER S.A. de C.V.", "raw")
    assert clean("ESTAFETA MEXICANA SADECV") == ("ESTAFETA MEXICANA", "S.A. de C.V.")


def test_junk_filter():
    assert is_junk("elcontrato")                    # OCR prose keeps its lowercase
    assert is_junk("ELCONTRATO(RAZONESQUE")         # boilerplate keyword
    assert is_junk("ABC")                           # too short to be a name
    assert not is_junk("PFIZER SA DE CV")
    assert not is_junk("LABORATORIOS PISA SA DE CV")
