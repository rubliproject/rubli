import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { safeHttpUrl } from '@/lib/utils'
import { useQuery } from '@tanstack/react-query'
import { ariaApi } from '@/api/client'
import { useAuth } from '@/contexts/AuthContext'
import { AriaMemoPanel } from '@/components/widgets/AriaMemoPanel'
import { VerdictBar } from '@/components/aria/VerdictBar'
import { IpsLedger, PatternList } from '@/components/aria/IpsLedger'
import { corroboration, formatAriaDate, VERDICT_LABEL } from '@/components/aria/disposition'
import type { AriaQueueItem } from '@/api/types'
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import { RISK_INK_ON_PLATE, RISK_TEXT_COLORS } from '@/lib/constants'

/**
 * EL DESGLOSE — lazy in-row case file (El Expediente file-panel precedent,
 * /atlas L2): «Cómo se suma la prioridad» (IpsLedger: the weighted parts on a 0–1 rule with the
 * tier thresholds, each input named honestly, Mahalanobis included) beside the patterns, and a one-line case card (case · buyer · registries ·
 * strongest source · memo · dossier). The memo
 * opens on demand, and only when /aria/memos/{id} has one. The verdict bar
 * (graft from La Mesa de Revisión) renders for analysts only.
 */

const DOT = <span className="text-text-muted" aria-hidden="true"> · </span>

interface RowExpandProps {
  item: AriaQueueItem
  isEs: boolean
  onClose: () => void
  onNext: (() => void) | null
}

// The single strongest source: sanction before mention before press.
const VERDICT_RANK: Record<string, number> = { SANCTION: 0, CORRUPTION_MENTION: 1, JOURNALISM: 2, SHELL_SIGNAL: 3 }

export function RowExpand({ item, isEs, onClose, onNext }: RowExpandProps) {
  const vendorId = item.vendor_id
  // Verdict + GT promotion are analyst actions; the backend enforces it too (require_admin).
  const isAnalyst = useAuth().user?.is_admin === true
  const [memoOpen, setMemoOpen] = useState(false)

  const { data: detail } = useQuery({
    queryKey: ['aria-lead-detail', vendorId],
    queryFn: () => ariaApi.getVendorDetail(vendorId),
    staleTime: 5 * 60_000,
  })

  const hasWebSignal = (item.web_evidence_score ?? 0) > 0
  const { data: webEv } = useQuery({
    queryKey: ['aria-web-evidence', vendorId],
    queryFn: () => ariaApi.getWebEvidence(vendorId),
    staleTime: 5 * 60_000,
    enabled: hasWebSignal,
  })

  // Same key + fetcher as AriaMemoPanel, so opening the memo is a cache hit.
  // getMemo returns null on 404, and then no memo link renders (spec G4: a row
  // chip said LLM while /aria/memos/{id} answered "No memo found").
  const { data: memo } = useQuery({
    queryKey: ['aria-memo', vendorId],
    queryFn: () => ariaApi.getMemo(vendorId),
    staleTime: 600_000,
  })

  // Escape closes this row only when focus is inside it (or on <body>), so it
  // no longer fires while typing in the search box (grader D, P2).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const el = e.target as Element | null
      if (el === document.body || el?.closest?.(`#aria-row-${vendorId}`)) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, vendorId])

  const withMaha = { ...item, mahalanobis_norm: detail?.mahalanobis_norm }
  const ticks = corroboration(item)

  const gtCaseName = (detail as (AriaQueueItem & { gt_case_name?: string | null }) | undefined)?.gt_case_name


  const source = [...(webEv?.articles ?? [])]
    .filter((a) => a.verdict in VERDICT_RANK)
    .sort((a, b) => VERDICT_RANK[a.verdict] - VERDICT_RANK[b.verdict])[0]
  const sourceDate = source ? formatAriaDate(source.published_date, isEs) : null

  const memoKind = (() => {
    const k = memo?.memo_type ?? item.memo_provenance
    if (k === 'llm_narrative') return isEs ? 'IA' : 'AI'
    if (k === 'analyst') return isEs ? 'analista' : 'analyst'
    if (k === 'template' || k === 'duplicate') return isEs ? 'plantilla' : 'template'
    if (k === 'stub') return isEs ? 'borrador' : 'stub'
    return null
  })()

  const first = item.first_contract_year ?? null
  const last = item.last_contract_year ?? null

  return (
    <div
      id={`aria-desglose-${vendorId}`}
      role="region"
      aria-label={isEs ? `Desglose: ${item.vendor_name ?? ''}` : `Breakdown: ${item.vendor_name ?? ''}`}
      className="aria-x"
    >
      {/* ¿Por qué este rango? — the IPS as a ruled decomposition (IpsLedger) + the patterns */}
      <h3>{isEs ? '¿Por qué este rango?' : 'Why this rank?'}</h3>
      <div className="aria-x-why">
        <IpsLedger item={withMaha} lang={isEs ? 'es' : 'en'} />
        <PatternList confidences={item.pattern_confidences} lang={isEs ? 'es' : 'en'} />
      </div>

      {/* Case card — one line; wraps only when it must */}
      <p className="aria-x-line">
        {item.in_ground_truth ? (
          <>
            <span className="aria-x-k" style={{ color: 'var(--color-accent-text)' }}>{isEs ? 'Caso ' : 'Case '}</span>
            <span className="text-text-primary">{gtCaseName ?? (isEs ? 'documentado' : 'documented')}</span>
          </>
        ) : item.gt_lead ? (
          <span className="text-text-muted">{isEs ? 'Vínculo a un caso · sin verificar' : 'Case link · unverified'}</span>
        ) : (
          <span className="text-text-muted">{isEs ? 'Señalado por el modelo · sin caso documentado' : 'Model-flagged · no documented case'}</span>
        )}
        {item.top_institution && (
          <>
            {DOT}
            <span className="aria-x-k">{isEs ? 'Dependencia ' : 'Buyer '}</span>
            {item.top_institution_id != null
              ? <EntityIdentityChip type="institution" id={item.top_institution_id} name={item.top_institution} variant="name" hideIcon />
              : item.top_institution}
            {/* top_institution_ratio is the CONTRACT-COUNT share (H3) — say so. */}
            {item.top_institution_ratio != null && (
              <span className="ct-mono text-[13px] text-text-muted"> {Math.round(item.top_institution_ratio * 100)}% {isEs ? 'de los contratos' : 'of contracts'}</span>
            )}
          </>
        )}
        {item.direct_award_rate != null && (
          <>
            {DOT}
            <span className="ct-mono text-[13px]">{Math.round(item.direct_award_rate * 100)}%</span>
            <span className="text-text-muted"> {isEs ? 'adjudicación directa' : 'direct award'}</span>
          </>
        )}
        {first != null && last != null && (
          <>
            {DOT}
            <span className="aria-x-k">{isEs ? 'Vigencia ' : 'Active '}</span>
            <span className="ct-mono text-[13px]">{first}–{last}</span>
          </>
        )}
        {ticks.e && (
          <>
            {DOT}
            <span className="ct-mono text-[13px]" style={{ color: RISK_TEXT_COLORS.critical }}>SAT EFOS {isEs ? 'definitivo' : 'definitive'}</span>
          </>
        )}
        {item.is_sfp_sanctioned && (
          <>
            {DOT}
            <span className="ct-mono text-[13px]" style={{ color: RISK_INK_ON_PLATE.high }}>{isEs ? 'Sancionado por la SFP' : 'SFP sanctioned'}</span>
          </>
        )}
        {source && (
          <>
            {DOT}
            <span title={source.snippet}>
              <span className="aria-x-k" style={{ color: source.verdict === 'SANCTION' ? RISK_TEXT_COLORS.critical : RISK_INK_ON_PLATE.high }}>
                {isEs ? VERDICT_LABEL[source.verdict].es : VERDICT_LABEL[source.verdict].en}
              </span>
              {source.source_name ? <span className="text-text-muted"> {source.source_name}</span> : null}
              {sourceDate ? <span className="ct-mono text-[13px] text-text-muted"> {sourceDate}</span> : null}
            </span>
            {source.source_url && (
              <>
                {' '}
                <a href={safeHttpUrl(source.source_url)} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="ct-link">
                  {isEs ? 'fuente ↗' : 'source ↗'}
                </a>
              </>
            )}
          </>
        )}
      </p>

      {/* Exits — memo (with its provenance), dossier, next, close */}
      <p className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-1">
        {memo && (
          <button type="button" onClick={() => setMemoOpen((v) => !v)} aria-expanded={memoOpen} aria-controls={`aria-memo-${vendorId}`} className="aria-x-act">
            {memoOpen ? (isEs ? 'Cerrar memo' : 'Close memo') : isEs ? 'Leer memo' : 'Read memo'}
            {memoKind ? ` · ${memoKind}` : ''}
          </button>
        )}
        <Link to={`/aria/caso/${vendorId}`} onClick={(e) => e.stopPropagation()} className="aria-x-act">
          {isEs ? 'Abrir el caso →' : 'Open the case →'}
        </Link>
        {!isAnalyst && onNext && (
          <button type="button" onClick={onNext} className="aria-x-act">
            {isEs ? 'Siguiente por revisar ↓' : 'Next to review ↓'}
          </button>
        )}
        {!isAnalyst && (
          <button type="button" onClick={onClose} className="aria-x-act text-text-muted" aria-label={isEs ? 'Cerrar desglose' : 'Close breakdown'}>
            {isEs ? 'Cerrar' : 'Close'}
          </button>
        )}
      </p>

      {/* Memo — on demand; the panel keeps its own provenance demotion (PLANTILLA / STUB). */}
      {memo && memoOpen && (
        <div id={`aria-memo-${vendorId}`} className="ct-row-in mt-3 max-h-[420px] overflow-y-auto pr-1">
          <AriaMemoPanel
            vendorId={vendorId}
            vendorName={item.vendor_name ?? ''}
            tier={item.ips_tier ?? undefined}
            gtUnverified={!item.in_ground_truth && !!item.gt_lead}
            className="!p-0 !border-0 !bg-transparent"
          />
        </div>
      )}

      {/* EL VEREDICTO — analysts only (shared with the case view) */}
      {isAnalyst && (
        <VerdictBar item={item} isEs={isEs} reviewerName={detail?.reviewer_name} reviewedAt={detail?.reviewed_at}>
          {onNext && (
            <button type="button" onClick={onNext} className="aria-x-act">
              {isEs ? 'Siguiente por revisar ↓' : 'Next to review ↓'}
            </button>
          )}
          <button type="button" onClick={onClose} className="aria-x-act text-text-muted" aria-label={isEs ? 'Cerrar desglose' : 'Close breakdown'}>
            {isEs ? 'Cerrar' : 'Close'}
          </button>
        </VerdictBar>
      )}
    </div>
  )
}
