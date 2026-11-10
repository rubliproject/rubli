# Weekend Track D2 — La Cola · Casos · Sala de Redacción · 3 stories (report)

**Date:** 2026-10-03 · **Branch:** `weekend/track-d2` (off `5848d151`, D1 included) · **Agenda:** `docs/FRONTEND_WEEKEND_2026-10-03.md` § Track D · **Brief:** `.claude/designus/weekend/trackD-pertab-brief.md` · **Progress, scripts, probe and census output, crops:** `_atlas_research/weekend/trackD/d2/` (main checkout)

Every change is enhance-in-place. No story copy changed, every figure stays live, and the 1440 crops show the same compositions before and after.

## Outcome

The two worst load shifts are gone. `/aria` went from 0.20 to 0.024 and the case dossier from 0.16 to 0.031. The lining census is clean on all seven routes: dash-led prose went from 18 lines to 0. Small ochre text failing AA went to 0 on `/aria`, `/cases`, the case dossier and `/journalists`. Story-side contrast failures dropped by two thirds; what remains is listed in the backlog.

**Story substitution.** `/stories/la-estafa-maestra` is not a story slug and renders "Story not found". I swept `/stories/la-industria-del-intermediario` in its place, because it is the P3 intermediary story that carries the Estafa Maestra chapter. The case dossier `/cases/estafa-maestra` is in the `/cases` tab. The lead was told.

## Commits

| Commit | Tab | Changes |
|---|---|---|
| `0342dd2f` | `/aria` La Cola | 8 (one is the shared `TableExportButton`) |
| `37356615` | `/cases` + `/cases/:slug` | 7 |
| `81fd4799` | `/journalists` | 7 |
| `886d2b37` | story template (all 13 stories), checked on 3 | 8 (one is the shared `textInk` helper) |
| (this) | report | |

## Per tab

| Tab | Changes made | Backlog left |
|---|---|---|
| `/aria` | (1) § EL SALDO waits for both queries and holds its measured height (EN and ES), the funnel skeleton matches the loaded band, and the T2 calibration line keeps its slot: CLS 0.1997 → 0.024. (2) Small ochre type moves to `--color-accent-text`: GT provenance, driver label, next-to-review, view-to-review. The "To review" chip loses its raw `#a06820`. (3) The T1 disposition dateline rides inside the count span with its dash glued, and that line and the key line drop the global paragraph cap (Day 14 item). (4) Pattern chips wrap at every width (Day 14: a 1,542px scroller at 1440). (5) 44px targets under `sm` for filter chips, funnel rows, the row number toggle and pagination. (6) Editorial font token on the h1, funnel readout, register header and breakdown. (7) Disposition strip segments lose title-only tooltips; the text line under the strip carries the same counts. (8) `TableExportButton` labels and tooltips are bilingual (shared, Day 14 item). | `MetodologiaTooltip` `?` is 24px at 390 (shared). The export split button is 28px at 390 (shared, used on 8 pages). Ghost panel rows (Day 14). "Promote to GT" on LEAD rows waits on the write-key decision. |
| `/cases` | (1) The disposition band holds its measured box until stats land, the EN USD sub-line keeps its slot, and the list skeleton is viewport-tall: CLS 0.052 → 0.006. (2) 21 small ochre leaves move to the text accent: The Docket kicker, EXP folios, GT marks, lead-case and finding kickers, the lone-conviction note, and the active filter and sort fills. (3) Band segments lose title-only tooltips; the legend is the keyboard path and carries label and count. (4) Editorial font token across the index blocks. | The 4 card summaries are a deliberate 2-line teaser clamp that opens the dossier. They are exempt under the Story Days § 7 teaser decision, but the probe still counts them. AgateLedger has no `<table>` semantics (Day 5). |
| `/cases/:slug` | (5) `DossierSkeleton` is viewport-tall, so the footer no longer flashes in and out: CLS 0.164 → 0.031. (6) The charge clause glues its dash. (7) The § I drop cap is `::first-letter` in the sector text ink. Screen readers get the first letter back, and energía no longer prints at 1.82:1 (Day 5b item). VERIFIED, source-type and party-type labels also take the text accent. | The residual 0.03 is a 2–4px text nudge in the hero from the Playfair swap. The timeline year ticks are exposed after the `aria-label` (Day 5b). |
| `/journalists` | (1) Story briefs drop `line-clamp-3/4`. Ten typed briefs were cut mid-figure («four fifths or mor…»): clipped 14 → 0. (2) Stretched story links, tour badges, the Atlas link and the colophon link get the house focus ring. (3) THE FRONT PAGE eyebrow, the thesis accent and Explore take the text accent, and the wire's LIVE takes the critical text ink (3.57 → AA). (4) `glueDashes` on briefs and colophon clauses, and the Atlas band dash is glued. This covers Track A's two ES lines. (5) Wire chips print full vendor names. (6) Wire chips and tour badges are 44px under `sm` and 24px above. (7) Editorial font token on the thesis, briefs and colophon. | The colophon and Atlas band stay at the 1152 width (Day 3 decision). The Share button copies silently without `navigator.share` (Day 3). |
| Stories | (1) Small type in the outlet accent gets a text twin: the investigative ochre was 2.51:1 and now uses `--color-accent-text`. This covers chapter kickers, era pills (new `ink` prop on `ChapterBanner`), the subjects kicker, the sexenio label and the Observatory tour label. (2) New `textInk()` in `lib/constants` maps sector and risk mark hexes to their AA twins. ChartCard anchors, sector-bar values and intermediary multiples use it, so energía goes from 1.92 to 5.1:1. Bars keep the vivid palette. (3) Risk-red type takes `RISK_TEXT_COLORS.critical`: the subjects readout, the methodology figure, next-steps markers, and the emergency anchors and deltas. (4) Subject list and related-entity chips print full names. Six names had been cut with «…» (Story Days § 7). (5) Targets: chapter-nav dots are 24px; All stories, sources, Open dossier and the lens toggle are 44px under `sm` and 24px above. (6) `glueDashes` on ChartCard annotations and subject roles fixes 5 dash-led caption lines. (7) The ChartCard source line drops its 0.85 opacity, from 3.86 to AA. (8) The text-safe twins also cover the Observatory tour card. | See the backlog: the emergency calendar's title-only cells, DataPullquote reds, chip ink on plate paper, and the chapter-nav label overflow. |

**Shared effects to know about.** `textInk()` changes ChartCard anchor ink and sector-bar value ink on all 13 stories. They become the darker twin of the same hue. The outlet-ink change also applies to all 13 stories. `CasesShared` and `TableExportButton` are used beyond this batch, and both changes are strings or tokens only.

## Census and probe

**Lining census.** Same tool as D1 (`census.mjs`). It covers 7 routes at 1440, 1280 and 390 in EN and ES, which is 42 loads.

| | stub | short (hero) | split | dash-led heading | dash-led prose | overflow | page overflow |
|---|---|---|---|---|---|---|---|
| Before | 0 | 3 (+35 other) | 0 | 0 | 18 | 0 | 0 |
| After | 0 | 3 (+35 other) | 0 | 0 | 0 | 0 | 0 |

The 3 "short" hero lines are balanced two-word last lines on story titles at 390. They are not a defect by Track A's definition.

**Probe.** The table shows 1440 EN and 390 ES; the other two runs match within one item. Each cell is before → after, and a dot means zero in both runs. Story baselines are the scroll-through run (`before-stories-scroll.json`). Without scrolling, the reveal-once sections sit at opacity 0 and read as 1.00:1 contrast. The final run (`after.json`) scrolls every page.

| Route @ width | sub-10px | clipped | contrast < AA | small accent | < 44px target | title-only |
|---|---|---|---|---|---|---|
| `/aria` 1440 EN | · | · | 1 → 0 | 8 → 0 | 8 → 7¹ | 4 → 0 |
| `/aria` 390 ES | · | · | 1 → 0 | 8 → 0 | 57 → 5² | 4 → 0 |
| `/cases` 1440 EN | · | 4 → 4³ | 21 → 0 | 21 → 0 | 1 → 1¹ | 6 → 0 |
| `/cases` 390 ES | · | 4 → 4³ | 13 → 0 | 13 → 0 | · | 6 → 0 |
| `/cases/estafa-maestra` 1440 EN | · | · | 9 → 0 | 10 → 0 | 2 → 2¹ | · |
| `/cases/estafa-maestra` 390 ES | · | · | 9 → 0 | 10 → 0 | · | · |
| `/journalists` 1440 EN | · | 14 → 0 | 3 → 0 | 2 → 0 | 11 → 1¹ | · |
| `/journalists` 390 ES | · | 14 → 0 | 3 → 0 | 3 → 0 | 10 → 0 | · |
| `/stories/el-gran-precio` 1440 EN | · | 5 → 4⁴ | 20 → 9⁵ | · | 13 → 2¹ | · |
| `/stories/el-gran-precio` 390 ES | · | 3 → 3⁴ | 15 → 4⁵ | · | 6 → 0 | · |
| `/stories/la-industria-del-intermediario` 1440 EN | · | 9 → 3⁴ | 39 → 9⁵ | 1 → 0 | 18 → 2¹ | · |
| `/stories/la-industria-del-intermediario` 390 ES | · | 9 → 3⁴ | 28 → 4⁵ | 1 → 0 | 12 → 0 | · |
| `/stories/el-ano-de-la-emergencia` 1440 EN | · | · | 28 → 10⁵ | · | 12 → 2¹ | 366 → 366⁶ |
| `/stories/el-ano-de-la-emergencia` 390 ES | · | · | 24 → 7⁵ | 1 → 1 | 7 → 0 | 366 → 366⁶ |

Raw hex in text was 0 everywhere, before and after.

Footnotes:

1. Desktop items are the shared header shield (36px), the breadcrumb, and `/aria`'s 24–28px export and tooltip buttons. All meet WCAG 2.5.8 AA at 24px.
2. The `?` tooltip and export split button are shared components. The saldo anchor and the "Tier 2" button are inline in prose, which is exempt.
3. Card teasers clamped to two lines by design.
4. Related-story teasers (`StoryCard`). These are exempt by the Story Days § 7 decision. At 1440, one hover-only chapter-nav label overflows its flex box (`nowrap`).
5. What remains: decorative `·` separators at reduced opacity; `EntityIdentityChip` names in `RISK_TEXT_COLORS.high` on plate paper at 4.45; DataPullquote stat and eyebrow reds (`#ef4444`, `#dc2626`) in the emergency story; one 24px `#f59e0b` pullquote stat on the intermediary story; and white-on-bar labels that the probe reads against the page.
6. The emergency calendar heatmap has 366 day cells that carry their reading only in a `title` attribute.

**Focus.** The probe's no-focus column is class-based. It flags 16–27 story links that carry no `focus-visible:` class, but the site's global `:focus-visible` rule draws a ring on them. I verified this directly: on the intermediary story, 73 of 73 focusables show a ring when focused. The column is therefore left out of the table. The four non-story routes read 0 no-focus after this sweep. `/journalists` was 18 before.

**CLS.** Track B method: 1366×768, load plus networkidle plus 3s, median of 3.

| Route | Before | After |
|---|---|---|
| `/aria` | 0.1997 | 0.0239 |
| `/cases` | 0.0518 | 0.0057 |
| `/cases/estafa-maestra` | 0.164 | 0.0314 |
| `/journalists` | 0.0037 | 0.0027 |
| 3 stories | 0.0027 | 0.0027 |

**Reduced motion.** Measured with Edge `reducedMotion: 'reduce'` at 1366×768. All seven routes have 0 running animations and no pixels moved over 600 ms. `/aria`, `/cases`, the case dossier and `/journalists` have 0 hidden text in the viewport. The stories report 5, 4 and 3 hidden leaves, which equals each story's chapter count. These are the chapter-nav hover labels in the fixed rail, which are opacity 0 until hover or focus by design, not unrevealed content.

## Honesty spot-check (typed figures)

- **`/aria`.** Every number in § EL SALDO, the funnel and the register is live. The "Model v0.8.5" dateline is typed.
- **`/cases`.** The masthead, headline («13 case files. One conviction.») and disposition band are computed from `/cases/stats`. The dossier's threshold multiplier is computed against the platform's sector review thresholds, and the copy says it is an internal benchmark.
- **`/journalists`.** The ten story briefs carry typed figures in the page's `INVESTIGATIONS` table, for example 15,939, 405.3B, 77.8%, 65.65%, 82.18%, 6,118 and 126. They were adjudicated in the Story Days QC pass. Showing them in full instead of cut mid-number is the honest form. The colophon's "out-of-sample AUC 0.656" is typed and matches the pre-publication audit's forward holdout.
- **Stories.** The methodology section types "3,051,294" scored contracts, which is also the methodology footnote's figure. `useExecutiveSummary` serves total contracts, not scored contracts, so swapping it in would change the claim. It is reported, not fixed.

## Backlog left (overflow and out of scope)

- **Emergency calendar.** 366 heatmap cells are title-only. They need a hover or focus readout line under the grid, which is graphics-track work.
- **Story DataPullquote.** The stat and eyebrow use raw risk reds (`#ef4444` 3.76, `#dc2626` 4.05 at 11px), and the intermediary's 24px `22,263` uses `#f59e0b` at 2.15. The fix is `textInk()` inside DataPullquote's `statColor` path. It is shared by all 13 stories, so it needs a judge pass on all heroes.
- **`EntityIdentityChip` ink on plate paper.** `RISK_TEXT_COLORS.high` reads 4.45 on `#f3f1ec`. This is the Day 5b/10 shared-chip item and would fold `RISK_INK_ON_PLATE` into the chip.
- **Shared 24px controls at 390.** `MetodologiaTooltip` and the `TableExportButton` split button need 44px. They are used on 8 or more pages, so do them once in a shared pass.
- **Chapter-nav labels.** The hover labels are `nowrap` in a fixed rail and one overflows its box at 1440. They are hover-only but should get a max width with wrap.
- **Probe tooling.** Make the probe's focus check behavioural (focus each element and read `:focus-visible` plus outline) instead of class-based. Scroll before probing any page with reveal-once sections. Both are already in `d2/probe.mjs` behind `SCROLL=1`.
- **`/aria` CLS residual (0.021).** The filter rail moves 14px when the queue summary resolves. It is under budget.

## Gates

| Gate | Result |
|---|---|
| `tsc --noEmit -p tsconfig.app.json` | 0 errors |
| `npm run build` | built in 3m 56s |
| `npm run lint:tokens` | PASS (0 forbidden, 55 warnings) |
| `npx eslint .` | 0 errors, 37 warnings, none in a touched file |
| `vitest run --no-file-parallelism` | 106/106 |
| Lining census (7 batch routes, 42 loads) | 0 stub / 0 split / 0 dash |
| CLS | < 0.035 on all seven routes |

The parallel `vitest run` timed out starting fork workers under machine load. That was 7 "failed to start worker" errors, not test failures. The serial run passes everything.

## Screenshots

Before/after crops are in `_atlas_research/weekend/trackD/d2/shots/` (main checkout). **Before** is prod `rubli.xyz`. Hero crops come from the local base run (`before-<route>-<w>-<lang>-hero`, `after-<tag>-<route>-…-hero`). Element crops hide sticky chrome (Story Days § 7).

- **`/aria`:** `*-aria-1440-en-register`, `*-aria-390-es-register`, `*-aria-390-es-filters`, and `*-aria-{1440-en,390-es}-desglose` (a row expanded).
- **`/cases`:** `*-cases-{1440-en,390-es}-band`, and `*-cases-1440-es-menu` (the Type menu open).
- **`/cases/estafa-maestra`:** `*-cases-estafa-{1440-en,390-es}-caso` (the § I drop cap).
- **`/journalists`:** `*-journalists-{1440-en,390-es}-desk`, `*-journalists-1440-en-wire`, and `*-journalists-1440-es-hover` (headline hover).
- **Stories:** `*-story-intermediario-{1440-en,390-es}-subjects`, `*-story-granprecio-1440-en-chart`, `*-story-emergencia-1440-es-lens` (the lens toggled), and `*-story-emergencia-390-en-sources` (citations open).

## Addendum — `/stories/captura-institucional` (swept after the report; code in `303c0c43` + `abf593de`)
| Measure | Before (prod) | After |
|---|---|---|
| Lining census (6 loads) | — | 0 stubs · 0 splits · 0 dash-led |
| Contrast failures 1440 EN / 390 ES | 28 / 26 | 1 / 1 (the decorative «·» separator) |
| Targets < 44 px, 1440 / 390 | 13 / 6 | 2 (shared header) / 0 |
| Clipped | 3 | 3 (exempt StoryCard teasers) |
| CLS | 0.0045 | 0.0027 |

Changes: `textInk()` now also maps the risk and accent CSS variables to their text twins; the DataPullquote eyebrow uses `textInk` and drops its 0.85 opacity (clears violet 3.34:1 on captura and the emergency eyebrow's 4.05:1); the CaptureFigures «% to IMSS» label and the SeriesLine emphasis callouts use the critical text ink. Emergency story at 390 now shows 1 contrast item. Remaining D2 backlog: the 366 title-only calendar cells; EntityIdentityChip names at 4.45:1 on plate paper (→ D3).
