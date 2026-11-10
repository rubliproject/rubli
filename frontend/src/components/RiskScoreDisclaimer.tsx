import { Info } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/**
 * RiskScoreDisclaimer — compact (i) icon with tooltip explaining what risk scores mean.
 * Place next to risk score displays, column headers, and risk level legends.
 * Weekend D4: bilingual, 24px hit area (44 below sm, negative margin keeps the line box), focus ring.
 */
export function RiskScoreDisclaimer({ className }: { className?: string }) {
  const { i18n } = useTranslation()
  const es = i18n.language.startsWith('es')
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={`inline-flex items-center justify-center size-6 -my-1 max-sm:size-11 max-sm:-my-3.5 text-text-muted hover:text-text-secondary transition-colors rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 ${className ?? ''}`}
          aria-label={es ? 'Cómo leer el puntaje de riesgo' : 'Risk score interpretation'}
        >
          <Info className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">
        {es
          ? 'Los puntajes de riesgo son indicadores estadísticos que miden el parecido con los contratos de proveedores que después aparecen vinculados a casos documentados — no probabilidades calibradas de corrupción. Un puntaje de 0.50 significa que las características de contratación de este contrato se parecen mucho a las de esos proveedores. Un puntaje alto amerita investigación, no presunción de culpa.'
          : "Risk scores are statistical risk indicators measuring resemblance to the contracts of vendors later linked to documented cases — not calibrated probabilities of corruption. A score of 0.50 means this contract's procurement characteristics closely resemble those vendors' contracts. High scores warrant investigation, not presumption of guilt."}
      </TooltipContent>
    </Tooltip>
  )
}
