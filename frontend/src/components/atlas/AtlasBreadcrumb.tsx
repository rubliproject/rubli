/**
 * AtlasBreadcrumb — «ESTÁS EN / YOU ARE IN» + the hop trail, one row.
 * Spec .claude/designs/atlas-2026-10-02-spec.md §3.4 (graft G1c from «La Carta Celeste»).
 *
 * Position crumbs are computed on zoom `end` from the camera (sector › star › planet
 * › moon); bodies anchor to their host star, so the star crumb names a real buyer
 * by construction. Every crumb is a plain fly <button> (F10), names wrap and never
 * truncate. Trail chips: ≤ 6 visible; a longer trail keeps its origin chip «⌂» (instruments §3.9 «Bitácora»:
 * `{` retraces there in one step) then «…» and the last four; a chip retraces to that hop. `onLog` adds the «h»
 * button that opens the full log.
 * The keyboard ring is inlined (F9: ring.ts retired in Session 4).
 */

/** The one keyboard ring for every /atlas control (same classes as /aria's RING). */
const ATLAS_RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1'

export interface Crumb { label: string; onClick?: () => void }
export interface TrailChip { label: string }

interface Props {
  lang: 'en' | 'es'
  youAreIn: string
  crumbs: Crumb[]
  trailLabel: string
  trail: TrailChip[]
  onTrail: (index: number) => void
  escHint: string
  /** instruments §3.9: the «h» log button (the popover lives on the page, over the dock) */
  onLog?: () => void
  logLabel?: string
}

const MONO = 'var(--font-family-archival)'
const SERIF = 'var(--font-family-editorial)'

export function AtlasBreadcrumb({ lang, youAreIn, crumbs, trailLabel, trail, onTrail, escHint, onLog, logLabel }: Props) {
  // ≤ 6 chips: all; longer: the origin, «…», the last four (indices into `trail`)
  const idx = trail.length <= 6 ? trail.map((_, i) => i) : [0, -1, ...trail.slice(-4).map((_, k) => trail.length - 4 + k)]
  return (
    <nav
      aria-label={youAreIn}
      lang={lang}
      className="flex flex-wrap items-baseline gap-x-2 gap-y-1"
      style={{ fontFamily: MONO, fontSize: 12, letterSpacing: '0.04em', color: 'var(--color-text-muted)' }}
    >
      <span style={{ fontFamily: 'var(--font-sc)', letterSpacing: 'var(--track-sc)', color: 'var(--color-accent-text)', fontWeight: 600 }}>{youAreIn}</span>
      {crumbs.map((c, n) => {
        const last = n === crumbs.length - 1
        return (
          <span key={n} className="inline-flex items-baseline gap-2">
            {n > 0 && <span aria-hidden="true" style={{ color: 'var(--color-text-muted)' }}>›</span>}
            {c.onClick && !last ? (
              <button
                type="button"
                onClick={c.onClick}
                className={`rounded-sm ${ATLAS_RING}`}
                style={{ fontFamily: SERIF, fontSize: 14, letterSpacing: 0, color: 'var(--color-text-secondary)', background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}
              >
                {c.label}
              </button>
            ) : (
              <span aria-current={last ? 'location' : undefined} style={{ fontFamily: SERIF, fontSize: 14, letterSpacing: 0, color: 'var(--color-text-primary)' }}>
                {c.label}
              </span>
            )}
          </span>
        )
      })}
      {trail.length > 0 && (
        <span className="inline-flex flex-wrap items-baseline gap-1" style={{ marginLeft: 12 }}>
          <span style={{ fontFamily: 'var(--font-sc)', letterSpacing: 'var(--track-sc)' }}>{trailLabel}</span>
          {idx.map((index) => {
            if (index < 0) return <span key="gap" aria-hidden="true">…</span>
            const t = trail[index]
            return (
              <button
                key={index}
                type="button"
                onClick={() => onTrail(index)}
                className={`rounded-sm ${ATLAS_RING}`}
                style={{ fontFamily: SERIF, fontSize: 13, letterSpacing: 0, color: 'var(--color-text-secondary)', background: 'var(--color-background-card)', border: '1px solid var(--color-border)', padding: '0 6px', cursor: 'pointer' }}
              >
                {index === 0 ? `⌂ ${t.label}` : t.label}
              </button>
            )
          })}
          <span style={{ marginLeft: 4 }}>{escHint}</span>
          {onLog && (
            <button type="button" onClick={onLog} aria-label={logLabel} title={logLabel} className={`rounded-sm ${ATLAS_RING}`}
              style={{ fontFamily: MONO, fontSize: 12, color: 'var(--color-text-secondary)', background: 'var(--color-background-card)', border: '1px solid var(--color-border)', padding: '0 6px', cursor: 'pointer', marginLeft: 4 }}>
              h
            </button>
          )}
        </span>
      )}
    </nav>
  )
}
