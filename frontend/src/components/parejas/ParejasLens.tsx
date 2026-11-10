/**
 * ParejasLens — «Las Parejas», a dossier lens (owner verdict: a lens, not a page). Frozen definition:
 * docs/NEWTABS_DEFINITIONS.md § 3. For one vendor (or one institution) it lists every buyer–vendor pair with
 * ≥ 10 distinct contract years, as a year ledger 2002–2026; a pair is marked when it meets the frozen rule:
 * ≥ 10 CONSECUTIVE years and ≥ 80% of its money since 2011 by direct award or single bid.
 *
 *   L1 hover a year cell → its money; hover a row → the row inks
 *   L2 click a row → the safe sentence, the shares, the contracts of the pair (/contracts?vendor_id=&institution_id=)
 *   L4 «Sin competencia ⇄ Todas las de 10 años o más»
 * Self-contained: mount with `<ParejasLens vendorId={id} />` or `<ParejasLens institutionId={id} />`.
 * Never «captura», «colusión»; personas físicas are named and labelled «persona física» (policy 10-29), never their RFC; no shares before 2011.
 */
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useLang } from '@/components/contrato/nav'
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import { DATA_LAST_YEAR, RAMP_AMOUNT } from '@/lib/constants'
import { formatEntityName } from '@/lib/entity/format'
import { api } from '@/api/client'
import { formatCompactMXN, formatNumber } from '@/lib/utils'
import './parejas.css'

interface Pair {
  vendor_id: number; vendor_name: string | null; is_pf: boolean; institution_id: number; institution_name: string; siglas: string | null
  n_years: number; max_run: number; first_year: number; last_year: number; money_mxn: number; money_2011: number
  da_share: number | null; noncomp_share: number | null; frozen: boolean; flag_10b: boolean; years: [number, number][]
}
interface Resp { available: boolean; rows: Pair[]; meta: { n: number } }

const Y0 = 2002
const Y1 = DATA_LAST_YEAR
const YEARS = Array.from({ length: Y1 - Y0 + 1 }, (_, i) => Y0 + i)
const SEXENIOS: Array<[number, number, string]> = [[2002, 2006, 'Fox'], [2007, 2012, 'Calderón'], [2013, 2018, 'Peña Nieto'], [2019, 2024, 'AMLO'], [2025, DATA_LAST_YEAR, 'Sheinbaum']]
const NONE: Pair[] = []
const STEP = 100 // expanded rows render 100 at a time (up to 2,000 pairs × 24 cells otherwise)
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const pct = (x: number | null) => (x == null ? '—' : `${Math.round(x * 100)}%`)
/** The longest run of consecutive years, as [first, last]. */
function runOf(ys: number[]): [number, number] {
  let best: [number, number] = [ys[0], ys[0]], a = ys[0]
  for (let i = 1; i <= ys.length; i++) {
    if (i < ys.length && ys[i] === ys[i - 1] + 1) continue
    if (ys[i - 1] - a > best[1] - best[0]) best = [a, ys[i - 1]]
    a = ys[i]
  }
  return best
}

export function ParejasLens({ vendorId, institutionId }: { vendorId?: number; institutionId?: number }) {
  const lang = useLang()
  const en = lang === 'en'
  const L = (es: string, e: string) => (en ? e : es)
  const side: 'vendor' | 'institution' = vendorId != null ? 'vendor' : 'institution'
  const q = useQuery({
    queryKey: ['newtabs', 'parejas', vendorId ?? null, institutionId ?? null],
    queryFn: () => api.get<Resp>('/newtabs/parejas', { params: { vendor_id: vendorId, institution_id: institutionId, limit: 2000 } }).then((r) => r.data),
    enabled: vendorId != null || institutionId != null,
    staleTime: 60 * 60_000,
  })
  const [todas, setTodas] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const [cell, setCell] = useState<{ k: string; y: number; v: number } | null>(null)
  const [limit, setLimit] = useState(12)
  const rows = q.data?.available && !q.isPlaceholderData ? q.data.rows : NONE
  const frozen = useMemo(() => rows.filter((p) => p.frozen), [rows])
  const shown = useMemo(() => (todas || !frozen.length ? rows : frozen), [rows, frozen, todas])
  // one tone scale for the lens: quintiles of the yearly money across shown cells
  const cuts = useMemo(() => {
    const v = shown.flatMap((p) => p.years.map(([, m]) => m)).sort((a, b) => a - b)
    return v.length ? [0.2, 0.4, 0.6, 0.8].map((f) => v[Math.floor(f * (v.length - 1))]) : []
  }, [shown])
  const tone = (m: number) => RAMP_AMOUNT[cuts.filter((c) => m > c).length]

  if (q.isLoading || q.isPlaceholderData) return <section className="pj" aria-busy="true"><p className="pj-k">§ {L('Las Parejas', 'The Pairs')}</p><div className="pj-skel" /></section>
  if (q.isError || !q.data?.available) return null
  const key = (p: Pair) => `${p.vendor_id}-${p.institution_id}`
  const pfTag = L(' (persona física)', ' (individual)')
  const nameOf = (p: Pair) => (side === 'vendor'
    ? formatEntityName('institution', p.institution_name, 'full')
    : p.vendor_name ? formatEntityName('vendor', p.vendor_name, 'full') + (p.is_pf ? pfTag : '') : p.is_pf ? L('Una persona física', 'An individual') : L('Nombre no publicado (es un RFC)', 'Name withheld (it is an RFC)'))
  const vendorOf = (p: Pair) => (p.vendor_name ? formatEntityName('vendor', p.vendor_name, 'full') + (p.is_pf ? pfTag : '') : p.is_pf ? L('una persona física', 'an individual') : L('el proveedor', 'the vendor'))
  const say = (p: Pair) => {
    const [a, b] = runOf(p.years.map(([y]) => y))
    return L(
      `${cap(vendorOf(p))} tuvo contratos con ${formatEntityName('institution', p.institution_name, 'full')} ${p.max_run} años seguidos (${a}–${b}); desde 2011, el ${pct(p.noncomp_share)} de ese dinero fue por adjudicación directa o con un solo adjudicado.`,
      `${cap(vendorOf(p))} held contracts with ${formatEntityName('institution', p.institution_name, 'full')} for ${p.max_run} consecutive years (${a}–${b}); since 2011, ${pct(p.noncomp_share)} of that money went by direct award or with a single award.`)
  }
  const list = shown.slice(0, limit)
  const left = shown.length - list.length

  return (
    <section className="pj" aria-label={L('Las Parejas', 'The Pairs')}>
      <div className="pj-head">
        <p className="pj-k">§ {L('Las Parejas', 'The Pairs')}</p>
        <h3 className="pj-h">
          {!rows.length
            ? L(`Ninguna ${side === 'vendor' ? 'institución' : 'empresa'} le compra o vende 10 años o más.`, `No ${side === 'vendor' ? 'institution' : 'vendor'} pairs with it for 10 years or more.`)
            : frozen.length
              ? L(`${formatNumber(frozen.length)} ${frozen.length === 1 ? 'pareja cumple' : 'parejas cumplen'} 10 años seguidos sin competencia.`, `${formatNumber(frozen.length)} ${frozen.length === 1 ? 'pair meets' : 'pairs meet'} 10 consecutive years without competition.`)
              : L(`${formatNumber(rows.length)} ${rows.length === 1 ? 'pareja' : 'parejas'} de 10 años o más; ninguna cumple 10 años seguidos sin competencia.`, `${formatNumber(rows.length)} ${rows.length === 1 ? 'pair' : 'pairs'} of 10 years or more; none meets 10 consecutive years without competition.`)}
        </h3>
        {frozen.length > 0 && rows.length > frozen.length && (
          <div className="pj-lens" role="group" aria-label={L('Parejas', 'Pairs')}>
            <button type="button" aria-pressed={!todas} onClick={() => setTodas(false)}>{L(`Sin competencia · ${formatNumber(frozen.length)}`, `No competition · ${formatNumber(frozen.length)}`)}</button>
            <button type="button" aria-pressed={todas} onClick={() => setTodas(true)}>{L(`10 años o más · ${formatNumber(rows.length)}`, `10 years or more · ${formatNumber(rows.length)}`)}</button>
          </div>
        )}
      </div>

      {rows.length > 0 && (
        <div className="pj-scroll">
          <div className="pj-grid" role="table" aria-label={L('Años con contratos por pareja', 'Contract years per pair')}>
            <div className="pj-row is-sx" role="row" aria-hidden="true">
              <span />
              <span className="pj-years">{SEXENIOS.map(([a, b, n]) => <i key={n} style={{ gridColumn: `${a - Y0 + 1} / ${b - Y0 + 2}` }}>{n}</i>)}</span>
              <span />
            </div>
            <div className="pj-row is-head" role="row">
              <span role="columnheader">{side === 'vendor' ? L('Institución', 'Institution') : L('Proveedor', 'Vendor')}</span>
              <span role="columnheader" className="pj-years">{YEARS.map((y) => <b key={y}>{y % 4 === 2 ? y : ''}</b>)}</span>
              <span role="columnheader" className="pj-num">{L('Monto · sin competencia', 'Amount · no competition')}</span>
            </div>
            {list.map((p) => {
              const k = key(p)
              const by = new Map(p.years)
              const [ra, rb] = runOf(p.years.map(([y]) => y))
              const isOpen = open === k
              return (
                <div key={k} role="row" className={`pj-row${p.frozen ? ' is-frozen' : ''}${isOpen ? ' is-open' : ''}`}>
                  <span role="cell" className="pj-name">
                    <button type="button" className="pj-open" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : k)} aria-label={L(`Abrir la pareja con ${nameOf(p)}`, `Open the pair with ${nameOf(p)}`)}>{isOpen ? '−' : '+'}</button>
                    {side === 'vendor'
                      ? <EntityIdentityChip type="institution" id={p.institution_id} name={formatEntityName('institution', p.institution_name, 'full')} size="inherit" fullName hideIcon />
                      : !p.vendor_name ? <span className="pj-muted">{nameOf(p)}</span> : <><EntityIdentityChip type="vendor" id={p.vendor_id} name={p.vendor_name} size="inherit" fullName hideIcon />{p.is_pf && <span className="pj-muted">{pfTag}</span>}</>}
                  </span>
                  <span role="cell" className="pj-years" onPointerLeave={() => setCell(null)}>
                    {YEARS.map((y) => {
                      const m = by.get(y)
                      const inRun = y >= ra && y <= rb
                      return (
                        <i key={y} className={`${m ? 'is-on' : ''}${inRun ? ' is-run' : ''}`} style={m ? { background: tone(m) } : undefined}
                          onPointerEnter={() => setCell(m ? { k, y, v: m } : null)} role={m ? 'img' : undefined} aria-label={m ? `${y}: ${formatCompactMXN(m)}` : undefined} aria-hidden={m ? undefined : true} />
                      )
                    })}
                    {cell && cell.k === k && <em className="pj-tip" style={{ left: `${((cell.y - Y0 + 0.5) / YEARS.length) * 100}%` }}>{cell.y} · {formatCompactMXN(cell.v)}</em>}
                  </span>
                  <span role="cell" className="pj-num">
                    <b>{formatCompactMXN(p.money_mxn)}{p.flag_10b ? ' †' : ''}</b>
                    <small>{pct(p.noncomp_share)} · {p.max_run} {L('seguidos', 'in a row')}</small>
                  </span>
                  {isOpen && (
                    <div className="pj-more" role="cell">
                      <p>{say(p)}</p>
                      <dl>
                        <dt>{L('Adjudicación directa desde 2011', 'Direct award since 2011')}</dt><dd>{pct(p.da_share)}</dd>
                        <dt>{L('Directa o un solo adjudicado', 'Direct or single award')}</dt><dd>{pct(p.noncomp_share)}</dd>
                        <dt>{L('Años con contratos', 'Years with contracts')}</dt><dd>{p.n_years} ({p.first_year}–{p.last_year})</dd>
                        <dt>{L('Dinero desde 2011', 'Money since 2011')}</dt><dd>{formatCompactMXN(p.money_2011)}</dd>
                        {/* the year cells as text, for keyboard and screen-reader readers (the ledger is pointer-only) */}
                        <dt className="sr-only">{L('Dinero por año', 'Money by year')}</dt>
                        <dd className="sr-only">{p.years.map(([y, m]) => `${y}: ${formatCompactMXN(m)}`).join('; ')}</dd>
                      </dl>
                      <Link className="ct-link" to={`/contracts?vendor_id=${p.vendor_id}&institution_id=${p.institution_id}`}>{L('Ver los contratos de la pareja', 'See the pair’s contracts')}</Link>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
      {left > 0 && (
        <button type="button" className="ct-chip pj-all" onClick={() => setLimit(limit < STEP ? STEP : limit + STEP)}>
          {limit < STEP
            ? (shown.length <= STEP ? L(`Ver las ${formatNumber(shown.length)}`, `Show all ${formatNumber(shown.length)}`) : L(`Ver ${STEP} de ${formatNumber(shown.length)}`, `Show ${STEP} of ${formatNumber(shown.length)}`))
            : L(`Ver las siguientes ${formatNumber(Math.min(STEP, left))}`, `Show the next ${formatNumber(Math.min(STEP, left))}`)}
        </button>
      )}
      {limit > 12 && shown.length > 12 && <button type="button" className="ct-chip pj-all" onClick={() => setLimit(12)}>{L('Ver menos', 'Show fewer')}</button>}
      {rows.length > 0 && (
        <p className="pj-note">
          {L('Tono = dinero del año · subrayado = la racha más larga de años seguidos. «Sin competencia»: 10 años seguidos o más y al menos 80% del dinero desde 2011 por adjudicación directa o con un solo adjudicado. Patentes, servicios públicos y compras consolidadas producen este patrón: no prueba una irregularidad.',
            'Tone = the year’s money · underline = the longest run of consecutive years. «No competition»: 10 or more consecutive years and at least 80% of the money since 2011 by direct award or with a single award. Patents, utilities and consolidated buying produce this pattern: it is not evidence of wrongdoing.')}
        </p>
      )}
    </section>
  )
}

export default ParejasLens
