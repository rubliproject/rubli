/**
 * Gravedad — /captura «La gravedad» (concept A, owner round 2026-10-21) with «El candado»
 * (concept C's lock strips) as the drilled plate's second lens and B's sentence as the buyer crumb.
 *
 *   one plate per buyer (the 18 largest by money to dominant suppliers, or by % of its money) · one mark per dominant supplier
 *   distance = dependency (rim 80%, centre 100%) · angle = first year with the buyer (12 o'clock 2002, clockwise)
 *   size = money · solid = mostly direct award (2011+ money) · hollow = mostly competed · pale = no award data
 *   ink core = still signing in ComprasMX · ink double ring = documented case (red stays risk-only)
 *   rim arc = the share of the buyer's own money that went to its dominant suppliers (sector hue)
 * L0 arcs sweep, marks fall into orbit · L1 mark ⇄ tip ⇄ named row, plate ⇄ its sentence · L2 mark → dock
 * L3 plate → fills the frame (rings 100/90/80%, 12 named), others become a rail; lens gravedad ⇄ candado
 *    (one strip per company, first → last locked year, a staircase by the year the lock closed, ink in the
 *    ComprasMX column when it still signs) · L4 órbita dependencia ⇄ años · orden dinero ⇄ % · L5 URL + «Citar».
 * Canvas owns the marks; the label layer is written by the engine (never React state per frame).
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { useSearchParams } from 'react-router-dom'
import type { CapturaBuyer, CapturaMeta, CapturaPair } from '@/api/captura'
import { RAMP_INK, SECTORS } from '@/lib/constants'
import { formatEntityName } from '@/lib/entity/format'
import { formatVendorName } from '@/lib/vendor/formatName'
import { formatCompactMXN, formatDualCurrency, formatNumber } from '@/lib/utils'
import { CapturaDock } from './CapturaDock'
import { CAPTURA_TITLE } from '@/lib/captura/title'
import './captura.css'

type Lang = 'en' | 'es'
type Orbita = 'dep' | 'anios'
type Orden = 'dinero' | 'pct'
type Lente = 'gravedad' | 'candado'
interface Strip { a: number; z: number; soft: boolean; i: number; named: boolean; sy: number; sh: number; x0: number; x1: number; ly: number }
interface Plate { b: CapturaBuyer; marks: Mark[]; x: number; y: number; R: number; tx: number; ty: number; tR: number; arc: number; hue: string; rail: boolean; named: Mark[] | null }
interface Mark { p: CapturaPair; ang: number; jr: number; rho: number; rho0: number; rho1: number; r: number; x: number; y: number; pl: Plate; st: Strip | null; lx: number; ly: number }

const Y0 = 2002
const NY = 24
const UNIVERSE = 60
const ease3 = (t: number) => 1 - Math.pow(1 - t, 3)
const ease2 = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const clamp01 = (x: number) => Math.max(0, Math.min(1, x))
const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
const hash01 = (n: number) => { let x = (n * 2654435761) >>> 0; x ^= x >>> 13; x = Math.imul(x, 0x5bd1e995) >>> 0; x ^= x >>> 15; return (x >>> 0) / 4294967296 }
const rSize = (m: number) => Math.max(1.4, Math.min(9, 1.3 + 0.1 * Math.sqrt(m / 1e6)))
const sectorOf = (id: number) => SECTORS.find((s) => s.id === id) ?? SECTORS[SECTORS.length - 1]
const alpha = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}
const pct0 = (x: number) => `${Math.round(100 * x)}%`
const mdp = (v: number, flag?: number) => `${formatCompactMXN(v)}${flag ? ' †' : ''}`

export const buyerFull = (b: CapturaBuyer) => formatEntityName('institution', b.name, 'full')
export const buyerShort = (b: CapturaBuyer) => b.siglas || buyerFull(b)
export const vendorFull = (name: string) => formatVendorName(name, 300)

/** B's sentence: «de cada 100 pesos de X, N fueron a empresas que viven de él». */
export function buyerSentence(b: CapturaBuyer, en: boolean): string {
  const n = Math.round(100 * b.cap_share)
  return en
    ? `Of every 100 pesos ${buyerShort(b)} spent, ${n} went to ${formatNumber(b.n)} companies that live off it.`
    : `De cada 100 pesos de ${buyerShort(b)}, ${n} fueron a ${formatNumber(b.n)} empresas que viven de él.`
}

function tween(dur: number, fn: (t: number) => void, done?: () => void): () => void {
  if (reduced() || dur <= 0) { fn(1); done?.(); return () => {} }
  let stop = false
  const t0 = performance.now()
  const step = (t: number) => {
    if (stop) return
    const k = clamp01((t - t0) / dur)
    fn(k)
    if (k < 1) requestAnimationFrame(step); else done?.()
  }
  requestAnimationFrame(step)
  return () => { stop = true }
}

export function Gravedad({ lang, meta, buyers, pairs }: { lang: Lang; meta: CapturaMeta; buyers: CapturaBuyer[]; pairs: CapturaPair[] }) {
  const en = lang === 'en'
  const L = (es: string, e: string) => (en ? e : es)
  const [params, setParams] = useSearchParams()
  const orbita: Orbita = params.get('orbita') === 'anios' ? 'anios' : 'dep'
  const orden: Orden = params.get('orden') === 'pct' ? 'pct' : 'dinero'
  const comprador = Number(params.get('comprador')) || null
  const lente: Lente = comprador && params.get('lente') === 'candado' ? 'candado' : 'gravedad'
  const proveedor = Number(params.get('proveedor')) || null
  const setP = (kv: Record<string, string | null>) => setParams((p) => {
    const n = new URLSearchParams(p)
    for (const [k, v] of Object.entries(kv)) { if (v == null) n.delete(k); else n.set(k, v) }
    return n
  }, { replace: true })

  const T = meta.totals
  // buyer scope of this plate set (lib/scope.ts); absent = a pre-scope API, every buyer
  const who = { federal: L('federal', 'federal'), local: L('estatal o municipal', 'state or municipal'), all: '' }[meta.scope ?? 'all']
  const whoPl = { federal: L('federales', 'federal'), local: L('estatales y municipales', 'state & municipal'), all: '' }[meta.scope ?? 'all']
  const BUYER = useMemo(() => new Map(buyers.map((b) => [b.institution_id, b])), [buyers])
  const BY_I = useMemo(() => {
    const m = new Map<number, CapturaPair[]>()
    for (const p of pairs) { const l = m.get(p.institution_id); if (l) l.push(p); else m.set(p.institution_id, [p]) }
    return m
  }, [pairs])
  const picked = useMemo(() => (proveedor ? pairs.find((p) => p.vendor_id === proveedor) ?? null : null), [pairs, proveedor])
  const openB = comprador ? BUYER.get(comprador) ?? null : null

  const boxRef = useRef<HTMLDivElement>(null)
  const cvRef = useRef<HTMLCanvasElement>(null)
  const labRef = useRef<HTMLDivElement>(null)
  const tipRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ W: 0, H: 0 })
  const [hoverB, setHoverB] = useState<CapturaBuyer | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const mobile = size.W > 0 && size.W < 640

  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setSize({ W: Math.round(e.contentRect.width), H: Math.round(e.contentRect.height) }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // ── the engine: plates and marks are built once and survive every layout (object constancy)
  const E = useRef<{
    PL: Map<number, Plate>; shown: CapturaBuyer[]; open: number | null; c: number; orbita: Orbita; orden: Orden
    hoverM: Mark | null; hoverP: Plate | null; picked: number | null; dirty: boolean; settled: boolean
    stopMove: () => void; stopRho: () => void; stopC: () => void; W: number; H: number; mobile: boolean; bg: string
    layout: () => void; labels: () => void
  } | null>(null)

  const pickShown = (o: Orden, keep: number | null) => {
    const U = buyers.slice(0, UNIVERSE)
    const n = mobile ? 10 : size.W >= 1300 ? 18 : size.W >= 1000 ? 15 : 12
    const s = U.slice().sort(o === 'pct' ? (a, b) => b.cap_share - a.cap_share : (a, b) => b.cap - a.cap).slice(0, n)
    if (keep && !s.some((b) => b.institution_id === keep) && BUYER.has(keep)) s[s.length - 1] = BUYER.get(keep)!
    return s
  }

  useEffect(() => {
    const cv = cvRef.current, lab = labRef.current
    if (!cv || !lab || size.W === 0) return
    const { W, H } = size
    const dpr = window.devicePixelRatio || 1
    cv.width = W * dpr; cv.height = H * dpr
    const ctx = cv.getContext('2d')!
    const prev = E.current
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--color-background').trim() || RAMP_INK[0]
    const PL: Map<number, Plate> = prev?.PL ?? new Map()
    if (!prev) {
      for (const b of buyers.slice(0, UNIVERSE).concat(comprador && BUYER.has(comprador) ? [BUYER.get(comprador)!] : [])) {
        if (PL.has(b.institution_id)) continue
        const pl: Plate = { b, marks: [], x: 0, y: 0, R: 0, tx: 0, ty: 0, tR: 0, arc: 0, hue: sectorOf(b.sector_id).color, rail: false, named: null }
        pl.marks = (BY_I.get(b.institution_id) ?? []).slice().sort((a, c) => a.m - c.m).map((p) => ({
          p, pl, ang: -Math.PI / 2 + (2 * Math.PI * (p.y0 - Y0 + 0.5 + (hash01(p.vendor_id) - 0.5) * 0.9)) / NY,
          jr: (hash01(p.vendor_id * 7 + 1) - 0.5) * 0.04, rho: 1.12, rho0: 1.12, rho1: 1, r: rSize(p.m), x: 0, y: 0, st: null, lx: 0, ly: 0,
        }))
        PL.set(b.institution_id, pl)
      }
    }
    const S = prev ?? {
      PL, shown: pickShown(orden, comprador), open: null, c: 0, orbita, orden, hoverM: null, hoverP: null, picked: null,
      dirty: true, settled: false, stopMove: () => {}, stopRho: () => {}, stopC: () => {}, W, H, mobile, bg, layout: () => {}, labels: () => {},
    }
    S.W = W; S.H = H; S.mobile = mobile; S.bg = bg
    if (prev) S.shown = pickShown(S.orden, S.open)
    E.current = S

    const COLS = mobile ? 2 : W >= 1300 ? 6 : W >= 1000 ? 5 : 4
    const rhoFor = (m: Mark) => (S.orbita === 'dep'
      ? lerp(0.2, 0.97, (1 - m.p.sh) / (1 - meta.def.share))
      : lerp(0.97, 0.2, clamp01((m.p.ny - meta.def.min_years) / 17))) + m.jr
    // candado frame (inside the drilled plate's area)
    const RAILW = mobile ? 0 : 150
    const LX = mobile ? 8 : RAILW + 250
    const POSTW = mobile ? 30 : 52
    const SEAM = mobile ? 12 : 20
    const plotR = W - POSTW - SEAM
    const xYear = (y: number) => LX + ((plotR - LX) * (y - Y0)) / (NY - 1)
    const half = (plotR - LX) / (NY - 1) / 2

    const targets = () => {
      const big = S.open ? PL.get(S.open) ?? null : null
      if (!big) {
        const rows = Math.ceil(S.shown.length / COLS), cw = W / COLS, ch = H / rows
        const R = Math.max(34, Math.min(cw - 12, ch - 60) / 2 - 6)
        S.shown.forEach((b, k) => { const pl = PL.get(b.institution_id)!; pl.tx = (k % COLS + 0.5) * cw; pl.ty = Math.floor(k / COLS) * ch + 28 + R; pl.tR = R })
        return
      }
      const others = S.shown.filter((b) => b.institution_id !== S.open)
      const step = (H - 40) / Math.max(1, others.length - 1)
      others.forEach((b, k) => { const pl = PL.get(b.institution_id)!; pl.tx = mobile ? -40 : 22; pl.ty = 20 + k * step; pl.tR = mobile ? 0 : 12 })
      if (mobile) { big.tR = W / 2 - 26; big.tx = W / 2; big.ty = 52 + big.tR }
      else { big.tR = Math.min(H / 2 - 40, (W - RAILW - 560) / 2); big.tx = RAILW + (W - RAILW) / 2; big.ty = H / 2 + 8 }
    }
    const strips = (pl: Plate) => {
      if (!pl.marks[0]?.st) {
        const L = pl.marks.map((m) => ({ m, a: m.p.lock0 ?? m.p.y0, z: m.p.lock1 ?? m.p.y1, soft: m.p.lock0 == null }))
          .sort((x, y) => x.a - y.a || x.z - y.z || y.m.p.m - x.m.p.m)
        const top = new Set(pl.marks.slice().sort((a, b) => b.p.m - a.p.m).slice(0, mobile ? 0 : 11).map((m) => m.p.vendor_id))
        L.forEach((s, i) => { s.m.st = { a: s.a, z: s.z, soft: s.soft, i, named: top.has(s.m.p.vendor_id), sy: 0, sh: 0, x0: 0, x1: 0, ly: 0 } })
      }
      const n = pl.marks.length, top = 34, inner = H - top - 30, pitch = inner / Math.max(1, n), th = Math.max(1, Math.min(10, pitch * 0.85))
      for (const m of pl.marks) {
        const s = m.st!
        s.sy = top + s.i * pitch; s.sh = s.named ? Math.max(th, 5) : th
        s.x0 = xYear(s.a) - half * 0.9; s.x1 = xYear(s.z) + half * 0.9
      }
      return pitch
    }
    const place = () => {
      for (const b of S.shown) {
        const pl = PL.get(b.institution_id)!
        const big = pl.b.institution_id === S.open
        for (const m of pl.marks) {
          const ox = pl.x + Math.cos(m.ang) * m.rho * pl.R, oy = pl.y + Math.sin(m.ang) * m.rho * pl.R
          if (big && S.c > 0 && m.st) { const e = ease2(S.c); m.x = lerp(ox, m.st.x0, e); m.y = lerp(oy, m.st.sy + m.st.sh / 2, e) } else { m.x = ox; m.y = oy }
        }
      }
    }
    let qt: { m: Mark; x: number; y: number }[] = []
    const rebuildHit = () => { qt = []; for (const b of S.shown) { const pl = PL.get(b.institution_id)!; if (!pl.rail) for (const m of pl.marks) qt.push({ m, x: m.x, y: m.y }) } }

    // ── labels (DOM; rebuilt on layout changes only)
    S.labels = () => {
      const big = S.open ? PL.get(S.open) ?? null : null
      let h = ''
      for (const b of S.shown) {
        const pl = PL.get(b.institution_id)!
        if (pl === big) continue
        const nm = esc(buyerShort(b)), full = esc(buyerFull(b))
        if (pl.rail) {
          if (!mobile) h += `<button type="button" class="cg-nm is-rail" data-b="${b.institution_id}" title="${full}" style="transform:translate(${(pl.x + pl.R + 8).toFixed(0)}px,${pl.y.toFixed(0)}px) translate(0,-50%)">${nm}</button>`
          continue
        }
        h += `<button type="button" class="cg-nm" data-b="${b.institution_id}" title="${full}" aria-label="${esc(buyerSentence(b, en))}" style="transform:translate(${pl.x.toFixed(0)}px,${(pl.y - pl.R - 6).toFixed(0)}px) translate(-50%,-100%);max-width:${Math.round(W / COLS - 12)}px">${nm}</button>`
        h += `<span class="cg-fg" data-b="${b.institution_id}" style="transform:translate(${pl.x.toFixed(0)}px,${(pl.y + pl.R + 6).toFixed(0)}px) translate(-50%,0)"><b>${pct0(b.cap_share)}</b> · ${esc(formatCompactMXN(b.cap))}</span>`
      }
      if (big) {
        const { x: cx, y: cy, R } = big
        big.named = null
        if (S.c < 0.5) {
          const rings: [number, string][] = S.orbita === 'dep' ? [[0.2, '100%'], [0.585, '90%'], [0.97, '80%']] : [[0.2, L('20 años', '20 yrs')], [0.585, '11'], [0.97, '3']]
          for (const [rr, t] of rings) h += `<span class="cg-rg" style="transform:translate(${(cx - rr * R * 0.7071).toFixed(0)}px,${(cy + rr * R * 0.7071).toFixed(0)}px) translate(-50%,-50%)">${t}</span>`
          for (const y of [2002, 2006, 2010, 2014, 2018, 2022]) {
            const a = -Math.PI / 2 + (2 * Math.PI * (y - Y0 + 0.5)) / NY
            h += `<span class="cg-rg" style="transform:translate(${(cx + Math.cos(a) * (R + 16)).toFixed(0)}px,${(cy + Math.sin(a) * (R + 16)).toFixed(0)}px) translate(-50%,-50%)">${y}</span>`
          }
          const top = big.marks.slice().sort((a, b) => b.p.m - a.p.m).slice(0, mobile ? 6 : 12)
          if (mobile) {
            top.forEach((m, k) => { m.lx = 8; m.ly = cy + R + 34 + k * 46; h += vlab(m, 'r', 8, m.ly) })
          } else {
            const sides: Record<'l' | 'r', Mark[]> = { l: [], r: [] }
            for (const m of top) sides[Math.cos(m.ang) >= 0 ? 'r' : 'l'].push(m)
            for (const s of ['l', 'r'] as const) {
              const Ls = sides[s].sort((a, b) => Math.sin(a.ang) - Math.sin(b.ang))
              const GAP = Math.min(66, (H - 16) / Math.max(1, Ls.length)), x = s === 'r' ? cx + R + 40 : cx - R - 40, span = Ls.length * GAP, y0 = Math.max(8, cy - span / 2)
              Ls.forEach((m, k) => { m.lx = x; m.ly = Math.min(H - 24, y0 + k * GAP + GAP / 2); h += vlab(m, s, x, m.ly) })
            }
          }
          big.named = top
        } else {
          for (const y of mobile ? [2002, 2010, 2018, 2025] : [2002, 2006, 2010, 2014, 2018, 2022, 2025]) h += `<span class="cg-yr" style="transform:translate(${xYear(y).toFixed(0)}px,${(H - 22).toFixed(0)}px) translate(-50%,0)">${y}${y === 2025 ? '*' : ''}</span>`
          h += `<span class="cg-yr is-post" style="transform:translate(${(W - POSTW / 2).toFixed(0)}px,${(H - 22).toFixed(0)}px) translate(-50%,0)">${mobile ? '›' : 'ComprasMX'}</span>`
          const named = big.marks.filter((m) => m.st?.named).sort((a, b) => a.st!.sy - b.st!.sy)
          const GAP = 50, lo = 40, hi = H - 40
          let ys = named.map((m) => Math.max(lo, m.st!.sy))
          for (let i = 1; i < ys.length; i++) if (ys[i] - ys[i - 1] < GAP) ys[i] = ys[i - 1] + GAP
          const over = ys.length ? ys[ys.length - 1] - hi : 0
          if (over > 0) ys = ys.map((y) => Math.max(lo, y - over))
          for (let i = 1; i < ys.length; i++) if (ys[i] - ys[i - 1] < GAP) ys[i] = ys[i - 1] + GAP
          named.forEach((m, i) => { m.st!.ly = ys[i]; m.lx = LX - 10; m.ly = ys[i]; h += vlab(m, 'l', LX - 10, ys[i], true) })
          big.named = named
        }
      }
      lab.innerHTML = h
      if (big?.named) spread(big)
    }
    // named rows: spaced by their measured height (names wrap), kept inside the frame; leader lines follow
    const spread = (big: Plate) => {
      const byV = new Map(big.named!.map((m) => [m.p.vendor_id, m]))
      for (const side of ['l', 'r']) {
        const nodes = [...lab.querySelectorAll<HTMLElement>(`.cg-vl.is-${side}`)]
          .map((el) => ({ el, m: byV.get(Number(el.dataset.v))!, h: el.offsetHeight }))
          .filter((n) => n.m).sort((a, b) => a.m.ly - b.m.ly)
        if (!nodes.length) continue
        const ys: number[] = []
        nodes.forEach((n, i) => { ys[i] = i ? Math.max(n.m.ly, ys[i - 1] + nodes[i - 1].h / 2 + n.h / 2 + 6) : Math.max(n.m.ly, n.h / 2 + 4) })
        const over = ys[ys.length - 1] + nodes[nodes.length - 1].h / 2 - (H - 4)
        if (over > 0) for (let i = ys.length - 1; i >= 0; i--) ys[i] = Math.max(nodes[i].h / 2 + 4, Math.min(ys[i] - over, i < ys.length - 1 ? ys[i + 1] - nodes[i + 1].h / 2 - nodes[i].h / 2 - 6 : Infinity))
        nodes.forEach((n, i) => {
          n.m.ly = ys[i]
          if (n.m.st) n.m.st.ly = ys[i]
          n.el.style.transform = `translate(${n.m.lx.toFixed(0)}px,${ys[i].toFixed(0)}px) translate(${side === 'l' ? '-100%' : '0'},-50%)`
        })
      }
      S.dirty = true
    }
    const vlab = (m: Mark, side: 'l' | 'r', x: number, y: number, lock = false) => {
      const p = m.p
      const yrs = lock && m.st ? `${m.st.a}–${String(m.st.z).slice(2)}` : `${p.y0}–${p.y1}`
      const still = p.post_n ? ` <i class="cg-still" title="${L('sigue firmando en ComprasMX', 'still signing in ComprasMX')}"></i>` : ''
      return `<button type="button" class="cg-vl is-${side}${lock ? ' is-lock' : ''}" data-v="${p.vendor_id}" style="transform:translate(${x.toFixed(0)}px,${y.toFixed(0)}px) translate(${side === 'l' ? '-100%' : '0'},-50%)"><b>${esc(vendorFull(p.name))}</b>${pct0(p.sh)} · ${esc(mdp(p.m, p.flag))} · ${yrs}${still}</button>`
    }

    // ── draw
    const ink = RAMP_INK[4], ink1 = RAMP_INK[1], ink2 = RAMP_INK[2]
    const draw = () => {
      S.dirty = false
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, W, H)
      const big = S.open ? PL.get(S.open) ?? null : null
      const c = big ? S.c : 0
      if (big && c > 0) {
        // candado frame: the blackout seam and the ComprasMX column well
        ctx.globalAlpha = c
        ctx.fillStyle = RAMP_INK[0]; ctx.fillRect(W - POSTW, 28, POSTW, H - 56)
        ctx.setLineDash([3, 3]); ctx.strokeStyle = ink; ctx.lineWidth = 1
        ctx.beginPath(); ctx.moveTo(plotR + SEAM / 2 + 0.5, 24); ctx.lineTo(plotR + SEAM / 2 + 0.5, H - 26); ctx.stroke(); ctx.setLineDash([])
        ctx.strokeStyle = ink1
        for (let y = Y0; y <= 2025; y += 1) { const x = xYear(y); ctx.beginPath(); ctx.moveTo(x, H - 28); ctx.lineTo(x, H - (y % 4 === 2 ? 34 : 31)); ctx.stroke() }
        ctx.globalAlpha = 1
      }
      for (const b of S.shown) {
        const pl = PL.get(b.institution_id)!
        const isBig = pl === big
        if (mobile && pl.rail) continue
        const dim = (S.hoverP && S.hoverP !== pl && !pl.rail) ? 0.3 : 1
        const fade = isBig ? 1 - c : 1
        ctx.globalAlpha = dim * fade
        if (fade > 0.01) {
          ctx.beginPath(); ctx.arc(pl.x, pl.y, pl.R, 0, 2 * Math.PI); ctx.strokeStyle = ink1; ctx.lineWidth = 1; ctx.stroke()
          ctx.beginPath(); ctx.arc(pl.x, pl.y, pl.R, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * b.cap_share * pl.arc)
          ctx.strokeStyle = pl.hue; ctx.lineWidth = pl.rail ? 2 : isBig ? 6 : 4; ctx.stroke()
          if (isBig) {
            for (const rr of [0.2, 0.585]) { ctx.beginPath(); ctx.arc(pl.x, pl.y, rr * pl.R, 0, 2 * Math.PI); ctx.strokeStyle = ink1; ctx.setLineDash([3, 3]); ctx.stroke(); ctx.setLineDash([]) }
            ctx.strokeStyle = ink2; ctx.lineWidth = 1
            for (let k = 0; k < NY; k++) { const a = -Math.PI / 2 + (2 * Math.PI * k) / NY; ctx.beginPath(); ctx.moveTo(pl.x + Math.cos(a) * (pl.R - 4), pl.y + Math.sin(a) * (pl.R - 4)); ctx.lineTo(pl.x + Math.cos(a) * (pl.R + 4), pl.y + Math.sin(a) * (pl.R + 4)); ctx.stroke() }
          }
        }
        ctx.globalAlpha = dim
        const k = pl.rail ? 0.45 : isBig ? (mobile ? 1.1 : 1.6) : mobile ? 0.7 : 1
        for (const m of pl.marks) {
          const p = m.p
          const tone = p.da == null ? 'pale' : p.da >= 0.5 ? 'solid' : 'hollow'
          if (isBig && c > 0 && m.st) {
            // the strip grows from the mark: first locked year → last
            const s = m.st, w = Math.max(2, (s.x1 - s.x0) * clamp01((c - 0.35) / 0.65))
            const r = lerp(m.r * k, s.sh / 2, ease2(c))
            const on = S.hoverM === m || S.picked === p.vendor_id
            const a = (s.named ? 0.95 : 0.22 + 0.3 * clamp01((p.sh - 0.8) / 0.2)) * (s.soft ? 0.5 : 1)
            ctx.fillStyle = on ? ink : alpha(pl.hue, a)
            if (c > 0.35) ctx.fillRect(s.x0, s.sy, w, s.sh)
            else { ctx.beginPath(); ctx.arc(m.x, m.y, Math.max(0.8, r), 0, 2 * Math.PI); ctx.fill() }
            if (c >= 0.99 && p.post_n) {
              ctx.fillStyle = ink; ctx.fillRect(W - POSTW + 4, s.sy, POSTW - 8, Math.max(1, s.sh))
              ctx.fillStyle = alpha(ink, 0.18); ctx.fillRect(s.x1, s.sy + s.sh / 2 - 0.5, W - POSTW + 4 - s.x1, 1)
            }
            if (p.gt === 'doc' && c > 0.35) { ctx.strokeStyle = ink; ctx.lineWidth = 1; ctx.strokeRect(s.x0 - 1.5, s.sy - 1.5, w + 3, s.sh + 3); ctx.strokeRect(s.x0 - 3.5, s.sy - 3.5, w + 7, s.sh + 7) }
            continue
          }
          const r = m.r * k
          ctx.beginPath(); ctx.arc(m.x, m.y, r, 0, 2 * Math.PI)
          if (tone === 'solid') { ctx.fillStyle = alpha(pl.hue, 0.9); ctx.fill() }
          else if (tone === 'hollow') { ctx.fillStyle = S.bg; ctx.fill(); ctx.strokeStyle = pl.hue; ctx.lineWidth = 1.2; ctx.stroke() }
          else { ctx.fillStyle = alpha(pl.hue, 0.38); ctx.fill() }
          if (pl.rail) continue
          if (p.post_n) { ctx.beginPath(); ctx.arc(m.x, m.y, Math.max(0.9, r * 0.4), 0, 2 * Math.PI); ctx.fillStyle = ink; ctx.fill() }
          if (p.gt === 'doc') { ctx.strokeStyle = ink; ctx.lineWidth = 1; for (const d of [2, 4.5]) { ctx.beginPath(); ctx.arc(m.x, m.y, r + d, 0, 2 * Math.PI); ctx.stroke() } }
        }
        ctx.beginPath(); ctx.arc(pl.x, pl.y, pl.rail ? 3 : 6, 0, 2 * Math.PI); ctx.fillStyle = pl.hue; ctx.globalAlpha = dim * fade; ctx.fill()
        ctx.globalAlpha = 1
        if (pl.named && S.settled) {
          ctx.strokeStyle = ink2; ctx.lineWidth = 1
          for (const m of pl.named) {
            ctx.beginPath()
            if (c >= 0.5 && m.st) { ctx.moveTo(m.lx + 4, m.ly); ctx.lineTo(m.st.x0, m.st.sy + m.st.sh / 2) }
            else { if (mobile) continue; ctx.moveTo(m.x, m.y); ctx.lineTo(m.lx + (m.lx < pl.x ? 4 : -4), m.ly) }
            ctx.stroke()
          }
        }
      }
      for (const m of [S.hoverM, S.picked ? S.shown.flatMap((b) => PL.get(b.institution_id)!.marks).find((x) => x.p.vendor_id === S.picked) ?? null : null]) {
        if (!m || m.pl.rail || (m.pl === big && c > 0.5)) continue
        const r = m.r * (m.pl === big ? (mobile ? 1.1 : 1.6) : mobile ? 0.7 : 1)
        ctx.beginPath(); ctx.arc(m.x, m.y, r + 3.5, 0, 2 * Math.PI); ctx.strokeStyle = ink; ctx.lineWidth = 1.5; ctx.stroke()
      }
    }
    let raf = 0
    const loop = () => { if (S.dirty) draw(); raf = requestAnimationFrame(loop) }
    raf = requestAnimationFrame(loop)

    // ── movement: every change retargets plates from where they are now (interruptible)
    S.layout = () => {
      targets()
      const big = S.open ? PL.get(S.open) ?? null : null
      if (big) strips(big)
      S.stopMove()
      const from = new Map(S.shown.map((b) => { const pl = PL.get(b.institution_id)!; return [b.institution_id, { x: pl.x || pl.tx, y: pl.y || H + 80, R: pl.R || pl.tR }] }))
      lab.classList.add('is-moving')
      S.settled = false
      S.stopMove = tween(prev || S.open ? 600 : 0, (t) => {
        const e = ease2(t)
        for (const b of S.shown) { const pl = PL.get(b.institution_id)!, f = from.get(b.institution_id)!; pl.x = lerp(f.x, pl.tx, e); pl.y = lerp(f.y, pl.ty, e); pl.R = lerp(f.R, pl.tR, e) }
        place(); S.dirty = true
      }, () => { place(); rebuildHit(); S.settled = true; S.labels(); lab.classList.remove('is-moving'); S.dirty = true })
    }

    if (!prev) {
      // L0: plates take their seats, arcs sweep 600 ms (40 ms stagger), marks fall from outside the rim (700 ms)
      targets()
      for (const b of S.shown) { const pl = PL.get(b.institution_id)!; pl.x = pl.tx; pl.y = pl.ty; pl.R = pl.tR; pl.arc = reduced() ? 1 : 0; for (const m of pl.marks) { m.rho1 = rhoFor(m); m.rho = m.rho0 = reduced() ? m.rho1 : 1.14 } }
      for (const pl of PL.values()) for (const m of pl.marks) m.rho1 = rhoFor(m)
      place(); S.labels()
      const n = S.shown.length
      S.stopRho = tween(700 + 40 * n, (t) => {
        const el = t * (700 + 40 * n)
        S.shown.forEach((b, k) => {
          const pl = PL.get(b.institution_id)!
          pl.arc = ease3(clamp01((el - k * 40) / 600))
          const e = ease3(clamp01((el - k * 40) / 700))
          for (const m of pl.marks) m.rho = lerp(m.rho0, m.rho1, e)
        })
        place(); S.dirty = true
      }, () => {
        for (const pl of PL.values()) { pl.arc = 1; for (const m of pl.marks) m.rho = m.rho1 }
        place(); rebuildHit(); S.settled = true; S.dirty = true
        if (comprador && BUYER.has(comprador)) { S.open = comprador; for (const b of S.shown) PL.get(b.institution_id)!.rail = b.institution_id !== comprador; S.c = lente === 'candado' ? 1 : 0; S.layout() }
      })
    } else {
      for (const pl of PL.values()) pl.arc = 1
      targets()
      for (const b of S.shown) { const pl = PL.get(b.institution_id)!; pl.x = pl.tx; pl.y = pl.ty; pl.R = pl.tR }
      const big = S.open ? PL.get(S.open) ?? null : null
      if (big) strips(big)
      place(); rebuildHit(); S.labels(); S.dirty = true
    }

    // ── pointer: L1 hover · L2/L3 click
    const tip = tipRef.current!
    const showTip = (html: string | null, x = 0, y = 0) => {
      if (!html) { tip.hidden = true; return }
      tip.hidden = false; tip.innerHTML = html
      const tw = tip.offsetWidth, th = tip.offsetHeight
      tip.style.transform = `translate(${Math.max(0, Math.min(W - tw, x + 14))}px, ${Math.max(0, y + 16 + th > H ? y - th - 12 : y + 16)}px)`
    }
    const markAt = (x: number, y: number): Mark | null => {
      const big = S.open ? PL.get(S.open) ?? null : null
      if (big && S.c > 0.5) {
        // strips: by row (they can be < 1 px tall), then x within the strip
        const n = big.marks.length, pitch = (H - 64) / Math.max(1, n), i = Math.floor((y - 34) / pitch)
        let best: Mark | null = null, bd = 6
        for (const m of big.marks) {
          const s = m.st!; if (Math.abs(s.i - i) > Math.max(2, 6 / pitch)) continue
          const dx = x < s.x0 ? s.x0 - x : x > s.x1 ? x - s.x1 : 0, d = dx + Math.abs(s.sy + s.sh / 2 - y)
          if (d < bd) { bd = d; best = m }
        }
        return best
      }
      let best: Mark | null = null, bd = 81
      for (const q of qt) { const d = (q.x - x) ** 2 + (q.y - y) ** 2; if (d < bd) { bd = d; best = q.m } }
      return best
    }
    const plateAt = (x: number, y: number): Plate | null => {
      for (const b of S.shown) { const pl = PL.get(b.institution_id)!; if (pl.b.institution_id === S.open) continue; if (Math.hypot(x - pl.x, y - pl.y) <= (pl.rail ? pl.R + 6 : 12)) return pl }
      return null
    }
    const tipMark = (m: Mark) => {
      const p = m.p, b = m.pl.b
      const da = p.da == null ? L('sin dato (2002–2010)', 'no data (2002–2010)') : `${pct0(p.da)} ${L('del dinero 2011+', 'of 2011+ money')}`
      const lock = p.lock0 ? `${p.lock0}–${p.lock1} · ${p.lockrun} ${L('seguidos', 'in a row')}` : L('ningún año completo', 'no full year')
      return `<b>${esc(vendorFull(p.name))}</b><div class="cg-tl"><span>${L('de su ingreso federal', 'of its federal income')}</span><span>${pct0(p.sh)}</span><span>${L('con', 'with')} ${esc(buyerShort(b))}</span><span>${esc(mdp(p.m, p.flag))}</span><span>${L('años', 'years')}</span><span>${p.y0}–${p.y1} · ${p.ny}</span><span>${L('bajo candado', 'under lock')}</span><span>${lock}</span><span>${L('adjudicación directa', 'direct award')}</span><span>${da}</span><span>${L('después del apagón', 'after the blackout')}</span><span>${p.post_n ? `${formatNumber(p.post_n)} ${L('contratos', 'contracts')}` : L('no aparece', 'absent')}</span></div>`
    }
    const tipPlate = (pl: Plate) => {
      const b = pl.b
      return `<b>${esc(buyerFull(b))}</b><div class="cg-tl"><span>${L('a proveedores dominantes', 'to dominant firms')}</span><span>${esc(formatCompactMXN(b.cap))}</span><span>${L('de su dinero', 'of its money')}</span><span>${pct0(b.cap_share)}</span><span>${L('empresas', 'firms')}</span><span>${formatNumber(b.n)}</span><span>${L('siguen con contratos federales después del 28-sep-2025', 'still hold federal contracts after 28 Sep 2025')}</span><span>${b.post_n ? formatNumber(b.post_n) : '—'}</span>${b.pf_n ? `<span>${L('personas físicas', 'individuals')}</span><span>${formatNumber(b.pf_n)} · ${L('no se nombran', 'not named')}</span>` : ''}</div>`
    }
    const setHover = (m: Mark | null, pl: Plate | null) => {
      if (m === S.hoverM && pl === S.hoverP) return
      S.hoverM = m; S.hoverP = pl; S.dirty = true
      lab.querySelectorAll('.is-on').forEach((n) => n.classList.remove('is-on'))
      if (m) lab.querySelector(`[data-v="${m.p.vendor_id}"]`)?.classList.add('is-on')
      if (pl) lab.querySelectorAll(`[data-b="${pl.b.institution_id}"]`).forEach((n) => n.classList.add('is-on'))
      lab.classList.toggle('is-dim', !!pl && !pl.rail)
      setHoverB(pl && !pl.rail ? pl.b : null)
    }
    const box = boxRef.current!
    const onMove = (e: PointerEvent) => {
      const r = box.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top
      const t = e.target as HTMLElement
      const vl = t.closest<HTMLElement>('[data-v]'), nb = t.closest<HTMLElement>('[data-b]')
      if (vl) { const m = PL.get(S.open ?? -1)?.marks.find((q) => q.p.vendor_id === Number(vl.dataset.v)) ?? null; setHover(m, null); showTip(null); return }
      if (nb) { const pl = PL.get(Number(nb.dataset.b)) ?? null; setHover(null, pl); if (pl) showTip(tipPlate(pl), x, y); return }
      if (!S.settled) return
      const pl = plateAt(x, y), m = pl ? null : markAt(x, y)
      setHover(m, pl)
      box.style.cursor = m || pl ? 'pointer' : 'default'
      showTip(m ? tipMark(m) : pl ? tipPlate(pl) : null, x, y)
    }
    const onLeave = () => { setHover(null, null); showTip(null) }
    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      const vl = t.closest<HTMLElement>('[data-v]'), nb = t.closest<HTMLElement>('[data-b]')
      if (vl) { setP({ proveedor: vl.dataset.v! }); return }
      if (nb) { setP({ comprador: nb.dataset.b!, proveedor: null }); return }
      const r = box.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top
      const pl = plateAt(x, y)
      if (pl) { setP({ comprador: String(pl.b.institution_id), proveedor: null }); return }
      const m = markAt(x, y)
      if (m) setP({ proveedor: String(m.p.vendor_id) })
    }
    box.addEventListener('pointermove', onMove)
    box.addEventListener('pointerleave', onLeave)
    box.addEventListener('click', onClick)
    // test/recorder hooks (read-only, dev builds only)
    const W_ = window as unknown as { __captura?: unknown }
    if (import.meta.env.DEV) W_.__captura = {
      markPt: (bi: number, ki: number) => { const pl = PL.get(S.shown[bi].institution_id)!; const m = pl.marks.slice().sort((a, b) => b.p.m - a.p.m)[ki]; const r = box.getBoundingClientRect(); return [r.left + m.x, r.top + m.y] },
      platePt: (bi: number) => { const pl = PL.get(S.shown[bi].institution_id)!; const r = box.getBoundingClientRect(); return [r.left + pl.x, r.top + pl.y] },
      settled: () => S.settled,
    }
    return () => {
      cancelAnimationFrame(raf)
      delete W_.__captura
      box.removeEventListener('pointermove', onMove)
      box.removeEventListener('pointerleave', onLeave)
      box.removeEventListener('click', onClick)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size, buyers, lang])

  // Unmount only (the engine survives resizes): stop the running tweens.
  useEffect(() => () => { const S = E.current; if (S) { S.stopMove(); S.stopRho(); S.stopC() } }, [])

  // ── URL → engine (L3 drill, L4 lenses)
  useEffect(() => {
    const S = E.current
    if (!S || !S.settled && S.open === null && comprador == null) return
    if (S.open === comprador) return
    if (comprador && !BUYER.has(comprador)) return
    S.open = comprador
    if (comprador && !S.shown.some((b) => b.institution_id === comprador)) { const pl = S.PL.get(comprador); if (pl) { S.shown[S.shown.length - 1] = pl.b; pl.arc = 1; for (const m of pl.marks) m.rho = m.rho1 } }
    for (const b of S.shown) S.PL.get(b.institution_id)!.rail = !!comprador && b.institution_id !== comprador
    S.c = 0
    S.layout()
  }, [comprador, BUYER])
  useEffect(() => {
    const S = E.current
    if (!S || !S.open) return
    const to = lente === 'candado' ? 1 : 0
    if (S.c === to) return
    S.stopC()
    const c0 = S.c
    E.current!.labels()
    labRef.current?.classList.add('is-moving')
    S.settled = false
    S.stopC = tween(700 * Math.abs(to - c0), (t) => { S.c = lerp(c0, to, t); for (const b of S.shown) { const pl = S.PL.get(b.institution_id)!; if (pl.b.institution_id === S.open) for (const m of pl.marks) { const ox = pl.x + Math.cos(m.ang) * m.rho * pl.R, oy = pl.y + Math.sin(m.ang) * m.rho * pl.R; if (m.st) { const e = ease2(S.c); m.x = lerp(ox, m.st.x0, e); m.y = lerp(oy, m.st.sy + m.st.sh / 2, e) } } } S.dirty = true },
      () => { S.settled = true; S.labels(); labRef.current?.classList.remove('is-moving'); S.dirty = true })
  }, [lente, comprador])
  useEffect(() => {
    const S = E.current
    if (!S || S.orbita === orbita) return
    S.orbita = orbita
    for (const pl of S.PL.values()) for (const m of pl.marks) { m.rho0 = m.rho; m.rho1 = (orbita === 'dep' ? lerp(0.2, 0.97, (1 - m.p.sh) / (1 - meta.def.share)) : lerp(0.97, 0.2, clamp01((m.p.ny - meta.def.min_years) / 17))) + m.jr }
    S.stopRho()
    S.stopRho = tween(500, (t) => { const e = ease2(t); for (const pl of S.PL.values()) for (const m of pl.marks) m.rho = lerp(m.rho0, m.rho1, e); S.layout() })
  }, [orbita, meta.def])
  useEffect(() => {
    const S = E.current
    if (!S || S.orden === orden) return
    S.orden = orden
    const next = pickShown(orden, S.open)
    for (const b of next) { const pl = S.PL.get(b.institution_id); if (pl && !S.shown.includes(b)) { pl.x = 0; pl.y = 0; pl.R = 0; pl.arc = 1; for (const m of pl.marks) m.rho = m.rho1 } }
    S.shown = next
    S.layout()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orden])
  useEffect(() => { const S = E.current; if (S) { S.picked = picked?.vendor_id ?? null; S.dirty = true } }, [picked])

  // Esc steps back: dock → drill; arrows walk the marks of the open plate (largest first), Enter docks, c cites
  const walk = useRef(-1)
  const onKeyRef = useRef<(e: KeyboardEvent) => void>(() => {})
  // keys-ref: one listener for the page's life, reading this render's state
  onKeyRef.current = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLElement && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return
    const S = E.current
    if (e.key === 'Escape') {
      if (proveedor) setP({ proveedor: null })
      else if (comprador) setP({ comprador: null, lente: null })
      return
    }
    if (!S) return
    if (e.key === 'c' && (picked || openB)) { void cite(); return }
    if (/^Arrow(Left|Right|Up|Down)$/.test(e.key) && (S.open || document.activeElement === boxRef.current)) {
      e.preventDefault()
      const pl = S.PL.get(S.open ?? S.shown[0].institution_id)
      if (!pl) return
      const Ls = pl.marks.slice().sort((a, b) => b.p.m - a.p.m)
      walk.current = /Right|Down/.test(e.key) ? Math.min(Ls.length - 1, walk.current + 1) : Math.max(0, walk.current - 1)
      S.hoverM = Ls[walk.current]; S.dirty = true
    }
    if (e.key === 'Enter' && S.hoverM && document.activeElement === boxRef.current) setP({ proveedor: String(S.hoverM.p.vendor_id) })
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => onKeyRef.current(e)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const toastT = useRef(0)
  useEffect(() => () => window.clearTimeout(toastT.current), [])

  const cite = async () => {
    const p = picked, b = p ? BUYER.get(p.institution_id) : openB
    if (!b) return
    const s = p
      ? (en
        ? `${vendorFull(p.name)} earns ${pct0(p.sh)} of its federal income from ${buyerFull(b)}: ${mdp(p.m, p.flag)} over ${p.ny} years (${p.y0}–${p.y1}).${p.post_n ? ' It still signs after the blackout (ComprasMX).' : ''}`
        : `${vendorFull(p.name)} recibe de ${buyerFull(b)} el ${pct0(p.sh)} de lo que le contrata el gobierno federal: ${mdp(p.m, p.flag)} en ${p.ny} años (${p.y0}–${p.y1}).${p.post_n ? ' Sigue firmando desde el cierre de CompraNet (28 sep 2025), en ComprasMX.' : ''}`)
      : buyerSentence(b, en)
    try { await navigator.clipboard.writeText(`${s} RUBLI · ${L(CAPTURA_TITLE.es, CAPTURA_TITLE.en)}. ${window.location.href}`) } catch { /* clipboard blocked: the toast still shows the sentence */ }
    setToast(L('Copiado: la frase y el enlace de este estado', 'Copied: the sentence and the link to this state'))
    window.clearTimeout(toastT.current)
    toastT.current = window.setTimeout(() => setToast(null), 2200)
  }

  // count-up for the head figures (one beat)
  const [k, setK] = useState(reduced() ? 1 : 0)
  useEffect(() => { if (reduced()) return; return tween(900, (t) => setK(ease3(t))) }, [])

  const secIds = useMemo(() => [...new Set(buyers.slice(0, 18).map((b) => b.sector_id))], [buyers])
  const lensBtn = (key: string, cur: string, opts: [string, string][], label: string) => (
    <div className="cg-lens" role="group" aria-label={label}>
      <span className="cg-lens-k">{label}</span>
      {opts.map(([v, t], i) => (
        <button key={v} type="button" aria-pressed={cur === v} onClick={() => setP({ [key]: i === 0 ? null : v })}>{t}</button>
      ))}
    </div>
  )
  const legend: [string, string][] = [
    ['solid', L('mayoría por adjudicación directa (dinero 2011+)', 'mostly direct award (2011+ money)')],
    ['hollow', L('mayoría competida', 'mostly competed')],
    ['pale', L('sin dato de procedimiento (2002–2010)', 'no procedure data (2002–2010)')],
    ['core', L('sigue firmando en ComprasMX', 'still signing in ComprasMX')],
    ['case', L('caso documentado', 'documented case')],
    ['arc', L('arco = parte del dinero del comprador que fue a sus proveedores dominantes', "arc = share of the buyer's money that went to its dominant suppliers")],
  ]

  return (
    <section className="cg" aria-labelledby="cg-h">
      <div className="cg-head">
        <h2 id="cg-h" className="cg-h1">
          {en
            ? <><b>{formatNumber(Math.round(T.pairs * k))}</b> companies live off one {who ? `${who} ` : ''}buyer</>
            : <><b>{formatNumber(Math.round(T.pairs * k))}</b> empresas viven de un solo comprador{who ? ` ${who}` : ''}</>}
        </h2>
        <dl className="cg-figs">
          <div><dt>{L('2002–2025', '2002–2025')}</dt><dd>{formatDualCurrency(T.money * k)}</dd></div>
          <div><dt>{L(`compradores${whoPl ? ` ${whoPl}` : ''}`, `${whoPl ? `${whoPl} ` : ''}buyers`)}</dt><dd>{formatNumber(Math.round(T.buyers * k))}</dd></div>
          <div><dt>{L('siguen con contratos federales después del 28-sep-2025', 'still hold federal contracts after 28 Sep 2025')}</dt><dd>{formatNumber(Math.round(T.post_pairs * k))}</dd></div>
        </dl>
      </div>
      <p className="cg-read" aria-live="polite">
        {openB ? (
          <span className="cg-crumb">
            <button type="button" onClick={() => setP({ comprador: null, lente: null, proveedor: null })}>← {L(CAPTURA_TITLE.es, CAPTURA_TITLE.en)}</button>
            <b title={buyerFull(openB)}>{buyerFull(openB)}</b>
            <span>{buyerSentence(openB, en)}{openB.post_n ? ` ${formatNumber(openB.post_n)} ${L('siguen con contratos federales después del 28-sep-2025.', 'still hold federal contracts after 28 Sep 2025.')}` : ''}</span>
            <button type="button" onClick={() => void cite()}>{L('Citar', 'Cite')}</button>
            <kbd>Esc</kbd>
          </span>
        ) : hoverB ? buyerSentence(hoverB, en) : (en
          ? <>Each mark is a company with <b>≥ 80%</b> of its federal income from that buyer, <b>≥ 50 M MXN</b>, for <b>3 years or more</b>. Individuals are counted apart; their personal RFC is never shown.</>
          : <>Cada marca es una empresa que cobra <b>≥ 80%</b> de su ingreso federal de ese comprador, <b>≥ 50 MDP</b>, durante <b>3 años o más</b>. Las personas físicas se cuentan aparte; su RFC personal nunca se muestra.</>)}
      </p>
      <div ref={boxRef} className="cg-obj" data-object tabIndex={0} role="img" aria-label={L(`${T.pairs} proveedores dominantes de ${T.buyers} compradores${whoPl ? ` ${whoPl}` : ''}`, `${T.pairs} dominant suppliers of ${T.buyers}${whoPl ? ` ${whoPl}` : ''} buyers`)} style={mobile ? { height: openB ? 1240 : 1150 } : undefined}>
        <canvas ref={cvRef} className="cg-cv" />
        <div ref={labRef} className="cg-lab" />
        <div ref={tipRef} className="cg-tip kf-mono" hidden />
      </div>
      <div className="cg-foot">
        {lensBtn('orbita', orbita, [['dep', L('dependencia', 'dependency')], ['anios', L('años', 'years')]], L('Órbita', 'Orbit'))}
        {!openB && lensBtn('orden', orden, [['dinero', L('dinero a proveedores dominantes', 'money to dominant suppliers')], ['pct', L('% de su dinero', '% of its money')]], L('Orden', 'Order'))}
        {openB && lensBtn('lente', lente, [['gravedad', L('gravedad', 'gravity')], ['candado', L('candado', 'lock')]], L('Lente', 'Lens'))}
        <ul className="cg-key" aria-label={L('Cómo se lee', 'How to read it')}>
          <li title={L('color = sector del comprador', 'colour = buyer sector')} className="cg-key-sec">
            {secIds.map((id) => <i key={id} style={{ background: sectorOf(id).color }} />)}
            <span className="sr-only">{L('color = sector del comprador', 'colour = buyer sector')}</span>
          </li>
          {legend.map(([g, t]) => (
            <li key={g} title={t}><span className={`cg-g is-${g}`} aria-hidden="true" /><span className="sr-only">{t}</span></li>
          ))}
          <li title={L('† = contrato mayor a 10,000 MDP, en revisión', '† = a contract above 10,000 M MXN, under review')} className="kf-mono">†<span className="sr-only">{L('contrato mayor a 10,000 MDP', 'contract above 10,000 M MXN')}</span></li>
        </ul>
      </div>
      <div className="sr-only"><table>
        <caption>{L('Compradores con más dinero a proveedores dominantes', 'Buyers with the most money to dominant suppliers')}</caption>
        <thead><tr><th scope="col">{L('Comprador', 'Buyer')}</th><th scope="col">{L('Dinero a dominantes', 'Money to dominant suppliers')}</th><th scope="col">{L('De su dinero', 'Of its money')}</th><th scope="col">{L('Empresas', 'Companies')}</th></tr></thead>
        <tbody>{buyers.slice(0, 18).map((b) => <tr key={b.institution_id}><td>{buyerFull(b)}</td><td>{formatCompactMXN(b.cap)}</td><td>{pct0(b.cap_share)}</td><td>{formatNumber(b.n)}</td></tr>)}</tbody>
      </table></div>
      {/* exit mirrors the CSS slide-in (audit #14); one key, so a new pick swaps content in place */}
      <AnimatePresence>
        {picked && BUYER.get(picked.institution_id) && (
          <CapturaDock key="dock" lang={lang} pair={picked} buyer={BUYER.get(picked.institution_id)!} onClose={() => setP({ proveedor: null })} onCite={() => void cite()} />
        )}
      </AnimatePresence>
      {toast && <div className="cg-toast kf-mono" role="status">{toast}</div>}
    </section>
  )
}

export default Gravedad
