/**
 * OfficialProfile — per-official rollup at /officials/:name, on «El Contrato»
 * (DESIGN.md §5.1 read page): kit/PageHead (kicker = name, h1 = the role sentence) → En cifras → the ledger
 * of buying units (.ct-table, gauge column) → the source note.
 *
 * The destination the /contracts/:id acta RESPONSABLE row links into: a Responsable de
 * la Unidad Compradora aggregated across every buying unit they signed for
 * (2018+, from official_risk_profiles). Volume-led, risk shown only as a
 * labeled indicator — "no es una acusación" (the table names private-ish
 * individuals identified by a free-text string, so the framing is deliberate).
 */
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'

import { officialsApi } from '@/api/client'
import { ListHead, COL, NameCell, NumCell, IndicatorCell } from '@/components/kit/ListCells'
import { RISK_COLORS, getRiskLevelFromScore } from '@/lib/constants'
import { toTitleCase, formatCompactMXN, formatDualCurrency, formatNumber } from '@/lib/utils'
import { DocHead } from '@/components/contrato/DocHead'
import { PageHead } from '@/components/kit/PageHead'
import { Cover } from '@/components/contrato/Cover'
import { Clause } from '@/components/contrato/Clause'

export default function OfficialProfile() {
  const { name } = useParams<{ name: string }>()
  const { i18n } = useTranslation()
  const isEs = !i18n.language?.startsWith('en')
  const decoded = name ? decodeURIComponent(name) : ''

  const { data, isLoading, isError } = useQuery({
    queryKey: ['official-profile', decoded],
    queryFn: () => officialsApi.getProfile(decoded),
    enabled: !!decoded,
    staleTime: 5 * 60 * 1000,
    retry: false,
  })

  const trail = [
    { label: isEs ? 'Investigar' : 'Investigate' },
    { label: isEs ? 'Responsables' : 'Officials' },
    { label: decoded ? toTitleCase(decoded) : '—' },
  ]

  if (isLoading || isError || !data) {
    return (
      <article className="ct ct-page ct-sheet" data-frame>
        <div className="ct-wrap">
          <DocHead trail={trail} />
          {isLoading
            ? <div className="ct-hold-ledger" aria-busy="true" style={{ minHeight: 320 }} />
            : <Cover
                title={isEs ? 'Sin perfil para este responsable' : 'No profile for this officer'}
                lede={isEs
                  ? 'No hay perfil con ese nombre, o no alcanza el mínimo de contratos firmados desde 2018.'
                  : 'No profile carries that name, or it falls below the floor of contracts signed since 2018.'}
              />}
        </div>
      </article>
    )
  }

  const { summary, institutions } = data
  const level = getRiskLevelFromScore(summary.avg_risk_score)
  const span = `${summary.first_contract_year ?? '—'}–${summary.last_contract_year ?? '—'}`
  const pct = (v: number | null | undefined) => (v == null ? '—' : `${v.toFixed(0)}%`)
  const nInst = summary.institution_count

  return (
    <article className="ct ct-page ct-sheet" data-frame>
      <div className="ct-wrap">
        <PageHead lang={isEs ? 'es' : 'en'} crumbs={trail}
          kicker={toTitleCase(data.official_name)}
          finding={isEs
            ? `Responsable de la Unidad Compradora en ${nInst} ${nInst === 1 ? 'institución' : 'instituciones'}, ${span}. Un indicador de riesgo, no una acusación.`
            : `Procurement officer of record at ${nInst} ${nInst === 1 ? 'institution' : 'institutions'}, ${span}. A risk indicator, not an accusation.`} />

        <section className="ct-clauses" aria-labelledby="of-cl-h" data-object>
          <h2 id="of-cl-h">{isEs ? 'En cifras' : 'In figures'}</h2>
          <div className="ct-cl-grid">
            <Clause id="of-cl-1" title={isEs ? `Contratos firmados, ${span}` : `Contracts signed, ${span}`}
              fig={formatNumber(summary.total_contracts)}
              count={{ value: summary.total_contracts, format: (n) => formatNumber(Math.round(n)) }}
              note={isEs ? `en ${nInst} unidades compradoras` : `across ${nInst} buying units`} />
            <Clause id="of-cl-2" title={isEs ? 'Valor contratado' : 'Contracted value'}
              fig={formatDualCurrency(summary.total_value_mxn)}
              note={isEs ? 'suma de los contratos con su firma' : 'sum of the contracts bearing the signature'} />
            <Clause id="of-cl-3" title={isEs ? 'Adjudicación directa' : 'Direct award'}
              fig={summary.direct_award_pct == null ? '—' : summary.direct_award_pct.toFixed(0)} unit={summary.direct_award_pct == null ? '' : '%'}
              ruler={{ value: (summary.direct_award_pct ?? 0) / 100, mode: 'fill', color: 'var(--color-text-primary)', ends: ['0%', isEs ? 'parte de los contratos' : 'share of contracts', '100%'] }} />
            <Clause id="of-cl-4" title={isEs ? 'Indicador de riesgo promedio' : 'Average risk indicator'}
              fig={summary.avg_risk_score.toFixed(2)}
              ruler={{ value: summary.avg_risk_score, mode: 'pointer', color: RISK_COLORS[level], ends: ['0', '.25 · .40 · .60', '1'] }} />
          </div>
        </section>

        <section className="ct-section" aria-labelledby="of-inst-h">
          <div className="ct-annex-row">
            <h2 id="of-inst-h" className="ct-h2">{isEs ? 'Por institución' : 'By institution'}</h2>
            <span className="ct-note">{isEs ? `${institutions.length} unidades compradoras` : `${institutions.length} buying units`}</span>
          </div>
          <div className="ct-section-body">
            <div className="ct-table-wrap">
              <table className="ct-table ct-stack">
                <ListHead lang={isEs ? 'es' : 'en'} cols={[
                  COL.institution, COL.contracts, COL.amount,
                  { ...COL.da, es: 'Adj. directa', en: 'Direct award' },
                  { key: 'single', es: 'Un solo adjudicado', en: 'Single award', num: true },
                  { key: 'vendors', es: 'Proveedores', en: 'Vendors', num: true },
                  COL.years, COL.indicator,
                ]} />
                <tbody>
                  {institutions.map((row) => (
                    <tr key={row.institution_id ?? row.institution_name} className="ct-row">
                      <NameCell type="institution" id={row.institution_id || null} name={row.institution_name ?? (row.institution_id ? `#${row.institution_id}` : null)} />
                      <NumCell label={isEs ? 'contratos' : 'contracts'}>{formatNumber(row.total_contracts)}</NumCell>
                      <NumCell amt>{formatCompactMXN(row.total_value_mxn)}</NumCell>
                      <NumCell label={isEs ? 'adj. directa' : 'direct'}>{pct(row.direct_award_pct)}</NumCell>
                      <NumCell label={isEs ? 'un solo adjudicado' : 'single award'}>{pct(row.single_award_pct)}</NumCell>
                      <NumCell label={isEs ? 'proveedores' : 'vendors'}>{formatNumber(row.vendor_diversity)}</NumCell>
                      <NumCell label={isEs ? 'años' : 'years'}>{row.first_contract_year === row.last_contract_year ? row.first_contract_year : `${row.first_contract_year}–${row.last_contract_year}`}</NumCell>
                      <IndicatorCell value={row.avg_risk_score} />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="ct-note mt-3">{data.note}</p>
          </div>
        </section>
      </div>
    </article>
  )
}
