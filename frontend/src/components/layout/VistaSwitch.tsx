/**
 * VistaSwitch — «Cifras | Vínculos», El Mapa's view switch in the top bar (merge spec § 2–3).
 * Internally the views are lista / cielo; the UI names are the owner's (2026-10-08).
 *
 * A radiogroup: arrows move and select, the active view takes a 2px ochre underline.
 * State is set directly (no animation gating). Switching pushes one entry, so Back
 * returns to the other view; the sky reads `atlasDepth` 0 there, so its Esc / `[`
 * never walks out of it. Hover / focus on «Vínculos» starts the sky's chunk only —
 * its data waits for the click.
 *
 * Discovery (S1 addendum): «Vínculos» carries three twinkling points; until
 * `rubli_atlas_visited_v1` is set it pulses 3× once the page settles, over a one-line
 * dismissable hint. The flag is set on dismiss or on the first switch to the sky
 * (on a bare desktop switch the sky sets it itself, when its first-visit flight starts).
 */
import { Fragment, useRef, useState, type KeyboardEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ViewSwitch } from '@/components/kit/ViewSwitch'
import { cn } from '@/lib/utils'
import {
  loadCielo, readListaPin, readSessionPins, readStash, switchVista, vistaOf, writeSessionPins, writeStash,
  type ManifestLite, type Vista,
} from '@/lib/vista'

const VISTAS: readonly Vista[] = ['cielo', 'lista']
/** Same key as pages/Atlas.tsx ATLAS_VISITED_KEY (not imported: the sky stays out of the shell). */
const VISITED_KEY = 'rubli_atlas_visited_v1'

const visited = () => { try { return !!window.localStorage.getItem(VISITED_KEY) } catch { return true } }
const markVisited = () => { try { window.localStorage.setItem(VISITED_KEY, '1') } catch { /* storage blocked */ } }

/** Switch El Mapa's view, carrying the selection (the switch and Lista's «Ver sus vínculos» door). */
export function useVistaGo() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  return (to: Vista) => {
    // The sky writes with raw history calls — read the live URL, not the router's copy.
    const r = switchVista(to, window.location.search, readStash(), {
      manifest: qc.getQueryData<ManifestLite>(['atlas-sky', 'manifest']),
      listaPin: to === 'cielo' ? readListaPin() : null,
      sessionPins: readSessionPins(),
    })
    writeStash(r.stash)
    if (r.pins) writeSessionPins(r.pins)
    if (to === 'cielo') {
      // A bare desktop switch may start the sky's first-visit flight, which sets the flag itself.
      const bare = !/(^|[?&])(star|planet|pins|lens|vuelo)=/.test(r.search)
      const flightCan = window.matchMedia('(min-width: 768px)').matches && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
      if (!(bare && flightCan)) markVisited()
    }
    navigate({ pathname: '/mapa', search: r.search }, { state: { atlasDepth: 0 } })
  }
}

export const prefetchCielo = () => { void loadCielo().catch(() => {}) }

/** Three points that twinkle (static under reduced motion) — the sky reads as a second world. */
export function TwinkleGlyph({ className }: { className?: string }) {
  return (
    <span aria-hidden="true" className={cn('vista-twinkle relative inline-block h-2 w-[11px] text-accent', className)}>
      <i /><i /><i />
    </span>
  )
}

/** The page-level form: the kit segmented control (OWNER_REVIEW 2026-10-28 § G3), named «Cifras · Vínculos». */
export function VistaBlock({ className }: { className?: string }) {
  const { t, i18n } = useTranslation('nav')
  const { search } = useLocation()
  const go = useVistaGo()
  const en = i18n.language?.startsWith('en')
  return (
    <ViewSwitch
      className={className}
      label={t('vista.label')}
      lang={en ? 'en' : 'es'}
      value={vistaOf(search)}
      onChange={go}
      onHover={(v) => { if (v === 'cielo') prefetchCielo() }}
      views={VISTAS.map((v) => ({ key: v, es: t(`vista.${v}`, { lng: 'es' }), en: t(`vista.${v}`, { lng: 'en' }) }))}
    />
  )
}

export function VistaSwitch({ className }: { className?: string }) {
  const { t } = useTranslation('nav')
  const { search } = useLocation()
  const go = useVistaGo()
  const refs = useRef<Array<HTMLButtonElement | null>>([])
  const active = vistaOf(search)
  const [cue, setCue] = useState(() => !visited())
  const showCue = cue && active === 'lista'

  const pick = (v: Vista) => {
    if (v === active) return
    if (v === 'cielo') setCue(false)
    go(v)
  }
  const dismiss = () => { markVisited(); setCue(false) }

  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (!d) return
    e.preventDefault()
    const j = (i + d + VISTAS.length) % VISTAS.length
    refs.current[j]?.focus()
    pick(VISTAS[j])
  }

  return (
    <div className={cn('relative flex items-stretch', className)}>
      <div role="radiogroup" aria-label={t('vista.label')} className="flex items-stretch">
        {VISTAS.map((v, i) => {
          const on = v === active
          return (
            <Fragment key={v}>
            {i > 0 && <span aria-hidden="true" className="w-px h-3 self-center bg-border" />}
            <button
              ref={(el) => { refs.current[i] = el }}
              type="button"
              role="radio"
              aria-checked={on}
              aria-describedby={v === 'cielo' && showCue ? 'vista-hint' : undefined}
              tabIndex={on ? 0 : -1}
              onClick={() => pick(v)}
              onKeyDown={(e) => onKey(e, i)}
              onPointerEnter={v === 'cielo' ? prefetchCielo : undefined}
              onFocus={v === 'cielo' ? prefetchCielo : undefined}
              className={cn(
                'relative inline-flex h-11 md:h-7 items-center gap-1.5 px-3 md:px-2 font-mono text-[11px] uppercase tracking-[0.14em] transition-colors rounded-sm',
                'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent',
                on ? 'text-text-primary' : 'text-text-muted hover:text-text-primary',
                v === 'cielo' && showCue && 'vista-beckon',
              )}
            >
              {t(`vista.${v}`)}
              {v === 'cielo' && <TwinkleGlyph />}
              <span
                aria-hidden="true"
                className={cn('absolute left-2 right-2 md:left-1.5 md:right-1.5 bottom-1.5 md:bottom-0.5 h-[2px]', on ? 'bg-accent' : 'bg-transparent')}
              />
            </button>
            </Fragment>
          )
        })}
      </div>
      {showCue && (
        <div
          id="vista-hint"
          className="absolute left-0 max-md:left-auto max-md:right-0 top-full mt-1.5 z-40 flex w-max max-w-[calc(100vw-32px)] items-center gap-2 rounded-sm border border-border bg-background-card py-1 pl-3 pr-1 shadow-sm"
          style={{ borderLeft: '2px solid var(--color-accent)' }}
        >
          <span className="text-[13px] leading-snug text-text-secondary" style={{ fontFamily: 'var(--font-family-editorial)' }}>
            {t('vista.hint')}
          </span>
          <button
            type="button"
            onClick={dismiss}
            aria-label={t('vista.dismiss')}
            className="inline-flex h-11 w-11 md:h-6 md:w-6 flex-shrink-0 items-center justify-center font-mono text-[11px] text-text-muted hover:text-text-primary rounded-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  )
}
