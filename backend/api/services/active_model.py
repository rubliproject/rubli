"""Active risk-model resolution for read-path SHAP / metadata surfaces.

The active model (v0.8.5) stores its GLOBAL calibration row with
``sector_id = 0`` and coefficients as parallel arrays
``{"names": [...], "values": [...]}``. Older models (v6.0, v5.0) used
``sector_id IS NULL`` and a flat ``{name: value}`` dict.

The legacy ``WHERE sector_id IS NULL`` loaders therefore silently served the
superseded **v6.0** betas to every risk-factor / waterfall / model-info
surface, while the contract scores themselves used v0.8.5 — so the
"why is this risky" breakdowns disagreed with the score they explained
(3 sign flips incl. direct_award, 4 features missing). Resolve the active
global row by recency across BOTH sector_id conventions, and normalize BOTH
coefficient shapes here so every read-path surface agrees with the score.

Read-only: never writes; never touches ``contracts.risk_score_v8``.
"""
import json
import re
import math
import sqlite3
from typing import Any, Dict

# Most-recent global calibration row, tolerant of the sector_id=0 (v0.8.5+)
# vs sector_id IS NULL (<= v6.0) convention change. created_at DESC makes the
# active model win: v0.9.1 (2026-10-13) > v0.8.5 (2026-05-02) > v6.0 > v6.5 > v5.0.
_ACTIVE_GLOBAL_SQL = (
    "SELECT model_version, run_id, intercept, coefficients, pu_correction_factor "
    "FROM model_calibration "
    "WHERE sector_id = 0 OR sector_id IS NULL "
    "ORDER BY created_at DESC, id DESC LIMIT 1"
)


def normalize_coefficients(raw: Any) -> Dict[str, float]:
    """Normalize either stored coefficient shape into a flat ``{name: value}`` dict.

    Handles the v0.8.5 ``{"names": [...], "values": [...]}`` parallel-array
    layout and the older flat ``{name: value}`` dict. Accepts a JSON string or
    an already-parsed object. Returns ``{}`` for empty/unrecognized input.
    """
    if not raw:
        return {}
    data = json.loads(raw) if isinstance(raw, str) else raw
    if isinstance(data, dict) and "names" in data and "values" in data:
        return {str(n): float(v) for n, v in zip(data["names"], data["values"])}
    if isinstance(data, dict):
        return {str(k): float(v) for k, v in data.items()}
    return {}


def load_active_global_model(conn) -> Dict[str, Any]:
    """Return ``{model_version, intercept, coefficients}`` for the active global model.

    ``conn`` must yield ``sqlite3.Row`` rows (the API's standard connection).
    """
    row = conn.execute(_ACTIVE_GLOBAL_SQL).fetchone()
    if not row:
        return {"model_version": None, "intercept": 0.0, "coefficients": {}}
    intercept = row["intercept"]
    return {
        "model_version": row["model_version"],
        "intercept": float(intercept) if intercept is not None else 0.0,
        "coefficients": normalize_coefficients(row["coefficients"]),
    }


V10_MODELS = ("v0.9.2",)  # scored from contract_features_v10 (as-of): raw-unit betas, neutral fill
V10_FILL = {"inst_hhi_prior": 1.0, "cobid_herfindahl": 1.0}  # _v10/score_v092.py NULL fill; else 0
SQUASH_K = 0.46  # _v10/score_v092.py SQUASH_K (frozen)


def v10_scores(logit: float, c_pu: float) -> tuple:
    """(model score min(q,1) = risk_score_v92, display score = the stored risk_score), as _v10/score_v092.py
    computes them: q = σ(logit)/c_pu; display = q up to 0.60, above it 0.60 + 0.35·tanh((q−0.60)/K)."""
    q = 1.0 / (1.0 + math.exp(-logit)) / c_pu
    return min(q, 1.0), (q if q <= .60 else .60 + .35 * math.tanh((q - .60) / SQUASH_K))


def v10_display_name(feature: str) -> str:
    """contract_features_v10 column -> the factor key the labels / UI use (v0.9.1 naming)."""
    if feature.startswith("partida_") and feature.endswith("_z"):
        return feature + "_loo"
    return feature[2:] if feature.startswith("z_") else feature


def v10_means(conn, where_sql: str, params: tuple, coefficients: Dict[str, float]):
    """Mean of each active v0.9.2 input over the contracts matching ``where_sql`` (alias c), NULLs
    filled as the scorer fills them. Returns ({feature: mean}, n) or (None, 0) if the table is absent."""
    feats = [f for f in coefficients if re.fullmatch(r"[a-z0-9_]+", f)]
    sel = ", ".join(f"AVG(COALESCE(f.{f}, {V10_FILL.get(f, 0.0)})) AS {f}" for f in feats)
    try:
        row = conn.execute(f"SELECT {sel}, COUNT(*) AS cnt FROM contract_features_v10 f "
                           f"JOIN contracts c ON c.id = f.contract_id WHERE {where_sql}", params).fetchone()
    except sqlite3.OperationalError:
        return None, 0
    if not row or not row["cnt"]:
        return None, 0
    return {f: float(row[f] or 0.0) for f in feats}, int(row["cnt"])


def v10_entity_means(conn, col: str, entity_id: int, coefficients: Dict[str, float]):
    """v10_means for one vendor / institution: the precomputed ``entity_v10_means`` row first
    (scripts/precompute_entity_v10_means.py; IMSS is a 662K-row live AVG), else the live AVG."""
    try:
        row = conn.execute("SELECT * FROM entity_v10_means WHERE entity_type = ? AND entity_id = ?",
                           (col, entity_id)).fetchone()
    except sqlite3.OperationalError:
        row = None
    feats = [f for f in coefficients if re.fullmatch(r"[a-z0-9_]+", f)]
    if row and row["cnt"] and all(f in row.keys() for f in feats):
        return {f: float(row[f] or 0.0) for f in feats}, int(row["cnt"])
    return v10_means(conn, f"c.{col} = ?", (entity_id,), coefficients)


_V10_POP: Dict[tuple, Dict[str, float]] = {}  # process cache; a rescore ships with a deploy (restart)


def v10_population_means(conn, coefficients: Dict[str, float]):
    """Mean of each active v0.9.2 input over every scored contract: the cnt-weighted mean of the
    ``entity_v10_means`` institution rows (a few thousand rows), else one live AVG. Cached."""
    feats = [f for f in coefficients if re.fullmatch(r"[a-z0-9_]+", f)]
    key = tuple(feats)
    if key not in _V10_POP:
        try:
            row = conn.execute("SELECT " + ", ".join(f"SUM(cnt * {f}) / SUM(cnt) AS {f}" for f in feats)
                               + " FROM entity_v10_means WHERE entity_type = 'institution_id'").fetchone()
            pop = {f: float(row[f]) for f in feats} if row and row[feats[0]] is not None else None
        except (sqlite3.OperationalError, IndexError):
            pop = None
        if pop is None:
            # ponytail: one full AVG over contract_features_v10 per process when the precompute is absent
            pop, _ = v10_means(conn, "1 = 1", (), coefficients)
        if pop is None:
            return None
        _V10_POP[key] = pop
    return _V10_POP[key]


def v10_centred_means(conn, col: str, entity_id: int, coefficients: Dict[str, float]):
    """The entity's v0.9.2 input means minus the population means, so beta x gap reads «more / less
    than usual» honestly (raw means are positive for rt4_log / inst_hhi_prior / cobid_herfindahl).
    Returns ({feature: gap}, n) or (None, 0)."""
    means, n = v10_entity_means(conn, col, entity_id, coefficients)
    pop = v10_population_means(conn, coefficients) if means is not None else None
    if pop is None:
        return None, 0
    return {f: means[f] - pop[f] for f in means}, n


def load_active_feature_transforms(conn) -> Dict[str, Any]:
    """``feature_transforms`` of the active global row (v0.9.1+: RT-4 / HHI standardisation), or {}."""
    try:
        row = conn.execute(_ACTIVE_GLOBAL_SQL.replace("SELECT ", "SELECT hyperparameters, ", 1)).fetchone()
        return (json.loads(row["hyperparameters"] or "{}") or {}).get("feature_transforms") or {}
    except (sqlite3.OperationalError, TypeError, ValueError, IndexError, KeyError):
        return {}  # older DBs: no hyperparameters column / no row


def v9_terms(tf: Dict[str, Any], v9_row) -> Dict[str, float]:
    """The six contract_features_v9 terms of one contract, transformed and clipped (+-5) exactly
    as scripts/score_v091.py scores them. ``v9_row`` maps the contract_features_v9 columns."""
    rt4, hhi = tf["rt4"], tf["inst_hhi_prior"]
    n = float(v9_row["n_inst_prior"] or 0)
    raw = math.log1p(min(n, rt4["cap_n_inst"]) if rt4["kind"] == "cap" else n)
    vals = {
        "partida_price_residual_z_loo": v9_row["partida_price_residual_z_loo"] or 0.0,
        "partida_single_bid_z_loo": v9_row["partida_single_bid_z_loo"] or 0.0,
        "partida_direct_award_z_loo": v9_row["partida_direct_award_z_loo"] or 0.0,
        "has_partida": float(v9_row["has_partida"] or 0),
        rt4["name"]: (raw - rt4["mean"]) / rt4["std"],
        "inst_hhi_prior": ((v9_row["inst_hhi_prior"] or 0.0) - hhi["mean"]) / hhi["std"],
    }
    return {k: max(-5.0, min(5.0, v)) for k, v in vals.items()}


V9_SELECT = ("SELECT partida_price_residual_z_loo, partida_single_bid_z_loo, partida_direct_award_z_loo, "
             "has_partida, n_inst_prior, inst_hhi_prior FROM contract_features_v9")


def load_active_global_coefficients(conn) -> Dict[str, float]:
    """Convenience: the normalized coefficient dict for the active global model."""
    return load_active_global_model(conn)["coefficients"]
