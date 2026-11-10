#!/usr/bin/env node
/**
 * proof-head — the header gate (owner 2026-11-09: «the fucking headers again and again»). Measures the RENDERED head.
 *
 *   npm run proof:head                 every route in docs/HEADERS_2026-11-09.md, 1440 + 390
 *   npm run proof:head -- /captura     one route
 *
 * Fails (exit 1) per route × width when:
 *   NO-HEAD   no `header.ph` (kit/PageHead; PfShell wraps it) is the first content block of the sheet
 *             (only a sticky crumbs row — PageHead `sticky` — may sit before it)
 *   ABOVE     visible text in the sheet above the head
 *   H1        not exactly one h1, or the h1 is not the head's `.ph-finding`
 *   TITLE     an h1/h2 title block (a heading, or a few-line block that opens with one and holds no chart, table,
 *             list or control) between the head and the first content object
 *   EDGE      the head's left edge (h1) differs from the crumbs' left edge by > 1px
 *   SIZE      the h1's font-size differs from PageHead's own `.ph-finding` at that width (a page override)
 *
 * Needs a dev server (PROOF_BASE, default http://127.0.0.1:3009; VITE_API_URL=https://rubli.xyz).
 * Run under git-bash with MSYS_NO_PATHCONV=1.
 */
import { chromium } from 'playwright'

const BASE = process.env.PROOF_BASE ?? 'http://127.0.0.1:3009'
const args = process.argv.slice(2).filter((a) => a.startsWith('/'))
// docs/HEADERS_2026-11-09.md: every live routed page except /administrations, /contracts, /gasto-a-ciegas (own branches)
// and the three sky-first gold pages (/, /mapa, /aria) that keep their Firmamento head pending the owner's call.
const ROUTES = args.length ? args : [
  '/captura', '/sectors/1', '/cases/estafa-maestra', '/aria/caso/2873', '/aria?ver=clasico&vista=lista', '/patterns/P1',
  '/officials/JOEL%20ARREGUIN%20CASILLAS', '/settings', '/no-existe', '/login', '/register',
  '/categories', '/categories/20', '/contracts/2111601', '/arranque', '/cases', '/vendors/2873', '/institutions/251',
  '/institutions', '/datos', '/press', '/methodology', '/acerca', '/privacy', '/terms',
]
const WIDTHS = [1440, 390]

const measure = () => {
  const out = []
  const vis = (el) => { const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0 }
  const sheet = document.querySelector('main .ct') || document.querySelector('main') || document.body
  const ph = sheet.querySelector('header.ph')
  if (!ph) return ['NO-HEAD  no header.ph on the page']
  // first content block: the head's first visible sibling, a sticky crumbs row aside
  const sibs = [...ph.parentElement.children].filter((e) => vis(e) && !e.matches('.ct-dochead.is-sticky, script, style'))
  if (sibs[0] !== ph) out.push(`NO-HEAD  «${(sibs[0].className?.toString() || sibs[0].tagName).slice(0, 40)}» sits before the head`)
  const top = ph.getBoundingClientRect().top
  const crumbs = ph.querySelector('.ct-dochead') || document.querySelector('.ct-dochead.is-sticky')
  for (const el of sheet.querySelectorAll('*')) {
    if (ph.contains(el) || el.closest('.ct-dochead') || !vis(el)) continue
    if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue
    const r = el.getBoundingClientRect()
    // a 1-px visually-hidden table is not ink
    if (r.bottom <= top + 1 && r.height > 2 && !el.closest('.sr-only')) { out.push(`ABOVE    «${el.textContent.trim().slice(0, 40)}» above the head`); break }
  }
  const h1s = [...document.querySelectorAll('main h1, .ct h1')]
  const uniq = [...new Set(h1s)]
  if (uniq.length !== 1) out.push(`H1       ${uniq.length} h1: ${uniq.map((h) => `«${h.textContent.trim().slice(0, 30)}»`).join(' ')}`)
  const h1 = ph.querySelector('h1.ph-finding')
  if (!h1) out.push('H1       the head has no h1.ph-finding')
  // the block right after the head
  const next = sibs[sibs.indexOf(ph) + 1]
  if (next) {
    // a title block: a heading, or an element whose visible children are only headings and short paragraphs
    // (h + subline, the /captura «Un comprador, una empresa» shape), or a wrapper around exactly one such block
    const isTitle = (el, depth = 0) => {
      if (el.matches('h1, h2')) return true
      const kids = [...el.children].filter(vis)
      if (!kids.length) return false
      if (kids.length === 1 && depth < 2) return isTitle(kids[0], depth + 1)
      return kids[0].matches('h1, h2') && kids.length <= 3 && kids.slice(1).every((k) => k.matches('p') && !k.querySelector('svg, canvas, table, button, input'))
    }
    if (isTitle(next) || next.querySelector('h1')) out.push(`TITLE    a title block «${next.textContent.trim().slice(0, 40)}» between the head and the first content`)
  }
  if (h1 && crumbs) {
    const nav = crumbs.querySelector('nav') || crumbs
    const dx = Math.abs(h1.getBoundingClientRect().left - nav.getBoundingClientRect().left)
    if (dx > 1) out.push(`EDGE     h1 left ${Math.round(h1.getBoundingClientRect().left)} vs crumbs ${Math.round(nav.getBoundingClientRect().left)} (Δ ${dx.toFixed(1)}px)`)
  } else if (!crumbs) out.push('EDGE     no crumbs row')
  if (h1) {
    // PageHead's own size at this width: a bare probe outside every page class
    const probe = document.createElement('header'); probe.className = 'ph'
    probe.innerHTML = '<div class="ph-body"><h1 class="ph-finding">x</h1></div>'
    probe.style.cssText = 'position:absolute;left:-9999px;top:0'
    document.body.appendChild(probe)
    const want = getComputedStyle(probe.querySelector('h1')).fontSize
    probe.remove()
    const got = getComputedStyle(h1).fontSize
    if (got !== want) out.push(`SIZE     h1 ${got}, PageHead ${want}`)
  }
  return out
}

const b = await chromium.launch({ channel: 'msedge' })
let failures = 0
for (const route of ROUTES) {
  for (const width of WIDTHS) {
    const p = await b.newPage({ viewport: { width, height: 900 } })
    try {
      await p.goto(`${BASE}${route}`, { waitUntil: 'networkidle', timeout: 90000 })
    } catch (e) { console.log(`✗ ${route} @${width}: could not load (${e.message.split('\n')[0]})`); failures++; await p.close(); continue }
    // the head renders once the page's data is in: wait out the placeholders (≤ 20 s)
    for (let i = 0; i < 8; i++) {
      const busy = await p.evaluate(() => !document.querySelector('header.ph') || document.querySelectorAll('main [aria-busy="true"]').length > 0)
      if (!busy) break
      await p.waitForTimeout(2500)
    }
    const r = await p.evaluate(measure)
    console.log(`${r.length ? '✗' : '✓'} ${route} @${width}${r.length ? '' : ': one head'}`)
    for (const line of r) console.log(`    ${line}`)
    failures += r.length
    await p.close()
  }
}
await b.close()
console.log(failures ? `\n✗ proof:head FAIL — ${failures} finding(s). Use kit/PageHead; never a page's own head.` : '\n✓ proof:head PASS')
process.exit(failures ? 1 : 0)
