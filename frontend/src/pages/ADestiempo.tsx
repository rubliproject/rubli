/**
 * «A destiempo: antes del fallo y el mismo día» — the reviewed merge (concept D, REVIEW_4 ship after Q1/Q2) of
 * «Empezó antes del fallo» and «El mismo día»: one head + sumario + two chapters, each with its claim, cifras, object,
 * «La lectura», drill and notes. Served at /antes-del-fallo; /mismo-dia redirects to /antes-del-fallo#mismo-dia
 * (the query is kept, so /mismo-dia?vista=lista lands on that chapter's list).
 * Views: «Los relojes» (the two chapters) · «Los registros» (both full tables, CSV).
 * Data: GET /analysis/antes-del-fallo · GET /newtabs/mismo-dia (no id for personas físicas).
 */
import { MoreLine } from '@/components/kit/MoreLine'
import { useEffect, useMemo } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { DocHead } from '@/components/contrato/DocHead'
import { useLang } from '@/components/contrato/nav'
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import { FalloList, type ListInst } from '@/components/fallo/FalloList'
import { fetchFallo, shape, type FalloResp } from '@/components/fallo/falloData'
import { NtTable, Sheet, capTxt, fdate, ntGet, useVista } from '@/components/newtabs/ntShared'
import { FalloChapter } from '@/components/destiempo/FalloChapter'
import { MismoChapter } from '@/components/destiempo/MismoChapter'
import { SECTORS } from '@/lib/constants'
import { formatEntityName } from '@/lib/entity/format'
import { formatCompactMXN, rawText } from '@/lib/utils'
import { falloModel, mismoModel, ratio, type Lot, type MismoResp } from '@/lib/destiempo/model'
import { num, pct, pfLabel } from '@/lib/destiempo/lectura'
import '@/components/kit/kit.css'
import '@/components/fallo/fallo.css'
import '@/components/destiempo/destiempo.css'

export default function ADestiempo() {
  const lang = useLang(), en = lang === 'en', L = (es: string, e: string) => (en ? e : es)
  const [vista] = useVista()
  const loc = useLocation()
  const fq = useQuery({ queryKey: ['analysis', 'antes-del-fallo'], queryFn: fetchFallo, staleTime: 30 * 60_000, retry: 1 })
  const mq = useQuery({ queryKey: ['newtabs', 'mismo-dia', 5000], queryFn: () => ntGet<MismoResp>('mismo-dia', { limit: 5000 }), staleTime: 60 * 60_000, retry: 1 })
  const FM = useMemo(() => (fq.data?.available && fq.data.inst.length ? falloModel(fq.data) : null), [fq.data])
  const MM = useMemo(() => (mq.data?.available ? mismoModel(mq.data) : null), [mq.data])
  const ready = !!FM && !!MM

  // a hash naming a chapter (#mismo-dia, #fallo:SEDENA…) scrolls to it once the data is in
  const chapterId = loc.hash.slice(1).split(':')[0]
  useEffect(() => {
    if (ready && (chapterId === 'fallo' || chapterId === 'mismo-dia')) document.getElementById(chapterId)?.scrollIntoView({ block: 'start' })
  }, [ready, chapterId])

  const views = (
    <nav className="dt-views" aria-label={L('Vista', 'View')}>
      <Link to={{ search: '', hash: loc.hash }} aria-current={vista === 'vis' ? 'true' : undefined}>{L('Los relojes', 'The clocks')}</Link>
      <Link to={{ search: '?vista=lista', hash: loc.hash }} aria-current={vista === 'lista' ? 'true' : undefined}>{L('Los registros (CSV)', 'The records (CSV)')}</Link>
    </nav>
  )
  const failed = fq.isError || mq.isError || (fq.data && !fq.data.available) || (mq.data && !mq.data.available)

  return (
    <Sheet>
      <div className="dt">
        <DocHead trail={[{ label: L('Investigar', 'Investigate') }, { label: L('A destiempo', 'Out of time') }]}
          meta={<>{L('Dos calendarios', 'Two calendars')} · <b>ComprasMX 2025–26</b> · <b>CompraNet 2019–25 · {L('PEF Anexo 9', 'PEF Annex 9')}</b></>} views={views} />
        <div className="dt-pagehead">
          <div>
          <h1>{L('A destiempo: antes del fallo y el mismo día', 'Out of time: before the award, and on the same day')}</h1>
          <MoreLine>{L('Dos relojes del procedimiento federal, y la raya que la ley pone en cada uno: el día en que un concurso tiene ganador, y el tope por debajo del cual un contrato se da sin concurso. Este expediente junta lo que arrancó antes del primero y lo que se amontonó pegado al segundo.',
            'Two clocks in federal procurement, and the line the law draws on each: the day a tender has a winner, and the cap below which a contract is given with no tender. This file gathers what started before the first and what piled up against the second.')}</MoreLine>
          </div>
          {ready && (
            <div className="dt-sumario">
              <a href="#fallo" onClick={(e) => { e.preventDefault(); document.getElementById('fallo')?.scrollIntoView({ behavior: 'smooth' }) }}>
                <span className="dt-k">{L('§ Antes del fallo', '§ Before the award')}</span><b>{pct(FM.F.lead_proc_rate, lang, 1)}</b>
                <span>{L(`de los concursos de la ${FM.F.lead_k} empezaron antes del fallo · ${num(FM.F.n, lang)} contratos en toda la APF · ${num(FM.F.pre_ape, lang)} antes de la apertura`, `of ${FM.F.lead_k} tenders started before the award · ${num(FM.F.n, lang)} contracts across the federal government · ${num(FM.F.pre_ape, lang)} before bids opened`)}</span>
              </a>
              <a href="#mismo-dia" onClick={(e) => { e.preventDefault(); document.getElementById('mismo-dia')?.scrollIntoView({ behavior: 'smooth' }) }}>
                <span className="dt-k">{L('§ El mismo día', '§ The same day')}</span><b>{num(MM.F.near, lang)}</b>
                <span>{L(`lotes con la pieza mayor a 2% del tope${MM.F.lead ? ` · ${MM.F.lead.n} contratos en un día para una empresa, a ${num(MM.F.lead_gap, lang)} pesos del tope` : ''}`, `lots with the largest piece within 2% of the cap${MM.F.lead ? ` · ${MM.F.lead.n} contracts in one day for one firm, ${num(MM.F.lead_gap, lang)} pesos under the cap` : ''}`)}</span>
              </a>
            </div>
          )}
        </div>

        {failed ? (
          <p className="dt-mono">{L('Los datos no cargaron. Recargue la página.', 'The data did not load. Reload the page.')}</p>
        ) : !ready ? (
          <div className="nt-skel" aria-busy="true"><span className="dt-mono">{L('Leyendo ComprasMX y CompraNet…', 'Reading ComprasMX and CompraNet…')}</span></div>
        ) : vista === 'vis' ? (
          <>
            <FalloChapter M={FM} lang={lang} level={2} />
            <MismoChapter M={MM} lang={lang} level={2} />
          </>
        ) : (
          <Registros fq={fq.data!} mq={mq.data!} lang={lang} />
        )}

        <div className="dt-firmas">
          {L('Dos medidas del calendario de la contratación federal, cada una con su universo y sus notas. Ninguna prueba una irregularidad por sí sola: son indicadores de riesgo que llevan a un expediente —la institución, la empresa, el contrato— y de ahí a El Mapa, Captura y Focos Rojos. Personas físicas nombradas como las publica CompraNet y marcadas, sin RFC; montos de más de 100,000 MDP excluidos.',
            'Two measures of the federal procurement calendar, each with its universe and its notes. Neither proves wrongdoing on its own: they are risk indicators that lead to a file — the institution, the firm, the contract — and from there to the Map, Capture and Red Flags. Individuals named as CompraNet publishes them and labelled, never with their RFC; amounts above 100,000 M MXN excluded.')}
        </div>
      </div>
    </Sheet>
  )
}

function Registros({ fq, mq, lang }: { fq: FalloResp; mq: MismoResp; lang: 'es' | 'en' }) {
  const en = lang === 'en', L = (es: string, e: string) => (en ? e : es)
  const shaped = useMemo(() => shape(fq, lang), [fq, lang])
  const insts: ListInst[] = useMemo(() => fq.inst.map((x) => ({ name: formatEntityName('institution', x.name, 'full'), iid: x.iid, sectorCode: (SECTORS.find((s) => s.id === x.sid) ?? SECTORS[11]).code })), [fq])
  const lotName = (l: Lot) => (l.vendor_name ? formatEntityName('vendor', l.vendor_name, 'full') : L('Sin nombre en el registro', 'No name in the register')) + (l.is_pf ? pfLabel(lang) : '')
  return (
    <div className="dt-list">
      <h2 id="fallo">{L('Empezó antes del fallo · contratos', 'Work began before the award · contracts')}</h2>
      <FalloList rows={shaped.rows} insts={insts} lang={lang} />
      <h2 id="mismo-dia">{L('El mismo día · lotes', 'The same day · lots')}</h2>
      <NtTable<Lot>
        rows={mq.rows} lang={lang} file="rubli_el_mismo_dia.csv" unit={{ es: 'lotes', en: 'lots' }} initial={{ key: 'suma_mxn' }}
        rowKey={(l) => `${l.institution_id}-${l.vendor_id ?? 'pf'}-${l.contract_date}-${l.cls}-${l.n}-${l.sum_mxn}`}
        cols={[
          { key: 'fecha', label: L('Fecha', 'Date'), num: true, sort: (l) => l.contract_date, csv: (l) => l.contract_date, cell: (l) => fdate(l.contract_date, lang) },
          { key: 'comprador', label: L('Comprador', 'Buyer'), sort: (l) => l.institution_name, csv: (l) => rawText(l, 'institution_name'),
            cell: (l) => <EntityIdentityChip type="institution" id={l.institution_id} name={l.institution_name} size="inherit" fullName hideIcon /> },
          { key: 'proveedor', label: L('Empresa', 'Firm'), sort: (l) => lotName(l), csv: (l) => `${rawText(l, 'vendor_name')}${l.is_pf ? ' (persona física)' : ''}`,
            cell: (l) => (l.vendor_id != null && l.vendor_name ? <><EntityIdentityChip type="vendor" id={l.vendor_id} name={l.vendor_name} size="inherit" fullName hideIcon inline />{l.is_pf && <span className="dt-pf">{pfLabel(lang)}</span>}</> : <span>{lotName(l)}</span>) },
          { key: 'piezas', label: L('Piezas', 'Pieces'), num: true, sort: (l) => l.n, csv: (l) => l.n, cell: (l) => num(l.n, lang) },
          { key: 'suma_mxn', label: L('Suma', 'Sum'), num: true, sort: (l) => l.sum_mxn, csv: (l) => Math.round(l.sum_mxn), cell: (l) => formatCompactMXN(l.sum_mxn) },
          { key: 'pieza_mayor_mxn', label: L('Pieza mayor', 'Largest piece'), num: true, sort: ratio, csv: (l) => Math.round(l.max_mxn), cell: (l) => <>{formatCompactMXN(l.max_mxn)} · {pct(ratio(l), lang, 1)}</> },
          { key: 'veces_tope_max', label: L('× tope máx.', '× top cap'), num: true, sort: (l) => l.sum_mxn / l.high_cap_mxn, csv: (l) => +(l.sum_mxn / l.high_cap_mxn).toFixed(3), cell: (l) => (l.sum_mxn / l.high_cap_mxn).toFixed(2) },
          { key: 'topes_pef', label: L('Topes PEF', 'PEF caps'), csv: (l) => `${l.low_cap_mxn}/${l.high_cap_mxn}`, cell: (l) => <span className="dt-mono">{capTxt(l.low_cap_mxn, lang)} / {capTxt(l.high_cap_mxn, lang)}</span> },
          { key: 'contract_ids', label: L('Registros', 'Records'), screen: false, csv: (l) => l.contract_ids.join(';'), cell: (l) => num(l.contract_ids.length, lang) },
        ]}
      />
    </div>
  )
}
