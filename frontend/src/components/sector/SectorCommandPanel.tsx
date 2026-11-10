/**
 * SectorCommandPanel — the operational masthead body for the sector dossier:
 *
 *   SectorStatStrip        — the decisive numbers in one aligned readout.
 *   SectorDiagnosticGrid   — a 2×2 grid: where the risk sits (the risk-band
 *                            distribution, already in statistics — no slow
 *                            query), OECD deviation, top institutions, risk over
 *                            time.
 *   SectorInstitutionTable — the full-width institution reference
 *                            (EntityIdentityChip rows — Hard Rule #1).
 *
 * 2026-06-04 (DESIGNUS — P2 convergence): the shared masthead grammar lives in
 * components/dossier/command/primitives; this file keeps the sector computation
 * + the institution table. Sector rate fields arrive 0–100; avg_risk_score and
 * per-institution risk arrive 0–1. OECD limits via constants.
 *
 * 2026-06-08 (DESIGNUS — density squadron / PEPPY): the page read HOLLOW —
 * undersized strip numbers, short dot-strips floating in voids, airy 2×2 panels.
 * The shared StatStrip caps every value at clamp(…,24px), so a wide page leaves
 * the anchor numbers small and the 9-char "Span" range reads as a huge isolated
 * blob. Fixes — all LOCAL (primitives.tsx is shared, do NOT fork):
 *   • a denser local readout that *anchors* the high-value cells (total spend,
 *     high+crit exposure, high-risk %) at a heavier serif size and demotes the
 *     period span to a compact, non-dominant treatment;
 *   • full-width bars everywhere in the grid (risk-band + top-institutions now
 *     mirror the OecdDeviationPanel's relative-track / %-width fill idiom — the
 *     ExposureLedger VaRBar ideal), so no row floats in a fixed-pixel strip;
 *   • a tighter local panel so the 2×2 reads dense, not airy.
 * Export names + prop signatures are IDENTICAL — the page imports them unchanged.
 */
import { RiskGaugeScale } from '@/components/contrato/RiskGauge'
import { NameCell, NumCell, IndicatorCell } from '@/components/kit/ListCells'
import { RankCell, RankTh } from '@/components/kit/ListRow'
import { Fragment, useMemo } from 'react'
import { ContractDrill, DrillToggle, useHot, useLayer } from '@/components/dossier/layers'
import type { SectorStatistics, SectorTrend, RiskLevel } from '@/api/types'
import type { SpatialInstitution } from '@/api/client'
import { formatEntityName } from '@/lib/entity/format'
import { useRowFold, FoldToggle } from '@/components/contrato/Fold'
import { useIsMobile } from '@/hooks/useIsMobile'
import { EditorialAreaChart } from '@/components/charts/editorial'
import {
  RISK_COLORS,
  RISK_TEXT_COLORS,
  EU_DIRECT_AWARD_LIMIT,
  MODEL_HR_BASELINE,
  PARTIAL_YEAR_NOTE,
  DATA_CUT_YEAR,
  getRiskLevelFromScore,
  singleAwardOfCompetitive,
} from '@/lib/constants'
import { formatCompactMXN, formatCompactUSD, formatNumber } from '@/lib/utils'
import { EmptyNote, OecdDeviationPanel, type BenchRow } from '@/components/dossier/command/primitives'
import { clampPct } from '@/components/dossier/command/pct'

// ─── Local dense primitives (composed, never fork the shared file) ───────────

/** A single readout cell. `weight` 1 = anchor (larger), 0 = standard. */
interface DenseCell {
  label: string
  value: string
  sub?: string
  color?: string
  /** Anchor cells render the value heavier/larger; period/range cells stay quiet. */
  anchor?: boolean
}

/**
 * Local readout — denser + bolder than the shared StatStrip. Same grid rhythm
 * (auto-fit columns, hairline dividers, top/bottom rules) but: anchor values are
 * pushed to a heavier serif size for page-width presence, and a `quiet` value
 * (the period span) is rendered in mono at body size so a 9-char range stops
 * reading as a giant isolated number.
 */
function DenseReadout({ cells }: { cells: Array<DenseCell | null> }) {
  const shown = cells.filter(Boolean) as DenseCell[]
  return (
    // Explicit tracks that divide the strip's 12 units (3 two-track anchors +
    // 6 cells) at every width: 0 empty cells (PARALLAX D7b § Change 3, Q3).
    <div
      className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 border-t border-b"
      style={{ borderColor: 'var(--color-border)' }}
    >
      {shown.map((c, i) => {
        const isRange = c.value.includes('–')
        return (
          <div
            key={c.label}
            className="sm:px-4 sm:py-3.5"
            // Anchors take two tracks at every width so "1.7 billones MXN" never
            // breaks (at 390 the auto-fit grid has 2 columns → the full row).
            style={{ borderLeft: i === 0 ? 'none' : '1px solid var(--color-border)', gridColumn: c.anchor ? 'span 2' : undefined }}
          >
            <div
              style={{ fontSize: 13, color: 'var(--color-text-muted)', fontWeight: 500, marginBottom: 5, lineHeight: 1.25 }}
            >
              {c.label}
            </div>
            {isRange ? (
              // Period span — demoted: mono, body size, never an anchor blob.
              <div
                className="font-mono tabular-nums whitespace-nowrap"
                style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.05, color: c.color ?? 'var(--color-text-secondary)', letterSpacing: '0.01em' }}
              >
                {c.value}
              </div>
            ) : (
              <div
                className="tabular-nums whitespace-nowrap"
                style={{
                  fontFamily: 'var(--font-serif)',
                  fontStyle: 'normal',
                  fontWeight: c.anchor ? 700 : 600,
                  // Anchors run bigger and scale with viewport width, capped so
                  // ES "1.7 billones MXN" fits its 2-track cell (PARALLAX D7 judge).
                  fontSize: c.anchor ? 'clamp(24px, 2.6vw, 32px)' : 'clamp(20px, 2.1vw, 27px)',
                  lineHeight: 0.95,
                  color: c.color ?? 'var(--color-text-primary)',
                  letterSpacing: '-0.015em',
                }}
              >
                {c.value}
              </div>
            )}
            {c.sub && (
              <div
                className="font-mono tabular-nums"
                style={{ fontSize: 13, color: c.color ?? 'var(--color-text-muted)', marginTop: 4, whiteSpace: 'nowrap' }}
              >
                {c.sub}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/**
 * DensePanel — same inked-plate chrome as the shared Panel, tighter padding
 * (12/13 vs 14/16) + smaller label gap so the 2×2 grid reads packed, not airy.
 */
function DensePanel({ label, accent, children }: { label: string; accent: string; children: React.ReactNode }) {
  return (
    <section style={{ borderTop: '1px solid var(--color-text-primary)', paddingTop: 8 }}>
      <div className="flex items-center gap-2" style={{ fontFamily: 'var(--font-sc)', fontSize: 13, letterSpacing: 'var(--track-sc)', color: 'var(--color-text-muted)', fontWeight: 600, lineHeight: 1.3, marginBottom: 4 }}>
        <span aria-hidden="true" style={{ width: 10, height: 10, flex: 'none', background: accent }} />
        {label}
      </div>
      {children}
    </section>
  )
}

/** One line per row («La cifra», 2026-10-21): label · hairline bar · readout (dossier.css .cd-row). */
function FullBarRow({ label, readout, pct, color, readoutColor, after }: { label: React.ReactNode; readout: React.ReactNode; pct: number; color: string; readoutColor?: string; after?: React.ReactNode }) {
  return (
    <>
    <div className="cd-row" role="listitem">
      <div>{label}</div>
      <span className="cd-hb" aria-hidden="true" style={{ ['--v' as string]: `${Math.max(0, Math.min(100, pct))}%`, ['--c' as string]: color }}><i /></span>
      <span className="cd-v" style={{ fontWeight: 600, color: readoutColor ?? 'var(--color-text-primary)' }}>{readout}</span>
    </div>
    {after}
    </>
  )
}

// ─── Stat strip ──────────────────────────────────────────────────────────────

export function SectorStatStrip({
  stats,
  lang,
}: {
  stats: SectorStatistics
  lang: 'en' | 'es'
}) {
  const isEs = lang === 'es'
  const hr = clampPct(stats.high_risk_pct)
  const da = clampPct(stats.direct_award_pct)
  const sb = clampPct(singleAwardOfCompetitive(stats.single_bid_pct, stats.direct_award_pct))
  const avgRisk = stats.avg_risk_score != null ? Math.round(stats.avg_risk_score * 100) : null

  const daLimit = EU_DIRECT_AWARD_LIMIT * 100
  const daColor = da == null ? undefined : da > daLimit ? RISK_TEXT_COLORS.critical : da > daLimit / 2 ? RISK_TEXT_COLORS.high : undefined
  const hrColor = hr == null ? undefined : hr >= 20 ? RISK_TEXT_COLORS.critical : hr >= 12 ? RISK_TEXT_COLORS.high : undefined
  const riskLvl = stats.avg_risk_score != null ? getRiskLevelFromScore(stats.avg_risk_score) : 'low'
  const avgRiskColor = avgRisk == null ? undefined : riskLvl === 'critical' ? RISK_TEXT_COLORS.critical : riskLvl === 'high' ? RISK_TEXT_COLORS.high : undefined

  const totalVal = stats.total_value_mxn ?? 0
  const exposure = stats.high_critical_value_mxn
  // Anchors = the decisive numbers (total spend, high+crit exposure, high-risk %),
  // first, so the 12 units pack row by row at 2 / 4 / 6 tracks. The period span
  // cell went: the range prints under "Risk over time" (D7b § Change 3).
  const cells: Array<DenseCell | null> = [
    {
      label: isEs ? 'Gasto total' : 'Total spend',
      value: formatCompactMXN(totalVal),
      sub: !isEs ? formatCompactUSD(totalVal) : undefined,
      anchor: true,
    },
    exposure == null || exposure <= 0 ? null : {
      label: isEs ? 'Exposición a+c' : 'High+crit. exposure',
      value: formatCompactMXN(exposure),
      sub: totalVal > 0 ? `${Math.round((exposure / (stats.scored_value_mxn || totalVal)) * 100)}% ${isEs ? 'del gasto con indicador' : 'of scored spend'}` : undefined,
      color: RISK_TEXT_COLORS.high,
      anchor: true,
    },
    hr == null ? null : {
      label: isEs ? 'Alto riesgo' : 'High-risk',
      value: `${Math.round(hr)}%`,
      sub: isEs ? 'de contratos' : 'of contracts',
      color: hrColor,
      anchor: true,
    },
    { label: isEs ? 'Contratos' : 'Contracts', value: formatNumber(stats.total_contracts ?? 0) },
    !stats.total_institutions ? null : { label: isEs ? 'Instituciones' : 'Institutions', value: formatNumber(stats.total_institutions) },
    !stats.total_vendors ? null : { label: isEs ? 'Proveedores' : 'Suppliers', value: formatNumber(stats.total_vendors) },
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
  ]

  return <DenseReadout cells={cells} />
}

// Sort institutions by spend (the spatial endpoint isn't guaranteed ordered).
function bySpend(a: SpatialInstitution, b: SpatialInstitution): number {
  return (b.total_amount_mxn ?? 0) - (a.total_amount_mxn ?? 0)
}

// ─── Diagnostic grid ─────────────────────────────────────────────────────────

const RISK_ORDER: RiskLevel[] = ['critical', 'high', 'medium', 'low']
const RISK_BAND_LABELS: Record<RiskLevel, [string, string]> = {
  critical: ['Crítico', 'Critical'], high: ['Alto', 'High'], medium: ['Medio', 'Medium'], low: ['Bajo', 'Low'],
}

export function SectorDiagnosticGrid({
  stats,
  trends,
  lang,
  sectorId,
}: {
  stats: SectorStatistics
  trends: SectorTrend[]
  lang: 'en' | 'es'
  sectorId: number
}) {
  const isEs = lang === 'es'
  const layer = useLayer()

  // Risk-band distribution — already in statistics, no extra query.
  const dist: Record<RiskLevel, number> = {
    critical: stats.critical_risk_count ?? 0,
    high: stats.high_risk_count ?? 0,
    medium: stats.medium_risk_count ?? 0,
    low: stats.low_risk_count ?? 0,
  }
  const distTotal = dist.critical + dist.high + dist.medium + dist.low

  // OECD deviation
  const hr = clampPct(stats.high_risk_pct), da = clampPct(stats.direct_award_pct)
  const daLim = EU_DIRECT_AWARD_LIMIT * 100, hrLim = MODEL_HR_BASELINE * 100
  const benchRows: BenchRow[] = []
  if (da != null) benchRows.push({ label: isEs ? 'Adjudicación directa' : 'Direct award', pct: da, limit: daLim, over: da > daLim })
  if (hr != null) benchRows.push({ label: isEs ? 'Alto riesgo' : 'High-risk', pct: hr, limit: hrLim, over: hr > hrLim, note: isEs ? `media del modelo ${hrLim}%` : `model mean ${hrLim}%` })


  const trend = useMemo(
    // Percentage units on a [0,100] domain so axis, tooltip and caption agree
    // (the pct formatter prints its value verbatim — B2).
    () => trends.map((p) => ({ year: p.year, avg: ((p.avg_risk_score ?? 0) as number) * 100 })).filter((p) => Number.isFinite(p.avg) && p.avg > 0).sort((a, b) => a.year - b.year),
    [trends],
  )
  const peak = trend.reduce<{ year: number; avg: number } | null>((mx, p) => (!mx || p.avg > mx.avg ? p : mx), null)
  const last = trend[trend.length - 1]
  const riskSentence = peak && last
    ? isEs
      ? `Riesgo en el tiempo, ${trend[0].year}–${last.year}: pico ${Math.round(peak.avg)}% en ${peak.year}, último ${Math.round(last.avg)}%`
      : `Risk over time, ${trend[0].year}–${last.year}: peak ${Math.round(peak.avg)}% in ${peak.year}, latest ${Math.round(last.avg)}%`
    : undefined

  return (
    // Three panels in one row ≥901; the top-institutions panel went — it repeated the first rows of «Quién gasta en el sector».
    <div className="cd-tri">
      {/* ─ Where the risk sits — full-width %-of-total bars ─ */}
      <DensePanel label={isEs ? 'Contratos por nivel' : 'Contracts by level'} accent={RISK_COLORS.critical}>
        {distTotal > 0 ? (
          <div role="list">
            {RISK_ORDER.map((k) => {
              const n = dist[k] ?? 0
              const pct = distTotal > 0 ? (n / distTotal) * 100 : 0
              const open = layer.isOpen('diagnosis', k)
              const word = isEs ? RISK_BAND_LABELS[k][0] : RISK_BAND_LABELS[k][1]
              return (
                <FullBarRow
                  key={k}
                  label={word}
                  readout={n > 0 ? (
                    <DrillToggle sec="diagnosis" row={k} open={open} onToggle={() => layer.toggle('diagnosis', k)} lang={lang} what={isEs ? `los contratos de nivel ${word.toLowerCase()}` : `the ${word.toLowerCase()} contracts`}>
                      {`${formatNumber(n)} · ${Math.round(pct)}%`}
                    </DrillToggle>
                  ) : `${formatNumber(n)} · ${Math.round(pct)}%`}
                  after={open ? (
                    <ContractDrill sec="diagnosis" row={k} lang={lang} onClose={layer.close} show="vendor"
                      filter={{ sector_id: sectorId, risk_level: k }}
                      title={isEs ? `Los mayores contratos de nivel ${word.toLowerCase()}` : `The largest ${word.toLowerCase()} contracts`} />
                  ) : null}
                  pct={pct}
                  color={RISK_COLORS[k]}
                  readoutColor={k === 'low' ? 'var(--color-text-muted)' : RISK_TEXT_COLORS[k]}
                />
              )
            })}
          </div>
        ) : (
          <EmptyNote text={isEs ? 'Sin desglose de riesgo por contrato.' : 'No per-contract risk breakdown.'} />
        )}
      </DensePanel>

      {/* ─ Deviation vs OECD (shared panel — bar already full-width) ─ */}
      <OecdDeviationPanel rows={benchRows} isEs={isEs} />

      {/* ─ Risk over time — chart spans 100% of the panel ─ */}
      <DensePanel label={isEs ? 'Riesgo en el tiempo' : 'Risk over time'} accent={RISK_COLORS.critical}>
        {trend.length > 1 ? (
          <>
            <EditorialAreaChart
              data={trend} xKey="year" yKey="avg" colorToken="risk-critical" yFormat="pct" yDomain={[0, 100]} height={108}
              decorative
              ariaLabel={riskSentence}
            />
            {peak && (
              <p className="ct-note mt-2">
                {isEs ? 'Pico' : 'Peak'} {Math.round(peak.avg)}% · {peak.year} · {trend[0].year}–{trend[trend.length - 1].year}
                {trend[trend.length - 1].year === DATA_CUT_YEAR && <>* · *{isEs ? PARTIAL_YEAR_NOTE.es : PARTIAL_YEAR_NOTE.en}</>}
              </p>
            )}
          </>
        ) : (
          <EmptyNote text={isEs ? 'Actividad insuficiente para una serie.' : 'Insufficient activity for a series.'} />
        )}
      </DensePanel>
    </div>
  )
}

// ─── Institution reference table (full-width; EntityIdentityChip rows) ───────

export function SectorInstitutionTable({
  institutions,
  totalSpend,
  lang,
  sectorId,
}: {
  institutions: SpatialInstitution[]
  totalSpend: number
  lang: 'en' | 'es'
  sectorId: number
}) {
  const isEs = lang === 'es'
  const rows = [...institutions].sort(bySpend)
  // 9 at desktop + a 16% share bar: some institution names still wrap to two lines, so 9 rows end level
  // with the vendor ledger's 10 in the ≥1280 pair (proof:ui RAGGED, /sectors/1 3 4 8; a 10th row breaks it)
  const topN = useIsMobile() ? 5 : 9
  const fold = useRowFold(rows, topN)
  const layer = useLayer()
  const [hot, bind] = useHot()
  const openIdx = layer.sec === 'institutions' ? rows.findIndex((v) => String(v.institution_id) === layer.row) : -1
  const shown = openIdx >= fold.shown.length ? rows : fold.shown
  if (rows.length === 0) {
    return <EmptyNote text={isEs ? 'Sin instituciones registradas.' : 'No institutions on record.'} />
  }
  // the note names the rows on screen (the fold's first topN), not a fixed ten
  const topShown = Math.min(topN, rows.length)
  const topShare = totalSpend > 0 ? (rows.slice(0, topShown).reduce((s, v) => s + (v.total_amount_mxn ?? 0), 0) / totalSpend) * 100 : 0
  const maxSpend = rows.reduce((m, v) => Math.max(m, v.total_amount_mxn ?? 0), 0)

  return (
    <div>
      <p className="cd-meta mb-2">
        {isEs
          ? `Las ${topShown} mayores concentran el ${Math.round(topShare)}% del gasto sectorial.`
          : `The top ${topShown} concentrate ${Math.round(topShare)}% of sector spend.`}
      </p>
      <div className="ct-table-wrap">
        <table id="sd-inst-t" className="ct-table ct-stack" aria-label={isEs ? 'Instituciones del sector' : 'Sector institutions'}>
          <thead>
            <tr>
              <RankTh lang={lang} />
              <th scope="col">{isEs ? 'Institución' : 'Institution'}</th>
              <th scope="col" className="num">{isEs ? 'Contratos' : 'Contracts'}</th>
              <th scope="col" className="num">{isEs ? 'Monto' : 'Amount'}</th>
              <th scope="col" style={{ width: '16%' }}>{isEs ? 'Cuota' : 'Share'}</th>
              <th scope="col" className="gauge">{isEs ? 'Indicador de riesgo' : 'Risk indicator'}<RiskGaugeScale /></th>
            </tr>
          </thead>
          <tbody>
            {shown.map((inst, i) => {
              const value = inst.total_amount_mxn ?? 0
              const open = layer.isOpen('institutions', inst.institution_id)
              const share = totalSpend > 0 ? (value / totalSpend) * 100 : 0
              const barPct = maxSpend > 0 ? (value / maxSpend) * 100 : 0
              const shareColor = share >= 10 ? RISK_TEXT_COLORS.high : 'var(--color-text-secondary)'
              return (
                <Fragment key={inst.institution_id}>
                <tr className={`ct-row${fold.rowIn(i)}${hot === `i:${inst.institution_id}` ? ' is-hot' : ''}`} {...bind(`i:${inst.institution_id}`)}>
                  <RankCell n={i + 1} />
                  <NameCell type="institution" id={inst.institution_id} name={inst.name} />
                  <NumCell label={isEs ? 'contratos' : 'contracts'}>{formatNumber(inst.total_contracts ?? 0)}</NumCell>
                  <td className="num ct-amt">
                    <DrillToggle sec="institutions" row={inst.institution_id} open={open} onToggle={() => layer.toggle('institutions', inst.institution_id)} lang={lang} what={isEs ? `los contratos de ${formatEntityName('institution', inst.name, 'full')}` : `the contracts of ${formatEntityName('institution', inst.name, 'full')}`}>
                      {formatCompactMXN(value)}
                    </DrillToggle>
                  </td>
                  {/* Share column carries a full-width track so the column fills, not floats. */}
                  <td data-l={isEs ? 'cuota' : 'share'}>
                    <div className="flex items-center gap-2">
                      <span className="cd-hb flex-1 min-w-0" aria-hidden="true" style={{ ['--v' as string]: `${Math.max(0, Math.min(100, barPct))}%`, ['--c' as string]: shareColor }}><i /></span>
                      <span className="font-mono tabular-nums flex-shrink-0" style={{ fontSize: 13, color: shareColor, fontWeight: share >= 10 ? 600 : 400, minWidth: 38, textAlign: 'right' }}>{share.toFixed(1)}%</span>
                    </div>
                  </td>
                  <IndicatorCell value={inst.risk != null && inst.risk > 0 ? inst.risk : null} />
                </tr>
                {open && (
                  <tr className="dl-tr"><td colSpan={6}>
                    <ContractDrill sec="institutions" row={inst.institution_id} lang={lang} onClose={layer.close} show="vendor"
                      filter={{ sector_id: sectorId, institution_id: inst.institution_id }}
                      title={isEs ? `Lo que compró ${formatEntityName('institution', inst.name, 'full')} en el sector` : `What ${formatEntityName('institution', inst.name, 'full')} bought in the sector`} />
                  </td></tr>
                )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
      <FoldToggle open={fold.open} rest={fold.rest} onToggle={fold.toggle} controls="sd-inst-t" />
    </div>
  )
}
