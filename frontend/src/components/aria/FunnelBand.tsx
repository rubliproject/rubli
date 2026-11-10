import { formatNumber } from '@/lib/utils'
import { Reveal } from '@/components/contrato/Reveal'

/**
 * § EL EMBUDO — log-width compression band, doubling as the tier navigation
 * (the cover's lead element on «El Contrato»). Precedent: ICIJ Panama Papers
 * filtering-funnel; log₁₀ widths are the honest scale for 3 orders of
 * magnitude (linear renders T1 at 0.12%). Tiers are not colors (DESIGN.md
 * §6.3): paper cells on a hairline grid, Spectral SC labels, an ink rule
 * under the active tier. T2's model discoveries are a gray hatch over the
 * share they hold — EN CALIBRACIÓN. Proportions are same-source (audit F3).
 */

interface FunnelBandProps {
  tierCounts: Record<number, number>
  queueTotal: number
  novelLeadsT2: number | null
  activeTier: number | null
  novelOnly: boolean
  loading?: boolean
  isEs: boolean
  onSelect: (tier: number | null, novelOnly: boolean) => void
}

const TIER_ORDER = [4, 3, 2, 1] as const

export function FunnelBand({ tierCounts, queueTotal, novelLeadsT2, activeTier, novelOnly, loading, isEs, onSelect }: FunnelBandProps) {
  // Same box as the loaded band (0 layout shift when the stats land).
  if (loading) return <div className="aria-funnel-hold" aria-hidden="true" />

  const counts = TIER_ORDER.map((t) => tierCounts[t] ?? 0)
  const logs = counts.map((n) => Math.log10(n + 1))
  const logSum = logs.reduce((a, b) => a + b, 0)
  if (logSum <= 0 || queueTotal <= 0) return null

  const t1 = tierCounts[1] ?? 0
  const ratio = t1 > 0 ? Math.round(queueTotal / t1) : 0
  const t2Count = tierCounts[2] ?? 0
  const discFrac = novelLeadsT2 != null && t2Count > 0 ? Math.min(1, Math.max(0, novelLeadsT2 / t2Count)) : null

  const tierLabel = (t: number) =>
    isEs
      ? ({ 4: 'Nivel 4 · fondo', 3: 'Nivel 3', 2: 'Nivel 2', 1: 'Nivel 1' } as Record<number, string>)[t]
      : ({ 4: 'Tier 4 · floor', 3: 'Tier 3', 2: 'Tier 2', 1: 'Tier 1' } as Record<number, string>)[t]

  const segAria = (t: number, n: number) => {
    const base = isEs ? `Filtrar nivel ${t}: ${formatNumber(n)} proveedores` : `Filter tier ${t}: ${formatNumber(n)} vendors`
    if (t === 2 && novelLeadsT2 != null) {
      return base + (isEs ? `, ${formatNumber(novelLeadsT2)} descubrimientos del modelo` : `, ${formatNumber(novelLeadsT2)} model discoveries`)
    }
    return base
  }

  return (
    <Reveal className="aria-funnel">
      <h2 className="aria-funnel-h">
        <span>{isEs ? 'El embudo del triaje' : 'The triage funnel'}</span>
        <small>{isEs ? 'ancho = log₁₀(proveedores)' : 'width = log₁₀(vendors)'}</small>
      </h2>
      <div className="aria-funnel-row" role="group" aria-label={isEs ? 'Embudo de priorización' : 'Prioritization funnel'}>
        {TIER_ORDER.map((t, i) => {
          const n = counts[i]
          const isActive = activeTier === t
          return (
            <button
              key={t}
              type="button"
              className="aria-seg"
              onClick={() => onSelect(isActive && !(t === 2 && novelOnly) ? null : t, false)}
              aria-pressed={isActive}
              aria-label={segAria(t, n)}
              title={`${formatNumber(n)} · ${((n / queueTotal) * 100).toFixed(n / queueTotal < 0.01 ? 2 : 1)}%`}
              style={{ width: `${(logs[i] / logSum) * 100}%`, ['--i' as string]: i }}
            >
              {t === 2 && discFrac != null && <i className="aria-hatch" style={{ width: `${discFrac * 100}%` }} aria-hidden="true" />}
              <b>{formatNumber(n)}</b>
              <span>{tierLabel(t)}</span>
            </button>
          )
        })}
      </div>
      <div className="aria-funnel-foot">
        <span>
          ÷{ratio > 0 ? formatNumber(ratio) : '—'} {isEs ? 'compresión de la fila al nivel 1' : 'compression from the queue to tier 1'}
        </span>
        {novelLeadsT2 != null && (
          <span>
            <i className="aria-swatch" style={{ background: 'repeating-linear-gradient(45deg, color-mix(in srgb, var(--color-text-muted) 28%, transparent) 0 2px, transparent 2px 6px)' }} aria-hidden="true" />
            {isEs ? `nivel 2: ${formatNumber(novelLeadsT2)} del modelo · en calibración` : `tier 2: ${formatNumber(novelLeadsT2)} model-found · in calibration`}
          </span>
        )}
        <button type="button" onClick={() => onSelect(null, false)} aria-pressed={activeTier == null}>
          {isEs ? 'Toda la fila' : 'The whole queue'} · {formatNumber(queueTotal)}
        </button>
      </div>
    </Reveal>
  )
}
