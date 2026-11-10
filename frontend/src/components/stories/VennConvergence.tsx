/**
 * VennConvergence — Ch.4 of "Volatilidad" story.
 *
 * Two overlapping ellipses representing:
 *   - Supervised model (RUBLI v0.9.1 logistic regression, high + critical)
 *   - Unsupervised PyOD anomaly ensemble (ensemble_anomaly_score >= 0.2598,
 *     the /analysis/pyod-agreement threshold)
 * The overlap region shows the 150,727 contracts both flag (measured on the
 * register 2026-10-14; was an illustrative 4,200 under v0.8.5).
 *
 * 2026-06-15: brought into the cream editorial system — wraps the SVG in
 * the shared `ChartCard` shell and recolors the overlap labels (were hard
 * white for a dark card) for the light background.
 *
 * 2026-07-03: mobile-first remake ("Convergence Docket" — Proposal 3).
 * HTML owns every glyph, SVG owns geometry only: the SVG's only text is
 * the hero '4,200' + 'AMBOS'/'BOTH' word, both centered in the overlap
 * lens. All method names, side counts, and qualifiers move to a 3-cell
 * HTML register below the SVG (one cell per lobe, in drawing order:
 * blue / red-overlap / gray), so nothing can collide or clip at 360px —
 * the register cells are block-level siblings, not co-located SVG text.
 * The ChartCard now also carries the missing anchor stat.
 *
 * Self-contained: hardcoded counts, measured 2026-10-14 against v0.9.1
 * (302,640 high+ · 271,763 anomaly-flagged · 150,727 both, of 3,051,294).
 */
import { SECTOR_COLORS } from '@/lib/constants'
import { ChartCard } from './InlineCharts'

interface Props {
  lang?: 'en' | 'es'
}

export function VennConvergence({ lang = 'es' }: Props) {
  // Compact viewBox — geometry only, scaled toward real render width so a
  // single surviving hero mark never drops below readable size at 360px.
  const W = 340


  const accent  = SECTOR_COLORS.salud       // #dc2626 — overlap zone
  const blueHex = SECTOR_COLORS.educacion   // #3b82f6 — supervised
  const grayHex = SECTOR_COLORS.otros       // #64748b — unsupervised

  // Ellipse geometry (same 0.38 / 0.62 proportions as before)
  const CX_LEFT  = 136
  const CX_RIGHT = 204
  const CY       = 104
  const RX       = 88
  const RY       = 62

  const OVERLAP_CONTRACTS = '150,727'

  const title = lang === 'es'
    ? 'Dos algoritmos convergen: los mismos 150,727 contratos'
    : 'Two algorithms agree: the same 150,727 contracts'
  const annotation = lang === 'es'
    ? 'Validación cruzada medida — dos métodos independientes (RUBLI v0.9.1, regresión logística supervisada, riesgo alto o crítico + ensemble PyOD de detección de anomalías no supervisada, puntaje ≥ 0.2598), sin etiquetas de entrenamiento compartidas. De 3,051,294 contratos calificados, ambos marcan 150,727.'
    : 'Measured cross-model validation — two independent methods (RUBLI v0.9.1 supervised logistic regression, high or critical + PyOD unsupervised anomaly ensemble, score ≥ 0.2598), with no shared training labels. Of 3,051,294 scored contracts, both flag 150,727.'

  const anchor = {
    value: '150,727',
    label: lang === 'es'
      ? 'contratos señalados por ambos algoritmos'
      : 'contracts flagged by both algorithms',
    color: accent,
  }

  // Register cells — drawing order: blue lobe, red overlap, gray lobe.
  const cells: Array<{
    color: string
    name: string
    count: string
    qualifier: string
    subline: string
  }> = [
    {
      color: blueHex,
      name: lang === 'es' ? 'MODELO SUPERVISADO' : 'SUPERVISED MODEL',
      count: '151,913',
      qualifier: lang === 'es' ? 'solo modelo' : 'model-only',
      subline: lang === 'es'
        ? 'RUBLI v0.9.1 · regresión logística'
        : 'RUBLI v0.9.1 · logistic regression',
    },
    {
      color: accent,
      name: lang === 'es' ? 'AMBOS ALGORITMOS' : 'BOTH ALGORITHMS',
      count: OVERLAP_CONTRACTS,
      qualifier: lang === 'es' ? 'señalados por ambos' : 'flagged by both',
      subline: lang === 'es'
        ? 'sin etiquetas compartidas · misma señal'
        : 'no shared labels · same signal',
    },
    {
      color: grayHex,
      name: lang === 'es' ? 'DETECCIÓN DE ANOMALÍAS' : 'ANOMALY DETECTION (PYOD)',
      count: '121,036',
      qualifier: lang === 'es' ? 'solo PyOD' : 'PyOD-only',
      subline: lang === 'es'
        ? 'ensemble PyOD · no supervisado'
        : 'PyOD ensemble · unsupervised',
    },
  ]

  return (
    <ChartCard
      title={title}
      eyebrow="MODEL CONVERGENCE · 2 METHODS"
      annotation={annotation}
      anchor={anchor}
    >
      <svg
        viewBox={`0 ${CY - RY - 6} ${W} ${2 * (RY + 6)}`}
        preserveAspectRatio="xMidYMid meet"
        className="block w-full max-w-[420px] sm:max-w-[560px] mx-auto"
        aria-hidden="true"
      >
        {/* Left ellipse — supervised model (blue) */}
        <ellipse
          cx={CX_LEFT}
          cy={CY}
          rx={RX}
          ry={RY}
          fill={blueHex}
          fillOpacity={0.16}
          stroke={blueHex}
          strokeWidth={1.5}
          strokeOpacity={0.7}
        />

        {/* Right ellipse — IForest (gray) */}
        <ellipse
          cx={CX_RIGHT}
          cy={CY}
          rx={RX}
          ry={RY}
          fill={grayHex}
          fillOpacity={0.16}
          stroke={grayHex}
          strokeWidth={1.5}
          strokeOpacity={0.7}
        />

        {/* Overlap highlight — clip the right ellipse to the left's shape */}
        <clipPath id="venn-left-clip">
          <ellipse cx={CX_LEFT} cy={CY} rx={RX} ry={RY} />
        </clipPath>
        <ellipse
          cx={CX_RIGHT}
          cy={CY}
          rx={RX}
          ry={RY}
          fill={accent}
          fillOpacity={0.28}
          clipPath="url(#venn-left-clip)"
        />
        <ellipse
          cx={CX_RIGHT}
          cy={CY}
          rx={RX}
          ry={RY}
          fill="none"
          stroke={accent}
          strokeWidth={1.5}
          strokeOpacity={0.6}
          clipPath="url(#venn-left-clip)"
        />

        {/* Overlap center — the ONLY in-SVG text: hero number + one word */}
        <text x={170} y={CY - 2} fontSize={25}
          fontFamily="var(--font-serif)" fontStyle="normal" fontWeight="600"
          fill={accent} textAnchor="middle">
          {OVERLAP_CONTRACTS}
        </text>
        <text x={170} y={CY + 16} fontSize={12} fontFamily="monospace"
          fontWeight="700" fill="var(--color-text-primary)" textAnchor="middle">
          {lang === 'es' ? 'AMBOS' : 'BOTH'}
        </text>
      </svg>

      {/* HTML register — every glyph lives here, one full-width cell per
          lobe on mobile, three cells under their lobes on ≥sm */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
        {cells.map((cell) => (
          <div key={cell.name} style={{ borderTop: `2px solid ${cell.color}` }} className="pt-2">
            <div
              className="font-mono text-[12px] font-bold ct-sc"
              style={{ color: cell.color }}
            >
              {cell.name}
            </div>
            <div
              className="tabular-nums"
              style={{
                color: cell.color,
                fontFamily: 'var(--font-serif)',
                fontWeight: 600,
                fontSize: '1.25rem',
              }}
            >
              {cell.count}
            </div>
            <div className="font-mono text-xs text-text-muted">
              {cell.qualifier}
            </div>
            <div className="font-mono text-xs text-text-muted">
              {cell.subline}
            </div>
          </div>
        ))}
      </div>
    </ChartCard>
  )
}

export default VennConvergence
