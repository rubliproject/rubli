/**
 * TamizWaffle — the money view of El Tamiz («Por pesos» spec §3).
 *
 * Plain SVG (~1,000 rects, under the Canvas threshold): one rect per cell of
 * `lib/institutions/waffle.ts`, keyed by stable cell id, so a re-flow (new
 * grouping, «Sin IMSS») is a CSS transform transition on the same rects.
 * Cells fade in row by row once the dots have glided to their block centres
 * (the morph); fading out is immediate so a lens flip mid-flight reverses
 * cleanly. A buyer's own block gets an outline drawn on its boundary edges;
 * historical runs are hatched, never removed. Glyphs (group and block
 * labels) are DOM, positioned by the caller from `layout`.
 */
import { useMemo, useState, type ReactNode } from 'react'
import { TIER_STYLES, gradeToTierKey, type TierKey } from '@/lib/tiers'
import type { WaffleCell, WaffleLayout } from '@/lib/institutions/waffle'

const TIERS: TierKey[] = ['Excelente', 'Satisfactorio', 'Regular', 'Deficiente', 'Critico']

export interface WaffleHover {
  block: string
  inst: number | null
  x: number
  y: number
}

export function TamizWaffle({
  layout, visible, reduced, dimNonDf = false, onHover, onPick, ariaLabel, children,
}: {
  layout: WaffleLayout
  /** False while the dot field is showing: cells fade out at once, pointer events off. */
  visible: boolean
  reduced: boolean
  /** Step «Los grandes compradores»: A–C cells fade to context (never vanish). */
  dimNonDf?: boolean
  onHover: (h: WaffleHover | null) => void
  onPick: (inst: number) => void
  ariaLabel: string
  /** DOM glyph overlay (group headings, block labels). */
  children?: ReactNode
}) {
  const { size, gap } = layout
  const step = size + gap
  const [hot, setHot] = useState<string | null>(null)

  // Outline segments for each buyer's own block: cell sides whose neighbour is another block.
  const outline = useMemo(() => {
    const at = new Map<string, WaffleCell>()
    for (const c of layout.cells) at.set(`${c.group}:${Math.round(c.x / step)}:${c.row}`, c)
    const segs: { block: string; d: string }[] = []
    const by = new Map<string, string[]>()
    for (const c of layout.cells) {
      if (c.inst == null) continue
      const col = Math.round(c.x / step)
      const same = (dc: number, dr: number) => at.get(`${c.group}:${col + dc}:${c.row + dr}`)?.block === c.block
      const x0 = c.x - gap / 2, y0 = c.y - gap / 2, x1 = c.x + size + gap / 2, y1 = c.y + size + gap / 2
      const parts = by.get(c.block) ?? []
      if (!same(0, -1)) parts.push(`M${x0} ${y0}H${x1}`)
      if (!same(0, 1)) parts.push(`M${x0} ${y1}H${x1}`)
      if (!same(-1, 0)) parts.push(`M${x0} ${y0}V${y1}`)
      if (!same(1, 0)) parts.push(`M${x1} ${y0}V${y1}`)
      by.set(c.block, parts)
    }
    for (const [block, parts] of by) segs.push({ block, d: parts.join('') })
    return segs
  }, [layout, step, size, gap])

  const ms = reduced ? 0 : 420
  return (
    <div
      className="absolute inset-x-0 top-0"
      style={{ height: layout.height, opacity: visible ? 1 : 0, pointerEvents: visible ? 'auto' : 'none', transition: reduced ? 'none' : 'opacity 200ms linear' }}
      aria-hidden={!visible}
    >
      <svg width={layout.width} height={layout.height} role="img" aria-label={ariaLabel} className="block overflow-visible"
        onMouseLeave={() => { setHot(null); onHover(null) }}>
        <defs>
          {TIERS.map((k) => (
            <pattern key={k} id={`tw-hatch-${k}`} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="4" height="4" fill={TIER_STYLES[k].color} fillOpacity="0.28" />
              <line x1="0" y1="0" x2="0" y2="4" stroke={TIER_STYLES[k].color} strokeWidth="1.6" />
            </pattern>
          ))}
        </defs>
        {layout.cells.map((c) => {
          const tier = gradeToTierKey(c.grade)
          const dim = dimNonDf && !c.deficient
          const on = visible ? (dim ? 0.22 : hot && hot !== c.block ? 0.55 : 1) : 0
          return (
            <rect
              key={c.id}
              width={size}
              height={size}
              rx={1}
              fill={c.historical ? `url(#tw-hatch-${tier})` : TIER_STYLES[tier].color}
              style={{
                transform: `translate(${c.x}px, ${c.y}px)`,
                opacity: on,
                transition: reduced ? 'none' : `transform ${ms}ms cubic-bezier(0.33,1,0.68,1), opacity 180ms linear`,
                // Row-by-row fade-in after the dots arrive; leaving is immediate.
                transitionDelay: reduced || !visible ? '0ms' : `0ms, ${Math.min(520, 260 + c.row * 18)}ms`,
              }}
              onMouseEnter={(e) => {
                setHot(c.block)
                const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect()
                onHover({ block: c.block, inst: c.inst, x: e.clientX - r.left, y: e.clientY - r.top })
              }}
              onClick={() => { if (c.inst != null) onPick(c.inst) }}
              className={c.inst != null ? 'cursor-pointer' : undefined}
            />
          )
        })}
        {outline.map((o) => (
          <path key={o.block} d={o.d} fill="none" stroke="var(--color-text-primary)" strokeWidth={o.block === hot ? 2 : 1}
            strokeOpacity={visible ? (dimNonDf ? 0.9 : 0.6) : 0} style={{ transition: reduced ? 'none' : 'stroke-opacity 200ms linear' }} />
        ))}
      </svg>
      {children}
    </div>
  )
}
