"""ComprasMX supplier → vendor resolution: RFC-first, exact keys, guards (no DB)."""
import pytest

from scripts.resolve_comprasmx_vendors import loose_key, resolve

pytestmark = pytest.mark.no_db


def _run(suppliers, rfc_index=None, names=None, canon=None, best=None):
    return resolve(suppliers, rfc_index or {}, names or {}, canon or {}, best or {})


def test_loose_key_folds_the_corrupted_n_and_spacing():
    assert loose_key("QUALITAS COMPA�IA DE SEGUROS SA DE CV") == loose_key("Qualitas Compañía de Seguros, S.A. de C.V.")
    assert loose_key("MOTA-ENGIL MEXICO S A P I DE CV") == loose_key("Mota-Engil México, S.A.P.I. de C.V.")


def test_rfc_hit_collapses_duplicates_through_canonical():
    out = _run([("ABC010101AB1", "X SA", 0)], rfc_index={"ABC010101AB1": {5, 9}}, canon={9: 5})
    assert out["ABC010101AB1"] == ("rfc", 5, 1)


def test_split_vendor_rows_on_one_rfc_pick_the_most_recent():
    # judge round 1: 49/51 RFC reviews were our own duplicate rows
    act = {5: (2014, 900), 9: (2025, 40)}
    out = resolve([("ABC010101AB1", "X SA", 0)], {"ABC010101AB1": {5, 9}}, {}, {}, {},
                  activity=lambda v: act[v])
    assert out["ABC010101AB1"] == ("rfc_split", 9, 2)


def test_contradicted_rfc_candidate_is_dropped():
    # CAF 28815 carried CAF Healthcare's RFC by mistake
    out = resolve([("CHS181017AB1", "CAF HEALTHCARE", 0)], {"CHS181017AB1": {28815, 258008}}, {}, {}, {},
                  rfc_ok=lambda v, r: v != 28815)
    assert out["CHS181017AB1"] == ("rfc", 258008, 1)


def test_rfc_hit_with_unrelated_name_and_no_cosignal_goes_to_review():
    out = resolve([("CAA141009AB1", "SOLUCIONES MED FLP", 0)], {"CAA141009AB1": {7}}, {}, {}, {},
                  cosignal=lambda r, v: False, name_sim=lambda n, v: 0.2)
    assert out["CAA141009AB1"][0] == "review_rfc"


def test_person_is_never_name_merged():
    k = loose_key("JUAN PEREZ LOPEZ")
    out = _run([("PELJ800101AB1", "JUAN PEREZ LOPEZ", 1)], names={k: {7}})
    assert out["PELJ800101AB1"] == ("new_person", None, 0)


def test_person_matches_by_exact_rfc():
    out = _run([("PELJ800101AB1", "JUAN PEREZ", 1)], rfc_index={"PELJ800101AB1": {7}})
    assert out["PELJ800101AB1"] == ("rfc", 7, 1)


def test_company_name_hit_blocked_by_a_different_grade_a_rfc():
    k = loose_key("ACME SA DE CV")
    blocked = _run([("ACM010101AB1", "ACME SA DE CV", 0)], names={k: {3}}, best={3: "ACM990909ZZ9"})
    assert blocked["ACM010101AB1"][0] == "new_company"
    ok = _run([("ACM010101AB1", "ACME SA DE CV", 0)], names={k: {3}})
    assert ok["ACM010101AB1"] == ("name_loose", 3, 1)


def test_name_hitting_two_split_rows_picks_the_active_one():
    k = loose_key("ACME SA DE CV")
    act = {3: (2019, 10), 4: (2025, 3)}
    out = resolve([("ACM010101AB1", "ACME SA DE CV", 0)], {}, {k: {3, 4}}, {}, {}, activity=lambda v: act[v])
    assert out["ACM010101AB1"] == ("name_split", 4, 2)


def test_name_hit_without_cosignal_is_only_probable():
    k = loose_key("ACME SA DE CV")
    out = resolve([("ACM010101AB1", "ACME SA DE CV", 0)], {}, {k: {3}}, {}, {}, cosignal=lambda r, v: False)
    assert out["ACM010101AB1"] == ("probable_name", 3, 1)


def test_org_name_pattern_catches_firms_flagged_as_individuals():
    from scripts.resolve_comprasmx_vendors import ORG_NAME
    assert ORG_NAME.search("G HERRERA CONSULTING SCP")
    assert ORG_NAME.search("MUNICIPIO DE RAMOS ARIZPE")
    assert not ORG_NAME.search("JUAN SALAS PEREZ")


def test_rfc_year_and_predates_guard():
    from scripts.resolve_comprasmx_vendors import rfc_year
    assert rfc_year("CCO080101AB1") == (2008, False)
    assert rfc_year("ABCD850101AB1") == (1985, False)
    assert rfc_year("EXT910101FR001")[1] is True
    k = loose_key("COMPANIA CONSTRUCTORA SA DE CV")
    out = resolve([("CCO080101AB1", "COMPANIA CONSTRUCTORA SA DE CV", 0)], {}, {k: {2042}}, {}, {},
                  predates_rfc=lambda r, v: True)
    assert out["CCO080101AB1"][0] == "review_name"


def test_rfc_date_cosignal_does_not_rescue_a_weak_rfc_hit():
    out = resolve([("CAA141009AB1", "SOLUCIONES MED FLP", 0)], {"CAA141009AB1": {7}}, {}, {}, {},
                  cosignal=lambda r, v: True, buyer_cosignal=lambda r, v: False, name_sim=lambda n, v: 0.2)
    assert out["CAA141009AB1"][0] == "review_rfc"
