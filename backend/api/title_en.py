"""English contract titles (docs/TITLE_TRANSLATION_2026-11-04.md §6): machine translations keyed by sha1 of the
exact stored Spanish title, in `contract_title_en` (loaded by scripts/load_title_translations.py).

Privacy: `title_en` only where the Spanish title is returned, and never for a persona física's contract — the
title can carry the person's name, and the translation mangles it (Guerrero → warrior). The Spanish title stays
the source of record; the frontend falls back to it.
"""
import hashlib
import sqlite3
from typing import Iterable, Optional

TABLE = "contract_title_en"


def title_hash(title: str) -> str:
    """Same key as scripts/translate_titles.title_hash."""
    return hashlib.sha1(title.encode("utf-8")).hexdigest()


def _has_table(conn: sqlite3.Connection) -> bool:
    return conn.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (TABLE,)).fetchone() is not None


def attach_title_en(conn: sqlite3.Connection, rows: Iterable[dict], pf_key: str = "vendor_is_individual") -> None:
    """Set row['title_en'] on every row (None when untranslated, the table is absent, or the vendor is a persona
    física — `pf_key` holds the is_persona_fisica verdict the services already compute). One PK lookup per page."""
    rows = list(rows)
    for r in rows:
        r["title_en"] = None
    want = {id(r): title_hash(r["title"]) for r in rows if r.get("title") and not r.get(pf_key)}
    if not want or not _has_table(conn):
        return
    keys = sorted(set(want.values()))
    found: dict[str, Optional[str]] = {}
    for k in range(0, len(keys), 900):
        chunk = keys[k:k + 900]
        found.update(conn.execute(
            f"SELECT title_hash, title_en FROM {TABLE} WHERE title_hash IN ({','.join('?' * len(chunk))})", chunk))
    for r in rows:
        h = want.get(id(r))
        if h:
            r["title_en"] = found.get(h)
