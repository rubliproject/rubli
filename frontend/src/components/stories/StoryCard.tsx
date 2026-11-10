import { motion } from 'framer-motion'
import { Clock } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn, localizeAmount } from '@/lib/utils'
import { type OutletType } from './OutletBadge'
import { AnimatedNumber, AnimatedFill } from '@/components/ui/Reveal'
import { DUR, fadeUp, ms } from '@/lib/motion'
import { CATEGORICAL } from '@/lib/constants'
import { storyInk } from './storyInk'

export type StoryType = 'era' | 'case' | 'thematic' | 'year'

const TYPE_LABELS: Record<StoryType, string> = {
  era: 'ERA',
  case: 'CASO',
  thematic: 'TEMATICO',
  year: 'ANO',
}

// DESIGN.md §6.3 — the categorical set by index, matching StoryNarrative's outlets.
const OUTLET_ACCENT: Record<OutletType, string> = {
  longform: CATEGORICAL[0],
  investigative: CATEGORICAL[6],
  data_analysis: CATEGORICAL[1],
  rubli: CATEGORICAL[2],
}

export interface StoryCardProps {
  slug: string
  outlet: OutletType
  type: StoryType
  headline: string
  subheadline: string
  leadStatValue: string
  leadStatLabel: string
  leadStatColor?: string
  estimatedMinutes: number
  era?: string
  onClick?: () => void
}

/**
 * Parse a stat value string for the animated counter.
 * Returns { numeric, prefix, suffix, decimals } if parseable,
 * or null if the value should be rendered as plain text.
 */
function parseStatValue(value: string): { numeric: number; prefix: string; suffix: string; decimals: number } | null {
  // Match patterns like "81.9%", "$15B", "505,219", "63% -> 82%"
  const match = value.match(/^([^0-9]*)([0-9][0-9,]*\.?[0-9]*)(.*)$/)
  if (!match) return null
  const prefix = match[1]
  const numStr = match[2].replace(/,/g, '')
  const suffix = match[3]
  const numeric = parseFloat(numStr)
  if (isNaN(numeric)) return null
  const dotIdx = numStr.indexOf('.')
  const decimals = dotIdx >= 0 ? numStr.length - dotIdx - 1 : 0
  return { numeric, prefix, suffix, decimals }
}

export function StoryCard(props: StoryCardProps) {
  const {
    outlet,
    type,
    headline,
    subheadline,
    leadStatValue: rawLeadStatValue,
    leadStatLabel,
    leadStatColor,
    estimatedMinutes,
    era,
    onClick,
  } = props
  const { i18n } = useTranslation()
  const lang: 'en' | 'es' = i18n.language.startsWith('es') ? 'es' : 'en'
  const leadStatValue = localizeAmount(rawLeadStatValue, lang)
  const accent = leadStatColor ? storyInk(leadStatColor) : OUTLET_ACCENT[outlet]
  const parsed = parseStatValue(leadStatValue)

  // Estimate a fill percentage from the stat for the bar animation
  const fillPct = parsed ? Math.min(parsed.numeric, 100) : 50

  return (
    <motion.button
      variants={fadeUp}
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      className={cn(
        // DESIGN.md §3/§9: a ruled cell, not a card — ink rule above, no box
        'relative border-t border-text-primary pt-4 pb-2 text-left w-full',
        'flex flex-col gap-3 transition-colors cursor-pointer group overflow-hidden'
      )}
      aria-label={headline}
    >
      {/* Top badges */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[12px] font-semibold ct-sc text-text-muted">
          {TYPE_LABELS[type]}
        </span>
      </div>

      {/* Headline */}
      <h3
        className="text-[17px] font-semibold text-text-primary leading-[1.3] text-balance group-hover:underline underline-offset-[3px] decoration-1"
      >
        {headline}
      </h3>

      {/* Subheadline */}
      <p className="text-[15px] text-text-secondary leading-[1.6] line-clamp-3">
        {subheadline}
      </p>

      {/* Lead stat */}
      <div className="mt-auto pt-2">
        <div className="tabular-nums" style={{ color: accent, fontFamily: "var(--font-serif)", fontWeight: 600, fontSize: 24, lineHeight: 1.1 }}>
          {parsed ? (
            <AnimatedNumber
              value={parsed.numeric}
              decimals={parsed.decimals}
              prefix={parsed.prefix}
              suffix={parsed.suffix}
              duration={1400}
            />
          ) : (
            <span>{leadStatValue}</span>
          )}
        </div>
        <p className="text-[13px] font-serif text-text-muted mt-1 leading-snug">{leadStatLabel}</p>
      </div>

      {/* Animated fill bar */}
      <div className="mt-1">
        <AnimatedFill pct={fillPct} color={accent} delay={ms(DUR.fast)} height="h-1" />
      </div>

      {/* Footer */}
      <div className="flex items-center gap-3 pt-1 text-[13px] font-mono text-text-muted">
        <span className="inline-flex items-center gap-1">
          <Clock className="h-3 w-3" aria-hidden="true" />
          {estimatedMinutes} min
        </span>
        {era && (
          <span>
            {era}
          </span>
        )}
      </div>
    </motion.button>
  )
}
