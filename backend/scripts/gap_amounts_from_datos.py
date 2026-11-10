"""/gap amounts switch to ComprasMX open data (owner 2026-10-20: "gap amounts should switch to
the ComprasMX, it's the way").

gap_contracts (one row per procedure) carried amount_mxn_best from OCR of award letters
('fallo_ocr' / 'estimated' / 'none'). comprasmx_contracts has a structured amount on every
contract. For every gap procedure matched by procedure number:
  amount_mxn_best   = SUM(amount_mxn) of its open-data contracts (amount_flag 'reject' /
                      'fx_missing' and sub-peso placeholders skipped; a sum > 100B is
                      rejected -> row left as it was)
  amount_source     = 'datos'
  amount_review_flag= 'over_10b_review' if that sum > 10B, else NULL
  vendor            = proveedor of the largest contract, only where vendor is NULL/empty and
                      never a persona fisica (vendor_match = 'persona_fisica')
amount_mxn_ocr preserves the previous amount_mxn_best (copied once, when the column is
created); amount_mxn_recovered is untouched. Unmatched rows keep value and source, and so do
procedure numbers that sit on more than one gap row (summing onto each would double count).
Afterwards re-run `python _comprasmx/grade_gap.py` (the grade reads amount_source/amount_best).

  python -m scripts.gap_amounts_from_datos [--db PATH] [--write]
"""
import argparse
import sqlite3
from collections import defaultdict
from pathlib import Path

DB = Path(__file__).resolve().parents[1] / "RUBLI_NORMALIZED.db"
MAX_VALID = 100_000_000_000
FLAG_THRESHOLD = 10_000_000_000
SKIP_FLAGS = ("reject", "fx_missing")
MIN_REAL_MXN = 1.0  # open-ended contracts publish placeholders (1e-06, 0.21 MXN): not an amount


def aggregate(rows):
    """rows: (amount_mxn, amount_flag, proveedor, vendor_match) -> (sum | None, vendor | None, flag | None)."""
    ok = [r for r in rows if r[0] is not None and r[0] >= MIN_REAL_MXN and r[1] not in SKIP_FLAGS]
    if not ok:
        return None, None, None
    total = sum(r[0] for r in ok)
    if total > MAX_VALID:
        return None, None, None
    top = max(ok, key=lambda r: r[0])
    vendor = None if top[3] == "persona_fisica" else ((top[2] or "").strip() or None)
    return total, vendor, ("over_10b_review" if total > FLAG_THRESHOLD else None)


def apply(conn, write=True):
    if "amount_mxn_ocr" not in {r[1] for r in conn.execute("PRAGMA table_info(gap_contracts)")}:
        conn.execute("ALTER TABLE gap_contracts ADD COLUMN amount_mxn_ocr TEXT")
        conn.execute("UPDATE gap_contracts SET amount_mxn_ocr = amount_mxn_best")
    by_proc = defaultdict(list)
    for num, *r in conn.execute("""SELECT numero_procedimiento, amount_mxn, amount_flag, proveedor, vendor_match
                                   FROM comprasmx_contracts WHERE COALESCE(numero_procedimiento, '') <> ''"""):
        by_proc[num].append(tuple(r))
    gap = conn.execute("SELECT rowid, procedure_number FROM gap_contracts "
                       "WHERE COALESCE(procedure_number, '') <> ''").fetchall()
    seen = defaultdict(int)
    for _, num in gap:
        seen[num] += 1
    upd, dup = [], 0
    for rowid, num in gap:
        if seen[num] > 1:  # one procedure on several gap rows: the sum would be counted twice
            dup += num in by_proc
            continue
        if num in by_proc:
            total, vendor, flag = aggregate(by_proc[num])
            if total is not None:
                upd.append((total, flag, vendor, rowid))
    conn.executemany("""UPDATE gap_contracts SET amount_mxn_best = ?, amount_source = 'datos',
                            amount_review_flag = ?,
                            vendor = CASE WHEN COALESCE(TRIM(vendor), '') = '' THEN ? ELSE vendor END
                        WHERE rowid = ?""", upd)
    if write:
        conn.commit()
    else:
        conn.rollback()
    return {"matched": len(upd), "skipped_duplicate_procedure_rows": dup}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=str(DB))
    ap.add_argument("--write", action="store_true")
    a = ap.parse_args()
    conn = sqlite3.connect(a.db, timeout=600)
    print(apply(conn, write=a.write), "written" if a.write else "(dry run, rolled back)")


if __name__ == "__main__":
    main()
