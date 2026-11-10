# Atlas instruments I-S1 «Hallar y guardar» — session report

Branch `atlas/i-s1` (base `9cfebf2b`), 19 commits, 17 files, +1,206 / −139. Not pushed. Spec
`.claude/designus/atlas-instruments-2026-10-03/spec-draft.md` §3.1, §3.5, §3.6, §3.8, §4.1, §4.3, §4.4, §5; brief `i-s1-brief.md`.
BUILD_ID `2026-10-06-atlas-i-s1`, found in `dist/assets/index-*.js`.

## What shipped

| # | Deliverable | Where |
|---|---|---|
| 1 | URL codec: `tab`, `yr` (reserved), `cmp` (reserved), `pins`. Adds `liveQuery`, `popLive` and a session mirror for pins. Vitest covers round-trip, the pan test, popstate and reload | `lib/atlas/sky/url-state.ts` |
| 2 | Dock tab strip: Ficha · Catálogo. Only these two tabs render | `pages/Atlas.tsx` |
| 3 | SkyCatalog: Este sistema and Sector scopes, Dinero · Participación sorts. No headers, a tick strip on every row, withheld rows shown by public label, a footer count, a roving cursor, and `c` opens it. StarDock's «Otros proveedores aquí» is now a single line | `SkyCatalog.tsx`, `lib/atlas/sky/catalog.ts` |
| 4 | Pins: `b` and `1`–`9`, the pins block, a «◆ n» chip and ink pennants. `vendorName` now gives a nameless body its public label everywhere | `SkyPins.tsx` |
| 5 | Siblings: `j`/`k` (also `.` and `,`) and the pill «i / n en {ámbito} · {orden}». No wrap-around | `Atlas.tsx` |
| 6 | CSV export: `e` opens «Exportar ▾». Files are public-basis only, carry the meta columns and a final count row, and have no RFC. The lasso reuses the same code | `lib/atlas/sky/export.ts` (+ test) |
| 7 | Compass (off-screen sectors and pins on a 22 px rim band), finder click-to-frame, and Z0 landmarks | `SkyCompass.tsx`, `SkyFinder.tsx`, `SkyLabels.ts` |
| 8 | `SkyApi.hover`: the catalog cursor puts a ring on its body | `SkyEngine.tsx` |
| 9 | Phone: the Lista is now the catalog, PEEK has ◀ ▶ ◆, pins appear in the trail, plus CSV and share | `phone/PhoneAtlas.tsx` |
| 10 | `SKY_KEYS` adds the I-S1 verbs. `[` `]` `0` keep their bindings | `copy.ts` |

## Gates

| Gate | Result |
|---|---|
| `tsc -p tsconfig.app.json` | 0 |
| `lint:tokens` | PASS |
| vitest `--maxWorkers=1` | 15 files, 139 tests green, including url-state 13 and export 3 |
| `eslint .` | 0 errors after the last fix. The full run's 8 errors were all in SkyCatalog's useMemo and are fixed. 36 warnings, all pre-existing; the one in `Atlas.tsx` is the old deep-link effect |
| `npm run build` | 0 |
| PARALLAX probe, 30 states (1440 + 390, EN + ES) | 0 sub-10 px · 0 clipped · 0 overflow · 0 italic (`shoot.log`, `shoot2.log`) |
| fps, bench at 1366 × 768 with a 3 s wheel (`bench.txt`) | Z1 IMSS with the catalog open: **60.0 fps**, p95 16.8 ms. Z1 IMSS: 60.0. Z0: 57.0 (run 1: 54.1, `bench_run1.txt`) |
| k16-imss labels | 13 with the compass rim and 13 without at 1440; 9 / 9 at 1280. Loss 0 |
| Landmarks | **8/10** at 1440 and at 1280, EN = ES (was 7 and 6). **Fails the ≥ 9 gate:** SCT and SICT sit about 21 px apart and the §4.3 leader-line fallback is not built |
| Payload | Unchanged. No backend change, no new endpoint, no new eager call |

## Fixed along the way (also broken live on main)

`/atlas?star=251` and every shared `cam=` link landed on an empty field. The cause:

1. The control ear mounts.
2. `--atlas-chrome` is re-measured.
3. The sky host resizes, which changes `s0`.
4. The d3 transform is in screen space, so at k 44 it now points at the wrong world point.

The fix has three parts:

- **SkyEngine resize keeps the camera.** It re-aims a running flight at the flight's own target.
- **The deep-link flight waits two frames** before starting (`25839b77`, `9da8b131`).

These are engine edits, declared. They sit outside the zoom and flight interpolation code.

## Not done or deviations

- **Sector scope «sin registros desde {y}».** It needs `stars[].ym`, which arrives in S2.
- **«CSV del lazo» is not in the menu.** The lasso panel keeps its own CSV button.
- **Compass merge.** Colliding tags fold into «+n» rather than a «◂ 3 sectores» list.
- **Compass at Z0.** The spec puts the compass at Z1/Z2 only, so the "compass at Z0" crop is shot at Z1 IMSS.
- **`SKY_KEYS` leaves out `t`, `x`, `h` and `{`.** They are not bound until S2/S3.

Crops are in `D:/Python/yangwenli/_atlas_research/atlas2/i-s1/`.
