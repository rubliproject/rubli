import type { ReactNode } from 'react'

/**
 * MobileRegisterRow — the canonical compact row for any data register on phones.
 *
 * Replaces the desktop multi-column table row (which on a phone forced a
 * horizontal scroll and a tall, name-wrapping cell) with a ~2-line card:
 *
 *   ┌────────────────────────────────────────┐
 *   │ 1  [logo]  IMSS                         │   siglas
 *   │            Instituto Mexicano del Seguro│   full name, wraps (never `…`)
 *   │            Social                       │
 *   │            996B · 68% DA · ● 11%         │   metrics (compact mono chips)
 *   └────────────────────────────────────────┘
 *
 * No horizontal scroll, ~half the height of the desktop row. Each El Mapa zone
 * (institutions / vendors / contracts) maps its data onto `chips`. Presentational
 * only — the parent owns data + drill dispatch.
 */
export interface RegisterChip {
  value: string
  /** hex or CSS color applied via style (sector / risk palette) */
  color?: string
  /** render a small filled dot before the value (e.g. a risk pip) */
  dot?: boolean
  /** emphasize as the primary metric (heavier weight, primary ink) */
  bold?: boolean
}

interface MobileRegisterRowProps {
  /** rank index — omit for unranked registers (e.g. contracts) */
  rank?: number
  /** leading visual — a logo chip / avatar / glyph */
  leading?: ReactNode
  /** short uppercase code before the title (acronym / siglas) */
  code?: string
  title: string
  chips: RegisterChip[]
  onClick?: () => void
  ariaLabel?: string
  /** clamp the title to two lines (long free text such as a contract object); names never clamp */
  clampTitle?: boolean
}

export function MobileRegisterRow({
  rank,
  leading,
  code,
  title,
  chips,
  onClick,
  ariaLabel,
  clampTitle,
}: MobileRegisterRowProps) {
  return (
    <li style={{ maxWidth: 'none' /* not prose: escape the 68ch `main li` measure */ }}>
      <button
        type="button"
        onClick={onClick}
        aria-label={ariaLabel}
        className="w-full text-left flex items-start gap-2.5 px-2 py-2.5 rounded-sm transition-colors active:bg-background-elevated/60 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent"
      >
        {rank != null ? (
          <span className="shrink-0 w-5 pt-1 text-right font-mono tabular-nums text-[12px] text-text-muted">
            {rank}
          </span>
        ) : null}
        {leading ? <span className="shrink-0">{leading}</span> : null}
        <span className="min-w-0 flex-1">
          {/* D15 § 1: siglas on their own line, the full name wraps (never `…`). */}
          {code ? (
            <span className="block font-mono text-[12px] font-bold uppercase tracking-[0.04em] text-text-primary">
              {code}
            </span>
          ) : null}
          <span
            className={`block text-[13px] leading-snug text-text-secondary${clampTitle ? ' line-clamp-2' : ''}`}
            title={clampTitle ? title : undefined}
          >
            {title}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[12px] tabular-nums text-text-muted">
            {chips.map((c, i) => (
              <span key={i} className="inline-flex items-center gap-1">
                {c.dot ? (
                  <span
                    className="inline-block w-1.5 h-1.5 rounded-full"
                    style={{ background: c.color ?? 'currentColor' }}
                    aria-hidden="true"
                  />
                ) : null}
                <span
                  className={c.bold ? 'font-semibold text-text-primary' : undefined}
                  style={c.color ? { color: c.color } : undefined}
                >
                  {c.value}
                </span>
              </span>
            ))}
          </span>
        </span>
      </button>
    </li>
  )
}
