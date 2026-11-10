# DIAG — `/contracts/{id}/risk-explain` vs the stored score (2026-11-09)

Branch `fix/risk-explain`. Code only: no DB job, no rescore.

## Symptom (ORANGE)

`GET /api/v1/contracts/2710162/risk-explain` returned logit 0.7536. σ(0.7536)/0.436 ≈ 1.56, capped at 1.0, yet
the stored `risk_score` is 0.939. Two terms looked unstandardised: `rt4_log` 0.693 (= log1p(1)) and
`inst_hhi_prior` 1.000. The reason «sold only to Fonatur» also read as pushing the score up.

## Reproduction (live API, read-only GETs)

The display score below is `display(q)` from `_v10/score_v092.py`, where q = σ(logit)/c_pu:
q stays as is up to 0.60, and above that it becomes 0.60 + 0.35·tanh((q−0.60)/0.46).

| contract | API logit | stored risk_score | naive min(q,1) | display(q) | display − stored |
|---|---|---|---|---|---|
| 100000  | −2.5557 | 0.1652 | 0.1652 | 0.1652 | −1e-5 |
| 500000  | −2.6067 | 0.1576 | 0.1576 | 0.1576 | −1e-5 |
| 900000  | −3.1988 | 0.0899 | 0.0899 | 0.0899 | 0 |
| 1300000 | −3.2563 | 0.0851 | 0.0851 | 0.0851 | 0 |
| 1700000 | −2.6038 | 0.1580 | 0.1580 | 0.1580 | 0 |
| 2100000 |  0.3415 | 0.9231 | **1.0000** | 0.9231 | −1e-5 |
| 2500000 | −2.8268 | 0.1282 | 0.1282 | 0.1282 | 0 |
| 2710162 |  0.7536 | 0.9394 | **1.0000** | 0.9394 | 0 |
| 2900000 | −2.2467 | 0.2193 | 0.2193 | 0.2193 | 0 |
| 3050000 | −2.3226 | 0.2047 | 0.2047 | 0.2047 | −1e-5 |
| 3150000 | −2.0547 | 0.2605 | 0.2605 | 0.2605 | −1e-5 |

Result: the logit already reproduces the stored score to within 1e-5 on all 11 contracts. The apparent
mismatch appears only for Critical contracts (q > 0.60). It comes from the display squash, not from the logit.

## Root cause

1. **There is no standardisation bug.** The active model is v0.9.2 (`CAL-v92-asof-20261022`). Its scorer is
   `_v10/score_v092.py`, which uses raw-unit betas over `contract_features_v10`, with T folded in and with
   NULLs filled as `inst_hhi_prior`=1 and `cobid_herfindahl`=1. `backend/scripts/score_v091.py:146-147`
   standardises these features, but that is the **v0.9.1** scorer and it is not active. CLAUDE.md «Risk Model»
   still names v0.9.1, which is stale; `docs/SCORING.md` is correct. The explain endpoint and the stored score
   read the same run.
2. **The endpoint never returned the score it explains.** The stored `risk_score` is the display score, while
   the endpoint exposed only `logit` and `pu_correction`. Anyone inverting it with min(σ/c, 1) reads every
   Critical contract as wrong.
3. **The reason direction was backwards.** In `backend/api/services/contract_service.py`, inside
   `get_risk_explanation` on the v0.9.2 branch, `z_score` was the raw input x and `contribution` was β·x.
   For inputs that are always positive, β·x > 0 always. So «one prior institution» (rt4_log = log1p(1), far
   below the mean) was listed as +0.41 and phrased as «vende a más dependencias que lo habitual». The
   vendor/institution waterfall had already been centred on 11-05 (`v10_centred_means`). The contract path
   had not.

## Fix

- `active_model.py`: new `v10_scores(logit, c_pu)` returns (min(q,1), display(q)), with K = 0.46 frozen as in
  the scorer.
- `contract_service.get_risk_explanation` (v0.9.2):
  - Every term is centred on the population mean (`v10_population_means`, the same source the waterfall
    uses): `z_score` = x − μ, `contribution` = β·(x − μ), and the new `value` field holds the raw x.
  - New response fields: `baseline_logit` (the mean contract) with baseline_logit + Σ contribution = logit,
    `model_score` (= `risk_score_v92`) and `display_score` (= the stored `risk_score`).
  - `logit` is unchanged.
- `routers/contracts.py`: the response model gains the three fields. The `single_bid` labels now read
  «Single Award» (single-bid rule).
- Frontend:
  - `types.ts` adds the fields.
  - `ActaLedger.tsx` starts its Σ line from `baseline_logit` and prints «base (contrato promedio)».
  - `featureLabels.ts`: `single_bid` and `partida_single_bid_z_loo` now say «un solo adjudicado» instead of
    «un solo participante».
  - `whyLine` / `pickSignals` (contract dossier «por qué») need no change: they read the sign of z and of the
    contribution, which are now honest.
- Test: `backend/tests/test_explain_v092.py::test_contract_explanation_matches_the_display_score_and_is_centred`.
  It failed first (`KeyError: display_score`) and passes after the fix. It covers a prod-like row (rt4 =
  log1p(1), HHI = 1, q > 0.60), with display_score within 0.005 of the stored score, a centred sum equal to the
  logit, and rt4_log < 0.

After the fix, `display_score` equals the "display(q)" column above for every tested contract, at most 1e-5
from the stored value. For 2710162, rt4_log will read as lowering the score whenever log1p(1) is below the
population mean.

## Not fixed (noted)

- `frontend/src/lib/portadaReading.ts:101-103` still says «Hubo un solo participante». This overlaps with
  diag-singlebid, so it was left for that pass.
- CLAUDE.md «Risk Model» still describes v0.9.1 as active.
- The frontend gate (tsc/build) was not run because the worktree has no node_modules. The TS changes are
  optional fields plus `??`. Run the gate before merging.

## Deploy

Merge `fix/risk-explain` and run `bash /opt/rubli/scripts/deploy-safe.sh` (backend and frontend). No DB step.
The first explain call per process computes population means from `entity_v10_means`, which already exists on
prod for the waterfall. Check after deploy: `curl /api/v1/contracts/2710162/risk-explain` should give
`display_score` 0.9394 and `baseline_logit + Σ contribution = logit`.
