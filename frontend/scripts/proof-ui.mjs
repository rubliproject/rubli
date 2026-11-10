#!/usr/bin/env node
/**
 * proof-ui — the spacing gate. Measures the RENDERED page, not the source.
 *
 *   npm run proof:ui                 all migrated routes, 1440 + 390
 *   npm run proof:ui -- /dashboard   one route
 *
 * Fails (exit 1) on any of the four things the owner keeps finding:
 *   1. VOID     a text block (p/h/li/dd/figcaption) that ends ≥ 160px (and ≥ 20 % of its
 *               track) before its container edge with nothing beside it  — DESIGN.md §4
 *   2. CHASM    a vertical run ≥ 56px inside the measure with no ink at all (any width),
 *               excluding the shell top and the colophon                 — DESIGN.md §3
 *   3. RAGGED   siblings laid out side by side (grid/flex row) whose bottoms differ by
 *               ≥ 64px — the column that ends early                     — DESIGN.md §4
 *   4. OVERFLOW document wider than the viewport at 390                 — WIG
 *   0. NOT LOADED  an error page or an empty sheet fails outright (nothing is measured)
 *   6. EMPTY    a grid row with more columns than children, ≥ 160px of nothing at the right
 *   5. HOLE     inside a side-by-side column, ≥ 80px with no ink of its own (a column
 *               padded to match its sibling)                            — DESIGN.md §4.1
 *
 * Needs the dev server on http://127.0.0.1:3009 (VITE_API_URL=https://rubli.xyz).
 * Run under git-bash with MSYS_NO_PATHCONV=1 (else "/dashboard" becomes a Windows path).
 */
import { chromium } from 'playwright'

const BASE = process.env.PROOF_BASE ?? 'http://127.0.0.1:3009'
const ROUTES = process.argv.slice(2).filter((a) => a.startsWith('/')).length
  ? process.argv.slice(2).filter((a) => a.startsWith('/'))
  : ['/', '/mapa', '/atlas', '/sectors', '/aria', '/cases', '/vendors/29277', '/institutions/251', '/cases/estafa-maestra', '/contracts/2111601', '/categories/20', '/sectors/1',
     '/contracts', '/journalists', '/institutions', '/administrations', '/categories', '/captura', '/gap', '/patterns/P6', '/datos', '/press',
     '/methodology', '/settings', '/stories/el-gran-precio', '/stories/el-vacio', '/gallery', '/privacy', '/terms', '/login', '/register', '/officials/JOEL%20ARREGUIN%20CASILLAS']
const WIDTHS = [1440, 390]
const LIMITS = { voidSlack: 160, voidShare: 0.2, chasm: 56, ragged: 64, hole: 80 }

const measure = (limits) => {
  const out = { voids: [], chasms: [], ragged: [], holes: [], empties: [], scrollWidth: document.documentElement.scrollWidth }
  const vis = (el) => { const cs = getComputedStyle(el); return cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0' }
  const sheet = document.querySelector('main .ct') || document.querySelector('main') || document.querySelector('.ct') || document.body
  const sheetR = sheet.getBoundingClientRect()

  // 1. voids beside text blocks
  for (const el of document.querySelectorAll('.ct p, .ct h1, .ct h2, .ct h3, .ct li, .ct figcaption, .ct dd, .ct dt')) {
    const r = el.getBoundingClientRect()
    if (r.width < 40 || r.height < 10 || !vis(el)) continue
    const parent = el.parentElement; if (!parent) continue
    const pr = parent.getBoundingClientRect(); const pcs = getComputedStyle(parent)
    const padR = parseFloat(pcs.paddingRight) || 0, padL = parseFloat(pcs.paddingLeft) || 0
    const contentW = pr.width - padL - padR; const slack = (pr.right - padR) - r.right
    if (slack < limits.voidSlack || slack / contentW < limits.voidShare) continue
    let beside = false
    for (const sib of parent.children) {
      if (sib === el) continue
      const s = sib.getBoundingClientRect(); if (s.width < 8 || s.height < 8) continue
      if (Math.min(r.bottom, s.bottom) - Math.max(r.top, s.top) > 8 && s.left >= r.right - 4) { beside = true; break }
    }
    if (beside) continue
    if (pcs.display.includes('flex') && pcs.flexDirection !== 'column') continue
    if (pcs.display.includes('grid') && pcs.gridTemplateColumns.split(' ').length > 1) continue
    out.voids.push({ y: Math.round(r.top + scrollY), w: Math.round(r.width), slack: Math.round(slack), of: Math.round(contentW), text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60) })
  }

  // 2. chasms: ink occupancy per y inside the sheet, from every visible leaf box + rules
  const H = Math.ceil(document.documentElement.scrollHeight)
  const ink = new Uint8Array(H + 2)
  const mark = (top, bottom) => { const a = Math.max(0, Math.floor(top)), b = Math.min(H, Math.ceil(bottom)); for (let y = a; y < b; y++) ink[y] = 1 }
  for (const el of sheet.querySelectorAll('*')) {
    if (!vis(el)) continue
    const cs = getComputedStyle(el)
    const r = el.getBoundingClientRect(); if (r.width === 0 || r.height === 0) continue
    const top = r.top + scrollY, bottom = r.bottom + scrollY
    const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
    const isLeaf = el.children.length === 0
    const tag = el.tagName
    if (hasText || isLeaf || tag === 'SVG' || tag === 'CANVAS' || tag === 'IMG' || tag === 'INPUT' || tag === 'BUTTON') mark(top, bottom)
    // borders are ink too (rules)
    if (parseFloat(cs.borderTopWidth) > 0 && cs.borderTopStyle !== 'none') mark(top, top + 1)
    if (parseFloat(cs.borderBottomWidth) > 0 && cs.borderBottomStyle !== 'none') mark(bottom - 1, bottom)
    if (cs.backgroundImage !== 'none' || (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'rgb(255, 255, 255)')) mark(top, bottom)
  }
  const sheetTop = Math.round(sheetR.top + scrollY)
  const colophon = document.querySelector('.ct-firmas, footer')
  const sheetEnd = colophon ? Math.round(colophon.getBoundingClientRect().top + scrollY) : H
  let start = null
  for (let y = sheetTop; y <= sheetEnd; y++) {
    const blank = ink[y] === 0
    if (blank && start === null) start = y
    if ((!blank || y === sheetEnd) && start !== null) { const len = y - start; if (len >= limits.chasm) out.chasms.push({ y: start, h: len }); start = null }
  }

  // 3. ragged column ends: side-by-side siblings whose bottoms differ
  for (const parent of sheet.querySelectorAll('*')) {
    const cs = getComputedStyle(parent)
    const isRow = (cs.display.includes('grid') && cs.gridTemplateColumns.split(' ').length > 1) || (cs.display.includes('flex') && cs.flexDirection !== 'column')
    if (!isRow || !vis(parent)) continue
    if (parent.closest('table, [role="list"], .ct-table, .ct-brow, .ct-axis, .ct-dochead, .ct-annex-row, .ct-top, .ct-items, .ct-firmas, .ct-cl-grid, .cv-q3')) continue
    // a sticky column travels with the reader beside its long neighbour (the money-path object): its end is not a fixed
    // edge, so that one child leaves the comparison; the rest of the row is still compared
    const kids = [...parent.children].filter((k) => vis(k) && k.getBoundingClientRect().height > 40 && getComputedStyle(k).position !== 'sticky')
    if (kids.length < 2) continue
    const rects = kids.map((k) => k.getBoundingClientRect())
    // only true columns: horizontally disjoint, vertically overlapping
    const cols = rects.filter((r, i) => rects.some((o, j) => j !== i && (o.left >= r.right - 4 || o.right <= r.left + 4) && Math.min(r.bottom, o.bottom) - Math.max(r.top, o.top) > 40))
    if (cols.length < 2) continue
    // compare where the INK ends in each column, not the box (a grid stretches boxes to the row)
    const inkBottom = (k) => {
      let b = -Infinity
      for (const el of k.querySelectorAll('*')) {
        if (!vis(el)) continue
        const r = el.getBoundingClientRect(); if (r.width === 0 || r.height === 0) continue
        const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
        const ecs = getComputedStyle(el)
        if (hasText || el.children.length === 0 || ['SVG', 'CANVAS', 'IMG', 'INPUT', 'BUTTON'].includes(el.tagName) || (parseFloat(ecs.borderBottomWidth) > 0 && ecs.borderBottomStyle !== 'none')) b = Math.max(b, r.bottom)
      }
      return b === -Infinity ? k.getBoundingClientRect().bottom : b
    }
    // compare only columns that share a row: a multi-row grid's last row is not a ragged first row
    const ink = new Map(kids.map((k, i) => [rects[i], cols.includes(rects[i]) ? inkBottom(k) : null]))
    let diff = 0
    for (const r of cols) {
      const mates = cols.filter((o) => Math.min(r.bottom, o.bottom) - Math.max(r.top, o.top) > 40).map((o) => ink.get(o))
      diff = Math.max(diff, Math.max(...mates) - Math.min(...mates))
    }
    if (diff >= limits.ragged) out.ragged.push({ y: Math.round(Math.min(...cols.map((r) => r.top)) + scrollY), diff: Math.round(diff), cls: (parent.className?.toString() || parent.tagName).slice(0, 50) })
  }
  // 6. empty tracks: a grid row with more explicit columns than visible children (a 5fr track with nothing in it)
  for (const parent of sheet.querySelectorAll('*')) {
    const cs = getComputedStyle(parent)
    if (!cs.display.includes('grid') || !vis(parent)) continue
    const tracks = cs.gridTemplateColumns.split(' ').filter((t) => t !== 'none').length
    if (tracks < 2) continue
    if (parent.closest('table, [role="list"], .ct-table, .ct-brow, .ct-axis, .ct-top, .ct-items, .ct-firmas, .ct-cl-grid, .cv-q3, .cv-rec')) continue
    const kids = [...parent.children].filter((k) => vis(k) && k.getBoundingClientRect().height > 0)
    const pr = parent.getBoundingClientRect()
    if (pr.height < 120 || pr.width < 600) continue
    if (kids.length < tracks && kids.length > 0 && !cs.gridAutoFlow.includes('dense')) {
      // confirm the void: the right-most kid ends well before the parent's content edge
      const right = Math.max(...kids.map((k) => k.getBoundingClientRect().right))
      const slack = (pr.right - (parseFloat(cs.paddingRight) || 0)) - right
      if (slack >= 160) out.empties.push({ y: Math.round(pr.top + scrollY), tracks, kids: kids.length, slack: Math.round(slack), cls: (parent.className?.toString() || parent.tagName).slice(0, 50) })
    }
  }
  // 5. holes: inside a side-by-side column, a vertical run ≥ limits.hole with no ink of its own
  //    (a column padded to match its sibling's height — DESIGN.md §4.1: never pad to match)
  for (const parent of sheet.querySelectorAll('*')) {
    const cs = getComputedStyle(parent)
    const isRow = (cs.display.includes('grid') && cs.gridTemplateColumns.split(' ').length > 1) || (cs.display.includes('flex') && cs.flexDirection !== 'column')
    if (!isRow || !vis(parent)) continue
    if (parent.closest('table, [role="list"], .ct-table, .ct-brow, .ct-axis, .ct-dochead, .ct-annex-row, .ct-top, .ct-items, .ct-firmas, .ct-cl-grid, .cv-q3')) continue
    const kids = [...parent.children].filter((k) => vis(k) && k.getBoundingClientRect().height > 120 && k.getBoundingClientRect().width > 200)
    if (kids.length < 2) continue
    for (const col of kids) {
      const cr = col.getBoundingClientRect()
      const top = Math.round(cr.top + scrollY), bottom = Math.round(cr.bottom + scrollY)
      const colInk = new Uint8Array(bottom - top + 1)
      for (const el of col.querySelectorAll('*')) {
        if (!vis(el)) continue
        const r = el.getBoundingClientRect(); if (r.width === 0 || r.height === 0) continue
        const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
        const ecs = getComputedStyle(el)
        const isInk = hasText || el.children.length === 0 || ['SVG', 'CANVAS', 'IMG', 'INPUT', 'BUTTON'].includes(el.tagName) || (parseFloat(ecs.borderBottomWidth) > 0 && ecs.borderBottomStyle !== 'none') || (parseFloat(ecs.borderTopWidth) > 0 && ecs.borderTopStyle !== 'none')
        if (!isInk) continue
        const a = Math.max(0, Math.floor(r.top + scrollY) - top), z = Math.min(colInk.length, Math.ceil(r.bottom + scrollY) - top)
        for (let y = a; y < z; y++) colInk[y] = 1
      }
      let first = -1, last = -1
      for (let y = 0; y < colInk.length; y++) if (colInk[y]) { if (first < 0) first = y; last = y }
      if (first < 0) continue
      let run = null
      for (let y = first; y <= last; y++) {
        if (!colInk[y] && run === null) run = y
        if ((colInk[y] || y === last) && run !== null) { if (y - run >= limits.hole) out.holes.push({ y: top + run, h: y - run, cls: (col.className?.toString() || col.tagName).slice(0, 50) }); run = null }
      }
    }
  }
  return out
}

const b = await chromium.launch({ channel: 'msedge' })
let failures = 0
for (const route of ROUTES) {
  for (const width of WIDTHS) {
    const p = await b.newPage({ viewport: { width, height: 900 } })
    // PROOF_EDITION=night measures the night edition (lib/theme.ts reads `rubli-edition`)
    if (process.env.PROOF_EDITION) await p.addInitScript((e) => { try { localStorage.setItem('rubli-edition', e) } catch { /* private */ } }, process.env.PROOF_EDITION)
    try {
      await p.goto(`${BASE}${route}`, { waitUntil: 'networkidle', timeout: 90000 })
    } catch (e) { console.log(`✗ ${route} @${width}: could not load (${e.message.split('\n')[0]})`); failures++; await p.close(); continue }
    await p.waitForTimeout(2500)
    // a page that did not load (error state, skeletons still up) can never pass: wait, then fail
    const loaded = async () => p.evaluate(() => {
      const txt = (document.querySelector('.ct h1')?.textContent || '') + ' ' + ((document.querySelector('main .ct') || document.querySelector('main') || document.querySelector('.ct'))?.textContent || '')
      const err = /not found|no encontrad|could not be loaded|no se pudo cargar|something went wrong|algo salió mal/i.test(txt)
      const busy = document.querySelectorAll('[aria-busy="true"], .animate-pulse, [class*="-hold"], [class*="skeleton"]').length
      return { err, busy, textLen: ((document.querySelector('main .ct') || document.querySelector('main') || document.querySelector('.ct'))?.textContent || '').trim().length }
    })
    let st = await loaded()
    for (let i = 0; i < 8 && !st.err && st.busy > 0; i++) { await p.waitForTimeout(2500); st = await loaded() }
    if (st.err || st.textLen < 400) { console.log(`✗ ${route} @${width}: NOT LOADED (${st.err ? 'error page' : 'empty sheet'}) — nothing measured`); failures++; await p.close(); continue }
    if (st.busy > 0) console.log(`  … ${route} @${width}: ${st.busy} loading placeholder(s) still up after 22s; measuring anyway`)
    const r = await p.evaluate(measure, LIMITS)
    const over = width === 390 && r.scrollWidth > 390
    const n = r.voids.length + r.chasms.length + r.ragged.length + r.holes.length + r.empties.length + (over ? 1 : 0)
    console.log(`${n ? '✗' : '✓'} ${route} @${width}: ${r.voids.length} void · ${r.chasms.length} chasm · ${r.ragged.length} ragged · ${r.holes.length} hole · ${r.empties.length} empty-track${over ? ` · OVERFLOW ${r.scrollWidth}` : ''}`)
    for (const v of r.voids) console.log(`    void   y=${v.y} w=${v.w} slack=${v.slack}/${v.of} «${v.text}»`)
    for (const c of r.chasms) console.log(`    chasm  y=${c.y} h=${c.h}`)
    for (const g of r.ragged) console.log(`    ragged y=${g.y} Δ=${g.diff}px in .${g.cls}`)
    for (const h of r.holes) console.log(`    hole   y=${h.y} h=${h.h} in column .${h.cls}`)
    for (const e of r.empties) console.log(`    empty  y=${e.y} ${e.kids}/${e.tracks} tracks filled, ${e.slack}px void in .${e.cls}`)
    failures += n
    await p.close()
  }
}
await b.close()
console.log(failures ? `\n✗ proof:ui FAIL — ${failures} finding(s). Fix the layout, not the threshold.` : '\n✓ proof:ui PASS')
process.exit(failures ? 1 : 0)
