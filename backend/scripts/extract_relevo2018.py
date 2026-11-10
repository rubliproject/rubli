"""Build frontend/public/data/relevo2018.json for the story «El relevo de 2018» (READ-ONLY on the DB).

Adapted from frontend/_ui_v4/concepts/relevo2018/extract.py (concept A «El pulso»). Facts are fixed by
_explore/2018/VERIFY.md. Never writes RFCs or officials' names. Drill lists carry contract ids, dates,
amounts, buyer and vendor ids/names only.

Re-implements the verified queries of _explore/2018 (c1b / c24b / c4c / c5) so the story's
numbers come from one script. Everything by contract_date (= the source file's start date).
Amounts > 100,000 MDP excluded; > 10,000 MDP kept and counted as flagged (†).

  weeks       weekly money and counts 2013-01 .. 2025-09, all federal and excl. CFE + PEMEX
  freeze      Aug 23 – Nov 30 money per year 2013–2022 (all / excl.) + the 2013–17 baseline ratios
  rush        Jul 16–31 contracts 2017 / 2018 / 2019, direct-award share, Jul 1 2018 money
  inst        per-institution within-year pace (window ÷ Jan–Jul) relative to its own 2013–17 median,
              for 2018 and the placebo years 2016 / 2017 / 2019 / 2021; named top shortfalls
  surv        12-month cohort (≥ 1M MXN) survival in year 1 / year 2 at every December boundary 2014–2023,
              canonical id and company RFC; Oct 2024 (AMLO→Sheinbaum) year 1 on CompraNet alone (2 days short)
  active      distinct active vendors per year
  meds        the 2018-12-01 → 2019-03-10 medicines of the three distributors: vendor × buyer, phases, timeline

  ws          per week, excl. CFE + PEMEX money by sector 1..12 (millions, 1 decimal) — the coloured pulse
  drill       2018 window contracts per institution, top contracts per week (Jul 2017 – Jun 2019), distributor contracts

Run:  python backend/scripts/extract_relevo2018.py   (queries the DB directly; the pickle is opt-in via RELEVO_PKL)
A later router (backend/api/routers/relevo2018.py) can serve the same dict from one cached endpoint.
"""
import json, os, re, sqlite3
import numpy as np, pandas as pd
from datetime import date

DB = 'D:/Python/yangwenli/backend/RUBLI_NORMALIZED.db'
# c.pkl predates the 2026-10-20 amount fix (contract_amount_corrections): do not read it. Set RELEVO_PKL to opt in.
PKL = os.environ.get('RELEVO_PKL', '')
MEDS = 'D:/Python/yangwenli/_explore/2018/meds_first100.csv'
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.abspath(os.path.join(HERE, '..', '..', 'frontend', 'public', 'data', 'relevo2018.json'))
con = sqlite3.connect(f'file:{DB}?mode=ro', uri=True)

if PKL and os.path.exists(PKL):
    df = pd.read_pickle(PKL)
else:
    df = pd.read_sql("""select vendor_id, institution_id inst, sector_id sec, contract_date d, amount_mxn a, source_structure s
        from contracts where contract_date between '2011-01-01' and '2025-09-28' and amount_mxn>0 and amount_mxn<=1e11 and vendor_id is not null""", con)
    df['d'] = pd.to_datetime(df.d, errors='coerce')
df = df[df.d.notna() & (df.a <= 1e11)].copy()
canon = dict(con.execute('select vendor_id, canonical_id from vendor_canonical'))
df['v'] = df.vendor_id.map(canon).fillna(df.vendor_id).astype(int)
ins = pd.read_sql('select id, siglas, name, sector_id from institutions', con).set_index('id')
nm = ins.name.fillna('').str.upper()
CP = set(ins.index[nm.str.contains('ELECTRICIDAD') | nm.str.contains('PEMEX') | nm.str.contains('PETR.LEOS MEX', regex=True)
                   | ins.siglas.fillna('').str.upper().isin(['CFE', 'PEMEX', 'PEP', 'PREF', 'PPQ', 'PGPB'])])
x = df[~df.inst.isin(CP)]
print('rows', len(df), 'excl CFE/PEMEX', len(x), 'flagged >10B', int((df.a > 1e10).sum()))

# ── weeks (Monday-start ISO weeks) 2013-01-01 .. 2025-09-28
def weekly(d):
    g = d[(d.d >= '2013-01-01')].set_index('d')
    w = g.a.resample('W-MON', label='left', closed='left').agg(['sum', 'size'])
    return w
wa, wx = weekly(df), weekly(x)
weeks = [{'w': i.strftime('%Y-%m-%d'), 'v': round(float(r['sum'])), 'n': int(r['size']),
          'vx': round(float(wx.loc[i, 'sum'])) if i in wx.index else 0, 'nx': int(wx.loc[i, 'size']) if i in wx.index else 0}
         for i, r in wa.iterrows()]
# per-sector money, excl. CFE + PEMEX, in millions — same week bins
ws = x[x.d >= '2013-01-01'].set_index('d').groupby('sec').a.resample('W-MON', label='left', closed='left').sum().unstack(0).fillna(0)
for w in weeks:
    i = pd.Timestamp(w['w'])
    w['s'] = [round(float(ws.loc[i, k]) / 1e6, 1) if (i in ws.index and k in ws.columns) else 0 for k in range(1, 13)]

# ── freeze window Aug 23 – Nov 30 and the July rush
def W(d, y): return d[(d.d >= f'{y}-08-23') & (d.d <= f'{y}-11-30')]
def H(d, y): return d[(d.d >= f'{y}-01-01') & (d.d <= f'{y}-07-31')]
freeze = {}
for y in range(2013, 2023):
    freeze[y] = {'v': round(float(W(df, y).a.sum())), 'n': int(len(W(df, y))), 'vx': round(float(W(x, y).a.sum())), 'nx': int(len(W(x, y))),
                 'h1v': round(float(H(df, y).a.sum())), 'h1vx': round(float(H(x, y).a.sum()))}
base = {k: float(np.mean([freeze[y][k] for y in range(2013, 2018)])) for k in ('v', 'n', 'vx', 'nx')}
freeze_ratio = {k: round(freeze[2018][k] / base[k], 3) for k in base}
within = {y: round(freeze[y]['vx'] / freeze[y]['h1vx'], 3) for y in freeze}
print('freeze 2018 ratios', freeze_ratio, 'within-year W/H1 excl', within[2018], {y: within[y] for y in (2016, 2017, 2019)})
rush = {}
for y in (2017, 2018, 2019):
    r = con.execute(f"""select count(*), sum(amount_mxn), avg(is_direct_award) from contracts
        where contract_date between '{y}-07-16' and '{y}-07-31' and amount_mxn<=1e11""").fetchone()
    rush[y] = {'n': r[0], 'v': round(r[1]), 'da': round(r[2], 3)}
jul1 = con.execute("select sum(amount_mxn), count(*) from contracts where contract_date='2018-07-01' and amount_mxn<=1e11").fetchone()
rush['jul1_2018'] = {'v': round(jul1[0]), 'n': jul1[1]}
# ── institutions: within-year pace vs own median (c24b logic, eligible ≥ 30 contracts Jan–Jul)
def per(y):
    w = W(x, y).groupby('inst').a.sum(); h = H(x, y).groupby('inst'); hn = h.size(); ha = h.a.sum()
    el = hn[hn >= 30].index
    return (w.reindex(el).fillna(0) / ha.reindex(el))
inst = {}
for py in (2016, 2017, 2018, 2019, 2021):
    oth = [y for y in range(2013, 2018) if y != py] if py < 2018 else list(range(2013, 2018))
    bb = pd.concat([per(y).rename(y) for y in oth], axis=1).median(axis=1); pp = per(py); e = pp.index.intersection(bb.dropna().index)
    rr = (pp[e] / bb[e]).replace([np.inf], np.nan).dropna()
    rows = sorted([[int(i), round(float(min(v, 4.0)), 3)] for i, v in rr.items()], key=lambda t: t[1])
    inst[py] = {'n': len(rr), 'below': round(float((rr < 0.7).mean()), 3), 'median': round(float(rr.median()), 3), 'r': rows}
    print('inst', py, inst[py]['n'], inst[py]['below'], inst[py]['median'])
# names + money for the 2018 list (shortfall vs own 2013–17 window mean, excl CFE/PEMEX frame)
w18 = W(x, 2018).groupby('inst').a.sum(); bw = pd.concat([W(x, y).groupby('inst').a.sum().rename(y) for y in range(2013, 2018)], axis=1).fillna(0).mean(axis=1)
ids18 = [i for i, _ in inst[2018]['r']]
names = {}
for i in set(ids18) | {104, 345, 251, 228, 2682}:
    r = ins.loc[i]; names[int(i)] = {'s': r.siglas if isinstance(r.siglas, str) else None, 'n': r['name'], 'c': int(r.sector_id) if pd.notna(r.sector_id) else 12,
                                   'w18': round(float(w18.get(i, 0))), 'base': round(float(bw.get(i, 0)))}
cfe = {'w18': round(float(W(df, 2018)[W(df, 2018).inst.isin(CP)].a.sum())), 'base': round(float(np.mean([W(df, y)[W(df, y).inst.isin(CP)].a.sum() for y in range(2013, 2018)])))}

# ── vendor cohorts: 12-month cohort ≥ 1M, year-1 / year-2 survival, canonical and company RFC
ven = pd.read_sql('select id, rfc from vendors', con).set_index('id'); rfc = ven.rfc.fillna('').str.strip().str.upper()
df['r'] = df.vendor_id.map(rfc[rfc.str.len() == 12])
M = pd.DateOffset
HORIZON = pd.Timestamp('2025-09-28')
surv = []
for T in [f'{y}-12-01' for y in range(2014, 2024)] + ['2024-10-01']:
    T = pd.Timestamp(T); pre = df[(df.d >= T - M(months=12)) & (df.d < T)]
    rec = {'t': T.strftime('%Y-%m-%d')}
    for key, tag in (('v', 'c'), ('r', 'rfc')):
        m = pre.groupby(key).a.sum(); coh = m[m >= 1e6].index
        rec[f'{tag}_n'] = int(len(coh))
        for f, nm_ in (((0, 12), 'y1'), ((12, 24), 'y2')):
            end = T + M(months=f[1])
            if end > HORIZON + pd.Timedelta(days=3): rec[f'{tag}_{nm_}'] = None; continue
            post = df[(df.d >= T + M(months=f[0])) & (df.d < end)][key].dropna().unique()
            rec[f'{tag}_{nm_}'] = round(float(np.isin(coh, post).mean()), 3)
    # excl. vendors whose top pre-buyer is CFE/PEMEX (canonical)
    m = pre.groupby('v').a.sum(); coh = m[m >= 1e6].index
    top = pre[pre.v.isin(coh)].groupby(['v', 'inst']).a.sum().reset_index().sort_values('a').drop_duplicates('v', keep='last').set_index('v').inst
    keep = coh[~top.reindex(coh).isin(CP).values]
    post = df[(df.d >= T) & (df.d < T + M(months=12))].v.unique()
    rec['x_n'] = int(len(keep)); rec['x_y1'] = round(float(np.isin(keep, post).mean()), 3) if T + M(months=12) <= HORIZON + pd.Timedelta(days=3) else None
    surv.append(rec); print('surv', rec)
active = {int(y): int(df[df.d.dt.year == y].v.nunique()) for y in range(2013, 2025)}
# 2024 coda — 24-month cohort with ComprasMX follow-up (probe-vidas addendum, results2.json); quoted, not recomputed here
coda = None
try:
    r2 = json.load(open('D:/Python/yangwenli/_explore/vidas/results2.json', encoding='utf-8'))
    coda = {f"{s['boundary']}|{s['window']}": s for s in r2['survival']}
    coda = {'sheinbaum_y1': coda['AMLO->Sheinbaum|m0-12']['survive'], 'sheinbaum_y2': coda['AMLO->Sheinbaum|m12-24']['survive'],
            'midamlo_y1': coda['mid-AMLO|m0-12']['survive'], 'midamlo_y2': coda['mid-AMLO|m12-24']['survive'],
            'midepn_y2': coda['mid-EPN|m12-24']['survive'], 'epnamlo_y2': coda['EPN->AMLO|m12-24']['survive'], 'cohort': coda['AMLO->Sheinbaum|m0-12']['cohort']}
except Exception as e:
    print('coda unavailable', e)

# ── medicines: three distributors, 2018-12-01 → 2019-03-10 (c5.py output)
md = pd.read_csv(MEDS)
vn = dict(con.execute('select id, name from vendors where id in (%s)' % ','.join(map(str, md.vendor_id.unique()))))
def dist(n):
    n = (n or '').upper()
    return 'gfe' if 'FARMACOS' in n or 'FÁRMACOS' in n else 'dimesa' if 'DIMESA' in n or 'DISTRIBUIDORA INTERNACIONAL' in n else 'maypo' if 'MAYPO' in n else None
md['dist'] = md.vendor_id.map(lambda i: dist(vn.get(i)))
md['buyer'] = md.siglas.fillna('otros')
def phase(r):
    """p1 tender called under EPN, awarded after Dec 1 (11.94) · p2 published and awarded under EPN: tenders 1.92 + direct awards 0.51 (2.43) ·
    p3 direct award published under AMLO (8.19) · p4 consolidated (ISSSTE / SEDENA, CE-) and other 2019-published procedures (8.44).
    One split for ledger and drawing (fact-check 2026-10-20 #20): the four sum to 31.0."""
    p, pub, aw, da = str(r.procedure_number), str(r.publication_date), str(r.award_date), 'DIRECTA' in str(r.procedure_type).upper()
    if p.startswith('CE-'): return 'p4'
    if da: return 'p3' if pub >= '2018-12-01' else 'p2'
    if pub < '2018-12-01' and (aw == 'nan' or aw >= '2018-12-01'): return 'p1'
    if pub < '2018-12-01': return 'p2'
    return 'p4'
md['phase'] = md.apply(phase, axis=1)
by_dist_buyer = md.groupby(['dist', 'buyer']).bn.sum().round(3)
by_phase = md.groupby('phase').bn.sum().round(2)
by_dist_phase = md.groupby(['dist', 'phase']).bn.sum().round(3)
print('meds total', round(md.bn.sum(), 2)); print(by_phase.to_dict()); print(by_dist_buyer.to_dict())
procs = md.groupby(['procedure_number', 'phase', 'buyer']).agg(bn=('bn', 'sum'), n=('bn', 'size'), pub=('publication_date', 'min'), award=('award_date', 'max'),
                                                              start=('contract_date', 'min'), da=('procedure_type', lambda s: s.str.contains('DIRECTA').mean())).reset_index()
procs = procs[procs.bn >= 0.3].sort_values('bn', ascending=False)
split = md.groupby(['procedure_number', 'dist']).bn.sum().round(3)
split = {p: {d: float(v) for (pp, d), v in split.items() if pp == p} for p in procs.procedure_number}
meds = {
    'total_bn': round(float(md.bn.sum()), 2),
    'dist': {k: {'bn': round(float(md[md.dist == k].bn.sum()), 2), 'buyers': {b: float(v) for (dk, b), v in by_dist_buyer.items() if dk == k},
                 'phases': {p: float(v) for (dk, p), v in by_dist_phase.items() if dk == k}} for k in ('gfe', 'dimesa', 'maypo')},
    'phases': {k: float(v) for k, v in by_phase.items()},
    'procs': [{'id': r.procedure_number, 'phase': r.phase, 'buyer': r.buyer, 'bn': round(float(r.bn), 3), 'n': int(r.n), 'pub': str(r.pub)[:10] if str(r.pub) != 'nan' else None,
               'award': str(r.award)[:10] if str(r.award) != 'nan' else None, 'start': str(r.start)[:10], 'da': round(float(r.da), 2), 'split': split[r.procedure_number]} for r in procs.itertuples()],
    # the verified phase table and timeline (VERIFY.md §5) — published figures come from here
    'verified': {'p1': 11.9, 'p2': 2.4, 'p3': 8.2, 'p4': 8.4, 'imss': {'gfe': 11.1, 'dimesa': 5.8, 'maypo': 5.3}, 'issste': 7.5, 'sedena': 0.75,
                 'veto_share_2018': 0.624, 'veto_bn_2018': 34.28},
    'timeline': [['2018-10-12', 'pub'], ['2018-12-01', 'handover'], ['2018-12-11', 'award'], ['2018-12-14', 'award2'], ['2018-12-19', 'da'],
                 ['2019-01-01', 'start'], ['2019-01-17', 'start2'], ['2019-03-20', 'veto'], ['2019-08-19', 'court']],
}

# ── drill lists (L3): ids, dates, amounts, buyer and vendor only — never RFCs
def rows_sql(where, params):
    return pd.read_sql(f"""select c.id, c.institution_id inst, c.contract_date d, c.amount_mxn a, c.vendor_id v, vv.name vn, c.is_direct_award da,
        c.procedure_number pn, c.publication_date pub, c.award_date aw
        from contracts c left join vendors vv on vv.id = c.vendor_id where {where} and c.amount_mxn > 0 and c.amount_mxn <= 1e11""", con, params=params)
def pack(r):
    return [int(r.id), str(r.d)[:10], round(float(r.a)), int(r.inst) if pd.notna(r.inst) else None, int(r.v) if pd.notna(r.v) else None, r.vn, int(r.da or 0)]
ids_all = sorted(names)
wdf = rows_sql(f"c.contract_date between '2018-08-23' and '2018-11-30' and c.institution_id in ({','.join(map(str, ids_all))})", ())
drill_inst = {}
for i, g in wdf.groupby('inst'):
    g = g.sort_values('a', ascending=False)
    drill_inst[int(i)] = {'n': int(len(g)), 'v': round(float(g.a.sum())), 'k': [pack(r) for r in g.head(6).itertuples()]}
for i in names:
    names[i]['k'] = drill_inst.get(i, {'n': 0, 'v': 0, 'k': []})
wk = rows_sql("c.contract_date between '2017-07-03' and '2019-06-30'", ())
wk = wk[~wk.inst.isin(CP)].copy()
wk['w'] = pd.to_datetime(wk.d).dt.to_period('W-SUN').dt.start_time.dt.strftime('%Y-%m-%d')
drill_week = {w: [pack(r) for r in g.sort_values('a', ascending=False).head(3).itertuples()] for w, g in wk.groupby('w')}
inst_lbl = {int(i): (r.siglas if isinstance(r.siglas, str) and r.siglas else r['name']) for i, r in ins.iterrows() if i in set(wk.inst.dropna().astype(int)) | set(wdf.inst.dropna().astype(int))}
DIST_IDS = {'gfe': [29277], 'dimesa': [13885, 95813], 'maypo': [2873]}
dd_ = rows_sql("c.contract_date between '2018-12-01' and '2019-03-10' and c.vendor_id in (29277, 13885, 95813, 2873)", ())
drill_dist = {}
for k, vids in DIST_IDS.items():
    g = dd_[dd_.v.isin(vids)].sort_values('a', ascending=False)
    drill_dist[k] = {'vid': vids[0], 'n': int(len(g)), 'k': [pack(r) + [r.pn, str(r.pub)[:10] if r.pub else None, str(r.aw)[:10] if r.aw else None] for r in g.head(12).itertuples()]}
    for r in g.head(12).itertuples():
        if pd.notna(r.inst): ii = ins.loc[int(r.inst)]; inst_lbl[int(r.inst)] = ii.siglas if isinstance(ii.siglas, str) and ii.siglas else ii['name']
meds['drill'] = drill_dist
assert all(r[2] <= 1e11 for d in drill_inst.values() for r in d['k'])
print('drill inst', len(drill_inst), 'weeks', len(drill_week), 'dist', {k: v['n'] for k, v in drill_dist.items()})

data = {
    'built': date.today().isoformat(), 'horizon': '2025-09-28', 'flagged': int((df.a > 1e10).sum()),
    'weeks': weeks, 'freeze': {str(k): v for k, v in freeze.items()}, 'freeze_base': {k: round(v) for k, v in base.items()}, 'freeze_ratio': freeze_ratio,
    'within': {str(k): v for k, v in within.items()}, 'rush': {str(k): v for k, v in rush.items()},
    'inst': {str(k): v for k, v in inst.items()}, 'inst_names': names, 'cfe': cfe,
    'surv': surv, 'active': active, 'coda': coda, 'meds': meds, 'drill_week': drill_week, 'inst_lbl': inst_lbl,
    'sources': {
        'circular': ['https://zetatijuana.com/2018/07/por-transicion-hacienda-ordena-no-contratar-mas-burocratas-ni-realizar-adjudicaciones-directas/',
                     'https://files.eluniversal.com.mx/sites/default/files/edicion_impresa/2018/07/09/eu090718_a1-01.pdf'],
        'naim': 'https://expansion.mx/economia/2018/07/25/las-licitaciones-del-nuevo-aeropuerto-de-la-cdmx-quedan-suspendidas',
        'cfe': ['https://factorenergetico.mx/cfe-promueve-la-participacion-empresarial-con-la-app-cfe-proveedores', 'https://www.asf.gob.mx/Trans/Informes/IR2018c/Documentos/Auditorias/2018_0507_a.pdf'],
        'veto': ['https://vanguardia.com.mx/articulo/presidencia-ordena-vetar-empresas-farmaceuticas', 'https://vanguardia.com.mx/articulo/juez-federal-declara-ilegal-veto-que-amlo-impuso-farmaceuticas',
                 'https://politica.expansion.mx/mexico/2019/09/06/gracias-toledo-juez-da-reves-a-veto-de-amlo'],
    },
}
os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, 'w', encoding='utf-8') as fh:
    json.dump(data, fh, ensure_ascii=False, separators=(',', ':'), allow_nan=False)
print('wrote', OUT, os.path.getsize(OUT) // 1024, 'KB')
