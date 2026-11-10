# Diagnosis: «single bid» counts winners, not bidders (2026-11-09)

Branch `fix/comprasmx-single-bid` · PURPLE symptom → RED diagnosis · no prod writes, no rescore.

## Symptom

- 42 of the 43 ComprasMX licitaciones at the passenger-rail agencies carry `is_single_bid = 1`.
- So do 15,085 of the 27,473 competitive contracts of 2026 (54.9 %).
- Press check: Tramo I had 11 bids. Segment 15 A1 had 7. RUBLI flags both as «single bid».

## § 1 Numbers: the rate is not a ComprasMX artefact

The share of competitive contracts with `is_single_bid = 1`, by year (prod API `/contracts?year=Y&is_direct_award=false[&is_single_bid=true]`, totals):

| year | structure | competitive | single | rate |
|---|---|---:|---:|---:|
| 2012 | B | 53,662 | 32,803 | 61.1 % |
| 2015 | B | 58,488 | 36,095 | 61.7 % |
| 2018 | C | 45,234 | 26,442 | 58.5 % |
| 2020 | C | 34,681 | 16,645 | 48.0 % |
| 2022 | C | 38,896 | 17,849 | 45.9 % |
| 2023 | D | 29,805 | 14,908 | 50.0 % |
| 2024 | D | 29,449 | 14,300 | 48.6 % |
| 2025 | D + E | 38,695 | 16,373 | 42.3 % |
| 2026 | E | 27,473 | 15,085 | 54.9 % |

The local DB has structures A–D only, read-only. On it, C ran at 45.9–58.4 % in 2018–22. D ran at 50.0 % (2023), 48.0 % (2024) and 40.3 % (2025).

ComprasMX's 54.9 % falls inside CompraNet's own historic range of 46–62 %. **The ComprasMX hypothesis is refuted.** ComprasMX publishes winners only, but so does CompraNet. The same flag sits on every structure.

**Procedure level, local D 2023–25:**
- There are 43,374 competitive procedures.
- Only **15.2 %** have more than one distinct vendor. 17.7 % have more than one contract.
- So 84.8 % of competitive procedures show a single recorded winner.

This share is a property of the publication format and of how tenders are split. It does not count bids.

**Rail case:**
- Large tenders are split into tramos and lots, and each one runs as its own `procedure_number`.
- Each lot has one winner, so each lot is flagged, whatever the number of bids (7 and 11 in the press tables).

## § 2 Root cause

| where | what |
|---|---|
| `backend/scripts/etl_pipeline.py` Step 5b | `is_single_bid = 1` when a competitive procedure has `COUNT(DISTINCT vendor_id) = 1`, over contracts |
| `backend/scripts/integrate_comprasmx.py` (after insert) | same rule for E, counted over CompraNet + ComprasMX rows of the procedure |
| `_v10/build_v10.py` | model feature `single_bid_raw`, recomputed the same way over D + E |

- The `contracts` table holds awarded contracts only. No bidder or offer table exists: `co_bidding_stats` holds co-awards.
- The rule in `.claude/rules/data-validation.md` describes «Competitive procedure with 1 vendor». "Vendor" there means the winner.
- Decision D20 (2026-10-05) already named the flag «un solo adjudicado» / "single award", in `docs/WORDING_SINGLE_BIDDER_2026-10-30.md`.
- The bug is the copy that drifted back to «postor / bidder», plus the press and deck lines built on that copy.

**Where a real bidder count could come from** (future work, not built):
- the actas de fallo in CompraNet expedientes;
- ComprasMX's «Postor Abierto» API / change feed (`docs/SOURCE_SCOUT_2026-10-19.md`);
- the DOF for big works.

None of these is loaded. A future `num_offers` column (NULL = unknown) would let a real single-bidder flag exist.

## § 3 Model impact (v0.9.2, active)

- `z_single_bid` is a feature: raw β +0.079, +0.149 standardised, rank 9 of 16. Prod explainer β is 0.0716.
- `partida_single_bid_z` also is a feature: β −0.0366 / −0.0479.
- `z` is a binary leave-one-out z against sector × [Y−2, Y] over *all* contracts, so the base rate p is about 0.17 in 2026:
  - a flagged contract gets z ≈ +2.2 to +3.3;
  - an unflagged one gets z ≈ −0.45.
- Swing between flagged and unflagged: about **+0.2 logit** (odds ×1.2 to 1.3). The partida term offsets part of it.
- Example, ISSSTE contract 3215090 (prod `/contracts/3215090/risk-explain`): single_bid +0.233 and partida_single_bid −0.117, so net **+0.12** of a 1.94 logit.
- In 2026, 1,499 flagged contracts are critical and 855 are high (prod).
- The feature is small. It can move a contract near 0.40 or 0.60 across a band, but it drives none of the big scores.
- **Not retrained** (owner rule). Caveat added to `docs/SCORING.md`.

## § 4 Options considered

| option | verdict |
|---|---|
| A. `is_single_bid = NULL` for E only (the first brief) | **Rejected.** E is not different from A–D. Nulling E alone would make the eras inconsistent and change the model's E z-window, which needs a rescore. |
| B. NULL for all eras | Rejected. It destroys the honest «un solo adjudicado» statistic used site-wide, and it needs a retrain. |
| **C. Keep the column; name it honestly everywhere (D20); document it; caveat it in the model docs** | **Done.** No data or score change. |
| D. Load real offer counts (actas / Postor Abierto) → `num_offers` | Future work. This is the only path to a real «un solo postor». |

## § 5 What changed on the branch

- **UI**
  - `OtrosMetodos.tsx`: methodology heading and text now say «un solo adjudicado», and that CompraNet and ComprasMX record winners.
  - `lib/aria/mapa.ts`: «único postor» became «único adjudicado».
  - `lib/institution/anatomy.ts`: «Postor único» ×2.
  - `lib/portadaReading.ts`: «Hubo un solo participante» became «Se licitó y lo ganó un solo proveedor».
  - `pages/Administrations.tsx`: «Un solo postor».
  - `AriaConcept.tsx` and `AriaMapa.tsx`.
  - `lib/model/featureLabels.ts`: the hi/lo readings «un solo participante» / "single bidder".
  - `lib/model/featureLabels.ts`: `cobid_herfindahl` «co-postores / bids against» became «co-adjudicados / shares won procedures». It is built from co-awards.
  - `sectors.json` ES/EN: `avgBidders` / `oecdBidders` became «Adjudicados prom.», with no "3+ bidders" reference.
- **API**
  - `ai_explain.py` «con un solo postor».
  - `contract_service.py`: the risk-explain label "Single Bidder". Prod serves it today on `/contracts/{id}/risk-explain`.
  - `contracts.py` labels, `vendors.py` (EN/ES labels, the peer metric), `institutions.py`, `analysis_patterns.py`.
  - `procurement_health.py`: labels "Single Bidding Rate" and "Average Bidders", the unit, and a note that the EU lines count bidders.
  - `export.py`: the CSV header "Single Bid" became "Single Award".
  - Field descriptions for `is_single_bid` / `single_bid_rate`.
  - **Field names are unchanged.**
- **Docs**
  - `docs/SCORING.md` § Caveat.
  - Comments in `etl_pipeline.py` Step 5b and in `integrate_comprasmx.py`.
  - `RISK_METHODOLOGY.md` and `RISK_METHODOLOGY_v6.md` rows.
- **Test:** `backend/tests/test_single_bid_wording.py` (`no_db`). It fails on `origin/main` with 27 offending lines and passes on the branch. It scans `backend/api` and `frontend/src` for «un solo postor / single bidder / …» and allows negations and EU / LAASSP legal quotes.
- **Not in the branch:** `.claude/rules/data-validation.md` is not tracked in git. Add one line there by hand: "single bid = one winning vendor, not one bidder (D20)".

### Left as is (flag, not fixed)

- PHI traffic lights keep the EU 10 / 20 % lines on a winners-based rate, and "3.0" on average awardees. The labels now say it is a working threshold. Changing the thresholds changes PHI grades, so that is the owner's call.
- The "co-bidder" network naming (`/network/co-bidders`, «co-licitantes» in `redThread.json`) is also co-*award*. `TramaPanel` already glosses this. Renaming it is a separate pass.
- Hidden stories (`story-content.ts`) were left alone. Story 2218–2301 already says «CompraNet registra quién ganó, no quién ofertó».
- `frontend/public/infographics/single-bid-sector.svg` says «Único Postor / Un Solo…». No component references it. Delete it or re-render it.

## § 6 Deck / outlier lines affected (docs/deck)

| file | line | claim | fix |
|---|---|---|---|
| `ICIJ_OUTLIERS_2026-11.md/.csv` #3 Oxidrógeno | 13 / 4 | «One-bidder vehicle lease» | «single recorded winner» (offer count unknown) |
| #9 GA Energy Services | 19 / 10 | «Only bidder for a 2.56 B gas-pipeline job» · pattern «Single bidder» | «only recorded winner»; pattern → «Un solo adjudicado» |
| #11 Tecnología Médica Interamericana | 21 / 12 | «Only bidder; half of …» | «only recorded winner» |
| #13 Electronics for Medicine | 23 / 14 | «Only bidder; 60 % …» · pattern «Single bidder» | same |
| #18 Café Bersa | 28 / 19 | «Only bidder; 62 % …» | same |
| #21 GSM-Bronco | 31 / 22 | «recorded single bidder» | already flagged as an artefact (beat Weatherford). Drop it or reword. |
| `ICIJ_OUTLIERS_2026-11.md` | 7, 84 | pattern «Single bidder: 2» and the method line | rename the pattern; the method line already says «one vendor» |
| `ICIJ_DECK_REDTEAM_2026-11-05.md` | 131, 154, 199 | Los Chaneques «only bidder» / «single-bidder ISSSTE tender» | «only recorded winner». `ICIJ_DECK_2026-11.md:159` already made this switch. |
| `DECK_FACTCHECK_2026-11-07.md` | 41 | Los Chaneques ComprasMX «as the single bidder» | «as the only recorded winner» |
| `docs/icij/LEADS_2026-11-09.md` | 23–27 | already correct («single recorded winner», 2–12 bidders on rail) | none |

Rule for every card: **the number of bidders is unknown unless an acta de fallo or the DOF is cited.**

## § 7 Prod steps (owner approval needed; none run)

1. Review and merge `fix/comprasmx-single-bid` → `main`.
2. Deploy with `bash /opt/rubli/scripts/deploy-safe.sh`. This is a code deploy only: backend labels and frontend copy.
3. Verify:
   - `curl https://rubli.xyz/api/v1/contracts/3215090/risk-explain`: the label reads "Single Award".
   - `/methodology`: the heading reads «Adjudicación directa y un solo adjudicado».
4. **No DB job, no rescore, no retrain.** `is_single_bid`, `risk_score` and `risk_score_v92` stay unchanged. The weekly `comprasmx_weekly.py` keeps computing the same flag.
5. Optional, for the owner to decide:
   - a prereg'd retrain that drops `single_bid` / `partida_single_bid_z`, or replaces them with `num_offers` once loaded;
   - a PHI threshold review.
