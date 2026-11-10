/**
 * AdminTrajectory — § I LA TRAYECTORIA / THE YEARLY RECORD
 *
 * One figure, one shared year axis. Stacked small multiples that share the
 * same x positions (equal year bands): Direct Award %, High Risk %, Single
 * Award % (each auto-scaled to its own range, every year value printed on
 * the line, dashed = term average, dotted = national average), then the
 * contracts-per-year bars as the quiet base layer, the year axis, and the
 * AI-anomaly chips aligned under the years they flag. Every note (auto-scale,
 * volume scale, inflation, partial year) is ONE justified caption under it.
 *
 * "HTML owns glyphs, SVG owns geometry" — SVGs are drawn in measured px
 * (useMeasuredWidth), never a stretched viewBox, so labels stay 11–12px at 390.
 *
 * docs/SEXENIOS_TIGHTEN_BRIEF.md
 */
import { useRef } from 'react'
import { motion, useReducedMotion, type Variants } from 'framer-motion'
import { AlertTriangle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { YearOverYearChange } from '@/api/types'
import { cn, formatNumber } from '@/lib/utils'
import { RISK_TEXT_COLORS, PROCEDURE_TYPE_FIRST_YEAR } from '@/lib/constants'
import { DUR, EASE, T } from '@/lib/motion'
import { useMeasuredWidth } from '@/hooks/useMeasuredWidth'
import { DATA_LAST_YEAR, compactCount } from './data'

export interface TrajectoryRates {
  /** null = no procedure type in the term's years (coded from 2011, DQ1 § 2) */
  da: number | null
  sb: number | null
  hr: number
}

export interface TrajectoryAnomaly {
  year: number
  metric: string
  z: number
}

export interface AdminTrajectoryProps {
  years: YearOverYearChange[]
  /** Contract-weighted term averages (selectedAgg.*Pct). */
  termAvg: TrajectoryRates
  /** National all-time averages (allTimeAvg). */
  nationalAvg: TrajectoryRates
  anomalies: TrajectoryAnomaly[]
  /** Era colour (hex) for the volume bars — applied via style only. */
  eraColor: string
  adminTag: string
  isEs: boolean
}

// Localized labels for the anomaly metric keys (AD = Adjudicación Directa,
// AR = Alto Riesgo — the abbreviations used elsewhere on the page).
const ANOMALY_METRIC_LABELS: Record<string, { en: string; es: string }> = {
  contracts: { en: 'contracts', es: 'contratos' },
  risk: { en: 'risk', es: 'riesgo' },
  'DA%': { en: 'DA%', es: 'AD%' },
  'HR%': { en: 'HR%', es: 'AR%' },
}

const PAD_L = 4
const PAD_R = 44 // right gutter for the "avg" / "nat." reference tags
const VIEWPORT = { once: true, amount: 0.35 } as const
const MUTED = 'var(--color-text-muted)'

const draw: Variants = {
  initial: { pathLength: 0 },
  animate: { pathLength: 1, transition: { duration: DUR.story + DUR.slow, ease: EASE.emphasized } },
}
const late: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { ...T.base, delay: DUR.story } },
}
// Volume bars are still (no grow): the line draws are the one reveal on this figure (DESIGN.md §7).

type RateKey = 'direct_award_pct' | 'high_risk_pct' | 'single_bid_pct'

interface SeriesSpec {
  key: RateKey
  label: string
  ink: string
  term: number | null
  national: number | null
  /** Above-national is worse (→ critical ink); otherwise the delta stays muted. */
  worseWhenUp: boolean
  height: number
  strong: boolean
}

export function AdminTrajectory({
  years,
  termAvg,
  nationalAvg,
  anomalies,
  eraColor,
  adminTag,
  isEs,
}: AdminTrajectoryProps) {
  const { t } = useTranslation('administrations')
  const reduce = useReducedMotion()
  const wrapRef = useRef<HTMLDivElement>(null)
  const W = useMeasuredWidth(wrapRef)

  const kicker = `§ I · ${isEs ? 'LA TRAYECTORIA' : 'THE YEARLY RECORD'} — ${adminTag}`
  const yrLabel = (yr: number) => (yr === DATA_LAST_YEAR ? `${yr}*` : String(yr))

  if (years.length === 0) {
    return (
      <div ref={wrapRef}>
        <p className="text-[12px] ct-sc text-text-muted">{kicker}</p>
        <div className="h-[200px] flex items-center justify-center text-text-muted text-sm">{t('noData')}</div>
      </div>
    )
  }

  const n = years.length
  const worst = years.reduce((m, y) => (y.high_risk_pct > m.high_risk_pct ? y : m), years[0])
  const peak = years.reduce((m, y) => (y.contracts > m.contracts ? y : m), years[0])
  const total = years.reduce((s, y) => s + y.contracts, 0)
  const hasPartial = years.some((y) => y.year === DATA_LAST_YEAR)

  const band = W > 0 ? (W - PAD_L - PAD_R) / n : 0
  const cx = (i: number) => PAD_L + band * (i + 0.5)
  const compact = band < 64
  const motionProps = {
    initial: reduce ? false : ('initial' as const),
    whileInView: 'animate' as const,
    viewport: VIEWPORT,
  }

  const series: SeriesSpec[] = [
    {
      key: 'direct_award_pct',
      label: isEs ? 'Adjudicación directa' : 'Direct award',
      ink: RISK_TEXT_COLORS.critical,
      term: termAvg.da,
      national: nationalAvg.da,
      worseWhenUp: true,
      height: 92,
      strong: true,
    },
    {
      key: 'high_risk_pct',
      label: isEs ? 'Alto riesgo' : 'High risk',
      ink: RISK_TEXT_COLORS.medium,
      term: termAvg.hr,
      national: nationalAvg.hr,
      worseWhenUp: true,
      height: 92,
      strong: true,
    },
    {
      key: 'single_bid_pct',
      label: isEs ? 'Un solo adjudicado' : 'Single award',
      ink: MUTED,
      term: termAvg.sb,
      national: nationalAvg.sb,
      worseWhenUp: false,
      height: 64,
      strong: false,
    },
  ]

  const renderSeries = (s: SeriesSpec) => {
    const vals = years.map((y) => y[s.key])
    const known = vals.filter((v): v is number => v != null)
    if (known.length === 0 || s.term == null || s.national == null) {
      // procedure type is coded from 2011: a Fox-era series has no points (DQ1 § 2)
      return (
        <div key={s.key} className="flex flex-wrap items-baseline gap-x-3 text-[12px] font-mono tabular-nums">
          <span className="font-bold ct-sc" style={{ color: s.ink }}>{s.label}</span>
          <span className="text-text-muted">
            — {isEs ? `sin tipo de procedimiento antes de ${PROCEDURE_TYPE_FIRST_YEAR}` : `no procedure type before ${PROCEDURE_TYPE_FIRST_YEAR}`}
          </span>
        </div>
      )
    }
    const lo0 = Math.min(...known, s.term, s.national)
    const hi0 = Math.max(...known, s.term, s.national)
    const range = Math.max(hi0 - lo0, 4)
    const lo = lo0 - range * 0.08
    const hi = hi0 + range * 0.08
    const top = 18 // room for the value label above the highest point
    const bottom = s.height - 6
    const y = (v: number) => bottom - ((v - lo) / (hi - lo)) * (bottom - top)
    let started = false
    const d = vals.map((v, i) => {
      if (v == null) return ''
      const seg = `${started ? 'L' : 'M'}${cx(i).toFixed(1)},${y(v).toFixed(1)}`
      started = true
      return seg
    }).filter(Boolean).join(' ')
    const delta = s.term - s.national
    const up = delta >= 0
    // Reference tags in the right gutter; pushed apart when the lines are close.
    let yTerm = y(s.term)
    let yNat = y(s.national)
    if (Math.abs(yTerm - yNat) < 11) {
      const mid = (yTerm + yNat) / 2
      const sign = yTerm <= yNat ? -1 : 1
      yTerm = mid + sign * 5.5
      yNat = mid - sign * 5.5
    }
    const right = W - PAD_R
    return (
      <div key={s.key}>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-[12px] font-mono tabular-nums">
          <span className="font-bold ct-sc" style={{ color: s.ink }}>
            {s.label}
          </span>
          <span className="text-text-muted">
            {isEs ? 'prom. sexenio ' : 'term avg '}
            {s.key !== 'high_risk_pct' && years.some((y) => y.year < PROCEDURE_TYPE_FIRST_YEAR) && (
              <span>{isEs ? `(desde ${PROCEDURE_TYPE_FIRST_YEAR}) ` : `(from ${PROCEDURE_TYPE_FIRST_YEAR}) `}</span>
            )}
            <span className="font-bold" style={{ color: s.ink }}>{s.term.toFixed(1)}%</span>
          </span>
          <span className="whitespace-nowrap" style={{ color: s.worseWhenUp && up ? RISK_TEXT_COLORS.critical : MUTED }}>
            {up ? '▲ +' : '▼ −'}{Math.abs(delta).toFixed(1)}
            <span className="text-text-muted"> {isEs ? 'vs. nacional' : 'vs. national'} {s.national.toFixed(1)}%</span>
          </span>
        </div>
        <motion.svg width={W} height={s.height} className="block overflow-visible" aria-hidden="true" {...motionProps}>
          <line x1={PAD_L} x2={right} y1={y(s.national)} y2={y(s.national)} stroke={MUTED} strokeWidth={1} strokeDasharray="1 3" />
          <line x1={PAD_L} x2={right} y1={y(s.term)} y2={y(s.term)} stroke={s.ink} strokeOpacity={0.55} strokeWidth={1} strokeDasharray="5 4" />
          <text x={right + 6} y={yTerm} dy="0.32em" className="font-mono" fontSize={12} fill={s.ink}>
            {isEs ? 'prom.' : 'avg'}
          </text>
          <text x={right + 6} y={yNat} dy="0.32em" className="font-mono" fontSize={12} fill={MUTED}>
            {isEs ? 'nac.' : 'nat.'}
          </text>
          {known.length > 1 && (
            <motion.path d={d} fill="none" stroke={s.ink} strokeWidth={s.strong ? 2 : 1.5} strokeLinejoin="round" strokeLinecap="round" variants={draw} />
          )}
          <motion.g variants={late}>
            {vals.map((v, i) => {
              if (v == null) return null
              const isWorst = s.key === 'high_risk_pct' && years[i].year === worst.year
              return (
                <g key={years[i].year}>
                  <circle cx={cx(i)} cy={y(v)} r={isWorst ? 4 : 2.5} fill={s.ink} stroke="var(--color-background-card)" strokeWidth={1} />
                  <text
                    x={cx(i)}
                    y={y(v) - 7}
                    textAnchor="middle"
                    className="font-mono tabular-nums"
                    fontSize={12}
                    fontWeight={isWorst ? 700 : 400}
                    fill={s.strong ? s.ink : MUTED}
                  >
                    {v.toFixed(1)}
                  </text>
                </g>
              )
            })}
          </motion.g>
        </motion.svg>
      </div>
    )
  }

  // Volume base layer
  const VOL_H = 76
  const maxC = Math.max(...years.map((y) => y.contracts), 1)
  const barW = Math.min(band * 0.62, 72)

  const anomaliesByYear = new Map<number, TrajectoryAnomaly[]>()
  for (const a of anomalies) anomaliesByYear.set(a.year, [...(anomaliesByYear.get(a.year) ?? []), a])

  // Same root <div> in both branches → React keeps the measured DOM node.
  return (
    <div ref={wrapRef}>
      <p className="text-[12px] ct-sc text-text-muted">{kicker}</p>
      <h3
        className="mt-1.5 text-[21px] leading-snug text-text-primary"
        style={{ fontFamily: 'var(--font-family-editorial)', fontWeight: 500 }}
      >
        {isEs
          ? `${worst.year}: el año de mayor riesgo del sexenio — ${worst.high_risk_pct.toFixed(1)}% de contratos de alto riesgo`
          : `${worst.year}: the term's highest-risk year — ${worst.high_risk_pct.toFixed(1)}% high-risk contracts`}
      </h3>

      <figure className="mt-4 mb-0" aria-label={isEs ? `Trayectoria anual · ${adminTag}` : `Yearly record · ${adminTag}`}>
        <div className="w-full">
          {W > 0 && (
            <div className="space-y-3">
              {series.map(renderSeries)}

              {/* Volume — quiet base layer on the same year bands */}
              <div>
                <div className="flex flex-wrap items-baseline gap-x-3 text-[12px] font-mono tabular-nums">
                  <span className="font-bold ct-sc text-text-muted">
                    {isEs ? 'Contratos por año' : 'Contracts per year'}
                  </span>
                  <span className="text-text-muted">
                    {formatNumber(total)} {isEs ? 'en total' : 'total'}
                  </span>
                </div>
                <motion.svg width={W} height={VOL_H + 22} className="block" aria-hidden="true" {...motionProps}>
                  {years.map((yr, i) => {
                    const h = Math.max(3, (yr.contracts / maxC) * (VOL_H - 16))
                    const isPeak = yr.year === peak.year
                    return (
                      <g key={yr.year}>
                        <motion.rect
                          x={cx(i) - barW / 2}
                          y={VOL_H - h}
                          width={barW}
                          height={h}
                          rx={1}
                          fill={eraColor}
                          fillOpacity={isPeak ? 0.9 : 0.38}
                        />
                        <motion.text
                          x={cx(i)}
                          y={VOL_H - h - 4}
                          textAnchor="middle"
                          className="font-mono tabular-nums"
                          fontSize={12}
                          fontWeight={isPeak ? 700 : 400}
                          fill={isPeak ? 'var(--color-text-primary)' : MUTED}
                          variants={late}
                        >
                          {compact ? compactCount(yr.contracts, isEs) : formatNumber(yr.contracts)}
                        </motion.text>
                        <text x={cx(i)} y={VOL_H + 16} textAnchor="middle" className="font-mono tabular-nums" fontSize={12} fill={MUTED}>
                          {yrLabel(yr.year)}
                        </text>
                      </g>
                    )
                  })}
                  <line x1={PAD_L} x2={W - PAD_R} y1={VOL_H + 0.5} y2={VOL_H + 0.5} stroke="var(--color-border)" strokeWidth={1} />
                </motion.svg>
              </div>

              {/* AI anomalies — chips aligned under the year they flag */}
              {anomalies.length > 0 && (
                <div className="pt-2 border-t border-border/30">
                  <p className="flex flex-wrap items-center gap-x-1.5 text-[12px] text-text-muted">
                    <AlertTriangle className="h-3 w-3 text-risk-medium-text" aria-hidden="true" />
                    <span className="ct-sc">{t('aiDetectedAnomalies')}</span>
                    <span>— {t('anomaliesNote')}</span>
                  </p>
                  <div className="mt-1.5 flex" style={{ paddingLeft: PAD_L, paddingRight: PAD_R }}>
                    {years.map((yr) => (
                      <div key={yr.year} className="flex-1 min-w-0 flex flex-col items-center gap-1">
                        {(anomaliesByYear.get(yr.year) ?? []).map((a) => {
                          const ml = ANOMALY_METRIC_LABELS[a.metric] ?? { en: a.metric, es: a.metric }
                          const mLabel = isEs ? ml.es : ml.en
                          return (
                            <span
                              key={a.metric}
                              className={cn(
                                'max-w-full [overflow-wrap:anywhere] px-1 py-0.5 rounded-sm text-center text-[13px] leading-tight font-mono tabular-nums',
                                Math.abs(a.z) >= 2.5
                                  ? 'bg-risk-critical/10 text-risk-critical border border-risk-critical/20'
                                  : 'bg-risk-medium/10 text-risk-medium-text border border-risk-medium/20',
                              )}
                              title={isEs
                                ? `${mLabel} en ${a.year}: ${a.z.toFixed(2)}σ del promedio histórico`
                                : `${mLabel} in ${a.year}: ${a.z.toFixed(2)}σ from all-time average`}
                            >
                              {mLabel}
                              <br />
                              {a.z > 0 ? '+' : ''}{a.z.toFixed(1)}σ
                            </span>
                          )
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <figcaption
          lang={isEs ? 'es' : 'en'}
          className="prose-just mt-3 pt-2.5 border-t border-border/30 text-[12px] leading-[1.6] text-text-muted"
        >
          {isEs
            ? `Cada serie se autoescala a su propio rango — compare la forma dentro de una métrica, no entre ellas. Línea discontinua: promedio del sexenio (ponderado por contratos); punteada: promedio nacional 2002–2026. Barras: contratos por año, escala lineal desde cero; pico en ${peak.year} (${formatNumber(peak.contracts)}). `
            : `Each series auto-scales to its own range — compare the shape within a metric, not across them. Dashed line: term average (contract-weighted); dotted: national 2002–2026 average. Bars: contracts per year, linear scale from zero; peak in ${peak.year} (${formatNumber(peak.contracts)}). `}
          {t('evidenceSection.inflationNote')}
          {hasPartial && ` * ${DATA_LAST_YEAR} ${isEs ? 'parcial · en curso' : 'partial · in progress'}.`}
          {' '}COMPRANET · RUBLI v0.9.2.
        </figcaption>
      </figure>
    </div>
  )
}
