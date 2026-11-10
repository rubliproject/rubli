/**
 * GapAfterBlackout — «Después del apagón» as «El relevo» (owner pick B, 2026-10-20;
 * concept `_ui_v4/concepts/apagon/B.html` + the waffle of A + the lanes of C as layers).
 * Data: GET /gap/entity/{kind}/{id}/relevo — the entity's CompraNet counterparts in the
 * twelve months before the freeze against its ComprasMX open-data contracts after it.
 *
 *   L0  two columns of the same height (antes | después), width of a band = share of that
 *       side's money, ribbons join the SAME counterpart across the seal-red seam; the
 *       computed sentence + the hundred-peso strip. Beat once per session, ≤ 1.2 s.
 *   L1  hover any block / ribbon / label / strip cell / name in the text → that name lights
 *       everywhere, the rest dims; a grain runs its ribbon once (Portada tracer).
 *   L2  click a name → its ribbon morphs in place into the lane of C: one square per week
 *       across the seam, size = money, ink = direct award, blue = competitive; the text
 *       column turns into the record (before → after, CompraNet indicator). ?apagon=<name>
 *   L3  click a week → contract card (CompraNet id → /contracts/:id, else the ComprasMX code).
 *   Esc steps back one level. Reduced motion = final states.
 *
 * The indicator quoted is each counterpart's recorded average (vendor_stats / institution_stats);
 * null prints NO_RISK_LABEL.
 * Body only — each dossier wraps it in its own section primitive (DESIGN.md §5).
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { gapApi } from '@/api/client'
import type { GapRelevoResponse, RelevoPart, RelevoPulse, RelevoSeg } from '@/api/types'
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import { CATEGORICAL, CATEGORICAL_TEXT, NO_RISK_LABEL, RAMP_INK, getRiskLevelFromScore, GAP_LIVE } from '@/lib/constants'
import { formatEntityName } from '@/lib/entity/format'
import { formatCompactMXN, formatNumber } from '@/lib/utils'
import { FoldToggle, useRowFold } from '@/components/contrato/Fold'
import './gap-after.css'

type Lang = 'en' | 'es'
type Kind = GapRelevoResponse['kind']
type Fate = 'stay' | 'rose' | 'back' | 'elsewhere' | 'newname' | 'down' | 'gone' | 'pf' | 'otros'

export function useGapRelevo(kind: Kind, id: number | string | undefined) {
  return useQuery({
    queryKey: ['gap-relevo', kind, id],
    queryFn: () => gapApi.getRelevo(kind, id as number),
    enabled: GAP_LIVE && id != null,
    staleTime: 60 * 60 * 1000,
    retry: false,
  })
}

// palette v2 (DESIGN.md §6.3), by fate — red/amber stay reserved for the risk reading
const FATE_FILL: Record<Fate, string> = {
  stay: CATEGORICAL[0], rose: CATEGORICAL[3], back: CATEGORICAL[5], elsewhere: CATEGORICAL[2],
  newname: CATEGORICAL[1], down: CATEGORICAL[6], gone: RAMP_INK[0], pf: 'url(#rl-hatch)', otros: RAMP_INK[1],
}
const FATE_TEXT: Record<Fate, string> = {
  stay: CATEGORICAL_TEXT[0], rose: CATEGORICAL_TEXT[3], back: CATEGORICAL_TEXT[5], elsewhere: CATEGORICAL_TEXT[2],
  newname: CATEGORICAL_TEXT[1], down: CATEGORICAL_TEXT[6], gone: RAMP_INK[3], pf: CATEGORICAL_TEXT[7], otros: RAMP_INK[3],
}
const FAM_FILL = { here: CATEGORICAL[0], elsewhere: CATEGORICAL[2], newname: CATEGORICAL[1], pf: CATEGORICAL[7] } as const
const FAMS = ['here', 'elsewhere', 'newname', 'pf'] as const
const MONTHS = { es: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'], en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] }
/** «2025-09-28», «2026-10-02» as a reader's date range: «Sep 28, 2025 – Oct 2, 2026» / «28 sep 2025 – 2 oct 2026». */
export function gapRange(from: string, to: string, en: boolean): string {
  const day = (d: string) => {
    const [y, m, dd] = d.trim().split('-')
    const mon = MONTHS[en ? 'en' : 'es'][Number(m) - 1]
    if (!mon) return d.trim()
    return dd ? (en ? `${mon} ${Number(dd)}, ${y}` : `${Number(dd)} ${mon} ${y}`) : `${mon} ${y}`
  }
  return [from, to].filter(Boolean).map(day).join(' – ')
}
const GAP = 2
const BEAT_KEY = 'rubli_beat_apagon'
const easeIO = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

interface Block { key: string; side: 'l' | 'r'; v: number; n: number; k?: number; y: number; h: number; fate: Fate }
/** A ribbon in parameter space (so it can morph into the lane band): left edge x0,y0,h0 → right edge x1,y1,h1. */
interface Shape { x0: number; y0: number; h0: number; x1: number; y1: number; h1: number }
interface Rib extends Shape { key: string; kind: 'stay' | 'down' | 'up'; fate: Fate }

const ribbonD = (s: Shape) => {
  const m = (s.x0 + s.x1) / 2
  return `M${s.x0},${s.y0}C${m},${s.y0} ${m},${s.y1} ${s.x1},${s.y1}L${s.x1},${s.y1 + s.h1}C${m},${s.y1 + s.h1} ${m},${s.y0 + s.h0} ${s.x0},${s.y0 + s.h0}Z`
}
const centreD = (s: Shape) => {
  const m = (s.x0 + s.x1) / 2, a = s.y0 + s.h0 / 2, b = s.y1 + s.h1 / 2
  return `M${s.x0},${a}C${m},${a} ${m},${b} ${s.x1},${b}`
}
const lerpShape = (a: Shape, b: Shape, e: number): Shape => ({
  x0: a.x0 + (b.x0 - a.x0) * e, y0: a.y0 + (b.y0 - a.y0) * e, h0: a.h0 + (b.h0 - a.h0) * e,
  x1: a.x1 + (b.x1 - a.x1) * e, y1: a.y1 + (b.y1 - a.y1) * e, h1: a.h1 + (b.h1 - a.h1) * e,
})
const slug = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

function fateOf(p: RelevoPart | undefined, side: 'l' | 'r', inL: Set<string>, inR: Set<string>): Fate {
  if (!p) return 'otros'
  if (p.key === 'pf') return 'pf'
  if (side === 'l') return inR.has(p.key) ? 'stay' : p.post_n > 0 ? 'down' : 'gone'
  if (inL.has(p.key)) return 'stay'
  if (p.fam === 'newname') return 'newname'
  if (p.fam === 'elsewhere') return 'elsewhere'
  return p.pre_v > 0 ? 'rose' : 'back'
}

function layoutCol(arr: Block[], top: number, H: number) {
  const tot = arr.reduce((s, b) => s + b.v, 0) || 1
  const free = H - GAP * (arr.length - 1)
  let y = top
  for (const b of arr) { b.h = Math.max(2, (free * b.v) / tot); b.y = y; y += b.h + GAP }
}

export function GapAfterBlackout({ data, lang }: { data: GapRelevoResponse | undefined; lang: Lang }) {
  if (!data?.available || !data.post?.n) return null
  return <Relevo d={data} lang={lang} />
}

function Relevo({ d, lang }: { d: GapRelevoResponse; lang: Lang }) {
  const en = lang === 'en'
  const L = (es: string, e: string) => (en ? e : es)
  const cpType = d.cp === 'vendor' ? 'vendor' : 'institution'
  const cpWord = d.cp === 'vendor' ? L('proveedores', 'suppliers') : L('compradores', 'buyers')

  // ── names: full, never truncated (formatEntityName 'full'); siglas appended for buyers
  const nameOf = (k: string): string => {
    if (k === 'otros') return L('Otros', 'Others')
    const p = d.parts[k]
    if (!p || k === 'pf') return L('Personas físicas', 'Natural persons')
    const n = formatEntityName(cpType, p.name ?? '?', 'full')
    return p.siglas && !n.includes(p.siglas) ? `${n} (${p.siglas})` : n
  }
  const money = (v: number, flag?: boolean) => `${formatCompactMXN(v)}${flag ? ' †' : ''}`
  const contracts = (n: number) => `${formatNumber(n)} ${n === 1 ? L('contrato', 'contract') : L('contratos', 'contracts')}`
  const pct = (a: number, b: number) => (b ? Math.round((100 * a) / b) : 0)

  // ── size
  const boxRef = useRef<HTMLDivElement>(null)
  const [W, setW] = useState(0)
  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const phone = W > 0 && W < 600
  const [needH, setNeedH] = useState(0)   // the object grows until its labels fit (never clipped, never overlapped)

  // ── geometry
  const lay = useMemo(() => {
    if (!W) return null
    const inL = new Set(d.left.map((b) => b.key)), inR = new Set(d.right.map((b) => b.key))
    const OH = Math.max(phone ? 300 : 480, needH)   // floor only (phone 300: no labels in the object, the list carries the names); the labels set the height (compaction v2: 700 left ≈ 200px of frame below short lists)
    const NAMEW = phone ? 0 : Math.min(360, Math.floor(W * 0.31))   // wide enough that most names hold one line
    const SW = phone ? 52 : 84
    const TOP = phone ? 70 : 60
    const H = OH - TOP - 10
    const xL = NAMEW, xR = W - NAMEW - SW, mid = (xL + SW + xR) / 2
    const mk = (b: GapRelevoResponse['left'][number], side: 'l' | 'r'): Block => ({
      key: b.key, side, v: b.v, n: b.n, k: b.k, y: 0, h: 0,
      fate: b.key === 'otros' ? 'otros' : fateOf(d.parts[b.key], side, inL, inR),
    })
    const left = d.left.filter((b) => b.v > 0).map((b) => mk(b, 'l'))
    const right = d.right.filter((b) => b.v > 0).map((b) => mk(b, 'r'))
    layoutCol(left, TOP, H); layoutCol(right, TOP, H)
    const BL = new Map(left.map((b) => [b.key, b])), BR = new Map(right.map((b) => [b.key, b]))
    const offL: Record<string, number> = {}, offR: Record<string, number> = {}
    const ribs: Rib[] = []
    for (const r of d.ribbons) {
      const p = d.parts[r.key]
      const l = BL.get(r.from), rr = BR.get(r.to)
      if (!p || !l || !rr) continue
      let y0 = l.y, h0 = l.h, y1 = rr.y, h1 = rr.h
      if (r.kind === 'up') { h0 = Math.max(1.5, (l.h * p.pre_v) / (l.v || 1)); y0 = l.y + (offL[l.key] ?? 0); offL[l.key] = (offL[l.key] ?? 0) + h0 }
      if (r.kind === 'down') { h1 = Math.max(1.5, (rr.h * p.post_v) / (rr.v || 1)); y1 = rr.y + (offR[rr.key] ?? 0); offR[rr.key] = (offR[rr.key] ?? 0) + h1 }
      ribs.push({ key: r.key, kind: r.kind, fate: r.kind === 'stay' ? 'stay' : r.kind === 'down' ? 'down' : fateOf(p, 'r', inL, inR), x0: xL + SW, x1: xR, y0, h0, y1, h1 })
    }
    // the lane band every picked name morphs into (L2)
    const lx0 = phone ? 16 : 24, lx1 = W - 8
    const band = { y: TOP + (phone ? 72 : 110), h: phone ? 72 : 140 }
    const maxDay = Math.max(d.axis.max_day + 7, d.axis.seam_day + 30)
    const xDay = (day: number) => lx0 + (day / maxDay) * (lx1 - lx0)
    return { OH, NAMEW, SW, TOP, H, xL, xR, mid, left, right, BL, BR, ribs, inL, inR, lx0, lx1, band, maxDay, xDay }
  }, [W, phone, d, needH])

  // ── state: hover (L1) · picked (L2) · card (L3)
  const [params, setParams] = useSearchParams()
  const [hot, setHot] = useState<string | null>(null)
  const [picked, setPicked] = useState<string | null>(null)
  const [card, setCard] = useState<RelevoPulse | null>(null)
  const drillable = (k: string | null) => !!k && k !== 'otros' && k !== 'pf' && !!d.parts[k] && !!d.pulses[k]
  const slugOf = (k: string) => slug(nameOf(k))
  const pick = (k: string | null) => {
    if (k && !drillable(k)) return
    setPicked(k); setCard(null); setHot(null)
    setParams((p) => { const n = new URLSearchParams(p); if (k) n.set('apagon', slugOf(k)); else n.delete('apagon'); return n }, { replace: true })
  }

  // ── L0 beat: once per session, when the object enters the view
  // automated captures (navigator.webdriver) never scroll the object into view → they would show the empty frames
  const [beat] = useState(() => { try { return !sessionStorage.getItem(BEAT_KEY) && !reducedMotion() && !navigator.webdriver } catch { return false } })
  const [inView, setInView] = useState(!beat)
  const [settled, setSettled] = useState(!beat)
  useEffect(() => {
    if (!inView || settled) return
    const t = setTimeout(() => setSettled(true), 1400)
    return () => clearTimeout(t)
  }, [inView, settled])
  const delay = (ms: number) => (settled ? undefined : `${ms}ms`)
  useEffect(() => {
    if (inView || !boxRef.current) return
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return
      io.disconnect()
      try { sessionStorage.setItem(BEAT_KEY, '1') } catch { /* private mode: beat replays, harmless */ }
      requestAnimationFrame(() => setInView(true))
    }, { threshold: 0.25 })
    io.observe(boxRef.current)
    return () => io.disconnect()
  }, [inView, lay])

  // deep link ?apagon=<name> — opens after the beat
  const deep = params.get('apagon')
  useEffect(() => {
    if (!deep || picked || !lay) return
    const k = Object.keys(d.parts).find((x) => drillable(x) && slugOf(x) === deep)
    if (!k) return
    const t = setTimeout(() => setPicked(k), beat ? 1300 : 0)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deep, lay])

  // Esc steps back one level; any key skips the beat
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (card) setCard(null)
      else if (picked) pick(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card, picked])

  // ── L2 morph: the picked ribbon (or block) → the lane band, interruptible, from where it is
  const morphRef = useRef<SVGPathElement>(null)
  const cur = useRef<Shape | null>(null)
  const [morphing, setMorphing] = useState<string | null>(null)   // key whose overlay path is on screen
  const sourceOf = (k: string): Shape | null => {
    if (!lay) return null
    const r = lay.ribs.find((x) => x.key === k)
    if (r) return r
    const b = lay.BL.get(k) ?? lay.BR.get(k)
    return b ? { x0: b.side === 'l' ? lay.xL : lay.xR, x1: b.side === 'l' ? lay.xL + lay.SW : lay.xR + lay.SW, y0: b.y, y1: b.y, h0: b.h, h1: b.h } : null
  }
  useLayoutEffect(() => {
    if (!lay) return
    const k = picked ?? morphing
    if (!k) return
    if (picked && morphing !== picked) { setMorphing(picked); cur.current = null }
    const src = sourceOf(k)
    if (!src) return
    const bandShape: Shape = { x0: lay.lx0, x1: lay.lx1, y0: lay.band.y, y1: lay.band.y, h0: lay.band.h, h1: lay.band.h }
    const to = picked ? bandShape : src
    const from = cur.current ?? src
    const el = morphRef.current
    if (reducedMotion()) { cur.current = to; el?.setAttribute('d', ribbonD(to)); if (!picked) setMorphing(null); return }
    const t0 = performance.now()
    const dur = picked ? 600 : 420
    let raf = 0
    const step = (now: number) => {
      const e = easeIO(Math.min(1, (now - t0) / dur))
      const s = lerpShape(from, to, e)
      cur.current = s
      morphRef.current?.setAttribute('d', ribbonD(s))
      if (e < 1) raf = requestAnimationFrame(step)
      else if (!picked) { cur.current = null; setMorphing(null) }
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picked, lay])

  // ── L1 tracer: one grain runs the hovered ribbon left → right (pattern from the retired Portada «Los Cauces»)
  const grainRef = useRef<SVGCircleElement>(null)
  useEffect(() => {
    const dot = grainRef.current
    const r = lay && hot && !picked ? lay.ribs.find((x) => x.key === hot) : null
    if (!dot || !r || reducedMotion()) { dot?.setAttribute('r', '0'); return }
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    path.setAttribute('d', centreD(r))
    const len = path.getTotalLength()
    const t0 = performance.now()
    let raf = 0
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / 700)
      const pt = path.getPointAtLength(easeIO(p) * len)
      dot.setAttribute('cx', String(pt.x)); dot.setAttribute('cy', String(pt.y)); dot.setAttribute('r', p < 1 ? '4' : '0')
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [hot, lay, picked])

  // ── labels: relaxed so they never collide, leader to the block; written as transforms
  const lblRefs = useRef(new Map<string, HTMLDivElement>())
  const [lblY, setLblY] = useState<Map<string, number>>(new Map())
  useLayoutEffect(() => {
    if (!lay || phone) return
    const out = new Map<string, number>()
    let need = 0
    for (const [col, side] of [[lay.left, 'l'], [lay.right, 'r']] as const) {
      const hs = col.map((b) => (lblRefs.current.get(`${side}:${b.key}`)?.offsetHeight ?? 34) + 4)
      need = Math.max(need, hs.reduce((a, h) => a + h, 0) + lay.TOP + 4)
      const ys = col.map((b, j) => b.y + b.h / 2 - hs[j] / 2)
      const last = ys.length - 1
      for (let it = 0; it < 120; it++) {
        for (let j = 1; j <= last; j++) if (ys[j] < ys[j - 1] + hs[j - 1]) ys[j] = ys[j - 1] + hs[j - 1]
        if (ys[last] + hs[last] > lay.OH) ys[last] = lay.OH - hs[last]
        for (let j = last - 1; j >= 0; j--) if (ys[j] + hs[j] > ys[j + 1]) ys[j] = ys[j + 1] - hs[j]
        if (ys[0] < lay.TOP - 6) ys[0] = lay.TOP - 6
      }
      for (let j = 1; j <= last; j++) if (ys[j] < ys[j - 1] + hs[j - 1]) ys[j] = ys[j - 1] + hs[j - 1]
      col.forEach((b, j) => out.set(`${side}:${b.key}`, ys[j]))
    }
    if (need > lay.OH + 1) { setNeedH(Math.ceil(need)); return }
    setLblY(out)
  }, [lay, phone, lang])

  // ── the hundred-peso strip: families in order, the drawn names' own cells first (so a name lights its cells)
  const cells = useMemo(() => {
    const out: Array<{ fam: (typeof FAMS)[number]; key: string | null }> = []
    const right = d.right.filter((b) => b.key !== 'otros' && b.key !== 'pf')
    for (const f of FAMS) {
      let n = d.fam[f].pesos
      if (f === 'pf') { for (; n > 0; n--) out.push({ fam: f, key: 'pf' }); continue }
      for (const b of right) {
        const p = d.parts[b.key]
        if (p?.fam !== f) continue
        let c = Math.min(n, Math.round((100 * p.post_v) / (d.post.v || 1)))
        for (; c > 0; c--, n--) out.push({ fam: f, key: b.key })
      }
      for (; n > 0; n--) out.push({ fam: f, key: null })
    }
    return out
  }, [d])

  // ── claim numeral counts up into its ref (700 ms, tabular)
  const numRef = useRef<HTMLSpanElement>(null)
  const sent = d.sentences[lang]
  const claimNum = sent.claim.find((s): s is { b: string } => typeof s === 'object' && 'b' in s)?.b
  useEffect(() => {
    const el = numRef.current
    const to = Number((claimNum ?? '').replace(/,/g, ''))
    if (!el || !inView || !Number.isFinite(to) || !beat) return
    const t0 = performance.now() + 500
    el.textContent = '0' // the markup keeps the real numeral (readers, text copy, no-scroll visits); only the beat counts up
    let raf = 0
    const step = (now: number) => {
      const k = Math.max(0, Math.min(1, (now - t0) / 700))
      el.textContent = formatNumber(Math.round(to * (1 - Math.pow(1 - k, 3))))
      if (k < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [inView, claimNum, beat])

  // ── segments → JSX (names become identity chips that light the object)
  const chip = (k: string, cls = 'rl-name') => {
    const p = d.parts[k]
    const label = nameOf(k)
    if (!p || p.id == null) return <span data-k={k} className={cls} onMouseEnter={() => setHot(k)} onMouseLeave={() => setHot(null)}>{label}</span>
    return (
      <span data-k={k}>
        <EntityIdentityChip type={cpType} id={p.id} name={p.name} variant="name" className={cls}
          onMouseEnter={() => setHot(k)} onMouseLeave={() => setHot(null)} onFocus={() => setHot(k)} onBlur={() => setHot(null)}>
          {label}
        </EntityIdentityChip>
      </span>
    )
  }
  let claimCounted = false
  const segs = (arr: RelevoSeg[]): ReactNode[] => arr.map((s, i) => {
    if (typeof s === 'string') return <span key={i}>{s}</span>
    if ('b' in s) {
      if (!claimCounted && arr === sent.claim) { claimCounted = true; return <b key={i} className="rl-num" ref={numRef}>{s.b}</b> }
      return <b key={i}>{s.b}</b>
    }
    if ('m' in s) return <span key={i} className="rl-money">{money(s.m, s.f)}</span>
    return <span key={i}>{chip(s.k)}</span>
  })

  const isOn = (k: string) => (picked ? false : !hot || hot === k)
  const dimCls = (k: string) => (isOn(k) ? '' : picked ? ' is-gone' : ' is-dim')

  // ── fates present, for the legend
  const fateWords: Record<Fate, string> = {
    stay: L('siguen entre los 12 mayores', 'still among the 12 biggest'),
    rose: L('subieron desde «otros»', 'rose from «others»'),
    back: d.cp === 'vendor' ? L('vendían aquí, no en los doce meses previos', 'sold here, not in the twelve months before') : L('compraban aquí, no en los doce meses previos', 'bought here, not in the twelve months before'),
    elsewhere: d.cp === 'vendor' ? L('conocidos en CompraNet, nuevos aquí', 'known in CompraNet, new here') : L('compradores nuevos para esta empresa', 'buyers new to this company'),
    newname: L('sin historial en CompraNet', 'no CompraNet history'),
    down: L('bajaron a «otros»', 'fell into «others»'),
    gone: L('sin contratos después', 'no contracts after'),
    pf: L('personas físicas, contadas juntas', 'natural persons, counted together'),
    otros: L('otros', 'others'),
  }
  const present = useMemo(() => {
    if (!lay) return [] as Fate[]
    const s = new Set<Fate>([...lay.left, ...lay.right].map((b) => b.fate))
    return (['stay', 'rose', 'back', 'elsewhere', 'newname', 'down', 'gone', 'pf'] as Fate[]).filter((f) => s.has(f))
  }, [lay])

  const subOf = (b: Block) => {
    if (b.key === 'otros') return `${money(b.v)} · ${formatNumber(b.k ?? 0)} ${cpWord}`
    if (b.key === 'pf') return `${money(b.v)} · ${contracts(b.n)}`
    const p = d.parts[b.key]
    if (b.side === 'l') return `${money(p.pre_v)} · ${contracts(p.pre_n)}${p.post_n === 0 ? L(' · nada después', ' · nothing after') : ''}`
    return `${money(p.post_v, p.flag)} · ${contracts(p.post_n)} · ${pct(p.post_da_n, p.post_n)}% ${L('directa', 'direct')}${p.pre_v > 0 ? '' : L(' · nada antes', ' · none before')}`
  }
  const riskMark = (r: number | null | undefined) => {
    if (r == null) return null
    const lv = getRiskLevelFromScore(r)
    return <span className={`rl-risk rl-risk-${lv}`} title={L('indicador de riesgo promedio', 'average risk indicator')}>{r.toFixed(2)}</span>
  }
  const riskLine = (r: number | null | undefined) => {
    if (r == null) return L(NO_RISK_LABEL.es, NO_RISK_LABEL.en)
    const lv = getRiskLevelFromScore(r)
    const word = { critical: L('crítico', 'critical'), high: L('alto', 'high'), medium: L('medio', 'medium'), low: L('bajo', 'low') }[lv]
    return <>{L('indicador de riesgo promedio', 'average risk indicator')} <span className={`rl-risk rl-risk-${lv}`}>{r.toFixed(2)}</span> <span className="rl-sc">{word}</span></>
  }

  // ── tooltip (L1)
  const tipText = (k: string): ReactNode => {
    if (k === 'otros') return <><b>{L('Otros', 'Others')}</b>{L('antes', 'before')} {money(lay?.BL.get('otros')?.v ?? 0)} · {L('después', 'after')} {money(lay?.BR.get('otros')?.v ?? 0)}</>
    const p = d.parts[k]
    if (!p) return null
    if (k === 'pf') return <><b>{L('Personas físicas', 'Natural persons')}</b>{L('antes', 'before')} {money(p.pre_v)} · {L('después', 'after')} {money(p.post_v)} · {L('contadas juntas', 'counted together')}</>
    return (
      <>
        <b>{nameOf(k)}{p.flag ? ' †' : ''}</b>
        {L('antes', 'before')}: {p.pre_n ? `${money(p.pre_v)} · ${contracts(p.pre_n)}` : L('sin contratos', 'no contracts')}<br />
        {L('después', 'after')}: {p.post_n ? `${money(p.post_v, p.flag)} · ${contracts(p.post_n)} · ${pct(p.post_da_n, p.post_n)}% ${L('directa', 'direct')}` : L('sin contratos', 'no contracts')}<br />
        {p.first_y ? `${L('desde', 'since')} ${p.first_y} · ` : ''}{riskLine(p.risk)}<br />
        <span className="rl-hint">{drillable(k) ? L('clic: su pulso semana a semana', 'click: its week-by-week pulse') : ''}</span>
      </>
    )
  }
  const [tipPos, setTipPos] = useState<{ x: number; y: number } | null>(null)
  const onMove = (e: React.PointerEvent) => {
    const el = (e.target as Element).closest('[data-k]') as HTMLElement | SVGElement | null
    const k = el?.getAttribute('data-k') ?? null
    if (picked) return
    if (k !== hot) setHot(k)
    const o = boxRef.current!.getBoundingClientRect()
    setTipPos(k ? { x: e.clientX - o.left, y: e.clientY - o.top } : null)
  }

  // ── L2 lane
  const lane = picked && lay ? (d.pulses[picked] ?? []) : []
  const laneMax = Math.max(1, ...lane.map((w) => w[2]))
  const sq = (w: RelevoPulse) => (phone ? 4 : 6) + (phone ? 14 : 26) * Math.sqrt(w[2] / laneMax)
  const ticks = useMemo(() => {
    if (!lay) return [] as Array<{ x: number; label: string }>
    const t0 = new Date(`${d.axis.t0}T00:00:00Z`)
    const out: Array<{ x: number; label: string }> = []
    for (let m = 0; m < 40; m++) {
      const dt = new Date(Date.UTC(t0.getUTCFullYear(), t0.getUTCMonth() + 1 + m, 1))
      const day = (dt.getTime() - t0.getTime()) / 864e5
      if (day > lay.maxDay) break
      if (dt.getUTCMonth() % (phone ? 6 : 3) === 0) out.push({ x: lay.xDay(day), label: `${MONTHS[lang][dt.getUTCMonth()]} ${String(dt.getUTCFullYear()).slice(2)}` })
    }
    return out
  }, [lay, d.axis.t0, lang, phone])
  const weekLabel = (w: number) => {
    const dt = new Date(Date.parse(`${d.axis.t0}T00:00:00Z`) + w * 7 * 864e5)
    return dt.toLocaleDateString(en ? 'en-US' : 'es-MX', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
  }
  const pp = picked ? d.parts[picked] : undefined
  const seamX = lay ? (picked ? lay.xDay(d.axis.seam_day) : lay.mid) : 0

  // a click on a name anywhere in the block opens it IN PLACE; inside the record (data-nav) or with a modifier it navigates
  const onClickCapture = (e: React.MouseEvent) => {
    const t = e.target as Element
    const k = t.closest('[data-k]')?.getAttribute('data-k')
    if (!k || !t.closest('a') || t.closest('[data-nav]') || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0 || !drillable(k)) return
    e.preventDefault()
    pick(k)
  }
  // phone list: the post-blackout names, then the ones that left — first 5, the rest open in place (owner 2026-10-21)
  const phoneRows = phone && lay ? [...lay.right.filter((b) => b.key !== 'otros'), ...lay.left.filter((b) => b.fate === 'gone')] : []
  const phoneFold = useRowFold(phoneRows, 5)
  const [sentOpen, setSentOpen] = useState(false) // phone: the first two sentences, the rest open in place
  const rootCls = `rl${inView ? ' is-in' : ''}${beat ? '' : ' is-still'}${hot && !picked ? ' is-hot' : ''}${picked ? ' is-picked' : ''}`
  return (
    <div className={rootCls} onClickCapture={onClickCapture}>
      <div className="rl-grid">
        <div ref={boxRef} className="rl-obj" data-object style={{ height: lay?.OH ?? 700 }} onPointerMove={onMove}
          onPointerLeave={() => { if (!picked) { setHot(null); setTipPos(null) } }}
          onClick={(e) => { const k = (e.target as Element).closest('[data-k]')?.getAttribute('data-k'); if (k && !picked) pick(k) }}>
          {lay && (
            <>
              <svg width={W} height={lay.OH} role="img" aria-label={L('Los mayores ' + cpWord + ' antes y después del apagón, unidos por cintas', 'The biggest ' + cpWord + ' before and after the blackout, joined by ribbons')}>
                <defs>
                  <pattern id="rl-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                    <rect width="6" height="6" fill={RAMP_INK[0]} /><rect width="2.5" height="6" fill={CATEGORICAL[7]} />
                  </pattern>
                </defs>
                {/* reserved geometry: the two column frames sit at their final place before the beat */}
                <rect className="rl-frame" x={lay.xL - 0.5} y={lay.TOP - 0.5} width={lay.SW + 1} height={lay.H + 1} />
                <rect className="rl-frame" x={lay.xR - 0.5} y={lay.TOP - 0.5} width={lay.SW + 1} height={lay.H + 1} />
                {lay.ribs.map((r, i) => (
                  <path key={`r${r.key}`} data-k={r.key} className={`rl-rib${dimCls(r.key)}${hot === r.key ? ' is-on' : ''}`} d={ribbonD(r)}
                    fill={FATE_FILL[r.fate]} style={{ transitionDelay: delay(420 + 22 * i) }} />
                ))}
                <g className="rl-seam" style={{ transform: `translateX(${seamX - lay.mid}px)` }}>
                  <line x1={lay.mid} x2={lay.mid} y1={lay.TOP - 10} y2={picked ? lay.band.y + lay.band.h + 12 : lay.TOP + lay.H} />
                  <text x={lay.mid} y={phone ? lay.TOP + lay.H + 4 : lay.TOP - 16} textAnchor="middle">{L('apagón · 28 sep 2025', 'blackout · 28 Sep 2025')}</text>
                </g>
                {lay.left.map((b, j) => (
                  <g key={`l${b.key}`}>
                    <rect data-k={b.key} className={`rl-blk${dimCls(b.key)}`} x={lay.xL} y={b.y} width={lay.SW} height={b.h}
                      fill={FATE_FILL[b.fate]} stroke={b.fate === 'gone' ? CATEGORICAL[0] : undefined} strokeWidth={b.fate === 'gone' ? 1 : undefined}
                      style={{ transitionDelay: delay(24 * j) }} />
                  </g>
                ))}
                {lay.right.map((b, j) => (
                  <g key={`r${b.key}`}>
                    <rect data-k={b.key} className={`rl-blk${dimCls(b.key)}`} x={lay.xR} y={b.y} width={lay.SW} height={b.h}
                      fill={FATE_FILL[b.fate]} style={{ transitionDelay: delay(560 + 22 * j) }} />
                  </g>
                ))}
                <circle ref={grainRef} r="0" className="rl-grain" />
                {morphing && (
                  <path ref={morphRef} className="rl-morph" fill={FATE_FILL[fateOf(d.parts[morphing], lay.BR.has(morphing) ? 'r' : 'l', lay.inL, lay.inR)]} />
                )}
                {picked && (
                  <g className="rl-lane">
                    <text className="rl-lane-src" x={lay.lx0} y={lay.band.y - 10}>CompraNet</text>
                    <text className="rl-lane-src" x={lay.xDay(d.axis.seam_day) + 6} y={lay.band.y - 10}>ComprasMX</text>
                    <line className="rl-lane-axis" x1={lay.lx0} x2={lay.lx1} y1={lay.band.y + lay.band.h + 8} y2={lay.band.y + lay.band.h + 8} />
                    {ticks.map((t) => (
                      <g key={t.label}>
                        <line className="rl-lane-axis" x1={t.x} x2={t.x} y1={lay.band.y + lay.band.h + 4} y2={lay.band.y + lay.band.h + 12} />
                        <text className="rl-lane-tick" x={t.x} y={lay.band.y + lay.band.h + 28} textAnchor="middle">{t.label}</text>
                      </g>
                    ))}
                    {lane.map((w) => {
                      const s = sq(w)
                      const x = lay.xDay(w[0] * 7 + 3.5)
                      const direct = w[3] * 2 >= w[1]
                      return (
                        <rect key={`${w[0]}-${typeof w[4]}`} className={`rl-sq${card === w ? ' is-card' : ''}`} x={x - s / 2} y={lay.band.y + lay.band.h / 2 - s / 2} width={s} height={s}
                          fill={direct ? CATEGORICAL[0] : CATEGORICAL[1]}
                          style={{ animationDelay: `${380 + Math.round(320 * ((x - lay.lx0) / (lay.lx1 - lay.lx0)))}ms` }}
                          onClick={(e) => { e.stopPropagation(); setCard(w) }}
                          onPointerEnter={(e) => { const o = boxRef.current!.getBoundingClientRect(); setTipPos({ x: e.clientX - o.left, y: e.clientY - o.top }); setHot(`w:${w[0]}:${typeof w[4]}`) }}
                          onPointerLeave={() => { setHot(null); setTipPos(null) }}>
                          <title>{weekLabel(w[0])}</title>
                        </rect>
                      )
                    })}
                  </g>
                )}
              </svg>

              <div className="rl-hdr" style={{ left: 0, width: phone ? W / 2 - 8 : lay.xL + lay.SW, textAlign: phone ? 'left' : 'right' }}>
                <b>{L('Antes', 'Before')}</b>{phone ? <>CompraNet<br />{money(d.pre.v)}</> : <>{L('CompraNet · doce meses', 'CompraNet · twelve months')}<br />{money(d.pre.v)} · {contracts(d.pre.n)}</>}
              </div>
              <div className="rl-hdr" style={{ left: phone ? W / 2 + 8 : lay.xR, width: phone ? W / 2 - 8 : W - lay.xR, textAlign: phone ? 'right' : 'left' }}>
                <b>{L('Después', 'After')}</b>{phone ? <>ComprasMX<br />{money(d.post.v)}</> : <>{L('ComprasMX · contratos federales', 'ComprasMX · federal contracts')}<br />{money(d.post.v)} · {contracts(d.post.n)}</>}
              </div>

              {!phone && ([[lay.left, 'l'], [lay.right, 'r']] as const).map(([col, side]) => col.map((b) => {
                const y = lblY.get(`${side}:${b.key}`)
                const p = d.parts[b.key]
                const cy = b.y + b.h / 2
                return (
                  <div key={`${side}:${b.key}`} ref={(el) => { if (el) lblRefs.current.set(`${side}:${b.key}`, el); else lblRefs.current.delete(`${side}:${b.key}`) }}
                    data-k={b.key} className={`rl-lbl rl-lbl-${side}${b.fate === 'gone' ? ' is-gonename' : ''}${dimCls(b.key)}`}
                    style={{ width: lay.NAMEW - 18, transform: `translate(${side === 'l' ? 0 : lay.xR + lay.SW + 18}px, ${y ?? cy - 17}px)`, opacity: y == null ? 0 : undefined, transitionDelay: delay(side === 'l' ? 120 + 24 * col.indexOf(b) : 640 + 22 * col.indexOf(b)) }}>
                    <span className="rl-lbl-n">
                      {side === 'l' && p && b.key !== 'pf' && riskMark(p.risk)}
                      <span style={{ color: b.fate === 'otros' || b.fate === 'gone' ? undefined : FATE_TEXT[b.fate] }}>
                        {b.key === 'otros' || b.key === 'pf' ? nameOf(b.key) : chip(b.key, 'rl-lbl-chip')}{p?.flag && side === 'r' ? ' †' : ''}
                      </span>
                      {side === 'r' && p && b.key !== 'pf' && riskMark(p.risk)}
                    </span>
                    <span className="rl-lbl-s">{subOf(b)}</span>
                    {y != null && Math.abs(y + 17 - cy) > 8 && (
                      <svg className="rl-ldr" aria-hidden width="18" height="1" style={{ overflow: 'visible', [side === 'l' ? 'right' : 'left']: -18, top: 10 } as React.CSSProperties}>
                        <path d={side === 'l' ? `M0,0 L12,${cy - y - 10} L18,${cy - y - 10}` : `M18,0 L6,${cy - y - 10} L0,${cy - y - 10}`} />
                      </svg>
                    )}
                  </div>
                )
              }))}

              {picked && pp && (
                <div className="rl-lane-head" style={{ transform: `translate(${lay.lx0}px, ${lay.TOP + 4}px)`, width: lay.lx1 - lay.lx0 }}>
                  <span className="rl-sc" style={{ color: FATE_TEXT[fateOf(pp, lay.BR.has(picked) ? 'r' : 'l', lay.inL, lay.inR)] }}>{L('el pulso, semana a semana', 'the pulse, week by week')}</span>
                  <span className="rl-lane-name" data-nav>{chip(picked, 'rl-lane-chip')}</span>
                  <span className="rl-line">{L('cuadro = una semana · tamaño = dinero · ', 'square = one week · size = money · ')}<i className="rl-key" style={{ background: CATEGORICAL[0] }} />{L('adjudicación directa', 'direct award')} <i className="rl-key" style={{ background: CATEGORICAL[1] }} />{L('con concurso', 'competitive')}</span>
                </div>
              )}

              {card && lay && (
                <div className="rl-card" role="dialog" aria-label={L('Contrato de la semana', 'Contract of the week')}
                  style={{ transform: `translate(${Math.max(0, Math.min(W - (phone ? W : 380), lay.xDay(card[0] * 7) - 190))}px, ${lay.band.y + lay.band.h + 44}px)`, width: phone ? W : 380 }}
                  onClick={(e) => e.stopPropagation()}>
                  <div className="rl-card-top">
                    <span className="rl-sc">{L('Semana del', 'Week of')} {weekLabel(card[0])} · {typeof card[4] === 'number' ? 'CompraNet' : 'ComprasMX'}</span>
                    <button type="button" className="rl-back" onClick={() => setCard(null)}>{L('Cerrar', 'Close')}<kbd>Esc</kbd></button>
                  </div>
                  <p className="rl-mono">{contracts(card[1])} · {money(card[2])} · {pct(card[3], card[1])}% {L('directa', 'direct')}</p>
                  <p className="rl-card-k">{card[1] > 1 ? L('El mayor de la semana', 'The week’s biggest') : L('El contrato', 'The contract')} · {card[7]} · <b>{money(card[5], card[5] > 1e10)}</b></p>
                  <p className="rl-card-t">{card[6] || L('Sin título en el registro', 'No title in the registry')}</p>
                  {typeof card[4] === 'number'
                    ? <Link className="rl-link" to={`/contracts/${card[4]}`}>{L('Abrir el contrato', 'Open the contract')} ↗</Link>
                    : <p className="rl-mono">{L('Código ComprasMX', 'ComprasMX code')} {card[4]}</p>}
                </div>
              )}

              {tipPos && hot && !card && (
                <div className="rl-tip" style={{ transform: `translate(${Math.max(0, Math.min(W - 330, tipPos.x + 14))}px, ${tipPos.y + 16}px)` }}>
                  {hot.startsWith('w:') ? (() => {
                    const w = lane.find((x) => `w:${x[0]}:${typeof x[4]}` === hot)
                    return w ? <><b>{L('Semana del', 'Week of')} {weekLabel(w[0])}</b>{contracts(w[1])} · {money(w[2])} · {pct(w[3], w[1])}% {L('directa', 'direct')} · {typeof w[4] === 'number' ? 'CompraNet' : 'ComprasMX'}<br /><span className="rl-hint">{L('clic: el contrato', 'click: the contract')}</span></> : null
                  })() : tipText(hot)}
                </div>
              )}
            </>
          )}
          {!lay && <div className="rl-skel" aria-busy="true" />}
        </div>

        <div className="rl-txt">
          {phone && lay && (
            <ol className="rl-list">
              {phoneFold.shown.map((b, i) => {
                const p = d.parts[b.key]
                return (
                  <li key={`m${b.side}${b.key}`} className={(dimCls(b.key) + phoneFold.rowIn(i)).trim()}>
                    <i className="rl-key" style={{ background: b.fate === 'pf' ? CATEGORICAL[7] : FATE_FILL[b.fate], outline: b.fate === 'gone' ? `1px solid ${CATEGORICAL[0]}` : undefined }} />
                    <span>{b.key === 'pf' ? nameOf('pf') : chip(b.key)}</span>
                    {b.key === 'pf'
                      ? <span className="rl-mono">{money(b.v)}</span>
                      : <button type="button" className="rl-mono rl-rowbtn" aria-label={L(`Ver el pulso de ${nameOf(b.key)}`, `See the pulse of ${nameOf(b.key)}`)} onClick={() => pick(b.key)}>{p.pre_v ? money(p.pre_v) : '—'} → <b>{p.post_n ? money(p.post_v, p.flag) : '—'}</b></button>}
                  </li>
                )
              })}
            </ol>
          )}
          {phone && lay && <FoldToggle open={phoneFold.open} rest={phoneFold.rest} onToggle={phoneFold.toggle} />}
          <p className="rl-claim">{segs(sent.claim)}</p>
          <p className="rl-sent">{sent.body.map((b, i) => <span key={i} className={!sentOpen && sent.body.length > 3 && i >= 2 ? 'ct-phone-cut' : undefined}>{segs(b)} </span>)}</p>
          {sent.body.length > 3 && <div className="ct-phone-only"><FoldToggle open={sentOpen} rest={sent.body.length - 2} onToggle={() => setSentOpen((o) => !o)} /></div>}
          <div className="rl-strip" aria-label={L('De cada 100 pesos después del apagón', 'Of every 100 pesos after the blackout')}>
            <div className="rl-cells">
              {cells.map((c, i) => (
                <i key={i} data-k={c.key ?? undefined} className={`${c.fam === 'pf' ? 'is-hatch' : ''}${c.key && hot && hot !== c.key ? ' is-dim' : ''}${c.key && hot === c.key ? ' is-on' : ''}${c.key ? '' : ' is-tail'}`}
                  style={{ background: c.fam === 'pf' ? undefined : FAM_FILL[c.fam], transitionDelay: delay(600 + 3 * i) }}
                  onPointerEnter={() => c.key && c.key !== 'pf' && setHot(c.key)} onPointerLeave={() => setHot(null)}
                  onClick={() => c.key && pick(c.key)} />
              ))}
            </div>
            <div className="rl-lg">
              <span className="rl-lg-h">{L('De cada 100 pesos después:', 'Of every 100 pesos after:')}</span>
              {FAMS.filter((f) => d.fam[f].pesos > 0).map((f) => (
                <span key={f}><i className={`rl-key${f === 'pf' ? ' is-hatch' : ''}`} style={{ background: f === 'pf' ? undefined : FAM_FILL[f] }} /><b>{d.fam[f].pesos}</b> {{
                  here: d.cp === 'vendor' ? L('a proveedores que ya le vendían', 'to suppliers it already bought from') : L('de compradores que ya le compraban', 'from buyers it already sold to'),
                  elsewhere: fateWords.elsewhere, newname: d.cp === 'vendor' ? L('a nombres sin historial en CompraNet', 'to names with no CompraNet history') : L('de compradores sin identificar', 'from unidentified buyers'),
                  pf: L('a personas físicas', 'to natural persons'),
                }[f]} · {contracts(d.fam[f].n)}</span>
              ))}
            </div>
          </div>
          <div className="rl-legend">
            {present.map((f) => (
              <span key={f}><i className={`rl-key${f === 'pf' ? ' is-hatch' : ''}`} style={{ background: f === 'pf' ? undefined : FATE_FILL[f], outline: f === 'gone' ? `1px solid ${CATEGORICAL[0]}` : undefined }} />{fateWords[f]}</span>
            ))}
          </div>
          <p className="rl-note">
            {L('Las dos columnas miden lo mismo de alto: comparan reparto, no volumen. Una cinta que se ensancha es un nombre que creció. Los dos registros difieren en cobertura. El indicador citado es el promedio registrado de cada nombre, no el de un contrato.',
              'Both columns are the same height: they compare shares, not volume. A ribbon that widens is a name that grew. The two registries differ in coverage. The indicator quoted is each name’s recorded average, not a single contract’s.')}
            {d.post.flagged > 0 && L(` † = contrato mayor a 10,000 MDP, marcado para revisión (${d.post.flagged}).`, ` † = contract above 10,000 M MXN, flagged for review (${d.post.flagged}).`)}
            {' '}<Link to="/gap" className="ct-link">{L('Cómo se lee el apagón', 'How the blackout is read')}</Link>
          </p>

          {pp && picked && (
            <div className="rl-detail" role="region" aria-label={nameOf(picked)}>
              <div className="rl-detail-top">
                <span className="rl-sc" style={{ color: lay ? FATE_TEXT[fateOf(pp, lay.BR.has(picked) ? 'r' : 'l', lay.inL, lay.inR)] : undefined }}>
                  {lay ? fateWords[fateOf(pp, lay.BR.has(picked) ? 'r' : 'l', lay.inL, lay.inR)] : ''}
                </span>
                <button type="button" className="rl-back" onClick={() => pick(null)}>{L('Volver', 'Back')}<kbd>Esc</kbd></button>
              </div>
              <h3 className="rl-detail-h" data-nav>{chip(picked, 'rl-detail-chip')}{pp.flag ? <span className="rl-dagger"> †</span> : null}</h3>
              <p className="rl-line">{pp.first_y
                ? `${L('en CompraNet desde', 'in CompraNet since')} ${pp.first_y} · ${contracts(pp.life_n ?? 0)} ${d.kind === 'category' ? L('en esta categoría', 'in this category') : d.kind === 'vendor' ? L('con esta empresa', 'with this company') : L('con esta institución', 'with this institution')}, 2002–2025`
                : L('sin historial en CompraNet', 'no CompraNet history')}</p>
              <div className="rl-pair">
                {([['pre', L('Antes · 12 meses', 'Before · 12 months'), pp.pre_v, pp.pre_n, d.pre.v, 0], ['post', L('Después', 'After'), pp.post_v, pp.post_n, d.post.v, 270]] as const).map(([k, label, v, n, tot, delay]) => (
                  <div key={k} className="rl-pair-row">
                    <span className="rl-sc">{label}</span>
                    <span className="rl-rule"><i style={{ transform: `scaleX(${v / (Math.max(pp.pre_v, pp.post_v) || 1)})`, animationDelay: `${delay}ms` }} /></span>
                    <span className="rl-mono rl-pair-v"><b>{n ? money(v, k === 'post' && pp.flag) : '—'}</b><br />{contracts(n)} · {pct(v, tot)}% {L('del total', 'of total')}</span>
                  </div>
                ))}
              </div>
              <p className="rl-line">{L('Adjudicación directa, por contratos', 'Direct award, by contracts')}: {pp.pre_n ? `${pct(pp.pre_da_n ?? 0, pp.pre_n)}%` : '—'} → <b>{pp.post_n ? `${pct(pp.post_da_n, pp.post_n)}%` : '—'}</b></p>
              <p className="rl-line">{riskLine(pp.risk)}</p>
              <p className="rl-line rl-hint">{L('Clic en una semana: su contrato mayor. Esc: volver al relevo.', 'Click a week: its biggest contract. Esc: back to the handover.')}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
