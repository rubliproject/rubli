/**
 * Act II · The doors — every exception article cited after the blackout, with
 * its plain meaning, awards, share of direct awards, money read and busiest
 * buyer. Row click filters the register. gap-relevo spec § 2.3 (gap-data).
 */
import { useState } from 'react'
import { RankCell, RankTh } from '@/components/kit/ListRow'
import { NameCell, NumCell } from '@/components/kit/ListCells'
import { DoorTag } from '@/components/gap/DoorTag'
import { doorOf } from '@/lib/gap/doors'
import { formatCompactMXN, formatNumber } from '@/lib/utils'
import type { GapExceptionArticle } from '@/api/types'

const DEFAULT_ROWS = 12

export function DoorsTable({ items, daCount, isEs, onPick }: {
  items: GapExceptionArticle[]; daCount: number; isEs: boolean; onPick: (art: string) => void
}) {
  const [all, setAll] = useState(false)
  const shown = all ? items : items.slice(0, DEFAULT_ROWS)
  const maxMoney = Math.max(1, ...items.map((i) => i.ocr_sum_mxn ?? 0))
  // share of every award that cites an exception (some cite one without being a direct award)
  const cited = items.reduce((s, a) => s + a.count, 0)
  return (
    <div>
      <div className="ct-table-wrap"><table className="ct-table ct-stack" aria-label={isEs ? 'Las puertas legales de la adjudicación' : 'The legal doors of the award'}>
        <thead>
          <tr>
            <RankTh lang={isEs ? 'es' : 'en'} />
            <th scope="col">{isEs ? 'Puerta' : 'Door'}</th>
            <th scope="col" className="hidden md:table-cell">{isEs ? 'Qué significa' : 'What it means'}</th>
            <th scope="col" className="num">{isEs ? 'Adjud.' : 'Awards'}</th>
            <th scope="col" className="num">{isEs ? 'Proporción' : 'Share'}</th>
            <th scope="col" className="num">{isEs ? 'Dinero leído' : 'Money read'}</th>
            <th scope="col">{isEs ? 'Comprador principal' : 'Top buyer'}</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((a, i) => {
            const d = doorOf(a.article)
            const money = a.ocr_sum_mxn ?? 0
            return (
              <tr key={a.article} className="ct-row">
                <RankCell n={i + 1} />
                <td className="ct-key">
                  <button type="button" onClick={() => onPick(a.article)} className="text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-primary"
                    aria-label={isEs ? `${a.article}: abrir sus ${formatNumber(a.count)} filas en el registro` : `${a.article}: open its ${formatNumber(a.count)} rows in the register`}>
                    <DoorTag art={a.article} isEs={isEs} />
                  </button>
                  <span className="md:hidden"><span className="gap-sub">{isEs ? d.short.es : d.short.en}</span></span>
                </td>
                <td className="ls-txt hidden md:table-cell">{isEs ? d.meaning.es : d.meaning.en}</td>
                <NumCell label={isEs ? 'adjud.' : 'awards'}>{formatNumber(a.count)}</NumCell>
                <NumCell label={isEs ? 'proporción' : 'share'}>{cited ? `${((100 * a.count) / cited).toFixed(1)}%` : '—'}</NumCell>
                <td className="num ct-amt nowrap">
                  {money > 0 && <span className="gap-moneybar" style={{ width: `${Math.max(2, (money / maxMoney) * 96)}px` }} aria-hidden="true" />}
                  {money > 0 ? formatCompactMXN(money) : '—'}
                </td>
                {a.top_institution_id
                  ? <NameCell type="institution" id={a.top_institution_id} name={a.top_siglas} />
                  : <td className="ct-key"><span className="ls-anon">{a.top_siglas ?? '—'}</span></td>}
              </tr>
            )
          })}
        </tbody>
      </table></div>
      {items.length > DEFAULT_ROWS && (
        <button type="button" onClick={() => setAll((v) => !v)} className="gap-toggle">
          {all
            ? (isEs ? 'Mostrar solo las 12 principales' : 'Show the top 12 only')
            : (isEs ? `Mostrar las ${items.length} puertas` : `Show all ${items.length} doors`)}
        </button>
      )}
      <DoorsFooter items={items} cited={cited} daCount={daCount} isEs={isEs} />
    </div>
  )
}

function DoorsFooter({ items, cited, daCount, isEs }: { items: GapExceptionArticle[]; cited: number; daCount: number; isEs: boolean }) {
  const sum = (p: (a: GapExceptionArticle) => boolean) => items.filter(p).reduce((s, a) => s + a.count, 0)
  const pct = (n: number) => (cited ? `${((100 * n) / cited).toFixed(1)}%` : '—')
  const a54 = sum((a) => a.article.startsWith('Art. 54'))
  const a55 = sum((a) => a.article.startsWith('Art. 55'))
  const old = sum((a) => a.article.startsWith('Art. 41'))
  const nonExc = sum((a) => doorOf(a.article).tone === 'unverified' && !a.article.startsWith('Art. 41'))
  const emerg = sum((a) => a.article === 'Art. 54 fr. II' || a.article === 'Art. 42 fr. II')
  return (
    <div className="gap-doors-foot">
      <p>
        {isEs
          ? `${formatNumber(cited)} procedimientos citan una excepción (${formatNumber(daCount)} son adjudicaciones directas). Las puertas del Art. 54 suman ${pct(a54)}; el umbral de monto del Art. 55, ${pct(a55)}. ${formatNumber(old)} filas citan la numeración anterior a 2025 (Art. 41†) y ${formatNumber(nonExc)} citan artículos que no son de excepción; ambas se muestran sin verificar y sin color. El campo «emergencia» de ComprasMX vale 0 en las ${formatNumber(emerg)} adjudicaciones que citan la fracción de emergencia.`
          : `${formatNumber(cited)} procedures cite an exception (${formatNumber(daCount)} are direct awards). The Art. 54 doors are ${pct(a54)} of them; the Art. 55 amount threshold ${pct(a55)}. ${formatNumber(old)} rows cite the pre-2025 numbering (Art. 41†) and ${formatNumber(nonExc)} cite articles that are not exceptions at all; both are shown unverified, uncoloured. ComprasMX's "emergency" field reads 0 on all ${formatNumber(emerg)} awards citing the emergency fraction.`}
      </p>
      <p className="ct-note">LAASSP DOF 2025-04-16 · Art. 54/55 · LOPSRM 42/43</p>
    </div>
  )
}
