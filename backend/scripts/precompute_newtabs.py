"""New tabs — frozen definitions (docs/NEWTABS_DEFINITIONS.md) → newtabs_* tables.

    python -m scripts.precompute_newtabs [--db PATH] [--dry-run]

One read-only scan of contracts + vendors (file:...?mode=ro); the three tables and newtabs_meta are
written only at the end (build *_new, then swap). No RFC, no official name, no persona-física name is
written. Amounts: > 100B MXN rejected (out of every figure), > 10B flagged (flag_10b).
"""
from __future__ import annotations

import argparse
import json
import sqlite3
import sys
import time
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from api.public_labels import is_persona_fisica  # noqa: E402
from api.routers.newtabs import _NOT_APF_TYPES, _OWN_LAW, clean_name  # noqa: E402

MAX_CONTRACT_VALUE = 100_000_000_000
FLAG_THRESHOLD = 10_000_000_000
IVA = 1.16

# PEF Anexo 9 «Montos máximos de adjudicación directa», miles de pesos SIN IVA, lowest and highest budget band.
#   laassp = adquisiciones, arrendamientos y servicios; obra / srv = obra pública / servicios relacionados (LOPSRM).
# Sources: 2019–2022 PEF text (Cámara de Diputados copies, sc.inegi.org.mx/repositorioNormateca/PEF{Y}.pdf);
# 2023 gob.mx/cms/uploads/attachment/file/798499/PEF_2023.pdf (p. 37); 2024 dof.gob.mx/2023/SHCP/PEF_2024.html;
# 2025 dof.gob.mx/2024/SHCP/PEF_2025.html. Years before 2019 are not transcribed → no cap → not counted.
PEF_DA_CAPS = {
    2019: {'laassp': (200, 528), 'obra': (318, 1500), 'srv': (158, 789)},
    2020: {'laassp': (208, 549), 'obra': (331, 1559), 'srv': (164, 820)},
    2021: {'laassp': (215, 567), 'obra': (342, 1611), 'srv': (169, 847)},
    2022: {'laassp': (228, 600), 'obra': (362, 1706), 'srv': (179, 897)},
    2023: {'laassp': (270, 770), 'obra': (435, 2720), 'srv': (195, 1380)},
    2024: {'laassp': (284, 1050), 'obra': (458, 3569), 'srv': (205, 1811)},
    2025: {'laassp': (297, 1098), 'obra': (479, 3732), 'srv': (214, 1894)},
}
_CLS = {'adquisicion': 'laassp', 'arrendamiento': 'laassp', 'servicio': 'laassp', 'obra_publica': 'obra'}


def _valid(c: pd.DataFrame) -> pd.DataFrame:
    return c[(c['amount_mxn'] > 0) & (c['amount_mxn'] <= MAX_CONTRACT_VALUE)]


def _str(x):
    return x if isinstance(x, str) else None


def _is_pf(is_individual, rfc) -> bool:
    return is_persona_fisica(0 if pd.isna(is_individual) else is_individual, _str(rfc))


def rfc_incorporation(rfc, ref: date):
    """Incorporation date encoded in a persona-moral RFC (12 chars, YYMMDD at positions 4–9), else None."""
    s = (_str(rfc) or '').strip().upper()
    if len(s) != 12 or not s[3:9].isdigit():
        return None
    yy, mm, dd = int(s[3:5]), int(s[5:7]), int(s[7:9])
    y = 2000 + yy if 2000 + yy <= ref.year else 1900 + yy
    try:
        return date(y, mm, dd)
    except ValueError:
        return None


def _bucket(gap):
    if gap is None:
        return None
    return 'before' if gap < 0 else 'lt180' if gap < 180 else 'lt365' if gap < 365 else 'lt5y' if gap < 1826 else 'ge5y'


# ── 1. El Arranque ───────────────────────────────────────────────────────────────────────────────
def arranque(c, v, min_first='2011-01-01', threshold=100e6, window=365, horizon=None):
    """Vendors whose first CompraNet contract is ≥ min_first and whose money in the 365 days from that first
    contract (day 0 included) is ≥ threshold. Personas físicas are counted, not listed; a vendor whose
    vendors.base_name matches a vendor with an earlier first contract is dropped (re-incorporation)."""
    c = _valid(c)[['id', 'vendor_id', 'contract_date', 'amount_mxn', 'is_direct_award']]
    c = c.sort_values(['vendor_id', 'contract_date', 'amount_mxn'], ascending=[True, True, False])
    first = c.groupby('vendor_id')['contract_date'].min().rename('first')
    first_id = c.drop_duplicates('vendor_id').set_index('vendor_id')['id'].rename('first_contract_id')
    c = c.join(first, on='vendor_id')
    w = c[c['contract_date'] < c['first'] + pd.Timedelta(days=window)].copy()
    w['da_amt'] = w['amount_mxn'] * (w['is_direct_award'] == 1)
    w['cum'] = w.groupby('vendor_id')['amount_mxn'].cumsum()
    g = w.groupby('vendor_id').agg(y1_mxn=('amount_mxn', 'sum'), y1_n=('id', 'size'), da=('da_amt', 'sum'),
                                   mx=('amount_mxn', 'max'), first=('first', 'first'))
    cross = w[w['cum'] >= threshold].groupby('vendor_id')['contract_date'].min()
    g['days_to_threshold'] = (cross - g['first']).dt.days
    cand = g[(g['first'] >= pd.Timestamp(min_first)) & (g['y1_mxn'] >= threshold)].copy()

    vv = v.set_index('id')
    cand = cand.join(vv[['rfc', 'name', 'is_individual', 'base_name']], how='left')
    pf = np.array([_is_pf(i, r) for i, r in zip(cand['is_individual'], cand['rfc'])], bool)
    n_pf = int(pf.sum())
    cand = cand[~pf]

    names = v[['id', 'base_name']].join(first, on='id').dropna()
    names = names[names['base_name'].str.strip() != '']
    earliest = names.groupby('base_name')['first'].min()
    prior = cand['base_name'].map(earliest) < cand['first']
    n_prior = int(prior.fillna(False).sum())
    cand = cand[~prior.fillna(False)]

    inc = [rfc_incorporation(r, f.date()) for r, f in zip(cand['rfc'], cand['first'])]
    gaps = [(f.date() - d).days if d else None for d, f in zip(inc, cand['first'])]
    hz = pd.Timestamp(horizon) if horizon else c['contract_date'].max()
    rows = pd.DataFrame({
        'vendor_id': cand.index.astype(int),
        'vendor_name': cand['name'].map(clean_name).values,
        'first_date': cand['first'].dt.strftime('%Y-%m-%d').values,
        'first_year': cand['first'].dt.year.values,
        'first_contract_id': cand.index.map(first_id).astype(int),
        'y1_mxn': cand['y1_mxn'].values,
        'y1_n': cand['y1_n'].values,
        'y1_da_share': (cand['da'] / cand['y1_mxn']).round(4).values,
        'days_to_threshold': cand['days_to_threshold'].astype(int).values,
        'incorp_bucket': pd.Series([_bucket(x) for x in gaps], dtype=object).values,
        'censored': (cand['first'] > hz - pd.Timedelta(days=window)).values,
        'flag_10b': (cand['mx'] > FLAG_THRESHOLD).values,
    })
    valid = [x for x in gaps if x is not None]
    meta = {
        'n': len(rows), 'n_persona_fisica': n_pf, 'n_dropped_prior_name': n_prior,
        'incorp_dated': len(valid),
        'incorp_before': sum(x < 0 for x in valid),
        'incorp_lt180': sum(0 <= x < 180 for x in valid),
        'incorp_lt365': sum(0 <= x < 365 for x in valid),
        'incorp_median_days': float(np.median(valid)) if valid else None,
        'universe_first_ge_min': int((g['first'] >= pd.Timestamp(min_first)).sum()),
        'y1_p99_mxn': float(g.loc[g['first'] >= pd.Timestamp(min_first), 'y1_mxn'].quantile(0.99)),
    }
    return rows, meta


# ── 2. El Mismo Día ──────────────────────────────────────────────────────────────────────────────
def mismo_dia(c, federal_ids, m=1.0, caps=PEF_DA_CAPS):
    """Same federal institution × vendor × contract_date × legal schedule. Pieces: direct awards each below the
    LOWEST-band cap of that year (amount as stored). Lot: ≥ 2 pieces whose sum exceeds the HIGHEST-band cap
    plus IVA. Holds for any budget band and either IVA reading. m scales both caps (placebo)."""
    c = _valid(c)
    c = c[(c['is_direct_award'] == 1) & c['contract_year'].isin(list(caps)) & c['institution_id'].isin(federal_ids)]
    c = c.assign(cls=c['contract_type_normalized'].map(_CLS)).dropna(subset=['cls'])
    yr, cl = c['contract_year'].to_numpy(), c['cls'].to_numpy()
    lo = np.array([caps[y]['laassp'][0] if k == 'laassp' else min(caps[y]['obra'][0], caps[y]['srv'][0])
                   for y, k in zip(yr, cl)], float) * 1000 * m
    hi = np.array([caps[y]['laassp'][1] if k == 'laassp' else max(caps[y]['obra'][1], caps[y]['srv'][1])
                   for y, k in zip(yr, cl)], float) * 1000 * m
    c = c.assign(lo=lo, hi=hi)
    c = c[c['amount_mxn'] < c['lo']]
    key = ['institution_id', 'vendor_id', 'contract_date', 'cls']
    g = c.groupby(key, sort=False).agg(n=('id', 'size'), sum_mxn=('amount_mxn', 'sum'), max_mxn=('amount_mxn', 'max'),
                                       low_cap_mxn=('lo', 'first'), high_cap_mxn=('hi', 'first'),
                                       year=('contract_year', 'first'), contract_ids=('id', list)).reset_index()
    g = g[(g['n'] >= 2) & (g['sum_mxn'] > g['high_cap_mxn'] * IVA)].copy()
    g['contract_date'] = g['contract_date'].dt.strftime('%Y-%m-%d')
    return g.sort_values('sum_mxn', ascending=False).reset_index(drop=True)


# ── 3. Las Parejas ───────────────────────────────────────────────────────────────────────────────
def parejas(c, min_years=10, noncomp=0.80, da_from=2011):
    """Vendor × institution pairs with ≥ min_years distinct contract years (returned), frozen when the longest
    run of consecutive years is ≥ min_years AND ≥ noncomp of the pair's money dated ≥ da_from (the direct-award
    flag does not exist before 2011) went by direct award or single bid."""
    c = _valid(c)[['vendor_id', 'institution_id', 'contract_year', 'amount_mxn', 'is_direct_award', 'is_single_bid']]
    late = c['contract_year'] >= da_from
    c = c.assign(m11=c['amount_mxn'] * late,
                 nc11=c['amount_mxn'] * (late & ((c['is_direct_award'] == 1) | (c['is_single_bid'] == 1))),
                 da11=c['amount_mxn'] * (late & (c['is_direct_award'] == 1)),
                 fl=c['amount_mxn'] > FLAG_THRESHOLD)
    py = c.groupby(['vendor_id', 'institution_id', 'contract_year']).agg(
        money=('amount_mxn', 'sum'), m11=('m11', 'sum'), nc11=('nc11', 'sum'), da11=('da11', 'sum'),
        fl=('fl', 'max')).reset_index()
    ny = py.groupby(['vendor_id', 'institution_id'])['contract_year'].transform('size')
    py = py[ny >= min_years].sort_values(['vendor_id', 'institution_id', 'contract_year'])
    py['run_key'] = py['contract_year'] - py.groupby(['vendor_id', 'institution_id']).cumcount()
    runs = py.groupby(['vendor_id', 'institution_id', 'run_key']).size().groupby(['vendor_id', 'institution_id']).max()
    p = py.groupby(['vendor_id', 'institution_id']).agg(
        n_years=('contract_year', 'size'), first_year=('contract_year', 'min'), last_year=('contract_year', 'max'),
        money_mxn=('money', 'sum'), money_2011=('m11', 'sum'), nc=('nc11', 'sum'), da=('da11', 'sum'),
        flag_10b=('fl', 'max'))
    p['max_run'] = runs
    p['noncomp_share'] = (p['nc'] / p['money_2011'].where(p['money_2011'] > 0)).round(4)
    p['da_share'] = (p['da'] / p['money_2011'].where(p['money_2011'] > 0)).round(4)
    p['frozen'] = (p['max_run'] >= min_years) & (p['noncomp_share'] >= noncomp)
    p['years'] = py.groupby(['vendor_id', 'institution_id']).apply(
        lambda d: [[int(y), round(float(m))] for y, m in zip(d['contract_year'], d['money'])])
    return p.drop(columns=['nc', 'da']).reset_index()


# ── IO ───────────────────────────────────────────────────────────────────────────────────────────
def load(db_path):
    ro = sqlite3.connect(f'file:{db_path}?mode=ro', uri=True, timeout=600)
    t = time.time()
    c = pd.read_sql("""SELECT id, vendor_id, institution_id, contract_date, contract_year, amount_mxn,
        is_direct_award, is_single_bid, contract_type_normalized, source_structure
        FROM contracts WHERE vendor_id IS NOT NULL AND contract_date IS NOT NULL
        AND COALESCE(source_structure, '') <> 'E'""", ro)   # CompraNet only: ComprasMX rows (E) double-count 2025
    c['contract_date'] = pd.to_datetime(c['contract_date'].str[:10], errors='coerce')
    c = c.dropna(subset=['contract_date'])
    c['contract_year'] = c['contract_date'].dt.year      # dates as stored; the year follows the date
    v = pd.read_sql("SELECT id, rfc, name, is_individual, base_name FROM vendors", ro)
    inst = pd.read_sql("SELECT id, name, siglas, is_federal, institution_type FROM institutions", ro)
    ro.close()
    print(f'loaded {len(c):,} contracts, {len(v):,} vendors in {time.time() - t:.0f}s', flush=True)
    return c, v, inst


def federal_ids(inst):
    """Buyers bound by the PEF Anexo 9 caps: federal (is_federal = 1) dependencias y entidades of the APF, minus
    autonomous / judicial / legislative bodies, Pemex, CFE and autonomous universities."""
    nm = inst['name'].fillna('').str.upper()
    keep = (inst['is_federal'] == 1) & ~inst['institution_type'].isin(_NOT_APF_TYPES) & ~nm.str.contains(_OWN_LAW)
    return set(inst.loc[keep, 'id'])


def _pf_set(v):
    return set(v.loc[[_is_pf(i, r) for i, r in zip(v['is_individual'], v['rfc'])], 'id'])


def build(db_path):
    c, v, inst = load(db_path)
    pf = _pf_set(v)
    names = v.set_index('id')['name'].map(clean_name)
    fed = federal_ids(inst)
    total_money = float(_valid(c)['amount_mxn'].sum())

    ar, ar_meta = arranque(c, v)
    ar_meta['by_first_year'] = ar.groupby('first_year').size().to_dict()
    ar_meta['money_y1_mxn'] = float(ar['y1_mxn'].sum())
    ar_meta['n_censored'] = int(ar['censored'].sum())
    print('arranque', {k: x for k, x in ar_meta.items() if k != 'by_first_year'}, flush=True)

    md = mismo_dia(c, fed)
    md['is_pf'] = md['vendor_id'].isin(pf)
    md['vendor_name'] = [None if p else names.get(i) for i, p in zip(md['vendor_id'], md['is_pf'])]
    placebo = {str(m): int(len(mismo_dia(c, fed, m=m))) for m in (0.5, 0.75, 1.0, 1.25, 1.5, 2.0)}
    md_meta = {'n': len(md), 'contracts': int(md['n'].sum()), 'money_mxn': float(md['sum_mxn'].sum()),
               'n_ge3': int((md['n'] >= 3).sum()), 'vendors': int(md['vendor_id'].nunique()),
               'institutions': int(md['institution_id'].nunique()), 'years': sorted(PEF_DA_CAPS),
               'by_year': md.groupby('year').size().to_dict(), 'placebo_lots_by_m': placebo,
               'n_pf_lots': int(md['is_pf'].sum()), 'apf_buyers': len(fed)}
    print('mismo_dia', {k: x for k, x in md_meta.items() if k != 'by_year'}, flush=True)

    pa = parejas(c)
    pa['is_pf'] = pa['vendor_id'].isin(pf)
    pa['vendor_name'] = [None if p else names.get(i) for i, p in zip(pa['vendor_id'], pa['is_pf'])]
    fz = pa[pa['frozen']]
    pa_meta = {'n': int(len(fz)), 'money_mxn': float(fz['money_mxn'].sum()),
               'share_of_all_money': round(float(fz['money_mxn'].sum()) / total_money, 4),
               'n_distinct10': int(len(pa)), 'share_distinct10': round(float(pa['money_mxn'].sum()) / total_money, 4),
               'n_run10': int((pa['max_run'] >= 10).sum()),
               'share_run10': round(float(pa.loc[pa['max_run'] >= 10, 'money_mxn'].sum()) / total_money, 4),
               'vendors': int(fz['vendor_id'].nunique()), 'institutions': int(fz['institution_id'].nunique()),
               'n_pf_pairs': int(fz['is_pf'].sum()), 'total_money_mxn': total_money}
    print('parejas', pa_meta, flush=True)
    return ar, ar_meta, md, md_meta, pa, pa_meta


def write(db_path, ar, ar_meta, md, md_meta, pa, pa_meta):
    db = sqlite3.connect(db_path, timeout=600)
    db.execute('PRAGMA busy_timeout = 600000')
    md = md.assign(contract_ids=md['contract_ids'].map(lambda x: json.dumps([int(i) for i in x])))
    pa = pa.assign(years=pa['years'].map(json.dumps))
    with db:
        for name, df in (('newtabs_arranque', ar), ('newtabs_mismo_dia', md), ('newtabs_parejas', pa)):
            df.to_sql(f'{name}_new', db, if_exists='replace', index=False)
        db.execute('DROP TABLE IF EXISTS newtabs_meta_new')
        db.execute('CREATE TABLE newtabs_meta_new (key TEXT PRIMARY KEY, json TEXT NOT NULL, built_at TEXT)')
        now = time.strftime('%Y-%m-%dT%H:%M:%S')
        for k, m in (('arranque', ar_meta), ('mismo_dia', md_meta), ('parejas', pa_meta)):
            db.execute('INSERT INTO newtabs_meta_new VALUES (?, ?, ?)', (k, json.dumps(m, default=str), now))
        for name in ('newtabs_arranque', 'newtabs_mismo_dia', 'newtabs_parejas', 'newtabs_meta'):
            db.execute(f'DROP TABLE IF EXISTS {name}')
            db.execute(f'ALTER TABLE {name}_new RENAME TO {name}')
        db.execute('CREATE INDEX IF NOT EXISTS idx_newtabs_parejas_v ON newtabs_parejas(vendor_id)')
        db.execute('CREATE INDEX IF NOT EXISTS idx_newtabs_parejas_i ON newtabs_parejas(institution_id)')
    db.execute('PRAGMA wal_checkpoint(PASSIVE)')
    db.close()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--db', default=str(Path(__file__).resolve().parent.parent / 'RUBLI_NORMALIZED.db'))
    ap.add_argument('--dry-run', action='store_true')
    a = ap.parse_args()
    out = build(a.db)
    if not a.dry_run:
        write(a.db, *out)
        print('written', flush=True)


if __name__ == '__main__':
    main()
