"""Load the machine-translated contract titles (D:/Python/_mt/titles_en.sqlite, docs/TITLE_TRANSLATION_2026-11-04.md §5)
into the serving DB's `contract_title_en` (same schema; keyed by sha1 of the exact Spanish title). Idempotent: INSERT OR
IGNORE, so a re-run only adds new titles. Does not touch `contracts`.

    python -m scripts.load_title_translations --src D:/Python/_mt/titles_en.sqlite --db backend/RUBLI_NORMALIZED.db
    # prod (after copying the file to the VPS): --src /tmp/titles_en.sqlite --db /app/data/RUBLI_DEPLOY.db
"""
import argparse
import os
import sqlite3
import sys

DDL = """CREATE TABLE IF NOT EXISTS contract_title_en (
    title_hash TEXT PRIMARY KEY, title_es TEXT NOT NULL, title_en TEXT NOT NULL,
    model TEXT NOT NULL, created_at TEXT NOT NULL) WITHOUT ROWID"""


def load(db: str, src: str) -> tuple[int, int]:
    """Returns (rows added, rows in the table after)."""
    if os.path.abspath(db) == os.path.abspath(src):
        raise ValueError("--src and --db are the same file")
    conn = sqlite3.connect(db, timeout=120)
    try:
        conn.execute(DDL)
        before = conn.execute("SELECT COUNT(*) FROM contract_title_en").fetchone()[0]
        conn.execute("ATTACH DATABASE ? AS mt", (src,))
        conn.execute("BEGIN IMMEDIATE")
        conn.execute("""INSERT OR IGNORE INTO main.contract_title_en (title_hash, title_es, title_en, model, created_at)
                        SELECT title_hash, title_es, title_en, model, created_at FROM mt.contract_title_en
                        WHERE TRIM(COALESCE(title_en, '')) <> ''""")
        conn.commit()
        conn.execute("DETACH DATABASE mt")
        after = conn.execute("SELECT COUNT(*) FROM contract_title_en").fetchone()[0]
        return after - before, after
    finally:
        conn.close()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default="D:/Python/_mt/titles_en.sqlite")
    ap.add_argument("--db", required=True)
    a = ap.parse_args()
    if not os.path.exists(a.src):
        sys.exit(f"source not found: {a.src}")
    added, total = load(a.db, a.src)
    print(f"contract_title_en: +{added} rows, {total} total")


if __name__ == "__main__":
    main()
