/**
 * SenaladosBand — «Los señalados / The flagged»: the ruled section that leads
 * /contracts (El Archivo). Shows the most-concerning contracts matching the
 * CURRENT filter — documented corruption cases first, then high+critical risk —
 * named, sourced, each linking to its full dossier.
 *
 * Honesty rules (folio): a non-accusatory framing line; an explicit calm state
 * when nothing is flagged (never dress low-risk rows as alarming); hidden during
 * a free-text search (the band is for filter/preset browsing, not lookup).
 */
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowRight, ScrollText } from 'lucide-react'
import { contractApi } from '@/api/client'
import type { ContractFilterParams, ContractListItem } from '@/api/types'
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import { cn } from '@/lib/utils'
import { RISK_TEXT_COLORS, RISK_INK_ON_PLATE } from '@/lib/constants'
import { RegisterBoard } from './RegisterBoard'
import { parseFactorLabel, getFactorCategoryColor, getFactorCategoryTextColor, isReviewFlag } from '@/lib/risk-factors'

// ---------------------------------------------------------------------------
// Shared bits (reused by ContractRow)
// ---------------------------------------------------------------------------

/** Documented-case seal — the contract's SUPPLIER is in a named scandal (often matched by vendor only). */
export function CaseSeal({
  contract,
  lang,
  className,
}: {
  contract: Pick<ContractListItem, 'is_documented_case' | 'case_slug' | 'case_name_es' | 'case_name_en'>
  lang: string
  className?: string
}) {
  if (!contract.is_documented_case || !contract.case_slug) return null
  const name =
    (lang === 'es' ? contract.case_name_es : contract.case_name_en) ||
    contract.case_name_en ||
    contract.case_name_es ||
    ''
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-sm border border-risk-critical/40 bg-risk-critical/10 px-1.5 py-0.5 text-[12px] font-medium',
        className,
      )}
      style={{ color: RISK_TEXT_COLORS.critical }}
      title={
        lang === 'es'
          ? 'El proveedor aparece en un caso documentado. Este contrato no es necesariamente parte del caso: es un vínculo, no una prueba.'
          : 'The supplier appears in a documented case. This contract is not necessarily part of it: a link, not proof.'
      }
    >
      <ScrollText className="h-3 w-3 shrink-0" aria-hidden="true" />
      <span className="whitespace-nowrap">
        {/* Supplier-level, not contract-level: 201 of the 253 sealed contracts were
            matched to their case by vendor_id alone (ORANGE 2026-11-04, Teya). */}
        {lang === 'es' ? 'Proveedor en caso documentado' : 'Supplier in a documented case'}
      </span>
      {name && (
        <>
          <ArrowRight className="h-2.5 w-2.5 shrink-0 opacity-60" aria-hidden="true" />
          <EntityIdentityChip type="case" id={contract.case_slug} name={name} size="sm" fullName />
        </>
      )}
    </span>
  )
}

/** Why-flagged strip: top risk factors + procurement seals + anomaly tick. */
export function WhyFlags({
  contract,
  lang,
  max = 2,
  className,
  hideDirectAward = false,
}: {
  contract: ContractListItem
  lang: string
  max?: number
  className?: string
  /** Hide the "Direct award" seal when DA is the norm in the result set. */
  hideDirectAward?: boolean
}) {
  // Drop factor tokens already represented by the DA / single-award seals below,
  // so a row doesn't show "Direct Award" (factor) AND "Direct award" (seal).
  const DA_SB = /(direct[_\s]?award|single[_\s]?bid|licitante|adjudicaci)/i
  const factors = (contract.risk_factors ?? []).filter(Boolean).filter((f) => !DA_SB.test(f) && !isReviewFlag(f))
  const shown = factors.slice(0, max)
  const extra = factors.length - shown.length
  const seals: { key: string; label: string; tone: string; ink: string }[] = []
  if (contract.is_direct_award && !hideDirectAward)
    seals.push({
      key: 'da',
      label: lang === 'es' ? 'Adj. directa' : 'Direct award',
      tone: 'border-risk-high/40 bg-risk-high/10',
      ink: RISK_INK_ON_PLATE.high,
    })
  if (contract.is_single_bid)
    seals.push({
      key: 'sb',
      label: lang === 'es' ? 'Un solo adjudicado' : 'Single award',
      tone: 'border-risk-critical/40 bg-risk-critical/10',
      ink: RISK_TEXT_COLORS.critical,
    })
  const anomalous = (contract.mahalanobis_distance ?? 0) > 20

  if (shown.length === 0 && seals.length === 0 && !anomalous) return null

  return (
    <div className={cn('flex flex-wrap items-center gap-1', className)}>
      {shown.map((raw) => {
        const parsed = parseFactorLabel(raw, lang === 'es' ? 'es' : 'en')
        const color = getFactorCategoryColor(parsed.category)
        const ink = getFactorCategoryTextColor(parsed.category)
        return (
          <span
            key={raw}
            className="rounded-sm border px-1 py-0.5 text-[12px] font-medium"
            style={{ backgroundColor: `${color}14`, color: ink, borderColor: `${color}30` }}
            title={raw.replace(/:\d+%/, '')} /* the legacy co-bid % is never printed (D12c § 6) */
          >
            {parsed.label}
          </span>
        )
      })}
      {seals.map((s) => (
        <span
          key={s.key}
          className={cn('rounded-sm border px-1 py-0.5 text-[12px] font-medium', s.tone)}
          style={{ color: s.ink }}
        >
          {s.label}
        </span>
      ))}
      {anomalous && (
        <span
          className="rounded-sm border border-risk-high/40 bg-risk-high/10 px-1 py-0.5 text-[12px] font-medium tabular-nums"
          style={{ color: RISK_INK_ON_PLATE.high }}
          title={
            lang === 'es'
              ? `Anomalía multivariada (D²=${contract.mahalanobis_distance?.toFixed(1)})`
              : `Multivariate anomaly (D²=${contract.mahalanobis_distance?.toFixed(1)})`
          }
        >
          △ D²
        </span>
      )}
      {extra > 0 && (
        <span className="text-[12px] text-text-muted">
          {lang === 'es' ? `+${extra} más` : `+${extra} more`}
        </span>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// The band
// ---------------------------------------------------------------------------

/** One entry per documented case / vendor — the highlights endpoint can return
 *  the same scandal four times (archive § G7). */
function dedupeHighlights(rows: ContractListItem[], n: number): ContractListItem[] {
  const seen = new Set<string>()
  const out: ContractListItem[] = []
  for (const c of rows) {
    const key = c.case_slug ? `case:${c.case_slug}` : c.vendor_id ? `v:${c.vendor_id}` : `c:${c.id}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(c)
    if (out.length === n) break
  }
  return out
}

export function SenaladosBand({
  filters,
  lang,
}: {
  filters: ContractFilterParams
  lang: string
}) {
  const { t } = useTranslation('contracts')
  const active = !filters.search // hidden during free-text search

  const { data, isLoading, isError } = useQuery({
    queryKey: ['contracts-highlights', filters],
    queryFn: () => contractApi.getHighlights(filters, 12),
    staleTime: 2 * 60 * 1000,
    enabled: active,
  })

  // A failed fetch is not "nothing flagged" — say nothing rather than a false empty.
  if (!active || isError) return null
  const items = dedupeHighlights(data ?? [], 3)

  return (
    <section className="ct-section" aria-labelledby="cx-flag-h">
      <div className="ct-annex-row">
        <h2 id="cx-flag-h" className="ct-h2">{t('ct.flagged')}</h2>
      </div>
      <p className="ct-annex-lede">{t('senalados.honesty', 'Flagged by the model and documented cases — not an accusation.')}</p>
      <div className="ct-section-body">
        <RegisterBoard
          rows={items}
          lang={lang === 'en' ? 'en' : 'es'}
          label={t('ct.flagged')}
          status={isLoading ? <span className="cx-hold-flag" aria-hidden="true" /> : items.length === 0 ? <span className="cx-note">{t('senalados.empty', 'No standout flags in this filter.')}</span> : undefined}
        />
      </div>
    </section>
  )
}
