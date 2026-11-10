/**
 * Firmamento — Portada centrepiece (owner pick A, 2026-10-15; concept
 * `_ui_v4/concepts/portada/A.html`). The 3,462 institution stars of the Atlas
 * sky, packed so the twelve sector constellations fill the frame; each
 * constellation keeps its true shape (one uniform scale per sector).
 *
 *   radius = log money (starPx) · colour = sector · red ring = the star's share of
 *   money at indicador ≥ 0.40 is at or above its sector's p90 (the sky's halo rule)
 *   L0 constellations fade in sector by sector (600 ms, 70 ms stagger), rings draw once
 *   L1 hover = ink ring + its sector stays lit + one mono line
 *   L2 click = docked card (institution chip, figures, «abrir en El Atlas»)
 *   L3 sector name = camera into that constellation (600 ms in-out), Esc flies back
 *   L5 ?sector= · the search floats over the sky and lights the star it finds
 *
 * Canvas owns the marks; DOM owns the labels (written as transforms in the frame
 * loop, never through React state).
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { forceCollide, forceSimulation, forceX, forceY, type SimulationNodeDatum } from 'd3-force'
import { quadtree, type Quadtree } from 'd3-quadtree'
import { searchApi } from '@/api/client'
import { FieldCard } from '@/components/kit/Field'
import { MoreLine } from '@/components/kit/MoreLine'
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import { MAPA_SECTOR_COLORS, RAMP_INK, RISK_COLORS, SECTORS } from '@/lib/constants'
import { starPx, type SkyManifest } from '@/lib/atlas/sky/geometry'
import { cieloHref } from '@/lib/vista'
import { formatCompactMXN, formatDualCurrency, formatNumber } from '@/lib/utils'

// Vendor / institution names reach tip.innerHTML — escape them (stored-XSS sink).
export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

type Lang = 'en' | 'es'
export interface Star { i: number; id: number; name: string; sig: string; sec: number; wx: number; wy: number; v: number; h: number; nv: number; lit: boolean; x: number; y: number; r: number }

/**
 * Another page's words on the same sky (Focos Rojos «El mapa de la fila», /aria?ver=mapa): the
 * thesis, the hover line (HTML; names through `esc`), the crumb root, and a controlled pick that
 * lives in that page's URL. With `pick` the docked card is the page's own (none is rendered here).
 */
export interface SkyWords {
  /** [h1 = the finding, lede = its base] (DESIGN.md §3.1). */
  claim: (focus: number | null) => [ReactNode, ReactNode]
  tip: (s: Star) => string
  root: string
  pick?: { id: number | null; set: (id: number | null) => void }
  /** The floating search also lists suppliers from the federated search (Portada: yes). */
  vendorSearch?: boolean
  /** Mark radius from the star's value (default starPx: fewer stars may take more room). */
  radius?: (v: number) => number
  /** The canvas's accessible name and the search's label/placeholder (default: institutions). */
  label?: string
  seek?: string
  /** Three plain lines before the sky (qué ves · cómo se lee · qué significa): explanation before data. */
  intro?: ReactNode
  /** Draw a star's ring only once its mark is this many px on screen (a dense sky: the small ones ring on zoom). */
  ringMin?: number
  /** Which stars carry a landmark name: the six highest by this (default: money `v`); with it, phones show them too. */
  rank?: (s: Star) => number
  /** Red only where it is sparing: the focused constellation's rings when zoomed;
   *  (the whole sky: each constellation's most urgent ringed star); every other ring in quiet ink (/aria: a ring = crítico and no case; red = the most urgent). */
  ringQuiet?: boolean
  /** The host page's own «you are here» path (its deeper levels: vendor, contracts); replaces the sector crumb. */
  crumb?: ReactNode
}
interface Pack { stars: Star[]; qt: Quadtree<Star>; secXY: Map<number, { x: number; y: number; top: number; lx: number; ly: number; box: [number, number, number, number] }>; landmarks: Star[] }
interface View { k: number; tx: number; ty: number }

const ORDER = [1, 4, 3, 7, 8, 2, 6, 11, 9, 12, 10, 5]
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
// El Mapa's palette: Salud rose (MAPA_SALUD), so the red ring stays risk's alone (CYAN 2026-11-04)
const sectorOf = (id: number) => { const g = SECTORS.find((s) => s.id === id) ?? SECTORS[SECTORS.length - 1]; return { ...g, color: MAPA_SECTOR_COLORS[g.code] ?? g.color } }

/** Pack the 12 constellations to fill W×H: disc area ≈ 46% of the frame, a collide pass keeps them apart. */
function pack(m: SkyManifest, W: number, H: number, mobile: boolean, reserve: { x: number; y: number; r: number } | null, rOf: (v: number) => number = starPx, rankOf: (s: Star) => number = (s) => s.v): Pack {
  const st = m.stars
  const p90 = new Map(m.sectors.map((s) => [s.id, s.h_p90]))
  const stars: Star[] = st.id.map((id, i) => ({
    i, id, name: st.name[i], sig: st.siglas[i], sec: st.sector[i], wx: st.x[i], wy: st.y[i], v: st.v[i], h: st.h[i], nv: st.nv[i],
    lit: st.h[i] > 0 && st.h[i] >= (p90.get(st.sector[i]) ?? 1), x: 0, y: 0,
    r: mobile ? Math.max(1, Math.min(6, 0.55 * rOf(st.v[i]))) : rOf(st.v[i]),
  }))
  const top = mobile ? 28 : 40
  const ext = new Map(m.sectors.map((s) => {
    let e = 0
    for (const t of stars) if (t.sec === s.id) e = Math.max(e, Math.hypot(t.wx - s.x, t.wy - s.y))
    return [s.id, e || s.r]
  }))
  const area = m.sectors.reduce((a, s) => a + Math.PI * ext.get(s.id)! ** 2, 0)
  const k = Math.sqrt((0.46 * W * (H - top)) / area)
  const xs = m.sectors.map((s) => s.x), ys = m.sectors.map((s) => s.y)
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  type N = SimulationNodeDatum & { id: number; R: number; tx: number; ty: number }
  const nodes: N[] = m.sectors.map((s) => {
    const tx = W * 0.1 + ((s.x - x0) / (x1 - x0 || 1)) * W * 0.8
    const ty = top + (H - top) * (0.1 + ((s.y - y0) / (y1 - y0 || 1)) * 0.8)
    return { id: s.id, R: ext.get(s.id)! * k + 8, tx, ty, x: tx, y: ty }
  })
  if (reserve) nodes.push({ id: -1, R: reserve.r, tx: reserve.x, ty: reserve.y, x: reserve.x, y: reserve.y, fx: reserve.x, fy: reserve.y })
  const clampN = (n: N, pad: number) => {
    n.x = Math.max(n.R + pad, Math.min(W - n.R - pad, n.x!))
    n.y = Math.max(top + n.R + pad, Math.min(H - n.R - pad, n.y!))
  }
  forceSimulation(nodes)
    .force('x', forceX<N>((n) => n.tx).strength(0.04))
    .force('y', forceY<N>((n) => n.ty).strength(0.04))
    .force('c', forceCollide<N>((n) => n.R + 22).iterations(6))
    .force('box', () => { for (const n of nodes) if (n.id > 0) clampN(n, 0) })
    .stop()
    .tick(500)
  const secXY: Pack['secXY'] = new Map()
  for (const n of nodes) {
    if (n.id < 0) continue
    clampN(n, 4)
    const s = m.sectors.find((q) => q.id === n.id)!
    for (const t of stars) if (t.sec === n.id) { t.x = n.x! + (t.wx - s.x) * k; t.y = n.y! + (t.wy - s.y) * k }
    let [bx0, by0, bx1, by1] = [Infinity, Infinity, -Infinity, -Infinity]
    for (const t of stars) if (t.sec === n.id) { bx0 = Math.min(bx0, t.x - t.r); by0 = Math.min(by0, t.y - t.r); bx1 = Math.max(bx1, t.x + t.r); by1 = Math.max(by1, t.y + t.r) }
    secXY.set(n.id, { x: n.x!, y: n.y!, top: by0, lx: n.x!, ly: Math.max(12, by0 - 14), box: [bx0, by0, bx1, by1] })
  }
  // sector names: estimated boxes, nudged up (then down) until none overlap
  const cw = mobile ? 8.4 : 10.4, lh = mobile ? 22 : 26
  const placed: number[][] = []
  for (const [id, c] of [...secXY.entries()].sort((a, b) => a[1].ly - b[1].ly)) {
    const s = SECTORS.find((q) => q.id === id)
    const w = ((s?.name.length ?? 8) + 2) * cw
    c.lx = Math.max(w / 2 + 2, Math.min(W - w / 2 - 2, c.lx))
    const hits = (y: number) => placed.some((b) => !(c.lx + w / 2 < b[0] || c.lx - w / 2 > b[2] || y + lh / 2 < b[1] || y - lh / 2 > b[3]))
    let y = c.ly
    for (let i = 0; i < 12 && hits(y); i++) y = c.ly - (i + 1) * lh
    if (hits(y) || y < 12) { y = c.ly; for (let i = 0; i < 12 && hits(y); i++) y = c.ly + (i + 1) * lh }
    c.ly = y
    placed.push([c.lx - w / 2, y - lh / 2, c.lx + w / 2, y + lh / 2])
  }
  // landmark siglas: the six largest stars that do not collide with each other
  const landmarks: Star[] = []
  const taken: number[][] = []
  for (const s of stars.slice().sort((a, b) => rankOf(b) - rankOf(a)).slice(0, 8)) {
    const b = [s.x + s.r, s.y - 8, s.x + s.r + 70, s.y + 8]
    if (taken.some((t) => !(b[2] < t[0] || b[0] > t[2] || b[3] < t[1] || b[1] > t[3]))) continue
    taken.push(b)
    landmarks.push(s)
    if (landmarks.length === 6) break
  }
  return { stars, qt: quadtree<Star>().x((d) => d.x).y((d) => d.y).addAll(stars), secXY, landmarks }
}

export function Firmamento({ manifest, lang, totalInstitutions, totalValue, totalValueUsd, riskPct, beat, figures, words }: {
  manifest: SkyManifest
  lang: Lang
  words?: SkyWords
  /** The record's buyers (executive summary, = /stats/dashboard/fast). Not the star count: the sky
   *  drops a few buyers with no positive spend and merges canonicals (launch re-audit S9: 3,753 vs 3,745). */
  totalInstitutions: number | null
  /** The record's money (executive summary) and the share at indicador ≥ 0.40, both by money. */
  totalValue: number | null
  /** The same money in US$ at each year's Banxico FIX (headline.total_value_usd). */
  totalValueUsd?: number | null
  riskPct: number | null
  /** Play the load beat (first visit this session). */
  beat: boolean
  /** The figure strip under the sky (rendered by the page). */
  figures: ReactNode
}) {
  const en = lang === 'en'
  const L = (es: string, e: string) => (en ? e : es)
  const [params, setParams] = useSearchParams()
  const focus = (() => { const v = Number(params.get('sector')); return v >= 1 && v <= 12 ? v : null })()
  const ctlPick = words?.pick
  // with a host pick (/aria) a sector change also drops the docked vendor (it belongs to the old constellation)
  // and is a history step (the descent's Back); the Portada's camera stays a replace
  const setFocus = (id: number | null) => setParams((p) => {
    const n = new URLSearchParams(p)
    if (id == null) n.delete('sector'); else n.set('sector', String(id))
    if (ctlPick) { n.delete('v'); n.delete('nivel') }
    return n
  }, { replace: !ctlPick })

  const boxRef = useRef<HTMLDivElement>(null)
  const cvRef = useRef<HTMLCanvasElement>(null)
  const tipRef = useRef<HTMLDivElement>(null)
  const labRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ W: 0, H: 0 })
  const mobile = size.W > 0 && size.W < 640
  const [pickedLocal, setPickedLocal] = useState<Star | null>(null)
  const ctl = words?.pick

  useEffect(() => {
    // the canvas, not the box: on phones the search sits above the canvas inside the box
    const el = cvRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setSize({ W: Math.round(e.contentRect.width), H: Math.round(e.contentRect.height) }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const P = useMemo(
    () => (size.W > 0 ? pack(manifest, size.W, size.H, mobile, mobile ? null : { x: 200, y: 22, r: 170 }, words?.radius, words?.rank) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [manifest, size.W, size.H, mobile],
  )
  // a controlled pick (the host page's URL) or the Portada's own
  const picked = ctl ? (ctl.id != null && P ? P.stars.find((s) => s.id === ctl.id) ?? null : null) : pickedLocal
  const setPicked = (s: Star | null) => { if (ctl) ctl.set(s?.id ?? null); else setPickedLocal(s) }
  const nIn = useMemo(() => {
    const m = new Map<number, number>()
    for (const s of manifest.stars.sector) m.set(s, (m.get(s) ?? 0) + 1)
    return m
  }, [manifest])

  // the frame loop's mutable state (no React state on pointermove or per frame)
  const S = useRef({ hover: null as Star | null, found: null as Star | null, focus: null as number | null, picked: null as Star | null, t0: 0, view: { k: 1, tx: 0, ty: 0 } as View, from: null as View | null, to: null as View | null, vt0: 0, raf: 0, beatDone: !beat })
  const draw = useRef<() => void>(() => {})
  S.current.focus = focus
  S.current.picked = picked

  const viewFor = (sec: number | null): View => {
    if (!P || sec == null) return { k: 1, tx: 0, ty: 0 }
    const [x0, y0, x1, y1] = P.secXY.get(sec)!.box
    const k = Math.min(3, 0.82 * Math.min(size.W / (x1 - x0 || 1), size.H / (y1 - y0 || 1)))
    if (k <= 1.05) return { k: 1, tx: 0, ty: 0 }
    return { k, tx: size.W / 2 - ((x0 + x1) / 2) * k, ty: size.H / 2 - ((y0 + y1) / 2) * k }
  }

  useEffect(() => {
    const cv = cvRef.current
    if (!cv || !P) return
    const dpr = window.devicePixelRatio || 1
    cv.width = size.W * dpr
    cv.height = size.H * dpr
    const ctx = cv.getContext('2d')!
    const st = S.current
    if (!st.t0) st.t0 = performance.now()
    const labs = labRef.current
    draw.current = () => {
      cancelAnimationFrame(st.raf)
      st.raf = requestAnimationFrame(frame)
    }
    const frame = (now: number) => {
      const T = st.beatDone ? 1e9 : now - st.t0
      // camera
      let moving = false
      if (st.to && st.from) {
        const p = Math.min(1, (now - st.vt0) / 600)
        const e = ease(p)
        st.view = { k: st.from.k + (st.to.k - st.from.k) * e, tx: st.from.tx + (st.to.tx - st.from.tx) * e, ty: st.from.ty + (st.to.ty - st.from.ty) * e }
        if (p >= 1) { st.view = st.to; st.from = st.to = null } else moving = true
      }
      const { k, tx, ty } = st.view
      const rk = Math.sqrt(k)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, size.W, size.H)
      const lit = st.hover?.sec ?? null
      const dim = (s: Star) => (st.focus != null && s.sec !== st.focus) || (lit != null && s.sec !== lit)
      let curSec = -1
      for (const s of P.stars) {
        const a0 = Math.min(1, Math.max(0, (T - ORDER.indexOf(s.sec) * 50) / 600))
        if (a0 <= 0) continue
        const e = 1 - Math.pow(1 - a0, 3)
        const base = st.focus === s.sec ? 0.8 : Math.max(0.28, Math.min(0.85, 3.2 / Math.sqrt(nIn.get(s.sec) ?? 1)))
        ctx.globalAlpha = base * e * (dim(s) ? 0.22 : 1)
        if (s.sec !== curSec) { ctx.fillStyle = sectorOf(s.sec).color; curSec = s.sec }
        ctx.beginPath()
        ctx.arc(s.x * k + tx, s.y * k + ty, s.r * rk * (0.6 + 0.4 * e), 0, 7)
        ctx.fill()
      }
      // beat ends by 1.2 s (DESIGN.md §7): 11×50 + 600 = 1150 for the constellations, rings 800→1200
      const ringT = Math.min(1, Math.max(0, (T - 800) / 400))
      if (ringT > 0) {
        // the whole sky: red only on each constellation's most urgent ringed star; zoomed: the focused one's rings
        let named: Set<Star> | null = null
        if (words?.ringQuiet) {
          const rk = words.rank ?? ((t: Star) => t.v)
          const best = new Map<number, Star>()
          for (const t of P.stars) if (t.lit && (!best.has(t.sec) || rk(t) > rk(best.get(t.sec)!))) best.set(t.sec, t)
          named = new Set(best.values())
        }
        const quietInk = named ? RAMP_INK[2] : ''
        ctx.strokeStyle = RISK_COLORS.critical
        ctx.lineWidth = 1
        const ringMin = words?.ringMin ?? 0
        const gap = words?.ringMin != null ? 1.5 : 0  // a paper gap between star and ring: the ring reads on a red (Salud) star too
        // read per frame (cheap), so the night toggle re-inks the gap without a re-pack
        const paper = gap ? getComputedStyle(document.documentElement).getPropertyValue('--color-background').trim() || RAMP_INK[0] : ''
        const isRed = (s: Star) => !named || (st.focus != null ? st.focus === s.sec : named.has(s))
        // quiet rings first, the red ones on top (they overlap at a constellation's centre)
        for (const s of named ? [...P.stars.filter((t) => !isRed(t)), ...P.stars.filter(isRed)] : P.stars) {
          if (!s.lit || s.r * rk < ringMin) continue
          const R = s.r * rk + (size.W < 640 ? 1.2 : 2.5) + gap
          ctx.globalAlpha = (dim(s) ? 0.15 : 0.8) * ringT
          const ink = isRed(s) ? RISK_COLORS.critical : quietInk
          if (gap) {
            ctx.strokeStyle = paper
            ctx.beginPath(); ctx.arc(s.x * k + tx, s.y * k + ty, R - 1.2, 0, 7); ctx.stroke()
          }
          ctx.strokeStyle = ink
          ctx.beginPath()
          ctx.arc(s.x * k + tx, s.y * k + ty, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ringT)
          ctx.stroke()
        }
      }
      ctx.globalAlpha = 1
      for (const s of [st.found, st.hover, st.picked]) {
        if (!s) continue
        ctx.strokeStyle = RAMP_INK[4]
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(s.x * k + tx, s.y * k + ty, s.r * rk + 5, 0, 7)
        ctx.stroke()
      }
      // labels follow the camera as transforms
      if (labs) {
        labs.querySelectorAll<HTMLElement>('[data-sx]').forEach((el) => {
          if (!el.dataset.w) el.dataset.w = String(el.offsetWidth)
          const w = Number(el.dataset.w)
          let x = Number(el.dataset.sx) * k + tx
          // sector names stay whole inside the frame (never clipped at an edge)
          if (!el.dataset.ax) x = Math.max(w / 2 + 2, Math.min(size.W - w / 2 - 2, x))
          else x = Math.max(2, Math.min(size.W - w - 8, x))
          el.style.transform = `translate(${x}px, ${Number(el.dataset.sy) * k + ty}px) translate(${el.dataset.ax ?? '-50%'}, -50%)`
        })
      }
      if (T < 1250 || moving) st.raf = requestAnimationFrame(frame)
      else st.beatDone = true
    }
    st.view = viewFor(st.focus)
    draw.current()
    return () => cancelAnimationFrame(st.raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [P, size, nIn])

  // L3: a sector focus flies the camera (from where it is now)
  useEffect(() => {
    if (!P) return
    const st = S.current
    const to = viewFor(focus)
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) { st.view = to; st.from = st.to = null } else { st.from = { ...st.view }; st.to = to; st.vt0 = performance.now() }
    draw.current()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, P])
  useEffect(() => { draw.current() }, [picked])

  // Esc: dock first, then the camera
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // a controlled pick clears first (the Portada's FieldCard closes itself), then the camera
      if (picked || ctl?.id != null) { if (ctl) ctl.set(null); return }
      if (focus != null) setFocus(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  // a search pick also flies to its sector: the star may be a 2 px dot in an unfocused constellation
  const seek = (st: Star) => { setPicked(st); setFocus(st.sec) }

  const fmtMoney = (v: number) => formatCompactMXN(v)
  const sName = (id: number) => (en ? sectorOf(id).nameEN : sectorOf(id).name)
  const tipLine = words?.tip ?? ((s: Star) => {
    const pct = Math.round(s.h * 100)
    const sig = s.sig && !s.name.startsWith(s.sig) ? `<b>${esc(s.sig)}</b> ` : ''
    const prov = s.nv === 1 ? L('proveedor', 'supplier') : L('proveedores', 'suppliers')
    return `${sig}<b>${esc(s.name)}</b> · ${sName(s.sec)} · ${fmtMoney(s.v)} · ${formatNumber(s.nv)} ${prov} · ${pct}% ${L('del dinero con indicador alto o crítico', 'of the money at high or critical indicator')}`
  })
  const showTip = (s: Star | null) => {
    const tip = tipRef.current
    const st = S.current
    if (st.hover === s) return
    st.hover = s
    draw.current()
    if (!tip) return
    if (!s) { tip.hidden = true; return }
    tip.hidden = false
    tip.innerHTML = tipLine(s)
    const { k, tx, ty } = st.view
    const x = s.x * k + tx, y = s.y * k + ty
    const tw = tip.offsetWidth
    const oy = cvRef.current?.offsetTop ?? 0
    tip.style.transform = `translate(${Math.min(size.W - tw, Math.max(0, x + 14))}px, ${oy + Math.min(size.H - 40, y + 16)}px)`
  }
  const hit = (cx: number, cy: number) => {
    if (!P) return null
    const { k, tx, ty } = S.current.view
    const s = P.qt.find((cx - tx) / k, (cy - ty) / k, 12 / k)
    if (!s) return null
    if (focus != null && s.sec !== focus) return null
    return s
  }

  // the floating search: local stars first (siglas, then name), suppliers from the federated search
  const [q, setQ] = useState('')
  const [term, setTerm] = useState('')
  useEffect(() => { const t = window.setTimeout(() => setTerm(q.trim()), 250); return () => window.clearTimeout(t) }, [q])
  const starHits = useMemo(() => {
    if (!P || term.length < 2) return []
    const f = fold(term)
    const exact = P.stars.filter((s) => s.sig && fold(s.sig) === f)
    const named = P.stars.filter((s) => !exact.includes(s) && (fold(s.name).includes(f) || (s.sig && fold(s.sig).startsWith(f))))
    return [...exact, ...named.sort((a, b) => b.v - a.v)].slice(0, 5)
  }, [P, term])
  const vendorSearch = words?.vendorSearch !== false
  const fed = useQuery({ queryKey: ['search', 'federated', term], queryFn: () => searchApi.federated(term, 3), enabled: vendorSearch && term.length >= 3, placeholderData: keepPreviousData, staleTime: 300_000 })
  useEffect(() => { S.current.found = starHits[0] ?? null; draw.current() }, [starHits])
  const vendors = vendorSearch ? fed.data?.vendors ?? [] : []

  // the thesis: recomputed for a sector focus
  const claim = useMemo(() => {
    if (words) return words.claim(focus)
    if (focus != null) {
      const ss = manifest.stars.sector.map((s, i) => (s === focus ? i : -1)).filter((i) => i >= 0)
      const v = ss.reduce((a, i) => a + manifest.stars.v[i], 0)
      const p90 = manifest.sectors.find((s) => s.id === focus)?.h_p90 ?? 1
      const lit = ss.filter((i) => manifest.stars.h[i] > 0 && manifest.stars.h[i] >= p90).length
      // DESIGN.md §3.1: [h1 = the finding, one-line lede + «más» = its base] — the key figure never folds
      return en
        ? [<><b>{sName(focus)}</b>: <b>{formatNumber(lit)}</b> of <b>{formatNumber(ss.length)}</b> institutions hold the sector's riskiest money.</>, <>Together they spent <b>{fmtMoney(v)}</b>.</>]
        : [<><b>{sName(focus)}</b>: <b>{formatNumber(lit)}</b> de <b>{formatNumber(ss.length)}</b> instituciones concentran el gasto de mayor riesgo del sector.</>, <>En total gastaron <b>{fmtMoney(v)}</b>.</>]
    }
    const n = <b>{totalInstitutions == null ? '—' : formatNumber(totalInstitutions)}</b>
    const money = <b>{totalValue == null ? '—' : formatDualCurrency(totalValue, undefined, totalValueUsd)}</b>
    const pct = <b>{riskPct == null ? '—' : `${Math.round(riskPct)}%`}</b>
    return en
      ? [<>{pct} of the money went to contracts with a high or critical risk indicator.</>, <>{n} institutions spent {money}.</>]
      : [<>El {pct} del dinero fue a contratos con indicador de riesgo alto o crítico.</>, <>{n} instituciones gastaron {money}.</>]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, manifest, totalInstitutions, totalValue, totalValueUsd, riskPct, en, words])

  const pickedSector = picked ? sectorOf(picked.sec) : null

  return (
    <section className="pf" aria-labelledby="pf-claim">
      <div className="pf-head">
        <div key={focus ?? 0} className="kf-claim-line" style={{ animation: 'ct-fade var(--dur-state) var(--ease-out)' }}>
          <h1 id="pf-claim" className="pf-claim">{claim[0]}</h1>
          {/* the key figure is never cut: on a phone the base wraps in full (review 2026-11-02: «10.5 billones M… más») */}
          {/* Focos Rojos (`words`): its «Por qué» line always wraps in full, never «…» (AUDIT 11-07 #8) */}
          {words || (size.W > 0 && size.W < 728) /* ≤ 760 viewport */ ? <p className="ct-lede">{claim[1]}</p> : <MoreLine className="ct-lede">{claim[1]}</MoreLine>}
        </div>
        {words?.crumb !== undefined ? words.crumb : focus != null && (
          <nav className="pf-crumb" style={{ animation: 'ct-rise var(--dur-state) var(--ease-out)' }} aria-label={L('Ruta', 'Path')}>
            <button type="button" onClick={() => setFocus(null)}>{words?.root ?? L('Todo el gasto', 'All spending')}</button>
            <span aria-hidden="true">›</span>
            <b>{sName(focus)}</b>
            <span className="kf-mono">{L('Esc para volver', 'Esc to go back')}</span>
            {/* the zoom is not a dead end (AUDIT_JOURNALIST 11-07 P0): the sector's purchases and its suppliers, preset */}
            <Link className="pf-door" to={`/categories?sector=${focus}`}>{L('Qué compró este sector →', 'What this sector bought →')}</Link>
            <Link className="pf-door" to={`/aria?vista=lista&sector=${focus}`}>{L('Sus proveedores en Focos Rojos →', 'Its suppliers in Red Flags →')}</Link>
          </nav>
        )}
      </div>
      {words?.intro}
      <div
        ref={boxRef}
        className="pf-sky"
        data-object
      >
        <canvas
          ref={cvRef}
          className="pf-cv"
          role="img"
          aria-label={words?.label ?? L(`Panorama de ${manifest.stars.id.length} instituciones en 12 sectores`, `Panorama of ${manifest.stars.id.length} institutions in 12 sectors`)}
          onPointerMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); showTip(hit(e.clientX - r.left, e.clientY - r.top)) }}
          onPointerLeave={() => showTip(null)}
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect()
            const s = hit(e.clientX - r.left, e.clientY - r.top)
            if (s) setPicked(s)
            else if (focus != null) setFocus(null)
          }}
          style={{ cursor: 'pointer' }}
        />
        <div ref={labRef} className="pf-labels">
          {P && SECTORS.map((sec) => {
            const c = P.secXY.get(sec.id)
            if (!c) return null
            return (
              <button
                key={`${sec.id}-${lang}`}
                type="button"
                data-sx={c.lx}
                data-sy={c.ly}
                className={`pf-sec${focus === sec.id ? ' is-on' : ''}${focus != null && focus !== sec.id ? ' is-dim' : ''}`}
                aria-pressed={focus === sec.id}
                onClick={() => setFocus(focus === sec.id ? null : sec.id)}
              >
                <i style={{ background: MAPA_SECTOR_COLORS[sec.code] ?? sec.color }} aria-hidden="true" />{en ? sec.nameEN : sec.name}
              </button>
            )
          })}
          {P && (!mobile || words?.rank) && P.landmarks.map((s) => (
            <span key={s.id} data-sx={s.x + s.r} data-sy={s.y} data-ax="6px" className={`pf-lm${focus != null && focus !== s.sec ? ' is-dim' : ''}`} aria-hidden="true">
              {(() => { const t = s.sig || s.name.split(' ')[0]; return mobile && t.length > 14 ? `${t.slice(0, 13)}…` : t })()}
            </span>
          ))}
        </div>
        <div className="pf-seek" role="search">
          <label htmlFor="pf-q" className="sr-only">{words?.seek ?? L('Buscar institución o proveedor', 'Search an institution or supplier')}</label>
          <input
            id="pf-q"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && starHits[0]) seek(starHits[0]) }}
            placeholder={words?.seek ?? L('Busque institución o proveedor', 'Find an institution or supplier')}
            autoComplete="off"
          />
          {term.length >= 2 && (starHits.length > 0 || vendors.length > 0) && (
            <div className="pf-hits">
              {starHits.map((s) => (
                <button key={s.id} type="button" onClick={() => seek(s)} onMouseEnter={() => { S.current.found = s; draw.current() }}>
                  <i style={{ background: sectorOf(s.sec).color }} aria-hidden="true" />
                  <span><b>{s.sig}</b> {s.name}</span>
                  <span className="kf-mono">{fmtMoney(s.v)}</span>
                </button>
              ))}
              {vendors.length > 0 && <p className="kf-ctl-l">{L('Proveedores', 'Suppliers')}</p>}
              {vendors.map((v) => (
                <EntityIdentityChip key={v.id} type="vendor" id={v.id} name={v.name} size="sm" fullName />
              ))}
            </div>
          )}
        </div>
        <div ref={tipRef} className="pf-tip kf-mono" hidden />
      </div>
      {figures}
      {picked && pickedSector && !ctl && (
        <FieldCard title={en ? pickedSector.nameEN : pickedSector.name} onClose={() => setPicked(null)} lang={lang} focusKey={picked.id}>
          <div className="mt-2"><EntityIdentityChip type="institution" id={picked.id} name={picked.name} size="md" sectorCode={pickedSector.code} fullName /></div>
          <dl className="fw-dl kf-mono mt-3">
            <dt>{L('monto', 'amount')}</dt><dd>{fmtMoney(picked.v)}</dd>
            <dt>{L('proveedores', 'suppliers')}</dt><dd>{formatNumber(picked.nv)}</dd>
            <dt>{L('alto o crítico', 'high or critical')}</dt><dd>{Math.round(picked.h * 100)}% {L('del dinero', 'of the money')}</dd>
          </dl>
          {picked.lit && <p className="ct-note mt-2" style={{ color: RISK_COLORS.critical }}>{L('Anillo rojo: concentra el gasto de mayor riesgo de su sector.', "Red ring: holds its sector's riskiest money.")}</p>}
          <p className="mt-3 flex flex-wrap gap-4 text-[14px]">
            <Link className="ct-link" to={cieloHref({ star: picked.id })}>{L('Ver sus proveedores en El Mapa', 'See its suppliers on El Mapa')}</Link>
          </p>
        </FieldCard>
      )}
    </section>
  )
}

export default Firmamento
