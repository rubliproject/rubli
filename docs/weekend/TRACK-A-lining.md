# Weekend Track A — Text lining (report)

**Date:** 2026-10-02/03 · **Branch:** `weekend/track-a-lining` (off origin/main `625cb05f`) · **Agenda:** `docs/FRONTEND_WEEKEND_2026-10-03.md` § Track A · **Brief:** `.claude/designus/weekend/trackA-lining-brief.md`

The user's words: "the text lining is fucked up in most of the pages."

## Root cause

`text-wrap: balance` was already computed on every defective heading. The census confirmed it on all h1/h2/h3 it flagged. Balance was not failing. There were two causes.

1. **Balance is phrase-blind.** The measure rule caps the `/sectors` h1 at 32ch, which is 636px at 40px. That forces two lines, and balance breaks at the width midpoint. The midpoint fell inside the accent span: «The Cash Count: nine | trillion pesos on the table.» The dashboard has the same mechanism: «More than | 7 in 10». Dash-led lines have a separate cause: nothing glued « —» to the word before it, so the break opportunity after the space was free.
2. **The measure block was unlayered.** The PARALLAX D2c block (`index.css` 68ch / 32ch / 44ch + `text-wrap`) sat outside any `@layer`, while Tailwind v4 puts every utility in `@layer utilities`. Unlayered beats layered regardless of specificity. Its own comment promised "any explicit `max-w-*` utility still wins", but in fact the block overrode every `max-w-*`, `text-balance` and `text-pretty` utility on the site. For example, the `/sectors` dek's `lg:max-w-[640px]` was silently capped at 68ch.

## What shipped

**CSS (native first).** The measure block moved into `@layer base`, so utilities now win as documented. The 68ch / 32ch / 44ch measure is unchanged. Balance now also reaches `.text-editorial-display`, `.text-deck` and `[data-deck]`.

**Glue helper — `frontend/src/lib/typography.ts`** (bilingual; the caller passes `lang`; no dependency):

| Export | Does |
|---|---|
| `glueDashes(text)` | U+00A0 before « —»/« –», so a dash never leads a line. Ranges like `2002–2025` are untouched. This is the only glue running prose gets. |
| `tidy(text, lang)` | `glueDashes`, plus U+00A0 after one-syllable function words. ES: a y o e u de del el la lo los las en un una con por sin. EN: a an of the on in to at by or and. |
| `noOrphan(text, max = 16)` | Joins the last two words. The run cap is in characters: 16 fits 40px display type in the 318px story column at 390, and smaller type passes more. When a run would be too long, it releases an article glue rather than leave a one-word last line. A trailing «and Disappeared» takes one more word. It is idempotent. |
| `tidyNodes(children, lang, max?)` | The same rules for React children with accent spans. Spans keep their type, props and key. An accent of up to 20 characters (or `max`) is glued whole. A longer accent glues only its first pair, so its first word is never stranded at a line end. The word leading into an accent rides with it only when the accent is whole. JSX `{' '}` children are merged first. `PROSE` mode is dash glue only, for ledes. |

The vitest file `lib/typography.test.ts` has 6 cases, all green. It covers dash glue, ES and EN article glue, `noOrphan` (cap, release, extension, idempotence), spans kept and short phrases glued, long or nested spans, lead-in glue, and `PROSE`.

**Applied at.** Shared primitives:

- `PlateFrame` caption.
- `FindingsBand` deck.
- `ChartCard` (InlineCharts) title.
- `EditorialChartFrame` headline.
- `FeatureSection` kicker (cases).
- The story pipeline at its single localisation point, `localizeStory` / `localizeChapter`. This covers headlines, chapter titles, pullquotes and chart titles. Prose and the deck get dashes only.

Brief-listed heroes:

- `/sectors` h1, dek and saldo h2.
- `/dashboard` h1, lede (`PROSE`) and section headings.

Census-named heading sites, each a one-line wrap with no copy change:

- `/captura`, `/institutions` and `/methodology` h1s.
- Journalists headlines.
- Gallery cards.
- `/cases` titles.
- `/press` citation.
- ARIA register label.
- Story methodology footer.

**Measure at 390 (layout causes, not glue):**

- `VendorHero` now stacks name and verdict below `sm`. Side by side, the card left the h1 a column narrower than «Especializados».
- The `PlanaLeadBlock` h2 minimum drops from 30px to 26px, because «Five Administrations» overflowed.

No copy, i18n JSON or dependency changed.

## Census

Tool: `_atlas_research/weekend/lining-census.mjs`, run with Playwright `msedge`. It covers 23 routes: 17 tabs, `/vendors/29277`, `/institutions/251`, `/cases/estafa-maestra`, and 3 stories. Each route runs at 1440, 1280 and 390 in EN and ES, for 138 page loads. It measures `h1, h2, h3, [data-lede], [data-deck], blockquote` and `<p>`, and splits each into rendered lines with `Range.getClientRects`.

Defect classes:

- **Stub:** a multi-line heading whose last line is one word. Designed `<br>` stacks are exempt.
- **Split accent:** an inline accent of up to 24 characters broken across lines. Headings only, because bold figures in prose may wrap.
- **Dash-led:** a heading or prose line that starts with — or –.
- **Overflow:** `scrollWidth > clientWidth`.

Both runs went against prod data through a local Vite with `VITE_API_URL=https://rubli.xyz`. BASELINE ran on origin/main's `src`.

| Route | stub | split accent | dash-led heading | dash-led prose | overflow |
|---|---|---|---|---|---|
| /registro | 2 → 0 | · | · | · | · |
| /dashboard | 1 → 0 | · | 7 → 0 | 2 → 3 | · |
| /journalists | 3 → 0 | · | · | 2 | · |
| /aria | · | · | 1 → 0 | 4 → 5 | · |
| /cases | · | · | 14 → 0 | · | · |
| /sectors | · | 5 → 0 | 3 → 0 | · | · |
| /categories | · | · | · | 2 | · |
| /institutions | · | 3 → 0 | 1 → 0 | 2 → 1 | · |
| /network | · | · | · | 1 | · |
| /captura | · | 1 → 0 | · | 1 | · |
| /administrations | · | · | 2 → 0 | 3 → 0 | · |
| /methodology | 1 | · | 3 → 0 | 6 | 2 → 1 |
| /press | · | · | 1 → 0 | 2 → 1 | · |
| /vendors/29277 | 2 | · | · | 0 → 1 | 2 → 0 |
| /cases/estafa-maestra | 1 → 0 | · | · | · | · |
| /stories/el-gran-precio | · | · | 2 → 0 | 6 → 0 | · |
| /stories/el-vacio | · | · | 1 → 0 | 11 → 2 | · |
| /stories/el-ejercito-fantasma | · | · | · | 9 → 0 | · |
| **Total (138 loads)** | **10 → 3** | **9 → 0** | **35 → 0** | **51 → 25** | **4 → 1** |

Routes with no defects in either run are omitted: `/`, `/atlas`, `/gap`, `/contracts` and `/institutions/251`. A few prose counts rose by one, on `/dashboard`, `/aria` and `/vendors`. Those are line-position shifts from the cascade fix restoring `max-w-*` widths, not new glue.

Two-word last lines (class "short") are reported in the census files but are not defects. A balanced 4-word title in two lines is 2+2 by construction. Headline last lines with one word dropped from 10 to 3, and none of the 3 is a hero headline with a fix available. See the exceptions below.

## Remaining (for Track D or a follow-up)

**Copy- or data-level exceptions.** Glue cannot fix these without overflow.

- `/vendors/29277` h1 at 390 (EN and ES): «Grupo Farmacos / Especializados». A three-word entity name at 32px cannot sit on one line, and «Farmacos Especializados» (23 characters) overflows. This is entity data, so the remaining choices are a smaller mobile size or accepting it.
- `/methodology` h3 «Confirmado / externamente» at 1280 ES. The grid cell is narrower than the two words at 14px. This is a layout cell issue.
- `/methodology` 11px label «Características con Monitoreo de Deriva» overflows its box by 2px at 1280 and 1440 ES. It was in the baseline and is a pre-existing box width issue.

**Dash-led prose, 25 instances in 20 paragraphs.** All are per-page running text outside the shared primitives. Each fix is a mechanical `glueDashes(...)` wrap at the render site, with no copy change. I left them because the brief scopes the helper to shared primitives.

- `/aria` disposition line («…8 pipeline—»).
- `/captura` methodology note.
- `/categories` stocktake note.
- `/dashboard`: the Atlas caption, «Five contracts most recently flagged…», «Four findings…».
- `/institutions` IMSS lede (ES).
- `/journalists`: rubric note, COVID ladder (ES).
- `/methodology`: tier definitions EN and ES, the critical rule EN and ES, «registro oficial».
- `/network` node note (ES).
- `/press` model paragraph (ES).
- `/stories/el-vacio` two live-figure captions (ES).
- `/vendors/29277` SHAP-absent note.

Census detail with each element's text and widths: `_atlas_research/weekend/trackA/after.md`. The baseline is in `baseline.md` in the same folder.

## Notes

- The census found that the glue cap must be font-size aware. A fixed 24-character run overflowed 40px story titles at 390. A fixed 16 brought stubs back on 16px cards. Hence the `max` parameter and per-site caps (gallery 28, journalists 20, dashboard and institutions heroes 24), each verified at 390.
- The Vite already on :3011 proxied to a local backend that died mid-session and returned instant 500s. Early census rounds therefore had partly empty data, such as «0 case files». The final BASELINE and AFTER both ran on :3012 against prod.
- Screenshots are in `_atlas_research/weekend/trackA/shots/`: `sectors-1440-{en,es}`, `dashboard-1440-{en,es}`, `vendor-1440-en`, `story-1440-es` and `sectors-390-es`.

## Gates

| Gate | Result |
|---|---|
| `tsc --noEmit -p tsconfig.app.json` | 0 errors |
| `npm run build` | built in 3m 15s |
| `npm run lint:tokens` | PASS (0 forbidden, 58 pre-existing warnings) |
| `vitest run src/lib/typography.test.ts` | 6/6 pass |
