"""
Pre-compute dashboard statistics for instant loading.
Run this after ETL or data updates.
"""
import os
import sys
import sqlite3
import json
import time
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from api.administrations import ADMINISTRATIONS  # noqa: E402
from api.fx_rates import LATEST_RATE, MXN_USD_RATES  # noqa: E402
from api.config.constants import DATA_LAST_YEAR, PUBLIC_REGISTER_SQL, RISK_THRESHOLDS_V6  # noqa: E402
import os as _os, sys as _sys  # noqa: E401
_sys.path.insert(0, _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__))))  # backend/ → api.* (also for `python scripts/x.py`)
from api.config.constants import proc_den, proc_known  # noqa: E402  DQ1 § 2

try:
    from scripts._institution_canonical import install_contracts_canon
    from scripts._out_db import open_db
except ImportError:  # run as a plain file from backend/scripts
    from _institution_canonical import install_contracts_canon
    from _out_db import open_db

DB_PATH = os.environ.get("DATABASE_PATH", "RUBLI_NORMALIZED.db")

HIGH_RISK = RISK_THRESHOLDS_V6['high']  # 0.40, same ladder as the API and getRiskLevelFromScore
FIRST_YEAR = 2002      # 20 rows dated 2000-01 are excluded from public aggregates (C8/D32)
DA_CODED_FROM = 2011   # procedure type is not coded before 2011 (~1% "direct" in 2002-10)
LAST_YEAR = 2026        # CompraNet to Sep 2025, then ComprasMX open data to the data cut

# ---------------------------------------------------------------------------
# PHI helpers (mirrors procurement_health.py — keep thresholds in sync)
# ---------------------------------------------------------------------------

_PHI_THRESHOLDS = {
    "competition_rate": {"green": 60, "yellow": 35, "direction": "higher_is_better"},
    "single_bid_rate":  {"green": 10, "yellow": 20, "direction": "lower_is_better"},
    "avg_bidders":      {"green": 3.0, "yellow": 2.0, "direction": "higher_is_better"},
    "hhi":              {"green": 1000, "yellow": 1800, "direction": "lower_is_better"},
    "short_ad_rate":    {"green": 10, "yellow": 20, "direction": "lower_is_better"},
    "amendment_rate":   {"green": 10, "yellow": 20, "direction": "lower_is_better"},
}

def _rnd(v, n):
    """round() keeping an unknown share None (DQ1 § 2: no procedure type before 2011)."""
    return None if v is None else round(v, n)


def _phi_traffic_light(indicator: str, value: float) -> str:
    t = _PHI_THRESHOLDS[indicator]
    if t["direction"] == "higher_is_better":
        if value >= t["green"]:   return "green"
        elif value >= t["yellow"]: return "yellow"
        else:                      return "red"
    else:
        if value <= t["green"]:   return "green"
        elif value <= t["yellow"]: return "yellow"
        else:                      return "red"


def _phi_grade(greens: int, total: int) -> str:
    """Legacy fallback."""
    if total == 0:
        return "N/A"
    ratio = greens / total
    if ratio >= 0.8:   return "A"
    elif ratio >= 0.6: return "B"
    elif ratio >= 0.4: return "C"
    elif ratio >= 0.2: return "D"
    else:              return "F"


# 10-tier weighted composite grade ----------------------------------------

_PHI_NORM = {
    "competition_by_value": (5.0,  85.0, True),
    "single_bid_rate":      (60.0,  0.0, False),
    "avg_bidders":          (1.0,   5.0, True),
    "hhi":                  (6000.0, 500.0, False),
    "short_ad_rate":        (80.0,  0.0, False),
    "amendment_rate":       (50.0,  0.0, False),
}

_PHI_WEIGHTS = {
    "competition_by_value": 0.40,
    "single_bid_rate":      0.20,
    "avg_bidders":          0.15,
    "hhi":                  0.15,
    "short_ad_rate":        0.05,
    "amendment_rate":       0.05,
}

_PHI_GRADE10 = [
    (90, "S"), (80, "A"), (70, "B+"), (60, "B"),
    (50, "C+"), (40, "C"), (30, "D"), (20, "D-"),
    (10, "F"), (0,  "F-"),
]


def _phi_normalize(key: str, value: float) -> float:
    worst, best, _ = _PHI_NORM[key]
    if abs(best - worst) < 1e-9:
        return 50.0
    raw = (value - worst) / (best - worst)
    return max(0.0, min(100.0, raw * 100.0))


def _phi_grade10(score: float) -> str:
    for threshold, grade in _PHI_GRADE10:
        if score >= threshold:
            return grade
    return "F-"


def _compute_phi_for(cursor: sqlite3.Cursor,
                     sector_id=None, year_min=None, year_max=None) -> dict:
    """Compute all 6 PHI indicators. Returns indicator dict."""
    where_parts = ["c.amount_mxn > 0"]
    params: list = []
    if sector_id is not None:
        where_parts.append("c.sector_id = ?")
        params.append(sector_id)
    if year_min is not None:
        where_parts.append("c.contract_year >= ?")
        params.append(year_min)
    if year_max is not None:
        where_parts.append("c.contract_year <= ?")
        params.append(year_max)
    where = " AND ".join(where_parts)

    # 1. Competition rate
    row = cursor.execute(f"""
        SELECT COUNT(*) as total,
               SUM(CASE WHEN is_direct_award = 1 THEN 1 ELSE 0 END) as direct_awards,
               SUM(amount_mxn) as total_value,
               SUM(CASE WHEN is_direct_award = 1 THEN amount_mxn ELSE 0 END) as da_value
        FROM contracts c WHERE {where}
    """, params).fetchone()
    total = row["total"] or 0
    if total == 0:
        return {}
    direct_awards = row["direct_awards"] or 0
    total_value = row["total_value"] or 1
    da_value = row["da_value"] or 0
    competition_rate = round((1 - direct_awards / total) * 100, 1)
    competition_by_value = round((1 - da_value / total_value) * 100, 1)
    da_rate_value = round(da_value / total_value * 100, 1)

    # 2. Single bid rate
    sb = cursor.execute(f"""
        SELECT COUNT(*) as competitive,
               SUM(CASE WHEN is_single_bid = 1 THEN 1 ELSE 0 END) as single_bids
        FROM contracts c WHERE {where} AND is_direct_award = 0
    """, params).fetchone()
    competitive = sb["competitive"] or 0
    single_bids = sb["single_bids"] or 0
    single_bid_rate = round(single_bids / max(competitive, 1) * 100, 1)

    # 3. Average bidders
    br = cursor.execute(f"""
        SELECT AVG(bidder_count) as avg_bidders
        FROM (
            SELECT procedure_number, COUNT(DISTINCT vendor_id) as bidder_count
            FROM contracts c
            WHERE {where} AND is_direct_award = 0 AND procedure_number IS NOT NULL
            GROUP BY procedure_number
        )
    """, params).fetchone()
    avg_bidders = round(br["avg_bidders"] or 0, 2)

    # 4. HHI
    hhi_rows = cursor.execute(f"""
        SELECT vendor_id, SUM(amount_mxn) as vendor_total
        FROM contracts c
        WHERE {where} AND vendor_id IS NOT NULL
        GROUP BY vendor_id
    """, params).fetchall()
    hhi = 0.0
    for hr in hhi_rows:
        share_pct = (hr["vendor_total"] / total_value) * 100
        hhi += share_pct ** 2
    hhi = round(hhi, 1)

    # 5. Short ad period rate
    ar = cursor.execute(f"""
        SELECT COUNT(*) as with_ad,
               SUM(CASE WHEN publication_delay_days < 15 THEN 1 ELSE 0 END) as short_ads
        FROM contracts c
        WHERE {where} AND is_direct_award = 0 AND publication_delay_days > 0
    """, params).fetchone()
    with_ad = ar["with_ad"] or 0
    short_ads = ar["short_ads"] or 0
    short_ad_rate = round(short_ads / max(with_ad, 1) * 100, 1)

    # 6. Amendment rate
    amr = cursor.execute(f"""
        SELECT COUNT(*) as total_with_data,
               SUM(CASE WHEN has_amendment = 1 THEN 1 ELSE 0 END) as amendments
        FROM contracts c
        WHERE {where} AND has_amendment IS NOT NULL
    """, params).fetchone()
    amend_total = amr["total_with_data"] or 0
    amendments = amr["amendments"] or 0
    amendment_rate = round(amendments / max(amend_total, 1) * 100, 1)

    indicators = {
        "competition_rate": {
            "value": competition_rate,
            "light": _phi_traffic_light("competition_rate", competition_rate),
            "label": "Competition Rate",
            "description": f"{competition_rate}% of contracts awarded competitively",
            "benchmark": "OECD avg: 70-85%",
        },
        "single_bid_rate": {
            "value": single_bid_rate,
            "light": _phi_traffic_light("single_bid_rate", single_bid_rate),
            "label": "Single Bidding Rate",
            "description": f"{single_bid_rate}% of competitive procedures had only 1 bidder",
            "benchmark": "EU threshold: <=10% green, >20% red",
        },
        "avg_bidders": {
            "value": avg_bidders,
            "light": _phi_traffic_light("avg_bidders", avg_bidders),
            "label": "Average Bidders",
            "description": f"{avg_bidders} average bidders per competitive procedure",
            "benchmark": "RUBLI working threshold: 3.0 (not externally sourced)",
        },
        "hhi": {
            "value": hhi,
            "light": _phi_traffic_light("hhi", hhi),
            "label": "Vendor Concentration (HHI)",
            "description": f"HHI = {hhi} (0 = perfect competition, 10000 = monopoly)",
            "benchmark": "DOJ/FTC: <1000 unconcentrated, >1800 highly concentrated",
        },
        "short_ad_rate": {
            "value": short_ad_rate,
            "light": _phi_traffic_light("short_ad_rate", short_ad_rate),
            "label": "Short Ad Period Rate",
            "description": f"{short_ad_rate}% of procedures had <15 days advertisement",
            "benchmark": "LAASSP requires 15+ days",
        },
        "amendment_rate": {
            "value": amendment_rate,
            "light": _phi_traffic_light("amendment_rate", amendment_rate),
            "label": "Contract Amendment Rate",
            "description": f"{amendment_rate}% of contracts have modifications",
            "benchmark": "EU avg: ~10-15%; >20% indicates poor planning",
        },
    }
    greens = sum(1 for ind in indicators.values() if ind["light"] == "green")
    yellows = sum(1 for ind in indicators.values() if ind["light"] == "yellow")
    reds = sum(1 for ind in indicators.values() if ind["light"] == "red")

    # Risk distribution by MXN value
    risk_rows = cursor.execute(f"""
        SELECT risk_level, COUNT(*) as cnt, SUM(amount_mxn) as val
        FROM contracts c
        WHERE {where} AND risk_level IS NOT NULL
        GROUP BY risk_level
    """, params).fetchall()
    risk_total_val = sum(r["val"] or 0 for r in risk_rows)
    risk_total_cnt = sum(r["cnt"] or 0 for r in risk_rows)
    risk_distribution: dict = {}
    for level in ("critical", "high", "medium", "low"):
        matched = next((r for r in risk_rows if r["risk_level"] == level), None)
        cnt = matched["cnt"] if matched else 0
        val = matched["val"] if matched else 0
        risk_distribution[level] = {
            "count": cnt,
            "value_mxn": round(val, 0),
            "count_pct": round(cnt / max(risk_total_cnt, 1) * 100, 1),
            "value_pct": round(val / max(risk_total_val, 1) * 100, 1),
        }

    # Weighted composite score + 10-tier grade
    composite_score = round(
        _phi_normalize("competition_by_value", competition_by_value) * _PHI_WEIGHTS["competition_by_value"]
        + _phi_normalize("single_bid_rate", single_bid_rate) * _PHI_WEIGHTS["single_bid_rate"]
        + _phi_normalize("avg_bidders", avg_bidders) * _PHI_WEIGHTS["avg_bidders"]
        + _phi_normalize("hhi", hhi) * _PHI_WEIGHTS["hhi"]
        + _phi_normalize("short_ad_rate", short_ad_rate) * _PHI_WEIGHTS["short_ad_rate"]
        + _phi_normalize("amendment_rate", amendment_rate) * _PHI_WEIGHTS["amendment_rate"],
        1,
    )
    grade = _phi_grade10(composite_score)

    return {
        "total_contracts": total,
        "total_value_mxn": round(total_value, 0),
        "direct_award_rate_by_value": da_rate_value,
        "competition_by_value": competition_by_value,
        "competitive_contracts": competitive,
        "indicators": indicators,
        "grade": grade,
        "phi_composite_score": composite_score,
        "risk_distribution": risk_distribution,
        "greens": greens,
        "yellows": yellows,
        "reds": reds,
        "total_indicators": len(indicators),
    }


def _precompute_phi(cursor: sqlite3.Cursor, stats: dict) -> None:
    """Compute and store phi_sectors, phi_trend, phi_sector_details, phi_ml_correlation."""

    # -- phi_sectors: all-time per-sector + national --
    sector_rows = cursor.execute(
        "SELECT id, name_en as name FROM sectors ORDER BY id"
    ).fetchall()

    sector_results = []
    for s in sector_rows:
        phi = _compute_phi_for(cursor, sector_id=s["id"])
        if phi:
            sector_results.append({"sector_id": s["id"], "sector_name": s["name"], **phi})
            print(f"   Sector {s['id']:2d} ({s['name']:20s}): grade={phi.get('grade','?')}")

    national = _compute_phi_for(cursor)
    stats["phi_sectors"] = {
        "national": {"sector_name": "National (all sectors)", **(national or {})},
        "sectors": sector_results,
    }

    # -- phi_sector_detail_{id}: per-sector yearly trend 2010 → DATA_LAST_YEAR (partial) --
    for s in sector_rows:
        sid = s["id"]
        all_time = _compute_phi_for(cursor, sector_id=sid)
        if not all_time:
            continue
        trend = []
        for yr in range(2010, DATA_LAST_YEAR + 1):
            yp = _compute_phi_for(cursor, sector_id=sid, year_min=yr, year_max=yr)
            if yp and yp.get("total_contracts", 0) > 0:
                trend.append({
                    "year": yr,
                    "competition_rate": yp["indicators"]["competition_rate"]["value"],
                    "competition_by_value": yp.get("competition_by_value"),
                    "single_bid_rate": yp["indicators"]["single_bid_rate"]["value"],
                    "avg_bidders": yp["indicators"]["avg_bidders"]["value"],
                    "grade": yp["grade"],
                    "phi_composite_score": yp.get("phi_composite_score"),
                    "total_contracts": yp["total_contracts"],
                })
        key = f"phi_sector_detail_{sid}"
        stats[key] = {
            "sector_id": sid,
            "sector_name": s["name"],
            **all_time,
            "trend": trend,
        }
        print(f"   Sector detail {sid} ({s['name']}): {len(trend)} trend years")

    # -- phi_trend: national year-by-year 2010 → DATA_LAST_YEAR (partial) --
    trend_results = []
    for yr in range(2010, DATA_LAST_YEAR + 1):
        phi = _compute_phi_for(cursor, year_min=yr, year_max=yr)
        if phi and phi.get("total_contracts", 0) > 100:
            trend_results.append({
                "year": yr,
                "grade": phi["grade"],
                "phi_composite_score": phi.get("phi_composite_score"),
                "greens": phi["greens"],
                "reds": phi["reds"],
                "competition_rate": phi["indicators"]["competition_rate"]["value"],
                "competition_by_value": phi.get("competition_by_value"),
                "single_bid_rate": phi["indicators"]["single_bid_rate"]["value"],
                "avg_bidders": phi["indicators"]["avg_bidders"]["value"],
                "da_rate_by_value": phi["direct_award_rate_by_value"],
                "total_contracts": phi["total_contracts"],
                "total_value_mxn": phi["total_value_mxn"],
            })
    stats["phi_trend"] = trend_results
    print(f"   phi_trend: {len(trend_results)} years")

    # -- phi_ml_correlation: static queries --
    da_risk = cursor.execute("""
        SELECT
            CASE WHEN is_direct_award = 1 THEN 'Direct Award' ELSE 'Competitive' END as method,
            COUNT(*) as contracts,
            ROUND(AVG(risk_score), 4) as avg_risk,
            ROUND(SUM(amount_mxn)/1e9, 1) as value_billion
        FROM contracts
        WHERE amount_mxn > 0
        GROUP BY is_direct_award
    """).fetchall()

    sb_risk = cursor.execute("""
        SELECT
            CASE WHEN is_single_bid = 1 THEN 'Single Bid'
                 WHEN is_direct_award = 0 THEN 'Multiple Bids'
                 ELSE 'Direct Award' END as category,
            COUNT(*) as contracts,
            ROUND(AVG(risk_score), 4) as avg_risk
        FROM contracts
        WHERE amount_mxn > 0
        GROUP BY category
        ORDER BY avg_risk DESC
    """).fetchall()

    sector_cmp = cursor.execute("""
        SELECT s.name_es as sector,
               COUNT(*) as contracts,
               ROUND(AVG(CASE WHEN c.is_direct_award = 0 THEN 1.0 ELSE 0.0 END) * 100, 1) as competition_rate,
               ROUND(AVG(c.risk_score), 4) as avg_ml_risk
        FROM contracts c
        JOIN sectors s ON c.sector_id = s.id
        WHERE c.amount_mxn > 0
        GROUP BY s.id
        ORDER BY avg_ml_risk DESC
    """).fetchall()

    agreement = cursor.execute(f"""
        SELECT
            COUNT(*) as total_high_risk,
            SUM(CASE WHEN is_direct_award = 1 OR is_single_bid = 1 THEN 1 ELSE 0 END) as also_phi_flagged,
            ROUND(SUM(CASE WHEN is_direct_award = 1 OR is_single_bid = 1 THEN 1.0 ELSE 0.0 END)
                  / COUNT(*) * 100, 1) as agreement_pct
        FROM contracts
        WHERE risk_score >= {HIGH_RISK} AND amount_mxn > 0
    """).fetchone()

    stats["phi_ml_correlation"] = {
        "correlations": {
            "by_procedure_type": [dict(r) for r in da_risk],
            "by_competition": [dict(r) for r in sb_risk],
            "sector_comparison": [dict(r) for r in sector_cmp],
            "ml_phi_agreement": {
                "high_risk_contracts": agreement["total_high_risk"],
                "also_flagged_by_phi": agreement["also_phi_flagged"],
                "agreement_rate": agreement["agreement_pct"],
                "interpretation": (
                    "Percentage of ML high-risk contracts that also trigger "
                    "at least one simple PHI red flag (direct award or single bid)"
                ),
            },
        }
    }
    print("   phi_ml_correlation: done")


# Every block below catches its own error so one failure does not stop the rest;
# _warn records it so the run ends non-zero instead of "Done!" (joker review 05 #3:
# a failed key keeps last run's value, which reads as current on the site).
FAILED: list[str] = []


def sector_canon_counts(cursor: sqlite3.Cursor) -> dict:
    """sector_id -> (vendors, institutions, {federal, local, all} institutions), canonical ids
    over contracts_canon. Buyer scope = institution_canonical.buyer_level
    (scripts/classify_buyer_scope.py); the scope dict is None before that column exists."""
    cols = [r[1] for r in cursor.execute("PRAGMA table_info(institution_canonical)")]
    if "buyer_level" not in cols:
        return {r[0]: (r[1], r[2], None) for r in cursor.execute("""
            SELECT sector_id, COUNT(DISTINCT vendor_id), COUNT(DISTINCT institution_id)
            FROM contracts_canon WHERE sector_id IS NOT NULL GROUP BY sector_id
        """)}
    return {r[0]: (r[1], r[2], {"federal": r[3], "local": r[4], "all": r[2]}) for r in cursor.execute("""
        SELECT c.sector_id, COUNT(DISTINCT c.vendor_id), COUNT(DISTINCT c.institution_id),
               COUNT(DISTINCT CASE WHEN k.buyer_level = 'federal' THEN c.institution_id END),
               COUNT(DISTINCT CASE WHEN k.buyer_level IN ('estatal', 'municipal') THEN c.institution_id END)
        FROM contracts_canon c LEFT JOIN institution_canonical k ON k.institution_id = c.institution_id
        WHERE c.sector_id IS NOT NULL GROUP BY c.sector_id
    """)}


def z_pattern_counts(cursor: sqlite3.Cursor) -> dict:
    """pattern_split_contracts / pattern_price_outlier on contract_features_v10 (v0.9.2 as-of
    z: sector x trailing-window, leave-one-out), same thresholds as the retired v0.9.1
    contract_z_features counts. None per key when the table is absent: the caller drops the
    key so a stale value never survives a rerun."""
    try:  # a query, not a sqlite_master probe: under --out-db the table sits in the ATTACHed src
        split, outlier = cursor.execute("""
            SELECT COALESCE(SUM(z_same_day_count > 1.5), 0), COALESCE(SUM(z_price_ratio > 2.0), 0)
            FROM contract_features_v10
        """).fetchone()
    except sqlite3.OperationalError as e:
        if "no such table" not in str(e):
            raise
        return {"pattern_split_contracts": None, "pattern_price_outlier": None}
    return {"pattern_split_contracts": split, "pattern_price_outlier": outlier}


def _warn(msg: str) -> None:
    FAILED.append(msg.strip())
    print(msg)


def precompute_stats(db: str = DB_PATH, out_db: str | None = None):
    print("=" * 60)
    print("PRE-COMPUTING DASHBOARD STATISTICS")
    print("=" * 60)

    conn = open_db(db, out_db, ["precomputed_stats"], timeout=300)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=300000")
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    # Distinct vendor/institution counts and the HHI read contracts_canon: absorbed
    # ids (scripts/migrate_institutions.py, migrate_vendors.py) count as their canonical id.
    install_contracts_canon(conn, vendors=True)

    # Create stats table if not exists
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS precomputed_stats (
            stat_key TEXT PRIMARY KEY,
            stat_value TEXT,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    stats = {}

    # 1. Overview stats
    print("\n1. Computing overview stats...")
    start = time.time()
    # MXN→USD rates: api/fx_rates.py (Banxico FIX); INPC deflators same as executive.py — keep in sync
    INPC_DEFLATORS = {
        2002: 0.382, 2003: 0.404, 2004: 0.420, 2005: 0.442,
        2006: 0.456, 2007: 0.475, 2008: 0.493, 2009: 0.525,
        2010: 0.544, 2011: 0.567, 2012: 0.586, 2013: 0.607,
        2014: 0.632, 2015: 0.658, 2016: 0.671, 2017: 0.694,
        2018: 0.741, 2019: 0.777, 2020: 0.799, 2021: 0.824,
        2022: 0.885, 2023: 0.955, 2024: 1.000, 2025: 1.038, 2026: 1.072,  # base 2024; INEGI INPC annual means (2026 = Jan–Sep, update yearly)
    }
    DEFAULT_RATE = LATEST_RATE
    DEFAULT_DEFLATOR = 0.700
    usd_clauses = "\n".join(
        f"            WHEN contract_year = {yr} THEN amount_mxn / {rate}"
        for yr, rate in MXN_USD_RATES.items()
    )
    real_clauses = "\n".join(
        f"            WHEN contract_year = {yr} THEN amount_mxn / {d}"
        for yr, d in INPC_DEFLATORS.items()
    )
    cursor.execute(f"""
        SELECT
            COUNT(*) as total_contracts,
            COALESCE(SUM(amount_mxn), 0) as total_value,
            COUNT(DISTINCT vendor_id) as total_vendors,
            COUNT(DISTINCT institution_id) as total_institutions,
            COALESCE(AVG(risk_score), 0) as avg_risk,
            SUM(CASE WHEN risk_level IN ('high', 'critical') THEN 1 ELSE 0 END) as high_risk_count,
            SUM(CASE WHEN risk_level IN ('high', 'critical') THEN amount_mxn ELSE 0 END) as high_risk_value,
            ROUND(100.0 * SUM(CASE WHEN risk_level IN ('high', 'critical') THEN 1 ELSE 0 END) / NULLIF(COUNT(risk_score), 0), 2) as high_risk_pct,
            SUM(CASE WHEN risk_level = 'critical' THEN 1 ELSE 0 END) as critical_count,
            ROUND(SUM(CASE WHEN {proc_known('is_direct_award')} = 1 THEN 1.0 ELSE 0 END) / {proc_den('is_direct_award')} * 100, 2) as direct_pct,
            ROUND(SUM(CASE WHEN {proc_known('is_single_bid')} = 1 THEN 1.0 ELSE 0 END) / {proc_den('is_single_bid')} * 100, 2) as single_pct,
            MIN(contract_year) as min_year,
            MAX(contract_year) as max_year,
            SUM(CASE
{usd_clauses}
                ELSE amount_mxn / {DEFAULT_RATE}
            END) as total_value_usd,
            SUM(CASE
{real_clauses}
                ELSE amount_mxn / {DEFAULT_DEFLATOR}
            END) as total_value_real_mxn
        FROM contracts_canon
        WHERE {PUBLIC_REGISTER_SQL}
    """)
    row = cursor.fetchone()
    stats['overview'] = {
        'total_contracts': row['total_contracts'],
        'total_value_mxn': row['total_value'],
        'total_vendors': row['total_vendors'],
        'total_institutions': row['total_institutions'],
        'avg_risk_score': round(row['avg_risk'] or 0, 4),
        'high_risk_contracts': row['high_risk_count'],
        'high_risk_pct': round(row['high_risk_pct'] or 0, 2),
        'critical_contracts': row['critical_count'],
        'high_risk_value_mxn': row['high_risk_value'],
        'direct_award_pct': row['direct_pct'],
        'single_bid_pct': row['single_pct'],
        'min_year': row['min_year'],
        'max_year': row['max_year'],
        'total_value_usd': round(row['total_value_usd'] or 0, 0),
        'total_value_real_mxn': round(row['total_value_real_mxn'] or 0, 0),
    }
    print(f"   Done ({time.time() - start:.1f}s)")

    # 1b. Standalone convenience keys derived from overview (no extra DB query)
    ov = stats['overview']
    high_only = max(0, (ov.get('high_risk_contracts') or 0) - (ov.get('critical_contracts') or 0))
    stats['vendor_count']     = ov.get('total_vendors', 0)
    stats['model_auc']        = 0.656  # v0.8.5 forward-holdout AUC (vendors linked after training); 0.785 test AUC was not reproducible
    stats['high_risk_rate']   = ov.get('high_risk_pct', 0.0)
    stats['direct_award_pct'] = ov.get('direct_award_pct')
    stats['single_bid_pct']   = ov.get('single_bid_pct')
    stats['critical_count']   = ov.get('critical_contracts', 0)
    stats['high_count']       = high_only

    # 2. Sector stats
    print("2. Computing sector stats...")
    start = time.time()
    cursor.execute(f"""
        SELECT
            s.id,
            s.code,
            s.name_es as name,
            COUNT(c.id) as total_contracts,
            COALESCE(SUM(c.amount_mxn), 0) as total_value,
            COUNT(DISTINCT c.vendor_id) as total_vendors,
            COUNT(DISTINCT c.institution_id) as total_institutions,
            COALESCE(AVG(c.risk_score), 0) as avg_risk,
            SUM(CASE WHEN c.risk_level = 'low' THEN 1 ELSE 0 END) as low_risk,
            SUM(CASE WHEN c.risk_level = 'medium' THEN 1 ELSE 0 END) as medium_risk,
            SUM(CASE WHEN c.risk_level = 'high' THEN 1 ELSE 0 END) as high_risk,
            SUM(CASE WHEN c.risk_level = 'critical' THEN 1 ELSE 0 END) as critical_risk,
            SUM(CASE WHEN {proc_known('c.is_direct_award', 'c.contract_year')} = 1 THEN 1 ELSE 0 END) as direct_awards,
            SUM(CASE WHEN {proc_known('c.is_single_bid', 'c.contract_year')} = 1 THEN 1 ELSE 0 END) as single_bids,
            COUNT({proc_known('c.is_direct_award', 'c.contract_year')}) as procedure_known,
            COALESCE(SUM(CASE WHEN c.risk_level IN ('high', 'critical')
                              THEN c.amount_mxn ELSE 0 END), 0) as high_critical_value,
            COALESCE(SUM(CASE WHEN c.risk_level = 'critical'
                              THEN c.amount_mxn ELSE 0 END), 0) as critical_value,
            COALESCE(SUM(CASE WHEN c.risk_score IS NOT NULL THEN c.amount_mxn END), 0) as scored_value
        FROM sectors s
        LEFT JOIN contracts c ON s.id = c.sector_id
        GROUP BY s.id, s.code, s.name_es
        ORDER BY total_contracts DESC
    """)
    sectors = []
    for row in cursor.fetchall():
        total = row['total_contracts'] or 0
        sectors.append({
            'id': row['id'],
            'code': row['code'],
            'name': row['name'],
            'total_contracts': total,
            'total_value_mxn': row['total_value'] or 0,
            'total_vendors': row['total_vendors'] or 0,
            'total_institutions': row['total_institutions'] or 0,
            'avg_risk_score': round(row['avg_risk'] or 0, 4),
            'low_risk_count': row['low_risk'] or 0,
            'medium_risk_count': row['medium_risk'] or 0,
            'high_risk_count': row['high_risk'] or 0,
            'critical_risk_count': row['critical_risk'] or 0,
            'direct_award_count': row['direct_awards'] or 0,
            'single_bid_count': row['single_bids'] or 0,
            'procedure_known_count': row['procedure_known'] or 0,  # denominator of the two shares (DQ1 § 2)
            # VaR (value-at-risk) for the M3v2 Exposure Ledger: MXN through
            # model-flagged contracts. No amount filter — contracts table is
            # already ETL-cleaned to the 100B reject ceiling.
            'high_critical_value_mxn': row['high_critical_value'] or 0,
            'critical_value_mxn': row['critical_value'] or 0,
            'scored_value_mxn': row['scored_value'] or 0,  # denominator of spend-at-risk shares
        })
    # canonical distinct counts (the LEFT JOIN above can't flatten a joined view)
    canon_counts = sector_canon_counts(cursor)
    for sec in sectors:
        sec['total_vendors'], sec['total_institutions'], sec['institutions_by_scope'] =             canon_counts.get(sec['id'], (0, 0, None))
    stats['sectors'] = sectors
    print(f"   Done ({time.time() - start:.1f}s)")

    # 3. Risk distribution
    print("3. Computing risk distribution...")
    start = time.time()
    cursor.execute(f"""
        SELECT
            risk_level,
            COUNT(*) as count,
            SUM(amount_mxn) as total_value
        FROM contracts
        WHERE {PUBLIC_REGISTER_SQL}
        GROUP BY risk_level
    """)
    risk_dist = []
    rd_rows = cursor.fetchall()
    # shares over SCORED contracts; the NULL-level ('unknown') row carries the unscored count
    # (ComprasMX loads unscored until a model passes) and gets no percentage
    total_contracts = sum(r['count'] for r in rd_rows if r['risk_level'] is not None)
    for row in rd_rows:
        risk_dist.append({
            'risk_level': row['risk_level'] or 'unknown',
            'count': row['count'],
            'percentage': round(row['count'] / total_contracts * 100, 2) if total_contracts > 0 and row['risk_level'] is not None else 0,
            'total_value_mxn': row['total_value'] or 0,
        })
    stats['risk_distribution'] = risk_dist
    print(f"   Done ({time.time() - start:.1f}s)")

    # 4. Year-over-year trends
    print("4. Computing yearly trends...")
    start = time.time()
    cursor.execute(f"""
        SELECT
            contract_year,
            COUNT(*) as contracts,
            COALESCE(SUM(amount_mxn), 0) as value,
            COALESCE(AVG(risk_score), 0) as avg_risk,
            SQRT(
                MAX(0, AVG(risk_score * risk_score) - AVG(risk_score) * AVG(risk_score))
            ) as risk_stddev,
            ROUND(100.0 * SUM(CASE WHEN {proc_known('is_direct_award')} = 1 THEN 1 ELSE 0 END) / {proc_den('is_direct_award')}, 2) as direct_award_pct,
            ROUND(100.0 * SUM(CASE WHEN {proc_known('is_single_bid')} = 1 THEN 1 ELSE 0 END)
                / NULLIF(SUM({proc_known('is_direct_award')} = 0), 0), 2) as single_bid_pct,
            ROUND(100.0 * SUM(CASE WHEN risk_level IN ('high', 'critical') THEN 1 ELSE 0 END) / NULLIF(COUNT(risk_score), 0), 2) as high_risk_pct,
            COUNT(DISTINCT vendor_id) as vendor_count,
            COUNT(DISTINCT institution_id) as institution_count
        FROM contracts_canon
        WHERE {PUBLIC_REGISTER_SQL}
        GROUP BY contract_year
        ORDER BY contract_year
    """)
    yearly = []
    for row in cursor.fetchall():
        yearly.append({
            'year': row['contract_year'],
            'contracts': row['contracts'],
            'value_mxn': row['value'],
            'avg_risk': round(row['avg_risk'], 4),
            'risk_stddev': round(row['risk_stddev'] or 0, 4),
            'direct_award_pct': _rnd(row['direct_award_pct'], 2),
            'single_bid_pct': _rnd(row['single_bid_pct'], 2),
            'high_risk_pct': round(row['high_risk_pct'] or 0, 2),
            'vendor_count': row['vendor_count'] or 0,
            'institution_count': row['institution_count'] or 0,
        })
    stats['yearly_trends'] = yearly
    print(f"   Done ({time.time() - start:.1f}s)")

    # 5. Administration breakdown
    print("5. Computing administration breakdown...")
    start = time.time()
    # One term calendar (api/administrations.py, outgoing-president rule).
    admin_case = "\n".join(
        f"                WHEN contract_year BETWEEN {a.year_min} AND {a.year_max} THEN '{a.key}'"
        for a in ADMINISTRATIONS
    )
    cursor.execute(f"""
        SELECT
            CASE
{admin_case}
            END as admin,
            COUNT(*) as contracts,
            SUM(amount_mxn) as total_value,
            ROUND(AVG(risk_score), 4) as avg_risk,
            ROUND(100.0 * SUM(CASE WHEN risk_score >= {HIGH_RISK} THEN 1 ELSE 0 END)
                  / NULLIF(COUNT(risk_score), 0), 1) as high_risk_pct,
            ROUND(100.0 * SUM(CASE WHEN contract_year >= {DA_CODED_FROM} AND is_direct_award = 1 THEN 1 ELSE 0 END)
                  / NULLIF(SUM(CASE WHEN contract_year >= {DA_CODED_FROM} THEN 1 ELSE 0 END), 0), 1) as direct_award_pct
        FROM contracts
        WHERE contract_year BETWEEN {FIRST_YEAR} AND {LAST_YEAR}
        GROUP BY admin
        ORDER BY MIN(contract_year)
    """)
    admin_meta = {
        "fox": ("Fox", "Vicente Fox", "PAN"),
        "calderon": ("Calderon", "Felipe Calderon", "PAN"),
        "pena_nieto": ("Pena Nieto", "Enrique Pena Nieto", "PRI"),
        "amlo": ("AMLO", "Andres Manuel Lopez Obrador", "MORENA"),
        "sheinbaum": ("Sheinbaum", "Claudia Sheinbaum", "MORENA"),
    }
    by_key = {a.key: a for a in ADMINISTRATIONS}
    administrations = []
    for row in cursor.fetchall():
        a = by_key[row['admin']]
        name, full, party = admin_meta[a.key]
        start_y, end_y = max(a.year_min, FIRST_YEAR), a.year_max
        da_from = max(start_y, DA_CODED_FROM)
        administrations.append({
            "name": name,
            "full_name": full,
            "years": f"{start_y}-present" if end_y > LAST_YEAR else f"{start_y}-{end_y}",
            "party": party,
            "contracts": row['contracts'],
            "value": row['total_value'] or 0,
            "avg_risk": row['avg_risk'] or 0,
            "high_risk_pct": row['high_risk_pct'] or 0,
            # None = procedure type not coded in this term's years (Fox: 2002-06)
            "direct_award_pct": row['direct_award_pct'],
            "direct_award_years": (
                None if da_from > min(end_y, LAST_YEAR)
                else f"{da_from}-{min(end_y, LAST_YEAR)}"
            ),
        })
    stats['administrations'] = administrations
    print(f"   Done ({time.time() - start:.1f}s)")

    # 6. Pattern counts for DetectivePatterns page
    print("6. Computing pattern counts...")
    start = time.time()
    pattern_queries = [
        ('pattern_december_rush', f"SELECT COUNT(*) FROM contracts WHERE CAST(strftime('%m', contract_date) AS INTEGER) = 12 AND risk_score >= {HIGH_RISK}"),
        ('pattern_single_bid', "SELECT COUNT(*) FROM contracts WHERE is_single_bid = 1"),
        ('pattern_co_bidding', "SELECT COUNT(*) FROM contracts WHERE vendor_id IN (SELECT v.id FROM vendors v JOIN vendor_graph_features vgf ON vgf.vendor_id = v.id WHERE vgf.degree >= 5)"),
    ]
    for key, query in pattern_queries:
        try:
            val = cursor.execute(query).fetchone()[0]
            cursor.execute(
                "INSERT OR REPLACE INTO precomputed_stats (stat_key, stat_value, updated_at) VALUES (?, ?, ?)",
                (key, json.dumps(val), datetime.now().isoformat()),
            )
            print(f"   {key}: {val:,}")
        except Exception as e:
            _warn(f"   Warning: pattern count {key} failed: {e}")
    for key, val in z_pattern_counts(cursor).items():
        if val is None:
            cursor.execute("DELETE FROM precomputed_stats WHERE stat_key = ?", (key,))
            _warn(f"   Warning: {key} dropped — no contract_features_v10 on this DB")
            continue
        cursor.execute(
            "INSERT OR REPLACE INTO precomputed_stats (stat_key, stat_value, updated_at) VALUES (?, ?, ?)",
            (key, json.dumps(val), datetime.now().isoformat()),
        )
        print(f"   {key}: {val:,}")
    print(f"   Done ({time.time() - start:.1f}s)")

    # 7. Sector x Year breakdown (feeds /api/v1/analysis/sector-year-breakdown fast path)
    print("7. Computing sector x year breakdown...")
    start = time.time()
    try:
        cursor.execute(f"""
            SELECT
                contract_year as year, sector_id,
                COUNT(*) as contracts,
                COALESCE(SUM(amount_mxn), 0) as total_value,
                COALESCE(AVG(risk_score), 0) as avg_risk,
                SUM(CASE WHEN {proc_known('is_direct_award')} = 1 THEN 1 ELSE 0 END) * 100.0 / {proc_den('is_direct_award')} as direct_award_pct,
                SUM(CASE WHEN {proc_known('is_single_bid')} = 1 THEN 1 ELSE 0 END) * 100.0 /
                    NULLIF(SUM({proc_known('is_direct_award')} = 0), 0) as single_bid_pct,
                SUM(CASE WHEN risk_level IN ('high', 'critical') THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(risk_score), 0) as high_risk_pct,
                COUNT(DISTINCT vendor_id) as vendor_count,
                COUNT(DISTINCT institution_id) as institution_count
            FROM contracts_canon
            WHERE {PUBLIC_REGISTER_SQL} AND sector_id IS NOT NULL
            GROUP BY contract_year, sector_id
            ORDER BY contract_year, sector_id
        """)
        sector_year_rows = []
        for row in cursor.fetchall():
            sector_year_rows.append({
                "year": row["year"],
                "sector_id": row["sector_id"],
                "contracts": row["contracts"],
                "total_value": round(row["total_value"] or 0, 0),
                "avg_risk": round(row["avg_risk"] or 0, 4),
                "direct_award_pct": _rnd(row["direct_award_pct"], 1),
                "single_bid_pct": round(row["single_bid_pct"], 1) if row["single_bid_pct"] is not None else None,
                "high_risk_pct": round(row["high_risk_pct"] or 0, 2),
                "vendor_count": row["vendor_count"],
                "institution_count": row["institution_count"],
            })
        stats['sector_year_breakdown'] = sector_year_rows
        print(f"   Done ({time.time() - start:.1f}s) — {len(sector_year_rows)} rows")
    except Exception as e:
        _warn(f"   Warning: sector x year breakdown failed: {e}")

    # 8. Political cycle stats
    print("8. Computing political cycle stats...")
    start = time.time()
    try:
        rows = cursor.execute(f"""
            SELECT
                is_election_year,
                COUNT(*) as contracts,
                ROUND(AVG(risk_score), 4) as avg_risk,
                ROUND(100.0 * SUM(CASE WHEN risk_level IN ('high','critical') THEN 1 ELSE 0 END) / NULLIF(COUNT(risk_score), 0), 2) as high_risk_pct,
                ROUND(100.0 * SUM(CASE WHEN {proc_known('is_direct_award')} = 1 THEN 1 ELSE 0 END) / {proc_den('is_direct_award')}, 2) as direct_award_pct
            FROM contracts
            WHERE contract_year IS NOT NULL
            GROUP BY is_election_year
        """).fetchall()
        election_data = {}
        for r in rows:
            key = "election_year" if r["is_election_year"] else "non_election_year"
            election_data[key] = {"contracts": r["contracts"], "avg_risk": round(r["avg_risk"] or 0, 4), "high_risk_pct": round(r["high_risk_pct"] or 0, 2), "direct_award_pct": _rnd(r["direct_award_pct"], 2)}

        srows = cursor.execute(f"""
            SELECT sexenio_year,
                COUNT(*) as contracts,
                ROUND(AVG(risk_score), 4) as avg_risk,
                ROUND(100.0 * SUM(CASE WHEN risk_level IN ('high','critical') THEN 1 ELSE 0 END) / NULLIF(COUNT(risk_score), 0), 2) as high_risk_pct,
                ROUND(100.0 * SUM(CASE WHEN {proc_known('is_direct_award')} = 1 THEN 1 ELSE 0 END) / {proc_den('is_direct_award')}, 2) as direct_award_pct
            FROM contracts WHERE sexenio_year IS NOT NULL
            GROUP BY sexenio_year ORDER BY sexenio_year
        """).fetchall()
        labels = {1: "Year 1 (new admin)", 2: "Year 2", 3: "Year 3 (midterm)", 4: "Year 4", 5: "Year 5", 6: "Year 6 (lame duck)"}
        sexenio_breakdown = [{"sexenio_year": r["sexenio_year"], "label": labels.get(r["sexenio_year"], f"Year {r['sexenio_year']}"), "contracts": r["contracts"], "avg_risk": round(r["avg_risk"] or 0, 4), "high_risk_pct": round(r["high_risk_pct"] or 0, 2), "direct_award_pct": _rnd(r["direct_award_pct"], 2)} for r in srows]

        stats['political_cycle'] = {"election_year_effect": election_data, "sexenio_year_breakdown": sexenio_breakdown}
        print(f"   Done ({time.time() - start:.1f}s)")
    except Exception as e:
        _warn(f"   Warning: political cycle stats failed: {e}")

    # 9. Publication delay stats
    print("9. Computing publication delay stats...")
    start = time.time()
    try:
        row = cursor.execute("""
            SELECT
                SUM(CASE WHEN publication_delay_days BETWEEN 1 AND 7 THEN 1 ELSE 0 END) as b_0_7,
                SUM(CASE WHEN publication_delay_days BETWEEN 8 AND 30 THEN 1 ELSE 0 END) as b_8_30,
                SUM(CASE WHEN publication_delay_days BETWEEN 31 AND 90 THEN 1 ELSE 0 END) as b_31_90,
                SUM(CASE WHEN publication_delay_days > 90 THEN 1 ELSE 0 END) as b_over_90,
                COUNT(*) as total,
                ROUND(AVG(publication_delay_days), 1) as avg_delay,
                ROUND(100.0 * SUM(CASE WHEN publication_delay_days <= 7 THEN 1 ELSE 0 END) / COUNT(*), 2) as timely_pct
            FROM contracts
            WHERE publication_delay_days IS NOT NULL AND publication_delay_days > 0
        """).fetchone()
        total_d = int(row["total"] or 0)
        buckets = [
            {"label": "1–7 days", "count": int(row["b_0_7"] or 0), "pct": round(int(row["b_0_7"] or 0) / total_d * 100, 2) if total_d else 0},
            {"label": "8–30 days", "count": int(row["b_8_30"] or 0), "pct": round(int(row["b_8_30"] or 0) / total_d * 100, 2) if total_d else 0},
            {"label": "31–90 days", "count": int(row["b_31_90"] or 0), "pct": round(int(row["b_31_90"] or 0) / total_d * 100, 2) if total_d else 0},
            {"label": ">90 days", "count": int(row["b_over_90"] or 0), "pct": round(int(row["b_over_90"] or 0) / total_d * 100, 2) if total_d else 0},
        ]
        # by_year breakdown (required by validation check in analysis.py)
        by_year_rows = cursor.execute(f"""
            SELECT contract_year AS year,
                   COUNT(*) AS total,
                   ROUND(AVG(publication_delay_days), 1) AS avg_delay
            FROM contracts
            WHERE publication_delay_days IS NOT NULL AND publication_delay_days > 0
              AND contract_year BETWEEN 2010 AND {LAST_YEAR}
            GROUP BY contract_year ORDER BY contract_year
        """).fetchall()
        by_year = [{"year": r["year"], "total": int(r["total"] or 0), "avg_delay_days": float(r["avg_delay"] or 0)} for r in by_year_rows]
        stats['publication_delays'] = {
            "total_with_delay_data": total_d,  # key expected by validation
            "total": total_d,
            "avg_delay_days": float(row["avg_delay"] or 0),
            "timely_pct": float(row["timely_pct"] or 0),
            "distribution": buckets,
            "by_year": by_year,
        }
        print(f"   Done ({time.time() - start:.1f}s)")
    except Exception as e:
        _warn(f"   Warning: publication delay stats failed: {e}")

    # 10. Institution HHI (supplier diversity) per sector per year
    print("10. Computing institution HHI stats...")
    start = time.time()
    try:
        # HHI per institution per year: sum of squared market shares (0-10000 scale)
        # Use primary_sector_id from institutions table for sector join
        hhi_rows = cursor.execute("""
            WITH vendor_shares AS (
                SELECT
                    institution_id,
                    contract_year,
                    vendor_id,
                    SUM(COALESCE(amount_mxn, 0)) AS vendor_value
                FROM contracts_canon
                WHERE institution_id IS NOT NULL AND vendor_id IS NOT NULL
                  AND contract_year IS NOT NULL AND amount_mxn > 0
                GROUP BY institution_id, contract_year, vendor_id
            ),
            institution_totals AS (
                SELECT institution_id, contract_year,
                       SUM(vendor_value) AS total_value,
                       COUNT(DISTINCT vendor_id) AS unique_vendors
                FROM vendor_shares GROUP BY institution_id, contract_year
            ),
            hhi_calc AS (
                SELECT vs.institution_id, vs.contract_year,
                       ROUND(SUM((vs.vendor_value * 100.0 / it.total_value) *
                                 (vs.vendor_value * 100.0 / it.total_value)), 1) AS hhi,
                       it.unique_vendors
                FROM vendor_shares vs
                JOIN institution_totals it
                  ON vs.institution_id = it.institution_id AND vs.contract_year = it.contract_year
                WHERE it.total_value > 0
                GROUP BY vs.institution_id, vs.contract_year
            )
            SELECT h.institution_id, h.contract_year, h.hhi, h.unique_vendors,
                   i.name AS institution_name, i.sector_id
            FROM hhi_calc h
            JOIN institutions i ON h.institution_id = i.id
            ORDER BY h.contract_year DESC, h.hhi DESC
        """).fetchall()

        # Build per-institution lookups: {institution_id: [{year, hhi, unique_vendors}...]}
        from collections import defaultdict
        inst_hhi = defaultdict(list)
        for r in hhi_rows:
            inst_hhi[int(r["institution_id"])].append({
                "year": int(r["contract_year"]),
                "hhi": float(r["hhi"]),
                "unique_vendors": int(r["unique_vendors"]),
            })

        # Also compute per-sector average HHI by year
        sector_hhi_map = defaultdict(lambda: defaultdict(list))
        for r in hhi_rows:
            if r["sector_id"]:
                sector_hhi_map[int(r["sector_id"])][int(r["contract_year"])].append(float(r["hhi"]))

        sector_hhi_trend = {}
        for sid, years in sector_hhi_map.items():
            sector_hhi_trend[str(sid)] = [
                {"year": yr, "avg_hhi": round(sum(vals) / len(vals), 1)}
                for yr, vals in sorted(years.items())
            ]

        stats['institution_hhi'] = {
            "by_institution": {str(k): v for k, v in inst_hhi.items()},
            "sector_avg_trend": sector_hhi_trend,
        }
        print(f"   Done ({time.time() - start:.1f}s) — {len(inst_hhi)} institutions")
    except Exception as e:
        _warn(f"   Warning: HHI computation failed: {e}")
        import traceback; traceback.print_exc()

    # 11. Data quality stats (feeds /api/v1/stats/data-quality fast path)
    print("11. Computing data quality stats...")
    start = time.time()
    try:
        dq_row = cursor.execute(f"""
            SELECT
                COUNT(*) as total_contracts,
                SUM(CASE WHEN v.rfc IS NOT NULL AND v.rfc != '' THEN 1 ELSE 0 END) as contracts_with_rfc,
                SUM(CASE WHEN c.amount_mxn > 0 THEN 1 ELSE 0 END) as contracts_with_amount,
                SUM(CASE WHEN c.amount_mxn > 10000000000 THEN 1 ELSE 0 END) as contracts_flagged,
                SUM(CASE WHEN c.amount_mxn > 100000000000 THEN 1 ELSE 0 END) as contracts_rejected,
                SUM(CASE WHEN c.risk_level IN ('critical', 'high') THEN 1 ELSE 0 END) as high_risk_count,
                SUM(CASE WHEN c.risk_level = 'critical' THEN 1 ELSE 0 END) as critical_count
            FROM contracts c
            LEFT JOIN vendors v ON c.vendor_id = v.id
            WHERE {PUBLIC_REGISTER_SQL.replace("contract_year", "c.contract_year").replace("amount_mxn", "c.amount_mxn")}
        """).fetchone()
        total = int(dq_row["total_contracts"] or 0)
        with_rfc = int(dq_row["contracts_with_rfc"] or 0)
        stats['data_quality'] = {
            'total_contracts': total,
            'contracts_with_rfc': with_rfc,
            'rfc_coverage_pct': round(with_rfc / total * 100, 2) if total > 0 else 0,
            'contracts_with_amount': int(dq_row["contracts_with_amount"] or 0),
            'contracts_flagged': int(dq_row["contracts_flagged"] or 0),
            'contracts_rejected': int(dq_row["contracts_rejected"] or 0),
            'high_risk_count': int(dq_row["high_risk_count"] or 0),
            'critical_count': int(dq_row["critical_count"] or 0),
        }
        print(f"   Done ({time.time() - start:.1f}s)")
    except Exception as e:
        _warn(f"   Warning: data quality stats failed: {e}")

    # 12. PHI — Procurement Health Index
    print("12. Computing PHI (Procurement Health Index)...")
    start = time.time()
    try:
        _precompute_phi(cursor, stats)
        print(f"   Done ({time.time() - start:.1f}s)")
    except Exception as e:
        _warn(f"   Warning: PHI computation failed: {e}")
        import traceback; traceback.print_exc()

    # 13. Ground truth counts (was a 90s live query in executive/summary). No
    # detection rate: hits on the training labels are in-sample (committee C6/D29).
    print("13. Computing ground truth counts...")
    start = time.time()
    try:
        gt = cursor.execute("""
            SELECT COUNT(*) AS cases,
                   SUM(case_origin IN ('media_report', 'official_record', 'audit_report')) AS independent,
                   SUM(provenance_tier IN ('A', 'B')) AS tier_ab,
                   SUM(provenance_tier = 'A') AS tier_a,
                   SUM(provenance_tier = 'B') AS tier_b,
                   SUM(case_origin = 'model_discovery') AS model_surfaced
            FROM ground_truth_cases
        """).fetchone()
        gt_vendors = cursor.execute(
            "SELECT COUNT(*) FROM ground_truth_vendors WHERE vendor_id IS NOT NULL"
        ).fetchone()[0]
        gt_row = cursor.execute(
            f"SELECT COUNT(*) AS total, "
            f"SUM(CASE WHEN risk_score >= {HIGH_RISK} THEN 1 ELSE 0 END) AS high_plus, "
            "COUNT(risk_score) AS scored "
            "FROM contracts WHERE vendor_id IN "
            "(SELECT DISTINCT vendor_id FROM ground_truth_vendors WHERE vendor_id IS NOT NULL)"
        ).fetchone()
        gt_total = gt_row[0] or 0
        gt_high = gt_row[1] or 0
        gt_scored = gt_row[2] or 0
        stats['ground_truth'] = {
            **{k: gt[k] or 0 for k in gt.keys()},
            'vendors': gt_vendors,
            'contracts': gt_total,
            'high_plus_rate': round(gt_high / gt_scored * 100, 1) if gt_scored else 0,
        }
        print(f"   Done ({time.time() - start:.1f}s) — {stats['ground_truth']}")
    except Exception as e:
        _warn(f"   Warning: ground truth stats failed: {e}")

    # 14. P1 dashboard stats (prevents fallback live queries in /stats/dashboard/fast)
    print("14. Computing P1 dashboard stats...")
    start = time.time()

    # multivariate_anomaly_count (Mahalanobis p < 0.01) lived only in v0.9.1's contract_z_features;
    # v0.9.2's contract_features_v10 has no Mahalanobis column, so the key is retired, not left stale.
    cursor.execute("DELETE FROM precomputed_stats WHERE stat_key = 'multivariate_anomaly_count'")

    # election_year_avg_risk / non_election_year_avg_risk / election_year_contract_count
    try:
        ey_rows = cursor.execute("""
            SELECT is_election_year,
                   AVG(risk_score) as avg_risk,
                   SUM(CASE WHEN is_election_year = 1 THEN 1 ELSE 0 END) as ey_count
            FROM contracts
            WHERE risk_score IS NOT NULL AND is_election_year IS NOT NULL
            GROUP BY is_election_year
        """).fetchall()
        ey_avg = None
        non_ey_avg = None
        ey_count = 0
        for r in ey_rows:
            if r["is_election_year"]:
                ey_avg = round(r["avg_risk"], 4) if r["avg_risk"] is not None else None
                ey_count = r["ey_count"] or 0
            else:
                non_ey_avg = round(r["avg_risk"], 4) if r["avg_risk"] is not None else None
        stats['election_year_avg_risk'] = ey_avg
        stats['non_election_year_avg_risk'] = non_ey_avg
        stats['election_year_contract_count'] = ey_count
        print(f"   election_year_avg_risk: {ey_avg}, non_election: {non_ey_avg}, count: {ey_count:,}")
    except Exception as e:
        _warn(f"   Warning: election_year stats failed: {e}")

    # new_vendor_risk_count: vendors scoring > 0.40 with last activity >= 2022
    try:
        nvr_row = cursor.execute("""
            SELECT COUNT(*) FROM vendor_stats
            WHERE new_vendor_risk_score IS NOT NULL
              AND new_vendor_risk_score > 0.40
              AND last_contract_year >= 2022
        """).fetchone()
        stats['new_vendor_risk_count'] = nvr_row[0] if nvr_row else None
        print(f"   new_vendor_risk_count: {stats['new_vendor_risk_count']}")
    except Exception as e:
        _warn(f"   Warning: new_vendor_risk_count failed: {e}")

    # grade_a_pct / grade_b_pct: data quality grade distribution
    try:
        grade_rows = cursor.execute("""
            SELECT data_quality_grade,
                   COUNT(*) * 100.0 / (SELECT COUNT(*) FROM contracts WHERE data_quality_grade IS NOT NULL) as pct
            FROM contracts
            WHERE data_quality_grade IS NOT NULL
            GROUP BY data_quality_grade
        """).fetchall()
        grade_map = {r["data_quality_grade"]: round(r["pct"], 1) for r in grade_rows}
        stats['grade_a_pct'] = grade_map.get('A', 0)
        stats['grade_b_pct'] = grade_map.get('B', 0)
        print(f"   grade_a_pct: {stats['grade_a_pct']}, grade_b_pct: {stats['grade_b_pct']}")
    except Exception as e:
        _warn(f"   Warning: grade distribution failed: {e}")

    # sexenio_comparison: AMLO vs Sheinbaum, on the canonical calendar (AMLO 2019-2024)
    try:
        amlo = next(a for a in ADMINISTRATIONS if a.key == 'amlo')
        shein = next(a for a in ADMINISTRATIONS if a.key == 'sheinbaum')
        sx_rows = cursor.execute(f"""
            SELECT
                CASE
                    WHEN contract_year BETWEEN {amlo.year_min} AND {amlo.year_max} THEN 'amlo'
                    WHEN contract_year >= {shein.year_min} THEN 'sheinbaum'
                    ELSE NULL
                END AS era,
                COUNT(*) as contract_count,
                AVG(risk_score) as avg_risk,
                AVG(CAST(is_direct_award AS REAL)) * 100.0 as direct_award_pct,
                SUM(amount_mxn) as total_value_mxn,
                SUM(CASE WHEN risk_level IN ('critical', 'high') THEN 1 ELSE 0 END) * 100.0 / COUNT(*) as high_risk_pct
            FROM contracts
            WHERE contract_year >= {amlo.year_min}
            GROUP BY era
            HAVING era IS NOT NULL
        """).fetchall()
        if sx_rows:
            sexenio_map = {}
            for sx in sx_rows:
                era = sx["era"]
                sexenio_map[era] = {
                    "contract_count": sx["contract_count"],
                    "avg_risk": round(sx["avg_risk"], 4) if sx["avg_risk"] is not None else None,
                    "direct_award_pct": round(sx["direct_award_pct"], 1) if sx["direct_award_pct"] is not None else None,
                    "total_value_mxn": sx["total_value_mxn"],
                    "high_risk_pct": round(sx["high_risk_pct"], 2) if sx["high_risk_pct"] is not None else None,
                }
            stats['sexenio_comparison'] = sexenio_map
            print(f"   sexenio_comparison: {list(sexenio_map.keys())}")
        else:
            stats['sexenio_comparison'] = {}
    except Exception as e:
        _warn(f"   Warning: sexenio_comparison failed: {e}")

    print(f"   Done ({time.time() - start:.1f}s)")

    # /contracts/field cube: one full scan here instead of one per gunicorn worker
    try:
        from api.routers.contracts import scan_field_cube
        stats['contracts_field_cube'] = scan_field_cube(conn)
        print(f"   contracts_field_cube: {len(stats['contracts_field_cube'])} cells")
    except Exception as e:
        _warn(f"   Warning: contracts_field_cube failed: {e}")

    # Save all stats to database
    print("\n15. Saving to database...")
    for key, value in stats.items():
        cursor.execute("""
            INSERT OR REPLACE INTO precomputed_stats (stat_key, stat_value, updated_at)
            VALUES (?, ?, ?)
        """, (key, json.dumps(value), datetime.now().isoformat()))
    # /stats/data-quality persists its 85 s scan once and serves it forever; drop it so the
    # endpoint rescans this run's register (it was frozen at 3,059,592 / A–D from June).
    cursor.execute("DELETE FROM precomputed_stats WHERE stat_key = 'data_quality_full'")

    conn.commit()
    conn.close()

    if FAILED:
        print(f"\nFAILED blocks ({len(FAILED)}): their keys keep the previous run's values:")
        for m in FAILED:
            print(f"   {m}")
    print(f"\nDone! Pre-computed {len(stats)} stat groups.")
    print("=" * 60)

if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--db", default=DB_PATH)
    ap.add_argument("--out-db", default=None,
                    help="write precomputed_stats here (only this run's keys); --db is only read")
    a = ap.parse_args()
    precompute_stats(a.db, a.out_db)
    sys.exit(1 if FAILED else 0)
