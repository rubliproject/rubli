/**
 * GapPlate — /gap «La placa» (owner pick C, 2026-10-20; concept `_ui_v4/concepts/gap/C.html`).
 * ¿Por qué puerta salió el dinero sin CompraNet? Four plain buckets on a 2×2 plate; each cell is a
 * field of marks (1 mark ≈ 10 awards, stacked: with an amount · estimated · none) standing on its
 * money floor (one px-per-peso scale across the plate).
 *   L0 the cells fill (once per session, ≤ 1.2 s; numbers first from ?part=head, marks after)
 *   L1 cell ⇄ legend chip ⇄ buyer row (a buyer's money lights its share of every floor)
 *   L2 click a cell → it fills the plate, its marks sort into one lane per legal door (plain names)
 *   L3 click a lane → its marks fly to their amount (log) × month; the door's every award fades in
 *      (lazy /plate/door/{k}); buyers at the right; click an award → the card (/plate/award)
 *   L4 lens «por dinero ⇄ por adjudicaciones» re-sizes the cells / lanes, marks re-flow
 *   L5 URL ?cubeta=&puerta=&marca=&lente= + «Citar». Esc steps back one level.
 * Performance (owner 2026-10-20 "very laggy"): ONE canvas; marks live in typed arrays and are drawn
 * as one path per hue × kind × alpha step (no per-mark fill calls, no DOM per mark); lanes stagger
 * as groups; once settled the scene is cached to an offscreen layer and hover only composes
 * veils/rings over it. Reduced motion → final frames. window.__gapPerf keeps the frame times (dev builds).
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useReducedMotion } from 'framer-motion'
import { ExternalLink } from 'lucide-react'
import { gapApi } from '@/api/client'
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import { RAMP_INK } from '@/lib/constants'
import { formatEntityName } from '@/lib/entity/format'
import { formatVendorName } from '@/lib/vendor/formatName'
import { formatCompactMXN, formatNumber } from '@/lib/utils'
import { usePanelFocus } from '@/hooks/useModal'
import {
  BUCKETS, BUCKET_COPY, BUCKET_HUE, BUCKET_TEXT, COMPRASMX_DETAIL, DOOR_COPY, deq, known, knownN,
  type BucketKey, type Plate, type PlateAgg, type PlateAward, type PlateDoorAwards, type PlateHead, type TopRow,
} from '@/lib/gap/plate'
import './gap-plate.css'

type Lang = 'en' | 'es'
type Lens = 'dinero' | 'conteo'
interface R { x: number; y: number; w: number; h: number }
type FrameKind = 'cell' | 'open' | 'strip' | 'lane' | 'field'
interface Frame { kind: FrameKind; b: BucketKey; d?: string; r: R; bar?: R; a: number }
interface FieldGeo { r: R; x0: number; w: number; colW: number; top: number; bot: number; floorY: number; floorH: number }
interface Lab { key: string; kind: 'cell' | 'open' | 'strip' | 'lane' | 'ftitle'; b: BucketKey; d?: string; x: number; y: number; w: number; small?: boolean }
interface Chip { d: string; x: number; y: number; w: number }
interface Lay { H: number; frames: Record<string, Frame>; field: FieldGeo | null; fd: string | null; labs: Lab[]; chips: Chip[]; side: R | null; k: number }
interface Hot { b?: BucketKey; d?: string; buyer?: number; mark?: number; award?: number }

const INK = RAMP_INK[4]
const GRAY = RAMP_INK[3]
const LIGHT = RAMP_INK[2]
const RULE = RAMP_INK[1]
const WASH = RAMP_INK[0]
const PAD = 16
const GUT = 16
const MOBILE = 640
const BEAT_KEY = 'rubli_beat_gap'
const LOG_LO = 3, LOG_HI = 11 // 1,000 MXN … 100,000 MDP (the reject ceiling)
const F_CHIP = '600 13px "Spectral SC", "Spectral", Georgia, serif'
const F_MONO = '400 12px "IBM Plex Mono", monospace'

const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t)
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)
const easeIO = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
const hash = (i: number) => { let x = (i + 1) * 2654435761; x ^= x >>> 15; x = Math.imul(x, 2246822519); x ^= x >>> 13; return (x >>> 0) / 4294967296 }
const nf = (n: number) => formatNumber(Math.round(n))
const money = (mxn: number) => formatCompactMXN(mxn)
const pct = (a: number, b: number) => { const v = b ? (100 * a) / b : 0; return `${v > 0 && v < 1 ? v.toFixed(1) : Math.round(v)}%` }
const plateH = (W: number) => Math.round(clamp(W * 0.46, 560, 720))
const chipSub = (D: PlateAgg) => `${known(D) ? formatCompactMXN(known(D)) : '—'} · ${formatNumber(D.n)}`

/** The L0 beat plays once per session; decided once per page load (StrictMode calls initializers twice). */
let beatDecision: boolean | null = null
function beatOnce(reduced: boolean) {
  if (beatDecision != null) return beatDecision
  beatDecision = false
  if (reduced) return false
  try { if (sessionStorage.getItem(BEAT_KEY)) return false; sessionStorage.setItem(BEAT_KEY, '1') } catch { /* private mode */ }
  beatDecision = true
  return true
}

let measure: CanvasRenderingContext2D | null = null
function textW(font: string, s: string) {
  if (!measure) measure = document.createElement('canvas').getContext('2d')
  if (!measure) return s.length * 7
  measure.font = font
  return measure.measureText(s).width
}

/** Marks as typed arrays: bucket / door / kind / amount / month per mark + the index lists the layouts walk. */
interface MarkSet { n: number; bk: Uint8Array; dr: Uint8Array; kd: Uint8Array; q: Int16Array; m: Int8Array; c: Uint8Array; byBucket: number[][]; byDoor: number[][] }
function markSet(P: Plate): MarkSet {
  const M = P.marks, n = M.d.length
  const bIdx = new Map(BUCKETS.map((b, i) => [b, i]))
  const doorB = P.doors.map((d) => bIdx.get(d.b)!)
  const set: MarkSet = { n, bk: new Uint8Array(n), dr: new Uint8Array(n), kd: new Uint8Array(n), q: new Int16Array(n), m: new Int8Array(n), c: new Uint8Array(n), byBucket: BUCKETS.map(() => []), byDoor: P.doors.map(() => []) }
  for (let i = 0; i < n; i++) { set.dr[i] = M.d[i]; set.bk[i] = doorB[M.d[i]]; set.kd[i] = M.k[i]; set.q[i] = M.q[i]; set.m[i] = M.m[i]; set.c[i] = M.c[i]; set.byDoor[M.d[i]].push(i) }
  // a cell stacks kind-major (with an amount at the floor, then estimated, then none on top); doors by money inside each kind
  const doorPos = new Map(P.doors.map((d, i) => [d.k, i]))
  P.buckets.forEach((b, bi) => { for (let k = 0; k < 3; k++) for (const dk of b.doors) for (const i of set.byDoor[doorPos.get(dk)!]) if (set.kd[i] === k) set.byBucket[bi].push(i) })
  return set
}

/** Fill a rect with marks (from the bottom for a cell, from the top for a lane); writes X1/Y1/R1/A1. */
function grid(idx: number[], r: R, fromBottom: boolean, maxPitch: number, T: Tgt) {
  const n = idx.length
  if (!n || r.w <= 0 || r.h <= 0) return
  let pitch = Math.min(maxPitch, Math.sqrt((r.w * r.h) / n) * 0.97)
  let cols = Math.max(1, Math.floor(r.w / pitch)), rows = Math.ceil(n / cols)
  if (rows * pitch > r.h) { pitch = Math.max(1.6, r.h / rows); cols = Math.max(1, Math.floor(r.w / pitch)); rows = Math.ceil(n / cols) }
  const rad = Math.max(0.7, pitch * 0.36)
  for (let j = 0; j < n; j++) {
    const i = idx[j], col = j % cols, row = Math.floor(j / cols)
    T.X[i] = r.x + col * pitch + pitch / 2
    T.Y[i] = fromBottom ? r.y + r.h - pitch / 2 - row * pitch : r.y + pitch / 2 + row * pitch
    T.R[i] = rad; T.A[i] = 1
  }
}
interface Tgt { X: Float32Array; Y: Float32Array; R: Float32Array; A: Float32Array; D: Float32Array }

function fieldY(F: FieldGeo, mxn: number) { return lerp(F.bot, F.top, clamp01((Math.log10(mxn) - LOG_LO) / (LOG_HI - LOG_LO))) }
function fieldX(F: FieldGeo, m: number, i: number) { return F.x0 + (Math.max(0, m) + 0.5) * F.colW + (hash(i) - 0.5) * (F.colW - 6) }

/** The whole plate's geometry for one state. Mark targets go into T. */
function layout(W: number, P: PlateHead, M: MarkSet | null, b: BucketKey | null, d: string | null, lens: Lens, mobile: boolean, T: Tgt | null, en: boolean): Lay {
  const frames: Record<string, Frame> = {}
  const labs: Lab[] = []
  const chips: Chip[] = []
  const metric = (a: PlateAgg) => (lens === 'dinero' ? known(a) : a.n)
  const B = P.buckets
  const bi = b ? BUCKETS.indexOf(b) : -1
  const doorIdx = new Map(P.doors.map((x, i) => [x.k, i]))
  const maxKnown = Math.max(...B.map(known))
  if (T) { T.A.fill(0); T.D.fill(0) }
  let H = 0, k = 0, field: FieldGeo | null = null, side: R | null = null

  // ── L0: the four cells ────────────────────────────────────────────────
  if (!b) {
    const rects: R[] = []
    if (mobile) {
      let y = 0
      B.forEach((x) => {
        const nM = M ? M.byBucket[BUCKETS.indexOf(x.k)].length : Math.ceil(x.n / P.per)
        const pitch = 4.4, cols = Math.floor((W - 2 * PAD) / pitch), h = 96 + Math.ceil(nM / cols) * pitch + 36
        rects.push({ x: 0, y, w: W, h }); y += h + GUT
      })
      H = y - GUT
    } else {
      H = plateH(W)
      const m = B.map(metric), tot = m.reduce((s, v) => s + v, 0) || 1
      const rs = clamp((m[0] + m[1]) / tot, 0.38, 0.62)
      const hs = [(H - GUT) * rs, (H - GUT) * (1 - rs)]
      for (let row = 0; row < 2; row++) {
        const a = m[row * 2], c = m[row * 2 + 1], cs = clamp(a / (a + c || 1), 0.3, 0.7)
        const y = row ? hs[0] + GUT : 0, w0 = (W - GUT) * cs
        rects.push({ x: 0, y, w: w0, h: hs[row] }, { x: w0 + GUT, y, w: W - GUT - w0, h: hs[row] })
      }
    }
    k = Math.min(...B.map((x, i) => (rects[i].w - 2 * PAD) / (known(x) || 1)))
    B.forEach((x, i) => {
      const r = rects[i], small = !mobile && (r.w < 460 || r.h < 300), head = mobile || small ? 96 : 142
      frames[`B:${x.k}`] = { kind: 'cell', b: x.k, r, bar: { x: r.x + PAD, y: r.y + r.h - 22, w: known(x) * k, h: 10 }, a: 1 }
      labs.push({ key: `c:${x.k}`, kind: 'cell', b: x.k, x: r.x + PAD, y: r.y + 12, w: r.w - 2 * PAD, small: small || mobile })
      if (M && T) grid(M.byBucket[i], { x: r.x + PAD, y: r.y + head, w: r.w - 2 * PAD, h: r.h - head - 34 }, true, 7.5, T)
    })
    if (M && T) for (let i = 0; i < M.n; i++) T.D[i] = M.bk[i] * 0.08 // cells settle in reading order
    return { H, frames, field, fd: null, labs, chips, side, k }
  }

  // ── L2 / L3: one bucket fills the plate; the other three fold to strips ─
  const Bk = B[bi], doors = Bk.doors, others = B.filter((x) => x.k !== b)
  const HEAD2 = mobile ? 92 : 80, STRIP = mobile ? 48 : 58
  const maxDoor = Math.max(...doors.map((dk) => known(P.doors[doorIdx.get(dk)!])), 1)
  let openH: number
  const LBL = mobile ? 0 : clamp(W * 0.24, 220, 320)
  const laneH: number[] = []
  if (!d) {
    const ws = doors.map((dk) => Math.pow(Math.max(0.04, metric(P.doors[doorIdx.get(dk)!]) / (metric(Bk) || 1)), 0.55))
    const wsum = ws.reduce((s, v) => s + v, 0)
    if (mobile) {
      doors.forEach((dk) => { const nM = M ? M.byDoor[doorIdx.get(dk)!].length : 20; const cols = Math.floor((W - 2 * PAD) / 4.4); laneH.push(44 + Math.max(1, Math.ceil(nM / cols)) * 4.4 + 16) })
      openH = HEAD2 + laneH.reduce((s, v) => s + v, 0) + 8
    } else {
      openH = plateH(W) - STRIP - GUT
      const avail = openH - HEAD2 - 6
      const minH = 40
      const raw = ws.map((w) => (avail * w) / wsum)
      const deficit = raw.reduce((s, h) => s + Math.max(0, minH - h), 0), big = raw.filter((h) => h > minH).reduce((s, h) => s + h, 0) || 1
      raw.forEach((h) => laneH.push(h < minH ? minH : h - (deficit * h) / big))
    }
  } else {
    openH = mobile ? 0 : plateH(W) - STRIP - GUT
  }

  // chips (L3): every door of the bucket as one wrapped row of buttons, measured so the field sits under them
  let chipsH = 0
  if (d) {
    let x = 0, y = HEAD2, rowH = 34
    for (const dk of doors) {
      const c = DOOR_COPY[dk], D = P.doors[doorIdx.get(dk)!]
      const w = Math.min(W, Math.ceil((textW(F_CHIP, en ? c.en : c.es) + textW(F_MONO, chipSub(D))) * 1.06 + 34))
      if (x > 0 && x + w > W) { x = 0; y += rowH + 6 }
      chips.push({ d: dk, x, y, w }); x += w + 6
    }
    chipsH = y + rowH - HEAD2 + 12
    const fy = HEAD2 + chipsH, fw = mobile ? W : Math.round(W * 0.64)
    const fh = mobile ? 420 : openH - fy - 4
    if (mobile) openH = fy + fh + 8
    const axisL = mobile ? 64 : 92, floorH = 26
    const r = { x: 0, y: fy, w: fw, h: fh }
    field = { r, x0: axisL, w: fw - axisL - 8, colW: (fw - axisL - 8) / Math.max(1, P.months.length), top: fy + 52, bot: fy + fh - floorH - 30, floorY: fy + fh - floorH - 22, floorH }
    frames[`F:${d}`] = { kind: 'field', b, d, r, a: 1 }
    labs.push({ key: `f:${d}`, kind: 'ftitle', b, d, x: axisL, y: fy, w: fw - axisL })
    if (!mobile) side = { x: fw + 24, y: fy, w: W - fw - 24, h: fh }
  }

  frames[`B:${b}`] = { kind: 'open', b, r: { x: 0, y: 0, w: W, h: openH! }, a: 1 }
  labs.push({ key: `o:${b}`, kind: 'open', b, x: PAD, y: 10, w: W - 2 * PAD })
  // strips
  const sy = openH! + GUT
  const sw = mobile ? W : (W - 2 * GUT) / 3
  const kS = ((mobile ? W : sw) - 2 * PAD) / maxKnown
  others.forEach((o, i) => {
    const r = mobile ? { x: 0, y: sy + i * (STRIP + 8), w: W, h: STRIP } : { x: i * (sw + GUT), y: sy, w: sw, h: STRIP }
    frames[`B:${o.k}`] = { kind: 'strip', b: o.k, r, bar: { x: r.x + PAD, y: r.y + r.h - 12, w: known(o) * kS, h: 6 }, a: 1 }
    labs.push({ key: `s:${o.k}`, kind: 'strip', b: o.k, x: r.x + PAD, y: r.y + 8, w: r.w - 2 * PAD })
    if (M && T) for (const j of M.byBucket[BUCKETS.indexOf(o.k)]) { T.X[j] = r.x + PAD + hash(j) * (r.w - 2 * PAD); T.Y[j] = r.y + r.h - 12; T.R[j] = 1; T.A[j] = 0 }
  })
  H = mobile ? sy + others.length * (STRIP + 8) - 8 : plateH(W)

  if (!d) {
    // lanes: one per door, plain name at the left (mobile: above), marks, money bar
    let y = HEAD2
    const barW = W - LBL - (mobile ? 2 * PAD : 16 + PAD)
    doors.forEach((dk, j) => {
      const h = laneH[j], D = P.doors[doorIdx.get(dk)!]
      const mx = mobile ? PAD : LBL + 16
      const top = mobile ? y + 40 : y + 5
      frames[`L:${dk}`] = { kind: 'lane', b, d: dk, r: { x: 0, y, w: W, h }, bar: { x: mx, y: y + h - 9, w: (known(D) / maxDoor) * barW, h: 5 }, a: 1 }
      labs.push({ key: `l:${dk}`, kind: 'lane', b, d: dk, x: mobile ? PAD : 0, y: mobile ? y + 4 : y + Math.max(2, h / 2 - 19), w: mobile ? W - 2 * PAD : LBL - 8, small: !mobile && h < 40 })
      if (M && T) {
        grid(M.byDoor[doorIdx.get(dk)!], { x: mx, y: top, w: barW, h: y + h - 14 - top }, false, 7, T)
        for (const i of M.byDoor[doorIdx.get(dk)!]) T.D[i] = (j / Math.max(1, doors.length)) * 0.35 // lanes sort in one after another
      }
      y += h
    })
  } else if (M && T && field) {
    for (const dk of doors) {
      const ix = M.byDoor[doorIdx.get(dk)!]
      if (dk === d) {
        for (const i of ix) {
          T.X[i] = fieldX(field, M.m[i], i)
          T.Y[i] = M.kd[i] === 2 ? field.floorY + 4 + hash(i * 7) * (field.floorH - 8) : fieldY(field, deq(M.q[i], P.q))
          T.R[i] = 2.6; T.A[i] = 1; T.D[i] = hash(i * 3) * 0.3
        }
      } else {
        const c = chips.find((x) => x.d === dk)!
        for (const i of ix) { T.X[i] = c.x + hash(i) * c.w; T.Y[i] = c.y + 30; T.R[i] = 1; T.A[i] = 0 }
      }
    }
  }
  return { H, frames, field, fd: d, labs, chips, side, k }
}

/** The 45° hatch for ESTIMATED money (hue on paper). */
const hatches = new Map<string, CanvasPattern | null>()
function hatch(ctx: CanvasRenderingContext2D, hex: string) {
  if (hatches.has(hex)) return hatches.get(hex)!
  const p = document.createElement('canvas'); p.width = p.height = 6
  const g = p.getContext('2d')!
  g.strokeStyle = hex; g.lineWidth = 1.2
  g.beginPath(); g.moveTo(-1, 7); g.lineTo(7, -1); g.moveTo(-1, 1); g.lineTo(1, -1); g.moveTo(5, 7); g.lineTo(7, 5); g.stroke()
  const pat = ctx.createPattern(p, 'repeat'); hatches.set(hex, pat); return pat
}
function moneyBar(ctx: CanvasRenderingContext2D, r: R, a: PlateAgg, hex: string, fill = 1) {
  const tot = known(a) || 1, w = r.w * fill
  const wr = (w * (a.datos_v + a.ocr_v)) / tot
  ctx.fillStyle = hex; ctx.fillRect(r.x, r.y, wr, r.h)
  const pat = hatch(ctx, hex)
  if (pat && w - wr > 0) { ctx.fillStyle = pat; ctx.fillRect(r.x + wr, r.y, w - wr, r.h) }
  if (w > 1) { ctx.strokeStyle = hex; ctx.lineWidth = 1; ctx.strokeRect(r.x + 0.5, r.y + 0.5, Math.max(0, w - 1), r.h - 1) }
}

const MES = { es: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'], en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] }
const monthLbl = (ym: string | undefined, lang: Lang) => { if (!ym) return '—'; const [y, m] = ym.split('-'); return `${MES[lang][+m - 1]} ${y.slice(2)}` }
const SRC = (s: number, en: boolean) => [en ? 'ComprasMX open data' : 'datos abiertos de ComprasMX', en ? 'read off the award letter' : 'leído del oficio de fallo', en ? 'ComprasMX estimate (a budget, not an award)' : 'estimación de ComprasMX (presupuesto, no adjudicado)', en ? 'no amount published' : 'sin monto publicado'][s]
const KIND = (k: number, en: boolean) => [en ? 'with an amount' : 'con monto', en ? 'estimated' : 'estimado', en ? 'no amount' : 'sin monto'][k]

export function GapPlate({ lang }: { lang: Lang }) {
  const en = lang === 'en'
  const L = useCallback((es: string, e: string) => (en ? e : es), [en])
  const reduced = !!useReducedMotion()
  const qc = useQueryClient()
  const [params, setParams] = useSearchParams()

  // ── data: head (numbers) first, marks after; a door's awards lazily ────
  const head = useQuery({ queryKey: ['gap-plate', 'head'], queryFn: () => gapApi.getPlate<PlateHead>('head'), staleTime: 3_600_000 })
  const full = useQuery({ queryKey: ['gap-plate', 'all'], queryFn: () => gapApi.getPlate<Plate>('all'), staleTime: 3_600_000 })
  const P: PlateHead | undefined = full.data?.available ? full.data : head.data?.available ? head.data : undefined
  const M = useMemo(() => (full.data?.available ? markSet(full.data) : null), [full.data])
  useEffect(() => { if (!import.meta.env.DEV) return; const w = window as unknown as { __gapPerf?: Record<string, unknown> }; w.__gapPerf ??= { frames: [] as number[] }; if (head.data) w.__gapPerf.head ??= performance.now(); if (M) w.__gapPerf.marks ??= performance.now() }, [head.data, M])

  // ── URL is the state ──────────────────────────────────────────────────
  const qb = params.get('cubeta') as BucketKey | null
  const b: BucketKey | null = qb && BUCKETS.includes(qb) ? qb : null
  const qd = params.get('puerta')
  const d = b && qd && P?.doors.some((x) => x.k === qd && x.b === b) ? qd : null
  const marca = params.get('marca')
  const lens: Lens = params.get('lente') === 'dinero' ? 'dinero' : 'conteo'
  const setQ = useCallback((patch: Record<string, string | null>, push = false) => {
    setParams((p) => { const n = new URLSearchParams(p); for (const [k, v] of Object.entries(patch)) { if (v == null) n.delete(k); else n.set(k, v) } return n }, { replace: !push })
  }, [setParams])
  const openBucket = useCallback((k: BucketKey | null) => setQ({ cubeta: k, puerta: null, marca: null }, true), [setQ])
  const openDoor = useCallback((k: string | null) => setQ({ puerta: k, marca: null }, true), [setQ])

  const doorQ = useQuery({ queryKey: ['gap-plate-door', d], queryFn: () => gapApi.getPlateDoor<PlateDoorAwards>(d!), enabled: !!d, staleTime: 3_600_000 })
  const awards = d && doorQ.data?.door === d ? doorQ.data : null
  const card = useQuery({ queryKey: ['gap-plate-award', marca], queryFn: () => gapApi.getPlateAward<PlateAward>({ uuid: marca! }), enabled: !!marca, staleTime: 3_600_000 })
  // a cited award opens its bucket and door
  useEffect(() => {
    const c = card.data
    if (c && marca && c.uuid === marca && (c.bucket !== b || c.door !== d)) setQ({ cubeta: c.bucket, puerta: c.door })
  }, [card.data, marca, b, d, setQ])
  const prefetchDoor = (k: string) => qc.prefetchQuery({ queryKey: ['gap-plate-door', k], queryFn: () => gapApi.getPlateDoor<PlateDoorAwards>(k), staleTime: 3_600_000 })
  const openAward = async (i: number) => {
    if (!d) return
    const a = await qc.fetchQuery({ queryKey: ['gap-plate-award-i', d, i], queryFn: () => gapApi.getPlateAward<PlateAward>({ door: d, i }), staleTime: 3_600_000 })
    qc.setQueryData(['gap-plate-award', a.uuid], a)
    setQ({ marca: a.uuid }, true)
  }

  // ── hover (L1) ────────────────────────────────────────────────────────
  const [hot, setHotState] = useState<Hot>({})
  const hotRef = useRef<Hot>({})
  const setHot = useCallback((h: Hot) => {
    const o = hotRef.current
    if (o.b === h.b && o.d === h.d && o.buyer === h.buyer && o.mark === h.mark && o.award === h.award) return
    hotRef.current = h; setHotState(h)
  }, [])

  // ── geometry ──────────────────────────────────────────────────────────
  const wrap = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const tip = useRef<HTMLDivElement>(null)
  const [W, setW] = useState(0)
  useLayoutEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const mobile = W > 0 && W < MOBILE
  const [fontsOk, setFontsOk] = useState(false)
  useEffect(() => { document.fonts?.ready.then(() => setFontsOk(true)) }, [])
  const [lay, setLay] = useState<Lay | null>(null)

  // L0 beat: once per session; reduced motion and repeat visits draw the final frame
  const [play] = useState(() => beatOnce(reduced))
  const [beatOn, setBeatOn] = useState(play)
  useEffect(() => { if (!beatOn || !head.data) return; const id = window.setTimeout(() => setBeatOn(false), 1400); return () => window.clearTimeout(id) }, [beatOn, head.data])

  // engine state lives outside React: typed arrays, tween clocks, the cached base layer
  const E = useRef({
    n: 0, X0: new Float32Array(0), Y0: new Float32Array(0), R0: new Float32Array(0), A0: new Float32Array(0),
    XC: new Float32Array(0), YC: new Float32Array(0), RC: new Float32Array(0), AC: new Float32Array(0),
    T: null as Tgt | null, t0: 0, dur: 0, raf: 0, lay: null as Lay | null, from: {} as Record<string, Frame>, cur: {} as Record<string, Frame>,
    intro: play ? 0 : 1, introT0: 0, fieldA: 0, fieldT0: -1, fieldLayer: null as HTMLCanvasElement | null, fieldFor: '',
    FX: new Float32Array(0), FY: new Float32Array(0), base: null as HTMLCanvasElement | null, dirty: true, paper: '#fff',
    W: 0, H: 0, dpr: 1, frames: [] as number[], marksIn: false, degrade: false, slow: 0, busy: false,
  })

  const ensure = (n: number) => {
    const e = E.current
    if (e.n === n) return
    e.n = n
    for (const k of ['X0', 'Y0', 'R0', 'A0', 'XC', 'YC', 'RC', 'AC'] as const) e[k] = new Float32Array(n)
    e.T = { X: new Float32Array(n), Y: new Float32Array(n), R: new Float32Array(n), A: new Float32Array(n), D: new Float32Array(n) }
  }

  // ── drawing ───────────────────────────────────────────────────────────
  const drawScene = useCallback((ctx: CanvasRenderingContext2D) => {
    const e = E.current, lay = e.lay
    if (!lay || !P) return
    ctx.clearRect(0, 0, e.W, e.H)
    const intro = e.intro
    const lint = easeOut(clamp01(intro / 0.3)), floor = easeOut(clamp01((intro - 0.2) / 0.6))
    const aggOf = (f: Frame): PlateAgg => (f.d ? P.doors.find((x) => x.k === f.d)! : P.buckets.find((x) => x.k === f.b)!)
    for (const f of Object.values(e.cur)) {
      if (f.a < 0.02) continue
      const hue = BUCKET_HUE[f.b], r = f.r
      ctx.globalAlpha = f.a
      if (f.kind === 'cell' || f.kind === 'open' || f.kind === 'strip') {
        ctx.strokeStyle = RULE; ctx.lineWidth = 1; ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1)
        ctx.fillStyle = hue; ctx.fillRect(r.x, r.y, r.w * lint, 3)
        if (f.bar) {
          ctx.strokeStyle = INK; ctx.beginPath(); ctx.moveTo(r.x + PAD, f.bar.y + f.bar.h + 4.5); ctx.lineTo(r.x + r.w - PAD, f.bar.y + f.bar.h + 4.5); ctx.stroke()
          moneyBar(ctx, f.bar, aggOf(f), hue, floor)
        }
      } else if (f.kind === 'lane') {
        ctx.strokeStyle = RULE; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(r.x, r.y + r.h - 0.5); ctx.lineTo(r.x + r.w, r.y + r.h - 0.5); ctx.stroke()
        if (f.bar) moneyBar(ctx, f.bar, aggOf(f), hue)
      } else if (f.kind === 'field' && lay.field) drawAxes(ctx, lay.field, P.months, lang)
    }
    ctx.globalAlpha = 1
    if (M) drawMarks(ctx, M, e.XC, e.YC, e.RC, e.AC, e.degrade)
    if (e.fieldLayer && e.fieldA > 0 && lay.fd && e.fieldFor === lay.fd) {
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = e.fieldA; ctx.drawImage(e.fieldLayer, 0, 0); ctx.restore()
    }
  }, [P, M, lang])

  /** Hover never redraws the marks: base layer + veils + rings. */
  const compose = useCallback(() => {
    const e = E.current, cv = canvas.current, lay = e.lay
    if (!cv || !lay || !P || e.busy) return
    const ctx = cv.getContext('2d')!
    if (e.dirty || !e.base) {
      if (!e.base) e.base = document.createElement('canvas')
      e.base.width = cv.width; e.base.height = cv.height
      const bctx = e.base.getContext('2d')!
      bctx.setTransform(e.dpr, 0, 0, e.dpr, 0, 0)
      drawScene(bctx)
      e.dirty = false
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height); ctx.drawImage(e.base, 0, 0)
    ctx.setTransform(e.dpr, 0, 0, e.dpr, 0, 0)
    const h = hotRef.current
    // veils over everything that is not the hovered cell / lane
    ctx.fillStyle = e.paper
    if (h.b || h.d) for (const f of Object.values(e.cur)) {
      if (f.a < 0.5) continue
      const off = f.kind === 'lane' ? h.d != null && f.d !== h.d : f.kind === 'cell' && h.b != null && f.b !== h.b
      if (off) { ctx.globalAlpha = 0.62; ctx.fillRect(f.r.x - 1, f.r.y - 1, f.r.w + 2, f.r.h + 2) }
    }
    ctx.globalAlpha = 1
    // a buyer's money read, on every floor / lane bar it reaches
    if (h.buyer != null) {
      const rows = !b ? P.top : !d ? P.buckets.find((x) => x.k === b)!.top : P.doors.find((x) => x.k === d)!.top
      const row = rows.find((t) => t[0] === h.buyer)
      if (row && row[3] && !d) {
        const parts = !b ? BUCKETS : P.buckets.find((x) => x.k === b)!.doors
        parts.forEach((key, j) => {
          const f = e.cur[!b ? `B:${key}` : `L:${key}`]
          if (!f?.bar) return
          const agg = !b ? P.buckets.find((x) => x.k === key)! : P.doors.find((x) => x.k === key)!
          const w = known(agg) ? (f.bar.w * row[3]![j]) / known(agg) : 0
          ctx.fillStyle = INK; ctx.fillRect(f.bar.x, f.bar.y - 3, Math.max(w > 0 ? 2 : 0, w), f.bar.h + 6)
        })
      }
      if (d && awards && lay.field && e.fieldFor === d) {
        const name = P.buyers[h.buyer]
        const loc = awards.buyers.findIndex((x) => (name[0] != null ? x[0] === name[0] : x[1] === name[1]))
        if (loc >= 0) {
          ctx.strokeStyle = INK; ctx.lineWidth = 1.2; ctx.beginPath()
          for (let i = 0; i < awards.n; i++) if (awards.col.b[i] === loc) { ctx.moveTo(e.FX[i] + 4, e.FY[i]); ctx.arc(e.FX[i], e.FY[i], 4, 0, 6.2832) }
          ctx.stroke()
        }
      }
    }
    const ring = (x: number, y: number, r: number) => { ctx.strokeStyle = INK; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.stroke() }
    if (h.mark != null && e.AC[h.mark] > 0.5) ring(e.XC[h.mark], e.YC[h.mark], e.RC[h.mark] + 3)
    if (h.award != null && e.fieldFor === d) ring(e.FX[h.award], e.FY[h.award], 6)
    const c = card.data
    if (c && c.door === d && c.i != null && e.fieldFor === d && c.i < e.FX.length) { ring(e.FX[c.i], e.FY[c.i], 7); ring(e.FX[c.i], e.FY[c.i], 10) }
  }, [P, drawScene, b, d, awards, card.data])

  const tick = useCallback((now: number) => {
    const e = E.current, cv = canvas.current, T = e.T
    if (!cv || !e.lay) return
    const t0 = performance.now()
    const t = e.dur > 0 ? clamp01((now - e.t0) / e.dur) : 1
    // marks: per-mark delay (lane / cell groups), one eased clock
    if (T) {
      for (let i = 0; i < e.n; i++) {
        const s = easeIO(clamp01((t - T.D[i] * 0.4) / 0.6))
        e.XC[i] = lerp(e.X0[i], T.X[i], s); e.YC[i] = lerp(e.Y0[i], T.Y[i], s); e.RC[i] = lerp(e.R0[i], T.R[i], s); e.AC[i] = lerp(e.A0[i], T.A[i], s)
      }
    }
    // frames
    const ef = easeIO(t), cur: Record<string, Frame> = {}
    for (const [k, to] of Object.entries(e.lay.frames)) {
      const fr = e.from[k]
      const lr = (a: R | undefined, z: R): R => (a ? { x: lerp(a.x, z.x, ef), y: lerp(a.y, z.y, ef), w: lerp(a.w, z.w, ef), h: lerp(a.h, z.h, ef) } : z)
      cur[k] = { ...to, r: lr(fr?.r, to.r), bar: to.bar ? lr(fr?.bar, to.bar) : undefined, a: fr ? lerp(fr.a, to.a, ef) : ef }
    }
    for (const [k, fr] of Object.entries(e.from)) if (!(k in e.lay.frames) && fr.a * (1 - ef) > 0.02) cur[k] = { ...fr, a: fr.a * (1 - ef) }
    e.cur = cur
    // intro (lintels + floors) and the field cross-fade run on the same frame
    if (e.intro < 1) e.intro = clamp01((now - e.introT0) / 1150)
    if (e.fieldT0 >= 0) e.fieldA = reduced ? 1 : easeOut(clamp01((now - e.fieldT0) / 380))
    const ctx = cv.getContext('2d')!
    ctx.setTransform(e.dpr, 0, 0, e.dpr, 0, 0)
    drawScene(ctx)
    const ms = performance.now() - t0
    e.frames.push(Math.round(ms * 100) / 100)
    if (e.frames.length > 600) e.frames.shift()
    if (ms > 16 && ++e.slow >= 6) e.degrade = true // ponytail: one-way switch to square marks once a device misses a 60 Hz frame 6×
    if (import.meta.env.DEV) (window as unknown as { __gapPerf?: { frames: number[] } }).__gapPerf!.frames = e.frames
    const busy = t < 1 || e.intro < 1 || (e.fieldT0 >= 0 && e.fieldA < 1)
    e.busy = busy
    if (busy) e.raf = requestAnimationFrame(tick)
    else { e.dirty = true; compose() }
  }, [drawScene, compose, reduced])

  const retarget = useCallback((next: Lay, dur: number) => {
    const e = E.current
    cancelAnimationFrame(e.raf)
    e.X0.set(e.XC); e.Y0.set(e.YC); e.R0.set(e.RC); e.A0.set(e.AC)
    e.from = e.cur; e.lay = next
    e.t0 = performance.now(); e.dur = reduced ? 0 : dur; e.busy = true
    e.raf = requestAnimationFrame(tick)
  }, [tick, reduced])

  // canvas size + layout on every state change
  const first = useRef(true)
  useEffect(() => {
    if (!W || !P) return
    const e = E.current
    if (M) ensure(M.n)
    const next = layout(W, P, M, b, d, lens, mobile, M ? e.T : null, en)
    const cv = canvas.current!
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    if (e.W !== W || e.H !== next.H || e.dpr !== dpr) {
      e.W = W; e.H = next.H; e.dpr = dpr
      cv.width = Math.round(W * dpr); cv.height = Math.round(next.H * dpr)
      cv.style.width = `${W}px`; cv.style.height = `${next.H}px`
      e.fieldFor = ''
    }
    e.paper = getComputedStyle(cv).getPropertyValue('--color-background').trim() || e.paper
    setLay(next)
    if (first.current) {
      first.current = false
      e.introT0 = performance.now()
      e.from = {}; e.cur = {}
    }
    if (M && !e.marksIn) {
      // marks arrive: rain in from just above their place, the floor rows first
      e.marksIn = true
      const T = e.T!
      for (let i = 0; i < M.n; i++) {
        e.XC[i] = T.X[i]; e.YC[i] = T.Y[i] - (play ? 70 : 0); e.RC[i] = T.R[i]; e.AC[i] = 0
        const lay0 = next.frames[`B:${BUCKETS[M.bk[i]]}`]?.r
        T.D[i] = lay0 ? clamp01((lay0.y + lay0.h - T.Y[i]) / lay0.h) * 0.9 + (play ? M.bk[i] * 0.05 : 0) : 0
      }
      e.from = e.cur
      retarget(next, play ? 900 : 320)
      return
    }
    retarget(next, e.lay ? (d && e.lay.field ? 520 : 760) : 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [W, P, M, b, d, lens, mobile, en, fontsOk])

  // L3: a door's every award, cross-faded in once the marks have flown
  useEffect(() => {
    const e = E.current, F = lay?.field
    if (!d || !awards || !F || !P) { e.fieldT0 = -1; e.fieldA = 0; e.fieldFor = ''; return }
    const n = awards.n
    e.FX = new Float32Array(n); e.FY = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      const v = awards.col.v[i]
      e.FX[i] = fieldX(F, awards.col.m[i], i + 99991)
      e.FY[i] = v == null ? F.floorY + 4 + hash(i * 13) * (F.floorH - 8) : fieldY(F, v * 100)
    }
    const cv = canvas.current!
    const layer = e.fieldLayer ?? document.createElement('canvas')
    layer.width = cv.width; layer.height = cv.height
    const g = layer.getContext('2d')!
    g.setTransform(e.dpr, 0, 0, e.dpr, 0, 0); g.clearRect(0, 0, e.W, e.H)
    drawAwards(g, awards, e.FX, e.FY, BUCKET_HUE[b!])
    e.fieldLayer = layer; e.fieldFor = d
    const wait = Math.max(0, e.t0 + e.dur - performance.now())
    const id = window.setTimeout(() => {
      // the group marks of this door fade as its every award appears
      const T = e.T
      if (T && M) for (const i of M.byDoor[P.doors.findIndex((x) => x.k === d)]) { T.A[i] = 0; T.D[i] = 0 }
      e.fieldT0 = performance.now(); e.fieldA = 0; e.busy = true
      cancelAnimationFrame(e.raf)
      e.X0.set(e.XC); e.Y0.set(e.YC); e.R0.set(e.RC); e.A0.set(e.AC); e.from = e.cur
      e.t0 = performance.now(); e.dur = reduced ? 0 : 380
      e.raf = requestAnimationFrame(tick)
    }, wait)
    return () => window.clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [awards, lay?.field, d])

  useEffect(() => { compose() }, [hot, compose])
  useEffect(() => () => cancelAnimationFrame(E.current.raf), [])

  // Esc steps back: card → door → bucket
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape') return
      const t = ev.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return
      if (marca) setQ({ marca: null })
      else if (d) openDoor(null)
      else if (b) openBucket(null)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [marca, d, b, setQ, openDoor, openBucket])

  // ── pointer ───────────────────────────────────────────────────────────
  const inR = (r: R, x: number, y: number) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h
  const hit = (x: number, y: number): { b?: BucketKey; d?: string; mark?: number; award?: number } => {
    const e = E.current, lay = e.lay
    if (!lay) return {}
    if (lay.field && d && inR(lay.field.r, x, y) && e.fieldFor === d && e.fieldA > 0.5) {
      let best = -1, bd = 64
      for (let i = 0; i < e.FX.length; i++) { const dx = e.FX[i] - x, dy = e.FY[i] - y, dd = dx * dx + dy * dy; if (dd < bd) { bd = dd; best = i } }
      return { b: b!, d, award: best >= 0 ? best : undefined }
    }
    let region: { b?: BucketKey; d?: string } = {}
    for (const f of Object.values(lay.frames)) {
      if (f.kind === 'lane' && inR(f.r, x, y)) { region = { b: f.b, d: f.d }; break }
      if ((f.kind === 'cell' || f.kind === 'strip') && inR(f.r, x, y)) region = { b: f.b }
    }
    let mark: number | undefined
    if (M && (region.b || region.d)) {
      let bd = Infinity
      for (let i = 0; i < M.n; i++) {
        if (e.AC[i] < 0.5) continue
        const dx = e.XC[i] - x, dy = e.YC[i] - y, dd = dx * dx + dy * dy, lim = (e.RC[i] + 2.5) ** 2
        if (dd < lim && dd < bd) { bd = dd; mark = i }
      }
    }
    return { ...region, mark }
  }
  const showTip = (html: string | null, x = 0, y = 0) => {
    const el = tip.current
    if (!el) return
    if (!html) { el.hidden = true; return }
    el.innerHTML = html; el.hidden = false
    const ww = wrap.current!.clientWidth
    el.style.transform = `translate(${Math.max(0, Math.min(x + 14, ww - 320))}px, ${y + 16}px)`
  }
  const raf = useRef(0)
  const onMove = (ev: React.PointerEvent) => {
    const bx = wrap.current!.getBoundingClientRect(), x = ev.clientX - bx.left, y = ev.clientY - bx.top
    cancelAnimationFrame(raf.current)
    raf.current = requestAnimationFrame(() => {
      if (!P) return
      const h = hit(x, y)
      const cur = canvas.current!
      if (h.award != null && awards) {
        const v = awards.col.v[h.award], s = awards.col.s[h.award], who = awards.buyers[awards.col.b[h.award]]
        setHot({ b: h.b, award: h.award })
        showTip(`<b>${esc(formatEntityName('institution', who[1], 'full'))}</b><span class="gp-tip-m">${v == null ? esc(L('sin monto publicado', 'no amount published')) : esc(money(v * 100)) + (v * 100 > 1e10 ? ' †' : '')}</span><span>${esc(SRC(s, en))} · ${esc(monthLbl(P.months[awards.col.m[h.award]], lang))}</span><span class="gp-tip-h">${esc(L('clic: la adjudicación', 'click: the award'))}</span>`, x, y)
        cur.style.cursor = 'pointer'
        return
      }
      setHot({ b: h.b, d: h.d, mark: h.mark })
      if (h.mark != null && M) {
        const D = P.doors[M.dr[h.mark]], c = DOOR_COPY[D.k], n = M.c[h.mark], k = M.kd[h.mark]
        showTip(`<b>≈ ${n} ${esc(L('adjudicaciones', 'awards'))} · ${esc(L(c.es, c.en))}</b><span>${esc(KIND(k, en))}${k < 2 ? ` · ${esc(L('mediana', 'median'))} ${esc(money(deq(M.q[h.mark], P.q)))}` : ''} · ${esc(monthLbl(P.months[M.m[h.mark]], lang))}</span><span class="gp-tip-a">${esc(c.art)}</span>`, x, y)
      } else if (h.d) {
        const D = P.doors.find((z) => z.k === h.d)!, c = DOOR_COPY[D.k]
        showTip(`<b>${esc(L(c.es, c.en))}</b><span class="gp-tip-a">${esc(c.art)}</span><span>${esc(money(known(D)))} · ${nf(D.n)} ${esc(L('adjudicaciones', 'awards'))} · ${nf(D.none_n)} ${esc(L('sin monto', 'with no amount'))}</span><span class="gp-tip-h">${esc(L('clic: cada adjudicación', 'click: every award'))}</span>`, x, y)
      } else if (h.b) {
        const Bk = P.buckets.find((z) => z.k === h.b)!
        showTip(`<b>${esc(L(BUCKET_COPY[Bk.k].es, BUCKET_COPY[Bk.k].en))}</b><span>${esc(money(known(Bk)))} · ${pct(known(Bk), known(P.meta))} ${esc(L('del monto conocido', 'of the known amount'))}</span><span>${nf(Bk.n)} ${esc(L('adjudicaciones', 'awards'))} (${pct(Bk.n, P.meta.n)})</span><span class="gp-tip-h">${esc(b === h.b ? '' : L('clic: abrir', 'click: open'))}</span>`, x, y)
      } else showTip(null)
      cur.style.cursor = h.d || (h.b && h.b !== b) ? 'pointer' : 'default'
      if (h.d && !d) prefetchDoor(h.d)
    })
  }
  const onLeave = () => { cancelAnimationFrame(raf.current); showTip(null); setHot({}) }
  const onClick = (ev: React.MouseEvent) => {
    const bx = wrap.current!.getBoundingClientRect(), h = hit(ev.clientX - bx.left, ev.clientY - bx.top)
    if (h.award != null) { showTip(null); void openAward(h.award); return }
    if (h.d && h.d !== d) openDoor(h.d)
    else if (h.b && h.b !== b) openBucket(h.b)
  }

  // ── Citar (L5) ────────────────────────────────────────────────────────
  const [copied, setCopied] = useState<string | null>(null)
  const copyT = useRef(0)
  useEffect(() => () => window.clearTimeout(copyT.current), [])
  const cite = (what: 'page' | 'card') => {
    if (!P) return
    const url = window.location.href, win = P.window.replace(' .. ', ' – ')
    let text: string
    const c = card.data
    if (what === 'card' && c) {
      const dc = DOOR_COPY[c.door]
      text = L(`${c.institution ?? ''} adjudicó ${c.amount_mxn != null ? money(c.amount_mxn) : 'un monto no publicado'} por «${dc.es}» (${c.article ?? dc.art}), procedimiento ${c.procedure_number ?? c.uuid}, ${c.date ?? ''}. RUBLI con datos de ComprasMX.`,
        `${c.institution ?? ''} awarded ${c.amount_mxn != null ? money(c.amount_mxn) : 'an unpublished amount'} through «${dc.en}» (${c.article ?? dc.art}), procedure ${c.procedure_number ?? c.uuid}, ${c.date ?? ''}. RUBLI, ComprasMX data.`)
    } else if (d) {
      const D = P.doors.find((x) => x.k === d)!, dc = DOOR_COPY[d]
      text = L(`«${dc.es}» (${dc.art}): ${nf(D.n)} adjudicaciones sin CompraNet, ${money(known(D))} con monto conocido en ${nf(knownN(D))} (ComprasMX, ${win}). RUBLI.`,
        `«${dc.en}» (${dc.art}): ${nf(D.n)} awards without CompraNet, ${money(known(D))} where the amount is known for ${nf(knownN(D))} (ComprasMX, ${win}). RUBLI.`)
    } else if (b) {
      const Bk = P.buckets.find((x) => x.k === b)!, bc = BUCKET_COPY[b]
      text = L(`${bc.es}: ${nf(Bk.n)} adjudicaciones sin CompraNet, ${money(known(Bk))} (${pct(known(Bk), known(P.meta))} del monto conocido; ComprasMX, ${win}). RUBLI.`,
        `${bc.en}: ${nf(Bk.n)} awards without CompraNet, ${money(known(Bk))} (${pct(known(Bk), known(P.meta))} of the known amount; ComprasMX, ${win}). RUBLI.`)
    } else {
      const parts = P.buckets.map((x) => `${L(BUCKET_COPY[x.k].es, BUCKET_COPY[x.k].en).toLowerCase()} ${pct(known(x), known(P.meta))}`).join(', ')
      text = L(`Sin CompraNet, ${nf(P.meta.n)} adjudicaciones federales y ${money(known(P.meta))} con monto conocido salieron así: ${parts} (ComprasMX, ${win}). RUBLI.`,
        `Without CompraNet, ${nf(P.meta.n)} federal awards and ${money(known(P.meta))} with a known amount left this way: ${parts} (ComprasMX, ${win}). RUBLI.`)
    }
    navigator.clipboard?.writeText(`${text} ${url}`).then(() => { setCopied(what); window.clearTimeout(copyT.current); copyT.current = window.setTimeout(() => setCopied(null), 1600) }, () => setCopied(null))
  }

  // ── render ────────────────────────────────────────────────────────────
  const meta = P?.meta
  const Bsel = P && b ? P.buckets.find((x) => x.k === b)! : null
  const Dsel = P && d ? P.doors.find((x) => x.k === d)! : null
  const ledger: LedgerSpec | null = !P ? null
    : Dsel ? { title: L(`Quién compró · ${DOOR_COPY[Dsel.k].es}`, `Who bought · ${DOOR_COPY[Dsel.k].en}`), rows: Dsel.top, parts: null, hue: BUCKET_HUE[Dsel.b] }
      : Bsel ? { title: L(`Quién compró · ${BUCKET_COPY[Bsel.k].es}`, `Who bought · ${BUCKET_COPY[Bsel.k].en}`), rows: Bsel.top, parts: Bsel.doors, hue: BUCKET_HUE[Bsel.k] }
        : { title: L('Quién compró · las cuatro puertas', 'Who bought · the four doors'), rows: P.top, parts: BUCKETS, hue: INK }

  return (
    <section className="gp" aria-labelledby="gp-h1">
      <h1 id="gp-h1" className="gp-h1">{L('¿Por qué puerta salió el dinero sin CompraNet?', 'Through which door did the money leave without CompraNet?')}</h1>
      <dl className="gp-figs">
        <div><dt>{L('Adjudicaciones', 'Awards')}</dt><dd><Count v={meta?.n} fmt={nf} play={beatOn} /></dd><span className="gp-fig-x">{L('desde el 28 sep 2025', 'since 28 Sep 2025')}</span></div>
        <div><dt>{L('Monto conocido', 'Known amount')}</dt><dd><Count v={meta ? known(meta) : undefined} fmt={money} play={beatOn} /></dd><span className="gp-fig-x">{meta ? L(`en ${nf(knownN(meta))} · ${money(meta.datos_v)} de datos abiertos`, `on ${nf(knownN(meta))} · ${money(meta.datos_v)} from open data`) : ''}</span></div>
        <div><dt>{L('Sin monto', 'No amount')}</dt><dd>{meta ? nf(meta.none_n) : '—'}</dd></div>
        <div className="is-flag"><dt>† {L('Más de', 'Above')} <span className="gp-num">{L('10,000 MDP', '10B MXN')}</span></dt><dd>{meta ? nf(meta.flag_n) : '—'}</dd><span className="gp-fig-x">{L('a revisar; ninguna pasa de 100,000 MDP', 'to review; none above 100B')}</span></div>
      </dl>

      <div className="gp-bar">
        <nav className="gp-crumbs" aria-label={L('Nivel', 'Level')}>
          {b ? <button type="button" onClick={() => openBucket(null)}>{L('Las cuatro puertas', 'The four doors')}</button> : <b>{L('Las cuatro puertas', 'The four doors')}</b>}
          {b && <><span aria-hidden="true">›</span>{d ? <button type="button" onClick={() => openDoor(null)}>{L(BUCKET_COPY[b].es, BUCKET_COPY[b].en)}</button> : <b>{L(BUCKET_COPY[b].es, BUCKET_COPY[b].en)}</b>}</>}
          {d && <><span aria-hidden="true">›</span><b>{L(DOOR_COPY[d].es, DOOR_COPY[d].en)}</b></>}
        </nav>
        <div className="gp-lens" role="group" aria-label={L('Medida', 'Measure')}>
          <button type="button" aria-pressed={lens === 'conteo'} onClick={() => setQ({ lente: null })}>{L('Por adjudicaciones', 'By awards')}</button>
          <button type="button" aria-pressed={lens === 'dinero'} onClick={() => setQ({ lente: 'dinero' })}>{L('Por dinero', 'By money')}</button>
        </div>
        <button type="button" className="gp-cite" onClick={() => cite('page')}>{copied === 'page' ? L('Copiado', 'Copied') : L('Citar', 'Cite')}</button>
      </div>

      <div className="gp-key" aria-label={L('Leyenda', 'Legend')}>
        {BUCKETS.map((k) => (
          <button key={k} type="button" className={`gp-chipb${hot.b === k || b === k ? ' is-on' : ''}`} aria-pressed={b === k}
            onPointerEnter={() => setHot({ b: k })} onPointerLeave={() => setHot({})} onFocus={() => setHot({ b: k })} onBlur={() => setHot({})}
            onClick={() => openBucket(b === k ? null : k)}>
            <i style={{ background: BUCKET_HUE[k] }} aria-hidden="true" />{L(BUCKET_COPY[k].es, BUCKET_COPY[k].en)}
          </button>
        ))}
        <span className="gp-sep" aria-hidden="true" />
        <span>{d ? L('1 marca = 1 adjudicación', '1 mark = 1 award') : L(`1 marca ≈ ${P?.per ?? 10} adjudicaciones`, `1 mark ≈ ${P?.per ?? 10} awards`)}</span>
        <span><i className="gp-sw is-solid" aria-hidden="true" />{L('monto de datos abiertos', 'open-data amount')}</span>
        <span><i className="gp-sw is-ring" aria-hidden="true" />{L('estimado', 'estimated')}</span>
        <span><i className="gp-sw is-none" aria-hidden="true" />{L('sin monto', 'no amount')}</span>
        <span className="gp-key-floor"><i className="gp-sw is-floor" aria-hidden="true" />{L('piso: dinero conocido · rayado = estimado', 'floor: known money · hatched = estimated')}</span>
      </div>

      <div ref={wrap} className={`gp-plate${lay?.side ? ' has-side' : ''}`} style={{ height: lay?.H ?? (mobile ? 1200 : plateH(W || 1200)) }}
        onPointerMove={onMove} onPointerLeave={onLeave} onClick={onClick} aria-busy={!M}>
        <canvas ref={canvas} role="img" aria-label={P ? L(
          `Cuatro puertas: ${P.buckets.map((x) => `${BUCKET_COPY[x.k].es}, ${nf(x.n)} adjudicaciones y ${money(known(x))}`).join('; ')}. Una marca equivale a unas ${P.per} adjudicaciones. La tabla completa está en la vista Lista.`,
          `Four doors: ${P.buckets.map((x) => `${BUCKET_COPY[x.k].en}, ${nf(x.n)} awards and ${money(known(x))}`).join('; ')}. One mark is about ${P.per} awards. The full table is in the List view.`) : L('Cargando la placa', 'Loading the plate')} />
        {P && lay?.labs.map((l) => <Label key={l.key} l={l} P={P} lang={lang} hot={hot} play={beatOn}
          onOpen={() => (l.kind === 'lane' ? openDoor(l.d!) : l.kind === 'cell' || l.kind === 'strip' ? openBucket(l.b) : undefined)}
          onHot={(on) => setHot(on ? (l.kind === 'lane' ? { b: l.b, d: l.d } : { b: l.b }) : {})} onPrefetch={() => l.d && prefetchDoor(l.d)} />)}
        {P && lay?.chips.map((c) => {
          const D = P.doors.find((x) => x.k === c.d)!
          return (
            <button key={c.d} type="button" className={`gp-dchip${c.d === d ? ' is-on' : ''}`} style={{ transform: `translate(${c.x}px, ${c.y}px)`, width: c.w, ['--hue' as string]: BUCKET_HUE[D.b] }}
              aria-pressed={c.d === d} title={DOOR_COPY[c.d].art} onClick={(e) => { e.stopPropagation(); openDoor(c.d === d ? null : c.d) }}
              onPointerEnter={() => prefetchDoor(c.d)}>
              <span>{L(DOOR_COPY[c.d].es, DOOR_COPY[c.d].en)}</span><small>{chipSub(D)}</small>
            </button>
          )
        })}
        {d && !awards && <p className="gp-loading" style={{ transform: `translate(${(lay?.field?.x0 ?? 0) + 8}px, ${(lay?.field?.r.y ?? 0) + 34}px)` }} role="status">{L('Cargando cada adjudicación…', 'Loading every award…')}</p>}
        {lay?.side && ledger && !marca && (
          <div className="gp-side" style={{ transform: `translate(${lay.side.x}px, ${lay.side.y}px)`, width: lay.side.w }} onClick={(e) => e.stopPropagation()}>
            <Ledger P={P!} ledger={ledger} lang={lang} hot={hot} setHot={setHot} compact />
          </div>
        )}
        {marca && card.data && lay?.side && <Card a={card.data} lang={lang} onClose={() => setQ({ marca: null })} onCite={() => cite('card')} copied={copied === 'card'} style={{ transform: `translate(${lay.side.x}px, ${lay.side.y}px)`, width: lay.side.w }} />}
        <div ref={tip} className="gp-tip" hidden role="status" />
      </div>
      {head.isError && full.isError && <p role="alert" className="ct-note">{L('No se pudo cargar la placa. Prueba la vista Lista.', 'The plate failed to load. Try the List view.')}</p>}

      {marca && card.data && !lay?.side && <Card a={card.data} lang={lang} onClose={() => setQ({ marca: null })} onCite={() => cite('card')} copied={copied === 'card'} />}
      {P && ledger && !lay?.side && <Ledger P={P} ledger={ledger} lang={lang} hot={hot} setHot={setHot} />}
      <p className="gp-note">{L(
        'Montos de los datos abiertos de ComprasMX (suma de los contratos de cada procedimiento); donde no hay contrato publicado, el leído del oficio de fallo o la estimación de ComprasMX, que es un presupuesto y no lo adjudicado. Los compradores se ordenan por el monto de datos abiertos u oficio, nunca por estimaciones. Ninguna persona física se nombra.',
        'Amounts from ComprasMX open data (the sum of each procedure’s contracts); where no contract is published, the amount read off the award letter or the ComprasMX estimate, which is a budget, not what was awarded. Buyers are ranked by open-data or letter amounts, never by estimates. No individual is named.')}</p>
    </section>
  )
}

/** Batched marks: one counting-sort pass into hue × kind × alpha-step bins, then one path per bin. */
const STEPS = 4, NBIN = BUCKETS.length * 3 * STEPS
const binCount = new Int32Array(NBIN), binStart = new Int32Array(NBIN + 1)
let binOf = new Int16Array(0), order = new Int32Array(0)
function drawMarks(ctx: CanvasRenderingContext2D, M: MarkSet, X: Float32Array, Y: Float32Array, Rr: Float32Array, A: Float32Array, square: boolean) {
  const n = M.n
  if (binOf.length < n) { binOf = new Int16Array(n); order = new Int32Array(n) }
  binCount.fill(0)
  for (let i = 0; i < n; i++) {
    const a = A[i]
    if (a <= 0.02) { binOf[i] = -1; continue }
    const id = (M.bk[i] * 3 + M.kd[i]) * STEPS + Math.min(STEPS - 1, Math.ceil(a * STEPS) - 1)
    binOf[i] = id; binCount[id]++
  }
  binStart[0] = 0
  for (let k = 0; k < NBIN; k++) binStart[k + 1] = binStart[k] + binCount[k]
  binCount.fill(0)
  for (let i = 0; i < n; i++) { const id = binOf[i]; if (id >= 0) order[binStart[id] + binCount[id]++] = i }
  for (let id = 0; id < NBIN; id++) {
    const lo = binStart[id], hi = binStart[id + 1]
    if (lo === hi) continue
    const step = id % STEPS, kind = Math.floor(id / STEPS) % 3, hue = BUCKET_HUE[BUCKETS[Math.floor(id / (STEPS * 3))]]
    ctx.beginPath()
    for (let j = lo; j < hi; j++) {
      const i = order[j], r = kind === 2 ? Rr[i] * 0.85 : Rr[i], x = X[i], y = Y[i]
      if (square || r < 1.1) ctx.rect(x - r, y - r, r * 2, r * 2)
      else { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, 6.2832) }
    }
    ctx.globalAlpha = (step + 1) / STEPS
    if (kind === 0) { ctx.fillStyle = hue; ctx.fill() }
    else if (kind === 1) { ctx.strokeStyle = hue; ctx.lineWidth = 1; ctx.stroke() }
    else { ctx.fillStyle = LIGHT; ctx.fill() }
  }
  ctx.globalAlpha = 1
}

/** L3 field axes: printed log rungs, the «sin monto» floor, months. */
function drawAxes(ctx: CanvasRenderingContext2D, F: FieldGeo, months: string[], lang: Lang) {
  ctx.save()
  ctx.font = F_MONO; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'
  for (let p = LOG_LO; p <= LOG_HI; p++) {
    const y = fieldY(F, Math.pow(10, p))
    ctx.strokeStyle = RULE; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(F.x0, Math.round(y) + 0.5); ctx.lineTo(F.x0 + F.w, Math.round(y) + 0.5); ctx.stroke()
    ctx.fillStyle = GRAY; ctx.fillText(formatCompactMXN(Math.pow(10, p)).replace(/\.0(?= )/, ''), F.x0 - 8, y)
  }
  ctx.fillStyle = WASH; ctx.fillRect(F.x0, F.floorY, F.w, F.floorH)
  ctx.setLineDash([3, 3]); ctx.strokeStyle = LIGHT; ctx.beginPath(); ctx.moveTo(F.x0, F.floorY + 0.5); ctx.lineTo(F.x0 + F.w, F.floorY + 0.5); ctx.stroke(); ctx.setLineDash([])
  ctx.fillStyle = GRAY; ctx.fillText(lang === 'en' ? 'no amount' : 'sin monto', F.x0 - 8, F.floorY + F.floorH / 2)
  ctx.textAlign = 'center'; ctx.textBaseline = 'top'
  const step = F.colW < 44 ? 2 : 1
  months.forEach((m, i) => { if (i % step === 0) ctx.fillText(monthLbl(m, lang), F.x0 + (i + 0.5) * F.colW, F.floorY + F.floorH + 6) })
  ctx.restore()
}

/** Every award of a door, drawn once into the field layer. */
function drawAwards(g: CanvasRenderingContext2D, A: PlateDoorAwards, FX: Float32Array, FY: Float32Array, hue: string) {
  const n = A.n, r = n > 12000 ? 1.3 : n > 3000 ? 1.8 : 2.4
  const pass = (pick: (s: number) => boolean, paint: () => void, rad: number) => {
    g.beginPath()
    for (let i = 0; i < n; i++) if (pick(A.col.s[i])) { if (rad < 1.1) g.rect(FX[i] - rad, FY[i] - rad, rad * 2, rad * 2); else { g.moveTo(FX[i] + rad, FY[i]); g.arc(FX[i], FY[i], rad, 0, 6.2832) } }
    paint()
  }
  pass((s) => s === 3, () => { g.fillStyle = LIGHT; g.fill() }, 1.1)
  pass((s) => s === 2, () => { g.strokeStyle = hue; g.lineWidth = 1; g.globalAlpha = 0.9; g.stroke(); g.globalAlpha = 1 }, r)
  pass((s) => s < 2, () => { g.fillStyle = hue; g.globalAlpha = n > 3000 ? 0.55 : 0.8; g.fill(); g.globalAlpha = 1 }, r)
  // † above 10,000 MDP: the amount printed beside the mark, stacked so no two labels touch
  g.font = '600 13px Spectral, Georgia, serif'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillStyle = INK
  const big: number[] = []
  for (let i = 0; i < n; i++) { const v = A.col.v[i]; if (v != null && v * 100 > 1e10) big.push(i) }
  big.sort((a, c) => FY[a] - FY[c])
  let lastY = -1e9
  for (const i of big) {
    const y = Math.max(FY[i], lastY + 15)
    g.fillText(`† ${formatCompactMXN(A.col.v[i]! * 100)}`, FX[i] + 7, y)
    if (y !== FY[i]) { g.strokeStyle = LIGHT; g.lineWidth = 1; g.beginPath(); g.moveTo(FX[i] + 2, FY[i]); g.lineTo(FX[i] + 6, y); g.stroke() }
    lastY = y
  }
}

/** A count-up for the head figures, once per session (700 ms). */
function Count({ v, fmt, play }: { v: number | undefined; fmt: (n: number) => string; play: boolean }) {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || v == null) return
    if (!play) { el.textContent = fmt(v); return }
    const t0 = performance.now()
    let id = 0
    const f = (now: number) => { const t = easeOut(clamp01((now - t0) / 700)); el.textContent = fmt(v * t); if (t < 1) id = requestAnimationFrame(f) }
    id = requestAnimationFrame(f)
    return () => cancelAnimationFrame(id)
  }, [v, fmt, play])
  return <span ref={ref}>{v == null ? '—' : play ? fmt(0) : fmt(v)}</span>
}

function Label({ l, P, lang, hot, play, onOpen, onHot, onPrefetch }: {
  l: Lab; P: PlateHead; lang: Lang; hot: Hot; play: boolean
  onOpen: () => void; onHot: (on: boolean) => void; onPrefetch: () => void
}) {
  const en = lang === 'en'
  const L = (es: string, e: string) => (en ? e : es)
  const Bk = P.buckets.find((x) => x.k === l.b)!
  const dim = (l.kind === 'cell' || l.kind === 'strip') ? hot.b != null && hot.b !== l.b : l.kind === 'lane' ? hot.d != null && hot.d !== l.d : false
  const style = { transform: `translate(${l.x}px, ${l.y}px)`, width: l.w, ['--hue' as string]: BUCKET_HUE[l.b], ['--hue-t' as string]: BUCKET_TEXT[l.b] }
  const stop = (e: React.SyntheticEvent) => e.stopPropagation()
  if (l.kind === 'cell') {
    return (
      <button type="button" className={`gp-lab gp-cell${l.small ? ' is-small' : ''}${dim ? ' is-dim' : ''}`} style={style}
        onClick={(e) => { stop(e); onOpen() }} onPointerEnter={() => onHot(true)} onPointerLeave={() => onHot(false)} onFocus={() => onHot(true)} onBlur={() => onHot(false)}
        aria-label={L(`${BUCKET_COPY[l.b].es}: ${money(known(Bk))}, ${nf(Bk.n)} adjudicaciones. Abrir sus puertas`, `${BUCKET_COPY[l.b].en}: ${money(known(Bk))}, ${nf(Bk.n)} awards. Open its doors`)}>
        <span className="gp-nm">{L(BUCKET_COPY[l.b].es, BUCKET_COPY[l.b].en)}</span>
        <span className="gp-big"><Count v={known(Bk)} fmt={money} play={play} /><i>{pct(known(Bk), known(P.meta))}</i></span>
        <span className="gp-kn">{nf(Bk.n)} {L('adjudicaciones', 'awards')} · {L(`monto conocido en ${nf(knownN(Bk))}`, `amount known for ${nf(knownN(Bk))}`)}</span>
        {!l.small && <span className="gp-say">{L(BUCKET_COPY[l.b].say_es, BUCKET_COPY[l.b].say_en)}</span>}
      </button>
    )
  }
  if (l.kind === 'open') {
    return (
      <div className="gp-lab gp-open" style={style}>
        <span className="gp-nm">{L(BUCKET_COPY[l.b].es, BUCKET_COPY[l.b].en)}</span>
        <span className="gp-big">{money(known(Bk))}<i>{nf(Bk.n)} {L('adjudicaciones', 'awards')} · {L(`${nf(knownN(Bk))} con monto`, `${nf(knownN(Bk))} with an amount`)} · {Bk.doors.length} {L('puertas de la ley', 'doors in the law')}</i></span>
      </div>
    )
  }
  if (l.kind === 'strip') {
    return (
      <button type="button" className={`gp-lab gp-strip${dim ? ' is-dim' : ''}`} style={style} onClick={(e) => { stop(e); onOpen() }}
        onPointerEnter={() => onHot(true)} onPointerLeave={() => onHot(false)}>
        <span className="gp-nm">{L(BUCKET_COPY[l.b].es, BUCKET_COPY[l.b].en)}</span>
        <span className="gp-kn">{money(known(Bk))} · {nf(Bk.n)} {L('adj.', 'awards')}</span>
      </button>
    )
  }
  const D = P.doors.find((x) => x.k === l.d)!, c = DOOR_COPY[D.k]
  if (l.kind === 'lane') {
    return (
      <button type="button" className={`gp-lab gp-lane${l.small ? ' is-small' : ''}${dim ? ' is-dim' : ''}${hot.d === l.d ? ' is-on' : ''}`} style={style} title={c.art}
        onClick={(e) => { stop(e); onOpen() }} onPointerEnter={() => { onHot(true); onPrefetch() }} onPointerLeave={() => onHot(false)} onFocus={() => { onHot(true); onPrefetch() }} onBlur={() => onHot(false)}>
        <span className="gp-nm">{L(c.es, c.en)}</span>
        <span className="gp-kn">{known(D) ? money(known(D)) : '—'} · {nf(D.n)} {L('adj.', 'awards')}{D.none_n ? ` · ${nf(D.none_n)} ${L('sin monto', 'no amount')}` : ''}</span>
      </button>
    )
  }
  return (
    <div className="gp-lab gp-ftitle" style={style}>
      <span className="gp-nm">{L(c.es, c.en)} <small>{c.art}</small></span>
      <span className="gp-kn">{nf(D.n)} {L('adjudicaciones', 'awards')} · {money(known(D))} {L(`con monto conocido en ${nf(knownN(D))}`, `with the amount known for ${nf(knownN(D))}`)}{D.flag_n ? ` · ${D.flag_n} †` : ''}</span>
    </div>
  )
}

interface LedgerSpec { title: string; rows: TopRow[]; parts: string[] | null; hue: string }
function Ledger({ P, ledger, lang, hot, setHot, compact }: {
  P: PlateHead; ledger: LedgerSpec; lang: Lang; hot: Hot; setHot: (h: Hot) => void; compact?: boolean
}) {
  const en = lang === 'en'
  const L = (es: string, e: string) => (en ? e : es)
  const max = Math.max(1, ...ledger.rows.map((t) => t[2]))
  const partHue = (p: string) => BUCKET_HUE[(BUCKETS as string[]).includes(p) ? (p as BucketKey) : P.doors.find((x) => x.k === p)!.b]
  return (
    <div className={`gp-ledger${compact ? ' is-compact' : ''}`}>
      <div className="gp-lg-h"><b>{ledger.title}</b><span>{L('por monto de datos abiertos u oficio', 'by open-data or letter amount')}</span></div>
      {ledger.rows.map((t) => {
        const who = P.buyers[t[0]], on = hot.buyer === t[0]
        return (
          <div key={t[0]} className={`gp-lg-row${on ? ' is-on' : ''}${hot.buyer != null && !on ? ' is-dim' : ''}`}
            onPointerEnter={() => setHot({ buyer: t[0] })} onPointerLeave={() => setHot({})}>
            <span className="gp-lg-name">
              {who[0] != null
                ? <EntityIdentityChip type="institution" id={who[0]} name={who[1]} size="sm" fullName hideIcon onFocus={() => setHot({ buyer: t[0] })} onBlur={() => setHot({})} />
                : <span>{formatEntityName('institution', who[1], 'full')}</span>}
            </span>
            <span className="gp-lg-v">{money(t[2])}<i>{nf(t[1])} {L('adj.', 'awards')}</i></span>
            <span className="gp-lg-bar" aria-hidden="true">
              {ledger.parts && t[3]
                ? ledger.parts.map((p, j) => {
                  const isB = (BUCKETS as string[]).includes(p)
                  const off = isB ? hot.b != null && hot.b !== p : hot.d != null && hot.d !== p
                  return t[3]![j] > 0 ? <i key={p} className={off ? 'is-dim' : ''} style={{ width: `${(100 * t[3]![j]) / max}%`, background: partHue(p) }} /> : null
                })
                : <i style={{ width: `${(100 * t[2]) / max}%`, background: ledger.hue }} />}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function Card({ a, lang, onClose, onCite, copied, style }: { a: PlateAward; lang: Lang; onClose: () => void; onCite: () => void; copied: boolean; style?: React.CSSProperties }) {
  const en = lang === 'en'
  const L = (es: string, e: string) => (en ? e : es)
  const closeRef = useRef<HTMLButtonElement>(null)
  usePanelFocus(closeRef)
  const dc = DOOR_COPY[a.door]
  const pfMore = a.n_persona_fisica - (a.persona_fisica ? 1 : 0)
  const vendor = a.vendor
    ? (a.vendor_id != null ? <EntityIdentityChip type="vendor" id={a.vendor_id} name={a.vendor} size="inherit" fullName /> : <span>{formatVendorName(a.vendor, 999)}</span>)
    : <span className="gp-card-mute">{a.vendor_note === 'pf' ? L('Persona física, nombre no publicado', 'An individual, name not published') : a.vendor_note === 'self_buyer' ? L('El oficio nombra al comprador, no al proveedor', 'The letter names the buyer, not the vendor') : L('Sin proveedor publicado', 'No vendor published')}</span>
  return (
    <aside className="gp-card" style={{ ...style, ['--hue' as string]: BUCKET_HUE[a.bucket] }} aria-label={L('Adjudicación', 'Award')} onClick={(e) => e.stopPropagation()} onPointerMove={(e) => e.stopPropagation()}>
      <button ref={closeRef} type="button" className="gp-card-x" onClick={onClose} aria-label={L('Cerrar', 'Close')}>Esc ✕</button>
      <div className="gp-card-k">{L(BUCKET_COPY[a.bucket].es, BUCKET_COPY[a.bucket].en)} · {L(dc.es, dc.en)}</div>
      <div className="gp-card-amt">{a.amount_mxn != null ? formatCompactMXN(a.amount_mxn) : L('Sin monto', 'No amount')}{a.flag ? ' †' : ''}</div>
      <p className="gp-card-src">{SRC(a.source, en)}{a.source === 0 && a.n_contracts > 1 ? L(` · suma de ${a.n_contracts} contratos`, ` · sum of ${a.n_contracts} contracts`) : ''}{a.flag ? L(' · más de 10,000 MDP: a revisar', ' · above 10B MXN: to review') : ''}</p>
      <dl className="gp-card-kv">
        <dt>{L('Comprador', 'Buyer')}</dt>
        <dd>{a.institution_id != null ? <EntityIdentityChip type="institution" id={a.institution_id} name={a.institution} size="inherit" fullName /> : formatEntityName('institution', a.institution, 'full')}</dd>
        <dt>{L('Proveedor', 'Vendor')}</dt><dd>{vendor}{a.persona_fisica ? <small className="gp-card-mute">{L(' · persona física', ' · individual (persona física)')}</small> : null}{pfMore > 0 && a.vendor ? <small className="gp-card-mute">{L(` · y ${pfMore} persona(s) física(s) más`, ` · and ${pfMore} more individual(s)`)}</small> : null}</dd>
        <dt>{L('Fundamento', 'Legal ground')}</dt><dd>{a.article ?? dc.art}</dd>
        <dt>{L('Procedimiento', 'Procedure')}</dt><dd className="gp-mono">{a.procedure_number ?? '—'}</dd>
        <dt>{L('Publicado', 'Published')}</dt><dd className="gp-mono">{a.date ?? '—'}</dd>
      </dl>
      {a.title && <p className="gp-card-t">{a.title.charAt(0) + a.title.slice(1).toLowerCase()}</p>}
      <div className="gp-card-act">
        <a className="ct-link" href={COMPRASMX_DETAIL(a.uuid)} target="_blank" rel="noopener noreferrer">{L('Abrir en ComprasMX', 'Open on ComprasMX')}<ExternalLink className="h-4 w-4" aria-hidden="true" /></a>
        <button type="button" className="gp-cite" onClick={onCite}>{copied ? L('Copiado', 'Copied') : L('Citar', 'Cite')}</button>
      </div>
    </aside>
  )
}
