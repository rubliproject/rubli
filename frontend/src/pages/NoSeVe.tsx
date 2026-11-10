/**
 * /gasto-a-ciegas — «Gasto a ciegas», first built as «Lo que no se ve» (/no-se-ve redirects here; owner pick 2026-10-28, _explore/no_se_ve_concepts_2026-10-28/README.md):
 * B «La cinta sellada» is the spine, A's coins and C's flows grafted on, told as a story in chapters:
 *   0 cover        the headline in words + the 100-coin plate + five figures + «mide visibilidad, no corrupción»
 *   I  firmado     the Tren Maya ribbon: exercised vs contracted on one axis, the decrees on the facts row
 *   II a dónde     the 2024 budgets as flows: salaries / purchases (with vs without contract) / trusts
 *   III quién      one coin plate per entity in three groups (security · civilian · out by law)
 *   IV método      how it is measured and what it does not say, with the sources
 * Every entity in every chapter opens the drawer (components/noSeVe/Cajon.tsx), ?ente=&anio= in the URL.
 * Data: GET /no-se-ve · /no-se-ve/{ente} (backend/api/routers/no_se_ve.py ← scripts/precompute_budget_visibility.py).
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { noSeVeApi } from '@/api/noSeVe'
import { Skeleton } from '@/components/ui/skeleton'
import { SectionIndex } from '@/components/contrato/SectionIndex'
import { Cinta } from '@/components/noSeVe/Cinta'
import { FlowKey, Flujos } from '@/components/noSeVe/Flujos'
import { gastoSpec } from '@/lib/moneyPaths/muro'
import { Cajon } from '@/components/noSeVe/Cajon'
import { Objeto } from '@/components/moneyPaths/MoneyPaths'
import { ListRow } from '@/components/kit/ListRow'
import { FoldToggle, useRowFold } from '@/components/contrato/Fold'
import { quienFinding } from '@/lib/patrones/gasto'
import { formatColumnMXN } from '@/lib/utils'
import { PageMasthead } from '@/components/layout/PageMasthead'
import { EnteBoard, EnteWho } from '@/components/patrones/EnteBoard'
import { CajonContext, useCajon, useCajonState } from '@/components/noSeVe/cajonState'
import { buildModel, idx, type Model } from '@/lib/noSeVe/model'
import { DATA_LAST_YEAR, textInk } from '@/lib/constants'
import { buildLectura, num, pct, times, type Claim, type Lang, type Token } from '@/lib/noSeVe/lectura'
import '@/components/kit/kit.css'
import '@/components/vendor/vendor.css'
import '@/components/captura/captura.css'
import '@/components/captura/relevo.css'
import '@/components/noSeVe/nosv.css'

function Tokens({ ts }: { ts: Token[] }) {
  const open = useCajon()
  return <>{ts.map((t, i) => typeof t === 'string' ? t
    : 'b' in t ? <b key={i}>{t.b}</b>
      : <button key={i} type="button" className="cr-inst" onClick={() => open({ ente: t.ente })}>{t.label}</button>)}</>
}

function Lectura({ claims, lang, k }: { claims: Claim[]; lang: Lang; k: string }) {
  const en = lang === 'en'
  if (!claims.length) return null
  return (
    <aside className="cr-rail nsv-rail" aria-label={en ? 'The reading' : 'La lectura'}>
      <h3 className="vd-lec-h"><span>{en ? 'The reading' : 'La lectura'}</span><span className="vd-lec-k">{k}</span></h3>
      <ul className="cr-claims">
        {claims.map((c) => (
          <li key={c.key}>
            <b className="cr-fig" style={c.color ? { color: textInk(c.color) } : undefined}>{en ? c.fig.en : c.fig.es}</b>
            <span><Tokens ts={en ? c.en : c.es} /><span className="cr-src">{en ? c.src.en : c.src.es}</span></span>
          </li>
        ))}
      </ul>
    </aside>
  )
}

/** Mariana's two lines under every chapter head (audit #25, owner «dumb it down»): the finding first, bold, then what
 *  you see — ≤ 15 words each. The long caption of each object reads in IV «Cómo lo medimos». */
function Chapter({ id, n, title, kicker, means, see, children, claims, lang }: {
  id: string; n: string; title: string; kicker: string; means: ReactNode; see: ReactNode; children: ReactNode; claims: Claim[]; lang: Lang
}) {
  const en = lang === 'en'
  return (
    <section className="ct-section nsv-ch" id={id} aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`} className="cr-h2"><span><span className="nsv-n">{n}</span> {title}</span><span className="vd-lec-k">{kicker}</span></h2>
      <div className="nsv-body">
        <div className="nsv-main">
          <p className="cr-two"><b>{means}</b>{see}</p>
          {children}
        </div>
        <Lectura claims={claims} lang={lang} k={en ? '§ computed from the two records' : '§ lo que dicen los dos registros'} />
      </div>
    </section>
  )
}

export default function NoSeVe() {
  const { i18n } = useTranslation()
  const lang: Lang = i18n.language.startsWith('es') ? 'es' : 'en'
  const en = lang === 'en'
  const { sel, open } = useCajonState()
  const q = useQuery({ queryKey: ['no-se-ve', 'page'], queryFn: () => noSeVeApi.page(), staleTime: 60 * 60 * 1000 })
  const m = useMemo(() => (q.data ? buildModel(q.data.entities, q.data.meta.cp_years) : null), [q.data])
  const claims = useMemo(() => (m ? buildLectura(m) : []), [m])

  const y0 = q.data?.meta.cp_years[0], y1 = q.data?.meta.cp_years.at(-1)
  const head = (ear?: ReactNode) => (
    <PageMasthead variant="indice" route="/gasto-a-ciegas" ear={ear}
      kicker={en ? 'Patterns · Blind spending' : 'Los patrones · Gasto a ciegas'}
      range={<>{en ? 'Spending' : 'Gasto'} {y0 ?? 2020}–{y1 ?? 2025} · {en ? 'contracts to' : 'contratos al'} {DATA_LAST_YEAR}</>}
      title={en ? 'What each agency spent, against what shows up in public contracts.' : 'Lo que gastó cada dependencia, contra lo que se ve en contratos públicos.'}
      dek={en ? 'Whatever is missing from the contracts, nobody can check.' : 'Lo que falta en los contratos, nadie lo puede revisar.'} />
  )
  if (q.isLoading || (!m && !q.isError && q.data)) {
    return <article className="ct ct-page ct-sheet"><div className="ct-wrap">{head()}<div aria-busy="true"><Skeleton className="mt-3 h-8 w-[40ch]" /><Skeleton className="mt-3 h-[520px] w-full" /></div></div></article>
  }
  if (!m) {
    return <article className="ct ct-page ct-sheet"><div className="ct-wrap">{head()}<p role="alert" className="ct-note">{en ? 'The budget visibility register is not available right now.' : 'El registro de visibilidad del presupuesto no está disponible en este momento.'}</p></div></article>
  }

  return (
    <CajonContext.Provider value={open}>
      <article className="ct ct-page ct-sheet cr nsv">
        <div className="ct-wrap">
          {head(<EnteWho m={m} lang={lang} />)}
          <EnteBoard m={m} lang={lang} />
          <SectionIndex label={en ? 'Chapters' : 'Capítulos'} items={[
            { id: 'quien', label: en ? 'I · Who is seen' : 'I · Quién se ve' },
            { id: 'firmado', label: en ? 'II · Signed first' : 'II · Primero se firmó' },
            { id: 'a-donde', label: en ? 'III · Where it went' : 'III · A dónde se fue' },
            { id: 'metodo', label: en ? 'IV · How we measured' : 'IV · Cómo lo medimos' },
          ]} />
          <ChapterIII m={m} lang={lang} claims={claims.filter((c) => c.ch === 3)} />
          <ChapterI m={m} lang={lang} claims={claims.filter((c) => c.ch === 1)} />
          <ChapterII m={m} lang={lang} claims={claims.filter((c) => c.ch === 2)} />
          <ChapterIV m={m} lang={lang} />
        </div>
        {sel.ente && <Cajon sel={sel} m={m} lang={lang} />}
      </article>
    </CajonContext.Provider>
  )
}

function ChapterI({ m, lang, claims }: { m: Model; lang: Lang; claims: Claim[] }) {
  const en = lang === 'en'
  return (
    <Chapter id="firmado" n="II" lang={lang} claims={claims}
      title={en ? 'First it was signed, then it was spent' : 'Primero se firmó, después se gastó'}
      kicker={en ? '§ the sealed ribbon · Tren Maya project' : '§ la cinta sellada · proyecto Tren Maya'}
      means={en
        ? <>First it was signed: in 2020–21, <i>{times(m.pre.ratio, lang)}</i> the spend. After the decree, spending soared.</>
        : <>Primero se firmó: en 2020–21, <i>{times(m.pre.ratio, lang)}</i> lo gastado. Tras el decreto, el gasto se disparó.</>}
      see={en ? 'Red ribbon: spent per year. Ink ribbon: contracts signed. Click a year.' : 'Cinta roja: lo gastado por año. Cinta negra: contratos firmados. Clic en un año.'}>
      <Cinta m={m} lang={lang} />
    </Chapter>
  )
}

function ChapterII({ m, lang, claims }: { m: Model; lang: Lang; claims: Claim[] }) {
  const en = lang === 'en'
  const sed = m.by.get('sedena'), k = idx(m, 2024)
  const tot = sed && k >= 0 ? sed.tot[k] : 0
  return (
    <Chapter id="a-donde" n="III" lang={lang} claims={claims}
      title={en ? 'Where it went' : 'A dónde se fue'}
      kicker={en ? '§ the 2024 budget of five entities' : '§ el presupuesto 2024 de cinco entes'}
      means={sed && tot > 0 ? (en
        ? <>SEDENA sent <i>{pct(sed.tr[k] / tot, lang)}</i> of its 2024 budget into trusts: no contract to check.</>
        : <>La SEDENA mandó <i>{pct(sed.tr[k] / tot, lang)}</i> de su presupuesto 2024 a fideicomisos: sin contrato que revisar.</>)
        : (en ? 'A trust contribution leaves no contract to check. The IMSS, last, is the reference.' : 'Una aportación a fideicomisos no deja contrato que revisar. El IMSS, al final, es la referencia.')}
      see={en ? 'Top: the whole 2024 budget. Below: purchases with a contract (solid) or without (outline).' : 'Arriba: todo el presupuesto 2024. Abajo: compras con contrato (lleno) o sin él (contorno).'}>
      <FlowKey lang={lang} />
      <Flujos m={m} lang={lang} />
    </Chapter>
  )
}

function ChapterIII({ m, lang, claims }: { m: Model; lang: Lang; claims: Claim[] }) {
  const en = lang === 'en'
  const open = useCajon()
  const [focus, setFocus] = useState<'all' | '2'>('all')
  const phone = typeof window !== 'undefined' && window.innerWidth < 640
  const [d3, setD3] = useState(false)
  const spec = useMemo(() => (d3 ? gastoSpec(m, lang, phone) : null), [d3, m, lang, phone])
  const F = useMemo(() => quienFinding(m), [m])
  const fold = useRowFold(m.ents, 10) // DESIGN.md §3 compaction: a ledger longer than 12 shows 10, the rest one click away
  const toggle = <button type="button" className="mpp-3d" onClick={() => setD3(!d3)}>{d3 ? (en ? 'back to the table' : 'volver a la tabla') : (en ? 'see in 3D' : 'ver en 3D')}</button>
  return (
    <Chapter id="quien" n="I" lang={lang} claims={claims}
      title={en ? 'Who is seen and who is not' : 'Quién se ve y quién no'}
      kicker={en ? `§ ${num(m.ents.length, lang)} entities, the Tren Maya project among them · ${m.years[0]}–${m.years.at(-1)}` : `§ ${num(m.ents.length, lang)} entes, con el proyecto Tren Maya · ${m.years[0]}–${m.years.at(-1)}`}
      means={en
        ? <><i>{num(F.blind, lang)} of {num(F.n, lang)}</i> comparable entities show less than half of their spending in public contracts.</>
        : <><i>{num(F.blind, lang)} de {num(F.n, lang)}</i> entes comparables dejan ver menos de la mitad de lo que gastaron.</>}
      see={<>{en ? 'Each row: one entity, what it spent and what shows in contracts. Click a name.' : 'Cada renglón: un ente, lo gastado y lo visible en contratos. Clic en un nombre.'} · {toggle}</>}>
      {spec ? <>
        <div className="mk-ctl mp-focus" role="group" aria-label={en ? 'Frame' : 'Encuadre'}>
          <button type="button" aria-pressed={focus === 'all'} onClick={() => setFocus('all')}>{en ? `all ${m.ents.length} entities` : `los ${m.ents.length} entes`}</button>
          <button type="button" aria-pressed={focus === '2'} onClick={() => setFocus('2')}>{en ? 'Tren Maya 2022–24' : 'Tren Maya 2022–24'}</button>
          {toggle}
        </div>
        <Objeto spec={spec} focus={focus} lang={lang} onOpen={(o) => { if (o.kind === 'ente') open({ ente: o.key }) }} />
      </> : <>
        <ul className="ls nsv-rows" id="nsv-rows" aria-label={en ? `Entities, ${m.years[0]}–${m.years.at(-1)}: what they spent and what shows in contracts` : `Entes, ${m.years[0]}–${m.years.at(-1)}: lo que gastaron y lo que se ve en contratos`}>
          <ListRow className="nsv-rows-head" name={en ? 'Entity' : 'Ente'} meta={en ? 'Spent · in contracts' : 'Gastó · en contratos'} reading={en ? '% in view' : '% a la vista'} />
          {fold.shown.map((e, i) => (
            <ListRow key={e.key} className={fold.rowIn(i).trim() || undefined}
              name={<button type="button" className="cr-inst" title={en ? e.label.en : e.label.es} onClick={() => open({ ente: e.key })}>{e.short}</button>}
              meta={e.exSum > 0 ? <>{en ? 'spent' : 'gastó'} {formatColumnMXN(e.exSum)} · {e.visSum > 0 ? formatColumnMXN(e.visSum) : (en ? '0M MXN' : '0 MDP')} {en ? 'in contracts' : 'en contratos'}</> : (en ? 'no spending on record' : 'sin gasto registrado')}
              reading={e.grp === 'ley' ? (en ? 'by law' : 'por ley') : e.share == null ? '—' : e.share > 1 ? '+100%' : pct(e.share, lang)} />
          ))}
        </ul>
        <FoldToggle open={fold.open} rest={fold.rest} onToggle={fold.toggle} controls="nsv-rows" />
      </>}
    </Chapter>
  )
}

const SOURCES: { href: string; es: string; en: string }[] = [
  { href: 'https://www.transparenciapresupuestaria.gob.mx/work/models/PTP/DatosAbiertos/BD_Cuenta_Publica/CSV/cuenta_publica_2024_gf_ecd_epe.csv', es: 'SHCP · Cuenta Pública, datos abiertos (un CSV por año, 2020–2025)', en: 'SHCP · Public Accounts, open data (one CSV per year, 2020–2025)' },
  { href: 'https://dof.gob.mx/nota_detalle.php?codigo=5635985&fecha=22/11/2021', es: 'DOF, 22 nov 2021 · acuerdo que declara de interés público y seguridad nacional los proyectos y obras del Gobierno de México (con autorizaciones provisionales de 12 meses)', en: 'DOF, 22 Nov 2021 · agreement declaring the Government of Mexico’s projects and works of public interest and national security (with 12-month provisional permits)' },
  { href: 'https://www.internet2.scjn.gob.mx/red2/comunicados/noticia.asp?id=7359', es: 'SCJN, 18 may 2023 · controversia constitucional 217/2021 (INAI): invalida el acuerdo porque amplió la reserva de información por acto administrativo y no por ley', en: 'Supreme Court, 18 May 2023 · constitutional controversy 217/2021 (INAI): strikes the agreement for widening the reserve of information by administrative act rather than by law' },
  { href: 'https://dof.gob.mx/nota_detalle.php?codigo=5689265&fecha=18/05/2023', es: 'DOF, 18 may 2023 · decreto que declara de seguridad nacional e interés público el Tren Maya, el Corredor Interoceánico del Istmo de Tehuantepec y los aeropuertos que enumera', en: 'DOF, 18 May 2023 · decree declaring the Tren Maya, the Interoceanic Corridor of the Isthmus of Tehuantepec and the listed airports of national security and public interest' },
]

/** IV — the one «Método» fold (audit #25): the measure, the limits, the sources, and the three objects' long captions
 *  (moved here from under each chart). Collapsed by default; the section index still lands on it. */
function ChapterIV({ m, lang }: { m: Model; lang: Lang }) {
  const en = lang === 'en'
  const y0 = m.years[0], y1 = m.years.at(-1)
  const post = m.axis.length > m.years.length
  // the section index (it focuses the h2) and a shared #metodo link land on the fold: open it, never a closed line
  const ref = useRef<HTMLDetailsElement>(null)
  useEffect(() => {
    const openIfHash = () => { if (location.hash === '#metodo' && ref.current) ref.current.open = true }
    openIfHash()
    window.addEventListener('hashchange', openIfHash)
    return () => window.removeEventListener('hashchange', openIfHash)
  }, [])
  return (
    <section className="ct-section nsv-ch" id="metodo" aria-labelledby="metodo-h">
      <h2 id="metodo-h" className="cr-h2" onFocus={() => { if (ref.current) ref.current.open = true }}><span><span className="nsv-n">IV</span> {en ? 'How we measured it, and what it does not say' : 'Cómo lo medimos y qué no dice'}</span><span className="vd-lec-k">{en ? '§ method · limits · sources' : '§ método · límites · fuentes'}</span></h2>
      <details ref={ref} className="cr-how">
      <summary>{en ? 'The measure, the limits and the sources' : 'La medida, los límites y las fuentes'}</summary>
      <div className="nsv-method">
        <div>
          <h3 className="cr-h3">{en ? 'How each chapter is read' : 'Cómo se lee cada capítulo'}</h3>
          <ol className="nsv-list">
            <li>{en
              ? <><b>I · Who is seen.</b> «+100%»: multi-year contracts are recorded the year they are signed, so a builder that signs ahead shows more contracts than spend; the drawer says how much.{post ? <> The rows cover {y0}–{y1}, the years with exercised spending; the {m.axis.slice(m.years.length).join('–')} contracts (ComprasMX) are in each entity’s drawer, not in these rows.</> : null}</>
              : <><b>I · Quién se ve.</b> «+100%»: un contrato plurianual se registra el año en que se firma, así que quien firma por adelantado muestra más contratos que gasto; el cajón dice cuánto.{post ? <> Los renglones cubren {y0}–{y1}, los años con gasto ejercido; los contratos de {m.axis.slice(m.years.length).join('–')} (ComprasMX) están en el cajón de cada ente, no en estos renglones.</> : null}</>}</li>
            <li>{en
              ? <><b>II · The ribbon.</b> Red = exercised on purchases and works by the project (Cuenta Pública, cartera 2021W3N0001, chapters 2000·3000·5000·6000), by the unit that spent it · ink = contracts naming the train signed that year, any buyer · same axis, width ∝ pesos · numerals = contracts ÷ exercised (red under 25%){post ? <> · <b>{m.axis.slice(m.years.length).join('–')}</b>: contracts yes, exercised spending not yet published (the {m.axis[m.years.length]} Public Accounts come out in {m.axis[m.years.length] + 1}) — the red ribbon ends at {y1} and no numeral is printed</> : null}.</>
              : <><b>II · La cinta.</b> Roja = lo ejercido en compras y obra por el proyecto (Cuenta Pública, cartera 2021W3N0001, capítulos 2000·3000·5000·6000), por la unidad que lo gastó · negra = contratos firmados ese año que nombran al tren, cualquier comprador · mismo eje, ancho ∝ pesos · cifras = contratos ÷ ejercido (rojo bajo 25%){post ? <> · <b>{m.axis.slice(m.years.length).join('–')}</b>: contratos sí, gasto ejercido aún no publicado (la Cuenta Pública {m.axis[m.years.length]} sale en {m.axis[m.years.length] + 1}); la cinta roja termina en {y1} y no se imprime cifra</> : null}.</>}</li>
            <li>{en
              ? <><b>III · The flows.</b> Top strip = the entity’s whole 2024 exercised budget (100%) · lower strip = its purchases and works, solid where a 2024 contract is in the register, outlined where none is in view · each entity on its own 100% (the size is in the label) · trusts = partida 46101 «Aportaciones a fideicomisos públicos». A trust contribution is in the public accounts; whatever is contracted later with that money does not reach the register. The IMSS, last, is the reference.</>
              : <><b>III · Los flujos.</b> Franja de arriba = todo el presupuesto ejercido 2024 del ente (100%) · franja de abajo = sus compras y obra, llena donde hay un contrato 2024 en el registro, en contorno donde no se ve ninguno · cada ente en su propio 100% (el tamaño va en la etiqueta) · fideicomisos = partida 46101 «Aportaciones a fideicomisos públicos». La aportación queda en la Cuenta Pública; lo que se contrate después con ese dinero no llega al registro. El IMSS, al final, es la referencia.</>}</li>
          </ol>
          <h3 className="cr-h3">{en ? 'The measure' : 'La medida'}</h3>
          <ol className="nsv-list">
            <li>{en ? <><b>Exercised</b>: the official spending report (SHCP Public Accounts, Cuenta Pública) {y0}–{y1}, MONTO_EJERCIDO, chapters 2000, 3000, 5000 and 6000 (materials, services, goods, public works). Salaries and transfers are left out.</> : <><b>Ejercido</b>: el informe oficial de gasto (Cuenta Pública) {y0}–{y1} de la SHCP, MONTO_EJERCIDO, capítulos 2000, 3000, 5000 y 6000 (materiales, servicios, bienes, obra pública). Nómina y transferencias quedan fuera.</>}</li>
            <li>{en ? <><b>Visible</b>: contracts in our register of the same entity and year (CompraNet to 28 Sep 2025 + ComprasMX), amounts above 100,000 million rejected. For the train: every contract whose title or description names it, any buyer.</> : <><b>Visible</b>: los contratos de nuestro registro del mismo ente y año (CompraNet al 28 sep 2025 + ComprasMX), sin montos mayores a 100,000 millones. Para el tren: todo contrato cuyo título o descripción lo nombra, sea quien sea el comprador.</>}</li>
            <li>{en ? <><b>Who is who</b>: each budget unit (ramo + UR) is matched to its register institutions by hand, because the register only carries UR codes for ComprasMX rows. A ministry = its numeric URs; an entity that moved between ramos is followed by its UR.</> : <><b>Quién es quién</b>: cada unidad del presupuesto (ramo + UR) se empata a mano con sus instituciones del registro, porque el registro sólo trae claves de UR en las filas de ComprasMX. Una secretaría = sus UR numéricas; un ente que cambió de ramo se sigue por su UR.</>}</li>
            {m.axis.length > m.years.length && <li>{(() => { const ya = m.axis[m.years.length]; return en
              ? `${ya}: contracts yes, exercised spending not yet published (the ${ya} Public Accounts come out in ${ya + 1}). The ${ya} ComprasMX contracts, to the data cut-off, are shown on the ribbon and in the drawers, and enter no percentage on this page.`
              : `${ya}: contratos sí, gasto ejercido aún no publicado (la Cuenta Pública ${ya} sale en ${ya + 1}). Los contratos ${ya} de ComprasMX, al corte, se muestran en la cinta y en los cajones, y no entran en ningún porcentaje de esta página.` })()}</li>}
          </ol>
          <h3 className="cr-h3">{en ? 'Sources' : 'Fuentes'}</h3>
          <ul className="nsv-list nsv-src">
            {SOURCES.map((s) => <li key={s.href}><a className="ct-link" href={s.href} target="_blank" rel="noopener noreferrer">{en ? s.en : s.es}</a></li>)}
          </ul>
        </div>
        <div>
          <h3 className="cr-h3">{en ? 'What it does not say' : 'Lo que no dice'}</h3>
          <ul className="nsv-list">
            <li>{en ? 'Exercised is not contracted: multi-year contracts are recorded when signed; advances and modifications move money between years. Compare six years, not one.' : 'Ejercido no es contratado: un contrato plurianual se registra al firmarse; anticipos y convenios mueven dinero entre años. Conviene comparar seis años, no uno.'}</li>
            <li>{en ? 'Works built directly by the armed forces (administración directa) and agreements between public bodies never produce a CompraNet contract — visibility is low by construction, which is what this measures.' : 'La obra por administración directa de las fuerzas armadas y los convenios entre entes públicos nunca producen un contrato en CompraNet: la visibilidad es baja por construcción, y eso es lo que se mide.'}</li>
            <li>{en ? <><b>Trusts</b> (partida 46101 «Aportaciones a fideicomisos públicos») are public in the accounts; what is invisible is the contract downstream. CIIT’s trust money and the railway’s works are shown apart and never added.</> : <><b>Fideicomisos</b> (partida 46101 «Aportaciones a fideicomisos públicos»): la aportación es pública en la Cuenta; lo que no se ve es el contrato que viene después. El dinero del CIIT al fideicomiso y la obra del ferrocarril se muestran aparte y nunca se suman.</>}</li>
            <li>{en ? 'The 2022–24 range: the floor counts only contracts signed in those years; the ceiling adds everything left on the signatures through 2021 (2019 included), as if all of it had been spent then. Amounts are as signed: amendments (convenios modificatorios) are not in the register, so the ceiling is not a hard one.' : 'El rango 2022–24: el piso cuenta sólo los contratos firmados esos años; el techo suma todo lo que quedaba de las firmas hasta 2021 (con 2019), como si se hubiera gastado entonces. Los montos son los de la firma: los convenios modificatorios no están en el registro, así que el techo no es exacto.'}</li>
            <li>{en ? 'The train’s title scan misses contracts that do not name it; by its three institutions instead, the six-year share moves by about one point.' : 'La búsqueda por título no ve los contratos del tren que no lo nombran; medido por sus tres instituciones, la parte de seis años cambia en un punto.'}</li>
            <li>{en ? 'Pemex and CFE «0» means not in CompraNet, not no contract: they publish on their own portals.' : 'El «0» de Pemex y la CFE quiere decir fuera de CompraNet, no sin contrato: publican en sus portales.'}</li>
            <li>{en ? `${y1}: CompraNet to 28 Sep plus ComprasMX, against the full year’s accounts. Current pesos. Reproducible with RUBLI’s open code. It is not a finding of wrongdoing about anyone; a contract’s risk chip is an indicator, not a verdict on the work.` : `${y1}: CompraNet al 28 sep más ComprasMX, contra la Cuenta de todo el año. Pesos corrientes. Reproducible con el código abierto de RUBLI. No es una conclusión de irregularidad sobre nadie; el chip de riesgo de un contrato es un indicador, no un veredicto sobre la obra.`}</li>
          </ul>
        </div>
      </div>
      </details>
    </section>
  )
}
