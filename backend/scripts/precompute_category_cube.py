"""precomputed_stats['category_cube'] — category × buyer sector × sexenio, for the /categories filters (TEAL-4, owner
2026-11-05: «the same filtering we did in ARIA … in which administration, in which sector»).

One GROUP BY over contracts. Each row: [category_id, sector_id, sexenio_key, contracts, value_mxn, direct_award_count,
procedure_known_count]. Same register and same «sin concurso» rule as category_stats (compute_category_stats.py): the
public register (PUBLIC_REGISTER_SQL) and the direct-award share counted only where the procedure is coded
(proc_known / proc_den, year ≥ 2011), so a box keeps its height whether or not a filter is on (SILVER 11-05).
Sexenio by contract year, the site-wide convention (lib/administrations.ts): fox ≤2006 · calderon 2007–12 · epn 2013–18 ·
amlo 2019–24 · sheinbaum ≥2025.

    cd backend && python -m scripts.precompute_category_cube [--db PATH]
"""
import argparse
import sys
import json
import os
import sqlite3
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from api.config.constants import PUBLIC_REGISTER_SQL, proc_known  # noqa: E402

DB_DEFAULT = Path(os.environ.get("DATABASE_PATH") or Path(__file__).parent.parent / "RUBLI_NORMALIZED.db")
SEXENIO_SQL = """CASE WHEN contract_year <= 2006 THEN 'fox' WHEN contract_year <= 2012 THEN 'calderon'
  WHEN contract_year <= 2018 THEN 'epn' WHEN contract_year <= 2024 THEN 'amlo' ELSE 'sheinbaum' END"""


def build(conn: sqlite3.Connection) -> list[list]:
    rows = conn.execute(f"""
        SELECT category_id, COALESCE(sector_id, 12), {SEXENIO_SQL} AS sx,
               COUNT(*), SUM(amount_mxn),
               SUM(CASE WHEN {proc_known('is_direct_award')} = 1 THEN 1 ELSE 0 END),
               COUNT({proc_known('is_direct_award')})
        FROM contracts
        WHERE category_id IS NOT NULL AND {PUBLIC_REGISTER_SQL}
        GROUP BY 1, 2, 3
    """).fetchall()
    return [[c, s, x, n, round(v or 0, 2), da or 0, kn or 0] for c, s, x, n, v, da, kn in rows]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=str(DB_DEFAULT))
    a = ap.parse_args()
    conn = sqlite3.connect(a.db, timeout=120)
    conn.execute("PRAGMA busy_timeout=120000")
    rows = build(conn)
    payload = json.dumps({"columns": ["category_id", "sector_id", "sexenio", "contracts", "value", "direct", "known"], "rows": rows})
    with conn:
        conn.execute("INSERT OR REPLACE INTO precomputed_stats (stat_key, stat_value, updated_at) VALUES ('category_cube', ?, CURRENT_TIMESTAMP)", (payload,))
    print(f"category_cube: {len(rows)} rows, {len(payload) // 1024} KB")
    conn.close()


if __name__ == "__main__":
    main()
