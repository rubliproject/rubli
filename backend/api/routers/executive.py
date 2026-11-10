"""
Executive Summary endpoint — consolidated data for the flagship report page.

Returns all data needed for the Executive Summary in a single call,
using precomputed tables for speed. Cached 10 minutes.
"""

import json
import logging
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Response as FastAPIResponse
from pydantic import BaseModel

from ..cache import SWR, shared
from ..dependencies import get_db, get_write_db
from ..config.constants import CURRENT_MODEL_VERSION
from ..public_labels import capture_pair_excluded, flagged_amounts
from ..services.active_model import load_active_global_coefficients
from ..config.constants import DATA_LAST_YEAR
from ..fx_rates import LATEST_RATE, MXN_USD_RATES

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/executive", tags=["executive"])

CACHE_TTL = 600  # 10 minutes


@router.get("/summary")
def get_executive_summary():
    """Return consolidated executive summary data.

    Uses precomputed_stats table for fast reads, with supplementary queries
    for administration breakdown and top vendors/institutions.
    Stale-while-revalidate, 10 minutes, persisted in precomputed_stats.
    """
    try:
        return _summary.get()
    except Exception as e:
        logger.error(f"Executive summary error: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate executive summary")


def _compute_summary() -> dict:
    with get_db() as conn:
        return _build_summary(conn)


_summary = SWR(_compute_summary, CACHE_TTL, persist_key="swr:executive/summary:v1")


def _query_top_vendors(cur) -> list[dict]:
    """Query top vendors by value, merging duplicates via vendor_canonical_map if available."""
    try:
        # Check if the dedup table exists
        cur.execute("SELECT 1 FROM vendor_canonical_map LIMIT 1")
        cur.fetchone()
        # Cluster-aware query: group by canonical_id, sum contracts/value, weighted avg risk
        cur.execute("""
            SELECT
                COALESCE(vcm.canonical_id, v.id) AS canonical_id,
                MAX(v.name) AS name,
                SUM(vs.total_contracts) AS total_contracts,
                SUM(vs.total_value_mxn) AS total_value_mxn,
                CASE WHEN SUM(vs.total_contracts) > 0
                     THEN SUM(vs.avg_risk_score * vs.total_contracts) / SUM(vs.total_contracts)
                     ELSE 0 END AS avg_risk_score
            FROM vendor_stats vs
            JOIN vendors v ON v.id = vs.vendor_id
            LEFT JOIN vendor_canonical_map vcm ON vcm.vendor_id = v.id
            GROUP BY COALESCE(vcm.canonical_id, v.id)
            ORDER BY total_value_mxn DESC
            LIMIT 60
        """)
        canon = True
    except Exception as e:
        logger.debug("vendor_canonical_map unavailable, using simple query: %s", e)
        # Fallback: no dedup table, use simple query
        cur.execute("""
            SELECT v.id AS canonical_id, v.name,
                   vs.total_contracts, vs.total_value_mxn, vs.avg_risk_score
            FROM vendor_stats vs
            JOIN vendors v ON v.id = vs.vendor_id
            ORDER BY vs.total_value_mxn DESC
            LIMIT 60
        """)
        canon = False
    rows = cur.fetchall()

    # «Received the most» never rests on a flagged amount (public_labels.amount_flag: suspect decimal or > 10B):
    # take those rows out of each vendor's total, then rank (AUDIT_DATA 11-07 A3 — Operadora Cicsa led on 3 rows
    # > 10B, 91 % of its 140.5 bn). The rows stay in the register, tagged.
    flagged = flagged_amounts(cur.connection, "c.amount_mxn <= 100000000000")
    out_by_vendor: dict = {}
    for _f, vid, _iid, amt in flagged.values():
        out_by_vendor[vid] = out_by_vendor.get(vid, 0.0) + amt
    if canon and out_by_vendor:
        ids = list(out_by_vendor)
        cmap = dict(cur.execute(
            f"SELECT vendor_id, canonical_id FROM vendor_canonical_map WHERE vendor_id IN ({','.join('?' * len(ids))})",
            ids).fetchall())
        merged: dict = {}
        for vid, amt in out_by_vendor.items():
            k = cmap.get(vid, vid)
            merged[k] = merged.get(k, 0.0) + amt
        out_by_vendor = merged
    ranked = sorted(
        ({"row": r, "value": (r["total_value_mxn"] or 0) - out_by_vendor.get(r["canonical_id"], 0.0),
          "flagged": out_by_vendor.get(r["canonical_id"], 0.0)} for r in rows),
        key=lambda d: d["value"], reverse=True)[:10]
    return [
        {
            "id": d["row"]["canonical_id"],
            "name": d["row"]["name"],
            "contracts": d["row"]["total_contracts"],
            "value_billions": round(d["value"] / 1e9, 1),
            "flagged_billions": round(d["flagged"] / 1e9, 1),
            "avg_risk": round(d["row"]["avg_risk_score"] or 0, 4),
        }
        for d in ranked
    ]


def _build_summary(conn) -> dict:
    """Build the full executive summary from precomputed + live data."""
    cur = conn.cursor()

    # 1. Load precomputed stats (4 JSON blobs — fast)
    precomputed = {}
    cur.execute("SELECT stat_key, stat_value FROM precomputed_stats")
    for row in cur.fetchall():
        val = row["stat_value"]
        precomputed[row["stat_key"]] = json.loads(val) if isinstance(val, str) else val

    overview = precomputed.get("overview", {})
    sectors_raw = precomputed.get("sectors", [])
    risk_dist_raw = precomputed.get("risk_distribution", [])
    yearly_raw = precomputed.get("yearly_trends", [])

    # 2. Headline (with year-adjusted USD total + real 2024 MXN via INPC deflators)
    DEFAULT_RATE = LATEST_RATE  # MXN_USD_RATES from api/fx_rates.py (Banxico FIX)

    # INPC deflators — Banco de México, base year 2024 = 1.000
    # real_2024 = nominal_year_x / INPC_DEFLATORS[year_x]
    INPC_DEFLATORS = {
        2002: 0.382, 2003: 0.404, 2004: 0.420, 2005: 0.442,
        2006: 0.456, 2007: 0.475, 2008: 0.493, 2009: 0.525,
        2010: 0.544, 2011: 0.567, 2012: 0.586, 2013: 0.607,
        2014: 0.632, 2015: 0.658, 2016: 0.671, 2017: 0.694,
        2018: 0.741, 2019: 0.777, 2020: 0.799, 2021: 0.824,
        2022: 0.885, 2023: 0.955, 2024: 1.000, 2025: 1.038, 2026: 1.072,  # INEGI INPC annual means; 2026 = Jan–Sep
    }
    DEFAULT_DEFLATOR = 0.700

    usd_clauses = "\n".join(
        f"            WHEN contract_year = {yr} THEN amount_mxn / {rate}"
        for yr, rate in MXN_USD_RATES.items()
    )
    real_clauses = "\n".join(
        f"            WHEN contract_year = {yr} THEN amount_mxn / {d}"
        for yr, d in INPC_DEFLATORS.items()
    )
    # Fast path: read from precomputed_stats (stored by precompute_stats.py)
    total_value_usd = overview.get("total_value_usd")
    total_value_real_mxn = overview.get("total_value_real_mxn")

    if total_value_usd is None or total_value_real_mxn is None:
        # Fallback: live query for DBs where precompute_stats hasn't run yet
        combined_sql = f"""
            SELECT
                SUM(CASE
{usd_clauses}
                    ELSE amount_mxn / {DEFAULT_RATE}
                END) AS total_value_usd,
                SUM(CASE
{real_clauses}
                    ELSE amount_mxn / {DEFAULT_DEFLATOR}
                END) AS total_value_real_mxn
            FROM contracts
            WHERE amount_mxn > 0 AND amount_mxn < 100000000000
        """
        combined_row = cur.execute(combined_sql).fetchone()
        total_value_usd = (combined_row["total_value_usd"] or 0.0) if combined_row else 0.0
        total_value_real_mxn = (combined_row["total_value_real_mxn"] or 0.0) if combined_row else 0.0

    headline = {
        "total_contracts": overview.get("total_contracts", 0),
        "total_value": overview.get("total_value_mxn", 0),
        "total_value_usd": round(total_value_usd, 0),
        "total_value_real_mxn": round(total_value_real_mxn, 0),
        "total_vendors": overview.get("total_vendors", 0),
        "total_institutions": overview.get("total_institutions", 0),
        "min_year": 2002,
        "max_year": DATA_LAST_YEAR,
    }

    # 3. Risk breakdown — handle both list format [{risk_level, count, ...}] and
    # dict format {critical: {count, pct}, ...} from older precomputed_stats
    if isinstance(risk_dist_raw, dict):
        risk_map = {
            level: {"risk_level": level, "count": v.get("count", 0),
                    "total_value_mxn": v.get("total_value_mxn", 0),
                    "percentage": v.get("pct", v.get("percentage", 0))}
            for level, v in risk_dist_raw.items()
        }
    else:
        risk_map = {r["risk_level"]: r for r in risk_dist_raw}
    critical = risk_map.get("critical", {})
    high = risk_map.get("high", {})
    medium = risk_map.get("medium", {})
    low = risk_map.get("low", {})
    # Risk shares over SCORED contracts: the four levels (ComprasMX loads unscored, level NULL)
    levels = (critical, high, medium, low)
    total_v = sum(lv.get("total_value_mxn", 0) or 0 for lv in levels) or headline["total_value"] or 1
    total_c = sum(lv.get("count", 0) or 0 for lv in levels) or headline["total_contracts"] or 1

    value_at_risk = critical.get("total_value_mxn", 0) + high.get("total_value_mxn", 0)

    risk = {
        "critical_count": critical.get("count", 0),
        "critical_value": critical.get("total_value_mxn", 0),
        "critical_pct": critical.get("percentage", 0),
        "high_count": high.get("count", 0),
        "high_value": high.get("total_value_mxn", 0),
        "high_pct": high.get("percentage", 0),
        "medium_count": medium.get("count", 0),
        "medium_value": medium.get("total_value_mxn", 0),
        "medium_pct": medium.get("percentage", 0),
        "low_count": low.get("count", 0),
        "low_value": low.get("total_value_mxn", 0),
        "low_pct": low.get("percentage", 0),
        "value_at_risk": value_at_risk,
        "value_at_risk_pct": round(value_at_risk / total_v * 100, 1) if total_v else 0,
        "high_risk_rate": round(
            (critical.get("count", 0) + high.get("count", 0)) / total_c * 100, 1
        ),
        "unscored_count": risk_map.get("unknown", {}).get("count", 0),  # outside every share above
    }

    # 4. Procedures
    procedures = {
        "direct_award_pct": overview.get("direct_award_pct"),
        "single_bid_pct": overview.get("single_bid_pct"),
    }

    # 5. Sectors (all 12, enriched with high-risk pct) — support old and new key names
    sectors = []
    for s in sectors_raw:
        t = sum(s.get(f"{k}_risk_count", 0) or 0 for k in ("low", "medium", "high", "critical")) or 1  # scored
        hp = (s.get("high_risk_count", 0) + s.get("critical_risk_count", 0)) / t
        sectors.append({
            "code": s.get("code") or s.get("sector_name_es", "").lower() or str(s.get("sector_id", "")),
            "name": s.get("name") or s.get("sector_name_es") or s.get("sector_name", ""),
            "contracts": s.get("total_contracts", 0),
            "value": s.get("total_value_mxn", 0),
            "avg_risk": round(s.get("avg_risk_score", 0), 4),
            "high_plus_pct": round(hp * 100, 1),
        })

    # 6. Top institutions by value (from materialized table)
    cur.execute("""
        SELECT ist.institution_id, i.name,
               ist.total_contracts, ist.total_value_mxn, ist.avg_risk_score
        FROM institution_stats ist
        JOIN institutions i ON i.id = ist.institution_id
        ORDER BY ist.total_value_mxn DESC
        LIMIT 10
    """)
    top_institutions = [
        {
            "name": row["name"],
            "contracts": row["total_contracts"],
            "value": row["total_value_mxn"] or 0,
            "avg_risk": round(row["avg_risk_score"] or 0, 4),
        }
        for row in cur.fetchall()
    ]

    # 7. Top vendors by value (cluster-aware if vendor_canonical_map exists)
    top_vendors = _query_top_vendors(cur)

    # 8. Administration breakdown (from precomputed_stats — was 90s live query)
    administrations = precomputed.get("administrations", [])

    # 9. Yearly trends (filtered to meaningful years) — with real 2024 MXN
    yearly_trends = [
        {
            "year": y["year"],
            "contracts": y["contracts"],
            "value_billions": round(y.get("value_mxn", 0) / 1e9, 1),
            "real_value_billions": round(
                (y.get("value_mxn", 0) / INPC_DEFLATORS.get(y["year"], DEFAULT_DEFLATOR)) / 1e9, 1
            ),
            "avg_risk": y.get("avg_risk", 0),
        }
        for y in yearly_raw
        if 2002 <= y.get("year", 0) <= DATA_LAST_YEAR and y.get("contracts", 0) > 100
    ]

    # 9b. Enrich administration data with real 2024 MXN: each term's own years, deflated one by one
    # and applied as the term's value-weighted deflator. (The old midpoint table was keyed by
    # lowercase names that never matched «Fox»/«AMLO»… so every term got nominal × 1/0.7.)
    def _real_ratio(years: str) -> float:
        lo, _, hi = (years or "").partition("-")
        lo_y = int(lo) if lo.isdigit() else 0
        hi_y = int(hi) if hi.isdigit() else DATA_LAST_YEAR
        nom = real = 0.0
        for y in yearly_raw:
            if lo_y <= y.get("year", 0) <= hi_y:
                v = y.get("value_mxn", 0) or 0
                nom += v
                real += v / INPC_DEFLATORS.get(y["year"], DEFAULT_DEFLATOR)
        return real / nom if nom else 1.0

    administrations_enriched = []
    for admin in administrations:
        nominal = admin.get("value", 0) or 0
        enriched = dict(admin)
        enriched["real_value"] = round(nominal * _real_ratio(admin.get("years", "")), 0)
        administrations_enriched.append(enriched)

    # 10. Ground truth validation — use precomputed stats if available (avoids 90s live scan)
    gt_precomputed = precomputed.get("ground_truth")
    try:
        if gt_precomputed:
            gt_cases = gt_precomputed.get("cases", 0)
            gt_vendors = gt_precomputed.get("vendors", 0)
            gt_contracts = gt_precomputed.get("contracts", 0)
            high_plus_rate = gt_precomputed.get("high_plus_rate", 0)
        else:
            # Fallback: live query (slow — ~90s on cold VPS; runs if precompute_stats hasn't been run)
            gt_cases = cur.execute("SELECT COUNT(*) FROM ground_truth_cases").fetchone()[0]
            gt_vendors = cur.execute(
                "SELECT COUNT(*) FROM ground_truth_vendors WHERE vendor_id IS NOT NULL"
            ).fetchone()[0]
            gt_row = cur.execute(
                "SELECT COUNT(*) AS total, "
                "SUM(CASE WHEN risk_score >= 0.40 THEN 1 ELSE 0 END) AS high_plus, "
                "COUNT(risk_score) AS scored "
                "FROM contracts WHERE vendor_id IN "
                "(SELECT DISTINCT vendor_id FROM ground_truth_vendors WHERE vendor_id IS NOT NULL)"
            ).fetchone()
            gt_contracts = gt_row[0] or 0
            gt_high = gt_row[1] or 0
            high_plus_rate = round(gt_high / gt_row[2] * 100, 1) if gt_row[2] else 0
    except Exception as e:
        logger.warning("Ground truth query failed, using hardcoded fallback: %s", e)
        gt_cases, gt_vendors, gt_contracts = 1417, 1368, 337000
        high_plus_rate = 36.1

    # Per-case detection stats — uses precomputed vendor_stats to avoid 3.1M scan
    try:
        case_rows = cur.execute("""
            SELECT gc.case_name AS name, gc.case_type AS type,
                   COALESCE(SUM(vs.total_contracts), 0) AS contracts,
                   ROUND(COALESCE(
                       SUM(vs.avg_risk_score * vs.total_contracts)
                       / NULLIF(SUM(vs.total_contracts), 0), 0
                   ), 4) AS avg_score,
                   COALESCE(gc.notes, '') AS sector
            FROM ground_truth_cases gc
            JOIN ground_truth_vendors gv ON gv.case_id = gc.id
            LEFT JOIN vendor_stats vs ON vs.vendor_id = gv.vendor_id
            WHERE gv.vendor_id IS NOT NULL
            GROUP BY gc.id
            ORDER BY contracts DESC
            LIMIT 25
        """).fetchall()
        case_details = [
            {**dict(r), "high_plus_pct": round(min(r["avg_score"] * 180, 100), 1)}
            for r in case_rows
        ]
    except Exception as e:
        logger.warning("Per-case detection query failed: %s", e)
        case_details = []

    ground_truth = {
        "cases": gt_cases,
        "vendors": gt_vendors,
        "contracts": gt_contracts,
        # C6 canonical split (precompute only): independently sourced / tier A/B
        "independent": (gt_precomputed or {}).get("independent"),
        "tier_ab": (gt_precomputed or {}).get("tier_ab"),
        "high_plus_rate": high_plus_rate,
        "case_details": case_details,
    }

    # 11. Model info — live from model_calibration table
    try:  # the active model's own input count (v0.9.2: 17), not a hard-coded v0.8.5 figure
        n_features = len(load_active_global_coefficients(conn)) or 18
    except Exception:
        n_features = 18
    # Defensive: older deploy DBs may lack test_auc / temporal_metrics columns
    try:
        cal_row = cur.execute(
            "SELECT model_version, test_auc, brier_score, pu_correction_factor, "
            "created_at, temporal_metrics "
            "FROM model_calibration WHERE (sector_id = 0 OR sector_id IS NULL) "
            "ORDER BY created_at DESC LIMIT 1"
        ).fetchone()
    except Exception as e:
        logger.debug("model_calibration temporal_metrics column missing, retrying: %s", e)
        try:
            cal_row = cur.execute(
                "SELECT model_version, brier_score, pu_correction_factor, created_at "
                "FROM model_calibration WHERE (sector_id = 0 OR sector_id IS NULL) "
                "ORDER BY created_at DESC LIMIT 1"
            ).fetchone()
        except Exception as e2:
            logger.warning("model_calibration query failed entirely: %s", e2)
            cal_row = None

    if cal_row:
        train_auc = None
        temporal_metrics_raw = None
        try:
            temporal_metrics_raw = cal_row["temporal_metrics"]
        except (IndexError, KeyError):
            pass
        if temporal_metrics_raw:
            try:
                tm = json.loads(temporal_metrics_raw)
                train_auc = tm.get("train_auc")
            except (json.JSONDecodeError, TypeError):
                pass
        test_auc_val = None
        try:
            test_auc_val = cal_row["test_auc"]
        except (IndexError, KeyError):
            pass
        # 'v6.0' is the DB version name for the v0.8.5 model (CAL-v8-202605020212 naming mismatch)
        raw_version = cal_row["model_version"] or ""
        version_str = "v0.8.5" if raw_version == "v6.0" else raw_version
        model = {
            "version": version_str,
            "features": n_features,
            "sub_models": 1 if version_str >= 'v0.9' else 13,
            "auc": round(test_auc_val, 3) if test_auc_val else None,
            "train_auc": round(train_auc, 3) if train_auc else None,
            "brier": round(cal_row["brier_score"], 3) if cal_row["brier_score"] else None,
            "pu_correction": round(cal_row["pu_correction_factor"], 3) if cal_row["pu_correction_factor"] else None,
        }
    else:
        model = {
            "version": CURRENT_MODEL_VERSION,
            "features": n_features,
            "sub_models": 1,
            "auc": None,
            "train_auc": None,
            "brier": None,
            "pu_correction": None,
        }

    # Lift from v4.0 comparison report (stable between retrainings)
    model["lift"] = 4.04

    # Top predictors straight from the active calibration row, so the bundle can't drift from the score.
    try:
        coefs = load_active_global_coefficients(cur)
    except Exception as e:
        logger.warning("active coefficients unavailable: %s", e)
        coefs = {}
    # v0.9.2 stores raw-unit betas (not comparable across inputs): rank by the published display
    # coefficients (T x standardised beta) in feature_importance instead.
    try:
        fi = cur.execute("SELECT factor_name, coefficient FROM feature_importance WHERE model_version = ? "
                         "AND sector_id IS NULL ORDER BY rank", (CURRENT_MODEL_VERSION,)).fetchall()
    except Exception:
        fi = []
    if fi:
        coefs = {r[0]: r[1] for r in fi}
    ranked = sorted(((k, v) for k, v in coefs.items() if v), key=lambda kv: -abs(kv[1]))[:12]
    model["features"] = sum(1 for v in coefs.values() if v) or model["features"]
    model["top_predictors"] = [
        {"name": k, "beta": round(v, 3), "direction": "positive" if v > 0 else "negative"} for k, v in ranked
    ]
    model["counterintuitive"] = [
        "Breadth raises the indicator: vendors already selling to many federal institutions before the contract year "
        "score higher (on a log scale, so each extra institution adds less). It reflects which suppliers appear in documented national cases; it is "
        "not a capture detector — use the capture view for single-institution capture.",
        "Very uneven contract sizes (price_volatility) are among the strongest predictors — vendors whose contract amounts vary wildly score higher.",
        "Direct award carries almost no weight on its own — concentration and contract-size irregularities dominate the signal.",
    ]

    return {
        "headline": headline,
        "risk": risk,
        "procedures": procedures,
        "sectors": sectors,
        "top_institutions": top_institutions,
        "top_vendors": top_vendors,
        "administrations": administrations_enriched,
        "yearly_trends": yearly_trends,
        "ground_truth": ground_truth,
        "model": model,
        "generated_at": datetime.utcnow().isoformat(),
    }


_CAPTURE_TTL = 3600  # 1 hour — capture_results changes only on a precompute run


def _short_label(name: str) -> str:
    """Derive a ≤10-char display label from an institution name."""
    # Strip trailing punctuation/spaces
    name = name.strip().rstrip(".,")
    if len(name) <= 10:
        return name
    # Strip geographic qualifier after dash (e.g. "ASIPONA- Salina Cruz" → "ASIPONA")
    import re
    m = re.match(r'^([A-Z0-9]+)', name)
    if m and len(m.group(1)) >= 3:
        return m.group(1)
    # Take the part before first comma or " - "
    short = name.split(",")[0].split(" - ")[0].strip()
    if len(short) <= 10:
        return short
    # Acronym: initials of words ≥3 chars starting uppercase
    words = short.split()
    acronym = "".join(w[0] for w in words if len(w) >= 3 and w[0].isupper())
    return acronym if len(acronym) >= 2 else short[:9]


@router.get("/capture-leaders")
def get_capture_leaders():
    """Return top 5 institutional-capture leaders from capture_results with peer shares.

    Each row: institution label, top-vendor peak share %, second-vendor share %, capture gap.
    Used by Executive Summary Finding 04 (P6 Cleveland pair chart).
    Stale-while-revalidate, 1 hour, persisted in precomputed_stats (shared by all workers, survives deploys).
    """
    try:
        return _capture.get()
    except Exception as e:
        logger.error(f"Capture leaders error: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch capture leaders")


def _compute_capture_leaders() -> dict:
    with get_db() as conn:
        cur = conn.cursor()
        # GT FPs, personas físicas, and suspect-decimal pairs never lead
        # (#1 was a private individual on a ×1000 contract, B5).
        allowed = [
            r[0] for r in conn.execute(
                "SELECT rowid, vendor_id, institution_id FROM capture_results"
            ).fetchall()
            if not capture_pair_excluded(conn, r[1], r[2])
        ]
        cur.execute("""
            WITH capture_top5 AS (
                SELECT institution_id, vendor_id AS cap_vendor_id,
                       institution_name, vendor_name AS cap_vendor_name,
                       peak_year, peak_share_pct, score
                FROM capture_results
                WHERE rowid IN (SELECT value FROM json_each(?))
                ORDER BY score DESC LIMIT 5
            ),
            inst_peak_totals AS (
                SELECT c.institution_id,
                       c.contract_year AS yr,
                       SUM(c.amount_mxn) AS total
                FROM contracts c
                JOIN capture_top5 ct
                     ON c.institution_id = ct.institution_id
                    AND c.contract_year = ct.peak_year
                WHERE c.amount_mxn > 0
                GROUP BY c.institution_id, yr
            ),
            inst_vendor_shares AS (
                SELECT c.institution_id, c.vendor_id, v.name AS vendor_name,
                       ROUND(SUM(c.amount_mxn) * 100.0 / ipt.total, 1) AS share_pct,
                       ROW_NUMBER() OVER (
                           PARTITION BY c.institution_id
                           ORDER BY SUM(c.amount_mxn) DESC
                       ) AS rn
                FROM contracts c
                JOIN vendors v ON c.vendor_id = v.id
                JOIN capture_top5 ct
                     ON c.institution_id = ct.institution_id
                    AND c.contract_year = ct.peak_year
                JOIN inst_peak_totals ipt ON c.institution_id = ipt.institution_id
                WHERE c.amount_mxn > 0
                GROUP BY c.institution_id, c.vendor_id, v.name, ipt.total
            )
            SELECT ct.institution_name,
                   MAX(CASE WHEN ivs.rn = 1 THEN ivs.share_pct END) AS top_pct,
                   MAX(CASE WHEN ivs.rn = 2 THEN ivs.share_pct END) AS second_pct,
                   ct.peak_year,
                   ct.score
            FROM capture_top5 ct
            JOIN inst_vendor_shares ivs
                 ON ct.institution_id = ivs.institution_id AND ivs.rn <= 2
            GROUP BY ct.institution_id, ct.institution_name, ct.peak_year, ct.score
            ORDER BY ct.score DESC
        """, (json.dumps(allowed),))
        rows = cur.fetchall()

    leaders = []
    for row in rows:
        top = round(row["top_pct"] or 0, 1)
        second = round(row["second_pct"] or 0, 1)
        leaders.append({
            "label": _short_label(row["institution_name"]),
            "institution_name": row["institution_name"],
            "top": top,
            "second": second,
            "gap": round(top - second, 1),
            "peak_year": row["peak_year"],
            "captured": (top - second) >= 40,
        })

    return {"leaders": leaders, "v": 2}


_capture = SWR(_compute_capture_leaders, _CAPTURE_TTL, persist_key="swr:executive/capture-leaders:v2")


# ---------------------------------------------------------------------------
# Dashboard bundle — single endpoint that returns all 6 Dashboard blocks
# concurrently so the frontend makes one round-trip instead of six.
# ---------------------------------------------------------------------------

_BUNDLE_TTL = 600  # 10 min, as the summary and nginx's proxy cache; visitors never wait on a refresh (SWR)


class DashboardBundleResponse(BaseModel):
    """All 6 Dashboard data blocks bundled into a single response.

    Every field is Optional — if an individual block fails it will be null
    rather than 500-ing the whole bundle.  The frontend falls back per-section.
    """
    fast_dashboard: Optional[Dict[str, Any]] = None
    recent_critical: Optional[Dict[str, Any]] = None
    aria_stats: Optional[Dict[str, Any]] = None
    executive_summary: Optional[Dict[str, Any]] = None
    case_stats: Optional[Dict[str, Any]] = None
    capture_leaders: Optional[Dict[str, Any]] = None


def _fetch_fast_dashboard() -> dict:
    """Call the fast-dashboard handler with a throwaway Response object."""
    from .stats import get_fast_dashboard
    dummy = FastAPIResponse()
    result = get_fast_dashboard(dummy)
    # FastDashboardResponse is a Pydantic model; serialise to plain dict.
    if hasattr(result, "model_dump"):
        return result.model_dump()
    return dict(result)


def _fetch_recent_critical() -> dict:
    """Return top-5 most-recent critical contracts as a ContractListResponse dict.

    Uses contract_service directly (plain values, no Query() wrappers) so we
    avoid the FastAPI dependency-injection machinery while keeping the exact
    same response shape as GET /contracts?risk_level=critical&per_page=5&...
    """
    from ..services.contract_service import contract_service
    from ..models.contract import ContractListItem, PaginationMeta

    with get_db() as conn:
        result = contract_service.list_contracts(
            conn,
            risk_level="critical",
            per_page=5,
            page=1,
            sort_by="contract_date",
            sort_order="desc",
        )
    items = [ContractListItem(**item).model_dump() for item in result.data]
    pagination = PaginationMeta(**result.pagination).model_dump()
    return {"data": items, "pagination": pagination}


def _fetch_aria_stats() -> dict:
    """Call the ARIA /aria/stats handler — this is what the frontend's
    ariaApi.getStats() hits (AriaStatsResponse with latest_run tier counts),
    NOT investigation/stats."""
    from .aria import get_aria_stats
    with get_db() as conn:
        result = get_aria_stats(conn)
    if hasattr(result, "model_dump"):
        return result.model_dump()
    return dict(result)


def _fetch_case_stats() -> dict:
    """Call the cases /stats handler."""
    from .cases import get_stats as _get_case_stats
    result = _get_case_stats()
    if hasattr(result, "model_dump"):
        return result.model_dump()
    # dict or Pydantic dict-compatible
    if isinstance(result, dict):
        return result
    return dict(result)


def _fetch_executive_summary() -> dict:
    """Call the executive summary handler (same file)."""
    result = get_executive_summary()
    if isinstance(result, dict):
        return result
    if hasattr(result, "model_dump"):
        return result.model_dump()
    return dict(result)


def _fetch_capture_leaders() -> dict:
    """Call the capture leaders handler (same file)."""
    result = get_capture_leaders()
    if isinstance(result, dict):
        return result
    if hasattr(result, "model_dump"):
        return result.model_dump()
    return dict(result)


# Mapping: bundle key → fetcher function
_BUNDLE_FETCHERS: dict = {
    "fast_dashboard": _fetch_fast_dashboard,
    "recent_critical": _fetch_recent_critical,
    "aria_stats": _fetch_aria_stats,
    "executive_summary": _fetch_executive_summary,
    "case_stats": _fetch_case_stats,
    "capture_leaders": _fetch_capture_leaders,
}


_BLOCK_TIMEOUT = 22  # seconds — shared deadline for all blocks (they run concurrently); stays under the ~30s gateway timeout while giving cold queries room to finish


def _build_bundle() -> dict:
    """Run all 6 fetchers concurrently and return the assembled bundle dict.

    Each fetcher runs in its own thread (submitted up-front, so they all run in
    parallel).  We then wait for each future up to a SHARED deadline
    (_BLOCK_TIMEOUT total — the futures run concurrently, so this caps the whole
    call, not each block).  A block that misses the deadline or raises comes
    back null — a timeout is NEVER allowed to propagate, so the endpoint cannot
    500.  Stragglers are NOT waited on (shutdown(wait=False)); they finish in
    the background and warm their own handler caches for the next request.
    """
    results: dict = {}
    executor = ThreadPoolExecutor(max_workers=6)
    try:
        future_to_key = {executor.submit(fn): key for key, fn in _BUNDLE_FETCHERS.items()}
        deadline = time.time() + _BLOCK_TIMEOUT
        for future, key in future_to_key.items():
            remaining = max(0.1, deadline - time.time())
            try:
                results[key] = future.result(timeout=remaining)
            except Exception as exc:  # TimeoutError (too slow) or any failure
                logger.warning("dashboard-bundle: block '%s' unavailable: %s", key, exc)
                results[key] = None
    finally:
        # Never block the response on a stuck/slow block.
        executor.shutdown(wait=False)

    for key in _BUNDLE_FETCHERS:
        results.setdefault(key, None)
    return results


@router.get("/dashboard-bundle", response_model=DashboardBundleResponse)
def get_dashboard_bundle():
    """Return all 6 Executive Dashboard data blocks in a single cached response.

    The 6 blocks are fetched concurrently so total latency equals the slowest
    individual block (not their sum).  Each block uses the same caching path
    as its standalone endpoint; the bundle adds a 10-minute stale-while-revalidate cache
    on top so repeated cold-cache hits still converge quickly.

    Any block that raises an exception is set to null rather than failing the
    whole response — the frontend falls back per-section.
    """
    return _bundle.get()


# Stale-while-revalidate, persisted: a deploy or a recycled worker serves the last bundle at
# once and rebuilds behind it. A bundle with a timed-out block (null) is served but kept stale,
# so the next request retries it — the handler caches will have warmed by then.
_bundle = SWR(_build_bundle, _BUNDLE_TTL, persist_key="swr:executive/dashboard-bundle:v1",
              complete=lambda b: all(v is not None for v in b.values()))


# ─── Portada objects (2026-10-19): «Los Cauces» and «El Campo» ────────────────
# Owner pick C3 (concepts/portada/C3.html) and B (B.html).

from ..config.constants import FLAG_THRESHOLD, MAX_CONTRACT_VALUE  # noqa: E402
from ..public_labels import is_persona_fisica, label_sets  # noqa: E402

_CAUCES_KEY = "portada_cauces_v1"
_CAUCES_COLUMNS = ["sector_id", "proc", "risk", "n", "mxn"]
_cauces_mem: Dict[str, Any] = {}
_cauces_lock = threading.Lock()


def _build_cauces(conn) -> Dict[str, Any]:
    """sector × procedure × risk level, contracts and money. One full scan
    (~40 s cold), so the result is persisted in precomputed_stats.
    proc: da = adjudicación directa, sb = competitive with one recorded winner (not bidder), comp = the rest.
    Amounts > 100B are rejected; null/zero amounts and unscored rows are left out."""
    rows = conn.execute(
        """
        SELECT COALESCE(sector_id, 12),
               CASE WHEN is_direct_award = 1 THEN 'da' WHEN is_single_bid = 1 THEN 'sb' ELSE 'comp' END,
               risk_level, COUNT(*), SUM(amount_mxn),
               SUM(CASE WHEN amount_mxn > ? THEN 1 ELSE 0 END)
        FROM contracts
        WHERE amount_mxn > 0 AND amount_mxn <= ? AND risk_level IS NOT NULL
        GROUP BY 1, 2, 3
        ORDER BY 1, 2, 3
        """,
        (FLAG_THRESHOLD, MAX_CONTRACT_VALUE),
    ).fetchall()
    return {
        "columns": _CAUCES_COLUMNS,
        "rows": [[r[0], r[1], r[2], r[3], round(r[4] or 0, 2)] for r in rows],
        "flagged_10b": sum(r[5] for r in rows),
        "computed_at": datetime.utcnow().isoformat(),
    }


@router.get("/cauces")
def get_cauces():
    """«Los Cauces» (Portada): where the peso goes, sector → procedure → risk level.
    Persisted under precomputed_stats[portada_cauces_v1]; rebuilt when the
    `overview` stat is newer (an ETL/precompute run)."""
    with get_db() as conn:
        row = conn.execute(
            "SELECT p.stat_value, p.updated_at >= COALESCE((SELECT updated_at FROM precomputed_stats WHERE stat_key = 'overview'), '')"
            " FROM precomputed_stats p WHERE p.stat_key = ?",
            (_CAUCES_KEY,),
        ).fetchone()
        if row and row[1]:
            if _cauces_mem.get("raw") != row[0]:
                _cauces_mem.update(raw=row[0], payload=json.loads(row[0]))
            return _cauces_mem["payload"]
    with _cauces_lock:
        if _cauces_mem.get("fresh"):
            return _cauces_mem["payload"]
        with get_db() as conn:
            payload = _build_cauces(conn)
        _cauces_mem.update(raw=None, payload=payload, fresh=True)
        try:
            with get_write_db() as wconn:
                wconn.execute(
                    "INSERT OR REPLACE INTO precomputed_stats(stat_key, stat_value, updated_at) VALUES(?,?,strftime('%Y-%m-%dT%H:%M:%S','now'))",
                    (_CAUCES_KEY, json.dumps(payload)),
                )
                wconn.commit()
        except Exception as e:
            logger.warning("cauces persist failed: %s", e)
        return payload


_FIELD_COLUMNS = ["id", "name", "tier", "risk", "mxn", "n", "sector", "da", "y0", "doc", "novel"]
_field_mem: Dict[str, Any] = {}


@router.get("/vendor-field")
def get_vendor_field():
    """«El Campo» (Portada): every public tier 1–3 vendor of the ARIA queue as one
    columnar row. Off the field: suppressed labels, GT false positives and
    personas físicas (same rule as ranking_safe). doc = documented case;
    novel = no public case link (documented or lead). No RFC travels."""
    with get_db() as conn:
        key = conn.execute("SELECT MAX(computed_at), COUNT(*) FROM aria_queue").fetchone()
        if _field_mem.get("key") == key:
            return _field_mem["payload"]
        # owner 11-07 speed: one copy for all 6 workers (a cold worker took ~22 s)
        payload = shared(f"shared:executive/vendor-field:v1:{key[0]}:{key[1]}", 86400,
                         lambda: _build_vendor_field(conn, key))
    _field_mem.update(key=key, payload=payload)
    return payload


def _build_vendor_field(conn, key):
    s = label_sets(conn)
    off = set(s["suppressed"]) | set(s["fp"])
    linked = set(s["documented"]) | set(s["leads"])
    rows = conn.execute(
        """
        SELECT q.vendor_id, q.vendor_name, q.ips_tier, q.avg_risk_score, q.total_value_mxn,
               q.total_contracts, q.primary_sector_id, q.direct_award_rate,
               vs.first_contract_year, v.is_individual, v.rfc
        FROM aria_queue q
        JOIN vendors v ON v.id = q.vendor_id
        LEFT JOIN vendor_stats vs ON vs.vendor_id = q.vendor_id
        WHERE q.ips_tier IN (1, 2, 3) AND q.total_value_mxn > 0
        ORDER BY q.ips_final DESC
        """
    ).fetchall()
    out = [
        [r[0], r[1], r[2], round(r[3], 4) if r[3] is not None else None, round(r[4], 2), r[5],
         r[6] or 12, round(r[7], 3) if r[7] is not None else None, r[8],
         int(r[0] in s["documented"]), int(r[0] not in linked)]
        for r in rows
        if r[0] not in off and not is_persona_fisica(r[9], r[10])
    ]
    return {"columns": _FIELD_COLUMNS, "rows": out, "n_queue": len(rows), "computed_at": key[0]}
