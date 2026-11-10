# PERF launch — progress (executor)

Brief: `docs/launch/PERF-brief.md` (main checkout). Evidence: `_atlas_research/launch/perf/`
(Lighthouse JSON per label + `summary.md`, `font-census-*.json`, `crops/`, build logs).
Method: `npm run build` → `vite preview :4173` (`/api` proxied to prod) → Lighthouse 13.5,
mobile + desktop × 2 runs, median (`perf/run.sh`, `perf/step.sh`, `perf/summarize.mjs`).

- § 1 baseline — local preview, 6 pages × 2 presets × 2 runs → `perf/baseline/summary.md`.
  Mobile FCP 5.0–6.2 s, TBT 497–1,765 ms, Perf 27–49; desktop Perf 71–91. (No commit: measurement only.)
- § 2 fonts — self-hosted 24 woff2 (612 KB on disk, a page loads 3–7 of them) + OFL, Google Fonts link/preconnects gone,
  2 preloads. Census (24 routes × 1440 EN / 390 ES): no italic face and no Plex Mono 300 / Playfair 900
  ever loads → dropped; Inter + JetBrains Mono are LIVE (root `font-sans`, 2,213 `font-mono` sites) → kept.
  Loaded-face sets identical on 48/48 route×viewport; crops vs the Google-delivered control on the same
  build 0.00 % px on 24/24. Fonts now arrive ≈ 1.0 s vs 3.5–4.3 s; mobile FCP unmoved (JS-gated);
  /dashboard mobile CLS 0.240 → 0.117. `perf/s2-fonts/summary.md`.
- § 3 CSS — measured: index.css 192.6 KB raw / 30.0 KB gz before § 2; 212.5 / 31.0 after § 2 (the @font-face
  block, ~20 KB raw / ~3 KB gz); Tailwind v4 already purges (27K candidates; prose is used in 10 files, kept).
  Narrowed the scan root to src/ (`source(".")`): 212.5 → 211.2 KB raw, 31.0 → 30.9 KB gz. The only
  render-blocking stylesheet left is first-party `index-*.css`; nothing third-party. Not inlined (brief).
- § 4 charts — root cause: `<EntityProfileDrawer>` (mounted on every page, renders nothing closed) imported
  `EditorialSparkline` → `vendor-recharts` (365 KB) on every page; /atlas also got all of recharts because
  d3-zoom's deps (d3-interpolate …) were folded into the recharts chunk. Fix: drawer mounts on first open;
  the 6 recharts primitives are `lazyChart` wrappers in the editorial barrel (empty box of the chart's height);
  `vendor-d3` = the Atlas engine's d3 modules. Now recharts loads only where a chart draws (vendor, institution,
  sector dossiers), after first paint; echarts was already split (modal/minigraph only); d3-sankey had no importer.
  Lighthouse transfer: home 873→764 KB, dashboard 985→876, atlas 1074→970, sectors 928→826, story 978→869;
  "unused JS" 174–248 → 88–153 KB. Crops 0.00 % px 24/24 vs § 2; recharts surfaces + page heights identical to
  prod on 6 dossier routes. `perf/s4-charts/summary.md`. TBT readings on this box swing ±1 s run to run
  (other agents building), so TBT is judged at the end on repeated runs.
- § 5 cache — nginx: one `location ~ ^/(assets|fonts|og|logos)/` with a single
  `Cache-Control: public, max-age=31536000, immutable` (was `expires 1y` + a second header, /og/ none);
  sitemap/robots/manifest `no-cache`; index.html unchanged (no-store). Checked with `nginx -t` and `curl -I`
  on a local nginx 1.26.2 serving dist/ → `perf/nginx-headers.txt`. vite preview cannot show nginx headers;
  re-check on prod after deploy. Noticed: the server-level CSP never reaches HTML (any `add_header` in a
  location drops the inherited ones, and SPA routes land in `location = /index.html`) — not changed here.
- § 6 CLS — mobile, 3 runs each: /atlas 0.278 (baseline) → 0.000 ×3; /dashboard 0.240 (baseline) / 0.117 (after § 2)
  → 0.000 ×3. Causes found with Lighthouse `layout-shifts` + a throttled PerformanceObserver probe:
  (atlas) PhoneAtlas's one-line «loading» state let the site footer rise into view and drop again → it holds
  100svh like the route skeleton; (dashboard) the edition line's contract count arrived late and wrapped the
  line at 412 px (+15 px), the dek appeared late, and the lede's «—» placeholders re-wrapped the paragraph →
  each holds its final room invisibly (`visibility:hidden`, mono digits for the count). Final layouts
  unchanged: crops 0.00 % px 24/24 vs § 4; plate gate El Mapa + Atlas Δ 0 px on 12/12 vs prod.
  `perf/s6-cls`, `s6b-cls`, `s6c-cls`, `plate-{before,after}.json`.
- § 7a TBT/shell JS — the shell (Header breadcrumb + routeMeta titles) imported lib/story-content.ts (417 KB of
  chapters, unminified) on every page for 12 headlines. New `lib/story-index.ts` (13.5 KB, generated from
  STORIES) + `story-index.test.ts` that fails if it drifts. Main `index-*.js` 1,091,625 → 728,147 B (−363 KB).
  Mobile (3 runs, local): FCP home 5.3 → 4.2 s, sectors 6.2 → 4.4, story 5.7 → 4.8; TBT home 589 → 504–542,
  story 1,264 → 702–1,016, sectors 691(base)/986(§4) → 862–1,008, dashboard 1,437 → 855–1,293,
  vendor 1,765 → 1,649–2,004. TBT still over 600 on dashboard/sectors/vendor → § 7b. `perf/s7a-tbt`.
- § 8 CI budgets — `.lighthouserc.json` NEW (mobile, 2 runs, median): LCP ≤ 2.5 s, CLS ≤ 0.1, TBT ≤ 300 ms,
  Perf ≥ 0.70 as `warn` (not met yet — flip to `error` once they are), A11y/BP ≥ 0.90 `error`, SEO ≥ 0.90 `warn`
  (/vendors is disallowed in robots on purpose). `lighthouse.yml`: Node 22, `npm ci --legacy-peer-deps`,
  preview with `VITE_API_URL=https://rubli.xyz`, URLs / /dashboard /atlas /sectors /stories/captura-institucional
  (was /executive, a redirect). Not run (Actions blocked by billing).
  `.lighthouserc.json` was in `.gitignore` (swept in with internal dev files by 2b7aeafd); the workflow needs
  it in the repo, so that one line is removed.
- § 7b TBT — CPU profiles (4× throttle, 412 px, sourcemapped build; `perf/profile-*.txt`): the remaining
  main-thread cost is React rendering the whole page (react-dom 550–870 ms self) plus style/layout of the
  full DOM ("(program)" 2.8 s on /vendors; the ResizeObserver step on /sectors 590 ms). App-level hot spot
  found: `formatNumber` / `formatDate` / `formatRegistryDate` built a new Intl formatter per call
  (118 + 76 + 30 ms self on /vendors, 84 ms on /dashboard) → one cached formatter per locale. TBT 3 runs:
  dashboard 825–1,745, sectors 923–1,021, vendor 1,849–1,941 — no change outside this box's run-to-run swing.
  Target ≤ 600 ms NOT reached on these three; see PERF_2026-10-06.md § What remains.
- § 6 follow-up — the full vitest gate caught it: `PageMasthead.test` («omits the count while it is missing»)
  saw the held «1,000,000 CONTRATOS» in textContent. Holds now paint from CSS (`.mh-held::before
  { content: attr(data-hold) }`, visibility hidden), so no placeholder figure is ever in the text or the
  accessibility tree; same for the dashboard dek/lede holds. Dashboard mobile CLS re-measured 0.000 ×3 (`s6d-cls`).
- § 9 — BUILD_ID `2026-10-06-perf-launch`; report `docs/launch/PERF_2026-10-06.md`. Final full matrix
  (`perf/final/summary.md`): mobile FCP 4.2–4.8 s (was 5.0–6.2), Perf 34–57 (was 27–49); desktop Perf 78–96
  (was 71–91); CLS ≤ 0.022 everywhere. Gates: tsc 0 · lint:tokens PASS · vitest 160/160 · eslint 0 errors ·
  build 0. Final crops 0.00 % px 24/24 and font audit identical 24/24 vs the Google-delivered control.
  Not pushed. Next (lead): deploy, then `curl -I` the cache headers and re-run Lighthouse on prod.
