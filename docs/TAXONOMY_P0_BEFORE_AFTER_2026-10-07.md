# Taxonomy Phase 0 — category before/after (measured on a DB copy)

**Date:** 2026-10-07 · **Branch:** `fix/taxonomy-p0` (worktree `.claude/worktrees/tax-p0`; not pushed or deployed) · **Follows:** `docs/TAXONOMY_SUBCATEGORY_STUDY_2026-10-07.md`

**Scope.** The run used `_weekend/tax_p0/RUBLI_P0.db`, an 8.4 GB `sqlite3.backup` copy of `RUBLI_NORMALIZED.db` read in `mode=ro`. Neither `RUBLI_NORMALIZED.db` nor prod was written. "Before" is the copy's state at copy time, which equals source and prod after the Oct 6 sync.

**Run sequence:**
1. Snapshot the old labels to `_p0_before`.
2. `python -m scripts.classify_categories --db …RUBLI_P0.db`
3. `python -m scripts.cucop_classify --db …`
4. `_weekend/tax_p0/compare.py` + `report.py`

**Replication check.** The "before" figures reproduce the live story numbers exactly: Medicamentos 393.7B / 157,293 contracts, 0.374 → 0.310; Alimentos 252.2B / 165,518 contracts; Hospital 217.3B / 32,160 contracts. The comparison uses the same aggregation as `compute_category_stats` and `/categories/sexenio`: raw `SUM(amount_mxn)`, and the mean of the yearly `AVG(risk_score)`.

## What changed in the code

| Change | Effect |
|---|---|
| 37 bare short tokens got `\b` boundaries: `res`, `papa`, `pan`, `sal`, `crema`, `mole(s)`, `taco`, `bien`, `obra`, `bata`, `ropa`, `tela`, `visa`, `foco`, `led`, `beca`, `grua`, `sap`, `java`, `ups`, `ipad`, `nube`, `clip`, `foro`, `spot`, `atun`, `miel`, `sopa`, `jugo`, `flan`, `nuez`, `soya`, `menu`, `domo`, `aseo`, `umae`, `pozo` | `pozo` no longer catches oil wells (`(?!…petrol|gas|perfora|explora)`). Note: `uso`, `web` and `utp` in the study's list were in fact inside groups, so they were never bare. |
| Mid-length substring tokens that the study missed, found by probing | `ducto` (Oil & Gas) caught **PRODUCTOS**. `racion` (Catering) caught **ADMINISTRACION / REPARACION / OPERACION / ELABORACION**. `curso` (Training) caught **CONCURSO / RECURSOS**. `presa` (Water) caught **EMPRESA**. `monitor` / `servidor` (Hardware) caught **MONITOREO / SERVIDORES PÚBLICOS**. `premium` caught any "servicio premium" and was dropped. `estancia` (Lodging) caught **ESTANCIAS INFANTILES**. |
| Found on the copy run, once `res` stopped masking them | `prestacion` (Pensions) caught **PRESTACIÓN DE SERVICIOS**: 26.8K rows / 67.7B on the first pass. `valuacion` (Real Estate) caught **EVALUACIÓN**. `seguro` (Insurance) caught **Instituto Mexicano del SEGURO SOCIAL**. All three are now bounded. |
| `productos? alimenticios?` | The plural form never matched Food. Before this change it fell to Oil & Gas through `ducto`. |
| `classify_text()` extracted, plus `--db` on both scripts | Pure and testable. Sector-fallback rows are now tagged `category_source='fallback'` (389,420 rows). |
| CUCOP override widened (`cucop_classify.py`) | It now covers catch-alls (86 added), any `fallback` row, and any label for genérica **253** (medicines). Result: **50,224 rows / 173.3B**, against 21,174 before. |
| `backend/tests/test_classify_categories_tokens.py` | 30 `no_db` tests, including a guard that no bare ≤4-letter alternative remains. All pass. |

## Headline

- **382,810 contracts (12.5%) and 1,164.1B MXN (11.8% of value) change category.** No contract amount, risk score, vendor, institution or sector changes.
- **Food & Provisions: 470,560 → 280,632 contracts and 930.8B → 319.7B (−66%).** Catering −81%, Oil & Gas −92% by count, Water Infrastructure −104B. These are corrections, not reclassifications by judgement.
- **The General-X share rises: 15.3% → 20.1% of contracts and 17.3% → 22.7% of value.** This is the honest direction. Rows that used to be mislabelled as a specific category now sit in General Services/Maintenance. This is exactly the residue Phase 1 (the scoped LLM pass) is for.
- The `/categories` "half of it fits on N shelves" count (k50) stays at **6**.

## Per-category before → after (all 72; * = General-X bucket)

| id | Category | Contracts before | after | Δ | Value before | after | Δ |
|---|---|---:|---:|---:|---:|---:|---:|
| 26 | Building Construction | 132,273 | 134,749 | +2,476 | 1,236.2B | 1,247.9B | +11.6B |
| 20 | Medications & Pharma | 261,777 | 273,430 | +11,653 | 1,121.7B | 1,189.7B | +68.1B |
| 57 | Food & Provisions | 470,560 | 280,632 | -189,928 | 930.8B | 319.7B | -611.1B |
| 27 | Road & Highway | 69,489 | 70,101 | +612 | 683.0B | 686.4B | +3.4B |
| 91 | General Services * | 175,551 | 254,312 | +78,761 | 616.0B | 896.9B | +280.9B |
| 22 | Medical Supplies | 338,593 | 344,530 | +5,937 | 486.3B | 442.3B | -44.0B |
| 88 | General Maintenance * | 83,891 | 114,887 | +30,996 | 469.7B | 587.6B | +117.9B |
| 24 | Hospital Services | 68,623 | 69,185 | +562 | 455.0B | 460.9B | +5.9B |
| 28 | Water Infrastructure | 43,051 | 38,075 | -4,976 | 410.1B | 306.3B | -103.8B |
| 86 | Machinery & Equipment * | 70,725 | 85,222 | +14,497 | 345.7B | 389.1B | +43.4B |
| 21 | Medical Equipment | 97,324 | 99,753 | +2,429 | 293.4B | 299.1B | +5.7B |
| 90 | Materials & Supplies * | 99,152 | 115,635 | +16,483 | 225.9B | 301.5B | +75.6B |
| 37 | Fuels & Lubricants | 29,543 | 29,664 | +121 | 204.8B | 219.0B | +14.3B |
| 40 | Oil & Gas Operations | 55,045 | 4,168 | -50,877 | 203.1B | 169.0B | -34.1B |
| 58 | Catering & Meals | 95,097 | 14,606 | -80,491 | 198.0B | 37.7B | -160.4B |
| 23 | Lab & Diagnostics | 77,932 | 79,493 | +1,561 | 192.4B | 193.3B | +0.9B |
| 69 | Insurance & Bonds | 7,582 | 10,750 | +3,168 | 124.0B | 174.8B | +50.9B |
| 32 | Hardware & Computers | 37,549 | 27,708 | -9,841 | 109.1B | 55.5B | -53.6B |
| 60 | Private Security | 29,793 | 34,401 | +4,608 | 108.8B | 132.1B | +23.3B |
| 63 | Cleaning Services | 76,017 | 82,361 | +6,344 | 95.6B | 104.3B | +8.7B |
| 72 | Environmental Services | 31,474 | 38,670 | +7,196 | 90.4B | 105.7B | +15.4B |
| 41 | Vehicles & Fleet | 24,541 | 25,388 | +847 | 88.5B | 98.8B | +10.3B |
| 33 | Telecom & Networks | 18,521 | 19,846 | +1,325 | 82.2B | 85.0B | +2.7B |
| 34 | IT Services & Consulting | 10,657 | 12,175 | +1,518 | 78.9B | 87.7B | +8.9B |
| 31 | Software & Licenses | 16,023 | 15,303 | -720 | 69.0B | 61.2B | -7.8B |
| 47 | Printing & Publications | 42,098 | 44,579 | +2,481 | 60.5B | 62.3B | +1.8B |
| 75 | Uniforms & Clothing | 31,779 | 33,960 | +2,181 | 53.5B | 62.3B | +8.8B |
| 50 | Accounting & Audit | 19,185 | 23,102 | +3,917 | 52.3B | 56.9B | +4.6B |
| 29 | Electrical Infrastructure | 15,534 | 15,587 | +53 | 51.3B | 51.4B | +0.1B |
| 92 | General Equipment * | 36,365 | 43,461 | +7,096 | 49.3B | 63.0B | +13.7B |
| 82 | Textbooks & Education | 43,264 | 53,374 | +10,110 | 47.4B | 58.9B | +11.5B |
| 45 | Office Supplies | 48,115 | 63,455 | +15,340 | 46.3B | 49.6B | +3.3B |
| 56 | Advertising & Media | 29,850 | 32,176 | +2,326 | 43.1B | 45.8B | +2.8B |
| 30 | Building Maintenance | 11,107 | 12,163 | +1,056 | 41.8B | 45.1B | +3.3B |
| 44 | Vehicle Maintenance | 35,464 | 36,293 | +829 | 39.7B | 44.7B | +4.9B |
| 49 | Legal Services | 9,973 | 11,161 | +1,188 | 32.9B | 32.3B | -0.5B |
| 85 | Agricultural Supplies | 22,859 | 29,174 | +6,315 | 31.9B | 37.0B | +5.2B |
| 54 | Training & Courses | 34,480 | 31,896 | -2,584 | 28.6B | 20.6B | -8.0B |
| 83 | Cultural & Sports | 13,254 | 17,674 | +4,420 | 26.9B | 32.6B | +5.6B |
| 46 | Furniture & Fixtures | 30,769 | 31,296 | +527 | 26.8B | 28.5B | +1.7B |
| 55 | Events & Conferences | 13,776 | 14,568 | +792 | 26.3B | 25.4B | -0.9B |
| 43 | Freight & Logistics | 11,633 | 12,743 | +1,110 | 25.8B | 29.0B | +3.2B |
| 70 | Financial Services | 2,013 | 3,452 | +1,439 | 22.4B | 43.0B | +20.7B |
| 81 | Tools & Hardware | 22,943 | 27,972 | +5,029 | 21.7B | 35.8B | +14.1B |
| 52 | Architecture & Engineering | 5,714 | 5,950 | +236 | 19.1B | 19.4B | +0.3B |
| 25 | Blood & Transfusion | 2,585 | 2,626 | +41 | 17.6B | 17.8B | +0.2B |
| 65 | Waste Management | 2,354 | 5,769 | +3,415 | 17.3B | 112.7B | +95.4B |
| 42 | Airline Tickets | 2,820 | 3,367 | +547 | 15.2B | 18.2B | +3.0B |
| 78 | Travel Services | 5,670 | 7,378 | +1,708 | 14.7B | 30.5B | +15.8B |
| 79 | Electrical Materials | 20,361 | 23,684 | +3,323 | 14.0B | 20.9B | +6.8B |
| 80 | Plumbing & Hydraulic | 9,029 | 10,991 | +1,962 | 13.6B | 21.3B | +7.7B |
| 51 | Consulting & Advisory | 11,367 | 13,912 | +2,545 | 13.3B | 15.9B | +2.5B |
| 73 | Water Treatment | 929 | 2,886 | +1,957 | 10.9B | 21.6B | +10.7B |
| 93 | Chemical Supplies | 11,847 | 24,748 | +12,901 | 10.0B | 21.9B | +11.9B |
| 67 | Equipment Rental | 3,359 | 4,142 | +783 | 9.1B | 12.5B | +3.5B |
| 76 | Textiles & Fabrics | 4,754 | 5,200 | +446 | 8.7B | 9.9B | +1.2B |
| 77 | Lodging & Hotels | 2,548 | 3,056 | +508 | 8.4B | 9.8B | +1.4B |
| 64 | Cleaning Supplies | 35,972 | 53,107 | +17,135 | 7.9B | 13.3B | +5.4B |
| 53 | Research & Studies | 9,958 | 11,087 | +1,129 | 6.7B | 7.6B | +0.9B |
| 87 | Photography & Audiovisual | 8,276 | 12,324 | +4,048 | 5.5B | 7.0B | +1.5B |
| 68 | Real Estate Services | 3,750 | 29,208 | +25,458 | 5.2B | 1.9B | -3.3B |
| 62 | Arms & Defense | 350 | 390 | +40 | 5.0B | 5.4B | +0.4B |
| 38 | Electricity Services | 2,617 | 2,665 | +48 | 4.6B | 4.7B | +0.1B |
| 61 | Surveillance Equipment | 2,069 | 2,934 | +865 | 3.7B | 5.1B | +1.4B |
| 89 | Other / Unclassified * | 1,956 | 2,445 | +489 | 3.4B | 4.0B | +0.6B |
| 59 | Water & Beverages | 6,377 | 6,955 | +578 | 2.4B | 2.6B | +0.2B |
| 71 | Pensions & Benefits | 1,119 | 1,997 | +878 | 2.4B | 3.9B | +1.5B |
| 84 | Scientific Equipment | 3,604 | 4,221 | +617 | 2.4B | 3.5B | +1.1B |
| 74 | Air Quality & Monitoring | 325 | 674 | +349 | 2.0B | 2.7B | +0.7B |
| 48 | Forms & Credentials | 990 | 1,022 | +32 | 2.0B | 2.1B | +0.1B |
| 66 | Property Rental | 1,069 | 1,144 | +75 | 1.6B | 1.7B | +0.1B |
| 39 | Renewable Energy | 130 | 131 | +1 | 0.1B | 0.1B | +0.0B |

## General-X share by COMPRANET era (contracts / value)

| Era | before n | after n | before value | after value |
|---|---:|---:|---:|---:|
| A | 17.0% | 20.8% | 18.1% | 26.8% |
| B | 22.0% | 27.8% | 27.4% | 33.3% |
| C | 9.9% | 14.5% | 12.0% | 15.4% |
| D | 3.9% | 7.2% | 2.6% | 4.1% |
| All | 15.3% | 20.1% | 17.3% | 22.7% |

## Largest transitions

| Before → after | Contracts | Value |
|---|---:|---:|
| Food & Provisions → General Services | 61,781 | 168.4B |
| Food & Provisions → General Maintenance | 18,240 | 88.9B |
| Food & Provisions → Waste Management | 3,296 | 77.1B |
| Catering & Meals → General Services | 9,899 | 65.3B |
| Food & Provisions → Materials & Supplies | 10,464 | 59.6B |
| Water Infrastructure → Oil & Gas Operations | 243 | 58.3B |
| Medical Supplies → Medications & Pharma | 8,011 | 58.3B |
| Food & Provisions → Insurance & Bonds | 2,282 | 39.4B |
| Food & Provisions → Machinery & Equipment | 10,761 | 31.3B |
| Hardware & Computers → General Services | 1,427 | 27.3B |
| Catering & Meals → General Maintenance | 11,046 | 18.1B |
| Oil & Gas Operations → Waste Management | 33 | 17.4B |
| Catering & Meals → Financial Services | 288 | 17.2B |
| Oil & Gas Operations → Food & Provisions | 11,456 | 14.5B |
| Water Infrastructure → Fuels & Lubricants | 48 | 13.2B |

## Typed figures on the site that move

I grepped `frontend/src` (story-content, atlas-stories, i18n, gallery films, Categories/Sectors/Executive pages). Typed category figures exist **only** in *el-sexenio-del-riesgo* (`frontend/src/lib/story-content.ts`), in ch2, ch4, the ch4 pullquote and the 2026-10-06 correction entry. Every other category number on the site is drawn live from `category_stats` / `category_yearly_stats` / `/categories/sexenio` and moves automatically once the precompute chain runs.

| Where (EN + ES) | Typed now | After P0 |
|---|---|---|
| ch2 ¶3: "Medicamentos y Farmacéuticos" | 393.7B | **403.5B** |
| ch2 ¶3: "second largest category of the term, Construcción de Edificios" | 316.5B | **324.3B** (still second) |
| ch4 ¶1: "three carry a higher mean risk indicator … seven a lower one" | 3 / 7 | **3 / 7** (unchanged) |
| ch4 ¶1: Hospital services | 0.196 → 0.234, 217.3B, 32,160 contracts | **0.195 → 0.233, 219.4B, 32,625 contracts** (now #3 of the term) |
| ch4 ¶1: Laboratory and diagnostics | 0.274 → 0.291 | **0.273 → 0.289** |
| ch4 ¶1: Medical equipment | 0.219 → 0.222 | **0.219 → 0.223** |
| ch4 ¶1: **Food and provisions** | **252.2B, 165,518 contracts, 0.233 → 0.208** | **129.4B, 99,652 contracts, 0.249 → 0.205**. It falls from #3 to #8 of the term. |
| ch4 ¶1: Building construction | 0.207 → 0.193 | 0.207 → 0.193 (unchanged; 324.3B / 27,712 contracts) |
| ch4 ¶3: Medicamentos | 393.7B, 157,293 contracts, 0.374 → 0.310, "highest of the ten", "largest drop" | **403.5B, 164,496 contracts, 0.374 → 0.309**. Still highest and still the largest drop. |
| ch4 pullquote `quote` / `stat` / `barValue` | 393.7B · 0.374 → 0.310 · `'0.310'` · 0.31 | **403.5B · 0.374 → 0.309 · `'0.309'` · 0.31** |
| Figure IV (`EraFigures`, live) membership of the "ten largest" | includes Catering & Meals | Catering drops out (80.5B → below the cut). **Materials & Supplies** (81.5B) enters and **General Services** rises to #4 (196.8B). Live data, no copy edit needed. |
| Correction log (EN + ES, ~line 3083) | 2026-10-06 entry | Needs a new dated entry, e.g. "2026-10-xx — A keyword-matching fault filed ~190,000 contracts (611B pesos) that were not food under 'Alimentos y víveres'; corrected, figures in ch2/ch4 restated." |

Copy that stays true but misleads:
- i18n `categories.json` / `sectors.json` ("72 categories … 99.7%"), `story-films.json` (Machine Two) and `la-maquina.ts` all claim 99.7% coverage. After P0, ID 89 holds 0.08%, but 20.1% of contracts sit in General-X buckets. Suggest "72 categories; one contract in five still in a general bucket".
- `TopCategoriesChart.tsx` `LIVE_CAPTIONS`: "Medicamentos · 1 in 4 pesos" and "Alimentos · P6 capture Segalmex" are captions, not figures. The Food caption stays fine.

## What the Zenodo dataset (`_weekend/dataset/dist_public_v2/`) would change

The v2 export (created 2026-10-07 12:09) carries the **pre-P0** taxonomy. If P0 is applied before upload:

- **`contracts.category_id`** changes on 382,810 rows (12.5%). **`contracts.category_source`** gains a new value, `fallback` (389,420 rows), and `cucop` goes from 21,174 to 50,224 rows. Update the `DATA_DICTIONARY.md` row for `category_source` ("regex / fallback / cucop") and the `DATASHEET.md` §taxonomy line 205.
- **Derived tables to regenerate:**
  - `category_stats` (72)
  - `category_yearly_stats` (1,655)
  - `institution_category_stats` (41,780)
  - `category_vendor_topn` (360)
  - `category_vendor_institution_topn` (864)
  - `subcategory_stats` (150)
  
  CSVs: `categories.csv`, `category_stats.csv` and `category_yearly_stats.csv`, plus the two `.db` files.
- **Unchanged:** `cucop_generica_map`, amounts, risk scores, vendors, institutions, ARIA, GT.
- **Recommendation:** don't mint the Zenodo DOI on the pre-P0 export. A DOI version is immutable, and it would freeze a known Food overstatement of ~611B into a citable artifact. Either apply P0 first and re-export (the precompute chain from `category_sync_plan.md` §5 plus `export_public_dataset`), or upload with an explicit errata line in `DATASHEET.md`.

## To ship (owner decisions; none done here)

1. **Review the branch.** Three code commits, `classify_categories.py` + `cucop_classify.py` + test.
2. **Apply to source, then prod,** following the `category_sync_plan.md` recipe (backup table → swap → wal_checkpoint → precompute chain → verify). The copy proves the run is about 35 min on this box.
3. **Restate** the *el-sexenio-del-riesgo* figures above (EN + ES) and add the correction entry. Coordinate with the Oct 24 freeze.
4. **Phase 1:** the residue is now honest, at 20.1% General-X. `91 General Services` (254K / 897B) and `88 General Maintenance` (115K / 588B) are the LLM targets.

### Not done or known residue

- Spot audit of moved rows (80-row random sample in `compare.json`): moves are overwhelmingly corrections, e.g. PRESTADOR DE SERVICIOS → General Services, AVALÚOS → Real Estate, PRODUCTOS ALIMENTICIOS → Food, Ocrelizumab → Medical Supplies via the salud fallback.
- Pre-existing over-reach that P0 does not touch:
  - `conservacion` (Environmental) catches maintenance titles.
  - `sierra` (Tools) catches place names.
  - `cobertura` (Insurance) is generic.
  - The salud→22 sector fallback (389K fallback rows overall) remains the dominant source of weak labels outside era D.
- I didn't rebuild the precomputes on the copy (category_stats etc.). The figures above are computed directly from `contracts` with the same SQL semantics.
- Artifacts: `_weekend/tax_p0/` holds `RUBLI_P0.db` (8.5 GB, deletable), `compare.json`, `report.txt` (full per-category table and transitions), and the logs.
