# PARALLAX Day 12c — Contracts, after the second-round panel

Routes: `/contracts`, `/contracts/:id`. Reference ids: **2883214** (award 2024-12-17, published 2024-11-19, contract 2024-12-31), **1645371** (2-year pair, NAICM), **246083** (evidence row, pair 47), **1289865** (pair 4,501, co-bid "200 % · 124 partners"), **2308643** (no pair; the decomposition ≈ 97 vs stored 73), **361945** (T4 vendor with a bare "pattern P2"), **1500000** (T4, no pattern). Branch `parallax/day12c-contracts-panel2` off `origin/main` `b84d24ee` in worktree `.claude/worktrees/parallax-day01`.

**Entering state.** Day 12b shipped this afternoon (`1a7a99e1` + `71331d65`). The second-round panel (design 79 · navigation 72 · honesty 67 · data 74; `_parallax_shots/day12b/panel/SYNTHESIS.md`) verified 31 of the morning's findings fixed and found **three regressions** introduced by 12b plus a handful of majors. Every row below was re-verified by Fable in code/SQL. Small day: ≤ 8, no invention.

**Classification: GOLD → enhance-in-place.** The Day 12/12b Keep lists stand.

## Keep
- Everything 12b shipped (`DAY-12b-contracts-panel.md § Result`).
- The site-wide by-year calendar in `lib/administrations.ts` (the handover-quarter question is a platform decision — **do not** change the calendar here).

## Change (8)

### 1. R1 — the date sentence names the date it measures — `components/contract/ActaLedger.tsx:252-270`
- Verified: `leadDays = award − publication`, but the sentence and label say "before the contract" (2883214 prints 28; the contract-date gap is 42; 322,878 contracts carry both dates).
- Do: when `award_date` exists: `published N days before the award` / `convocatoria publicada N días antes de la adjudicación`; when only `contract_date` exists: measure to it and say `before the contract date` / `antes de la fecha del contrato`. Same words in the `−N days` label's `title` and the sr sentence.
- Accept: 2883214 EN/ES read `28 days before the award`; 1645371 `175 days before the award`; a contract with publication but no award (find one by SQL: `award_date IS NULL AND publication_date IS NOT NULL`) reads `N days before the contract date` with N = contract − publication.

### 2. R2 — `document.title` survives in-app navigation — `hooks/useDocumentTitle.ts`
- Verified: the hook restores `prev` on unmount; with `AnimatePresence popLayout` the leaving page's cleanup runs after the entering page set its title.
- Do: the hook sets the title in a layout effect and on cleanup restores the **site constant** only if `document.title` is still the value this hook set (compare against a ref); never restore `prev`.
- Accept (driven): `/contracts` → click a row → title is the dossier's; Back → title `The Archive — RUBLI`; forward again → dossier title; cold loads unchanged.

### 3. R3 — plate labels seated on every pair size, plot width kept at 390 — `components/contract/PairLedger.tsx:200-230, 290-330, 380-450`
- Verified: `subjectLate` requires `nYears > 2`, so a 2-year pair (1645371) lets the riser cut through "THIS · 84.8B" / "#1/2"; `padR` at 390 is derived from the total label's width (26 % of the plate).
- Do: seat the THIS/rank labels and the CUMULATIVE label by measured boxes against **columns, gridline labels and the step-line's segments** (`placeLabels` from `lib/plateLabels.ts` with the risers as obstacles) for any `nYears ≥ 1`; at `isMobile` the right-axis total label moves inside the plot (top-right on paper, `paintOrder stroke`) and `padR` returns to 16; the right axis keeps its two ticks (0 / total) on its own line and the **column gridlines carry only the left value** (N5: no gridline prints two numbers).
- Accept: label-vs-label, label-vs-column and label-vs-riser intersections **0** on 1645371, 246083, 1289865, 2912609, 1500000 at 1440 + 390 (probe: bbox of every `<text>` vs every `rect` and every `path` segment); plate `innerW / width ≥ 0.85` at 390; no gridline `<text>` pair shares a `y` with different values.

### 4. N1 — the Watchlist link lands on the vendor for every tier — `pages/AriaQueue.tsx:249`, `pages/ContractDossier.tsx` (terminal band)
- Verified: `tierFilter` defaults to 1; `?q=` does not clear it → T2–T4 vendors land on "No vendors found".
- Do: when the page mounts with `q` in the URL, `tierFilter` starts as `null` (all tiers) and the tier control shows "All"; the dossier link stays `/aria?q=<queue_name>` for every tier and reads `See this vendor in the Watchlist →` for T1–T3, `Search the Watchlist →` for T4/none.
- Accept (driven): 1289865 (T1), a T2 and a T3 contract of your choosing and 1500000 (T4) each land on a queue with the vendor's row visible; `/aria` without `q` still opens on T1.

### 5. N2 — search keeps the filter in history — `pages/Contracts.tsx` (search sync, the `useUrlParamInput` helper)
- Verified: search writes `replace: true` always; min/max already push on add and replace on refine.
- Do: route the search through the same helper semantics: **push** when `search` is added to a URL that had none, **replace** on refinement, delete on clear.
- Accept (driven): `?sector_id=1` → type "imss" → Back → `/contracts?sector_id=1` with an empty input; Forward → search restored; typing a second character does not add history entries.

### 6. N3 — co-bid notes print what is known — `lib/contract-format.ts paramOf`, `components/contracts/SenaladosBand.tsx WhyFlags` (chip label), `components/ContractCompareModal.tsx`
- Verified: legacy tags `co_bid_high:200%:1p` — 642,860 carry > 100 %; the % semantics come from the archived scorer and are undocumented; v0.8.5 gives co-bid weight 0.
- Do: drop the % everywhere it prints (margin note param, `Co-Bidding (High, 160%)` chip → `Co-bidding (high)`, the compare modal); keep `· N partners` / `· N socios` with a correct plural (`1 partner`).
- Accept: no `%` follows "Co-Bidding"/"Co-licitación" in the text dumps of the archive (default + `?risk_level=critical`), the compare modal and the seven reference dossiers, EN + ES; 1289865 prints `Co-Bidding (High) · 124 partners`.

### 7. N4 — the evidence block is a note, not a quotation — `pages/ContractDossier.tsx:394-462`, `backend/api/routers/contracts.py pick_contract_evidence`
- Verified: `source_reference` is a curator's English summary (it even contains an inner quote), attributed to a Spanish La Prensa article; the honesty judge reports the 9.33 % clause belongs to another contract in that article. Prod shows nothing (older GT table); local does.
- Do: render it as `CASE-FILE NOTE` / `NOTA DEL EXPEDIENTE` (kicker 12px mono, body 16px Garamond in primary ink — the block gets typographic rank above the object and the lede, design N1) with **no quotation marks**, followed by `curator's summary · source ↗` / `resumen del curador · fuente ↗`; the backend adds `kind: 'summary'` to `evidence` (all current rows are summaries) so a future verbatim row can be quoted. In the day file's backlog: **hold the prod GT load** until the 261 rich rows are re-checked against their sources.
- Accept: 246083 (local) shows the note with the kicker, no `“` `”` characters in the block, the source link `rel=noopener`; the block's font size > the lede's; prod behaviour unchanged (null → nothing).

### 8. N7 + N8 + N9 — words that don't accuse, a decomposition that adds up, pattern names — `i18n/locales/{en,es}/contracts.json presets.*`, `components/contract/ActaLedger.tsx` (decomposition footer), `pages/ContractDossier.tsx` (standing line) + `lib/constants.ts` or `lib/aria.ts` (pattern names)
- Verified: labels "Price Manipulation / Manipulación de Precios", "Threshold splitting / Fraccionamiento", "bypassing competitive tender" (rule 5 class); the decomposition omits 5 terms and never prints the logit (2308643 ≈ 97 listed vs 73 stored); T4 vendors print a bare "pattern P2".
- Do: presets → `Price outliers` / `Precios atípicos` ("contracts priced far above the sector norm"), `Same-day splits` / `Contratos del mismo día` ("several contracts to one vendor on the same day"), `Largest direct awards` / `Mayores adjudicaciones directas` ("awarded without a tender"); decomposition footer prints `listed terms Σ +a.aaa · logit b.bbb · indicator N/100 — the 5 terms without a stored z carry the rest` (ES twin); the standing line decodes P1–P7 to the ARIA pattern names (find the canonical table — `grep -rn "P6" frontend/src/lib` — reuse it, never a new one), and for T4 prints only the pattern name in muted ink (no "ARIA T4"), nothing when there is no pattern.
- Accept: `Manipulation|Manipulación|Fraccionamiento|bypassing` absent from both JSON files; 2308643's footer shows Σ, logit and 73 and the numbers reconcile (Σ + intercept + omitted = logit, stated); 361945 prints the P2 pattern **name**, 1500000 prints nothing.

## Out of scope
- The handover-quarter calendar (platform decision — ask the user); 9 `medium`-at-1.0 rows (data track, trivial recompute of `risk_level`); the exchange-rate table disagreement; filtered totals; the dossier's two right edges; Compare's Tab distance (needs a sticky bar in DOM order — a design call); the 2002 seals; `parseFactorLabel` ES.

## Risk
- Change 3 is geometry on a shipped plate — crop every reference pair at both widths and LOOK; a label moved off the column must still be readable as the subject's.
- Change 5 touches history semantics again — run the full Back/Forward walk (search, min, max, presets, saved filters, deep links) before calling it done.
- Change 7 changes an API field shape (`evidence.kind`) — additive only; the frontend tolerates its absence.

## Build notes for the executor
Same stack and rules as `DAY-12b-contracts-panel.md § Build notes`: worktree `D:\Python\yangwenli\.claude\worktrees\parallax-day01`, branch `parallax/day12c-contracts-panel2` (from `origin/main` `b84d24ee`; this file is its first commit), backend `127.0.0.1:8001` running from this worktree's `backend/` (restart the same way after Change 7), Vite `localhost:3009`, `MSYS_NO_PATHCONV=1`, ≤ 2 browsers, never rubli.xyz, no DB writes. Order: **1 → 2 → 5 → 4 → 6 → 8 → 7 → 3**. One commit per change `fix(contracts § PARALLAX D12c § Change N): …`, body cites `docs/parallax/DAY-12c-contracts-panel2.md § Change N`, trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Progress `_parallax_shots/day12c/progress-12c.md` after every step; report in your final message. Probe: reuse `_parallax_shots/day12b/` per-change scripts where they fit; add the label-vs-riser bbox check and the title/history walks. Crops before/after into `_parallax_shots/day12c/after/crops/` and LOOK at every one. Review: `rubli-bilingual-audit` on touched TSX; gates from `frontend/`: `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.app.json` · `npm run build` · `npm run lint:tokens` · `npx eslint` on touched files; backend `test_contracts.py` after Change 7, the full suite last with no probes in flight. Do NOT bump BUILD_ID, push, deploy or merge — Fable judges first.

## Backlog (from Day 12c)
- **Hold the prod GT load** (`ground_truth_contracts` local → deploy DB) until the 261 rich rows are re-checked against their sources — the honesty judge reports 246083's note (the 9.33 % clause) concerns a different contract in the cited La Prensa article. The dossier now renders these rows as a curator's case-file note (`evidence.kind = 'summary'`); a verbatim row would need `kind = 'quote'` set by the GT track.
- GT case-file notes are English-only; under ES the note body is English (`lang="en"` on the element).

## Result

Executor report: `_parallax_shots/day12c/report-12c.md` (saved by Fable). Built by the Opus executor `parallax-day12c` in plan order 1 → 2 → 5 → 4 → 6 → 8 → 7 → 3: `48e8fd90` `6e39f3bd` `555bb653` `92898db9` `a739693a` `6bc48dac` `d692b78d` `4541fc43`. No judge round: Fable's independent Day-12 probe on the executor's HEAD (`_parallax_shots/day12/judge12c-{en,es}.txt`) shows the archive at 0 contrast / 0 focus / 0 ellipsis EN + ES, the dossiers unchanged apart from the known token and chip leftovers (the hero's 32px `MXN` unit now counts as a large-text leaf at 3.57 — passes 3:1), no console errors; every crop looked at (`_parallax_shots/day12c/after/crops/`): the 2-year pair's labels seat left of the column with the riser clear, the 390 plate keeps 90 % of its width with the cumulative total inside the plot, `−28 days` sits above the band, the case-file note carries a kicker and no quotation marks, the decomposition footer reconciles (2308643: Σ +1.820 · logit −1.174 · 73/100, the 5 un-decomposed terms −0.378), the ES presets read «Precios atípicos · Contratos del mismo día · Mayores adjudicaciones directas», the T4 vendor lands on its row in the queue, the compare modal prints "Co-Bidding (High)".

| Measure | before (12b) | after (12c) |
|---|---|---|
| MonthBand sentence, 2883214 | "published 28 days before the contract" (measured to the award) | "published 28 days before the award" / "antes de la adjudicación"; no-award contracts say "before the contract date" |
| `document.title` after in-app navigation | site default / previous page's | the current page's (restore only if still ours, to the site constant) |
| plate label intersections (labels × columns × gridline labels × risers) | 1645371: riser through "THIS · 84.8B" | **0** on 1645371, 246083, 1289865, 2912609, 1500000 at 1440 + 390; 390 plot/width 0.74 → **0.90**; no gridline carries two values |
| Watchlist link, T2–T4 vendors | "No vendors found" (default T1 filter over `?q=`) | lands on the vendor's row for every tier; `/aria` without `q` still opens on T1 |
| search history | `?sector_id=1` → "imss" → Back → `/contracts` | Back → `/contracts?sector_id=1`, input empty; Forward restores; refinement replaces |
| co-bid `%` (642,860 legacy tags > 100 %) | "Co-Bidding (High, 160%)", "200 % · 124 partners" | "Co-Bidding (High)", "· 124 partners" (plural fixed) |
| preset labels | Price Manipulation · Split Contracts ("Threshold splitting") · "bypassing competitive tender" | Price outliers · Same-day splits · Largest direct awards ("awarded without a tender"); `Manipulation|Manipulación|Fraccionamiento|bypassing` absent from both JSONs |
| decomposition footer | 5 terms omitted, logit never printed (2308643 ≈ 97 listed vs 73 stored) | `Σ of the 13 decomposed terms +1.820 · logit −1.174 · indicator 73/100 — the 5 terms without a stored z carry the rest (−0.378)`; `pu_correction` returned |
| standing line | "pattern P2" bare on T4 | pattern names from `aria.json` (P6 "Single-buyer dependence"); T4 prints only the name in muted ink, nothing without a pattern |
| evidence block | curotor's summary inside “ ” credited to a Spanish article | `CASE-FILE NOTE` / `NOTA DEL EXPEDIENTE`, 16px primary ink above the object and the lede, "curator's summary · source ↗" (`rel=noopener noreferrer`), backend `evidence.kind = 'summary'` |

Deviations accepted: `RiskExplanationResponse` gained `pu_correction` (it was computed and stripped by the model); the search helper pushes on add / replaces on refine like min/max.

## Backlog (from Day 12c)
- **Hold the prod GT load** until the 261 rich `source_reference` rows are re-checked against their sources (the 246083 note's 9.33 % clause may belong to another contract in the same article — honesty judge, 12b panel).
- The handover-quarter calendar (Fox for 15-Dec-2006, AMLO for Nov–Dec 2024; 43,430 contracts) — platform decision for the user.
- 9 contracts at `risk_level = medium` with score ≈ 1.0 (the 334,066 vs 334,075 masthead gap) — recompute `risk_level` from the score (data track).
- Two exchange-rate tables disagree for 2025 (17.20 vs 19.5); the size-track baselines are nominal pesos across all years.
- Compare is 245 Tabs from a row-2 pick (the bar sits after the table) — needs a sticky bar in DOM order or a shortcut; the breadcrumb drops the archive filter; 390 has no back link on the dossier; page-turn lands at the bottom; the two CSV glyphs; the archive heading outline; filtered totals (`/statistics` ignores filters); the Spanish critical lede drops the amount; `parseFactorLabel` ES.

Shipped 2026-10-01 08:50Z: origin/main + VPS `1ea99cf3` (rebased over three automated health-check commits), BUILD_ID `2026-09-30-parallax-d12c-contracts-panel2`; served entry `index-DTXaLdSA.js` → `index-CzOnGtO-.js` (BUILD_ID string verified), health OK 3,058,286; `/contracts`, `/contracts/246083`, `/contracts/1645371`, `/aria?q=OCEANOGRAFÍA…` 200; prod `/contracts/246083/context` → `evidence: null` (older GT table, guard holds), `vendor_standing.ips_tier` 1; `/risk-explain` `explanation_available false` on prod (no z-features). Backend full suite 944 passed before the rebase.

**Toolkit check after the fact (2026-10-01).** `ui-ux-pro-max` was run during the Day 12 audit but **not** on the 12b/12c changes before they shipped (the briefs came from the panels). Run now on the live decisions, verified matches only: *Chip Collection Reflow* (chips wrap — holds), *Compact Label Semantics* ("don't make every pill clickable or encode status with colour alone") → the active-filter tags (amber risk-ink pills, design N6) are a confirmed hit → carry-over to the contracts backlog; *Focus States* → the new Radix compare dialog's close control must show a ring (unverified → check). No verified match for dual-axis readability, quote/attribution blocks, toolbar style consistency, or sticky headers (off-topic hits).
