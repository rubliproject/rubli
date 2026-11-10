/**
 * CasesShared — small primitives shared between El Padrón (/cases) and
 * El Expediente (/cases/:slug). DESIGNUS synthesis 2026-06-10.
 *
 *   DispositionSeal — mono-stamped legal-status seal; the shared spine glyph
 *                     the reader learns on the index and meets again on the
 *                     dossier rail (ARCHIVO).
 *   FeatureSection  — tight left-aligned section wrapper (py-10 + § kicker).
 *                     Replaces ChapterShell/ChapterHeading on the case dossier
 *                     only — the centered 120px numerals were the dead-air bug.
 *   MarginNote      — ochre-ruled set note for the three DB note fields
 *                     (amount_note / legal_status_note / compranet_note).
 *   SeverityScale   — this-case-vs-the-archive severity distribution strip.
 *   PaperGrain      — page-scoped archival grain (dossier only).
 */
import { useRef } from 'react'
import { DotBar } from '@/components/ui/DotBar'
import { measureLabel } from '@/lib/plateLabels'
import { useMeasuredWidth } from '@/hooks/useMeasuredWidth'
import { tidy } from '@/lib/typography'
import {
  dispositionFor,
  dispositionLabel,
  severityColor,
  SEVERITY_MAX,
  type Lang,
} from './casesVocab'

// ─── DispositionSeal ────────────────────────────────────────────────────────

export function DispositionSeal({
  status,
  lang,
  size = 'sm',
}: {
  status: string | undefined | null
  lang: Lang
  size?: 'sm' | 'md'
}) {
  const meta = dispositionFor(status)
  const label = dispositionLabel(status, lang)
  // DESIGN.md §6.5 chip: the hue at 8% on paper, 1px rule, SC 13 at .04em, radius 2.
  return (
    <span
      className="inline-flex items-center gap-2"
      style={{
        fontFamily: 'var(--font-sc)',
        fontSize: 13,
        lineHeight: 1.4,
        letterSpacing: 'var(--track-sc)',
        fontWeight: 600,
        color: meta.ink,
        border: '1px solid var(--color-border)',
        borderRadius: 2,
        background: `color-mix(in srgb, ${meta.fill} 8%, white)`,
        padding: size === 'md' ? '4px 8px' : '0 4px',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 8,
          height: 8,
          borderRadius: 999,
          background: meta.ring ? 'transparent' : meta.fill,
          border: meta.ring ? '2px solid var(--color-text-primary)' : 'none',
          flexShrink: 0,
        }}
      />
      {label}
    </span>
  )
}

// ─── FeatureSection ─────────────────────────────────────────────────────────

export function FeatureSection({
  id,
  numeral,
  title,
  meta,
  lang,
  accent,
  ink,
  children,
}: {
  id: string
  numeral: string
  title: { en: string; es: string }
  /** Optional right-aligned mono meta fragment. */
  meta?: string
  lang: Lang
  /** Sector-tinted accent for the rules and marks (falls back to var(--color-accent)). */
  accent?: string
  /** AA-safe ink for the type that carries the accent — the movement label and
   *  the § numeral. Defaults to `accent`; pass `getSectorTextColor(code)` when
   *  `accent` is a vivid sector hex, which fails AA as small type. */
  ink?: string
  children: React.ReactNode
}) {
  const accentColor = accent ?? 'var(--color-accent)'
  const inkColor = ink ?? accentColor
  return (
    <section id={id} className="pt-4 pb-5 scroll-mt-6" style={{ borderTop: '1px solid var(--color-border)' }}>
      <div className="flex items-baseline justify-between gap-4 mb-3">
        <h2
          style={{
            fontFamily: 'var(--font-sc)',
            fontSize: 13,
            letterSpacing: 'var(--track-sc)',
            color: 'var(--color-text-muted)',
            fontWeight: 600,
          }}
        >
          <span style={{ color: inkColor, fontWeight: 700 }}>§&nbsp;{numeral}</span>
          <span className="mx-2 opacity-50" aria-hidden="true">·</span>
          {tidy(lang === 'es' ? title.es : title.en, lang)}
        </h2>
        {meta && (
          <p
            className="font-mono tabular-nums"
            style={{ fontSize: 13, color: 'var(--color-text-muted)' }}
          >
            {meta}
          </p>
        )}
      </div>
      {children}
    </section>
  )
}

// ─── SeverityScale — this case against the whole archive ────────────────────

const LABEL_FONT = '12px "IBM Plex Mono", monospace'

export function SeverityScale({
  severity,
  distribution,
  lang,
}: {
  severity: number
  /** counts per severity level 1..4, from the full case list. */
  distribution: Record<number, number>
  lang: Lang
}) {
  const ref = useRef<HTMLDivElement>(null)
  const width = useMeasuredWidth(ref)
  const total = Object.values(distribution).reduce((a, b) => a + b, 0)
  if (!total) return null
  const graver = Object.entries(distribution)
    .filter(([lvl]) => Number(lvl) > severity)
    .reduce((a, [, n]) => a + n, 0)
  const sentence =
    lang === 'es'
      ? graver === 0
        ? `Gravedad ${severity} de ${SEVERITY_MAX} — entre los más graves de ${total} casos documentados.`
        : `Gravedad ${severity} de ${SEVERITY_MAX} — ${graver} de ${total} casos documentados son más graves.`
      : graver === 0
        ? `Severity ${severity} of ${SEVERITY_MAX} — among the gravest of ${total} documented cases.`
        : `Severity ${severity} of ${SEVERITY_MAX} — ${graver} of ${total} documented cases are graver.`

  const levels = [1, 2, 3, 4].filter((lvl) => (distribution[lvl] ?? 0) > 0)

  return (
    <div ref={ref} className="mt-5">
      {/* The band is colour, not text — the labels sit under it at 10px on the
          page ground. Inside a 0.18-opacity segment they measured 1.09:1
          (D5 audit); here they are text-secondary on the page. */}
      <div
        className="flex w-full"
        style={{ height: 16, gap: 2 }}
        role="img"
        aria-label={sentence}
      >
        {levels.map((lvl) => {
          const n = distribution[lvl] ?? 0
          const isThis = lvl === severity
          return (
            <div
              key={lvl}
              style={{
                width: `${(n / total) * 100}%`,
                background: severityColor(lvl),
                opacity: isThis ? 0.95 : 0.18,
                outline: isThis ? '1px solid var(--color-accent)' : 'none',
                outlineOffset: 1,
              }}
            />
          )
        })}
      </div>
      <div className="flex w-full mt-1.5" style={{ gap: 2 }} aria-hidden="true">
        {levels.map((lvl) => {
          const n = distribution[lvl] ?? 0
          const isThis = lvl === severity
          const full = `S${lvl} · ${n}`
          // A cell too narrow for the pair prints the count alone — the
          // sentence below already names the level.
          const fits =
            width > 0 &&
            width * (n / total) >= measureLabel(full, LABEL_FONT, 999, 12).width + 6
          return (
            <div
              key={lvl}
              className="font-mono tabular-nums text-center"
              style={{
                width: `${(n / total) * 100}%`,
                fontSize: 12,
                color: isThis ? severityColor(lvl) : 'var(--color-text-secondary)',
                fontWeight: isThis ? 700 : 400,
              }}
            >
              {fits ? full : n}
            </div>
          )
        })}
      </div>
      <p
        className="mt-2"
        style={{
          fontFamily: 'var(--font-family-editorial)',
          fontStyle: 'normal',
          fontSize: 13,
          color: 'var(--color-text-secondary)',
        }}
      >
        {sentence}
      </p>
    </div>
  )
}

// ─── Severity dots (canonical DotBar, 4-point scale) ────────────────────────

export function SeverityDots({
  severity,
  lang,
  className,
}: {
  severity: number
  lang: Lang
  className?: string
}) {
  return (
    <DotBar
      value={severity}
      max={SEVERITY_MAX}
      dots={SEVERITY_MAX}
      dotR={2.5}
      dotGap={9}
      color={severityColor(severity)}
      ariaLabel={
        lang === 'es'
          ? `Gravedad ${severity} de ${SEVERITY_MAX}`
          : `Severity ${severity} of ${SEVERITY_MAX}`
      }
      className={className}
    />
  )
}

// ─── PaperGrain — dossier-only archival atmosphere ──────────────────────────

export function PaperGrain() {
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-0"
      style={{ width: '100%', height: '100%', opacity: 0.045, mixBlendMode: 'multiply', zIndex: 0 }}
    >
      <filter id="case-paper-grain">
        <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="7" stitchTiles="stitch" />
        <feColorMatrix type="matrix" values="0 0 0 0 0.41  0 0 0 0 0.27  0 0 0 0 0.13  0 0 0 1 0" />
      </filter>
      <rect width="100%" height="100%" filter="url(#case-paper-grain)" />
    </svg>
  )
}
