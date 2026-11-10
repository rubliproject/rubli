> **SUPERSEDED (2026-10-23):** the deploy session's branch rewrites CLAUDE.md's model section itself; do not paste this draft.

# Proposed CLAUDE.md «Risk Model» section for v0.9.2

For the lead: replaces the whole `## Risk Model — v0.9.1 (ACTIVE, promoted 2026-10-13)` section of `CLAUDE.md`. Items marked ⟨TO VERIFY⟩ need the deploy session's values (scorer name, run id, live distribution) before pasting.

---

## Risk Model — v0.9.2 (ACTIVE, promoted 2026-10-22)

v0.9.2 = v0.9.1's recipe on **as-of** features (vendor history strictly prior years; baselines trailing [Y−2, Y] leave-one-out), chosen by the signed rule of `_v10/PREREGISTRATION_2.md` (result `_v10/RESULT_2.md`, branch `model/v010-build`). ElasticNet logistic + PU correction · C 0.003725 · l1 0.9188 · v0.9.1 labelling · 17 features (16 non-zero; top |β|: rt4_log, price_volatility, inst_hhi_prior, price_ratio, sector_spread −, cobid_herfindahl −) · c_pu 0.436 · T 0.530 · intercept −3.633 · HR 10.0 % at fit · scores ComprasMX (era E).

- **Metric (UI prints this): forward-chained vendor-year AUC 0.827 [95 % CI 0.763, 0.883]**, size-controlled 0.741 [0.687, 0.794]; 174 positive vendor-years, 2019–2025. A **different metric** from v0.9.1's 0.852 gold hold-out — never compare them. Constants: `MODEL_AUC*` in `frontend/src/lib/constants.ts`; `model_calibration` row `v0.9.2` carries `auc_roc = 0.827`.
- **Why v0.9.1 went:** its features were all-years (look-ahead). Rebuilt as-of, M2 fell 0.906 → 0.741; stored v0.9.1 scored AUC 0.945 on no-history vendors. Disclosure: `/methodology` § «La corrección de octubre de 2026», `docs/MODEL_CARD_v0.9.2.md` § 7. Older v0.9.1 readings (stories, memos, dataset 2026.10) are superseded, not current.
- **Scorer:** ⟨TO VERIFY: script name, e.g. `backend/scripts/score_v092.py`⟩ → `risk_score` + `risk_level` (+ ⟨TO VERIFY version column⟩). **Read `docs/SCORING.md` before any rescore** (needs its own v0.9.2 update). ⚠️ `score_v091.py`, `_score_v6_now.py`, `calculate_risk_scores_v6.py` are NOT active.
- **DO NOT** score without intercept < −0.5, c_pu > 0.30, HR 2–15 % (scorer enforces); per-era HR at fit A 9.0 · B 6.7 · C 13.6 · D 13.6 · E 11.4 %.
- Distribution after the prod rescore: ⟨TO VERIFY — Critical / High / Medium / Low shares; policy fit says critical 5.2 %⟩.
- `rt4_log` (vendor breadth, now the largest weight) works *against* P6 capture — the score is not a capture detector; use ARIA P6 / `/captura`.
- «Sin indicador» = pending scoring or > 100B rejects only.
- Preserved: v0.9.1 scores ⟨TO VERIFY column, e.g. `risk_score_v91`⟩ (look-ahead; rollback only as last resort), `risk_score_v8` (v0.8.5), `risk_score_v6`, `risk_score_v5` (leakage), `risk_score_v4`.
- Card: `docs/MODEL_CARD_v0.9.2.md`. Fact-check: `docs/FACTCHECK_V092_2026-10-23.md`.
