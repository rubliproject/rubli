/**
 * SkyCompare — «Lámina doble / Twin plate». Spec .claude/designus/atlas-instruments-2026-10-03/spec-draft.md §3.7
 * (precedent: the blink comparator — two plates of the same field, registered identically). The located star in
 * sexenio A and in sexenio B: positions are the same by construction, only lighting (money in the sexenio) and
 * disc B's §3.4 marks differ. The spine holds the same pure diff. A refused period hatches disc B. Overlay over the
 * sky host, role="dialog", focus trapped (disc A → spine → disc B → close); Esc closes it in a capture-phase
 * listener with stopImmediatePropagation (the page's back() returns early on an empty trail — F13). The engine
 * is paused underneath; the camera is untouched.
 */
import { useEffect, useRef, type CSSProperties } from 'react'
import { formatCompactMXN } from '@/lib/utils'
import { formatEntityName } from '@/lib/entity/format'
import { skyCopy } from '@/lib/atlas/sky/copy'
import type { SkyManifest, SkySystem } from '@/lib/atlas/sky/geometry'
import { diffMarks, type PeriodDiff } from '@/lib/atlas/sky/period-diff'
import { PERIOD_KEYS, periodName } from '@/lib/atlas/sky/url-state'
import { SystemDisc } from './phone/PhoneDisc'
import { SkyDiff } from './SkyDiff'
import { FONT_MONO, FONT_SERIF } from './SkyLabels'

const kicker: CSSProperties = { fontFamily: 'var(--font-sc)', fontWeight: 600, fontSize: 12, letterSpacing: 'var(--track-sc)', color: 'var(--color-text-muted)' }
const RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1'
const FOCUSABLE = 'button, [href], select, [tabindex]:not([tabindex="-1"])'

interface Props {
  manifest: SkyManifest
  star: number
  system: SkySystem | null
  diff: PeriodDiff | null
  lang: 'en' | 'es'
  /** the sky host's size: discs 440 at 1440, 384 at 1280 (§3.7 Px) */
  w: number
  h: number
  onClose: () => void
  onFlyStar: (idx: number) => void
}

export function SkyCompare({ manifest, star, system, diff, lang, w, h, onClose, onFlyStar }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  useEffect(() => { closeRef.current = onClose })
  const spine = w >= 1300 ? 230 : 200
  const disc = Math.max(240, Math.min(440, Math.floor((w - spine - 48) / 2), h - 96))

  useEffect(() => {
    // F13: Esc leaves compare even with an empty trail — capture phase, before the page's own Esc → back()
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopImmediatePropagation()
      closeRef.current()
    }
    window.addEventListener('keydown', onKey, true)
    ref.current?.querySelector<HTMLElement>('figure')?.focus() // Tab: disc A → spine → disc B → close
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])
  const trap = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab' || !ref.current) return
    const els = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)]
    if (!els.length) return
    const first = els[0], last = els[els.length - 1]
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  }

  const S = manifest.stars
  const name = formatEntityName('institution', S.name[star], 'full')
  const sys = system && system.star.id === S.id[star] ? system : null
  const marks = diffMarks(diff)
  const plate = (side: 'A' | 'B') => {
    const p = diff ? (side === 'A' ? diff.A : diff.B) : null
    const money = diff ? (side === 'A' ? diff.moneyA : diff.moneyB) : 0
    return (
      <figure tabIndex={0} aria-label={`${name} · ${p ? periodName(p) : ''}`} className={RING} style={{ margin: 0, flex: `0 0 ${disc}px` }}>
        <figcaption style={{ ...kicker, display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
          <span>{side} · {p ? periodName(p) : '—'}</span>
          <span style={{ letterSpacing: '0.04em' }}>{formatCompactMXN(money)}</span>
        </figcaption>
        {sys && p ? (
          <SystemDisc
            system={sys} px={disc} period={PERIOD_KEYS.indexOf(p)} focus={[]} label={`${name} · ${periodName(p)}`} onPick={() => {}}
            marks={side === 'B' ? marks : null} hatched={!!diff?.refused && diff.refused.period === p}
          />
        ) : (
          <div style={{ ...kicker, width: disc, height: disc, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{skyCopy('loadingSystem', lang)}</div>
        )}
      </figure>
    )
  }

  return (
    <div
      ref={ref} role="dialog" aria-modal="true" aria-label={`${skyCopy('twinTitle', lang)} · ${name}`} onKeyDown={trap}
      className="absolute inset-0 flex flex-col" style={{ zIndex: 10, background: 'var(--color-background)', padding: '10px 16px' }}
    >
      <div className="flex items-baseline justify-between gap-3" style={{ marginBottom: 8 }}>
        <div>
          <span style={kicker}>{skyCopy('twinTitle', lang)}</span>
          <span style={{ fontFamily: FONT_SERIF, fontSize: 17, color: 'var(--color-text-primary)', marginLeft: 10 }}>{name}</span>
        </div>
        <div className="flex items-baseline gap-3">
          <span style={{ ...kicker, textTransform: 'none', letterSpacing: '0.04em' }}>{skyCopy('twinStamp', lang)}</span>
          <button type="button" onClick={onClose} aria-label={skyCopy('twinClose', lang)} title={skyCopy('twinClose', lang)} className={RING}
            style={{ fontFamily: FONT_MONO, fontSize: 12, background: 'var(--color-background-card)', border: '1px solid var(--color-border)', padding: '2px 10px', cursor: 'pointer', color: 'var(--color-text-secondary)' }}>
            Esc ×
          </button>
        </div>
      </div>
      <div className="flex items-start justify-center gap-4" style={{ flex: 1, minHeight: 0 }}>
        {plate('A')}
        <div tabIndex={0} aria-label={skyCopy('tabs', lang).split(' · ')[2]} className={RING} style={{ flex: `0 0 ${spine}px`, alignSelf: 'stretch', display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
          <SkyDiff manifest={manifest} star={star} diff={diff} lang={lang} bare onPair={() => {}} onFlyBody={() => {}} onFlyStar={onFlyStar} />
        </div>
        {plate('B')}
      </div>
    </div>
  )
}
