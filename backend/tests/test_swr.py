"""SWR (stale-while-revalidate) cache helper — docs/OVERNIGHT_PLAN_2026-10-28.md step 11b."""
import threading
import time

import pytest

from api import cache as cache_mod
from api.cache import SWR

pytestmark = pytest.mark.no_db


class Slow:
    """compute() that counts calls and can be held open with an Event."""

    def __init__(self):
        self.calls = 0
        self.gate = threading.Event()
        self.gate.set()

    def __call__(self):
        self.calls += 1
        n = self.calls
        self.gate.wait(5)
        return {"n": n}


def test_first_call_blocks_and_computes():
    c = Slow()
    s = SWR(c, ttl=60)
    assert s.get() == {"n": 1}
    assert s.get() == {"n": 1}
    assert c.calls == 1


def test_stale_value_served_immediately_while_refreshing():
    c = Slow()
    s = SWR(c, ttl=0.01)
    assert s.get() == {"n": 1}
    time.sleep(0.02)
    c.gate.clear()                      # the refresh will hang until released
    t = time.perf_counter()
    assert s.get() == {"n": 1}          # stale value, no wait
    assert time.perf_counter() - t < 0.5
    c.gate.set()
    s.wait_idle(2)
    assert s.get() == {"n": 2}          # refreshed in the background


def test_refresh_is_single_flight():
    c = Slow()
    s = SWR(c, ttl=0.01)
    s.get()
    time.sleep(0.02)
    c.gate.clear()
    for _ in range(20):
        s.get()
    c.gate.set()
    s.wait_idle(2)
    assert c.calls == 2


def test_concurrent_cold_calls_compute_once():
    c = Slow()
    c.gate.clear()
    s = SWR(c, ttl=60)
    out = []
    threads = [threading.Thread(target=lambda: out.append(s.get())) for _ in range(8)]
    for th in threads:
        th.start()
    time.sleep(0.05)
    c.gate.set()
    for th in threads:
        th.join(5)
    assert c.calls == 1 and out == [{"n": 1}] * 8


def test_failed_refresh_keeps_serving_the_old_value():
    vals = iter([{"ok": 1}])

    def compute():
        return next(vals)               # second call raises StopIteration

    s = SWR(compute, ttl=0.01)
    assert s.get() == {"ok": 1}
    time.sleep(0.02)
    assert s.get() == {"ok": 1}
    s.wait_idle(2)
    assert s.get() == {"ok": 1}


def test_incomplete_value_is_served_but_stays_stale():
    c = Slow()
    s = SWR(c, ttl=60, complete=lambda v: v["n"] > 1)
    assert s.get() == {"n": 1}          # served, but not trusted
    s.wait_idle(2)
    s.get()                             # stale → background refresh
    s.wait_idle(2)
    assert s.get() == {"n": 2}


def test_cold_worker_serves_persisted_value(monkeypatch):
    store = {"k": (time.time() - 3600, {"from": "db"})}
    monkeypatch.setattr(cache_mod, "_load_persisted", lambda key: store.get(key))
    monkeypatch.setattr(cache_mod, "_save_persisted", lambda key, at, v: store.__setitem__(key, (at, v)))
    c = Slow()
    s = SWR(c, ttl=60, persist_key="k")
    assert s.get() == {"from": "db"}    # no compute on the request path
    s.wait_idle(2)                      # an hour old → refreshed behind it
    assert s.get() == {"n": 1} and store["k"][1] == {"n": 1}


def test_shared_reads_fresh_row_and_persists_only_slow_computes(monkeypatch):
    """cache.shared (owner 11-07 speed): a fresh persisted row wins; a stale one recomputes; fast computes never persist."""
    store: dict = {}
    monkeypatch.setattr(cache_mod, "_load_persisted", lambda k: store.get(k))
    monkeypatch.setattr(cache_mod, "_save_persisted", lambda k, at, v: store.__setitem__(k, (at, v)))
    assert cache_mod.shared("fast", 60, lambda: 1, min_secs=1.0) == 1 and "fast" not in store
    assert cache_mod.shared("slow", 60, lambda: 2) == 2 and store["slow"][1] == 2
    assert cache_mod.shared("slow", 60, lambda: 3) == 2              # fresh row served, no compute
    store["slow"] = (time.time() - 120, 2)
    assert cache_mod.shared("slow", 60, lambda: 4) == 4              # stale row recomputed + re-persisted
    assert store["slow"][1] == 4


@pytest.fixture
def cache_db(tmp_path, monkeypatch):
    """A temp WAL SQLite file with precomputed_stats, wired in as the API DB."""
    import sqlite3
    from api import dependencies
    path = tmp_path / "cache.db"
    c = sqlite3.connect(path)
    c.execute("PRAGMA journal_mode = WAL")
    c.execute("CREATE TABLE precomputed_stats(stat_key TEXT PRIMARY KEY, stat_value TEXT, updated_at TEXT)")
    c.commit()
    c.close()
    monkeypatch.setattr(dependencies, "DB_PATH", path)
    return path


def test_shared_never_waits_on_a_write_lock(cache_db, caplog):
    """api § no-write-wait: a held write lock costs the request ≤ the short persist timeout, never the 30 s busy wait."""
    import logging
    import sqlite3
    locker = sqlite3.connect(cache_db, isolation_level=None)
    locker.execute("BEGIN IMMEDIATE")                                   # e.g. the weekly ingest
    locker.execute("INSERT INTO precomputed_stats VALUES('other', '{}', '')")
    try:
        with caplog.at_level(logging.INFO, logger="api.cache"):
            t = time.perf_counter()
            assert cache_mod.shared("k", 60, lambda: {"v": 1}) == {"v": 1}
            assert time.perf_counter() - t < 1.0
        assert any("persist" in r.getMessage() and "k" in r.getMessage() for r in caplog.records)
    finally:
        locker.rollback()
        locker.close()
    assert cache_mod.shared("k", 60, lambda: {"v": 2}) == {"v": 2}      # lock gone → computed and persisted
    assert cache_mod.shared("k", 60, lambda: {"v": 3}) == {"v": 2}      # served from the row


def test_shared_concurrent_cold_calls_compute_once(cache_db):
    """api § no-write-wait: N cold requests for one key in a worker share one compute."""
    c = Slow()
    c.gate.clear()
    out = []
    threads = [threading.Thread(target=lambda: out.append(cache_mod.shared("sf", 60, c))) for _ in range(6)]
    for th in threads:
        th.start()
    time.sleep(0.1)
    c.gate.set()
    for th in threads:
        th.join(5)
    assert c.calls == 1 and out == [{"n": 1}] * 6
