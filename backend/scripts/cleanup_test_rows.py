"""Remove rows the pytest suite wrote into a real RUBLI database.

Before weekend #9 the suite ran against RUBLI_NORMALIZED.db with no isolation,
so every run left fixture rows behind (and they shipped to prod with the DB).
Rows are matched by fixture marker ONLY — the exact emails / names / payloads
the tests use — never by date or id range.

    python -m scripts.cleanup_test_rows --db PATH              # dry run (default)
    python -m scripts.cleanup_test_rows --db PATH --apply      # backup JSON + delete
    python -m scripts.cleanup_test_rows --db PATH --rollback BACKUP.json

The backup is written next to the DB before anything is deleted; --rollback
re-inserts exactly those rows (same ids).
"""
from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from datetime import datetime
from pathlib import Path

# conftest.authed_client → test_<8 hex>@example.com; test_auth_guards → admin_<8 hex>@example.com
_FIXTURE_USERS = (
    "SELECT id FROM users WHERE email GLOB 'test_[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]@example.com' "
    "OR email GLOB 'admin_[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]@example.com'"
)
# test_workspace_dossier.py payloads; ownerless rows predate the user_id column.
_FIXTURE_DOSSIERS = f"""
    SELECT id FROM investigation_dossiers
    WHERE user_id IN ({_FIXTURE_USERS})
       OR (user_id IS NULL AND (
            (name = 'Test Dossier' AND description = 'test')
         OR (name IN ('Get Test', 'Update Me', 'Updated', 'Items Test', 'Delete Me', 'Bad')
             AND description IS NULL)))
"""
_FIXTURE_WATCHLIST = (
    "SELECT id FROM watchlist_items WHERE item_type = 'vendor' "
    "AND reason IN ('Test monitoring', 'Test watchlist item')"
)
_FIXTURE_FOLDERS = (
    "SELECT id FROM investigation_folders "
    "WHERE description IN ('Created by test suite', 'Created by automated test') "
    "OR (description IS NULL AND name IN ('Lifecycle Test', 'Updated Name'))"
)

# (table, marker column shown in the listing, WHERE clause) — children first.
TARGETS = [
    ("dossier_items", "item_name", f"dossier_id IN ({_FIXTURE_DOSSIERS})"),
    ("investigation_dossiers", "name", f"id IN ({_FIXTURE_DOSSIERS})"),
    ("users", "email", f"id IN ({_FIXTURE_USERS})"),
    ("investigation_folder_items", "folder_id",
     f"folder_id IN ({_FIXTURE_FOLDERS}) OR watchlist_item_id IN ({_FIXTURE_WATCHLIST})"),
    ("investigation_folders", "name", f"id IN ({_FIXTURE_FOLDERS})"),
    ("watchlist_items", "reason", f"id IN ({_FIXTURE_WATCHLIST})"),
    ("user_issues", "subject", """(subject, description) IN (
        VALUES ('Test bug report', 'This is an automated test submission.'),
               ('Wrong vendor name', 'Vendor ABC appears duplicated.'),
               ('Add export button', 'Please add CSV export.'),
               ('Test', 'Test.'),
               ('Status test', 'Testing status update.'),
               ('Resolve test', 'Testing resolution.'))"""),
    ("risk_feedback", "entity_id",
     "(entity_type = 'vendor' AND entity_id IN (99999, 99998, 99997)) "
     "OR (entity_type = 'institution' AND entity_id = 88888)"),
    ("procurement_scandals", "slug", "slug IN ('test-case-alpha', 'test-case-beta')"),
    ("ground_truth_vendors", "vendor_name_source",
     "vendor_id = 999 AND vendor_name_source = 'VENDOR TEST SA DE CV'"),
]


def _tables(conn) -> set[str]:
    return {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}


def collect(conn) -> dict[str, list[dict]]:
    existing = _tables(conn)
    out = {}
    for table, _, where in TARGETS:
        if table not in existing:
            continue
        out[table] = [dict(r) for r in conn.execute(f"SELECT * FROM {table} WHERE {where}")]
    return out


def print_listing(rows: dict[str, list[dict]]) -> None:
    marker = {t: m for t, m, _ in TARGETS}
    for table, items in rows.items():
        print(f"{table}: {len(items)} row(s)")
        for r in items:
            print(f"    id={r.get('id')}  {marker[table]}={r.get(marker[table])!r}")


def apply(conn, db: Path) -> None:
    rows = collect(conn)
    print_listing(rows)
    total = sum(len(v) for v in rows.values())
    if not total:
        print("Nothing to delete.")
        return
    backup = db.with_name(f"{db.name}.cleanup_test_rows_{datetime.now():%Y%m%d_%H%M%S}.json")
    backup.write_text(json.dumps(rows, default=str), encoding="utf-8")
    print(f"Backup: {backup}")
    try:
        conn.execute("BEGIN IMMEDIATE")
        for table, _, _ in TARGETS:
            ids = [r["id"] for r in rows.get(table, [])]
            for i in range(0, len(ids), 500):
                chunk = ids[i:i + 500]
                conn.execute(f"DELETE FROM {table} WHERE id IN ({','.join('?' * len(chunk))})", chunk)
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise
    print(f"Deleted {total} row(s). Undo: --rollback {backup}")


def rollback(conn, backup: Path) -> None:
    rows = json.loads(backup.read_text(encoding="utf-8"))
    try:
        conn.execute("BEGIN IMMEDIATE")
        # parents first (reverse of delete order)
        for table, _, _ in reversed(TARGETS):
            for r in rows.get(table, []):
                cols = list(r)
                conn.execute(
                    f"INSERT OR IGNORE INTO {table} ({','.join(cols)}) VALUES ({','.join('?' * len(cols))})",
                    [r[c] for c in cols],
                )
            print(f"{table}: restored {len(rows.get(table, []))} row(s)")
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--db", required=True, type=Path)
    g = ap.add_mutually_exclusive_group()
    g.add_argument("--apply", action="store_true")
    g.add_argument("--rollback", type=Path, metavar="BACKUP.json")
    args = ap.parse_args()
    if not args.db.exists():
        print(f"DB not found: {args.db}", file=sys.stderr)
        return 1
    conn = sqlite3.connect(str(args.db), timeout=60, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA busy_timeout = 60000")
    if args.rollback:
        rollback(conn, args.rollback)
    elif args.apply:
        apply(conn, args.db)
    else:
        rows = collect(conn)
        print_listing(rows)
        print(f"DRY RUN — {sum(len(v) for v in rows.values())} row(s) would be deleted. Re-run with --apply.")
    conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
