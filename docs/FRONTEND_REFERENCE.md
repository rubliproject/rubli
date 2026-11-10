# Frontend Reference — moved out of CLAUDE.md (2026-10-19)

> Read on demand. These were always-loaded in CLAUDE.md; moved here to keep the auto-loaded context lean. Some Atlas/story sections describe pre-Oct-2026 surfaces — check `frontend/src/lib/nav/toc.ts` and `frontend/DESIGN.md` for the current state.

El Atlas was promoted from PLATAFORMA to DESCUBRIR (centerpiece) on
2026-04-28 and briefly renamed "El Observatorio" (2026-04-28 →
2026-06-07); the user reverted the public name to **"El Atlas" / "The
Atlas"** on 2026-06-07. The canonical route stays `/atlas`, matching the
`rubli_atlas_visited_v1` localStorage flag; `/observatorio` and
`/observatory` still redirect to it. Internal symbol names (Atlas
component, ATLAS_STORIES, atlasMode, ObservatoryScatter) are not churned
on rename — only user-visible strings change.

### `/atlas` — long-form storytelling surface (Apr 2026)

Page: `frontend/src/pages/Atlas.tsx` · Stories data: `frontend/src/lib/atlas-stories.ts`

The Atlas is a full-viewport **per-lens scatter** — "Atlas of Federal
Contracting": bubbles positioned by scale (vendor count, log-x) × high-risk
rate (y), sized by Tier-1 vendors, with four lenses (PATTERNS / SECTORS /
CATEGORIES / TERMS). Click a bubble → fly in: L1 shows that cohort's top-30
vendors → L2 click opens the docked "El Expediente" `VendorFile.tsx` panel.
The single view is fixed at the latest year (no scrubber); the **year
scrubber 2008–2025 only mounts in Compare mode** (the bottom scrubber was
removed from the single view in M-OBS Phase 1). The old V5 "1,200-dot Halton
lattice with nearest-neighbor edges" was superseded by this scatter
(`ObservatoryScatter.tsx`).

V6 (2026-04-28): brief tours replaced by **multi-chapter narratives**:
- **The Pharmaceutical Cartel** (6 ch · ~55s)
- **La Estafa Maestra** (6 ch · ~55s)
- **The COVID Year** (5 ch · ~45s)

Each chapter has Roman-numeral marker, year label, Playfair Display title,
2–3 sentence editorial body, optional pull-stat (big number + caption),
6–12s dwell. Reader can pause/skip/replay; chart is interactive during a
chapter. End-of-story card with replay + try-another + investigate CTAs.

Other Observatory features:
- **Pin a cluster** — pulsing ring persists across mode/year changes
- **Compare years** — second canvas + scrubber, shared lens + pin
- **X-ray filter** — risk-floor: all / medium+ / high+ / critical
- **Vendor search** — typeahead across 21 curated known vendors → auto-pin
- **Personal notes** — localStorage-backed per-cluster
- **URL state sharing** — `/atlas?lens=...&year=...&pin=...` shareable
- **First-visit auto-tour** — launches "The Pharmaceutical Cartel" on first
  load (rubli_atlas_visited_v1 flag)

### `/stories/:slug` — variant-aware chapter rendering (Apr 2026)

Page: `frontend/src/pages/StoryNarrative.tsx`

Chapter layouts auto-pick from 7 variants based on content shape:
`hero`, `feature`, `data-spotlight`, `quote-spotlight`, `connective`,
`closing`, `standard`. See `pickChapterVariant()`.

Each variant has its own typography + width + decorative chrome. Hero
chapters get a constellation-style SVG artwork backdrop. Drop caps via
CSS `::first-letter` (Playfair Display, accent-colored, 5.4em hero /
3.6em feature). Decorative dividers between chapters.

Observatory deep-link CTAs in chart chapters and closing chapters open
`/atlas` with `?lens=...&year=...&pin=...` state — readers can manipulate
the live constellation showing the same data the chapter discusses.

### Story graphics aesthetic spec (Apr 2026 redesign)

DataPullquote (`frontend/src/components/stories/DataPullquote.tsx`) and
InlineCharts (`frontend/src/components/stories/InlineCharts.tsx`) follow
the dashboard's "Headline Numbers" tile rhythm:

```
┌─────────────────────────────────────┐
▎ EYEBROW · MICRO MONO    DATELINE    │   chrome
│ "italic Playfair quote, demoted"    │   secondary
│ — attribution                        │
│ ─────────────                        │
│  6,034   ← Playfair Italic 800       │   anchor
│  Label · mono                         │
│                                       │
│  SECTION ID · MICRO MONO              │   eyebrow
│  ▰▰▰▰▰▰▰▰░░░░░░  [micro-viz]        │
│  caption · mono                       │
└─────────────────────────────────────┘
   ↑ left 3px sector accent
```

Key rules:
- **Numbers in Playfair Display Italic 800** with `tabular-nums`
  (never font-sans `font-black`). Color set via `style={{ color: hex }}`,
  never via `cn(..., hexString)` — a hex applied as a className is
  silently stripped and the number inherits link blue / parent color.
  The April 2026 audit found this exact bug across all 10 story heros.
- **DataPullquote viz templates** — 14 public names map to 6
  disciplined renderer families (proportion / threshold / gauge /
  sliver / era / null) via `TEMPLATE_FAMILY` in DataPullquote.tsx.
  Story-content.ts keeps using the old names; new code should pick
  one of the 14 aliases that maps to the right family.
- **Sector palette only** in InlineCharts — `HIGHLIGHT_COLOR`
  (sector-salud), `REFERENCE_COLOR` (sector-tecnologia),
  `ANCHOR_COLOR` (#a06820 dashboard amber). No random violets, cyans,
  limes.
- **Container queries** scope DataPullquote adaptations to the figure's
  *own* width, not the viewport. The same component renders at 383px
  (FeatureChapter sidebar grid), 656px (StandardChapter prose),
  848px (closing chapter), 976px (chart chapter) on the same page —
  viewport media queries can't distinguish them. `container-type:
  inline-size` on the figure + `@container dpq (max-width: 480px)` for
  the narrow stack.
- **Accent precedence (DataPullquote)**: hex `statColor`
  (the `leadStat.color` from story-content.ts) wins over `outlet`
  (the journalism category). Otherwise the hero and pullquote can
  end up in different colors on the same story.

### Spanish currency formatting (Mexican convention)

`formatCompactMXN()` is locale-aware; Spanish output uses:
- **≥10¹²**: "X.X billones MXN" (billón = trillion in Spanish)
- **≥10⁹**: "X,XXX MDP" (mil millones de pesos, abbreviated MDP)
- **≥10⁶**: "X.X MDP"
- **<10⁶**: `formatMXN`

`localizeAmount(string, lang)` runtime helper parses English-format stats
(e.g. `"133.2B MXN"` → `"133,200 MDP"` on `es`) so legacy story-content.ts
strings render correctly without bulk rewrites. Applied in DataPullquote,
StoryHero, StoryCard. Mexican media convention: never use English-loaned
"B MXN" in Spanish UI; always MDP / billones / mil millones.

### Honest pitch matrix (when describing the platform)

| Old claim | Honest version |
|---|---|
| "299 Tier-1 priority leads" | "299 GT-anchored T1 vendors · model-discovery uplift in calibration (S.7)" |
| "1,830 vendor investigative memos" | "~440 LLM-narrative · 699 templated search prompts (visually demoted) · 618 analyst stubs (PLANTILLA/STUB badges in UI)" |
| "1,427 documented corruption cases" | "1,287 cases with vendor links · ~140 orphan placeholders pending mining (S.5)" |
| "$2.84T MXN estimated fraud" | "$2.84T summed from estimated_fraud_mxn (41 cases NULL on this field)" |
| "91-category auto-classification" | "72 active categories covering 99.73%. Education/Gobernación/Trabajo each have 1 — taxonomy expansion in S.10–S.12" |

---

## Frontend Foundations (v2.1 baseline)

### Shared lib

- `frontend/src/lib/constants.ts` — `RISK_COLORS`, `SECTOR_COLORS`, `RISK_THRESHOLDS`, `getRiskLevelFromScore`. **Always import from here.**
- `frontend/src/lib/tiers.ts` — 5-tier transparency system (Excelente / Satisfactorio / Regular / Deficiente / Crítico).
- `frontend/src/lib/administrations.ts` — Mexican federal terms (Fox / Calderón / Peña Nieto / AMLO / Sheinbaum).
- `frontend/src/lib/compare-colors.ts` — `COMPARE_HEX.{a,b}` for A-vs-B pages (no green).

### Currency formatters (choose by surface, not by reflex)

`frontend/src/lib/utils.ts` exports three currency helpers. Pick the one that matches the surface — don't reach for `formatCompactMXN` reflexively.

| Surface | Helper | Output (EN / ES) |
|---|---|---|
| **Hero number / card stat footer / pull-quote / section anchor** | `formatDualCurrency(mxn)` | `9.9T MXN · ≈US$493B` / `9.9 billones MXN` |
| **Standalone USD sub-line** (under an MXN total, etc.) | `formatCompactUSD(mxn)` | `US$493B` (both locales) |
| **Table cell / axis label / tooltip / sort column / tight chip** | `formatCompactMXN(mxn)` | `9.9T MXN` / `9.9 billones MXN` |
| **Year-specific contract conversion** (2002 pesos at 2002 rate, etc.) | `formatCompactUSDByYear(mxn, year)` | `$2.1B USD` (uses MXN_USD_RATES table) |

**Rationale**: EN reader needs USD scale to feel the impact; ES audience reads MXN natively (Mexican procurement convention). `formatDualCurrency` returns MXN-only in Spanish by design — don't try to "fix" it.

**Don't blanket-replace** `formatCompactMXN → formatDualCurrency`. Table layouts and chart axes break when USD is shoved into fixed-width cells. Reach for the helper that matches the surface, not the convenient one.

The convention is enforced by review, not lint — `lint:tokens` doesn't flag wrong helper choice. If you find a hero/footer still on `formatCompactMXN`, convert it; if you find a table cell on `formatDualCurrency`, convert back.

### Canonical UI primitives

- `<DotBar value max color>` / `<DotBarRow label readout value max>` — single dot strip (`@/components/ui/DotBar`). Default geometry N=22, dotR=2, dotGap=5; can override with `dots` / `dotR` / `dotGap` for legacy call sites. **Round dots, fixed pixel width** — never use `preserveAspectRatio="none"` or `w-full` stretch on the SVG.
- `<DotStrip rows>` — multi-row ranked dot matrix (`@/components/charts/editorial`). Bible §4 canonical (N=50, R=3, GAP=8). Pass `colorToken` for semantic colors; use `colorRaw` only when colors come from external lookup tables (sector palette, GRADE_COLORS, etc.).
- `<StatRow stats columns>` — flat label+value grid.
- `<PriorityAlert flags>` — single severity-sorted alert (replaced 5 stacked banners on VendorProfile).
- `<SortHeaderTh field activeField order onSort>` — canonical sortable header with aria-sort.

**Dot-chart rules** (consolidated 2026-04-27):
- `DotBar` for inline single-bar metrics (one value, one bar). `DotStrip` for ranked multi-row visualizations.
- **Never inline `<circle>` dot strips in pages.** The April audit found 50+ inline reimplementations across 25 files; all new code routes through the two primitives above.
- `frontend/src/components/charts/DotStrip.tsx` is a **legacy adapter** that internally renders the editorial primitive. Existing callers stay; new code imports from `@/components/charts/editorial`.

### Vendor dossier composition

- `frontend/src/components/vendor/{VendorHero, VendorEvidenceTab, VendorActivityTab, VendorNetworkTab}.tsx`
- `frontend/src/components/vendor/buildFlags.ts` — pure `buildVendorFlags(input): PriorityFlag[]`
- `frontend/src/hooks/useVendorData.ts` — consolidates 18 useQuery calls

### CI gate

`frontend/scripts/lint-tokens.mjs` (`npm run lint:tokens`) fails on forbidden patterns (`text-red-400`, `bg-emerald-*`, `#2d2926`, etc.) re-entering `src/pages` or `src/components`.

---

