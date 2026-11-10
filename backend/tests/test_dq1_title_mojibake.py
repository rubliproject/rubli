"""DQ1 § 5 — «ý» mojibake in 2002–2010 titles: lossy one-char substitution, repaired by corpus lexicon."""
import json
import sqlite3
from pathlib import Path

import pytest

from scripts import dq1_title_mojibake as M

pytestmark = pytest.mark.no_db

FIX = json.loads((Path(__file__).parent / "fixtures" / "dq1_mojibake_50.json").read_text(encoding="utf-8"))


def test_50_real_titles_reviewed():
    """50 random garbled structure-A titles (prod copy, seed 31), outputs reviewed by hand 2026-11-02."""
    assert len(FIX["examples"]) == 50
    for _id, garbled, expected in FIX["examples"]:
        assert M.repair(garbled, FIX["lexicon"]) == expected, _id
    left = sum(M.GARBLE in e.lower() for _, _, e in FIX["examples"])
    assert left <= 3                                   # ambiguous tokens (standalone «ý», typos) stay as they were


def test_key_case_and_ambiguity():
    lex = M.build_lexicon(["Adquisición de equipo"] * 3 + ["papelería"] * 3 + ["más"] * 3 + ["mas"] + ["mús"] * 3)
    assert M.key_of("Adquisición") == "adquisiciýn"
    assert M.repair("ADQUISICIýN Y PAPELERýA", lex) == "ADQUISICIÓN Y PAPELERÍA"
    assert M.repair("Adquisiciýn", lex) == "Adquisición"
    assert M.repair("mýs", lex) == "mýs"              # «más» vs «mús» → no dominant form, left alone
    assert M.repair("plain ascii", lex) == "plain ascii"
    assert M.garble("Pública") == "Pýblica"


def test_apply_rollback_keeps_fts_in_sync():
    c = sqlite3.connect(":memory:")
    c.executescript("""
        CREATE TABLE contracts (id INTEGER PRIMARY KEY, source_structure TEXT, title TEXT);
        CREATE VIRTUAL TABLE contracts_fts USING fts5(title, content='contracts', content_rowid='id', tokenize='unicode61');
        INSERT INTO contracts VALUES (1, 'A', 'Adquisiciýn de equipo'), (2, 'B', 'Adquisición de equipo'),
          (3, 'B', 'Adquisición de bienes'), (4, 'B', 'Adquisición de vehículos');
        INSERT INTO contracts_fts(rowid, title) SELECT id, title FROM contracts;
    """)
    lex, rows, changes, still, _ = M.plan(c)
    assert changes == [(1, "Adquisiciýn de equipo", "Adquisición de equipo")] and still == 0
    assert M.apply(c, changes) == 1 and M.apply(c, changes) == 0
    hits = lambda q: [r for (r,) in c.execute("SELECT rowid FROM contracts_fts WHERE contracts_fts MATCH ?", (q,))]  # noqa: E731
    assert 1 in hits('"adquisición"')
    M.rollback(c)
    assert c.execute("SELECT title FROM contracts WHERE id = 1").fetchone()[0] == "Adquisiciýn de equipo"
    assert 1 not in hits('"adquisición"')


def test_rollback_never_applied_is_noop():
    c = sqlite3.connect(":memory:")
    c.executescript("CREATE TABLE contracts (id INTEGER PRIMARY KEY, source_structure TEXT, title TEXT);"
                    "INSERT INTO contracts VALUES (1, 'A', 'Adquisiciýn de equipo');")
    assert M.rollback(c) == 0 and M.rollback(c) == 0
    assert c.execute("SELECT title FROM contracts").fetchone()[0] == "Adquisiciýn de equipo"
