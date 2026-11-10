/**
 * «Dos días / Two Days» — an original RUBLI finding, told as a procedural at a desk and a clinic
 * lab bench. Fern direction: every shot is a small isometric set under one light, the camera
 * drifting across it, evidence floating above on flat cards. One draw function per beat, keyed by
 * the beat's `scene` in story-films.json; see filmKit.ts for the contract.
 * The only company named is VAYAM Medical — no brand, no person, no tax ID, no logo.
 */
import {
  type Iso, type Pt, type SceneArgs, type SceneFn, L, clamp01, count, cue, dim, easeBack, easeInOut, easeOut, figure, ink,
  isoBox, isoFloor, isoPt, lamp, lerp, pool, prog, red, rnd, stamp, text, trace, typeOn,
} from '@/components/gallery/filmKit'

type C = CanvasRenderingContext2D
type V3 = [number, number, number]
const TAU = Math.PI * 2
const SERIF = '"Playfair Display", Georgia, serif'
const MONO = '"JetBrains Mono", ui-monospace, monospace'
const isTall = (a: SceneArgs) => a.H > a.W * 0.9
const X: V3 = [1, 0, 0], Y: V3 = [0, 1, 0], DOWN: V3 = [0, 0, -1]

function mono(ctx: C, a: SceneArgs, s: string, x: number, y: number, size: number, color: string,
  o: { align?: CanvasTextAlign; alpha?: number; baseline?: CanvasTextBaseline; weight?: number; maxWidth?: number } = {}) {
  text(ctx, s, x, y, { size: size * a.KF, font: 'mono', color, tracking: size * 0.12 * a.KF, ...o })
}
function serifW(ctx: C, s: string, px: number) {
  ctx.save(); ctx.font = `600 ${px}px ${SERIF}`; const w = ctx.measureText(s).width; ctx.restore(); return w
}
function monoW(ctx: C, a: SceneArgs, s: string, size: number) {
  ctx.save(); ctx.font = `500 ${size * a.KF}px ${MONO}`; const w = ctx.measureText(s).width + s.length * size * 0.12 * a.KF; ctx.restore(); return w
}
/** a money figure in the house convention: "4,928M MXN" / "4,928 MDP" (millions of pesos). */
const mdp = (a: SceneArgs, n: number, p: number) => count(n, p, 0, a.lang) + L(a, 'M MXN', ' MDP')

/** one world unit in px — sets are sized to the stage, so phone and desktop frame alike. */
const U = (a: SceneArgs, k = 1) => Math.min(a.W * 0.06, a.H * 0.088) * k

/** the camera: the set's origin drifts across the shot while the world holds still. */
function rig(a: SceneArgs, cx: number, cy: number, u: number, pan = 0.04, rise = 0): Iso {
  const e = easeInOut(clamp01(a.ls / Math.max(1, a.dur)))
  return { ox: a.W * (cx + pan * (0.5 - e)), oy: a.H * (cy + rise * (0.5 - e)), u }
}

/** darkness closing in from the edges: the set sits in a black room. */
function vignette(ctx: C, a: SceneArgs, s = 0.72) {
  const { W, H } = a
  const g = ctx.createRadialGradient(W / 2, H * 0.44, Math.min(W, H) * 0.3, W / 2, H * 0.44, Math.hypot(W, H) * 0.62)
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${s})`)
  ctx.fillStyle = g; ctx.fillRect(-W * 0.1, -H * 0.1, W * 1.2, H * 1.2)
}

/** dust hanging in the lamp light. */
function motes(ctx: C, a: SceneArgs, cx: number, cy: number, rw: number, rh: number, n = 22) {
  for (let i = 0; i < n; i++) {
    const t = (rnd(i + 50) + a.ls * 0.000028 * (0.4 + rnd(i + 9))) % 1
    const x = cx + (rnd(i) - 0.5) * rw + Math.sin(a.ls * 0.0005 + i * 2.1) * rw * 0.04
    const s = (0.8 + rnd(i + 3) * 1.3) * a.KF
    ctx.fillStyle = ink(a, 0.32 * Math.sin(Math.PI * t))
    ctx.fillRect(x, cy + (0.5 - t) * rh, s, s)
  }
}

/** the lamp itself: a shade hanging from the dark, the bulb glowing under it. */
function lampHead(ctx: C, a: SceneArgs, x: number, y: number, s: number, on: number) {
  ctx.strokeStyle = dim(a, 0.5); ctx.lineWidth = Math.max(1, a.KF)
  ctx.beginPath(); ctx.moveTo(x, y - s * 3); ctx.lineTo(x, y - s * 0.3); ctx.stroke()
  ctx.fillStyle = ink(a, 0.22); ctx.beginPath()
  ctx.moveTo(x - s * 0.25, y - s * 0.32); ctx.lineTo(x + s * 0.25, y - s * 0.32); ctx.lineTo(x + s * 0.6, y); ctx.lineTo(x - s * 0.6, y); ctx.closePath(); ctx.fill()
  const g = ctx.createRadialGradient(x, y, 0, x, y, s * 0.9)
  g.addColorStop(0, ink(a, 0.85 * on)); g.addColorStop(1, ink(a, 0))
  ctx.fillStyle = g; ctx.fillRect(x - s, y - s * 0.2, s * 2, s * 1.1)
}

/** draw in a world plane: local px run along world axes A and B (unit vectors) from world point p. */
function onPlane(ctx: C, o: Iso, p: V3, A: V3, B: V3, draw: () => void) {
  const k = 1 / o.u, p0 = isoPt(o, p[0], p[1], p[2])
  const pa = isoPt(o, p[0] + A[0] * k, p[1] + A[1] * k, p[2] + A[2] * k)
  const pb = isoPt(o, p[0] + B[0] * k, p[1] + B[1] * k, p[2] + B[2] * k)
  ctx.save(); ctx.transform(pa[0] - p0[0], pa[1] - p0[1], pb[0] - p0[0], pb[1] - p0[1], p0[0], p0[1]); draw(); ctx.restore()
}

/** a flat evidence card hanging over the set (shadow, paper, hairline frame). */
function card(ctx: C, a: SceneArgs, x: number, y: number, w: number, h: number, al = 1, accent = false) {
  if (al <= 0.01) return
  const KF = a.KF
  ctx.save(); ctx.globalAlpha *= al
  ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(x + 6 * KF, y + 9 * KF, w, h)
  ctx.fillStyle = a.pal.bg; ctx.fillRect(x, y, w, h)
  ctx.fillStyle = ink(a, 0.07); ctx.fillRect(x, y, w, h)
  ctx.strokeStyle = accent ? red(a, 0.9) : ink(a, 0.55); ctx.lineWidth = Math.max(1, 1.2 * KF); ctx.strokeRect(x, y, w, h)
  ctx.restore()
}
function leader(ctx: C, a: SceneArgs, from: Pt, to: Pt, p: number, col?: string) {
  if (p <= 0) return
  trace(ctx, [from, to], easeOut(p), { color: col ?? ink(a, 0.4), width: Math.max(1, a.KF) })
  ctx.fillStyle = col ?? ink(a, 0.85); ctx.beginPath(); ctx.arc(from[0], from[1], 2.6 * a.KF, 0, TAU); ctx.fill()
}
const bob = (a: SceneArgs, seed = 0) => Math.sin(a.ls * 0.0014 + seed) * 2.5 * a.KF

/** a lean box (three fills, no strokes) for sets with hundreds of pieces. */
function cube(ctx: C, o: Iso, x: number, y: number, z: number, w: number, d: number, h: number, top: string, left: string, right: string) {
  const P = (px: number, py: number, pz: number) => isoPt(o, px, py, pz)
  const f = (pts: Pt[], c: string) => { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < 4; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath(); ctx.fillStyle = c; ctx.fill() }
  f([P(x, y + d, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x, y + d, z + h)], left)
  f([P(x + w, y, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x + w, y, z + h)], right)
  f([P(x, y, z + h), P(x + w, y, z + h), P(x + w, y + d, z + h), P(x, y + d, z + h)], top)
}

/** a small iso analyser for icons: body, sample window, status light. */
function analyserIcon(ctx: C, a: SceneArgs, o: Iso, al: number, blinkOn: boolean) {
  isoBox(ctx, a, o, -0.9, -0.6, 1.8, 1.2, 1.3, { alpha: al })
  onPlane(ctx, o, [-0.9, 0.6, 1.3], X, DOWN, () => {
    const u = o.u
    ctx.fillStyle = `rgba(0,0,0,${0.6 * al})`; ctx.fillRect(u * 0.2, u * 0.35, u * 0.95, u * 0.6)
    ctx.fillStyle = ink(a, (blinkOn ? 0.95 : 0.3) * al); ctx.fillRect(u * 1.35, u * 0.3, u * 0.18, u * 0.12)
  })
}

// ── 0 · THE AWARD — a clinic lab bench under one lamp; the award letter floats down over it ──
const award: SceneFn = (ctx, a) => {
  const { ls, W, H, KF } = a
  const tall = isTall(a), c1 = cue(a, 1), c2 = cue(a, 2), c3 = cue(a, 3)
  const u = U(a, tall ? 1.05 : 1.08), o = rig(a, tall ? 0.52 : 0.31, tall ? 0.6 : 0.52, u, 0.035)
  const on = ls < 700 ? (Math.floor(ls / 90) % 3 === 1 ? 0.3 : 1) * prog(ls, 60, 200) : 1
  const g = (k: number) => easeOut(prog(ls, 150 + k * 260, 700))
  isoFloor(ctx, a, o, 10, 0.08)
  pool(ctx, a, o, -0.4, 0, 4.8, 0.22 * on)
  const bt = isoPt(o, -0.4, 0, 1.1), lampY = H * 0.03
  lamp(ctx, a, bt[0], lampY, bt[1] + u * 0.8, u * 3.8, 0.1 * on)
  lampHead(ctx, a, bt[0], lampY, 22 * KF, on)
  motes(ctx, a, bt[0], (lampY + bt[1]) / 2, u * 4, bt[1] - lampY)
  // the bench
  isoBox(ctx, a, o, -3.4, -1, 6.8, 2, 1.1 * g(0), { lit: 0.8 })
  if (g(0) > 0.9) onPlane(ctx, o, [-3.4, 1, 1.1], X, DOWN, () => {
    ctx.strokeStyle = ink(a, 0.22); ctx.lineWidth = 1
    for (let k = 0; k < 3; k++) { ctx.strokeRect(u * (0.25 + k * 2.2), u * 0.18, u * 1.9, u * 0.42); ctx.fillStyle = ink(a, 0.4); ctx.fillRect(u * (1.0 + k * 2.2), u * 0.36, u * 0.4, u * 0.06) }
  })
  // the monitor at the back, a trace scrolling across it
  isoBox(ctx, a, o, 2.15, -0.8, 0.25, 0.2, 0.3 * g(3), { z: 1.1 })
  isoBox(ctx, a, o, 1.45, -0.9, 1.6, 0.12, 1.05 * g(3), { z: 1.4 })
  if (g(3) > 0.95) onPlane(ctx, o, [1.45, -0.78, 2.45], X, DOWN, () => {
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(u * 0.1, u * 0.1, u * 1.4, u * 0.85)
    ctx.strokeStyle = ink(a, 0.85); ctx.lineWidth = Math.max(1, 1.3 * KF); ctx.beginPath()
    for (let s = 0; s <= 40; s++) {
      const ph = s * 0.45 - ls * 0.006, spike = Math.pow(Math.max(0, Math.sin(ph * 0.5)), 12)
      const yy = u * (0.6 - 0.32 * spike + 0.04 * Math.sin(ph * 3))
      if (s) ctx.lineTo(u * (0.15 + s * 0.0325), yy); else ctx.moveTo(u * 0.15, yy)
    }
    ctx.stroke()
  })
  // the analyser
  isoBox(ctx, a, o, -3.0, -0.8, 2.05, 1.5, 1.75 * g(1), { z: 1.1 })
  if (g(1) > 0.95) onPlane(ctx, o, [-3.0, 0.7, 2.85], X, DOWN, () => {
    ctx.fillStyle = 'rgba(0,0,0,0.62)'; ctx.fillRect(u * 0.22, u * 0.42, u * 1.15, u * 0.72)
    ctx.save(); ctx.beginPath(); ctx.rect(u * 0.22, u * 0.42, u * 1.15, u * 0.72); ctx.clip()
    ctx.fillStyle = ink(a, 0.55) // the carousel turning inside
    for (let k = 0; k < 9; k++) { const tx = u * (0.22 + ((k * 0.19 + ls * 0.00018) % 1.7)); ctx.fillRect(tx, u * 0.62, u * 0.07, u * 0.38) }
    ctx.restore()
    ctx.strokeStyle = ink(a, 0.5); ctx.lineWidth = 1; ctx.strokeRect(u * 0.22, u * 0.42, u * 1.15, u * 0.72)
    ctx.fillStyle = ink(a, Math.floor(ls / 450) % 2 ? 0.95 : 0.25); ctx.fillRect(u * 1.6, u * 0.3, u * 0.18, u * 0.12)
    ctx.fillStyle = ink(a, 0.3); for (let k = 0; k < 3; k++) ctx.fillRect(u * 1.55, u * (0.6 + k * 0.14), u * 0.32, u * 0.05)
  })
  // the rack: sample tubes riding into the machine
  isoBox(ctx, a, o, -0.95, -0.3, 2.7, 0.6, 0.16 * g(2), { z: 1.1 })
  if (g(2) > 0.5) {
    const xs: number[] = []
    for (let k = 0; k < 10; k++) xs.push(lerp(1.55, -1.05, (ls * 0.00026 + k / 10) % 1))
    xs.sort((p, q) => p - q)
    for (const x of xs) {
      if (x < -0.9) continue
      const fi = clamp01((1.55 - x) * 4) * g(2)
      isoBox(ctx, a, o, x, -0.07, 0.14, 0.14, 0.55, { z: 1.26, alpha: fi, lit: 0.9 })
      isoBox(ctx, a, o, x - 0.01, -0.08, 0.16, 0.16, 0.08, { z: 1.81, alpha: fi })
    }
  }
  // the award letter
  const pc = easeOut(prog(ls, 500, 950))
  const cw = tall ? W * 0.86 : W * 0.35, ch = tall ? H * 0.31 : H * 0.6
  const x = tall ? W * 0.07 : W * 0.6, y = (tall ? H * 0.11 : H * 0.12) - (1 - pc) * 26 * KF + bob(a)
  leader(ctx, a, isoPt(o, -1.95, -0.05, 2.85), tall ? [x + cw * 0.3, y + ch] : [x, y + ch * 0.45], prog(ls, 900, 700))
  card(ctx, a, x, y, cw, ch, pc)
  if (pc <= 0) return
  ctx.save(); ctx.globalAlpha *= pc
  const px = x + cw * 0.07, iw = cw * 0.86
  mono(ctx, a, L(a, 'AWARD · MAY 2026', 'ADJUDICACIÓN · MAYO 2026'), px, y + (tall ? 18 : 26) * KF, tall ? 9 : 10, dim(a, 0.95))
  text(ctx, 'IMSS-Bienestar', px, y + (tall ? 42 : 62) * KF, { size: (tall ? 19 : 26) * KF, color: ink(a, 1) })
  if (!tall) {
    mono(ctx, a, typeOn('«LABORATORIO EN TU CLÍNICA»', prog(ls, 1500, 1300)), px, y + 80 * KF, 9.5, ink(a, 0.8), { maxWidth: iw }); mono(ctx, a, typeOn(L(a, 'A SINGLE CONTRACT', 'UN SOLO CONTRATO'), prog(ls, 3200, 900)), px, y + 97 * KF, 9.5, ink(a, 1), { maxWidth: iw, weight: 700 })
    ctx.fillStyle = ink(a, 0.3); ctx.fillRect(px, y + 107 * KF, iw, 1)
    mono(ctx, a, L(a, 'CEILING · VAT INCL.', 'MONTO MÁXIMO · IVA INCL.'), px, y + 124 * KF, 9.5, dim(a, 0.95))
  }
  // the figure, on the voice
  const fp = prog(ls, c1 - 300, 400), fs = tall ? Math.min(44 * KF, cw * 0.15) : Math.min(62 * KF, cw * 0.2)
  const fy = tall ? y + ch * 0.6 : y + 124 * KF + fs * 1.05
  // the blank fields of the form, waiting for the figures
  const my0 = tall ? y + ch * 0.86 : fy + 54 * KF
  ctx.setLineDash([3 * KF, 4 * KF]); ctx.strokeStyle = ink(a, 0.3); ctx.lineWidth = 1; ctx.beginPath()
  for (const ly of [fy + 8 * KF, my0 + 8 * KF]) { ctx.moveTo(px, ly); ctx.lineTo(px + iw * easeOut(prog(ls, 1100, 900)), ly) }
  ctx.stroke(); ctx.setLineDash([])
  if (fp > 0) {
    const num = count(4928, fp, 0, a.lang)
    text(ctx, num, px, fy, { size: fs, color: ink(a, 1), alpha: Math.min(1, fp * 4) })
    mono(ctx, a, L(a, 'M MXN', 'MDP'), px + serifW(ctx, num, fs) + 8 * KF, fy, tall ? 12 : 15, ink(a, 0.85), { alpha: Math.min(1, fp * 4) })
  }
  // seven months: seven cells filling
  const mp = prog(ls, c2, 1000), my = tall ? y + ch * 0.86 : fy + 54 * KF
  if (mp > 0) {
    if (!tall) mono(ctx, a, L(a, 'TERM', 'PLAZO'), px, my - 30 * KF, 9.5, dim(a, 0.95), { alpha: Math.min(1, mp * 3) })
    const ms = (tall ? 15 : 24) * KF, lab = L(a, '7 months', '7 meses')
    text(ctx, lab, px, my, { size: ms, color: ink(a, 1), alpha: Math.min(1, mp * 3) })
    const bx = px + serifW(ctx, lab, ms) + 12 * KF, bw = (tall ? 7 : 11) * KF
    for (let k = 0; k < 7; k++) {
      const on2 = clamp01(mp * 8 - k)
      ctx.fillStyle = ink(a, 0.12 + 0.75 * on2); ctx.fillRect(bx + k * (bw + 3 * KF), my - ms * 0.62, bw, ms * 0.62)
    }
    if (!tall) mono(ctx, a, L(a, '29 MAY – 31 DEC 2026', '29 MAY – 31 DIC 2026'), px, my + 18 * KF, 9, dim(a, 0.9), { alpha: mp })
  }
  ctx.restore()
  // no tender — the stamp, the one red thing
  const sp = prog(ls, c3, 420)
  if (sp > 0) {
    const sx = tall ? x + cw * 0.72 : x + cw * 0.5, sy = tall ? y + ch * 0.8 : y + ch * 0.9
    stamp(ctx, a, L(a, 'NO TENDER', 'SIN LICITACIÓN'), sx, sy, { size: (tall ? 10 : 15) * KF, p: sp, rot: -0.09 })
  }
  vignette(ctx, a)
}

// ── 1 · THE WINNER — a one-room office, a pile one sheet thick, and a tower that will not stop ─
const company: SceneFn = (ctx, a) => {
  const { ls, W, H, KF } = a
  const tall = isTall(a), c0 = cue(a, 0), c1 = cue(a, 1)
  const u = U(a, tall ? 1.15 : 1.05), o = rig(a, tall ? 0.5 : 0.44, tall ? 0.68 : 0.67, u, 0.03)
  const slab = 0.034, TOWER = 548 * slab // 4,928 ÷ 9 ≈ 548 piles like the one beside the office
  const grow = easeInOut(prog(ls, c1 + 900, Math.max(2600, (a.dur - c1) * 0.62)))
  const th = TOWER * grow + Math.max(0, ls - c1 - 900) * 0.0001 * grow
  isoFloor(ctx, a, o, 10, 0.08)
  pool(ctx, a, o, -2.4, 1.0, 2.6, 0.22)
  pool(ctx, a, o, 1.3, -0.9, 3.2, 0.05 + 0.1 * grow)
  // the office
  const og = easeBack(prog(ls, c0 + 150, 750))
  const lt = isoPt(o, -2.65, 0.95, 0.95)
  lamp(ctx, a, lt[0], H * 0.02, lt[1] + u * 0.6, u * 1.8, 0.09 * prog(ls, c0, 400))
  lampHead(ctx, a, lt[0], H * 0.02, 16 * KF, prog(ls, c0, 400))
  isoBox(ctx, a, o, -3.3, 0.4, 1.3, 1.1, 0.95 * og)
  if (og > 0.9) figure(ctx, a, o, -2.35 + Math.sin(ls * 0.0007) * 0.12, 1.85, { h: 0.55, alpha: clamp01((og - 0.9) * 10) })
  if (og > 0.9) onPlane(ctx, o, [-3.3, 1.5, 0.95], X, DOWN, () => {
    ctx.fillStyle = ink(a, 0.55 + 0.25 * Math.sin(ls * 0.003)); ctx.fillRect(u * 0.15, u * 0.25, u * 0.45, u * 0.3)
    ctx.strokeStyle = ink(a, 0.6); ctx.lineWidth = 1; ctx.strokeRect(u * 0.78, u * 0.35, u * 0.35, u * 0.6)
  })
  // the pile: everything before, one folder thick
  const sp = prog(ls, c1, 600)
  isoBox(ctx, a, o, -1.55, 1.0, 0.8, 0.6, slab * Math.max(0.01, sp), { alpha: Math.min(1, sp * 3), lit: 1.2 })
  // the tower: this one award, in the same folders
  if (th > 0.001) {
    isoBox(ctx, a, o, 0.4, -1.6, 1.8, 1.4, th, { lit: 0.85 })
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1; ctx.beginPath()
    for (let z = 0.12; z < th; z += 0.12) {
      const p0 = isoPt(o, 0.4, -0.2, z), p1 = isoPt(o, 2.2, -0.2, z), p2 = isoPt(o, 2.2, -1.6, z)
      ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1])
    }
    ctx.stroke()
    // the ruler: how many of the little pile it takes
    const rb = isoPt(o, 2.65, -0.15, 0), rt = isoPt(o, 2.65, -0.15, th)
    ctx.strokeStyle = ink(a, 0.6); ctx.beginPath(); ctx.moveTo(rb[0], rb[1]); ctx.lineTo(rt[0], rt[1]); ctx.stroke()
    for (let n = 100; n * slab <= th; n += 100) {
      const tp = isoPt(o, 2.65, -0.15, n * slab)
      if (tp[1] < H * 0.12) break
      ctx.fillStyle = ink(a, 0.8); ctx.fillRect(tp[0], tp[1], 8 * KF, 1)
      mono(ctx, a, '×' + n, tp[0] + 12 * KF, tp[1] + 4 * KF, 9.5, ink(a, 0.85))
    }
    // the tower leaves the frame through a fade, not through the tag
    const fg = ctx.createLinearGradient(0, 0, 0, H * 0.2)
    fg.addColorStop(0, 'rgba(0,0,0,1)'); fg.addColorStop(0.45, 'rgba(0,0,0,0.85)'); fg.addColorStop(1, 'rgba(0,0,0,0)')
    const tl = isoPt(o, 0.4, -0.2, 0)[0] - 4 * KF, tr = isoPt(o, 2.2, -1.6, 0)[0] + 60 * KF
    ctx.fillStyle = fg; ctx.fillRect(tl, -H * 0.1, tr - tl, H * 0.3)
  }
  // this award: an evidence card beside the tower, a leader to its face
  const pt = easeOut(clamp01((grow - 0.1) * 4))
  if (pt > 0) {
    const kw = tall ? W * 0.5 : Math.min(W * 0.27, 280 * KF), kh = (tall ? 72 : 126) * KF
    const kx = tall ? W * 0.05 : W * 0.69, ky = (tall ? H * 0.415 : H * 0.17) + bob(a, 3)
    const mid = ky + kh * 0.4, wx = tall ? 0.4 : 2.2, wy = tall ? -0.2 : -0.9
    const at = isoPt(o, wx, wy, Math.min(th, Math.max(0, (o.oy + (wx + wy) * 0.5 * u - mid) / u)))
    leader(ctx, a, at, [tall ? kx + kw : kx, mid], pt, red(a, 0.7))
    card(ctx, a, kx, ky, kw, kh, pt, true)
    ctx.save(); ctx.globalAlpha *= pt
    const px = kx + 12 * KF
    mono(ctx, a, L(a, 'THIS AWARD · CEILING', 'ESTA ADJUDICACIÓN · TOPE'), px, ky + (tall ? 15 : 22) * KF, tall ? 8 : 9.5, dim(a, 1), { maxWidth: kw - 24 * KF })
    text(ctx, mdp(a, 4928, 1), px, ky + (tall ? 39 : 64) * KF, { size: (tall ? 21 : 36) * KF, color: red(a, 1), maxWidth: kw - 24 * KF })
    const pr = prog(ls, c1 + 900 + Math.max(2600, (a.dur - c1) * 0.62) * 0.6, 600)
    if (pr > 0) {
      ctx.fillStyle = ink(a, 0.25 * pr); ctx.fillRect(px, ky + kh * (tall ? 0.62 : 0.64), kw - 24 * KF, 1)
      text(ctx, '≈ 1 : 550', px, ky + kh - (tall ? 11 : 15) * KF, { size: (tall ? 13 : 22) * KF, color: ink(a, 1), alpha: pr })
      mono(ctx, a, L(a, 'BEFORE : THIS', 'ANTES : ESTA'), kx + kw - 12 * KF, ky + kh - (tall ? 12 : 17) * KF, tall ? 7.5 : 9, ink(a, 0.8), { align: 'right', alpha: pr })
    }
    ctx.restore()
  }
  // card A: who
  const pa = easeOut(prog(ls, c0 + 400, 800)), cw = tall ? W * 0.5 : Math.min(W * 0.28, 300 * KF)
  const ax = W * 0.05, ay = H * (tall ? 0.12 : 0.13) + bob(a), ah = (tall ? 50 : 62) * KF
  leader(ctx, a, isoPt(o, -2.65, 0.95, 0.95), [ax + cw * 0.5, ay + ah], prog(ls, c0 + 700, 600))
  card(ctx, a, ax, ay, cw, ah, pa)
  if (pa > 0) {
    text(ctx, 'VAYAM Medical', ax + 12 * KF, ay + (tall ? 22 : 28) * KF, { size: (tall ? 16 : 22) * KF, color: ink(a, 1), alpha: pa })
    mono(ctx, a, typeOn(L(a, 'INCORPORATED MAY 2022', 'CONSTITUIDA EN MAYO 2022'), prog(ls, c0 + 900, 900)), ax + 12 * KF, ay + ah - 13 * KF, tall ? 8 : 9.5, ink(a, 0.85), { maxWidth: cw - 20 * KF })
  }
  // card B: the magnifier on the pile
  const pb = easeOut(prog(ls, c1 + 200, 800))
  if (pb > 0) {
    const sc = isoPt(o, -1.15, 1.3, 0), rr = 16 * KF
    ctx.strokeStyle = ink(a, 0.9 * pb); ctx.lineWidth = 1.4 * KF; ctx.beginPath(); ctx.arc(sc[0], sc[1], rr * (0.6 + 0.4 * pb), 0, TAU); ctx.stroke()
    const bx = ax, by = ay + ah + (tall ? 14 : 22) * KF + bob(a, 1), bh = (tall ? 62 : 92) * KF
    leader(ctx, a, [sc[0] - rr * 0.7, sc[1] - rr * 0.7], [bx + cw * 0.8, by + bh], pb, ink(a, 0.5))
    card(ctx, a, bx, by, cw, bh, pb)
    ctx.save(); ctx.globalAlpha *= pb
    const io: Iso = { ox: bx + cw * 0.18, oy: by + bh * 0.52, u: (tall ? 13 : 20) * KF }
    isoBox(ctx, a, io, -1, -0.75, 2, 1.5, 0.18, { lit: 1.2 })
    const fx = bx + cw * 0.38, fs2 = (tall ? 20 : 32) * KF
    text(ctx, L(a, '< 9M MXN', '< 9 MDP'), fx, by + bh * 0.55, { size: fs2, color: ink(a, 1) })
    mono(ctx, a, L(a, 'FEDERAL CONTRACTS, BEFORE', 'CONTRATOS FEDERALES PREVIOS'), fx, by + bh * 0.55 + (tall ? 14 : 20) * KF, tall ? 7.5 : 9, ink(a, 0.8), { maxWidth: cw * 0.6 })
    ctx.restore()
  }
  vignette(ctx, a)
}

// ── 2 · THE SCOPE — a table-top country of clinics, lighting state by state ────────────────────
const COLS = 30, ROWS = 18, NSTATE = 21
const seed = (k: number): Pt => [(rnd(k * 3.1 + 7) * 2 - 1) * 0.82, (rnd(k * 5.7 + 2) * 2 - 1) * 0.72]
const scope: SceneFn = (ctx, a) => {
  const { ls, W, H, KF } = a
  const tall = isTall(a), c0 = cue(a, 0), c1 = cue(a, 1)
  const u = tall ? Math.min(W * 0.95 / 41.6, H * 0.4 / 24) : Math.min(W * 0.6 / 41.6, H * 0.56 / 24)
  const o = rig(a, tall ? 0.5 : 0.36, tall ? 0.62 : 0.5, u, 0.02)
  const span = Math.max(2200, (c1 - c0) * 0.72)
  const tState = (k: number) => c0 + 500 + ((seed(k)[0] + 1) / 2) * span
  const iH = 19, jH = 7 // the clinic the objects rise from
  pool(ctx, a, o, 0, 0, 20, 0.12)
  for (let s = 0; s <= COLS + ROWS - 2; s++) {
    for (let i = Math.max(0, s - ROWS + 1); i <= Math.min(COLS - 1, s); i++) {
      const j = s - i, nx = ((i + 0.5) / COLS) * 2 - 1, ny = ((j + 0.5) / ROWS) * 2 - 1
      const hero = i === iH && j === jH
      const r = nx * nx + ny * ny + 0.22 * (rnd(i * 13 + j * 7) - 0.5) + 0.1 * Math.sin(nx * 5 + ny * 3)
      if (r > 0.92 && !hero) continue
      let d1 = 9, d2 = 9, st = 0
      for (let k = 0; k < NSTATE; k++) {
        const q = seed(k), d = Math.hypot((nx - q[0]) * 1.4, ny - q[1])
        if (d < d1) { d2 = d1; d1 = d; st = k } else if (d < d2) d2 = d
      }
      if (d2 - d1 < 0.045 && !hero) continue // the roads between states
      const lp = prog(ls, tState(st) + rnd(i * 31 + j) * 380, 450)
      const x = i - COLS / 2, y = j - ROWS / 2
      const heroUp = hero ? easeBack(prog(ls, c1 - 300, 700)) : 0
      const h = 0.32 + 0.22 * easeOut(lp) + heroUp * 0.9
      const b = 0.16 + 0.62 * lp + heroUp * 0.2
      cube(ctx, o, x, y, 0, 0.72, 0.72, h, ink(a, b), ink(a, b * 0.3), ink(a, b * 0.5))
    }
  }
  // counters, landing with the voice
  const nx0 = W * 0.06, ny0 = H * (tall ? 0.17 : 0.2)
  const pc = prog(ls, c0, 500)
  if (pc > 0) {
    const fs = (tall ? 40 : 64) * KF
    text(ctx, count(7259, prog(ls, c0 + 250, 500), 0, a.lang), nx0, ny0, { size: fs, color: ink(a, 1), alpha: pc })
    mono(ctx, a, L(a, 'HEALTH UNITS & LABS', 'UNIDADES Y LABORATORIOS'), nx0, ny0 + 18 * KF, tall ? 8.5 : 10, ink(a, 0.8), { alpha: pc })
    const sx = tall ? W * 0.62 : nx0, sy = tall ? ny0 : ny0 + fs + 22 * KF
    text(ctx, count(21, prog(ls, c0 + 250, 500), 0, a.lang), sx, sy, { size: fs * 0.62, color: ink(a, 1), alpha: pc })
    mono(ctx, a, L(a, 'STATES', 'ESTADOS'), sx, sy + 16 * KF, tall ? 8.5 : 10, ink(a, 0.8), { alpha: pc })
  }
  // three objects rise out of one clinic
  const hp = isoPt(o, iH - COLS / 2 + 0.36, jH - ROWS / 2 + 0.36, 1.4)
  const items: [string, string][] = [['ANALYSERS', 'ANALIZADORES'], ['COMPUTER SYSTEMS', 'SISTEMAS DE CÓMPUTO'], ['REAGENTS', 'REACTIVOS']]
  for (let k = 0; k < 3; k++) {
    const p = easeOut(prog(ls, cue(a, 1 + k), 800))
    if (p <= 0) continue
    const cw = tall ? W * 0.29 : W * 0.24, chh = tall ? H * 0.13 : H * 0.17
    const tx = tall ? W * (0.04 + k * 0.32) : W * 0.72, ty = tall ? H * 0.27 : H * (0.12 + k * 0.205)
    const cx = lerp(hp[0] - cw * 0.5, tx, p), cy = lerp(hp[1] - chh, ty, p) + bob(a, k)
    leader(ctx, a, hp, [cx + cw * 0.5, cy + chh], p, ink(a, 0.35))
    ctx.save(); ctx.translate(cx + cw / 2, cy + chh / 2); ctx.scale(lerp(0.2, 1, p), lerp(0.2, 1, p)); ctx.translate(-cw / 2, -chh / 2)
    card(ctx, a, 0, 0, cw, chh, Math.min(1, p * 2))
    const io: Iso = { ox: cw * 0.5, oy: chh * 0.42, u: Math.min(cw, chh) * 0.17 }
    const spin = Math.sin(ls * 0.001 + k) * 0.06
    io.ox += spin * cw
    if (k === 0) analyserIcon(ctx, a, io, 1, Math.floor(ls / 400) % 2 === 0)
    else if (k === 1) {
      isoBox(ctx, a, io, -0.2, -0.2, 0.4, 0.3, 0.35)
      isoBox(ctx, a, io, -1, -0.5, 2, 0.15, 1.3, { z: 0.35 })
      onPlane(ctx, io, [-1, -0.35, 1.65], X, DOWN, () => { ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(io.u * 0.12, io.u * 0.12, io.u * 1.76, io.u * 1.0) })
      isoBox(ctx, a, io, -0.9, 0.35, 1.8, 0.6, 0.1)
    } else {
      for (let b = 0; b < 3; b++) { isoBox(ctx, a, io, -1.1 + b * 0.75, -0.25, 0.5, 0.5, 1.0 + b * 0.15); isoBox(ctx, a, io, -0.98 + b * 0.75, -0.13, 0.26, 0.26, 0.2, { z: 1.0 + b * 0.15 }) }
    }
    mono(ctx, a, L(a, items[k][0], items[k][1]), cw / 2, chh - 9 * KF, tall ? 7 : 9.5, ink(a, 0.95), { align: 'center', maxWidth: cw - 8 * KF })
    ctx.restore()
  }
  vignette(ctx, a, 0.6)
}

// ── 3 · THE EXCEPTION — the justification lifts off the desk and opens; three tabs mark it ────
const exception: SceneFn = (ctx, a) => {
  const { ls, W, H, KF } = a
  const tall = isTall(a), c0 = cue(a, 0), c1 = cue(a, 1)
  const u = U(a, tall ? 1.1 : 1.05), o = rig(a, tall ? 0.5 : 0.42, tall ? 0.72 : 0.7, u, 0.03)
  isoFloor(ctx, a, o, 10, 0.06)
  pool(ctx, a, o, 0, 0, 5, 0.2)
  const dt = isoPt(o, 0, 0, 1.2)
  lamp(ctx, a, dt[0] - u * 2, H * 0.02, dt[1], u * 4, 0.08)
  // the desk, a pen, an ink pad
  isoBox(ctx, a, o, -3.6, -1.8, 7.2, 3.6, 1.2, { lit: 0.85 })
  isoBox(ctx, a, o, 1.8, 0.4, 0.9, 0.7, 0.18, { z: 1.2 })
  isoBox(ctx, a, o, 1.9, -1.2, 1.6, 0.1, 0.08, { z: 1.2, lit: 1.1 })
  // the document: flat on the desk, then lifted to face us
  const lift = easeInOut(prog(ls, c0 + 300, 1600))
  const dw = 2.3 * u, dh = 3.0 * u, s1 = (H * (tall ? 0.46 : 0.58)) / dh
  const e0 = isoPt(o, -1.6, -1.6, 1.21)
  const e1: Pt = [(tall ? W * 0.42 : W * 0.38) - (dw * s1) / 2, H * (tall ? 0.2 : 0.12) + bob(a)]
  // its shadow on the desk grows as it rises
  onPlane(ctx, o, [-1.6, -1.6, 1.205], X, Y, () => { ctx.fillStyle = `rgba(0,0,0,${0.25 + 0.2 * lift})`; ctx.fillRect(4 * lift * KF, 4 * lift * KF, dw * (1 + 0.1 * lift), dh) })
  const t = lift, sc = lerp(1, s1, t)
  ctx.save()
  ctx.transform(lerp(0.866, s1, t), lerp(0.5, 0, t), lerp(-0.866, 0, t), lerp(0.5, s1, t), lerp(e0[0], e1[0], t), lerp(e0[1], e1[1], t))
  const lw = (1.2 * KF) / sc
  const paper = (al: number) => {
    ctx.fillStyle = a.pal.bg; ctx.fillRect(0, 0, dw, dh)
    ctx.fillStyle = ink(a, 0.1 * al + 0.02); ctx.fillRect(0, 0, dw, dh)
    ctx.strokeStyle = ink(a, 0.75 * al); ctx.lineWidth = lw; ctx.strokeRect(0, 0, dw, dh)
  }
  const bars = (y0: number, n: number, sd: number, al: number) => {
    ctx.fillStyle = ink(a, 0.35 * al)
    for (let i = 0; i < n; i++) ctx.fillRect(dw * 0.1, y0 + i * dh * 0.045, dw * (0.5 + 0.3 * rnd(sd + i)), dh * 0.012)
  }
  // finger tabs, sliding out from behind the right edge
  const tabs: [string, string][] = [['I · MARKET SURVEY', 'I · ESTUDIO DE MERCADO'], ['II · DEADLINE', 'II · PLAZO'], ['III · EXCLUSIVITY', 'III · EXCLUSIVIDAD']]
  const tsz = (tall ? 8 : 9.5) * KF / s1
  for (let k = 0; k < 3; k++) {
    const tp = easeBack(prog(ls, c1 + 1700 + k * 260, 600))
    if (tp <= 0) continue
    const lab = L(a, tabs[k][0], tabs[k][1])
    ctx.save(); ctx.font = `500 ${tsz}px ${MONO}`; const tw = ctx.measureText(lab).width + lab.length * tsz * 0.12; ctx.restore()
    const tw2 = (tw + dw * 0.08) * tp, ty = dh * (0.52 + k * 0.13), thh = dh * 0.095
    ctx.fillStyle = a.pal.bg; ctx.fillRect(dw - dw * 0.02, ty, dw * 0.02 + tw2, thh)
    ctx.fillStyle = ink(a, 0.16); ctx.fillRect(dw - dw * 0.02, ty, dw * 0.02 + tw2, thh)
    ctx.strokeStyle = ink(a, 0.7); ctx.lineWidth = lw; ctx.strokeRect(dw - dw * 0.02, ty, dw * 0.02 + tw2, thh)
    if (tp > 0.6) text(ctx, lab, dw + dw * 0.03, ty + thh * 0.66, { size: tsz, font: 'mono', color: ink(a, 0.95), tracking: tsz * 0.12, alpha: (tp - 0.6) * 2.5 })
  }
  paper(1)
  text(ctx, 'IMSS-BIENESTAR', dw * 0.1, dh * 0.08, { size: dw * 0.04, font: 'mono', color: dim(a, 0.95), tracking: dw * 0.004 })
  text(ctx, 'Justificación de', dw * 0.1, dh * 0.17, { size: dw * 0.085, color: ink(a, 1) })
  text(ctx, 'excepción', dw * 0.1, dh * 0.245, { size: dw * 0.085, color: ink(a, 1) })
  if (a.lang === 'en') text(ctx, '(JUSTIFICATION FOR THE EXCEPTION)', dw * 0.1, dh * 0.29, { size: dw * 0.03, font: 'mono', color: dim(a, 0.95), maxWidth: dw * 0.82 })
  text(ctx, 'ART. 54 · FR. I', dw * 0.1, dh * 0.36, { size: dw * 0.05, font: 'mono', weight: 700, color: ink(a, 1), tracking: dw * 0.004 })
  const clause = L(a, 'SINGLE POSSIBLE SUPPLIER', 'UN SOLO PROVEEDOR POSIBLE')
  text(ctx, typeOn(clause, prog(ls, c0 + 1700, 900)), dw * 0.1, dh * 0.42, { size: dw * 0.042, font: 'mono', color: ink(a, 0.95), tracking: dw * 0.003, maxWidth: dw * 0.82 })
  const ul = prog(ls, c0 + 2700, 600)
  if (ul > 0) { ctx.fillStyle = red(a, 0.95); ctx.fillRect(dw * 0.1, dh * 0.435, dw * 0.8 * easeOut(ul), dh * 0.008) }
  bars(dh * 0.5, 9, 3, 1)
  // pages turning over the spine: its reasoning, set out at length
  for (let k = 0; k < 4; k++) {
    const fp = prog(ls, c1 + 200 + k * 380, 700)
    if (fp <= 0 || fp >= 1) continue
    const th2 = Math.PI * easeInOut(fp), cs = Math.cos(th2)
    ctx.save(); ctx.scale(cs, 1)
    paper(0.5 + 0.5 * Math.abs(cs)); bars(dh * 0.12, 16, 20 + k * 9, Math.abs(cs))
    ctx.fillStyle = `rgba(0,0,0,${0.4 * (1 - Math.abs(cs))})`; ctx.fillRect(0, 0, dw, dh)
    ctx.restore()
  }
  ctx.restore()
  vignette(ctx, a, 0.66)
}

// ── 4 · IN ITS FAVOUR — five envelopes; three open, and their prices stand up to scale ────────
const QUOTE: (number | null)[] = [null, 9.04, 4.25, null, 13.84]
const survey: SceneFn = (ctx, a) => {
  const { ls, W, H, KF } = a
  const tall = isTall(a), c1 = cue(a, 1), c2 = cue(a, 2), c3 = cue(a, 3)
  const u = U(a, tall ? 0.95 : 0.95), o = rig(a, tall ? 0.52 : 0.5, tall ? 0.72 : 0.7, u, 0.03)
  isoFloor(ctx, a, o, 11, 0.06)
  pool(ctx, a, o, 0.8, -0.1, 4.5, 0.22)
  const dz = 0.6
  isoBox(ctx, a, o, -4.4, -1.5, 8.8, 2.8, dz, { lit: 0.75 })
  const MAXH = tall ? 5.2 : 5.6
  const ex = (k: number) => -4.0 + k * 1.65, ey = -0.6, ew = 1.25, ed = 0.9
  for (let k = 0; k < 5; k++) {
    const dp = easeOut(prog(ls, cue(a, 0) + 700 + k * 260, 650))
    if (dp <= 0) continue
    const x = ex(k), z = dz + (1 - dp) * 1.2, q = QUOTE[k]
    isoBox(ctx, a, o, x, ey, ew, ed, 0.06, { z, alpha: dp, lit: 1.05 })
    const op = q != null ? easeInOut(prog(ls, c2 + (k === 2 ? 0 : k === 1 ? 650 : 1300), 600)) : 0
    // the flap, hinged at the back edge, swinging open
    onPlane(ctx, o, [x, ey, z + 0.06], X, Y, () => {
      const w = ew * u, d = ed * u, fl = d * 0.5 * Math.cos(op * Math.PI * 0.9)
      ctx.strokeStyle = ink(a, 0.55 * dp); ctx.lineWidth = Math.max(1, KF)
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(w / 2, fl); ctx.lineTo(w, 0); ctx.stroke()
      if (op < 0.1) { ctx.fillStyle = q == null ? ink(a, 0.6 * dp) : ink(a, 0.85 * dp); ctx.beginPath(); ctx.arc(w / 2, d * 0.5, d * 0.09, 0, TAU); ctx.fill() }
      else { ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(w * 0.1, d * 0.06, w * 0.8, d * 0.2 * op) }
    })
  }
  // the bars rise out of the open envelopes, all on one scale
  for (let k = 0; k < 5; k++) {
    const q = QUOTE[k]
    if (q == null) continue
    const bp = easeOut(prog(ls, c2 + 400 + (k === 2 ? 0 : k === 1 ? 650 : 1300), 1100))
    if (bp <= 0) continue
    const hh = (q / 13.84) * MAXH * bp, vay = k === 2
    const glint = 0.15 * Math.max(0, Math.sin(ls * 0.0012 - k))
    isoBox(ctx, a, o, ex(k) + 0.24, ey + 0.15, 0.78, 0.6, hh, { z: dz + 0.06, lit: vay ? 1.15 + glint : 0.55 + glint })
    const tp = isoPt(o, ex(k) + 0.62, ey + 0.45, dz + 0.06 + hh)
    const lab = a.lang === 'es' ? count(q * 1000, 1, 0, 'es') + ' MDP' : count(q, 1, 2, 'en') + 'B', la = clamp01((bp - 0.55) * 3)
    text(ctx, lab, tp[0], tp[1] - 12 * KF, { size: (tall ? 13 : 19) * KF, align: 'center', color: ink(a, vay ? 1 : 0.8), alpha: la })
    if (vay) mono(ctx, a, 'VAYAM', tp[0], tp[1] - (tall ? 30 : 38) * KF, tall ? 8.5 : 10, ink(a, 1), { align: 'center', weight: 700, alpha: la })
  }
  // the two that never named a price
  const np = prog(ls, c2 + 2200, 600)
  if (np > 0) for (const k of [0, 3]) {
    const at = isoPt(o, ex(k) + ew / 2, ey + ed / 2, dz + 0.1), cy = at[1] - (tall ? 46 : 70) * KF + bob(a, k)
    leader(ctx, a, at, [at[0], cy + 4 * KF], np, ink(a, 0.35))
    { const s = L(a, 'NO PRICE', 'SIN PRECIO'), bw = monoW(ctx, a, s, tall ? 8 : 10) + 10 * KF, bh = (tall ? 14 : 17) * KF
      ctx.fillStyle = `rgba(0,0,0,${0.75 * np})`; ctx.fillRect(at[0] - bw / 2, cy - bh * 0.72, bw, bh)
      mono(ctx, a, s, at[0], cy, tall ? 8 : 10, ink(a, 0.8), { align: 'center', alpha: np }) }
  }
  // "five companies quoted": the count, with the survey's name
  const p1 = prog(ls, c1, 500)
  if (p1 > 0) {
    const lx = W * 0.06, ly = H * (tall ? 0.16 : 0.18)
    text(ctx, '5', lx, ly + (tall ? 12 : 20) * KF, { size: (tall ? 40 : 60) * KF, color: ink(a, 1), alpha: p1 })
    mono(ctx, a, L(a, 'FIRMS QUOTED', 'EMPRESAS COTIZARON'), lx + (tall ? 30 : 46) * KF, ly - 2 * KF, tall ? 8.5 : 10, ink(a, 0.9), { alpha: p1 })
    mono(ctx, a, L(a, 'MARKET SURVEY', 'ESTUDIO DE MERCADO'), lx + (tall ? 30 : 46) * KF, ly + 14 * KF, tall ? 8.5 : 10, dim(a, 0.95), { alpha: p1 })
  }
  // the institute's claim, attributed
  const p3 = easeOut(prog(ls, c3 - 250, 600))
  if (p3 > 0) {
    const at = isoPt(o, ex(2) + 0.62, ey + 0.45, dz + 0.06 + (4.25 / 13.84) * MAXH)
    const cx = tall ? W * 0.06 : W * 0.06, cy = tall ? H * 0.3 : H * 0.36
    const cw = (tall ? 120 : 190) * KF, chh = (tall ? 54 : 80) * KF
    leader(ctx, a, [at[0] - 20 * KF, at[1] - (tall ? 22 : 30) * KF], [cx + cw, cy + chh * 0.6], p3, ink(a, 0.4))
    card(ctx, a, cx, cy + bob(a, 2), cw, chh, p3)
    text(ctx, '−' + count(53, prog(ls, c3 - 250, 350), 0, a.lang) + '%', cx + 12 * KF, cy + bob(a, 2) + chh * 0.6, { size: (tall ? 28 : 44) * KF, color: ink(a, 1), alpha: p3 })
    mono(ctx, a, L(a, 'PER THE INSTITUTE', 'SEGÚN EL INSTITUTO'), cx + 12 * KF, cy + bob(a, 2) + chh - 10 * KF, tall ? 7.5 : 9, ink(a, 0.8), { alpha: p3, maxWidth: cw - 20 * KF })
  }
  vignette(ctx, a, 0.66)
}

// ── 5 · TWO DAYS — the month on a card, 48 hours running out over three squares, four empty trays ─
const easeIn2 = (t: number) => t * t
const hms = (s: number) => {
  const t = Math.max(0, Math.round(s)), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), x = t % 60
  return [h, m, x].map((v) => String(v).padStart(2, '0')).join(':')
}
const window_: SceneFn = (ctx, a) => {
  const { ls, W, H, KF } = a
  const tall = isTall(a), c0 = cue(a, 0), c1 = cue(a, 1), c2 = cue(a, 2), c3 = cue(a, 3)
  const u = U(a, tall ? 0.6 : 0.9), o = rig(a, tall ? 0.52 : 0.71, tall ? 0.63 : 0.56, u, 0.035)
  const runLen = Math.max(1800, c2 - c1 - 200), run = prog(ls, c1 + 150, runLen)
  const pc = easeOut(prog(ls, c0, 700)), lit = prog(ls, c0 + 900, 700)
  // ── the set: a back wall with a clock, a counter with four in-trays ──
  isoFloor(ctx, a, o, 10, 0.06)
  pool(ctx, a, o, 0.2, 0.6, 4.2, 0.2)
  isoBox(ctx, a, o, -2.6, -2.3, 6.2, 0.3, 3.1, { lit: 0.45 })
  onPlane(ctx, o, [-0.2, -2.0, 2.9], X, DOWN, () => {
    const R = u * 0.85, cx = R, cy = R
    ctx.fillStyle = a.pal.bg; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill()
    ctx.strokeStyle = ink(a, 0.75); ctx.lineWidth = Math.max(1, 0.04 * u); ctx.stroke()
    for (let k = 0; k < 12; k++) { const an = (k / 12) * TAU; ctx.beginPath(); ctx.moveTo(cx + Math.cos(an) * R * 0.8, cy + Math.sin(an) * R * 0.8); ctx.lineTo(cx + Math.cos(an) * R * 0.94, cy + Math.sin(an) * R * 0.94); ctx.stroke() }
    // 48 hours = the hour hand round four times, the minute hand a blur
    const hr = -Math.PI / 2 + easeInOut(run) * TAU * 4 + ls * 0.00004, mn = hr * 12
    if (run > 0 && run < 1) { ctx.fillStyle = red(a, 0.22); ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R * 0.78, mn - 0.9, mn); ctx.closePath(); ctx.fill() }
    ctx.strokeStyle = ink(a, 0.8); ctx.lineWidth = Math.max(1, 0.035 * u)
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(mn) * R * 0.78, cy + Math.sin(mn) * R * 0.78); ctx.stroke()
    ctx.strokeStyle = ink(a, 1); ctx.lineWidth = Math.max(1.5, 0.07 * u)
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(hr) * R * 0.5, cy + Math.sin(hr) * R * 0.5); ctx.stroke()
  })
  isoBox(ctx, a, o, -2.6, 0.1, 6.2, 1.5, 1.0, { lit: 0.7 })
  for (let k = 0; k < 4; k++) {
    const tp = easeBack(prog(ls, c0 + 500 + k * 170, 600))
    if (tp <= 0) continue
    const x = -2.4 + k * 1.52, y = 0.3, w = 1.3, d = 1.05, z = 1.0 + (1 - tp) * 0.8
    isoBox(ctx, a, o, x, y, w, d, 0.26, { z, alpha: Math.min(1, tp) })
    onPlane(ctx, o, [x + 0.08, y + 0.08, z + 0.26], X, Y, () => { ctx.fillStyle = 'rgba(0,0,0,0.72)'; ctx.fillRect(0, 0, (w - 0.16) * u, (d - 0.16) * u) })
    const scan = prog(ls, c2 + k * 240, 700)
    if (scan > 0 && scan < 1) pool(ctx, a, o, x + w / 2, y + d / 2, 0.9, 0.4 * Math.sin(Math.PI * scan))
    const lp = isoPt(o, x + w / 2, y + d / 2, z + 0.3), zp = prog(ls, c2 + k * 240 + 350, 300)
    if (zp > 0) text(ctx, '0', lp[0], lp[1] - 10 * KF, { size: (tall ? 18 : 28) * KF, align: 'center', color: ink(a, 1), alpha: zp })
    const fl = isoPt(o, x + w / 2, y + d + 0.02, 0.5)
    mono(ctx, a, L(a, 'FIRM ', 'EMPRESA ') + (k + 1), fl[0], fl[1] + 4 * KF, tall ? 7 : 9, 'rgba(0,0,0,0.85)', { align: 'center', weight: 700, alpha: Math.min(1, tp) })
  }
  motes(ctx, a, isoPt(o, 0.5, 0, 2)[0], isoPt(o, 0.5, 0, 2)[1], u * 6, u * 3, 18)
  // ── the month, floating over the set as evidence ──
  const cx0 = W * (tall ? 0.06 : 0.045), cy0 = H * 0.11 + bob(a) - (1 - pc) * 24 * KF
  const cw = W * (tall ? 0.88 : 0.4), chh = H * (tall ? 0.36 : 0.61)
  card(ctx, a, cx0, cy0, cw, chh, pc)
  if (pc > 0) {
    ctx.save(); ctx.globalAlpha *= pc
    const pad = cw * 0.05, gx = cx0 + pad, gw = cw - pad * 2, cell = gw / 7
    const hy = cy0 + chh * 0.11, gy = cy0 + chh * 0.2, foot = chh * 0.22, rowH = (chh - (gy - cy0) - foot) / 5
    text(ctx, L(a, 'May 2026', 'Mayo 2026'), gx, hy, { size: Math.min(chh * 0.075, 26 * KF), color: ink(a, 1) })
    mono(ctx, a, L(a, 'TECHNICAL PAPERS', 'DOCUMENTACIÓN TÉCNICA'), gx + gw, hy, tall ? 7 : 8.5, dim(a, 1), { align: 'right' })
    const days = a.lang === 'es' ? ['L', 'M', 'M', 'J', 'V', 'S', 'D'] : ['M', 'T', 'W', 'T', 'F', 'S', 'S']
    days.forEach((dd, k) => mono(ctx, a, dd, gx + cell * (k + 0.5), gy - 6 * KF, tall ? 7.5 : 9, dim(a, 0.9), { align: 'center' }))
    const shut = easeIn2(run)
    for (let d = 1; d <= 31; d++) {
      const idx = d + 3, c = idx % 7, r = Math.floor(idx / 7) // 1 May 2026 is a Friday
      const x = gx + c * cell, y = gy + r * rowH, live = d >= 12 && d <= 14
      ctx.strokeStyle = ink(a, 0.12); ctx.lineWidth = 1; ctx.strokeRect(x, y, cell, rowH)
      if (live) { ctx.fillStyle = ink(a, 0.1 + 0.75 * lit * (1 - 0.7 * shut)); ctx.fillRect(x + 1.5, y + 1.5, cell - 3, rowH - 3) }
      const col = live ? (lit > 0.5 ? `rgba(0,0,0,${0.9 * (1 - shut * 0.6)})` : ink(a, 0.7)) : dim(a, 0.55 - 0.3 * lit)
      text(ctx, String(d), x + cell * 0.12, y + rowH * 0.42, { size: Math.min(rowH * 0.3, (live ? 15 : 11) * KF), font: live ? 'serif' : 'mono', color: col })
    }
    // the window: a bracket closes on the 12th–14th, hours sweep across, the shutter comes down
    if (lit > 0) {
      const bx = gx + cell, by = gy + 2 * rowH, bw = 3 * cell, open = 1 - easeOut(lit)
      if (run > 0) {
        const sx0 = bx + cell * 0.5, sw = cell * 2 * run
        ctx.fillStyle = red(a, 0.85); ctx.fillRect(sx0, by + rowH * 0.78, sw, rowH * 0.1)
        ctx.fillRect(sx0 + sw - 1, by + rowH * 0.1, 2 * KF, rowH * 0.8)
        ctx.fillStyle = red(a, 0.78); ctx.fillRect(bx, by, bw, rowH * shut)
        ctx.strokeStyle = 'rgba(0,0,0,0.38)'; ctx.lineWidth = 1
        for (let s = rowH * 0.16; s < rowH * shut; s += rowH * 0.16) { ctx.beginPath(); ctx.moveTo(bx, by + s); ctx.lineTo(bx + bw, by + s); ctx.stroke() }
      }
      ctx.strokeStyle = red(a, 0.95); ctx.lineWidth = Math.max(2, 2.4 * KF)
      ctx.strokeRect(bx - 3 - open * cell * 1.5, by - 3 - open * rowH, bw + 6 + open * cell * 3, rowH + 6 + open * rowH * 2)
      // the rest of the month, unused
      ctx.fillStyle = `rgba(0,0,0,${0.25 * lit})`; ctx.fillRect(gx, gy, gw, by - gy - 3); ctx.fillRect(gx, by + rowH + 3, gw, gy + 5 * rowH - by - rowH - 3)
    }
    // the countdown
    const fy = cy0 + chh - foot * 0.32
    ctx.fillStyle = ink(a, 0.25); ctx.fillRect(gx, cy0 + chh - foot + 6 * KF, gw, 1)
    const fs = Math.min(foot * 0.55, (tall ? 30 : 44) * KF)
    if (lit > 0) {
      text(ctx, hms(48 * 3600 * (1 - run)), gx, fy, { size: fs, font: 'mono', weight: 600, color: run > 0 ? red(a, 1) : ink(a, 1), alpha: lit })
      text(ctx, L(a, '2 days', '2 días'), gx + gw, fy, { size: fs * 0.82, align: 'right', color: ink(a, 1), alpha: lit })
      mono(ctx, a, L(a, '12 – 14 MAY', '12 – 14 MAYO'), gx + gw, fy - fs * 0.95, tall ? 7 : 8.5, dim(a, 1), { align: 'right', alpha: lit })
    }
    ctx.restore()
  }
  // they did not; the institute could not show equivalence
  const sp = prog(ls, c3 + 500, 420)
  if (sp > 0) {
    stamp(ctx, a, L(a, 'EQUIVALENCE NOT SHOWN', 'EQUIVALENCIA NO ACREDITADA'), cx0 + cw * (tall ? 0.62 : 0.58), cy0 + chh * (tall ? 0.66 : 0.64), { size: (tall ? 9 : 13) * KF, p: sp, rot: -0.06, color: ink(a, 0.95) })
  }
  vignette(ctx, a, 0.66)
}

// ── 6 · THE EXCLUSIVITY — a loop: the firm proposes the brand; the brand names the firm ────────
const brand: SceneFn = (ctx, a) => {
  const { ls, W, H, KF } = a
  const tall = isTall(a), c0 = cue(a, 0), c1 = cue(a, 1)
  const u = U(a, tall ? 1.05 : 1.2), o = rig(a, tall ? 0.5 : 0.5, tall ? 0.6 : 0.6, u, 0.03)
  const rest = Math.max(2400, a.dur - c1)
  const tDist = c1 + 300, tProp = c1 + rest * 0.42, tClose = c1 + rest * 0.7
  isoFloor(ctx, a, o, 10, 0.06)
  pool(ctx, a, o, 2.2, -1.6, 3, 0.22)
  pool(ctx, a, o, -2.6, 2.2, 2.2, 0.14)
  // the analyser on its pedestal, a blank plate on its face
  const g = easeOut(prog(ls, c0, 900))
  isoBox(ctx, a, o, 1.4, -2.4, 1.8, 1.6, 0.9 * g, { lit: 0.7 })
  isoBox(ctx, a, o, 1.55, -2.25, 1.5, 1.3, 1.5 * g, { z: 0.9 * g })
  const plateP = isoPt(o, 2.3, -0.95, 1.65)
  if (g > 0.95) onPlane(ctx, o, [1.55, -0.95, 2.4], X, DOWN, () => {
    const pw = u * 1.0, ph = u * 0.32, px = u * 0.25, py = u * 0.55
    ctx.fillStyle = ink(a, 0.85 + 0.1 * Math.sin(ls * 0.004)); ctx.fillRect(px, py, pw, ph)
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.setLineDash([u * 0.06, u * 0.05]); ctx.strokeRect(px + u * 0.05, py + u * 0.05, pw - u * 0.1, ph - u * 0.1); ctx.setLineDash([])
    ctx.fillStyle = ink(a, Math.floor(ls / 500) % 2 ? 0.9 : 0.3); ctx.fillRect(u * 1.3, u * 0.25, u * 0.12, u * 0.08)
  })
  // the firm's office
  const og = easeBack(prog(ls, c0 + 300, 800))
  isoBox(ctx, a, o, -3.3, 1.6, 1.4, 1.2, 1.0 * og)
  if (og > 0.9) onPlane(ctx, o, [-3.3, 2.8, 1.0], X, DOWN, () => {
    ctx.fillStyle = ink(a, 0.6); ctx.fillRect(u * 0.15, u * 0.25, u * 0.5, u * 0.3)
    ctx.strokeStyle = ink(a, 0.6); ctx.lineWidth = 1; ctx.strokeRect(u * 0.85, u * 0.35, u * 0.35, u * 0.65)
  })
  const offP = isoPt(o, -2.6, 2.2, 1.2)
  if (og > 0.5) {
    mono(ctx, a, 'VAYAM', offP[0], offP[1] + (tall ? -u * 1.7 : u * 2.0), tall ? 9 : 11, ink(a, 1), { align: 'center', weight: 700, alpha: og })
    mono(ctx, a, L(a, 'THE FIRM', 'LA EMPRESA'), offP[0], offP[1] + (tall ? -u * 1.7 : u * 2.0) + 14 * KF, tall ? 7.5 : 9, dim(a, 1), { align: 'center', alpha: og })
  }
  if (g > 0.5) {
    mono(ctx, a, L(a, 'ANALYSER · BRAND ?', 'ANALIZADOR · MARCA ?'), plateP[0] + u * 0.2, plateP[1] - u * 2.3, tall ? 8 : 10, ink(a, 0.9), { align: 'center', alpha: g })
  }
  // the loop: two arcs between the office and the plate
  const mx = (offP[0] + plateP[0]) / 2, my = (offP[1] + plateP[1]) / 2
  const rx = Math.hypot(plateP[0] - offP[0], plateP[1] - offP[1]) / 2, ry = rx * 0.42
  const ang = Math.atan2(plateP[1] - offP[1], plateP[0] - offP[0])
  const arc = (from: number, to: number, p: number, col: string, w: number) => {
    if (p <= 0) return
    ctx.save(); ctx.translate(mx, my); ctx.rotate(ang)
    ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath()
    const e = lerp(from, to, easeInOut(p))
    ctx.ellipse(0, 0, rx, ry, 0, Math.min(from, e), Math.max(from, e))
    ctx.stroke()
    // the arrowhead rides the tip
    const hx = rx * Math.cos(e), hy = ry * Math.sin(e), dir = to > from ? 1 : -1
    const tx = -rx * Math.sin(e) * dir, ty = ry * Math.cos(e) * dir, tl = Math.hypot(tx, ty) || 1
    const ux = tx / tl, uy = ty / tl, s = 9 * KF
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(hx + ux * s, hy + uy * s); ctx.lineTo(hx - uy * s * 0.6, hy + ux * s * 0.6); ctx.lineTo(hx + uy * s * 0.6, hy - ux * s * 0.6); ctx.closePath(); ctx.fill()
    ctx.restore()
  }
  const close = easeOut(prog(ls, tClose, 700))
  const colOf = (base: number) => close > 0 ? red(a, lerp(base, 1, close)) : ink(a, base)
  // plate → office (lower arc): the exclusive distributor
  const pd = prog(ls, tDist, 1300)
  arc(0, Math.PI, pd, colOf(0.7), Math.max(1.5, 2 * KF))
  // office → plate (upper arc): the firm itself proposes
  const pp = prog(ls, tProp, 1300)
  arc(Math.PI, TAU, pp, colOf(0.7), Math.max(1.5, 2 * KF))
  const lab = (s: string, t: number, p: number) => {
    if (p <= 0) return
    const q: Pt = [mx + Math.cos(ang) * rx * Math.cos(t) - Math.sin(ang) * ry * Math.sin(t), my + Math.sin(ang) * rx * Math.cos(t) + Math.cos(ang) * ry * Math.sin(t)]
    const wv = monoW(ctx, a, s, tall ? 8 : 10.5) + 14 * KF, hv = (tall ? 16 : 20) * KF
    ctx.fillStyle = a.pal.bg; ctx.globalAlpha = Math.min(1, p * 2); ctx.fillRect(q[0] - wv / 2, q[1] - hv / 2, wv, hv)
    ctx.strokeStyle = close > 0 ? red(a, 0.8) : ink(a, 0.5); ctx.lineWidth = 1; ctx.strokeRect(q[0] - wv / 2, q[1] - hv / 2, wv, hv); ctx.globalAlpha = 1
    mono(ctx, a, s, q[0], q[1] + 1 * KF, tall ? 8 : 10.5, close > 0 ? red(a, 1) : ink(a, 1), { align: 'center', baseline: 'middle', alpha: Math.min(1, p * 2) })
  }
  lab(L(a, 'EXCLUSIVE DISTRIBUTOR', 'DISTRIBUIDOR EXCLUSIVO'), Math.PI * 0.5, prog(ls, tDist + 500, 500))
  lab(L(a, 'PROPOSES', 'PROPONE'), Math.PI * 1.5, prog(ls, tProp + 500, 500))
  // closed: a token runs the circle for good
  if (close > 0) {
    ctx.save(); ctx.translate(mx, my); ctx.rotate(ang)
    for (let k = 0; k < 3; k++) {
      const t = ((ls - tClose) * 0.0011 + (k * TAU) / 3) % TAU
      ctx.fillStyle = red(a, close); ctx.beginPath(); ctx.arc(rx * Math.cos(t + Math.PI), ry * Math.sin(t + Math.PI), 3.6 * KF, 0, TAU); ctx.fill()
    }
    ctx.restore()
    const fx = tall ? W * 0.5 : W * 0.5, fy = H * (tall ? 0.17 : 0.18)
    text(ctx, 'VAYAM → VAYAM', fx, fy, { size: (tall ? 22 : 34) * KF, align: 'center', color: red(a, 1), alpha: close })
  }
  vignette(ctx, a, 0.66)
}

// ── 7 · WHO DID NOT QUALIFY — two long-stocked labs either side of a shut door ─────────────────
const rivals: SceneFn = (ctx, a) => {
  const { ls, W, H, KF } = a
  const tall = isTall(a), c0 = cue(a, 0), c1 = cue(a, 1)
  const u = U(a, tall ? 0.8 : 0.84), o = rig(a, 0.5, tall ? 0.66 : 0.68, u, 0.04)
  isoFloor(ctx, a, o, 12, 0.06)
  const gA = easeOut(prog(ls, c0, 900)), gB = easeOut(prog(ls, c0 + 350, 900)), hiA = prog(ls, c1, 700)
  /** a long shelf of contract folders; its front (the face toward us) carries the spines. */
  const rack = (x: number, y: number, len: number, h: number, fill: number, sd: number, glow: number, al: number) => {
    if (al <= 0.01) return
    isoBox(ctx, a, o, x, y, len, 0.42, h, { alpha: al, lit: 0.55 })
    onPlane(ctx, o, [x, y + 0.42, h], X, DOWN, () => {
      const fw = len * u, fh = h * u, rows = 4, per = Math.round(len * 7), slot = (fh * 0.92) / rows, lw = Math.max(1, 0.03 * u)
      ctx.globalAlpha *= al
      ctx.fillStyle = 'rgba(0,0,0,0.72)'; ctx.fillRect(fw * 0.02, fh * 0.04, fw * 0.96, fh * 0.92)
      for (let r = 0; r < rows; r++) {
        const sy = fh * 0.04 + (r + 1) * slot
        ctx.fillStyle = ink(a, 0.5); ctx.fillRect(fw * 0.02, sy - lw, fw * 0.96, lw)
        for (let j = 0; j < per; j++) {
          const n = r * per + j
          if (rnd(sd + n * 1.7) > fill) continue
          const fhh = slot * (0.62 + 0.28 * rnd(sd + n))
          ctx.fillStyle = ink(a, (0.38 + 0.4 * rnd(sd + n * 3)) * (0.72 + 0.28 * glow))
          ctx.fillRect(fw * (0.03 + (0.94 * j) / per), sy - lw - fhh, (fw * 0.94) / per - lw, fhh)
        }
      }
    })
  }
  const stock = (g: number, t0: number) => Math.min(g, 0.25 + 0.75 * easeOut(prog(ls, t0, 1800)))
  // supplier B (back right) and supplier A (front left): three long rows each
  pool(ctx, a, o, 2.7, -3.9, 3.6, 0.12)
  isoBox(ctx, a, o, 0.3, -5.8, 4.8, 3.9, 0.1, { alpha: gB, lit: 0.45 })
  for (let r = 0; r < 3; r++) rack(0.6, -5.6 + r * 1.25, 4.2, 1.4, stock(gB, c0 + 500), 70 + r * 40, 0, gB)
  // the shut door between them, a red seam of light under it
  pool(ctx, a, o, -0.8, -0.6, 1.6, 0.14)
  isoBox(ctx, a, o, -1.8, -1.2, 2.0, 0.25, 2.4, { lit: 0.55 })
  onPlane(ctx, o, [-1.8, -0.95, 2.4], X, DOWN, () => {
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(u * 0.55, u * 0.5, u * 0.9, u * 1.9)
    ctx.strokeStyle = ink(a, 0.6); ctx.lineWidth = 1; ctx.strokeRect(u * 0.55, u * 0.5, u * 0.9, u * 1.9)
    ctx.fillStyle = ink(a, 0.75); ctx.fillRect(u * 1.28, u * 1.45, u * 0.08, u * 0.08)
    ctx.fillStyle = red(a, 0.65 + 0.3 * Math.sin(ls * 0.004)); ctx.fillRect(u * 0.55, u * 2.36, u * 0.9, u * 0.05)
  })
  const sg = isoPt(o, -0.8, -0.9, 0)
  ctx.fillStyle = red(a, 0.14); ctx.beginPath(); ctx.ellipse(sg[0], sg[1] + 3 * KF, u * 1.0, u * 0.28, 0, 0, TAU); ctx.fill()
  pool(ctx, a, o, -4.5, 2.3, 3.8, 0.14 + 0.08 * hiA)
  isoBox(ctx, a, o, -6.9, 0.4, 4.8, 3.9, 0.1, { alpha: gA, lit: 0.45 })
  for (let r = 0; r < 3; r++) rack(-6.6, 0.6 + r * 1.25, 4.2, 1.4, stock(gA, c0 + 200), 10 + r * 40, hiA, gA)
  motes(ctx, a, W * 0.5, H * 0.45, W * 0.9, H * 0.35, 20)
  // evidence cards
  const hs = tall ? 10.5 : 13, ss = tall ? 8.5 : 10.5
  const cwA = tall ? W * 0.44 : W * 0.4, cwB = tall ? W * 0.44 : W * 0.3
  const cnt = prog(ls, c1 + 100, 400), val = prog(ls, c1 + 1700, 500)
  const extra = easeOut(prog(ls, c1, 500)) * (tall ? 100 : 72) * KF
  const ax = W * 0.04, ay = H * 0.11 + bob(a), ahd = (tall ? 50 : 60) * KF, ah = ahd + extra
  const bx = W * 0.96 - cwB, by = H * 0.11 + bob(a, 2)
  leader(ctx, a, isoPt(o, -4.2, 0.8, 1.4), [ax + cwA * 0.5, ay + ah], gA)
  leader(ctx, a, isoPt(o, 3.0, -5.4, 1.4), [bx + cwB * 0.5, by + ahd], gB)
  card(ctx, a, ax, ay, cwA, ah, gA)
  card(ctx, a, bx, by, cwB, ahd, gB)
  const head = (x: number, y: number, w: number, k: string, al: number) => {
    mono(ctx, a, L(a, 'ESTABLISHED SUPPLIER ', 'PROVEEDOR ESTABLECIDO ') + k, x + 12 * KF, y + (tall ? 20 : 25) * KF, hs, ink(a, 1), { weight: 700, alpha: al, maxWidth: w - 24 * KF })
    mono(ctx, a, L(a, 'FEDERAL LAB CONTRACTS · YEARS', 'AÑOS CON CONTRATOS DE LABORATORIO'), x + 12 * KF, y + (tall ? 38 : 46) * KF, ss, dim(a, 1), { alpha: al, maxWidth: w - 24 * KF })
  }
  head(ax, ay, cwA, 'A', gA)
  head(bx, by, cwB, 'B', gB)
  if (cnt > 0) {
    ctx.save(); ctx.globalAlpha *= Math.min(1, cnt * 3)
    const px = ax + 12 * KF, fs = (tall ? 32 : 46) * KF, fy = ay + ahd + (tall ? 36 : 50) * KF
    ctx.fillStyle = ink(a, 0.22); ctx.fillRect(px, ay + ahd, cwA - 24 * KF, 1)
    const n = Math.round(1000 * easeOut(cnt))
    text(ctx, (cnt >= 1 ? '> ' : '') + count(n, 1, 0, a.lang), px, fy, { size: fs, color: ink(a, 1) })
    mono(ctx, a, L(a, 'CONTRACTS', 'CONTRATOS'), px, fy + 14 * KF, ss, ink(a, 0.85))
    if (val > 0) {
      const vx = tall ? px : px + serifW(ctx, '> ' + count(1000, 1, 0, a.lang), fs) + 16 * KF, vy = tall ? fy + 40 * KF : fy
      text(ctx, L(a, '≈ 8B MXN', '≈ 8,000 MDP'), vx, vy, { size: fs * (tall ? 0.72 : 0.54), color: ink(a, 1), alpha: Math.min(1, val * 3) })
      mono(ctx, a, L(a, 'IN VALUE', 'EN VALOR'), vx, vy + 14 * KF, ss, ink(a, 0.85), { alpha: Math.min(1, val * 3) })
    }
    ctx.restore()
  }
  // the door's card: they did not qualify
  const pd = easeOut(prog(ls, c0 + 900, 700))
  if (pd > 0) {
    const s = L(a, 'DID NOT QUALIFY', 'NO CALIFICARON'), dw = monoW(ctx, a, s, hs) + 24 * KF, dh = (tall ? 24 : 30) * KF
    const top = isoPt(o, -0.8, -0.95, 2.4), dx = top[0] - dw / 2, dy = top[1] - dh - (tall ? 22 : 16) * KF + bob(a, 4)
    leader(ctx, a, top, [top[0], dy + dh], pd, red(a, 0.6))
    card(ctx, a, dx, dy, dw, dh, pd, true)
    mono(ctx, a, s, top[0], dy + dh / 2 + 1, hs, red(a, 1), { align: 'center', baseline: 'middle', weight: 700, alpha: pd })
  }
  vignette(ctx, a, 0.64)
}

// ── 8 · THE ORDER OF THINGS — three markers on a long ruler re-sort; the competition, two ticks wide ─
const end: SceneFn = (ctx, a) => {
  const { ls, W, H, KF } = a
  const tall = isTall(a), c0 = cue(a, 0), c1 = cue(a, 1), c2 = cue(a, 2), c3 = cue(a, 3)
  const u = U(a, tall ? 0.64 : 0.86), o = rig(a, 0.5, 0.64, u, 0.02)
  isoFloor(ctx, a, o, 12, 0.05)
  pool(ctx, a, o, -1.2, 1.2, 7, 0.2)
  const L0 = -6, L1 = 6, DAY = 0.25
  const toS = (x: number): Pt => isoPt(o, x, -x, 0)
  // the ruler: a long strip lying on the desk, one tick per day (its depth runs straight down the screen)
  const rp = easeInOut(prog(ls, c0, 1100)), sl = easeOut(prog(ls, 0, 700))
  const rL = isoPt(o, L0 - 0.4, 0.4 - L0, 0), rR = isoPt(o, L1 + 0.4, -L1 - 0.4, 0)
  const top = rL[1] - u * 0.45, dep = u * 1.25
  ctx.save(); ctx.globalAlpha = sl
  ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(rL[0] + 8 * KF, top + dep + u * 0.3, rR[0] - rL[0], u * 0.22)
  ctx.fillStyle = ink(a, 0.16); ctx.fillRect(rL[0], top, rR[0] - rL[0], dep)
  ctx.fillStyle = ink(a, 0.07); ctx.fillRect(rL[0], top + dep, rR[0] - rL[0], u * 0.3)
  ctx.strokeStyle = ink(a, 0.35); ctx.lineWidth = 1; ctx.strokeRect(rL[0], top, rR[0] - rL[0], dep)
  ctx.restore()
  const xe = lerp(L0, L1, rp), tw = Math.max(1.2, 1.4 * KF)
  for (let x = L0; x <= xe + 1e-6; x += DAY) {
    const q = toS(x), wk = Math.round((x - L0) / DAY) % 7 === 0
    ctx.fillStyle = ink(a, wk ? 0.85 : 0.55); ctx.fillRect(q[0] - tw / 2, top, tw, (wk ? 0.62 : 0.34) * dep)
  }
  // the markers: where they stand now, and where they go
  const swap = easeInOut(prog(ls, c2 + 200, 1400)), hover = Math.sin(Math.PI * prog(ls, c1, (c2 - c1) + 1600))
  const shrink = easeInOut(prog(ls, c3 + 300, 1300))
  const brandX = lerp(0.5, -4.5, swap), compX0 = lerp(-4.6, -2.0, swap)
  const compW = lerp(3.4, 2 * DAY, shrink)
  const ls2 = tall ? 10.5 : 14, mh = (tall ? 28 : 38) * KF
  const marker = (x: number, label: string, al: number, accent: boolean, lift: number) => {
    const b = toS(x), tH = H * (tall ? 0.15 : 0.17) + lift
    ctx.strokeStyle = accent ? red(a, 0.9 * al) : ink(a, 0.75 * al); ctx.lineWidth = Math.max(1, 1.5 * KF)
    ctx.beginPath(); ctx.moveTo(b[0], top); ctx.lineTo(b[0], top - tH); ctx.stroke()
    ctx.fillStyle = accent ? red(a, al) : ink(a, al); ctx.beginPath(); ctx.arc(b[0], top, 4 * KF, 0, TAU); ctx.fill()
    const wv = monoW(ctx, a, label, ls2) + 24 * KF
    card(ctx, a, b[0] - wv / 2, top - tH - mh, wv, mh, al, accent)
    mono(ctx, a, label, b[0], top - tH - mh / 2 + 1, ls2, accent ? red(a, 1) : ink(a, 1), { align: 'center', baseline: 'middle', weight: 700, alpha: al })
  }
  const mp = prog(ls, c0 + 600, 700), num = swap > 0.5
  // the competition: a span across the ruler, collapsing to two day-ticks
  const cs = toS(compX0), ce = toS(compX0 + compW)
  if (mp > 0) {
    ctx.fillStyle = shrink > 0 ? red(a, 0.3 + 0.45 * shrink) : ink(a, 0.2 * mp)
    ctx.fillRect(cs[0], top, ce[0] - cs[0], dep)
    ctx.strokeStyle = shrink > 0 ? red(a, 1) : ink(a, 0.7 * mp); ctx.lineWidth = 2 * KF
    ctx.beginPath(); ctx.moveTo(cs[0], top - 10 * KF); ctx.lineTo(cs[0], top + dep + 6 * KF); ctx.moveTo(ce[0], top - 10 * KF); ctx.lineTo(ce[0], top + dep + 6 * KF); ctx.stroke()
    if (shrink > 0.9) mono(ctx, a, L(a, '2 DAYS', '2 DÍAS'), (cs[0] + ce[0]) / 2, top + dep + 22 * KF, tall ? 9 : 11, red(a, 1), { align: 'center', weight: 700, alpha: (shrink - 0.9) * 10 })
  }
  marker(compX0 + compW / 2, (num ? '2 · ' : '') + L(a, 'COMPETITION', 'COMPETENCIA'), mp, shrink > 0.2, hover * H * 0.015)
  marker(brandX, (num ? '1 · ' : '') + L(a, 'BRAND', 'MARCA'), mp, false, hover * H * 0.025 + H * (tall ? 0.08 : 0.06))
  marker(3.8, (num ? '3 · ' : '') + L(a, 'AWARD', 'ADJUDICACIÓN'), mp, false, hover * H * 0.01)
  // the headline: lawful on its face → the order of things → two days
  const fp = easeBack(prog(ls, c3 + 1500, 700)), hd = 1 - clamp01(fp * 1.5), q = prog(ls, c1 + 100, 600)
  const hy = H * (tall ? 0.21 : 0.22), hs = (tall ? 24 : 38) * KF
  const p0 = prog(ls, c0 + 200, 700) * (1 - clamp01(q * 3.5)), qa = clamp01((q - 0.3) / 0.7)
  if (p0 > 0) text(ctx, L(a, 'lawful on its face', 'legal en apariencia'), W * 0.5, hy, { size: hs, align: 'center', color: ink(a, 0.9), alpha: p0 })
  if (qa > 0 && hd > 0) {
    mono(ctx, a, L(a, 'THE QUESTION', 'LA PREGUNTA'), W * 0.5, hy - hs * 1.15, tall ? 8.5 : 10, dim(a, 1), { align: 'center', alpha: qa * hd })
    text(ctx, L(a, 'the order of things', 'el orden de las cosas'), W * 0.5, hy, { size: hs, align: 'center', color: ink(a, 1), alpha: qa * hd })
  }
  if (fp > 0) text(ctx, L(a, 'TWO DAYS', 'DOS DÍAS'), W * 0.5, hy + hs * 0.2, { size: (tall ? 44 : 76) * KF, align: 'center', color: red(a, 1), alpha: Math.min(1, fp) })
  vignette(ctx, a, 0.66)
}

export const scenes: Record<string, SceneFn> = { award, company, scope, exception, survey, window: window_, brand, rivals, end }
