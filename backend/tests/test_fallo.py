"""«Empezó antes del fallo» — /analysis/antes-del-fallo (NOTES_fallo.md: 1,025 · 17,404 MDP of 53,512)."""
from datetime import date

import pytest

from api.routers.fallo import COLS, build, mx_date


def _row(fallo, inicio, amt=1e6, pub=None, sig='X', tipo='LICITACIÓN PÚBLICA', prov='P SA', pf=0, rfc=None):
    # siglas, institucion, tipo, proc, code, titulo, pub, ape, fallo, inicio, firma, fin, amount, proveedor,
    # caso_fortuito, vendor_id, institution_id, sector_id, is_persona_fisica, rfc
    return (sig, 'INSTITUTO X', tipo, 'LA-1', 'C-2025-1', 't', pub, None, fallo, inicio, None, None, amt, prov,
            'NO', 1, 2, 3, pf, rfc)


@pytest.mark.no_db
def test_utc_stamps_become_mexico_city_dates():
    assert mx_date('2025-08-02 03:10:00') == date(2025, 8, 1)   # 21:10 local on the 1st
    assert mx_date('2025-08-02 00:00:00') == date(2025, 8, 2)   # midnight-exact = plain date
    assert mx_date('2025-08-02') == date(2025, 8, 2)
    assert mx_date(None) is None and mx_date('basura') is None


@pytest.mark.no_db
def test_evening_fallo_is_not_early_but_next_day_is():
    # a fallo stamped 03 h UTC on the 2nd is the evening of the 1st: start on the 1st is the same day, not early
    o = build([_row('2025-08-02 03:10:00', '2025-08-01')])
    assert o['meta']['n'] == 0 and o['meta']['pop_n'] == 1
    o = build([_row('2025-08-02 18:00:00', '2025-08-01')])  # 12 h local on the 2nd → one day early
    assert o['meta']['n'] == 1
    r = o['early'][0]
    assert r['ini'] == -1 and r['fallo'] == '2025-08-02'


@pytest.mark.no_db
def test_100b_rejected_10b_flagged_prepub_counted():
    o = build([_row('2025-03-10', '2025-03-01', amt=2e11),             # > 100B: out of every figure
               _row('2025-03-10', '2025-03-01', amt=2e10),             # > 10B: kept, flagged
               _row('2025-03-10', '2025-03-01', pub='2025-03-05')])    # began before publication
    m = o['meta']
    assert m['pop_n'] == 2 and m['n'] == 2 and m['flag_n'] == 1 and m['prepub_n'] == 1
    assert m['v'] == round((2e10 + 1e6) / 1e6)


@pytest.mark.no_db
def test_personas_fisicas_are_named_and_flagged():
    """Owner 2026-10-29 (transparency): a persona física is named as CompraNet publishes it and flagged `pf`;
    only an RFC-shaped name is dropped."""
    o = build([_row('2025-03-10', '2025-03-01', prov='JUAN PEREZ', pf=1),               # flagged PF
               _row('2025-03-10', '2025-03-01', prov='MARIA LOPEZ', rfc='LOPM800101AB1'),  # 13-char RFC
               _row('2025-03-10', '2025-03-01', prov='ACME ABCD800101AB1'),             # name embeds an RFC
               _row('2025-03-10', '2025-03-01', prov='ACME SA DE CV', rfc='ACM800101AB1')])
    by = {r['v']: r['pf'] for r in o['early']}
    assert by == {'JUAN PEREZ': True, 'MARIA LOPEZ': True, '': False, 'ACME SA DE CV': False}
    assert o['meta']['unnamed_n'] == 1 and o['meta']['pf_n'] == 2


@pytest.mark.no_db
def test_procedures_are_counted_once_per_tender():
    rows = [_row('2025-03-10', '2025-03-01'), _row('2025-03-10', '2025-03-02'),          # one tender, two early
            (*_row('2025-03-10', '2025-03-12')[:3], 'LA-2', *_row('2025-03-10', '2025-03-12')[4:])]   # on time
    o = build(rows)
    assert (o['meta']['n'], o['meta']['early_proc'], o['meta']['pop_proc']) == (2, 1, 2)
    assert (o['inst'][0]['early_proc'], o['inst'][0]['pop_proc']) == (1, 2)


@pytest.mark.slow
def test_endpoint_reproduces_the_corrected_count_without_rfc(client):
    r = client.get('/api/v1/analysis/antes-del-fallo')
    assert r.status_code == 200
    d = r.json()
    if not d.get('available'):
        pytest.skip('comprasmx_contracts absent')
    m = d['meta']
    assert (m['n'], m['v'], m['pop_n']) == (1025, 17404, 53512)
    assert (m['prepub_n'], m['nofirma_n'], m['jan1_n']) == (14, 230, 173)
    assert len(d['rows']) == m['n'] == sum(x['n'] for x in d['inst'])
    assert d['cols'] == COLS and all(row[COLS.index('ini')] < 0 for row in d['rows'])
    assert m['recon']['n'] == 12
    assert 'rfc' not in r.text.lower()


@pytest.mark.no_db
def test_ad_lag_highlights_name_and_flag_personas_fisicas():
    import sqlite3
    from api.routers.fallo import _side_cases
    db = sqlite3.connect(':memory:')
    db.execute("""CREATE TABLE comprasmx_contracts (orden_gobierno, tipo_procedimiento, siglas, institucion, proveedor,
        vendor_id, institution_id, amount_mxn, fecha_inicio, fecha_firma, codigo_contrato, caso_fortuito, rfc,
        is_persona_fisica, is_direct_award)""")
    for prov, rfc, pf, amt in (('JUAN PEREZ', None, 1, 9e8), ('MARIA LOPEZ', 'LOPM800101AB1', 0, 8e8),
                               ('ACME SA DE CV', 'ACM800101AB1', 0, 1e6)):
        db.execute("INSERT INTO comprasmx_contracts VALUES ('APF','ADJ','X','I',?,7,2,?,'2025-01-01','2025-12-01',"
                   "'C','NO',?,?,1)", (prov, amt, rfc, pf))
    assert [(r['v'], r['pf']) for r in _side_cases(db)['ad_lag']] == [('JUAN PEREZ', True), ('MARIA LOPEZ', True), ('ACME SA DE CV', False)]


def test_personas_fisicas_flagged_and_no_personal_rfc_returned(client):
    """Persona-física rows carry the `pf` flag (named, linked); no personal (13-char) RFC is ever returned."""
    import re
    r = client.get('/api/v1/analysis/antes-del-fallo')
    d = r.json()
    if not d.get('available'):
        pytest.skip('comprasmx_contracts absent')
    ix = {c: i for i, c in enumerate(d['cols'])}
    pf = [x for x in d['rows'] if x[ix['pf']]]
    assert pf and all(x[ix['v']] for x in pf) and d['meta']['pf_n'] == len(pf)
    assert not re.search(r'(?<![A-Z0-9])[A-ZÑ&]{4}\d{6}[A-Z0-9]{3}(?![A-Z0-9])', r.text)
