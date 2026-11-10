/**
 * AdminSummaryCard — the hero of /administrations.
 *
 * One commanding dossier-cover card that leads the page:
 *   ├─ Switcher rail: 5 administration tabs (surname · party · years)
 *   ├─ Body (selected admin):
 *   │    A — identity: avatar, serif full name, party badge, political context
 *   │    B — procurement fingerprint: 6 stats with deltas vs 24-yr average
 *   │    C — verdict: grade card + high-risk term sparkline + expediente link
 *   └─ Footer strip: data caveats (Fox Structure-A DA, Sheinbaum partial term)
 *
 * Replaces the old sledgehammer hero + selector-card grid + StatCards row +
 * AdminDossierPanel header (2026-06-07 reorganization — "the dossier IS the
 * page": pick a sexenio first, everything below answers to that choice).
 */
import { useRef, type KeyboardEvent, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { AlertTriangle } from 'lucide-react'
import { formatCompactMXN, formatCompactUSD, formatNumber } from '@/lib/utils'
import { RISK_TEXT_COLORS, PROCEDURE_TYPE_FIRST_YEAR } from '@/lib/constants'
import { useMeasuredWidth } from '@/hooks/useMeasuredWidth'
import { PresidentAvatar } from './PresidentAvatar'
import { ProcurementGradeCard } from './ProcurementGradeCard'
import { DeltaBadge } from './DeltaBadge'
import { ADMINISTRATIONS, DATA_LAST_YEAR, DOSSIER_DATA, SEVERITY_COLORS, termRange } from './data'
import { useAdminScandals } from './useAdminScandals'
import { getAdminVerdict } from './verdict'
import type { AdminAgg, AdminName } from './types'

import { T } from '@/lib/motion'
import { useDataCut } from '@/lib/useDataCut'
import { formatCut } from '@/lib/nav/toc'

const SERIF = 'var(--font-family-editorial)'
/** Brief § text contract 3 — kicker: 12px mono, 0.2em tracking. */
const KICKER = 'text-[12px] ct-sc font-bold'

interface FingerprintCell {
  key: string
  label: string
  value: string
  size: string
  sub: ReactNode
  bold?: boolean
  color?: string
}

export interface AdminSummaryCardProps {
  aggs: AdminAgg[]
  selected: AdminName
  onSelect: (name: AdminName) => void
  allTimeAvg: { da: number | null; sb: number | null; hr: number; risk: number }
  displayNames: Record<string, string>
  isEs: boolean
  /** Per-era extras for the verdict lede (FALCO passes from the page). */
  eraExtras?: { gtCaseCount?: number; decSpikePct?: number }
  /**
   * When true the card drops its own border/shadow chrome — the parent
   * EXPEDIENTE folder provides the module boundary (M7c cohesion refactor).
   */
  embedded?: boolean
  /**
   * Ledger view (the page default): the rail shows all five terms side by side
   * with no tab selected, and the body asks the reader to open one. No term is
   * pre-selected, so no administration is the page's first impression.
   */
  ledger?: boolean
}

/**
 * Tiny inline sparkline — high-risk % across the term's years. Drawn at 1:1
 * (PARALLAX D8 § Change 4): the svg is exactly as wide as its column, so the
 * geometry never scales; the year and value labels are HTML under the plot,
 * so they can never clip or overprint each other.
 */
function TermSparkline({
  years,
  color,
  isEs,
  referencePct,
}: {
  years: Array<{ year: number; high_risk_pct: number }>
  color: string
  isEs: boolean
  /** National-average HR% — dashed reference hrule when within scale. */
  referencePct?: number
}) {
  const box = useRef<HTMLDivElement>(null)
  const W = useMeasuredWidth(box)
  if (years.length === 0) return null
  const H = 40
  const PAD = 4
  const max = Math.max(...years.map((y) => y.high_risk_pct), 1) * 1.15
  const x = (i: number) =>
    years.length === 1 ? W / 2 : PAD + (i / (years.length - 1)) * (W - PAD * 2)
  const y = (v: number) => H - PAD - (v / max) * (H - PAD * 2)
  const firstYear = years[0]
  const lastYear = years[years.length - 1]
  const star = (yr: number) => (yr === DATA_LAST_YEAR ? `${yr}*` : String(yr))
  return (
    <div>
      <div className={KICKER + ' text-text-muted mb-1'}>
        {isEs ? 'Alto riesgo % por año' : 'High-risk % by year'}
      </div>
      <div ref={box} style={{ height: H }}>
        {W > 0 && (
          <svg
            width={W}
            height={H}
            viewBox={`0 0 ${W} ${H}`}
            role="img"
            aria-label={
              isEs
                ? `Alto riesgo por año, ${star(firstYear.year)}–${star(lastYear.year)}: último ${lastYear.high_risk_pct.toFixed(1)}%`
                : `High-risk rate by year, ${star(firstYear.year)}–${star(lastYear.year)}: latest ${lastYear.high_risk_pct.toFixed(1)}%`
            }
            style={{ display: 'block' }}
          >
            <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="var(--color-border)" strokeWidth={1} />
            {referencePct != null && referencePct < max && (
              <line
                x1={PAD}
                y1={y(referencePct)}
                x2={W - PAD}
                y2={y(referencePct)}
                stroke="var(--color-text-muted)"
                strokeWidth={1}
                strokeDasharray="3 3"
                opacity={0.55}
              />
            )}
            {years.length > 1 && (
              <polyline
                points={years.map((yr, i) => `${x(i)},${y(yr.high_risk_pct)}`).join(' ')}
                fill="none"
                stroke={color}
                strokeWidth={1.8}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            )}
            {years.map((yr, i) => (
              <circle key={yr.year} cx={x(i)} cy={y(yr.high_risk_pct)} r={2.4} fill={color} />
            ))}
          </svg>
        )}
      </div>
      <div className="mt-1 flex items-baseline justify-between gap-2 text-[12px] font-mono tabular-nums text-text-muted">
        <span>{years.length > 1 ? star(firstYear.year) : ''}</span>
        <span className="whitespace-nowrap">
          {star(lastYear.year)} ·{' '}
          <span className="font-semibold text-text-primary">{lastYear.high_risk_pct.toFixed(1)}%</span>
        </span>
      </div>
    </div>
  )
}

export function AdminSummaryCard({
  aggs,
  selected,
  onSelect,
  allTimeAvg,
  displayNames,
  isEs,
  eraExtras,
  embedded,
  ledger = false,
}: AdminSummaryCardProps) {
  const { t } = useTranslation('administrations')
  const cut = useDataCut()
  const meta = ADMINISTRATIONS.find((a) => a.name === selected) ?? ADMINISTRATIONS[0]
  const agg = aggs.find((a) => a.name === selected)
  const dossier = DOSSIER_DATA[selected]
  const scandals = useAdminScandals(selected)
  const partyColor = meta.color
  const isFoxEra = selected === 'Fox'
  const isPartialTerm = selected === 'Sheinbaum'

  const hrColor =
    agg && agg.highRiskPct > 12
      ? RISK_TEXT_COLORS.critical
      : agg && agg.highRiskPct > 7
        ? RISK_TEXT_COLORS.high
        : 'var(--color-text-secondary)'

  // Tabs (WAI-ARIA tabs pattern): roving tabindex, ←/→ + Home/End move and
  // select; Tab itself is never intercepted.
  const tabId = (name: string) => `admin-tab-${name.toLowerCase().replace(/\s+/g, '-')}`
  const onTabKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = ledger ? -1 : ADMINISTRATIONS.findIndex((a) => a.name === selected)
    const n = ADMINISTRATIONS.length
    const next =
      e.key === 'ArrowRight' ? (i + 1) % n
        : e.key === 'ArrowLeft' ? (i - 1 + n) % n
          : e.key === 'Home' ? 0
            : e.key === 'End' ? n - 1
              : -1
    if (next < 0) return
    e.preventDefault()
    const name = ADMINISTRATIONS[next].name
    onSelect(name)
    document.getElementById(tabId(name))?.focus()
  }

  // Amounts are one unbreakable unit; long strings ("2.8 billones MXN") step
  // down (15px; 13px in the phone's half-width cell) so they fit at 390 and lg.
  const totalMxn = agg ? formatCompactMXN(agg.totalValue) : ''
  const atRiskMxn = agg ? formatCompactMXN(agg.valueAtRisk) : ''
  const moneySize = (v: string) => (v.length > 13 ? 'text-[13px] sm:text-[15px]' : 'text-xl')

  const lang = isEs ? 'es' : 'en'
  const reduce = useReducedMotion()
  const delta = (v: number) => <DeltaBadge val={v} unit=" pts" />
  // procedure shares: «—» when unknown (Fox, coded from 2011); a term that starts earlier says so
  const sinceNote = agg && agg.years.some((y) => y.year < PROCEDURE_TYPE_FIRST_YEAR)
    ? (isEs ? ` desde ${PROCEDURE_TYPE_FIRST_YEAR}` : ` from ${PROCEDURE_TYPE_FIRST_YEAR}`) : ''
  const procCell = (v: number | null, avg: number | null) => ({
    value: v == null ? '—' : `${v.toFixed(1)}%`,
    sub: v == null || avg == null ? null : (
      <span>{delta(v - avg)}{sinceNote && <span className="font-mono text-[12px] text-text-muted">{sinceNote}</span>}</span>
    ),
  })
  // Six fingerprint cells, one shape — the dl renders them on a strict grid.
  const fingerprint: FingerprintCell[] = agg
    ? [
        { key: 'contracts', label: t('statCards.contracts'), value: formatNumber(agg.contracts), size: 'text-xl', sub: null },
        {
          key: 'total',
          label: t('statCards.totalValue'),
          value: totalMxn,
          size: moneySize(totalMxn),
          sub: isEs ? null : (
            <span className="font-mono text-[12px] tabular-nums text-text-muted">≈{formatCompactUSD(agg.totalValue)}</span>
          ),
        },
        { key: 'risk', label: isEs ? 'MXN en riesgo' : 'MXN at risk', value: atRiskMxn, size: moneySize(atRiskMxn), sub: null },
        {
          key: 'da',
          label: t('statCards.directAward'),
          ...procCell(agg.directAwardPct, allTimeAvg.da),
          size: 'text-xl',
        },
        { key: 'sb', label: t('statCards.singleBid'), ...procCell(agg.singleBidPct, allTimeAvg.sb), size: 'text-xl' },
        {
          key: 'hr',
          label: t('statCards.highRisk'),
          value: `${agg.highRiskPct.toFixed(1)}%`,
          size: 'text-xl',
          bold: true,
          color: hrColor,
          sub: delta(agg.highRiskPct - allTimeAvg.hr),
        },
      ]
    : []

  const verdictSegments = getAdminVerdict({
    adminName: selected,
    agg,
    allAggs: aggs,
    allTimeAvg,
    extras: eraExtras,
    isEs,
  })

  return (
    <section
      aria-label={isEs ? 'Resumen de la administración seleccionada' : 'Selected administration summary'}
      className={
        embedded
          ? 'overflow-hidden' // folder provides border + spine + shadow
          : 'rounded-sm border border-border/50 bg-background-card overflow-hidden'
      }
      style={
        embedded
          ? undefined
          : {
              borderLeftWidth: 4,
              borderLeftColor: partyColor,
            }
      }
    >
      {/* ── Switcher rail ── */}
      <div
        role="tablist"
        aria-label={isEs ? 'Seleccionar administración' : 'Select administration'}
        className="grid grid-cols-5 border-b border-border"
        onKeyDown={onTabKey}
      >
        {ADMINISTRATIONS.map((admin) => {
          const isActive = !ledger && admin.name === selected
          const tabParty = admin.color
          const tabHr = aggs.find((a) => a.name === admin.name)?.highRiskPct
          const tabHrColor =
            tabHr == null
              ? 'var(--color-text-muted)'
              : tabHr > 12
                ? RISK_TEXT_COLORS.critical
                : tabHr > 7
                  ? RISK_TEXT_COLORS.high
                  : 'var(--color-text-muted)'
          return (
            <button
              key={admin.name}
              id={tabId(admin.name)}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls="admin-tabpanel"
              tabIndex={isActive || (ledger && admin.name === ADMINISTRATIONS[0].name) ? 0 : -1}
              onClick={() => onSelect(admin.name)}
              className={
                'relative px-1 sm:px-2 py-2 text-center transition-colors min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 ' +
                (isActive ? '' : 'hover:bg-background-elevated')
              }
              style={{ borderBottom: isActive ? `3px solid ${tabParty}` : '3px solid transparent' }}
            >
              <span
                style={{ fontFamily: 'var(--font-family-serif)' }}
                className={
                  'block text-[13px] sm:text-sm leading-tight ' +
                  (isActive ? 'font-bold text-text-primary' : 'font-medium text-text-muted')
                }
              >
                {displayNames[admin.name] ?? admin.name}
              </span>
              {/* Phone: years only (the party badge heads the file itself). */}
              <span className="block text-[13px] sm:text-[13px] leading-tight font-mono text-text-muted mt-0.5">
                <span className="hidden sm:inline">{admin.party} · </span>
                <span className="whitespace-nowrap">{termRange(admin, true)}</span>
              </span>
              {aggs.length > 0 && tabHr != null && (
                <span
                  className="hidden sm:block text-[13px] font-mono tabular-nums mt-0.5"
                  style={{ color: tabHrColor }}
                >
                  {isEs ? 'AR' : 'HR'} {tabHr.toFixed(1)}%
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* ── Body — animated on switch ── */}
      {ledger ? (
        <div id="admin-tabpanel" role="tabpanel" className="px-5 py-4">
          <p style={{ fontFamily: SERIF }} className="text-[15px] text-text-secondary">
            {isEs
              ? 'Los cinco sexenios, lado a lado. Elija uno para abrir su expediente.'
              : 'All five administrations, side by side. Choose one to open its file.'}
          </p>
        </div>
      ) : (
      // Three zones on one baseline grid (≥lg): A identity · B fingerprint · C grade.
      // md: A spans the row, B | C share the next. Zones are split by hairlines,
      // never by padding gaps, so nothing floats in dead space.
      <motion.div
        key={selected}
        id="admin-tabpanel"
        role="tabpanel"
        aria-labelledby={tabId(selected)}
        initial={reduce ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={T.fast}
        className="py-5 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5"
      >
        {/* A — Identity + verdict + political context */}
        <div className="min-w-0 md:col-span-2">
          <div className="flex items-center gap-3.5 mb-3">
            <PresidentAvatar
              wikiArticle={meta.wikiArticle}
              fullName={meta.fullName}
              color={meta.color}
              size={64}
            />
            <div className="min-w-0">
              <h2
                style={{ fontFamily: 'var(--font-family-serif)' }}
                className="text-[22px] sm:text-[26px] font-bold text-text-primary leading-[1.1]"
              >
                {meta.fullName}
              </h2>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <span className="inline-flex items-center text-[13px] font-mono text-text-secondary">
                  <span className="ct-sq" style={{ ['--c' as string]: partyColor }} aria-hidden="true" />
                  {meta.party}
                </span>
                <span className="text-[12px] text-text-muted font-mono tabular-nums">
                  {termRange(meta)}
                </span>
              </div>
            </div>
          </div>
          {/* A1 — rule-generated verdict lede (the voice; context demoted below). */}
          {verdictSegments.length > 0 && (
            <p
              lang={lang}
              style={{ fontFamily: SERIF }}
              className="prose-just text-[17px] leading-[1.45] text-text-primary mb-2.5"
            >
              {verdictSegments.map((s, i) =>
                s.accent ? (
                  <span key={i} style={{ color: 'var(--color-accent-hover)', fontWeight: 600 }}>
                    {s.text}
                  </span>
                ) : (
                  <span key={i}>{s.text}</span>
                ),
              )}
            </p>
          )}
          <p
            lang={lang}
            style={{ fontFamily: SERIF }}
            className="prose-just text-[15px] leading-[1.6] text-text-secondary"
          >
            {t(`dossier.contexts.${dossier.contextKey}`)}
          </p>
          {/* Term trajectory + case-file link sit under the bio so the three
              zones end on the same line (owner 2026-10-06: no dead space). */}
          <div className="mt-4 space-y-3 border-t border-border/40 pt-3">
          {agg && (
            <TermSparkline
              years={agg.years.map((y) => ({ year: y.year, high_risk_pct: y.high_risk_pct }))}
              color={meta.color}
              isEs={isEs}
              referencePct={allTimeAvg.hr}
            />
          )}
          {scandals.length > 0 ? (
            <a
              href="#expediente"
              className="flex items-center gap-2 text-[12px] font-mono text-text-secondary hover:text-accent transition-colors rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1"
            >
              <span className="flex items-center gap-1" aria-hidden="true">
                {scandals.slice(0, 5).map((s) => (
                  <span
                    key={s.slug}
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: SEVERITY_COLORS[s.severity] }}
                  />
                ))}
              </span>
              <span>
                {scandals.length}{' '}
                {isEs
                  ? `escándalo${scandals.length === 1 ? '' : 's'} documentado${scandals.length === 1 ? '' : 's'} · ver expediente ↓`
                  : `documented scandal${scandals.length === 1 ? '' : 's'} · view case file ↓`}
              </span>
            </a>
          ) : (
            <p className="text-[12px] text-text-secondary">
              {t('dossier.noScandals')}
            </p>
          )}
          </div>
        </div>

        {/* B — Procurement fingerprint: strict 2-col grid, every cell the same
            three slots (label · value · delta/sub-line), rows split by hairlines. */}
        <div className="min-w-0 border-t border-border pt-4">
          <div className={KICKER + ' text-accent-text mb-2'}>
            {t('dossier.procurementFingerprint')}
          </div>
          {agg ? (
            <div>{[0, 2, 4].map((r) => (
            <dl key={r} className="grid grid-cols-2 gap-x-5">
              {fingerprint.slice(r, r + 2).map((s) => (
                <div key={s.key} className="min-w-0 border-t border-border/40 pt-2 pb-2.5">
                  <dt className="text-[13px] ct-sc font-mono text-text-muted leading-[14px]">
                    {s.label}
                  </dt>
                  <dd
                    className={`mt-1 font-mono tabular-nums whitespace-nowrap leading-[26px] ${s.size} ${s.bold ? 'font-bold' : 'font-semibold'} ${s.color ? '' : 'text-text-primary'}`}
                    style={s.color ? { color: s.color } : undefined}
                  >
                    {s.value}
                  </dd>
                  <dd className="h-4 leading-4 whitespace-nowrap">{s.sub}</dd>
                </div>
              ))}
            </dl>
            ))}</div>
          ) : (
            <p className="text-[12px] text-text-muted">{t('noData')}</p>
          )}
          <p className="mt-1 text-[12px] text-text-muted">
            {isEs ? 'Deltas vs. promedio 2002–2026' : 'Deltas vs. 2002–2026 average'}
          </p>
        </div>

        {/* C — Verdict: the procurement grade */}
        <div className="min-w-0 space-y-4 border-t border-border pt-4 md:border-l md:pl-6">
          {/* The grade card's method note renders as a 12px justified sans
              paragraph (brief § text contract 3–4), restyled from here so the
              shared ProcurementGradeCard stays untouched. */}
          {agg && (
            <div lang={lang} className="[&>div]:mt-0">
              <ProcurementGradeCard agg={agg} />
            </div>
          )}
        </div>
      </motion.div>
      )}

      {/* ── Caveat footer strip ── */}
      {!ledger && (isFoxEra || isPartialTerm) && (
        <div className="px-5 py-2.5 border-t border-border/30 bg-background-elevated/20 flex items-start gap-2">
          <AlertTriangle className="h-3 w-3 text-text-muted mt-0.5 flex-shrink-0" aria-hidden="true" />
          <p lang={lang} className="prose-just text-[12px] text-text-muted leading-[1.55]">
            {isFoxEra &&
              (isEs
                ? `Estructura A (2002–2010): los registros no traen el tipo de procedimiento, así que adjudicación directa y un solo adjudicado quedan en «—» (cuentan desde ${PROCEDURE_TYPE_FIRST_YEAR}); el indicador de riesgo está subestimado.`
                : `Structure A (2002–2010): the records carry no procedure type, so direct award and single award show «—» (counted from ${PROCEDURE_TYPE_FIRST_YEAR}); the risk indicator is underestimated.`)}
            {isPartialTerm && t('incompleteDatasetDescription', { cut: formatCut(cut, lang) })}
          </p>
        </div>
      )}
    </section>
  )
}

export default AdminSummaryCard
