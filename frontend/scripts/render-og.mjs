/**
 * render-og.mjs — regenerate the social cards from public/og/card.html.
 *
 *   node scripts/render-og.mjs [origin]   (from frontend/; default https://rubli.xyz;
 *                                          needs network for the fonts and the live facts)
 *
 * Writes public/og/rubli-card.png (1200×630) and public/og/rubli-square.png
 * (600×600). Every fact on the plate is read from the live API at render time —
 * years and contract count (/analysis/overview), the data cut (/stats/data-cut),
 * the model (/analysis/model/metadata) — so a re-render after each weekly refresh
 * is all it takes; the script fails rather than print a typed number.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ogDir = path.join(root, 'public', 'og')
const origin = process.argv[2] ?? 'https://rubli.xyz'

async function api(route) {
  const url = `${origin}/api/v1${route}`
  const res = await fetch(url, { signal: AbortSignal.timeout(90_000) })
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`)
  return res.json()
}
const [overview, dataCut, model] = await Promise.all([
  api('/analysis/overview'), api('/stats/data-cut'), api('/analysis/model/metadata'),
])
const { min_year: minYear, max_year: maxYear, total_contracts: contracts } = overview
if (![minYear, maxYear, contracts].every((n) => Number.isInteger(n) && n > 0)) {
  throw new Error(`/analysis/overview lacks min_year/max_year/total_contracts: ${JSON.stringify(overview)}`)
}
if (!/^\d{4}-\d{2}-\d{2}$/.test(dataCut.data_cut ?? '')) throw new Error(`/stats/data-cut has no data_cut: ${JSON.stringify(dataCut)}`)
if (!/^v\d/.test(model.version ?? '')) throw new Error(`/analysis/model/metadata has no version: ${JSON.stringify(model)}`)
const [y, m, d] = dataCut.data_cut.split('-').map(Number)
const cut = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
  .format(Date.UTC(y, m - 1, d)).replace(/\./g, '')

const source = await fs.readFile(path.join(ogDir, 'card.html'), 'utf8')
const fill = (variant) => source
  .replaceAll('{{VARIANT}}', variant)
  .replaceAll('{{MIN_YEAR}}', String(minYear))
  .replaceAll('{{MAX_YEAR}}', String(maxYear))
  .replaceAll('{{CUT}}', cut)
  .replaceAll('{{MODEL}}', model.version)
  .replaceAll('{{CONTRACTS}}', contracts.toLocaleString('en-US'))

const browser = await chromium.launch({ channel: 'msedge' })
try {
  for (const [variant, file, width, height] of [
    ['wide', 'rubli-card.png', 1200, 630],
    ['square', 'rubli-square.png', 600, 600],
  ]) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 })
    await page.setContent(fill(variant), { waitUntil: 'networkidle' })
    await page.evaluate(() => document.fonts.ready)
    const ok = await page.evaluate(() =>
      document.fonts.check('600 40px "EB Garamond"') && document.fonts.check('400 16px "IBM Plex Mono"'))
    if (!ok) throw new Error('web fonts did not load — refusing to render a fallback-font card')
    const out = path.join(ogDir, file)
    await page.screenshot({ path: out, type: 'png' })
    const { size } = await fs.stat(out)
    console.log(`${file}  ${width}×${height}  ${(size / 1024).toFixed(0)} KB`)
    if (size > 300 * 1024) throw new Error(`${file} is over 300 KB`)
    await page.close()
  }
} finally {
  await browser.close()
}
console.log(`plate: ${minYear}–${maxYear} · ${cut} · ${model.version} · ${contracts.toLocaleString('en-US')}`)
