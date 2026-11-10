/**
 * RiskExplainTooltip — hover a risk badge to see top contributing z-score features.
 * Uses /api/v1/contracts/{id}/risk-explanation (RiskExplanation type).
 *
 * NOTE: there are 3 similarly-named components in this folder, each distinct:
 *   RiskExplainTooltip.tsx  → hover tooltip (this file)
 *   RiskExplanation.tsx     → exports RiskExplanationPanel (inline panel)
 *   RiskExplainer.tsx       → exports RiskFactorTable (methodology page)
 * They are NOT duplicates. Don't try to consolidate.
 */
import { useState } from 'react'
import * as Tooltip from '@radix-ui/react-tooltip'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { api } from '@/api/client'
import type { RiskExplanation } from '@/api/types'

interface Props {
  contractId: number
  riskScore: number
  riskLevel: string
  children: React.ReactNode
}

async function fetchRiskExplanation(contractId: number): Promise<RiskExplanation> {
  const { data } = await api.get<RiskExplanation>(`/contracts/${contractId}/risk-explain`)
  return data
}

const LEVEL_ES: Record<string, string> = { critical: 'crítico', high: 'alto', medium: 'medio', low: 'bajo' }

export function RiskExplainTooltip({ contractId, riskScore, riskLevel, children }: Props) {
  const { i18n } = useTranslation()
  const isEs = i18n.language?.startsWith('es') ?? false
  // Fetch on first open, not on render: El Archivo mounts ~30 of these per page and
  // the eager requests ran past nginx's API burst (503s for the whole page).
  const [wasOpened, setWasOpened] = useState(false)
  const { data } = useQuery({
    queryKey: ['contract-risk-explanation', contractId],
    queryFn: () => fetchRiskExplanation(contractId),
    staleTime: Infinity,
    enabled: !!contractId && wasOpened,
  })

  // Use top 3 features sorted by absolute contribution
  const topFeatures = (data?.features ?? [])
    .slice()
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
    .slice(0, 3)

  const direction = (contribution: number) => (contribution > 0 ? 'high_risk' : 'low_risk')

  return (
    <Tooltip.Provider delayDuration={300}>
      <Tooltip.Root onOpenChange={(open) => { if (open) setWasOpened(true) }}>
        <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            className="z-50 max-w-xs rounded-sm border border-border bg-background-card p-3 shadow-xl"
            sideOffset={4}
          >
            <div className="text-xs font-semibold text-text-primary mb-2">
              {isEs ? 'Indicador de riesgo' : 'Risk indicator'}: {Math.floor(riskScore * 100)} {isEs ? 'de 100' : 'of 100'} —{' '}
              <span>{isEs ? (LEVEL_ES[riskLevel] ?? riskLevel) : riskLevel}</span>
            </div>
            {topFeatures.length > 0 ? (
              <div className="space-y-1.5">
                <div className="text-xs text-text-muted mb-1">{isEs ? 'Principales factores:' : 'Top risk drivers:'}</div>
                {topFeatures.map((f) => {
                  const dir = direction(f.contribution)
                  return (
                    <div key={f.feature} className="flex items-center gap-2">
                      <div
                        className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                          dir === 'high_risk' ? 'bg-risk-critical' : 'bg-text-muted'
                        }`}
                      />
                      <span className="text-xs text-text-secondary flex-1 truncate">{f.label}</span>
                      <span
                        className={`ml-auto text-xs font-mono ${
                          dir === 'high_risk' ? 'text-risk-critical' : 'text-text-secondary'
                        }`}
                      >
                        {f.z_score > 0 ? '+' : ''}
                        {f.z_score.toFixed(1)}σ
                      </span>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="text-xs text-text-muted">{isEs ? 'Desglose no disponible' : 'Feature breakdown not available'}</div>
            )}
            <Tooltip.Arrow className="fill-background-card" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  )
}
