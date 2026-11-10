/**
 * The /no-se-ve drawer — the layers under every chapter, on /captura's dissection pattern (Diseccion.tsx: the
 * same .cg-dock/.cr-dock geometry, scrim, crumbs, focus-to-heading, Esc, doors). Two levels, in the URL
 * (./cajonState.ts):
 *   ente   ?ente=          the entity (or the project): six years of exercised vs visible, trusts, its units
 *   año    ?ente=&anio=    one year: where the budget went, the visible contracts (largest first, each opens its
 *                          record), the Focos Rojos suppliers among them, and the doors (dossier, El Mapa, Captura)
 */
import { useEffect, useRef, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { noSeVeApi, type NsvContract } from '@/api/noSeVe'
import { FoldToggle, useRowFold } from '@/components/contrato/Fold'
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import { rankNo } from '@/components/kit/ListRow'
import { Ind } from '@/components/captura/Pruebas'
import { useModal } from '@/hooks/useModal'
import { cieloHref } from '@/lib/vista'
import { GROUP_COLOR, money, num, pct, share, type Lang } from '@/lib/noSeVe/lectura'
import { idx, type Ent, type Model } from '@/lib/noSeVe/model'
import { segments } from './Flujos'
import { useCajon, type Sel } from './cajonState'

const GRP: Record<Ent['grp'], [string, string]> = {
  proj: ['proyecto · todas sus unidades', 'project · all its units'],
  ns: ['seguridad nacional y obra militar', 'national security and military works'],
  civ: ['civil · referencia', 'civilian · reference'],
  ley: ['fuera de CompraNet por ley', 'out of CompraNet by law'],
}

export function Cajon({ sel, m, lang }: { sel: Sel; m: Model; lang: Lang }) {
  const en = lang === 'en'
  const open = useCajon()
  const ref = useRef<HTMLElement>(null)
  const head = useRef<HTMLHeadingElement>(null)
  useModal(ref, () => open(null))
  // Opened from a link (no opener in the page): on close, focus returns to the entity's own control.
  const last = useRef(sel.ente)
  last.current = sel.ente ?? last.current
  useEffect(() => {
    const idle = () => { const a = document.activeElement; return a == null || a === document.body || a.tagName === 'MAIN' }
    const deep = idle()
    return () => {
      if (!deep) return
      requestAnimationFrame(() => {
        if (!idle()) return
        const el = document.querySelector<HTMLElement>(`[data-ente="${last.current}"]`) ?? document.querySelector<HTMLElement>('#firmado-h')
        el?.focus({ preventScroll: false })
      })
    }
  }, [])
  const e = sel.ente ? m.by.get(sel.ente) : undefined
  const year = sel.anio != null && e ? sel.anio : null
  const levelKey = `${sel.ente}-${sel.anio}`
  useEffect(() => { head.current?.focus({ preventScroll: true }); ref.current?.scrollTo({ top: 0 }) }, [levelKey])
  const q = useQuery({ queryKey: ['no-se-ve', 'ente', sel.ente], queryFn: () => noSeVeApi.entity(sel.ente!), enabled: !!e, staleTime: 3_600_000, retry: false })
  const color = e ? GROUP_COLOR[e.grp] : GROUP_COLOR.ns

  return (
    <>
      <div className="cr-scrim" onClick={() => open(null)} aria-hidden="true" />
      <aside ref={ref} className="cg-dock cr-dock nsv-dock" role="dialog" aria-modal="true" aria-labelledby="nsv-d-h">
        <div className="cg-dock-top">
          <i style={{ background: color }} aria-hidden="true" />
          <nav className="cr-crumbs" aria-label={en ? 'Layer path' : 'Ruta de las capas'}>
            <span><button type="button" onClick={() => open(null)}>{en ? 'Blind Spending' : 'Gasto a ciegas'}</button></span>
            {e && <span> › {year != null ? <button type="button" onClick={() => open({ ente: e.key })}>{e.short}</button> : <b aria-current="page">{e.short}</b>}</span>}
            {e && year != null && <span> › <b aria-current="page">{year}</b></span>}
          </nav>
          <button type="button" onClick={() => open(null)}>{en ? 'Close' : 'Cerrar'} <kbd>Esc</kbd></button>
        </div>
        {!e && <><h2 id="nsv-d-h" ref={head} tabIndex={-1} className="cg-dock-h">{en ? 'Not on this page' : 'No está en esta página'}</h2>
          <p className="cr-d-note">{en ? 'This entity is not one of the eighteen measured here.' : 'Este ente no es uno de los dieciocho que se miden aquí.'}</p></>}
        {e && year == null && <EnteLevel e={e} m={m} head={head} lang={lang} insts={q.data?.institutions} />}
        {e && year != null && <YearLevel e={e} m={m} year={year} head={head} lang={lang} top={q.data?.top[String(year)]} loading={q.isLoading} failed={q.isError} insts={q.data?.institutions} />}
      </aside>
    </>
  )
}

type H = { head: React.RefObject<HTMLHeadingElement | null> }

/** Under 25% in view: seal red for the Tren Maya project only (the page's one finding); ink, underlined, for the rest. */
const dark = (e: Ent) => (e.grp === 'proj' ? 'is-seal' : 'is-dark')

type Inst = { id: number; name: string; siglas: string | null }

function Head({ e, head, lang, insts }: { e: Ent; lang: Lang; insts?: Inst[] } & H) {
  const en = lang === 'en'
  const one = e.grp !== 'proj' && e.ids.length >= 1 && insts?.length ? insts[0] : null
  return (
    <>
      <h2 id="nsv-d-h" ref={head} tabIndex={-1} className="cg-dock-h">
        {one ? <EntityIdentityChip type="institution" id={one.id} name={en ? e.label.en : e.label.es} variant="name" /> : (en ? e.label.en : e.label.es)}
      </h2>
      <p className="cg-dock-of">{en ? GRP[e.grp][1] : GRP[e.grp][0]} · {e.grp === 'proj' ? e.cp : `UR ${e.cp}`}</p>
    </>
  )
}

/** Two thin rulers on one scale: exercised (tint) over visible (colour). */
export function Pair({ ex, vis, max, color }: { ex: number; vis: number; max: number; color: string }) {
  const W = 120, s = (v: number) => Math.max(v > 0 ? 1 : 0, (Math.min(v, max) / max) * W)
  return (
    <svg width={W} height={12} viewBox={`0 0 ${W} 12`} aria-hidden="true" className="nsv-pair">
      <rect x={0} y={1} width={s(ex)} height={4} fill={color} fillOpacity={0.25} />
      <rect x={0} y={7} width={s(vis)} height={4} fill={color} />
    </svg>
  )
}

function EnteLevel({ e, m, head, lang, insts }: { e: Ent; m: Model; lang: Lang; insts?: Inst[] } & H) {
  const en = lang === 'en'
  const open = useCajon()
  const color = GROUP_COLOR[e.grp]
  const max = Math.max(1, ...e.ex, ...e.visAx)
  const reg = e.raw.years.filter((y) => !m.axis.includes(y.year) && y.contracts_visible_mxn > 0)
  return (
    <>
      <Head e={e} head={head} lang={lang} insts={insts} />
      <div className="cg-dock-big">
        <div><b className={e.grp !== 'ley' && (e.share ?? 0) < 0.25 ? dark(e) : undefined}>{e.grp === 'ley' ? '0' : share(e.share ?? 0, lang)}</b><span>{en ? `in view, ${m.years[0]}–${m.years[m.years.length - 1]}` : `a la vista, ${m.years[0]}–${m.years[m.years.length - 1]}`}</span></div>
        <div><b>{money(e.exSum, lang)}</b><span>{en ? 'exercised on purchases + works' : 'ejercidos en compras y obra'}</span></div>
      </div>
      {e.trSum > 0 && <p className="cg-dock-still">{en ? `${money(e.trSum, lang)} into public trusts in six years — no contract downstream` : `${money(e.trSum, lang)} a fideicomisos públicos en seis años — sin contrato detrás`}</p>}
      <h3 className="cr-d-k">{en ? 'Year by year — open one' : 'Año por año — abra uno'} <span>· {en ? 'tint = exercised, colour = contracts' : 'tinte = ejercido, color = contratos'}</span></h3>
      <ul className="cr-d-list nsv-d-years">
        {m.axis.map((y, k) => k >= m.years.length ? (
          <li key={y}>
            <button type="button" onClick={() => open({ ente: e.key, anio: y })} disabled={e.visAx[k] === 0}>
              <span className="cr-d-n">{y}</span>
              <Pair ex={0} vis={e.visAx[k]} max={max} color={color} />
              <span className="cr-m cr-r">{e.visAx[k] > 0 ? `${money(e.visAx[k], lang)} ${en ? 'signed' : 'firmados'} · ` : ''}{en ? `exercised not yet published (Public Accounts ${y} out in ${y + 1})` : `gasto ejercido aún no publicado (Cuenta Pública ${y} sale en ${y + 1})`}</span>
            </button>
          </li>
        ) : (
          <li key={y}>
            <button type="button" onClick={() => open({ ente: e.key, anio: y })} disabled={!e.live[k] && e.vis[k] === 0}>
              <span className="cr-d-n">{y}</span>
              <Pair ex={e.ex[k]} vis={e.vis[k]} max={max} color={color} />
              <span className="cr-m cr-r">{e.live[k] ? <><b className={e.vis[k] / e.ex[k] < 0.25 && e.grp !== 'ley' ? dark(e) : undefined}>{share(e.vis[k] / e.ex[k], lang)}</b> {en ? 'of' : 'de'} {money(e.ex[k], lang)}</> : (e.vis[k] > 0 ? `${money(e.vis[k], lang)} ${en ? 'signed, no budget line' : 'firmados, sin partida'}` : (en ? 'did not exist' : 'no existía'))}</span>
              {e.tr[k] > 0 && <span className="cr-m cr-gray nsv-d-tr">{en ? 'trusts' : 'fideicomisos'} {money(e.tr[k], lang)}</span>}
            </button>
          </li>
        ))}
      </ul>
      {reg.length > 0 && <p className="cr-d-note">{en ? 'Outside the budget years: ' : 'Fuera de los años con presupuesto: '}{reg.map((r) => `${r.year} ${money(r.contracts_visible_mxn, lang)}`).join(' · ')}.</p>}
      {e.grp === 'proj' && <ProjUnits m={m} lang={lang} />}
      {e.grp === 'ley' && <p className="cr-d-note">{en
        ? 'Since the energy reform these state companies buy under their own law and publish on their own portals; zero here means not in CompraNet, not no contract.'
        : 'Desde la reforma energética estas empresas del Estado compran bajo su propia ley y publican en sus portales; cero aquí quiere decir fuera de CompraNet, no sin contrato.'}</p>}
      <Doors e={e} insts={insts} lang={lang} />
    </>
  )
}

function ProjUnits({ m, lang }: { m: Model; lang: Lang }) {
  const en = lang === 'en'
  const open = useCajon()
  const NAMES: Record<string, [string, string, string?]> = {
    W3N: ['FONATUR (fondo)', 'FONATUR (fund)'], W3X: ['FONATUR Tren Maya', 'FONATUR Tren Maya', 'fonatur-tren-maya'],
    H0M: ['Tren Maya S.A.', 'Tren Maya S.A.', 'tren-maya-sa'], otros: ['INAH y otros', 'INAH and others'],
  }
  const rows = m.projByUr.map((u) => ({ ...u, s: u.vals.reduce((a, b) => a + b, 0) })).filter((u) => u.s > 0).sort((a, b) => b.s - a.s)
  return (
    <>
      <h3 className="cr-d-k">{en ? 'Who spent it (cartera 2021W3N0001)' : 'Quién lo ejerció (cartera 2021W3N0001)'}</h3>
      <ul className="cr-d-proc">
        {rows.map((u) => {
          const [es_, en_, ente] = NAMES[u.ur] ?? [u.ur, u.ur]
          return (
            <li key={u.ur}><i style={{ background: 'var(--color-accent)' }} aria-hidden="true" />
              <span>{ente ? <button type="button" className="cr-inst" onClick={() => open({ ente })}>{en ? en_ : es_}</button> : (en ? en_ : es_)}</span>
              <span className="cr-m cr-r">{money(u.s, lang)}</span></li>
          )
        })}
      </ul>
    </>
  )
}

function Doors({ e, insts, lang, children }: { e: Ent; insts?: Inst[]; lang: Lang; children?: ReactNode }) {
  const en = lang === 'en'
  const list = (insts ?? []).slice(0, 3)
  return (
    <div className="cg-dock-acts cr-doors">
      {list.map((i, n) => (
        <EntityIdentityChip key={i.id} type="institution" id={i.id} name={i.name} variant="name" className={n === 0 ? 'is-pri' : undefined}>
          {list.length > 1 ? `${en ? 'Dossier' : 'Expediente'} ${i.siglas ?? i.id}` : (en ? 'Institution dossier' : 'Expediente de la institución')}
        </EntityIdentityChip>
      ))}
      {e.ids[0] != null && e.grp !== 'proj' && <Link to={cieloHref({ star: e.ids[0] })}>{en ? 'On El Mapa' : 'En El Mapa'}</Link>}
      {e.ids[0] != null && e.grp !== 'proj' && e.grp !== 'ley' && <Link to={`/captura?inst=${e.ids[0]}`}>{en ? 'Its capture' : 'Su captura'}</Link>}
      {children}
    </div>
  )
}

function YearLevel({ e, m, year, head, lang, top, loading, failed, insts }: { e: Ent; m: Model; year: number; lang: Lang; top?: NsvContract[]; loading: boolean; failed: boolean; insts?: Inst[] } & H) {
  const en = lang === 'en'
  const open = useCajon()
  const k = idx(m, year), ka = m.axis.indexOf(year)
  const cp = k >= 0 && e.live[k]
  const seg = cp ? segments(e, k) : null
  const rows = top ?? []
  const fold = useRowFold(rows, 6)
  const focos = rows.filter((c) => c.aria_tier != null && c.aria_tier <= 2 && c.vendor_id && c.vendor)
  const focosU = [...new Map(focos.map((c) => [c.vendor_id, c])).values()]
  const step = (d: number) => {
    const y = year + d, kk = m.axis.indexOf(y)
    return kk >= 0 && ((kk < m.years.length && e.live[kk]) || e.visAx[kk] > 0) ? y : null
  }
  const prev = step(-1), next = step(1)
  return (
    <>
      <Head e={e} head={head} lang={lang} insts={insts} />
      <div className="cg-dock-big">
        <div><b className={cp && e.grp !== 'ley' && e.vis[k] / e.ex[k] < 0.25 ? dark(e) : undefined}>{cp ? share(e.vis[k] / e.ex[k], lang) : '—'}</b><span>{en ? `in view, ${year}` : `a la vista, ${year}`}</span></div>
        <div><b>{ka >= 0 ? money(e.visAx[ka], lang) : '—'}</b><span>{ka >= 0 ? `${num(e.nAx[ka], lang)} ${en ? 'contracts' : 'contratos'}` : ''}{cp ? ` ${en ? 'of' : 'de'} ${money(e.ex[k], lang)}` : ''}</span></div>
      </div>
      {seg && seg.tot > 0 && <>
        <h3 className="cr-d-k">{en ? `Where the ${year} budget went` : `A dónde fue el presupuesto ${year}`} <span>· {money(seg.tot, lang)}</span></h3>
        <dl className="cg-dock-dl">
          {seg.v.nom > 0 && <><dt>{en ? 'Salaries (cap. 1000)' : 'Nómina (cap. 1000)'}</dt><dd>{money(seg.v.nom, lang)} · {pct(seg.v.nom / seg.tot, lang)}</dd></>}
          {seg.v.buy > 0 && <><dt>{en ? 'Purchases + works (2·3·5·6)' : 'Compras y obra (2·3·5·6)'}</dt><dd>{money(seg.v.buy, lang)} · {pct(seg.v.buy / seg.tot, lang)}</dd></>}
          {e.cap6[k] > 0 && <><dt>{en ? '… of it works (cap. 6000)' : '… de ello, obra (cap. 6000)'}</dt><dd>{money(e.cap6[k], lang)}</dd></>}
          {seg.v.tr > 0 && <><dt>{en ? 'Trusts (partida 46101)' : 'Fideicomisos (partida 46101)'}</dt><dd>{money(seg.v.tr, lang)} · {pct(seg.v.tr / seg.tot, lang)}</dd></>}
          {seg.v.tx > 0 && <><dt>{en ? 'Other transfers' : 'Otras transferencias'}</dt><dd>{money(seg.v.tx, lang)}</dd></>}
          {e.vis[k] > 0 && <><dt>{en ? 'Direct award, of the visible' : 'Adjudicación directa, de lo visible'}</dt><dd>{pct(e.da[k] / e.vis[k], lang)}</dd></>}
        </dl>
      </>}
      {!cp && <p className="cr-d-note">{year > m.years[m.years.length - 1]
        ? (en ? `${year}: contracts yes, exercised spending not yet published (the ${year} Public Accounts come out in ${year + 1}); ComprasMX to the data cut-off.` : `${year}: contratos sí, gasto ejercido aún no publicado (la Cuenta Pública ${year} sale en ${year + 1}); ComprasMX al corte.`)
        : (en ? `No budget line for ${e.short} in ${year}; only what was signed.` : `${e.short} no tiene partida en ${year}; sólo lo firmado.`)}</p>}
      {focosU.length > 0 && <p className="cg-dock-still">{en ? 'Red Flags suppliers among them: ' : 'Proveedores en Focos Rojos entre ellos: '}
        {focosU.map((c, i) => <span key={c.vendor_id}>{i > 0 && ' · '}<EntityIdentityChip type="vendor" id={c.vendor_id!} name={c.vendor} variant="name" personaFisica={c.persona_fisica} /> (<Link to={`/aria/caso/${c.vendor_id}`}>{en ? 'ARIA tier' : 'ARIA nivel'} {c.aria_tier}</Link>)</span>)}</p>}
      <div className="nsv-d-cts">
        <h3 className="cr-d-k">{en ? `The contracts in view, ${year} — largest first` : `Los contratos a la vista, ${year} — los mayores`}</h3>
        {loading && <p className="cr-d-note">{en ? 'Loading…' : 'Cargando…'}</p>}
        {failed && <p className="cr-d-note">{en ? 'The contracts failed to load.' : 'No se pudieron cargar los contratos.'}</p>}
        {!loading && !failed && rows.length === 0 && <p className="cr-d-note">{en ? 'No contract in the register this year.' : 'Ningún contrato en el registro este año.'}</p>}
        <div id="nsv-d-cts">
          {fold.shown.map((c, i) => (
            <div key={c.id} className="nsv-ct">
              <span className="cr-no">{rankNo(i + 1)}</span>
              <Link to={`/contracts/${c.id}`} className="nsv-ct-a">
                <span className="kf-mono cg-num"><b>{money(c.amount_mxn, lang)}</b>{c.is_direct_award ? <i> · {en ? 'DA' : 'AD'}</i> : null}</span>
                <span className="cg-t">{c.title ?? (en ? '(untitled)' : '(sin título)')}{/* as published: never re-cased, never cut */}</span>
              </Link>
              <span className="nsv-ct-who">
                {c.vendor_id && c.vendor ? <EntityIdentityChip type="vendor" id={c.vendor_id} name={c.vendor} variant="name" personaFisica={c.persona_fisica} /> : <span className="cr-gray">{en ? 'a natural person' : 'una persona física'}</span>}
                {e.grp === 'proj' && c.institution_id && c.institution ? <> · <EntityIdentityChip type="institution" id={c.institution_id} name={c.institution} variant="name" /></> : null}
                <span className="cr-m"> · {en ? 'ind.' : 'ind.'} <Ind r={c.risk_score} /></span>
              </span>
            </div>
          ))}
        </div>
        <FoldToggle open={fold.open} rest={fold.rest} onToggle={fold.toggle} controls="nsv-d-cts" />
      </div>
      <Doors e={e} insts={insts} lang={lang}>
        {prev != null && <button type="button" onClick={() => open({ ente: e.key, anio: prev })}>← {prev}</button>}
        {next != null && <button type="button" onClick={() => open({ ente: e.key, anio: next })}>{next} →</button>}
      </Doors>
    </>
  )
}
