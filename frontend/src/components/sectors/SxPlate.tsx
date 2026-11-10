/**
 * SxPlate — the /sectors plate on «El Contrato» (DESIGN.md §3, §6, §9): white paper,
 * an ink rule on top, the figure, a gray caption. Replaces the cream PlateFrame
 * (shared, left untouched) on this surface: no folio tag, brackets, or wash.
 * Callers keep their ResizeObserver ref INSIDE `children`, so the measured width
 * is the plate's own content width (the Marimekko Σ widths === bandW invariant).
 */
import type { ReactNode } from 'react'
import './sectors.css'

export function SxPlate({ caption, label, children }: { caption?: ReactNode; label?: string; children: ReactNode }) {
  return (
    <figure className="sx-plate" aria-label={label}>
      {children}
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  )
}
