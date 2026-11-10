# Methodology feature-gap audit (2026-10-16)

> Read-only audit. Nothing was written to the DB, nothing was retrained or rescored.
> Every count below was measured on `backend/RUBLI_NORMALIZED.db` (opened `mode=ro`) on 2026-10-16.
> Scripts and raw outputs: `D:\Python\_scratch_featgap\` (`cov.py` → `cov.json`, `vend.py` → `vend.json`, `vend2.py` → `vend2.json`).
> No RFC appears in this report. RFC-derived numbers are aggregates.

**The owner's question:** "We built it on OECD and other guidelines. Are we not taking into consideration other factors, given what we have at hand?"

**Short answer: yes.**

- The supervised score's top weights describe **vendor size and footprint**: price volatility, price ratio, number of institutions served, sector share. That fits a model whose labels are big-vendor scandals.
- The classic procurement red flags carry almost no weight in the score:
  - single bid +0.034;
  - direct award −0.016;
  - "ad period" +0.053 (and it is mis-defined);
  - amendments 0.
- Several standard red flags are computable from columns we already hold, but neither the model nor ARIA uses them:
  - the true tender ad period;
  - the exception article cited for a direct award;
  - incorporation date vs first contract;
  - splitting purchases under the direct-award cap;
  - retroactive starts;
  - buyer-side supplier dominance.
- ARIA's tier-1 rule is built so that **only GT vendors can reach it** (§ 0).

**Important caveat, measured in § 4:** once vendor size is controlled for, the in-session signals have **size-matched GT lift of only 0.9–1.7×**. Their raw 4–74× lifts are mostly a size effect.

This means the new signals pick out **different** vendors from the documented scandals. They are neither confirmed nor refuted by GT. Their value has to be shown by **analyst review**, not by GT metrics. That is exactly why they belong in a separate, label-free track and not in the supervised score.

---

## § 0 Why ARIA tier 1 only rediscovers documented cases

There are two layers of circularity.

1. **The risk score is trained on GT.** v0.9.1 is a PU-logistic model fit to GT vendors. It ranks contracts by resemblance to documented scandals.
2. **The IPS formula gives the last 20 points to GT.** In `backend/scripts/aria_pipeline.py:84-129`:
   `IPS = 0.40·max(risk, maha) + 0.20·ensemble + 0.20·financial + 0.20·external`.
   - `external = 1.0` iff `in_ground_truth`.
   - Otherwise it is at most 0.70 (EFOS) + 0.40 (SFP) + 0.25 (shell), capped at 1.
   - `financial = log10(value)/30`, which is ≤ 0.37 even at 100B MXN, so it adds at most 0.074.
   - Tier 1 needs ≥ 0.80. Without GT, a vendor needs a near-perfect risk term, a perfect ensemble term **and** EFOS + SFP.

**Measured** (`aria_queue`):
- All 98 tier-1 vendors are GT.
- The highest IPS of any non-GT vendor is **0.711**; the highest non-GT, non-EFOS IPS is **0.672**.
- Tier 2 holds 1,312 vendors. Of those, 727 have no GT, EFOS or SFP link.

Tier 1 is therefore "GT, ranked". It is not a discovery tier.

---

## § 1 What the platform uses today

### 1a. Active model v0.9.1: run `CAL-v91-202610131004`

- Read from `model_calibration` where `model_version='v0.9.1'`, `sector_id=0`.
- Formula: `min(sigmoid(b0 + β·x)/c_pu, 1)`, with b0 = −2.154 and c_pu = 0.439. Inputs are clipped to ±5.
- Post-patch: a structural-FP cap on 5 vendors, plus the ghost-companion boost.
- Scorer: `backend/scripts/score_v091.py`.

> Doc drift: `docs/SCORING.md` and CLAUDE.md still say v0.8.5 is active.

Coverage legend: **A** 2002–10 · **B** 2010–17 · **C** 2018–22 · **D** 2023–25.

| # | Feature | β | What it measures | Source columns | Usable in |
|---|---|---|---|---|---|
| 1 | price_volatility | **+0.729** | Std/median of the vendor's contract sizes as of year−1, vs sector | `amount_mxn` (vendor rolling) | A–D |
| 2 | price_ratio | **+0.449** | Contract amount / sector baseline | `amount_mxn`, `sector_id` | A–D |
| 3 | rt4_log | **+0.290** | log(1 + institutions the vendor served before this year) | `contract_features_v9.n_inst_prior` | A–D |
| 4 | vendor_concentration | +0.242 | Vendor's share of sector value (rolling) | `amount_mxn`, `sector_id` | A–D |
| 5 | cobid_herfindahl | +0.193 | Concentration of co-**award** partners on a shared `procedure_number` (losing bids are not in the data) | `contract_z_features_v2` | B–D |
| 6 | amount_residual_z | −0.142 | Amount residual vs expected | v2 | A–D |
| 7 | recency_z | −0.092 | Recency of the vendor's previous contract | v2 | A–D |
| 8 | network_member_count | +0.061 | Size of the vendor's corporate/co-contracting group | `vendor_groups` | A–D |
| 9 | ad_period_days | +0.053 | **contract_date minus publication_date** (`compute_z_features.py:540-551`). This is *not* the tender ad period: it blends the ad period and the decision period | `publication_date`, `contract_date` | B 47%, C 97%, D 96% |
| 10 | sector_spread | −0.052 | Number of sectors served | rolling | A–D |
| 11 | has_partida | +0.051 | Partida code present | `partida_especifica` | D only |
| 12 | partida_price_residual_z_loo | +0.048 | Price vs same-partida peers (leave-one-out) | partida, amount | D only |
| 13 | same_day_count | +0.045 | Contracts with the same vendor, institution and date. **Ignores the DA cap** | `vendor_id`, `institution_id`, `contract_date` | A–D |
| 14 | win_rate | −0.045 | Competitive wins / competitive procedures | rolling | B–D |
| 15 | single_bid | +0.034 | Competitive procedure with one **awarded** vendor | `is_single_bid` | B–D (A: 100% labelled licitación, so meaningless) |
| 16 | industry_mismatch | +0.032 | Vendor's industry ≠ contract sector | `vendor_industries` | A–D |
| 17 | partida_direct_award_z_loo | −0.019 | DA rate vs partida peers | partida | D |
| 18 | direct_award | −0.016 | DA flag | `is_direct_award` | B–D |
| 19 | pub_delay_z | −0.008 | Publication delay | `publication_delay_days` (42% filled) | B–D partial |
| 20 | year_end | +0.005 | December contract | `is_year_end` | A–D |
| 21 | institution_diversity | +0.0004 | Vendor's institution HHI | rolling | A–D |
| — | co_bid_rate, price_hyp_confidence, institution_risk, amendment_flag, partida_single_bid_z_loo, inst_hhi_prior | 0 | Regularised out | | |

**Reading:**
- Features 1–4 hold most of the weight, and all four describe vendor scale and footprint.
- That is a sound fit to the labels, not a bug.
- But it means **"built on OECD indicators" describes the candidate inputs, not what drives the score.**

### 1b. ARIA pattern signals (`aria_pipeline.py:136-288`)

| Pattern | Rule as implemented | Inputs | Label-free? |
|---|---|---|---|
| P1 Concentrated monopoly | Sector value share >3% / 1% / 0.5%, plus top-institution and single-bid boosts | contracts | Yes |
| P2 Ghost company | EFOS definitivo → 0.90. Else **no RFC** + ≤2 yrs + ≤10 contracts + DA >80% + ≥1M | vendors, `sat_efos_vendors` | Yes (external list) |
| P3 Intermediary | `burst_score`: year-level burstiness, peak-year share, disappeared, intensity, short window | contracts | Yes. **The RFC-age (10%) and product-overlap (15%) terms in ARIA_SPEC § 5 are not implemented** (`aria_pipeline.py:295-387`) |
| P4 Bid rigging | Max pairwise `co_bid_rate`, plus single-bid | `co_bidding_stats`: co-award on the same `procedure_number` (`precompute_cobidding.py`) | Yes, but it is a co-award proxy |
| P5 Overpricing | avg/max z_price_ratio, industry mismatch, price hypotheses | z-features | Yes |
| P6 Institution capture | Top-institution ratio = 1 or >0.8, with >10 contracts | contracts | Yes |
| P7 Conflict of interest | 0.5 if in GT or EFOS | GT | **No** |
| External | EFOS definitivo (11,183), SFP sanctions (2,395), CENTINELA shell_score | lists | Yes |
| Ghost boost (moves live score) | `ghost_confidence_scores` ≥ 0.4 (5,480 vendors) | P2 vendors only | Yes. **`sig_young_company` = 0 on all 5,869 rows** (§ 4a) |

**Present in the DB and unused by model or ARIA:**
- `exception_article`: D, 83.8%.
- `opening_date` / `award_date`: the true ad period and decision period.
- `start_date` vs `contract_date` (retroactive start).
- `laassp_thresholds` (DA cap by year and type).
- The incorporation date encoded in the RFC.
- Buyer-side supplier share.
- `rupc_vendors` grades (5,401 graded).
- `gap_contracts.exception_article` (86% filled).

---

## § 2 Reference indicator sets

**A. Fazekas / Government Transparency Institute: Corruption Risk Index (CRI).** Sources:
- Fazekas, Tóth & King (2016), "An Objective Corruption Risk Index Using Public Procurement Data", *Eur. J. Crim. Policy Res.* 22(3).
- Fazekas & Kocsis (2020), "Uncovering High-Level Corruption: Cross-National Objective Corruption Risk Indicators Using Public Procurement Data", *Br. J. Polit. Sci.* 50(1).
- The GTI / World Bank ProACT indicator set.

Components:
- single bidder in a competitive tender;
- no call for tenders published;
- non-open procedure type;
- advertisement period (too short, with thresholds set per country from data);
- decision period (extremely short or long);
- call-for-tender modification;
- weight of non-price evaluation criteria;
- winner registered in a tax haven.

Winner-side extensions in the GTI literature: a newly registered winner, and the winner's share of the buyer's spending.

**B. OECD.** Sources:
- *Recommendation of the Council on Public Procurement* (2015).
- *Preventing Corruption in Public Procurement* (2016).
- *Integrity in Public Procurement: Good Practice from A to Z* (2007).
- *Guidelines for Fighting Bid Rigging in Public Procurement* (2009, revised).
- Mexico-specific: *Public Procurement Review of the Mexican Institute of Social Security* (2013) and *Fighting Bid Rigging in Public Procurement in Mexico* (2018).

Red flags:
- splitting purchases to stay under thresholds;
- unjustified exceptions to open tendering, especially urgency;
- short or irregular tender periods;
- repeated awards to the same supplier;
- post-award amendments and price increases;
- bid-rigging markers: rotation, cover bids, identical prices, losers subcontracted, a stable bidder set.

**C. World Bank.** Sources:
- INT *Fraud and Corruption Awareness Handbook* (2013).
- INT "Most Common Red Flags of Fraud and Corruption in Procurement".

Red flags:
- bidder complaints;
- multiple contracts just below the threshold;
- unusual bid patterns;
- inflated prices or agent fees;
- a suspicious bidder: newly formed, no track record, shared address;
- winner rotation;
- unexplained contract changes;
- poor delivery or quality.

**D. Open Contracting Partnership.** Sources:
- *Red Flags for Integrity: Giving the green light to open data solutions* (OCP & Development Gateway, 2016): 73 flags across planning, tender, award, contract and implementation.
- The computable subset in OCP's Cardinal library (codes per its docs; re-verify before external citation):
  - R003 short submission period;
  - R018 single bid;
  - R024 price close to the winning bid;
  - R025 excessive unit price;
  - R028 identical bid prices;
  - R035 all bids but the winner disqualified;
  - R036 lowest bid disqualified;
  - R038 excessive disqualified bids;
  - R048 heterogeneous supplier;
  - R058 heavily discounted bid.

**E. Mexico context.** IMCO, *Índice de Riesgos de Corrupción* (editions 2018–2023), on CompraNet. It scores buyer units on lack of competition, transparency gaps and legal anomalies, including recently created suppliers, SAT 69-B / sanctioned suppliers, and supplier concentration.

**Hard data limit for every bid-level flag:** the CompraNet bulk files list **awarded suppliers only**. Losing bids, prices, disqualifications and complaints live in PDF *actas*. `sidec_complaints` has 0 rows.

---

## § 3 Gap table

Each row gives the indicator, whether it is in our model, whether our columns can compute it, its coverage by structure (measured), and its value as an **unsupervised, explainable** signal.

Measured over 3,057,143 contracts:

| Structure | Contracts |
|---|---|
| A | 394,861 |
| B | 1,329,057 |
| C | 931,183 |
| D | 402,042 |

| Indicator (ref.) | In model / ARIA? | Computable? | Coverage A / B / C / D (measured) | Unsupervised value |
|---|---|---|---|---|
| Single bidder (A, B, C, D-R018) | Partial (β +0.034) | Yes, but it means "one awarded vendor", not one bidder | A unusable (100% "licitación") / B 17.5% / C 10.8% / D 10.2% flagged | Medium. CRI core, noisy without bid counts |
| No call / non-open procedure (A, B) | Partial (DA β −0.016) | Yes | A none / B 71.9% DA / C 78.2% / D 78.0% | Low per contract (it is the norm). Use as a buyer rate vs peers |
| Ad period too short (A, B, D-R003) | **No.** The model's field is contract − publication | Yes: `opening_date − publication_date`, tenders only | A 0 / B 0 / C 96% / D 99% of tenders. **Below the LAASSP reduced minimum of 10 days, licitación nacional: C 1,768 contracts in 1,088 of 49,816 procedures (2.2%); D 779 contracts in 510 of 21,363 (2.4%)** | **High.** Statutory basis, one-line explanation |
| Decision period extreme (A) | No | Yes: `award_date`/`contract_date − opening_date` | C 96% / D 21% of all rows (≈99% of tenders) | Medium. <5 days in licitación is C 27% / D 22%, so thresholds must come from data, as Fazekas does |
| Call modification (A, B) | No | **No** (junta de aclaraciones not in bulk data) | — | — |
| Non-price evaluation weight (A) | No | **No** | — | — |
| Tax-haven winner (A) | No | Partial (`vendors.country_code`) | 45 vendors, 131 contracts, 5.5B MXN | Low. Offshore owners sit behind Mexican RFCs |
| New-company winner (A-GTI, C, E) | **Dead** (`sig_young_company` never fires) | Yes: RFC positions 4–9 vs first `contract_date` | 12-char RFC parsed for 53,563 vendors (first contract in A 1,970 / B 15,528 / C 23,320 / D 12,745) | Medium (§ 4a) |
| Split under the DA cap (B, C) | Partial (same_day_count ignores the cap) | Yes, with `laassp_thresholds` | B / C / D (A has no DA recorded) | Medium-high (§ 4b) |
| Value bunching under the DA cap (B, C) | No | Partial. One federal-ministry cap per year/type is stored; the real cap varies by buyer budget band | Aggregate shows **no** bunching: the 90–100% band is 2.0% of contracts vs 2.4% in 80–90% | Low until per-buyer caps are loaded |
| Exception justification / urgency (B, E) | **No** | Yes: `exception_article` | **D only: 336,837 (83.8%)**; `gap_contracts` 84,787 / 98,290 | **High for D and 2025+** (§ 4e) |
| Amendments (B, C, D) | Zeroed (β 0) | Flag only, no amounts | B 1.7% / C 0.0% / D 3.0% | Low (under-reported) |
| Retroactive start (>30 days before signing) (B, C) | No | Yes: `start_date` vs `contract_date` | B 9,888 / C 2,953 / **D 24,879 (6.2%)** | Medium. Partly a framework call-off artefact |
| Buyer–supplier dominance (A-GTI, E) | Vendor-side only (P6) | Yes | A–D. Institution-years with ≥5 suppliers, ≥100 MDP and one supplier >50%: **635 of 19,241** (1.34T MXN) | Medium-high. Monopolies dominate, so it needs the FP screens |
| Long buyer–vendor tenure (B, C) | No | Yes | A–D | Low-medium (§ 4d) |
| Winner rotation / repeat bidders (B, C, D) | P4 (co-award proxy) | Partial (no bids) | B–D | Low without bid data |
| Identical / close / discounted bids, disqualifications (B, D) | No | **No** (no losing bids) | — | — |
| Sanctioned / blacklisted firm (B, C, E) | Yes (EFOS, SFP) | Yes | Depends on vendor RFC: A 37% / B 45% / C 68% / D 79% of contracts | Already in use |
| Year-end spending (B) | Yes (β +0.005) | Yes | A–D | Low |
| Excessive unit price (D-R025) | Partial (price_ratio, partida residual) | Partial (no quantities) | Partida in D only (98.5%) | Medium in D |
| Supplier performance (C) | No | Partial (`rupc_vendors`) | 5,401 graded; 4,032 at 100 | Low (grades saturate) |
| Execution / delivery problems (C) | No | No (needs ASF) | — | — |

---

## § 4 Signals raised in session, measured the same way

**Method:**
- GT is used only to **evaluate**, never inside a rule.
- "Raw lift" = the GT share among flagged vendors ÷ the GT share among all 320,429 contracting vendors (0.44%).
- "Size-matched lift" = observed GT ÷ the GT expected from each flagged vendor's half-decade total-value bin.
- GT is a size-biased sample of scandals. A size-matched lift near 1 means the signal is **independent of GT**: neither confirmed nor refuted. Analyst review is the real test.

| Signal | Vendors | GT | Raw lift | Size-matched | Tier 4 / absent from ARIA |
|---|---|---|---|---|---|
| 4a Incorporated <180 days before first contract | 2,654 | 49 | 4.2× | **1.04** | 2,456 |
| 4a … and ≥10 MDP all-time | 1,335 | 48 | 8.2× | **1.02** | 1,157 |
| 4b Any same-day DA split over the cap | 7,302 | 327 | 10.2× | **1.18** | 5,983 |
| 4b ≥3 such lots | 1,363 | 186 | 31× | **1.26** | 860 |
| 4b Strict (≥3 contracts, sum ≥2× cap), any lot | 1,503 | 161 | — | **1.33** | — |
| 4c Instant growth (>100 MDP in first year, 2011+) | 1,024 | 332 | 74× | **1.74** | 351 |
| 4a+4c New firm (<365 days) and instant growth | 51 | 13 | — | **1.13** | — |
| 4d ≥10 distinct active years with the same buyer | 5,271 | 303 | — | **0.87** | — |

### 4a. Incorporation date (RFC persona moral, positions 4–9 YYMMDD) vs first contract

- 53,565 vendors carry a 12-char RFC and 53,563 parse. The median gap is **5.0 years**.
- **<180 days: 2,654 vendors.** By first-contract structure: A 121 / B 874 / C 1,166 / D 493. They hold 263B MXN all-time.
- <365 days: 6,422.
- First contract **before** incorporation: 30 vendors. That is either a data error or an RFC reused from another firm; worth a manual look.
- **Why the existing signal is dead:**
  - `compute_ghost_confidence.py:131-186` only scores P2 vendors, and non-EFOS P2 *requires* no RFC.
  - It reads `company_registry.rfc_age_years`, which is age **today**, not at first contract.
  - Result: 0 of 5,869 fire.
- **FP:**
  - SPVs, per-tender consortia and group spin-offs.
  - Exclude 13-char RFCs: a persona física RFC encodes a birth date.
- **Coverage:** RFC holders only, skewed to C/D.

### 4b. Same-day DA lots that split a purchase under the cap

- **Rule:** same vendor, institution and `contract_date`; all direct awards; each amount < the year's federal-ministry DA cap for the contract type (`laassp_thresholds`; 2025 uses the 2024 cap); ≥2 contracts; and the sum > cap.
- **42,879 lots** (217,516 contracts, 30.0B MXN). By structure: B 17,945 / C 18,067 / D 6,867.
- **Strict version** (≥3 contracts, sum ≥ 2× cap): **9,992 lots**, 12.5B MXN. By structure: B 3,926 / C 4,267 / D 1,799.
- **Does not reproduce the in-session "13,437 lots".** That run's definition was not recoverable. Pin one definition before publishing any count.
- **FP:**
  - The real cap varies by buyer budget band (PEF annex), and a single national cap mislabels large buyers.
  - Legitimate multi-partida restocking orders.
  - Framework call-offs.

### 4c. Instant growth

- **Rule:** >100 MDP in the vendor's first calendar year of activity, first year ≥ 2011.
- **1,024 vendors**, 643.6B MXN in their first year.
  - By structure: B 548 / C 292 / D 184.
  - By first year: 163 in 2011, 85 in 2022, 82 in 2023, 46 in 2025.
- Without the 2011 floor: 1,580.
- At >1,000 MDP: 95 vendors (37 GT).
- **Does not reproduce the in-session "1,347".** That figure was probably a rolling 12-month window or a different floor.
- This is the only signal with a clearly positive size-matched lift (1.74).
- **FP:**
  - Subsidiaries of established groups under a new RFC.
  - Amount-entry errors (apply the >10B flag rule).

### 4d. Long buyer–vendor tenure

| Definition | Pairs | Vendors | Share of pair money | Size-matched lift |
|---|---|---|---|---|
| span (last − first + 1) ≥ 10 | 20,290 | 11,979 | 27.2% | 0.86 |
| **≥10 distinct active years** | **7,512** | 5,271 | **19.2%** | 0.87 |
| ≥10 active years and still active ≥ 2020 | 6,378 | 4,388 | 15.5% | 0.96 |

- The in-session "7,509 pairs, 19.2% of money" **reproduces** under the distinct-active-years definition.
- On its own, tenure is the normal state for utilities, patent holders, insurers and consolidated pharma, and the size-matched lift is below 1.
- **Only useful when conditioned on non-competition:** tenure ≥10 **and** ≥80% of the pair's value through DA/exception.

### 4e. Exception article (CompraNet D 2023–25 and ComprasMX `gap_contracts`)

**D:** 336,837 contracts carry an article (83.8%). Largest buckets, in contracts / MDP:

| Article | Contracts | MDP |
|---|---|---|
| LAASSP Art. 42 ¶1, by amount | 88,672 | 34,894 |
| Art. 41 fr. V, fortuitous event / force majeure | 59,229 | 54,878 |
| Art. 41 fr. XII | 38,117 | 38,041 |
| Art. 41 fr. XIV | 30,316 | 5,033 |
| Art. 41 fr. II, fortuitous event threatening public order or health | 22,795 | 117,650 |
| Art. 41 fr. I, single source / patent | 20,677 | 131,421 |
| Art. 41 fr. III, quantified losses or extra costs | 9,035 | 82,467 |
| Art. 41 fr. VII, licitación declared void | 7,275 | 33,074 |

- 2025 rows switch to the new LAASSP's Art. 54/55.
- **`gap_contracts`:** 84,787 of 98,290 carry an article. Top: Art. 55 ¶1 31,336 · Art. 54 fr. XII 18,500 · fr. XIV 10,120 · fr. I 6,038.
- **Three numbering systems are mixed:**
  - old LAASSP 41/42;
  - LOPSRM 42/43;
  - new LAASSP 54/55.
- Fraction meanings above are from the old LAASSP. **A verified article-to-reason crosswalk against the DOF text is a prerequisite.**
- `caso_fortuito` is never 1 and `gap_contracts.is_emergency` is never 1, so urgency **must** come from the article.
- **FP:** genuine emergencies and genuine patents. Always compare against partida-year peers, never in absolute terms.

---

## § 5 Recommendation: a «Señales nuevas» rule track (label-free, ≤8)

**Design:**
- Deterministic, explainable flags stored in a **new table** (per contract / vendor / buyer).
- Shown as their own badge and column in ARIA and in dossiers.
- **No GT in any rule or threshold.**
- **Acceptance gate:** analyst review of 50 random flags per rule. GT lift is reported only as size-matched context.

Ranked by statutory basis × explainability × coverage × independence from the current score:

1. **Ad period below the legal minimum.**
   - Rule: licitación with 0 ≤ `opening_date − publication_date` < 10 days.
   - Coverage: C/D tenders, ≈1,600 procedures.
   - FP: field semantics in C. Restrict to licitación, drop negatives, and spot-check 30 against CompraNet.
2. **Urgency / void-tender exception dependence.**
   - Rule: a buyer's or vendor's value share under force-majeure / urgency / void-tender articles, z > 2 vs partida-year peers. Also flag repeated "desierta → DA to the same vendor".
   - Coverage: D and ComprasMX 2025–26.
   - FP: real emergencies. Blocked on the DOF crosswalk.
3. **Split under the cap.**
   - Rule: ≥3 contracts same-day, same vendor and buyer, all DA, each < cap, sum ≥ 2× cap.
   - Coverage: B–D; 9,992 lots / 1,503 vendors.
   - FP: one national cap is used. Load per-buyer PEF caps before any public count.
4. **Instant growth.**
   - Rule: >100 MDP in the vendor's first activity year (2011+).
   - Coverage: 1,024 vendors.
   - FP: subsidiaries and amount errors. Exclude vendors in a known `corporate_group`.
5. **New firm.**
   - Rule: persona-moral RFC incorporation <180 days before first contract, and ≥10 MDP.
   - Coverage: 1,335 vendors (C/D-skewed).
   - FP: SPVs and consortia. Combined with rule 4 it gives 51 vendors, a small first review batch.
6. **Captured buyer.**
   - Rule: one supplier >50% of a buyer's year (≥5 suppliers, ≥100 MDP).
   - Coverage: 635 institution-years, A–D.
   - FP: patents, utilities, consolidated purchasing. Apply ARIA FP1/FP3.
7. **Retroactive start.**
   - Rule: `start_date` >30 days before `contract_date`, as a buyer/vendor rate vs peers.
   - Coverage: 37,720 contracts (D 6.2%).
   - FP: framework call-offs and formalisation lag.
8. **Long tenure without competition.**
   - Rule: ≥10 distinct active years with the same buyer **and** ≥80% of the pair's value by DA/exception.
   - Coverage: subset of 7,512 pairs.
   - FP: structural suppliers. Show it only alongside another flag.

**Not recommended now:**
- single bid as a standalone flag (awarded-vendor proxy, already in the model);
- tax haven (45 vendors);
- amendments (under-reported);
- value bunching (needs per-buyer caps);
- any bid-level OCP/OECD flag (no losing-bid data).

**Separate fix, not a new signal:** the model's `ad_period_days` is mis-specified (contract − publication). The correct field (opening − publication) exists for C/D tenders. Any change ships with the next retrain.

### Needs owner approval

- **Any change to live scores.** This includes:
  - feeding these flags into `risk_score`;
  - re-wiring `sig_young_company`, which moves live scores through the ghost boost;
  - changing IPS weights or tiers, for example a non-GT tier-1 lane;
  - correcting `ad_period_days` in a retrain.
- **Publishing any § 4 count** (site, press, film). 4b and 4c do not reproduce the in-session numbers. Pin the definitions first.
- The track itself (a new table plus a badge) does **not** touch scores. It is a build decision.
