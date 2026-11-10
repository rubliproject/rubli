"""persona_fisica classifier — _explore/ml_persona_fisica_2026-10-29.md."""
import pytest

from api.persona_fisica import classify_persona_fisica, company_prob, rfc_shape

pytestmark = pytest.mark.no_db


@pytest.mark.parametrize("name", [
    "CORPORATIVO GIORMAR DE MEXICO", "TELEFONOS DE MEXICO, S.A.B DE C.V.", "NALCO DE MEXICO",
    "PROMOTORA Y DESARROLLADORA MEXICANA DE INFRAESTRUCTURA", "COMISION FEDERAL DE ELECTRICIDAD",
])
def test_company_names_override_persona_flag(name):
    assert company_prob(name) >= 0.99
    assert classify_persona_fisica(name, is_individual=1) is False


@pytest.mark.parametrize("name", [
    "MARTHA LUVIAN ESPINOSA", "ALEJANDRO GARZA ESPINOSA", "MARIA GUADALUPE RODRIGUEZ SOSA",
    "JOSÉ LUIS RAMOS RIVERA", "Diana Karina Gómez Gómez",
])
def test_person_names(name):
    assert company_prob(name) <= 0.01
    assert classify_persona_fisica(name, is_individual=0) is True   # "...SA" suffix mis-parse
    assert classify_persona_fisica(name, is_individual=1) is True


def test_rfc_shape_wins_and_is_never_returned():
    assert rfc_shape("ABC010101AB1") == "company" and rfc_shape("ABCD010101AB1") == "person"
    assert rfc_shape("10861.0") is None and rfc_shape(None) is None
    assert classify_persona_fisica("JUAN PEREZ LOPEZ", 1, "ABC010101AB1") is False
    assert classify_persona_fisica("ACME SA DE CV", 0, "ABCD010101AB1") is True


def test_uncertain_keeps_stored_flag():
    # mid-confidence names never flip the stored flag
    p = company_prob("INES DUSSEL")
    assert 0.01 < p < 0.99
    assert classify_persona_fisica("INES DUSSEL", 1) is True
    assert classify_persona_fisica("INES DUSSEL", 0) is False


def test_empty_name_is_safe():
    assert 0.0 <= company_prob(None) <= 1.0
    assert classify_persona_fisica("", None) in (True, False)


# public_labels.looks_like_company: legal-entity marks only as whole tokens (2026-10-29)
PERSON_NAMES = ("ESPINOSA", "ACOSTA", "FRANCISCO", "ROSA", "MARTHA LUVIAN ESPINOSA", "JUAN FRANCISCO SAAVEDRA",
                "ANA ROSA CASAS", "MARCO ANTONIO SAGASTEGUI", "LUIS CORONADO VASCO", "JOSE ACOSTA", "SAUL CORONA")
# bare "BECTON DICKINSON" scores p=0.93, the same as the person INES DUSSEL, so it stays uncertain by design
COMPANY_NAMES = ("PRAXAIR MEXICO S. DE R.L. DE C.V.", "BECTON DICKINSON DE MEXICO", "CORPORATIVO GIORMAR DE MEXICO", "X INC",
                 "Y S.A. DE C.V.", "SMITH & CO", "ACME CO.", "Z SA DE CV", "GRUPO ALFA", "SERVICIOS INTEGRALES DEL SUR",
                 "SIEMENS HEALTHCARE GMBH", "GRUPO X S.A.P.I. DE C.V.", "MACHADO GARCIA-SERRA LLC.", "NALCO DE MEXICO")


@pytest.mark.parametrize("name", PERSON_NAMES)
def test_person_names_are_not_companies(name):
    from api.public_labels import _COMPANY_MARK, looks_like_company
    assert not looks_like_company(name)
    assert not _COMPANY_MARK.search(name)   # regex fallback alone, too


@pytest.mark.parametrize("name", COMPANY_NAMES)
def test_company_names_are_companies(name):
    from api.public_labels import looks_like_company
    assert looks_like_company(name)
