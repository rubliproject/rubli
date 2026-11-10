# El Atlas — Session 1 «Flyable» — executor report

Spec `.claude/designs/atlas-2026-10-02-spec.md` §5 row 1. Worktree `.claude/worktrees/atlas-sky`, branch `atlas/sky-s1` (base `860a5815`). Not pushed, not deployed. Written here because the harness blocks report files under `_atlas_research/s1/`.

## Commits
| Hash | Subject |
|---|---|
| e0373180 | precompute: ties pass on canonical ids, sector ring, backbone FR stars, cap 60/80 + remainder, payload builders (§2.8) |
| fcb8c8a1 | endpoints: manifest + planets.bin, ETag/304, pre-gzipped bin, 24 h cache; privacy + asserts tests (§2.9, §7) |
| a2e9ce04 | SkyEngine Z0+Z1, geometry.ts, useSky, copy.ts, minimal page; six scope-era files deleted (§3.1, §3.13) |
| 4cf237f0 | fix: StrictMode frame bug, bin via fetch, world fits above the colofón, lighter Z0 fills |
| 667ce828 | fix: Z1 caption placement, halo gradient fades in hue, es-MX decimal on the rim |
| 95d9f936 | judge fix 2: halo gate = sector p90 plus each sector's top-3 by h·V (§2.2) |
| 93af8514 | judge fix 1: star labels by V, top half of the budget claims before sector names (§3.2) |

## Built (file · LOC)
| File | LOC |
|---|---|
| backend/scripts/precompute_atlas_sky.py | 539 |
| backend/api/services/atlas_sky.py | 141 |
| backend/api/routers/atlas.py · backend/api/main.py | +44 · +3 |
| backend/tests/test_atlas_sky.py | 114 |
| frontend/src/components/atlas/sky/SkyEngine.tsx | ≈ 670 |
| frontend/src/lib/atlas/sky/geometry.ts · useSky.ts · copy.ts | 131 · 43 · 43 |
| frontend/src/pages/Atlas.tsx (was 1,155) | 160 |
| Deleted: PadronBand, CohortRegister, VendorPivots, CartaLensIndex, CartaItinerarios, AtlasShell | −1,788 |

## Gates (after judge round 1)
- tsc (tsconfig.app.json): 0 errors.
- npm run build: exit 0.
- lint:tokens: PASS, 0 forbidden; no warning in new files.
- test_atlas_sky.py: 5/5.
- Full backend suite: 974 passed, 1 failed. The failure is the known pre-existing `test_z2_vendor_pool_flags::test_backfilled_counts_match_live_aggregate` parity (2144 vs 2142).

## Precompute numbers (layout_version 20261002T075508Z)
| Measure | Value |
|---|---|
| contracts → ties | 3,057,143 → 614,953 |
| stars | 3,462 |
| sky set (≥ 10 M or T1–T3) | 47,097 |
| drawn bodies | 20,868 |
| per-star max | 80 |
| sky bodies in the band because of the cap | 26,229 |
| remainder share | 52.1 % |
| dropped ties | 0 |
| backbone weight kept | 68.1 % |
| residual overlaps (> 0.5 world unit) | 129 pairs |
| public T1 / T2 / T3 | 245 / 1,116 / 4,249 |
| tiered vendors withheld | 1,707 |
| documented bodies drawn | 240 |
| co-bid rows | 14,113 |
| σ (uniform fit) | 0.8698 |
| anomalies | amount ≤ 0: 1,306 · > 10 B flagged: 32 · suspect-decimal excluded: 41 · no vendor/institution: 5,608 · > 100 B: 0 |
| payload gz | 322,179 B (wire 320,746) |
| runtime (local, cold D:) | 211 s |

## Acceptance
1. Gates are green. The precompute prints drawn N, per-star max, payload, remainder share, anomalies and dropped ties.
2. Screenshots are in `_atlas_research/s1/shots/`: `{en,es}-k1`, `{en,es}-k4`, `{en,es}-k16`, `{en,es}-imss-arrival`, `{en,es}-phone-390`, `roundtrip-{before,after}`. `en-k1`, `es-k1` and `en-k4` were re-shot after judge round 1. Backbone FR is kept; the phyllotaxis fallback is not used.
3. Bench (`_atlas_research/s1/bench.txt`): 60.0 fps on both 3-s wheel runs at 1366×768 with 20,868 bodies. p95 frame 16.8 ms, worst 17.3 ms.
4. Payload is 320,746 B on the wire. A cold load fires exactly 2 page calls; the app shell adds 7 on every route. `cam` and `lv` round-trip through a reload.
5. Privacy: no `rfc` key or person-RFC token in the manifest. T1–T3 bits are 0 for suppressed, FP and persona-física ids. The documented bit comes only from `label_sets()['documented']`. The colofón prints the public tier counts.
6. Phone: no canvas, 0 bin requests, bilingual notice and 12 sector chips.

## Judge round 1
- **Labels.** At k = 1 the labelled stars now include IMSS, PEMEX, CONAGUA, CAPUFE, AICM, SEDENA, Diconsa and Bienestar. CFE, SCT and ISSSTE sit beside larger labelled stars and are dropped because they do not fit (labels drop, never truncate). All 12 sector names show. A sector name moves to the foot of its disc when its top is taken.
- **Halos.** Infrastructure halos fell from 603 to 179 plus the top 3. That sector's median h is 0, so the old gate lit every star with any risk. The disc still reads warm because its 1,789 stars are drawn in the sector's own orange. Health keeps IMSS and ISSSTE halos.
- **Colofón.** It already prints "corte 28·sep·2025" and "cut Sep 28, 2025" from the manifest's data_cut. The platform has no single format: PlateFrame's dateline is today's date as YYYY·MM·DD, and other pages use "28 sep 2025" or "2025·09·28". I left the strings the judge named.

## Deviations
1. Drawn N is 20,868, below the expected 30–55 K, because the 60/80 cap binds (26,229 eligible bodies sit in bands).
2. The remainder share (52.1 %) counts ghost money (vendors hosted elsewhere) as not drawn.
3. Canonical ids map through Python dicts from the canonical tables, not a per-row `canonical_expr()`. The mapping is the same.
4. One uniform σ = 0.87 scales positions and R_sys so the pushed ring fits the world. The manifest R_sys is σ × the formula.
5. 129 system pairs still overlap after 600 collision passes.
6. The layout table gains `dep` and `risk`. The bin gains `risk_q u16` (16 B per body) so hue goes through `getRiskLevelFromScore`. `flags2` is 0 and `period_q` is not computed (S3).
7. De-overlap uses a fixed reference zoom (ρ = 0.42·700/R_sys) and ±½ body diameter.
8. The k = 1 fit uses `s₀ = min(w, h − 64)/W`, keeping the world above the colofón.
9. Z0 star fill alpha is 0.55; halos are dimmed to 0.4 below k = 3.
10. Masthead and colofón are page-local. `CartaMasthead` and `CartaColofon` are kept for S3.
11. The bin is fetched with `fetch` because the axios interceptor rewrites response data.
12. The cubic ease is inlined (no `d3-ease`). Flights use d3-zoom's default `interpolateZoom` with ≤ 1.4 s; there is no explicit two-segment path.
13. `rubli_atlas_visited_v1` is kept but not written. `?story=` and legacy params are ignored until S3/S4.
14. Z1 captions are canvas text on the focused system only. The seam caption can sit outside the frame at arrival zoom.
15. The Spanish rim copy uses "0.001 %" (es-MX decimal), matching the ring labels.

## Not verified
- The bench is headless Edge at a 60 Hz rAF cap on this desktop. There is no integrated-GPU run and no Chrome trace.
- First paint ≤ 2 s on prod and an in-container precompute run (not deployed).

## Left for S2
System endpoint (ghosts, co-bid, remainder by year, adapter fields), tenure arcs, ghosts and threads, body labels and catalog numbers, StarDock and capture belts, the rim remainder track, Z2 moons and `amount_flag`, the Expediente adapter, the trail, «Estás en» and Esc/Back. Worth revisiting: Infrastructure's warm fill, the 129 overlaps, and the cap given drawn N = 20.9 K.
