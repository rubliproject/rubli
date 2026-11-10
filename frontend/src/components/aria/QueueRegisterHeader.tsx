import { TableExportButton } from '@/components/TableExportButton'
import { bucketCounts, formatAriaDate } from '@/components/aria/disposition'
import { formatNumber } from '@/lib/utils'
import { glueDashes } from '@/lib/typography'
import type { AriaQueueSummary } from '@/api/types'

/**
 * § EL REGISTRO header — view toggle (Nivel 1 | Pistas nuevas), the count and
 * export, the DISPOSICIÓN strip (honest T1 triage tally from t1_status_counts,
 * NOT t1_reviewed_count, which counts every row; audit F2), and the T2/T4
 * variant line. Column heads live on the table (RegisterHead).
 * Thesis: la máquina propone, el analista dispone.
 */

interface QueueRegisterHeaderProps {
  isEs: boolean
  totalLeads: number
  tierFilter: number | null
  novelOnly: boolean
  t1StatusCounts: Record<string, number> | null | undefined
  runDateline: string | null
  novelLeadsT2: number | null
  provenance: AriaQueueSummary | null
  tier4Count: number
  t1Count: number
  onPickView: (view: 't1' | 'disc') => void
  onFilterNeedsReview: () => void
  exportData: Record<string, unknown>[]
}

export function QueueRegisterHeader({
  isEs, totalLeads, tierFilter, novelOnly, t1StatusCounts, runDateline, novelLeadsT2, provenance, tier4Count, t1Count, onPickView, onFilterNeedsReview, exportData,
}: QueueRegisterHeaderProps) {
  const buckets = bucketCounts(t1StatusCounts)
  const openWork = buckets.por_revisar + buckets.pendiente
  const stripTotal = buckets.confirmada + openWork + buckets.descartada + buckets.revisada + buckets.pipeline
  const showStrip = (tierFilter === 1 || tierFilter == null) && stripTotal > 0
  const dateline = formatAriaDate(runDateline, isEs)

  // Severity tokens only where the state is severe; the rest walk the ink ramp.
  const segs = [
    { n: buckets.confirmada, color: 'var(--color-risk-critical)', label: isEs ? 'confirmadas' : 'confirmed' },
    { n: openWork, color: 'var(--color-risk-high)', label: isEs ? 'por revisar' : 'to review' },
    { n: buckets.descartada, color: 'var(--color-text-muted)', label: isEs ? 'descartadas' : 'dismissed' },
    { n: buckets.revisada, color: 'color-mix(in srgb, var(--color-text-muted) 45%, white)', label: isEs ? 'revisadas' : 'reviewed' },
    { n: buckets.pipeline, color: 'var(--color-background-elevated)', label: isEs ? 'automáticas' : 'automated' },
  ].filter((s) => s.n > 0)

  return (
    <div className="mt-4">
      <div className="aria-reg-meta">
        {t1Count > 0 && novelLeadsT2 != null && novelLeadsT2 > 0 && (
          <span role="group" aria-label={isEs ? 'Vista del registro' : 'Register view'} className="inline-flex flex-wrap gap-2">
            {([
              ['t1', tierFilter === 1 && !novelOnly, isEs ? 'Nivel 1' : 'Tier 1', t1Count],
              ['disc', tierFilter === 2 && novelOnly, isEs ? 'Pistas nuevas' : 'New leads', novelLeadsT2],
            ] as const).map(([view, on, label, n]) => (
              <button key={view} type="button" className="ct-chip" onClick={() => onPickView(view)} aria-pressed={on}>
                {label} <small>{formatNumber(n)}</small>
              </button>
            ))}
          </span>
        )}
        <span className="ml-auto">
          {totalLeads > 0
            ? `${formatNumber(totalLeads)} ${isEs ? (totalLeads === 1 ? 'proveedor' : 'proveedores') : totalLeads === 1 ? 'vendor' : 'vendors'}`
            : ''}
        </span>
        <span className="inline-flex items-center gap-2">
          <TableExportButton data={exportData} filename="aria-queue" showXlsx={true} disabled={exportData.length === 0} />
          {isEs ? 'esta página' : 'this page'}
        </span>
      </div>

      {showStrip && (
        <div className="aria-dispo">
          <div
            className="aria-dispo-bar"
            role="img"
            aria-label={
              isEs
                ? `Disposición del Nivel 1: ${buckets.confirmada} confirmadas, ${openWork} por revisar, ${buckets.descartada} descartadas, ${buckets.revisada} revisadas, ${buckets.pipeline} con estado automático`
                : `Tier 1 disposition: ${buckets.confirmada} confirmed, ${openWork} to review, ${buckets.descartada} dismissed, ${buckets.revisada} reviewed, ${buckets.pipeline} automated`
            }
          >
            {segs.map((s) => <span key={s.label} style={{ width: `${(s.n / stripTotal) * 100}%`, background: s.color }} />)}
          </div>
          <p>
            <b>{isEs ? 'Disposición del nivel 1' : 'Tier 1 disposition'}</b>
            {buckets.confirmada} {isEs ? 'confirmadas' : 'confirmed'} · {openWork} {isEs ? 'por revisar' : 'to review'} · {buckets.descartada} {isEs ? 'descartadas' : 'dismissed'}
            {buckets.revisada > 0 ? ` · ${buckets.revisada} ${isEs ? 'revisadas' : 'reviewed'}` : ''}
            {buckets.pipeline > 0 ? ` · ${buckets.pipeline} ${isEs ? 'automáticas' : 'automated'}` : ''}
            {dateline && glueDashes(`, ${isEs ? 'al corte de la corrida del' : 'as of the run of'} ${dateline}`)}
            {openWork > 0 && tierFilter === 1 && (
              <>
                {' · '}
                <button type="button" onClick={onFilterNeedsReview} className="ct-link" style={{ minHeight: 32 }}>
                  {isEs ? `ver las ${openWork} por revisar` : `view the ${openWork} to review`}
                </button>
              </>
            )}
          </p>
        </div>
      )}

      {tierFilter === 2 && novelLeadsT2 != null && (
        <p className="mt-3 text-text-secondary">
          {novelOnly
            ? isEs
              ? `${formatNumber(novelLeadsT2)} señalados por el modelo, sin caso documentado (en calibración).`
              : `${formatNumber(novelLeadsT2)} model discoveries: no documented case, in calibration.`
            : provenance
              ? isEs
                ? `Nivel 2: ${formatNumber(novelLeadsT2)} señalados por el modelo · ${formatNumber(provenance.documented_t2)} documentados · ${formatNumber(provenance.lead_t2)} vínculos sin verificar.`
                : `Tier 2: ${formatNumber(novelLeadsT2)} model discoveries · ${formatNumber(provenance.documented_t2)} documented · ${formatNumber(provenance.lead_t2)} unverified case links.`
              : isEs
                ? `Nivel 2: ${formatNumber(novelLeadsT2)} señalados por el modelo.`
                : `Tier 2: ${formatNumber(novelLeadsT2)} model discoveries.`}
        </p>
      )}
      {tierFilter === 4 && (
        <p className="mt-3 text-text-secondary">
          {isEs
            ? `El fondo del embudo: ${formatNumber(tier4Count)} proveedores por debajo del umbral de revisión. Se muestran para que el método sea transparente.`
            : `The bottom of the funnel: ${formatNumber(tier4Count)} vendors below the triage threshold, shown for methodological transparency.`}
        </p>
      )}
    </div>
  )
}
