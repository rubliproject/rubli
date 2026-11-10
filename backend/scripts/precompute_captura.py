"""«Captura» (/captura) — captive companies per federal buyer → NEW tables captura_pairs / captura_buyers / captura_meta.

    python -m scripts.precompute_captura --db RUBLI_NORMALIZED.db [--write]

Definition (frozen in frontend/_ui_v4/concepts/captura/NOTES_captura.md; ARIA P6 direction, never the risk score):
  captive pair (vendor v, buyer i), on canonical ids (institution_canonical / vendor_canonical):
    share = v's CompraNet money with i / v's lifetime CompraNet money  >= 0.80
    money = v's money with i >= 50 MDP, over >= 3 distinct contract years
    v is a private company: personas físicas are pooled per buyer and never named; public bodies
    (public_labels.is_public_entity, vendor_kind <> 'private') and ARIA structural monopolies are pooled
    as «públicos»; GT false positives are dropped; pairs resting on a suspect-decimal contract are dropped.
  amounts: 0 < amount <= 100,000 MDP (above = rejected); > 10,000 MDP kept and flagged (†).
  direct award: share of 2011+ money (Structure A has no award type) — NULL when the pair has none.
  lock: a year is locked when >= 80 % of v's income that year came from i (lock0/lock1/lockn/lockrun).
  still signing: comprasmx_contracts rows with post_blackout = 1, orden_gobierno = 'APF', same canonical pair.
Without --write it prints the totals and writes nothing. Reads the DB read-only; writes only the three tables.
"""
from __future__ import annotations

import argparse
import json
import sqlite3
import sys
import time
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from api.public_labels import (  # noqa: E402
    _norm_name, clean_name, is_persona_fisica, is_public_entity, label_sets, suspect_decimal_contracts,
)

SHARE, MIN_MXN, MIN_YEARS, LOCK = 0.80, 50e6, 3, 0.80
REJECT, FLAG = 1e11, 1e10
Y0, Y1 = 2002, 2025
# CompraNet years stop at the source switch; ComprasMX rows (in `contracts` as structure E since 2026-10-23)
# are the «post» slice from comprasmx_contracts, so the year scan must not count them as 2025 too.
SWITCH = '2025-09-28'
DA_FROM = 2011

# Official siglas the institutions table lacks (display only; the full name is always shown on hover/dock).
SIGLAS = {
    297: 'LICONSA', 41: 'CAPUFE', 485: 'CMM', 410: 'SAT', 176: 'ESSA', 298: 'LOTENAL', 146: 'COMESA',
    250: 'IMP', 269: 'INM', 398: 'SRE', 382: 'SHCP', 302: 'NAFIN', 39: 'BANJERCITO', 17: 'ASA',
    412: 'SEPOMEX', 334: 'PAP', 120: 'CONAFOR', 38: 'BANOBRAS', 194: 'FONATUR', 15: 'APIVER',
    587: 'SAE', 411: 'SENASICA', 299: 'LFC', 866: 'INFONACOT', 259: 'INCICH', 85: 'CAEM',
    311: 'PEP', 314: 'PXR', 312: 'PGPB', 313: 'PPQ', 1201: 'PEMEX Corporativo', 315: 'PEMEX',
}

PAIR_COLS = ('vendor_id', 'institution_id', 'name', 'm', 'sh', 'vt', 'n', 'y0', 'y1', 'ny', 'lock0', 'lock1',
             'lockn', 'lockrun', 'da', 'm11', 'flag', 'post', 'post_n', 'gt', 'tier', 'p6', 'efos', 'sfp',
             'risk', 'nbuyers', 'yrs')
BUYER_COLS = ('institution_id', 'name', 'siglas', 'sector_id', 'total', 'cap', 'cap_share', 'n', 'da', 'm11',
              'post', 'post_n', 'post_total', 'post_total_n', 'y_total', 'y_cap', 'y_n', 'pf_n', 'pf_m',
              'pub_n', 'pub_m', 'fp_n', 'n_doc', 'n_lead', 'median_years')


def _has(conn, t):
    return conn.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (t,)).fetchone() is not None


def _canon(conn, table, key):
    return dict(conn.execute(f"SELECT {key}, canonical_id FROM {table}").fetchall()) if _has(conn, table) else {}


def _lock(yrs: dict, vyear: dict, v) -> tuple:
    locked = [y for y in range(Y0, Y1 + 1) if yrs.get(y, 0) > 0 and yrs[y] / vyear[(v, y)] >= LOCK]
    if not locked:
        return None, None, 0, 0
    best = run = 1
    for a, b in zip(locked, locked[1:]):
        run = run + 1 if b == a + 1 else 1
        best = max(best, run)
    return locked[0], locked[-1], len(locked), best


def compute(conn: sqlite3.Connection, log=lambda *a: None) -> dict:
    """{meta, buyers, pairs} — pure read of `conn` (contracts, vendors, institutions, comprasmx_contracts, labels)."""
    ic, vc = _canon(conn, 'institution_canonical', 'institution_id'), _canon(conn, 'vendor_canonical', 'vendor_id')
    I = lambda i: ic.get(i, i)  # noqa: E731
    V = lambda v: vc.get(v, v)  # noqa: E731
    rows = conn.execute(
        f"""SELECT vendor_id, institution_id, contract_year, SUM(amount_mxn), COUNT(*),
                   SUM(CASE WHEN is_direct_award = 1 THEN amount_mxn ELSE 0 END), SUM(amount_mxn > {FLAG})
            FROM contracts WHERE amount_mxn > 0 AND amount_mxn <= {REJECT} AND vendor_id IS NOT NULL
              AND institution_id IS NOT NULL AND contract_year BETWEEN {Y0} AND {Y1}
              AND (contract_date IS NULL OR contract_date < '{SWITCH}') GROUP BY 1, 2, 3""").fetchall()
    log('aggregate rows', len(rows))
    pair: dict = {}
    vtot, itot, vyear, iyear = defaultdict(float), defaultdict(float), defaultdict(float), defaultdict(float)
    for v0, i0, y, m, n, dav, fl in rows:
        v, i = V(v0), I(i0)
        p = pair.setdefault((v, i), {'m': 0.0, 'n': 0, 'da_v': 0.0, 'm11': 0.0, 'yrs': defaultdict(float), 'fl': 0})
        p['m'] += m; p['n'] += n; p['yrs'][y] += m; p['fl'] += fl or 0
        if y >= DA_FROM:
            p['da_v'] += dav or 0; p['m11'] += m
        vtot[v] += m; itot[i] += m; vyear[(v, y)] += m; iyear[(i, y)] += m

    post, ipost = {}, defaultdict(lambda: [0, 0.0])
    if _has(conn, 'comprasmx_contracts'):
        for v0, i0, n, m in conn.execute(
            f"""SELECT vendor_id, institution_id, COUNT(*), SUM(CASE WHEN amount_mxn > 0 AND amount_mxn <= {REJECT}
                       THEN amount_mxn ELSE 0 END)
                FROM comprasmx_contracts WHERE post_blackout = 1 AND orden_gobierno = 'APF'
                  AND institution_id IS NOT NULL AND (amount_mxn IS NULL OR amount_mxn <= {REJECT}) GROUP BY 1, 2"""):
            i = I(i0)
            ipost[i][0] += n; ipost[i][1] += m or 0
            if v0 is not None:
                k = (V(v0), i); q = post.setdefault(k, [0, 0.0]); q[0] += n; q[1] += m or 0

    vend = {r[0]: r for r in conn.execute("SELECT id, name, is_individual, rfc, vendor_kind FROM vendors")}
    inst = {r[0]: r for r in conn.execute("SELECT id, siglas, name, sector_id FROM institutions")}
    instnames = {_norm_name(r[2]) for r in inst.values()}
    vstat = {r[0]: r for r in conn.execute("SELECT vendor_id, avg_risk_score, institution_count FROM vendor_stats")} \
        if _has(conn, 'vendor_stats') else {}
    aq = {r[0]: r for r in conn.execute(
        "SELECT vendor_id, ips_tier, primary_pattern, fp_structural_monopoly, is_efos_definitivo, is_sfp_sanctioned "
        "FROM aria_queue")} if _has(conn, 'aria_queue') else {}
    labels = label_sets(conn)
    lab = {k: {V(x) for x in labels[k]} for k in ('documented', 'leads', 'fp')}
    lab['leads'] -= lab['documented']; lab['fp'] -= lab['documented'] | lab['leads']
    suspect = {(V(c['vendor_id']), I(c['institution_id'])) for c in suspect_decimal_contracts(conn).values()}

    pooled = defaultdict(lambda: {'pf_n': 0, 'pf_m': 0.0, 'pub_n': 0, 'pub_m': 0.0, 'fp_n': 0})
    cap, n_cand, n_sus = [], 0, 0
    for (v, i), p in pair.items():
        if p['m'] < MIN_MXN or len(p['yrs']) < MIN_YEARS or p['m'] / vtot[v] < SHARE:
            continue
        n_cand += 1
        vr = vend.get(v)
        if vr is None:
            continue
        a = aq.get(v)
        if is_persona_fisica(vr[2], vr[3]):
            pooled[i]['pf_n'] += 1; pooled[i]['pf_m'] += p['m']; continue
        if vr[4] != 'private' or is_public_entity(vr[1], instnames) or (a and a[3]):
            pooled[i]['pub_n'] += 1; pooled[i]['pub_m'] += p['m']; continue
        if v in lab['fp']:
            pooled[i]['fp_n'] += 1; continue
        if (v, i) in suspect:
            n_sus += 1; continue
        cap.append((v, i, p))
    log('candidates', n_cand, 'captive', len(cap))

    pairs, by_i = [], defaultdict(list)
    for v, i, p in cap:
        a, vs, po = aq.get(v), vstat.get(v), post.get((v, i))
        ys = sorted(p['yrs'])
        l0, l1, ln, lr = _lock(p['yrs'], vyear, v)
        r = {
            'vendor_id': v, 'institution_id': i, 'name': clean_name(vend[v][1]), 'm': round(p['m']), 'sh': round(p['m'] / vtot[v], 4),
            'vt': round(vtot[v]), 'n': p['n'], 'y0': ys[0], 'y1': ys[-1], 'ny': len(ys),
            'lock0': l0, 'lock1': l1, 'lockn': ln, 'lockrun': lr,
            'da': round(p['da_v'] / p['m11'], 3) if p['m11'] > 0 else None, 'm11': round(p['m11']),
            'flag': int(p['fl'] > 0), 'post': round(po[1]) if po else 0, 'post_n': po[0] if po else 0,
            'gt': 'doc' if v in lab['documented'] else ('lead' if v in lab['leads'] else None),
            'tier': a[1] if a else None, 'p6': int(bool(a and a[2] == 'P6')),
            'efos': int(bool(a and a[4])), 'sfp': int(bool(a and a[5])),
            'risk': round(vs[1], 3) if vs and vs[1] is not None else None, 'nbuyers': vs[2] if vs else None,
            'yrs': [[y, round(p['yrs'][y])] for y in ys],
        }
        pairs.append(r); by_i[i].append(r)
    pairs.sort(key=lambda r: -r['m'])

    buyers = []
    for i, recs in by_i.items():
        ir = inst.get(i) or (i, None, f'#{i}', 12)
        capm = sum(r['m'] for r in recs); pl = pooled[i]
        m11 = sum(r['m11'] for r in recs)
        yc, yn = [0] * (Y1 - Y0 + 1), [0] * (Y1 - Y0 + 1)
        for r in recs:
            for y, m in r['yrs']:
                yc[y - Y0] += m; yn[y - Y0] += 1
        buyers.append({
            'institution_id': i, 'name': ir[2], 'siglas': SIGLAS.get(i) or ir[1], 'sector_id': ir[3] or 12,
            'total': round(itot[i]), 'cap': capm, 'cap_share': round(capm / itot[i], 4), 'n': len(recs),
            'da': round(sum(r['m11'] * r['da'] for r in recs if r['da'] is not None) / m11, 3) if m11 > 0 else None,
            'm11': m11, 'post': sum(r['post'] for r in recs), 'post_n': sum(1 for r in recs if r['post_n'] > 0),
            'post_total': round(ipost[i][1]), 'post_total_n': ipost[i][0],
            'y_total': [round(iyear.get((i, y), 0)) for y in range(Y0, Y1 + 1)], 'y_cap': yc, 'y_n': yn,
            'pf_n': pl['pf_n'], 'pf_m': round(pl['pf_m']), 'pub_n': pl['pub_n'], 'pub_m': round(pl['pub_m']),
            'fp_n': pl['fp_n'], 'n_doc': sum(1 for r in recs if r['gt'] == 'doc'),
            'n_lead': sum(1 for r in recs if r['gt'] == 'lead'),
            'median_years': sorted(r['ny'] for r in recs)[len(recs) // 2],
        })
    buyers.sort(key=lambda b: -b['cap'])
    pp = [r for r in pairs if r['post_n'] > 0]
    n = max(1, len(pairs))
    meta = {
        'def': {'share': SHARE, 'min_mxn': MIN_MXN, 'min_years': MIN_YEARS, 'lock': LOCK, 'y0': Y0, 'y1': Y1,
                'da_from': DA_FROM, 'horizon': SWITCH},
        'post_to': conn.execute("SELECT MAX(fecha_publicacion) FROM comprasmx_contracts WHERE post_blackout = 1")
        .fetchone()[0] if _has(conn, 'comprasmx_contracts') else None,
        'totals': {
            'vendors_examined': len(vtot), 'buyers_examined': len(itot), 'pairs_examined': len(pair),
            'candidates': n_cand, 'pairs': len(pairs), 'buyers': len(buyers), 'money': sum(r['m'] for r in pairs),
            'm11': sum(r['m11'] for r in pairs), 'da_money': round(sum(r['m11'] * r['da'] for r in pairs if r['da'] is not None)),
            'post_pairs': len(pp), 'post_money': sum(r['post'] for r in pp),
            'pf_pairs': sum(b['pf_n'] for b in pooled.values()), 'pf_money': round(sum(b['pf_m'] for b in pooled.values())),
            'pub_pairs': sum(b['pub_n'] for b in pooled.values()), 'fp_pairs': sum(b['fp_n'] for b in pooled.values()),
            'suspect_pairs': n_sus, 'flagged': sum(r['flag'] for r in pairs),
            'doc': sum(1 for r in pairs if r['gt'] == 'doc'), 'lead': sum(1 for r in pairs if r['gt'] == 'lead'),
            'p6': sum(r['p6'] for r in pairs), 'top3_money': sum(b['cap'] for b in buyers[:3]),
            'share_mean': round(sum(r['sh'] for r in pairs) / n, 4),
            'years_median': sorted(r['ny'] for r in pairs)[len(pairs) // 2] if pairs else 0,
            'lockrun_median': sorted(r['lockrun'] for r in pairs)[len(pairs) // 2] if pairs else 0,
        },
    }
    return {'meta': meta, 'buyers': buyers, 'pairs': pairs}


def write(conn: sqlite3.Connection, res: dict, batch: int = 20_000) -> None:
    """Replace the three captura_* tables. Built under staging names in short transactions (a commit every
    `batch` rows, never one long lock: ARIA writes the same DB), then swapped in with one quick rename."""
    js = lambda x: json.dumps(x, separators=(',', ':')) if isinstance(x, (list, dict)) else x  # noqa: E731
    with conn:
        for t in ('captura_pairs_new', 'captura_buyers_new', 'captura_meta_new'):
            conn.execute(f"DROP TABLE IF EXISTS {t}")
        conn.execute(f"CREATE TABLE captura_pairs_new ({', '.join(PAIR_COLS)}, PRIMARY KEY (vendor_id, institution_id))")
        conn.execute(f"CREATE TABLE captura_buyers_new ({', '.join(BUYER_COLS)}, PRIMARY KEY (institution_id))")
        conn.execute("CREATE TABLE captura_meta_new (k TEXT PRIMARY KEY, v TEXT, updated_at TEXT DEFAULT (datetime('now')))")
    for table, cols, rows in (('captura_pairs_new', PAIR_COLS, res['pairs']), ('captura_buyers_new', BUYER_COLS, res['buyers'])):
        for i in range(0, len(rows), batch):
            with conn:
                conn.executemany(f"INSERT INTO {table} VALUES ({','.join('?' * len(cols))})",
                                 [tuple(js(r[c]) for c in cols) for r in rows[i:i + batch]])
    with conn:
        conn.execute("INSERT INTO captura_meta_new(k, v) VALUES ('meta', ?)", (json.dumps(res['meta']),))
    with conn:  # the swap: drops + renames + index, milliseconds
        for t in ('captura_pairs', 'captura_buyers', 'captura_meta'):
            conn.execute(f"DROP TABLE IF EXISTS {t}")
            conn.execute(f"ALTER TABLE {t}_new RENAME TO {t}")
        conn.execute("CREATE INDEX IF NOT EXISTS ix_captura_pairs_inst ON captura_pairs(institution_id, m DESC)")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--db', default=str(Path(__file__).resolve().parents[1] / 'RUBLI_NORMALIZED.db'))
    ap.add_argument('--write', action='store_true')
    a = ap.parse_args()
    t0 = time.time()
    log = lambda *x: print(f'[{time.time() - t0:5.0f}s]', *x, flush=True)  # noqa: E731
    src = sqlite3.connect(f'file:{a.db}?mode=ro', uri=True, timeout=120)
    res = compute(src, log)
    src.close()
    print(json.dumps(res['meta']['totals'], indent=1))
    for b in res['buyers'][:30]:
        print(f"  {b['institution_id']:5d} {str(b['siglas'] or '')[:12]:12s} {b['name'][:50]:50s} {b['cap'] / 1e6:9,.0f} MDP "
              f"{100 * b['cap_share']:5.1f}% n {b['n']:5d} post {b['post_n']}")
    if not a.write:
        print('dry run: nothing written (pass --write)')
        return
    w = sqlite3.connect(a.db, timeout=600)
    w.execute('PRAGMA busy_timeout = 600000')
    write(w, res)
    w.close()
    log('written captura_pairs', len(res['pairs']), 'captura_buyers', len(res['buyers']))


if __name__ == '__main__':
    main()
