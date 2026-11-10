/**
 * «El arranque» / «The head start» (docs/BACKLOG_LOS_PATRONES.md § El arranque; MAGENTA build 2026-11-05, concept
 * frontend/_explore/patrones_concepts_2026-11-05/arranque.html). The pattern, general: companies under a year old at their
 * first federal contract that took ≥ 100 MDP in their first 365 days, most of it with no tender — any buyer, any sector.
 *   masthead     what we did · why it matters · what you see (plain words)
 *   ¿Quién es?   the finding (Whitemed as the example) + the board: one row per firm, El Archivo's row standard, no bars (owner
 *                11-07): days old at the first contract · first-year money · % del total, under one computed finding. Filter by sector or buyer.
 *                Open › a firm → its first-year contracts as El Archivo rows (RegisterBoard).
 *   Cómo leer    three steps over the same board.
 * «El padrón» (?vista=lista) keeps every firm of the frozen definition (docs/NEWTABS_DEFINITIONS.md § 1), sortable, CSV.
 * Data: GET /newtabs/arranque (+ first-contract columns and age_days, backend MAGENTA — needs backend deploy) and, for an
 * opened firm, GET /contracts?vendor_id=.
 */
import { formatColumnMXN, rawText } from '@/lib/utils'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Fragment, useMemo } from 'react'
import { api } from '@/api/client'
import type { ContractListItem, ContractListResponse } from '@/api/types'
import { useLang, type Lang } from '@/components/contrato/nav'
import { PageHead } from '@/components/kit/PageHead'
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import { RegisterBoard } from '@/components/contracts/RegisterBoard'
import { Buyer, Glyph, LEVEL } from '@/components/portada/Tablero'
import { NtTable, Sheet, fdate, mxn, nf, ntGet, pct, useVista } from '@/components/newtabs/ntShared'
import { bucketLabel } from '@/components/destiempo/ArranqueChapter'
import type { ArrResp } from '@/lib/destiempo/model'
import { ageFinding, applyFilter, buyers, finding, firms, inFirstYear, shareOf, DA_MIN, type FirmRow } from '@/lib/patrones/arranque'
import { SECTORS, getRiskLevelFromScore, RISK_THRESHOLDS } from '@/lib/constants'
import { categoryShortName } from '@/lib/categoryShortName'
import { formatEntityName } from '@/lib/entity/format'
import { Chev, ComoLeer, Opened, Toggle, useOpenParam } from '@/components/patrones/Patrones'
import '@/components/kit/kit.css'
import '@/components/contracts/contracts.css'
import '@/components/destiempo/destiempo.css'

/** The example the page leads with (deck due diligence 2026-11-05: unreported; Ozore ← CONAGUA stays in the list as data). */
const LEAD_VENDOR = 312747
const SHOWN = 12

export default function Arranque() {
  const lang = useLang()
  const en = lang === 'en'
  const L = (es: string, e: string) => (en ? e : es)
  const [vista] = useVista()
  const q = useQuery({ queryKey: ['newtabs', 'arranque'], queryFn: () => ntGet<ArrResp>('arranque'), staleTime: 60 * 60_000, retry: 1 })
  const d = q.data?.available ? q.data : null
  const vName = (r: FirmRow) => (r.vendor_name ? formatEntityName('vendor', r.vendor_name, 'full') : L('Sin nombre en el registro', 'No name in the register'))

  return (
    <Sheet>
      <PageHead lang={lang}
        crumbs={[{ label: L('Los patrones', 'Patterns') }, { label: L('El arranque', 'The head start') }]}
        meta={L('CompraNet 2011–2025 · ComprasMX', 'CompraNet 2011–2025 · ComprasMX')}
        finding={L('Empresas con menos de un año de vida que cobraron 100 millones o más, casi todo sin concurso.',
          'Companies under a year old that were paid 100 million pesos or more, mostly without a tender.')}
        question={L('¿Quién gana contratos grandes antes de cumplir un año?', 'Who wins big contracts before turning one?')}
        lines={{
          see: L('Cada renglón es una empresa: cuántos días tenía en su primer contrato.', 'Each row is a company: how many days old it was at its first contract.'),
          read: L('Buscamos empresas que ganaron contratos grandes en su primer año de vida.', 'We looked for companies that won big contracts in their first year of life.'),
          means: L('Una empresa recién nacida casi nunca tiene experiencia para eso.', 'A newborn company rarely has the experience for that.'),
        }}
      />

      {q.isError || (q.data && !q.data.available) ? (
        <p className="nt-empty" role="alert">{L('Los datos de El arranque no cargaron. Recargue la página.', 'The Head Start data did not load. Reload the page.')}</p>
      ) : !d ? (
        <div className="nt-skel" aria-busy="true"><span className="dt-mono">{L('Leyendo CompraNet…', 'Reading CompraNet…')}</span></div>
      ) : vista === 'vis' ? (
        <>
          <Board rows={d.rows as FirmRow[]} lang={lang} />
          {/* the example reads under the list: nothing sits between the head and the first content (proof:head) */}
          <Who rows={d.rows as FirmRow[]} lang={lang} />
        </>
      ) : (
        <>
        <p className="pt-views"><Link className="ct-link" to={{ search: '' }}>{L('← Volver a la lista', '← Back to the list')}</Link></p>
        <NtTable<FirmRow>
          rows={d.rows as FirmRow[]} lang={lang} file="rubli_el_arranque.csv" unit={{ es: 'empresas', en: 'firms' }}
          initial={{ key: 'y1_mxn' }} rowKey={(r) => r.first_contract_id}
          cols={[
            { key: 'proveedor', label: L('Empresa', 'Firm'), sort: vName, csv: (r) => rawText(r, 'vendor_name'),
              cell: (r) => (r.vendor_id != null && r.vendor_name ? <EntityIdentityChip type="vendor" id={r.vendor_id} name={r.vendor_name} size="inherit" fullName hideIcon /> : vName(r)) },
            { key: 'vendor_id', label: 'ID', screen: false, csv: (r) => r.vendor_id, cell: (r) => <span className="ct-mono">{r.vendor_id}</span> },
            { key: 'primer_contrato', label: L('Primer contrato', 'First contract'), num: true, sort: (r) => r.first_date, csv: (r) => r.first_date,
              cell: (r) => <Link className="ct-link" to={`/contracts/${r.first_contract_id}`}>{fdate(r.first_date, lang)}</Link> },
            { key: 'contract_id', label: L('Registro', 'Record'), screen: false, csv: (r) => r.first_contract_id, cell: (r) => <span className="ct-mono">{r.first_contract_id}</span> },
            { key: 'y1_mxn', label: L('Primer año', 'First year'), num: true, sort: (r) => r.y1_mxn, csv: (r) => Math.round(r.y1_mxn), cell: (r) => <>{mxn(r.y1_mxn)}{r.flag_10b ? ' †' : ''}</> },
            { key: 'y1_contratos', label: L('Contratos', 'Contracts'), num: true, sort: (r) => r.y1_n, csv: (r) => r.y1_n, cell: (r) => nf(r.y1_n) },
            { key: 'y1_adj_directa', label: L('Sin concurso', 'No tender'), num: true, sort: (r) => r.y1_da_share, csv: (r) => r.y1_da_share, cell: (r) => pct(r.y1_da_share) },
            { key: 'dias_a_100mdp', label: L('Días a 100 MDP', 'Days to 100M'), num: true, sort: (r) => r.days_to_threshold, csv: (r) => r.days_to_threshold, cell: (r) => nf(r.days_to_threshold) },
            { key: 'antiguedad', label: L('Antigüedad', 'Firm age'), sort: (r) => String(r.incorp_bucket ?? 'z'), csv: (r) => r.incorp_bucket ?? 'sin_rfc_moral', cell: (r) => (r.incorp_bucket ? bucketLabel(r.incorp_bucket, en) : <span className="dt-mono">—</span>) },
            { key: 'anio_abierto', label: L('Año abierto', 'Open year'), screen: false, csv: (r) => (r.censored ? 1 : 0), cell: (r) => (r.censored ? L('sí', 'yes') : '') },
            { key: 'mas_de_10mil_mdp', label: '†', screen: false, csv: (r) => (r.flag_10b ? 1 : 0), cell: (r) => (r.flag_10b ? '†' : '') },
          ]}
        />
        </>
      )}
    </Sheet>
  )
}

const posInt = (v: string) => /^\d{1,9}$/.test(v)

/** «¿Quién es?»: the example (Whitemed) and the whole list in one sentence — the masthead's ear. */
function Who({ rows, lang }: { rows: FirmRow[]; lang: Lang }) {
  const en = lang === 'en'
  const L = (es: string, e: string) => (en ? e : es)
  const all = useMemo(() => firms(rows), [rows])
  const F = useMemo(() => finding(all), [all])
  const lead = all.find((r) => r.vendor_id === LEAD_VENDOR) ?? all[0]
  const leadName = lead ? formatEntityName('vendor', lead.vendor_name ?? '', 'full') : ''
  const leadBuyer = lead ? lead.institution_siglas || lead.institution_name || '' : ''
  const leadChip = lead?.vendor_id != null && lead.vendor_name ? <EntityIdentityChip type="vendor" id={lead.vendor_id} name={lead.vendor_name} variant="name" fullName /> : <b>{leadName}</b>
  const dated = (r: FirmRow) => r.age_days != null
  return (
    <section className="pt-who" aria-labelledby="pt-who-h">
      <h2 id="pt-who-h" className="pt-k">{L('¿Quién es?', 'Who is it?')}</h2>
      {lead && <p>{en
        ? <>For example: {leadChip} was {dated(lead) ? <>{nf(lead.age_days!)} days</> : 'under a year'} old when {leadBuyer} gave it its first contract. In its first year it was paid <b>{mxn(lead.y1_mxn)}</b>, {pct(lead.y1_da_share)} without a tender.</>
        : <>Por ejemplo: {leadChip} tenía {dated(lead) ? <>{nf(lead.age_days!)} días</> : 'menos de un año'} de vida cuando {leadBuyer} le dio su primer contrato. En su primer año cobró <b>{mxn(lead.y1_mxn)}</b>, {pct(lead.y1_da_share)} sin concurso.</>}</p>}
      <p className="pt-ex">{en
        ? <>The list: <b>{nf(F.n)} companies</b> like it, from {nf(F.buyers)} buyers in {nf(F.sectors)} sectors, took <b>{mxn(F.mxn)}</b> in their first year; {nf(F.under180)} of them were under six months old.</>
        : <>La lista: <b>{nf(F.n)} empresas</b> así, de {nf(F.buyers)} compradores en {nf(F.sectors)} sectores, cobraron <b>{mxn(F.mxn)}</b> en su primer año; {nf(F.under180)} tenían menos de seis meses.</>}</p>
    </section>
  )
}

function Board({ rows, lang }: { rows: FirmRow[]; lang: Lang }) {
  const en = lang === 'en'
  const L = (es: string, e: string) => (en ? e : es)
  const all = useMemo(() => firms(rows), [rows])
  const [params, setParams] = useSearchParams()
  const num = (k: string) => { const v = params.get(k); return v && posInt(v) ? Number(v) : null }
  const sector = all.some((r) => r.sector_id === num('sector')) ? num('sector') : null
  const buyer = all.some((r) => r.institution_id === num('comprador')) ? num('comprador') : null
  const setF = (k: 'sector' | 'comprador', v: string) => setParams((p) => {
    const n = new URLSearchParams(p)
    if (v) n.set(k, v); else n.delete(k)
    n.delete('firma')
    return n
  }, { replace: true, preventScrollReset: true })
  const [open, setOpen] = useOpenParam('firma', posInt)
  const [more, setMore] = useOpenParam('todas', (v) => v === '1')
  const shown = useMemo(() => applyFilter(all, { sector, buyer }), [all, sector, buyer])
  const B = useMemo(() => buyers(all), [all])
  const secs = SECTORS.filter((s) => all.some((r) => r.sector_id === s.id))
  const filtered = sector != null || buyer != null
  // a shared ?firma= link to a firm past the fold still opens it: the fold lifts to that row
  const openAt = open != null ? shown.findIndex((r) => String(r.vendor_id) === open) : -1
  const list = more || filtered ? shown : shown.slice(0, Math.max(SHOWN, openAt + 1))
  const restMxn = useMemo(() => shown.slice(SHOWN).reduce((s, r) => s + r.y1_mxn, 0), [shown])
  const age = useMemo(() => ageFinding(shown), [shown])
  const young = age?.youngest
  const youngName = young ? formatEntityName('vendor', young.vendor_name ?? '', 'full') || L('una empresa sin nombre en el registro', 'a firm with no name in the register') : ''

  return (
    <div className="pt">

      <div className="pt-filters" role="group" aria-label={L('Filtrar la lista', 'Filter the list')}>
        <label>{L('Sector', 'Sector')}
          <select className="cx-select" value={sector ?? ''} onChange={(e) => setF('sector', e.target.value)}>
            <option value="">{L('Todos', 'All')}</option>
            {secs.map((s) => <option key={s.id} value={s.id}>{en ? s.nameEN : s.name}</option>)}
          </select>
        </label>
        <label>{L('Comprador', 'Buyer')}
          <select className="cx-select" value={buyer ?? ''} onChange={(e) => setF('comprador', e.target.value)}>
            <option value="">{L('Todos', 'All')}</option>
            {B.map((b) => <option key={b.id} value={b.id}>{b.siglas || b.name} ({b.n})</option>)}
          </select>
        </label>
        <span className="pt-count" aria-live="polite">{en ? `${nf(shown.length)} of ${nf(all.length)} firms` : `${nf(shown.length)} de ${nf(all.length)} empresas`}</span>
        <Link className="pt-clear pt-roll" to={{ search: '?vista=lista' }}>{L('El padrón completo (CSV)', 'The full roll (CSV)')}</Link>
        {filtered && <button type="button" className="pt-clear" onClick={() => setParams((p) => { const n = new URLSearchParams(p); n.delete('sector'); n.delete('comprador'); n.delete('firma'); return n }, { replace: true, preventScrollReset: true })}>{L('Quitar filtros', 'Clear filters')}</button>}
      </div>

      {age && young && <p className="pt-find">{en
        ? <>Half of these {nf(age.n)} firms were under <b>{nf(age.median)} days</b> old at their first contract; the youngest, {youngName}, was {nf(young.age_days!)} days old.</>
        : <>La mitad de estas {nf(age.n)} empresas tenía menos de <b>{nf(age.median)} días</b> de vida en su primer contrato; la más nueva, {youngName}, tenía {nf(young.age_days!)}.</>}</p>}

      <div className="bd rg pt-arr">
        <div className="bd-grid">
          <div className="bd-row bd-cols pt-r">
            <span />
            <span className="r" title={L('Días entre el nacimiento de la empresa (su registro fiscal) y su primer contrato federal', 'Days between the firm’s birth (its tax registration) and its first federal contract')}>{L('Días de vida', 'Days old')}</span>
            <span className="bd-age">{L('Primer contrato', 'First contract')}</span>
            <span>{L('Comprador', 'Buyer')}</span>
            <span>{L('Empresa', 'Company')}</span>
            <span className="bd-cat">{L('Qué se compró', 'What was bought')}</span>
            <span className="r">{L('Primer año', 'First year')}</span>
            <span className="r">{L('% del total', '% of total')}</span>
            <span>{L('Sin concurso', 'No tender')}</span>
            <span>{L('Indicador', 'Indicator')}</span>
          </div>
          <ul className="bd-list" aria-label={L('Empresas con menos de un año que cobraron mucho sin concurso', 'Companies under a year old paid a lot without a tender')}>
            {list.length === 0 && <li className="rg-msg">{L('Ninguna empresa con estos filtros.', 'No company with these filters.')}</li>}
            {list.map((r) => {
              const k = String(r.vendor_id), isOpen = open === k
              return (
                <Fragment key={k}>
                  <FirmLine r={r} pct={shareOf(r, shown)} lang={lang} open={isOpen} onToggle={() => setOpen(isOpen ? null : k)} />
                  {isOpen && <FirmOpen r={r} lang={lang} onClose={() => setOpen(null)} />}
                </Fragment>
              )
            })}
          </ul>
        </div>
        <ul className="bd-legend" aria-label={L('Cómo leer la lista', 'How to read the list')}>
          <li><Glyph p="directa" />{L('sin concurso (adjudicación directa): parte del dinero del primer año', 'no tender (direct award): share of the first year’s money')}</li>
          <li className="bd-lg-gap">
            {(['critical', 'high', 'medium', 'low'] as const).map((l) => (
              <span key={l} className={`bd-st is-${l}`}>{L(LEVEL[l].es, LEVEL[l].en)}{l === 'low' ? ` < ${RISK_THRESHOLDS.medium.toFixed(2)}` : ` ≥ ${RISK_THRESHOLDS[l].toFixed(2)}`}</span>
            ))}
            {L('= indicador de riesgo del primer contrato', '= risk indicator of the first contract')}
          </li>
        </ul>
        {!filtered && !more && shown.length > list.length && (
          <button type="button" className="pt-clear" onClick={() => setMore('1')}>
            {en ? `+ ${nf(shown.length - list.length)} more firms · ${mxn(restMxn)} · show all` : `+ ${nf(shown.length - list.length)} empresas más · ${mxn(restMxn)} · ver todas`}
          </button>
        )}
      </div>

      <ComoLeer lang={lang} steps={en ? [
        { b: 'Each row is a company.', t: '«Days old» is how old it was at its first federal contract: the fewer, the newer the company. «% of total» is its share of the listed firms’ first-year money.' },
        { b: '«First year» is all it was paid', t: 'in the 365 days after that first contract. «No tender» says how much of it came without competing (a direct award).' },
        { b: 'Open › a company', t: 'to see its contracts one by one. The chip is the risk indicator of the first contract: it says where to look, it proves nothing.' },
      ] : [
        { b: 'Cada renglón es una empresa.', t: '«Días de vida» es cuántos días tenía de vida cuando firmó su primer contrato federal: entre menos, más nueva. «% del total» es su parte del dinero del primer año de las empresas de la lista.' },
        { b: '«Primer año» es todo lo que cobró', t: 'en los 365 días que siguieron a ese primer contrato. «Sin concurso» dice qué parte llegó sin competir (adjudicación directa).' },
        { b: 'Abra › una empresa', t: 'para ver sus contratos uno por uno. El chip es el indicador de riesgo del primer contrato: señala dónde mirar, no prueba nada.' },
      ]} />

      <p className="pt-note">{en
        ? <><b>What it does not say.</b> The age comes from the company’s tax ID, so only companies (not individuals) are dated; a firm with no usable ID is counted by its bucket. A new company with direct awards is a known warning sign (World Bank, IMCO), not a wrongdoing: some are emergency suppliers, and special-purpose companies created by law for one tendered contract are left out. Criterion: first contract 2011 or later, ≥ 100 MDP within 365 days, under a year old, at least {pct(DA_MIN)} without a tender. Amounts over 100,000 MDP are excluded.</>
        : <><b>Lo que no dice.</b> La edad sale del registro fiscal (RFC) de la empresa. Por eso solo se fecha a empresas, no a personas. Sin un RFC útil, cuenta su rango. Una empresa nueva con adjudicaciones directas es una señal conocida (Banco Mundial, IMCO), no una falta. Hay proveedores de emergencia. Quedan fuera las empresas que la ley crea para una sola obra concursada. Criterio: primer contrato de 2011 en adelante, ≥ 100 MDP en 365 días, menos de un año de vida, al menos {pct(DA_MIN)} sin concurso. Se excluyen montos mayores a 100,000 MDP.</>}</p>
    </div>
  )
}

function FirmLine({ r, pct: share, lang, open, onToggle }: { r: FirmRow; pct: number; lang: Lang; open: boolean; onToggle: () => void }) {
  const en = lang === 'en'
  const L = (es: string, e: string) => (en ? e : es)
  const lv = r.first_risk_score != null ? getRiskLevelFromScore(r.first_risk_score) : null
  const cat = r.category_id != null && r.category_es ? (en ? r.category_en || r.category_es : r.category_es) : null
  const name = formatEntityName('vendor', r.vendor_name ?? '', 'full')
  const days = r.age_days != null ? `${nf(r.age_days)} d` : null
  return (
    <li className={`bd-row pt-r${open ? ' is-open' : ''}`}>
      <span className="bd-c pt-sel"><Chev open={open} /></span>
      <span className="bd-c pt-bar r">
        <span className="pt-days" aria-hidden="true">{days ?? (en ? '< 1 yr' : '< 1 año')}</span>
        <span className="sr-only">{days ? L(`${nf(r.age_days!)} días de vida al primer contrato`, `${nf(r.age_days!)} days old at the first contract`) : L('menos de un año de vida', 'under a year old')}</span>
      </span>
      <span className="bd-c bd-age"><time dateTime={r.first_date}>{fdate(r.first_date, lang)}</time></span>
      <span className="bd-c bd-buyer">
        {r.institution_name
          ? <Buyer b={{ id: r.institution_id ?? null, name: r.institution_name, siglas: r.institution_siglas, sector: r.sector_id ?? null }} lang={lang} />
          : '—'}
      </span>
      <span className="bd-c bd-vendor"><span className="rg-v">
        {r.vendor_id != null && r.vendor_name ? <EntityIdentityChip type="vendor" id={r.vendor_id} name={r.vendor_name} variant="name" className="bd-chip" /> : <span>{name || '—'}</span>}
      </span></span>
      <span className="bd-c bd-cat" title={cat ?? undefined}>{cat ? categoryShortName(r.category_id!, cat, lang) : <span className="bd-dim">—</span>}</span>
      <span className="bd-c bd-amt r">
        <Toggle scope="firma" k={String(r.vendor_id)} open={open} onToggle={onToggle}
          label={en ? `${name}: ${mxn(r.y1_mxn)} in its first year — ${open ? 'close' : 'open'} its contracts` : `${name}: ${mxn(r.y1_mxn)} en su primer año — ${open ? 'cerrar' : 'abrir'} sus contratos`}>
          {formatColumnMXN(r.y1_mxn)}{r.flag_10b ? ' †' : ''}
        </Toggle>
      </span>
      <span className="bd-c pt-pct r pt-days">{pct(share, 1)}</span>
      <span className="bd-c bd-proc"><span><Glyph p="directa" /><span className="pt-share">{pct(r.y1_da_share)}</span></span></span>
      <span className="bd-c bd-risk">
        {lv ? <span className={`bd-st is-${lv}`}><span className="sr-only">{L('Indicador de riesgo: ', 'Risk indicator: ')}</span>{L(LEVEL[lv].es, LEVEL[lv].en)}</span> : <span className="bd-dim">—</span>}
      </span>
    </li>
  )
}

const OPEN_SHOWN = 8

function FirmOpen({ r, lang, onClose }: { r: FirmRow; lang: Lang; onClose: () => void }) {
  const en = lang === 'en'
  const L = (es: string, e: string) => (en ? e : es)
  const name = formatEntityName('vendor', r.vendor_name ?? '', 'full')
  // a firm's earliest contracts, oldest first: its first year sits at the head (per_page max 100)
  const q = useQuery({
    queryKey: ['patrones', 'arranque', 'firma', r.vendor_id],
    queryFn: () => api.get<ContractListResponse>('/contracts', { params: { vendor_id: r.vendor_id, sort_by: 'contract_date', sort_order: 'asc', per_page: 100 } }).then((x) => x.data),
    staleTime: 60 * 60_000,
  })
  const y1: ContractListItem[] = useMemo(() => (q.data?.data ?? [])
    .filter((c) => inFirstYear(r.first_date, c.contract_date))
    .sort((a, b) => b.amount_mxn - a.amount_mxn), [q.data, r.first_date])
  const first = y1.find((c) => c.id === r.first_contract_id)
  const top = y1.slice(0, OPEN_SHOWN)
  // per_page caps at 100 (oldest first): a firm with more first-year contracts arrives partial
  const partial = y1.length < r.y1_n
  return (
    <Opened scope="firma" k={String(r.vendor_id)} lang={lang} onClose={onClose}
      crumbs={[L('Los patrones', 'Patterns'), L('El arranque', 'The head start'), name]}>
      <RegisterBoard rows={top} lang={lang}
        label={en ? `${name}: its largest contracts in the first year` : `${name}: sus contratos más grandes del primer año`}
        status={q.isLoading ? L('Leyendo sus contratos…', 'Reading its contracts…') : q.isError ? <span role="alert">{L('Sus contratos no cargaron.', 'Its contracts did not load.')}</span> : top.length === 0 ? L('El registro no trae contratos de su primer año.', 'The register shows no contracts for its first year.') : undefined} />
      {top.length > 0 && (
        <div className="pt-footrow">
          <p className="pt-foot">{en
        ? <>{nf(r.y1_n)} contracts in its first year · <b>{mxn(r.y1_mxn)}</b> · {pct(r.y1_da_share)} without a tender{partial ? ` · ${top.length} of them shown (the register returned ${y1.length})` : y1.length > top.length ? ` · the ${top.length} largest shown` : ''}.{first ? <> The first, for {mxn(first.amount_mxn)}, is {pct(first.amount_mxn / r.y1_mxn)} of the year.</> : null}</>
        : <>{nf(r.y1_n)} contratos en su primer año · <b>{mxn(r.y1_mxn)}</b> · {pct(r.y1_da_share)} sin concurso{partial ? ` · se muestran ${top.length} (el registro devolvió ${y1.length})` : y1.length > top.length ? ` · se muestran los ${top.length} más grandes` : ''}.{first ? <> El primero, de {mxn(first.amount_mxn)}, es el {pct(first.amount_mxn / r.y1_mxn)} del año.</> : null}</>}</p>
          {r.vendor_id != null && r.vendor_name && <EntityIdentityChip type="vendor" id={r.vendor_id} name={r.vendor_name} variant="name" className="pt-clear">{L('Ver su expediente ›', 'Open its file ›')}</EntityIdentityChip>}
        </div>
      )}
    </Opened>
  )
}
