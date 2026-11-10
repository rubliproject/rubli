/**
 * CaseLibrary — «El Padrón» (/cases) on «El Contrato» (frontend/DESIGN.md §5–§8).
 * A ledger page (Operate mode), read as a public contract:
 *
 *   PageHead  Registro › El Padrón + view switch → h1 (files · convictions) → question → three lines
 *   Strip     one compact strip (OWNER_REVIEW 2026-10-28: «economize space, the docket is
 *             what's important»): fraud-type counts as toggles that filter ?fraud, and the
 *             docket's figures on one line (files · documented loss · convictions · model base)
 *   Band      the disposition band (its legend filters ?status)
 *   Anexo     the register: search + term chip + the ledger table (sortable headers)
 *
 * Every figure is live from /cases and /cases/stats; a missing one prints «—».
 */
import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useNavigationType } from 'react-router-dom'
import { keepPreviousData, useQueries, useQuery } from '@tanstack/react-query'
import { useQueryState, parseAsStringEnum } from 'nuqs'
import { MotionConfig } from 'framer-motion'
import { ChevronDown, Search, X } from 'lucide-react'
import { useUrlSearch } from '@/hooks'
import { caseLibraryApi } from '@/api/client'
import type { ScandalListItem, FraudType, Administration, LegalStatus, CaseLibraryParams } from '@/api/types'
import { CASE_FRAUD_TYPE_COLORS, DATA_CUT_YEAR } from '@/lib/constants'
import { formatCompactMXN, formatNumber } from '@/lib/utils'
import { usePublishSiblingList, useOriginRow } from '@/lib/nav/wayfinding'
import { adminShortLabel, fraudLabel, type Lang } from '@/components/cases/casesVocab'
import { CasesBand } from '@/components/cases/CasesBand'
import { DispositionBand } from '@/components/cases/DispositionBand'
import { CaseRegister, type RegisterSort } from '@/components/cases/IndexBlocks'
import { PageHead } from '@/components/kit/PageHead'
import { headTour } from '@/lib/tours'
import { PageQuestion } from '@/components/kit/PageQuestion'
import { ViewSwitch } from '@/components/kit/ViewSwitch'
import { FootNotes } from '@/components/kit/FootNotes'
import { modelSaw } from '@/lib/cases/casesRead'
import '@/components/cases/cases.css'

/** Spelled-out counts for the lede; anything unmapped prints as a numeral. */
const NUMBER_WORD: Record<number, { en: string; es: string }> = {
  12: { en: 'twelve', es: 'doce' },
  13: { en: 'Thirteen', es: 'Trece' },
}

// Filter enum lists (?fraud=invoice_fraud etc. must stay filterable).
const FRAUD_VALUES: FraudType[] = [
  'ghost_company', 'monopoly', 'overpricing', 'bid_rigging',
  'procurement_fraud', 'embezzlement', 'bribery', 'conflict_of_interest',
  'emergency_fraud', 'tender_rigging', 'invoice_fraud',
  'infrastructure_overrun', 'state_capture', 'cartel_infiltration', 'other',
]
const ADMIN_VALUES: Administration[] = ['fox', 'calderon', 'epn', 'amlo', 'sheinbaum', 'multiple']
const STATUS_VALUES: LegalStatus[] = [
  'impunity', 'investigation', 'ongoing', 'prosecuted',
  'convicted', 'acquitted', 'dismissed', 'settled', 'unresolved',
]

/** Labelled GT cases the v0.9.1 model trains on (CAL-v8-202605020212). */
const GT_LABELLED = 1417

/** DESIGN.md §6.3: at most six hues on one page; the rest fold into C8 «otros». */
const LEAD_TYPES = 5

const SORT_VALUES = ['loss', 'severity', 'year'] as const satisfies readonly RegisterSort[]

// ─── Inline filter chip (native <details>, zero popover JS) ──────────────────

interface MenuOption { value: string; label: string; count?: number }

function FilterChip({ label, activeLabel, options, onSelect, onClear, lang }: {
  label: string
  activeLabel: string | null
  options: MenuOption[]
  onSelect: (value: string) => void
  onClear: () => void
  lang: Lang
}) {
  const ref = useRef<HTMLDetailsElement>(null)
  const close = () => ref.current?.removeAttribute('open')
  return (
    <details ref={ref} className="cl-details">
      <summary className="cl-chip" data-active={activeLabel ? '' : undefined}>
        {label}
        {activeLabel && <b>{activeLabel}</b>}
        <ChevronDown className="h-3 w-3" aria-hidden="true" />
      </summary>
      <div className="cl-menu">
        <button type="button" className="cl-all" onClick={() => { onClear(); close() }}>
          <span>{lang === 'es' ? 'Todos' : 'All'}</span>
        </button>
        {options.map((o) => (
          <button key={o.value} type="button" onClick={() => { onSelect(o.value); close() }}>
            <span>{o.label}</span>
            {o.count != null && <span>{o.count}</span>}
          </button>
        ))}
      </div>
    </details>
  )
}

/** An Anexo: h2 (ordinal in small caps + title) · aside · body (Executive.tsx pattern). */
function Anexo({ id, title, aside, children }: { id: string; title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="ct-section" aria-labelledby={id}>
      <div className="ct-annex-row">
        <h2 id={id} className="ct-h2 scroll-mt-4">
          {title}
        </h2>
        {aside}
      </div>
      <div className="ct-section-body">{children}</div>
    </section>
  )
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function CaseLibrary() {
  const { i18n } = useTranslation('cases')
  const location = useLocation()
  const navType = useNavigationType()
  const lang: Lang = i18n.language?.startsWith('es') ? 'es' : 'en'
  const es = lang === 'es'
  const doc = es ? 'El Padrón' : 'The Docket'

  // URL-synced filters: refresh preserves state, links are shareable.
  const [fraudType, setFraudType] = useQueryState('fraud', parseAsStringEnum<FraudType>(FRAUD_VALUES))
  const [administration, setAdministration] = useQueryState('admin', parseAsStringEnum<Administration>(ADMIN_VALUES))
  const [legalStatus, setLegalStatus] = useQueryState('status', parseAsStringEnum<LegalStatus>(STATUS_VALUES))
  const [sortBy, setSortBy] = useQueryState('sort', parseAsStringEnum<RegisterSort>([...SORT_VALUES]).withDefault('loss'))
  const { search, setSearch } = useUrlSearch()
  const [vistaQ, setVistaQ] = useQueryState('vista', parseAsStringEnum<'banda' | 'lista'>(['banda', 'lista']))

  const queryParams: CaseLibraryParams = useMemo(() => ({
    fraud_type: fraudType ?? undefined,
    administration: administration ?? undefined,
    legal_status: legalStatus ?? undefined,
    search: search || undefined,
  }), [fraudType, administration, legalStatus, search])

  const { data: rawData, isLoading, error } = useQuery({
    queryKey: ['cases', 'list', queryParams],
    placeholderData: keepPreviousData,
    queryFn: () => caseLibraryApi.getAll(queryParams),
    staleTime: 5 * 60 * 1000,
  })
  // Unfiltered docket (same key as the dossier's, usually cache-warm): the clauses
  // count DISTINCT labelled cases (two files can anchor one GT case) and the
  // files without a documented amount.
  const { data: allCases } = useQuery({
    queryKey: ['cases', 'list', {}],
    queryFn: () => caseLibraryApi.getAll({}),
    staleTime: 5 * 60 * 1000,
  })
  // «¿Los habría visto el modelo?»: every file's linked vendors (13 small calls; the band's dock
  // reads the same cache key when a case is opened).
  const detailQs = useQueries({
    queries: (allCases ?? []).map((c) => ({
      queryKey: ['cases', 'detail', c.slug],
      queryFn: () => caseLibraryApi.getBySlug(c.slug),
      staleTime: 10 * 60 * 1000,
    })),
  })
  // A failed detail drops out (and is counted on screen) rather than hiding the answer.
  const sawFailed = detailQs.filter((q) => q.isError).length
  const saw = detailQs.some((q) => q.isPending && !q.isError) ? null : modelSaw(detailQs.filter((q) => q.data).map((q) => q.data))
  const { data: stats, isError: statsError } = useQuery({
    queryKey: ['cases', 'stats'],
    queryFn: () => caseLibraryApi.getStats(),
    staleTime: 10 * 60 * 1000,
  })

  const data = useMemo(() => {
    if (!rawData) return rawData
    const arr = [...rawData]
    // Cases with no documented amount sort last, explicitly (not as 0 MXN).
    const byAmount = (a: ScandalListItem, b: ScandalListItem) => (b.amount_mxn_low ?? -1) - (a.amount_mxn_low ?? -1)
    if (sortBy === 'severity') arr.sort((a, b) => (b.severity !== a.severity ? b.severity - a.severity : byAmount(a, b)))
    else if (sortBy === 'year') arr.sort((a, b) => {
      const ay = a.contract_year_start ?? -Infinity
      const by = b.contract_year_start ?? -Infinity
      return by !== ay ? by - ay : byAmount(a, b)
    })
    else arr.sort((a, b) => byAmount(a, b) || b.severity - a.severity)
    return arr
  }, [rawData, sortBy])

  const hasFilters = !!search || fraudType != null || administration != null || legalStatus != null
  // The band is the default; a filter link (?fraud=, ?status=…) lands on the register.
  const vista: 'banda' | 'lista' = vistaQ ?? (hasFilters ? 'lista' : 'banda')
  const clearAll = () => {
    setFraudType(null)
    setAdministration(null)
    setLegalStatus(null)
    setSearch(null)
  }
  // Esc clears the filters (the empty row's promise, DESIGN.md §8).
  const clearRef = useRef(clearAll)
  clearRef.current = clearAll
  useEffect(() => {
    if (!hasFilters) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !(e.target as HTMLElement)?.closest?.('details[open]')) clearRef.current() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [hasFilters])

  // El Hilo: publish the displayed order so the dossier stepper follows it.
  usePublishSiblingList(
    data && data.length > 0
      ? {
          kind: 'case',
          items: data.map((c) => ({ id: c.slug, label: es && c.name_es ? c.name_es : c.name_en })),
          backTo: location.pathname + location.search,
          backLabel: es ? 'El Padrón' : 'the docket',
        }
      : null,
  )
  // The row the reader came back from is the pulled record (DESIGN.md §7).
  const originSlug = useOriginRow('case')
  const pulledSlug = navType === 'POP' ? originSlug : null
  useEffect(() => {
    if (!pulledSlug || !data?.length) return
    const el = document.querySelector(`[data-wf-row="${CSS.escape(pulledSlug)}"]`)
    if (el) requestAnimationFrame(() => el.scrollIntoView({ block: 'center', behavior: 'auto' }))
  }, [pulledSlug, data])

  // Figures, live only.
  const totalCases = stats?.total_cases ?? null
  const convicted = stats ? stats.cases_by_legal_status.find((s) => s.legal_status === 'convicted')?.count ?? 0 : null
  const gtDistinct = allCases ? new Set(allCases.map((c) => c.ground_truth_case_id).filter((id) => id != null)).size : null
  const noAmount = allCases ? allCases.filter((c) => !c.amount_mxn_low).length : null
  const lossLow = stats?.total_amount_mxn_low ?? null
  const fmtN = (n: number | null) => (n == null ? '—' : formatNumber(n))

  const dekWord = totalCases != null ? NUMBER_WORD[totalCases]?.[lang] ?? String(totalCases) : null
  const gtWord = gtDistinct ? NUMBER_WORD[gtDistinct]?.[lang] ?? String(gtDistinct) : null
  const title = es
    ? `${fmtN(totalCases)} expedientes. ${convicted === 1 ? 'Una sola condena.' : `${fmtN(convicted)} condenas.`}`
    : `${fmtN(totalCases)} case files. ${convicted === 1 ? 'One conviction.' : `${fmtN(convicted)} convictions.`}`
  const lede = dekWord == null ? undefined : es
    ? `${dekWord} expedientes construidos con el registro periodístico, de auditoría y judicial.${gtWord ? ` Anclan ${gtWord} de los ${formatNumber(GT_LABELLED)} casos etiquetados de los que aprende el modelo de riesgo.` : ''}`
    : `${dekWord} case files built from the press, audit and court record.${gtWord ? ` They anchor ${gtWord} of the ${formatNumber(GT_LABELLED)} labelled cases the risk model learns from.` : ''}`

  // Fraud types by count; the top five keep their hue, the rest fold into «otros» (C8).
  const fraudRanked = useMemo(() => [...(stats?.cases_by_fraud_type ?? [])].sort((a, b) => b.count - a.count), [stats])
  const leadTypes = new Set(fraudRanked.slice(0, LEAD_TYPES).map((f) => f.fraud_type))
  const typeColor = (t: string) => (leadTypes.has(t) ? CASE_FRAUD_TYPE_COLORS[t] ?? CASE_FRAUD_TYPE_COLORS.other : CASE_FRAUD_TYPE_COLORS.other)
  const register = data ?? []
  const adminOptions: MenuOption[] = (stats?.cases_by_administration ?? []).map((a) => ({ value: a.administration, label: adminShortLabel(a.administration, lang), count: a.count }))

  const registerCount = !data ? '' : hasFilters && totalCases != null
      ? (es ? `${register.length} de ${totalCases}` : `${register.length} of ${totalCases}`)
      : (es ? `${register.length} casos` : `${register.length} cases`)

  // kit/PageHead (owner 11-06): crumbs + tabs → h1 = the view's computed finding (Las bandas: files · loss · convictions;
  // El padrón: files · convictions) → the question → ReadLines (the old tour's two scenes + the most repeated pattern);
  // the follow-up «¿Los habría visto el modelo?» sits under the head on the same three-line grid.
  const head = (finding: ReactNode) => (<>
    <PageHead lang={lang} crumbs={[{ label: doc }]} tabs={<ViewSwitch lang={es ? 'es' : 'en'} value={vista} onChange={setVistaQ} views={[
      { key: 'banda', es: 'Las bandas', en: 'The bands' },
      { key: 'lista', es: 'El padrón', en: 'The docket' },
    ]} />}
      finding={finding}
      actions={vista === 'banda' && <PageQuestion bare {...headTour('cases', lang)} />} />
    {saw && (
      <details className="cl-follow">
        <summary className="cl-follow-q">{es ? '¿Los habría visto el modelo?' : 'Would the model have seen them?'}</summary>
        <dl className="ph-read">
          <div><dt>{es ? 'La respuesta' : 'The answer'}</dt><dd>{es
            ? <>Sí, en <b>{saw.seen} de {saw.withContracts}</b> casos con contratos en CompraNet. Ahí, al menos una empresa sale alta o crítica.</>
            : <>Yes, in <b>{saw.seen} of {saw.withContracts}</b> cases with CompraNet contracts. There, at least one company comes out high or critical.</>}
            {sawFailed > 0 && (es ? ` (${sawFailed} casos no cargaron.)` : ` (${sawFailed} cases did not load.)`)}</dd></div>
          <div><dt>{es ? 'El indicador' : 'The indicator'}</dt><dd>{es
            ? 'El indicador de riesgo mide cuánto se parecen los contratos a casos ya documentados. Se promedia por empresa: 0.40 es alto; 0.60, crítico.'
            : 'The risk indicator measures how much contracts resemble documented cases. It is averaged per company: 0.40 is high; 0.60, critical.'}</dd></div>
          <div><dt>{es ? 'Ojo' : 'Caveat'}</dt><dd>{es
            ? 'El modelo aprendió de estos mismos casos. No es una prueba a ciegas. Con más empresas, es más fácil que alguna salga alta.'
            : 'The model learned from these very cases. This is not a blind test. With more companies, one is likelier to come out high.'}</dd></div>
        </dl>
      </details>
    )}
  </>)

  return (
    <MotionConfig reducedMotion="user">
      <article className="ct ct-page ct-sheet cases-page" data-frame>
        <div className="ct-wrap">
          {vista === 'banda' ? (
            error != null ? (
              <>{head(title)}<p role="alert" className="ct-note">{es ? 'No se pudieron cargar los casos.' : 'The cases could not be loaded.'}</p></>
            ) : (
              <CasesBand cases={allCases ?? []} lang={lang} head={head} />
            )
          ) : <>
          {head(title)}

          {/* ─── One strip: the fraud types filter the docket; the figures read on one line ─── */}
          <section className="cl-strip" aria-labelledby="cl-strip-h">
            <h2 id="cl-strip-h" className="sr-only">{es ? 'En cifras' : 'In figures'}</h2>
            <div className="cl-types" role="group" aria-label={es ? 'Filtrar por tipo de fraude' : 'Filter by fraud type'}>
              <span className="cl-strip-k" aria-hidden="true">{es ? 'Tipo' : 'Type'}</span>
              {stats ? fraudRanked.map((f) => {
                const on = fraudType === f.fraud_type
                return (
                  <button key={f.fraud_type} type="button" aria-pressed={on} data-dim={fraudType && !on ? '' : undefined} onClick={() => setFraudType(on ? null : (f.fraud_type as FraudType))}>
                    <span className="ct-sq" aria-hidden="true" style={{ ['--c' as string]: typeColor(f.fraud_type) }} />
                    {fraudLabel(f.fraud_type, lang)}
                    <span className="cl-n">{formatNumber(f.count)}</span>
                  </button>
                )
              }) : !statsError && <span className="cl-hold-types" aria-hidden="true" />}
            </div>
            {stats && stats.cases_by_legal_status.length > 0
              ? <DispositionBand counts={stats.cases_by_legal_status} activeStatus={legalStatus} onSelect={(s) => setLegalStatus((s as LegalStatus) ?? null)} lang={lang} />
              : !stats && !statsError && <div className="cl-hold-types" aria-hidden="true" />}
            <p className="cl-figs">
              <span><b>{fmtN(totalCases)}</b> {es ? 'expedientes' : 'case files'}</span>
              <span>
                <b>{lossLow != null ? formatCompactMXN(lossLow) : '—'}</b> {es ? 'de pérdida mínima conocida' : 'of known loss, at least'}
                {noAmount != null && noAmount > 0 ? (es ? ` (${noAmount} no dicen cuánto)` : ` (${noAmount} say no amount)`) : ''}
              </span>
              <span><b>{fmtN(convicted)}</b> {es ? (convicted === 1 ? 'condena' : 'condenas') : (convicted === 1 ? 'conviction' : 'convictions')}</span>
              <span><b>{fmtN(gtDistinct)}</b> {es ? 'enseñan al indicador de riesgo' : 'teach the risk indicator'}</span>
            </p>
          </section>

          <Anexo
            id="cl-reg-h"
            title={es ? 'El padrón' : 'The docket'}
            aside={<span className="ct-mono" style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{registerCount}</span>}
          >
            <div className="cl-filters">
              <div className="cl-search">
                <Search className="h-4 w-4" aria-hidden="true" />
                <input
                  type="search"
                  name="case-search"
                  autoComplete="off"
                  spellCheck={false}
                  aria-label={es ? 'Buscar casos' : 'Search cases'}
                  value={search ?? ''}
                  onChange={(e) => setSearch(e.target.value || null)}
                  placeholder={es ? 'Buscar caso o proveedor' : 'Search case or vendor'}
                />
                {search && (
                  <button type="button" onClick={() => setSearch(null)} aria-label={es ? 'Limpiar búsqueda' : 'Clear search'}>
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                )}
              </div>
              <FilterChip
                label={es ? 'Sexenio' : 'Term'}
                activeLabel={administration ? adminShortLabel(administration, lang) : null}
                options={adminOptions}
                onSelect={(v) => setAdministration(v as Administration)}
                onClear={() => setAdministration(null)}
                lang={lang}
              />
              {hasFilters && (
                <button type="button" className="cl-clear" onClick={clearAll}>
                  <X className="h-3 w-3" aria-hidden="true" />
                  {es ? 'Quitar filtros' : 'Clear filters'}
                </button>
              )}
            </div>

            {error != null ? (
              <p role="alert" className="ct-note">
                {es
                  ? 'No se pudieron cargar los casos. El servidor puede estar temporalmente no disponible.'
                  : 'The cases could not be loaded. The server may be temporarily unavailable.'}
              </p>
            ) : (
              <CaseRegister
                cases={register}
                lang={lang}
                loading={isLoading}
                sortBy={sortBy}
                onSort={(k) => setSortBy(k)}
                typeColor={typeColor}
                pulledSlug={pulledSlug}
                onClear={hasFilters ? clearAll : undefined}
                label={es ? 'El padrón de expedientes' : 'The case docket'}
              />
            )}

            <p className="ct-foot">
              <Link to="/methodology" className="ct-link">
                {es
                  ? 'Fuentes: registros judiciales, auditorías de la ASF, lista EFOS del SAT, periodismo de investigación'
                  : 'Sources: judicial records, ASF audits, SAT EFOS registry, investigative journalism'}
              </Link>
            </p>
          </Anexo>

          {/* ─── Declaraciones + the former lede, after the object (DESIGN.md §5.1) ─── */}
          <section className="ct-section cl-foot" aria-labelledby="cl-foot-h">
            <h2 id="cl-foot-h">{es ? 'La lectura' : 'The reading'}</h2>
            <p className="cl-foot-lede">{lede}</p>
            <FootNotes lead={<><b>{es ? 'Alcance.' : 'Scope.'}</b> {es ? `Casos de 2002–${DATA_CUT_YEAR}. Un expediente documenta un caso público; no es una condena ni una prueba sobre cada contrato vinculado.` : `Cases from 2002–${DATA_CUT_YEAR}. A case file documents a public case; it is not a conviction, nor proof about each linked contract.`}</>} lang={es ? 'es' : 'en'} items={[
              <><b>{es ? 'Fuentes.' : 'Sources.'}</b> {es ? 'Registros judiciales, auditorías de la ASF, lista EFOS del SAT y periodismo de investigación.' : 'Judicial records, ASF audits, the SAT EFOS registry and investigative journalism.'}</>,
            ]} />
          </section>
          </>}
        </div>
      </article>
    </MotionConfig>
  )
}
