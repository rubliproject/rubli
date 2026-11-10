# Backend tests

All tests run **in-process** (FastAPI `TestClient`, fixture `client` in `conftest.py`) — no
uvicorn / live backend is needed. DB-backed tests read the real database read-only; writes
land in TEMP shadow tables (`conftest._isolated_db`). Without a DB that has a `contracts`
table, everything except `@pytest.mark.no_db` tests is skipped.

Point the suite at the database (a worktree has no DB of its own):

```bash
export DATABASE_PATH='D:\Python\yangwenli\backend\RUBLI_NORMALIZED.db'
```

| Run | Command (from repo root) | When |
|---|---|---|
| **fast (default)** | `python -m pytest backend/tests/ -q --tb=short -p no:cacheprovider` | before every deploy / commit; deselects `slow` |
| **slow only** | `... -m slow` | nightly |
| **everything** | `... -m "slow or not slow"` | before a release / after a rescore |
| one file | `python -m pytest backend/tests/test_vendors.py -q -p no:cacheprovider` | while working |

`addopts = -m "not slow"` lives in `backend/pytest.ini`; a `-m` on the command line overrides it.

## Markers

- `slow` — full-table scans over the 3.1M contracts or cold precompute cross-checks; each
  takes > ~20 s on a cold HDD. Mark a new test `@pytest.mark.slow` when it scans `contracts`
  without an index, or a whole module with `pytestmark = pytest.mark.slow`.
- `no_db` — self-contained (builds its own fixture DB); runs even without the full database.

## Windows notes

- `--timeout` (pytest-timeout) kills the *whole* process on Windows, not just the test. To
  find a hanging test, run that one file with `-v --timeout=150`: the stack dump names it.
- A cold `D:` drive makes the first query of a run much slower than later ones; rerun before
  calling a test slow.
- Contract text search (`/contracts?search=`) has a wall-clock budget
  (`RUBLI_SEARCH_BUDGET_S`, default 6 s, sized for the prod SSD). On a cold local HDD a
  `LIKE '%…%'` miss can exceed it and return 422; set `RUBLI_SEARCH_BUDGET_S=60` locally if
  the search tests flake.
