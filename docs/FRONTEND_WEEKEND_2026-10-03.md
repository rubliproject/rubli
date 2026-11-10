# Frontend Refinement Weekend — agenda (Fri 2 Oct night → Sun 4 Oct 2026)

**Mandate (user, Fri 22:40 CET):** "keep working and refining all of the animations all this weekend in all of the tabs. Also the text lining is fucked up in most of the pages… make an agenda on what we need to work on and refine on the frontend this whole weekend." Usage resets Monday.
**Method:** Fable audits (live screenshots at 1440/1280/390, EN+ES) and writes a brief per track → one Opus executor per track in a fresh worktree branch off origin/main → Fable judges on screenshots + gates (≤ 1 fix round) → push to main (= auto-deploy) → verify served BUILD_ID → next track. Hard rules: CLAUDE.md, folio bible, no italic, 10 px floor, bilingual, no raw hex, EntityIdentityChip. Nothing ships without the four gates and the PARALLAX probe (0 sub-10px · 0 clipped · 0 raw hex).

## The 16 tabs (sidebar) + the surfaces behind them
`/` El Mapa · `/dashboard` · `/atlas` · `/journalists` Sala de Redacción · `/aria` La Cola · `/cases` Casos · `/sectors` · `/gap` El Apagón · `/categories` · `/institutions` · `/network` La Trama · `/contracts` El Archivo · `/captura` · `/administrations` Sexenios · `/methodology` · `/gallery` — plus the dossiers they open (`/vendors/:id`, `/institutions/:id`, `/categories/:id`, `/cases/:slug`, `/contracts/:id`, `/sectors/:code`) and the 13 `/stories/:slug`.

## Track A — Text lining (Fri night → Sat morning) · cross-cutting, CSS-first
**Evidence (prod, 1440):** `/sectors` headline breaks "…nine / trillion pesos on the table." (orphan "nine"), the saldo breaks before an em dash at line start ("…on the table / — 56.0 %…"), the dek breaks "— and how / much". The same pattern shows on dashboard heroes, dossier ledes and story heroes: ragged last lines with 1–2 words, dashes and short conjunctions stranded at line edges, and headline measures that produce a long line + a stub.
1. **Native balancing (ponytail rung 4):** `text-wrap: balance` on `h1/h2/h3`, `.text-editorial-display`, `.text-deck`, FindingsBand ledes, PlateFrame titles, StoryHero titles/decks, card titles; `text-wrap: pretty` on running prose (`p`, `.text-body`, story chapters). One `@layer base` rule set in `index.css`, no per-page CSS.
2. **Typographic glue:** a shared `tidy(text)` helper (`lib/typography.ts`) that inserts non-breaking spaces before em dashes and after one-letter words/articles (ES: a, y, o, de, el, la, en, un; EN: a, of, the, on, in, to), and a `<NoOrphan>` wrapper for the last two words of headlines; applied in the shared primitives only (FindingsBand, PlateFrame header, StoryHero, DataPullquote, dossier ledes, card titles).
3. **Measure + leading:** verify the 68ch / h1 32ch / h2–h3 44ch measure rule still holds on every tab at 1440/1280; check `line-height` of every display class (1.02–1.15 on display, 1.6 prose) and the `.leading-*` utilities actually win over `@layer base`; fix the few headline sizes whose measure yields a one-word stub at 1280.
4. **Census tool:** `_atlas_research/weekend/lining-census.mjs` — Playwright over all tabs + 3 dossiers + 3 stories, EN+ES, 1440/1280/390: counts headline/dek/lede last lines with ≤ 2 words, lines starting with "—"/"–", `scrollWidth > clientWidth`. Gate: 0 orphans on heroes/ledes, 0 dash-led lines.
5. Ship, then re-run the census as the acceptance.

## Track B — Motion system (Sat) · one vocabulary for all tabs
**Evidence (code census):** 150+ inline `transition={{ duration: … }}` with 10 different durations (0.2 → 0.8 s) and ad-hoc eases; `MotionConfig` only on parts of the tree; `DotStrip` renders 50 `motion.circle` per row (500 motion nodes on a 10-row strip); page-level entrances differ per tab (some fade+rise, some none); stories carry 35 of the motion call sites.
1. **Tokens:** `lib/motion.ts` — `DUR` (instant 0.12 · fast 0.2 · base 0.32 · slow 0.5 · story 0.7), `EASE` (standard, emphasized, exit), `STAGGER` (row 0.03, section 0.08), variants (`fadeUp`, `fade`, `scaleIn`, `drawLine`, `countUp`). One `MotionConfig reducedMotion="user" transition={base}` at the layout root.
2. **Migrate** every inline transition to tokens (codemod: duration map → nearest token; eases → `EASE.standard`); delete per-component `useReducedMotion` plumbing that the root config now covers.
3. **Entrances:** one page-level entrance (fade-up 0.32 s) on route change; section reveals on scroll via one `useReveal` hook (IntersectionObserver), replacing the 17 hand-rolled `delay: rowIdx * N + i * N` staggers with `STAGGER` variants.
4. **Charts:** `DotStrip`/`DotBar` → CSS keyframe stagger (no motion nodes); editorial charts draw lines with `drawLine` once, never on every re-render; the Atlas engine keeps its own d3 flights (already tokenized by the spec).
5. **Per-tab pass (all 16):** hover/focus feedback consistent (150 ms colour, 200 ms transform), drawer/sheet/dialog timings from tokens, no animation on data refetch, no layout-shift entrances; stories: chapter reveals at `story` duration, pull-stats `countUp` once.
6. **Gates:** reduced-motion emulation renders every page with no movement; Lighthouse CLS unchanged or better on 3 heavy tabs; bench on `/atlas` unchanged (≥ 55 fps).

## Track C — Lint zero + CI green (Sat evening, small)
`npm run lint` fails the Frontend Tests workflow on ~20 files: `react-hooks/set-state-in-effect` (CommandPalette, ExpandableRow, ReportModal, RiskExplainer, admin sections, GhostSuspectsPanel…), `react-hooks/refs` (FlightPlayer ref in render), unused vars. Fix each at the root (derive state in render or in event handlers; refs out of render), never disable rules. Acceptance: `eslint .` exit 0; Frontend Tests workflow green.

## Track D — Per-tab refinement sweep (Sun) · ≤ 8 changes per tab, judged on crops
Order by traffic and freshness: `/` El Mapa → `/dashboard` → `/sectors` → `/aria` → `/cases` → `/journalists` + 3 stories → `/network` → `/institutions` → `/categories` → `/contracts` → `/captura` → `/administrations` → `/methodology` → `/gap` → `/gallery` → `/atlas` (polish only; S1–S5 just shipped). For each: lining census clean, motion tokens applied, the PARALLAX backlog items that belong to it (accent 4.14:1 as small text → darker text accent; header shield → `/methodology` label mismatch; `DotStrip` raw `<a>` → `<Link>`; `ScaleBlock` USD line on ES; `Header.getParentPath` "Home"; PlateFrame hard-coded fonts → tokens), hover/focus audit, phone pass at 390.

## Track E — Atlas follow-ups (Sun, if time)
Phase-2 flag lasso → La Cola (ARIA page `ids=` filter ~35 LOC + the lasso); phone Lista band member names (endpoint); first-visit flight on phone deliberately off (keep).

## Budget and cadence
- Fri night: Track A brief → executor → judge → ship. Sat: Track B (largest; two executors sequential: tokens+migration, then charts+entrances) → ship. Sat evening: Track C. Sun: Track D tab by tab, shipping after every 2–3 tabs; Track E if time.
- Every ship = push to main (auto-deploy) → verify served BUILD_ID → record in `.claude/ACTIVE_WORK.md`.
- Usage: one executor at a time; Fable judges on crops; no panel runs this weekend (the designs are known; this is refinement).
