"""APP/PPS concession rule (owner-approved 2026-10-22, docs/CATEGORY_AUDIT_2026-10-22.md).

Bare-folio APP hospital concessions fell to the salud fallback (22, Material de
Curacion). They belong in 26 (Construccion). Road APP concessions stay in 27.
"""
import pytest

from scripts.classify_categories import classify_text

pytestmark = pytest.mark.no_db

SALUD = 1


@pytest.mark.parametrize("title", [
    "DC18APP001 - TEPOTZOTLÁN, ESTADO DE MÉXICO",
    "DC17APP0071 - GARCÍA, NUEVO LEÓN -APP",
    "DC17APP0057- BAHÍA DE BANDERAS, NAY - APP",
])
def test_bare_app_folio_goes_to_construction(title):
    assert classify_text(title, None, SALUD) == (26, "regex")


def test_road_app_concession_stays_in_roads():
    title = ("Otorgamiento de una concesión APP para operar, conservar y mantener "
             "el tramo carretero libre de peaje")
    assert classify_text(title, None, 3)[0] == 27
    assert classify_text("PROYECTO PPS AUTOPISTA", None, 3)[0] == 27
    assert classify_text("DC17APP0099", "conservación del tramo carretero federal", 3)[0] == 27


def test_ordinary_curacion_title_unchanged():
    assert classify_text("ADQUISICION DE MATERIAL DE CURACION", None, SALUD)[0] == 22
    # No keyword at all still falls back to 22 for salud.
    assert classify_text("LA-019GYR019-E185-2017", None, SALUD) == (22, "fallback")


def test_servicios_integrales_unchanged():
    title = "SERVICIOS INTEGRALES DE HEMODIALISIS"
    assert classify_text(title, None, SALUD)[0] == 24


@pytest.mark.parametrize("title,sector,expected", [
    ("SUPERVISION PPS TAPACHULA", 3, 88),
    ("Servicio del Testigo Social para el APP-009000959-E454-2017", 7, 91),
    ("SERVICIO DE CALENDARIOS IMPRESOS INTERACTIVOS CON APP", 7, 91),
    ("Análisis y propuesta de mejoras de los modelos de Asociación Publico Privada", 3, 88),
])
def test_app_services_are_not_construction(title, sector, expected):
    assert classify_text(title, None, sector)[0] == expected
