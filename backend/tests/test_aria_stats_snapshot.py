"""/aria/stats must not serve a precomputed snapshot from an earlier ARIA run (8,807 P6 from run
4febbbc7 kept showing after later runs rewrote aria_queue)."""

import sqlite3

import pytest

from api.routers.aria import _latest_run_key, _same_run

pytestmark = pytest.mark.no_db


def test_snapshot_from_older_or_unfinished_run_is_stale():
    c = sqlite3.connect(":memory:")
    c.execute("CREATE TABLE aria_runs (id TEXT, started_at TEXT, completed_at TEXT, status TEXT)")
    c.execute("INSERT INTO aria_runs VALUES ('old', '2026-10-26', '2026-10-26T18:00', 'completed')")
    snap = {"id": "old", "status": "completed", "completed_at": "2026-10-26T18:00"}
    assert _same_run(snap, _latest_run_key(c))

    c.execute("INSERT INTO aria_runs VALUES ('new', '2026-11-01', NULL, 'running')")
    assert not _same_run(snap, _latest_run_key(c))
    running = {"id": "new", "status": "running", "completed_at": None}
    assert _same_run(running, _latest_run_key(c))

    c.execute("UPDATE aria_runs SET status = 'completed', completed_at = '2026-11-01T05:00' WHERE id = 'new'")
    assert not _same_run(running, _latest_run_key(c))


def test_snapshot_with_a_negative_count_is_not_served():
    """Prod persisted P7 = -30 (stale label_sets, 2026-11-05) under the current run key: reject it so it self-heals."""
    from api.routers.aria import _snapshot_sane
    assert _snapshot_sane({"pattern_counts": {"P6": 9199, "P7": 12}, "tier_counts": {"1": 3}})
    assert not _snapshot_sane({"pattern_counts": {"P6": 9199, "P7": -30}})
    assert not _snapshot_sane({"tier_counts": {"1": -1}})


def test_snapshot_goes_stale_when_suppressions_change(monkeypatch):
    """A GT false-positive flag between ARIA runs moves the public counts (local P1 30 vs atlas 32, 2026-11-06):
    the snapshot carries the suppression fingerprint and is recomputed when it changes."""
    import api.routers.aria as aria
    sets = {"suppressed": {1: ("P1", "false_positive")}}
    monkeypatch.setattr(aria, "label_sets", lambda conn: sets)
    k1 = aria._labels_key(None)
    assert k1 == aria._labels_key(None)                       # stable
    sets["suppressed"][2] = ("P1", "false_positive")
    assert aria._labels_key(None) != k1                       # a new FP → a new key
    sets["suppressed"] = {1: ("P1", "public_entity")}
    assert aria._labels_key(None) != k1                       # a changed reason → a new key
