# Weekend Track D4 — Captura · Sexenios · Metodología · El Apagón · La Galería · El Atlas (report)

**Date:** 2026-10-03 · **Branch:** `weekend/track-d4` (off `19090b7f`, D1–D3 included) · **Agenda:** `docs/FRONTEND_WEEKEND_2026-10-03.md` § Track D · **Brief:** `.claude/designus/weekend/trackD-pertab-brief.md` · **Progress, scripts, probe and census output, crops:** `_atlas_research/weekend/trackD/d4/` (main checkout)

Every change is enhance-in-place. No section was added and no copy was rewritten. The only text changes are the Spanish twin of a tooltip that existed only in English, and a phone caption that repeats two labels already on the plate. `/atlas` got polish only. The `SkyEngine` zoom and flight code, the layout contract and the precompute were not touched.

## Outcome

Two large load shifts are gone:

| Route | CLS before | CLS after |
|---|---|---|
| `/gap` | 0.517 | 0.003 |
| `/methodology` | 0.126 | 0.005 |

On all six tabs, contrast failures, sub-10px type, small ochre text, raw hex and title-only affordances are now 0 at 1440 EN and 390 ES. The lining census is clean: 0 stubs, 0 dash-led lines and 0 overflow. That closes the two `/methodology` exceptions Track A left: the «Confirmado / externamente» grid cell and the 11px drift label.

The ObservatoryScatter labels are now HTML at the 10px floor. On `/dashboard`, sub-10px leaves went from 8 to 0 at 1440 and from 28 to 0 at 390.

## Commits

| Commit | Tab | Changes |
|---|---|---|
| `f561051d` | `/captura` | 4 |
| `b9cfb2a5` | `/administrations` | 5 |
| `5c66e4fd` | `/methodology` (+ shared tokens, `CitationBlock`, `RiskScoreDisclaimer`) | 8 |
| `1c798a23` | `/gap` (+ `textInk` on-plate option, `/gap` route skeleton) | 8 |
| `06cefb36` | `/gallery` | 5 |
| `aa76dcd2` | `/atlas` (polish) | 6 |
| `deedc577` | `ObservatoryScatter` (`/dashboard`, Atlas family) | 1 (labels to HTML) |
| (this) | report | |

## Shared changes (D4 owns these)

- **Risk text tokens.** Three type twins of the risk marks were added to `@theme`: `--color-risk-critical-text`, `--color-risk-high-text` and `--color-risk-medium-text`. They give Tailwind class sites `text-risk-*-text`. The values are `RISK_TEXT_COLORS.critical` and the `RISK_INK_ON_PLATE` amber-800 twins, so they hold AA on the page and on the plate paper. The change is additive and every existing class is unchanged.
- **`textInk(color, onPlate)`.** The new second argument returns the on-plate twin for high and medium. `RISK_TEXT_COLORS.high` reads 4.45 on `#f3f1ec`, so type inside a `PlateFrame` passes `true`. Existing callers are unchanged.
- **`RiskScoreDisclaimer`.** It is now bilingual: its tooltip and aria-label had been English-only on Spanish pages. It has a 24px hit area (44 below `sm`, with a negative margin so the line box keeps its height) and the house focus ring. `/methodology` uses it, and so does a local copy in `Investigation`.
- **`CitationBlock`.** Its copy and toggle buttons get the house focus ring.
- **`/gap` route fallback.** The fallback was an empty `p-8` div, so the footer flashed into view. It is now `GenericPageSkeleton`, as on every other route.

## Per tab

| Tab | Changes made | Backlog left |
|---|---|---|
| `/captura` | (1) The register's sector dots are `role="img"` with the sector name, so they are no longer title-only (12 → 0). (2) The film sort buttons are 44px below `sm` («Pico» was 39×24). (3) The lede, the methodology note and the provenance note glue their dashes (Track A). (4) Eleven inline font stacks in the page and five capture files now use `--font-family-editorial` / `--font-family-archival`. | CLS 0.027 (runs 0.003–0.047): the funnel section settles 176px when `/capture/landscape` lands. This is under budget. The register mobile card layout is still Day 6 backlog. |
| `/administrations` | (1) Small ochre type takes the text accent: the § kickers, the Procurement Fingerprint kicker, the sector-deviation clauses, the § glyph and the bridge dagger. (2) The dagger `<sup>` goes from 9 to 10px. (3) The tenure bands' money column goes from 76 to 84px, because 78px values like «711.4M MXN» were clipped (5 → 0). (4) «View in Cases» is an internal link, so it gets an arrow instead of `ExternalLink` (Day 10b rule). It is 24px, 44 below `sm`, in the text accent. (5) Font tokens on the page, `SeamStrip`, `AdminSurvivorsSlope` and `OfficialTenureBands`. | Desktop CSV and Context buttons are 24–28px, which meets AA. Day 8 backlog stays open: the `BenchmarkRow` phone clip and the precompute refresh path. |
| `/methodology` | (1) The masthead serif moves to the metric-matched editorial token. The h1 used to lose a line on font swap: CLS 0.126 → 0.005. (2) Small ochre type takes the text accent. That covers `Methodology.tsx`, `DictamenChrome` and `CalibrationRecord`, whose `#a06820` is now `var(--color-accent)` for marks and `--color-accent-text` for type (PARALLAX D2 item): 25 small-accent leaves → 0. (3) Risk-coloured type moves to the new `text-risk-*-text` tokens. In Two Worlds it uses `textInk(c, true)`, so its amber reads on the plate: contrast 45 → 0. (4) Index rail rows are 24px, with spacing reduced so the rail keeps its height. The print button and breadcrumb are 24px, 44 below `sm`. All of them get focus rings. (5) Focus rings on annex toggles, coda ramps, the Two Worlds link and the citation buttons. (6) The Tier I/II bodies, the critical rule and «registro oficial» glue their dashes (Track A). (7) The tier cells stack by container width (`@2xl`): at a 590px column (1024–1300 with the rail) three cells could not fit «Confirmado externamente». The drift-label card loses 8px of padding, which ends its 2px overflow. (8) The ghost label wraps below `sm` instead of truncating «374 huella fantasma · P2/P3». The Two Worlds vendor chips print full names. | The PARALLAX D2 items stay: `IndiceRail` active state (`aria-current`), and the four stacked closers. |
| `/gap` | (1) While the summary loads, a 130vh slot holds the five acts' space above the register, and the route skeleton is viewport-tall: CLS 0.517 → 0.003. (2) Risk-coloured type takes AA inks: the CRITICAL and DA badges (×50 each), EST, buyer scores, Art. 54 figures, the lead % and the grade legend. Plate type uses the on-plate twin: contrast 118 → 0. (3) Folio·X, the coda kicker and labels, and the timeline annotations take the text accent. (4) Focus rings on the buyer and sector filter buttons, the two toggles and the coda ramps. (5) The toggles' labels and the pager arrows are 44px below `sm`, and the pager row wraps. (6) The grade bar's segments were title-only; they are now `aria-hidden`, since the legend prints each level and count (3 → 0). (7) The phone legend sits under a rule, apart from the pinned «2002 · CompraNet» annotation (PARALLAX D2 item). | The register titles are `line-clamp-3` (34 at 1440, 48 at 390). These are COMPRANET titles in a sample register, and the full title is in `title`. The mobile card layout (D2 item) is the real fix. Page numbers stay 32px so seven of them fit at 390, which meets AA. |
| `/gallery` | (1) Card eyebrows go from 9 to 10px (30 → 0). (2) Lead-stat labels wrap instead of truncating (20 → 0). (3) Lead figures are upright, with no italic (house rule), and use `textInk` for their ink, for example the 24px `#f59e0b` «22,263» at 2.04. (4) Card links get the house focus ring. (5) The back link is 24/44px with a ring. | None found by the probe. |
| `/atlas` (polish) | (1) Small ochre chrome takes the text accent: the masthead kicker, «you are in», the colophon toggle, the off-chart search row and the phone «Iniciar vuelo». (2) The 10px sector sky labels use `textInk`, a colour-only change in `SkyLabels.ts` with no placement change: «Energy» was 1.70 and is now AA. (3) The breadcrumb › uses full muted ink instead of opacity 0.6 (2.36:1). (4) The ⓘ basis button is 24px, with a negative margin so the plate does not move. (5) Phone period and search buttons have a 44px minimum width. (6) Motion check: the only timers in the chrome are 250ms debounces. The drawers are on tokens (Track B). | 36 sky labels are 15px-tall `<button>`s. Their size is set by the label layout, and growing them would change placement (the layout contract). The keyboard path is search, then the star dock. The probe's 47 "no focus" are class-based false positives (see Focus). The S5 § C deviations were not reopened. |
| `ObservatoryScatter` (`/dashboard`) | The base-plate labels move from SVG `<text>` to an HTML overlay: ticks, axis titles, the quadrant gloss, orb names and stats, and the hover card. They sit at the same anchor points (`xFor`, `yFor`, `labels[]`, hover px/py), mapped from viewBox units to CSS px with a ResizeObserver. Their size is `max(10px, units × scale)`. Below half scale (a plate under about 590px), 10px names would collide. There, the orb names move to a key of 44px buttons under the plate that fly in like the orbs, and the y title and the gloss move to the key's caption. The overlay fades out in the first third of the fly-in, because it does not ride the camera. The drawer's 9px leaves go to 10. At 1440 the labels sit where the SVG ones did (crops below). | The zoomed sub-plot labels (5–7 viewBox units) are still SVG, because they ride the camera. Moving them needs a hook into the camera motion value, which is camera code. «Linked to a documented case» overlaps the «60%» tick at 1440. That overlap is in the existing placement math, before and after. |

## Census and probe

**Lining census.** Same tool as D1–D3. It covers the 6 tabs plus `/dashboard` at 1440, 1280 and 390, in EN and ES. Before is prod `rubli.xyz`, which serves base `19090b7f`; `/captura` was rerun after a path-mangling error. After is local Vite on 3012 against the prod API.

| | stub | short (hero) | split | dash-led heading | dash-led prose | overflow |
|---|---|---|---|---|---|---|
| Before | 1 | 0 (+10 other) | 0 | 0 | 7 | 2 |
| After | 0 | 2 (+12 other) | 0 | 0 | 0 | 0 |

The "short" lines are balanced two-word last lines, such as «López Obrador», «nunca coinciden.» and the `/dashboard` h1 at 390. They are not defects by Track A's definition. The after run adds `/dashboard`, which accounts for the two hero shorts.

**Probe.** The table shows 1440 EN and 390 ES. The EN 390 and ES 1440 runs match within one item. Each cell is before → after, and a dot means zero in both runs. Every run scrolls the page first (`SCROLL=1`). Raw hex in text was 0 everywhere.

| Route @ width | sub-10px | clipped | contrast < AA | small accent | < 44px target | title-only |
|---|---|---|---|---|---|---|
| `/captura` 1440 EN | · | · | · | · | 2¹ | 12 → 0 |
| `/captura` 390 ES | · | · | · | · | 1 → 0 | 12 → 0 |
| `/administrations` 1440 EN | · | 5 → 0 | · | 4 → 0 | 7 → 5¹ | · |
| `/administrations` 390 ES | · | · | · | 6 → 0 | 2 → 0 | · |
| `/methodology` 1440 EN | · | 2 → 0 | 45 → 0 | 25 → 0 | 13 → 2¹ | · |
| `/methodology` 390 ES | · | 4 → 0 | 45 → 0 | 25 → 0 | 3 → 0 | · |
| `/gap` 1440 EN | · | 34² | 118 → 0 | 2 → 0 | 7¹ | 3 → 0 |
| `/gap` 390 ES | · | 48² | 118 → 0 | 2 → 0 | 6 → 4³ | 3 → 0 |
| `/gallery` 1440 EN | 30 → 0 | 20 → 0 | 2 → 0 | · | 1¹ | · |
| `/gallery` 390 ES | 30 → 0 | 22 → 0 | 2 → 0 | · | · | · |
| `/atlas` 1440 EN | · | · | 12 → 0 | 3 → 0 | 38⁴ | · |
| `/atlas` 390 ES | · | · | 1 → 0 | 4 → 0 | 2 → 0 | · |
| `/dashboard` 1440 EN | 8 → 0 | 1 → 0 | · | · | 5¹ | · |
| `/dashboard` 390 ES | 28 → 0 | 1 → 0 | · | · | 7⁵ | · |

Footnotes:

1. Desktop items of 24–36px meet WCAG 2.5.8 AA. They include the shared header shield (36px), the 24px Context and ⓘ buttons, and the 28px CSV buttons.
2. The register's `line-clamp-3` COMPRANET titles; see the `/gap` row of the per-tab table.
3. Two 13px checkboxes inside 44px labels, plus page numbers 1 and 2 at 32px.
4. 36 sky labels, plus the sexenio buttons at 37×25 (AA).
5. Seven orb `<g>` marks. Their size is the data, and the new 44px key is the phone path.

**Focus.** The probe's no-focus column is class-based. The stylesheet carries a global `:focus-visible` outline (`index.css`), so inline-styled controls do show a ring. A behavioural check (`d4/focus.mjs`) tabs through 60 stops on `/atlas`, `/captura` and `/gallery` and reads the computed outline and box-shadow of each focused element. It found 0 stops without a visible ring. The class-based count fell to 0 on `/methodology`, `/gap` and `/gallery` because those controls now carry the house ring classes. The 47 on `/atlas` are the false positives.

**CLS.** Track B method: 1366×768, load plus networkidle plus 3 s, median of 3.

| Route | Before | After |
|---|---|---|
| `/captura` | 0.0282 | 0.0267 |
| `/administrations` | 0.0302 | 0.0027 |
| `/methodology` | 0.1261 | 0.0054 |
| `/gap` | 0.5169 | 0.0026 |
| `/gallery` | 0.0033 | 0.0026 |
| `/atlas` | 0.0028 | 0.0027 |
| `/dashboard` | 0.0064 | 0.0057 |

**Reduced motion.** Measured with Edge `reducedMotion: 'reduce'` at 1366×768. All six tabs have 0 running animations, 0 hidden text in the viewport, and no pixels moved over 600 ms.

**Console.** The after runs logged intermittent 500s on four of 28 loads, across `/gap`, `/gallery`, `/captura` and `/atlas`. These came from the local Vite proxy to prod (D1 saw the same). Reruns of the same routes were clean.

## Honesty spot-check (typed figures)

- **Case count at training time.** `/captura`'s provenance note, the `/methodology` lede and `methodology.json` type «1,401 cases at training time». The vendor dossier types «1,417». CLAUDE.md says 1,417. One of them is wrong, and only the person who owns the record can say which. Reported, not changed.
- **`/methodology` Tier III card.** It types «412K contracts scored high or critical». The page's own tier fallbacks are 152,010 critical plus 182,065 high, about 334K, and CLAUDE.md's distribution (5.2% + 5.9% of 3.05M) gives about 339K. The 412K looks like a superseded model's count. Reported.
- **`/methodology` limitations.** The severity summary types 5 high, 5 medium and 4 low, which is 14. The table renders 15 rows. Reported.
- **`/methodology` v5.2 layer stats.** «456K», «9.33M», «16» and «~130K» are static (PARALLAX D2 noted `MODEL_COMPARISON` the same way). The h1 types «3.05 million contracts», which matches the platform's scored count (D2 note).
- **`/gap`, `/captura`, `/atlas`, `/administrations`.** Every headline number is live. The OECD reference band on `/gap` («routine <30%, emergency 20–40%») is a cited constant. «6,118» ghost vendors on the Tier III card matches the ARIA P2 count.
- **`/gallery`.** Lead stats come from `story-content.ts`, which D2 re-verified.

## Weekend backlog (consolidated D1–D4)

**Shared components first:**

1. **`EntityIdentityChip` at 390.** The chip is 24px (AA), not 44. A `max-sm` hit area changes every chip list on phones, so it needs one shared pass with a site-wide before/after dump. D3 fixed the chip's on-plate ink. The 4.45:1 `RISK_TEXT_COLORS.high` problem remains for other plate type, and D4's `textInk(c, true)` and `--color-risk-high-text` are the tools for it.
2. **Shared header crumb.** It cuts long dossier titles with «…» at 1440 and 390. Its `nowrap` type label overflows on ES (`Expediente institucional` 154 > 96). (D3)
3. **Vendor `PriorityAlert` query fan-out.** Five flag queries land between 3.0 and 4.8 s and grow the alert from one row to three, so vendor CLS runs 0.025–0.15. The fix is a decision: a placeholder that waits for the queries, or flags beside the lede. (D3)
4. **`RISK_TEXT_COLORS.medium`** (`#a16207`) reads 4.36:1 as 13–14px type. It needs one darker step in `constants.ts`, site-wide. D4's `--color-risk-medium-text` (`#854d0e`) is that step for class sites. (D1, PARALLAX D7)
5. **Typed hero figures.** The `/dashboard` h1 types «7 in 10» (D1). D4 adds the 1,401 vs 1,417 case count, the «412K» Tier III count, the 5/5/4 severity summary against 15 rows, and the static v5.2 layer stats.
6. **About 90 files still hard-code font families.** `"EB Garamond"` and `"IBM Plex Mono"` should become `--font-family-editorial` and `--font-family-archival`, which gives each file the metric-matched fallback. D4 converted the files of its six tabs. `/methodology`'s CLS 0.126 was this exact class of bug. (D1)
7. **Emergency calendar.** 366 heatmap cells are title-only and need a hover or focus readout line. (D2)
8. **`DataPullquote` stat and eyebrow raw risk reds.** The fix is `textInk` in its `statColor` path, with a judge pass on all 13 story heroes. (D2)
9. **ObservatoryScatter zoomed sub-plot labels** (5–7 viewBox units) still ride the SVG camera. Moving them to HTML needs the camera motion value. The placement math also lets one orb label sit over the «60%» tick. (D4)
10. **Local section-header forks** in `CategoryDossier` and `/sectors/:code` should fold into `components/dossier`. (D1, D3)
11. **The ch-based base measure** follows the painting face. An em-based measure would remove the swap-reflow class site-wide. (D1)
12. **Probe tooling.** Switch the focus column to the behavioural check (`d4/focus.mjs` does it). Run `SCROLL=1` on reveal-once pages. (D2, D4)

**Per page:**

13. `/gap`: register mobile card layout, which also ends the `line-clamp-3` titles. (PARALLAX D2, D4)
14. `/methodology`: `IndiceRail` `aria-current`, and the four stacked closers. (PARALLAX D2)
15. `/captura`: register mobile cards; `HHI_CONCENTRATED` duplicated in two files; the CLS residual 0.027 from the funnel section. (PARALLAX D6, D4)
16. `/administrations`: `BenchmarkRow` phone clip; the admin-eras precompute refresh path; `TemporalRiskChart` on the old calendar. (PARALLAX D8)
17. `/atlas`: sky label targets are under 44px by design; `?lens=sexenios` is ignored (PARALLAX D10).
18. `/network`: force-graph nodes are under 44px by design. `/contracts`: peek chips are not `fullName`. (D3)
19. Stories: chapter-nav hover labels are `nowrap` in a fixed rail. `/aria`: CLS residual 0.021. (D2)
20. Data: wire and peek contracts carry `contract_date` after the 2025-09-28 cut. (D1, D3, Day 10)

## Gates

| Gate | Result |
|---|---|
| `tsc --noEmit -p tsconfig.app.json` | 0 errors |
| `npm run build` | built in 1m 27s |
| `npm run lint:tokens` | PASS (0 forbidden, 55 warnings, same as D3) |
| `npx eslint .` | 0 errors, 37 warnings (same as D3, none new) |
| `vitest run --no-file-parallelism` | 106/106 |
| Lining census (7 routes, 42 loads) | 0 stub / 0 split / 0 dash / 0 overflow |
| Probe (7 routes × 1440/390 × EN/ES) | 0 sub-10px · 0 raw hex · 0 contrast · 0 small accent · 0 title-only |
| CLS | < 0.03 median on all seven routes |
| Reduced motion | 0 running · 0 hidden · still over 600 ms, all six tabs |

## Screenshots

Before/after crops are in `_atlas_research/weekend/trackD/d4/shots/` (main checkout). **Before** is prod `rubli.xyz`; **after** is local Vite. Element crops hide sticky chrome (Story Days § 7).

- **Heroes:** `{before,after}-<route>-{1440,390}-{en,es}-hero` for all six tabs, plus `/dashboard` after.
- **`/captura`:** `*-captura-1440-en-ledger` (register), and `*-captura-390-es-filmsort` («Pico» pressed).
- **`/administrations`:** `*-administrations-1440-en-expediente` (tenure bands and spine), and `*-administrations-390-es-beneficiarios`.
- **`/methodology`:** `*-methodology-1280-es-tiers` (the Track A cell, stacked), `*-methodology-390-es-twoworlds` (ghost label wrapped), and `*-methodology-1440-en-annex` (an annex opened).
- **`/gap`:** `*-gap-1440-en-plates`, and `*-gap-390-es-registro` (toggles and pager).
- **`/gallery`:** `*-gallery-1440-en-cards`, and `*-gallery-390-es-cards`.
- **`/atlas`:** `*-atlas-1440-es-sky`, and `*-atlas-390-en-phone`.
- **ObservatoryScatter on `/dashboard`:** `{before,after}-dashboard-scatter-1440-en` (same placement), `{before,after}-dashboard-scatter-390-en`, `after-dashboard-scatter-390-es` (key and caption), and `after-dashboard-scatter-1440-en-flyin` (labels gone in the zoomed sub-plot).
