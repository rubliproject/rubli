/**
 * «El registro borroso / The Blurred Record» — told in one miniature room under one light (the
 * Fern direction): a public-records reading room with a wall of filing drawers, a long reading
 * table, and later a public terminal and a reading machine. The same room in every shot, so the
 * change over time is visible. The film's idea is FOCUS: a sharp archive whose answers drift out
 * of focus into scanned letters, and a machine that brings pieces back. No motive, no villain.
 * One draw function per shot, keyed by the beat's `scene` in story-films.json; see filmKit.ts.
 */
import { type Iso, type Pt, type SceneArgs, type SceneFn, type TextOpts, L, clamp01, count, cue, dim, easeBack, easeInOut, easeOut, figure, ink, isoBox, isoFloor, isoPt, lamp, lerp, pool, prog, red, rnd, stamp, text, trace } from '@/components/gallery/filmKit'

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

/** Draw in the plane of a wall facing the viewer-left (dir 'x') — local x along the wall, y down. */
function onFace(ctx: C, at: Pt, draw: () => void) {
  ctx.save(); ctx.translate(at[0], at[1]); ctx.transform(0.866, 0.5, 0, 1, 0, 0); draw(); ctx.restore()
}
/** Draw in the floor plane (or a table top): local x along world x, local y along world y, u px = 1 unit. */
function onFloor(ctx: C, at: Pt, draw: () => void) {
  ctx.save(); ctx.translate(at[0], at[1]); ctx.transform(0.866, 0.5, -0.866, 0.5, 0, 0); draw(); ctx.restore()
}

/** Value that eases between keyframes [ms, value] — a camera that moves in steps. */
function keyed(ls: number, keys: [number, number][], len: number) {
  let v = keys[0][1]
  for (let i = 1; i < keys.length; i++) v = lerp(v, keys[i][1], easeInOut(prog(ls, keys[i][0], len)))
  return v
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

/** Camera: put world point f at screen fraction (sx, sy), with a slow pan across the shot. */
function view(a: SceneArgs, f: [number, number, number], sx: number, sy: number, u: number, panX = 0.04, panY = 0): Iso {
  const t = easeInOut(clamp01(a.ls / a.dur)) - 0.5
  return { ox: a.W * sx - (f[0] - f[1]) * 0.866 * u - t * panX * a.W, oy: a.H * sy - (f[0] + f[1]) * 0.5 * u + f[2] * u - t * panY * a.H, u }
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
    const lx = s.align === 'center' ? bx + w / 2 : bx + pad
    text(ctx, l.s, lx, ly, { size: sz, font: f, color: l.color, weight: l.weight, align: s.align === 'center' ? 'center' : 'left', tracking: f === 'mono' ? sz * 0.12 : undefined })
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
/** the nearest point on a card's edge to `p` — leaders land on the edge, not inside. */
const edge = (r: Rect, p: Pt): Pt => [Math.max(r.x, Math.min(r.x + r.w, p[0])), p[1] < r.y ? r.y : p[1] > r.y + r.h ? r.y + r.h : (p[0] < r.x ? r.y + r.h / 2 : r.y + r.h / 2)]

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

function person(ctx: C, a: SceneArgs, o: Iso, x: number, y: number, s: { al?: number; folder?: boolean; lift?: number; h?: number; accent?: boolean } = {}) {
  const al = s.al ?? 1
  if (al <= 0.01) return
  const f = isoPt(o, x, y), hh = (s.h ?? 0.9) * o.u, w = hh * 0.3
  ctx.fillStyle = `rgba(0,0,0,${0.55 * al})`; ctx.beginPath(); ctx.ellipse(f[0], f[1], w * 0.9, w * 0.38, 0, 0, TAU); ctx.fill()
  ctx.save(); ctx.translate(0, -(s.lift ?? 0) * o.u)
  figure(ctx, a, o, x, y, { alpha: al, h: s.h, accent: s.accent })
  if (s.folder) { ctx.fillStyle = dim(a, 0.95 * al); ctx.fillRect(f[0] + w * 0.3, f[1] - hh * 0.6, w * 0.95, w * 1.15) }
  ctx.restore()
}

/** Text that is out of focus by `r` px: a soft core plus a ring of faint offset copies. */
function fuzzy(ctx: C, s: string, x: number, y: number, o: TextOpts, r: number) {
  if (r < 0.35) { text(ctx, s, x, y, o); return }
  const al = o.alpha ?? 1, k = clamp01(r / 6)
  text(ctx, s, x, y, { ...o, alpha: al * lerp(0.5, 0.14, k) })
  for (let i = 0; i < 8; i++) {
    const th = (i * TAU) / 8 + 0.4, rr = r * (i % 2 ? 1 : 0.55)
    text(ctx, s, x + Math.cos(th) * rr, y + Math.sin(th) * rr * 0.8, { ...o, alpha: al * lerp(0.22, 0.13, k) })
  }
}

/** Floating dust in a light beam — the room is never frozen. Screen-space, inside a circle. */
function motes(ctx: C, a: SceneArgs, cx: number, cy: number, r: number, n: number, al = 0.5) {
  ctx.fillStyle = ink(a, al)
  for (let i = 0; i < n; i++) {
    const ph = a.ls * 0.00004 * (0.6 + rnd(i * 3.1)) + rnd(i * 7.7)
    const x = cx + (rnd(i * 1.3) * 2 - 1) * r + Math.sin(a.ls * 0.0006 + i) * r * 0.08
    const y = cy + r - ((ph % 1) * 2 * r)
    const tw = 0.4 + 0.6 * Math.abs(Math.sin(a.ls * 0.002 + i * 1.7))
    ctx.globalAlpha = tw * Math.sin(Math.PI * (ph % 1))
    ctx.fillRect(x, y, 1.6 * a.KF, 1.6 * a.KF)
  }
  ctx.globalAlpha = 1
}

// ── THE ROOM ────────────────────────────────────────────────────────────────────────────────
// the drawer wall: four banks, one per era of the file
const BK = { x0: -4.2, w: 1.7, gap: 0.22, y: -3.5, d: 0.62, h: 2.3 }
const FY = BK.y + BK.d // the drawer fronts' plane
const bx = (i: number) => BK.x0 + i * (BK.w + BK.gap)
const ERAS = ['2002–2010', '2010–2017', '2018–2022', '2023–2025']
const DW = (BK.w - 0.2 - 0.08) / 2, DH = (BK.h - 0.2 - 4 * 0.08) / 5
/** drawer (col, row-from-top) of bank i: left x and bottom z. */
const dpos = (i: number, c: number, r: number) => ({ x: bx(i) + 0.1 + c * (DW + 0.08), z: BK.h - 0.1 - r * (DH + 0.08) - DH })
const TB = { x: -2.6, y: 0.2, w: 4.6, d: 1.3, z: 0.74 } // the reading table
const TM = { x: 4.05, y: -2.75, w: 1.0, d: 0.8, h: 1.7 } // the public terminal (the portal)

interface BankSt { rise?: number; lit?: number; al?: number; hole?: [number, number]; tags?: { frac: number; p: number; one?: boolean } }
function bank(ctx: C, a: SceneArgs, o: Iso, i: number, s: BankSt = {}) {
  const al = s.al ?? 1, rise = easeOut(clamp01(s.rise ?? 1)), lit = s.lit ?? 1
  if (al <= 0.01 || rise <= 0.01) return
  const x = bx(i), h = BK.h * rise, P = (px: number, py: number, pz: number) => isoPt(o, px, py, pz)
  solidBox(ctx, a, o, x, BK.y, BK.w, BK.d, h, { alpha: al, lit: 0.5 * lit })
  const sh = BK.h - h // drawers ride up with the bank
  for (let c = 0; c < 2; c++) for (let r = 0; r < 5; r++) {
    const d = dpos(i, c, r), zb = d.z - sh, zt = zb + DH
    if (zb < 0) continue
    const q: Pt[] = [P(d.x, FY, zb), P(d.x + DW, FY, zb), P(d.x + DW, FY, zt), P(d.x, FY, zt)]
    if (s.hole && s.hole[0] === c && s.hole[1] === r) { poly(ctx, q, `rgba(0,0,0,${0.85 * al})`); continue }
    poly(ctx, q, ink(a, 0.06 * lit * al), ink(a, 0.34 * lit * al), Math.max(1, a.KF * 0.8))
    poly(ctx, [P(d.x + DW * 0.36, FY, zt - DH * 0.18), P(d.x + DW * 0.64, FY, zt - DH * 0.18), P(d.x + DW * 0.64, FY, zt - DH * 0.4), P(d.x + DW * 0.36, FY, zt - DH * 0.4)], ink(a, 0.2 * lit * al))
    const h0 = P(d.x + DW * 0.42, FY, zb + DH * 0.3), h1 = P(d.x + DW * 0.58, FY, zb + DH * 0.3)
    ctx.strokeStyle = ink(a, 0.55 * lit * al); ctx.lineWidth = Math.max(1.2, a.KF * 1.4); ctx.beginPath(); ctx.moveTo(h0[0], h0[1]); ctx.lineTo(h1[0], h1[1]); ctx.stroke()
  }
  if (s.tags && rise > 0.98) {
    // 1,000 index tabs on the bank's face; the tagged ones (a supplier tax ID present) in red
    const tg = s.tags, cols = 25, rows = 40, cw = (BK.w * o.u) / cols, ch = (BK.h * o.u) / rows
    onFace(ctx, P(x, FY, BK.h), () => {
      ctx.fillStyle = ink(a, 0.16 * al); ctx.beginPath()
      for (let k = 0; k < 1000; k++) ctx.rect((k % cols) * cw + cw * 0.2, Math.floor(k / cols) * ch + ch * 0.2, cw * 0.6, ch * 0.55)
      ctx.fill()
      ctx.fillStyle = red(a, 0.95 * al); ctx.beginPath()
      for (let k = 0; k < 1000; k++) {
        const on = tg.one ? k === 512 && tg.p > 0 : rnd(k * 13.7 + i * 101) < tg.frac * clamp01(tg.p)
        if (on) ctx.rect((k % cols) * cw + cw * 0.08, Math.floor(k / cols) * ch + ch * 0.1, cw * 0.84, ch * 0.75)
      }
      ctx.fill()
    })
  }
}
/** the screen point of tag k on bank i (for leaders). */
const tagPt = (o: Iso, i: number, k: number): Pt => isoPt(o, bx(i) + ((k % 25) + 0.5) * (BK.w / 25), FY, BK.h - (Math.floor(k / 25) + 0.5) * (BK.h / 40))

/** A drawer pulled `out` units from bank i, filled with `cards` standing index cards at `pitch`. */
function pulled(ctx: C, a: SceneArgs, o: Iso, i: number, c: number, r: number, out: number, s: { cards?: number; pitch?: number; lift?: number; al?: number; gap?: number } = {}) {
  if (out <= 0.01) return
  const d = dpos(i, c, r), x = d.x, zb = d.z, al = s.al ?? 1, P = (px: number, py: number, pz: number) => isoPt(o, px, py, pz)
  // the open floor of the drawer, in shadow
  poly(ctx, [P(x, FY, zb + 0.03), P(x + DW, FY, zb + 0.03), P(x + DW, FY + out, zb + 0.03), P(x, FY + out, zb + 0.03)], `rgba(0,0,0,${0.75 * al})`, ink(a, 0.3 * al))
  isoBox(ctx, a, o, x, FY, 0.035, out, DH * 0.8, { z: zb, alpha: al, lit: 0.7 })
  if (s.gap && s.gap > 0) { // the empty stretch, outlined
    const y0 = FY + 0.06 + (s.cards ?? 0) * (s.pitch ?? 0.07)
    ctx.save(); ctx.setLineDash([4 * a.KF, 4 * a.KF])
    poly(ctx, [P(x + 0.05, y0, zb + 0.04), P(x + DW - 0.05, y0, zb + 0.04), P(x + DW - 0.05, FY + out - 0.04, zb + 0.04), P(x + 0.05, FY + out - 0.04, zb + 0.04)], red(a, 0.14 * s.gap), red(a, 0.9 * s.gap), Math.max(1.2, 1.4 * a.KF))
    ctx.restore()
  }
  const n = s.cards ?? 0, pitch = s.pitch ?? 0.07
  for (let k = 0; k < Math.floor(n); k++) {
    const y = FY + 0.06 + k * pitch
    if (y > FY + out - 0.06) break
    const lift = k === Math.floor(n) - 1 ? (s.lift ?? 0) : 0
    solidBox(ctx, a, o, x + 0.06, y, DW - 0.12, pitch * 0.4, DH * 0.98, { z: zb + 0.03 + lift, alpha: al, lit: 0.95 - 0.25 * ((k % 3) / 2) })
  }
  isoBox(ctx, a, o, x + DW - 0.035, FY, 0.035, out, DH * 0.8, { z: zb, alpha: al, lit: 0.7 })
  solidBox(ctx, a, o, x, FY + out, DW, 0.05, DH, { z: zb, alpha: al, lit: 0.8 })
  const h0 = P(x + DW * 0.4, FY + out + 0.05, zb + DH * 0.35), h1 = P(x + DW * 0.6, FY + out + 0.05, zb + DH * 0.35)
  ctx.strokeStyle = ink(a, 0.85 * al); ctx.lineWidth = Math.max(1.4, a.KF * 1.6); ctx.beginPath(); ctx.moveTo(h0[0], h0[1]); ctx.lineTo(h1[0], h1[1]); ctx.stroke()
}

function table(ctx: C, a: SceneArgs, o: Iso, al = 1, lit = 1) {
  if (al <= 0.01) return
  for (const [lx, ly] of [[0.1, 0.1], [TB.w - 0.18, 0.1], [0.1, TB.d - 0.18], [TB.w - 0.18, TB.d - 0.18]]) isoBox(ctx, a, o, TB.x + lx, TB.y + ly, 0.08, 0.08, TB.z - 0.07, { alpha: al, lit: 0.4 })
  solidBox(ctx, a, o, TB.x, TB.y, TB.w, TB.d, 0.07, { z: TB.z - 0.07, alpha: al, lit: 0.75 * lit })
}

/** The reading lamp hanging over the table: a shade, a cord, a cone. */
function hangLamp(ctx: C, a: SceneArgs, o: Iso, x: number, y: number, on: number, z = 3.2) {
  const sp = isoPt(o, x, y, z), fl = isoPt(o, x, y, TB.z), sw = o.u * 0.34
  ctx.strokeStyle = dim(a, 0.6); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(sp[0], sp[1]); ctx.lineTo(sp[0], 0); ctx.stroke()
  if (on > 0) lamp(ctx, a, sp[0], sp[1], fl[1] + o.u * 0.3, o.u * 1.9, 0.11 * on)
  poly(ctx, [[sp[0] - sw * 0.35, sp[1] - sw * 0.5], [sp[0] + sw * 0.35, sp[1] - sw * 0.5], [sp[0] + sw, sp[1]], [sp[0] - sw, sp[1]]], ink(a, 0.3 + 0.2 * on), ink(a, 0.6))
  if (on > 0) glow(ctx, sp[0], sp[1] + 2, sw * 1.6, ink(a, 0.35 * on), ink(a, 0))
}

/** The public terminal: a kiosk with a screen listing procedures and a slot that prints slips. */
function terminal(ctx: C, a: SceneArgs, o: Iso, s: { al?: number; on?: number; rise?: number }) {
  const al = s.al ?? 1, on = s.on ?? 0, h = TM.h * easeOut(clamp01(s.rise ?? 1))
  if (al <= 0.01 || h <= 0.01) return
  const P = (px: number, py: number, pz: number) => isoPt(o, px, py, pz), fy = TM.y + TM.d
  solidBox(ctx, a, o, TM.x, TM.y, TM.w, TM.d, h, { alpha: al, lit: 0.55 })
  if (h < TM.h * 0.98) return
  const sx0 = TM.x + 0.12, sx1 = TM.x + TM.w - 0.12, z0 = 0.9, z1 = 1.55
  if (on > 0) { const c = P((sx0 + sx1) / 2, fy, (z0 + z1) / 2); glow(ctx, c[0], c[1], o.u * 1.4, ink(a, 0.2 * on), ink(a, 0)) }
  poly(ctx, [P(sx0, fy, z0), P(sx1, fy, z0), P(sx1, fy, z1), P(sx0, fy, z1)], `rgba(0,0,0,${0.85 * al})`, ink(a, 0.5 * al))
  if (on > 0) {
    const sw = (sx1 - sx0) * o.u, sh = (z1 - z0) * o.u, rh = sh / 7, off = (a.ls * 0.02) % rh
    onFace(ctx, P(sx0, fy, z1), () => {
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, sw, sh); ctx.clip()
      for (let k = -1; k < 8; k++) {
        const y = k * rh - off + rh * 0.3, seed = k + Math.floor((a.ls * 0.02) / rh)
        ctx.fillStyle = ink(a, 0.75 * on); ctx.fillRect(sw * 0.08, y, sw * 0.16, rh * 0.38)
        ctx.fillStyle = ink(a, 0.4 * on); ctx.fillRect(sw * 0.3, y, sw * (0.3 + 0.3 * rnd(seed * 3.3)), rh * 0.38)
      }
      ctx.restore()
    })
  }
  poly(ctx, [P(TM.x + 0.25, fy, 0.62), P(TM.x + TM.w - 0.25, fy, 0.62), P(TM.x + TM.w - 0.25, fy, 0.68), P(TM.x + 0.25, fy, 0.68)], `rgba(0,0,0,${0.9 * al})`)
}

/** A flat slip lying on a plane at height z: corners at world (x, y), w × d units. */
function slipFlat(ctx: C, a: SceneArgs, o: Iso, x: number, y: number, z: number, w: number, d: number, s: { al?: number; empty?: number; sharp?: number; accent?: boolean; lines?: number; seed?: number } = {}) {
  const al = s.al ?? 1
  if (al <= 0.01) return
  onFloor(ctx, isoPt(o, x, y, z), () => {
    const W2 = w * o.u, D2 = d * o.u
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.globalAlpha = al; ctx.fillRect(W2 * 0.06, D2 * 0.08, W2, D2)
    ctx.fillStyle = s.empty ? a.pal.bg : ink(a, 0.82); ctx.fillRect(0, 0, W2, D2)
    if (s.empty) { ctx.strokeStyle = s.accent ? red(a, 0.85) : dim(a, 0.8); ctx.lineWidth = Math.max(1, a.KF); ctx.setLineDash([3 * a.KF, 3 * a.KF]); ctx.strokeRect(0, 0, W2, D2); ctx.setLineDash([]) }
    const n = s.lines ?? 4, sharp = s.sharp ?? 1
    for (let i = 0; i < n; i++) {
      const lw = W2 * (0.4 + 0.45 * rnd((s.seed ?? 1) * 7 + i)), ly = D2 * (0.18 + (i * 0.66) / n)
      if (s.empty) { if (i < 2) { ctx.fillStyle = dim(a, 0.5); ctx.fillRect(W2 * 0.1, ly, lw * 0.6, Math.max(1, D2 * 0.05)) } continue }
      if (sharp >= 0.99) { ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillRect(W2 * 0.1, ly, lw, Math.max(1, D2 * 0.05)) }
      else { // out of focus: a wide, faint smear
        const sp = (1 - sharp) * D2 * 0.12
        ctx.fillStyle = `rgba(0,0,0,${0.12 + 0.3 * sharp})`; ctx.fillRect(W2 * 0.1 - sp, ly - sp, lw + sp * 2, Math.max(1, D2 * 0.05) + sp * 2)
        ctx.fillStyle = `rgba(0,0,0,${0.1 + 0.4 * sharp})`; ctx.fillRect(W2 * 0.1, ly, lw, Math.max(1, D2 * 0.05))
      }
    }
    ctx.globalAlpha = 1
  })
}

/** the whole standing room, for wide shots. */
function room(ctx: C, a: SceneArgs, o: Iso, s: { lit?: number; terminal?: number; termOn?: number; tableAl?: number; lampOn?: number; hole?: [number, number, number] } = {}) {
  const lit = s.lit ?? 1
  isoFloor(ctx, a, o, 12, 0.09)
  pool(ctx, a, o, -0.3, 0.85, 3.6, 0.18 * (s.lampOn ?? 1))
  for (let i = 0; i < 4; i++) bank(ctx, a, o, i, { lit: 0.7 * lit, hole: s.hole && s.hole[0] === i ? [s.hole[1], s.hole[2]] : undefined })
  if (s.terminal) terminal(ctx, a, o, { al: s.terminal, on: s.termOn ?? 0 })
  table(ctx, a, o, s.tableAl ?? 1)
}

// ── 0 · THE FILE — a drawer slides out of the 2002 bank; one row card, crisp ───────────────
/** A row of the file as a floating card: labelled cells, crisp typed values; `hot` cells in red. */
function rowCard(ctx: C, a: SceneArgs, x: number, y: number, w: number, cols: { h: string; v: number; hot?: boolean }[], s: { al: number; hot: number; title: string; type: number }) {
  const KF = a.KF, pad = 14 * KF, rowH = 26 * KF, headH = 22 * KF, titleH = 22 * KF, h = pad * 2 + titleH + headH + rowH * 3
  if (s.al <= 0.01) return { x, y, w, h }
  ctx.save(); ctx.globalAlpha *= s.al
  ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(x + 6 * KF, y + 8 * KF, w, h)
  ctx.fillStyle = a.pal.bg; ctx.fillRect(x, y, w, h); ctx.fillStyle = ink(a, 0.05); ctx.fillRect(x, y, w, h)
  ctx.strokeStyle = ink(a, 0.5); ctx.lineWidth = Math.max(1, 1.1 * KF); ctx.strokeRect(x, y, w, h)
  mono(ctx, a, s.title, x + pad, y + pad + 10 * KF, 10.5, dim(a, 0.95))
  const cw = (w - pad * 2) / cols.length, ty = y + pad + titleH
  cols.forEach((c, i) => {
    const cx = x + pad + i * cw
    mono(ctx, a, c.h, cx + 4 * KF, ty + 13 * KF, 10, c.hot && s.hot > 0 ? red(a, 0.95) : ink(a, 0.8), { weight: 600 })
    for (let r = 0; r < 3; r++) {
      const ry = ty + headH + r * rowH, main = r === 1
      const vw = (cw - 14 * KF) * (main ? c.v : 0.35 + 0.5 * rnd(i * 5 + r)) * (main ? clamp01(s.type * cols.length - i) : 1)
      ctx.fillStyle = main ? ink(a, 0.92) : ink(a, 0.22); ctx.fillRect(cx + 4 * KF, ry + rowH * 0.42, vw, main ? 4 * KF : 2.5 * KF)
    }
    if (c.hot && s.hot > 0) { ctx.strokeStyle = red(a, 0.9 * s.hot); ctx.lineWidth = Math.max(1.4, 1.6 * KF); ctx.strokeRect(cx, ty + headH + rowH + 2 * KF, cw - 6 * KF, rowH - 4 * KF) }
    if (i) { ctx.fillStyle = ink(a, 0.14); ctx.fillRect(cx - 1, ty, 1, headH + rowH * 3) }
  })
  ctx.fillStyle = ink(a, 0.25); ctx.fillRect(x + pad, ty + headH - 2 * KF, w - pad * 2, 1)
  ctx.restore()
  return { x, y, w, h }
}

const file: SceneFn = (ctx, a) => {
  const { ls, W, H } = a, tall = isTall(a), c1 = cue(a, 1)
  const u = tall ? W * 0.08 : Math.min(W * 0.062, H * 0.108)
  const o = view(a, [-2.5, -1.3, 1.0], tall ? 0.6 : 0.33, tall ? 0.52 : 0.5, u, 0.05)
  const b = prog(ls, 0, 1800)
  isoFloor(ctx, a, o, 12, 0.1 * easeOut(b))
  pool(ctx, a, o, -3.3, -2.0, 3.2, 0.22 * b)
  pool(ctx, a, o, -0.3, 0.85, 3.2, 0.12 * b)
  const out = easeInOut(prog(ls, 1300, 1000)) * 1.1
  for (let i = 0; i < 4; i++) bank(ctx, a, o, i, { rise: prog(ls, i * 180, 1100), lit: i === 0 ? 1 : 0.45, hole: i === 0 && out > 0 ? [0, 2] : undefined })
  const lift = easeOut(prog(ls, 2300, 900)) * 0.55
  pulled(ctx, a, o, 0, 0, 2, out, { cards: 14, pitch: 0.075, lift })
  table(ctx, a, o, easeOut(prog(ls, 500, 1000)))
  // anyone could download it: copies drift from the drawer to readers at the table
  const readers: [number, number][] = [[-2.0, 1.85], [-0.5, 1.95], [1.1, 1.85]]
  readers.forEach(([rx, ry], k) => person(ctx, a, o, rx, ry, { al: prog(ls, 900 + k * 200, 500) }))
  const d0 = dpos(0, 0, 2), src = isoPt(o, d0.x + DW / 2, FY + 0.9, d0.z + DH + lift)
  if (ls > 2600) for (let k = 0; k < 3; k++) {
    const t = ((ls - 2600) / 2600 + k / 3) % 1, [rx, ry] = readers[k], dst = isoPt(o, rx, ry - 0.35, TB.z + 0.05)
    const px = lerp(src[0], dst[0], easeInOut(t)), py = lerp(src[1], dst[1], easeInOut(t)) - Math.sin(Math.PI * t) * u * 1.2
    ctx.save(); ctx.globalAlpha = Math.sin(Math.PI * t) * prog(ls, 2600, 500)
    ctx.translate(px, py); ctx.rotate(-0.3 + t * 0.6); ctx.fillStyle = ink(a, 0.85); ctx.fillRect(-u * 0.16, -u * 0.21, u * 0.32, u * 0.42)
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; for (let l = 0; l < 4; l++) ctx.fillRect(-u * 0.1, -u * 0.12 + l * u * 0.07, u * 0.2, Math.max(1, u * 0.02))
    ctx.restore()
  }
  vignette(ctx, a, 0.8)
  // card A: one file, downloadable
  const pA = prog(ls, 1500, 600) * (tall ? 1 - prog(ls, c1 - 300, 400) : 1)
  if (pA > 0) {
    const r = evCard(ctx, a, tall ? W * 0.05 : W * 0.04, H * (tall ? 0.12 : 0.13) + bob(a, 1), [
      { s: L(a, 'ONE FILE', 'UN ARCHIVO'), size: tall ? 24 : 30, font: 'serif', color: ink(a, 0.97) },
      { s: L(a, 'SINCE 2002 · ANYONE COULD DOWNLOAD', 'DESDE 2002 · DESCARGA LIBRE'), size: 10.5, color: dim(a, 0.95) },
    ], { al: pA })
    leader(ctx, a, src, edge(r, src), pA)
  }
  // card B: the row — who won, how much
  const pB = prog(ls, c1 - 200, 600)
  if (pB > 0) {
    const cols = tall
      ? [{ h: L(a, 'WHO WON', 'QUIÉN GANÓ'), v: 0.9, hot: true }, { h: L(a, 'HOW MUCH', 'CUÁNTO'), v: 0.62, hot: true }]
      : [{ h: L(a, 'PROCEDURE', 'PROCEDIMIENTO'), v: 0.7 }, { h: L(a, 'BUYER', 'COMPRADOR'), v: 0.8 }, { h: L(a, 'WHO WON', 'QUIÉN GANÓ'), v: 0.9, hot: true }, { h: L(a, 'HOW MUCH', 'CUÁNTO'), v: 0.62, hot: true }]
    const cw = tall ? W * 0.9 : W * 0.5, cx = tall ? W * 0.05 : W * 0.46, cy = H * (tall ? 0.12 : 0.15) + bob(a, 2)
    const r = rowCard(ctx, a, cx, cy, cw, cols, { al: pB, hot: prog(ls, c1 + 1600, 500), title: L(a, 'ONE ROW OF THE FILE', 'UNA FILA DEL ARCHIVO'), type: prog(ls, c1 + 200, 1400) })
    leader(ctx, a, src, [r.x + (tall ? r.w * 0.2 : 0), r.y + r.h * (tall ? 1 : 0.62)], pB)
  }
}

// ── 1 · BETTER WITH TIME — four banks rise, era by era; tax-ID tabs light 0.1% → 47.4% ────────
const TAGS = [0.001, 0.157, 0.303, 0.474]
const eras: SceneFn = (ctx, a) => {
  const { ls, W, H } = a, tall = isTall(a), c1 = cue(a, 1), c2 = cue(a, 2)
  const u = tall ? W * 0.092 : Math.min(W * 0.072, H * 0.1)
  const o = view(a, [-0.47, FY, 1.15], 0.5, tall ? 0.5 : 0.45, u, 0.035)
  isoFloor(ctx, a, o, 12, 0.1)
  pool(ctx, a, o, -0.5, -1.6, 5.2, 0.2)
  const tp = [prog(ls, c1 + 150, 300), prog(ls, c1 + 900, Math.max(900, (c2 - c1) * 0.4)), prog(ls, c1 + 900 + (c2 - c1) * 0.35, Math.max(900, (c2 - c1) * 0.4)), prog(ls, c2 + 100, 1600)]
  for (let i = 0; i < 4; i++) {
    const rise = prog(ls, 150 + i * Math.max(260, (c1 - 300) / 4), 900)
    bank(ctx, a, o, i, { rise, lit: 0.55 + 0.15 * i, tags: { frac: TAGS[i], p: tp[i], one: i === 0 } })
  }
  // the single tagged tab pulses
  const one = tagPt(o, 0, 512)
  if (tp[0] > 0) glow(ctx, one[0], one[1], u * 0.6 * (0.8 + 0.2 * Math.sin(ls * 0.006)), red(a, 0.45), red(a, 0))
  vignette(ctx, a, 0.75)
  // era plates over each bank, with the share once it has lit
  for (let i = 0; i < 4; i++) {
    const al = prog(ls, 150 + i * Math.max(260, (c1 - 300) / 4) + 600, 500)
    if (al <= 0) continue
    const tp0 = isoPt(o, bx(i) + BK.w * 0.5, FY - BK.d * 0.5, BK.h + 0.18)
    mono(ctx, a, ERAS[i], tp0[0], tp0[1], tall ? 10 : 11, ink(a, 0.9 * al), { align: 'center', weight: 600 })
    // the share sits under the era, on the bank's lit top
    if (i > 0 && i < 3 && tp[i] > 0.02) evCard(ctx, a, tp0[0], tp0[1] - (tall ? 40 : 50) * a.KF, [{ s: `${(TAGS[i] * 100).toFixed(1)}%`, size: tall ? 14 : 18, font: 'serif', color: red(a, 0.97) }], { al: clamp01(tp[i] * 3), accent: true, align: 'center', pad: 7 })
  }
  // card: the first bank — one tab in a thousand
  if (tp[0] > 0) {
    const r = evCard(ctx, a, tall ? W * 0.04 : W * 0.04, H * (tall ? 0.12 : 0.15) + bob(a, 1), [
      { s: L(a, 'SUPPLIER TAX ID', 'RFC DEL PROVEEDOR'), size: 10.5, color: dim(a, 0.95) },
      { s: L(a, '1 in 1,000', '1 de cada 1,000'), size: tall ? 22 : 30, font: 'serif', color: red(a, 0.97) },
      { s: '0.1% · 2002–2010', size: 10.5, color: ink(a, 0.8) },
    ], { al: prog(ls, c1 + 150, 500), accent: true })
    leader(ctx, a, one, [r.x + r.w, r.y + r.h * 0.6], prog(ls, c1 + 300, 600), true)
  }
  // card: the last bank — almost half
  if (tp[3] > 0) {
    const pd = tagPt(o, 3, 260)
    const r = evCard(ctx, a, W * 0.96, H * (tall ? 0.12 : 0.15) + bob(a, 2), [
      { s: L(a, 'BY 2023', 'PARA 2023'), size: 10.5, color: dim(a, 0.95) },
      { s: `${count(47.4, 1, 1, a.lang)}%`, size: tall ? 30 : 46, font: 'serif', color: red(a, 0.97) },
      { s: L(a, 'ALMOST HALF', 'CASI LA MITAD'), size: 10.5, color: ink(a, 0.8) },
    ], { al: prog(ls, c2, 500), accent: true, align: 'right' })
    leader(ctx, a, pd, [r.x, r.y + r.h * 0.6], prog(ls, c2 + 300, 600), true)
  }
}

// ── 2 · THINNER — two drawers pulled from the last bank; the newer one holds ~31% fewer ──────
const thin: SceneFn = (ctx, a) => {
  const { ls, W, H } = a, tall = isTall(a), c1 = cue(a, 1)
  const u = tall ? W * 0.13 : Math.min(W * 0.1, H * 0.15)
  const o = view(a, [2.35, FY + 1.1, 0.7], tall ? 0.5 : 0.5, tall ? 0.52 : 0.5, u, 0.045)
  isoFloor(ctx, a, o, 10, 0.1)
  pool(ctx, a, o, 2.4, FY + 1.4, 3.0, 0.22)
  const out = easeInOut(prog(ls, 200, 1100)) * 2.55
  bank(ctx, a, o, 2, { lit: 0.35 })
  bank(ctx, a, o, 3, { lit: 0.7, hole: [0, 3] })
  // the second drawer's slot is drawn by hand: both drawers are out
  const d1 = dpos(3, 1, 3), P = (px: number, py: number, pz: number) => isoPt(o, px, py, pz)
  if (out > 0) poly(ctx, [P(d1.x, FY, d1.z), P(d1.x + DW, FY, d1.z), P(d1.x + DW, FY, d1.z + DH), P(d1.x, FY, d1.z + DH)], 'rgba(0,0,0,0.85)')
  // both fill at the same pace; the newer one stops at 18 of 26
  const rate = Math.max(70, (c1 - 600) / 18)
  const nOld = clamp01((ls - 1100) / (rate * 26)) * 26, nNew = Math.min(18, clamp01((ls - 1100) / (rate * 26)) * 26)
  const gap = prog(ls, Math.max(c1 + 600, 1100 + rate * 26 + 200), 600)
  pulled(ctx, a, o, 3, 0, 3, out, { cards: nOld, pitch: 0.094 })
  pulled(ctx, a, o, 3, 1, 3, out, { cards: nNew, pitch: 0.094, gap })
  vignette(ctx, a, 0.75)
  const dl = dpos(3, 0, 3), lp = P(dl.x + DW * 0.5, FY + 1.3, dl.z + DH + 0.05), rp = P(d1.x + DW * 0.5, FY + 0.9, d1.z + DH + 0.05)
  const pl = prog(ls, 1400, 600)
  const rl = evCard(ctx, a, tall ? W * 0.04 : W * 0.06, H * (tall ? 0.13 : 0.2) + bob(a, 1), [{ s: L(a, 'THE 12 MONTHS BEFORE', 'LOS 12 MESES ANTERIORES'), size: tall ? 10 : 11, color: ink(a, 0.9) }], { al: pl })
  leader(ctx, a, lp, edge(rl, lp), pl)
  const rr = evCard(ctx, a, W * (tall ? 0.96 : 0.94), H * (tall ? 0.13 : 0.2) + bob(a, 2), [{ s: L(a, 'THE LAST 12 MONTHS', 'LOS ÚLTIMOS 12 MESES'), size: tall ? 10 : 11, color: ink(a, 0.9) }], { al: pl, align: 'right' })
  leader(ctx, a, rp, edge(rr, rp), pl)
  if (gap > 0) {
    const gp = P(d1.x + DW, FY + 0.06 + 18 * 0.094 + 0.35, d1.z + 0.05)
    const r = evCard(ctx, a, tall ? W * 0.96 : W * 0.94, H * (tall ? 0.24 : 0.33) + bob(a, 3), [
      { s: L(a, '≈ −31%', '≈ −31%'), size: tall ? 30 : 46, font: 'serif', color: red(a, 0.97) },
      { s: L(a, 'CONTRACTS IN THE FILE', 'CONTRATOS EN EL ARCHIVO'), size: 10.5, color: ink(a, 0.8) },
    ], { al: gap, accent: true, align: 'right' })
    leader(ctx, a, gp, [r.x, r.y + r.h * 0.5], gap, true)
  }
}

// ── 3 · THE LAST UPDATE — hush: a law page settles on the table; a date stamp on the last drawer ─
const law: SceneFn = (ctx, a) => {
  const { ls, W, H, KF } = a, tall = isTall(a), c1 = cue(a, 1)
  const u = tall ? W * 0.07 : Math.min(W * 0.062, H * 0.108)
  const fx = keyed(ls, [[0, -0.8], [c1 - 200, 1.4]], 1800)
  const o = view(a, [fx, -1.2, 1.0], 0.5, tall ? 0.56 : 0.55, u, 0.03)
  const land = easeInOut(prog(ls, 500, 2200)), dimSign = prog(ls, 2300, 1400)
  isoFloor(ctx, a, o, 12, 0.08)
  pool(ctx, a, o, -0.3, 0.85, 3.4, 0.2)
  pool(ctx, a, o, 2.5, -2.4, 2.2, 0.16 * prog(ls, c1, 900))
  for (let i = 0; i < 4; i++) bank(ctx, a, o, i, { lit: 0.6 })
  // the old portal's sign above the wall, lit, then dimmed once the new law lands
  const P = (px: number, py: number, pz: number) => isoPt(o, px, py, pz)
  const s0 = -2.2, s1 = 1.3, sz0 = BK.h + 0.25, sz1 = BK.h + 0.62
  isoBox(ctx, a, o, s0, BK.y + 0.2, s1 - s0, 0.12, sz1 - sz0, { z: sz0, lit: lerp(0.9, 0.3, dimSign) })
  const sc = P((s0 + s1) / 2, BK.y + 0.32, (sz0 + sz1) / 2)
  if (dimSign < 1) glow(ctx, sc[0], sc[1], u * 2.2, ink(a, 0.18 * (1 - dimSign)), ink(a, 0))
  onFace(ctx, P(s0 + 0.35, BK.y + 0.32, sz1 - 0.08), () => text(ctx, 'COMPRANET', 0, u * 0.22, { size: u * 0.26, font: 'mono', weight: 700, color: dimSign < 0.5 ? a.pal.bg : dim(a, 0.9), tracking: u * 0.06 }))
  table(ctx, a, o)
  // the law page settles flat on the table
  const pz = TB.z + 0.01 + (1 - land) * 1.6
  slipFlat(ctx, a, o, -0.85 + (1 - land) * 0.4, 0.42, pz, 1.1, 0.85, { al: prog(ls, 400, 600), lines: 6, seed: 4 })
  hangLamp(ctx, a, o, -0.3, 0.85, 1)
  const cone = isoPt(o, -0.3, 0.85, 2.2)
  motes(ctx, a, cone[0], cone[1], u * 1.2, 28, 0.55)
  vignette(ctx, a, 0.8)
  // card: the law
  const pl = prog(ls, 1800, 700)
  if (pl > 0) {
    const at = P(-0.3, 0.85, TB.z + 0.02)
    const r = evCard(ctx, a, tall ? W * 0.05 : W * 0.05, H * (tall ? 0.6 : 0.5) + bob(a, 1), [
      { s: L(a, 'APRIL 2025', 'ABRIL 2025'), size: tall ? 20 : 26, font: 'serif', color: ink(a, 0.97) },
      { s: L(a, 'A NEW PROCUREMENT LAW', 'NUEVA LEY DE ADQUISICIONES'), size: 10.5, color: dim(a, 0.95) },
    ], { al: pl })
    leader(ctx, a, at, edge(r, at), pl)
  }
  // the last drawer of the last bank: a date stamp, then the card
  const dl = dpos(3, 1, 4), lab = P(dl.x + DW * 0.5, FY, dl.z + DH * 0.7)
  const ps = prog(ls, c1 + 500, 520)
  if (ps > 0) {
    glow(ctx, lab[0], lab[1], u * 0.9, red(a, 0.2 * ps), red(a, 0))
    stamp(ctx, a, '28 · IX · 2025', lab[0], lab[1] - u * 0.05, { size: (tall ? 10 : 13) * KF, p: ps, rot: 0.5 })
    const r = evCard(ctx, a, W * (tall ? 0.95 : 0.94), H * (tall ? 0.13 : 0.14) + bob(a, 2), [
      { s: L(a, 'SEPTEMBER 28, 2025', '28 DE SEPTIEMBRE DE 2025'), size: tall ? 16 : 22, font: 'serif', color: red(a, 0.97) },
      { s: L(a, 'THE FILE’S LAST UPDATE', 'ÚLTIMA ACTUALIZACIÓN DEL ARCHIVO'), size: 10.5, color: ink(a, 0.8) },
    ], { al: prog(ls, c1 + 900, 700), accent: true, align: 'right' })
    leader(ctx, a, lab, edge(r, lab), prog(ls, c1 + 1100, 700), true)
  }
}

// ── 4 · STILL LISTED — the new portal: a terminal that never stops printing procedure slips ───
const still: SceneFn = (ctx, a) => {
  const { ls, W, H } = a, tall = isTall(a), c1 = cue(a, 1), c2 = cue(a, 2)
  const u = tall ? W * 0.1 : Math.min(W * 0.09, H * 0.16)
  const o = view(a, [3.9, -1.0, 0.9], tall ? 0.6 : 0.64, tall ? 0.46 : 0.43, u, 0.05)
  const on = prog(ls, c1 + 100, 500)
  room(ctx, a, o, { lit: 0.55, terminal: 1, termOn: on, lampOn: 0.6 })
  // buyers keep walking in with folders (the buying never stopped)
  for (let k = 0; k < 3; k++) {
    const t = (ls / 5200 + k / 3) % 1, x = lerp(1.0, 3.8, t), y = -1.45 + (k % 2) * 0.3
    person(ctx, a, o, x, y, { al: Math.sin(Math.PI * t) * prog(ls, 100, 600), folder: true, lift: 0.05 * Math.abs(Math.sin(ls * 0.01 + k)), h: 0.8 })
  }
  // slips: out of the slot, a short flight, then onto the growing heap
  const fy = TM.y + TM.d, slot: [number, number, number] = [TM.x + 0.5, fy, 0.65]
  const period = 360, nOut = ls > c1 ? Math.floor((ls - c1) / period) : 0
  const heap = Math.min(40, nOut)
  for (let k = 0; k < heap; k++) slipFlat(ctx, a, o, TM.x + 0.05 + rnd(k) * 0.3, fy + 0.7 + rnd(k * 3) * 0.2, k * 0.025, 0.55, 0.38, { lines: 3, seed: k })
  if (ls > c1) for (let j = 0; j < 3; j++) {
    const t = (((ls - c1) / period) - j) % 3 / 3
    if (t < 0) continue
    const y = lerp(slot[1], fy + 0.8, easeOut(t)), z = lerp(slot[2], heap * 0.025 + 0.05, t * t)
    slipFlat(ctx, a, o, TM.x + 0.2, y, z, 0.55, 0.38, { al: on, lines: 3, seed: j + nOut })
  }
  vignette(ctx, a, 0.75)
  // the portal's plate
  const top = isoPt(o, TM.x + TM.w * 0.5, TM.y + TM.d * 0.5, TM.h + 0.3)
  mono(ctx, a, L(a, 'THE NEW PORTAL', 'EL PORTAL NUEVO'), top[0], top[1] + bob(a, 1), tall ? 10 : 11, ink(a, 0.92 * on), { align: 'center', weight: 600 })
  // the count lands with the voice
  if (ls > c2) {
    const at = isoPt(o, TM.x + 0.3, fy + 0.8, heap * 0.025 + 0.1)
    const r = evCard(ctx, a, tall ? W * 0.05 : W * 0.05, H * (tall ? 0.13 : 0.16) + bob(a, 2), [
      { s: count(98290, 1, 0, a.lang), size: tall ? 34 : 60, font: 'serif', color: ink(a, 0.97) },
      { s: L(a, 'PROCEDURES · ITS FIRST YEAR', 'PROCEDIMIENTOS · SU PRIMER AÑO'), size: 10.5, color: dim(a, 0.95) },
    ], { al: prog(ls, c2, 400) })
    leader(ctx, a, at, edge(r, at), prog(ls, c2 + 300, 600))
  }
}

// ── 5 · WHERE THE ANSWERS WENT — the slip's two fields are empty; the answers are in a scan ────
const LETTER = ['ACTA DE FALLO', 'En la Ciudad de México, siendo las', 'horas del día, con fundamento en', 'el artículo de la Ley, se emite', 'el fallo del procedimiento:', 'SE ADJUDICA A:', '—————————————————', 'POR UN MONTO TOTAL DE:', '$ ——————————', 'Así lo resolvió el área contratante', 'para los efectos a que haya lugar.']
/** A scanned award letter as a photographed page: grey paper, uneven light, specks, soft text. */
function scanned(ctx: C, a: SceneArgs, x: number, y: number, w: number, h: number, s: { rot: number; blur: number; sharpTo?: number; al?: number; hi?: number }) {
  const al = s.al ?? 1
  if (al <= 0.01) return
  const KF = a.KF
  ctx.save(); ctx.globalAlpha *= al
  ctx.translate(x + w / 2, y + h / 2); ctx.rotate(s.rot); ctx.translate(-w / 2, -h / 2)
  ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(7 * KF, 9 * KF, w, h)
  ctx.fillStyle = ink(a, 0.74); ctx.fillRect(0, 0, w, h)
  const g = ctx.createLinearGradient(0, 0, w, h) // the scanner's uneven light
  g.addColorStop(0, 'rgba(0,0,0,0.02)'); g.addColorStop(0.6, 'rgba(0,0,0,0.12)'); g.addColorStop(1, 'rgba(0,0,0,0.32)')
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = 'rgba(0,0,0,0.35)' // specks from the glass
  for (let i = 0; i < 60; i++) ctx.fillRect(rnd(i * 2.1) * w, rnd(i * 5.3) * h, (0.6 + rnd(i) * 1.4) * KF, (0.6 + rnd(i * 9) * 1.2) * KF)
  ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(w * 0.97, 0, w * 0.03, h) // the page's shadowed edge
  const lh = h / (LETTER.length + 2.2), sz = Math.min(lh * 0.62, w * 0.052)
  LETTER.forEach((ln, i) => {
    const ly = lh * (1.4 + i) + (i === 0 ? 0 : lh * 0.4)
    const r = s.sharpTo != null && i < s.sharpTo ? 0 : s.blur
    fuzzy(ctx, ln, w * 0.09, ly, { size: i === 0 ? sz * 1.25 : sz, font: i === 0 || i === 5 || i === 7 ? 'mono' : 'serif', weight: i === 0 ? 700 : 500, color: 'rgba(0,0,0,0.85)' }, r)
  })
  if (s.hi && s.hi > 0) { // the two answers, boxed in red
    ctx.strokeStyle = red(a, 0.9 * s.hi); ctx.lineWidth = Math.max(1.4, 1.6 * KF)
    ctx.strokeRect(w * 0.06, lh * (1.4 + 5.4) - lh * 0.8, w * 0.84, lh * 1.9)
    ctx.strokeRect(w * 0.06, lh * (1.4 + 7.4) - lh * 0.8, w * 0.84, lh * 1.9)
  }
  ctx.restore()
}
/** where the two answer boxes sit on the letter, in screen space (same maths as scanned()). */
function scanBoxPt(x: number, y: number, w: number, h: number, rot: number, which: number): Pt {
  const lh = h / (LETTER.length + 2.2), lx = w * 0.06, ly = lh * (1.4 + (which ? 7.4 : 5.4)) + lh * 0.15
  const dx = lx - w / 2, dy = ly - h / 2
  return [x + w / 2 + dx * Math.cos(rot) - dy * Math.sin(rot), y + h / 2 + dx * Math.sin(rot) + dy * Math.cos(rot)]
}

const fields: SceneFn = (ctx, a) => {
  const { ls, W, H, KF } = a, tall = isTall(a), c1 = cue(a, 1), c2 = cue(a, 2)
  // the room behind, small and dim, the lamp over the table
  const u = tall ? W * 0.05 : Math.min(W * 0.04, H * 0.07)
  const o = view(a, [0, -1.0, 1.0], 0.5, 0.56, u, 0.03)
  room(ctx, a, o, { lit: 0.3, terminal: 0.6, termOn: 0.5, lampOn: 0.7 })
  hangLamp(ctx, a, o, -0.3, 0.85, 0.8)
  ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(0, 0, W, H)
  vignette(ctx, a, 0.7)
  // the slip, face on
  const sw = tall ? W * 0.62 : W * 0.34, sh = tall ? H * 0.4 : H * 0.56
  const sx = tall ? W * 0.05 : W * 0.1, sy = H * (tall ? 0.12 : 0.13) + bob(a, 1) * 0.5
  const pIn = easeOut(prog(ls, 100, 800))
  ctx.save(); ctx.globalAlpha = pIn; ctx.translate(0, (1 - pIn) * 30 * KF)
  ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(sx + 6 * KF, sy + 8 * KF, sw, sh)
  ctx.fillStyle = a.pal.bg; ctx.fillRect(sx, sy, sw, sh); ctx.fillStyle = ink(a, 0.06); ctx.fillRect(sx, sy, sw, sh)
  ctx.strokeStyle = ink(a, 0.6); ctx.lineWidth = Math.max(1, 1.2 * KF); ctx.strokeRect(sx, sy, sw, sh)
  const pad = sw * 0.07
  mono(ctx, a, L(a, 'PORTAL · PROCEDURE NOTICE', 'PORTAL · AVISO DE PROCEDIMIENTO'), sx + pad, sy + pad + 6 * KF, tall ? 9 : 10.5, dim(a, 0.95), { weight: 600 })
  const rows = [
    { h: L(a, 'PROCEDURE No.', 'No. DE PROCEDIMIENTO'), v: 0.7 }, { h: L(a, 'BUYER', 'COMPRADOR'), v: 0.85 }, { h: L(a, 'TYPE', 'TIPO'), v: 0.5 },
    { h: L(a, 'WHO WON', 'QUIÉN GANÓ'), v: -1 }, { h: L(a, 'HOW MUCH', 'CUÁNTO'), v: -1 },
  ]
  const hot = prog(ls, c1 + 300, 500), rh = (sh - pad * 2 - 20 * KF) / rows.length
  const boxes: Pt[] = []
  rows.forEach((r, i) => {
    const ry = sy + pad + 20 * KF + i * rh
    mono(ctx, a, r.h, sx + pad, ry + rh * 0.32, tall ? 9 : 10, r.v < 0 && hot > 0 ? red(a, 0.95) : ink(a, 0.8), { weight: 600 })
    const bx0 = sx + pad, by0 = ry + rh * 0.42, bw = sw - pad * 2, bh = rh * 0.42
    if (r.v >= 0) { ctx.fillStyle = ink(a, 0.9); ctx.fillRect(bx0, by0 + bh * 0.35, bw * r.v * clamp01(prog(ls, 400 + i * 180, 500) * 1.5), Math.max(2, 4 * KF)) }
    else {
      ctx.strokeStyle = hot > 0 ? red(a, 0.4 + 0.5 * hot) : ink(a, 0.45); ctx.lineWidth = Math.max(1, 1.2 * KF); ctx.setLineDash([4 * KF, 3 * KF]); ctx.strokeRect(bx0, by0, bw, bh); ctx.setLineDash([])
      if (hot > 0 && Math.floor(ls / 420) % 2 === 0) { ctx.fillStyle = red(a, 0.85); ctx.fillRect(bx0 + 6 * KF, by0 + bh * 0.2, 2 * KF, bh * 0.6) }
      boxes.push([bx0 + bw, by0 + bh / 2])
    }
  })
  ctx.restore()
  // the scanned letter slides in and clips on
  const pl = easeOut(prog(ls, c2, 900))
  const lw = tall ? W * 0.56 : W * 0.36, lhh = tall ? H * 0.36 : H * 0.6, rot = 0.045
  const lx = tall ? W * 0.4 : W * 0.54, ly = H * (tall ? 0.3 : 0.11) + bob(a, 2) * 0.5
  if (pl > 0) {
    const slide = (1 - pl) * W * 0.4
    scanned(ctx, a, lx + slide, ly, lw, lhh, { rot, blur: (tall ? 3.2 : 5) * KF, al: pl, hi: prog(ls, c2 + 1300, 500) })
    // the paperclip
    const cx = lx + slide + lw * 0.12, cy = ly - 6 * KF
    ctx.strokeStyle = ink(a, 0.85 * pl); ctx.lineWidth = Math.max(1.5, 2 * KF)
    ctx.beginPath(); ctx.roundRect(cx, cy, 14 * KF, 40 * KF, 7 * KF); ctx.stroke()
    ctx.beginPath(); ctx.roundRect(cx + 3.5 * KF, cy + 6 * KF, 7 * KF, 26 * KF, 3.5 * KF); ctx.stroke()
    const pr = prog(ls, c2 + 1500, 700)
    boxes.forEach((b, i) => leader(ctx, a, b, scanBoxPt(lx + slide, ly, lw, lhh, rot, i), pr, true))
    const pt = prog(ls, c2 + 2100, 600)
    if (pt > 0) evCard(ctx, a, tall ? sx : lx + lw * 0.5, tall ? sy + sh + 12 * KF : ly + lhh + 14 * KF, [{ s: L(a, 'A PICTURE OF TEXT', 'UNA IMAGEN DE TEXTO'), size: 10.5, color: ink(a, 0.9) }], { al: pt, align: tall ? 'left' : 'center' })
  }
}

// ── 6 · READ BACK — a reading machine pulls letters through; the text comes into focus ─────────
const read: SceneFn = (ctx, a) => {
  const { ls, W, H, KF } = a, tall = isTall(a), c1 = cue(a, 1)
  const u = tall ? W * 0.085 : Math.min(W * 0.072, H * 0.125)
  const o = view(a, [0.2, 0.8, 1.0], tall ? 0.5 : 0.44, tall ? 0.62 : 0.56, u, 0.05)
  isoFloor(ctx, a, o, 12, 0.09)
  pool(ctx, a, o, 0, 0.8, 4.2, 0.2)
  for (let i = 0; i < 4; i++) bank(ctx, a, o, i, { lit: 0.35 })
  table(ctx, a, o)
  const P = (px: number, py: number, pz: number) => isoPt(o, px, py, pz)
  const z = TB.z + 0.01, yA = TB.y + 0.25, MX = { x0: -0.55, x1: 0.55 }
  // the conveyor belt along the table
  poly(ctx, [P(TB.x + 0.1, yA - 0.05, z), P(TB.x + TB.w - 0.1, yA - 0.05, z), P(TB.x + TB.w - 0.1, yA + 0.85, z), P(TB.x + 0.1, yA + 0.85, z)], 'rgba(0,0,0,0.5)', ink(a, 0.25))
  // pages travel left → right; blurred before the lens, sharp after
  const speed = 0.00055, spacing = 1.05, run = TB.w - 0.9
  const pages: { x: number; s: number; k: number }[] = []
  for (let k = 0; k < 6; k++) {
    const x = TB.x + 0.15 + (((ls * speed) / spacing + k) % 5) * spacing - spacing * 0.4
    if (x < TB.x + 0.05 || x > TB.x + run) continue
    pages.push({ x, s: x + 0.75 > MX.x1 ? 1 : x + 0.75 < MX.x0 ? 0 : 0.5, k })
  }
  for (const p of pages) if (p.x + 0.75 < MX.x0 + 0.1 || p.x > MX.x1 - 0.1) slipFlat(ctx, a, o, p.x, yA, z, 0.75, 0.8, { sharp: p.x > MX.x1 - 0.1 ? 1 : 0.1, lines: 6, seed: p.k + Math.floor(ls * speed / spacing) })
  // the read pile at the end of the belt grows
  const pile = Math.min(18, Math.floor((ls * speed) / spacing * 1.2) + 2)
  for (let k = 0; k < pile; k++) slipFlat(ctx, a, o, TB.x + TB.w - 0.95 + rnd(k) * 0.06, yA + 0.02, z + k * 0.02, 0.75, 0.8, { lines: 6, seed: k + 40 })
  // the machine: body, rollers, the lens on top
  solidBox(ctx, a, o, MX.x0, yA - 0.2, MX.x1 - MX.x0, 1.25, 0.65, { z, lit: 0.8 })
  for (const rx of [MX.x0 - 0.06, MX.x1 + 0.0]) isoBox(ctx, a, o, rx, yA - 0.1, 0.06, 1.05, 0.12, { z, lit: 0.5 + 0.3 * Math.sin(ls * 0.012) })
  const lc = P((MX.x0 + MX.x1) / 2, yA + 0.42, z + 0.65), lr = u * 0.42
  ctx.save(); ctx.translate(lc[0], lc[1]); ctx.scale(1, 0.55)
  ctx.fillStyle = 'rgba(0,0,0,0.8)'; ctx.beginPath(); ctx.arc(0, 0, lr, 0, TAU); ctx.fill()
  ctx.strokeStyle = ink(a, 0.85); ctx.lineWidth = Math.max(1.5, 2 * KF); ctx.stroke()
  const gl = ctx.createRadialGradient(-lr * 0.3, -lr * 0.3, 0, 0, 0, lr); gl.addColorStop(0, ink(a, 0.5)); gl.addColorStop(1, ink(a, 0.05))
  ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(0, 0, lr * 0.8, 0, TAU); ctx.fill()
  ctx.restore()
  // the scan beam: a thin bright line across the belt under the machine's mouth
  const beam = P(MX.x1 + 0.02, yA - 0.05, z + 0.005), beam2 = P(MX.x1 + 0.02, yA + 0.85, z + 0.005)
  ctx.strokeStyle = ink(a, 0.6 + 0.3 * Math.sin(ls * 0.02)); ctx.lineWidth = Math.max(1.5, 2 * KF); ctx.beginPath(); ctx.moveTo(beam[0], beam[1]); ctx.lineTo(beam2[0], beam2[1]); ctx.stroke()
  hangLamp(ctx, a, o, 0, 0.8, 0.7, 3.4)
  vignette(ctx, a, 0.75)
  // the lens view: the letter sharpening line by line as the scan passes
  const lensR = tall ? W * 0.23 : Math.min(W * 0.15, H * 0.22)
  const LX = tall ? W * 0.5 : W * 0.78, LY = H * (tall ? 0.31 : 0.36)
  const pv = prog(ls, 600, 700)
  if (pv > 0) {
    ctx.save(); ctx.globalAlpha = pv
    leader(ctx, a, lc, [LX - lensR * 0.7, LY + lensR * 0.7], pv)
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.beginPath(); ctx.arc(LX + 6 * KF, LY + 8 * KF, lensR, 0, TAU); ctx.fill()
    ctx.save(); ctx.beginPath(); ctx.arc(LX, LY, lensR, 0, TAU); ctx.clip()
    ctx.fillStyle = ink(a, 0.76); ctx.fillRect(LX - lensR, LY - lensR, lensR * 2, lensR * 2)
    const cyc = ((ls - 600) % 3000) / 3000, lh = lensR * 0.2, sz = lensR * 0.115
    const scanY = LY - lensR + cyc * lensR * 2.4
    for (let i = 0; i < 9; i++) {
      const ln = LETTER[(i + 3 * Math.floor((ls - 600) / 3000)) % LETTER.length], ly = LY - lensR + lh * (i + 1)
      fuzzy(ctx, ln, LX - lensR * 0.86, ly, { size: sz, font: ln === ln.toUpperCase() ? 'mono' : 'serif', color: 'rgba(0,0,0,0.88)', weight: 600 }, ly < scanY ? 0 : 3.2 * KF)
    }
    ctx.fillStyle = red(a, 0.8); ctx.fillRect(LX - lensR, scanY, lensR * 2, Math.max(1.5, 2 * KF))
    glow(ctx, LX, scanY, lensR * 0.5, red(a, 0.12), red(a, 0))
    ctx.restore()
    ctx.strokeStyle = ink(a, 0.9); ctx.lineWidth = Math.max(2, 3 * KF); ctx.beginPath(); ctx.arc(LX, LY, lensR, 0, TAU); ctx.stroke()
    ctx.restore()
  }
  // the count
  if (ls > c1) {
    evCard(ctx, a, tall ? W * 0.05 : W * 0.05, H * (tall ? 0.11 : 0.13) + bob(a, 2), [
      { s: count(76774, 1, 0, a.lang), size: tall ? 32 : 54, font: 'serif', color: ink(a, 0.97) },
      { s: L(a, 'AWARD LETTERS · READ BY MACHINE', 'ACTAS DE FALLO · LEÍDAS POR COMPUTADORA'), size: tall ? 9.5 : 10.5, color: dim(a, 0.95) },
    ], { al: prog(ls, c1, 400) })
  }
}

// ── 7 · WHAT CAME BACK — two fields of slips laid on the floor, to scale ─────────────────────
const found: SceneFn = (ctx, a) => {
  const { ls, W, H } = a, tall = isTall(a), c1 = cue(a, 1), c2 = cue(a, 2)
  const u = tall ? W * 0.06 : Math.min(W * 0.052, H * 0.095)
  // one slip ≈ 500 procedures: 105 with a price, 78 with none
  const A = { n: 105, cols: 10, x: -2.3, y: -2.53 }, B = { n: 78, cols: 10, x: -2.3, y: -1.84 }
  const oA = tall ? view(a, [0, 0, 0], 0.31, 0.36, u, 0.03) : view(a, [0, 0, 0], 0.27, 0.5, u, 0.04)
  const o = tall ? view(a, [0, 0, 0], 0.69, 0.57, u, 0.03) : view(a, [0, 0, 0], 0.73, 0.5, u, 0.04)
  isoFloor(ctx, a, oA, 12, 0.08)
  pool(ctx, a, oA, 0, 0, 4.6, 0.2)
  pool(ctx, a, o, 0, 0, 3.8, 0.1 * prog(ls, c2, 800))
  const pitch = 0.46, sw = 0.38, sd = 0.3
  const sweep = ((ls * 0.0003) % 1.6) - 0.3
  for (let k = 0; k < A.n; k++) {
    const c = k % A.cols, r = Math.floor(k / A.cols), ap = prog(ls, 200 + (c + r) * 70, 380)
    if (ap <= 0) continue
    const z = (1 - easeOut(ap)) * 1.2, near = Math.max(0, 1 - Math.abs(c / A.cols - sweep) * 6)
    slipFlat(ctx, a, oA, A.x + c * pitch, A.y + r * pitch, z, sw, sd, { al: ap * (0.85 + 0.15 * near), lines: 3, seed: k })
  }
  for (let k = 0; k < B.n; k++) {
    const c = k % B.cols, r = Math.floor(k / B.cols), ap = prog(ls, c2 + 100 + (c + r) * 55, 380)
    if (ap <= 0) continue
    slipFlat(ctx, a, o, B.x + c * pitch, B.y + r * pitch, 0, sw, sd, { al: ap, empty: 1, accent: true, lines: 3, seed: k })
  }
  vignette(ctx, a, 0.75)
  const KF = a.KF
  // cards
  const atA = isoPt(oA, A.x + 1.0, A.y + 0.6), atB = isoPt(o, B.x + 4.4, B.y + 0.4)
  const pa = prog(ls, 600, 500)
  const ra = evCard(ctx, a, tall ? W * 0.05 : W * 0.04, H * (tall ? 0.12 : 0.13) + bob(a, 1), [
    { s: count(52537, 1, 0, a.lang), size: tall ? 26 : 40, font: 'serif', color: ink(a, 0.97) },
    { s: L(a, 'PROCEDURES WITH A PRICE', 'PROCEDIMIENTOS CON MONTO'), size: 10.5, color: dim(a, 0.95) },
  ], { al: pa })
  leader(ctx, a, atA, edge(ra, atA), pa)
  const pm = prog(ls, c1, 500)
  if (pm > 0) {
    evCard(ctx, a, ra.x, ra.y + ra.h + 10 * KF, [
      { s: L(a, `${count(356, 1, 0, a.lang)} billion pesos`, `${count(356, 1, 0, a.lang)} mil millones de pesos`), size: tall ? 18 : 26, font: 'serif', color: ink(a, 0.97) },
    ], { al: pm })
  }
  const pb = prog(ls, c2 + 200, 500)
  if (pb > 0) {
    const rb = evCard(ctx, a, W * 0.96, H * (tall ? 0.3 : 0.13) + bob(a, 2), [
      { s: count(38974, 1, 0, a.lang), size: tall ? 26 : 40, font: 'serif', color: red(a, 0.97) },
      { s: L(a, 'NO AMOUNT ANYWHERE', 'SIN MONTO EN NINGÚN LADO'), size: 10.5, color: ink(a, 0.85) },
    ], { al: pb, accent: true, align: 'right' })
    leader(ctx, a, atB, edge(rb, atB), pb, true)
  }
  const pk = prog(ls, 1400, 600)
  if (pk > 0) mono(ctx, a, L(a, '1 SLIP ≈ 500 PROCEDURES', '1 HOJA ≈ 500 PROCEDIMIENTOS'), W * 0.96, H * 0.72, 10, dim(a, 0.9 * pk), { align: 'right' })
}

// ── 8 · READ WITH CARE — the 356B tray; four slips lifted under a magnifier, each tagged ───────
const blur: SceneFn = (ctx, a) => {
  const { ls, W, H, KF } = a, tall = isTall(a), c1 = cue(a, 1), c2 = cue(a, 2), c3 = cue(a, 3)
  const u = tall ? W * 0.085 : Math.min(W * 0.078, H * 0.135)
  const o = view(a, [0.4, 0.85, 0.8], tall ? 0.46 : 0.44, tall ? 0.58 : 0.56, u, 0.04)
  isoFloor(ctx, a, o, 12, 0.08)
  pool(ctx, a, o, -0.3, 0.85, 3.8, 0.2)
  for (let i = 0; i < 4; i++) bank(ctx, a, o, i, { lit: 0.3 })
  table(ctx, a, o)
  const P = (px: number, py: number, pz: number) => isoPt(o, px, py, pz)
  // the tray: a long box of slips = 356B; the last 20.8% (74B) is the four procedures
  const t0 = TB.x + 0.2, tl = TB.w - 0.4, ty = TB.y + 0.35, td = 0.6, z = TB.z
  const cut = t0 + tl * (1 - 74 / 356)
  solidBox(ctx, a, o, t0, ty, cut - t0, td, 0.18, { z, lit: 0.7 })
  const lift = easeOut(prog(ls, c2 + 600, 1000))
  solidBox(ctx, a, o, cut + 0.02, ty, t0 + tl - cut - 0.02, td, 0.18, { z, lit: 0.95, alpha: 1 - 0.65 * lift })
  ctx.save(); ctx.setLineDash([3 * KF, 3 * KF])
  const q0 = P(cut + 0.01, ty, z), q1 = P(cut + 0.01, ty + td, z), q2 = P(cut + 0.01, ty + td, z + 0.3), q3 = P(cut + 0.01, ty, z + 0.3)
  poly(ctx, [q0, q1, q2, q3], undefined, ink(a, 0.55 * prog(ls, c2 + 200, 500)), Math.max(1, KF))
  ctx.restore()
  // four slips rise from that end and hang in the air
  const slips: Pt[] = []
  for (let k = 0; k < 4; k++) {
    const sx = cut + 0.05 + k * 0.22, sz = z + 0.25 + lift * (0.6 + 0.12 * Math.sin(ls * 0.0015 + k)) + k * 0.06
    if (lift > 0) slipFlat(ctx, a, o, sx, ty + 0.1, sz, 0.36, 0.42, { al: lift, lines: 3, seed: k + 9, sharp: 0.3 })
    slips.push(P(sx + 0.18, ty + 0.3, sz))
  }
  hangLamp(ctx, a, o, -0.3, 0.85, 0.85, 3.4)
  vignette(ctx, a, 0.75)
  // the magnifier glides over the four slips: inside it, their amounts read double
  const pm = prog(ls, c2 + 1400, 800)
  if (pm > 0) {
    const sweep = 0.5 + 0.5 * Math.sin((ls - c2) * 0.0011)
    const mx = lerp(slips[0][0], slips[3][0], sweep), my = lerp(slips[0][1], slips[3][1], sweep) - u * 0.25, mr = u * 0.62
    ctx.save(); ctx.globalAlpha = pm
    ctx.beginPath(); ctx.arc(mx, my, mr, 0, TAU); ctx.fillStyle = ink(a, 0.08); ctx.fill()
    ctx.save(); ctx.clip()
    const sz = mr * 0.32
    fuzzy(ctx, '$ —,———', mx - mr * 0.7, my - mr * 0.05, { size: sz, font: 'mono', color: ink(a, 0.9), weight: 700 }, 3 * KF)
    fuzzy(ctx, '$ —,———', mx - mr * 0.55, my + mr * 0.12, { size: sz, font: 'mono', color: ink(a, 0.6), weight: 700 }, 3 * KF)
    ctx.restore()
    ctx.strokeStyle = ink(a, 0.9); ctx.lineWidth = Math.max(2, 3 * KF); ctx.beginPath(); ctx.arc(mx, my, mr, 0, TAU); ctx.stroke()
    ctx.lineWidth = Math.max(3, 5 * KF); ctx.beginPath(); ctx.moveTo(mx + mr * 0.72, my + mr * 0.72); ctx.lineTo(mx + mr * 1.5, my + mr * 1.5); ctx.stroke()
    ctx.restore()
  }
  // a tag hangs from each slip
  const pt = prog(ls, c3 + 100, 700)
  if (pt > 0) slips.forEach((s, k) => {
    const tp = prog(ls, c3 + 100 + k * 160, 500), sx = s[0] + Math.sin(ls * 0.002 + k) * 2 * KF, ey = s[1] + u * 0.55 * easeBack(tp)
    if (tp <= 0) return
    ctx.strokeStyle = dim(a, 0.85); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(s[0], s[1]); ctx.lineTo(sx, ey); ctx.stroke()
    const tw = 18 * KF, th = 11 * KF
    poly(ctx, [[sx - tw / 2, ey], [sx + tw / 2, ey], [sx + tw / 2, ey + th], [sx - tw / 2, ey + th]], a.pal.bg, ink(a, 0.85 * tp), Math.max(1, KF))
    ctx.fillStyle = red(a, 0.9 * tp); ctx.beginPath(); ctx.arc(sx, ey + 2.5 * KF, 1.5 * KF, 0, TAU); ctx.fill()
    ctx.strokeStyle = ink(a, 0.85 * tp); ctx.beginPath(); ctx.moveTo(sx - 4 * KF, ey + th * 0.62); ctx.lineTo(sx - 1 * KF, ey + th * 0.85); ctx.lineTo(sx + 5 * KF, ey + th * 0.4); ctx.stroke()
  })
  // cards: the total, what it covers, the four, the check
  const at0 = P(t0 + 0.4, ty, z + 0.18)
  const r0 = evCard(ctx, a, tall ? W * 0.05 : W * 0.04, H * (tall ? 0.12 : 0.13) + bob(a, 1), [
    { s: L(a, '356 billion pesos', '356 mil millones de pesos'), size: tall ? 18 : 26, font: 'serif', color: ink(a, 0.97) },
    { s: L(a, 'DIRECT AWARDS ONLY', 'SOLO ADJUDICACIONES DIRECTAS'), size: 10.5, color: prog(ls, c1, 400) > 0 ? ink(a, 0.9) : 'rgba(0,0,0,0)' },
  ], { al: prog(ls, 300, 600) })
  leader(ctx, a, at0, edge(r0, at0), prog(ls, 500, 600))
  const p4 = prog(ls, c2 + 900, 600)
  if (p4 > 0) {
    const r4 = evCard(ctx, a, W * 0.96, H * (tall ? 0.25 : 0.13) + bob(a, 2), [
      { s: L(a, '4 procedures', '4 procedimientos'), size: tall ? 16 : 22, font: 'serif', color: ink(a, 0.97) },
      { s: L(a, '74 BILLION OF IT', '74 MIL MILLONES DE ESE TOTAL'), size: 10.5, color: dim(a, 0.95) },
      { s: L(a, 'A MACHINE READING SCANS ERRS', 'UNA MÁQUINA QUE LEE ESCANEOS SE EQUIVOCA'), size: 9.5, color: dim(a, 0.8) },
    ], { al: p4, align: 'right' })
    leader(ctx, a, slips[3], edge(r4, slips[3]), p4)
    if (pt > 0) evCard(ctx, a, W * 0.96, r4.y + r4.h + 10 * KF, [{ s: L(a, 'EACH: CHECK AGAINST ITS LETTER', 'CADA UNO: COTEJAR CON SU ACTA'), size: 10.5, color: ink(a, 0.95) }], { al: pt, align: 'right' })
  }
}

// ── 9 · NOT YET COMPARABLE — a card wheel: 78 of 100 tabs direct; then two drawers that don't fit ─
const direct: SceneFn = (ctx, a) => {
  const { ls, W, H, KF } = a, tall = isTall(a), c1 = cue(a, 1), c2 = cue(a, 2), c3 = cue(a, 3)
  const u = tall ? W * 0.08 : Math.min(W * 0.064, H * 0.112)
  const fx = keyed(ls, [[0, -1.2], [c1, 0.9]], 2200)
  const o = view(a, [fx, -0.6, 0.9], 0.5, tall ? 0.56 : 0.54, u, 0.02)
  isoFloor(ctx, a, o, 12, 0.08)
  pool(ctx, a, o, -1.3, 0.9, 3.0, 0.2)
  pool(ctx, a, o, 2.6, -2.2, 2.6, 0.18 * prog(ls, c2, 800))
  const P = (px: number, py: number, pz: number) => isoPt(o, px, py, pz)
  // the wall, with one empty slot in the last bank (where the old drawer came from)
  const old = easeInOut(prog(ls, c2 + 100, 1000))
  for (let i = 0; i < 4; i++) bank(ctx, a, o, i, { lit: i === 3 ? 0.75 : 0.35, hole: i === 3 && old > 0 ? [0, 3] : undefined })
  // the old drawer, labelled CONTRACTS
  pulled(ctx, a, o, 3, 0, 3, old * 1.4, { cards: 14, pitch: 0.09 })
  // the portal's tray, a different shape, tries the neighbouring slot and does not fit
  const d1 = dpos(3, 1, 3)
  const tr = prog(ls, c3 + 100, 1400), bump = tr > 0.5 ? Math.sin((tr - 0.5) * 30) * Math.exp(-(tr - 0.5) * 8) * 0.12 : 0
  if (tr > 0) {
    const ty0 = FY + lerp(3.4, 0.25, easeOut(Math.min(1, tr * 2))) + bump, tw = DW * 1.45, th = DH * 0.62
    poly(ctx, [P(d1.x, FY, d1.z), P(d1.x + DW, FY, d1.z), P(d1.x + DW, FY, d1.z + DH), P(d1.x, FY, d1.z + DH)], `rgba(0,0,0,${0.85 * tr})`)
    solidBox(ctx, a, o, d1.x - 0.1, ty0, tw, 1.1, th, { z: d1.z - 0.25, lit: 0.9, alpha: clamp01(tr * 3) })
    for (let k = 0; k < 9; k++) isoBox(ctx, a, o, d1.x - 0.02 + (k % 3) * 0.33, ty0 + 0.12 + Math.floor(k / 3) * 0.3, 0.26, 0.2, 0.06, { z: d1.z - 0.25 + th, alpha: clamp01(tr * 3), lit: 1 })
  }
  table(ctx, a, o)
  // the card wheel on the table: 100 cards round an axle, 78 with a red tab
  const cx = -1.3, cy = 0.85, cz = TB.z + 0.55, R = 0.5, rot = ls * 0.0004
  isoBox(ctx, a, o, cx - 0.5, cy - 0.06, 0.06, 0.12, 0.55, { z: TB.z, lit: 0.6 })
  const order: { k: number; d: number }[] = []
  for (let k = 0; k < 100; k++) { const th = (k / 100) * TAU + rot; order.push({ k, d: Math.cos(th) }) }
  order.sort((p, q) => p.d - q.d)
  const lit = ls > 300 ? clamp01((ls - 300) / Math.max(1200, c1 - 900)) * 100 : 0
  for (const { k } of order) {
    const th = (k / 100) * TAU + rot, ry = Math.cos(th), rz = Math.sin(th)
    const p0 = P(cx - 0.42, cy + ry * 0.12, cz + rz * 0.12), p1 = P(cx + 0.42, cy + ry * 0.12, cz + rz * 0.12)
    const p2 = P(cx + 0.42, cy + ry * R, cz + rz * R), p3 = P(cx - 0.42, cy + ry * R, cz + rz * R)
    const isDirect = (k * 37) % 100 < 78, shade = 0.3 + 0.5 * (0.5 + 0.5 * ry)
    poly(ctx, [p0, p1, p2, p3], ink(a, shade), 'rgba(0,0,0,0.35)', 0.6)
    if (isDirect && k < lit) {
      const t0 = P(cx + 0.18, cy + ry * R, cz + rz * R), t1 = P(cx + 0.38, cy + ry * R, cz + rz * R), t2 = P(cx + 0.38, cy + ry * (R + 0.09), cz + rz * (R + 0.09)), t3 = P(cx + 0.18, cy + ry * (R + 0.09), cz + rz * (R + 0.09))
      poly(ctx, [t0, t1, t2, t3], red(a, 0.6 + 0.35 * (0.5 + 0.5 * ry)))
    }
  }
  isoBox(ctx, a, o, cx + 0.44, cy - 0.06, 0.06, 0.12, 0.55, { z: TB.z, lit: 0.8 })
  hangLamp(ctx, a, o, -1.3, 0.85, 0.85, 3.2)
  vignette(ctx, a, 0.75)
  // cards
  const wc = P(cx, cy, cz + R + 0.1)
  const p78 = prog(ls, 500, 600) * (1 - (tall ? 1 : 0.5) * prog(ls, c2, 600))
  const r78 = evCard(ctx, a, tall ? W * 0.05 : W * 0.04, H * (tall ? 0.12 : 0.13) + bob(a, 1), [
    { s: `${count(78, 1, 0, a.lang)}%`, size: tall ? 30 : 46, font: 'serif', color: red(a, 0.97) },
    { s: L(a, 'DIRECT AWARDS', 'ADJUDICACIONES DIRECTAS'), size: 10.5, color: ink(a, 0.9) },
    { s: L(a, 'OF THE PROCEDURES WE COULD READ', 'DE LOS PROCEDIMIENTOS LEÍDOS'), size: 9.5, color: dim(a, 0.9) },
  ], { al: p78, accent: true })
  leader(ctx, a, wc, edge(r78, wc), p78, true)
  const pq = prog(ls, c1 + 200, 600)
  if (pq > 0) {
    const q = isoPt(o, 0.8, -1.2, 2.0)
    text(ctx, '?', q[0], q[1] + bob(a, 4), { size: 64 * KF, color: ink(a, 0.85 * pq * (1 - 0.6 * prog(ls, c2, 600))), align: 'center' })
  }
  const d0 = dpos(3, 0, 3)
  const pc = prog(ls, c2 + 700, 600)
  if (pc > 0) {
    const at = P(d0.x + DW * 0.5, FY + 1.45, d0.z + DH * 0.6)
    const r = evCard(ctx, a, tall ? W * 0.05 : W * 0.48, H * (tall ? 0.6 : 0.62) + bob(a, 2), [{ s: L(a, 'THE OLD FILE · CONTRACTS', 'EL ARCHIVO VIEJO · CONTRATOS'), size: 10.5, color: ink(a, 0.92) }], { al: pc })
    leader(ctx, a, at, edge(r, at), pc)
  }
  if (tr > 0.2) {
    const at = P(d1.x + DW * 0.6, FY + 1.0, d1.z + 0.15)
    const r = evCard(ctx, a, W * 0.96, H * (tall ? 0.28 : 0.3) + bob(a, 3), [{ s: L(a, 'THE PORTAL · PROCEDURES', 'EL PORTAL · PROCEDIMIENTOS'), size: 10.5, color: ink(a, 0.92) }], { al: prog(ls, c3 + 400, 500), align: 'right' })
    leader(ctx, a, at, edge(r, at), prog(ls, c3 + 500, 500))
  }
  const ps = prog(ls, c3 + 900, 520)
  if (ps > 0) stamp(ctx, a, L(a, 'NOT YET COMPARABLE', 'AÚN NO COMPARABLE'), W * (tall ? 0.5 : 0.72), H * (tall ? 0.18 : 0.16), { size: (tall ? 13 : 17) * KF, p: ps, rot: -0.05, color: ink(a, 0.92) })
}

// ── 10 · STILL LEGIBLE — the room in soft focus; under the lamp, one letter comes clear ────────
const end: SceneFn = (ctx, a) => {
  const { ls, W, H, KF } = a, tall = isTall(a), c1 = cue(a, 1), c3 = cue(a, 3)
  const u = tall ? W * 0.06 : Math.min(W * 0.05, H * 0.088)
  const o = view(a, [0, -1.0, 0.9], 0.5, tall ? 0.52 : 0.5, u, 0.05)
  const soft = easeInOut(prog(ls, c1, 1600)) * (1 - 0.35 * easeInOut(prog(ls, c3, 2000)))
  const canBlur = 'filter' in ctx
  if (canBlur && soft > 0.02) ctx.filter = `blur(${(soft * 3.2 * KF).toFixed(2)}px)`
  room(ctx, a, o, { lit: 0.6, terminal: 1, termOn: 0.6, lampOn: 1 })
  // the reading machine, still on the table
  solidBox(ctx, a, o, -0.55, TB.y + 0.05, 1.1, 1.0, 0.6, { z: TB.z, lit: 0.6 })
  if (canBlur) ctx.filter = 'none'
  // under the lamp, one letter lies open and comes back into focus
  const pz = TB.z + 0.01, fr = 1 - easeInOut(prog(ls, c3, 1800))
  slipFlat(ctx, a, o, 0.7, 0.35, pz, 1.0, 1.0, { lines: 7, seed: 31, sharp: lerp(0.15, 1, 1 - fr) })
  hangLamp(ctx, a, o, 1.2, 0.85, 1, 3.0)
  const cone = isoPt(o, 1.2, 0.85, 2.0)
  motes(ctx, a, cone[0], cone[1], u * 1.1, 26, 0.5)
  vignette(ctx, a, 0.82)
  // the lens over the letter — its words sharpen last
  const LR = tall ? W * 0.2 : Math.min(W * 0.12, H * 0.18), LX = tall ? W * 0.5 : W * 0.78, LY = H * (tall ? 0.24 : 0.3)
  const pl = prog(ls, 400, 900)
  if (pl > 0) {
    const at = isoPt(o, 1.2, 0.85, pz)
    ctx.save(); ctx.globalAlpha = pl
    leader(ctx, a, at, [LX - LR * 0.7, LY + LR * 0.7], pl)
    ctx.beginPath(); ctx.arc(LX, LY, LR, 0, TAU); ctx.save(); ctx.clip()
    ctx.fillStyle = ink(a, 0.76); ctx.fillRect(LX - LR, LY - LR, LR * 2, LR * 2)
    for (let i = 0; i < 6; i++) {
      const ln = LETTER[i + 4], ly = LY - LR * 0.62 + i * LR * 0.25
      fuzzy(ctx, ln, LX - LR * 0.85, ly, { size: LR * 0.13, font: ln === ln.toUpperCase() ? 'mono' : 'serif', color: 'rgba(0,0,0,0.88)', weight: 600 }, lerp(0, 3.4 * KF, clamp01(fr * 1.3 - i * 0.06)) * (0.4 + 0.6 * soft + 0.4 * (1 - prog(ls, c1, 600))))
    }
    ctx.restore()
    ctx.strokeStyle = ink(a, 0.9); ctx.lineWidth = Math.max(2, 3 * KF); ctx.beginPath(); ctx.arc(LX, LY, LR, 0, TAU); ctx.stroke()
    ctx.restore()
  }
}

export const scenes: Record<string, SceneFn> = { file, eras, thin, law, still, fields, read, found, blur, direct, end }
