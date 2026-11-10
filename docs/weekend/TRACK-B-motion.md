# Weekend Track B — Motion system (report)

**Date:** 2026-10-03 · **Branch:** `weekend/track-b-motion` (off origin/main `0cdafa53`) · **Agenda:** `docs/FRONTEND_WEEKEND_2026-10-03.md` § Track B · **Brief:** `.claude/designus/weekend/trackB-motion-brief.md` · **Progress log / scripts:** `_atlas_research/weekend/trackB/`

The user's words: "keep working and refining all of the animations all this weekend in all of the tabs".

## Outcome

Every timing in the frontend now comes from one module, `frontend/src/lib/motion.ts`, or from its CSS mirror in `index.css`. Inline numeric durations in TSX/TS are at zero, and so are non-house Tailwind durations. Dense dot charts no longer mount a framer-motion node per dot. Line and area charts draw once, when they scroll into view, and never on refetch. Dialogs, the entity drawer, sheets and tooltips enter on the tokens. Reduced motion renders every audited page with nothing moving. CLS is no worse on the three heavy tabs, and the Atlas bench holds at 59–60 fps.

## Tokens

Values follow the ui-ux-pro-max motion guidance (`--domain ux` + `--domain gsap`). The "subtle" tier for informational UI is 250–350 ms, with a 0.02–0.04 s per-item stagger on long lists and no back-out overshoot on data surfaces.

| Token | Value | Use |
|---|---|---|
| `DUR.instant` | 0.12 s | hover colour, tooltips, press |
| `DUR.fast` | 0.2 s | transform feedback, exits, overlays |
| `DUR.base` | 0.32 s | default (root `MotionConfig`), page entrance, sheets |
| `DUR.slow` | 0.5 s | chart draws, layout re-pivots |
| `DUR.story` | 0.7 s | story chapter reveals, pull-stat count-up |
| `EASE.standard` | `[0.2, 0, 0, 1]` | everything that enters or changes |
| `EASE.emphasized` | `[0.3, 0, 0, 1]` | draws, long travel, stories |
| `EASE.exit` | `[0.4, 0, 1, 1]` | exits only |
| `STAGGER.cell / row / section` | 4 ms / 30 ms / 80 ms | dot marks / rows / sections |
| `STAGGER_CAP` | 12 | rows past 12 arrive with the 12th |

Helpers:

- `stagger(i, step, base, cap)` computes a capped delay.
- `ms()`, `cssEase()` and `css(props, dur, ease, delay)` build inline CSS transition strings.
- `T.{instant…story, exit, none}` are ready-made transition objects.
- `layoutTransition` is the re-pivot timing.

Variants are `fade`, `fadeUp` (also the page entrance), `scaleIn`, `drawLine`, `storyReveal`, `countUp`, `staggerContainer`, `staggerRows`, `rowReveal` (capped) and `hoverLift`.

The CSS mirrors are `--dur-*`, `--stagger-*` and `--ease-*`. The `--ease-*` values live in `@theme`, which gives `ease-standard` utilities and puts the house curve on every Tailwind `transition`. House Tailwind durations are `duration-150` for colour and `duration-200` for transform.

There is one root `<MotionConfig reducedMotion="user" transition={T.base}>`. It sits in `App.tsx`, not `MainLayout`, because the EntityProfileDrawer renders outside the layout. The reduced-motion CSS block now also zeroes `animation-delay` and `transition-delay`, so staggered keyframes can't wait out their delays.

`lib/animations.ts` is retired. Its 10 importers moved to the token variants.

## Commits (23 incl. this report, oldest first)

Literals are counted by regex over removed lines that carry a duration, delay, ease, spring or Tailwind duration.

| Commit | § | Literals | Files |
|---|---|---|---|
| `5eef7e9c` | step-0: 18 unreachable files deleted (8,126 LOC, 15 components + 3 v1.0-cut pages) | 50 | 18 |
| `21c9f339` | lib: tokens, CSS mirrors, root MotionConfig, animations.ts retired | 10 | 14 |
| `48758631` | components/stories | 19 | 6 |
| `2d090971` | components/ui (toast lifetimes named, not motion) | 5 | 2 |
| `c5b9f9f0` | components/executive | 8 | 4 |
| `249234d1` | components/charts | 13 | 4 |
| `36468898` | components/atlas chrome (ObservatoryScatter, phone sheet; SkyEngine untouched) | 14 | 2 |
| `1c1b6937` | components/administrations | 3 | 2 |
| `87c08707` | components/layout | 4 | 3 |
| `d6bf9306` | components/gallery | 12 | 2 |
| `d50fdd5e` | components/explore (Z canon now aliases the tokens) | 18 | 2 |
| `cb403b4c` | components/{sectors, categories, category, dashboard, dossier} | 13 | 6 |
| `33e03d0a` | hooks: ScrollReveal / useCountUp / AnimatedFill (+ test) | 3 | 5 |
| `02ab9332` | pages | 28 | 7 |
| `9abc622f` | last non-house Tailwind durations | 3 | 2 |
| `2e83cb33` | index.css one-shot animations (20 rules) | 22 | 1 |
| `f91668da` | B2.1 dot grids to CSS keyframes | 1 | 6 |
| `502d4f36` | B2.1 line/area charts draw once on reveal; one useReveal | — | 5 |
| `ee7dc8ad` | B2.3 hover transform at 200 ms (14 sites) | — | 14 |
| `dd8712fa` | B2.3 overlays on tokens | 2 | 10 |
| `f0b04113` | B2.3 capped rowReveal; InstitutionThread labels | — | 3 |
| `66c9965a` | B1.2 duplicate reduced-motion ternaries removed (10) | — | 2 |
| (this) | report | | |

Gates (tsc app-config, build, lint:tokens) passed after every directory. The administrations, layout and gallery commits were gated together, as one tree. `useAnimations.test.tsx` passes 15/15, including the new refetch test.

## What changed beyond the codemod

- **Dot charts (B2.1).** Each dot is now a plain `<circle class="dot-in">` driven by a CSS keyframe, with `--r` and `--i` variables setting the stagger. This covers the editorial `DotStrip` (rows and columns), the inline grids in CategoryProfile and Settings, and RiskRingField (`dot-pop`, 120 spring dots on `/sectors/:id`).
  - A 10-row strip used to mount 500 framer nodes with a 4 s tail. It now mounts none, and the tail is at most 0.56 s.
  - Keys are stable, so a refetch never replays the reveal.
- **Line/area charts (B2.1).** `EditorialLineChart` and `EditorialAreaChart` flip `draw-pending` to `draw-on` once, through the shared `useReveal`.
  - A CSS clip-path wipe runs on `.recharts-line` / `.recharts-area` at `DUR.slow`. Recharts' own animation stays off.
  - Verified: the wipe interpolates frame by frame (94% → 62% → 36% … clipped), and 0 `draw-wipe` animations run after a re-render.
  - The keyframe needs an explicit `to`, because `inset()` cannot interpolate to `none` and would flip at 50%.
  - The two existing `pathLength` draws (MacroArc, LeadTimeChart) were already `whileInView once`.
- **One reveal hook.** `hooks/useAnimations.useReveal` (IntersectionObserver, fires once). DataPullquote's private copy was removed.
- **Story reveals.** `ScrollReveal`, the chapter reveal, now runs at `DUR.story` with a 12 px rise, animating opacity and transform only. The blur, the 60 px offset and the scale are gone. List items use `staggerIndex`.
- **Count-up.** `useCountUp` counts once, with an ease-out curve.
  - **Bug fixed:** a target that changed after the first count was never shown, so a refetch or filter left the old number on screen. It now snaps to the new value. The new test fails on the old hook.
  - The elastic overshoot was removed, because it displayed values above the true number.
  - With reduced motion the value appears at once, since rAF sits outside `MotionConfig`.
  - AnimatedFill lost its 3% overshoot and its double delay.
- **Overlays (B2.3).** These CSS entrances are mount-only:
  - **ui/dialog:** backdrop `overlay-fade`, panel `overlay-in`. This covers CommandPalette, the Report dialogs, the Dossier dialogs, NetworkGraph and RiskFeedback.
  - **EntityProfileDrawer:** `sheet-in-right`.
  - **Other modals:** ContractCompareModal (opacity only, because it is centred with a transform), SearchOverlay, SharedContractsModal, the InvestigationCaseDetail modals and the mobile nav backdrop.
  - **Tooltips:** their `animate-in zoom-in` classes were no-ops, because no animate plugin is installed. They now use `overlay-fade` at `DUR.instant`.
  - **ObservatoryScatter:** its two spring drawers moved to `DUR.base` with `EASE.emphasized`.
- **Registers.** framer's `staggerChildren` has no cap. The `/investigation` case grid now uses `rowReveal` with `custom={i}`, so at most 12 cards are staggered. InstitutionThread animated `hidden → visible` against variants keyed `initial/animate`, which had been a silent no-op since it was written. The labels now match.
- **Hover.** Every `transition-transform` and hover translate/scale/rotate names `duration-200`, across 14 sites. Colour keeps Tailwind's 150 ms default, now on the house curve.
- **Refetch audit.** No content is gated on `isFetching`. No motion key is built from data values. Every `whileInView` has `viewport once`. The route entrance is keyed on the pathname only, so query-string changes don't replay it.

## Grep proofs (after)

```
grep -rnE "duration: ?[0-9.]+" frontend/src --include=*.tsx          -> 0
grep -rnE "duration: ?[0-9.]+" frontend/src --include=*.ts           -> only lib/motion.ts
grep -rnE "transition-all duration-(100|300|500)" frontend/src       -> 0
grep -rnoE "duration-(\[[^]]+\]|[0-9]+)" frontend/src | not 150/200  -> 0
```

## Reduced-motion census

Each page loads in Edge with `reducedMotion: 'reduce'` at 1366×768. The census records running Web Animations, compares two screenshots 600 ms apart, and counts text elements in the viewport at an effective opacity below 0.05.

| Pages | Running animations | Pixels moved (600 ms) | Hidden text |
|---|---|---|---|
| 16 tabs + 3 dossiers (`/vendors/36961`, `/institutions/251`, `/cases/estafa-maestra`) | 0 | no | 0 |
| `/stories/the-pharmaceutical-cartel` | 0 | no | 5 (rail hover labels) |
| `/stories/the-ghost-army` | 0 | no | 4 (rail hover labels) |

The before and after results are identical (`rm-before.txt`, `rm-after.txt`). The reduced-motion screenshots are `shots/rm-<tab>-after.png`.

The baseline was already clean. The only "hidden text" on the two stories is the chapter rail's hover labels (`opacity-0 group-hover:opacity-100`, StoryNarrative), which are hidden by design.

## CLS (Edge, 1366×768, load + network idle + 3 s, median of 3)

| Route | Before (`0cdafa53`) | After |
|---|---|---|
| `/` | 0.0887 | 0.0776 |
| `/dashboard` | 0.4522 | 0.2962 |
| `/sectors` | 0.0059 | 0.0052 |

None of these is worse. The `/dashboard` number is a pre-existing load shift, not motion, and a source probe shows its causes. The footer and the first section move when the route content replaces the Suspense fallback (`SECTION.mb-10` 692→718, `FOOTER` 658→0). Run-to-run variance is large: one after-probe totalled 0.45. Reserving the skeleton's height belongs to Track D's `/dashboard` pass.

## Atlas bench (S3/S5 method: 1366×768, 3 s wheel, rAF gaps)

| Run | Before | After |
|---|---|---|
| z0 | 58.0 fps · p95 16.8 ms | 59.0 fps · p95 16.8 ms |
| z1 (IMSS) | 60.0 fps · p95 16.8 ms | 60.0 fps · p95 16.8 ms |

## t200 frame pairs

There are 21 pairs, `_atlas_research/weekend/trackB/shots/<tab>-t200-{before,after}.png`, covering the 16 tabs, 3 dossiers and 2 stories. To make them, the page settles on `/privacy`, warms the target route, returns, then navigates client-side and shoots at 200 ms.

The baseline shows the outgoing and incoming route layers overlapping, as a double ghosted page (see `/dashboard`). After the change, the exit (`T.exit`, 200 ms) has finished, and the new page is mid-rise on `fadeUp`. The command palette entrance was also checked live: `overlay-fade` and `overlay-in` both ran at 200 ms (`shots/overlay-cmdk-after.png`).

## Left / not done

- **Infinite ambient loops keep literal timings.** These are the loaders, pulses, the logo shimmer and the `rc-*` scan lines. They are not transitions, and reduced-motion CSS stops them.
- **ConcentrationConstellation's `<style>` block keeps its own timings.** The component is never rendered; only its types and constants are imported. Its positioning was not touched.
- **Content pacing values are not motion tokens.** These are the film and story dwell times (`films.ts`, `atlas-stories.ts`, StoryAnimationPlayer) and the toast lifetimes.
- **Behaviour-choosing `useReducedMotion` branches stay.** These are cut versus fade (ExploreCanvas, StoryAnimationPlayer), no-delay (ObservatoryScatter), the frozen canvas drift in StoryFilm, and imperative `animate()` calls. Only the duplicates were removed.
- **No dynamic refetch test.** The query client's `staleTime` of 5 minutes means no background refetch fires in a test window. The guarantee rests on the static audit above, the stable keys and the count-up test.
- **For Track D:** reserve the `/dashboard` skeleton height (CLS).
