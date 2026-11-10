/**
 * «La Estafa Maestra» — the heist told as a miniature model on a planning table (the Fern
 * direction). One draw function per shot, keyed by the beat's `scene` in story-films.json; see
 * filmKit.ts for the contract. The world: a government district, a university with a gate, a
 * back street of empty storefront offices, and the money as folders travelling in a tube.
 * Red is only ever the money's route (and, from shot 7 on, the one thing each sentence is about).
 */
import { type Iso, type Pt, type SceneArgs, type SceneFn, L, clamp01, count, cue, dim, easeBack, easeIn, easeInOut, easeOut, figure, ink, isoBox, isoFloor, isoPt, lamp, lerp, pool, prog, red, rnd, stamp, text, trace, typeOn } from '@/components/gallery/filmKit'

type C = CanvasRenderingContext2D
type V3 = [number, number, number]
const TAU = Math.PI * 2
const isTall = (a: SceneArgs) => a.H > a.W * 0.9
const SERIF = '"Playfair Display", Georgia, serif'
const MONO = '"JetBrains Mono", ui-monospace, monospace'

// ── small kit extensions ────────────────────────────────────────────────────────────────────

function poly(ctx: C, pts: Pt[], fill?: string | CanvasGradient, stroke?: string, lw = 1) {
  ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath()
  if (fill) { ctx.fillStyle = fill; ctx.fill() }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke() }
}
/** quad in the plane y = Y (a face looking down-left) / x = X (looking down-right). */
const fqy = (o: Iso, x0: number, x1: number, Y: number, z0: number, z1: number): Pt[] => [isoPt(o, x0, Y, z0), isoPt(o, x1, Y, z0), isoPt(o, x1, Y, z1), isoPt(o, x0, Y, z1)]
const fqx = (o: Iso, X: number, y0: number, y1: number, z0: number, z1: number): Pt[] => [isoPt(o, X, y0, z0), isoPt(o, X, y1, z0), isoPt(o, X, y1, z1), isoPt(o, X, y0, z1)]

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

/** A red pool of light on the floor (the kit's pool() is bone only). */
function rpool(ctx: C, a: SceneArgs, o: Iso, x: number, y: number, r: number, al: number) {
  if (al <= 0.005) return
  const c = isoPt(o, x, y), rx = r * o.u * 1.2
  ctx.save(); ctx.translate(c[0], c[1]); ctx.scale(1, 0.58)
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx); g.addColorStop(0, red(a, al)); g.addColorStop(1, red(a, 0))
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, rx, 0, TAU); ctx.fill(); ctx.restore()
}

function vignette(ctx: C, a: SceneArgs, k = 0.8) {
  const g = ctx.createRadialGradient(a.W * 0.5, a.H * 0.42, Math.min(a.W, a.H) * 0.3, a.W * 0.5, a.H * 0.42, Math.max(a.W, a.H) * 0.78)
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${k})`)
  ctx.fillStyle = g; ctx.fillRect(0, 0, a.W, a.H)
}

/** Slow camera: the world origin pans across the shot. */
function cam(a: SceneArgs, cx: number, cy: number, u: number, panX: number, panY = 0): Iso {
  const t = easeInOut(clamp01(a.ls / a.dur)) - 0.5
  return { ox: a.W * cx - t * panX * a.W, oy: a.H * cy - t * panY * a.H, u }
}

/** Cards float: a small bob. */
const bob = (a: SceneArgs, seed: number) => Math.sin(a.ls * 0.0013 + seed * 1.9) * 2.6 * a.KF

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
/** leader target on the near edge of a card. */
const edge = (r: Rect, from: Pt): Pt => [Math.max(r.x + 6, Math.min(r.x + r.w - 6, from[0])), from[1] > r.y + r.h ? r.y + r.h : r.y]

/** An opaque isoBox: the silhouette is filled with the ground first, so stacked boxes don't read as glass. */
function solidBox(ctx: C, a: SceneArgs, o: Iso, x: number, y: number, w: number, d: number, h: number, s: { alpha?: number; accent?: boolean; z?: number; lit?: number } = {}) {
  const al = s.alpha ?? 1, z = s.z ?? 0
  if (al <= 0.01 || h <= 0) return
  const P = (px: number, py: number, pz: number) => isoPt(o, px, py, pz)
  ctx.save(); ctx.globalAlpha *= al
  poly(ctx, [P(x, y, z + h), P(x + w, y, z + h), P(x + w, y, z), P(x + w, y + d, z), P(x, y + d, z), P(x, y + d, z + h)], a.pal.bg)
  ctx.restore()
  isoBox(ctx, a, o, x, y, w, d, h, s)
}

/** A miniature person with a contact shadow. */
function person(ctx: C, a: SceneArgs, o: Iso, x: number, y: number, s: { al?: number; accent?: boolean; h?: number } = {}) {
  const al = s.al ?? 1
  if (al <= 0.01) return
  const f = isoPt(o, x, y), w = (s.h ?? 0.9) * o.u * 0.3
  ctx.fillStyle = `rgba(0,0,0,${0.55 * al})`; ctx.beginPath(); ctx.ellipse(f[0], f[1], w * 0.9, w * 0.38, 0, 0, TAU); ctx.fill()
  figure(ctx, a, o, x, y, { alpha: al, accent: s.accent, h: s.h })
}

/** World-space 3D path walker. */
function walk3(pts: V3[], t: number): V3 {
  let total = 0
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2])
  let d = clamp01(t) * total
  for (let i = 1; i < pts.length; i++) {
    const s = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2])
    if (d <= s || i === pts.length - 1) { const u = s ? clamp01(d / s) : 0; return [lerp(pts[i - 1][0], pts[i][0], u), lerp(pts[i - 1][1], pts[i][1], u), lerp(pts[i - 1][2], pts[i][2], u)] }
    d -= s
  }
  return pts[pts.length - 1]
}

/** Window grid on the two lit faces of a box. */
function windows(ctx: C, a: SceneArgs, o: Iso, x: number, y: number, w: number, d: number, h: number, al: number, seed: number, on = 0.5, z0 = 0) {
  if (al <= 0.01) return
  const rows = Math.max(1, Math.round(h * 1.4)), cx = Math.max(1, Math.round(w * 1.6)), cy = Math.max(1, Math.round(d * 1.6))
  let k = 0
  const win = (pts: Pt[]) => {
    const lit = rnd(seed * 17 + k * 1.37) < on
    const fl = lit ? 0.4 + 0.15 * Math.sin(a.ls * 0.0017 + k * 2.3) : 0
    poly(ctx, pts, lit ? ink(a, fl * al) : `rgba(0,0,0,${0.5 * al})`)
    k++
  }
  for (let r = 0; r < rows; r++) {
    const za = z0 + ((r + 0.3) / rows) * h, zb = z0 + ((r + 0.74) / rows) * h
    for (let i = 0; i < cx; i++) win(fqy(o, x + ((i + 0.28) / cx) * w, x + ((i + 0.72) / cx) * w, y + d, za, zb))
    for (let i = 0; i < cy; i++) win(fqx(o, x + w, y + ((i + 0.28) / cy) * d, y + ((i + 0.72) / cy) * d, za, zb))
  }
}

// ── the set pieces ──────────────────────────────────────────────────────────────────────────

/** A ministry: plinth, colonnade on the front face, entablature, pediment. */
function ministry(ctx: C, a: SceneArgs, o: Iso, x: number, y: number, w: number, d: number, h: number, al: number, accent = false) {
  if (al <= 0.01 || h <= 0.05) return
  const P = (px: number, py: number, pz: number) => isoPt(o, px, py, pz)
  const c = (v: number) => (accent ? red(a, v) : ink(a, v))
  ctx.save(); ctx.globalAlpha *= al
  solidBox(ctx, a, o, x - 0.15, y - 0.15, w + 0.3, d + 0.3, 0.16, { lit: 0.7 })
  const z0 = 0.16, bh = h * 0.74
  solidBox(ctx, a, o, x, y, w, d, bh, { z: z0, lit: 0.55, accent })
  windows(ctx, a, o, x, y, w, d, bh * 0.85, 0.8, Math.round(x * 7 + y * 3), 0.35, z0 + bh * 0.1)
  poly(ctx, fqy(o, x + 0.08, x + w - 0.08, y + d, z0, z0 + bh * 0.94), 'rgba(0,0,0,0.6)')
  const n = Math.max(4, Math.round(w * 1.8))
  for (let i = 0; i < n; i++) { const cx = x + 0.18 + (i * (w - 0.36)) / (n - 1); isoBox(ctx, a, o, cx - 0.06, y + d + 0.02, 0.12, 0.12, bh * 0.94, { z: z0, lit: 1, accent }) }
  solidBox(ctx, a, o, x - 0.08, y - 0.08, w + 0.16, d + 0.28, 0.18, { z: z0 + bh, lit: 0.9, accent })
  const top = z0 + bh + 0.18, gh = Math.min(w, d) * 0.32, Y = y + d + 0.2
  poly(ctx, [P(x + w / 2, y - 0.08, top + gh), P(x + w / 2, Y, top + gh), P(x + w + 0.08, Y, top), P(x + w + 0.08, y - 0.08, top)], c(0.6), c(0.4))
  poly(ctx, [P(x - 0.08, Y, top), P(x + w + 0.08, Y, top), P(x + w / 2, Y, top + gh)], a.pal.bg)
  poly(ctx, [P(x - 0.08, Y, top), P(x + w + 0.08, Y, top), P(x + w / 2, Y, top + gh)], c(0.26), c(0.5))
  ctx.restore()
}
const ministryTop = (o: Iso, x: number, y: number, w: number, d: number, h: number): Pt => isoPt(o, x + w / 2, y + d + 0.2, 0.16 + h * 0.74 + 0.18 + Math.min(w, d) * 0.32)

/** A university: body, windows, drum, dome. */
function university(ctx: C, a: SceneArgs, o: Iso, x: number, y: number, w: number, d: number, h: number, al: number, s: { lit?: number; noDome?: boolean } = {}) {
  if (al <= 0.01 || h <= 0.05) return
  ctx.save(); ctx.globalAlpha *= al
  const k = s.lit ?? 0.65
  solidBox(ctx, a, o, x, y, w, d, h, { lit: k })
  windows(ctx, a, o, x, y, w, d, h * 0.82, 1, Math.round(x * 5 + y * 11), 0.25 + 0.5 * k, h * 0.08)
  const cx = x + w / 2, cy = y + d / 2, sd = Math.min(w, d) * 0.46
  if (!s.noDome) {
    solidBox(ctx, a, o, cx - sd / 2, cy - sd / 2, sd, sd, 0.3, { z: h, lit: k + 0.15 })
    const c = isoPt(o, cx, cy, h + 0.3), rx = sd * 0.62 * o.u * 1.22
    const g = ctx.createLinearGradient(c[0] - rx, 0, c[0] + rx, 0)
    g.addColorStop(0, ink(a, 0.16 * k + 0.08)); g.addColorStop(0.7, ink(a, 0.75 * k + 0.1)); g.addColorStop(1, ink(a, 0.4 * k + 0.1))
    ctx.beginPath(); ctx.ellipse(c[0], c[1], rx, rx * 0.95, 0, Math.PI, TAU); ctx.ellipse(c[0], c[1], rx, rx * 0.42, 0, 0, Math.PI); ctx.closePath()
    ctx.fillStyle = a.pal.bg; ctx.fill(); ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = ink(a, 0.5); ctx.lineWidth = 1; ctx.stroke()
    ctx.strokeStyle = ink(a, 0.7); ctx.beginPath(); ctx.moveTo(c[0], c[1] - rx * 0.95); ctx.lineTo(c[0], c[1] - rx * 1.3); ctx.stroke()
  }
  ctx.restore()
}

/** A storefront office: a box with a blank sign, a dark window and a dark door on the face y+d. */
function store(ctx: C, a: SceneArgs, o: Iso, x: number, y: number, w: number, d: number, h: number, al: number, s: { lit?: number; accent?: boolean; door?: number } = {}) {
  if (al <= 0.01 || h <= 0.02) return
  ctx.save(); ctx.globalAlpha *= al
  solidBox(ctx, a, o, x, y, w, d, h, { lit: s.lit ?? 0.55, accent: s.accent })
  const Y = y + d
  poly(ctx, fqy(o, x + w * 0.06, x + w * 0.94, Y, h * 0.74, h * 0.92), s.accent ? red(a, 0.3) : ink(a, 0.16))
  poly(ctx, fqy(o, x + w * 0.1, x + w * 0.48, Y, h * 0.2, h * 0.62), 'rgba(0,0,0,0.78)')
  poly(ctx, fqy(o, x + w * 0.58, x + w * 0.88, Y, 0, h * 0.62), 'rgba(0,0,0,0.85)')
  if (s.door && s.door > 0) poly(ctx, fqy(o, x + w * 0.6, x + w * 0.86, Y, 0, h * 0.6), red(a, 0.55 * s.door))
  ctx.restore()
}

/** A pneumatic tube along a world path (drawn up to fraction p). */
function tube(ctx: C, a: SceneArgs, o: Iso, path: V3[], p: number, al: number, accent = false) {
  if (p <= 0 || al <= 0.01) return
  const pts = path.map((q) => isoPt(o, q[0], q[1], q[2])), w = o.u * 0.2
  trace(ctx, pts, p, { color: `rgba(0,0,0,${0.6 * al})`, width: w * 1.4 })
  trace(ctx, pts, p, { color: accent ? red(a, 0.32 * al) : ink(a, 0.16 * al), width: w })
  ctx.save(); ctx.translate(0, -w * 0.3)
  trace(ctx, pts, p, { color: accent ? red(a, 0.65 * al) : ink(a, 0.42 * al), width: Math.max(1, w * 0.16) })
  ctx.restore()
}
/** Folders riding a path: n of them, phase from ls. `upto` hides any past that fraction. */
function folders(ctx: C, a: SceneArgs, o: Iso, path: V3[], n: number, speed: number, al: number, accent: boolean, upto = 1, sz = 0.26) {
  if (al <= 0.01) return
  for (let i = 0; i < n; i++) {
    const t = (a.ls * speed + i / n) % 1
    if (t > upto) continue
    const q = walk3(path, t), fade = Math.min(1, t * 8, (upto - t) * 8)
    isoBox(ctx, a, o, q[0] - sz / 2, q[1] - sz * 0.36, sz, sz * 0.72, sz * 0.3, { z: q[2] - sz * 0.15, alpha: al * fade, accent, lit: 1.1 })
  }
}
/** One folder at a world point. */
function folderAt(ctx: C, a: SceneArgs, o: Iso, q: V3, al: number, accent = true, sz = 0.42) {
  if (al <= 0.01) return
  isoBox(ctx, a, o, q[0] - sz / 2, q[1] - sz * 0.36, sz, sz * 0.72, sz * 0.22, { z: q[2], alpha: al, accent, lit: 1.15 })
  isoBox(ctx, a, o, q[0] - sz / 2, q[1] - sz * 0.36, sz * 0.38, sz * 0.72, sz * 0.06, { z: q[2] + sz * 0.22, alpha: al, accent, lit: 1.2 })
}

/** The planning table every model stands on. */
function table(ctx: C, a: SceneArgs, o: Iso, x0: number, y0: number, x1: number, y1: number, al: number) {
  if (al <= 0.01) return
  ctx.save(); ctx.globalAlpha *= al
  solidBox(ctx, a, o, x0, y0, x1 - x0, y1 - y0, 0.35, { z: -0.35, lit: 0.32 })
  ctx.restore()
}

// ── 0 · THE CONTRACT — a model district: ministry, empty tender board, companies, university ────
const need: SceneFn = (ctx, a) => {
  const { ls, W, H, KF } = a
  const tall = isTall(a), c0 = cue(a, 0), c1 = cue(a, 1), c2 = cue(a, 2), c3 = cue(a, 3)
  const u = tall ? W * 0.058 : Math.min(W * 0.062, H * 0.108)
  const o = cam(a, tall ? 0.5 : 0.47, tall ? 0.56 : 0.6, u, 0.05)
  const b = easeOut(prog(ls, 0, 1300))
  const hire = easeOut(prog(ls, c3 + 200, 900))
  isoFloor(ctx, a, o, 11, 0.1 * b)
  pool(ctx, a, o, -3.6, 0.4, 3.6, 0.2 * b)
  pool(ctx, a, o, 3.4, -2.2, 3.2, 0.06 + 0.18 * hire)
  ministry(ctx, a, o, -5.2, -0.6, 3, 2, 2.1 * b, b)
  // the tender board: posted nothing
  const bb = easeOut(prog(ls, 400, 900))
  if (bb > 0) {
    ctx.save(); ctx.globalAlpha *= bb
    for (const lx of [-1.05, 0.05]) isoBox(ctx, a, o, lx, -1.52, 0.08, 0.08, 1.45, { lit: 0.8 })
    solidBox(ctx, a, o, -1.15, -1.62, 1.35, 0.1, 1.0, { z: 0.5, lit: 0.45 })
    const lit = prog(ls, c1, 600)
    const sheet = fqy(o, -1.0, 0.05, -1.51, 0.6, 1.4)
    ctx.setLineDash([4 * KF, 4 * KF]); poly(ctx, sheet, `rgba(0,0,0,${0.4 * lit})`, ink(a, 0.25 + 0.5 * lit), Math.max(1, KF)); ctx.setLineDash([])
    ctx.restore()
  }
  university(ctx, a, o, 2.0, -3.4, 2.8, 2.2, 1.4 * b, b, { lit: 0.35 + 0.5 * hire })
  // the route: ministry → university, drawn on the voice
  const path: V3[] = [[-2.05, 0.4, 0.05], [3.4, 0.4, 0.05], [3.4, -1.1, 0.05]]
  const pp = easeInOut(prog(ls, c3 + 150, 1500))
  if (pp > 0) trace(ctx, path.map((q) => isoPt(o, q[0], q[1], 0.02)), pp, { color: red(a, 0.7), width: Math.max(2, u * 0.07), dash: [u * 0.18, u * 0.12] })
  const fq = pp > 0 ? walk3(path, pp) : ([-1.95, 0.4, 0] as V3)
  folderAt(ctx, a, o, [fq[0], fq[1], fq[2] + 0.06 + Math.sin(ls * 0.004) * 0.04], easeOut(prog(ls, c0 + 700, 600)))
  // three companies, never called
  const cb = easeOut(prog(ls, c2 - 300, 800)), off = prog(ls, c2 + 500, 800)
  for (let i = 0; i < 3; i++) store(ctx, a, o, -1.1 + i * 1.35, 1.7, 1.0, 0.9, 0.85 * cb, cb, { lit: 0.6 - 0.35 * off })
  vignette(ctx, a, 0.8)
  // cards
  const mt = ministryTop(o, -5.2, -0.6, 3, 2, 2.1)
  const p0 = prog(ls, c0 + 500, 600)
  if (p0 > 0) {
    const r = evCard(ctx, a, tall ? W * 0.05 : W * 0.04, H * 0.12 + bob(a, 1), [{ s: '2013', size: tall ? 26 : 34, font: 'serif', color: ink(a, 0.97) }, { s: L(a, 'FEDERAL MINISTRY · A SERVICE', 'SECRETARÍA FEDERAL · UN SERVICIO'), size: 10.5, color: dim(a, 0.95) }], { al: p0 })
    leader(ctx, a, [mt[0], mt[1] - 4 * KF], edge(r, mt), p0)
  }
  const bt = isoPt(o, -0.45, -1.55, 1.55)
  const p1 = prog(ls, c1 + 200, 600)
  if (p1 > 0) {
    const r = evCard(ctx, a, bt[0], tall ? H * 0.25 : H * 0.17 + bob(a, 2), [{ s: L(a, 'NO TENDER', 'SIN LICITACIÓN'), size: 12, color: ink(a, 0.9), weight: 700 }], { al: p1, align: 'center' })
    leader(ctx, a, bt, edge(r, bt), p1)
  }
  const sp = isoPt(o, 1.6, 2.6, 0.9)
  const p2 = prog(ls, c2 + 200, 600)
  if (p2 > 0) {
    const r = evCard(ctx, a, tall ? W * 0.95 : sp[0] + 70 * KF, tall ? H * 0.64 : H * 0.66 + bob(a, 3), [{ s: L(a, 'NO COMPANY', 'NINGUNA EMPRESA'), size: 12, color: ink(a, 0.9), weight: 700 }], { al: p2 * (tall ? 1 - hire : 1), align: tall ? 'right' : 'left' })
    if (!tall || hire < 1) leader(ctx, a, sp, [r.x, r.y + r.h / 2], p2 * (tall ? 1 - hire : 1))
  }
  const ut = isoPt(o, 3.4, -2.3, 2.6)
  const p3 = prog(ls, c3 + 300, 600)
  if (p3 > 0) {
    const r = evCard(ctx, a, tall ? W * 0.95 : ut[0] + 50 * KF, (tall ? H * 0.6 : H * 0.12) + bob(a, 4), [{ s: L(a, 'A UNIVERSITY', 'UNA UNIVERSIDAD'), size: tall ? 20 : 26, font: 'serif', color: red(a, 0.97) }, { s: L(a, 'HIRED DIRECTLY', 'CONTRATADA DIRECTAMENTE'), size: 10.5, color: ink(a, 0.85) }], { al: p3, accent: true, align: tall ? 'right' : 'left' })
    leader(ctx, a, ut, edge(r, ut), p3, true)
  }
}

// ── 1 · THE LOOPHOLE — a fence with a bidding booth; one gate opens for the university only ─────
const loophole: SceneFn = (ctx, a) => {
  const { ls, W, H, KF } = a
  const tall = isTall(a), c0 = cue(a, 0), c1 = cue(a, 1), c2 = cue(a, 2), c3 = cue(a, 3)
  const u = tall ? W * 0.058 : Math.min(W * 0.058, H * 0.102)
  const o = cam(a, tall ? 0.5 : 0.47, tall ? 0.5 : 0.5, u, 0.06)
  const b = easeOut(prog(ls, 0, 1300))
  const open = easeOut(prog(ls, c1 + 600, 1400))
  const trust = easeOut(prog(ls, c2, 900))
  isoFloor(ctx, a, o, 11, 0.1 * b)
  pool(ctx, a, o, 2.6, 0.4, 3.4, 0.1 + 0.12 * trust)
  rpool(ctx, a, o, 3.4, 1.0, 1.8, 0.16 * open)
  // beyond the fence: the university
  university(ctx, a, o, 1.6, -3.6, 3.0, 2.0, 1.5 * b, b, { lit: 0.35 + 0.5 * trust })
  // the fence along y = 1, posts and two rails, with a gap at the gate x ∈ [2.75, 4.05]
  const fy = 1.0, P = (x: number, y: number, z: number) => isoPt(o, x, y, z)
  const runs: [number, number][] = [[-6.5, 2.7], [4.1, 7]]
  ctx.save(); ctx.globalAlpha *= b
  for (const [x0, x1] of runs) {
    for (const z of [0.35, 0.75]) { const p0 = P(x0, fy, z), p1 = P(x1, fy, z); ctx.strokeStyle = ink(a, 0.45); ctx.lineWidth = Math.max(1, 1.4 * KF); ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.stroke() }
    for (let x = x0; x <= x1 + 0.01; x += 0.55) isoBox(ctx, a, o, x - 0.04, fy - 0.04, 0.08, 0.08, 0.9, { lit: 0.8 })
  }
  ctx.restore()
  // the bidding booth on the fence, companies queued in front of it (left)
  solidBox(ctx, a, o, -2.6, fy - 0.5, 1.4, 1.0, 1.15 * b, { alpha: b, lit: 0.55 })
  poly(ctx, fqy(o, -2.4, -1.4, fy + 0.5, 0.5, 0.95), `rgba(0,0,0,${0.7 * b})`)
  for (let i = 0; i < 6; i++) {
    const qx = -1.9 + Math.sin(i * 1.7) * 0.12, qy = fy + 1.0 + i * 0.62, ap = prog(ls, 300 + i * 120, 500)
    const sh = Math.sin(ls * 0.003 + i) * 0.03
    person(ctx, a, o, qx + sh, qy, { al: ap * 0.85 })
    if (ap > 0) isoBox(ctx, a, o, qx + 0.18 + sh, qy - 0.1, 0.22, 0.16, 0.24, { z: 0.38, alpha: ap * 0.8, lit: 0.8 })
  }
  // the gate swings, the university's folder goes straight through
  {
    const gx = 3.4, half = 0.62, th = open * 1.25
    for (const side of [-1, 1]) {
      const hx = gx + side * half * 1.05, ex = hx - side * Math.cos(th) * half, ey = fy - Math.sin(th) * half
      poly(ctx, [P(hx, fy, 0.05), P(ex, ey, 0.05), P(ex, ey, 0.85), P(hx, fy, 0.85)], red(a, 0.1 + 0.12 * open), red(a, 0.6 + 0.35 * open), Math.max(1, 1.2 * KF))
      for (let k = 1; k < 5; k++) { const t = k / 5, p0 = P(lerp(hx, ex, t), lerp(fy, ey, t), 0.05), p1 = P(lerp(hx, ex, t), lerp(fy, ey, t), 0.85); ctx.strokeStyle = red(a, 0.6); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.stroke() }
    }
    for (const side of [-1, 1]) solidBox(ctx, a, o, gx + side * half * 1.05 - 0.09, fy - 0.09, 0.18, 0.18, 1.15 * b, { alpha: b, lit: 0.95 })
  }
  const lane: V3[] = [[3.4, 5.5, 0.1], [3.4, -1.6, 0.1]]
  const fp = easeInOut(prog(ls, c1 + 1300, 2600))
  if (open > 0.02) trace(ctx, lane.map((q) => isoPt(o, q[0], q[1], 0.02)), Math.max(fp, 0.001) * 1, { color: red(a, 0.45), width: Math.max(2, u * 0.06), dash: [u * 0.18, u * 0.12] })
  const fq = walk3(lane, 0.08 + fp * 0.92)
  folderAt(ctx, a, o, [fq[0], fq[1], fq[2] + Math.sin(ls * 0.004) * 0.04], prog(ls, c0 + 300, 600))
  vignette(ctx, a, 0.8)
  // cards: the law, the exemption, the trust, the stamp
  const p0 = prog(ls, c0 + 200, 500) * (1 - prog(ls, c1 + 300, 400))
  if (p0 > 0) evCard(ctx, a, W * 0.5, H * 0.13 + bob(a, 1), [{ s: L(a, 'LEGAL', 'LEGAL'), size: tall ? 28 : 38, font: 'serif', color: ink(a, 0.97) }], { al: p0, align: 'center' })
  const gt = P(3.4, fy, 1.2)
  const p1 = prog(ls, c1 + 400, 600)
  if (p1 > 0) {
    const r = evCard(ctx, a, tall ? W * 0.5 : W * 0.96, H * 0.12 + bob(a, 2), [
      { s: L(a, 'PROCUREMENT LAW', 'LEY DE ADQUISICIONES'), size: 10.5, color: dim(a, 0.95) },
      { s: L(a, 'Exempt from bidding:', 'Exentos de licitación:'), size: tall ? 16 : 22, font: 'serif', color: ink(a, 0.95) },
      { s: L(a, 'public universities', 'universidades públicas'), size: tall ? 16 : 22, font: 'serif', color: red(a, 0.97) },
    ], { al: p1, accent: true, align: tall ? 'center' : 'right', pad: 14 })
    leader(ctx, a, gt, edge(r, gt), prog(ls, c1 + 800, 600), true)
  }
  const bk = P(-1.9, fy - 0.5, 1.2)
  const pb = prog(ls, c1 + 1000, 600)
  if (pb > 0 && !tall) {
    const r = evCard(ctx, a, W * 0.04, H * 0.13 + bob(a, 3), [{ s: L(a, 'COMPETITIVE BIDDING', 'LICITACIÓN'), size: 10.5, color: ink(a, 0.85) }], { al: pb })
    leader(ctx, a, bk, edge(r, bk), pb)
  }
  const ut = P(3.1, -2.6, 2.4)
  const p2 = prog(ls, c2 + 200, 600)
  if (p2 > 0) {
    const r = evCard(ctx, a, tall ? W * 0.95 : ut[0] + 70 * KF, tall ? H * 0.3 : H * 0.42 + bob(a, 4), [{ s: L(a, 'A TRUSTED', 'INSTITUCIÓN'), size: 10.5, color: ink(a, 0.9) }, { s: L(a, 'PUBLIC INSTITUTION', 'PÚBLICA DE CONFIANZA'), size: 10.5, color: ink(a, 0.9) }], { al: p2, align: tall ? 'right' : 'left' })
    if (!tall) leader(ctx, a, ut, [r.x, r.y + r.h / 2], p2)
  }
  const sp = prog(ls, c3 + 150, 450)
  if (sp > 0) { const s0 = P(0.6, fy + 3.2, 0.4); stamp(ctx, a, L(a, 'NO CONTEST', 'SIN CONCURSO'), s0[0], Math.min(s0[1], H * 0.66), { size: (tall ? 14 : 20) * KF, p: sp, rot: -0.09 }) }
}

// ── 2 · THE PASS — the university in cutaway: empty desks, the folder crosses and leaves by the back ──
const pass: SceneFn = (ctx, a) => {
  const { ls, W, H, KF } = a
  const tall = isTall(a), c1 = cue(a, 1), c2 = cue(a, 2), c3 = cue(a, 3), c4 = cue(a, 4)
  const u = tall ? W * 0.058 : Math.min(W * 0.052, H * 0.092)
  const o = cam(a, tall ? 0.46 : 0.42, tall ? 0.5 : 0.48, u, 0.05)
  const b = easeOut(prog(ls, 0, 1200))
  const P = (x: number, y: number, z: number) => isoPt(o, x, y, z)
  // the room x ∈ [-3, 2.5], y ∈ [-2.5, 2.5]; back walls x = -3 and y = -2.5, low front walls
  const X0 = -3, X1 = 2.5, Y0 = -2.5, Y1 = 2.5, WH = 2.0
  isoFloor(ctx, a, o, 10, 0.09 * b)
  poly(ctx, [P(X0, Y0, 0), P(X1, Y0, 0), P(X1, Y1, 0), P(X0, Y1, 0)], ink(a, 0.05 * b))
  pool(ctx, a, o, -0.3, 0, 3.4, 0.2 * b)
  // back walls, seen from inside, with doors: a front door on x = X0 and a back door on y = Y0
  poly(ctx, fqx(o, X0, Y0, Y1, 0, WH * b), ink(a, 0.2 * b), ink(a, 0.3 * b))
  poly(ctx, fqy(o, X0, X1, Y0, 0, WH * b), ink(a, 0.3 * b), ink(a, 0.3 * b))
  const backDoor = easeOut(prog(ls, c1 - 300, 700))
  poly(ctx, fqx(o, X0, 0.3, 1.3, 0, 1.4 * b), `rgba(0,0,0,${0.8 * b})`)
  poly(ctx, fqy(o, 0.6, 1.6, Y0, 0, 1.4 * b), backDoor > 0 ? red(a, 0.12 + 0.3 * backDoor) : `rgba(0,0,0,${0.8 * b})`, red(a, 0.6 * backDoor))
  if (b > 0.7) onFace(ctx, P(-2.6, Y0, 1.65), 'x', () => text(ctx, L(a, 'UNIVERSITY', 'UNIVERSIDAD'), 0, 0, { size: u * 0.26, font: 'mono', weight: 700, color: ink(a, 0.7), tracking: u * 0.03, baseline: 'middle' }))
  // the empty desks
  for (let r = 0; r < 3; r++) for (let k = 0; k < 4; k++) {
    const dx = -2.3 + k * 1.15, dy = -1.6 + r * 1.25, ap = prog(ls, 250 + (r * 4 + k) * 70, 500)
    if (ap <= 0) continue
    isoBox(ctx, a, o, dx, dy, 0.75, 0.45, 0.06, { z: 0.5, alpha: ap, lit: 0.9 })
    isoBox(ctx, a, o, dx + 0.05, dy + 0.05, 0.06, 0.06, 0.5, { alpha: ap * 0.7 })
    isoBox(ctx, a, o, dx + 0.64, dy + 0.34, 0.06, 0.06, 0.5, { alpha: ap * 0.7 })
    isoBox(ctx, a, o, dx + 0.2, dy + 0.6, 0.3, 0.28, 0.04, { z: 0.32, alpha: ap * 0.6, lit: 0.6 }) // the empty chair
    isoBox(ctx, a, o, dx + 0.2, dy + 0.84, 0.3, 0.04, 0.35, { z: 0.36, alpha: ap * 0.6, lit: 0.6 })
  }
  // outside the back door: the back street, a storefront office in the dark
  const st = easeOut(prog(ls, c2 - 200, 900))
  store(ctx, a, o, 0.4, -6.2, 1.6, 1.1, 1.0 * st, st, { lit: 0.5, door: prog(ls, c2 + 300, 600) })
  pool(ctx, a, o, 1.2, -4.6, 1.6, 0.08 * st)
  // the folder: in at the front door, across the room, out the back
  const route: V3[] = [[X0 - 1.5, 0.8, 0.6], [X0 + 0.4, 0.8, 0.6], [1.1, 0.8, 0.62], [1.1, Y0 + 0.4, 0.62], [1.1, Y0 - 0.6, 0.4], [1.2, -5.0, 0.2]]
  const t1 = easeInOut(prog(ls, 300, Math.max(800, c1 - 400))) * 0.5, t2 = easeInOut(prog(ls, c1 + 100, 1800)) * 0.5
  const fq = walk3(route, t1 + t2)
  if (t2 > 0) trace(ctx, route.slice(2).map((q) => P(q[0], q[1], 0.01)), easeOut(prog(ls, c1 + 100, 1800)), { color: red(a, 0.55), width: Math.max(2, u * 0.06), dash: [u * 0.16, u * 0.12] })
  folderAt(ctx, a, o, [fq[0], fq[1], fq[2] + Math.sin(ls * 0.004) * 0.04], prog(ls, 200, 400) * (1 - prog(ls, c2 + 400, 500) * 0.4))
  // low front walls drawn last
  solidBox(ctx, a, o, X1, Y0, 0.12, Y1 - Y0, 0.35 * b, { alpha: b, lit: 0.5 })
  solidBox(ctx, a, o, X0, Y1, X1 - X0 + 0.12, 0.12, 0.35 * b, { alpha: b, lit: 0.5 })
  vignette(ctx, a, 0.8)
  // cards
  const dk = P(-0.6, -0.3, 0.6)
  const p0 = prog(ls, 900, 600) * (1 - prog(ls, c2, 500) * (tall ? 1 : 0))
  if (p0 > 0) {
    const r = evCard(ctx, a, tall ? W * 0.05 : W * 0.04, tall ? H * 0.12 : H * 0.62 + bob(a, 1), [{ s: L(a, 'THE WORK', 'EL TRABAJO'), size: 10.5, color: dim(a, 0.95) }, { s: L(a, 'not done here', 'no se hizo aquí'), size: tall ? 18 : 24, font: 'serif', color: ink(a, 0.95) }], { al: p0 })
    leader(ctx, a, dk, edge(r, dk), p0)
  }
  const sf = P(1.2, -5.1, 1.0)
  const ps = prog(ls, c2, 500)
  if (ps > 0) {
    const rows: [string, string, number][] = [[L(a, 'STAFF', 'PERSONAL'), '0', c2], [L(a, 'OFFICES', 'OFICINAS'), '0', c3], [L(a, 'HISTORY', 'HISTORIA'), L(a, 'NONE', 'NINGUNA'), c4]]
    const x = tall ? W * 0.95 : sf[0] + 90 * KF, y = tall ? H * 0.12 : H * 0.14 + bob(a, 2)
    const r = evCard(ctx, a, x, y, [{ s: L(a, 'THE COMPANY', 'LA EMPRESA'), size: 10.5, color: dim(a, 0.95) }, ...rows.map(() => ({ s: L(a, 'HISTORY   NONE', 'HISTORIA   NINGUNA'), size: tall ? 13 : 16, color: 'rgba(0,0,0,0)' }))], { al: ps, accent: true, align: tall ? 'right' : 'left', pad: 14 })
    rows.forEach(([lab, val, at], i) => {
      const q = prog(ls, at + 150, 400)
      if (q <= 0) return
      const yy = r.y + 14 * KF * 0.8 + 10.5 * KF * 1.55 + (i + 0.72) * (tall ? 13 : 16) * KF * 1.55
      mono(ctx, a, lab, r.x + 14 * KF, yy, tall ? 13 : 16, ink(a, 0.9), { alpha: q })
      mono(ctx, a, val, r.x + r.w - 14 * KF, yy, tall ? 13 : 16, red(a, 0.97), { alpha: q, align: 'right', weight: 700 })
    })
    leader(ctx, a, sf, edge(r, sf), ps, true)
  }
}

/** Draw in the plane of a wall: x runs along the wall, y runs down. */
function onFace(ctx: C, at: Pt, dir: 'x' | 'y', draw: () => void) {
  ctx.save(); ctx.translate(at[0], at[1]); ctx.transform(0.866, dir === 'x' ? 0.5 : -0.5, 0, 1, 0, 0); draw(); ctx.restore()
}

// ── 3 · 186 — a back-street grid of storefront offices; a folder hops door to door; no match ───
const shells: SceneFn = (ctx, a) => {
  const { ls, W, H, KF } = a
  const tall = isTall(a), c0 = cue(a, 0), c1 = cue(a, 1), c2 = cue(a, 2)
  const u = tall ? W * 0.04 : Math.min(W * 0.034, H * 0.06)
  const o = cam(a, tall ? 0.5 : 0.56, tall ? 0.36 : 0.3, u, 0.06, 0.02)
  const COLS = 31
  isoFloor(ctx, a, o, 16, 0.08)
  pool(ctx, a, o, 0, 3.2, 9, 0.16)
  // 6 streets × 31 offices = 186; they rise as the voice counts
  const rise = (i: number) => easeOut(prog(ls, c0 + 100 + (i / 186) * 500, 260))
  const pos = (i: number): [number, number] => { const r = Math.floor(i / COLS), k = i % COLS; return [-9 + k * 0.62, -0.5 + r * 1.35] }
  for (let i = 0; i < 186; i++) {
    const [x, y] = pos(i), e = rise(i)
    if (e <= 0) continue
    const h = 0.42 + 0.22 * rnd(i * 3.1)
    isoBox(ctx, a, o, x, y, 0.5, 0.46, h * e, { lit: 0.42 + 0.25 * rnd(i * 1.7) })
    if (e > 0.9) poly(ctx, fqy(o, x + 0.3, x + 0.44, y + 0.46, 0, h * 0.6), 'rgba(0,0,0,0.85)')
  }
  // the money hops from office to office along street 3
  const hop = prog(ls, c1 + 200, Math.max(2000, c2 - c1)), hopA = 1 - prog(ls, c2 + 200, 600)
  if (hop > 0 && hopA > 0) {
    ctx.save(); ctx.globalAlpha *= hopA
    const n = 9, seg = hop * n, k = Math.min(n - 1, Math.floor(seg)), f = seg - k
    const A = pos(2 * COLS + 4 + k * 3), B = pos(2 * COLS + 4 + (k + 1) * 3)
    for (let j = 0; j <= k; j++) { const D = pos(2 * COLS + 4 + j * 3); rpool(ctx, a, o, D[0] + 0.25, D[1] + 0.7, 0.6, 0.3) }
    for (let j = 0; j < 14; j++) { const g = f - j * 0.05; if (g < 0) break; const t: V3 = [lerp(A[0], B[0], g) + 0.25, lerp(A[1], B[1], g) + 0.55, 0.7 + Math.sin(g * Math.PI) * 1.1]; const tp = isoPt(o, t[0], t[1], t[2]); ctx.fillStyle = red(a, 0.6 * (1 - j / 14)); ctx.beginPath(); ctx.arc(tp[0], tp[1], 1.8 * KF, 0, TAU); ctx.fill() }
    const q: V3 = [lerp(A[0], B[0], f) + 0.25, lerp(A[1], B[1], f) + 0.55, 0.7 + Math.sin(f * Math.PI) * 1.1]
    folderAt(ctx, a, o, q, 1, true, 0.5)
    ctx.restore()
  }
  vignette(ctx, a, 0.75)
  // the count lands with "186"
  if (ls > c0) {
    const r = evCard(ctx, a, tall ? W * 0.05 : W * 0.05, tall ? H * 0.5 : H * 0.48 + bob(a, 1), [
      { s: '186', size: tall ? 44 : 64, font: 'serif', color: 'rgba(0,0,0,0)' },
      { s: L(a, 'PAPER COMPANIES', 'EMPRESAS DE PAPEL'), size: 10.5, color: ink(a, 0.85) },
    ], { al: prog(ls, c0, 300), pad: 14 })
    text(ctx, count(186, 1, 0, a.lang), r.x + 14 * KF, r.y + 14 * KF * 0.8 + (tall ? 44 : 64) * KF * 1.12 * 0.86, { size: (tall ? 44 : 64) * KF, color: ink(a, 0.97) })
  }
  const p1 = prog(ls, c1 + 300, 600) * (tall ? 1 - prog(ls, c2, 400) : 1)
  if (p1 > 0) {
    const A = pos(2 * COLS + 4), at = isoPt(o, A[0] + 0.25, A[1] + 0.25, 0.7)
    const r = evCard(ctx, a, tall ? W * 0.95 : W * 0.5, tall ? H * 0.12 : H * 0.12 + bob(a, 2), [{ s: L(a, 'RECEIVE · PASS ON', 'RECIBIR · PASAR'), size: 12, color: ink(a, 0.9), weight: 700 }], { al: p1, align: tall ? 'right' : 'center' })
    leader(ctx, a, at, edge(r, at), p1)
  }
  // the registry card: search the tax ID, nothing comes back
  const p2 = prog(ls, c2 + (tall ? 450 : 100), 600)
  if (p2 > 0) {
    const x = tall ? W * 0.5 : W * 0.95, y = tall ? H * 0.12 : H * 0.42 + bob(a, 3)
    const r = evCard(ctx, a, x, y, [
      { s: L(a, 'FEDERAL TAX REGISTRY', 'PADRÓN FISCAL FEDERAL'), size: 10.5, color: dim(a, 0.95) },
      { s: 'RFC  ████████████', size: tall ? 14 : 17, color: 'rgba(0,0,0,0)' },
      { s: L(a, 'NO MATCH', 'SIN COINCIDENCIA'), size: tall ? 22 : 30, font: 'serif', color: 'rgba(0,0,0,0)' },
    ], { al: p2, accent: true, align: tall ? 'center' : 'right', pad: 14 })
    const y1 = r.y + 14 * KF * 0.8 + 10.5 * KF * 1.55 + (tall ? 14 : 17) * KF * 1.55 * 0.72
    mono(ctx, a, 'RFC', r.x + 14 * KF, y1, tall ? 14 : 17, ink(a, 0.9))
    const bx = r.x + 14 * KF + measure(ctx, 'RFC  ', (tall ? 14 : 17) * KF, 'mono'), bw = r.x + r.w - 14 * KF - bx
    ctx.fillStyle = ink(a, 0.85); ctx.fillRect(bx, y1 - (tall ? 12 : 14) * KF, bw * easeOut(prog(ls, c2 + 300, 600)), (tall ? 13 : 16) * KF)
    const q = prog(ls, c2 + 1000, 400)
    // scanning dots, then the answer
    if (q <= 0) { const dots = '.'.repeat(1 + (Math.floor(ls / 220) % 3)); mono(ctx, a, dots, r.x + 14 * KF, r.y + r.h - 18 * KF, 14, dim(a, 0.9)) }
    text(ctx, L(a, 'NO MATCH', 'SIN COINCIDENCIA'), r.x + 14 * KF, r.y + r.h - 14 * KF, { size: (tall ? 22 : 30) * KF, color: red(a, 0.97), alpha: q })
    if (!tall) { const B = pos(3 * COLS + 22), at = isoPt(o, B[0] + 0.25, B[1] + 0.25, 0.7); leader(ctx, a, at, [r.x, r.y + r.h * 0.6], p2, true) }
  }
}

// ── 4 · ELEVEN AGENCIES — eleven ministries on an arc, each piped into one manifold ────────────
const scale: SceneFn = (ctx, a) => {
  const { ls, W, H, KF } = a
  const tall = isTall(a), c1 = cue(a, 1), c2 = cue(a, 2), c3 = cue(a, 3)
  const u = tall ? W * 0.036 : Math.min(W * 0.034, H * 0.06)
  const o = cam(a, tall ? 0.5 : 0.5, tall ? 0.5 : 0.53, u, 0.05)
  const money = easeOut(prog(ls, c3, 700))
  isoFloor(ctx, a, o, 14, 0.09)
  // the first ministry stands from the start; ten more rise on "eleven"
  const N = 11, R = 6.2, ang = (i: number) => Math.PI * (0.96 + (1.08 * i) / (N - 1)) // back arc
  const spot = (i: number): [number, number] => [Math.cos(ang(i)) * R, Math.sin(ang(i)) * R]
  pool(ctx, a, o, 0, 0, 7, 0.16)
  // hub
  rpool(ctx, a, o, 0, 0, 2.5, 0.2 * money)
  for (let i = 0; i < N; i++) {
    const [x, y] = spot(i)
    const e = i === 5 ? easeOut(prog(ls, 0, 1100)) : easeOut(prog(ls, c1 + 80 * Math.abs(i - 5) * 1.3, 700))
    const pipe: V3[] = [[x, y, 0.15], [x * 0.25, y * 0.25, 0.15], [0, 0, 0.3]]
    tube(ctx, a, o, pipe, e, e, money > 0)
    if (money > 0) folders(ctx, a, o, pipe, 3, 0.00045, money, true, 1, 0.24)
  }
  // agencies drawn back-to-front by depth
  const order = [...Array(N).keys()].sort((p, q) => (spot(p)[0] + spot(p)[1]) - (spot(q)[0] + spot(q)[1]))
  for (const i of order) {
    const [x, y] = spot(i)
    const e = i === 5 ? easeOut(prog(ls, 0, 1100)) : easeOut(prog(ls, c1 + 80 * Math.abs(i - 5) * 1.3, 700))
    const w = 1.5 + 0.4 * rnd(i * 2.3)
    ministry(ctx, a, o, x - w / 2, y - 0.6, w, 1.2, (1.3 + 0.5 * rnd(i * 4.1)) * e, e)
  }
  // the manifold drum and the trunk leaving towards the viewer's right
  solidBox(ctx, a, o, -0.6, -0.6, 1.2, 1.2, 0.9, { lit: 0.5 + 0.3 * money, accent: money > 0 })
  const trunk: V3[] = [[0.6, 0.6, 0.45], [3.6, 3.6, 0.45]]
  tube(ctx, a, o, trunk, 1, 1, money > 0)
  if (money > 0) folders(ctx, a, o, trunk, 5, 0.0003, money, true)
  vignette(ctx, a, 0.75)
  // counters
  const pa = prog(ls, c1 + 300, 400) * (tall ? 1 - prog(ls, c2, 300) : 1)
  if (pa > 0) evCard(ctx, a, W * 0.05, tall ? H * 0.12 : H * 0.12 + bob(a, 1), [{ s: '11', size: tall ? 40 : 56, font: 'serif', color: ink(a, 0.97) }, { s: L(a, 'FEDERAL AGENCIES', 'DEPENDENCIAS FEDERALES'), size: 10.5, color: ink(a, 0.85) }], { al: pa, pad: 14 })
  const py = prog(ls, c2 + 100, 400)
  if (py > 0) {
    const r = evCard(ctx, a, tall ? W * 0.95 : W * 0.95, H * 0.12 + bob(a, 2), [{ s: L(a, '2 years', '2 años'), size: tall ? 26 : 34, font: 'serif', color: ink(a, 0.97) }, { s: '▮▮▮▮▮▮▮▮▮▮▮▮ ▮▮▮▮▮▮▮▮▮▮▮▮', size: 7, color: 'rgba(0,0,0,0)' }], { al: py, align: 'right', pad: 14 })
    // 24 months fill
    const m = Math.round(24 * easeOut(prog(ls, c2 + 200, 900))), cw = (r.w - 28 * KF) / 24
    for (let i = 0; i < 24; i++) { ctx.fillStyle = i < m ? ink(a, 0.85) : ink(a, 0.15); ctx.fillRect(r.x + 14 * KF + i * cw + (i >= 12 ? 2 * KF : 0), r.y + r.h - 20 * KF, cw - 2 * KF, 8 * KF) }
  }
  if (money > 0) {
    const big = tall ? 40 : 60, tp = trunk[1], at = isoPt(o, tp[0] - 0.8, tp[1] - 0.8, tp[2])
    const x = tall ? W * 0.5 : W * 0.95, y = tall ? H * 0.6 : H * 0.5 + bob(a, 3)
    const num = a.lang === 'es' ? count(7670, 1, 0, 'es') : count(7.67, 1, 2, 'en')
    const r = evCard(ctx, a, x, y, [{ s: a.lang === 'es' ? '7,670' : '7.67', size: big, font: 'serif', color: 'rgba(0,0,0,0)' }, { s: L(a, 'BILLION PESOS', 'MILLONES DE PESOS'), size: 11, color: ink(a, 0.9) }], { al: money, accent: true, align: tall ? 'center' : 'right', pad: 14 })
    text(ctx, num, r.x + 14 * KF, r.y + 14 * KF * 0.8 + big * KF * 1.12 * 0.86, { size: big * KF, color: red(a, 0.97) })
    if (!tall) leader(ctx, a, at, [r.x, r.y + r.h / 2], money, true)
  }
}

// ── 5 · THE RETURN — a ring of tube: agency → university → offices → back into the agency ─────
const loop: SceneFn = (ctx, a) => {
  const { ls, W, H, KF } = a
  const tall = isTall(a), c1 = cue(a, 1)
  const u = tall ? W * 0.052 : Math.min(W * 0.046, H * 0.082)
  const o = cam(a, tall ? 0.5 : 0.5, tall ? 0.5 : 0.48, u, 0.05)
  const back = easeInOut(prog(ls, c1 - 400, 1600))
  table(ctx, a, o, -6, -4.6, 6, 4.6, 1)
  pool(ctx, a, o, 0, 0, 6, 0.16)
  rpool(ctx, a, o, -3.2, 2.2, 2.0, 0.2 * back)
  const A: V3 = [-3.0, 0.9, 0.4], U: V3 = [0.4, -2.6, 0.4], S: V3 = [3.6, 1.0, 0.4]
  const out: V3[] = [[-2.6, 0.2, 0.4], [-2.6, -2.2, 0.4], [-0.6, -2.2, 0.4], [1.6, -2.2, 0.4], [3.3, -2.2, 0.4], [3.3, 0.3, 0.4]]
  const ret: V3[] = [[3.6, 2.2, 0.4], [3.6, 3.4, 0.4], [-2.4, 3.4, 0.4], [-2.4, 2.4, 0.4]]
  // ministry cutaway (left/front): the hall where the folders come home
  ministry(ctx, a, o, -4.6, -1.8, 2.4, 2.0, 2.0, 1)
  university(ctx, a, o, -0.4, -4.2, 2.4, 1.6, 1.2, 1, { lit: 0.5 })
  for (let i = 0; i < 3; i++) store(ctx, a, o, 2.7 + i * 0.0, -1.4 + i * 1.0, 1.1, 0.8, 0.75, 1, { lit: 0.45 })
  tube(ctx, a, o, out, 1, 1)
  folders(ctx, a, o, out, 8, 0.00028, 1, false)
  tube(ctx, a, o, ret, back, 1, true)
  if (back > 0.99) folders(ctx, a, o, ret, 6, 0.00036, 1, true)
  // the room inside the same agency: three officials, a red pool
  const room = { x: -4.4, y: 1.6, w: 2.0, d: 1.4 }
  poly(ctx, fqy(o, room.x, room.x + room.w, room.y, 0, 1.1), ink(a, 0.22), ink(a, 0.35))
  poly(ctx, fqx(o, room.x, room.y, room.y + room.d, 0, 1.1), ink(a, 0.14), ink(a, 0.35))
  for (let i = 0; i < 3; i++) person(ctx, a, o, room.x + 0.5 + i * 0.55, room.y + 0.6 + (i % 2) * 0.3, { al: 0.9, accent: back > 0.6 && i === 1, h: 0.8 })
  if (back > 0) { const g0 = isoPt(o, room.x + 1, room.y + 0.7, 0.5); glow(ctx, g0[0], g0[1], u * 2.2, red(a, 0.22 * back), red(a, 0)) }
  solidBox(ctx, a, o, room.x, room.y + room.d, room.w + 0.1, 0.1, 0.3, { lit: 0.5 })
  solidBox(ctx, a, o, room.x + room.w, room.y, 0.1, room.d, 0.3, { lit: 0.5 })
  vignette(ctx, a, 0.8)
  const at = (q: V3) => isoPt(o, q[0], q[1], q[2])
  const p0 = prog(ls, 600, 600)
  if (p0 > 0) {
    const r = evCard(ctx, a, tall ? W * 0.05 : at(A)[0] - 30 * KF, H * 0.12 + bob(a, 1), [{ s: L(a, 'SENT', 'ENVÍA'), size: 12, color: ink(a, 0.9), weight: 700 }], { al: p0, align: tall ? 'left' : 'right' })
    leader(ctx, a, at([-3.4, -0.8, 2.2]), edge(r, at([-3.4, -0.8, 2.2])), p0)
  }
  const pU = prog(ls, 1100, 600)
  if (pU > 0 && !tall) { const r = evCard(ctx, a, at(U)[0], H * 0.12 + bob(a, 2), [{ s: L(a, 'UNIVERSITY', 'UNIVERSIDAD'), size: 10.5, color: dim(a, 0.95) }], { al: pU, align: 'center' }); leader(ctx, a, at([0.8, -3.4, 2.0]), edge(r, at([0.8, -3.4, 2.0])), pU) }
  const pS = prog(ls, 1600, 600)
  if (pS > 0) { const r = evCard(ctx, a, tall ? W * 0.95 : at(S)[0] + 60 * KF, tall ? H * 0.12 : H * 0.22 + bob(a, 3), [{ s: L(a, 'COMPANIES', 'EMPRESAS'), size: 10.5, color: dim(a, 0.95) }], { al: pS, align: tall ? 'right' : 'left' }); leader(ctx, a, at([3.3, 0.6, 0.8]), edge(r, at([3.3, 0.6, 0.8])), pS) }
  const p1 = prog(ls, c1 + 700, 600)
  if (p1 > 0) {
    const rp = at([room.x + 1.05, room.y + 0.9, 1.0])
    const r = evCard(ctx, a, tall ? W * 0.5 : W * 0.04, tall ? H * 0.6 : H * 0.6 + bob(a, 4), [{ s: L(a, 'BACK TO OFFICIALS', 'DE VUELTA A FUNCIONARIOS'), size: 10.5, color: ink(a, 0.85) }, { s: L(a, 'of the same agency', 'de la misma dependencia'), size: tall ? 17 : 22, font: 'serif', color: red(a, 0.97) }], { al: p1, accent: true, align: tall ? 'center' : 'left' })
    leader(ctx, a, rp, edge(r, rp), p1, true)
  }
}

// ── 6 · 2017 — a newsroom table under a lamp; the chain is pinned out; the name types on ───────
const press: SceneFn = (ctx, a) => {
  const { ls, W, H, KF } = a
  const tall = isTall(a), c0 = cue(a, 0), c1 = cue(a, 1), c2 = cue(a, 2), c3 = cue(a, 3)
  const u = tall ? W * 0.06 : Math.min(W * 0.05, H * 0.09)
  const o = cam(a, tall ? 0.5 : 0.52, tall ? 0.56 : 0.52, u, 0.04)
  const b = easeOut(prog(ls, 0, 1200))
  isoFloor(ctx, a, o, 10, 0.07 * b)
  const lt = isoPt(o, 0, 0, 7)
  lamp(ctx, a, lt[0], lt[1], isoPt(o, 0, 0, 0)[1] + u * 2, u * 5.2, 0.12 * b)
  pool(ctx, a, o, 0, 0, 4.4, 0.24 * b)
  // the table
  solidBox(ctx, a, o, -3.6, -2.2, 7.2, 4.4, 0.95 * b, { alpha: b, lit: 0.42 })
  const Z = 0.95
  // pages laid out in the order of the chain: ministry → university → companies → back
  const pages: [number, number][] = [[-2.8, -1.4], [-1.2, -1.6], [0.4, -1.3], [2.0, -1.5], [2.2, 0.2], [0.6, 0.5], [-1.0, 0.3], [-2.6, 0.4]]
  const lay = (i: number) => easeOut(prog(ls, c0 + 300 + i * Math.max(260, (c1 - c0 - 600) / 9), 400))
  pages.forEach(([x, y], i) => {
    const e = lay(i)
    if (e <= 0) return
    isoBox(ctx, a, o, x, y, 1.0, 1.25, 0.02, { z: Z + (1 - e) * 1.5, alpha: e, lit: 1.1 })
    for (let l = 0; l < 5; l++) { const p0 = isoPt(o, x + 0.15, y + 0.25 + l * 0.18, Z + 0.03), p1 = isoPt(o, x + 0.15 + 0.7 * (0.5 + 0.5 * rnd(i * 9 + l)), y + 0.25 + l * 0.18, Z + 0.03); ctx.strokeStyle = `rgba(0,0,0,${0.35 * e})`; ctx.lineWidth = Math.max(1, 1.2 * KF); ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.stroke() }
  })
  // string between pins
  const pins: Pt[] = pages.map(([x, y]) => isoPt(o, x + 0.5, y + 0.35, Z + 0.06))
  const sp = easeInOut(prog(ls, c0 + 900, Math.max(1500, c1 - c0 - 600)))
  trace(ctx, [...pins, pins[0]], sp, { color: dim(a, 0.85), width: Math.max(1, 1.4 * KF) })
  pins.forEach((p, i) => { if (lay(i) > 0.9) { ctx.fillStyle = ink(a, 0.95); ctx.beginPath(); ctx.arc(p[0], p[1], 2.4 * KF, 0, TAU); ctx.fill() } })
  // two reporters at the table edge
  person(ctx, a, o, -3.2, 2.9, { al: b * 0.9 })
  person(ctx, a, o, 2.9, 2.8, { al: b * 0.9 })
  vignette(ctx, a, 0.8)
  // bylines
  const p0 = prog(ls, c0 + 400, 500)
  if (p0 > 0) {
    evCard(ctx, a, W * 0.04, H * 0.12 + bob(a, 1), [{ s: '2017', size: tall ? 24 : 32, font: 'serif', color: ink(a, 0.97) }, { s: 'ANIMAL POLÍTICO', size: 11, color: ink(a, 0.9), weight: 700 }, { s: a.lang === 'es' ? 'MEXICANOS CONTRA LA CORRUPCIÓN' : 'MCCI', size: 11, color: ink(a, 0.9), weight: 700 }], { al: p0, pad: 14 })
  }
  // the name
  const p1 = prog(ls, c1, 500)
  if (p1 > 0) {
    const name = 'LA ESTAFA MAESTRA', big = tall ? 26 : 46
    const ty = typeOn(name, prog(ls, c1 + 250, Math.max(600, c2 + 500 - c1 - 250))) // slow type-on from "gave it a name", complete on the name
    const cx = tall ? W * 0.5 : W * 0.62, cy = tall ? H * 0.27 : H * 0.14 + bob(a, 2)
    const r = evCard(ctx, a, cx, cy, [{ s: name, size: big, font: 'serif', color: 'rgba(0,0,0,0)' }, { s: L(a, 'THE MASTER SCAM', 'THE MASTER SCAM'), size: 11, color: 'rgba(0,0,0,0)' }], { al: p1, accent: true, align: 'center', pad: 16 })
    const by = r.y + 16 * KF * 0.8 + big * KF * 1.12 * 0.86
    text(ctx, ty, r.x + r.w / 2, by, { size: big * KF, color: red(a, 0.97), align: 'center' })
    if (ty.length < name.length && Math.floor(ls / 260) % 2 === 0) { const tw = measure(ctx, ty, big * KF, 'serif'); ctx.fillStyle = red(a, 0.9); ctx.fillRect(r.x + r.w / 2 + tw / 2 + 3 * KF, by - big * KF * 0.75, 2 * KF, big * KF * 0.8) }
    if (a.lang === 'en') mono(ctx, a, 'THE MASTER SCAM', r.x + r.w / 2, r.y + r.h - 12 * KF, 11, ink(a, 0.85), { align: 'center', alpha: prog(ls, c3, 400) })
    const mid = pins[2]
    leader(ctx, a, mid, edge(r, mid), prog(ls, c2 + 600, 600), true)
  }
}

// ── 7 · THE CASE — an empty courtroom model; a calm timeline of four rulings above it ─────────
const court: SceneFn = (ctx, a) => {
  const { ls, W, H, KF } = a
  const tall = isTall(a), c = [cue(a, 0), cue(a, 1), cue(a, 2), cue(a, 3)]
  const u = tall ? W * 0.05 : Math.min(W * 0.04, H * 0.07)
  const o = cam(a, tall ? 0.52 : 0.5, tall ? 0.66 : 0.64, u, 0.04)
  const b = easeOut(prog(ls, 0, 1300))
  isoFloor(ctx, a, o, 11, 0.08 * b)
  pool(ctx, a, o, 0, 0, 5, 0.2 * b)
  // the bench, raised, with a back panel
  solidBox(ctx, a, o, -3.5, -3.6, 7, 0.4, 2.0 * b, { alpha: b, lit: 0.35 })
  solidBox(ctx, a, o, -2.0, -3.0, 4, 1.1, 1.3 * b, { alpha: b, lit: 0.6 })
  solidBox(ctx, a, o, -2.2, -3.1, 4.4, 1.3, 0.12, { z: 1.3 * b, alpha: b, lit: 0.9 })
  // witness box and two tables
  solidBox(ctx, a, o, 2.6, -1.8, 0.9, 0.9, 0.9 * b, { alpha: b, lit: 0.5 })
  for (const tx of [-2.6, 0.6]) {
    isoBox(ctx, a, o, tx, -0.5, 2.0, 0.8, 0.06, { z: 0.7, alpha: b, lit: 0.9 })
    for (const lx of [0.1, 1.82]) isoBox(ctx, a, o, tx + lx, -0.4, 0.08, 0.6, 0.7, { alpha: b * 0.7 })
    const doc = prog(ls, 1200 + tx * 100, 600)
    isoBox(ctx, a, o, tx + 0.6, -0.3, 0.5, 0.4, 0.04, { z: 0.76, alpha: doc, lit: 1.2 })
  }
  // the bar and the gallery, empty
  for (let x = -3.5; x <= 3.51; x += 0.5) isoBox(ctx, a, o, x - 0.03, 0.9, 0.06, 0.06, 0.6, { alpha: b * 0.8 })
  { const p0 = isoPt(o, -3.5, 0.93, 0.6), p1 = isoPt(o, 3.5, 0.93, 0.6); ctx.strokeStyle = ink(a, 0.5 * b); ctx.lineWidth = Math.max(1, 1.4 * KF); ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.stroke() }
  for (let r = 0; r < 3; r++) for (const sx of [-3.4, 0.4]) solidBox(ctx, a, o, sx, 1.5 + r * 0.9, 3.0, 0.4, 0.45, { alpha: b * (0.85 - r * 0.15), lit: 0.45 })
  vignette(ctx, a, 0.8)
  // the timeline: four steps, not to scale
  const steps: { yr: string; en: string; es: string }[] = [
    { yr: '2019', en: 'ARREST', es: 'DETENCIÓN' },
    { yr: '2024', en: 'SUPREME COURT · ACQUITTAL STANDS', es: 'SUPREMA CORTE · ABSOLUCIÓN FIRME' },
    { yr: '—', en: 'A FIRST CONVICTION · OVERTURNED', es: 'PRIMERA CONDENA · REVOCADA' },
    { yr: L(a, 'DEC 2025', 'DIC 2025'), en: 'A SECOND CONVICTION', es: 'SEGUNDA CONDENA' },
  ]
  const cur = c.reduce((k, t, i) => (ls >= t + 200 ? i : k), 0)
  if (!tall) {
    const x0 = W * 0.08, x1 = W * 0.92, y = H * 0.13
    const lp = easeOut(prog(ls, 200, 1200))
    ctx.strokeStyle = ink(a, 0.35); ctx.lineWidth = Math.max(1, KF); ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(lerp(x0, x1, lp), y); ctx.stroke()
    steps.forEach((s, i) => {
      const px = lerp(x0, x1, (i + 0.5) / 4), p = prog(ls, c[i] + 200, 600)
      ctx.fillStyle = i === cur && p > 0 ? red(a, 0.95) : ink(a, p > 0 ? 0.8 : 0.25)
      ctx.beginPath(); ctx.arc(px, y, (i === cur ? 5 : 3.5) * KF, 0, TAU); ctx.fill()
      if (p <= 0) return
      text(ctx, s.yr, px, y + 34 * KF, { size: 26 * KF, color: i === cur ? red(a, 0.97) : ink(a, 0.9), align: 'center', alpha: p })
      L(a, s.en, s.es).split(' · ').forEach((ln, j) => mono(ctx, a, ln, px, y + (54 + j * 15) * KF, 10, ink(a, 0.8), { align: 'center', alpha: p }))
    })
    // 2017 → 2025: eight years
    const p8 = prog(ls, c[3] + 1400, 600)
    if (p8 > 0) {
      const px = lerp(x0, x1, 3.5 / 4)
      mono(ctx, a, L(a, '8 YEARS AFTER THE STORY RAN', '8 AÑOS DESPUÉS DEL REPORTAJE'), px, y + 88 * KF, 10, dim(a, 0.95), { align: 'center', alpha: p8 })
    }
  } else {
    const x0 = W * 0.08, y0 = H * 0.12, step = H * 0.068
    steps.forEach((s, i) => {
      const p = prog(ls, c[i] + 200, 600), y = y0 + i * step
      ctx.fillStyle = i === cur && p > 0 ? red(a, 0.95) : ink(a, p > 0 ? 0.8 : 0.25)
      ctx.beginPath(); ctx.arc(x0, y, (i === cur ? 4.5 : 3) * KF, 0, TAU); ctx.fill()
      if (i < 3) { ctx.strokeStyle = ink(a, 0.3); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x0, y + 5 * KF); ctx.lineTo(x0, y + step - 5 * KF); ctx.stroke() }
      if (p <= 0) return
      text(ctx, s.yr, x0 + 12 * KF, y + 6 * KF, { size: 17 * KF, color: i === cur ? red(a, 0.97) : ink(a, 0.9), alpha: p })
      text(ctx, L(a, s.en, s.es), x0 + 12 * KF + measure(ctx, s.yr + ' ', 17 * KF, 'serif') + 4 * KF, y + 5 * KF, { size: 10 * KF, font: 'mono', color: ink(a, 0.8), tracking: 1.2 * KF, alpha: p, maxWidth: W * 0.9 - x0 - 12 * KF - measure(ctx, s.yr + ' ', 17 * KF, 'serif') })
    })
  }
}

// ── 8 · WHAT THE RECORD SEES — a lit table that stops halfway; the second link sits in the dark ──
const half: SceneFn = (ctx, a) => {
  const { ls, W, H, KF } = a
  const tall = isTall(a), c1 = cue(a, 1), c2 = cue(a, 2), c3 = cue(a, 3)
  const u = tall ? W * 0.046 : Math.min(W * 0.044, H * 0.078)
  const o = cam(a, tall ? 0.5 : 0.5, tall ? 0.46 : 0.47, u, 0.05)
  const b = easeOut(prog(ls, 0, 1200))
  isoFloor(ctx, a, o, 13, 0.06 * b)
  // the long table along x
  const X0 = -7, X1 = 7, MID = 0.2
  solidBox(ctx, a, o, X0, -1.4, X1 - X0, 2.8, 0.3, { z: -0.3, alpha: b, lit: 0.28 })
  // the light covers the first half only
  const lit = easeOut(prog(ls, c1 - 200, 900))
  poly(ctx, [isoPt(o, X0, -1.4), isoPt(o, MID, -1.4), isoPt(o, MID, 1.4), isoPt(o, X0, 1.4)], ink(a, 0.12 * lit))
  pool(ctx, a, o, -3.4, 0, 4.2, 0.22 * lit)
  // agency, university, shell
  ministry(ctx, a, o, -6.2, -1.1, 2.2, 1.6, 1.6, b * (0.4 + 0.6 * lit))
  university(ctx, a, o, -1.6, -1.1, 2.0, 1.6, 1.1, b * (0.4 + 0.6 * lit), { lit: 0.3 + 0.4 * lit })
  store(ctx, a, o, 4.2, -0.9, 1.4, 1.2, 0.9, b * 0.22, { lit: 0.3 })
  // the first contract: a page that stands up between agency and university, a link drawn
  const l1 = easeInOut(prog(ls, c2, 1000))
  trace(ctx, [isoPt(o, -3.8, 0.9, 0.02), isoPt(o, -1.4, 0.9, 0.02)], l1, { color: ink(a, 0.8), width: Math.max(2, u * 0.06) })
  const pg = easeBack(prog(ls, c1 + 200, 700))
  if (pg > 0) {
    const px = -3.0, py = 0.9, ph = 1.5 * clamp01(pg)
    poly(ctx, fqy(o, px, px + 1.0, py, 0, ph), a.pal.bg)
    poly(ctx, fqy(o, px, px + 1.0, py, 0, ph), ink(a, 0.5), ink(a, 0.9), Math.max(1, KF))
    for (let l = 0; l < 5; l++) poly(ctx, fqy(o, px + 0.15, px + 0.15 + 0.6 * (0.5 + 0.5 * rnd(l)), py, ph * (0.75 - l * 0.12), ph * (0.75 - l * 0.12) + 0.04), `rgba(0,0,0,${0.5 * clamp01(pg)})`)
  }
  // the second link: a dashed red line into the dark, no page
  const l2 = easeInOut(prog(ls, c3 + 200, 1400))
  trace(ctx, [isoPt(o, 0.5, 0.9, 0.02), isoPt(o, 4.4, 0.9, 0.02)], l2, { color: red(a, 0.8), width: Math.max(2, u * 0.06), dash: [u * 0.14, u * 0.14] })
  if (l2 > 0.6) {
    const q = prog(ls, c3 + 1100, 600), px = 2.0, py = 0.9, ph = 1.5
    ctx.setLineDash([4 * KF, 4 * KF]); poly(ctx, fqy(o, px, px + 1.0, py, 0, ph), undefined, red(a, 0.75 * q), Math.max(1, KF)); ctx.setLineDash([])
  }
  // the boundary of the light: a hard edge
  const e0 = isoPt(o, MID, -1.4, 0), e1 = isoPt(o, MID, 1.4, 0)
  ctx.strokeStyle = ink(a, 0.35 * lit); ctx.lineWidth = Math.max(1, KF); ctx.beginPath(); ctx.moveTo(e0[0], e0[1]); ctx.lineTo(e1[0], e1[1]); ctx.stroke()
  // darkness beyond the edge
  const g = ctx.createLinearGradient(e1[0], 0, e1[0] + u * 4, 0)
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${0.45 * lit})`)
  ctx.fillStyle = g; ctx.fillRect(e1[0], 0, W, H)
  vignette(ctx, a, 0.8)
  // cards
  const p1 = prog(ls, c1 + 600, 600)
  if (p1 > 0) {
    const at = isoPt(o, -2.5, 0.9, 1.5)
    const r = evCard(ctx, a, tall ? W * 0.05 : W * 0.04, tall ? H * 0.13 : H * 0.6 + bob(a, 1), [{ s: L(a, 'PUBLISHED', 'PUBLICADO'), size: 10.5, color: dim(a, 0.95) }, { s: L(a, 'Agency → university', 'Dependencia → universidad'), size: tall ? 16 : 22, font: 'serif', color: ink(a, 0.95) }], { al: p1 })
    leader(ctx, a, at, edge(r, at), p1)
  }
  const p3 = prog(ls, c3 + 900, 600)
  if (p3 > 0) {
    const at = isoPt(o, 2.5, 0.9, 1.5)
    const r = evCard(ctx, a, tall ? W * 0.95 : W * 0.94, tall ? H * 0.58 : H * 0.12 + bob(a, 2), [{ s: L(a, 'PUBLISHED NOWHERE', 'NO SE PUBLICA'), size: 10.5, color: red(a, 0.95), weight: 700 }, { s: L(a, 'University → shell company', 'Universidad → empresa fachada'), size: tall ? 16 : 22, font: 'serif', color: ink(a, 0.95) }], { al: p3, accent: true, align: 'right' })
    leader(ctx, a, at, edge(r, at), p3, true)
  }
}

// ── 9 · THE SHAPE — a template of three moves, a scanner beam sweeping a city of vendors ───────
const pattern: SceneFn = (ctx, a) => {
  const { ls, W, H, KF } = a
  const tall = isTall(a), c = [0, 1, 2, 3, 4, 5].map((i) => cue(a, i))
  const u = tall ? W * 0.03 : Math.min(W * 0.024, H * 0.036)
  const o = cam(a, tall ? 0.5 : 0.56, tall ? 0.5 : 0.44, u, 0.05)
  const N = 18
  isoFloor(ctx, a, o, 14, 0.06)
  pool(ctx, a, o, 0, 0, 13, 0.14)
  const sweep = prog(ls, c[4] - 200, Math.max(1600, c[5] - c[4]))
  const bx = lerp(-10, 10, sweep)
  // the city: N × N lots
  for (let i = 0; i < N; i++) for (let k = 0; k < N; k++) {
    const x = -9 + i * 1.0, y = -9 + k * 1.0, id = i * N + k
    const h = 0.3 + 1.2 * Math.pow(rnd(id * 2.7), 2.2)
    const match = rnd(id * 5.3) < 0.13
    const hit = match && sweep > 0 && x < bx
    const pulse = hit ? 0.85 + 0.25 * Math.sin(ls * 0.004 + id) : 1
    isoBox(ctx, a, o, x, y, 0.62, 0.62, h, { lit: hit ? 1 : 0.5 + 0.2 * rnd(id), accent: hit, alpha: hit ? pulse : 0.9 })
  }
  // the scanner beam: a vertical plane of light along y
  if (sweep > 0 && sweep < 1) {
    const p0 = isoPt(o, bx, -10, 0), p1 = isoPt(o, bx, 10, 0), q0 = isoPt(o, bx, -10, 3), q1 = isoPt(o, bx, 10, 3)
    const g = ctx.createLinearGradient(0, q0[1], 0, p1[1])
    g.addColorStop(0, ink(a, 0)); g.addColorStop(1, ink(a, 0.2))
    poly(ctx, [p0, p1, q1, q0], g)
    ctx.strokeStyle = ink(a, 0.6); ctx.lineWidth = Math.max(1, KF); ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.stroke()
  }
  vignette(ctx, a, 0.75)
  // the template card: three panels, each drawing its move
  const pt = prog(ls, c[0] + 300, 500)
  if (pt > 0) {
    const pw = (tall ? 82 : 112) * KF, ph = (tall ? 62 : 78) * KF, gap = 8 * KF, pad = 12 * KF
    const cw = pad * 2 + pw * 3 + gap * 2, ch = pad * 2 + ph + 22 * KF + 14 * KF
    const x = tall ? W * 0.5 - cw / 2 : W * 0.04, y = tall ? H * 0.11 : H * 0.12 + bob(a, 1)
    ctx.save(); ctx.globalAlpha *= pt
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(x + 5 * KF, y + 7 * KF, cw, ch)
    ctx.fillStyle = a.pal.bg; ctx.fillRect(x, y, cw, ch); ctx.strokeStyle = ink(a, 0.45); ctx.lineWidth = Math.max(1, 1.1 * KF); ctx.strokeRect(x, y, cw, ch)
    mono(ctx, a, L(a, 'THE SHAPE', 'LA FORMA'), x + pad, y + pad + 8 * KF, 10.5, dim(a, 0.95))
    const labels = [L(a, 'ARRIVE', 'LLEGAR'), L(a, 'WIN BIG', 'GANAR EN GRANDE'), L(a, 'DISAPPEAR', 'DESAPARECER')]
    for (let i = 0; i < 3; i++) {
      const px = x + pad + i * (pw + gap), py = y + pad + 18 * KF, q = easeOut(prog(ls, c[i + 1], 500))
      ctx.strokeStyle = ink(a, 0.2); ctx.strokeRect(px, py, pw, ph)
      if (q <= 0) continue
      const base = py + ph - 8 * KF, cx = px + pw / 2, bw = pw * 0.26
      ctx.fillStyle = ink(a, 0.3); ctx.fillRect(px + 6 * KF, base, pw - 12 * KF, 1)
      if (i === 0) { const hh = ph * 0.22 * q; ctx.fillStyle = ink(a, 0.85); ctx.fillRect(cx - bw / 2, base - hh, bw, hh) } // a new vendor appears
      if (i === 1) { const hh = ph * (0.22 + 0.5 * q); ctx.fillStyle = red(a, 0.9); ctx.fillRect(cx - bw / 2, base - hh, bw, hh) } // wins big
      if (i === 2) { ctx.setLineDash([3 * KF, 3 * KF]); ctx.strokeStyle = ink(a, 0.7 * q); ctx.strokeRect(cx - bw / 2, base - ph * 0.72 * (1 - q * 0.0), bw, ph * 0.72); ctx.setLineDash([]) } // gone
      mono(ctx, a, labels[i], cx, py + ph + 14 * KF, tall ? 8.5 : 10, ink(a, 0.9 * q), { align: 'center', weight: 700 })
    }
    ctx.restore()
  }
  // counts on the voice
  if (ls > c[4]) {
    const big = tall ? 40 : 58
    const r = evCard(ctx, a, tall ? W * 0.05 : W * 0.96, tall ? H * 0.47 : H * 0.42 + bob(a, 2), [{ s: '2,975', size: big, font: 'serif', color: 'rgba(0,0,0,0)' }, { s: L(a, 'VENDORS THAT FIT', 'PROVEEDORES QUE ENCAJAN'), size: 10.5, color: ink(a, 0.85) }], { al: prog(ls, c[4], 300), accent: true, align: tall ? 'left' : 'right', pad: 14 })
    text(ctx, count(2975, 1, 0, a.lang), r.x + 14 * KF, r.y + 14 * KF * 0.8 + big * KF * 1.12 * 0.86, { size: big * KF, color: red(a, 0.97) })
    if (ls > c[5]) {
      const r2 = evCard(ctx, a, tall ? W * 0.95 : r.x + r.w, r.y + r.h + 12 * KF, [{ s: '572', size: big * 0.8, font: 'serif', color: 'rgba(0,0,0,0)' }, { s: L(a, 'BILLION PESOS', 'MIL MILLONES DE PESOS'), size: 10.5, color: ink(a, 0.85) }], { al: prog(ls, c[5], 300), align: 'right', pad: 14 })
      text(ctx, count(572, 1, 0, a.lang), r2.x + 14 * KF, r2.y + 14 * KF * 0.8 + big * 0.8 * KF * 1.12 * 0.86, { size: big * 0.8 * KF, color: ink(a, 0.97) })
    }
  }
}

// ── 10 · NOT ALL OF THEM — a building site and a storefront leave one trace; a reviewer; sealed boxes ──
const caveat: SceneFn = (ctx, a) => {
  const { ls, W, H, KF } = a
  const tall = isTall(a), c1 = cue(a, 1), c2 = cue(a, 2), c3 = cue(a, 3)
  const u = tall ? W * 0.046 : Math.min(W * 0.04, H * 0.07)
  const o = cam(a, tall ? 0.5 : 0.5, tall ? 0.6 : 0.6, u, 0.04)
  const b = easeOut(prog(ls, 0, 1200))
  const seal = easeOut(prog(ls, c3 - 200, 1000))
  isoFloor(ctx, a, o, 12, 0.08 * b)
  // the archive wall behind: sealed boxes stacked, rising on the last sentence
  for (let col = 0; col < 11; col++) for (let row = 0; row < 4; row++) {
    const e = easeOut(prog(ls, c3 - 300 + (col * 4 + row) * 22, 400))
    if (e <= 0) continue
    const x = -0.6 + col * 0.86, y = -4.0
    solidBox(ctx, a, o, x, y, 0.78, 0.7, 0.55, { z: row * 0.58 + (1 - e) * 0.8, alpha: e, lit: 0.55 })
    poly(ctx, fqy(o, x + 0.32, x + 0.46, y + 0.7, row * 0.58 + (1 - e) * 0.8, row * 0.58 + 0.55 + (1 - e) * 0.8), red(a, 0.8 * e))
  }
  pool(ctx, a, o, 0, 0.6, 3.2, 0.22 * easeOut(prog(ls, c2, 800)) + 0.06)
  // left: a builder's site — a big frame, scaffolding, a crane
  const L0 = -4.8, sb = easeOut(prog(ls, c1 - 200, 900))
  pool(ctx, a, o, L0 + 1, -1, 2.8, 0.14 * sb)
  ctx.save(); ctx.globalAlpha *= sb
  solidBox(ctx, a, o, L0, -2.2, 2.2, 1.8, 2.2, { lit: 0.5 })
  ctx.strokeStyle = ink(a, 0.55); ctx.lineWidth = 1
  for (let z = 0.4; z < 2.2; z += 0.45) { const p0 = isoPt(o, L0 - 0.15, -0.3, z), p1 = isoPt(o, L0 + 2.35, -0.3, z), p2 = isoPt(o, L0 + 2.35, -2.3, z); ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.stroke() }
  const m0 = isoPt(o, L0 - 0.6, -2.6, 0), m1 = isoPt(o, L0 - 0.6, -2.6, 2.9), j1 = isoPt(o, L0 + 2.4, -2.6, 2.75), j0 = isoPt(o, L0 - 1.4, -2.6, 2.95)
  ctx.lineWidth = Math.max(1.5, 1.8 * KF); ctx.beginPath(); ctx.moveTo(m0[0], m0[1]); ctx.lineTo(m1[0], m1[1]); ctx.moveTo(j0[0], j0[1]); ctx.lineTo(j1[0], j1[1]); ctx.stroke()
  const sw = Math.sin(ls * 0.0012) * 0.08, hk = isoPt(o, L0 + 1.8 + sw, -2.6, 2.35)
  ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(lerp(m1[0], j1[0], 0.75), lerp(m1[1], j1[1], 0.75)); ctx.lineTo(hk[0], hk[1]); ctx.stroke()
  ctx.restore()
  // right: a storefront office
  const R0 = 2.8
  pool(ctx, a, o, R0 + 0.7, -1, 2.2, 0.14 * sb)
  store(ctx, a, o, R0, -1.8, 1.6, 1.2, 1.0, sb, { lit: 0.55 })
  // centre: the reviewer's desk under a lamp
  const rv = easeOut(prog(ls, c2 - 200, 800))
  const lt = isoPt(o, 0, 0.6, 4.5)
  lamp(ctx, a, lt[0], lt[1], isoPt(o, 0, 0.6, 0)[1], u * 2.4, 0.14 * rv)
  solidBox(ctx, a, o, -0.9, 0.2, 1.8, 0.9, 0.7, { alpha: rv, lit: 0.8 })
  isoBox(ctx, a, o, -0.4, 0.35, 0.6, 0.45, 0.03, { z: 0.7, alpha: rv, lit: 1.2 })
  person(ctx, a, o, 0.0, 1.6, { al: rv })
  vignette(ctx, a, 0.8)
  // the same trace over both
  const tp = prog(ls, c1 + 500, 600)
  const traceCard = (x: number, y: number, al: number) => {
    const w = 104 * KF * (tall ? 0.8 : 1), h = 40 * KF * (tall ? 0.8 : 1)
    ctx.save(); ctx.globalAlpha *= al
    ctx.fillStyle = a.pal.bg; ctx.fillRect(x - w / 2, y, w, h); ctx.strokeStyle = ink(a, 0.45); ctx.lineWidth = 1; ctx.strokeRect(x - w / 2, y, w, h)
    const pts: Pt[] = [[x - w * 0.42, y + h * 0.82], [x - w * 0.2, y + h * 0.82], [x - w * 0.12, y + h * 0.18], [x + w * 0.12, y + h * 0.18], [x + w * 0.2, y + h * 0.82], [x + w * 0.42, y + h * 0.82]]
    trace(ctx, pts, easeOut(clamp01(al * 1.2)), { color: ink(a, 0.9), width: Math.max(1.5, 1.6 * KF) })
    ctx.restore()
    return { y: y + h }
  }
  if (tp > 0) {
    const s0 = isoPt(o, L0 + 1.1, -1.3, 2.4), s1 = isoPt(o, R0 + 0.8, -1.2, 1.1)
    const y = tall ? H * 0.12 : H * 0.15 + bob(a, 1)
    const xa = tall ? W * 0.25 : s0[0] - 50 * KF, xb = tall ? W * 0.75 : s1[0] + 50 * KF
    const ra = traceCard(xa, y, tp), rb = traceCard(xb, y, tp)
    leader(ctx, a, s0, [xa, ra.y], tp); leader(ctx, a, s1, [xb, rb.y], tp)
    mono(ctx, a, L(a, 'ONE MEGAPROJECT', 'UN MEGAPROYECTO'), xa, tall ? ra.y + 13 * KF : y - 6 * KF, 10, ink(a, 0.8), { align: 'center', alpha: tp })
    mono(ctx, a, L(a, 'THE SAME TRACE', 'LA MISMA HUELLA'), (xa + xb) / 2, y + 26 * KF, tall ? 10 : 12, ink(a, 0.95), { align: 'center', alpha: prog(ls, c1 + 1100, 500), weight: 700 })
  }
  const p2 = prog(ls, c2 + 300, 600) * (tall ? 1 - seal : 1)
  if (p2 > 0) {
    const at = isoPt(o, 0, 1.6, 0.95)
    const r = evCard(ctx, a, tall ? W * 0.5 : W * 0.5, tall ? H * 0.6 : H * 0.62, [{ s: L(a, 'A HUMAN REVIEWER', 'UN REVISOR HUMANO'), size: 10.5, color: ink(a, 0.9) }], { al: p2, align: 'center' })
    leader(ctx, a, at, edge(r, at), p2)
  }
  if (ls > c3) {
    const big = tall ? 38 : 54
    const at = isoPt(o, 5.5, -3.3, 2.3)
    const r = evCard(ctx, a, tall ? W * 0.5 : W * 0.96, tall ? H * 0.5 : H * 0.36 + bob(a, 2), [{ s: '2,678', size: big, font: 'serif', color: 'rgba(0,0,0,0)' }, { s: L(a, 'NEVER OPENED', 'NUNCA ABIERTOS'), size: 10.5, color: ink(a, 0.85) }], { al: prog(ls, c3, 300), accent: true, align: tall ? 'center' : 'right', pad: 14 })
    text(ctx, count(2678, 1, 0, a.lang), r.x + 14 * KF, r.y + 14 * KF * 0.8 + big * KF * 1.12 * 0.86, { size: big * KF, color: red(a, 0.97) })
    if (!tall) leader(ctx, a, at, [r.x, r.y + r.h / 2], prog(ls, c3 + 300, 500), true)
  }
}

// ── 11 · END — the whole model on its table; the name card lifts off; the same loop elsewhere ───
const end: SceneFn = (ctx, a) => {
  const { ls, W, H } = a
  const tall = isTall(a), c1 = cue(a, 1)
  const pull = easeInOut(prog(ls, c1 - 300, 1600))
  const u0 = tall ? W * 0.05 : Math.min(W * 0.045, H * 0.08)
  const u = u0 * lerp(1, 0.55, pull)
  const o: Iso = { ox: W * 0.5, oy: H * lerp(0.47, 0.42, pull), u }
  isoFloor(ctx, a, o, 16, 0.08)
  // the other loops, far off in the dark
  if (pull > 0) for (let i = 0; i < 10; i++) {
    const r = 8 + 3 * rnd(i * 3.3), th = (i / 10) * TAU + 0.3
    const cx = Math.cos(th) * r, cy = Math.sin(th) * r, al = pull * (0.25 + 0.2 * rnd(i))
    pool(ctx, a, o, cx, cy, 1.6, 0.06 * pull)
    isoBox(ctx, a, o, cx - 1.1, cy - 0.3, 0.6, 0.6, 0.7, { alpha: al })
    isoBox(ctx, a, o, cx, cy - 1.0, 0.6, 0.6, 0.55, { alpha: al })
    isoBox(ctx, a, o, cx + 0.8, cy + 0.2, 0.5, 0.5, 0.35, { alpha: al })
    trace(ctx, [isoPt(o, cx - 0.8, cy, 0.2), isoPt(o, cx + 0.3, cy - 0.7, 0.2), isoPt(o, cx + 1.0, cy + 0.4, 0.2), isoPt(o, cx - 0.8, cy, 0.2)], 1, { color: red(a, al * 0.8), width: 1 })
  }
  table(ctx, a, o, -5, -3.6, 5, 3.6, 1)
  pool(ctx, a, o, 0, 0, 5, 0.2)
  ministry(ctx, a, o, -4.2, -1.2, 2.2, 1.6, 1.7, 1)
  university(ctx, a, o, -0.8, -3.2, 2.0, 1.5, 1.1, 1, { lit: 0.5 })
  for (let i = 0; i < 3; i++) store(ctx, a, o, 2.4, -1.6 + i * 0.95, 1.0, 0.75, 0.7, 1, { lit: 0.45 })
  const ring: V3[] = [[-1.9, -0.2, 0.4], [-1.9, -1.6, 0.4], [1.4, -1.6, 0.4], [2.1, -1.6, 0.4], [2.1, 2.6, 0.4], [-3.1, 2.6, 0.4], [-3.1, 0.7, 0.4]]
  tube(ctx, a, o, ring, 1, 1, true)
  folders(ctx, a, o, ring, 10, 0.00025, 1, true)
  vignette(ctx, a, 0.8)
  // the name card, which lifts away
  const lift = easeIn(prog(ls, c1 - 100, 900))
  const big = tall ? 24 : 40
  const at = isoPt(o, 0, 0, 1.2)
  const r = evCard(ctx, a, W * 0.5, H * 0.13 - lift * H * 0.08 + bob(a, 1), [{ s: 'LA ESTAFA MAESTRA', size: big, font: 'serif', color: red(a, 0.97) }], { al: prog(ls, 100, 500) * (1 - lift), accent: true, align: 'center', pad: 16 })
  leader(ctx, a, at, edge(r, at), prog(ls, 300, 500) * (1 - lift), true)
}

export const scenes: Record<string, SceneFn> = { need, loophole, pass, shells, scale, loop, press, court, half, pattern, caveat, end }
