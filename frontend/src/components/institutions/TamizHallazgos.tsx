/**
 * Hallazgos — /institutions tab 3 («Por pesos» spec §5).
 *
 * Computed cards, each with its caveat: the largest D/F federal buyer (IMSS
 * today) moving its pesos to direct award while its contract count says
 * «estable»; the sexenio series of federal money through today's D/F buyers,
 * with and without that buyer; what CompraNet cannot see; and the v2 → v3
 * comparison that left the steps. Card numbers come from the cached
 * /scorecards/institutions/hallazgos (precomputed tables) and from the field
 * payload; nothing is hardcoded. The by-group table and the methodology fold
 * close the tab.
 */
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { scorecardApi } from '@/api/client'
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import { DotBarRow } from '@/components/ui/DotBar'
import { ListRow } from '@/components/kit/ListRow'
import { AmountCell, NumCell } from '@/components/kit/ListCells'
import { TIER_STYLES, formatGrade, gradeBandFromLetter } from '@/lib/tiers'
import { SECTORS, getSectorName } from '@/lib/constants'
import { formatCompactMXN, formatNumber } from '@/lib/utils'
import {
  buildRows, deficientFlows, gtShift, rowLabel, RING_MIN_GT_V3, type FieldModel,
} from '@/lib/institutions/field'

const pct0 = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v * 100)}%`)
const pct1 = (v: number) => `${(v * 100).toFixed(1)}%`

function Card({ kicker, title, children, caveat }: { kicker: string; title: React.ReactNode; children: React.ReactNode; caveat: React.ReactNode }) {
  return (
    <article className="rounded-sm border border-border p-4 sm:p-5" style={{ boxShadow: 'inset 0 0 0 1px rgba(160,104,32,0.06)' }}>
      <p className="text-[13px] ct-sc text-text-muted">{kicker}</p>
      <h3 className="mt-1 text-text-primary" style={{ fontFamily: 'var(--font-family-editorial)', fontWeight: 500, fontSize: 17, lineHeight: 1.4 }}>{title}</h3>
      <div className="mt-3">{children}</div>
      <p className="mt-3 border-t border-border pt-2 text-[12px] leading-relaxed text-text-muted">{caveat}</p>
    </article>
  )
}

/** Two shares over the years, labelled at their ends (no legend to decode). */
function TwoLines({ years, a, b, la, lb }: { years: number[]; a: (number | null)[]; b: number[]; la: string; lb: string }) {
  const W = 420, H = 150, P = { l: 30, r: 118, t: 10, b: 22 }
  const x = (i: number) => P.l + (i / Math.max(1, years.length - 1)) * (W - P.l - P.r)
  const y = (v: number) => P.t + (1 - v) * (H - P.t - P.b)
  const path = (vals: (number | null)[]) => vals.map((v, i) => (v == null ? '' : `${i && vals[i - 1] != null ? 'L' : 'M'}${x(i)} ${y(v)}`)).join('')
  const last = years.length - 1
  // End labels: keep at least 12px apart so close values never overprint.
  let ya = y(a[last] ?? 0), yb = y(b[last])
  if (Math.abs(ya - yb) < 12) { const mid = (ya + yb) / 2; const up = (a[last] ?? 0) >= b[last]; ya = mid + (up ? -6 : 6); yb = mid + (up ? 6 : -6) }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[520px]" role="img" aria-label={`${la} / ${lb}, ${years[0]}–${years[last]}`}>
      {[0, 0.5, 1].map((g) => (
        <g key={g}>
          <line x1={P.l} x2={W - P.r} y1={y(g)} y2={y(g)} stroke="var(--color-border)" strokeWidth="1" />
          <text x={P.l - 4} y={y(g) + 3} textAnchor="end" fontSize="12" fontFamily="var(--font-family-mono, monospace)" fill="var(--color-text-muted)">{g * 100}%</text>
        </g>
      ))}
      {years.map((yr, i) => (i === 0 || i === last || yr % 3 === 0) && (
        <text key={yr} x={x(i)} y={H - 6} textAnchor="middle" fontSize="12" fontFamily="var(--font-family-mono, monospace)" fill="var(--color-text-muted)">{yr}{i === last ? 'p' : ''}</text>
      ))}
      <path d={path(b)} fill="none" stroke="var(--color-text-muted)" strokeWidth="1.5" strokeDasharray="3 2" />
      <path d={path(a)} fill="none" stroke={TIER_STYLES.Deficiente.color} strokeWidth="2" />
      <text x={x(last) + 5} y={ya + 3} fontSize="12" fontFamily="var(--font-family-mono, monospace)" fill={TIER_STYLES.Deficiente.ink}>{la} {pct0(a[last])}</text>
      <text x={x(last) + 5} y={yb + 3} fontSize="12" fontFamily="var(--font-family-mono, monospace)" fill="var(--color-text-muted)">{lb} {pct0(b[last])}</text>
    </svg>
  )
}

export function TamizHallazgos({ model, lang }: { model: FieldModel; lang: string }) {
  const en = lang === 'en'
  const L = (es: string, e: string) => (en ? e : es)
  const { data: h, isError } = useQuery({
    queryKey: ['institution-hallazgos'],
    queryFn: () => scorecardApi.getInstitutionHallazgos(),
    staleTime: 60 * 60 * 1000,
    retry: false,
  })
  const shift = useMemo(() => gtShift(model), [model])
  const flows = useMemo(() => deficientFlows(model), [model])
  const sector = (id: number) => {
    const s = SECTORS.find((q) => q.id === id)
    return s ? getSectorName(s.code, en ? 'en' : 'es') : String(id)
  }
  const groups = useMemo(() => buildRows(model, model.insts.map((_, i) => i), 'grp').sort((a, b) => b.val - a.val), [model])
  const v3 = model.method === 'v3'

  const top = h?.top_df ?? null
  const yrs = top?.years ?? []
  const first = yrs.find((y) => y.year === 2016) ?? yrs[0]
  const lastY = yrs[yrs.length - 1]
  const sx = h?.sexenios ?? []
  const sxName = (k: string) => ({ epn: 'Peña Nieto', amlo: 'López Obrador', y2025: L('Sheinbaum (parcial)', 'Sheinbaum (partial)') }[k] ?? k)
  const vis = h?.visibility
  const fedTotal = vis ? Object.values(vis.federal_by_band).reduce((a, b) => a + b.value_mxn, 0) : 0
  const bandName = (b: string) => ({ alta: L('alta', 'high'), parcial: L('parcial', 'partial'), baja: L('baja', 'low'), sin_dato: L('sin cotejo', 'no match') }[b] ?? b)

  return (
    <div className="space-y-8">
      {isError && (
        <p role="status" className="rounded-sm border border-border p-3 text-[13px] text-text-muted">
          {L('Las tarjetas por año no están disponibles en este servidor todavía; el resto de la página sí.', 'The by-year cards are not available on this server yet; the rest of the page is.')}
        </p>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {top && first && lastY && (
          <Card
            kicker={L('§ I · El mayor comprador reprobado', '§ I · The largest failing buyer')}
            title={L(
              `${top.name.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase())}: calificación ${formatGrade(top.score, 'es')}. Adjudica directo ${pct0(lastY.da_share_value)} de sus pesos (${lastY.year}p), contra ${pct0(first.da_share_value)} en ${first.year}.`,
              `${top.name.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase())}: grade ${formatGrade(top.score, 'en')}. It direct-awards ${pct0(lastY.da_share_value)} of its pesos (${lastY.year}p), against ${pct0(first.da_share_value)} in ${first.year}.`,
            )}
            caveat={L(
              `Por número de contratos la adjudicación directa bajó (${pct0(first.da_share_count)} → ${pct0(lastY.da_share_count)}): menos contratos directos, pero mucho más grandes. Por eso su indicador de tendencia dice «${top.trend ?? '—'}»: cuenta contratos, no pesos. 2020–2022 incluye la emergencia de COVID y las compras consolidadas; desde el 28 de septiembre de 2025 la fuente es ComprasMX; ${lastY.year} es parcial (al corte).`,
              `By number of contracts direct award fell (${pct0(first.da_share_count)} → ${pct0(lastY.da_share_count)}): fewer direct contracts, much bigger ones. That is why its trend badge says "${top.trend ?? '—'}": it counts contracts, not pesos. 2020–2022 includes the COVID emergency and consolidated purchasing; from 28 September 2025 the source is ComprasMX; ${lastY.year} is partial (to the cut).`,
            )}
          >
            <TwoLines years={yrs.map((y) => y.year)} a={yrs.map((y) => y.da_share_value)} b={yrs.map((y) => y.da_share_count)}
              la={L('por pesos', 'by pesos')} lb={L('por contratos', 'by contracts')} />
            <p className="mt-1 text-[12px] text-text-secondary">
              <EntityIdentityChip type="institution" id={top.institution_id} name={top.name} variant="name" className="underline underline-offset-2" />
              <span className="text-text-muted"> · {formatCompactMXN(top.value_mxn)} · {L('adjudicación directa como parte de lo comprado cada año', 'direct award as a share of each year’s buying')}</span>
            </p>
          </Card>
        )}

        {sx.length > 0 && (
          <Card
            kicker={L('§ II · Por sexenio', '§ II · By administration')}
            title={L(
              `Parte del gasto federal que pasó por compradores hoy reprobados (menos de 6 de 10): ${sx.map((s) => pct0(s.df_share)).join(' → ')}.`,
              `Share of federal spending through buyers that fail (under 6 out of 10) today: ${sx.map((s) => pct0(s.df_share)).join(' → ')}.`,
            )}
            caveat={<>
              {L(
                `Sin ${top ? 'el mayor comprador reprobado' : 'el mayor'} la serie casi no se mueve: ${sx.map((s) => pct0(s.df_share_ex_top)).join(' → ')}. PEMEX y CFE salen de CompraNet en 2018 y eso sube la proporción por sí solo. La calificación es de toda la historia, no de cada sexenio. De 2002 a 2012 no hay dato comparable de adjudicación directa. `,
                `Without ${top ? 'the largest failing buyer' : 'the largest'} the series barely moves: ${sx.map((s) => pct0(s.df_share_ex_top)).join(' → ')}. PEMEX and CFE leave CompraNet in 2018, which raises the share on its own. Grades cover the whole history, not each administration. 2002–2012 has no comparable direct-award data. `,
              )}
              <Link to="/administrations" className="underline underline-offset-2 hover:text-text-primary">{L('Ver Sexenios →', 'See Administrations →')}</Link>
            </>}
          >
            <dl className="grid grid-cols-3 gap-3">
              {sx.map((s) => (
                <div key={s.key}>
                  <dt className="text-[13px] ct-sc text-text-muted">{sxName(s.key)}<span className="block">{s.years[0] === s.years[1] ? s.years[0] : `${s.years[0]}–${s.years[1]}`}</span></dt>
                  <dd className="mt-1">
                    <span className="block tabular-nums" style={{ fontFamily: 'var(--font-serif)', fontWeight: 600, fontSize: 24, lineHeight: 1, color: TIER_STYLES.Deficiente.ink }}>{pct0(s.df_share)}</span>
                    <span className="mt-1 block text-[13px] tabular-nums text-text-muted">{L('sin el mayor', 'without the largest')}: {pct0(s.df_share_ex_top)}</span>
                    <span className="block text-[13px] tabular-nums text-text-muted">{L('adj. directa', 'direct award')}: {pct0(s.da_share_value)}</span>
                  </dd>
                </div>
              ))}
            </dl>
          </Card>
        )}

        {vis && (
          <Card
            kicker={L('§ III · Lo que CompraNet no ve', '§ III · What CompraNet cannot see')}
            title={L(
              `${formatCompactMXN(vis.left_compranet.value_mxn)} del gasto federal calificado es de compradores que dejaron CompraNet antes de ${(vis.left_compranet.max_last_year ?? 2018) + 1}; después, CompraNet ve menos de 1% de su presupuesto.`,
              `${formatCompactMXN(vis.left_compranet.value_mxn)} of graded federal spend belongs to buyers that left CompraNet before ${(vis.left_compranet.max_last_year ?? 2018) + 1}; after that CompraNet sees under 1% of their budget.`,
            )}
            caveat={L(
              'La cobertura compara contratos firmados con gasto pagado (Cuenta Pública): va al lado de la calificación, nunca dentro. Una calificación alta con cobertura parcial juzga sólo lo que se ve.',
              'Coverage compares contracts signed with spending paid (Cuenta Pública): it sits beside the grade, never inside it. A high grade on partial coverage judges only what is visible.',
            )}
          >
            <ul className="ls">
              {vis.left_compranet.top.map((t, i) => (
                <ListRow key={t.institution_id} rank={i + 1}
                  name={<EntityIdentityChip type="institution" id={t.institution_id} name={t.name} variant="name" size="inherit" fullName hideIcon />}
                  meta={<>{gradeBandFromLetter(t.grade, en ? 'en' : 'es')} · {L('último contrato', 'last contract')} {t.last_year}</>}
                  amount={formatCompactMXN(t.value_mxn)} />
              ))}
            </ul>
            {vis.a_partial.length > 0 && (
              <p className="mt-3 text-[13px] text-text-secondary">
                {L('Con 7.6 o más y cobertura parcial: ', 'Graded 7.6 or more on partial coverage: ')}
                {vis.a_partial.map((a, k) => (
                  <span key={a.institution_id}>
                    {k ? ' · ' : ''}
                    <EntityIdentityChip type="institution" id={a.institution_id} name={a.name} variant="name" className="underline underline-offset-2" />
                    <span className="font-mono text-[12px] text-text-muted"> {a.lower_bound ? L('al menos ', 'at least ') : ''}{a.coverage_pct}%</span>
                  </span>
                ))}
              </p>
            )}
            <div className="mt-3 grid gap-2">
              {['alta', 'parcial', 'baja', 'sin_dato'].filter((b) => vis.federal_by_band[b]).map((b) => (
                <DotBarRow key={b} label={`${L('Cobertura', 'Coverage')} ${bandName(b)} · ${vis.federal_by_band[b].n}`}
                  readout={formatCompactMXN(vis.federal_by_band[b].value_mxn)}
                  value={vis.federal_by_band[b].value_mxn} max={fedTotal} color="var(--color-text-secondary)" />
              ))}
            </div>
          </Card>
        )}

        {v3 && (
          <Card
            kicker={L('§ IV · Calificación anterior (v2) → v3', '§ IV · Previous grade (v2) → v3')}
            title={L(
              `Con v2, ${pct1(shift.gt.pctAlt)} de quienes compraron a ${RING_MIN_GT_V3} o más proveedores investigados quedaban deficientes, frente a ${pct1(shift.rest.pctAlt)} del resto. Con v3 (reprobadas, menos de 6 de 10): ${pct1(shift.gt.pct)} frente a ${pct1(shift.rest.pct)}.`,
              `Under v2, ${pct1(shift.gt.pctAlt)} of buyers from ${RING_MIN_GT_V3}+ investigated vendors were deficient, against ${pct1(shift.rest.pctAlt)} of the rest. Under v3 (failing, under 6 out of 10): ${pct1(shift.gt.pct)} against ${pct1(shift.rest.pct)}.`,
            )}
            caveat={L(
              'La v2 fue la calificación oficial hasta octubre de 2026 (escala de 90, cinco pilares, uno de ellos las alertas externas). La v3 califica sólo cómo compra la institución; comprar a un proveedor investigado ya no baja la calificación y se informa aparte. Es un registro histórico, no una hipótesis.',
              'v2 was the official grade until October 2026 (90-point scale, five pillars, one of them external flags). v3 grades only how the institution buys; buying from an investigated vendor no longer lowers the grade and is reported separately. This is the historical record, not a hypothesis.',
            )}
          >
            <p className="text-[13px] text-text-secondary">
              {L(
                `Al cambiar de método, ${formatNumber(flows.left)} instituciones salieron de la zona deficiente (v2) y ${formatNumber(flows.entered)} entraron a la zona reprobada (v3).`,
                `With the new method ${formatNumber(flows.left)} institutions left the v2 deficient band and ${formatNumber(flows.entered)} entered the v3 failing band.`,
              )}
            </p>
          </Card>
        )}
      </div>

      {/* By group — the three weights side by side; the divergence is the finding. */}
      <section aria-labelledby="hz-groups">
        <p className="text-[13px] ct-sc text-text-muted">{L('§ V · Por tipo de institución', '§ V · By kind of institution')}</p>
        <h3 id="hz-groups" className="mt-1 text-text-primary" style={{ fontFamily: 'var(--font-family-editorial)', fontWeight: 500, fontSize: 17 }}>
          {L('Reprobadas contadas tres veces: por instituciones, por pesos y por contratos', 'Failing grades counted three ways: by institutions, by pesos and by contracts')}
        </h3>
        <div className="ct-table-wrap mt-3">
          <table className="ct-table ct-stack">
            <thead>
              <tr>
                <th scope="col">{L('Grupo', 'Group')}</th>
                <th scope="col" className="num">{L('Gasto', 'Spend')}</th>
                <th scope="col" className="num">n</th>
                <th scope="col" className="num">{L('% instituciones', '% institutions')}</th>
                <th scope="col" className="num">{L('% pesos', '% pesos')}</th>
                <th scope="col" className="num">{L('% contratos', '% contracts')}</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((r) => (
                <tr key={r.key}>
                  <td className="ct-key">{rowLabel('grp', r.key, lang, sector, model)}</td>
                  <AmountCell value={r.val} />
                  <NumCell label="n">{formatNumber(r.n)}</NumCell>
                  <NumCell label={L('instituciones', 'institutions')}>{pct0(r.pct)}</NumCell>
                  <NumCell label={L('pesos', 'pesos')}>{pct0(r.pctVal)}</NumCell>
                  <NumCell label={L('contratos', 'contracts')}>{pct0(r.pctN)}</NumCell>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Methodology — moved here from the page foot. */}
      <details className="group border-t border-border pt-4">
        <summary className="cursor-pointer list-none text-[13px] ct-sc text-text-muted hover:text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
          {L('§ Metodología · cómo se calcula la calificación ▸', '§ Methodology · how the grade is computed ▸')}
        </summary>
        <div className="mt-3 space-y-3 text-[14px] leading-relaxed text-text-secondary">
          <p>{L(
            'La calificación (v3) mide cómo compra la institución —competencia, disciplina de proceso y concentración de proveedores—; la mitad se compara con el estándar nacional y la otra mitad con instituciones del mismo nivel, tipo y tamaño. Va de 0 a 10 (el puntaje de 100 entre diez): 6 o más es aprobada, menos de 6 es reprobada; los colores cortan en 7.6, 6.0, 4.4 y 2.8. Es un indicador de riesgo del proceso de compra, no una prueba de irregularidades.',
            'The grade (v3) measures how the institution buys — competition, process discipline and supplier concentration — half against the national standard, half against institutions of the same level, type and size. It runs 0–10 (the 100-point score divided by ten): 6 or more passes, under 6 fails; colours cut at 7.6, 6.0, 4.4 and 2.8. It is a risk indicator of the buying process, not proof of wrongdoing.',
          )}</p>
          <p>{L(
            'Las cifras «por pesos» suman el valor de los contratos de toda la historia (2002–2025, sin contratos de más de 100 mil MDP, que son errores de captura). Los contratos de más de 10 mil MDP se cuentan pero se marcan en revisión. Con pocos contratos la calificación es inestable: se marca como provisional y se muestra el rango probable. CompraNet registra ganadores, no participantes.',
            '"By pesos" figures add the value of contracts over the whole history (2002–2025, excluding contracts above 100 billion pesos, which are capture errors). Contracts above 10 billion pesos count but are flagged for review. With few contracts the grade is unstable: it is marked provisional with its likely range. CompraNet records winners, not bidders.',
          )}</p>
          {model.calibrationId && <p className="font-mono text-[12px] text-text-muted">{L('Calibración', 'Calibration')} {model.calibrationId}</p>}
          <p className="text-[12px] ct-sc text-text-muted">
            <Link to="/methodology" className="text-text-secondary underline underline-offset-2 hover:text-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-sm">{L('Metodología completa', 'Full methodology')}</Link>
          </p>
        </div>
      </details>
    </div>
  )
}
