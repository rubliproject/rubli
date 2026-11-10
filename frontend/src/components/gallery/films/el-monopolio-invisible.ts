/**
 * «El Relevo / The Relay» — four pharmaceutical distributors, one buyer, one seat at the head of
 * the line, told as miniature dioramas under one hanging lamp (the Fern direction). The world is
 * a medicine warehouse: depots with roll-up doors, pallets of cartons whose height is money, a
 * conveyor out of IMSS, tender tables, the gantry signs of the buying systems. One draw function
 * per shot, keyed by the beat's `scene` in story-films.json; see filmKit.ts for the contract.
 *
 * Names: only Grupo Fármacos and Maypo are named on screen. The other two firms in filmData are
 * drawn as «Distributor C» (the BIG4 'pisa' row) and «Distributor D» (the 'dimesa' row).
 * Red = the one thing each sentence is about (the tower, the leader's baton, the fall, the seat).
 */
import { BIG4, BIG4_SHARED } from '@/components/gallery/filmData'
import {
  type Iso, type Pt, type SceneArgs, type SceneFn, L, clamp01, count, cue, dim, easeIn, easeInOut, easeOut,
  figure, ink, isoBox, isoFloor, isoPt, lamp, lerp, pool, prog, red, text, trace,
} from '@/components/gallery/filmKit'

type C = CanvasRenderingContext2D
const TAU = Math.PI * 2
const isTall = (a: SceneArgs) => a.H > a.W * 0.9
const SERIF = '"Playfair Display", Georgia, serif'
const MONO = '"JetBrains Mono", ui-monospace, monospace'

// ── the four ────────────────────────────────────────────────────────────────────────────────
const GF = 0, MAYPO = 1, DC = 2, DD = 3 // indexes into BIG4 (DC = 'pisa' row, DD = 'dimesa' row)
/** the on-screen name. C and D are never printed by their real names. */
function nameOf(a: SceneArgs, i: number) {
  if (i === GF) return 'GRUPO FÁRMACOS'
  if (i === MAYPO) return 'MAYPO'
  return i === DC ? L(a, 'DISTRIBUTOR C', 'DISTRIBUIDORA C') : L(a, 'DISTRIBUTOR D', 'DISTRIBUIDORA D')
}
function shortOf(a: SceneArgs, i: number) {
  if (i === GF) return 'G. FÁRMACOS'
  if (i === MAYPO) return 'MAYPO'
  return L(a, 'DIST. ', 'DIST. ') + (i === DC ? 'C' : 'D')
}
const val = (i: number, yr: number) => BIG4[i].values[yr - 2003] as number
const keyIdx = (k: string) => BIG4.findIndex((b) => b.key === k)
/** a billions figure as the narration says it: "19.9" + BILLION PESOS / "19,900" + MILLONES DE PESOS. */
function bn(a: SceneArgs, v: number, d = 1): [string, string] {
  if (a.lang === 'es') return v >= 100 ? [`${Math.round(v)} mil`, 'MILLONES DE PESOS'] : [Math.round(v * 1000).toLocaleString('es-MX'), 'MILLONES DE PESOS']
  return [v.toFixed(d), 'BILLION PESOS']
}

// ── small kit extensions ────────────────────────────────────────────────────────────────────
function poly(ctx: C, pts: Pt[], fill?: string, stroke?: string, lw = 1) {
  ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath()
  if (fill) { ctx.fillStyle = fill; ctx.fill() }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke() }
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
  const g = ctx.createRadialGradient(a.W * 0.5, a.H * 0.42, Math.min(a.W, a.H) * 0.3, a.W * 0.5, a.H * 0.42, Math.max(a.W, a.H) * 0.78)
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${k})`)
  ctx.fillStyle = g; ctx.fillRect(0, 0, a.W, a.H)
}
/** slow camera: the world origin pans across the shot. */
function cam(a: SceneArgs, cx: number, cy: number, u: number, panX: number, panY = 0): Iso {
  const t = easeInOut(clamp01(a.ls / a.dur)) - 0.5
  return { ox: a.W * cx - t * panX * a.W, oy: a.H * cy - t * panY * a.H, u }
}
const bob = (a: SceneArgs, seed: number) => Math.sin(a.ls * 0.0013 + seed * 1.9) * 2.4 * a.KF

interface Line { s: string; size: number; font?: 'serif' | 'mono'; color: string; weight?: number }
interface Rect { x: number; y: number; w: number; h: number }
/** a floating evidence card. (x, y) is the top-left (left), top-right (right) or top-centre (center). */
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
function leader(ctx: C, a: SceneArgs, from: Pt, to: Pt, p: number, accent = false) {
  if (p <= 0) return
  trace(ctx, [from, to], easeOut(p), { color: accent ? red(a, 0.75) : ink(a, 0.5), width: Math.max(1, a.KF) })
  ctx.fillStyle = accent ? red(a, 0.95) : ink(a, 0.9)
  ctx.beginPath(); ctx.arc(from[0], from[1], 2.6 * a.KF, 0, TAU); ctx.fill()
}
/** an opaque isoBox (silhouette filled with the ground first, so stacks don't read as glass). */
function solidBox(ctx: C, a: SceneArgs, o: Iso, x: number, y: number, w: number, d: number, h: number, s: { alpha?: number; accent?: boolean; z?: number; lit?: number } = {}) {
  const al = s.alpha ?? 1, z = s.z ?? 0
  if (al <= 0.01 || h <= 0) return
  const P = (px: number, py: number, pz: number) => isoPt(o, px, py, pz)
  ctx.save(); ctx.globalAlpha *= al
  poly(ctx, [P(x, y, z + h), P(x + w, y, z + h), P(x + w, y, z), P(x + w, y + d, z), P(x, y + d, z), P(x, y + d, z + h)], a.pal.bg)
  ctx.restore()
  isoBox(ctx, a, o, x, y, w, d, h, s)
}
/** the edges of a box as a dashed wire — where something used to be. */
function wireBox(ctx: C, a: SceneArgs, o: Iso, x: number, y: number, w: number, d: number, h: number, col: string, p = 1) {
  if (p <= 0) return
  const P = (px: number, py: number, pz: number) => isoPt(o, px, py, pz)
  const e: [Pt, Pt][] = [
    [P(x, y + d, 0), P(x, y + d, h)], [P(x + w, y + d, 0), P(x + w, y + d, h)], [P(x + w, y, 0), P(x + w, y, h)],
    [P(x, y, h), P(x + w, y, h)], [P(x + w, y, h), P(x + w, y + d, h)], [P(x + w, y + d, h), P(x, y + d, h)], [P(x, y + d, h), P(x, y, h)],
  ]
  ctx.save(); ctx.globalAlpha *= clamp01(p); ctx.strokeStyle = col; ctx.lineWidth = Math.max(1, a.KF); ctx.setLineDash([4 * a.KF, 4 * a.KF])
  ctx.beginPath(); for (const [p0, p1] of e) { ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]) } ctx.stroke(); ctx.restore()
}
/** a miniature person with a contact shadow. */
function man(ctx: C, a: SceneArgs, o: Iso, x: number, y: number, s: { al?: number; accent?: boolean; lift?: number; h?: number } = {}) {
  const al = s.al ?? 1
  if (al <= 0.01) return
  const f = isoPt(o, x, y), hh = (s.h ?? 0.9) * o.u, w = hh * 0.3
  ctx.fillStyle = `rgba(0,0,0,${0.55 * al})`; ctx.beginPath(); ctx.ellipse(f[0], f[1], w * 0.9, w * 0.38, 0, 0, TAU); ctx.fill()
  ctx.save(); ctx.translate(0, -(s.lift ?? 0) * o.u)
  figure(ctx, a, o, x, y, { alpha: al, accent: s.accent, h: s.h })
  ctx.restore()
}

/** a stack of medicine cartons on a pallet: one box with a seam every `layer` of height and a
 *  split down each face. `sink` lowers it into the floor (the part below z = 0 is not drawn). */
function crates(ctx: C, a: SceneArgs, o: Iso, x: number, y: number, w: number, d: number, h: number,
  s: { layer?: number; alpha?: number; accent?: boolean; lit?: number; sink?: number; pallet?: boolean; z?: number } = {}) {
  const al = s.alpha ?? 1, layer = s.layer ?? 0.2, sink = s.sink ?? 0, P = (px: number, py: number, pz: number) => isoPt(o, px, py, pz)
  if (al <= 0.01) return
  if (s.pallet !== false) isoBox(ctx, a, o, x - 0.06, y - 0.06, w + 0.12, d + 0.12, 0.08, { alpha: al * 0.8, lit: 0.45, z: s.z })
  const z0 = (s.z ?? 0) + (s.pallet !== false ? 0.08 : 0), vis = h - sink
  if (vis <= 0.004) return
  solidBox(ctx, a, o, x, y, w, d, vis, { alpha: al, accent: s.accent, lit: s.lit ?? 0.8, z: z0 })
  ctx.save(); ctx.globalAlpha *= al
  ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = Math.max(1, a.KF * 0.9)
  ctx.beginPath()
  for (let k = 1; k < 80; k++) {
    const zz = k * layer - sink
    if (zz >= vis - 0.02) break
    if (zz <= 0.02) continue
    const p0 = P(x, y + d, z0 + zz), p1 = P(x + w, y + d, z0 + zz), p2 = P(x + w, y, z0 + zz)
    ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1])
  }
  let q0 = P(x + w / 2, y + d, z0), q1 = P(x + w / 2, y + d, z0 + vis); ctx.moveTo(q0[0], q0[1]); ctx.lineTo(q1[0], q1[1])
  q0 = P(x + w, y + d / 2, z0); q1 = P(x + w, y + d / 2, z0 + vis); ctx.moveTo(q0[0], q0[1]); ctx.lineTo(q1[0], q1[1])
  ctx.stroke(); ctx.restore()
}
/** a depot: a low warehouse block with a roll-up door on its front-left face. door 0 shut → 1 open. */
function depot(ctx: C, a: SceneArgs, o: Iso, x: number, y: number, w: number, d: number, h: number, s: { alpha?: number; door?: number; lit?: number } = {}) {
  const al = s.alpha ?? 1
  if (al <= 0.01 || h <= 0.01) return
  const P = (px: number, py: number, pz: number) => isoPt(o, px, py, pz)
  solidBox(ctx, a, o, x, y, w, d, h, { alpha: al, lit: s.lit ?? 0.55 })
  isoBox(ctx, a, o, x, y, w, d, 0.06, { z: h, alpha: al, lit: 0.9 }) // roof parapet line
  const dx0 = x + w * 0.22, dx1 = x + w * 0.78, dh = h * 0.68, yy = y + d, op = clamp01(s.door ?? 0)
  poly(ctx, [P(dx0, yy, 0), P(dx1, yy, 0), P(dx1, yy, dh), P(dx0, yy, dh)], `rgba(0,0,0,${0.8 * al})`)
  if (op > 0) { // light from inside spills onto the floor
    poly(ctx, [P(dx0, yy, 0), P(dx1, yy, 0), P(dx1, yy, dh * op * 0.95), P(dx0, yy, dh * op * 0.95)], ink(a, 0.16 * al * op))
    poly(ctx, [P(dx0, yy, 0), P(dx1, yy, 0), P(dx1 + 0.2, yy + 1.3 * op, 0), P(dx0 - 0.2, yy + 1.3 * op, 0)], ink(a, 0.07 * al * op))
  }
  const z0 = dh * op
  if (z0 < dh - 0.01) {
    poly(ctx, [P(dx0, yy, z0), P(dx1, yy, z0), P(dx1, yy, dh), P(dx0, yy, dh)], ink(a, 0.24 * al), ink(a, 0.4 * al))
    ctx.strokeStyle = `rgba(0,0,0,${0.45 * al})`; ctx.lineWidth = 1; ctx.beginPath()
    for (let zz = dh - 0.09; zz > z0; zz -= 0.09) { const p0 = P(dx0, yy, zz), p1 = P(dx1, yy, zz); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]) }
    ctx.stroke()
  }
}
/** the hanging lamp: cord from the dark above, a shade, a soft cone to the floor. */
function hangLamp(ctx: C, a: SceneArgs, o: Iso, x: number, y: number, z: number, spread: number, al: number, sway = 0) {
  if (al <= 0.01) return
  const p0 = isoPt(o, x, y, z), f = isoPt(o, x, y, 0), sx = sway * o.u, p: Pt = [p0[0] + sx, p0[1]]
  ctx.strokeStyle = dim(a, 0.45 * al); ctx.lineWidth = Math.max(1, a.KF)
  ctx.beginPath(); ctx.moveTo(p0[0], -10); ctx.lineTo(p[0], p[1] - o.u * 0.2); ctx.stroke()
  lamp(ctx, a, p[0], p[1], f[1], spread * o.u, 0.11 * al)
  const sw = o.u * 0.5
  poly(ctx, [[p[0] - sw * 0.25, p[1] - o.u * 0.22], [p[0] + sw * 0.25, p[1] - o.u * 0.22], [p[0] + sw * 0.55, p[1]], [p[0] - sw * 0.55, p[1]]], ink(a, 0.7 * al))
  glow(ctx, p[0], p[1] + 2, o.u * 0.5, ink(a, 0.5 * al), ink(a, 0))
}
/** the baton: a red bar resting on (x, y, z), turning slowly. */
function baton(ctx: C, a: SceneArgs, o: Iso, x: number, y: number, z: number, al: number) {
  if (al <= 0.01) return
  const c = isoPt(o, x, y, z), ang = Math.sin(a.ls * 0.0011) * 0.25 - 0.45, len = o.u * 0.55, th = Math.max(3, o.u * 0.13)
  glow(ctx, c[0], c[1], o.u * 0.9, red(a, 0.35 * al), red(a, 0))
  ctx.save(); ctx.translate(c[0], c[1] - th * 0.6); ctx.rotate(ang); ctx.globalAlpha *= al
  ctx.fillStyle = red(a, 0.95); ctx.beginPath(); ctx.roundRect(-len / 2, -th / 2, len, th, th / 2); ctx.fill()
  ctx.fillStyle = ink(a, 0.35); ctx.fillRect(-len * 0.12, -th / 2, len * 0.08, th)
  ctx.restore()
}
/** lane paint along x on the warehouse floor. */
function lanePaint(ctx: C, a: SceneArgs, o: Iso, x0: number, x1: number, ys: number[], al: number) {
  if (al <= 0.01) return
  for (const y of ys) trace(ctx, [isoPt(o, x0, y), isoPt(o, x1, y)], 1, { color: ink(a, 0.16 * al), width: Math.max(1, a.KF), dash: [8 * a.KF, 7 * a.KF] })
}
/** a label printed under/over a world point, in screen space. */
function tagAt(ctx: C, a: SceneArgs, p: Pt, s: string, size: number, color: string, al = 1, dy = 0) {
  mono(ctx, a, s, p[0], p[1] + dy * a.KF, size, color, { align: 'center', alpha: al })
}

// ── 0 · PEAK — 2017: one tower of cartons rising under the lamp ───────────────────────────────
const peak: SceneFn = (ctx, a) => {
  const { ls, W, H, KF } = a, tall = isTall(a), c1 = cue(a, 1)
  const u = tall ? Math.min(W * 0.1, H * 0.082) : Math.min(W * 0.05, H * 0.08)
  const o = cam(a, tall ? 0.6 : 0.6, tall ? 0.7 : 0.69, u, 0.05)
  const b = easeOut(prog(ls, 0, 1500))
  isoFloor(ctx, a, o, 10, 0.1 * b)
  pool(ctx, a, o, 0, 0, 3.4, 0.24 * b)
  depot(ctx, a, o, -2.6, -4.8, 4.4, 1.8, 1.5 * b, { alpha: b, door: 0.8 * easeOut(prog(ls, 600, 1400)), lit: 0.42 })
  lanePaint(ctx, a, o, -6, 6, [1.6, 2.4], b)
  for (const [px, py] of [[2.2, -1.6], [-2.6, 1.0], [2.6, 1.6]] as const) isoBox(ctx, a, o, px, py, 1.3, 1.3, 0.08, { alpha: 0.6 * b, lit: 0.45 })
  // the tower: one layer of cartons per billion pesos, dropped in on the voice
  const LAYER = 0.24, N = val(GF, 2017), full = Math.floor(N), frac = N - full
  const figT = c1 + (a.dur - c1) * 0.5, span = Math.max(1400, figT - c1 - 500)
  isoBox(ctx, a, o, -0.76, -0.76, 1.52, 1.52, 0.08, { alpha: b, lit: 0.45 })
  for (let j = 0; j <= full; j++) {
    const lh = j < full ? LAYER : LAYER * frac
    const p = prog(ls, c1 + 150 + (j / (full + 1)) * span, 420)
    if (p <= 0) break
    const zRest = 0.08 + j * LAYER, zz = zRest + (1 - easeIn(p)) * 3.2
    solidBox(ctx, a, o, -0.7, -0.7, 1.4, 1.4, lh, { z: zz, alpha: Math.min(1, p * 3), lit: 0.82 })
    const q0 = isoPt(o, 0, 0.7, zz), q1 = isoPt(o, 0, 0.7, zz + lh)
    ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(q0[0], q0[1]); ctx.lineTo(q1[0], q1[1]); ctx.stroke()
  }
  man(ctx, a, o, 1.3, 0.9, { al: b })
  man(ctx, a, o, 1.75, 0.6, { al: b * 0.8, h: 0.85 })
  hangLamp(ctx, a, o, 0, 0, 6.5, 2.4, b, Math.sin(ls * 0.0009) * 0.06)
  vignette(ctx, a, 0.82)
  // the measuring line and the figure, on the voice
  const m = prog(ls, figT - 250, 700)
  if (m > 0) {
    const base = isoPt(o, 0.95, -0.7, 0.08), top = isoPt(o, 0.95, -0.7, 0.08 + N * LAYER), off = 18 * KF
    const b0: Pt = [base[0] + off, base[1]], t0: Pt = [top[0] + off, top[1]]
    trace(ctx, [b0, t0], easeOut(m), { color: red(a, 0.9), width: Math.max(1.5, 1.6 * KF) })
    ctx.strokeStyle = red(a, 0.9 * m); ctx.lineWidth = Math.max(1, KF)
    ctx.beginPath(); ctx.moveTo(b0[0] - 6 * KF, b0[1]); ctx.lineTo(b0[0] + 6 * KF, b0[1]); ctx.moveTo(t0[0] - 6 * KF, t0[1]); ctx.lineTo(t0[0] + 6 * KF, t0[1]); ctx.stroke()
    const [num, unit] = bn(a, 19.9)
    const al = prog(ls, figT, 450)
    const cx = tall ? W * 0.04 : W * 0.07, cy = tall ? H * 0.11 : H * 0.2
    const r = evCard(ctx, a, cx, cy + bob(a, 1), [
      { s: L(a, '2017 · ONE DISTRIBUTOR', '2017 · UNA DISTRIBUIDORA'), size: 10.5, color: dim(a, 0.95) },
      { s: num, size: tall ? 42 : 76, font: 'serif', color: red(a, 0.97) },
      { s: unit, size: 10.5, color: ink(a, 0.85) },
      { s: L(a, 'IN A SINGLE YEAR', 'EN UN SOLO AÑO'), size: 10.5, color: ink(a, 0.6) },
    ], { al, accent: true, pad: 16 })
    leader(ctx, a, t0, [r.x + r.w, r.y + r.h * 0.5], al, true)
  }
}

// ── 1 · FOUR — four depots along the track; two named, two lettered; 326 billion between them ──
const four: SceneFn = (ctx, a) => {
  const { ls, W, H, KF } = a, tall = isTall(a), c1 = cue(a, 1), c2 = cue(a, 2), c3 = cue(a, 3)
  const u = tall ? W * 0.072 : Math.min(W * 0.058, H * 0.1)
  const o = cam(a, 0.5, tall ? 0.6 : 0.63, u, 0.04)
  const S = 2.4
  const b = easeOut(prog(ls, 0, 1200))
  isoFloor(ctx, a, o, 12, 0.09 * b)
  lanePaint(ctx, a, o, -9, 9, [2.8], b)
  const totals = [0, 1, 2, 3].map((i) => BIG4[i].totalB)
  const figT = c3 + (a.dur - c3) * 0.42
  const centres: Pt[] = [0, 1, 2, 3].map((k) => [S * (k - 1.5), -S * (k - 1.5)])
  for (let k = 0; k < 4; k++) pool(ctx, a, o, centres[k][0], centres[k][1] - 0.3, 2.2, (k === 0 ? 0.2 : 0.2 * prog(ls, c1 + k * 220, 600)) * b)
  // the red strap that ties the four stacks, on the total
  const strap = prog(ls, figT - 300, 900)
  if (strap > 0) {
    const pts: Pt[] = centres.map(([x, y]) => isoPt(o, x + 0.55, y + 1.3))
    trace(ctx, pts, easeOut(strap), { color: red(a, 0.8), width: Math.max(2, 2.2 * KF) })
  }
  const tops: Pt[] = []
  for (let k = 0; k < 4; k++) {
    const [cx, cy] = centres[k]
    const app = k === 0 ? b : easeOut(prog(ls, c1 + k * 220, 700))
    depot(ctx, a, o, cx - 0.85, cy - 1.95, 1.7, 1.25, 1.15 * app, { alpha: app, door: k === 0 ? 0.8 : 0.8 * prog(ls, c1 + 500 + k * 200, 900), lit: 0.5 })
    const h = (totals[k] / 10) * 0.22 * easeOut(prog(ls, c3 + 200 + k * 260, 900))
    crates(ctx, a, o, cx - 0.55, cy + 0.15, 1.1, 1.1, h, { layer: 0.22, alpha: app, lit: 0.8 })
    tops.push(isoPt(o, cx, cy + 0.15, Math.max(1.3, 0.1 + h)))
  }
  vignette(ctx, a, 0.75)
  // names: Grupo Fármacos and Maypo on the voice, then C and D as letters
  const span = c3 - c2, nameAt = [c2 + 100, c2 + span * 0.42, c2 + span * 0.72, c2 + span * 0.72 + 200]
  for (let k = 0; k < 4; k++) {
    const p = prog(ls, nameAt[k], 500)
    if (p <= 0) continue
    const tp = tops[k], lifted = tp[1] - (tall ? 26 : 34) * KF + bob(a, k)
    const lines: Line[] = tall && k === GF ? [{ s: 'GRUPO', size: 10, color: ink(a, 0.95), weight: 700 }, { s: 'FÁRMACOS', size: 10, color: ink(a, 0.95), weight: 700 }]
      : [{ s: tall ? shortOf(a, k) : nameOf(a, k), size: tall ? 10 : 11.5, color: k < 2 ? ink(a, 0.95) : dim(a, 0.95), weight: 700 }]
    if (ls > figT - 300) lines.push({ s: bn(a, totals[k])[0], size: tall ? 11 : 13, font: 'serif', color: ink(a, 0.9 * prog(ls, figT - 300, 500)) })
    const r = evCard(ctx, a, tp[0], lifted - (lines.length - 1) * 15 * KF - 20 * KF, lines, { al: p, align: 'center', pad: tall ? 7 : 10 })
    leader(ctx, a, tp, [tp[0], r.y + r.h], p)
  }
  // the total
  if (ls > figT) {
    const [num, unit] = bn(a, 326, 0)
    const al = prog(ls, figT, 450)
    evCard(ctx, a, W * 0.5, H * (tall ? 0.105 : 0.11) + bob(a, 7), [
      { s: L(a, 'SINCE 2003 · THE FOUR', 'DESDE 2003 · LAS CUATRO'), size: 10.5, color: dim(a, 0.95) },
      { s: num, size: tall ? 34 : 54, font: 'serif', color: red(a, 0.97) },
      { s: unit, size: 10.5, color: ink(a, 0.85) },
    ], { al, accent: true, align: 'center', pad: 14 })
  }
}

// ── 2 · CUSTOMER — IMSS's conveyor: one carton in every ten turns off toward the four ─────────
const customer: SceneFn = (ctx, a) => {
  const { ls, W, H } = a, tall = isTall(a), c1 = cue(a, 1), c2 = cue(a, 2)
  const u = tall ? Math.min(W * 0.068, H * 0.054) : Math.min(W * 0.058, H * 0.064)
  const o = cam(a, tall ? 0.5 : 0.5, 0.42, u, 0.04)
  o.ox -= 1.6 * u; o.oy += 2.3 * u
  const P = (x: number, y: number, z = 0) => isoPt(o, x, y, z)
  const b = easeOut(prog(ls, 0, 1400))
  isoFloor(ctx, a, o, 11, 0.09 * b)
  pool(ctx, a, o, -3.6, -1.8, 4.2, 0.2 * b)
  pool(ctx, a, o, 1.4, 3.6, 2.8, 0.16 * b)
  // IMSS: a long administrative block with ribbon windows
  const IX = -6.2, IY = -3.6, IW = 3.6, ID = 3.0, IH = 2.1 * b
  solidBox(ctx, a, o, IX, IY, IW, ID, IH, { alpha: b, lit: 0.62 })
  for (let f = 0; f < 3 && b > 0.5; f++) {
    const za = 0.35 + f * 0.6, zb = za + 0.26, fl = 0.35 + 0.12 * Math.sin(ls * 0.0015 + f)
    poly(ctx, [P(IX + 0.2, IY + ID, za), P(IX + IW - 0.2, IY + ID, za), P(IX + IW - 0.2, IY + ID, zb), P(IX + 0.2, IY + ID, zb)], ink(a, fl * b))
    poly(ctx, [P(IX + IW, IY + 0.2, za), P(IX + IW, IY + ID - 0.2, za), P(IX + IW, IY + ID - 0.2, zb), P(IX + IW, IY + 0.2, zb)], ink(a, (fl + 0.08) * b))
  }
  // the conveyor out of the loading dock, and the spur to the four
  const BY = -1.25, X0 = IX + IW, X1 = 8, XJ = 1.4, SP1 = 2.9
  isoBox(ctx, a, o, X0, BY - 0.35, X1 - X0, 0.7, 0.22, { alpha: b * 0.9, lit: 0.42 })
  isoBox(ctx, a, o, XJ - 0.35, BY + 0.35, 0.7, SP1 - BY - 0.35, 0.22, { alpha: b * 0.9, lit: 0.42 })
  const roll = (ls * 0.0016) % 0.5
  ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 1; ctx.beginPath()
  for (let x = X0 + roll; x < X1; x += 0.5) { const p0 = P(x, BY - 0.35, 0.22), p1 = P(x, BY + 0.35, 0.22); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]) }
  ctx.stroke()
  // the four depots at the end of the spur
  for (let k = 0; k < 4; k++) depot(ctx, a, o, XJ - 3.0 + k * 1.55, SP1 + 0.25, 1.25, 1.15, 0.95 * b, { alpha: b, door: 0.7, lit: 0.5 })
  // cartons: positions are a pure function of the clock; carton m left the dock at c1 + m·gap/v
  const v = 0.0016, gap = 0.62, Lm = X1 - X0, sj = XJ - X0, Ls = SP1 - (BY + 0.35) + 0.2
  if (ls > c1) {
    const p = (ls - c1) * v
    const mHi = Math.floor(p / gap), mLo = Math.max(0, Math.floor((p - Lm - Ls) / gap))
    for (let m = mHi; m >= mLo; m--) {
      const s = p - m * gap
      const isRed = m % 10 === 0 && c1 + (m * gap) / v >= c2 - 300
      let x: number, y: number, al = 1
      if (isRed && s > sj) {
        const t = s - sj
        if (t > Ls) continue
        x = XJ; y = BY + t; al = 1 - prog(t, Ls - 0.5, 0.5)
      } else {
        if (s > Lm) continue
        x = X0 + s; y = BY; al = 1 - prog(s, Lm - 3.5, 3.5)
      }
      al *= prog(s, 0, 0.25)
      solidBox(ctx, a, o, x - 0.2, y - 0.2, 0.4, 0.4, 0.34, { z: 0.22, alpha: al, accent: isRed, lit: isRed ? 1.15 : 0.8 })
    }
  }
  vignette(ctx, a, 0.78)
  // IMSS card on its sentence
  const p1 = prog(ls, c1 + 100, 600)
  if (p1 > 0) {
    const top = P(IX + IW / 2, IY + ID / 2, IH)
    const r = evCard(ctx, a, W * 0.05, H * (tall ? 0.11 : 0.16) + bob(a, 2), [
      { s: 'IMSS', size: tall ? 24 : 32, font: 'serif', color: ink(a, 0.97) },
      { s: L(a, 'SOCIAL-SECURITY INSTITUTE', 'INSTITUTO MEXICANO DEL SEGURO SOCIAL'), size: 9.5, color: dim(a, 0.95) },
    ], { al: p1, pad: 12 })
    leader(ctx, a, top, [r.x + r.w, r.y + r.h * 0.5], p1)
  }
  // one in ten, on the voice
  const p2 = prog(ls, c2 + 250, 500)
  if (p2 > 0) {
    const at = P(XJ, BY + 1.6, 0.4)
    const cx = tall ? W * 0.96 : W * 0.93, cy = tall ? H * 0.34 : H * 0.36
    const r = evCard(ctx, a, cx, cy + bob(a, 3), [
      { s: L(a, 'ONE PESO IN TEN', 'UNO DE CADA DIEZ PESOS'), size: 10.5, color: dim(a, 0.95) },
      { s: '1 / 10', size: tall ? 34 : 56, font: 'serif', color: red(a, 0.97) },
      { s: L(a, 'OF ALL IMSS SPENDING', 'DE TODO EL GASTO DEL IMSS'), size: 9.5, color: ink(a, 0.85) },
      { s: L(a, '23 YEARS · TO THE FOUR', '23 AÑOS · A LAS CUATRO'), size: 9.5, color: ink(a, 0.6 * prog(ls, c2 + (a.dur - c2) * 0.55, 500)) },
    ], { al: p2, accent: true, align: 'right', pad: 14 })
    leader(ctx, a, at, [r.x, r.y + r.h * 0.6], p2, true)
  }
}

// ── 3 · LATTICE — six tender tables, one per pair; the paper piles up where they meet ─────────
const lattice: SceneFn = (ctx, a) => {
  const { ls, W, H, KF } = a, tall = isTall(a), c1 = cue(a, 1)
  const u = tall ? Math.min(W * 0.052, H * 0.05) : Math.min(W * 0.06, H * 0.08)
  const o = cam(a, tall ? 0.72 : 0.58, tall ? 0.5 : 0.45, u, 0.04)
  o.oy += 1.2 * u
  const b = easeOut(prog(ls, 0, 1200))
  isoFloor(ctx, a, o, 12, 0.09 * b)
  pool(ctx, a, o, -0.6, -0.4, 5.4, 0.18 * b)
  hangLamp(ctx, a, o, -0.6, -0.6, 7.6, 4.6, b * 0.8, Math.sin(ls * 0.0008) * 0.05)
  // six tender tables, one per pair, all starting from the same edge: length = shared tenders
  const MAXC = BIG4_SHARED[0][2]
  const pile = easeOut(prog(ls, c1, 600))
  const X0 = -3.0
  const labels: { p: Pt; s: string; n: number; al: number }[] = []
  BIG4_SHARED.forEach(([ka, kb, n], k) => {
    const len = 0.8 + (4.6 * n) / MAXC, y0 = k * 1.45 - 3.6
    const app = easeOut(prog(ls, 250 + k * 170, 600))
    const sit = easeOut(prog(ls, 700 + k * 170, 900))
    man(ctx, a, o, X0 + 0.3, y0 - 0.3 - (1 - sit) * 1.0, { al: app * sit, h: 0.75 })
    man(ctx, a, o, X0 + len - 0.3, y0 - 0.3 - (1 - sit) * 1.0, { al: app * sit, h: 0.75 })
    solidBox(ctx, a, o, X0, y0, len * easeOut(prog(ls, 250 + k * 170, 900)), 0.62, 0.42 * app, { alpha: app, lit: 0.7 })
    // the pile of shared tender papers, landing on the figure
    const ph = 0.04 + 1.3 * (n / MAXC) * pile
    if (pile > 0) crates(ctx, a, o, X0 + len / 2 - 0.22, y0 + 0.12, 0.44, 0.38, ph, { z: 0.42 * app, layer: 0.05, lit: 1.0, alpha: app, pallet: false })
    labels.push({ p: isoPt(o, X0 - 0.35, y0 + 0.31, 0.2), s: tall ? `${shortOf(a, keyIdx(ka)).replace('DIST. ', '')} · ${shortOf(a, keyIdx(kb)).replace('DIST. ', '')}` : `${shortOf(a, keyIdx(ka))} · ${shortOf(a, keyIdx(kb))}`, n, al: app })
  })
  vignette(ctx, a, 0.75)
  for (const l of labels) {
    const ns = count(l.n, 1, 0, a.lang), nsz = (tall ? 11 : 15) * KF, nw = measure(ctx, '1,436', nsz, 'serif')
    if (pile > 0) text(ctx, ns, l.p[0], l.p[1] + 1 * KF, { size: nsz, color: ink(a, 0.95), alpha: pile, align: 'right' })
    mono(ctx, a, l.s, l.p[0] - nw - 8 * KF, l.p[1], tall ? 7.5 : 10, ink(a, 0.8), { alpha: l.al, align: 'right' })
  }
  const pc = prog(ls, c1, 520)
  if (pc > 0) {
    evCard(ctx, a, tall ? W * 0.05 : W * 0.95, H * (tall ? 0.12 : 0.47) + bob(a, 5), [
      { s: count(5285, pc, 0, a.lang), size: tall ? 34 : 58, font: 'serif', color: ink(a, 0.97) },
      { s: L(a, 'SHARED PROCEDURES', 'PROCEDIMIENTOS COMPARTIDOS'), size: tall ? 9.5 : 10.5, color: ink(a, 0.85) },
      { s: L(a, 'SAME TENDER, TWO OF THE FOUR', 'MISMA LICITACIÓN, DOS DE LAS CUATRO'), size: 9, color: dim(a, 0.95) },
    ], { al: Math.min(1, pc * 3), accent: true, align: tall ? 'left' : 'right', pad: 14 })
  }
  // first sentence: the label over the hall
  const p0 = prog(ls, 900, 600) * (1 - prog(ls, c1 - 200, 300))
  if (p0 > 0) mono(ctx, a, L(a, 'A SMALL MARKET · THE SAME TABLES', 'UN MERCADO PEQUEÑO · LAS MISMAS MESAS'), W * 0.05, H * 0.14, tall ? 8.5 : 10.5, dim(a, 0.95), { alpha: p0 })
}

// ── 4 · HEDGE — few makers, one road, one table: the same four sit down again and again ───────
const hedge: SceneFn = (ctx, a) => {
  const { ls, W, H, KF } = a, tall = isTall(a), c1 = cue(a, 1)
  const u = tall ? Math.min(W * 0.062, H * 0.056) : Math.min(W * 0.05, H * 0.064)
  const o = cam(a, tall ? 0.56 : 0.5, tall ? 0.48 : 0.5, u, 0.05)
  const P = (x: number, y: number, z = 0) => isoPt(o, x, y, z)
  const b = easeOut(prog(ls, 0, 1300))
  isoFloor(ctx, a, o, 11, 0.09 * b)
  pool(ctx, a, o, 2.2, 1.2, 3.4, 0.24 * b)
  // the makers: three sawtooth-roofed plants at the back
  const plants = [[-6.2, -2.4], [-6.2, -0.1], [-6.2, 2.2]] as const
  plants.forEach(([px, py], k) => {
    const app = easeOut(prog(ls, 150 + k * 200, 900))
    const h = 1.1 * app
    solidBox(ctx, a, o, px, py, 2.0, 1.6, h, { alpha: app, lit: 0.48 })
    for (let t = 0; t < 3 && app > 0.5; t++) { // the sawtooth
      const x = px + t * 0.66
      poly(ctx, [P(x, py + 1.6, h), P(x + 0.66, py + 1.6, h), P(x + 0.66, py + 1.6, h + 0.42)], ink(a, 0.28 * app), ink(a, 0.4 * app))
      poly(ctx, [P(x + 0.66, py, h), P(x + 0.66, py + 1.6, h), P(x + 0.66, py + 1.6, h + 0.42), P(x + 0.66, py, h + 0.42)], ink(a, 0.6 * app), ink(a, 0.45 * app))
    }
    // a chimney breathing slowly
    const ch = P(px + 0.3, py + 0.3, h + 0.9)
    isoBox(ctx, a, o, px + 0.15, py + 0.15, 0.3, 0.3, 0.9, { z: h, alpha: app, lit: 0.5 })
    for (let s = 0; s < 3; s++) { const t = ((ls * 0.0003 + s / 3) % 1); glow(ctx, ch[0] + t * u * 0.8, ch[1] - t * u * 1.4, u * (0.2 + t * 0.4), dim(a, 0.18 * (1 - t) * app), dim(a, 0)) }
  })
  // the one road down to the table
  const road: Pt[] = [[-3.6, -1.6], [-3.6, 3.2], [-3.6, 1.1], [1.0, 1.1]]
  const rp = easeOut(prog(ls, 600, 1200))
  trace(ctx, road.map(([x, y]) => P(x, y)), rp, { color: ink(a, 0.22), width: Math.max(4, u * 0.5) })
  for (let k = 0; k < 3; k++) { // feeder stubs from each plant
    const fy = plants[k][1] + 0.8
    trace(ctx, [P(plants[k][0] + 2.0, fy), P(-3.6, fy)], rp, { color: ink(a, 0.22), width: Math.max(4, u * 0.5) })
  }
  // little vans running the road (a loop, phase = clock)
  if (rp >= 1) for (let k = 0; k < 3; k++) {
    const t = (ls * 0.00012 + k / 3) % 1
    const segs: Pt[] = [[plants[k][0] + 2.1, plants[k][1] + 0.8], [-3.6, plants[k][1] + 0.8], [-3.6, 1.1], [1.0, 1.1]]
    let tot = 0; for (let i = 1; i < segs.length; i++) tot += Math.abs(segs[i][0] - segs[i - 1][0]) + Math.abs(segs[i][1] - segs[i - 1][1])
    let d = t * tot, q: Pt = segs[0]
    for (let i = 1; i < segs.length; i++) { const sl = Math.abs(segs[i][0] - segs[i - 1][0]) + Math.abs(segs[i][1] - segs[i - 1][1]); if (d <= sl) { const f = sl ? d / sl : 0; q = [lerp(segs[i - 1][0], segs[i][0], f), lerp(segs[i - 1][1], segs[i][1], f)]; break } d -= sl; q = segs[i] }
    const al = Math.sin(Math.PI * t)
    solidBox(ctx, a, o, q[0] - 0.22, q[1] - 0.14, 0.44, 0.28, 0.26, { alpha: al, lit: 0.85 })
  }
  // the table, its four chairs, and the same four coming back each round
  const TX = 1.2, TY = 0.6, TL = 2.2, TD = 1.0
  const T = 2600, rnd0 = Math.max(0, ls - 1200), round = Math.floor(rnd0 / T), ph = (rnd0 % T) / T
  const seats: Pt[] = [[TX + 0.5, TY - 0.35], [TX + TL - 0.5, TY - 0.35], [TX + 0.5, TY + TD + 0.35], [TX + TL - 0.5, TY + TD + 0.35]]
  const along = ph < 0.25 ? 1 - easeOut(ph / 0.25) : ph > 0.82 ? easeIn((ph - 0.82) / 0.18) : 0
  const tb = easeOut(prog(ls, 500, 900))
  for (let k = 0; k < 2; k++) man(ctx, a, o, seats[k][0], seats[k][1] - along * 1.6, { al: tb * prog(ls, 1200, 300), h: 0.78 })
  solidBox(ctx, a, o, TX, TY, TL, TD, 0.48 * tb, { alpha: tb, lit: 0.82 })
  // the notice for this round lands on the pile; the pile grows by one sheet per round
  const sheets = Math.min(14, round)
  if (tb > 0.9) {
    crates(ctx, a, o, TX + TL / 2 - 0.32, TY + 0.25, 0.64, 0.46, 0.03 + sheets * 0.035, { layer: 0.035, z: 0.48, lit: 1, pallet: false })
  }
  const drop = prog(ph, 0, 0.18)
  if (ls > 1200 && drop < 1) {
    const zz = 0.48 + 0.03 + sheets * 0.035 + (1 - easeIn(drop)) * 1.6
    solidBox(ctx, a, o, TX + TL / 2 - 0.32, TY + 0.25, 0.64, 0.46, 0.035, { z: zz, alpha: 1, lit: 1.1 })
  }
  for (let k = 2; k < 4; k++) man(ctx, a, o, seats[k][0], seats[k][1] + along * 1.6, { al: tb * prog(ls, 1200, 300), h: 0.78 })
  // the tally board beside the table: one stroke per round
  const bx = TX + TL + 0.7, by0 = TY + 0.1
  solidBox(ctx, a, o, bx, by0, 0.08, 1.1, 0.95 * tb, { alpha: tb, lit: 0.55, z: 0.25 })
  if (tb > 0.9) {
    ctx.strokeStyle = ink(a, 0.85); ctx.lineWidth = Math.max(1.2, KF * 1.3); ctx.beginPath()
    for (let s = 0; s < Math.min(round, 10); s++) {
      const g = Math.floor(s / 5), i = s % 5
      const yy = by0 + 0.15 + g * 0.5 + i * 0.08
      const p0 = i === 4 ? P(bx + 0.08, yy - 0.34, 0.45) : P(bx + 0.08, yy, 0.4), p1 = i === 4 ? P(bx + 0.08, yy + 0.04, 1.05) : P(bx + 0.08, yy, 1.05)
      ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1])
    }
    ctx.stroke()
  }
  vignette(ctx, a, 0.78)
  // the caution, then the reason
  const p0 = prog(ls, 300, 700)
  evCard(ctx, a, tall ? W * 0.95 : W * 0.94, H * 0.12 + bob(a, 1), [
    { s: L(a, 'ON ITS OWN', 'POR SÍ SOLO'), size: 10.5, color: dim(a, 0.95) },
    { s: L(a, 'Proves nothing', 'No prueba nada'), size: tall ? 24 : 34, font: 'serif', color: ink(a, 0.97) },
  ], { al: p0, align: 'right', pad: 14 })
  const p1 = prog(ls, c1 + 200, 600)
  if (p1 > 0) {
    const pa = P(-5.2, -2.4, 1.6)
    const r = evCard(ctx, a, tall ? W * 0.05 : W * 0.06, H * (tall ? 0.27 : 0.13) + bob(a, 2), [
      { s: L(a, 'FEW FIRMS CAN SUPPLY', 'POCAS EMPRESAS PUEDEN SURTIR'), size: tall ? 9.5 : 10.5, color: ink(a, 0.9), weight: 700 },
    ], { al: p1, pad: 10 })
    leader(ctx, a, pa, [r.x + r.w * 0.5, r.y + r.h], p1)
    const pt = P(TX + TL, TY + TD, 0.48)
    const p2 = prog(ls, c1 + (a.dur - c1) * 0.45, 600)
    const r2 = evCard(ctx, a, tall ? W * 0.95 : W * 0.94, H * (tall ? 0.62 : 0.5) + bob(a, 3), [
      { s: L(a, 'THE SAME TENDERS', 'LAS MISMAS LICITACIONES'), size: tall ? 9.5 : 10.5, color: ink(a, 0.9), weight: 700 },
      { s: L(a, 'AGAIN AND AGAIN', 'UNA Y OTRA VEZ'), size: tall ? 9.5 : 10.5, color: dim(a, 0.95) },
    ], { al: p2, align: 'right', pad: 10 })
    if (!tall) leader(ctx, a, pt, [r2.x, r2.y + r2.h * 0.5], p2)
  }
}

// ── 5 · RACE — the four lanes over the years; the baton jumps to each year's tallest stack ──────
const race: SceneFn = (ctx, a) => {
  const { ls, W, H, KF } = a, tall = isTall(a), c1 = cue(a, 1), c2 = cue(a, 2), c3 = cue(a, 3)
  const u = tall ? Math.min(W * 0.075, H * 0.072) : Math.min(W * 0.046, H * 0.085)
  // the playhead year: 2003 → 2010 on "early years", 2011 → 2016 on "takes over", → 2019 on "and climbs"
  let t = 2003 + 0.6 * prog(ls, 400, Math.max(400, c1 - 400))
  t = lerp(t, 2010.9, easeInOut(prog(ls, c1, c2 - c1)))
  t = lerp(t, 2016.9, easeInOut(prog(ls, c2, c3 - c2)))
  t = lerp(t, 2019.6, easeOut(prog(ls, c3, Math.max(900, (a.dur - c3) * 0.85))))
  const S = 1.15, LANE = 0.95, order = [DD, DC, MAYPO, GF] // back → front
  const track = (yr: number, j: number): Pt => [(yr - 2003) * S + j * 0.3 + j * LANE, -(yr - 2003) * S + j * LANE]
  const focus = track(t - (tall ? 1.2 : 2.2), 1.5)
  const fp = [(focus[0] - focus[1]) * u * 0.866, (focus[0] + focus[1]) * u * 0.5]
  const o: Iso = { ox: W * (tall ? 0.5 : 0.5) - fp[0], oy: H * (tall ? 0.62 : 0.64) - fp[1], u }
  const b = easeOut(prog(ls, 0, 900))
  isoFloor(ctx, a, { ...o, ox: o.ox % (u * 1.732), oy: H * (tall ? 0.62 : 0.64) }, 12, 0.08 * b)
  // lane paint
  for (let j = 0; j < 4; j++) {
    const p0 = track(2002, j), p1 = track(2021, j)
    trace(ctx, [isoPt(o, p0[0] + 0.6, p0[1] + 0.75), isoPt(o, p1[0] + 0.6, p1[1] + 0.75)], 1, { color: ink(a, 0.13 * b), width: 1, dash: [6 * KF, 6 * KF] })
  }
  const lead = (yr: number) => { let bi = -1, bv = 0; for (let i = 0; i < 4; i++) { const v = val(i, yr); if (v > bv) { bv = v; bi = i } } return bi }
  const H1 = 0.2
  // a pool that follows the playhead
  const pf = track(t, 2)
  pool(ctx, a, o, pf[0], pf[1], 3.4, 0.2 * b)
  for (let j = 0; j < 4; j++) {
    const i = order[j]
    for (let yr = 2003; yr <= Math.min(2019, Math.floor(t + 0.5)); yr++) {
      const g = easeOut(clamp01((t - yr + 0.5) * 1.6))
      const [x, y] = track(yr, j)
      const sx = (x - y) * u * 0.866 + o.ox
      if (sx < -u * 2 || sx > W + u * 2) continue
      const v = val(i, yr), isLead = lead(yr) === i
      crates(ctx, a, o, x, y, 0.62, 0.62, Math.max(0.01, v * H1 * g), { layer: H1, lit: isLead ? 0.95 : 0.65, alpha: b, pallet: v > 0 })
    }
  }
  // year labels along the front lane
  for (let yr = 2003; yr <= 2019; yr++) {
    const [x, y] = track(yr, 3), p = isoPt(o, x + 0.31, y + 1.0)
    if (p[0] < 20 * KF || p[0] > W - 20 * KF) continue
    tagAt(ctx, a, p, String(yr), tall ? 8.5 : 10, yr <= t + 0.3 ? ink(a, 0.8) : dim(a, 0.4), b, 14)
  }
  vignette(ctx, a, 0.75)
  // the baton: on the leader of the current year, hopping to the next year's leader
  const y0 = Math.min(2019, Math.floor(t)), fr = t - y0
  let ya = y0; while (ya > 2003 && lead(ya) < 0) ya--
  let yb = Math.min(2019, y0 + 1); while (yb < 2019 && lead(yb) < 0) yb++
  const la = lead(ya), lb = lead(yb)
  if (la >= 0 && lb >= 0 && ls > 500) {
    const ja = order.indexOf(la), jb = order.indexOf(lb)
    const A = track(ya, ja), B = track(yb, jb)
    const za = val(la, ya) * H1 + 0.1, zb = val(lb, yb) * H1 * clamp01((t - yb + 0.5) * 1.6) + 0.1
    const hp = y0 >= 2019 ? 0 : easeInOut(prog(fr, 0.45, 0.4))
    const bxw = lerp(A[0], B[0], hp) + 0.31, byw = lerp(A[1], B[1], hp) + 0.31, bz = lerp(za, Math.max(zb, 0.1), hp) + Math.sin(Math.PI * hp) * 0.9
    baton(ctx, a, o, bxw, byw, bz + 0.12, prog(ls, 500, 400))
    // the leader's name rides above the baton
    const who = hp < 0.5 ? la : lb, bp = isoPt(o, bxw, byw, bz + 0.5)
    const r = evCard(ctx, a, bp[0], Math.max(H * 0.11, bp[1] - 52 * KF) + bob(a, 2), [
      { s: nameOf(a, who), size: tall ? 10 : 11.5, color: red(a, 0.95), weight: 700 },
    ], { al: prog(ls, 600, 400), accent: true, align: 'center', pad: 8 })
    leader(ctx, a, bp, [bp[0], r.y + r.h], 1, true)
  }
  // lane names, riding just ahead of the playhead
  for (let j = 0; j < 4; j++) {
    const i = order[j], [x, y] = track(Math.min(2020.2, t + 1.3), j), p = isoPt(o, x + 0.3, y + 0.75)
    mono(ctx, a, shortOf(a, i), Math.min(p[0], W - 8 * KF), p[1] + 4 * KF, tall ? 8.5 : 10, i === GF ? ink(a, 0.9) : dim(a, 0.85), { alpha: b, align: p[0] > W - 90 * KF ? 'right' : 'left' })
  }
  // the year, large, in the open corner
  evCard(ctx, a, tall ? W * 0.05 : W * 0.05, H * (tall ? 0.11 : 0.12), [
    { s: L(a, 'BILLIONS OF PESOS A YEAR', 'MILES DE MILLONES AL AÑO'), size: 9.5, color: dim(a, 0.95) },
    { s: String(Math.min(2019, Math.floor(t + 0.02))), size: tall ? 26 : 40, font: 'serif', color: ink(a, 0.97) },
  ], { al: b, pad: 12 })
}

// ── 6 · CLIFF — 2020: the gantry sign changes and the floor opens under 17.6 billion ─────────
const cliff: SceneFn = (ctx, a) => {
  const { ls, W, H, KF } = a, tall = isTall(a), c1 = cue(a, 1)
  const u = tall ? Math.min(W * 0.085, H * 0.075) : Math.min(W * 0.05, H * 0.08)
  const o = cam(a, tall ? 0.48 : 0.5, 0.64, u, 0.05)
  const P = (x: number, y: number, z = 0) => isoPt(o, x, y, z)
  const b = easeOut(prog(ls, 0, 1200))
  isoFloor(ctx, a, o, 10, 0.09 * b)
  pool(ctx, a, o, 0, 0, 3.4, 0.24 * b)
  depot(ctx, a, o, -1.9, -4.2, 3.6, 1.6, 1.35 * b, { alpha: b, door: 0.75, lit: 0.45 })
  // the gantry over the track and its sign: the old one hauled up, the new one let down
  const GX = 3.2, swapO = easeInOut(prog(ls, cue(a, 0) + 900, 1300)), swapN = easeInOut(prog(ls, cue(a, 0) + 1900, 1300))
  isoBox(ctx, a, o, GX, -3.2, 0.18, 0.18, 3.8 * b, { alpha: b, lit: 0.5 })
  isoBox(ctx, a, o, GX, -3.2, 0.18, 4.6, 0.16, { z: 3.8 * b, alpha: b, lit: 0.7 })
  const sign = (lift: number, label: string, al: number, accent: boolean) => {
    const zt = 3.75 - 0.85 + lift
    if (al <= 0.01) return
    ctx.strokeStyle = dim(a, 0.5 * al); ctx.lineWidth = 1
    for (const yy of [-2.0, 0.2]) { const p0 = P(GX + 0.09, yy, 3.8), p1 = P(GX + 0.09, yy, zt + 0.7); ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.stroke() }
    solidBox(ctx, a, o, GX, -2.3, 0.1, 2.8, 0.7, { z: zt, alpha: al, lit: accent ? 0.5 : 0.9 })
    const sc = P(GX + 0.1, -0.9, zt + 0.35)
    mono(ctx, a, label, sc[0], sc[1] + 4 * KF, tall ? 8 : 10, accent ? ink(a, 0.9) : a.pal.bg, { align: 'center', alpha: al, weight: 700 })
  }
  sign(swapO * 3.5, L(a, 'OLD BUYING SYSTEM', 'SISTEMA ANTERIOR'), b * (1 - prog(swapO, 0.6, 0.4)), false)
  sign((1 - swapN) * 3.5, L(a, 'NEW BUYING SYSTEM', 'SISTEMA NUEVO'), prog(swapN, 0, 0.3), true)
  // the 2019 stack on its trapdoor
  const figA = c1 + (a.dur - c1) * 0.3, figB = c1 + (a.dur - c1) * 0.62
  const H0 = val(GF, 2019) * 0.2, open = easeOut(prog(ls, figB - 300, 400)), sink = easeIn(prog(ls, figB - 150, 900)) * (H0 + 0.3)
  if (open > 0) {
    const e = 0.12
    poly(ctx, [P(-0.7 - e, -0.7 - e), P(0.7 + e, -0.7 - e), P(0.7 + e, 0.7 + e), P(-0.7 - e, 0.7 + e)], `rgba(0,0,0,${0.95 * open})`, red(a, 0.85 * open), Math.max(1.5, 1.6 * KF))
    // the two leaves swung down into the dark
    const lw = 0.82 * (1 - open * 0.7)
    poly(ctx, [P(-0.7 - e, -0.7 - e), P(-0.7 - e, 0.7 + e), P(-0.7 - e + lw, 0.7 + e, -lw * 0.6), P(-0.7 - e + lw, -0.7 - e, -lw * 0.6)], ink(a, 0.12 * open))
  }
  ctx.save()
  if (open > 0) { // nothing of the stack shows below the floor
    const q = [P(-0.82, -0.82), P(0.82, -0.82), P(0.82, 0.82), P(-0.82, 0.82)]
    ctx.beginPath(); ctx.rect(0, 0, W, H)
    ctx.moveTo(q[0][0], q[0][1]); for (const p of q.slice(1)) ctx.lineTo(p[0], p[1]); ctx.closePath()
    ctx.clip('evenodd')
  }
  crates(ctx, a, o, -0.7, -0.7, 1.4, 1.4, H0, { layer: 0.2, sink, lit: 0.82, alpha: b, pallet: open <= 0 })
  ctx.restore()
  // the sinking top still shows inside the hole outline as it drops
  hangLamp(ctx, a, o, 0, 0, 6.2, 2.4, b * (1 - 0.4 * prog(ls, figB, 400)), Math.sin(ls * 0.0009) * 0.05)
  vignette(ctx, a, 0.82)
  // the figures: 17.6 then zero
  const pA = prog(ls, figA, 450), pB = prog(ls, figB, 450)
  if (pA > 0) {
    const [num, unit] = bn(a, 17.6)
    const top = P(0.7, 0, H0 + 0.08 - sink)
    const r = evCard(ctx, a, tall ? W * 0.05 : W * 0.07, H * (tall ? 0.11 : 0.18) + bob(a, 1), [
      { s: 'GRUPO FÁRMACOS · 2019', size: tall ? 9.5 : 10.5, color: dim(a, 0.95) },
      { s: num, size: tall ? 32 : 54, font: 'serif', color: ink(a, 0.97 - 0.45 * pB) },
      { s: unit, size: 10.5, color: ink(a, 0.8) },
    ], { al: pA, pad: 14 })
    if (pB < 1) leader(ctx, a, top, [r.x + r.w, r.y + r.h * 0.5], pA * (1 - pB))
    if (pB > 0) {
      const hole = P(0, 0.7)
      const r2 = evCard(ctx, a, tall ? W * 0.05 : r.x, r.y + r.h + 14 * KF, [
        { s: '2020', size: tall ? 9.5 : 10.5, color: dim(a, 0.95) },
        { s: '0', size: tall ? 32 : 54, font: 'serif', color: red(a, 0.97) },
      ], { al: pB, accent: true, pad: 14 })
      leader(ctx, a, hole, [r2.x + r2.w, r2.y + r2.h * 0.5], pB, true)
    }
  }
}

// ── 7 · QUIET — the empty pad with its zeros, two stacks shrinking, the doors rolling up ───────
const quiet: SceneFn = (ctx, a) => {
  const { ls, W, H, KF } = a, tall = isTall(a), c1 = cue(a, 1), c2 = cue(a, 2), c3 = cue(a, 3), c4 = cue(a, 4)
  const u = tall ? Math.min(W * 0.072, H * 0.07) : Math.min(W * 0.05, H * 0.072)
  const o = cam(a, tall ? 0.52 : 0.5, tall ? 0.5 : 0.52, u, 0.04)
  const P = (x: number, y: number, z = 0) => isoPt(o, x, y, z)
  const b = easeOut(prog(ls, 0, 1100))
  const open = easeInOut(prog(ls, c4, 1500))
  isoFloor(ctx, a, o, 12, (0.08 + 0.06 * open) * b)
  // the back wall of doors that roll up when the market "looks open"
  const WY = -2.6
  solidBox(ctx, a, o, -4.8, WY - 0.4, 11.2, 0.4, 1.7 * b, { alpha: b, lit: 0.42 })
  for (let k = 0; k < 5; k++) {
    const dx0 = -4.3 + k * 2.15, dx1 = dx0 + 1.3, dh = 1.45, z0 = dh * clamp01(open * 1.4 - k * 0.08)
    poly(ctx, [P(dx0, WY, 0), P(dx1, WY, 0), P(dx1, WY, dh), P(dx0, WY, dh)], 'rgba(0,0,0,0.8)')
    if (z0 > 0) {
      poly(ctx, [P(dx0, WY, 0), P(dx1, WY, 0), P(dx1, WY, z0 * 0.95), P(dx0, WY, z0 * 0.95)], ink(a, 0.2 * open))
      poly(ctx, [P(dx0, WY, 0), P(dx1, WY, 0), P(dx1 + 0.3, WY + 2.2 * open, 0), P(dx0 - 0.3, WY + 2.2 * open, 0)], ink(a, 0.06 * open))
    }
    poly(ctx, [P(dx0, WY, z0), P(dx1, WY, z0), P(dx1, WY, dh), P(dx0, WY, dh)], ink(a, 0.22 * b), ink(a, 0.35 * b))
  }
  // three pads: Grupo Fármacos (empty), Distributor D (falls 97%), Maypo (halved)
  const S = 3.3, pads: Pt[] = [[-S, 0], [0, 0], [S, 0]]
  pads.forEach(([x, y]) => pool(ctx, a, o, x, y, 1.8, (0.16 + 0.06 * open) * b))
  // pad 0: an empty pallet, and a zero chalked for every year since
  const [gx, gy] = pads[0]
  isoBox(ctx, a, o, gx - 0.7, gy - 0.7, 1.4, 1.4, 0.08, { alpha: b, lit: 0.9 })
  wireBox(ctx, a, o, gx - 0.7, gy - 0.7, 1.4, 1.4, val(GF, 2019) * 0.2 * 0.5 + 0.08, dim(a, 0.35), 0)
  for (let k = 0; k < 6; k++) {
    const p = prog(ls, c1 + k * 170, 350)
    if (p <= 0) continue
    const tx = gx - 0.45 + (k % 3) * 0.45, ty = gy - 0.25 + Math.floor(k / 3) * 0.5, c = P(tx, ty, 0.08)
    text(ctx, '0', c[0], c[1] + 4 * KF, { size: (tall ? 12 : 17) * KF, color: a.pal.bg, align: 'center', alpha: p })
  }
  // pad 1: D, 2019 → 2020
  const d0 = val(DD, 2019) * 0.2, d1 = val(DD, 2020) * 0.2, fd = easeInOut(prog(ls, c2 + 250, 650))
  wireBox(ctx, a, o, pads[1][0] - 0.6, pads[1][1] - 0.6, 1.2, 1.2, d0 + 0.08, red(a, 0.8), fd)
  crates(ctx, a, o, pads[1][0] - 0.6, pads[1][1] - 0.6, 1.2, 1.2, lerp(d0, d1, fd), { layer: 0.2, alpha: b, lit: 0.8, accent: fd > 0 && fd < 1 })
  // pad 2: Maypo, 2019 → 2020
  const m0 = val(MAYPO, 2019) * 0.2, m1 = val(MAYPO, 2020) * 0.2, fm = easeInOut(prog(ls, c3 + 250, 650))
  wireBox(ctx, a, o, pads[2][0] - 0.6, pads[2][1] - 0.6, 1.2, 1.2, m0 + 0.08, dim(a, 0.7), fm)
  crates(ctx, a, o, pads[2][0] - 0.6, pads[2][1] - 0.6, 1.2, 1.2, lerp(m0, m1, fm), { layer: 0.2, alpha: b, lit: 0.8 })
  hangLamp(ctx, a, o, 0, 0, 5.8, 4.2, b * (0.85 + 0.15 * open), 0)
  vignette(ctx, a, 0.78 - 0.12 * open)
  // names under the pads (screen), then the figures on the voice
  const nm = (i: number, at: Pt) => tagAt(ctx, a, P(at[0] + 0.75, at[1] + 0.75), tall ? shortOf(a, i) : nameOf(a, i), tall ? 8 : 10, ink(a, 0.85), b, tall ? 14 : 18)
  nm(GF, pads[0]); nm(DD, pads[1]); nm(MAYPO, pads[2])
  const p0 = prog(ls, 150, 500)
  evCard(ctx, a, tall ? W * 0.04 : W * 0.06, H * (tall ? 0.11 : 0.14) + bob(a, 1), [
    { s: '0', size: tall ? 30 : 48, font: 'serif', color: ink(a, 0.97) },
    { s: tall ? 'G. FÁRMACOS' : L(a, 'GRUPO FÁRMACOS · EVERY YEAR', 'GRUPO FÁRMACOS · CADA AÑO'), size: tall ? 8.5 : 9.5, color: dim(a, 0.95) },
    { s: '2020 – 2025', size: 9.5, color: dim(a, 0.95 * prog(ls, c1, 500)) },
  ], { al: p0, pad: 12 })
  const pd = prog(ls, c2 + 300, 450)
  if (pd > 0) {
    const top = P(pads[1][0], pads[1][1] - 0.6, d0 + 0.1)
    const r = evCard(ctx, a, tall ? W * 0.96 : top[0], H * (tall ? 0.11 : 0.12) + bob(a, 2), [
      { s: '−97%', size: tall ? 30 : 46, font: 'serif', color: red(a, 0.97) },
      { s: (tall ? shortOf(a, DD) : nameOf(a, DD)) + ' · 2019 → 2020', size: tall ? 8.5 : 9.5, color: ink(a, 0.85) },
    ], { al: pd, accent: true, align: tall ? 'right' : 'center', pad: 12 })
    leader(ctx, a, top, [r.x + r.w * 0.5, r.y + r.h], pd, true)
  }
  const pm = prog(ls, c3 + 300, 450)
  if (pm > 0) {
    const top = P(pads[2][0], pads[2][1] - 0.6, m0 + 0.1)
    const r = evCard(ctx, a, W * 0.95, H * (tall ? 0.33 : 0.24) + bob(a, 3), [
      { s: L(a, 'HALF', 'LA MITAD'), size: tall ? 22 : 32, font: 'serif', color: ink(a, 0.97) },
      { s: `MAYPO · ${bn(a, val(MAYPO, 2019))[0]} → ${bn(a, val(MAYPO, 2020))[0]}`, size: 9.5, color: ink(a, 0.85) },
    ], { al: pm, align: 'right', pad: 12 })
    leader(ctx, a, top, [r.x, r.y + r.h * 0.6], pm)
  }
}

// ── 8 · RETURN — 2025: cartons rain onto one pad until they almost touch the old peak's outline ─
const ret: SceneFn = (ctx, a) => {
  const { ls, W, H, KF } = a, tall = isTall(a), c1 = cue(a, 1), c2 = cue(a, 2)
  const u = tall ? Math.min(W * 0.09, H * 0.075) : Math.min(W * 0.05, H * 0.08)
  const o = cam(a, tall ? 0.56 : 0.58, 0.69, u, 0.05)
  const P = (x: number, y: number, z = 0) => isoPt(o, x, y, z)
  const b = easeOut(prog(ls, 0, 1000))
  const on = prog(ls, 250, 500) * (ls < 800 ? (Math.floor(ls / 80) % 3 ? 1 : 0.35) : 1)
  isoFloor(ctx, a, o, 10, 0.09 * b)
  pool(ctx, a, o, 0, 0, 3.2, 0.24 * on)
  // a third gantry sign behind: yet another buying system
  const gs = easeOut(prog(ls, c1 + (c2 - c1) * 0.3, 900))
  isoBox(ctx, a, o, -3.6, -4.4, 0.16, 0.16, 3.6 * b, { alpha: b * 0.8, lit: 0.45 })
  isoBox(ctx, a, o, 2.4, -4.4, 0.16, 0.16, 3.6 * b, { alpha: b * 0.8, lit: 0.45 })
  isoBox(ctx, a, o, -3.6, -4.4, 6.2, 0.16, 0.14, { z: 3.6 * b, alpha: b * 0.8, lit: 0.6 })
  if (gs > 0) {
    solidBox(ctx, a, o, -1.9, -4.36, 2.8, 0.08, 0.62, { z: 2.85 + (1 - gs) * 1.2, alpha: gs, lit: 0.9 })
    const sc = P(-0.5, -4.28, 3.16 + (1 - gs) * 1.2)
    mono(ctx, a, L(a, 'ANOTHER BUYING SYSTEM', 'OTRO SISTEMA DE COMPRAS'), sc[0], sc[1] + 4 * KF, tall ? 7.5 : 9.5, a.pal.bg, { align: 'center', alpha: gs, weight: 700 })
  }
  // the old peak's outline on the neighbouring pad, when the voice compares
  const GX = -2.6, GY = 0.4, ghost = prog(ls, c2 + 100, 700)
  isoBox(ctx, a, o, GX - 0.06, GY - 0.06, 1.52, 1.52, 0.08, { alpha: b * 0.6, lit: 0.4 })
  wireBox(ctx, a, o, GX, GY, 1.4, 1.4, val(GF, 2017) * 0.2 + 0.08, ink(a, 0.7), ghost)
  // the cartons rain onto Distributor C's pad
  const LAYER = 0.2, N = val(DC, 2025), full = Math.floor(N), frac = N - full
  const figT = c1 + (c2 - c1) * 0.74, span = Math.max(1500, figT - c1 - 700)
  isoBox(ctx, a, o, -0.76, -0.76, 1.52, 1.52, 0.08, { alpha: b, lit: 0.45 })
  for (let j = 0; j <= full; j++) {
    const lh = j < full ? LAYER : LAYER * frac
    const p = prog(ls, c1 + 300 + (j / (full + 1)) * span, 380)
    if (p <= 0) break
    const zz = 0.08 + j * LAYER + (1 - easeIn(p)) * 3
    solidBox(ctx, a, o, -0.7, -0.7, 1.4, 1.4, lh, { z: zz, alpha: Math.min(1, p * 3), lit: 0.82 })
  }
  const topC = 0.08 + N * LAYER
  baton(ctx, a, o, 0, 0, topC + 0.05, prog(ls, figT, 500))
  hangLamp(ctx, a, o, 0, 0, 6.6, 2.3, on, Math.sin(ls * 0.0009) * 0.05)
  // the level line across the two tops
  if (ghost > 0) {
    const zl = val(GF, 2017) * 0.2 + 0.08
    trace(ctx, [P(GX, GY + 1.4, zl), P(0.7, 0.7, zl), P(0.7, -0.7, zl)], easeOut(prog(ls, c2 + 500, 800)), { color: red(a, 0.7), width: Math.max(1, KF), dash: [5 * KF, 4 * KF] })
  }
  vignette(ctx, a, 0.82)
  const pf = prog(ls, figT, 450)
  if (pf > 0) {
    const [num, unit] = bn(a, 19.5)
    const top = P(0.7, 0, topC)
    const r = evCard(ctx, a, tall ? W * 0.95 : W * 0.93, H * (tall ? 0.11 : 0.16) + bob(a, 1), [
      { s: L(a, 'JAN–SEP 2025 · ONE OF THE FOUR', 'ENE–SEP 2025 · UNA DE LAS CUATRO'), size: 9.5, color: dim(a, 0.95) },
      { s: num, size: tall ? 34 : 60, font: 'serif', color: red(a, 0.97) },
      { s: unit, size: 10.5, color: ink(a, 0.85) },
      { s: nameOf(a, DC), size: 9.5, color: ink(a, 0.65) },
    ], { al: pf, accent: true, align: 'right', pad: 14 })
    leader(ctx, a, top, [r.x, r.y + r.h * 0.55], pf, true)
  }
  if (ghost > 0) {
    const [num] = bn(a, 19.9)
    const gt = P(GX, GY + 0.7, val(GF, 2017) * 0.2 + 0.08)
    const r = evCard(ctx, a, tall ? W * 0.05 : W * 0.06, H * (tall ? 0.3 : 0.2) + bob(a, 2), [
      { s: L(a, 'OLD LEADER · 2017 PEAK', 'VIEJO LÍDER · MÁXIMO 2017'), size: 9.5, color: dim(a, 0.95) },
      { s: num, size: tall ? 24 : 36, font: 'serif', color: ink(a, 0.9) },
    ], { al: ghost, pad: 12 })
    leader(ctx, a, gt, [r.x + r.w, r.y + r.h * 0.6], ghost)
  }
}

// ── 9 · THREE — three gantries, a six-year ruler, and one raised seat whose nameplate flips ────
const three: SceneFn = (ctx, a) => {
  const { ls, W, H, KF } = a, tall = isTall(a), c1 = cue(a, 1), c2 = cue(a, 2), c3 = cue(a, 3)
  const u = tall ? Math.min(W * 0.068, H * 0.066) : Math.min(W * 0.046, H * 0.08)
  const o = cam(a, tall ? 0.5 : 0.52, tall ? 0.55 : 0.57, u, 0.05)
  const P = (x: number, y: number, z = 0) => isoPt(o, x, y, z)
  const b = easeOut(prog(ls, 0, 1000))
  isoFloor(ctx, a, o, 12, 0.08 * b)
  // the track and the three gantries along it
  lanePaint(ctx, a, o, -6, 8, [-1.6, 0.4], b)
  const gx = [-4.0, 0.0, 4.0], ROM = ['I', 'II', 'III']
  gx.forEach((x, k) => {
    const g = easeOut(prog(ls, 150 + k * 380, 700))
    if (g <= 0) return
    isoBox(ctx, a, o, x, -2.4, 0.18, 0.18, 3.0 * g, { alpha: g, lit: 0.5 })
    isoBox(ctx, a, o, x, 1.0, 0.18, 0.18, 3.0 * g, { alpha: g, lit: 0.5 })
    isoBox(ctx, a, o, x, -2.4, 0.18, 3.6, 0.16, { z: 3.0 * g, alpha: g, lit: 0.75 })
    solidBox(ctx, a, o, x, -1.2, 0.08, 1.4, 0.55, { z: 2.35, alpha: g, lit: 0.9 })
    const sc = P(x + 0.08, -0.5, 2.62)
    text(ctx, ROM[k], sc[0], sc[1] + 6 * KF, { size: (tall ? 13 : 17) * KF, color: a.pal.bg, align: 'center', alpha: g, weight: 700 })
  })
  // the six-year ruler along the floor, segment by segment
  const r6 = prog(ls, c1, 900)
  for (let k = 0; k < 6; k++) {
    const p = prog(r6, k / 6, 1 / 6)
    if (p <= 0) continue
    const x0 = -4.6 + k * 1.55
    poly(ctx, [P(x0, 1.7), P(x0 + 1.4 * easeOut(p), 1.7), P(x0 + 1.4 * easeOut(p), 2.0), P(x0, 2.0)], ink(a, 0.5))
  }
  if (r6 > 0) tagAt(ctx, a, P(0, 2.0), L(a, 'SIX YEARS', 'SEIS AÑOS'), tall ? 9 : 11, ink(a, 0.9), prog(ls, c1 + 400, 400), 20)
  // the raised seat in front
  const SX = 2.6, SY = 3.2, sb = easeOut(prog(ls, 400, 900))
  pool(ctx, a, o, SX + 0.6, SY + 0.6, 2.4, 0.22 * sb)
  solidBox(ctx, a, o, SX - 0.4, SY - 0.4, 2.0, 2.0, 0.3 * sb, { alpha: sb, lit: 0.55 })
  solidBox(ctx, a, o, SX, SY, 1.2, 1.2, 0.3 * sb, { z: 0.3, alpha: sb, lit: 0.65 })
  const seatRed = prog(ls, c3 + 200, 500)
  const flipAt = c2 + (c3 - c2) * 0.35, backAt = c3 - 150
  // the occupant: there until the name changes, gone a moment, then the next one
  const leave = easeIn(prog(ls, flipAt - 200, 600)), arrive = easeOut(prog(ls, backAt, 700))
  const occ = ls < backAt ? 1 - leave : arrive
  const chair = () => {
    solidBox(ctx, a, o, SX + 0.35, SY + 0.35, 0.5, 0.5, 0.32, { z: 0.6, alpha: sb, accent: seatRed > 0, lit: seatRed > 0 ? 1.1 : 0.8 })
    solidBox(ctx, a, o, SX + 0.35, SY + 0.35, 0.5, 0.1, 0.62, { z: 0.92, alpha: sb, accent: seatRed > 0, lit: seatRed > 0 ? 1.0 : 0.7 })
  }
  chair()
  if (occ > 0.01) { ctx.save(); ctx.translate(0, -0.85 * u); man(ctx, a, o, SX + 0.6, SY + 0.62, { al: occ, h: 0.85 }); ctx.restore() }
  hangLamp(ctx, a, o, SX + 0.6, SY + 0.6, 5.0, 1.8, sb, Math.sin(ls * 0.0009) * 0.05)
  vignette(ctx, a, 0.8)
  // the nameplate over the seat, flipping
  const pn = prog(ls, c2 + 100, 500)
  if (pn > 0) {
    const ft = prog(ls, flipAt, 500), ft2 = prog(ls, backAt, 500)
    const label = ls < flipAt + 250 ? 'GRUPO FÁRMACOS' : ls < backAt + 250 ? '—' : nameOf(a, DC)
    const sy = Math.abs(Math.cos(Math.PI * (ft2 > 0 ? ft2 : ft)))
    const top = P(SX + 0.6, SY + 0.6, 2.2)
    const cx = tall ? W * 0.5 : Math.min(W * 0.8, top[0] + 150 * KF), cy = H * (tall ? 0.12 : 0.16) + bob(a, 3)
    ctx.save(); ctx.translate(0, cy); ctx.scale(1, Math.max(0.04, sy)); ctx.translate(0, -cy)
    const r = evCard(ctx, a, cx, cy, [
      { s: L(a, 'THE TOP SEAT', 'EL ASIENTO DE ARRIBA'), size: 9.5, color: dim(a, 0.95) },
      { s: label, size: tall ? 16 : 22, font: 'serif', color: seatRed > 0 && label !== '—' ? red(a, 0.97) : ink(a, 0.95) },
    ], { al: pn, accent: seatRed > 0, align: 'center', pad: 12 })
    ctx.restore()
    leader(ctx, a, top, [r.x + r.w * 0.5, cy + r.h * Math.max(0.04, sy)], pn, seatRed > 0)
  }
}

// ── 10 · END — the rulebook replaced three times; the four lines out of IMSS never slacken ─────
const end: SceneFn = (ctx, a) => {
  const { ls, W, H, KF } = a, tall = isTall(a), c1 = cue(a, 1)
  const u = tall ? Math.min(W * 0.07, H * 0.065) : Math.min(W * 0.046, H * 0.08)
  const o = cam(a, 0.5, tall ? 0.56 : 0.6, u, 0.06)
  const P = (x: number, y: number, z = 0) => isoPt(o, x, y, z)
  const b = easeOut(prog(ls, 0, 900))
  isoFloor(ctx, a, o, 12, 0.08 * b)
  // left: the lectern and three rulebooks, each laid over the last
  const LX = -5.6, LY = 1.2
  pool(ctx, a, o, LX + 0.6, LY + 0.5, 2.0, 0.2 * b)
  solidBox(ctx, a, o, LX, LY, 1.3, 1.0, 1.0 * b, { alpha: b, lit: 0.55 })
  const span = Math.max(1400, c1 - 400)
  for (let k = 0; k < 3; k++) {
    const p = prog(ls, 200 + (k * span) / 3, 500)
    if (p <= 0) continue
    const zz = 1.0 + k * 0.14 + (1 - easeIn(p)) * 1.4, newest = k === 2 || ls < 200 + ((k + 1) * span) / 3
    solidBox(ctx, a, o, LX + 0.18 + k * 0.05, LY + 0.12 - k * 0.04, 0.9, 0.7, 0.12, { z: zz, alpha: Math.min(1, p * 3), lit: newest ? 0.95 : 0.5 })
    const sp = P(LX + 0.63 + k * 0.05, LY + 0.82 - k * 0.04, zz + 0.06)
    text(ctx, ['I', 'II', 'III'][k], sp[0] - 4 * KF, sp[1] + 3 * KF, { size: 9 * KF, color: a.pal.bg, align: 'center', alpha: p, weight: 700 })
  }
  tagAt(ctx, a, P(LX + 0.65, LY + 1.0), L(a, 'THE RULES', 'LAS REGLAS'), tall ? 8.5 : 10, dim(a, 0.95), b, 22)
  // right: IMSS and the four depots, tied by four lines that stay taut
  const IX = 0.2, IY = -3.6
  pool(ctx, a, o, 2.6, -0.2, 4.2, 0.18 * b)
  solidBox(ctx, a, o, IX, IY, 2.6, 2.2, 2.2 * b, { alpha: b, lit: 0.6 })
  for (let f = 0; f < 3 && b > 0.6; f++) {
    const za = 0.4 + f * 0.6, zb = za + 0.24
    poly(ctx, [P(IX + 0.15, IY + 2.2, za), P(IX + 2.45, IY + 2.2, za), P(IX + 2.45, IY + 2.2, zb), P(IX + 0.15, IY + 2.2, zb)], ink(a, 0.4 + 0.1 * Math.sin(ls * 0.0015 + f)))
  }
  const dep: Pt[] = [[3.6, 0.6], [4.4, -1.6], [5.2, -3.8], [2.8, 2.8]]
  const taut = prog(ls, c1 + 200, 800)
  dep.forEach(([x, y], k) => {
    const from = P(IX + 2.6, IY + 1.1 + (k - 1.5) * 0.25, 1.0), to = P(x, y + 0.55, 0.5)
    const sag = (1 - easeOut(taut)) * u * 0.6 + Math.sin(ls * 0.002 + k) * u * 0.05 * (1 - taut)
    const mid: Pt = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2 + sag]
    ctx.strokeStyle = taut > 0 ? red(a, 0.35 + 0.55 * taut) : ink(a, 0.4); ctx.lineWidth = Math.max(1.2, KF * (1.2 + taut * 0.8))
    ctx.beginPath(); ctx.moveTo(from[0], from[1]); ctx.quadraticCurveTo(mid[0], mid[1], to[0], to[1]); ctx.stroke()
    // a carton travelling each line
    const t = (ls * 0.00035 + k * 0.27) % 1, q: Pt = [lerp(lerp(from[0], mid[0], t), lerp(mid[0], to[0], t), t), lerp(lerp(from[1], mid[1], t), lerp(mid[1], to[1], t), t)]
    ctx.fillStyle = taut > 0 ? red(a, 0.9) : ink(a, 0.8); ctx.fillRect(q[0] - 3 * KF, q[1] - 3 * KF, 6 * KF, 6 * KF)
  })
  dep.slice().sort((p, q) => p[0] + p[1] - (q[0] + q[1])).forEach(([x, y]) => depot(ctx, a, o, x - 0.6, y - 0.6, 1.2, 1.15, 0.9 * b, { alpha: b, door: 0.65, lit: 0.5 }))
  tagAt(ctx, a, P(IX + 1.3, IY + 2.2), 'IMSS', tall ? 10 : 12, ink(a, 0.9), b, 18)
  hangLamp(ctx, a, o, 2.4, -0.6, 6.4, 5.0, b * 0.8, Math.sin(ls * 0.0008) * 0.05)
  vignette(ctx, a, 0.82)
  // the two halves of the sentence, as two short plates
  const p0 = prog(ls, 400, 600), p1 = prog(ls, c1 + 300, 600)
  evCard(ctx, a, tall ? W * 0.05 : W * 0.06, H * (tall ? 0.11 : 0.14) + bob(a, 1), [
    { s: L(a, 'THE RULES', 'LAS REGLAS'), size: 9.5, color: dim(a, 0.95) },
    { s: L(a, 'changed three times', 'cambiaron tres veces'), size: tall ? 16 : 24, font: 'serif', color: ink(a, 0.95) },
  ], { al: p0, pad: 12 })
  if (p1 > 0) evCard(ctx, a, tall ? W * 0.95 : W * 0.94, H * (tall ? 0.11 : 0.14) + bob(a, 2), [
    { s: L(a, 'THE DEPENDENCE', 'LA DEPENDENCIA'), size: 9.5, color: dim(a, 0.95) },
    { s: L(a, 'did not', 'no'), size: tall ? 16 : 24, font: 'serif', color: red(a, 0.97) },
  ], { al: p1, accent: true, align: 'right', pad: 12 })
}

export const scenes: Record<string, SceneFn> = { peak, four, customer, lattice, hedge, race, cliff, quiet, return: ret, three, end }
