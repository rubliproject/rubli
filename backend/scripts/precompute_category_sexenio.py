"""Build category_sexenio_flows: sector × category × sexenio money and contracts,
with each cell's rank inside its sector and its top vendors (Administraciones,
aluvión ⇄ escalera, owner decision 2026-10-16 / 2026-10-20).

Sexenio by contract date (fallback award_date, start_date; undated rows are left
out). Amounts 0 < x <= 100B MXN (data-validation rule); > 10B are kept and counted
in n_over_10b. Personas físicas (public_labels.is_persona_fisica) never appear by
name: they are pooled into one entry per cell. RFCs never leave SQL.

    python -m scripts.precompute_category_sexenio --db PATH
"""
import argparse
import json
import sqlite3
import time
from collections import defaultdict

from api.public_labels import clean_name, pf_sql  # an RFC-as-name never ships

MAX_CONTRACT_VALUE = 100_000_000_000  # reject above (data-validation rule)
FLAG_THRESHOLD = 10_000_000_000       # flag above
TOP_VENDORS = 8
BATCH = 20_000  # rows per commit

# (index, key, first day, last day)
SEXENIOS = [
    (0, "fox", "2000-12-01", "2006-11-30"),
    (1, "calderon", "2006-12-01", "2012-11-30"),
    (2, "pena_nieto", "2012-12-01", "2018-11-30"),
    (3, "amlo", "2018-12-01", "2024-09-30"),
    (4, "sheinbaum", "2024-10-01", "2030-09-30"),
]
# Fox = Structure A (weak, 0.1 % RFC) and 2004 is nearly empty (count stored in the flag);
# Sheinbaum = partial term: CompraNet to 2025-09-27, then ComprasMX (structure E) to the data cut.

DATE = "substr(COALESCE(NULLIF(contract_date, ''), NULLIF(award_date, ''), NULLIF(start_date, '')), 1, 10)"
ERA = "CASE " + " ".join(f"WHEN d BETWEEN '{a}' AND '{b}' THEN {i}" for i, _, a, b in SEXENIOS) + " END"
QUERY = f"""
SELECT e, s, k, vendor_id, COUNT(*), SUM(amount_mxn), SUM(amount_mxn > {FLAG_THRESHOLD})
FROM (SELECT {ERA} AS e, COALESCE(sector_id, 12) AS s, COALESCE(category_id, 0) AS k, vendor_id, amount_mxn
      FROM (SELECT {DATE} AS d, sector_id, category_id, vendor_id, amount_mxn FROM contracts
            WHERE amount_mxn > 0 AND amount_mxn <= {MAX_CONTRACT_VALUE}))
WHERE e IS NOT NULL
GROUP BY 1, 2, 3, 4
"""

DDL = """
CREATE TABLE category_sexenio_flows_new (
    sexenio TEXT NOT NULL, sexenio_idx INTEGER NOT NULL, sector_id INTEGER NOT NULL,
    category_id INTEGER NOT NULL, money_mxn REAL NOT NULL, contracts INTEGER NOT NULL,
    rank_in_sexenio INTEGER NOT NULL, rank_by_contracts INTEGER NOT NULL,
    n_over_10b INTEGER NOT NULL, top_vendors TEXT NOT NULL, flags TEXT NOT NULL,
    computed_at TEXT NOT NULL,
    PRIMARY KEY (sexenio_idx, sector_id, category_id))
"""


def build(conn: sqlite3.Connection):
    """→ list of row tuples for category_sexenio_flows."""
    pf = {r[0] for r in conn.execute(f"SELECT id FROM vendors WHERE {pf_sql()}")}
    cell = defaultdict(lambda: [0, 0.0, 0])           # (e,s,k) → [n, money, n>10B]
    pool = defaultdict(lambda: [0, 0.0, 0])           # (e,s,k) → personas físicas [n, money, vendors]
    vend = defaultdict(list)                          # (e,s,k) → [(money, n, vid)]
    for e, s, k, vid, n, v, big in conn.execute(QUERY):
        c = cell[(e, s, k)]
        c[0] += n; c[1] += v; c[2] += big
        if vid is None:
            continue
        if vid in pf:
            p = pool[(e, s, k)]; p[0] += n; p[1] += v; p[2] += 1
        else:
            vend[(e, s, k)].append((v, n, vid))
    tops = {key: sorted(vs, reverse=True)[:TOP_VENDORS] for key, vs in vend.items()}
    ids = sorted({vid for t in tops.values() for _, _, vid in t})
    names = {}
    for i in range(0, len(ids), 900):
        chunk = ids[i:i + 900]
        names.update(conn.execute(f"SELECT id, name FROM vendors WHERE id IN ({','.join('?' * len(chunk))})", chunk).fetchall())
    # ranks inside (sexenio, sector): by money, and by contracts; ties broken by category id → contiguous
    rk_v, rk_n = {}, {}
    groups = defaultdict(list)
    for (e, s, k) in cell:
        groups[(e, s)].append(k)
    for (e, s), ks in groups.items():
        for i, k in enumerate(sorted(ks, key=lambda k: (-cell[(e, s, k)][1], k)), 1):
            rk_v[(e, s, k)] = i
        for i, k in enumerate(sorted(ks, key=lambda k: (-cell[(e, s, k)][0], k)), 1):
            rk_n[(e, s, k)] = i
    n2004 = conn.execute(
        f"SELECT COUNT(*) FROM contracts WHERE amount_mxn > 0 AND amount_mxn <= {MAX_CONTRACT_VALUE} AND {DATE} BETWEEN '2004-01-01' AND '2004-12-31'").fetchone()[0]
    flags = {0: f"estructura_a,anio_2004_ralo:{n2004}", 4: "parcial"}
    now = time.strftime("%Y-%m-%dT%H:%M:%S")
    rows = []
    for (e, s, k), (n, v, big) in cell.items():
        tv = [{"vendor_id": vid, "name": clean_name(names.get(vid)) or "", "money_mxn": round(m, 2), "contracts": c} for m, c, vid in tops.get((e, s, k), [])]
        p = pool.get((e, s, k))
        if p:
            tv.append({"vendor_id": None, "pooled": "personas_fisicas", "vendors": p[2], "money_mxn": round(p[1], 2), "contracts": p[0]})
        rows.append((SEXENIOS[e][1], e, s, k, round(v, 2), n, rk_v[(e, s, k)], rk_n[(e, s, k)], big,
                     json.dumps(tv, ensure_ascii=False, separators=(",", ":")), flags.get(e, ""), now))
    return rows


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", required=True)
    a = ap.parse_args()
    t0 = time.time()
    ro = sqlite3.connect(f"file:{a.db}?mode=ro", uri=True, timeout=120)
    rows = build(ro)
    undated = ro.execute(f"SELECT COUNT(*) FROM contracts WHERE amount_mxn > 0 AND amount_mxn <= {MAX_CONTRACT_VALUE} AND {DATE} IS NULL").fetchone()[0]
    ro.close()
    print(f"{len(rows)} cells, {undated} undated contracts left out, {time.time() - t0:.0f}s")
    # Lock-friendly write (other jobs share this DB): rows are computed above with no lock held;
    # the staging table fills in short batch commits; the swap is one short transaction.
    w = sqlite3.connect(a.db, timeout=600)
    w.execute("PRAGMA busy_timeout = 600000")
    with w:
        w.execute("DROP TABLE IF EXISTS category_sexenio_flows_new")
        w.execute(DDL)
    for i in range(0, len(rows), BATCH):
        with w:
            w.executemany("INSERT INTO category_sexenio_flows_new VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", rows[i:i + BATCH])
    with w:
        w.execute("DROP TABLE IF EXISTS category_sexenio_flows")
        w.execute("ALTER TABLE category_sexenio_flows_new RENAME TO category_sexenio_flows")
    w.close()
    print(f"category_sexenio_flows written, {time.time() - t0:.0f}s")


if __name__ == "__main__":
    main()
