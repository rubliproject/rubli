/**
 * Score-range brush for El Tamiz (institutions-phase2 § 1).
 *
 * Pure helpers: the `?rango=lo-hi` URL contract, pixel → score inversion of
 * `scoreToX`, and the selection readout (n · pesos · share of the scope's
 * pesos). Bounds are inclusive and snapped to whole points, so «40–48» reads
 * the way a reporter writes it.
 */
import type { FieldModel } from './field'

export type Range = [lo: number, hi: number]

/** `?rango=40-48` → [40, 48]; clamps to the axis, orders the ends; null when absent, malformed or empty. */
export function parseRange(s: string | null, xMin: number, xMax: number): Range | null {
  const m = s?.match(/^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/)
  if (!m) return null
  const a = clamp(Math.round(Number(m[1])), xMin, xMax)
  const b = clamp(Math.round(Number(m[2])), xMin, xMax)
  return a === b ? null : [Math.min(a, b), Math.max(a, b)]
}

export const formatRange = (r: Range) => `${r[0]}-${r[1]}`

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** Inverse of `scoreToX`, snapped to whole points and clamped to the axis. */
export function xToScore(x: number, g: { plotX0: number; plotW: number; xMin: number; xMax: number }): number {
  const t = g.plotW > 0 ? (x - g.plotX0) / g.plotW : 0
  return clamp(Math.round(g.xMin + t * (g.xMax - g.xMin)), g.xMin, g.xMax)
}

export interface RangeSelection {
  members: number[]
  n: number
  val: number
  /** Selected pesos over the pesos of `members` passed in (the current scope). */
  share: number
}

/** Institutions of `scope` with lo ≤ score ≤ hi, their pesos and their share of the scope's pesos. */
export function selectRange(m: FieldModel, scope: number[], r: Range): RangeSelection {
  const members: number[] = []
  let val = 0
  let tot = 0
  for (const k of scope) {
    const i = m.insts[k]
    tot += i.total_amount_mxn
    if (i.total_score >= r[0] && i.total_score <= r[1]) {
      members.push(k)
      val += i.total_amount_mxn
    }
  }
  return { members, n: members.length, val, share: tot > 0 ? val / tot : 0 }
}
