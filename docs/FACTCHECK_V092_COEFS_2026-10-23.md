# Fact-check — v0.9.2 coefficients shown in the UI (2026-10-23)

**Claims checked:** every v0.9.2 coefficient, count, hyper-parameter and feature-set statement written into the
model-explanation UI (Methodology «La balanza», RiskExplainer, glossary `risk_factors`, `price.json`,
`vendors.json` co-bid note, `common.json` `legendCoefficients`, Methodology findings / features copy).

**Primary source:** the frozen artifact the active scorer loads.

- Scorer: `_v10/score_v092.py` (branch `origin/model/v010-build`, commit `f7e00a8d`). It reads
  `R["policy"]["v091_asof"]` from `--model rematch_result.json` (`score_v092.py:67-68`), guards intercept/c_pu
  (`:69`) and scores with `betas_raw` (`:31-32`, `:43-44`). Run id `CAL-v92-asof-20261022` (`:22`).
- Artifact: `_v10/rematch_result.json`, sha256 `6c92bb85879d3a6a96afa506627cbaa5798157f2222b0fef8d12d973a035d49b`,
  `policy.v091_asof` at lines 660-720. The file is git-ignored (commit `91447f0e`); the copy read is
  `D:/Python/yangwenli/.claude/worktrees/v010/_v10/rematch_result.json`.
- Decision: `_v10/RESULT_2.md` (commit `f67efe91`), `docs/SCORING.md` on `prod/fix-hot-indexes` (`00a19241`).

**Display convention.** v0.9.1's UI showed T × standardised β (`_v09/v091/train_v91.py:117`, `meta['betas'] =
a1 * coef` with `a1 = T`; e.g. price_volatility +0.729 = `calibration_1004_PROMOTED.json`). For v0.9.2 the same
quantity is `T × betas_standardised` (`test_v10.py:257`). The scorer's `betas_raw` are `T × β / sd`
(`test_v10.py:258`), i.e. per raw unit; they are not shown as the ledger values. Rounded to 3 decimals.

T = 0.5297044633136915 (`rematch_result.json:667`).

| UI key / glossary key | v0.9.2 feature | β standardised (source line) | Shown = T × β | Rank (by abs) | Rating |
|---|---|---|---|---|---|
| institutionsServedPrior / — | `rt4_log` | 1.2794335231393739 (`:695`) | +0.678 | 1 | Verified |
| priceVolatility / price_volatility | `z_price_volatility` | 0.9534541222953854 (`:682`) | +0.505 | 2 | Verified |
| instHhiPrior / institution_diversity | `inst_hhi_prior` | 0.5079044224143597 (`:696`) | +0.269 | 3 | Verified |
| priceRatio / price_ratio | `z_price_ratio` | 0.48282449829587615 (`:681`) | +0.256 | 4 | Verified |
| sectorSpread / sector_spread | `z_sector_spread` | -0.3050983037640963 (`:685`) | −0.162 | 5 | Verified |
| cobidHerfindahl / (vendors note) | `cobid_herfindahl` | -0.2706348539396196 (`:697`) | −0.143 | 6 | Verified |
| vendorConcentration / vendor_concentration | `z_vendor_concentration` | 0.18781660643626416 (`:683`) | +0.099 | 7 | Verified |
| networkMembers / network_member_count | `z_network_member_count` | 0.17189836185281446 (`:686`) | +0.091 | 8 | Verified |
| singleBid / single_bid | `z_single_bid` | 0.14899804164024838 (`:688`) | +0.079 | 9 | Verified |
| sameDayContracts / same_day_count | `z_same_day_count` | 0.13714497070579573 (`:687`) | +0.073 | 10 | Verified |
| recencyZ / — | `recency_z` | -0.13333684760535566 (`:691`) | −0.071 | 11 | Verified |
| directAward / direct_award | `z_direct_award` | 0.09654569116364341 (`:689`) | +0.051 | 12 | Verified |
| partidaPriceResidual / — | `partida_price_residual_z` | 0.07804941580887476 (`:692`) | +0.041 | 13 | Verified |
| partidaSingleBid / — | `partida_single_bid_z` | -0.03660492946879119 (`:693`) | −0.019 | 14 | Verified |
| winRate / win_rate | `z_win_rate` | 0.013436763782162568 (`:684`) | +0.007 | 15 | Verified |
| partidaDirectAward / — | `partida_direct_award_z` | -0.005109748152985829 (`:694`) | −0.003 | 16 | Verified |
| yearEnd / year_end | `z_year_end` | 0.0 (`:690`) | 0.000 | zero | Verified |

| Other figure shown | Value | Source | Rating |
|---|---|---|---|
| 17 features, 16 non-zero, 1 exact zero | 17 / 16 / 1 | `rematch_result.json:680-698`; `common.py:17-23` | Verified |
| T | 0.530 | `rematch_result.json:667` | Verified |
| C, l1_ratio | 0.0037, 0.919 | `score_v092.py:94` (0.00372526980389729, 0.9188163115865666); `rematch_v10.py:33` | Verified |
| c_pu (ledger header comment) | 0.436 | `rematch_result.json:662` | Verified |
| Run id | CAL-v92-asof-20261022 | `score_v092.py:22` | Verified |
| Breadth: 3 → 10 prior institutions ≈ +0.60 logit | 0.5916 × (ln 11 − ln 4) = 0.598 | `betas_raw.rt4_log` `rematch_result.json:714`; `rt4_log = log1p(n_inst_prior)` `build_v10.py:247` | Verified (derived) |
| No-history vendor counts as fully concentrated (1.0) | NULL fill 1.0 for `inst_hhi_prior`, `cobid_herfindahl` | `rematch_result.json:717-720` neutral_fill; `common.py:24`; `build_v10.py:248,265` | Verified |
| cobid_herfindahl = prior-years co-award partners | as-of | `build_v10.py:16-17`; `AMENDMENT_01.md:7` | Verified |
| recency = days since previous contract with the same institution | as-of | `build_v10.py:14-15` | Verified |
| network members active before Y | as-of | `PLAN.md:11` | Verified |
| v0.9.2 applies no post-score adjustment | no ghost boost / FP cap | `docs/SCORING.md` (`00a19241`): «No v0.8.5 post-patch» | Verified |
| v0.9.2 scores ComprasMX contracts (structure E) | 0 < amount ≤ 100B with a `contract_features_v10` row | `score_v092.py:8-10, 35-37`; `docs/SCORING.md` (`00a19241`) | Verified (code); prod row counts not re-queried here |

**Dropped v0.9.1 features (10)** — each named in the UI as «not in v0.9.2»:

| Feature | v0.9.1 β shown as «was» | Reason stated | Source |
|---|---|---|---|
| ad_period_days | +0.053 | opening dates only in ComprasMX → source indicator | `AMENDMENT_01.md:5` |
| amount_residual_z | −0.142 | no definition in repo, cannot be reproduced | `AMENDMENT_01.md:8` |
| industry_mismatch | +0.032 | verified-industry coverage 22.6% GT vs 13.7% others | `AMENDMENT_02.md:7-9` |
| has_partida, pub_delay_z, co_bid_rate, price_hyp_confidence, institution_risk, amendment_flag | +0.051, −0.008, 0, 0, 0, 0 | era proxy / table or column missing / no field in ComprasMX | `PLAN.md:13` |
| institution_diversity | +0.0004 | year-scoped bug; `inst_hhi_prior` is the correct one | `PLAN.md:13` |

v0.9.1 «was» values: `_v09/v091/prod/calibration_1004_PROMOTED.json:8`.

**Renamed (rebuilt as of the contract):** `price_ratio` … `year_end` → `z_*`; `partida_*_z_loo` → `partida_*_z`.

**Unverified / caveats**
- The prod DB's `model_calibration` row for v0.9.2 stores `betas_raw` (`score_v092.py:93`), not the T × standardised
  values shown; anyone comparing the UI to that row must convert (`raw = T·β/sd`).
- RiskExplainer «Strong/Moderate/Weak» evidence labels are literature labels, not re-derived.
- Statements in published stories (`lib/story-content.ts`), `pages/Journalists.tsx` and `pages/ModelTransparency.tsx`
  still quote v0.9.1 / v0.8.5 weights; not changed in this pass.
