/**
 * DirectAwardLedger — «75 de cada 100» (FIX_BRIEF_R1 § C, signature move #1): the
 * logo's gesture at data scale. A ledger of 100 hairline ink rows, 10 × 10 at 24px
 * pitch; on first view the direct-award rows slide 12px right in seal red on the
 * logo's pull curve (--ease-pull), row starts spread over 180ms (600–780 in the load sequence, ends by 1.2s). Geometry is fixed
 * before the figure arrives (no reflow); with no figure nothing is pulled.
 * Reduced motion: the rows sit pulled, red, without the slide.
 */
import { useRef, type CSSProperties } from 'react'
import { useInView } from 'framer-motion'
import { useLang } from './nav'

export function DirectAwardLedger({ share, years }: {
  /** 0–100 direct-award share by count; null while loading. */
  share: number | null
  /** The window the share covers («2011–2025»). */
  years: string
}) {
  const lang = useLang()
  const ref = useRef<HTMLElement>(null)
  const inView = useInView(ref, { once: true, amount: 0.4 })
  const n = share == null ? 0 : Math.max(0, Math.min(100, Math.round(share)))
  const label = share == null ? '—' : String(n)
  const caption = lang === 'en'
    ? `${label} in 100 federal contracts were awarded without an open tender · ${years}`
    : `${label} de cada 100 contratos federales se adjudicaron sin licitación · ${years}`
  return (
    <figure ref={ref} className="ct-ledger" data-in={inView && n > 0 ? '' : undefined}>
      <div className="ct-ledger-grid" aria-hidden="true">
        {Array.from({ length: 100 }, (_, i) => (
          <i key={i} className={i < n ? 'is-p' : undefined} style={i < n ? ({ '--d': `${Math.round((i * 180) / n)}ms` } as CSSProperties) : undefined} />
        ))}
      </div>
      <figcaption className="ct-note">{caption}</figcaption>
    </figure>
  )
}
