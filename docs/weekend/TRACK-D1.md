# Weekend Track D1 — El Mapa · Dashboard · Sectors (report)

**Date:** 2026-10-03 · **Branch:** `weekend/track-d1` (off origin/main `a8230fc1`, Tracks A–C included) · **Agenda:** `docs/FRONTEND_WEEKEND_2026-10-03.md` § Track D · **Brief:** `.claude/designus/weekend/trackD-pertab-brief.md` · **Progress, scripts, probe and census output, shots:** `_atlas_research/weekend/trackD/d1/`

All three pages are gold. Every change is enhance-in-place, and the 1440 crops show the same composition before and after.

## Outcome

Cumulative layout shift is under 0.01 on all four routes. The biggest gain is `/dashboard`, from 0.36 to 0.006. The lining census is clean on the batch routes. The darker text accent token now exists, and every small accent label on the four routes uses it.

## Commits

| Commit | Tab | Changes |
|---|---|---|
| `280cf4bf` | shared shell | `--color-accent-text`, header shield / DQ / sign-in, "Home" i18n, PlateFrame tokens and data-cut stamp |
| `e4663574` | `/` El Mapa | 7 |
| `fb512c8c` | `/dashboard` | 7 |
| `27476647` | `/sectors` + `/sectors/:code` | 8 (2 of them shared, found here) |
| (this) | report | |

## Shared changes (D1 owns these)

- **Text-only accent token.** `--color-accent-text` is `#835616`, which measures 6.0:1. The old `#a06820` measured 4.14:1 on the elevated paper and 4.44:1 on the page. The token is for small type only: kickers, folio labels, chips and eyebrows. Large display accents, rules, fills and borders keep `--color-accent`. `.text-kicker--analysis` now uses it.
- **Where the token was verified.**
  - The header DQ chip, on all four routes.
  - PlateFrame `Folio·N` on `/dashboard` (III–IX) and `/sectors` (II·a, II·b).
  - PlateFrame folios on `/gap` and `/methodology`, by probe. No PlateFrame failures are left there.
  - The El Mapa § eyebrows and the SPEND toggle.
  - The remaining `#a06820` hits on `/gap` and `/methodology` are page-local labels. They belong to D4.
- **PlateFrame.** The folio label is on the text accent. The `·` separator and the stamp label are at full muted ink (1.96 and 2.11 before). The stamp printed today's date and now prints the data cut, «Corte / Data cut 2025·09·28». Fonts come from the new `--font-family-archival` (IBM Plex Mono) and `--font-family-editorial` (EB Garamond) tokens.
- **Header.**
  - The shield button said "N high-risk alerts" but opened `/methodology`. It is now a link to `/contracts?risk_level_min=high`, the high-risk contracts it counts.
  - The DQ chip and Sign in are now links with focus rings.
  - Search and shield are 44px under `md`.
  - The search pill sizes to its placeholder. It used to cut it on every page (140 > 116px).
  - `getParentPath` "Home" now comes from i18n.
  - On phones the crumb title may take two short lines instead of an ellipsis.
- **EB Garamond fallback face (CLS).** "EB Garamond Fallback" is local Georgia scaled to EB Garamond's measured advance widths: 86% at 400 weight and 89% at 500+. It sits behind `--font-family-editorial`, so the web-font swap no longer re-wraps text set with the token.
- **Route skeletons are viewport-tall** (`min-h-[100svh]`). The footer stays below the fold while a lazy chunk loads.

## Per tab

| Tab | Changes made | Backlog left |
|---|---|---|
| `/` El Mapa | (1) the `/` and `/explore` fallback is `MapShellSkeleton`, SpatialMap's own box; (2) the compass line keeps its two-line slot before data, where it used to push the treemap 43px and re-lay every tile; (3) the § EL REPARTO and § EL CONTRATO eyebrows use the text accent; (4) the SPEND toggle fill uses the text accent (white on `#a06820` was 4.14); (5) the `?` glyph is 44px; (6) the guide's ✕ goes from 9×11 to 44px; (7) continue exits use CSS hover on the colour token instead of JS colour swaps, at 44px rows under `sm` | The Ctrl+K search chip overlaps the Otros tile at 1440 (pre-existing). The treemap tile contrast count is the probe reading gradient fills as transparent; the tiles hold by eye (Day 15 note). |
| `/dashboard` | (1) viewport-tall route skeletons; (2) the fallback face plus editorial/archival tokens on the page's literal stacks; (3) the lede measure is pinned at 32.6em, the same 555px it renders at, see the note below; (4) the "Loading live data…" pill sits in a fixed 24px slot that is the dateline-to-lede gap, and its live region persists; (5) `glueDashes` on 12 intro, finding and wire paragraphs, which covers Track A's three dashboard lines; (6) the ARIA CTA is 44px under `sm`; (7) the ObservatoryScatter Dossier, Back and ▤ buttons get focus rings, and its how-to-read text goes from 4.49 to secondary ink | ObservatoryScatter's scaled SVG prints 8 sub-10px glyphs at 1440 and 27–28 at 390, plus 15–24px orb targets and a clipped `10` tick. This is the shared `/atlas` component (Day 16 backlog). It needs the HTML-owns-glyphs remake, not a size bump. |
| `/sectors` | (1) the h1 measure is pinned at 15.9em, the same 636px; (2) the page's font stacks use the tokens; (3) the «Hallazgo» h2 goes through `tidyNodes`, which removes the ES 390 stub «competencia.»; (4) the two-questions deck goes through `tidyNodes PROSE`, which removes the dash-led «— la escala…» | `RISK_TEXT_COLORS.medium` `#a16207` is 4.36:1 on `76%` and `66%`. That is a site-wide constants step (Day 7 backlog). The `IMSS` chip is 24px at 390, which meets AA but is under 44; the chip is shared. |
| `/sectors/:code` | (5) `DossierSkeleton` is viewport-tall; (6) the local section header wraps under `sm`, and the title drops below the § eyebrow (390 stubs 4 → 0); (7) the risk-band strip's title-only segment tooltips are removed, since the legend prints the same counts; (8) the largest-contracts chips go from `xs` to `sm` (20 → 24px). Shared fixes found here: the WayfindingSpine back link is 44px under `sm`, and the header crumb can take two lines. | The page keeps a local fork of `DossierSectionHeader`; fold it into `components/dossier`. |

**Note on the em pins.** The base measure (68ch, 32ch, 44ch) is in the painting face's zero width. That width is 10% larger in the fallback, so the dashboard lede box was 610px in the fallback and 555px in EB Garamond, and the sectors h1 was 699px and 636px. Both boxes changed size on the swap. Pinning those two boxes in `em` gives the same pixels in EB Garamond and makes them independent of the face.

## Numbers

**CLS.** Measured in Edge at 1366×768, after load, network idle and 3 s. Each value is the median of 3 runs. The before column is base `a8230fc1` on the same Vite.

| Route | Before | After |
|---|---|---|
| `/` | 0.1831 | 0.0034 |
| `/dashboard` | 0.3637 | 0.0057 |
| `/sectors` | 0.0279 | 0.0027 |
| `/sectors/1` | 0.0610 | 0.0027 |

**Lining census.** Uses `lining-census.mjs`, copied as `census.mjs` with a route filter. It covers 4 routes at 1440, 1280 and 390 in EN and ES, which is 24 loads.

| | stub | short (hero) | split | dash-led heading | dash-led prose | overflow | page overflow |
|---|---|---|---|---|---|---|---|
| Before | 5 | 2 (+4 other) | 0 | 0 | 3 | 0 | 0 |
| After | 0 | 2 | 0 | 0 | 0 | 0 | 0 |

The two remaining "short" lines are the dashboard h1 at 390: «competitive bidding.» and «licitación competitiva.». They are balanced two-word last lines, which are not a defect by Track A's definition.

**Probe.** EN is shown; ES matches within one item. Each cell is before → after. A dot means zero in both runs.

| Route @ width | sub-10px | clipped | raw hex | contrast < AA | small accent | no focus ring | < 44px target |
|---|---|---|---|---|---|---|---|
| `/` 1440 | · | 1 → 0 | · | 66 → 64¹ | 2 → 0 | 2 → 0 | 5 → 3² |
| `/` 390 | · | · | · | 46 → 45¹ | 1 → 0 | 1 → 0 | 6 → 0 |
| `/dashboard` 1440 | 8 → 8³ | 2 → 1³ | · | 25 → 0 | 8 → 0 | 3 → 0 | 6 → 5² ³ |
| `/dashboard` 390 | 27 → 27³ | 1 → 1³ | · | 10 → 0 | 7 → 0 | 2 → 0 | 10 → 7³ |
| `/sectors` 1440 | · | 1 → 0 | · | 9 → 2⁴ | 3 → 0 | 2 → 0 | 2 → 2² |
| `/sectors` 390 | · | · | · | 4 → 2⁴ | 2 → 0 | 1 → 0 | 3 → 1 |
| `/sectors/1` 1440 | · | 1 → 0 | · | 1 → 0 | 1 → 0 | 2 → 0 | 22 → 2² |
| `/sectors/1` 390 | · | 0 → 0 (ES 1 → 0) | · | · | · | 1 → 0 | 18 → 0 |

Footnotes:

1. Treemap tile text on gradient fills, which the probe reads as transparent.
2. Desktop targets of 24–36px, which meet WCAG 2.5.8 AA.
3. ObservatoryScatter, the shared Atlas component; see the backlog.
4. `RISK_TEXT_COLORS.medium`, a site-wide token.

Title-only affordances on `/sectors/1` went from 4 to 0. The console errors on `/sectors/1` are the local Vite proxy returning 500 for `/atlas/sector-institutions`. Prod returns 200 for the same URL.

**Reduced motion.** Measured with Edge `reducedMotion: 'reduce'`. All four routes have 0 running animations, 0 hidden text in the viewport, and no pixels moved over 600 ms.

## Honesty spot-check (typed figures)

- **`/dashboard` h1.** "Twenty-three years", "MX$9.9 trillion" and "7 in 10 bypass competitive bidding" are typed in the headline. The lede numbers below are live. "7 in 10" could come from the bundle's direct-award share; that is not done, and it is reported here.
- **Dashboard reference values.** The `stats` fallbacks (3,058,286 contracts and similar) render only when the bundle fails. The status pill then says so.
- **`/` El Mapa h1.** "9.9 trillion pesos" is typed. The stat row and compass line beside it are live.
- **Wire dates (backend).** The five wire rows carry `contract_date` values after the 2025-09-28 cut, for example Dec 24 2025. This is the open Day 10 backlog item.

## Backlog left (overflow and out of scope)

- **ObservatoryScatter glyphs and targets at 390.** These need the "HTML owns glyphs" remake (graphics track, or `/atlas` in D4).
- **Site-wide font swap.** About 90 files still hard-code `"EB Garamond"` or `"IBM Plex Mono"`. Moving them to the tokens gives each one the metric-matched fallback.
- **The ch-based base measure.** It still follows the painting face. An em-based measure would remove the swap reflow class site-wide. Today only the two D1 heroes are pinned.
- **Constants.** `RISK_TEXT_COLORS.medium` 4.36 needs one darker step. The shared `EntityIdentityChip` would need a 44px hit area at 390.
- **For D2–D4.** Page-local `#a06820` small labels should move to `--color-accent-text` per tab. Seen so far: `/gap` `Folio·X` 10px, and on `/methodology` `III·b` and `§ · ADÓNDE IR`.

## Gates

| Gate | Result |
|---|---|
| `tsc --noEmit -p tsconfig.app.json` | 0 errors |
| `npm run build` | built in 1m 51s |
| `npm run lint:tokens` | PASS (0 forbidden, 55 warnings) |
| `npx eslint .` | 0 errors (31 pre-existing `exhaustive-deps` warnings) |
| `vitest run` | 106/106 |
| Lining census (batch routes) | 0 stub / 0 split / 0 dash |
| CLS | < 0.01 on all four routes |

## Screenshots

Before/after crops are in `_atlas_research/weekend/trackD/d1/shots/` (main checkout).

- **Before** is prod `rubli.xyz`, which serves BUILD_ID `2026-10-03-weekend-c-lint`, the same as base `a8230fc1`. For hero crops only, before is the local base run.
- **El Mapa:** `*-elmapa-{1440,390}-{en,es}-hero`, `*-elmapa-1440-en-header`, and `*-elmapa-{1440-en,390-es}-guide` (the guide open).
- **Dashboard:** `*-dashboard-*-hero`, `*-dashboard-{1440-en,390-es}-plate`, `*-dashboard-1440-en-wire`, and `*-dashboard-390-es-lens` (the SECTORES lens toggled).
- **Sectors:** `*-sectors-*-hero`, `*-sectors-390-es-lede`, `*-sectors-1440-en-top`, and `*-sectors-1440-es-toggle` (the plate after a toggle click).
- **Sector dossier:** `*-sectors-1-*-hero`, `*-sectors-1-390-{en-cases,es-sections}`, and `after-sectors-1-1440-en-contracts`.
