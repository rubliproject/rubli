"""New tabs — frozen definitions (docs/NEWTABS_DEFINITIONS.md).

Unit tests pin each definition on synthetic rows; endpoint tests pin the frozen counts on the real DB.
"""
import re
from datetime import date

import pandas as pd
import pytest

from scripts.precompute_newtabs import (
    PEF_DA_CAPS, arranque, mismo_dia, parejas, rfc_incorporation,
)


def _c(rows, cols=('id', 'vendor_id', 'institution_id', 'contract_date', 'amount_mxn',
                   'is_direct_award', 'is_single_bid', 'contract_type_normalized')):
    df = pd.DataFrame(rows, columns=list(cols))
    df['contract_date'] = pd.to_datetime(df['contract_date'])
    df['contract_year'] = df['contract_date'].dt.year
    return df


def _v(rows):
    # base_name = vendors.base_name (legal suffix stripped, accents/mojibake repaired)
    return pd.DataFrame(rows, columns=['id', 'rfc', 'name', 'is_individual', 'base_name'])


# ── RFC incorporation date (persona moral, 12 chars, YYMMDD at positions 4–9) ─────────────────────
@pytest.mark.no_db
def test_rfc_incorporation_parses_only_company_rfcs():
    assert rfc_incorporation('ABC150301XY1', date(2016, 1, 1)) == date(2015, 3, 1)
    assert rfc_incorporation('ABC991231XY1', date(2016, 1, 1)) == date(1999, 12, 31)
    assert rfc_incorporation('ABCD800101XY1', date(2016, 1, 1)) is None   # 13 chars = persona física
    assert rfc_incorporation('ABC151301XY1', date(2016, 1, 1)) is None    # month 13
    assert rfc_incorporation(None, date(2016, 1, 1)) is None


# ── El Arranque ─────────────────────────────────────────────────────────────────────────────────
@pytest.mark.no_db
def test_arranque_large_first_year_window_and_exclusions():
    c = _c([
        (1, 10, 1, '2015-01-10', 60e6, 1, 0, 'servicio'),   # v10: 60 + 50 within 365 d → 110 MDP ✓
        (2, 10, 1, '2015-12-01', 50e6, 1, 0, 'servicio'),
        (3, 11, 1, '2015-01-10', 60e6, 1, 0, 'servicio'),   # v11: second contract on day 366 → 60 ✗
        (4, 11, 1, '2016-01-11', 50e6, 1, 0, 'servicio'),
        (5, 12, 1, '2009-05-01', 1e6, 1, 0, 'servicio'),    # v12: first contract before 2011 ✗
        (6, 12, 1, '2015-01-10', 200e6, 1, 0, 'servicio'),
        (7, 13, 1, '2015-02-01', 2e11, 1, 0, 'servicio'),   # v13: > 100B rejected → nothing left ✗
        (8, 14, 1, '2015-02-01', 150e6, 1, 0, 'servicio'),  # v14: persona física → counted, not listed
        (9, 15, 1, '2012-01-01', 1e6, 1, 0, 'servicio'),    # v15: earlier vendor with the same name key
        (10, 16, 1, '2018-06-01', 300e6, 0, 0, 'servicio'), # v16: re-incorporation of v15 → dropped
        (11, 17, 1, '2020-01-01', 120e6, 1, 0, 'servicio'), # v17: incorporated 2019-10-01 → < 180 d
    ])
    v = _v([(10, None, 'ALFA SA DE CV', 0, 'ALFA'), (11, None, 'BETA SA', 0, 'BETA'), (12, None, 'GAMA SA', 0, 'GAMA'),
            (13, None, 'DELTA SA', 0, 'DELTA'), (14, 'PEPJ800101AB1', 'JUAN PEREZ', 1, 'JUAN PEREZ'),
            (15, None, 'OMEGA SA DE CV', 0, 'OMEGA'), (16, None, 'Omega, S.A. de C.V.', 0, 'OMEGA'),
            (17, 'XYZ191001AB1', 'ZETA SAPI DE CV', 0, 'ZETA')])
    rows, meta = arranque(c, v)
    assert sorted(rows['vendor_id']) == [10, 17]
    assert meta['n_persona_fisica'] == 1 and meta['n_dropped_prior_name'] == 1
    r17 = rows.set_index('vendor_id').loc[17]
    assert r17['incorp_bucket'] == 'lt180' and r17['days_to_threshold'] == 0
    r10 = rows.set_index('vendor_id').loc[10]
    assert r10['y1_mxn'] == 110e6 and r10['days_to_threshold'] == (date(2015, 12, 1) - date(2015, 1, 10)).days
    assert pd.isna(r10['incorp_bucket'])
    assert meta['incorp_dated'] == 1 and meta['incorp_lt180'] == 1 and meta['incorp_lt365'] == 1
    assert 'rfc' not in rows.columns


# ── El Mismo Día ────────────────────────────────────────────────────────────────────────────────
@pytest.mark.no_db
def test_mismo_dia_band_independent_caps():
    lo, hi = PEF_DA_CAPS[2024]['laassp']           # miles de pesos, sin IVA (Anexo 9)
    lo, hi = lo * 1000, hi * 1000
    each = lo - 1
    n = int(hi * 1.16 // each) + 1                # just enough pieces to beat the highest cap with IVA
    rows = [(i, 7, 1, '2024-03-05', each, 1, 0, 'adquisicion') for i in range(n)]
    rows += [(100 + i, 8, 1, '2024-03-05', each, 1, 0, 'adquisicion') for i in range(n - 1)]  # sum too low
    rows += [(200 + i, 9, 1, '2024-03-05', each, 0, 0, 'adquisicion') for i in range(n)]      # not DA
    rows += [(300 + i, 7, 2, '2024-03-05', each, 1, 0, 'adquisicion') for i in range(n)]      # non-federal buyer
    rows += [(400 + i, 7, 1, '2018-03-05', each, 1, 0, 'adquisicion') for i in range(n)]      # no transcribed cap
    rows += [(500, 7, 1, '2024-03-05', lo + 5, 1, 0, 'adquisicion')]                          # above the low cap: not a piece
    lots = mismo_dia(_c(rows), federal_ids={1})
    assert len(lots) == 1
    lot = lots.iloc[0]
    assert (lot['vendor_id'], lot['n'], lot['year']) == (7, n, 2024) and 500 not in lot['contract_ids']
    assert lot['sum_mxn'] > hi * 1.16 and lot['max_mxn'] < lo
    assert len(mismo_dia(_c(rows), federal_ids={1}, m=2.0)) == 0   # placebo: caps × 2


# ── Las Parejas ─────────────────────────────────────────────────────────────────────────────────
@pytest.mark.no_db
def test_parejas_consecutive_run_and_noncompetitive_share():
    rows, k = [], 0
    for y in range(2011, 2021):                    # pair (1, 1): 10 consecutive years, all DA
        rows.append((k, 1, 1, f'{y}-05-01', 10e6, 1, 0, 'servicio')); k += 1
    for y in list(range(2011, 2016)) + list(range(2017, 2023)):   # pair (2, 1): 11 years, gap → run 6
        rows.append((k, 2, 1, f'{y}-05-01', 10e6, 1, 0, 'servicio')); k += 1
    for y in range(2011, 2021):                    # pair (3, 1): 10 years, 70 % competitive money
        rows.append((k, 3, 1, f'{y}-05-01', 10e6, 1 if y < 2014 else 0, 0, 'servicio')); k += 1
    p = parejas(_c(rows)).set_index('vendor_id')
    assert bool(p.loc[1, 'frozen']) and p.loc[1, 'max_run'] == 10 and p.loc[1, 'noncomp_share'] == 1.0
    assert not p.loc[2, 'frozen'] and p.loc[2, 'n_years'] == 11 and p.loc[2, 'max_run'] == 6
    assert not p.loc[3, 'frozen'] and round(p.loc[3, 'noncomp_share'], 2) == 0.30
    assert (p.loc[1, 'first_year'], p.loc[1, 'last_year'], p.loc[1, 'money_mxn']) == (2011, 2020, 100e6)


@pytest.mark.no_db
def test_rfc_shaped_names_are_never_shipped():
    from api.routers.newtabs import clean_name
    assert clean_name('ABC121221TG0') is None and clean_name('ACME ABCD800101AB1') is None
    assert clean_name('GRUPO 2000 SA DE CV') == 'GRUPO 2000 SA DE CV' and clean_name(None) is None


# ── Endpoints on the real DB (frozen counts) ───────────────────────────────────────────────────
RFC_RE = re.compile(r'"[A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{3}"')


def _no_leaks(text):
    low = text.lower()
    assert '"rfc' not in low and 'responsible_uc' not in low and not RFC_RE.search(text)


def test_arranque_endpoint_frozen(client):
    r = client.get('/api/v1/newtabs/arranque')
    assert r.status_code == 200
    d = r.json()
    if not d.get('available'):
        pytest.skip('newtabs tables not built')
    m = d['meta']
    assert m['n'] == len(d['rows']) == FROZEN['arranque']
    assert all(x['y1_mxn'] >= 100e6 and x['first_date'] >= '2011-01-01' for x in d['rows'])
    _no_leaks(r.text)


def test_mismo_dia_endpoint_frozen(client):
    r = client.get('/api/v1/newtabs/mismo-dia')
    assert r.status_code == 200
    d = r.json()
    if not d.get('available'):
        pytest.skip('newtabs tables not built')
    assert d['meta']['n'] == FROZEN['mismo_dia']
    assert set(d['meta']['years']) == set(PEF_DA_CAPS)
    assert all(x['max_mxn'] <= 100e9 for x in d['rows'])
    _no_leaks(r.text)


def test_mismo_dia_piezas_returns_the_lot(client):
    d = client.get('/api/v1/newtabs/mismo-dia', params={'limit': 1}).json()
    if not d.get('available'):
        pytest.skip('newtabs tables not built')
    lot = d['rows'][0]
    r = client.get('/api/v1/newtabs/mismo-dia/piezas', params={
        'institution_id': lot['institution_id'], 'vendor_id': lot['vendor_id'], 'date': lot['contract_date']})
    p = r.json()['rows']
    assert len(p) == lot['n'] and {x['id'] for x in p} == set(lot['contract_ids'])
    assert abs(sum(x['amount_mxn'] for x in p) - lot['sum_mxn']) < 1 and max(x['amount_mxn'] for x in p) < lot['low_cap_mxn']
    _no_leaks(r.text)


def test_parejas_endpoint_frozen(client):
    r = client.get('/api/v1/newtabs/parejas')
    assert r.status_code == 200
    d = r.json()
    if not d.get('available'):
        pytest.skip('newtabs tables not built')
    assert d['meta']['n'] == FROZEN['parejas'] and d['meta']['n_distinct10'] == FROZEN['parejas_distinct10']
    r2 = client.get('/api/v1/newtabs/parejas', params={'institution_id': d['rows'][0]['institution_id']})
    assert r2.status_code == 200 and r2.json()['rows']
    _no_leaks(r.text)


def test_rastro_endpoint_carves_to_a_contract(client):
    r = client.get('/api/v1/newtabs/rastro', params={'institution_id': 251})   # IMSS
    assert r.status_code == 200
    d = r.json()
    cat = d['rows'][0]
    assert 0 < cat['share'] <= 1 and abs(sum(x['share'] for x in d['rows']) - 1) < 1e-6 or d['meta']['truncated']
    r = client.get('/api/v1/newtabs/rastro', params={'institution_id': 251, 'category_id': cat['id']})
    ven = r.json()['rows'][0]
    r = client.get('/api/v1/newtabs/rastro',
                   params={'institution_id': 251, 'category_id': cat['id'], 'vendor_id': ven['id']})
    con = r.json()['rows'][0]
    assert con['id'] and 0 < con['share'] <= 1 and con['amount_mxn'] <= 100e9
    _no_leaks(r.text)


def test_persona_fisica_never_named(client):
    from api.dependencies import DB_PATH
    import sqlite3
    with sqlite3.connect(f'file:{DB_PATH}?mode=ro', uri=True) as db:
        for t in ('newtabs_arranque', 'newtabs_mismo_dia', 'newtabs_parejas'):
            if db.execute("SELECT 1 FROM sqlite_master WHERE name=?", (t,)).fetchone() is None:
                pytest.skip('newtabs tables not built')
            n = db.execute(f"""SELECT COUNT(*) FROM {t} x JOIN vendors v ON v.id = x.vendor_id
                WHERE (COALESCE(v.is_individual,0)=1 OR LENGTH(TRIM(COALESCE(v.rfc,'')))=13)
                  AND x.vendor_name IS NOT NULL""").fetchone()[0]
            assert n == 0, t


# Filled from the first full run (docs/NEWTABS_DEFINITIONS.md); a change means the data or a definition moved.
# arranque: 1,053 in the frozen table, 1,043 served after the 10 public bodies are dropped (endpoint).
FROZEN = {'arranque': 1043, 'mismo_dia': 1622, 'parejas': 2373, 'parejas_distinct10': 7509}


@pytest.mark.no_db
def test_unavailable_is_not_cached_and_rastro_is_capped():
    from fastapi import HTTPException
    from api.cache import app_cache
    from api.routers import newtabs as m
    calls = []
    m._cached("t:unavail", lambda: calls.append(1) or {"available": False})
    m._cached("t:unavail", lambda: calls.append(1) or {"available": False})
    assert len(calls) == 2 and app_cache.get("newtabs", "t:unavail") is None
    held = [m._RASTRO_SLOTS.acquire(blocking=False) for _ in range(2)]
    try:
        with pytest.raises(HTTPException) as e:
            m._rastro_cached("t:ra", lambda: {"available": True})
        assert e.value.status_code == 429
    finally:
        for ok in held:
            if ok:
                m._RASTRO_SLOTS.release()
    assert m._rastro_cached("t:ra", lambda: {"available": True}) == {"available": True}


def test_arranque_drops_public_bodies_and_unnamed_ids(client):
    d = client.get('/api/v1/newtabs/arranque').json()
    if not d.get('available'):
        pytest.skip('newtabs tables not built')
    m = d['meta']
    assert m['n_public_dropped'] == 10 and m['n'] == sum(m['by_first_year'].values())
    assert abs(m['money_y1_mxn'] - sum(x['y1_mxn'] for x in d['rows'])) < 1
    ids = {x['vendor_id'] for x in d['rows']}
    assert 243542 not in ids and 103089 not in ids   # Fonatur Infraestructura (public_soe) · a Veracruz OPD
    assert 0 < m['incorp_median_days'] < 10 * 365 and m['incorp_lt365'] <= m['incorp_dated'] <= m['n']


def test_arranque_rows_carry_the_board_columns(client):
    """Los patrones § El arranque: each firm ships its first contract's buyer/sector/category/indicator and the
    days from incorporation to that contract — never the RFC nor the incorporation date."""
    d = client.get('/api/v1/newtabs/arranque').json()
    if not d.get('available'):
        pytest.skip('newtabs tables not built')
    by = {x['vendor_id']: x for x in d['rows']}
    w = by[312747]                                    # Whitemed ← IMSS, first contract 3016857 (2024-04-25)
    assert w['first_contract_id'] == 3016857 and w['institution_id'] == 251 and w['sector_id'] == 1
    assert w['first_procedure'] == 'directa' and w['first_risk_score'] >= 0.60 and 0 <= w['age_days'] < 365
    assert w['incorp_bucket'] in ('lt180', 'lt365')
    young = [x for x in d['rows'] if x['incorp_bucket'] in ('lt180', 'lt365')]
    assert young and all(x['age_days'] is not None and x['age_days'] < 365 for x in young)
    assert all(x['age_days'] is None or x['age_days'] >= 0 for x in d['rows'])
    assert 'incorporation' not in r_text(client) and 'fecha_const' not in r_text(client)


def r_text(client):
    return client.get('/api/v1/newtabs/arranque').text


def test_mismo_dia_personas_fisicas_named_and_flagged(client):
    """Owner 2026-10-29: persona-física lots carry the vendor id, contract ids, name and persona_fisica flag;
    no personal RFC is ever returned."""
    r = client.get('/api/v1/newtabs/mismo-dia', params={'limit': 5000})
    d = r.json()
    if not d.get('available'):
        pytest.skip('newtabs tables not built')
    pf = [x for x in d['rows'] if x['is_pf']]
    assert pf and all(x['persona_fisica'] and x['vendor_id'] and len(x['contract_ids']) == x['n'] for x in pf)
    assert sum(1 for x in pf if x['vendor_name']) >= 0.9 * len(pf)
    assert not re.search(r'(?<![A-Z0-9])[A-ZÑ&]{4}\d{6}[A-Z0-9]{3}(?![A-Z0-9])', r.text)
    m = d['meta']
    assert m['apf_buyers'] >= m['institutions'] and any(x['is_soe'] for x in d['rows'])
    last = max(m['years'])
    lead = max((x for x in d['rows'] if x['year'] >= last - 1 and not x['is_pf'] and x['vendor_name']), key=lambda x: x['sum_mxn'])
    assert m['lead_above_cap'] and all(a >= lead['low_cap_mxn'] for a in m['lead_above_cap'])


_RFC_PF = re.compile(r'(?<![A-Z0-9])[A-ZÑ&]{4}\d{6}[A-Z0-9]{3}(?![A-Z0-9])')


def test_parejas_and_rastro_name_personas_fisicas_without_rfc(client):
    """Policy 10-29: parejas / rastro name a persona física (CompraNet's name) and flag it; no personal RFC,
    no rfc/curp key, ever."""
    r = client.get('/api/v1/newtabs/parejas', params={'limit': 2000})
    d = r.json()
    if not d.get('available'):
        pytest.skip('newtabs tables not built')
    assert not _RFC_PF.search(r.text) and '"rfc"' not in r.text and 'curp' not in r.text.lower()
    pf = [x for x in d['rows'] if x['is_pf']]
    assert all(x['persona_fisica'] for x in pf)
    assert all(x['vendor_name'] for x in d['rows'] if x['persona_fisica'] and not x['is_pf'])  # no-RFC person: named + labelled
    if pf:
        assert sum(1 for x in pf if x['vendor_name']) >= 0.9 * len(pf)
        p = pf[0]
        r = client.get('/api/v1/newtabs/parejas', params={'vendor_id': p['vendor_id']})
        assert any(x['vendor_name'] == p['vendor_name'] for x in r.json()['rows']) and not _RFC_PF.search(r.text)
    cat = client.get('/api/v1/newtabs/rastro', params={'institution_id': 251}).json()['rows'][0]
    r = client.get('/api/v1/newtabs/rastro', params={'institution_id': 251, 'category_id': cat['id']})
    rows = r.json()['rows']
    assert not _RFC_PF.search(r.text) and '"rfc"' not in r.text
    assert all(x['name'] for x in rows if x['is_pf'])  # named, flagged
