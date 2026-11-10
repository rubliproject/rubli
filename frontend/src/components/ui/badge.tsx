import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import i18n from 'i18next'
import { NO_RISK_LABEL, getRiskLevelFromScore } from '@/lib/constants'
import type { RiskLevel } from '@/api/types'
import { AlertTriangle, AlertCircle, AlertOctagon, CheckCircle } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

const badgeVariants = cva(
  'inline-flex items-center rounded-sm px-2 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-background-elevated text-text-primary',
        secondary: 'bg-background-elevated/50 text-text-secondary',
        outline: 'border border-border text-text-secondary',
        // Risk level variants
        critical: 'bg-risk-critical/20 text-risk-critical border border-risk-critical/30',
        high: 'bg-risk-high/20 text-risk-high border border-risk-high/30',
        medium: 'bg-risk-medium/20 text-risk-medium-text border border-risk-medium/30',
        low: 'bg-risk-low/20 text-risk-low border border-risk-low/30',
        // Sector variants (subset)
        salud: 'bg-sector-salud/20 text-sector-salud border border-sector-salud/30',
        educacion: 'bg-sector-educacion/20 text-sector-educacion border border-sector-educacion/30',
        infraestructura: 'bg-sector-infraestructura/20 text-sector-infraestructura border border-sector-infraestructura/30',
        energia: 'bg-sector-energia/20 text-sector-energia border border-sector-energia/30',
        tecnologia: 'bg-sector-tecnologia/20 text-sector-tecnologia border border-sector-tecnologia/30',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
)

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

// Risk level icons for accessibility - provides visual distinction beyond color
const RiskIcons: Record<RiskLevel, React.ElementType> = {
  critical: AlertOctagon,
  high: AlertTriangle,
  medium: AlertCircle,
  low: CheckCircle,
}

// Specialized risk badge component
interface RiskBadgeProps extends Omit<BadgeProps, 'variant'> {
  score?: number | null
  level?: RiskLevel
}

const RISK_THRESHOLD_DESCRIPTIONS: Record<RiskLevel, string> = {
  critical: 'Critical (≥0.60): Muy parecido a proveedores vinculados a casos documentados',
  high:     'High (≥0.40): Parecido a proveedores vinculados a casos documentados',
  medium:   'Medium (≥0.25): Similitud moderada — vigilancia recomendada',
  low:      'Low (<0.25): Similitud baja con patrones conocidos',
}

function RiskBadge({ score, level, className, children, ...props }: RiskBadgeProps) {
  // Unscored (ComprasMX, pending_score): say so, never default to low.
  if (level == null && score == null) {
    return <Badge variant="outline" className={className} {...props}>{NO_RISK_LABEL[i18n.language?.startsWith('en') ? 'en' : 'es']}</Badge>
  }
  const riskLevel = level ?? getRiskLevelFromScore(score ?? 0)
  const label = children ?? riskLevel.toUpperCase()
  const scoreDisplay = score != null ? `${(score * 100).toFixed(0)}%` : undefined
  const Icon = RiskIcons[riskLevel]

  // Create accessible label
  const ariaLabel = score != null
    ? `Risk level: ${riskLevel}, score: ${scoreDisplay}`
    : `Risk level: ${riskLevel}`

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant={riskLevel}
          className={cn('tabular-nums gap-1 cursor-help', className)}
          role="status"
          aria-label={ariaLabel}
          {...props}
        >
          <Icon className="h-3 w-3" aria-hidden="true" />
          {label}
          {scoreDisplay && <span className="ml-0.5 opacity-75" aria-hidden="true">({scoreDisplay})</span>}
        </Badge>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[220px] text-center">
        {RISK_THRESHOLD_DESCRIPTIONS[riskLevel]}
      </TooltipContent>
    </Tooltip>
  )
}

export { Badge, RiskBadge }
