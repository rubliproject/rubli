"""
Thread-safe caching utilities for the RUBLI API.

Replaces ad-hoc _cache = {} patterns with bounded, thread-safe TTLCache.
All caches are size-bounded (maxsize) and time-bounded (ttl seconds).
"""
import logging
import threading
import time
from cachetools import LRUCache, TTLCache

logger = logging.getLogger(__name__)


class AppCache:
    """Application-wide cache registry. Thread-safe with size and TTL bounds."""

    def __init__(self):
        self._lock = threading.Lock()
        self._caches: dict[str, TTLCache] = {}
        self._warned: set[str] = set()

    def get_cache(self, name: str, maxsize: int = 128, ttl: int = 600) -> TTLCache:
        """Get or create a named TTLCache. Thread-safe. maxsize/ttl are fixed by the FIRST call for a
        name, so a namespace must hold one key kind; a later call asking for other bounds is logged."""
        with self._lock:
            cache = self._caches.get(name)
            if cache is None:
                cache = self._caches[name] = TTLCache(maxsize=maxsize, ttl=ttl)
            elif (cache.maxsize, cache.ttl) != (maxsize, ttl) and name not in self._warned:
                self._warned.add(name)
                logger.warning("cache %r created with maxsize=%s ttl=%s; ignoring maxsize=%s ttl=%s — "
                               "use one namespace per key kind", name, cache.maxsize, cache.ttl, maxsize, ttl)
            return cache

    def get(self, cache_name: str, key: str):
        """Get a value from a named cache. Returns None if not found/expired."""
        cache = self._caches.get(cache_name)
        if cache is None:
            return None
        try:
            return cache[key]
        except KeyError:
            return None

    def set(self, cache_name: str, key: str, value, maxsize: int = 128, ttl: int = 600):
        """Set a value in a named cache. Creates cache if needed."""
        cache = self.get_cache(cache_name, maxsize=maxsize, ttl=ttl)
        cache[key] = value

    def invalidate(self, cache_name: str, key: str | None = None):
        """Invalidate a specific key or entire cache."""
        cache = self._caches.get(cache_name)
        if cache is None:
            return
        if key is None:
            cache.clear()
        else:
            cache.pop(key, None)

    def stats(self) -> dict:
        """Return cache statistics for monitoring."""
        result = {}
        for name, cache in self._caches.items():
            result[name] = {
                "size": len(cache),
                "maxsize": cache.maxsize,
                "ttl": cache.ttl,
            }
        return result


# Global cache instance — import this in routers
app_cache = AppCache()


class SimpleCache:
    """Thread-safe in-memory cache with TTL support for expensive queries."""

    def __init__(self):
        self._cache: dict[str, dict] = {}
        self._lock = threading.Lock()

    def get(self, key: str):
        """Get cached value if not expired."""
        from datetime import datetime
        with self._lock:
            if key in self._cache:
                entry = self._cache[key]
                if datetime.now() < entry["expires_at"]:
                    return entry["value"]
                del self._cache[key]
            return None

    def set(self, key: str, value, ttl_seconds: int = 3600) -> None:
        """Set cached value with TTL."""
        from datetime import datetime, timedelta
        with self._lock:
            self._cache[key] = {
                "value": value,
                "expires_at": datetime.now() + timedelta(seconds=ttl_seconds),
            }

    def invalidate(self, pattern: str = None) -> None:
        """Invalidate cache entries matching pattern (or all if None)."""
        with self._lock:
            if pattern is None:
                self._cache.clear()
            else:
                for k in [k for k in self._cache if pattern in k]:
                    del self._cache[k]


def _load_persisted(key: str):
    """(computed_at epoch, value) from precomputed_stats, or None."""
    import json
    from .dependencies import get_db
    try:
        with get_db() as conn:
            row = conn.execute("SELECT stat_value FROM precomputed_stats WHERE stat_key = ?", (key,)).fetchone()
        if row:
            env = json.loads(row[0])
            return env["at"], env["data"]
    except Exception as e:  # missing table, old row shape, read-only test DB
        logger.warning("swr: persisted read failed for %s: %s", key, e)
    return None


def _save_persisted(key: str, at: float, value) -> None:
    """Best-effort (api § no-write-wait): gives up after WRITE_BUSY_MS when another writer holds the lock.
    A skipped persist only means a later cold call recomputes."""
    import json
    import sqlite3
    from .dependencies import get_write_db
    try:
        with get_write_db() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO precomputed_stats(stat_key, stat_value, updated_at)"
                " VALUES(?, ?, strftime('%Y-%m-%dT%H:%M:%S','now'))",
                (key, json.dumps({"at": at, "data": value}, default=str)),
            )
            conn.commit()
    except sqlite3.OperationalError as e:
        if "locked" in str(e) or "busy" in str(e):
            logger.info("swr: persist skipped for %s (database busy): %s", key, e)
        else:
            logger.warning("swr: persist failed for %s: %s", key, e)
    except Exception as e:
        logger.warning("swr: persist failed for %s: %s", key, e)


def shared(key: str, ttl: float, compute, min_secs: float = 0.0):
    """Read-through for one keyed value shared by every gunicorn worker (owner 11-07 speed): a precomputed_stats
    row younger than `ttl`, else compute — and persist only when the compute took ≥ `min_secs`, so only the slow
    keys (IMSS, Medicamentos…) take a row and a crawl of small pages never grows the table. Callers keep their
    own in-process cache in front; this fixes the 6 workers × max-requests recycles each rebuilding it cold."""
    hit = _load_persisted(key)
    if hit and time.time() - hit[0] <= ttl:
        return hit[1]
    with _shared_locks_guard:
        lock = _shared_locks.setdefault(key, threading.Lock())
        seen = _shared_last.get(key, (0, None))[0]
    with lock:                              # single-flight per key in this worker
        gen, done = _shared_last.get(key, (0, None))
        if gen != seen:                     # a compute finished while we waited → reuse (its persist may have failed)
            return done
        t0 = time.time()
        value = compute()
        _shared_last[key] = (gen + 1, value)
    if time.time() - t0 >= min_secs:
        _save_persisted(key, t0, value)
    return value


# ponytail: one Lock per key ever asked for (a few dozen keys in practice); bound it if keys become unbounded
_shared_locks: dict = {}
_shared_locks_guard = threading.Lock()
_shared_last = LRUCache(maxsize=64)         # (generation, value) per key, for lock waiters only


class SWR:
    """Stale-while-revalidate holder for one expensive value (docs/OVERNIGHT_PLAN_2026-10-28.md step 11b).

    get() returns the held value at once; once it is older than `ttl` one background thread
    recomputes it. Only the very first call (nothing held anywhere) blocks, and concurrent
    cold callers share that one compute. A failed refresh keeps serving the old value.
    `persist_key` keeps the value in precomputed_stats, so the other gunicorn workers and the
    next deploy start warm instead of recomputing on a visitor's request.
    `complete(value) -> False` serves the value but keeps it stale and unpersisted (retried soon).
    """

    def __init__(self, compute, ttl: float, persist_key: str | None = None, complete=None):
        self._compute, self._ttl, self._key, self._complete = compute, ttl, persist_key, complete
        self._value = None
        self._at = 0.0
        self._lock = threading.Lock()       # cold compute and refresh are single-flight
        self._idle = threading.Event()
        self._idle.set()

    def get(self):
        if self._value is None:
            with self._lock:
                if self._value is None:
                    hit = _load_persisted(self._key) if self._key else None
                    if hit:
                        self._at, self._value = hit
                    else:
                        self._store(self._compute())
        value = self._value
        if time.time() - self._at > self._ttl:
            self._refresh_async()
        return value

    def _store(self, value) -> None:
        ok = self._complete is None or self._complete(value)
        self._at = time.time() if ok else 0.0
        self._value = value
        if ok and self._key:
            _save_persisted(self._key, self._at, value)

    def _refresh_async(self) -> None:
        if not self._lock.acquire(blocking=False):
            return                          # a cold compute or a refresh is already running
        self._idle.clear()

        def run():
            try:
                # another worker may have refreshed the shared copy already
                hit = _load_persisted(self._key) if self._key else None
                if hit and time.time() - hit[0] <= self._ttl:
                    self._at, self._value = hit
                else:
                    self._store(self._compute())
            except Exception as e:
                logger.warning("swr: refresh failed (%s); serving the previous value", e)
                self._at = time.time() - self._ttl + min(self._ttl, 30)  # retry in ≤ 30 s, not on every request
            finally:
                self._idle.set()
                self._lock.release()

        threading.Thread(target=run, daemon=True).start()

    def wait_idle(self, timeout: float | None = None) -> bool:
        """Block until no background refresh is running (tests, startup warmer)."""
        return self._idle.wait(timeout)
