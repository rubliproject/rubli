"""Ship ground-truth edits from the curation DB (local RUBLI_NORMALIZED.db) to prod.

Source of truth = LOCAL. All GT curation (FP reviews, re-links, windows, evidence mining,
label_tier) happens in RUBLI_NORMALIZED.db; the deploy DB is built once and nothing else
pushes GT (memory gotcha_prod_gt_drift). Prod-only rows are reported, never auto-deleted.

Row-level diff by primary key over the columns both DBs share. Default = dry-run (prints the
diff, opens both DBs read-only). --apply writes the target in one transaction after copying
each touched table to _gtsync_<stamp>_<table>. Run schema migrations on the target first so
new columns (label_tier, exclude_from_training) exist; missing columns are reported.

    python -m scripts.gt_sync --source RUBLI_NORMALIZED.db --target /app/data/RUBLI_DEPLOY.db          # dry-run
    python -m scripts.gt_sync --source ... --target ... --apply [--delete]
"""
import argparse
import sqlite3
from collections import Counter
from datetime import datetime, timezone

GT_TABLES = ("ground_truth_cases", "ground_truth_vendors", "ground_truth_contracts",
             "ground_truth_institutions", "ground_truth_sources")


def _cols(conn, table):
    return [r[1] for r in conn.execute(f"PRAGMA table_info({table})")]


def _rows(conn, table, cols):
    sel = ", ".join(f'"{c}"' for c in cols)
    return {r[0]: r for r in conn.execute(f"SELECT {sel} FROM {table}")}


def diff(src, dst, tables=GT_TABLES):
    """{table: {cols, missing_in_target, insert, update, target_only}} (ids, sorted)."""
    out = {}
    for t in tables:
        scols, dcols = _cols(src, t), _cols(dst, t)
        if not scols or not dcols:
            out[t] = {"error": "table missing in " + ("source" if not scols else "target")}
            continue
        cols = ["id"] + [c for c in scols if c in dcols and c != "id"]
        s, d = _rows(src, t, cols), _rows(dst, t, cols)
        upd = sorted(i for i in set(s) & set(d) if s[i] != d[i])
        out[t] = {
            "cols": cols,
            "missing_in_target": [c for c in scols if c not in dcols],
            "insert": sorted(set(s) - set(d)),
            "update": upd,
            "changed_cols": dict(Counter(c for i in upd for c, a, b in zip(cols, s[i], d[i]) if a != b)),
            "target_only": sorted(set(d) - set(s)),
        }
    return out


def apply(src, dst, plan, delete=False):
    """Write the plan into dst in one transaction; backs up each touched table first."""
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    dst.isolation_level = None
    dst.execute("BEGIN IMMEDIATE")
    try:
        for t, p in plan.items():
            if "error" in p or not (p["insert"] or p["update"] or (delete and p["target_only"])):
                continue
            dst.execute(f"CREATE TABLE _gtsync_{stamp}_{t} AS SELECT * FROM {t}")
            cols = p["cols"]
            src_rows = _rows(src, t, cols)
            qcols = ", ".join(f'"{c}"' for c in cols)
            dst.executemany(f"INSERT INTO {t} ({qcols}) VALUES ({', '.join('?' * len(cols))})",
                            [src_rows[i] for i in p["insert"]])
            sets = ", ".join(f'"{c}"=?' for c in cols[1:])
            dst.executemany(f"UPDATE {t} SET {sets} WHERE id=?",
                            [src_rows[i][1:] + (i,) for i in p["update"]])
            if delete:
                dst.executemany(f"DELETE FROM {t} WHERE id=?", [(i,) for i in p["target_only"]])
        dst.execute("COMMIT")
    except Exception:
        dst.execute("ROLLBACK")
        raise
    return stamp


def _print(plan):
    for t, p in plan.items():
        if "error" in p:
            print(f"{t}: {p['error']}")
            continue
        print(f"{t}: insert {len(p['insert'])} | update {len(p['update'])} | target-only {len(p['target_only'])}"
              + (f" | columns missing in target: {p['missing_in_target']}" if p["missing_in_target"] else ""))
        if p["changed_cols"]:
            print(f"    changed columns: {p['changed_cols']}")
        for k in ("insert", "update", "target_only"):
            if p[k]:
                print(f"    {k} ids (first 20): {p[k][:20]}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", required=True, help="curation DB (local RUBLI_NORMALIZED.db)")
    ap.add_argument("--target", required=True, help="prod DB (back it up first)")
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--delete", action="store_true", help="also delete target-only rows")
    a = ap.parse_args()
    src = sqlite3.connect(f"file:{a.source}?mode=ro", uri=True)
    dst = sqlite3.connect(a.target if a.apply else f"file:{a.target}?mode=ro", uri=not a.apply, timeout=60)
    plan = diff(src, dst)
    _print(plan)
    if a.apply:
        print("applied; backups suffixed", apply(src, dst, plan, delete=a.delete))
    else:
        print("dry-run: nothing written")
