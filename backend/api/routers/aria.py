"""
ARIA — Automated Risk Investigation Agent

REST API router for the ARIA pipeline: investigation queue, ground truth updates,
run management, and review workflow.
"""
import json
import logging
import math
import sqlite3
import subprocess
import sys
import threading
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from pydantic import BaseModel

from ..cache import app_cache, shared
from ..config.constants import DATA_LAST_YEAR, MAX_CONTRACT_VALUE, SOURCE_SWITCH_ISO
from ..dependencies import get_db, get_write_db, get_db_dep, require_admin
from ..services import vendor_history
from ..public_labels import (
    clean_name,
    DOCUMENTED_LINK_SQL,
    NOT_SUPPRESSED_SQL,
    PUBLIC_LINK_SQL,
    PATTERN_LABELS,
    apply_public_labels,
    label_sets,
    public_pattern_counts,
    public_status_counts,
    suppressed_ids_json,
)


def _case_linked_ids_json(conn: sqlite3.Connection) -> str:
    """JSON array of every vendor with a public GT link (documented + unverified
    lead) — the complement is what the register prints as DISC (PARALLAX D14 § 2)."""
    s = label_sets(conn)
    return json.dumps(sorted(s["documented"] | s["leads"]))

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/aria", tags=["aria"])

_STATS_CACHE_KEY = "aria_stats"
_aria_stats_lock = threading.Lock()
_ARIA_STATS_DB_KEY = "aria_stats_full"

# ---------------------------------------------------------------------------
# In-memory run status tracker (lightweight, no DB needed)
# ---------------------------------------------------------------------------

_run_lock = threading.Lock()
_run_status: dict = {
    "running": False,
    "phase": None,       # "pipeline" | "memos_tier1" | "memos_tier2" | None
    "started_at": None,
    "completed_at": None,
    "error": None,
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_VALID_REVIEW_STATUSES = {"pending", "confirmed", "dismissed", "reviewing"}
_VALID_GT_REVIEW_STATUSES = {"approved", "rejected"}
#: review_status values that mean "an analyst ruled this a false positive" (SQL tuple literal).
_FP_STATUSES = "('false_positive', 'fp_excluded', 'structural_fp')"


def _table_exists(conn: sqlite3.Connection, table: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (table,)
    ).fetchone()
    return row is not None


def _memo_visible_sql(conn: sqlite3.Connection, alias: str) -> str:
    """SQL predicate hiding memos held in content review (memo_status = 'hold').

    _weekend/dossiers/FINDINGS.md: unreviewed memos that assert wrongdoing without a
    checked source are held. Tolerates DBs where the column does not exist yet.
    """
    table = "aria_queue" if alias == "q" else "aria_memos"
    cols = {r[1] for r in conn.execute(f"PRAGMA table_info({table})")}
    return f"COALESCE({alias}.memo_status, '') <> 'hold'" if "memo_status" in cols else "1 = 1"


def _decode_json_field(value) -> Optional[dict]:
    """Safely decode a JSON string column. Returns None on failure."""
    if value is None:
        return None
    if isinstance(value, (dict, list)):
        return value
    try:
        return json.loads(value)
    except Exception as e:
        logger.warning(f"Failed to decode JSON field: {e}")
        return None


def _row_to_dict(row: sqlite3.Row) -> dict:
    """Every ARIA row leaves through here: names are public (owner: transparency); RFC-like names are
    dropped and personas físicas are flagged so the UI can label them."""
    d = dict(row)
    if "vendor_name" in d and d.get("vendor_id") is not None:
        d["vendor_name"] = clean_name(d["vendor_name"])
        d["persona_fisica"] = d["vendor_id"] in _pf_ids()
    return d


_PF_IDS: dict = {"t": 0.0, "v": frozenset()}


def _pf_ids() -> frozenset:
    """Personas físicas in the queue (public_labels.label_sets), re-read every 5 min."""
    if time.time() - _PF_IDS["t"] > 300:
        with get_db() as conn:
            _PF_IDS["v"] = frozenset(label_sets(conn)["pf"])
        _PF_IDS["t"] = time.time()
    return _PF_IDS["v"]


def _bool_fields(d: dict, *fields: str) -> dict:
    """Convert SQLite integer (0/1) columns to Python booleans in-place."""
    for f in fields:
        if f in d and d[f] is not None:
            d[f] = bool(d[f])
    return d


# ---------------------------------------------------------------------------
# GET /aria/queue
# ---------------------------------------------------------------------------

@router.get("/queue")
def get_aria_queue(
    tier: Optional[int] = Query(None, ge=1, le=4),
    pattern: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    vendor_id: Optional[int] = Query(None, ge=1, description="One vendor's row (the dossier's deep link)"),
    ids: Optional[str] = Query(None, max_length=2400, pattern=r"^\d{1,9}(,\d{1,9}){0,199}$",
                               description="Comma-separated vendor ids, ≤ 200 (the /atlas lasso → La Cola, weekend E1)"),
    efos_only: bool = Query(False),
    new_vendor_only: bool = Query(False),
    novel_only: bool = Query(False, description="When True, only vendors with no public case link (public_labels: not documented, not a lead)"),
    min_ips: Optional[float] = Query(None, ge=0, le=1),
    status: Optional[str] = Query(None),
    sector_id: Optional[int] = Query(None, ge=1, le=12, description="Scope to a specific sector (1-12)"),
    min_years_active: Optional[int] = Query(None, ge=0, le=30, description="Minimum vendor years active"),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=100),
    conn: sqlite3.Connection = Depends(get_db_dep),
):
    """List the ARIA investigation queue with filters and pagination."""
    empty_pagination = {
        "page": page,
        "per_page": per_page,
        "total": 0,
        "total_pages": 0,
    }

    if not _table_exists(conn, "aria_queue"):
        return {
            "data": [],
            "message": "ARIA pipeline has not been run yet.",
            "pagination": empty_pagination,
            "run_summary": None,
        }

    # Build WHERE clause
    conditions = []
    params: list = []

    if tier is not None:
        conditions.append("q.ips_tier = ?")
        params.append(tier)
    if pattern is not None:
        conditions.append("q.primary_pattern = ?")
        params.append(pattern)
        # Suppressed labels (public_labels § B4) must not be findable by pattern.
        conditions.append("q." + NOT_SUPPRESSED_SQL)
        params.append(suppressed_ids_json(conn))
    if search is not None:
        conditions.append("q.vendor_name LIKE ?")
        params.append(f"%{search}%")
    if vendor_id is not None:
        # By id: the name LIKE folds ASCII only, so every accented name missed
        # (PARALLAX D13b § Change 7, R6).
        conditions.append("q.vendor_id = ?")
        params.append(vendor_id)
    if ids is not None:
        # Additive filter: the selection's ids, ANDed with every other filter.
        conditions.append("q.vendor_id IN (SELECT CAST(value AS INTEGER) FROM json_each(?))")
        params.append(json.dumps([int(x) for x in ids.split(",")]))
    if efos_only:
        conditions.append("q.is_efos_definitivo = 1")
    if new_vendor_only:
        conditions.append("q.new_vendor_risk = 1")
    if novel_only:
        # Same rule as the rows' GT/LEAD/DISC eyebrow and the summary: the raw
        # in_ground_truth column also counts false-positive links (PARALLAX D14 § 2).
        conditions.append("q.vendor_id NOT IN (SELECT value FROM json_each(?))")
        params.append(_case_linked_ids_json(conn))
    if min_ips is not None:
        conditions.append("q.ips_final >= ?")
        params.append(min_ips)
    if status is not None:
        conditions.append("q.review_status = ?")
        params.append(status)
    if sector_id is not None:
        # aria_queue.primary_sector_id is denormalized from vendor activity.
        # Resolves the compliance-officer journey (previously 3/10, no sector scoping).
        conditions.append("q.primary_sector_id = ?")
        params.append(sector_id)
    if min_years_active is not None:
        conditions.append("q.years_active >= ?")
        params.append(min_years_active)

    where_sql = ("WHERE " + " AND ".join(conditions)) if conditions else ""

    # Total count
    total = conn.execute(
        f"SELECT COUNT(*) FROM aria_queue q {where_sql}", params
    ).fetchone()[0]

    total_pages = math.ceil(total / per_page) if total > 0 else 0
    offset = (page - 1) * per_page

    rows = conn.execute(
        f"""
        SELECT q.vendor_id, q.vendor_name, q.ips_final, q.ips_raw, q.ips_tier,
               q.primary_pattern, q.pattern_confidence, q.pattern_confidences,
               q.total_contracts, q.total_value_mxn, q.avg_risk_score,
               q.is_efos_definitivo, q.is_sfp_sanctioned, q.in_ground_truth,
               q.fp_penalty, q.fp_patent_exception, q.fp_data_error,
               q.fp_structural_monopoly, q.burst_score,
               COALESCE(q.review_status, 'pending') as review_status,
               q.primary_sector_name, q.primary_sector_id, q.years_active,
               q.direct_award_rate, q.computed_at,
               COALESCE(q.new_vendor_risk, 0) as new_vendor_risk,
               q.risk_score_norm, q.ensemble_norm, q.financial_scale_norm,
               q.external_flags_score, q.is_disappeared,
               q.top_institution, q.top_institution_ratio, q.value_per_contract,
               q.web_evidence_score, q.web_evidence_verdict, q.web_evidence_updated_at,
               vs.last_contract_year, vs.first_contract_year,
               q.memo_provenance, COALESCE(q.in_ground_truth, 0) as gt_overlay
        FROM aria_queue q
        LEFT JOIN vendor_stats vs ON vs.vendor_id = q.vendor_id
        {where_sql}
        ORDER BY q.ips_final DESC
        LIMIT ? OFFSET ?
        """,
        params + [per_page, offset],
    ).fetchall()

    data = []
    for row in rows:
        d = _row_to_dict(row)
        _bool_fields(
            d, "is_efos_definitivo", "is_sfp_sanctioned", "in_ground_truth",
            "new_vendor_risk", "fp_patent_exception", "fp_data_error",
            "fp_structural_monopoly", "is_disappeared", "gt_overlay",
        )
        d["pattern_confidences"] = _decode_json_field(d.get("pattern_confidences"))
        # Compute value_per_contract on the fly when not stored
        if not d.get("value_per_contract") and d.get("total_contracts") and d.get("total_value_mxn"):
            d["value_per_contract"] = d["total_value_mxn"] / d["total_contracts"]
        data.append(d)
    apply_public_labels(conn, data)
    # the row's buyer as a chip, not text (interconnection audit 2026-10-27): same siglas → busiest registration rule as _nuevos
    inst_ids = _resolve_institution_ids(conn, sorted({d['top_institution'] for d in data if d.get('top_institution')}))
    for d in data:
        d['top_institution_id'] = (inst_ids.get(d.get('top_institution')) or {}).get('institution_id')
        d['thin_history'] = vendor_history.vendor_thin_history(conn, d['vendor_id'])

    # Latest run summary
    run_summary = None
    if _table_exists(conn, "aria_runs"):
        run_row = conn.execute(
            """
            SELECT id, started_at, completed_at, status, vendors_processed,
                   tier1_count, tier2_count, tier3_count, tier4_count,
                   gt_auto_inserts, gt_flags, error_message, aria_version
            FROM aria_runs
            ORDER BY started_at DESC
            LIMIT 1
            """
        ).fetchone()
        if run_row:
            run_summary = _row_to_dict(run_row)

    # Provenance summary (cached 60s). Computed through public_labels.label_sets
    # — the SAME rule as each row's in_ground_truth / gt_lead — so the header
    # line can never contradict the eyebrows below it (PARALLAX D14 § 2: the raw
    # column counted 299/299 "anchored" while the rows printed DISC on 204).
    summary: dict = app_cache.get(_STATS_CACHE_KEY + "_tiers", "tier_summary") or {}
    if not summary:
        summary = {
            "total_t1": 0, "documented_t1": 0, "lead_t1": 0, "novel_leads_t1": 0,
            "known_gt_t1": 0,
            "total_t2": 0, "documented_t2": 0, "lead_t2": 0, "novel_leads_t2": 0,
        }
        try:
            s = label_sets(conn)
            for vid, t in conn.execute(
                "SELECT vendor_id, ips_tier FROM aria_queue WHERE ips_tier IN (1, 2)"
            ):
                kind = "documented" if vid in s["documented"] else "lead" if vid in s["leads"] else "novel_leads"
                summary[f"total_t{t}"] += 1
                summary[f"{kind}_t{t}"] += 1
            # Back-compat: "known GT" = linked to the case set (documented + lead).
            summary["known_gt_t1"] = summary["documented_t1"] + summary["lead_t1"]
            app_cache.set(_STATS_CACHE_KEY + "_tiers", "tier_summary", summary, maxsize=16, ttl=60)
        except Exception as e:
            logger.warning(f"Failed to compute ARIA summary stats (novel_leads): {e}")

    return {
        "data": data,
        "pagination": {
            "page": page,
            "per_page": per_page,
            "total": total,
            "total_pages": total_pages,
        },
        "run_summary": run_summary,
        "summary": summary,
    }


# ---------------------------------------------------------------------------
# GET /aria/rosettes — Focos Rojos «Rayos X» wall (static route before /{id})
# ---------------------------------------------------------------------------

_NUEVOS_FIELDS = ("vendor_id", "vendor_name", "ips_final", "ips_tier", "total_value_mxn", "total_contracts",
                  "primary_pattern", "top_institution", "top_institution_ratio", "years_active",
                  "direct_award_rate", "is_efos_definitivo", "is_sfp_sanctioned",
                  # the wall's sector filter and «Lista» indicator column (owner 2026-11-02: navigation)
                  "primary_sector_name", "avg_risk_score")


def _nuevos(conn: sqlite3.Connection, tier: int) -> list:
    """«Nuevos» (owner 2026-10-16): vendors of `tier` with NO ground-truth link of any kind
    (documented, lead or FP), not suppressed (persona física / public entity), not marked a
    false positive by an analyst, and with a contract in 2019 or later. Value-descending."""
    ls = label_sets(conn)
    known = ls["documented"] | ls["leads"] | ls["fp"] | set(ls["suppressed"])
    cols = ", ".join(f"q.{c}" for c in _NUEVOS_FIELDS)
    rows = conn.execute(
        f"""SELECT {cols}, CAST(substr(v.last_contract_date, 1, 4) AS INTEGER) last_contract_year
            FROM aria_queue q JOIN vendors v ON v.id = q.vendor_id
            WHERE q.ips_tier = ? AND COALESCE(q.in_ground_truth, 0) = 0
              AND COALESCE(q.review_status, '') NOT IN {_FP_STATUSES}
              AND substr(v.last_contract_date, 1, 4) >= '2019'
            ORDER BY q.total_value_mxn DESC""", (tier,)).fetchall()
    items = [dict(zip(_NUEVOS_FIELDS + ("last_contract_year",), r)) for r in rows if r[0] not in known]
    # After the blackout: what each one kept getting — register rows dated from the source switch
    # (ComprasMX, structure E). Never the staging table comprasmx_contracts: those rows are already in
    # `contracts`, so adding them double-counts.
    post: dict = {}
    vids = [it["vendor_id"] for it in items]
    for i in range(0, len(vids), 900):
        chunk = vids[i:i + 900]
        post.update(conn.execute(
            f"""SELECT vendor_id, SUM(amount_mxn) FROM contracts
                WHERE vendor_id IN ({','.join('?' * len(chunk))}) AND contract_date >= ?
                  AND amount_mxn > 0 AND amount_mxn <= ?
                GROUP BY vendor_id""", (*chunk, SOURCE_SWITCH_ISO, MAX_CONTRACT_VALUE)))
    for it in items:
        it["post_blackout_mxn"] = post.get(it["vendor_id"])
    # The chip needs an id: top_institution is a siglas, resolved to its busiest registration.
    inst = _resolve_institution_ids(conn, sorted({it["top_institution"] for it in items if it["top_institution"]}))
    pf = _pf_ids()
    for it in items:
        it["in_ground_truth"] = False
        it["top_institution_id"] = (inst.get(it["top_institution"]) or {}).get("institution_id")
        # same contract as every ARIA row (_row_to_dict): RFC-like names dropped, personas físicas flagged for the label
        it["vendor_name"] = clean_name(it.get("vendor_name"))
        it["persona_fisica"] = it["vendor_id"] in pf
    return items


@router.get("/rosettes")
def get_aria_rosettes(
    per_vendor: int = Query(100, ge=0, le=200),
    set_: str = Query("tier1", alias="set", pattern="^(tier1|nuevos)$"),
    tier: int = Query(2, ge=2, le=3),
    conn: sqlite3.Connection = Depends(get_db_dep),
):
    """Vendors' largest contracts as [year, amount_mxn, risk_score, is_direct_award],
    amount-descending. set=tier1: the tier-1 wall (GT false positives off).
    set=nuevos&tier=2|3: the «Nuevos» wall — rows come back in `items` (per_vendor=0 → no rosettes)."""
    ck = f"rosettes:{set_}:{tier}:{per_vendor}"
    cached = app_cache.get(_STATS_CACHE_KEY, ck)
    if cached is not None:
        return cached
    out: dict = {"tier": 1 if set_ == "tier1" else tier, "set": set_, "per_vendor": per_vendor, "vendors": {}}
    if not _table_exists(conn, "aria_queue"):
        return out
    if set_ == "nuevos":
        out["items"] = _nuevos(conn, tier)
        ids = [it["vendor_id"] for it in out["items"]] if per_vendor else []
    else:
        fp = label_sets(conn)["fp"]
        # Analyst-marked false positives (e.g. ICA, 1094) leave the wall too.
        ids = [r[0] for r in conn.execute(
            f"SELECT vendor_id FROM aria_queue WHERE ips_tier = 1"
            f" AND COALESCE(review_status, '') NOT IN {_FP_STATUSES}"
        ) if r[0] not in fp]
    for vid in ids:
        rows = conn.execute(
            f"""SELECT contract_year, amount_mxn, risk_score, COALESCE(is_direct_award, 0)
               FROM contracts
               WHERE vendor_id = ? AND amount_mxn > 0 AND amount_mxn <= ?
                 AND contract_year BETWEEN 2002 AND {DATA_LAST_YEAR}
               ORDER BY amount_mxn DESC LIMIT ?""",
            (vid, MAX_CONTRACT_VALUE, per_vendor),
        ).fetchall()
        if rows:
            out["vendors"][str(vid)] = [
                [y, a, None if s is None else round(s, 3), 1 if da else 0] for y, a, s, da in rows
            ]
    app_cache.set(_STATS_CACHE_KEY, ck, out, maxsize=16, ttl=3600)
    return out


# ---------------------------------------------------------------------------
# GET /aria/mapa · /aria/mapa/vendors — Focos Rojos «El mapa de la fila» (static routes before /{id})
# ---------------------------------------------------------------------------

def _mapa_fila(conn: sqlite3.Connection) -> list[dict]:
    """The fila de investigación (tiers 1–3, analyst and GT false positives off) with each
    vendor's percentile rank over the fila for every aspect metric. One window scan of
    aria_queue ⋈ vendor_stats (~10K rows), cached 1 h like the rosettes. Never `contracts`."""
    cached = app_cache.get(_STATS_CACHE_KEY, "mapa_fila")
    if cached is not None:
        return cached
    if not _table_exists(conn, "aria_queue"):
        return []
    # the v0.9.2 model's own inputs vs the vendor's sector (scripts/precompute_aria_drivers.py); absent → none
    if _table_exists(conn, "aria_vendor_drivers"):
        drv = ("d.vol_pct AS pct_vol, d.pr AS drv_pr, d.pr_pct AS pct_pr, d.conc_pct AS pct_conc",
               "LEFT JOIN aria_vendor_drivers d ON d.vendor_id = q.vendor_id")
    else:
        drv = ("NULL AS pct_vol, NULL AS drv_pr, NULL AS pct_pr, NULL AS pct_conc", "")
    rows = conn.execute(
        f"""SELECT q.vendor_id, q.vendor_name, q.ips_final, q.ips_tier, q.avg_risk_score, q.primary_pattern,
                   q.pattern_confidences, q.primary_sector_id, q.total_value_mxn, q.total_contracts,
                   q.top_institution, q.top_institution_ratio, q.direct_award_rate, q.single_bid_rate,
                   q.years_active, COALESCE(q.is_disappeared, 0) AS is_disappeared,
                   COALESCE(q.is_efos_definitivo, 0) AS is_efos_definitivo,
                   COALESCE(q.is_sfp_sanctioned, 0) AS is_sfp_sanctioned,
                   COALESCE(q.in_ground_truth, 0) AS in_ground_truth,
                   vs.first_contract_year, vs.last_contract_year, {drv[0]},
                   PERCENT_RANK() OVER (ORDER BY q.top_institution_ratio) AS pct_ratio,
                   PERCENT_RANK() OVER (ORDER BY q.direct_award_rate) AS pct_da,
                   PERCENT_RANK() OVER (ORDER BY q.single_bid_rate) AS pct_sb,
                   PERCENT_RANK() OVER (ORDER BY q.avg_risk_score) AS pct_risk,
                   PERCENT_RANK() OVER (PARTITION BY q.primary_sector_id ORDER BY q.total_value_mxn / MAX(q.total_contracts, 1)) AS pct_vpc,
                   PERCENT_RANK() OVER (ORDER BY q.total_value_mxn) AS pct_value,
                   PERCENT_RANK() OVER (ORDER BY vs.first_contract_year) AS pct_new
            FROM aria_queue q
            LEFT JOIN vendor_stats vs ON vs.vendor_id = q.vendor_id
            {drv[1]}
            WHERE q.ips_tier <= 3
              AND COALESCE(q.review_status, '') NOT IN {_FP_STATUSES}
              AND q.vendor_id NOT IN (SELECT value FROM json_each(?))
            ORDER BY q.ips_final DESC""",
        (json.dumps(sorted(label_sets(conn)["fp"])),),
    ).fetchall()
    fila = [_row_to_dict(r) for r in rows]
    apply_public_labels(conn, fila)  # pattern suppression, documented-only GT, persona física
    n = max(1, len(fila))
    # a flag's «how extreme» is its rarity in the fila (an EFOS on 2 % of rows reads 0.98)
    rare = {k: 1 - sum(1 for r in fila if r.get(k)) / n
            for k in ("is_efos_definitivo", "is_sfp_sanctioned", "in_ground_truth", "is_disappeared")}
    for r in fila:
        r["pattern_confidences"] = _decode_json_field(r.get("pattern_confidences"))
        for k in ("is_disappeared", "is_efos_definitivo", "is_sfp_sanctioned", "in_ground_truth"):
            r[k] = bool(r[k])
        r["aspects"] = _mapa_aspects(r, rare)
    inst = _resolve_institution_ids(conn, sorted({r["top_institution"] for r in fila if r["top_institution"]}))
    for r in fila:
        r["top_institution_id"] = (inst.get(r["top_institution"]) or {}).get("institution_id")
    app_cache.set(_STATS_CACHE_KEY, "mapa_fila", fila, maxsize=16, ttl=3600)
    return fila


DRIVER_BAR = 0.9  # a model input is an aspect only in the top 10 % of its sector's vendors


def _mapa_aspects(r: dict, rare: dict) -> list[dict]:
    """What distinguishes one vendor, ≤ 3, the most extreme first (owner 2026-11-02/03): its buyer, its
    arrival with big money, its exit, an external record, sole-bidder tenders; the v0.9.2 model's own
    top inputs (uneven contract sizes, amount vs its sector's median, weight in its sector) only in its
    sector's top 10 % (with nothing distinctive, its strongest input above its sector's median); amount per contract only in its sector's top 5 % of the fila, direct awards only
    in the fila's top 10 %. The indicator never (it sits in the row's own column). Each is a real
    standout or it is not shown; a vendor with none shows its single most extreme numeric.
    {k, v, pct}: pct = share of the fila (or, for vol/pr/conc, of its sector's vendors) it exceeds,
    or 1 − prevalence for a flag; vol/conc carry v = pct, pr carries v = × its sector median. The UI phrases them."""
    a: list[tuple[str, float, float]] = []
    y0, y1 = r["first_contract_year"], r["last_contract_year"]
    ratio = r["top_institution_ratio"]
    if r["top_institution"] and ratio is not None and ratio >= 0.8:
        a.append(("ratio", ratio, r["pct_ratio"]))
    if y0 and y0 >= 2019 and r["pct_value"] >= 0.6:
        a.append(("new", y0, r["pct_new"]))
    if r["is_disappeared"] and y1:
        a.append(("gone", y1, rare["is_disappeared"]))
    for k, flag in (("efos", "is_efos_definitivo"), ("sfp", "is_sfp_sanctioned"), ("gt", "in_ground_truth")):
        if r[flag]:
            a.append((k, 1, rare[flag]))
    sb = r["single_bid_rate"]
    if sb is not None and sb >= 0.5:
        a.append(("sb", sb, r["pct_sb"]))
    vpc = r["total_value_mxn"] / r["total_contracts"] if r["total_contracts"] else None
    if vpc is not None and r["pct_vpc"] >= 0.95:
        a.append(("vpc", vpc, r["pct_vpc"]))
    da = r["direct_award_rate"]
    if da is not None and r["pct_da"] >= 0.9:
        a.append(("da", da, r["pct_da"]))
    # why the model scores it high: its v0.9.2 inputs in its sector's top 10 % (pct over the sector's vendors)
    for k, v in (("vol", r["pct_vol"]), ("pr", r["drv_pr"]), ("conc", r["pct_conc"])):
        p = r[f"pct_{k}"]
        if p is not None and p >= DRIVER_BAR and (k != "pr" or v > 1):
            a.append((k, v, p))
    a.sort(key=lambda t: -t[2])  # the most extreme first
    if not a:
        # nothing passes a bar: its strongest model input above its sector's median (why the model scores it);
        # else its amount per contract, which only the card prints — the list shows «—» rather than a non-reason
        # (a 2 % sole-bidder rate or a 1.1× ratio is a fact, not a reason)
        drv = [(k, v, r[f"pct_{k}"]) for k, v in (("vol", r["pct_vol"]), ("pr", r["drv_pr"]), ("conc", r["pct_conc"]))
               if r[f"pct_{k}"] is not None and r[f"pct_{k}"] >= 0.5 and (k != "pr" or v > 1)]
        if drv:
            a.append(max(drv, key=lambda t: t[2]))
        elif vpc is not None:
            a.append(("vpc", vpc, r["pct_vpc"]))
    return [{"k": k, "v": round(v, 4), "pct": round(p, 3)} for k, v, p in a[:3]]


@router.get("/mapa")
def get_aria_mapa(conn: sqlite3.Connection = Depends(get_db_dep)):
    """The fila by buyer: for each main institution (aria_queue.top_institution, resolved to its
    busiest registration) its flagged vendors — count, money, worst tier — plus sector totals."""
    cached = app_cache.get(_STATS_CACHE_KEY, "mapa")
    if cached is not None:
        return cached
    fila = _mapa_fila(conn)
    by_inst: dict[str, dict] = {}
    by_sec: dict[int, dict] = {}
    for r in fila:
        s = by_sec.setdefault(r["primary_sector_id"] or 12, {"sector_id": r["primary_sector_id"] or 12, "vendors": 0, "value": 0.0, "tier1": 0, "institutions": set()})
        s["vendors"] += 1
        s["value"] += r["total_value_mxn"] or 0
        s["tier1"] += r["ips_tier"] == 1
        sig = r["top_institution"]
        if not sig:
            continue
        # one buyer, two keys (its siglas on some rows, its name on others): one star
        key = r["top_institution_id"] or sig
        s["institutions"].add(key)
        d = by_inst.get(key)
        if d is None:
            d = by_inst[key] = {"siglas": sig, "institution_id": r["top_institution_id"], "vendors": 0, "value": 0.0,
                                "worst_tier": 4, "tier1": 0, "top_vendor_id": r["vendor_id"], "top_vendor_name": r["vendor_name"]}
        d["vendors"] += 1
        d["value"] += r["total_value_mxn"] or 0
        d["worst_tier"] = min(d["worst_tier"], r["ips_tier"])
        d["tier1"] += r["ips_tier"] == 1
    ids = [d["institution_id"] for d in by_inst.values() if d["institution_id"]]
    meta: dict[int, tuple] = {}
    for i in range(0, len(ids), 900):
        chunk = ids[i:i + 900]
        meta.update((row[0], (row[1], row[2])) for row in conn.execute(
            f"SELECT id, name, sector_id FROM institutions WHERE id IN ({','.join('?' * len(chunk))})", chunk))
    for d in by_inst.values():
        d["name"], d["sector_id"] = meta.get(d["institution_id"], (None, None))
    run = conn.execute("SELECT id, completed_at FROM aria_runs ORDER BY started_at DESC LIMIT 1").fetchone() \
        if _table_exists(conn, "aria_runs") else None
    out = {
        "run": dict(run) if run else None,
        "totals": {"vendors": len(fila), "value": sum(r["total_value_mxn"] or 0 for r in fila),
                   "tier1": sum(1 for r in fila if r["ips_tier"] == 1), "institutions": len(by_inst)},
        "sectors": sorted(({**s, "institutions": len(s["institutions"])} for s in by_sec.values()), key=lambda s: s["sector_id"]),
        "institutions": sorted(by_inst.values(), key=lambda d: -d["value"]),
    }
    app_cache.set(_STATS_CACHE_KEY, "mapa", out, maxsize=16, ttl=3600)
    return out


@router.get("/mapa/vendors")
def get_aria_mapa_vendors(
    sector_id: Optional[int] = Query(None, ge=1, le=12),
    institution_id: Optional[int] = Query(None, ge=1),
    limit: int = Query(10, ge=1, le=50),
    conn: sqlite3.Connection = Depends(get_db_dep),
):
    """The fila's ranking (ips_final desc) inside a sector or a main buyer, each row with its
    standout aspects. `institution_id` is the buyer each row resolved to (siglas or name key)."""
    fila = _mapa_fila(conn)
    if institution_id is not None:
        fila = [r for r in fila if r["top_institution_id"] == institution_id]
    if sector_id is not None:
        fila = [r for r in fila if (r["primary_sector_id"] or 12) == sector_id]
    data = [{**r, "rank": i + 1} for i, r in enumerate(fila[:limit])]
    for d in data:
        for k in list(d):
            if k.startswith(("pct_", "drv_")):
                del d[k]
    return {"rule": "ips_final", "total": len(fila), "data": data}


@router.get("/mapa/escenario")
def get_aria_mapa_escenario(conn: sqlite3.Connection = Depends(get_db_dep)):
    """Focos Rojos «¿Quién muestra más señales de riesgo?» (/aria?ver=concept, owner brief 2026-11-03): the whole
    fila (tiers 1–3) as columns, each vendor with its money per sexenio — in total (`sx`) and per sector (`ss`,
    vendor_year, outgoing-president rule of api.administrations) — and its ≤ 3 standout aspects, so the reader's
    scenario — sexenio × sector × buyer (its main buyer) × pattern (its main pattern) — ranks in the browser.
    `sec` = the sector where it sells most. Cached 1 h with the fila."""
    cached = app_cache.get(_STATS_CACHE_KEY, "escenario")
    if cached is None:
        # precomputed_stats copy shared by all workers (owner 11-07 speed: /aria 2–3.5 s on each cold worker)
        # keyed on the latest ARIA run, so a new run never serves the previous fila
        run = conn.execute("SELECT id FROM aria_runs ORDER BY started_at DESC LIMIT 1").fetchone() \
            if _table_exists(conn, "aria_runs") else None
        cached = shared(f"shared:aria/mapa/escenario:v1:{run[0] if run else 0}", 86400, lambda: _build_escenario(conn))
        app_cache.set(_STATS_CACHE_KEY, "escenario", cached, maxsize=16, ttl=3600)
    return cached


def _build_escenario(conn: sqlite3.Connection) -> dict:
    from ..administrations import ADMINISTRATIONS, get_administration_for_year
    fila = _mapa_fila(conn)
    keys = [a.key for a in ADMINISTRATIONS]
    slot = {a.key: i for i, a in enumerate(ADMINISTRATIONS)}
    # money per sexenio, in total (`sx`) and per sector (`ss`: a vendor sells in several sectors; owner 2026-11-03:
    # one dot, in the sector where it sells most, but a sector's list counts its money IN that sector)
    sx: dict[int, list[float]] = {r["vendor_id"]: [0.0] * len(keys) for r in fila}
    ss: dict[int, dict[int, list[float]]] = {r["vendor_id"]: {} for r in fila}
    if fila and _table_exists(conn, "vendor_year"):
        for vid, sec, year, amt in conn.execute(
            """SELECT vendor_id, sector_id, year, SUM(amount_mxn) FROM vendor_year
               WHERE vendor_id IN (SELECT value FROM json_each(?)) GROUP BY vendor_id, sector_id, year""",
            (json.dumps(list(sx)),),
        ):
            adm = get_administration_for_year(year)
            if adm is not None and amt:
                sx[vid][slot[adm.key]] += amt
                ss[vid].setdefault(sec or 12, [0.0] * len(keys))[slot[adm.key]] += amt
    # `pub` = RUBLI holds a case on it that cites the press, a legal act or an audit, even if below the «documented»
    # bar (B3): such a vendor is not «nadie lo ha investigado» (reviewer 2026-11-04: GFE, Centrum sat at #1–2)
    pub: set[int] = set()
    if _table_exists(conn, "ground_truth_vendors") and _table_exists(conn, "ground_truth_cases"):
        pub = {row[0] for row in conn.execute(
            f"""SELECT DISTINCT gtv.vendor_id FROM ground_truth_vendors gtv JOIN ground_truth_cases gtc ON gtc.id = gtv.case_id
                WHERE gtv.vendor_id IS NOT NULL AND {PUBLIC_LINK_SQL}
                  AND (TRIM(COALESCE(gtc.source_asf, '')) <> '' OR TRIM(COALESCE(gtc.source_news, '')) <> ''
                       OR TRIM(COALESCE(gtc.source_legal, '')) <> ''
                       OR gtc.case_origin IN ('official_record', 'media_report', 'audit_report', 'official_investigation'))""")}
    cols: dict[str, list] = {k: [] for k in ("id", "name", "pf", "sec", "pat", "tier", "ips", "risk", "inst", "inst_name",
                                             "value", "n", "y0", "y1", "da", "sb", "ratio", "gone", "efos", "sfp", "gt", "pub", "sx", "ss", "asp")}
    for r in fila:
        split = sorted(((sec, [round(x) for x in m]) for sec, m in ss[r["vendor_id"]].items()), key=lambda t: -sum(t[1]))
        cols["id"].append(r["vendor_id"]); cols["name"].append(r["vendor_name"]); cols["pf"].append(1 if r.get("persona_fisica") else 0)
        # the main sector = where it sells most (vendor_year); the queue's sector when no year rows exist
        cols["sec"].append(split[0][0] if split else (r["primary_sector_id"] or 12)); cols["pat"].append(r["primary_pattern"]); cols["tier"].append(r["ips_tier"])
        cols["ss"].append(split)
        cols["ips"].append(round(r["ips_final"], 3)); cols["risk"].append(None if r["avg_risk_score"] is None else round(r["avg_risk_score"], 3))
        cols["inst"].append(r["top_institution_id"]); cols["inst_name"].append(r["top_institution"])
        cols["value"].append(round(r["total_value_mxn"] or 0)); cols["n"].append(r["total_contracts"])
        cols["y0"].append(r["first_contract_year"]); cols["y1"].append(r["last_contract_year"])
        cols["da"].append(None if r["direct_award_rate"] is None else round(r["direct_award_rate"], 3))
        cols["sb"].append(None if r["single_bid_rate"] is None else round(r["single_bid_rate"], 3))
        cols["ratio"].append(None if r["top_institution_ratio"] is None else round(r["top_institution_ratio"], 3))
        cols["gone"].append(1 if r["is_disappeared"] else 0); cols["efos"].append(1 if r["is_efos_definitivo"] else 0)
        cols["sfp"].append(1 if r["is_sfp_sanctioned"] else 0); cols["gt"].append(1 if r["in_ground_truth"] else 0)
        cols["pub"].append(1 if r["vendor_id"] in pub else 0)
        cols["sx"].append([round(v) for v in sx[r["vendor_id"]]])
        cols["asp"].append([[a["k"], a["v"], a["pct"]] for a in r["aspects"]])
    run = conn.execute("SELECT id, completed_at FROM aria_runs ORDER BY started_at DESC LIMIT 1").fetchone() \
        if _table_exists(conn, "aria_runs") else None
    return {"run": dict(run) if run else None, "sexenios": keys, "n": len(fila), "cols": cols}


# ---------------------------------------------------------------------------
# GET /aria/queue/{vendor_id}
# ---------------------------------------------------------------------------

@router.get("/queue/{vendor_id}")
def get_aria_queue_vendor(
    vendor_id: int,
    conn: sqlite3.Connection = Depends(get_db_dep),
):
    """Full ARIA detail for a single vendor."""
    if not _table_exists(conn, "aria_queue"):
        raise HTTPException(status_code=404, detail="ARIA pipeline has not been run yet.")

    row = conn.execute(
        """
        SELECT q.*,
               vs.new_vendor_risk_score,
               vs.new_vendor_risk_triggers
        FROM aria_queue q
        LEFT JOIN vendor_stats vs ON q.vendor_id = vs.vendor_id
        WHERE q.vendor_id = ?
        """,
        (vendor_id,),
    ).fetchone()

    if row is None:
        raise HTTPException(status_code=404, detail=f"Vendor {vendor_id} not found in ARIA queue.")

    d = _row_to_dict(row)
    if d.get("memo_status") == "hold":
        d["memo_text"] = None
    d.pop("reviewer_notes", None)  # unreviewed analyst free text (1,035 rows); no UI consumer
    _bool_fields(
        d,
        "is_efos_definitivo",
        "is_sfp_sanctioned",
        "in_ground_truth",
        "is_disappeared",
        "fp_patent_exception",
        "fp_data_error",
        "fp_structural_monopoly",
        "new_vendor_risk",
    )
    # Decode JSON text column
    d["pattern_confidences"] = _decode_json_field(d.get("pattern_confidences"))
    apply_public_labels(conn, [d])

    # GT case anchor — the documented case this lead traces to (T1 is 299/299
    # GT-anchored; the queue row only carries the boolean). Indexed PK-path join.
    d["gt_case_name"] = None
    d["gt_case_type"] = None
    if d.get("in_ground_truth") and _table_exists(conn, "ground_truth_vendors"):
        try:
            gt_row = conn.execute(
                f"""
                SELECT gtc.case_name, gtc.case_type
                FROM ground_truth_vendors gtv
                JOIN ground_truth_cases gtc ON gtv.case_id = gtc.id
                WHERE gtv.vendor_id = ? AND {DOCUMENTED_LINK_SQL}
                ORDER BY gtv.match_confidence DESC
                LIMIT 1
                """,
                (vendor_id,),
            ).fetchone()
            if gt_row:
                d["gt_case_name"] = gt_row["case_name"]
                d["gt_case_type"] = gt_row["case_type"]
        except Exception:
            pass

    # Include memo if available
    d["memo"] = None
    if _table_exists(conn, "aria_memos"):
        memo_row = conn.execute(
            "SELECT memo_text, memo_type, created_at FROM aria_memos m "
            f"WHERE m.vendor_id = ? AND {_memo_visible_sql(conn, 'm')} ORDER BY m.created_at DESC LIMIT 1",
            (vendor_id,),
        ).fetchone()
        if memo_row:
            d["memo"] = {
                "memo_text": memo_row["memo_text"],
                "memo_type": memo_row["memo_type"],
                "created_at": memo_row["created_at"],
            }

    return d


# ---------------------------------------------------------------------------
# PATCH /aria/queue/{vendor_id}/review
# ---------------------------------------------------------------------------

class ReviewUpdate(BaseModel):
    status: str
    reviewer_name: Optional[str] = None
    notes: Optional[str] = None


@router.patch("/queue/{vendor_id}/review")
def patch_aria_review(
    vendor_id: int,
    body: ReviewUpdate,
    conn: sqlite3.Connection = Depends(get_db_dep),
    _: None = Depends(require_admin),
):
    """Update the review status for a vendor in the ARIA queue."""
    if body.status not in _VALID_REVIEW_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status '{body.status}'. Must be one of: {sorted(_VALID_REVIEW_STATUSES)}",
        )

    if not _table_exists(conn, "aria_queue"):
        raise HTTPException(status_code=404, detail="ARIA pipeline has not been run yet.")

    existing = conn.execute(
        "SELECT vendor_id FROM aria_queue WHERE vendor_id = ?", (vendor_id,)
    ).fetchone()
    if existing is None:
        raise HTTPException(status_code=404, detail=f"Vendor {vendor_id} not found in ARIA queue.")

    conn.execute(
        """
        UPDATE aria_queue
        SET review_status = ?,
            reviewer_name = COALESCE(?, reviewer_name),
            reviewer_notes = COALESCE(?, reviewer_notes),
            reviewed_at = CURRENT_TIMESTAMP
        WHERE vendor_id = ?
        """,
        (body.status, body.reviewer_name, body.notes, vendor_id),
    )
    conn.commit()

    row = conn.execute("SELECT * FROM aria_queue WHERE vendor_id = ?", (vendor_id,)).fetchone()
    d = _row_to_dict(row)
    _bool_fields(
        d,
        "is_efos_definitivo",
        "is_sfp_sanctioned",
        "in_ground_truth",
        "is_disappeared",
        "fp_patent_exception",
        "fp_data_error",
        "fp_structural_monopoly",
    )
    d["pattern_confidences"] = _decode_json_field(d.get("pattern_confidences"))
    return d


# ---------------------------------------------------------------------------
# POST /aria/queue/{vendor_id}/promote-gt
# ---------------------------------------------------------------------------

class PromoteGTRequest(BaseModel):
    case_name: Optional[str] = None
    case_type: str = "procurement_fraud"
    confidence_level: str = "medium"
    notes: Optional[str] = None
    reviewer_name: Optional[str] = None


@router.post("/queue/{vendor_id}/promote-gt")
def promote_to_ground_truth(
    vendor_id: int,
    body: PromoteGTRequest,
    conn: sqlite3.Connection = Depends(get_db_dep),
    _: None = Depends(require_admin),
):
    """Promote a confirmed ARIA lead to the ground truth corpus."""
    if not _table_exists(conn, "aria_queue"):
        raise HTTPException(status_code=404, detail="ARIA pipeline has not been run yet.")

    vendor_row = conn.execute(
        "SELECT vendor_id, vendor_name, in_ground_truth FROM aria_queue WHERE vendor_id = ?",
        (vendor_id,),
    ).fetchone()
    if vendor_row is None:
        raise HTTPException(status_code=404, detail=f"Vendor {vendor_id} not found in ARIA queue.")

    if vendor_row["in_ground_truth"]:
        raise HTTPException(status_code=409, detail="Vendor is already in ground truth.")

    vendor_name = vendor_row["vendor_name"] or f"vendor_{vendor_id}"
    case_name = body.case_name or f"ARIA-Confirmed: {vendor_name}"

    # Find next available case id
    max_id_row = conn.execute("SELECT MAX(id) FROM ground_truth_cases").fetchone()
    next_id = (max_id_row[0] or 0) + 1
    case_id_str = f"CASE-{next_id}"

    conn.execute(
        """
        INSERT INTO ground_truth_cases
            (id, case_id, case_name, case_type, confidence_level, notes, provenance_tier)
        VALUES (?, ?, ?, ?, ?, ?, 'C')
        """,
        (next_id, case_id_str, case_name, body.case_type, body.confidence_level, body.notes),
    )
    conn.execute(
        """
        INSERT INTO ground_truth_vendors
            (case_id, vendor_id, vendor_name_source, evidence_strength, match_method)
        VALUES (?, ?, ?, ?, ?)
        """,
        (next_id, vendor_id, vendor_name, body.confidence_level, "aria_confirmed"),
    )
    conn.execute(
        "UPDATE aria_queue SET in_ground_truth = 1, review_status = 'confirmed' WHERE vendor_id = ?",
        (vendor_id,),
    )
    if body.reviewer_name:
        conn.execute(
            "UPDATE aria_queue SET reviewer_name = ?, reviewed_at = CURRENT_TIMESTAMP WHERE vendor_id = ?",
            (body.reviewer_name, vendor_id),
        )
    conn.commit()
    app_cache.invalidate("aria", _STATS_CACHE_KEY)

    return {
        "vendor_id": vendor_id,
        "case_id": case_id_str,
        "case_name": case_name,
        "message": f"Vendor {vendor_id} promoted to ground truth as {case_id_str}",
    }


# ---------------------------------------------------------------------------
# GET /aria/queue/{vendor_id}/web-evidence
# ---------------------------------------------------------------------------

@router.get("/queue/{vendor_id}/web-evidence")
def get_vendor_web_evidence(
    vendor_id: int,
    conn: sqlite3.Connection = Depends(get_db_dep),
):
    """Return top web evidence articles for a vendor (CENTINELA data)."""
    if not _table_exists(conn, "aria_web_evidence"):
        return {"articles": [], "aggregate": None}

    rows = conn.execute(
        """
        SELECT query_type, verdict, MAX(confidence) as confidence, snippet,
               source_url, source_name, published_date, reasoning, MAX(created_at) as created_at
        FROM aria_web_evidence
        WHERE vendor_id = ? AND verdict != 'NEGATIVE' AND snippet IS NOT NULL
        GROUP BY snippet
        ORDER BY confidence DESC
        LIMIT 10
        """,
        (vendor_id,),
    ).fetchall()

    # Deduplicate further by normalized snippet prefix (handles minor truncation differences)
    seen_prefixes: set = set()
    articles = []
    for row in rows:
        d = _row_to_dict(row)
        prefix = (d.get("snippet") or "")[:80].lower()
        if prefix and prefix in seen_prefixes:
            continue
        seen_prefixes.add(prefix)
        articles.append(d)

    # Aggregate from aria_queue
    agg = conn.execute(
        "SELECT web_evidence_score, web_evidence_verdict, web_evidence_updated_at FROM aria_queue WHERE vendor_id = ?",
        (vendor_id,),
    ).fetchone()

    return {
        "articles": articles,
        "aggregate": _row_to_dict(agg) if agg else None,
    }


# ---------------------------------------------------------------------------
# GET /aria/stats
# ---------------------------------------------------------------------------

def _queue_tier_counts(conn: sqlite3.Connection) -> dict:
    """Live per-tier counts from aria_queue, {"1": n, …, "4": n}.

    PARALLAX D14 § 7 (H4): the funnel read `latest_run` (aria_runs, the May 3
    run: T2 1,490 / T4 241,577) while the register counts aria_queue (1,488 /
    241,579 — two rows re-tiered since). One screen, one count: the tiers
    come from the queue; latest_run stays for the dateline. Computed outside
    the persisted /stats snapshot so its shape (and the precomputed_stats row)
    is untouched.
    """
    cached = app_cache.get("aria", "queue_tier_counts")
    if cached is not None:
        return cached
    out = {"1": 0, "2": 0, "3": 0, "4": 0}
    if _table_exists(conn, "aria_queue"):
        for tier, n in conn.execute(
            "SELECT ips_tier, COUNT(*) FROM aria_queue WHERE ips_tier IS NOT NULL GROUP BY ips_tier"
        ):
            out[str(tier)] = n
    app_cache.set("aria", "queue_tier_counts", out, maxsize=4, ttl=300)
    return out


@router.get("/stats")
def get_aria_stats(conn: sqlite3.Connection = Depends(get_db_dep)):
    """Latest ARIA run summary and queue review statistics (+ live tier_counts)."""
    result = dict(_aria_stats(conn))
    result["tier_counts"] = _queue_tier_counts(conn)
    return result


def _latest_run_key(conn: sqlite3.Connection) -> Optional[tuple]:
    """(id, status, completed_at) of the newest aria_runs row; None when there is none."""
    if not _table_exists(conn, "aria_runs"):
        return None
    r = conn.execute(
        "SELECT id, status, completed_at FROM aria_runs ORDER BY started_at DESC LIMIT 1"
    ).fetchone()
    return tuple(r) if r else None


def _same_run(snapshot_run: Optional[dict], current: Optional[tuple]) -> bool:
    if current is None:
        return snapshot_run is None
    return bool(snapshot_run) and (
        snapshot_run.get("id"), snapshot_run.get("status"), snapshot_run.get("completed_at")
    ) == current


def _labels_key(conn: sqlite3.Connection) -> str:
    """Fingerprint of the public-label suppressions (label_sets, warmed at startup). A GT false-positive flag
    or a new case changes the public counts without a new ARIA run (local P1 30 vs atlas 32, 2026-11-06)."""
    import hashlib
    sup = label_sets(conn)["suppressed"]
    return hashlib.sha1(json.dumps(sorted((k, list(v)) for k, v in sup.items())).encode()).hexdigest()[:16]


def _snapshot_sane(snap: dict) -> bool:
    """No count in a stats snapshot may be negative (prod served P7 = -30 from a stale public-label set)."""
    return all(
        not (isinstance(v, (int, float)) and v < 0)
        for k in ("pattern_counts", "tier_counts")
        for v in (snap.get(k) or {}).values()
    )


def _aria_stats(conn: sqlite3.Connection) -> dict:
    cached = app_cache.get("aria", _STATS_CACHE_KEY)
    if cached is not None:
        return cached

    # Persistent fallback: read from precomputed_stats (survives container restarts).
    # Schema check: a snapshot persisted before the t1_status_counts upgrade
    # (2026-06-12) is treated as stale so the live compute self-heals it —
    # otherwise the pre-deploy row would shadow the new field forever.
    try:
        row = conn.execute(
            "SELECT stat_value FROM precomputed_stats WHERE stat_key = ?",
            (_ARIA_STATS_DB_KEY,)
        ).fetchone()
        if row and row["stat_value"]:
            persisted = json.loads(row["stat_value"])
            # A snapshot from an earlier ARIA run is stale: nothing else invalidates this row, so
            # /aria/stats served run 4febbbc7's pattern_counts after later runs rewrote aria_queue.
            if ("pattern_counts_public" in persisted and "review_status_public" in persisted
                    and _same_run(persisted.get("latest_run"), _latest_run_key(conn))
                    and persisted.get("labels_key") == _labels_key(conn)):
                if _snapshot_sane(persisted):
                    app_cache.set("aria", _STATS_CACHE_KEY, persisted, maxsize=4, ttl=300)
                    return persisted
                logger.error("aria stats snapshot has negative counts (pattern=%s tier=%s); recomputing",
                             persisted.get("pattern_counts"), persisted.get("tier_counts"))
    except Exception:
        logger.warning("aria stats snapshot unreadable; recomputing", exc_info=True)

    # Mutex: only one worker computes; others wait and re-check cache
    with _aria_stats_lock:
        cached2 = app_cache.get("aria", _STATS_CACHE_KEY)
        if cached2 is not None:
            return cached2

    latest_run = None
    if _table_exists(conn, "aria_runs"):
        run_row = conn.execute(
            """
            SELECT id, started_at, completed_at, status, vendors_processed,
                   tier1_count, tier2_count, tier3_count, tier4_count,
                   gt_auto_inserts, gt_flags, error_message, aria_version
            FROM aria_runs
            ORDER BY started_at DESC
            LIMIT 1
            """
        ).fetchone()
        if run_row:
            latest_run = _row_to_dict(run_row)

    review_stats = {"pending": 0, "confirmed": 0, "dismissed": 0, "reviewing": 0}
    queue_total = 0
    new_vendor_count = 0
    reviewed_count = 0
    confirmed_count = 0
    dismissed_count = 0
    t1_reviewed_count = 0
    pattern_counts: dict = {}
    external_counts: dict = {"efos": 0, "sfp": 0}
    elevated_value = 0.0
    t1_status_counts: dict = {}

    if _table_exists(conn, "aria_queue"):
        # Single consolidated aggregation — replaces 10 sequential full-table scans
        try:
            agg = conn.execute(
                """
                SELECT
                    COUNT(*) AS total,
                    SUM(CASE WHEN new_vendor_risk = 1 THEN 1 ELSE 0 END) AS new_vendor_count,
                    SUM(CASE WHEN review_status NOT IN ('pending') AND review_status IS NOT NULL
                             THEN 1 ELSE 0 END) AS reviewed_count,
                    SUM(CASE WHEN review_status = 'pending' OR review_status IS NULL
                             THEN 1 ELSE 0 END) AS pending_count,
                    SUM(CASE WHEN review_status = 'confirmed' THEN 1 ELSE 0 END) AS confirmed_count,
                    SUM(CASE WHEN review_status = 'dismissed' THEN 1 ELSE 0 END) AS dismissed_count,
                    SUM(CASE WHEN review_status = 'reviewing' THEN 1 ELSE 0 END) AS reviewing_count,
                    SUM(CASE WHEN ips_tier = 1
                             AND review_status NOT IN ('pending') AND review_status IS NOT NULL
                             THEN 1 ELSE 0 END) AS t1_reviewed_count,
                    SUM(CASE WHEN is_efos_definitivo = 1 THEN 1 ELSE 0 END) AS efos_count,
                    SUM(CASE WHEN is_sfp_sanctioned = 1 THEN 1 ELSE 0 END) AS sfp_count,
                    SUM(CASE WHEN ips_tier IN (1, 2) THEN COALESCE(total_value_mxn, 0) ELSE 0 END)
                        AS elevated_value
                FROM aria_queue
                """
            ).fetchone()
            if agg:
                queue_total = agg["total"] or 0
                new_vendor_count = agg["new_vendor_count"] or 0
                reviewed_count = agg["reviewed_count"] or 0
                # Reviewer "confirmed" is public only for documented vendors (public_labels).
                documented = label_sets(conn)["documented"]
                confirmed_count = sum(
                    1 for (vid,) in conn.execute(
                        "SELECT vendor_id FROM aria_queue WHERE review_status = 'confirmed'"
                    ) if vid in documented
                )
                dismissed_count = agg["dismissed_count"] or 0
                t1_reviewed_count = agg["t1_reviewed_count"] or 0
                elevated_value = float(agg["elevated_value"] or 0)
                review_stats = {
                    "pending": agg["pending_count"] or 0,
                    "confirmed": confirmed_count,
                    "dismissed": dismissed_count,
                    "reviewing": agg["reviewing_count"] or 0,
                }
                external_counts = {
                    "efos": agg["efos_count"] or 0,
                    "sfp": agg["sfp_count"] or 0,
                }
        except sqlite3.Error:
            # Never serve (or cache/persist) zero counts for a failed scan.
            logger.exception("aria_stats query failed")
            raise HTTPException(status_code=503, detail="ARIA statistics temporarily unavailable")

        # Pattern breakdown — separate GROUP BY, still one query
        try:
            pattern_rows = conn.execute(
                """
                SELECT primary_pattern, COUNT(*) AS cnt
                FROM aria_queue
                WHERE primary_pattern IS NOT NULL
                GROUP BY primary_pattern
                ORDER BY cnt DESC
                """
            ).fetchall()
            for pr in pattern_rows:
                if pr["primary_pattern"]:
                    pattern_counts[pr["primary_pattern"]] = pr["cnt"]
        except sqlite3.Error:
            # Never serve (or cache/persist) zero counts for a failed scan.
            logger.exception("aria_stats query failed")
            raise HTTPException(status_code=503, detail="ARIA statistics temporarily unavailable")

        # T1 per-status disposition counts — raw statuses, frontend buckets them.
        # t1_reviewed_count is useless for progress UI (any non-pending status
        # counts, so it reads 299/299 while 83 rows are needs_review); this
        # GROUP BY over the 299 T1 rows (idx_aria_queue_tier_score) is ~0ms.
        try:
            t1_status_counts = public_status_counts(conn, conn.execute(
                "SELECT vendor_id, COALESCE(review_status, 'pending') FROM aria_queue WHERE ips_tier = 1"
            ).fetchall())
        except sqlite3.Error:
            # Never serve (or cache/persist) zero counts for a failed scan.
            logger.exception("aria_stats query failed")
            raise HTTPException(status_code=503, detail="ARIA statistics temporarily unavailable")

    result = {
        "latest_run": latest_run,
        "review_stats": review_stats,
        "queue_total": queue_total,
        "new_vendor_count": new_vendor_count,
        "pattern_counts": public_pattern_counts(conn, pattern_counts),
        # the suppressions those counts subtract: a GT edit between runs invalidates the snapshot
        "labels_key": _labels_key(conn),
        # marker: snapshot predates public_labels § B4 when absent → recompute
        "pattern_counts_public": True,
        # marker: snapshot predates public review_status (round 8) when absent → recompute
        "review_status_public": True,
        "external_counts": external_counts,
        "elevated_value_mxn": elevated_value,
        "reviewed_count": reviewed_count,
        "confirmed_count": confirmed_count,
        "dismissed_count": dismissed_count,
        "t1_reviewed_count": t1_reviewed_count,
        "t1_status_counts": t1_status_counts,
    }
    app_cache.set("aria", _STATS_CACHE_KEY, result, maxsize=4, ttl=300)

    # Persist to precomputed_stats so container restarts skip the live scan
    try:
        with get_write_db() as wconn:
            wconn.execute(
                "INSERT OR REPLACE INTO precomputed_stats(stat_key, stat_value, updated_at)"
                " VALUES(?, ?, datetime('now'))",
                (_ARIA_STATS_DB_KEY, json.dumps(result, default=str))
            )
            wconn.commit()
    except Exception as e:
        logger.warning("aria_stats persist failed: %s", e)

    return result


# ---------------------------------------------------------------------------
# GET /aria/patterns/{code}/institutions
# ---------------------------------------------------------------------------

_PATTERN_GROUP_CACHE = "aria_pattern_groups"

#: ARIA's seven pattern codes and their names, matching the typology the
#: frontend prints. A code outside this map is a 404, not an empty result —
#: a figure that silently draws nothing for a typo is worse than one that says
#: the pattern does not exist.
_PATTERN_LABELS = PATTERN_LABELS

#: group → (key column, label column). Both are fixed identifiers chosen by a
#: validated enum, never interpolated from raw input.
_GROUP_COLUMNS: dict[str, tuple[str, str]] = {
    "institution": ("top_institution", "top_institution"),
    "sector": ("primary_sector_id", "primary_sector_name"),
}


def _resolve_institution_ids(
    conn: sqlite3.Connection, siglas: list[str]
) -> dict[str, dict]:
    """
    Map each `aria_queue.top_institution` acronym to a real institution row.

    `top_institution` is a siglas string, not a foreign key, and several
    registrations can share one acronym — PEMEX alone has three (corporate
    1201, Refinación 314, Exploración 311), so the queue's "PEMEX" collapses
    all of them. The busiest registration is the one an entity chip should
    open; the caller says so in its annotation rather than pretending the
    acronym resolved cleanly.
    """
    if not siglas:
        return {}
    placeholders = ",".join("?" for _ in siglas)
    # a buyer without an acronym rides its name in top_institution (202 of the fila's 407: LICONSA,
    # SAE, CAPUFE…), cut at 50 characters by the pipeline: match the name's first 50 too, same rule
    rows = conn.execute(
        f"""
        SELECT siglas, substr(name, 1, 50) AS key2, id, name, COALESCE(total_contracts, 0) AS total_contracts
        FROM institutions
        WHERE siglas IN ({placeholders}) OR substr(name, 1, 50) IN ({placeholders})
        ORDER BY COALESCE(total_contracts, 0) DESC
        """,
        [*siglas, *siglas],
    ).fetchall()
    best: dict[str, dict] = {}
    wanted = set(siglas)
    for r in rows:
        # Ordered by contracts desc, so the first row for an acronym (or name) wins.
        for key in (r["siglas"], r["key2"]):
            if key in wanted:
                best.setdefault(key, {"institution_id": r["id"], "institution_name": r["name"]})
    return best


def _pattern_top_vendors(
    conn: sqlite3.Connection, code: str, key_col: str, keys: list, per_row: int
) -> dict:
    """
    The `per_row` largest vendors in each returned group, in ONE scan.

    Twelve `ORDER BY … LIMIT n` queries would be twelve passes over a 248K-row
    table; a single ROW_NUMBER() partition is one. SQLite has had window
    functions since 3.25 and this build runs 3.45.
    """
    if not keys or per_row <= 0:
        return {}
    placeholders = ",".join("?" for _ in keys)
    rows = conn.execute(
        f"""
        SELECT gkey, vendor_id, vendor_name, total_value_mxn, total_contracts,
               top_institution_ratio, ips_tier, in_ground_truth, avg_risk_score,
               COALESCE(review_status, 'pending') AS review_status
        FROM (
            SELECT {key_col} AS gkey, vendor_id, vendor_name, total_value_mxn,
                   total_contracts, top_institution_ratio, ips_tier,
                   in_ground_truth, avg_risk_score, review_status,
                   ROW_NUMBER() OVER (
                       PARTITION BY {key_col} ORDER BY total_value_mxn DESC
                   ) AS rn
            FROM aria_queue
            WHERE primary_pattern = ? AND {key_col} IN ({placeholders})
              AND {NOT_SUPPRESSED_SQL}
        )
        WHERE rn <= ?
        ORDER BY gkey, total_value_mxn DESC
        """,
        [code, *keys, suppressed_ids_json(conn), per_row],
    ).fetchall()
    out: dict = {}
    for r in rows:
        d = _row_to_dict(r)
        gkey = d.pop("gkey")
        _bool_fields(d, "in_ground_truth")
        apply_public_labels(conn, [d])
        out.setdefault(gkey, []).append(d)
    return out


@router.get("/patterns/{code}/institutions")
def get_pattern_institutions(
    code: str,
    limit: int = Query(12, ge=1, le=50, description="Groups to return, by value desc"),
    group: str = Query(
        "institution",
        description="Group the pattern's vendors by their top institution or their primary sector",
    ),
    vendors: int = Query(
        0, ge=0, le=10, description="Largest vendors to inline per group (0 = none)"
    ),
    conn: sqlite3.Connection = Depends(get_db_dep),
):
    """
    Where one ARIA pattern concentrates: its vendors grouped by the institution
    they contract with most, or by their primary sector.

    Read the direction carefully. `aria_queue.top_institution` is the buyer a
    flagged VENDOR sends most of its own contracting to, so a row's
    `total_value_mxn` is the lifetime federal contracting of the vendors
    anchored at that buyer — NOT the share of that buyer's budget that is
    captured. `flagged_value_mxn` gives the honest denominator for a share:
    everything ARIA flags, under any pattern, in the same group.
    """
    code = (code or "").upper()
    if code not in _PATTERN_LABELS:
        raise HTTPException(status_code=404, detail=f"Unknown ARIA pattern '{code}'")
    if group not in _GROUP_COLUMNS:
        raise HTTPException(
            status_code=400, detail="group must be 'institution' or 'sector'"
        )

    label_en, label_es = _PATTERN_LABELS[code]
    cache_key = f"{code}:{group}:{limit}:{vendors}"
    cached = app_cache.get(_PATTERN_GROUP_CACHE, cache_key)
    if cached is not None:
        return cached

    empty = {
        "code": code,
        "label_en": label_en,
        "label_es": label_es,
        "group": group,
        "cohort": None,
        "rows": [],
    }
    if not _table_exists(conn, "aria_queue"):
        return {**empty, "message": "ARIA pipeline has not been run yet."}

    key_col, label_col = _GROUP_COLUMNS[group]

    cohort_row = conn.execute(
        f"""
        SELECT COUNT(*) AS total_vendors,
               COALESCE(SUM(total_value_mxn), 0) AS total_value_mxn,
               SUM(CASE WHEN in_ground_truth = 1 THEN 1 ELSE 0 END) AS in_ground_truth,
               SUM(CASE WHEN review_status IS NOT NULL AND review_status <> 'pending'
                        THEN 1 ELSE 0 END) AS reviewed,
               SUM(CASE WHEN review_status = 'confirmed' THEN 1 ELSE 0 END) AS confirmed,
               SUM(CASE WHEN ips_tier = 1 THEN 1 ELSE 0 END) AS tier1,
               SUM(CASE WHEN ips_tier = 2 THEN 1 ELSE 0 END) AS tier2,
               SUM(CASE WHEN ips_tier = 3 THEN 1 ELSE 0 END) AS tier3,
               SUM(CASE WHEN ips_tier = 4 THEN 1 ELSE 0 END) AS tier4
        FROM aria_queue
        WHERE primary_pattern = ? AND {NOT_SUPPRESSED_SQL}
        """,
        (code, suppressed_ids_json(conn)),
    ).fetchone()
    cohort = _row_to_dict(cohort_row) if cohort_row else {}
    if cohort.get("confirmed"):
        # Reviewer "confirmed" is public only for documented vendors (public_labels).
        documented = label_sets(conn)["documented"]
        cohort["confirmed"] = sum(
            1 for (vid,) in conn.execute(
                "SELECT vendor_id FROM aria_queue WHERE primary_pattern = ? AND review_status = 'confirmed'",
                (code,),
            ) if vid in documented
        )
    if not cohort.get("total_vendors"):
        return {**empty, "cohort": cohort or None}

    # One pass: the pattern's own count and value per group, alongside the
    # all-patterns flagged totals that make a share statement checkable.
    group_rows = conn.execute(
        f"""
        SELECT {key_col} AS gkey,
               {label_col} AS glabel,
               SUM(CASE WHEN primary_pattern = ? THEN 1 ELSE 0 END) AS vendor_count,
               COALESCE(SUM(CASE WHEN primary_pattern = ? THEN total_value_mxn ELSE 0 END), 0)
                   AS total_value_mxn,
               COUNT(*) AS flagged_vendor_count,
               COALESCE(SUM(total_value_mxn), 0) AS flagged_value_mxn
        FROM aria_queue
        WHERE primary_pattern IS NOT NULL AND {key_col} IS NOT NULL
          AND {NOT_SUPPRESSED_SQL}
        GROUP BY {key_col}, {label_col}
        HAVING vendor_count > 0
        ORDER BY total_value_mxn DESC
        LIMIT ?
        """,
        (code, code, suppressed_ids_json(conn), limit),
    ).fetchall()

    rows = [_row_to_dict(r) for r in group_rows]
    keys = [r["gkey"] for r in rows]

    if group == "institution":
        resolved = _resolve_institution_ids(conn, [str(k) for k in keys])
        for r in rows:
            match = resolved.get(str(r["gkey"]), {})
            r["institution_id"] = match.get("institution_id")
            r["institution_name"] = match.get("institution_name")
            r["sector_id"] = None
    else:
        for r in rows:
            r["institution_id"] = None
            r["institution_name"] = None
            r["sector_id"] = int(r["gkey"]) if r["gkey"] is not None else None

    # Attach by the ORIGINAL key value, before stringifying it for the wire —
    # a sector's partition key is an integer and would not match "3".
    by_key = _pattern_top_vendors(conn, code, key_col, keys, vendors)
    for r, k in zip(rows, keys):
        r["vendors"] = by_key.get(k, [])
        r["key"] = str(k)
        r["label"] = str(r["glabel"]) if r["glabel"] is not None else str(k)
        r.pop("gkey", None)
        r.pop("glabel", None)

    result = {
        "code": code,
        "label_en": label_en,
        "label_es": label_es,
        "group": group,
        "cohort": cohort,
        "rows": rows,
    }
    app_cache.set(_PATTERN_GROUP_CACHE, cache_key, result, maxsize=32, ttl=600)
    return result


# ---------------------------------------------------------------------------
# GET /aria/gt-updates
# ---------------------------------------------------------------------------

@router.get("/gt-updates")
def get_gt_updates(
    status: Optional[str] = Query(None),
    source: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=100),
    conn: sqlite3.Connection = Depends(get_db_dep),
):
    """Paginated list of ARIA ground truth update proposals."""
    empty_pagination = {
        "page": page,
        "per_page": per_page,
        "total": 0,
        "total_pages": 0,
    }

    if not _table_exists(conn, "aria_gt_updates"):
        return {
            "data": [],
            "pagination": empty_pagination,
        }

    conditions = []
    params: list = []

    if status is not None:
        conditions.append("review_status = ?")
        params.append(status)
    if source is not None:
        conditions.append("source = ?")
        params.append(source)

    where_sql = ("WHERE " + " AND ".join(conditions)) if conditions else ""

    total = conn.execute(
        f"SELECT COUNT(*) FROM aria_gt_updates {where_sql}", params
    ).fetchone()[0]

    total_pages = math.ceil(total / per_page) if total > 0 else 0
    offset = (page - 1) * per_page

    rows = conn.execute(
        f"""
        SELECT id, vendor_id, vendor_name, action, confidence_level,
               match_confidence, source, evidence_detail, review_status,
               reviewed_by, review_notes, aria_run_id, created_at
        FROM aria_gt_updates
        {where_sql}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
        """,
        params + [per_page, offset],
    ).fetchall()

    data = []
    for row in rows:
        d = _row_to_dict(row)
        d["evidence_detail"] = _decode_json_field(d.get("evidence_detail"))
        data.append(d)

    return {
        "data": data,
        "pagination": {
            "page": page,
            "per_page": per_page,
            "total": total,
            "total_pages": total_pages,
        },
    }


# ---------------------------------------------------------------------------
# PATCH /aria/gt-updates/{id}/review
# ---------------------------------------------------------------------------

class GTUpdateReview(BaseModel):
    status: str  # approved / rejected
    reviewer_name: Optional[str] = None
    review_notes: Optional[str] = None


@router.patch("/gt-updates/{update_id}/review")
def patch_gt_update_review(
    update_id: int,
    body: GTUpdateReview,
    conn: sqlite3.Connection = Depends(get_db_dep),
    _: None = Depends(require_admin),
):
    """Approve or reject an ARIA ground truth update proposal."""
    if body.status not in _VALID_GT_REVIEW_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status '{body.status}'. Must be one of: {sorted(_VALID_GT_REVIEW_STATUSES)}",
        )

    if not _table_exists(conn, "aria_gt_updates"):
        raise HTTPException(status_code=404, detail="ARIA pipeline has not been run yet.")

    existing = conn.execute(
        "SELECT id FROM aria_gt_updates WHERE id = ?", (update_id,)
    ).fetchone()
    if existing is None:
        raise HTTPException(status_code=404, detail=f"GT update {update_id} not found.")

    conn.execute(
        """
        UPDATE aria_gt_updates
        SET review_status = ?,
            reviewed_by = COALESCE(?, reviewed_by),
            review_notes = COALESCE(?, review_notes)
        WHERE id = ?
        """,
        (body.status, body.reviewer_name, body.review_notes, update_id),
    )
    conn.commit()

    row = conn.execute("SELECT * FROM aria_gt_updates WHERE id = ?", (update_id,)).fetchone()
    d = _row_to_dict(row)
    d["evidence_detail"] = _decode_json_field(d.get("evidence_detail"))
    return d


# ---------------------------------------------------------------------------
# POST /aria/run
# ---------------------------------------------------------------------------

class RunRequest(BaseModel):
    dry_run: bool = False
    limit: Optional[int] = None
    generate_memos: bool = True
    memo_tier1_limit: int = 20
    memo_tier2_limit: int = 30


def _run_subprocess(cmd: list, cwd: str) -> subprocess.CompletedProcess:
    """Run a subprocess and return its result."""
    return subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=3600)


def _launch_full_pipeline(
    pipeline_cmd: list,
    cwd: str,
    generate_memos: bool,
    memo_tier1_limit: int,
    memo_tier2_limit: int,
) -> None:
    """Background task: run ARIA pipeline, then optionally generate memos for T1/T2."""
    global _run_status
    with _run_lock:
        _run_status = {
            "running": True,
            "phase": "pipeline",
            "started_at": datetime.now(timezone.utc).isoformat(),
            "completed_at": None,
            "error": None,
        }

    try:
        # Phase 1: ARIA pipeline
        result = _run_subprocess(pipeline_cmd, cwd)
        if result.returncode != 0:
            stderr_tail = (result.stderr or "")[-500:]
            logger.error("aria_pipeline_failed rc=%d: %s", result.returncode, stderr_tail)
            with _run_lock:
                _run_status["error"] = f"Pipeline failed (rc={result.returncode})"
                _run_status["running"] = False
                _run_status["completed_at"] = datetime.now(timezone.utc).isoformat()
            return

        # Phase 2: Generate memos for Tier 1
        if generate_memos:
            with _run_lock:
                _run_status["phase"] = "memos_tier1"

            memo_cmd_t1 = [
                sys.executable, "-m", "scripts.aria_generate_memos",
                "--tier", "1", "--limit", str(memo_tier1_limit),
            ]
            result_t1 = _run_subprocess(memo_cmd_t1, cwd)
            if result_t1.returncode != 0:
                stderr_tail = (result_t1.stderr or "")[-500:]
                logger.warning("aria_memos_tier1_failed rc=%d: %s", result_t1.returncode, stderr_tail)

            # Phase 3: Generate memos for Tier 2
            with _run_lock:
                _run_status["phase"] = "memos_tier2"

            memo_cmd_t2 = [
                sys.executable, "-m", "scripts.aria_generate_memos",
                "--tier", "2", "--limit", str(memo_tier2_limit),
            ]
            result_t2 = _run_subprocess(memo_cmd_t2, cwd)
            if result_t2.returncode != 0:
                stderr_tail = (result_t2.stderr or "")[-500:]
                logger.warning("aria_memos_tier2_failed rc=%d: %s", result_t2.returncode, stderr_tail)

    except subprocess.TimeoutExpired:
        logger.error("aria_pipeline_timeout after 3600s")
        with _run_lock:
            _run_status["error"] = "Pipeline timed out after 3600s"
    except Exception as exc:
        logger.error("aria_pipeline_subprocess_failed: %s", str(exc))
        with _run_lock:
            _run_status["error"] = "Pipeline failed; see server logs"
    finally:
        with _run_lock:
            _run_status["running"] = False
            _run_status["phase"] = None
            _run_status["completed_at"] = datetime.now(timezone.utc).isoformat()
        app_cache.invalidate("aria", _STATS_CACHE_KEY)  # invalidate after run


@router.post("/run", status_code=202)
def trigger_aria_run(
    request: RunRequest,
    background_tasks: BackgroundTasks,
    conn: sqlite3.Connection = Depends(get_db_dep),
    _: None = Depends(require_admin),
):
    """Launch the ARIA pipeline + memo generation as a background subprocess."""
    # Check DB-level run lock
    if _table_exists(conn, "aria_runs"):
        running = conn.execute(
            "SELECT id FROM aria_runs WHERE status = 'running' ORDER BY started_at DESC LIMIT 1"
        ).fetchone()
        if running:
            raise HTTPException(
                status_code=409,
                detail=f"Run {running['id']} is already in progress.",
            )

    # Check in-memory run lock
    with _run_lock:
        if _run_status["running"]:
            raise HTTPException(
                status_code=409,
                detail="A pipeline run is already in progress.",
            )

    run_id = str(uuid.uuid4())[:8]

    cmd = [sys.executable, "-m", "scripts.aria_pipeline"]
    if request.dry_run:
        cmd.append("--dry-run")
    if request.limit is not None:
        cmd.extend(["--limit", str(request.limit)])

    backend_dir = str(Path(__file__).parent.parent.parent)
    background_tasks.add_task(
        _launch_full_pipeline,
        cmd,
        backend_dir,
        request.generate_memos and not request.dry_run,
        request.memo_tier1_limit,
        request.memo_tier2_limit,
    )

    return {
        "run_id": run_id,
        "status": "queued",
        "message": "ARIA pipeline started in background. Memos will generate after pipeline completes.",
    }


# ---------------------------------------------------------------------------
# GET /aria/run-status
# ---------------------------------------------------------------------------

@router.get("/run-status")
def get_aria_run_status():
    """Check if an ARIA pipeline run is currently in progress."""
    with _run_lock:
        return dict(_run_status)


# ---------------------------------------------------------------------------
# GET /aria/memos/{vendor_id}
# ---------------------------------------------------------------------------

class AriaMemoResponse(BaseModel):
    vendor_id: int
    vendor_name: Optional[str] = None
    memo_text: str
    memo_type: Optional[str] = None
    generated_by: Optional[str] = None
    created_at: Optional[str] = None
    case_id: Optional[str] = None


class AriaMemoListItem(BaseModel):
    vendor_id: int
    vendor_name: Optional[str] = None
    memo_type: Optional[str] = None
    generated_by: Optional[str] = None
    created_at: Optional[str] = None
    case_id: Optional[str] = None
    memo_text: str
    ips_tier: Optional[int] = None


class AriaMemoListResponse(BaseModel):
    data: list
    pagination: dict


@router.get("/memos/{vendor_id}", response_model=Optional[AriaMemoResponse])
def get_aria_memo(
    vendor_id: int,
    conn: sqlite3.Connection = Depends(get_db_dep),
):
    """Get the ARIA investigation memo for a specific vendor.

    Reads from aria_memos table (canonical, 22 hand-curated rows) and
    falls back to aria_queue.memo_text (1,843 auto-generated dossiers)
    when the canonical table doesn't have a row. The fallback unlocks
    the broader memo corpus per docs/DATA_INTEGRITY_PLAN.md task S.3.

    Provenance metadata (memo_provenance / memo_status from S.3
    classification) is included so the frontend can demote templated
    memos with the disclaimer banner.
    """
    # First try the curated aria_memos table
    if _table_exists(conn, "aria_memos"):
        row = conn.execute(
            f"""
            SELECT m.vendor_id, m.memo_text, m.memo_type, m.generated_by,
                   m.created_at, m.case_id,
                   COALESCE(q.vendor_name, v.name) AS vendor_name
            FROM aria_memos m
            LEFT JOIN aria_queue q ON m.vendor_id = q.vendor_id
            LEFT JOIN vendors v ON m.vendor_id = v.id
            WHERE m.vendor_id = ? AND {_memo_visible_sql(conn, 'm')}
            ORDER BY m.created_at DESC
            LIMIT 1
            """,
            (vendor_id,),
        ).fetchone()
        if row is not None:
            return AriaMemoResponse(**_row_to_dict(row))

    # Fallback to aria_queue.memo_text — the 1,843-row auto-generated corpus.
    # Read provenance/status if S.3 classification has run.
    fallback = conn.execute(
        f"""
        SELECT q.vendor_id,
               q.vendor_name,
               q.memo_text,
               q.memo_provenance AS memo_type,
               'aria_pipeline' AS generated_by,
               q.memo_generated_at AS created_at,
               NULL AS case_id
        FROM aria_queue q
        WHERE q.vendor_id = ? AND q.memo_text IS NOT NULL AND {_memo_visible_sql(conn, 'q')}
        LIMIT 1
        """,
        (vendor_id,),
    ).fetchone()

    # No memo is an expected state: 200 null, not 404 — every dossier logged a console error (launch audit 2026-10-28 S2).
    if fallback is None:
        return None

    return AriaMemoResponse(**_row_to_dict(fallback))


@router.get("/memos", response_model=AriaMemoListResponse)
def list_aria_memos(
    tier: Optional[int] = Query(None, ge=1, le=2, description="Filter by ARIA tier (1 or 2)"),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    conn: sqlite3.Connection = Depends(get_db_dep),
):
    """List ARIA investigation memos with pagination, optionally filtered by tier."""
    if not _table_exists(conn, "aria_memos"):
        return AriaMemoListResponse(
            data=[],
            pagination={"limit": limit, "offset": offset, "total": 0},
        )

    conditions = []
    params: list = []

    if tier is not None:
        if not _table_exists(conn, "aria_queue"):
            return AriaMemoListResponse(
                data=[],
                pagination={"limit": limit, "offset": offset, "total": 0},
            )
        conditions.append("q.ips_tier = ?")
        params.append(tier)

    conditions.append(_memo_visible_sql(conn, "m"))
    where_sql = ("WHERE " + " AND ".join(conditions)) if conditions else ""

    # Join with aria_queue for tier info and vendor name
    join_sql = "LEFT JOIN aria_queue q ON m.vendor_id = q.vendor_id"
    vendor_join = "LEFT JOIN vendors v ON m.vendor_id = v.id"

    total = conn.execute(
        f"SELECT COUNT(*) FROM aria_memos m {join_sql} {where_sql}",
        params,
    ).fetchone()[0]

    rows = conn.execute(
        f"""
        SELECT m.vendor_id, m.memo_text, m.memo_type, m.generated_by,
               m.created_at, m.case_id,
               COALESCE(q.vendor_name, v.name) AS vendor_name,
               q.ips_tier
        FROM aria_memos m
        {join_sql}
        {vendor_join}
        {where_sql}
        ORDER BY m.created_at DESC
        LIMIT ? OFFSET ?
        """,
        params + [limit, offset],
    ).fetchall()

    data = [_row_to_dict(r) for r in rows]

    return AriaMemoListResponse(
        data=data,
        pagination={"limit": limit, "offset": offset, "total": total},
    )


# ---------------------------------------------------------------------------
# GET /aria/ghost-suspects
# Ranked investigation queue from ghost_confidence_scores table.
# ---------------------------------------------------------------------------

@router.get("/ghost-suspects")
def get_ghost_suspects(
    tier: Optional[str] = Query(None, description="confirmed | multi_signal | behavioral"),
    min_signals: int = Query(0, ge=0),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    conn: sqlite3.Connection = Depends(get_db_dep),
):
    """Ghost company confidence queue for ARIA P2 vendors.

    Returns vendors ranked by ghost_confidence_score DESC with tier breakdown.
    Signals are independent — each adds evidence without double-counting.
    """
    # Check table exists
    exists = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='ghost_confidence_scores'"
    ).fetchone()
    if not exists:
        raise HTTPException(
            status_code=503,
            detail="Ghost confidence scores not yet computed. Run: python -m scripts.compute_ghost_confidence",
        )

    # Personas físicas, public entities and GT false positives never appear
    # on a "ghost company" list (public_labels § B4).
    suppressed = suppressed_ids_json(conn)
    conditions = [NOT_SUPPRESSED_SQL]
    params: list = [suppressed]
    if tier:
        conditions.append("ghost_confidence_tier = ?")
        params.append(tier)
    if min_signals > 0:
        conditions.append("ghost_signal_count >= ?")
        params.append(min_signals)

    where = " AND ".join(conditions)

    total = conn.execute(
        f"SELECT COUNT(*) FROM ghost_confidence_scores WHERE {where}", params
    ).fetchone()[0]

    offset = (page - 1) * per_page
    rows = conn.execute(
        f"""
        SELECT
            vendor_id, vendor_name,
            ghost_signal_count, ghost_confidence_score, ghost_confidence_tier,
            sig_efos_definitivo, sig_efos_soft, sig_sfp_sanctioned,
            sig_disappeared, sig_p7_intersection, sig_invalid_rfc,
            sig_young_company, sig_high_risk, sig_ultra_micro,
            sig_short_lived, sig_temporal_burst,
            total_contracts, total_value_mxn, years_active,
            avg_risk_score, primary_sector_name, top_institution,
            shell_flags, efos_stage
        FROM ghost_confidence_scores
        WHERE {where}
        ORDER BY ghost_confidence_score DESC, ghost_signal_count DESC
        LIMIT ? OFFSET ?
        """,
        params + [per_page, offset],
    ).fetchall()

    data = []
    for r in rows:
        d = _row_to_dict(r)
        # Parse shell_flags JSON if present
        if d.get("shell_flags"):
            try:
                d["shell_flags"] = json.loads(d["shell_flags"])
            except (json.JSONDecodeError, TypeError):
                d["shell_flags"] = []
        else:
            d["shell_flags"] = []
        data.append(d)

    # Tier summary stats
    tier_counts = {}
    for t in ("confirmed", "multi_signal", "behavioral"):
        n = conn.execute(
            f"SELECT COUNT(*) FROM ghost_confidence_scores WHERE ghost_confidence_tier = ? AND {NOT_SUPPRESSED_SQL}",
            (t, suppressed),
        ).fetchone()[0]
        tier_counts[t] = n

    return {
        "data": data,
        "tier_summary": tier_counts,
        "pagination": {
            "page": page,
            "per_page": per_page,
            "total": total,
            "total_pages": math.ceil(total / per_page),
        },
    }
