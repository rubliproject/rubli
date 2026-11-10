# El Atlas — Session 3 «Chain + orient» — executor report

Spec `.claude/designs/atlas-2026-10-02-spec.md` §5 row 3. Worktree `.claude/worktrees/atlas-sky`, branch `atlas/sky-s3` (base `2bfcbfbe`). Not pushed, not deployed, BUILD_ID untouched.

## Commits
| Hash | Subject |
|---|---|
| 0b107dcb | URL codec: cam/lv/star/planet/moon/trail/period/vuelo, strict parse, legacy shim + 6 vitest cases; `/patterns/:code/constellation` → pattern dossier (§3.10) |
| 30f8bf63 | period_q[5] in the ties pass, planets.bin SKY2, `system?vendor=` focus row for band / off-chart hits (§3.8 §3.9 §2.9) |
| cd1e8152 | ContractFloatingCard resurrected from `0134c659^` and amended (§3.5 c) |
| ee75a0b9 | SkyLegend + magnitude key; SkyFinder + nebula bitmap (§3.7 §3.3 §2.6) |
| 022ff673 | SkySearch, Tab-cyclable label buttons, `?` key map, period + Parpadeo, masthead + colofón from meta, URL-driven trail (§3.9 §3.8 §3.12 §3.10) |
| 1b66ce95 | orient layout: toolbar in the masthead row, notice as an overlay, reserved period line, furniture kept clear of labels (§3.3 §3.4 §3.8 §3.12) |
| branch HEAD | canvas offset for the trail row; this report |

## Built (file · LOC, diff against `2bfcbfbe`)
| File | Δ |
|---|---|
| frontend/src/pages/Atlas.tsx | +437 churn (314 → ≈ 470) |
| frontend/src/components/atlas/sky/SkyEngine.tsx | +209 churn |
| frontend/src/components/atlas/ContractFloatingCard.tsx (new) | 157 |
| frontend/src/components/atlas/sky/SkyFinder.tsx (new) | 143 |
| frontend/src/components/atlas/sky/SkySearch.tsx (new) | 142 |
| frontend/src/components/atlas/sky/SkyLegend.tsx (new) | 136 |
| frontend/src/components/atlas/sky/SkyPeriod.tsx (new) | 70 |
| frontend/src/lib/atlas/sky/url-state.ts + .test.ts | 138 + 55 |
| frontend/src/lib/atlas/sky/copy.ts | +112 |
| CartaMasthead.tsx · CartaColofon.tsx (rewritten from meta) | 183 → 60 · 149 → 60 |
| backend: precompute · atlas_sky.py · router · tests | +26 · +48 · +2 · +25 |
| App.tsx · geometry.ts · useSky.ts · use-vendor-contracts.ts · SkyLabels.tsx | small |

Total: **+1,593 / −503 over 21 files**, against the audited ≈ 1,200. **Nothing slipped** (blink, nebula and the corporate-group threads all ship); the overshoot is the bilingual copy (+112), the codec tests (+55), the backend focus row and tests (+73) and the page, which now owns the URL-as-source-of-truth logic. If the judge wants the gross back under the ceiling, the spec's slip order still applies: blink (`SkyPeriod` blink branch + engine size path, ≈ −60), then nebula (`nebulaBitmap` + engine draw, ≈ −35). Corporate-group twin rings and sibling hairlines were already shipped in S2 and need no S3 code.

## What the reader gets
- **The chain, complete.** Moon → «Ficha del contrato» replaces the dock body: title, risk indicator with its level word, DA/competitive/single bid, amount via `formatDualCurrency`, the institution's whole name, date, procedure, the «por revisar» box (suspect decimal, else > 10 B). «Volar a esta institución › {name}» flies to the canonical star from the manifest map; «Otros proveedores aquí» lists that star's top-8 from its prefetched system payload as plain fly buttons; the exit is «Ver contrato completo ↗» at the foot. The Z2 → Z3 hop now re-centres the planet exactly.
- **Orientation.** «Leyenda · escala log» (closed button already says log scale): basis line from the manifest, star and planet magnitude keys drawn with the same `starPx` / `planetPx` the engine uses, «escala logarítmica · no proporcional», marks (risk hues, solid/hollow, documented ring, group twin ring, EFOS diamond, SFP cross), the §2.7 channel table with arbitrary rows bold, the nearness / rim / within-year / arc / remainder / nebula rows, and a «fórmula» fold printing §2.3 and §2.5. Finder chart 168 × 168 bottom-left, pre-rendered once (nebula, sector discs, star dots, initials), ochre FOV box → crosshair below 6 px, «×k · sector» caption, click / drag slews, `m` toggles.
- **Search and verbs.** `/` focuses «Volar a una institución o proveedor». Stars match client-side (accent-folded name + siglas, V order); suppliers come from `vendorApi.search`. Rows carry INS / PV catalog numbers. A drawn supplier flies to its planet; a band member flies to its host, pulses that year's rim segment (≈ 2.4 s) and opens «El Expediente» for it; an off-chart supplier shows «No está en la carta: < 10 MDP y sin nivel ARIA T1–T3», its dossier chip and «Volar a su principal comprador». `Enter` flies to the first hit. Labels are now `<button>`s: `Tab` cycles them with `aria-label` = name + value, `Enter` flies. `?` opens the bilingual key map. `Esc` / `[` back one hop, `]` forward.
- **URL.** `cam, lv, star, planet, moon, trail, period, vuelo`; `replaceState` 250 ms after `end`, `pushState` per hop. Each entry carries its own trail, so reload, Back, Forward and a shared link all rebuild the same crumbs; restored planets get their names from their hosts' systems (same cache key). When the browser has no entry of ours to go back to (a shared link), Esc and trail chips retrace locally from the URL trail. `lv` mismatch: ids win, `cam` dropped, overlay notice «la carta se recalculó; te llevamos al mismo cuerpo».
- **Period.** `fox · calderon · pena_nieto · amlo · sheinbaum` in the URL; labels from `ADMIN_DISPLAY_ACCENTED`. Z0: bodies with no money at their host in the sexenio dim to 8 %, lit dust draws at 2 px and the star discs quiet to 45 % so the pattern reads; Z1: the sexenio wedge is tinted 6 % ochre on every engraved system. «Parpadeo · AMLO ⇄ Peña Nieto» alternates every 900 ms; «tamaño = dinero en el periodo» re-sizes Z1 bodies with the §2.3 size formula on the sexenio's money. The masthead line «en {sexenio} brillan {n} de {N} cuerpos» is counted client-side from the bin. Positions never move.
- **Masthead + colofón.** «FOLIO·IX · EL PLANETARIO · datos al 28·sep·2025 · ⓘ» (basis line, risk basis, halo basis) and a reserved period line. The colofón strip reads drawn of eligible · remainder · risk basis · cut, with a «colofón ▴» fold listing every §3.12 item (dropped ties and each anomaly count, public tiers, halo basis, backbone weight kept, the arbitrary-position line). All values come from the manifest.

## Precompute — CHANGED, rerun at ship
`period_q[5]` per drawn body is accumulated in the ties pass (money per sexenio at the host; outgoing-president year boundaries 2006/2012/2018/2024). The bin is now `SKY2` (+5 u8 columns, one per sexenio). The client decoder still accepts `SKY1` (periods read empty), so a deploy that lands before the rerun paints normally. New meta keys `bin_version = SKY2` and `period_lit`. Layout, bodies, caps and ties are unchanged. Local run: layout_version `20261002T144005Z`, drawn 20,868, per-star max 80, period_lit `[2838, 7587, 11226, 6611, 1823]`, payload **354,622 B gz** (gate 460,800), `wal_checkpoint (0,0,0)`, 299 s on a cold D:.

Rerun in-container after the deploy, from the backend directory, with the deploy DB path:
```
PYTHONIOENCODING=utf-8 python -m scripts.precompute_atlas_sky --db <deploy DB path>
```
The API workers cache by `layout_version`, so the new bin is served as soon as the rerun commits.

## Gates
- tsc (tsconfig.app.json): 0 errors.
- npm run build: exit 0.
- lint:tokens: PASS, 0 forbidden; no warning in any new or edited file.
- vitest `src/lib/atlas`: 6/6 (round-trip, malformed tokens, the four legacy shims).
- test_atlas_sky.py: 15/15 (3 new: the lv-pinned bin + 409; `period_q` lit counts match the meta and ≥ 99 % of bodies are lit somewhere; `?vendor=` focus row for a body-less vendor, no RFC).
- Full backend suite (`DATABASE_PATH` = source DB): 992 passed, 1 failed in 11.5 min. The failure is the known `test_z2_vendor_pool_flags::test_backfilled_counts_match_live_aggregate` parity (2144 vs 2142).

## Acceptance evidence (`_atlas_research/s3/`)
- Screenshots 1440×900 in `shots/`, EN and ES: `{en,es}-chain-card` (Z3 card in the dock), `{en,es}-chain` (ISSSTE's orbit after the hop, trail «El Campo · IMSS · Grupo Fármacos · Grupo Fármacos · #695355» = 4 chips), `{en,es}-legend`, `{en,es}-finder`, `{en,es}-search-results`, `{en,es}-search-band` (Puebla Automotriz at CFE with its Expediente), `{en,es}-search-offchart` (Grupo Kascom), `{en,es}-period`, `{en,es}-period-blink`, `legacy-proveedor` (Oceanografía at PEMEX E&P), `legacy-lv`, `en-keymap`, `{en,es}-k1`, `{en,es}-k16-imss`.
- Probe log `probe.log`: chain EN + ES with 0 console errors; reload keeps the four trail chips and their names; Esc, `[`, `]` and browser Forward all move between the same URLs; a fresh context opened on the shared URL shows the same crumbs and trail; `?scope=proveedor&vendor=48` → `star=311&planet=48`; `scope=cohorte&code=P2` and `lens=patterns&pin=P2` → field + «/aria» notice with the P2 pattern chip; `lens=sectors&pin=3` → Infraestructura disc; `lens=categories&pin=17` → field + `/categories` notice; `lv=20200101T000000Z&star=251` → IMSS, camera dropped, notice; `/patterns/P2/constellation` → `/patterns/P2`.
- Keyboard probe: `?` opens the map; `/` focuses search; `Tab` from the canvas lands on «Instituto Mexicano del Seguro Social · 1.8T MXN», next «PEMEX Exploración y Producción · 786.5B MXN»; `Enter` flies there (`star=311`, trail `h`); `m` hides the finder.
- Bench (`bench.txt`, 1366×768, 3-s wheel in/out, finder and nebula on): Z0 56.2 fps (p95 18.2 ms), Z1 at IMSS 56.3 fps (p95 18.1 ms). The margin over 55 stays thin, as in S2.

## Deviations
1. **The contract exit is a plain link, not an `EntityIdentityChip`.** The chip has no `contract` type and the spec forbids editing it (X10/X11); «Ver contrato completo ↗» is a CTA in the same register as the Expediente's «Abrir expediente completo».
2. **`/patterns/:code/constellation` now lands on the pattern dossier `/patterns/:code`**, not the sky: the sky draws no pattern cohorts, and the dossier is where that cohort lives. The URL shim for `scope=cohorte` / `lens=patterns` still lands on the field with the «/aria» notice.
3. **The codec lives at `lib/atlas/sky/url-state.ts`** (S2's file), not `lib/atlas/url-state.ts`; the vitest path `src/lib/atlas` covers it.
4. **Period dimming uses `period_q > 0`, not the `y0/y1` tenure bytes**: a tenure can span a sexenio with no contract in it, so money-in-period is the honest «brilla». The lit dust is drawn at 2 px and the Z0 star discs quiet to 45 % while a sexenio is selected; without that the 1 px dimming was invisible under the star discs.
5. **Blink pairs the chosen sexenio with its predecessor** (Fox pairs with Calderón). There is no second picker.
6. **Period, legend and search sit in the masthead row, not on the plate.** On the plate they hid sector names and cost the S2 label set; the canvas keeps S2's height. The canvas offset grew by 30 px for the reserved period line and the trail row.
7. **The finder sits bottom-left with the arbitrary stamps beside it**, not above it: above the finder the stamps covered Health and ISSSTE. Labels and edge-arrow names treat the finder, the stamps and the zoom buttons as reserved; ISSSTE's Z0 label is the cost (it sits under the finder at k = 1).
8. **Nebula: no 3-pass box-blur fallback.** Where `ctx.filter` is missing (older Safari) the shade is unblurred discs.
9. **Band pulse** is one ≈ 2.4 s pulse on the host's rim segment, drawn even before the system payload arrives.
10. **Search «host-then-planet»** is one van Wijk flight to the planet; the host is in the crumbs, not a separate flight.
11. **The colofón strip ellipsizes** on narrow screens; the fold carries every item.

## S2 carry-overs
- **Stale-cache trap — fixed.** `/atlas/sky/*` now answers `Cache-Control: public, no-cache` (every visit revalidates; the ETag = layout_version path still returns 304). The client requests `planets.bin?lv={manifest.layout_version}`; a different served version answers 409 and the client refetches the manifest, so a manifest and a bin from two precompute runs are never decoded together. Test `test_bin_pinned_to_manifest_lv`. The precompute carries main's `corporate_group_members` guard (cherry-picked `4ac6a812`).
- **Z2 caption collisions — fixed.** The cap and remainder captions reserve a band under the disc, are painted on paper, and thread names are placed around them. Edge-arrow ends stop 40 px above the stamp rows and names avoid the finder, stamps and zoom buttons.
- **Trail survives reload and Forward — fixed** through the URL trail.
- **Moon re-centre — fixed**: Z3 keeps the planet centred exactly.
- **IMSS label density at Z1 and the «CAPTURA ≥ 50 %» caption — unchanged**, for the judge on `k16-imss`. The seam caption was lifted above the sexenio names (Sheinbaum used to sit on it).

## Not verified
- The bench is headless Edge at a 60 Hz rAF cap on this desktop, with no integrated-GPU run and no Chrome trace.
- Nothing ran in-container or on prod; the precompute rerun there is still owed.
- Hover-only states (ghost and co-bid threads) were not re-shot; their code did not change beyond the arrow clamp.

## Left for S4
Phone «Descenso», fixed disc, sheet and Lista; FlightPlayer, the `flight-stats` registry, story re-targeting and the render-count guard (the codec already carries `vuelo=` and maps `?story=` to it); retiring `AtlasStoryPlayer`, deleting `AtlasContext.tsx` and `ring.ts` (still imported by `AtlasBreadcrumb` and `CartaMasthead`); the first-visit flight that writes `rubli_atlas_visited_v1`. Worth revisiting: Z0 forced sector names over star labels, the masthead kicker wrapping in Spanish, and the gross LOC.

## Judge round 1
- **Fix 1 · stale-cache trap** — `e54704e2` (landed before the judge's note): `Cache-Control: public, no-cache` on every `/atlas/sky/*` route (set in the `main.py` cache middleware; the routers set ETag only), ETag/304 revalidation unchanged; `useSky.ts` requests `planets.bin?lv={manifest.layout_version}`; the backend answers **409** when that lv is not the served one (422 when malformed) and the client then refetches the manifest. `test_etag_304_and_cache` asserts the header on both routes; `test_bin_pinned_to_manifest_lv` asserts 200 / 409 / 422.
- **Fix 2 · sector names never overprint** — Z0 sector names try top of the disc → foot → left → right; if all four collide the name is dropped (the disc hue still names the sector). In `es-period.png` «MEDIO AMBIENTE», «AGRICULTURA» and «HACIENDA» are now dropped instead of printed across star labels.
- **Fix 3 · no label clipped under the dock** — every label candidate must fit whole inside the free canvas (left of the 380 px dock from Z1, above the colofón strip); one that does not fit is dropped. `en-k16-imss.png` no longer shows the cut «Hospi…».
- Fixes 2 and 3 are one commit: both change the same claim function in `SkyLabels.tsx`.
- Gates after the round: tsc 0, build exit 0, lint:tokens PASS, vitest 6/6, test_atlas_sky 15/15. Re-shot: `_atlas_research/s3/shots/es-period.png`, `_atlas_research/s3/shots/en-k16-imss.png`.
