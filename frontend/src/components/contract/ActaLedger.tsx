/**
 * ActaLedger — «EL ACTA» / "The annotated record" (El Cotejo remake, P2+P6).
 *
 * Renders the contract as one archival document, with every risk-model
 * objection pinned in the right-hand margin next to the exact field it
 * indicts (ICIJ Pandora Papers annotated-document overlay mechanic). Merges
 * the former §1 facts grid + §2 RiskFactorLedger + OfficialCard +
 * ContractSignalTags into a single acta card — their logic survives
 * (severity ranking, factor localization, fallback basis, structural tags),
 * their geometry does not.
 *
 * Spec: contract-dossier-2026-07-04 «El Sumario» §III (re-geometry). 2-column
 * grid (label · value); objections interleave INSIDE the value cell, beneath
 * the field they indict (ICIJ Pandora × ProPublica document-reader mechanic)
 * — no fixed margin rail, zero dead space when a row carries no notes.
 * Mobile (<768px): single column, label above value — annotations already
 * live in the value flow, so no separate mobile geometry is needed.
 *
 * P6 (MonthBand): a rects+lines-only micro-strip on the FECHAS row — zero
 * <circle> anywhere in this file, per the platform's dot-grid ban.
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import { getAdministrationByYear } from '@/lib/administrations'
import { RISK_COLORS, RISK_TEXT_COLORS } from '@/lib/constants'
import { formatDate, formatMXN, formatNumber } from '@/lib/utils'
import {
  anchorRowOf,
  buildStructuralNotes,
  describeContractFactor,
  dedupeFactorsByFamily,
  localizeProcedure,
  riskTagsOf,
  severityWord,
  type ActaRowKey,
  type DescribedFactor,
  type StructuralNote,
} from '@/lib/contract-format'
import type {
  ContractContextResponse,
  ContractDetail,
  ContractRiskBreakdownResponse,
  RiskExplanation,
} from '@/api/types'

const INK_BORDER = '1px solid var(--color-border)'

const LABEL_STYLE: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 12,
  letterSpacing: '0',
  color: 'var(--color-text-muted)',
}
const VALUE_STYLE: CSSProperties = {
  fontFamily: 'var(--font-serif)',
  fontSize: 15,
  color: 'var(--color-text-primary)',
  lineHeight: 1.4,
}
const VALUE_MONO_STYLE: CSSProperties = {
  ...VALUE_STYLE,
  fontFamily: 'var(--font-mono)',
  fontVariantNumeric: 'tabular-nums',
}
const SUBLINE_SERIF: CSSProperties = {
  fontFamily: 'var(--font-serif)',
  fontSize: 13,
  color: 'var(--color-text-secondary)',
  lineHeight: 1.4,
}
const OFFICIAL_NAME_STYLE: CSSProperties = {
  display: 'inline-block',
  textDecoration: 'none',
  fontFamily: 'var(--font-serif)',
  fontStyle: 'normal',
  fontWeight: 500,
  fontSize: 18,
  lineHeight: 1.2,
  color: 'var(--color-text-primary)',
}
const SUBLINE_MONO: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 13,
  color: 'var(--color-text-secondary)',
}

// ── A unified margin note — normalizes a real risk factor and a structural
// flag to the same rendering shape (glyph + optional severity word + label
// + optional param + left-rule color). ──────────────────────────────────────
interface MarginNote {
  key: string
  glyph: '▲' | '·' | '⚑'
  severityLabel: string // '' when not a severity-ranked risk factor
  color: string
  label: string
  param?: string
  title?: string
  sortKey: number
}

function noteFromFactor(f: DescribedFactor, lang: 'en' | 'es'): MarginNote {
  const color = f.severity === 'alto' ? RISK_TEXT_COLORS.critical : f.severity === 'medio' ? RISK_TEXT_COLORS.medium : 'var(--color-text-muted)'
  return {
    key: f.code,
    glyph: f.severity ? '▲' : '·',
    severityLabel: severityWord(f.severity, lang),
    color,
    label: f.label,
    param: f.param ?? undefined,
    sortKey: f.sortKey,
  }
}

function noteFromStructural(n: StructuralNote): MarginNote {
  return {
    key: n.dedupeKey ?? n.label,
    glyph: n.glyph,
    severityLabel: '',
    color: n.color,
    label: n.label,
    title: n.title,
    sortKey: -1, // structural notes never outrank a real severity-ranked factor
  }
}

// Horizontal annotation bar — interleaved directly beneath the value/sublines
// it indicts (ICIJ Pandora × ProPublica document-reader mechanic). One
// wrapping flex line: glyph · severityWord · label · param.
function MarginNoteRow({ note }: { note: MarginNote }) {
  // Inline flow, not flex-wrap: on a phone the label wraps under its own
  // first word instead of every span taking its own line (contract § G4).
  return (
    <div
      style={{
        borderLeft: `2px solid ${note.color}`,
        background: `color-mix(in srgb, ${note.color} 5%, transparent)`,
        padding: '3px 10px',
        marginTop: 4,
        fontFamily: 'var(--font-serif)',
        fontSize: 13,
        lineHeight: 1.35,
        color: 'var(--color-text-primary)',
      }}
      title={note.title}
    >
      <span aria-hidden="true" style={{ fontSize: 12, fontWeight: 700, color: note.color, marginRight: 8 }}>
        {note.glyph}
      </span>
      {note.severityLabel && (
        <span
          className="font-mono whitespace-nowrap"
          style={{ fontSize: 12, letterSpacing: '0', fontWeight: 700, color: note.color, marginRight: 8 }}
        >
          {note.severityLabel}
        </span>
      )}
      {note.label}
      {note.param && (
        <span
          className="font-mono tabular-nums whitespace-nowrap"
          style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginLeft: 8 }}
        >
          {note.param}
        </span>
      )}
    </div>
  )
}

// ── One acta row: label · value(+sublines+interleaved notes). 2-column
// grid (label · value) — annotations render INSIDE the value cell, beneath
// the value/sublines, as interleaved horizontal bars (ICIJ Pandora ×
// ProPublica document-reader mechanic: comments threaded under the passage
// they indict, occupying zero space when absent). Mobile stacks label
// above value at <768px — annotations already live in the value flow, so
// no separate mobile geometry is needed. ────────────────────────────────────
function ActaRow({
  label,
  value,
  sublines,
  notes,
  extra,
  last,
}: {
  label: string
  value: ReactNode
  sublines?: ReactNode[]
  notes: MarginNote[]
  extra?: ReactNode
  last?: boolean
}) {
  return (
    <div
      className="grid grid-cols-1 min-[360px]:grid-cols-[84px_minmax(0,1fr)] md:grid-cols-[112px_minmax(0,1fr)] gap-x-3 md:gap-x-4"
      style={{ paddingTop: 6 }}
    >
      <div className="min-[360px]:pt-0.5" style={LABEL_STYLE}>{label}</div>
      <div
        className="min-w-0"
        style={{
          borderBottom: last ? undefined : '1px solid color-mix(in srgb, var(--color-border) 40%, transparent)',
          paddingBottom: 6,
        }}
      >
        {value}
        {sublines?.map((s, i) => <div key={i} className="mt-1">{s}</div>)}
        {extra && <div className="mt-2">{extra}</div>}
        {notes.map((n) => <MarginNoteRow key={n.key} note={n} />)}
      </div>
    </div>
  )
}

/** 3-dp signed number with a true minus; `spaced` → "+ 1.820" / "− 0.379". */
function signed(v: number, spaced = false): string {
  const sign = v < 0 ? '−' : '+'
  return `${sign}${spaced ? ' ' : ''}${Math.abs(v).toFixed(3)}`
}

// ── MonthBand micro-strip (P6) — rects + lines only, zero <circle>. ─────────
function MonthBand({
  width,
  awardDate,
  isAward,
  publicationDate,
  isYearEnd,
  accent,
  lang,
}: {
  width: number
  awardDate: Date
  /** true when the anchor is the award date, false when it is the contract date */
  isAward: boolean
  publicationDate: Date | null
  isYearEnd: boolean
  accent: string
  lang: 'en' | 'es'
}) {
  const isEs = lang === 'es'
  const H = 40
  const bandY = 14
  const bandH = 6
  const w = Math.max(120, width)

  const yearStart = new Date(Date.UTC(awardDate.getUTCFullYear(), 0, 1)).getTime()
  const yearEnd = new Date(Date.UTC(awardDate.getUTCFullYear(), 11, 31)).getTime()
  const span = Math.max(1, yearEnd - yearStart)
  const xOf = (d: Date) => (( d.getTime() - yearStart) / span) * w

  const quarterLabels = isEs ? ['ENE', 'ABR', 'JUL', 'OCT'] : ['JAN', 'APR', 'JUL', 'OCT']
  const quarterMonths = [0, 3, 6, 9]

  const awardX = xOf(awardDate)
  const novStart = xOf(new Date(Date.UTC(awardDate.getUTCFullYear(), 10, 1)))

  const pubSameYear = publicationDate && publicationDate.getUTCFullYear() === awardDate.getUTCFullYear()
  const pubX = pubSameYear && publicationDate ? xOf(publicationDate) : null
  // The call is published BEFORE the award (publication_delay_days is
  // contract − publication, never negative): measure lead days to the anchor.
  const leadDays = publicationDate
    ? Math.round((awardDate.getTime() - publicationDate.getTime()) / 86_400_000)
    : null
  const showDelayLabel = leadDays != null && leadDays > 0
  // Name the date the gap is measured to: the award when there is one,
  // otherwise the contract date.
  const leadText = isAward
    ? (isEs ? `convocatoria publicada ${leadDays} días antes de la adjudicación` : `published ${leadDays} days before the award`)
    : (isEs ? `convocatoria publicada ${leadDays} días antes de la fecha del contrato` : `published ${leadDays} days before the contract date`)
  const awardText = awardDate.toLocaleDateString(isEs ? 'es-MX' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
  const srText = (isAward
    ? (isEs ? `Adjudicado el ${awardText}` : `Awarded ${awardText}`)
    : (isEs ? `Fecha del contrato ${awardText}` : `Contract date ${awardText}`))
    + (showDelayLabel
      ? `; ${leadText}.`
      : '.')
  // −N label sits above the band, left of the anchor tick (right of it when
  // the tick is too close to the left edge) — never on the quarter labels.
  const delayLabelLeft = awardX > 70

  return (
    <>
    <span className="sr-only">{srText}</span>
    <svg width={w} height={H} viewBox={`0 0 ${w} ${H}`} role="img" aria-hidden="true" style={{ display: 'block', marginTop: 4 }}>
      {isYearEnd && (
        <rect
          x={novStart}
          y={bandY}
          width={Math.max(0, w - novStart)}
          height={bandH}
          fill={RISK_COLORS.medium}
          opacity={0.18}
        />
      )}
      <rect x={0} y={bandY} width={w} height={bandH} fill="var(--color-border)" opacity={0.5} />
      {quarterMonths.map((m, i) => {
        const x = xOf(new Date(Date.UTC(awardDate.getUTCFullYear(), m, 1)))
        return (
          <g key={m}>
            <line x1={x} x2={x} y1={bandY - 2} y2={bandY + bandH + 2} stroke="var(--color-border)" strokeWidth={0.75} />
            <text x={x} y={H - 2} textAnchor="start" style={{ fontFamily: 'var(--font-mono)' }} fontSize={12} fill="var(--color-text-muted)">
              {quarterLabels[i]}
            </text>
          </g>
        )
      })}
      {/* Award tick */}
      <rect x={awardX - 1} y={bandY - 5} width={2} height={16} fill={accent} />
      {/* Publication tick + delay connector */}
      {pubX != null && (
        <rect x={pubX - 0.625} y={bandY - 1} width={1.25} height={12} fill="var(--color-text-muted)" />
      )}
      {showDelayLabel && pubX != null && (
        <line x1={awardX} x2={pubX} y1={bandY + bandH / 2} y2={bandY + bandH / 2} stroke="var(--color-text-muted)" strokeWidth={1} opacity={0.6} />
      )}
      {showDelayLabel && (
        <text
          data-delay-label
          x={delayLabelLeft ? awardX - 4 : awardX + 4}
          y={bandY - 3}
          textAnchor={delayLabelLeft ? 'end' : 'start'}
          style={{ fontFamily: 'var(--font-mono)' }}
          fontSize={12}
          fill="var(--color-text-muted)"
        >
          <title>{leadText}</title>
          {isEs ? `−${leadDays} días` : `−${leadDays} days`}
        </text>
      )}
    </svg>
    </>
  )
}

export function ActaLedger({
  contract,
  breakdown,
  explanation,
  context,
  riskPct,
  sectorAccent,
  lang,
}: {
  contract: ContractDetail
  breakdown: ContractRiskBreakdownResponse | undefined
  explanation: RiskExplanation | undefined
  context: ContractContextResponse | undefined
  riskPct: number | null
  sectorAccent: string
  lang: 'en' | 'es'
}) {
  const isEs = lang === 'es'
  const [shapOpen, setShapOpen] = useState(false)

  const valueColRef = useRef<HTMLDivElement>(null)
  const [valueColWidth, setValueColWidth] = useState(360)
  useEffect(() => {
    if (!valueColRef.current) return
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width
      if (w && w > 0) setValueColWidth(w)
    })
    ro.observe(valueColRef.current)
    return () => ro.disconnect()
  }, [])

  // ── Factors + structural notes, routed to rows, deduped ──────────────────
  const described = dedupeFactorsByFamily(
    riskTagsOf(breakdown?.factors).map((f) => describeContractFactor(f, lang)),
  ).sort((a, b) => b.sortKey - a.sortKey)

  const structural = buildStructuralNotes(contract, lang)
  const structuralPills = structural.filter((n) => n.kind === 'pill')
  const structuralMarginNotes = structural.filter((n) => n.kind === 'note')

  // dedupe: skip a structural note when a factor of its dedupeKey family
  // already anchors that same row.
  const factorFamilies = new Set(described.map((f) => f.code.split(':')[0]))
  const dedupedStructuralNotes = structuralMarginNotes.filter((n) => {
    if (!n.dedupeKey) return true
    return ![...factorFamilies].some((fam) => fam === n.dedupeKey || fam.startsWith(n.dedupeKey + '_') || (n.dedupeKey === 'threshold_split' && fam.startsWith('split_')))
  })

  const rowNotes: Record<ActaRowKey, MarginNote[]> = {
    monto: [], procedimiento: [], proveedor: [], institucion: [], fechas: [], general: [],
  }
  for (const f of described) {
    rowNotes[anchorRowOf(f)].push(noteFromFactor(f, lang))
  }
  for (const n of dedupedStructuralNotes) {
    rowNotes[n.row].push(noteFromStructural(n))
  }
  // «Adjudicación directa» as a note under «Adjudicación directa» says nothing (§ G5).
  const procLabelEarly = localizeProcedure(contract.procedure_type_normalized ?? contract.procedure_type, lang).toLowerCase()
  rowNotes.procedimiento = rowNotes.procedimiento.filter((n) => n.label.toLowerCase() !== procLabelEarly)
  for (const key of Object.keys(rowNotes) as ActaRowKey[]) {
    rowNotes[key].sort((a, b) => b.sortKey - a.sortKey)
  }

  const hasAnyFactorBasis = described.length > 0
  // C1 boolean fallback basis, when the model recorded a score with no
  // itemized factors (RiskFactorLedger's exact fallback strings, kept).
  const fallbackBasis: string[] = []
  if (!hasAnyFactorBasis) {
    if (contract.is_direct_award) fallbackBasis.push(isEs ? 'adjudicación directa' : 'direct award')
    if (contract.is_single_bid) fallbackBasis.push(isEs ? 'un solo adjudicado' : 'single award')
    if (contract.is_year_end) fallbackBasis.push(isEs ? 'concentración fin de año' : 'year-end concentration')
    if (contract.pyod_is_outlier && contract.ensemble_anomaly_score != null) {
      fallbackBasis.push(
        isEs
          ? `atípico estadístico (${contract.ensemble_anomaly_score.toFixed(2)}; umbral 0.26)`
          : `statistical outlier (${contract.ensemble_anomaly_score.toFixed(2)}; threshold 0.26)`,
      )
    }
  }

  // ── MONTO ──────────────────────────────────────────────────────────────
  const showOriginalCurrency = !!contract.currency && contract.currency !== 'MXN' && contract.amount_original != null
  const montoValue = (
    <span style={VALUE_MONO_STYLE}>{formatMXN(Number(contract.amount_mxn ?? 0))}</span>
  )
  const montoSublines: ReactNode[] = []
  if (showOriginalCurrency) {
    montoSublines.push(
      <span style={SUBLINE_MONO}>
        {isEs ? 'moneda original: ' : 'original currency: '}{contract.currency} {formatNumber(Number(contract.amount_original))}
      </span>,
    )
  }

  // ── PROCEDIMIENTO ──────────────────────────────────────────────────────
  const procedureLabel = localizeProcedure(contract.procedure_type_normalized ?? contract.procedure_type, lang)
  const exception = context?.official?.exception_article?.trim()
  const procedurePillNodes = structuralPills.map((p) => (
        <span
          key={p.label}
          className="font-mono"
          style={{
            fontSize: 12,
            letterSpacing: '0',
            fontWeight: 700,
            color: p.color,
            background: `${p.color}1f`,
            border: `1px solid ${p.color}44`,
            padding: '0 5px',
            borderRadius: 2,
          }}
          title={p.title}
        >
          {p.label}
        </span>
  ))
  const procSublines: ReactNode[] = []
  const pillsInline = !!contract.procedure_number
  if (contract.procedure_number) {
    procSublines.push(
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span style={SUBLINE_MONO}>Nº {contract.procedure_number}</span>
        {procedurePillNodes}
      </span>,
    )
  }
  if (exception) {
    procSublines.push(
      <span style={SUBLINE_SERIF}>{isEs ? 'Excepción legal: ' : 'Legal exception: '}{exception}</span>,
    )
  }
  const procedurePills = !pillsInline && structuralPills.length > 0 ? (
    <div className="flex flex-wrap items-center gap-1.5">{procedurePillNodes}</div>
  ) : undefined

  // ── TIPO — type · character · status, fetched and never shown before (§ G4).
  // Source casing varies by era (ADQUISICIONES / Obra Pública): sentence-case
  // the all-caps ones.
  const tidy = (v?: string | null) => {
    const t = v?.trim()
    if (!t) return null
    return /[a-záéíóúñ]/.test(t) ? t : t.charAt(0) + t.slice(1).toLowerCase()
  }
  const tipoValue = [tidy(contract.contract_type), tidy(contract.procedure_character), tidy(contract.contract_status)]
    .filter(Boolean).join(' · ') || null

  // ── VIGENCIA / TERM (NEW row, between PROCEDIM. and CATEGORÍA) ─────────
  const termStart = contract.start_date ? new Date(contract.start_date) : null
  const termEnd = contract.end_date ? new Date(contract.end_date) : null
  const hasTerm = !!(termStart || termEnd)
  const termDays = termStart && termEnd ? Math.round((termEnd.getTime() - termStart.getTime()) / 86_400_000) : null
  const termValue = termStart && termEnd
    ? (isEs
        ? `del ${formatDate(contract.start_date as string)} al ${formatDate(contract.end_date as string)}${termDays != null ? ` · ${termDays} días` : ''}`
        : `${formatDate(contract.start_date as string)} → ${formatDate(contract.end_date as string)}${termDays != null ? ` · ${termDays} days` : ''}`)
    : termStart
      ? formatDate(contract.start_date as string)
      : termEnd
        ? formatDate(contract.end_date as string)
        : null

  // ── CATEGORÍA ──────────────────────────────────────────────────────────
  const categoryId = context?.official?.category_id
  const categoryName = isEs
    ? (context?.official?.category_name_es || context?.official?.category_name_en)
    : (context?.official?.category_name_en || context?.official?.category_name_es)
  const hasCategory = categoryId != null && !!categoryName

  // ── PROVEEDOR / INSTITUCIÓN ────────────────────────────────────────────
  const hasVendor = contract.vendor_id != null && !!contract.vendor_name
  const hasInstitution = contract.institution_id != null && !!contract.institution_name

  // ── RESPONSABLE ────────────────────────────────────────────────────────
  const officialName = context?.official?.responsible_uc?.trim()
  // /officials/:name profiles exist for 2018+ only — earlier names stay text.
  const officialLinked = (contract.contract_year ?? 0) >= 2018

  // ── FECHAS ─────────────────────────────────────────────────────────────
  const contractDate = contract.contract_date ? new Date(contract.contract_date) : null
  const awardDate = contract.award_date ? new Date(contract.award_date) : null
  const publicationDate = contract.publication_date ? new Date(contract.publication_date) : null
  const monthBandAnchor = awardDate ?? contractDate
  const hasAnyDate = !!(contractDate || awardDate || publicationDate)

  // One calendar (Day 8/10 rule): president AND year from lib/administrations
  // (outgoing convention). Every term is the six years ending at yearEnd, so
  // year 1 = yearEnd − 5 (the DB's sexenio_year counts the handover year as
  // year 1 of the incoming term and is no longer read).
  const admin = getAdministrationByYear(contract.contract_year)
  const term = admin ? admin.long : null
  const sexenioYear = admin && contract.contract_year != null ? contract.contract_year - (admin.yearEnd - 6) : null

  const politicalNote: MarginNote | null = (term || sexenioYear != null) ? {
    key: 'political-cycle',
    glyph: '·',
    severityLabel: '',
    color: 'var(--color-text-muted)',
    label: [term, sexenioYear != null ? (isEs ? `año ${sexenioYear} del sexenio` : `year ${sexenioYear} of the term`) : null]
      .filter(Boolean).join(' · '),
    sortKey: -2,
  } : null

  const fechasNotes = rowNotes.fechas
  // publ. → adj. → contrato · N días (N = publication_delay_days, the stored
  // contract − publication gap, so the page and the API agree).
  const dateSteps = [
    publicationDate ? `${isEs ? 'publ.' : 'published'} ${formatDate(contract.publication_date as string)}` : null,
    awardDate ? `${isEs ? 'adj.' : 'award'} ${formatDate(contract.award_date as string)}` : null,
    contractDate ? `${isEs ? 'contrato' : 'contract'} ${formatDate(contract.contract_date as string)}` : null,
  ].filter((d): d is string => d != null)
  const delayDays = contract.publication_delay_days
  const dateTail = [
    delayDays != null && delayDays > 0 && publicationDate ? (isEs ? `${delayDays} días` : `${delayDays} days`) : null,
    politicalNote?.label ?? null,
  ].filter(Boolean).join(' · ')

  // ── General objections block (unroutable factors) ─────────────────────
  const generalNotes = rowNotes.general

  // ── Data quality / era footer ──────────────────────────────────────────
  const struct = contract.source_structure

  const shapAvailable = Boolean(explanation?.explanation_available) && (explanation?.features?.length ?? 0) > 0
  // Decomposition reconciliation (D12c § Change 8): the API's `logit` sums
  // only the listed terms; the model's full logit is recovered from the
  // stored indicator (score = σ(logit) / c, capped at 1), and the omitted
  // terms carry the difference. Printed values are rounded first so the
  // stated sum adds up on the page.
  const decomp = (() => {
    if (!explanation?.explanation_available || explanation.intercept == null) return null
    const r3 = (v: number) => Math.round(v * 1000) / 1000
    const terms = (explanation.features ?? []).filter((f) => f.contribution !== 0)
    const sum = r3(terms.reduce((a, f) => a + f.contribution, 0))
    // v0.9.2 terms are centred on the mean contract, so the sum starts from that baseline, not the intercept
    const intercept = r3(explanation.baseline_logit ?? explanation.intercept)
    const score = explanation.risk_score
    const c = explanation.pu_correction
    const p = c != null ? score * c : null
    // v0.9.2 stores a display score squashed above 0.60 (MODEL_SATURATION_REVIEW_2026-10-28 § 4 b), which
    // σ⁻¹(score·c) no longer inverts: a complete decomposition takes the API's full logit instead.
    const logit = !explanation.omitted_features?.length && explanation.logit != null
      ? r3(explanation.logit)
      : p != null && score < 1 && p > 0 && p < 1 ? r3(Math.log(p / (1 - p))) : null
    return {
      sum,
      intercept,
      logit,
      omitted: logit != null ? r3(logit - intercept - sum) : null,
      // Every listed term is an active one (the API drops zero coefficients).
      nTerms: (explanation.features ?? []).length,
      nShown: Math.min(6, (explanation.features ?? []).length),
      nOmitted: explanation.omitted_features?.length ?? 0,
      indicator: Math.floor(score * 100),
    }
  })()

  const objectionCount = described.length

  return (
    <div>
      <div
        className="relative"
        style={{ borderTop: '1px solid var(--color-text-primary)', borderBottom: INK_BORDER, paddingTop: 12, paddingBottom: 12 }}
      >

        {/* Header strip — in-flow (PlateFrame fix pattern), first child: cannot
            overprint the first row on mobile the way the old absolute strip did. */}
        <div
          className="flex justify-between items-center gap-3"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 13,
            letterSpacing: '0',
            color: 'var(--color-text-muted)',
            borderBottom: '1px solid var(--color-border)',
            paddingBottom: 10,
            marginBottom: 4,
          }}
        >
          <span className="whitespace-nowrap overflow-hidden text-ellipsis">Acta · CONT-{contract.id}</span>
          {struct && (
            <span className="hidden min-[480px]:inline whitespace-nowrap">
              {struct === 'E' ? 'COMPRASMX' : 'COMPRANET'} · {isEs ? 'estructura' : 'structure'} {struct}
            </span>
          )}
        </div>

        {/* Rows */}
        <div>
          <ActaRow
            label={isEs ? 'MONTO' : 'AMOUNT'}
            value={montoValue}
            sublines={montoSublines}
            notes={rowNotes.monto}
          />
          <ActaRow
            label={isEs ? 'PROCEDIM.' : 'PROCEDURE'}
            value={<span style={VALUE_STYLE}>{procedureLabel}</span>}
            sublines={procSublines}
            extra={procedurePills}
            notes={rowNotes.procedimiento}
          />
          {tipoValue && (
            <ActaRow
              label={isEs ? 'TIPO' : 'TYPE'}
              value={<span style={VALUE_STYLE}>{tipoValue}</span>}
              notes={[]}
            />
          )}
          {hasTerm && (
            <ActaRow
              label={isEs ? 'VIGENCIA' : 'TERM'}
              value={<span style={VALUE_MONO_STYLE}>{termValue}</span>}
              notes={[]}
            />
          )}
          {hasCategory && (
            <ActaRow
              label={isEs ? 'CATEGORÍA' : 'CATEGORY'}
              value={<EntityIdentityChip type="category" id={categoryId as number} name={categoryName as string} size="sm" className="max-md:min-h-8" />}
              notes={[]}
            />
          )}
          {hasVendor && (
            <ActaRow
              label={isEs ? 'PROVEEDOR' : 'VENDOR'}
              value={
                <EntityIdentityChip
                  type="vendor"
                  id={contract.vendor_id as number}
                  name={contract.vendor_name as string}
                  fullName
                  className="max-md:min-h-8"
                />
              }
              notes={rowNotes.proveedor}
            />
          )}
          {hasInstitution && (
            <ActaRow
              label={isEs ? 'INSTITUC.' : 'INSTITUTION'}
              value={
                <EntityIdentityChip
                  type="institution"
                  id={contract.institution_id as number}
                  name={contract.institution_name as string}
                  fullName
                  className="max-md:min-h-8"
                />
              }
              notes={rowNotes.institucion}
            />
          )}
          {officialName && (
            <ActaRow
              label={isEs ? 'RESPONS.' : 'RESPONSIBLE'}
              value={
                officialLinked ? (
                  <Link
                    to={`/officials/${encodeURIComponent(officialName)}`}
                    className="rounded-sm hover:opacity-70 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1"
                    style={OFFICIAL_NAME_STYLE}
                  >
                    {officialName}
                  </Link>
                ) : (
                  <span style={OFFICIAL_NAME_STYLE}>{officialName}</span>
                )
              }
              sublines={[
                <span className="sr-only">
                  {isEs ? 'unidad responsable · autorizó la adjudicación' : 'responsible unit · authorized the award'}
                </span>,
              ]}
              notes={[]}
            />
          )}
          {hasAnyDate && (
            <ActaRow
              label={isEs ? 'FECHAS' : 'DATES'}
              last
              value={
                <div ref={valueColRef}>
                  <div className="tabular-nums" style={SUBLINE_MONO}>
                    {dateSteps.join(' → ')}
                    {dateTail && <span style={{ color: 'var(--color-text-muted)' }}> · {dateTail}</span>}
                  </div>
                  {/* The single-year band misreads a span across years — only
                      the year-end case needs it (contract § G4). */}
                  {monthBandAnchor && contract.is_year_end && (
                    <MonthBand
                      width={Math.min(valueColWidth, 360)}
                      awardDate={monthBandAnchor}
                      isAward={!!awardDate}
                      publicationDate={publicationDate}
                      isYearEnd={!!contract.is_year_end}
                      accent={sectorAccent}
                      lang={lang}
                    />
                  )}
                </div>
              }
              notes={fechasNotes}
            />
          )}
        </div>

        {/* General objections — unroutable factors, same note anatomy */}
        {generalNotes.length > 0 && (
          <div className="mt-2 pt-3" style={{ borderTop: '1px solid var(--color-border)' }}>
            <div className="font-mono mb-2" style={{ fontSize: 13, letterSpacing: '0', color: 'var(--color-text-muted)' }}>
              {isEs ? 'Otras señales registradas' : 'Other recorded tags'}
            </div>
            <div className="space-y-0.5">
              {generalNotes.map((n) => <MarginNoteRow key={n.key} note={n} />)}
            </div>
          </div>
        )}

        {/* No-factors fallback basis */}
        {!hasAnyFactorBasis && fallbackBasis.length > 0 && (
          <div className="mt-2 pt-3" style={{ borderTop: '1px solid var(--color-border)' }}>
            <p style={{ fontFamily: 'var(--font-serif)', fontSize: 13, color: 'var(--color-text-secondary)' }}>
              {isEs ? `Señales registradas: ${fallbackBasis.join(' · ')}.` : `Recorded signals: ${fallbackBasis.join(' · ')}.`}
            </p>
          </div>
        )}

        {/* Null margin state — scored, zero factors, zero booleans */}
        {!hasAnyFactorBasis && fallbackBasis.length === 0 && riskPct != null && (
          <div className="mt-2 pt-3" style={{ borderTop: '1px solid var(--color-border)' }}>
            <p style={{ fontFamily: 'var(--font-serif)', fontStyle: 'normal', fontSize: 13, color: 'var(--color-text-muted)' }}>
              {isEs ? `Sin señales de riesgo registradas — indicador ${riskPct}/100.` : `No recorded risk tags — ${riskPct}/100 indicator.`}
            </p>
          </div>
        )}

        {/* Model decomposition (β·z of the active calibration) — progressive
            enhancement; contract_z_features is not on the deploy DB. */}
        {shapAvailable && (
          <div className="mt-4">
            <button
              type="button"
              onClick={() => setShapOpen((v) => !v)}
              aria-expanded={shapOpen}
              className="min-h-11 sm:min-h-6 rounded-sm font-mono hover:opacity-70 transition-opacity cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1"
              style={{ fontSize: 12, color: 'var(--color-accent-text)', background: 'none', border: 'none', padding: '4px 0' }}
            >
              {shapOpen
                ? (isEs ? '⌃ Ocultar descomposición del modelo (β·z)' : '⌃ Hide model decomposition (β·z)')
                : (isEs ? '⌄ Descomposición del modelo (β·z)' : '⌄ Model decomposition (β·z)')}
            </button>
            {shapOpen && (
              <ul className="mt-2 space-y-1.5 list-none p-0">
                {[...(explanation?.features ?? [])]
                  .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
                  .slice(0, 6)
                  .map((f, i) => {
                    const pos = f.contribution > 0
                    const c = pos ? RISK_COLORS.critical : 'var(--color-text-muted)'
                    return (
                      <li key={i} className="flex items-baseline gap-3 px-3 py-1.5" style={{ borderLeft: `2px solid ${c}` }}>
                        <span aria-hidden="true" style={{ fontSize: 13, color: c, fontWeight: 700, minWidth: 14 }}>
                          {pos ? '▲' : '▽'}
                        </span>
                        <span className="flex-1 min-w-0" style={{ fontFamily: 'var(--font-serif)', fontSize: 13, color: 'var(--color-text-primary)' }}>
                          {f.label}
                        </span>
                        <span className="font-mono tabular-nums flex-shrink-0" style={{ fontSize: 13, color: c, fontWeight: 700 }}>
                          {pos ? '+' : ''}{f.contribution.toFixed(3)}
                        </span>
                      </li>
                    )
                  })}
<li className="px-3 pt-1 font-mono tabular-nums" style={{ fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
                  {[
                    explanation?.run_id,
                    explanation?.baseline_logit != null ? `${isEs ? 'base (contrato promedio)' : 'baseline (mean contract)'} ${signed(explanation.baseline_logit)}` : explanation?.intercept != null ? `${isEs ? 'intercepto' : 'intercept'} ${signed(explanation.intercept)}` : null,
                    explanation?.pu_correction != null ? `PU c ${explanation.pu_correction.toFixed(2)}` : null,
                  ].filter(Boolean).join(' · ')}
                </li>
                {decomp && decomp.nOmitted === 0 && (
                  // Complete decomposition (D13b § Change 6): every active term has a
                  // stored value, so intercept + Σ is the model's logit (≈: the printed
                  // terms are rounded to 3 dp).
                  <li data-decomp-sum className="px-3 font-mono tabular-nums" style={{ fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
                    {isEs
                      ? `Σ de los ${decomp.nTerms} términos (${decomp.nShown} a la vista) ${signed(decomp.sum)} · indicador ${decomp.indicator}/100 — ${signed(decomp.intercept)} ${signed(decomp.sum, true)}${decomp.logit != null ? ` ≈ logit ${signed(decomp.logit)}` : ''}`
                      : `Σ of the ${decomp.nTerms} terms (${decomp.nShown} shown) ${signed(decomp.sum)} · indicator ${decomp.indicator}/100 — ${signed(decomp.intercept)} ${signed(decomp.sum, true)}${decomp.logit != null ? ` ≈ logit ${signed(decomp.logit)}` : ''}`}
                  </li>
                )}
                {decomp && decomp.nOmitted > 0 && (
                  <li data-decomp-sum className="px-3 font-mono tabular-nums" style={{ fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
                    {isEs
                      ? `Σ de los ${decomp.nTerms} términos descompuestos (${decomp.nShown} a la vista) ${signed(decomp.sum)}${decomp.logit != null ? ` · logit ${signed(decomp.logit)}` : ''} · indicador ${decomp.indicator}/100 — `
                        + (decomp.omitted != null
                          ? `las ${decomp.nOmitted} variables sin z guardada aportan el resto (${signed(decomp.omitted)}): ${signed(decomp.intercept)} ${signed(decomp.sum, true)} ${signed(decomp.omitted, true)} = ${signed(decomp.logit!)}`
                          : `las ${decomp.nOmitted} variables sin z guardada aportan el resto`)
                      : `Σ of the ${decomp.nTerms} decomposed terms (${decomp.nShown} shown) ${signed(decomp.sum)}${decomp.logit != null ? ` · logit ${signed(decomp.logit)}` : ''} · indicator ${decomp.indicator}/100 — `
                        + (decomp.omitted != null
                          ? `the ${decomp.nOmitted} terms without a stored z carry the rest (${signed(decomp.omitted)}): ${signed(decomp.intercept)} ${signed(decomp.sum, true)} ${signed(decomp.omitted, true)} = ${signed(decomp.logit!)}`
                          : `the ${decomp.nOmitted} terms without a stored z carry the rest`)}
                  </li>
                )}
              </ul>
            )}
          </div>
        )}
      </div>

      {objectionCount === 0 && <span className="sr-only" aria-hidden="true" />}
    </div>
  )
}

