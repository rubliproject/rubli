/**
 * FalloList — «Lista»: the 1,025 contracts as a sortable ledger (100 per page) with a CSV download.
 * No RFC column, ever. Entities render as EntityIdentityChip; contracts link to /contracts/:id when the
 * contract also reached the CompraNet-era corpus, else show their ComprasMX code.
 */
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import { formatEntityName } from '@/lib/entity/format'
import { SortHeaderTh } from '@/components/ui/SortHeaderTh'
import { RankCell, RankTh } from '@/components/kit/ListRow'
import { csvCell, downloadCsv } from '@/lib/atlas/sky/export'
import { fdate, dateAt, isoAt, mdp, nf, prepub, vendorName, type Lang, type Row } from './falloData'

export interface ListInst { name: string; iid: number | null; sectorCode: string }

type Key = 'amt' | 'ini' | 'fallo' | 'inst' | 'v'
const PER = 100

export function FalloList({ rows, insts, lang }: { rows: Row[]; insts: ListInst[]; lang: Lang }) {
  const instNames = useMemo(() => insts.map((x) => x.name), [insts])
  const en = lang === 'en'
  const L = (es: string, e: string) => (en ? e : es)
  const [key, setKey] = useState<Key>('amt')
  const [asc, setAsc] = useState(false)
  const [page, setPage] = useState(0)
  const sorted = useMemo(() => {
    const v = (r: Row): number | string => key === 'amt' ? r.amt : key === 'ini' ? r.ini : key === 'fallo' ? r.fallo : key === 'inst' ? instNames[r.i] : vendorName(r)
    const s = [...rows].sort((a, b) => { const x = v(a), y = v(b); return x < y ? -1 : x > y ? 1 : 0 })
    return asc ? s : s.reverse()
  }, [rows, key, asc, instNames])
  const pages = Math.ceil(sorted.length / PER)
  const view = sorted.slice(page * PER, page * PER + PER)
  const sortBy = (k: Key) => { if (k === key) setAsc(!asc); else { setKey(k); setAsc(k === 'inst' || k === 'v') } setPage(0) }
  const th = (k: Key, label: string, num = false) => (
    <SortHeaderTh field={k} label={label} activeField={key} order={asc ? 'asc' : 'desc'} onSort={sortBy} className={num ? 'num' : ''} />
  )
  const csv = () => {
    const head = ['codigo_contrato', 'procedimiento', 'institucion', 'proveedor', 'vendor_id', 'monto_mxn', 'tipo', 'publicacion', 'apertura', 'fallo', 'firma', 'inicio', 'dias_antes_del_fallo', 'antes_de_publicarse', 'inicio_1_enero', 'caso_fortuito_o_urgencia', 'contract_id_compranet', 'persona_fisica']
    const body = sorted.map((r) => [r.code, r.proc, instNames[r.i], r.v, r.vid, Math.round(r.amt * 1e6), r.lp ? 'licitacion' : 'invitacion',
      isoAt(r, r.pub), isoAt(r, r.ape), r.fallo, isoAt(r, r.fir), isoAt(r, r.ini), -r.ini, prepub(r) ? 1 : 0, r.jan1 ? 1 : 0, r.fort ? 1 : 0, r.cid, r.pf ? 1 : 0])
    downloadCsv('rubli_empezo_antes_del_fallo.csv', [head, ...body].map((x) => x.map(csvCell).join(',')).join('\n'))
  }
  return (
    <section className="fa-list" aria-label={L('Lista de contratos', 'Contract list')}>
      <div className="fa-list-bar">
        <span className="ct-note !mt-0">{L(`${nf(rows.length)} contratos · página ${page + 1} de ${pages}`, `${nf(rows.length)} contracts · page ${page + 1} of ${pages}`)}</span>
        <span className="fa-list-pg">
          <button type="button" className="ct-chip" disabled={page === 0} onClick={() => setPage(page - 1)}>{L('Anterior', 'Previous')}</button>
          <button type="button" className="ct-chip" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>{L('Siguiente', 'Next')}</button>
          <button type="button" className="ct-chip" onClick={csv}>{L('Descargar CSV', 'Download CSV')}</button>
        </span>
      </div>
      <div className="ct-table-wrap">
        <table className="ct-table ct-stack fa-table">
          <thead>
            <tr>
              <RankTh lang={lang} />
              {th('v', L('Proveedor', 'Vendor'))}
              {th('inst', L('Institución', 'Institution'))}
              {th('amt', L('Monto', 'Amount'), true)}
              {th('ini', L('Días antes', 'Days early'), true)}
              {th('fallo', L('Fallo', 'Award'), true)}
              <th scope="col" className="num">{L('Inicio', 'Start')}</th>
              <th scope="col">{L('Contrato', 'Contract')}</th>
            </tr>
          </thead>
          <tbody>
            {view.map((r, idx) => {
              const I = insts[r.i]
              return (
                <tr key={r.j}>
                  <RankCell n={page * PER + idx + 1} />
                  <td className="ct-key">{r.vid != null && r.v ? <EntityIdentityChip type="vendor" id={r.vid} name={r.v} size="inherit" fullName hideIcon inline /> : vendorName(r)}{r.pf && <small>{L('persona física', 'individual')}</small>}</td>
                  <td className="ct-key">{I.iid != null ? <EntityIdentityChip type="institution" id={I.iid} name={I.name} size="inherit" fullName hideIcon sectorCode={I.sectorCode} /> : formatEntityName('institution', I.name, 'full')}</td>
                  <td className="num ct-amt">{mdp(r.amt)}{r.flag ? ' †' : ''}</td>
                  <td className="num" data-l={L('días antes', 'days early')}>{-r.ini}{prepub(r) && <b className="fa-pre" title={L('antes de publicarse la convocatoria', 'before the call was published')}> ◤</b>}</td>
                  <td className="num" data-l={L('fallo', 'award')}>{fdate(dateAt(r, 0), lang)}</td>
                  <td className="num" data-l={L('inicio', 'start')}>{fdate(dateAt(r, r.ini), lang)}</td>
                  <td className="ct-mono" data-l={L('contrato', 'contract')}>{r.cid != null ? <Link className="ct-link" to={`/contracts/${r.cid}`}>{r.code}</Link> : r.code}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
