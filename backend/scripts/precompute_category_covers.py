"""Precompute every category dossier cover «El caudal» into precomputed_stats `category_cover:{id}`.

GET /categories/{id}/cover serves these rows; on prod's IO even the one-pass live build ran 45–60 s
cold (docs/LAUNCH_AUDIT_2026-10-30.md § B3). Same builder as the endpoint, so the JSON is identical.
Covers change only when the data does: the weekly ComprasMX job reruns this after the category chain.
All covers are built on a read connection first, then written in ONE short transaction.

    python -m scripts.precompute_category_covers --db PATH
"""
import argparse
import json
import sqlite3
import time

from fastapi import HTTPException

from api.routers import categories as C


def build(conn: sqlite3.Connection, ids=None) -> dict:
    """→ {category_id: cover JSON text}."""
    conn.row_factory = sqlite3.Row
    if ids is None:
        ids = [r[0] for r in conn.execute("SELECT id FROM categories ORDER BY id")]
    out = {}
    for cid in ids:
        try:
            out[cid] = json.dumps(C._build_category_cover(conn, cid), ensure_ascii=False)
        except HTTPException:  # category vanished between the two reads
            continue
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", required=True)
    db = ap.parse_args().db
    t = time.time()
    with sqlite3.connect(f"file:{db}?mode=ro", uri=True) as ro:
        covers = build(ro)
    print(f"built {len(covers)} covers in {time.time() - t:.1f}s", flush=True)
    w = sqlite3.connect(db, timeout=600)
    w.execute("PRAGMA busy_timeout = 600000")
    with w:  # one transaction: stale ids out, every cover in
        w.execute("CREATE TABLE IF NOT EXISTS precomputed_stats (stat_key TEXT PRIMARY KEY, stat_value TEXT, "
                  "updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)")
        w.execute("DELETE FROM precomputed_stats WHERE stat_key LIKE 'category_cover:%'")
        w.executemany("INSERT INTO precomputed_stats(stat_key, stat_value, updated_at) "
                      "VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%S','now'))",
                      [(f"category_cover:{k}", v) for k, v in covers.items()])
    w.close()
    print(f"wrote {len(covers)} rows; total {time.time() - t:.1f}s")


if __name__ == "__main__":
    main()
