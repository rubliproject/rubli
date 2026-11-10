"""«sonda» in cat 22 (Material de curación) is a medical tube, not «Sonda de Campeche», Pemex's offshore oil region.

TEAL-4 SILVER-8 (2026-11-05): 142 offshore oil contracts (47,418 MDP) sat in cat 22 only because of `sonda`.
Real titles/descriptions from the local DB.
"""
import pytest

from scripts.classify_categories import classify_text

pytestmark = pytest.mark.no_db

SUPPLIES = 22


@pytest.mark.parametrize("title, desc", [
    ("MANTENIMIENTO EN LA SONDA DE CAMPECHE CON APOYO DE UN EQUIPO CON POSICIONAMIENTO DINÁMICO", None),
    ("Transporte aereo de personal y/o carga con helicopteros en la Sonda de Campeche, Golfo de Mexico", None),
    ("Ingeniería, procura, tendido, interconexión y pruebas del cable submarino de la plataforma PG-ZAAP-C",
     "Obras en la Sonda de Campeche"),
    ("Tendido de ducto en la Sonda Marina de Campeche", None),
    ("Mantenimiento en el campo Ku-Maloob-Zaap, Sonda de Camepeche, Golfo de Mexico", None),
])
def test_campeche_oil_work_is_not_medical_supply(title, desc):
    assert classify_text(title, desc, 4)[0] != SUPPLIES


@pytest.mark.parametrize("title", [
    "SONDA FOLEY DE LATEX DOS VIAS 16 FR",
    "ADQUISICION DE SONDAS NASOGASTRICAS Y MATERIAL DE CURACION",
    "SONDA PARA ALIMENTACION ENTERAL",
])
def test_medical_tubes_stay_supplies(title):
    assert classify_text(title, None, 1)[0] == SUPPLIES
