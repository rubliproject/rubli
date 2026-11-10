"""
Centralized constants for the RUBLI backend.

These values were previously duplicated across 9+ files.
Import from here instead of redefining.
"""

# Amount validation thresholds (from data-validation.md)
MAX_CONTRACT_VALUE = 100_000_000_000  # 100B MXN - reject above this
FLAG_THRESHOLD = 10_000_000_000       # 10B MXN - flag for review

# Data span: CompraNet 2002 → Sep 2025, then ComprasMX open data to the cut date. One place to change.
DATA_FIRST_YEAR = 2002
DATA_LAST_YEAR = 2026
# Procedure type (direct award / single bid) is coded from 2011: structure A (2002–2010) says
# «Licitación Pública» on every row and 2010 is a partial B year. Every share SQL builds its numerator
# / denominator with proc_known / proc_den below; frontend lib/constants.ts PROCEDURE_TYPE_FIRST_YEAR.
# (DQ1 § 2. The DATA fix — dq1_procedure_unknown.py — NULLs structure A, i.e. ≤ 2010 by file format;
# the 2010 B rows keep their flags but no share counts them.)
PROCEDURE_TYPE_FIRST_YEAR = 2011


def proc_known(col: str, year_col: str = "contract_year") -> str:
    """SQL: the procedure flag `col` where it is coded (year >= PROCEDURE_TYPE_FIRST_YEAR), else NULL."""
    return f"(CASE WHEN {year_col} >= {PROCEDURE_TYPE_FIRST_YEAR} THEN {col} END)"


def proc_den(col: str, year_col: str = "contract_year") -> str:
    """SQL: the denominator of a procedure share — rows whose `col` is coded; NULL (→ share NULL) when none."""
    return f"NULLIF(COUNT({proc_known(col, year_col)}), 0)"
SOURCE_SWITCH_ISO = "2025-09-28"  # CompraNet ends, ComprasMX begins
DATA_CUT_ISO = "2026-10-17"  # last ComprasMX publication date (later contract dates are start dates)
# The public register = every headline count and its breakdowns (overview, years, risk levels, /stats/database).
# `contracts` incl. ComprasMX (structure E); never the staging table comprasmx_contracts on top of it.
# Leaves out the 20 rows dated 2000-01, zero/negative amounts (unscored) and > 100B (data errors).
# «La columna» (/administrations) rows — one definition for the slabs, month signals, by-category split and the month's
# list: CompraNet only (ComprasMX 'E' overlaps it in 2025), 0 < amount <= 100B, dated ON OR BEFORE the CompraNet cut
# (AUDIT_DATA 11-07 A9: ~31 bn dated after 28 Sep made «2025, to September» untrue). Constant SQL, alias c.
COLUMN_ROWS_SQL = (f"c.amount_mxn > 0 AND c.amount_mxn <= {MAX_CONTRACT_VALUE} AND c.contract_date IS NOT NULL "
                   f"AND substr(c.contract_date, 1, 10) <= '{SOURCE_SWITCH_ISO}' AND COALESCE(c.source_structure, '') <> 'E'")
PUBLIC_REGISTER_SQL = f"contract_year >= {DATA_FIRST_YEAR} AND amount_mxn > 0 AND amount_mxn <= {MAX_CONTRACT_VALUE}"

# Risk level thresholds (v3.3) — weighted checklist model
RISK_THRESHOLDS = {
    'critical': 0.50,
    'high': 0.35,
    'medium': 0.20,
    'low': 0.0,
}

# Risk level thresholds — statistical risk indicators (NOT probabilities)
# Scores measure similarity to documented corruption patterns.
# A score of 0.60 does NOT mean "60% probability of corruption."
# v4.0/v5.1 thresholds (preserved for backward compatibility)
RISK_THRESHOLDS_V4 = {
    'critical': 0.50,   # v4.0/v5.1 thresholds
    'high': 0.30,
    'medium': 0.10,
    'low': 0.0,
}

# v0.8.5 thresholds — recalibrated for PU-corrected scores (c_pu=0.32)
# PU correction: Elkan & Noto floor c=0.32
# HR=11.0% OECD compliant (within 2-15% benchmark)
# GT detection: vendor-stratified test AUC=0.785
RISK_THRESHOLDS_V6 = {
    'critical': 0.60,   # Strongest similarity to known corruption patterns
    'high': 0.40,       # Strong similarity
    'medium': 0.25,     # Moderate similarity
    'low': 0.0,         # Low similarity
}

# Active thresholds for current model
RISK_THRESHOLDS_V5 = RISK_THRESHOLDS_V6

# Active model version (promoted 2026-10-13; v0.8.5 kept in contracts.risk_score_v8 for rollback)
# v0.9.1: ElasticNet + PU, 27 features (v0.8.5 base + partida + RT-4 breadth), Stage-4b tempered,
# HR 10% OECD compliant, gold-holdout AUC ~0.85, Gate B calibration (see docs/SCORING.md)
CURRENT_MODEL_VERSION = 'v0.9.2'


def get_risk_level(score: float, model_version: str = None) -> str:
    """Return risk level string for a given score.

    Args:
        score: Risk score (0-1)
        model_version: 'v3.x', 'v4.x'/'v5.x', or newer. If None, uses CURRENT_MODEL_VERSION.
    """
    # Prefix match, not string >=: 'v0.8.5' (active) sorts below 'v4.0'.
    version = model_version or CURRENT_MODEL_VERSION
    if version.startswith('v3'):
        thresholds = RISK_THRESHOLDS
    elif version.startswith(('v4', 'v5')):
        thresholds = RISK_THRESHOLDS_V4
    else:
        thresholds = RISK_THRESHOLDS_V6

    if score >= thresholds['critical']:
        return 'critical'
    if score >= thresholds['high']:
        return 'high'
    if score >= thresholds['medium']:
        return 'medium'
    return 'low'
