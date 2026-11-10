"""EN contract titles (docs/TITLE_TRANSLATION_2026-11-04.md §6): api/title_en.attach_title_en + the loader.

Pins: title_en by sha1 of the exact Spanish title; never for a persona física's contract; None when untranslated or
when the table is absent; the loader is idempotent and refuses --src == --db.
"""
import sqlite3

import pytest

from api.title_en import attach_title_en, title_hash
from scripts.load_title_translations import DDL, load
from scripts.translate_titles import title_hash as batch_hash




def _db(rows=()):
    c = sqlite3.connect(":memory:")
    c.execute(DDL)
    c.executemany("INSERT INTO contract_title_en VALUES (?, ?, ?, 'm', 't')", [(title_hash(es), es, en) for es, en in rows])
    return c


@pytest.mark.no_db
def test_same_key_as_the_batch():
    assert title_hash("ADQUISICIÓN DE MEDICAMENTOS") == batch_hash("ADQUISICIÓN DE MEDICAMENTOS")


@pytest.mark.no_db
def test_title_en_by_exact_title_and_never_for_a_persona_fisica():
    c = _db([("ADQUISICION DE MEDICAMENTOS", "Purchase of medicines"), ("SERVICIO DE JUAN GUERRERO", "Juan warrior service")])
    rows = [
        {"title": "ADQUISICION DE MEDICAMENTOS", "vendor_is_individual": False},
        {"title": "ADQUISICION DE MEDICAMENTOS", "vendor_is_individual": None},      # same title twice: both mapped
        {"title": "SERVICIO DE JUAN GUERRERO", "vendor_is_individual": True},       # persona física: Spanish only
        {"title": "ADQUISICION DE MEDICAMENTOS ", "vendor_is_individual": False},  # not the exact text: no match
        {"title": None, "vendor_is_individual": False},
    ]
    attach_title_en(c, rows)
    assert [r["title_en"] for r in rows] == ["Purchase of medicines", "Purchase of medicines", None, None, None]


@pytest.mark.no_db
def test_absent_table_is_none_not_an_error():
    rows = [{"title": "X", "vendor_is_individual": False}]
    attach_title_en(sqlite3.connect(":memory:"), rows)
    assert rows[0]["title_en"] is None


@pytest.mark.no_db
def test_loader_is_idempotent_and_skips_empty(tmp_path):
    src, db = tmp_path / "mt.sqlite", tmp_path / "serve.db"
    s = sqlite3.connect(src)
    s.execute(DDL)
    s.executemany("INSERT INTO contract_title_en VALUES (?, ?, ?, 'm', 't')",
                  [(title_hash("A"), "A", "a"), (title_hash("B"), "B", "  ")])
    s.commit(); s.close()
    sqlite3.connect(db).close()
    assert load(str(db), str(src)) == (1, 1)       # the blank translation is not loaded
    assert load(str(db), str(src)) == (0, 1)       # re-run adds nothing
    with pytest.raises(ValueError):
        load(str(db), str(db))


# ── on the real DB (skipped when contract_title_en is not loaded)
def test_endpoints_carry_title_en_never_for_personas_fisicas(client):
    from api.dependencies import DB_PATH
    with sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True) as db:
        if db.execute("SELECT 1 FROM sqlite_master WHERE name='contract_title_en'").fetchone() is None:
            pytest.skip("contract_title_en not loaded")
    r = client.get("/api/v1/contracts", params={"year": 2024, "sector_id": 1, "per_page": 100})
    assert r.status_code == 200
    rows = r.json()["data"]
    assert any(x["title_en"] for x in rows)                        # translations reach the list
    assert all(x["title_en"] is None for x in rows if x.get("vendor_is_individual"))
    one = next(x for x in rows if x["title_en"])
    d = client.get(f"/api/v1/contracts/{one['id']}").json()
    assert d["title_en"] == one["title_en"] and d["title"] == one["title"]
