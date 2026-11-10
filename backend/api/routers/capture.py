"""
Institutional Capture Creep — deterministic concentration growth detection.

For every federal institution and every year 2018–2025, compute each
vendor's share of that institution's procurement. Surface institutions
where a single vendor's share grew monotonically across multiple years
and eventually crossed a capture threshold (default 50%).

This is the anti-model page: no logistic regression, no PU-learning, no
SHAP. Just arithmetic on COMPRANET. Every row is a publishable finding
of the form "Over N years, Vendor X grew from A% to B% of Institution
Y's procurement." IMCO and Transparencia Internacional do this by hand
on single agencies; this does it for all 2,296 federal institutions
simultaneously.
"""

import logging
import sqlite3
from typing import Optional

from fastapi import APIRouter, Depends, Query

from ..cache import app_cache
from ..dependencies import get_db, get_write_db, get_db_dep
from ..public_labels import capture_pair_excluded, label_sets, public_pattern_counts
from ..config.constants import DATA_LAST_YEAR

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/capture", tags=["capture"])


# Tuning:
# - min_inst_total: institutions with < this in 2018-2025 total spend are
#   too small to be editorially interesting (noise dominates their share
#   dynamics). 100M MXN excludes ~60% of institutions but retains almost
#   all the actionable signal.
# - min_cumulative: the captured vendor must have won >= this cumulative
#   value across the capture window. Excludes tiny vendors whose "share"
#   grew as a denominator artifact.
# - floor / ceil: the signal is "crossed from low to high." We require the
#   earliest-year share <= 25% and at least one later year >= 50%.
# - min_years: at least 4 annual observations. 3 is too easy; trend
#   detection needs scale.
_MIN_INST_TOTAL = 100_000_000      # 100M MXN across the capture window
_MIN_CUM_VALUE  = 50_000_000       # 50M MXN captured by the vendor
_FLOOR_SHARE    = 25.0             # start at or below this percent
_CEIL_SHARE     = 50.0             # cross to this percent
_MIN_YEARS      = 4                # at least 4 annual data points


def _build_candidates(conn: sqlite3.Connection) -> list[dict]:
    """Run the aggregation + capture detection. Expensive — should be cached."""
    conn.row_factory = sqlite3.Row
    # Aggregate (institution, year, vendor) totals + institution-year total
    # in a single SQL pass with window functions — faster than three separate
    # CTEs because SQLite plans the window execution over a single scan.
    rows = conn.execute(
        f"""
        WITH vy AS (
            SELECT
                c.institution_id,
                c.contract_year AS yr,
                c.vendor_id,
                SUM(c.amount_mxn) AS v_val
            FROM contracts c
            WHERE c.contract_year BETWEEN 2018 AND {DATA_LAST_YEAR}
              AND c.amount_mxn > 0
              AND c.amount_mxn < 100000000000
              AND c.institution_id IS NOT NULL
              AND c.vendor_id IS NOT NULL
            GROUP BY c.institution_id, c.contract_year, c.vendor_id
        ),
        iy AS (
            SELECT institution_id, yr, SUM(v_val) AS i_total
            FROM vy
            GROUP BY institution_id, yr
        )
        SELECT
            vy.institution_id,
            vy.vendor_id,
            vy.yr,
            vy.v_val,
            iy.i_total,
            100.0 * vy.v_val / iy.i_total AS share_pct
        FROM vy
        JOIN iy ON iy.institution_id = vy.institution_id AND iy.yr = vy.yr
        WHERE vy.v_val >= 1000000       -- ignore sub-1M MXN noise rows
          AND iy.i_total >= 10000000    -- ignore tiny-year institutions
        """
    ).fetchall()

    # Group by (institution, vendor) and build time series
    from collections import defaultdict
    series: dict[tuple[int, int], list[tuple[int, float, float, float]]] = defaultdict(list)
    for r in rows:
        series[(r["institution_id"], r["vendor_id"])].append(
            (r["yr"], r["share_pct"], r["v_val"], r["i_total"])
        )

    candidates: list[dict] = []
    for (inst_id, vendor_id), points in series.items():
        if len(points) < _MIN_YEARS:
            continue
        points.sort(key=lambda p: p[0])

        shares = [p[1] for p in points]
        values = [p[2] for p in points]

        # Capture criteria:
        # 1) earliest year share <= floor
        # 2) some later year share >= ceil
        # 3) the max share year is strictly after the min share year
        # 4) cumulative value >= min_cum_value
        # 5) institution had >= min_inst_total across all observed years
        earliest_share = shares[0]
        max_share = max(shares)
        max_share_idx = shares.index(max_share)
        min_share = min(shares)
        min_share_idx = shares.index(min_share)

        if earliest_share > _FLOOR_SHARE:
            continue
        if max_share < _CEIL_SHARE:
            continue
        if max_share_idx <= min_share_idx:
            continue  # peak must come after trough — direction of growth

        cum_value = sum(values)
        if cum_value < _MIN_CUM_VALUE:
            continue

        # institution total across the observed window = sum of i_total values
        # at *first* observation per year (they repeat per vendor row within a
        # year in the flat `rows`, but we pull from `points` which is already
        # one row per (inst, vendor, year) — so we need the institution-year
        # total separately). Approximate with max of per-year i_total across
        # observed years for this vendor — they're the same i_total per year.
        inst_total_window = sum(set(p[3] for p in points))
        if inst_total_window < _MIN_INST_TOTAL:
            continue

        # Scoring: (max - min) × sqrt(cumulative_value)
        #   - delta drives "how dramatic was the capture"
        #   - sqrt(value) damps the dominance of 10B MXN outliers
        import math
        score = (max_share - earliest_share) * math.sqrt(cum_value / 1e6)

        candidates.append({
            "institution_id": inst_id,
            "vendor_id": vendor_id,
            "earliest_year": points[0][0],
            "earliest_share_pct": round(earliest_share, 2),
            "peak_year": points[max_share_idx][0],
            "peak_share_pct": round(max_share, 2),
            "latest_year": points[-1][0],
            "latest_share_pct": round(shares[-1], 2),
            "years_observed": len(points),
            "cumulative_value_mxn": cum_value,
            "institution_total_window": inst_total_window,
            "score": round(score, 2),
            "timeline": [
                {"year": p[0], "share_pct": round(p[1], 2), "value_mxn": p[2]}
                for p in points
            ],
        })

    return candidates


def _enrich_with_names(
    conn: sqlite3.Connection, candidates: list[dict]
) -> list[dict]:
    """Attach institution and vendor display names + sector."""
    if not candidates:
        return []
    inst_ids = tuple({c["institution_id"] for c in candidates})
    vendor_ids = tuple({c["vendor_id"] for c in candidates})

    inst_map: dict[int, dict] = {}
    if inst_ids:
        ph = ",".join("?" * len(inst_ids))
        for r in conn.execute(
            f"SELECT id, COALESCE(siglas, name) AS display_name, name, sector_id "
            f"FROM institutions WHERE id IN ({ph})",
            inst_ids,
        ).fetchall():
            inst_map[r["id"]] = {
                "display_name": r["display_name"],
                "full_name": r["name"],
                "sector_id": r["sector_id"],
            }

    vendor_map: dict[int, str] = {}
    if vendor_ids:
        ph = ",".join("?" * len(vendor_ids))
        for r in conn.execute(
            f"SELECT id, name FROM vendors WHERE id IN ({ph})",
            vendor_ids,
        ).fetchall():
            vendor_map[r["id"]] = r["name"]

    # Sector names
    sector_map: dict[int, str] = {}
    for r in conn.execute(
        "SELECT id, name_en FROM sectors"
    ).fetchall():
        sector_map[r["id"]] = r["name_en"]

    enriched = []
    for c in candidates:
        inst = inst_map.get(c["institution_id"], {})
        enriched.append({
            **c,
            "institution_name": inst.get("display_name") or f"Institution #{c['institution_id']}",
            "institution_full_name": inst.get("full_name"),
            "institution_sector_id": inst.get("sector_id"),
            "institution_sector_name": sector_map.get(inst.get("sector_id") or 0),
            "vendor_name": vendor_map.get(c["vendor_id"], f"Vendor #{c['vendor_id']}"),
        })
    return enriched


def _attach_aria_crosslight(conn: sqlite3.Connection, data: list[dict]) -> None:
    """Fold the ARIA cross-light onto each capture item IN PLACE so the
    model-vs-arithmetic seal (GT / IPS tier / EFOS / SFP) renders AT REST
    without a per-row fetch. Additive, sub-millisecond IN-join on the indexed
    `aria_queue` (≤13 distinct vendor_ids) — never touches `contracts`.

    Anti-model identity preserved: this is cross-light commentary, never a
    headline. Vendors absent from the queue degrade to `aria = None`.
    """
    if not data:
        return
    has_table = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='aria_queue'"
    ).fetchone()
    if not has_table:
        for c in data:
            c["aria"] = None
        return
    vids = sorted({c["vendor_id"] for c in data if c.get("vendor_id") is not None})
    if not vids:
        return
    placeholders = ",".join("?" * len(vids))
    aria = {
        r["vendor_id"]: r
        for r in conn.execute(
            f"""SELECT vendor_id, in_ground_truth, ips_tier,
                       is_efos_definitivo, is_sfp_sanctioned
                FROM aria_queue WHERE vendor_id IN ({placeholders})""",
            vids,
        ).fetchall()
    }
    # "documented" seal only for a documented GT link (tier A/B, sourced, not FP).
    documented = label_sets(conn)["documented"]
    for c in data:
        a = aria.get(c.get("vendor_id"))
        c["aria"] = (
            {
                "in_ground_truth": c.get("vendor_id") in documented,
                "ips_tier": a["ips_tier"],
                "is_efos_definitivo": bool(a["is_efos_definitivo"]),
                "is_sfp_sanctioned": bool(a["is_sfp_sanctioned"]),
            }
            if a is not None
            else None
        )


def _read_precomputed(
    conn: sqlite3.Connection,
    limit: int,
    sector_id: Optional[int],
    cache_key: str,
) -> Optional[dict]:
    """Read from the precomputed capture_results table. Returns None if table absent."""
    import json as _json
    has_table = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='capture_results'"
    ).fetchone()
    if not has_table:
        return None

    if sector_id is not None:
        rows = conn.execute(
            "SELECT * FROM capture_results WHERE institution_sector_id = ? ORDER BY score DESC",
            (sector_id,),
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM capture_results ORDER BY score DESC"
        ).fetchall()

    # GT false positives, personas físicas, and pairs whose share rests on a
    # suspect-decimal contract never rank (public_labels § B4/B5).
    rows = [r for r in rows if not capture_pair_excluded(conn, r["vendor_id"], r["institution_id"])]
    total = len(rows)
    data = []
    for r in rows[:limit]:
        rec = {k: r[k] for k in r.keys()}
        rec["timeline"] = _json.loads(rec["timeline"]) if rec.get("timeline") else []
        data.append(rec)

    _attach_aria_crosslight(conn, data)

    response = {
        "thresholds": {
            "min_inst_total_mxn": _MIN_INST_TOTAL,
            "min_cumulative_value_mxn": _MIN_CUM_VALUE,
            "floor_share_pct": _FLOOR_SHARE,
            "ceil_share_pct": _CEIL_SHARE,
            "min_years": _MIN_YEARS,
            "year_window": "2018-2025",
        },
        "total_captures": total,
        "total_unfiltered": total,
        "data": data,
    }
    app_cache.set("capture", cache_key, response, maxsize=16, ttl=1800)
    return response


@router.get("/top")
def get_top_captures(
    limit: int = Query(50, ge=1, le=200, description="Max captures to return"),
    sector_id: Optional[int] = Query(None, ge=1, le=12, description="Scope to one sector"),
    conn: sqlite3.Connection = Depends(get_db_dep),
):
    """
    Top institutional-capture candidates, ranked by
    (share_delta) × sqrt(captured_value_MXN).

    Each entry is an (institution, vendor) pair where the vendor's share
    of the institution's procurement grew from <= 25% to >= 50% across at
    least 4 years of the 2018–2025 window, with sufficient absolute value
    on both the vendor and institution sides to rule out noise.

    This is NOT a model output — no ML, no regression. It is arithmetic on
    COMPRANET contract awards. Findings are publishable on their own
    (with the usual "not proof of wrongdoing" caveat — legitimate
    concentration can emerge from technical certification, regional
    exclusivity, or single-source regulatory dependency).

    Reads from the precomputed `capture_results` table when available
    (run scripts/precompute_capture.py to populate). Falls back to
    on-the-fly computation, which is expensive and may OOM on constrained VPS.
    """
    conn.row_factory = sqlite3.Row
    cache_key = f"top:{limit}:{sector_id or 'all'}"
    cached = app_cache.get("capture", cache_key)
    if cached is not None:
        return cached

    precomputed = _read_precomputed(conn, limit, sector_id, cache_key)
    if precomputed is not None:
        return precomputed

    # Fallback: compute on-the-fly (expensive — may OOM on 1.5 GB VPS).
    # Populate capture_results table via scripts/precompute_capture.py to avoid this path.
    logger.warning("capture_results table missing — falling back to on-the-fly computation")
    candidates = _build_candidates(conn)
    enriched = _enrich_with_names(conn, candidates)

    if sector_id is not None:
        enriched = [c for c in enriched if c.get("institution_sector_id") == sector_id]

    enriched = [
        c for c in enriched
        if not capture_pair_excluded(conn, c["vendor_id"], c["institution_id"])
    ]
    enriched.sort(key=lambda c: c["score"], reverse=True)
    top = enriched[:limit]
    _attach_aria_crosslight(conn, top)

    response = {
        "thresholds": {
            "min_inst_total_mxn": _MIN_INST_TOTAL,
            "min_cumulative_value_mxn": _MIN_CUM_VALUE,
            "floor_share_pct": _FLOOR_SHARE,
            "ceil_share_pct": _CEIL_SHARE,
            "min_years": _MIN_YEARS,
            "year_window": "2018-2025",
        },
        "total_captures": len(enriched),
        "total_unfiltered": len(candidates),
        "data": top,
    }
    app_cache.set("capture", cache_key, response, maxsize=16, ttl=1800)
    return response


# ─── Landscape — the full ≥100M federal field («la fotografía») ──────────────
#
# One self-persisting census: for every institution with ≥ _MIN_INST_TOTAL of
# recorded spend, the #1 vendor's CUMULATIVE share of that institution's total.
# This is a snapshot of the RECORD, not of "today" — institution_top_vendors /
# institution_stats are whole-record aggregates (verified: ASIPONA cumulative
# 35.6% vs latest-year 0.2% vs peak 76.3%). Frontend copy must say "acumulada".
#
# Reads precomputed tables only (institution_top_vendors, institution_stats,
# institution_hhi, aria_queue count, capture_results ids) — never contracts.
# Self-persists to precomputed_stats (admin-breakdown pattern); read-back ~2 ms.

_LANDSCAPE_KEY = "capture_landscape_v2"  # v2: public_labels § B4/B5


def _build_landscape(conn: sqlite3.Connection) -> dict:
    """One-time census build from precomputed tables (~0.6 s). Persisted after."""
    conn.row_factory = sqlite3.Row

    rows = conn.execute(
        """
        WITH top1 AS (
            SELECT institution_id, vendor_id, vendor_name, total_value_mxn,
                   ROW_NUMBER() OVER (
                       PARTITION BY institution_id ORDER BY total_value_mxn DESC
                   ) AS rn
            FROM institution_top_vendors
        )
        SELECT s.institution_id,
               COALESCE(i.siglas, i.name) AS name,
               i.sector_id,
               s.total_value_mxn AS window_total_mxn,
               t.vendor_id  AS top1_vendor_id,
               t.vendor_name AS top1_vendor_name,
               100.0 * t.total_value_mxn / s.total_value_mxn AS share_pct
        FROM institution_stats s
        JOIN institutions i ON i.id = s.institution_id
        JOIN top1 t ON t.institution_id = s.institution_id AND t.rn = 1
        WHERE s.total_value_mxn >= ?
        ORDER BY share_pct DESC
        """,
        (_MIN_INST_TOTAL,),
    ).fetchall()

    ticks = []
    captured = []
    antesala = []
    for r in rows:
        share = round(min(100.0, r["share_pct"]), 1)
        ticks.append([r["institution_id"], r["name"], r["sector_id"], share])
        if share >= _CEIL_SHARE:
            captured.append({
                "institution_id": r["institution_id"],
                "name": r["name"],
                "sector_id": r["sector_id"],
                "share_pct": share,
                "top1_vendor_id": r["top1_vendor_id"],
                "top1_vendor_name": r["top1_vendor_name"],
                "window_total_mxn": r["window_total_mxn"],
                "latest_hhi": None,
            })
        elif share >= 40.0:
            antesala.append({
                "institution_id": r["institution_id"],
                "name": r["name"],
                "share_pct": share,
            })

    # Latest HHI for the captured set only (small IN list, indexed PK pairs)
    if captured:
        ids = [c["institution_id"] for c in captured]
        ph = ",".join("?" * len(ids))
        hhi_map = {
            r["institution_id"]: r["hhi"]
            for r in conn.execute(
                f"""
                SELECT institution_id, hhi FROM (
                    SELECT institution_id, hhi,
                           ROW_NUMBER() OVER (
                               PARTITION BY institution_id ORDER BY contract_year DESC
                           ) AS rn
                    FROM institution_hhi WHERE institution_id IN ({ph})
                ) WHERE rn = 1
                """,
                ids,
            ).fetchall()
        }
        for c in captured:
            c["latest_hhi"] = hhi_map.get(c["institution_id"])

    # The 13 monotonic captures' institutions (table absent → empty list)
    monotonic_ids: list[int] = []
    if conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='capture_results'"
    ).fetchone():
        monotonic_ids = sorted({
            r["institution_id"]
            for r in conn.execute(
                "SELECT institution_id, vendor_id FROM capture_results"
            ).fetchall()
            if not capture_pair_excluded(conn, r["vendor_id"], r["institution_id"])
        })

    # ARIA P6 fingerprint count (table absent → 0)
    aria_p6_total = 0
    if conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='aria_queue'"
    ).fetchone():
        aria_p6_total = public_pattern_counts(conn, {"P6": conn.execute(
            "SELECT COUNT(*) FROM aria_queue WHERE primary_pattern = 'P6'"
        ).fetchone()[0]})["P6"]

    import datetime
    return {
        "qualifying_count": len(ticks),
        "captured_now_count": len(captured),
        "antesala_count": len(antesala),
        "aria_p6_total": aria_p6_total,
        "monotonic_institution_ids": monotonic_ids,
        "thresholds": {
            "min_inst_total_mxn": _MIN_INST_TOTAL,
            "floor_share_pct": _FLOOR_SHARE,
            "ceil_share_pct": _CEIL_SHARE,
        },
        "ticks": ticks,
        "captured_now": captured,
        "antesala_top": antesala[:12],
        "generated_at": datetime.datetime.utcnow().isoformat() + "Z",
    }


@router.get("/landscape")
def get_capture_landscape(conn: sqlite3.Connection = Depends(get_db_dep)):
    """
    The full federal capture field: every institution with >= 100M MXN of
    recorded spend, positioned by its #1 vendor's CUMULATIVE share of the
    institution's recorded total. Includes the >= 50% cumulative-majority
    set (with latest HHI), the 40-50% anteroom, the monotonic-capture
    institution ids, and the ARIA P6 fingerprint count.

    Like /capture/top this is arithmetic, not a model output. Served from
    precomputed_stats (key capture_landscape_v1); on first request it builds
    once from precomputed tables (never contracts) and self-persists.
    """
    import json as _json

    cached = app_cache.get("capture_landscape", "landscape:v2")
    if cached is not None:
        return cached

    conn.row_factory = sqlite3.Row
    row = conn.execute(
        "SELECT stat_value FROM precomputed_stats WHERE stat_key = ?",
        (_LANDSCAPE_KEY,),
    ).fetchone()
    if row and row["stat_value"]:
        response = _json.loads(row["stat_value"])
        app_cache.set("capture_landscape", "landscape:v2", response, maxsize=4, ttl=3600)
        return response

    response = _build_landscape(conn)
    app_cache.set("capture_landscape", "landscape:v2", response, maxsize=4, ttl=3600)
    try:
        with get_write_db() as wconn:
            wconn.execute(
                "INSERT OR REPLACE INTO precomputed_stats(stat_key, stat_value, updated_at) "
                "VALUES(?, ?, datetime('now'))",
                (_LANDSCAPE_KEY, _json.dumps(response, default=str)),
            )
            wconn.commit()
    except Exception as e:
        logger.warning("capture landscape persist failed: %s", e)
    return response


# ─── Current — «Pasada la mitad»: one private supplier past half, 2024–Sep 2025 ─
#
# Two-year window (one year is too lumpy: a multi-year contract lands in one
# year). For every buyer with ≥ 100M MXN of 2024–25 spend, its #1 supplier's
# share of that spend; ≥ 50% = majority. Public/structural suppliers, personas
# físicas and suspect-decimal pairs are removed (counted, never ranked).
# Read-through like /capture/landscape: app_cache → precomputed_stats → build.

_CURRENT_KEY = "capture_current_v1"
_WIN_FROM, _WIN_TO = 2024, 2025
_YEARS_FROM = 2021            # per-year share line in the mini-dossier
_DATA_HORIZON = "2025-09-28"


def _in_ph(ids) -> str:
    return ",".join("?" * len(ids))


def _build_current(conn: sqlite3.Connection) -> dict:
    """One aggregate pass over 2021–2025 (idx_c_inst_year), then Python."""
    import datetime
    from collections import defaultdict
    from ..public_labels import _norm_name, is_persona_fisica, is_public_entity

    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        """
        SELECT institution_id AS i, vendor_id AS v, contract_year AS y,
               SUM(amount_mxn) AS m, COUNT(*) AS n,
               SUM(is_direct_award) AS da, SUM(is_single_bid) AS sb,
               MAX(amount_mxn) AS mx
        FROM contracts
        WHERE contract_year BETWEEN ? AND ?
          AND amount_mxn > 0 AND amount_mxn < 100000000000
          AND institution_id IS NOT NULL AND vendor_id IS NOT NULL
        GROUP BY 1, 2, 3
        """,
        (_YEARS_FROM, _WIN_TO),
    ).fetchall()

    inst_year: dict = defaultdict(lambda: defaultdict(float))
    pair_year: dict = defaultdict(dict)
    win: dict = defaultdict(dict)   # i -> v -> [mxn, n, da, sb, max contract]
    for r in rows:
        inst_year[r["i"]][r["y"]] += r["m"]
        pair_year[(r["i"], r["v"])][r["y"]] = r["m"]
        if r["y"] >= _WIN_FROM:
            acc = win[r["i"]].setdefault(r["v"], [0.0, 0, 0, 0, 0.0])
            acc[0] += r["m"]
            acc[1] += r["n"]
            acc[2] += r["da"] or 0
            acc[3] += r["sb"] or 0
            acc[4] = max(acc[4], r["mx"])

    # (inst, top vendor, share, vendor_mxn, inst_mxn, n_vendors, runner-up share)
    field = []
    for i, vs in win.items():
        tot = sum(a[0] for a in vs.values())
        if tot < _MIN_INST_TOTAL:
            continue
        ranked = sorted(vs.items(), key=lambda kv: kv[1][0], reverse=True)
        v, a = ranked[0]
        runner = 100.0 * ranked[1][1][0] / tot if len(ranked) > 1 else 0.0
        field.append((i, v, 100.0 * a[0] / tot, a[0], tot, len(ranked), runner))
    majority = [f for f in field if f[2] >= _CEIL_SHARE]

    ids_i = sorted({f[0] for f in majority})
    ids_v = sorted({f[1] for f in majority})
    inst, vend, aria = {}, {}, {}
    if ids_i:
        inst = {r["id"]: r for r in conn.execute(
            f"SELECT id, name, siglas, sector_id FROM institutions WHERE id IN ({_in_ph(ids_i)})", ids_i)}
    if ids_v:
        vend = {r["id"]: r for r in conn.execute(
            f"SELECT id, name, is_individual, rfc FROM vendors WHERE id IN ({_in_ph(ids_v)})", ids_v)}
        if conn.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='aria_queue'").fetchone():
            aria = {r["vendor_id"]: r for r in conn.execute(
                f"""SELECT vendor_id, ips_tier, primary_pattern, fp_structural_monopoly,
                           is_efos_definitivo, is_sfp_sanctioned
                    FROM aria_queue WHERE vendor_id IN ({_in_ph(ids_v)})""", ids_v)}
    labels = label_sets(conn)
    inst_names = {_norm_name(r[0]) for r in conn.execute("SELECT name FROM institutions")}

    kept, excluded_pairs = [], []
    excluded = {"public_or_structural": 0, "persona_fisica": 0, "suspect_decimal": 0}
    for i, v, share, vm, tot, nv, runner in majority:
        vr, a, ir = vend.get(v), aria.get(v), inst.get(i)
        name = vr["name"] if vr else ""
        iname = (ir["siglas"] or ir["name"]) if ir else f"Institution #{i}"
        if vr is not None and is_persona_fisica(vr["is_individual"], vr["rfc"]):
            reason = "persona_fisica"
        elif (v in labels["fp"] or (a is not None and a["fp_structural_monopoly"])
              or is_public_entity(name, inst_names)):
            reason = "public_or_structural"
        elif capture_pair_excluded(conn, v, i):
            reason = "suspect_decimal"
        else:
            kept.append((i, v, share, vm, tot, nv, runner, ir, iname, name, a))
            continue
        excluded[reason] += 1
        if reason != "persona_fisica":   # individuals are counted, never named
            excluded_pairs.append({
                "institution_id": i, "institution_name": iname, "vendor_id": v,
                "vendor_name": name, "share_pct": round(share, 1),
                "vendor_mxn": vm, "reason": reason,
            })

    gt_case: dict = {}
    case_slug: dict = {}
    kv = sorted({k[1] for k in kept})
    if kv:
        gt_case = {r["vendor_id"]: r["cid"] for r in conn.execute(
            f"""SELECT vendor_id, MIN(case_id) AS cid FROM ground_truth_vendors
                WHERE vendor_id IN ({_in_ph(kv)}) AND COALESCE(is_false_positive, 0) = 0
                GROUP BY vendor_id""", kv)}
        cids = sorted(set(gt_case.values()))
        if cids:
            case_slug = {r["ground_truth_case_id"]: r["slug"] for r in conn.execute(
                f"""SELECT ground_truth_case_id, slug FROM procurement_scandals
                    WHERE is_verified = 1 AND ground_truth_case_id IN ({_in_ph(cids)})""", cids)}

    pairs = []
    for i, v, share, vm, tot, nv, runner, ir, iname, name, a in kept:
        acc = win[i][v]
        years = []
        for y in range(_YEARS_FROM, _WIN_TO + 1):
            it = inst_year[i].get(y, 0.0)
            pv = pair_year[(i, v)].get(y, 0.0)
            years.append({
                "year": y,
                "share_pct": round(100.0 * pv / it, 1) if it > 0 and pv > 0 else None,
                "vendor_mxn": pv, "inst_mxn": it,
            })
        observed = [y for y in years if y["inst_mxn"] > 0]
        latest = observed[-1]
        streak = 0
        for y in reversed(observed):
            if (y["share_pct"] or 0) < _CEIL_SHARE:
                break
            streak += 1
        titles = [
            {"contract_id": r["id"], "title": r["title"], "year": r["contract_year"],
             "amount_mxn": r["amount_mxn"], "is_direct_award": bool(r["is_direct_award"])}
            for r in conn.execute(
                """SELECT id, title, contract_year, amount_mxn, is_direct_award FROM contracts
                   WHERE institution_id = ? AND vendor_id = ? AND contract_year BETWEEN ? AND ?
                     AND amount_mxn > 0 AND amount_mxn < 100000000000
                   ORDER BY amount_mxn DESC LIMIT 2""",
                (i, v, _WIN_FROM, _WIN_TO),
            )
        ]
        cid = gt_case.get(v)
        gt = "documented" if v in labels["documented"] else ("lead" if v in labels["leads"] else None)
        pairs.append({
            "institution_id": i,
            "institution_name": iname,
            "institution_full_name": ir["name"] if ir else None,
            "sector_id": ir["sector_id"] if ir else None,
            "vendor_id": v,
            "vendor_name": name,
            "window_share_pct": round(share, 1),
            "window_vendor_mxn": vm,
            "window_inst_mxn": tot,
            "other_vendors": nv - 1,
            "runner_up_share_pct": round(runner, 1),
            "years": years,
            "first_majority_year": next(
                (y["year"] for y in years if (y["share_pct"] or 0) >= _CEIL_SHARE), None),
            "consecutive_majority_years": streak,
            "latest_year": latest["year"],
            "latest_share_pct": latest["share_pct"],
            "holding": (latest["share_pct"] or 0) >= _CEIL_SHARE,
            "n_contracts": acc[1],
            "da_pct": round(100.0 * acc[2] / acc[1], 1) if acc[1] else 0.0,
            "n_single_bid": acc[3],
            "flagged_amount": acc[4] > 10_000_000_000,
            "top_titles": titles,
            "seal": {
                "gt": gt if cid is not None else None,
                "gt_case_id": cid if gt else None,
                "case_slug": case_slug.get(cid) if gt else None,
                "ips_tier": a["ips_tier"] if a is not None else None,
                "pattern": (a["primary_pattern"]
                            if a is not None and v not in labels["suppressed"] else None),
                "efos": bool(a["is_efos_definitivo"]) if a is not None else False,
                "sfp": bool(a["is_sfp_sanctioned"]) if a is not None else False,
            },
        })
    pairs.sort(key=lambda p: p["window_vendor_mxn"], reverse=True)
    excluded_pairs.sort(key=lambda p: p["vendor_mxn"], reverse=True)

    return {
        "window": {"from_year": _WIN_FROM, "to_year": _WIN_TO,
                   "data_horizon": _DATA_HORIZON, "partial_year": _WIN_TO},
        "thresholds": {"min_inst_window_mxn": _MIN_INST_TOTAL, "majority_pct": _CEIL_SHARE},
        "field_count": len(field),
        "majority_count_all": len(majority),
        "excluded": excluded,
        "excluded_pairs": excluded_pairs,
        "count": len(pairs),
        "held_mxn": sum(p["window_vendor_mxn"] for p in pairs),
        "buyers_total_mxn": sum(p["window_inst_mxn"] for p in pairs),
        "n_labelled": sum(1 for p in pairs if p["seal"]["gt"]),
        "n_documented": sum(1 for p in pairs if p["seal"]["gt"] == "documented"),
        "n_aria_t12": sum(1 for p in pairs if p["seal"]["ips_tier"] in (1, 2)),
        "n_majority_da": sum(1 for p in pairs if p["da_pct"] >= 50),
        "n_holding": sum(1 for p in pairs if p["holding"]),
        "n_efos_sfp": sum(1 for p in pairs if p["seal"]["efos"] or p["seal"]["sfp"]),
        "pairs": pairs,
        "generated_at": datetime.datetime.utcnow().isoformat() + "Z",
    }


@router.get("/current")
def get_capture_current(conn: sqlite3.Connection = Depends(get_db_dep)):
    """
    Buyers that gave one private supplier more than half of their 2024 – Sep
    2025 spend (buyers with >= 100M MXN in the window). Arithmetic on award
    amounts, not a model output and not proof of wrongdoing. Public/structural
    suppliers, personas físicas and suspect-decimal pairs are removed and
    counted. Served from precomputed_stats (key capture_current_v1); on first
    request it builds once from contracts (indexed 2021–2025 scan) and persists.
    """
    import json as _json

    cached = app_cache.get("capture_current", "current:v1")
    if cached is not None:
        return cached

    conn.row_factory = sqlite3.Row
    row = conn.execute(
        "SELECT stat_value FROM precomputed_stats WHERE stat_key = ?", (_CURRENT_KEY,)
    ).fetchone()
    if row and row["stat_value"]:
        response = _json.loads(row["stat_value"])
        app_cache.set("capture_current", "current:v1", response, maxsize=4, ttl=3600)
        return response

    response = _build_current(conn)
    app_cache.set("capture_current", "current:v1", response, maxsize=4, ttl=3600)
    try:
        with get_write_db() as wconn:
            wconn.execute(
                "INSERT OR REPLACE INTO precomputed_stats(stat_key, stat_value, updated_at) "
                "VALUES(?, ?, datetime('now'))",
                (_CURRENT_KEY, _json.dumps(response, default=str)),
            )
            wconn.commit()
    except Exception as e:
        logger.warning("capture current persist failed: %s", e)
    return response
