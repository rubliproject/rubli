# Press kit fact-check — 2026-10-30

Checked against the **live site** (rubli.xyz, read-only API, ≥ 1 s between requests) on 2026-10-30, branch base
`origin/main` a94703f9 (descendant of 1c7487dc). Model truth: `docs/SCORING.md` + `/api/v1/analysis/model/*`.
Local DB not used for figures (it holds 3,057,143 rows, no ComprasMX; prod holds 3,180,252).

Files: `comunicado_de_prensa.md` (C), `guia_periodistas.md` (G), `PITCH_EMAIL.md` (PE), `PITCH_LEAD_BRIEF.md` (LB),
`technical_onepager.md` (T1). `KIT_2026-11.md` is the internal checklist: not rated, its § 7–8 figures are superseded by § 4 below.

Ratings: **TRUE** · **STALE** (true once; current value given; corrected in the texts) · **FALSE** (contradicted
by the live site; corrected) · **UNSOURCED** (no live source found; removed from the texts or flagged for the owner).

**Totals: 30 TRUE · 17 STALE · 7 FALSE · 7 UNSOURCED** (61 ratings over 60 rows; row 60 carries two).

Note on routes: rubli.xyz is a single-page app and answers **HTTP 200 for any path, including nonexistent ones**
(`/this-does-not-exist-xyz` → 200). Route existence was checked in `frontend/src/App.tsx` on main, not by status code.

## 1. Claims

| # | Claim (where) | Live value · source | Rating |
|---|---|---|---|
| 1 | 3,055,825 CompraNet contracts with valid amount (C, G) | **3,055,805** = structures A–D in `/stats/data-quality` (394,842 + 1,328,678 + 930,243 + 402,042); the old figure counted the 20 rows dated 2000–01 that every public aggregate excludes | STALE |
| 2 | «3 millones» (C headline) · «3.18 millones» (PE) | 3,178,884 valid-amount contracts · `/health`, `/stats/dashboard/fast`, `/contracts/field` (3,180,252 rows − 1,368 without valid amount) | TRUE |
| 3 | ComprasMX: 120,844 contracts (G) | **123,079** (structure E, 2025–2026) · `/stats/data-quality` | STALE |
| 4 | ComprasMX cut-off 17 Oct 2026 (C) | **28 Oct 2026**, weekly reload (2,285 new last week, next 1 Nov) · `/stats/data-cut` | STALE |
| 5 | 213,392 loaded from ComprasMX, 106,899 started after 28-sep-2025 (C) | no API serves load or start-date splits; 10-26 SQL predates two weekly reloads · removed | UNSOURCED |
| 6 | 120,796 scored / 48 without valid amount (G) | every valid-amount contract is scored (3,178,884 = 3,178,884 in `/analysis/risk-distribution`); the ComprasMX-only no-amount count has no API · replaced by «todos tienen indicador» | UNSOURCED |
| 7 | CompraNet frozen since 28 Sep 2025 (C, G) | `source_switch: 2025-09-28` · `/stats/data-cut`; `SOURCE_SWITCH_ISO` | TRUE |
| 8 | ComprasMX contracts scored by v0.9.2 (C, G) | `risk_model_version: v0.9.2` on ComprasMX rows; all valid rows scored · `/contracts/field` | TRUE |
| 9 | «Sin indicador» only for pending + invalid amounts (C, G) | the only unscored rows are the 1,368 without a valid amount · `/contracts/field` hist bin −1 | TRUE |
| 10 | 15 decimal-error contracts fixed/excluded 20 Oct 2026; > 100B rejected (C, G) | stated on `/methodology` (methodology.json); 100B rule in `contracts.py` `_BIN` | TRUE |
| 11 | 2002–2010 weakest, almost no RFC (C, G) | structure A RFC coverage 0.1 % · `/stats/data-quality` | TRUE |
| 12 | Total value ≈ 10.5 billones (owner's question; not in texts) | 10,452,728 MDP · `/stats/dashboard/fast` | TRUE |
| 13 | Captura: 3,776 firms · 143 buyers · 1.68 billones · 855 after 28-sep-2025 (C, G, PE) | **3,912 · 149 · 1.78 billones · 831** · `/captura/plates` (scope federal = page default, updated 2026-10-29) | STALE |
| 14 | Captura definition ≥ 80 % · ≥ 50 M · ≥ 3 years · 2002–2025 · post through Oct 2026 (C, G) | `meta.def` share 0.8, min 50,000,000, min_years 3, y0 2002, y1 2025; `post_to` 2026-10-27 | TRUE |
| 15 | IMSS: 23 of every 100 pesos (C) | `cap_share` 0.2334 · `/captura/plates` | TRUE |
| 16 | IMSS: 1,097 dependent firms (C) | **1,114** · same plate `n` | STALE |
| 17 | 870 contracts > 1,000 MDP take 26 % (C) | **871**, 25.8 % of 10,452,728 MDP · `/contracts/field` bins ≥ 36 | STALE |
| 18 | Bienestar: 0 of 12 pass, best 5.7, 424,197 contracts (C) | 0/12; Financiera para el Bienestar 57.4 → 5.7; Σ n_contracts 424,197 · `/scorecards/institutions/{id}/grade-v3` × 12 (ids from the story draft) | TRUE |
| 19 | Bienestar: 786 bn (C) | **785.5 bn** (785,461 MDP) → «785 mil millones» | STALE |
| 20 | Local buyers 87.6 % of buyers, 10.5 % of contracts, 12.8 % of money (C) | **88.2 % · 10.2 % · 12.0 %** (3,307 of 3,750; 323,139 of 3,178,873; 1.257 of 10.451 billones) · `/institutions?scope=local|federal` paged | STALE |
| 21 | Page «Captura Institucional» / «Institutional Capture» (C, G) | nav label **«Un comprador, una empresa» / «One buyer, one supplier»** · `nav.json` toc.capture | STALE |
| 22 | Portada at `/dashboard` (G) | `/dashboard` redirects to **`/`** (`ToPortada`, App.tsx:323) | STALE |
| 23 | «El Apagón» `/gap` (G) | **retired 2026-10-27**: `GAP_LIVE = false`, `/gap` redirects to `/` · constants.ts:378, App.tsx:546 · replaced by «A destiempo» `/antes-del-fallo` | FALSE |
| 24 | Routes `/captura /aria /institutions /rastro /contracts /contracts/:id /methodology /press /datos` (C, G) | all routed in App.tsx; `/arranque`, `/antes-del-fallo` too | TRUE |
| 25 | v0.9.2 ElasticNet + PU over 17 features (C, G) | 17 coefficients (16 non-zero; `z_year_end` = 0) · `/analysis/model/calibration`; methodology «17 características» | TRUE |
| 26 | Forward-chained AUC 0.827 (C, G) | `auc_test` 0.8273 · `/analysis/model/metadata` | TRUE |
| 27 | 95 % CI 0.763–0.883 (C, G) | `MODEL_AUC_CI`; `/methodology`; SCORING.md | TRUE |
| 28 | Size-controlled AUC 0.741 (C, G) | `MODEL_AUC_SIZE`; `/methodology`; SCORING.md | TRUE |
| 29 | v0.9.1 used later-year data; pre-registered test; not comparable with 0.852 (C, G) | SCORING.md «Why it replaced v0.9.1»; methodology v91Desc | TRUE |
| 30 | Labels mostly analyst-documented, not rulings (C) | 989 / 1,417 `model_discovery`; 25 official · SCORING.md; methodology | TRUE |
| 31 | Methodology parameters: intercept −3.633, c_pu 0.436, T 0.530 (owner's question; not in texts) | −3.6328 · 0.4360 · 0.5297 · `/analysis/model/calibration`; methodology formula «c = 0.436», «T=0.530» | TRUE |
| 32 | Level shares 5.17 / 4.77 / 9.94 / 12.48 / 77.58 % of 3,176,621 (C, G) | **5.17 / 4.78 / 9.95 / 12.48 / 77.57 % of 3,178,884** (164,333 · 151,840 · 396,839 · 2,465,872) · `/analysis/risk-distribution` | STALE |
| 33 | Thresholds 0.60 / 0.40 / 0.25 (G) | `getRiskLevelFromScore`; SCORING.md display squash keeps levels | TRUE |
| 34 | Heaviest features: breadth, price volatility, prior buyer concentration, price ratio (G) | z_price_volatility 0.811 · inst_hhi_prior 0.771 · rt4_log 0.592 · z_price_ratio 0.456 · `/analysis/model/calibration` | TRUE |
| 35 | Contract-level scale reaches 1 (implicit in G «0 a 1») | display score tops out at **0.9496** above 0.60 (SCORING.md «Display score»); added one line to G § 2 | TRUE (context added) |
| 36 | Grade scale 0–10, pass 6.0, cuts 4.4 / 2.8, round first (G) | `GRADE_CUTS_10 = [2.8, 4.4, 6, 7.6]`, binary verdict on the rounded number · `lib/tiers.ts` | TRUE |
| 37 | Band caveat: top band 60 of 67 subnational, bottom 33 of 41 (G) | **203 of 229** and **159 of 168** with scope «all»; default view is federal only (`lib/scope.ts`) · `/scorecards/institutions/field?scope=all` | FALSE |
| 38 | Rastro IMSS 42.2 % → 10.0 % → 5.2 % → contract 1953893 (G § 4) | `/rastro` was rebuilt 2026-10-29: IMSS medicines 2024 (Cuenta Pública 81,892 MDP) → 47 % in register → 42 % direct award → 14 % to ARIA tiers 1–2 → 2 % Maypo → **contract 2926346** (601,252,745 MXN) · `lib/moneyPaths/rastro.data.json`, `/contracts/2926346` | FALSE |
| 39 | Contract 1953893 = 3,917,801,027 MXN (G) | 3,917,801,027.30 · `/contracts/1953893` (no longer in the guide) | TRUE |
| 40 | El Mismo Día: 1,622 lots; similar groupings appear with fictitious caps (G) | n 1,622; `placebo_lots_by_m` 1,368–1,640 · `/newtabs/mismo-dia` | TRUE |
| 41 | Salud 16 % (Fox) → 43 % (AMLO) of CompraNet money (G) | 16.4 % (2002–06) → 43.5 % (2019–24) · `/analysis/sector-year-breakdown` | TRUE |
| 42 | El Arranque: ≥ 100 M in first year (G) | `threshold=100e6`, `window=365` · `precompute_newtabs.arranque`; `/newtabs/arranque` | TRUE |
| 43 | Focos «Nuevos»: vendors no public case names yet (G) | copy «proveedores que ningún caso público nombra todavía, con contratos en 2019 o después» on /aria | TRUE |
| 44 | Citation DOI 10.5281/zenodo.23209798 resolves (C, G) | resolves (doi.org 302 → Zenodo record v**2026.10**, 2026-10-07), but **2026.11** was published 2026-10-27: DOI **10.5281/zenodo.23694198**; concept DOI 23209797 · Zenodo API; `DATASET_DOI` | STALE |
| 45 | Citation «RUBLI (2026). Contratos federales de México 2002–2025, con indicador de riesgo» (C, G) | Zenodo title **«RUBLI — Mexican Federal Procurement Dataset (2002–2026)»**, creator **«RUBLI Project»** | FALSE |
| 46 | «2026.10 predates the decimal fix; a new version is planned» (C, G) | 2026.11 is out (3,177,987 contracts, cut 17-oct-2026, `DATASET_RELEASE`) | STALE |
| 47 | 2026.10 and 2026.11 under CC BY 4.0; site CC BY-NC 4.0 (C, G) | both Zenodo records `cc-by-4.0`; site licence per constants.ts comment (owner decision 2026-10-28) | TRUE |
| 48 | Lead 1 vendor table: 6,301 / 18,368 / 9,419 / 4,307 contracts; Dimesa 51,500 MDP, IMSS 68.3 % (LB) | **6,303 / 18,383 / 9,421 / 4,311**; Dimesa 51,568 MDP, IMSS 68.2 % · `/vendors/{29277,2873,4335,13885}` | STALE |
| 49 | Lead 1 values 133.2 / 86.9 / 56.3 bn, years, DA %, IMSS 60.1 / 50.4 / 72.5 % (LB) | match `/vendors/{id}` + `top_institutions` | TRUE |
| 50 | 38,395 contracts, 328 bn (PE, LB) | **38,418**, 327.9 bn | STALE |
| 51 | «ocho de cada diez pesos sin licitación en tres de ellas» (PE, LB) | `direct_award_pct` is a share of **contracts**, not pesos: 79.0 / 81.9 / 60.9 / 75.6 % · corrected to «tres de cada cuatro contratos o más» | FALSE |
| 52 | «/vendors/ is blocked in robots.txt» (LB, PE checklist) | robots.txt no longer disallows /vendors/; it answers `X-Robots-Tag: noindex` | FALSE |
| 53 | Lead 1 risk indicator 0.94–0.99 (LB) | vendor `avg_risk_score` 0.938–0.993 in `/vendors/{id}`; contracts display ≤ 0.95 — wording made explicit; **site inconsistency, see § 3** | TRUE |
| 54 | Focos «Nuevos» tier 2 = 168 (PE checklist) | **169** · `/aria/rosettes?set=nuevos&tier=2` | STALE |
| 55 | ComprasMX contracts per vendor: Maypo 161, PISA 248, Dimesa 5 (LB) | not re-read (no cheap API split); weekly reloads move them · marked «por verificar» | UNSOURCED |
| 56 | Lead 1 public record (SFP 2019/2020, ASF 2023-0234, COFECE IO-001-2016, Expansión) (LB) | external; not re-checked in this pass (the brief already marks primaries pending) | UNSOURCED |
| 57 | Individuals appear as «PERSONA FISICA <id>» (G) | superseded: guía § 5 rewritten 2026-11-02 to owner policy (.claude/rules/security.md) — site names a persona física as published, labelled «persona física», never RFC/CURP/address; «PERSONA FISICA <id>» only in the dataset file | STALE |
| 58 | «de código abierto», «Código: Apache 2.0» (C) | no public repository link exists for launch (KIT § 7 item 12: open-source push pending) — **owner** | UNSOURCED |
| 59 | Pseudonymous team, no money from parties or government, prensa@rubli.xyz (C, G) | owner statement; mailbox not tested — **owner** | UNSOURCED |
| 60 | T1 technical one-pager: v0.9.1 run, 27 features, c 0.439, AUC 0.852, HR 302,640, 147,550 critical, 3,051,294 scored; `rubli.xyz/api-explorer`; `github.com/rubliproject/rubli` | model block **STALE** (live: v0.9.2, 17 features, c 0.436, AUC 0.827, 164,333 critical of 3,178,884); `/api-explorer` is **not a route** (falls to `NotFound`); GitHub URL names the owner (breaks pseudonymity). Counted as 1 STALE + 1 FALSE; file marked DO NOT SEND | STALE + FALSE |

(Row 60 counts twice: the 17 STALE include its model block, the 7 FALSE its `/api-explorer` link.)

## 2. What changed in the texts

- C and G rewritten to the live values above; each figure carries `[FC30 #n]` in C and a source block in both.
- G § 1: `/dashboard` → `/`; `/gap` row replaced by «A destiempo» `/antes-del-fallo` (holds «El Mismo Día», which § 5 cites).
- G § 2: one line on the display scale (max 0.95 = top of critical, not certainty) — SCORING.md «Display score».
- G § 4: the verification walk now follows the live `/rastro` trail to contract 2926346. Steps 3–7 unchanged
  (2926346 is a 2024 CompraNet structure-D contract, so the datos.gob.mx check still applies).
- Citation in C and G: 2026.11, exact Zenodo title and creator, concept DOI for «latest».
- PE / LB: counts refreshed, «pesos» → «contratos», robots note corrected, 161/248/5 marked «por verificar».
- T1: banner «DO NOT SEND» added; not rewritten (owner: rewrite from `docs/MODEL_CARD_v0.9.2.md` or delete).

## 3. Needs the owner

1. **Open source claim** (#58): C says «código abierto» and «Código: Apache 2.0». If the public repo is not up by 17 Nov, cut both.
2. **Embargo hour** `[HORA]` / `[TIME]`, outlets (KIT § 6), and whether to name «RUBLI Project» as author.
3. **T1 one-pager** (#60): delete or rewrite; it still prints the old personal-account repo URL.
4. **Site inconsistencies found while checking (site copy, not press — not fixed here):**
   - `/methodology` says «v0.9.2 no aplica ajustes posteriores a la puntuación», but SCORING.md documents the
     2026-10-28 display squash above 0.60. One of the two is wrong.
   - `/vendors/{id}` `avg_risk_score` reaches 0.993 while every contract displays ≤ 0.95 — vendor averages read
     the capped `risk_score_v92`, contracts the display `risk_score`. A reporter will see a vendor average above any of its contracts.
   - The comunicado's old source comment cited `docs/FACTCHECK_2026-10-22.md`, `…10-20`, `DATA_HORIZON_…`,
     `INSTITUTION_SCOPE_…` — none is on main. This file replaces them for the press texts.
5. **ComprasMX post-blackout count** (#5): if the release should keep «X contracts started after 28-sep-2025», it needs a prod SQL read (no API).

## 4. Re-read before sending (figures that move weekly)

ComprasMX reload runs weekly (next 2026-11-01). Re-read in launch week, same endpoints:
`/health` (contract_count) · `/stats/data-quality` (A–D vs E) · `/stats/data-cut` · `/captura/plates` (totals + IMSS) ·
`/contracts/field` (bins ≥ 36) · `/analysis/risk-distribution` · `/institutions?scope=local|federal` ·
`/scorecards/institutions/field?scope=all` · `/vendors/{29277,2873,4335,13885}` · `/aria/rosettes?set=nuevos&tier=2`.
Model figures (#25–31) and the Bienestar grades (#18; v3 calibration CAL-GV3-20261008060330, computed 2026-10-22) do not move with the reload.
