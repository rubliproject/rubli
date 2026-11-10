/**
 * ContractCompareModal — side-by-side comparison of up to four archive picks.
 *
 * PARALLAX D12b § Change 6: a Radix Dialog (focus moves in, is trapped, Esc
 * closes, focus returns to the Compare button), bilingual via contracts.json,
 * risk as the archive's integer-of-100 VerdictSeal, readable factor labels,
 * full entity names, and "Full details" opens the contract dossier. The
 * contracts arrive fetched by id (/contracts/compare), so picks made on other
 * pages are present.
 */
import * as Dialog from '@radix-ui/react-dialog'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { X, GitCompareArrows, ExternalLink } from 'lucide-react'
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import { VerdictSeal } from '@/components/contracts/VerdictSeal'
import { cn, formatCompactMXN, formatDate } from '@/lib/utils'
import { SECTORS, getSectorTextColor } from '@/lib/constants'
import { parseFactorLabel, isReviewFlag } from '@/lib/risk-factors'
import { localizeProcedure, sanitizeContractText } from '@/lib/contract-format'
import { cleanContractDescription } from '@/lib/contract-audit'
import type { ContractListItem } from '@/api/types'

type CompareContract = Pick<
  ContractListItem,
  | 'id' | 'title' | 'contract_number' | 'sector_id' | 'risk_score' | 'risk_level' | 'amount_mxn'
  | 'contract_date' | 'contract_year' | 'vendor_id' | 'vendor_name' | 'institution_id'
  | 'institution_name' | 'procedure_type' | 'is_direct_award' | 'is_single_bid' | 'risk_factors'
>

interface ContractCompareModalProps {
  contracts: CompareContract[]
  loading?: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The control that opened the dialog — focus returns there on close. */
  returnFocusRef?: React.RefObject<HTMLButtonElement | null>
}

function CompareRow({ label, values, highlightIndexes = [] }: { label: string; values: React.ReactNode[]; highlightIndexes?: number[] }) {
  return (
    <tr className="border-b border-border/40 last:border-0">
      <th scope="row" className="px-3 py-2.5 text-left text-xs font-medium text-text-muted whitespace-nowrap bg-background-card/60 border-r border-border/40 w-28">
        {label}
      </th>
      {values.map((val, i) => (
        <td
          key={i}
          className={cn('px-3 py-2.5 text-xs border-r border-border/30 last:border-r-0 align-top', highlightIndexes.includes(i) && 'bg-accent/5')}
        >
          {val}
        </td>
      ))}
    </tr>
  )
}

export function ContractCompareModal({ contracts, loading, open, onOpenChange, returnFocusRef }: ContractCompareModalProps) {
  const { t, i18n } = useTranslation('contracts')
  const { t: ts } = useTranslation('sectors')
  const lang = i18n.language?.startsWith('es') ? 'es' : 'en'
  const n = contracts.length

  const maxRiskIdx = contracts.reduce((best, c, i) => ((c.risk_score ?? 0) > (contracts[best].risk_score ?? 0) ? i : best), 0)
  const maxAmtIdx = contracts.reduce((best, c, i) => (c.amount_mxn > contracts[best].amount_mxn ? i : best), 0)
  const colWidth = n <= 2 ? '42%' : n === 3 ? '30%' : '23%'

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="overlay-fade fixed inset-0 z-[9998]" style={{ background: 'rgba(26,23,20,0.55)' }} />
        <Dialog.Content
          aria-describedby={undefined}
          onCloseAutoFocus={(e) => {
            if (returnFocusRef?.current) {
              e.preventDefault()
              returnFocusRef.current.focus()
            }
          }}
          className="overlay-fade fixed left-1/2 top-1/2 z-[9999] w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto border border-border bg-background-card rounded-sm shadow-xl focus:outline-none"
          style={{ maxWidth: n <= 2 ? '48rem' : n === 3 ? '64rem' : '78rem', maxHeight: '90vh' }}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-border sticky top-0 bg-background-card z-10">
            <div className="flex items-center gap-2">
              <GitCompareArrows className="h-4 w-4 text-accent" aria-hidden="true" />
              <Dialog.Title className="text-sm font-semibold">
                {t('compare.title')}
                <span className="ml-1.5 text-xs font-normal text-text-muted">{t('compare.selected', { count: n })}</span>
              </Dialog.Title>
            </div>
            <Dialog.Close
              className="inline-flex min-h-6 min-w-6 items-center justify-center rounded-sm opacity-70 hover:opacity-100 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1"
              aria-label={t('compare.close')}
            >
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>

          {loading || n === 0 ? (
            <p className="px-4 py-10 text-center text-xs text-text-muted">{t('compare.loading')}</p>
          ) : (
            <div className="p-0 overflow-x-auto">
              <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }} aria-label={t('compare.tableLabel')}>
                <colgroup>
                  <col style={{ width: '7rem' }} />
                  {contracts.map((c) => <col key={c.id} style={{ width: colWidth }} />)}
                </colgroup>
                <tbody>
                  <tr className="border-b border-border/60 bg-background-card/40">
                    <td className="px-3 py-2 bg-background-card/60 border-r border-border/40" />
                    {contracts.map((c) => (
                      <td key={c.id} className="px-3 py-2.5 border-r border-border/30 last:border-r-0 align-top">
                        <p className="text-xs font-semibold text-text-primary leading-snug">
                          {sanitizeContractText(cleanContractDescription(c.title || '', Infinity).objeto) || t('compare.untitled')}
                        </p>
                        <p className="text-xs text-text-muted mt-0.5 font-mono">{c.contract_number || `#${c.id}`}</p>
                        <Link
                          to={`/contracts/${c.id}`}
                          state={{ from: 'archive' }}
                          onClick={() => onOpenChange(false)}
                          className="mt-1.5 inline-flex min-h-6 items-center gap-1 rounded-sm text-xs text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1"
                        >
                          <ExternalLink className="h-3 w-3" aria-hidden="true" />
                          {t('compare.fullDetails')}
                        </Link>
                      </td>
                    ))}
                  </tr>

                  <CompareRow
                    label={t('compare.rows.risk')}
                    values={contracts.map((c) => <VerdictSeal key={c.id} score={c.risk_score} level={c.risk_level} align="left" />)}
                    highlightIndexes={[maxRiskIdx]}
                  />
                  <CompareRow
                    label={t('compare.rows.amount')}
                    values={contracts.map((c, i) => (
                      <span key={c.id} className={cn('font-mono text-[13px] tabular-nums', maxAmtIdx === i && 'text-text-primary font-semibold')}>
                        {formatCompactMXN(c.amount_mxn)}
                      </span>
                    ))}
                    highlightIndexes={[maxAmtIdx]}
                  />
                  <CompareRow
                    label={t('compare.rows.date')}
                    values={contracts.map((c) => (
                      <span key={c.id} className="text-text-primary">{c.contract_date ? formatDate(c.contract_date) : (c.contract_year || '—')}</span>
                    ))}
                  />
                  <CompareRow
                    label={t('compare.rows.vendor')}
                    values={contracts.map((c) => (
                      c.vendor_id && c.vendor_name
                        ? <EntityIdentityChip key={c.id} type="vendor" id={c.vendor_id} name={c.vendor_name} size="inherit" fullName />
                        : <span key={c.id} className="text-text-muted">—</span>
                    ))}
                  />
                  <CompareRow
                    label={t('compare.rows.institution')}
                    values={contracts.map((c) => (
                      c.institution_id && c.institution_name
                        ? <EntityIdentityChip key={c.id} type="institution" id={c.institution_id} name={c.institution_name} size="inherit" fullName />
                        : <span key={c.id} className="text-text-muted">—</span>
                    ))}
                  />
                  <CompareRow
                    label={t('compare.rows.sector')}
                    values={contracts.map((c) => {
                      const sec = c.sector_id ? SECTORS.find((s) => s.id === c.sector_id) : null
                      return sec
                        ? <span key={c.id} className="font-medium" style={{ color: getSectorTextColor(sec.code) }}>{ts(sec.code)}</span>
                        : <span key={c.id} className="text-text-muted">—</span>
                    })}
                  />
                  <CompareRow
                    label={t('compare.rows.procedure')}
                    values={contracts.map((c) => <span key={c.id} className="text-text-primary">{localizeProcedure(c.procedure_type, lang)}</span>)}
                  />
                  <CompareRow
                    label={t('compare.rows.flags')}
                    values={contracts.map((c) => (
                      <div key={c.id} className="flex flex-wrap gap-1">
                        {c.is_direct_award && <span className="text-xs text-text-secondary border border-border px-1.5 py-0.5 rounded-sm">{t('compare.directAward')}</span>}
                        {c.is_single_bid && <span className="text-xs text-text-secondary border border-border px-1.5 py-0.5 rounded-sm">{t('compare.singleBid')}</span>}
                        {!c.is_direct_award && !c.is_single_bid && <span className="text-text-muted">—</span>}
                      </div>
                    ))}
                  />
                  <CompareRow
                    label={t('compare.rows.riskTags')}
                    values={contracts.map((c) => {
                      const tags = (c.risk_factors ?? []).filter((f) => f && !isReviewFlag(f))
                      return tags.length > 0
                        ? (
                          <ul key={c.id} className="flex flex-wrap gap-1 list-none p-0 m-0">
                            {tags.map((f) => (
                              <li key={f} className="text-xs bg-border/30 text-text-secondary px-1 py-0.5 rounded-sm">{parseFactorLabel(f, lang).label}</li>
                            ))}
                          </ul>
                        )
                        : <span key={c.id} className="text-text-muted">—</span>
                    })}
                  />
                </tbody>
              </table>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
