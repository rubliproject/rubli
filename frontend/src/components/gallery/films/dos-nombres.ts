/**
 * «Dos nombres, un proveedor» — who sells Mexico the metal for its coins. A calm factory tour
 * that ends at a filing cabinet, staged as Fern-style miniature dioramas: one isometric set
 * per shot on a dark floor, one light, the camera drifting, evidence cards floating above.
 * One draw function per shot, keyed by the beat's `scene` in story-films.json; see filmKit.ts
 * for the contract. Recurring set: THE TWO WAREHOUSES (El Paso, San Luis Potosí) and the red
 * thread that joins them. No people's faces, no logos, nothing that implies a crime.
 */
import { type Iso, type Pt, type SceneArgs, type SceneFn, L, clamp01, count, cue, dim, easeBack, easeInOut, easeOut, figure, ink, isoBox, isoFloor, isoPt, lamp, lerp, pool, prog, red, rnd, text, typeOn } from '@/components/gallery/filmKit'

type C = CanvasRenderingContext2D
type Box = { alpha?: number; accent?: boolean; z?: number; lit?: number }
const TAU = Math.PI * 2
const isTall = (a: SceneArgs) => a.H > a.W * 0.9
/** the camera's slow pan across the shot: +amt/2·W at the first frame → −amt/2·W at the last. */
const pan = (a: SceneArgs, amt: number) => (0.5 - clamp01(a.ls / Math.max(1, a.dur))) * a.W * amt
const blinkOn = (ls: number) => Math.floor(ls / 480) % 2 === 0

function mono(ctx: C, a: SceneArgs, s: string, x: number, y: number, size: number, color: string,
  o: { align?: CanvasTextAlign; alpha?: number; baseline?: CanvasTextBaseline; weight?: number; maxWidth?: number } = {}) {
  text(ctx, s, x, y, { size: size * a.KF, font: 'mono', color, tracking: size * 0.12 * a.KF, ...o })
}

function poly(ctx: C, pts: Pt[], fill: string, stroke?: string, lw = 1) {
  ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath()
  ctx.fillStyle = fill; ctx.fill()
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke() }
}

/** An opaque iso box: blacks out its silhouette first so nearer boxes hide farther ones. */
function box(ctx: C, a: SceneArgs, o: Iso, x: number, y: number, w: number, d: number, h: number, s: Box = {}) {
  if ((s.alpha ?? 1) <= 0.01 || h <= 0) return
  const z = s.z ?? 0, P = (px: number, py: number, pz: number) => isoPt(o, px, py, pz)
  ctx.save(); ctx.globalAlpha *= Math.min(1, (s.alpha ?? 1) * 1.6)
  poly(ctx, [P(x, y, z + h), P(x + w, y, z + h), P(x + w, y, z), P(x + w, y + d, z), P(x, y + d, z), P(x, y + d, z + h)], a.pal.bg)
  ctx.restore()
  isoBox(ctx, a, o, x, y, w, d, h, s)
}

/** A flat rectangle lying on the plane z (paper on a desk, a strip of metal, a floor marking). */
function flat(ctx: C, o: Iso, x: number, y: number, w: number, d: number, z: number, fill: string, stroke?: string) {
  poly(ctx, [isoPt(o, x, y, z), isoPt(o, x + w, y, z), isoPt(o, x + w, y + d, z), isoPt(o, x, y + d, z)], fill, stroke)
}

/** A standing cylinder — a coil of metal strip with its eye up (or a coin when h is tiny). */
function drum(ctx: C, a: SceneArgs, o: Iso, x: number, y: number, r: number, h: number,
  s: { z?: number; alpha?: number; accent?: boolean; lit?: number; eye?: boolean } = {}) {
  const al = s.alpha ?? 1
  if (al <= 0.01) return
  const z = s.z ?? 0, k = s.lit ?? 1, c = (v: number) => (s.accent ? red(a, v * al) : ink(a, v * al))
  const b = isoPt(o, x, y, z), t = isoPt(o, x, y, z + h), rx = r * o.u * 1.2247, ry = r * o.u * 0.7071
  ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(t[0] - rx, t[1]); ctx.lineTo(b[0] - rx, b[1]); ctx.ellipse(b[0], b[1], rx, ry, 0, Math.PI, 0, true); ctx.lineTo(t[0] + rx, t[1]); ctx.closePath()
  ctx.fillStyle = a.pal.bg; ctx.fill()
  ctx.fillStyle = c(0.24 * k); ctx.fill()
  ctx.fillStyle = c(0.16 * k); ctx.fillRect(b[0] + rx * 0.25, t[1], rx * 0.5, b[1] - t[1]) // a soft highlight band
  ctx.strokeStyle = c(0.42); ctx.stroke()
  ctx.beginPath(); ctx.ellipse(t[0], t[1], rx, ry, 0, 0, TAU); ctx.fillStyle = a.pal.bg; ctx.fill(); ctx.fillStyle = c(0.72 * k); ctx.fill(); ctx.strokeStyle = c(0.6); ctx.stroke()
  if (s.eye !== false) {
    ctx.beginPath(); ctx.ellipse(t[0], t[1], rx * 0.72, ry * 0.72, 0, 0, TAU); ctx.strokeStyle = c(0.32 * k); ctx.stroke()
    ctx.beginPath(); ctx.ellipse(t[0], t[1], rx * 0.36, ry * 0.36, 0, 0, TAU); ctx.fillStyle = `rgba(0,0,0,${0.78 * al})`; ctx.fill()
  }
}

/** A warehouse: an opaque box with a gable roof (ridge along x) and a loading door on its front. */
function warehouse(ctx: C, a: SceneArgs, o: Iso, x: number, y: number, w: number, d: number, h: number, s: Box & { door?: number } = {}) {
  const al = s.alpha ?? 1
  if (al <= 0.01) return
  const k = s.lit ?? 1, rh = d * 0.32, P = (px: number, py: number, pz: number) => isoPt(o, px, py, pz)
  const c = (v: number) => (s.accent ? red(a, v * al) : ink(a, v * al))
  box(ctx, a, o, x, y, w, d, h, s)
  // loading door on the front (+y) face, and a strip of windows
  const dw = w * 0.32, dx = x + w * 0.56, dh = h * 0.62 * (1 - 0.85 * clamp01(s.door ?? 0))
  poly(ctx, [P(dx, y + d, 0), P(dx + dw, y + d, 0), P(dx + dw, y + d, h * 0.62), P(dx, y + d, h * 0.62)], `rgba(0,0,0,${0.7 * al})`)
  poly(ctx, [P(dx, y + d, h * 0.62 - dh), P(dx + dw, y + d, h * 0.62 - dh), P(dx + dw, y + d, h * 0.62), P(dx, y + d, h * 0.62)], c(0.3 * k), c(0.4))
  for (let i = 0; i < 3; i++) { const wx = x + w * (0.08 + i * 0.14); poly(ctx, [P(wx, y + d, h * 0.62), P(wx + w * 0.09, y + d, h * 0.62), P(wx + w * 0.09, y + d, h * 0.8), P(wx, y + d, h * 0.8)], c(0.42 * k)) }
  ctx.save(); ctx.globalAlpha *= Math.min(1, al * 1.6)
  poly(ctx, [P(x, y, h), P(x + w, y, h), P(x + w, y + d / 2, h + rh), P(x, y + d / 2, h + rh)], a.pal.bg)
  poly(ctx, [P(x, y + d / 2, h + rh), P(x + w, y + d / 2, h + rh), P(x + w, y + d, h), P(x, y + d, h)], a.pal.bg)
  poly(ctx, [P(x + w, y, h), P(x + w, y + d / 2, h + rh), P(x + w, y + d, h)], a.pal.bg)
  ctx.restore()
  poly(ctx, [P(x, y, h), P(x + w, y, h), P(x + w, y + d / 2, h + rh), P(x, y + d / 2, h + rh)], c(0.62 * k), c(0.45))
  poly(ctx, [P(x, y + d / 2, h + rh), P(x + w, y + d / 2, h + rh), P(x + w, y + d, h), P(x, y + d, h)], c(0.5 * k), c(0.45))
  poly(ctx, [P(x + w, y, h), P(x + w, y + d / 2, h + rh), P(x + w, y + d, h)], c(0.3 * k), c(0.4))
}

/** A truck along `axis`, spanning [p, p+len] on it; the cab sits at the low end when cabLow. */
function truck(ctx: C, a: SceneArgs, o: Iso, axis: 'x' | 'y', p: number, q: number, len: number, cabLow: boolean, s: Box = {}) {
  const cabL = len * 0.26, trL = len - cabL - 0.06
  const seg = (from: number, l: number, wid: number, h: number, st: Box) =>
    axis === 'x' ? box(ctx, a, o, from, q - wid / 2, l, wid, h, st) : box(ctx, a, o, q - wid / 2, from, wid, l, h, st)
  const wheels = (from: number, l: number) => {
    ctx.fillStyle = `rgba(0,0,0,${0.85 * (s.alpha ?? 1)})`
    for (const f of [0.18, 0.82]) {
      const w = axis === 'x' ? isoPt(o, from + l * f, q + 0.46, 0.08) : isoPt(o, q + 0.46, from + l * f, 0.08)
      ctx.beginPath(); ctx.ellipse(w[0], w[1], 0.16 * o.u, 0.13 * o.u, 0, 0, TAU); ctx.fill()
    }
  }
  if (cabLow) { seg(p, cabL, 0.82, 0.78, { ...s, lit: (s.lit ?? 1) * 0.9 }); wheels(p, cabL); seg(p + cabL + 0.06, trL, 0.92, 1.05, s); wheels(p + cabL + 0.06, trL) }
  else { seg(p, trL, 0.92, 1.05, s); wheels(p, trL); seg(p + trL + 0.06, cabL, 0.82, 0.78, { ...s, lit: (s.lit ?? 1) * 0.9 }); wheels(p + trL + 0.06, cabL) }
}

/** A flat evidence card floating over the set. `body` draws inside, already faded; returns the card's top y. */
function card(ctx: C, a: SceneArgs, x: number, y: number, w: number, h: number, p: number,
  body: (top: number) => void, o: { accent?: boolean } = {}) {
  if (p <= 0) return y
  const KF = a.KF, top = y + (1 - easeOut(p)) * 14 * KF
  ctx.save(); ctx.globalAlpha *= Math.min(1, p * 1.8)
  ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(x + 6 * KF, top + 8 * KF, w, h)
  ctx.fillStyle = a.pal.bg; ctx.fillRect(x, top, w, h)
  ctx.fillStyle = ink(a, 0.07); ctx.fillRect(x, top, w, h)
  ctx.strokeStyle = o.accent ? red(a, 0.9) : ink(a, 0.55); ctx.lineWidth = Math.max(1, 1.2 * KF); ctx.strokeRect(x, top, w, h)
  body(top)
  ctx.restore()
  return top
}

/** A thin leader from a point on the set up to a card, with a dot at the set end. */
function leader(ctx: C, a: SceneArgs, from: Pt, to: Pt, p: number, accent = false) {
  if (p <= 0) return
  const e = easeOut(p), tx = lerp(from[0], to[0], e), ty = lerp(from[1], to[1], e)
  ctx.strokeStyle = accent ? red(a, 0.75) : ink(a, 0.45); ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(from[0], from[1]); ctx.lineTo(tx, ty); ctx.stroke()
  ctx.fillStyle = accent ? red(a, 0.95) : ink(a, 0.9); ctx.beginPath(); ctx.arc(from[0], from[1], 2.6 * a.KF, 0, TAU); ctx.fill()
}

/** Darkness closing in around the one light. */
function vignette(ctx: C, a: SceneArgs, cx: number, cy: number, r: number, al = 0.8) {
  const g = ctx.createRadialGradient(cx, cy, r * 0.3, cx, cy, r)
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${al})`)
  ctx.fillStyle = g; ctx.fillRect(-a.W * 0.1, -a.H * 0.1, a.W * 1.2, a.H * 1.2)
}

const bn = (a: SceneArgs, n: number, p: number, dec: number) => // 5.48 → "5.48B" / "5,480 MDP", counting
  a.lang === 'es' ? `${count(n * 1000, p, 0, 'es')} MDP` : `${count(n, p, dec, 'en')}B`
/** the plane z of a set, as its own origin — for things standing on a table or a shelf. */
const onTop = (o: Iso, z: number): Iso => ({ ox: o.ox, oy: o.oy - z * o.u, u: o.u })
/** world point from screen-aligned axes: s runs across the screen, t runs down it. */
const st = (s: number, t: number): Pt => [(s + t) / 2, (t - s) / 2]

// ── 0 · THE MINT — a minting line; the coil at its head is the one thing the mint does not make ─
const coin: SceneFn = (ctx, a) => {
  const { ls, W, H, KF } = a
  const tall = isTall(a), c0 = cue(a, 0), c1 = cue(a, 1), c2 = cue(a, 2)
  const u = tall ? W * 0.085 : Math.min(W * 0.068, H * 0.125)
  const o: Iso = { ox: W * (tall ? 0.6 : 0.56) - pan(a, 0.07), oy: H * (tall ? 0.36 : 0.41), u }
  const buy = easeInOut(prog(ls, c2, 900)), lineLit = lerp(1, 0.4, buy)
  const build = (i: number) => easeBack(prog(ls, c0 + i * 140, 600))

  isoFloor(ctx, a, o, 7, 0.09)
  pool(ctx, a, o, 1.8, 1.2, 4.2, 0.12 * lineLit)
  pool(ctx, a, o, 0, 4.3, 2.2, 0.06 + 0.2 * buy)
  // the press: body, column, and a ram that strikes
  const stroke = 0.5 + 0.5 * Math.cos((ls / 760) * TAU), hit = Math.pow(1 - stroke, 6)
  box(ctx, a, o, -0.85, -0.85, 1.7, 1.45, 1.15 * build(0), { lit: lineLit })
  box(ctx, a, o, -0.3, -0.5, 0.6, 0.6, 0.55 * build(1), { z: 1.15, lit: lineLit })
  box(ctx, a, o, -0.42, -0.62, 0.84, 0.84, 0.3 * build(1), { z: 1.7 + 0.22 * stroke, lit: lineLit * (1 + 0.3 * hit) })
  // the coining gantry, back post
  const gx = 2.35
  box(ctx, a, o, gx, -0.55, 0.22, 0.16, 1.0 * build(3), { lit: lineLit })
  // the conveyor and what rides it: blanks before the gantry, coins after it
  box(ctx, a, o, 0.85, -0.38, 3.95, 0.76, 0.32 * build(2), { lit: lineLit * 0.8 })
  const beltT = ls * 0.0009
  for (let s = 0; s < 14; s++) { const sx = 0.9 + ((s * 0.3 + beltT) % 3.9); flat(ctx, o, sx, -0.38, 0.03, 0.76, 0.321, ink(a, 0.1 * lineLit)) }
  const shown = build(2)
  for (let i = 0; i < 9; i++) {
    const px = 0.95 + ((beltT * 1.0 + i * 0.43) % 3.85)
    const isCoin = px > gx + 0.1
    drum(ctx, a, o, px, 0, 0.17, 0.05, { z: 0.32, eye: false, alpha: shown, lit: (isCoin ? 1.15 : 0.6) * lineLit })
    if (isCoin && lineLit > 0.5) { const t = isoPt(o, px, 0, 0.37); text(ctx, '$', t[0], t[1] + 1, { size: 0.24 * u, color: `rgba(0,0,0,${0.8 * shown})`, align: 'center', baseline: 'middle', weight: 700 }) }
  }
  // gantry front post + head (the head strikes too, half a beat later)
  const st2 = 0.5 + 0.5 * Math.cos((ls / 760) * TAU + Math.PI)
  box(ctx, a, o, gx, 0.42, 0.22, 0.16, 1.0 * build(3), { lit: lineLit })
  box(ctx, a, o, gx - 0.08, -0.6, 0.38, 1.2, 0.2 * build(3), { z: 0.86 + 0.08 * st2, lit: lineLit })
  // the bin the coins drop into
  box(ctx, a, o, 4.95, -0.6, 1.1, 1.2, 0.55 * build(4), { lit: lineLit })
  for (let i = 0; i < 7; i++) drum(ctx, a, o, 5.2 + rnd(i) * 0.6, -0.35 + rnd(i + 9) * 0.7, 0.17, 0.04, { z: 0.55, eye: false, alpha: build(4), lit: lineLit })
  // the feed bed and the strip running along it into the press
  box(ctx, a, o, -0.38, 0.6, 0.76, 3.05, 0.32 * build(1), { lit: lineLit * 0.8 })
  flat(ctx, o, -0.26, 0.6, 0.52, 3.05, 0.33, ink(a, 0.55 * lerp(1, 0.75, buy)), ink(a, 0.7))
  for (let s = 0; s < 10; s++) { const sy = 3.6 - ((s * 0.31 + ls * 0.0006) % 3.0); flat(ctx, o, -0.26, sy, 0.52, 0.025, 0.331, `rgba(0,0,0,${0.35})`) }
  if (hit > 0.2) pool(ctx, a, o, 0, 0, 1.2, 0.18 * hit * lineLit)
  // the truck backing up to the coil
  const tp = easeOut(prog(ls, c2 - 300, 2600)), tx = lerp(-10.5, -3.35, tp)
  if (tp > 0) truck(ctx, a, o, 'x', tx, 4.35, 2.4, true, { lit: 0.55 + 0.35 * buy })
  // THE COIL
  drum(ctx, a, o, 0, 4.35, 0.78, 0.9, { lit: lerp(0.9, 1.25, buy), accent: buy > 0.5, alpha: build(0) })

  vignette(ctx, a, W * 0.5, H * 0.42, Math.max(W, H) * 0.72, 0.7)

  // evidence
  const wL = (tall ? 0.44 : 0.25) * W, hL = 54 * KF
  const coinAt = isoPt(o, 3.9, 0, 0.4), stripAt = isoPt(o, 0, 2.4, 0.35), pressAt = isoPt(o, 0.4, -0.2, 1.4), coilAt = isoPt(o, 0, 4.35, 0.9)
  const pC = prog(ls, c0 + 500, 700) * (1 - prog(ls, c1 - 200, 400))
  const xR = tall ? W * 0.52 : W * 0.71, yR = H * (tall ? 0.135 : 0.13)
  leader(ctx, a, coinAt, [xR + wL * 0.4, yR + hL], pC)
  card(ctx, a, xR, yR, wL, hL, pC, (t) => {
    text(ctx, L(a, 'Peso coin', 'Moneda de peso'), xR + 12 * KF, t + 26 * KF, { size: 20 * KF, color: ink(a, 0.95) })
    mono(ctx, a, L(a, 'WHAT COMES OUT', 'LO QUE SALE'), xR + 12 * KF, t + 43 * KF, 10, dim(a, 0.95))
  })
  const pM = prog(ls, c1, 700)
  leader(ctx, a, pressAt, [xR + wL * 0.3, yR + hL], pM)
  card(ctx, a, xR, yR, wL, hL, pM, (t) => {
    text(ctx, 'Casa de Moneda', xR + 12 * KF, t + 26 * KF, { size: 20 * KF, color: ink(a, 0.95) })
    mono(ctx, a, L(a, 'MAKES COINS, NOT METAL', 'HACE MONEDAS, NO METAL'), xR + 12 * KF, t + 43 * KF, 10, dim(a, 0.95), { maxWidth: wL - 20 * KF })
  })
  const xLc = tall ? W * 0.04 : W * 0.05, yLc = H * (tall ? 0.36 : 0.2)
  const pS = prog(ls, c0 + 2200, 700)
  leader(ctx, a, buy > 0.5 ? coilAt : stripAt, [xLc + wL * 0.5, yLc + hL], pS, buy > 0.5)
  card(ctx, a, xLc, yLc, wL, hL, pS, (t) => {
    text(ctx, L(a, 'Metal strip', 'Lámina de metal'), xLc + 12 * KF, t + 26 * KF, { size: 20 * KF, color: ink(a, 0.95) })
    mono(ctx, a, buy > 0.5 ? L(a, 'BOUGHT IN · NOT MADE HERE', 'SE COMPRA · NO SE FABRICA') : L(a, 'WHERE EVERY COIN STARTS', 'DONDE EMPIEZA CADA MONEDA'), xLc + 12 * KF, t + 43 * KF, 10, buy > 0.5 ? red(a, 0.95) : dim(a, 0.95), { maxWidth: wL - 20 * KF })
  }, { accent: buy > 0.5 })
}

// ── 1 · NO TENDER — a loading dock with two doors; only one of them ever opens ───────────────
const direct: SceneFn = (ctx, a) => {
  const { ls, W, H, KF } = a
  const tall = isTall(a), c0 = cue(a, 0), c1 = cue(a, 1), c2 = cue(a, 2)
  const u = tall ? W * 0.082 : Math.min(W * 0.068, H * 0.122)
  const o: Iso = { ox: W * 0.5 + pan(a, 0.05), oy: H * (tall ? 0.36 : 0.37), u }
  const WH = 2.3, P = (x: number, y: number, z: number) => isoPt(o, x, y, z)
  const rise = (i: number) => easeOut(prog(ls, c0 + i * 120, 700))

  isoFloor(ctx, a, o, 8, 0.08)
  pool(ctx, a, o, 4.6, 2.2, 3.4, 0.16)
  pool(ctx, a, o, 1.8, 3.2, 3.4, 0.07)
  // the two walls of the dock, meeting at the back corner
  const wallH = WH * rise(0)
  poly(ctx, [P(0, 0, 0), P(0, 6.2, 0), P(0, 6.2, wallH), P(0, 0, wallH)], ink(a, 0.2), ink(a, 0.3))
  poly(ctx, [P(0, 0, 0), P(6.2, 0, 0), P(6.2, 0, wallH), P(0, 0, wallH)], ink(a, 0.13), ink(a, 0.3))
  for (let k = 1; k < 5; k++) { // panel seams
    ctx.strokeStyle = ink(a, 0.07); ctx.beginPath()
    let p = P(0, 0, (wallH * k) / 5), q = P(0, 6.2, (wallH * k) / 5); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1])
    p = P(0, 0, (wallH * k) / 5); q = P(6.2, 0, (wallH * k) / 5); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke()
  }
  // door A — LICITACIÓN, on the left wall: shutter down, for good
  const dA0 = 1.2, dA1 = 3.2, dH = 1.6
  poly(ctx, [P(0, dA0, 0), P(0, dA1, 0), P(0, dA1, dH), P(0, dA0, dH)], 'rgba(0,0,0,0.8)')
  const shA = dH * rise(1)
  poly(ctx, [P(0, dA0, dH - shA), P(0, dA1, dH - shA), P(0, dA1, dH), P(0, dA0, dH)], ink(a, 0.36), ink(a, 0.55))
  for (let k = 1; k < 9; k++) { const z = dH - (shA * k) / 9, p = P(0, dA0, z), q = P(0, dA1, z); ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke() }
  // door B — ADJUDICACIÓN DIRECTA, on the right wall: the shutter rolls up
  const dB0 = 3.95, dB1 = 5.75, openB = easeInOut(prog(ls, c0 + 500, 1300))
  poly(ctx, [P(dB0, 0, 0), P(dB1, 0, 0), P(dB1, 0, dH), P(dB0, 0, dH)], 'rgba(0,0,0,0.85)')
  const shB = dH * (1 - openB) * rise(1)
  poly(ctx, [P(dB0, 0, dH - shB), P(dB1, 0, dH - shB), P(dB1, 0, dH), P(dB0, 0, dH)], ink(a, 0.36), ink(a, 0.55))
  ctx.lineWidth = Math.max(1.5, 2 * KF)
  poly(ctx, [P(dB0, 0, 0), P(dB1, 0, 0), P(dB1, 0, dH), P(dB0, 0, dH)], 'rgba(0,0,0,0)', red(a, 0.4 + 0.5 * openB), Math.max(1.5, 2 * KF))
  // light spilling out of the open door onto the floor
  if (openB > 0) poly(ctx, [P(dB0, 0, 0), P(dB1, 0, 0), P(dB1 + 0.4, 2.6, 0), P(dB0 - 0.4, 2.6, 0)], ink(a, 0.07 * openB))
  // the trucks that come straight in, one after another (one per contract once the count starts)
  const cycle = 2300, nIn = ls < c2 ? 1 : 3
  for (let k = nIn - 1; k >= 0; k--) {
    const t0 = c0 + 900 + k * (cycle / 2.2) * (ls < c2 ? 0 : 1)
    let tt = (ls - t0) / cycle
    if (tt < 0) continue
    if (ls >= c2 || k > 0) tt = tt % 1; else tt = Math.min(tt, 1)
    const front = lerp(8.5, -1.2, easeInOut(clamp01(tt)))
    if (front > 7.4) continue
    const len = 2.6, f0 = Math.max(0.02, front)
    if (front + len <= 0.05) continue
    // the part already through the door is gone into the dark
    if (f0 < front + len) truck(ctx, a, o, 'y', f0, (dB0 + dB1) / 2, front + len - f0, false, { lit: 0.9 })
  }
  // the queue at the tender door, idling
  for (let k = 2; k >= 0; k--) {
    const bob = Math.sin(ls * 0.012 + k * 2) * 0.012
    truck(ctx, a, o, 'x', 0.3 + k * 1.3 + bob, (dA0 + dA1) / 2, 1.15, true, { lit: 0.55, alpha: rise(2 + k) })
  }

  vignette(ctx, a, W * 0.52, H * 0.4, Math.max(W, H) * 0.7, 0.7)

  // the signs over the doors
  const signW = (tall ? 0.42 : 0.24) * W, signH = 44 * KF
  const aTop = P(0, (dA0 + dA1) / 2, WH), bTop = P((dB0 + dB1) / 2, 0, WH)
  const sAx = tall ? W * 0.03 : Math.max(W * 0.04, aTop[0] - signW - 30 * KF), sAy = H * (tall ? 0.135 : 0.16)
  const pA = prog(ls, c0 + 200, 700)
  leader(ctx, a, aTop, [sAx + signW * 0.7, sAy + signH], pA)
  card(ctx, a, sAx, sAy, signW, signH, pA, (t) => {
    mono(ctx, a, L(a, 'TENDER', 'LICITACIÓN'), sAx + 12 * KF, t + 19 * KF, 12, ink(a, 0.95), { weight: 700 })
    mono(ctx, a, L(a, 'CLOSED · NOT USED', 'CERRADA · NO SE USÓ'), sAx + 12 * KF, t + 35 * KF, 10, dim(a, 0.95), { maxWidth: signW - 20 * KF })
  })
  const sBx = tall ? W * 0.53 : Math.min(W * 0.96 - signW, bTop[0] + 20 * KF), sBy = H * (tall ? 0.135 : 0.13)
  const pB = prog(ls, c0 + 700, 700)
  leader(ctx, a, bTop, [sBx + signW * 0.3, sBy + signH], pB, true)
  card(ctx, a, sBx, sBy, signW, signH, pB, (t) => {
    mono(ctx, a, L(a, 'DIRECT AWARD', 'ADJUDICACIÓN DIRECTA'), sBx + 12 * KF, t + 19 * KF, 12, red(a, 0.95), { weight: 700, maxWidth: signW - 20 * KF })
    mono(ctx, a, L(a, 'OPEN', 'ABIERTA'), sBx + 12 * KF, t + 35 * KF, 10, dim(a, 0.95))
  }, { accent: true })
  // the legal exception: a page of law, one article lit
  const lw = (tall ? 0.5 : 0.25) * W, lh = 70 * KF, lx = tall ? W * 0.03 : W * 0.04, ly = H * (tall ? 0.5 : 0.3)
  const pL = prog(ls, c1, 800)
  card(ctx, a, lx, ly, lw, lh, pL, (t) => {
    for (let i = 0; i < 4; i++) { ctx.fillStyle = ink(a, 0.18); ctx.fillRect(lx + 12 * KF, t + (12 + i * 13) * KF, (lw - 24 * KF) * (0.55 + 0.4 * rnd(i + 3)), 2 * KF) }
    const hi = easeOut(prog(ls, c1 + 600, 600))
    ctx.fillStyle = red(a, 0.22 * hi); ctx.fillRect(lx + 8 * KF, t + 20 * KF, (lw - 16 * KF) * hi, 30 * KF)
    text(ctx, L(a, 'Art. 41, sec. XII', 'Art. 41, fr. XII'), lx + 14 * KF, t + 41 * KF, { size: 21 * KF, color: ink(a, 0.97), alpha: hi })
    mono(ctx, a, L(a, 'STATE MAKER · RAW MATERIALS', 'FABRICANTE DEL ESTADO · MATERIAS PRIMAS'), lx + 14 * KF, t + 61 * KF, 10, dim(a, 0.95), { alpha: hi, maxWidth: lw - 24 * KF })
  })
  // every one of these contracts went through the open door: a tally hung under its sign
  const pT = prog(ls, c2, 600)
  if (pT > 0) {
    const tw = signW, tx = sBx, ty = sBy + signH + 10 * KF, n = Math.round(26 * easeOut(pT))
    card(ctx, a, tx, ty, tw, 56 * KF, pT, (t) => {
      text(ctx, '26 / 26', tx + 12 * KF, t + 30 * KF, { size: 24 * KF, color: red(a, 0.95) })
      mono(ctx, a, L(a, 'CONTRACTS · DIRECT AWARD', 'CONTRATOS · ADJ. DIRECTA'), tx + 12 * KF, t + 47 * KF, 10, dim(a, 0.95), { maxWidth: tw - 24 * KF })
      const bx = tx + tw * 0.52, bw = tw * 0.44
      for (let i = 0; i < 26; i++) { ctx.fillStyle = i < n ? red(a, 0.9) : ink(a, 0.15); ctx.fillRect(bx + (i % 13) * (bw / 13), t + (i < 13 ? 12 : 26) * KF, bw / 13 - 2 * KF, 10 * KF) }
    })
  }
}

/** A red thread from p toward q: `reach` 0→1 draws it out, `taut` 0→1 pulls the sag out of it. */
function thread(ctx: C, a: SceneArgs, p: Pt, q: Pt, reach: number, taut: number, al: number, w = 2) {
  if (reach <= 0 || al <= 0) return
  const sag = (1 - taut) * Math.hypot(q[0] - p[0], q[1] - p[1]) * 0.3
  const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2 + sag, n = 32
  ctx.strokeStyle = red(a, al); ctx.lineWidth = w * a.KF; ctx.lineCap = 'round'
  ctx.beginPath(); ctx.moveTo(p[0], p[1])
  for (let i = 1; i <= Math.round(n * clamp01(reach)); i++) {
    const t = i / n, s = 1 - t
    ctx.lineTo(s * s * p[0] + 2 * s * t * mx + t * t * q[0], s * s * p[1] + 2 * s * t * my + t * t * q[1])
  }
  ctx.stroke(); ctx.lineCap = 'butt'
}

/** The map table: a dark slab with a schematic border, the two warehouses standing on it. */
function mapTable(ctx: C, a: SceneArgs, o: Iso, ls: number, s: { build: number; pv: number; om: number; pins: number; k?: number }) {
  const T = 0.35, oT = onTop(o, T), k = s.k ?? 1, KF = a.KF
  box(ctx, a, o, -2.5, -2.5, 5, 5, T * s.build, { lit: 0.5 * k })
  const PV = st(-1.3, -2.25), OM = st(0.9, 1.75)
  const out = { pv: isoPt(oT, PV[0], PV[1], 0.75), om: isoPt(oT, OM[0], OM[1], 0.75) }
  if (s.build < 0.98) return out
  flat(ctx, oT, -2.5, -2.5, 5, 5, 0, 'rgba(0,0,0,0.3)')
  // a lamp's pool drifting slowly across the map
  const sw = Math.sin(ls * 0.00035)
  pool(ctx, a, oT, sw * 1.2, -sw * 0.6, 2.4, 0.13 * k)
  // faint survey lines
  ctx.lineWidth = 1
  for (let i = -2; i <= 2; i++) {
    ctx.strokeStyle = ink(a, 0.05 * k)
    let p = isoPt(oT, i, -2.5), q = isoPt(oT, i, 2.5); ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke()
    p = isoPt(oT, -2.5, i); q = isoPt(oT, 2.5, i); ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke()
  }
  // the border, schematic
  ctx.strokeStyle = ink(a, 0.6 * k); ctx.lineWidth = Math.max(1, 1.4 * KF); ctx.setLineDash([6 * KF, 4 * KF]); ctx.beginPath()
  for (let i = 0; i <= 16; i++) {
    const sv = -3.1 + i * 0.3875, tv = -1.55 + 0.16 * Math.sin(sv * 1.7) + 0.07 * Math.sin(sv * 4.1), w = st(sv, tv), p = isoPt(oT, w[0], w[1])
    if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1])
  }
  ctx.stroke(); ctx.setLineDash([])
  const us = isoPt(oT, ...st(1.5, -2.6)), mx = isoPt(oT, ...st(-1.7, 0.9))
  mono(ctx, a, L(a, 'USA', 'EE. UU.'), us[0], us[1], 10, dim(a, 0.8 * k), { align: 'center' })
  mono(ctx, a, L(a, 'MEXICO', 'MÉXICO'), mx[0], mx[1], 10, dim(a, 0.8 * k), { align: 'center' })
  // pins, then the warehouses rising beside them
  for (const [w, p] of [[PV, s.pins], [OM, s.pins]] as [Pt, number][]) {
    if (p <= 0) continue
    const b = isoPt(oT, w[0], w[1]), drop = (1 - easeOut(p)) * 40 * KF
    pool(ctx, a, oT, w[0], w[1], 0.9, 0.12 * p * k)
    ctx.fillStyle = ink(a, 0.9 * k); ctx.beginPath(); ctx.ellipse(b[0], b[1], 3 * KF, 1.6 * KF, 0, 0, TAU); ctx.fill()
    if (p < 1) { ctx.strokeStyle = ink(a, 0.8 * k); ctx.beginPath(); ctx.moveTo(b[0], b[1] - drop); ctx.lineTo(b[0], b[1] - drop - 14 * KF); ctx.stroke() }
  }
  if (s.pv > 0.02) warehouse(ctx, a, oT, PV[0] - 0.45, PV[1] - 0.32, 0.9, 0.64, 0.5 * easeBack(s.pv), { lit: 0.95 * k })
  if (s.om > 0.02) warehouse(ctx, a, oT, OM[0] - 0.45, OM[1] - 0.32, 0.9, 0.64, 0.5 * easeBack(s.om), { lit: 0.95 * k })
  return out
}

/** An index card from the public supplier record. */
function recordCard(ctx: C, a: SceneArgs, x: number, y: number, w: number, p: number, n: number, name: string, place: string,
  o: { nameP?: number; none?: number; strike?: number; filial?: number; accent?: boolean } = {}) {
  const KF = a.KF, h = 62 * KF
  card(ctx, a, x, y, w, h, p, (t) => {
    mono(ctx, a, L(a, `SUPPLIER ${n}`, `PROVEEDOR ${n}`), x + 12 * KF, t + 16 * KF, 10, dim(a, 0.95))
    ctx.fillStyle = ink(a, 0.12); ctx.fillRect(x + w - 34 * KF, t + 8 * KF, 22 * KF, 10 * KF) // the card's index tab
    text(ctx, typeOn(name, o.nameP ?? 1), x + 12 * KF, t + 37 * KF, { size: 18 * KF, color: ink(a, 0.96), maxWidth: w - 24 * KF })
    if ((o.filial ?? 0) > 0) mono(ctx, a, L(a, "OMEGA'S AFFILIATE", 'FILIAL DE OMEGA'), x + 12 * KF, t + 53 * KF, 10, red(a, 0.95), { alpha: o.filial, maxWidth: w - 24 * KF })
    else if ((o.none ?? 0) > 0) {
      const s = L(a, 'RELATED PARTIES: NONE', 'PARTES RELACIONADAS: NINGUNA')
      mono(ctx, a, s, x + 12 * KF, t + 53 * KF, 10, dim(a, 0.95), { alpha: o.none, maxWidth: w - 24 * KF })
      const sk = o.strike ?? 0
      if (sk > 0) { ctx.fillStyle = red(a, 0.95); ctx.fillRect(x + 10 * KF, t + 49 * KF, (w - 24 * KF) * easeOut(sk), 2 * KF) }
    } else mono(ctx, a, place, x + 12 * KF, t + 53 * KF, 10, dim(a, 0.85), { maxWidth: w - 24 * KF })
  }, { accent: o.accent })
}

// ── 2 · TWO SUPPLIERS — a map table, two warehouses far apart, two separate index cards ────────
const two: SceneFn = (ctx, a) => {
  const { ls, W, H, KF } = a
  const tall = isTall(a), c0 = cue(a, 0), c1 = cue(a, 1), c2 = cue(a, 2)
  const u = tall ? W * 0.075 : Math.min(W * 0.062, H * 0.106)
  const o: Iso = { ox: W * (tall ? 0.5 : 0.37) + pan(a, 0.06), oy: H * (tall ? 0.43 : 0.43), u }
  const build = easeOut(prog(ls, c0, 900))
  const pvP = prog(ls, c1, 700), omP = prog(ls, c2, 700)

  isoFloor(ctx, a, o, 7, 0.06)
  const at = mapTable(ctx, a, o, ls, { build, pins: prog(ls, c0 + 700, 600), pv: pvP, om: omP })
  vignette(ctx, a, o.ox, H * 0.42, Math.max(W, H) * 0.7, 0.72)

  // the name cards over each warehouse
  const nw = (tall ? 0.42 : 0.22) * W, nh = 50 * KF
  const pvX = tall ? W * 0.04 : W * 0.04, pvY = H * (tall ? 0.135 : 0.13)
  leader(ctx, a, at.pv, [pvX + nw * 0.7, pvY + nh], prog(ls, c1 + 200, 600))
  card(ctx, a, pvX, pvY, nw, nh, prog(ls, c1 + 200, 600), (t) => {
    text(ctx, 'PV Metals LLC', pvX + 12 * KF, t + 24 * KF, { size: 19 * KF, color: ink(a, 0.96), maxWidth: nw - 20 * KF })
    mono(ctx, a, 'EL PASO, TEXAS', pvX + 12 * KF, t + 41 * KF, 10, dim(a, 0.95))
  })
  const omX = tall ? W * 0.54 : W * 0.44, omY = H * (tall ? 0.6 : 0.6)
  leader(ctx, a, at.om, [omX + nw * 0.2, omY], prog(ls, c2 + 200, 600))
  card(ctx, a, omX, omY, nw, nh, prog(ls, c2 + 200, 600), (t) => {
    text(ctx, 'Omega Aleaciones', omX + 12 * KF, t + 24 * KF, { size: 19 * KF, color: ink(a, 0.96), maxWidth: nw - 20 * KF })
    mono(ctx, a, 'SAN LUIS POTOSÍ', omX + 12 * KF, t + 41 * KF, 10, dim(a, 0.95))
  })

  // the public record: a drawer with two cards that know nothing of each other
  const rw = (tall ? 0.42 : 0.27) * W, rx = tall ? W * 0.54 : W * 0.69
  const ry0 = H * (tall ? 0.16 : 0.15), gap = 84 * KF
  const pR = prog(ls, c0 + 400, 700)
  if (pR > 0) mono(ctx, a, L(a, 'PUBLIC RECORD', 'REGISTRO PÚBLICO'), rx, ry0 - 8 * KF, 10, dim(a, 0.95 * pR))
  const none = prog(ls, c2 + 1400, 700)
  recordCard(ctx, a, rx, ry0, rw, pR, 1, 'PV Metals LLC', 'EL PASO, TX', { nameP: prog(ls, c1 + 300, 900), none })
  if (!tall) recordCard(ctx, a, rx, ry0 + gap, rw, prog(ls, c0 + 600, 700), 2, 'Omega Aleaciones', 'SAN LUIS POTOSÍ', { nameP: prog(ls, c2 + 300, 900), none })
  // between them, the empty field
  if (!tall && none > 0) {
    const yb = ry0 + gap * 2 + 4 * KF
    card(ctx, a, rx, yb, rw, 40 * KF, none, (t) => {
      mono(ctx, a, L(a, 'LINK BETWEEN 1 AND 2', 'VÍNCULO ENTRE 1 Y 2'), rx + 12 * KF, t + 17 * KF, 10, dim(a, 0.95), { maxWidth: rw - 24 * KF })
      ctx.strokeStyle = red(a, 0.8); ctx.setLineDash([4 * KF, 4 * KF]); ctx.strokeRect(rx + 12 * KF, t + 23 * KF, rw - 24 * KF, 10 * KF); ctx.setLineDash([])
      if (blinkOn(ls)) { ctx.fillStyle = red(a, 0.9); ctx.fillRect(rx + 16 * KF, t + 25 * KF, 2 * KF, 6 * KF) }
    }, { accent: true })
  }
}

// ── 3 · ONE GROUP — their own website says it; a red thread pulls taut; the cards clip together ──
const one: SceneFn = (ctx, a) => {
  const { ls, W, H, KF } = a
  const tall = isTall(a), c0 = cue(a, 0), c2 = cue(a, 2)
  const u = tall ? W * 0.05 : Math.min(W * 0.044, H * 0.078)
  const o: Iso = { ox: W * (tall ? 0.5 : 0.74) - pan(a, 0.05), oy: H * (tall ? 0.47 : 0.4), u }

  isoFloor(ctx, a, o, 6, 0.05)
  const at = mapTable(ctx, a, o, ls, { build: 1, pins: 1, pv: 1, om: 1 })
  // the thread: drawn out once the quote is typed, pulled taut on "affiliate"
  const reach = easeInOut(prog(ls, 3000, 1400)), taut = easeInOut(prog(ls, c2, 900))
  thread(ctx, a, at.pv, at.om, reach, taut, 0.95, 2.4)
  if (reach >= 1) { ctx.fillStyle = red(a, 1); for (const p of [at.pv, at.om]) { ctx.beginPath(); ctx.arc(p[0], p[1], 3.5 * KF, 0, TAU); ctx.fill() } }
  vignette(ctx, a, W * 0.5, H * 0.42, Math.max(W, H) * 0.75, 0.6)

  // the browser window with the company's own line typed out
  const bx = W * (tall ? 0.05 : 0.04), by = H * (tall ? 0.135 : 0.13), bw = W * (tall ? 0.9 : 0.5), bh = (tall ? 112 : 128) * KF
  const pB = prog(ls, c0 + 200, 600)
  card(ctx, a, bx, by, bw, bh, pB, (t) => {
    ctx.fillStyle = ink(a, 0.1); ctx.fillRect(bx, t, bw, 20 * KF)
    for (let i = 0; i < 3; i++) { ctx.fillStyle = ink(a, 0.35); ctx.beginPath(); ctx.arc(bx + (12 + i * 11) * KF, t + 10 * KF, 3 * KF, 0, TAU); ctx.fill() }
    ctx.fillStyle = ink(a, 0.08); ctx.fillRect(bx + 52 * KF, t + 5 * KF, bw * 0.5, 10 * KF)
    mono(ctx, a, L(a, 'PV METALS · ITS OWN WEBSITE', 'PV METALS · SU PROPIO SITIO WEB'), bx + 56 * KF + bw * 0.5, t + 14 * KF, 10, dim(a, 0.9), { maxWidth: bw * 0.5 - 64 * KF })
    const l1 = '“PV Metals is the US division', l2 = 'of Omega Aleaciones.”', tp = prog(ls, 600, 2300)
    const fs = (tall ? 19 : 23) * KF, n1 = l1.length / (l1.length + l2.length)
    text(ctx, typeOn(l1, tp / n1), bx + 16 * KF, t + 52 * KF, { size: fs, color: ink(a, 0.97), maxWidth: bw - 30 * KF })
    text(ctx, typeOn(l2, (tp - n1) / (1 - n1)), bx + 16 * KF, t + 52 * KF + fs * 1.25, { size: fs, color: ink(a, 0.97), maxWidth: bw - 30 * KF })
    if (tp > 0 && tp < 1 && blinkOn(ls)) { ctx.fillStyle = ink(a, 0.8); ctx.fillRect(bx + 16 * KF, t + 58 * KF + fs * 1.25, 10 * KF, 2 * KF) }
    // underline "US division" once typed
    const hl = easeOut(prog(ls, 2900, 600))
    if (hl > 0) {
      ctx.save(); ctx.font = `600 ${fs}px "Playfair Display", Georgia, serif`
      const x0 = bx + 16 * KF + ctx.measureText('“PV Metals is the ').width, w0 = ctx.measureText('US division').width
      ctx.restore(); ctx.fillStyle = red(a, 0.95); ctx.fillRect(x0, t + 56 * KF, w0 * hl, 2.5 * KF)
    }
    if (a.lang === 'es') mono(ctx, a, '«LA DIVISIÓN ESTADOUNIDENSE DE OMEGA ALEACIONES»', bx + 16 * KF, t + bh - 12 * KF, 10, dim(a, 0.9 * hl), { maxWidth: bw - 30 * KF })
  })

  // the two index cards: "no relation" struck out, then clipped into one on "affiliate"
  const rw = W * (tall ? 0.43 : 0.36), m = easeInOut(prog(ls, c2 + 300, 900))
  const r1x = tall ? W * 0.05 : W * 0.06, r1y = H * (tall ? 0.6 : 0.47)
  const r2x = tall ? lerp(W * 0.52, W * 0.09, m) : W * 0.06 + 14 * KF * m, r2y = tall ? lerp(r1y, r1y + 10 * KF, m) : lerp(H * 0.47 + 74 * KF, H * 0.47 + 14 * KF, m)
  const strike = prog(ls, c0 + 300, 500), filial = prog(ls, c2 + 1100, 600)
  recordCard(ctx, a, r2x, r2y, rw, pB, 2, 'Omega Aleaciones', 'SAN LUIS POTOSÍ', { none: 1, strike, accent: m > 0.98 })
  recordCard(ctx, a, r1x, r1y, rw, pB, 1, 'PV Metals LLC', 'EL PASO, TX', { none: 1, strike, filial, accent: m > 0.98 })
  if (m > 0.6) { // the clip
    const cx = r1x + rw - 40 * KF, cy = r1y - 8 * KF, al = (m - 0.6) / 0.4
    ctx.strokeStyle = red(a, 0.95 * al); ctx.lineWidth = 2.2 * KF; ctx.beginPath()
    ctx.roundRect(cx, cy, 12 * KF, 34 * KF, 6 * KF); ctx.stroke()
    ctx.beginPath(); ctx.roundRect(cx + 3 * KF, cy + 6 * KF, 6 * KF, 22 * KF, 3 * KF); ctx.stroke()
  }
  if (filial > 0 && !tall) mono(ctx, a, L(a, "THE MINT'S CONTRACTS", 'CONTRATOS DE LA CASA DE MONEDA'), r1x + rw + 16 * KF, r1y + 54 * KF, 10, red(a, 0.9 * filial), { maxWidth: W * 0.22 })
}

// ── 4 · TWO THIRDS — a warehouse floor: 100 coils, 65 of them in the group's zone ───────────────
const SPOTS_A: Pt[] = [], SPOTS_B: Pt[] = []
for (let c = 0; c < 5; c++) for (let r = 0; r < 3; r++) if (SPOTS_A.length < 13) SPOTS_A.push([c * 0.9 + 0.45, r * 0.9 + 0.45])
for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++) if (SPOTS_B.length < 7) SPOTS_B.push([5.85 + c * 0.9 + 0.45, r * 0.9 + 0.45])

const share: SceneFn = (ctx, a) => {
  const { ls, W, H, KF } = a
  const tall = isTall(a), c0 = cue(a, 0), c1 = cue(a, 1), c2 = cue(a, 2)
  const u = tall ? W * 0.062 : Math.min(W * 0.047, H * 0.078)
  const o: Iso = { ox: W * (tall ? 0.26 : 0.31) + pan(a, 0.05), oy: H * (tall ? 0.4 : 0.33), u }
  const P = (x: number, y: number, z: number) => isoPt(o, x, y, z)
  const step = 46, tA = c0 + 500, tB = c2 + 300
  const zoneA = easeOut(prog(ls, c1, 700))

  isoFloor(ctx, a, o, 10, 0.06)
  // back walls of the warehouse, with high windows letting in the one light
  const wh = 2.6
  poly(ctx, [P(-0.4, -0.4, 0), P(9.4, -0.4, 0), P(9.4, -0.4, wh), P(-0.4, -0.4, wh)], ink(a, 0.08), ink(a, 0.18))
  poly(ctx, [P(-0.4, -0.4, 0), P(-0.4, 3.4, 0), P(-0.4, 3.4, wh), P(-0.4, -0.4, wh)], ink(a, 0.13), ink(a, 0.18))
  for (let i = 0; i < 6; i++) { const x = 0.5 + i * 1.5; poly(ctx, [P(x, -0.4, wh * 0.62), P(x + 0.9, -0.4, wh * 0.62), P(x + 0.9, -0.4, wh * 0.9), P(x, -0.4, wh * 0.9)], ink(a, 0.2 + 0.05 * Math.sin(ls * 0.001 + i))) }
  pool(ctx, a, o, 2.4, 1.4, 4, 0.13); pool(ctx, a, o, 7.2, 1.4, 2.6, 0.08)
  // floor markings: the group's zone in red, the other supplier's in grey
  flat(ctx, o, 0, 0, 4.5, 2.7, 0, red(a, 0.05 + 0.08 * zoneA))
  ctx.lineWidth = Math.max(1.2, 1.8 * KF)
  flat(ctx, o, 0, 0, 4.5, 2.7, 0, 'rgba(0,0,0,0)', red(a, 0.35 + 0.6 * zoneA))
  flat(ctx, o, 5.85, 0, 2.7, 2.7, 0, 'rgba(0,0,0,0)', ink(a, 0.3))
  ctx.lineWidth = 1

  const stackAt = (sp: Pt, base: number, t0: number) => {
    box(ctx, a, o, sp[0] - 0.4, sp[1] - 0.4, 0.8, 0.8, 0.07, { lit: 0.6 })
    for (let l = 0; l < 5; l++) {
      const p = prog(ls, t0 + (base + l) * step, 380)
      if (p <= 0) break
      drum(ctx, a, o, sp[0], sp[1], 0.34, 0.19, { z: 0.07 + l * 0.2 + (1 - easeOut(p)) * 1.6, alpha: Math.min(1, p * 3), lit: 0.95 })
    }
  }
  SPOTS_A.forEach((sp, i) => stackAt(sp, i * 5, tA))
  // a forklift working the aisle, carrying one more coil
  const fy = 1.4 + 1.6 * Math.sin(ls * 0.0007), fx = 4.95
  box(ctx, a, o, fx, fy - 0.35, 0.6, 0.7, 0.5, { lit: 0.7 })
  box(ctx, a, o, fx + 0.1, fy - 0.3, 0.4, 0.6, 0.35, { z: 0.5, lit: 0.6 })
  box(ctx, a, o, fx + 0.62, fy - 0.3, 0.06, 0.6, 1.1, { lit: 0.5 })
  drum(ctx, a, o, fx + 0.6 + 0.0, fy, 0.28, 0.17, { z: 0.35 + 0.1 * Math.sin(ls * 0.0021), lit: 0.8 })
  SPOTS_B.forEach((sp, i) => stackAt(sp, i * 5, tB))
  vignette(ctx, a, W * 0.45, H * 0.45, Math.max(W, H) * 0.75, 0.65)

  // the figures, landing on the voice
  const cw = (tall ? 0.44 : 0.26) * W, aX = tall ? W * 0.04 : W * 0.04, aY = H * (tall ? 0.135 : 0.12)
  const aAt = P(2.2, 1.2, 1.15)
  leader(ctx, a, aAt, [aX + cw * 0.6, aY + 78 * KF], prog(ls, c0 + 1400, 500), true)
  card(ctx, a, aX, aY, cw, 78 * KF, prog(ls, c0 + 1400, 500), (t) => {
    text(ctx, bn(a, 5.48, 1, 2), aX + 12 * KF, t + 46 * KF, { size: (tall ? 32 : 42) * KF, color: red(a, 0.97), maxWidth: cw - 20 * KF })
    mono(ctx, a, 'PV METALS + OMEGA', aX + 12 * KF, t + 66 * KF, 10, ink(a, 0.9), { maxWidth: cw - 24 * KF })
  }, { accent: true })
  const sx = tall ? W * 0.52 : W * 0.7, sy = H * (tall ? 0.135 : 0.12), sw = (tall ? 0.44 : 0.27) * W
  card(ctx, a, sx, sy, sw, 92 * KF, prog(ls, c1, 600), (t) => {
    text(ctx, `${count(64.9, 1, 1, a.lang)}%`, sx + 12 * KF, t + 44 * KF, { size: (tall ? 30 : 38) * KF, color: red(a, 0.97) })
    mono(ctx, a, L(a, '≈ TWO THIRDS · COIN SHEET', '≈ DOS TERCIOS · LÁMINA'), sx + 12 * KF, t + 62 * KF, 10, ink(a, 0.9), { maxWidth: sw - 24 * KF })
    const n = Math.round(65 * easeOut(prog(ls, c1 + 200, 1200))), bw = (sw - 24 * KF) / 50
    for (let i = 0; i < 100; i++) { ctx.fillStyle = i < n ? red(a, 0.9) : ink(a, 0.16); ctx.fillRect(sx + 12 * KF + (i % 50) * bw, t + (70 + (i < 50 ? 0 : 8)) * KF, bw - 1.2 * KF, 6 * KF) }
  })
  const bX = tall ? W * 0.52 : W * 0.7, bY = H * (tall ? 0.6 : 0.47)
  const bAt = P(7.2, 1.2, 1.15)
  leader(ctx, a, bAt, [bX, bY + 30 * KF], prog(ls, tB, 600))
  card(ctx, a, bX, bY, sw, 78 * KF, prog(ls, tB, 600), (t) => {
    text(ctx, bn(a, 2.96, 1, 2), bX + 12 * KF, t + 44 * KF, { size: (tall ? 30 : 38) * KF, color: ink(a, 0.96), maxWidth: sw - 20 * KF })
    mono(ctx, a, L(a, 'THE ONLY OTHER SUPPLIER', 'EL ÚNICO OTRO PROVEEDOR'), bX + 12 * KF, t + 60 * KF, 10, dim(a, 0.95), { maxWidth: sw - 24 * KF })
    mono(ctx, a, 'NACIONAL DE COBRE', bX + 12 * KF, t + 72 * KF, 10, ink(a, 0.85), { maxWidth: sw - 24 * KF })
  })
}

// ── 5 · WHAT THE RECORD SUPPORTS — a balance on a desk that settles level ──────────────────────
const fair: SceneFn = (ctx, a) => {
  const { ls, W, H, KF } = a
  const tall = isTall(a), c0 = cue(a, 0), c1 = cue(a, 1), c2 = cue(a, 2)
  const u = tall ? W * 0.075 : Math.min(W * 0.058, H * 0.1)
  const o: Iso = { ox: W * 0.5 + pan(a, 0.04), oy: H * (tall ? 0.54 : 0.54), u }
  const oT = onTop(o, 1.1), build = easeOut(prog(ls, c0, 900))

  isoFloor(ctx, a, o, 8, 0.06)
  pool(ctx, a, o, -1.5, 1.5, 3.2, 0.1); pool(ctx, a, o, 1.5, -1.5, 3.2, 0.1)
  box(ctx, a, o, -3, -1.6, 6, 3.2, 1.1 * build, { lit: 0.6 })
  // two equal lamps: even-handed light
  const lA = isoPt(oT, -1.2, 1.2), lB = isoPt(oT, 1.2, -1.2)
  lamp(ctx, a, lA[0], H * 0.06, lA[1], W * 0.11, 0.07); lamp(ctx, a, lB[0], H * 0.06, lB[1], W * 0.11, 0.07)
  if (build < 0.98) return
  pool(ctx, a, oT, 0, 0, 2.6, 0.16)
  // papers on the desk, the order book under the scale
  flat(ctx, oT, -2.6, 0.4, 1.3, 0.9, 0.001, ink(a, 0.2), ink(a, 0.35))
  flat(ctx, oT, 1.4, -1.3, 1.1, 0.8, 0.001, ink(a, 0.16), ink(a, 0.3))
  box(ctx, a, oT, -0.55, -0.55, 1.1, 1.1, 0.16, { lit: 0.85 })
  // the balance: settling from a tilt to level by the time the voice says "matched"
  const base = isoPt(oT, 0, 0, 0.16), colH = (tall ? 0.2 : 0.21) * H
  const piv: Pt = [base[0], base[1] - colH]
  const env = 1 - clamp01((ls - c0) / Math.max(1, c2 + 600 - c0))
  const ang = 0.22 * env * Math.cos((ls - c0) / 520) + 0.006 * Math.sin(ls * 0.0013)
  ctx.fillStyle = ink(a, 0.55); ctx.fillRect(piv[0] - 3 * KF, piv[1], 6 * KF, colH)
  ctx.fillStyle = ink(a, 0.85); ctx.beginPath(); ctx.moveTo(piv[0], piv[1] - 10 * KF); ctx.lineTo(piv[0] - 7 * KF, piv[1] + 4 * KF); ctx.lineTo(piv[0] + 7 * KF, piv[1] + 4 * KF); ctx.fill()
  const half = W * (tall ? 0.3 : 0.17), ex = Math.cos(ang) * half, ey = Math.sin(ang) * half
  ctx.strokeStyle = ink(a, 0.9); ctx.lineWidth = 4 * KF; ctx.beginPath(); ctx.moveTo(piv[0] - ex, piv[1] - ey); ctx.lineTo(piv[0] + ex, piv[1] + ey); ctx.stroke()
  const hang = H * 0.13, pw = W * (tall ? 0.12 : 0.075), uc = u * 0.9
  const pans: Pt[] = []
  for (const sgn of [-1, 1]) {
    const tx = piv[0] + sgn * ex, ty = piv[1] + sgn * ey, py = ty + hang
    ctx.strokeStyle = ink(a, 0.5); ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx - pw, py); ctx.moveTo(tx, ty); ctx.lineTo(tx + pw, py); ctx.stroke()
    // a coil sits in each pan
    drum(ctx, a, { ox: tx, oy: py - 2 * KF, u: uc }, 0, 0, 0.75, 0.55, { lit: 1 })
    ctx.beginPath(); ctx.ellipse(tx, py, pw, pw * 0.3, 0, 0, Math.PI); ctx.fillStyle = ink(a, 0.5); ctx.fill()
    ctx.beginPath(); ctx.ellipse(tx, py, pw, pw * 0.3, 0, 0, TAU); ctx.strokeStyle = ink(a, 0.8); ctx.lineWidth = 1.4 * KF; ctx.stroke()
    pans.push([tx, py])
  }
  vignette(ctx, a, W * 0.5, H * 0.42, Math.max(W, H) * 0.72, 0.6)

  // the two prices, on "matched"
  const tw = (tall ? 0.42 : 0.22) * W, th = 66 * KF, pP = prog(ls, c2 + 300, 700)
  const tLx = tall ? W * 0.04 : Math.max(W * 0.03, pans[0][0] - pw - tw - 18 * KF), tY = tall ? H * 0.135 : pans[0][1] - th / 2
  card(ctx, a, tLx, tY, tw, th, pP, (t) => {
    text(ctx, '10.5–11.4', tLx + 12 * KF, t + 34 * KF, { size: 26 * KF, color: ink(a, 0.97), maxWidth: tw - 24 * KF })
    mono(ctx, a, L(a, 'USD/KG · THE GROUP', 'USD/KG · EL GRUPO'), tLx + 12 * KF, t + 54 * KF, 10, dim(a, 0.95), { maxWidth: tw - 24 * KF })
  })
  const tRx = tall ? W * 0.54 : Math.min(W * 0.97 - tw, pans[1][0] + pw + 18 * KF)
  card(ctx, a, tRx, tY, tw, th, prog(ls, c2 + 600, 700), (t) => {
    text(ctx, '10.8', tRx + 12 * KF, t + 34 * KF, { size: 26 * KF, color: ink(a, 0.97) })
    mono(ctx, a, L(a, 'USD/KG · COMPETITOR', 'USD/KG · COMPETIDOR'), tRx + 12 * KF, t + 54 * KF, 10, dim(a, 0.95), { maxWidth: tw - 24 * KF })
  })
  if (pP > 0) mono(ctx, a, L(a, 'LARGE ORDERS', 'PEDIDOS GRANDES'), tLx + 2 * KF, tY + th + 16 * KF, 10, dim(a, 0.95 * pP))
  // few makers: a certificate with a seal, pinned to the front of the desk
  const fw = (tall ? 0.5 : 0.25) * W, fh = 56 * KF, fx = tall ? W * 0.25 : W * 0.71, fy = H * (tall ? 0.62 : 0.6)
  const at = isoPt(oT, 1.9, -0.9)
  leader(ctx, a, at, [fx + fw * 0.3, fy], prog(ls, c1 + 200, 600))
  card(ctx, a, fx, fy, fw, fh, prog(ls, c1 + 200, 600), (t) => {
    const sxC = fx + 26 * KF, syC = t + fh / 2, rot = ls * 0.0004
    ctx.strokeStyle = ink(a, 0.8); ctx.lineWidth = 1.4 * KF
    ctx.beginPath(); for (let i = 0; i <= 24; i++) { const r = (i % 2 ? 11 : 14) * KF, th2 = rot + (i / 24) * TAU; const px = sxC + Math.cos(th2) * r, py = syC + Math.sin(th2) * r; if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py) } ctx.stroke()
    text(ctx, L(a, 'Few makers', 'Pocos fabricantes'), fx + 50 * KF, t + 26 * KF, { size: 18 * KF, color: ink(a, 0.96), maxWidth: fw - 60 * KF })
    mono(ctx, a, L(a, 'CERTIFIED COIN STRIP', 'LÁMINA CERTIFICADA'), fx + 50 * KF, t + 43 * KF, 10, dim(a, 0.95), { maxWidth: fw - 60 * KF })
  })
}

// ── 6 · ONE ORDER STANDS OUT — two invoices under the lamp, and the lots beside them ───────────
const gap: SceneFn = (ctx, a) => {
  const { ls, W, H, KF } = a
  const tall = isTall(a), c0 = cue(a, 0), c1 = cue(a, 1), c2 = cue(a, 2), c3 = cue(a, 3), c4 = cue(a, 4)
  const u = tall ? W * 0.068 : Math.min(W * 0.055, H * 0.095)
  const o: Iso = { ox: W * 0.5 - pan(a, 0.05), oy: H * (tall ? 0.5 : 0.47), u }
  const oT = onTop(o, 0.9), build = easeOut(prog(ls, c0, 800))

  isoFloor(ctx, a, o, 9, 0.05)
  box(ctx, a, o, -3.4, -2.2, 6.8, 4.4, 0.9 * build, { lit: 0.55 })
  const lc = isoPt(oT, 0, 0)
  lamp(ctx, a, lc[0], H * 0.04, lc[1], W * 0.2, 0.09)
  if (build < 0.98) return
  pool(ctx, a, oT, 0, 0, 3.2, 0.2)
  // the two invoices lying on the desk
  const slideA = easeOut(prog(ls, c0 + 300, 800)), slideB = easeOut(prog(ls, c2, 800))
  flat(ctx, oT, -2.9, -1.9 + (1 - slideA) * -1, 1.5, 2.0, 0.002, ink(a, 0.22 * slideA), red(a, 0.6 * slideA))
  if (slideB > 0) flat(ctx, oT, 1.5 + (1 - slideB) * 1, -1.9, 1.5, 2.0, 0.002, ink(a, 0.22 * slideB), ink(a, 0.5 * slideB))
  // the lots, to scale: one coil per 22.6 t — the small order is one coil, the large one 18.6
  const grow = (i: number) => easeBack(prog(ls, c3 + i * 70, 450))
  drum(ctx, a, oT, -2.2, 1.3, 0.38, 0.24 * grow(0), { lit: 1, accent: false })
  const big = 421 / 22.6
  for (let i = 0; i < 19; i++) {
    const sx = Math.floor(i / 5), lv = i % 5, frac = Math.min(1, big - i)
    if (frac <= 0) break
    const gx = 1.4 + (sx % 2) * 0.8, gy = 0.7 + Math.floor(sx / 2) * 0.8
    drum(ctx, a, oT, gx, gy, 0.36, 0.2 * frac * grow(i + 1), { z: lv * 0.21, lit: 0.95 })
  }
  vignette(ctx, a, W * 0.5, H * 0.42, Math.max(W, H) * 0.7, 0.72)

  // the invoice cards, with their prices landing on cue
  const iw = (tall ? 0.43 : 0.26) * W, ih = 104 * KF, iy = H * (tall ? 0.135 : 0.12)
  const ax = W * (tall ? 0.04 : 0.05), bx = W * (tall ? 0.53 : 0.69)
  const invoice = (x: number, p: number, who: string, when: string, price: string, pp: number, acc: boolean, at: Pt) => {
    leader(ctx, a, at, [x + iw * 0.5, iy + ih], p, acc)
    card(ctx, a, x, iy, iw, ih, p, (t) => {
      mono(ctx, a, L(a, `INVOICE · ${when}`, `FACTURA · ${when}`), x + 12 * KF, t + 18 * KF, 10, dim(a, 0.95), { maxWidth: iw - 24 * KF })
      text(ctx, who, x + 12 * KF, t + 40 * KF, { size: 17 * KF, color: ink(a, 0.95), maxWidth: iw - 24 * KF })
      const s = lerp(1.6, 1, easeOut(pp))
      ctx.save(); ctx.translate(x + 12 * KF, t + 82 * KF); ctx.scale(s, s)
      text(ctx, price, 0, 0, { size: (tall ? 30 : 38) * KF, color: acc ? red(a, 0.97) : ink(a, 0.97), alpha: Math.min(1, pp * 2) })
      ctx.restore()
      mono(ctx, a, L(a, 'USD/KG · ALPACA', 'USD/KG · ALPACA'), x + 12 * KF, t + 97 * KF, 10, dim(a, 0.95 * Math.min(1, pp * 2)), { maxWidth: iw - 24 * KF })
    }, { accent: acc && pp > 0.5 })
  }
  invoice(ax, prog(ls, c0 + 500, 600), 'Omega Aleaciones', L(a, 'AUG 2022', 'AGO 2022'), '30.7', prog(ls, c1 + 400, 500), true, isoPt(oT, -2.1, -0.9, 0))
  invoice(bx, prog(ls, c2 + 100, 600), 'PV Metals LLC', 'SEP 2022', '11.4', prog(ls, c2 + 900, 500), false, isoPt(oT, 2.3, -0.9, 0))
  // the calendar strip between them: three weeks pass
  const pc = prog(ls, c2, 600)
  if (pc > 0 && !tall) {
    const cx0 = ax + iw + 16 * KF, cx1 = bx - 16 * KF, cy = iy + 30 * KF, cw = cx1 - cx0
    ctx.save(); ctx.globalAlpha *= pc
    for (let d = 0; d < 42; d++) { ctx.fillStyle = d < 21 ? ink(a, 0.14) : ink(a, 0.24); ctx.fillRect(cx0 + (d * cw) / 42, cy, cw / 42 - 1.5 * KF, 12 * KF) }
    mono(ctx, a, L(a, 'AUG', 'AGO'), cx0, cy - 6 * KF, 10, dim(a, 0.95)); mono(ctx, a, 'SEP', cx0 + cw / 2, cy - 6 * KF, 10, dim(a, 0.95))
    const mk = easeInOut(prog(ls, c2 + 400, 1600)), d0 = 12, x0 = cx0 + (d0 * cw) / 42, x1 = cx0 + ((d0 + 21 * mk) * cw) / 42
    ctx.fillStyle = ink(a, 0.85); ctx.fillRect(x0, cy + 16 * KF, x1 - x0, 2 * KF)
    ctx.beginPath(); ctx.arc(x1, cy + 17 * KF, 3.5 * KF, 0, TAU); ctx.fill()
    mono(ctx, a, L(a, '+3 WEEKS', '+3 SEMANAS'), (x0 + x1) / 2, cy + 34 * KF, 10, ink(a, 0.9 * mk), { align: 'center' })
    ctx.restore()
  }
  // the lot labels
  const pl = prog(ls, c3 + 300, 600)
  if (pl > 0) {
    const l1 = isoPt(oT, -2.2, 1.3, 0.5), l2 = isoPt(oT, 1.8, 1.1, 1.3)
    text(ctx, '22.6 t', l1[0], tall ? l1[1] + 40 * KF : l1[1] - 8 * KF, { size: 22 * KF, color: ink(a, 0.97), align: 'center', alpha: pl })
    text(ctx, '421 t', l2[0], l2[1] - 8 * KF, { size: 30 * KF, color: ink(a, 0.97), align: 'center', alpha: pl })
    const sc = tall ? isoPt(oT, 2.9, 2.2, 0) : isoPt(oT, 0.2, 2.6, 0)
    mono(ctx, a, L(a, 'ONE COIL = 22.6 t', 'UN ROLLO = 22.6 t'), sc[0], Math.min(sc[1], H * 0.73), 10, dim(a, 0.9 * pl), { align: 'center' })
  }
  // and what the record does not say
  const pr = prog(ls, c4 + 200, 700)
  if (pr > 0) {
    const nw = (tall ? 0.5 : 0.24) * W, nx = tall ? W * 0.25 : W * 0.69, ny = H * (tall ? 0.64 : 0.47)
    card(ctx, a, nx, ny, nw, 46 * KF, pr, (t) => {
      mono(ctx, a, L(a, 'EXPLANATION IN THE RECORD', 'EXPLICACIÓN EN EL REGISTRO'), nx + 12 * KF, t + 17 * KF, 10, dim(a, 0.95), { maxWidth: nw - 24 * KF })
      ctx.strokeStyle = ink(a, 0.5); ctx.setLineDash([4 * KF, 4 * KF]); ctx.strokeRect(nx + 12 * KF, t + 24 * KF, nw - 24 * KF, 12 * KF); ctx.setLineDash([])
      if (blinkOn(ls)) { ctx.fillStyle = ink(a, 0.9); ctx.fillRect(nx + 16 * KF, t + 26 * KF, 2 * KF, 8 * KF) }
    })
  }
}

// ── 7 · THE MISSING YEAR — a shelf of year binders with one slot empty; the mint's own ledger ──
const missing: SceneFn = (ctx, a) => {
  const { ls, W, H, KF } = a
  const tall = isTall(a), c0 = cue(a, 0), c1 = cue(a, 1), c2 = cue(a, 2), c3 = cue(a, 3), c4 = cue(a, 4)
  const u = tall ? W * 0.055 : Math.min(W * 0.056, H * 0.1)
  const o: Iso = { ox: W * (tall ? 0.22 : 0.14) + pan(a, 0.05), oy: H * (tall ? 0.3 : 0.27), u }
  const oT = onTop(o, 0.5)
  isoFloor(ctx, a, o, 9, 0.05)
  pool(ctx, a, o, 4, 0.5, 3.4, 0.14)
  box(ctx, a, o, -0.2, -0.2, 7.4, 1.3, 0.5, { lit: 0.6 })
  const years = [2019, 2020, 2021, 2022, 2023, 2024, 2025], dust = 0.5 + 0.5 * Math.sin(ls * 0.004)
  for (let i = 0; i < 7; i++) {
    const x = 0.1 + i * 1.0, p = easeBack(prog(ls, c0 + i * 110, 500))
    if (years[i] === 2023) { // the empty slot: a dust outline on the shelf
      ctx.lineWidth = Math.max(1, 1.4 * KF); ctx.setLineDash([4 * KF, 3 * KF])
      flat(ctx, oT, x, 0, 0.75, 0.9, 0.001, red(a, 0.06 + 0.06 * dust), red(a, (0.5 + 0.4 * dust) * prog(ls, c0 + 800, 500)))
      ctx.setLineDash([]); ctx.lineWidth = 1
      continue
    }
    box(ctx, a, oT, x, 0, 0.75, 0.9, 1.7 * p, { lit: 0.75 + 0.05 * (i % 2) })
    if (p > 0.6) { const c = isoPt(oT, x + 0.37, 0.9, 0.85); mono(ctx, a, `${years[i]}`, c[0], c[1], 10, `rgba(0,0,0,0.85)`, { align: 'center', weight: 700 }) }
  }
  // dust motes in the light over the empty slot
  for (let i = 0; i < 9; i++) { const m = isoPt(oT, 4.3 + rnd(i) * 0.6, 0.2 + rnd(i + 7) * 0.6, ((ls * 0.0002 + rnd(i + 3)) % 1) * 2); ctx.fillStyle = ink(a, 0.35 * prog(ls, c0 + 800, 500)); ctx.fillRect(m[0], m[1], 1.6 * KF, 1.6 * KF) }
  const fr = isoPt(o, 3.5, 1.1, 0.22)
  mono(ctx, a, L(a, 'FEDERAL RECORD', 'REGISTRO FEDERAL'), fr[0], fr[1], 10, `rgba(0,0,0,0.8)`, { align: 'center', weight: 700 })
  vignette(ctx, a, W * 0.45, H * 0.42, Math.max(W, H) * 0.72, 0.68)
  const slot = isoPt(oT, 4.47, 0.45, 0.4)
  const pS = prog(ls, c0 + 900, 600)
  if (pS > 0) {
    const lx = tall ? W * 0.05 : slot[0] - 40 * KF, ly = tall ? H * 0.16 : H * 0.12
    leader(ctx, a, slot, [lx + 30 * KF, ly + 6 * KF], pS, true)
    text(ctx, '2023', lx, ly, { size: 26 * KF, color: red(a, 0.95), alpha: pS })
    mono(ctx, a, L(a, 'NOT IN THE FEDERAL RECORD', 'NO ESTÁ EN EL REGISTRO FEDERAL'), lx + 70 * KF, ly - 3 * KF, 10, red(a, 0.9 * pS))
  }

  // the ledger: the mint's own order book opening beside the shelf
  const open = easeInOut(prog(ls, c1, 900))
  if (open <= 0) return
  const lw = W * (tall ? 0.9 : 0.44), lh = (tall ? 118 : 200) * KF, lx = tall ? W * 0.05 : W * 0.53, ly = H * (tall ? 0.48 : 0.2)
  const half = lw / 2, sp = lx + half
  ctx.save(); ctx.globalAlpha *= Math.min(1, open * 2)
  ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(lx + 8 * KF, ly + 10 * KF, lw, lh)
  ctx.fillStyle = a.pal.bg; ctx.fillRect(lx, ly, half, lh); ctx.fillStyle = ink(a, 0.1); ctx.fillRect(lx, ly, half, lh)
  const rw = half * open
  ctx.fillStyle = a.pal.bg; ctx.fillRect(sp, ly, rw, lh); ctx.fillStyle = ink(a, 0.08); ctx.fillRect(sp, ly, rw, lh)
  ctx.strokeStyle = ink(a, 0.5); ctx.lineWidth = 1; ctx.strokeRect(lx, ly, half + rw, lh)
  ctx.fillStyle = ink(a, 0.3); ctx.fillRect(sp - 1, ly, 2, lh)
  // left page: the header and rows being entered
  mono(ctx, a, L(a, 'CASA DE MONEDA', 'CASA DE MONEDA'), lx + 12 * KF, ly + 20 * KF, 10, ink(a, 0.9), { maxWidth: half - 24 * KF })
  mono(ctx, a, L(a, 'ORDERS 2023 · COIN SHEET', 'PEDIDOS 2023 · LÁMINA'), lx + 12 * KF, ly + 34 * KF, 10, dim(a, 0.95), { maxWidth: half - 24 * KF })
  const rows = Math.floor(8 * prog(ls, c1 + 400, 2000))
  for (let i = 0; i < 8; i++) {
    if (i >= rows) break
    const ry = ly + (48 + i * (tall ? 7 : 10)) * KF
    ctx.fillStyle = ink(a, 0.2); ctx.fillRect(lx + 12 * KF, ry, (half - 60 * KF) * (0.4 + 0.5 * rnd(i + 40)), 2 * KF)
    ctx.fillStyle = prog(ls, c2, 400) > 0 ? red(a, 0.7) : ink(a, 0.3); ctx.fillRect(lx + half - 40 * KF, ry - 2 * KF, 24 * KF, 5 * KF)
  }
  const pT = prog(ls, c1 + 600, 500)
  text(ctx, bn(a, 4.6, pT, 1), lx + 12 * KF, ly + lh - 28 * KF, { size: (tall ? 30 : 40) * KF, color: ink(a, 0.97), maxWidth: half - 20 * KF })
  mono(ctx, a, L(a, 'ALL DIRECT AWARDS', 'TODO ADJ. DIRECTA'), lx + 12 * KF, ly + lh - 10 * KF, 10, red(a, 0.95 * prog(ls, c2, 500)), { maxWidth: half - 20 * KF })
  // right page: Omega's share as a bar of the whole
  if (open > 0.95) {
    const rx = sp + 12 * KF, iw = half - 24 * KF, pO = prog(ls, c3, 600), pN = prog(ls, c4, 500)
    mono(ctx, a, L(a, 'LARGEST SHARE', 'MAYOR PARTE'), rx, ly + 20 * KF, 10, dim(a, 0.95 * pO), { maxWidth: iw })
    text(ctx, 'Omega Aleaciones', rx, ly + (tall ? 38 : 44) * KF, { size: 17 * KF, color: ink(a, 0.95), alpha: pO, maxWidth: iw })
    ctx.fillStyle = ink(a, 0.14 * pO); ctx.fillRect(rx, ly + (tall ? 46 : 58) * KF, iw, (tall ? 8 : 14) * KF)
    ctx.fillStyle = red(a, 0.9); ctx.fillRect(rx, ly + (tall ? 46 : 58) * KF, iw * (2.6 / 4.6) * easeOut(pN), (tall ? 8 : 14) * KF)
    text(ctx, bn(a, 2.6, pN, 1), rx, ly + lh - 28 * KF, { size: (tall ? 30 : 40) * KF, color: red(a, 0.97), alpha: Math.min(1, pN * 3), maxWidth: iw })
    mono(ctx, a, L(a, 'OF 4.6B', 'DE 4,600 MDP'), rx, ly + lh - 10 * KF, 10, dim(a, 0.95 * pN), { maxWidth: iw })
  }
  ctx.restore()
}

// ── 8 · STILL TWO — a public search terminal; behind it, the thread nobody can see ─────────────
const end: SceneFn = (ctx, a) => {
  const { ls, W, H, KF } = a
  const tall = isTall(a), c0 = cue(a, 0), c1 = cue(a, 1), c2 = cue(a, 2), c3 = cue(a, 3)
  // behind: the two warehouses on their own floor, joined by the red thread
  const uB = tall ? W * 0.07 : Math.min(W * 0.068, H * 0.12)
  const back = (x: number): Iso => ({ ox: x - pan(a, 0.03), oy: H * (tall ? 0.2 : 0.27), u: uB })
  const wA = back(W * (tall ? 0.2 : 0.36)), wB = back(W * (tall ? 0.8 : 0.88))
  const fb = lerp(0.5, 0.8, easeOut(prog(ls, c1, 700)))
  pool(ctx, a, wA, 0, 0, 1.6, 0.1); pool(ctx, a, wB, 0, 0, 1.6, 0.1)
  warehouse(ctx, a, wA, -0.6, -0.45, 1.2, 0.9, 0.7, { lit: fb })
  warehouse(ctx, a, wB, -0.6, -0.45, 1.2, 0.9, 0.7, { lit: fb })
  const pA = isoPt(wA, 0, 0, 1.1), pB = isoPt(wB, 0, 0, 1.1)
  thread(ctx, a, pA, pB, easeInOut(prog(ls, c0, 1200)), 0.75, 0.55 + 0.25 * prog(ls, c1, 600) + 0.1 * Math.sin(ls * 0.003), 2.2)
  mono(ctx, a, 'PV METALS', pA[0], pA[1] - 18 * KF, 10, ink(a, 0.7 * prog(ls, c0 + 300, 600)), { align: 'center' })
  mono(ctx, a, 'OMEGA', pB[0], pB[1] - 18 * KF, 10, ink(a, 0.7 * prog(ls, c0 + 300, 600)), { align: 'center' })

  // the kiosk, large, and a member of the public walking up to it
  const u = tall ? W * 0.075 : Math.min(W * 0.085, H * 0.15)
  const o: Iso = { ox: W * (tall ? 0.17 : 0.16) + pan(a, 0.06), oy: H * (tall ? 0.66 : 0.62), u }
  const on = easeOut(prog(ls, c0 + 200, 700))
  isoFloor(ctx, a, o, 6, 0.07)
  pool(ctx, a, o, 0.4, 1.2, 2.4, 0.1 + 0.14 * on)
  box(ctx, a, o, -0.5, -0.4, 1.0, 0.8, 1.9, { lit: 0.6 })
  const sc = [isoPt(o, -0.4, 0.4, 1.15), isoPt(o, 0.4, 0.4, 1.15), isoPt(o, 0.4, 0.4, 1.75), isoPt(o, -0.4, 0.4, 1.75)] as Pt[]
  poly(ctx, sc, ink(a, 0.15 + 0.6 * on), ink(a, 0.7))
  const walk = easeInOut(prog(ls, c2 - 200, 1600)), bob = walk > 0 && walk < 1 ? Math.abs(Math.sin(ls * 0.012)) * 0.05 : 0
  figure(ctx, a, { ...o, oy: o.oy - bob * u }, lerp(-0.45, 0.15, walk), lerp(1.0, 1.1, walk), { h: 1.05 })
  vignette(ctx, a, W * 0.55, H * 0.45, Math.max(W, H) * 0.8, 0.55)

  // the screen, enlarged: the hero
  const sx = W * (tall ? 0.29 : 0.33), sy = H * (tall ? 0.3 : 0.32), sw = W * (tall ? 0.68 : 0.63), sh = (tall ? 186 : 196) * KF
  const pS = prog(ls, c0 + 300, 600), scr = isoPt(o, 0.4, 0.4, 1.45)
  leader(ctx, a, scr, [sx, sy + sh * 0.55], pS)
  card(ctx, a, sx, sy, sw, sh, pS, (t) => {
    mono(ctx, a, L(a, 'PUBLIC PROCUREMENT RECORD · SEARCH', 'REGISTRO PÚBLICO DE COMPRAS · BÚSQUEDA'), sx + 14 * KF, t + 18 * KF, 10, dim(a, 0.95), { maxWidth: sw - 28 * KF })
    ctx.strokeStyle = ink(a, 0.55); ctx.lineWidth = 1; ctx.strokeRect(sx + 14 * KF, t + 28 * KF, sw - 28 * KF, 28 * KF)
    const q = L(a, 'MINT · COIN SHEET', 'CASA DE MONEDA · LÁMINA'), qp = prog(ls, c3 - 900, 1100), qs = typeOn(q, qp)
    mono(ctx, a, qs, sx + 24 * KF, t + 47 * KF, 13, ink(a, 0.95))
    if (blinkOn(ls) && qp < 1) { ctx.save(); ctx.font = `500 ${13 * KF}px "JetBrains Mono", monospace`; const cw = ctx.measureText(qs).width + qs.length * 1.56 * KF; ctx.restore(); ctx.fillStyle = ink(a, 0.9); ctx.fillRect(sx + 26 * KF + cw, t + 35 * KF, 2 * KF, 15 * KF) }
    const rowH = (tall ? 46 : 54) * KF, gapR = 14 * KF
    const res = (i: number, name: string) => {
      const p = prog(ls, c3 + 200 + i * 350, 500)
      // the rows lean toward each other, then spring back apart
      const pull = Math.max(0, Math.sin(ls * 0.0018)) * 5 * KF * (i ? -1 : 1) * p
      const ry = t + 68 * KF + i * (rowH + gapR) + pull
      ctx.fillStyle = ink(a, 0.05 + 0.03 * p); ctx.fillRect(sx + 14 * KF, ry, sw - 28 * KF, rowH)
      if (p <= 0) { // still searching: skeleton lines pulse
        ctx.fillStyle = ink(a, 0.08 + 0.05 * Math.sin(ls * 0.006 + i)); ctx.fillRect(sx + 26 * KF, ry + 14 * KF, sw * 0.35, 8 * KF); ctx.fillRect(sx + 26 * KF, ry + 30 * KF, sw * 0.22, 6 * KF)
        return
      }
      ctx.save(); ctx.globalAlpha *= p
      text(ctx, name, sx + 26 * KF, ry + rowH * 0.45, { size: (tall ? 18 : 22) * KF, color: ink(a, 0.97), maxWidth: sw * 0.6 })
      mono(ctx, a, L(a, 'NO RELATION ON RECORD', 'SIN RELACIÓN REGISTRADA'), sx + 26 * KF, ry + rowH * 0.8, 11, red(a, 0.97), { maxWidth: sw - 52 * KF })
      ctx.restore()
    }
    res(0, 'PV METALS LLC'); res(1, 'OMEGA ALEACIONES')
  })
}

export const scenes: Record<string, SceneFn> = { coin, direct, two, one, share, fair, gap, missing, end }
