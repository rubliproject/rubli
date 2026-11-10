/**
 * OfficialTenureBands — «Los itinerantes» on /administrations: a dense
 * timeline table of procurement officials on a 2018–2022 axis, crossing the
 * two sexenio-handover rules. A band whose [first,last] crosses a rule is a
 * career that survived a change of government.
 *
 * Layout (SEXENIOS_TIGHTEN_BRIEF § Compactness): 28px rows; the year axis and
 * both handover labels are printed ONCE in a sticky header; value / DA% /
 * ×institutions are aligned tabular-nums columns; top 12 by default with a
 * "show all" toggle. Motion: bars grow along the time axis once, on
 * viewport enter, staggered (cap 12); reduced motion → final state.
 *
 * Named precedent: Reuters "Time of Evidence" annotated timeline + ProPublica
 * Bailout Tracker (accountability columns kept beside the geometry).
 */

import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, useInView, useReducedMotion } from 'framer-motion'
import type { OfficialMover } from '@/api/types'
import { RISK_COLORS, RISK_TEXT_COLORS, getRiskLevelFromScore } from '@/lib/constants'
import { cn, formatCompactMXN, toTitleCase, pctOrDash } from '@/lib/utils'
import { DotBar } from '@/components/ui/DotBar'
import { DUR, EASE, stagger } from '@/lib/motion'

export interface OfficialTenureBandsProps {
  movers: OfficialMover[]
  isEs: boolean
}

// Axis window = where the data exists. contracts.responsible_uc is ~99% filled
// 2017–2022 and EMPTY from 2023 on (checked 2026-10-06), so every career ends by
// 2022. Drawing to 2025 implied everyone stopped signing; the axis stops at 2022
// and the gap is stated in the header and the note.
const AXIS_START = 2018
const AXIS_END = 2022
const AXIS_SPAN = AXIS_END - AXIS_START // 4
const YEARS = Array.from({ length: AXIS_SPAN + 1 }, (_, i) => AXIS_START + i)
const xPct = (year: number) => ((year - AXIS_START) / AXIS_SPAN) * 100

// The one sexenio handover inside the window, placed mid-year so the rule
// sits between the outgoing and incoming administration's contract years.
const RULES = [
  { year: 2018.5, label: 'PEÑA→AMLO' },
] as const

const COLLAPSED = 12

/**
 * Shared column template — Name · band track · Value · DA% · ×Inst. Header
 * and every row use it so the track column lines up pixel-for-pixel. <sm the
 * Value cell hides (kept in the row aria-label).
 */
const ROW_GRID =
  'grid grid-cols-[minmax(96px,128px)_1fr_36px_32px] sm:grid-cols-[minmax(160px,220px)_1fr_76px_44px_40px] gap-x-3 items-center'

type SortMode = 'default' | 'institutions' | 'value' | 'directAward'

/** A career crosses a handover rule if its span straddles either boundary year. */
function crossesRule(m: OfficialMover): boolean {
  const first = m.first_contract_year
  const last = m.last_contract_year
  if (first == null || last == null) return false
  return first <= 2018 && last >= 2019
}

function spanYears(m: OfficialMover): number {
  if (m.first_contract_year == null || m.last_contract_year == null) return -1
  return m.last_contract_year - m.first_contract_year
}

function sortMovers(movers: OfficialMover[], mode: SortMode): OfficialMover[] {
  const arr = [...movers]
  if (mode === 'institutions') {
    arr.sort((a, b) => b.institution_count - a.institution_count)
  } else if (mode === 'value') {
    arr.sort((a, b) => b.total_value_mxn - a.total_value_mxn)
  } else if (mode === 'directAward') {
    arr.sort((a, b) => (b.direct_award_pct ?? -1) - (a.direct_award_pct ?? -1))
  } else {
    // Default: crossers first, then longest span, then most institutions.
    arr.sort((a, b) => {
      const crossDelta = (crossesRule(b) ? 1 : 0) - (crossesRule(a) ? 1 : 0)
      if (crossDelta !== 0) return crossDelta
      const spanDelta = spanYears(b) - spanYears(a)
      if (spanDelta !== 0) return spanDelta
      return b.institution_count - a.institution_count
    })
  }
  return arr
}

const SORT_OPTIONS: { key: SortMode; es: string; en: string }[] = [
  { key: 'institutions', es: 'instituciones', en: 'institutions' },
  { key: 'value', es: 'valor', en: 'value' },
  { key: 'directAward', es: 'adj. directa', en: 'direct award' },
]

/** Dashed handover rules for a track cell — stacked rows read as one line. */
function RuleLines() {
  return (
    <>
      {RULES.map((r) => (
        <span
          key={r.year}
          aria-hidden="true"
          className="absolute top-0 bottom-0 border-l border-dashed"
          style={{ left: `${xPct(r.year)}%`, borderColor: 'var(--color-border)' }}
        />
      ))}
    </>
  )
}

export function OfficialTenureBands({ movers, isEs }: OfficialTenureBandsProps) {
  const [sortMode, setSortMode] = useState<SortMode>('default')
  const [expandedName, setExpandedName] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  const tableRef = useRef<HTMLDivElement>(null)
  const inView = useInView(tableRef, { once: true, amount: 0.35 })
  const reduce = useReducedMotion() ?? false

  const sorted = useMemo(() => sortMovers(movers, sortMode), [movers, sortMode])
  const crossers = useMemo(() => movers.filter(crossesRule).length, [movers])
  const total = movers.length

  if (total === 0) return null

  const visible = showAll ? sorted : sorted.slice(0, COLLAPSED)
  const lang = isEs ? 'es' : 'en'
  const locale = isEs ? 'es-MX' : 'en-US'

  return (
    <section className="mt-8 pt-6 border-t border-border" aria-label={isEs ? 'Funcionarios itinerantes' : 'Itinerant officials'}>
      <div className="ct-sc mb-1 text-[13px] text-text-muted">
        {isEs ? '2018–2022 · el campo de firmante está vacío desde 2023' : '2018–2022 · the signing-officer field is empty from 2023 on'}
      </div>
      <h2 style={{ fontFamily: 'var(--font-family-editorial)', fontStyle: 'normal', fontWeight: 500, fontSize: 22, color: 'var(--color-text-primary)', letterSpacing: '-0.005em' }}>
        {isEs ? 'Los itinerantes' : 'The itinerants'}
      </h2>

      {/* Computed headline + sort controls share one line on wide screens. */}
      <div className="mt-1.5 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <p style={{ fontFamily: 'var(--font-family-editorial)', fontStyle: 'normal', fontSize: 15, lineHeight: 1.55, color: 'var(--color-text-secondary)' }}>
          <span style={{ color: 'var(--color-accent-hover)', fontWeight: 600 }}>
            {isEs ? `${crossers} de ${total}` : `${crossers} of ${total}`}
          </span>{' '}
          {isEs ? 'siguieron firmando después de un cambio de gobierno.' : 'kept signing after a change of government.'}
        </p>

        {/* 3-way client sort — press again to return to the default (crossers-first) order */}
        <div className="flex flex-wrap items-center gap-1.5 font-mono text-[12px] ct-sc">
          <span className="text-text-muted mr-0.5">{isEs ? 'Ordenar por' : 'Sort by'}</span>
          {SORT_OPTIONS.map((opt) => {
            const active = sortMode === opt.key
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => setSortMode(active ? 'default' : opt.key)}
                aria-pressed={active}
                className={cn(
                  'px-1.5 py-0.5 min-h-6 rounded-sm border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1',
                  active ? 'border-text-primary text-text-primary' : 'border-border text-text-muted hover:text-text-secondary'
                )}
              >
                {isEs ? opt.es : opt.en}
              </button>
            )
          })}
        </div>
      </div>

      {/* Phone: the track is too narrow for the handover labels — one line instead. */}
      <p className="sm:hidden mt-3 text-[12px] text-text-muted">
        {isEs ? 'Línea punteada: cambio de gobierno, dic 2018.' : 'Dashed line: change of government, Dec 2018.'}
      </p>

      <div ref={tableRef} className="mt-3">
        {/* Sticky header — column labels, handover labels and the year axis, printed once. */}
        <div
          className={cn(ROW_GRID, 'sticky top-0 z-10 bg-background/95 backdrop-blur-sm pt-1 border-b border-border')}
        >
          <span className="self-end pb-1 font-mono text-[12px] ct-sc text-text-muted">
            {isEs ? 'Funcionario' : 'Officer'}
          </span>
          <span className="relative h-9" aria-hidden="true">
            <RuleLines />
            {RULES.map((r, i) => (
              <span
                key={r.year}
                className="hidden sm:block absolute top-0 whitespace-nowrap font-mono text-[13px] text-text-muted"
                style={{
                  left: `${xPct(r.year)}%`,
                  transform: i === 0 ? 'translateX(4px)' : 'translateX(calc(-100% - 4px))',
                }}
              >
                {r.label}
              </span>
            ))}
            {YEARS.map((yr) => (
              <span
                key={yr}
                // Phone: end years only — eight labels cannot share a ~120px track.
                className={cn(
                  'absolute bottom-1 font-mono text-[13px] tabular-nums text-text-muted',
                  yr !== AXIS_START && yr !== AXIS_END && 'hidden sm:inline'
                )}
                style={{
                  left: `${xPct(yr)}%`,
                  transform: yr === AXIS_START ? 'none' : yr === AXIS_END ? 'translateX(-100%)' : 'translateX(-50%)',
                }}
              >
                {yr}
              </span>
            ))}
          </span>
          <span className="hidden sm:block self-end pb-1 text-right font-mono text-[12px] ct-sc text-text-muted">
            {isEs ? 'Valor' : 'Value'}
          </span>
          <span className="self-end pb-1 text-right font-mono text-[12px] ct-sc text-text-muted">
            {isEs ? 'AD%' : 'DA%'}
          </span>
          <span className="self-end pb-1 text-right font-mono text-[12px] text-text-muted whitespace-nowrap">
            <abbr title={isEs ? 'Instituciones' : 'Institutions'} className="no-underline">Inst.</abbr>
          </span>
        </div>

        {/* Rows — 28px each; the track column draws its own rule segments. */}
        <div>
          {visible.map((m, i) => {
            const isExpanded = expandedName === m.official_name
            const level = getRiskLevelFromScore(m.avg_risk_score)
            const color = RISK_COLORS[level]
            const crosses = crossesRule(m)
            const hasYears = m.first_contract_year != null && m.last_contract_year != null
            const left = hasYears ? Math.max(0, Math.min(100, xPct(m.first_contract_year!))) : 0
            const rawWidth = hasYears
              ? Math.max(((m.last_contract_year! - m.first_contract_year!) / AXIS_SPAN) * 100, 3)
              : 0
            const width = Math.min(rawWidth, 100 - left)
            const displayName = toTitleCase(m.official_name)
            const panelId = `tenure-panel-${m.official_name.replace(/[^A-Za-z0-9]+/g, '-')}`
            const toggle = () => setExpandedName(isExpanded ? null : m.official_name)

            const ariaLabel = isEs
              ? `${displayName}, ${hasYears ? `${m.first_contract_year}–${m.last_contract_year}` : 'sin fechas registradas'}, ${formatCompactMXN(m.total_value_mxn)}, ${m.institution_count} instituciones, cruza cambio de gobierno: ${crosses ? 'sí' : 'no'}`
              : `${displayName}, ${hasYears ? `${m.first_contract_year}–${m.last_contract_year}` : 'no dates on record'}, ${formatCompactMXN(m.total_value_mxn)}, ${m.institution_count} institutions, crosses change of government: ${crosses ? 'yes' : 'no'}`

            return (
              <div key={m.official_name}>
                <div className={cn(ROW_GRID, 'group h-7 border-b border-border/40 hover:border-text-primary/40 transition-colors')}>
                  {/* Disclosure: the officer name is the button; the row is plain layout. */}
                  <button
                    type="button"
                    aria-expanded={isExpanded}
                    aria-controls={panelId}
                    aria-label={ariaLabel}
                    title={displayName}
                    onClick={toggle}
                    className={cn(
                      'min-w-0 truncate text-left text-[13px] leading-7 text-text-primary rounded-sm cursor-pointer hover:underline',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1'
                    )}
                  >
                    {displayName}
                  </button>

                  <span className="relative h-full">
                    <RuleLines />
                    {hasYears ? (
                      <motion.span
                        aria-hidden="true"
                        className="absolute top-1/2 -mt-1 h-2 rounded-sm group-hover:!opacity-100 transition-opacity"
                        style={{ left: `${left}%`, width: `${width}%`, backgroundColor: color, opacity: crosses ? 0.9 : 0.35, originX: 0 }}
                        initial={reduce ? false : { scaleX: 0 }}
                        animate={reduce || inView ? { scaleX: 1 } : { scaleX: 0 }}
                        transition={{ duration: DUR.slow, ease: EASE.emphasized, delay: stagger(i, 0.05) }}
                      />
                    ) : (
                      <span aria-hidden="true" className="absolute top-1/2 -translate-y-1/2 left-0 font-mono text-[12px] text-text-muted">
                        —
                      </span>
                    )}
                  </span>

                  <span className="hidden sm:block whitespace-nowrap text-right font-mono text-[12px] tabular-nums text-text-secondary">
                    {formatCompactMXN(m.total_value_mxn)}
                  </span>
                  <span className="text-right font-mono text-[12px] tabular-nums text-text-secondary">
                    {pctOrDash(m.direct_award_pct, 0)}
                  </span>
                  <span className="text-right font-mono text-[12px] tabular-nums text-text-muted">
                    ×{m.institution_count}
                  </span>
                </div>

                {isExpanded && (
                  <div id={panelId} className="border-b border-border/40 bg-background-elevated/20 px-1 pb-3 pt-2.5 sm:pl-[172px]">
                    <div className="flex flex-wrap gap-x-8 gap-y-3">
                      <div className="font-mono text-[12px] text-text-muted">
                        <div className="mb-0.5 ct-sc">{isEs ? 'Contratos' : 'Contracts'}</div>
                        <div className="text-[13px] tabular-nums text-text-primary">{m.total_contracts.toLocaleString(locale)}</div>
                      </div>
                      <div className="font-mono text-[12px] text-text-muted">
                        <div className="mb-0.5 ct-sc">{isEs ? 'Valor total' : 'Total value'}</div>
                        <div className="text-[13px] tabular-nums text-text-primary">{formatCompactMXN(m.total_value_mxn)}</div>
                      </div>
                      <div className="min-w-[140px] font-mono text-[12px] text-text-muted">
                        <div className="mb-1 flex items-center justify-between gap-3 ct-sc">
                          <span>{isEs ? 'Adj. directa' : 'Direct award'}</span>
                          <span className="tabular-nums text-text-secondary">{pctOrDash(m.direct_award_pct, 0)}</span>
                        </div>
                        <DotBar
                          value={m.direct_award_pct ?? 0}
                          max={100}
                          color="var(--color-accent)"
                          ariaLabel={isEs ? `Adjudicación directa ${pctOrDash(m.direct_award_pct, 0)}` : `Direct award ${pctOrDash(m.direct_award_pct, 0)}`}
                        />
                      </div>
                      <div className="font-mono text-[12px] text-text-muted">
                        <div className="mb-0.5 ct-sc">{isEs ? 'Un solo adj. (competitivos)' : 'Single award (competitive)'}</div>
                        <div className="text-[13px] tabular-nums text-text-primary">{m.single_award_pct != null ? `${m.single_award_pct.toFixed(0)}%` : '—'}</div>
                      </div>
                      <div className="font-mono text-[12px] text-text-muted">
                        <div className="mb-0.5 ct-sc">{isEs ? 'Indicador de riesgo' : 'Risk indicator'}</div>
                        <div className="flex items-center gap-1.5 text-[13px] tabular-nums">
                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
                          <span style={{ color: RISK_TEXT_COLORS[level] }}>{m.avg_risk_score.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                    <Link
                      to={`/officials/${encodeURIComponent(m.official_name)}`}
                      className="mt-2 inline-flex items-center gap-1 min-h-6 font-mono text-[13px] text-text-secondary transition-colors hover:text-text-primary rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1"
                    >
                      {isEs ? 'ver ficha' : 'see file'} <span aria-hidden="true">→</span>
                    </Link>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {total > COLLAPSED && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          aria-expanded={showAll}
          className="mt-2 min-h-6 font-mono text-[12px] ct-sc text-text-secondary hover:text-text-primary rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1"
        >
          {showAll
            ? (isEs ? `Mostrar los primeros ${COLLAPSED}` : `Show top ${COLLAPSED}`)
            : (isEs ? `Mostrar los ${total}` : `Show all ${total}`)}
          <span aria-hidden="true"> {showAll ? '↑' : '↓'}</span>
        </button>
      )}

      {/* Provenance — one justified 12px paragraph. */}
      <p lang={lang} className="prose-just mt-3 text-[12px] leading-[1.6] text-text-muted">
        {isEs
          ? 'Responsables de la Unidad Compradora que firmaron en más de una institución, 2018–2022 (COMPRANET Estructura C). Los datos de 2023 en adelante no traen el responsable de la unidad compradora, así que ninguna trayectoria puede seguirse más allá de 2022 ni a través del relevo de octubre de 2024. Cada barra va del primer al último año con contratos firmados; la línea punteada marca el cambio de gobierno de diciembre de 2018. El color de la barra es el indicador de riesgo del modelo — no es una acusación.'
          : 'Procurement officers of record who signed at more than one institution, 2018–2022 (COMPRANET Structure C). Records from 2023 on carry no signing officer, so no career can be followed past 2022 or across the October 2024 handover. Each bar runs from the first to the last year with signed contracts; the dashed line marks the December 2018 change of government. Bar colour is the model risk indicator — not an accusation.'}
      </p>
    </section>
  )
}

export default OfficialTenureBands
