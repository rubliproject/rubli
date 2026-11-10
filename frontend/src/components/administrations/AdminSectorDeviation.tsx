/**
 * AdminSectorDeviation — §II LA DESVIACIÓN SECTORIAL / THE SECTOR DEVIATION
 *
 * Diverging lollipop centred on the president's OWN term average: one row
 * per sector (name + DA% label column), a stem from the centre line sized in
 * percentage points of deviation, a sector-coloured dot, and the value
 * ("18% +5pp") printed at the mark end. The centre line is labelled once at
 * the top. Above-average labels read in AA crimson, below-average muted —
 * never green. ≥8 rows split into two columns at ≥1024px on one shared scale.
 *
 * Renders the section BODY only (named-outlier lede + chart + footnote +
 * optional export); the integrator supplies the ChapterKicker + h3.
 *
 * docs/SEXENIOS_TIGHTEN_BRIEF.md · .claude/designs/administrations-2026-07-02-spec.md § II
 */
import { motion, useReducedMotion, type Variants } from 'framer-motion'
import { TableExportButton } from '@/components/TableExportButton'
import { RISK_TEXT_COLORS } from '@/lib/constants'
import { DUR, STAGGER, T, stagger } from '@/lib/motion'

export interface SectorDeviationRow {
  sectorId: number
  name: string
  color: string
  hrFraction: number
  daPct: number
  contracts: number
}

export interface AdminSectorDeviationProps {
  rows: SectorDeviationRow[]
  termBenchmarkFraction: number
  isEs: boolean
  onExport?: () => void
}

// Sectors with fewer term contracts than this drop to a footnote count line
// instead of drawing a mark — avoids garbage deviations on tiny partial terms
// (matters for Sheinbaum's in-progress sexenio).
const MIN_CONTRACTS = 30
/** Largest deviation reaches this share of the half-width; the rest holds its label. */
const REACH = 0.5

type Ranked = SectorDeviationRow & { delta: number }

const stem: Variants = {
  initial: { scaleX: 0 },
  animate: (i: number = 0) => ({ scaleX: 1, transition: { ...T.slow, delay: stagger(i, STAGGER.row * 1.5) } }),
}
const mark: Variants = {
  initial: { opacity: 0 },
  animate: (i: number = 0) => ({ opacity: 1, transition: { ...T.base, delay: stagger(i, STAGGER.row * 1.5) + DUR.slow * 0.6 } }),
}

export function AdminSectorDeviation({ rows, termBenchmarkFraction, isEs, onExport }: AdminSectorDeviationProps) {
  const reduce = useReducedMotion()
  const omitted = rows.filter((r) => r.contracts < MIN_CONTRACTS)

  const sorted: Ranked[] = rows
    .filter((r) => r.contracts >= MIN_CONTRACTS)
    .map((r) => ({ ...r, delta: r.hrFraction - termBenchmarkFraction }))
    .sort((a, b) => b.delta - a.delta)

  const maxAbsDelta = Math.max(0.01, ...sorted.map((r) => Math.abs(r.delta)))
  const benchPct = Math.round(termBenchmarkFraction * 100)

  // Named top-deviator callout — the same benchmark denominator means delta
  // order and value/benchmark order agree whenever the benchmark is positive.
  const top = sorted[0]
  const topMultiple = top && termBenchmarkFraction > 0 ? top.hrFraction / termBenchmarkFraction : null

  const exportData = sorted.map((r) => ({
    sector: r.name,
    [isEs ? 'alto_riesgo_pct' : 'high_risk_pct']: (r.hrFraction * 100).toFixed(1),
    [isEs ? 'adj_directa_pct' : 'direct_award_pct']: r.daPct.toFixed(1),
    [isEs ? 'contratos' : 'contracts']: r.contracts,
    [isEs ? 'desviacion_pp' : 'deviation_pp']: (r.delta * 100).toFixed(1),
  }))

  if (sorted.length === 0) {
    return (
      <div className="text-sm text-text-muted py-4 text-center">
        {isEs
          ? 'Sin sectores con suficientes contratos en este periodo.'
          : 'No sectors with enough contracts in this term.'}
      </div>
    )
  }

  // ≥8 rows → two columns at lg (column-major: ranks 1..k left, k+1.. right).
  const split = sorted.length >= 8 ? Math.ceil(sorted.length / 2) : sorted.length
  const columns = split < sorted.length ? [sorted.slice(0, split), sorted.slice(split)] : [sorted]

  const renderColumn = (col: Ranked[], offset: number, ci: number) => (
    <motion.div
      key={ci}
      initial={reduce ? false : 'initial'}
      whileInView="animate"
      viewport={{ once: true, amount: 0.35 }}
    >
      {/* Header — the centre line labelled ONCE (second column's copy only at lg, where it sits beside the first) */}
      <div className={ci > 0 ? 'hidden lg:grid' : 'grid'} style={{ gridTemplateColumns: 'minmax(104px, 34%) 1fr' }}>
        <span className="text-[13px] ct-sc text-text-muted self-end pb-1">
          {isEs ? 'Sector · AD' : 'Sector · DA'}
        </span>
        <div className="relative h-8 text-[13px] font-mono text-text-muted">
          <span className="absolute bottom-1 left-0">{isEs ? '← menor' : '← lower'}</span>
          <span className="absolute bottom-1 right-0">{isEs ? 'mayor →' : 'higher →'}</span>
          <span className="absolute top-0 left-1/2 -translate-x-1/2 whitespace-nowrap text-text-secondary">
            {isEs ? `promedio del sexenio ${benchPct}%` : `term average ${benchPct}%`}
          </span>
          <span className="absolute bottom-0 left-1/2 h-2 w-px bg-text-muted" aria-hidden="true" />
        </div>
      </div>

      <ul>
        {col.map((r, j) => {
          const i = offset + j
          const above = r.delta >= 0
          const reach = (Math.abs(r.delta) / maxAbsDelta) * REACH * 50 // % of the plot width
          const pp = Math.round(r.delta * 100)
          const valueLabel = `${Math.round(r.hrFraction * 100)}% ${pp >= 0 ? '+' : '−'}${Math.abs(pp)}pp`
          const labelPos = `calc(50% + ${reach}% + 9px)`
          return (
            <li
              key={r.sectorId}
              className="grid items-center min-h-[28px]"
              style={{ gridTemplateColumns: 'minmax(104px, 34%) 1fr' }}
              aria-label={isEs
                ? `${r.name}: alto riesgo ${Math.round(r.hrFraction * 100)}%, ${pp >= 0 ? '+' : '−'}${Math.abs(pp)} pp vs. promedio del sexenio; adjudicación directa ${Math.round(r.daPct)}%`
                : `${r.name}: high risk ${Math.round(r.hrFraction * 100)}%, ${pp >= 0 ? '+' : '−'}${Math.abs(pp)} pp vs. term average; direct award ${Math.round(r.daPct)}%`}
            >
              <span className="flex items-baseline gap-1.5 pr-2 min-w-0 leading-tight">
                <span className="text-[13px] text-text-primary">{r.name}</span>
                <span className="text-[13px] font-mono tabular-nums text-text-muted whitespace-nowrap">
                  {Math.round(r.daPct)}%
                </span>
              </span>
              <div className="relative h-7" aria-hidden="true">
                <span className="absolute inset-y-0 left-1/2 w-px bg-border" />
                <motion.span
                  className="absolute top-1/2 h-[2px] -mt-px"
                  style={{
                    backgroundColor: r.color,
                    opacity: 0.7,
                    width: `${reach}%`,
                    ...(above ? { left: '50%', originX: 0 } : { right: '50%', originX: 1 }),
                  }}
                  variants={stem}
                  custom={i}
                />
                <motion.span
                  className="absolute top-1/2 h-2 w-2 -mt-1 -ml-1 rounded-full"
                  style={{ backgroundColor: r.color, left: `${above ? 50 + reach : 50 - reach}%` }}
                  variants={mark}
                  custom={i}
                />
                <motion.span
                  className="absolute top-1/2 -translate-y-1/2 text-[13px] font-mono tabular-nums whitespace-nowrap"
                  style={{
                    color: above && pp > 0 ? RISK_TEXT_COLORS.critical : 'var(--color-text-muted)',
                    fontWeight: above && pp > 0 ? 600 : 400,
                    ...(above ? { left: labelPos } : { right: labelPos }),
                  }}
                  variants={mark}
                  custom={i}
                >
                  {valueLabel}
                </motion.span>
              </div>
            </li>
          )
        })}
      </ul>
    </motion.div>
  )

  return (
    <div>
      {/* Named-outlier lede + optional export control */}
      <div className="flex items-start justify-between gap-3 mb-3">
        {top && topMultiple !== null && (
          <p className="text-[15px] leading-snug" style={{ fontFamily: 'var(--font-family-serif)' }}>
            {isEs ? (
              <>
                {top.name} corrió a{' '}
                <span style={{ color: 'var(--color-accent-text)', fontWeight: 600 }}>{topMultiple.toFixed(1)}×</span>{' '}
                el promedio del sexenio.
              </>
            ) : (
              <>
                {top.name} ran at{' '}
                <span style={{ color: 'var(--color-accent-text)', fontWeight: 600 }}>{topMultiple.toFixed(1)}×</span>{' '}
                the term average.
              </>
            )}
          </p>
        )}
        {onExport && (
          <div onClick={onExport} className="shrink-0">
            <TableExportButton
              data={exportData}
              filename="rubli-administraciones-desviacion-sectorial"
              className="shrink-0"
            />
          </div>
        )}
      </div>

      <div className={columns.length > 1 ? 'grid grid-cols-1 lg:grid-cols-2 gap-x-10' : undefined}>
        {columns.map((col, ci) => renderColumn(col, ci === 0 ? 0 : split, ci))}
      </div>

      <p className="text-[12px] text-text-muted mt-2">
        {isEs
          ? `Valor: % de contratos de alto riesgo y desviación en puntos porcentuales. AD = adjudicación directa.${omitted.length > 0 ? ` ${omitted.length} sectores con <30 contratos omitidos.` : ''}`
          : `Value: % high-risk contracts and deviation in percentage points. DA = direct award.${omitted.length > 0 ? ` ${omitted.length} sectors with <30 contracts omitted.` : ''}`}
      </p>
    </div>
  )
}
