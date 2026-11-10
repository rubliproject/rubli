"""Category 42 «Boletos de avión» = passenger tickets / passenger air transport only.

PLUM (2026-11-05) found radar, helicopter flight-hour programmes, Grob trainer support and air cargo
matching `vuelo` / `transporte aereo`. Real titles from the local DB.
"""
import pytest

from scripts.classify_categories import classify_text

pytestmark = pytest.mark.no_db

AIRFARE = 42


@pytest.mark.parametrize("title", [
    "MODERNIZACIÓN DEL SISTEMA DE PROCESAMIENTO DE DATOS RADAR Y PLAN DE VUELO DEL CENTRO DE CONTROL DE ÁREA MÉXICO",
    "SOPORTE DE MANTENIMIENTO Y LOGÍSTICO PARA AVIONES GROB G 120TP-A Y SIMULADORES DE VUELO GROB FTD-G120TP-SIM.",
    "Servicio de Transporte Aéreo de carga de equipo con Helicópteros",
    "PROG. SOP. HORAS DE VUELO PARA LA FLOTA DE 11 HELIS. EC-75 COUGAR Y 1 HELI. H225",
    "PROGRAMA DE SOPORTE POR HORAS DE VUELO PARA LA FLOTA DE 11 HELICÓPTEROS EC-725 COUGAR Y 1 HELICÓPTERO H225",
    "CONT. DE SOPORTE LOG. Y TEC. PARA AVIONES GROB Y SIMULADORES DE VUELO GROB",
    "ARRENDAMIENTO DE TRANSPORTE AÉREO EN MODALIDAD DE ALA FIJA Y ALA ROTATIVA 2023",
    "SERVICIO DE MANTENIMIENTO PARA LOS SISTEMAS AÉREOS REMOTAMENTE TRIPULADOS (RPAS)",
])
def test_aircraft_kit_is_not_airfare(title):
    assert classify_text(title, None, 12)[0] != AIRFARE
    assert classify_text("SERVICIO", title, 12)[0] != AIRFARE  # description-rescue pass too


@pytest.mark.parametrize("title", [
    "BOLETOS DE AVION",
    "SERVICIO DE EXPEDICIÓN DE BOLETO AEREOS",
    "SERVICIO DE RESERVACIÓN Y EXPEDICIÓN DE BOLETOS DE AVIÓN",
    "SERVICIO DE TRANSPORTACIÓN AÉREA",
    "Servicio de Transportación Aérea Nacional e Internacional para Servidores Públicos",
    "RESERVACIÓN, EXPEDICIÓN, VENTA Y ENTREGA DE PASAJES DE TRANSPORTACIÓN AÉREA",
    "SERVICIO DE TRANSPORTACIÓN AÉREA DE PERSONAS MIGRANTES EXTRANJERAS",
    "SERVICIO DE RESERVACIÓN, EXPEDICIÓN Y ENTREGA DE PASAJES AÉREOS NACIONALES E INTERNACIONALES",
    "PASAJES AÉREOS A TORONTO",
    "SERVICIO DE RESERVACIÓN, ENTREGA Y/O RADICACIÓN DE PASAJES DE TRANSPORTACIÓN",  # truncated title
    "SERVICIO DE BOLETAJE AÉREO CON DESTINOS NACIONALES E INTERNACIONALES",
])
def test_tickets_stay_airfare(title):
    assert classify_text(title, None, 12)[0] == AIRFARE


@pytest.mark.parametrize("title", [
    "SERVICIO INTEGRAL DE BOLETAJE Y CONTROL DE ACCESO PARA EL TREN INTERURBANO",  # 219.5 MDP, rail ticketing
    "SERVICIO DE RESERVACIÓN, EXPEDICIÓN, VENTA DE BOLETOS TERRESTRE",
    "LA-N8-2024 TRASLADO DE PACIENTES TERRESTRE MARITIMO Y BOLETAJE",
    "S9M0281 LA-050GYR002-E385-2019 SERV. TRASLADO PACIENTES BOLETAJE 2020",
])
def test_ground_ticketing_is_not_airfare(title):  # RED SILVER 2026-11-05: the dry run pulled these into 42
    assert classify_text(title, None, 12)[0] != AIRFARE


@pytest.mark.parametrize("title", [
    "PASAJES AÉREOS Y TERRESTRES",
    "SERVICIOS INTEGRALES PARA EVENTOS, BOLETAJE AÉREO Y BOLETAJE TERRESTRE",
    "Sv. Pasajes a�reos nacionales e internacionales",  # mojibake from the source
])
def test_air_and_ground_tickets_stay_airfare(title):
    assert classify_text(title, None, 12)[0] == AIRFARE
