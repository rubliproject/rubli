/**
 * ZPrimitives — shared editorial chrome + animation foundations for /explore
 * Z0 through Z4. Built on the Z0 canon (commit e67a5110):
 *
 *   - One easing family across the whole canvas (`Z_EASE`)
 *   - Layout transitions reserved for "data was re-asked a different question"
 *   - Arrival is opacity. Change is transform. Truth is layout.
 *   - Sort toggle is the platform's signature investigative gesture.
 *
 * Z1-Z4 import from this module so the heartbeat stays identical at every
 * zoom level — no level redefines a duration or easing curve.
 */

import { useLayoutEffect, useRef, useState } from 'react'
import { motion, type Variants } from 'framer-motion'
import { DUR, EASE, STAGGER } from '@/lib/motion'
import { useNavigate } from 'react-router-dom'
import { RISK_TEXT_COLORS, MAPA_SECTOR_COLORS as SECTOR_COLORS } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { VistaBlock } from '@/components/layout/VistaSwitch'
import { useExploreDispatch } from './ExploreState'

// ─── Animation canon (Z0-locked, exported for Z1-Z4) ────────────────────────
// Track B (2026-10-03): the Z canon is now a set of aliases onto the house
// motion tokens (lib/motion) — the names keep their Z0 meaning, the numbers
// live in one place for the whole site.

/** Single easing curve for all layout/transform transitions. ExpoOut. */
export const Z_EASE = EASE.emphasized

/** "Data was re-asked a different question" — sort toggle, filter, re-pivot. */
export const Z_LAYOUT_DURATION_S = DUR.story

/** Per-cell entrance (opacity + tiny scale). */
export const Z_CELL_ENTRANCE_S = DUR.slow

/** Header band entrance (kicker, stat row). */
export const Z_BAND_S = DUR.base

/** ~120ms between header cascade bands. */
export const Z_CASCADE_STEP_S = STAGGER.section

/** 6ms light-sweep stagger inside the treemap. */
export const Z_CELL_STAGGER_S = STAGGER.cell

/** Treemap waits for header cascade before staggering its children. */
export const Z_TREEMAP_DELAY_S = DUR.fast

/** Z4 drawer slide — chrome motion (not data motion), slightly faster. */
export const Z_DRAWER_S = DUR.slow

// ─── trans() factory ────────────────────────────────────────────────────────

// ─── Header cascade variants ────────────────────────────────────────────────

// ─── Focus ring (D15 § 6) ─────────────────────────────────────────────────
/** The shared visible-focus ring for every operable control on /explore. */
export const Z_FOCUS_RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1'
/** Inset twin for full-bleed rows and treemap tiles (an outset ring is clipped
 *  by the scroll container / neighbouring tile). */
export const Z_FOCUS_RING_INSET = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent'

// ─── Gutter (elmapa-2026-10-05 § 2 D2) ──────────────────────────────────────
/** One horizontal padding for every band of every panel — header, register,
 *  footer share a left edge. Content measure caps at 1,280 px, centred, with
 *  ≥ 40 px gutters at lg; borders/backgrounds still span the full panel. */
export const Z_GUTTER = 'px-6 lg:px-[max(2.5rem,calc((100%_-_1280px)/2))]'

// ─── ZBreadcrumb — the where-am-I affordance for Z1+ ────────────────────────

export type CrumbSegment = {
  /** Display label for this segment (sector name, institution name, etc.). */
  label: string
  /** Optional sector code — drives the 2px sector-color underline at this segment. */
  sectorCode?: string
  /** Click handler — typically dispatches a `pop-to-*` exploration action. */
  onClick?: () => void
}

/**
 * The Z1+ toolbar — one compact row (owner 2026-11-02, «fix SPACE not content»):
 * the where-am-I trail on the left; the level's sort (`controls`), El Mapa's
 * «Vínculos · Cifras» switch, the level's exits (`actions`: copy link, full
 * dossier) and a real close button (same as Esc) on the right. On a phone the
 * trail + exits share row 1 and the two switches drop to row 2; the close
 * button is a keyboard affordance and stays off phones (the trail's own
 * segments pop a level there).
 * The sector segment (segments[0]) carries the sector-color underline.
 * The old «Ver sus vínculos →» door was the switch's «Vínculos» twice over
 * (same useVistaGo call, selection carried) — the switch is the one door now.
 */
export function ZBreadcrumb({
  segments,
  lang,
  controls,
  actions,
}: {
  segments: CrumbSegment[]
  lang: 'en' | 'es'
  /** The level's sort toggle (was the kicker band's aside). */
  controls?: React.ReactNode
  /** The level's exits (copy link, full dossier) — were the jumpline bar at the foot. */
  actions?: React.ReactNode
}) {
  const dispatch = useExploreDispatch()
  const closeLabel = lang === 'en' ? 'Close this level (Esc)' : 'Cerrar este nivel (Esc)'
  return (
    <div
      data-crumbs=""
      className={`${Z_GUTTER} py-1 flex-shrink-0 flex flex-wrap items-center gap-x-3 sm:gap-x-4 gap-y-1 sticky top-0 z-[2]`}
      style={{
        minHeight: 40,
        background: 'var(--color-background)',
        borderBottom: '1px solid var(--color-border)',
      }}
    >
      <nav
        aria-label={lang === 'en' ? 'Map level' : 'Nivel del mapa'}
        className="flex flex-1 basis-[10rem] flex-wrap items-center gap-x-1.5 gap-y-0.5 min-w-0"
      >
        {segments.map((s, i) => {
          const isLast = i === segments.length - 1
          const accent = s.sectorCode ? SECTOR_COLORS[s.sectorCode] : undefined
          return (
            <span key={i} className="flex items-center gap-1.5 min-w-0">
              {i > 0 && (
                <span
                  className="font-mono text-[12px]"
                  style={{ color: 'var(--color-text-muted)', opacity: 0.5 }}
                  aria-hidden="true"
                >
                  ▸
                </span>
              )}
              <button
                type="button"
                onClick={s.onClick}
                disabled={isLast || !s.onClick}
                className={cn(
                  'inline-flex items-center min-h-11 sm:min-h-0 font-mono uppercase tracking-[0.12em] text-left transition-opacity rounded-sm',
                  Z_FOCUS_RING,
                  isLast ? 'cursor-default' : 'hover:opacity-70 cursor-pointer'
                )}
                style={{
                  fontSize: 12,
                  fontWeight: isLast ? 700 : 500,
                  color: 'var(--color-text-primary)',
                  border: 'none',
                  background: 'none',
                  // D15 § 7: whole names — the trail wraps instead of clipping.
                  whiteSpace: 'normal',
                }}
                aria-current={isLast ? 'page' : undefined}
              >
                {/* the sector underline hugs the label, not the 44px phone hit box */}
                <span style={{ borderBottom: accent ? `2px solid ${accent}` : undefined, paddingBottom: 1 }}>{s.label}</span>
              </button>
            </span>
          )
        })}
      </nav>
      {/* The switches: on the trail's row at sm+, their own row on a phone. */}
      <div className="order-last basis-full sm:order-none sm:basis-auto flex flex-wrap items-center gap-x-3 gap-y-1">
        {controls}
        <VistaBlock />
      </div>
      <div className="flex items-center gap-x-3">
        {actions}
        <button
          type="button"
          onClick={() => dispatch({ type: 'pop-focus' })}
          className={cn('max-sm:hidden inline-flex min-h-8 items-center font-mono text-[12px] tracking-[0.14em] text-text-muted hover:text-text-primary transition-colors rounded-sm whitespace-nowrap', Z_FOCUS_RING)}
          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
          aria-label={closeLabel}
          title={closeLabel}
        >
          ESC ↩
        </button>
      </div>
    </div>
  )
}

// ─── ZKickerBand — editorial section eyebrow + headline ─────────────────────

/**
 * The header band at the top of each Z-level panel, condensed (owner 2026-11-02):
 * the § kicker sits on the h1's own line, the meta line and the computed lede
 * are one line each, and «más» opens both in place when either is cut.
 * `caption` (the register's «los 50 mayores de N») sits at the right of the
 * title line.
 */
export function ZKickerBand({
  kicker,
  headline,
  stat,
  lede,
  caption,
  lang,
  custom = 0,
  variants,
}: {
  kicker: string
  headline: React.ReactNode
  stat?: React.ReactNode
  /** The computed finding (was its own pull-line band). */
  lede?: React.ReactNode
  caption?: React.ReactNode
  lang: 'en' | 'es'
  custom?: number
  variants: Variants
}) {
  const [open, setOpen] = useState(false)
  const [clipped, setClipped] = useState(false)
  const statRef = useRef<HTMLDivElement>(null)
  const ledeRef = useRef<HTMLParagraphElement>(null)
  // «más» only when a line is actually cut; while open, keep the last verdict.
  useLayoutEffect(() => {
    if (open) return
    const els = [statRef.current, ledeRef.current].filter((e): e is HTMLDivElement | HTMLParagraphElement => !!e)
    const check = () => setClipped(els.some((e) => e.scrollWidth > e.clientWidth + 1))
    check()
    const ro = new ResizeObserver(check)
    els.forEach((e) => ro.observe(e))
    return () => ro.disconnect()
  }, [stat, lede, open])
  const oneLine: React.CSSProperties | undefined = open
    ? undefined
    : { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }
  const moreLabel = open
    ? (lang === 'en' ? 'Show less' : 'Mostrar menos')
    : (lang === 'en' ? 'Show the full summary' : 'Mostrar el resumen completo')
  return (
    <motion.div
      variants={variants}
      custom={custom}
      className={`${Z_GUTTER} pt-2 pb-2 flex-shrink-0`}
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
        {/* The h1's eyebrow, not a section — a <p>, so the h1 opens the outline. */}
        <p
          className="font-mono text-[12px] font-normal uppercase tracking-[0.18em]"
          style={{ color: 'var(--color-accent)', maxWidth: 'none' }}
        >
          {kicker}
        </p>
        <h1
          className="font-serif text-text-primary leading-[1.15] min-w-0"
          style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: 'clamp(1.0625rem, 1.4vw, 1.25rem)',
            letterSpacing: '-0.01em',
            // one line when it fits — the site-wide `main h1` 32ch cap broke it in two
            maxWidth: 'none',
          }}
        >
          {headline}
        </h1>
        {caption && (
          <span className="sm:ml-auto font-serif tabular-nums text-[12px]" style={{ color: 'var(--color-text-muted)' }}>
            {caption}
          </span>
        )}
      </div>
      {(stat || lede) && (
        <div className="flex items-end gap-3 mt-1">
          <div className="min-w-0 flex-1">
            {stat && (
              <div
                ref={statRef}
                className="font-mono text-[12px] uppercase tracking-[0.12em]"
                style={{ color: 'var(--color-text-muted)', ...oneLine }}
              >
                {stat}
              </div>
            )}
            {lede && (
              <p
                ref={ledeRef}
                className="text-text-secondary leading-snug mt-0.5"
                style={{
                  fontSize: 14,
                  fontFamily: 'var(--font-family-editorial)',
                  // the site-wide `main p` 68ch cap would override the measure
                  maxWidth: 'none',
                  ...oneLine,
                }}
              >
                {lede}
              </p>
            )}
          </div>
          {(clipped || open) && (
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              title={moreLabel}
              className={`flex-none inline-flex min-h-11 sm:min-h-6 items-center font-mono text-[12px] tracking-[0.12em] text-accent-text hover:opacity-70 transition-opacity rounded-sm ${Z_FOCUS_RING}`}
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
            >
              {open ? (lang === 'en' ? 'less' : 'menos') : (lang === 'en' ? 'more' : 'más')}
            </button>
          )}
        </div>
      )}
    </motion.div>
  )
}

// ─── ZFooterLink — outbound continuity to canonical dossier routes ──────────

/**
 * Each Z-level footer has one "Ver ficha completa" link out to the
 * canonical destination dossier:
 *   Z1 → /sectors/:code
 *   Z2 → /institutions/:id
 *   Z3 → /vendors/:id   (or /vendors/:vendorId for T1/T2)
 *   Z4 → /contracts/:id
 *
 * /explore is the entry instrument; dossiers are the destinations.
 */
export function ZFooterLink({
  href,
  label,
  lang,
  compact = false,
}: {
  href: string
  label?: string
  lang: 'en' | 'es'
  /** Toolbar size (12px, regular weight) — the Z-panel exits now live in ZBreadcrumb. */
  compact?: boolean
}) {
  const navigate = useNavigate()
  // compact (toolbar): «Ficha completa», «Ficha» on a phone — the full name stays for screen readers
  const text = compact
    ? (lang === 'en' ? <><span className="max-sm:sr-only">Full </span>dossier</> : <>Ficha<span className="max-sm:sr-only"> completa</span></>)
    : label ?? (lang === 'en' ? 'Open full dossier' : 'Ver ficha completa')
  // 2026-06-12 (W5): promoted from 10px text-secondary — the page's main
  // exit to the dossier system was its least visible element.
  return (
    <button
      type="button"
      onClick={() => navigate(href)}
      className={`inline-flex items-center gap-1.5 font-mono ${compact ? 'min-h-11 sm:min-h-8 text-[12px]' : 'text-[13px]'} uppercase tracking-[0.14em] hover:opacity-70 transition-opacity rounded-sm whitespace-nowrap ${Z_FOCUS_RING}`}
      style={{ color: 'var(--color-text-primary)', fontWeight: compact ? 500 : 600, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
    >
      <span>{text}</span>
      <span aria-hidden="true" style={{ color: 'var(--color-accent)' }}>↗</span>
    </button>
  )
}

// ─── ZSortToggle — the canonical SPEND ↔ RISK pivot ─────────────────────────

/**
 * The platform's signature investigative gesture. Z0 has it. Z1, Z2, Z3
 * also have it — at Z3 with the alternate TIME ↔ RISK semantics. Behavior
 * is identical across levels: clicking the inactive mode flips the active
 * mode; cells/cards rearrange via framer-motion `layout` with
 * Z_LAYOUT_DURATION_S / Z_EASE.
 *
 * The button itself uses the sector-accent or risk-critical color depending
 * on which mode is active. No drop-shadow, no rounded-full, no "fun" UI —
 * just two flat segments inside a thin border.
 */
export function ZSortToggle<TMode extends string>({
  modes,
  active,
  onChange,
  riskMode,
  label,
  labelFor,
}: {
  modes: readonly TMode[]
  active: TMode
  onChange: (next: TMode) => void
  /** Which mode value should render the risk-critical accent (vs. plain accent). */
  riskMode: TMode
  /** Optional uppercased label (e.g. SORT, ORDENAR) shown above the toggle. */
  label?: string
  /** Maps a mode value to its display text (for i18n). Falls back to the
   *  raw mode value uppercased when omitted. */
  labelFor?: (mode: TMode) => string
}) {
  return (
    <div className="flex flex-col items-end gap-1">
      {label && (
        <span className="font-mono text-[13px] uppercase tracking-[0.14em] text-text-muted">
          {label}
        </span>
      )}
      <div className="flex rounded-sm overflow-hidden" style={{ border: '1px solid var(--color-border)' }}>
        {modes.map((m) => {
          const isActive = m === active
          const isRisk = m === riskMode
          return (
            <button
              key={m}
              type="button"
              onClick={() => onChange(m)}
              className={`font-mono text-[12px] uppercase tracking-[0.12em] px-2.5 py-1 transition-colors ${Z_FOCUS_RING_INSET}`}
              style={{
                background: isActive ? (isRisk ? RISK_TEXT_COLORS.critical : 'var(--color-accent)') : 'transparent',
                color: isActive ? '#fff' : 'var(--color-text-secondary)',
                cursor: 'pointer',
                border: 'none',
              }}
            >
              {labelFor ? labelFor(m) : m.toUpperCase()}
            </button>
          )
        })}
      </div>
    </div>
  )
}
