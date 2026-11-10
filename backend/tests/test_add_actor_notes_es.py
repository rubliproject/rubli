"""scripts/add_actor_notes_es.py — dry run, apply + backup, idempotence, name guard."""
import json
import sqlite3
import sys

import pytest

from scripts import add_actor_notes_es as mod

pytestmark = pytest.mark.no_db  # temp DB only


def _db(path):
    db = sqlite3.connect(path)
    db.execute("CREATE TABLE procurement_scandals (id INTEGER PRIMARY KEY, slug TEXT, key_actors_json TEXT)")
    actors = [{"name": "ASF", "role": "institution", "note": "Federal auditor"},
              {"name": "SFP", "role": "institution", "note": "Reported 156 criminal complaints (2024)"},
              {"name": "Someone Else", "role": "institution", "note": "x"}]  # index 2 renamed → skipped
    db.execute("INSERT INTO procurement_scandals VALUES (1, 'segalmex-food-distribution', ?)", (json.dumps(actors),))
    db.commit()
    db.close()


def _run(monkeypatch, *args):
    monkeypatch.setattr(sys, "argv", ["x", *args])
    mod.main()


def _actors(path):
    db = sqlite3.connect(path)
    return json.loads(db.execute("SELECT key_actors_json FROM procurement_scandals").fetchone()[0])


def test_dry_run_apply_idempotent(tmp_path, monkeypatch, capsys):
    path = str(tmp_path / "t.db")
    _db(path)
    before = _actors(path)

    _run(monkeypatch, "--db", path)
    assert _actors(path) == before  # dry run writes nothing
    assert not list(tmp_path.glob("actors_es_backup_*.csv"))

    _run(monkeypatch, "--db", path, "--apply")
    after = _actors(path)
    assert after[0]["note_es"] == mod.ASF and after[0]["note"] == "Federal auditor"
    assert after[1]["note_es"].startswith("Reportó 156")
    assert "note_es" not in after[2]  # name mismatch guard
    backups = list(tmp_path.glob("actors_es_backup_*.csv"))
    assert len(backups) == 1 and "Federal auditor" in backups[0].read_text(encoding="utf-8")

    capsys.readouterr()
    _run(monkeypatch, "--db", path, "--apply")
    assert "0 cases to update" in capsys.readouterr().out
    assert _actors(path) == after
