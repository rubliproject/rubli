"""DQ1 § 5 — repair the «ý» mojibake in contract titles (mostly structure A, 2002–2010).

What it is (measured on the local DB, 2026-10-31): NOT a cp1252/latin-1 double decode.
Every non-ASCII letter of the source (á é í ó ú ñ ü Á É Í Ó Ú Ñ …) was replaced by ONE
character, U+00FD «ý», when the 2002–2010 files were converted. One char in, one char out,
so the information is lost («ý» can be ó, í, á, ñ …) and no codec round-trip can undo it.

Repair = dictionary, learned from the corpus itself: titles of structures B–E keep their
accents, so each accented word «adquisición» gives the key «adquisiciýn». A garbled word is
replaced only when its key has ONE dominant clean form (>= MIN_SHARE of >= MIN_COUNT
sightings); otherwise it is left as is (precision over recall). Case is copied char by char.

Data repair, reversible: the old titles go to `contract_title_repair_dq1` (id, title_before,
title_after) and contracts_fts (external content) is kept in sync.

  python -m scripts.dq1_title_mojibake --db X            # dry run: counts + precision on held-out titles
  python -m scripts.dq1_title_mojibake --db X --apply
  python -m scripts.dq1_title_mojibake --db X --rollback
"""
from __future__ import annotations

import argparse
import random
import re
import sqlite3
from collections import Counter, defaultdict

GARBLE = "ý"           # ý
WORD = re.compile(r"[^\W\d_]+")
MIN_COUNT, MIN_SHARE = 3, 0.9
BACKUP = "contract_title_repair_dq1"


def key_of(word: str) -> str:
    """Lower-case word with every non-ASCII letter replaced by ý — what the converter left."""
    return "".join(ch if ord(ch) < 128 else GARBLE for ch in word.lower())


def build_lexicon(titles) -> dict[str, str]:
    """Clean (accented) titles → {garbled key: clean lower-case word}, dominant forms only."""
    seen: dict[str, Counter] = defaultdict(Counter)
    for t in titles:
        if not t:
            continue
        for w in WORD.findall(t):
            lw = w.lower()
            if GARBLE in lw or lw.isascii():
                continue
            k = key_of(lw)
            if len(k) == len(lw):
                seen[k][lw] += 1
    lex = {}
    for k, c in seen.items():
        (best, n), total = c.most_common(1)[0], sum(c.values())
        if n >= MIN_COUNT and n / total >= MIN_SHARE:
            lex[k] = best
    return lex


def _case_like(src: str, clean: str) -> str:
    """Copy the garbled word's case; «ý» itself is lower-case, so an otherwise all-caps word
    (ADQUISICIýN) is all caps."""
    rest = src.replace(GARBLE, "").replace(GARBLE.upper(), "")
    if rest and rest.isupper():
        return clean.upper()
    return "".join(c.upper() if s.isupper() else c for s, c in zip(src, clean))


def repair(title: str | None, lex: dict[str, str]) -> str | None:
    if not title or GARBLE not in title.lower():
        return title

    def fix(m):
        w = m.group()
        if GARBLE not in w.lower():
            return w
        clean = lex.get(w.lower())
        return _case_like(w, clean) if clean and len(clean) == len(w) else w

    return WORD.sub(fix, title)


def garble(title: str) -> str:
    """Simulate the 2002–2010 converter on a clean title (for precision checks)."""
    return "".join(GARBLE if (ord(ch) >= 128 and ch.isalpha()) else ch for ch in title)


def precision(holdout, lex) -> dict:
    """Garble clean titles, repair them, score per garbled word."""
    fixed = right = left = 0
    for t in holdout:
        g, r = garble(t), repair(garble(t), lex)
        for wt, wg, wr in zip(WORD.findall(t), WORD.findall(g), WORD.findall(r)):
            if GARBLE not in wg.lower():
                continue
            if GARBLE in wr.lower():
                left += 1
            else:
                fixed += 1
                right += wr == wt
    return {"words_repaired": fixed, "correct": right, "left_garbled": left,
            "precision": right / fixed if fixed else None,
            "recall": fixed / (fixed + left) if fixed + left else None}


def _clean_titles(conn, limit=None):
    lim = f" LIMIT {int(limit)}" if limit else ""
    return [t for (t,) in conn.execute(
        "SELECT title FROM contracts WHERE source_structure <> 'A' AND title IS NOT NULL "
        f"AND title GLOB '*[^ -~]*' AND title NOT LIKE '%' || char(253) || '%'{lim}")]


def _garbled(conn):
    return conn.execute("SELECT id, title FROM contracts WHERE title LIKE '%' || char(253) || '%'").fetchall()


def _has(conn, name):
    return conn.execute("SELECT 1 FROM sqlite_master WHERE name = ?", (name,)).fetchone() is not None


def plan(conn, sample_seed=7):
    clean = _clean_titles(conn)
    random.Random(sample_seed).shuffle(clean)
    cut = min(20_000, len(clean) // 10)
    lex_eval = build_lexicon(clean[cut:])
    stats = precision(clean[:cut], lex_eval)
    lex = build_lexicon(clean)
    rows = _garbled(conn)
    changes = [(i, t, r) for i, t in rows if (r := repair(t, lex)) != t]
    still = sum(GARBLE in r.lower() for _, _, r in changes) + (len(rows) - len(changes))
    return lex, rows, changes, still, stats


def apply(conn, changes):
    fts = _has(conn, "contracts_fts")
    with conn:
        conn.execute(f"CREATE TABLE IF NOT EXISTS {BACKUP} (id INTEGER PRIMARY KEY, title_before TEXT, title_after TEXT, "
                     "repaired_at TEXT DEFAULT CURRENT_TIMESTAMP)")
        done = {i for (i,) in conn.execute(f"SELECT id FROM {BACKUP}")}
        todo = [c for c in changes if c[0] not in done]
        conn.executemany(f"INSERT INTO {BACKUP} (id, title_before, title_after) VALUES (?,?,?)", todo)
        conn.executemany("UPDATE contracts SET title = ? WHERE id = ?", [(r, i) for i, _, r in todo])
        if fts:
            conn.executemany("INSERT INTO contracts_fts(contracts_fts, rowid, title) VALUES('delete', ?, ?)",
                             [(i, t or "") for i, t, _ in todo])
            conn.executemany("INSERT INTO contracts_fts(rowid, title) VALUES(?, ?)", [(i, r) for i, _, r in todo])
    return len(todo)


def rollback(conn):
    if not _has(conn, BACKUP):  # never applied (or already rolled back) → clean no-op
        return 0
    fts = _has(conn, "contracts_fts")
    rows = conn.execute(f"SELECT id, title_before, title_after FROM {BACKUP}").fetchall()
    with conn:
        conn.executemany("UPDATE contracts SET title = ? WHERE id = ?", [(b, i) for i, b, _ in rows])
        if fts:
            conn.executemany("INSERT INTO contracts_fts(contracts_fts, rowid, title) VALUES('delete', ?, ?)",
                             [(i, a or "") for i, _, a in rows])
            conn.executemany("INSERT INTO contracts_fts(rowid, title) VALUES(?, ?)", [(i, b or "") for i, b, _ in rows])
        conn.execute(f"DROP TABLE {BACKUP}")
    return len(rows)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--db", required=True)
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--rollback", action="store_true")
    ap.add_argument("--examples", type=int, default=0, help="print N before/after pairs")
    a = ap.parse_args()
    conn = (sqlite3.connect(a.db, timeout=600) if a.apply or a.rollback
            else sqlite3.connect(f"file:{a.db}?mode=ro", uri=True))
    if a.rollback:
        n = rollback(conn)
        print(f"rolled back {n:,} titles" if n else "nothing to roll back")
        return
    lex, rows, changes, still, stats = plan(conn)
    print(f"lexicon {len(lex):,} keys · garbled titles {len(rows):,} · repaired {len(changes):,} "
          f"· still containing ý after repair {still:,}")
    print(f"held-out precision (garbled clean titles): {stats}")
    for i, t, r in changes[:a.examples]:
        print(f"  {i}: {t[:90]!r}\n      → {r[:90]!r}")
    if a.apply:
        print(f"applied {apply(conn, changes):,} (backup table {BACKUP})")


if __name__ == "__main__":
    main()
