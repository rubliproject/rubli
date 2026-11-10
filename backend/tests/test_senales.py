"""«Señales nuevas» (docs/SENALES_NUEVAS.md): frozen definitions on crafted rows, the 100B rule,
companies only, the «Nuevos» set disjoint from every ground-truth label set, and no RFC /
persona física / official name in any payload."""
import json
import re
import sqlite3

import numpy as np
import pandas as pd
import pytest

from scripts import compute_senales_nuevas as m

RFC = re.compile(r"\b[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}\b")
INST = {1: "IMSS", 2: "ISSSTE", 3: "SEDENA"}


def K(rows):
    """Crafted contract frame with the columns compute_senales_nuevas.load() produces."""
    base = dict(id=None, st="D", vendor_id=None, inst=1, sector=1, proc=None, ptype="", year=2024, amount=1e6,
                is_da=0, article=None, src="compranet", date=pd.Timestamp("2024-03-01"), pub=pd.NaT, ape=pd.NaT,
                obra=False, intl=False, code=None)
    df = pd.DataFrame([{**base, **r} for r in rows])
    for c in ("date", "pub", "ape"):
        df[c] = pd.to_datetime(df[c])
    return df


def tender(vid, proc, days, inst=1, year=2024, intl=False, amount=1e6):
    pub = pd.Timestamp(f"{year}-03-01")
    return dict(vendor_id=vid, proc=proc, inst=inst, year=year, intl=intl, amount=amount,
                ptype="LICITACIÓN PÚBLICA", pub=pub, ape=pub + pd.Timedelta(days=days - 1))


# ---------------------------------------------------------------- (a) plazo_reducido
@pytest.mark.no_db
def test_tender_days_counts_publication_day():
    s = m.tender_days(pd.Series([pd.Timestamp("2024-01-01")]), pd.Series([pd.Timestamp("2024-01-10")]))
    assert s.iloc[0] == 10  # 9 calendar days apart = 10 counted = the reduced floor, not below it


@pytest.mark.no_db
def test_plazo_reducido_fires_against_buyer_baseline():
    rows = [tender(7, f"R{i}", 11) for i in range(3)]                 # vendor 7: three 11-day calls
    rows += [tender(100 + i, f"N{i}", 16) for i in range(20)]         # the same buyer usually runs 16 days
    out = m.sig_plazo_reducido(K(rows), INST)
    assert list(out.vendor_id) == [7]
    d = out.detail.iloc[0]
    assert (d["n_red"], d["n_lic"], d["min_days"], d["below_floor"]) == (3, 3, 11, 0)
    assert d["examples"][0][1] == "IMSS"


@pytest.mark.no_db
def test_plazo_reducido_full_minimum_is_compliant_and_routine_buyers_dont_fire():
    ok = [tender(7, f"R{i}", 15) for i in range(4)] + [tender(8, f"I{i}", 20, intl=True) for i in range(4)]
    assert m.sig_plazo_reducido(K(ok), INST).empty                     # 15 nacional / 20 internacional = legal minimum
    routine = [tender(7, f"R{i}", 11) for i in range(3)] + [tender(100 + i, f"N{i}", 11) for i in range(20)]
    assert 7 not in set(m.sig_plazo_reducido(K(routine), INST).vendor_id)  # buyer rushes everyone: no 2x excess


# ---------------------------------------------------------------- (b) urgencia
@pytest.mark.no_db
def test_urgencia_crosswalk_and_rule():
    rows = [dict(vendor_id=5, article="ART. 41 FR. V", amount=9e6, code=f"U{i}") for i in range(3)]
    rows += [dict(vendor_id=5, article="ART. 42 PÁRRAFO PRIMERO", amount=1e6)]
    rows += [dict(vendor_id=200 + i, article="ART. 41 FR. I", amount=1e8) for i in range(5)]  # patents: not urgency
    out = m.sig_urgencia(K(rows), INST)
    assert list(out.vendor_id) == [5]
    assert out.detail.iloc[0]["share"] == pytest.approx(27 / 28, abs=1e-3)
    assert {"ART. 41 FR. II", "ART. 54 FR. V", "ART. 42 FR. II", "ART. 45 BIS"} <= m.URGENCY_ARTICLES
    assert "ART. 41 FR. I" not in m.URGENCY_ARTICLES


@pytest.mark.no_db
def test_urgencia_buyer_practice_is_not_a_vendor_signal():
    rows = [dict(vendor_id=5, inst=2, article="ART. 54 FR. II", amount=9e6) for _ in range(3)]
    rows += [dict(vendor_id=300 + i, inst=2, article="ART. 54 FR. II", amount=8e6) for i in range(6)]
    assert m.sig_urgencia(K(rows), INST).empty  # the buyer pays everyone this way: no 3x excess


@pytest.mark.no_db
def test_urgencia_ignores_structures_without_the_article():
    rows = [dict(vendor_id=5, st="C", article="ART. 41 FR. V", amount=9e6) for _ in range(5)]
    assert m.sig_urgencia(K(rows), INST).empty


# ---------------------------------------------------------------- (c) antes_del_fallo (fallo.build reused)
def fallo_row(vid, fallo, inicio, amount=5e6, tipo="LICITACIÓN PÚBLICA", code="C-1"):
    return ("IMSS", "INSTITUTO", tipo, "LA-1", code, "t", None, None, fallo, inicio, None, None, amount,
            "PROVEEDOR SA DE CV", "NO", vid, 1, 1)


@pytest.mark.no_db
def test_antes_del_fallo_reuses_published_definition():
    rows = [fallo_row(9, "2025-03-10", "2025-03-05", code="C-A"),
            fallo_row(10, "2025-03-10 03:00:00", "2025-03-09", code="C-B"),  # UTC 03:00 = 9 Mar 21:00 CDMX
            fallo_row(11, "2025-03-10", "2025-03-11", code="C-C"),
            fallo_row(12, "2025-03-10", "2025-03-01", amount=2e11, code="C-D")]  # > 100B: rejected
    out = m.sig_antes_del_fallo(rows)
    assert list(out.vendor_id) == [9]
    assert out.detail.iloc[0]["max_days_early"] == 5
    assert out.detail.iloc[0]["examples"][0][0] == "C-A"


# ---------------------------------------------------------------- (g) empresa_joven
@pytest.mark.no_db
def test_incorporation_date_from_company_rfc_only():
    s = m.incorporation_date(pd.Series(["ABC200115XY1", "abc991231xx1", "ABCD800101XY1", "ABC201399XY1", None]))
    assert s.iloc[0] == pd.Timestamp("2020-01-15")
    assert s.iloc[1] == pd.Timestamp("1999-12-31")
    assert s.iloc[2:].isna().all()  # 13-char persona física, impossible date, missing


@pytest.mark.no_db
def test_empresa_joven_window():
    V = pd.DataFrame({"vendor_id": [1, 2, 3], "rfc": ["AAA240101AA1", "BBB230101BB1", "CCC240601CC1"],
                      "name": ["A SA", "B SA", "C SA"], "is_individual": [0, 0, 0], "last_contract_date": None})
    rows = [dict(vendor_id=v, date=pd.Timestamp("2024-04-10")) for v in (1, 2, 3)]
    out = m.sig_empresa_joven(K(rows), V)
    assert list(out.vendor_id) == [1]  # 100 days; 2 = 465 days; 3 = contract before incorporation
    assert out.detail.iloc[0]["gap_days"] == 100
    assert "rfc" not in json.dumps(list(out.detail)).lower()


# ---------------------------------------------------------------- (h) comprador_dominado
@pytest.mark.no_db
def test_comprador_dominado_thresholds():
    big = [dict(vendor_id=1, inst=1, amount=6e7)] + [dict(vendor_id=10 + i, inst=1, amount=1e7) for i in range(4)]
    out = m.sig_comprador_dominado(K(big), INST)
    assert list(out.vendor_id) == [1]
    assert out.detail.iloc[0]["examples"][0][:3] == [2024, "IMSS", 0.6]
    four = [dict(vendor_id=1, inst=2, amount=6e7)] + [dict(vendor_id=10 + i, inst=2, amount=1.4e7) for i in range(3)]
    assert m.sig_comprador_dominado(K(four), INST).empty     # < 5 suppliers
    half = [dict(vendor_id=1, inst=3, amount=5e7)] + [dict(vendor_id=10 + i, inst=3, amount=1.25e7) for i in range(4)]
    assert m.sig_comprador_dominado(K(half), INST).empty     # exactly 50 % is not "more than half"


@pytest.mark.no_db
def test_100b_rule_removes_decimal_errors_before_any_signal():
    rows = [dict(vendor_id=1, inst=1, amount=1.5e11)] + [dict(vendor_id=10 + i, inst=1, amount=3e7) for i in range(4)]
    clean = m.clean(K(rows))
    assert clean.amount.max() <= 1e11 and 1 not in set(clean.vendor_id)
    assert 1 not in set(m.sig_comprador_dominado(clean, INST).vendor_id)


# ---------------------------------------------------------------- companies only + «Nuevos»
@pytest.mark.no_db
def test_eligible_vendors_companies_only():
    V = pd.DataFrame({"vendor_id": [1, 2, 3, 4, 5],
                      "rfc": ["AAA240101AA1", "GOMJ800101AB1", None, np.nan, "AAA240101AA2"],
                      "name": ["UNO SA DE CV", "JUAN GOMEZ", "SECRETARIA DE SALUD", "TRES SA", None],
                      "is_individual": [0, 0, 0, np.nan, 1]})
    # 13-char RFC and public body are out; a 12-char (company) RFC stays in even with is_individual=1
    # (public_labels.is_persona_fisica: RFC shape beats the flag)
    assert m.eligible_vendors(V, set()) == {1, 4, 5}


def _S(pairs):
    return pd.DataFrame([dict(vendor_id=v, signal=s, n_contracts=1, money_mxn=1.0, first_year=2020,
                              last_year=2024, detail={}) for v, s in pairs])


@pytest.mark.no_db
def test_build_nuevos_filters_and_rank():
    S = _S([(1, "urgencia"), (1, "plazo_reducido"), (1, "pareja"),
            (2, "urgencia"), (2, "arranque"),
            (3, "urgencia"), (3, "arranque"),        # known (any GT link)
            (4, "urgencia"), (4, "arranque"),        # not eligible (persona física)
            (5, "urgencia"),                         # one signal only
            (6, "urgencia"), (6, "arranque"),        # inactive since 2017
            (7, "urgencia"), (7, "arranque")])
    Kc = K([dict(vendor_id=v, year=2024, amount=a) for v, a in ((1, 1e6), (2, 5e8), (3, 9e9), (4, 9e9), (5, 9e9),
                                                                 (7, 2e9))] + [dict(vendor_id=6, year=2017)])
    V = pd.DataFrame({"vendor_id": range(1, 8), "last_contract_date": [None] * 5 + ["2017-05-01", None]})
    N = m.build_nuevos(S, Kc, V, known={3}, eligible={1, 2, 3, 5, 6, 7})
    assert list(N.vendor_id) == [1, 7, 2]           # 3 signals first, then money
    assert list(N["rank"]) == [1, 2, 3] and set(N.novel) == {1}


@pytest.mark.no_db
def test_newtabs_readers_keep_their_frozen_definitions():
    pa = pd.DataFrame({"vendor_id": [1, 1, 2], "institution_id": [1, 2, 1], "n_years": [12, 10, 11],
                       "first_year": [2010, 2012, 2011], "last_year": [2021, 2021, 2021],
                       "money_mxn": [5e8, 1e8, 3e8], "noncomp_share": [0.9, 0.85, 0.5], "frozen": [1, 1, 0]})
    out = m.sig_pareja(pa, INST)
    assert list(out.vendor_id) == [1] and out.detail.iloc[0]["n_pairs"] == 2
    md = pd.DataFrame({"vendor_id": [3, 3], "institution_id": [1, 2], "contract_date": ["2024-01-02", "2024-02-02"],
                       "year": [2024, 2024], "n": [3, 2], "sum_mxn": [2e6, 1.5e6]})
    out = m.sig_mismo_dia(md, INST)
    assert out.detail.iloc[0]["n_lots"] == 2 and out.n_contracts.iloc[0] == 5
    ar = pd.DataFrame({"vendor_id": [4], "first_year": [2022], "y1_n": [9], "y1_mxn": [2e8], "days_to_threshold": [40],
                       "y1_da_share": [0.7], "censored": [0], "flag_10b": [0]})
    assert m.sig_arranque(ar).money_mxn.iloc[0] == 2e8


# ---------------------------------------------------------------- built tables + endpoints (full DB)
@pytest.fixture(scope="module")
def db():
    from api.dependencies import DB_PATH
    conn = sqlite3.connect(f"file:{DB_PATH.as_posix()}?mode=ro", uri=True)
    if not conn.execute("SELECT 1 FROM sqlite_master WHERE name='aria_nuevos_signals'").fetchone():
        pytest.skip("senales tables not built (python -m scripts.compute_senales_nuevas)")
    yield conn
    conn.close()


def test_nuevos_disjoint_from_every_gt_label_set(db):
    from api.public_labels import label_sets
    nuevos = {r[0] for r in db.execute("SELECT vendor_id FROM aria_nuevos_signals")}
    assert nuevos
    gt_any = {r[0] for r in db.execute("SELECT vendor_id FROM ground_truth_vendors WHERE vendor_id IS NOT NULL")}
    ls = label_sets(db)
    for s in (gt_any, ls["documented"], ls["leads"], ls["fp"], set(ls["suppressed"])):
        assert not (nuevos & s)
    assert db.execute("SELECT MIN(n_signals) FROM aria_nuevos_signals").fetchone()[0] >= 2


def test_tables_hold_companies_only_and_no_rfc(db):
    from api.public_labels import is_persona_fisica
    for vid, ind, rfc in db.execute("""SELECT DISTINCT s.vendor_id, v.is_individual, v.rfc FROM vendor_signals s
                                       JOIN vendors v ON v.id = s.vendor_id"""):
        assert not is_persona_fisica(ind, rfc), vid
    for (dj,) in db.execute("SELECT detail_json FROM vendor_signals"):
        assert not RFC.search(dj)


def test_endpoints_plain_sentences_no_rfc(client, base_url, db):
    r = client.get(f"{base_url}/senales/nuevos?limit=20")
    assert r.status_code == 200
    body = r.json()
    assert body["available"] and body["items"] and not RFC.search(r.text)
    assert [it["rank"] for it in body["items"]] == sorted(it["rank"] for it in body["items"])
    vid = body["items"][0]["vendor_id"]
    v = client.get(f"{base_url}/senales/vendor/{vid}")
    assert v.status_code == 200 and not RFC.search(v.text)
    sig = v.json()["signals"]
    assert len(sig) >= 2 and all(s["sentence"]["es"] and s["sentence"]["en"] for s in sig)
    assert "corrup" not in v.text.lower()
