/**
 * CanvasControls — overlay controls floated on top of the ExploreCanvas.
 *
 * 2026-06-12 STEP-0 cull (El Mapa Day 5): YearScrubber, LensToggle,
 * RiskFloorToggle and MapLegend deleted — all dispatched into state
 * fields (`year`, `riskFloor`) that no query or render ever consumed,
 * and the scrubber's 28px strip occluded every panel's footer exits.
 * ShareViewButton is the sole survivor; the Z-panel jumpline bars wire it.
 */
import { useState } from 'react'
import { Z_FOCUS_RING } from './ZPrimitives'

/**
 * ShareViewButton — copies the current /explore URL (with focus stack
 * encoded by useExploreUrlSync) to the clipboard.
 */
export function ShareViewButton({ lang }: { lang: 'en' | 'es' }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const onShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setState('copied')
      setTimeout(() => setState('idle'), 1800)
    } catch {
      // Older browsers / non-secure contexts — an inline line, never a
      // page-blocking browser prompt (D15 § 6).
      setState('failed')
      setTimeout(() => setState('idle'), 4000)
    }
  }
  const copied = state === 'copied'
  return (
    <button
      type="button"
      onClick={onShare}
      className={`flex min-h-11 sm:min-h-8 items-center gap-1.5 transition-colors rounded-sm ${Z_FOCUS_RING}`}
      style={{
        background: 'none',
        border: 'none',
        padding: 0,
        color: copied ? 'var(--color-accent)' : 'var(--color-text-secondary)',
        cursor: 'pointer',
        fontSize: 12,
        fontFamily: 'var(--font-family-mono, monospace)',
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
      }}
      aria-label={lang === 'en' ? 'Copy link to clipboard' : 'Copiar enlace al portapapeles'}
    >
      <span role="status" aria-live="polite">
        {copied
          ? (lang === 'en' ? '✓ Copied' : '✓ Copiado')
          : state === 'failed'
            ? (lang === 'en' ? 'Copy failed — select the address bar' : 'No se pudo copiar — seleccione la barra de direcciones')
            : <>⤴ <span className="max-sm:sr-only">{lang === 'en' ? 'Copy link' : 'Copiar enlace'}</span></>}
      </span>
    </button>
  )
}
