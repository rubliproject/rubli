import json
from datetime import datetime, timedelta, timezone

import pytest

from api.routers import stats

pytestmark = pytest.mark.no_db  # status file in tmp_path; no DB read


def _write(tmp_path, d):
    (tmp_path / "WEEKLY_REFRESH.json").write_text(json.dumps(d), encoding="utf-8")


def test_weekly_status_reads_last_successful_refresh(tmp_path, monkeypatch):
    monkeypatch.setattr(stats, "DB_PATH", tmp_path / "RUBLI.db")
    assert stats._weekly_status() == {}  # no file → nothing claimed
    recent = (datetime.now(timezone.utc) - timedelta(days=1)).replace(microsecond=0)
    _write(tmp_path, {"result": "ok", "new_contracts": 2285, "finished": recent.isoformat()})
    got = stats._weekly_status()
    assert got["weekly_new_contracts"] == 2285 and got["weekly_finished"] == recent.date().isoformat()
    assert got["next_update"] >= datetime.now(timezone.utc).date().isoformat()
    # a run in progress / failed keeps the previous success
    _write(tmp_path, {"started": "x", "steps": [], "result": "FAILED at link",
                      "last_ok": {"new_contracts": 0, "finished": recent.isoformat()}})
    assert stats._weekly_status()["weekly_new_contracts"] == 0
    _write(tmp_path, {"result": "FAILED at link"})
    assert stats._weekly_status() == {}


def test_weekly_status_says_how_the_latest_run_ended(tmp_path, monkeypatch):
    monkeypatch.setattr(stats, "DB_PATH", tmp_path / "RUBLI.db")
    last_ok = {"new_contracts": 4, "finished": "2026-10-25T05:00:00Z"}
    for result, want in (("ok", "ok"), ("nothing new", "ok"), ("ok_soft_failures", "degraded"),
                         ("FAILED at integrate", "failed"), ("FAILED at score coverage", "failed"),
                         ("FAILED: OperationalError", "failed"), (None, None), ("skipped: locked", None)):
        _write(tmp_path, {"result": result, "last_ok": last_ok})
        got = stats._weekly_status()
        assert got.get("weekly_status") == want, result
        assert got["weekly_new_contracts"] == 4  # last_ok still drives «last updated»


def test_data_cut_is_the_newest_loaded_contract(tmp_path, monkeypatch):  # review § S1
    import contextlib
    import sqlite3

    from fastapi import Response
    c = sqlite3.connect(":memory:")
    c.executescript("""
        CREATE TABLE contracts (source_structure TEXT, contract_date TEXT);
        CREATE TABLE comprasmx_contracts (fecha_publicacion TEXT);
        INSERT INTO contracts VALUES ('E', '2026-10-20'), ('D', '2025-09-01');
        INSERT INTO comprasmx_contracts VALUES ('2026-10-27 10:00:00');  -- staged, not loaded
    """)
    monkeypatch.setattr(stats, "get_db", lambda: contextlib.nullcontext(c))
    monkeypatch.setattr(stats, "DB_PATH", tmp_path / "RUBLI.db")
    stats._cut_cache.clear()
    assert stats.get_data_cut(Response())["data_cut"] == "2026-10-20"
    c.execute("DELETE FROM contracts WHERE source_structure = 'E'")
    stats._cut_cache.clear()
    assert stats.get_data_cut(Response())["data_cut"] == stats.DATA_CUT_ISO
    stats._cut_cache.clear()


def test_weekly_status_drops_a_next_update_already_past(tmp_path, monkeypatch):
    monkeypatch.setattr(stats, "DB_PATH", tmp_path / "RUBLI.db")
    _write(tmp_path, {"result": "ok", "new_contracts": 5, "finished": "2026-10-28T09:06:58Z"})
    got = stats._weekly_status()
    if datetime.now(timezone.utc) > datetime(2026, 11, 1, 4, tzinfo=timezone.utc):
        assert "next_update" not in got
    assert got["weekly_finished"] == "2026-10-28"
