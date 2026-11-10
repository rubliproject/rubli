/**
 * Focos Rojos · «¿Quién muestra más señales de riesgo y nadie lo ha investigado?»
 * (/aria — the default since rc4; ?ver=concept still lands here; owner brief 2026-11-03 + owner review: the question is RISK the model surfaces, not money;
 * the ones no public register names yet come first — the h1 names the three registers it checks, never «conocido»).
 * The reader opens with a question, not a wall of 100 companies:
 *
 *   the question   sexenio × sector × buyer × pattern, four native selects in one sentence, each explained in a line
 *   the answer     the fila's vendors without a public case, ranked by their signals (IPS; money = size, not rank);
 *                  «ver también los que ya tienen caso» brings the documented ones back — two views of one set:
 *     El cielo     El Mapa's recipe (Firmamento): twelve sector constellations, one star per vendor, size = money,
 *                  red ring = indicador crítico; a sector name flies the camera in; the prominent names surface
 *     La lista     the Portada board's row standard (DESIGN.md §7): mono-caps labels, names in the reading face,
 *                  sector dot, buyer siglas, risk chip, the 1–3 reasons the vendor stands out; sortable; phone cards
 *   look closer    a star or a row → the vendor's card (aspects with numbers, rosette, stamps, dossier door)
 *
 * State lives in the URL (?ver=concept&vista=&sx=&sector=&inst=&pat=&orden=&v=). Data: GET /aria/mapa/escenario
 * once (the whole fila, columnar, cached 1 h); every scenario is computed in the browser (lib/aria/escenario).
 */
import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ariaApi, contractApi } from '@/api/client'
import { AskBar, PATTERN_PLAIN } from '@/components/aria/AskBar'
import { RegisterBoard } from '@/components/contracts/RegisterBoard'
import { VendorCard } from '@/components/aria/VendorCard'
import { DocHead } from '@/components/contrato/DocHead'
import { useLang } from '@/components/contrato/nav'
import { PageQuestion } from '@/components/kit/PageQuestion'
import { FoldToggle, useRowFold } from '@/components/contrato/Fold'
import { FieldCard } from '@/components/kit/Field'
import { FootNotes } from '@/components/kit/FootNotes'
import { ViewSwitch } from '@/components/kit/ViewSwitch'
import { Firmamento, esc, type Star } from '@/components/portada/Firmamento'
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import { useSky } from '@/lib/atlas/sky/useSky'
import { PATTERNS_OFF_IN_PROD } from '@/lib/aria/patterns'
import { climb, drillLevel, type Level } from '@/lib/aria/drill'
import { LEVEL_WORD, PATTERN_SOFT, softPattern, tr } from '@/lib/aria/mapa'
import { RING_TOP, buyersIn, ipsShown, decodeEscenario, inScenario, isSexKey, moneyIn, patternsIn, questionText, rankScenario, sexenioLabel, totals, vendorSky, whyList, type EscVendor, type Scenario, type SortKey } from '@/lib/aria/escenario'
import { CURRENT_MODEL_VERSION, SECTORS, getRiskLevelFromScore } from '@/lib/constants'
import { institutionShortName } from '@/lib/institutionShortName'
import { formatCut } from '@/lib/nav/toc'
import { formatVendorName } from '@/lib/vendor/formatName'
import { formatCompactMXN, formatNumber } from '@/lib/utils'
import '@/components/contrato/contrato.css'
import '@/components/kit/kit.css'
import '@/components/contracts/contracts.css'
import '@/components/aria/concept.css'
import { tour as demoTour } from '@/lib/tours'

const BEAT_KEY = 'rubli_beat_aria_concept'
const SHOW = 25
const MAX = 100
const sectorOf = (id: number | null | undefined) => SECTORS.find((s) => s.id === id) ?? SECTORS[SECTORS.length - 1]
const SORTS: SortKey[] = ['ips', 'risk', 'money', 'contracts']

export default function AriaConcept() {
  const lang = useLang()
  const en = lang === 'en'
  const L = (es: string, e: string) => (en ? e : es)
  const [params, setParams] = useSearchParams()
  const vista = params.get('vista') === 'lista' ? 'lista' : 'cielo'
  const sc: Scenario = {
    sx: isSexKey(params.get('sx')) ? (params.get('sx') as Scenario['sx']) : null,
    sector: (() => { const v = Number(params.get('sector')); return v >= 1 && v <= 12 ? v : null })(),
    inst: Number(params.get('inst')) || null,
    pat: PATTERN_SOFT[params.get('pat') ?? ''] ? params.get('pat') : null,
    caso: params.get('caso') === '1',
  }
  const sort: SortKey = (SORTS as string[]).includes(params.get('orden') ?? '') ? (params.get('orden') as SortKey) : 'ips'
  const vid = Number(params.get('v')) || null
  const nivel = params.get('nivel')
  const go = (patch: Record<string, string | number | null | undefined>, replace = false) => setParams((cur) => {
    const n = new URLSearchParams(cur)
    n.delete('ver') // the default /aria since rc4; ?ver=concept still lands here
    for (const [k, val] of Object.entries(patch)) { if (val == null || val === '') n.delete(k); else n.set(k, String(val)) }
    return n
  }, { replace })

  const esq = useQuery({ queryKey: ['aria-escenario'], queryFn: () => ariaApi.getEscenario(), staleTime: 3_600_000 })
  const { manifest: base } = useSky(false)
  const all = useMemo(() => (esq.data ? decodeEscenario(esq.data) : []), [esq.data])
  const skySet = useMemo(() => inScenario(all, sc, false), [all, sc.sx, sc.inst, sc.pat, sc.caso]) // eslint-disable-line react-hooks/exhaustive-deps
  const ranked = useMemo(() => rankScenario(all, sc, sort), [all, sc.sx, sc.sector, sc.inst, sc.pat, sc.caso, sort]) // eslint-disable-line react-hooks/exhaustive-deps
  const sky = useMemo(() => (skySet.length ? vendorSky(skySet, sc.sx, base, RING_TOP, sc.sector) : null), [skySet, sc.sx, base, sc.sector])
  const tot = useMemo(() => totals(ranked, sc.sx, sc.sector), [ranked, sc.sx, sc.sector])
  const buyers = useMemo(() => buyersIn(all, sc), [all, sc.sx, sc.sector, sc.pat, sc.caso]) // eslint-disable-line react-hooks/exhaustive-deps
  const pats = useMemo(() => patternsIn(all, sc), [all, sc.sx, sc.sector, sc.inst, sc.caso]) // eslint-disable-line react-hooks/exhaustive-deps
  const beat = useMemo(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false
    try { if (sessionStorage.getItem(BEAT_KEY)) return false; sessionStorage.setItem(BEAT_KEY, '1'); return true } catch { return false }
  }, [])

  const sName = (id: number) => (en ? sectorOf(id).nameEN : sectorOf(id).name)
  const instName = (id: number) => { const b = buyers.find((x) => x.id === id) ?? { name: all.find((v) => v.top_institution_id === id)?.top_institution ?? String(id) }; return institutionShortName(b.name, null).short }
  const money = (v: number) => formatCompactMXN(v)
  const question = questionText(sc, lang, { sector: sName, inst: instName })
  const top = ranked[0]
  const vendor = vid ? ranked.find((r) => r.vendor_id === vid) ?? all.find((r) => r.vendor_id === vid) ?? null : null
  const level: Level = drillLevel({ sector: sc.sector, vendor: !!vendor, nivel })
  const runDay = esq.data?.run?.completed_at ? formatCut(esq.data.run.completed_at.slice(0, 10), lang) : null

  useEffect(() => { document.title = `${question} · ${L('Focos rojos', 'Red flags')} · RUBLI` }, [question]) // eslint-disable-line react-hooks/exhaustive-deps

  /** The answer: [h1 = who shows most signals (and no public case), lede = why, in plain words] — for the sector in focus. */
  const answer = (focus: number | null): [ReactNode, ReactNode] => {
    if (esq.isError) return [L('No se pudo cargar la fila de investigación.', 'The investigation line did not load.'), L('Recargue la página.', 'Reload the page.')]
    if (!esq.data) return [L('Cargando la fila de investigación…', 'Loading the investigation line…'), null]
    const set = focus != null && focus !== sc.sector ? rankScenario(all, { ...sc, sector: focus }, 'ips') : sort === 'ips' ? ranked : rankScenario(all, sc, 'ips')
    const first = set[0]
    const where = [sexenioLabel(sc.sx, lang), focus != null ? `${L('entre los que venden en', 'among those selling in')} ${sName(focus)}` : null, sc.inst != null ? `${L('que venden sobre todo a', 'that sell mostly to')} ${instName(sc.inst)}` : null, sc.pat ? `${L('con el patrón', 'with the pattern')} «${tr(PATTERN_SOFT[sc.pat], lang)}»` : null].filter(Boolean).join(', ')
    const Where = where.charAt(0).toUpperCase() + where.slice(1)
    if (!first) return [L(`${Where}: ningún proveedor marcado para investigar.`, `${Where}: no supplier flagged for investigation.`), L('Quite un filtro de la pregunta.', 'Remove a filter from the question.')]
    const who = <b>{formatVendorName(first.vendor_name, 48)}</b>
    const why = whyList(set.slice(0, MAX), lang)[0]
    const got = <>{L('Recibió', 'It received')} <b>{money(moneyIn(first, sc.sx, focus))}</b> {sexenioLabel(sc.sx, lang)}{focus != null ? ` ${L('en', 'in')} ${sName(focus)}` : ''}.</>
    const lede = why.length ? <><b>{L('Por qué', 'Why')}</b>: {why.join(' · ')}. {got}</> : got
    const noCase = sc.caso ? '' : L(' sin caso público', ' with no public case')
    return en
      ? [<>{Where}, {who} shows the most warning signs{noCase}.</>, lede]
      : [<>{Where}, {who} es quien más señales de alerta muestra{noCase}.</>, lede]
  }

  // the «sin caso» definition lives in the narration (step 2): the script replaces `read`, so a `read` never showed
  const defEs = sc.caso ? ' Aquí entran también los que ya tienen caso público.' : ' «Sin caso»: no está en la lista 69-B definitiva del SAT. Tampoco tiene sanción de la SFP ni caso en RUBLI.'
  const defEn = sc.caso ? ' This also includes those with a public case.' : ' “No case”: not on SAT’s definitive 69-B list. No SFP sanction and no RUBLI case either.'
  // the tour's script, over this view's own chart: the sky (and its key) or the list (owner 11-04: one question on
  // /aria, so the strip IS the question bar below and the page's h1 stays the one finding)
  const inS = sc.sector != null ? sName(sc.sector) : null
  const tourSky = {
    targets: ['.pf-cv', '.pf-cv'], cues: { sky: '.pf-cv', key: '.pf-key', figs: '.pf-figs' },
    see: L('Un punto por proveedor marcado para investigar; centro = mayor prioridad; tamaño = dinero recibido.', 'One dot per supplier flagged for investigation; centre = highest priority; size = money received.'),
    script: L(`### 1\n[#sky] Cada punto es una empresa con señales de alerta${inS ? ` que vende en ${inS}` : ''}. El color es su sector.\n### 2\nEn el centro de cada nube, la que más urge revisar. Más grande, más dinero. [#key] Un anillo rojo: de las más urgentes. [#figs] Abajo, cuántas son y cuánto recibieron.${defEs}`,
      `### 1\n[#sky] Each star is a company with warning signs${inS ? ` that sells in ${inS}` : ''}. The colour is its sector.\n### 2\nAt the centre of each cloud, the most urgent to check. Bigger, more money. [#key] A red ring: among the most urgent. [#figs] Below, how many and how much they got.${defEn}`)
  }
  const tourList = {
    targets: ['.acb-list', '.acb-list'], cues: { list: '.acb-list', row: '.acb-row', head: '.acb-sort' },
    see: L('Una fila por proveedor marcado para investigar, de mayor a menor prioridad.', 'One row per supplier flagged for investigation, highest priority first.'),
    script: L(`### 1\n[#list] Una fila por empresa con señales de alerta. Primero, la que más urge revisar.\n### 2\n[#row] La etiqueta dice qué tan fuerte es la alerta. «Por qué destaca» da un ejemplo. [#head] También puede ordenar por dinero.${defEs}`,
      `### 1\n[#list] One row per company with warning signs. First, the most urgent to check.\n### 2\n[#row] The tag says how strong the alert is. “Why it stands out” gives an example. [#head] You can also sort by money.${defEn}`),
  }
  const tourL3 = {
    targets: ['.ac-l3 .bd-list', '.ac-l3 .bd-list'], cues: { list: '.ac-l3 .bd-list', amt: '.ac-l3 .bd-amt', risk: '.ac-l3 .bd-risk' },
    see: L('Un renglón por contrato de esta empresa; primero, el de indicador más alto.', 'One row per contract of this company; the highest indicator first.'),
    script: L('### 1\n[#list] Un renglón por contrato de esta empresa. Arriba, los de indicador más alto.\n### 2\n[#risk] La etiqueta dice qué tan fuerte es la alerta. [#amt] El monto abre el contrato.',
      '### 1\n[#list] One row per contract of this company. On top, the highest indicators.\n### 2\n[#risk] The tag says how strong the alert is. [#amt] The amount opens the contract.'),
  }
  const tour = level === 3 ? tourL3 : vista === 'cielo' ? { ...tourSky, ...demoTour('aria', lang) } : tourList // the demo walk-through (lib/tours.ts)

  const byId = useMemo(() => new Map(all.map((v) => [v.vendor_id, v])), [all])
  // the descent's path: every level above this one is a door back (Esc climbs one)
  const step = (to: Level, label: string) => level > to
    ? <><button type="button" title={label} onClick={() => go(climb(to))}>{label}</button><span aria-hidden="true">›</span></>
    : <b aria-current="location">{label}</b>
  const crumb = level === 0 ? null : (
    <nav className="pf-crumb ac-crumb" aria-label={L('Ruta', 'Path')}>
      {step(0, L('Todos los sectores', 'All sectors'))}
      {sc.sector != null && step(1, sName(sc.sector))}
      {vendor && step(2, formatVendorName(vendor.vendor_name, 36))}
      {level === 3 && step(3, L('Sus contratos', 'Its contracts'))}
      <span className="kf-mono" aria-hidden="true">{L('Esc para volver', 'Esc to go back')}</span>
    </nav>
  )
  useEffect(() => {
    if (level < 2) return  // the crumb says «Esc para volver» from the vendor card down
    if (level === 3) window.scrollTo({ top: 0 })
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !e.defaultPrevented && !(e.target as HTMLElement | null)?.closest?.('input, select, textarea, [role="dialog"]')) go(climb(level === 3 ? 2 : 1)) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [level]) // eslint-disable-line react-hooks/exhaustive-deps
  const words = useMemo(() => ({
    root: L('Todos los sectores', 'All sectors'),
    vendorSearch: false as const,
    label: L(`Panorama de ${skySet.length} proveedores marcados para investigar en 12 sectores: cada punto un proveedor, su tamaño el dinero recibido ${sexenioLabel(sc.sx, lang)}, anillo rojo = los ${RING_TOP} de mayor prioridad de cada sector con indicador crítico`, `Panorama of ${skySet.length} suppliers flagged for investigation in 12 sectors: one dot per supplier, size = money received ${sexenioLabel(sc.sx, lang)}, red ring = each sector's ${RING_TOP} highest-priority ones at a critical indicator`),
    seek: L('Busque un proveedor', 'Find a supplier'),
    ringMin: 0,
    ringQuiet: true,
    rank: (s: Star) => s.h,
    claim: answer,
    tip: (s: Star) => {
      const v = byId.get(s.id)
      const lvl = v?.avg_risk_score == null ? null : getRiskLevelFromScore(v.avg_risk_score)
      const ind = lvl ? `${L('indicador', 'indicator')} ${lvl === 'critical' ? '≥ 0.60' : v!.avg_risk_score!.toFixed(2)} ${tr(LEVEL_WORD[lvl], lang)}` : ''
      const soft = v ? softPattern(v.primary_pattern, lang) : null
      return `<b>${esc(formatVendorName(s.name, 60))}</b>${v?.persona_fisica ? ` · ${L('persona física', 'natural person')}` : ''} · ${sName(s.sec)} · <b>${money(s.v)}</b> ${esc(sexenioLabel(sc.sx, lang))} · ${formatNumber(s.nv)} ${L('contratos', 'contracts')}${ind ? ` · ${ind}` : ''}${soft ? ` · ${esc(soft)}` : ''}`
    },
    pick: { id: vid, set: (id: number | null) => go(id == null ? climb(1) : { v: id, sector: sc.sector ?? byId.get(id)?.primary_sector_id ?? null }) },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [skySet, sc.sx, sc.sector, sc.inst, sc.pat, ranked, tot, vid, en, byId])

  const fig = (v: number | null | undefined, f: (x: number) => string = formatNumber) => (v == null ? '—' : f(v))
  const figures = (
    <dl className="pf-figs">
      <div><dt>{L('proveedores', 'suppliers')}</dt><dd>{fig(esq.data ? tot.n : null)}</dd></div>
      <div><dt>{L('recibido', 'received')}</dt><dd>{fig(esq.data ? tot.money : null, money)}</dd></div>
      <div><dt>{L('crítico', 'critical')}</dt><dd className="is-crit">{fig(esq.data ? tot.crit : null)}</dd></div>
      <div><dt>{L('compradores', 'buyers')}</dt><dd>{fig(esq.data ? buyers.length : null)}</dd></div>
      <div className="pf-key">
        <dt className="sr-only">{L('Clave', 'Key')}</dt>
        <dd>
          <span><i style={{ background: 'var(--color-text-muted)' }} aria-hidden="true" />{L('punto = un proveedor', 'dot = one supplier')}</span>
          <span>{L('tamaño = dinero recibido', 'size = money received')}</span>
          <span><i className="is-ring is-quiet" aria-hidden="true" />{L('anillo = crítico, sin caso', 'ring = critical, no case')}</span>
          <span><i className="is-ring" aria-hidden="true" />{L('rojo = los más urgentes', 'red = the most urgent')}</span>
        </dd>
      </div>
      {!sc.caso && (
        <p className="text-text-muted" style={{ gridColumn: '1 / -1', margin: 0, fontSize: 12 }}>
          {L('Sin caso: sin lista SAT 69-B, sin sanción SFP y sin caso en el archivo de RUBLI.', 'No case: not on the SAT 69-B list, no SFP sanction, no case in RUBLI’s files.')}
        </p>
      )}
    </dl>
  )

  const trail = [
    { label: L('Investigar', 'Investigate') },
    { label: L('Focos rojos', 'Red flags'), to: '/aria' },
    { label: L('¿Quién muestra más señales?', 'Who shows the most signals?') },
  ]
  const views = <ViewSwitch lang={lang} value={vista} onChange={(k) => go({ vista: k === 'cielo' ? null : k }, true)} views={[
    { key: 'cielo', es: 'El cielo', en: 'The sky' },
    { key: 'lista', es: 'La lista', en: 'The list' },
  ]} />

  // ← → walks the ranking from the open card
  const i = vendor ? ranked.findIndex((r) => r.vendor_id === vendor.vendor_id) : -1
  const prev = i > 0 ? ranked[i - 1] : null
  const next = i >= 0 && i < ranked.length - 1 ? ranked[i + 1] : null

  // L2: the vendor's card — beside the sky (below it on a phone), never over the finding, no inner scroll
  const cardTitle = vendor ? <>{L('La ficha', 'The card')}{i >= 0 ? ` · ${L('lugar', 'place')} ${vendor.rank}` : ''} · {L('prioridad', 'priority')} {ipsShown(vendor).toFixed(2)} · {L('nivel', 'tier')} {vendor.ips_tier}</> : null
  const cardBody = vendor ? (
    <>
      {vendor.primary_pattern && PATTERN_PLAIN[vendor.primary_pattern] && <p className="ac-find">{PATTERN_PLAIN[vendor.primary_pattern][en ? 1 : 0]}</p>}
      <button type="button" className="ac-door" onClick={() => go({ nivel: 'contratos' })}>
        {L(`Ver sus ${formatNumber(vendor.total_contracts)} contratos`, `See its ${formatNumber(vendor.total_contracts)} contracts`)} <span aria-hidden="true">›</span>
      </button>
      <VendorCard brief v={vendor} lang={lang} prev={prev} next={next} go={(id) => go({ v: id }, true)}
        lead={sc.sx || sc.sector != null ? { label: `${L('recibió', 'received')}${sc.sx ? ` ${sexenioLabel(sc.sx, lang)}` : ''}${sc.sector != null ? ` ${L('en', 'in')} ${sName(sc.sector)}` : ''}`, value: money(moneyIn(vendor, sc.sx, sc.sector)) } : undefined} />
    </>
  ) : null
  const cardRef = useRef<HTMLElement>(null)
  useEffect(() => {
    const el = cardRef.current
    if (!el) return
    el.focus({ preventScroll: true })
    // on a phone the card sits under the sky: bring it into view
    if (window.matchMedia('(max-width: 1099px)').matches) el.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  }, [vid, level, !!vendor]) // eslint-disable-line react-hooks/exhaustive-deps -- re-run when a deep-linked vendor arrives
  const pf = (c: string) => (PATTERNS_OFF_IN_PROD as readonly string[]).includes(c)
  const questionBar = <AskBar sc={sc} lang={lang} buyers={buyers} pats={pats} go={go} />

  return (
    <article className={`ct ct-page ac${sc.sector ? ' is-in' : ''}`}>
      <div className="ct-wrap">
        <DocHead trail={trail} views={views} />
        <PageQuestion lang={lang} question={questionBar} see={tour.see} means={esq.data ? answer(sc.sector)[0] : null}
          findingAt=".pf-claim" targets={tour.targets} cues={tour.cues} script={tour.script} />
        {level === 3 && vendor ? (
          <Contratos v={vendor} lang={lang} crumb={crumb} />
        ) : vista === 'cielo' ? (
          sky ? (
            <div className={`ac-stage${level === 2 && vendor ? ' has-card' : ''}`}>
              <Firmamento key={lang} manifest={sky} lang={lang} totalInstitutions={null} totalValue={null} riskPct={null} beat={beat} figures={figures} words={{ ...words, crumb }} />
              {level === 2 && vendor && (
                <aside className="ac-card" aria-labelledby="ac-card-t" ref={cardRef} tabIndex={-1}>
                  <div className="ac-card-h">
                    <p id="ac-card-t" className="ac-card-t">{cardTitle}</p>
                    <button type="button" className="ac-card-x" aria-label={L('Cerrar la ficha', 'Close the card')} onClick={() => go(climb(1))}>×</button>
                  </div>
                  {cardBody}
                </aside>
              )}
            </div>
          ) : (
            <section className="pf" aria-busy={esq.isLoading}>
              <div className="pf-head"><p className="pf-claim">{answer(sc.sector)[0]}</p></div>
              <div className="pf-sky pf-sky-skel" />
              {figures}
            </section>
          )
        ) : (
          <section className="ac-answer">
            <h1 className="pf-claim">{answer(sc.sector)[0]}</h1>
            <p className="ct-lede">{answer(sc.sector)[1]}</p>
            <Board rows={ranked} loaded={!!esq.data} sc={sc} sort={sort} lang={lang} vid={vid} setSort={(k) => go({ orden: k === 'ips' ? null : k }, true)} open={(id) => go({ v: id })} />
          </section>
        )}
        {(level === 1 || level === 2) && sc.sector != null && vista === 'cielo' && ranked.length > 0 && (
          <section className="ac-l1" aria-labelledby="ac-l1-h">
            <h2 id="ac-l1-h" className="ac-h2">{L(`Los cinco con más señales en ${sName(sc.sector!)}`, `The five with the most signs in ${sName(sc.sector!)}`)}</h2>
            <Board rows={ranked} loaded={!!esq.data} sc={sc} sort={sort} lang={lang} vid={vid} setSort={(k) => go({ orden: k === 'ips' ? null : k }, true)} open={(id) => go({ v: id })} show={5} brief />
          </section>
        )}
        {level < 3 && vista === 'cielo' && top && (
          <p className="ac-foot">
            <Link className="ct-link" to={`?${new URLSearchParams({ ...Object.fromEntries(params), vista: 'lista' })}`}>{L('Todos, en la lista', 'All of them, in the list')} ›</Link>
            <Link className="ct-link" to={`/aria${sc.sector ? `?sector_id=${sc.sector}` : ''}`}>{L('Toda la fila, como registro', 'The whole line, as a register')} ›</Link>
          </p>
        )}
        <FootNotes lang={lang} lead={L('Un indicador de riesgo no es prueba: señala patrones parecidos a casos documentados.', 'A risk indicator is not proof: it flags patterns like documented cases.')} items={[
          L(`Cada punto es un proveedor marcado. Tamaño: dinero recibido (escala logarítmica). Color: su sector. El centro de cada grupo es la prioridad más alta. Anillo rojo: los ${RING_TOP} más urgentes de cada sector, críticos (≥ 0.60) y sin caso público. Los seis primeros llevan nombre.`, `Each dot is a flagged supplier. Size: money received (log scale). Colour: its sector. The centre of each group is the highest priority. Red ring: each sector's ${RING_TOP} most urgent, critical (≥ 0.60), with no public case. The top six carry a name.`),
          ...(runDay ? [`${L('Corrida ARIA del', 'ARIA run of')} ${runDay} · ${L('modelo', 'model')} ${CURRENT_MODEL_VERSION}.`] : []),
          L('La fila de investigación: los proveedores de los niveles 1–3 de la última corrida ARIA (prioridad ≥ 0.40), sin los falsos positivos marcados por analistas.', 'The investigation line: the suppliers at tiers 1–3 of the latest ARIA run (priority ≥ 0.40), analyst-marked false positives off.'),
          L('El dinero por sexenio suma los contratos del proveedor en los años del sexenio (regla del presidente saliente: 2018 cuenta para Peña Nieto), en todos sus sectores (con un sector elegido, sólo lo de ese sector); CompraNet 2002–sep 2025 y ComprasMX desde entonces.', 'Money per term sums the supplier’s contracts in the term’s years (outgoing-president rule: 2018 counts for Peña Nieto), across all its sectors (with a sector chosen, only that sector’s); CompraNet 2002–Sep 2025 and ComprasMX since.'),
          L('Un proveedor vende en varios sectores: en el panorama aparece una vez, en el sector donde más vende (por dinero, 2002–2026); con un sector elegido, la lista incluye a los que reciben ahí al menos una cuarta parte de su dinero del periodo (o lo tienen como sector principal) y cuenta sólo lo que recibieron en ese sector. Comprador = su comprador principal; patrón = el de mayor confianza del clasificador ARIA.', 'A supplier sells in several sectors: in the panorama it appears once, in the sector where it sells most (by money, 2002–2026); with a sector chosen, the list includes those that receive at least a quarter of the period’s money there (or have it as main sector) and counts only what they received in that sector. Buyer = its main buyer; pattern = the ARIA classifier’s highest-confidence one.'),
          L('«Sin caso en el SAT, la SFP ni RUBLI» = no está en la lista 69-B del SAT (EFOS definitivo), no tiene sanción de la SFP y RUBLI no tiene un caso sobre él (documentado, o que cite prensa, un acto legal o una auditoría); fuera de esos casos, la prensa, la ASF y la FGR no se consultan aquí, así que puede existir una investigación que esta página no conoce. El orden es la prioridad de investigación (IPS) de ARIA: indicador de riesgo o anomalía 40 %, modelo anterior 20 %, registros externos 20 %, escala del dinero 20 %; empates por indicador y luego dinero.', '“No case at SAT, SFP or RUBLI” = not on SAT’s 69-B list (definitive EFOS), no SFP sanction and no RUBLI case on it (documented, or citing the press, a legal act or an audit); beyond those cases, the press, the ASF and the FGR are not consulted here, so an investigation this page does not know of may exist. The order is ARIA’s investigation priority (IPS): risk indicator or anomaly 40%, earlier model 20%, external records 20%, scale of the money 20%; ties by indicator then money.'),
          ...(pats.some((p) => pf(p.code)) ? [L('«Monto fuera de rango» (P5) compara montos con la mediana de su partida, un dato que la base publicada aún no trae: en producción no aparece.', '“Amount out of range” (P5) compares amounts with their line-item median, which the published database lacks: it does not appear in production.')] : []),
        ]} />
        {vendor && level === 2 && vista === 'lista' && (
          <FieldCard title={cardTitle} onClose={() => go(climb(1))} lang={lang} focusKey={vendor.vendor_id}>{cardBody}</FieldCard>
        )}
      </div>
    </article>
  )
}

/* ── La lista: the board's row standard (DESIGN.md §7 «Contratos recientes»), one row per vendor ── */
function Board({ rows, loaded, sc, sort, lang, vid, setSort, open, show = SHOW, brief = false }: { rows: EscVendor[]; loaded: boolean; sc: Scenario; sort: SortKey; lang: 'es' | 'en'; vid: number | null; setSort: (k: SortKey) => void; open: (id: number) => void; /** rows before the fold */ show?: number; /** the drill's short list: no sort line, no legend (the sky's key says it) */ brief?: boolean }) {
  const en = lang === 'en'
  const L = (es: string, e: string) => (en ? e : es)
  const listed = rows.slice(0, MAX)
  const { shown, rest, open: unfolded, toggle } = useRowFold(listed, show)
  const whys = useMemo(() => whyList(listed, lang), [rows, lang]) // eslint-disable-line react-hooks/exhaustive-deps
  const head = (k: SortKey, es: string, e: string, cls = '') => (
    <button type="button" className={`acb-th ${cls}${sort === k ? ' is-on' : ''}`} aria-pressed={sort === k} onClick={() => setSort(k)} title={k === 'ips' ? L('Prioridad de investigación (0–1): combina indicador de riesgo, anomalía, registros externos y tamaño del dinero; de mayor a menor; con la misma cifra a dos decimales comparten Nº y los ordena el indicador y luego el dinero', 'Investigation priority (0–1): combines risk indicator, anomaly, external records and the size of the money; highest first; equal to two decimals they share a Nº, ordered by indicator then money') : k === 'risk' ? L('Ordenar por indicador, de mayor a menor; entre los críticos (≥ 0.60) decide el dinero', 'Sort by indicator, highest first; among the critical (≥ 0.60) the money decides') : L('Ordenar de mayor a menor', 'Sort, largest first')}>
      {L(es, e)}{sort === k && <span aria-hidden="true"> ↓</span>}
    </button>
  )
  return (
    <section className="acb" aria-label={L('La lista', 'The list')}>
      {!brief && <p className="acb-sort">
        <label>{L('Ordenar por', 'Sort by')}{' '}
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            <option value="ips">{L('prioridad de investigación', 'investigation priority')}</option>
            <option value="risk">{L('indicador de riesgo', 'risk indicator')}</option>
            <option value="money">{L('lo que recibió', 'money received')}</option>
            <option value="contracts">{L('contratos', 'contracts')}</option>
          </select>
        </label>
      </p>}
      <div className="acb-cols">
        <span className="acb-n">Nº</span>
        <span>{L('Proveedor', 'Supplier')}</span>
        <span>{L('Sector', 'Sector')}</span>
        <span>{L('Comprador', 'Buyer')}</span>
        {head('ips', 'Prioridad', 'Priority', 'r')}
        {head('money', `Recibió${sc.sector != null ? ' ahí' : ''} ${sc.sx ? '' : '2002–2026'}`.trim(), `Received${sc.sector != null ? ' there' : ''} ${sc.sx ? '' : '2002–2026'}`.trim(), 'r')}
        {head('contracts', 'Contratos', 'Contracts', 'r')}
        {head('risk', 'Indicador de riesgo', 'Risk indicator')}
        <span>{L('Por qué destaca', 'Why it stands out')}</span>
        <span className="sr-only">{L('Ficha', 'Card')}</span>
      </div>
      {rows.length === 0 && <p className="acb-empty" aria-busy={!loaded}>{loaded ? L('Ningún proveedor marcado para investigar cabe en esta pregunta. Quite un filtro.', 'No supplier flagged for investigation fits this question. Remove a filter.') : L('Cargando la fila de investigación…', 'Loading the investigation line…')}</p>}
      <ol className="acb-list" id="acb-list">
        {shown.map((v, i) => <Row key={v.vendor_id} v={v} why={whys[i]} sc={sc} lang={lang} on={v.vendor_id === vid} open={() => open(v.vendor_id)} />)}
      </ol>
      <FoldToggle open={unfolded} rest={rest} onToggle={toggle} controls="acb-list" />
      {brief && shown.some((r, k) => k > 0 && r.rank === shown[k - 1].rank) && <p className="acb-tie">{L('Mismo Nº = empate en prioridad.', 'Same Nº = tied on priority.')}</p>}
      {!brief && <ul className="acb-legend" aria-label={L('Cómo leer la lista', 'How to read the list')}>
        <li><i className="acb-dot is-key" aria-hidden="true" />{L('color = sector principal del proveedor', 'colour = the supplier’s main sector')}</li>
        <li className="acb-lg-gap">
          {(['critical', 'high', 'medium', 'low'] as const).map((l) => (
            <span key={l} className={`acb-st is-${l}`}>{tr(LEVEL_WORD[l], lang)}{l === 'critical' ? ' ≥ 0.60' : l === 'high' ? ' ≥ 0.40' : l === 'medium' ? ' ≥ 0.25' : ' < 0.25'}</span>
          ))}
          {L('indicador de riesgo del proveedor (promedio de sus contratos)', 'the supplier’s risk indicator (mean over its contracts)')}
        </li>
        <li className="acb-lg-gap">{L('† más de 10,000 MDP en el periodo: marcado para revisión manual', '† above MXN 10B in the period: flagged for manual review')}</li>
        <li className="acb-lg-gap">{L('Prioridad: la nota de investigación de ARIA, de 0 a 1 (nivel 1 desde 0.80, 2 desde 0.60, 3 desde 0.40); combina indicador, anomalía, registros y tamaño del dinero. Iguales a dos decimales = empate: mismo Nº.', 'Priority: ARIA’s investigation mark, 0 to 1 (tier 1 from 0.80, 2 from 0.60, 3 from 0.40); combines indicator, anomaly, records and the size of the money. Equal to two decimals = a tie: same Nº.')}</li>
        <li className="acb-lg-gap">{L('Por qué destaca: su patrón en palabras llanas y el dato en que más se aparta de los demás de esta lista (su comprador, licitaciones con un solo adjudicado, adjudicación directa, llegada o salida, montos, peso en su sector); si no hay nada, «—».', 'Why it stands out: its pattern in plain words and the fact where it departs most from the rest of this list (its buyer, sole-bidder tenders, direct awards, arrival or exit, amounts, weight in its sector); “—” when there is nothing.')}</li>
        {rows.length > MAX && <li className="acb-lg-gap">{L(`Se muestran ${MAX} de ${formatNumber(rows.length)}.`, `Showing ${MAX} of ${formatNumber(rows.length)}.`)} <Link className="acb-link" to={`/aria${sc.sector ? `?sector_id=${sc.sector}` : ''}`}>{L('Toda la fila →', 'The whole line →')}</Link></li>}
      </ul>}
    </section>
  )
}

function Row({ v, why, sc, lang, on, open }: { v: EscVendor; why: string[]; sc: Scenario; lang: 'es' | 'en'; on: boolean; open: () => void }) {
  const en = lang === 'en'
  const L = (es: string, e: string) => (en ? e : es)
  const s = sectorOf(v.primary_sector_id)
  const lvl = v.avg_risk_score == null ? null : getRiskLevelFromScore(v.avg_risk_score)
  const m = moneyIn(v, sc.sx, sc.sector)
  const buyer = v.top_institution ? institutionShortName(v.top_institution, null) : null
  return (
    <li className={`acb-row${on ? ' is-on' : ''}`} onClick={(e) => { if (!(e.target as HTMLElement).closest('a, button')) open() }}>
      <span className="acb-n">{String(v.rank).padStart(3, '0')}</span>
      <span className="acb-name">
        <EntityIdentityChip type="vendor" id={v.vendor_id} name={formatVendorName(v.vendor_name, 120)} variant="name" className="acb-chip" fullName />
        {v.persona_fisica && <span className="acb-dim"> · {L('persona física', 'natural person')}</span>}
      </span>
      <span className="acb-meta">
      <span className="acb-sec" title={sc.sector != null && v.primary_sector_id !== sc.sector ? L(`Vende sobre todo en ${en ? s.nameEN : s.name}; también en ${sectorOf(sc.sector).name}`, `Sells mostly in ${s.nameEN}; also in ${sectorOf(sc.sector).nameEN}`) : undefined}><i className="acb-dot" style={{ background: s.color }} aria-hidden="true" />{en ? s.nameEN : s.name}{sc.sector != null && v.primary_sector_id !== sc.sector && <small className="acb-also"> · {L('también en', 'also in')} {en ? sectorOf(sc.sector).nameEN : sectorOf(sc.sector).name}</small>}</span>
      <span className="acb-buyer" title={buyer?.full}>
        {buyer && v.top_institution_id != null
          ? <EntityIdentityChip type="institution" id={v.top_institution_id} name={v.top_institution!} variant="name" className="acb-chip" ariaLabel={buyer.short === buyer.full ? buyer.full : `${buyer.short} — ${buyer.full}`}>{buyer.short}</EntityIdentityChip>
          : buyer?.short ?? '—'}
      </span>
      <span className="acb-pri r"><span className="acb-lbl">{L('prioridad', 'priority')} </span>{ipsShown(v).toFixed(2)}</span>
      <span className="acb-amt r">{m > 1e10 && <span title={L('Más de 10,000 MDP: marcado para revisión', 'Above MXN 10B: flagged for review')}>† </span>}{formatCompactMXN(m)}</span>
      <span className="acb-num acb-nct r"><span className="acb-lbl">{L('contratos', 'contracts')} </span>{formatNumber(v.total_contracts)}</span>
      <span className="acb-risk">
        {lvl ? <><span className={`acb-st is-${lvl}`}><span className="sr-only">{L('Indicador de riesgo: ', 'Risk indicator: ')}</span>{tr(LEVEL_WORD[lvl], lang)}</span><span className="acb-num">{lvl === 'critical' ? '≥ 0.60' : v.avg_risk_score!.toFixed(2)}</span></> : '—'}
      </span>
      </span>
      <span className="acb-why">
        {why.length ? why.map((w) => <span key={w}>{w}</span>) : <span className="acb-dim">—</span>}
      </span>
      <button type="button" className="acb-open" aria-expanded={on} onClick={open}>{L('ficha', 'card')}</button>
    </li>
  )
}

/* ── Level 3: the vendor's contracts, in El Archivo's board rows (RegisterBoard, DESIGN.md §7) ── */
const L3_ROWS = 25
function Contratos({ v, lang, crumb }: { v: EscVendor; lang: 'es' | 'en'; crumb: ReactNode }) {
  const en = lang === 'en'
  const h = useRef<HTMLHeadingElement>(null)
  useEffect(() => { h.current?.focus({ preventScroll: true }) }, [v.vendor_id])
  const L = (es: string, e: string) => (en ? e : es)
  const rows = useQuery({ queryKey: ['aria-l3', v.vendor_id], queryFn: () => contractApi.getAll({ vendor_id: v.vendor_id, sort_by: 'risk_score', sort_order: 'desc', per_page: L3_ROWS }), staleTime: 300_000 })
  const crit = useQuery({ queryKey: ['aria-l3-crit', v.vendor_id], queryFn: () => contractApi.getAll({ vendor_id: v.vendor_id, risk_level: 'critical', per_page: 1 }), staleTime: 300_000 })
  const n = rows.data?.pagination.total
  const m = crit.data?.pagination.total
  const who = <EntityIdentityChip type="vendor" id={v.vendor_id} name={formatVendorName(v.vendor_name, 80)} size="inherit" variant="name" fullName inline hideIcon />
  const claim = n == null || m == null
    ? <>{who}</>
    : m === 0
      ? (en ? <>{who}: none of its <b>{formatNumber(n)}</b> contracts carries a critical indicator.</> : <>{who}: ninguno de sus <b>{formatNumber(n)}</b> contratos tiene indicador crítico.</>)
      : (en ? <>{who}: <b>{formatNumber(m)}</b> of its <b>{formatNumber(n)}</b> contracts carry a critical indicator.</> : <>{who}: <b>{formatNumber(m)}</b> de sus <b>{formatNumber(n)}</b> contratos tienen indicador crítico.</>)
  return (
    <section className="ac-l3" aria-labelledby="ac-l3-h" style={{ animation: 'ct-rise var(--dur-state) var(--ease-out)' }}>
      <div className="pf-head">
        <h1 id="ac-l3-h" ref={h} tabIndex={-1} className="pf-claim">{claim}{v.persona_fisica && <small className="ac-pf"> · {L('persona física', 'natural person')}</small>}</h1>
        {crumb}
      </div>
      <p className="ct-lede">
        {n != null && n > L3_ROWS
          ? L(`Aquí, sus ${L3_ROWS} de indicador más alto.`, `Here, its ${L3_ROWS} with the highest indicator.`)
          : L('Del indicador más alto al más bajo.', 'Highest indicator first.')}
      </p>
      <RegisterBoard hideVendor quietLevels riskHead={m != null && m > 0 ? L(`Indicador · ${formatNumber(m)} críticos`, `Indicator · ${formatNumber(m)} critical`) : undefined} rows={rows.data?.data ?? []} lang={lang} label={L(`Contratos de ${formatVendorName(v.vendor_name, 80)}`, `Contracts of ${formatVendorName(v.vendor_name, 80)}`)}
        status={rows.isLoading ? <span aria-busy="true">{L('Cargando sus contratos…', 'Loading its contracts…')}</span> : rows.isError ? L('No se pudieron cargar sus contratos.', 'Its contracts did not load.') : (rows.data?.data.length ?? 0) === 0 ? L('Sin contratos en el registro.', 'No contracts on record.') : undefined} />
      {n != null && n > L3_ROWS && (
        <p className="ac-foot"><Link className="ct-link" to={`/contracts?vendor_id=${v.vendor_id}&sort_by=risk_score&sort_order=desc`}>{L(`Los ${formatNumber(n)} en El Archivo`, `All ${formatNumber(n)} in El Archivo`)} ›</Link></p>
      )}
    </section>
  )
}
