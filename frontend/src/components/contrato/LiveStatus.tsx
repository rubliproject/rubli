/**
 * LiveStatus + EditionToggle — the top bar's live cluster (DESIGN.md §5, template v3 2026-10-28).
 * Status: dot · «corte 28 oct 2026» · «próximo 1 nov 2026», from GET /stats/data-cut. The dot
 * breathes only while the cut is ≤ 7 days old; a degraded weekly run says «actualización parcial»,
 * a failed one «actualización fallida». Nothing is promised that the API did not say.
 */
import { Lightbulb, LightbulbOff } from 'lucide-react'
import { DATA_CUT_ISO } from '@/lib/constants'
import { formatCut } from '@/lib/nav/toc'
import { setEdition, useEdition } from '@/lib/theme'
import { useDataCutInfo, useDataCutPending } from '@/lib/useDataCut'
import { useLang } from './nav'

const DAY_MS = 86_400_000

export function LiveStatus() {
  const lang = useLang()
  const en = lang === 'en'
  const info = useDataCutInfo()
  const pending = useDataCutPending()
  // until /stats/data-cut answers, hold the live form's width unpainted: the word and the next date
  // arriving later pushed the whole tools cluster sideways (Portada CLS, 2026-10-29)
  if (pending) {
    return (
      <p className="ct-status is-live" aria-hidden="true" style={{ visibility: 'hidden' }}>
        <span className="ct-status-dot" />
        <span className="ct-status-word">{en ? 'live' : 'en vivo'}</span>
        <span className="ct-status-dates"> · {en ? 'cut' : 'corte'} <b>{formatCut(DATA_CUT_ISO, lang)}</b><span className="ct-status-next"> · {en ? 'next' : 'próximo'} <b>{formatCut(DATA_CUT_ISO, lang)}</b></span></span>
      </p>
    )
  }
  const cut = info?.data_cut ?? DATA_CUT_ISO
  // «en vivo» only on the endpoint's word: the build-time fallback is a date, not a pulse
  const fresh = !!info && Date.now() - Date.parse(`${cut}T00:00:00Z`) <= 7 * DAY_MS
  const state = info?.weekly_status
  const tone = state === 'failed' ? 'is-failed' : state === 'degraded' ? 'is-partial' : fresh ? 'is-live' : 'is-still'
  const word = state === 'failed'
    ? (en ? 'update failed' : 'actualización fallida')
    : state === 'degraded'
      ? (en ? 'partial update' : 'actualización parcial')
      : fresh ? (en ? 'live' : 'en vivo') : null
  return (
    <p className={`ct-status ${tone}`}>
      <span className="ct-status-dot" aria-hidden="true" />
      {word && <span className="ct-status-word">{word}</span>}
      <span className="ct-status-dates">
        {word && ' · '}{en ? 'cut' : 'corte'} <b>{formatCut(cut, lang)}</b>
        {info?.next_update && <span className="ct-status-next">{' · '}{en ? 'next' : 'próximo'} <b>{formatCut(info.next_update, lang)}</b></span>}
      </span>
    </p>
  )
}

export function EditionToggle() {
  const lang = useLang()
  const night = useEdition() === 'night'
  const en = lang === 'en'
  // bulb lit = day (light) edition, bulb out = night; the label names the action, so no aria-pressed
  const label = night ? (en ? 'Switch to light mode' : 'Cambiar a modo claro') : (en ? 'Switch to dark mode' : 'Cambiar a modo oscuro')
  const Bulb = night ? LightbulbOff : Lightbulb
  return (
    <button
      type="button"
      className="ct-edition"
      aria-label={label}
      title={label}
      onClick={() => setEdition(night ? 'day' : 'night')}
    >
      <Bulb size={18} strokeWidth={1.5} aria-hidden="true" />
    </button>
  )
}
