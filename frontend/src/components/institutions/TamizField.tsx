/**
 * TamizField — the canvas half of El Tamiz (spec institutions-tamiz §2).
 *
 * Grade-specific skin over the shared `DotField` engine: deficient dots in
 * their tier colour, the rest muted; small-N hollow; the deficient wash and
 * grade hairlines (the deficient threshold in critical ink) as the backdrop.
 */
import { useCallback, useMemo } from 'react'
import { TIER_STYLES, gradeToTierKey } from '@/lib/tiers'
import { scoreToX, type FieldInst, type Layout } from '@/lib/institutions/field'
import { DotField, ENTER_MS, type Ease, type Inks } from '@/components/charts/DotField'

export { ENTER_MS }
export type { Ease }

interface Props {
  insts: FieldInst[]
  layout: Layout
  plotX0: number
  plotW: number
  xMin: number
  xMax: number
  /** Grade hairlines for the current view; `deficientLine` is drawn in critical ink. */
  lines: number[]
  deficientLine: number
  /** Brushed score range (phase 2 § 1): a faint accent wash behind the dots. */
  band?: [number, number] | null
  /** Per-dot grade to colour (deficient in the current view), null = muted. */
  colorGrades: (string | null)[]
  /** Ochre ring on `ringed` dots (step 4). */
  ring: boolean
  duration: number
  ease: Ease
  reduced: boolean
  hoverIdx: number | null
  /** Register-filter highlight: dots outside it fade (never vanish — the denominator stays). */
  focusSet: Set<number> | null
  hitRadius: number
  onHover: (idx: number | null, x: number, y: number) => void
  onPick: (idx: number | null) => void
  ariaLabel: string
  /** First paint only: dots enter from one line (see DotField `enter`). */
  enter?: boolean
}

export function TamizField({
  insts, plotX0, plotW, xMin, xMax, lines, deficientLine, band = null, colorGrades, ...rest
}: Props) {
  const fills = useMemo(
    () => colorGrades.map((g) => (g ? TIER_STYLES[gradeToTierKey(g)].color : null)),
    [colorGrades],
  )
  const hollow = useMemo(() => insts.map((i) => i.provisional), [insts])
  const ringed = useMemo(() => insts.map((i) => i.ringed), [insts])
  const backdrop = useCallback((ctx: CanvasRenderingContext2D, h: number, inks: Inks) => {
    const g = { plotX0, plotW, xMin, xMax }
    // Deficient wash + grade hairlines (the deficient threshold in critical ink).
    const xDef = scoreToX(deficientLine, g)
    ctx.globalAlpha = 0.05
    ctx.fillStyle = inks.crit
    ctx.fillRect(plotX0, 0, xDef - plotX0, h)
    if (band) {
      const b0 = scoreToX(band[0], g)
      ctx.globalAlpha = 0.1
      ctx.fillStyle = inks.accent
      ctx.fillRect(b0, 0, scoreToX(band[1], g) - b0, h)
    }
    for (const s of lines) {
      const gx = Math.round(scoreToX(s, g)) + 0.5
      ctx.globalAlpha = s === deficientLine ? 0.9 : 0.6
      ctx.strokeStyle = s === deficientLine ? inks.crit : inks.border
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(gx, 0)
      ctx.lineTo(gx, h)
      ctx.stroke()
    }
  }, [plotX0, plotW, xMin, xMax, lines, deficientLine, band])

  return <DotField n={insts.length} fills={fills} hollow={hollow} ringed={ringed} backdrop={backdrop} {...rest} />
}
