/**
 * «ComprasMX» source tag — rows of source_structure 'E' (ComprasMX feed, 2025–26). v0.9.2
 * scores them; the title adds NO_RISK_LABEL only when this row is unscored (pending / rejected).
 * Renders nothing for CompraNet structures A–D.
 */
import { NO_RISK_LABEL, isUnscored } from '@/lib/constants'
import { useLang } from './nav'

export const COMPRASMX_STRUCTURE = 'E'

export function SourceTag({ struct, score, ver }: { struct?: string | null; score?: number | null; ver?: string | null }) {
  const lang = useLang()
  if (struct !== COMPRASMX_STRUCTURE) return null
  return (
    <span className="ct-src" title={`${lang === 'en' ? 'Source: ComprasMX (2025–26 feed)' : 'Fuente: ComprasMX (registro 2025–26)'}${isUnscored(score, ver) ? `; ${NO_RISK_LABEL[lang === 'en' ? 'en' : 'es']}` : ''}`}>
      ComprasMX
    </span>
  )
}
