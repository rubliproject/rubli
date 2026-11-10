# El Atlas — Session 2 «Depth» — executor report

Spec `.claude/designs/atlas-2026-10-02-spec.md` §5 row 2. Worktree `.claude/worktrees/atlas-sky`, branch `atlas/sky-s2` (base `a930b13f`). Not pushed, not deployed, BUILD_ID untouched.

## Commits
| Hash | Subject |
|---|---|
| cf6ce0f9 | system endpoint, `amount_flag` on the list, `flags2` glyph bits (§2.9 §2.5 §3.6) |
| e7b27dc7 | depth layers: arcs, belts, ghosts, threads, glyphs, rim remainder, Z2 moons + Z3 thread, SkyLabels (§2.3–§2.5 §3.2 §3.6) |
| c87ebff5 | stations + trail: StarDock, Expediente adapter, «ESTÁS EN» + trail, staged page (§3.4 §3.5 §3.13) |
| a2391548 | labels + threads: formatted body names, rim-name collisions, dock-aware arrows, sector side alternates, Z3 thread alone |
| cb0edd17 | star brief: halo basis from the manifest, no tooltip after a moon click |
| branch HEAD | this report + unused-export cleanup |

## Built (file · LOC)
| File | LOC |
|---|---|
| backend/api/services/atlas_sky.py (`build_system`, `resolve_vendor`) | +182 |
| backend/api/routers/atlas.py (`GET /atlas/sky/system`) | +32 |
| backend/api/routers/contracts.py + models/contract.py (`amount_flag`) | +6 |
| backend/scripts/precompute_atlas_sky.py (`flags2`) | +21 |
| backend/tests/test_atlas_sky.py (7 new tests) | +78 |
| frontend/src/components/atlas/sky/SkyEngine.tsx | 663 → 1,145 |
| frontend/src/components/atlas/sky/SkyLabels.tsx (new) | 188 |
| frontend/src/components/atlas/sky/StarDock.tsx (new) | 127 |
| frontend/src/components/atlas/sky/expediente-adapter.ts (new) | 41 |
| frontend/src/lib/atlas/sky/use-vendor-contracts.ts (new) | 67 |
| frontend/src/lib/atlas/sky/url-state.ts (new, minimal) | 33 |
| frontend/src/lib/atlas/sky/geometry.ts · useSky.ts · copy.ts | +63 · +13 · +38 |
| frontend/src/components/atlas/AtlasBreadcrumb.tsx (rewritten; had no importers) | 145 → 85 |
| frontend/src/pages/Atlas.tsx | 160 → 314 |
| frontend/src/api/types.ts (`amount_flag` on `ContractListItem`) | +2 |

Total diff against the base: about +1,850 / −390 over 18 files. That is over the audited ≈ 1,225, mostly in SkyEngine (threads, edge arrows, moons and the moon card are all canvas code).

## What the reader gets
- **Z1 «El Sistema».** Tenure arcs on every engraved system, the per-year remainder track on the located star's rim («resto · no a escala»), ghosts at 35 % alpha, body labels (budget 40, names whole, outward side), glyphs (documented ochre ring, verified-group twin ring, EFOS hollow diamond, SFP cross), capture belts as 3 px ochre arcs with «CAPTURA ≥ 50 %». Hovering a body draws its membership threads to the other stars it sells to (≤ 12, then «+N»), co-bid threads (dashed zinc, red dashed only for a ranking-safe potential-collusion pair, open circle «fuera de la carta» when the partner has no body) and verified-group hairlines. Hovering a ghost threads it to the real body, with an edge arrow naming the host when off-screen. Tooltips carry catalog numbers «PV id» and «INS id».
- **StarDock «Ficha de la estrella».** V via `formatDualCurrency`, supplier count, halo share with its basis (model version read from the manifest), «n de N dibujados · el resto suma x %», top-5 by share, capture belts and «Otros proveedores aquí» as plain fly buttons, one `EntityIdentityChip` at the foot, «Ver su red en La Trama» link.
- **Z2 «El Planeta».** Top-100 contracts as moons on the date clock and log-amount track, engraved 10 K / 1 M / 100 M / 10 B rings, sexenio spokes, DA solid / competitive ring / single-bid ochre tick, 0.45 alpha for other buyers through the manifest's raw→canonical map, hollow dashed for > 10 B or `amount_flag = suspect_decimal`, inner per-year remainder track from `/contract-aggregate` with the caption «100 de N contratos dibujados … · resto · no a escala · ≤ {100th amount}». «El Expediente» docks in place.
- **Z3 «La Luna».** A click selects a moon (one hop), re-centres in 300 ms, draws the 1 px ochre thread to its canonical buyer star (edge arrow + name when off-screen) and shows a minimal card with «Volar a esta institución».
- **Position and trail.** «ESTÁS EN» crumbs (sector › star › planet › moon) are computed on `end` from the camera and are fly buttons. Every hop pushes a history entry; `Esc` calls `history.back()`, so Esc and browser Back retrace the same hop. Trail chips ≤ 6 then «+N». The URL gains `at=s:{id}` / `at=v:{id}`.

## Gates
- tsc (tsconfig.app.json): 0 errors.
- npm run build: exit 0.
- lint:tokens: PASS, 0 forbidden; no warning in any new or edited file.
- test_atlas_sky.py: 12/12 (5 S1 + 7 S2: named columns + no RFC, shape and caps (≤ 80 bodies, ≤ 60 ghosts, ≤ 12 memberships), `is_gt` = documented only, share order through `ranking_safe()` + capture/red co-bid safety, `?vendor=` resolves the host, glyph bits withheld for suppressed ids, `amount_flag` on the list).
- Full backend suite (`DATABASE_PATH` = source DB): 990 passed, 1 failed in 21 min. The failure is the known `test_z2_vendor_pool_flags::test_backfilled_counts_match_live_aggregate` parity (2144 vs 2142).

## Precompute — CHANGED, rerun at ship
`flags2` now carries bit0 SAT EFOS definitivo, bit1 SFP sanction, bit2 verified corporate group (`corporate_group_members.verification_source IS NOT NULL`); all three are zeroed for suppressed, GT-FP and persona-física ids (same rule as tiers). New meta keys `glyph_efos`, `glyph_sfp`, `glyph_group`. Layout, bodies and payload are otherwise identical. Local run: layout_version `20261002T134300Z`, drawn 20,868, per-star max 80, glyphs EFOS 110 / SFP 8 / group 38, payload 322,515 B gz, `wal_checkpoint (0,0,0)`.

Rerun in-container after the deploy, from the backend directory, with the same `--db` path the S1 run used (not verified from here):
```
PYTHONIOENCODING=utf-8 python -m scripts.precompute_atlas_sky --db <deploy DB path used for S1>
```
(`PYTHONIOENCODING=utf-8` matters when stdout is redirected: the first local run died on a cp1252 console before writing anything.)

## Acceptance evidence (`_atlas_research/s2/`)
- Screenshots 1440×900 in `shots/`: `{en,es}-k16-imss`, `{en,es}-k16-imss-focus`, `{en,es}-z2-planet`, `{en,es}-trail`, `{en,es}-k1`, plus `es-capture-gacm` (capture belt + dock list), `es-gt-expediente`, `dashboard-expediente`.
- Hop chain (EN and ES): IMSS → Grupo Fármacos Especializados (dock button) → a 2013 moon bought by ISSSTE → «Volar a esta institución». The crumb reads «El Campo › Salud › Instituto de Seguridad y Servicios Sociales de los Trabajadores del Estado» and the trail holds 3 chips. Esc returned to the moon view and Back to the planet; the path stayed `/atlas` throughout. Console errors: 0.
- Deep link `?at=v:29277&cam=943.6,7556.0,750&lv=…`: manifest and bin first; the engine mounts once both decode; then `system`, `contracts?vendor_id=…` and `contract-aggregate` fire after `end`; the Expediente's `shap`, `institutions`, `external-flags` follow. The app shell's own calls (`/sectors`, `/atlas/sector-institutions`, `/analysis/anomalies`) fire on every route and are not the page's.
- Documented GT vendor 2873 (Farmacéuticos Maypo) docks with its «caso» badge; `is_gt` comes from the documented set only.
- `/dashboard`: the scatter drawer still renders «El Expediente» (`dashboard-expediente.png`). `VendorFile.tsx` is untouched.
- Bench (`bench.txt`, 1366×768, threads off, 3-s wheel in/out): final run Z0 55.9 fps (p95 18.5 ms) and Z1 at IMSS 56.2 fps (p95 18.1 ms). An earlier run of the same draw path on a quieter machine gave 60.0 and 59.7 fps. The final run shared the CPU with uvicorn and the dev server, so the margin over 55 is thin.

## Deviations
1. **Ghosts are drawn only for vendors that have a body elsewhere.** A band member has no body to thread to, so it stays in the band. Ghost angle is mid-year (no slot), covered by the «orden dentro del año: arbitrario» stamp.
2. **> 12 memberships** draw the 12 largest threads plus a «+N» count, not a bundled fan.
3. **Expediente totals** (`total_contracts`, `total_amount_mxn`, `risk_score`) are summed over the sky's own tie basis (canonical ids, suspect-decimal and > 100 B excluded), so the dock agrees with the chart rather than with `vendor_stats`.
4. **Moons use the canonical id as `vendor_id`.** The contracts list filters the raw id, so contracts filed under a merged member id are not moons. `/contract-aggregate` has the same basis, so the remainder track is consistent with the moons.
5. **Glyphs come from the precompute** (`flags2`) so every Z1 system shows them with no fetch; this is the precompute change above.
6. **The engine mounts only after manifest and bin both decode** (S1 painted stars before the bin). This keeps the deep-link staging honest: nothing but those two calls happens before the first `end`.
7. **Location thresholds.** A star is located when the view centre is within 1.15·R_sys of it at ρ ≥ 0.6; a planet when ρ ≥ 20 and the centre is within 1.5·R_m of a body. The view centre is the free area left of the 380 px dock from Z1 on, so the `cam` in the URL reproduces the view.
8. **Moon re-centre** moves halfway to the moon at the same zoom, so the planet stays on screen.
9. **Co-bid partners with no body** end in an open circle at a hashed (arbitrary) angle on the free-area rim.
10. **Rim names drop on collision** (the arrow stays). A selected moon hides the planet's other threads so its thread to the buyer reads alone.
11. **The trail does not survive a reload**, and browser Forward is not replayed. The full URL codec is S3.
12. **The «CAPTURA ≥ 50 %» caption** is 10 px (spec says 9.5 px), honouring the 10 px floor. On GACM it sits close to the body label of the same vendor.
13. **Skipped moons** (amount ≤ 0) are counted in the hook but not printed; none appear in the top-100 of the vendors checked.
14. **Z0 carry-overs.** Star labels try right, then left, then below; sector names try top, foot, right, left before forcing. CFE, SEDENA and ISSSTE are now labelled at k = 1. Star-disc alpha at Z0 is 0.55·√(250/n_stars), clamped to 0.20–0.55, so Infrastructure (1,789 stars) drops to 0.20 and its dust reads through.

## Not verified
- The bench is headless Edge on this desktop with a 60 Hz rAF cap; no integrated-GPU run and no Chrome trace.
- Hover-only behaviours (ghost thread, co-bid threads at Z1) were checked in code and by hand-reading the Z2 shots, not with a hover screenshot.
- Nothing ran in-container or on prod.

## Left for S3
ContractFloatingCard (the minimal moon card stands in), SkyLegend + magnitude key, SkyFinder, SkySearch + verbs (band-member search → host + pulse), the full URL codec with trail/moon tokens and the legacy shim, nebula, period + blink (`period_q`), masthead/colofón edits. Worth revisiting: label density on very full systems (IMSS), the capture caption placement, and the bundled-fan form for > 12 memberships.
