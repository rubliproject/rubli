#!/bin/sh
# Rebuild every category precompute against $1, in place. Run from backend/ (in-container: /app).
# For a live DB, run this on a scratch copy and then scripts.swap_category_precomputes.
DB=$1; export DATABASE_PATH=$DB
step() { echo "== $* $(date +%T)"; "$@" || { echo "FAILED: $*"; exit 1; }; }
# per-contract subcategory ids first (contract_subcategory); everything below reads category_id only
# except compute_subcategory_stats, which aggregates these ids.
step python -m scripts.classify_subcategories --db "$DB"
step python scripts/compute_category_stats.py
step python -m scripts._precompute_category_cohort_counts "$DB"
step python -m scripts._refresh_category_avg_risk "$DB"
step python -m scripts._fix_category_accents "$DB"
step python -m scripts._precompute_category_top_vendors "$DB"
# institution_category_stats BEFORE the enrichments: enrichments step 3
# (category_top_institutions) reads it (D9b F9; stale 173,351 vs 179,934 after P0).
step python -m scripts.precompute_institution_categories "$DB"
step python -m scripts._precompute_category_enrichments "$DB"
step python scripts/compute_subcategory_stats.py
step python -m scripts._precompute_category_signals "$DB"
step python -m scripts._precompute_atlas_cohort_periods "$DB"
echo CHAIN_DONE
