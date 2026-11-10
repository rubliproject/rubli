/**
 * W7 (/administrations?g=&y=&m=&cat=): the open year's «¿En qué se gastó?» split and its contract list, under the
 * month strip. The split = the period's money by spending category (GET /contracts/by-category, the column's own
 * rows), family hues (lib/categories/families); a category is a filter on the list (?cat=). The list = El Archivo's
 * board rows (RegisterBoard), largest first, paged in place. Money in each year's pesos (no deflation).
 */
import { useState } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { contractApi } from '@/api/client'
import { RegisterBoard } from '@/components/contracts/RegisterBoard'
import { familyMeta, familyOf } from '@/lib/categories/families'
import { categoryShortName } from '@/lib/categoryShortName'
import { formatCompactMXN, formatNumber } from '@/lib/utils'
import { findingSplit, splitRows } from '@/lib/sexenios/columna'
import { pctLabel } from './ColumnObject'
import '@/components/contracts/contracts.css'

type Lang = 'es' | 'en'
const PER = 10

export function Split({ year, month, when, cat, lang, onCat }: {
  year: number; month: number | null; when: string; cat: number | null; lang: Lang; onCat: (id: number | null) => void
}) {
  const L = (es: string, en: string) => (lang === 'es' ? es : en)
  const q = useQuery({ queryKey: ['sexenios', 'bycat', year, month], queryFn: () => contractApi.getByCategory(year, month), staleTime: 60 * 60 * 1000, placeholderData: keepPreviousData })
  const s = q.data
  const r = s ? splitRows(s, 9) : null
  const max = r?.top[0]?.value || 1
  return (
    <section className="sxc-split" aria-labelledby="sxc-split-h" aria-busy={q.isFetching || undefined}>
      <h3 id="sxc-split-h">{L(`¿En qué se gastó en ${when}?`, `What was it spent on in ${when}?`)}</h3>
      {q.isError && <p className="ct-note" role="alert">{L('Las categorías no cargaron.', 'The categories did not load.')}</p>}
      {s && r && <>
        <p className="sxc-split-f">{findingSplit(s, when, lang)}</p>
        <ul>
          {r.top.map((x) => {
            const id = x.category_id as number
            const full = (lang === 'es' ? x.name_es : x.name_en || x.name_es) ?? '—'
            const fam = familyMeta(familyOf(id))
            const on = cat === id
            return (
              <li key={id}>
                <button type="button" data-cat={id} aria-pressed={on} onClick={() => onCat(on ? null : id)} title={`${full} · ${L(fam.es, fam.en)}`} style={{ ['--c' as string]: fam.color }}>
                  <span className="sxc-split-n">{categoryShortName(id, full, lang)}</span>
                  <span className="sxc-split-bar" aria-hidden="true"><i style={{ width: `${Math.max(1, (100 * x.value) / max)}%` }} /></span>
                  <span className="sxc-num">{formatCompactMXN(x.value, 'mdp')}</span>
                  <span className="sxc-split-p">{pctLabel(x.value / s.value, lang)}</span>
                </button>
              </li>
            )
          })}
        </ul>
        {(r.rest.n > 0 || r.none > 0) && (
          <p className="sxc-sub">
            {r.rest.n > 0 && L(`Otras ${r.rest.n} categorías: ${formatCompactMXN(r.rest.value, 'mdp')}.`, `${r.rest.n} other categories: ${formatCompactMXN(r.rest.value, 'mdp')}.`)}
            {r.none > 0 && ` ${L(`Sin categoría en el registro: ${formatCompactMXN(r.none, 'mdp')}.`, `No category in the record: ${formatCompactMXN(r.none, 'mdp')}.`)}`}
          </p>
        )}
        <p className="sxc-sub">{cat ? L('Toque la categoría otra vez para quitar el filtro.', 'Tap the category again to clear the filter.') : L('Toque una categoría para ver solo sus contratos.', 'Tap a category to list only its contracts.')}</p>
      </>}
    </section>
  )
}

export function PeriodList({ year, month, when, cat, lang, onClose }: {
  year: number; month: number | null; when: string; cat: number | null; lang: Lang; onClose?: () => void
}) {
  const L = (es: string, en: string) => (lang === 'es' ? es : en)
  const [page, setPage] = useState(1)
  // owner W7: risk is what he wants to see — the list opens on the critical contracts (toggle to all)
  const [crit, setCrit] = useState(true)
  const q = useQuery({
    queryKey: ['sexenios', 'list', year, month, cat, crit, page],
    // column_rows: the same rows as the month cell and the split (CompraNet, 0 < amount <= 100B) — no ComprasMX double count
    queryFn: () => contractApi.getAll({ year, month: month ?? undefined, category_id: cat ?? undefined, risk_level: crit ? 'critical' : undefined, column_rows: true, sort_by: 'amount_mxn', sort_order: 'desc', per_page: PER, page }),
    staleTime: 10 * 60 * 1000,
    placeholderData: keepPreviousData,
  })
  const p = q.data?.pagination
  const from = (page - 1) * PER + 1
  const c0 = cat ? q.data?.data.find((c) => c.category_id === cat) : undefined
  const catName = c0 ? (lang === 'es' ? c0.category_es : c0.category_en || c0.category_es) : null
  const title = catName ? `${catName} · ${when}` : when
  return (
    <section className="sxc-plist" aria-labelledby="sxc-plist-h">
      <header>
        <div>
          <h3 id="sxc-plist-h">{crit ? L(`Los contratos de riesgo de ${title}`, `The risk contracts of ${title}`) : L(`Contratos de ${title}`, `Contracts of ${title}`)}</h3>
          <p className="sxc-sub">{L('Del más grande al más chico.', 'Largest first.')}{p ? ` ${formatNumber(p.total)} ${crit ? L('contratos con indicador crítico (≥ 0.60).', 'contracts with a critical indicator (≥ 0.60).') : L('contratos.', 'contracts.')}` : ''}</p>
          <div className="sxc-tools">
            <div className="sxc-seg" role="group" aria-label={L('Qué contratos', 'Which contracts')}>
              <button type="button" aria-pressed={crit} onClick={() => { setCrit(true); setPage(1) }}>{L('Solo críticos', 'Critical only')}</button>
              <button type="button" aria-pressed={!crit} onClick={() => { setCrit(false); setPage(1) }}>{L('Todos', 'All')}</button>
            </div>
            {onClose && <button type="button" className="sxc-x" onClick={onClose} aria-label={L('Quitar el filtro', 'Clear the filter')}>✕ <kbd className="sxc-esc">Esc</kbd></button>}
          </div>
        </div>
      </header>
      <RegisterBoard rows={q.data?.data ?? []} lang={lang} quietLevels label={crit ? L(`Los contratos de riesgo de ${title}`, `The risk contracts of ${title}`) : L(`Contratos de ${title}`, `Contracts of ${title}`)}
        status={q.isLoading ? L('Cargando…', 'Loading…') : q.isError ? L('Los contratos no cargaron.', 'The contracts did not load.') : !q.data?.data.length ? (crit ? L('Sin contratos críticos en este filtro.', 'No critical contracts in this filter.') : L('Sin contratos en este filtro.', 'No contracts in this filter.')) : undefined} />
      {p && p.total > PER && (
        <nav className="sxc-pager" aria-label={L('Páginas', 'Pages')}>
          <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>← {L('Anteriores', 'Previous')}</button>
          <span>{formatNumber(from)}–{formatNumber(Math.min(p.total, from + PER - 1))} {L('de', 'of')} {formatNumber(p.total)}</span>
          <button type="button" disabled={page >= p.total_pages} onClick={() => setPage(page + 1)}>{L('Siguientes', 'Next')} →</button>
        </nav>
      )}
    </section>
  )
}
