/**
 * filmKit — the drawing kit for hand-built film scenes (components/gallery/films/<slug>.ts).
 *
 * House look, «El Expediente»: warm black ground, bone ink, ONE accusing red. The world is
 * made of paper — contract pages, ledgers, stamps, redaction bars, string and pins — set in
 * Playfair Display (figures, headlines) and JetBrains Mono (labels, typed evidence).
 *
 * A scene is `(ctx, a) => void`, called every frame with `a.ls` = ms into the shot on the
 * narration's clock and `a.cues[i]` = the ms at which sentence i starts. Draw the whole frame
 * as a pure function of those — no state between frames, so any moment can be frozen
 * (?shot=<beat>@<0..1>) and the shot stays in step with the voice in both languages.
 *
 * Title-safe: the tag sits in the top 8% and the subtitle owns the bottom 24% — keep meaning
 * out of both bands. Fill the rest: the key object should span at least a third of the frame.
 */
import type { SceneArgs } from '@/components/gallery/scenes'

export type { SceneArgs, SceneFn } from '@/components/gallery/scenes'

export const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t)
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
export const easeOut = (t: number) => 1 - (1 - t) * (1 - t) * (1 - t)
export const easeIn = (t: number) => t * t * t
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
/** overshoot-and-settle, for things that land (stamps, cards). */
export const easeBack = (t: number) => 1 + 2.4 * Math.pow(t - 1, 3) + 1.4 * Math.pow(t - 1, 2)

/** 0→1 progress of a move that starts at `start` ms and lasts `len` ms (clamped). */
export const prog = (ls: number, start: number, len: number) => clamp01((ls - start) / len)
/** ms at which sentence `i` starts (falls back to an even split when a shot has no cues). */
export const cue = (a: SceneArgs, i: number) => a.cues[i] ?? (a.dur * i) / Math.max(1, a.cues.length || 4)
/** pick the string for the viewer's language. */
export const L = (a: SceneArgs, en: string, es: string) => (a.lang === 'es' ? es : en)
/** stable pseudo-random in [0,1) from an integer seed — never Math.random() in a scene. */
export const rnd = (seed: number) => { const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x) }

export const ink = (a: SceneArgs, o = 1) => `rgba(${a.pal.ink},${o})`
export const dim = (a: SceneArgs, o = 1) => `rgba(${a.pal.dim},${o})`
export const red = (a: SceneArgs, o = 1) => `rgba(${a.pal.accentRGB},${o})`

const FONT = { serif: '"Playfair Display", Georgia, serif', mono: '"JetBrains Mono", ui-monospace, monospace', sans: 'Inter, system-ui, sans-serif' }

export interface TextOpts {
  size: number
  font?: keyof typeof FONT
  weight?: number
  color?: string
  align?: CanvasTextAlign
  baseline?: CanvasTextBaseline
  /** letter-spacing in px (mono labels read best at ~0.12em). */
  tracking?: number
  alpha?: number
  maxWidth?: number
}

/** Draw one line of text. Sizes are in CSS px — multiply by a.KF so type scales with the stage. */
export function text(ctx: CanvasRenderingContext2D, str: string, x: number, y: number, o: TextOpts) {
  ctx.save()
  ctx.font = `${o.weight ?? (o.font === 'mono' ? 500 : 600)} ${o.size}px ${FONT[o.font ?? 'serif']}`
  ctx.textAlign = o.align ?? 'left'
  ctx.textBaseline = o.baseline ?? 'alphabetic'
  ctx.fillStyle = o.color ?? 'rgb(255,255,255)'
  if (o.alpha != null) ctx.globalAlpha *= o.alpha
  if (o.tracking) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${o.tracking}px`
  if (o.maxWidth) ctx.fillText(str, x, y, o.maxWidth); else ctx.fillText(str, x, y)
  ctx.restore()
}

/** the first `p` (0..1) of a string — a typewriter. */
export const typeOn = (str: string, p: number) => str.slice(0, Math.round(str.length * clamp01(p)))
/** a number counting up to `target` as p goes 0→1, with thousands separators. */
export const count = (target: number, p: number, decimals = 0, lang: 'en' | 'es' = 'en') =>
  (target * easeOut(clamp01(p))).toLocaleString(lang === 'es' ? 'es-MX' : 'en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })

/** A contract page: paper rectangle, folded corner, typed lines. The house unit of evidence. */
export function page(ctx: CanvasRenderingContext2D, a: SceneArgs, x: number, y: number, w: number, h: number,
  o: { alpha?: number; rot?: number; lines?: number; accent?: boolean; fill?: number; seed?: number } = {}) {
  const al = o.alpha ?? 1
  if (al <= 0.01) return
  ctx.save()
  ctx.translate(x + w / 2, y + h / 2); ctx.rotate(o.rot ?? 0); ctx.translate(-w / 2, -h / 2)
  const c = Math.min(w, h) * 0.16
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(w - c, 0); ctx.lineTo(w, c); ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath()
  ctx.fillStyle = o.accent ? red(a, 0.16 * al) : ink(a, (o.fill ?? 0.1) * al); ctx.fill()
  ctx.strokeStyle = o.accent ? red(a, 0.95 * al) : ink(a, 0.85 * al); ctx.lineWidth = Math.max(1, 1.4 * a.KF); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(w - c, 0); ctx.lineTo(w - c, c); ctx.lineTo(w, c); ctx.stroke()
  const n = o.lines ?? Math.max(2, Math.floor(h / (9 * a.KF)))
  ctx.fillStyle = o.accent ? red(a, 0.6 * al) : ink(a, 0.42 * al)
  for (let i = 0; i < n; i++) {
    const ly = h * 0.2 + (i * (h * 0.66)) / n
    ctx.fillRect(w * 0.14, ly, w * (0.45 + 0.27 * rnd((o.seed ?? 1) * 31 + i)), Math.max(1, h * 0.022))
  }
  ctx.restore()
}

/** A rubber stamp that slams in: p 0→1 drives the scale-down and the ink. */
export function stamp(ctx: CanvasRenderingContext2D, a: SceneArgs, str: string, x: number, y: number,
  o: { size: number; p?: number; rot?: number; color?: string }) {
  const p = clamp01(o.p ?? 1)
  if (p <= 0) return
  const s = lerp(2.2, 1, easeOut(p)), col = o.color ?? red(a, 0.95)
  ctx.save()
  ctx.translate(x, y); ctx.rotate(o.rot ?? -0.07); ctx.scale(s, s); ctx.globalAlpha *= Math.min(1, p * 2.5)
  ctx.font = `700 ${o.size}px ${FONT.mono}`
  const tw = ctx.measureText(str).width + o.size * 0.16 * str.length, padX = o.size * 0.55, padY = o.size * 0.42
  ctx.strokeStyle = col; ctx.lineWidth = Math.max(1.5, o.size * 0.09)
  ctx.strokeRect(-tw / 2 - padX, -o.size / 2 - padY, tw + padX * 2, o.size + padY * 2)
  text(ctx, str, 0, 0, { size: o.size, font: 'mono', weight: 700, color: col, align: 'center', baseline: 'middle', tracking: o.size * 0.16 })
  ctx.restore()
}

/** A black redaction bar wiping across (p 0→1). */
export function redact(ctx: CanvasRenderingContext2D, a: SceneArgs, x: number, y: number, w: number, h: number, p = 1) {
  ctx.fillStyle = ink(a, 0.92); ctx.fillRect(x, y, w * easeOut(clamp01(p)), h)
}

/** A cut-paper building. ministry = colonnade + pediment, university = dome, court = steps, shell = flat façade (hollow when `hollow`). */
export function building(ctx: CanvasRenderingContext2D, a: SceneArgs, kind: 'ministry' | 'university' | 'court' | 'shell',
  cx: number, baseY: number, w: number, h: number, o: { alpha?: number; accent?: boolean; hollow?: number } = {}) {
  const al = o.alpha ?? 1
  if (al <= 0.01) return
  const x0 = cx - w / 2, y0 = baseY - h, col = (v: number) => (o.accent ? red(a, v * al) : ink(a, v * al))
  ctx.save()
  ctx.lineWidth = Math.max(1, 1.6 * a.KF); ctx.strokeStyle = col(0.9); ctx.fillStyle = col(0.08)
  if (kind === 'shell') {
    ctx.fillRect(x0, y0, w, h); ctx.strokeRect(x0, y0, w, h)
    ctx.strokeRect(x0, y0, w, h * 0.18)
    ctx.strokeRect(x0 + w * 0.12, y0 + h * 0.3, w * 0.3, h * 0.24)
    const dw = w * 0.3, dx = cx + w * 0.08, dy = baseY - h * 0.42
    ctx.strokeRect(dx, dy, dw, h * 0.42)
    const hol = clamp01(o.hollow ?? 0)
    if (hol > 0) { // the front falls away: nothing behind it but a prop
      ctx.fillStyle = `rgba(0,0,0,${0.9 * hol * al})`; ctx.fillRect(x0 + 1, y0 + h * 0.19, w - 2, h * 0.81 - 1)
      ctx.strokeStyle = dim(a, 0.7 * hol * al); ctx.setLineDash([4, 5])
      ctx.beginPath(); ctx.moveTo(x0, y0 + h * 0.2); ctx.lineTo(x0 + w, baseY); ctx.moveTo(x0 + w, y0 + h * 0.2); ctx.lineTo(x0, baseY); ctx.stroke(); ctx.setLineDash([])
    }
  } else {
    const bodyTop = y0 + h * (kind === 'university' ? 0.42 : 0.3)
    ctx.fillRect(x0, bodyTop, w, baseY - bodyTop); ctx.strokeRect(x0, bodyTop, w, baseY - bodyTop)
    const cols = kind === 'court' ? 6 : 5
    for (let i = 0; i < cols; i++) { const px = x0 + w * (0.1 + (0.8 * i) / (cols - 1)); ctx.beginPath(); ctx.moveTo(px, bodyTop + h * 0.06); ctx.lineTo(px, baseY - h * 0.05); ctx.stroke() }
    if (kind === 'university') { ctx.beginPath(); ctx.arc(cx, bodyTop, w * 0.24, Math.PI, 0); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.moveTo(cx, bodyTop - w * 0.24); ctx.lineTo(cx, y0); ctx.stroke() }
    else { ctx.beginPath(); ctx.moveTo(x0 - w * 0.05, bodyTop); ctx.lineTo(cx, y0); ctx.lineTo(x0 + w * 1.05, bodyTop); ctx.closePath(); ctx.fill(); ctx.stroke() }
    if (kind === 'court') for (let s = 1; s <= 2; s++) { ctx.beginPath(); ctx.moveTo(x0 - w * 0.06 * s, baseY + h * 0.05 * s); ctx.lineTo(x0 + w + w * 0.06 * s, baseY + h * 0.05 * s); ctx.stroke() }
  }
  ctx.restore()
}

export type Pt = [number, number]
function along(pts: Pt[], t: number): Pt {
  let total = 0
  const seg: number[] = []
  for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(d); total += d }
  let d = clamp01(t) * total
  for (let i = 0; i < seg.length; i++) { if (d <= seg[i] || i === seg.length - 1) { const u = seg[i] ? d / seg[i] : 0; return [lerp(pts[i][0], pts[i + 1][0], u), lerp(pts[i][1], pts[i + 1][1], u)] } d -= seg[i] }
  return pts[pts.length - 1]
}

/** Draw a polyline up to fraction p of its length (a line that draws itself). */
export function trace(ctx: CanvasRenderingContext2D, pts: Pt[], p: number, o: { color: string; width?: number; dash?: number[] }) {
  if (p <= 0 || pts.length < 2) return
  ctx.save(); ctx.strokeStyle = o.color; ctx.lineWidth = o.width ?? 2; ctx.lineJoin = 'round'; ctx.lineCap = 'round'
  if (o.dash) ctx.setLineDash(o.dash)
  const steps = 48 * (pts.length - 1)
  ctx.beginPath()
  for (let i = 0; i <= steps; i++) { const t = (i / steps) * clamp01(p), q = along(pts, t); if (i === 0) ctx.moveTo(q[0], q[1]); else ctx.lineTo(q[0], q[1]) }
  ctx.stroke(); ctx.restore()
}

/** Money on the move: `n` coins travelling along a path, looping with phase `ls`. */
export function flow(ctx: CanvasRenderingContext2D, a: SceneArgs, pts: Pt[], o: { n?: number; speed?: number; alpha?: number; r?: number; color?: string } = {}) {
  const n = o.n ?? 8, sp = o.speed ?? 0.00022
  ctx.fillStyle = o.color ?? red(a, 0.95)
  for (let i = 0; i < n; i++) {
    const t = (a.ls * sp + i / n) % 1, q = along(pts, t)
    ctx.globalAlpha = (o.alpha ?? 1) * Math.sin(Math.PI * t)
    ctx.beginPath(); ctx.arc(q[0], q[1], (o.r ?? 3.4) * a.KF, 0, Math.PI * 2); ctx.fill()
  }
  ctx.globalAlpha = 1
}

/** A data line that draws itself left to right inside a rect. Returns the pixel point of the last drawn value. */
export function series(ctx: CanvasRenderingContext2D, values: number[], r: { x: number; y: number; w: number; h: number }, max: number, p: number,
  o: { color: string; width?: number }): Pt {
  const pts: Pt[] = values.map((v, i) => [r.x + (i / (values.length - 1)) * r.w, r.y + r.h - (v / max) * r.h])
  trace(ctx, pts, p, o)
  return along(pts, clamp01(p))
}

/** Soft cone of light from a lamp at (x,y) down to `floorY` — puts an object "under the lamp". */
export function lamp(ctx: CanvasRenderingContext2D, a: SceneArgs, x: number, y: number, floorY: number, spread: number, alpha = 0.14) {
  const g = ctx.createLinearGradient(x, y, x, floorY)
  g.addColorStop(0, ink(a, alpha)); g.addColorStop(1, ink(a, 0))
  ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - spread, floorY); ctx.lineTo(x + spread, floorY); ctx.closePath(); ctx.fill()
}

// ── Dioramas (the findings films) ─────────────────────────────────────────────────────────────
// A small isometric world: x runs right-down, y runs left-down, z is up. `o` is the screen
// position of the world origin and `u` the pixel length of one world unit.
export interface Iso { ox: number; oy: number; u: number }
export const isoPt = (o: Iso, x: number, y: number, z = 0): Pt => [o.ox + (x - y) * o.u * 0.866, o.oy + (x + y) * o.u * 0.5 - z * o.u]

function quad(ctx: CanvasRenderingContext2D, pts: Pt[], fill: string, stroke?: string) {
  ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath()
  ctx.fillStyle = fill; ctx.fill()
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke() }
}

/** A box standing on the floor at (x,y), w wide (x), d deep (y), h tall — lit top, two shaded sides. */
export function isoBox(ctx: CanvasRenderingContext2D, a: SceneArgs, o: Iso, x: number, y: number, w: number, d: number, h: number,
  s: { alpha?: number; accent?: boolean; z?: number; lit?: number } = {}) {
  const al = s.alpha ?? 1
  if (al <= 0.01 || h <= 0) return
  const z = s.z ?? 0, k = s.lit ?? 1, c = (v: number) => (s.accent ? red(a, v * al) : ink(a, v * al))
  const P = (px: number, py: number, pz: number) => isoPt(o, px, py, pz)
  quad(ctx, [P(x, y + d, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x, y + d, z + h)], c(0.2 * k), c(0.3)) // left-facing side
  quad(ctx, [P(x + w, y, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x + w, y, z + h)], c(0.34 * k), c(0.3)) // right-facing side
  quad(ctx, [P(x, y, z + h), P(x + w, y, z + h), P(x + w, y + d, z + h), P(x, y + d, z + h)], c(0.78 * k), c(0.5)) // top
}

/** A floor tile grid, fading with distance from the centre — the stage the set stands on. */
export function isoFloor(ctx: CanvasRenderingContext2D, a: SceneArgs, o: Iso, n = 8, alpha = 0.16) {
  ctx.lineWidth = 1
  for (let i = -n; i <= n; i++) {
    ctx.strokeStyle = ink(a, alpha * (1 - Math.abs(i) / (n + 1)))
    let p = isoPt(o, i, -n), q = isoPt(o, i, n)
    ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke()
    p = isoPt(o, -n, i); q = isoPt(o, n, i)
    ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke()
  }
}

/** A pool of light on the floor around world point (x,y). */
export function pool(ctx: CanvasRenderingContext2D, a: SceneArgs, o: Iso, x: number, y: number, r: number, alpha = 0.2) {
  const c = isoPt(o, x, y), rx = r * o.u * 0.866 * 1.4
  ctx.save(); ctx.translate(c[0], c[1]); ctx.scale(1, 0.58)
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx)
  g.addColorStop(0, ink(a, alpha)); g.addColorStop(1, ink(a, 0))
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, rx, 0, Math.PI * 2); ctx.fill(); ctx.restore()
}

/** A miniature person: capsule body, round head, no face. */
export function figure(ctx: CanvasRenderingContext2D, a: SceneArgs, o: Iso, x: number, y: number, s: { alpha?: number; accent?: boolean; h?: number } = {}) {
  const al = s.alpha ?? 1, h = (s.h ?? 0.9) * o.u, f = isoPt(o, x, y), w = h * 0.3
  ctx.fillStyle = s.accent ? red(a, 0.95 * al) : ink(a, 0.9 * al)
  ctx.beginPath(); ctx.roundRect(f[0] - w / 2, f[1] - h * 0.72, w, h * 0.72, w / 2); ctx.fill()
  ctx.beginPath(); ctx.arc(f[0], f[1] - h * 0.86, w * 0.48, 0, Math.PI * 2); ctx.fill()
}

/** A flat evidence card floating over the set, with a leader line down to the thing it describes. */
export function callout(ctx: CanvasRenderingContext2D, a: SceneArgs, at: Pt, card: { x: number; y: number }, lines: { title: string; sub?: string },
  s: { p?: number; accent?: boolean; align?: CanvasTextAlign; size?: number } = {}) {
  const p = clamp01(s.p ?? 1)
  if (p <= 0) return
  const size = (s.size ?? 22) * a.KF, col = s.accent ? red(a, 0.95) : ink(a, 0.95), al = s.align ?? 'left'
  trace(ctx, [at, [card.x, card.y + 6 * a.KF]], easeOut(p), { color: s.accent ? red(a, 0.7) : ink(a, 0.5), width: 1 })
  ctx.fillStyle = col; ctx.beginPath(); ctx.arc(at[0], at[1], 2.6 * a.KF, 0, Math.PI * 2); ctx.fill()
  text(ctx, lines.title, card.x, card.y, { size, color: col, align: al, alpha: Math.min(1, p * 2) })
  if (lines.sub) text(ctx, lines.sub, card.x, card.y + 16 * a.KF, { size: 10.5 * a.KF, font: 'mono', color: ink(a, 0.75), align: al, tracking: 1.2 * a.KF, alpha: Math.min(1, p * 2) })
}
