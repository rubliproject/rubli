/**
 * WaterfallRiskChart — SHAP contribution bars, left-anchored + full-width.
 *
 * Horizontal bars sorted by |contribution|. Positive = risk-increasing (red),
 * negative = risk-protective (neutral slate — never green, Bible §3.10).
 * Left-aligned to the section margin with bars that fill the available width
 * (the old fixed-348px SVG rendered tiny + centered). No chart dependency.
 */
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { Reveal } from '@/components/contrato/Reveal'

interface WaterfallFeature {
  feature: string
  z_score: number
  coefficient: number
  contribution: number
  label_en: string
  label_es?: string
}

interface WaterfallRiskChartProps {
  features: WaterfallFeature[]
  baseScore?: number
  finalScore?: number
  className?: string
}

export function WaterfallRiskChart({
  features,
  className,
}: WaterfallRiskChartProps) {
  const { i18n } = useTranslation()
  const isEs = i18n.language?.startsWith('es') ?? false
  const data = useMemo(() => {
    return [...features]
      .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
      .slice(0, 10)
      .map((f) => ({
        label: (isEs ? f.label_es : f.label_en) || f.label_en,
        contribution: f.contribution,
        feature: f.feature,
        z_score: f.z_score,
        coefficient: f.coefficient,
      }))
  }, [features, isEs])

  if (data.length === 0) {
    return (
      <div className={cn('flex items-center justify-center h-48 text-xs text-text-muted', className)}>
        {isEs ? 'Sin datos de factores disponibles' : 'No feature data available'}
      </div>
    )
  }

  const maxVal = Math.max(...data.map((d) => Math.abs(d.contribution)), 0.1)

  // One line per factor (owner 2026-10-21, «La cifra»): name · bar · value; z rides small
  // after the name (title on phone, where it would wrap the row). Styles: .ct-wf in contrato.css.
  return (
    <Reveal className={cn('ct-wf', className)} role="list">
      {data.map((entry, i) => {
        const isPos = entry.contribution >= 0
        // Bible §3.10: risk-decreasing contributions are neutral slate, not green.
        const barPct = Math.max(1.5, (Math.abs(entry.contribution) / maxVal) * 100)
        return (
          <div key={entry.feature} className={isPos ? 'ct-wf-row is-up' : 'ct-wf-row'} role="listitem" title={`z = ${entry.z_score.toFixed(2)}`}>
            <span className="ct-wf-nm">{entry.label}<small>z {entry.z_score.toFixed(2)}</small></span>
            <span className="ct-wf-trk" aria-hidden="true"><i style={{ width: `${barPct}%`, ['--d' as string]: `${Math.min(i * 40, 300)}ms` }} /></span>
            <span className="ct-wf-v">{isPos ? '+' : ''}{entry.contribution.toFixed(3)}</span>
          </div>
        )
      })}
    </Reveal>
  )
}

export default WaterfallRiskChart
