/**
 * CategoryCommandPanel — the operational masthead body for the category dossier:
 *
 *   CategoryStatStrip      — the decisive numbers in one aligned readout.
 *   CategoryDiagnosticGrid — a 2×2 grid: market concentration (the category's
 *                            distinctive signal — HHI + top-3 capture), EU
 *                            scoreboard deviation, top vendors, risk over time.
 *   CategoryVendorTable    — the full-width vendor reference (EntityIdentityChip
 *                            rows — Hard Rule #1).
 *
 * 2026-06-04 (DESIGNUS — P2 convergence): the shared masthead grammar now lives
 * in components/dossier/command/primitives; this file keeps the category
 * computation, the market-concentration panel, and the vendor table. Category
 * rate fields arrive 0–100; avg_risk arrives 0–1. EU scoreboard limits via constants.
 */
import { useMemo } from 'react'
import { ListHead, COL, NameCell, NumCell, IndicatorCell } from '@/components/kit/ListCells'
import { RankCell } from '@/components/kit/ListRow'
import {
  RISK_COLORS,
  RISK_TEXT_COLORS,
  EU_DIRECT_AWARD_LIMIT,
  MODEL_HR_BASELINE,
  getRiskLevelFromScore,
  getHighRiskShareLevel,
} from '@/lib/constants'
import { formatCompactMXN, formatCompactUSD, formatNumber } from '@/lib/utils'
import { StatStrip, Panel, EmptyNote, OecdDeviationPanel, RiskOverTimePanel, type StatCell, type BenchRow } from '@/components/dossier/command/primitives'
import { clampPct } from '@/components/dossier/command/pct'

// ─── Shared shapes ───────────────────────────────────────────────────────────

export interface CategoryLike {
  category_id: number
  name_es: string
  name_en: string
  sector_id: number | null
  sector_code: string | null
  total_contracts: number
  total_value: number
  avg_risk: number
  direct_award_pct?: number
  single_bid_pct?: number
  /** Single-award share of competitive procedures (D20) — the displayed rate. */
  single_award_pct?: number | null
  high_risk_pct?: number
  vendor_count?: number
  institution_count?: number
}

export interface CategoryTopVendor {
  vendor_id: number
  vendor_name: string
  contract_count: number
  vendor_value: number
  market_share_pct: number
  avg_risk: number
}

export interface CategoryConcentration {
  hhi: number
  concentration_label: 'highly_concentrated' | 'moderately_concentrated' | 'competitive'
  top3_share_pct: number
}

interface TrendPoint {
  year: number
  avg_risk?: number | null
}

function concentrationLabel(label: CategoryConcentration['concentration_label'], isEs: boolean): string {
  if (label === 'highly_concentrated') return isEs ? 'altamente concentrado' : 'highly concentrated'
  if (label === 'moderately_concentrated') return isEs ? 'moderadamente concentrado' : 'moderately concentrated'
  return isEs ? 'competitivo' : 'competitive'
}

// ─── Stat strip ──────────────────────────────────────────────────────────────

export function CategoryStatStrip({
  category,
  trends,
  lang,
}: {
  category: CategoryLike
  trends: TrendPoint[]
  lang: 'en' | 'es'
}) {
  const isEs = lang === 'es'
  const hr = clampPct(category.high_risk_pct)
  const da = clampPct(category.direct_award_pct)
  const sb = clampPct(category.single_award_pct)
  const avgRisk = category.avg_risk != null ? Math.round(category.avg_risk * 100) : null

  const years = trends.map((t) => t.year).filter((y) => Number.isFinite(y))
  const minY = years.length ? Math.min(...years) : null
  const maxY = years.length ? Math.max(...years) : null
  const span = minY != null && maxY != null ? maxY - minY + 1 : null

  const daLimit = EU_DIRECT_AWARD_LIMIT * 100
  const daColor = da == null ? undefined : da > daLimit ? RISK_TEXT_COLORS.critical : da > daLimit / 2 ? RISK_TEXT_COLORS.high : undefined
  const hrLvl = hr == null ? null : getHighRiskShareLevel(hr)
  const hrColor = hrLvl === 'critical' || hrLvl === 'high' ? RISK_TEXT_COLORS[hrLvl] : undefined
  const riskLvl = category.avg_risk != null ? getRiskLevelFromScore(category.avg_risk) : 'low'
  const avgRiskColor = avgRisk == null ? undefined : riskLvl === 'critical' ? RISK_TEXT_COLORS.critical : riskLvl === 'high' ? RISK_TEXT_COLORS.high : undefined

  const cells: Array<StatCell | null> = [
    {
      label: isEs ? 'Gasto total' : 'Total spend',
      value: formatCompactMXN(category.total_value ?? 0),
      sub: !isEs ? formatCompactUSD(category.total_value ?? 0) : undefined,
    },
    { label: isEs ? 'Contratos' : 'Contracts', value: formatNumber(category.total_contracts ?? 0) },
    !category.vendor_count ? null : { label: isEs ? 'Proveedores' : 'Vendors', value: formatNumber(category.vendor_count) },
    !category.institution_count ? null : { label: isEs ? 'Instituciones' : 'Institutions', value: formatNumber(category.institution_count) },
    hr == null ? null : {
      label: isEs ? 'Alto riesgo' : 'High-risk',
      value: `${Math.round(hr)}%`,
      sub: isEs ? 'de contratos' : 'of contracts',
      color: hrColor,
    },
    da == null ? null : {
      label: isEs ? 'Adj. directa' : 'Direct award',
      value: `${Math.round(da)}%`,
      sub: da > daLimit ? `${(da / daLimit).toFixed(1)}× ${isEs ? 'UE' : 'EU'}` : (isEs ? `≤${daLimit}% UE` : `≤${daLimit}% EU`),
      color: daColor,
    },
    sb == null || sb === 0 ? null : {
      label: isEs ? 'Un solo adjudicado' : 'Single award',
      value: `${Math.round(sb)}%`,
      sub: isEs ? 'de los competitivos' : 'of competitive',
    },
    avgRisk == null ? null : {
      label: isEs ? 'Riesgo prom.' : 'Avg risk',
      value: `${avgRisk}`,
      sub: isEs ? 'de 100' : 'of 100',
      color: avgRiskColor,
    },
    span == null ? null : {
      label: isEs ? 'Periodo' : 'Span',
      value: `${minY}–${maxY}`,
      sub: isEs ? `${span} año${span === 1 ? '' : 's'}` : `${span} yr${span === 1 ? '' : 's'}`,
    },
  ]

  return <StatStrip cells={cells} />
}

// ─── Diagnostic grid ─────────────────────────────────────────────────────────

export function CategoryDiagnosticGrid({
  category,
  concentration,
  trends,
  accent,
  lang,
}: {
  category: CategoryLike
  concentration: CategoryConcentration | null
  trends: TrendPoint[]
  accent: string
  lang: 'en' | 'es'
}) {
  const isEs = lang === 'es'

  // Market concentration — the category's distinctive signal. The fast endpoint
  // returns HHI normalized to 0–1 (Σ share²); convert to the conventional 0–10000
  // points scale so the DOJ/FTC bands (1500 / 2500) read correctly.
  const hhiRaw = concentration?.hhi ?? 0
  const hhi = hhiRaw <= 1 ? Math.round(hhiRaw * 10000) : Math.round(hhiRaw)
  const top3 = concentration?.top3_share_pct ?? 0
  // HHI bands (US DOJ/FTC): <1500 competitive · 1500–2500 moderate · >2500 high.
  const hhiScaleMax = Math.max(2500, hhi)
  const hhiColor = hhi >= 2500 ? RISK_COLORS.critical : hhi >= 1500 ? RISK_COLORS.high : RISK_COLORS.medium

  // EU scoreboard deviation
  const da = clampPct(category.direct_award_pct), hr = clampPct(category.high_risk_pct)
  const daLim = EU_DIRECT_AWARD_LIMIT * 100, hrLim = MODEL_HR_BASELINE * 100
  const benchRows: BenchRow[] = []
  if (da != null) benchRows.push({ label: isEs ? 'Adjudicación directa' : 'Direct award', pct: da, limit: daLim, over: da > daLim })
  if (hr != null) benchRows.push({ label: isEs ? 'Alto riesgo' : 'High-risk', pct: hr, limit: hrLim, over: hr > hrLim, note: isEs ? `media del modelo ${hrLim}%` : `model mean ${hrLim}%` })

  const trend = useMemo(
    () => trends.map((p) => ({ year: p.year, avg: (p.avg_risk ?? 0) as number })).filter((p) => Number.isFinite(p.avg) && p.avg > 0).sort((a, b) => a.year - b.year),
    [trends],
  )

  return (
    // Concentration over the EU deviation | risk over time — the pair ends together. The top-vendors
    // panel went — it repeated the cover's six and «El registro de surtidores».
    <div className="cd-pair">
      <div className="cd-stack">
      {/* ─ Market concentration (category-specific) ─ */}
      <Panel label={isEs ? 'Concentración del mercado' : 'Market concentration'} accent={accent}>
        {concentration && (hhi > 0 || top3 > 0) ? (
          <div className="cd-rows" role="list">
            {hhi > 0 && (
              <div className="cd-row" role="listitem">
                <span>HHI</span>
                <span className="cd-hb" aria-hidden="true" style={{ ['--v' as string]: `${Math.min(100, (hhi / hhiScaleMax) * 100)}%`, ['--c' as string]: hhiColor }}><i /></span>
                <span className="cd-v"><b style={{ color: hhiColor }}>{formatNumber(hhi)}</b> · {concentrationLabel(concentration.concentration_label, isEs)}</span>
              </div>
            )}
            <div className="cd-row" role="listitem">
              <span>{isEs ? 'Los 3 mayores capturan' : 'Top 3 capture'}</span>
              <span className="cd-hb" aria-hidden="true" style={{ ['--v' as string]: `${Math.min(100, top3)}%`, ['--c' as string]: top3 >= 50 ? RISK_COLORS.high : accent }}><i /></span>
              <span className="cd-v"><b style={{ color: top3 >= 50 ? RISK_TEXT_COLORS.high : undefined }}>{Math.round(top3)}%</b></span>
            </div>
          </div>
        ) : (
          <EmptyNote text={isEs ? 'Sin datos de concentración.' : 'No concentration data.'} />
        )}
      </Panel>

      {/* ─ Deviation vs EU scoreboard ─ */}
      <OecdDeviationPanel rows={benchRows} isEs={isEs} />
      </div>

      {/* ─ Risk over time ─ */}
      <RiskOverTimePanel trend={trend} isEs={isEs} height={168} />
    </div>
  )
}

// ─── Vendor reference table (full-width; EntityIdentityChip rows) ────────────

export function CategoryVendorTable({
  vendors,
  lang,
}: {
  vendors: CategoryTopVendor[]
  lang: 'en' | 'es'
}) {
  const isEs = lang === 'es'
  if (vendors.length === 0) {
    return <EmptyNote text={isEs ? 'Sin proveedores registrados.' : 'No vendors on record.'} />
  }
  const top10Share = vendors.slice(0, 10).reduce((s, v) => s + (v.market_share_pct ?? 0), 0)

  return (
    <div>
      <p className="cd-meta mb-2">
        {isEs
          ? `Los 10 mayores capturan el ${Math.round(top10Share)}% del mercado de la categoría.`
          : `The top 10 capture ${Math.round(top10Share)}% of the category market.`}
      </p>
      <div className="ct-table-wrap">
        <table className="ct-table ct-stack" aria-label={isEs ? 'Proveedores de la categoría' : 'Category vendors'}>
          <ListHead lang={lang} ranked cols={[COL.vendor, COL.contracts, COL.amount, { ...COL.share, es: 'Cuota', en: 'Share' }, COL.indicator]} />
          <tbody>
            {vendors.map((v, i) => {
              const share = v.market_share_pct ?? 0
              return (
                <tr key={v.vendor_id} className="ct-row">
                  <RankCell n={i + 1} />
                  <NameCell type="vendor" id={v.vendor_id} name={v.vendor_name} />
                  <NumCell label={isEs ? 'contratos' : 'contracts'}>{formatNumber(v.contract_count ?? 0)}</NumCell>
                  <NumCell amt>{formatCompactMXN(v.vendor_value ?? 0)}</NumCell>
                  <td className="num" data-l={isEs ? 'cuota' : 'share'} style={{ color: share >= 10 ? RISK_TEXT_COLORS.high : undefined, fontWeight: share >= 10 ? 600 : 400 }}>{share.toFixed(1)}%</td>
                  <IndicatorCell value={v.avg_risk != null && v.avg_risk > 0 ? v.avg_risk : null} />
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
