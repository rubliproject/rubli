/**
 * «El pulso» — the ONE sticky instrument of «El relevo de 2018»: weekly federal money 2013–2025 on a
 * time axis that a camera moves along, one layer per chapter (concept A, `_ui_v4/concepts/relevo2018/A.html`).
 *
 *   step 0  I-a  zoom 2017–2019 · 2013–17 same-week median draws · circular, July rush, Aug 23–Nov 30 window (red)
 *   step 1  I-b  zoom 2015–2021 · bars dim · one square per institution piles by its own pace at each autumn
 *   step 2  II   zoom 2014–2025 · bars fade · the vendor cohort narrows over twelve months at every cut (teeth)
 *   step 3  III  zoom Oct 2018–Sep 2019 · three distributor lanes, hollow while the tender is open, solid once awarded
 *   step 4  IV   full axis · pulse dim, teeth faint except 2018 and 2024
 *
 * Imperative on purpose: ~9k marks retween on every camera frame (750 ms, interruptible from the current
 * frame), so the engine mutates attributes instead of re-rendering React. Layer reveals are CSS transitions
 * (relevo2018.css), which interrupt natively. Reduced motion → every move lands at its final state.
 */
import { CATEGORICAL, CATEGORICAL_TEXT, SECTORS } from '@/lib/constants'
import { formatCompactMXN } from '@/lib/utils'
import { D, DISTS, ERAS, f0, fmt, pcInt, type Dist, type Lang, type Phase, type RelevoData } from './copy'

export type Pick =
  | { kind: 'week'; i: number }
  | { kind: 'inst'; id: number; y: number }
  | { kind: 'cut'; t: string }
  | { kind: 'block'; d: Dist; p: Phase }

export interface Instrument {
  go(step: number): void
  mark(mk: string | null): void
  resize(): void
  destroy(): void
  /** L0: the pulse rises left → right on the full axis, then `done` (the first chapter arms). */
  beat(done: () => void): void
}

interface Scale { x: (t: number) => number; inv: (px: number) => number; w: (ms: number) => number; dom: [number, number] }
interface Step { dom: [string, string]; pulse: '' | 'dim' | 'off' | 'hide'; layers: string[]; y: 'money' | 'ratio' | 'coh' | 'none' }

export const STEPS: Step[] = [
  { dom: ['2017-01-01', '2019-12-31'], pulse: '', layers: ['env', 'ev'], y: 'money' },
  { dom: ['2015-07-01', '2022-01-01'], pulse: 'off', layers: ['ev', 'inst'], y: 'ratio' },
  { dom: ['2014-01-01', '2025-12-31'], pulse: 'off', layers: ['coh'], y: 'coh' },
  { dom: ['2018-09-15', '2019-09-30'], pulse: 'hide', layers: ['meds'], y: 'none' },
  { dom: ['2013-01-01', '2025-12-31'], pulse: 'dim', layers: ['coh'], y: 'money' },
]
const FULL: [string, string] = ['2013-01-01', '2025-12-31']
const LAYERS = ['env', 'ev', 'inst', 'coh', 'meds']
const DAY = 864e5
const CAP = 20e9
const YEARS_I = [2016, 2017, 2018, 2019, 2021]
const BINS = 21
const CAM_MS = 750
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
const clamp01 = (x: number) => Math.max(0, Math.min(1, x))
const easeIO = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)
const lerp = (a: number, b: number, k: number) => a + (b - a) * k
const addM = (ms: number, m: number) => { const d = new Date(ms); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + m, d.getUTCDate()) }
const isoW = (t: number) => { const d = new Date(t); const day = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - day + 3); const y0 = Date.UTC(d.getUTCFullYear(), 0, 4); return 1 + Math.round(((+d - y0) / DAY - 3 + ((new Date(y0).getUTCDay() + 6) % 7)) / 7) }
const secHex = (id: number) => SECTORS.find((s) => s.id === id)?.color ?? SECTORS[11].color
const secName = (id: number, en: boolean) => { const s = SECTORS.find((x) => x.id === id) ?? SECTORS[11]; return en ? s.nameEN : s.name }

// medicine phases: where each block sits on the time axis (VERIFY.md §5)
const PH: Record<Phase, { x0: string; xm?: string; x1: string; es: string; en: string }> = {
  p1: { x0: '2018-10-12', xm: '2018-12-11', x1: '2019-01-01', es: 'licitación abierta bajo Peña Nieto, fallada el 11–14 dic bajo López Obrador', en: 'tender opened under Peña Nieto, awarded 11–14 Dec under López Obrador' },
  p2: { x0: '2018-10-11', x1: '2019-01-01', es: 'publicada y fallada bajo Peña Nieto (1.9 de licitación, 0.5 de adjudicación directa)', en: 'published and awarded under Peña Nieto (1.9 tender, 0.5 direct award)' },
  p3: { x0: '2018-12-19', x1: '2019-01-01', es: 'adjudicación directa publicada el 19 dic bajo López Obrador', en: 'direct award published 19 Dec under López Obrador' },
  p4: { x0: '2018-12-11', x1: '2019-01-17', es: 'compra consolidada ISSSTE / SEDENA y otros procedimientos publicados en 2019, firmados bajo López Obrador', en: 'ISSSTE / SEDENA consolidated buy and other procedures published in 2019, signed under López Obrador' },
}
export const PHASE_TEXT = PH
const PHASES: Phase[] = ['p1', 'p2', 'p3', 'p4']

export function createInstrument(host: HTMLDivElement, R: RelevoData, lang: Lang, cb: { onMark: (mk: string | null) => void; onPick: (p: Pick) => void }): Instrument {
  const { en, T, dlong, dshort, mon, bn } = fmt(lang)
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const svg = host.querySelector('svg')!
  const tip = host.querySelector<HTMLDivElement>('.rl-tip')!
  let W = 1000, H = 520, X0 = 48, X1 = 984, YT = 44, YB = 472
  const mobile = () => W < 640
  const size = () => {
    const r = host.getBoundingClientRect()
    W = Math.max(320, r.width); H = Math.max(280, r.height)
    X0 = mobile() ? 30 : 48; X1 = W - (mobile() ? 8 : 16); YT = mobile() ? 40 : 46; YB = H - (mobile() ? 40 : 46)
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`)
  }
  size()
  const yOf = (v: number) => YB - (YB - YT) * Math.min(v, CAP) / CAP
  const weeks = R.weeks.map((w) => ({ ...w, t: D(w.w) }))
  // sectors stacked bottom → top by total money (largest at the floor)
  const totals = Array.from({ length: 12 }, (_, k) => weeks.reduce((s, w) => s + (w.s[k] || 0), 0))
  const ORDER = totals.map((v, k) => [v, k] as const).sort((a, b) => b[0] - a[0]).map(([, k]) => k)
  const med: Record<number, number> = {}
  for (let k = 1; k <= 53; k++) { const v = weeks.filter((w) => w.w < '2018' && isoW(w.t) === k).map((w) => w.vx).sort((p, q) => p - q); med[k] = v.length ? v[Math.floor(v.length / 2)] : 0 }

  // ── skeleton (built once; positions are set per frame)
  const eraBand = ERAS.map((e) => `<rect class="rl-eb" data-e="${e.k}" fill="${CATEGORICAL[e.c]}"/><rect class="rl-es" data-e="${e.k}" fill="${CATEGORICAL[e.c]}"/><text class="rl-el" data-e="${e.k}" fill="${CATEGORICAL_TEXT[e.c]}">${e.n}</text>`).join('')
  const sectorPaths = ORDER.map((k) => `<path class="rl-sec" data-k="${k}" style="fill:color-mix(in srgb, ${secHex(k + 1)} 46%, white)"/>`).join('')
  const units: string[] = []
  for (const y of YEARS_I) {
    const bins: [number, number][][] = Array.from({ length: BINS }, () => [])
    for (const [id, r] of R.inst[String(y)].r) bins[Math.min(BINS - 1, Math.floor(r * 10))].push([id, r])
    bins.forEach((bin, bi) => bin.forEach(([id, r], k) => {
      const c = R.inst_names[id]?.c ?? 12
      units.push(`<rect class="rl-unit${r < 0.7 ? ' lo' : ''}" data-id="${id}" data-r="${r}" data-y="${y}" data-bi="${bi}" data-k="${k}" data-mk="inst:${id}" style="--h:${secHex(c)};transition-delay:${Math.min(520, bi * 22 + k * 3)}ms"/>`)
    }))
  }
  const COH = R.surv.filter((s) => s.c_y1 != null && s.t !== '2023-12-01')
  const eraOf = (t: string) => (t >= '2024-10-01' ? 4 : t >= '2018-12-01' ? 3 : 6)
  const lanes = DISTS.map((d) => {
    const ph = R.meds.dist[d.k].phases
    return `<g class="rl-lane" data-d="${d.k}" style="--h:${CATEGORICAL[d.c]};--ht:${CATEGORICAL_TEXT[d.c]}"><text class="rl-lab big" data-nm>${esc(d.n)}</text><text class="rl-lab g" data-tot></text>${PHASES.map((p) => (ph[p] ?? 0) < 0.05 ? '' : p === 'p1'
      ? `<rect class="rl-blk open" data-p="p1" data-d="${d.k}" data-mk="ph:p1"/><rect class="rl-blk solid late" data-p="p1" data-f="1" data-d="${d.k}" data-mk="ph:p1"/>`
      : `<rect class="rl-blk ${p === 'p2' ? 'hatch' : 'solid'}${p === 'p2' ? '' : ' late'}" data-p="${p}" data-d="${d.k}" data-mk="ph:${p}" ${p === 'p2' ? `fill="url(#rl-h-${d.k})"` : ''}/>`).join('')}<line class="rl-run"/></g>`
  }).join('')
  svg.innerHTML = `<defs>
<pattern id="rl-hcp" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="5" fill="var(--color-background)"/><rect width="1.6" height="5" fill="var(--color-ramp-ink-3)"/></pattern>
<pattern id="rl-hl" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="var(--color-background)"/><rect width="2" height="6" fill="var(--color-ramp-ink-2)"/></pattern>
${DISTS.map((d) => `<pattern id="rl-h-${d.k}" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="5" fill="var(--color-background)"/><rect width="2" height="5" fill="${CATEGORICAL[d.c]}"/></pattern>`).join('')}
</defs>
<g id="rl-bands">${eraBand}</g><g id="rl-axis"></g>
<g class="rl-pulse" id="rl-pulse">${sectorPaths}<path class="rl-cp" fill="url(#rl-hcp)"/><path class="rl-brk"/></g>
<rect class="rl-hov" id="rl-hov" width="0" height="0"/>
<g class="rl-layer rl-env" id="rl-env"><path pathLength="1" data-mk="env"/><text class="rl-lab g"></text></g>
<g class="rl-layer rl-ev" id="rl-ev"><rect class="rl-win" data-mk="win"/><line class="rl-winl" data-w="0"/><line class="rl-winl" data-w="1"/>
<g class="rl-evx"><line class="rl-rule" data-e="circ"/><text class="rl-lab" data-e="c1" text-anchor="end"></text><text class="rl-lab g" data-e="c2" text-anchor="end"></text>
<g class="rl-rush" data-mk="rush"><path/><text class="rl-lab" text-anchor="end"></text></g><text class="rl-lab big red" data-e="w1"></text><text class="rl-lab" data-e="w2"></text></g>
<line class="rl-rule ink" data-e="hand"/></g>
<g class="rl-layer rl-inst" id="rl-inst"><g data-wins>${YEARS_I.filter((y) => y !== 2018).map((y) => `<rect class="rl-win2" data-wy="${y}"/>`).join('')}</g><line class="rl-cut" data-c="0.7"/><text class="rl-lab g" data-cl="0.7"></text><line class="rl-cut" data-c="1"/><text class="rl-lab g" data-cl="1"></text>${YEARS_I.map((y) => `<text class="rl-lab sc" data-yl="${y}"></text><text class="rl-lab${y === 2018 ? ' red' : ''}" data-yv="${y}"></text>`).join('')}${units.join('')}</g>
<g class="rl-layer rl-coh" id="rl-coh">${COH.map((s) => `<g data-t="${s.t}" data-mk="cut:${s.t}" style="--h:${CATEGORICAL[eraOf(s.t)]}"><polygon class="lost"/><polygon class="keep"/><text class="rl-lab g" data-l="y"></text><text class="rl-lab" data-l="v"></text></g>`).join('')}</g>
<g class="rl-layer rl-meds" id="rl-meds"><line class="rl-veto" data-mk="veto"/><text class="rl-lab red" data-v="1"></text><text class="rl-lab g" data-v="2"></text><line class="rl-court"/><text class="rl-lab" data-c="1"></text><line class="rl-rule"/><text class="rl-lab g" data-s="1"></text>${lanes}</g>
<g id="rl-ylab"></g>`
  const G = (id: string) => svg.querySelector<SVGGElement>('#rl-' + id)!
  const unitEls = [...G('inst').querySelectorAll<SVGRectElement>('rect.rl-unit')]
  const secEls = [...G('pulse').querySelectorAll<SVGPathElement>('path.rl-sec')]

  // ── camera: domain → x, tweened from the current frame (interruptible)
  let cur: [number, number] = [D(FULL[0]), D(FULL[1])], from = cur, target = cur, t0 = 0, raf = 0
  let step = -1, prev = -1, grow: ((i: number) => number) | null = null
  const sc = (): Scale => { const k = (X1 - X0) / (cur[1] - cur[0]); return { x: (t) => X0 + (t - cur[0]) * k, inv: (px) => cur[0] + (px - X0) / k, w: (ms) => ms * k, dom: cur } }
  const camTo = (d: [number, number]) => {
    cancelAnimationFrame(raf); from = cur; target = d
    if (reduced) { cur = d; render(); return }
    t0 = performance.now()
    const tick = (now: number) => { const p = clamp01((now - t0) / CAM_MS), e = easeIO(p); cur = [lerp(from[0], target[0], e), lerp(from[1], target[1], e)]; render(); if (p < 1) raf = requestAnimationFrame(tick) }
    raf = requestAnimationFrame(tick)
  }

  // ── per-frame drawing
  function render() {
    const s = sc()
    drawBands(s); drawAxis(s); drawPulse(s)
    const st = STEPS[step] ?? null, pv = STEPS[prev] ?? null
    const live = new Set([...(st?.layers ?? []), ...(pv?.layers ?? [])])
    if (live.has('env')) drawEnv(s)
    if (live.has('ev')) drawEv(s)
    if (live.has('inst')) placeInst(s)
    if (live.has('coh')) placeCoh(s)
    if (live.has('meds')) placeMeds(s)
    drawY(st?.y ?? 'money')
    if (hovI >= 0) placeHov(s)
  }
  function drawBands(s: Scale) {
    const [a, b] = s.dom
    for (const e of ERAS) {
      const xa = Math.max(X0, s.x(D(e.t0))), xb = Math.min(X1, s.x(D(e.t1))), on = xb > xa + 1 && D(e.t0) < b && D(e.t1) > a
      const band = G('bands').querySelector(`.rl-eb[data-e="${e.k}"]`)!, strip = G('bands').querySelector(`.rl-es[data-e="${e.k}"]`)!, lab = G('bands').querySelector<SVGTextElement>(`.rl-el[data-e="${e.k}"]`)!
      band.setAttribute('x', String(xa)); band.setAttribute('width', String(on ? xb - xa : 0)); band.setAttribute('y', String(YT - 24)); band.setAttribute('height', String(YB - YT + 24))
      strip.setAttribute('x', String(xa)); strip.setAttribute('width', String(on ? xb - xa : 0)); strip.setAttribute('y', String(YT - 24)); strip.setAttribute('height', '18')
      lab.setAttribute('x', String(xa + 6)); lab.setAttribute('y', String(YT - 11))
      lab.textContent = on && xb - xa > 90 ? (xb - xa > 260 ? `${e.n} · ${T('desde el', 'from')} ${dshort(e.t0)} ${e.t0.slice(0, 4)}` : e.n) : ''
    }
  }
  function drawAxis(s: Scale) {
    const [a, b] = s.dom, span = (b - a) / DAY
    let ax = `<line x1="${X0}" x2="${X1}" y1="${YB}" y2="${YB}" class="rl-ax0"/>`
    const y0 = new Date(a).getUTCFullYear(), y1 = new Date(b).getUTCFullYear()
    const every = mobile() && span > 2500 ? 3 : span > 3200 && W < 1100 ? 2 : 1
    for (let y = y0; y <= y1; y++) {
      const t = Date.UTC(y, 0, 1); if (t < a || t > b) continue
      const x = s.x(t)
      ax += `<line class="rl-yr" x1="${x}" x2="${x}" y1="${YT}" y2="${YB + 4}"/>${(y - 2013) % every === 0 ? `<text class="rl-ax ink" x="${x + 4}" y="${YB + 17}">${y}</text>` : ''}`
      if (span < 1300) for (let m = 1; m < 12; m++) {
        const tm = Date.UTC(y, m, 1); if (tm < a || tm > b) continue
        const xm = s.x(tm)
        ax += `<line class="rl-mo" x1="${xm}" x2="${xm}" y1="${YB}" y2="${YB + 4}"/>${(span < 500 || m % 3 === 0) && !mobile() ? `<text class="rl-ax" x="${xm + 3}" y="${YB + 31}">${mon(m)}</text>` : ''}`
      }
    }
    G('axis').innerHTML = ax
  }
  function drawPulse(s: Scale) {
    const [a, b] = s.dom, wpx = s.w(7 * DAY), gap = wpx > 3 ? 1 : 0, bw = Math.max(0.6, wpx - gap)
    const d: string[] = Array(12).fill(''); let cp = '', brk = ''
    for (let i = 0; i < weeks.length; i++) {
      const w = weeks[i]; if (w.t + 7 * DAY < a || w.t > b) continue
      const x = s.x(w.t), g = grow ? grow(i) : 1
      if (g <= 0) continue
      let cum = 0
      for (const k of ORDER) {
        const v = (w.s[k] || 0) * 1e6 * g; if (v <= 0) continue
        const ya = yOf(cum); cum += v; const yb = yOf(cum)
        if (ya - yb > 0.15) d[k] += `M${x.toFixed(1)},${yb.toFixed(1)}h${bw.toFixed(2)}V${ya.toFixed(1)}h${(-bw).toFixed(2)}Z`
      }
      const c = Math.max(0, w.v - w.vx) * g
      if (c > 0) { const ya = yOf(cum); cum += c; const yb = yOf(cum); if (ya - yb > 0.15) cp += `M${x.toFixed(1)},${yb.toFixed(1)}h${bw.toFixed(2)}V${ya.toFixed(1)}h${(-bw).toFixed(2)}Z` }
      if (cum > CAP) brk += `M${(x - 1).toFixed(1)},${YT + 5}h${(bw + 2).toFixed(2)}v3h${(-bw - 2).toFixed(2)}Z`
    }
    secEls.forEach((p) => p.setAttribute('d', d[+p.dataset.k!]))
    G('pulse').querySelector('.rl-cp')!.setAttribute('d', cp)
    G('pulse').querySelector('.rl-brk')!.setAttribute('d', brk)
  }
  function drawY(kind: Step['y']) {
    let h = ''
    if (kind === 'money') h = `<text class="rl-ax" x="${X0}" y="${YT - 30}">${T('mil millones de pesos por semana · sin CFE ni PEMEX (rayado: con ellas)', 'billion pesos per week · excl. CFE and PEMEX (hatched: with them)')}</text>` + [0, 5, 10, 15, 20].map((v) => `<text class="rl-ax" x="${X0 - 6}" y="${yOf(v * 1e9) + 4}" text-anchor="end">${v}${v === 20 ? '+' : ''}</text>`).join('')
    if (kind === 'ratio') h = `<text class="rl-ax" x="${X0}" y="${YT - 30}">${T('ritmo propio de cada institución en el otoño · 1.0 = su ritmo habitual', 'each institution’s own autumn pace · 1.0 = its usual pace')}</text>` + [[0, '0'], [0.7, '0.7'], [1, '1.0'], [2, '2+']].map(([r, l]) => `<text class="rl-ax" x="${X0 - 6}" y="${ratioY(+r) + 4}" text-anchor="end">${l}</text>`).join('')
    if (kind === 'coh') { const CH = cohH(); h = `<text class="rl-ax" x="${X0}" y="${YT - 30}">${T('de cada 100 proveedores con más de 1 MDP antes del corte, cuántos vuelven a firmar en doce meses', 'of every 100 vendors with more than 1 M MXN before the cut, how many sign again within twelve months')}</text>` + [0, 50, 100].map((v) => `<text class="rl-ax" x="${X0 - 6}" y="${YB - CH * v / 100 + 4}" text-anchor="end">${v}</text>`).join('') }
    if (kind === 'none') h = `<text class="rl-ax" x="${X0}" y="${YT - 30}">${T('alto de cada bloque = mil millones de pesos · contratos firmados del 1 dic 2018 al 10 mar 2019', 'block height = billion pesos · contracts signed 1 Dec 2018 – 10 Mar 2019')}</text>`
    G('ylab').innerHTML = mobile() ? h.replace(/<text class="rl-ax" x="[\d.]+" y="[\d.-]+">[^<]*<\/text>/, '') : h
  }
  // I-a — median, circular, rush, window, handover
  function drawEnv(s: Scale) {
    const [a, b] = s.dom; let d = ''
    for (const w of weeks) { if (w.t + 7 * DAY < a || w.t > b) continue; const x = s.x(w.t), y = yOf(med[isoW(w.t)]); d += (d ? `H${x.toFixed(1)}V${y.toFixed(1)}` : `M${x.toFixed(1)},${y.toFixed(1)}`) + `H${s.x(w.t + 7 * DAY).toFixed(1)}` }
    const g = G('env'); g.querySelector('path')!.setAttribute('d', d)
    const l = g.querySelector('text')!; l.setAttribute('x', String(Math.max(X0 + 4, s.x(D('2017-02-20'))))); l.setAttribute('y', String(yOf(14.5e9))); l.textContent = mobile() ? '' : T('línea: mediana 2013–2017 de la misma semana', 'line: 2013–2017 median of the same week')
  }
  const EV = { circ: '2018-06-29', r0: '2018-07-16', r1: '2018-08-01', w0: '2018-08-23', w1: '2018-12-01' }
  const at = (el: Element | null, o: Record<string, string | number>) => { if (el) for (const k in o) el.setAttribute(k, String(o[k])) }
  function drawEv(s: Scale) {
    const x = (k: keyof typeof EV) => s.x(D(EV[k])), tight = step === 1 || mobile(), g = G('ev')
    const q = (sel: string) => g.querySelector(sel)
    at(q('.rl-win'), { x: x('w0'), y: YT, width: Math.max(0, x('w1') - x('w0')), height: YB - YT })
    at(q('[data-w="0"]'), { x1: x('w0'), x2: x('w0'), y1: YT, y2: YB }); at(q('[data-w="1"]'), { x1: x('w1'), x2: x('w1'), y1: YT, y2: YB })
    at(q('[data-e="hand"]'), { x1: s.x(D('2018-12-01')), x2: s.x(D('2018-12-01')), y1: YT - 24, y2: YB })
    q('.rl-evx')!.classList.toggle('off', tight)
    if (tight) return
    at(q('[data-e="circ"]'), { x1: x('circ'), x2: x('circ'), y1: YT + 132, y2: YB })
    at(q('[data-e="c1"]'), { x: x('circ') - 6, y: YT + 146 }); q('[data-e="c1"]')!.textContent = T('circular de Hacienda · 29 jun', 'Treasury circular · 29 Jun')
    at(q('[data-e="c2"]'), { x: x('circ') - 6, y: YT + 162 }); q('[data-e="c2"]')!.textContent = T('sin nuevas directas desde el 16 jul', 'no new direct awards from 16 Jul')
    at(q('.rl-rush path'), { d: `M${x('r0')},${YT + 214}v-6h${x('r1') - x('r0')}v6` })
    at(q('.rl-rush text'), { x: x('r0') - 4, y: YT + 204 }); q('.rl-rush text')!.textContent = `${T('carrera 16–31 jul', 'rush 16–31 Jul')} · ${f0(R.rush['2018'].n)} ${T('contratos', 'contracts')}`
    const lx = x('w0') + 8, room = X1 - lx > 300, wx = room ? lx : x('w0') - 8, anchor = room ? 'start' : 'end'
    at(q('[data-e="w1"]'), { x: wx, y: YT + 20, 'text-anchor': anchor }); q('[data-e="w1"]')!.textContent = `${T('23 ago – 30 nov', '23 Aug – 30 Nov')} · ${bn(R.freeze['2018'].vx)}`
    at(q('[data-e="w2"]'), { x: wx, y: YT + 38, 'text-anchor': anchor }); q('[data-e="w2"]')!.textContent = `${pcInt(R.freeze['2018'].vx / R.freeze_base.vx)}% ${T('de un año normal, sin CFE ni PEMEX', 'of a normal year, excl. CFE and PEMEX')}`
  }
  // I-b — institutions by own pace, one square each, at every autumn
  const ratioY = (r: number) => YB - (YB - YT - 36) * Math.min(r, 2.0) / 2.0
  function placeInst(s: Scale) {
    const rowH = (YB - YT - 36) / BINS, per = Math.max(2, Math.floor(rowH / 5)), U = Math.min(5, Math.max(3, rowH / per - 1)), gap = 1
    for (const r of unitEls) {
      const y = +r.dataset.y!, x0 = s.x(D(`${y}-08-23`)) + 2, bi = +r.dataset.bi!, k = +r.dataset.k!
      r.setAttribute('x', String(x0 + Math.floor(k / per) * (U + gap))); r.setAttribute('y', String(YB - (bi + 1) * rowH + (per - 1 - (k % per)) * (U + gap) + 1))
      r.setAttribute('width', String(U)); r.setAttribute('height', String(U))
    }
    const g = G('inst')
    for (const r of g.querySelectorAll<SVGRectElement>('[data-wy]')) { const y = r.dataset.wy; at(r, { x: s.x(D(`${y}-08-23`)), y: YT, width: s.x(D(`${y}-12-01`)) - s.x(D(`${y}-08-23`)), height: YB - YT }) }
    for (const y of YEARS_I) {
      const x = s.x(D(`${y}-08-23`)) + 2, d = R.inst[String(y)]
      const l = g.querySelector<SVGTextElement>(`[data-yl="${y}"]`)!, v = g.querySelector<SVGTextElement>(`[data-yv="${y}"]`)!
      const anchor = x > X1 - 150 ? 'end' : 'start', ax = anchor === 'end' ? X1 - 2 : x
      l.setAttribute('x', String(ax)); l.setAttribute('y', String(YT + 14)); l.setAttribute('text-anchor', anchor); l.textContent = `${T('otoño', 'autumn')} ${y}`
      v.setAttribute('x', String(ax)); v.setAttribute('y', String(YT + 30)); v.setAttribute('text-anchor', anchor); v.textContent = mobile() ? `${Math.round(d.n * d.below)}/${d.n}` : `${Math.round(d.n * d.below)} ${T('de', 'of')} ${d.n} ${T('bajo 0.7', 'under 0.7')}`
    }
    for (const c of ['0.7', '1']) {
      const ln = g.querySelector(`line[data-c="${c}"]`)!, tx = g.querySelector<SVGTextElement>(`text[data-cl="${c}"]`)!, yy = ratioY(+c)
      ln.setAttribute('x1', String(X0)); ln.setAttribute('x2', String(X1)); ln.setAttribute('y1', String(yy)); ln.setAttribute('y2', String(yy))
      tx.setAttribute('x', String(X1 - 4)); tx.setAttribute('y', String(yy - 4)); tx.setAttribute('text-anchor', 'end')
      tx.textContent = mobile() ? '' : c === '1' ? T('1.0 · su ritmo habitual', '1.0 · its usual pace') : T('0.7 de su propio ritmo', '0.7 of its own pace')
    }
  }
  // II / IV — the cohort narrows over twelve months at each cut
  const cohH = () => 0.7 * (YB - YT)
  function placeCoh(s: Scale) {
    const CH = cohH()
    for (const g of G('coh').querySelectorAll<SVGGElement>(':scope > g')) {
      const d = COH.find((c) => c.t === g.dataset.t)!, xa = s.x(D(d.t)), xb = s.x(addM(D(d.t), 12)), h1 = CH * (d.c_y1 ?? 0)
      g.querySelector('.keep')!.setAttribute('points', `${xa},${YB - CH} ${xb},${YB - h1} ${xb},${YB} ${xa},${YB}`)
      g.querySelector('.lost')!.setAttribute('points', `${xa},${YB - CH} ${xb},${YB - CH} ${xb},${YB - h1}`)
      const hi = g.classList.contains('hi'), ly = g.querySelector<SVGTextElement>('[data-l="y"]')!, lv = g.querySelector<SVGTextElement>('[data-l="v"]')!
      const room = xb - xa
      ly.setAttribute('x', String(xa + 3)); ly.setAttribute('y', String(YB - CH - 6))
      ly.textContent = room > 120 ? `${T('corte', 'cut')} ${dshort(d.t)} ${d.t.slice(0, 4)}` : room > 40 ? (d.t.startsWith('2024') ? `${mon(9)} 24` : `${mon(11)} ${d.t.slice(2, 4)}`) : ''
      lv.setAttribute('x', String(xb - 4)); lv.setAttribute('y', String(YB - h1 + 18)); lv.setAttribute('text-anchor', 'end')
      lv.textContent = hi && room > 110 ? `${pcInt(d.c_y1!)} ${T('de cada 100', 'of 100')}` : room > 26 ? String(pcInt(d.c_y1!)) : ''
    }
  }
  function setCohHi(ts: string[]) { for (const g of G('coh').querySelectorAll<SVGGElement>(':scope > g')) g.classList.toggle('hi', ts.includes(g.dataset.t!)) }
  // III — the three distributors' lanes
  function placeMeds(s: Scale) {
    const x = (d: string) => s.x(D(d)), gapL = mobile() ? 30 : 40
    const nBlocks = DISTS.reduce((n, d) => n + PHASES.filter((p) => (R.meds.dist[d.k].phases[p] ?? 0) >= 0.05).length, 0)
    const PX_BN = Math.min(10, (YB - YT - 34 - 3 * (gapL + 6) - nBlocks * 2 - 12) / R.meds.total_bn)
    let y = YT + 34
    const g = G('meds')
    for (const d of DISTS) {
      const lane = g.querySelector<SVGGElement>(`.rl-lane[data-d="${d.k}"]`)!, info = R.meds.dist[d.k]
      const nm = lane.querySelector<SVGTextElement>('[data-nm]')!, tot = lane.querySelector<SVGTextElement>('[data-tot]')!
      const lx = Math.max(X0, x('2018-09-20'))
      nm.setAttribute('x', String(lx)); nm.setAttribute('y', String(y - 20)); nm.textContent = mobile() && d.k === 'dimesa' ? 'DIMESA' : d.n
      tot.setAttribute('x', String(lx)); tot.setAttribute('y', String(y - 5))
      tot.textContent = `${bn(info.bn * 1e9)} · IMSS ${info.buyers.IMSS.toFixed(1)} · ISSSTE ${info.buyers.ISSSTE.toFixed(1)} · SEDENA ${(info.buyers.SEDENA ?? 0).toFixed(1)}`
      let yy = y
      for (const p of PHASES) {
        const v = info.phases[p] ?? 0; if (v < 0.05) continue
        const h = Math.max(3, v * PX_BN)
        for (const r of lane.querySelectorAll<SVGRectElement>(`rect[data-p="${p}"]`)) {
          const fill = !!r.dataset.f, ph = PH[p], xa = fill ? x(ph.xm!) : x(ph.x0), xb = p === 'p1' && !fill ? x(ph.xm!) : x(ph.x1)
          r.setAttribute('x', String(xa)); r.setAttribute('width', String(Math.max(2, xb - xa))); r.setAttribute('y', String(yy)); r.setAttribute('height', String(h))
        }
        yy += h + 2
      }
      const run = lane.querySelector('.rl-run')!
      run.setAttribute('x1', String(x('2019-01-01'))); run.setAttribute('x2', String(Math.min(X1, x('2019-12-31')))); run.setAttribute('y1', String(yy + 3)); run.setAttribute('y2', String(yy + 3))
      y = yy + gapL + 6
    }
    const L = (sel: string, d: string, y1: number) => { const l = g.querySelector(sel)!; l.setAttribute('x1', String(x(d))); l.setAttribute('x2', String(x(d))); l.setAttribute('y1', String(y1)); l.setAttribute('y2', String(YB)) }
    L('.rl-veto', '2019-03-20', YT); L('.rl-court', '2019-08-19', YT); L('.rl-rule', '2019-01-01', YT + 8)
    const tx = (sel: string, xx: number, yy: number, txt: string, anchor = 'start') => { const t = g.querySelector<SVGTextElement>(sel)!; t.setAttribute('x', String(xx)); t.setAttribute('y', String(yy)); t.setAttribute('text-anchor', anchor); t.textContent = txt }
    const narrow = mobile()
    tx('[data-v="1"]', x('2019-03-20') + 6, YT + 14, `${T('veto presidencial', 'presidential veto')} · ${narrow ? '' : '20 '}${mon(2)} 2019`)
    tx('[data-v="2"]', x('2019-03-20') + 6, YT + 30, narrow ? '' : T('34.28 mil millones a IMSS e ISSSTE en 2018 · 62.4%', '34.28 bn to IMSS and ISSSTE in 2018 · 62.4%'))
    tx('[data-c="1"]', x('2019-08-19') - 6, YT + 14, narrow ? T('amparo a Grufesa', 'amparo to Grufesa') : `${T('amparo a Grufesa, 573/2019', 'amparo granted to Grufesa, 573/2019')} · 19 ${mon(7)} 2019`, 'end')
    tx('[data-s="1"]', x('2019-01-01') + 6, YB - 8, narrow ? '' : T('contratos arrancan 1 y 17 ene · línea = contrato en curso', 'contracts start 1 and 17 Jan · line = contract running'))
  }

  // ── steps
  function go(i: number) {
    i = Math.max(0, Math.min(STEPS.length - 1, i))
    if (i === step) return
    prev = step; step = i
    const st = STEPS[i]
    G('pulse').setAttribute('class', `rl-pulse ${st.pulse}`)
    for (const k of LAYERS) G(k).classList.toggle('in', st.layers.includes(k))
    setCohHi(i === 4 ? ['2018-12-01', '2024-10-01'] : ['2018-12-01'])
    G('coh').classList.toggle('faint', i === 4)
    hideTip()
    camTo([D(st.dom[0]), D(st.dom[1])])
    render()
  }

  // ── L1 tips + mark linking; L2 picks
  let hovI = -1, curMark: string | null = null
  const showTip = (px: number, py: number, html: string) => {
    tip.innerHTML = html; tip.hidden = false
    const tw = tip.offsetWidth, th = tip.offsetHeight
    tip.style.transform = `translate(${Math.round(Math.min(W - tw - 4, Math.max(4, px + 14)))}px, ${Math.round(Math.max(4, py - th - 12))}px)`
  }
  const hideTip = () => { tip.hidden = true; hovI = -1; G('pulse').classList.remove('hovering'); svg.querySelector('#rl-hov')!.setAttribute('width', '0') }
  function placeHov(s: Scale) {
    const w = weeks[hovI], r = svg.querySelector('#rl-hov')!
    r.setAttribute('x', String(s.x(w.t))); r.setAttribute('width', String(Math.max(2, s.w(7 * DAY)))); r.setAttribute('y', String(YT)); r.setAttribute('height', String(YB - YT))
  }
  const weekTip = (i: number) => {
    const w = weeks[i]
    const top = w.s.map((v, k) => [v, k] as const).filter(([v]) => v > 0).sort((a, b) => b[0] - a[0]).slice(0, 3)
    return `<b>${T('semana del', 'week of')} ${dlong(w.w)}</b>${f0(w.nx)} ${T('contratos', 'contracts')} · ${bn(w.vx)}${w.v - w.vx > 5e7 ? `<br>${T('con CFE y PEMEX', 'with CFE and PEMEX')}: ${bn(w.v)}` : ''}<br>${top.map(([v, k]) => `<i style="--h:${secHex(k + 1)}"></i>${secName(k + 1, en)} ${bn(v * 1e6)}`).join(' · ')}<br><span>${T('mediana 2013–2017 de esa semana', '2013–2017 median for that week')}: ${bn(med[isoW(w.t)])}</span>`
  }
  const weekAt = (px: number) => { const t = sc().inv(px); let lo = 0, hi = weeks.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (weeks[m].t <= t) lo = m; else hi = m - 1 } return t >= weeks[0].t && t < weeks[weeks.length - 1].t + 7 * DAY ? lo : -1 }
  function targetOf(e: PointerEvent): { mk: string | null; html: string | null; pick: Pick | null } {
    const o = host.getBoundingClientRect(), px = e.clientX - o.left, py = e.clientY - o.top, t = e.target as Element
    const st = STEPS[step]
    const unit = t.closest('.rl-inst.in .rl-unit') as SVGRectElement | null
    if (unit) {
      const id = +unit.dataset.id!, y = +unit.dataset.y!, n = R.inst_names[id]
      return { mk: `inst:${id}`, pick: { kind: 'inst', id, y }, html: `<b>${esc(n?.n ?? String(id))}${n?.s && !(n.n ?? '').includes(n.s) ? ` (${esc(n.s)})` : ''}</b>${T('otoño', 'autumn')} ${y} · ${(+unit.dataset.r!).toFixed(2)} ${T('de su propio ritmo', 'of its own pace')}${y === 2018 && n ? `<br>23 ${mon(7)} – 30 ${mon(10)} 2018: ${formatCompactMXN(n.w18)} · ${T('promedio 2013–2017', '2013–2017 average')} ${formatCompactMXN(n.base)}` : ''}<br><span>${T('clic: ficha y contratos', 'click: record and contracts')}</span>` }
    }
    const tooth = t.closest('.rl-coh.in > g') as SVGGElement | null
    if (tooth) {
      const d = COH.find((c) => c.t === tooth.dataset.t)!
      return { mk: `cut:${d.t}`, pick: { kind: 'cut', t: d.t }, html: `<b>${T('corte', 'cut')} ${dlong(d.t)}</b>${f0(d.c_n)} ${T('proveedores con más de 1 MDP en los doce meses previos', 'vendors with more than 1 M MXN in the twelve months before')}<br>${pcInt(d.c_y1!)} ${T('de cada 100 volvieron a firmar en doce meses', 'of every 100 signed again within twelve months')}${d.rfc_y1 != null ? ` · ${T('con RFC de empresa', 'by company tax id')} ${pcInt(d.rfc_y1)}` : ''}${d.c_y2 != null ? `<br>${T('segundo año', 'year two')} ${pcInt(d.c_y2)}${d.t >= '2018' && d.t < '2020' ? ' (' + T('cruza con la pandemia', 'overlaps the pandemic') + ')' : ''}` : ''}${d.t === '2024-10-01' ? `<br><span>${T('solo CompraNet, hasta el 28 sep 2025', 'CompraNet only, to 28 Sep 2025')}</span>` : ''}` }
    }
    const blk = t.closest('.rl-meds.in .rl-blk') as SVGRectElement | null
    if (blk) {
      const k = blk.dataset.d as Dist, p = blk.dataset.p as Phase, nm = DISTS.find((d) => d.k === k)!.n
      return { mk: `ph:${p}`, pick: { kind: 'block', d: k, p }, html: `<b>${esc(nm)}</b>${en ? PH[p].en : PH[p].es}<br>${bn((R.meds.dist[k].phases[p] ?? 0) * 1e9)}<br><span>${T('clic: procedimientos y contratos', 'click: procedures and contracts')}</span>` }
    }
    if (t.closest('.rl-veto')) return { mk: 'veto', pick: null, html: `<b>${T('veto presidencial · 20 de marzo de 2019', 'presidential veto · 20 March 2019')}</b>${T('amparo a Grufesa el 19 de agosto de 2019 (573/2019); Hacienda apeló', 'amparo granted to Grufesa on 19 August 2019 (573/2019); the Treasury appealed')}` }
    if (st && st.pulse !== 'hide' && st.pulse !== 'off' && px >= X0 && px <= X1 && py >= YT && py <= YB) {
      const i = weekAt(px)
      if (i >= 0) { hovI = i; placeHov(sc()); G('pulse').classList.add('hovering'); const inWin = weeks[i].w >= '2018-08-20' && weeks[i].w <= '2018-11-30'; return { mk: inWin && step === 0 ? 'win' : null, pick: { kind: 'week', i }, html: weekTip(i) + `<br><span>${T('clic: los contratos de la semana', 'click: the week’s contracts')}</span>` } }
    }
    return { mk: null, html: null, pick: null }
  }
  const onMove = (e: PointerEvent) => {
    const o = host.getBoundingClientRect()
    if (hovI >= 0) { hovI = -1; svg.querySelector('#rl-hov')!.setAttribute('width', '0'); G('pulse').classList.remove('hovering') }
    const r = targetOf(e)
    if (r.html) showTip(e.clientX - o.left, e.clientY - o.top, r.html); else hideTip()
    if (r.mk !== curMark) cb.onMark(r.mk)
    svg.style.cursor = r.pick ? 'pointer' : ''
  }
  const onLeave = () => { hideTip(); cb.onMark(null) }
  const onClick = (e: PointerEvent) => { const r = targetOf(e); if (r.pick) cb.onPick(r.pick) }
  svg.addEventListener('pointermove', onMove)
  svg.addEventListener('pointerleave', onLeave)
  svg.addEventListener('click', onClick as EventListener)

  function applyMark(mk: string | null) {
    svg.querySelectorAll('.hot').forEach((el) => el.classList.remove('hot'))
    G('inst').classList.remove('focus'); G('coh').classList.remove('focus'); G('meds').classList.remove('focus')
    if (!mk) return
    if (mk === 'cut:placebo') { G('coh').classList.add('focus'); G('coh').querySelectorAll(':scope > g').forEach((g) => { const t = (g as SVGGElement).dataset.t!; if (t !== '2018-12-01' && t !== '2024-10-01') g.classList.add('hot') }); return }
    if (mk === 'pile:2018') { G('inst').classList.add('focus'); unitEls.forEach((u) => { if (u.dataset.y === '2018') u.classList.add('hot') }); return }
    if (mk.startsWith('wk:')) { const i = weeks.findIndex((w) => w.w === mk.slice(3)); if (i >= 0) { hovI = i; placeHov(sc()) } return }
    const els = svg.querySelectorAll(`[data-mk="${mk}"]`)
    els.forEach((el) => el.classList.add('hot'))
    if (mk.startsWith('inst:')) G('inst').classList.add('focus')
    if (mk.startsWith('cut:')) G('coh').classList.add('focus')
    if (mk.startsWith('ph:')) G('meds').classList.add('focus')
  }

  // L0 beat: the thirteen years rise left → right (≤ 1.2 s), then the first chapter arms
  function beat(done: () => void) {
    if (reduced) { done(); return }
    const N = weeks.length, start = performance.now(), DUR = 1150
    grow = (i) => easeOut(clamp01(((performance.now() - start) - (i / N) * 700) / 450))
    const tick = (now: number) => { drawPulse(sc()); if (now - start < DUR) raf = requestAnimationFrame(tick); else { grow = null; render(); done() } }
    raf = requestAnimationFrame(tick)
  }

  render()
  return {
    go,
    mark: (mk) => { curMark = mk; applyMark(mk) },
    resize: () => { size(); render() },
    destroy: () => { cancelAnimationFrame(raf); svg.removeEventListener('pointermove', onMove); svg.removeEventListener('pointerleave', onLeave); svg.removeEventListener('click', onClick as EventListener); svg.innerHTML = '' },
    beat,
  }
}
