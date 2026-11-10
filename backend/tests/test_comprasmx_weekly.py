"""comprasmx_weekly: the run says what really happened (review docs/SILENT_FAILURES_WEEKLY_2026-10-28.md)."""
import importlib
import json
import sqlite3
import sys

import pytest

from tests.test_integrate_comprasmx import UNLOADED, staging_db

pytestmark = pytest.mark.no_db


@pytest.fixture
def weekly(tmp_path, monkeypatch):
    """The script on a synthetic DB; every subprocess step is faked and recorded in `w.ran`."""
    db = tmp_path / "RUBLI_DEPLOY.db"
    staging_db(db).close()
    monkeypatch.setenv("DATABASE_PATH", str(db))
    monkeypatch.setenv("RUBLI_WEEKLY_DIR", str(tmp_path / "weekly"))
    monkeypatch.delenv("RUBLI_ALERT_URL", raising=False)
    monkeypatch.setattr(sys, "argv", ["comprasmx_weekly.py"])
    w = importlib.reload(importlib.import_module("scripts.comprasmx_weekly"))
    w.ran, w.rc = [], {}
    w.db = db

    def fake_run(name, cmd, hard=True):
        w.ran.append(name)
        rc = w.rc.get(name, 0)
        w.status["steps"].append({"step": name, "rc": rc, "s": 0})
        if rc and hard:
            w.status["result"] = f"FAILED at {name}"
            w.save()
            sys.exit(f"HARD_FAIL: {name}")
        return rc

    monkeypatch.setattr(w, "run", fake_run)
    monkeypatch.setattr(w, "backup", lambda: "b.db")
    w.read = lambda: json.loads(w.STATUS.read_text(encoding="utf-8"))
    return w


def _sql(w, sql):
    c = sqlite3.connect(w.db)
    c.execute(sql)
    c.commit()
    c.close()


def test_quiet_week_with_nothing_unloaded_stops(weekly):
    weekly.main()
    s = weekly.read()
    assert s["result"] == "nothing new" and s["last_ok"]["new_contracts"] == 0
    assert "link" not in weekly.ran


def test_quiet_week_still_loads_a_backlog_left_by_a_failed_run(weekly):  # B1
    _sql(weekly, UNLOADED)
    weekly.main()
    assert "integrate" in weekly.ran and weekly.read()["result"] == "ok"


def test_quiet_week_dedupes_compranet_rows_by_vendor_rfc(weekly):
    # same procedure and same supplier as a CompraNet contract, amount off by > 1%: integrate skips it
    # through the RFC map, which prod drops after each run; the check falls back to vendors.rfc
    _sql(weekly, "CREATE TABLE vendors (id INT, rfc TEXT)")
    _sql(weekly, "INSERT INTO vendors VALUES (8, 'BBB')")
    _sql(weekly, "INSERT INTO comprasmx_contracts VALUES ('C6', 'P2', 'BBB', 900, '2025-05-01', NULL, '2025-05-02', 1, 'K')")
    weekly.main()
    assert weekly.read()["result"] == "nothing new"


def test_a_held_lock_skips_and_keeps_last_ok(weekly):  # B2
    weekly.STATUS.write_text(json.dumps({"result": "ok", "last_ok": {"new_contracts": 3, "finished": "2026-10-25T05:00:00Z"}}))
    held = weekly._lock()
    assert held is not None
    with pytest.raises(SystemExit):
        weekly.main()
    s = weekly.read()
    assert s["result"] == "skipped: locked" and s["last_ok"]["new_contracts"] == 3 and s["last_attempt"]
    assert weekly.ran == []
    held.close()  # released (the kernel does the same when a run dies) → the next run proceeds
    weekly.main()
    assert weekly.read()["result"] == "nothing new"


def test_soft_failures_are_not_a_clean_ok(weekly):  # B3
    _sql(weekly, UNLOADED)
    weekly.rc["-m scripts.aria_init_schema"] = 1
    weekly.main()
    s = weekly.read()
    assert s["result"] == "ok_soft_failures" and s["soft_failures"] == ["-m scripts.aria_init_schema"]
    # core steps are hard (a failure aborts the run), so reaching the end means they all passed:
    # the record DID move, last_ok advances; the API reports weekly_status «degraded»
    assert s["last_ok"]["finished"] == s["finished"]


def test_hard_failure_keeps_previous_last_ok(weekly):
    weekly.STATUS.write_text(json.dumps({"result": "ok", "last_ok": {"new_contracts": 3, "finished": "2026-10-25T05:00:00Z"}}))
    _sql(weekly, UNLOADED)
    weekly.rc["integrate"] = 1
    with pytest.raises(SystemExit):
        weekly.main()
    s = weekly.read()
    assert s["result"] == "FAILED at integrate" and s["last_ok"]["new_contracts"] == 3


def test_unscored_valid_contracts_fail_the_run(weekly):  # S6
    _sql(weekly, UNLOADED)
    _sql(weekly, "INSERT INTO contracts VALUES (9, 'E', 'P9', 'C9', 70, 1, '2026-10-21', NULL)")
    with pytest.raises(SystemExit):
        weekly.main()
    s = weekly.read()
    assert s["result"] == "FAILED at score coverage" and s["unscored_valid_E"] == 1
    assert "stats tables" not in weekly.ran


def test_data_cut_is_the_newest_loaded_contract(weekly):  # S1
    _sql(weekly, UNLOADED)  # staged 2026-10-21, not loaded: must not move the cut
    weekly.main()
    assert weekly.read()["data_cut"] == "2026-10-01"


def test_alert_posts_outcome_and_never_breaks_the_run(weekly, monkeypatch):
    sent = []

    class R:
        def close(self):
            pass

    def fake_urlopen(req, timeout):
        sent.append((req.full_url, json.loads(req.data), timeout))
        return R()

    monkeypatch.setattr(weekly.urllib.request, "urlopen", fake_urlopen)
    monkeypatch.setenv("RUBLI_ALERT_URL", "https://hc-ping.com/abc")
    weekly.main()
    assert sent == [("https://hc-ping.com/abc", {"result": "nothing new", "new_contracts": 0, "soft_failures": []}, 10)]

    sent.clear()
    _sql(weekly, UNLOADED)
    weekly.rc["link"] = 1
    with pytest.raises(SystemExit):
        weekly.main()
    assert sent[0][0] == "https://hc-ping.com/abc/fail" and sent[0][1]["result"] == "FAILED at link"

    def boom(req, timeout):
        raise OSError("network down")

    monkeypatch.setattr(weekly.urllib.request, "urlopen", boom)
    weekly.rc.clear()
    weekly.main()  # an alert error is logged, not raised
    assert weekly.read()["result"] == "ok"


def test_budget_visibility_is_the_last_soft_precompute(weekly):
    _sql(weekly, UNLOADED)
    weekly.rc["-m scripts.precompute_budget_visibility --db"] = 1  # soft: a failure logs, the run still finishes
    weekly.main()
    r, s = weekly.ran, weekly.read()
    assert r.index("-m scripts.precompute_budget_visibility --db") > max(r.index("integrate"), r.index("-m scripts.precompute_newtabs --db"))
    # rastro (/rastro trail, feat/rastro-trail-api) is appended after it; then the perf indexes
    assert r[r.index("-m scripts.precompute_budget_visibility --db") + 1] == "-m scripts.precompute_rastro --db"
    assert r[r.index("-m scripts.precompute_rastro --db") + 1] == "perf indexes"
    assert s["result"] == "ok_soft_failures" and s["soft_failures"] == ["-m scripts.precompute_budget_visibility --db"]


def _scored(rows):
    c = sqlite3.connect(":memory:")
    c.execute("CREATE TABLE contracts (source_structure TEXT, contract_year INT, amount_mxn REAL, risk_score REAL, risk_level TEXT)")
    c.executemany("INSERT INTO contracts VALUES (?,?,?,?,?)", rows)
    return c


def test_model_monitor_reports_hr_per_structure_and_alerts_outside_the_gate(weekly):
    ok = [("D", 2024, 1.0, s, "x") for s in [.1] * 8 + [.5] * 2] + [("E", 2026, 1.0, s, "x") for s in [.1] * 9 + [.5]]
    m = weekly.model_monitor(_scored(ok))
    assert m["hr"]["all"] == 0.15 and m["hr_by_structure"]["E"] == 0.1 and m["hr_by_year"]["2026"] == 0.1
    assert m["alerts"] == [] and m["null_score_valid"] == 0
    bad = ok + [("E", 2026, 1.0, .9, "x")] * 40 + [("E", 2026, 1.0, None, None)]  # E HR ~ 82 %, one valid row unscored
    m = weekly.model_monitor(_scored(bad))
    assert any("structure E" in a for a in m["alerts"]) and any("overall" in a for a in m["alerts"])
    assert any("unscored" in a for a in m["alerts"])
    assert not any("unscored" in a for a in weekly.model_monitor(_scored(bad), prev_unscored=1)["alerts"])  # no rise
    assert weekly.model_monitor(_scored([("A", 2005, 0, None, None)]))["alerts"] == []  # amount 0 stays unscored by rule


def test_model_alerts_ping_fail_without_touching_the_result(weekly, monkeypatch):
    sent = []
    monkeypatch.setattr(weekly.urllib.request, "urlopen", lambda req, timeout: sent.append((req.full_url, json.loads(req.data))) or type("R", (), {"close": lambda s: None})())
    monkeypatch.setenv("RUBLI_ALERT_URL", "https://hc-ping.com/abc")
    _sql(weekly, UNLOADED)
    weekly.main()  # the synthetic DB has no contract_year: the monitor fails, and that is an alert
    s = weekly.read()
    assert s["result"] == "ok" and s["model_monitor"]["alerts"] == ["model monitor failed: OperationalError"]
    assert sent[0][0] == "https://hc-ping.com/abc/fail" and sent[0][1]["model_alerts"] == s["model_monitor"]["alerts"]


def test_ntfy_url_gets_one_topic_with_priority(weekly, monkeypatch):
    sent = []
    monkeypatch.setattr(weekly.urllib.request, "urlopen", lambda req, timeout: sent.append(req) or type("R", (), {"close": lambda s: None})())
    monkeypatch.setenv("RUBLI_ALERT_URL", "https://ntfy.sh/some-topic")
    weekly.status.clear()
    weekly.status.update(result="ok", model_monitor={"alerts": ["year 2025 HR 0.25"]})
    weekly.alert()
    weekly.status.update(model_monitor={"alerts": []})
    weekly.alert()
    assert [r.full_url for r in sent] == ["https://ntfy.sh/some-topic"] * 2
    assert [r.get_header("Priority") for r in sent] == ["high", "low"]
