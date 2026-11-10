/**
 * CrossPatternComparison — the seven ARIA typologies (P1–P7) as one ruled list,
 * sorted by vendor count (DESIGN.md §7 ruled bar). Each row links to its own
 * dossier; the pattern being viewed carries «este patrón».
 *
 * Pattern names are canonical (match docs/ARIA_SPEC.md + PatternDossier):
 * P4 = Co-award pattern, P5 = Overpricing, P7 = Linked to a documented case.
 * Colour = PATTERN_COLORS (§6.3 categorical C2…C8) as a 10px square and the bar.
 */
import type { PatternSpotlight } from '@/api/client'
import { PATTERN_COLORS } from '@/lib/constants'
import { PATTERN_LABELS } from '@/lib/aria/patterns'
import { formatNumber } from '@/lib/utils'
import { RuledBar } from '@/components/contrato/RuledBar'

/** The canonical names (lib/aria/patterns). */
export const PATTERN_NAMES = PATTERN_LABELS

export function CrossPatternComparison({ patterns, currentCode, isEs }: {
  patterns: PatternSpotlight[]
  currentCode?: string
  isEs: boolean
}) {
  const sorted = [...patterns].sort((a, b) => (b.vendor_count ?? 0) - (a.vendor_count ?? 0))
  const max = Math.max(1, sorted[0]?.vendor_count ?? 1)
  const step = max > 10000 ? 5000 : max > 2000 ? 1000 : max > 500 ? 250 : 50
  const top = Math.ceil(max / step) * step
  return (
    <div className="ct-rb-compact">
      <RuledBar
        label={isEs ? 'Proveedores por patrón' : 'Vendors by pattern'}
        ticks={Array.from({ length: top / step + 1 }, (_, k) => ({ label: formatNumber(k * step), at: (k * step) / top }))}
        rows={sorted.map((p) => {
          const names = PATTERN_NAMES[p.code]
          const color = PATTERN_COLORS[p.code]
          return {
            name: (
              <>
                <span className="ct-sq" aria-hidden="true" style={{ ['--c' as string]: color }} />
                <b className="font-semibold">{p.code}</b> {names ? (isEs ? names.es : names.en) : ''}
                {p.code === currentCode && <small>{isEs ? 'este patrón' : 'this pattern'}</small>}
              </>
            ),
            share: (p.vendor_count ?? 0) / top,
            value: formatNumber(p.vendor_count ?? 0),
            color,
            href: `/patterns/${p.code}`,
          }
        })}
      />
    </div>
  )
}
