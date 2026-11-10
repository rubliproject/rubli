/**
 * BalanzaLedger — «La Balanza» (the evidentiary balance), Part II centerpiece
 * of /methodology's «El Dictamen» redesign.
 *
 * Named precedent: FT Visual Vocabulary *diverging bar* — signed effects on a
 * shared zero spine — rendered in engraving vocabulary (45° hatch bands,
 * terminal ticks, ruled rows), not SaaS bars. Replaces the banned dot-matrix
 * `CoefficientChart` (18 animated circles). Zero <circle> elements here.
 *
 * v0.9.2 · Run CAL-v92-asof-20261022 · C=0.00373, l1_ratio=0.919, Stage-4b T=0.530,
 * c_pu=0.436 — betas are the scorer's betas_raw (raw units, T folded in), exactly what prod
 * serves at /api/v1/analysis/model/calibration (read 2026-11-03; MODEL_CARD_v0.9.2 § 1
 * correction 2026-10-30). The 10-23 ledger showed T × standardised betas, which no API serves.
 *
 * Design spec: .claude/designs/methodology-fable-2026-07-02-spec.md §4.1
 */

import { useId, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Plate } from './Plate'
import { RISK_COLORS, textInk } from '@/lib/constants'

// ── Data — the 17 v0.9.2 coefficients, exact signs and 3-decimal values ────
// Sorted below by |β| desc for the ledger field; the one exact zero (yearEnd)
// renders in the morgue sub-register. v0.9.1's other ten features are not in
// v0.9.2 (dropped in the as-of rebuild; see body.features.p1).
interface Coefficient {
  key: string
  beta: number
}

const COEFFICIENTS: Coefficient[] = [
  { key: 'priceVolatility', beta: 0.811 },
  { key: 'instHhiPrior', beta: 0.771 },
  { key: 'institutionsServedPrior', beta: 0.592 },
  { key: 'priceRatio', beta: 0.456 },
  { key: 'cobidHerfindahl', beta: -0.304 },
  { key: 'sectorSpread', beta: -0.187 },
  { key: 'vendorConcentration', beta: 0.173 },
  { key: 'networkMembers', beta: 0.111 },
  { key: 'sameDayContracts', beta: 0.094 },
  { key: 'partidaPriceResidual', beta: 0.089 },
  { key: 'singleBid', beta: 0.072 },
  { key: 'recencyZ', beta: -0.066 },
  { key: 'directAward', beta: 0.049 },
  { key: 'partidaSingleBid', beta: -0.048 },
  { key: 'winRate', beta: 0.012 },
  { key: 'partidaDirectAward', beta: -0.004 },
  { key: 'yearEnd', beta: 0.0 },
]

const NONZERO = COEFFICIENTS.filter((c) => c.beta !== 0).sort(
  (a, b) => Math.abs(b.beta) - Math.abs(a.beta),
)
const ZEROED = COEFFICIENTS.filter((c) => c.beta === 0)

const AXIS_MAX = 0.85
const INK_SECONDARY = 'var(--color-text-secondary)'
const CHARGE_COLOR = RISK_COLORS.high // #f59e0b — the "charge" (positive) hatch

// Format a signed beta with a TRUE minus sign and three decimals.
function formatBeta(v: number): string {
  const abs = Math.abs(v).toFixed(3)
  if (v > 0) return `+${abs}`
  if (v < 0) return `−${abs}` // U+2212 minus sign
  return '0.000'
}

// ── HatchBar — small reusable hatch-band bar, exported for Annex B ─────────
export interface HatchBarProps {
  value: number
  max: number
  color: string
  /** bar height in px, default 8 */
  height?: number
}

/** A single fixed-height SVG hatch band, width scaled to value/max. No text. */
export function HatchBar({ value, max, color, height = 8 }: HatchBarProps) {
  const patternId = `hatchbar-${color.replace('#', '')}-${useId().replace(/:/g, '')}`
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0
  const widthPct = pct * 100
  return (
    <svg
      viewBox="0 0 100 10"
      preserveAspectRatio="none"
      style={{ width: '100%', height, display: 'block' }}
      aria-hidden="true"
    >
      <defs>
        <pattern
          id={patternId}
          width={3}
          height={3}
          patternTransform="rotate(45)"
          patternUnits="userSpaceOnUse"
        >
          <rect width={3} height={3} fill={color} fillOpacity={0.16} />
          <line x1={0} y1={0} x2={0} y2={3} stroke={color} strokeWidth={1.4} />
        </pattern>
      </defs>
      <rect x={0} y={1} width={widthPct} height={8} fill={`url(#${patternId})`} />
      <rect x={0} y={1} width={widthPct} height={8} fill="none" stroke={color} strokeOpacity={0.55} strokeWidth={0.5} />
      {widthPct > 0 && (
        <rect x={Math.max(0, widthPct - 0.6)} y={0} width={0.8} height={10} fill={color} />
      )}
    </svg>
  )
}

// ── Ledger geometry (SVG coordinates) ───────────────────────────────────────
const FIELD_W = 720
const GUTTER_W = 152
// PARALLAX D2b § Change 2: reserve room right of the widest charge bar for its
// terminal value. Without it +0.558 ran past the viewBox edge and was clipped.
const VALUE_PAD = 60
const HALF_W = (FIELD_W - GUTTER_W - VALUE_PAD) / 2
const SPINE_X = GUTTER_W + HALF_W
const ROW_H = 26
const FIELD_TOP = 40
const FIELD_BOTTOM = FIELD_TOP + NONZERO.length * ROW_H
const AXIS_Y = FIELD_BOTTOM + 26
// The axis caption sits 20 below the tick row (6 more than before): at 13px the
// two text boxes overlapped by ~2px once the spine moved left and the "0" tick
// landed inside the caption's span. The morgue follows it down. (D2b § Change 2)
const AXIS_CAPTION_Y = AXIS_Y + 20
const MORGUE_TOP = AXIS_Y + 44
const MORGUE_ROW_H = 18
const MORGUE_BOTTOM = MORGUE_TOP + ZEROED.length * MORGUE_ROW_H + 10
const SVG_H = MORGUE_BOTTOM + 16

function xFor(beta: number): number {
  const clamped = Math.max(-AXIS_MAX, Math.min(AXIS_MAX, beta))
  return SPINE_X + (clamped / AXIS_MAX) * HALF_W
}

// Ticks for the symmetric axis −0.60…+0.60, labeled at the spec'd intervals.
const AXIS_TICKS = [-0.4, -0.2, 0, 0.2, 0.4]

const SERIF = { fontFamily: 'var(--font-serif)' } as const

/** `aside` (the page's findings) sits beside the ledger with the reading key (2026-10-20 compaction). */
export function BalanzaLedger({ className, aside }: { className?: string; aside?: ReactNode }) {
  const { t, i18n } = useTranslation('methodology')
  const lang = i18n.language.startsWith('es') ? 'es' : 'en'

  const headline =
    lang === 'en'
      ? 'Uneven contract sizes and prior buyer concentration accuse. Co-award concentration defends.'
      : 'Los montos muy dispares y la concentración de compradores acusan. La concentración de socios defiende.'
  const dek =
    lang === 'en'
      ? '17 as-of features, 16 of them carrying weight; each weight is in its feature’s own units'
      : '17 características a la fecha, 16 de ellas con peso; cada peso va en las unidades de su variable'
  const colLeft = lang === 'en' ? 'Defense: lowers the indicator' : 'Descargo: reduce el indicador'
  const colRight = lang === 'en' ? 'Charge: raises the indicator' : 'Cargo: eleva el indicador'
  const axisCaption = lang === 'en' ? 'ElasticNet coefficient β' : 'Coeficiente ElasticNet β'
  const morgueLabel =
    lang === 'en'
      ? 'Regularized to exactly zero: no signal'
      : 'Reguladas a exactamente cero: sin señal'
  const plateCaption =
    lang === 'en'
      ? 'Plate II — the seventeen coefficients of model v0.9.2, drawn as a ledger of charge and defense. Hatching right of the spine raises the risk indicator; left of the spine lowers it.'
      : 'Lámina II — los diecisiete coeficientes del modelo v0.9.2, dibujados como libro de cargo y descargo. El rayado a la derecha del eje eleva el indicador de riesgo; a la izquierda lo reduce.'
  const ariaLabel =
    lang === 'en'
      ? 'Diverging ledger of the 17 model coefficients: positive values raise the risk indicator, negative values lower it'
      : 'Libro de cargos y descargos: los 17 coeficientes del modelo; valores positivos elevan el indicador de riesgo, negativos lo reducen'

  return (
    <div className={className}>
      <Plate caption={plateCaption}>
        {/* Plate headline + dek */}
        <div className="mb-4">
          <h3
            className="text-text-primary"
            style={{
              fontFamily: 'var(--font-family-editorial)',
              fontStyle: 'normal',
              fontWeight: 500,
              fontSize: 'clamp(19px, 2.6vw, 24px)',
              lineHeight: 1.25,
            }}
          >
            {headline}
          </h3>
          <p
            className="mt-1.5 text-text-muted"
            style={{ ...SERIF, fontSize: '14px' }}
          >
            {dek}
          </p>
        </div>

        <div className="mt-balanza">
        <figure aria-label={ariaLabel} className="mt-bal-wide">
          {/* PARALLAX D2b § Change 1: cap the rendered scale. At `w-full` inside
              a 1440 viewport the plate stretched to ~1040px, so a 13px viewBox
              unit printed at ~18.8px. Capped at 760 the same unit stays ≤13.7px;
              below the 620 floor (a 1440 two-column half is ~656) it scrolls rather than
              shrinking the type under the 10px legibility floor. */}
          <div className="overflow-x-auto overscroll-x-contain" tabIndex={0}>
            <svg
              viewBox={`0 0 ${FIELD_W} ${SVG_H}`}
              style={{ width: '100%', maxWidth: 760, minWidth: 620, height: 'auto' }}
              role="img"
              aria-label={ariaLabel}
            >
            <defs>
              <pattern
                id="balanza-charge-hatch"
                width={3}
                height={3}
                patternTransform="rotate(45)"
                patternUnits="userSpaceOnUse"
              >
                <rect width={3} height={3} fill={CHARGE_COLOR} fillOpacity={0.16} />
                <line x1={0} y1={0} x2={0} y2={3} stroke={CHARGE_COLOR} strokeWidth={1.4} />
              </pattern>
              <pattern
                id="balanza-defense-hatch"
                width={3}
                height={3}
                patternTransform="rotate(45)"
                patternUnits="userSpaceOnUse"
              >
                <rect width={3} height={3} fill={INK_SECONDARY} fillOpacity={0.14} />
                <line x1={0} y1={0} x2={0} y2={3} stroke={INK_SECONDARY} strokeWidth={1.4} />
              </pattern>
            </defs>

            {/* Column heads — anchored to the spine, reading outward. Anchored
                to the field edges they ran toward each other and met at the
                spine; at 13px they also outgrew the plate. (D2b § Change 2) */}
            <text
              x={SPINE_X - 8}
              y={20}
              fill={INK_SECONDARY}
              fontSize={12}
              style={SERIF}
              fontWeight={600}
              textAnchor="end"
            >
              {colLeft}
            </text>
            <text
              x={SPINE_X + 8}
              y={20}
              fill={CHARGE_COLOR}
              fontSize={12}
              style={SERIF}
              fontWeight={600}
              textAnchor="start"
            >
              {colRight}
            </text>

            {/* Zero spine */}
            <line
              x1={SPINE_X}
              y1={FIELD_TOP - 6}
              x2={SPINE_X}
              y2={FIELD_BOTTOM + 6}
              stroke="var(--color-text-primary)"
              strokeWidth={1.5}
            />

            {/* Ledger field — 12 non-zero rows */}
            {NONZERO.map((c, i) => {
              const rowY = FIELD_TOP + i * ROW_H
              const rowMidY = rowY + ROW_H / 2
              const barY = rowMidY - 4
              const x = xFor(c.beta)
              const isPositive = c.beta > 0
              const barX = isPositive ? SPINE_X : x
              const barW = Math.abs(x - SPINE_X)
              const fill = isPositive ? 'url(#balanza-charge-hatch)' : 'url(#balanza-defense-hatch)'
              const strokeColor = isPositive ? CHARGE_COLOR : INK_SECONDARY
              const label = t(`featureNames.${c.key}`)
              return (
                <g key={c.key}>
                  {/* row rule */}
                  <line
                    x1={0}
                    y1={rowY + ROW_H}
                    x2={FIELD_W}
                    y2={rowY + ROW_H}
                    stroke="var(--color-border)"
                    strokeWidth={0.75}
                  />
                  {/* feature name in the left gutter */}
                  <text
                    x={0}
                    y={rowMidY + 3.5}
                    fill="var(--color-text-primary)"
                    fontSize={13}
                    style={SERIF}
                  >
                    {label}
                  </text>
                  {/* hatch band */}
                  <rect x={barX} y={barY} width={Math.max(barW, 0.5)} height={8} fill={fill} />
                  <rect
                    x={barX}
                    y={barY}
                    width={Math.max(barW, 0.5)}
                    height={8}
                    fill="none"
                    stroke={strokeColor}
                    strokeOpacity={0.55}
                    strokeWidth={0.5}
                  />
                  {/* terminal tick */}
                  <rect
                    x={x - 0.75}
                    y={barY - 1}
                    width={1.5}
                    height={10}
                    fill={strokeColor}
                  />
                  {/* exact signed value at terminal */}
                  <text
                    x={isPositive ? x + 6 : x - 6}
                    y={rowMidY + 3.5}
                    fill={strokeColor}
                    fontSize={12}
                    fontWeight={600}
                    style={{ fontFamily: 'var(--font-family-mono)' }}
                    textAnchor={isPositive ? 'start' : 'end'}
                    className="tabular-nums"
                  >
                    {formatBeta(c.beta)}
                  </text>
                </g>
              )
            })}

            {/* Axis */}
            <line x1={0} y1={AXIS_Y - 10} x2={FIELD_W} y2={AXIS_Y - 10} stroke="var(--color-border)" strokeWidth={0.75} />
            {AXIS_TICKS.map((tick) => {
              const x = xFor(tick)
              return (
                <g key={tick}>
                  <line x1={x} y1={AXIS_Y - 14} x2={x} y2={FIELD_TOP - 6} stroke="var(--color-border)" strokeWidth={0.5} strokeDasharray="1.5 3" />
                  <text
                    x={x}
                    y={AXIS_Y}
                    fill="var(--color-text-muted)"
                    fontSize={13}
                    style={{ fontFamily: 'var(--font-family-mono)' }}
                    textAnchor="middle"
                    className="tabular-nums"
                  >
                    {tick > 0 ? `+${tick.toFixed(1)}` : tick < 0 ? `−${Math.abs(tick).toFixed(1)}` : '0'}
                  </text>
                </g>
              )
            })}
            <text
              x={FIELD_W / 2}
              y={AXIS_CAPTION_Y}
              fill="var(--color-text-muted)"
              fontSize={13}
              style={SERIF}
              textAnchor="middle"
            >
              {axisCaption}
            </text>

            {/* Zero morgue */}
            <line x1={0} y1={MORGUE_TOP - 14} x2={FIELD_W} y2={MORGUE_TOP - 14} stroke="var(--color-text-primary)" strokeWidth={1} />
            <text
              x={0}
              y={MORGUE_TOP - 2}
              fill="var(--color-text-muted)"
              fontSize={13}
              fontWeight={600}
              letterSpacing=".04em"
              style={SERIF}
            >
              {morgueLabel}
            </text>
            {ZEROED.map((c, i) => {
              const rowY = MORGUE_TOP + 10 + i * MORGUE_ROW_H
              const label = t(`featureNames.${c.key}`)
              return (
                <g key={c.key}>
                  <text
                    x={0}
                    y={rowY + 4}
                    fill="var(--color-text-muted)"
                    fontSize={13}
                    style={SERIF}
                  >
                    {label}
                  </text>
                  <rect x={SPINE_X - 3} y={rowY} width={6} height={1.5} fill="var(--color-text-muted)" />
                  <text
                    x={FIELD_W}
                    y={rowY + 4}
                    fill="var(--color-text-muted)"
                    fontSize={12}
                    style={{ fontFamily: 'var(--font-family-mono)' }}
                    textAnchor="end"
                    className="tabular-nums"
                  >
                    β = 0.000
                  </text>
                </g>
              )
            })}
            </svg>
          </div>
        </figure>

        {/* The phone ledger (≤ 760 px): the same coefficients as HTML rows, name and value on one
            line, the signed bar under it on the shared spine. The SVG needs ~660 px to keep 12 px type,
            so on a phone it would scroll and hide one side (review 2026-10-29). */}
        <div className="mt-bal-phone">
          <p className="mt-bal-key">
            <span style={{ color: INK_SECONDARY }}>← {colLeft}</span>
            <span style={{ color: textInk(CHARGE_COLOR) }}>{colRight} →</span>
          </p>
          <ol>
            {NONZERO.map((c) => {
              const w = (Math.min(Math.abs(c.beta), AXIS_MAX) / AXIS_MAX) * 50
              const color = c.beta > 0 ? CHARGE_COLOR : INK_SECONDARY
              return (
                <li key={c.key}>
                  <span>{t(`featureNames.${c.key}`)}</span>
                  <span className="mt-bal-v" style={{ color: textInk(color) }}>{formatBeta(c.beta)}</span>
                  <span className="mt-bal-track" aria-hidden="true">
                    <span style={{ ['--c' as string]: color, width: `${w}%`, [c.beta > 0 ? 'left' : 'right']: '50%' }} />
                  </span>
                </li>
              )
            })}
          </ol>
          <p className="mt-bal-zero">{morgueLabel}: {ZEROED.map((c) => t(`featureNames.${c.key}`)).join(', ')}</p>
        </div>

        <div>
        {aside}
        </div>
        </div>
        {/* Footer note — existing key, verbatim, both locales */}
        <p
          className="mt-3 text-text-muted"
          style={{ ...SERIF, fontSize: '13px', lineHeight: 1.5 }}
        >
          {t('body.features.footerNote')}
        </p>
      </Plate>
    </div>
  )
}

export default BalanzaLedger
