/**
 * Los patrones § Gasto a ciegas — the first screen's board (docs/BACKLOG_LOS_PATRONES.md § Gasto a ciegas; MAGENTA build
 * 2026-11-05, concept frontend/_explore/patrones_concepts_2026-11-05/gasto-a-ciegas.html). General: every budget entity
 * GET /no-se-ve measures, one El Archivo-style row each — spent (the official spending report, Cuenta Pública) · in public
 * contracts · contracts ÷ spent (two totals with different timing, never a peso-by-peso match) · a reading tag. The Tren Maya project leads. Open › an entity → year by year (each year opens the
 * existing drawer, Cajon) and its largest visible contracts as El Archivo rows (RegisterBoard).
 * Data: the page payload (useQuery in NoSeVe) + GET /no-se-ve/{ente} for an opened row (the drawer's own query key).
 */
import { Fragment, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { noSeVeApi, type NsvContract } from '@/api/noSeVe'
import type { ContractListItem } from '@/api/types'
import { RegisterBoard } from '@/components/contracts/RegisterBoard'
import { Buyer } from '@/components/portada/Tablero'
import { useCajon } from '@/components/noSeVe/cajonState'
import { money, num, pct, type Lang } from '@/lib/noSeVe/lectura'
import type { Model } from '@/lib/noSeVe/model'
import { enteRows, span, type EnteRow, type Tag } from '@/lib/patrones/gasto'
import { Chev, ComoLeer, Opened, Toggle, useOpenParam } from './Patrones'
import '@/components/contracts/contracts.css'

const KEY = /^[a-z0-9-]{2,40}$/
const TOP = 8
const TAG: Record<Tag, { es: string; en: string; long: { es: string; en: string } }> = {
  ciegas: { es: 'a ciegas', en: 'blind', long: { es: 'los contratos suman menos de la mitad de lo gastado', en: 'contracts add up to less than half of the spending' } },
  visible: { es: 'visible', en: 'visible', long: { es: 'los contratos suman la mitad o más de lo gastado', en: 'contracts add up to half the spending or more' } },
  nocomp: { es: 'no comparable', en: 'not comparable', long: { es: 'firmó contratos de varios años por más de lo que gastó', en: 'signed multi-year contracts for more than it spent' } },
  singasto: { es: 'sin gasto', en: 'no spending', long: { es: 'no hay gasto registrado para comparar', en: 'no recorded spending to compare against' } },
  fuera: { es: 'fuera del registro', en: 'outside the register', long: { es: 'compra con su propia ley (Pemex, CFE)', en: 'buys under its own law (Pemex, CFE)' } },
}

const asRow = (c: NsvContract, year: string): ContractListItem => ({
  id: c.id, amount_mxn: c.amount_mxn, is_direct_award: c.is_direct_award, is_single_bid: false,
  contract_year: Number(year), contract_date: c.contract_date ?? undefined, title: c.title ?? undefined, risk_score: c.risk_score,
  vendor_id: c.vendor_id ?? undefined, vendor_name: c.vendor ?? undefined, vendor_is_individual: c.persona_fisica ?? c.vendor_is_individual ?? null,
  institution_id: c.institution_id ?? undefined, institution_name: c.institution, institution_siglas: c.siglas,
  procedure: c.procedure === 'directa' || c.procedure === 'licitacion' || c.procedure === 'invitacion' || c.procedure === 'otro' ? c.procedure : null,
  sector_id: c.sector_id ?? undefined, category_id: c.category_id ?? null, category_es: c.category_es ?? null, category_en: c.category_en ?? null,
})

/** «¿Quién es?»: the Tren Maya as the example, two totals and the timing caveat — the masthead's ear. */
export function EnteWho({ m, lang }: { m: Model; lang: Lang }) {
  const en = lang === 'en'
  const L = (es: string, e: string) => (en ? e : es)
  const rows = useMemo(() => enteRows(m), [m])
  const P = m.proj, y0 = m.years[0], y1 = m.years[m.years.length - 1]
  return (
    <section className="pt-who" aria-labelledby="pt-who-h">
      <h2 id="pt-who-h" className="pt-k">{L('¿Quién es?', 'Who is it?')}</h2>
      <p>{en
        ? <>For example: the <b>Tren Maya</b> spent <b>{money(P.exSum, lang)}</b> on works and purchases from {y0} to {y1}; public contracts show <b>{money(P.visSum, lang)}</b>.</>
        : <>Por ejemplo: el <b>Tren Maya</b> gastó <b>{money(P.exSum, lang)}</b> en obras y compras ({y0}–{y1}). Los contratos públicos muestran <b>{money(P.visSum, lang)}</b>.</>}</p>
      {/* audit #25: one line; the timing caveat stays (spending 2020–25 vs contracts recorded when signed), its long form in IV «Método» */}
      <p className="pt-ex">{en
        ? <>Two records on different clocks, {num(rows.length, lang)} entities: it measures what can be seen, not corruption.</>
        : <>Dos registros con distinto calendario, {num(rows.length, lang)} entes: mide lo que se ve, no la corrupción.</>}</p>
    </section>
  )
}

export function EnteBoard({ m, lang }: { m: Model; lang: Lang }) {
  const en = lang === 'en'
  const L = (es: string, e: string) => (en ? e : es)
  const rows = useMemo(() => enteRows(m), [m])
  const [open, setOpen] = useOpenParam('fila', (v) => KEY.test(v) && m.by.has(v))
  const y0 = m.years[0], y1 = m.years[m.years.length - 1]
  const tags = (Object.keys(TAG) as Tag[]).filter((t) => rows.some((r) => r.tag === t))

  return (
    <div className="pt">

      <div className="bd rg pt-gas">
        <div className="bd-grid">
          <div className="bd-row bd-cols pt-r">
            <span />
            <span>{L('Años', 'Years')}</span>
            <span>{L('Comprador', 'Buyer')}</span>
            <span className="r" title={L('Lo que el informe oficial de gasto (Cuenta Pública) dice que pagó en compras y obras', 'What the official spending report (Cuenta Pública) says it paid on purchases and works')}>{L('Gastó', 'Spent')}</span>
            <span className="r">{L('Con contrato', 'In contracts')}</span>
            <span className="r" title={L('Lo que suman los contratos, dividido entre lo gastado, seis años juntos', 'What the contracts add up to, divided by the spending, six years together')}>{L('Contratos ÷ gasto', 'Contracts ÷ spent')}</span>
            <span className="r">{L('Contratos', 'Contracts')}</span>
            <span>{L('Lectura', 'Reading')}</span>
          </div>
          <ul className="bd-list" aria-label={L('Dependencias: lo que gastaron contra lo que se ve en contratos', 'Agencies: what they spent against what shows in contracts')}>
            {rows.map((r) => {
              const isOpen = open === r.e.key
              return (
                <Fragment key={r.e.key}>
                  <EnteLine r={r} lang={lang} open={isOpen} onToggle={() => setOpen(isOpen ? null : r.e.key)} />
                  {isOpen && <EnteOpen r={r} m={m} lang={lang} onClose={() => setOpen(null)} />}
                </Fragment>
              )
            })}
          </ul>
        </div>
        <ul className="bd-legend" aria-label={L('Cómo leer la lista', 'How to read the list')}>
          <li><i className="bd-dot is-key" aria-hidden="true" />{L('Color = sector del comprador', 'Colour = the buyer’s sector')}</li>
          {tags.map((t) => <li key={t} className="bd-lg-gap"><span className={`pt-tag is-${t}`} style={{ marginRight: 6 }}>{L(TAG[t].es, TAG[t].en)}</span>{L(TAG[t].long.es, TAG[t].long.en)}</li>)}
        </ul>
      </div>

      {/* audit #25: ≤ 15 words a step; the tags' long names sit in the legend, the rest in IV «Método» */}
      <ComoLeer lang={lang} steps={en ? [
        { b: 'Each row is an agency or a project.', t: `«Spent»: the Cuenta Pública, ${y0}–${y1}. «In contracts»: what a public contract shows.` },
        { b: 'The figure in black: contracts ÷ spent.', t: 'The lower, the less anyone can check. «Blind» = under half.' },
        { b: 'Open › an agency', t: 'to see it year by year and its largest contracts.' },
      ] : [
        { b: 'Cada renglón es una dependencia o un proyecto.', t: `«Gastó»: la Cuenta Pública, ${y0}–${y1}. «Con contrato»: lo que se ve en un contrato público.` },
        { b: 'La cifra en negro: contratos ÷ gasto.', t: 'Mientras más baja, menos se puede revisar. «A ciegas» = menos de la mitad.' },
        { b: 'Abra › una dependencia', t: 'para verla año por año y sus contratos más grandes.' },
      ]} />
    </div>
  )
}

function EnteLine({ r, lang, open, onToggle }: { r: EnteRow; lang: Lang; open: boolean; onToggle: () => void }) {
  const en = lang === 'en'
  const e = r.e, name = en ? e.label.en : e.label.es
  const one = e.ids.length === 1 && e.grp !== 'proj' ? e.ids[0] : null
  const ratio = r.ratio != null ? `${Math.round(r.ratio * 100)} %` : '—'
  return (
    <li className={`bd-row pt-r${open ? ' is-open' : ''}`}>
      <span className="bd-c pt-sel"><Chev open={open} /></span>
      <span className="bd-c bd-age">{span(r)}</span>
      <span className="bd-c bd-buyer" title={name}>
        <Buyer b={{ id: one, name, siglas: e.short, sector: e.raw.sector_id ?? null }} lang={lang} />
      </span>
      <span className="bd-c bd-amt r">
        <Toggle scope="fila" k={e.key} open={open} onToggle={onToggle}
          label={en ? `${name}: spent ${money(e.exSum, lang)}, ${money(e.visSum, lang)} in public contracts — ${open ? 'close' : 'open'} year by year` : `${name}: gastó ${money(e.exSum, lang)}, ${money(e.visSum, lang)} en contratos públicos — ${open ? 'cerrar' : 'abrir'} año por año`}>
          {money(e.exSum, lang)}
        </Toggle>
      </span>
      <span className="bd-c pt-vis r pt-num">{money(e.visSum, lang)}</span>
      <span className="bd-c pt-tenc r"><span className="pt-ten">{ratio}</span></span>
      <span className="bd-c pt-n2 r pt-num">{r.n > 0 ? num(r.n, lang) : '—'}</span>
      <span className="bd-c pt-tagc"><span className={`pt-tag is-${r.tag}`} title={en ? TAG[r.tag].long.en : TAG[r.tag].long.es}>{en ? TAG[r.tag].en : TAG[r.tag].es}</span></span>
    </li>
  )
}

function EnteOpen({ r, m, lang, onClose }: { r: EnteRow; m: Model; lang: Lang; onClose: () => void }) {
  const en = lang === 'en'
  const L = (es: string, e: string) => (en ? e : es)
  const e = r.e, name = en ? e.label.en : e.label.es
  const cajon = useCajon()
  const q = useQuery({ queryKey: ['no-se-ve', 'ente', e.key], queryFn: () => noSeVeApi.entity(e.key), staleTime: 3_600_000, retry: false, enabled: e.grp !== 'ley' })
  const all = useMemo(() => Object.entries(q.data?.top ?? {}).flatMap(([y, cs]) => cs.map((c) => asRow(c, y))).sort((a, b) => b.amount_mxn - a.amount_mxn), [q.data])
  const top = all.slice(0, TOP)
  const topSum = top.reduce((s, c) => s + c.amount_mxn, 0)
  return (
    <Opened scope="fila" k={e.key} lang={lang} onClose={onClose} crumbs={[L('Los patrones', 'Patterns'), L('Gasto a ciegas', 'Blind spending'), name]}>
      <p className="pt-k">{L('Año por año: contratos firmados ese año ÷ lo gastado ese año. Son dos registros con distinto calendario, no un cotejo. Abra un año ›', 'Year by year: contracts signed that year ÷ spent that year · two records on different clocks, not a match · open a year ›')}</p>
      <ul className="pt-years">
        {m.years.map((y, k) => (
          <li key={y}>
            <button type="button" onClick={() => cajon({ ente: e.key, anio: y })} disabled={!e.live[k] && e.vis[k] === 0}
              aria-label={en ? `${y}: spent ${money(e.ex[k], lang)}, ${money(e.vis[k], lang)} in contracts — open the year` : `${y}: gastó ${money(e.ex[k], lang)}, ${money(e.vis[k], lang)} con contrato — abrir el año`}>
              <span>{y}</span>
              <b className="pt-ten">{e.ex[k] > 0 && e.grp !== 'ley' ? (e.vis[k] > e.ex[k] ? '+100%' : pct(e.vis[k] / e.ex[k], lang)) : '—'}</b>
              <small>{e.live[k] ? <>{L('gastó', 'spent')} {money(e.ex[k], lang)} · {L('firmó', 'signed')} {money(e.vis[k], lang)}</> : L('sin gasto ese año', 'no spending that year')}<span aria-hidden="true"> ›</span></small>
            </button>
          </li>
        ))}
      </ul>
      {e.grp === 'ley' ? (
        <p className="pt-foot">{L('Compra con su propia ley y publica en su propio portal: sus contratos no están en CompraNet. Su 0 no es ceguera, es otra puerta.', 'It buys under its own law and publishes on its own portal: its contracts are not in CompraNet. Its 0 is not blindness, it is another door.')}</p>
      ) : (
        <>
          <p className="pt-k">{en ? `The largest contracts that can be seen · ${num(top.length, lang)} of ${num(r.n, lang)}` : `Los contratos más grandes que sí se ven · ${num(top.length, lang)} de ${num(r.n, lang)}`}</p>
          <RegisterBoard rows={top} lang={lang} label={en ? `${name}: largest visible contracts` : `${name}: contratos visibles más grandes`}
            status={q.isLoading ? L('Leyendo sus contratos…', 'Reading its contracts…') : q.isError ? <span role="alert">{L('Sus contratos no cargaron.', 'Its contracts did not load.')}</span> : top.length === 0 ? L('Ningún contrato a la vista.', 'No contract in view.') : undefined} />
          {top.length > 0 && (
            <div className="pt-footrow">
              <p className="pt-foot">{en
            ? <>These {num(top.length, lang)} add up to <b>{money(topSum, lang)}</b> of the {money(e.visSum, lang)} in view. {e.exSum > e.visSum ? <>The other <b>{money(e.exSum - e.visSum, lang)}</b> spent have no row: there is no contract to open.</> : null}{e.grp === 'proj' ? <> The Tren Maya’s ribbon, year by year, is in chapter II below.</> : null}</>
            : <>Estos {num(top.length, lang)} suman <b>{money(topSum, lang)}</b> de los {money(e.visSum, lang)} visibles. {e.exSum > e.visSum ? <>Los otros <b>{money(e.exSum - e.visSum, lang)}</b> gastados no tienen renglón: no hay contrato que abrir.</> : null}{e.grp === 'proj' ? <> La cinta del Tren Maya, año por año, está en el capítulo II, abajo.</> : null}</>}</p>
              <button type="button" className="pt-clear" onClick={() => cajon({ ente: e.key })}>{L('Abrir el cajón completo ›', 'Open the full drawer ›')}</button>
            </div>
          )}
        </>
      )}
    </Opened>
  )
}
