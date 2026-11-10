/**
 * «La urgencia permanente» — IMSS-Bienestar and the emergency clause, told as miniature
 * dioramas under one light (the Fern direction). One draw function per shot, keyed by the
 * beat's `scene` in story-films.json; see filmKit.ts for the contract. Recurring image: THE
 * EXIT — a corridor whose emergency door opens once in shot 0 and stands propped open in 8.
 * Red is only ever the emergency: the exit, the clause, the awards that cite it.
 */
import { type Iso, type Pt, type SceneArgs, type SceneFn, L, clamp01, count, cue, dim, easeBack, easeInOut, easeOut, figure, ink, isoBox, isoFloor, isoPt, lamp, lerp, pool, prog, red, rnd, text, trace, typeOn } from '@/components/gallery/filmKit'

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

/** Draw in the plane of a wall: x runs along the wall (o.u px = one world unit), y runs down. */
function onFace(ctx: C, at: Pt, dir: 'x' | 'y', draw: () => void) {
  ctx.save(); ctx.translate(at[0], at[1]); ctx.transform(0.866, dir === 'x' ? 0.5 : -0.5, 0, 1, 0, 0); draw(); ctx.restore()
}

/** Value that eases between keyframes [ms, value] — a camera that moves in steps. */
function keyed(ls: number, keys: [number, number][], len: number) {
  let v = keys[0][1]
  for (let i = 1; i < keys.length; i++) v = lerp(v, keys[i][1], easeInOut(prog(ls, keys[i][0], len)))
  return v
}

/** World-space path walker (the kit's along() is private). */
function walk(pts: Pt[], t: number): Pt {
  let total = 0
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
  let d = clamp01(t) * total
  for (let i = 1; i < pts.length; i++) {
    const s = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
    if (d <= s || i === pts.length - 1) { const u = s ? clamp01(d / s) : 0; return [lerp(pts[i - 1][0], pts[i][0], u), lerp(pts[i - 1][1], pts[i][1], u)] }
    d -= s
  }
  return pts[pts.length - 1]
}

function measure(ctx: C, s: string, size: number, font: 'serif' | 'mono', weight?: number) {
  ctx.save(); ctx.font = `${weight ?? (font === 'mono' ? 500 : 600)} ${size}px ${font === 'mono' ? MONO : SERIF}`
  ;(ctx as C & { letterSpacing: string }).letterSpacing = font === 'mono' ? `${size * 0.12}px` : '0px'
  const w = ctx.measureText(s).width; ctx.restore(); return w
}

function mono(ctx: C, a: SceneArgs, s: string, x: number, y: number, size: number, color: string, o: { align?: CanvasTextAlign; alpha?: number; baseline?: CanvasTextBaseline; weight?: number } = {}) {
  text(ctx, s, x, y, { size: size * a.KF, font: 'mono', color, tracking: size * 0.12 * a.KF, ...o })
}

/** Screen-space soft glow. */
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

/** Slow camera: world origin pans across the shot. */
function cam(a: SceneArgs, cx: number, cy: number, u: number, panX: number, panY = 0): Iso {
  const t = easeInOut(clamp01(a.ls / a.dur)) - 0.5
  return { ox: a.W * cx - t * panX * a.W, oy: a.H * cy - t * panY * a.H, u }
}

/** Cards float: a little bob plus a drift against the camera (parallax). */
const bob = (a: SceneArgs, seed: number) => Math.sin(a.ls * 0.0013 + seed * 1.9) * 2.6 * a.KF

interface Line { s: string; size: number; font?: 'serif' | 'mono'; color: string; weight?: number }
interface Rect { x: number; y: number; w: number; h: number }
/** A floating evidence card. (x, y) is the top-left (align left), top-right (right) or top-centre (center). */
function evCard(ctx: C, a: SceneArgs, x: number, y: number, lines: Line[], s: { al?: number; accent?: boolean; align?: 'left' | 'right' | 'center'; pad?: number; free?: boolean } = {}): Rect {
  const KF = a.KF, pad = (s.pad ?? 12) * KF, al = s.al ?? 1
  let w = 0, h = 0
  const sizes = lines.map((l) => { const sz = l.size * KF, f = l.font ?? 'mono'; w = Math.max(w, measure(ctx, l.s, sz, f, l.weight)); const lh = sz * (f === 'mono' ? 1.55 : 1.12); h += lh; return lh })
  w += pad * 2; h += pad * 1.6
  let bx = s.align === 'right' ? x - w : s.align === 'center' ? x - w / 2 : x
  if (!s.free) bx = Math.max(a.W * 0.025, Math.min(a.W * 0.975 - w, bx))
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

/** The glass-fronted emergency box, face-on. */
function emIcon(ctx: C, a: SceneArgs, cx: number, cy: number, s: number, al = 1, empty = 0) {
  if (al <= 0.01) return
  const w = s, h = s * 1.25, x = cx - w / 2, y = cy - h / 2
  ctx.save(); ctx.globalAlpha *= al
  ctx.fillStyle = red(a, 0.9); ctx.fillRect(x, y, w, h)
  ctx.fillStyle = a.pal.bg; ctx.fillRect(x + w * 0.14, y + h * 0.12, w * 0.72, h * 0.76)
  if (empty < 1) {
    ctx.globalAlpha *= 1 - empty
    ctx.fillStyle = red(a, 0.25); ctx.fillRect(x + w * 0.14, y + h * 0.12, w * 0.72, h * 0.76)
    ctx.fillStyle = red(a, 0.95); ctx.beginPath(); ctx.arc(cx, cy, w * 0.17, 0, TAU); ctx.fill()
    ctx.strokeStyle = ink(a, 0.55); ctx.lineWidth = Math.max(1, w * 0.05)
    ctx.beginPath(); ctx.moveTo(x + w * 0.24, y + h * 0.42); ctx.lineTo(x + w * 0.46, y + h * 0.2); ctx.stroke()
    ctx.globalAlpha /= Math.max(0.001, 1 - empty)
  }
  if (empty > 0) { // shards left in the frame
    ctx.globalAlpha *= empty
    poly(ctx, [[x + w * 0.14, y + h * 0.88], [x + w * 0.3, y + h * 0.66], [x + w * 0.38, y + h * 0.88]], undefined, ink(a, 0.6), Math.max(1, w * 0.04))
    poly(ctx, [[x + w * 0.86, y + h * 0.12], [x + w * 0.66, y + h * 0.12], [x + w * 0.86, y + h * 0.34]], undefined, ink(a, 0.6), Math.max(1, w * 0.04))
  }
  ctx.restore()
}

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

/** Window grid on the two lit faces of a box. */
function windows(ctx: C, a: SceneArgs, o: Iso, x: number, y: number, w: number, d: number, h: number, al: number, seed: number, on = 0.55, z0 = 0) {
  if (al <= 0.01) return
  const rows = Math.max(1, Math.round(h * 1.5)), cx = Math.max(1, Math.round(w * 1.7)), cy = Math.max(1, Math.round(d * 1.7))
  const P = (px: number, py: number, pz: number) => isoPt(o, px, py, pz)
  let k = 0
  const win = (pts: Pt[]) => {
    const lit = rnd(seed * 17 + k * 1.37) < on
    const fl = lit ? 0.42 + 0.16 * Math.sin(a.ls * 0.0019 + k * 2.3) : 0
    poly(ctx, pts, lit ? ink(a, fl * al) : `rgba(0,0,0,${0.5 * al})`)
    k++
  }
  for (let r = 0; r < rows; r++) {
    const za = z0 + ((r + 0.3) / rows) * h, zb = z0 + ((r + 0.74) / rows) * h
    for (let i = 0; i < cx; i++) { const xa = x + ((i + 0.25) / cx) * w, xb = x + ((i + 0.75) / cx) * w; win([P(xa, y + d, za), P(xb, y + d, za), P(xb, y + d, zb), P(xa, y + d, zb)]) }
    for (let i = 0; i < cy; i++) { const ya = y + ((i + 0.25) / cy) * d, yb = y + ((i + 0.75) / cy) * d; win([P(x + w, ya, za), P(x + w, yb, za), P(x + w, yb, zb), P(x + w, ya, zb)]) }
  }
}

/** A hospital block: lit box, windows, a cross on the roof. */
function hospital(ctx: C, a: SceneArgs, o: Iso, x: number, y: number, w: number, d: number, h: number, al: number, seed: number, on = 0.55) {
  if (al <= 0.01 || h <= 0.01) return
  isoBox(ctx, a, o, x, y, w, d, h, { alpha: al, lit: 0.75 })
  windows(ctx, a, o, x, y, w, d, h * 0.9, al, seed, on)
  const cx = x + w / 2, cy = y + d / 2, s = Math.min(w, d) * 0.36
  isoBox(ctx, a, o, cx - s / 2, cy - s * 0.13, s, s * 0.26, 0.08, { z: h, alpha: al })
  isoBox(ctx, a, o, cx - s * 0.13, cy - s / 2, s * 0.26, s, 0.08, { z: h, alpha: al })
}

/** A miniature person with a contact shadow, an optional folder, and a walking bob. */
function person(ctx: C, a: SceneArgs, o: Iso, x: number, y: number, s: { al?: number; folder?: boolean; accent?: boolean; lift?: number; h?: number } = {}) {
  const al = s.al ?? 1
  if (al <= 0.01) return
  const f = isoPt(o, x, y), hh = (s.h ?? 0.9) * o.u, w = hh * 0.3
  ctx.fillStyle = `rgba(0,0,0,${0.55 * al})`; ctx.beginPath(); ctx.ellipse(f[0], f[1], w * 0.9, w * 0.38, 0, 0, TAU); ctx.fill()
  ctx.save(); ctx.translate(0, -(s.lift ?? 0) * o.u)
  figure(ctx, a, o, x, y, { alpha: al, accent: s.accent, h: s.h })
  if (s.folder) { ctx.fillStyle = s.accent ? red(a, 0.9 * al) : dim(a, 0.95 * al); ctx.fillRect(f[0] + w * 0.3, f[1] - hh * 0.6, w * 0.95, w * 1.15) }
  ctx.restore()
}

// ── THE EXIT: the corridor of shots 0 and 8 ─────────────────────────────────────────────────
const WY = -2.2 // the back wall's front plane
const WALL = { x0: -4.6, x1: 5.6, h: 2.3 }
const DOOR = { x0: 3.2, x1: 4.3, h: 1.85 }
const GLASS = { x0: 2.25, x1: 2.75, z0: 0.95, z1: 1.55 }
const DESK = { x: -4.2, y: -1.0, w: 5.4, d: 0.8, h: 0.92 }

function corridorCam(a: SceneArgs, pan: number): Iso {
  const tall = isTall(a)
  return cam(a, tall ? 0.36 : 0.4, tall ? 0.5 : 0.5, tall ? a.W * 0.068 : Math.min(a.W * 0.06, a.H * 0.105), pan)
}

interface Walker { x: number; y: number; al: number; folder?: boolean; lift?: number; accent?: boolean }
function corridor(ctx: C, a: SceneArgs, o: Iso, st: { build: number; exitOn: number; door: number; empty: number; desk: number; clerks: number; walkers: Walker[]; floorLine?: number }) {
  const P = (x: number, y: number, z = 0) => isoPt(o, x, y, z), b = st.build
  isoFloor(ctx, a, o, 11, 0.11 * b)
  pool(ctx, a, o, -1.8, 0.9, 4.6, 0.17 * b * st.desk)
  rpool(ctx, a, o, 3.75, -1.0, 2.6, 0.2 * st.exitOn + 0.25 * st.door)
  // the wall rises
  isoBox(ctx, a, o, WALL.x0, WY - 0.3, WALL.x1 - WALL.x0, 0.3, WALL.h * easeOut(b), { lit: 0.55 })
  const wb = clamp01((b - 0.6) / 0.4)
  if (wb > 0) {
    // door: dark when shut, light spilling when open
    const dq: Pt[] = [P(DOOR.x0, WY, 0), P(DOOR.x1, WY, 0), P(DOOR.x1, WY, DOOR.h), P(DOOR.x0, WY, DOOR.h)]
    poly(ctx, dq, `rgba(0,0,0,${0.7 * wb})`, ink(a, 0.5 * wb), Math.max(1, a.KF))
    if (st.door > 0) {
      poly(ctx, dq, red(a, 0.22 * st.door))
      poly(ctx, [P(DOOR.x0 + 0.08, WY, 0), P(DOOR.x1 - 0.08, WY, 0), P(DOOR.x1 - 0.08, WY, DOOR.h - 0.1), P(DOOR.x0 + 0.08, WY, DOOR.h - 0.1)], ink(a, 0.5 * st.door))
      // light falls out across the floor
      const L0 = 3.6 * st.door
      poly(ctx, [P(DOOR.x0, WY + 0.02), P(DOOR.x1, WY + 0.02), P(DOOR.x1 + 0.6, WY + L0), P(DOOR.x0 - 0.5, WY + L0)], ink(a, 0.1 * st.door))
      // the leaf, swung into the room on its hinge
      const ph = st.door * 1.35, ex = DOOR.x1 - Math.cos(ph) * 1.05, ey = WY + Math.sin(ph) * 1.05
      poly(ctx, [P(DOOR.x1, WY, 0), P(ex, ey, 0), P(ex, ey, DOOR.h), P(DOOR.x1, WY, DOOR.h)], ink(a, 0.16), ink(a, 0.55), Math.max(1, a.KF))
    } else {
      poly(ctx, [P(DOOR.x0 + 0.06, WY, 0), P(DOOR.x1 - 0.06, WY, 0), P(DOOR.x1 - 0.06, WY, DOOR.h - 0.06), P(DOOR.x0 + 0.06, WY, DOOR.h - 0.06)], ink(a, 0.12 * wb))
      const hb = P(DOOR.x1 - 0.2, WY, 0.9); ctx.fillStyle = ink(a, 0.6 * wb); ctx.fillRect(hb[0] - 2 * a.KF, hb[1] - 1 * a.KF, 4 * a.KF, 2 * a.KF)
    }
    // the EXIT sign
    const on = st.exitOn
    const sq: Pt[] = [P(3.3, WY, 2.0), P(4.2, WY, 2.0), P(4.2, WY, 2.24), P(3.3, WY, 2.24)]
    if (on > 0) { const c = P(3.75, WY, 2.12); glow(ctx, c[0], c[1], o.u * 1.6, red(a, 0.32 * on), red(a, 0)) }
    poly(ctx, sq, on > 0 ? red(a, 0.25 + 0.7 * on) : dim(a, 0.18 * wb), red(a, 0.5 * wb))
    onFace(ctx, P(3.75, WY, 2.12), 'x', () => text(ctx, L(a, 'EXIT', 'SALIDA'), 0, 0, { size: o.u * 0.16, font: 'mono', weight: 700, color: on > 0.5 ? a.pal.bg : red(a, 0.7 * wb), align: 'center', baseline: 'middle', tracking: o.u * 0.02 }))
    // the glass box
    const gq: Pt[] = [P(GLASS.x0, WY, GLASS.z0), P(GLASS.x1, WY, GLASS.z0), P(GLASS.x1, WY, GLASS.z1), P(GLASS.x0, WY, GLASS.z1)]
    if (on > 0) { const c = P(2.5, WY, 1.25); glow(ctx, c[0], c[1], o.u * 0.9, red(a, 0.28 * on), red(a, 0)) }
    poly(ctx, gq, red(a, 0.85 * wb))
    poly(ctx, [P(GLASS.x0 + 0.07, WY, GLASS.z0 + 0.07), P(GLASS.x1 - 0.07, WY, GLASS.z0 + 0.07), P(GLASS.x1 - 0.07, WY, GLASS.z1 - 0.07), P(GLASS.x0 + 0.07, WY, GLASS.z1 - 0.07)], a.pal.bg)
    if (st.empty < 1) {
      poly(ctx, [P(GLASS.x0 + 0.07, WY, GLASS.z0 + 0.07), P(GLASS.x1 - 0.07, WY, GLASS.z0 + 0.07), P(GLASS.x1 - 0.07, WY, GLASS.z1 - 0.07), P(GLASS.x0 + 0.07, WY, GLASS.z1 - 0.07)], red(a, 0.28 * wb * (1 - st.empty)))
      const k = P(2.5, WY, 1.25); ctx.fillStyle = red(a, wb * (1 - st.empty)); ctx.beginPath(); ctx.arc(k[0], k[1], o.u * 0.07, 0, TAU); ctx.fill()
    } else {
      const s1 = P(GLASS.x0 + 0.08, WY, GLASS.z0 + 0.08), s2 = P(GLASS.x0 + 0.2, WY, GLASS.z0 + 0.25), s3 = P(GLASS.x0 + 0.28, WY, GLASS.z0 + 0.08)
      poly(ctx, [s1, s2, s3], undefined, ink(a, 0.55), Math.max(1, a.KF))
    }
  }
  // the red wayfinding line painted on the floor (shot 8)
  if (st.floorLine && st.floorLine > 0) trace(ctx, [P(-1.6, 7), P(-1.6, 1.0), P(3.75, 1.0), P(3.75, WY + 0.05)], st.floorLine, { color: red(a, 0.7), width: Math.max(2, o.u * 0.08) })
  // clerks behind the counter, then the counter
  for (let i = 0; i < 3; i++) person(ctx, a, o, -3.4 + i * 1.6, -1.55, { al: st.clerks * clamp01((b - 0.3 - i * 0.1) / 0.3) })
  isoBox(ctx, a, o, DESK.x, DESK.y, DESK.w, DESK.d, DESK.h * easeOut(clamp01(b * 1.3)), { lit: 0.35 + 0.65 * st.desk })
  if (b > 0.7) {
    onFace(ctx, P(DESK.x + 0.3, DESK.y + DESK.d, DESK.h - 0.28), 'x', () => text(ctx, L(a, 'TENDER  ·  PUBLIC BIDDING', 'LICITACIÓN  PÚBLICA'), 0, 0, { size: o.u * 0.22, font: 'mono', weight: 600, color: a.pal.bg, alpha: 0.4 + 0.6 * st.desk, tracking: o.u * 0.03 }))
    // service windows along the counter
    for (let i = 0; i < 4; i++) { const p0 = P(DESK.x + 0.6 + i * 1.4, DESK.y + 0.4, DESK.h), p1 = P(DESK.x + 0.6 + i * 1.4, DESK.y + 0.4, DESK.h + 0.55); ctx.strokeStyle = ink(a, 0.35 * st.desk + 0.1); ctx.lineWidth = Math.max(1, a.KF); ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.stroke() }
  }
  const ws = st.walkers.slice().sort((p, q) => p.x + p.y - (q.x + q.y))
  for (const w of ws) person(ctx, a, o, w.x, w.y, { al: w.al, folder: w.folder ?? true, lift: w.lift, accent: w.accent })
}

// ── 0 · THE EMERGENCY EXIT — the tender counter, its queue, and a door that opens ─────────────
const clause: SceneFn = (ctx, a) => {
  const { ls, W, H, KF } = a
  const tall = isTall(a), c1 = cue(a, 1), c2 = cue(a, 2)
  const o = corridorCam(a, 0.06)
  const build = easeOut(prog(ls, 0, 1800))
  const exitOn = prog(ls, c1 + 200, 500) * (0.85 + 0.15 * Math.sin(ls * 0.006)) * (ls < c1 + 700 ? (Math.floor(ls / 90) % 3 ? 1 : 0.3) : 1)
  const door = easeInOut(prog(ls, c1 + 2600, 1100))
  // two queues at the counter; the front of queue B is the one who leaves
  const leaveT = prog(ls, c1 + 1100, 5200)
  const step = easeInOut(prog(ls, c1 + 2400, 900))
  const walkers: Walker[] = []
  for (let i = 0; i < 7; i++) walkers.push({ x: -3.0, y: 0.55 + i * 0.74, al: prog(ls, 500 + i * 110, 450), lift: 0.03 * Math.max(0, Math.sin(ls * 0.003 + i * 1.3)) })
  for (let i = 1; i < 5; i++) walkers.push({ x: -0.6, y: 0.55 + i * 0.74 - 0.74 * step, al: prog(ls, 700 + i * 110, 450), lift: step > 0 && step < 1 ? 0.05 * Math.abs(Math.sin(ls * 0.014 + i)) : 0 })
  if (leaveT < 1) {
    const q = walk([[-0.6, 0.55], [1.9, 0.75], [3.75, -0.5], [3.75, -2.5]], easeInOut(leaveT))
    walkers.push({ x: q[0], y: q[1], al: prog(ls, 700, 450) * (1 - prog(leaveT, 0.88, 0.12)), accent: leaveT > 0, lift: leaveT > 0 ? 0.06 * Math.abs(Math.sin(ls * 0.012)) : 0 })
  }
  corridor(ctx, a, o, { build, exitOn, door, empty: 0, desk: 1, clerks: 1, walkers })
  vignette(ctx, a, 0.85)
  // card 1: the box
  const g = isoPt(o, 2.5, WY, GLASS.z1)
  const p1 = prog(ls, c1 + 700, 700) * (1 - prog(ls, c2, 500))
  if (p1 > 0) {
    const cx = tall ? W * 0.5 : g[0] + 30 * KF, cy = H * (tall ? 0.15 : 0.13) + bob(a, 1)
    const r = evCard(ctx, a, cx, cy, [{ s: L(a, 'BREAK IN CASE', 'ROMPA EN CASO'), size: 12, color: red(a, 0.95), weight: 700 }, { s: L(a, 'OF EMERGENCY', 'DE EMERGENCIA'), size: 12, color: red(a, 0.95), weight: 700 }], { al: p1, accent: true, align: tall ? 'center' : 'left', pad: 14 })
    emIcon(ctx, a, r.x - 16 * KF, r.y + r.h / 2, 18 * KF, p1)
    leader(ctx, a, g, [r.x + r.w * 0.2, r.y + r.h], p1, true)
  }
  // card 2: the clause name types on
  const p2 = prog(ls, c2 + 200, 600)
  if (p2 > 0) {
    const name = 'CASO FORTUITO O FUERZA MAYOR', ty = typeOn(name, prog(ls, c2 + 300, 1700))
    const sz = tall ? 19 : 30
    const r = evCard(ctx, a, tall ? W * 0.5 : W * 0.05, H * (tall ? 0.13 : 0.12) + bob(a, 2), [
      { s: L(a, 'PROCUREMENT LAW', 'LEY DE ADQUISICIONES'), size: 10.5, color: dim(a, 0.95) },
      { s: name, size: sz, font: 'serif', color: 'rgba(0,0,0,0)' },
      { s: 'ART. 54 · FR. II', size: 12, color: red(a, 0.95), weight: 700 },
    ], { al: p2, accent: true, align: tall ? 'center' : 'left', pad: 16 })
    text(ctx, ty, r.x + 16 * KF, r.y + 16 * KF * 0.8 + 10.5 * KF * 1.55 + sz * KF * 1.12 * 0.86, { size: sz * KF, color: ink(a, 0.97) })
    if (ty.length < name.length && Math.floor(ls / 260) % 2 === 0) { const tw0 = measure(ctx, ty, sz * KF, 'serif'); ctx.fillStyle = red(a, 0.9); ctx.fillRect(r.x + 16 * KF + tw0 + 3 * KF, r.y + r.h * 0.36, 2 * KF, sz * KF) }
    leader(ctx, a, g, [r.x + r.w * (tall ? 0.5 : 0.85), r.y + r.h], prog(ls, c2 + 900, 700), true)
  }
}

// ── 1 · RARELY USED — two hospitals, a row of folders each, one red folder lifts ─────────────
const rare: SceneFn = (ctx, a) => {
  const { ls, W, H, KF } = a
  const tall = isTall(a), c1 = cue(a, 1), c2 = cue(a, 2)
  const t = easeInOut(clamp01(ls / a.dur)) - 0.5
  const u = tall ? W * 0.05 : Math.min(W * 0.04, H * 0.075)
  const sets = [
    { name: 'IMSS', n: 18, redI: 12, at: c1, frac: '1 / 18', pct: '≈ 5.6%', seed: 3 },
    { name: 'ISSSTE', n: 13, redI: 8, at: c2, frac: '1 / 13', pct: '≈ 7.6%', seed: 9 },
  ]
  sets.forEach((s, k) => {
    const o: Iso = tall ? { ox: W * 0.46 - t * W * 0.04, oy: H * (k ? 0.55 : 0.29), u } : { ox: W * (k ? 0.67 : 0.24) - t * W * 0.05, oy: H * 0.4, u }
    const b = easeOut(prog(ls, 100 + k * 350, 1300))
    isoFloor(ctx, a, o, 5, 0.12 * b)
    pool(ctx, a, o, 0.4, -0.6, 3.6, 0.2 * b)
    hospital(ctx, a, o, -1.6, -3.3, 3.0, 2.0, 2.0 * b, b, s.seed, 0.5)
    const r = easeOut(prog(ls, s.at + 250, 700))
    if (r > 0) { const rp = isoPt(o, -2.2 + s.redI * 0.34, 0.45); glow(ctx, rp[0], rp[1] - u * 0.6, u * 1.6, red(a, 0.22 * r), red(a, 0)) }
    for (let i = 0; i < s.n; i++) {
      const fx = -2.2 + i * 0.34, ap = prog(ls, 500 + k * 350 + i * 75, 320)
      if (ap <= 0) continue
      const isRed = i === s.redI, lift = isRed ? 0.5 * easeBack(r) : 0
      const wave = 0.7 + 0.3 * Math.sin(ls * 0.0032 - i * 0.55)
      const z = (1 - easeOut(ap)) * 0.8 + lift
      isoBox(ctx, a, o, fx, 0.2, 0.1, 0.55, 0.72, { alpha: ap, lit: wave, z })
      if (isRed && r > 0) isoBox(ctx, a, o, fx, 0.2, 0.1, 0.55, 0.72, { alpha: r, accent: true, lit: 1.25, z })
    }
    // the name plate over the roof
    // (on a phone the plate sits beside the building, clear of the tag band)
    const top = tall ? isoPt(o, -1.6, -1.3, 1.4) : isoPt(o, -0.1, -2.3, 2.0 * b + 0.9)
    mono(ctx, a, s.name, top[0] - (tall ? 10 * KF : 0), top[1] + bob(a, k), 15, ink(a, 0.95 * b), { align: tall ? 'right' : 'center', weight: 700 })
    // the label lands on its cue
    if (r > 0) {
      const rp = isoPt(o, -2.15 + s.redI * 0.34, 0.47, 0.72 + 0.5)
      const cx = tall ? W * (k ? 0.78 : 0.8) : rp[0] + (k ? 40 : -40) * KF
      const cy = tall ? H * (k ? 0.62 : 0.31) : H * 0.58
      const card = evCard(ctx, a, cx, cy + bob(a, k + 3), [{ s: s.frac, size: tall ? 30 : 44, font: 'serif', color: red(a, 0.97) }, { s: `${s.pct} · ${s.name}`, size: 10.5, color: ink(a, 0.85) }], { al: r, accent: true, align: tall ? 'center' : k ? 'left' : 'right' })
      leader(ctx, a, rp, [card.x + card.w / 2, cy < rp[1] ? card.y + card.h : card.y], r, true)
    }
  })
  vignette(ctx, a, 0.7)
  // first sentence: the caption plate between the two sets
  const p0 = prog(ls, 900, 600)
  if (!tall) mono(ctx, a, L(a, 'CONTRACTS CITING THE EXCEPTION', 'CONTRATOS QUE INVOCAN LA EXCEPCIÓN'), W * 0.5, H * 0.12, 10.5, dim(a, 0.9 * p0), { align: 'center' })
}

// ── 2 · ONE IN TWO — a larger hospital, folders red / bone without end, a beacon starts ────────
const half: SceneFn = (ctx, a) => {
  const { ls, W, H, KF } = a
  const tall = isTall(a), c1 = cue(a, 1)
  const u = tall ? W * 0.062 : Math.min(W * 0.046, H * 0.082)
  const o = cam(a, tall ? 0.52 : 0.62, tall ? 0.5 : 0.42, u, 0.05)
  const b = easeOut(prog(ls, 0, 1500))
  const beacon = prog(ls, c1, 400)
  isoFloor(ctx, a, o, 12, 0.1 * b)
  pool(ctx, a, o, 0, -1.2, 5, 0.18 * b)
  hospital(ctx, a, o, -2.2, -3.8, 4.4, 2.6, 2.1 * b, b, 21, 0.6)
  if (b > 0.8) onFace(ctx, isoPt(o, -1.9, -1.2, 2.0), 'x', () => text(ctx, 'IMSS-BIENESTAR', 0, 0, { size: u * 0.3, font: 'mono', weight: 700, color: ink(a, 0.85), tracking: u * 0.03, baseline: 'top' }))
  // the beacon on the roof
  const bp = isoPt(o, 0, -2.5, 2.1 * b + 0.15), th = (ls - c1) * 0.0045
  if (beacon > 0) {
    glow(ctx, bp[0], bp[1], u * 3.4, red(a, 0.2 * beacon * (0.6 + 0.4 * Math.cos(th * 2))), red(a, 0))
    for (const off of [0, Math.PI]) {
      const ang = th + off, R = u * 9
      const g = ctx.createRadialGradient(bp[0], bp[1], 0, bp[0], bp[1], R)
      g.addColorStop(0, red(a, 0.32 * beacon)); g.addColorStop(1, red(a, 0))
      ctx.fillStyle = g
      ctx.beginPath(); ctx.moveTo(bp[0], bp[1])
      ctx.lineTo(bp[0] + Math.cos(ang - 0.16) * R, bp[1] + Math.sin(ang - 0.16) * R * 0.5)
      ctx.lineTo(bp[0] + Math.cos(ang + 0.16) * R, bp[1] + Math.sin(ang + 0.16) * R * 0.5)
      ctx.closePath(); ctx.fill()
    }
  }
  isoBox(ctx, a, o, -0.18, -2.68, 0.36, 0.36, 0.3, { z: 2.1 * b, alpha: b, accent: beacon > 0, lit: beacon > 0 ? 0.8 + 0.4 * Math.max(0, Math.cos(th)) : 0.4 })
  // two endless rows of folders on a conveyor: red, bone, red, bone…
  const slide = (ls * 0.00042) % 0.64
  for (const [ry, ph] of [[0.7, 0], [1.6, 1]] as const) {
    for (let i = 0; i < 90; i++) {
      const fx = -15 + i * 0.32 + slide
      const ap = prog(ls, 200 + (fx + 15) * 40, 300) * clamp01(1.25 - Math.abs(fx - ry) / 11)
      if (ap <= 0.01) continue
      const isRed = (i + ph) % 2 === 0
      isoBox(ctx, a, o, fx, ry, 0.1, 0.55, 0.72, { alpha: ap, accent: isRed, lit: isRed ? 1.15 : 0.85 })
    }
  }
  vignette(ctx, a, 0.8)
  // the counter
  // a steady tally that settles on 1,015 as the voice reaches the figure
  const pc = prog(ls, c1 + 150, Math.max(1500, (a.dur - c1) * 0.36 - 150))
  if (ls > c1) {
    const big = tall ? 46 : 76, x0 = tall ? W * 0.5 : W * 0.05, y0 = H * (tall ? 0.11 : 0.14) + bob(a, 4)
    const r = evCard(ctx, a, x0, y0, [
      { s: L(a, 'AWARDS CITING THE CLAUSE', 'ADJUDICACIONES CON LA CLÁUSULA'), size: 10.5, color: dim(a, 0.95) },
      { s: '2,056 / 2,056', size: big, font: 'serif', color: 'rgba(0,0,0,0)' },
      { s: L(a, 'SINCE THE FEED FROZE', 'DESDE EL APAGÓN DEL FLUJO'), size: 10.5, color: ink(a, 0.7) },
    ], { al: prog(ls, c1, 400), accent: true, align: tall ? 'center' : 'left', pad: 16 })
    const by = r.y + 16 * KF * 0.8 + 10.5 * KF * 1.55 + big * KF * 1.12 * 0.86
    const nTxt = Math.round(1015 * (1 - (1 - pc) * (1 - pc))).toLocaleString(a.lang === 'es' ? 'es-MX' : 'en-US')
    const nw = measure(ctx, '1,015', big * KF, 'serif')
    text(ctx, nTxt, r.x + 16 * KF + nw, by, { size: big * KF, color: red(a, 0.97), align: 'right' })
    text(ctx, ` / ${count(2056, 1, 0, a.lang)}`, r.x + 16 * KF + nw, by, { size: big * KF * 0.55, color: ink(a, 0.9) })
  }
}

// ── 3 · BEFORE THE FREEZE — a three-storey tower fills like a thermometer, floor by floor ────
const climb: SceneFn = (ctx, a) => {
  const { ls, W, H, KF } = a
  const tall = isTall(a), cs = [cue(a, 1), cue(a, 2), cue(a, 3)]
  const u = tall ? W * 0.085 : Math.min(W * 0.06, H * 0.092)
  const FH = 1.4
  const focus = keyed(ls, [[0, 4.4], [cs[0] - 400, 0.7], [cs[1] - 300, 2.1], [cs[2] - 300, 3.5], [cs[2] + 2400, 2.2]], 1100)
  const o: Iso = { ox: W * (tall ? 0.42 : 0.44) - (easeInOut(clamp01(ls / a.dur)) - 0.5) * W * 0.04, oy: H * 0.44 + focus * u, u }
  const b = easeOut(prog(ls, 0, 1600))
  isoFloor(ctx, a, o, 10, 0.1)
  // the dark city behind
  isoBox(ctx, a, o, -5.6, -3.4, 2.2, 2, 3.4, { lit: 0.3 }); windows(ctx, a, o, -5.6, -3.4, 2.2, 2, 3.2, 0.5, 7, 0.18)
  isoBox(ctx, a, o, 2.2, -5.2, 2, 1.8, 2.6, { lit: 0.3 }); windows(ctx, a, o, 2.2, -5.2, 2, 1.8, 2.4, 0.5, 8, 0.15)
  isoBox(ctx, a, o, -4.6, 1.6, 1.6, 1.6, 1.6, { lit: 0.25 })
  pool(ctx, a, o, 0, 0, 3.8, 0.2)
  const PCT = [0.05, 0.35, 0.55]
  const x = -1.2, y = -1.2, w = 2.4, d = 2.4
  const P = (px: number, py: number, pz: number) => isoPt(o, px, py, pz)
  for (let f = 0; f < 3; f++) {
    const z0 = f * FH, fb = clamp01(b * 3 - f)
    if (fb <= 0) continue
    const lv = PCT[f] * FH * easeOut(prog(ls, cs[f] + 200, 1500))
    if (lv > 0.005) {
      isoBox(ctx, a, o, x + 0.1, y + 0.1, w - 0.2, d - 0.2, lv, { z: z0 + 0.08, accent: true, lit: 1.2 })
      const c = P(0, 0, z0 + lv); glow(ctx, c[0], c[1], u * 2.2, red(a, 0.16), red(a, 0))
    }
    // glass skin with mullions
    const zt = z0 + FH * fb
    poly(ctx, [P(x, y + d, z0), P(x + w, y + d, z0), P(x + w, y + d, zt), P(x, y + d, zt)], ink(a, 0.04), ink(a, 0.45))
    poly(ctx, [P(x + w, y, z0), P(x + w, y + d, z0), P(x + w, y + d, zt), P(x + w, y, zt)], ink(a, 0.07), ink(a, 0.45))
    ctx.strokeStyle = ink(a, 0.18); ctx.lineWidth = 1; ctx.beginPath()
    for (let m = 1; m < 6; m++) {
      let p = P(x + (w * m) / 6, y + d, z0), q = P(x + (w * m) / 6, y + d, zt); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1])
      p = P(x + w, y + (d * m) / 6, z0); q = P(x + w, y + (d * m) / 6, zt); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1])
    }
    ctx.stroke()
    isoBox(ctx, a, o, x - 0.08, y - 0.08, w + 0.16, d + 0.16, 0.08, { z: zt, alpha: fb, lit: 0.7 })
  }
  // the door and two tiny people at the foot
  poly(ctx, [P(-0.3, y + d, 0), P(0.3, y + d, 0), P(0.3, y + d, 0.6), P(-0.3, y + d, 0.6)], ink(a, 0.4))
  person(ctx, a, o, 0.4 + Math.sin(ls * 0.0007) * 0.8, 2.0, { h: 0.5 })
  person(ctx, a, o, -1.4, 2.4 + Math.sin(ls * 0.0006 + 2) * 0.5, { h: 0.5 })
  // the freeze, marked on the roof
  const roofZ = 3 * FH + 0.15
  const fr = prog(ls, 400, 900) * (1 - 0.6 * prog(ls, cs[0], 800))
  if (fr > 0) {
    ctx.save(); ctx.setLineDash([5 * KF, 5 * KF])
    poly(ctx, [P(x - 0.6, y - 0.6, roofZ), P(x + w + 0.6, y - 0.6, roofZ), P(x + w + 0.6, y + d + 0.6, roofZ), P(x - 0.6, y + d + 0.6, roofZ)], undefined, ink(a, 0.6 * fr), Math.max(1, KF))
    ctx.restore()
    const rp = P(x - 0.6, y + d + 0.6, roofZ)
    const fl = L(a, 'THE FEED FREEZES HERE', 'AQUÍ SE CONGELA EL FLUJO')
    mono(ctx, a, fl, Math.max(W * 0.03 + measure(ctx, fl, 11 * KF, 'mono'), rp[0] - 8 * KF), rp[1] - 6 * KF + bob(a, 5), 11, ink(a, 0.9 * fr), { align: 'right' })
  }
  vignette(ctx, a, 0.75)
  const YRS = [['2023', '2023'], ['2024', '2024'], ['JAN–SEP 2025', 'ENE–SEP 2025']]
  for (let f = 0; f < 3; f++) {
    const p = prog(ls, cs[f] + 300, 600)
    if (p <= 0) continue
    const at = P(x + w, y + d * 0.5, f * FH + 0.08 + PCT[f] * FH * easeOut(prog(ls, cs[f] + 200, 1500)))
    // a fixed column, newest on top, clear of the subtitle band whatever the camera does
    const cx = P(x + w, y, 0)[0] + (tall ? 18 : 60) * KF, cy = H * ((tall ? 0.13 : 0.12) + (2 - f) * (tall ? 0.15 : 0.17)) + bob(a, f)
    const r = evCard(ctx, a, cx, cy, [{ s: `${count(PCT[f] * 100, prog(ls, cs[f] + 200, 1200), 0, a.lang)}%`, size: tall ? 30 : 42, font: 'serif', color: red(a, 0.97) }, { s: L(a, YRS[f][0], YRS[f][1]), size: 11, color: ink(a, 0.85) }], { al: p, accent: true })
    leader(ctx, a, at, [r.x, r.y + r.h / 2], p, true)
  }
}

// ── 4 · THE REASON GIVEN — a map table: 23 of 32 tiles light, hospitals drop, clinics scatter ─
const why: SceneFn = (ctx, a) => {
  const { ls, W, H, KF } = a
  const tall = isTall(a), c1 = cue(a, 1), c2 = cue(a, 2), c3 = cue(a, 3)
  const u = tall ? W * 0.078 : Math.min(W * 0.062, H * 0.11)
  const t = clamp01(ls / a.dur)
  const o: Iso = { ox: W * 0.5, oy: H * (tall ? 0.5 : 0.47), u }
  const th = -Math.PI / 4 + 0.3 - 0.26 * easeInOut(t) // a slow orbit round the table
  const cs = Math.cos(th), sn = Math.sin(th)
  const P = (x: number, y: number, z = 0) => isoPt(o, x * cs - y * sn, x * sn + y * cs, z)
  const b = easeOut(prog(ls, 0, 1400))
  // the lamp
  lamp(ctx, a, W * 0.5, H * 0.02, o.oy + u * 1.2, W * 0.42, 0.09 * b)
  const sh = isoPt(o, 0, 0); glow(ctx, sh[0], sh[1] + u * 0.5, u * 7, 'rgba(0,0,0,0.5)', 'rgba(0,0,0,0)')
  // the table: top, the side that faces us, legs implied by shadow
  const TX = 4.6, TY = 2.6, TZ = 0.8
  const fx = cs + sn > 0 ? TX : -TX, fy = -sn + cs > 0 ? TY : -TY
  poly(ctx, [P(fx, -TY, -TZ), P(fx, TY, -TZ), P(fx, TY, 0), P(fx, -TY, 0)], ink(a, 0.22 * b), ink(a, 0.3 * b))
  poly(ctx, [P(-TX, fy, -TZ), P(TX, fy, -TZ), P(TX, fy, 0), P(-TX, fy, 0)], ink(a, 0.13 * b), ink(a, 0.3 * b))
  poly(ctx, [P(-TX, -TY), P(TX, -TY), P(TX, TY), P(-TX, TY)], ink(a, 0.1 * b), ink(a, 0.45 * b))
  // 32 tiles; a fixed shuffle decides which 23 light and in what order
  const order: number[] = []
  for (let i = 0; i < 32; i++) order.push(i)
  order.sort((p, q) => rnd(p * 3.3 + 1) - rnd(q * 3.3 + 1))
  const rank: number[] = new Array(32).fill(99)
  order.forEach((idx, k) => { if (k < 23) rank[idx] = k })
  const span = Math.max(1200, (c2 - c1) * 0.82)
  let lit = 0
  // while the first sentence plays, a survey beam sweeps the table twice
  const ph = (ls - 300) / Math.max(1200, (c1 - 300) / 2)
  const sw = ph > 0 && ph < 2 ? lerp(-5.5, 5.5, ph % 1) : 99
  const blocks: { x: number; y: number; t: number; s: number }[] = []
  for (let j = 0; j < 4; j++) for (let i = 0; i < 8; i++) {
    const idx = j * 8 + i, x0 = -4.0 + i * 1.0, y0 = -2.0 + j * 1.0, s = 0.86
    const tp = prog(ls, 300 + idx * 25, 400)
    if (tp <= 0) continue
    const rk = rank[idx], lt = rk < 23 ? prog(ls, c1 + (rk * span) / 23, 260) : 0
    if (lt >= 1) lit++
    const flash = lt > 0 ? lerp(0.75, 0.38, prog(ls, c1 + (rk * span) / 23 + 260, 600)) : 0
    const bump =0.2 * Math.max(0, 1 - Math.abs(x0 + 0.45 - sw) / 1.3) * (1 - prog(ls, c1, 400))
    poly(ctx, [P(x0 + 0.07, y0 + 0.07), P(x0 + s, y0 + 0.07), P(x0 + s, y0 + s), P(x0 + 0.07, y0 + s)], lt > 0 ? ink(a, flash * lt) : ink(a, 0.05 * tp + bump * tp), dim(a, (0.45 + bump * 2) * tp))
    if (rk < 23) {
      const nb = rnd(idx * 5.1) > 0.45 ? 2 : 1
      for (let q = 0; q < nb; q++) blocks.push({ x: x0 + 0.2 + (q ? 0.36 : 0.08) + rnd(idx + q) * 0.1, y: y0 + 0.2 + (q ? 0.38 : 0.05) + rnd(idx * 2 + q) * 0.1, t: c2 + (rk * 2 + q) * 42, s: idx })
      // clinics: specks scattered over the lit tile
      ctx.fillStyle = ink(a, 0.9)
      for (let m = 0; m < 10; m++) {
        const ap = prog(ls, c3 + rnd(idx * 11 + m) * 1100, 200)
        if (ap <= 0) continue
        const sp = P(x0 + 0.12 + rnd(idx * 7 + m) * 0.7, y0 + 0.12 + rnd(idx * 9 + m * 3) * 0.7)
        ctx.globalAlpha = ap; ctx.fillRect(sp[0] - 1.1 * KF, sp[1] - 1.1 * KF, 2.2 * KF, 2.2 * KF)
      }
      ctx.globalAlpha = 1
    }
  }
  // hospitals drop onto the lit tiles, nearest drawn last
  blocks.sort((p, q) => P(p.x, p.y)[1] - P(q.x, q.y)[1])
  for (const bl of blocks) {
    const dp = prog(ls, bl.t, 520)
    if (dp <= 0) continue
    const z = (1 - easeOut(dp)) * 3, w = 0.24, h = 0.3
    const c = [P(bl.x, bl.y, z), P(bl.x + w, bl.y, z), P(bl.x + w, bl.y + w, z), P(bl.x, bl.y + w, z)]
    const ct = [P(bl.x, bl.y, z + h), P(bl.x + w, bl.y, z + h), P(bl.x + w, bl.y + w, z + h), P(bl.x, bl.y + w, z + h)]
    const al = Math.min(1, dp * 3)
    poly(ctx, [c[3], c[2], ct[2], ct[3]], ink(a, 0.3 * al)); poly(ctx, [c[1], c[2], ct[2], ct[1]], ink(a, 0.45 * al))
    poly(ctx, [c[0], c[3], ct[3], ct[0]], ink(a, 0.3 * al)); poly(ctx, ct, ink(a, 0.95 * al))
  }
  // the plate on the table edge
  const pl = P(0, fy, -TZ * 0.5)
  mono(ctx, a, 'IMSS-BIENESTAR', pl[0], pl[1] + 4 * KF, 11, ink(a, 0.8 * b), { align: 'center', baseline: 'middle', weight: 700 })
  vignette(ctx, a, 0.7)
  // three counters along the top, each on its sentence
  const stats = [
    { at: c1, n: lit, s: '', lab: L(a, 'STATES', 'ESTADOS'), raw: true },
    { at: c2, n: 700, s: '≈', lab: L(a, 'HOSPITALS', 'HOSPITALES'), raw: false },
    { at: c3, n: 14000, s: '≈', lab: L(a, 'CLINICS', 'CLÍNICAS'), raw: false },
  ]
  stats.forEach((st, k) => {
    const p = prog(ls, st.at, 500)
    if (p <= 0) return
    const val = st.raw ? String(st.n) : st.s + count(st.n, prog(ls, st.at + 100, 1100), 0, a.lang)
    const cx = W * (0.22 + k * 0.28), y = H * (tall ? 0.12 : 0.11) + bob(a, k + 7)
    evCard(ctx, a, cx, y, [{ s: val, size: tall ? 22 : 36, font: 'serif', color: ink(a, 0.97) }, { s: st.lab, size: tall ? 9 : 10.5, color: dim(a, 0.95) }], { al: p, align: 'center', pad: tall ? 8 : 12 })
  })
}

// ── 5 · UNFORESEEABLE? — a guarded hospital gate at night; 2026 cut into two slices ──────────
const MON = { en: ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'], es: ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'] }
const routine: SceneFn = (ctx, a) => {
  const { ls, W, H, KF } = a
  const tall = isTall(a), c1 = cue(a, 1), c2 = cue(a, 2), c3 = cue(a, 3)
  const u = tall ? W * 0.062 : Math.min(W * 0.05, H * 0.09)
  const o = cam(a, tall ? 0.52 : 0.47, tall ? 0.56 : 0.56, u, 0.05)
  const P = (x: number, y: number, z = 0) => isoPt(o, x, y, z)
  const b = easeOut(prog(ls, 0, 1500))
  const boothOn = prog(ls, c1, 300)
  isoFloor(ctx, a, o, 11, 0.09 * b)
  pool(ctx, a, o, -1.6, -1.0, 2.8, 0.2 * b)
  pool(ctx, a, o, 1.6, 0.4, 2.2, 0.08 + 0.14 * boothOn)
  // the hospital facade and its lit entrance
  hospital(ctx, a, o, -5.4, -3.6, 7.2, 1.5, 2.3 * b, b, 31, 0.35)
  poly(ctx, [P(-2.2, -2.1, 0), P(-1.0, -2.1, 0), P(-1.0, -2.1, 1.1), P(-2.2, -2.1, 1.1)], ink(a, 0.55 * b))
  isoBox(ctx, a, o, -2.5, -2.1, 1.8, 0.9, 0.1, { z: 1.3, alpha: b })
  // the security booth and its barrier
  isoBox(ctx, a, o, 1.2, -0.3, 1.0, 1.0, 1.25 * b, { alpha: b, lit: 0.7 })
  poly(ctx, [P(1.35, 0.7, 0.55), P(2.05, 0.7, 0.55), P(2.05, 0.7, 1.0), P(1.35, 0.7, 1.0)], boothOn > 0 ? ink(a, 0.35 + 0.5 * boothOn) : 'rgba(0,0,0,0.5)')
  poly(ctx, [P(2.2, -0.15, 0.55), P(2.2, 0.55, 0.55), P(2.2, 0.55, 1.0), P(2.2, -0.15, 1.0)], boothOn > 0 ? ink(a, 0.3 + 0.4 * boothOn) : 'rgba(0,0,0,0.5)')
  isoBox(ctx, a, o, 1.1, -0.4, 1.2, 1.2, 0.08, { z: 1.25 * b, alpha: b })
  const arm = 1.25 * Math.pow(Math.max(0, Math.sin(ls * 0.0007 - 1)), 2), piv = P(1.1, 1.0, 0.75)
  const tip = P(1.1 - 2.8 * Math.cos(arm), 1.0, 0.75 + 2.8 * Math.sin(arm))
  ctx.strokeStyle = ink(a, 0.8 * b); ctx.lineWidth = Math.max(2, u * 0.07); ctx.beginPath(); ctx.moveTo(piv[0], piv[1]); ctx.lineTo(tip[0], tip[1]); ctx.stroke()
  ctx.save(); ctx.setLineDash([u * 0.2, u * 0.2]); ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.beginPath(); ctx.moveTo(piv[0], piv[1]); ctx.lineTo(tip[0], tip[1]); ctx.stroke(); ctx.restore()
  // guards on patrol, torches on the ground
  const guards: [number, number, number][] = [[-2.6 + 1.9 * Math.sin(ls * 0.00055), 0.2, Math.cos(ls * 0.00055)], [-0.4 + 1.4 * Math.sin(ls * 0.0007 + 2), 2.0, Math.cos(ls * 0.0007 + 2)], [2.6, 1.2, 0]]
  guards.forEach(([gx, gy, dir], k) => {
    const gp = prog(ls, 600 + k * 250, 500)
    if (dir !== 0) {
      const sg = dir > 0 ? 1 : -1
      const g = ctx.createRadialGradient(P(gx, gy)[0], P(gx, gy)[1], 0, P(gx, gy)[0], P(gx, gy)[1], u * 1.6)
      g.addColorStop(0, ink(a, 0.2 * gp)); g.addColorStop(1, ink(a, 0))
      poly(ctx, [P(gx, gy), P(gx + sg * 1.6, gy - 0.45), P(gx + sg * 1.6, gy + 0.45)], undefined)
      ctx.fillStyle = g; ctx.fill()
    }
    person(ctx, a, o, gx, gy, { al: gp, lift: dir !== 0 ? 0.04 * Math.abs(Math.sin(ls * 0.01 + k)) : 0 })
  })
  vignette(ctx, a, 0.8)
  // the year as a strip of twelve months
  const m = a.lang === 'es' ? MON.es : MON.en
  const sx = W * (tall ? 0.05 : 0.08), sw = W * (tall ? 0.9 : 0.84), cw = sw / 12, sy = H * (tall ? 0.14 : 0.15) + bob(a, 2), sh = H * (tall ? 0.06 : 0.075)
  const cut = easeInOut(prog(ls, c2 + 200, 600)), gap = 10 * KF * cut
  const sA = prog(ls, c2 + 500, 500), sB = prog(ls, c2 + Math.max(900, (c3 - c2) * 0.5), 500)
  const strip = prog(ls, 300, 700)
  text(ctx, '2026', sx, sy - 8 * KF, { size: (tall ? 18 : 24) * KF, color: ink(a, 0.95 * strip) })
  for (let i = 0; i < 12; i++) {
    const cp = prog(ls, 300 + i * 50, 300)
    if (cp <= 0) continue
    const x = sx + i * cw + (i < 2 ? -gap / 2 : gap / 2), fill = prog(ls, c1 + 200 + i * 110, 300)
    ctx.fillStyle = a.pal.bg; ctx.fillRect(x + 1, sy, cw - 2, sh)
    ctx.fillStyle = ink(a, 0.04 + 0.16 * fill); ctx.fillRect(x + 1, sy, cw - 2, sh)
    ctx.strokeStyle = ink(a, 0.35 * cp); ctx.lineWidth = 1; ctx.strokeRect(x + 1, sy, cw - 2, sh)
    mono(ctx, a, m[i], x + cw / 2, sy + sh * 0.62, tall ? 8.5 : 10.5, ink(a, (0.45 + 0.5 * fill) * cp), { align: 'center' })
  }
  // the cut
  if (cut > 0) {
    const cx = sx + 2 * cw
    ctx.save(); ctx.setLineDash([4 * KF, 4 * KF]); ctx.strokeStyle = red(a, 0.9 * (1 - 0.5 * cut)); ctx.lineWidth = Math.max(1, 1.4 * KF)
    ctx.beginPath(); ctx.moveTo(cx, sy - 12 * KF); ctx.lineTo(cx, sy - 12 * KF + (sh + 24 * KF) * prog(ls, c2, 300)); ctx.stroke(); ctx.restore()
  }
  const slices = [{ p: sA, x: sx - gap / 2, w: 2 * cw, lab: L(a, '2 MONTHS', '2 MESES') }, { p: sB, x: sx + 2 * cw + gap / 2, w: 10 * cw, lab: L(a, '10 MONTHS', '10 MESES') }]
  for (const s of slices) {
    if (s.p <= 0) continue
    ctx.strokeStyle = red(a, 0.95 * s.p); ctx.lineWidth = Math.max(1.5, 2 * KF); ctx.strokeRect(s.x + 1, sy - 2 * KF, s.w - 2, sh + 4 * KF)
    mono(ctx, a, s.lab, s.x + s.w / 2, sy + sh + 18 * KF, tall ? 9.5 : 11.5, red(a, 0.95 * s.p), { align: 'center', weight: 700 })
    ctx.save(); const sc = lerp(1.9, 1, easeOut(s.p)); ctx.translate(s.x + s.w - 14 * KF, sy + sh * 0.02); ctx.scale(sc, sc); emIcon(ctx, a, 0, 0, 13 * KF, Math.min(1, s.p * 2)); ctx.restore()
  }
  // a dashed tether from the year down to the booth: this is what was bought
  const bt = P(1.7, 0.2, 1.4)
  if (sA > 0) { ctx.save(); ctx.setLineDash([3 * KF, 4 * KF]); trace(ctx, [[sx + 6 * cw, sy + sh + 26 * KF], bt], prog(ls, c2 + 800, 800), { color: red(a, 0.45), width: Math.max(1, KF) }); ctx.restore() }
  // the price of one slice
  const pm = prog(ls, c3 + 100, 500)
  if (pm > 0) {
    const big = tall ? 30 : 46
    const r = evCard(ctx, a, tall ? W * 0.5 : W * 0.93, H * (tall ? 0.33 : 0.36) + bob(a, 6), [
      { s: L(a, 'ONE SLICE · UP TO', 'UN TRAMO · HASTA'), size: 10.5, color: dim(a, 0.95) },
      { s: L(a, `${count(2.9, prog(ls, c3 + 100, 1000), 1, 'en')}B pesos`, `${count(2900, prog(ls, c3 + 100, 1000), 0, 'es')} MDP`), size: big, font: 'serif', color: red(a, 0.97) },
    ], { al: pm, accent: true, align: tall ? 'center' : 'right', pad: 14 })
    if (!tall) leader(ctx, a, P(2.2, 0.2, 1.1), [r.x, r.y + r.h * 0.6], pm, true)
  }
}

// ── 6 · 29 BILLION — a store-room of crates, one crate per thousand million, under a swinging lamp ─
const money: SceneFn = (ctx, a) => {
  const { ls, W, H, KF } = a
  const tall = isTall(a), c1 = cue(a, 1), c2 = cue(a, 2)
  const u = tall ? W * 0.07 : Math.min(W * 0.054, H * 0.095)
  const o = cam(a, tall ? 0.5 : 0.5, tall ? 0.66 : 0.66, u, 0.04)
  const P = (x: number, y: number, z = 0) => isoPt(o, x, y, z)
  const sway = Math.sin(ls * 0.0011) * 0.9
  const b = easeOut(prog(ls, 0, 1200))
  isoFloor(ctx, a, o, 10, 0.1 * b)
  lamp(ctx, a, W * 0.5 + sway * u * 0.6, H * 0.02, o.oy + u, W * 0.3, 0.08)
  pool(ctx, a, o, sway, 0.2, 4.4, 0.22)
  // the store-room's back wall
  isoBox(ctx, a, o, -6, -5.2, 12, 0.5, 3.4, { lit: 0.22, alpha: b })
  // crate stacks — every crate is 1,000 million pesos
  const CH = 0.42, red1 = easeOut(prog(ls, c1, 700))
  const stacks = [
    { x: -3.6, y: 1.0, cols: 1, rows: 1, n: 6.5, accent: true },
    { x: -1.6, y: 0.0, cols: 1, rows: 1, n: 5.8, accent: false },
    { x: 0.5, y: -2.0, cols: 3, rows: 2, n: 16.7, accent: false },
  ]
  let k = 0
  const span = Math.max(2600, c1 - 900)
  const tops: Pt[] = []
  for (const s of stacks) {
    const per = s.cols * s.rows, levels = Math.ceil(s.n / per)
    let left = s.n
    for (let lv = 0; lv < levels; lv++) {
      for (let r = 0; r < s.rows; r++) for (let c = 0; c < s.cols; c++) {
        const frac = Math.min(1, left)
        if (frac <= 0) continue
        left -= frac
        const dp = prog(ls, 400 + (k++ * span) / 30, 380)
        if (dp <= 0) continue
        const z = lv * CH + (1 - easeOut(dp)) * 2.2, h = CH * frac - 0.03
        const cx = s.x + c * 0.95, cy = s.y + r * 0.95
        solidBox(ctx, a, o, cx, cy, 0.9, 0.9, h, { z, alpha: Math.min(1, dp * 2), lit: 0.85 })
        if (s.accent && red1 > 0) isoBox(ctx, a, o, cx, cy, 0.9, 0.9, h, { z, alpha: red1, accent: true, lit: 1.2 })
        // a slat across each crate
        const sl1 = P(cx, cy + 0.9, z + h * 0.5), sl2 = P(cx + 0.9, cy + 0.9, z + h * 0.5), sl3 = P(cx + 0.9, cy, z + h * 0.5)
        ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(sl1[0], sl1[1]); ctx.lineTo(sl2[0], sl2[1]); ctx.lineTo(sl3[0], sl3[1]); ctx.stroke()
      }
    }
    tops.push(P(s.x + (s.cols * 0.95) / 2, s.y + (s.rows * 0.95) / 2, levels * CH))
  }
  vignette(ctx, a, 0.8)
  // the hanging sign
  const sg = easeBack(prog(ls, 700, 1100)), sgx = tall ? W * 0.5 : W * 0.7, sgy = lerp(-H * 0.3, H * (tall ? 0.11 : 0.1), sg)
  if (sg > 0) {
    ctx.save(); ctx.translate(sgx, sgy); ctx.rotate(Math.sin(ls * 0.0015) * 0.025)
    // the figure fades in and counts so that it lands as the voice says "29"
    const n0 = c1 * 0.52, np = prog(ls, n0, c1 * 0.18)
    const big = tall ? 34 : a.lang === 'es' ? 42 : 48, lines: Line[] = [
      { s: L(a, 'CEILING · MAXIMUM VALUE', 'TOPE MÁXIMO'), size: 10.5, color: dim(a, 0.95) },
      { s: L(a, '≈29B pesos', '≈29,000 MDP'), size: big, font: 'serif', color: 'rgba(0,0,0,0)' },
      { s: L(a, '1 CRATE = 1,000 MILLION PESOS', '1 CAJA = 1,000 MDP'), size: 9.5, color: dim(a, 0.85 * prog(ls, 1600, 600)) },
    ]
    ctx.strokeStyle = dim(a, 0.7); ctx.lineWidth = Math.max(1, KF); ctx.beginPath(); ctx.moveTo(-60 * KF, 0); ctx.lineTo(-60 * KF, -H * 0.5); ctx.moveTo(60 * KF, 0); ctx.lineTo(60 * KF, -H * 0.5); ctx.stroke()
    const r = evCard(ctx, a, 0, 0, lines, { pad: 14, align: 'center', free: true })
    const fy = r.y + 14 * KF * 0.8 + 10.5 * KF * 1.55 + big * KF * 1.12 * 0.86
    const fig = L(a, `≈${count(29, np, 0, 'en')}B pesos`, `≈${count(29000, np, 0, 'es')} MDP`)
    text(ctx, fig, r.x + 14 * KF, fy, { size: big * KF, color: ink(a, 0.97), alpha: prog(ls, n0 - 200, 300) })
    ctx.restore()
  }
  // the labels
  const lm = prog(ls, c1 + 200, 600)
  if (lm > 0) {
    // landscape: the card hangs just left of the red stack, never over it
    const lines: Line[] = [
      { s: L(a, 'SUBCONTRACTED', 'SERVICIOS MÉDICOS'), size: 10.5, color: ink(a, 0.85) },
      { s: L(a, 'MEDICAL SERVICES', 'SUBROGADOS'), size: 10.5, color: ink(a, 0.85) },
      { s: L(a, '≈6.5B', '≈6,500 MDP'), size: tall ? 26 : a.lang === 'es' ? 28 : 36, font: 'serif', color: red(a, 0.97) },
    ]
    const r = tall
      ? evCard(ctx, a, W * 0.04, H * 0.29 + bob(a, 1), lines, { al: lm, accent: true })
      : evCard(ctx, a, P(stacks[0].x, stacks[0].y + 0.9)[0] - 14 * KF, H * 0.3 + bob(a, 1), lines, { al: lm, accent: true, align: 'right' })
    leader(ctx, a, tops[0], tall ? [r.x + r.w * 0.6, r.y + r.h] : [r.x + r.w, r.y + r.h * 0.5], lm, true)
  }
  const ls2 = prog(ls, c2 + 100, 500)
  if (ls2 > 0) {
    const r = evCard(ctx, a, tall ? W * 0.56 : tops[1][0] + 60 * KF, H * (tall ? 0.3 : 0.35) + bob(a, 2), [
      { s: L(a, 'SECURITY', 'SEGURIDAD'), size: 10.5, color: ink(a, 0.85) },
      { s: L(a, '≈5.8B', '≈5,800 MDP'), size: tall ? 24 : 32, font: 'serif', color: ink(a, 0.97) },
    ], { al: ls2 })
    leader(ctx, a, tops[1], [r.x, r.y + r.h * 0.7], ls2)
  }
  const pr = prog(ls, c1 - 600, 600)
  mono(ctx, a, L(a, 'EVERYTHING ELSE', 'TODO LO DEMÁS'), P(stacks[2].x + stacks[2].cols * 0.95, stacks[2].y)[0] + 10 * KF, tops[2][1], 10, dim(a, 0.9 * pr))
}

// ── 7 · TWO CAUTIONS — a square table, evenly lit: an empty measuring glass, a 37% bar, sealed folders ─
const caveat: SceneFn = (ctx, a) => {
  const { ls, W, H, KF } = a
  const tall = isTall(a), c1 = cue(a, 1), c2 = cue(a, 2), c3 = cue(a, 3), c4 = cue(a, 4)
  const u = tall ? W * 0.08 : Math.min(W * 0.06, H * 0.108)
  // the three objects sit on one screen row across a square table: glass left, bar centre, folders right
  const o = cam(a, 0.5, tall ? 0.55 : 0.53, u, 0.03)
  const P = (x: number, y: number, z = 0) => isoPt(o, x, y, z)
  const b = easeOut(prog(ls, 0, 1300)), DZ = 0.6
  isoFloor(ctx, a, o, 11, 0.08)
  pool(ctx, a, o, 0, 0, 6, 0.16)
  solidBox(ctx, a, o, -3, -3, 6, 6, DZ * b, { lit: 0.42 })
  // 1 · the measuring glass, marked to 29, empty
  const gB = P(-2.0, 2.0, DZ), rx = u * 0.7, ry = rx * 0.45, gh = u * 2.4
  const gp = easeOut(prog(ls, 500, 1300)), mk = prog(ls, c1 + 100, 600)
  const y29 = gB[1] - gh * 0.9
  if (gp > 0) {
    const top = gB[1] - gh * gp
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.beginPath(); ctx.ellipse(gB[0] + rx * 0.3, gB[1] + ry * 0.2, rx * 1.15, ry * 1.1, 0, 0, TAU); ctx.fill()
    ctx.fillStyle = ink(a, 0.05); ctx.fillRect(gB[0] - rx, top, rx * 2, gB[1] - top)
    ctx.strokeStyle = ink(a, 0.25); ctx.lineWidth = Math.max(1, 1.2 * KF); ctx.beginPath(); ctx.ellipse(gB[0], gB[1], rx, ry, 0, Math.PI, TAU); ctx.stroke()
    ctx.strokeStyle = ink(a, 0.8); ctx.lineWidth = Math.max(1, 1.4 * KF)
    ctx.beginPath(); ctx.ellipse(gB[0], gB[1], rx, ry, 0, 0, Math.PI); ctx.moveTo(gB[0] - rx, gB[1]); ctx.lineTo(gB[0] - rx, top); ctx.moveTo(gB[0] + rx, gB[1]); ctx.lineTo(gB[0] + rx, top); ctx.stroke()
    ctx.beginPath(); ctx.ellipse(gB[0], top, rx, ry, 0, 0, TAU); ctx.stroke()
    // graduations 0…29
    for (let i = 1; i <= 6; i++) {
      const yy = gB[1] - (gh * 0.9 * i) / 6
      if (yy < top) break
      ctx.strokeStyle = ink(a, 0.55); ctx.beginPath(); ctx.moveTo(gB[0] - rx, yy); ctx.lineTo(gB[0] - rx + rx * (i % 2 ? 0.25 : 0.45), yy); ctx.stroke()
    }
    // the ceiling ring and the ghost of the column it allows — outlined, never filled
    if (mk > 0) {
      ctx.save(); ctx.setLineDash([5 * KF, 4 * KF]); ctx.lineDashOffset = -ls * 0.02
      ctx.strokeStyle = ink(a, 0.9 * mk); ctx.lineWidth = Math.max(1, 1.4 * KF); ctx.beginPath(); ctx.ellipse(gB[0], y29, rx * 0.9, ry * 0.9, 0, 0, TAU); ctx.stroke()
      ctx.strokeStyle = ink(a, 0.35 * mk); ctx.beginPath(); ctx.moveTo(gB[0] - rx * 0.9, y29); ctx.lineTo(gB[0] - rx * 0.9, gB[1]); ctx.moveTo(gB[0] + rx * 0.9, y29); ctx.lineTo(gB[0] + rx * 0.9, gB[1]); ctx.stroke()
      ctx.restore()
      mono(ctx, a, '29', gB[0] + rx + 6 * KF, y29 + 4 * KF, 12, ink(a, 0.95 * mk), { weight: 700 })
      mono(ctx, a, '0', gB[0] + rx + 6 * KF, gB[1] + 3 * KF, 10, dim(a, 0.9 * mk))
    }
    // a glint slides down the glass
    const gl = (ls * 0.0004) % 1.4
    if (gl < 1) { ctx.fillStyle = ink(a, 0.16); ctx.fillRect(gB[0] + rx * 0.45, lerp(top, gB[1], gl) - 12 * KF, 3 * KF, 24 * KF) }
  }
  // 2 · the bar, by value: grey whole, red 37%
  const bx0 = -1.6, bl = 3.6, barP = easeOut(prog(ls, c2 + 100, 1100)), rp = easeOut(prog(ls, c3 + 100, 900))
  if (barP > 0) {
    solidBox(ctx, a, o, bx0, -0.35, bl * barP, 0.7, 0.4, { z: DZ, lit: 0.55 })
    if (rp > 0) isoBox(ctx, a, o, bx0, -0.35, bl * 0.37 * rp, 0.7, 0.4, { z: DZ, accent: true, lit: 1.25 })
    const e = P(bx0 + bl * barP, 0.35, DZ)
    if (!tall) mono(ctx, a, L(a, 'ALL PESOS = 100%', 'TODO = 100%'), e[0] + 8 * KF, e[1] + 12 * KF, 9.5, dim(a, 0.9 * prog(ls, c2 + 900, 500)))
  }
  // 3 · the sealed folders
  const FX = 1.5, FY = -2.5
  const fp = prog(ls, 300, 900), rd = prog(ls, c4 + 100, 600)
  for (let i = 0; i < 7; i++) {
    const ox = (rnd(i * 3.1) - 0.5) * 0.14, oy = (rnd(i * 5.7) - 0.5) * 0.14
    solidBox(ctx, a, o, FX + ox, FY + oy, 1.0, 0.8, 0.11, { z: DZ + i * 0.12 + (1 - easeOut(clamp01(fp * 1.6 - i * 0.09))) * 0.6, alpha: fp, lit: 0.55 + 0.35 * rd })
  }
  if (fp > 0) { // the band and its seal, tied tight once the sentence reaches them
    const tie = 0.4 + 0.6 * rd
    const s1 = P(FX + 0.45, FY + 0.8, DZ), s2 = P(FX + 0.45, FY + 0.8, DZ + 0.84), s3 = P(FX + 0.45, FY, DZ + 0.84)
    ctx.strokeStyle = `rgba(0,0,0,${0.7 * tie})`; ctx.lineWidth = Math.max(2, u * 0.08); ctx.beginPath(); ctx.moveTo(s1[0], s1[1]); ctx.lineTo(s2[0], s2[1]); ctx.lineTo(s3[0], s3[1]); ctx.stroke()
    const sc = P(FX + 0.5, FY + 0.4, DZ + 0.84); ctx.fillStyle = dim(a, (0.5 + 0.45 * rd) * fp); ctx.beginPath(); ctx.ellipse(sc[0], sc[1], u * 0.17, u * 0.09, 0, 0, TAU); ctx.fill()
  }
  vignette(ctx, a, 0.6)
  // the cards
  const c1p = prog(ls, c1 + 300, 600)
  if (c1p > 0) {
    const sz = tall ? 17 : 24
    const lines: Line[] = [{ s: L(a, 'CEILING,', 'TOPE,'), size: sz, font: 'serif', color: ink(a, 0.97) }, { s: L(a, 'NOT SPEND', 'NO GASTO'), size: sz, font: 'serif', color: ink(a, 0.97) }, { s: L(a, '≈29B · MAXIMUM VALUES', '≈29,000 MDP · MÁXIMOS'), size: tall ? 8.5 : 9.5, color: dim(a, 0.95) }]
    const r = tall
      ? evCard(ctx, a, W * 0.03, H * 0.11 + bob(a, 1), lines, { al: c1p })
      : evCard(ctx, a, gB[0] - rx - 16 * KF, H * 0.17 + bob(a, 1), lines, { al: c1p, align: 'right' })
    leader(ctx, a, [gB[0] - rx * 0.9, y29], tall ? [r.x + r.w * 0.5, r.y + r.h] : [r.x + r.w, r.y + r.h * 0.6], c1p)
  }
  if (rp > 0) {
    const at = P(bx0 + bl * 0.185, 0, DZ + 0.4)
    const lines: Line[] = [{ s: '37%', size: tall ? 32 : 46, font: 'serif', color: red(a, 0.97) }, { s: L(a, 'OF AWARDED', 'DE LOS PESOS'), size: 9.5, color: ink(a, 0.85) }, { s: L(a, 'PESOS', 'ADJUDICADOS'), size: 9.5, color: ink(a, 0.85) }]
    const r = tall
      ? evCard(ctx, a, W * 0.97, H * 0.11 + bob(a, 3), lines, { al: rp, accent: true, align: 'right' })
      : evCard(ctx, a, at[0], H * 0.13 + bob(a, 3), lines, { al: rp, accent: true, align: 'center' })
    leader(ctx, a, at, [r.x + r.w * (tall ? 0.3 : 0.5), r.y + r.h], rp, true)
  }
  if (rd > 0) {
    const at = P(FX + 0.5, FY + 0.4, DZ + 0.9)
    const lines: Line[] = [{ s: L(a, 'JUSTIFICATIONS', 'DICTÁMENES'), size: 11, color: ink(a, 0.95), weight: 700 }, { s: L(a, 'NOT READ', 'NO LEÍDOS'), size: 11, color: dim(a, 0.95), weight: 700 }]
    const r = tall
      ? evCard(ctx, a, W * 0.97, H * 0.6 + bob(a, 4), lines, { al: rd, align: 'right' })
      : evCard(ctx, a, at[0] + 10 * KF, H * 0.16 + bob(a, 4), lines, { al: rd })
    leader(ctx, a, at, tall ? [r.x + r.w * 0.5, r.y] : [r.x + r.w * 0.3, r.y + r.h], rd)
  }
}

// ── 8 · THE SYSTEM — the exit propped open, the queue walking through it, the counter dark ────
const end: SceneFn = (ctx, a) => {
  const { ls } = a
  const c1 = cue(a, 1)
  const o = corridorCam(a, 0.05)
  const route: Pt[] = [[-1.6, 7.2], [-1.6, 1.0], [3.75, 1.0], [3.75, -2.5]]
  const walkers: Walker[] = []
  const N = 13
  for (let i = 0; i < N; i++) {
    const t = (ls / 8200 + i / N) % 1, q = walk(route, t)
    walkers.push({ x: q[0], y: q[1], al: Math.min(1, t * 8) * (1 - prog(t, 0.9, 0.1)), lift: 0.05 * Math.abs(Math.sin(ls * 0.011 + i * 1.7)) })
  }
  const deskDim = lerp(0.45, 0.08, prog(ls, c1, 900))
  corridor(ctx, a, o, { build: 1, exitOn: 0.9 + 0.1 * Math.sin(ls * 0.004), door: 1, empty: 1, desk: deskDim, clerks: 0, walkers, floorLine: easeInOut(prog(ls, c1 + 200, 1800)) })
  // the doorstop that keeps it open
  isoBox(ctx, a, o, 4.0, -1.25, 0.22, 0.22, 0.12, { lit: 0.6 })
  vignette(ctx, a, 0.85)
}

export const scenes: Record<string, SceneFn> = { clause, rare, half, climb, why, routine, money, caveat, end }
