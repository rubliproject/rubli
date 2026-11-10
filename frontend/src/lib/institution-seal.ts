/**
 * The dossier's second seal — the worst EU/Prozorro deviation between direct
 * award and 5-yr HHI. Single award is not a dimension: the EU line counts
 * bidders, CompraNet records winners (D20). Shared by the hero's DualSeal and
 * the reading caption so both print the same measure (PARALLAX D9b § Change 4).
 */
import type { InstitutionDetailResponse } from '@/api/types'
import { EU_DIRECT_AWARD_LIMIT } from '@/lib/constants'

export const HHI_CONCENTRATED_LINE = 4000 // Prozorro concentrated-purchasing line

export interface ProcedureSeal {
  key: 'da' | 'conc'
  /** % for da, HHI for conc; null when unknown. */
  value: number | null
  /** value ÷ its line (EU 10% / HHI 4,000). */
  ratio: number
  flagged: boolean
  critical: boolean
}

export function procedureSeal(institution: InstitutionDetailResponse): ProcedureSeal {
  const da = institution.direct_award_pct ?? institution.direct_award_rate ?? 0
  const hhi5 = institution.supplier_diversity?.hhi_5yr_avg ?? null
  const daLim = EU_DIRECT_AWARD_LIMIT * 100
  const dims: ProcedureSeal[] = [
    { key: 'da', value: da, ratio: daLim > 0 ? da / daLim : 0, flagged: false, critical: false },
    { key: 'conc', value: hhi5, ratio: hhi5 != null ? hhi5 / HHI_CONCENTRATED_LINE : 0, flagged: false, critical: false },
  ]
  const top = dims.reduce((m, d) => (d.ratio > m.ratio ? d : m), dims[0])
  return { ...top, flagged: top.ratio >= 1, critical: top.ratio >= 2 }
}
