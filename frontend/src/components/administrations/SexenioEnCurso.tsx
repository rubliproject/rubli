/**
 * «El sexenio en curso» / «The current term» — federal procurement under Claudia Sheinbaum (from 2024-10-01)
 * against AMLO and Peña Nieto over the same first N days of their terms. Lives inside Sexenios as its
 * section #en-curso (owner 2026-10-28: «it should be in the current one»; /sexenio-actual redirects here).
 * Data: GET /sexenio-actual = precomputed_stats['sexenio_actual'], written by
 * backend/scripts/precompute_sexenio_actual.py (definitions in its docstring). Order: head (data sentence)
 * → En cifras → the month series → the three-term ledger → buyers | suppliers → largest contracts
 * → first-time suppliers | urgency awards → notes.
 */
import { RankCell, RankTh } from '@/components/kit/ListRow'
import { COL, ListHead, type Col } from '@/components/kit/ListCells'
import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { api } from '@/api/client'
import { Clause } from '@/components/contrato/Clause'
import { FoldToggle, useRowFold } from '@/components/contrato/Fold'
import { RiskGauge, RiskGaugeScale } from '@/components/contrato/RiskGauge'
import { useLang, type Lang } from '@/components/contrato/nav'
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import { Notes, fdate, nf } from '@/components/newtabs/ntShared'
import { ADMIN_COLORS } from '@/lib/administrations'
import { CURRENT_MODEL_VERSION, PARTIAL_YEAR_NOTE } from '@/lib/constants'
import { formatCompactMXN, formatDualCurrency } from '@/lib/utils'
import '@/components/kit/kit.css'
import './sexenio-en-curso.css'

type Share = number | null
interface Summary { n: number; value: number; value_real?: number; da_n: Share; da_v: Share; sb: Share; hc_n: Share; hc_v: Share; flagged: number }
interface Term extends Summary { key: 'sheinbaum' | 'amlo' | 'pena_nieto'; start: string; end: string }
interface Month { month: string; n: number; value: number; da_v: Share; da_n: Share; hc_n: Share; hc_v: Share }
interface Buyer { id: number; name: string | null; siglas: string | null; n: number; value: number; share: Share; da_v: Share }
interface Supplier { id: number; name: string | null; n: number; value: number; share: Share; da_v: Share; first_date?: string }
interface Big { id: number; title: string | null; institution_id: number; institution: string | null; vendor_id: number | null; vendor: string | null; persona_fisica: boolean; amount: number; date: string; procedure: string | null; risk_level: string | null; risk_score: number | null; flagged: boolean }
interface Data {
  meta: { cut: string; start: string; days: number; source_switch: string; comprasmx_n: number; comprasmx_federal_share_v: Share; pf_suppliers: { vendors: number; n: number; value: number } }
  series: Month[]
  comparison: Term[]
  buyers: Buyer[]
  suppliers: Supplier[]
  largest: Big[]
  first_time: { n: number; value: number; pf_n: number; pf_value: number; top: Supplier[] }
  urgency: { n: number; value: number; share_v: Share; months: { month: string; n: number; value: number }[]; buyers: { id: number; name: string | null; n: number; value: number }[] }
  updated_at: string
}

const TERM_NAME: Record<Term['key'], string> = { sheinbaum: 'Sheinbaum', amlo: 'AMLO', pena_nieto: 'Peña Nieto' }
const TERM_COLOR: Record<Term['key'], string> = { sheinbaum: ADMIN_COLORS.sheinbaum, amlo: ADMIN_COLORS.amlo, pena_nieto: ADMIN_COLORS.epn }
const MES = { es: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'], en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] }
const pc = (x: Share, d = 0) => (x == null ? '—' : `${(x * 100).toFixed(d)}%`)
const monthLabel = (ym: string, lang: Lang) => `${MES[lang][Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`

/** One month per column: the total as a bar, its `part` (direct award, urgency…) inked from the base. */
function MonthBars({ rows, lang, label, partLabel, restLabel, switchIso }: {
  rows: { month: string; total: number; part: number }[]; lang: Lang; label: string; partLabel: string; restLabel?: string; switchIso?: string
}) {
  const max = Math.max(1, ...rows.map((r) => r.total))
  const sw = switchIso ? rows.findIndex((r) => r.month === switchIso.slice(0, 7)) : -1
  const swAt = sw >= 0 ? (sw + Number(switchIso!.slice(8, 10)) / 31) / rows.length : null
  return (
    <figure className="sx-bars-fig">
      <div className="sx-legend ct-mono">
        <span><i className="sx-sw is-part" aria-hidden="true" />{partLabel}</span>
        {restLabel && <span><i className="sx-sw is-rest" aria-hidden="true" />{restLabel}</span>}
        <span>{lang === 'en' ? 'tallest bar' : 'barra más alta'} {formatCompactMXN(max)}</span>
      </div>
      <div className="sx-plot">
        {swAt != null && (
          <span className="sx-switch" style={{ left: `${swAt * 100}%` }}>
            <span className="sx-switch-t ct-mono">CompraNet → ComprasMX</span>
          </span>
        )}
        <div className="sx-bars" role="img" aria-label={label} style={{ ['--m' as string]: rows.length }}>
          {rows.map((r) => (
            <div key={r.month} className="sx-col" title={`${monthLabel(r.month, lang)} · ${formatCompactMXN(r.total)} · ${partLabel} ${formatCompactMXN(r.part)}`}>
              <span className="sx-bar" style={{ height: `${(r.total / max) * 100}%` }}>
                <span className="sx-part" style={{ height: r.total ? `${(r.part / r.total) * 100}%` : 0 }} />
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="sx-axis ct-mono" aria-hidden="true" style={{ ['--m' as string]: rows.length }}>
        {rows.map((r) => <span key={r.month}>{r.month.endsWith('-01') || r.month.endsWith('-07') ? monthLabel(r.month, lang) : ''}</span>)}
      </div>
    </figure>
  )
}

/** policy 10-29: a persona física is named and labelled; a null name = an RFC-shaped name, never shown */
function SupplierCell({ s, lang }: { s: { id: number | null; name: string | null; pf?: boolean }; lang: Lang }) {
  const tag = s.pf ? <span className="sx-muted">{lang === 'en' ? ' · individual (persona física)' : ' · persona física'}</span> : null
  return s.id != null && s.name
    ? <><EntityIdentityChip type="vendor" id={s.id} name={s.name} size="inherit" fullName hideIcon inline />{tag}</>
    : <span className="sx-muted">{s.pf ? (lang === 'en' ? 'Individual (name not published)' : 'Persona física (no se publica el nombre)') : (lang === 'en' ? 'Name not published' : 'Nombre no publicado')}</span>
}

function RankTable({ rows, kind, lang, total }: { rows: (Buyer | Supplier)[]; kind: 'institution' | 'vendor'; lang: Lang; total: string }) {
  const en = lang === 'en'
  const f = useRowFold(rows, 10)
  const id = `sx-${kind}`
  return (
    <>
      <table className="ct-table ct-stack" id={id}>
        <thead><tr><RankTh lang={lang} /><th scope="col">{kind === 'vendor' ? (en ? 'Supplier' : 'Proveedor') : (en ? 'Buyer' : 'Comprador')}</th><th scope="col" className="num">{en ? 'Amount' : 'Monto'}</th><th scope="col" className="num">{total}</th><th scope="col" className="num">{en ? 'Direct award' : 'Adj. directa'}</th></tr></thead>
        <tbody>
          {f.shown.map((r, i) => (
            <tr key={r.id} className={f.rowIn(i)}>
              <RankCell n={i + 1} />
              <td className="ct-key">{kind === 'vendor' ? <SupplierCell s={r} lang={lang} /> : <EntityIdentityChip type="institution" id={r.id} name={r.name} size="inherit" fullName hideIcon />}</td>
              <td className="num ct-amt" data-l={en ? 'amount' : 'monto'}>{formatCompactMXN(r.value)}</td>
              <td className="num" data-l={en ? 'of the term' : 'del sexenio'}>{pc(r.share, 1)}</td>
              <td className="num" data-l={en ? 'direct award' : 'adj. directa'}>{pc(r.da_v)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <FoldToggle open={f.open} rest={f.rest} onToggle={f.toggle} controls={id} />
    </>
  )
}

/** Section head + one plain sentence: what the block shows and why it matters (owner 2026-10-28: «not digestible»). */
function Head({ id, es, en, lang, aside, lede }: { id: string; es: string; en: string; lang: Lang; aside?: string; lede?: string }) {
  return (
    <>
      <div className="ct-annex-row">
        <h2 id={id} className="ct-h2">{lang === 'en' ? en : es}</h2>
        {aside && <span className="sx-muted">{aside}</span>}
      </div>
      {lede && <p className="ct-annex-lede">{lede}</p>}
    </>
  )
}

/** `notes` = the page's other foot notes, listed first (one notes block per page). */
export function SexenioEnCurso({ notes = [] }: { notes?: string[] }) {
  const lang = useLang()
  const en = lang === 'en'
  const L = (es: string, e: string) => (en ? e : es)
  const q = useQuery({
    queryKey: ['sexenio-actual'],
    queryFn: () => api.get<Data>('/sexenio-actual', { timeout: 60_000 }).then((r) => r.data),
    staleTime: 60 * 60_000,
    retry: (n, e) => !(isAxiosError(e) && e.response?.status === 404) && n < 1,
  })
  const d = q.data
  const big = useRowFold(d?.largest ?? [], 10)
  const missing = isAxiosError(q.error) && q.error.response?.status === 404
  const [s, amlo, pn] = d?.comparison ?? []
  const fed = d?.meta.comprasmx_federal_share_v ?? 0.93

  // the section sits below the Aluvión and fills in late: honour /administrations#en-curso once it has data
  useEffect(() => {
    if (d && window.location.hash === '#en-curso') document.getElementById('en-curso')?.scrollIntoView({ block: 'start' })
  }, [d])

  const title = <h2 id="en-curso-h" className="ct-h2">{L('El sexenio en curso', 'The current term')}</h2>
  if (!d || !s) {
    return (
      <section id="en-curso" className="ct-section" aria-labelledby="en-curso-h">
        <div className="ct-annex-row">{title}</div>
        {q.isLoading ? (
          <div className="nt-skel sx-skel" aria-busy="true"><span className="ct-note">{L('Leyendo los contratos del sexenio…', 'Reading the term’s contracts…')}</span></div>
        ) : (
          <p className="nt-empty">{missing
            ? L('El monitor del sexenio en curso todavía no se ha calculado. Vuelva pronto.', 'The current-term monitor has not been computed yet. Check back soon.')
            : L('Los datos del sexenio en curso no cargaron. Recargue la página.', 'The current-term data did not load. Reload the page.')}</p>
        )}
      </section>
    )
  }

  const m = d.meta
  const days = nf(m.days)
  // terms twelve years apart compare in constant pesos (INPC, base 2024); nominal kept as its own row
  const real = (t?: Term) => (t ? t.value_real ?? t.value : 0)
  // term preset (DESIGN.md §8.1): one row per government · amount · without tender · high/critical, then the page's own columns
  const comparisonCols: (Col & { l: [string, string]; f: (t: Term) => string })[] = [
    { ...COL.amount, es: 'Monto, pesos de 2024', en: 'Amount, 2024 pesos', l: ['monto 2024', 'amount 2024'], f: (t) => formatCompactMXN(real(t)) },
    { ...COL.da, es: 'Sin concurso, por monto', en: 'No tender, by amount', l: ['sin concurso', 'no tender'], f: (t) => pc(t.da_v, 1) },
    { ...COL.highcrit, es: 'Alto o crítico, por monto', en: 'High or critical, by amount', l: ['alto o crítico', 'high or critical'], f: (t) => pc(t.hc_v, 1) },
    { key: 'nominal', es: 'Monto nominal', en: 'Nominal amount', num: true, l: ['nominal', 'nominal'], f: (t) => formatCompactMXN(t.value) },
    { ...COL.contracts, l: ['contratos', 'contracts'], f: (t) => nf(t.n) },
    { key: 'da_n', es: 'Sin concurso, por contratos', en: 'No tender, by contracts', num: true, l: ['sin concurso (contratos)', 'no tender (contracts)'], f: (t) => pc(t.da_n, 1) },
    { key: 'sb', es: 'Procedimientos con un solo adjudicado', en: 'Single-award procedures', num: true, l: ['un solo adjudicado', 'single award'], f: (t) => pc(t.sb, 1) },
    { key: 'hc_n', es: 'Alto o crítico, por contratos', en: 'High or critical, by contracts', num: true, l: ['alto o crítico (contratos)', 'high or critical (contracts)'], f: (t) => pc(t.hc_n, 1) },
    { key: 'flagged', es: 'Contratos de más de 10,000 MDP †', en: 'Contracts above 10B MXN †', num: true, l: ['> 10,000 MDP †', '> 10B MXN †'], f: (t) => nf(t.flagged) },
  ]

  return (
    <section id="en-curso" aria-labelledby="en-curso-h">
      <div className="ct-annex-row">
        {title}
        <span className="sx-muted">{PARTIAL_YEAR_NOTE[lang]}</span>
      </div>
      <p className="sx-thesis">{en
          ? `In ${days} days the Sheinbaum government signed contracts worth ${formatDualCurrency(real(s))}. ${Math.round((s.da_v ?? 0) * 100)} of every 100 pesos went out without a tender.`
          : `En ${days} días, el gobierno de Sheinbaum firmó contratos por ${formatDualCurrency(real(s))}. ${Math.round((s.da_v ?? 0) * 100)} de cada 100 pesos se dieron sin concurso.`}</p>
      <p className="ct-annex-lede">{en
          ? `That is about what Peña Nieto spent in his first ${days} days (${formatDualCurrency(real(pn))}) and more than AMLO (${formatDualCurrency(real(amlo))}). All in 2024 pesos, so the years compare fairly. Data from ${fdate(m.start, lang)} to ${fdate(m.cut, lang)}.`
          : `Es casi lo mismo que gastó Peña Nieto en sus primeros ${days} días (${formatDualCurrency(real(pn))}) y más que AMLO (${formatDualCurrency(real(amlo))}). Todo en pesos de 2024, para comparar parejo. Datos del ${fdate(m.start, lang)} al ${fdate(m.cut, lang)}.`}</p>

      <section className="ct-clauses" aria-labelledby="sx-cl-h">
        <h2 id="sx-cl-h" className="sr-only">{L('En cifras', 'In figures')}</h2>
        <div className="ct-cl-grid">
          <Clause id="sx-value" title={L(`Monto, primeros ${days} días`, `Amount, first ${days} days`)} fig={formatCompactMXN(real(s))}
            note={L(`pesos de 2024 · AMLO: ${formatCompactMXN(real(amlo))} · Peña Nieto: ${formatCompactMXN(real(pn))}`, `2024 pesos · AMLO: ${formatCompactMXN(real(amlo))} · Peña Nieto: ${formatCompactMXN(real(pn))}`)} />
          <Clause id="sx-n" title={L('Contratos', 'Contracts')} fig={nf(s.n)}
            note={L(`${nf(m.comprasmx_n)} de ComprasMX desde el ${fdate(m.source_switch, lang)}`, `${nf(m.comprasmx_n)} from ComprasMX since ${fdate(m.source_switch, lang)}`)} />
          <Clause id="sx-da" title={L('Sin concurso (adjudicación directa)', 'No tender (direct award)')} fig={pc(s.da_v, 1)}
            ruler={s.da_v != null ? { value: s.da_v, mode: 'fill', ends: ['0%', `AMLO ${pc(amlo?.da_v ?? null)}`, '100%'] } : undefined} />
          <Clause id="sx-hc" title={L('Dinero con riesgo alto o crítico', 'Money at high or critical risk')} fig={pc(s.hc_v, 1)}
            note={L(`${pc(s.hc_n, 1)} de los contratos · indicador de riesgo, no prueba`, `${pc(s.hc_n, 1)} of contracts · a risk indicator, not proof`)} />
        </div>
      </section>

      <section className="ct-section" aria-labelledby="sx-s1">
        <Head id="sx-s1" lang={lang} es="Mes a mes" en="Month by month" aside={PARTIAL_YEAR_NOTE[lang]}
          lede={L('Cada barra es lo que el gobierno contrató en un mes. La parte oscura se dio sin concurso. La línea punteada marca el cambio de CompraNet a ComprasMX.',
            'Each bar is what the government contracted in one month. The dark part went out without a tender. The dotted line marks the switch from CompraNet to ComprasMX.')} />
        <div className="ct-section-body">
          <MonthBars
            lang={lang} switchIso={m.source_switch}
            rows={d.series.map((r) => ({ month: r.month, total: r.value, part: r.value * (r.da_v ?? 0) }))}
            label={L('Monto contratado por mes desde octubre de 2024, con la parte adjudicada directamente', 'Amount contracted per month since October 2024, with the directly awarded part')}
            partLabel={L('adjudicación directa', 'direct award')} restLabel={L('licitación e invitación', 'tender and invitation')}
          />
        </div>
      </section>

      <section className="ct-section" aria-labelledby="sx-s2">
        <Head id="sx-s2" lang={lang} es={`Tres gobiernos, los mismos primeros ${days} días`} en={`Three governments, the same first ${days} days`}
          lede={L(`Para comparar parejo contamos los mismos primeros ${days} días de cada gobierno y pasamos todo a pesos de 2024.`, `To compare fairly we count the same first ${days} days of each government, all in 2024 pesos.`)} />
        <div className="ct-section-body ct-table-wrap">
          <table className="ct-table ct-stack sx-cmp">
            <ListHead cols={[COL.term, ...comparisonCols]} lang={lang} />
            <tbody>
              {d.comparison.map((t) => (
                <tr key={t.key}>
                  <td className="ct-key">
                    <span className="ct-sq" style={{ ['--c' as string]: TERM_COLOR[t.key] }} aria-hidden="true" />{TERM_NAME[t.key]}
                    <small>{fdate(t.start, lang)} – {fdate(t.end, lang)}</small>
                  </td>
                  {comparisonCols.map((c, i) => (
                    <td key={c.key} className={i === 0 ? 'num ct-amt' : 'num'} data-l={c.l[en ? 1 : 0]}>{c.f(t)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="ct-duo">
        <section className="ct-section" aria-labelledby="sx-s3">
          <Head id="sx-s3" lang={lang} es="Quién compra" en="Who buys" aside={L('15 mayores compradores', 'top 15 buyers')}
            lede={L(`Estas 15 instituciones firmaron ${Math.round(d.buyers.reduce((a, b) => a + (b.share ?? 0), 0) * 100)} de cada 100 pesos del sexenio.`, `These 15 institutions signed ${Math.round(d.buyers.reduce((a, b) => a + (b.share ?? 0), 0) * 100)} of every 100 pesos of the term.`)} />
          <div className="ct-section-body"><RankTable rows={d.buyers} kind="institution" lang={lang} total={L('Del sexenio', 'Of the term')} /></div>
        </section>
        <section className="ct-section" aria-labelledby="sx-s4">
          <Head id="sx-s4" lang={lang} es="A quién le compra" en="Who sells" aside={L('15 mayores proveedores', 'top 15 suppliers')}
            lede={L('Las 15 empresas que más dinero recibieron. La última columna dice cuánto les llegó sin concurso.', 'The 15 companies that received the most. The last column says how much came without a tender.')} />
          <div className="ct-section-body">
            <RankTable rows={d.suppliers} kind="vendor" lang={lang} total={L('Del sexenio', 'Of the term')} />
            {m.pf_suppliers.vendors > 0 && (
              <p className="ct-note">{L(
                `Personas físicas, contadas aparte de esta lista: ${nf(m.pf_suppliers.vendors)} proveedores, ${formatCompactMXN(m.pf_suppliers.value)}. Su ficha las nombra con la etiqueta «persona física»; su RFC personal nunca se muestra.`,
                `Individuals, counted apart from this list: ${nf(m.pf_suppliers.vendors)} suppliers, ${formatCompactMXN(m.pf_suppliers.value)}. Their dossier names them, labelled «persona física»; their personal RFC is never shown.`)}</p>
            )}
          </div>
        </section>
      </div>

      <section className="ct-section" aria-labelledby="sx-s5">
        <Head id="sx-s5" lang={lang} es="Los contratos más grandes" en="The largest contracts" aside={L('† más de 10,000 MDP: revisar antes de citar', '† above 10B MXN: check before citing')}
        lede={L('El indicador de riesgo dice qué tanto se parece un contrato a los de proveedores que después aparecen vinculados a casos documentados. Es una señal para revisar, no una prueba.', 'The risk indicator says how closely a contract resembles those of vendors later linked to documented cases. It is a signal to check, not proof.')} />
        <div className="ct-section-body ct-table-wrap">
          <table className="ct-table ct-stack" id="sx-big">
            <thead>
              <tr>
                <RankTh lang={lang} />
                <th scope="col">{L('Contrato', 'Contract')}</th>
                <th scope="col">{L('Comprador · proveedor', 'Buyer · supplier')}</th>
                <th scope="col" className="num">{L('Monto', 'Amount')}</th>
                <th scope="col" className="num">{L('Inicio', 'Start')}</th>
                <th scope="col" className="gauge">{L('Indicador de riesgo', 'Risk indicator')} <RiskGaugeScale /></th>
              </tr>
            </thead>
            <tbody>
              {big.shown.map((r, i) => (
                <tr key={r.id} className={big.rowIn(i)}>
                  <RankCell n={i + 1} />
                  <td className="ct-key">
                    <Link className="ct-link" to={`/contracts/${r.id}`}>{r.title || `#${r.id}`}</Link>
                    {r.procedure && <span className="sx-proc">{r.procedure.toLowerCase()}</span>}
                  </td>
                  <td data-l={L('comprador · proveedor', 'buyer · supplier')}>
                    <div><EntityIdentityChip type="institution" id={r.institution_id} name={r.institution} size="inherit" fullName hideIcon /></div>
                    <div><SupplierCell s={{ id: r.vendor_id, name: r.vendor, pf: r.persona_fisica }} lang={lang} /></div>
                  </td>
                  <td className="num ct-amt" data-l={L('monto', 'amount')}>{formatCompactMXN(r.amount)}{r.flagged ? ' †' : ''}</td>
                  <td className="num" data-l={L('inicio', 'start')}>{fdate(r.date, lang)}</td>
                  <td className="gauge"><RiskGauge value={r.risk_score} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <FoldToggle open={big.open} rest={big.rest} onToggle={big.toggle} controls="sx-big" />
        </div>
      </section>

      <section className="ct-section" aria-labelledby="sx-s6">
        <Head id="sx-s6" lang={lang} es="Proveedores nuevos" en="First-time suppliers"
          aside={L(`${nf(d.first_time.n)} con 100 MDP o más · ${formatCompactMXN(d.first_time.value)}`, `${nf(d.first_time.n)} with 100M MXN or more · ${formatCompactMXN(d.first_time.value)}`)} />
        <p className="ct-annex-lede">{L(
          `Empresas que nunca le habían vendido al gobierno federal y que en este sexenio ya recibieron 100 millones de pesos o más. ${nf(d.first_time.pf_n)} son personas físicas: se cuentan aparte de la tabla; su RFC personal nunca se muestra.`,
          `Companies that had never sold to the federal government and have already received 100 million pesos or more this term. ${nf(d.first_time.pf_n)} are individuals: counted apart from the table; their personal RFC is never shown.`)}</p>
        <div className="ct-section-body"><FirstTable rows={d.first_time.top} lang={lang} /></div>
      </section>

      <section className="ct-section" aria-labelledby="sx-s7">
        <Head id="sx-s7" lang={lang} es="Por urgencia o caso fortuito" en="Urgency and force majeure"
          aside={L(`${nf(d.urgency.n)} contratos · ${formatCompactMXN(d.urgency.value)} · ${pc(d.urgency.share_v, 1)} del monto`, `${nf(d.urgency.n)} contracts · ${formatCompactMXN(d.urgency.value)} · ${pc(d.urgency.share_v, 1)} of the amount`)} />
        <p className="ct-annex-lede">{L(
          `La ley deja saltarse el concurso en una emergencia («urgencia» o «caso fortuito»). En este sexenio, ${Math.round((d.urgency.share_v ?? 0) * 100)} de cada 100 pesos se contrataron así.`,
          `The law allows skipping the tender in an emergency («urgency» or «force majeure»). This term, ${Math.round((d.urgency.share_v ?? 0) * 100)} of every 100 pesos were contracted that way.`)}</p>
        <div className="ct-section-body ct-duo sx-urg-duo">
          <MonthBars lang={lang} switchIso={m.source_switch}
            rows={d.urgency.months.map((r) => ({ month: r.month, total: r.value, part: r.value }))}
            label={L('Monto adjudicado por urgencia o caso fortuito, por mes', 'Amount awarded for urgency or force majeure, per month')}
            partLabel={L('urgencia o caso fortuito', 'urgency or force majeure')} />
          {d.urgency.buyers.length > 0 && (
            <table className="ct-table ct-stack sx-urg">
              <thead><tr><RankTh lang={lang} /><th scope="col">{L('Quién la invoca', 'Who invokes it')}</th><th scope="col" className="num">{L('Contratos', 'Contracts')}</th><th scope="col" className="num">{L('Monto', 'Amount')}</th></tr></thead>
              <tbody>
                {d.urgency.buyers.map((b, i) => (
                  <tr key={b.id}>
                    <RankCell n={i + 1} />
                    <td className="ct-key"><EntityIdentityChip type="institution" id={b.id} name={b.name} size="inherit" fullName hideIcon /></td>
                    <td className="num" data-l={L('contratos', 'contracts')}>{nf(b.n)}</td>
                    <td className="num ct-amt" data-l={L('monto', 'amount')}>{formatCompactMXN(b.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <Notes lang={lang} lead={en
        ? `High or critical = the risk indicator of model ${CURRENT_MODEL_VERSION} at 0.40 or above. It is an indicator, not proof of wrongdoing. Individuals (personas físicas) are counted apart in these tables and named, labelled «persona física», in their dossier; their personal RFC is never shown.`
        : `Alto o crítico = indicador de riesgo del modelo ${CURRENT_MODEL_VERSION} de 0.40 o más. Es un indicador, no una prueba de irregularidad. Las personas físicas se cuentan aparte en estas tablas y se nombran, con la etiqueta «persona física», en su ficha; su RFC personal nunca se muestra.`} items={[...notes, ...(en ? [
        `Window: contracts whose start date falls between ${fdate(m.start, lang)} and the ${fdate(m.cut, lang)} cut (${days} days); AMLO from Dec 1, 2018 and Peña Nieto from Dec 1, 2012 over the same number of days. ${PARTIAL_YEAR_NOTE.en}; the last months fill in as ComprasMX publishes.`,
        `Sources: CompraNet up to ${fdate(m.source_switch, lang)}, ComprasMX open data after it. ComprasMX covers mostly federal agencies (${pc(fed)} of its amount); the rest are states and municipalities spending federal money.`,
        'Amounts above 100B MXN are excluded as capture errors; † marks contracts above 10B MXN, kept but to be checked before citing. Single award = a tender or invitation won by one vendor (CompraNet records winners, not bidders).',
      ] : [
        `Ventana: contratos cuya fecha de inicio cae entre el ${fdate(m.start, lang)} y el corte del ${fdate(m.cut, lang)} (${days} días); AMLO desde el 1 dic 2018 y Peña Nieto desde el 1 dic 2012, por el mismo número de días. ${PARTIAL_YEAR_NOTE.es}; los últimos meses se completan conforme ComprasMX publica.`,
        `Fuentes: CompraNet hasta el ${fdate(m.source_switch, lang)} y los datos abiertos de ComprasMX después. ComprasMX cubre sobre todo dependencias federales (${pc(fed)} de su monto); el resto son estados y municipios que gastan dinero federal.`,
        'Se excluyen montos de más de 100,000 MDP por error de captura; † marca contratos de más de 10,000 MDP, que se conservan pero deben revisarse antes de citar. Un solo adjudicado = licitación o invitación que ganó un solo proveedor (CompraNet registra ganadores, no postores).',
      ])]} />
    </section>
  )
}

function FirstTable({ rows, lang }: { rows: Supplier[]; lang: Lang }) {
  const en = lang === 'en'
  const f = useRowFold(rows, 10)
  return (
    <>
      <table className="ct-table ct-stack" id="sx-first">
        <thead><tr><RankTh lang={lang} /><th scope="col">{en ? 'Supplier' : 'Proveedor'}</th><th scope="col" className="num">{en ? 'First contract' : 'Primer contrato'}</th><th scope="col" className="num">{en ? 'Amount' : 'Monto'}</th><th scope="col" className="num">{en ? 'Direct award' : 'Adj. directa'}</th></tr></thead>
        <tbody>
          {f.shown.map((r, i) => (
            <tr key={r.id} className={f.rowIn(i)}>
              <RankCell n={i + 1} />
              <td className="ct-key"><SupplierCell s={r} lang={lang} /></td>
              <td className="num" data-l={en ? 'first contract' : 'primer contrato'}>{fdate(r.first_date, lang)}</td>
              <td className="num ct-amt" data-l={en ? 'amount' : 'monto'}>{formatCompactMXN(r.value)}</td>
              <td className="num" data-l={en ? 'direct award' : 'adj. directa'}>{pc(r.da_v)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <FoldToggle open={f.open} rest={f.rest} onToggle={f.toggle} controls="sx-first" />
    </>
  )
}
