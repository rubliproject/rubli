# Taxonomy subcategory study — should RUBLI LLM-reclassify 3.06M contracts into ~100 categories?

**Date:** 2026-10-07 · **Status:** feasibility study, no DB writes · **Author:** taxonomy agent (read-only)

**Method:** one sequential read-only pass over `contracts` in `RUBLI_NORMALIZED.db` (`mode=ro`): 3,057,143 rows, 19 min.
This pass produced the per-era × category aggregates, the era-D category × CUCOP-genérica cross-tab and the distinct-description counts.
Two random samples via `idx_c_category` (60 titles × 7 categories, and 3,000 rows of category 57) were used to check misfiling.
Value means `amount_mxn ≤ 100B`; risk means `risk_score_v8`.
Scratch scripts and outputs live in `_weekend/_tax_text.py`, `_tax_profile.json` and `_tax_samples.txt` (untracked).

---

## TL;DR

1. **The biggest problem isn't granularity — it's a regex bug.** In `classify_categories.py`, category 57 (Food & Provisions) has a bare `|res|` alternative. It matches **PRESTADOR**, **RES**PUESTA, **RES**IDUOS, eleva**DORES** and other words that merely contain "res".
   - In a 3,000-row random sample of cat 57, **43.7% of contracts match the food pattern only through that substring**. Those rows carry **65.7% of the sampled value** (a heavy-tailed, noisy estimate).
   - Food & Provisions is the #3 category: 470,560 contracts, 931B MXN. Its top institution is PEMEX Exploración y Producción.
   - The figure is used in public copy: *el-sexenio-del-riesgo* ch4 says "Alimentos 252.2B / 165,518 contracts".
   - 37 other bare ≤4-letter tokens carry the same risk, e.g. `bien` (cat 92, matches BIEN**ESTAR**/bienes), `obra` (cat 91, matches man**iobra**/c**obra**nza), `uso` (cat 64), `mole` (matches **mole**cular), `bata` (matches **bata**llón).
2. **The real catch-all load is 15.3% of contracts / 17.3% of value, not 0.27%.** It sits in six "General X" buckets (86/88/90/91/92/89). Most of it comes from the **sector fallback** in `classify_categories.py:453`: salud→22, infra→88, energía→86, defensa→92, hacienda/gobernación/trabajo→91.
   - The "99.73% covered" claim counts those buckets as classified.
   - By era, the catch-all share is A 17.0% → B 22.0% → C 9.9% → D 3.9%.
3. **The LLM pass is cheap; validation and downstream churn are the real costs.**
   - The corpus has **1,278,444 distinct normalized descriptions** (41.8% of rows) and ~178M characters, about 50–70M input tokens.
   - A full pass on Batch costs **≈ $400 on Opus 5.5, ≈ $150 on Sonnet 5.5 and ≈ $75 on Haiku 4.5**. A scoped pass costs about a third of that.
4. **No live risk score depends on category.** All 18 v0.8.5 features use sector × year baselines (`compute_z_features.py`, `contract_z_features_v2`), and ARIA doesn't read `category_id`. A reclassification therefore needs **no retrain**.
   - It does change `/categories`, the `/sectors` WHAT axis, the `/atlas` category lens, category signals, every typed category figure in stories, and the public dataset (an export is running right now).
5. **"~100" is the wrong framing for a flat list.** Use three levels:
   - **~20 families**, aligned to CUCOP genéricas rather than to the 12 ramo sectors.
   - **~85–95 categories** (the cleaned 72 plus ~20 splits, minus ~7 merges).
   - **~200–300 subcategories**, analytic and drill-down only.
   
   Education, Gobernación and Trabajo having one category each is an artifact of mapping a *what* axis onto a *who* axis. It isn't a gap to fill.
6. **Recommendation: a SCOPED version, in phases.**
   - **Phase 0** (deterministic, ~free): fix the token bugs, extend the CUCOP partida override, and re-measure.
   - **Phase 1:** an LLM pass only on the catch-all rows, the bug-moved rows and the low-information residue, validated against era-D CUCOP silver labels plus a 1,500-row hand-labeled gold set.
   - **Phase 2:** the L3 subcategories.
   - Nothing ships to prod before the Oct 24 freeze without an owner decision, because typed story figures move.

---

## 1. How category is assigned today

Three layers are applied in order (scripts are on main since `3c076959`/`c465dffb`, Oct 6):

| Layer | Script | Rule | Rows |
|---|---|---|---|
| 1. Title regex | `classify_categories.py` | 72 ordered regexes (ids 20–93) on `strip_accents(lower(title))`; first match wins | majority |
| 1b. Description rescue | same | when the title has no specific match, re-try on title + description (C/D only, since A/B have no description) | — |
| 1c. **Sector fallback** | same, `:453` | unmatched rows go to a sector default: 1→22, 2→82, 3→88, 4→86, 5→92, 6→34, 7/8/11→91, 9→85, 10→72, 12→89 | most of the catch-all load |
| 2. CUCOP override | `cucop_classify.py` | era D only: catch-all rows (88–92) whose 3-digit genérica maps to a specific category get overridden (`category_source='cucop'`) | **21,174** |
| (L2) Subcategories | `compute_subcategory_stats.py` | regex sub-items for 18 categories, 150 subcategories | stats only |

There is no ML anywhere in the chain. The Oct 6 deploy (168,351 rows: 21,174 CUCOP + 147,177 regex re-run) synced prod to this source state; see `_weekend/drift/category_sync_plan.md`.

### Coverage by COMPRANET era

| Era | Contracts | Value | partida | description | catch-all share (contracts) | catch-all share (value) | "Other" (89) share (contracts) | garbled "ý" |
|---|---|---|---|---|---|---|---|---|
| A 2002–10 | 394,861 | 2.64T | 0% | 0% | **17.0%** | 18.1% | 0.15% | **140,918** |
| B 2010–17 | 1,329,057 | 3.31T | 0% | 0% | **22.0%** | 27.4% | 0.09% | 0 |
| C 2018–22 | 931,183 | 2.39T | 0% | 94.0% | 9.9% | 12.0% | 0.01% | 1 |
| D 2023–25 | 402,042 | 1.53T | **98.5%** | 98.5% | 3.9% | 2.6% | 0.03% | 0 |
| **All** | 3,057,143 | 9.87T | 13.0% | 41.6% | **15.3%** | **17.3%** | 0.06% | 140,919 |

Catch-all = 86 Machinery & Equipment, 88 General Maintenance, 90 Materials & Supplies, 91 General Services, 92 General Equipment and 89 Other. Era B is the worst: it is title-only and has the largest volume (91 alone holds 8.5% of B).

### Size distribution (72 active categories)

- Median category: 18.5K contracts. 19 categories have fewer than 5K contracts and 5 have fewer than 1K: 39 Renewable 130, 74 Air Quality 325, 62 Arms 350, 73 Water Treatment 929, 48 Forms 990.
- The top 5 categories hold **46.5% of value** and the top 10 hold **68.4%**.
- The largest categories:

| id | Category | Contracts | Value | era-D genéricas ≥30 rows | top genérica share | between-genérica SD of DA rate | v8 SD | Note |
|---|---|---|---|---|---|---|---|---|
| 26 | Building Construction | 132,273 | 1,236B | 36 | 14% | 0.23 | 0.126 | extremely heterogeneous works |
| 20 | Medications | 261,777 | 1,122B | 23 | 89% (253) | 0.04 | **0.287** | heterogeneity is *within* 253 (therapeutic class, patent vs generic) |
| 57 | Food & Provisions | 470,560 | 931B | **85** | 46% (238) | 0.16 | 0.156 | **regex bug**, see §1a |
| 27 | Road & Highway | 69,489 | 683B | 14 | 36% | 0.20 | 0.137 | |
| 91 | General Services | 175,551 | 616B | 5 | 89% (339) | 0.05 | 0.177 | catch-all |
| 22 | Medical Supplies | 338,593 | 486B | 30 | 52% (254) | 0.07 | 0.177 | salud fallback; 19% of era-D rows are medicines (253, 58B) |
| 88 | General Maintenance | 83,891 | 470B | 3 | 83% (357) | 0.05 | 0.140 | catch-all (infra fallback) |
| 24 | Hospital Services | 68,623 | 455B | 32 | 54% (339, 82B) | 0.18 | 0.182 | subrogated services mixed with in-house ones |
| 28 | Water Infrastructure | 43,051 | 410B | 18 | 19% | **0.32** | 0.150 | top vendor is Dowell Schlumberger (oil wells, a `pozo` false positive) |
| 86 | Machinery & Equipment | 70,725 | 346B | 7 | 30% | 0.16 | 0.143 | catch-all (energía fallback) |

**Overloaded catch-alls**, ranked by value × heterogeneity: **57** (bug), **91**, **88**, **22**, **86/90/92**, **24** and **26**.

The existing regex L2 subcategory layer fails exactly here. Its "other" subcategory holds **97.8%** of category 22's value, 90.6% of 91, **99.0%** of 90, 97.5% of 88, **99.6%** of 86 and 90.4% of 24.

### 1a. The Food & Provisions bug

The cat-57 regex (`classify_categories.py:198–216`) contains `|res|` (meant as *carne de res*) with no word boundary. Because 57 is evaluated before the sector fallback, any title containing "res" that no earlier category caught lands in Food: *PRESTADOR DE SERVICIOS PROFESIONALES*, *ELABORACION DE RESPUESTA A PROFEPA*, *MANTTO. Y RECARGA EXTINTORES*, *CANTANTE… TENOR*.

- In the 3,000-row sample, 1,311 rows (43.7%) match **only** via `res`. They carry 65.7% of the sampled value.
- By 5-year bucket: 2000–04 21, 2005–09 92, 2010–14 287, 2015–19 494, 2020–24 364, 2025 53.

The other bare tokens below should be bounded with `\b…\b` and audited the same way. The (category, token) pairs are:

| Category | Bare tokens |
|---|---|
| 24 | umae |
| 28 | pozo |
| 31 | sap, java, web |
| 32 | ups, ipad |
| 34 | nube |
| 45 | clip |
| 55 | foro |
| 56 | spot |
| 57 | atun, miel, sopa, **res**, **papa**, jugo, flan, nuez, soya, **mole**, **taco** |
| 58 | menu |
| 61 | domo |
| 63 | aseo |
| 64 | **uso** |
| 75 | **bata**, ropa |
| 76 | **tela** |
| 78 | visa |
| 79 | utp, foco, **led** |
| 82 | beca |
| 86 | grua |
| 91 | **obra** |
| 92 | **bien** |

The unbounded `pan.{0,5}` and `sal.{0,5}` in cat 57 have the same issue.

The sector fallback is the second structural cause. When a health-ramo title doesn't match, it becomes "Medical Supplies", which is why cat 22's era-D agreement with its official CUCOP code is only 52%.

---

## 2. Text available per contract

| Field | A | B | C | D |
|---|---|---|---|---|
| `title` | 100% | 100% | 100% | 98.5% |
| `description` | 0% | 0% | 94% (often = title) | 98.5% (often boilerplate: "EL PROVEEDOR SE OBLIGA…") |
| `partida_especifica` (CUCOP) | 0% | 0% | 0% | **98.5%** — 4,916 distinct specíficas, 182 genéricas |

**Dedupe drives cost.** The key is lower-cased, accent-stripped, digit-masked text, using title alone or title ‖ description when the two differ.

| Era | Distinct keys | Rows | Rows per key |
|---|---|---|---|
| A | 122,978 | 394,861 | 3.2 |
| B | 595,038 | 1,329,057 | 2.2 |
| C | 403,546 | 931,183 | 2.3 |
| D | 180,247 | 402,042 | 2.2 |
| **Total** | **1,278,444** | 3,057,143 | 2.4 |

- Title-only distinct count: 1,103,541.
- Characters: 307M across all rows, **178M across distinct keys** (mean 139 characters per key). 724,611 keys are under 100 characters and 312,708 are 100–199.
- Only 2,253 keys carry more than one category today. The regex is deterministic on text, and sector fallback causes that small residue.
- **A sizeable share of titles carries no information**, e.g. "Contrato", "CONTRATO/PEDIDO", "CO-382-LP-A-PE-013/2012", "800667396". In the 60-title catch-all samples this was roughly ¼–⅓ of cat 91. No text classifier, LLM included, can label these. They need context: the vendor's modal category, the institution and the amount. Plan for an "insufficient text" output plus a context fallback.
- **IMSS group codes** ("INSUMOS DEL GRUPO 010 Y 040"; 010 = medicines, 060 = curación…) are deterministic hints sitting in titles that the current classifier sends to 92/90.
- **Garbled 2003–10 titles** (140,918, all in era A; 35,610 of them in catch-alls): accents collapsed to `ý` (`Rehabilitaciýn`). The regex fails on any accented keyword, because strip_accents can't recover `ý`. **An LLM reads these almost losslessly**, which is one of the few places it clearly beats a regex fix. Text recovery itself stays dead-ended (see memory note).

---

## 3. Is ~100 the right number?

### What the data says

- **The natural hierarchy is CUCOP:** 7 capítulos → 182 genéricas present → 4,916 specíficas (era D). Our 72 categories sit between capítulo and genérica. Any finer level should align to genérica so era D gets free, authoritative labels and A–C labels stay comparable.
- **Split value comes from internal variance, not size.** Splitting helps where a category mixes procurement regimes, i.e. a high between-genérica SD of DA rate or risk, or a high v8 SD.
  - Strong candidates: 28 (DA SD 0.32), 26 (0.23), 21 (0.23), 23 (0.22), 69 Insurance (0.28, v8 SD 0.31), 70 Financial (0.41, v8 SD 0.36), 33 Telecom (v8 SD 0.30), 37 Fuels (v8 SD 0.32) and 20 Medications (v8 SD 0.29).
  - Low value: 56 Advertising (DA SD 0.01; 96% DA regardless) and 64 Cleaning Supplies (v8 SD 0.07).
- **Minimum size floor.** With v8 SD ≈ 0.15–0.30, a category mean is stable to ±0.01 at n ≈ 1,000. Yearly series across 24 years and per-institution cuts need roughly **≥2,000 contracts and ≥30 vendors** for a public category, and ≥200 for an L3 subcategory shown only on drill-down. Seven current categories fall below 1.2K: 39, 74, 62, 73, 48, 66, 71. Merge them into a parent or demote them to L3.
- **Display.** `/categories`, the `/sectors` WHAT axis and the atlas lens are designed around ~70 rows. A flat 100 breaks bar-mekko and treemap legibility. Two levels with ~20 families on top keeps every view at ≤25 marks per level.
- **The sector "gap" is false.** Education buys food, school construction (INIFED), textbooks and catering; the category axis is *what was bought*. Forcing categories under the 12 ramo sectors produced "otros = ~40 categories, educación = 1". Don't invent education-flavored categories to fill the tree. Instead, decouple category families from sectors and show sector × category as a matrix.

### Proposed scheme

| Level | Count | Basis | Public? |
|---|---|---|---|
| L1 Family | ~20 | CUCOP genérica groups: Medicines; Medical goods; Health services; Food; Construction works; Maintenance; Energy & fuels; IT & telecom; Professional services; Financial & insurance; Security & defense; Transport & logistics; Office & print; Facilities services; Equipment & machinery; Materials; Media & events; Agriculture; Environment & water; Social/benefits | yes (top-level chart) |
| L2 Category | **~85–95** | today's 72, cleaned + ~20 splits of catch-alls − ~7 merges | yes (`/categories` list) |
| L3 Subcategory | ~200–300 | CUCOP genérica (D: deterministic) + LLM for A–C | drill-down only, n ≥ 200 |

Target **L2 ≈ 90 as an outcome, not "100" as a goal.** The catch-all buckets should shrink to <5% of contracts in every era.

### Example splits for the top 5 overloaded categories

1. **57 Food & Provisions.** Fix `res` first, then split:
   - **Programa de Abasto Rural / goods for resale** (genérica 238, Diconsa/Alimentación para el Bienestar; 46% of era-D rows, 97% DA)
   - **Institutional food for persons** (221)
   - **Grocery-voucher programs** (*vales de despensa*: Edenred/Toka; a financial instrument; move to Financial Services)
   - **Animal feed** (222 → Agriculture)
   - Non-food Diconsa resale (detergent, brooms, *jarciería*) → Cleaning Supplies / Resale goods
2. **91 General Services** (89% genérica 339 in D):
   - **Individual professional services / honorarios** (persona física contractors)
   - **Third-party subcontracting (IMSS "subcontratación de servicios con terceros")**
   - **Audiovisual & broadcast production** (SEP *Aprende en Casa*, Canal Once crews)
   - **Integral services** (319)
   - **Works supervision** → Architecture & Engineering
   - **Gardening/pruning** → Facilities
   - **Postal/courier** → Logistics
3. **26 Building Construction** (1.24T; 36 genéricas):
   - **Non-residential buildings** (622)
   - **Schools** (plantel/INIFED rehab)
   - **Health facilities**
   - **Other civil engineering / megaprojects** (626; 86.7B in era D alone)
   - **Urbanization & land division** (613/624)
   - **Finishes & installations** (629)
   - **Minor building conservation** (351 → Building Maintenance)
4. **22 Medical Supplies:**
   - **Medicines misfiled** (253, 19% of era D, 58B → cat 20)
   - **Material de curación** (254)
   - **Lab supplies** (255 → 23)
   - **Cleaning & office** (216/211 → 64/45)
   - **Unspecified health fallback**: an explicit residual, not silently "Medical Supplies"
   - Within 20 Medications, an L3 split by **therapeutic class** (oncology, antiretrovirals, insulins, vaccines, blood products) and **patent vs generic**, which is risk-relevant because single-source patent DA is expected. Neither split is in CUCOP. This is where an LLM adds the most.
5. **88 General Maintenance + 86/92 equipment catch-alls:**
   - **Machinery & equipment maintenance** (357; with medical-imaging maintenance → 354 Medical)
   - **Power-plant & industrial maintenance** (CFE C.H., PEMEX)
   - **School/building rehabilitation** → Construction/Maintenance
   - **Road paving** (pavimentación → 27)
   - **Green areas**
   - From 92: **asset insurance** (*aseguramiento de bienes patrimoniales* → 69), **computer consumables** (→ 32), **medical equipment** (→ 21), **construction machinery** (562), **spare parts** (29x)
6. **24 Hospital Services:**
   - **Subrogated clinical services** (hemodialysis, imaging, integral lab; 339, 82B in D)
   - **Hospital operations outsourcing**
   - **Medical waste** (358; 16.9B in D, v8 0.315, a risk outlier worth its own row)

---

## 4. Cost and time for an LLM pass

Pricing is the Anthropic first-party list (claude-api skill, cached 2026-09-25). The Batch API is −50%. Cache reads are $0.20/M on Opus 5.5 and Sonnet 5.5 (×0.5 in batch, *assuming the discounts stack*).

| Model | Input / Output per MTok | Batch | Notes |
|---|---|---|---|
| Opus 5.5 `claude-opus-5-5` | $4 / $20 | $2 / $10 | Thinking can't be disabled. Use `effort: low`; forced `tool_choice` returns 400, so use `output_config.format` |
| Sonnet 5.5 `claude-sonnet-5-5` | $2 / $10 | $1 / $5 | `thinking: {type: "between_tools"}` turns thinking off |
| Haiku 4.5 `claude-haiku-4-5` | $1 / $5 | $0.5 / $2.5 | No thinking by default |

**Assumptions:**
- 1.28M distinct keys, truncated to 400 characters, ≈ 55 tokens each including id and markup → **~70M input**.
- 200 keys per request → 6.4K requests (one batch; the limit is 100K requests).
- A ~10K-token cached taxonomy prompt with definitions and examples → 64M cache-read tokens.
- Output ≈ 12 tokens per key (`id|code|conf`) → 15M, plus Opus low-effort thinking ≈ 1.5K per request → 10M.

| Scope | Opus 5.5 | Sonnet 5.5 | Haiku 4.5 |
|---|---|---|---|
| Full (1.28M keys) | ≈ $400 (≈ $520 if batch caching misses) | ≈ $150 | ≈ $75 |
| Scoped (~0.4M keys: catch-alls, bug-moved rows, health fallback, era-D broad genéricas 339/357/238/319) | ≈ $130–170 | ≈ $50 | ≈ $25 |
| Adjudication pass on low-confidence/disagreeing ~10%, Opus `medium` | +$40–60 | — | — |

The token figures are estimates. Before spending, run `messages.count_tokens` on a 1K-key sample; the Opus 4.7+ tokenizer can count ~1–1.35× more tokens.

**Wall-clock:** the batch returns in under 24h, usually a few hours. **Engineering ≈ 4–6 days:**

| Work | Days |
|---|---|
| Taxonomy + CUCOP crosswalk | 1–1.5 |
| Prompt + pilot | 1 |
| Gold labeling (1,500 rows ≈ 6–8 h human) | 1–1.5 |
| Apply + precompute chain + story re-checks | 1–2 |

Dollars are not the constraint.

**Opus vs Sonnet vs Haiku.** Pilot 2,000 keys on all three (≈ $5 total) against the silver and gold sets, then pick the cheapest model within 2pp macro-F1 of the best.
- The expected winner for the bulk pass is Sonnet 5.5. Short Spanish procurement titles are a closed-set classification task.
- Use Opus for the adjudication pass and for the L3 therapeutic-class work on medicines.
- Haiku is a fallback if Sonnet's lead is under 2pp.

### Validation plan

1. **Silver labels (era D).** Build a CUCOP genérica → L2 crosswalk for the *specific* genéricas only (exclude 339, 357, 238, 319, 399 and the 4xxx transfers). That yields ~250K era-D contracts with authoritative labels.
   - The LLM classifies their text **blind** to partida.
   - Report per-category precision/recall. Today's regex agreement with the CUCOP suggestion is a useful baseline: 20 Medications 89%, 91 93%, 57 49%, 22 52%, 26 39%, 24 0% (the 0% is partly a crosswalk-granularity effect).
2. **Gold sample.** 1,500 contracts stratified by era × predicted L2, over-weighting era A garbled rows, era B title-only rows and catch-all rows.
   - Two annotators label 300 of them; Cohen's κ must be ≥0.8 before the rest is trusted.
   - Score current regex vs LLM on the same rows.
3. **Acceptance:**
   - LLM beats regex by ≥15pp accuracy on catch-all strata.
   - No public L2 category below 85% precision.
   - Catch-all share <5% in every era.
   - "insufficient text" is routed to the context fallback (vendor modal category, then institution), never guessed.
4. **Drift guard.** Diff Σ`category_stats.total_contracts` and value per category before and after. Any category moving by more than 20% needs a written reason. Food is expected to fall by ~40%.

### Downstream impact

| Surface | Impact |
|---|---|
| **Risk model v0.8.5** | **None.** All 18 features use sector × year baselines (`compute_z_features.py` `factor_baselines` keyed `(sector_id, year)`); `price_ratio` = amount / sector median. No category feature, no retrain, no rescore. |
| v0.9 (paused) | Upside. `compute_partida_baselines.py` already builds per-genérica baselines "for the next retrain"; clean A–C categories would let those baselines extend before 2023. Retrain implications sit there, not here. |
| ARIA | None (no `category_id` in `aria_*`). |
| Precomputes | Re-run the chain from `category_sync_plan.md` §5: `compute_category_stats` → cohort counts → avg risk → accents → top vendors → enrichments → `precompute_institution_categories` → `compute_subcategory_stats` → category signals → atlas lens → overview keys. A copy-then-swap recipe already exists (`chain.sh`). |
| Schema | Add `category_l1`, `subcategory_id`, `category_source` ('regex'/'cucop'/'llm'/'context') and **`taxonomy_version`**. Keep `_contracts_category_backup_<date>` for rollback. |
| UI | `/categories` gets a family level plus drill-down; the `/sectors` WHAT axis shows families; the atlas CATEGORIES lens has ~20 attractors instead of 72. `name_es` + `name_en` are needed for every new node. |
| Stories / face copy | Every typed category figure must be re-verified, as on Oct 6 (*el-sexenio-del-riesgo* ch2/ch4). The Food bug means **current published Food figures are already overstated**. |
| Dataset release | The export running now ships `category_id` under the current taxonomy. Version it (`taxonomy_version=2026-10`) so a later v2 is an additive column, not a silent redefinition. |
| CLAUDE.md honest pitch | "72 active categories covering 99.73%" should read "…15% of contracts sit in General-X fallback buckets". |

---

## 5. Recommendation

**Do a scoped version.** Don't LLM-label all 3.06M rows to hit 100 categories. Most of the gain is deterministic, and the LLM is only needed where text is the sole signal (eras A–C catch-alls, garbled era A and medicines L3).

| Phase | What | Cost | Ships? |
|---|---|---|---|
| **0 — now (no prod writes)** | Bound the 38 bare tokens (`\bres\b` etc.) and re-run `classify_categories` on a **copy**. Add IMSS-grupo and asset-insurance rules. Extend the CUCOP override to all era-D rows whose genérica is specific, not only catch-alls. Measure movers. | ~1 day, $0 | Owner decision. It fixes an already-published overstatement but moves story figures before the Oct 24 freeze. |
| **1 — after freeze** | Design L1 families + the L2 ≈ 90 list with the splits above, and the CUCOP crosswalk. Run a 2K-key three-model pilot, then the batch LLM over the **scoped ~0.4M keys** (catch-alls, sector-fallback rows, era-A garbled, low-confidence regex). Validate per §4; apply with `taxonomy_version`. | ~4 days, ≈ $50–200 | yes, with the precompute chain + story re-check |
| **2** | L3 subcategories (~250): CUCOP genérica for D, LLM for A–C (including the medicines therapeutic class and patent/generic split). Replace the regex `subcategory_definitions` layer. | ~3 days, ≈ $100–300 | drill-down only |
| **3 (v0.9)** | Evaluate category/genérica-relative price and DA baselines as model features. | in v0.9 plan | retrain-gated |

**Don't:** chase "~100" as a target, create categories to fill Education/Gobernación/Trabajo, or run the full 1.28M-key pass before Phase 0. Phase 0 changes what the residue even is.
