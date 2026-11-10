/**
 * IndexBlocks — El Padrón (/cases) on «El Contrato».
 *
 *   CaseRegister  — the register as a ledger table (DESIGN.md §8):
 *                   td 8×12, numerals right-aligned Plex Mono 13 tabular, row hover
 *                   80ms, sortable headers (SortHeaderTh), skeleton rows, full case
 *                   names never truncated, fraud type as a 10px categorical square.
 *                   The row the reader came back from is the pulled record (§7).
 *
 * Amounts stay neutral ink; legal disposition is the only status-coded axis.
 */
import { Link } from 'react-router-dom'
import { formatCompactMXN } from '@/lib/utils'
import type { ScandalListItem } from '@/api/types'
import { SortHeaderTh } from '@/components/ui/SortHeaderTh'
import {
  adminShortLabel,
  dispositionFor,
  dispositionLabel,
  folio,
  fraudLabel,
  type Lang,
} from './casesVocab'
import { SeverityDots } from './CasesShared'
import { noOrphan, tidy } from '@/lib/typography'

function caseName(cas: ScandalListItem, lang: Lang): string {
  return lang === 'es' && cas.name_es ? cas.name_es : cas.name_en
}

/** Real links; state preserves the back-to-docket origin. */
function caseTo(cas: ScandalListItem) {
  return { pathname: `/cases/${cas.slug}`, state: { from: '/cases' } }
}

function yearSpan(cas: ScandalListItem): string {
  if (!cas.contract_year_start) return '—'
  return cas.contract_year_end && cas.contract_year_end !== cas.contract_year_start
    ? `${cas.contract_year_start}–${cas.contract_year_end}`
    : String(cas.contract_year_start)
}

// ─── CaseRegister ───────────────────────────────────────────────────────────

export type RegisterSort = 'loss' | 'severity' | 'year'

export function CaseRegister({
  cases,
  lang,
  loading,
  sortBy,
  onSort,
  typeColor,
  pulledSlug,
  onClear,
  label,
}: {
  cases: ScandalListItem[]
  lang: Lang
  loading: boolean
  sortBy: RegisterSort
  onSort: (k: RegisterSort) => void
  /** Fraud type → its categorical hue on this page (C8 for types folded into «otros»). */
  typeColor: (fraudType: string) => string
  /** The row the reader came back from (El Hilo): drawn as the pulled record. */
  pulledSlug: string | null
  /** Shown in the empty row when filters leave nothing. */
  onClear?: () => void
  label: string
}) {
  const es = lang === 'es'
  const showLoss = loading || cases.some((c) => c.amount_mxn_low)
  const cols = showLoss ? 8 : 7
  return (
    <div className="cl-scroll">
      <table className="ct-table ct-stack cl-table" aria-label={label} aria-busy={loading || undefined}>
        <thead>
          <tr>
            <th scope="col">{es ? 'Folio' : 'File'}</th>
            <th scope="col">{es ? 'Caso' : 'Case'}</th>
            <th scope="col">{es ? 'Tipo' : 'Type'}</th>
            <th scope="col">{es ? 'Sexenio' : 'Term'}</th>
            <SortHeaderTh<RegisterSort> field="year" label={es ? 'Años' : 'Years'} activeField={sortBy} order="desc" onSort={onSort} />
            <SortHeaderTh<RegisterSort> field="severity" label={es ? 'Gravedad' : 'Severity'} activeField={sortBy} order="desc" onSort={onSort} />
            <th scope="col">{es ? 'Estado' : 'Status'}</th>
            {showLoss && <SortHeaderTh<RegisterSort> field="loss" label={es ? 'Pérdida' : 'Loss'} activeField={sortBy} order="desc" onSort={onSort} className="cl-num" />}
          </tr>
        </thead>
        <tbody>
          {loading && Array.from({ length: 8 }).map((_, i) => (
            <tr key={i} className="cl-skel" aria-hidden="true">
              {Array.from({ length: cols }).map((__, j) => <td key={j}><span style={{ width: j === 1 ? '70%' : '60%' }} /></td>)}
            </tr>
          ))}
          {!loading && cases.length === 0 && (
            <tr className="cl-empty">
              <td colSpan={cols}>
                {es ? 'Ningún caso coincide con los filtros.' : 'No cases match the filters.'}
                {onClear && (
                  <button type="button" onClick={onClear}>
                    {es ? 'Quitar filtros' : 'Clear filters'}<kbd>Esc</kbd>
                  </button>
                )}
              </td>
            </tr>
          )}
          {!loading && cases.map((cas) => {
            const meta = dispositionFor(cas.legal_status)
            const loss = cas.amount_mxn_low ? formatCompactMXN(cas.amount_mxn_low) : null
            return (
              <tr key={cas.id} data-wf-row={cas.slug} className={pulledSlug === cas.slug ? 'ct-row is-pulled' : 'ct-row'}>
                <td className="cl-mono ct-rank">{folio(cas.id)}</td>
                <td className="ct-key">
                  <Link to={caseTo(cas).pathname} state={caseTo(cas).state} className="cl-name">
                    {noOrphan(tidy(caseName(cas, lang), lang))}
                  </Link>
                </td>
                <td className="cl-type">
                  <span className="ct-sq" aria-hidden="true" style={{ ['--c' as string]: typeColor(cas.fraud_type) }} />
                  {fraudLabel(cas.fraud_type, lang)}
                </td>
                <td style={{ whiteSpace: 'nowrap', fontSize: 14 }}>{adminShortLabel(cas.administration, lang)}</td>
                <td className="cl-mono">{yearSpan(cas)}</td>
                <td><SeverityDots severity={cas.severity} lang={lang} /></td>
                <td>
                  <span className="cl-status" style={{ color: meta.ink, ['--c' as string]: meta.fill }}>
                    <i aria-hidden="true" className={meta.ring ? 'is-ring' : undefined} />
                    {dispositionLabel(cas.legal_status, lang)}
                  </span>
                </td>
                {showLoss && (
                  <td className={`cl-num cl-mono ct-amt${loss ? '' : ' cl-gray'}`} title={loss ? undefined : es ? 'sin monto documentado' : 'no documented amount'}>
                    {loss ?? '—'}
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
