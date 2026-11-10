# /administrations — tighten & enhance brief (2026-10-06)

Owner verdict on the live page: **data is right, presentation is wrong.** Complaints, verbatim themes:
text "lining" is garbage — ragged right edges, prose that stops at less than half the screen
and leaves a chasm of blank space; legends bigger than the body text; sections too fat/wide;
Act I and Act III should animate; Act II should open by itself (no click needed).
Keep: the president portrait + term highlights in the summary card; all the data.

## Page frame (owned by the lead, not you)
- Content column widens from 1010px → **1240px** (`max-w-[1240px]`), sections keep `px-4 sm:px-5`.
- Act II opens on AMLO by default; the switcher still changes it.

## The text contract (every component)
1. **No lone ragged paragraph next to empty space.** Prose either
   (a) spans the full width of its container as **CSS columns** (`columns: 2; column-gap: 32px`
   at ≥1024px, 1 column below), or
   (b) sits at a ~68ch measure **beside a data element** (figure, stat stack, legend) that fills
   the rest of the row.
2. Prose paragraphs: `text-align: justify; hyphens: auto;` and a `lang={isEs ? 'es' : 'en'}`
   attribute on the element (hyphenation needs it). Line-height 1.55–1.65.
   Use the utility class `prose-just` (the lead adds it to index.css:
   `.prose-just{text-align:justify;hyphens:auto;-webkit-hyphens:auto;text-wrap:pretty}`).
3. One type scale:
   - kicker: 12px mono uppercase, tracking 0.2em
   - section headline: editorial serif (`var(--font-family-editorial)`), 20–22px, weight 500
   - body prose: editorial serif 15px, `text-text-secondary`
   - caption / note / legend: **12px**, `text-text-muted` — **a legend or note is never larger
     than the body text it sits under**, and it spans the same width as the chart it captions.
   - mono only for figures, labels, axis ticks — never for multi-line prose (mono prose = the
     uneven blocks the owner hates).
4. Notes that are several sentences → one justified paragraph, not stacked mono lines.

## Compactness
- Ranked lists: row height ≤ 32px, name + figure + one inline bar on ONE line where it fits;
  metadata as a second muted line only if essential. Long lists (≥8 rows) go **two columns at
  ≥1024px** instead of one tall fat column.
- No row padding of 20–40px; no 80px-tall table rows.

## Motion
- framer-motion (already installed). Tokens from `@/lib/motion` (`DUR`, `EASE`, `drawLine`,
  `staggerRows`, `rowReveal`). Trigger on viewport enter once:
  `whileInView` + `viewport={{ once: true, amount: 0.35 }}`.
- Always honour `useReducedMotion()` → render the final state.
- 1–2 animated elements per section. Line/path draw-in (pathLength 0→1, ~1.2s), staggered row
  reveals (≤12 staggered, 40–60ms step). No bouncing, no infinite loops.
- Animations never gate data — the final state must be the real data with no animation.

## Hard rules (CLAUDE.md — every commit)
- Entities rendered outside their dossier → `<EntityIdentityChip>` (keep existing usages).
- Vendor names via `formatVendorName` / `formatEntityName`.
- Risk levels via `getRiskLevelFromScore`; colours from `@/lib/constants`; **no green for low risk**.
- No raw hex in className strings; hex only via `style={{ color }}` (lint:tokens).
- No italic anywhere. Bilingual: every visible string `isEs ? ES : EN`, including aria-labels.
- Risk copy: "risk indicator", never "probability of corruption".
- Do not change data/queries/endpoints. Presentation only.
- `tsconfig.app.json` has noUnusedLocals/noUnusedParameters — delete what you stop using.
