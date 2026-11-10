# Weekend Track C — Lint zero + Frontend Tests green (report)

**Date:** 2026-10-03 · **Branch:** `weekend/track-c-lint` (off origin/main `3bfc185f`, Tracks A+B included) · **Agenda:** `docs/FRONTEND_WEEKEND_2026-10-03.md` § Track C · **Brief:** `.claude/designus/weekend/trackC-lint-brief.md` · **Progress log, ESLint JSON, QA script, shots:** `_atlas_research/weekend/trackC/`

## Outcome

`npx eslint .` exits 0 with zero errors. The baseline was 173 errors in 77 files, not the brief's "~20 files". The failed CI run only printed part of the list. Every fix is at the root. No `eslint-disable` was added, three stale ones were removed, and `eslint.config.js` is unchanged.

The steps after lint in `.github/workflows/frontend-tests.yml` were also red, and are now green. `vitest run` had 5 failing tests. `npm run test:coverage` could not start because the coverage provider was not installed.

## ESLint before → after

| Rule | Before | After |
|---|---:|---:|
| react-refresh/only-export-components | 55 | 0 |
| @typescript-eslint/no-unused-vars | 35 | 0 |
| react-hooks/refs | 30 | 0 |
| react-hooks/set-state-in-effect | 12 | 0 |
| @typescript-eslint/no-explicit-any | 12 | 0 |
| no-control-regex | 11 | 0 |
| react-hooks/preserve-manual-memoization | 6 | 0 |
| react-hooks/rules-of-hooks | 4 | 0 |
| @typescript-eslint/no-empty-object-type | 4 | 0 |
| no-useless-escape | 3 | 0 |
| react-hooks/immutability | 1 | 0 |
| **errors** | **173** | **0** |
| react-hooks/exhaustive-deps (warning, not gated) | 36 | 31 |
| unused eslint-disable directive (warning) | 3 | 0 |

Raw output is in `eslint-before.json` and `eslint-after.json`. The after run uses `--ignore-pattern coverage`, because a local `test:coverage` writes a generated `coverage/` report that ESLint would otherwise read. CI lints a clean checkout before coverage runs. `coverage/` is now gitignored.

## Commits, one per rule family

| Commit | Family |
|---|---|
| `7d8fa384` | no-unused-vars, no-empty-object-type, unused directives |
| `0d78512f` | no-control-regex, no-useless-escape |
| `53f563d4` | no-explicit-any |
| `4b762623` | rules-of-hooks, preserve-manual-memoization, immutability |
| `69a386cb` | set-state-in-effect |
| `6680d2c8` | vitest: plateLabels and Sidebar |
| `f0d5104e` | refs |
| `347c9e73` | only-export-components |
| `4f85d6e7` | test:coverage provider and lcov |

## How each family was fixed

- **set-state-in-effect.** Values are now derived in render where possible. CommandPalette resets on the change of its `open` prop during render, because Header owns `open` and Cmd+K toggles it there. StoryNarrative's active chapter is keyed by slug. The PhoneAtlas sheet position is keyed by planet and star. Resets that belong to an animation's lifetime moved into effect cleanup: the StoryFilm beat timer, the counters in StoryAnimationPlayer and StoryFilm, and the CategoryProfile timeout. SearchOverlay re-reads recent searches in its two open handlers. `useSavedViews` and AuthContext read localStorage in their lazy initial state.
- **refs.** FlightPlayer destructures its props once. Its `p` object carries `apiRef`, so the compiler treated every `p.x` read in render as a ref read. The flight model stays declarative: there is still one camera effect on flight, chapter and viewport, the URL is still the only writer, and no React state is written. The camera target is read from this render's derived `compiled?.target`, so no ref is needed. The PhoneAtlas vendor-name cache is now state that grows during render when a new name appears. `useCountUp` re-arms inside its effect. `AnimatedCounter` lost a ref whose value was never read.
- **rules-of-hooks.** These were real bugs: hooks ran only when the component did not return early. EditorialTimeline's sexenio bands and Investigation's three counts are now plain derivations.
- **only-export-components.** Each `.tsx` file now exports only components.
  - Helpers moved to sibling `.ts` modules, and their importers were updated. No re-exports were left behind.
  - Providers were split from their contexts in five pairs: `AuthContext.ts` and `AuthProvider.tsx`, `EntityDrawerContext.ts` and `EntityDrawerProvider.tsx`, `ExploreState.ts` and `ExploreProvider.tsx`, `wayfinding.ts` and `WayfindingProviders.tsx`, and `toastContext.ts` with `toast.tsx`.
  - `hooks/useAnimations.ts` keeps the hooks. Its three components moved to `components/ui/Reveal.tsx`.
- **no-unused-vars and no-explicit-any.** Destructure-to-discard now goes through a new `omit()` in `lib/utils`. The explore tabs are typed from `api/types`. `VendorFilterParams.risk_level` now documents the comma-separated list the explore table already sends.

## External-system cases (useSyncExternalStore)

1. **`matchMedia`.** The new `useMediaQuery(query)` hook in `hooks/useIsMobile.ts` uses `useSyncExternalStore`. `useIsMobile` is now one line on top of it. InstitutionStarGraph's coarse-pointer check (`(hover: none)`) uses it too. Both replace an effect that copied `mq.matches` into state.
2. **URL and resize.** These already used `useSyncExternalStore`, and nothing changed: the Atlas URL store and FlightPlayer's viewport key. localStorage did not need a store. `useSavedViews` and AuthContext only read it once, so lazy initial state is enough.

## Bugs found and fixed along the way

- **Ghost-story privacy regex never matched.** `LEGAL_ENTITY_RE` in `stories/live/useGhostData.ts` contained three literal backspace bytes where `\b` was meant. `isPersona()` therefore returned true for every row, and the el-ejército-fantasma story masked every supplier name, companies included. With `\b` restored, rows with a legal-entity marker such as SA DE CV, GRUPO or CONSTRUCTORA show their names again. Names without a marker stay masked. `useGhostData.test.ts` pins both cases. **This is a visible behaviour change on that story, so the judge should look at it.**
- **ExploreCanvas camera fly-in was dead code.** `triggerCameraDrill` was passed to the Z-layers but never called, so the fly-in transform never ran. The Z-layers also took 13 props they never read. The dead branch and props are deleted. Nothing on screen changes.
- **ResultsTable read fields that do not exist.** It fell back to `institution_id`, `institution_name` and `total_value_mxn`, none of which `InstitutionResponse` has. The dead fallbacks are removed.
- **plateLabels fallback read the wrong number.** Without a canvas, `measureLabel` parsed `"700 15px …"` as 700 px. Both measuring helpers now share `estimateWidth()`, which reads the px size. `setup.ts` makes jsdom's `getContext` return null instead of logging "Not implemented". The test asserts the estimate path, with no `canvas` package and no skipped tests.
- **Sidebar tests were stale.** `Sidebar.test.tsx` still expected the labels from before IA v3.1, such as DISCOVER, Administrations, Networks and "Procurement Transparency". It now checks the current labels.

Not fixed, and outside this track: the "AI-confirmed only" filter in `pages/explore/ResultsTable.tsx` reads `ensemble_anomaly_score` and `avg_risk_level`. The `/vendors` list endpoint never returns either field, so the filter always returns an empty list.

## Tests and coverage

| Gate | Result |
|---|---|
| `npx eslint .` | exit 0 · 0 errors · 31 warnings |
| `tsc --noEmit -p tsconfig.app.json` | 0 errors |
| `npm run build` | ✓ |
| `npm run lint:tokens` | PASS, 0 forbidden patterns |
| `npx vitest run` | 12 files · 106/106 passed, up from 5 failing |
| `npm run test:coverage` | exit 0 · 106/106 |

Coverage, for the files the tests load:

| Statements | Branches | Functions | Lines |
|---:|---:|---:|---:|
| 40.19 % | 42.42 % | 23.42 % | 39.23 % |

No coverage thresholds are configured, so none were lowered and none were added. The step had been failing on `MISSING DEPENDENCY @vitest/coverage-v8`. The fix adds `@vitest/coverage-v8@4.1.11`, matching the installed vitest, plus the `lcov` reporter. The Codecov upload step reads `coverage/lcov.info`, which was never written before.

## Browser QA

Vite ran on port 3012 with `VITE_API_URL=https://rubli.xyz`, driven by Playwright through `channel: 'msedge'` at 1440×900. The script is `_atlas_research/weekend/trackC/qa.mjs`, and the screenshots are in `shots/`.

| Shot | Interaction | Result |
|---|---|---|
| `01-command-palette.png` | Ctrl+K, type PEMEX, Esc, Ctrl+K again | The palette reopens with an empty query. |
| `02-contracts-expand-row.png` | /contracts, open a row's quick look | The row expands and `aria-expanded` is true. |
| `03-report-modal.png` | /print/vendors/29277, generate report | The dialog opens. |
| `04-risk-explainer.png` | /methodology, open the evidence annex | The RiskFactorTable renders. |
| `05-admin-survivors.png` | /administrations, hover Los Sobrevivientes | The slope renders and responds to hover. |
| `06-aria-ghost-panel.png` | /aria?pattern=P2 | The ghost confidence panel renders. |
| `07-atlas-flight.png` | /atlas?vuelo=pharma_cartel, next chapter | The URL moves to `n=1` and the camera reframes to IMSS. |

None of the seven pages raised a page error or a console error from the app. The /contracts run logged 503 responses from the production API.
