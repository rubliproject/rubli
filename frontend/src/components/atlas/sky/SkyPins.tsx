/**
 * SkyPins — «Marcas / Pins». Spec .claude/designus/atlas-instruments-2026-10-03/spec-draft.md §3.6.
 * `b` pins the focused body (≤ 12, `pins=` in the URL, a session mirror), `1`–`9` fly to pin N.
 * The block lists pins at the top of the catalog tab; a withheld body is listed by its public
 * label (the page's names map holds '' for it). Pennants are ink ▾ 9 × 12 px with the digit in
 * 10 px mono — not ochre, which already means documented — placed from the engine's per-frame
 * view like the lasso; at Z0 a pinned planet's pennant sits on its host star.
 */
import { useEffect, useLayoutEffect, useRef, type CSSProperties, type MutableRefObject } from 'react'
import { skyCopy } from '@/lib/atlas/sky/copy'
import { MAX_PINS } from '@/lib/atlas/sky/url-state'
import type { SkyView } from './SkyEngine'
import { FONT_MONO, FONT_SERIF } from './SkyLabels'

export interface PinItem {
  label: string
  /** world position at Z1+ (body or star) and at Z0 (the host star); null when the pin is not drawn */
  at: { x: number; y: number; hx: number; hy: number } | null
}

const RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1'
const mono: CSSProperties = { fontFamily: FONT_MONO, fontSize: 12, color: 'var(--color-text-secondary)' }

export function SkyPinsBlock({ pins, lang, onGo, onRemove, phone }: {
  pins: PinItem[]; lang: 'en' | 'es'; onGo: (n: number) => void; onRemove: (n: number) => void; phone?: boolean
}) {
  return (
    <section aria-label={skyCopy('pins', lang, { n: pins.length, max: MAX_PINS })} style={{ padding: phone ? '6px 0' : '8px 16px', borderBottom: '1px solid var(--color-border)' }}>
      <div style={{ ...mono, fontFamily: 'var(--font-sc)', fontWeight: 600, fontSize: 12, letterSpacing: 'var(--track-sc)', color: 'var(--color-text-muted)' }}>
        {skyCopy('pins', lang, { n: pins.length, max: MAX_PINS })}
      </div>
      {pins.length === 0 ? (
        <div style={{ ...mono, marginTop: 2 }}>{skyCopy('pinsEmpty', lang)}</div>
      ) : (
        <ol style={{ listStyle: 'none', margin: '2px 0 0', padding: 0 }}>
          {pins.map((p, n) => (
            <li key={n} className="flex items-center" style={{ gap: 6 }}>
              <button type="button" onClick={() => onGo(n)} className={RING}
                style={{ flex: 1, minWidth: 0, display: 'flex', gap: 8, alignItems: 'baseline', textAlign: 'left', background: 'transparent', border: 'none', padding: '3px 0', minHeight: phone ? 44 : 28, cursor: 'pointer' }}>
                <span style={{ ...mono, color: 'var(--color-text-primary)' }}>▾{n + 1}</span>
                <span style={{ fontFamily: FONT_SERIF, fontSize: 14, lineHeight: 1.25, color: 'var(--color-text-primary)' }}>{p.label}</span>
              </button>
              <button type="button" aria-label={skyCopy('pinRemove', lang, { n: n + 1 })} onClick={() => onRemove(n)} className={RING}
                style={{ ...mono, background: 'transparent', border: 'none', cursor: 'pointer', minWidth: phone ? 44 : 28, minHeight: phone ? 44 : 28 }}>×</button>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

/** Pennants over the sky: DOM, positioned every frame from the engine's view (no React per frame). */
export function SkyPennants({ pins, drawRef, viewRef, lang, onGo }: {
  pins: PinItem[]; drawRef: MutableRefObject<((v: SkyView) => void) | null>; viewRef: MutableRefObject<SkyView | null>
  lang: 'en' | 'es'; onGo: (n: number) => void
}) {
  const boxRef = useRef<HTMLDivElement>(null)
  const els = useRef<(HTMLButtonElement | null)[]>([])
  const pinsRef = useRef(pins)
  useLayoutEffect(() => { pinsRef.current = pins })
  const wRef = useRef(0)
  useEffect(() => {
    const box = boxRef.current
    if (!box) return
    const ro = new ResizeObserver(() => { wRef.current = box.clientWidth })
    ro.observe(box)
    wRef.current = box.clientWidth
    drawRef.current = (v) => {
      const rho = wRef.current / (v.x1 - v.x0)
      // Z1 begins at ρ = 0.6 px per world unit (SkyEngine Z1_RHO): below it a planet's pennant sits on its host star
      const z0 = rho < 0.6
      pinsRef.current.forEach((p, n) => {
        const el = els.current[n]
        if (!el) return
        if (!p.at) { el.style.display = 'none'; return }
        const x = ((z0 ? p.at.hx : p.at.x) - v.x0) * rho, y = ((z0 ? p.at.hy : p.at.y) - v.y0) * rho
        el.style.display = x < 0 || y < 0 || x > wRef.current || y > box.clientHeight ? 'none' : 'flex'
        el.style.transform = `translate3d(${x}px, ${y - 6}px, 0) translate(-50%, -100%)`
      })
    }
    return () => { ro.disconnect(); drawRef.current = null }
  }, [drawRef])
  // a pin added or removed between frames is placed at once from the last view
  useEffect(() => { if (viewRef.current) drawRef.current?.(viewRef.current) }, [pins, drawRef, viewRef])
  return (
    <div ref={boxRef} className="absolute inset-0 pointer-events-none" style={{ zIndex: 2, overflow: 'hidden' }}>
      {pins.map((p, n) => (
        <button
          key={n} ref={(el) => { els.current[n] = el }} type="button" onClick={() => onGo(n)}
          aria-label={skyCopy('pinGo', lang, { n: n + 1, name: p.label })} title={p.label} className={RING}
          style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'auto', display: 'none', flexDirection: 'column', alignItems: 'center', padding: 0, border: 'none', background: 'transparent', cursor: 'pointer' }}
        >
          <span style={{ fontFamily: FONT_MONO, fontSize: 12, lineHeight: 1, color: 'var(--color-text-primary)', background: 'var(--color-background)', padding: '0 2px' }}>{n + 1}</span>
          <span aria-hidden="true" style={{ width: 9, height: 12, background: 'var(--color-text-primary)', clipPath: 'polygon(0 0, 100% 0, 50% 100%)' }} />
        </button>
      ))}
    </div>
  )
}
