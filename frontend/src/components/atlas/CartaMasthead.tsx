/**
 * CartaMasthead — «El Atlas» masthead, a thin adapter over PageMasthead `portada-compact`
 * (face spec § 3.5 / § 6 row III). The strip carries «III · EL PLANETARIO · DATOS AL {cut} ⓘ»
 * (numeral from lib/nav/toc); the h1 is `skyCopy('h1')` at the compact step. The reserved
 * `aria-live` period line lives in the control ear (§ 3.5 fallback — under the strip it moved
 * the plate 15–20 px). Every value comes from the manifest (`atlas_sky_meta`).
 */
import { useState } from 'react'
import { skyCopy } from '@/lib/atlas/sky/copy'
import { PageMasthead } from '@/components/layout/PageMasthead'

const MONO = 'var(--font-family-archival)'
/** The one keyboard ring for every /atlas control (F9: inlined, ring.ts retired). */
const ATLAS_RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1'

interface Props {
  lang: 'en' | 'es'
  cut: string
  /** «todos los proveedores · … · corte …» and the risk + halo basis lines */
  basis: string[]
}

export function CartaMasthead({ lang, cut, basis }: Props) {
  const [open, setOpen] = useState(false)
  const eyebrow = { fontFamily: 'var(--font-sc)', fontWeight: 600, fontSize: 12, letterSpacing: 'var(--track-sc)', color: 'var(--color-text-muted)' }
  return (
    <div className="mb-2 relative">
      <PageMasthead
        variant="portada-compact"
        route="/mapa"
        // The cut already rides the eyebrow (with its basis ⓘ); a second edition date would repeat it.
        edition={false}
        kicker={skyCopy('kicker', lang)}
        range={
          <>
            {skyCopy('dataAt', lang, { cut })}{' '}
            <button
              type="button"
              aria-expanded={open}
              aria-label={skyCopy('basisInfo', lang)}
              onClick={() => setOpen((o) => !o)}
              className={`rounded-sm ${ATLAS_RING}`}
              style={{ ...eyebrow, fontSize: 13, letterSpacing: 0, background: 'transparent', border: 'none', padding: 0, marginLeft: 4, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 24, minHeight: 24, margin: '-6px 0 -6px 0' }}
            >
              ⓘ
            </button>
          </>
        }
        title={skyCopy('h1', lang)}
      />
      {open && (
        <div
          role="note"
          aria-label={skyCopy('basisInfo', lang)}
          className="absolute z-30"
          style={{ top: 30, left: 0, width: 420, maxWidth: '92vw', padding: '10px 14px', background: 'var(--color-background-card)', border: '1px solid var(--color-border)' }}
        >
          {basis.map((b) => (
            <p key={b} style={{ fontFamily: MONO, fontSize: 12, lineHeight: 1.5, margin: '0 0 4px', color: 'var(--color-text-secondary)' }}>{b}</p>
          ))}
        </div>
      )}
    </div>
  )
}
