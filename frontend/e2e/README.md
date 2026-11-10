# E2E

## Smoke suite (run before every deploy)

```bash
cd frontend
npm run e2e:smoke                              # http://localhost:3009 (dev server must be up)
npm run e2e:smoke -- --base=https://rubli.xyz  # prod, read-only
npm run e2e:smoke -- --base=https://rubli.xyz --project=es-1440 -g aria   # any playwright args pass through
```

One-time browser install (C: is full — browsers live on D:):

```bash
PLAYWRIGHT_BROWSERS_PATH='D:\Python\_pw' npx playwright install --only-shell chromium
```

`run.mjs` sets `PLAYWRIGHT_BROWSERS_PATH=D:\Python\_pw` when that folder exists.

**Projects:** `es-1440`, `es-390` (phone), `en-1440` (the EN pass: page renders only).

**Every test asserts** (fixture `guard` in `smoke/smoke.spec.ts`): no console errors, no page errors,
no response ≥ 400 (except a 404 the test declares), no failed request, no error boundary
(«Algo salió mal»), and at 390 px no horizontal scroll on any visited page.

**Covers:** Portada `/`, `/mapa` (Cifras + Vínculos), every route in `src/lib/nav/toc.ts`
(parsed from the file, flag-gated rows skipped), `/aria` cards + `?orden=` sort + card `?foco=`
open → Back closes, `/vendors/29277`, persona física note on `/aria/caso/105407`,
`/contracts?is_single_bid=true` tag, CSV export download (non-empty), command palette company RFC →
vendor page, `/mapa?s=salud&i=251&v=29277` drill returns only IMSS contracts, `/privacy` § 7,
`/nope` NotFound (HTTP 404 on prod), Noche theme keeps the route.

**Prod safety:** read-only (never submits a form; the export is a GET), one worker, navigations spaced
≥ 500 ms. Don't run against prod Sat 23:00 – Sun 08:00 UTC (weekly refresh).

`npm run test:e2e` (the older specs, `playwright.config.ts`) ignores `smoke/`.
