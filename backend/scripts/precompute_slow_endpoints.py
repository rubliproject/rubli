"""Persist the slow public analysis endpoints into precomputed_stats.

    python -m scripts.precompute_slow_endpoints --db RUBLI_NORMALIZED.db --out-db OUT.db [--only a,b] [--list-keys]

Each endpoint below scans the 3.1M-row contracts table (28 s to >60 s cold).
This runs the handlers' own live computation once per parameter combination
and stores the JSON under api.persisted.stat_key(endpoint, **params); the
handlers read it back and only compute live when the key is missing.

The source is opened READ-ONLY for the computation. With --out-db the rows go
to OUT.db (source ATTACHed read-only, scripts/_out_db.py); move them with
    python -m scripts.swap_tables --target DB --source OUT.db --tables precomputed_stats \\
        --suffix 20261003perf --stat-keys "$(python -m scripts.precompute_slow_endpoints --list-keys)"
Without --out-db the rows are written into --db directly (in-container use).
Re-run after a rescore, an ETL load or a GT change: the values are a snapshot.
"""
import argparse
import json
import os
import sqlite3
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

SECTORS = range(1, 13)
# The two calls /stories/el-umbral-de-los-300k makes (frontend useThresholdData.ts).
_HIST = dict(min=200000, max=400000, year_from=None, year_to=None, institution_id=None)
HIST_COARSE = dict(_HIST, bucket=10000, exact="210000,250000,300000")
HIST_FINE = dict(_HIST, bucket=1000, exact=",".join(str(200000 + i * 10000) for i in range(20)))
GRAPH = dict(year=None, min_value=None, min_contracts=10, depth=1, limit=50)


def jobs():
    """(endpoint, params, compute) — params must match the handler's persisted.load call."""
    from fastapi import Response
    from api.dependencies import get_db
    from api.routers import analysis, analysis_vendor_sector as avs, network, reports, sectors

    def price_live():
        with get_db() as conn:
            return analysis._price_hyp_live(conn.cursor())

    yield "pyod-agreement", {}, analysis.get_pyod_agreement
    yield "price-hypotheses/summary", {}, price_live
    yield "validation/factor-lift", {}, analysis.get_factor_lift
    yield "validation/factor-analysis", {}, analysis.get_factor_analysis
    yield "validation/per-case-detection", {}, analysis.get_per_case_detection
    for h in (HIST_COARSE, HIST_FINE):
        yield "amount-histogram", h, lambda h=h: analysis.get_amount_histogram(Response(), **h)
    yield "direct-award-rate", {}, sectors.get_direct_award_rate
    yield "single-bid-rate", {}, sectors.get_single_bid_rate
    for n in (3, 5, 10):  # 3 = frontend default, 10 = API default
        yield "vendor-concentration", {"top_n": n}, lambda n=n: sectors.get_vendor_concentration(top_n=n)
    yield "procedure-risk-comparison", {}, lambda: avs.get_procedure_risk_comparison(sector_id=None, year=None)
    yield ("industry-risk-clusters", {"min_contracts": 100},
           lambda: avs.get_industry_risk_clusters(sector_id=None, min_contracts=100))
    # graph is rate-limited per IP (LAUNCH_AUDIT_2026-10-30 § S2): call past the slowapi wrapper, no Request here
    _graph = getattr(network.get_network_graph, "__wrapped__", network.get_network_graph)
    for s in (None, *SECTORS):
        yield ("network/graph", dict(GRAPH, sector_id=s),
               lambda s=s: _graph(None, vendor_id=None, institution_id=None, sector_id=s, **GRAPH))
    for s in SECTORS:
        yield "reports/sector", {"sector_id": s}, lambda s=s: reports.get_sector_report(sector_id=s)


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--db", default=os.environ.get("DATABASE_PATH", "RUBLI_NORMALIZED.db"))
    p.add_argument("--out-db", default=None)
    p.add_argument("--only", default="", help="comma-separated endpoint names to (re)compute")
    p.add_argument("--list-keys", action="store_true", help="print the comma-separated stat keys and exit")
    a = p.parse_args(argv)

    src = Path(a.db).resolve()
    os.environ["DATABASE_PATH"] = str(src)  # before any api import: dependencies reads it once
    from fastapi.encoders import jsonable_encoder
    from api import dependencies, persisted
    try:
        from scripts._out_db import open_db
    except ImportError:
        from _out_db import open_db

    only = {x.strip() for x in a.only.split(",") if x.strip()}
    todo = [j for j in jobs() if not only or j[0] in only]
    if a.list_keys:
        print(",".join(persisted.stat_key(e, **prm) for e, prm, _ in todo))
        return

    def ro_connection():
        conn = sqlite3.connect(f"file:{src.as_posix()}?mode=ro", uri=True, timeout=120, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA busy_timeout = 120000")
        conn.execute("PRAGMA cache_size = -262144")
        conn.execute("PRAGMA mmap_size = 1073741824")
        return conn

    dependencies.get_db_connection = ro_connection  # handlers compute against the read-only source
    persisted.LIVE_ONLY = True

    out_conn = open_db(str(src), a.out_db, [])
    if a.out_db and not out_conn.execute(
            "SELECT 1 FROM main.sqlite_master WHERE name = 'precomputed_stats'").fetchone():
        out_conn.close()
        out_conn = open_db(str(src), a.out_db, ["precomputed_stats"])  # empty copy of the schema
    out_conn.execute("PRAGMA busy_timeout = 120000")

    for endpoint, prm, compute in todo:
        key = persisted.stat_key(endpoint, **prm)
        t0 = time.time()
        value = json.dumps(jsonable_encoder(compute()), ensure_ascii=False, separators=(",", ":"))
        secs = time.time() - t0
        out_conn.execute(
            "INSERT OR REPLACE INTO precomputed_stats(stat_key, stat_value, updated_at) "
            "VALUES (?, ?, datetime('now'))", (key, value))
        out_conn.commit()
        print(f"{secs:7.1f}s  {len(value):>9,} B  {key}", flush=True)
    out_conn.close()


if __name__ == "__main__":
    main()
