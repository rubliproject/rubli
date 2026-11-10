/**
 * CalibrationRecord — the model's test record by version (Methodology, «Cómo se probó»).
 *
 * The point: the headline AUC went DOWN on purpose. Early versions (v4.0/v5.0/v5.1) posted inflated
 * AUCs because training and test shared vendors and time windows; each later version changed the TEST
 * DESIGN, so the heights are not one series (REVIEW_2/owner 2026-10-29 «Sloppy»).
 *
 * Form (dataviz): discrete, non-comparable measurements → an ordinal strip of versions, grouped by test
 * design. One slot per version (no time axis, no axis break), a visible gap and a labelled header per
 * design, a line only inside the one design that has several points. Version and date sit under their
 * own point; the three February versions share one date. Every annotation lives in the design header
 * row, never on the data. v5.2 (an overlay, no AUC) and v0.9.1 (withdrawn: look-ahead) are in the
 * register below, not on the strip. 8px square marks, no <circle>; colours via style, never className.
 */
import { useTranslation } from 'react-i18next'
import { Plate } from './Plate'
import { MODEL_AUC } from '@/lib/constants'

type Kind = 'superseded' | 'overlay' | 'active'
type Design = 'weighted' | 'pooled' | 'stratified' | 'holdout' | 'chained' | 'none'

interface CalibrationEntry {
  version: string
  dateLabel: { en: string; es: string }
  /** evolution.steps.<key>Title — the register's one line */
  stepKey: string
  auc: number | null // null: v5.2 (overlay, no AUC) and v0.9.1 (withdrawn)
  /** the register's value cell when it is not a plain comparable AUC */
  note?: { en: string; es: string }
  kind: Kind
  /** The test design behind the AUC. Points are grouped and joined only within one design. */
  design: Design
}

const CALIBRATION_LOG: CalibrationEntry[] = [
  { version: 'v3.3', dateLabel: { en: 'Feb 2026', es: 'feb 2026' }, stepKey: 'v33', auc: 0.584, kind: 'superseded', design: 'weighted' },
  { version: 'v4.0', dateLabel: { en: 'Feb 2026', es: 'feb 2026' }, stepKey: 'v40', auc: 0.942, kind: 'superseded', design: 'pooled' },
  { version: 'v5.0', dateLabel: { en: 'Feb 2026', es: 'feb 2026' }, stepKey: 'v50', auc: 0.960, kind: 'superseded', design: 'pooled' },
  { version: 'v5.1', dateLabel: { en: 'Feb 27, 2026', es: '27 feb 2026' }, stepKey: 'v51', auc: 0.957, kind: 'superseded', design: 'pooled' },
  { version: 'v5.2', dateLabel: { en: 'Mar 7, 2026', es: '7 mar 2026' }, stepKey: 'v52', auc: null, note: { en: 'overlay · no AUC', es: 'capa · sin AUC' }, kind: 'overlay', design: 'none' },
  { version: 'v0.6.5', dateLabel: { en: 'Mar 25, 2026', es: '25 mar 2026' }, stepKey: 'v60', auc: 0.828, kind: 'superseded', design: 'stratified' },
  { version: 'v0.8.5', dateLabel: { en: 'May 2, 2026', es: '2 may 2026' }, stepKey: 'v85', auc: 0.656, kind: 'superseded', design: 'holdout' },
  { version: 'v0.9.1', dateLabel: { en: 'Oct 13, 2026', es: '13 oct 2026' }, stepKey: 'v91', auc: null, note: { en: '0.852 · withdrawn', es: '0.852 · retirado' }, kind: 'superseded', design: 'none' },
  { version: 'v0.9.2', dateLabel: { en: 'Oct 22, 2026', es: '22 oct 2026' }, stepKey: 'v92', auc: Number(MODEL_AUC), kind: 'active', design: 'chained' },
]

/** The design headers above the strip: what kind of test produced each group of numbers. */
const DESIGN_LABEL: Record<Exclude<Design, 'none'>, { en: string; es: string }> = {
  weighted: { en: 'fixed weights', es: 'pesos fijos' },
  pooled: { en: 'leaky split · not comparable', es: 'con fuga · no comparables' },
  stratified: { en: 'stratified', es: 'estratificada' },
  holdout: { en: 'holdout', es: 'reserva' },
  chained: { en: 'chained', es: 'encadenada' },
}

const INK = 'var(--color-text-primary)'
const MUTED = 'var(--color-text-muted)'
const SECOND = 'var(--color-text-secondary)'
const RULE = 'var(--color-border)'
const MONO = 'var(--font-family-mono, monospace)'

// Geometry (viewBox units; the svg renders at 660–760px, so 1 unit ≈ 1px)
const VW = 720
const PAD_L = 44
const PAD_R = 14
const GAP = 18 // the break between two test designs
const HEAD_Y = 14 // design header baseline
const CHART_TOP = 40 // AUC 1.0
const CHART_BOTTOM = 200 // AUC 0.5
const VH = CHART_BOTTOM + 44 // version + date rows
const AUC_MIN = 0.5
const AUC_MAX = 1.0
const X_END = VW - PAD_R
const yPos = (auc: number) => CHART_BOTTOM - ((auc - AUC_MIN) / (AUC_MAX - AUC_MIN)) * (CHART_BOTTOM - CHART_TOP)
const GRIDLINES = [0.6, 0.7, 0.8, 0.9]
/** «25 mar 2026» → «mar 2026», «Mar 25, 2026» → «Mar 2026»: the strip shows month and year. */
const shortDate = (d: string) => d.replace(/^\d+\s+/, '').replace(/\s\d+,/, '')

export default function CalibrationRecord({ className }: { className?: string }) {
  const { t, i18n } = useTranslation('methodology')
  const lang = i18n.language.startsWith('es') ? 'es' : 'en'

  // ordinal slots: one per plotted version, an extra GAP wherever the test design changes
  const plotted = CALIBRATION_LOG.filter((e) => e.auc !== null)
  const breaks = plotted.filter((e, i) => i > 0 && plotted[i - 1].design !== e.design).length
  const slot = (X_END - PAD_L - breaks * GAP) / plotted.length
  let gapsSoFar = 0
  const points = plotted.map((e, i) => {
    if (i > 0 && plotted[i - 1].design !== e.design) gapsSoFar += 1
    const left = PAD_L + i * slot + gapsSoFar * GAP
    return { ...e, x: left + slot / 2, left, right: left + slot, y: yPos(e.auc!) }
  })
  // contiguous design groups, for the headers, the dividers and the one line
  const groups: Array<{ design: Exclude<Design, 'none'>; pts: typeof points }> = []
  for (const p of points) {
    const g = groups[groups.length - 1]
    if (g && g.design === p.design) g.pts.push(p)
    else groups.push({ design: p.design as Exclude<Design, 'none'>, pts: [p] })
  }

  const plateCaption =
    lang === 'en'
      ? 'Plate III·a — test AUC by model version. Each group is its own test design, set apart by a gap; only versions tested the same way are joined, so the heights are not one series. v5.2 (an overlay) and v0.9.1 (withdrawn) have no comparable AUC: see the register.'
      : 'Lámina III·a — AUC de prueba por versión del modelo. Cada grupo es su propio diseño de prueba, separado por un espacio; solo se unen las versiones que se probaron igual, así que las alturas no forman una serie. v5.2 (una capa) y v0.9.1 (retirada) no tienen un AUC comparable: ver el registro.'

  const ariaLabel =
    lang === 'en'
      ? `Test AUC by model version, grouped by test design: ${points.map((p) => `${p.version} ${p.auc!.toFixed(3)}`).join(', ')}`
      : `AUC de prueba por versión, agrupado por diseño de prueba: ${points.map((p) => `${p.version} ${p.auc!.toFixed(3)}`).join(', ')}`

  return (
    <div className={className}>
      <Plate caption={plateCaption}>
        {/* headline | lede: the lede keeps a ~68ch measure and at most two numbers */}
        <div className="mt-cal-head">
          <p className="mt-cal-title">
            {lang === 'en' ? 'Our headline number went down on purpose.' : 'Nuestra cifra principal bajó a propósito.'}
          </p>
          <p className="mt-cal-lede">
            {lang === 'en'
              ? `The first versions looked near-perfect because training and test shared vendors. Each fix to the test design lowered the number; the current version is tested only on years it never saw: AUC ${MODEL_AUC}.`
              : `Las primeras versiones parecían casi perfectas porque entrenamiento y prueba compartían proveedores. Cada corrección del diseño de prueba bajó la cifra; la versión actual se prueba solo en años que no vio: AUC ${MODEL_AUC}.`}
          </p>
        </div>

        <div className="mt-cal-body">
        {/* the strip needs 660px for 12px type: phones read the register below it, which carries every value (the table view) */}
        <div className="hidden sm:block overflow-x-auto overscroll-x-contain" tabIndex={0} role="region" aria-label={lang === 'en' ? 'Test record chart' : 'Gráfica del historial de pruebas'}>
          <svg
            viewBox={`0 0 ${VW} ${VH}`}
            role="img"
            aria-label={ariaLabel}
            style={{ width: '100%', maxWidth: 760, minWidth: 660, height: 'auto', display: 'block' }}
          >
            {/* the leaky group sits on a tint: those numbers are inflated */}
            {groups.filter((g) => g.design === 'pooled').map((g) => (
              <rect key="tint" x={g.pts[0].left} y={CHART_TOP} width={g.pts[g.pts.length - 1].right - g.pts[0].left} height={CHART_BOTTOM - CHART_TOP} fill={INK} opacity={0.05} />
            ))}

            {/* gridlines + y labels */}
            {GRIDLINES.map((g) => (
              <g key={g}>
                <line x1={PAD_L} y1={yPos(g)} x2={X_END} y2={yPos(g)} stroke={RULE} strokeWidth={1} />
                <text x={PAD_L - 8} y={yPos(g) + 4} textAnchor="end" fontSize={12} fontFamily={MONO} fill={MUTED}>{g.toFixed(1)}</text>
              </g>
            ))}
            {/* chance: dashed baseline, its label inside the plot at the right, above the rule */}
            <line x1={PAD_L} y1={CHART_BOTTOM} x2={X_END} y2={CHART_BOTTOM} stroke={MUTED} strokeWidth={1} strokeDasharray="2 3" />
            <text x={X_END} y={CHART_BOTTOM - 6} textAnchor="end" fontSize={12} fontFamily={MONO} fill={MUTED}>
              {lang === 'en' ? 'chance 0.5' : 'azar 0.5'}
            </text>
            <text x={PAD_L - 8} y={CHART_BOTTOM + 4} textAnchor="end" fontSize={12} fontFamily={MONO} fill={MUTED}>0.5</text>

            {/* design headers + dividers: one annotation per idea, above the data */}
            {groups.map((g, gi) => {
              const x0 = g.pts[0].left
              const x1 = g.pts[g.pts.length - 1].right
              return (
                <g key={gi}>
                  <text x={(x0 + x1) / 2} y={HEAD_Y} textAnchor="middle" fontSize={12} fontFamily={MONO} fill={SECOND}>
                    {DESIGN_LABEL[g.design][lang]}
                  </text>
                  <line x1={x0 + 4} y1={HEAD_Y + 8} x2={x1 - 4} y2={HEAD_Y + 8} stroke={MUTED} strokeWidth={1} />
                  {gi > 0 && (
                    <line x1={x0 - GAP / 2} y1={HEAD_Y + 8} x2={x0 - GAP / 2} y2={CHART_BOTTOM} stroke={MUTED} strokeWidth={1} strokeDasharray="1 3" />
                  )}
                </g>
              )
            })}

            {/* the one line: inside a design only */}
            {groups.filter((g) => g.pts.length > 1).map((g) => (
              <path key={g.design} d={g.pts.map((p, i) => `${i ? 'L' : 'M'} ${p.x} ${p.y}`).join(' ')} fill="none" stroke={INK} strokeWidth={2} />
            ))}

            {/* marks, with the version and its date directly under each */}
            {points.map((p) => {
              const active = p.kind === 'active'
              const pooled = p.design === 'pooled'
              return (
                <g key={p.version}>
                  <title>{`${p.version} · ${p.dateLabel[lang]} · AUC ${p.auc!.toFixed(3)}`}</title>
                  <rect x={p.x - 4} y={p.y - 4} width={8} height={8} fill={INK} />
                  {active && (
                    <text x={p.x} y={p.y - 10} textAnchor="middle" fontSize={13} fontWeight={700} fontFamily={MONO} fill={INK}>
                      {p.auc!.toFixed(3)}
                    </text>
                  )}
                  <text x={p.x} y={CHART_BOTTOM + 18} textAnchor="middle" fontSize={13} fontWeight={active ? 700 : 500} fontFamily={MONO} fill={active ? INK : SECOND}>
                    {p.version}
                  </text>
                  {!pooled && (
                    <text x={p.x} y={CHART_BOTTOM + 34} textAnchor="middle" fontSize={12} fontFamily={MONO} fill={MUTED}>
                      {shortDate(p.dateLabel[lang])}
                    </text>
                  )}
                </g>
              )
            })}
            {/* the three February versions share one date */}
            {groups.filter((g) => g.design === 'pooled').map((g) => (
              <text key="pooled-date" x={(g.pts[0].left + g.pts[g.pts.length - 1].right) / 2} y={CHART_BOTTOM + 34} textAnchor="middle" fontSize={12} fontFamily={MONO} fill={MUTED}>
                {lang === 'en' ? 'Feb 2026' : 'feb 2026'}
              </text>
            ))}
          </svg>
        </div>

        {/* the register beside the strip: date · version · one line · AUC */}
        <dl className="mt-cal-reg">
          {CALIBRATION_LOG.map((e) => {
            const active = e.kind === 'active'
            return (
              <div key={e.version} data-active={active || undefined}>
                <dt>
                  <span className="mt-cal-date">{shortDate(e.dateLabel[lang])}</span>
                  <b>{e.version}</b>
                </dt>
                <dd>{t(`evolution.steps.${e.stepKey}Title`)}</dd>
                <dd className="mt-cal-val">{e.note ? e.note[lang] : e.auc!.toFixed(3)}</dd>
              </div>
            )
          })}
        </dl>
        </div>
      </Plate>
    </div>
  )
}

export { CalibrationRecord }
