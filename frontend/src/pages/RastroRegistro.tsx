/**
 * «El Rastro de un Peso» / «The Trail of a Peso» — carve one institution's money down to a citable contract:
 * institution → category → vendor → contract (default IMSS). Definition: docs/NEWTABS_DEFINITIONS.md § 4.
 * Data: GET /newtabs/rastro (live, indexed, cached 6 h). Object: components/newtabs/RastroPlate.
 * «Lista» = the three levels of the current path as sortable tables with a CSV each (no RFC).
 */
import { rawText } from '@/lib/utils'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useReducedMotion } from 'framer-motion'
import { institutionApi } from '@/api/client'
import { DocHead } from '@/components/contrato/DocHead'
import { useLang } from '@/components/contrato/nav'
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import { formatEntityName } from '@/lib/entity/format'
import {
  RastroPlate, catName, conName, instLabel, per100, useBeat, useRastroLevels, useWalk, venName, pfTag,
  type Medida, type Path, type RaResp, type RaRow,
} from '@/components/newtabs/RastroPlate'
import { formatDualCurrency } from '@/lib/utils'
import { NtTable, Notes, Sheet, ViewSwitch, fdate, mxn, nf, useQ, useVista, type Col, type Lang } from '@/components/newtabs/ntShared'
import '@/components/kit/kit.css'

const IMSS = 251
const num = (s: string | null) => (s != null && /^\d+$/.test(s) ? Number(s) : null)

/** «Otra institución»: search the register, pick one, the carve re-roots there. */
function InstPicker({ lang, onPick }: { lang: Lang; onPick: (id: number) => void }) {
  const en = lang === 'en'
  const [text, setText] = useState('')
  const [deb, setDeb] = useState('')
  const [open, setOpen] = useState(false)
  useEffect(() => { const t = window.setTimeout(() => setDeb(text.trim()), 250); return () => window.clearTimeout(t) }, [text])
  const q = useQuery({ queryKey: ['inst-search', deb], queryFn: () => institutionApi.search(deb, 8), enabled: deb.length >= 2, placeholderData: keepPreviousData, staleTime: 10 * 60_000 })
  const list = q.data?.data ?? []
  return (
    <div className="nt-picker" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false) }}>
      <input type="search" value={text} placeholder={en ? 'Another institution' : 'Otra institución'} aria-label={en ? 'Search another institution' : 'Buscar otra institución'}
        onChange={(e) => { setText(e.target.value); setOpen(true) }} onFocus={() => setOpen(true)}
        onKeyDown={(e) => { if (e.key === 'Escape') { setOpen(false); setText('') } }} />
      {open && deb.length >= 2 && (
        <ul className="nt-picker-l" role="listbox" aria-label={en ? 'Institutions' : 'Instituciones'}>
          {list.length === 0 && <li className="nt-side-cav">{q.isLoading ? (en ? 'Searching…' : 'Buscando…') : en ? 'No match' : 'Sin resultados'}</li>}
          {list.map((i) => (
            <li key={i.id} role="option" aria-selected={false}>
              <button type="button" onClick={() => { onPick(i.id); setOpen(false); setText('') }}>
                {i.siglas && <b>{i.siglas}</b>} {formatEntityName('institution', i.name, 'full')}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function RastroRegistro() {
  const lang = useLang()
  const en = lang === 'en'
  const L = (es: string, e: string) => (en ? e : es)
  const reduced = !!useReducedMotion()
  const beat = useBeat(reduced)
  const [vista, setVista] = useVista()
  const [params, setQ] = useQ()
  const path: Path = useMemo(() => ({ inst: num(params.get('inst')) ?? IMSS, cat: num(params.get('cat')), v: num(params.get('v')), c: num(params.get('c')) }), [params])
  const medida: Medida = params.get('medida') === 'contratos' ? 'contratos' : 'monto'
  const levels = useRastroLevels(path)
  // Walk to the largest record on arrival (no step chosen yet), on a new institution and after a click.
  const [walking, setWalking] = useState(() => params.get('c') == null)
  const setPath = useCallback((patch: Record<string, number | null>) => setQ(patch), [setQ])
  useWalk(path, levels, walking, setPath, beat)
  const pick = (level: 0 | 1 | 2, id: number) => {
    setWalking(level < 2)
    if (level === 0) setQ({ cat: id, v: null, c: null }, true)
    else if (level === 1) setQ({ v: id, c: null }, true)
    else setQ({ c: id }, true)
  }
  const back = () => {
    setWalking(false)
    if (path.c != null) { setQ({ c: null }); return true }
    if (path.v != null) { setQ({ v: null }); return true }
    if (path.cat != null) { setQ({ cat: null }); return true }
    return false
  }
  const pickInst = (id: number) => { setWalking(true); setQ({ inst: id === IMSS ? null : id, cat: null, v: null, c: null }, true) }

  const [m0, s0, s1, rec] = useMemo(() => {
    const d0 = levels[0], d1 = levels[1], d2 = levels[2]
    return [d0?.meta, d0?.rows.find((r) => r.id === path.cat), d1?.rows.find((r) => r.id === path.v), d2?.rows.find((r) => r.id === path.c)]
  }, [levels, path])
  const inst = m0 ? instLabel(m0.institution) : ''
  const unavailable = levels[0] && !levels[0].available

  return (
    <Sheet>
      <DocHead
        trail={[{ label: L('Análisis', 'Analysis') }, { label: L('El Rastro de un Peso', 'The Trail of a Peso') }]}
        meta={<>{L('Fuente', 'Source')} <b>CompraNet 2002–2025</b> · {L('cálculo en vivo', 'computed live')}</>}
        views={<ViewSwitch vista={vista} onVista={setVista} lang={lang}
          names={[{ es: 'Las bandas', en: 'The bands' }, { es: 'Las tres tablas', en: 'The three tables' }]} />}
      />

      <div className="nt-ra-top">
        <h1 className="nt-h1">
          {m0 && s0 && s1
            ? (en
              ? <>Of every 100 pesos spent by {inst}, {per100(s0.share)} went to {catName(s0, true)}, and <em>{per100(s0.share * s1.share)}</em> to a single vendor.</>
              : <>De cada 100 pesos {m0.institution.siglas ? 'del ' : 'de '}{inst}, {per100(s0.share)} fueron a {catName(s0, false)}, y <em>{per100(s0.share * s1.share)}</em> a un solo proveedor.</>)
            : m0 ? L(`¿A dónde va cada peso ${m0.institution.siglas ? 'del' : 'de'} ${inst}?`, `Where does each of ${inst}'s pesos go?`) : L('¿A dónde va cada peso de una institución?', 'Where does each of an institution’s pesos go?')}
        </h1>
        <div className="nt-ra-ctl">
          <div className="nt-lens" role="group" aria-label={L('Medida', 'Measure')}>
            <button type="button" aria-pressed={medida === 'monto'} onClick={() => setQ({ medida: null })}>{L('Monto', 'Amount')}</button>
            <button type="button" aria-pressed={medida === 'contratos'} onClick={() => setQ({ medida: 'contratos' })}>{L('Contratos', 'Contracts')}</button>
          </div>
          <InstPicker lang={lang} onPick={pickInst} />
        </div>
      </div>
      {m0 && (
        <dl className="nt-figs">
          <div><dt>{L('Institución', 'Institution')}</dt><dd><EntityIdentityChip type="institution" id={m0.institution.id} name={formatEntityName('institution', m0.institution.name, 'full')} size="xs" fullName inline hideIcon /></dd></div>
          <div><dt>{L('Gasto registrado', 'Recorded spend')}</dt><dd>{formatDualCurrency(m0.parent_mxn)}</dd></div>
          <div><dt>{L('Contratos', 'Contracts')}</dt><dd>{nf(m0.parent_n)}</dd></div>
          {rec && <div className="is-hue"><dt>{L('El registro', 'The record')}</dt><dd>{conName(rec, en)} · {formatDualCurrency(rec.amount_mxn, rec.contract_date ? +rec.contract_date.slice(0, 4) : undefined)}</dd></div>}
        </dl>
      )}

      {unavailable ? (
        <p className="nt-empty">{L('Esa institución no está en el registro. Elija otra.', 'That institution is not in the register. Pick another.')}</p>
      ) : !levels[0] ? (
        <div className="nt-skel" aria-busy="true"><span className="ct-mono">{L('Leyendo los contratos de la institución…', 'Reading the institution’s contracts…')}</span></div>
      ) : vista === 'vis' ? (
        <RastroPlate path={path} medida={medida} lang={lang} onPick={pick} onBack={back} levels={levels} beat={beat} />
      ) : (
        <RastroLista levels={levels} lang={lang} />
      )}

      <Notes lang={lang} items={en ? [
        'Each band opens the selection above it to full width. A share is that row’s money divided by its parent’s money at that level (or its contracts, with «Contracts»). The top 15 rows show; the hatched rest is everything else.',
        'Shares span all years, 2002–2025; Structure A (2002–2010) has weaker coverage. Categories are RUBLI’s classification, not CompraNet’s.',
        'Pure arithmetic on stored data. A large share is not evidence of wrongdoing. Amounts above 100B MXN are excluded; † marks a contract above 10B MXN. In this view individuals appear only as «persona física», without their name; their RFC, CURP or address is never shown.',
      ] : [
        'Cada banda abre a lo ancho la selección de arriba. Una parte es el dinero de esa fila entre el dinero de su nivel superior (o sus contratos, con «Contratos»). Se muestran las 15 filas mayores; el resto rayado es todo lo demás.',
        'Las partes abarcan todos los años, 2002–2025; la Estructura A (2002–2010) tiene menor cobertura. Las categorías son la clasificación de RUBLI, no la de CompraNet.',
        'Aritmética pura sobre los datos registrados. Una parte grande no prueba una irregularidad. Se excluyen montos de más de 100,000 MDP; † marca un contrato de más de 10,000 MDP. En esta vista las personas físicas aparecen solo como «persona física», sin su nombre; su RFC, CURP o domicilio nunca se muestran.',
      ]} />
    </Sheet>
  )
}

function RastroLista({ levels, lang }: { levels: [RaResp | undefined, RaResp | undefined, RaResp | undefined]; lang: Lang }) {
  const en = lang === 'en'
  const L = (es: string, e: string) => (en ? e : es)
  const share: Col<RaRow> = { key: 'parte', label: L('Parte', 'Share'), num: true, sort: (r) => r.share, csv: (r) => r.share, cell: (r) => `${per100(r.share)}%` }
  const amt: Col<RaRow> = { key: 'monto_mxn', label: L('Monto', 'Amount'), num: true, sort: (r) => r.amount_mxn, csv: (r) => Math.round(r.amount_mxn), cell: (r) => <>{mxn(r.amount_mxn)}{r.flag_10b ? ' †' : ''}</> }
  const cnt: Col<RaRow> = { key: 'contratos', label: L('Contratos', 'Contracts'), num: true, sort: (r) => r.n ?? 1, csv: (r) => r.n ?? 1, cell: (r) => nf(r.n ?? 1) }
  const [d0, d1, d2] = levels
  const inst = d0?.meta ? instLabel(d0.meta.institution) : ''
  return (
    <>
      {d0?.available && (
        <>
          <h2 className="nt-h2">{L(`Categorías de ${inst}`, `${inst}: categories`)}</h2>
          <NtTable<RaRow> rows={d0.rows} lang={lang} file="rubli_rastro_categorias.csv" unit={{ es: 'categorías', en: 'categories' }} initial={{ key: 'monto_mxn' }} rowKey={(r) => r.id}
            cols={[{ key: 'categoria', label: L('Categoría', 'Category'), sort: (r) => catName(r, en), csv: (r) => catName(r, en), cell: (r) => (r.id ? <EntityIdentityChip type="category" id={r.id} name={catName(r, en)} size="sm" fullName hideIcon /> : catName(r, en)) },
              { key: 'category_id', label: 'ID', csv: (r) => r.id, cell: (r) => <span className="ct-mono">{r.id}</span> }, amt, cnt, share]} />
        </>
      )}
      {d1?.available && (
        <>
          <h2 className="nt-h2">{L(`Proveedores de ${catName(d1.meta.category ?? {}, false)}`, `${catName(d1.meta.category ?? {}, true)}: vendors`)}</h2>
          <NtTable<RaRow> rows={d1.rows} lang={lang} file="rubli_rastro_proveedores.csv" unit={{ es: 'proveedores', en: 'vendors' }} initial={{ key: 'monto_mxn' }} rowKey={(r) => r.id}
            cols={[{ key: 'proveedor', label: L('Proveedor', 'Vendor'), sort: (r) => venName(r, en), csv: (r) => (r.name ? r.name + (r.is_pf ? ' (persona física)' : '') : null), cell: (r) => (!r.name ? <span className="nt-lg-muted">{venName(r, en)}</span> : <><EntityIdentityChip type="vendor" id={r.id} name={r.name} size="sm" fullName hideIcon />{r.is_pf && <span className="nt-lg-muted">{pfTag(en)}</span>}</>) },
              { key: 'vendor_id', label: 'ID', csv: (r) => r.id, cell: (r) => <span className="ct-mono">{r.id}</span> }, amt, cnt, share]} />
        </>
      )}
      {d2?.available && (
        <>
          <h2 className="nt-h2">{L(`Contratos de ${venName(d2.meta.vendor ?? {}, false)}`, `${venName(d2.meta.vendor ?? {}, true)}: contracts`)}</h2>
          <NtTable<RaRow> rows={d2.rows} lang={lang} file="rubli_rastro_contratos.csv" unit={{ es: 'contratos', en: 'contracts' }} initial={{ key: 'monto_mxn' }} rowKey={(r) => r.id}
            cols={[{ key: 'contrato', label: L('Contrato', 'Contract'), sort: (r) => conName(r, en), csv: (r) => r.contract_number, cell: (r) => <Link className="ct-link" to={`/contracts/${r.id}`}>{conName(r, en)}</Link> },
              { key: 'contract_id', label: 'ID', csv: (r) => r.id, cell: (r) => <span className="ct-mono">{r.id}</span> },
              { key: 'objeto', label: L('Objeto', 'Purpose'), csv: (r) => rawText(r, 'title'), cell: (r) => <span className="nt-lg-t">{r.title || '—'}</span> },
              { key: 'fecha', label: L('Fecha', 'Date'), num: true, sort: (r) => r.contract_date ?? '', csv: (r) => r.contract_date, cell: (r) => fdate(r.contract_date, lang) },
              { key: 'adj_directa', label: L('Adj. directa', 'Direct award'), csv: (r) => r.is_direct_award ?? 0, cell: (r) => (r.is_direct_award ? L('sí', 'yes') : '') },
              amt, share]} />
        </>
      )}
    </>
  )
}
