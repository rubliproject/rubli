import { defineConfig, devices } from '@playwright/test'

// Smoke suite — run via `npm run e2e:smoke -- --base=<url>` (see e2e/README.md).
const base = process.env.SMOKE_BASE || 'http://localhost:3009'
const isProd = !/localhost|127\.0\.0\.1/.test(base)

const desktop = { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } }
const phone = { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }

export default defineConfig({
  testDir: '.',
  fullyParallel: !isProd,
  workers: isProd ? 1 : 3, // prod server is fragile: one browser, requests spaced in the spec
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 20_000 },
  reporter: [['list']],
  outputDir: '../../test-results/smoke',
  use: { baseURL: base, locale: 'es-MX', acceptDownloads: true, trace: 'retain-on-failure' },
  projects: [
    { name: 'es-1440', use: desktop, metadata: { lang: 'es' } },
    { name: 'es-390', use: phone, metadata: { lang: 'es' } },
    { name: 'en-1440', use: { ...desktop, locale: 'en-US' }, metadata: { lang: 'en' } },
  ],
})
