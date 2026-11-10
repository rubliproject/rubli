/**
 * Contact sheet for the PageQuestion look (kit/PageQuestion.tsx, `?pq=1`: strip + narrated tour over the page's own chart).
 *   PROOF_BASE=http://127.0.0.1:3009 node scripts/shoot-page-question.mjs      (from frontend/; API → prod)
 * Portada · El Mapa (Vínculos) · Focos Rojos × day|night × 1440|390: the strip shut, mid-①, the end of ②, ③.
 * Plus one webm of the tour on El Mapa and one on the Portada (1440 day).
 */
import { chromium } from 'playwright'
import { mkdirSync, readdirSync, renameSync } from 'node:fs'
import { join } from 'node:path'

const BASE = process.env.PROOF_BASE ?? 'http://127.0.0.1:3009'
const OUT = new URL('../../_explore/page_question_look_2026-11-04/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
mkdirSync(OUT, { recursive: true })
const PAGES = { portada: '/', mapa: '/mapa?vista=vinculos', aria: '/aria' }
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await chromium.launch({ channel: 'msedge' })
async function open(ctx, path, theme) {
  const page = await ctx.newPage()
  await page.addInitScript((t) => { try { localStorage.setItem('rubli-edition', t); localStorage.setItem('i18nextLng', 'es'); sessionStorage.removeItem('rubli-pq') } catch {} }, theme)
  await page.goto(`${BASE}${path}${path.includes('?') ? '&' : '?'}pq=1`, { waitUntil: 'networkidle' })
  await page.waitForSelector('.pgs-open', { timeout: 30000 })
  await page.waitForSelector('.pgs-f b', { timeout: 30000 }).catch(() => {})
  await wait(1200)
  return page
}

for (const [name, path] of Object.entries(PAGES)) {
  for (const theme of ['day', 'night']) {
    for (const w of [1440, 390]) {
      const ctx = await browser.newContext({ viewport: { width: w, height: w === 1440 ? 900 : 844 }, deviceScaleFactor: 1 })
      const page = await open(ctx, path, theme)
      const f = (s) => join(OUT, `${name}_${theme}_${w}_${s}.png`)
      await page.screenshot({ path: f('0shut') })
      await page.click('.pgs-open'); await wait(2200)
      await page.screenshot({ path: f('1paso1') })
      await page.click('button.pgs-mark[aria-label^="Paso 2"]'); await wait(5200)
      await page.screenshot({ path: f('2paso2') })
      await page.click('button.pgs-mark[aria-label^="Paso 3"]'); await wait(700)
      await page.screenshot({ path: f('3paso3') })
      await ctx.close()
    }
  }
}

// the tour as a film, 1440 day: El Mapa and the Portada, played through on its own clock
for (const name of ['mapa', 'portada']) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, recordVideo: { dir: OUT, size: { width: 1440, height: 900 } } })
  const page = await open(ctx, PAGES[name], 'day')
  await wait(800)
  await page.hover('.pgs-open'); await wait(400); await page.click('.pgs-open')
  await page.waitForSelector('.pgs-chip', { timeout: 40000 }); await wait(2600)
  await page.hover('.pgs-chip'); await wait(900)
  await page.keyboard.press('Escape'); await wait(900)
  const video = page.video()
  await ctx.close()
  renameSync(await video.path(), join(OUT, `tour_${name}_1440.webm`))
}
await browser.close()
console.log(readdirSync(OUT).filter((f) => /\.(png|webm)$/.test(f)).length, 'files in', OUT)
