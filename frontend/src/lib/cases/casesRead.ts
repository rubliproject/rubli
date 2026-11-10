/**
 * The computed readings of /cases (docs/PAGE_QUESTIONS.md, Casos): the worked example the
 * «Cómo leer esto» guide narrates over the band, and the follow-up «¿Los habría visto el modelo?».
 * Pure, so each claim has a true/false test (casesRead.test.ts).
 */
import type { LinkedVendor, ScandalListItem } from '@/api/types'
import { getRiskLevelFromScore } from '@/lib/constants'

/** The band's worked example: the case that stayed hidden longest after its last contract year
 *  (so all three marks show: bar, silence, discovery tick). Ties → the later discovery. Null when no
 *  case has a silence. */
export function exampleCase(cases: readonly ScandalListItem[]): ScandalListItem | null {
  let best: ScandalListItem | null = null
  let bestGap = 0
  for (const c of cases) {
    if (!c.contract_year_start || !c.discovery_year || c.compranet_visibility === 'none') continue  // Línea 12: failures public 2014, «discovery» 2021
    const end = Math.max(c.contract_year_start, c.contract_year_end ?? c.contract_year_start)
    const gap = c.discovery_year - end
    if (gap < 1) continue
    if (gap > bestGap || (gap === bestGap && best && c.discovery_year > (best.discovery_year ?? 0))) { best = c; bestGap = gap }
  }
  return best
}

/** A linked vendor the model can read: a CompraNet record with contracts and a score. */
const scored = (v: LinkedVendor) => v.vendor_id != null && v.contract_count > 0 && v.avg_risk_score != null
const flagged = (v: LinkedVendor) => {
  const l = getRiskLevelFromScore(v.avg_risk_score as number)
  return l === 'high' || l === 'critical'
}

/** One case: of its vendors with CompraNet contracts, how many average alto/crítico. Null with none. */
export function caseSeen(vendors: readonly LinkedVendor[] | undefined): { n: number; seen: number } | null {
  const s = (vendors ?? []).filter(scored)
  return s.length ? { n: s.length, seen: s.filter(flagged).length } : null
}

/** All cases: how many have CompraNet contracts, and in how many at least one vendor averages
 *  alto/crítico. Null until every detail is in, or when no case has contracts. */
export function modelSaw(details: readonly ({ linked_vendors?: LinkedVendor[]; compranet_visibility?: string | null } | undefined)[]): { withContracts: number; seen: number } | null {
  if (!details.length || details.some((d) => d == null)) return null
  // 'none' = the case is not in CompraNet itself (Línea 12 shows only via ICA's other contracts): not a fair test (SILVER 11-05)
  const per = details.filter((d) => d?.compranet_visibility !== 'none').map((d) => caseSeen(d?.linked_vendors)).filter((x): x is { n: number; seen: number } => x != null)
  return per.length ? { withContracts: per.length, seen: per.filter((p) => p.seen > 0).length } : null
}
