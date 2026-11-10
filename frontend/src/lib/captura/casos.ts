/**
 * /captura «Casos» — the current captive pairs a reader should look at, and why each is on the list.
 * Pool = pairs with a contract with their buyer in 2024–25 that are a documented case, a case lead, or whose
 * risk indicator is critical (≥ 0.60) with neither («solo modelo»). Order (stated on the page): documented
 * first, then money × years with the buyer. Pure: pinned in casos.test.ts.
 */
import type { CapturaPair } from '@/api/captura'
import { getRiskLevelFromScore } from '@/lib/constants'
import { CURRENT_FROM } from './relevo'

export type CasoStatus = 'doc' | 'lead' | 'model'
export interface Caso { p: CapturaPair; status: CasoStatus }

export function rankCasos(pairs: CapturaPair[]): Caso[] {
  const out: (Caso & { score: number })[] = []
  for (const p of pairs) {
    if (p.y1 < CURRENT_FROM) continue
    const status: CasoStatus | null = p.gt === 'doc' ? 'doc' : p.gt === 'lead' ? 'lead'
      : p.risk != null && getRiskLevelFromScore(p.risk) === 'critical' ? 'model' : null
    if (status) out.push({ p, status, score: p.m * p.ny })
  }
  return out.sort((a, b) => Number(b.status === 'doc') - Number(a.status === 'doc') || b.score - a.score)
}

/** Documented pairs that are no longer current (last contract with the buyer before 2024), most money first. */
export const pastDocumented = (pairs: CapturaPair[]) =>
  pairs.filter((p) => p.gt === 'doc' && p.y1 < CURRENT_FROM).sort((a, b) => b.m - a.m)
