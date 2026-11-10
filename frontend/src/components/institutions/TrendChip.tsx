/**
 * TrendChip — «empeora / mejora / estable» (institutions-phase2 § 3).
 *
 * The v3 trend counts CONTRACTS: the slope of the non-competitive share of
 * contracts, 2018–2025. It is not a pesos trend (IMSS reads «estable» by count
 * while its direct-award value share rose), so every surface says so: the chip
 * title here, and a visible «por número de contratos» where the chip appears.
 * No green for «mejora» (Bible §3.10).
 */
import { TIER_STYLES } from '@/lib/tiers'
import type { Trend } from '@/lib/institutions/field'

export const TREND_YEARS = '2018–2025'

export const trendWord = (t: Trend, lang: string) =>
  lang === 'en' ? { empeora: 'worsening', mejora: 'improving', estable: 'steady' }[t] : t

/** «+2.4 pp/año de compra no competitiva» */
export function trendDetail(slope: number | null, lang: string): string {
  if (slope == null) return ''
  const pp = `${slope >= 0 ? '+' : '−'}${Math.abs(slope * 100).toFixed(1)}`
  return lang === 'en' ? `${pp} pp/yr non-competitive share` : `${pp} pp/año de contratos no competitivos`
}

export function TrendChip({ trend, slope, lang }: { trend: Trend | null; slope: number | null; lang: string }) {
  if (!trend) return null
  const en = lang === 'en'
  const worse = trend === 'empeora'
  const title = en
    ? `Trend by number of contracts, ${TREND_YEARS}: ${trendWord(trend, lang)} (${trendDetail(slope, lang)}). Not weighted by pesos.`
    : `Tendencia por número de contratos, ${TREND_YEARS}: ${trend} (${trendDetail(slope, lang)}). No pondera pesos.`
  return (
    <span title={title}
      className={`whitespace-nowrap font-mono text-[13px] ${worse ? "" : trend === "mejora" ? "text-text-secondary" : "text-text-muted"}`}
      style={worse ? { color: TIER_STYLES.Deficiente.ink } : undefined}>
      <span className="sr-only">{en ? 'Trend by contracts: ' : 'Tendencia por contratos: '}</span>
      {trendWord(trend, lang)}
    </span>
  )
}
