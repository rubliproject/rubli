# Model monitoring review — v0.9.2 on ComprasMX (2026-10-30)

**Scope.** Production ML review of the live risk indicator v0.9.2 (`CAL-v92-asof-20261022`, intercept −3.6328,
c_pu 0.4360, T 0.530, 17 features, display squash above 0.60) since ComprasMX rows (structure **E**, 2025–26) are
scored with it and refreshed weekly (`backend/scripts/comprasmx_weekly.py`, `scripts/rubli-weekly.sh`).
Sources: `_v10/score_v092.py`, `_v10/build_v10.py`, `_v10/rematch_result.json` (`policy.v091_asof`),
`docs/MODEL_CARD_v0.9.2.md`, `docs/SCORING.md`, `docs/FACTCHECK_V092_COEFS_2026-10-23.md`.

**Data.** Prod `RUBLI_DEPLOY.db`, read-only (`docker exec rubli-backend`, `mode=ro`, one aggregate query at a
time), queried 2026-10-30. HR = share with `risk_score >= 0.40` (high + critical). The display squash leaves
every level unchanged (§ 5), so HR is the same on `risk_score` and `risk_score_v92`.

## Verdict

- **No material drift for structure E.** E's HR is 12.49 %, D's 13.46 %, and the overall rate is 9.95 %.
  The feature means and missingness of E sit within a few hundredths of D.
- **The global gate passes, but three year slices are outside 2–15 %.** 2025 (16.1 %), 2022 (16.0 %) and 2021
  (15.9 %) are above it, and 2002 (0.6 %) is below. All four fall inside the 2–20 % per-era tolerance used at fit.
- **No leakage from future years** in the weekly rescore. One known effect: a contract's score can still move
  after scoring, because its same-year baselines change as new rows load (§ 2).
- **The squash checks out on prod.** It is monotonic, it keeps every level, and the maximum display score is
  0.9496.
- **There was no slice monitoring.** The only HR check was the global assert, and E cannot move that number.
  This branch adds a non-fatal per-slice monitor (§ 6).

## 1. Distribution and feature drift

### Scores by structure (prod, scored rows)

| Structure | n scored | mean score | HR (≥ 0.40) | critical (≥ 0.60) | medium | 
|---|---:|---:|---:|---:|---:|
| A 2002–10 | 394,842 | 0.209 | 8.79 % | 3.86 % | 13.43 % |
| B 2010–17 | 1,328,696 | 0.191 | 6.55 % | 3.48 % | 9.88 % |
| C 2018–22 | 930,245 | 0.241 | 13.43 % | 7.59 % | 14.29 % |
| D 2023–25 | 402,042 | 0.237 | 13.46 % | 6.16 % | 15.36 % |
| **E ComprasMX** | **123,079** | **0.229** | **12.49 %** | **6.08 %** | **14.53 %** |
| **All** | **3,178,904** | — | **9.95 %** | **5.17 %** | — |

Policy-fit expectation per era [MODEL_CARD § 4]: D 13.6 %, E 11.4 %. Live E is 12.5 %, up 1.1 pp. That gap is
within the noise from the loads since Oct 23 (+2.3 K rows) and from the baseline shift (§ 2).

**Same calendar year, different source.** In 2025, D (Jan–Sep, CompraNet) has an HR of 18.0 % (n 92,573) and E
(ComprasMX) has 11.1 % (n 35,664). The gap is real but runs in the *conservative* direction for E: ComprasMX rows
are flagged less often than CompraNet rows from the same year. This is a different publication population (the
open-data CSV covers signed contracts only), not evidence that the model drifts upward on E.

### Feature means, D vs E (scored rows; 17 model inputs, `contract_features_v10`)

| Feature | β raw | mean D | mean E | NULL D | NULL E |
|---|---:|---:|---:|---:|---:|
| z_price_ratio | +0.456 | −0.012 | −0.019 | 0 | 0 |
| z_price_volatility | +0.811 | −0.035 | −0.030 | 28.6 % | 28.4 % |
| z_vendor_concentration | +0.173 | −0.043 | −0.005 | 13.4 % | 13.3 % |
| z_win_rate | +0.012 | −0.039 | −0.016 | 13.4 % | 13.3 % |
| z_sector_spread | −0.187 | 0.006 | 0.056 | 13.4 % | 13.3 % |
| z_network_member_count | +0.111 | 0.000 | 0.000 | 1.3 % | 0 |
| z_same_day_count | +0.094 | −0.033 | −0.053 | 1.5 % | 0 |
| z_single_bid | +0.072 | 0.020 | 0.091 | 0 | 0 |
| z_direct_award | +0.049 | −0.040 | −0.103 | 0 | 0 |
| z_year_end | 0 | −0.084 | 0.252 | 0 | 0 |
| recency_z | −0.066 | 0.064 | 0.048 | 1.5 % | 0 |
| partida_price_residual_z | +0.089 | 0.043 | 0.044 | 1.5 % | 0 |
| partida_single_bid_z | −0.048 | −0.033 | 0.020 | 1.5 % | 0 |
| partida_direct_award_z | −0.004 | −0.161 | −0.229 | 1.5 % | 0 |
| rt4_log | +0.592 | 1.62 | 1.66 | 1.3 % | 0 |
| inst_hhi_prior | +0.771 | 0.707 | 0.637 | 1.3 % | 0 |
| cobid_herfindahl | −0.304 | 0.478 | 0.573 | 1.3 % | 0 |

Second-moment and sentinel checks (D / E): RMS of partida_price_residual_z is 0.917 / 0.975, RMS of
partida_direct_award_z 1.19 / 1.25, RMS of rt4_log 2.08 / 2.14. The share of `partida_price_residual_z = 0` is
19.3 % / 12.4 %. The share of `cobid_herfindahl = 1.0` (no prior co-bid partners) is 45 % / 54 %. The share of
`inst_hhi_prior = 1.0` (one prior buyer or none) is 41 % / 35 %. The share of `rt4_log = 0` is 12.2 % / 13.3 %.

**Reading.** No input shifts by more than about 0.1 in mean. The largest *weighted* shifts are the following:
- **cobid_herfindahl** is +0.095. With β −0.304, that lowers E's linear score by about 0.03.
- **inst_hhi_prior** is −0.070. With β +0.771, that lowers it by about 0.05.
- Both push E scores *down*.

The cobid caveat in the model card (G6, SMD 0.34) has shrunk but is still the same sign. `z_year_end` moves the
most (+0.34) but has β = 0.

**Features that are structurally missing for E.** None are NULL for E. The partida features exist because the
ComprasMX CSV carries partida codes. The co-bid features use the as-of builder over prior-year procedures. So
**no imputation drives E scores beyond the general rule**. That rule is NULL → neutral fill: `inst_hhi_prior` and
`cobid_herfindahl` are filled with 1.0 and every other feature with 0 (`score_v092.py` `compute`, `neutral_fill`).
The 28 % NULL `z_price_volatility` and 13 % NULL vendor z-features are identical in D and E (vendors with too
little history). They are filled with 0, the mean, so they contribute nothing.

The real structural gap for E is *upstream*. The 1.0 sentinel of `cobid_herfindahl` means "no known co-bidders".
For E it fires 9 pp more often, because ComprasMX does not publish losing bidders (the OCR loser list is not in
`contracts`). Because β is negative, this *lowers* E scores.

## 2. Weekly rescoring and as-of features (leakage)

- The weekly job **rebuilds `contract_features_v10` from scratch** (`build_v10.py`: build into `_new`, then swap
  it in one transaction). Then it scores **all** contracts with the **frozen** artifact
  (`_v10/rematch_result.json`, `policy.v091_asof`). There is no retraining, no re-estimation of the intercept,
  c_pu, T or squash K, and the scorer guards still assert intercept < −0.5 and c_pu > 0.30.
- **Vendor history is strictly prior-year.** `asof()` uses `merge_asof` on `stat_year < Y`, and so do
  `n_prior_contracts`, `prior_value`, `rt4`, `inst_hhi_prior` and `cobid`. A 2026 contract sees vendor history
  through 2025 only. Loading more 2026 rows **cannot** change any vendor-history feature of a 2026 contract, and
  future years never reach a past contract. **No future-year leakage.**
- **Known, by-design movement.** Cross-sectional baselines use a trailing window [Y−2, Y] with leave-one-out, so
  they include *same-year* contracts loaded later. Each weekly load therefore re-z-scores existing 2025–26
  contracts. Measured on prod against the pre-write snapshot `_risk_pre_v092`, **852 contracts changed level**
  (D 239, E 613; 0 in A–C) at the last rescore. This is contemporaneous information inside year Y, documented in
  PLAN § B. It is not look-ahead in the v0.9.1 sense. It does mean a 2026 contract's indicator can change from
  week to week.
  - **Recommendation:** say so in the methodology text: «el indicador de contratos del año en curso puede
    ajustarse cuando se publican más contratos de ese año».
- **The integrity check never runs weekly.** `build_v10.py --check N` recomputes N contracts naively from
  strictly-prior rows and rebuilds on `year <= CUT` to compare. The weekly job never calls it.
  - **Recommendation:** add `--check 1000` as a *soft* step after `features v10`.
- **Two rollback and versioning side effects of weekly `--write`:**
  - **Rollback reaches back one week only.** `_risk_pre_v092` is dropped and re-snapshotted on every weekly
    write, so `score_v092.py --rollback` undoes only the last week. It no longer returns to v0.9.1. MODEL_CARD
    § 8 reads as if it did. To reach v0.9.1, use `risk_score_v91` (look-ahead, last resort).
    - **Fix the card's wording.**
  - **Duplicate calibration rows.** Each `--write` inserts a new `model_calibration` row with the same run id.
    Prod has 2 v0.9.2 rows, from 10-22 and 10-28. That is harmless to the API (latest row), but the table will
    grow by one row a week.
    - **Recommendation:** have the weekly path pass a flag that skips the insert, or make it `INSERT … WHERE NOT
      EXISTS (run_id)`.

## 3. HR gate per year, 2023–2026

| Year | n | HR | critical | 2–15 % (CLAUDE.md) | 2–20 % (per-era fit) |
|---|---:|---:|---:|:---:|:---:|
| 2023 | 168,024 | 12.48 % | 5.82 % | pass | pass |
| 2024 | 141,581 | 11.64 % | 5.00 % | pass | pass |
| **2025** | 128,238 | **16.11 %** | 7.49 % | **fail (+1.1 pp)** | pass |
| 2026 | 87,411 | 13.04 % | 6.65 % | pass | pass |

2025 by source is D 18.03 % (n 92,573) and E 11.13 % (n 35,664). The 2025 excess comes from **CompraNet D
Jan–Sep 2025**, not from ComprasMX. Historic years outside 2–15 %: 2021 15.89 %, 2022 16.01 %, and 2002 0.59 %
(Structure A, RFC 0.1 %; known under-detection).

The CLAUDE.md gate is defined on the **global** HR (9.95 %, pass), and the scorer enforces only that. A per-year
2–15 % band would alert every week on 2025. The monitor therefore uses **2–15 % globally and 2–20 % per slice**,
the tolerance the policy fit used [MODEL_CARD § 8].
- **Owner decision:** if a tighter per-year band is wanted, set `HR_SLICE_GATE`. Expect a weekly page for 2025
  until the band or the model changes.

## 4. NULL scores after the weekly loads

| Structure | NULL score / level | of which amount ≤ 0 or NULL | of which > 100B |
|---|---:|---:|---:|
| A | 19 | 19 | 0 |
| B | 361 | 361 | 0 |
| C | 938 | 938 | 0 |
| D | 0 | — | — |
| E | 50 | 50 | 0 |

There are **0 valid contracts (0 < amount ≤ 100B) without a score**, and every NULL score also has a NULL level.
All 1,368 are unscored by the data rules: the scorer only scores `0 < amount_mxn <= 100B`. Version tags show 48
E rows as `pending_score` and 2 E rows with a NULL `risk_model_version`. Both groups have zero or missing amounts.
- **Optional cosmetic fix:** tag those 2 rows `pending_score`.

All scored rows carry `risk_model_version = 'v0.9.2'`, and none of them has a NULL `contract_year`.

## 5. Display squash (verified on prod)

Checked over all 3,178,904 v0.9.2 rows:
- `risk_level` vs the level of the display `risk_score`: **0 mismatches**. `risk_level` vs the level of
  `risk_score_v92`: **0 mismatches**. No contract crosses 0.25, 0.40 or 0.60.
- Display ≤ capped score everywhere (0 violations). Below 0.60 the display equals `risk_score_v92` exactly
  (0 diffs). Above 0.60 the display lies in (0.60, 0.95) (0 violations). The maximum display is **0.94955**, and
  **0** contracts have a display ≥ 0.999.
- **Monotonic.** Ordering the 182,533 rows with `risk_score_v92 > 0.55` by `risk_score_v92` gives **0
  inversions** in display.
- **Ties broken.** 89,358 contracts are capped at 1.0. They map to 88,885 distinct display values.
- **Saturation has outgrown the policy cap.** 89,358 capped contracts > the 85,542 cap in MODEL_CARD § 5/§ 8
  (fit: 84,687). The display squash makes saturation invisible on the site, but the card names it as a monitor.
  - **Recommendation:** add it to the weekly monitor (not done yet, § 6 item 4). Either restate the cap
    as a share (2.81 % of scored rows) or accept the drift in the card.

## 6. Monitoring: what alerted before, what this branch adds

**Before** (origin/main):
- The scorer asserts a **global** HR of 2–15 %. Failing it is a hard step, the run ends `FAILED`, and it pings
  `RUBLI_ALERT_URL/fail` if that is configured.
- The weekly job hard-fails if any valid **E** row is unscored.
- Nothing checks HR per structure or per year, saturation, feature drift or week-over-week change.
- E is 3.9 % of rows. Even if E's HR jumped to 50 %, the global HR would move by only about 1.5 pp and still pass.
  **E drift was invisible.**

**Added on `feat/model-monitoring`:**
- What the step computes:
  - It runs inside `comprasmx_weekly.py`, after scoring and the coverage check
    (`model_monitor(conn, prev_unscored)`).
  - It makes **one scan**:
    `GROUP BY source_structure, contract_year` with `SUM(risk_score >= 0.40)`, `COUNT(risk_score)` and
    `SUM(risk_score IS NULL)`.
  - The scan covers the **scorer's universe**: `0 < amount_mxn <= 100B`, mirroring `score_v092.compute`.
  - Overall, per-structure and per-year (≥ 2023) HR are derived in Python.
- **The universe has no vendor filter, on purpose.**
  - `build_v10.load` writes a feature row for every contract with an amount ≤ 100B or NULL, whether or not it has
    a vendor. The scorer then scores all of them, filling NULL vendor features with neutral values.
  - Adding `vendor_id IS NOT NULL` would **hide** a vendor-less valid contract that went unscored, which is
    exactly the gap this check exists to catch.
- **Unscored check.**
  - It counts valid contracts with a NULL score.
  - It alerts only when the count **rises** vs last week. Last week's count is the previous
    `WEEKLY_REFRESH.json` `model_monitor.null_score_valid`, carried as `prev_unscored` through weeks that skip the
    monitor. With no history, the baseline is 0.
- What it writes:
  - Results go to `WEEKLY_REFRESH.json` → `model_monitor`.
  - Cells outside the gate go to `model_monitor.alerts`. The gates are 2–15 % overall and 2–20 % per slice.
- How it alerts, without being fatal:
  - `result` and the public `weekly_status` are untouched, so the site does not show «actualización parcial» for
    a model warning.
  - A monitor exception is recorded as an alert and never fails the run.
  - A clean run that has alerts counts as «not clean» for the alert only.
  - With a healthchecks.io URL it pings `<URL>/fail`.
  - With an **ntfy topic URL** (host contains `ntfy`) it posts to the topic itself with priority `high`, and with
    `low` on clean runs. ntfy has no `/fail` convention and no dead-man switch.
- **Alert wiring (`scripts/rubli-weekly.sh`).**
  - The wrapper parses `RUBLI_ALERT_URL=` from a **new, dedicated, root-only** `/etc/rubli-weekly.env`. It does
    not source the file, and it does not reuse `/etc/rubli-ops.env`.
  - It passes the URL into the job container **by name** (`-e RUBLI_ALERT_URL`), so the value stays out of
    `ps` / `docker inspect` args.
  - No file means no alerts; the run is otherwise unchanged.
- Tests in `backend/tests/test_comprasmx_weekly.py`:
  - `test_model_monitor_reports_hr_per_structure_and_alerts_outside_the_gate` (includes "no rise → no alert")
  - `test_model_alerts_ping_fail_without_touching_the_result`
  - `test_ntfy_url_gets_one_topic_with_priority`
- **On today's prod data it would raise 0 alerts.** Per structure, A–E fall within 6.5–13.5 %. Per year, 2023–26
  fall within 11.6–16.1 %. There are 0 valid NULL scores.

**VPS install (after merge to main and deploy; owner or captain):**
1. `install -m 755 /opt/rubli/scripts/rubli-weekly.sh /usr/local/bin/`. The timer runs the installed copy, not
   the repo one.
2. Create the alert file. Do this as root, on the VPS only, and never commit it or paste it into chat or docs.
   - Take the topic from `D:\Python\yangwenli\.claude\ALERT_TOPIC.txt` (git-ignored).
   - Write one line, `RUBLI_ALERT_URL=https://ntfy.sh/<topic>`, to `/etc/rubli-weekly.env`.
   - Then run `chown root:root /etc/rubli-weekly.env && chmod 600 /etc/rubli-weekly.env`.
3. Optional check: run `sh /usr/local/bin/rubli-weekly.sh` outside the Sat 23:00 – Sun 08:00 UTC window, or wait
   for the Sunday 04:00 UTC timer. Expect one ntfy push titled «RUBLI weekly: ok» (low priority) on a clean run.

**Not added (next, in order of value):**
1. **Week-over-week delta for E.** Alert if E's HR moves more than 3 pp from the previous `WEEKLY_REFRESH.json`.
   Bands catch only gross failures; a delta catches a broken CSV column early.
2. **`build_v10.py --check 1000` as a soft step** (§ 2).
3. **Feature drift for E vs D-2024.** Compute the SMD for the six largest-|β| inputs, and alert if any is above
   0.5.
4. **Saturation count** in `model_monitor`. Settle the card cap first (§ 5).
5. **Dead-man switch.** ntfy only pushes when a run ends. A dead timer or hung run stays silent. If that matters,
   add a free healthchecks.io check and switch the URL.

## 7. Coefficient scale: /methodology +0.678 vs API ~+0.59 for `rt4_log`

There are three numbers, all correct, on three different scales:

| Surface | rt4_log | Scale | Source |
|---|---:|---|---|
| MODEL_CARD_v0.9.2 § 1 | +1.279 | standardised β, **un-tempered** | `policy.v091_asof.betas_standardised` |
| /methodology «La Balanza» (`BalanzaLedger.tsx` `COEFFICIENTS`) | **+0.678** | **T × standardised β** (effect of +1 SD, ×0.530) | FACTCHECK_V092_COEFS: 1.2794 × 0.5297 = 0.6777 |
| `/api/v1/analysis/model/calibration` `beta` | **+0.592** | **raw per unit**, T folded in (T × β_std / sd) | `policy.v091_asof.betas_raw`, what the scorer multiplies |

Consistency check: 0.678 / 0.592 implies sd(rt4_log) ≈ 1.15. That is plausible for log1p of a count of prior
institutions (RMS 2.1, mean 1.6–1.7, § 1).

**Neither surface is wrong. Both are unlabelled for scale.**
- The methodology chart is the right one to show for *importance*. Standardised coefficients are comparable
  across features.
- The API values are the right ones to *recompute a score*, but they are unit-dependent. Their |β| order is
  price_volatility 0.811 > inst_hhi_prior 0.771 > rt4_log 0.592. That is **not** an importance ranking, because
  inst_hhi_prior is 0–1 with sd ≈ 0.35.
- The API currently sorts by |raw β| and says "importance order" (`analysis.py` comment). That is misleading.

**Copy and label fixes:**
- **/methodology** (`es/methodology.json`, `body.features.p1` and `footerNote`; same in `en`):
  - Replace «El gráfico muestra los coeficientes ElasticNet en uso (… escalados por T=0.530)» with «El gráfico
    muestra **coeficientes estandarizados** (el efecto de subir una desviación estándar en cada característica),
    escalados por T=0.530; así se pueden comparar entre sí».
  - EN: «**standardised coefficients** (the effect of a one-standard-deviation increase), scaled by T = 0.530, so
    they are comparable with one another».
  - Ledger column/axis label: «coeficiente estandarizado (×T)» / «standardised coefficient (×T)».
- **Model card § 1.** Keep +1.279, but mark it «estandarizado, sin atemperar (T = 1)». Add the ledger value
  (+0.678) beside it.
- **API:**
  - Add `"coefficient_scale": "raw_per_unit_tempered"` to the response, or a docstring line: *"beta = per raw
    unit of the stored feature, tempering T included; not comparable across features; for importance use the
    methodology's standardised values."*
  - Stop calling the |raw β| sort "importance order".
  - Better, at no data cost: store `betas_standardised × T` in the hyperparameters JSON at write time, and serve
    both.
- **Anything quoting a number in prose** (stories, press, films: `story-films.json` uses 0.678) must say
  «coeficiente estandarizado».

## Tests run

- `timeout 115 python -m pytest tests/test_comprasmx_weekly.py tests/test_weekly_status.py -q` → **17 passed**.
- The pre-existing failure `test_budget_visibility_is_the_last_soft_precompute` was fixed in the test. The test
  now expects `precompute_rastro` right after `precompute_budget_visibility`, then `perf indexes`. The monitor
  step was not moved.
- `sh -n scripts/rubli-weekly.sh` → OK.
- Prod: 16 read-only aggregate queries, each under 35 s, on 2026-10-30. None were run after it.
