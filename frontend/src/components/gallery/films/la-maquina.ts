/**
 * «Hasta dónde ve la máquina» — RUBLI's four machines, told as one long workshop at night
 * (the Fern direction: miniature dioramas under one light). One draw function per shot, keyed
 * by the beat's `scene` in story-films.json; see filmKit.ts for the contract. Recurring image:
 * THE FOUR BENCHES — they light up one by one in shot 0 and go dark in shot 11, when a person
 * at a desk takes over. Red is only ever the thing the sentence is about: the tax ID that binds,
 * the joins that break, the part not covered, the price lifted, the limits of machine four.
 */
import { type Iso, type Pt, type SceneArgs, type SceneFn, L, clamp01, cue, dim, easeBack, easeIn, easeInOut, easeOut, figure, flow, ink, isoBox, isoFloor, isoPt, lamp, lerp, pool, prog, red, rnd, stamp, text, trace } from '@/components/gallery/filmKit'

type C = CanvasRenderingContext2D
const TAU = Math.PI * 2
const isTall = (a: SceneArgs) => a.H > a.W * 0.9
const SERIF = '"Playfair Display", Georgia, serif'
const MONO = '"JetBrains Mono", ui-monospace, monospace'
const fmt = (n: number, a: SceneArgs) => n.toLocaleString(a.lang === 'es' ? 'es-MX' : 'en-US')

// ── small kit extensions ────────────────────────────────────────────────────────────────────

function poly(ctx: C, pts: Pt[], fill?: string, stroke?: string, lw = 1) {
  ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath()
  if (fill) { ctx.fillStyle = fill; ctx.fill() }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke() }
}

/** Draw in the plane of a wall: x runs along the wall (o.u px = one world unit), y runs down. */
function onFace(ctx: C, at: Pt, dir: 'x' | 'y', draw: () => void) {
  ctx.save(); ctx.translate(at[0], at[1]); ctx.transform(0.866, dir === 'x' ? 0.5 : -0.5, 0, 1, 0, 0); draw(); ctx.restore()
}

/** Draw in the floor / table-top plane: local x = world x, local y = world y (o.u px = one unit). */
function onTop(ctx: C, at: Pt, draw: () => void) {
  ctx.save(); ctx.translate(at[0], at[1]); ctx.transform(0.866, 0.5, -0.866, 0.5, 0, 0); draw(); ctx.restore()
}

function measure(ctx: C, s: string, size: number, font: 'serif' | 'mono', weight?: number) {
  ctx.save(); ctx.font = `${weight ?? (font === 'mono' ? 500 : 600)} ${size}px ${font === 'mono' ? MONO : SERIF}`
  ;(ctx as C & { letterSpacing: string }).letterSpacing = font === 'mono' ? `${size * 0.12}px` : '0px'
  const w = ctx.measureText(s).width; ctx.restore(); return w
}

/** Shrink a bold mono label so it fits maxW (labels painted onto set pieces). */
const fit = (ctx: C, s: string, size: number, maxW: number) => { const w = measure(ctx, s, size, 'mono', 700); return w > maxW ? size * (maxW / w) : size }

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

/** Slow camera: world origin pans across the shot. */
function cam(a: SceneArgs, cx: number, cy: number, u: number, panX: number, panY = 0): Iso {
  const t = easeInOut(clamp01(a.ls / a.dur)) - 0.5
  return { ox: a.W * cx - t * panX * a.W, oy: a.H * cy - t * panY * a.H, u }
}

const bob = (a: SceneArgs, seed: number) => Math.sin(a.ls * 0.0013 + seed * 1.9) * 2.6 * a.KF

interface Line { s: string; size: number; font?: 'serif' | 'mono'; color: string; weight?: number }
interface Card { x: number; y: number; w: number; h: number; base: number[]; pad: number }
/** A floating evidence card. (x, y) is the top-left (left), top-right (right) or top-centre (center). Returns each line's baseline. */
function evCard(ctx: C, a: SceneArgs, x: number, y: number, lines: Line[], s: { al?: number; accent?: boolean; align?: 'left' | 'right' | 'center'; pad?: number } = {}): Card {
  const KF = a.KF, pad = (s.pad ?? 12) * KF, al = s.al ?? 1
  let w = 0, h = 0
  const lhs = lines.map((l) => { const sz = l.size * KF, f = l.font ?? 'mono'; w = Math.max(w, measure(ctx, l.s, sz, f, l.weight)); const lh = sz * (f === 'mono' ? 1.55 : 1.12); h += lh; return lh })
  w += pad * 2; h += pad * 1.6
  let bx = s.align === 'right' ? x - w : s.align === 'center' ? x - w / 2 : x
  bx = Math.max(a.W * 0.025, Math.min(a.W * 0.975 - w, bx))
  const base: number[] = []
  let ly = y + pad * 0.8
  lines.forEach((l, i) => { const f = l.font ?? 'mono'; ly += lhs[i] * (f === 'mono' ? 0.72 : 0.86); base.push(ly); ly += lhs[i] * (f === 'mono' ? 0.28 : 0.14) })
  const r = { x: bx, y, w, h, base, pad }
  if (al <= 0.01) return r
  ctx.save(); ctx.globalAlpha *= clamp01(al)
  ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(bx + 5 * KF, y + 7 * KF, w, h)
  ctx.fillStyle = a.pal.bg; ctx.fillRect(bx, y, w, h)
  ctx.fillStyle = s.accent ? red(a, 0.07) : ink(a, 0.05); ctx.fillRect(bx, y, w, h)
  ctx.strokeStyle = s.accent ? red(a, 0.85) : ink(a, 0.45); ctx.lineWidth = Math.max(1, 1.1 * KF); ctx.strokeRect(bx, y, w, h)
  lines.forEach((l, i) => {
    const sz = l.size * KF, f = l.font ?? 'mono'
    text(ctx, l.s, bx + pad, base[i], { size: sz, font: f, color: l.color, weight: l.weight, tracking: f === 'mono' ? sz * 0.12 : undefined })
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

/** An opaque isoBox (silhouette filled with the ground first). */
function solidBox(ctx: C, a: SceneArgs, o: Iso, x: number, y: number, w: number, d: number, h: number, s: { alpha?: number; accent?: boolean; z?: number; lit?: number } = {}) {
  const al = s.alpha ?? 1, z = s.z ?? 0
  if (al <= 0.01 || h <= 0) return
  const P = (px: number, py: number, pz: number) => isoPt(o, px, py, pz)
  ctx.save(); ctx.globalAlpha *= al
  poly(ctx, [P(x, y, z + h), P(x + w, y, z + h), P(x + w, y, z), P(x + w, y + d, z), P(x, y + d, z), P(x, y + d, z + h)], a.pal.bg)
  ctx.restore()
  isoBox(ctx, a, o, x, y, w, d, h, s)
}

/** A flat quad lying at height z (a sheet of paper, a tray floor). */
function flat(ctx: C, o: Iso, x: number, y: number, w: number, d: number, z: number, fill?: string, stroke?: string, lw = 1) {
  poly(ctx, [isoPt(o, x, y, z), isoPt(o, x + w, y, z), isoPt(o, x + w, y + d, z), isoPt(o, x, y + d, z)], fill, stroke, lw)
}

/** A sheet lying flat, with typed lines. */
function sheet(ctx: C, a: SceneArgs, o: Iso, x: number, y: number, w: number, d: number, z: number, al: number, seed: number, accent = false) {
  if (al <= 0.01) return
  flat(ctx, o, x, y, w, d, z, accent ? red(a, 0.55 * al) : ink(a, 0.62 * al), accent ? red(a, 0.95 * al) : ink(a, 0.85 * al))
  ctx.strokeStyle = accent ? `rgba(0,0,0,${0.45 * al})` : `rgba(0,0,0,${0.4 * al})`; ctx.lineWidth = Math.max(1, o.u * 0.03)
  ctx.beginPath()
  for (let i = 0; i < 5; i++) {
    const yy = y + d * (0.2 + i * 0.14), len = w * (0.45 + 0.35 * rnd(seed * 7 + i))
    const p = isoPt(o, x + w * 0.15, yy, z), q = isoPt(o, x + w * 0.15 + len, yy, z)
    ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1])
  }
  ctx.stroke()
}

/** A miniature person with a contact shadow. */
function person(ctx: C, a: SceneArgs, o: Iso, x: number, y: number, s: { al?: number; accent?: boolean; h?: number; lift?: number } = {}) {
  const al = s.al ?? 1
  if (al <= 0.01) return
  const f = isoPt(o, x, y), hh = (s.h ?? 0.9) * o.u, w = hh * 0.3
  ctx.fillStyle = `rgba(0,0,0,${0.55 * al})`; ctx.beginPath(); ctx.ellipse(f[0], f[1], w * 0.9, w * 0.38, 0, 0, TAU); ctx.fill()
  ctx.save(); ctx.translate(0, -(s.lift ?? 0) * o.u)
  figure(ctx, a, o, x, y, { alpha: al, accent: s.accent, h: s.h })
  ctx.restore()
}

/** A workbench: four legs and a thick top. */
function bench(ctx: C, a: SceneArgs, o: Iso, x: number, y: number, w: number, d: number, h: number, s: { al?: number; lit?: number } = {}) {
  const al = s.al ?? 1, lit = s.lit ?? 0.6, lg = 0.12
  if (al <= 0.01) return
  const legs: [number, number][] = [[x + 0.1, y + 0.1], [x + w - 0.1 - lg, y + 0.1], [x + 0.1, y + d - 0.1 - lg], [x + w - 0.1 - lg, y + d - 0.1 - lg]]
  for (const [lx, ly] of legs) isoBox(ctx, a, o, lx, ly, lg, lg, h - 0.14, { alpha: al, lit: lit * 0.6 })
  solidBox(ctx, a, o, x, y, w, d, 0.14, { z: h - 0.14, alpha: al, lit })
}

/** A dial: a ring with a needle, drawn in the current (face) plane. */
function dial(ctx: C, a: SceneArgs, x: number, y: number, r: number, ang: number, s: { al?: number; accent?: boolean; on?: number } = {}) {
  const al = s.al ?? 1, on = s.on ?? 1
  if (al <= 0.01) return
  ctx.fillStyle = s.accent ? red(a, 0.25 * al) : ink(a, (0.05 + 0.12 * on) * al)
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill()
  ctx.strokeStyle = s.accent ? red(a, 0.95 * al) : ink(a, (0.3 + 0.5 * on) * al); ctx.lineWidth = Math.max(1, r * 0.14); ctx.stroke()
  ctx.strokeStyle = s.accent ? red(a, al) : ink(a, (0.35 + 0.6 * on) * al); ctx.lineWidth = Math.max(1, r * 0.12)
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(ang) * r * 0.8, y + Math.sin(ang) * r * 0.8); ctx.stroke()
}

/** Text with coloured runs, left-aligned at x. */
function spans(ctx: C, parts: [string, string][], x: number, y: number, size: number, font: 'serif' | 'mono') {
  let cx = x
  for (const [s, col] of parts) { text(ctx, s, cx, y, { size, font, color: col, tracking: font === 'mono' ? size * 0.12 : undefined }); cx += measure(ctx, s, size, font) }
}

/** The four machines in miniature, one per bench (shots 0 and 11). */
function miniMachine(ctx: C, a: SceneArgs, o: Iso, k: number, cx: number, cy: number, z: number, al: number, lit: number) {
  if (al <= 0.01) return
  const st = { alpha: al, lit, z }
  if (k === 0) { // names: a hopper and two rollers
    solidBox(ctx, a, o, cx - 0.6, cy - 0.35, 0.45, 0.7, 0.75, st)
    solidBox(ctx, a, o, cx + 0.05, cy - 0.5, 0.35, 1.0, 0.16, { ...st, z: z + 0.12 })
    solidBox(ctx, a, o, cx + 0.05, cy - 0.5, 0.35, 1.0, 0.16, { ...st, z: z + 0.34 })
  } else if (k === 1) { // categories: a pigeonhole wall
    solidBox(ctx, a, o, cx - 0.65, cy - 0.3, 1.3, 0.35, 1.05, st)
    onFace(ctx, isoPt(o, cx - 0.65, cy + 0.05, z + 1.05), 'x', () => {
      ctx.strokeStyle = `rgba(0,0,0,${0.6 * al})`; ctx.lineWidth = 1; ctx.beginPath()
      for (let i = 1; i < 6; i++) { ctx.moveTo((i * 1.3 * o.u) / 6, 0); ctx.lineTo((i * 1.3 * o.u) / 6, 1.05 * o.u) }
      for (let j = 1; j < 4; j++) { ctx.moveTo(0, (j * 1.05 * o.u) / 4); ctx.lineTo(1.3 * o.u, (j * 1.05 * o.u) / 4) }
      ctx.stroke()
    })
  } else if (k === 2) { // scans: a post, an arm and a lens
    solidBox(ctx, a, o, cx - 0.55, cy - 0.45, 0.14, 0.14, 1.35, st)
    solidBox(ctx, a, o, cx - 0.55, cy - 0.45, 0.6, 0.14, 0.1, { ...st, z: z + 1.25 })
    const l = isoPt(o, cx, cy - 0.38, z + 1.05)
    ctx.strokeStyle = ink(a, 0.85 * al * lit); ctx.lineWidth = Math.max(1, o.u * 0.06)
    ctx.beginPath(); ctx.ellipse(l[0], l[1], o.u * 0.34, o.u * 0.2, 0, 0, TAU); ctx.stroke()
    sheet(ctx, a, o, cx - 0.35, cy - 0.2, 0.6, 0.45, z + 0.01, al * lit, 3)
  } else { // resemblance: a cabinet of dials
    solidBox(ctx, a, o, cx - 0.55, cy - 0.4, 1.1, 0.6, 1.25, st)
    onFace(ctx, isoPt(o, cx - 0.55, cy + 0.2, z + 1.25), 'x', () => {
      for (let i = 0; i < 6; i++) dial(ctx, a, ((i % 3) + 0.5) * (1.1 * o.u) / 3, (Math.floor(i / 3) + 0.6) * 0.42 * o.u, o.u * 0.12, -1.2 + Math.sin(a.ls * 0.002 + i) * 0.5 * lit, { al, on: lit })
    })
  }
}

// ── 0 · THE PILE — a mountain of sheets; four benches behind it light up ─────────────────────
const BENCHES = (tall: boolean) => { const back = tall ? -5.2 : -3.9, k = tall ? 0.78 : 1; return [-4.5, -1.5, 1.5, 4.5].map((s) => [back + s * k, back - s * k] as Pt) }

const pile: SceneFn = (ctx, a) => {
  const { ls, W, H, KF } = a
  const tall = isTall(a), c1 = cue(a, 1), c2 = cue(a, 2), c3 = cue(a, 3)
  const u = tall ? W * 0.058 : Math.min(W * 0.052, H * 0.083)
  const o = cam(a, tall ? 0.5 : 0.56, tall ? 0.63 : 0.65, u, 0.05, -0.03)
  const P = (x: number, y: number, z = 0) => isoPt(o, x, y, z)
  const grow = easeOut(prog(ls, 0, 2400))
  isoFloor(ctx, a, o, 13, 0.1)
  // the benches behind, unlit until the machines are named
  BENCHES(tall).forEach(([bx, by], k) => {
    const al = prog(ls, c2 + k * 160, 700), on = easeOut(prog(ls, c3 + k * 280, 380))
    if (al <= 0) return
    pool(ctx, a, o, bx, by, 1.9, 0.26 * on)
    const top = P(bx, by, 4.6), fl = P(bx, by, 0.9)
    lamp(ctx, a, top[0], top[1], fl[1], u * 1.1, 0.13 * on)
    bench(ctx, a, o, bx - 0.85, by - 0.85, 1.7, 1.7, 0.9, { al: 0.5 + 0.5 * al, lit: 0.2 + 0.6 * on })
    miniMachine(ctx, a, o, k, bx, by, 0.9, 0.5 + 0.5 * al, 0.25 + 0.75 * on)
    const n = tall ? P(bx + 0.95, by + 0.95, -0.45) : P(bx - 0.95, by + 0.95, 1.25) // beside the bench (under it on a phone), clear of the tag
    text(ctx, ['I', 'II', 'III', 'IV'][k], n[0], n[1] + bob(a, k) * 0.6, { size: (tall ? 16 : 22) * KF, color: ink(a, 0.95), align: tall ? 'center' : 'right', alpha: on })
  })
  // the mountain of contract sheets: columns of stacked paper, back to front
  const N = 5, step = 0.7
  ctx.lineWidth = 1
  for (let sd = -2 * N; sd <= 2 * N; sd++) for (let i = -N; i <= N; i++) {
    const j = sd - i
    if (j < -N || j > N) continue
    const x = i * step, y = j * step, r = Math.hypot(x, y)
    if (r > 3.75) continue
    const hgt = (3.6 * Math.pow(1 - r / 3.8, 1.15) + 0.2 + 0.25 * rnd(i * 31 + j * 7)) * clamp01(grow * 1.5 - (1 - r / 3.75) * 0.5)
    if (hgt <= 0.02) continue
    const bx = x - step / 2, by = y - step / 2, w = step * 0.97
    solidBox(ctx, a, o, bx, by, w, w, hgt, { lit: 0.55 + 0.3 * rnd(i * 5 + j * 17) })
    ctx.strokeStyle = 'rgba(0,0,0,0.38)'; ctx.beginPath()
    for (let z = 0.13; z < hgt - 0.05 && z < 4; z += 0.17) {
      let p = P(bx, by + w, z), q = P(bx + w, by + w, z); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1])
      p = P(bx + w, by, z); q = P(bx + w, by + w, z); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1])
    }
    ctx.stroke()
  }
  // sheets still drifting down onto it
  for (let i = 0; i < 8; i++) {
    const ph = ls * 0.00024 + i / 8, t = ph % 1
    const sx = (rnd(i * 3 + Math.floor(ph) * 11) - 0.5) * 3.6, sy = (rnd(i * 3 + 2 + Math.floor(ph) * 5) - 0.5) * 3.6
    const top = 3.6 * Math.max(0, 1 - Math.hypot(sx, sy) / 3.8) + 0.45
    const z = lerp(top + 2.6, top, easeIn(t) * 0.3 + t * 0.7), wob = Math.sin(ls * 0.003 + i * 2) * 0.35 * (1 - t)
    sheet(ctx, a, o, sx + wob - 0.25, sy - 0.18, 0.5, 0.36, z, Math.sin(Math.PI * t) * grow * 0.9, i)
  }
  // nobody can read them all: one reader at the foot, one page in hand
  const rd = prog(ls, c1, 600)
  if (rd > 0) {
    const rx = tall ? 3.0 : 3.5, ry = tall ? -0.4 : -1.3
    pool(ctx, a, o, rx, ry, 1.1, 0.22 * rd)
    person(ctx, a, o, rx, ry, { al: rd })
    const f = P(rx, ry, 0.62)
    ctx.fillStyle = red(a, 0.95 * rd); ctx.fillRect(f[0] - u * 0.34, f[1] - u * 0.06 + Math.sin(ls * 0.002) * u * 0.02, u * 0.22, u * 0.28)
  }
  vignette(ctx, a, 0.8)
  // the figure, on the first words
  const p0 = prog(ls, 250, 600)
  const r = evCard(ctx, a, tall ? W * 0.5 : W * 0.03, tall ? H * 0.11 : H * 0.36 + bob(a, 1), [
    { s: L(a, '3 MILLION', '3 MILLONES'), size: tall ? 30 : 44, font: 'serif', color: ink(a, 0.97) },
    { s: L(a, 'CONTRACTS IN THE RECORD', 'CONTRATOS EN EL REGISTRO'), size: 10.5, color: dim(a, 0.95) },
  ], { al: p0, align: tall ? 'center' : 'left', pad: 14 })
  if (!tall) leader(ctx, a, P(-2.2, 0.9, 1.0), [r.x + r.w, r.y + r.h * 0.5], p0)
}

// ── 1 · MACHINE ONE · NAMES — spellings in, cards stapled by tax ID out ──────────────────────
const SPELL = ['EMPRESA X, S.A. DE C.V.', 'EMPRESA X SA DE CV', 'EMP. X S.A. DE C.V.', 'EMPRESA "X", S.A.', 'EMPRESA X S A DE C V']

const names: SceneFn = (ctx, a) => {
  const { ls, W, H, KF } = a
  const tall = isTall(a), c1 = cue(a, 1), c2 = cue(a, 2)
  const u = tall ? W * 0.066 : Math.min(W * 0.062, H * 0.1)
  const o = cam(a, tall ? 0.46 : 0.55, tall ? 0.56 : 0.54, u, 0.05)
  const P = (x: number, y: number, z = 0) => isoPt(o, x, y, z)
  const b = easeOut(prog(ls, 0, 1400)), T = 1.0
  isoFloor(ctx, a, o, 11, 0.1 * b)
  pool(ctx, a, o, 0, 0, 5.2, 0.2 * b)
  bench(ctx, a, o, -3.5, -0.8, 7, 1.6, T * b + 0.01, { lit: 0.6 })
  if (b < 0.6) return
  // hopper, with cards sticking out of its mouth
  solidBox(ctx, a, o, -3.3, -0.6, 1.1, 1.2, 1.2, { z: T, lit: 0.55 })
  flat(ctx, o, -3.2, -0.5, 0.9, 1.0, T + 1.2, 'rgba(0,0,0,0.75)')
  for (let i = 0; i < 4; i++) {
    const lift = 0.12 + 0.1 * Math.sin(ls * 0.003 + i * 1.7)
    isoBox(ctx, a, o, -3.1 + i * 0.2, -0.45 + rnd(i) * 0.3, 0.05, 0.5, 0.25 + lift, { z: T + 1.0, lit: 1.1 })
  }
  // loose cards, misaligned, on their way to the rollers
  for (let i = 0; i < 6; i++) {
    const t = (ls * 0.00035 + i / 6) % 1, cyc = Math.floor(ls * 0.00035 + i / 6)
    const x = lerp(-2.2, -0.75, t), y = -0.35 + (rnd(i * 7 + cyc * 3) - 0.5) * 0.7
    sheet(ctx, a, o, x, y, 0.42, 0.5, T + 0.01, Math.sin(Math.PI * t) * 0.95 + 0.05, i + cyc)
  }
  // rollers between two posts; stripes turn
  for (const py of [-0.72, 0.58]) solidBox(ctx, a, o, -0.38, py, 0.14, 0.14, 0.9, { z: T, lit: 0.5 })
  for (const rz of [T + 0.08, T + 0.34]) {
    solidBox(ctx, a, o, -0.45, -0.58, 0.3, 1.16, 0.2, { z: rz, lit: 0.85 })
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1; ctx.beginPath()
    for (let j = 0; j < 3; j++) { const zz = rz + ((ls * 0.0018 + j / 3) % 1) * 0.2, p = P(-0.15, -0.58, zz), q = P(-0.15, 0.58, zz); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]) }
    ctx.stroke()
  }
  // aligned stack waiting for the staple
  const cyc = 1500, ph = (ls % cyc) / cyc
  const stackH = 0.04 + 0.22 * ph
  isoBox(ctx, a, o, 0.25, -0.25, 0.45, 0.5, stackH, { z: T, lit: 1.05 })
  // the stapler: a post, an arm, a head that strikes once per bundle
  solidBox(ctx, a, o, 0.35, -0.85, 0.14, 0.14, 1.5, { z: T, lit: 0.5 })
  solidBox(ctx, a, o, 0.35, -0.85, 0.14, 0.75, 0.12, { z: T + 1.4, lit: 0.6 })
  const strike = ph > 0.86 ? Math.sin(((ph - 0.86) / 0.14) * Math.PI) : 0
  solidBox(ctx, a, o, 0.25, -0.2, 0.45, 0.4, 0.22, { z: T + 1.0 - 0.7 * strike + stackH * 0, lit: 0.75 })
  if (strike > 0.3) { const sp = P(0.47, 0, T + stackH + 0.05); glow(ctx, sp[0], sp[1], u * 0.8, red(a, 0.35 * strike), red(a, 0)) }
  // the output tray: bundles, each bound by one red clip (the tax ID)
  solidBox(ctx, a, o, 1.6, -0.65, 1.8, 1.3, 0.08, { z: T, lit: 0.45 })
  const nB = Math.min(6, Math.floor(Math.max(0, ls - 900) / cyc))
  for (let k = 0; k < 6; k++) {
    const bx = 1.7 + (k % 3) * 0.55, by = -0.55 + Math.floor(k / 3) * 0.62
    const al = k < nB ? 1 : k === nB ? 0 : 0
    if (al <= 0) continue
    isoBox(ctx, a, o, bx, by, 0.42, 0.5, 0.22, { z: T + 0.08, lit: 1 })
    isoBox(ctx, a, o, bx + 0.16, by - 0.02, 0.1, 0.54, 0.05, { z: T + 0.3, accent: true, lit: 1.3 })
  }
  // an operator feeding the hopper
  person(ctx, a, o, -2.7, 1.45, { lift: 0.02 * Math.abs(Math.sin(ls * 0.004)) })
  vignette(ctx, a, 0.78)

  // sentence 1: the spellings, fed in one by one
  const hop = P(-2.75, 0, T + 1.3)
  const fadeS = 1 - prog(ls, c2 + 200, 600)
  const nS = tall ? 4 : 5
  for (let i = 0; i < nS; i++) {
    const p = prog(ls, c1 + 150 + i * 380, 450) * fadeS
    if (p <= 0) continue
    const sz = tall ? 10 : 12
    const x = tall ? W * 0.97 : W * 0.04, y = H * (tall ? 0.11 : 0.12) + i * (tall ? 27 : 38) * KF + bob(a, i) * 0.5
    const r = evCard(ctx, a, x, y, [{ s: SPELL[i], size: sz, color: ink(a, 0.92) }], { al: p, align: tall ? 'right' : 'left', pad: 9 })
    leader(ctx, a, hop, tall ? [r.x, r.y + r.h / 2] : [r.x + r.w, r.y + r.h / 2], p * 0.8)
  }
  // sentence 2: the bundle card and the count
  const pb = prog(ls, c2 + 300, 600) * (tall ? 1 - prog(ls, c2 + (a.dur - c2) * 0.5, 400) : 1) // on a phone the count takes this corner
  if (pb > 0) {
    const tr = P(2.5, 0.6, T + 0.4)
    const x = tall ? W * 0.97 : W * 0.97, y = tall ? H * 0.12 : H * 0.44 + bob(a, 7)
    const r = evCard(ctx, a, x, y, [
      { s: 'RFC  ____________', size: tall ? 11 : 13, color: 'rgba(0,0,0,0)', weight: 700 },
      { s: L(a, 'ONE TAX ID · ONE FIRM', 'UN RFC · UNA EMPRESA'), size: 10.5, color: ink(a, 0.85) },
    ], { al: pb, accent: true, align: 'right', pad: 12 })
    ctx.save(); ctx.globalAlpha *= pb
    const sz = (tall ? 11 : 13) * KF
    text(ctx, 'RFC', r.x + r.pad, r.base[0], { size: sz, font: 'mono', weight: 700, color: red(a, 0.95), tracking: sz * 0.12 })
    const bx0 = r.x + r.pad + measure(ctx, 'RFC  ', sz, 'mono', 700)
    ctx.fillStyle = red(a, 0.85); ctx.fillRect(bx0, r.base[0] - sz * 0.8, (r.x + r.w - r.pad - bx0) * easeOut(prog(ls, c2 + 500, 700)), sz * 0.9)
    ctx.restore()
    leader(ctx, a, tr, [r.x + (tall ? r.w * 0.3 : 0), tall ? r.y + r.h : r.y + r.h / 2], pb, true)
  }
  const tail = a.dur - c2, tA = c2 + tail * 0.5, tB = c2 + tail * 0.76
  const pc = prog(ls, tA, 500)
  if (pc > 0) {
    const big = tall ? 25 : 40
    const r = evCard(ctx, a, tall ? W * 0.5 : W * 0.04, tall ? H * 0.11 : H * 0.12 + bob(a, 3), [
      { s: L(a, 'FIRMS IDENTIFIED WITH CONFIDENCE', 'EMPRESAS IDENTIFICADAS CON CERTEZA'), size: 10.5, color: dim(a, 0.95) },
      { s: '44,000 → ≈ 100,000', size: big, font: 'serif', color: 'rgba(0,0,0,0)' },
    ], { al: pc, align: tall ? 'center' : 'left', pad: 16 })
    ctx.save(); ctx.globalAlpha *= pc
    const k = prog(ls, tB, 400)
    const tail2 = ` → ≈ ${fmt(100000, a)}`
    spans(ctx, [[fmt(44000, a), dim(a, 0.95)], [tail2, ink(a, 0.97 * k)]], r.x + r.pad, r.base[1], big * KF, 'serif')
    ctx.restore()
  }
}

// ── 2 · THE SHORTCUT — a crude press joins look-alikes; most joins crack ─────────────────────
const NA = 'CONSTRUDOMUS', NB = 'CONSTRUDAMUS', KD = 8
const HOLDS = [2, 5, 8] // three of ten joins hold — inside the 19–43 in 100 the voice gives

const fuzzy: SceneFn = (ctx, a) => {
  const { ls, W, H, KF } = a
  const tall = isTall(a), c1 = cue(a, 1), c2 = cue(a, 2)
  const u = tall ? W * 0.066 : Math.min(W * 0.06, H * 0.096)
  const o = cam(a, tall ? 0.56 : 0.62, tall ? 0.6 : 0.57, u, 0.05)
  const P = (x: number, y: number, z = 0) => isoPt(o, x, y, z)
  const b = easeOut(prog(ls, 0, 1300)), T = 0.8
  isoFloor(ctx, a, o, 11, 0.1 * b)
  pool(ctx, a, o, 0, -0.5, 5.5, 0.19 * b)
  // the press at the far end: crude frame, a hammer that keeps pounding
  solidBox(ctx, a, o, -0.9, -4.8, 0.2, 0.2, 1.8, { alpha: b, lit: 0.5 })
  solidBox(ctx, a, o, 0.7, -4.8, 0.2, 0.2, 1.8, { alpha: b, lit: 0.5 })
  solidBox(ctx, a, o, -0.9, -4.8, 1.8, 0.2, 0.22, { z: 1.62, alpha: b, lit: 0.6 })
  const hit = Math.pow(Math.abs(Math.sin(ls * 0.0032)), 6)
  solidBox(ctx, a, o, -0.55, -4.75, 1.1, 0.5, 0.3, { z: 0.9 + 0.4 * (1 - hit), alpha: b, lit: 0.75 })
  solidBox(ctx, a, o, -0.8, -4.9, 1.6, 0.9, 0.8, { alpha: b, lit: 0.45 })
  // the rack the joins come out onto
  bench(ctx, a, o, -0.75, -3.5, 1.5, 6.8, T * b + 0.01, { lit: 0.55 })
  for (let i = 0; i < 10; i++) {
    const slot = -3.0 + i * 0.64, outAt = 300 + (9 - i) * Math.max(120, (c1 - 500) / 10)
    const e = easeOut(prog(ls, outAt, 650))
    if (e <= 0) continue
    const y = lerp(-4.3, slot, e), holds = HOLDS.includes(i)
    const order = [0, 1, 3, 4, 6, 7, 9].indexOf(i)
    const br = holds ? 0 : easeBack(prog(ls, c1 - 300 + order * 170, 420))
    const sep = 0.22 * br
    solidBox(ctx, a, o, -0.55 - sep, y, 0.42, 0.5, 0.45, { z: T, lit: 0.85 })
    solidBox(ctx, a, o, 0.05 + sep, y, 0.42, 0.5, 0.45, { z: T, lit: 0.85 })
    if (br <= 0.02) isoBox(ctx, a, o, -0.3, y + 0.18, 0.6, 0.14, 0.06, { z: T + 0.45, lit: 1.2 })
    else {
      isoBox(ctx, a, o, -0.3 - sep, y + 0.18, 0.28, 0.14, 0.06, { z: T + 0.45 - 0.05 * br, accent: true, lit: 1.2 })
      isoBox(ctx, a, o, 0.02 + sep, y + 0.18, 0.28, 0.14, 0.06, { z: T + 0.45 - 0.05 * br, accent: true, lit: 1.2 })
      const g = P(0, y + 0.25, T + 0.3); glow(ctx, g[0], g[1], u * 0.6, red(a, 0.28 * Math.min(1, br)), red(a, 0))
    }
  }
  vignette(ctx, a, 0.8)
  // the two look-alike names, joined, then two firms
  const pn = prog(ls, 500, 600), sep = easeInOut(prog(ls, c2 + 400, 1000))
  if (pn > 0) {
    const sz = tall ? 22 : 32, x0 = tall ? W * 0.06 : W * 0.05, y0 = H * (tall ? 0.11 : 0.13)
    const lines = (n: string): Line[] => [{ s: n, size: sz, font: 'serif', color: 'rgba(0,0,0,0)' }]
    const rA = evCard(ctx, a, x0, y0 + bob(a, 1), lines(NA), { al: pn, pad: 12 })
    const rB = evCard(ctx, a, x0 + sep * (tall ? 20 : 70) * KF, rA.y + rA.h + lerp(6, 34, sep) * KF + bob(a, 2) * sep, lines(NB), { al: pn, pad: 12 })
    for (const [r, n] of [[rA, NA], [rB, NB]] as const) {
      ctx.save(); ctx.globalAlpha *= pn
      spans(ctx, [[n.slice(0, KD), ink(a, 0.96)], [n[KD], prog(ls, c2, 400) > 0 ? red(a, 0.97) : ink(a, 0.96)], [n.slice(KD + 1), ink(a, 0.96)]], r.x + r.pad, r.base[0], sz * KF, 'serif')
      ctx.restore()
    }
    // the bracket the shortcut puts between them, until it snaps
    const bx = Math.max(rA.x + rA.w, rB.x + rB.w) + 10 * KF, ya = rA.y + rA.h / 2, yb = rB.y + rB.h / 2
    const snap = sep
    ctx.strokeStyle = snap > 0 ? red(a, 0.85 * pn) : ink(a, 0.7 * pn); ctx.lineWidth = Math.max(1.5, 2 * KF)
    ctx.beginPath(); ctx.moveTo(bx - 6 * KF, ya); ctx.lineTo(bx, ya); ctx.lineTo(bx, lerp(yb, (ya + yb) / 2 - 6 * KF, snap) - (snap > 0 ? 0 : 0)); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(bx - 6 * KF, yb); ctx.lineTo(bx, yb); ctx.lineTo(bx + snap * 8 * KF, lerp(ya, (ya + yb) / 2 + 6 * KF, snap)); ctx.stroke()
    const lab = snap > 0.5 ? L(a, 'TWO FIRMS', 'DOS EMPRESAS') : L(a, '= ONE FIRM?', '= ¿UNA EMPRESA?')
    mono(ctx, a, lab, bx + 12 * KF, (ya + yb) / 2 + 4 * KF, 11, snap > 0.5 ? ink(a, 0.95 * pn) : dim(a, 0.95 * pn), { weight: 700 })
  }
  // the verdict on the shortcut
  const ps = prog(ls, c1 + (c2 - c1) * 0.45, 450)
  stamp(ctx, a, L(a, 'RIGHT 19–43 / 100', 'ACIERTA 19–43 / 100'), tall ? W * 0.5 : W * 0.76, H * (tall ? 0.66 : 0.62), { size: (tall ? 14 : 22) * KF, p: ps, rot: -0.06 })
}

// ── 3 · MACHINE TWO · CATEGORIES — slips flying into a wall of 72 pigeonholes ────────────────
const sort: SceneFn = (ctx, a) => {
  const { ls, W, H, KF } = a
  const tall = isTall(a), c1 = cue(a, 1), c2 = cue(a, 2)
  const u = tall ? W * 0.058 : Math.min(W * 0.047, H * 0.083)
  const o = cam(a, tall ? 0.4 : 0.42, tall ? 0.63 : 0.65, u, 0.05)
  const P = (x: number, y: number, z = 0) => isoPt(o, x, y, z)
  const b = easeOut(prog(ls, 0, 1400))
  const X0 = -4, WW = 8, Y0 = -2.6, D = 0.7, HH = 3.4, COLS = 12, ROWS = 6
  isoFloor(ctx, a, o, 12, 0.1 * b)
  pool(ctx, a, o, 0, -0.6, 5.5, 0.2 * b)
  solidBox(ctx, a, o, X0, Y0, WW, D, HH * b, { lit: 0.5 })
  const fillAt = (k: number) => clamp01((ls - (c1 - 300) - rnd(k * 7) * 3200) / (a.dur * 0.55)) * (0.3 + 0.65 * rnd(k * 3 + 1))
  if (b > 0.98) {
    onFace(ctx, P(X0, Y0 + D, HH), 'x', () => {
      const cw = (WW * u) / COLS, ch = (HH * u) / ROWS
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        const k = r * COLS + c, x = c * cw, y = r * ch
        ctx.fillStyle = 'rgba(0,0,0,0.78)'; ctx.fillRect(x + cw * 0.08, y + ch * 0.08, cw * 0.84, ch * 0.84)
        const fl = fillAt(k)
        if (fl > 0) { ctx.fillStyle = ink(a, 0.55 + 0.2 * rnd(k)); ctx.fillRect(x + cw * 0.14, y + ch * 0.92 - ch * 0.78 * fl, cw * 0.72, ch * 0.78 * fl) }
        text(ctx, String(k + 1).padStart(2, '0'), x + cw * 0.14, y + ch * 0.3, { size: Math.max(9 * KF, ch * 0.2), font: 'mono', color: dim(a, 0.8), tracking: 0 })
      }
    })
  }
  // the reading head on the bench, with a ribbon of slips running in
  bench(ctx, a, o, -3.2, 0.0, 6.4, 0.9, 0.9 * b + 0.01, { lit: 0.55 })
  for (let i = 0; i < 7; i++) {
    const t = (ls * 0.0004 + i / 7) % 1
    sheet(ctx, a, o, lerp(-3.1, -0.9, t), 0.2, 0.42, 0.5, 0.91, b * Math.min(1, Math.sin(Math.PI * t) * 2), i)
  }
  solidBox(ctx, a, o, -0.8, 0.05, 1.0, 0.8, 0.7, { z: 0.9, alpha: b, lit: 0.7 })
  const slotP = P(-0.3, 0.85, 1.35)
  glow(ctx, slotP[0], slotP[1], u * 0.9, ink(a, 0.22 * b * (0.7 + 0.3 * Math.sin(ls * 0.008))), ink(a, 0))
  // slips arcing from the head into their pigeonhole
  if (ls > c1 * 0.7) for (let i = 0; i < 8; i++) {
    const ph = ls * 0.00055 + i / 8, t = ph % 1, cyc = Math.floor(ph)
    const k = Math.floor(rnd(i * 13 + cyc * 7) * 72), col = k % COLS, row = Math.floor(k / COLS)
    const tx = X0 + ((col + 0.5) * WW) / COLS, tz = HH - ((row + 0.6) * HH) / ROWS
    const x = lerp(-0.3, tx, t), y = lerp(0.45, Y0 + D + 0.05, t), z = lerp(1.6, tz, t) + Math.sin(Math.PI * t) * 1.3
    const q = P(x, y, z), s = u * 0.32
    ctx.save(); ctx.translate(q[0], q[1]); ctx.rotate(Math.sin(ph * 9) * 0.5)
    ctx.globalAlpha *= clamp01(prog(ls, c1 * 0.7, 500)) * Math.min(1, (1 - t) * 6)
    ctx.fillStyle = ink(a, 0.9); ctx.fillRect(-s / 2, -s * 0.32, s, s * 0.64)
    ctx.restore()
  }
  // the 0.3% that fits nowhere: a small heap on the floor
  const pr = prog(ls, c2 + (a.dur - c2) * 0.45, 600)
  if (pr > 0) for (let i = 0; i < 5; i++) {
    const rx = X0 + WW + 0.4 + rnd(i) * 0.5, ry = Y0 + D + 0.25 + rnd(i + 9) * 0.5
    flat(ctx, o, rx, ry, 0.35, 0.25, 0.02 + i * 0.03, red(a, 0.7 * pr), red(a, 0.95 * pr))
  }
  person(ctx, a, o, 2.4, 1.6, { lift: 0.02 * Math.abs(Math.sin(ls * 0.003)) })
  vignette(ctx, a, 0.78)
  const big = tall ? 30 : 52, xr = W * 0.97
  const p1 = prog(ls, c1 + (c2 - c1) * 0.62, 450)
  const r1 = evCard(ctx, a, xr, H * (tall ? 0.11 : 0.14) + bob(a, 1), [{ s: '72', size: big, font: 'serif', color: ink(a, 0.97) }, { s: L(a, 'CATEGORIES', 'CATEGORÍAS'), size: 10.5, color: dim(a, 0.95) }], { al: p1, align: 'right', pad: 14 })
  if (!tall) leader(ctx, a, P(X0 + WW, Y0 + D, HH * 0.85), [r1.x, r1.y + r1.h * 0.6], p1)
  const p2 = prog(ls, c2 + (a.dur - c2) * 0.45, 450)
  const r2 = evCard(ctx, a, xr, r1.y + r1.h + 14 * KF, [{ s: L(a, '99.7%', '99.7%'), size: big, font: 'serif', color: ink(a, 0.97) }, { s: L(a, 'OF THE RECORD COVERED', 'DEL REGISTRO CUBIERTO'), size: 10.5, color: dim(a, 0.95) }], { al: p2, align: 'right', pad: 14 })
  if (pr > 0) {
    const hp = P(X0 + WW + 0.7, Y0 + D + 0.5, 0.15)
    const lab = L(a, 'NOT COVERED', 'SIN CUBRIR')
    const lx = tall ? W * 0.97 : r2.x + r2.w, ly = tall ? H * 0.68 : r2.y + r2.h + 34 * KF
    mono(ctx, a, lab, lx, ly, 10.5, red(a, 0.95 * pr), { align: 'right', weight: 700 })
    leader(ctx, a, hp, [lx - measure(ctx, lab, 10.5 * KF, 'mono', 700) - 6 * KF, ly - 4 * KF], pr, true)
  }
}

// ── 4 · MACHINE THREE · SCANS — a lens over scanned letters; prices lift off the page ───────
const scan: SceneFn = (ctx, a) => {
  const { ls, W, H, KF } = a
  const tall = isTall(a), c1 = cue(a, 1), c2 = cue(a, 2)
  const u = tall ? W * 0.064 : Math.min(W * 0.058, H * 0.098)
  const o = cam(a, tall ? 0.52 : 0.47, tall ? 0.56 : 0.53, u, 0.05)
  const P = (x: number, y: number, z = 0) => isoPt(o, x, y, z)
  const b = easeOut(prog(ls, 0, 1400)), T = 0.9
  isoFloor(ctx, a, o, 11, 0.1 * b)
  // the frozen federal file, back left, in cold light
  const fz = prog(ls, c1, 900)
  pool(ctx, a, o, -4.8, 1.7, 1.8, 0.1 + 0.08 * fz)
  solidBox(ctx, a, o, -5.4, 1.2, 1.2, 1.0, 1.9 * b, { lit: 0.3 + 0.1 * fz })
  if (b > 0.9) {
    onFace(ctx, P(-5.4, 2.2, 1.9), 'x', () => {
      const w = 1.2 * u, h = 1.9 * u
      ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = Math.max(1, u * 0.04)
      for (let i = 0; i < 4; i++) { ctx.strokeRect(w * 0.1, h * (0.05 + i * 0.235), w * 0.8, h * 0.2); ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(w * 0.42, h * (0.13 + i * 0.235), w * 0.16, h * 0.035) }
      if (fz > 0) { // chained shut
        ctx.strokeStyle = dim(a, 0.95 * fz); ctx.lineWidth = Math.max(1.5, u * 0.06)
        ctx.beginPath(); ctx.moveTo(0, h * 0.1); ctx.lineTo(w, h * 0.9); ctx.moveTo(w, h * 0.1); ctx.lineTo(0, h * 0.9); ctx.stroke()
        ctx.fillStyle = ink(a, 0.85 * fz); ctx.fillRect(w * 0.38, h * 0.44, w * 0.24, h * 0.12)
        for (let i = 0; i < 14; i++) { ctx.fillStyle = ink(a, (0.2 + 0.3 * rnd(i)) * fz); ctx.fillRect(rnd(i * 3) * w, rnd(i * 5) * h, u * 0.05, u * 0.05) }
      }
    })
  }
  pool(ctx, a, o, 0, 0, 4.2, 0.2 * b)
  bench(ctx, a, o, -3.5, -0.8, 7, 1.6, T * b + 0.01, { lit: 0.6 })
  if (b < 0.6) { vignette(ctx, a, 0.8); return }
  // scanned letters on the belt
  const SP = 0.00042
  for (let i = 0; i < 5; i++) {
    const t = (ls * SP + i / 5) % 1, x = lerp(-3.4, 2.6, t)
    sheet(ctx, a, o, x, -0.6, 0.8, 1.15, T + 0.01, Math.min(1, Math.sin(Math.PI * t) * 3), i * 5 + Math.floor(ls * SP + i / 5))
  }
  // post and arm, lens over the middle of the belt
  solidBox(ctx, a, o, -0.15, -1.25, 0.25, 0.25, 2.7, { lit: 0.55 })
  solidBox(ctx, a, o, -0.1, -1.2, 0.15, 1.2, 0.14, { z: 2.55, lit: 0.6 })
  const lc = P(0.15, 0, 2.1), fl = P(0.15, 0, T)
  const beam = 0.6 + 0.4 * Math.sin(ls * 0.006)
  const g = ctx.createLinearGradient(lc[0], lc[1], fl[0], fl[1]); g.addColorStop(0, ink(a, 0.2 * beam)); g.addColorStop(1, ink(a, 0.04))
  ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(lc[0] - u * 0.55, lc[1]); ctx.lineTo(lc[0] + u * 0.55, lc[1]); ctx.lineTo(fl[0] + u * 0.9, fl[1]); ctx.lineTo(fl[0] - u * 0.9, fl[1]); ctx.closePath(); ctx.fill()
  ctx.strokeStyle = ink(a, 0.9); ctx.lineWidth = Math.max(2, u * 0.09)
  ctx.beginPath(); ctx.ellipse(lc[0], lc[1], u * 0.62, u * 0.36, 0, 0, TAU); ctx.stroke()
  ctx.fillStyle = ink(a, 0.07); ctx.fill()
  // magnified lines inside the glass
  ctx.save(); ctx.beginPath(); ctx.ellipse(lc[0], lc[1], u * 0.58, u * 0.33, 0, 0, TAU); ctx.clip()
  ctx.fillStyle = ink(a, 0.35)
  for (let i = 0; i < 4; i++) ctx.fillRect(lc[0] - u * 0.5 + ((ls * 0.05) % (u * 0.3)), lc[1] - u * 0.22 + i * u * 0.13, u * (0.5 + 0.4 * rnd(i)), u * 0.05)
  ctx.restore()
  // prices lifting off each page as it passes under the lens
  for (let i = 0; i < 5; i++) {
    const t = (ls * SP + i / 5) % 1, x = lerp(-3.4, 2.6, t) + 0.4
    const q = clamp01((x - 0.15) / 1.6) // starts as the page clears the lens
    if (x < 0.15 || q >= 1 || ls < c1 * 0.5) continue
    const pz = T + 0.2 + easeOut(q) * 2.4, pp = P(0.15 + q * 0.6, 0, pz)
    const s = u * 0.22, al = Math.min(1, (1 - q) * 3)
    ctx.save(); ctx.globalAlpha *= al
    text(ctx, '$', pp[0] - s * 2.4, pp[1], { size: s * 1.5, font: 'mono', weight: 700, color: red(a, 0.97), baseline: 'middle' })
    ctx.fillStyle = red(a, 0.92)
    for (let d = 0; d < 7; d++) ctx.fillRect(pp[0] - s * 1.5 + d * s * 0.62 + (d > 2 ? s * 0.3 : 0), pp[1] - s * 0.5, s * 0.46, s)
    ctx.restore()
  }
  person(ctx, a, o, 2.9, 1.5, { lift: 0.02 * Math.abs(Math.sin(ls * 0.003)) })
  vignette(ctx, a, 0.78)
  // the frozen file, named
  if (fz > 0) {
    const at = P(-4.8, 1.7, 2.0)
    const r = evCard(ctx, a, tall ? W * 0.04 : W * 0.04, H * (tall ? 0.11 : 0.13) + bob(a, 2), [{ s: L(a, 'FEDERAL FILE', 'ARCHIVO FEDERAL'), size: tall ? 11 : 13, color: ink(a, 0.95), weight: 700 }, { s: L(a, 'FROZEN', 'CONGELADO'), size: 10.5, color: dim(a, 0.95) }], { al: fz, pad: 12 })
    leader(ctx, a, at, [r.x + r.w * 0.5, r.y + r.h], fz)
  }
  // the counters, on the voice
  const tail = a.dur - c2, big = tall ? 28 : 48
  const n1 = prog(ls, c2 + tail * 0.1, 600), n2 = prog(ls, c2 + tail * 0.42, 600)
  const r1 = evCard(ctx, a, W * 0.97, H * (tall ? 0.11 : 0.13) + bob(a, 3), [{ s: '76,774', size: big, font: 'serif', color: 'rgba(0,0,0,0)' }, { s: L(a, 'LETTERS READ', 'ACTAS LEÍDAS'), size: 10.5, color: dim(a, 0.95) }], { al: n1, align: 'right', pad: 14 })
  if (n1 > 0) text(ctx, fmt(76774, a), r1.x + r1.w - r1.pad, r1.base[0], { size: big * KF, color: ink(a, 0.97), align: 'right', alpha: n1 })
  const r2 = evCard(ctx, a, W * 0.97, r1.y + r1.h + 12 * KF, [{ s: '52,537', size: big, font: 'serif', color: 'rgba(0,0,0,0)' }, { s: L(a, 'PRICES RECOVERED', 'MONTOS RECUPERADOS'), size: 10.5, color: red(a, 0.9) }], { al: n2, align: 'right', accent: true, pad: 14 })
  if (n2 > 0) text(ctx, fmt(52537, a), r2.x + r2.w - r2.pad, r2.base[0], { size: big * KF, color: red(a, 0.97), align: 'right', alpha: n2 })
}

// ── 5 · MACHINE FOUR · RESEMBLANCE — eighteen dials weigh one contract against a shelf ──────
const CAB = { x: -2, y: -1.6, w: 4, d: 1.2, h: 2.8 }

/** The comparator cabinet with its 18 dials (shots 5, 8, 9). */
function comparator(ctx: C, a: SceneArgs, o: Iso, s: { al?: number; lit?: number; dialsOn?: number; redDial?: number; meter?: number; x?: number; y?: number }) {
  const al = s.al ?? 1, lit = s.lit ?? 0.6, dx = s.x ?? CAB.x, dy = s.y ?? CAB.y
  if (al <= 0.01) return
  solidBox(ctx, a, o, dx, dy, CAB.w, CAB.d, CAB.h, { alpha: al, lit })
  onFace(ctx, isoPt(o, dx, dy + CAB.d, CAB.h), 'x', () => {
    const u = o.u, r = u * 0.24
    ctx.save(); ctx.globalAlpha *= al
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(u * 0.12, u * 0.25, CAB.w * u - u * 0.24, u * 1.9)
    for (let k = 0; k < 18; k++) {
      const col = k % 6, row = Math.floor(k / 6), on = clamp01((s.dialsOn ?? 1) * 18 - k)
      const ang = -Math.PI / 2 - 0.9 + on * (0.5 + 1.3 * rnd(k * 3)) + Math.sin(a.ls * 0.0021 + k * 1.3) * 0.18 * on
      dial(ctx, a, u * 0.36 + col * ((CAB.w * u - u * 0.72) / 5), u * 0.6 + row * u * 0.62, r, ang, { on, accent: s.redDial === k })
    }
    // the resemblance meter: a half-moon gauge under the dials
    const m = s.meter ?? 0
    if (m > 0) {
      const mx = CAB.w * u * 0.5, my = u * 2.6, mr = u * 0.42
      ctx.strokeStyle = ink(a, 0.8 * m); ctx.lineWidth = Math.max(1, u * 0.05)
      ctx.beginPath(); ctx.arc(mx, my, mr, Math.PI, 0); ctx.stroke()
      const ang = Math.PI + (0.35 + 0.3 * Math.sin(a.ls * 0.0017)) * Math.PI * m
      ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(mx + Math.cos(ang) * mr * 0.9, my + Math.sin(ang) * mr * 0.9); ctx.stroke()
    }
    ctx.restore()
  })
}

const judge: SceneFn = (ctx, a) => {
  const { ls, W, H, KF } = a
  const tall = isTall(a), c1 = cue(a, 1), c2 = cue(a, 2)
  const u = tall ? W * 0.066 : Math.min(W * 0.057, H * 0.095)
  const o = cam(a, tall ? 0.52 : 0.5, tall ? 0.62 : 0.64, u, 0.05)
  const P = (x: number, y: number, z = 0) => isoPt(o, x, y, z)
  const b = easeOut(prog(ls, 0, 1400))
  isoFloor(ctx, a, o, 12, 0.1 * b)
  pool(ctx, a, o, 0, -0.4, 5.2, 0.22 * b)
  // the shelf of documented cases, right
  solidBox(ctx, a, o, 2.9, -3.0, 1.0, 2.6, 2.6 * b, { lit: 0.5 })
  if (b > 0.95) onFace(ctx, P(3.9, -0.4, 2.6), 'y', () => {
    const w = 2.6 * u, h = 2.6 * u
    for (let r = 0; r < 4; r++) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(w * 0.05, h * (0.04 + r * 0.24), w * 0.9, h * 0.2)
      ctx.fillStyle = ink(a, 0.6)
      for (let i = 0; i < 16; i++) { const hh = h * (0.13 + 0.05 * rnd(r * 40 + i)); ctx.fillRect(w * 0.08 + i * w * 0.053, h * (0.235 + r * 0.24) - hh, w * 0.036, hh) }
    }
  })
  comparator(ctx, a, o, { lit: 0.6 * b + 0.05, al: b, dialsOn: prog(ls, c1 + 200, 1300), meter: prog(ls, c2 + 300, 800) })
  // the one contract under test, on a pedestal, left
  solidBox(ctx, a, o, -4.1, 0.3, 0.9, 0.9, 0.9 * b, { lit: 0.55 })
  if (b > 0.9) sheet(ctx, a, o, -3.95, 0.42, 0.62, 0.68, 0.91 + 0.04 * Math.sin(ls * 0.003), 1, 4, true)
  // what flows in: the contract, and the shelf it is compared with
  const fl = prog(ls, c1, 600)
  if (fl > 0) {
    flow(ctx, a, [P(-3.65, 0.75, 1.0), P(-2.6, 0.2, 1.4), P(-2.0, -0.6, 1.6)], { n: 6, speed: 0.0005, alpha: fl })
    flow(ctx, a, [P(2.9, -1.4, 1.6), P(2.4, -1.2, 1.7), P(2.0, -1.0, 1.6)], { n: 4, speed: 0.0004, alpha: fl, color: ink(a, 0.9) })
  }
  vignette(ctx, a, 0.78)
  // eighteen signals
  const p1 = prog(ls, c1 + 400, 500)
  const r1 = evCard(ctx, a, tall ? W * 0.97 : W * 0.04, H * (tall ? 0.27 : 0.36) + bob(a, 1), [{ s: '18', size: tall ? 30 : 46, font: 'serif', color: ink(a, 0.97) }, { s: L(a, 'SIGNALS', 'SEÑALES'), size: 10.5, color: dim(a, 0.95) }], { al: p1, pad: 14, align: tall ? 'right' : 'left' })
  if (!tall) leader(ctx, a, P(CAB.x + 0.3, CAB.y + CAB.d, 2.2), [r1.x + r1.w, r1.y + r1.h / 2], p1)
  // the one question, typed
  const p2 = prog(ls, c2, 500)
  if (p2 > 0) {
    const q1 = L(a, 'HOW MUCH DOES THIS RESEMBLE', '¿CUÁNTO SE PARECE A'), q2 = L(a, 'CONTRACTS TIED TO DOCUMENTED CASES?', 'CONTRATOS LIGADOS A CASOS DOCUMENTADOS?')
    const sz = tall ? 13 : 21, ty = prog(ls, c2 + 200, 2600)
    const all = q1.length + q2.length, n = Math.round(all * ty)
    const r = evCard(ctx, a, W * 0.5, H * (tall ? 0.1 : 0.11) + bob(a, 2), [{ s: q1, size: sz, font: 'serif', color: 'rgba(0,0,0,0)' }, { s: q2, size: sz, font: 'serif', color: 'rgba(0,0,0,0)' }], { al: p2, align: 'center', pad: 14 })
    text(ctx, q1.slice(0, n), r.x + r.pad, r.base[0], { size: sz * KF, color: ink(a, 0.97) })
    text(ctx, q2.slice(0, Math.max(0, n - q1.length)), r.x + r.pad, r.base[1], { size: sz * KF, color: ink(a, 0.97) })
    const mt = P(0, CAB.y + CAB.d, 0.5)
    leader(ctx, a, mt, [r.x + r.w * 0.5, r.y + r.h], prog(ls, c2 + 900, 600))
  }
}

// ── 6 · WHAT IT LEARNED FROM — a bookcase of 1,417 folders; most were raised by the machine ─
const teach: SceneFn = (ctx, a) => {
  const { ls, W, H, KF } = a
  const tall = isTall(a), c1 = cue(a, 1), c2 = cue(a, 2)
  const u = tall ? W * 0.055 : Math.min(W * 0.047, H * 0.082)
  const o = cam(a, tall ? 0.4 : 0.42, tall ? 0.6 : 0.6, u, 0.04)
  const P = (x: number, y: number, z = 0) => isoPt(o, x, y, z)
  const b = easeOut(prog(ls, 0, 1200))
  const FW = tall ? 7 : 9, X0 = -FW / 2, Y0 = -2.4, D = 0.6, HH = 3, ROWS = 5, PER = 284
  isoFloor(ctx, a, o, 12, 0.1 * b)
  pool(ctx, a, o, 0.5, -0.6, 5.5, 0.2 * b)
  // the machine that learns from the shelf, back right
  const MX = X0 + FW + 1.0, MY = -3.6
  solidBox(ctx, a, o, MX, MY, 1.3, 1.0, 1.7 * b, { lit: 0.55 })
  if (b > 0.9) onFace(ctx, P(MX, MY + 1.0, 1.7), 'x', () => { for (let i = 0; i < 4; i++) dial(ctx, a, ((i % 2) + 0.5) * 0.65 * u, (Math.floor(i / 2) + 0.55) * 0.55 * u, u * 0.17, -1.4 + Math.sin(ls * 0.002 + i) * 0.4) })
  solidBox(ctx, a, o, X0, Y0, FW, D, HH * b, { lit: 0.42 })
  const nVis = Math.round(1417 * easeOut(prog(ls, 900, 1500)))
  const lit387 = prog(ls, c1 + (c2 - c1) * 0.3, 600), sweep = easeInOut(prog(ls, c2 + 200, 1600))
  if (b > 0.98) onFace(ctx, P(X0, Y0 + D, HH), 'x', () => {
    const fw = FW * u, rh = (HH * u) / ROWS, sw = fw / PER, bd = u * 0.07
    ctx.fillStyle = ink(a, 0.3)
    for (let r = 0; r < ROWS; r++) ctx.fillRect(0, (r + 1) * rh - bd, fw, bd)
    for (let pass = 0; pass < 3; pass++) {
      ctx.beginPath()
      for (let i = 0; i < nVis; i++) {
        const cls = i < 387 ? 0 : (i - 387) / 1030 < sweep ? 2 : 1
        if (cls !== pass) continue
        const r = Math.floor(i / PER), c = i % PER, hh = rh * (0.5 + 0.32 * rnd(i))
        ctx.rect(c * sw + sw * 0.12, (r + 1) * rh - bd - hh, sw * 0.76, hh)
      }
      ctx.fillStyle = pass === 0 ? ink(a, 0.4 + 0.55 * lit387) : pass === 1 ? ink(a, 0.4) : red(a, 0.85)
      ctx.fill()
    }
  })
  // the loop: analysts at a desk write up what the machine raised; it goes on the shelf; the machine learns from it
  const lp = prog(ls, c2 + 400, 1400)
  const DX = 1.2, DY = 0.6
  solidBox(ctx, a, o, DX, DY, 1.6, 0.8, 0.75 * b, { lit: 0.6 })
  if (b > 0.9) { sheet(ctx, a, o, DX + 0.2, DY + 0.15, 0.5, 0.45, 0.76, 1, 2, sweep > 0.3); sheet(ctx, a, o, DX + 0.9, DY + 0.2, 0.5, 0.45, 0.76, 1, 6) }
  person(ctx, a, o, DX + 0.5, DY + 1.25, { lift: 0.02 * Math.abs(Math.sin(ls * 0.004)) })
  person(ctx, a, o, DX + 1.3, DY + 1.2, { lift: 0.02 * Math.abs(Math.sin(ls * 0.004 + 1.5)) })
  vignette(ctx, a, 0.75)
  if (lp > 0) {
    const m = P(MX + 0.6, MY + 1.0, 1.0), d = P(DX + 1.6, DY + 0.3, 0.9), s = P(X0 + FW * 0.7, Y0 + D, 0.6)
    const arc: Pt[] = [m, [lerp(m[0], d[0], 0.5) + u * 0.6, lerp(m[1], d[1], 0.5) + u * 0.3], d, [lerp(d[0], s[0], 0.5), Math.max(d[1], s[1]) + u * 0.5], s]
    trace(ctx, arc, lp, { color: red(a, 0.8), width: Math.max(2, 2.2 * KF), dash: [6 * KF, 4 * KF] })
    flow(ctx, a, arc, { n: 5, speed: 0.0003, alpha: lp })
    const sm: Pt[] = [P(X0 + FW, Y0 + 0.3, 2.4), [lerp(P(X0 + FW, Y0, 2.4)[0], m[0], 0.5), Math.min(P(X0 + FW, Y0, 2.4)[1], m[1]) - u * 0.8], P(MX + 0.3, MY + 0.3, 1.8)]
    trace(ctx, sm, lp, { color: ink(a, 0.6), width: Math.max(1.5, 1.6 * KF) })
    const end = sm[2], ang = Math.atan2(end[1] - sm[1][1], end[0] - sm[1][0])
    ctx.fillStyle = ink(a, 0.8 * lp); ctx.beginPath(); ctx.moveTo(end[0], end[1]); ctx.lineTo(end[0] - Math.cos(ang - 0.4) * 9 * KF, end[1] - Math.sin(ang - 0.4) * 9 * KF); ctx.lineTo(end[0] - Math.cos(ang + 0.4) * 9 * KF, end[1] - Math.sin(ang + 0.4) * 9 * KF); ctx.closePath(); ctx.fill()
  }
  // the figures
  const big = tall ? 26 : 44
  const p0 = prog(ls, 1000, 500) * (tall ? 1 - prog(ls, c2, 400) : 1) // on a phone «the rest» takes this corner
  const r0 = evCard(ctx, a, W * 0.04, H * (tall ? 0.11 : 0.12) + bob(a, 1), [{ s: '1,417', size: big, font: 'serif', color: 'rgba(0,0,0,0)' }, { s: L(a, 'LABELLED CASES', 'CASOS ETIQUETADOS'), size: 10.5, color: dim(a, 0.95) }], { al: p0, pad: 14 })
  if (p0 > 0) text(ctx, fmt(1417, a), r0.x + r0.pad, r0.base[0], { size: big * KF, color: ink(a, 0.97), alpha: p0 })
  if (lit387 > 0) {
    const r = evCard(ctx, a, tall ? W * 0.97 : W * 0.4, H * (tall ? 0.27 : 0.12) + bob(a, 2), [{ s: fmt(387, a), size: big, font: 'serif', color: ink(a, 0.97) }, { s: L(a, 'PRESS · OFFICIAL RECORDS', 'PRENSA · REGISTROS OFICIALES'), size: 10.5, color: dim(a, 0.95) }], { al: lit387, align: tall ? 'right' : 'left', pad: 14 })
    leader(ctx, a, P(X0 + FW * 0.25, Y0 + D, HH * 0.82), [r.x + r.w * 0.3, r.y + r.h], lit387)
  }
  const p2 = prog(ls, c2 + 300, 500)
  if (p2 > 0) {
    const r = evCard(ctx, a, tall ? W * 0.03 : W * 0.97, H * (tall ? 0.11 : 0.3) + bob(a, 3), [
      { s: L(a, 'THE REST', 'EL RESTO'), size: tall ? 18 : 26, font: 'serif', color: red(a, 0.97) },
      { s: L(a, 'LEADS THE MODEL RAISED', 'PISTAS QUE LEVANTÓ EL MODELO'), size: 10.5, color: ink(a, 0.9) },
      { s: L(a, 'WRITTEN UP BY ANALYSTS', 'DOCUMENTADAS POR ANALISTAS'), size: 10.5, color: dim(a, 0.95) },
    ], { al: p2, accent: true, align: tall ? 'left' : 'right', pad: 14 })
    leader(ctx, a, P(X0 + FW * 0.8, Y0 + D, HH * 0.3), tall ? [r.x + r.w * 0.5, r.y + r.h] : [r.x, r.y + r.h * 0.5], p2, true)
  }
}

// ── 7 · THE BLIND TEST — companies behind screens; the machine lifts one; two of three right ─
const TRIAL_RIGHT = [true, false, true]

const test: SceneFn = (ctx, a) => {
  const { ls, W, H, KF } = a
  const tall = isTall(a), c1 = cue(a, 1), c2 = cue(a, 2)
  const u = tall ? W * 0.07 : Math.min(W * 0.066, H * 0.108)
  const o = cam(a, 0.5, tall ? 0.6 : 0.63, u, 0.04)
  const P = (x: number, y: number, z = 0) => isoPt(o, x, y, z)
  const b = easeOut(prog(ls, 0, 1200))
  isoFloor(ctx, a, o, 12, 0.1 * b)
  const lift = easeInOut(prog(ls, c1 + (c2 - c1) * 0.55, 900))
  const marks: { at: Pt; ok: boolean; p: number }[] = []
  ;[-2.3, 0, 2.3].forEach((s, k) => {
    const cx = s, cy = -s
    const sw = Math.sin(ls * 0.0012 + k) * 0.08
    const top = P(cx + sw, cy, 5.2), flr = P(cx, cy, 0)
    pool(ctx, a, o, cx, cy, 1.9, 0.22 * b)
    lamp(ctx, a, top[0], top[1], flr[1], u * 1.3, 0.1 * b)
    solidBox(ctx, a, o, cx - 1.1, cy - 0.7, 2.2, 1.4, 0.2 * b + 0.01, { lit: 0.45 })
    const right = TRIAL_RIGHT[k], rev = easeOut(prog(ls, c2 + 250 + k * 650, 500))
    // crate 0 is the documented one; the machine lifts crate 0 when right, crate 1 when wrong
    for (let j = 0; j < 2; j++) {
      const drop = easeOut(prog(ls, 300 + k * 200 + j * 120, 600))
      if (drop <= 0) continue
      const lifted = right ? j === 0 : j === 1
      const z = 0.2 + (1 - drop) * 3 + (lifted ? 1.0 * lift : 0)
      const x = cx - 0.95 + j * 1.05
      if (lifted && lift > 0) solidBox(ctx, a, o, x + 0.25, cy - 0.15, 0.3, 0.3, z - 0.2, { z: 0.2, lit: 0.5 })
      solidBox(ctx, a, o, x, cy - 0.4, 0.8, 0.8, 0.8, { z, lit: 0.75 })
      if (j === 0) isoBox(ctx, a, o, x + 0.15, cy + 0.4, 0.4, 0.03, 0.25, { z: z + 0.3, lit: 1.3, alpha: rev }) // the case tag, seen once revealed
      if (lifted && rev > 0) marks.push({ at: P(x + 0.4, cy, z + 1.6), ok: right, p: rev })
    }
    // the screen in front of the pair: rises to hide, drops to reveal
    const hide = easeOut(prog(ls, c1 + k * 180, 600)) * (1 - rev)
    if (hide > 0.01) solidBox(ctx, a, o, cx - 1.1, cy + 0.55, 2.2, 0.08, 1.15 * hide, { z: 0.2, lit: 0.35 })
  })
  vignette(ctx, a, 0.78)
  for (const m of marks) {
    const s = 22 * KF, y = m.at[1] + bob(a, m.at[0]) * 0.5
    ctx.save(); ctx.globalAlpha *= m.p; ctx.lineWidth = Math.max(3, 5 * KF); ctx.lineCap = 'round'
    if (m.ok) { ctx.strokeStyle = ink(a, 0.95); ctx.beginPath(); ctx.moveTo(m.at[0] - s, y); ctx.lineTo(m.at[0] - s * 0.3, y + s * 0.7); ctx.lineTo(m.at[0] + s, y - s * 0.8); ctx.stroke() }
    else { ctx.strokeStyle = red(a, 0.97); ctx.beginPath(); ctx.moveTo(m.at[0] - s * 0.8, y - s * 0.8); ctx.lineTo(m.at[0] + s * 0.8, y + s * 0.8); ctx.moveTo(m.at[0] + s * 0.8, y - s * 0.8); ctx.lineTo(m.at[0] - s * 0.8, y + s * 0.8); ctx.stroke() }
    ctx.restore()
  }
  const ph = prog(ls, c1 + 300, 500)
  mono(ctx, a, L(a, 'COMPANIES HIDDEN FROM THE MODEL', 'EMPRESAS OCULTAS AL MODELO'), W * 0.5, H * 0.13, 11, dim(a, 0.95 * ph * (1 - prog(ls, c2 + (a.dur - c2) * 0.62, 300))), { align: 'center' })
  const pr = prog(ls, c2 + (a.dur - c2) * 0.62, 500)
  evCard(ctx, a, W * 0.5, H * 0.11 + bob(a, 4), [{ s: L(a, '≈ 2 IN 3', '≈ 2 DE 3'), size: tall ? 30 : 48, font: 'serif', color: ink(a, 0.97) }, { s: L(a, 'RIGHT ONE RANKED HIGHER', 'LA CORRECTA, MÁS ARRIBA'), size: 10.5, color: dim(a, 0.95) }], { al: pr, align: 'center', pad: 14 })
}

// ── 8 · THE HUMBLING PART — a plain scale sorts the same crates by size alone ────────────────
const SIZES = [0.55, 0.95, 0.7, 1.15, 0.8, 0.6]

const size: SceneFn = (ctx, a) => {
  const { ls, W, H, KF } = a
  const tall = isTall(a), c1 = cue(a, 1), c2 = cue(a, 2)
  const u = tall ? W * 0.052 : Math.min(W * 0.05, H * 0.085)
  const o = cam(a, tall ? 0.46 : 0.27, tall ? 0.66 : 0.62, u, 0.03)
  const P = (x: number, y: number, z = 0) => isoPt(o, x, y, z)
  const b = easeOut(prog(ls, 0, 1400))
  isoFloor(ctx, a, o, 12, 0.08 * b)
  pool(ctx, a, o, -1, -1, 4.6, 0.22 * b)
  // the plain scale: a platform and a dial on a post; crates wait left, leave sorted up-right
  const order = SIZES.map((_, i) => i).sort((p, q) => SIZES[q] - SIZES[p])
  const span = Math.max(1200, c2 - c1 - 200), stepT = span / 6
  let onScale = 0
  const crates: { x: number; y: number; s: number }[] = []
  SIZES.forEach((s, i) => {
    const rank = order.indexOf(i), t0 = c1 + rank * stepT
    const q: Pt = [-2.7 - (i % 2) * 1.3, 1.0 - Math.floor(i / 2) * 1.3], sc: Pt = [-1, 1], f: Pt = [-1, 1 - (rank + 1) * 1.05]
    const m1 = easeInOut(prog(ls, t0, stepT * 0.4)), m2 = easeInOut(prog(ls, t0 + stepT * 0.62, stepT * 0.38))
    const c: Pt = m2 > 0 ? [lerp(sc[0], f[0], m2), lerp(sc[1], f[1], m2)] : [lerp(q[0], sc[0], m1), lerp(q[1], sc[1], m1)]
    if (m1 > 0.95 && m2 < 0.05) onScale = s
    crates.push({ x: c[0] - s / 2, y: c[1] - s / 2, s })
  })
  solidBox(ctx, a, o, -1.95, -0.05, 0.12, 0.12, 1.7 * b, { lit: 0.5 })
  onFace(ctx, P(-1.89, 0.07, 1.75), 'x', () => dial(ctx, a, 0, 0, u * 0.5, -Math.PI / 2 - 1.2 + onScale * 2.0 + Math.sin(ls * 0.01) * 0.03 * (onScale > 0 ? 1 : 0), { on: 1 }))
  solidBox(ctx, a, o, -1.8, 0.2, 1.6, 1.6, 0.22 * b, { lit: 0.6 })
  crates.sort((p, q) => p.x + p.y - (q.x + q.y))
  for (const c of crates) solidBox(ctx, a, o, c.x, c.y, c.s, c.s, c.s, { z: Math.abs(c.x + c.s / 2 + 1) < 0.6 && Math.abs(c.y + c.s / 2 - 1) < 0.6 ? 0.22 : 0, alpha: b, lit: 0.8 })
  vignette(ctx, a, 0.8)
  if (!tall) mono(ctx, a, L(a, 'SORTED BY SIZE · NOTHING ELSE', 'ORDENADAS POR TAMAÑO · NADA MÁS'), W * 0.04, H * 0.14, 11, ink(a, 0.85 * prog(ls, c1 + 200, 600)), { weight: 700 })

  // the readout: two glass columns, filled to how often each put the right company higher
  const pp = prog(ls, c1 + (c2 - c1) * 0.45, 600), fill = easeInOut(prog(ls, c1 + (c2 - c1) * 0.5, 1100)), gap = easeOut(prog(ls, c2 + 300, 900))
  if (pp <= 0) return
  const R = tall ? { x: W * 0.06, y: H * 0.11, w: W * 0.88, h: H * 0.36 } : { x: W * 0.56, y: H * 0.12 + bob(a, 3) * 0.5, w: W * 0.4, h: H * 0.58 }
  ctx.save(); ctx.globalAlpha *= pp
  ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(R.x + 6 * KF, R.y + 8 * KF, R.w, R.h)
  ctx.fillStyle = a.pal.bg; ctx.fillRect(R.x, R.y, R.w, R.h)
  ctx.fillStyle = ink(a, 0.04); ctx.fillRect(R.x, R.y, R.w, R.h)
  ctx.strokeStyle = ink(a, 0.45); ctx.lineWidth = Math.max(1, 1.1 * KF); ctx.strokeRect(R.x, R.y, R.w, R.h)
  const tw = Math.min(R.w * 0.16, 64 * KF), top = R.y + R.h * (tall ? 0.16 : 0.13), bot = R.y + R.h * (tall ? 0.7 : 0.74), th = bot - top
  const LEVEL = 0.64 // "about two in three" — the shared level; the plain scale rises a hair above it
  const wob = Math.sin(ls * 0.003) * 0.004
  const cols = [
    { cx: R.x + R.w * 0.3, name: L(a, 'THE MODEL', 'EL MODELO'), sub: L(a, '18 SIGNALS', '18 SEÑALES'), lv: LEVEL * fill + wob },
    { cx: R.x + R.w * 0.7, name: L(a, 'SIZE ALONE', 'SOLO TAMAÑO'), sub: L(a, 'NOTHING ELSE', 'NADA MÁS'), lv: LEVEL * fill - wob },
  ]
  cols.forEach((c, k) => {
    const x0 = c.cx - tw / 2
    // ticks up the side
    ctx.strokeStyle = ink(a, 0.3); ctx.lineWidth = 1; ctx.beginPath()
    for (let i = 0; i <= 10; i++) { const y = bot - (th * i) / 10, l = (i % 5 ? 5 : 10) * KF; ctx.moveTo(x0 - 4 * KF - l, y); ctx.lineTo(x0 - 4 * KF, y) }
    ctx.stroke()
    // the glass
    ctx.fillStyle = ink(a, 0.05); ctx.beginPath(); ctx.roundRect(x0, top, tw, th, tw * 0.18); ctx.fill()
    const lvY = bot - th * c.lv
    ctx.save(); ctx.beginPath(); ctx.roundRect(x0, top, tw, th, tw * 0.18); ctx.clip()
    ctx.fillStyle = ink(a, 0.72); ctx.fillRect(x0, lvY, tw, bot - lvY)
    if (k === 1 && gap > 0) { const hy = th * 0.05 * gap; ctx.fillStyle = red(a, 0.92); ctx.fillRect(x0, lvY - hy, tw, hy) }
    ctx.restore()
    ctx.strokeStyle = ink(a, 0.7); ctx.lineWidth = Math.max(1.2, 1.6 * KF); ctx.beginPath(); ctx.roundRect(x0, top, tw, th, tw * 0.18); ctx.stroke()
    const ns = (tall ? 13 : 20) * KF, nw = measure(ctx, c.name, ns, 'serif')
    text(ctx, c.name, c.cx, bot + (tall ? 18 : 30) * KF, { size: nw > R.w * 0.36 ? ns * (R.w * 0.36 / nw) : ns, color: ink(a, 0.97), align: 'center' })
    mono(ctx, a, c.sub, c.cx, bot + (tall ? 31 : 48) * KF, 10, dim(a, 0.95), { align: 'center' })
  })
  // the shared line: about as well
  const ly = bot - th * LEVEL * fill
  if (fill > 0.95) {
    ctx.save(); ctx.setLineDash([5 * KF, 4 * KF]); ctx.strokeStyle = ink(a, 0.55); ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(cols[0].cx - tw, ly); ctx.lineTo(cols[1].cx + tw, ly); ctx.stroke(); ctx.restore()
    mono(ctx, a, L(a, 'ABOUT AS WELL', 'CASI IGUAL'), (cols[0].cx + cols[1].cx) / 2, ly - 8 * KF, 10.5, ink(a, 0.85 * clamp01((fill - 0.95) * 20)), { align: 'center' })
  }
  if (gap > 0.4) mono(ctx, a, L(a, 'SLIGHTLY BETTER', 'UN POCO MEJOR'), cols[1].cx, top - 9 * KF, 12, red(a, 0.97 * clamp01((gap - 0.4) * 2)), { align: 'center', weight: 700 })
  ctx.restore()
}

// ── 9 · A KNOWN FLAW — one dial wired to a cracked board of "related firms" ─────────────────
const BOARD_CARDS: Pt[] = [[0.5, 0.75], [1.4, 0.6], [2.4, 0.85], [3.3, 0.65], [0.8, 1.75], [1.9, 1.9], [3.0, 1.75]]
const LINKS: [number, number, boolean][] = [[0, 1, false], [1, 4, false], [2, 3, true], [2, 5, false], [5, 6, false]]

const flaw: SceneFn = (ctx, a) => {
  const { ls, W, H, KF, dur } = a
  const tall = isTall(a)
  const u = tall ? W * 0.058 : Math.min(W * 0.054, H * 0.092)
  const o = cam(a, tall ? 0.52 : 0.5, tall ? 0.6 : 0.61, u, 0.05)
  const P = (x: number, y: number, z = 0) => isoPt(o, x, y, z)
  const b = easeOut(prog(ls, 0, 1100)), RD = 13, CY = -0.9
  const dRed = prog(ls, dur * 0.1, 500), wire = prog(ls, dur * 0.14, dur * 0.22), board = prog(ls, dur * 0.3, 700)
  isoFloor(ctx, a, o, 12, 0.1 * b)
  pool(ctx, a, o, -2.5, -0.5, 4, 0.18 * b)
  pool(ctx, a, o, 3.0, -1.5, 3, 0.18 * board)
  // the board on its easel, right-back
  const BX = 1.0, BY = -2.7, BW = 4, BH = 2.6
  solidBox(ctx, a, o, BX + 0.3, BY - 0.3, 0.12, 0.12, 0.9 * b, { lit: 0.5 })
  solidBox(ctx, a, o, BX + BW - 0.4, BY - 0.3, 0.12, 0.12, 0.9 * b, { lit: 0.5 })
  solidBox(ctx, a, o, BX, BY, BW, 0.14, BH * b, { z: 0.9, lit: 0.35 + 0.25 * board })
  if (b > 0.95) onFace(ctx, P(BX, BY + 0.14, 0.9 + BH), 'x', () => {
    const k = o.u
    text(ctx, L(a, 'RELATED FIRMS', 'EMPRESAS RELACIONADAS'), k * 0.2, k * 0.32, { size: fit(ctx, L(a, 'RELATED FIRMS', 'EMPRESAS RELACIONADAS'), Math.max(10 * KF, k * 0.2), k * 3.6), font: 'mono', weight: 700, color: ink(a, 0.95 * board), tracking: k * 0.02 })
    for (const [cx, cy] of BOARD_CARDS) { ctx.fillStyle = ink(a, 0.75 * board); ctx.fillRect(cx * k - k * 0.28, cy * k - k * 0.18, k * 0.56, k * 0.36); ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(cx * k - k * 0.2, cy * k - k * 0.06, k * 0.38, k * 0.04); ctx.fillRect(cx * k - k * 0.2, cy * k + k * 0.04, k * 0.28, k * 0.04) }
    let wrong = 0
    LINKS.forEach(([i, j, holds]) => {
      const p = BOARD_CARDS[i], q = BOARD_CARDS[j], sn = holds ? 0 : easeOut(prog(ls, dur * (0.55 + 0.06 * wrong), 350))
      if (!holds) wrong++
      ctx.lineWidth = Math.max(1.5, k * 0.04)
      if (sn <= 0) { ctx.strokeStyle = ink(a, 0.85 * board); ctx.beginPath(); ctx.moveTo(p[0] * k, p[1] * k); ctx.lineTo(q[0] * k, q[1] * k); ctx.stroke() }
      else { // the string snaps and both ends droop
        const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2
        ctx.strokeStyle = red(a, 0.95)
        for (const e of [p, q]) { ctx.beginPath(); ctx.moveTo(e[0] * k, e[1] * k); ctx.quadraticCurveTo(lerp(e[0], mx, 0.6) * k, (lerp(e[1], my, 0.6) + 0.1 * sn) * k, lerp(e[0], mx, 0.85) * k, (lerp(e[1], my, 0.85) + 0.35 * sn) * k); ctx.stroke() }
      }
      ctx.fillStyle = holds ? ink(a, board) : red(a, board); for (const e of [p, q]) { ctx.beginPath(); ctx.arc(e[0] * k, e[1] * k, k * 0.06, 0, TAU); ctx.fill() }
    })
    // the crack across the board
    const cr = prog(ls, dur * 0.5, 600)
    if (cr > 0) trace(ctx, [[0.1 * k, 2.4 * k], [0.9 * k, 1.5 * k], [1.3 * k, 1.75 * k], [2.2 * k, 1.1 * k], [2.6 * k, 1.3 * k], [3.9 * k, 0.2 * k]], cr, { color: red(a, 0.7), width: Math.max(1.5, k * 0.05) })
  })
  // the cabinet, left, with dial 14 of 18 lit red, and its wire across the floor to the board
  comparator(ctx, a, o, { x: -5.2, y: CY, al: b, lit: 0.55, dialsOn: 1, redDial: dRed > 0 ? RD : undefined })
  if (wire > 0) {
    const d0 = P(-5.2 + 0.36 + (RD % 6) * 0.656 / 1, CY + CAB.d, 2.8 - 0.6 - 0.62 * Math.floor(RD / 6))
    trace(ctx, [d0, P(-2.6, CY + CAB.d + 0.3, 0), P(BX + 1.6, CY + CAB.d + 0.3, 0), P(BX + 1.6, BY + 0.14, 0.9)], wire, { color: red(a, 0.8), width: Math.max(2, 2 * KF) })
  }
  vignette(ctx, a, 0.78)
  // labels: one of eighteen; wrong ≈ 4 in 5
  const pd = prog(ls, dur * 0.12, 500)
  const r = evCard(ctx, a, W * 0.04, H * (tall ? 0.11 : 0.13) + bob(a, 1), [{ s: L(a, '1 OF 18 SIGNALS', '1 DE 18 SEÑALES'), size: 12, color: red(a, 0.95), weight: 700 }], { al: pd, accent: true, pad: 10 })
  const dd = P(-5.2 + 0.4 + (RD % 6) * 0.66, CY + CAB.d, 1.9)
  leader(ctx, a, dd, [r.x + r.w * 0.5, r.y + r.h], pd, true)
  const pw = prog(ls, dur * 0.76, 500)
  evCard(ctx, a, W * 0.97, H * (tall ? 0.11 : 0.13) + bob(a, 2), [{ s: L(a, '≈ 4 IN 5', '≈ 4 DE 5'), size: tall ? 30 : 48, font: 'serif', color: red(a, 0.97) }, { s: L(a, 'GROUPINGS WRONG', 'AGRUPACIONES ERRÓNEAS'), size: 10.5, color: ink(a, 0.85) }], { al: pw, accent: true, align: 'right', pad: 14 })
}

// ── 10 · WHAT IT IS FOR — files laid in reading order inside one SECTOR · YEAR frame ────────
const use: SceneFn = (ctx, a) => {
  const { ls, W, H, KF } = a
  const tall = isTall(a), c1 = cue(a, 1), c2 = cue(a, 2)
  const u = tall ? W * 0.072 : Math.min(W * 0.066, H * 0.11)
  const o = cam(a, 0.5, tall ? 0.5 : 0.48, u, 0.04)
  const P = (x: number, y: number, z = 0) => isoPt(o, x, y, z)
  const b = easeOut(prog(ls, 0, 1200)), T = 0.9
  isoFloor(ctx, a, o, 12, 0.1 * b)
  // other frames, dark on the floor around: other sectors, other years
  for (const [fx, fy] of [[-6.5, -2], [-2, -6.5], [4.5, -5.5], [-6, 3.5]] as [number, number][]) {
    flat(ctx, o, fx, fy, 2.4, 1.6, 0.01, undefined, ink(a, 0.18 * b), Math.max(1, KF))
    for (let i = 0; i < 3; i++) flat(ctx, o, fx + 0.2 + i * 0.75, fy + 0.4, 0.55, 0.75, 0.02, ink(a, 0.08 * b))
  }
  const top = P(0, 0, 6), fl = P(0, 0, T)
  lamp(ctx, a, top[0], top[1], fl[1], u * 3, 0.11 * b)
  pool(ctx, a, o, 0, 0, 4.2, 0.24 * b)
  bench(ctx, a, o, -2.8, -1.6, 5.6, 3.2, T * b + 0.01, { lit: 0.6 })
  if (b < 0.8) { vignette(ctx, a, 0.8); return }
  // the frame on the desk
  const fr = prog(ls, c1 + (c2 - c1) * 0.55, 600)
  flat(ctx, o, -2.5, -1.35, 5.0, 2.7, T + 0.005, undefined, ink(a, 0.35 + 0.6 * fr), Math.max(1.5, 2 * KF))
  onTop(ctx, P(-2.35, -1.25, T), () => text(ctx, L(a, 'ONE SECTOR · ONE YEAR', 'UN SECTOR · UN AÑO'), 0, u * 0.28, { size: fit(ctx, L(a, 'ONE SECTOR · ONE YEAR', 'UN SECTOR · UN AÑO'), Math.max(10 * KF, u * 0.24), u * 4.6), font: 'mono', weight: 700, color: ink(a, 0.4 + 0.55 * fr), tracking: u * 0.03 }))
  // six files dropping into place, in the order to read them
  const step = Math.max(260, (c2 - c1) * 0.6 / 6)
  const spots: Pt[] = []
  for (let k = 0; k < 6; k++) {
    const col = k % 3, row = Math.floor(k / 3), fx = -2.2 + col * 1.6, fy = -0.75 + row * 1.15
    const d = easeOut(prog(ls, c1 + k * step, 500))
    if (d <= 0) continue
    sheet(ctx, a, o, fx, fy, 1.15, 0.85, T + 0.01 + (1 - d) * 2.2, d, k + 3)
    onTop(ctx, P(fx + 0.08, fy + 0.08, T + 0.012 + (1 - d) * 2.2), () => { ctx.fillStyle = ink(a, 0.9 * d); ctx.fillRect(0, 0, u * 0.3, u * 0.3); text(ctx, String(k + 1), u * 0.15, u * 0.24, { size: u * 0.26, font: 'mono', weight: 700, color: a.pal.bg, align: 'center' }) })
    if (d > 0.95) spots.push(P(fx + 0.6, fy + 0.45, T))
  }
  if (spots.length > 1) trace(ctx, spots, 1, { color: ink(a, 0.5), width: Math.max(1, KF), dash: [4 * KF, 4 * KF] })
  person(ctx, a, o, 3.4, 0.4, { lift: 0.015 * Math.sin(ls * 0.003) })
  vignette(ctx, a, 0.78)
  const pr = prog(ls, c1 + 200, 500)
  mono(ctx, a, L(a, 'READING ORDER', 'ORDEN DE LECTURA'), tall ? W * 0.5 : W * 0.06, H * (tall ? 0.17 : 0.14), 11, ink(a, 0.85 * pr), { align: tall ? 'center' : 'left', weight: 700 })
  stamp(ctx, a, L(a, 'NEVER A VERDICT', 'NUNCA UN VEREDICTO'), W * 0.5, H * (tall ? 0.24 : 0.25), { size: (tall ? 15 : 26) * KF, p: prog(ls, c2 + 250, 450), rot: -0.07 })
}

// ── 11 · END — the four benches go dark; one person reads by lamp light ──────────────────────
const end: SceneFn = (ctx, a) => {
  const { ls, W, H } = a
  const tall = isTall(a), c1 = cue(a, 1)
  const u = tall ? W * 0.058 : Math.min(W * 0.052, H * 0.083)
  const o = cam(a, 0.5, tall ? 0.62 : 0.64, u, 0.03, -0.02)
  const P = (x: number, y: number, z = 0) => isoPt(o, x, y, z)
  const off = easeInOut(prog(ls, 200, Math.max(900, c1 - 200)))
  isoFloor(ctx, a, o, 13, 0.08)
  BENCHES(tall).forEach(([bx, by], k) => {
    const on = 1 - clamp01(off * 1.4 - k * 0.12)
    pool(ctx, a, o, bx, by, 1.9, 0.22 * on)
    const tp = P(bx, by, 4.6), fl = P(bx, by, 0.9)
    lamp(ctx, a, tp[0], tp[1], fl[1], u * 1.1, 0.12 * on)
    bench(ctx, a, o, bx - 0.85, by - 0.85, 1.7, 1.7, 0.9, { lit: 0.15 + 0.5 * on })
    miniMachine(ctx, a, o, k, bx, by, 0.9, 1, 0.15 + 0.85 * on)
  })
  // the reader
  const lt = easeOut(prog(ls, c1, 500))
  const lmp = P(0.6, 0.4, 2.6), dsk = P(0.4, 0.6, 0.8)
  lamp(ctx, a, lmp[0], lmp[1], dsk[1] + u * 0.6, u * 1.8, 0.2 * lt)
  pool(ctx, a, o, 0.3, 0.6, 2.4, 0.3 * lt + 0.04)
  solidBox(ctx, a, o, -0.6, 0.1, 1.8, 1.0, 0.8, { lit: 0.25 + 0.6 * lt })
  solidBox(ctx, a, o, 0.85, 0.2, 0.08, 0.08, 1.8, { z: 0.8, lit: 0.6 })
  solidBox(ctx, a, o, 0.55, 0.15, 0.4, 0.3, 0.14, { z: 2.5, lit: 0.4 + 0.8 * lt })
  sheet(ctx, a, o, -0.3, 0.3, 0.7, 0.55, 0.81, 0.4 + 0.6 * lt, 9)
  person(ctx, a, o, -0.1, 1.55, { lift: 0.01 * Math.sin(ls * 0.002), al: 0.6 + 0.4 * lt })
  vignette(ctx, a, 0.85)
}

export const scenes: Record<string, SceneFn> = { pile, names, fuzzy, sort, scan, judge, teach, test, size, flaw, use, end }
