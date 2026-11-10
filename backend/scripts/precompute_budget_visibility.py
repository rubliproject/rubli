"""Build «Gasto a ciegas» (/gasto-a-ciegas): what each federal entity EXERCISED on purchases + works (SHCP Cuenta
Pública) against what shows up as a CONTRACT in our register. It measures visibility, not corruption.

Tables (all rebuilt in one transaction, so readers never see them half-written):
  budget_ur_map        the reviewed mapping (entity_key → ramo, UR, institution ids, labels). Written from MAP
                       below: institutions.clave_institucion only covers ComprasMX-era rows, so it is by hand.
  budget_exercised     Cuenta Pública aggregated per (year, ramo, UR, capítulo, tracked cartera): ejercido and
                       partida 46101 «Aportaciones a fideicomisos públicos». Python-side, from the CSVs only.
  budget_visibility    entity × year: exercised cap 2/3/5/6, cap 1, cap 4, cap 6, total, trusts, visible contracts
                       (sum, count, direct-award money) and pct_visible. ONE INSERT … SELECT over contracts.
  budget_visible_top   the 10 largest visible contracts per entity × year (the drawer). ONE INSERT … SELECT.

Rules: capítulo = first digit of the 5-digit partida; contracts 0 < amount <= 100,000 MDP (> 100B rejected);
a dependencia = the numeric URs of its ramo (ur '#'); an entity is matched by UR code, across ramos when
`ramo` is NULL (they move: CIIT 47→13, FIT 09→47→13); a project (Tren Maya) = its cartera on every UR, and its
register side = contracts whose title or description names it, any buyer. No Python-side fetchall over
contracts (the 1.5 GB prod backend OOM'd on that, 2026-10-26).

Input: the six SHCP CSVs `cuenta_publica_{2020..2025}_gf_ecd_epe.csv` (latin-1, 32 positional columns; 2022 is
an Excel export with 212 columns and padding rows). Download on the VPS with verification-disabled TLS (the
SHCP server omits its intermediate certificate) — see docs/SCORING.md.

    python -m scripts.precompute_budget_visibility --db DB --csv cp2020.csv ... cp2025.csv
    python -m scripts.precompute_budget_visibility --db SRC --out-db SIDE --csv ...   # SRC read-only
    python -m scripts.precompute_budget_visibility --db DB                             # reuse budget_exercised
    python -m scripts.precompute_budget_visibility --demo
"""
import argparse
import csv
import json
import sqlite3
import sys
import time
from collections import defaultdict

Y0, Y1 = 2019, 2026          # register years kept (CP years are whatever the CSVs carry)
MAX_AMOUNT = 100_000_000_000  # > 100B MXN rejected (.claude/rules/data-validation.md)
TOP_N = 10

# (entity_key, grp, label_es, label_en, short, cp code shown, ramo|None=any, ur|'#'=numeric URs, project cartera,
#  institution ids, title match for a project's register side)
# grp: ns = declared of national security / military-run · civ = civilian comparison · ley = out of CompraNet by law
MAP = [
    ('tren-maya', 'proj', 'Proyecto Tren Maya', 'Tren Maya project', 'Tren Maya', 'cartera 2021W3N0001', None, None,
     '2021W3N0001', [194, 2604, 4260], 'TREN MAYA'),
    ('tren-maya-sa', 'ns', 'Tren Maya, S.A. de C.V.', 'Tren Maya, S.A. de C.V.', 'Tren Maya S.A.', '07-H0M', 7, 'H0M', None, [4260], None),
    ('fonatur-tren-maya', 'ns', 'FONATUR Tren Maya, S.A. de C.V.', 'FONATUR Tren Maya, S.A. de C.V.', 'FONATUR Tren Maya', '21-W3X', 21, 'W3X', None, [2604], None),
    ('gafsacomm', 'ns', 'Grupo Aeroportuario, Ferroviario… Olmeca-Maya-Mexica', 'Olmeca-Maya-Mexica airport and rail group', 'GAFSACOMM', '07-H0C', 7, 'H0C', None, [3807], None),
    ('aifa', 'ns', 'Aeropuerto Internacional Felipe Ángeles', 'Felipe Ángeles International Airport', 'AIFA', '07-HZI', 7, 'HZI', None, [3806, 3776], None),
    ('mexicana', 'ns', 'Aerolínea del Estado Mexicano (Mexicana)', 'State airline (Mexicana)', 'Mexicana', '07-HZK', 7, 'HZK', None, [4258], None),
    ('dos-bocas', 'ns', 'ASIPONA Dos Bocas', 'ASIPONA Dos Bocas port', 'ASIPONA Dos Bocas', '13-J2P', None, 'J2P', None, [3722, 4], None),
    ('ciit', 'ns', 'Corredor Interoceánico del Istmo de Tehuantepec', 'Interoceanic Corridor of the Isthmus', 'CIIT', '47/13-AYH', None, 'AYH', None, [3771], None),
    ('fit', 'ns', 'Ferrocarril del Istmo de Tehuantepec', 'Isthmus of Tehuantepec Railway', 'FIT', '09/47/13-J3L', None, 'J3L', None, [1440, 177], None),
    ('sedena', 'ns', 'Secretaría de la Defensa Nacional', 'Ministry of Defence', 'SEDENA', '07 (UR numéricas)', 7, '#', None, [384, 3773], None),
    ('semar', 'ns', 'Secretaría de Marina', 'Ministry of the Navy', 'SEMAR', '13 (UR numéricas)', 13, '#', None, [1212, 3777], None),
    ('imss', 'civ', 'Instituto Mexicano del Seguro Social', 'Mexican Social Security Institute', 'IMSS', '50-GYR', 50, 'GYR', None, [251], None),
    ('issste', 'civ', 'ISSSTE', 'ISSSTE', 'ISSSTE', '51-GYN', 51, 'GYN', None, [228, 431], None),
    ('imss-bienestar', 'civ', 'IMSS-Bienestar', 'IMSS-Bienestar', 'IMSS-Bienestar', '47-AYO', 47, 'AYO', None, [3780], None),
    ('sict', 'civ', 'Secretaría de Infraestructura, Comunicaciones y Transportes', 'Ministry of Infrastructure, Communications and Transport', 'SICT', '09 (UR numéricas)', 9, '#', None, [345, 3671, 3766], None),
    ('conagua', 'civ', 'Comisión Nacional del Agua', 'National Water Commission', 'CONAGUA', '16-B00', 16, 'B00', None, [117], None),
    ('sep', 'civ', 'Secretaría de Educación Pública', 'Ministry of Education', 'SEP', '11 (UR numéricas)', 11, '#', None, [370], None),
    ('pemex', 'ley', 'Pemex (consolidado)', 'Pemex (consolidated)', 'Pemex', '52-TYY', 52, 'TYY', None,
     [311, 314, 1201, 312, 1232, 313, 1211, 1222, 1203, 315], None),
    ('cfe', 'ley', 'CFE (consolidado)', 'CFE (consolidated)', 'CFE', '53-TVV', 53, 'TVV', None, [104], None),
]

DDL = """
CREATE TABLE IF NOT EXISTS budget_ur_map (
    entity_key TEXT PRIMARY KEY, sort INTEGER NOT NULL, grp TEXT NOT NULL,
    label_es TEXT NOT NULL, label_en TEXT NOT NULL, short TEXT NOT NULL, cp_code TEXT NOT NULL,
    ramo INTEGER,            -- NULL = any ramo (entities that moved between ramos)
    ur TEXT,                 -- '#' = every numeric UR of the ramo (a dependencia); NULL for a project
    project_key TEXT,        -- clave de cartera: the project's spend on every UR
    institution_ids TEXT NOT NULL,   -- JSON array of register institution ids
    title_match TEXT         -- a project's register side: UPPER(title|description) LIKE %match%
);
CREATE TABLE IF NOT EXISTS budget_exercised (
    year INTEGER NOT NULL, ramo INTEGER NOT NULL, ur TEXT NOT NULL, cap INTEGER NOT NULL,
    project_key TEXT NOT NULL DEFAULT '',  -- a tracked cartera, else ''
    ejercido REAL NOT NULL, trusts_46101 REAL NOT NULL,
    PRIMARY KEY (year, ramo, ur, cap, project_key)
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS budget_visibility (
    entity_key TEXT NOT NULL, year INTEGER NOT NULL,
    ur_codes TEXT, institution_ids TEXT, project_key TEXT,
    exercised_cap2356 REAL, exercised_cap1 REAL, exercised_cap4 REAL, exercised_cap6 REAL,
    exercised_total REAL, trusts_46101 REAL,
    contracts_visible_mxn REAL NOT NULL, contracts_n INTEGER NOT NULL, contracts_da_mxn REAL NOT NULL,
    pct_visible REAL,
    PRIMARY KEY (entity_key, year)
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS budget_visible_top (
    entity_key TEXT NOT NULL, year INTEGER NOT NULL, rank INTEGER NOT NULL,
    contract_id INTEGER NOT NULL, amount_mxn REAL NOT NULL,
    PRIMARY KEY (entity_key, year, rank)
) WITHOUT ROWID;
"""

# the CP rows of an entity: its cartera (project) or its ramo/UR rule
_MATCH = """(CASE WHEN m.project_key IS NOT NULL THEN b.project_key = m.project_key
     ELSE (m.ramo IS NULL OR b.ramo = m.ramo)
      AND (CASE WHEN m.ur = '#' THEN b.ur NOT GLOB '*[^0-9]*' ELSE b.ur = m.ur END) END)"""

# the visible contracts of an entity: its institutions, or (a project) every contract that names it
_REG_ROWS = f"""
  SELECT ids.entity_key AS k, c.id AS cid, c.contract_year AS y, c.amount_mxn AS a, c.is_direct_award AS da
  FROM (SELECT m.entity_key, CAST(j.value AS INTEGER) AS iid FROM budget_ur_map m, json_each(m.institution_ids) j
        WHERE m.title_match IS NULL) ids
  JOIN contracts c INDEXED BY idx_c_inst_year ON c.institution_id = ids.iid AND c.contract_year BETWEEN {Y0} AND {Y1}
  WHERE c.amount_mxn > 0 AND c.amount_mxn <= {MAX_AMOUNT}
  UNION ALL
  SELECT m.entity_key, c.id, c.contract_year, c.amount_mxn, c.is_direct_award
  FROM budget_ur_map m JOIN contracts c INDEXED BY idx_c_year ON c.contract_year BETWEEN {Y0} AND {Y1}
  WHERE m.title_match IS NOT NULL AND c.amount_mxn > 0 AND c.amount_mxn <= {MAX_AMOUNT}
    AND (UPPER(c.title) LIKE '%' || m.title_match || '%' OR UPPER(c.description) LIKE '%' || m.title_match || '%')
"""

FILL_VIS = f"""
INSERT INTO budget_visibility
WITH ex AS (
  SELECT m.entity_key AS k, b.year AS y,
         group_concat(DISTINCT printf('%02d-%s', b.ramo, b.ur)) AS urs,
         SUM(CASE WHEN b.cap IN (2, 3, 5, 6) THEN b.ejercido ELSE 0 END) AS e2356,
         SUM(CASE WHEN b.cap = 1 THEN b.ejercido ELSE 0 END) AS e1,
         SUM(CASE WHEN b.cap = 4 THEN b.ejercido ELSE 0 END) AS e4,
         SUM(CASE WHEN b.cap = 6 THEN b.ejercido ELSE 0 END) AS e6,
         SUM(b.ejercido) AS et, SUM(b.trusts_46101) AS tr
  FROM budget_exercised b JOIN budget_ur_map m ON {_MATCH}
  GROUP BY 1, 2),
reg AS (SELECT k, y, SUM(a) AS v, COUNT(*) AS n, SUM(CASE WHEN da = 1 THEN a ELSE 0 END) AS dav
        FROM ({_REG_ROWS}) GROUP BY 1, 2),
keys AS (SELECT k, y FROM ex UNION SELECT k, y FROM reg)
SELECT keys.k, keys.y, ex.urs, m.institution_ids, m.project_key,
       ex.e2356, ex.e1, ex.e4, ex.e6, ex.et, ex.tr,
       COALESCE(reg.v, 0), COALESCE(reg.n, 0), COALESCE(reg.dav, 0),
       CASE WHEN ex.e2356 > 0 THEN COALESCE(reg.v, 0) / ex.e2356 END
FROM keys JOIN budget_ur_map m ON m.entity_key = keys.k
LEFT JOIN ex ON ex.k = keys.k AND ex.y = keys.y
LEFT JOIN reg ON reg.k = keys.k AND reg.y = keys.y
"""

FILL_TOP = f"""
INSERT INTO budget_visible_top
SELECT k, y, rn, cid, a FROM (
  SELECT k, y, cid, a, ROW_NUMBER() OVER (PARTITION BY k, y ORDER BY a DESC, cid) AS rn FROM ({_REG_ROWS}))
WHERE rn <= {TOP_N}
"""

# Cuenta Pública CSV, by position (headers were renamed in 2025; 2022 carries 180 empty columns)
_YEAR, _RAMO, _UR, _PARTIDA, _CARTERA, _EJERCIDO = 0, 1, 3, 17, 25, 31


def _num(s: str) -> float:
    s = s.replace(',', '').strip()
    try:
        return float(s)
    except ValueError:  # '' and Excel's '-' are zero (the concept's pandas coerce did the same)
        return 0.0


def aggregate_csv(path: str, carteras: set[str]) -> dict:
    """One CSV → {(year, ramo, ur, cap, project_key): [ejercido, trusts_46101]} (streamed; ~100 MB per year)."""
    out: dict = defaultdict(lambda: [0.0, 0.0])
    with open(path, encoding='latin-1', newline='') as f:
        r = csv.reader(f)
        next(r)
        for row in r:
            if len(row) < 32 or not row[_RAMO].strip():
                continue  # 2022's Excel padding rows
            partida = row[_PARTIDA].strip()
            if len(partida) != 5 or not partida.isdigit():
                raise ValueError(f'{path}: partida {partida!r} is not 5 digits — column layout changed?')
            cart = row[_CARTERA].strip()
            key = (int(row[_YEAR]), int(row[_RAMO]), row[_UR].strip(), int(partida[0]), cart if cart in carteras else '')
            v = _num(row[_EJERCIDO])
            cell = out[key]
            cell[0] += v
            if partida == '46101':
                cell[1] += v
    return out


def load_csvs(paths: list[str]) -> list[tuple]:
    carteras = {m[8] for m in MAP if m[8]}
    rows: list[tuple] = []
    for p in paths:
        agg = aggregate_csv(p, carteras)
        by_year: dict = defaultdict(float)
        for k, (e, _) in agg.items():
            by_year[k[0]] += e
        for y, tot in by_year.items():
            # the federal total runs 6.9–11.3 billones in 2020–2025: anything else is a parse error
            if not 5e12 < tot < 15e12:
                raise ValueError(f'{p}: {y} exercised total {tot / 1e12:.2f} billones is out of range')
            print(f'  {p}: {y} - {len(agg):,} cells - {tot / 1e12:.2f} billones', flush=True)
        rows += [(*k, e, t) for k, (e, t) in agg.items()]
    return rows


def build(conn: sqlite3.Connection, exercised: list[tuple] | None) -> dict:
    """Rebuild the four tables; `exercised=None` keeps budget_exercised as it is (after an ETL rerun)."""
    conn.executescript(DDL)
    conn.execute('BEGIN IMMEDIATE')
    try:
        conn.execute('DELETE FROM budget_ur_map')
        conn.executemany('INSERT INTO budget_ur_map VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
                         [(k, i, g, les, len_, sh, cp, ramo, ur, pk, json.dumps(ids), tm)
                          for i, (k, g, les, len_, sh, cp, ramo, ur, pk, ids, tm) in enumerate(MAP)])
        if exercised is not None:
            conn.execute('DELETE FROM budget_exercised')
            conn.executemany('INSERT INTO budget_exercised VALUES (?,?,?,?,?,?,?)', exercised)
        conn.execute('DELETE FROM budget_visibility')
        nv = conn.execute(FILL_VIS).rowcount
        conn.execute('DELETE FROM budget_visible_top')
        nt = conn.execute(FILL_TOP).rowcount
        conn.execute('COMMIT')
    except Exception:
        conn.execute('ROLLBACK')
        raise
    return {'visibility': nv, 'top': nt}


def _demo() -> None:
    c = sqlite3.connect(':memory:', isolation_level=None)
    c.executescript("""
        CREATE TABLE contracts (id INTEGER PRIMARY KEY, institution_id INT, contract_year INT, amount_mxn REAL,
                                is_direct_award INT, title TEXT, description TEXT);
        CREATE INDEX idx_c_inst_year ON contracts(institution_id, contract_year);
        CREATE INDEX idx_c_year ON contracts(contract_year);
        INSERT INTO contracts VALUES
          (1, 4260, 2024, 100e6, 1, 'Obra', NULL),            -- Tren Maya S.A.
          (2, 4260, 2024, 200e9, 0, 'Error decimal', NULL),   -- > 100B: rejected
          (3, 99, 2024, 50e6, 0, 'x', 'suministro TREN MAYA tramo 5'),  -- names the train, other buyer
          (4, 384, 2024, 30e6, 0, 'x', NULL);                 -- SEDENA
    """)
    ex = [(2024, 7, 'H0M', 6, '2021W3N0001', 900e6, 0), (2024, 7, 'H0M', 4, '', 500e6, 400e6),
          (2024, 7, '110', 3, '', 120e6, 0), (2024, 7, 'H0C', 3, '', 77e6, 0), (2024, 21, 'W3N', 6, '2021W3N0001', 1100e6, 0)]
    n = build(c, ex)
    assert build(c, ex) == n  # a rebuild replaces, never doubles
    v = {r[0]: r for r in c.execute("SELECT entity_key, exercised_cap2356, trusts_46101, contracts_visible_mxn, contracts_n,"
                                    " contracts_da_mxn, pct_visible FROM budget_visibility WHERE year = 2024")}
    assert v['tren-maya-sa'] == ('tren-maya-sa', 900e6, 400e6, 100e6, 1, 100e6, 100e6 / 900e6), v['tren-maya-sa']
    assert v['tren-maya'][1:5] == (2000e6, 0, 50e6, 1), v['tren-maya']   # cartera on two URs · title scan
    assert v['sedena'][1] == 120e6 and v['sedena'][3] == 30e6, v['sedena']  # numeric URs only (H0C is not SEDENA)
    assert c.execute("SELECT contract_id FROM budget_visible_top WHERE entity_key='tren-maya-sa'").fetchall() == [(1,)]
    print('ok')


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument('--db', help='database with contracts (written into unless --out-db)')
    p.add_argument('--out-db', help='side DB to write the budget tables into; --db is then read-only')
    p.add_argument('--csv', nargs='*', default=None, help='Cuenta Pública CSVs (local paths); omit to reuse budget_exercised')
    p.add_argument('--demo', action='store_true', help='run the self-check and exit')
    a = p.parse_args()
    if a.demo or not a.db:
        _demo()
        return
    t0 = time.time()
    exercised = load_csvs(a.csv) if a.csv else None
    if a.out_db:
        conn = sqlite3.connect(a.out_db, timeout=120, isolation_level=None, uri=True)
        conn.execute('ATTACH DATABASE ? AS src', (f'file:{a.db}?mode=ro',))
    else:
        conn = sqlite3.connect(a.db, timeout=120, isolation_level=None)
    if exercised is None and not conn.execute("SELECT 1 FROM sqlite_master WHERE name = 'budget_exercised'").fetchone():
        sys.exit('budget_exercised does not exist yet — pass --csv')
    n = build(conn, exercised)
    if not a.out_db:
        conn.execute('PRAGMA wal_checkpoint(TRUNCATE)')
    print(f'budget_visibility: {n["visibility"]:,} rows - budget_visible_top: {n["top"]:,} rows - '
          f'{time.time() - t0:.1f}s -> {a.out_db or a.db}')


if __name__ == '__main__':
    main()
