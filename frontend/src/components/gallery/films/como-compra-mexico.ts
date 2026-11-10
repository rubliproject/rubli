/**
 * «Cómo compra México» — 2002–2025 of federal buying as one miniature city on a table, under
 * one light (the Fern direction). The recurring set is THE AVENUE: one tower per year of the
 * record, its height = the contracts recorded that year; the camera returns to it in shots 0,
 * 9 and 13. In between, each government gets its own set piece: a wall of drawers, the
 * CompraNet hall, a district of cranes, a ring of agencies, floors lifted off, the army's slice
 * of the table, a central warehouse, a pipe under the floor, two trays, a crane taking down a
 * sign, a press that stops. Red is the one thing each sentence is about.
 */
import { BIG4, SECTOR_SHIFT, SEDENA_SHARE, TERMS, YEARS } from '@/components/gallery/filmData'
import { type Iso, type Pt, type SceneArgs, type SceneFn, L, clamp01, count, cue, dim, easeBack, easeInOut, easeOut, figure, ink, isoBox, isoFloor, isoPt, lerp, pool, prog, red, rnd, stamp, text, trace, typeOn } from '@/components/gallery/filmKit'

type C = CanvasRenderingContext2D
const TAU = Math.PI * 2
const isTall = (a: SceneArgs) => a.H > a.W * 0.9
const SERIF = '"Playfair Display", Georgia, serif'
const MONO = '"JetBrains Mono", ui-monospace, monospace'

// ── small kit extensions ────────────────────────────────────────────────────────────────────

function poly(ctx: C, pts: Pt[], fill?: string, stroke?: string, lw = 1) {
  ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath()
  if (fill) { ctx.fillStyle = fill; ctx.fill() }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke() }
}

function line(ctx: C, p: Pt, q: Pt, color: string, lw = 1) {
  ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke()
}

/** Draw in the plane of a wall: x runs along the wall (o.u px = one world unit), y runs down. */
function onFace(ctx: C, at: Pt, dir: 'x' | 'y', draw: () => void) {
  ctx.save(); ctx.translate(at[0], at[1]); ctx.transform(0.866, dir === 'x' ? 0.5 : -0.5, 0, 1, 0, 0); draw(); ctx.restore()
}

/** Draw in the floor plane (a table top): local x runs along world x, local y along world y. */
function onTop(ctx: C, at: Pt, draw: () => void) {
  ctx.save(); ctx.translate(at[0], at[1]); ctx.transform(0.866, 0.5, -0.866, 0.5, 0, 0); draw(); ctx.restore()
}

function measure(ctx: C, s: string, size: number, font: 'serif' | 'mono', weight?: number) {
  ctx.save(); ctx.font = `${weight ?? (font === 'mono' ? 500 : 600)} ${size}px ${font === 'mono' ? MONO : SERIF}`
  ;(ctx as C & { letterSpacing: string }).letterSpacing = font === 'mono' ? `${size * 0.12}px` : '0px'
  const w = ctx.measureText(s).width; ctx.restore(); return w
}

function mono(ctx: C, a: SceneArgs, s: string, x: number, y: number, size: number, color: string, o: { align?: CanvasTextAlign; alpha?: number; baseline?: CanvasTextBaseline; weight?: number } = {}) {
  text(ctx, s, x, y, { size: size * a.KF, font: 'mono', color, tracking: size * 0.12 * a.KF, ...o })
}

function glow(ctx: C, x: number, y: number, r: number, c0: string, c1: string) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r)
  g.addColorStop(0, c0); g.addColorStop(1, c1)
  ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2)
}

function vignette(ctx: C, a: SceneArgs, k = 0.8) {
  const g = ctx.createRadialGradient(a.W * 0.5, a.H * 0.45, Math.min(a.W, a.H) * 0.3, a.W * 0.5, a.H * 0.45, Math.max(a.W, a.H) * 0.78)
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${k})`)
  ctx.fillStyle = g; ctx.fillRect(0, 0, a.W, a.H)
}

/** Slow camera: the world origin pans across the shot. */
function cam(a: SceneArgs, cx: number, cy: number, u: number, panX: number, panY = 0): Iso {
  const t = easeInOut(clamp01(a.ls / a.dur)) - 0.5
  return { ox: a.W * cx - t * panX * a.W, oy: a.H * cy - t * panY * a.H, u }
}

const bob = (a: SceneArgs, seed: number) => Math.sin(a.ls * 0.0013 + seed * 1.9) * 2.4 * a.KF

interface Line { s: string; size: number; font?: 'serif' | 'mono'; color: string; weight?: number }
interface Rect { x: number; y: number; w: number; h: number }
/** A floating evidence card. (x, y) is the top-left (align left), top-right (right) or top-centre (center). */
function evCard(ctx: C, a: SceneArgs, x: number, y: number, lines: Line[], s: { al?: number; accent?: boolean; align?: 'left' | 'right' | 'center'; pad?: number } = {}): Rect {
  const KF = a.KF, pad = (s.pad ?? 12) * KF, al = s.al ?? 1
  let w = 0, h = 0
  const sizes = lines.map((l) => { const sz = l.size * KF, f = l.font ?? 'mono'; w = Math.max(w, measure(ctx, l.s, sz, f, l.weight)); const lh = sz * (f === 'mono' ? 1.55 : 1.12); h += lh; return lh })
  w += pad * 2; h += pad * 1.6
  let bx = s.align === 'right' ? x - w : s.align === 'center' ? x - w / 2 : x
  bx = Math.max(a.W * 0.025, Math.min(a.W * 0.975 - w, bx))
  const r = { x: bx, y, w, h }
  if (al <= 0.01) return r
  ctx.save(); ctx.globalAlpha *= clamp01(al)
  ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(bx + 5 * KF, y + 7 * KF, w, h)
  ctx.fillStyle = a.pal.bg; ctx.fillRect(bx, y, w, h)
  ctx.fillStyle = s.accent ? red(a, 0.07) : ink(a, 0.05); ctx.fillRect(bx, y, w, h)
  ctx.strokeStyle = s.accent ? red(a, 0.85) : ink(a, 0.45); ctx.lineWidth = Math.max(1, 1.1 * KF); ctx.strokeRect(bx, y, w, h)
  let ly = y + pad * 0.8
  lines.forEach((l, i) => {
    const sz = l.size * KF, f = l.font ?? 'mono'
    ly += sizes[i] * (f === 'mono' ? 0.72 : 0.86)
    text(ctx, l.s, bx + pad, ly, { size: sz, font: f, color: l.color, weight: l.weight, tracking: f === 'mono' ? sz * 0.12 : undefined })
    ly += sizes[i] * (f === 'mono' ? 0.28 : 0.14)
  })
  ctx.restore()
  return r
}

/** Thin leader from a point on the set to a card edge. */
function leader(ctx: C, a: SceneArgs, from: Pt, to: Pt, p: number, accent = false) {
  if (p <= 0) return
  trace(ctx, [from, to], easeOut(p), { color: accent ? red(a, 0.75) : ink(a, 0.5), width: Math.max(1, a.KF) })
  ctx.fillStyle = accent ? red(a, 0.95) : ink(a, 0.9)
  ctx.beginPath(); ctx.arc(from[0], from[1], 2.6 * a.KF, 0, TAU); ctx.fill()
}

/** Nearest point of a card rect to a point (where a leader should land). */
const edge = (r: Rect, p: Pt): Pt => [Math.max(r.x, Math.min(r.x + r.w, p[0])), p[1] < r.y ? r.y : p[1] > r.y + r.h ? r.y + r.h : r.y + r.h / 2]

/** An opaque isoBox (the silhouette is filled with the ground first so boxes never read as glass). */
function solidBox(ctx: C, a: SceneArgs, o: Iso, x: number, y: number, w: number, d: number, h: number, s: { alpha?: number; accent?: boolean; z?: number; lit?: number } = {}) {
  const al = s.alpha ?? 1, z = s.z ?? 0
  if (al <= 0.01 || h <= 0) return
  const P = (px: number, py: number, pz: number) => isoPt(o, px, py, pz)
  ctx.save(); ctx.globalAlpha *= al
  poly(ctx, [P(x, y, z + h), P(x + w, y, z + h), P(x + w, y, z), P(x + w, y + d, z), P(x, y + d, z), P(x, y + d, z + h)], a.pal.bg)
  ctx.restore()
  isoBox(ctx, a, o, x, y, w, d, h, s)
}

/** Window grid on the two lit faces of a box. */
function windows(ctx: C, a: SceneArgs, o: Iso, x: number, y: number, w: number, d: number, h: number, al: number, seed: number, on = 0.55, z0 = 0, rowsPer = 1.5, colsPer = 1.7, tint = false) {
  if (al <= 0.01 || h <= 0.05) return
  const rows = Math.max(1, Math.round(h * rowsPer)), cx = Math.max(1, Math.round(w * colsPer)), cy = Math.max(1, Math.round(d * colsPer))
  const P = (px: number, py: number, pz: number) => isoPt(o, px, py, pz)
  let k = 0
  const win = (pts: Pt[]) => {
    const lit = rnd(seed * 17 + k * 1.37) < on
    const fl = lit ? 0.4 + 0.18 * Math.sin(a.ls * 0.0019 + k * 2.3) : 0
    poly(ctx, pts, lit ? (tint ? red(a, (fl + 0.2) * al) : ink(a, fl * al)) : `rgba(0,0,0,${0.5 * al})`)
    k++
  }
  for (let r = 0; r < rows; r++) {
    const za = z0 + ((r + 0.3) / rows) * h, zb = z0 + ((r + 0.74) / rows) * h
    for (let i = 0; i < cx; i++) { const xa = x + ((i + 0.25) / cx) * w, xb = x + ((i + 0.75) / cx) * w; win([P(xa, y + d, za), P(xb, y + d, za), P(xb, y + d, zb), P(xa, y + d, zb)]) }
    for (let i = 0; i < cy; i++) { const ya = y + ((i + 0.25) / cy) * d, yb = y + ((i + 0.75) / cy) * d; win([P(x + w, ya, za), P(x + w, yb, za), P(x + w, yb, zb), P(x + w, ya, zb)]) }
  }
}

/** A miniature person with a contact shadow. */
function person(ctx: C, a: SceneArgs, o: Iso, x: number, y: number, s: { al?: number; accent?: boolean; lift?: number; h?: number } = {}) {
  const al = s.al ?? 1
  if (al <= 0.01) return
  const f = isoPt(o, x, y), hh = (s.h ?? 0.9) * o.u, w = hh * 0.3
  ctx.fillStyle = `rgba(0,0,0,${0.55 * al})`; ctx.beginPath(); ctx.ellipse(f[0], f[1], w * 0.9, w * 0.38, 0, 0, TAU); ctx.fill()
  ctx.save(); ctx.translate(0, -(s.lift ?? 0) * o.u)
  figure(ctx, a, o, x, y, { alpha: al, accent: s.accent, h: s.h })
  ctx.restore()
}

/** Index-based partial polyline: draws pts[0..idx] (idx may be fractional). Returns the head. */
function partial(ctx: C, pts: Pt[], idx: number, color: string, lw: number, dash?: number[]): Pt {
  const n = Math.max(0, Math.min(pts.length - 1, idx))
  const k = Math.floor(n), f = n - k
  const head: Pt = k >= pts.length - 1 ? pts[pts.length - 1] : [lerp(pts[k][0], pts[k + 1][0], f), lerp(pts[k][1], pts[k + 1][1], f)]
  if (n <= 0) return pts[0]
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.lineCap = 'round'
  if (dash) ctx.setLineDash(dash)
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1])
  for (let i = 1; i <= k; i++) ctx.lineTo(pts[i][0], pts[i][1])
  ctx.lineTo(head[0], head[1]); ctx.stroke(); ctx.restore()
  return head
}

const fmt = (n: number, a: SceneArgs, d = 0) => n.toLocaleString(a.lang === 'es' ? 'es-MX' : 'en-US', { minimumFractionDigits: d, maximumFractionDigits: d })

/** A record form floating over the set: a title, then fields — a filled bar, a typed value, or an empty slot. */
interface Field { label: string; bar?: number; value?: string; empty?: boolean; accent?: boolean }
function formCard(ctx: C, a: SceneArgs, x: number, y: number, w: number, title: string, rows: Field[], al: number, typed = 1): Rect {
  const KF = a.KF, pad = 12 * KF, rh = 34 * KF, h = pad * 2 + 16 * KF + rows.length * rh
  const r = { x, y, w, h }
  if (al <= 0.01) return r
  ctx.save(); ctx.globalAlpha *= clamp01(al)
  ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(x + 5 * KF, y + 7 * KF, w, h)
  ctx.fillStyle = a.pal.bg; ctx.fillRect(x, y, w, h)
  ctx.fillStyle = ink(a, 0.06); ctx.fillRect(x, y, w, h)
  ctx.strokeStyle = ink(a, 0.5); ctx.lineWidth = Math.max(1, 1.1 * KF); ctx.strokeRect(x, y, w, h)
  mono(ctx, a, title, x + pad, y + pad + 7 * KF, 9.5, dim(a, 1))
  rows.forEach((f, i) => {
    const ry = y + pad + 16 * KF + i * rh + 12 * KF
    mono(ctx, a, f.label, x + pad, ry, 9.5, ink(a, 0.7))
    const vy = ry + 16 * KF
    if (f.bar != null) { ctx.fillStyle = ink(a, 0.42); ctx.fillRect(x + pad, vy - 7 * KF, (w - pad * 2) * f.bar, 6 * KF) }
    if (f.value != null) mono(ctx, a, typeOn(f.value, typed), x + pad, vy, 12, f.accent ? red(a, 0.95) : ink(a, 0.95), { weight: 600 })
    if (f.empty) {
      ctx.save(); ctx.setLineDash([3 * KF, 3 * KF]); ctx.strokeStyle = ink(a, 0.55); ctx.strokeRect(x + pad, vy - 12 * KF, w - pad * 2, 16 * KF); ctx.restore()
      mono(ctx, a, '—', x + pad + 6 * KF, vy, 12, ink(a, 0.9))
      if (Math.floor(a.ls / 480) % 2 === 0) { ctx.fillStyle = ink(a, 0.85); ctx.fillRect(x + pad + 22 * KF, vy - 10 * KF, 6 * KF, 12 * KF) }
    }
  })
  ctx.restore()
  return r
}

// ── THE AVENUE: one tower per year of the record ────────────────────────────────────────────
// Towers stand along the world diagonal (t, −t), which runs straight across the screen.
const AV = 0.55, MAXC = 227396, TW = 0.42, PL = 0.18
const avT = (i: number) => (i - 11.5) * AV
const avXY = (i: number): Pt => [avT(i), -avT(i)]
/** year indexes of each administration on the avenue (terms hand over on 1 December). */
const ERAS: [number, number][] = [[0, 4], [5, 10], [11, 16], [17, 22], [23, 23]]
const tH = (i: number, HM: number) => (YEARS[i].contracts / MAXC) * HM

function avenueCam(a: SceneArgs, pan = 0.04) {
  const tall = isTall(a)
  const u = tall ? a.W * 0.0355 : Math.min(a.W * 0.0385, a.H * 0.064)
  return { o: cam(a, 0.5, tall ? 0.6 : 0.66, u, tall ? pan * 0.3 : pan), HM: tall ? 9.5 : 5.3 }
}

/** A plinth laid along the avenue, from t0 to t1, half-depth d. */
function slab(ctx: C, a: SceneArgs, o: Iso, t0: number, t1: number, d: number, h: number, s: { z?: number; al?: number; lit?: number; accent?: boolean } = {}) {
  const z = s.z ?? 0, al = s.al ?? 1, k = s.lit ?? 1
  if (al <= 0.01 || h <= 0) return
  const P = (t: number, off: number, zz: number) => isoPt(o, t + off, -t + off, zz)
  const c = (v: number) => (s.accent ? red(a, v * al) : ink(a, v * al))
  const front: Pt[] = [P(t0, d, z + h), P(t1, d, z + h), P(t1, d, z), P(t0, d, z)]
  const top: Pt[] = [P(t0, -d, z + h), P(t1, -d, z + h), P(t1, d, z + h), P(t0, d, z + h)]
  ctx.save(); ctx.globalAlpha *= al; poly(ctx, top, a.pal.bg); poly(ctx, front, a.pal.bg); ctx.restore()
  poly(ctx, top, c(0.3 * k), c(0.35)); poly(ctx, front, c(0.14 * k), c(0.3))
}

function tower(ctx: C, a: SceneArgs, o: Iso, i: number, h: number, s: { al?: number; on?: number; lit?: number } = {}) {
  const [x, y] = avXY(i), al = s.al ?? 1
  if (al <= 0.01) return
  if (YEARS[i].contracts < 100) { // 2004: seven contracts in the source files — an empty, dashed lot
    const P = (px: number, py: number) => isoPt(o, px, py, PL)
    ctx.save(); ctx.setLineDash([3, 3]); poly(ctx, [P(x - TW / 2, y - TW / 2), P(x + TW / 2, y - TW / 2), P(x + TW / 2, y + TW / 2), P(x - TW / 2, y + TW / 2)], undefined, dim(a, 0.7 * al)); ctx.restore()
    return
  }
  if (h <= 0.01) return
  solidBox(ctx, a, o, x - TW / 2, y - TW / 2, TW, TW, h, { alpha: al, lit: s.lit ?? 0.8, z: PL })
  windows(ctx, a, o, x - TW / 2, y - TW / 2, TW, TW, h, al, i + 1, s.on ?? 0.5, PL, 2.2, 2.4)
}

function avenueBase(ctx: C, a: SceneArgs, o: Iso, b: number, light = 1) {
  isoFloor(ctx, a, o, 16, 0.07 * b)
  pool(ctx, a, o, 0, 0, 10, 0.15 * b * light)
  slab(ctx, a, o, avT(-0.8), avT(23.8), 0.55, PL * easeOut(b), { lit: 0.5 })
}

function eraPlinth(ctx: C, a: SceneArgs, o: Iso, e: number, p: number) {
  if (p <= 0) return
  slab(ctx, a, o, avT(ERAS[e][0]) - 0.25, avT(ERAS[e][1]) + 0.25, 0.46, 0.05 * easeOut(p), { z: PL, al: p, lit: 1.5 })
}

/** screen point under the middle of an era, just below the avenue's front edge. */
function eraAnchor(o: Iso, e: number): Pt {
  const t = (avT(ERAS[e][0]) + avT(ERAS[e][1])) / 2
  return isoPt(o, t + 0.55, -t + 0.55, 0)
}

function eraLabel(ctx: C, a: SceneArgs, o: Iso, e: number, p: number) {
  if (p <= 0) return
  const tall = isTall(a), q = eraAnchor(o, e)
  const y = q[1] + (16 + (tall && e % 2 ? 12 : 0)) * a.KF, hw = measure(ctx, TERMS[e].name, (tall ? 7.5 : 10) * a.KF, 'mono') / 2 + 4 * a.KF
  mono(ctx, a, TERMS[e].name, Math.max(hw, Math.min(a.W - hw, q[0])), y, tall ? 7.5 : 10, ink(a, 0.9), { align: 'center', alpha: p })
}

/** Tiny passers-by along the front of the avenue (something always moving). */
function strollers(ctx: C, a: SceneArgs, o: Iso, al: number) {
  for (let k = 0; k < 7; k++) {
    const dir = k % 2 ? 1 : -1, ph = (a.ls * 0.00004 * (0.7 + rnd(k) * 0.6) + rnd(k * 9)) % 1
    const t = lerp(avT(-0.6), avT(23.6), dir > 0 ? ph : 1 - ph), off = 0.85 + 0.25 * rnd(k * 3)
    person(ctx, a, o, t + off, -t + off, { al: al * 0.7 * Math.sin(Math.PI * ph), h: 0.55, lift: 0.02 * Math.abs(Math.sin(a.ls * 0.01 + k)) })
  }
}

// ── 0 · THE AVENUE — every year of the record rises as a tower ───────────────────────────────
const open: SceneFn = (ctx, a) => {
  const { ls, W, H, KF } = a, tall = isTall(a)
  const c1 = cue(a, 1), c2 = cue(a, 2), c3 = cue(a, 3), c4 = cue(a, 4)
  const { o, HM } = avenueCam(a)
  const b = prog(ls, 0, 900)
  avenueBase(ctx, a, o, b)
  for (let e = 0; e < 5; e++) eraPlinth(ctx, a, o, e, prog(ls, c3 + e * 240, 500))
  strollers(ctx, a, o, b)
  for (let i = 0; i < YEARS.length; i++) {
    const g = easeOut(prog(ls, 300 + i * 125, 800))
    tower(ctx, a, o, i, tH(i, HM) * g, { al: Math.min(1, g * 2), on: 0.5 })
  }
  vignette(ctx, a, 0.75)
  for (let e = 0; e < 5; e++) eraLabel(ctx, a, o, e, prog(ls, c3 + e * 240 + 200, 500))
  // where the walk begins
  const pp = prog(ls, c4, 700)
  if (pp > 0) {
    const [x, y] = avXY(0), top = isoPt(o, x, y, PL + tH(0, HM) + 0.15), hgt = (tall ? 30 : 46) * KF
    const yy = top[1] - hgt - (1 - easeBack(pp)) * 30 * KF
    line(ctx, [top[0], top[1]], [top[0], yy], red(a, 0.8 * pp), Math.max(1.2, 1.4 * KF))
    ctx.fillStyle = red(a, pp); ctx.beginPath(); ctx.arc(top[0], yy, 4.5 * KF, 0, TAU); ctx.fill()
    mono(ctx, a, '2002', top[0] + 9 * KF, yy + 4 * KF, 10, red(a, 0.95), { alpha: pp })
  }
  // the three figures, on the voice
  const p1 = prog(ls, c1, 600), p2 = prog(ls, c2, 600)
  const big = tall ? 32 : 50
  const card1: Line[] = [{ s: L(a, '3 million', '3 millones'), size: big, font: 'serif', color: ink(a, 0.97) }, { s: L(a, 'CONTRACTS ON THE PUBLIC RECORD', 'CONTRATOS EN EL REGISTRO PÚBLICO'), size: tall ? 8.5 : 10, color: dim(a, 1) }]
  const card2: Line[] = [{ s: `${count(9.9, 1, 1, a.lang)} ${L(a, 'trillion pesos', 'billones de pesos')}`, size: big, font: 'serif', color: ink(a, 0.97) }, { s: L(a, '2002 – 2025 · FIVE GOVERNMENTS', '2002 – 2025 · CINCO GOBIERNOS'), size: tall ? 8.5 : 10, color: dim(a, 1) }]
  if (tall) {
    evCard(ctx, a, W / 2, H * 0.1 + bob(a, 1), card1, { al: p1 * (1 - prog(ls, c2 - 300, 300)), align: 'center' })
    evCard(ctx, a, W / 2, H * 0.1 + bob(a, 2), card2, { al: p2, align: 'center' })
  } else {
    evCard(ctx, a, W * 0.05, H * 0.12 + bob(a, 1), card1, { al: p1 })
    evCard(ctx, a, W * 0.95, H * 0.12 + bob(a, 2), card2, { al: p2, align: 'right' })
  }
}

// ── 1 · FOX — a wall of a thousand drawers; one carries a tax ID; the file has no "how" ───────
const fox: SceneFn = (ctx, a) => {
  const { ls, W, H, KF } = a, tall = isTall(a)
  const c1 = cue(a, 1), c2 = cue(a, 2), c3 = cue(a, 3)
  const u = tall ? W * 0.072 : Math.min(W * 0.054, H * 0.086)
  const o = cam(a, tall ? 0.5 : 0.47, tall ? 0.43 : 0.56, u, 0.05)
  const X0 = -3.5, CW = 7, Y0 = 0, CD = 0.7, CH = 3.4, COLS = 40, ROWS = 25, TC = 27, TR = 9, PC = 11, PR = 19
  const b = easeOut(prog(ls, 0, 1000)), ch = CH * b
  const M = 0.14, cw = (CW - 2 * M) / COLS, rh = (CH - 2 * M) / ROWS
  isoFloor(ctx, a, o, 12, 0.1 * b)
  pool(ctx, a, o, 0, 1.6, 6.5, 0.22 * b)
  solidBox(ctx, a, o, X0, Y0, CW, CD, ch, { lit: 0.42 })
  const shown = ROWS * prog(ls, 250, 2600) // drawers fill in, bottom row first
  const scan = prog(ls, c2 + 100, 1500), tagP = prog(ls, c2 + 1550, 450), pull = easeOut(prog(ls, c3 + 100, 800))
  onFace(ctx, isoPt(o, X0, Y0 + CD, ch), 'x', () => {
    const m = M * u, cwp = cw * u, rhp = rh * u * b
    ctx.fillStyle = ink(a, 0.17)
    for (let r = 0; r < ROWS; r++) {
      if (ROWS - r > shown) continue
      for (let c = 0; c < COLS; c++) if (rnd(r * COLS + c + 3) < 0.38) ctx.fillRect(m + c * cwp + 1, m + r * rhp + 1, cwp - 2, rhp - 2)
    }
    ctx.beginPath()
    for (let r = 0; r < ROWS; r++) {
      if (ROWS - r > shown) continue
      for (let c = 0; c < COLS; c++) ctx.rect(m + c * cwp + 1, m + r * rhp + 1, cwp - 2, rhp - 2)
    }
    ctx.strokeStyle = ink(a, 0.32); ctx.lineWidth = 0.8; ctx.stroke()
    ctx.fillStyle = ink(a, 0.45)
    for (let r = 0; r < ROWS; r++) {
      if (ROWS - r > shown) continue
      for (let c = 0; c < COLS; c++) ctx.fillRect(m + (c + 0.38) * cwp, m + (r + 0.45) * rhp, cwp * 0.24, Math.max(1, rhp * 0.12))
    }
    // the lamp that reads every drawer, and stops on one
    if (scan > 0 && tagP < 1) {
      const bx = m + lerp(0, (TC + 0.5) * cwp, easeInOut(scan)), bw = cwp * 3
      const g = ctx.createLinearGradient(bx - bw, 0, bx + bw, 0)
      g.addColorStop(0, ink(a, 0)); g.addColorStop(0.5, ink(a, 0.3 * (1 - tagP))); g.addColorStop(1, ink(a, 0))
      ctx.fillStyle = g; ctx.fillRect(bx - bw, 0, bw * 2, CH * u * b)
    }
    if (tagP > 0) {
      const tx = m + TC * cwp, ty = m + TR * rhp
      ctx.fillStyle = red(a, 0.9 * tagP); ctx.fillRect(tx + 1, ty + 1, cwp - 2, rhp - 2)
      const sw = Math.sin(ls * 0.004) * 2 * KF
      line(ctx, [tx + cwp / 2, ty + rhp * 0.6], [tx + cwp / 2 + sw, ty + rhp * 2.2], red(a, 0.8 * tagP))
      ctx.fillStyle = red(a, tagP); ctx.fillRect(tx + cwp / 2 + sw - cwp * 0.45, ty + rhp * 2.2, cwp * 0.9, rhp * 0.9)
    }
    if (pull > 0) { ctx.fillStyle = 'rgba(0,0,0,0.85)'; ctx.fillRect(m + PC * cwp + 1, m + PR * rhp + 1, cwp - 2, rhp - 2) }
  })
  // the one drawer that slides out, holding the file
  const dx = X0 + M + PC * cw, dz = CH - M - (PR + 1) * rh
  if (pull > 0) solidBox(ctx, a, o, dx, Y0 + CD, cw, 0.9 * pull, rh * 0.95, { z: dz, lit: 1 })
  vignette(ctx, a, 0.8)
  const tagPt = isoPt(o, X0 + M + (TC + 0.5) * cw, Y0 + CD, CH - M - (TR + 1.6) * rh)
  const drawerPt = isoPt(o, dx + cw / 2, Y0 + CD + 0.9 * pull, dz + rh)
  // cards
  const p1 = prog(ls, c1, 600), p2 = tagP, p3 = prog(ls, c3 + 500, 600)
  const l1: Line[] = [{ s: `≈${fmt(50000, a)}`, size: tall ? 30 : 44, font: 'serif', color: ink(a, 0.97) }, { s: L(a, 'CONTRACTS A YEAR', 'CONTRATOS AL AÑO'), size: 9.5, color: dim(a, 1) }]
  const l2: Line[] = [{ s: L(a, '1 in 1,000', '1 de cada 1,000'), size: tall ? 28 : 40, font: 'serif', color: red(a, 0.97) }, { s: L(a, 'CARRIES A TAX ID', 'TRAE REGISTRO FISCAL'), size: 9.5, color: red(a, 0.85) }]
  const rows: Field[] = [{ label: L(a, 'VENDOR', 'PROVEEDOR'), bar: 0.7 }, { label: L(a, 'AMOUNT', 'IMPORTE'), bar: 0.4 }, { label: L(a, 'HOW AWARDED', 'CÓMO SE ADJUDICÓ'), empty: true }]
  const fw = (tall ? 200 : 236) * KF
  if (tall) {
    const y = H * 0.6
    evCard(ctx, a, W / 2, y + bob(a, 1), l1, { al: p1 * (1 - prog(ls, c2 + 1300, 300)), align: 'center' })
    const r2 = evCard(ctx, a, W / 2, y + bob(a, 2), l2, { al: p2 * (1 - prog(ls, c3 + 200, 300)), accent: true, align: 'center' })
    leader(ctx, a, tagPt, edge(r2, tagPt), p2 * (1 - prog(ls, c3 + 200, 300)), true)
    const r3 = formCard(ctx, a, W / 2 - fw / 2, H * 0.53 + bob(a, 3), fw, L(a, 'CONTRACT FILE · 2002–2006', 'EXPEDIENTE · 2002–2006'), rows, p3)
    leader(ctx, a, drawerPt, edge(r3, drawerPt), p3)
  } else {
    const r1 = evCard(ctx, a, W * 0.05, H * 0.17 + bob(a, 1), l1, { al: p1 })
    leader(ctx, a, isoPt(o, X0 + 0.6, Y0 + CD, CH * 0.82), [r1.x + r1.w, r1.y + r1.h * 0.6], p1)
    const r2 = evCard(ctx, a, W * 0.05, H * 0.42 + bob(a, 2), l2, { al: p2, accent: true })
    leader(ctx, a, tagPt, edge(r2, tagPt), p2, true)
    const r3 = formCard(ctx, a, W * 0.965 - fw, H * 0.2 + bob(a, 3), fw, L(a, 'CONTRACT FILE · 2002–2006', 'EXPEDIENTE · 2002–2006'), rows, p3)
    leader(ctx, a, drawerPt, edge(r3, drawerPt), p3)
  }
}

// ── 2 · CALDERÓN — the CompraNet hall; the 2011 tower triples; 71% of it turns red ───────────
const calderon: SceneFn = (ctx, a) => {
  const { ls, W, H, KF } = a, tall = isTall(a)
  const c1 = cue(a, 1), c2 = cue(a, 2), c3 = cue(a, 3)
  const u = tall ? W * 0.062 : Math.min(W * 0.052, H * 0.084)
  const o = cam(a, tall ? 0.56 : 0.47, tall ? 0.6 : 0.6, u, 0.05)
  const HM = tall ? 4.2 : 4.6, h10 = (HM * YEARS[8].contracts) / YEARS[9].contracts, S = 1.3
  const T10: Pt = [-1.4, -0.9], T11: Pt = [1.6, -1.0]
  const b = easeOut(prog(ls, 0, 900))
  isoFloor(ctx, a, o, 12, 0.1 * b)
  pool(ctx, a, o, -0.6, -0.2, 7, 0.2 * b)
  // the hall
  const HX = -5.2, HY = 0.6, HWd = 3.4, HD = 1.8, HH = 1.1
  solidBox(ctx, a, o, HX, HY, HWd, HD, HH * b, { lit: 0.6 })
  for (let i = 0; i < 6; i++) { const px = HX + 0.3 + i * 0.56; line(ctx, isoPt(o, px, HY + HD, 0.05), isoPt(o, px, HY + HD, HH * b * 0.62), ink(a, 0.4 * b), Math.max(1, KF)) }
  const sOn = prog(ls, 500, 250) * (ls < 900 ? (Math.floor(ls / 80) % 3 ? 1 : 0.3) : 1)
  onFace(ctx, isoPt(o, HX + 0.25, HY + HD, HH * b - 0.08), 'x', () => {
    ctx.fillStyle = ink(a, 0.12 + 0.75 * sOn); ctx.fillRect(0, 0, (HWd - 0.5) * u, 0.38 * u)
    text(ctx, 'COMPRANET', ((HWd - 0.5) * u) / 2, 0.2 * u, { size: 0.27 * u, font: 'mono', weight: 700, color: a.pal.bg, align: 'center', baseline: 'middle', tracking: 0.04 * u, alpha: sOn })
  })
  const ant = isoPt(o, HX + 2.6, HY + 0.6, HH + 1.1)
  line(ctx, isoPt(o, HX + 2.6, HY + 0.6, HH * b), ant, ink(a, 0.7 * b), Math.max(1, 1.2 * KF))
  for (let k = 0; k < 3; k++) { const ph = (ls * 0.0006 + k / 3) % 1; ctx.strokeStyle = ink(a, 0.5 * (1 - ph) * sOn); ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(ant[0], ant[1], ph * 26 * KF, ph * 13 * KF, 0, 0, TAU); ctx.stroke() }
  // the towers
  const grow = easeInOut(prog(ls, c1 + 150, 1500)), h11 = lerp(h10, HM, grow) * b
  const redH = 0.7152 * h11 * easeInOut(prog(ls, c3 + 100, 1300))
  solidBox(ctx, a, o, T10[0], T10[1], S, S, h10 * b, { lit: 0.7 })
  windows(ctx, a, o, T10[0], T10[1], S, S, h10 * b, 1, 10, 0.45, 0, 1.6, 2.2)
  if (redH > 0.01) solidBox(ctx, a, o, T11[0], T11[1], S, S, redH, { accent: true, lit: 0.8 })
  solidBox(ctx, a, o, T11[0], T11[1], S, S, h11 - redH, { z: redH, lit: 0.8 })
  windows(ctx, a, o, T11[0], T11[1], S, S, h11, 1, 11, 0.5, 0, 1.6, 2.2)
  // the 2010 level, kept on the new tower
  if (grow > 0) { ctx.save(); ctx.setLineDash([4, 4]); poly(ctx, [isoPt(o, T11[0], T11[1] + S, h10), isoPt(o, T11[0] + S, T11[1] + S, h10), isoPt(o, T11[0] + S, T11[1], h10)], undefined, ink(a, 0.7 * grow), Math.max(1, KF)); ctx.restore() }
  // cables carry the files from the hall to the towers
  for (const [tg, k] of [[T10, 0], [T11, 1]] as [Pt, number][]) {
    const end = isoPt(o, tg[0], tg[1] + S, (k ? h11 : h10 * b) * 0.7), mid: Pt = [(ant[0] + end[0]) / 2, Math.max(ant[1], end[1]) + 20 * KF]
    const pts: Pt[] = []
    for (let s = 0; s <= 16; s++) { const t = s / 16; pts.push([(1 - t) * (1 - t) * ant[0] + 2 * (1 - t) * t * mid[0] + t * t * end[0], (1 - t) * (1 - t) * ant[1] + 2 * (1 - t) * t * mid[1] + t * t * end[1]]) }
    partial(ctx, pts, 16 * prog(ls, 700 + k * 200, 700), ink(a, 0.3), 1)
    if (ls > 1400) for (let d = 0; d < 4; d++) { const t = (ls * 0.0005 * (k ? 1.6 : 1) + d / 4) % 1, q = pts[Math.floor(t * 16)]; ctx.fillStyle = ink(a, 0.85); ctx.fillRect(q[0] - 2 * KF, q[1] - 1.5 * KF, 4 * KF, 3 * KF) }
  }
  vignette(ctx, a, 0.8)
  // labels on the floor
  const lab = (q: Pt, align: CanvasTextAlign, yr: string, n: string, al: number) => {
    mono(ctx, a, yr, q[0], q[1], 10, ink(a, 0.9), { align })
    mono(ctx, a, n, q[0], q[1] + 14 * KF, 9.5, dim(a, 1), { align, alpha: al })
  }
  const q10 = isoPt(o, T10[0], T10[1], 0), q11 = isoPt(o, T11[0] + S, T11[1], 0)
  lab([q10[0] - 8 * KF, q10[1] + 12 * KF], 'right', '2010', fmt(YEARS[8].contracts, a), b)
  lab([q11[0] + 8 * KF, q11[1] + 16 * KF], 'left', '2011', fmt(YEARS[9].contracts, a), prog(ls, c1 + 1500, 400))
  const hallTop = isoPt(o, HX + HWd / 2, HY + HD / 2, HH)
  stamp(ctx, a, L(a, 'MANDATORY', 'OBLIGATORIO'), hallTop[0] + 10 * KF, hallTop[1] - 6 * KF, { size: 12 * KF, p: prog(ls, cue(a, 0) + (c1 - cue(a, 0)) * 0.55, 450), color: ink(a, 0.9) })
  // cards
  const p1 = prog(ls, c1 + 1100, 600), p2 = prog(ls, c2, 500), p3 = prog(ls, c3 + 300, 600)
  const l1: Line[] = [{ s: '×3', size: tall ? 34 : 54, font: 'serif', color: ink(a, 0.97) }, { s: L(a, 'RECORDED CONTRACTS · 2010 → 2011', 'CONTRATOS REGISTRADOS · 2010 → 2011'), size: tall ? 8 : 9.5, color: dim(a, 1) }]
  const l3: Line[] = [{ s: '71%', size: tall ? 38 : 60, font: 'serif', color: red(a, 0.97) }, { s: L(a, 'HANDED OUT WITH NO CONTEST · 2011', 'ENTREGADO SIN CONCURSO · 2011'), size: tall ? 8 : 9.5, color: red(a, 0.85) }]
  const rows: Field[] = [{ label: L(a, 'VENDOR', 'PROVEEDOR'), bar: 0.7 }, { label: L(a, 'HOW AWARDED', 'CÓMO SE ADJUDICÓ'), value: L(a, 'DIRECT AWARD', 'ADJUDICACIÓN DIRECTA') }]
  const fw = (tall ? 200 : 236) * KF
  const t11face = isoPt(o, T11[0] + S, T11[1] + S * 0.5, h11 * 0.85)
  const t11red = isoPt(o, T11[0] + S, T11[1] + S * 0.5, redH * 0.6)
  if (tall) {
    const y = H * 0.1
    evCard(ctx, a, W / 2, y + bob(a, 1), l1, { al: p1 * (1 - prog(ls, c2 - 200, 300)), align: 'center' })
    const r2 = formCard(ctx, a, W / 2 - fw / 2, y + bob(a, 2), fw, L(a, 'CONTRACT FILE · 2011', 'EXPEDIENTE · 2011'), rows, p2 * (1 - prog(ls, c3, 300)), prog(ls, c2 + 300, 1200))
    leader(ctx, a, t11face, edge(r2, t11face), p2 * (1 - prog(ls, c3, 300)))
    const r3 = evCard(ctx, a, W / 2, y + bob(a, 3), l3, { al: p3, accent: true, align: 'center' })
    leader(ctx, a, t11red, edge(r3, t11red), p3, true)
  } else {
    evCard(ctx, a, W * 0.05, H * 0.13 + bob(a, 1), l1, { al: p1 })
    const r2 = formCard(ctx, a, W * 0.965 - fw, H * 0.12 + bob(a, 2), fw, L(a, 'CONTRACT FILE · 2011', 'EXPEDIENTE · 2011'), rows, p2, prog(ls, c2 + 300, 1200))
    leader(ctx, a, t11face, edge(r2, t11face), p2)
    const r3 = evCard(ctx, a, W * 0.965, H * 0.4 + bob(a, 3), l3, { al: p3, accent: true, align: 'right' })
    leader(ctx, a, t11red, edge(r3, t11red), p3, true)
  }
}

// ── 3 · PEÑA NIETO — the busiest district; a third of it under cranes ─────────────────────────
function crane(ctx: C, a: SceneArgs, o: Iso, x: number, y: number, z: number, p: number, seed: number) {
  if (p <= 0) return
  const top = z + 1.7 * easeOut(p), P = (px: number, py: number, pz: number) => isoPt(o, px, py, pz), lw = Math.max(1.2, 0.05 * o.u)
  line(ctx, P(x, y, z), P(x, y, top), red(a, 0.9 * p), lw)
  line(ctx, P(x + 0.08, y, z), P(x + 0.08, y, top), red(a, 0.5 * p), Math.max(1, lw * 0.5))
  const th = seed * 2.1 + a.ls * 0.00035 * (seed % 2 ? 1 : -1), cs = Math.cos(th), sn = Math.sin(th), J = 1.5 * p
  const tip = P(x + cs * J, y + sn * J, top), back = P(x - cs * 0.5 * p, y - sn * 0.5 * p, top)
  line(ctx, back, tip, red(a, 0.95 * p), lw)
  ctx.fillStyle = red(a, 0.9 * p); ctx.fillRect(back[0] - 0.09 * o.u, back[1] - 0.05 * o.u, 0.18 * o.u, 0.14 * o.u)
  const hx = x + cs * J * 0.72, hy = y + sn * J * 0.72, drop = 0.6 + 0.25 * Math.sin(a.ls * 0.002 + seed)
  line(ctx, P(hx, hy, top), P(hx, hy, top - drop), red(a, 0.6 * p))
  isoBox(ctx, a, o, hx - 0.12, hy - 0.12, 0.24, 0.24, 0.16, { z: top - drop - 0.16, accent: true, alpha: p })
}

const boom: SceneFn = (ctx, a) => {
  const { ls, W, H, KF } = a, tall = isTall(a)
  const c1 = cue(a, 1), c2 = cue(a, 2), c3 = cue(a, 3)
  const u = tall ? W * 0.05 : Math.min(W * 0.034, H * 0.055)
  const o = cam(a, 0.5, tall ? 0.42 : 0.52, u, 0.06)
  const S = 1.1, G = 1.7
  const b = prog(ls, 0, 800)
  isoFloor(ctx, a, o, 14, 0.1 * b)
  pool(ctx, a, o, 0, 0, 9, 0.2 * b)
  const infra = prog(ls, c3, 700)
  // the infrastructure third, outlined on the floor
  if (infra > 0) {
    const P = (px: number, py: number) => isoPt(o, px, py)
    poly(ctx, [P(-2.5 * G - 0.9, -G - 0.9), P(-0.5 * G - 0.1, -G - 0.9), P(-0.5 * G - 0.1, G + 0.9), P(-2.5 * G - 0.9, G + 0.9)], red(a, 0.07 * infra), red(a, 0.6 * infra), Math.max(1, KF))
  }
  // traffic in the streets
  for (let r = 0; r < 4; r++) {
    const sy = (r - 1.5) * G
    for (let k = 0; k < 9; k++) {
      const t = (ls * 0.00006 * (r % 2 ? 1 : -1) + k / 9 + 10) % 1, q = isoPt(o, lerp(-5.6, 5.6, t), sy)
      ctx.fillStyle = ink(a, 0.6 * b * Math.sin(Math.PI * t)); ctx.fillRect(q[0] - 2 * KF, q[1] - 1 * KF, 4 * KF, 2 * KF)
    }
  }
  for (let k = 0; k <= 7; k++) for (let c = 0; c < 6; c++) {
    const r = k - c
    if (r < 0 || r > 2) continue
    const x = (c - 2.5) * G - S / 2, y = (r - 1) * G - S / 2
    const g = easeOut(prog(ls, 150 + (c + r) * 110, 900)), h = (1.1 + 2.5 * rnd(c * 7 + r * 13 + 3)) * g
    solidBox(ctx, a, o, x, y, S, S, h, { lit: 0.75 })
    windows(ctx, a, o, x, y, S, S, h, 1, c * 5 + r + 2, 0.72, 0, 1.6, 2.2)
    if (c < 2) crane(ctx, a, o, x + S / 2, y + S / 2, h, prog(ls, c3 + (c * 3 + r) * 120, 700), c * 3 + r)
  }
  vignette(ctx, a, 0.8)
  const p1 = prog(ls, c1, 600), p2 = prog(ls, c2, 600), p3 = prog(ls, c3 + 300, 600)
  const big = tall ? 30 : 44
  const l1: Line[] = [{ s: `${count(1.2, 1, 1, a.lang)} ${L(a, 'million', 'millones')}`, size: big, font: 'serif', color: ink(a, 0.97) }, { s: L(a, 'CONTRACTS · 2012–2018', 'CONTRATOS · 2012–2018'), size: 9.5, color: dim(a, 1) }]
  const l2: Line[] = [{ s: L(a, '3 trillion pesos', '3 billones de pesos'), size: big, font: 'serif', color: ink(a, 0.97) }, { s: L(a, 'CONTRACTED · 2012–2018', 'CONTRATADOS · 2012–2018'), size: 9.5, color: dim(a, 1) }]
  const l3: Line[] = [{ s: L(a, 'a third', 'un tercio'), size: big, font: 'serif', color: red(a, 0.97) }, { s: L(a, 'IN INFRASTRUCTURE', 'EN INFRAESTRUCTURA'), size: 9.5, color: red(a, 0.85) }]
  const anchor = isoPt(o, -2.5 * G, -G, 0)
  if (tall) {
    const y = H * 0.62
    evCard(ctx, a, W / 2, y + bob(a, 1), l1, { al: p1 * (1 - prog(ls, c2 - 250, 250)), align: 'center' })
    evCard(ctx, a, W / 2, y + bob(a, 2), l2, { al: p2 * (1 - prog(ls, c3 - 250, 250)), align: 'center' })
    evCard(ctx, a, W / 2, y + bob(a, 3), l3, { al: p3, accent: true, align: 'center' })
  } else {
    evCard(ctx, a, W * 0.05, H * 0.13 + bob(a, 1), l1, { al: p1 })
    evCard(ctx, a, W * 0.95, H * 0.13 + bob(a, 2), l2, { al: p2, align: 'right' })
    const r3 = evCard(ctx, a, W * 0.05, H * 0.5 + bob(a, 3), l3, { al: p3, accent: true })
    leader(ctx, a, anchor, edge(r3, anchor), p3, true)
  }
}

// ── 4 · LA ESTAFA MAESTRA — a red thread traced through a ring of eleven agencies ─────────────
function agency(ctx: C, a: SceneArgs, o: Iso, x: number, y: number, al: number, lit = 0.7) {
  if (al <= 0.01) return
  const w = 1.0, d = 0.8, h = 0.75, P = (px: number, py: number, pz: number) => isoPt(o, px, py, pz)
  solidBox(ctx, a, o, x, y, w, d, h, { alpha: al, lit })
  for (let i = 0; i < 5; i++) { const px = x + w * (0.12 + 0.76 * (i / 4)); line(ctx, P(px, y + d, 0.04), P(px, y + d, h * 0.85), ink(a, 0.45 * al), Math.max(1, o.u * 0.03)) }
  poly(ctx, [P(x + w / 2, y + d, h + 0.32), P(x + w, y + d, h), P(x + w, y, h), P(x + w / 2, y, h + 0.32)], ink(a, 0.42 * al * lit), ink(a, 0.4 * al))
  poly(ctx, [P(x, y + d, h), P(x + w, y + d, h), P(x + w / 2, y + d, h + 0.32)], ink(a, 0.6 * al * lit), ink(a, 0.5 * al))
}

const paper: SceneFn = (ctx, a) => {
  const { ls, W, H, KF } = a, tall = isTall(a)
  const c0 = cue(a, 0), tEleven = c0 + 0.76 * (a.dur - c0)
  const u = tall ? W * 0.058 : Math.min(W * 0.042, H * 0.07)
  const o = cam(a, 0.5, tall ? 0.46 : 0.47, u, 0.05)
  const N = 11, R = 4
  const b = prog(ls, 0, 900)
  isoFloor(ctx, a, o, 12, 0.09 * b)
  const sites = Array.from({ length: N }, (_, k) => { const th = Math.PI * 0.62 + (k / N) * TAU; return { x: R * Math.cos(th) - 0.5, y: R * Math.sin(th) - 0.4, k } })
  // the thread's route: roof to roof, through the university gate halfway
  const route: Pt[] = [], world: Pt[] = [], idxOf: number[] = []
  sites.forEach((s, k) => {
    if (k === 6) { route.push(isoPt(o, 0, 0, 1.75)); world.push([0, 0.5]) }
    idxOf.push(route.length); route.push(isoPt(o, s.x + 0.5, s.y + 0.4, 1.12)); world.push([s.x + 0.5, s.y + 1.1])
  })
  const tp = easeInOut(prog(ls, c0 + 500, tEleven - c0 - 500)), idx = tp * (route.length - 1)
  // the investigators' lamp moves along the floor under the thread's head
  const fk = Math.min(world.length - 1, Math.floor(idx)), ff = idx - fk, nk = Math.min(world.length - 1, fk + 1)
  const fx = lerp(world[fk][0], world[nk][0], ff), fy = lerp(world[fk][1], world[nk][1], ff)
  pool(ctx, a, o, 0, 0, 6, 0.1 * b)
  if (tp > 0) pool(ctx, a, o, fx, fy, 1.8, 0.22)
  const order = sites.slice().sort((p, q) => p.x + p.y - (q.x + q.y))
  let gateDrawn = false
  const gate = () => {
    const gp = prog(ls, 400, 700)
    solidBox(ctx, a, o, -0.75, -0.1, 0.25, 0.25, 1.35 * gp, { lit: 0.9 })
    solidBox(ctx, a, o, 0.5, -0.1, 0.25, 0.25, 1.35 * gp, { lit: 0.9 })
    solidBox(ctx, a, o, -0.85, -0.12, 1.7, 0.3, 0.26, { z: 1.35 * gp, alpha: gp, lit: 1 })
  }
  for (const s of order) {
    if (!gateDrawn && s.x + s.y > -0.2) { gate(); gateDrawn = true }
    agency(ctx, a, o, s.x, s.y, prog(ls, 150 + s.k * 70, 600))
  }
  if (!gateDrawn) gate()
  // two figures follow, a step behind
  for (let j = 0; j < 2; j++) {
    const id = Math.max(0, idx - 0.35 - j * 0.3), k = Math.min(world.length - 1, Math.floor(id)), f = id - k, n = Math.min(world.length - 1, k + 1)
    person(ctx, a, o, lerp(world[k][0], world[n][0], f) + 0.3 * j, lerp(world[k][1], world[n][1], f) + 0.5, { al: prog(ls, c0 + 300, 500), h: 0.62, lift: 0.04 * Math.abs(Math.sin(ls * 0.012 + j)) })
  }
  const head = partial(ctx, route, idx, red(a, 0.9), Math.max(1.4, 1.6 * KF))
  idxOf.forEach((j) => {
    if (idx < j) return
    const q = route[j], pp = clamp01((idx - j) * 3)
    line(ctx, q, [q[0], q[1] + 10 * KF], red(a, 0.7 * pp))
    ctx.fillStyle = red(a, pp); ctx.beginPath(); ctx.arc(q[0], q[1], 3.4 * KF, 0, TAU); ctx.fill()
  })
  if (tp > 0 && tp < 1) glow(ctx, head[0], head[1], 14 * KF, red(a, 0.5), red(a, 0))
  vignette(ctx, a, 0.8)
  // gate label
  const gl = isoPt(o, 0, 0, 1.75), pg = prog(ls, 900, 600)
  mono(ctx, a, L(a, 'UNIVERSITY', 'UNIVERSIDAD'), gl[0], gl[1] - 16 * KF, 9.5, ink(a, 0.85), { align: 'center', alpha: pg })
  const p1 = prog(ls, c0 + 200, 600), p2 = prog(ls, tEleven, 500)
  const l1: Line[] = [{ s: 'La Estafa Maestra', size: tall ? 24 : 34, font: 'serif', color: ink(a, 0.97) }, { s: L(a, 'TRACED BY FEDERAL AUDITORS AND REPORTERS', 'RASTREADA POR AUDITORES FEDERALES Y PERIODISTAS'), size: tall ? 7.5 : 9.5, color: dim(a, 1) }]
  const l2: Line[] = [{ s: `11 ${L(a, 'agencies', 'dependencias')}`, size: tall ? 26 : 40, font: 'serif', color: red(a, 0.97) }, { s: L(a, 'ON THE THREAD', 'EN EL HILO'), size: 9.5, color: red(a, 0.85) }]
  if (tall) {
    evCard(ctx, a, W / 2, H * 0.1 + bob(a, 1), l1, { al: p1 * (1 - prog(ls, tEleven - 300, 300)), align: 'center' })
    evCard(ctx, a, W / 2, H * 0.1 + bob(a, 2), l2, { al: p2, accent: true, align: 'center' })
  } else {
    evCard(ctx, a, W * 0.05, H * 0.12 + bob(a, 1), l1, { al: p1 })
    evCard(ctx, a, W * 0.95, H * 0.12 + bob(a, 2), l2, { al: p2, accent: true, align: 'right' })
  }
}

// ── 5 · LÓPEZ OBRADOR — the books reorganised: floors lift off two towers, land on a third ─────
const reorg: SceneFn = (ctx, a) => {
  const { ls, W, H, KF } = a, tall = isTall(a)
  const c0 = cue(a, 0), c1 = cue(a, 1), c2 = cue(a, 2), c3 = cue(a, 3)
  const u = tall ? W * 0.05 : Math.min(W * 0.047, H * 0.074)
  const o = cam(a, 0.5, tall ? 0.6 : 0.63, u, 0.05)
  const HM = tall ? 5.0 : 4.0, k = HM / SECTOR_SHIFT[0].before, F = 0.24, SZ = 1.8
  // the three towers stand in a row straight across the screen (along the world diagonal t, −t)
  const pos: Pt[] = [-2.7, 0, 2.7].map((t) => [t - SZ / 2, -t - SZ / 2]), tE = [c1, c2, c3]
  const b = easeOut(prog(ls, 0, 900))
  isoFloor(ctx, a, o, 12, 0.1 * b)
  pool(ctx, a, o, -0.4, 0, 7.5, 0.2 * b)
  rpoolLite(ctx, a, o, pos[2][0] + SZ / 2, pos[2][1] + SZ / 2, 1.8, 0.16 * prog(ls, c3, 700))
  const label: Pt[] = []
  for (let i = 0; i < 3; i++) {
    const s = SECTOR_SHIFT[i], x = pos[i][0], Y = pos[i][1], before = s.before * k * b, after = s.after * k * b
    const ev = tE[i] + 150
    const kept = Math.min(before, after)
    solidBox(ctx, a, o, x, Y, SZ, SZ, kept, { lit: 0.75 })
    // floor lines on the kept block
    for (let z = F; z < kept - 0.01; z += F) poly(ctx, [isoPt(o, x, Y + SZ, z), isoPt(o, x + SZ, Y + SZ, z), isoPt(o, x + SZ, Y, z)], undefined, 'rgba(0,0,0,0.45)', 1)
    windows(ctx, a, o, x, Y, SZ, SZ, kept, 1, i * 7 + 1, 0.45, 0, 1 / F * 0.5, 1.6)
    if (after < before) {
      // the floors that go: they lift off, top first, and fade
      const n0 = Math.floor(after / F), n1 = Math.ceil(before / F)
      for (let f = n0; f < n1; f++) {
        const za = Math.max(f * F, after), zb = Math.min((f + 1) * F, before)
        if (zb - za < 0.005) continue
        const q = prog(ls, ev + (n1 - 1 - f) * 55, 900), lift = easeInOut(q) * 2.4
        if (q >= 1) continue
        solidBox(ctx, a, o, x, Y, SZ, SZ, (zb - za) * 0.9, { z: za + lift, alpha: 1 - q, lit: 0.75 })
      }
      // the old height, as a dashed outline
      const gp = prog(ls, ev, 500)
      if (gp > 0) { ctx.save(); ctx.setLineDash([4, 4]); poly(ctx, [isoPt(o, x, Y + SZ, before), isoPt(o, x + SZ, Y + SZ, before), isoPt(o, x + SZ, Y, before), isoPt(o, x, Y, before)], undefined, ink(a, 0.55 * gp), Math.max(1, KF)); line(ctx, isoPt(o, x, Y + SZ, after), isoPt(o, x, Y + SZ, before), ink(a, 0.4 * gp)); line(ctx, isoPt(o, x + SZ, Y + SZ, after), isoPt(o, x + SZ, Y + SZ, before), ink(a, 0.4 * gp)); line(ctx, isoPt(o, x + SZ, Y, after), isoPt(o, x + SZ, Y, before), ink(a, 0.4 * gp)); ctx.restore() }
    } else {
      // the floors that arrive: red, dropping in from above
      const n0 = Math.floor(before / F), n1 = Math.ceil(after / F)
      for (let f = n0; f < n1; f++) {
        const za = Math.max(f * F, before), zb = Math.min((f + 1) * F, after)
        if (zb - za < 0.005) continue
        const q = prog(ls, ev + (f - n0) * 200, 700)
        if (q <= 0) continue
        solidBox(ctx, a, o, x, Y, SZ, SZ, (zb - za) * 0.92, { z: za + (1 - easeOut(q)) * 2.2, alpha: q, accent: true, lit: 0.9 })
      }
    }
    label.push(isoPt(o, x + SZ, Y + SZ, 0))
  }
  vignette(ctx, a, 0.8)
  // floor plates: the sector, and its two totals
  const unit = L(a, 'BN PESOS', 'MMDP')
  for (let i = 0; i < 3; i++) {
    const s = SECTOR_SHIFT[i], q = label[i], pa = prog(ls, tE[i] + 400, 500)
    mono(ctx, a, (a.lang === 'es' ? s.name : s.en).toUpperCase(), q[0], q[1] + 18 * KF, tall ? 8 : 10, ink(a, 0.92), { align: 'center', alpha: b })
    mono(ctx, a, tall ? `${fmt(s.before, a)} → ${fmt(s.after, a)}` : `${fmt(s.before, a, 1)} → ${fmt(s.after, a, 1)} ${unit}`, q[0], q[1] + 32 * KF, tall ? 7 : 9, i === 2 ? red(a, 0.9) : dim(a, 1), { align: 'center', alpha: pa })
  }
  // era stamp
  const sw = prog(ls, c0 + 600, 600)
  if (!tall) {
    mono(ctx, a, '2013 – 2018', W * 0.05, H * 0.14, 11, dim(a, 1), { alpha: b * (1 - sw) })
    mono(ctx, a, '2019 – 2024', W * 0.05, H * 0.14, 11, ink(a, 0.95), { alpha: sw })
    mono(ctx, a, L(a, 'CONTRACTING BY SECTOR', 'CONTRATACIÓN POR SECTOR'), W * 0.05, H * 0.14 + 16 * KF, 9, dim(a, 1), { alpha: b })
  }
  const cards: [string, number, boolean][] = [['−45%', c1, false], ['−85%', c2, false], ['×3', c3, true]]
  cards.forEach(([s, t, acc], i) => {
    const p = prog(ls, t + 500, 500)
    if (p <= 0) return
    const ln: Line[] = [{ s, size: tall ? 30 : 44, font: 'serif', color: acc ? red(a, 0.97) : ink(a, 0.97) }]
    if (tall) evCard(ctx, a, W / 2, H * 0.1 + bob(a, i), ln, { al: p * (i < 2 ? 1 - prog(ls, cards[i + 1][1] + 300, 300) : 1), accent: acc, align: 'center' })
    else {
      const r = evCard(ctx, a, label[i][0], H * 0.12 + bob(a, i), ln, { al: p, accent: acc, align: 'center' })
      leader(ctx, a, isoPt(o, pos[i][0] + SZ / 2, pos[i][1] + SZ / 2, Math.max(SECTOR_SHIFT[i].before, SECTOR_SHIFT[i].after) * k), [r.x + r.w / 2, r.y + r.h], p, acc)
    }
  })
}

/** A red pool of light on the floor (the kit's pool() is bone only). */
function rpoolLite(ctx: C, a: SceneArgs, o: Iso, x: number, y: number, r: number, al: number) {
  if (al <= 0.005) return
  const c = isoPt(o, x, y), rx = r * o.u * 1.2
  ctx.save(); ctx.translate(c[0], c[1]); ctx.scale(1, 0.58)
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx); g.addColorStop(0, red(a, al)); g.addColorStop(1, red(a, 0))
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, rx, 0, TAU); ctx.fill(); ctx.restore()
}

// ── 6 · THE ARMY — the army's compound, its new works, and its slice of the table's rim ───────
const army: SceneFn = (ctx, a) => {
  const { ls, W, H, KF } = a, tall = isTall(a)
  const c0 = cue(a, 0), c1 = cue(a, 1)
  const u = tall ? W * 0.06 : Math.min(W * 0.048, H * 0.077)
  const o = cam(a, 0.5, tall ? 0.45 : 0.47, u, 0.05)
  const R = 4.2, TH = 0.35, P = (x: number, y: number, z = 0) => isoPt(o, x, y, z)
  const b = easeOut(prog(ls, 0, 900))
  const tA = c0 + 0.3 * (c1 - c0), tR = c0 + 0.58 * (c1 - c0), tC = c0 + 0.8 * (c1 - c0)
  const t22 = c1 + 0.5 * (a.dur - c1), t54 = c1 + 0.76 * (a.dur - c1)
  const share = prog(ls, t22, 400) > 0 ? lerp(SEDENA_SHARE[0].v, SEDENA_SHARE[3].v, easeInOut(prog(ls, t54, 600))) : 0
  const shareAl = prog(ls, t22, 400)
  pool(ctx, a, o, 0, 0, 7, 0.22 * b)
  // the table: every peso of federal contracting
  const ring = (th0: number, th1: number, z: number) => { const pts: Pt[] = []; for (let s = 0; s <= 48; s++) { const t = lerp(th0, th1, s / 48); pts.push(P(R * Math.cos(t), R * Math.sin(t), z)) } return pts }
  const rimF = ring(-Math.PI / 4, Math.PI * 0.75, 0), rimB = ring(-Math.PI / 4, Math.PI * 0.75, -TH * b).reverse()
  poly(ctx, [...rimF, ...rimB], a.pal.bg); poly(ctx, [...rimF, ...rimB], ink(a, 0.2 * b), ink(a, 0.35 * b))
  const top = ring(0, TAU, 0)
  poly(ctx, top, a.pal.bg); poly(ctx, top, ink(a, 0.09 * b), ink(a, 0.4 * b))
  if (share > 0) {
    const sp = (share / 100) * TAU, c = Math.PI / 4
    const f = ring(c - sp / 2, c + sp / 2, 0), bk = ring(c - sp / 2, c + sp / 2, -TH).reverse()
    poly(ctx, [...f, ...bk], red(a, 0.85 * shareAl))
    const wedge: Pt[] = [P(0, 0), ...ring(c - sp / 2, c + sp / 2, 0)]
    poly(ctx, wedge, red(a, 0.1 * shareAl))
  }
  // the compound
  const cx0 = -2.6, cy0 = -2.6, cw = 2.0, wh = 0.32 * b, wt = 0.12
  solidBox(ctx, a, o, cx0, cy0, cw, wt, wh, { lit: 0.7 }); solidBox(ctx, a, o, cx0, cy0, wt, cw, wh, { lit: 0.7 })
  solidBox(ctx, a, o, cx0 + 0.35, cy0 + 0.4, 1.3, 0.4, 0.35 * b, { lit: 0.8 }); solidBox(ctx, a, o, cx0 + 0.35, cy0 + 1.1, 1.3, 0.4, 0.35 * b, { lit: 0.8 })
  solidBox(ctx, a, o, cx0, cy0 + cw - wt, cw, wt, wh, { lit: 0.7 }); solidBox(ctx, a, o, cx0 + cw - wt, cy0, wt, cw, wh, { lit: 0.7 })
  const fp: Pt = [cx0 + 0.25, cy0 + 0.25]
  line(ctx, P(fp[0], fp[1], 0), P(fp[0], fp[1], 1.4 * b), ink(a, 0.8), Math.max(1, KF))
  const wv = (s: number) => 0.06 * Math.sin(ls * 0.006 + s * 3)
  poly(ctx, [P(fp[0], fp[1], 1.4 * b), P(fp[0] + 0.25, fp[1], 1.4 * b + wv(1)), P(fp[0] + 0.5, fp[1], 1.4 * b + wv(2)), P(fp[0] + 0.5, fp[1], 1.12 * b + wv(2)), P(fp[0] + 0.25, fp[1], 1.12 * b + wv(1)), P(fp[0], fp[1], 1.12 * b)], ink(a, 0.75 * b))
  // the airport
  const pa = easeOut(prog(ls, tA, 700))
  if (pa > 0) {
    solidBox(ctx, a, o, 0.2, -2.9, 1.3, 0.7, 0.45 * pa, { lit: 0.8 })
    solidBox(ctx, a, o, 1.9, -2.7, 0.3, 0.3, 1.1 * pa, { lit: 0.9 })
    solidBox(ctx, a, o, 1.78, -2.82, 0.54, 0.54, 0.22, { z: 1.1 * pa, alpha: pa, lit: 1 })
    poly(ctx, [P(0, -1.75), P(3.6 * pa, -1.75), P(3.6 * pa, -1.05), P(0, -1.05)], `rgba(0,0,0,0.6)`, ink(a, 0.45 * pa))
    for (let d = 0; d < 7; d++) { const x = 0.2 + d * 0.5; if (x < 3.5 * pa) line(ctx, P(x, -1.4), P(x + 0.25, -1.4), ink(a, 0.7)) }
    const px = 0.4 + 2.8 * ((ls * 0.00011) % 1), py = -1.4
    poly(ctx, [P(px + 0.35, py), P(px - 0.3, py - 0.05), P(px - 0.3, py + 0.05)], ink(a, 0.95 * pa))
    poly(ctx, [P(px + 0.02, py - 0.38), P(px + 0.1, py), P(px + 0.02, py + 0.38), P(px - 0.06, py)], ink(a, 0.85 * pa))
  }
  // the railway
  const pr = prog(ls, tR, 800)
  const track: Pt[] = [[-3.9, 0.9], [-2.2, 1.2], [-0.6, 2.1], [0.9, 3.3]]
  if (pr > 0) {
    const sp = track.map(([x, y]) => P(x, y)), sp2 = track.map(([x, y]) => P(x + 0.18, y - 0.18))
    partial(ctx, sp, pr * 3, ink(a, 0.6), Math.max(1, KF)); partial(ctx, sp2, pr * 3, ink(a, 0.6), Math.max(1, KF))
    if (pr >= 1) for (let car = 0; car < 3; car++) {
      const t = ((ls * 0.00009 + 10) % 1.3) - car * 0.07
      if (t < 0 || t > 1) continue
      const at = (tt: number): Pt => { const id = clamp01(tt) * 3, kk = Math.min(2, Math.floor(id)), f = id - kk; return [lerp(track[kk][0], track[kk + 1][0], f) + 0.09, lerp(track[kk][1], track[kk + 1][1], f) - 0.09] }
      const p0 = at(t), p1 = at(t - 0.05)
      line(ctx, P(p0[0], p0[1], 0.16), P(p1[0], p1[1], 0.16), ink(a, 0.95), Math.max(3, 0.28 * u))
    }
  }
  // customs: a booth and a barrier that rises and falls
  const pc = easeOut(prog(ls, tC, 700))
  if (pc > 0) {
    solidBox(ctx, a, o, 2.3, 0.0, 0.6, 0.6, 0.6 * pc, { lit: 0.9 })
    const ph = 0.6 * (1 + Math.sin(ls * 0.0012)) * pc, bx = 2.6, by = 0.6
    line(ctx, P(bx, by, 0.4), P(bx, by + 1.3 * Math.cos(ph), 0.4 + 1.3 * Math.sin(ph)), ink(a, 0.9), Math.max(1.5, 1.8 * KF))
    for (let t = 0; t < 3; t++) solidBox(ctx, a, o, 1.9 - t * 0.0, 1.5 + t * 0.7, 0.5, 0.45, 0.35 * pc, { lit: 0.6, alpha: pc })
  }
  vignette(ctx, a, 0.8)
  // labels, in the order the narrator names them
  const tag = (s: string, at: Pt, p: number) => {
    if (p <= 0) return
    const y = at[1] - 30 * KF
    line(ctx, at, [at[0], y + 4 * KF], ink(a, 0.5 * p))
    mono(ctx, a, s, at[0], y, tall ? 8 : 9.5, ink(a, 0.92), { align: 'center', alpha: p })
  }
  tag(L(a, 'THE ARMY', 'EL EJÉRCITO'), P(cx0 + 1, cy0 + 1, 0.6), prog(ls, 300, 500))
  tag(L(a, 'AIRPORTS', 'AEROPUERTOS'), P(0.85, -2.55, 0.6), prog(ls, tA + 300, 500))
  tag(L(a, 'A RAILWAY', 'UN TREN'), P(-2.2, 1.2, 0.2), prog(ls, tR + 300, 500))
  tag(L(a, 'CUSTOMS', 'ADUANAS'), P(2.6, 0.3, 0.7), prog(ls, tC + 300, 500))
  // the share, on the voice
  const p1 = prog(ls, t22, 500), p2 = prog(ls, t54, 500)
  const rimPt = P(R * Math.cos(Math.PI / 4), R * Math.sin(Math.PI / 4), -TH / 2)
  const ln: Line[] = [
    { s: p2 > 0 ? `${fmt(SEDENA_SHARE[0].v, a, 1)}% → ${fmt(SEDENA_SHARE[3].v, a, 1)}%` : `${fmt(SEDENA_SHARE[0].v, a, 1)}%`, size: tall ? 26 : 40, font: 'serif', color: red(a, 0.97) },
    { s: p2 > 0 ? `${SEDENA_SHARE[0].y} → ${SEDENA_SHARE[3].y}` : String(SEDENA_SHARE[0].y), size: 9.5, color: red(a, 0.85) },
    { s: L(a, 'OF ALL FEDERAL CONTRACTING', 'DE TODA LA CONTRATACIÓN FEDERAL'), size: tall ? 7.5 : 9, color: dim(a, 1) },
  ]
  const r = tall ? evCard(ctx, a, W / 2, H * 0.1 + bob(a, 1), ln, { al: p1, accent: true, align: 'center' }) : evCard(ctx, a, W * 0.95, H * 0.5 + bob(a, 1), ln, { al: p1, accent: true, align: 'right' })
  leader(ctx, a, rimPt, edge(r, rimPt), p1, true)
}

// ── 7 · MEDICINE — many depots give way to one warehouse; the old leader falls to zero ─────────
const medicine: SceneFn = (ctx, a) => {
  const { ls, W, H, KF } = a, tall = isTall(a)
  const c0 = cue(a, 0), c1 = cue(a, 1), c2 = cue(a, 2), c3 = cue(a, 3)
  const u = tall ? W * 0.058 : Math.min(W * 0.05, H * 0.082)
  const o = cam(a, tall ? 0.52 : 0.48, tall ? 0.5 : 0.62, u, 0.05)
  const b = easeOut(prog(ls, 0, 900))
  isoFloor(ctx, a, o, 13, 0.09 * b)
  pool(ctx, a, o, 2.6, -0.5, 5, 0.24 * b)
  pool(ctx, a, o, -4.5, -0.5, 3.6, 0.12 * b)
  const depots: Pt[] = [[-6.2, -2.4], [-4.8, -2.6], [-3.4, -2.4], [-6.4, -1.0], [-3.4, -0.9], [-6.2, 0.4], [-4.8, 0.6], [-3.4, 0.5]]
  const LEAD: Pt = [-5.0, -1.15]
  const WX = 0.8, WY = -2.2, WW = 4, WD = 3
  const wh = lerp(0.35, 1.7, easeInOut(prog(ls, c0 + 300, Math.max(800, c2 - c0)))) * b
  // trucks: depot → warehouse, during the first sentence and after
  const all = [...depots, LEAD]
  all.forEach((d, i) => {
    const dimmed = prog(ls, c0 + 900 + i * 180, 700)
    solidBox(ctx, a, o, d[0], d[1], 0.8, 0.8, 0.5 * b, { lit: lerp(0.8, 0.3, dimmed), alpha: i < depots.length ? 1 : 0 })
  })
  // the old leading distributor: a big depot with its stack of crates
  const fall = easeInOut(prog(ls, c1 + 200, 1400)), lp = 1 - fall
  solidBox(ctx, a, o, LEAD[0], LEAD[1], 1.2, 1.2, 0.8 * b, { lit: lerp(0.9, 0.35, fall) })
  for (let s = 0; s < 6; s++) {
    const zz = s * 0.3
    if (zz >= 1.8 * lp) continue
    solidBox(ctx, a, o, LEAD[0] + 1.3, LEAD[1] + 0.2, 0.55, 0.55, Math.min(0.27, 1.8 * lp - zz), { z: zz, accent: true, lit: 0.9 })
  }
  // the central warehouse with its saw-tooth roof
  solidBox(ctx, a, o, WX, WY, WW, WD, wh, { lit: 0.85 })
  const P = (x: number, y: number, z: number) => isoPt(o, x, y, z)
  for (let k = 0; k < 4; k++) {
    const x0 = WX + (k * WW) / 4, x1 = x0 + WW / 4
    poly(ctx, [P(x0, WY + WD, wh), P(x1, WY + WD, wh + 0.4 * b), P(x1, WY, wh + 0.4 * b), P(x0, WY, wh)], ink(a, 0.55), ink(a, 0.4))
    poly(ctx, [P(x0, WY + WD, wh), P(x1, WY + WD, wh), P(x1, WY + WD, wh + 0.4 * b)], ink(a, 0.3), ink(a, 0.45))
  }
  windows(ctx, a, o, WX, WY, WW, WD, wh * 0.6, 1, 77, 0.55, 0.1, 1.2, 1.4)
  const sp = prog(ls, c2 + 200, 500)
  if (sp > 0) onFace(ctx, P(WX + 0.5, WY + WD, wh * 0.95), 'x', () => {
    ctx.fillStyle = ink(a, 0.85 * sp); ctx.fillRect(0, 0, 3 * u, 0.4 * u)
    text(ctx, L(a, 'HEALTH', 'SALUD'), 1.5 * u, 0.21 * u, { size: 0.28 * u, font: 'mono', weight: 700, color: a.pal.bg, align: 'center', baseline: 'middle', tracking: 0.04 * u, alpha: sp })
  })
  // trucks
  depots.forEach((d, i) => {
    const t = (ls * 0.00022 + i * 0.137) % 1, live = ls > c0 + 200 && ls < a.dur
    if (!live) return
    const x = lerp(d[0] + 0.8, WX - 0.2, t), y = lerp(d[1] + 0.3, WY + 1.2 + (i % 3) * 0.5, t)
    solidBox(ctx, a, o, x, y, 0.42, 0.24, 0.24, { lit: 0.9, alpha: Math.sin(Math.PI * t) * prog(ls, c0 + 200, 400) })
  })
  vignette(ctx, a, 0.8)
  // the leading distributor's line (no name): the real series, falling to zero
  const p1 = prog(ls, c1, 500), p2 = prog(ls, c2 + 300, 500), p3 = prog(ls, c3, 600)
  const leadPt = P(LEAD[0] + 0.6, LEAD[1] + 0.6, 0.9)
  const cw = (tall ? 200 : 250) * KF, chh = (tall ? 92 : 110) * KF
  const cx = tall ? W / 2 - cw / 2 : W * 0.05, cy = tall ? H * 0.1 : H * 0.12
  if (p1 > 0) {
    const al = tall ? p1 * (1 - prog(ls, c2, 300)) : p1
    ctx.save(); ctx.globalAlpha *= al
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(cx + 5 * KF, cy + bob(a, 1) + 7 * KF, cw, chh)
    ctx.fillStyle = a.pal.bg; ctx.fillRect(cx, cy + bob(a, 1), cw, chh)
    ctx.strokeStyle = red(a, 0.85); ctx.lineWidth = Math.max(1, KF); ctx.strokeRect(cx, cy + bob(a, 1), cw, chh)
    const yy = cy + bob(a, 1)
    mono(ctx, a, L(a, 'THE OLD LEADING DISTRIBUTOR', 'LA VIEJA DISTRIBUIDORA LÍDER'), cx + 12 * KF, yy + 18 * KF, tall ? 7.5 : 9, red(a, 0.9))
    const vals = BIG4[0].values, mx = Math.max(...vals), gx = cx + 12 * KF, gw = cw - 24 * KF, gy = yy + 30 * KF, gh = chh - 56 * KF
    line(ctx, [gx, gy + gh], [gx + gw, gy + gh], ink(a, 0.35))
    const pts: Pt[] = vals.map((v, i) => [gx + (i / (vals.length - 1)) * gw, gy + gh - (v / mx) * gh])
    const hd = partial(ctx, pts, (vals.length - 1) * easeInOut(prog(ls, c1 + 100, 1400)), red(a, 0.9), Math.max(1.4, 1.6 * KF))
    ctx.fillStyle = red(a, 1); ctx.beginPath(); ctx.arc(hd[0], hd[1], 3 * KF, 0, TAU); ctx.fill()
    mono(ctx, a, '2003', gx, gy + gh + 13 * KF, 8.5, dim(a, 1))
    mono(ctx, a, '2025', gx + gw, gy + gh + 13 * KF, 8.5, dim(a, 1), { align: 'right' })
    const z0 = prog(ls, c1 + 1500, 300)
    text(ctx, '0', gx + gw - 2 * KF, gy + gh - 8 * KF, { size: 22 * KF, color: red(a, 0.97), align: 'right', alpha: z0 })
    ctx.restore()
    if (!tall) leader(ctx, a, leadPt, [cx + cw * 0.5, yy + chh], al, true)
  }
  const whPt = P(WX + WW * 0.6, WY + WD * 0.4, wh + 0.4)
  const l3: Line[] = [{ s: `${count(1.19, 1, 2, a.lang)} ${L(a, 'trillion pesos', 'billones de pesos')}`, size: tall ? 26 : 40, font: 'serif', color: ink(a, 0.97) }, { s: L(a, 'HEALTH · 2019–2024 · THE LARGEST LINE', 'SALUD · 2019–2024 · LA PARTIDA MÁS GRANDE'), size: tall ? 7.5 : 9.5, color: dim(a, 1) }]
  const r3 = tall ? evCard(ctx, a, W / 2, H * 0.1 + bob(a, 3), l3, { al: Math.max(p2 * 0.0, p3), align: 'center' }) : evCard(ctx, a, W * 0.95, H * 0.13 + bob(a, 3), l3, { al: p3, align: 'right' })
  leader(ctx, a, whPt, edge(r3, whPt), p3)
  if (p2 > 0 && p3 <= 0) mono(ctx, a, L(a, 'THE LARGEST LINE IN THE BOOK', 'LA PARTIDA MÁS GRANDE DEL LIBRO'), whPt[0], whPt[1] - 56 * KF, 9.5, ink(a, 0.9), { align: 'center', alpha: p2 })
}

// ── 8 · THE PANDEMIC — a decree on the desk; fewer folders on the belt, a fuller pipe below ───
const covid: SceneFn = (ctx, a) => {
  const { ls, W, H, KF } = a, tall = isTall(a)
  const c0 = cue(a, 0), c1 = cue(a, 1), c2 = cue(a, 2), c3 = cue(a, 3), c4 = cue(a, 4)
  const u = tall ? W * 0.06 : Math.min(W * 0.045, H * 0.073)
  const o = cam(a, 0.5, tall ? 0.46 : 0.5, u, 0.05)
  const P = (x: number, y: number, z = 0) => isoPt(o, x, y, z)
  const b = easeOut(prog(ls, 0, 900))
  const X0 = -5, X1 = 5, Y0 = -1.6, Y1 = 1.6, DEP = 1.7
  pool(ctx, a, o, 0, 0, 7, 0.2 * b)
  // the cut-away floor: a slab with its front face open
  poly(ctx, [P(X0, Y0), P(X1, Y0), P(X1, Y1), P(X0, Y1)], a.pal.bg)
  poly(ctx, [P(X0, Y0), P(X1, Y0), P(X1, Y1), P(X0, Y1)], ink(a, 0.14 * b), ink(a, 0.4 * b))
  poly(ctx, [P(X1, Y0), P(X1, Y1), P(X1, Y1, -DEP), P(X1, Y0, -DEP)], ink(a, 0.2 * b), ink(a, 0.35 * b))
  const money = easeInOut(prog(ls, c3, 1200))
  onFace(ctx, P(X0, Y1, 0), 'x', () => {
    const fw = (X1 - X0) * u, fh = DEP * u * b
    ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillRect(0, 0, fw, fh)
    ctx.strokeStyle = ink(a, 0.35); ctx.lineWidth = 1; ctx.strokeRect(0, 0, fw, fh)
    const cyp = fh * 0.55, pr = lerp(0.22, 0.3, money) * u
    ctx.strokeStyle = dim(a, 0.8); ctx.lineWidth = Math.max(1, KF)
    ctx.beginPath(); ctx.moveTo(0, cyp - pr); ctx.lineTo(fw, cyp - pr); ctx.moveTo(0, cyp + pr); ctx.lineTo(fw, cyp + pr); ctx.stroke()
    const n = Math.round(lerp(10, 14.5, money)), sp = lerp(0.00012, 0.00017, money)
    for (let k = 0; k < n; k++) {
      const t = (ls * sp + k / n) % 1, x = t * fw
      ctx.fillStyle = red(a, 0.9 * Math.min(1, Math.sin(Math.PI * t) * 3) * b)
      ctx.beginPath(); ctx.ellipse(x, cyp, pr * 0.42, pr * 0.82, 0, 0, TAU); ctx.fill()
    }
    text(ctx, L(a, 'MONEY', 'DINERO'), 10 * KF, fh - 8 * KF, { size: 9 * KF, font: 'mono', color: red(a, 0.8), tracking: 1.1 * KF })
  })
  // the record office
  const lights = lerp(0.6, 0.25, prog(ls, c0 + 400, 1200))
  solidBox(ctx, a, o, -0.6, -1.4, 2.6, 1.6, 1.7 * b, { lit: 0.75 })
  windows(ctx, a, o, -0.6, -1.4, 2.6, 1.6, 1.7 * b, 1, 31, lights, 0, 1.4, 1.6)
  // the belt and its folders: fewer after c2
  solidBox(ctx, a, o, -4.6, 0.5, 4.0, 0.55, 0.16 * b, { lit: 0.5 })
  const dens = lerp(1, YEARS[18].contracts / YEARS[17].contracts, prog(ls, c2, 300))
  const NF = 12
  for (let k = NF - 1; k >= 0; k--) {
    const ph = ls * 0.00018 + k / NF, t = ph % 1, cyc = Math.floor(ph)
    const late = (cyc * NF + k) * 0.37 % 1 // deterministic thinning pattern
    if (cyc > 0 && late > dens && ls > c2) continue
    const x = lerp(-0.7, -4.4, t)
    solidBox(ctx, a, o, x, 0.62, 0.1, 0.32, 0.42, { z: 0.16 * b, lit: 1, alpha: b * Math.min(1, Math.sin(Math.PI * t) * 4) })
  }
  // the desk where the decree lands
  solidBox(ctx, a, o, 2.6, 0.2, 1.4, 0.9, 0.7 * b, { lit: 0.7 })
  const dp = easeOut(prog(ls, c1, 700))
  const deskTop = P(3.3, 0.65, 0.7)
  if (dp > 0) onTop(ctx, P(2.75, 0.3, 0.7 + (1 - dp) * 2.5), () => {
    ctx.fillStyle = ink(a, 0.85 * dp); ctx.fillRect(0, 0, 1.1 * u, 0.7 * u)
    ctx.fillStyle = a.pal.bg; for (let i = 0; i < 4; i++) ctx.fillRect(0.12 * u, (0.14 + i * 0.13) * u, (0.5 + 0.3 * rnd(i)) * u, 0.04 * u)
  })
  vignette(ctx, a, 0.8)
  // cards
  const p1 = prog(ls, c1 + 400, 500), p2 = prog(ls, c2 + 200, 500), p4 = prog(ls, c4, 500)
  const l1: Line[] = [{ s: L(a, 'EMERGENCY DECREE', 'DECRETO DE EMERGENCIA'), size: tall ? 16 : 22, font: 'serif', color: ink(a, 0.97) }, { s: L(a, 'BIDDING RULES: SUSPENDED', 'REGLAS DE LICITACIÓN: SUSPENDIDAS'), size: tall ? 7.5 : 9.5, color: ink(a, 0.85) }]
  const l2: Line[] = [{ s: `${fmt(YEARS[17].contracts, a)} → ${fmt(YEARS[18].contracts, a)}`, size: tall ? 18 : 26, font: 'serif', color: ink(a, 0.97) }, { s: L(a, 'CONTRACTS · 2019 → 2020', 'CONTRATOS · 2019 → 2020'), size: 9, color: dim(a, 1) }]
  const l4: Line[] = [{ s: '+45%', size: tall ? 32 : 48, font: 'serif', color: red(a, 0.97) }, { s: `${fmt(YEARS[17].valueB, a, 1)} → ${fmt(YEARS[18].valueB, a, 1)} ${L(a, 'BN PESOS', 'MMDP')}`, size: tall ? 7.5 : 9.5, color: red(a, 0.85) }, { s: L(a, 'CONTRACTED · 2019 → 2020', 'CONTRATADO · 2019 → 2020'), size: tall ? 7.5 : 9, color: dim(a, 1) }]
  const belt = P(-2.6, 0.8, 0.6), pipe = P(-1, Y1, -DEP * 0.45)
  if (tall) {
    const y = H * 0.1
    evCard(ctx, a, W / 2, y + bob(a, 1), l1, { al: p1 * (1 - prog(ls, c2, 300)), align: 'center' })
    evCard(ctx, a, W / 2, y + bob(a, 2), l2, { al: p2 * (1 - prog(ls, c4 - 200, 300)), align: 'center' })
    evCard(ctx, a, W / 2, y + bob(a, 3), l4, { al: p4, accent: true, align: 'center' })
  } else {
    const r1 = evCard(ctx, a, W * 0.95, H * 0.12 + bob(a, 1), l1, { al: p1, align: 'right' })
    leader(ctx, a, deskTop, edge(r1, deskTop), p1)
    const r2 = evCard(ctx, a, W * 0.05, H * 0.12 + bob(a, 2), l2, { al: p2 })
    leader(ctx, a, belt, edge(r2, belt), p2)
    const r4 = evCard(ctx, a, W * 0.95, H * 0.36 + bob(a, 3), l4, { al: p4, accent: true, align: 'right' })
    leader(ctx, a, pipe, edge(r4, pipe), p4, true)
  }
}

// ── 9 · THE LINE — masts rise over the avenue; a red cord is strung across their tops ─────────
function lineCam(a: SceneArgs) {
  const tall = isTall(a)
  const u = tall ? a.W * 0.052 : Math.min(a.W * 0.05, a.H * 0.08)
  const o = cam(a, 0.5, tall ? 0.66 : 0.72, u, 0.03)
  o.ox -= 2 * avT(14.5) * 0.866 * u
  return { o, HM: tall ? 3.2 : 2.2, MZ: tall ? 7.2 : 5.4 }
}
const daOf = (i: number) => YEARS[i].da ?? 0
function mastTop(o: Iso, i: number, MZ: number): Pt { const [x, y] = avXY(i); return isoPt(o, x, y, PL + (daOf(i) / 100) * MZ) }

const theLine: SceneFn = (ctx, a) => {
  const { ls, W, H, KF } = a, tall = isTall(a)
  const c1 = cue(a, 1), c2 = cue(a, 2), c3 = cue(a, 3), c4 = cue(a, 4)
  const { o, HM, MZ } = lineCam(a)
  const b = prog(ls, 0, 800)
  isoFloor(ctx, a, o, 16, 0.06 * b)
  pool(ctx, a, o, avT(16) + 0.3, -avT(16) + 0.3, 7, 0.14 * b)
  slab(ctx, a, o, avT(5.4), avT(23.8), 0.55, PL, { lit: 0.5, al: b })
  for (let i = 6; i < YEARS.length; i++) tower(ctx, a, o, i, tH(i, HM) * easeOut(prog(ls, (i - 6) * 70, 700)), { al: 0.75, on: 0.35, lit: 0.6 })
  // the masts, one per year with the award type on record (2011 on)
  for (let i = 9; i < YEARS.length; i++) {
    const mp = easeOut(prog(ls, c1 + (i - 9) * 70, 700))
    if (mp <= 0) continue
    const [x, y] = avXY(i), z0 = PL + tH(i, HM), zt = PL + (daOf(i) / 100) * MZ
    line(ctx, isoPt(o, x, y, z0), isoPt(o, x, y, lerp(z0, zt, mp)), ink(a, 0.55), Math.max(1, KF))
  }
  // the 50% / 100% gauge at the left end
  const gx = avT(6.6), gp = prog(ls, c1 + 200, 600)
  if (gp > 0) {
    const g0 = isoPt(o, gx - 0.6, -gx - 0.6, PL), g1 = isoPt(o, gx - 0.6, -gx - 0.6, PL + MZ)
    line(ctx, g0, [g0[0], lerp(g0[1], g1[1], gp)], ink(a, 0.5))
    for (const v of [0, 50, 100]) {
      const q = isoPt(o, gx - 0.6, -gx - 0.6, PL + (v / 100) * MZ)
      line(ctx, [q[0] - 4 * KF, q[1]], [q[0] + 4 * KF, q[1]], ink(a, 0.6 * gp))
      mono(ctx, a, `${v}%`, q[0] - 8 * KF, q[1] + 3 * KF, 8.5, dim(a, 1), { align: 'right', alpha: gp })
    }
    for (let i = 6; i < 9; i++) { const q = isoPt(o, avXY(i)[0], avXY(i)[1], PL + tH(i, HM) + 0.5); mono(ctx, a, '—', q[0], q[1], 9, dim(a, 0.9), { align: 'center', alpha: gp }) }
  }
  // the cord: 2011 at c2, 2017 at c3, 2023 at c4, then on to the partial 2025
  const s = ls < c2 ? -1 : ls < c3 ? lerp(0, 6, easeInOut(prog(ls, c2 + 300, c3 - c2 - 300))) : ls < c4 ? lerp(6, 12, easeInOut(prog(ls, c3 + 300, c4 - c3 - 300))) : lerp(12, 14, easeInOut(prog(ls, c4 + 800, 1400)))
  const pts: Pt[] = []
  for (let i = 9; i < YEARS.length; i++) pts.push(mastTop(o, i, MZ))
  if (s >= 0) {
    const solid = pts.slice(0, 14) // 2011–2024; 2025 is partial
    const head = partial(ctx, solid, Math.min(s, 13), red(a, 0.92), Math.max(2, 2.2 * KF))
    if (s > 13) partial(ctx, [solid[13], pts[14]], s - 13, red(a, 0.6), Math.max(1.5, 1.6 * KF), [4, 4])
    pts.forEach((q, j) => { if (s >= j) { ctx.fillStyle = red(a, 1); ctx.beginPath(); ctx.arc(q[0], q[1], 3.2 * KF, 0, TAU); ctx.fill() } })
    if (s < 14) glow(ctx, head[0], head[1], 16 * KF, red(a, 0.45), red(a, 0))
  }
  vignette(ctx, a, 0.75)
  // header
  const hp = prog(ls, c1, 600)
  const hdr: Line[] = [{ s: L(a, 'CONTRACTS AWARDED WITH NO COMPETITION', 'CONTRATOS ADJUDICADOS SIN COMPETENCIA'), size: tall ? 7.5 : 10, color: ink(a, 0.9) }, { s: L(a, 'SHARE OF EACH YEAR · ON RECORD FROM 2011', 'PROPORCIÓN POR AÑO · REGISTRADA DESDE 2011'), size: tall ? 7 : 8.5, color: dim(a, 1) }]
  evCard(ctx, a, tall ? W / 2 : W * 0.05, H * 0.11, hdr, { al: hp, align: tall ? 'center' : 'left' })
  // the three readings, on the voice
  const marks: [number, number, number][] = [[9, 71, c2], [15, 77, c3], [21, 82, c4]]
  marks.forEach(([i, v, t], j) => {
    const p = prog(ls, t + 200, 500)
    if (p <= 0) return
    const q = mastTop(o, i, MZ)
    const sz = tall ? 20 : 34, y = q[1] - (tall ? 30 : 48) * KF + bob(a, j)
    line(ctx, q, [q[0], y + 6 * KF], red(a, 0.6 * p))
    text(ctx, `${v}%`, q[0], y, { size: sz * KF, color: red(a, 0.97), align: 'center', alpha: p })
    mono(ctx, a, String(YEARS[i].y), q[0], y - sz * KF - 2 * KF, tall ? 7.5 : 9, red(a, 0.85), { align: 'center', alpha: p })
  })
}

// ── 10 · COUNT AND MONEY — two trays, side by side: folders by count, coins by money ──────────
function tray(ctx: C, a: SceneArgs, o: Iso, kind: 'folder' | 'coin', base: number, flips: number, tFlip: number, step: number, b: number) {
  const PITCH = 0.5
  solidBox(ctx, a, o, -0.15, -0.15, 5.3, 5.3, 0.14 * b, { lit: 0.4 })
  pool(ctx, a, o, 2.5, 2.5, 3.6, 0.14 * b)
  for (let s = 0; s <= 18; s++) for (let r = 0; r < 10; r++) {
    const c = s - r
    if (c < 0 || c > 9) continue
    const idx = r * 10 + c, j = idx - base
    const flip = j >= 0 && j < flips ? prog(a.ls, tFlip + j * step, 300) : idx < base ? 1 : 0
    const hop = j >= 0 && j < flips ? Math.sin(Math.PI * prog(a.ls, tFlip + j * step, 300)) * 0.35 : 0
    const appear = prog(a.ls, 100 + (r + c) * 35, 400) * b
    if (appear <= 0) continue
    const x = c * PITCH, y = r * PITCH, acc = flip >= 0.5
    if (kind === 'folder') solidBox(ctx, a, o, x + 0.09, y + 0.2, 0.32, 0.1, 0.42 * appear, { z: 0.14 + hop, accent: acc, lit: acc ? 1 : 0.7 })
    else {
      const ctr = isoPt(o, x + 0.25, y + 0.25, 0.14 + hop), rx = 0.17 * o.u * 1.15, ry = rx * 0.55
      for (let l = 0; l < 3; l++) {
        const yy = ctr[1] - l * 0.07 * o.u * appear
        ctx.fillStyle = acc ? red(a, 0.55) : ink(a, 0.3); ctx.beginPath(); ctx.ellipse(ctr[0], yy + ry * 0.35, rx, ry, 0, 0, TAU); ctx.fill()
        ctx.fillStyle = acc ? red(a, 0.92) : ink(a, 0.72); ctx.beginPath(); ctx.ellipse(ctr[0], yy, rx, ry, 0, 0, TAU); ctx.fill()
      }
    }
  }
}

const value: SceneFn = (ctx, a) => {
  const { ls, W, H, KF } = a, tall = isTall(a)
  const c0 = cue(a, 0), c1 = cue(a, 1), c2 = cue(a, 2), c3 = cue(a, 3)
  const b = easeOut(prog(ls, 0, 900))
  const drift = (easeInOut(clamp01(ls / a.dur)) - 0.5) * 0.02 * W
  const u = tall ? W * 0.034 : Math.min(W * 0.034, H * 0.056)
  const oL: Iso = tall ? { ox: W * 0.66 - drift, oy: H * 0.12, u } : { ox: W * 0.27 - drift, oy: H * 0.27, u }
  const oR: Iso = tall ? { ox: W * 0.66 - drift, oy: H * 0.43, u } : { ox: W * 0.73 - drift, oy: H * 0.27, u }
  const cBase = Math.floor(YEARS[10].da ?? 0), cTo = Math.floor(YEARS[16].da ?? 0) // 2012 → 2018
  tray(ctx, a, oL, 'folder', cBase, cTo - cBase, c1 + 300, 170, b)
  tray(ctx, a, oR, 'coin', 28, 11, c3 + 300, 150, b)
  vignette(ctx, a, 0.7)
  // the two instruments' labels: identical type, identical weight
  const head = (o: Iso, kicker: string, name: string, years: string, al: number) => {
    if (tall) {
      const x = W * 0.05, y = o.oy + 10 * KF
      mono(ctx, a, kicker, x, y, 7.5, dim(a, 1), { alpha: al })
      text(ctx, name, x, y + 18 * KF, { size: 15 * KF, color: ink(a, 0.97), alpha: al })
      mono(ctx, a, years, x, y + 32 * KF, 7.5, dim(a, 1), { alpha: al })
    } else {
      const x = o.ox, y = H * 0.13
      mono(ctx, a, kicker, x, y, 10, dim(a, 1), { align: 'center', alpha: al })
      text(ctx, name, x, y + 30 * KF, { size: 26 * KF, color: ink(a, 0.97), align: 'center', alpha: al })
      mono(ctx, a, years, x, y + 48 * KF, 9.5, dim(a, 1), { align: 'center', alpha: al })
    }
  }
  head(oL, L(a, 'MEASURED BY COUNT', 'POR NÚMERO DE CONTRATOS'), 'Peña Nieto', '2012 → 2018', prog(ls, c0, 600))
  head(oR, L(a, 'MEASURED BY MONEY', 'MEDIDA EN DINERO'), 'López Obrador', '2018 → 2024', prog(ls, c2, 600))
  // the readings
  const fig = (o: Iso, big: string, sub: string, al: number) => {
    if (al <= 0) return
    if (tall) {
      const x = W * 0.05, y = o.oy + 72 * KF
      text(ctx, big, x, y, { size: 24 * KF, color: red(a, 0.97), alpha: al })
      mono(ctx, a, sub, x, y + 14 * KF, 7, red(a, 0.85), { alpha: al })
    } else {
      const bot = isoPt(o, 5.2, 5.2, 0), y = bot[1] + 30 * KF
      text(ctx, big, o.ox, y, { size: 30 * KF, color: red(a, 0.97), align: 'center', alpha: al })
      mono(ctx, a, sub, o.ox, y + 16 * KF, 9, red(a, 0.85), { align: 'center', alpha: al })
    }
  }
  fig(oL, L(a, '+9 points', '+9 puntos'), L(a, `NO-CONTEST SHARE · ${fmt(YEARS[10].da ?? 0, a, 1)}% → ${fmt(YEARS[16].da ?? 0, a, 1)}%`, `SIN CONCURSO · ${fmt(YEARS[10].da ?? 0, a, 1)}% → ${fmt(YEARS[16].da ?? 0, a, 1)}%`), prog(ls, c1 + 200, 500))
  fig(oR, L(a, '≈28 → ≈39', '≈28 → ≈39'), L(a, 'OF EVERY 100 PESOS · NO CONTEST', 'DE CADA 100 PESOS · SIN CONCURSO'), prog(ls, c3 + 200, 500))
  if (!tall) { const p = prog(ls, 200, 800); line(ctx, [W / 2, H * 0.14], [W / 2, H * 0.68], ink(a, 0.18 * p)) }
}

// ── 11 · SHEINBAUM — a crane takes the CompraNet sign down; a new law goes up in its frame ────
const sheinbaum: SceneFn = (ctx, a) => {
  const { ls, W, H, KF } = a, tall = isTall(a)
  const c0 = cue(a, 0), c1 = cue(a, 1)
  const u = tall ? W * 0.06 : Math.min(W * 0.046, H * 0.075)
  const o = cam(a, tall ? 0.5 : 0.46, tall ? 0.64 : 0.68, u, 0.05)
  const P = (x: number, y: number, z = 0) => isoPt(o, x, y, z)
  const b = easeOut(prog(ls, 0, 900))
  const HX = -4, HY = -1, HW = 5, HD = 2, HH = 1.4, SX = -3.6, SW = 4.2, SZ0 = 2.0, SZ1 = 2.85
  isoFloor(ctx, a, o, 13, 0.09 * b)
  pool(ctx, a, o, -1.2, 0.5, 6, 0.22 * b)
  // steps and hall
  for (let s = 0; s < 3; s++) solidBox(ctx, a, o, HX + 1.2, HY + HD + 0.9 - s * 0.3, 2.6, 0.3, 0.1 * (s + 1) * b, { lit: 0.6 })
  solidBox(ctx, a, o, HX, HY, HW, HD, HH * b, { lit: 0.7 })
  for (let i = 0; i < 8; i++) { const px = HX + 0.3 + i * 0.63; line(ctx, P(px, HY + HD, 0.05), P(px, HY + HD, HH * b * 0.85), ink(a, 0.42 * b), Math.max(1, KF)) }
  const door = P(HX + 2.5, HY + HD, 0)
  poly(ctx, [door, P(HX + 3.1, HY + HD, 0), P(HX + 3.1, HY + HD, 0.8), P(HX + 2.5, HY + HD, 0.8)], 'rgba(0,0,0,0.7)', ink(a, 0.5))
  // the sign frame on the roof
  line(ctx, P(SX + 0.2, HY + 1, HH), P(SX + 0.2, HY + 1, SZ1 + 0.1), ink(a, 0.7 * b), Math.max(1.2, 1.4 * KF))
  line(ctx, P(SX + SW - 0.2, HY + 1, HH), P(SX + SW - 0.2, HY + 1, SZ1 + 0.1), ink(a, 0.7 * b), Math.max(1.2, 1.4 * KF))
  // the crane
  const CX = 3.6, CY = 0, CT = 5.2
  solidBox(ctx, a, o, CX - 0.35, CY - 0.35, 0.7, 0.7, 0.3 * b, { lit: 0.6 })
  line(ctx, P(CX, CY, 0.3), P(CX, CY, CT * b), ink(a, 0.85), Math.max(1.5, 0.06 * u))
  line(ctx, P(CX + 0.12, CY, 0.3), P(CX + 0.12, CY, CT * b), ink(a, 0.4), 1)
  line(ctx, P(CX + 1.4, CY, CT * b), P(-2.4, CY, CT * b), ink(a, 0.85), Math.max(1.5, 0.05 * u))
  // timeline: the hook comes down, takes the sign, carries it off to the right; the law comes down
  const hook = easeInOut(prog(ls, c1 + 100, 700)), lift = easeInOut(prog(ls, c1 + 800, 900)), carry = easeInOut(prog(ls, c1 + 1700, 1400))
  const lawIn = easeOut(prog(ls, c1 + 2600, 1200))
  const tx = lerp(-1.5, 2.6, carry), sdx = tx - (-1.5), sdz = lift * 1.6
  const hookZ = lerp(CT - 0.4, SZ1 + 0.1, hook) + sdz
  line(ctx, P(tx, CY + 0, CT * b), P(tx, CY, ls > c1 ? hookZ : CT - 0.4), ink(a, 0.6), 1)
  const signAl = 1 - prog(ls, c1 + 3000, 600)
  // the old sign: red, it is what goes
  if (signAl > 0) {
    if (hook >= 1) { line(ctx, P(tx, CY, hookZ), P(SX + 0.3 + sdx, HY + 1, SZ1 + sdz), red(a, 0.6 * signAl)); line(ctx, P(tx, CY, hookZ), P(SX + SW - 0.3 + sdx, HY + 1, SZ1 + sdz), red(a, 0.6 * signAl)) }
    onFace(ctx, P(SX + sdx, HY + 1, SZ1 + sdz), 'x', () => {
      ctx.globalAlpha *= signAl * b
      ctx.fillStyle = red(a, 0.85); ctx.fillRect(0, 0, SW * u, (SZ1 - SZ0) * u)
      text(ctx, 'COMPRANET', (SW * u) / 2, ((SZ1 - SZ0) * u) / 2, { size: 0.42 * u, font: 'mono', weight: 700, color: a.pal.bg, align: 'center', baseline: 'middle', tracking: 0.06 * u })
    })
  }
  if (lawIn > 0) {
    const dz = (1 - lawIn) * 3
    line(ctx, P(SX + 0.4, HY + 1, SZ1 + dz), P(SX + 0.4, HY + 1, SZ1 + dz + 4), ink(a, 0.45), 1)
    line(ctx, P(SX + SW - 0.4, HY + 1, SZ1 + dz), P(SX + SW - 0.4, HY + 1, SZ1 + dz + 4), ink(a, 0.45), 1)
    onFace(ctx, P(SX, HY + 1, SZ1 + dz), 'x', () => {
      ctx.globalAlpha *= lawIn
      ctx.fillStyle = ink(a, 0.9); ctx.fillRect(0, 0, SW * u, (SZ1 - SZ0) * u)
      text(ctx, L(a, 'NEW PROCUREMENT LAW', 'NUEVA LEY DE ADQUISICIONES'), (SW * u) / 2, (SZ1 - SZ0) * u * 0.42, { size: 0.2 * u, font: 'mono', weight: 700, color: a.pal.bg, align: 'center', baseline: 'middle', tracking: 0.025 * u })
      text(ctx, L(a, 'APRIL 2025', 'ABRIL DE 2025'), (SW * u) / 2, (SZ1 - SZ0) * u * 0.74, { size: 0.15 * u, font: 'mono', weight: 600, color: a.pal.bg, align: 'center', baseline: 'middle', tracking: 0.02 * u })
    })
  }
  // a figure walks up the steps and in (October 2024)
  const wk = prog(ls, c0 + 400, 3600)
  if (wk > 0 && wk < 1) {
    const q: Pt = wk < 0.75 ? [lerp(HX + 2.8, HX + 2.8, wk), lerp(HY + HD + 3.2, HY + HD + 0.15, wk / 0.75)] : [HX + 2.8, HY + HD + 0.15]
    person(ctx, a, o, q[0], q[1], { al: 1 - prog(wk, 0.82, 0.18), h: 0.75, lift: 0.04 * Math.abs(Math.sin(ls * 0.012)) + (wk > 0.55 && wk < 0.75 ? (wk - 0.55) * 1.5 : wk >= 0.75 ? 0.3 : 0) })
  }
  vignette(ctx, a, 0.8)
  const p0 = prog(ls, c0 + 300, 500), p1 = prog(ls, c1 + 2800, 500)
  const l0: Line[] = [{ s: L(a, 'October 2024', 'Octubre de 2024'), size: tall ? 22 : 32, font: 'serif', color: ink(a, 0.97) }, { s: L(a, 'TAKES OFFICE', 'ASUME EL CARGO'), size: 9.5, color: dim(a, 1) }]
  const l1: Line[] = [{ s: L(a, 'April 2025', 'Abril de 2025'), size: tall ? 22 : 32, font: 'serif', color: ink(a, 0.97) }, { s: L(a, 'A NEW LAW REPLACES COMPRANET', 'UNA NUEVA LEY SUSTITUYE A COMPRANET'), size: tall ? 7.5 : 9.5, color: dim(a, 1) }]
  if (tall) {
    evCard(ctx, a, W / 2, H * 0.1 + bob(a, 1), l0, { al: p0 * (1 - prog(ls, c1 + 2500, 300)), align: 'center' })
    evCard(ctx, a, W / 2, H * 0.1 + bob(a, 2), l1, { al: p1, align: 'center' })
  } else {
    evCard(ctx, a, W * 0.05, H * 0.13 + bob(a, 1), l0, { al: p0 })
    evCard(ctx, a, W * 0.05, H * 0.31 + bob(a, 2), l1, { al: p1 })
  }
}

// ── 12 · SEPTEMBER 28 — the press that printed the record stops; the buying goes on in envelopes
const blank: SceneFn = (ctx, a) => {
  const { ls, W, H, KF } = a, tall = isTall(a)
  const c0 = cue(a, 0), c1 = cue(a, 1), c2 = cue(a, 2)
  const u = tall ? W * 0.06 : Math.min(W * 0.046, H * 0.075)
  const o = cam(a, tall ? 0.52 : 0.48, tall ? 0.42 : 0.5, u, 0.05)
  const P = (x: number, y: number, z = 0) => isoPt(o, x, y, z)
  const b = easeOut(prog(ls, 0, 900))
  const tStop = c0 + 0.8 * (c1 - c0), stopped = ls >= tStop
  const pressOn = 1 - prog(ls, tStop, 500)
  isoFloor(ctx, a, o, 13, 0.08 * b)
  pool(ctx, a, o, -2, 0.6, 4.6, (0.06 + 0.16 * pressOn) * b)
  pool(ctx, a, o, 3.2, 0.4, 3.8, 0.16 * b)
  // the table and the paper ribbon
  solidBox(ctx, a, o, -3.8, -1.0, 3.6, 3.8, 0.6 * b, { lit: 0.45 })
  const ROW = 0.42, speed = 0.00035, s = Math.min(ls, tStop) * speed
  const nFinal = Math.floor(tStop * speed / ROW)
  onTop(ctx, P(-2.9, -1.0, 0.6), () => {
    const pw = 1.8 * u, ph = 3.75 * u
    ctx.fillStyle = ink(a, 0.82 * b); ctx.fillRect(0, 0, pw, ph)
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, pw, ph); ctx.clip()
    const off = (s % ROW) * u, newest = Math.floor(s / ROW)
    for (let k = 0; k < 10; k++) {
      const y = (k + 0.4) * ROW * u + (stopped ? 0 : off)
      const day = 28 - (nFinal - newest) - k
      if (day < 1) continue
      const fs = 0.13 * u
      text(ctx, `2025-09-${String(day).padStart(2, '0')}`, 0.1 * u, y + fs, { size: fs, font: 'mono', weight: 600, color: a.pal.bg, tracking: 0.01 * u })
      ctx.fillStyle = 'rgba(0,0,0,0.55)'
      ctx.fillRect(1.22 * u, y + fs * 0.25, (0.2 + 0.3 * rnd(day)) * u, fs * 0.7)
    }
    // the end of the file
    const ep = prog(ls, tStop + 200, 500)
    if (ep > 0) {
      ctx.fillStyle = red(a, 0.95 * ep); ctx.fillRect(0, 0.05 * u, pw * easeOut(ep), 0.05 * u)
      text(ctx, L(a, 'END OF FILE', 'FIN DEL ARCHIVO'), pw / 2, 0.3 * u, { size: 0.13 * u, font: 'mono', weight: 700, color: red(a, 0.95), align: 'center', tracking: 0.02 * u, alpha: ep })
    }
    ctx.restore()
  })
  // the press
  solidBox(ctx, a, o, -3.6, -2.7, 3.2, 1.6, 1.4 * b, { lit: lerp(0.4, 0.8, pressOn) })
  const lampPt = P(-2.0, -1.9, 1.4 * b + 0.25)
  isoBox(ctx, a, o, -2.2, -2.1, 0.4, 0.4, 0.22, { z: 1.4 * b, lit: 0.4 + 0.6 * pressOn })
  if (pressOn > 0) glow(ctx, lampPt[0], lampPt[1], 26 * KF, ink(a, 0.35 * pressOn * (0.8 + 0.2 * Math.sin(ls * 0.02))), ink(a, 0))
  // the conveyor: envelopes keep coming
  solidBox(ctx, a, o, 0.6, 0.1, 4.4, 0.7, 0.32 * b, { lit: 0.5 })
  solidBox(ctx, a, o, 5.2, -0.4, 1.4, 1.6, 0.9 * b, { lit: 0.55 })
  const NE = 8
  for (let k = NE - 1; k >= 0; k--) {
    const t = (ls * 0.00016 + k / NE) % 1, x = lerp(0.7, 5.3, t), drop = t > 0.92 ? (t - 0.92) / 0.08 : 0
    solidBox(ctx, a, o, x, 0.22, 0.55, 0.42, 0.06, { z: 0.32 * b + 0.04 - drop * 0.6, lit: 1, alpha: b * Math.min(1, t * 8) * (1 - drop) })
  }
  vignette(ctx, a, 0.82)
  // cards
  const p0 = prog(ls, tStop + 400, 500), p1 = prog(ls, c1 + 300, 500), p2 = prog(ls, c2 + 300, 600)
  const l0: Line[] = [{ s: L(a, 'September 28, 2025', '28 de septiembre de 2025'), size: tall ? 20 : 28, font: 'serif', color: ink(a, 0.97) }, { s: L(a, 'THE FEDERAL FILE STOPS', 'EL ARCHIVO FEDERAL SE DETIENE'), size: 9.5, color: red(a, 0.9) }]
  const beltPt = P(3.6, 0.45, 0.45)
  const paperPt = P(-2.0, 0.0, 0.62)
  if (tall) {
    evCard(ctx, a, W / 2, H * 0.62 + bob(a, 1), l0, { al: p0 * (1 - prog(ls, c2, 300)), align: 'center' })
  } else {
    const r0 = evCard(ctx, a, W * 0.05, H * 0.12 + bob(a, 1), l0, { al: p0 })
    leader(ctx, a, paperPt, edge(r0, paperPt), p0, true)
    { const bp = P(0.8, 0.1, 0.4); mono(ctx, a, L(a, 'THE BUYING GOES ON', 'LAS COMPRAS SIGUEN'), bp[0], bp[1] - 26 * KF, 9.5, ink(a, 0.85), { align: 'center', alpha: p1 }) }
  }
  // a scanned letter: who won and for how much, as an image, not as data
  if (p2 > 0) {
    const cw = (tall ? 150 : 210) * KF, chh = (tall ? 140 : 180) * KF
    const cx = tall ? W / 2 - cw / 2 : W * 0.95 - cw, cy = (tall ? H * 0.13 : H * 0.14) + bob(a, 2)
    ctx.save(); ctx.globalAlpha *= p2
    ctx.translate(cx + cw / 2, cy + chh / 2); ctx.rotate(-0.025); ctx.translate(-cw / 2, -chh / 2)
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(5 * KF, 7 * KF, cw, chh)
    ctx.fillStyle = dim(a, 0.95); ctx.fillRect(0, 0, cw, chh)
    // scanner grain
    ctx.fillStyle = 'rgba(0,0,0,0.18)'
    for (let g = 0; g < 160; g++) ctx.fillRect(rnd(g * 3) * cw, rnd(g * 7 + 1) * chh, 1.5 * KF, 1.5 * KF)
    const pad = 12 * KF
    mono(ctx, a, L(a, 'SCANNED · PDF', 'ESCANEADO · PDF'), pad, pad + 6 * KF, 8.5, 'rgba(0,0,0,0.75)')
    for (let r = 0; r < 3; r++) { ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(pad, pad + (18 + r * 9) * KF, (cw - pad * 2) * (0.6 + 0.4 * rnd(r + 5)), 3 * KF) }
    const fld = (label: string, y: number) => {
      mono(ctx, a, label, pad, y, 9, 'rgba(0,0,0,0.85)', { weight: 700 })
      ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = Math.max(1, 1.3 * KF); ctx.beginPath()
      for (let x = 0; x <= cw - pad * 2; x += 2) { const yy = y + 12 * KF + Math.sin(x * 0.21 + y) * 2.2 * KF + Math.sin(x * 0.07) * 1.5 * KF; if (x === 0) ctx.moveTo(pad + x, yy); else ctx.lineTo(pad + x, yy) }
      ctx.stroke()
    }
    fld(L(a, 'WHO WON', 'QUIÉN GANÓ'), pad + 62 * KF)
    fld(L(a, 'FOR HOW MUCH', 'POR CUÁNTO'), pad + 102 * KF)
    ctx.restore()
    if (!tall) leader(ctx, a, beltPt, [cx, cy + chh * 0.6], p2)
  }
}

// ── 13 · THE END — the avenue at night: five name plates turn blank; the cord holds ───────────
const end: SceneFn = (ctx, a) => {
  const { ls, W, H, KF } = a, tall = isTall(a)
  const c0 = cue(a, 0), c1 = cue(a, 1), c2 = cue(a, 2), c3 = cue(a, 3), c4 = cue(a, 4)
  const base = avenueCam(a, 0.02), HM = base.HM, MZ = HM * 1.6
  const zoom = lerp(1, 1.45, easeInOut(prog(ls, c4, Math.max(1200, a.dur - c4))))
  const T = isoPt(base.o, avXY(21)[0], avXY(21)[1], PL + tH(21, HM) * 0.6)
  const o: Iso = { ox: T[0] - (T[0] - base.o.ox) * zoom, oy: T[1] - (T[1] - base.o.oy) * zoom, u: base.o.u * zoom }
  const night = prog(ls, c4, 900)
  avenueBase(ctx, a, o, 1, 1 - 0.5 * night)
  for (let e = 0; e < 5; e++) eraPlinth(ctx, a, o, e, 1 - night)
  for (let i = 0; i < YEARS.length; i++) tower(ctx, a, o, i, tH(i, HM), { on: lerp(0.45, 0.04, night), lit: lerp(0.8, 0.5, night) })
  // one window stays lit: the other films go in close
  if (night > 0) {
    const [x, y] = avXY(21), q = isoPt(o, x + TW / 2, y, PL + tH(21, HM) * 0.55)
    glow(ctx, q[0], q[1], 30 * KF * zoom, ink(a, 0.45 * night), ink(a, 0))
    ctx.fillStyle = ink(a, 0.95 * night); ctx.fillRect(q[0] - 2.5 * KF * zoom, q[1] - 3 * KF * zoom, 5 * KF * zoom, 6 * KF * zoom)
  }
  // the cord, from the line shot: the way of buying that barely moved
  const cp = prog(ls, c3, 1400)
  if (cp > 0) {
    const pts: Pt[] = []
    for (let i = 9; i < 23; i++) { const [x, y] = avXY(i); const zt = PL + (daOf(i) / 100) * MZ; line(ctx, isoPt(o, x, y, PL + tH(i, HM)), isoPt(o, x, y, PL + tH(i, HM) + (zt - PL - tH(i, HM)) * easeOut(cp)), ink(a, 0.4), 1); pts.push(isoPt(o, x, y, zt)) }
    partial(ctx, pts, 13 * easeInOut(prog(ls, c3 + 300, 1100)), red(a, 0.9 * (1 - 0.4 * night)), Math.max(2, 2 * KF))
  }
  vignette(ctx, a, 0.75 + 0.15 * night)
  // name plates under each era: they light, group, then turn over to blank
  const groups: [number, number][] = [[0, 1], [2, 2], [3, 4]]
  const plate: Rect[] = []
  for (let e = 0; e < 5; e++) {
    const q0 = eraAnchor(o, e), name = TERMS[e].name, fs = (tall ? 7 : 10) * KF
    const w = measure(ctx, name, fs, 'mono') + 14 * KF, h = 20 * KF
    const q: Pt = [Math.max(w / 2 + 4 * KF, Math.min(W - w / 2 - 4 * KF, q0[0])), q0[1]]
    const y = q[1] + (14 + (tall && e % 2 ? 24 : 0)) * KF
    plate.push({ x: q[0] - w / 2, y, w, h })
    const pa = prog(ls, c0 + e * 160, 400) * (1 - night)
    if (pa <= 0) continue
    const ph = Math.PI * easeInOut(prog(ls, c2 + e * 160, 700)), sy = Math.abs(Math.cos(ph))
    ctx.save(); ctx.globalAlpha *= pa; ctx.translate(q[0], y + h / 2); ctx.scale(1, Math.max(0.02, sy))
    ctx.fillStyle = a.pal.bg; ctx.fillRect(-w / 2, -h / 2, w, h)
    ctx.strokeStyle = ink(a, 0.6); ctx.lineWidth = 1; ctx.strokeRect(-w / 2, -h / 2, w, h)
    if (ph < Math.PI / 2) text(ctx, name, 0, 1, { size: fs, font: 'mono', color: ink(a, 0.95), align: 'center', baseline: 'middle', tracking: fs * 0.12 })
    else { ctx.setLineDash([3, 3]); ctx.strokeStyle = dim(a, 0.8); ctx.beginPath(); ctx.moveTo(-w / 2 + 7 * KF, 0); ctx.lineTo(w / 2 - 7 * KF, 0); ctx.stroke() }
    ctx.restore()
  }
  // three groups — the parties, unnamed
  groups.forEach(([g0, g1], k) => {
    const p = prog(ls, c1 + k * 200, 500) * (1 - night)
    if (p <= 0) return
    const x0 = plate[g0].x, x1 = plate[g1].x + plate[g1].w, y = Math.max(plate[g0].y, plate[g1].y) + plate[g0].h + 7 * KF
    ctx.strokeStyle = ink(a, 0.55 * p); ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(x0, y - 4 * KF); ctx.lineTo(x0, y); ctx.lineTo(lerp(x0, x1, easeOut(p)), y); if (p > 0.95) ctx.lineTo(x1, y - 4 * KF); ctx.stroke()
  })
  const p0 = prog(ls, c0 + 200, 500), p1 = prog(ls, c1 + 200, 500), fade = 1 - prog(ls, c3, 500)
  const big = tall ? 30 : 46
  const l0: Line[] = [{ s: '5', size: big, font: 'serif', color: ink(a, 0.97) }, { s: L(a, 'GOVERNMENTS', 'GOBIERNOS'), size: 9.5, color: dim(a, 1) }]
  const l1: Line[] = [{ s: '3', size: big, font: 'serif', color: ink(a, 0.97) }, { s: L(a, 'PARTIES', 'PARTIDOS'), size: 9.5, color: dim(a, 1) }]
  if (tall) {
    evCard(ctx, a, W * 0.3, H * 0.1 + bob(a, 1), l0, { al: p0 * fade, align: 'center' })
    evCard(ctx, a, W * 0.7, H * 0.1 + bob(a, 2), l1, { al: p1 * fade, align: 'center' })
  } else {
    evCard(ctx, a, W * 0.05, H * 0.12 + bob(a, 1), l0, { al: p0 * fade })
    evCard(ctx, a, W * 0.95, H * 0.12 + bob(a, 2), l1, { al: p1 * fade, align: 'right' })
  }
  const pc = prog(ls, c3 + 900, 600) * (1 - night)
  if (pc > 0) text(ctx, L(a, 'the way of buying, barely changed', 'la forma de comprar, casi igual'), W / 2, H * 0.14, { size: (tall ? 16 : 26) * KF, color: ink(a, 0.95), align: 'center', alpha: pc })
}

export const scenes: Record<string, SceneFn> = { open, fox, calderon, boom, paper, reorg, army, medicine, covid, line: theLine, value, sheinbaum, blank, end }
