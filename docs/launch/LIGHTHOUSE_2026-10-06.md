# Lighthouse — prod, 2026-10-06 (launch § 3 S3)

**Setup.** Lighthouse 13.5.0 (`npx`, not added to the repo) on Edge (headless), against **prod `https://rubli.xyz`** (BUILD_ID `2026-10-06-atlas-i-s3`, before this branch). Six pages × mobile (default: Moto G-class, simulated slow 4G, 4× CPU) and desktop (`--preset=desktop`) × 2 runs; the table is the median (= mean of the two runs). Raw JSON, runner and summariser: `_atlas_research/launch/lighthouse/` (`run.sh`, `summarize.mjs`, `summary.md`, `*-r{1,2}.json`).

**Budget.** LCP ≤ 2.5 s · CLS ≤ 0.1 · TBT ≤ 300 ms · Perf ≥ 70 mobile / ≥ 85 desktop · A11y ≥ 90 · BP ≥ 90 · SEO ≥ 90. **✗** = over budget.

| page | preset | FCP | LCP | CLS | TBT | Perf | A11y | BP | SEO |
|---|---|---|---|---|---|---|---|---|---|
| `/` | mobile | 6.1 s | 6.7 s ✗ | 0.001 | 962 ms ✗ | 40 ✗ | 100 | 100 | 100 |
| `/` | desktop | 2.2 s | 2.3 s | 0.015 | 44 ms | 77 ✗ | 96 | 100 | 100 |
| `/dashboard` | mobile | 6.6 s | 9.3 s ✗ | 0.118 ✗ | 1416 ms ✗ | 31 ✗ | 89 ✗ | 100 | 100 |
| `/dashboard` | desktop | 2.3 s | 2.8 s ✗ | 0.027 | 63 ms | 71 ✗ | 89 ✗ | 100 | 100 |
| `/atlas` | mobile | 6.4 s | 8.5 s ✗ | 0.278 ✗ | 470 ms ✗ | 34 ✗ | 100 | 100 | 100 |
| `/atlas` | desktop | 2.5 s | 3.5 s ✗ | 0.022 | 169 ms | 60 ✗ | 92 | 100 | 100 |
| `/sectors` | mobile | 5.6 s | 8.4 s ✗ | 0.019 | 1578 ms ✗ | 35 ✗ | 100 | 100 | 100 |
| `/sectors` | desktop | 2.5 s | 2.9 s ✗ | 0.014 | 70 ms | 71 ✗ | 97 | 100 | 100 |
| `/stories/captura-institucional` | mobile | 7.2 s | 8.8 s ✗ | 0.000 | 955 ms ✗ | 37 ✗ | 96 | 100 | 100 |
| `/stories/captura-institucional` | desktop | 2.2 s | 2.6 s ✗ | 0.005 | 108 ms | 71 ✗ | 92 | 100 | 100 |
| `/vendors/29277` | mobile | 6.2 s | 9.2 s ✗ | 0.000 | 2027 ms ✗ | 32 ✗ | 96 | 96 | 63 ✗ |
| `/vendors/29277` | desktop | 2.3 s | 2.8 s ✗ | 0.004 | 237 ms | 60 ✗ | 92 | 100 | 63 ✗ |

**Reading.** Accessibility, best practices and SEO are at or near 100 everywhere. **Performance fails on every page**: no page meets the desktop 85, and mobile sits at 31–40, with FCP ≈ 6 s before any data arrives. That is a shell-wide cost (render-blocking CSS + Google Fonts + the main bundle), not a per-page one. The vendor SEO 63 comes from `is-crawlable`: `robots.txt` disallows `/vendors/` **on purpose**, so it is not a defect. CLS meets the budget on desktop everywhere. On mobile it fails on `/atlas` (0.278: footer and running head shift as the canvas mounts) and `/dashboard` (0.118: masthead dek reflows).

## Top 3 actionable findings per page

The shell items repeat on every page: (a) **render-blocking** `index-*.css` + the Google Fonts stylesheet (1.2–2.35 s), which points at `frontend/index.html` (font `<link>`, 5 families incl. Playfair + Inter + JetBrains still loaded) and `src/index.css`; (b) **unused JS** 186–278 KB, mostly `vendor-recharts-*.js` pulled into first load, which points at `vite.config.ts` manualChunks and eager recharts imports; (c) **bootup / main-thread** 1.0–2.5 s on mobile in `index-*.js` + `vendor-utils-*.js`.

- **`/`**: render-blocking 1.65 s (shell a). Unused JS 225 KB, recharts on a page with no recharts (shell b; `src/pages/SpatialMap.tsx` import graph — unverified which import pulls it). `label-content-name-mismatch` on the sidebar brand link, the header search button and an `ol > li` button (`components/layout/Sidebar.tsx`, `Header.tsx`).
- **`/dashboard`**: main-thread 1.7 s / TBT 1.4 s on mobile (`pages/Executive.tsx`; cause not profiled). CLS 0.118 on `header.mh .mh-body` dek reflow (masthead component; reserve the dek line). A11y 89: `color-contrast` on the risk hero numerals inline `rgb(185,28,28)` / `rgb(180,83,9)` over the tinted tile, and `link-in-text-block` on the `/methodology` link (no underline at rest).
- **`/atlas`**: CLS 0.278 on mobile (footer + `.rh-head` shift when the canvas mounts; `pages/Atlas.tsx` / `MainLayout` footer). LCP 8.5 s / 3.5 s desktop, with `Atlas-*.js` in unused JS (278 KB). `color-contrast` on the 11 px archival chapter label in the story rail (`components/atlas/…` chapter aside).
- **`/sectors`**: TBT 1.6 s on mobile (`pages/Sectors.tsx`; cause not profiled). Render-blocking 1.3 s (shell a). `label-content-name-mismatch` on a sector card link (`aria-label` ≠ visible text).
- **story**: render-blocking 2.35 s, the worst of the six (shell a). `color-contrast` on the status pill in the masthead (`span.inline-flex` 13 px, `pages/StoryNarrative.tsx` hero). `agent-accessibility-tree` not well-formed (same page; needs a manual axe pass).
- **`/vendors/29277`**: bootup 2.0 s / TBT 2.0 s on mobile (`pages/VendorDossier.tsx`, 18 queries in `hooks/useVendorData.ts`). `errors-in-console`: API **503** under the Lighthouse burst (`[QueryClient] Request failed`), a backend capacity or rate signal (BP 96). `color-contrast` on the amber pill `rgb(180,83,9)` and on `text-text-muted/80` 12 px copy (`section#activity` in `pages/VendorDossier.tsx`).
- **All pages, desktop**: `target-size` on the sidebar OFF_NAV links (`a.text-[12px]` /dashboard /gallery) and the masthead index links `a.mh-index-link`, which are under 24 px tall.

## Trivial fixes made in this session
- `<html lang="es">` to match the ES-first static meta (S1 commit; i18n still sets it at boot).
- `<meta name="theme-color">` `#0d1117` → `#faf9f6` (paper), plus `manifest.json` `theme_color` / `background_color` `#0f172a` → `#faf9f6`. The browser chrome was painted dark navy over a paper site.
- Checked and **found clean**: every `<img>` in `src/` has `alt` (5/5); every `target="_blank"` carries `rel="noopener noreferrer"`; `public/` holds no oversized raster (the 15 MB are `gallery-vo/` audio).

## Backlog (separate session, by impact)
1. **Shell first paint (P0, all pages)**: trim the Google Fonts request to the families in use, `preload` the two display faces, and consider self-hosting (CSP already allows `'self'`). Inline critical CSS or split `index.css`. Expected to remove ~1.5–2 s of FCP on mobile.
2. **Recharts out of first load (P0)**: lazy-load the chart vendor chunk. 186–278 KB unused JS on every page.
3. **Long-cache static assets (P1)**: `cache-insight` flags 0.7–1.25 s on hashed assets. Check the nginx `Cache-Control` for `/assets/` and the fonts.
4. **Mobile TBT (P1)**: `/vendors/:id` (18 queries, 2.0 s), `/sectors` and `/dashboard`. Defer below-fold sections.
5. **CLS (P1)**: `/atlas` footer + running head (reserve the canvas height), and the `/dashboard` masthead dek.
6. **A11y (P2)**: contrast on the inline risk hexes over tints (dashboard hero, vendor pill, story status pill); underline in-text links; `aria-label` ≠ visible text on the brand link, search button and sector cards; target size of the 12 px OFF_NAV and `mh-index-link` rows.
7. **API 503 under burst (P2, backend)**: seen on the vendor dossier during the run.

## `.github/workflows/lighthouse.yml`
It is **not** wired to push and **has never been able to pass**. It triggers on `pull_request` only, and it points `configPath` at `.lighthouserc.json`, which does not exist in the repo, so no budgets are enforced. It also runs Node 20, while Vite 7 and Lighthouse 13 need ≥ 20.19 / 22.19. It runs `npm ci` without `--legacy-peer-deps` (the project's install recipe), and it audits `/executive`, which is now a redirect, against a preview server with no API. I made no budget change because there is nothing to align. GitHub Actions is blocked by billing anyway. If it is revived, add a `.lighthouserc.json` with the budget above and point it at prod or a staging host.
