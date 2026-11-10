/**
 * Act IV · The buyers — the 12 busiest post-blackout buyers with their
 * pre-blackout no-bid share (same institution id). gap-relevo spec § G4.
 */
import { useMemo, useState } from 'react'
import { SortHeaderTh } from '@/components/ui/SortHeaderTh'
import { RankCell, RankTh } from '@/components/kit/ListRow'
import { AmountCell, NameCell, NumCell } from '@/components/kit/ListCells'
import { DoorTag } from '@/components/gap/DoorTag'
import { RISK_COLORS } from '@/lib/constants'
import { formatNumber } from '@/lib/utils'
import type { GapTopBuyer } from '@/api/types'

type SortField = 'count' | 'da_pct' | 'delta' | 'ocr_sum_mxn'
const delta = (b: GapTopBuyer) => (b.pre_da_pct == null ? null : b.da_pct - b.pre_da_pct)

export function BuyersTable({ items, isEs, onPick }: { items: GapTopBuyer[]; isEs: boolean; onPick: (id: number) => void }) {
  const [sort, setSort] = useState<SortField>('count')
  const rows = useMemo(() => [...items].sort((a, b) =>
    sort === 'delta' ? (delta(b) ?? -999) - (delta(a) ?? -999) : (b[sort] as number) - (a[sort] as number)), [items, sort])
  const sh = (field: SortField, label: string, cls = '') => (
    <SortHeaderTh field={field} label={label} activeField={sort} order="desc" onSort={setSort} className={`num ${cls}`} />
  )
  return (
    <div className="ct-table-wrap"><table className="ct-table ct-stack" aria-label={isEs ? 'Los compradores después del apagón' : 'The buyers after the blackout'}>
      <thead>
        <tr>
          <RankTh lang={isEs ? 'es' : 'en'} />
          <th scope="col">{isEs ? 'Comprador' : 'Buyer'}</th>
          {sh('ocr_sum_mxn', isEs ? 'Dinero leído' : 'Money read')}
          {sh('count', isEs ? 'Proced.' : 'Procedures')}
          {sh('da_pct', isEs ? 'Sin concurso' : 'No-bid')}
          {sh('delta', isEs ? 'Antes → después' : 'Before → after')}
          <th scope="col" className="hidden md:table-cell">{isEs ? 'Puerta principal' : 'Top door'}</th>
          <th scope="col" className="num hidden lg:table-cell"
            title={isEs ? 'Indicador estructural medio (0–100), no el modelo v0.9.2' : 'Mean structural indicator (0–100), not the v0.9.2 model'}>
            {isEs ? 'Alerta' : 'Alert'}
          </th>
          <th scope="col"><span className="sr-only">{isEs ? 'Abrir en el registro' : 'Open in the register'}</span></th>
        </tr>
      </thead>
      <tbody>
        {rows.map((b, i) => {
          const d = delta(b)
          return (
            <tr key={b.institution_id} className="ct-row">
              <RankCell n={i + 1} />
              <NameCell type="institution" id={b.institution_id} name={b.name ?? b.siglas} />
              <AmountCell value={b.ocr_sum_mxn > 0 ? b.ocr_sum_mxn : null} />
              <NumCell label={isEs ? 'proced.' : 'procedures'}>{formatNumber(b.count)}</NumCell>
              <NumCell label={isEs ? 'sin concurso' : 'no-bid'}>{b.da_pct.toFixed(1)}%</NumCell>
              <td className="num" data-l={isEs ? 'antes → después' : 'before → after'}>
                {b.pre_da_pct == null || d == null ? <span className="text-text-muted">—</span> : (
                  <>
                    <span className="text-text-muted">{b.pre_da_pct.toFixed(1)} → </span>
                    <span>{b.da_pct.toFixed(1)}</span>
                    <span className="inline-block w-4 text-center" style={{ color: d >= 15 ? RISK_COLORS.critical : d >= 5 ? RISK_COLORS.high : 'var(--color-text-muted)' }}
                      aria-label={isEs ? `${d >= 0 ? 'subió' : 'bajó'} ${Math.abs(d).toFixed(1)} puntos` : `${d >= 0 ? 'up' : 'down'} ${Math.abs(d).toFixed(1)} points`}>
                      {d >= 5 ? '▲' : d <= -5 ? '▼' : ''}
                    </span>
                  </>
                )}
              </td>
              <td className="hidden md:table-cell"><DoorTag art={b.top_article} isEs={isEs} /></td>
              <td className="num hidden lg:table-cell">{b.avg_score?.toFixed(1) ?? '—'}</td>
              <td className="nowrap">
                <button type="button" onClick={() => onPick(b.institution_id)} className="gap-toggle"
                  aria-label={isEs ? `Abrir las filas de ${b.siglas ?? b.name} en el registro` : `Open ${b.siglas ?? b.name}'s rows in the register`}>
                  {isEs ? 'Filas' : 'Rows'}
                </button>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table></div>
  )
}
