"""
precompute_sector_top_institutions.py

Pre-computes top-3 institutions per sector and stores them in precomputed_stats:
  sector_top_institutions            federal buyers (the default scope)
  sector_top_institutions:local      state + municipal buyers
  sector_top_institutions:all        every buyer
Institutions are CANONICAL ids (scripts/_institution_canonical.py); buyer scope is
institution_canonical.buyer_level (scripts/classify_buyer_scope.py). Without that
column only the legacy key is written, over every buyer. Eliminates a slow
12x sequential aggregation that took 80-110s on the cold contracts table.

Run once after ETL or whenever institution data changes.

Usage:
    python -m scripts.precompute_sector_top_institutions
"""

import sqlite3
import json
import time
import os
import sys
from pathlib import Path

try:
    from scripts._institution_canonical import install_contracts_canon
except ImportError:  # run as a plain script from backend/scripts
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from _institution_canonical import install_contracts_canon


def _resolve_db_path() -> Path:
    """Find whichever DB file actually exists. Prod uses RUBLI_DEPLOY.db,
    local dev uses RUBLI_NORMALIZED.db."""
    env = os.environ.get("DATABASE_PATH")
    if env:
        return Path(env)
    base = Path(__file__).resolve().parent.parent
    for name in ("RUBLI_NORMALIZED.db", "RUBLI_DEPLOY.db"):
        p = base / name
        if p.exists() and p.stat().st_size > 0:
            return p
    raise FileNotFoundError(f"No DB found at {base}/RUBLI_*.db")


MAX_CONTRACT_VALUE = 100_000_000_000  # 100B MXN reject threshold
SCOPE_LEVELS = {"federal": {"federal"}, "local": {"estatal", "municipal"}, "all": None}


def top3_by_scope(conn: sqlite3.Connection) -> dict:
    """{scope: {sector_id str: [top-3 {institution_id, name, siglas, value_mxn}]}}."""
    install_contracts_canon(conn)
    has_bl = any(r[1] == "buyer_level" for r in conn.execute("PRAGMA table_info(institution_canonical)"))
    rows = conn.execute(
        f"""
        SELECT c.sector_id, c.institution_id, SUM(c.amount_mxn) AS spend,
               {"k.buyer_level" if has_bl else "NULL"} AS lvl, i.name, i.siglas
        FROM contracts_canon c
        JOIN institutions i ON i.id = c.institution_id
        {"LEFT JOIN institution_canonical k ON k.institution_id = c.institution_id" if has_bl else ""}
        WHERE c.amount_mxn > 0 AND c.amount_mxn < ?
          AND c.sector_id IS NOT NULL AND c.institution_id IS NOT NULL
        GROUP BY c.sector_id, c.institution_id
        ORDER BY c.sector_id, spend DESC
        """,
        (MAX_CONTRACT_VALUE,),
    ).fetchall()
    out = {}
    for scope, levels in (SCOPE_LEVELS.items() if has_bl else [("all", None)]):
        by_sector: dict = {}
        for sid, iid, spend, lvl, name, siglas in rows:
            items = by_sector.setdefault(str(sid), [])
            if len(items) < 3 and (levels is None or lvl in levels):
                items.append({"institution_id": iid, "name": name, "siglas": siglas,
                              "value_mxn": float(spend or 0)})
        out[scope] = by_sector
    return out


def main() -> None:
    db_path = _resolve_db_path()
    print(f"DB: {db_path}")
    conn = sqlite3.connect(str(db_path), timeout=600)
    conn.execute("PRAGMA busy_timeout = 600000")

    t0 = time.time()
    print("Aggregating top-3 institutions per sector and buyer scope (one scan)...")
    payloads = top3_by_scope(conn)
    print(f"  query: {time.time() - t0:.1f}s · scopes {list(payloads)}")

    for scope, payload in payloads.items():
        # legacy key = the default scope (federal), or every buyer before the scope column exists
        key = "sector_top_institutions" if scope == "federal" or len(payloads) == 1 else f"sector_top_institutions:{scope}"
        conn.execute(
            """
            INSERT INTO precomputed_stats (stat_key, stat_value, updated_at)
            VALUES (?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT (stat_key) DO UPDATE SET
                stat_value = excluded.stat_value,
                updated_at = CURRENT_TIMESTAMP
            """,
            (key, json.dumps({**payload, "_scope": scope})),
        )
        print(f"  wrote {key} · sectors covered: {len(payload)}")
    conn.commit()
    print(f"  done · total time: {time.time() - t0:.1f}s")


if __name__ == "__main__":
    main()
