"""Regression tests for substring false positives in the category regexes.

Unbounded short tokens matched inside unrelated words: `res` sent PRESTADOR /
RESPUESTA / RESIDUOS to Food, `ducto` sent PRODUCTOS to Oil & Gas, `racion` sent
ADMINISTRACION to Catering. See docs/TAXONOMY_SUBCATEGORY_STUDY_2026-10-07.md.
"""
import re

import pytest

from scripts.classify_categories import CATEGORIES, classify_text

pytestmark = pytest.mark.no_db

FOOD = 57


@pytest.mark.parametrize("title", [
    "PRESTADOR DE SERVICIOS PROFESIONALES",
    "ELABORACION DE RESPUESTA A PROFEPA PARA ACTUALIZAR CUMPLIMIENTO",
    "SERVICIO DE RECOLECCION DE RESIDUOS SOLIDOS PARA LAS UNIDADES MEDICAS",
    "S18/AD/335/2021 SERVICIO DE MANTTO. Y RECARGA EXTINTORES 2021",
    "MANTENIMIENTO CORRECTIVO A ELEVADORES 1,2 Y 4",
    "ADQUISICION DE PAPELERIA",
    "CREMATORIO MUNICIPAL",
])
def test_non_food_titles_do_not_hit_food(title):
    assert classify_text(title, None, 12)[0] != FOOD


@pytest.mark.parametrize("title", [
    "CARNE DE RES",
    "HARINA DE MAIZ",
    "ATUN EN AGUA",
    "PAPAS FRITAS",
    "SAL MOLIDA Y REFINADA",
    "PAN BLANCO DE CAJA",
    "CREMA Y MANTEQUILLA",
    "MOLE POBLANO",
    "MOLES",
    "ADQUISICION DE PRODUCTOS ALIMENTICIOS",
])
def test_food_titles_still_hit_food(title):
    assert classify_text(title, None, 12)[0] == FOOD


@pytest.mark.parametrize("title,wrong", [
    ("ADQUISICION DE PRODUCTOS DE LIMPIEZA", 40),   # ducto
    ("SERVICIO DE ADMINISTRACION DE NOMINA", 58),   # racion
    ("CONCURSO DE OBRA PUBLICA", 54),               # curso
    ("EMPRESA CONSTRUCTORA", 28),                   # presa
    ("MONITOREO DE MEDIOS", 32),                    # monitor
    ("PROGRAMA DE BIENESTAR SOCIAL", 92),           # bien
    ("MANIOBRAS DE CARGA", 91),                     # obra
    ("POZO PETROLERO TERRESTRE", 28),               # pozo
    ("CONTRATO DE PRESTACION DE SERVICIOS", 71),    # prestacion
    ("EVALUACION DE CONSISTENCIA Y RESULTADOS", 68), # valuacion
    ("MATERIAL PARA LAS UMAES DEL INSTITUTO MEXICANO DEL SEGURO SOCIAL", 69),  # seguro social
])
def test_substring_false_positives_fixed(title, wrong):
    assert classify_text(title, None, 12)[0] != wrong


def test_no_bare_short_tokens_left():
    """Every top-level alternative of <=4 letters must carry a word boundary."""
    bare = [(cid, alt) for cid, _, _, _, _, pat in CATEGORIES if pat
            for alt in re.split(r"\|(?![^(]*\))", pat)
            if re.fullmatch(r"[a-z]{2,4}", alt)]
    assert bare == []


def test_sector_fallback_is_tagged():
    assert classify_text("XQ-12/2019", None, 1) == (22, "fallback")
    assert classify_text("XQ-12/2019", None, 12) == (89, "regex")
    assert classify_text("CONTRATO", None, 1) == (91, "regex")


# IMSS 2026-10-30, TERMO PAILERIA INDUSTRIAL, 359.8 MDP: the title names no specific kind, and the
# description-rescue pass took «…PUESTA EN OPERACIÓN Y CAPACITACIÓN DE EQUIPOS» as Training (54).
# Training delivered with a supply is part of the supply, not what was bought.
@pytest.mark.parametrize("title,desc", [
    ("ADQUISICIÓN DE EQUIPOS DE CASA DE MÁQUINAS",
     "ADQUISICIÓN, SUMINISTRO, DESINSTALACIÓN, INSTALACIÓN, PRUEBAS DE ARRANQUE, PUESTA EN OPERACIÓN Y "
     "CAPACITACIÓN DE EQUIPOS DE CASA DE MÁQUINAS 2026-2027"),
    ("ADQUISICION DE BIENES", "SUMINISTRO E INSTALACION DE EQUIPO, INCLUYE CURSO DE CAPACITACION AL PERSONAL"),
])
def test_training_bundled_with_a_supply_is_not_training(title, desc):
    assert classify_text(title, desc, 1)[0] != 54


def test_real_training_still_training():
    assert classify_text("CURSO DE CAPACITACION EN PRIMEROS AUXILIOS", None, 1)[0] == 54
    assert classify_text("SERVICIO PROFESIONAL", "IMPARTICION DE CURSOS DE CAPACITACION AL PERSONAL", 1)[0] == 54
