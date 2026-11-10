"""Load the PII-free award-letter ledger `gap_letters` (docs: gap-relevo spec § funnel).

The scraper's `fallos` table (`_comprasmx/comprasmx_gap.db`) holds the OCR'd letters,
including raw text, vendor names and personal RFCs — none of that ships. This copies
only the per-procedure reading status so /gap can print «award letters read».

    python -m scripts.load_gap_letters --src _comprasmx/comprasmx_gap.db --db backend/RUBLI_NORMALIZED.db

`--src` may also be a file that already holds a `gap_letters` table (the prod path:
build a small file locally, copy it over, load it in-container). Idempotent.
"""
import argparse
import sqlite3

COLS = "uuid_procedimiento, status, n_pages, ocr_chars, ts"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True)
    ap.add_argument("--db", required=True)
    a = ap.parse_args()
    db = sqlite3.connect(a.db)
    db.execute("ATTACH DATABASE ? AS src", (a.src,))
    src_table = "gap_letters" if db.execute(
        "SELECT 1 FROM src.sqlite_master WHERE type='table' AND name='gap_letters'").fetchone() else "fallos"
    db.execute("BEGIN")
    db.execute("DROP TABLE IF EXISTS main.gap_letters")
    db.execute("""CREATE TABLE main.gap_letters(uuid_procedimiento TEXT PRIMARY KEY, status TEXT,
                  n_pages INTEGER, ocr_chars INTEGER, ts TEXT)""")
    db.execute(f"INSERT INTO main.gap_letters SELECT {COLS} FROM src.{src_table}")
    db.commit()
    db.execute("DETACH DATABASE src")
    db.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    print(db.execute("SELECT status, COUNT(*) FROM gap_letters GROUP BY 1 ORDER BY 2 DESC").fetchall())


if __name__ == "__main__":
    main()
