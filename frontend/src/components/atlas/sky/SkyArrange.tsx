/**
 * SkyArrange — El Mapa's one arrangement row (owner 2026-11-04: «the pre-built arrangements never showed anything…
 * reuse one but actually make it work»). «Sectores» is the chart; «Riesgo» re-lays every agency by the part of its
 * money in high- or critical-risk contracts (→) against its money (↑), and the stars glide there and back. The
 * other lenses wait behind «más vistas» (a native select: one row, keyboard and screen reader for free).
 * Señales and ComprasMX are not offered: the first counts only the drawn suppliers (a sample, so it ranks the
 * drawing), the second sets five weeks of ComprasMX against 23 years of CompraNet money (two records, one chart).
 */
import { skyCopy } from '@/lib/atlas/sky/copy'
import type { SkyLensIdx } from './SkyEngine'

/** the lenses behind «más vistas», by engine index (2 Tiempo · 3 Captura · 6 Calificación) */
export const MORE_LENSES = [2, 3, 6] as const

export function SkyArrange({ lens, onLens, lang, layersReady, phone = false }: {
  lens: SkyLensIdx
  onLens: (k: SkyLensIdx) => void
  lang: 'en' | 'es'
  /** Captura and Calificación need the data layers */
  layersReady: boolean
  /** phone: «Sectores · Riesgo» only (the other lenses need the sky engine) */
  phone?: boolean
}) {
  const names = skyCopy('lensNames', lang).split(' · ')
  const label = skyCopy('lensLabel', lang)
  const more = (MORE_LENSES as readonly number[]).includes(lens)
  return (
    <div role="group" aria-label={label} className="sk-arr">
      <span className="sk-arr-k" aria-hidden="true">{label}</span>
      {([0, 1] as const).map((k) => (
        <button key={k} type="button" aria-pressed={lens === k} onClick={() => onLens(k)} className="ct-subtab">{names[k]}</button>
      ))}
      {!phone && <span className="sk-arr-more">
        <select
          aria-label={skyCopy('lensMore', lang)} value={more ? String(lens) : ''} className="ct-subtab" data-on={more || undefined}
          onChange={(e) => e.target.value && onLens(+e.target.value as SkyLensIdx)}
        >
          <option value="" disabled>{skyCopy('lensMore', lang)}</option>
          {MORE_LENSES.map((k) => <option key={k} value={k} disabled={k >= 3 && !layersReady}>{names[k]}</option>)}
        </select>
        <span aria-hidden="true">▾</span>
      </span>}
    </div>
  )
}
