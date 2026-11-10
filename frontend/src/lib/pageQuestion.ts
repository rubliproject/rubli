/**
 * The computed findings behind each page's «Qué significa» line (components/kit/PageQuestion,
 * docs/PAGE_QUESTIONS.md). Pure, so each claim has a true/false test (pageQuestion.test.ts).
 */
import type { AdminVendorDeep } from '@/api/types'
import type { FieldInst } from '@/lib/institutions/field'

/** The row with the largest `f`, or null when there are none (ties keep the first). */
export function topBy<T>(rows: readonly T[], f: (r: T) => number): T | null {
  let best: T | null = null
  for (const r of rows) if (best == null || f(r) > f(best)) best = r
  return best
}

/** «¿Quién ganó más en cada sexenio?» on the «Cien pesos» basis: re-rank a term's vendors (already
 *  without energy buyers) by 2024 pesos, deflating each year with the same INPC table the rows use
 *  (a year without INPC stays nominal, as the rows do). */
export function topReal(vendors: readonly AdminVendorDeep[], inpc: Record<number, number>): { v: AdminVendorDeep; real: number } | null {
  const best = topBy(vendors, (v) => v.yearly.reduce((s, y) => s + y.total_mxn / (inpc[y.year] ?? 1), 0))
  return best ? { v: best, real: best.yearly.reduce((s, y) => s + y.total_mxn / (inpc[y.year] ?? 1), 0) } : null
}

/** «¿Quién tiene la peor calificación?»: the active federal buyer with the lowest settled grade.
 *  Provisional grades (few contracts) and historical buyers (no contract since 2022) are left out. */
export function worstGraded(insts: readonly FieldInst[]): FieldInst | null {
  return topBy(insts.filter((i) => i.level === 'federal' && !i.provisional && i.historical !== true), (i) => -i.total_score)
}

// /cases and the two dossiers (vendor, institution): each returns null when its data cannot carry the claim.

/** The most repeated fraud type(s) among the files; ties come back together. Null with no counts. */
export function topPatterns(counts: { fraud_type: string; count: number }[] | undefined): string[] | null {
  const max = Math.max(0, ...(counts ?? []).map((c) => c.count))
  if (max === 0) return null
  return (counts ?? []).filter((c) => c.count === max).map((c) => c.fraud_type)
}

/** A vendor's largest buyer by money and its share of the vendor's total (0–100; null without a total). */
export function mainBuyer(
  buyers: { institution_id: number; institution_name: string; total_value_mxn?: number | null }[] | undefined,
  total: number | null | undefined,
): { id: number; name: string; share: number | null } | null {
  const top = [...(buyers ?? [])].sort((a, b) => (b.total_value_mxn ?? 0) - (a.total_value_mxn ?? 0))[0]
  if (!top || !top.total_value_mxn) return null
  return { id: top.institution_id, name: top.institution_name, share: total && total > 0 ? Math.min(100, (top.total_value_mxn / total) * 100) : null }
}

/** An agency's direct-award share against its sector's: within ±5 points reads as «similar». */
export function versusSector(da: number | null | undefined, sectorDa: number | null | undefined): 'above' | 'below' | 'similar' | null {
  if (da == null || sectorDa == null) return null
  const gap = da - sectorDa
  return gap > 5 ? 'above' : gap < -5 ? 'below' : 'similar'
}

/** El Mapa: the sector that takes the most money, and the sector (of the twelve) with the largest part of its own
 *  money in contracts with a high or critical risk indicator (Σ h·v ÷ Σ v over its agencies, the sector panel's
 *  «… de su dinero fue a contratos con indicador de riesgo alto o crítico»). */
export function mapaSectors(stars: { sector: readonly number[]; v: readonly number[]; h: readonly number[] }): {
  top: number; topShare: number; riskiest: number; riskShare: number
} | null {
  const v = new Map<number, number>(), hv = new Map<number, number>()
  let total = 0
  for (let i = 0; i < stars.sector.length; i++) {
    const s = stars.sector[i]
    v.set(s, (v.get(s) ?? 0) + stars.v[i]); hv.set(s, (hv.get(s) ?? 0) + stars.h[i] * stars.v[i]); total += stars.v[i]
  }
  const ids = [...v.keys()]
  const top = topBy(ids, (s) => v.get(s)!)
  const riskiest = topBy(ids.filter((s) => v.get(s)! > 0), (s) => hv.get(s)! / v.get(s)!)
  if (top == null || riskiest == null || total <= 0) return null
  return { top, topShare: v.get(top)! / total, riskiest, riskShare: hv.get(riskiest)! / v.get(riskiest)! }
}

/** El Mapa «Riesgo» (CYAN-2): an agency is drawn red when half or more of its money has a high/critical indicator */
export const RISKY_SHARE = 0.5

/** El Mapa «Riesgo» arrangement (x = h, y = money): the agencies with the most money in high- or critical-risk
 *  contracts (h·v, the top-right corner; these are named on the chart), the money-weighted share across them all
 *  (the dashed reference line), and how many agencies with money have none at high or critical risk (the column
 *  at 0%). `sector` narrows it to one sector's agencies (the framed disc). Null with no money. */
export function mapaRiesgo(
  stars: { sector: readonly number[]; v: readonly number[]; h: readonly number[] },
  sector: number | null = null, n = 8,
): { order: number[]; avg: number; none: number; agencies: number } | null {
  let v = 0, hv = 0, none = 0, agencies = 0
  const idx: number[] = []
  for (let i = 0; i < stars.v.length; i++) {
    if ((sector != null && stars.sector[i] !== sector) || !(stars.v[i] > 0)) continue
    agencies++; v += stars.v[i]; hv += stars.h[i] * stars.v[i]
    if (stars.h[i] > 0) idx.push(i); else none++
  }
  if (v <= 0) return null
  idx.sort((a, b) => stars.h[b] * stars.v[b] - stars.h[a] * stars.v[a])
  return { order: idx.slice(0, n), avg: hv / v, none, agencies }
}
