# Portada (/) first-screen performance: diagnosis and fix plan (2026-10-28)

Diagnose and plan only. No source edits. Build measured: `index-DaFccjnM.js` (prod, 2026-10-28 ~14:50). The earlier build `index-CoxsBpL4.js` gave the first waterfall.

## 0. What could and could not be measured

- Real prod timings from this machine are unusable in absolute terms: the same Chrome takes 5-9 s TTFB to example.com and 2.8-9 s to rubli.xyz HTML, while curl gets rubli.xyz HTML in 0.14-0.6 s. So the numbers below come from a **deterministic replay**: prod's exact files and API responses (fetched once, cached on D:), served from a local HTTP/2 server with the API think-time measured on prod (bundle and manifest 400 ms, other API 200 ms), Chrome with CDP throttling. Three profiles: `fast` 50 Mbps/20 ms, `cable` 10 Mbps/40 ms, `mobile` 1.6 Mbps/150 ms plus 4x CPU (Lighthouse-mobile-like).
- Noise on `mobile` is about +-1 s between runs of the same variant (8 identical-baseline samples: FCP 4.4-5.4 s, sky 5.4-6.7 s). A single-fix delta under ~1 s on mobile is inside the noise; flagged below.
- Harness lived in the session scratchpad (`srv.cjs`, `sim.cjs`, `prof.cjs`); not committed. Say so if you want it in `frontend/scripts/`.
- The Skill tool was not available in this session, so `react-performance` and `vercel-react-best-practices` were not invoked; their rules were applied from memory (waterfalls first, defer non-critical work, bytes before paint, no memo guesses).

## 1. Measured baseline (replay of the prod build)

Marks: FCP = first-contentful-paint; sky = canvas mounted and skeleton gone.

| profile | FCP | grey skeleton visible | sky ready | manifest start / end | bundle start / end | TBT |
|---|---|---|---|---|---|---|
| fast | 1.47 s | 1.48 s | 2.1 s | 1.05 / 1.86 s | 1.07 / 1.81 s | 249 ms |
| cable | 1.6-1.8 s | 1.9-2.0 s | 2.1-2.5 s | 1.3-1.5 / 2.1-2.2 s | 1.3-1.5 / 2.0-2.1 s | 217-234 ms |
| mobile (median of 8) | ~4.9 s | ~5.5 s | ~6.0 s (5.4-6.7) | ~3.3 / ~5.0 s | ~3.4 / ~4.2 s | ~3.5 s |

- This reproduces the taste audit: HTML lands at ~0.9 s (mobile), **data requests start at ~3.3 s**, only after `index.js` (390 KB raw, 125 KB gz) and 8 vendor modulepreloads download and execute. FCP is the empty body; the Portada shows `.pf-sky-skel` ("Cargando el cielo...") until the manifest is parsed.
- JS before first sky paint: **331 KB gz** (index 125, vendor-motion 43, radix 28, utils 28, i18n 21, react 15, tanstack 12, icons 7, nuqs 5, Executive 17, vendor-d3 18, Field/DotField/EntityIdentityChip etc. ~15). CSS: one render-blocking `index.css`, 42 KB gz / 269 KB raw. Fonts: 2 preloaded (36 KB); 4 more (Spectral 500/600/700, SC 600, Plex 700, ~110 KB) are discovered only when React first renders.
- API payloads: **sky manifest 137 KB gz / 460 KB raw**, the biggest single first-screen item (24 % of all bytes); dashboard-bundle 16 KB gz / 52 KB raw. In the manifest, `stars.name` is 201 KB raw and `stars.siglas` 25 KB raw. In the bundle, the Portada reads only `executive_summary.{headline,risk,procedures,sectors,administrations}` plus `case_stats` (~3.7 KB raw); `fast_dashboard`, `recent_critical`, `aria_stats`, `capture_leaders` and `executive_summary.ground_truth` (20 KB) go unused on `/` (SiteIndex and Press use them).
- Below-fold queries fire the moment `Executive` mounts: `vendor-field` 148 KB gz / 407 KB raw, `aria/rosettes` 92 KB gz / 318 KB raw, `cauces`, `recent-activity`, `data-cut`. On mobile they start at ~4.7 s while the manifest is still downloading (ends ~5.0-5.7 s), so ~240 KB gz competes with the first-screen payload.
- Main thread (CDP profiler, 4x CPU, up to sky ready): JS self-time `index.js` 961 ms, `DotField` 570 ms (one function, 404 ms: Campo's dot field, **below the fold**), `Executive` 429 ms, `vendor-d3` 297 ms; plus ~2.2 s `(program)` (parse, compile, layout, paint). At 1x CPU roughly a quarter of that.

### Cache headers (prod, curl -I)

| resource | header | consequence |
|---|---|---|
| `/` HTML | `no-store, no-cache, must-revalidate` (5.5 KB) | fine, deliberate |
| `/assets/*`, `/fonts/*` | `public, max-age=31536000, immutable` | good |
| `/api/v1/executive/dashboard-bundle` | `no-cache`, no ETag | every visit refetches the full 16 KB and waits 0.25-0.76 s server TTFB (measured) |
| `/api/v1/atlas/sky/manifest` | `public, no-cache` + ETag; client also sends `cache: 'no-cache'` | every visit pays a revalidation round trip (~0.6 s TTFB measured); 137 KB re-downloaded whenever the layout changes |
| `/api/v1/stats/*`, `analysis/model/metadata` | `max-age=600..3600` + SWR | fine |

nginx has a 10-min shared `proxy_cache` in front of the API (works as designed); the problem is that the browser never caches the two first-screen calls.

### Things the prod audit should not miss

1. **A bot-defence layer injects a ~130 KB first-party `<script async>` into the HTML for browser-like clients (not for curl), then fires ~10 POST beacons on random 80-character paths.** It is not in the repo, `nginx.conf` or `Caddyfile`. It costs bytes and main-thread time on every first load and competes with the bundle. Owner: find what injects it (host or edge product) and exclude `/` or disable it. The replay does not include it (it serves the repo HTML), so every "ms saved" below is on top of it.
2. Chrome got `net::ERR_CONNECTION_CLOSED` on rubli.xyz in ~4 of ~15 cold loads here and one `502` on the manifest 304 path (around a deploy; assets rotated mid-session: `index-CoxsBpL4` went 404). curl never failed. Look at Caddy/HTTP3 (`Alt-Svc: h3`) and deploy atomicity; `main.tsx`'s reload guard covers stale tabs.

## 2. Experiments (mobile profile, 3 runs per cell, 2 rounds, noise +-1 s)

| variant | data ready (manifest end) | sky ready | read |
|---|---|---|---|
| base | 4.6-5.9 s | 5.5-7.1 s | |
| inline `fetch()` at the **top** of `<head>` (before CSS and module script) | 3.7-3.9 s (start 0.9 s) | 6.7-7.4 s (**worse**) | the early 153 KB shares a 1.6 Mbps link with index.js and CSS, delaying JS to 3.6 s; the Executive chunk is then requested at ~4.1 s and becomes the critical path |
| inline `fetch()` at the **end** of `<head>` (after the CSS link; it waits for the stylesheet) | 3.7-4.7 s (start 2.1-2.9 s) | 4.3-6.9 s | 4 paired comparisons vs base: -1.5, -1.9, -0.6, +1.4 s; median about -1 s, not significant alone |
| plus `modulepreload` for the Executive deps (11 chunks) | n/a | 5.5-7.3 s | no gain: they already load in parallel with the manifest (Vite emits the preload list), and early they add contention |
| manifest without `name`/`siglas` (stubbed) | similar | 6.3-7.0 s | -43 KB gz is ~0.2 s of link time; invisible under the noise |
| slim manifest plus tiny bundle | n/a | 6.3-7.1 s | same |
| slim + tiny + early-after-CSS | 4.3-4.7 s | 5.3-6.2 s | best cell, still CPU-bound: 1-2 s after the data arrives is JS eval, React and `pack()` at 4x CPU |

Reading: on a 1.6 Mbps / 4x-CPU phone the page is **bytes-and-main-thread bound** (~560 KB gz must arrive, ~1 MB raw JS must run). On cable/desktop it is **RTT-chain bound** (HTML, then index.js, then manifest, then render). The fixes differ by audience, so the plan orders them by what helps both.

## 3. Ranked fix list

Expected ms are for `/` on a first visit, sky ready. Desktop is roughly the cable profile; phone is the mobile profile. "Template-independent" means it survives a Portada reskin (no dependence on Firmamento/Executive markup).

### 1. Gate below-fold work (template-independent)
Wrap Campo, Cauces and PortadaCards so they mount, and fetch, on idle or near the viewport (`IntersectionObserver`, rootMargin ~600 px, or `requestIdleCallback` after the sky paints). Gate their `useQuery` with `enabled`. `lazy()` the components so they leave the Executive chunk.
- Desktop: -150 to -250 ms (DotField 404 ms at 4x is ~100 ms at 1x, plus Executive render).
- Phone: **-600 to -1,200 ms** (DotField 570 ms + Executive 429 ms at 4x, and 240 KB gz of API stops overlapping the manifest).
- A generic `<Defer>` / `useNearViewport()` helper works for any template. Highest confidence of the list: the CPU numbers come from the profiler, not the noisy waterfall. Keep reserved heights so layout does not jump (spacing gate).

### 2. Start the two first-screen fetches from index.html, after the stylesheet (template-independent)
Inline `fetch()` for the bundle and the manifest, consumed by `App.tsx`/queryFns via `window.__early`; keep the existing `prefetchQuery` as fallback. Both are same-origin. The bundle goes through axios (XHR), so `<link rel=preload as=fetch>` cannot be consumed; use a real `fetch()` and read it in `getDashboardBundle`.
- Desktop: -400 to -600 ms (removes the ~0.5 s gap between HTML and data start; cable today: ~985 ms to ~1,480 ms).
- Phone: about -1,000 ms median (range -1.9 s to +1.4 s). It only pays once #3 and #4 shrink the bytes; otherwise contention eats it.
- Place the script AFTER the CSS link, never at the top of head (top was measurably worse on the phone profile). Vite puts its CSS/modulepreload tags at the end of head, so this needs a post-build step or a `transformIndexHtml` plugin with `order: 'post'`. Run it on `/` only (path check).

### 3. Shrink the manifest on the wire (mostly template-independent)
Move `stars.name` + `siglas` (226 KB raw, ~43 KB gz) out of the first-screen manifest into a second immutable call (for example `/atlas/sky/names?lv=`) fetched after paint, or ship names only for the ~20 landmark stars. Also drop `inst_map`, `rem`, `ym`, `linked`, `lvl`, `np`, `drawn` if the Portada does not read them (minimal manifest = 69 KB gz). Alternative or addition: brotli at Caddy (typically -15 to -20 % vs gzip on JSON).
- Desktop: -50 to -120 ms. Phone: -220 to -350 ms of bandwidth plus ~100 ms parse (4x).
- Landmark labels on the first screen need their names, so the template decides how many. Server change in `atlas.py` plus `useSky`.

### 4. Cache headers and a Portada-sized payload (template-independent)
(a) Bundle: `Cache-Control: public, max-age=60, stale-while-revalidate=600` plus an ETag (it is already cached ~2 min server-side). Manifest: `public, max-age=300, stale-while-revalidate=86400`, and drop `cache: 'no-cache'` in `skyManifestQuery` (the Portada never decodes the bin; `/mapa` already handles 409 by invalidating).
(b) Add `GET /executive/portada` (headline, risk, procedures, sectors, administrations, case_stats: ~3.7 KB raw, ~1.2 KB gz) or a `?blocks=` filter on the bundle, so `/` stops waiting on six blocks and stops downloading `ground_truth` (20 KB).
- Repeat visits: -600 to -1,000 ms desktop, -800 to -1,500 ms phone (no revalidation RTT, no 0.25-0.76 s TTFB). First visit: ~-50 ms desktop, ~-70 ms phone.
- Pure server/headers; survives any skin. nginx's 10-min proxy cache already hides most server time on first visits.

### 5. Cut index.js before the Portada can run (template-independent)
Audit `dist/stats.html` (the visualizer writes it on every production build) for what the 390 KB-raw entry holds beyond the shell: both locales' `common`/`nav` JSON are statically imported in `i18n/index.ts`, plus MainLayout, nav registry, auth and drawer providers. Lazy-load the non-current language and anything the first route does not render. Fonts: the four faces fetched only after React renders (Spectral 500/600/700, Plex 700) could get a preload for the one the Portada claim uses, or `font-display: optional` for the rest.
- Desktop: -100 to -250 ms. Phone: -500 to -900 ms (index.js self-time 961 ms at 4x, 125 KB gz).
- Needs a build to size precisely; not run here (no edits, and the worktree node_modules junction gotcha).

### 6. Inline a tiny first-screen payload into index.html at deploy (template-independent, data only)
`scripts/gen-head-shells.mjs` is the place: write the six Portada figures (~1.2 KB gz) into `window.__portada` so contracts / critical / direct / suppliers paint with the first React render instead of "-". Needs a stale guard (build time stamp, ignore if older than ~24 h), a re-fetch, and the cut date printed beside it (transparency site: no silently stale number).
- Does not move the sky. Figures appear at FCP instead of at data-ready: -0.3 to -0.6 s desktop, -1 to -2 s phone.
- Do not inline the manifest (137 KB would bloat every document). Only worth it after #2, and only if the figures matter above the sky.

### 7. A skeleton that is not a grey box (template-specific, do it inside the reskin)
`Executive.tsx` prints "Cargando el cielo de instituciones..." over `.pf-sky-skel`. Paint the real chrome (masthead, claim, labelled figure slots, sky frame with its final aspect ratio) so the first screen is complete at FCP. Perceived, not measured: about -1 to -2 s desktop, -2 to -4 s phone.

### Not worth doing
- `modulepreload` for the Executive deps (measured: no gain, extra contention).
- `React.memo` / `useMemo` sweeps (no evidence of render cost; the cost is JS eval and a one-off `pack()`).
- `<link rel=preload as=fetch>` for the bundle (axios/XHR cannot consume it).
- Sky binary priority: the Portada does not load `planets.bin` (`useSky(false)`); `/mapa` does.

### If only three things ship before the reskin
1. #1 below-fold gating (biggest phone win, measured, safe).
2. #4 cache headers and the tiny payload (repeat visits, no client risk).
3. #2 early fetch after CSS (desktop win; ship with #1 so the phone does not pay the contention).
Also chase the bot-defence script (section 1) in parallel: it is outside the repo and may be the largest single cost on real devices.

## 4. Verification after each fix

- `MSYS_NO_PATHCONV=1 npm run proof:ui -- /` at 1440 and 390 (VOID/CHASM/RAGGED/OVERFLOW = 0), then re-run the replay profiles with 5+ runs per cell; require a delta larger than the noise (~1 s mobile, ~150 ms cable) before claiming a win.
- Re-measure on the real domain with the bot-defence script on and off.
- `npx tsc --noEmit -p tsconfig.app.json` and `npm run build` as usual.
