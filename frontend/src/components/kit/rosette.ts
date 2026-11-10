/**
 * The «Rayos X» rosette glyph (Focos Rojos, owner pick C 2026-10-15) as a kit
 * painter, so the glyph can travel (Portada card, dossiers). Same encoding as
 * FocosWall: angle = year (2002 at 12 o'clock, clockwise to 2025) · radius =
 * log monto (10 mil → 10,000 MDP) · colour = the contract's indicador ·
 * filled = adjudicación directa.
 * ponytail: FocosWall still carries its own copy (components/aria is owned by
 * another hand); fold it onto this one when that file is next touched.
 */
import { DATA_LAST_YEAR, RAMP_INK, riskRamp } from '@/lib/constants'

export type RosetteTuple = [number, number, number | null, 0 | 1]

const Y0 = 2002
const YEARS = DATA_LAST_YEAR - Y0 + 1
const LO = 4
const HI = 10

/** Paints one rosette at (cx, cy) with outer radius R on an already-scaled context. */
export function paintRosetteAt(c: CanvasRenderingContext2D, cx: number, cy: number, R: number, list: RosetteTuple[], dot = 1.4) {
  const r0 = R * 0.14
  const rad = (a: number) => r0 + (R - r0) * Math.min(1, Math.max(0, (Math.log10(Math.max(a, 10 ** LO)) - LO) / (HI - LO)))
  c.globalAlpha = 1
  c.strokeStyle = RAMP_INK[1]
  c.lineWidth = 1
  c.beginPath(); c.arc(cx, cy, rad(1e8), 0, Math.PI * 2); c.stroke()
  for (const [y, a, s, da] of list) {
    const ang = -Math.PI / 2 + ((y - Y0 + 0.5) / YEARS) * Math.PI * 2 + (((a % 97) / 97) - 0.5) * 0.2
    const rr = rad(a)
    const col = riskRamp(s ?? 0)
    c.beginPath(); c.arc(cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr, dot, 0, Math.PI * 2)
    if (da) { c.fillStyle = col; c.fill() } else { c.strokeStyle = col; c.stroke() }
  }
}
