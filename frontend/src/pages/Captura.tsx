/**
 * /captura — «Captura institucional» (owner pick 2026-10-27, _explore/captura_concepts_2026-10-27/README.md):
 * A «El relevo» as the page (the capture changed owner: energy → health) + C's «La mitad» as the second
 * finding + B's survival slope; findings first, evidence second, the register last. Interaction is the core
 * (owner 2026-10-27, «I want more clicks in this section»): every band, buyer, company and dot opens the
 * in-page dissection (components/captura/Diseccion.tsx), addressed by ?sector= / ?inst= / &pair=.
 * Two definitions, named every time: dominante = ≥ 80% of the COMPANY's federal income from one buyer;
 * mayoría = one company took ≥ 50% of a BUYER's year (≥ 100 MDP). The seal «dominante» marks both.
 * ?vista=gravedad keeps «La gravedad» (each buyer as a plate, components/captura/Gravedad.tsx).
 * Data: GET /captura/plates · /captura/majority (backend/api/routers/captura_v2.py).
 */
import { useMemo, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { capturaApi } from '@/api/captura'
import { Skeleton } from '@/components/ui/skeleton'
import { DocHead } from '@/components/contrato/DocHead'
import { ScopeSwitch } from '@/components/contrato/ScopeSwitch'
import { Gravedad } from '@/components/captura/Gravedad'
import { Relevo } from '@/components/captura/Relevo'
import { LaMitadDots, MitadLedger, instLabel } from '@/components/captura/LaMitad'
import { Casos, Registro } from '@/components/captura/Pruebas'
import { Diseccion } from '@/components/captura/Diseccion'
import { DissectContext, useDissect, useDissectionState } from '@/components/captura/dissect'
import { useBuyerScope } from '@/lib/scope'
import { buildRelevo } from '@/lib/captura/relevo'
import { PageQuestion } from '@/components/kit/PageQuestion'
import { PageHead } from '@/components/kit/PageHead'
import { pastDocumented, rankCasos, type CasoStatus } from '@/lib/captura/casos'
import { CAPTURA_TITLE } from '@/lib/captura/title'
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import { formatEntityName } from '@/lib/entity/format'
import { RISK_THRESHOLDS, SOURCE_SWITCH_ISO, textInk } from '@/lib/constants'
import { formatCut } from '@/lib/nav/toc'
import { buildCapturaLectura, moneyDual, num, type Claim, type Lang, type Token } from '@/lib/captura/lectura'
import { CapturaMuro, framePair } from '@/components/moneyPaths/CapturaMuro'
import { Escalera, scrollToRung } from '@/components/moneyPaths/MoneyPaths'
import { HOLDS, type RungK } from '@/lib/moneyPaths/ladder'
import { pct as mpPct, tc } from '@/lib/moneyPaths/fmt'
import '@/components/kit/kit.css'
import '@/components/vendor/vendor.css'
import '@/components/captura/captura.css'
import '@/components/captura/relevo.css'

export default function Captura() {
  const { i18n } = useTranslation()
  const lang: Lang = i18n.language.startsWith('es') ? 'es' : 'en'
  const [params] = useSearchParams()
  return params.get('vista') === 'gravedad' ? <GravedadView lang={lang} /> : <RelevoPage lang={lang} />
}

function GravedadView({ lang }: { lang: Lang }) {
  const en = lang === 'en'
  const [scope, setScope] = useBuyerScope()
  const q = useQuery({ queryKey: ['captura', 'plates', scope], queryFn: () => capturaApi.plates(scope), staleTime: 30 * 60 * 1000, placeholderData: keepPreviousData })
  return (
    <article className="ct ct-page ct-sheet">
      <div className="ct-wrap">
        <PageHead lang={lang} crumbs={[{ label: en ? 'Analysis' : 'Análisis' }, { label: CAPTURA_TITLE[lang], to: '/captura' }, { label: en ? 'Gravity' : 'La gravedad' }]}
          actions={<Link className="ct-link" to="/captura">{en ? `← ${CAPTURA_TITLE.en}: the findings` : `← ${CAPTURA_TITLE.es}: los hallazgos`}</Link>}
          finding={en ? 'Each buyer as a plate.' : 'Cada comprador como un plato.'} />
        <ScopeSwitch scope={scope} onScope={setScope} en={en}
          note={en ? 'Which buyers the plates, the companies and the totals count.' : 'Qué compradores cuentan los platos, las empresas y los totales.'} />
        {q.isLoading ? <Skeleton className="mt-3 h-[560px] w-full" />
          : q.isError || !q.data ? <p role="alert" className="ct-note">{en ? 'The register is not available right now.' : 'El registro no está disponible en este momento.'}</p>
            : <Gravedad lang={lang} meta={q.data.meta} buyers={q.data.buyers} pairs={q.data.pairs} />}
      </div>
    </article>
  )
}

function Tokens({ ts }: { ts: Token[] }) {
  const open = useDissect()
  return <>{ts.map((t, i) => typeof t === 'string' ? t
    : 'b' in t ? <b key={i}>{t.b}</b>
      : <button key={i} type="button" className="cr-inst" onClick={() => open({ inst: t.inst })}>{t.label}</button>)}</>
}

function ClaimList({ claims, lang }: { claims: Claim[]; lang: Lang }) {
  const en = lang === 'en'
  if (!claims.length) return null
  return (
    <ul className="cr-claims">
      {claims.map((c) => (
        <li key={c.key}>
          <b className="cr-fig" style={c.color ? { color: textInk(c.color) } : undefined}>{c.fig}</b>
          <span><Tokens ts={en ? c.en : c.es} /><span className="cr-src">{en ? c.src.en : c.src.es}</span></span>
        </li>
      ))}
    </ul>
  )
}

function Rail({ claims, lang }: { claims: Claim[]; lang: Lang }) {
  const en = lang === 'en'
  return (
    <aside className="cr-rail" aria-labelledby="cr-rail-h">
      <h2 id="cr-rail-h" className="vd-lec-h"><span>{en ? 'The reading' : 'La lectura'}</span><span className="vd-lec-k">{en ? '§ what the register says' : '§ lo que dice el registro'}</span></h2>
      <ClaimList claims={claims} lang={lang} />
    </aside>
  )
}

/** «La lectura» beside the ribbon (the sexenio shares already sit on its chapter heads); cohorts, IMSS and the model read under «Casos». */
const RAIL: Claim['key'][] = ['vigentes', 'siguen', 'energia']

function Sec({ id, title, k, children }: { id: string; title: string; k: ReactNode; children: ReactNode }) {
  return (
    <section className="ct-section cr-sec" aria-labelledby={`${id}-h`} id={id}>
      <h2 id={`${id}-h`} className="cr-h2"><span>{title}</span><span className="vd-lec-k">{k}</span></h2>
      {children}
    </section>
  )
}

function RelevoPage({ lang }: { lang: Lang }) {
  const en = lang === 'en'
  const { sel, open } = useDissectionState()
  const q = useQuery({ queryKey: ['captura', 'plates', 'federal'], queryFn: () => capturaApi.plates('federal'), staleTime: 30 * 60 * 1000 })
  const mq = useQuery({ queryKey: ['captura', 'majority'], queryFn: () => capturaApi.majority(), staleTime: 30 * 60 * 1000, retry: false })
  const m = useMemo(() => (q.data ? buildRelevo(q.data.buyers, q.data.pairs) : null), [q.data])
  const claims = useMemo(() => (m ? buildCapturaLectura(m) : []), [m])
  const cq = useQuery({ queryKey: ['captura', 'casos'], queryFn: () => capturaApi.casos(), staleTime: 30 * 60 * 1000, retry: false })
  const casos = useMemo(() => (q.data ? rankCasos(q.data.pairs.filter((p) => m?.buyer.has(p.institution_id))) : []), [q.data, m])
  const past = useMemo(() => (q.data ? pastDocumented(q.data.pairs.filter((p) => m?.buyer.has(p.institution_id))) : []), [q.data, m])
  const nSt = (s: CasoStatus) => casos.filter((c) => c.status === s).length
  const postTo = q.data?.meta.post_to?.slice(0, 10)
  const postCut = postTo ? formatCut(postTo, lang) : '—'
  const drawerOpen = m != null && (sel.inst != null || sel.sector != null)
  const [on, setOn] = useState<RungK>(3)  // SILVER-2: rung II is filtered, so the wall opens on III

  const crumbs = [{ label: en ? 'Analysis' : 'Análisis' }, { label: CAPTURA_TITLE[lang] }]
  const cut = <>CompraNet {en ? 'to' : 'al'} <b>{formatCut(SOURCE_SWITCH_ISO, lang)}</b>{postTo ? <> · ComprasMX {en ? 'to' : 'al'} <b>{formatCut(postTo, lang)}</b></> : null}</>
  const question = en ? 'Which agencies buy almost everything from one company?' : '¿Qué dependencias le compran casi todo a una sola empresa?'
  const dochead = <DocHead trail={crumbs} meta={cut} />
  if (q.isLoading || (!m && !q.isError)) {
    return <article className="ct ct-page ct-sheet"><div className="ct-wrap">{dochead}<div aria-busy="true"><Skeleton className="mt-3 h-8 w-[40ch]" /><Skeleton className="mt-3 h-[520px] w-full" /></div></div></article>
  }
  if (!m) {
    return <article className="ct ct-page ct-sheet"><div className="ct-wrap">{dochead}<p role="alert" className="ct-note">{en ? 'The register is not available right now.' : 'El registro no está disponible en este momento.'}</p></div></article>
  }

  const maj = mq.data
  // companies and personas físicas (named, labelled: owner policy 2026-10-29); another public body is not capture
  const named = maj ? maj.ledger.filter((r) => r.kind !== 'pub') : []
  const capNamed = named.filter((r) => r.cap).length
  const pub = maj ? maj.ledger.filter((r) => r.kind === 'pub').length : 0
  // no comparison across 2010: the 2002–2010 records (Structure A) barely identify suppliers (verdict 2026-11-04)
  const shares = maj ? maj.sex.filter((s) => s.a >= 2013 && s.b <= 2024 && s.buyer_years > 0).map((s) => s.half / s.buyer_years) : []
  const amloSex = maj?.sex.find((s) => s.name === 'AMLO')
  // one source of truth for 2024: the `years` row counts every buyer-year; the ledger lists each buyer once, at its latest year
  const y24 = maj?.years.find((y) => y.year === 2024)
  const in25 = new Set(maj ? maj.dots.filter((d) => d[1] === 2025).map((d) => d[0]) : [])
  const d24 = maj ? maj.dots.filter((d) => d[1] === 2024) : []
  const rep25 = d24.filter((d) => in25.has(d[0])).length, co24 = d24.filter((d) => d[3] === 'co').length
  const defs = en
    ? <><b>Dominant supplier</b> = at least 80% of the company’s federal income 2002–2025 comes from one buyer (≥ 50M MXN over ≥ 3 years). <b>Majority</b> = one company took at least 50% of a buyer’s spend in a year of ≥ 100M MXN.</>
    : <><b>Proveedor dominante</b> = al menos 80% del ingreso federal 2002–2025 de la empresa viene de un comprador (≥ 50 MDP en ≥ 3 años). <b>Mayoría</b> = una sola empresa cobró al menos 50% del gasto de un comprador en un año de ≥ 100 MDP.</>

  return (
    <DissectContext.Provider value={open}>
      <article className="ct ct-page ct-sheet cr">
        <div className="ct-wrap">
          <PageHead lang={lang} crumbs={crumbs} meta={cut}
            actions={<PageQuestion bare lang={lang} findingAt=".ph-finding"
            question={question}
            targets={['.cr-plot', '.cr-plot']}
            cues={{ plot: '.cr-plot', keys: '.cr-keys, .cr-keys-ph', claims: '.cr-claims' }}
            script={en
              ? '### 1\n[#plot] The coloured shape is money. It went to companies that sell almost everything to one agency.\n### 2\n[#keys] Each colour is the sector of the buyer. Click one. [#claims] On the right, what the register says.'
              : '### 1\n[#plot] La mancha de colores es dinero. Fue a empresas que le venden casi todo a una sola dependencia.\n### 2\n[#keys] Cada color es el sector de quien compra. Haga clic en uno. [#claims] A la derecha, lo que dice el registro.'}
            means={mq.isLoading ? null : y24 && y24.half > 0 ? (() => {
              const k = Math.round(y24.buyer_years / y24.half), w = (en ? ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'] : ['', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez'])[k] ?? num(k, lang)
              const most = co24 * 2 > y24.half
              return en
                ? <>In 2024, <b>one in {w}</b> large federal buyers gave more than half of its spending to a single supplier{most ? ', most often a private company' : ''}.</>
                : <>En 2024, <b>uno de cada {w}</b> grandes compradores federales le dio más de la mitad de su gasto a un solo proveedor{most ? '; en la mayoría de los casos, una empresa privada' : ''}.</>
            })() : (en ? 'The 2024 count is not available right now.' : 'La cuenta de 2024 no está disponible en este momento.')} />}
            kicker={CAPTURA_TITLE[lang]}
            finding={en
              ? <><b>{num(m.pairs, lang)}</b> companies live off a single buyer, one of <b>{num(m.buyers, lang)}</b> federal buyers, 2002–2025.</>
              : <><b>{num(m.pairs, lang)}</b> empresas viven de un solo comprador, de <b>{num(m.buyers, lang)}</b> compradores federales, 2002–2025.</>}
            question={question} />

          <Escalera page="captura" lang={lang} on={on} onRung={(k) => { setOn(k); scrollToRung(HOLDS.captura[k]) }} inst={(() => { const tp = framePair(m); const bs = tp ? m.buyer.get(tp.institution_id)?.siglas ?? '' : ''; return {
            2: `${num(m.buyers, lang)} ${en ? 'buyers' : 'compradores'} · ${num(m.pairs, lang)} ${en ? 'dominant suppliers' : 'proveedores dominantes'}`,
            ...(tp ? { 3: `${bs} ← ${tc(tp.name.split(',')[0])} · ${mpPct(tp.sh, lang)} ${en ? 'of its income' : 'de su ingreso'}` } : {}),
          } })()} />

          <section className="cr-object" id="compradores" aria-label={en ? 'The handover' : 'El relevo'}>
            <div>
              <Relevo m={m} lang={lang} />
            </div>
            <Rail claims={claims.filter((c) => RAIL.includes(c.key))} lang={lang} />
          </section>

          <CapturaMuro m={m} maj={maj} lang={lang} on={on} setOn={setOn} open={open} />

          {mq.isLoading && <Skeleton className="mt-4 h-[320px] w-full" />}
          {maj && (
            <Sec id="mitad" title={en ? 'Half' : 'La mitad'} k={en ? '§ buyers that handed half their year to one company' : '§ compradores que le dieron la mitad de su año a una sola empresa'}>
              {/* Mariana's two lines (audit #25): the finding, then what the squares are; the AMLO money and the
                  2002–2010 caveat read in «Cómo lo medimos» */}
              {shares.length > 0 && <p className="cr-two">
                <b>{en
                  ? <>Of every 100 large buyer-years, <i>{Math.round(100 * Math.min(...shares))} to {Math.round(100 * Math.max(...shares))}</i> gave half to one supplier.</>
                  : <>De cada 100 compradores-año grandes, <i>entre {Math.round(100 * Math.min(...shares))} y {Math.round(100 * Math.max(...shares))}</i> dieron la mitad a un proveedor.</>}</b>
                {en ? 'Each square: one large buyer in one year. The same under Peña Nieto and AMLO.' : 'Cada cuadro: un comprador grande en un año. Igual con Peña Nieto y con AMLO.'}
              </p>}
              <LaMitadDots d={maj} lang={lang} />
              <h3 className="cr-h3">{en ? `Who holds half today · ${num(named.length, lang)} buyers in 2024–25` : `Quién tiene la mitad hoy · ${num(named.length, lang)} compradores en 2024–25`}</h3>
              <p className="cr-two">
                <b>{en
                  ? <><i>{num(capNamed, lang)}</i> of these {num(named.length, lang)} suppliers also depend on that buyer: a two-way dependency.</>
                  : <><i>{num(capNamed, lang)}</i> de estos {num(named.length, lang)} proveedores también dependen de ese comprador: dependencia mutua.</>}</b>
                {en ? 'The list: which company holds half of each buyer’s year, 2024–25.' : 'La lista: qué empresa tiene la mitad del año de cada comprador, 2024–25.'}
              </p>
              <MitadLedger rows={named} colorOf={m.colorOf} lang={lang} />
            </Sec>
          )}

          <Sec id="casos" title={en ? 'Cases' : 'Casos'} k={en
            ? `§ ${num(casos.length, lang)} current pairs · the ${num(nSt('doc'), lang)} documented first`
            : `§ ${num(casos.length, lang)} parejas vigentes · primero las ${num(nSt('doc'), lang)} documentadas`}>
            {/* the key reads above the list (it once sat in a 340 px aside and made that column ~80 px
                longer in ES than in EN, so no layout balanced both (proof:ui RAGGED, review 2026-10-29) */}
            <Casos m={m} casos={casos} ev={cq.data} lang={lang} />
            {past.length > 0 && (
              <p className="cr-d-note">{en ? 'Documented, no longer current: ' : 'Documentadas que ya no son vigentes: '}
                {past.map((p, i) => (
                  <span key={`${p.vendor_id}-${p.institution_id}`}>{i ? ' · ' : ''}<EntityIdentityChip type="vendor" id={p.vendor_id} name={p.name} variant="name" className="cr-inst" /> (<EntityIdentityChip type="institution" id={p.institution_id} name={m.buyer.get(p.institution_id)?.name ?? ''} variant="name"
                    ariaLabel={formatEntityName('institution', m.buyer.get(p.institution_id)?.name ?? '', 'full')}>{instLabel(m.buyer.get(p.institution_id)?.name, m.buyer.get(p.institution_id)?.siglas)}</EntityIdentityChip>, {p.y1})</span>
                ))}</p>
            )}
            <aside className="cr-aside" aria-labelledby="cr-cs-lec">
              <h3 id="cr-cs-lec" className="cr-h3">{en ? 'Reading the cases' : 'Lectura de los casos'}</h3>
              {/* no «cohortes» claim: it set Fox (2002–2010, weak data) against AMLO, a comparison this page tells readers not to make */}
              <ClaimList claims={claims.filter((c) => c.key === 'imss' || c.key === 'modelo')} lang={lang} />
            </aside>
          </Sec>

          <Sec id="registro" title={en ? 'The register' : 'El registro'} k={en ? `§ ${num(m.buyers, lang)} federal buyers with dominant suppliers` : `§ ${num(m.buyers, lang)} compradores federales con proveedores dominantes`}>
            <Registro m={m} lang={lang} />
          </Sec>

          <details className="cr-how">
            <summary>{en ? 'How we measure it' : 'Cómo lo medimos'}</summary>
            <p>{defs}</p>
            <p>{en
                ? <><b>The ribbon.</b> Each chapter is a presidential term. The ribbon is the money billed by dominant suppliers, by the buyer’s sector. The numerals give that share of spend, year by year (bold ≥ 25%). <b>MX</b> is what they signed in ComprasMX after the blackout (13 months, to {postCut}). 2025 runs to 28 Sep; 2004 has almost no record. <b>Before 2010 the data is weak</b>: do not compare it. Click a band for its buyers.</>
                : <><b>La cinta.</b> Cada capítulo es un sexenio. La cinta es el dinero que cobraron los proveedores dominantes, por sector del comprador. Las cifras dicen qué parte del gasto fue a esos proveedores, año por año (negrita ≥ 25%). <b>MX</b> es lo que firmaron en ComprasMX tras el apagón (13 meses, al {postCut}). 2025 llega al 28 sep; 2004 casi no tiene registro. <b>Antes de 2010 el dato es débil</b>: no lo compare. Haga clic en una franja para ver sus compradores.</>}</p>
            <p>{en
                ? <><b>Half.</b> Each square is one buyer in one year of ≥ 100M MXN. One supplier took half or more of that year. Pale = a natural person or another public body. The figure divides those squares by all buyer-years ≥ 100M MXN. Sheinbaum = January–September 2025. Fox (2000–06) and Calderón (2006–12) are not compared: before 2010 the data is weak. Amounts above 100B MXN are excluded. Click a square for its buyer.{amloSex ? <> Under AMLO, <b>{moneyDual(amloSex.money_half, lang)}</b> was billed that way.</> : null}</>
                : <><b>La mitad.</b> Cada cuadro es un comprador en un año de ≥ 100 MDP. Un solo proveedor cobró ahí la mitad o más. Pálido = una persona física u otra entidad pública. La cifra divide esos cuadros entre todos los compradores-año ≥ 100 MDP. Sheinbaum = enero–septiembre de 2025. Fox (2000–06) y Calderón (2006–12) no se comparan: antes de 2010 el dato es débil. Se excluyen montos mayores a 100,000 MDP. Haga clic en un cuadro para ver a su comprador.{amloSex ? <> Con AMLO se cobraron así <b>{moneyDual(amloSex.money_half, lang)}</b>.</> : null}</>}</p>
            <p>{en
                ? <><b>Who holds half today.</b> A supplier with ≥ 80% of its income from that buyer carries the seal «dominant».{pub ? ` Left off the list: ${num(pub, lang)} with another public body.` : ''}{y24 && rep25 > 0 ? ` Each buyer shows once, at its latest year: ${num(rep25, lang)} of the ${num(y24.half, lang)} with a majority in 2024 repeated in 2025.` : ''}</>
                : <><b>Quién tiene la mitad hoy.</b> Un proveedor con ≥ 80% de su ingreso de ese comprador lleva el sello «dominante».{pub ? ` Fuera de la lista: ${num(pub, lang)} con otra entidad pública.` : ''}{y24 && rep25 > 0 ? ` Cada comprador aparece una vez, en su año más reciente: ${num(rep25, lang)} de los ${num(y24.half, lang)} con mayoría en 2024 la repitieron en 2025.` : ''}</>}</p>
            <p>{en
                ? <><b>Order:</b> documented cases first, then money × years with the buyer. All are current: a contract in 2024–25. <b>Documented case</b> = a RUBLI case with a recorded source. <b>Lead</b> ({num(nSt('lead'), lang)}) = linked to a case that still lacks sources. <b>Model only</b> ({num(nSt('model'), lang)}) = a critical risk indicator (≥ {RISK_THRESHOLDS.critical.toFixed(2)}), with no case or lead. None of them is proof of wrongdoing. The name opens the dossier; «dissect» opens the pair here.</>
                : <><b>Orden:</b> primero los casos documentados, luego dinero × años con el comprador. Todas son vigentes: un contrato en 2024–25. <b>Caso documentado</b> = un caso de RUBLI con fuente registrada. <b>Pista</b> ({num(nSt('lead'), lang)}) = ligada a un caso que aún no tiene fuentes suficientes. <b>Solo el modelo</b> ({num(nSt('model'), lang)}) = indicador de riesgo crítico (≥ {RISK_THRESHOLDS.critical.toFixed(2)}), sin caso ni pista. Ninguna es prueba de irregularidad. El nombre abre el expediente; «diseccionar» abre la pareja aquí.</>}</p>
            <p>{en
              ? <><b>The register.</b> The ruler is the share of the buyer’s 2024–25 spend that went to its dominant suppliers; the mark is half. Click a buyer to dissect it.</>
              : <><b>El registro.</b> La regla es la parte del gasto 2024–25 del comprador que fue a sus proveedores dominantes; la marca es la mitad. Haga clic en un comprador para diseccionarlo.</>}</p>
            <p>{en
              ? <><b>What it does not say.</b> Technical certification, regional exclusivity or regulatory dependence produce legitimate concentration. Natural persons are counted apart in this view; their personal RFC is never shown. Sources: CompraNet 2002–28 Sep 2025 + ComprasMX.</>
              : <><b>Lo que no dice.</b> La certificación técnica, la exclusividad regional o la dependencia regulatoria producen concentraciones legítimas. Las personas físicas se cuentan aparte en esta vista; su RFC personal nunca se muestra. Fuentes: CompraNet 2002–28 sep 2025 + ComprasMX.</>}</p>
          </details>

          <p className="cr-foot">{en
            ? 'A dependency is a fact of the award record, not proof of wrongdoing.'
            : 'Una dependencia es un hecho del registro, no prueba de irregularidad.'}
            {' '}<Link className="ct-link" to="/captura?vista=gravedad">{en ? 'Each buyer as a plate: La gravedad →' : 'Cada comprador como un plato: La gravedad →'}</Link></p>
        </div>
        {drawerOpen && <Diseccion sel={sel} m={m} maj={maj} lang={lang} />}
      </article>
    </DissectContext.Provider>
  )
}
