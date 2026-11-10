/**
 * Phone discs — spec .claude/designs/atlas-2026-10-02-spec.md §4 (Kepler Orrery: the same
 * shared radial share scale as the desktop sky, §2.3).
 *
 *  - SystemDisc: one fixed 358 px disc of a star system, drawn from the system payload with
 *    the §2.3 formulas (orbitR on share, θ on the year of arrival), the engraved share rings,
 *    sexenio spokes and the seam. Tap only (hit ≥ 12 px), `touch-action: pan-y`, no d3-zoom.
 *    Positions sit mid-year: the phone never fetches planets.bin, so the within-year slot
 *    (arbitrary anyway, stamped) is not known here. Label budget 12.
 *  - MoonDisc: a planet's 100 largest contracts, date as angle and log amount as distance
 *    (§2.5), with the engraved amount rings.
 *  - SectorThumb: a static 40 px disc of a sector's stars from the manifest, drawn once.
 *
 * Instruments I-S3 (spec .claude/designus/atlas-instruments-2026-10-03/spec-draft.md §3.4, §3.7): SystemDisc takes a
 * `px` size (the twin plate's 440 / 384 discs) and the diff's marks — arrival «+», departure ring, stays-only
 * whiskers ≥ 8 px — drawn on the same mid-year positions; a refused period hatches the disc. Bodies never move.
 */
import { useEffect, useRef } from 'react'
import { ADMINISTRATIONS } from '@/lib/administrations'
import { DATA_LAST_YEAR, MAPA_SECTOR_COLORS as SECTOR_COLORS } from '@/lib/constants'
import { formatEntityName } from '@/lib/entity/format'
import { AMOUNT_RINGS, MOON_R, R_CORE, moonL, orbitR, riskClass, starPx, theta, type SkyManifest, type SkySystem } from '@/lib/atlas/sky/geometry'
import type { Moon } from '@/lib/atlas/sky/use-vendor-contracts'
import type { SkyLayers } from '@/lib/atlas/sky/useSky'
import type { ApagonMoon, SkyOverlay } from '../SkyEngine'

export const DISC_PX = 358
const css = (name: string, fb: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fb
// CYAN-2: one accent — high and critical share the red, medium is quiet (desktop SkyEngine readColors)
const riskHue = () => [css('--color-risk-low', 'gray'), css('--color-text-muted', 'gray'), css('--color-risk-critical', 'red'), css('--color-risk-critical', 'red')]
const planetPxOf = (v: number) => 3.5 + 1.25 * Math.min(4, Math.max(0, Math.log10(Math.max(v, 1) / 1e7)))

function setup(c: HTMLCanvasElement, size: number) {
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  c.width = size * dpr
  c.height = size * dpr
  const ctx = c.getContext('2d')!
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, size, size)
  return ctx
}

/** rings, spokes, seam and the lit sexenio wedge, centred in a `size` square of radius R */
function engrave(ctx: CanvasRenderingContext2D, size: number, R: number, ringR: number[], period: number | null) {
  const c = size / 2, ink = css('--color-text-primary', 'black')
  if (period != null) {
    const a = ADMINISTRATIONS[period]
    const t0 = Math.max(a.yearStart, 2001), t1 = Math.min(a.yearEnd + 1, 2026)
    ctx.fillStyle = css('--color-accent', 'peru')
    ctx.globalAlpha = 0.08
    ctx.beginPath()
    ctx.arc(c, c, R, theta(t0), theta(t1))
    ctx.arc(c, c, R * R_CORE, theta(t1), theta(t0), true)
    ctx.closePath()
    ctx.fill()
  }
  ctx.strokeStyle = ink
  ctx.lineWidth = 0.5
  ctx.globalAlpha = 0.25
  ctx.beginPath()
  for (const r of ringR) { ctx.moveTo(c + r, c); ctx.arc(c, c, r, 0, Math.PI * 2) }
  for (const a of ADMINISTRATIONS) {
    if (a.yearStart <= 2002 || a.yearStart > DATA_LAST_YEAR) continue
    const th = theta(a.yearStart)
    ctx.moveTo(c + Math.cos(th) * R * R_CORE, c + Math.sin(th) * R * R_CORE)
    ctx.lineTo(c + Math.cos(th) * R, c + Math.sin(th) * R)
  }
  ctx.stroke()
  ctx.globalAlpha = 0.6
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(c, c - R)
  ctx.lineTo(c, c - R - 8)
  ctx.stroke()
  ctx.globalAlpha = 1
}

/** instruments §3.3 «La Manecilla»: 1 px ochre hand core → rim at θ(yr + 0.5) */
function hand(ctx: CanvasRenderingContext2D, size: number, R: number, yr: number | null) {
  if (yr == null) return
  const c = size / 2, th = theta(yr + 0.5)
  ctx.strokeStyle = css('--color-accent', 'peru')
  ctx.globalAlpha = 0.95
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(c + Math.cos(th) * R * R_CORE, c + Math.sin(th) * R * R_CORE)
  ctx.lineTo(c + Math.cos(th) * R * 1.04, c + Math.sin(th) * R * 1.04)
  ctx.stroke()
  ctx.globalAlpha = 1
}

type Hit = { id: number; x: number; y: number; r: number }
function nearest(hits: Hit[], x: number, y: number): number | null {
  let best: number | null = null, bd = Infinity
  for (const h of hits) {
    const d = Math.hypot(h.x - x, h.y - y)
    if (d <= Math.max(12, h.r + 4) && d < bd) { bd = d; best = h.id }
  }
  return best
}

interface SystemProps {
  system: SkySystem
  period: number | null
  /** ringed vendor ids (a flight's focus, or the selected planet) */
  focus: number[]
  onPick: (vendorId: number) => void
  label: string
  /** instruments §3.3: the year hand (the phone has no year masks, so the year does not light bodies) */
  yr?: number | null
  /** instruments §3.7: the disc's size in px (twin plate 440 / 384; phone 358) */
  px?: number
  /** instruments §3.4: the diff's marks on this disc (vendor ids; whiskers vendor → [shareA, shareB]) */
  marks?: DiscMarks | null
  /** instruments §3.7: the star has no records in this disc's period — hatched, no marks */
  hatched?: boolean
  /** sky-dive round 2: the layer bits by vendor (the phone has no bin) — «sigue firmando» ring always, one overlay at a time */
  layers?: SkyLayers | null
  overlay?: SkyOverlay
}
export interface DiscMarks { arrive: number[]; depart: number[]; whiskers: [number, number, number][] }

export function SystemDisc({ system, period, focus, onPick, label, yr = null, px = DISC_PX, marks = null, hatched = false, layers = null, overlay = null }: SystemProps) {
  const ref = useRef<HTMLCanvasElement>(null)
  const hits = useRef<Hit[]>([])
  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const ctx = setup(cv, px)
    const c = px / 2, R = c - 14
    engrave(ctx, px, R, [], period)
    const hue = riskHue(), ink = css('--color-text-primary', 'black'), accent = css('--color-accent', 'peru')
    // the host star at the core
    ctx.fillStyle = ink
    ctx.globalAlpha = 0.85
    ctx.beginPath()
    ctx.arc(c, c, starPx(system.star.value_mxn), 0, Math.PI * 2)
    ctx.fill()
    const out: Hit[] = []
    /** marks a label may not touch beyond the bodies: sigue rings and overlay glyphs, tethers sampled every 8 px */
    const extra: [number, number, number][] = []
    const sigue = new Path2D(), ovPath = new Path2D(), ovDots = new Path2D()
    const bodies = [...system.bodies].sort((a, b) => a.share - b.share) // largest drawn last (on top)
    for (const b of bodies) {
      const r = orbitR(Math.max(b.share, 1e-7), R)
      const th = theta(b.first_year + 0.5)
      const x = c + r * Math.cos(th), y = c + r * Math.sin(th)
      const rp = planetPxOf(b.value_mxn) * 0.85
      const col = hue[riskClass(b.risk_here)]
      // tenure arc on the body's orbit
      ctx.strokeStyle = col
      ctx.globalAlpha = 0.35
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.arc(c, c, r, theta(b.first_year), theta(Math.max(b.first_year + 0.3, b.last_year + 1)))
      ctx.stroke()
      // instruments decision 8: lit = money in the period, like desktop (tenure overlap only before the backfill)
      const lit = period == null || (b.period_v ? b.period_v[period] > 0
        : b.first_year <= ADMINISTRATIONS[period].yearEnd && b.last_year >= ADMINISTRATIONS[period].yearStart)
      ctx.globalAlpha = lit ? 0.9 : 0.15
      ctx.fillStyle = ctx.strokeStyle = col
      ctx.lineWidth = 1.25
      ctx.beginPath()
      ctx.arc(x, y, rp, 0, Math.PI * 2)
      if (b.dep >= 0.5) ctx.fill()
      else ctx.stroke()
      out.push({ id: b.vendor_id, x, y, r: rp })
      // sky-dive layers, as on the desktop: a 1 px ink ring = sigue firmando; the overlay's glyph on its bodies only
      const bb = layers?.byVendor.get(b.vendor_id) ?? 0
      if (layers && bb & layers.bits.sigue) { sigue.moveTo(x + rp + 4, y); sigue.arc(x, y, rp + 4, 0, Math.PI * 2); extra.push([x, y, rp + 5]) }
      if (layers && overlay && bb & layers.bits[overlay]) {
        if (overlay === 'captura') {
          ovPath.moveTo(x, y); ovPath.lineTo(c, c)
          const n = Math.ceil(Math.hypot(x - c, y - c) / 8)
          for (let k = 1; k < n; k++) extra.push([x + ((c - x) * k) / n, y + ((c - y) * k) / n, 2])
        } else if (overlay === 'pareja') { ovPath.moveTo(x + rp + 3, y); ovPath.arc(x, y, rp + 3, 0, Math.PI * 2); extra.push([x, y, rp + 4]) }
        else if (overlay === 'mismo_dia') { ovPath.moveTo(x, y + rp + 2); ovPath.lineTo(x, y + rp + 8); extra.push([x, y + rp + 5, 4]) }
        else { ovDots.moveTo(x + 2, y - rp - 5); ovDots.arc(x, y - rp - 5, 2, 0, Math.PI * 2); extra.push([x, y - rp - 5, 3]) }
      }
    }
    if (layers) {
      ctx.strokeStyle = ink
      ctx.lineWidth = 1
      ctx.globalAlpha = 0.4
      ctx.stroke(sigue)
      ctx.globalAlpha = 0.8
      ctx.fillStyle = ink
      if (overlay === 'pareja') ctx.setLineDash([2, 2])
      ctx.stroke(ovPath)
      ctx.setLineDash([])
      ctx.fill(ovDots)
    }
    // focus rings
    ctx.globalAlpha = 1
    ctx.strokeStyle = accent
    ctx.lineWidth = 1.5
    for (const h of out) if (focus.includes(h.id)) { ctx.beginPath(); ctx.arc(h.x, h.y, h.r + 6, 0, Math.PI * 2); ctx.stroke() }
    hand(ctx, px, R, yr)
    if (hatched) {
      // §3.7: «sin registros de esta institución en {B}» — the disc is hatched, never read as departures
      ctx.save()
      ctx.beginPath(); ctx.arc(c, c, R, 0, Math.PI * 2); ctx.clip()
      ctx.strokeStyle = ink
      ctx.globalAlpha = 0.18
      ctx.lineWidth = 1
      ctx.beginPath()
      for (let k = -px; k < px; k += 7) { ctx.moveTo(k, px); ctx.lineTo(k + px, 0) }
      ctx.stroke()
      ctx.restore()
    } else if (marks) {
      const at = new Map(out.map((h) => [h.id, h]))
      ctx.globalAlpha = 1
      ctx.strokeStyle = accent
      ctx.lineWidth = 1.5
      ctx.beginPath()
      for (const v of marks.arrive) {
        const h = at.get(v); if (!h) continue
        const x = h.x + h.r + 5, y = h.y - h.r - 5
        ctx.moveTo(x - 4, y); ctx.lineTo(x + 4, y); ctx.moveTo(x, y - 4); ctx.lineTo(x, y + 4)
      }
      for (const [v, sa, sb] of marks.whiskers) {
        const h = at.get(v); if (!h) continue
        const r0 = orbitR(sa, R), r1 = orbitR(sb, R)
        if (Math.abs(r1 - r0) < 8) continue // F3: the 8 px floor at this disc's scale
        const a = Math.atan2(h.y - c, h.x - c), co = Math.cos(a), sn = Math.sin(a)
        ctx.moveTo(c + co * r0, c + sn * r0); ctx.lineTo(c + co * r1, c + sn * r1)
        ctx.moveTo(c + co * r1 - sn * 3, c + sn * r1 + co * 3); ctx.lineTo(c + co * r1 + sn * 3, c + sn * r1 - co * 3)
      }
      ctx.stroke()
      ctx.strokeStyle = ink
      ctx.lineWidth = 1.25
      ctx.setLineDash([2, 2])
      ctx.beginPath()
      for (const v of marks.depart) { const h = at.get(v); if (h) { ctx.moveTo(h.x + h.r + 4, h.y); ctx.arc(h.x, h.y, h.r + 4, 0, Math.PI * 2) } }
      ctx.stroke()
      ctx.setLineDash([])
    }
    // label budget 12: the largest shares, dropped (never truncated) on collision
    ctx.font = '12px "Spectral", Georgia, serif'
    ctx.fillStyle = ink
    const placed: [number, number, number, number][] = []
    const byShare = [...system.bodies].sort((a, b) => b.share - a.share)
    let n = 0
    for (const b of byShare) {
      if (n >= 12) break
      const h = out.find((o) => o.id === b.vendor_id)
      if (!h) continue
      const t = formatEntityName('vendor', b.name, 'full')
      const w = ctx.measureText(t).width
      const left = h.x > c
      const x0 = left ? h.x - h.r - 4 - w : h.x + h.r + 4
      const box: [number, number, number, number] = [x0, h.y - 7, x0 + w, h.y + 7]
      // sky-dive (owner: names never covered by dots): a label also drops when it would touch another body
      const touch = (mx: number, my: number, mr: number) => Math.hypot(mx - Math.max(box[0], Math.min(mx, box[2])), my - Math.max(box[1], Math.min(my, box[3]))) < mr
      const onDot = out.some((o) => o !== h && touch(o.x, o.y, o.r + 1))
        || extra.some(([mx, my, mr]) => (mx !== h.x || my !== h.y) && touch(mx, my, mr))
      if (!t || onDot || box[0] < 2 || box[2] > px - 2 || placed.some((p) => !(box[2] < p[0] || box[0] > p[2] || box[3] < p[1] || box[1] > p[3]))) continue
      placed.push(box)
      // paper knockout under the glyphs, then the ink
      ctx.strokeStyle = css('--color-background', 'white')
      ctx.lineWidth = 3
      ctx.lineJoin = 'round'
      ctx.strokeText(t, x0, h.y + 4)
      ctx.fillText(t, x0, h.y + 4)
      n++
    }
    hits.current = out
    // the label/mark overlap check (frontend/_ui_v4/build/sky-dive/overlap.mjs) reads what was placed
    Object.assign(cv, { __skyPhone: { labels: placed, marks: [...out.map((o) => [o.x, o.y, o.r]), ...extra] } })
  }, [system, period, focus, yr, px, marks, hatched, layers, overlay])

  return (
    <canvas
      ref={ref}
      role="img"
      aria-label={label}
      style={{ width: px, height: px, touchAction: 'pan-y', display: 'block', margin: '0 auto' }}
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect()
        const id = nearest(hits.current, e.clientX - r.left, e.clientY - r.top)
        if (id != null) onPick(id)
      }}
    />
  )
}

export function MoonDisc({ moons, selected, onPick, label, yr = null, lens = 0, apagon = null }: {
  moons: Moon[]; selected: number | null; onPick: (id: number) => void; label: string; yr?: number | null
  /** sky-dive round 2, as on the desktop: distance = amount (0) or the contract's risk indicator (1, no rings) */
  lens?: 0 | 1
  /** the supplier's post-blackout ComprasMX contracts: hollow gray squares, unscored (the rim under the risk lens) */
  apagon?: ApagonMoon[] | null
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const hits = useRef<Hit[]>([])
  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const ctx = setup(cv, DISC_PX)
    const c = DISC_PX / 2, R = c - 14
    engrave(ctx, DISC_PX, R, lens ? [] : AMOUNT_RINGS.map((a) => (moonL(a) / MOON_R) * R), null)
    const hue = riskHue()
    const out: Hit[] = []
    for (const m of moons) {
      const r = lens ? R * (0.15 + 0.85 * Math.min(1, Math.max(0, m.riskScore ?? 0))) : (moonL(m.amount) / MOON_R) * R, th = theta(m.t)
      const x = c + r * Math.cos(th), y = c + r * Math.sin(th)
      ctx.fillStyle = ctx.strokeStyle = hue[m.risk]
      // instruments §3.3: with a year, moons dated in it stay lit
      ctx.globalAlpha = yr != null && Math.floor(m.t) !== yr ? 0.15 : 0.9
      ctx.lineWidth = 1.25
      ctx.beginPath()
      ctx.arc(x, y, 3, 0, Math.PI * 2)
      if (m.da) ctx.fill()
      else ctx.stroke()
      if (m.id === selected) {
        ctx.strokeStyle = css('--color-text-primary', 'black')
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.arc(x, y, 7, 0, Math.PI * 2)
        ctx.stroke()
      }
      out.push({ id: m.id, x, y, r: 3 })
    }
    if (apagon?.length) {
      ctx.globalAlpha = 0.9
      ctx.strokeStyle = css('--color-text-muted', 'gray')
      ctx.lineWidth = 1.25
      ctx.beginPath()
      for (const a of apagon) {
        const r = lens ? R * 1.04 : (moonL(a.amount) / MOON_R) * R, th = theta(a.t)
        ctx.rect(c + r * Math.cos(th) - 2.5, c + r * Math.sin(th) - 2.5, 5, 5)
      }
      ctx.stroke()
    }
    ctx.globalAlpha = 1
    hand(ctx, DISC_PX, R, yr)
    hits.current = out
  }, [moons, selected, yr, lens, apagon])
  return (
    <canvas
      ref={ref}
      role="img"
      aria-label={label}
      style={{ width: DISC_PX, height: DISC_PX, touchAction: 'pan-y', display: 'block', margin: '0 auto' }}
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect()
        const id = nearest(hits.current, e.clientX - r.left, e.clientY - r.top)
        if (id != null) onPick(id)
      }}
    />
  )
}

export function SectorThumb({ manifest, sector }: { manifest: SkyManifest; sector: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const cv = ref.current
    const g = manifest.sectors.find((s) => s.id === sector)
    if (!cv || !g) return
    const ctx = setup(cv, 40)
    // owner 11-06 «both lenses»: the thumbs live in the «Sectores» list, so they take the sector hue
    const col = g.code === 'salud' ? SECTOR_COLORS.salud : css(`--color-sector-${g.code}`, SECTOR_COLORS[g.code] ?? SECTOR_COLORS.otros)
    ctx.strokeStyle = col
    ctx.globalAlpha = 0.5
    ctx.beginPath()
    ctx.arc(20, 20, 19, 0, Math.PI * 2)
    ctx.stroke()
    const S = manifest.stars
    ctx.fillStyle = col
    ctx.globalAlpha = 0.75
    for (let i = 0; i < S.id.length; i++) {
      if (S.sector[i] !== sector) continue
      const x = 20 + ((S.x[i] - g.x) / g.r) * 18, y = 20 + ((S.y[i] - g.y) / g.r) * 18
      ctx.beginPath()
      ctx.arc(x, y, Math.max(0.6, starPx(S.v[i]) * 0.3), 0, Math.PI * 2)
      ctx.fill()
    }
  }, [manifest, sector])
  return <canvas ref={ref} aria-hidden="true" style={{ width: 40, height: 40, flex: '0 0 40px' }} />
}
