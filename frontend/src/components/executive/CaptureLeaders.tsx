/**
 * CaptureLeaders — Hallazgo «Captura institucional» on the Contrato grammar
 * (FIX_BRIEF_R1 § C.3): the same clause as the ghost-economy hallazgo — heading +
 * prose left (7fr), the live P6 count as a `fig` + a Cleveland pair per capture
 * leader right (5fr). Filled dot = top vendor share, open dot = second; the gap
 * readout carries the number. The row is one <Link> to the P6 queue; the pairs are
 * not interactive, so nothing nests inside the link. Unboxed: no card, no shadow.
 */
import { useRef } from 'react'
import { Link } from 'react-router-dom'
import type { CaptureLeadersResponse } from '@/api/types'
import { formatNumber } from '@/lib/utils'
import { DATA_CUT_YEAR } from '@/lib/constants'
import { formatEntityName } from '@/lib/entity/format'
import { useMeasuredWidth } from '@/hooks/useMeasuredWidth'
import { tidyNodes } from '@/lib/typography'
import { Reveal } from '@/components/contrato/Reveal'

export function CaptureLeaders({ lang, leaders, p6Count, loading = false }: {
  lang: 'en' | 'es'
  /** The bundle is still in flight: hold the pairs' room instead of printing the empty note. */
  loading?: boolean
  leaders: CaptureLeadersResponse['leaders'] | undefined
  /** Live P6 vendor count (aria_stats.pattern_counts.P6); null prints «—», never a typed fallback. */
  p6Count: number | null
}) {
  const en = lang === 'en'
  // The pairs measure their column and draw at 1:1; names stack above the track below 400px.
  const rowsBox = useRef<HTMLDivElement>(null)
  const Wc = useMeasuredWidth(rowsBox)
  const rows = leaders ?? []
  const stacked = Wc < 400
  const NAME_W = 240
  const GAP_W = 64 // +NN.Npp readout column
  const SVG_W = Math.max(60, stacked ? Wc - GAP_W - 8 : Wc - NAME_W - GAP_W - 16)
  const PAD = 6
  const xPos = (pct: number) => PAD + (pct / 100) * (SVG_W - 2 * PAD)
  const ROW_H = 16
  const fmtPp = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))
  return (
    <article>
      <Link to="/aria?pattern=P6" className={`ct-hallazgo group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-primary focus-visible:ring-offset-2${!loading && !rows.length ? ' is-stacked' : ''}`}>
        <div>
          <h3 className="ct-hz-h">
            <span className="ct-sc">{en ? 'Institutional capture.' : 'Captura institucional.'}</span>{' '}
            {tidyNodes(en ? 'One vendor locks one institution, year after year, with no competition.' : 'Un proveedor captura una institución, año tras año, sin competencia.', lang)}
          </h3>
          <p className="ct-hz-p">
            {en
              ? <>One vendor controls 80% or more of one institution’s category budget for five or more years. RUBLI calls this <span className="ct-mono">P6</span>, capture: a monopoly built inside a single agency, often invisible at the national level.</>
              : <>Un proveedor controla 80% o más del presupuesto de una categoría dentro de una institución durante cinco o más años. RUBLI lo llama <span className="ct-mono">P6</span>, captura: un monopolio construido dentro de una sola dependencia, frecuentemente invisible a nivel nacional.</>}
          </p>
          <p className="ct-hz-p">
            {en
              ? 'P6 capture differs from national monopoly: abnormal concentration in one agency with above-threshold risk. Detectable only through cross-institution comparison.'
              : 'La captura P6 difiere del monopolio nacional: concentración anormal en una sola agencia con riesgo por encima del umbral. Solo detectable comparando entre instituciones.'}
          </p>
          <p className="ct-foot">
            {en ? `Source: ARIA pattern P6 over CompraNet + ComprasMX 2002–${DATA_CUT_YEAR}, category budget per institution.` : `Fuente: patrón ARIA P6 sobre CompraNet + ComprasMX 2002–${DATA_CUT_YEAR}, presupuesto por categoría en cada institución.`}
          </p>
        </div>
        <div>
          <div className="ct-figline">
            <span className="ct-fig">{p6Count == null ? '—' : formatNumber(p6Count)}</span>
            <span className="ct-note">{en ? 'vendors fit the P6 fingerprint' : 'proveedores con la huella P6'}</span>
          </div>
          <Reveal className="ct-pairs-wrap"><div ref={rowsBox} className="ct-pairs" style={{ minHeight: loading && !rows.length ? 5 * 24 : undefined }}>
            {!loading && !rows.length && (
              <span className="ct-note" style={{ marginTop: 0 }}>{en ? 'The capture leaders are not available from the live API right now.' : 'Los líderes de captura no están disponibles en la API en vivo por ahora.'}</span>
            )}
            {Wc > 0 && rows.map((inst) => {
              const gap = inst.top - inst.second
              const ink = inst.captured ? 'var(--color-text-primary)' : 'var(--color-text-muted)'
              return (
                <div
                  key={inst.label}
                  className={stacked ? 'ct-pair is-stacked' : 'ct-pair'}
                  style={{ ['--d' as string]: `${Math.min(rows.indexOf(inst) * 40, 300)}ms` }}
                  title={en ? `top vendor ${inst.top}% · second ${inst.second}%` : `proveedor 1 ${inst.top}% · proveedor 2 ${inst.second}%`}
                >
                  <span className="ct-pair-name" style={{ width: stacked ? undefined : NAME_W, color: ink, fontWeight: inst.captured ? 600 : 400 }}>
                    {formatEntityName('institution', inst.institution_name || inst.label, 'full')}
                  </span>
                  <span className="ct-pair-plot">
                    <svg width={SVG_W} height={ROW_H} viewBox={`0 0 ${SVG_W} ${ROW_H}`} data-figure="dumbbell" aria-hidden="true" style={{ flexShrink: 0, overflow: 'visible' }}>
                      <line x1={PAD} x2={SVG_W - PAD} y1={ROW_H / 2} y2={ROW_H / 2} stroke="var(--color-border)" strokeWidth={1} />
                      <line x1={xPos(inst.second)} x2={xPos(inst.top)} y1={ROW_H / 2} y2={ROW_H / 2} stroke={ink} strokeWidth={1.5} />
                      <circle cx={xPos(inst.second)} cy={ROW_H / 2} r={4} fill="var(--color-background)" stroke={ink} strokeWidth={1.25} />
                      <circle cx={xPos(inst.top)} cy={ROW_H / 2} r={4.5} fill={ink} />
                    </svg>
                    <span className="ct-mono ct-pair-val" style={{ width: GAP_W, color: ink }}>+{fmtPp(gap)}pp</span>
                  </span>
                  <span className="sr-only">{en ? `top vendor ${inst.top}%, second ${inst.second}%` : `proveedor 1 ${inst.top}%, proveedor 2 ${inst.second}%`}</span>
                </div>
              )
            })}
          </div>
          </Reveal>
          <span className="ct-note">
            {en ? '● top vendor · ○ second · gap in points' : '● proveedor 1 · ○ proveedor 2 · brecha en puntos'}
          </span>
        </div>
      </Link>
    </article>
  )
}
