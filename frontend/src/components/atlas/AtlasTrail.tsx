/**
 * AtlasTrail — «Estás en» + the hop trail, one row, on «El Contrato» (DESIGN.md §2, §8).
 * Same behaviour as AtlasBreadcrumb (spec atlas-2026-10-02 §3.4, instruments §3.9): crumbs
 * fly, names wrap and never truncate, ≤ 6 trail chips (origin «⌂», «…», the last four),
 * `onLog` adds the «h» log button. Small caps replace the uppercase mono eyebrow.
 */
import type { Crumb, TrailChip } from './AtlasBreadcrumb'

interface Props {
  lang: 'en' | 'es'
  crumbs: Crumb[]
  trailLabel: string
  trail: TrailChip[]
  onTrail: (index: number) => void
  escHint: string
  onLog?: () => void
  logLabel?: string
}

export function AtlasTrail({ lang, crumbs, trailLabel, trail, onTrail, escHint, onLog, logLabel }: Props) {
  const youAreIn = lang === 'en' ? 'You are in' : 'Estás en'
  const idx = trail.length <= 6 ? trail.map((_, i) => i) : [0, -1, ...trail.slice(-4).map((_, k) => trail.length - 4 + k)]
  return (
    <nav aria-label={youAreIn} lang={lang} className="at-trail">
      <span className="ct-sc">{youAreIn}</span>
      {crumbs.map((c, n) => {
        const last = n === crumbs.length - 1
        return (
          <span key={n} className="inline-flex items-baseline gap-2">
            {n > 0 && <span aria-hidden="true">›</span>}
            {c.onClick && !last
              ? <button type="button" onClick={c.onClick} className="at-crumb at-link">{c.label}</button>
              : <span aria-current={last ? 'location' : undefined} className="at-here">{c.label}</span>}
          </span>
        )
      })}
      {trail.length > 0 && (
        <span className="inline-flex flex-wrap items-baseline gap-2" style={{ marginLeft: 12 }}>
          <span className="ct-sc">{trailLabel}</span>
          {idx.map((index) => {
            if (index < 0) return <span key="gap" aria-hidden="true">…</span>
            const t = trail[index]
            return (
              <button key={index} type="button" onClick={() => onTrail(index)} className="at-chip at-link">
                {index === 0 ? `⌂ ${t.label}` : t.label}
              </button>
            )
          })}
          <span>{escHint}</span>
          {onLog && (
            <button type="button" onClick={onLog} aria-label={logLabel} title={logLabel} className="at-btn is-mono" style={{ minHeight: 32, padding: '0 8px' }}>h</button>
          )}
        </span>
      )}
    </nav>
  )
}
