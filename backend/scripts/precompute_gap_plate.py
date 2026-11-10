"""Persist the /gap «La placa» payload into precomputed_stats (key 'slow:gap/plate').

    python -m scripts.precompute_gap_plate --db RUBLI_NORMALIZED.db [--write]

The handler (api/routers/gap.py plate_payload) reads it back and computes live only when the
key is missing (a ~5 s scan of gap_contracts on a cold disk). Without --write it prints the
payload size and totals and writes nothing. Re-run after any gap_contracts load or amount change.
"""
import argparse
import gzip
import json
import sqlite3
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=str(Path(__file__).resolve().parents[1] / "RUBLI_NORMALIZED.db"))
    ap.add_argument("--write", action="store_true")
    a = ap.parse_args()
    from api import persisted
    from api.routers.gap import _compute_plate
    src = sqlite3.connect(f"file:{a.db}?mode=ro", uri=True)
    src.row_factory = sqlite3.Row
    t0 = time.time()
    payload = _compute_plate(src)
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    m = payload["meta"]
    assert m["n"] == sum(b["n"] for b in payload["buckets"]) == sum(d["n"] for d in payload["doors"])
    assert sum(payload["marks"]["c"]) == m["n"]
    print(f"computed in {time.time() - t0:.1f}s · {m['n']:,} awards · {len(payload['marks']['c']):,} marks · "
          f"{len(body) / 1024:.0f} KB raw · {len(gzip.compress(body.encode())) / 1024:.0f} KB gzip")
    if not a.write:
        print("dry run: nothing written (pass --write)")
        return
    src.close()
    # computed above on a read-only handle; the write is one short transaction (other jobs share the DB)
    with sqlite3.connect(a.db, timeout=600) as w:
        w.execute("PRAGMA busy_timeout=600000")
        w.execute("INSERT OR REPLACE INTO precomputed_stats(stat_key, stat_value, updated_at) "
                  "VALUES (?, ?, datetime('now'))", (persisted.stat_key("gap/plate"), body))
    print("written", persisted.stat_key("gap/plate"))


if __name__ == "__main__":
    main()
