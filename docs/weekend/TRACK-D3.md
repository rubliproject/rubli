# Weekend Track D3 — La Trama · Institutions · Categories · El Archivo · Vendor dossier (report)

**Date:** 2026-10-03 · **Branch:** `weekend/track-d3` (off `303c0c43`, D1 and D2 included) · **Agenda:** `docs/FRONTEND_WEEKEND_2026-10-03.md` § Track D · **Brief:** `.claude/designus/weekend/trackD-pertab-brief.md` · **Progress, scripts, probe and census output, crops:** `_atlas_research/weekend/trackD/d3/` (main checkout)

Every change is enhance-in-place. No copy changed and no section was added. The 1440 crops show the same compositions before and after.

## Outcome

Three large load shifts are gone:

| Route | CLS before | CLS after |
|---|---|---|
| `/contracts/246083` | 0.646 | 0.032 |
| `/institutions` | 0.224 | 0.057 |
| `/network` | 0.141 | 0.007 |

Contrast failures, small ochre text, title-only affordances and raw hex are 0 on all eight routes at 1440 EN and 390 ES. The lining census is clean: 0 stubs, 0 dash-led lines, 0 overflow. The vendor hero stub, which Track A left as a data-level exception, is closed. Its CLS still varies with API latency (see the backlog).

**Routes.** `/categories/20` and `/contracts/246083` are the dossiers that Days 10–12 judged on. `/institutions/251` and `/vendors/29277` come from the brief.

## Commits

| Commit | Tab | Changes |
|---|---|---|
| `c3b3aa55` | shared | Chip ink on plate paper, `DotStrip` links, 44px tooltip and export targets on phones |
| `ae86b3f6` | `/network` La Trama | 7 |
| `a316a9a9` | `/institutions` + `/institutions/:id` | 8 |
| `afa82ee6` | `/categories` + `/categories/:id` | 8 |
| `8818f7d4` | `/contracts` + `/contracts/:id` | 6 |
| `fee7d99b` | `/vendors/:id` | 7 |
| `cbcd3fdd` | `/institutions` + vendor | the last two dash-led lines from the final census |
| (this) | report | |

## Shared changes (D3 owns these)

- **`EntityIdentityChip` ink on plate paper.** The fix stays inside the chip's own maps, with no fork. High and medium risk names, T2/T3 badges, and SFP/Ghost flags move from `RISK_TEXT_COLORS` (4.45 and 4.36:1 on `#f3f1ec`) to the documented `RISK_INK_ON_PLATE` twins (6.3 and 6.1:1). Critical stays `RISK_TEXT_COLORS.critical`, and dots keep the vivid fills. This closes the Day 5b/10 chip item and the D2 backlog note.
- **`DotStrip` rows with `href`.** They now render a router `<Link>` instead of a raw `<a>` that reloaded the page. No caller passes `href` today (the last one, `InstitutionProfile`, was removed on Day 9), so the prop is simply correct now.
- **`ScaleBlock` USD line on ES.** This was already MXN-only on Spanish, closed in `e69e657f` (PARALLAX D5). I verified it and made no change.
- **Phone targets on shared controls** (D2 backlog). Below `sm`, these are now 44px:
  - `MetodologiaTooltip` `?` (a negative block margin keeps its line box at 24).
  - The `TableExportButton` CSV, chevron and menu items.
  - `SortHeaderTh`, used by five tables.

## Per tab

| Tab | Changes made | Backlog left |
|---|---|---|
| `/network` | (1) The plano's slot is held while the cluster index loads, using the measured heights 447/386/426. It used to mount late and drop the instrument 426px. (2) 36 small ochre leaves take `--color-accent-text`: Folio·XIV, § Cluster index, the lens toggle, GT counts, share marks, the open-in-mesh buttons and the force-graph hover. (3) ClusterActa's verdict, rationale and severity labels go through `textInk()`: `#ef4444` was 3.76:1. (4) The folio `·` drops opacity 0.5 (2.01:1). (5) Pattern chips and cluster pins are 44px below `sm`. (6) The verdict rationale glues its dashes (Track A ES node note). (7) Hero font tokens. | 49 phone "targets" are force-graph nodes (6–12px `<g>`). Their size is the data, and the rail is the keyboard path. The six network files still carry inline font stacks beyond the hero (Day 4). |
| `/institutions` | (1) The exposure lede and the editorial finding keep their slots while loading, using invisible same-copy placeholders: CLS 0.224 → 0.057. (2) The sector dot drops a redundant `title`, since the sector prints beside it: title-only 50 → 0. (3) The pillar-breakdown toggle is 44px below `sm`: phone targets 50 → 0. (4) The IMSS lede and the weakest-pillar agate glue their dashes (Track A ES exception). (5) Editorial font token on h1 and finding. | The residual 0.057 is the lower sections settling at the fold edge. Desktop expand toggles stay 24px, which meets AA. |
| `/institutions/:id` | (6) The supplier-register SORT and FLOOR toggles are 44px below `sm`. (7) "See full methodology" is a 24px row (44 below `sm`); it was 18px inline. (8) Hero font tokens. | The `risk-profile` and largest-contracts calls time out at 30 s under probe load (Day 9 backlog: precompute). |
| `/categories` | (1) The h1's saldo clause and the stat rail keep their shape while loading: CLS 0.065 → 0.003. (2) Risk numbers in the register and hover dossier use `textInk()`: `#f59e0b` at 13px was 2.04:1. (3) Small ochre takes the text accent: Stocktake kicker, descuadre ≥10, Alzado rule labels, coda link. (4) The single-bid dot drops its `title`, because the focus-opened hover dossier prints the same 1P %: title-only 72 → 0. (5) The stocktake note glues its dash (Track A). The null «—» drops opacity 0.5. Register chips go `xs` → `sm` (20 → 24px). The Watchlist link is 24px, 44 below `sm`. | None found by the probe. |
| `/categories/:id` | (6) Name and verdict seal stack below `sm`. The h1 had been about 142px wide at 390: overflow 1 → 0, stubs 2 → 0. Local section headers wrap the title under the § eyebrow below `sm`, which removes 4 h2 stubs. (7) The lede drop cap uses the shared `.lede-dropcap` class in the sector text ink. The aria-hidden span had split the first word for assistive tech, the Day 5b class of bug. (8) A viewport-tall loading skeleton (footer-flash outlier run 0.128). Seasonality bars get `role="img"` labels and the December initial its AA ink. Sexenio term buttons go 16 → 24px (44 below `sm`). Separator at full muted ink. Methodology link 24/44. Font tokens. | 16 `IMSS` chips per page are 24px at 390. That is the shared chip's height; see the backlog. The local `DossierSectionHeader` fork remains (same note as D1's `/sectors/:code`). |
| `/contracts` | (1) The row's sector dot drops its `title`, and the peek's facts grid prints the sector, which is the keyboard path. The compare column names itself in sr-only text. Title-only 51 → 0. (2) Toolbar, pagination, sort buttons, peek chevrons and the "about" summary are 44px below `sm`: 116 → 57. The 57 that remain are 20px checkboxes inside a 44px `<label>` and row titles that stretch over the whole row. (3) The active sort header, peek "Open full dossier" and COMPRANET take the text accent. The peek actions are 44px below `sm`. | — |
| `/contracts/:id` | (4) A viewport-tall loading skeleton: the footer flashed into view and out, CLS 0.646 → 0.032. (5) RelationSection's loading kicker was 9.5px (under the floor) in the vivid ochre. It is now the loaded kicker's 11px in the text accent. (6) The PairLedger kicker, the Watchlist link and the β·z toggle take the text accent. The two links are 44px below `sm`, and so is the methodology link. | The year-axis drill-in buttons are 33×24 at 390. They are adjacent tick labels sized by D12b and meet WCAG 2.5.8 at 24px; 44px would overlap neighbouring years. |
| `/vendors/:id` | (1) The h1 glues its last two words when they fit, using `noOrphan` at 24 chars. That is about 315px at 32px in the 334px phone box. «Grupo Farmacos / Especializados» becomes «Grupo / Farmacos Especializados», closing the Track A exception. (2) Eight ochre type leaves take the text accent: marginal note, «Copied», § El desvío, deviation values, activity glyphs, and the methodology and ARIA links. (3) The SHAP-absent note, the cluster verdict and the § El Desvío intro glue their dashes (Track A). (4) The contracts pager and CSV are 44px below `sm`. (5) "Open in the ARIA queue" is internal, so it gets an arrow, not `ExternalLink` (Day 10b). (6) The EU 10% tick drops its `title`, since the legend prints it. (7) Methodology link 44 below `sm`. | CLS varies with API latency (0.025–0.15 across runs); see the backlog. |

## Census and probe

**Lining census.** Same tool as D1 and D2. It covers 8 routes at 1440, 1280 and 390 in EN and ES, which is 48 loads. Before is prod `rubli.xyz`, which serves base `303c0c43`.

| | stub | short (hero) | split | dash-led heading | dash-led prose | overflow |
|---|---|---|---|---|---|---|
| Before | 5 (4 on heroes) | 0 (+6 other) | 0 | 0 | 3 | 2 |
| After | 0 | 1 (+4 other) | 0 | 0 | 0 | 0 |

The "short" lines are balanced two-word last lines at 390, such as «y Farmacéuticos» on the category h1 and «Farmacos Especializados» on the vendor h1. They are not defects by Track A's definition. The vendor one is the glue fix working. The interim run showed two dash-led lines that the before run had not reached; both are glued in `cbcd3fdd`, and a rerun reads 0.

**Probe.** The table shows 1440 EN and 390 ES. The other two runs match within one item. Each cell is before → after, and a dot means zero in both runs. Every run scrolls the page first (`SCROLL=1`). Before is prod, after is local Vite on 3012 against the prod API. Raw hex in text was 0 everywhere.

| Route @ width | sub-10px | clipped | contrast < AA | small accent | < 44px target | title-only |
|---|---|---|---|---|---|---|
| `/network` 1440 EN | · | · | 7 → 0 | 36 → 0 | 118¹ | · |
| `/network` 390 ES | · | · | 7 → 0 | 36 → 0 | 116 → 49² | · |
| `/institutions` 1440 EN | · | · | · | · | 51¹ | 50 → 0 |
| `/institutions` 390 ES | · | · | · | · | 50 → 0 | · |
| `/institutions/251` 1440 EN | · | · | · | · | 4 → 3¹ | · |
| `/institutions/251` 390 ES | · | · | · | · | 1 → 0 | · |
| `/categories` 1440 EN | · | · | 29 → 0 | 26 → 0 | 17 → 1¹ | 72 → 0 |
| `/categories` 390 ES | · | · | 29 → 0 | 26 → 0 | 1 → 0 | 72 → 0 |
| `/categories/20` 1440 EN | · | · | 1 → 0 | · | 7 → 20³ | · |
| `/categories/20` 390 ES | · | · | 1 → 0 | · | 21 → 16⁴ | 12 → 0 |
| `/contracts` 1440 EN | · | · | · | · | 134 → 133¹ | 51 → 0 |
| `/contracts` 390 ES | · | · | · | · | 115 → 57⁵ | 51 → 0 |
| `/contracts/246083` 1440 EN | · | 1 → 2⁶ | 1 → 0 | 1 → 0 | 2¹ | · |
| `/contracts/246083` 390 ES | · | 1⁶ | 2 → 0 | 2 → 0 | 8⁷ | · |
| `/vendors/29277` 1440 EN | · | 1⁶ | 8 → 0 | 8 → 0 | 4¹ | 1 → 0 |
| `/vendors/29277` 390 ES | · | 1⁶ | 8 → 0 | 8 → 0 | 3 → 0 | 1 → 0 |

Footnotes:

1. Desktop items of 24–36px meet WCAG 2.5.8 AA. They are the shared header shield (36px), the breadcrumb, 24px row toggles and peek chevrons, and 20px compare checkboxes inside a 44px label.
2. Force-graph nodes, as in the `/network` row of the per-tab table.
3. The before run got 503s from prod, so the 16 `IMSS` chips never rendered. After, they are 24px (AA) and the term buttons went from 16 to 24px.
4. The 16 `IMSS` chips at 24px. This is the shared chip height (backlog).
5. 50 checkboxes inside a 44px label, plus 7 row titles that stretch over the row.
6. The shared header crumb cuts long dossier titles with «…» (backlog). The 1 → 2 is the same crumb measured twice (`nowrap` and ellipsis).
7. Year-axis ticks, as in the `/contracts/:id` row of the per-tab table.

**Focus.** The class-based no-focus column read 0 before and after on all eight routes.

**CLS.** Track B method: 1366×768, load plus networkidle plus 3 s, median of 3. Before is prod and after is local, both against the prod API.

| Route | Before | After |
|---|---|---|
| `/network` | 0.1414 | 0.0070 |
| `/institutions` | 0.2237 | 0.0573 |
| `/institutions/251` | 0.0081 | 0.0074 |
| `/categories` | 0.0648 | 0.0026 |
| `/categories/20` | 0.0159 (one run 0.128) | 0.0129 |
| `/contracts` | 0.0108 (one run 0.457) | 0.0046 |
| `/contracts/246083` | 0.6464 | 0.0318 |
| `/vendors/29277` | 0.0677 (runs 0.07 / 0.07 / 0.18) | 0.0584 (runs 0.15 / 0.025 / 0.058) |

**Reduced motion.** Measured with Edge `reducedMotion: 'reduce'` at 1366×768. All eight routes have 0 running animations, 0 hidden text in the viewport, and no pixels moved over 600 ms.

## Honesty spot-check (typed figures)

- **`/categories` h1.** «Seventy-two shelves» and the «9.9T MXN» placeholder are typed. Prod `/categories/summary` returns 72 categories summing 9.87T, so both are honest. The stocktake note and rail type «99.73%» of classifiable spend, which matches CLAUDE.md's honest pitch matrix.
- **`/network`.** «RFC coverage 0.1% for 2002–2010» and «edges capped at 2,500» are a data-structure fact and a code constant. Every count is live.
- **`/institutions`, `/contracts`, the dossiers.** Every headline number is live. The vendor provenance line types «1,417 cases at training time», which matches the v0.8.5 run.
- **Data, not UI.** The `/contracts` peek showed a contract dated Dec 31, 2025, which is past the 2025-09-28 cut. This is the same `contract_date` versus `publication_date` question as the Day 10 wire item.

## Backlog left (overflow and out of scope)

- **Vendor hero CLS.** The marginal-note PriorityAlert grows from one row to three as five flag queries land. In order: external flags (2.97 s), ground truth and ARIA queue (3.78 s), waterfall (4.14 s) and co-bidders (4.77 s). The vendor record arrives at 1.70 s. The run spread is 0.025–0.15. A reserved slot cannot know the flag count, and gating the page costs about 3 s of blank page. The fix is a decision: either the alert waits for the queries in a placeholder, or the flags move beside the lede.
- **Shared header crumb.** It cuts long dossier titles with «…» at 1440 and 390 («Grupo Farmacos Especializad…», «Montaje de equipos y estructuras diversa…»). Its `nowrap` type label overflows on ES (`Expediente institucional` 154 > 96). This is D1's header.
- **`EntityIdentityChip` height at 390.** The chip is 24px (AA) but not 44. A `max-sm` hit area would change every chip list on phones. It should be a one-time shared pass with a site-wide before/after dump (PARALLAX process rule).
- **Force-graph nodes** on `/network` are under 44px by design.
- **`/contracts` peek chips** truncate names («Ana Karen Serralde…») because they are not `fullName`. This is outside the ≤ 8 cap.
- **Local section-header forks** remain in `CategoryDossier`, matching D1's `/sectors/:code` note. Fold them into `components/dossier`.

## Gates

| Gate | Result |
|---|---|
| `tsc --noEmit -p tsconfig.app.json` | 0 errors |
| `npm run build` | built in 1m 37s |
| `npm run lint:tokens` | PASS (0 forbidden, 55 warnings) |
| `npx eslint .` | 0 errors, 37 warnings (same as D2, none new) |
| `vitest run --no-file-parallelism` | 106/106 |
| Lining census (8 routes, 48 loads) | 0 stub / 0 split / 0 dash / 0 overflow |
| Probe (8 routes × 1440/390 × EN/ES) | 0 sub-10px · 0 raw hex · 0 contrast · 0 small accent · 0 title-only |
| CLS | < 0.06 median on all eight routes (vendor varies, see backlog) |

## Screenshots

Before/after crops are in `_atlas_research/weekend/trackD/d3/shots/` (main checkout). **Before** is prod `rubli.xyz`; **after** is local Vite. Element crops hide sticky chrome (Story Days § 7).

- **Heroes:** `{before,after}-<route>-1440-en-hero` and `-390-es-hero` for all eight routes. After-only runs also add `-1440-es-hero` and `-390-en-hero`.
- **`/network`:** `*-network-1440-en-rail`, and `*-network-390-es-chips` (P2 pattern chip pressed).
- **`/institutions`:** `*-institutions-1440-en-register`, and `*-institutions-390-es-expand` (a pillar breakdown opened).
- **`/categories`:** `*-categories-1440-en-register`, and `*-categories-1440-es-hover` (row hover dossier).
- **`/categories/20`:** `*-categories-20-390-es-hero` (stacked name and seal), and `*-categories-20-390-en-kardex`.
- **`/contracts`:** `*-contracts-1440-en-table`, and `*-contracts-390-en-peek` (quick look open).
- **`/contracts/246083`, `/vendors/29277`, `/institutions/251`:** 390 ES heroes. The vendor 1440 EN hero is also included.
