"""«El sexenio en curso» (/sexenio-actual) — federal procurement under the current term → precomputed_stats['sexenio_actual'].

    python -m scripts.precompute_sexenio_actual --db RUBLI_NORMALIZED.db [--dry-run]

Definition (read by GET /api/v1/sexenio-actual and frontend/src/pages/SexenioActual.tsx):
  term window   contract_date (the start date) from 2024-10-01 to the data cut (newest contract_date of a LOADED
                ComprasMX contract, source_structure 'E'; DATA_CUT_ISO when none), both inclusive.
  comparison    the same first N days of Peña Nieto (from 2012-12-01) and AMLO (from 2018-12-01), where
                N = days from 2024-10-01 to the cut. Same filters, same model (risk_level column).
  amounts       > 100B MXN rejected (left out of every count and sum); > 10B MXN kept and flagged.
  direct award  is_direct_award = 1, as a share of value and of contracts.
  single bid    is_single_bid = 1 over competitive (not direct-award) contracts.
  high+critical risk_level in ('high', 'critical') — an indicator, not proof.
  urgency       procedure_type mentions URGENCIA or FORTUITO, or exception_article is a caso-fortuito /
                urgencia article (same crosswalk as scripts/compute_senales_nuevas.py), or caso_fortuito
                is true (1 / SI) or names a caso fortuito / urgencia reason.
  first-time    a supplier (canonical group when vendor_canonical exists) with no contract dated before
                2024-10-01 and >= 100 MDP in the term.
  personas físicas are pooled and never named; no RFC is ever written.
Reads contracts / vendors / institutions; writes one precomputed_stats row (unless --dry-run).
"""
from __future__ import annotations

import argparse
import json
import sqlite3
import sys
import time
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from api.config.constants import DATA_CUT_ISO, FLAG_THRESHOLD, MAX_CONTRACT_VALUE, SOURCE_SWITCH_ISO  # noqa: E402
from api.public_labels import clean_name, is_persona_fisica, public_vendor_name  # noqa: E402

STAT_KEY = 'sexenio_actual'
TERMS = (('sheinbaum', '2024-10-01'), ('amlo', '2018-12-01'), ('pena_nieto', '2012-12-01'))
TERM_START = TERMS[0][1]
NEW_MIN = 100e6  # first-time suppliers: >= 100 MDP in the term
TOP = 15
URGENCY_ARTICLES = frozenset({
    "ART. 41 FR. II", "ART. 41 FR. V", "ART. 54 FR. II", "ART. 54 FR. V",
    "ART. 42 FR. II", "ART. 42 FR. V", "ART. 45 BIS",
})
# INPC deflators, base 2024 — the same table as api/routers/executive.py and precompute_stats.py.
# Terms twelve years apart are only comparable in constant pesos (a 2013 peso ≈ 1.65 pesos of 2024).
INPC = {2002: 0.382, 2003: 0.404, 2004: 0.420, 2005: 0.442, 2006: 0.456, 2007: 0.475, 2008: 0.493, 2009: 0.525,
        2010: 0.544, 2011: 0.567, 2012: 0.586, 2013: 0.607, 2014: 0.632, 2015: 0.658, 2016: 0.671, 2017: 0.694,
        2018: 0.741, 2019: 0.777, 2020: 0.799, 2021: 0.824, 2022: 0.885, 2023: 0.955, 2024: 1.0, 2025: 1.038, 2026: 1.072}  # INEGI annual means, 2026 = Jan–Sep


def _real(r) -> float:
    return (r[2] or 0) / INPC.get(int(r[1][:4]), 1.0) if r[1] else (r[2] or 0)


COLS = ("id, contract_date, amount_mxn, is_direct_award, is_single_bid, risk_level, vendor_id, institution_id, "
        "procedure_type, exception_article, caso_fortuito, title, risk_score, source_structure")


def _has(conn, t):
    return conn.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (t,)).fetchone() is not None


def is_urgent(proc, article, fortuito) -> bool:
    p = (proc or '').upper()
    f = str(fortuito or '').strip().upper()  # stored as text, 0/1 or a reason depending on the source
    return ('URGENCIA' in p or 'FORTUITO' in p or str(article or '').strip().upper() in URGENCY_ARTICLES
            or f in ('1', '1.0', 'SI', 'SÍ', 'TRUE') or 'FORTUITO' in f or 'URGENCIA' in f)


def _window(conn, start: str, end: str):
    """Valid contracts dated start..end (inclusive). contract_year (±1: fiscal vs start year) bounds the scan first."""
    y0, y1 = int(start[:4]), int(end[:4])
    return conn.execute(
        f"SELECT {COLS} FROM contracts WHERE contract_year BETWEEN ? AND ? AND contract_date BETWEEN ? AND ? "
        "AND (amount_mxn IS NULL OR amount_mxn <= ?)", (y0 - 1, y1 + 1, start, end, MAX_CONTRACT_VALUE)).fetchall()


def _summary(rows) -> dict:
    n = len(rows)
    v = sum(r[2] or 0 for r in rows)
    da_n = sum(1 for r in rows if r[3])
    da_v = sum(r[2] or 0 for r in rows if r[3])
    comp = [r for r in rows if not r[3]]
    sb = sum(1 for r in comp if r[4])
    hc = [r for r in rows if r[5] in ('high', 'critical')]
    return {
        'n': n, 'value': v, 'value_real': sum(_real(r) for r in rows),
        'da_n': da_n / n if n else None, 'da_v': da_v / v if v else None,
        'sb': sb / len(comp) if comp else None,
        'hc_n': len(hc) / n if n else None, 'hc_v': sum(r[2] or 0 for r in hc) / v if v else None,
        'flagged': sum(1 for r in rows if (r[2] or 0) > FLAG_THRESHOLD),
    }


def data_cut(conn) -> str:
    """The newest LOADED ComprasMX contract date (contracts 'E'; integrate never writes a future date), so the
    cut moves only once the weekly refresh has loaded the rows, not when it stages them; DATA_CUT_ISO when none."""
    d = conn.execute("SELECT contract_date FROM contracts WHERE source_structure = 'E' AND contract_date IS NOT NULL "
                     "ORDER BY contract_date DESC LIMIT 1").fetchone()  # walks idx_contracts_date from the top
    return d[0] if d else DATA_CUT_ISO


def compute(conn: sqlite3.Connection, cut_iso: str | None = None, log=lambda *a: None) -> dict:
    cut_iso = cut_iso or data_cut(conn)
    cut = date.fromisoformat(cut_iso)
    days = (cut - date.fromisoformat(TERM_START)).days

    # (b) the same first N days of each term
    comparison, term_rows = [], None
    for key, start in TERMS:
        end = (date.fromisoformat(start) + timedelta(days=days)).isoformat()
        t0 = time.time()
        rows = _window(conn, start, end)
        log(f"{key}: {len(rows):,} contracts {start}..{end} in {time.time() - t0:.1f}s")
        comparison.append({'key': key, 'start': start, 'end': end, **_summary(rows)})
        if key == 'sheinbaum':
            term_rows = rows

    inst = {r[0]: r[1:] for r in conn.execute(
        "SELECT id, name, siglas, sector_id, is_federal FROM institutions")}
    vids = {r[6] for r in term_rows if r[6] is not None}
    vend, named_pf = {}, {}  # named_pf: the CompraNet name + label for lists that name personas físicas (policy 10-29)
    for chunk in range(0, len(vids), 900):
        part = list(vids)[chunk:chunk + 900]
        for vid, name, ind, rfc in conn.execute(
                f"SELECT id, name, is_individual, rfc FROM vendors WHERE id IN ({','.join('?' * len(part))})", part):
            vend[vid] = None if is_persona_fisica(ind, rfc) else (clean_name(name) or None)  # rfc read, never kept
            named_pf[vid] = public_vendor_name(name, ind, rfc)
    pf = lambda vid: vid in vend and vend[vid] is None  # noqa: E731 — persona física or an RFC-shaped name

    # (a) monthly series
    months = defaultdict(list)
    for r in term_rows:
        months[r[1][:7]].append(r)
    series = []
    m = date.fromisoformat(TERM_START)
    while m <= cut:
        ym = m.strftime('%Y-%m')
        s = _summary(months.get(ym, []))
        series.append({'month': ym, 'n': s['n'], 'value': s['value'], 'da_v': s['da_v'], 'da_n': s['da_n'],
                       'hc_n': s['hc_n'], 'hc_v': s['hc_v']})
        m = date(m.year + (m.month == 12), m.month % 12 + 1, 1)

    # (c) top buyers / suppliers
    def agg(key_fn):
        out = defaultdict(lambda: [0, 0.0, 0.0])
        for r in term_rows:
            k = key_fn(r)
            if k is None:
                continue
            a = out[k]
            a[0] += 1
            a[1] += r[2] or 0
            a[2] += (r[2] or 0) if r[3] else 0
        return out

    total_v = comparison[0]['value']
    by_inst = agg(lambda r: r[7])
    buyers = []
    for iid, (n, v, dav) in sorted(by_inst.items(), key=lambda kv: -kv[1][1])[:TOP]:
        name, siglas, sector, fed = inst.get(iid, (None, None, None, None))
        buyers.append({'id': iid, 'name': name, 'siglas': siglas, 'sector_id': sector, 'is_federal': fed,
                       'n': n, 'value': v, 'share': v / total_v if total_v else None, 'da_v': dav / v if v else None})
    by_vend = agg(lambda r: r[6])
    pool = [0, 0, 0.0]  # vendors, contracts, value
    suppliers = []
    for vid, (n, v, dav) in sorted(by_vend.items(), key=lambda kv: -kv[1][1]):
        if pf(vid):
            pool[0] += 1
            pool[1] += n
            pool[2] += v
        elif len(suppliers) < TOP:
            suppliers.append({'id': vid, 'name': vend.get(vid), 'n': n, 'value': v,
                              'share': v / total_v if total_v else None, 'da_v': dav / v if v else None})

    # (d) largest contracts
    largest = []
    for r in sorted(term_rows, key=lambda r: -(r[2] or 0))[:20]:
        iname = inst.get(r[7], (None,))[0]
        largest.append({'id': r[0], 'title': r[11], 'institution_id': r[7], 'institution': iname,
                        'vendor_id': r[6], 'vendor': named_pf.get(r[6], (None, False))[0],
                        'persona_fisica': named_pf.get(r[6], (None, False))[1], 'amount': r[2], 'date': r[1], 'procedure': r[8],
                        'risk_level': r[5], 'risk_score': r[12], 'flagged': (r[2] or 0) > FLAG_THRESHOLD})

    # (e) first-time suppliers — canonical group when available
    cand = [vid for vid, a in by_vend.items() if a[1] >= NEW_MIN]
    group = {}
    if _has(conn, 'vendor_canonical') and cand:
        cmap = {}
        for i in range(0, len(cand), 900):
            part = cand[i:i + 900]
            cmap.update(conn.execute(f"SELECT vendor_id, canonical_id FROM vendor_canonical "
                                     f"WHERE vendor_id IN ({','.join('?' * len(part))})", part).fetchall())
        for vid in cand:
            cid = cmap.get(vid)
            group[vid] = ([x for (x,) in conn.execute("SELECT vendor_id FROM vendor_canonical WHERE canonical_id = ?",
                                                      (cid,))] if cid is not None else []) or [vid]
    prior_q = ("SELECT 1 FROM contracts WHERE vendor_id = ? AND contract_year <= ? "
               "AND (contract_date IS NULL OR contract_date < ?) LIMIT 1")  # an undated row counts as prior
    ty = int(TERM_START[:4])
    new = [vid for vid in cand
           if not any(conn.execute(prior_q, (g, ty, TERM_START)).fetchone() for g in group.get(vid, [vid]))]
    new_pf = [v for v in new if pf(v)]
    named = sorted((v for v in new if not pf(v)), key=lambda v: -by_vend[v][1])
    first = {
        'n': len(new), 'value': sum(by_vend[v][1] for v in new),
        'pf_n': len(new_pf), 'pf_value': sum(by_vend[v][1] for v in new_pf),
        'top': [{'id': v, 'name': vend.get(v), 'n': by_vend[v][0], 'value': by_vend[v][1],
                 'da_v': by_vend[v][2] / by_vend[v][1] if by_vend[v][1] else None,
                 'first_date': min(r[1] for r in term_rows if r[6] == v)} for v in named[:TOP]],
    }

    # (f) urgency / caso fortuito
    urg = [r for r in term_rows if is_urgent(r[8], r[9], r[10])]
    um = defaultdict(lambda: [0, 0.0])
    for r in urg:
        um[r[1][:7]][0] += 1
        um[r[1][:7]][1] += r[2] or 0
    u_inst = agg(lambda r: r[7] if is_urgent(r[8], r[9], r[10]) else None)
    urgency = {
        'n': len(urg), 'value': sum(r[2] or 0 for r in urg),
        'share_v': sum(r[2] or 0 for r in urg) / total_v if total_v else None,
        'months': [{'month': s['month'], 'n': um[s['month']][0], 'value': um[s['month']][1]} for s in series],
        'buyers': [{'id': i, 'name': inst.get(i, (None,))[0], 'n': a[0], 'value': a[1]}
                   for i, a in sorted(u_inst.items(), key=lambda kv: -kv[1][1])[:6]],
    }

    cmx = [r for r in term_rows if r[13] == 'E']
    cmx_v = sum(r[2] or 0 for r in cmx)
    cmx_fed = sum(r[2] or 0 for r in cmx if inst.get(r[7], (None,) * 4)[3])
    return {
        'meta': {'cut': cut_iso, 'start': TERM_START, 'days': days, 'source_switch': SOURCE_SWITCH_ISO,
                 'flag_threshold': FLAG_THRESHOLD, 'reject_threshold': MAX_CONTRACT_VALUE, 'new_min': NEW_MIN,
                 'comprasmx_n': len(cmx), 'comprasmx_federal_share_v': cmx_fed / cmx_v if cmx_v else None,
                 'pf_suppliers': {'vendors': pool[0], 'n': pool[1], 'value': pool[2]}},
        'series': series, 'comparison': comparison, 'buyers': buyers, 'suppliers': suppliers,
        'largest': largest, 'first_time': first, 'urgency': urgency,
    }


def write(conn: sqlite3.Connection, data: dict) -> None:
    conn.execute("INSERT OR REPLACE INTO precomputed_stats(stat_key, stat_value, updated_at) "
                 "VALUES (?, ?, datetime('now'))", (STAT_KEY, json.dumps(data, ensure_ascii=False, separators=(',', ':'))))
    conn.commit()


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('--db', default='RUBLI_NORMALIZED.db')
    p.add_argument('--dry-run', action='store_true', help='compute and print, write nothing')
    a = p.parse_args(argv)
    t0 = time.time()
    conn = sqlite3.connect(a.db, timeout=120)
    conn.execute("PRAGMA busy_timeout = 120000")
    conn.execute("PRAGMA cache_size = -262144")
    data = compute(conn, log=lambda *x: print(*x, flush=True))
    for c in data['comparison']:
        print(f"{c['key']:>11}: {c['n']:,} contracts · {c['value'] / 1e9:,.1f} bn · flagged {c['flagged']}")
    print(f"first-time >= 100 MDP: {data['first_time']['n']} · urgency: {data['urgency']['n']:,} "
          f"({(data['urgency']['share_v'] or 0) * 100:.1f} % of value)")
    if not a.dry_run:
        write(conn, data)
        print(f"wrote precomputed_stats['{STAT_KEY}']")
    conn.close()
    print(f"{time.time() - t0:.1f}s")


if __name__ == '__main__':
    main()
