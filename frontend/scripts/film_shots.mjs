// Visual QA for gallery films: freeze each shot at a few moments and tile them into a contact sheet.
//
//   node scripts/film_shots.mjs <slug> [lang=en] [beats=all|0,3,7] [fracs=0.15,0.5,0.95]
//
// Needs the dev server (FILM_URL, default http://localhost:3013). Uses the film's ?shot=<beat>@<0..1>
// freeze, so every frame is a pure function of the scene code — re-run after each change.
// Output: ../_films/shots/<slug>/<lang>/<beat>-<frac>.jpg and sheet.jpg (rows = shots, columns = time).
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const here = path.dirname(fileURLToPath(import.meta.url))
const [slug, lang = 'en', beatsArg = 'all', fracsArg = '0.15,0.5,0.95'] = process.argv.slice(2)
const films = JSON.parse(fs.readFileSync(path.join(here, '../src/lib/gallery/story-films.json'), 'utf8'))
if (!films[slug]) { console.error('unknown film:', slug, '— have', Object.keys(films).join(', ')); process.exit(1) }
const n = films[slug].beats.length
const beats = beatsArg === 'all' ? [...Array(n).keys()] : beatsArg.split(',').map(Number)
const fracs = fracsArg.split(',').map(Number)
const out = path.join(here, '../../_films/shots', slug, lang + (process.env.FILM_VIEWPORT ? '-' + process.env.FILM_VIEWPORT : ''))
fs.mkdirSync(out, { recursive: true })
const base = process.env.FILM_URL ?? 'http://localhost:3013'

const browser = await chromium.launch({ channel: 'msedge' })
// FILM_VIEWPORT=390x844 captures the phone layout (the stage is 4:5 there) into <lang>-390x844/
const [vw, vh] = (process.env.FILM_VIEWPORT ?? '1280x800').split('x').map(Number)
const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: 1 })
await ctx.addInitScript((l) => localStorage.setItem('i18nextLng', l), lang)
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 300)))
for (const i of beats) {
  for (const f of fracs) {
    await page.goto(`${base}/gallery/${slug}?shot=${i}@${f}`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('canvas', { timeout: 180000 })
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(900) // scene module + fonts + a few frames
    await page.locator('canvas').first().locator('..').screenshot({ path: path.join(out, `${i}-${f}.jpg`), type: 'jpeg', quality: 86 })
  }
  console.log(`shot ${i} ${films[slug].beats[i].id}`)
}
await browser.close()
if (errors.length) console.error('PAGE ERRORS:\n' + [...new Set(errors)].join('\n'))
execFileSync('python', [path.join(here, 'film_sheet.py'), out, beats.join(','), fracs.join(',')], { stdio: 'inherit' })
