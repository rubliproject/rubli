/**
 * Sector lede + verdict for the sector dossier. `lib/entity/lede.ts` and `verdict.ts` have no
 * 'sector' case yet (shared files); this mirrors their shape so the page reads the same as the
 * category dossier. ponytail: move into getLedeFor/getVerdictFor('sector', …) when those open up.
 */
import type { SectorDetailResponse } from '@/api/types'
import { getHighRiskShareLevel, getRiskLevelFromScore, getSectorName } from '@/lib/constants'
import { formatCompactMXN, formatCompactUSD, formatNumber } from '@/lib/utils'

export function getSectorLede(sector: SectorDetailResponse, lang: 'en' | 'es'): string {
  const s = sector.statistics
  const name = getSectorName(sector.code, lang)
  const spend = formatCompactMXN(s.total_value_mxn)
  const usd = formatCompactUSD(s.total_value_mxn)
  const vendors = formatNumber(s.total_vendors)
  // the money covers every buyer; a scoped (federal / local) count would read as theirs, so the lede
  // names institutions only for the all-buyer count — the scoped one lives in the «Instituciones» clause
  const hasInst = (s.total_institutions ?? 0) > 0 && (s.institution_scope ?? 'all') === 'all'
  const inst = formatNumber(s.total_institutions)
  const da = s.direct_award_pct == null ? null : Math.round(s.direct_award_pct)
  const daTxt = da == null ? '—' : `${da}%`  // «—»: procedure not recorded (DQ1 § 2)
  const hr = s.high_risk_pct ?? 0
  const avg = s.avg_risk_score ?? 0
  const across = lang === 'es'
    ? (hasInst ? `entre ${inst} instituciones y ${vendors} proveedores` : `entre ${vendors} proveedores`)
    : (hasInst ? `across ${inst} institutions and ${vendors} vendors` : `across ${vendors} vendors`)
  if (hr >= 15) {
    return lang === 'es'
      ? `${name} mueve ${spend} ${across}. El ${hr.toFixed(0)}% de sus contratos tiene un indicador de riesgo alto o crítico y el ${daTxt} se adjudicó sin licitación pública.`
      : `${name} moves ${spend} (≈${usd}) ${across}. ${hr.toFixed(0)}% of its contracts carry a high or critical risk indicator, and ${daTxt} were awarded without a public tender.`
  }
  if (avg > 0 && getRiskLevelFromScore(avg) !== 'low') {
    return lang === 'es'
      ? `${name} agrupa ${spend} ${across}, con un indicador de riesgo promedio de ${avg.toFixed(2)} y ${daTxt} de adjudicación directa.`
      : `${name} aggregates ${spend} (≈${usd}) ${across}, with a mean risk indicator of ${avg.toFixed(2)} and ${daTxt} direct award.`
  }
  return lang === 'es'
    ? `${name} agrupa ${spend} ${across}. El ${daTxt} se adjudicó de forma directa.`
    : `${name} aggregates ${spend} (≈${usd}) ${across}. ${daTxt} was awarded directly.`
}

export interface SectorVerdict { level: 'critical' | 'high' | 'medium' | 'low'; label: string; rationale: string }

/** The verdict is the high-risk share (a rate), read in the same bands as the other dossiers. */
export function getSectorVerdict(sector: SectorDetailResponse, lang: 'en' | 'es'): SectorVerdict {
  const s = sector.statistics
  const hr = s.high_risk_pct ?? 0
  const level = getHighRiskShareLevel(hr)
  const scoredValue = s.scored_value_mxn || s.total_value_mxn
  const valueShare = scoredValue > 0 && s.high_critical_value_mxn != null ? (s.high_critical_value_mxn / scoredValue) * 100 : null
  const LABEL = {
    critical: ['Exposición crítica', 'Critical exposure'],
    high: ['Exposición alta', 'High exposure'],
    medium: ['Exposición moderada', 'Moderate exposure'],
    low: ['Exposición baja', 'Low exposure'],
  } as const
  const i = lang === 'es' ? 0 : 1
  const rationale = lang === 'es'
    ? `${hr.toFixed(1)}% de los contratos con indicador de riesgo ≥ 0.40${valueShare != null ? `, que suman el ${valueShare.toFixed(0)}% del monto` : ''}. Es un indicador estadístico, no un hallazgo.`
    : `${hr.toFixed(1)}% of contracts carry a risk indicator ≥ 0.40${valueShare != null ? `, ${valueShare.toFixed(0)}% of the amount` : ''}. A statistical indicator, not a finding.`
  return { level, label: LABEL[level][i], rationale }
}
