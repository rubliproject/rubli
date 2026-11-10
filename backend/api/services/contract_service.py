"""
Contract domain service — extracted from contracts.py router.

Handles contract listing, detail, statistics, and risk breakdown queries.
Router becomes thin: parse request → call service → return response.
"""
from __future__ import annotations

import math
import sqlite3
import time
from typing import Any

import structlog

from ..pii import public_rfc
from ..public_labels import is_persona_fisica
from ..config.constants import COLUMN_ROWS_SQL, RISK_THRESHOLDS_V6
from .active_model import (
    _ACTIVE_GLOBAL_SQL, V9_SELECT, V10_MODELS, load_active_feature_transforms, normalize_coefficients,
    v9_terms, v10_display_name, v10_means, v10_population_means, v10_scores,
)
from .base_service import BaseService
from .query_builder import QueryBuilder
from .pagination import paginate_query, PaginatedResult
from ..config.constants import DATA_LAST_YEAR

logger = structlog.get_logger("rubli.services.contract")

# Sort field whitelist for contract listing
CONTRACT_SORT_WHITELIST = {
    "contract_date": "c.contract_date",
    "amount_mxn": "c.amount_mxn",
    "risk_score": "c.risk_score",
    "contract_year": "c.contract_year",
    "id": "c.id",
    "title": "c.title",
    "vendor_name": "vendor_name",
    "institution_name": "institution_name",
    "sector_id": "c.sector_id",
    "risk_level": "c.risk_level",
    "mahalanobis_distance": "c.mahalanobis_distance",
    "ensemble_anomaly": "c.ensemble_anomaly_score",
    "publication_delay": "c.publication_delay_days",
}

# Map known risk_factor values to indexed boolean columns (avoid full-table LIKE).
# Shared by list_contracts and highlights so the two stay in lockstep.
_RISK_FACTOR_COLUMN_MAP = {
    "direct_award": ("c.is_direct_award = ?", 1),
    "single_bid": ("c.is_single_bid = ?", 1),
    "year_end": ("c.is_year_end = ?", 1),
    # "price_hyp" has no column — falls through to the LIKE path (token in
    # the risk_factors TEXT). Mirrored in export.py.
}

# "Los Señalados" band — the top-risk pass only features genuinely flagged
# contracts (risk_score ≥ 0.40 = high + critical, RISK_THRESHOLDS.high). The
# float floor lets the unfiltered + risk-based cases ride idx_c_risk_score
# directly (a range scan in risk order); filtered cases fall back to the
# sector/risk composite indexes or the budget guard below.
_BAND_RISK_FLOOR = 0.40
# Hard wall-clock budget (seconds) for the band's top-risk pass. A few rare
# high-cardinality filters (e.g. is_direct_award alone) have no index that
# avoids a large risk-sort; rather than let the async band hang, abort and
# degrade to the documented-case pass (always served from memory).
_BAND_TOP_BUDGET_S = 1.5

# Documented-case seal — evidence gate. A contract is sealed ONLY when it is in
# a STRONG-evidence ground-truth row (audit-attested / confirmed / high / direct)
# AND that case is a published (is_verified=1) procurement scandal (so the seal always
# resolves to a /cases/:slug page). Weak GT (the ~346K "medium" /
# L3_portfolio_swept vendor→all-contracts propagation flagged in the v0.9
# label-quality audit) gets NO seal — ~374 rows total. The seal is stamped from
# a memoized id→scandal map in _map_contract_row (an O(1) dict lookup), NOT a
# per-row SQL subquery, so the list projection stays cheap.
_DOCUMENTED_SEAL_QUERY = """
    SELECT gtc.contract_id, ps.slug, ps.name_es, ps.name_en
      FROM ground_truth_contracts gtc
      JOIN procurement_scandals ps ON ps.ground_truth_case_id = gtc.case_id
                                  AND ps.is_verified = 1
     WHERE gtc.evidence_tier = 'L1_audit_attested'
        OR gtc.evidence_strength IN ('confirmed_corrupt', 'high', 'direct')
     ORDER BY CASE WHEN gtc.evidence_tier = 'L1_audit_attested' THEN 0 ELSE 1 END,
              ps.severity DESC
"""

# Shared SELECT projection for list + highlights (identical row shape).
_LIST_COLUMNS = """
            c.id, c.contract_number, c.title, c.amount_mxn,
            c.contract_date, c.contract_year, c.sector_id,
            s.name_es as sector_name,
            c.risk_score, c.risk_level, c.is_direct_award, c.is_single_bid,
            v.name as vendor_name, v.rfc as vendor_rfc, v.is_individual as vendor_is_individual,
            i.name as institution_name,
            c.procedure_type, c.mahalanobis_distance,
            c.vendor_id, c.institution_id, c.risk_factors,
            c.risk_model_version, c.source_structure
"""


# The Archivo row's board columns (DESIGN.md §7 «Contratos recientes»): buyer siglas, procedure glyph,
# spending category («Qué se compró») and its subcategory. Read per page by PK (≤ 50 ids), never on
# the COUNT; a missing table (older schema) leaves the fields null and is logged.
_ROW_LABELS_SQL = """
    SELECT c.id, i.siglas, c.procedure_type_normalized,
           cat.id, cat.name_es, cat.name_en, sd.name_es, sd.name_en
    FROM contracts c
    LEFT JOIN institutions i ON i.id = c.institution_id
    LEFT JOIN categories cat ON cat.id = c.category_id AND cat.is_active = 1
    LEFT JOIN contract_subcategory cs ON cs.contract_id = c.id
    LEFT JOIN subcategory_definitions sd ON sd.id = cs.subcategory_id AND sd.is_catch_all = 0
    WHERE c.id IN ({ids})
"""


_BOARD_PROCS = ('directa', 'licitacion', 'invitacion', 'otro')


def attach_row_labels(conn: sqlite3.Connection, rows: list[dict]) -> list[dict]:
    """Stamp institution_siglas, procedure, category_* and subcategory_* onto mapped list rows."""
    ids = [r["id"] for r in rows]
    found: dict[int, tuple] = {}
    if ids:
        try:
            found = {r[0]: tuple(r[1:]) for r in conn.execute(_ROW_LABELS_SQL.format(ids=",".join("?" * len(ids))), ids)}
        except sqlite3.OperationalError as e:
            logger.warning("contract_row_labels_unavailable", error=str(e))
    for r in rows:
        sig, proc, cid, ces, cen, ses, sen = found.get(r["id"], (None,) * 7)
        if proc not in _BOARD_PROCS:  # e.g. 'desconocido' (544 rows) -> fall back to is_direct_award
            proc = None
        r.update(institution_siglas=sig, procedure=proc, category_id=cid, category_es=ces, category_en=cen,
                 subcategory_es=ses, subcategory_en=sen)
    return rows


def parse_risk_factors(factors_str: str | None) -> list[str]:
    """Parse comma-separated risk factors string."""
    if not factors_str:
        return []
    return [f.strip() for f in factors_str.split(",") if f.strip()]


# Whitelist: only a well-formed company RFC is ever returned (see api/pii.py).
_mask_personal_rfc = public_rfc


def _dedupe_band(rows: list[dict], limit: int) -> list[dict]:
    """Order-preserving band dedupe: a documented row is keyed by its case
    (``case_slug``), any other row by its id. Keeps the first of each key."""
    seen: set = set()
    out: list[dict] = []
    for r in rows:
        key = ("case", r["case_slug"]) if r.get("case_slug") else ("id", r["id"])
        if key in seen:
            continue
        seen.add(key)
        out.append(r)
        if len(out) >= limit:
            break
    return out


def procedure_term(conn: sqlite3.Connection, search: str | None) -> str | None:
    """The search term when it is exactly a recorded procedure number (indexed equality,
    as typed or upper-cased), else None. Lets every search box land on a procedure."""
    term = (search or "").strip()
    if term and conn.execute(
        "SELECT 1 FROM contracts WHERE procedure_number IN (?, ?) LIMIT 1", (term, term.upper())
    ).fetchone():
        return term
    return None


_HAS_PUBLIC_EXCLUDED: bool | None = None


def _note_public_excluded(conn: sqlite3.Connection) -> None:
    """contracts.public_excluded exists only after scripts/dq1_gapfill_repair.py excluded a row it could
    not repair (DQ1 § 1); checked once per process."""
    global _HAS_PUBLIC_EXCLUDED
    if _HAS_PUBLIC_EXCLUDED is None:
        _HAS_PUBLIC_EXCLUDED = any(r[1] == "public_excluded" for r in conn.execute("PRAGMA table_info(contracts)"))


class ContractService(BaseService):
    """Business logic for contract queries."""

    # Memoized seal map: { contract_id: (slug, name_es, name_en) } for the ~374
    # seal-eligible contracts (strong GT ∩ named scandal). Static per DB, cached
    # process-wide — the evidence columns aren't indexed (a ~350K gtc scan
    # ≈ 370 ms), so resolving it per request (or per row) would be wasteful.
    _documented_map: dict[int, tuple[str, str, str]] | None = None
    # Cached full display rows for the ~374 documented contracts (mapped dicts,
    # risk-sorted). The "Los Señalados" band filters THESE in Python rather than
    # joining the seal set against the 3.1M table — an IN-list + filter is
    # reliably mis-planned into a large scan; in-memory filtering is planner-proof.
    _documented_rows_cache: list[dict] | None = None

    def list_contracts(
        self,
        conn: sqlite3.Connection,
        *,
        page: int = 1,
        per_page: int = 50,
        sector_id: int | None = None,
        year: int | None = None,
        month: int | None = None,
        column_rows: bool = False,
        vendor_id: int | None = None,
        institution_id: int | None = None,
        risk_level: str | None = None,
        risk_level_min: str | None = None,
        is_direct_award: bool | None = None,
        is_single_bid: bool | None = None,
        risk_factor: str | None = None,
        category_id: int | None = None,
        min_amount: float | None = None,
        max_amount: float | None = None,
        search: str | None = None,
        procedure_number: str | None = None,
        sort_by: str = "contract_date",
        sort_order: str = "desc",
    ) -> PaginatedResult:
        """
        List contracts with pagination and filters.

        Uses LEFT JOINs for sector/vendor/institution names.
        A search that is exactly a procedure number (indexed equality) lists that
        procedure's contracts instead of the title/description LIKE.
        """
        if search and not procedure_number and (proc := procedure_term(conn, search)):
            procedure_number, search = proc, None
        _note_public_excluded(conn)
        qb = self._build_list_qb(
            procedure_number=procedure_number,
            sector_id=sector_id,
            year=year,
            month=month,
            column_rows=column_rows,
            vendor_id=vendor_id,
            institution_id=institution_id,
            risk_level=risk_level,
            risk_level_min=risk_level_min,
            is_direct_award=is_direct_award,
            is_single_bid=is_single_bid,
            risk_factor=risk_factor,
            category_id=category_id,
            min_amount=min_amount,
            max_amount=max_amount,
            search=search,
        )

        qb.sort(
            sort_by,
            sort_order,
            whitelist=CONTRACT_SORT_WHITELIST,
            default="c.contract_date DESC",
        )
        # Tiebreaker: when sorting by risk_score descending, use Mahalanobis
        # distance as a secondary sort so the ~96K contracts capped at 1.0
        # are ranked by anomaly severity rather than arbitrary insertion order.
        if sort_by == "risk_score" and sort_order.lower() == "desc":
            qb.order_by(
                "c.risk_score DESC, c.mahalanobis_distance DESC NULLS LAST"
            )

        # Warm the documented-case map so _map_contract_row can stamp the seal
        # via an O(1) dict lookup (no per-row SQL).
        self._documented_lookup(conn)
        result = self._paginated_list(
            conn, qb, _LIST_COLUMNS, page, per_page,
            row_mapper=self._map_contract_row,
        )
        attach_row_labels(conn, result.data)
        return result

    def _build_list_qb(
        self,
        *,
        sector_id: int | None = None,
        year: int | None = None,
        month: int | None = None,
        column_rows: bool = False,
        vendor_id: int | None = None,
        institution_id: int | None = None,
        risk_level: str | None = None,
        risk_level_min: str | None = None,
        is_direct_award: bool | None = None,
        is_single_bid: bool | None = None,
        risk_factor: str | None = None,
        category_id: int | None = None,
        min_amount: float | None = None,
        max_amount: float | None = None,
        search: str | None = None,
        procedure_number: str | None = None,
    ) -> QueryBuilder:
        """Build the shared contract-list QueryBuilder (joins + filters).

        Used by both ``list_contracts`` (adds sort + pagination) and
        ``highlights`` (adds a risk sort + LIMIT) so filter semantics never
        drift between the table and the "Los Señalados" band.
        """
        qb = QueryBuilder("contracts c")
        qb.left_join("sectors s", "c.sector_id = s.id")
        qb.left_join("vendors v", "c.vendor_id = v.id")
        qb.left_join("institutions i", "c.institution_id = i.id")
        if _HAS_PUBLIC_EXCLUDED:
            qb.where("c.public_excluded = 0")  # unrepairable blank gap-fill rows (DQ1 § 1)

        qb.filter_sector(sector_id, column="c.sector_id")
        qb.filter_year(year, column="c.contract_year")
        if month is not None:  # the month of contract_date, as the /sexenios/columna months count it
            qb.where("substr(c.contract_date, 6, 2) = ?", f"{month:02d}")
        if column_rows:
            qb.where(COLUMN_ROWS_SQL)

        if vendor_id is not None:
            qb.where("c.vendor_id = ?", vendor_id)
        if institution_id is not None:
            qb.where("c.institution_id = ?", institution_id)

        qb.filter_risk_level(risk_level, column="c.risk_level")
        # Risk FLOOR (D12b § Change 7): `high` = high + critical, on the
        # indexed score (idx_c_risk_score), v0.8.5 thresholds.
        if risk_level_min is not None:
            qb.where("c.risk_score >= ?", RISK_THRESHOLDS_V6[risk_level_min.lower()])
        qb.filter_boolean(is_direct_award, column="c.is_direct_award")
        qb.filter_boolean(is_single_bid, column="c.is_single_bid")
        qb.filter_amount_range(min_amount, max_amount, column="c.amount_mxn")

        if category_id is not None:
            qb.where("c.category_id = ?", category_id)
        if procedure_number:
            term = procedure_number.strip()
            qb.where("c.procedure_number IN (?, ?)", term, term.upper())
        if search:
            qb.filter_search(search, ["c.title", "c.description"])
        if risk_factor:
            mapped = _RISK_FACTOR_COLUMN_MAP.get(risk_factor)
            if mapped:
                clause, val = mapped
                if val is not None:
                    qb.where(clause, val)
                else:
                    qb.where(clause)
            else:
                # Fallback to LIKE for other factors (co_bid, network, split, etc.)
                # Leading wildcard prevents index use; pagination limits blast radius
                qb.where("c.risk_factors LIKE ?", f"%{risk_factor}%")

        return qb

    def highlights(
        self,
        conn: sqlite3.Connection,
        *,
        sector_id: int | None = None,
        year: int | None = None,
        vendor_id: int | None = None,
        institution_id: int | None = None,
        risk_level: str | None = None,
        risk_level_min: str | None = None,
        is_direct_award: bool | None = None,
        is_single_bid: bool | None = None,
        risk_factor: str | None = None,
        category_id: int | None = None,
        min_amount: float | None = None,
        max_amount: float | None = None,
        limit: int = 8,
    ) -> list[dict]:
        """Top contracts by risk for the current filter — feeds "Los Señalados".

        Same filters as ``list_contracts`` (no free-text search, no pagination),
        forced ``ORDER BY risk_score DESC`` with the documented-case seal. One
        lightweight query (LIMIT ~8, rides idx_c_risk_score); never runs a COUNT.
        The frontend re-orders documented-first and shows the top few.
        """
        limit = max(1, min(int(limit), 12))
        _note_public_excluded(conn)

        # Pass 1 — documented contracts matching this filter, served from the
        # cached ~374-row set and filtered in Python (planner-proof, instant).
        # No risk floor: a sourced, named case features at any score.
        def _match(r: dict) -> bool:
            if sector_id is not None and r["sector_id"] != sector_id:
                return False
            if year is not None and r["contract_year"] != year:
                return False
            if vendor_id is not None and r["vendor_id"] != vendor_id:
                return False
            if institution_id is not None and r["institution_id"] != institution_id:
                return False
            if risk_level is not None and r["risk_level"] != risk_level:
                return False
            if risk_level_min is not None and (r["risk_score"] or 0) < RISK_THRESHOLDS_V6[risk_level_min.lower()]:
                return False
            if is_direct_award is not None and bool(r["is_direct_award"]) != bool(is_direct_award):
                return False
            if is_single_bid is not None and bool(r["is_single_bid"]) != bool(is_single_bid):
                return False
            amt = r["amount_mxn"] or 0
            if min_amount is not None and amt < min_amount:
                return False
            if max_amount is not None and amt > max_amount:
                return False
            if risk_factor is not None and risk_factor not in (r["risk_factors"] or []):
                return False
            # category_id is not carried on the mapped row → not applied here
            # (a rare band filter; the documented case still surfaces).
            return True

        # No [:limit] here: the band dedupes per case, so one case's many rows
        # must not crowd the other documented cases out before the dedupe.
        doc_matched = [r for r in self._documented_rows(conn) if _match(r)]

        # Pass 2 — top genuinely-flagged contracts matching this filter, from SQL.
        # Floor at high+critical via risk_LEVEL (indexed) so the band stays honest
        # ("Los Señalados" = the flagged ones) and most filters serve from a
        # composite index. Guarded by a wall-clock budget so a rare un-indexable
        # filter (e.g. is_direct_award alone) degrades to the documented pass
        # rather than hanging the async band. Empty = honest "no standout flags".
        qb_top = self._build_list_qb(
            sector_id=sector_id, year=year, vendor_id=vendor_id,
            institution_id=institution_id, risk_level=risk_level,
            risk_level_min=risk_level_min,
            is_direct_award=is_direct_award, is_single_bid=is_single_bid,
            risk_factor=risk_factor, category_id=category_id,
            min_amount=min_amount, max_amount=max_amount,
        )
        qb_top.where("c.risk_score >= ?", _BAND_RISK_FLOOR)
        qb_top.order_by("c.risk_score DESC")  # no maha secondary (forces a filesort)
        sql, params = qb_top.build_select(_LIST_COLUMNS)
        sql += f" LIMIT {limit}"
        deadline = time.monotonic() + _BAND_TOP_BUDGET_S
        conn.set_progress_handler(lambda: 1 if time.monotonic() > deadline else 0, 20_000)
        try:
            top_rows = self._execute_many(conn, sql, params)
        except sqlite3.OperationalError:
            top_rows = []  # budget exceeded → degrade to the documented pass
        finally:
            conn.set_progress_handler(None, 0)

        # Merge: documented first (already mapped), then top-risk fill. One row
        # per documented CASE — a sealed scandal carries dozens of contracts
        # (Oceanografía filled all 12 slots) — and one per id otherwise; the
        # first, highest-risk row of each case keeps its place.
        # copies: the documented rows are a process-wide cache, never stamped in place
        return attach_row_labels(conn, [dict(r) for r in _dedupe_band(
            doc_matched + [self._map_contract_row(row) for row in top_rows], limit
        )])

    def _documented_rows(self, conn: sqlite3.Connection) -> list[dict]:
        """Cached full display rows for the seal-eligible contracts (risk-sorted).
        Fetched once by PK (the only condition, so the planner uses the id index);
        see ``_documented_rows_cache``."""
        if ContractService._documented_rows_cache is None:
            ids = list(self._documented_lookup(conn).keys())
            if not ids:
                ContractService._documented_rows_cache = []
            else:
                qb = self._build_list_qb()
                placeholders = ",".join("?" * len(ids))
                qb.where(f"c.id IN ({placeholders})", *ids)
                qb.where("c.risk_score IS NOT NULL")
                qb.order_by("c.risk_score DESC")
                sql, params = qb.build_select(_LIST_COLUMNS)
                rows = self._execute_many(conn, sql, params)
                ContractService._documented_rows_cache = [
                    self._map_contract_row(r) for r in rows
                ]
        return ContractService._documented_rows_cache

    def _documented_lookup(self, conn: sqlite3.Connection) -> dict[int, tuple[str, str, str]]:
        """Process-wide cache: { contract_id: (slug, name_es, name_en) } for the
        seal-eligible contracts (strong GT ∩ named scandal). See ``_documented_map``.
        Rows are ordered best-evidence-first so the first hit per contract wins
        (dedups multi-case contracts + the PEMEX_LOZOYA twin-scandal case_id).
        Returns {} when the table is empty (e.g. the worktree stub DB)."""
        if ContractService._documented_map is None:
            rows = self._execute_many(conn, _DOCUMENTED_SEAL_QUERY)
            seal: dict[int, tuple[str, str, str]] = {}
            for r in rows:
                cid = r[0]
                if cid not in seal:
                    seal[cid] = (r[1], r[2], r[3])
            ContractService._documented_map = seal
        return ContractService._documented_map

    def _map_contract_row(self, row: sqlite3.Row) -> dict:
        """Map a contract database row to API response dict."""
        # Documented-case seal — O(1) lookup against the memoized map (no SQL).
        seal = (ContractService._documented_map or {}).get(row["id"])
        case_slug, case_name_es, case_name_en = seal if seal else (None, None, None)
        return {
            "id": row["id"],
            "contract_number": row["contract_number"],
            "title": row["title"],
            "amount_mxn": row["amount_mxn"] or 0,
            "contract_date": row["contract_date"],
            "contract_year": row["contract_year"],
            "sector_id": row["sector_id"],
            "sector_name": row["sector_name"],
            "risk_score": row["risk_score"],
            "risk_level": row["risk_level"],
            "is_direct_award": bool(row["is_direct_award"]),
            "is_single_bid": bool(row["is_single_bid"]),
            "vendor_name": row["vendor_name"],
            "vendor_rfc": _mask_personal_rfc(row["vendor_rfc"]),
            "vendor_is_individual": (is_persona_fisica(row["vendor_is_individual"], row["vendor_rfc"])
                                     if row["vendor_is_individual"] is not None or row["vendor_rfc"] else None),
            "institution_name": row["institution_name"],
            "procedure_type": row["procedure_type"],
            "mahalanobis_distance": row["mahalanobis_distance"],
            "vendor_id": row["vendor_id"],
            "institution_id": row["institution_id"],
            "risk_factors": parse_risk_factors(row["risk_factors"]),
            "risk_model_version": row["risk_model_version"],
            "source_structure": row["source_structure"],
            "is_documented_case": case_slug is not None,
            "case_slug": case_slug,
            "case_name_es": case_name_es,
            "case_name_en": case_name_en,
        }

    def get_contract_detail(
        self,
        conn: sqlite3.Connection,
        contract_id: int,
    ) -> dict | None:
        """Get detailed contract information with joined entity names."""
        row = self._execute_one(
            conn,
            """
            SELECT
                c.*,
                s.name_es as sector_name,
                v.name as vendor_name,
                v.rfc as vendor_rfc,
                v.is_individual as vendor_is_individual,
                i.name as institution_name,
                i.institution_type as institution_type
            FROM contracts c
            LEFT JOIN sectors s ON c.sector_id = s.id
            LEFT JOIN vendors v ON c.vendor_id = v.id
            LEFT JOIN institutions i ON c.institution_id = i.id
            WHERE c.id = ?
            """,
            (contract_id,),
        )
        if row is None:
            return None
        # Convert Row to dict using cursor description
        d = dict(row)
        d["vendor_is_individual"] = is_persona_fisica(d.get("vendor_is_individual"), d.get("vendor_rfc"))
        d["vendor_rfc"] = public_rfc(d.get("vendor_rfc"))
        # Documented-case seal — same four fields the list mapper stamps.
        seal = self._documented_lookup(conn).get(contract_id)
        case_slug, case_name_es, case_name_en = seal if seal else (None, None, None)
        d["is_documented_case"] = case_slug is not None
        d["case_slug"] = case_slug
        d["case_name_es"] = case_name_es
        d["case_name_en"] = case_name_en
        return d

    def get_contracts_by_ids(
        self,
        conn: sqlite3.Connection,
        contract_ids: list[int],
    ) -> list[dict]:
        """Batch-fetch multiple contracts in a single query (used by /compare)."""
        if not contract_ids:
            return []
        placeholders = ",".join("?" * len(contract_ids))
        cursor = conn.cursor()
        cursor.execute(
            f"""
            SELECT
                c.*,
                s.name_es as sector_name,
                v.name as vendor_name,
                v.rfc as vendor_rfc,
                v.is_individual as vendor_is_individual,
                i.name as institution_name,
                i.institution_type as institution_type
            FROM contracts c
            LEFT JOIN sectors s ON c.sector_id = s.id
            LEFT JOIN vendors v ON c.vendor_id = v.id
            LEFT JOIN institutions i ON c.institution_id = i.id
            WHERE c.id IN ({placeholders})
            ORDER BY c.id
            """,
            contract_ids,
        )
        rows = cursor.fetchall()
        out = [dict(row) for row in rows]
        for d in out:
            d["vendor_is_individual"] = is_persona_fisica(d.get("vendor_is_individual"), d.get("vendor_rfc"))
            d["vendor_rfc"] = public_rfc(d.get("vendor_rfc"))
        return out

    # Z-feature column names matching the v5.0 pipeline
    Z_COLS = [
        'z_single_bid', 'z_direct_award', 'z_price_ratio',
        'z_vendor_concentration', 'z_ad_period_days', 'z_year_end',
        'z_same_day_count', 'z_network_member_count', 'z_co_bid_rate',
        'z_price_hyp_confidence', 'z_industry_mismatch', 'z_institution_risk',
        'z_price_volatility', 'z_sector_spread', 'z_win_rate',
        'z_institution_diversity',
    ]
    FACTOR_NAMES = [c.replace('z_', '') for c in Z_COLS]

    # Human-readable labels for each feature
    FACTOR_LABELS = {
        'single_bid': 'Single Award',
        'direct_award': 'Direct Award',
        'price_ratio': 'Amount vs similar contracts',
        'vendor_concentration': 'Vendor Concentration',
        'ad_period_days': 'Ad Period Length',
        'year_end': 'Year-End Timing',
        'same_day_count': 'Same-Day Contracts',
        'network_member_count': 'Network Size',
        'co_bid_rate': 'Co-Bidding Rate',
        'price_hyp_confidence': 'Amount-outlier confidence',
        'industry_mismatch': 'Industry Mismatch',
        'institution_risk': 'Institution Risk',
        'price_volatility': 'Very uneven contract sizes',
        'sector_spread': 'Cross-Sector Activity',
        'win_rate': 'Win Rate',
        'institution_diversity': 'Institution Diversity',
        # CAL-v8 terms stored in contract_z_features_v2 (PARALLAX D13b § Change 6)
        'amount_residual_z': 'Amount Residual',
        'recency_z': 'Recency',
        'cobid_herfindahl': 'Co-bid Herfindahl',
        'pub_delay_z': 'Publication Delay',
        'amendment_flag': 'Amendment',
        'partida_price_residual_z_loo': 'Amount vs. Budget Line',
        'partida_single_bid_z_loo': 'Single Award vs. Budget Line',
        'partida_direct_award_z_loo': 'Direct Award vs. Budget Line',
        'has_partida': 'Has Budget Line',
        'rt4_log': 'Institutions Served Before (Breadth)',
        'rt4_cap': 'Institutions Served Before (Breadth)',
        'inst_hhi_prior': 'Buyer Concentration Before (HHI)',
    }
    # The five active terms with no z_ column, under the coefficient's own name.
    V2_FACTOR_NAMES = ['amount_residual_z', 'recency_z', 'cobid_herfindahl', 'pub_delay_z', 'amendment_flag']

    def get_risk_explanation(
        self,
        conn: sqlite3.Connection,
        contract_id: int,
    ) -> dict | None:
        """
        Compute per-feature contribution to a contract's v5.0 risk score.

        For logistic regression P = sigmoid(intercept + sum(beta_i * z_i)) / c,
        each feature's contribution to the logit is beta_i * z_i.

        Returns dict with overall score, model info, and sorted feature contributions.
        """
        # 1. Get contract basic info + sector_id
        contract_row = self._execute_one(
            conn,
            """
            SELECT id, risk_score, risk_level, risk_model_version,
                   risk_confidence_lower, risk_confidence_upper,
                   sector_id, contract_year
            FROM contracts WHERE id = ?
            """,
            (contract_id,),
        )
        if contract_row is None:
            return None
        if contract_row["risk_score"] is None:
            # Not scored yet (ComprasMX, 'pending_score'): no indicator, so nothing to decompose.
            return {
                "contract_id": contract_id,
                "risk_score": None,
                "risk_level": None,
                "model_version": contract_row["risk_model_version"],
                "confidence_interval": {"lower": None, "upper": None},
                "explanation_available": False,
                "features": [],
            }

        sector_id = contract_row["sector_id"]

        if contract_row["risk_model_version"] in V10_MODELS:
            # v0.9.2: logit = intercept + sum(beta * x) over contract_features_v10 (raw units, as scored)
            cal = self._execute_one(conn, _ACTIVE_GLOBAL_SQL)
            coefs = normalize_coefficients(cal["coefficients"]) if cal else {}
            x, n = v10_means(conn, "c.id = ?", (contract_id,), coefs) if coefs else (None, 0)
            if x is not None:
                # Centre every term on the mean scored contract (as the vendor/institution waterfall does): betas are
                # in raw units, so β·x of a positive-only input (rt4_log, inst_hhi_prior, cobid_herfindahl) always read
                # as «pushes up» — e.g. ONE prior institution (log1p(1)) showed as a reason. Now z_score = x − mean,
                # contribution = β·(x − mean), and baseline_logit (the mean contract) + Σ contribution = logit.
                pop = v10_population_means(conn, coefs) or {}
                mu = {f: pop.get(f, 0.0) for f in x}
                feats = [{"feature": v10_display_name(f),
                          "label": self.FACTOR_LABELS.get(v10_display_name(f), v10_display_name(f).replace('_', ' ').title()),
                          "value": round(x[f], 6), "z_score": round(x[f] - mu[f], 3), "coefficient": round(b, 4),
                          "contribution": round(b * (x[f] - mu[f]), 4)}
                         for f, b in coefs.items() if b and f in x]
                feats.sort(key=lambda f: abs(f["contribution"]), reverse=True)
                # each term's value in its own units (_v10/build_v10.py `{name}_raw`: price_ratio = amount ÷ the
                # sector's [Y−2, Y] median, vendor_concentration = prior share of the sector's money, …) so a
                # reader-facing explainer can say «8 veces» instead of «3.5 SD». Absent column/row → no `raw`.
                try:
                    rr = conn.execute("SELECT * FROM contract_features_v10 WHERE contract_id = ?", (contract_id,)).fetchone()
                except sqlite3.OperationalError:
                    rr = None
                if rr is not None:
                    keys = set(rr.keys())
                    for ft in feats:
                        col = f"{ft['feature']}_raw"
                        if col in keys and rr[col] is not None:
                            ft["raw"] = round(float(rr[col]), 6)
                logit = cal["intercept"] + sum(b * x[f] for f, b in coefs.items() if f in x)
                c_pu = cal["pu_correction_factor"] or 1.0
                model_score, display_score = v10_scores(logit, c_pu)
                return {
                    "contract_id": contract_id, "risk_score": contract_row["risk_score"],
                    "risk_level": contract_row["risk_level"] or "unknown",
                    "model_version": contract_row["risk_model_version"], "model_type": "global", "sector_id": sector_id,
                    "confidence_interval": {"lower": contract_row["risk_confidence_lower"],
                                            "upper": contract_row["risk_confidence_upper"]},
                    "explanation_available": True, "run_id": cal["run_id"], "omitted_features": [],
                    "intercept": round(cal["intercept"], 4),
                    "logit": round(logit, 4), "pu_correction": round(c_pu, 4),
                    "baseline_logit": round(cal["intercept"] + sum(b * mu[f] for f, b in coefs.items() if f in mu), 4),
                    # the scores this logit gives (stored risk_score = display_score; risk_score_v92 = model_score)
                    "model_score": round(model_score, 6), "display_score": round(display_score, 6), "features": feats,
                }

        # 2. Get z-features for this contract
        z_cols_sql = ", ".join(self.Z_COLS)
        try:
            z_row = self._execute_one(
                conn,
                f"SELECT {z_cols_sql} FROM contract_z_features WHERE contract_id = ?",
                (contract_id,),
            )
        except sqlite3.OperationalError:
            # Table may not exist in deploy database
            z_row = None
        if z_row is None:
            # No z-features (pre-2002 data or missing)
            return {
                "contract_id": contract_id,
                "risk_score": contract_row["risk_score"] or 0,
                "risk_level": contract_row["risk_level"] or "unknown",
                "model_version": contract_row["risk_model_version"],
                "confidence_interval": {
                    "lower": contract_row["risk_confidence_lower"],
                    "upper": contract_row["risk_confidence_upper"],
                },
                "explanation_available": False,
                "features": [],
            }

        z_values = [z_row[col] or 0.0 for col in self.Z_COLS]
        factor_names = list(self.FACTOR_NAMES)
        try:
            v2_row = self._execute_one(
                conn,
                f"SELECT {', '.join(self.V2_FACTOR_NAMES)} FROM contract_z_features_v2 WHERE contract_id = ?",
                (contract_id,),
            )
        except sqlite3.OperationalError:
            v2_row = None  # no _v2 table in this DB — those terms stay omitted
        if v2_row is not None:
            factor_names += self.V2_FACTOR_NAMES
            z_values += [v2_row[col] or 0.0 for col in self.V2_FACTOR_NAMES]
        try:
            v9_row = self._execute_one(conn, V9_SELECT + " WHERE contract_id = ?", (contract_id,))
        except sqlite3.OperationalError:
            v9_row = None  # no v0.9 feature table in this DB (deploy DB) — those terms stay omitted

        # 3. Load the ACTIVE global calibration (v0.8.5, CAL-v8) — the same row
        # the score was computed with. The old `LIKE 'v6%'` pick served
        # CAL-v6.1 (intercept -2.393) under a v0.8.5 score (PARALLAX D12b).
        cal_row = self._execute_one(conn, _ACTIVE_GLOBAL_SQL)
        model_type = "global"

        if cal_row is None:
            logger.warning("No active calibration found", contract_id=contract_id)
            return {
                "contract_id": contract_id,
                "risk_score": contract_row["risk_score"] or 0,
                "risk_level": contract_row["risk_level"] or "unknown",
                "model_version": contract_row["risk_model_version"],
                "confidence_interval": {
                    "lower": contract_row["risk_confidence_lower"],
                    "upper": contract_row["risk_confidence_upper"],
                },
                "explanation_available": False,
                "features": [],
            }

        intercept = cal_row["intercept"]
        coefficients = normalize_coefficients(cal_row["coefficients"])
        pu_c = cal_row["pu_correction_factor"] or 1.0
        # v0.9.1 terms from contract_features_v9, transformed exactly as scripts/score_v091.py does.
        tf = load_active_feature_transforms(conn)
        if v9_row is not None and tf.get("rt4"):
            terms = v9_terms(tf, v9_row)
            factor_names += list(terms)
            z_values += list(terms.values())
        # Scoring clips every feature to +-5 (training convention); decompose the same values.
        z_values = [max(-5.0, min(5.0, z)) for z in z_values]
        # Active-model features with no per-contract z column (not decomposed).
        omitted = sorted(
            k for k, v in coefficients.items() if v and k not in factor_names
        )

        # 4. Compute per-feature contributions (beta_i * z_i)
        features = []
        total_logit = intercept
        for i, factor_name in enumerate(factor_names):
            beta = coefficients.get(factor_name, 0.0)
            if beta == 0.0:
                continue  # not an active term
            z = z_values[i]
            contribution = beta * z
            total_logit += contribution

            features.append({
                "feature": factor_name,
                "label": self.FACTOR_LABELS.get(factor_name, factor_name.replace('_', ' ').title()),
                "z_score": round(z, 3),
                "coefficient": round(beta, 4),
                "contribution": round(contribution, 4),
            })

        # Sort by absolute contribution (most impactful first)
        features.sort(key=lambda f: abs(f["contribution"]), reverse=True)

        return {
            "contract_id": contract_id,
            "risk_score": contract_row["risk_score"] or 0,
            "risk_level": contract_row["risk_level"] or "unknown",
            "model_version": contract_row["risk_model_version"],
            "model_type": model_type,
            "sector_id": sector_id,
            "confidence_interval": {
                "lower": contract_row["risk_confidence_lower"],
                "upper": contract_row["risk_confidence_upper"],
            },
            "explanation_available": True,
            "run_id": cal_row["run_id"],
            "omitted_features": omitted,
            "intercept": round(intercept, 4),
            "logit": round(total_logit, 4),
            "pu_correction": round(pu_c, 4),
            "features": features,
        }

    def get_contract_statistics(
        self,
        conn: sqlite3.Connection,
        *,
        sector_id: int | None = None,
        year: int | None = None,
    ) -> dict:
        """
        Get aggregate contract statistics.

        Returns totals, averages, and risk/procedure breakdowns.
        """
        conditions: list[str] = []
        params: list[Any] = []

        if sector_id is not None:
            conditions.append("sector_id = ?")
            params.append(sector_id)
        if year is not None:
            conditions.append("contract_year = ?")
            params.append(year)

        where_clause = " AND ".join(conditions) if conditions else "1=1"

        row = self._execute_one(
            conn,
            f"""
            SELECT
                COUNT(*) as total_contracts,
                COALESCE(SUM(amount_mxn), 0) as total_value,
                COALESCE(AVG(amount_mxn), 0) as avg_value,
                SUM(CASE WHEN risk_level = 'low' THEN 1 ELSE 0 END) as low_risk,
                SUM(CASE WHEN risk_level = 'medium' THEN 1 ELSE 0 END) as medium_risk,
                SUM(CASE WHEN risk_level = 'high' THEN 1 ELSE 0 END) as high_risk,
                SUM(CASE WHEN risk_level = 'critical' THEN 1 ELSE 0 END) as critical_risk,
                SUM(CASE WHEN is_direct_award = 1 THEN 1 ELSE 0 END) as direct_awards,
                SUM(CASE WHEN is_single_bid = 1 THEN 1 ELSE 0 END) as single_bids,
                MIN(contract_year) as min_year,
                MAX(contract_year) as max_year
            FROM contracts
            WHERE {where_clause}
            """,
            params,
        )

        total = row["total_contracts"] or 0
        return {
            "total_contracts": total,
            "total_value_mxn": row["total_value"] or 0,
            "avg_contract_value": row["avg_value"] or 0,
            "low_risk_count": row["low_risk"] or 0,
            "medium_risk_count": row["medium_risk"] or 0,
            "high_risk_count": row["high_risk"] or 0,
            "critical_risk_count": row["critical_risk"] or 0,
            "direct_award_count": row["direct_awards"] or 0,
            "direct_award_pct": round((row["direct_awards"] or 0) / total * 100, 2) if total > 0 else 0,
            "single_bid_count": row["single_bids"] or 0,
            "single_bid_pct": round((row["single_bids"] or 0) / total * 100, 2) if total > 0 else 0,
            "min_year": row["min_year"] or 2002,
            "max_year": row["max_year"] or DATA_LAST_YEAR,
        }


# Singleton instance for router use
contract_service = ContractService()
