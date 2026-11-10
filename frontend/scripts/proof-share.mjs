#!/usr/bin/env node
/**
 * proof-share — how much of the first screen the page's object gets (DESIGN.md §3.1 «Compact chrome»).
 *
 *   node scripts/proof-share.mjs [--out file.json] [--shots dir] /route …
 *
 * For each route at 1440×900 and 390×844, after load (scroll 0):
 *   top     bottom of the top bar (+ the phone items row)
 *   head    px between the top bar and the first primary object (the masthead's real cost)
 *   share   % of the viewport below the top bar from the object's top to the fold
 *   rules   horizontal rule lines (1px borders, hr) inside the head band
 *   dupes   control labels that appear twice in main's first two screens
 *   bottom  fixed/sticky bars anchored to the viewport bottom
 * Primary object = first table / list (`ul.ls`, `ol`) / svg / canvas / `[data-primary]` / figure
 * that is ≥ 45 % of the viewport wide and ≥ 120 px tall.
 * Needs a dev server (PROOF_BASE, default http://127.0.0.1:3009, VITE_API_URL=https://rubli.xyz).
 */
import { chromium } from 'playwright'
import { writeFileSync, mkdirSync } from 'node:fs'

const BASE = process.env.PROOF_BASE ?? 'http://127.0.0.1:3009'
const args = process.argv.slice(2)
const flag = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null }
const OUT = flag('--out')
const SHOTS = flag('--shots')
const ROUTES = args.filter((a, i) => a.startsWith('/') && !['--out', '--shots'].includes(args[i - 1]))
const SIZES = [[1440, 900], [390, 844]]
// The page's object, by route (the first match wins); unlisted routes use the size heuristic.
const PRIMARY = [
  [/^\/aria\/caso\//, '.vd-exp'], [/^\/vendors\//, '.vd-exp'], [/^\/institutions\/\d/, '.vd-exp, .ct-section'],
  [/^\/categories\/\d/, '.cc-obj'], [/^\/sectors\/\d/, '.cd-lead'], [/^\/contracts\/\d/, '.ct-section, section'],
  [/^\/cases\/./, '.ct-section, section'], [/^\/cases/, '.cb-plot, .ct-table'], [/^\/contracts/, '.cl-plot, .cx-table'],
  [/^\/aria/, '.fw-wall, .ct-table'], [/^\/(antes-del-fallo|arranque)/, '.dt-fig'], [/^\/(rastro|gasto-a-ciegas)/, '.mp-obj, .nsv-plate-lg, figure'],
  [/^\/(methodology|datos|press)/, 'main section'],
]

const measure = (sel) => {
  const vw = innerWidth, vh = innerHeight
  const vis = (el) => { const cs = getComputedStyle(el); return cs.display !== 'none' && cs.visibility !== 'hidden' && el.getClientRects().length > 0 }
  let top = 0
  for (const el of document.querySelectorAll('.ct-top, .ct-items')) if (vis(el)) top = Math.max(top, el.getBoundingClientRect().bottom)
  const main = document.querySelector('main') || document.body
  const cands = [...main.querySelectorAll('table, ul.ls, ol, svg, canvas, [data-primary], figure, [role=table], [role=list]')]
    .filter((el) => { if (!vis(el)) return false; const r = el.getBoundingClientRect(); return r.width >= vw * 0.45 && r.height >= 120 && r.bottom > top })
    .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)
  const pick = sel ? [...main.querySelectorAll(sel)].find((el) => vis(el) && el.getBoundingClientRect().height > 40 && el.getBoundingClientRect().bottom > top) : null
  const prim = pick ?? cands[0]
  const pTop = prim ? Math.max(top, prim.getBoundingClientRect().top) : vh
  const head = Math.round(pTop - top)
  const share = Math.max(0, Math.min(1, (vh - pTop) / (vh - top)))
  // rule lines in the head band
  let rules = 0
  for (const el of main.querySelectorAll('*')) {
    const r = el.getBoundingClientRect()
    if (r.width < vw * 0.3 || r.bottom < top || r.top > pTop) continue
    const cs = getComputedStyle(el)
    if (el.tagName === 'HR') { rules++; continue }
    if (parseFloat(cs.borderTopWidth) >= 1 && cs.borderTopStyle !== 'none' && r.top >= top && r.top <= pTop) rules++
    if (parseFloat(cs.borderBottomWidth) >= 1 && cs.borderBottomStyle !== 'none' && r.bottom >= top && r.bottom <= pTop) rules++
  }
  // duplicated control labels in the first two screens
  const seen = new Map()
  for (const el of main.querySelectorAll('button, [role=button], [role=tab], select, a.ct-link, a[class*=btn]')) {
    if (!vis(el) || el.closest('table, ul.ls, footer') || el.classList.contains('ct-mas')) continue
    const r = el.getBoundingClientRect(); if (r.top > vh * 2) continue
    const t = (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').toLowerCase()
    if (!t || t.length > 60) continue
    seen.set(t, (seen.get(t) ?? 0) + 1)
  }
  const dupes = [...seen].filter(([, n]) => n > 1).map(([t, n]) => `${t}×${n}`)
  // bottom bars
  const bottom = []
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el)
    if (cs.position !== 'fixed' && cs.position !== 'sticky') continue
    if (cs.bottom === 'auto' || !vis(el)) continue
    const r = el.getBoundingClientRect()
    if (r.height > 0 && r.width > vw * 0.5 && r.bottom >= vh - 4 && r.top < vh - 4) bottom.push((el.className?.toString?.() || el.tagName).slice(0, 40))
  }
  // text pushed past the right edge (a nowrap line widening a grid track) — invisible to proof:ui
  const offscreen = [...main.querySelectorAll('h1, h2, p')].filter((el) => vis(el) && el.getBoundingClientRect().left >= vw).length
  const h1 = document.querySelector('main h1')
  return { top: Math.round(top), head, share: Math.round(share * 100), rules, dupes, bottom,
    primary: prim ? `${prim.tagName.toLowerCase()}${prim.className?.toString ? '.' + prim.className.toString().split(' ').slice(0, 2).join('.') : ''}` : 'none',
    h1: h1 ? Math.round(h1.getBoundingClientRect().height) : 0, wide: document.documentElement.scrollWidth > vw, offscreen, docH: document.documentElement.scrollHeight }
}

const browser = await chromium.launch()
const results = []
for (const [w, h] of SIZES) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 })
  await ctx.addInitScript(() => { try { sessionStorage.setItem('rubli-intro', '1'); localStorage.setItem('i18nextLng', 'es') } catch { /* private */ } })
  const page = await ctx.newPage()
  for (const route of ROUTES) {
    try {
      await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 60000 })
    } catch { /* long-poll pages: measure what is there */ }
    const sel = PRIMARY.find(([re]) => re.test(route))?.[1] ?? null
    if (sel) await page.waitForSelector(sel, { timeout: 25000 }).catch(() => {})
    await page.waitForTimeout(3000)
    const m = await page.evaluate(measure, sel)
    results.push({ route, w, ...m })
    console.log(`${String(w).padStart(4)} ${route.padEnd(34)} head ${String(m.head).padStart(4)}  share ${String(m.share).padStart(3)}%  rules ${m.rules}  dupes ${m.dupes.length}  bottom ${m.bottom.length}${m.wide ? '  WIDE' : ''}${m.offscreen ? `  OFFSCREEN ${m.offscreen}` : ''}  ${m.primary}`)
    if (SHOTS) { mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: `${SHOTS}/${route.replace(/[/?=&:]+/g, '_').replace(/^_|_$/g, '') || 'root'}_${w}.png` }) }
  }
  await ctx.close()
}
await browser.close()
if (OUT) writeFileSync(OUT, JSON.stringify(results, null, 2))
