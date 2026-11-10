# Model Card: RUBLI Risk Indicator v0.9.1

> **SUPERSEDED 2026-10-23 by `docs/MODEL_CARD_v0.9.2.md`** — v0.9.1's lead was look-ahead from all-years features (`_v10/RESULT_2.md`); do not quote its 0.852 as current performance.

**Owner:** RUBLI Project (open source) · **Date:** 2026-10-22 · **Status:** production (promoted 2026-10-13) · **Supersedes:** `docs/MODEL_CARD_v6.1.md`
**Contact:** rubli.xyz (source: MODEL_CARD_v6.1.md header)

Source tags used below: **[CLAUDE]** = `CLAUDE.md` «Risk Model — v0.9.1» · **[CAL]** = `_v09/v091/prod/calibration_1004_PROMOTED.json` · **[FROZEN]** = `_v09/v091/prod/results_v91_frozen.json` · **[SIGNOFF]** = `_v09/v091/SIGNOFF.md` · **[SCORING]** = `docs/SCORING.md` · **[HORIZON]** = `docs/DATA_HORIZON_2026-10-22.md` · **[V10]** = `_v10/RESULT.md` on `origin/model/v010-build` · **[BRIEF]** = lead's brief of 2026-10-22 (not re-queried; DB not read).

## Resumen (ES)

El modelo v0.9.1 produce, para cada contrato federal de CompraNet (2002 a 28-sep-2025), un **indicador de riesgo** entre 0 y 1. Es una regresión logística ElasticNet con corrección PU (positivo-sin-etiquetar). Sirve para **ordenar qué revisar primero**; no es una prueba, no es una probabilidad de corrupción y no sustituye una investigación. Los contratos de ComprasMX posteriores a esa fecha **no tienen indicador** («sin indicador»). La métrica de validación (AUC 0.852) se midió en un conjunto apartado de solo 106 proveedores con casos documentados, por lo que es una cifra imprecisa (la mejora frente a v0.8.5, +0.043, tiene un intervalo de confianza de 95 % de +0.001 a +0.092); una prueba temporal hacia adelante (v0.10) no pudo separar si v0.9.1 es mejor o si usa información del periodo evaluado (§ 7). Las secciones siguientes están en inglés.

## 1. Model details

- **Type:** ElasticNet logistic regression + Positive-Unlabeled (PU) correction; one global model. Score = `min(sigmoid(b0 + β·z) / c, 1)` [SIGNOFF]. v0.9.1 = v0.9 with a "Stage-4b" tempering of the linear predictor [SIGNOFF].
- **Run:** `CAL-v91-202610131004`, promoted 2026-10-13 [CAL, CLAUDE].
- **Parameters:** intercept −2.1544 [CAL]; c_pu 0.4388 [CAL]; temperature T = 0.484 = min(validation-only Platt slope at natural prevalence 0.497, largest T with saturation ≤ v0.8.5 = 0.484); T is already folded into the stored coefficients and the scorer applies no separate T; the calibration field `platt_slope` stores the final T (0.4844), not the raw Platt slope [CLAUDE, SIGNOFF, CAL]; ElasticNet C = 0.003725, l1_ratio 0.919 [CAL `hp`].
- **Features:** 27 inputs, 21 with non-zero coefficient [CLAUDE]. v0.8.5's 21 features + 4 partida leave-one-out features + RT-4 as-of breadth/HHI (`contract_features_v9`) [SCORING].
- **Largest coefficients (tempered, standardized) [CAL]:** price_volatility 0.729 · price_ratio 0.449 · rt4_log 0.290 · vendor_concentration 0.242 · cobid_herfindahl 0.193. Negative: amount_residual_z −0.142, recency_z −0.092, sector_spread −0.052.
- **Output levels (thresholds 0.60 / 0.40 / 0.25) [CLAUDE]:** Critical ≥ 0.60 · High ≥ 0.40 · Medium ≥ 0.25 · Low < 0.25.
- **Scorer:** `backend/scripts/score_v091.py` → `risk_score_v91`, `risk_score`, `risk_level` [SCORING].

## 2. Intended use

- **In scope:** triage for journalists, auditors and researchers deciding which federal contracts, vendors or institutions to examine first; aggregate views (sector, year, institution) of how many contracts carry a high indicator.
- **Reading rule:** the output is a **risk indicator** («indicador de riesgo»): similarity of a contract's procurement pattern to patterns seen around documented cases. It is not proof, not an accusation, not "X % probability of corruption" [CLAUDE hard rule 5].
- **Out of scope / do not use for:**
  - Naming a vendor or official as corrupt, or using the score as the sole basis for a legal, sanction, debarment or press claim without independent documents.
  - Treating the 0–1 value as a calibrated probability (the PU constant and flag-rate policy shape it; § 5).
  - Detecting capture of a buyer by a vendor: `rt4_log` (vendor breadth) works against capture patterns; use ARIA P6 / `/captura` [CLAUDE].
  - Contracts after 2025-09-28 (ComprasMX): unscored [HORIZON].
  - State, municipal or other non-federal buyers: not in the training population.
  - Comparing scores across COMPRANET structures A–D as if equally reliable (§ 6).
  - Automated decisions about people or firms.
- **Users:** investigators and analysts reading the RUBLI interface or open dataset.

## 3. Training data and labels

- **Population:** ~3.05M dated federal CompraNet contracts with vendor, 2002 to 2025-09-28 [HORIZON]. Final-run validation split: 12,651 positives, 297,640 negatives (negatives weighted ×3.57 toward ~1:84) [FROZEN `val_big`].
- **Labels (PU):** positives are contracts of vendors in the ground-truth table of documented corruption cases; everything else is *unlabeled*, not negative, hence the PU correction (c_pu). Labels mark a vendor's involvement in a case, not that every contract was corrupt (`docs/GROUND_TRUTH.md`, which is dated March 2026 and lists 33 cases; the current case count is **not sourced here**).
- **Label-origin caveat:** 989 of 1,417 ground-truth cases are of `model_discovery` origin [SCORING, "AUC-circularity caveat"; counts as written there]. AUC uplifts must be read against the non-`model_discovery` gold set. The gold hold-out may include `model_discovery` cases, so part of the AUC gain can be circular; SCORING says to pin the non-`model_discovery` set before trusting any uplift. The strict set (44 vendors, AUC 0.846 [SIGNOFF:68-72]) is probably the less exposed figure (that it is the non-`model_discovery` subset is unconfirmed).
- **Gold hold-out (evaluation only):** 106 vendors, 3,566 positive contracts, vendor-stratified split [SIGNOFF § 1].
- **Known gaps:** concentration of positives in a few large cases (IMSS, Segalmex, COVID: 99.1 % of training contracts at the v4.0 stage, `docs/GROUND_TRUTH.md`; current share not sourced) and weak coverage of small-vendor and single-use intermediary schemes (UAB JORINIS scored 7 %, `docs/GROUND_TRUTH.md`).
- **Data validation:** values > 100B MXN rejected, > 10B flagged [CLAUDE]. 15 decimal-error contracts corrected or excluded 2026-10-20 [HORIZON, BRIEF].

## 4. Evaluation

Metrics: AUC (ranking); PR-AUC at natural prevalence 1:84 (precision matters when positives are rare); Brier/ECE (calibration). Base rate on the gold evaluation: 3,566 positives vs 300,000 negatives, about 1:84 [SIGNOFF § 1]. CIs are 95 % vendor-cluster bootstrap [SIGNOFF].

| Metric (gold hold-out) | v0.8.5 (baseline) | v0.9.1 | Source |
|---|---|---|---|
| AUC | 0.807 | **0.852** (Δ +0.043 [+0.001, +0.092]) | FROZEN, SIGNOFF |
| AUC, size-controlled | 0.750 | 0.806 (Δ +0.054 [+0.004, +0.110]) | FROZEN, SIGNOFF |
| AUC strict | 0.796 | 0.846 | FROZEN, CAL |
| PR-AUC @1:84 | 0.173 | 0.184 (Δ +0.010 [−0.011, +0.029]) | SIGNOFF |
| Brier @1:84, raw p (Gate A) | 0.0142 | 0.0205; constant predictor at base rate 0.0116 | SIGNOFF:68-72 |
| ECE @1:84, raw p | 0.057 | 0.097 | SIGNOFF:68-72 |
| Brier @1:84 after prior-shift offset (Gate B) | 0.01049 | 0.01051 (Δ +0.0000 [−0.0002, +0.0002]) | SIGNOFF |
| ECE after prior shift | 0.0041 | 0.0078 (Δ +0.0031 [+0.0009, +0.0050]); reported, not gating | SIGNOFF |
| Precision at top 100 | 0.78 | 0.62 (Δ −0.17 [−0.30, +0.02]) | FROZEN, SIGNOFF |
| Precision at top 500 / 1000 | 0.618 / 0.558 | 0.592 / 0.549 | FROZEN |
| Gold positives / negatives at ≥ 0.40 | 0.481 / 0.075 | 0.501 / 0.048 | FROZEN, CAL |
| Saturation at 1.0 (contracts) | 86,405 | 85,542 | SIGNOFF |

The gold hold-out has 106 vendors (3,566 contracts), and observations are clustered by vendor, so the effective sample is about 106. The AUC gain over v0.8.5 is +0.043 (95% vendor-cluster CI [+0.001, +0.092]), which is borderline; the PR-AUC gain (+0.010 [−0.011, +0.029]) is not distinguishable from zero. Several variants (4 RT-4 forms × 4 calibrators) were compared on this same hold-out, so the reported figures are mildly optimistic.

The headline AUC 0.852 is the gold hold-out figure printed in the interface [CLAUDE]. A constant predictor at the 1:84 base rate has Brier 0.0116, so Brier differences are small in absolute terms [SIGNOFF].

**Sliced results.** The only sourced slice is the share of contracts flagged high-risk (≥ 0.40) by COMPRANET structure era, v0.9.1 [FROZEN `era_hr`, v91 key, checked 2026-10-22]: A (2002–10) 7.8 % · B (2010–17) 8.4 % · C (2018–22) 11.8 % · D (2023–25) 13.5 %. SIGNOFF:239-244 prints 7.3 / 8.2 / 12.3 / 13.6, which are the v0.9 values in the same JSON (SIGNOFF labels that table «identical to v0.9»); the card uses the v0.9.1 values. Era flag rates are the share of contracts at or above 0.40; they are not accuracy by era. AUC or precision by era, sector or institution type are **not reported** (no signed source).

**Temporal / forward evaluation: not reported for v0.9.1.** No signed forward metric exists for v0.9.1 itself. In the v0.10 pre-registered test, v0.9.1 scored AUC 0.907 on a 2019–2025 forward chain (174 positive vs 57,169 negative vendor-years) [V10, G3], but v0.9.1 is not an as-of model and that number may include look-ahead. Do not quote 0.907 as out-of-time performance.

## 5. Calibration

- **Gate B** (owner decision 2026-10-13) replaced the unreproducible `Brier ≤ 0.1128` gate: Brier at 1:84 after one validation-only prior-shift offset must be non-inferior to v0.8.5 (upper CI of Δ ≤ +0.0005), PR-AUC@1:84 ≥ v0.8.5, saturation ≤ 86,405; ECE reported only [SCORING, SIGNOFF]. Per [CAL `gates.val`] passed: B-Brier, PR-AUC, saturation, HR 2–15 %, intercept < −0.5, c_pu > 0.30. Gate B was defined after the original raw-probability Brier gate (Gate A) was found unattainable; it was not fixed before the models were evaluated. It was approved by the project owner on 2026-10-13. v0.9.1 meets the non-inferiority criterion (Brier Δ +0.0000, 95% CI [−0.0002, +0.0002]). Under a strict 'Brier ≤ v0.8.5' reading it fails on the gold hold-out by 0.00002 (0.01051 vs 0.01049), within noise, and passes on validation [CAL `gates.gold`, SIGNOFF].
- **Tempering (Stage-4b):** T = 0.484 = min(validation-only Platt slope at natural prevalence 0.497, largest T with saturation ≤ v0.8.5 = 0.484), applied to the linear predictor and already folded into the stored coefficients (the scorer applies no separate T); intercept then re-pinned to a 10 % flag rate. The map is monotone: ranking and the ≥ 0.40 set are identical to v0.9 [SIGNOFF].
- **What the 0–1 value is:** shaped by the PU constant and the flag-rate policy; not a calibrated probability. As a raw probability the score is poorly calibrated: Brier at 1:84 is 0.0205 (v0.8.5: 0.0142), worse than a constant predictor at the base rate (0.0116), and ECE is 0.097 (v0.8.5: 0.057). It is a ranking indicator only. After a validation-only prior-shift offset, Brier is on par with v0.8.5 and ECE is worse (0.0078 vs 0.0041). Under the original Gate A no v0.9.x variant could pass, because Brier on raw p is set mainly by c_pu and the flag rate [SIGNOFF § 1-2].
- **PU correction assumptions:** the correction presumes that labeled positives are a random sample of all true positives. They are not: they are cases that were documented, which favors large, visible suppliers. The constant c_pu = 0.4388 is a scaling constant that depends on the training sampling ratio (about 1:2), not an estimate of the share of true cases that are labeled. The intercept is then set so that 10 % of contracts are flagged. The output scale is therefore a policy choice, and c_pu > 0.30 is a guardrail on that arithmetic.
- **Distribution after the batch 3b rescore (2026-10-22) [BRIEF]:** critical 148,254 · high 155,130 · medium 908,087 · low 1,839,823 · unscored 5,849; high-risk rate 9.94 %. Pre-rescore reference: Critical 4.8 % · High 5.1 % · Medium 29.8 % · Low 60.3 %, HR 9.9 % (OECD range 2–15 %) [CLAUDE]. Rescore followed the 15 amount corrections; 1,523,056 scores rewritten [`docs/RELEASE_PLAN_NOV_2026.md`].

## 6. Limitations and failure modes

- **Structure A (2002–10):** RFC coverage 0.1 % (B 15.7 %, C 30.3 %, D 47.4 %); network and vendor-identity features are weak, risk is underestimated [CLAUDE, `.claude/rules/data-validation.md`].
- **`rt4_log` selection bias:** `rt4_log` (number of agencies a supplier served before the contract year) is the third-largest coefficient (0.290). Among suppliers of similar size and age, those that had sold to many agencies appear more often in documented cases. This mostly reflects which cases get documented (large national medical and laboratory suppliers selling to dozens of IMSS and ISSSTE units draw press and audit attention) and the late career stage at which cases surface. It does not mean that serving many agencies is suspicious in itself. The factor works against single-agency capture, so capture is assessed separately (ARIA P6, `/captura`) [CLAUDE, CAL].
- **`institution_diversity`** is a concentration index (HHI); its negative coefficient means that breadth of institutions raises the score, not lowers it [SIGNOFF:157-161].
- **Top-of-list precision is lower than v0.8.5:** top 100 is 0.62 vs 0.78 (delta −0.17, 95% CI [−0.30, +0.02]). 72 of v0.8.5's 78 top-100 hits come from three gold vendors (CASANOVA VALLEJO, MAINBIT, EDENRED MEXICO). v0.8.5's random train/test split ignored the hold-out assignment, so it very probably trained on them; this was inferred from the split logic, not verified. From k = 500 onward the models are level [SIGNOFF:148-152, FROZEN `gold_top100`].
- **Medium tier grew:** the share of contracts scored at or above Medium (≥0.25) rose from 27 % to 40 %. The Medium band itself went from 16 % to 30 %; High+Critical stayed about 10 %. 26 % of contracts changed level versus v0.8.5, mostly Low→Medium [SIGNOFF:68-72, :225-226].
- **Probable look-ahead in features:** stored `contract_z_features*` are contemporaneous/all-years and v0.9.1 trains on all years; the v0.10 test points to leakage on never-seen vendors (AUC 0.945) but states this is interpretation, not a gate result [V10]. The gold hold-out is vendor-stratified, not time-stratified.
- **Label circularity** (989/1,417 `model_discovery` cases) [SCORING] and **concentration** in a few large cases.
- **Small-vendor and single-use intermediary schemes** are poorly detected (UAB JORINIS, `docs/GROUND_TRUTH.md`).
- **Coverage:** CompraNet frozen at 2025-09-28 [HORIZON]; 213,392 ComprasMX contracts (2025–26) are **unscored** («sin indicador») [HORIZON]; state and municipal buyers not covered; 5,849 CompraNet contracts unscored [BRIEF].
- **Data errors:** official data contains decimal errors; rejection/flag rules apply but residual errors are possible.

## 7. The v0.10 attempt (not promoted)

A model with strictly as-of features was tested once under a pre-registration (forward chain 2019–2025; 174 positive vs 57,169 negative vendor-years) [V10]:
- Passed: G1 (M1 0.857, CI [0.800, 0.902]); G2 (beats the best label-free baseline by +0.045 [0.015, 0.085]).
- Failed: G3 (v0.10 0.746 vs v0.9.1 0.907; diff CI [−0.230, −0.098]); G4, narrowly (ΔBrier upper CI +0.0008 uncapped, +0.0003 censored, limit +0.0005); G5 (hard-negative share 6.8 % vs 4.6 %).
- **Outcome per the pre-registration: v0.10 does not ship; v0.9.1 stays live; ComprasMX stays unscored** [V10]. The test cannot separate "v0.9.1 is better" from "v0.9.1 leaks". Next step, needing a new pre-registration: refit v0.9.1 on the same as-of features and folds ("v0.9.1-as-of") [V10].

## 8. Deployment, monitoring, rollback

- **Serving:** batch scoring into `contracts.risk_score*`; downstream tables (`vendor_stats`, `institution_stats`, ARIA queue, precomputes) are refreshed after any rescore (`_v09/v091/prod/RUNBOOK.md`) [SCORING].
- **Hard guardrails (scorer refuses otherwise):** intercept < −0.5, c_pu > 0.30, HR within 2–15 % [SCORING].
- **Monitor:** HR (currently 9.94 %), tier shares, saturation at 1.0 (≤ 85,542 [SIGNOFF]), per-era HR, `_v09/v091/prod/verify_v091.py` (Gate B check).
- **Rollback:** v0.8.5 is preserved in `risk_score_v8` (rollback source); older `risk_score_v6`, `risk_score_v5` (leakage; do not use), `risk_score_v4` [CLAUDE]. Rollback trigger (proposed here, not a signed policy): any guardrail breach, or HR outside 2–15 %.
- **Versioning:** `risk_model_version='v0.9.1'`; calibration row in `model_calibration` (`model_version='v0.9.1'`, `sector_id=0`) [SCORING].

## 9. Ethical considerations

Scores attach to firms and, indirectly, to people; a high indicator can harm a legitimate vendor. Mitigations: «indicador de riesgo» wording, no probability claims, claims sourced to documents rather than masking names, and the limits listed above. No sensitive personal attributes are model inputs; RFC is used for entity matching and is not exposed (`.claude/rules/security.md`). Firm size: size-controlled AUC 0.806 vs 0.852 overall [FROZEN]; the model may underperform on small vendors (§ 3).
