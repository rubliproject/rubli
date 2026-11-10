#!/usr/bin/env python3
"""
Ship institution grades v3 to prod as a SQL dump (grading-v3 s.6.4).

The prod backend container cannot compute v3 (1.5 GB memory cap, no pandas), so
compute LOCALLY and ship the tables:

  1. compute v3 on the local DB with the FROZEN, owner-approved calibration
     (refuses a calibration without approved_by; never recalibrates);
  2. print the tier moves vs the grades currently in the local DB;
  3. write a gzipped SQL dump of the 3 v3 tables + the 3 lens tables
     (institution_category_signals, category_signal_baseline,
     institution_category_vendor_topn) + the 3 coverage tables when present
     (budget_ejercido_annual, budget_entity_institution_map,
     institution_coverage_v1) + institution_year_value when present. Each table: DROP, CREATE (original DDL),
     INSERTs, indexes, all inside ONE transaction;
  4. --ship only: write the v3 tables to the local DB first (local == prod),
     scp the dump to the VPS and load it with
     docker exec -i -w /app rubli-backend python -c LOADER /app/RUBLI_DEPLOY.db,
     then wal_checkpoint(TRUNCATE) and print row counts.

Without --ship this is a dry run: nothing is written to either DB.

    python -m scripts.ship_institution_grades_v3 --db D:/Python/yangwenli/backend/RUBLI_NORMALIZED.db
    python -m scripts.ship_institution_grades_v3 --db ... --ship     # lead / owner only
"""
import argparse
import gzip
import shlex
import sqlite3
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

try:
    from scripts import compute_institution_grades_v3 as g3
except ImportError:  # run as a plain file from backend/scripts
    import compute_institution_grades_v3 as g3

V3_TABLES = ["institution_grade_calibration", "institution_grades_v3", "institution_grade_ledger"]
LENS_TABLES = ["institution_category_signals", "category_signal_baseline",
               "institution_category_vendor_topn"]
# Cobertura CompraNet badge (coverage-badge.md, load_cuenta_publica.py); shipped when present.
COVERAGE_TABLES = ["budget_ejercido_annual", "budget_entity_institution_map", "institution_coverage_v1"]
# «Por pesos» Hallazgos + >10B flag (compute_institution_year_value.py); shipped when present.
PESOS_TABLES = ["institution_year_value"]
HOST = "root@37.60.232.109"
CONTAINER = "rubli-backend"
REMOTE_DB = "/app/RUBLI_DEPLOY.db"
BATCH = 500
Q = chr(39)  # SQL string quote

# Runs inside the container: SQL on stdin, argv = db path + tables to count.
# The dump carries BEGIN IMMEDIATE ... COMMIT, so the load is all-or-nothing.
LOADER = """
import sqlite3, sys
db, tables = sys.argv[1], sys.argv[2:]
c = sqlite3.connect(db, timeout=120)
c.execute("PRAGMA busy_timeout = 120000")
try:
    c.executescript(sys.stdin.buffer.read().decode("utf-8"))  # never the locale codec
except Exception:
    if c.in_transaction:
        c.execute("ROLLBACK")
    raise
print("wal_checkpoint", c.execute("PRAGMA wal_checkpoint(TRUNCATE)").fetchone())
for t in tables:
    print(t, c.execute("SELECT COUNT(*) FROM " + t).fetchone()[0])
c.close()
"""


def sql_literal(v):
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return str(int(v))
    if isinstance(v, int):
        return str(v)
    if isinstance(v, float):
        return "NULL" if v != v else repr(v)
    if isinstance(v, bytes):
        return "X" + Q + v.hex() + Q
    return Q + str(v).replace(Q, Q + Q) + Q


def dump_table(conn, table):
    """Yield DROP / CREATE / INSERT / CREATE INDEX statements for one table."""
    ddl = conn.execute("SELECT sql FROM sqlite_master WHERE type = ? AND name = ?",
                       ("table", table)).fetchone()
    if not ddl:
        raise SystemExit(f"table {table} missing in source DB")
    yield f"DROP TABLE IF EXISTS {table};"
    yield ddl[0] + ";"
    cur = conn.execute(f"SELECT * FROM {table}")
    while True:
        rows = cur.fetchmany(BATCH)
        if not rows:
            break
        values = ",".join("(" + ",".join(sql_literal(v) for v in r) + ")" for r in rows)
        yield f"INSERT INTO {table} VALUES {values};"
    for (sql,) in conn.execute("SELECT sql FROM sqlite_master WHERE type = ? "
                               "AND tbl_name = ? AND sql IS NOT NULL", ("index", table)):
        yield sql + ";"


def write_dump(path, sources):
    """sources: list of (connection, table). Writes one gzipped transaction."""
    # newline="\n": Windows text mode would turn \n inside values into CRLF
    with gzip.open(path, "wt", encoding="utf-8", newline="\n") as f:
        f.write("BEGIN IMMEDIATE;\n")
        for conn, table in sources:
            for stmt in dump_table(conn, table):
                f.write(stmt + "\n")
        f.write("COMMIT;\n")
    return path


def tier_moves(conn, grades):
    """Crosstab of current local grade -> recomputed grade."""
    try:
        cur = pd.read_sql("SELECT institution_id, grade FROM institution_grades_v3", conn)
    except Exception:
        cur = pd.DataFrame(columns=["institution_id", "grade"])
    m = grades[["institution_id", "grade"]].merge(cur, on="institution_id", how="outer",
                                                   suffixes=("_new", "_now"))
    ct = pd.crosstab(m.grade_now.fillna("(none)"), m.grade_new.fillna("(gone)"))
    moved = int((m.grade_now.notna() & m.grade_new.notna() & (m.grade_now != m.grade_new)).sum())
    return ct, moved, len(m)


def approved_calibration(conn):
    row = conn.execute("SELECT calibration_id, approved_by FROM institution_grade_calibration "
                       "ORDER BY created_at DESC LIMIT 1").fetchone()
    if not row or not row[1]:
        raise SystemExit("no owner-approved frozen calibration (approved_by is empty) - refusing")
    return row[0]


def extra_tables(conn):
    """Lens tables (required) + coverage and pesos tables (only those present locally)."""
    have = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type = ?", ("table",))}
    optional = COVERAGE_TABLES + PESOS_TABLES
    missing = [t for t in optional if t not in have]
    if missing:
        print(f"note: optional tables not in local DB, not shipped: {missing}")
    return LENS_TABLES + [t for t in optional if t in have]


def ship(dump, extra, host=HOST, container=CONTAINER, remote_db=REMOTE_DB):
    remote = f"/tmp/{dump.name}"
    subprocess.run(["scp", str(dump), f"{host}:{remote}"], check=True)
    tables = " ".join(V3_TABLES + extra)
    cmd = (f"gunzip -c {remote} | docker exec -i -w /app {container} python -c "
           f"{shlex.quote(LOADER)} {remote_db} {tables} && rm -f {remote}")
    subprocess.run(["ssh", host, cmd], check=True)


def main(argv=None):
    ap = argparse.ArgumentParser(description="Ship institution grades v3 (dry run unless --ship)")
    ap.add_argument("--db", default=str(g3.DB_PATH))
    ap.add_argument("--out", default=None, help="dump path (default: <db dir>/_ship/)")
    ap.add_argument("--ship", action="store_true", help="write local v3 tables, scp + load on prod")
    ap.add_argument("--host", default=HOST)
    args = ap.parse_args(argv)

    conn = sqlite3.connect(args.db, timeout=60)
    if not conn.execute("SELECT COUNT(*) FROM sqlite_master WHERE name = ?", ("contracts",)).fetchone()[0]:
        raise SystemExit(f"no contracts table in {args.db} (worktree stub DB?) - pass --db")
    cal_id = approved_calibration(conn)
    grades, ledger, cal = g3.compute(conn)
    if cal["is_new"] or cal["calibration_id"] != cal_id:
        raise SystemExit("compute did not use the frozen approved calibration - refusing")

    ct, moved, n = tier_moves(conn, grades)
    print(f"calibration {cal_id} | graded {len(grades)} | moved tier vs local: {moved} of {n}")
    print(ct.to_string())

    extra = extra_tables(conn)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out = Path(args.out) if args.out else Path(args.db).parent / "_ship" / f"grades_v3_{stamp}.sql.gz"
    out.parent.mkdir(parents=True, exist_ok=True)

    if args.ship:
        g3.write(conn, grades, ledger, cal)          # local == what prod receives
        conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        write_dump(out, [(conn, t) for t in V3_TABLES + extra])
    else:
        with tempfile.TemporaryDirectory(dir=out.parent) as tmp:
            stage = sqlite3.connect(Path(tmp) / "stage.db")
            stage.executescript(g3.SCHEMA)
            calrow = conn.execute("SELECT * FROM institution_grade_calibration "
                                  "WHERE calibration_id = ?", (cal_id,)).fetchone()
            marks = ",".join("?" * len(calrow))
            stage.execute(f"INSERT INTO institution_grade_calibration VALUES ({marks})", calrow)
            stage.commit()
            g3.write(stage, grades, ledger, cal)
            write_dump(out, [(stage, t) for t in V3_TABLES] + [(conn, t) for t in extra])
            stage.close()
    print(f"dump {out} ({out.stat().st_size / 1e6:.1f} MB)")

    if not args.ship:
        print("dry run: nothing written to any DB; re-run with --ship to load on prod")
        return 0
    ship(out, extra, host=args.host)
    return 0


if __name__ == "__main__":
    sys.exit(main())
