"""«La columna» (/administrations) — one slab per year, grouped by government → precomputed_stats['sexenios_columna'].

    python -m scripts.precompute_sexenios_columna --db RUBLI_NORMALIZED.db [--dry-run]

Definition (read by GET /api/v1/sexenios/columna and frontend/src/components/administrations/columna/):
  rows          CompraNet contracts only (source_structure <> 'E': ComprasMX overlaps CompraNet in 2025),
                amount_mxn > 0 AND amount_mxn <= 100B (> 100B rejected), contract_date not null, 2002..2025.
  money         nominal pesos (pesos corrientes), sum of amount_mxn.
  sin licitar   share of the MONEY with is_direct_award = 1, and the COUNT of such contracts (da_contracts out of
                da_base); NULL before 2011 (the flag is not recorded there).
  crítico       contracts with risk_score >= 0.60 per 100 contracts — an indicator, not proof.
  government    by year, the transition year belongs to the outgoing president (api/administrations.py).
  per year      12 months, the 5 largest suppliers, the 5 largest contracts (flag / amount_flag = public_labels.amount_flag).
  per term      the 5 largest suppliers, the 5 largest buying institutions, money by sector.
  leaders       suppliers / buyers are ranked WITHOUT flagged amounts (suspect decimal or > 10B); totals keep them.
  cut           contract_date <= SOURCE_SWITCH_ISO (COLUMN_ROWS_SQL): «2025, to September» is true.
  personas físicas are named (owner policy 2026-10-29) with persona_fisica = true; no RFC is ever written.
"""
from __future__ import annotations

import argparse
import json
import sqlite3
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from api.administrations import ADMINISTRATIONS, get_administration_for_year  # noqa: E402
from api.config.constants import COLUMN_ROWS_SQL, PROCEDURE_TYPE_FIRST_YEAR, SOURCE_SWITCH_ISO  # noqa: E402
from api.public_labels import clean_name, flagged_amounts, is_named_persona  # noqa: E402

STAT_KEY = 'sexenios_columna'
FIRST, LAST = 2002, 2025
TOP = 5
CRIT = 0.60
# constant SQL fragments, no user input
WHERE = COLUMN_ROWS_SQL
# leaders (largest suppliers / buyers) never rest on a flagged amount (public_labels.amount_flag: suspect decimal or
# > 10B): those rows stay in the totals and in the largest-contracts list, tagged, but out of the rankings
# (AUDIT_DATA 11-07 A3: one 27.5 bn row made Operadora Cicsa Sheinbaum's «largest supplier»)
LEAD = WHERE + " AND c.id NOT IN (SELECT id FROM temp.col_flagged)"
FLAGGED: dict = {}
DA_MONEY = "SUM(CASE WHEN c.is_direct_award = 1 THEN c.amount_mxn ELSE 0 END)"


def _vendor(r, value_key='value', total=None) -> dict:
    out = {'id': r['vid'], 'name': clean_name(r['vname']),
           'persona_fisica': bool(is_named_persona(r['is_individual'], r['rfc'], r['vname']))}
    if total is not None:
        out.update(value=r[value_key], share=r[value_key] / total if total else 0)
    return out


def _top_vendors(conn, y0: int, y1: int, total: float) -> list[dict]:
    rows = conn.execute(f"""
        SELECT c.vendor_id AS vid, SUM(c.amount_mxn) AS value, COUNT(*) AS n
        FROM contracts c WHERE c.contract_year BETWEEN ? AND ? AND c.vendor_id IS NOT NULL AND {LEAD}
        GROUP BY c.vendor_id ORDER BY value DESC LIMIT ?""", (y0, y1, TOP)).fetchall()
    out = []
    for r in rows:
        v = conn.execute("SELECT id AS vid, name AS vname, is_individual, rfc FROM vendors WHERE id = ?", (r['vid'],)).fetchone()
        d = _vendor(v) if v else {'id': r['vid'], 'name': None, 'persona_fisica': False}
        out.append({**d, 'value': r['value'], 'contracts': r['n'], 'share': r['value'] / total if total else 0})
    return out


def _year(conn, y: int) -> dict:
    t = conn.execute(f"""
        SELECT COUNT(*) AS n, COALESCE(SUM(c.amount_mxn), 0) AS value, {DA_MONEY} AS da,
               SUM(CASE WHEN c.risk_score >= {CRIT} THEN 1 ELSE 0 END) AS crit,
               SUM(CASE WHEN c.is_direct_award = 1 THEN 1 ELSE 0 END) AS da_n
        FROM contracts c WHERE c.contract_year = ? AND {WHERE}""", (y,)).fetchone()
    n, value = t['n'] or 0, t['value'] or 0.0
    months = []
    by_m = {r['m']: r for r in conn.execute(f"""
        SELECT CAST(substr(c.contract_date, 6, 2) AS INTEGER) AS m, COUNT(*) AS n, SUM(c.amount_mxn) AS value,
               SUM(CASE WHEN c.risk_score >= {CRIT} THEN 1 ELSE 0 END) AS crit
        FROM contracts c WHERE c.contract_year = ? AND {WHERE} GROUP BY m""", (y,))}
    for m in range(1, 13):
        r = by_m.get(m)
        months.append({'month': m, 'contracts': r['n'] if r else 0, 'value': (r['value'] or 0) if r else 0,
                       'crit100': round(100 * r['crit'] / r['n'], 2) if r and r['n'] else None})
    contracts = []
    for r in conn.execute(f"""
        SELECT c.id, c.title, c.amount_mxn, c.contract_date, c.risk_score, c.is_direct_award, c.contract_year,
               c.institution_id, i.name AS iname, v.id AS vid, v.name AS vname, v.is_individual, v.rfc
        FROM contracts c LEFT JOIN vendors v ON v.id = c.vendor_id LEFT JOIN institutions i ON i.id = c.institution_id
        WHERE c.contract_year = ? AND {WHERE} ORDER BY c.amount_mxn DESC LIMIT ?""", (y, TOP)):
        contracts.append({
            'id': r['id'], 'title': r['title'], 'amount': r['amount_mxn'], 'date': r['contract_date'][:10],
            'risk_score': r['risk_score'], 'flag': r['id'] in FLAGGED,
            'amount_flag': FLAGGED[r['id']][0] if r['id'] in FLAGGED else None,
            'direct_award': (bool(r['is_direct_award']) if r['contract_year'] >= PROCEDURE_TYPE_FIRST_YEAR else None),
            'vendor': _vendor(r) if r['vid'] is not None else None,
            'institution': {'id': r['institution_id'], 'name': r['iname']} if r['institution_id'] is not None else None,
        })
    return {
        'year': y, 'term': (get_administration_for_year(y) or ADMINISTRATIONS[-1]).key,
        'contracts': n, 'value': value,
        'da_share': (t['da'] / value if value else None) if y >= PROCEDURE_TYPE_FIRST_YEAR else None,
        'da_contracts': (t['da_n'] or 0) if y >= PROCEDURE_TYPE_FIRST_YEAR else None,
        'crit100': round(100 * t['crit'] / n, 2) if n else None,
        'months': months, 'vendors': _top_vendors(conn, y, y, value), 'top_contracts': contracts,
    }


def _term(conn, a, years: list[dict]) -> dict:
    ys = [y for y in years if a.year_min <= y['year'] <= a.year_max]
    y0, y1 = max(a.year_min, FIRST), min(a.year_max, LAST)
    value = sum(y['value'] for y in ys)
    n = sum(y['contracts'] for y in ys)
    coded = [y for y in ys if y['da_share'] is not None]
    coded_v = sum(y['value'] for y in coded)
    inst = [{'id': r['iid'], 'name': r['iname'], 'value': r['value'], 'share': r['value'] / value if value else 0}
            for r in conn.execute(f"""
        SELECT c.institution_id AS iid, i.name AS iname, SUM(c.amount_mxn) AS value
        FROM contracts c LEFT JOIN institutions i ON i.id = c.institution_id
        WHERE c.contract_year BETWEEN ? AND ? AND c.institution_id IS NOT NULL AND {LEAD}
        GROUP BY c.institution_id ORDER BY value DESC LIMIT ?""", (y0, y1, TOP))]
    sectors = [{'sector_id': r['sid'], 'value': r['value'], 'share': r['value'] / value if value else 0}
               for r in conn.execute(f"""
        SELECT COALESCE(c.sector_id, 12) AS sid, SUM(c.amount_mxn) AS value
        FROM contracts c WHERE c.contract_year BETWEEN ? AND ? AND {WHERE}
        GROUP BY sid ORDER BY value DESC""", (y0, y1))]
    crit = sum((y['crit100'] or 0) * y['contracts'] / 100 for y in ys)
    return {
        'key': a.key, 'years': [y['year'] for y in ys], 'contracts': n, 'value': value,
        'value_per_year': value / len(ys) if ys else 0,
        'da_share': sum(y['da_share'] * y['value'] for y in coded) / coded_v if coded_v else None,
        'da_years': [y['year'] for y in coded],
        # count of direct-award contracts and the contracts they are counted out of (coded years only)
        'da_contracts': sum(y['da_contracts'] for y in coded) if coded else None,
        'da_base': sum(y['contracts'] for y in coded) if coded else None,
        'crit100': round(100 * crit / n, 2) if n else None,
        'vendors': _top_vendors(conn, y0, y1, value), 'institutions': inst, 'sectors': sectors,
    }


def compute(conn: sqlite3.Connection, log=lambda *a: None) -> dict:
    conn.row_factory = sqlite3.Row
    FLAGGED.clear()
    FLAGGED.update(flagged_amounts(conn, WHERE))
    conn.execute("CREATE TEMP TABLE IF NOT EXISTS col_flagged (id INTEGER PRIMARY KEY)")
    conn.execute("DELETE FROM temp.col_flagged")
    conn.executemany("INSERT INTO temp.col_flagged VALUES (?)", [(i,) for i in FLAGGED])
    log(f'  {len(FLAGGED)} flagged amounts kept out of the leaders')
    years = []
    for y in range(FIRST, LAST + 1):
        years.append(_year(conn, y))
        log(f'  {y}: {years[-1]["contracts"]:,} contracts')
    terms = [_term(conn, a, years) for a in ADMINISTRATIONS if a.year_max >= FIRST and a.year_min <= LAST]
    return {'cut': SOURCE_SWITCH_ISO, 'first_year': FIRST, 'last_year': LAST, 'years': years, 'terms': terms}


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
    for t in data['terms']:
        print(f"{t['key']:<11} {t['value'] / 1e12:5.2f} T  sin licitar {t['da_share']}  crit/100 {t['crit100']}")
    if not a.dry_run:
        write(conn, data)
    print(f'done in {time.time() - t0:.0f}s', flush=True)


if __name__ == '__main__':
    main()
