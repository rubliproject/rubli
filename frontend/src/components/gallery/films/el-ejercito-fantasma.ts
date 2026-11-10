/**
 * «370 millones y desapareció» — the ghost-vendor pattern, told as miniature dioramas under one
 * light (the Fern direction). One draw function per shot, keyed by the beat's `scene` in
 * story-films.json; see filmKit.ts for the contract. The world is a registry hall where every
 * vendor is a small lit booth: two back panels, a lamp bar, a counter with a name plate.
 * Red is only ever the shape: the one booth that does not look like the others, and its kin.
 * No name, initials or company is ever drawn — the plate stays blank on purpose.
 */
import { type Iso, type Pt, type SceneArgs, type SceneFn, L, clamp01, cue, dim, easeBack, easeInOut, easeOut, figure, ink, isoBox, isoPt, lamp, lerp, pool, prog, red, rnd, text, trace } from '@/components/gallery/filmKit'

type C = CanvasRenderingContext2D
const TAU = Math.PI * 2
const isTall = (a: SceneArgs) => a.H > a.W * 0.9
const SERIF = '"Playfair Display", Georgia, serif'
const MONO = '"JetBrains Mono", ui-monospace, monospace'
const fmt = (n: number, a: SceneArgs, d = 0) => n.toLocaleString(a.lang === 'es' ? 'es-MX' : 'en-US', { minimumFractionDigits: d, maximumFractionDigits: d })

// ── small kit extensions ────────────────────────────────────────────────────────────────────

function poly(ctx: C, pts: Pt[], fill?: string | CanvasGradient, stroke?: string, lw = 1) {
  ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath()
  if (fill) { ctx.fillStyle = fill; ctx.fill() }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke() }
}


/** An Iso whose world point (wx, wy, wz) sits at screen (sx·W, sy·H). */
function camAt(a: SceneArgs, wx: number, wy: number, sx: number, sy: number, u: number, wz = 0): Iso {
  const p = isoPt({ ox: 0, oy: 0, u }, wx, wy, wz)
  return { ox: a.W * sx - p[0], oy: a.H * sy - p[1], u }
}

/** −0.5 → 0.5 across the shot: the slow camera drift. */
const drift = (a: SceneArgs) => easeInOut(clamp01(a.ls / a.dur)) - 0.5
const bob = (a: SceneArgs, seed: number) => Math.sin(a.ls * 0.0013 + seed * 1.9) * 2.6 * a.KF

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

/** Floor grid around world point (cx, cy), fading with distance. */
function floorAt(ctx: C, a: SceneArgs, o: Iso, cx: number, cy: number, n: number, alpha: number) {
  if (alpha <= 0.005) return
  ctx.lineWidth = 1
  const x0 = Math.floor(cx), y0 = Math.floor(cy)
  for (let i = -n; i <= n; i++) {
    ctx.strokeStyle = ink(a, alpha * (1 - Math.abs(i) / (n + 1)))
    let p = isoPt(o, x0 + i, y0 - n), q = isoPt(o, x0 + i, y0 + n)
    ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke()
    p = isoPt(o, x0 - n, y0 + i); q = isoPt(o, x0 + n, y0 + i)
    ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke()
  }
}

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

function leader(ctx: C, a: SceneArgs, from: Pt, to: Pt, p: number, accent = false) {
  if (p <= 0) return
  trace(ctx, [from, to], easeOut(p), { color: accent ? red(a, 0.75) : ink(a, 0.5), width: Math.max(1, a.KF) })
  ctx.fillStyle = accent ? red(a, 0.95) : ink(a, 0.9)
  ctx.beginPath(); ctx.arc(from[0], from[1], 2.6 * a.KF, 0, TAU); ctx.fill()
}
/** the point on a card's border nearest to `p` (so a leader meets the card, not its middle). */
const edge = (r: Rect, p: Pt): Pt => [Math.max(r.x, Math.min(r.x + r.w, p[0])), p[1] < r.y ? r.y : p[1] > r.y + r.h ? r.y + r.h : (p[0] < r.x ? r.y + r.h / 2 : r.y + r.h / 2)]

/** An opaque box: the silhouette is filled with the ground first, so boxes don't read as glass. */
function solidBox(ctx: C, a: SceneArgs, o: Iso, x: number, y: number, w: number, d: number, h: number, s: { alpha?: number; accent?: boolean; z?: number; lit?: number } = {}) {
  const al = s.alpha ?? 1, z = s.z ?? 0
  if (al <= 0.01 || h <= 0) return
  const P = (px: number, py: number, pz: number) => isoPt(o, px, py, pz)
  ctx.save(); ctx.globalAlpha *= al
  poly(ctx, [P(x, y, z + h), P(x + w, y, z + h), P(x + w, y, z), P(x + w, y + d, z), P(x, y + d, z), P(x, y + d, z + h)], a.pal.bg)
  ctx.restore()
  isoBox(ctx, a, o, x, y, w, d, h, s)
}

/** A dashed footprint on the floor — where something stood, or never stood. */
function footprint(ctx: C, a: SceneArgs, o: Iso, x: number, y: number, w: number, d: number, al: number, accent = false) {
  if (al <= 0.01) return
  ctx.save(); ctx.setLineDash([4 * a.KF, 4 * a.KF])
  poly(ctx, [isoPt(o, x, y), isoPt(o, x + w, y), isoPt(o, x + w, y + d), isoPt(o, x, y + d)], accent ? red(a, 0.07 * al) : undefined, accent ? red(a, 0.85 * al) : ink(a, 0.4 * al), Math.max(1, a.KF))
  ctx.restore()
}

/** A miniature person with a contact shadow, standing on a surface at height z. */
function mini(ctx: C, a: SceneArgs, o: Iso, x: number, y: number, s: { al?: number; accent?: boolean; h?: number; z?: number; dark?: boolean } = {}) {
  const al = s.al ?? 1, z = s.z ?? 0
  if (al <= 0.01) return
  const f = isoPt(o, x, y, z), hh = (s.h ?? 0.9) * o.u, w = hh * 0.3
  ctx.fillStyle = `rgba(0,0,0,${0.55 * al})`; ctx.beginPath(); ctx.ellipse(f[0], f[1], w * 0.9, w * 0.38, 0, 0, TAU); ctx.fill()
  ctx.save(); ctx.translate(0, -z * o.u)
  if (s.dark) { // a silhouette: the shape is there, the person is not lit
    ctx.fillStyle = `rgba(0,0,0,${0.9 * al})`; ctx.strokeStyle = s.accent ? red(a, 0.9 * al) : dim(a, 0.7 * al); ctx.lineWidth = Math.max(1, a.KF)
    const g = isoPt(o, x, y)
    ctx.beginPath(); ctx.roundRect(g[0] - w / 2, g[1] - hh * 0.72, w, hh * 0.72, w / 2); ctx.fill(); ctx.stroke()
    ctx.beginPath(); ctx.arc(g[0], g[1] - hh * 0.86, w * 0.48, 0, TAU); ctx.fill(); ctx.stroke()
  } else figure(ctx, a, o, x, y, { alpha: al, accent: s.accent, h: s.h })
  ctx.restore()
}

// ── THE BOOTH: one vendor in the registry hall ───────────────────────────────────────────────
interface BoothOpts { al?: number; lit?: number; red?: number; occ?: 'crates' | 'staff' | 'person' | 'none'; occAl?: number; plate?: number; seed?: number; z?: number; folders?: number }
const BH = 1.25 // back-panel height

function booth(ctx: C, a: SceneArgs, o: Iso, x: number, y: number, s: BoothOpts = {}) {
  const al = s.al ?? 1
  if (al <= 0.01) return
  const z = s.z ?? 0, lit = s.lit ?? 0.5, rd = s.red ?? 0
  const P = (px: number, py: number, pz: number) => isoPt(o, px, py, pz)
  const panel = (px: number, py: number, w: number, d: number, h: number, zz = z, l = 0.42 + 0.35 * lit) => {
    solidBox(ctx, a, o, px, py, w, d, h, { alpha: al, lit: l, z: zz })
    if (rd > 0.01) isoBox(ctx, a, o, px, py, w, d, h, { alpha: al * rd, accent: true, lit: 0.95, z: zz })
  }
  if (z === 0) {
    if (lit > 0.02) pool(ctx, a, o, x + 0.5, y + 0.6, 0.9, 0.2 * lit * al)
    rpool(ctx, a, o, x + 0.5, y + 0.6, 1.2, 0.32 * rd * al)
  }
  solidBox(ctx, a, o, x, y, 1, 1, 0.05, { alpha: al, lit: 0.45, z })
  panel(x, y, 1, 0.07, BH)
  panel(x, y + 0.07, 0.07, 0.93, BH)
  // the lamp bar on the back panel
  isoBox(ctx, a, o, x + 0.25, y + 0.07, 0.5, 0.08, 0.05, { z: z + BH - 0.12, alpha: al, lit: 0.5 + 0.8 * lit, accent: rd > 0.5 })
  // who (or what) is inside
  const oa = al * (s.occAl ?? 1), sd = s.seed ?? 1
  if (s.occ === 'crates' && oa > 0.01) {
    solidBox(ctx, a, o, x + 0.14, y + 0.14, 0.3, 0.3, 0.28, { z: z + 0.05, alpha: oa, lit: 0.6 })
    if (rnd(sd * 3.1) > 0.35) solidBox(ctx, a, o, x + 0.17, y + 0.17, 0.24, 0.24, 0.2, { z: z + 0.33, alpha: oa, lit: 0.7 })
    solidBox(ctx, a, o, x + 0.5, y + 0.12, 0.3, 0.26, 0.22 + 0.12 * rnd(sd * 5.7), { z: z + 0.05, alpha: oa, lit: 0.55 })
  } else if (s.occ === 'staff' && oa > 0.01) {
    solidBox(ctx, a, o, x + 0.18, y + 0.15, 0.55, 0.22, 0.32, { z: z + 0.05, alpha: oa, lit: 0.55 })
    mini(ctx, a, o, x + 0.32, y + 0.5, { al: oa, h: 0.7, z: z + 0.05 })
    mini(ctx, a, o, x + 0.66, y + 0.46, { al: oa, h: 0.7, z: z + 0.05 })
  } else if (s.occ === 'person' && oa > 0.01) {
    mini(ctx, a, o, x + 0.5, y + 0.46, { al: oa, h: 0.8, z: z + 0.05, accent: rd > 0.3 })
  }
  // the counter and its name plate
  panel(x + 0.07, y + 0.72, 0.93, 0.26, 0.5)
  for (let k = 0; k < (s.folders ?? 0); k++) isoBox(ctx, a, o, x + 0.18 + k * 0.36, y + 0.76, 0.28, 0.18, 0.035, { z: z + 0.5, alpha: al, lit: 1.1 })
  const pq: Pt[] = [P(x + 0.22, y + 0.98, z + 0.13), P(x + 0.86, y + 0.98, z + 0.13), P(x + 0.86, y + 0.98, z + 0.39), P(x + 0.22, y + 0.98, z + 0.39)]
  poly(ctx, pq, `rgba(0,0,0,${0.6 * al})`, ink(a, 0.42 * al), 1)
  const pl = s.plate ?? 0
  if (pl > 0.01) {
    ctx.strokeStyle = ink(a, 0.55 * al); ctx.lineWidth = Math.max(1, o.u * 0.03)
    for (let r = 0; r < 2; r++) {
      const zz = z + 0.3 - r * 0.09, len = (r ? 0.32 : 0.48) * pl
      const p = P(x + 0.28, y + 0.98, zz), q = P(x + 0.28 + len, y + 0.98, zz)
      ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke()
    }
  }
}

/** The shape — two spikes on a flat line: nothing before, two contracts, nothing after. */
function shapeGlyph(ctx: C, x: number, y: number, w: number, h: number, p: number, color: string, lw: number) {
  trace(ctx, [[x, y], [x + w * 0.38, y], [x + w * 0.42, y - h], [x + w * 0.46, y], [x + w * 0.54, y], [x + w * 0.58, y - h * 0.82], [x + w * 0.62, y], [x + w, y]], p, { color, width: lw })
}

// ── 0 · ONE LINE — the camera runs down the aisles to one booth that is different ───────────
const line: SceneFn = (ctx, a) => {
  const { ls, W, H, KF } = a
  const tall = isTall(a), c1 = cue(a, 1)
  const u = tall ? W * 0.085 : Math.min(W * 0.055, H * 0.09)
  const SP = 1.55, ODD = 16, ox = ODD * SP
  const tr = easeInOut(prog(ls, 0, c1 + 1500))
  const camX = lerp(-3, ox + 0.5, tr) + prog(ls, c1 + 1500, 7000) * 0.5
  const camY = lerp(0.2, -1.5, tr)
  const o = camAt(a, camX, camY, tall ? 0.5 : 0.52, tall ? 0.52 : 0.56, u)
  floorAt(ctx, a, o, camX, 0, 12, 0.1)
  // the aisle runner
  const r0 = Math.floor(camX) - 14, r1 = Math.floor(camX) + 14
  poly(ctx, [isoPt(o, r0, -0.45), isoPt(o, r1, -0.45), isoPt(o, r1, 0.45), isoPt(o, r0, 0.45)], ink(a, 0.035))
  ctx.save(); ctx.setLineDash([6 * KF, 9 * KF]); trace(ctx, [isoPt(o, r0, 0), isoPt(o, r1, 0)], 1, { color: ink(a, 0.16), width: 1 }); ctx.restore()
  const red1 = easeOut(prog(ls, c1 + 900, 900))
  for (const ry of [-2.25, 1.25]) {
    for (let i = Math.max(-4, Math.floor((camX - 13) / SP)); i <= Math.floor((camX + 13) / SP); i++) {
      const bx = i * SP, fog = clamp01(1.25 - Math.abs(bx + 0.5 - camX) / 10)
      if (fog <= 0.01) continue
      const odd = ry < 0 && i === ODD, sd = i * 7 + (ry < 0 ? 1 : 2)
      const lit = 0.3 + 0.45 * rnd(sd) + 0.08 * Math.sin(ls * 0.002 + sd)
      booth(ctx, a, o, bx, ry, { al: fog, lit: odd ? 0.9 : lit, occ: odd ? 'person' : rnd(sd * 1.7) > 0.45 ? 'crates' : 'staff', plate: odd ? 0 : 1, seed: sd, red: odd ? red1 : 0 })
    }
  }
  vignette(ctx, a, 0.75)
  // sentence 0: the scale of the hall
  const p0 = prog(ls, 250, 600)
  evCard(ctx, a, tall ? W * 0.5 : W * 0.05, H * 0.12 + bob(a, 1), [
    { s: L(a, 'THE FEDERAL RECORD', 'EL REGISTRO FEDERAL'), size: 10.5, color: dim(a, 0.95) },
    { s: L(a, '3 million contracts', '3 millones de contratos'), size: tall ? 22 : 30, font: 'serif', color: ink(a, 0.96) },
  ], { al: p0, align: tall ? 'center' : 'left' })
  // sentence 1: one line is not like the others
  const p1 = prog(ls, c1 + 1500, 700)
  if (p1 > 0) {
    const at = isoPt(o, ox + 0.5, -1.7, BH + 0.15)
    const cx = tall ? W * 0.5 : Math.min(W * 0.8, at[0] + 90 * KF), cy = tall ? H * 0.6 : H * 0.16
    const r = evCard(ctx, a, cx, cy + bob(a, 3), [
      { s: L(a, 'One line', 'Una línea'), size: tall ? 24 : 30, font: 'serif', color: red(a, 0.97) },
      { s: L(a, 'NOT LIKE THE OTHERS', 'NO COMO LAS DEMÁS'), size: 10.5, color: ink(a, 0.85) },
    ], { al: p1, accent: true, align: tall ? 'center' : 'left' })
    leader(ctx, a, at, edge(r, at), p1, true)
  }
}

// ── 1 · NOT A COMPANY — the booth up close: a company dissolves, one person stands there ────
function ministry(ctx: C, a: SceneArgs, o: Iso, x: number, y: number, w: number, d: number, h: number, al: number, lit: number) {
  if (al <= 0.01) return
  solidBox(ctx, a, o, x, y, w, d, 0.12, { alpha: al, lit: 0.4 + 0.5 * lit })
  solidBox(ctx, a, o, x + 0.15, y + 0.15, w - 0.3, d - 0.45, h, { alpha: al, lit: 0.3 + 0.6 * lit, z: 0.12 })
  for (let i = 0; i < 5; i++) solidBox(ctx, a, o, x + 0.2 + (i * (w - 0.5)) / 4, y + d - 0.26, 0.1, 0.1, h - 0.05, { alpha: al, lit: 0.45 + 0.6 * lit, z: 0.12 })
  solidBox(ctx, a, o, x + 0.05, y + 0.05, w - 0.1, d - 0.1, 0.16, { alpha: al, lit: 0.5 + 0.6 * lit, z: 0.12 + h })
}

const personScene: SceneFn = (ctx, a) => {
  const { ls, W, H, KF } = a
  const tall = isTall(a), cs = [0, 1, 2, 3, 4, 5].map((i) => cue(a, i))
  const u = tall ? W * 0.21 : Math.min(W * 0.13, H * 0.22)
  const dr = drift(a)
  const o = camAt(a, 0.6 + dr * 0.4, 0.4 - dr * 0.3, tall ? 0.42 : 0.3, tall ? 0.34 : 0.52, u, 0.5)
  floorAt(ctx, a, o, 0.5, 0.5, 6, 0.1)
  // the institution, in the dark behind — it lights when the voice names it
  const inst = easeOut(prog(ls, cs[3], 800))
  if (!tall) ministry(ctx, a, o, 1.0, -3.4, 1.2, 1.0, 0.9, 0.35 + 0.65 * inst, inst)
  if (inst > 0) pool(ctx, a, o, 1.6, -2.9, 1.3, 0.18 * inst)
  // one year: a track of years on the floor, one segment lit
  const yr = easeOut(prog(ls, cs[4], 700))
  for (let k = -3; k <= 3; k++) {
    const on = k === 0 ? yr : 0
    poly(ctx, [isoPt(o, -1.6 + k * 0.62, 1.45), isoPt(o, -1.08 + k * 0.62, 1.45), isoPt(o, -1.08 + k * 0.62, 1.75), isoPt(o, -1.6 + k * 0.62, 1.75)],
      on > 0 ? ink(a, 0.1 + 0.45 * on) : ink(a, 0.05), ink(a, 0.25 + 0.4 * on), 1)
  }
  // the company that is not there: staff and stock fade to outlines
  const gone = easeInOut(prog(ls, cs[1] - 900, 900))
  const pin = easeOut(prog(ls, cs[1], 700))
  const folders = (k: number) => prog(ls, cs[2] + 150 + k * 380, 450)
  booth(ctx, a, o, 0, 0, { lit: 0.85, red: pin, occ: 'none', plate: 0 })
  if (gone < 1) {
    const oa = 1 - gone
    solidBox(ctx, a, o, 0.15, 0.14, 0.6, 0.2, 0.3, { alpha: oa, lit: 0.55, z: 0.05 })
    solidBox(ctx, a, o, 0.76, 0.12, 0.18, 0.2, 0.42, { alpha: oa, lit: 0.6, z: 0.05 })
    for (const [fx, fy] of [[0.25, 0.48], [0.5, 0.42], [0.75, 0.52]] as const) mini(ctx, a, o, fx, fy, { al: oa, h: 0.62, z: 0.05 })
  }
  if (gone > 0) for (const [fx, fy] of [[0.25, 0.48], [0.75, 0.52]] as const) {
    const g = isoPt(o, fx, fy, 0.05)
    ctx.save(); ctx.setLineDash([3 * KF, 3 * KF]); ctx.strokeStyle = ink(a, 0.3 * gone * (1 - pin * 0.6)); ctx.lineWidth = 1
    ctx.beginPath(); ctx.ellipse(g[0], g[1] - u * 0.32, u * 0.07, u * 0.25, 0, 0, TAU); ctx.stroke(); ctx.restore()
  }
  if (pin > 0) mini(ctx, a, o, 0.5, 0.46, { al: pin, h: 0.8, z: 0.05 + (1 - easeBack(pin)) * 0.5, accent: true })
  // the counter is drawn again over the occupants so they stand behind it
  solidBox(ctx, a, o, 0.07, 0.72, 0.93, 0.26, 0.5, { lit: 0.72 })
  isoBox(ctx, a, o, 0.07, 0.72, 0.93, 0.26, 0.5, { alpha: pin, accent: true, lit: 0.95 })
  poly(ctx, [isoPt(o, 0.22, 0.98, 0.13), isoPt(o, 0.86, 0.98, 0.13), isoPt(o, 0.86, 0.98, 0.39), isoPt(o, 0.22, 0.98, 0.39)], 'rgba(0,0,0,0.6)', ink(a, 0.42), 1)
  for (let k = 0; k < 2; k++) {
    const f = folders(k)
    if (f > 0) isoBox(ctx, a, o, 0.18 + k * 0.38, 0.76, 0.3, 0.19, 0.04, { z: 0.5 + (1 - easeOut(f)) * 0.7, alpha: f, lit: 1.15 })
  }
  // the thread from the counter to the institution
  if (inst > 0 && !tall) {
    const p = isoPt(o, 0.55, 0.85, 0.55), q = isoPt(o, 2.1, -2.4, 1.6)
    trace(ctx, [p, [lerp(p[0], q[0], 0.5), Math.min(p[1], q[1]) - u * 0.5], q], inst, { color: ink(a, 0.55), width: Math.max(1, KF) })
  }
  vignette(ctx, a, 0.7)
  // the ledger row fills field by field on the voice
  const rows: { lab: string; val: string; p: number; accent?: boolean }[] = [
    { lab: L(a, 'VENDOR', 'PROVEEDOR'), val: L(a, 'a person', 'una persona'), p: pin, accent: true },
    { lab: L(a, 'CONTRACTS', 'CONTRATOS'), val: '2', p: prog(ls, cs[2], 400) },
    { lab: L(a, 'INSTITUTIONS', 'INSTITUCIONES'), val: '1', p: prog(ls, cs[3], 400) },
    { lab: L(a, 'YEARS ACTIVE', 'AÑOS ACTIVO'), val: '1', p: prog(ls, cs[4], 400) },
  ]
  const cw = (tall ? 0.86 : 0.34) * W, cx = tall ? W * 0.07 : W * 0.6, cy = (tall ? H * 0.47 : H * 0.4) + bob(a, 2)
  const rh = (tall ? 22 : 30) * KF, pad = 14 * KF, big = (tall ? 38 : 56) * KF
  const ch = pad * 1.6 + 12 * KF + rh * rows.length + big * 1.25
  const cal = prog(ls, 200, 600)
  ctx.save(); ctx.globalAlpha *= cal
  ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(cx + 5 * KF, cy + 7 * KF, cw, ch)
  ctx.fillStyle = a.pal.bg; ctx.fillRect(cx, cy, cw, ch)
  ctx.fillStyle = ink(a, 0.05); ctx.fillRect(cx, cy, cw, ch)
  ctx.strokeStyle = ink(a, 0.45); ctx.lineWidth = Math.max(1, 1.1 * KF); ctx.strokeRect(cx, cy, cw, ch)
  mono(ctx, a, L(a, 'ONE LINE OF THE RECORD', 'UNA LÍNEA DEL REGISTRO'), cx + pad, cy + pad + 4 * KF, 10, dim(a, 0.95))
  rows.forEach((r, i) => {
    const y = cy + pad * 1.6 + 12 * KF + rh * (i + 0.7)
    mono(ctx, a, r.lab, cx + pad, y, 10.5, ink(a, 0.7))
    ctx.strokeStyle = ink(a, 0.12); ctx.beginPath(); ctx.moveTo(cx + pad, y + rh * 0.3); ctx.lineTo(cx + cw - pad, y + rh * 0.3); ctx.stroke()
    if (r.p > 0) text(ctx, r.val, cx + cw - pad, y + 2 * KF, { size: (tall ? 17 : 22) * KF, color: r.accent ? red(a, 0.97) : ink(a, 0.96), align: 'right', alpha: r.p })
  })
  const pa = prog(ls, cs[5] + 250, 550)
  if (pa > 0) {
    const y = cy + ch - pad * 0.9
    text(ctx, `${fmt(370, a)} ${L(a, 'million', 'millones')}`, cx + pad, y, { size: big, color: red(a, 0.97), alpha: pa, maxWidth: cw - pad * 2 - 56 * KF })
    mono(ctx, a, 'PESOS', cx + cw - pad, y, 11, ink(a, 0.85), { align: 'right', alpha: pa })
  }
  ctx.restore()
  if (pin > 0) leader(ctx, a, isoPt(o, 0.5, 0.46, 0.95), tall ? [W * 0.5, cy] : [cx, cy + ch * 0.3], pin * cal, true)
}

// ── 2 · THEN NOTHING — the booth on a timeline track: empty slots before and after ──────────
const gone: SceneFn = (ctx, a) => {
  const { ls, W, H, KF } = a
  const tall = isTall(a), c1 = cue(a, 1), c2 = cue(a, 2)
  const u = tall ? W * 0.075 : Math.min(W * 0.052, H * 0.09)
  const dr = drift(a)
  const o = camAt(a, 0.5 + dr * 1.4, 0, 0.5, tall ? 0.47 : 0.46, u)
  const N = 6
  floorAt(ctx, a, o, 0, 0, 10, 0.07)
  pool(ctx, a, o, 0.5, 0.4, 3, 0.16)
  // the track: two rails and sleepers, one slot per period
  for (let k = -N; k <= N; k++) {
    const fog = clamp01(1.2 - Math.abs(k) / (N + 0.5))
    isoBox(ctx, a, o, k + 0.05, -0.15, 0.9, 1.3, 0.025, { alpha: 0.5 * fog, lit: 0.5 })
  }
  for (const ry of [-0.22, 1.12]) isoBox(ctx, a, o, -N, ry, 2 * N + 1, 0.06, 0.06, { lit: 0.6, alpha: 0.8 })
  // nothing before (sentence 0) and nothing after (sentence 1): each slot is checked and found empty
  for (let k = 1; k <= N; k++) {
    const fog = clamp01(1.2 - k / (N + 0.5))
    const pb = prog(ls, 300 + k * 140, 300), pa = prog(ls, c1 + k * 140, 300)
    footprint(ctx, a, o, -k + 0.05, 0, 0.9, 1, fog * (0.3 + 0.7 * pb))
    footprint(ctx, a, o, k + 0.05, 0, 0.9, 1, fog * (0.3 + 0.7 * pa))
    if (pb > 0) { const c = isoPt(o, -k + 0.5, 0.5); glow(ctx, c[0], c[1], u * 0.6, ink(a, 0.1 * pb * fog * (1 - prog(ls, 700 + k * 140, 800) * 0.6)), ink(a, 0)) }
    if (pa > 0) { const c = isoPt(o, k + 0.5, 0.5); glow(ctx, c[0], c[1], u * 0.6, ink(a, 0.1 * pa * fog * (1 - prog(ls, c1 + 400 + k * 140, 800) * 0.6)), ink(a, 0)) }
  }
  // the one slot that holds something — then doesn't
  const sayAmt = c2 + (a.dur - c2) * 0.3, vanish = c2 + (a.dur - c2) * 0.62
  const v = easeInOut(prog(ls, vanish, 1300))
  const lit = 0.8 + 0.2 * prog(ls, c2, 500)
  booth(ctx, a, o, 0.05, 0, { al: 1 - v, lit, red: 0.85 + 0.15 * prog(ls, c2, 500), occ: 'person', plate: 0, folders: 2, z: v * 0.5 })
  footprint(ctx, a, o, 0.05, 0, 0.9, 1, v, true)
  vignette(ctx, a, 0.75)
  // labels: before ← · → after
  const lb = prog(ls, 300, 600), la = prog(ls, c1, 600)
  const pB = isoPt(o, -3.5, 0.5, 0.05), pA = isoPt(o, 3.5, 0.5, 0.05)
  const yB = tall ? H * 0.28 : pB[1] - u * 2.2, yA = tall ? H * 0.62 : pA[1] - u * 2.6
  const rB = evCard(ctx, a, tall ? W * 0.06 : pB[0] - u * 1.5, yB + bob(a, 1), [{ s: L(a, 'Nothing before', 'Nada antes'), size: tall ? 20 : 26, font: 'serif', color: ink(a, 0.95) }], { al: lb })
  leader(ctx, a, pB, edge(rB, pB), lb)
  const rA = evCard(ctx, a, tall ? W * 0.94 : pA[0] + u * 1.4, (tall ? yA : pA[1] - u * 0.4) + bob(a, 2), [{ s: L(a, 'Nothing after', 'Nada después'), size: tall ? 20 : 26, font: 'serif', color: ink(a, 0.95) }], { al: la, align: tall ? 'right' : 'left' })
  leader(ctx, a, pA, edge(rA, pA), la)
  // the amount lands with the voice, and stays after the booth is gone
  const pm = prog(ls, sayAmt, 500)
  if (pm > 0) {
    const at = isoPt(o, 0.5, 0.2, BH + 0.2)
    const r = evCard(ctx, a, tall ? W * 0.5 : at[0] + 40 * KF, tall ? H * 0.11 : H * 0.12 + bob(a, 3), [
      { s: `${fmt(370, a)} ${L(a, 'million pesos', 'millones de pesos')}`, size: tall ? 24 : 34, font: 'serif', color: red(a, 0.97) },
      { s: v > 0.5 ? L(a, 'NEVER SEEN IN THE RECORD AGAIN', 'NO VUELVE A APARECER') : L(a, 'FROM THE FEDERAL GOVERNMENT', 'DEL GOBIERNO FEDERAL'), size: 10, color: ink(a, 0.82) },
    ], { al: pm, accent: true, align: tall ? 'center' : 'left' })
    leader(ctx, a, at, edge(r, at), pm, true)
  }
}

// ── 3 · THE NAME — the plate stays blank; the registries come back empty; a shape remains ────
const name: SceneFn = (ctx, a) => {
  const { ls, W, H, KF } = a
  const tall = isTall(a), cs = [0, 1, 2, 3, 4, 5].map((i) => cue(a, i))
  const u = tall ? W * 0.3 : Math.min(W * 0.155, H * 0.27)
  const dr = drift(a)
  const o = camAt(a, 1.0 + dr * 0.25, 0.9, tall ? 0.4 : 0.4, tall ? 0.5 : 0.5, u, 0.35)
  floorAt(ctx, a, o, 0.5, 1, 5, 0.08)
  const pc = isoPt(o, 0.54, 0.98, 0.26)
  lamp(ctx, a, pc[0], H * 0.0, pc[1] + u * 0.4, u * 0.9, 0.12)
  pool(ctx, a, o, 0.6, 1.3, 1.6, 0.2)
  // the person behind the counter, unlit
  const pv = prog(ls, cs[1], 700)
  booth(ctx, a, o, 0, 0, { lit: 0.4, occ: 'none', plate: 0 })
  mini(ctx, a, o, 0.5, 0.46, { h: 0.8, z: 0.05, dark: true, al: 0.6 + 0.4 * pv })
  solidBox(ctx, a, o, 0.07, 0.72, 0.93, 0.26, 0.5, { lit: 0.75 })
  const pq: Pt[] = [isoPt(o, 0.22, 0.98, 0.13), isoPt(o, 0.86, 0.98, 0.13), isoPt(o, 0.86, 0.98, 0.39), isoPt(o, 0.22, 0.98, 0.39)]
  poly(ctx, pq, 'rgba(0,0,0,0.75)', ink(a, 0.6), Math.max(1, 1.2 * KF))
  // screws on the plate, a blank between them
  for (const sx of [0.26, 0.82]) { const s = isoPt(o, sx, 0.98, 0.26); ctx.fillStyle = ink(a, 0.5); ctx.beginPath(); ctx.arc(s[0], s[1], 2.2 * KF, 0, TAU); ctx.fill() }
  // the shape that we do have, traced onto the plate on the last sentence
  const sh = prog(ls, cs[5] + 200, 1400)
  if (sh > 0) {
    const pts: Pt[] = [[0.32, 0.19], [0.5, 0.19], [0.52, 0.34], [0.54, 0.19], [0.58, 0.19], [0.6, 0.32], [0.62, 0.19], [0.78, 0.19]].map(([px, pz]) => isoPt(o, px, 0.981, pz))
    trace(ctx, pts, easeInOut(sh), { color: red(a, 0.95), width: Math.max(1.5, 2.2 * KF) })
    const c = isoPt(o, 0.55, 0.98, 0.26); glow(ctx, c[0], c[1], u * 0.5, red(a, 0.14 * sh), red(a, 0))
  }
  // the filing cabinet: three registries, each opened and found empty
  const CX = 1.3, CY = 0.3, CW = 0.78, CD = 0.68, CH = 1.12
  solidBox(ctx, a, o, CX, CY, CW, CD, CH, { lit: 0.6 })
  const labs = [L(a, 'TAX-AUTHORITY LIST', 'LISTA DEL SAT'), L(a, 'SANCTIONS', 'SANCIONES'), L(a, 'CHARGES', 'ACUSACIONES')]
  for (let k = 0; k < 3; k++) {
    const sl = easeOut(prog(ls, cs[2 + k], 700)) * 0.42
    const z0 = CH - (k + 1) * 0.36 + 0.03
    const fy = CY + CD + sl
    solidBox(ctx, a, o, CX + 0.06, CY + 0.06 + sl, CW - 0.12, CD - 0.06, 0.3, { z: z0, lit: 0.55 + 0.4 * (sl > 0 ? 1 : 0) })
    if (sl > 0.02) // the open top: dark and empty
      poly(ctx, [isoPt(o, CX + 0.1, CY + CD - 0.02 - sl + sl, z0 + 0.3), isoPt(o, CX + CW - 0.1, CY + CD - 0.02, z0 + 0.3), isoPt(o, CX + CW - 0.1, fy - 0.05, z0 + 0.3), isoPt(o, CX + 0.1, fy - 0.05, z0 + 0.3)], 'rgba(0,0,0,0.85)')
  }
  vignette(ctx, a, 0.72)
  // the tags, over the drawers
  for (let k = 0; k < 3; k++) {
    const z0 = CH - (k + 1) * 0.36 + 0.03
    const ph = prog(ls, cs[2 + k] + 450, 500), lab = prog(ls, cs[2 + k] - 200, 400)
    const at = isoPt(o, CX + CW, CY + CD * 0.5, z0 + 0.2)
    const tx = Math.min(at[0] + 16 * KF, W * 0.975 - measure(ctx, labs[k], 10.5 * KF, 'mono'))
    mono(ctx, a, labs[k], tx, at[1] - 2 * KF, 10.5, ink(a, 0.92), { alpha: Math.max(0.35, lab) })
    mono(ctx, a, L(a, '0 RECORDS', '0 REGISTROS'), tx, at[1] + 13 * KF, 10, dim(a, 0.95), { alpha: ph })
  }
  // sentence 0: no name. sentence 1: a private individual.
  const p0 = prog(ls, 400, 600)
  const pb = isoPt(o, 0.54, 0.98, 0.1)
  mono(ctx, a, L(a, 'NAME WITHHELD', 'NOMBRE RESERVADO'), pb[0] - u * 0.05, pb[1] + 18 * KF, 10.5, dim(a, 0.95), { align: 'center', alpha: p0 })
  if (pv > 0) {
    const at = isoPt(o, 0.5, 0.46, 0.95)
    const r = evCard(ctx, a, tall ? W * 0.06 : at[0] - u * 0.6, H * 0.12 + bob(a, 2), [
      { s: L(a, 'A private individual', 'Un particular'), size: tall ? 20 : 26, font: 'serif', color: ink(a, 0.96) },
    ], { al: pv, align: tall ? 'left' : 'right' })
    leader(ctx, a, at, edge(r, at), pv)
  }
  if (sh > 0) {
    const at = isoPt(o, 0.7, 0.98, 0.34)
    const r = evCard(ctx, a, tall ? W * 0.5 : at[0] - u * 0.9, tall ? H * 0.6 : H * 0.62, [{ s: L(a, 'A shape', 'Una forma'), size: tall ? 20 : 26, font: 'serif', color: red(a, 0.97) }], { al: prog(ls, cs[5] + 600, 600), accent: true, align: tall ? 'center' : 'right' })
    leader(ctx, a, at, edge(r, at), prog(ls, cs[5] + 600, 600), true)
  }
}

// ── 4 · THREE IDENTICAL ROWS — the shape repeats down the row; three strips match ────────────
const three: SceneFn = (ctx, a) => {
  const { ls, W, H, KF } = a
  const tall = isTall(a), cs = [0, 1, 2, 3, 4, 5, 6].map((i) => cue(a, i))
  const u = tall ? W * 0.07 : Math.min(W * 0.05, H * 0.088)
  const dr = drift(a)
  const SP = 1.5
  const o = camAt(a, 0.5 + dr * 1.2, 0.5, tall ? 0.5 : 0.5, tall ? 0.6 : 0.62, u)
  floorAt(ctx, a, o, 0, 0, 11, 0.08)
  const A = -3, B = 0, Cc = 3
  const pB = easeOut(prog(ls, cs[1], 700)), fB = (k: number) => prog(ls, cs[2] + k * 350, 420)
  const gB = easeInOut(prog(ls, cs[4], 1100))
  const pC = easeOut(prog(ls, cs[5], 700))
  const rowsP = prog(ls, cs[6], 900)
  for (let i = -6; i <= 6; i++) {
    const bx = i * SP, fog = clamp01(1.25 - Math.abs(i) / 6.5), sd = i * 13 + 5
    if (i === A) { footprint(ctx, a, o, bx, 0, 1, 1, 0.9, true); continue }
    if (i === B) {
      footprint(ctx, a, o, bx, 0, 1, 1, gB, true)
      booth(ctx, a, o, bx, 0, { al: 1 - gB, lit: 0.4 + 0.5 * pB, red: pB, occ: 'person', occAl: pB, plate: 0, folders: Math.round(fB(0)) + Math.round(fB(1)), z: gB * 0.4 })
      continue
    }
    if (i === Cc) { booth(ctx, a, o, bx, 0, { lit: 0.4 + 0.5 * pC, red: pC, occ: 'person', occAl: pC, plate: 0, folders: pC > 0.6 ? 2 : 0 }); continue }
    booth(ctx, a, o, bx, 0, { al: fog * 0.85, lit: 0.25 + 0.3 * rnd(sd), occ: rnd(sd) > 0.5 ? 'crates' : 'staff', plate: 1, seed: sd })
  }
  vignette(ctx, a, 0.75)
  // the first one, already gone, carries its strip from the start
  const strip = (i: number, al: number, seed: number) => {
    if (al <= 0.01) return
    const at = isoPt(o, i * SP + 0.5, 0.5, BH + 0.3)
    const w = (tall ? 72 : 108) * KF, h = (tall ? 30 : 40) * KF
    const x = Math.max(W * 0.03, Math.min(W * 0.97 - w, at[0] - w / 2)), y = at[1] - h - (tall ? 46 : 70) * KF + bob(a, seed)
    ctx.save(); ctx.globalAlpha *= al
    ctx.fillStyle = a.pal.bg; ctx.fillRect(x, y, w, h)
    ctx.fillStyle = red(a, 0.08); ctx.fillRect(x, y, w, h)
    ctx.strokeStyle = red(a, 0.85); ctx.lineWidth = Math.max(1, KF); ctx.strokeRect(x, y, w, h)
    shapeGlyph(ctx, x + w * 0.08, y + h * 0.78, w * 0.84, h * 0.55, 1, red(a, 0.95), Math.max(1.2, 1.6 * KF))
    ctx.restore()
    leader(ctx, a, at, [x + w / 2, y + h], al, true)
  }
  strip(A, Math.max(prog(ls, 200, 600) * 0.75, rowsP), 1)
  strip(B, rowsP, 2)
  strip(Cc, rowsP, 3)
  // the amount, "about"
  const pm = prog(ls, cs[3], 500)
  if (pm > 0 && rowsP < 1) {
    const at = isoPt(o, B * SP + 0.5, 0.5, BH + 0.1)
    const r = evCard(ctx, a, tall ? W * 0.5 : at[0] + 60 * KF, tall ? H * 0.64 : H * 0.6, [
      { s: `≈ ${fmt(370, a)} ${L(a, 'million', 'millones')}`, size: tall ? 22 : 30, font: 'serif', color: red(a, 0.97) },
      { s: L(a, 'TWO CONTRACTS · PESOS', 'DOS CONTRATOS · PESOS'), size: 10, color: ink(a, 0.82) },
    ], { al: pm * (1 - rowsP), accent: true, align: tall ? 'center' : 'left' })
    leader(ctx, a, at, edge(r, at), pm * (1 - rowsP), true)
  }
  // count of rows, top-left
  const n = 1 + (pB > 0.5 ? 1 : 0) + (pC > 0.5 ? 1 : 0)
  evCard(ctx, a, tall ? W * 0.5 : W * 0.95, H * 0.11, [
    { s: L(a, 'SAME SHAPE', 'MISMA FORMA'), size: 10.5, color: dim(a, 0.95) },
    { s: `× ${n}`, size: tall ? 26 : 36, font: 'serif', color: red(a, 0.97) },
  ], { al: prog(ls, cs[1], 600), align: tall ? 'center' : 'left', accent: true })
}

// ── 5 · READ THE BEHAVIOR — a sensor gantry sweeps the aisle; the readout ticks ──────────────
const behavior: SceneFn = (ctx, a) => {
  const { ls, W, H, KF } = a
  const tall = isTall(a), cs = [0, 1, 2, 3, 4].map((i) => cue(a, i))
  const u = tall ? W * 0.068 : Math.min(W * 0.048, H * 0.084)
  const SP = 1.5, RX = 1.5 // the red booth sits in the near row at x = RX
  const gx = lerp(-6, RX + 0.5, easeInOut(prog(ls, 0, cs[1]))) + 0.25 * Math.sin((ls - cs[1]) * 0.003) * prog(ls, cs[1], 600) * (1 - prog(ls, cs[4] + 400, 400)) + 5 * easeInOut(prog(ls, cs[4] + 600, 3200))
  const dr = drift(a)
  const o = camAt(a, 0.8 + dr * 1.5, -0.3, tall ? 0.52 : 0.52, tall ? 0.52 : 0.55, u)
  floorAt(ctx, a, o, 0, 0, 11, 0.08)
  const redac = (i: number) => easeOut(prog(ls, 400 + (i + 6) * 120, 500))
  const drop = prog(ls, cs[1], 650)
  const col = easeOut(prog(ls, cs[2], 700)), rng = easeOut(prog(ls, cs[2] + 600, 900))
  const NORM = 0.06
  const tk: { t10?: Pt; t50?: Pt } = {}
  const drawRow = (ry: number, near: boolean) => {
    for (let i = -6; i <= 6; i++) {
      const bx = i * SP, fog = clamp01(1.25 - Math.abs(bx - gx * 0.3) / 9), sd = i * 11 + (near ? 3 : 7)
      if (near && i === 1) {
        if (drop > 0) {
          // the column, out in the aisle: the sector norm × 10 solid, the band up to × 50 dashed
          const cx = bx + 0.33, cy = 0.45
          if (col > 0) solidBox(ctx, a, o, cx, cy, 0.34, 0.34, NORM * 10 * col, { accent: true, lit: 1.1 })
          if (rng > 0) {
            ctx.save(); ctx.setLineDash([3 * KF, 3 * KF])
            const z0 = NORM * 10, z1 = z0 + (NORM * 50 - z0) * rng
            for (const [px, py] of [[cx, cy + 0.34], [cx + 0.34, cy + 0.34], [cx + 0.34, cy]] as const) trace(ctx, [isoPt(o, px, py, z0), isoPt(o, px, py, z1)], 1, { color: red(a, 0.7), width: Math.max(1, KF) })
            poly(ctx, [isoPt(o, cx, cy, z1), isoPt(o, cx + 0.34, cy, z1), isoPt(o, cx + 0.34, cy + 0.34, z1), isoPt(o, cx, cy + 0.34, z1)], red(a, 0.15), red(a, 0.8), Math.max(1, KF))
            ctx.restore()
            tk.t10 = isoPt(o, cx + 0.34, cy, z0); tk.t50 = isoPt(o, cx + 0.34, cy, z1)
          }
          booth(ctx, a, o, bx, ry, { al: Math.min(1, drop * 2), lit: 0.9, red: drop, occ: 'person', plate: 0, z: (1 - easeBack(drop)) * 2.6 })
        }
        continue
      }
      booth(ctx, a, o, bx, ry, { al: fog, lit: 0.3 + 0.35 * rnd(sd), occ: rnd(sd) > 0.5 ? 'crates' : 'staff', plate: 1, seed: sd })
      // the sector norm beside each booth: a tiny stock
      if (near) solidBox(ctx, a, o, bx + 0.33, 0.45, 0.34, 0.34, NORM, { alpha: fog * col, lit: 0.8 })
      const rd = redac(i)
      if (rd > 0) { // names covered: the reading stops at the plate
        const pa = isoPt(o, bx + 0.2, ry + 0.985, 0.12), pb2 = isoPt(o, bx + 0.2 + 0.68 * rd, ry + 0.985, 0.12), pc = isoPt(o, bx + 0.2 + 0.68 * rd, ry + 0.985, 0.4), pd = isoPt(o, bx + 0.2, ry + 0.985, 0.4)
        poly(ctx, [pa, pb2, pc, pd], dim(a, 0.85 * fog))
      }
    }
  }
  drawRow(-2.3, false)
  // the gantry: two legs and a bridge across the aisle, a curtain of light under it
  const g0 = -2.6, g1 = 2.7
  solidBox(ctx, a, o, gx, g0, 0.18, 0.18, 2.3, { lit: 0.6 })
  const curtain: Pt[] = [isoPt(o, gx + 0.09, g0, 2.2), isoPt(o, gx + 0.09, g1, 2.2), isoPt(o, gx + 0.09, g1, 0), isoPt(o, gx + 0.09, g0, 0)]
  const cg = ctx.createLinearGradient(0, curtain[0][1], 0, curtain[2][1])
  cg.addColorStop(0, ink(a, 0.16)); cg.addColorStop(1, ink(a, 0.02))
  poly(ctx, curtain, cg)
  trace(ctx, [isoPt(o, gx + 0.09, g0, 0.01), isoPt(o, gx + 0.09, g1, 0.01)], 1, { color: ink(a, 0.6), width: Math.max(1, 1.4 * KF) })
  drawRow(1.3, true)
  solidBox(ctx, a, o, gx, g1, 0.18, 0.18, 2.3, { lit: 0.6 })
  solidBox(ctx, a, o, gx, g0, 0.18, g1 - g0 + 0.18, 0.22, { z: 2.3, lit: 0.8 })
  isoBox(ctx, a, o, gx + 0.02, -0.25, 0.14, 0.5, 0.06, { z: 2.22, lit: 1.4 })
  vignette(ctx, a, 0.72)
  if (tk.t10 && tk.t50) {
    mono(ctx, a, '× 10', tk.t10[0] + 8 * KF, tk.t10[1] + 4 * KF, 11, red(a, 0.95), { alpha: rng })
    mono(ctx, a, '× 50', tk.t50[0] + 8 * KF, tk.t50[1] + 4 * KF, 11, red(a, 0.95), { alpha: rng })
  }
  // the readout: names off, behaviour on
  const lines = [
    { s: L(a, 'SUDDEN APPEARANCE', 'APARICIÓN REPENTINA'), p: prog(ls, cs[1], 400) },
    { s: L(a, '10–50× THE SECTOR NORM', '10–50× LO NORMAL DEL SECTOR'), p: prog(ls, cs[2], 400) },
    { s: L(a, 'NO PAST', 'SIN PASADO'), p: prog(ls, cs[3], 400) },
    { s: L(a, 'NO FUTURE', 'SIN FUTURO'), p: prog(ls, cs[4], 400) },
  ]
  const sz = tall ? 10 : 11.5, rh = sz * 2 * KF, pad = 14 * KF
  const cw = Math.max(...lines.map((l) => measure(ctx, l.s, sz * KF, 'mono'))) + pad * 2 + 22 * KF
  const ch = pad * 2 + rh * (lines.length + 1.4)
  const cx = tall ? (W - cw) / 2 : W * 0.04, cy = H * (tall ? 0.1 : 0.12) + bob(a, 2)
  const cal = prog(ls, 200, 600)
  ctx.save(); ctx.globalAlpha *= cal
  ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(cx + 5 * KF, cy + 7 * KF, cw, ch)
  ctx.fillStyle = a.pal.bg; ctx.fillRect(cx, cy, cw, ch); ctx.fillStyle = ink(a, 0.05); ctx.fillRect(cx, cy, cw, ch)
  ctx.strokeStyle = ink(a, 0.45); ctx.lineWidth = Math.max(1, 1.1 * KF); ctx.strokeRect(cx, cy, cw, ch)
  const ny = cy + pad + rh * 0.6
  mono(ctx, a, L(a, 'NAME', 'NOMBRE'), cx + pad, ny, sz, ink(a, 0.6))
  const strike = prog(ls, 600, 700), nw = measure(ctx, L(a, 'NAME', 'NOMBRE'), sz * KF, 'mono')
  if (strike > 0) { ctx.strokeStyle = ink(a, 0.8); ctx.beginPath(); ctx.moveTo(cx + pad - 3 * KF, ny - sz * KF * 0.35); ctx.lineTo(cx + pad - 3 * KF + (nw + 6 * KF) * strike, ny - sz * KF * 0.35); ctx.stroke() }
  mono(ctx, a, L(a, 'NOT READ', 'NO SE LEE'), cx + cw - pad, ny, sz * 0.85, dim(a, 0.9), { align: 'right', alpha: strike })
  ctx.strokeStyle = ink(a, 0.15); ctx.beginPath(); ctx.moveTo(cx + pad, ny + rh * 0.45); ctx.lineTo(cx + cw - pad, ny + rh * 0.45); ctx.stroke()
  lines.forEach((l, i) => {
    const y = ny + rh * (i + 1.4)
    ctx.strokeStyle = ink(a, 0.4); ctx.lineWidth = 1; ctx.strokeRect(cx + pad, y - sz * KF * 0.8, sz * KF * 0.85, sz * KF * 0.85)
    if (l.p > 0) { ctx.fillStyle = red(a, 0.95 * l.p); ctx.fillRect(cx + pad + 2, y - sz * KF * 0.8 + 2, sz * KF * 0.85 - 4, sz * KF * 0.85 - 4) }
    mono(ctx, a, l.s, cx + pad + 20 * KF, y, sz, l.p > 0 ? ink(a, 0.95) : dim(a, 0.45))
  })
  ctx.restore()
}

// ── 6 · 5,869 — a hall of exactly 5,869 booths, seen from the door; every one lights ─────────
const COLS = 118, ROWS = 50, NV = 5869
interface Field { horizon: number; near: number; half: number; pan: number }
/** One cell per vendor on a perspective floor; `on(i, row, col)` returns 0..1 how lit cell i is. */
function field(ctx: C, a: SceneArgs, f: Field, on: (i: number, r: number, c: number) => number, alpha = 1) {
  const z0 = 1, z1 = 4.6, k = (f.near - f.horizon) * z0
  ctx.save(); ctx.globalAlpha *= alpha
  for (let pass = 0; pass < 2; pass++) {
    ctx.beginPath()
    for (let r = 0; r < ROWS; r++) {
      const z = lerp(z0, z1, r / ROWS), zn = lerp(z0, z1, (r + 1) / ROWS)
      const y = f.horizon + k / z, yn = f.horizon + k / zn, ch = (y - yn) * 0.55
      const cw = ((f.half * 2) / COLS) / z
      for (let c = 0; c < COLS; c++) {
        const i = r * COLS + c
        if (i >= NV) break
        const lit = on(i, r, c) > 0.5
        if ((pass === 1) !== lit) continue
        const x = a.W * 0.5 + f.pan / z + ((c - COLS / 2 + 0.5) * f.half * 2) / COLS / z
        ctx.rect(x - cw * 0.32, y - ch, cw * 0.64, ch)
      }
    }
    ctx.fillStyle = pass ? ink(a, 0.78) : ink(a, 0.16)
    ctx.fill()
  }
  ctx.restore()
}

const crowd: SceneFn = (ctx, a) => {
  const { ls, W, H, KF } = a
  const tall = isTall(a), c1 = cue(a, 1)
  const t0 = 1000, LEN = 600 // the count and the lights land together with the figure
  const dr = drift(a)
  const f: Field = { horizon: H * (tall ? 0.3 : 0.22), near: H * 0.74, half: W * (tall ? 0.75 : 0.62), pan: dr * W * 0.06 }
  // a warm wash rises over the far hall when it lights
  const lp = prog(ls, t0, LEN + 400)
  glow(ctx, W * 0.5, f.horizon + (f.near - f.horizon) * 0.3, W * 0.55, ink(a, 0.12 * lp), ink(a, 0))
  const ripple = prog(ls, c1, 2600)
  field(ctx, a, f, (i, r, c) => {
    const d = Math.hypot((c - COLS / 2) / COLS, (r - ROWS * 0.45) / ROWS) / 0.75 + rnd(i) * 0.12
    return ls > t0 + d * LEN ? 1 : 0
  })
  // after the sum is spoken, a wave of light runs from the door to the back wall
  if (ripple > 0 && ripple < 1) {
    const y = lerp(f.near, f.horizon, easeInOut(ripple))
    const g = ctx.createLinearGradient(0, y - H * 0.05, 0, y + H * 0.05)
    g.addColorStop(0, ink(a, 0)); g.addColorStop(0.5, ink(a, 0.2 * Math.sin(Math.PI * ripple))); g.addColorStop(1, ink(a, 0))
    ctx.fillStyle = g; ctx.fillRect(0, y - H * 0.05, W, H * 0.1)
  }
  // the back wall and ceiling lamps for scale
  ctx.fillStyle = ink(a, 0.25); ctx.fillRect(0, f.horizon - 1, W, 1)
  vignette(ctx, a, 0.55)
  // the figures
  const pn = prog(ls, t0, LEN)
  const big = (tall ? 48 : 78) * KF
  if (pn > 0) {
    const s = fmt(NV, a)
    const x = tall ? W * 0.5 : W * 0.06, y = H * (tall ? 0.19 : 0.2)
    ctx.save(); ctx.fillStyle = 'rgba(0,0,0,0.55)'
    const tw = measure(ctx, fmt(NV, a), big, 'serif')
    ctx.fillRect(tall ? x - tw / 2 - 14 * KF : x - 14 * KF, y - big * 0.95, tw + 28 * KF, big * 1.45); ctx.restore()
    text(ctx, s, x, y, { size: big, color: ink(a, 0.97), align: tall ? 'center' : 'left', alpha: pn })
    mono(ctx, a, L(a, 'VENDORS FIT THE PATTERN', 'PROVEEDORES ENCAJAN EN EL PATRÓN'), x, y + 18 * KF, 10.5, ink(a, 0.85), { align: tall ? 'center' : 'left' })
  }
  const pm = prog(ls, c1 + (a.dur - c1) * 0.28, 500)
  if (pm > 0) {
    evCard(ctx, a, tall ? W * 0.5 : W * 0.95, tall ? H * 0.27 : H * 0.12 + bob(a, 2), [
      { s: L(a, 'TOGETHER', 'JUNTOS'), size: 10.5, color: dim(a, 0.95) },
      { s: a.lang === 'es' ? `${fmt(33700, a)} millones` : `${fmt(33.7, a, 1)} billion`, size: tall ? 24 : 34, font: 'serif', color: ink(a, 0.97) },
      { s: L(a, 'PESOS IN CONTRACTS', 'PESOS EN CONTRATOS'), size: 10, color: ink(a, 0.8) },
    ], { al: pm, align: tall ? 'center' : 'right' })
  }
}

// ── 7 · THE OFFICIAL LIST — a slow registry office checks the folders one by one ─────────────
const list: SceneFn = (ctx, a) => {
  const { ls, W, H, KF } = a
  const tall = isTall(a), cs = [0, 1, 2, 3].map((i) => cue(a, i))
  const u = tall ? W * 0.085 : Math.min(W * 0.062, H * 0.105)
  const dr = drift(a)
  const o = camAt(a, 0.2 + dr * 0.8, -0.4, tall ? 0.5 : 0.46, tall ? 0.5 : 0.56, u, 0.5)
  floorAt(ctx, a, o, 0, 0, 11, 0.08)
  pool(ctx, a, o, 0, 0.3, 3.4, 0.2)
  // the shelf: the list, built over a decade
  const SH = { x: -3.2, y: -2.6, w: 6.4, d: 0.5, h: 1.9 }
  solidBox(ctx, a, o, SH.x, SH.y, SH.w, SH.d, SH.h, { lit: 0.35 })
  const fill = easeInOut(prog(ls, cs[1], Math.max(1800, cs[2] - cs[1])))
  for (let s = 0; s < 3; s++) {
    const z = 0.15 + s * 0.6
    isoBox(ctx, a, o, SH.x, SH.y + SH.d, SH.w, 0.06, 0.04, { z, lit: 0.6 })
    const nb = 40
    for (let b = 0; b < nb; b++) {
      const idx = s * nb + b
      if (idx / (3 * nb) > fill) break
      isoBox(ctx, a, o, SH.x + 0.1 + b * 0.155, SH.y + SH.d - 0.02, 0.11, 0.1, 0.36 + 0.1 * rnd(idx), { z: z + 0.04, lit: 0.55 + 0.3 * rnd(idx * 3) })
    }
  }
  // decade ticks along the shelf top
  for (let yI = 0; yI < 10; yI++) {
    const on = fill * 10 > yI ? 1 : 0
    isoBox(ctx, a, o, SH.x + 0.2 + yI * 0.62, SH.y + 0.1, 0.4, 0.3, 0.06, { z: SH.h, lit: 0.4 + 0.8 * on })
  }
  // the clerk and the desk
  mini(ctx, a, o, 0.2, -0.9, { h: 0.95 })
  solidBox(ctx, a, o, -1.6, -0.5, 3.2, 0.8, 0.78, { lit: 0.6 })
  // the conveyor, slow; every folder is checked under the stamp
  const SPD = 0.0011, GAP = 0.5, X0 = -4.2, X1 = 4.5, CYb = 0.9
  solidBox(ctx, a, o, X0, CYb, X1 - X0, 0.7, 0.32, { lit: 0.45 })
  const kMatch = Math.max(2, Math.floor(((cs[2] + 2200) * SPD - (0 - X0)) / GAP + 0.5))
  const base = ls * SPD
  const kHi = Math.floor((base - 0) / GAP) + 2
  for (let k = Math.max(0, kHi - 34); k <= kHi; k++) {
    const x = X0 + base - k * GAP
    if (x < X0 || x > X1) continue
    const match = k === kMatch
    const fog = clamp01(1.3 - Math.abs(x) / 7)
    let z = 0.32, yy = CYb + 0.15, al = fog
    if (match && x > 0.3) { // lifted off the belt and carried to the shelf
      const t = clamp01((x - 0.3) / 2.2)
      yy = lerp(CYb + 0.15, SH.y + SH.d + 0.2, easeInOut(t)); z = 0.32 + Math.sin(Math.PI * t) * 1.6 + t * 0.8; al = 1
    }
    isoBox(ctx, a, o, match && x > 0.3 ? 0.3 + (x - 0.3) * 0.25 : x, yy, 0.36, 0.42, 0.07, { z, alpha: al, accent: match && x > -0.05, lit: 1 })
  }
  // the stamp arm over the belt at x = 0
  const ph = ((base % GAP) / GAP), down = Math.max(0, Math.cos(ph * TAU)) ** 6
  solidBox(ctx, a, o, -0.1, CYb + 0.15, 0.2, 0.42, 0.1, { z: 0.42 + 0.6 * (1 - down), lit: 0.8, accent: Math.abs(X0 + base - kMatch * GAP) < 0.3 })
  isoBox(ctx, a, o, -0.03, CYb + 0.33, 0.06, 0.06, 0.9, { z: 0.52 + 0.6 * (1 - down), lit: 0.6 })
  // the heap of folders waiting at the left end
  for (let s = 0; s < 14; s++) isoBox(ctx, a, o, X0 - 1.1, CYb + 0.05, 0.6, 0.6, 0.07, { z: s * 0.075, lit: 0.55 + 0.04 * (s % 3) })
  vignette(ctx, a, 0.72)
  // cards
  const p0 = prog(ls, 300, 600)
  const rL = evCard(ctx, a, tall ? W * 0.5 : W * 0.05, H * 0.11 + bob(a, 1), [
    { s: L(a, 'THE OFFICIAL LIST', 'LA LISTA OFICIAL'), size: 10.5, color: dim(a, 0.95) },
    { s: fill > 0 ? L(a, 'A decade to build', 'Una década en construirse') : L(a, 'Tax authority', 'El SAT'), size: tall ? 20 : 26, font: 'serif', color: ink(a, 0.96) },
  ], { al: p0, align: tall ? 'center' : 'left' })
  const sh = isoPt(o, SH.x + 0.6, SH.y + 0.3, SH.h + 0.1)
  if (!tall) leader(ctx, a, sh, edge(rL, sh), p0)
  const heap = isoPt(o, X0 - 0.8, CYb + 0.35, 1.1)
  const pH = prog(ls, cs[2], 500)
  if (pH > 0) {
    const r = evCard(ctx, a, tall ? W * 0.05 : heap[0] - 20 * KF, tall ? H * 0.6 : H * 0.62, [
      { s: L(a, 'OUR', 'NUESTROS'), size: 10, color: dim(a, 0.95) },
      { s: fmt(NV, a), size: tall ? 20 : 26, font: 'serif', color: ink(a, 0.96) },
    ], { al: pH })
    leader(ctx, a, heap, edge(r, heap), pH)
  }
  const tList = cs[2] + (cs[3] - cs[2]) * 0.62
  const pList = prog(ls, tList, 550)
  const pRatio = prog(ls, cs[3], 600)
  if (pList > 0) {
    const big = (tall ? 40 : 60) * KF
    const x = tall ? W * 0.5 : W * 0.95
    const y = H * (tall ? 0.24 : 0.36) + bob(a, 3)
    const r = evCard(ctx, a, x, y, [
      { s: L(a, 'CONFIRMED BY THE LIST', 'CONFIRMADOS POR LA LISTA'), size: 10.5, color: dim(a, 0.95) },
      { s: '0000', size: big / KF, font: 'serif', color: 'rgba(0,0,0,0)' },
      { s: pRatio > 0 ? L(a, 'ONE IN 35', 'UNO DE CADA 35') : ' ', size: 11, color: red(a, 0.95) },
    ], { al: pList, accent: true, align: tall ? 'center' : 'right' })
    text(ctx, fmt(169, a), r.x + 12 * KF, r.y + 12 * KF * 0.8 + 10.5 * KF * 1.55 + big * 0.96, { size: big, color: red(a, 0.97), alpha: pList })
    // one in 35: a strip of 35 folders, one red
    if (pRatio > 0) {
      const n = 35, sw = Math.min(r.w - 24 * KF, W * 0.4), cw = sw / n
      const sx = r.x + r.w - 12 * KF - sw, sy = r.y + r.h + 12 * KF
      for (let i = 0; i < n; i++) {
        const pi = prog(ls, cs[3] + i * 12, 250)
        if (pi <= 0) continue
        ctx.fillStyle = i === 17 ? red(a, 0.95 * pi) : ink(a, 0.45 * pi)
        ctx.fillRect(sx + i * cw + cw * 0.15, sy, cw * 0.7, 26 * KF)
      }
    }
  }
}

// ── 8 · ALWAYS LATE — an hourglass beside the booth; the list's stamp lands on nothing ───────
function hourglass(ctx: C, a: SceneArgs, cx: number, top: number, h: number, t: number, marks: { f: number; label: string; p: number }[]) {
  const w = h * 0.42, mid = top + h / 2, KF = a.KF
  // frame: two plates and three posts
  ctx.fillStyle = ink(a, 0.55); ctx.fillRect(cx - w * 0.7, top - h * 0.05, w * 1.4, h * 0.05); ctx.fillRect(cx - w * 0.7, top + h, w * 1.4, h * 0.05)
  ctx.fillStyle = ink(a, 0.3); for (const dx of [-0.62, 0.62]) ctx.fillRect(cx + dx * w - 2 * KF, top, 4 * KF, h)
  const bulb = (dir: number) => {
    ctx.beginPath(); ctx.moveTo(cx - w / 2, mid - dir * h * 0.5)
    ctx.bezierCurveTo(cx - w / 2, mid - dir * h * 0.18, cx - w * 0.06, mid - dir * h * 0.08, cx - w * 0.04, mid)
    ctx.lineTo(cx + w * 0.04, mid)
    ctx.bezierCurveTo(cx + w * 0.06, mid - dir * h * 0.08, cx + w / 2, mid - dir * h * 0.18, cx + w / 2, mid - dir * h * 0.5)
    ctx.closePath()
  }
  // sand: the top drains, the bottom fills
  ctx.save(); bulb(1); ctx.clip()
  const st = mid - h * 0.5 * (1 - t) * 0.85
  ctx.fillStyle = ink(a, 0.55); ctx.fillRect(cx - w, st + h * 0.5 * t * 0, w * 2, mid - st)
  ctx.restore()
  ctx.save(); bulb(-1); ctx.clip()
  const sb = top + h - h * 0.46 * t
  ctx.fillStyle = ink(a, 0.55); ctx.beginPath(); ctx.moveTo(cx - w, top + h); ctx.lineTo(cx - w, sb + h * 0.06); ctx.quadraticCurveTo(cx, sb - h * 0.06, cx + w, sb + h * 0.06); ctx.lineTo(cx + w, top + h); ctx.fill()
  ctx.restore()
  if (t < 0.999) { ctx.fillStyle = ink(a, 0.6); ctx.fillRect(cx - 0.8 * KF, mid, 1.6 * KF, sb - mid) }
  ctx.lineWidth = Math.max(1, 1.3 * KF); ctx.strokeStyle = ink(a, 0.75); bulb(1); ctx.stroke(); bulb(-1); ctx.stroke()
  // the scale on the lower bulb
  for (const m of marks) {
    if (m.p <= 0) continue
    const y = top + h - h * 0.46 * m.f
    ctx.strokeStyle = ink(a, 0.8 * m.p); ctx.beginPath(); ctx.moveTo(cx + w * 0.62, y); ctx.lineTo(cx + w * 0.62 + 14 * KF, y); ctx.stroke()
    ctx.setLineDash([2 * KF, 3 * KF]); ctx.beginPath(); ctx.moveTo(cx - w * 0.5, y); ctx.lineTo(cx + w * 0.62, y); ctx.stroke(); ctx.setLineDash([])
    mono(ctx, a, m.label, cx + w * 0.62 + 18 * KF, y + 4 * KF, 11, ink(a, 0.92), { alpha: m.p })
  }
}

const late: SceneFn = (ctx, a) => {
  const { ls, W, H, KF } = a
  const tall = isTall(a), cs = [0, 1, 2, 3].map((i) => cue(a, i))
  const u = tall ? W * 0.095 : Math.min(W * 0.085, H * 0.15)
  const dr = drift(a)
  const o = camAt(a, 0.5 + dr * 0.5, 0.5, tall ? 0.8 : 0.66, tall ? 0.64 : 0.58, u, 0.4)
  floorAt(ctx, a, o, 0.5, 0.5, 7, 0.08)
  // the sand runs the whole shot; marks for 6 months and 3 years (1 : 6) on the lower bulb
  const t = clamp01(ls / a.dur) * 0.16 // a fraction of three years passes on screen — the stamp is far
  const hg = { cx: tall ? W * 0.24 : W * 0.26, top: H * (tall ? 0.14 : 0.16), h: H * (tall ? 0.32 : 0.52) }
  pool(ctx, a, o, -2.6, 1.2, 2.2, 0.1)
  hourglass(ctx, a, hg.cx, hg.top, hg.h, t, [
    { f: 1 / 6, label: L(a, '6 MONTHS · AT BEST', '6 MESES · MEJOR CASO'), p: prog(ls, cs[1], 500) },
    { f: 1, label: L(a, '3 YEARS · AT WORST', '3 AÑOS · PEOR CASO'), p: prog(ls, cs[2], 500) },
  ])
  // the booth collects and dissolves on the last sentence
  const c3 = cs[3]
  const coins = prog(ls, c3, 1400), dis = easeInOut(prog(ls, c3 + 1400, 1500))
  booth(ctx, a, o, 0, 0, { al: 1 - dis, lit: 0.8, red: 1, occ: 'person', plate: 0, z: dis * 0.3 })
  footprint(ctx, a, o, 0, 0, 1, 1, dis, true)
  if (coins > 0 && coins < 1) {
    for (let k = 0; k < 7; k++) {
      const tk = clamp01(coins * 1.6 - k * 0.09)
      if (tk <= 0 || tk >= 1) continue
      const p = isoPt(o, 0.5 + 1.8 * (1 - tk), 0.85 - 1.5 * (1 - tk), 0.6 + Math.sin(Math.PI * tk) * 1.2)
      ctx.fillStyle = red(a, 0.95); ctx.beginPath(); ctx.ellipse(p[0], p[1], 4 * KF, 2.4 * KF, 0, 0, TAU); ctx.fill()
    }
  }
  // the dust where it stood
  if (dis > 0 && dis < 1) for (let k = 0; k < 18; k++) {
    const p = isoPt(o, 0.15 + rnd(k) * 0.8, 0.1 + rnd(k + 9) * 0.9, 0.2 + dis * (0.6 + rnd(k + 3) * 1.4))
    ctx.fillStyle = red(a, 0.6 * (1 - dis)); ctx.fillRect(p[0], p[1], 2 * KF, 2 * KF)
  }
  // the list's stamp, still hanging, far from landing
  const sz = isoPt(o, 0.5, 0.5, 0)
  const hang = (tall ? 2.0 : 3.2) - 0.25 * clamp01(ls / a.dur)
  solidBox(ctx, a, o, 0.22, 0.22, 0.56, 0.56, 0.14, { z: hang, lit: 0.85 })
  isoBox(ctx, a, o, 0.44, 0.44, 0.12, 0.12, 0.5, { z: hang + 0.14, lit: 0.7 })
  ctx.save(); ctx.setLineDash([2 * KF, 4 * KF]); trace(ctx, [isoPt(o, 0.5, 0.5, hang), sz], 1, { color: ink(a, 0.22), width: 1 }); ctx.restore()
  vignette(ctx, a, 0.72)
  const p0 = prog(ls, 300, 600)
  const sp = isoPt(o, 0.78, 0.5, hang + 0.3)
  const r = evCard(ctx, a, tall ? W * 0.95 : sp[0] + 40 * KF, tall ? H * 0.1 : H * 0.12 + bob(a, 2), [
    { s: L(a, 'THE LIST', 'LA LISTA'), size: 10.5, color: dim(a, 0.95) },
    { s: L(a, 'Not yet', 'Todavía no'), size: tall ? 20 : 26, font: 'serif', color: ink(a, 0.95) },
  ], { al: p0, align: tall ? 'right' : 'left' })
  leader(ctx, a, sp, edge(r, sp), p0)
  if (dis > 0.3) {
    const at = isoPt(o, 0.5, 0.95, 0)
    mono(ctx, a, L(a, 'PAID · DISSOLVED', 'COBRÓ · SE DISOLVIÓ'), tall ? at[0] - u * 0.9 : at[0], tall ? at[1] - u * 0.3 : at[1] + 26 * KF, 11, red(a, 0.95), { align: tall ? 'right' : 'center', alpha: prog(ls, c3 + 1900, 600) })
  }
}

// ── 9 · NOT ALL ARE GHOSTS — 5,992 still contracting; some booths are real workshops ─────────
const WORKSHOPS = [2, 7, 11]
function workshop(ctx: C, a: SceneArgs, o: Iso, x: number, y: number, p: number) {
  if (p <= 0.01) return
  // a lathe-like machine with a turning wheel, a worker, and a little exhaust
  solidBox(ctx, a, o, x + 0.15, y + 0.15, 0.55, 0.3, 0.3, { alpha: p, lit: 0.75, z: 0.05 })
  const c = isoPt(o, x + 0.42, y + 0.45, 0.24), r = o.u * 0.12, th = a.ls * 0.006
  ctx.save(); ctx.globalAlpha *= p
  ctx.strokeStyle = ink(a, 0.85); ctx.lineWidth = Math.max(1, a.KF)
  ctx.beginPath(); ctx.ellipse(c[0], c[1], r * 0.62, r, 0.5, 0, TAU); ctx.stroke()
  for (let s = 0; s < 3; s++) { const an = th + (s * TAU) / 3; ctx.beginPath(); ctx.moveTo(c[0], c[1]); ctx.lineTo(c[0] + Math.cos(an) * r * 0.6, c[1] + Math.sin(an) * r); ctx.stroke() }
  for (let k = 0; k < 4; k++) {
    const tk = ((a.ls * 0.0005 + k / 4) % 1)
    const q = isoPt(o, x + 0.2, y + 0.2, 0.4 + tk * 1.3)
    ctx.fillStyle = ink(a, 0.22 * (1 - tk)); ctx.beginPath(); ctx.arc(q[0], q[1], (3 + tk * 6) * a.KF, 0, TAU); ctx.fill()
  }
  ctx.restore()
  mini(ctx, a, o, x + 0.75, y + 0.55, { al: p, h: 0.7, z: 0.05 })
}

const rest: SceneFn = (ctx, a) => {
  const { ls, W, H, KF } = a
  const tall = isTall(a), cs = [0, 1, 2, 3].map((i) => cue(a, i))
  const crane = easeInOut(clamp01(ls / a.dur))
  const u = (tall ? W * 0.072 : Math.min(W * 0.05, H * 0.088)) * (1 + 0.08 * crane)
  const o = camAt(a, 5.5 + crane * 1.2, 0, tall ? 0.5 : 0.5, tall ? 0.5 : 0.5, u)
  floorAt(ctx, a, o, 6, 0, 12, 0.08)
  const warm = prog(ls, cs[1], 1200), ws = easeOut(prog(ls, cs[2], 900))
  const SP = 1.55
  for (const [ry, row] of [[-2.25, 0], [1.25, 1]] as const) {
    for (let i = 0; i < 9; i++) {
      const bx = i * SP, idx = row * 9 + i, sd = idx * 17 + 3
      const isW = WORKSHOPS.includes(idx)
      booth(ctx, a, o, bx, ry, { lit: 0.45 + 0.3 * rnd(sd) + 0.2 * warm, occ: isW && ws > 0.5 ? 'none' : rnd(sd) > 0.5 ? 'crates' : 'staff', occAl: isW ? 1 - ws : 1, plate: 1, seed: sd })
      if (isW) workshop(ctx, a, o, bx, ry, ws)
      // contracts still arriving: a folder glides in from the aisle
      const tf = (ls * 0.00035 + rnd(sd)) % 1
      const from = isoPt(o, bx + 0.5, ry < 0 ? -0.2 : 0.2, 0.05), to = isoPt(o, bx + 0.5, ry + 0.85, 0.55)
      const fx = lerp(from[0], to[0], tf), fy = lerp(from[1], to[1], tf) - Math.sin(Math.PI * tf) * u * 0.5
      ctx.fillStyle = ink(a, 0.8 * Math.sin(Math.PI * tf)); ctx.fillRect(fx - 4 * KF, fy - 3 * KF, 8 * KF, 5 * KF)
    }
  }
  vignette(ctx, a, 0.72)
  const p0 = prog(ls, 700, 550)
  evCard(ctx, a, tall ? W * 0.5 : W * 0.05, H * 0.11 + bob(a, 1), [
    { s: L(a, 'THE OTHER', 'LOS OTROS'), size: 10.5, color: dim(a, 0.95) },
    { s: fmt(5700, a), size: tall ? 30 : 44, font: 'serif', color: ink(a, 0.97) },
    { s: L(a, 'STILL CONTRACTING', 'SIGUEN CONTRATANDO'), size: 10.5, color: ink(a, 0.82) },
  ], { al: p0, align: tall ? 'center' : 'left' })
  if (ws > 0) {
    const at = isoPt(o, (WORKSHOPS[1] % 9) * SP + 0.45, 1.25 + 0.4, 0.9)
    const r = evCard(ctx, a, tall ? W * 0.5 : at[0] + 30 * KF, tall ? H * 0.62 : H * 0.63, [
      { s: L(a, 'REAL, SPECIALIZED', 'REAL, ESPECIALIZADO'), size: 10.5, color: ink(a, 0.9) },
      { s: L(a, 'some will be suppliers', 'algunos serán proveedores'), size: tall ? 15 : 19, font: 'serif', color: ink(a, 0.95) },
    ], { al: ws, align: tall ? 'center' : 'left' })
    leader(ctx, a, at, edge(r, at), ws)
  }
  const p3 = prog(ls, cs[3], 700)
  if (p3 > 0) {
    const sz = (tall ? 24 : 34) * KF
    const s1 = L(a, 'Conduct', 'Una conducta'), s2 = L(a, ', not guilt.', ', no una culpa.')
    const w1 = measure(ctx, s1, sz, 'serif'), w2 = measure(ctx, s2, sz, 'serif')
    const x = tall ? (W - w1 - w2) / 2 : W * 0.95 - w1 - w2, y = H * (tall ? 0.38 : 0.17)
    ctx.fillStyle = `rgba(0,0,0,${0.6 * p3})`; ctx.fillRect(x - 14 * KF, y - sz * 1.05, w1 + w2 + 28 * KF, sz * 1.5)
    text(ctx, s1, x, y, { size: sz, color: red(a, 0.97), alpha: p3 })
    text(ctx, s2, x + w1, y, { size: sz, color: ink(a, 0.95), alpha: p3 })
  }
}

// ── 10 · TWO SIGNATURES — a desk outside creates the firm, a desk inside approves it ─────────
const two: SceneFn = (ctx, a) => {
  const { ls, W, H, KF } = a
  const tall = isTall(a), cs = [0, 1, 2, 3, 4].map((i) => cue(a, i))
  const u = tall ? W * 0.085 : Math.min(W * 0.064, H * 0.11)
  const dr = drift(a)
  const o = camAt(a, 0.2 + dr * 0.8, 0.3, tall ? 0.5 : 0.5, tall ? 0.5 : 0.6, u, 0.4)
  floorAt(ctx, a, o, 0, 0, 11, 0.07)
  const named = easeOut(prog(ls, cs[3], 700)), dark = easeOut(prog(ls, cs[4], 900))
  const s1 = prog(ls, cs[1], 1600), s2 = prog(ls, cs[2], 1600)
  // inside the government: a pale floor and columns, behind a low wall
  poly(ctx, [isoPt(o, 0.4, -3.5), isoPt(o, 5.6, -3.5), isoPt(o, 5.6, 2.2), isoPt(o, 0.4, 2.2)], ink(a, 0.03))
  for (let k = 0; k < 5; k++) solidBox(ctx, a, o, 1 + k * 1.1, -3.3, 0.2, 0.2, 2.4, { lit: 0.4 })
  solidBox(ctx, a, o, 0.7, -3.4, 4.8, 0.4, 0.18, { z: 2.4, lit: 0.5 })
  // the lamps: outside lit and named; inside dimming
  pool(ctx, a, o, -2.6, -0.2, 2.4, 0.14 + 0.18 * named)
  pool(ctx, a, o, 2.8, -0.2, 2.4, 0.2 * (1 - dark) + 0.03)
  // the low wall between them
  solidBox(ctx, a, o, 0, -3.4, 0.25, 5.6, 0.6, { lit: 0.5 })
  // desk 1, outside
  solidBox(ctx, a, o, -3.4, -0.9, 1.6, 0.7, 0.72, { lit: 0.7 + 0.3 * named })
  mini(ctx, a, o, -2.6, -1.35, { h: 0.95 })
  // desk 2, inside: the second signer
  mini(ctx, a, o, 2.9, -1.35, { h: 0.95, dark: dark > 0.5, accent: dark > 0.5 })
  solidBox(ctx, a, o, 2.1, -0.9, 1.6, 0.7, 0.72, { lit: 0.7 - 0.4 * dark })
  if (dark > 0) isoBox(ctx, a, o, 2.1, -0.9, 1.6, 0.7, 0.72, { alpha: dark * 0.8, accent: true, lit: 0.6 })
  // the firm: born from sheet 1, then sheet 2 carries its contract inside
  const born = easeOut(prog(ls, cs[1] + 1300, 700))
  booth(ctx, a, o, -0.9, 1.6, { al: born, lit: 0.6, occ: 'none', plate: 0, z: (1 - easeBack(born)) * 0.6 })
  const sheet = (from: Pt, to: Pt, p: number) => {
    if (p <= 0 || p >= 1) return
    const e = easeInOut(p), q = [lerp(from[0], to[0], e), lerp(from[1], to[1], e) - Math.sin(Math.PI * e) * u * 1.6] as Pt
    ctx.fillStyle = ink(a, 0.92); ctx.save(); ctx.translate(q[0], q[1]); ctx.rotate(Math.sin(p * 9) * 0.3); ctx.fillRect(-6 * KF, -8 * KF, 12 * KF, 16 * KF); ctx.restore()
  }
  sheet(isoPt(o, -2.6, -0.5, 0.75), isoPt(o, -0.4, 2.1, 0.5), clamp01(s1 * 1.2 - 0.2))
  sheet(isoPt(o, -0.4, 2.1, 0.5), isoPt(o, 2.9, -0.5, 0.75), clamp01(s2 * 1.2 - 0.2))
  // signatures on the desks: a scribble drawn on each when it signs
  const sig = (cx: number, p: number, col: string) => {
    if (p <= 0) return
    const pts: Pt[] = []
    for (let i = 0; i <= 10; i++) pts.push(isoPt(o, cx - 0.35 + i * 0.07, -0.55 + Math.sin(i * 1.7) * 0.05, 0.73))
    trace(ctx, pts, p, { color: col, width: Math.max(1, 1.3 * KF) })
  }
  sig(-2.6, prog(ls, cs[1] + 200, 900), ink(a, 0.95))
  sig(2.9, prog(ls, cs[2] + 1300, 900), dark > 0.5 ? red(a, 0.6) : ink(a, 0.95))
  vignette(ctx, a, 0.72)
  // labels over the two halves
  const lp = prog(ls, 300, 600)
  const lo = isoPt(o, -2.6, -2.6, 0), li = isoPt(o, 3.2, -3.2, 2.7)
  mono(ctx, a, L(a, 'OUTSIDE', 'AFUERA'), lo[0], lo[1], 10.5, dim(a, 0.9), { align: 'center', alpha: lp })
  mono(ctx, a, L(a, 'INSIDE GOVERNMENT', 'DENTRO DEL GOBIERNO'), Math.min(li[0], W * 0.975 - measure(ctx, L(a, 'INSIDE GOVERNMENT', 'DENTRO DEL GOBIERNO'), 10.5 * KF, 'mono') / 2), li[1] - 8 * KF, 10.5, dim(a, 0.9), { align: 'center', alpha: lp })
  // the record: names the first, not the second
  const rp = prog(ls, cs[3], 600)
  if (rp > 0) {
    const sz = tall ? 10 : 11, rh = sz * 2.3 * KF, pad = 14 * KF
    const l1 = L(a, '1 · CREATES THE COMPANY', '1 · CREA LA EMPRESA'), l2 = L(a, '2 · APPROVES THE CONTRACT', '2 · APRUEBA EL CONTRATO')
    const cw = Math.max(measure(ctx, l1, sz * KF, 'mono'), measure(ctx, l2, sz * KF, 'mono')) + pad * 2 + 110 * KF
    const ch = pad * 2 + rh * 2.6
    const cx = tall ? (W - cw) / 2 : W * 0.6 - cw / 2, cy = H * (tall ? 0.62 : 0.1) + bob(a, 2)
    ctx.save(); ctx.globalAlpha *= rp
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(cx + 5 * KF, cy + 7 * KF, cw, ch)
    ctx.fillStyle = a.pal.bg; ctx.fillRect(cx, cy, cw, ch); ctx.fillStyle = ink(a, 0.05); ctx.fillRect(cx, cy, cw, ch)
    ctx.strokeStyle = ink(a, 0.45); ctx.lineWidth = Math.max(1, 1.1 * KF); ctx.strokeRect(cx, cy, cw, ch)
    mono(ctx, a, L(a, 'THE RECORD', 'EL REGISTRO'), cx + pad, cy + pad + rh * 0.3, sz * 0.9, dim(a, 0.95))
    const y1 = cy + pad + rh * 1.3, y2 = y1 + rh
    mono(ctx, a, l1, cx + pad, y1, sz, ink(a, 0.95))
    text(ctx, L(a, 'named', 'nombrado'), cx + cw - pad, y1 + 1 * KF, { size: (sz + 5) * KF, color: ink(a, 0.97), align: 'right' })
    const p2 = prog(ls, cs[4], 600)
    mono(ctx, a, l2, cx + pad, y2, sz, ink(a, 0.95), { alpha: p2 })
    if (p2 > 0) { ctx.strokeStyle = red(a, 0.9 * p2); ctx.setLineDash([4 * KF, 4 * KF]); ctx.beginPath(); ctx.moveTo(cx + cw - pad - 80 * KF, y2); ctx.lineTo(cx + cw - pad, y2); ctx.stroke(); ctx.setLineDash([]) }
    ctx.restore()
    leader(ctx, a, isoPt(o, -2.6, -1.35, 1.0), [cx + pad * 2, tall ? cy : cy + ch], rp)
    leader(ctx, a, isoPt(o, 2.9, -1.35, 1.0), [cx + cw - pad * 2, tall ? cy : cy + ch], prog(ls, cs[4], 600), true)
  }
}

// ── 11 · WHO SIGNED? — the empty chair inside, a contract with a blank line, 5,869 lights ─────
const end: SceneFn = (ctx, a) => {
  const { ls, W, H, KF } = a
  const tall = isTall(a), c1 = cue(a, 1)
  // far behind, the hall of 5,869
  const f: Field = { horizon: H * 0.18, near: H * 0.42, half: W * 0.7, pan: drift(a) * W * 0.04 }
  field(ctx, a, f, () => 1, 0.55 * prog(ls, 0, 900))
  const u = tall ? W * 0.2 : Math.min(W * 0.13, H * 0.22)
  const o = camAt(a, 0.6 + drift(a) * 0.3, 0.4, 0.5, tall ? 0.58 : 0.6, u, 0.6)
  pool(ctx, a, o, 0.5, 0.6, 1.8, 0.24)
  const lc = isoPt(o, 0.6, 0.4, 0.75)
  lamp(ctx, a, lc[0], H * 0.0, lc[1] + u * 0.2, u * 1.1, 0.1)
  // the desk and the empty chair
  solidBox(ctx, a, o, -0.9, -0.5, 0.45, 0.45, 0.42, { lit: 0.5 })
  solidBox(ctx, a, o, -0.9, -0.5, 0.08, 0.45, 0.95, { lit: 0.55 })
  solidBox(ctx, a, o, -0.3, -0.3, 1.9, 1.1, 0.72, { lit: 0.7 })
  // the contract on the desk, lines typed, one line blank
  const P = (x: number, y: number) => isoPt(o, x, y, 0.725)
  poly(ctx, [P(0.1, -0.1), P(1.1, -0.1), P(1.1, 0.65), P(0.1, 0.65)], ink(a, 0.85))
  ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = Math.max(1, KF * 1.2)
  for (let k = 0; k < 5; k++) { const p = P(0.25, 0 + k * 0.08), q = P(0.25 + 0.5 + 0.2 * rnd(k), 0 + k * 0.08); ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke() }
  const sl = prog(ls, c1, 600)
  const a0 = P(0.45, 0.52), a1 = P(0.98, 0.52)
  ctx.strokeStyle = sl > 0 ? red(a, 0.4 + 0.55 * sl) : 'rgba(0,0,0,0.6)'; ctx.lineWidth = Math.max(1.2, 1.8 * KF)
  ctx.beginPath(); ctx.moveTo(a0[0], a0[1]); ctx.lineTo(a1[0], a1[1]); ctx.stroke()
  if (sl > 0) glow(ctx, (a0[0] + a1[0]) / 2, (a0[1] + a1[1]) / 2, u * 0.5, red(a, 0.18 * sl), red(a, 0))
  // the pen, hovering, never touching
  const hv = 0.25 + 0.06 * Math.sin(ls * 0.003)
  const nib = isoPt(o, 0.62 + 0.08 * Math.sin(ls * 0.0011), 0.5, 0.725 + hv)
  ctx.save(); ctx.translate(nib[0], nib[1]); ctx.rotate(-0.6)
  ctx.fillStyle = ink(a, 0.9); ctx.fillRect(-2.5 * KF, -u * 0.62, 5 * KF, u * 0.56)
  ctx.fillStyle = red(a, 0.95); ctx.beginPath(); ctx.moveTo(-2.5 * KF, -u * 0.06); ctx.lineTo(2.5 * KF, -u * 0.06); ctx.lineTo(0, 0); ctx.closePath(); ctx.fill()
  ctx.restore()
  vignette(ctx, a, 0.65)
  const p0 = prog(ls, 200, 600)
  const big = (tall ? 46 : 70) * KF
  text(ctx, fmt(NV, a), tall ? W * 0.5 : W * 0.07, H * (tall ? 0.2 : 0.24), { size: big, color: ink(a, 0.97), align: tall ? 'center' : 'left', alpha: p0 })
  mono(ctx, a, L(a, 'VENDORS', 'PROVEEDORES'), tall ? W * 0.5 : W * 0.07, H * (tall ? 0.2 : 0.24) + 18 * KF, 10.5, ink(a, 0.85), { align: tall ? 'center' : 'left', alpha: p0 })
  if (sl > 0) mono(ctx, a, L(a, 'SIGNATURE', 'FIRMA'), (a0[0] + a1[0]) / 2, a1[1] + 22 * KF, 10.5, red(a, 0.95), { align: 'center', alpha: sl })
}

export const scenes: Record<string, SceneFn> = { line, person: personScene, gone, name, three, behavior, crowd, list, late, rest, two, end }
