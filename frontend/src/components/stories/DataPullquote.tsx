import { useTranslation } from 'react-i18next'
import { useCountUp, useReveal } from '@/hooks/useAnimations'
import { ScrollReveal } from '@/components/ui/Reveal'
import { type OutletType } from './OutletBadge'
import { cn, localizeAmount } from '@/lib/utils'
import { textInk, CATEGORICAL, RISK_COLORS } from '@/lib/constants'
import { storyInk } from './storyInk'

import { DUR, EASE, STAGGER, stagger, css } from '@/lib/motion'
// ─────────────────────────────────────────────────────────────────────────────
// DataPullquote — editorial fact-tile. ONE shared component, FOUR roles, so a
// story that shows several figures never stamps the same box twice in a row:
//
//   ledger  — number-led boxed tile (the hero cifra)
//   plate   — boxed tile + micro-viz (threshold / proportion / …)
//   margin  — UNBOXED print pull-quote between hairlines (EB Garamond italic)
//   verdict — centered closing figure between full-width rules
//
// The 13 legacy VizTemplate names still map to five disciplined renderers
// (proportion / threshold / gauge / sliver / null). Role is chosen in
// StoryNarrative (pickPullquoteRole) and passed in; `sledgehammer` stays as a
// back-compat alias for `ledger`.
// ─────────────────────────────────────────────────────────────────────────────

export type VizTemplate =
  | 'breach-ceiling'
  | 'mass-sliver'
  | 'redline-gauge'
  | 'count-grid'
  | 'receipt-stamp'
  | 'margin-rule'
  | 'range-band'
  | 'zero-bar'
  | 'mosaic-tile'
  | 'threshold-band'
  | 'dot-ratio'
  | 'wave-breaker'
  | 'pile-up'
  | 'compare-gap'

export type PullquoteRole = 'ledger' | 'plate' | 'margin' | 'verdict'

interface DataPullquoteProps {
  quote: string
  attribution?: string
  stat: string
  statLabel: string
  statColor?: string
  barValue?: number
  barLabel?: string
  /** Optional Spanish translation of `barLabel`. */
  barLabel_es?: string
  outlet?: OutletType
  className?: string
  vizTemplate?: VizTemplate
  /** Editorial role — picks the typographic treatment. When omitted, derived
   *  from `sledgehammer`/`barValue` (belt-and-braces; StoryNarrative always
   *  passes an explicit role). */
  role?: PullquoteRole
  /** Legacy alias for role='ledger'. */
  sledgehammer?: boolean
}

// Map outlet → sector accent color (drives left border, stat color, viz fill).
// DESIGN.md §6.3 — the categorical set by index, matching StoryNarrative's outlets.
const OUTLET_ACCENT: Record<OutletType, string> = {
  longform: CATEGORICAL[0],
  investigative: CATEGORICAL[6],
  data_analysis: CATEGORICAL[1],
  rubli: CATEGORICAL[2],
}

// Map old 13-template names → 5 disciplined renderer families.
type VizFamily = 'proportion' | 'threshold' | 'gauge' | 'sliver' | 'null'

const TEMPLATE_FAMILY: Record<VizTemplate, VizFamily> = {
  'count-grid': 'proportion',
  'mosaic-tile': 'proportion',
  'dot-ratio': 'proportion',
  'breach-ceiling': 'threshold',
  'threshold-band': 'threshold',
  'margin-rule': 'threshold',
  'pile-up': 'threshold',
  'redline-gauge': 'gauge',
  'range-band': 'gauge',
  'wave-breaker': 'gauge',
  'mass-sliver': 'sliver',
  'compare-gap': 'sliver',
  'receipt-stamp': 'sliver',
  'zero-bar': 'null',
}

function parseStatNumber(stat: string): { num: number; suffix: string; decimals: number } | null {
  const match = stat.match(/^[~≈]?([0-9.,]+)\s*(%|B|M|K|T)?$/)
  if (!match) return null
  const cleaned = match[1].replace(/,/g, '')
  const num = parseFloat(cleaned)
  if (isNaN(num)) return null
  const decimals = cleaned.includes('.') ? cleaned.split('.')[1].length : 0
  return { num, suffix: match[2] || '', decimals }
}

function autoSelectTemplate(value: number, stat: string, label?: string): VizTemplate {
  if (value === 0) return 'zero-bar'
  if (value < 0.06) return 'mass-sliver'
  if (/^\d[\d,]+$/.test(stat.trim())) return 'count-grid'
  if ((label?.toLowerCase().includes('oecd') || label?.toLowerCase().includes('lím') ||
       label?.toLowerCase().includes('threshold')) && value > 0.40) return 'breach-ceiling'
  return 'threshold-band'
}

function parseThreshold(label?: string): number {
  if (!label) return 0.30
  const range = label.match(/(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)\s*%/)
  if (range) return parseFloat(range[1]) / 100
  const pct = label.match(/(\d+(?:\.\d+)?)\s*%/)
  if (pct) return parseFloat(pct[1]) / 100
  const dec = label.match(/:\s*(0\.\d+)/)
  if (dec) return parseFloat(dec[1])
  return 0.30
}


interface VizProps {
  value: number
  color: string
  label?: string
  stat?: string
  revealed: boolean
  lang: 'en' | 'es'
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Proportion — a ticked "out of ten" band (replaces the banned 100-dot
//    waffle). Filled fraction + nine cut-lines reads as counting, no dots.
// ─────────────────────────────────────────────────────────────────────────────
function ProportionBandViz({ value, color, revealed }: VizProps) {
  const v = Math.max(0, Math.min(1, value))
  const pct = v * 100
  const readout = pct < 10 ? pct.toFixed(1) : Math.round(pct).toString()
  const readoutRight = pct > 78
  return (
    <div className="relative" style={{ height: 24 }}>
      {/* Track */}
      <div
        className="absolute inset-x-0 top-1/2 -translate-y-1/2 rounded-sm"
        style={{ height: 12, background: 'var(--color-border)', opacity: 0.55 }}
      />
      {/* Fill */}
      <div
        className="absolute top-1/2 left-0 -translate-y-1/2 origin-left rounded-sm"
        style={{
          height: 12,
          width: `${pct}%`,
          background: color,
          opacity: revealed ? 0.9 : 0,
          transform: `translateY(-50%) scaleX(${revealed ? 1 : 0})`,
          transition: [css('transform', DUR.story, EASE.emphasized, DUR.fast), css('opacity', DUR.base)].join(', '),
        }}
      />
      {/* Nine tick cuts at 10% steps */}
      {Array.from({ length: 9 }).map((_, i) => (
        <div
          key={i}
          className="absolute top-1/2 -translate-y-1/2"
          style={{
            left: `${(i + 1) * 10}%`,
            width: 1,
            height: 12,
            background: 'var(--color-background-card)',
            opacity: revealed ? 0.9 : 0,
            transition: css('opacity', DUR.base, EASE.standard, stagger(i, STAGGER.row, DUR.base)),
          }}
        />
      ))}
      {/* Percent readout at the fill edge */}
      <div
        className="absolute top-1/2 -translate-y-1/2 font-mono font-bold tabular-nums"
        style={{
          left: `${pct}%`,
          transform: readoutRight ? 'translate(calc(-100% - 6px), -50%)' : 'translate(6px, -50%)',
          color: readoutRight ? 'var(--color-background)' : color,
          fontSize: 12,
          opacity: revealed ? 1 : 0,
          transition: css('opacity', DUR.slow, EASE.standard, DUR.story),
          whiteSpace: 'nowrap',
        }}
      >
        {readout}%
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Threshold — solid bar with dotted limit tick.
// ─────────────────────────────────────────────────────────────────────────────
function ThresholdViz({ value, color, revealed, label, lang }: VizProps) {
  const v = Math.max(0, Math.min(1, value))
  const valuePct = v * 100
  const thresholdPct = parseThreshold(label) * 100
  const limitLabel = lang === 'es' ? 'LÍMITE' : 'CEILING'
  // The limit caption used to hang below the bar on `bottom: -16` and centre on
  // its tick with a flat `translateX(-50%)`. Both leaked: the negative bottom
  // put it outside the 28px box, and at a low threshold (8%) half its width sat
  // left of the origin — 7px outside the figure at 390. It now has its own flow
  // row, and the shift scales with the anchor: 0% at the left edge, −50% in the
  // middle, −100% at the right. left = a·W − a·c and right = a·W + c(1−a), so
  // for any anchor in [0,1] and any caption narrower than the bar it stays in.
  const anchor = Math.max(0, Math.min(100, thresholdPct))
  return (
    <div>
      <div className="relative" style={{ height: 28 }}>
        <div
          className="absolute inset-x-0 top-1/2 -translate-y-1/2 rounded-sm"
          style={{ height: 12, background: 'var(--color-border)', opacity: 0.55 }}
        />
        <div
          className="absolute top-1/2 left-0 -translate-y-1/2 origin-left rounded-sm"
          style={{
            height: 12,
            width: `${valuePct}%`,
            background: color,
            opacity: revealed ? 0.9 : 0,
            transform: `translateY(-50%) scaleX(${revealed ? 1 : 0})`,
            transition: [css('transform', DUR.story, EASE.emphasized, DUR.fast), css('opacity', DUR.base)].join(', '),
          }}
        />
        <div
          className="absolute inset-y-0"
          style={{
            left: `${thresholdPct}%`,
            width: 1.5,
            background: 'var(--color-text-primary)',
            opacity: revealed ? 0.7 : 0,
            transition: css('opacity', DUR.slow, EASE.standard, DUR.story),
          }}
        />
      </div>
      <div className="relative" style={{ height: 14, marginTop: 2 }}>
        <div
          className="absolute font-mono ct-sc"
          style={{
            left: `${anchor}%`,
            top: 0,
            transform: `translateX(-${anchor}%)`,
            fontSize: 12,
            letterSpacing: '0.04em',
            color: 'var(--color-text-muted)',
            opacity: revealed ? 1 : 0,
            transition: css('opacity', DUR.base, EASE.standard, DUR.story),
            whiteSpace: 'nowrap',
          }}
        >
          {limitLabel} · {Math.round(thresholdPct)}%
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Gauge — linear scale (low→high) with a marker tick.
// ─────────────────────────────────────────────────────────────────────────────
function GaugeViz({ value, color, revealed, lang }: VizProps) {
  const v = Math.max(0, Math.min(1, value))
  const pct = v * 100
  return (
    <div>
      <div className="relative h-3.5 w-full rounded-sm overflow-hidden" style={{ background: 'var(--color-border)' }}>
        <div
          className="absolute inset-y-0 left-0 origin-left rounded-sm"
          style={{
            width: `${pct}%`,
            background: `linear-gradient(90deg, var(--color-text-muted) 0%, ${color} 100%)`,
            opacity: revealed ? 0.7 : 0,
            transform: `scaleX(${revealed ? 1 : 0})`,
            transition: [css('transform', DUR.story, EASE.emphasized, DUR.fast), css('opacity', DUR.slow)].join(', '),
          }}
        />
        <div
          className="absolute"
          style={{
            left: `calc(${pct}% - 1px)`,
            top: -2,
            bottom: -2,
            width: 2,
            background: color,
            opacity: revealed ? 1 : 0,
            transition: css('opacity', DUR.base, EASE.standard, DUR.story + DUR.base),
          }}
        />
      </div>
      <div className="flex items-center justify-between mt-1.5 font-mono ct-sc"
        style={{ fontSize: 12, letterSpacing: '0.04em', color: 'var(--color-text-muted)' }}>
        <span>{lang === 'es' ? 'BAJO' : 'LOW'}</span>
        <span style={{ color }}>{pct.toFixed(0)}%</span>
        <span>{lang === 'es' ? 'CRÍTICO' : 'CRITICAL'}</span>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Sliver — tiny confirmed slice vs the remainder in italic.
// ─────────────────────────────────────────────────────────────────────────────
function SliverViz({ value, color, revealed, lang }: VizProps) {
  const pct = Math.max(0, Math.min(1, value)) * 100
  const visualPct = Math.max(2.5, pct)
  const detectedStr = pct < 1 ? pct.toFixed(1) : Math.round(pct).toString()
  const undetectedStr = (100 - pct).toFixed(pct < 1 ? 1 : 0)
  const undetectedLabel = lang === 'es' ? 'sin detectar' : 'unconfirmed'
  return (
    <div>
      <div className="relative" style={{ height: 28 }}>
        <div
          className="absolute inset-x-0 top-1/2 -translate-y-1/2 rounded-sm"
          style={{ height: 12, background: 'var(--color-border)', opacity: 0.55 }}
        />
        <div
          className="absolute top-1/2 left-0 -translate-y-1/2 rounded-sm origin-left"
          style={{
            height: 12,
            width: `${visualPct}%`,
            background: color,
            opacity: revealed ? 1 : 0,
            transform: `translateY(-50%) scaleX(${revealed ? 1 : 0})`,
            transition: [css('transform', DUR.story, EASE.emphasized, DUR.fast), css('opacity', DUR.base)].join(', '),
          }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 font-mono font-bold tabular-nums"
          style={{
            left: `calc(${visualPct}% + 6px)`,
            color,
            fontSize: 12,
            opacity: revealed ? 1 : 0,
            transition: css('opacity', DUR.slow, EASE.standard, DUR.story),
            whiteSpace: 'nowrap',
          }}
        >
          {detectedStr}%
        </div>
      </div>
      <p
        className="mt-2"
        style={{
          fontFamily: "var(--font-serif)",
          fontSize: 12,
          color: 'var(--color-text-muted)',
          opacity: revealed ? 0.75 : 0,
          transition: css('opacity', DUR.story, EASE.standard, DUR.story + DUR.fast),
          textAlign: 'right',
        }}
      >
        {undetectedStr}% {undetectedLabel}.
      </p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Null — editorial empty state.
// ─────────────────────────────────────────────────────────────────────────────
function NullViz({ revealed, lang }: VizProps) {
  const msg = lang === 'es' ? 'ningún caso registrado.' : 'no cases on record.'
  return (
    <div
      className="relative flex items-center"
      style={{ height: 36, borderTop: '1px solid var(--color-border)', borderBottom: '1px solid var(--color-border)' }}
    >
      <div
        className="absolute left-0 top-1/2 -translate-y-1/2 rounded-full"
        style={{ width: 6, height: 6, background: 'var(--color-text-muted)', opacity: revealed ? 1 : 0, transition: css('opacity', DUR.slow) }}
      />
      <div
        className="w-full text-center"
        style={{
          fontFamily: "var(--font-serif)",
          fontSize: 16,
          color: 'var(--color-text-muted)',
          opacity: revealed ? 0.65 : 0,
          transition: css('opacity', DUR.story, EASE.standard, DUR.slow),
          letterSpacing: '0.02em',
        }}
      >
        {msg}
      </div>
    </div>
  )
}

function renderViz(template: VizTemplate, props: VizProps) {
  const family = TEMPLATE_FAMILY[template]
  switch (family) {
    case 'proportion': return <ProportionBandViz {...props} />
    case 'threshold':  return <ThresholdViz {...props} />
    case 'gauge':      return <GaugeViz {...props} />
    case 'sliver':     return <SliverViz {...props} />
    case 'null':       return <NullViz {...props} />
  }
}

function familyEyebrow(family: VizFamily, lang: 'en' | 'es'): string {
  const map: Record<VizFamily, [string, string]> = {
    proportion: ['SHARE OF TOTAL',     'PROPORCIÓN'],
    threshold:  ['VS. RECOMMENDED',    'VS. RECOMENDADO'],
    gauge:      ['POSITION ON SCALE',  'POSICIÓN'],
    sliver:     ['CONFIRMED VS REST',  'CONFIRMADO VS RESTO'],
    null:       ['EDITORIAL NOTE',     'NOTA EDITORIAL'],
  }
  return map[family][lang === 'es' ? 1 : 0]
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────
export default function DataPullquote({
  quote,
  attribution,
  stat: rawStat,
  statLabel,
  statColor = 'text-risk-critical',
  barValue,
  barLabel,
  barLabel_es,
  outlet,
  className,
  vizTemplate,
  role,
  sledgehammer = false,
}: DataPullquoteProps) {
  const { i18n } = useTranslation('common')
  const lang: 'en' | 'es' = i18n.language.startsWith('es') ? 'es' : 'en'
  const localizedBarLabel = lang === 'es' ? (barLabel_es ?? barLabel) : barLabel
  const stat = localizeAmount(rawStat, lang)
  const parsed = parseStatNumber(stat)
  const { ref: countRef, value: animatedValue } = useCountUp(
    parsed ? parsed.num : 0,
    1600,
    parsed ? parsed.decimals : 0
  )

  // Accent precedence (April 2026 fix): hex statColor > tailwind substring > outlet.
  // The hex is mapped onto palette v2 (storyInk) — precedence is unchanged.
  const accent = /^#[0-9a-f]{3,8}$/i.test(statColor)
    ? storyInk(statColor)
    : statColor.includes('red')   ? RISK_COLORS.critical
    : statColor.includes('amber') ? CATEGORICAL[6]
    : statColor.includes('blue')  ? CATEGORICAL[1]
    : outlet ? OUTLET_ACCENT[outlet]
    : CATEGORICAL[0]

  const { ref: vizRef, visible: revealed } = useReveal(0.2)
  const template = vizTemplate ?? autoSelectTemplate(barValue ?? 0, stat, localizedBarLabel)
  const family = TEMPLATE_FAMILY[template]
  const vizProps: VizProps = { value: barValue ?? 0, color: accent, label: localizedBarLabel, stat, revealed, lang }

  // Role resolution: explicit role wins; else legacy alias / content shape.
  const resolvedRole: PullquoteRole =
    role ?? (sledgehammer ? 'ledger' : barValue !== undefined ? 'plate' : 'margin')

  // PARALLAX D1 § Change 6: "ANALYSIS · MAY 2026" was a build date on a frozen
  // corpus. The data horizon is the true statement (dashboard Day-15 convention).
  const dateline = lang === 'es' ? 'Datos hasta sep 2025' : 'Data through Sep 2025'
  const sectionLabel = lang === 'es' ? 'Cifra · CompraNet' : 'Figure · CompraNet'
  const ariaLabel = lang === 'en' ? 'Data pull quote' : 'Cita con datos'

  const numStr = parsed
    ? `${animatedValue.toLocaleString('es-MX', {
        minimumFractionDigits: parsed.decimals,
        maximumFractionDigits: parsed.decimals,
      })}${parsed.suffix}`
    : stat

  // Shared stat number — Spectral 600 tabular, 28 max (DESIGN.md §2 fig) (only one renders per pullquote).
  // PARALLAX D1 § Change 7: the count-up span carried an aria-label on a
  // role-less element, so a screen reader could announce a mid-animation
  // number or nothing at all. The visual number is now hidden from the
  // a11y tree and the final figure is read from an sr-only sibling.
  const statNumber = (fontSize: string, extra?: React.CSSProperties) => (
    <>
    <span
      ref={countRef}
      aria-hidden="true"
      className="dpq-stat tabular-nums"
      style={{
        fontFamily: "var(--font-serif)",
        fontWeight: 600,
        fontSize,
        lineHeight: 1.1,
        fontVariantNumeric: 'lining-nums tabular-nums',
        letterSpacing: '-0.01em',
        color: accent,
        overflowWrap: 'anywhere',
        maxWidth: '100%',
        ...extra,
      }}
    >
      {numStr}
    </span>
    <span className="sr-only">{stat} {statLabel}</span>
    </>
  )

  // Shared viz block (plate + verdict). `withEyebrow` false when the tile's top
  // chrome already carries the family eyebrow.
  const vizBlock = (withEyebrow: boolean) =>
    barValue !== undefined ? (
      <div ref={vizRef} className="mt-3">
        {withEyebrow && (
          <div
            className="font-mono ct-sc mb-2.5"
            style={{ fontSize: 12, letterSpacing: '0.04em', color: 'var(--color-text-muted)' }}
          >
            {familyEyebrow(family, lang)}
          </div>
        )}
        <div role="img" aria-label={`${stat}${localizedBarLabel ? ` — ${localizedBarLabel}` : ''}`}>
          {renderViz(template, vizProps)}
        </div>
        {localizedBarLabel && (
          <p
            className="font-serif leading-[1.45]"
            style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: family === 'threshold' ? 20 : 10 }}
          >
            {localizedBarLabel}
          </p>
        )}
      </div>
    ) : null

  const containerStyle = (
    <style>{`
      .dpq-fig { container-type: inline-size; container-name: dpq; }
      @container dpq (max-width: 480px) {
        .dpq-pad     { padding-left: 16px; padding-right: 16px; }
        .dpq-pad-top { padding-top: 12px; padding-bottom: 8px; }
        .dpq-pad-bot { padding-bottom: 16px; }
        .dpq-chrome  { flex-direction: column; align-items: flex-start; gap: 4px; }
        .dpq-stat    { font-size: 24px !important; }
        .dpq-quote   { font-size: 0.92rem !important; line-height: 1.5; }
        .dpq-mstat   { flex-direction: column; align-items: flex-start; gap: 6px; }
      }
    `}</style>
  )

  // ─── Role: MARGIN — unboxed print pull-quote ───
  if (resolvedRole === 'margin') {
    return (
      <ScrollReveal className={cn('my-6', className)}>
        {containerStyle}
        <figure className="dpq-fig relative" role="figure" aria-label={ariaLabel}>
          {/* Top rule with a short accent segment at the left */}
          <div className="relative" style={{ height: 2 }}>
            <div className="absolute inset-x-0 top-1/2 -translate-y-1/2" style={{ height: 1, background: 'var(--color-border)' }} />
            <div className="absolute left-0 top-1/2 -translate-y-1/2" style={{ width: 28, height: 2, background: accent }} />
          </div>
          <div className="py-5">
            <blockquote
              className="dpq-quote"
              style={{
                fontFamily: 'var(--font-family-editorial)',
                        fontWeight: 500,
                fontSize: 'clamp(1.1rem, 2.6cqw, 1.3rem)',
                lineHeight: 1.45,
                color: 'var(--color-text-primary)',
              }}
            >
              &ldquo;{quote}&rdquo;
            </blockquote>
            <div className="dpq-mstat flex items-baseline gap-3 mt-4 flex-wrap">
              {statNumber('24px')}
              <span
                className="font-mono ct-sc"
                style={{ fontSize: 12, letterSpacing: '0.04em', color: 'var(--color-text-muted)' }}
              >
                {statLabel}
              </span>
            </div>
            {attribution && (
              <figcaption className="font-mono ct-sc text-text-muted mt-2" style={{ fontSize: 12, letterSpacing: '0.04em' }}>
                — {attribution}
              </figcaption>
            )}
          </div>
          <div style={{ height: 1, background: 'var(--color-border)' }} />
        </figure>
      </ScrollReveal>
    )
  }

  // ─── Role: VERDICT — centered closing figure ───
  if (resolvedRole === 'verdict') {
    return (
      <ScrollReveal className={cn('my-6', className)}>
        {containerStyle}
        <figure className="dpq-fig relative text-center" role="figure" aria-label={ariaLabel}>
          <div style={{ height: 1, background: 'var(--color-border)' }} />
          <div className="py-8 px-4">
            <div className="font-mono ct-sc" style={{ fontSize: 12, letterSpacing: '0.04em', color: 'var(--color-text-muted)' }}>
              {lang === 'es' ? 'El saldo · cifra final' : 'The balance · closing figure'}
            </div>
            <div className="flex justify-center mt-3">
              {statNumber('28px', { letterSpacing: '-0.01em' })}
            </div>
            <p
              className="font-mono ct-sc mx-auto mt-3"
              style={{ fontSize: 13, letterSpacing: '0.04em', color: 'var(--color-text-secondary)' }}
            >
              {statLabel}
            </p>
            <p
              className="mx-auto mt-4"
              style={{
                fontFamily: 'var(--font-family-editorial)',
                fontWeight: 500,
                fontSize: '1.05rem',
                color: 'var(--color-text-muted)',
                lineHeight: 1.5,
              }}
            >
              &ldquo;{quote}&rdquo;
            </p>
            {barValue !== undefined && (
              <div className="mx-auto mt-6 text-left" style={{ maxWidth: 320 }}>
                {vizBlock(false)}
              </div>
            )}
          </div>
          <div style={{ height: 1, background: 'var(--color-border)' }} />
        </figure>
      </ScrollReveal>
    )
  }

  // ─── Roles: LEDGER + PLATE — boxed tiles ───
  const isPlate = resolvedRole === 'plate'
  return (
    <ScrollReveal className={cn('my-6', className)}>
      {containerStyle}
      <figure
        className="dpq-fig relative overflow-hidden"
        style={{
          borderLeft: `3px solid ${accent}`,
          borderTop: '1px solid var(--color-text-primary)',
          borderBottom: '1px solid var(--color-border)',
        }}
        role="figure"
        aria-label={ariaLabel}
      >
        {/* Top chrome — ledger shows CIFRA · COMPRANET; plate shows the family eyebrow */}
        <div
          className="dpq-chrome dpq-pad dpq-pad-top flex items-center justify-between px-5 pt-4 pb-3 font-mono ct-sc"
          style={{ fontSize: 12, letterSpacing: '0.04em', color: 'var(--color-text-muted)' }}
        >
          <span>{isPlate ? familyEyebrow(family, lang) : sectionLabel}</span>
          <span aria-hidden>{dateline}</span>
        </div>

        <div className="dpq-pad dpq-pad-bot px-5 pb-5">
          {/* Number */}
          <div className="flex items-baseline gap-3 mb-3 pt-2">
            {statNumber(isPlate ? '24px' : '28px', { letterSpacing: '-0.01em' })}
          </div>

          {/* Label */}
          {isPlate ? (
            <p className="text-text-secondary text-sm leading-snug mb-4">{statLabel}</p>
          ) : (
            <p className="ct-sc mb-4" style={{ fontSize: 12, letterSpacing: '0.04em', color: textInk(accent) }}>
              {statLabel}
            </p>
          )}

          {/* Plate: viz between label and the demoted quote */}
          {isPlate && vizBlock(false)}

          {/* Hairline */}
          <div className="h-px w-full my-4" style={{ background: 'var(--color-border)' }} />

          {/* Quote — demoted below the number (both boxed roles) */}
          <blockquote
            className="text-text-muted mb-2"
            style={{
              fontFamily: "var(--font-serif)",
                    fontWeight: 400,
              fontSize: 'clamp(0.85rem, 1.4vw, 0.95rem)',
              lineHeight: 1.5,
              letterSpacing: '0.005em',
            }}
          >
            &ldquo;{quote}&rdquo;
          </blockquote>
          {attribution && (
            <figcaption className="font-mono ct-sc text-text-muted" style={{ fontSize: 12, letterSpacing: '0.04em' }}>
              — {attribution}
            </figcaption>
          )}
        </div>
      </figure>
    </ScrollReveal>
  )
}
