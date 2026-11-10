/**
 * /institutions — «Por pesos» (spec .claude/designs/institutions-macro-2026-10-08-spec.md).
 *
 * On «El Contrato» (frontend/DESIGN.md §5, ledger surface): DocHead → Cover (h1 + lede |
 * federal pesos by tier as board rows + one finding) → En cifras → four tabs: El Tamiz (the field: five steps, three lenses) · El Registro
 * (every institution, sortable by spend) · Hallazgos (computed cards +
 * methodology) · El Corte (ReportCard). The page answers which federal buyers
 * move the money and how much of it goes through deficient practice; the ex-
 * IMSS share is printed beside every federal D/F peso share.
 *
 * Views (owner 2026-11-08 «include the institutions … each section needs its own separate frame»): the default is
 * El panorama (components/institutions/Panorama: El Mapa's sky with the institutions' words) · ?vista=tamiz El tamiz ·
 * ?vista=diagrama El diagrama · ?vista=lista La liga (+ ?tab=hallazgos|reporte). A bare ?sector / ?sector_id flies the
 * panorama's camera to that sector; with a list param it is the league's sector filter. Round-1 ?step= → Hallazgos.
 */
import { ListRow, RankCell, RankTh } from '@/components/kit/ListRow'
import React, { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router-dom'
import { ChevronDown, X } from 'lucide-react'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { scorecardApi } from '@/api/client'
import { TIER_STYLES, TIER_GRADE_MAP, TIER_NAMES, gradeToTierKey, gradeOutOf10, gradeOfTen, formatGrade, type TierKey } from '@/lib/tiers'
import { SECTORS, getSectorName, GRADES_LAST_YEAR, DATA_CUT_YEAR, NOMINAL_NOTE, RISK_TEXT_COLORS } from '@/lib/constants'
import { formatColumnMXN, formatCompactMXN, formatNumber } from '@/lib/utils'
import { formatEntityName } from '@/lib/entity/format'
import { usePublishSiblingList, useOriginRowFlash } from '@/lib/nav/wayfinding'
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import { SortHeaderTh } from '@/components/ui/SortHeaderTh'
import { PillarBoleta, type PillarBoletaItem } from '@/components/institution/PillarBoleta'
import { DotBarRow } from '@/components/ui/DotBar'
import { PageHead } from '@/components/kit/PageHead'
import { DocHead } from '@/components/contrato/DocHead'
import { ViewSwitch } from '@/components/kit/ViewSwitch'
import { useSky } from '@/lib/atlas/sky/useSky'
import { Panorama } from '@/components/institutions/Panorama'
import { FootNotes } from '@/components/kit/FootNotes'
import { worstGraded } from '@/lib/pageQuestion'
import { Clause } from '@/components/contrato/Clause'
import '@/components/aria/aria.css'
import '@/components/kit/kit.css'
import '@/components/institutions/league.css'
import { TamizTiempo, sexeniosQuery } from '@/components/institutions/TamizTiempo'
import { TamizHallazgos } from '@/components/institutions/TamizHallazgos'
import { TrendChip, TREND_YEARS } from '@/components/institutions/TrendChip'
import { InstAnatomia } from '@/components/institutions/InstAnatomia'
import { InstDiagrama, anatomyQuery } from '@/components/institutions/InstDiagrama'
import { byGrade, failing, gradeTen, pct as sharePct } from '@/lib/institutions/anatomy'
import {
  decodeField, moneyFacts, membersOf, tierLedger, rowLabel, pillarName, resolveStep, STEPS, V3_PILLARS,
  type Dim, type FieldInst, type FieldModel, type Level, type Step,
} from '@/lib/institutions/field'
import { glueDashes } from '@/lib/typography'
import { parseRange } from '@/lib/institutions/brush'

// one unit down the spend column (owner, one unit per view): IMSS reads «1,812,400 MDP», not «1.8 billones» above MDP rows
const colMXN = (v: number) => (v >= 999_950_000 ? formatCompactMXN(v, 'mdp') : formatCompactMXN(v))

const ReportCard = lazy(() => import('./ReportCard'))

type Tab = 'registro' | 'hallazgos' | 'reporte'
type Vista = 'panorama' | 'campo' | 'lista'
/** Any of these in the URL means a register/list link: open «Lista». */
/** El Tamiz's own deep-link params: any of them opens El Tamiz, not the default diagram. */
const TAMIZ_PARAMS = ['sexenio', 'lente', 'inst', 'vs']
const LIST_PARAMS = ['q', 'grade', 'sort', 'order', 'page', 'group', 'rnivel', 'alcance', 'rango', 'tend', 'desde']
type SortKey = 'total_amount_mxn' | 'total_score' | 'institution_name' | 'total_contracts'
const SORT_KEYS: SortKey[] = ['total_amount_mxn', 'total_score', 'institution_name', 'total_contracts']
const STEP_TITLE: Record<Step, [string, string]> = {
  instituciones: ['Las instituciones', 'The institutions'],
  dinero: ['El dinero', 'The money'],
  federal: ['Dentro del gobierno federal', 'Inside the federal government'],
  grandes: ['Los grandes compradores', 'The big buyers'],
  locales: ['Estados y municipios', 'States and municipalities'],
}
const PER_PAGE = 50
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export default function InstitutionLeague() {
  const { t, i18n } = useTranslation('institutionleague')
  const lang = i18n.language
  const en = lang === 'en'
  const L = (es: string, e: string) => (en ? e : es)
  const [sp, setSp] = useSearchParams()

  const patch = (u: Record<string, string | null>, replace = false) => {
    const next = new URLSearchParams(sp)
    for (const [k, v] of Object.entries(u)) {
      if (v == null || v === '') next.delete(k)
      else next.set(k, v)
    }
    setSp(next, { replace, preventScrollReset: true })
  }

  // ── URL compatibility (once, on mount) ────────────────────────────────────
  useEffect(() => {
    const next = new URLSearchParams(sp)
    let changed = false
    const set = (k: string, v: string | null) => { if (v == null) next.delete(k); else next.set(k, v); changed = true }
    const sector = next.get('sector') ?? next.get('sector_id')
    if (sector) {
      const s = SECTORS.find((q) => q.code === sector || String(q.id) === sector)
      set('sector', null); set('sector_id', null)
      // a list link filters the league; a bare sector flies the panorama's camera there (Firmamento's own ?sector=)
      if (s && (next.get('vista') === 'lista' || LIST_PARAMS.some((k) => next.has(k)))) set('group', `sector:${s.id}`)
      else if (s) set('sector', String(s.id))
    }
    for (const k of ['all', 'scope']) if (next.has(k)) set(k, null)
    const tab = next.get('tab')
    if (tab === 'ranking' || tab === 'fichas') set('tab', null)
    if (tab === 'tamiz') { set('tab', null); set('vista', 'tamiz') }
    for (const k of ['paso', 'lente', 'zoom', 'nivel', 'sinimss']) if (next.has(k) && tab === 'tamiz') set(k, null)
    const legacy = next.get('step')
    if (legacy) {
      const r = resolveStep(null, legacy)
      set('step', null)
      if (r.toHallazgos) set('tab', 'hallazgos')
      else set('tab', null)
      for (const k of ['cf', 'by']) if (next.has(k)) set(k, null)
    }
    if (next.has('paso')) set('paso', null)
    if (changed) setSp(next, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Data ──────────────────────────────────────────────────────────────────
  const { data: payload, isLoading, isError } = useQuery({
    queryKey: ['institution-field'],
    queryFn: () => scorecardApi.getInstitutionField(),
    staleTime: 60 * 60 * 1000,
  })
  const model = useMemo<FieldModel | null>(() => (payload ? decodeField(payload) : null), [payload])
  const insts = useMemo<FieldInst[]>(() => model?.insts ?? [], [model])
  const facts = useMemo(() => (model ? moneyFacts(model) : null), [model])
  const v3 = model?.method === 'v3'
  const xMax = model?.xMax ?? 100

  const tabParam = sp.get('tab')
  const tab: Tab = tabParam === 'hallazgos' || tabParam === 'reporte' ? tabParam : 'registro'
  // Segmented view switch: El panorama (default; owner 2026-11-08: the gold frame, every institution one mark) ·
  // ?vista=tamiz El tamiz (owner 2026-11-07: «the sieve looks better than the diagram») · ?vista=diagrama El diagrama ·
  // ?vista=lista La liga · ?ver=anatomia the anatomy concept. El tamiz's own deep links (?sexenio, ?inst…) open it.
  const verAsked: 'anatomia' | 'diagrama' | null = sp.get('ver') === 'anatomia' ? 'anatomia'
    : sp.get('vista') === 'diagrama' && !TAMIZ_PARAMS.some((k) => sp.has(k)) ? 'diagrama' : null
  const vista: Vista = sp.get('vista') === 'lista' || tab !== 'registro' || LIST_PARAMS.some((k) => sp.has(k)) ? 'lista'
    : sp.get('vista') === 'tamiz' || verAsked || TAMIZ_PARAMS.some((k) => sp.has(k)) ? 'campo' : 'panorama'
  const { manifest } = useSky(false)
  const anatomy = useQuery({ ...anatomyQuery, enabled: vista === 'campo' }) // the tamiz's «Qué significa» (significa12) reads it too
  // the diagram's endpoint missing (404/422 before its backend deploys, or down): El tamiz stands in, with a quiet note
  const anatomyDown = !!verAsked && anatomy.isError
  const ver = anatomyDown ? null : verAsked
  // fetched beside the field (not after it) and the plate mounts once both land: one swap, hold → final
  const sexenios = useQuery({ ...sexeniosQuery, enabled: vista === 'campo' && !ver })
  const setVista = (v: Vista | 'diagrama' | 'tamiz') => {
    const next = new URLSearchParams()
    if (v === 'lista' || v === 'diagrama' || v === 'tamiz') next.set('vista', v)
    setSp(next, { replace: true, preventScrollReset: true })
  }

  // ── Register state ────────────────────────────────────────────────────────
  const group = sp.get('group')
  const gradeFilter = sp.get('grade') || ''
  const tierFilter: TierKey | '' = gradeFilter ? gradeToTierKey(gradeFilter) : ''
  const search = sp.get('q') || ''
  const sortBy = (SORT_KEYS.includes(sp.get('sort') as SortKey) ? sp.get('sort') : 'total_amount_mxn') as SortKey
  const sortOrder = (sp.get('order') || (sortBy === 'total_amount_mxn' || sortBy === 'total_contracts' ? 'desc' : 'asc')) as 'asc' | 'desc'
  const page = Math.max(1, Number(sp.get('page') || 1))
  // Default scope Federal; a step's group filter or an explicit chip overrides. Three leagues, one per
  // level, each graded within its level (docs/PLAN_INSTITUTION_SCOPE_2026-10-22.md); ?alcance= (lib/scope.ts)
  // from another page maps onto them: local → estatal, todo → every level (legacy ?rnivel=todos too).
  const rnivelParam = sp.get('rnivel') ?? ({ local: 'state', todo: 'todos' } as Record<string, string>)[sp.get('alcance') ?? ''] ?? null
  const rnivel: Level | null = rnivelParam === 'todos' ? null
    : (['federal', 'state', 'municipal'] as string[]).includes(rnivelParam ?? '') ? (rnivelParam as Level)
      : group ? null : 'federal'
  const desde = (STEPS as readonly string[]).includes(sp.get('desde') ?? '') ? (sp.get('desde') as Step) : null
  const [groupDim, groupKey] = (group ?? '').split(':') as [Dim, string]
  // Brushed score range from El Tamiz (phase 2 § 1), shared with the field: ?rango=lo-hi, inclusive.
  const rango = model ? parseRange(sp.get('rango'), model.xMin, model.xMax) : null
  const [rLo, rHi] = rango ?? [null, null]
  // Phase 2 § 3: «empeoran» = v3 trend by contract count, 2018–2025.
  const worsening = sp.get('tend') === 'empeora'

  const groupMembers = useMemo(
    () => (model && group && groupKey != null ? new Set(membersOf(model, groupDim, groupKey)) : null),
    [model, group, groupDim, groupKey],
  )
  const filtered = useMemo(() => {
    const q = fold(search.trim())
    const tierGrades = tierFilter ? new Set(TIER_GRADE_MAP[tierFilter]) : null
    const list = insts.filter((inst, k) =>
      (!groupMembers || groupMembers.has(k))
      && (!rnivel || inst.level === rnivel)
      && (!tierGrades || tierGrades.has(inst.grade))
      && (rLo == null || rHi == null || (inst.total_score >= rLo && inst.total_score <= rHi))
      && (!worsening || inst.trend === 'empeora')
      && (!q || fold(inst.name).includes(q) || fold(inst.siglas ?? '').includes(q)))
    const dir = sortOrder === 'asc' ? 1 : -1
    return list.sort((a, b) => {
      if (sortBy === 'institution_name') return dir * a.name.localeCompare(b.name, 'es')
      if (sortBy === 'total_contracts') return dir * (a.total_contracts - b.total_contracts)
      if (sortBy === 'total_amount_mxn') return dir * (a.total_amount_mxn - b.total_amount_mxn)
      return dir * (a.total_score - b.total_score)
    })
  }, [insts, groupMembers, rnivel, tierFilter, rLo, rHi, worsening, search, sortBy, sortOrder])
  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE))
  const items = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE)
  const firstRank = (page - 1) * PER_PAGE + 1
  const filteredValue = filtered.reduce((a, i) => a + i.total_amount_mxn, 0)
  const nWorsening = useMemo(() => insts.filter((i) => i.trend === 'empeora' && (!rnivel || i.level === rnivel)).length, [insts, rnivel])

  const sectorName = (id: number) => {
    const s = SECTORS.find((q) => q.id === id)
    return s ? getSectorName(s.code, en ? 'en' : 'es') : ''
  }
  const groupName = group ? rowLabel(groupDim, groupKey, lang, sectorName, model ?? undefined) : null

  const headingRef = useRef<HTMLHeadingElement>(null)
  const handleSort = (key: SortKey) => {
    if (key === sortBy) patch({ order: sortOrder === 'desc' ? 'asc' : 'desc', page: null }, true)
    else patch({ sort: key === 'total_amount_mxn' ? null : key, order: null, page: null }, true)
  }

  const [expanded, setExpanded] = useState<number | null>(null)

  // ── Wayfinding (El Hilo): the visible register page is the sibling list, on the register tab only.
  const leagueSearch = sp.toString()
  usePublishSiblingList(
    tab === 'registro' && items.length
      ? {
          kind: 'institution',
          items: items.map((it) => ({ id: String(it.id), label: it.name })),
          backTo: leagueSearch ? `/institutions?${leagueSearch}` : '/institutions',
          backLabel: en ? 'the register' : 'el registro',
        }
      : null,
  )
  useOriginRowFlash('institution', tab === 'registro' && items.length > 0)

  // ── Cover + En cifras: money-first (editorial.md § copy) ──────────────────
  const fed = facts?.federal
  const topInst = facts?.top != null ? insts[facts.top] : null
  const topName = topInst ? (topInst.siglas || formatEntityName('institution', topInst.name, 'sm')) : ''
  const pct0 = (v: number) => `${Math.round(v * 100)}%`
  const locale = en ? 'en-US' : 'es-MX'
  const lede = facts && fed ? glueDashes(L(
    `Por ${fed.def} de ${formatNumber(fed.n)} compradores federales pasaron ${formatCompactMXN(fed.defVal)} con calificación reprobada (menos de 6 de 10): ${pct0(fed.pctVal)} del gasto federal registrado en CompraNet (2002–${GRADES_LAST_YEAR}). Sin ${topName}, ${pct0(facts.federalPctValExTop)}. La calificación mide cómo compra cada institución, por competencia, proceso y concentración; no dice si hubo delito.`,
    `${formatCompactMXN(fed.defVal)}, ${pct0(fed.pctVal)} of recorded federal spending on CompraNet (2002–${GRADES_LAST_YEAR}), went through ${fed.def} of ${formatNumber(fed.n)} federal buyers that fail (under 6 out of 10). Without ${topName}, ${pct0(facts.federalPctValExTop)}. The grade measures how each institution buys (competition, process, concentration), not whether a crime occurred.`,
  )) : <span className="lg-hold-lede" aria-hidden="true" />

  // Federal pesos by tier: board rows + one finding (owner 11-07: no bars; lib/institutions/field tierLedger).
  const tiers = useMemo(() => tierLedger(insts, TIER_NAMES, gradeToTierKey), [insts])

  const tabs: { key: Tab; es: string; en: string }[] = [
    { key: 'registro', es: 'El Registro', en: 'The Register' },
    { key: 'hallazgos', es: 'Hallazgos', en: 'Findings' },
    { key: 'reporte', es: 'El Corte', en: 'The Cut' },
  ]
  const setTab = (v: Tab) => patch({ tab: v === 'registro' ? null : v, vista: 'lista' }, true)
  const onTabKey = (e: React.KeyboardEvent, i: number) => {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!d) return
    e.preventDefault()
    const next = tabs[(i + d + tabs.length) % tabs.length].key
    setTab(next)
    requestAnimationFrame(() => document.getElementById(`inst-tab-${next}`)?.focus())
  }

  // Tier cell: Spectral SC word beside a steel-blue square; provisional = dashed outline + range.
  const tierCell = (inst: FieldInst) => {
    const key = gradeToTierKey(inst.grade)
    const tier = TIER_STYLES[key]
    return (
      <span className="inline-flex items-center whitespace-nowrap"
        title={inst.provisional ? L('Provisional: con pocos contratos la calificación es inestable', 'Provisional: with few contracts the grade is unstable') : undefined}>
        <span className={inst.provisional ? 'ct-sq lg-sq-prov' : 'ct-sq'} style={{ ['--c' as string]: tier.color }} aria-hidden="true" />
        <span className="ct-sc text-[14px]" style={{ color: tier.ink }}>{t(`tiers.${key}`)}</span>
        {inst.provisional && <span className="ct-mono ml-2 text-[13px] text-text-muted">{inst.score_lo != null ? `${gradeOutOf10(inst.score_lo * 100 / xMax)}–${gradeOutOf10((inst.score_hi ?? inst.score_lo) * 100 / xMax)}` : 'prov.'}</span>}
      </span>
    )
  }
  const activeMark = (inst: FieldInst) => inst.historical == null ? null : (
    <span className="whitespace-nowrap"
      title={inst.historical ? L(`Sin contratos desde 2022; último en ${inst.last_year ?? '—'}`, `No contract since 2022; last in ${inst.last_year ?? '—'}`) : undefined}>
      {inst.historical ? L(`Histórica · ${inst.last_year ?? '—'}`, `Historical · ${inst.last_year ?? '—'}`) : L('Activa', 'Active')}
    </span>
  )
  const costCell = (inst: FieldInst) => {
    if (!model) return null
    const p = model.pillars.find((q) => q.key === inst.loss.key)
    return (
      <span className="whitespace-nowrap font-mono text-[13px] text-text-secondary" title={pillarName(model, inst.loss.key, lang)}>
        {pillarName(model, inst.loss.key, lang)}{' '}
        <span className="tabular-nums text-text-muted">−{inst.loss.lost.toFixed(v3 ? 1 : 0)}{v3 ? '' : `/${p?.max ?? ''}`}</span>
      </span>
    )
  }
  const expandBtn = (inst: FieldInst) => {
    const open = expanded === inst.id
    return (
      <button type="button" onClick={() => setExpanded(open ? null : inst.id)}
        className="lg-x"
        aria-label={t(open ? 'collapseRow' : 'expandRow', { name: formatEntityName('institution', inst.name, 'full') })} aria-expanded={open} aria-controls={open ? `boleta-${inst.id}` : undefined}>
        <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
    )
  }
  const boleta = (inst: FieldInst) => (v3 ? (
    <div className="lg-boleta">
      {V3_PILLARS.map((p) => (
        <DotBarRow key={p.key} label={en ? p.label_en : p.label_es} readout={`${Math.round(inst.pillars[p.key] ?? 0)}/100`} value={inst.pillars[p.key] ?? 0} max={100} color={TIER_STYLES.Regular.color} />
      ))}
      <p className="ct-note">{L('Cada pilar va de 0 a 100: mitad contra el estándar nacional, mitad contra instituciones de su tipo y tamaño.', 'Each pillar runs 0–100: half against the national standard, half against institutions of its type and size.')}</p>
    </div>
  ) : <PillarBoleta item={{ ...(inst.pillars as unknown as PillarBoletaItem), institution_name: inst.name }} />)
  // The page's question (docs/PAGE_QUESTIONS.md) and its follow-up «¿quién tiene la peor calificación?», computed.
  const worst = useMemo(() => worstGraded(insts), [insts])
  const worstHref = '/institutions?vista=lista&rnivel=federal&sort=total_score&order=asc'
  const significa = !model ? null : worst ? (
    <>
      {L('Entre las dependencias federales activas, la peor calificación firme es la de ', 'Among active federal agencies, the worst settled grade belongs to ')}
      <EntityIdentityChip type="institution" id={worst.id} name={worst.name} variant="name" size="inherit" />
      {L(`: ${gradeOfTen((worst.total_score * 100) / xMax, 'es')}. `, `: ${gradeOfTen((worst.total_score * 100) / xMax, 'en')}. `)}
      {!(sortBy === 'total_score' && sortOrder === 'asc' && vista === 'lista') && (
        <Link to={worstHref} className="ct-link">{L('Ver la lista, de peor a mejor', 'See the list, worst first')}</Link>
      )}
    </>
  ) : L('Ninguna dependencia federal tiene aún una calificación firme.', 'No federal agency has a settled grade yet.')
  // The diagram and the anatomy show the 12 biggest spenders: their finding speaks about those same 12.
  const a12 = useMemo(() => byGrade(anatomy.data?.rows ?? []), [anatomy.data])
  const w12 = a12[0]
  const significa12 = !w12 ? null : (
    <>
      {L(`De las ${a12.length} dependencias federales que más gastan, ${failing(a12)} reprueban. La peor calificada es `, `Of the ${a12.length} federal agencies that spend the most, ${failing(a12)} fail. The worst graded is `)}
      <EntityIdentityChip type="institution" id={w12.id} name={w12.name} variant="name" size="inherit" />
      {`: ${gradeTen(w12.score, lang)}.`}
      {w12.hr_share != null && L(` El ${sharePct(w12.hr_share, 'es')} de sus pesos tiene indicador de riesgo alto o crítico.`, ` ${sharePct(w12.hr_share, 'en')} of its pesos carry a high or critical risk indicator.`)}
    </>
  )
  // «las 12»: the count the endpoint returned, never typed
  const n12 = a12.length ? ` ${a12.length}` : ''
  // kit/PageHead (owner 11-06): h1 = the view's computed finding · the question · Mariana's three lines, «qué significa»
  // = the other computed finding (the 12 biggest spenders ↔ every federal agency), never a repeat of the h1
  const finding = ver ? significa12 : significa
  const crumbs = [{ label: L('Instituciones', 'Institutions') }]
  const views = (
    <ViewSwitch lang={en ? 'en' : 'es'} value={vista === 'lista' ? 'lista' : vista === 'panorama' ? 'panorama' : ver ? 'diagrama' : 'tamiz'} onChange={setVista} views={[
      { key: 'panorama', es: 'El panorama', en: 'The panorama' },
      { key: 'tamiz', es: 'El tamiz', en: 'The sieve' },
      { key: 'diagrama', es: 'El diagrama', en: 'The diagram' },
      { key: 'lista', es: 'La liga', en: 'The league' },
    ]} />
  )
  // El panorama prints its finding as the sky's h1 (Firmamento) and its question as the kit strip: DocHead only here
  const question = vista === 'panorama' ? <DocHead trail={crumbs} views={views} /> : (
    <PageHead lang={en ? 'en' : 'es'}
      crumbs={crumbs}
      tabs={views}
      finding={finding ?? L('Quién reprueba, y por qué.', 'Who fails, and why.')}
      question={L('¿Qué dependencias compran con más riesgo?', 'Which agencies buy with the most risk?')}
      lines={{
        see: vista === 'campo' && ver === 'anatomia'
        ? L(`Cada pieza es una de las${n12} dependencias federales que más gastan, desarmada en tres bandejas.`, `Each case is one of the${n12} federal agencies that spend the most, taken apart into three trays.`)
        : vista === 'campo' && ver === 'diagrama'
        ? L(`Cada fila es una de las${n12} dependencias federales que más gastan.`, `Each row is one of the${n12} federal agencies that spend the most.`)
        : vista === 'campo'
        ? L('Cada punto es una dependencia federal, estatal o municipal, en la fila de su nivel.', 'Each dot is a federal, state or municipal agency, in the row for its level.')
        : L('Cada fila es una dependencia, con su calificación y lo que gastó.', 'Each row is an agency, with its grade and what it spent.'),
        read: vista === 'campo' && ver === 'anatomia'
        ? L('Lo relleno de cada bandeja (tinta o ámbar) es su parte de los pesos; pase el cursor o toque para abrirla.', 'The filled part of each tray (ink or amber) is its share of the pesos; hover or tap to open it.')
        : vista === 'campo' && ver === 'diagrama'
        ? L('Se lee de izquierda a derecha. Toque «¿a quién?» para ver quién cobró sin licitación.', 'Read left to right. Tap «to whom?» to see who was paid without a tender.')
        : vista === 'campo'
        ? L('Más a la izquierda, peor calificación; debajo de 6 de 10, reprueba. No prueba delito.', 'Further left, a worse grade; under 6 out of 10 fails. It does not prove a crime.')
        : L('La calificación mide competencia, proceso y concentración; debajo de 6 de 10, reprueba.', 'The grade measures competition, process and concentration; under 6 out of 10 fails.'),
        // the h1 already names one «worst»: the means line never names a second one (AUDIT 11-07 #6)
        means: ver
          ? <Link to={worstHref} className="ct-link">{L('Todas las dependencias federales, de peor a mejor', 'Every federal agency, worst first')}</Link>
          : a12.length ? L(`De las ${a12.length} dependencias federales que más gastan, ${failing(a12)} reprueban.`, `Of the ${a12.length} federal agencies that spend the most, ${failing(a12)} fail.`) : null,
      }}
    />
  )
  const levelName = (lv: Level | null) => lv == null ? L('Todos', 'All') : { federal: 'Federal', state: L('Estatal', 'State'), municipal: 'Municipal' }[lv]

  return (
    <article className={`ct ct-page ct-sheet${vista === 'panorama' ? ' ip' : ''}`}>
      <div className="ct-wrap">
        {question}

        {vista === 'panorama' && (
          manifest ? <ErrorBoundary fallback={null}><Panorama manifest={manifest} model={model} lang={en ? 'en' : 'es'} /></ErrorBoundary>
            : (
              <section className="pf" aria-busy="true">
                <div className="pf-head"><p className="pf-claim">{L('Cargando el panorama de las dependencias…', 'Loading the panorama of the agencies…')}</p></div>
                <div className="pf-sky pf-sky-skel" />
              </section>
            )
        )}

        {vista === 'campo' && anatomyDown && (
          <p className="ct-note">{L('El diagrama de las dependencias no está disponible por ahora. Aquí, El tamiz.', 'The agencies’ diagram is not available right now. Here is The sieve.')}</p>
        )}
        {vista === 'campo' && (
          ver === 'anatomia' ? <ErrorBoundary fallback={null}><InstAnatomia lang={lang} /></ErrorBoundary>
            : ver === 'diagrama' ? <ErrorBoundary fallback={null}><InstDiagrama lang={lang} /></ErrorBoundary>
            : isError ? <p role="alert" className="ct-note" style={{ color: RISK_TEXT_COLORS.critical }}>{t('error')}</p>
            : model && insts.length > 0 && (sexenios.data || sexenios.isError) ? <ErrorBoundary fallback={null}><TamizTiempo model={model} lang={lang} /></ErrorBoundary>
              : <div aria-hidden="true" className="lg-hold lg-hold-tm" />
        )}

        {vista === 'lista' && <>

        <section className="ct-section" aria-label={L('Vistas de la página', 'Page views')}>
          <div role="tablist" aria-label={L('Vistas de la página', 'Page views')} className="ct-viewswitch">
            {tabs.map((it, i) => (
              <button key={it.key} type="button" role="tab" id={`inst-tab-${it.key}`} aria-selected={tab === it.key} aria-controls={`inst-panel-${it.key}`}
                tabIndex={tab === it.key ? 0 : -1} className="ct-view" onClick={() => setTab(it.key)} onKeyDown={(e) => onTabKey(e, i)}>
                <span className="ct-view-t">
                  <b>{en ? it.en : it.es}</b>
                  {it.key === 'registro' && insts.length > 0 && <small>{formatNumber(insts.length)}</small>}
                </span>
              </button>
            ))}
          </div>

          {isError && tab !== 'reporte' && (
            <p role="alert" className="ct-note" style={{ color: RISK_TEXT_COLORS.critical }}>{t('error')}</p>
          )}
          {isLoading && tab !== 'reporte' && <div aria-hidden="true" className="lg-hold" />}

          {tab === 'registro' && model && insts.length > 0 && (
            <div role="tabpanel" id="inst-panel-registro" aria-labelledby="inst-tab-registro" className="ct-section-body">
              {desde && (
                <button type="button" onClick={() => setVista('tamiz')} className="ct-chip mb-4">
                  ← {L('Paso', 'Step')} {['I', 'II', 'III', 'IV', 'V'][STEPS.indexOf(desde)]} · {en ? STEP_TITLE[desde][1] : STEP_TITLE[desde][0]}
                </button>
              )}
              <div className="aria-rail lg-rail">
                <div className="aria-rail-row">
                  <div className="aria-search">
                    <label htmlFor="league-search" className="sr-only">{t('filters.search')}</label>
                    <input id="league-search" type="search" autoComplete="off" spellCheck={false} value={search}
                      onChange={(e) => patch({ q: e.target.value || null, page: null }, true)} placeholder={t('filters.searchPlaceholder')} />
                  </div>
                  <button type="button" className="ct-chip is-plain" onClick={() => patch(sortBy === 'total_score' && sortOrder === 'asc' ? { sort: null, order: null, page: null } : { sort: 'total_score', order: 'asc', page: null }, true)}>
                    {sortBy === 'total_score' && sortOrder === 'asc' ? L('Ordenar por gasto', 'Sort by spend') : L('Peor calificación primero', 'Worst grade first')}
                  </button>
                {!group && (
                  <div className="lg-levels" role="group" aria-label={L('Liga por nivel de gobierno', 'League by level of government')}>
                    {(['federal', 'state', 'municipal'] as Level[]).map((lv) => (
                      <button key={lv} type="button" aria-pressed={rnivel === lv} className="ct-chip"
                        onClick={() => patch({ rnivel: lv, alcance: null, page: null }, true)}>
                        {levelName(lv)}{facts ? <small>{pct0(facts.byLevel[lv].val / facts.total.val)} {L('del gasto', 'of spend')}</small> : null}
                      </button>
                    ))}
                  </div>
                )}
                </div>
                <div className="aria-rail-row" role="group" aria-label={t('filters.tier')}>
                  <span className="aria-rail-label">{L('Calificación', 'Grade')}</span>
                  <button type="button" aria-pressed={!tierFilter} onClick={() => patch({ grade: null, page: null })} className="ct-chip">{t('filters.allTiers')}</button>
                  {TIER_NAMES.map((tier) => {
                    const on = tierFilter === tier
                    return (
                      <button key={tier} type="button" aria-pressed={on} onClick={() => patch({ grade: on ? null : TIER_GRADE_MAP[tier][0], page: null })}
                        className="ct-chip" style={{ ['--hue' as string]: TIER_STYLES[tier].color }}>
                        <span className="ct-sq !mr-0" aria-hidden="true" style={{ ['--c' as string]: TIER_STYLES[tier].color }} />
                        {t(`tiers.${tier}`)}
                      </button>
                    )
                  })}
                  {nWorsening > 0 && (
                    <button type="button" aria-pressed={worsening} onClick={() => patch({ tend: worsening ? null : 'empeora', page: null })} className="ct-chip"
                      title={L(`Tendencia por número de contratos, ${TREND_YEARS}: crece la proporción de contratos no competitivos. No pondera pesos.`, `Trend by number of contracts, ${TREND_YEARS}: the non-competitive share of contracts is rising. Not weighted by pesos.`)}>
                      {L('Empeoran', 'Worsening')} <small>{nWorsening} · {L(`por nº de contratos ${TREND_YEARS}`, `by contract count ${TREND_YEARS}`)}</small>
                    </button>
                  )}
                  {rango && (
                    <span className="ct-chip is-x">
                      {L('Puntos', 'Points')} {rango[0]}–{rango[1]}
                      <button type="button" onClick={() => patch({ rango: null, page: null })} aria-label={L(`Quitar el rango de puntos ${rango[0]}–${rango[1]}`, `Clear the points range ${rango[0]}–${rango[1]}`)}><X className="h-4 w-4" aria-hidden="true" /></button>
                    </span>
                  )}
                  {group && (
                    <button type="button" onClick={() => patch({ group: null, page: null, desde: null })} className="ct-chip is-plain">
                      {L('Quitar filtro de grupo', 'Clear group filter')}
                    </button>
                  )}
                </div>
              </div>
              {!group && (
                <p className="ct-note">{L('Tres ligas: cada nivel de gobierno se califica contra sus pares y no se mezcla con los otros.', 'Three leagues: each level of government is graded against its peers and never mixed with the others.')}</p>
              )}
              {worsening && (
                <p className="ct-note">
                  {L(
                    `«Empeora» = la proporción de contratos no competitivos (adjudicación directa y licitaciones en que un solo proveedor gana todos los lotes; las invitaciones cuentan la mitad) sube al menos 2 puntos por año entre ${TREND_YEARS}, con t ≥ 2. Cuenta contratos, no pesos: un comprador puede verse «estable» por número mientras sus adjudicaciones directas crecen en dinero.`,
                    `«Worsening» = the non-competitive share of contracts (direct award and tenders where one supplier wins every lot; invitations count half) rises by at least 2 points a year over ${TREND_YEARS}, with t ≥ 2. It counts contracts, not pesos: a buyer can read «steady» by count while its direct awards grow in money.`,
                  )}
                </p>
              )}

              <p role="status" aria-live="polite" className="sr-only">
                {L(`${filtered.length} instituciones · página ${page} de ${totalPages} · ${NOMINAL_NOTE.es.toLowerCase()}`, `${filtered.length} institutions · page ${page} of ${totalPages} · ${NOMINAL_NOTE.en.toLowerCase()}`)}
              </p>

              <div className="lg-reg-h">
                <h2 id="registro-heading" ref={headingRef} tabIndex={-1} className="lg-count focus:outline-none">
                  {groupName ?? levelName(rnivel)} · {formatNumber(filtered.length)} {L('instituciones', 'institutions')} · {formatCompactMXN(filteredValue)}
                </h2>
                <span className="ct-note !mt-0">
                  {sortBy === 'total_amount_mxn' && sortOrder === 'desc' ? L('orden: mayor gasto primero', 'order: largest spend first') : sortBy === 'total_score' && sortOrder === 'asc' ? L('orden: peor calificación primero', 'order: worst grade first') : null}
                </span>
              </div>
              <div className="ct-table-wrap mt-2">
                <table className="ct-table ct-stack lg-table" aria-label={t('tableAriaLabel')}>
                  <thead>
                    <tr>
                      <RankTh lang={en ? 'en' : 'es'} />
                      <SortHeaderTh field="institution_name" label={t('columns.institution')} activeField={sortBy} order={sortOrder} onSort={handleSort} />
                      <th scope="col">{t('columns.grade')}</th>
                      <SortHeaderTh field="total_score" label={t('columns.score')} activeField={sortBy} order={sortOrder} onSort={handleSort} className="num" />
                      <th scope="col">{L('Lo que más resta', 'Costliest pillar')}</th>
                      <SortHeaderTh field="total_contracts" label={L('Contratos', 'Contracts')} activeField={sortBy} order={sortOrder} onSort={handleSort} className="num" />
                      <SortHeaderTh field="total_amount_mxn" label={L('Gasto', 'Spend')} activeField={sortBy} order={sortOrder} onSort={handleSort} className="num" />
                    </tr>
                  </thead>
                  <tbody>
                    {items.length === 0 ? (
                      <tr><td colSpan={7} className="lg-empty">
                        {t('empty')} {t('filters.adjustFilters')}
                      </td></tr>
                    ) : items.map((inst, idx) => (
                      <React.Fragment key={inst.id}>
                        <tr data-wf-row={inst.id} className="ct-row">
                          <RankCell n={firstRank + idx} />
                          <td className="ct-key">
                            <div className="lg-inst">
                              <EntityIdentityChip type="institution" id={inst.id} name={inst.name} variant="name" fullName size="inherit" className="lg-name" />
                              {expandBtn(inst)}
                            </div>
                            {(inst.historical != null || inst.trend) && (
                              <div className="lg-meta">
                                {activeMark(inst)}
                                <TrendChip trend={inst.trend} slope={inst.trend_slope} lang={lang} />
                              </div>
                            )}
                          </td>
                          <td data-l={L('nivel', 'grade')}>{tierCell(inst)}</td>
                          <td className="num whitespace-nowrap" data-l={L('calificación', 'score')}>{formatGrade((inst.total_score * 100) / xMax, en ? 'en' : 'es')}</td>
                          <td data-l={L('resta', 'costs')}>{costCell(inst)}</td>
                          <td className="num" data-l={L('contratos', 'contracts')}>{formatNumber(inst.total_contracts)}</td>
                          <td className="num ct-amt" data-l={L('gasto', 'spend')}>{colMXN(inst.total_amount_mxn)}</td>
                        </tr>
                        {expanded === inst.id && (
                          <tr id={`boleta-${inst.id}`} className="lg-open">
                            <td colSpan={7}>{boleta(inst)}</td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <nav className="ct-pager" aria-label={t('pagination.ariaLabel')}>
                  <button type="button" disabled={page <= 1} onClick={() => patch({ page: page - 1 === 1 ? null : String(page - 1) })} aria-label={t('pagination.previousAriaLabel')}>
                    ← {t('pagination.previous')}
                  </button>
                  <span>{t('pagination.pageOf', { page, total: totalPages })}</span>
                  <button type="button" disabled={page >= totalPages} onClick={() => patch({ page: String(page + 1) })} aria-label={t('pagination.nextAriaLabel')}>
                    {t('pagination.next')} →
                  </button>
                </nav>
              )}
            </div>
          )}

          {tab === 'hallazgos' && model && insts.length > 0 && (
            <div role="tabpanel" id="inst-panel-hallazgos" aria-labelledby="inst-tab-hallazgos" className="ct-section-body">
              <TamizHallazgos model={model} lang={lang} />
            </div>
          )}

          {tab === 'reporte' && (
            <div role="tabpanel" id="inst-panel-reporte" aria-labelledby="inst-tab-reporte" className="ct-section-body">
              <ErrorBoundary fallback={null}>
                <Suspense fallback={<div className="lg-hold" aria-hidden="true" />}>
                  <ReportCard />
                </Suspense>
              </ErrorBoundary>
            </div>
          )}
        </section>
        </>}

        <section className="ct-clauses" aria-labelledby="lg-cl-h">
          <h2 id="lg-cl-h">{L('En cifras', 'In figures')}</h2>
          <div className="ct-cl-grid">
            <Clause id="lg-insts" title={L('Instituciones calificadas', 'Institutions graded')}
              fig={insts.length ? formatNumber(insts.length) : '—'}
              note={facts ? L(`${formatNumber(facts.byLevel.federal.n)} federales · ${formatNumber(facts.byLevel.state.n)} estatales · ${formatNumber(facts.byLevel.municipal.n)} municipales`, `${formatNumber(facts.byLevel.federal.n)} federal · ${formatNumber(facts.byLevel.state.n)} state · ${formatNumber(facts.byLevel.municipal.n)} municipal`) : undefined} />
            <Clause id="lg-monto" title={L(`Monto de los calificados, 2002–${DATA_CUT_YEAR}`, `Amount of the graded buyers, 2002–${DATA_CUT_YEAR}`)}
              fig={facts ? (facts.total.val / 1e12).toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '—'}
              unit={L('billones MXN', 'trillion MXN')}
              note={facts ? (en ? `pesos of each year, across every graded buyer; grades use 2002–${GRADES_LAST_YEAR}` : `pesos de cada año, de todos los compradores calificados; la calificación usa 2002–${GRADES_LAST_YEAR}`) : undefined} />
            <Clause id="lg-df" title={L('Pesos federales en instituciones reprobadas', 'Federal pesos in failing institutions')}
              fig={fed ? String(Math.round(fed.pctVal * 100)) : '—'} unit="%"
              ruler={{ value: fed?.pctVal ?? 0, mode: 'fill', color: TIER_STYLES.Deficiente.color, ends: ['0%', facts ? L(`sin ${topName}: ${pct0(facts.federalPctValExTop)}`, `without ${topName}: ${pct0(facts.federalPctValExTop)}`) : '', '100%'] }} />
            <Clause id="lg-fed" title={L('Del gasto es federal', 'Of spending is federal')}
              fig={facts && fed ? String(Math.round((fed.val / facts.total.val) * 100)) : '—'} unit="%"
              ruler={{ value: facts && fed ? fed.val / facts.total.val : 0, mode: 'pointer', ends: ['0%', L('federal sobre el total', 'federal over the total'), '100%'] }} />
          </div>
        </section>

        <section className="ct-section" aria-labelledby="lg-tier-h">
          <div className="ct-annex-row">
            <h2 id="lg-tier-h" className="ct-h2">{L('Gasto federal por calificación', 'Federal spending by grade')}</h2>
          </div>
          <div className="ct-section-body">
            {tiers ? (
              <>
                <p className="lg-tier-find">{en
                  ? <>The <b>{t(`tiers.${tiers.top.k}`)}</b> tier holds the most federal pesos: <b>{(tiers.top.share * 100).toFixed(1)}%</b>, across {formatNumber(tiers.top.n)} buyers.</>
                  : <>El nivel <b>{t(`tiers.${tiers.top.k}`)}</b> concentra la mayor parte del gasto federal: <b>{(tiers.top.share * 100).toFixed(1)}%</b>, en {formatNumber(tiers.top.n)} compradores.</>}</p>
                <ul className="ls lg-tiers" aria-label={L('Gasto federal por nivel de calificación', 'Federal spending by grade tier')}>
                  <ListRow className="lg-tier-head" name={L('Nivel', 'Tier')} meta={L('Compradores', 'Buyers')} amount={L('Monto', 'Amount')} reading={L('% del total', '% of total')} />
                  {tiers.rows.map((r) => (
                    <ListRow key={r.k}
                      name={<Link className="ct-link" to={`/institutions?tab=registro&rnivel=federal&grade=${encodeURIComponent(TIER_GRADE_MAP[r.k][0])}`}><span className="ct-sq" style={{ ['--c' as string]: TIER_STYLES[r.k].color }} aria-hidden="true" />{t(`tiers.${r.k}`)}</Link>}
                      meta={formatNumber(r.n)} amount={formatColumnMXN(r.mxn)} reading={`${(r.share * 100).toFixed(1)}%`} />
                  ))}
                </ul>
              </>
            ) : <div className="lg-hold-tiers" aria-hidden="true" />}
            <p className="ct-note">{L(`Parte de los pesos federales, 2002–${GRADES_LAST_YEAR}, que pasó por cada nivel de calificación. Es una escala, no un certificado.`, `Share of federal pesos, 2002–${GRADES_LAST_YEAR}, that went through each grade tier. A scale, not a certificate.`)}</p>
          </div>
        </section>

        <section className="ct-section lg-foot" aria-label={L('Lectura y notas', 'Reading and notes')}>
          <div className="ct-section-body">
            <p className="lg-foot-lede">{lede}</p>
            <FootNotes lead={L('Calificación. Mide cómo compra cada institución: competencia, proceso y concentración. No dice si hubo delito.', 'Grade. It measures how each institution buys: competition, process and concentration. It does not say whether a crime occurred.')} lang={en ? 'en' : 'es'} items={[
              L('Provisional. Con pocos contratos la calificación es inestable; el cuadro punteado y el rango lo marcan.', 'Provisional. With few contracts the grade is unstable; the dashed square and the range mark it.'),
              t('methodologyFootnote'),
            ]} />
          </div>
        </section>
      </div>
    </article>
  )
}
