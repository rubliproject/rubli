import type { ReactNode } from 'react'
import { useReviewMutations } from '@/hooks/useReviewMutations'
import { bucketStatus, DISPOSITION_META, formatAriaDate } from '@/components/aria/disposition'
import type { AriaQueueItem } from '@/api/types'
import { RISK_INK_ON_PLATE, RISK_TEXT_COLORS } from '@/lib/constants'

/**
 * EL VEREDICTO — the analyst's disposition (Pendiente · En revisión · Confirmar · Descartar) and
 * the GT promotion, for the queue's in-row breakdown (RowExpand) and the case view (/aria/caso/:id).
 * Analysts only: the caller gates it; the backend enforces it too (require_admin).
 */

const CANONICAL_STATUSES = ['pending', 'reviewing', 'confirmed', 'dismissed'] as const
const STATUS_GLYPH: Record<string, string> = { pending: '○', reviewing: '◐', confirmed: '✓', dismissed: '⊘' }

export function VerdictBar({ item, isEs, reviewerName, reviewedAt, children }: {
  item: Pick<AriaQueueItem, 'vendor_id' | 'review_status' | 'in_ground_truth'>
  isEs: boolean
  reviewerName?: string | null
  reviewedAt?: string | null
  /** Trailing exits (next / close) on the bar's right end. */
  children?: ReactNode
}) {
  const vendorId = item.vendor_id
  const { setStatus, isSaving, promote, isPromoting, promoted, isError } = useReviewMutations(vendorId)
  // DB carries 15 raw statuses (CENTINELA script states beyond the canonical
  // 4 the type declares) — widen for honest comparisons.
  const rawStatus: string = item.review_status ?? 'pending'
  const isCanonical = (CANONICAL_STATUSES as readonly string[]).includes(rawStatus)
  const showPromote = (rawStatus === 'confirmed' || rawStatus === 'confirmed_corrupt') && !item.in_ground_truth
  const dispo = DISPOSITION_META[bucketStatus(rawStatus)]
  const statusLabel = (s: string) =>
    isEs
      ? ({ pending: 'Pendiente', reviewing: 'En revisión', confirmed: 'Confirmar', dismissed: 'Descartar' } as Record<string, string>)[s]
      : ({ pending: 'Pending', reviewing: 'Reviewing', confirmed: 'Confirm', dismissed: 'Dismiss' } as Record<string, string>)[s]

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
      <h3 className="mr-2">{isEs ? 'Veredicto' : 'Verdict'}</h3>
      {CANONICAL_STATUSES.map((s) => {
        const active = rawStatus === s
        return (
          <button
            key={s}
            type="button"
            disabled={isSaving}
            onClick={() => setStatus(s)}
            aria-pressed={active}
            className="aria-verdict disabled:opacity-50"
            style={active && s === 'confirmed' ? { color: RISK_TEXT_COLORS.critical } : active && s === 'reviewing' ? { color: RISK_INK_ON_PLATE.high } : undefined}
          >
            <span aria-hidden="true">{STATUS_GLYPH[s]}</span> {statusLabel(s)}
          </button>
        )
      })}
      {!isCanonical && (
        <span className="ct-mono text-[13px] text-text-muted">
          {isEs ? `estado actual: ${dispo.es.toLowerCase()}` : `current state: ${dispo.en.toLowerCase()}`}
        </span>
      )}
      {showPromote && (
        <span className="inline-flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <select id={`gt-conf-${vendorId}`} defaultValue="medium" aria-label={isEs ? 'Confianza para agregarlo a la base de casos documentados' : 'Confidence for GT promotion'} className="aria-select">
            <option value="low">{isEs ? 'baja' : 'low'}</option>
            <option value="medium">{isEs ? 'media' : 'medium'}</option>
            <option value="high">{isEs ? 'alta' : 'high'}</option>
          </select>
          <button
            type="button"
            disabled={isPromoting || promoted}
            onClick={() => {
              const sel = document.getElementById(`gt-conf-${vendorId}`) as HTMLSelectElement | null
              promote((sel?.value as 'low' | 'medium' | 'high') ?? 'medium')
            }}
            style={{ color: RISK_INK_ON_PLATE.high }}
            className="aria-verdict disabled:opacity-50"
          >
            <span aria-live="polite">
              {promoted ? (isEs ? 'Promovido ✓' : 'Promoted ✓') : isEs ? 'Agregar a la base de casos' : 'Promote to GT'}
            </span>
          </button>
        </span>
      )}
      <span aria-live="polite" className="ct-mono text-[13px]" style={{ color: RISK_TEXT_COLORS.critical }}>
        {isError ? (isEs ? 'error al guardar' : 'save failed') : ''}
      </span>
      {reviewerName && (
        <span className="ct-mono text-[13px] text-text-muted">
          {isEs ? 'revisado por' : 'reviewed by'} {reviewerName}
          {reviewedAt ? ` · ${formatAriaDate(reviewedAt, isEs)}` : ''}
        </span>
      )}
      {children && <span className="ml-auto inline-flex items-center gap-4">{children}</span>}
    </div>
  )
}
