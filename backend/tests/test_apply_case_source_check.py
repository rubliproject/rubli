"""scripts/apply_case_source_check.py — dry run, apply + backup, idempotence, fabricated actors, no-evidence cases."""
import json
import sqlite3
import sys

import pytest

from scripts import apply_case_source_check as mod

pytestmark = pytest.mark.no_db  # temp DB only


def _old(slug, idx, field):
    return next(o for i, f, o, _ in mod.EDITS[slug] if i == idx and f == field)


def _db(path):
    db = sqlite3.connect(path)
    db.execute("CREATE TABLE procurement_scandals (id INTEGER PRIMARY KEY, slug TEXT, is_verified INTEGER, "
               "last_updated TEXT, key_actors_json TEXT, sources_json TEXT, amount_note TEXT, amount_note_es TEXT, "
               "legal_status_note TEXT, legal_status_note_es TEXT)")
    s = "ahmsa-pemex-steel"
    actors = [{"name": "Xavier Lozoya Castro", "role": "vendor",
               "title": _old(s, 0, "title"), "note": _old(s, 0, "note")},
              {"name": "AHMSA / Altos Hornos de México", "role": "vendor",
               "title": "Mayor siderúrgica de México", "note": _old(s, 1, "note")}]
    invented = json.dumps([{"title": "Los Lozoya", "outlet": "Proceso", "date": "2020-10-01", "type": "journalism"}])
    db.execute("INSERT INTO procurement_scandals VALUES (1, ?, 0, NULL, ?, ?, ?, NULL, ?, NULL)",
               (s, json.dumps(actors), invented, _old(s, None, "amount_note"), _old(s, None, "legal_status_note")))
    g = "guardia-nacional-sedena-construction"
    actors = [{"name": "SEDENA — Secretaría de la Defensa Nacional", "role": "institution",
               "title": "x", "note": _old(g, 0, "note")},
              {"name": "Grupo Empresarial de la Defensa Nacional (GEDEFENSA)", "role": "vendor",
               "title": "Empresa constructora del Ejército", "note": "y"}]
    db.execute("INSERT INTO procurement_scandals VALUES (2, ?, 0, NULL, ?, '[]', ?, NULL, ?, NULL)",
               (g, json.dumps(actors), _old(g, None, "amount_note"), _old(g, None, "legal_status_note")))
    db.execute("INSERT INTO procurement_scandals VALUES (3, 'sat-tender-rigging-sixsigma', 0, NULL, "
               "'[{\"name\": \"SixSigma\"}]', '[{\"title\": \"invented\"}]', 'claim', NULL, 'claim', NULL)")
    db.commit()
    db.close()


def _run(monkeypatch, *args):
    monkeypatch.setattr(sys, "argv", ["x", *args])
    mod.main()


def _rows(path):
    db = sqlite3.connect(path)
    db.row_factory = sqlite3.Row
    return {r["slug"]: dict(r) for r in db.execute("SELECT * FROM procurement_scandals")}


def test_dry_run_apply_idempotent(tmp_path, monkeypatch, capsys):
    path = str(tmp_path / "t.db")
    _db(path)
    before = _rows(path)

    _run(monkeypatch, "--db", path)
    assert _rows(path) == before  # dry run writes nothing
    assert not list(tmp_path.glob("case_source_check_backup_*.csv"))

    _run(monkeypatch, "--db", path, "--apply")
    after = _rows(path)
    ahmsa = after["ahmsa-pemex-steel"]
    actors = json.loads(ahmsa["key_actors_json"])
    assert [a["name"] for a in actors] == ["Alonso Ancira Elizondo", "AHMSA / Altos Hornos de México"]
    assert "Lozoya Castro" not in ahmsa["key_actors_json"] and "Padre de" not in ahmsa["key_actors_json"]
    assert actors[1]["title"] == "Mayor siderúrgica de México"  # SOURCED kept
    sources = json.loads(ahmsa["sources_json"])
    assert sources and all(s["url"].startswith("https://") for s in sources)
    assert "Proceso" not in ahmsa["sources_json"]  # invented source gone
    assert ahmsa["amount_note"] is None and "Agronitrogenados" in ahmsa["amount_note_es"]

    guardia = json.loads(after["guardia-nacional-sedena-construction"]["key_actors_json"])
    assert [a["name"] for a in guardia] == ["SEDENA — Secretaría de la Defensa Nacional"]

    sat = after["sat-tender-rigging-sixsigma"]  # no evidence: only the internal note, nothing rewritten
    assert sat["legal_status_note"] == sat["legal_status_note_es"] == mod.NO_EVIDENCE_NOTE
    assert sat["amount_note"] == "claim" and sat["sources_json"] == '[{"title": "invented"}]'
    assert all(r["is_verified"] == 0 for r in after.values())

    backups = list(tmp_path.glob("case_source_check_backup_*.csv"))
    assert len(backups) == 1 and "Xavier Lozoya Castro" in backups[0].read_text(encoding="utf-8")

    capsys.readouterr()
    _run(monkeypatch, "--db", path, "--apply")
    out = capsys.readouterr().out
    assert "0 cases to update" in out and "differs" not in out
    assert _rows(path) == after
