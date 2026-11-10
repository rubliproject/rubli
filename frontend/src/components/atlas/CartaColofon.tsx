/**
 * CartaColofon — «El Atlas» colofón. Spec .claude/designs/atlas-2026-10-02-spec.md §3.12.
 * A one-line strip over the canvas foot (drawn of eligible · remainder · risk basis · cut)
 * and a «colofón» fold with the full list: drawn N of eligible N, remainder share, dropped
 * and anomaly counts, risk basis, halo basis, backbone weight kept and the arbitrary-position
 * line. Every value comes from the manifest (`atlas_sky_meta`); nothing is typed.
 */
import { useState } from 'react'
import { skyCopy, type SkyCopyKey } from '@/lib/atlas/sky/copy'
import type { SkyManifest } from '@/lib/atlas/sky/geometry'
import { formatNumber } from '@/lib/utils'

const MONO = 'var(--font-family-archival)'
/** The one keyboard ring for every /atlas control (F9: inlined, ring.ts retired). */
const ATLAS_RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1'

export function CartaColofon({ manifest, lang, cut }: { manifest: SkyManifest; lang: 'en' | 'es'; cut: string }) {
  const [open, setOpen] = useState(false)
  const b = manifest.basis
  const loc = lang === 'en' ? 'en-US' : 'es-MX'
  const basis = /v[\d.]+/.exec(manifest.risk_basis)?.[0] ?? manifest.risk_basis
  const drawn = skyCopy('colDrawn', lang, { n: formatNumber(b.n_drawn), N: formatNumber(b.n_sky) })
  const rem = skyCopy('colRemainder', lang, { x: (b.remainder_share * 100).toLocaleString(loc, { maximumFractionDigits: 1 }) })
  const anomalies = Object.entries(manifest.anomalies)
    .map(([k, n]) => `${skyCopy(`anom_${k}` as SkyCopyKey, lang)} ${formatNumber(n)}`).join(' · ')
  const full = [
    drawn,
    rem,
    skyCopy('colRemainderBasis', lang),
    `${skyCopy('colDropped', lang, { n: formatNumber(b.dropped_ties) })} · ${skyCopy('colAnomalies', lang)}: ${anomalies}`,
    skyCopy('colOverlaps', lang, { n: formatNumber(b.residual_overlaps) }),
    skyCopy('colRisk', lang, { basis }),
    `T1 ${formatNumber(b.public_t1)} · T2 ${formatNumber(b.public_t2)} · T3 ${formatNumber(b.public_t3)}`,
    skyCopy('colHalo', lang, { basis }),
    skyCopy('colBackbone', lang, { x: b.backbone_kept_pct.toLocaleString(loc, { maximumFractionDigits: 1 }) }),
    skyCopy('arbitrary', lang),
    skyCopy('colCut', lang, { cut }),
  ]
  const text = { fontFamily: MONO, fontSize: 12, letterSpacing: '0.04em', color: 'var(--color-text-muted)' }
  return (
    <div className="absolute left-0 right-0 bottom-0" style={{ zIndex: 6 }}>
      {open && (
        <ol role="note" style={{ ...text, fontSize: 12, lineHeight: 1.5, margin: 0, padding: '8px 12px 8px 28px', background: 'var(--color-background-card)', borderTop: '1px solid var(--color-border)' }}>
          {full.map((l) => <li key={l}>{l}</li>)}
        </ol>
      )}
      <div className="flex items-baseline gap-3 px-3 py-1" style={{ ...text, background: 'var(--color-background)', borderTop: '1px solid var(--color-border)' }}>
        <span style={{ minWidth: 0, flex: 1 }}>{[drawn, rem, skyCopy('colRisk', lang, { basis }), skyCopy('colCut', lang, { cut })].join(' · ')}</span>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className={`rounded-sm ${ATLAS_RING}`}
          style={{ ...text, color: 'var(--color-accent-text)', background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', whiteSpace: 'nowrap' }}
        >
          {skyCopy('colofonFull', lang)} {open ? '▾' : '▴'}
        </button>
      </div>
    </div>
  )
}
