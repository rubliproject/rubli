# Model Card: RUBLI Risk Indicator v0.9.2

**Owner:** RUBLI Project (open source) · **Date:** 2026-10-23 · **Status:** production (ships 2026-10-22/23 per the signed rule in pre-registration 2) · **Supersedes:** `docs/MODEL_CARD_v0.9.1.md`
**Contact:** rubli.xyz (source: MODEL_CARD_v6.1.md header)

Source tags: **[R2]** = `_v10/RESULT_2.md` on `origin/model/v010-build` (commit `f67efe91`) · **[RJ]** = `_v10/rematch_result.json` (same commit; full CIs and policy) · **[P2]** = `_v10/PREREGISTRATION_2.md` (signed 2026-10-22) · **[R1]** = `_v10/RESULT.md` · **[PLAN]** = `_v10/PLAN.md` § B (as-of rule) · **[CARD91]** = `docs/MODEL_CARD_v0.9.1.md` · **[CLAUDE]** = `CLAUDE.md` · **[BRIEF]** = deploy session's brief to the copy agent, 2026-10-22 (not re-queried; DB not read). Claim-by-claim check: `docs/FACTCHECK_V092_2026-10-23.md`.

**Naming.** The test documents call this model **«v0.9.1-as-of»** [R2, P2]. It ships as **v0.9.2** [BRIEF]. Same model.

## Resumen (ES)

v0.9.2 produce, para cada contrato, un **indicador de riesgo** entre 0 y 1. Es la misma receta que v0.9.1 (regresión logística ElasticNet con corrección PU, los mismos hiperparámetros y la misma forma de etiquetar), pero ahora cada variable se calcula **solo con lo que se sabía antes del año del contrato**. v0.9.1 usaba variables calculadas con todos los años, incluidos los posteriores al contrato; una prueba pre-registrada mostró que su ventaja venía de esa información futura y no de habilidad (§ 7). La métrica de v0.9.2 es un **AUC encadenado hacia adelante**: se entrena con años anteriores y se evalúa en el año siguiente, de 2019 a 2025, proveedor-año por proveedor-año. Vale **0.827** (IC 95 % de 0.763 a 0.883); controlando por tamaño del proveedor, **0.741**. No es comparable con el 0.852 que se publicaba para v0.9.1: es otra prueba, más dura. Sirve para **ordenar qué revisar primero**; no es una prueba, no es una probabilidad de corrupción. **Qué ordena:** años-proveedor de empresas que después aparecen vinculadas a casos documentados; no detecta contratos corruptos (§ 1b). Ahora también puntúa los contratos de ComprasMX. Las secciones siguientes están en inglés.

## 1. Model details

- **Type:** ElasticNet logistic regression + Positive-Unlabeled (PU) correction; one global model [P2, CARD91].
- **Recipe:** v0.9.1's own hyper-parameters, nothing tuned: C = 0.003725, l1_ratio = 0.9188 [P2:10]. Labels: v0.9.1's labelling (all non-FP ground-truth links incl. `model_discovery`, curriculum/confidence weights, no hard negatives) [P2:15-16]. Same folds, cap, negative sampling and calibration code as v0.10 [P2:17].
- **As-of rule:** vendor history from **strictly prior years** (`contract_year < Y`, no same-year fallback); cross-sectional baselines on a trailing window [Y−2, Y], leave-one-out [PLAN § B]. So the year-Y contract itself is in its own year's baseline window only through the leave-one-out mean, never in its vendor-history features.
- **Features:** 17 — v0.9.1's features that have an as-of builder in `contract_features_v10` [P2:11-14]; 16 with non-zero coefficient (`z_year_end` = 0) [RJ `policy.v091_asof.betas_standardised`]. Absent vs v0.9.1 (no as-of builder): co_bid_rate, price_hyp_confidence, institution_risk, institution_diversity, amount_residual_z, pub_delay_z, has_partida; `industry_mismatch` dropped for leakage (AMENDMENT_02). No size features [P2:12-14].
- **Largest standardised coefficients [RJ]:** rt4_log +1.279 · price_volatility +0.953 · inst_hhi_prior +0.508 · price_ratio +0.483 · vendor_concentration +0.188 · network_member_count +0.172. Negative: sector_spread −0.305, cobid_herfindahl −0.271, recency_z −0.133. *[Correction 2026-10-30] Verified: these are standardised and un-tempered; the shipped scorer uses `policy.v091_asof.betas_raw` (raw units, tempering T folded in; `_v10/score_v092.py` docstring + l. 60), which is what prod serves at `/api/v1/analysis/model/calibration` (largest |β|: price_volatility 0.811 · inst_hhi_prior 0.771 · rt4_log 0.592 · price_ratio 0.456 · cobid_herfindahl −0.304).*
- **Calibration policy [R2:23-24, RJ]:** c_pu 0.436 (95 % CI 0.377–0.497) · T 0.530 (= saturation-bound T; the validation-slope T was 0.710, the smaller one is used) · intercept −3.633 (< −0.5, scorer guard) · flag rate (HR) 10.0 % · critical 5.2 % · saturation at 1.0 84,687 contracts (cap ≤ 85,542). NULL fill: inst_hhi_prior and cobid_herfindahl = 1.0, everything else 0 [RJ].
- **Output levels:** Critical ≥ 0.60 · High ≥ 0.40 · Medium ≥ 0.25 · Low < 0.25 (unchanged) [CLAUDE].
- **Versioning:** `model_calibration` row `model_version='v0.9.2'`, run `CAL-v92-asof-20261022`, AUC 0.8273, c_pu 0.43598, intercept −3.63283 [verified 2026-10-30 on prod `/api/v1/analysis/model/metadata` + `/model/calibration`; row re-installed 2026-10-28 with the display squash].

## 1b. What the labels are (correction 2026-11-02)

Source: `docs/GT_LABEL_AUDIT_2026-10-31.md`; fixes: `docs/GT_FIXES_2026-11-02.md`.

- A training positive is **every contract of a non-FP case vendor inside the case's years, with any buyer** (only 16 of 1,417 cases restrict the buyer). It is not a contract shown to be corrupt: 8 contracts in all of GT are named by an external source, and none of them is in the training set.
- About 9 % of cases (126, provenance A/B) have an independently verifiable source; ≈71–73 % of training positives come from cases without one.
- So the 0.827 forward-chained AUC (0.741 size-controlled) measures how well the model **ranks vendor-years of suppliers later linked to documented cases** above others. Do not describe it as detecting corrupt contracts or as trained on corrupt contracts.
- Known label defects at training time (fixed in GT 2026-11-02, **not** retrained): 20 L1-tightened windows never reached `fraud_year_*`; 261 ARIA-cited cases carried `case_origin = media_report`; 61 cases had no window (whole vendor book positive). v0.9.2 was trained on the 2026-10-22 snapshot and keeps these defects until a retrain.

## 2. Intended use

Unchanged from [CARD91] § 2, with two changes:
- **ComprasMX contracts are now scored** (every input exists as-of) [R2:23]. «Sin indicador» remains only for contracts still pending scoring and for amounts > 100B MXN (rejected) [BRIEF].
- **Do not compare v0.9.2 scores with v0.9.1 scores** contract by contract, or a v0.9.1 reading cited in an older story, memo or the 2026.10 dataset with today's number. They come from different features (§ 7).

Reading rule, out-of-scope uses and the capture caveat (`rt4_log` works against single-buyer capture; use ARIA P6 / `/captura`) stay as in [CARD91] § 2. The output is a **risk indicator**, never "X % probability of corruption".

## 3. Training data and labels

- **Population:** as v0.9.1, plus ComprasMX contracts at scoring time [R2:23]. Training/evaluation unit for the test: vendor-year [P2:20-21].
- **Labels:** v0.9.1's PU labelling [P2:15-16]. Label-origin caveat (989 of 1,417 cases `model_discovery`) and concentration in a few large cases carry over from [CARD91] § 3.
- **Test set:** forward chain Y = 2019…2025; positives = 174 gold vendor-years of hold-out case vendors; negatives = held-out-fold non-GT vendor-years (57,169 in pre-registration 1, same harness) [R2:5, R1:4-5, P2:20].
- **Disclosure:** this test set was looked at once before (pre-registration 1). Neither model was tuned on it [P2:22-23].

## 4. Evaluation

**This is a different metric from the one published for v0.9.1.** v0.9.1's 0.852 was a vendor-stratified gold hold-out at contract level with all-years features [CARD91 § 4]. v0.9.2's figures are **forward-chained**: trained on earlier years, scored on the next year, at vendor-year level, with features that see only the past. The two numbers must not be put side by side as "better" or "worse".

Paired vendor-cluster bootstrap, 1,000 resamples [R2:5].

| Metric (forward chain 2019–2025) | v0.9.2 (v0.9.1-as-of) | v0.10 | stored v0.9.1 (look-ahead) | Source |
|---|---|---|---|---|
| M1 vendor-year AUC | **0.827** [0.763, 0.883] | 0.857 [0.800, 0.902] | 0.949 [0.921, 0.972] | R2:9, RJ `m1_ci` |
| M2 size-controlled AUC | **0.741** [0.687, 0.794] | 0.743 [0.694, 0.796] | 0.906 [0.865, 0.944] | R2:10, RJ `m2_ci` |
| AUC, vendors with no prior history | 0.741 | 0.634 | 0.945 | R2:11 |
| AUC, vendors with history | 0.879 | 0.899 | 0.945 | R2:12 |
| Brier (uncapped / censored) | 0.00958 / 0.01068 | 0.01099 / 0.01086 | 0.0109–0.0110 (two comparison samples) | RJ `R4`, `vs_stored_v091` |
| Hard-negative share (≥ 0.60) | 6.6 % | 6.8 % | — | R2:18 |

Label-free baselines on the same test (M1 / M2) [RJ `point`]: prior contract value 0.790 / 0.698 · prior contract count 0.711 / 0.511 · rt4 breadth 0.721 / 0.577.

**Gates [R2:14-20].** v0.9.2 passes the original G1 (M1 lower CI 0.763 ≥ 0.65) and G2 (M2 beats the best label-free baseline, prior value, by a CI of [+0.008, +0.086]). R1 (v0.10 non-inferior to v0.9.2 on M2) failed by 0.003, so by the signed rule v0.9.2 ships instead of v0.10 [R2:22]. On the size-controlled ranking the two honest models are statistically tied [R2:28].

**What M2 says.** Most of M1 is vendor size: ordering vendor-years by prior contract value alone gives 0.790. Holding size fixed, v0.9.2 ranks a case vendor-year above a non-case one about 74 times in 100.

**Sliced results by era / sector:** not reported. Per-era flag rates (share ≥ 0.40, not accuracy) from the policy fit [R2:24]: A 9.0 % · B 6.7 % · C 13.6 % · D 13.6 % · E (ComprasMX) 11.4 %.

## 5. Calibration

- The 0–1 value is shaped by the PU constant and the 10 % flag-rate policy; it is **not a calibrated probability** [CARD91 § 5, carried over].
- PU assumption violated as in [CARD91] § 5: labeled positives are documented cases, which favour large, visible suppliers. c_pu 0.436 is a scaling constant, not the share of true cases that are labeled.
- Tempering: T = 0.530, the largest T keeping saturation ≤ 85,542 (validation slope gave 0.710) [RJ]. Monotone: it does not change the ranking.
- **Live distribution [verified 2026-10-30, prod `/api/v1/analysis/risk-overview`, 3,178,884 contracts]:** critical 5.17 % · high 4.78 % · medium 12.48 % · low 77.57 % · HR 9.95 % (policy-fit expectation was HR 10.0 %, critical 5.2 % [R2:23]). No v0.9.1 distribution figure (4.8 / 5.1 / 29.8 / 60.3 %, HR 9.9 %) applies to v0.9.2.

## 6. Limitations and failure modes

- **Size carries most of the signal** (§ 4): prior value alone reaches M1 0.790. Small vendors are ranked less well.
- **`rt4_log` is now the largest coefficient** (+1.279 standardised). It counts agencies a supplier served before the contract year; it reflects which cases get documented (large national suppliers) and works against single-buyer capture. It does not mean breadth is suspicious in itself. Capture: ARIA P6 / `/captura`.
- **Narrow CIs are not available:** the test has 174 positive vendor-years; M1's 95 % CI spans 0.763–0.883.
- **Fewer inputs than v0.9.1** (17 vs 27): seven v0.9.1 inputs have no as-of builder yet (§ 1).
- **Label circularity** (`model_discovery` cases) and **concentration** in large cases, as in [CARD91].
- **Structure A (2002–10)** weak RFC coverage; per-era flag rates differ (§ 4).
- **ComprasMX (era E)** is scored with the same recipe; its distribution check vs D-2025 (pre-registration 1, G6) flagged `cobid_herfindahl` (SMD 0.34) [R1:14]. Read era-E scores with that caveat.

## 7. Why v0.9.1 was replaced (look-ahead)

- v0.9.1's stored features (`contract_z_features*`) were computed on all years, including years after the contract, and it was trained on all years [R1:23-25, CARD91 § 6].
- Pre-registration 1 (2026-10-22) found v0.9.1 far ahead of the as-of model v0.10, including AUC 0.945 on vendors with **no prior history**, which a history-based score cannot earn honestly; the test could not tell skill from leakage [R1:21-26].
- Pre-registration 2 (signed by the owner 2026-10-22) rebuilt v0.9.1's recipe on as-of features, nothing tuned. Its size-controlled AUC fell **from 0.906 to 0.741**, level with v0.10. Conclusion: **the stored v0.9.1's lead came from contemporaneous all-years features (look-ahead), not from skill** [R2:26-28].
- **Older readings:** every v0.9.1 score (site, ARIA memos written before 2026-10-23, stories citing v0.9.1 figures, dataset 2026.10 on Zenodo) used look-ahead features. They stay as historical records but are superseded; they will not match v0.9.2, and v0.9.1's 0.852 should not be quoted as current performance.

## 8. Deployment, monitoring, rollback

- **Serving:** batch rescore of all contracts incl. ComprasMX into `contracts.risk_score*`; downstream refresh as in [CARD91] § 8 [BRIEF].
- **Guardrails:** intercept < −0.5, c_pu > 0.30, HR 2–15 % (scorer enforces) [CLAUDE]; per-era HR within 2–20 % at fit [R2:24].
- **Monitor:** HR, tier shares, saturation ≤ 85,542, per-era HR incl. era E.
- **Rollback:** `_v10/score_v092.py --rollback` (snapshot table `_risk_pre_v092`) or the stored v0.9.1 column `risk_score_v91` [verified 2026-10-30, `docs/SCORING.md`]; `risk_score_v8` (v0.8.5) remains. Rolling back to v0.9.1 reintroduces look-ahead and should be a last resort.

## 9. Ethical considerations

As [CARD91] § 9. Added: because published v0.9.1 readings were inflated by look-ahead, the methodology page discloses it (§ 7) and press texts carry one line on it; no vendor should be described from a v0.9.1 reading without rechecking the v0.9.2 score.
