# RUBLI Risk Scoring — which script does what (READ BEFORE ANY RESCORE)

> **Active model: v0.9.2** (2026-10-22): v0.9.1's recipe (ElasticNet logistic + PU, C 0.003725 /
> l1 0.9188, v0.9.1 labelling) **re-fitted on strictly as-of features** (`contract_features_v10`: prior-year
> vendor history, trailing [Y−2, Y] baselines). Chosen by the signed rematch (`_v10/PREREGISTRATION_2.md`,
> result `_v10/RESULT_2.md`): forward-chained vendor-year AUC 0.827 (lower CI 0.763), size-controlled 0.741,
> statistically tied with v0.10. Scorer: **`_v10/score_v092.py`** (frozen artifact `_v10/rematch_result.json`
> policy `v091_asof`: intercept −3.6328, c_pu 0.4360, T 0.530, 17 features) → `contracts.risk_score_v92`,
> `risk_score`, `risk_level`, `risk_model_version='v0.9.2'`. Scores ALL contracts incl. ComprasMX (structure E)
> with 0 < amount ≤ 100B. Prod 2026-10-23: 3,176,621 scored · HR 9.94% · critical 5.2% · high 4.8% ·
> medium 12.5% · low 77.6% (unchanged on prod 2026-10-30, `/analysis/risk-overview`: 3,178,884 · HR 9.95%) · saturation 89,315 (2.81%, same rate as v0.9.1's 85,542 cap on the smaller
> pre-ComprasMX population). No v0.8.5 post-patch (ghost boost / FP cap) — the model ships as tested.
> **Why it replaced v0.9.1:** v0.9.1's stored features are contemporaneous/all-years; rebuilt as-of, its
> recipe drops from M2 0.906 to 0.741 (AUC 0.945 on vendors with NO history came from look-ahead).
> Rollback: `_v10/score_v092.py --rollback` (snapshot `_risk_pre_v092`) or `risk_score_v91` (kept).

## Display score (2026-10-28, `docs/MODEL_SATURATION_REVIEW_2026-10-28.md` § 4 (b))

`risk_score_v92` = min(q, 1) with q = σ(z)/c_pu is **the model's score and the source of truth** — never
changed by the squash. `risk_score` (what API/UI read) is the **display score**: q itself up to 0.60, above it
`0.60 + 0.35·tanh((q − 0.60)/K)`, **K = 0.46** = median(q − 0.60 | q > 0.60) on prod (0.4615). Continuous at
0.60, strictly increasing, < 0.95 (max 0.9496 at q = 1/c_pu), so no contract crosses 0.60/0.40/0.25:
`risk_level` and HR are identical; the 89,358 ties at 1.00 become 88,885 distinct values (the rest share z).
Why: 52 % of contracts ≥ 100 MDP sat at exactly 1.00 (rank lost inside Critical, "1.00" read as certainty).
Read 0.95 as "top of Critical", not as a probability; big-contract Critical is still largely a size flag.

- Prod dry run 2026-10-28 (read-only): 3,178,904 · levels before = after (critical 164,334 · high 151,840 ·
  medium 396,839 · low 2,465,891) · HR 9.95 % · saturated 89,358 → 0 · Spearman(display, capped) within
  Critical 0.916 (ties broken), Spearman(display, q) 1.000 · display bins .60–.70 41,981 · .70–.80 24,150 ·
  .80–.90 29,034 · .90–.95 69,169.
- Apply on an already-scored DB: `_v10/score_v092.py --db X --model _v10/rematch_result.json --squash
  [--write]` (recomputes q, refuses unless min(q,1) reproduces every stored `risk_score_v92` to 1e-9, writes
  only `risk_score` of the q > 0.60 rows). A full `--write` rescore writes both columns. Guards add: level
  changes = 0, display ≥ 0.999 = 0. Tests `backend/tests/test_score_squash.py`.
- **After any `--write` (squash or rescore) refresh the entity averages**: `python -m scripts._refresh_stats_tables
  --db X` (vendor_stats, institution_stats, vendors.avg_risk_score). Prod 2026-10-30 (read-only): the squash was
  applied (164,334 rows with risk_score ≠ risk_score_v92, max display 0.9496) but vendor_stats / institution_stats
  were last refreshed 2026-10-28 08:13 — pre-squash, so 15 vendors showed an average > 0.95 (max 0.9933, vendor
  29277, whose highest contract shows 0.9495). Pinned by `backend/tests/test_stats_display_score.py`.
  category_stats was already on the display score.
- Undo: `UPDATE contracts SET risk_score = risk_score_v92 WHERE risk_model_version = 'v0.9.2' AND
  risk_score_v92 > 0.60`.
- Anything that inverts the stored score (σ⁻¹(score·c_pu)) must read `risk_score_v92` or the explainer's
  `logit` instead (fixed: `ActaLedger.tsx`).

## Caveat — `single_bid` counts winners, not bidders (2026-11-09)

`is_single_bid` (and the model features `z_single_bid`, `partida_single_bid_z`, built in `_v10/build_v10.py`
over structures D+E) = a competitive procedure whose contracts went to **one distinct vendor**. CompraNet (A–D)
and ComprasMX (E) publish awarded contracts only; losing offers are not in the data. So the feature measures
«un solo adjudicado» (D20), not «un solo postor»: press check 2026-11-09 found rail tenders flagged here with 7 and
11 bids. v0.9.2 weight: +0.079 raw (+0.149 standardised, rank 9 of 16) — small; per-contract effect ≈ ±0.1 logit
(`docs/DIAG_COMPRASMX_SINGLE_BID_2026-11-09.md` § 3). **Not retrained.** A real offer count exists only in the
actas de fallo (CompraNet expedientes) and ComprasMX's «Postor Abierto» feed — future work, see the diag doc.
Never describe this feature, or a contract flagged by it, as «un solo postor» / "single bidder".

## ⚠️ The wrong-script hazard (why this file exists)

The active scorer lives OUTSIDE `backend/scripts/` (`_v10/score_v092.py`, on `main`). The V6 scorers and the superseded
`score_v091.py` ARE in `backend/scripts/` — so the easy mistake is to "rescore" with one of
them, which silently overwrites the live v0.9.2 scores. Do not. (The rubli-guard mod refuses
the V6 scorers and `score_v091.py --write`.)

| Script | Produces | Status |
|---|---|---|
| `_patch_v85_ghost_fp.py` | patches `risk_score_v8` for ghost-FP vendors | v0.8.5 **patch only**, not the full scorer |
| `_score_v6_now.py` | v6.0 scores | ❌ V6 — NOT active |
| `calculate_risk_scores_v6.py` | v6.0 (`WHERE model_version='v6.0'`) | ❌ V6 |
| `calibrate_risk_model_v6_enhanced.py` | `MODEL_VERSION='v6.0'` calibration | ❌ V6 calibrator |
| `calibrate_risk_model_v5.py` / `_v6.py` | v5 / v6 | ❌ superseded |
| **`_v10/score_v092.py`** | v0.9.2 (above) | ✅ **the active scorer** — dry run by default, `--write`; guards intercept/c_pu/HR |
| `score_v091.py` | `risk_score_v91` + live `risk_score`/`risk_level` from the `model_calibration` v0.9.1 row (+ the v0.8.5 FP-cap / ghost-boost post-patch) | superseded 2026-10-22 (look-ahead features); kept for rollback |
| (the full v0.8.5 scorer) | `risk_score_v8` | never located; v0.8.5 survives only as the frozen `risk_score_v8` column (rollback source) |

## Hard guardrails — DO NOT accept a rescore that violates any of these
- `intercept < −0.5` (v0.9.2 = −3.6328; v0.9.1 = −2.1544; v0.8.5 = −2.6157)
- `c_pu > 0.30` (v0.9.2 = 0.4360; v0.9.1 = 0.4388; v0.8.5 = 0.32)
- High-risk rate within OECD **2–15%** (v0.9.2 = 9.94%; v0.9.1 ≈ 9.9% after the post-patch)
- **Gate B** (owner, 2026-10-13; replaces the unreproducible `Brier ≤ 0.1128`):
  Brier at natural prevalence (1:84, gold hold-out) after one val-only
  prior-shift logit offset must be non-inferior to v0.8.5 (upper 95% CI of Δ ≤
  +0.0005); PR-AUC@1:84 ≥ v0.8.5; saturation at 1.0 ≤ 86,405 (counted on the capped
  `risk_score_v92`; the display `risk_score` has 0 by construction — check ties at max there). ECE is reported,
  not gating. Check: `_v09/v091/prod/verify_v091.py`.
- No temporal/label leakage (v5.1's 0.957 AUC was leakage; v0.8.5 uses a
  vendor-stratified split). AUC-circularity caveat: 989/1,417 GT cases are
  `model_discovery` origin — dedupe + pin the non-model-discovery gold set as
  the held-out anchor before trusting any AUC uplift.

## Provenance of the model artifact
- The calibration row lives in `model_calibration` (`model_version='v0.9.2'` since 2026-10-23;
  before it `'v0.9.1'`, installed by `score_v091.py --install-calibration <run>`; formerly `'v0.8.5'`,
  `sector_id=0` — **NOT** `sector_id IS NULL`; the older convention used NULL,
  which silently served v6.0 to read-path SHAP until the 2026-06-11 fix; see
  `backend/api/services/active_model.py`).
- Coefficients are stored as `{"names":[...],"values":[...]}` (v0.8.5),
  vs the older flat `{name:value}` dict.

## If you must rescore
1. Confirm you are running **`_v10/score_v092.py`** (NOT `score_v091.py`, NOT a V6 script above).
2. Verify the hard guardrails BEFORE writing (the scorer refuses intercept / c_pu /
   HR violations; Gate B was the v0.9.1 acceptance check, `_v09/v091/prod/verify_v091.py`;
   v0.9.2 was accepted by the signed rematch, `_v10/RESULT_2.md`).
3. Back up the DB first: on prod `sqlite3 /var/lib/rubli-db/RUBLI_DEPLOY.db ".backup <file>"`
   (WAL-safe) + `PRAGMA quick_check` on the copy; never a plain `cp` of a live WAL DB.
4. Recompute downstream: `vendor_stats`, `institution_stats`,
   `feature_importance` (`model_version='v0.9.2'`), the v0.9.2 waterfall means
   (`python -m scripts.precompute_entity_v10_means <DB>`), the /aria?ver=mapa «why it scores high»
   aspects (`python -m scripts.precompute_aria_drivers --db <DB>`, ~minutes; table `aria_vendor_drivers`,
   per-vendor v10 input means ranked within the vendor's sector — without it the rows show no model aspect),
   ARIA queue, the risk-keyed precomputes (full list in `_v09/v091/prod/RUNBOOK.md`), and
   El Mapa's Z2 register: `python -m scripts.precompute_institution_vendor_register
   --db <DB>` (~30 s; also after any ETL / entity-resolution change — it stores
   per-vendor risk and flag counts at rest), and the institution dossier's spine:
   `python -m scripts.precompute_institution_vendor_year --db <DB>` (~25 s; stores
   per-cell risk sums too), and /captura's «La mitad»:
   `python -m scripts.precompute_captura_majority --db <DB>` (~20 s on the prod copy, one
   INSERT…SELECT; each buyer-year ≥ 100 MDP and its largest supplier → `captura_majority`;
   also after any ETL / entity-resolution change; `/captura/majority` answers 503 and the
   page hides the section until it exists). It reads `captura_pairs` at request time for the
   «cautiva» seal, so run it after `scripts/precompute_captura.py --write`. And the contract dossier's
   «top X % de su sector»: `python -m scripts.precompute_sector_pct --db <DB>` (side table
   `contract_sector_pct`, PERCENT_RANK within sector; stale until rerun, absent = the line hides).

## «Gasto a ciegas» (/gasto-a-ciegas, formerly «Lo que no se ve» /no-se-ve) — budget visibility precompute

Not a risk score: Cuenta Pública exercised spend (cap. 2·3·5·6, partida 46101 trusts) per entity × year against the
register's visible contracts. Tables `budget_ur_map`, `budget_exercised`, `budget_visibility`, `budget_visible_top`
(definitions in `backend/scripts/precompute_budget_visibility.py`); read by `GET /api/v1/no-se-ve` and
`/no-se-ve/{entity_key}` (503 until the tables exist). Prod order, on the VPS:
1. Download the six SHCP CSVs (≈ 855 MB; the server omits its intermediate certificate, hence `-k`, fine for public
   open data):
   `mkdir -p /var/lib/rubli-jobs/cuenta_publica && cd /var/lib/rubli-jobs/cuenta_publica && for y in 2020 2021 2022 2023 2024 2025; do curl -k -sS -o cp$y.csv "https://www.transparenciapresupuestaria.gob.mx/work/models/PTP/DatosAbiertos/BD_Cuenta_Publica/CSV/cuenta_publica_${y}_gf_ecd_epe.csv"; done`
   (`cp2024.csv` is already there). Each file 100–330 MB; the script refuses a year whose total is outside 5–15 billones.
2. Back up the DB (`.backup`, WAL-safe), then build, passing local paths:
   `python -m scripts.precompute_budget_visibility --db /var/lib/rubli-db/RUBLI_DEPLOY.db --csv /var/lib/rubli-jobs/cuenta_publica/cp202{0,1,2,3,4,5}.csv`
   (~70 s on the prod copy; CSVs streamed, ~30k aggregated rows; one INSERT…SELECT over contracts for
   `budget_visibility` and one for `budget_visible_top`; all four tables replaced in one transaction).
3. After any ETL / entity-resolution change: rerun without `--csv` (reuses `budget_exercised`).
4. Restart the API or wait 1 h (app_cache TTL). Check: `/no-se-ve` → `entities[0].years` 2022 = 179,464 MDP exercised,
   9,437 MDP visible. Self-check: `python -m scripts.precompute_budget_visibility --demo`.
   Local QA: `--db <prod copy> --out-db <side.db>` (the copy is opened read-only).

See `docs/ML_MODEL_ANALYSIS_2026-06-11.md` for the full model analysis and the
v0.9 retrain plan (RT-1..5).
