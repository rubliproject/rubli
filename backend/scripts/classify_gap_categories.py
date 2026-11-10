"""
classify_gap_categories.py — give the post-CompraNet `gap_contracts` rows the same
spending category as the legacy corpus, so El Anaquel / Categorías / dossiers get a
post-Sep-2025 slice (owner decision 2026-10-16, handoff § Owner decisions, end of session).

Same two layers as `contracts`, same code paths, so the two corpora never drift:
  1. title/description regex  -> classify_categories.classify_text   (category_source 'regex'/'fallback')
  2. official CUCOP code       -> cucop_catalog.parse_partida(cucop_primary) overrides a weak
     regex label exactly like cucop_classify.apply_cucop            (category_source 'cucop')

Writes ONLY gap_contracts.category_id / category_source (adds the columns if missing).
gap rows never enter model training; this is display/aggregation only.

Run from backend/:
    python -m scripts.classify_gap_categories --db D:/Python/yangwenli/backend/RUBLI_NORMALIZED.db
    python -m scripts.classify_gap_categories --db ... --dry
"""
import argparse
import sqlite3
import time
from pathlib import Path

from scripts.classify_categories import classify_text
from scripts.cucop_catalog import CATCH_ALL_CATEGORIES, parse_partida
from scripts.cucop_classify import AUTHORITATIVE_GENERICAS, OVERRIDABLE_CATEGORIES

DB_PATH = Path(__file__).parent.parent / "RUBLI_NORMALIZED.db"


def classify_row(title, description, sector_id, cucop_primary):
    """-> (category_id, source). Pure; the one place both layers meet."""
    sid = int(sector_id) if sector_id not in (None, "") else None
    cat, src = classify_text(title, description, sid)
    p = parse_partida(cucop_primary) if cucop_primary else None
    if p:
        weak = cat in OVERRIDABLE_CATEGORIES or src == "fallback"
        if (p["category_id"] not in CATCH_ALL_CATEGORIES and p["category_id"] != cat
                and (weak or p["generica"] in AUTHORITATIVE_GENERICAS)):
            return p["category_id"], "cucop"
    return cat, src


def run(db_path, dry=False):
    conn = sqlite3.connect(str(db_path))
    conn.execute("PRAGMA busy_timeout = 120000")
    cur = conn.cursor()
    cols = {r[1] for r in cur.execute("PRAGMA table_info(gap_contracts)")}
    if not dry:
        for col, decl in (("category_id", "INTEGER"), ("category_source", "TEXT")):
            if col not in cols:
                cur.execute(f"ALTER TABLE gap_contracts ADD COLUMN {col} {decl}")
        cur.execute("CREATE INDEX IF NOT EXISTS ix_gap_category ON gap_contracts(category_id)")
        conn.commit()

    t0 = time.time()
    rows = cur.execute("""SELECT uuid_procedimiento, title, description, sector_id, cucop_primary
                          FROM gap_contracts""").fetchall()
    out, by_src, by_cat = [], {}, {}
    for uuid, title, desc, sid, cucop in rows:
        cat, src = classify_row(title, desc, sid, cucop)
        out.append((cat, src, uuid))
        by_src[src] = by_src.get(src, 0) + 1
        by_cat[cat] = by_cat.get(cat, 0) + 1
    print(f"classified {len(out):,} gap rows in {time.time() - t0:.1f}s")
    print("  by source:", " · ".join(f"{k} {v:,}" for k, v in sorted(by_src.items(), key=lambda x: -x[1])))
    names = dict(cur.execute("SELECT id, name_es FROM categories"))
    top = sorted(by_cat.items(), key=lambda x: -x[1])[:12]
    print("  top categories:", " · ".join(f"{names.get(c, c)} {n:,}" for c, n in top))
    print(f"  unclassified (89): {by_cat.get(89, 0):,} ({100 * by_cat.get(89, 0) / max(len(out), 1):.1f}%)")
    if dry:
        print("[--dry] no writes")
        return
    cur.executemany("UPDATE gap_contracts SET category_id=?, category_source=? WHERE uuid_procedimiento=?", out)
    conn.commit()
    conn.close()
    print("written")


def demo():
    """Smallest check that fails if either layer breaks."""
    cat, src = classify_row("ADQUISICION DE MEDICAMENTOS", None, 1, None)
    assert cat == 20 and src == "regex", (cat, src)
    # weak regex label + specific CUCOP -> official code wins
    cat, src = classify_row("SERVICIO INTEGRAL", None, 12, "22104-0039")
    assert src == "cucop" and cat == parse_partida("22104")["category_id"], (cat, src)
    # specific regex label beats a non-authoritative CUCOP code
    cat, src = classify_row("ADQUISICION DE MEDICAMENTOS", None, 1, "22104-0039")
    assert (cat, src) == (20, "regex"), (cat, src)
    print("demo ok")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=str(DB_PATH))
    ap.add_argument("--dry", action="store_true")
    ap.add_argument("--demo", action="store_true")
    a = ap.parse_args()
    if a.demo:
        demo()
    else:
        run(a.db, dry=a.dry)
