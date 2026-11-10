# El Atlas — Session 4 «Phone + flights» — executor report

Spec `.claude/designs/atlas-2026-10-02-spec.md` §5 row 4 (§3.11, §4, §7). Worktree `.claude/worktrees/atlas-sky`, branch `atlas/sky-s4` (base `0f00c0d6`). Not pushed, not deployed, BUILD_ID untouched. No backend or precompute change in S4.

## Commits
| Hash | Subject |
|---|---|
| 7f326e23 | retire player: `/atlas/stories/:slug` → `<Navigate to /atlas?vuelo=:slug>`; delete `AtlasStoryPlayer`, `AtlasContext`, `ring.ts`; `ATLAS_RING` inlined into Masthead, Colofón, Breadcrumb (F9, §3.11.6) |
| aecd567b | flights: FlightPlayer (declarative model), flight-stats registry, 17 chapters re-targeted + fact-passed, render-count guard test, first-visit auto-flight (§3.11) |
| a53ead13 | phone: Descenso, fixed 358 px disc, bottom sheet, Lista, trail scroller, ≡ legend sheet, search sheet, phone flights (§4) |
| b041d85c | S3 carry-overs: contract exit in the chip's visual class; nebula box-blur fallback; sheet above the bottom nav; trail autoscroll |
| 23028ee2 | probe fixes: VendorFile labels to the 10 px floor and wrapping; colofón wraps; phone period row follows the chapter |
| branch HEAD | this report |

Diff vs `0f00c0d6`: **23 files, +1,670 / −823** (audited ≈ 790 net; actual ≈ +847 net). Overshoot: PhoneAtlas (459) carries the search sheet, the URL hop/retrace logic and the Lista that the audit priced inside 300; the stories file churn (378) is a full fact pass, not 80 lines of re-targeting.

## Built
**Flights (§3.11).** `sky/FlightPlayer.tsx` + `lib/atlas/flight-stats.ts` + `lib/atlas-stories.ts`.
- `vuelo=&n=` is read through a URL store (`useSyncExternalStore` over `popstate` + an `atlas:url` event) and written only through `writeSearch` / `navigateQuery` (`lib/atlas/sky/url-state.ts`). The page's `end` replaceState preserves `vuelo`/`n`.
- `compileWaypoint(chapter, manifest, bodies, system)` is pure and runs in render (`useMemo`): camera target (star / sector / home), lit sexenio, ranking-safe focus names, ringed body indices.
- One camera effect on `[flight.id, n, viewportKey]` calls the engine's imperative `fly`. The engine copies `highlight` and `reserve` into its existing `perRef`; no setter during a frame.
- `onEnd(loc, cam, user)`: `user = e.sourceEvent != null`. A programmatic end never touches the flight; a reader's wheel/drag, a click hop, `Esc` or a period pick takes the controls («Vuelo en pausa · Reanudar · ×»).
- The card occupies the dock column (right 380 px); `reserve` makes the engine centre in the free area at every zoom (home and sector frames included), so the card never covers the target. End card: «Tomar los mandos», «Siguiente vuelo», «Leer la investigación →».
- «Vuelos ▾» menu in the toolbar. Desktop autoplay by `dwellMs`, off under reduced motion.
- First visit: desktop, no reduced motion, no `cam/star/planet/sector/vuelo` in the URL, flag absent → banner «¿Primera vez? … · Saltar», after 1.2 s `vuelo=pharma_cartel` is written and `rubli_atlas_visited_v1 = '1'` is set **at that moment** (verified: flag `1` while chapter I plays). «Saltar» also sets the flag.

**Registry keys → source hooks** (every stat fetched; failure prints «Cifra no disponible · fuente: …»):
| Key | Hook (file) | Endpoint | Chapters |
|---|---|---|---|
| `year.da_rate` (+`other`, `peak`, `peakYear`) | `useYearOverYear` (components/stories/live/useEmergencyData.ts) | /analysis/year-over-year | pharma 5; covid 1, 2, 4, 5 |
| `star.value` | `useSkySystem` (lib/atlas/sky/useSky.ts) | /atlas/sky/system?inst= | pharma 1 |
| `star.share_of` | `useSkySystem` (ranked bodies only) | /atlas/sky/system?inst= | pharma 2 |
| `body.value_here` | `useSkySystem` (ranked only) | /atlas/sky/system?inst= | pharma 3 |
| `vendor.year_value` | `useVendorYearContracts` (useEmergencyData.ts) | /vendors/{id}/contracts?year= | covid 3 |
| `case.amount` | `useQuery(['case-detail', slug])`, same key as CaptureFigures.tsx | /cases/{slug} | estafa 3 |
| `pattern.vendors` | `usePatternGroups` (components/stories/live/useCaptureData.ts) | /aria/patterns/{code}/institutions | estafa 2 |

**Re-targeting (data lookup on /atlas/sky/system, layout 20261002T144005Z).** Pharma: IMSS (251) all six chapters; planet Grupo Fármacos Especializados (29277) + Maypo 2873, PISA 4335, DIMM 13885 — IMSS's four largest planets, all drawn and ranking-safe; periods calderón → peña nieto → peña nieto → amlo → amlo → sheinbaum. Estafa: every university body is withheld (not in `ranked`), so the flight frames the case record's source agencies — home (calderón), SEDATU 1759, Bansefi 1205, PEMEX Corporativo 1201, SEDATU (amlo), home (sheinbaum) — and names no supplier. COVID: home, IMSS, IMSS + HEMOSER 6038, home, home. 17/17 resolve to real bodies or an honest star/home frame.

**Fact pass on the narratives (against the QC'd long-forms and the case record).** Typed pulls replaced by live stats: «60 %» (live: 11.1 % across the four), «4 yrs», «78.1 %», «11 / 8 / 7.6 bn», covid «79 %», «80–81 % / 75 %» (2022 is 79.1 % live). Prose fixed: «three distributors» → the four named in the long-form; Estafa «some convictions arrive» → detained 2019, acquitted by the Supreme Court 2024, no conviction; «eleven universities and eight agencies» → eleven agencies and 186 companies; HEMOSER «$4.5B, 97 % IMSS» and Cyplam lines → live 2020 value. Pharma ch III retitled «La Pregunta de la Competencia»: the claim that COFECE opened a 2018 cartel case is not in the long-form (which recommends filing one). Pattern-lens language («P5 begins to glow») removed — the sky draws no pattern cohorts. COVID gains `longformSlug: el-ano-de-la-emergencia`.

**Phone (§4).** `sky/phone/PhoneAtlas.tsx`, `sky/phone/PhoneDisc.tsx`. Manifest only (`useSky(false)`); 0 `planets.bin` requests in the network log. Descenso: 12 sector rows by value with a 40 px manifest thumbnail; stars by V, 20 then «ver 40 más», ◉ halo glyph when h ≥ sector p90. Star: fixed 358 px canvas, §2.3 `orbitR`/`theta`, share rings, spokes, seam, tenure arcs, sexenio wedge, tap hit ≥ 12 px, `touch-action: pan-y`, no d3-zoom, label budget 12 (dropped on collision). «Disco / Lista»: Lista = every drawn body by share as a hop button with one mono line, then the remainder band per year. Bottom sheet PEEK 96 / HALF 50 dvh / FULL 92 dvh (docks above the app's bottom nav): star brief (StarDock) or, for a planet, the 358 px moon disc + «El Expediente»; a moon replaces the body with the contract card; «Volar a esta institución» hops with a 200 ms crossfade (none under reduced motion). Trail = horizontal chip scroller on the URL trail; Back gesture verified (`planet=4335` → `planet=29277`). Legend in a ≡ bottom sheet (`SkyLegend sheet`), no finder, period as one compact row (`SkyPeriod compact`). Search = full-screen sheet (stars client-side, vendors via `vendorApi.search`). Flights: «Iniciar vuelo» list in Descenso, no autoplay (URL stayed `n=1` for 12 s), swipe or ◀ ▶ (44 px).

**S3 carry-overs closed.** Contract exit keeps a plain link but wears the chip's classes (icon, hover wash, focus outline). Nebula: where `ctx.filter` is unsupported, a ×8 downsample/upsample box blur (never blank). Period toolbar on phone: compact row in the Descenso header.

## Gates
- tsc (tsconfig.app.json): 0 errors · `npm run build`: exit 0 · lint:tokens: PASS, 0 forbidden, no warning in any S4 file; `className` hex grep over components/atlas + pages/Atlas.tsx: 0.
- vitest `src/lib/atlas src/components/atlas`: **9/9** — codec 7 (new: `vuelo` carries `n`) + FlightPlayer 2: **17 waypoints · < 4 renders each · exactly one camera move per waypoint · 0 "Maximum update depth"**, and «a withheld planet is never a focal target or a name».
- pytest full suite (`DATABASE_PATH` = source DB): **993 passed, 1 failed** in 11 min 25 s — the known `test_z2_vendor_pool_flags::test_backfilled_counts_match_live_aggregate` parity (same as S3). Log `_atlas_research/s4/pytest_full.log`.
- **PARALLAX probe** (`_atlas_research/s4/probe.cjs`, modelled on day16 `audit16.mjs`, narrowed to the gate numbers): 32 states (1440: field, IMSS, three flights mid-chapter, end card, first visit; 390: Descenso, Health open, disc, Lista, planet HALF/FULL, moon, phone flight, phone end card) × EN + ES → **PROBE PASS 0/0/0** (sub-10 px 0, clipped 0, page overflow 0, italic 0). Log `_atlas_research/s4/probe.log`. First run failed 68: colofón ellipsis at 1440 and VendorFile 7.5–8.5 px labels + truncated pattern names in the phone sheet — both fixed in 23028ee2.
- Redirect: `/atlas/stories/pharma_cartel` → `/atlas?…&vuelo=pharma_cartel` (the page then adds `cam/lv`). `/dashboard`: 37 Observatory bodies, VendorFile drawer opens (`shots/dashboard-drawer.png`).

## Screenshots (`_atlas_research/s4/shots/`)
`flight-ch1`, `flight-ch2`, `flight-ch3`, `flight-end`, `desktop-firstvisit`, `k1`, `k16-imss`, `dashboard-drawer` (1440, EN); `phone-descenso`, `phone-disc-imss`, `phone-lista`, `phone-sheet-expediente` (FULL), `phone-trail`, `phone-flight` (390, EN). Spanish was probed, not shot.

## S4 deviations
1. **Flights frame the star system (Z1); the planet is a ringed focus, not a Z2 flight.** Flying to Z2 would fetch moons and dock the Expediente mid-narrative (F12 staging) and needs the system before the camera can know the planet is safe.
2. **The withheld check runs against the host's `ranked` list**, which only exists once the located system arrives after the flight's `end`; until then the card names nobody (no reason shipped).
3. **The chapter card lives in the dock column**, not bottom-left (proposal §5.3): bottom-left covered the IMSS system at 1440. `reserve` keeps the free area at every zoom.
4. **Flight chapters `replaceState` `n`**, so Back leaves the flight rather than stepping chapters.
5. **«Saltar» before the 1.2 s timer also sets the flag** (the reader has seen the offer).
6. **Prose edits beyond re-targeting** (fact pass above), including one retitle (pharma III). Typed counts that remain in prose are case-record facts («eleven agencies», «186 companies») or dates, not chapter stats.
7. **Phone disc bodies sit mid-year** (no `slot` without the bin) and use the §2.3 size formula on `value_mxn` × 0.85; labels and ring captions are canvas text.
8. **Phone Lista band rows are per-year aggregates** («2014 · 23 proveedores no dibujados · …»): the system payload carries no band member names; naming them needs an endpoint.
9. **Phone search: an off-chart supplier flies to its main buyer's disc** (`system?vendor=`) without the «No está en la carta» note; a failed lookup opens `/vendors/:id`.
10. **VendorFile internal type sizes changed** (10 px floor, wrapping pattern and factor labels): no prop change, but `/dashboard`'s drawer changes with it (re-checked).
11. **Colofón strip wraps to two lines** instead of ellipsizing and sits above the dock (z 6).
12. **SkyPeriod `compact` and SkyLegend `sheet` props added** (S3 components, not the forbidden primitives).

## REMAINING deviations across S1–S4 (for the sweep)
From S1: drawn N 20,868 (cap binds; 26,229 eligible in bands) · remainder share 52.1 % counts ghost money · uniform σ = 0.87 on positions/R_sys · 129 residual system overlaps · `risk_q u16` in the bin · de-overlap at a fixed reference zoom · k = 1 fit `min(w, h − 64)` · Z0 star alpha 0.55 / halos 0.4 below k 3 · bin via `fetch` (axios rewrites) · inlined cubic, no explicit two-segment flight · Spanish rim copy «0.001 %».
From S2: ghosts only for vendors with a body elsewhere · > 12 memberships = 12 threads + «+N», no bundled fan · Expediente totals on the sky's tie basis, not `vendor_stats` · moons keyed on the canonical id (merged-member contracts are not moons) · glyphs from the precompute · location thresholds (1.15·R_sys at ρ ≥ 0.6; 1.5·R_m at ρ ≥ 20) · moon re-centre · co-bid partners without a body at a hashed angle · «CAPTURA ≥ 50 %» at 10 px (spec 9.5) · skipped moons counted, not printed · IMSS Z1 label density.
From S3: `/patterns/:code/constellation` → pattern dossier · codec at `lib/atlas/sky/url-state.ts` · period dimming on `period_q > 0`, not `y0/y1` · blink pairs a sexenio with its predecessor · period/legend/search in the masthead row · finder bottom-left with ISSSTE's Z0 label under it at k = 1 · one ≈ 2.4 s band pulse · search host-then-planet is one flight · masthead kicker wraps in Spanish · gross LOC over the audit · precompute rerun in-container still owed (SKY2 bin).
From S4: items 1–12 above.
Closed in S4: contract-exit styling (S3 #1), nebula fallback (S3 #8), colofón ellipsis (S3 #11), trail survives reload (S2 #11, closed in S3), `rubli_atlas_visited_v1` never written (S1 #13).

## Not verified
- Real touch hardware, iOS Safari (the `ctx.filter` fallback path was not exercised: Edge supports the filter), and the swipe gesture beyond the pointer handler (no emulated swipe run).
- Reduced-motion was not emulated in a run: autoplay-off and no first-visit under `prefers-reduced-motion` are code-read only.
- Nothing in-container or on prod; no bench rerun (the S4 engine change is a ref read plus one ring path when a flight is active).
- Spanish flight screenshots were not taken (the probe covered ES at both widths).
