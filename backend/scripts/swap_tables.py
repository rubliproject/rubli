"""Swap precomputed tables in a target DB for the versions built in a side DB (--out-db runs).

    python -m scripts.swap_tables --target DB --source OUT.db --tables t1,t2 [--stat-keys k1,k2] [--dry-run]
    python -m scripts.swap_tables --target DB --tables t1,t2 --rollback

For each table, in ONE transaction: copy the current rows to _<table>_backup_<suffix>,
then replace them with the source's rows. Schema and indexes of the target table are
kept; the column sets must match or nothing is written. precomputed_stats is a
key/value store shared with other scripts, so only the --stat-keys rows are replaced.
--rollback restores every table from its backup and drops the backup.
Refuses to run if a backup already exists (a second swap would overwrite the real one).
"""
import argparse
import sqlite3
import sys
from pathlib import Path

MAX_CONTRACT_VALUE = 100_000_000_000  # 100B MXN — reject above (data-validation rule)
AMOUNT_COLS = ("total_value_mxn", "total_amount_mxn", "amount_mxn")
KV_TABLE, KV_COL = "precomputed_stats", "stat_key"


def cols(conn, schema, table):
    return [r[1] for r in conn.execute(f'PRAGMA {schema}.table_info("{table}")')]


def exists(conn, schema, name):
    return conn.execute(f"SELECT 1 FROM {schema}.sqlite_master WHERE type='table' AND name=?", (name,)).fetchone()


def kv_filter(table, keys):
    if table != KV_TABLE:
        return "", []
    if not keys:
        sys.exit(f"{KV_TABLE} needs --stat-keys (it holds other scripts' keys too)")
    return f" WHERE {KV_COL} IN ({','.join('?' * len(keys))})", keys


def check(conn, tables, keys, backup):
    """Validate everything before any write; return the per-table plan lines."""
    lines = []
    for t in tables:
        if not exists(conn, "main", t) or not exists(conn, "new", t):
            sys.exit(f"{t}: missing in target or source")
        if exists(conn, "main", backup(t)):
            sys.exit(f"{t}: {backup(t)} already exists — roll back or drop it first")
        tc, sc = cols(conn, "main", t), cols(conn, "new", t)
        if set(tc) != set(sc):
            sys.exit(f"{t}: column mismatch target-only={sorted(set(tc) - set(sc))} "
                     f"source-only={sorted(set(sc) - set(tc))}")
        where, params = kv_filter(t, keys)
        for col in AMOUNT_COLS:
            if col in sc:
                # Aggregate tables (vendor_stats, ...) legitimately sum past 100B; refuse only
                # when the swap would ADD rows over the ceiling (a new decimal-error outlier).
                q = f'SELECT COUNT(*) FROM {{}}."{t}" WHERE {col} > ?'
                n = conn.execute(q.format("new"), (MAX_CONTRACT_VALUE,)).fetchone()[0]
                had = conn.execute(q.format("main"), (MAX_CONTRACT_VALUE,)).fetchone()[0] if col in tc else 0
                if n > had:
                    sys.exit(f"{t}: {n} rows with {col} > 100B MXN in source (target has {had}) — refusing")
        old = conn.execute(f'SELECT COUNT(*) FROM main."{t}"{where}', params).fetchone()[0]
        new = conn.execute(f'SELECT COUNT(*) FROM new."{t}"{where}', params).fetchone()[0]
        if t != KV_TABLE and new == 0:
            sys.exit(f"{t}: source table is empty — refusing")
        lines.append(f"{t}: {old:,} -> {new:,} rows{' (keys: ' + ','.join(keys) + ')' if where else ''}")
    return lines


def swap(conn, tables, keys, backup):
    conn.execute("BEGIN IMMEDIATE")
    try:
        for t in tables:
            where, params = kv_filter(t, keys)
            c = ", ".join(f'"{x}"' for x in cols(conn, "new", t))
            conn.execute(f'CREATE TABLE main."{backup(t)}" AS SELECT * FROM main."{t}"')
            conn.execute(f'DELETE FROM main."{t}"{where}', params)
            conn.execute(f'INSERT INTO main."{t}" ({c}) SELECT {c} FROM new."{t}"{where}', params)
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise


def rollback(conn, tables, backup):
    for t in tables:
        if not exists(conn, "main", backup(t)):
            sys.exit(f"{t}: no {backup(t)} to roll back from")
    conn.execute("BEGIN IMMEDIATE")
    try:
        for t in tables:
            c = ", ".join(f'"{x}"' for x in cols(conn, "main", backup(t)))
            conn.execute(f'DELETE FROM main."{t}"')
            conn.execute(f'INSERT INTO main."{t}" ({c}) SELECT {c} FROM main."{backup(t)}"')
            conn.execute(f'DROP TABLE main."{backup(t)}"')
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--target", required=True, help="DB to modify (source or prod)")
    p.add_argument("--source", help="side DB holding the new tables (required unless --rollback)")
    p.add_argument("--tables", required=True, help="comma-separated table names")
    p.add_argument("--stat-keys", default="", help=f"{KV_TABLE} keys to replace (comma-separated)")
    p.add_argument("--suffix", default="20261003", help="backup table = _<table>_backup_<suffix>")
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--rollback", action="store_true")
    a = p.parse_args(argv)
    tables = [t.strip() for t in a.tables.split(",") if t.strip()]
    keys = [k.strip() for k in a.stat_keys.split(",") if k.strip()]
    backup = lambda t: f"_{t}_backup_{a.suffix}"  # noqa: E731

    target = Path(a.target).resolve().as_posix()
    mode = "?mode=ro" if a.dry_run else ""
    conn = sqlite3.connect(f"file:{target}{mode}", uri=True, timeout=120, isolation_level=None)
    conn.execute("PRAGMA busy_timeout = 120000")
    try:
        run(conn, a, tables, keys, backup)
    finally:
        conn.close()


def run(conn, a, tables, keys, backup):
    if a.rollback:
        if a.dry_run:
            for t in tables:
                print(f"{t}: backup {'present' if exists(conn, 'main', backup(t)) else 'MISSING'}")
            return
        rollback(conn, tables, backup)
        print(f"rolled back {', '.join(tables)}")
    else:
        if not a.source:
            sys.exit("--source is required")
        conn.execute("ATTACH DATABASE ? AS new", (f"file:{Path(a.source).resolve().as_posix()}?mode=ro",))
        for line in check(conn, tables, keys, backup):
            print(line)
        if a.dry_run:
            print("dry run: nothing written")
            return
        swap(conn, tables, keys, backup)
        conn.execute("DETACH DATABASE new")
        print(f"swapped {', '.join(tables)}; backups _<table>_backup_{a.suffix}")
    # prod mounts the DB as a single file: fold the WAL back in
    print("wal_checkpoint:", conn.execute("PRAGMA wal_checkpoint(TRUNCATE)").fetchone())


if __name__ == "__main__":
    main()
