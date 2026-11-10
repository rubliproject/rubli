/**
 * ARIA — Focos Rojos · Focos Rojos, on «El Contrato» (frontend/DESIGN.md §5–§8). Ledger surface.
 *
 * Read as a public contract (top to bottom):
 *   DocHead «Registro › Focos rojos» — corrida · modelo
 *   Cover — h1 (the Tier-1 claim) + the saldo as lede + EL EMBUDO (log-width tiers = tier nav)
 *           | side: Declaraciones I–III (orden IPS · corrida · qué es una señal) · pattern dossiers
 *   La fila en una línea — fila · nivel 1 (documentados · sin verificar) · 2 · 3 · sin señal (tier doors)
 *   Anexo 1 · El registro — filter rail (outlined chips, server-backed) · disposition strip ·
 *           the register table (td 8×12, mono numerals, gauge column, pulled open row) · pager
 *   Firmas live in the shell.
 *
 * Data-honesty invariants (designus aria-fila panel F1/F2): T1 has ZERO 'pending' rows —
 * start-here keys on needs_review; progress never renders from t1_reviewed_count.
 * Order is always the server's ips_final DESC (no client sort: W5).
 */

import { Fragment, useState, useEffect, useRef, type ReactNode } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { MotionConfig } from 'framer-motion'
import { ariaApi } from '@/api/client'
import { GhostSuspectsPanel } from '@/components/aria/GhostSuspectsPanel'
import { QueueRegisterHeader } from '@/components/aria/QueueRegisterHeader'
import { RegisterHead, RegisterRow, REGISTER_COLS } from '@/components/aria/RegisterRow'
import { RowExpand } from '@/components/aria/RowExpand'
import { bucketStatus, formatAriaDate } from '@/components/aria/disposition'
import '@/components/aria/aria.css'
import type { AriaQueueItem, AriaStatsResponse } from '@/api/types'
import { formatDualCurrency, formatNumber } from '@/lib/utils'
import { SECTORS, PATTERN_COLORS, CURRENT_MODEL_VERSION } from '@/lib/constants'
import { useDebouncedSearch } from '@/hooks/useDebouncedSearch'
import { DocHead } from '@/components/contrato/DocHead'
import { PageHead } from '@/components/kit/PageHead'
import { Cover } from '@/components/contrato/Cover'
import { X as XIcon } from 'lucide-react'
import { ViewSwitch } from '@/components/kit/ViewSwitch'
import { FootNotes } from '@/components/kit/FootNotes'
import { FocosWall } from '@/components/aria/FocosWall'

type ReviewStatus = 'pending' | 'confirmed' | 'dismissed' | 'reviewing'

/** A filter chip: outlined, inline, 40px target; pressed = ink rule + 8% tint of its hue. */
function Chip({ on, onClick, hue, title, className, children }: {
  on: boolean
  onClick: () => void
  hue?: string
  title?: string
  className?: string
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      title={title}
      className={className ? `ct-chip ${className}` : 'ct-chip'}
      style={hue ? { ['--hue' as string]: hue } : undefined}
    >
      {children}
    </button>
  )
}

/** An active filter, removable on its own. */
function FilterChip({ children, onClear, isEs }: { children: ReactNode; onClear: () => void; isEs: boolean }) {
  return (
    <span className="ct-chip is-x">
      <span>{children}</span>
      <button type="button" onClick={onClear} aria-label={isEs ? 'Quitar filtro' : 'Clear filter'}>
        <XIcon className="h-4 w-4" aria-hidden="true" />
      </button>
    </span>
  )
}

/** The page shell on «El Contrato»: one sheet, one wrap. */
function Sheet({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <article className="ct ct-page ct-sheet">
        <div className="ct-wrap">{children}</div>
      </article>
    </MotionConfig>
  )
}

// ============================================================================
// Main Page
// ============================================================================

export default function AriaPage() {
  const { t, i18n } = useTranslation('aria')
  // Debounced server search — the old input fired one fetch per keystroke.
  const [searchParams, setSearchParams] = useSearchParams()
  // `?q=` seeds the search once (PARALLAX D10b § 5: the vendor dossier deep-links
  // to its own row); typing afterwards stays local, as before.
  const { inputValue: search, setInputValue: setSearch, debouncedValue: debouncedSearch, clear: clearSearch } =
    useDebouncedSearch(searchParams.get('q') ?? '', { delay: 300 })
  const patternFilter = searchParams.get('pattern')
  // `?vendor=ID` — the vendor dossier's deep link to its own row, by id (a name
  // search missed every accented name — PARALLAX D13b § Change 7, R6).
  const vendorParam = Number(searchParams.get('vendor')) || null
  // `?ids=1,2,3` (≤ 200) — a selection lassoed on /atlas (weekend E1); ANDed with the other filters.
  const idsParam = /^\d{1,9}(,\d{1,9}){0,199}$/.test(searchParams.get('ids') ?? '') ? searchParams.get('ids') : null
  const idsCount = idsParam ? idsParam.split(',').length : 0

  // ── PARALLAX D14 § 6: the URL holds the register's state ────────────────
  // tier · page · novel · efos · new · status · sector · years · open (the
  // expanded row) ride in the query string, absent when at their default, so
  // Back from a dossier returns to the same page, filters and open row.
  // Several setters run in one handler, and setSearchParams' updater sees the
  // render-time params (react-router 7) — so each update reads the LIVE
  // location; BrowserRouter's replace is synchronous, so the calls compose.
  // Any change to the slice also closes the open row (no ghost panel).
  const updateParams = (mut: (p: URLSearchParams) => void, keepOpen = false) => {
    const next = new URLSearchParams(window.location.search)
    mut(next)
    if (!keepOpen) next.delete('open')
    setSearchParams(next, { replace: true })
  }
  const intParam = (key: string, lo: number, hi: number): number | null => {
    const raw = searchParams.get(key)
    if (raw == null || raw.trim() === '') return null // Number(null) is 0 — absent is not 0
    const v = Number(raw)
    return Number.isInteger(v) && v >= lo && v <= hi ? v : null
  }
  const setIntParam = (key: string, v: number | null, dflt: number | null = null) =>
    updateParams((p) => (v == null || v === dflt ? p.delete(key) : p.set(key, String(v))))
  const setFlagParam = (key: string, on: boolean) => updateParams((p) => (on ? p.set(key, '1') : p.delete(key)))

  const clearIdsParam = () =>
    updateParams((p) => {
      p.delete('ids')
      if (!p.get('tier') && !p.get('q') && !p.get('vendor')) p.set('tier', 'all')
      p.delete('page')
    })
  const clearVendorParam = () =>
    updateParams((p) => {
      p.delete('vendor')
      // The deep link showed all tiers; "show the whole queue" keeps that.
      if (!p.get('tier') && !p.get('q')) p.set('tier', 'all')
      p.delete('page')
    })
  const setPatternFilter = (pattern: string | null) =>
    updateParams((p) => (pattern == null ? p.delete('pattern') : p.set('pattern', pattern)))
  // Start on T1 (most urgent) — unless a `?q=` / `?vendor=` deep link names a
  // vendor, which may sit in any tier: then all tiers (PARALLAX D12c § Change 4).
  // `tier` absent = that default; `tier=all` = every tier.
  const tierDefaultFor = (p: URLSearchParams): number | null => (p.get('q') || p.get('vendor') || p.get('ids') ? null : 1)
  const tierFilter: number | null =
    searchParams.get('tier') === 'all' ? null : intParam('tier', 1, 4) ?? tierDefaultFor(searchParams)
  const setTierFilter = (t: number | null) =>
    updateParams((p) => (t === tierDefaultFor(p) ? p.delete('tier') : p.set('tier', t == null ? 'all' : String(t))))
  const newVendorOnly = searchParams.get('new') === '1'
  const setNewVendorOnly = (on: boolean) => setFlagParam('new', on)
  const novelOnly = searchParams.get('novel') === '1'
  const setNovelOnly = (on: boolean) => setFlagParam('novel', on)
  const sectorFilter = intParam('sector', 1, 12)
  const setSectorFilter = (v: number | null) => setIntParam('sector', v)
  // Free-string server param — canonical 4 plus CENTINELA script statuses
  // (the "Por revisar" chip sends 'needs_review'; aria.py binds it
  // parameterized). W5: every filter on this page is server-backed.
  const reviewStatusFilter = searchParams.get('status') || null
  const setReviewStatusFilter = (v: string | null) => updateParams((p) => (v ? p.set('status', v) : p.delete('status')))
  const efosOnly = searchParams.get('efos') === '1'
  const setEfosOnly = (on: boolean) => setFlagParam('efos', on)
  // "Histórico 10+" — wires the existing, never-sent min_years_active param.
  const minYears = intParam('years', 0, 30)
  const setMinYears = (v: number | null) => setIntParam('years', v)
  const page = intParam('page', 1, 100000) ?? 1
  // Subtabs «Visualización | Lista» (owner 2026-10-15). Deep links to a row land on the list.
  const vista: 'rayos' | 'lista' = searchParams.get('vista') === 'lista' || (searchParams.get('vista') == null
    && ['q', 'vendor', 'ids', 'open', 'tier', 'pattern', 'page', 'status'].some((k) => searchParams.has(k))) ? 'lista' : 'rayos'
  const setVista = (v: 'rayos' | 'lista') => updateParams((p) => (v === 'rayos' ? p.set('vista', 'rayos') : p.set('vista', 'lista')))
  const setPage = (n: number) => setIntParam('page', n, 1)

  // One expand open at a time — EL DESGLOSE state (`?open=ID`).
  const expandedId = intParam('open', 1, Number.MAX_SAFE_INTEGER)
  const setExpandedId = (id: number | null) =>
    updateParams((p) => (id == null ? p.delete('open') : p.set('open', String(id))), true)

  // Disclosure state for the "+ More filters" panel.
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false)
  // < sm the pattern chips wrap; past the two largest (+ the active one) they
  // sit behind a "+n more" disclosure (PARALLAX D14 § 8 — a 1,542 px scroller
  // in a 342 px box before; seven wrapped chips would take ~7 rows).
  const [patternsOpen, setPatternsOpen] = useState(false)

  const PER_PAGE = 50

  // Stats keeps refetchOnWindowFocus (cheap, feeds the funnel + strip and
  // auto-recovers from deploy blips); the QUEUE query drops it and both gain
  // placeholderData so the rendered register never collapses to skeletons
  // mid-read (W7 — observed 4,955px → 1,714px on tab-return; pattern:
  // InstitutionLeague.tsx:983).
  const {
    data: stats,
    isLoading: statsLoading,
    isError: statsError,
    refetch: refetchStats,
  } = useQuery<AriaStatsResponse>({
    queryKey: ['aria-stats'],
    queryFn: () => ariaApi.getStats(),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: true,
    placeholderData: (prev) => prev,
  })

  const { data: leadsData, isLoading: leadsLoading, isError: leadsError } = useQuery({
    queryKey: ['aria-queue-leads', { page, search: debouncedSearch, vendorParam, idsParam, patternFilter, tierFilter, newVendorOnly, novelOnly, sectorFilter, reviewStatusFilter, efosOnly, minYears }],
    queryFn: () =>
      ariaApi.getQueue({
        page,
        per_page: PER_PAGE,
        search: debouncedSearch || undefined,
        vendor_id: vendorParam ?? undefined,
        ids: idsParam ?? undefined,
        pattern: patternFilter ?? undefined,
        new_vendor_only: newVendorOnly || undefined,
        novel_only: novelOnly || undefined,
        status: reviewStatusFilter ?? undefined,
        tier: tierFilter ?? undefined,
        sector_id: sectorFilter ?? undefined,
        efos_only: efosOnly || undefined,
        min_years_active: minYears ?? undefined,
      }),
    staleTime: 2 * 60_000,
    refetchOnWindowFocus: false,
    placeholderData: (prev) => prev,
  })

  const totalLeads = leadsData?.pagination?.total ?? 0

  // Masthead finding (chair-plan § 4, B-2): the tier-1 size, and how many of
  // them the case set already held. Counted only when one page holds the tier.
  const { data: t1Data, isError: t1Error } = useQuery({
    queryKey: ['aria-queue-t1-gt'],
    queryFn: () => ariaApi.getQueue({ tier: 1, per_page: 100 }),
    staleTime: 5 * 60_000,
  })
  const t1Total = t1Data?.pagination?.total ?? null
  const t1InCases = t1Data && t1Total != null && t1Data.data.length >= t1Total
    ? t1Data.data.filter((v) => v.in_ground_truth).length
    : null
  const totalPages = Math.ceil(totalLeads / PER_PAGE)

  const patternCounts = stats?.pattern_counts ?? {}

  // Server truth, verbatim — the client filter/sort pipeline is deleted (W5:
  // controls whose operand was 50 rows presented as global are gone, not
  // relabeled). Order is always the server's ips_final DESC.
  const leadsItems: AriaQueueItem[] = leadsData?.data ?? []
  const queueSummary = leadsData?.summary ?? null

  // A restored `?open=ID` (Back from a dossier) scrolls its row into view once.
  const restoredOpenRef = useRef(false)
  useEffect(() => {
    if (restoredOpenRef.current || expandedId == null) return
    if (!(leadsData?.data ?? []).some((it) => it.vendor_id === expandedId)) return
    restoredOpenRef.current = true
    requestAnimationFrame(() => document.getElementById(`aria-row-${expandedId}`)?.scrollIntoView({ block: 'center' }))
  }, [leadsData, expandedId])

  // Tier counts from the queue itself (PARALLAX D14 § 7, H4) — a tier's funnel
  // segment equals its register total; latest_run only dates the run.
  const tierCounts: Record<number, number> = {
    1: stats?.tier_counts?.['1'] ?? stats?.latest_run?.tier1_count ?? 0,
    2: stats?.tier_counts?.['2'] ?? stats?.latest_run?.tier2_count ?? 0,
    3: stats?.tier_counts?.['3'] ?? stats?.latest_run?.tier3_count ?? 0,
    4: stats?.tier_counts?.['4'] ?? stats?.latest_run?.tier4_count ?? 0,
  }

  const isEs = i18n.language.startsWith('es')

  // § EL SALDO's provenance clause — from the rows' own public labels
  // (PARALLAX D14 § 2): "anchored to a documented case" only when every T1
  // vendor is documented; "linked to the case set" otherwise, with the count
  // when some carry no public case link at all.
  const saldoProvenance: string | null = (() => {
    const s = queueSummary
    if (!s || s.total_t1 <= 0) return null
    if (s.documented_t1 === s.total_t1) return isEs ? 'todos anclados a casos documentados' : 'every one anchored to a documented case'
    // Honest split (spec G1): "all linked" read as verified while 48 links are not.
    const doc = formatNumber(s.documented_t1)
    const lead = formatNumber(s.lead_t1)
    const novel = s.novel_leads_t1 > 0 ? formatNumber(s.novel_leads_t1) : null
    return isEs
      ? `${doc} documentados · ${lead} sin verificar${novel ? ` · ${novel} sin vínculo a un caso` : ''}`
      : `${doc} documented · ${lead} unverified${novel ? ` · ${novel} with no case link` : ''}`
  })()

  // Tier 1 in the strip: «N documentados · M sin verificar», from the API's public labels.
  const t1Split = queueSummary && queueSummary.total_t1 > 0
    ? (isEs
      ? `${formatNumber(queueSummary.documented_t1)} documentados · ${formatNumber(queueSummary.lead_t1)} sin verificar`
      : `${formatNumber(queueSummary.documented_t1)} documented · ${formatNumber(queueSummary.lead_t1)} unverified`)
    : null

  // "Siguiente por revisar" — the next OPEN row (needs_review / pending /
  // reviewing) after the given index on this page. F1: T1 has zero 'pending'
  // rows, so the open-work definition is bucket-based, not status==='pending'.
  const nextOpenAfter = (fromId: number): AriaQueueItem | null => {
    const idx = leadsItems.findIndex((it) => it.vendor_id === fromId)
    for (let i = idx + 1; i < leadsItems.length; i++) {
      const b = bucketStatus(leadsItems[i].review_status)
      if (b === 'por_revisar' || b === 'pendiente') return leadsItems[i]
    }
    return null
  }

  const openDesglose = (vendorId: number) => {
    setExpandedId(vendorId)
    requestAnimationFrame(() => {
      document.getElementById(`aria-row-${vendorId}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    })
  }

  // Clear-all = the landing state: an empty query string (Tier 1, page 1).
  const clearAll = () => {
    clearSearch()
    // keep ?ver=clasico: an empty query string is the new Focos Rojos (rc4)
    setSearchParams(new URLSearchParams(searchParams.get('ver') ? { ver: searchParams.get('ver')! } : {}), { replace: true })
  }

  const activeFilterCount = [
    patternFilter,
    tierFilter != null ? tierFilter : null,
    newVendorOnly || null,
    novelOnly || null,
    sectorFilter != null ? sectorFilter : null,
    reviewStatusFilter,
    efosOnly || null,
    minYears != null ? minYears : null,
    search || null,
    vendorParam,
    idsParam,
  ].filter(Boolean).length

  // Empty register: Esc clears the filters (DESIGN.md §8 Table, empty row).
  const registerEmpty = !leadsLoading && leadsItems.length === 0 && activeFilterCount > 0
  useEffect(() => {
    if (!registerEmpty) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') clearAll() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registerEmpty])

  const doc = isEs ? 'Focos rojos' : 'Red flags'
  const trail = [{ label: isEs ? 'Investigar' : 'Investigate' }, { label: doc }]
  const runDate = formatAriaDate(stats?.latest_run?.completed_at ?? stats?.latest_run?.started_at ?? null, isEs)

  if (statsError || leadsError || (!statsLoading && stats && (!stats.latest_run || stats.queue_total === 0))) {
    // Network error vs empty pipeline: a genuine zero-state gets its own words, never the happy path at 0.
    const down = statsError || leadsError
    return (
      <Sheet>
        <DocHead trail={trail} />
        <Cover
          title={down ? t('connectionError.headline') : isEs ? 'ARIA todavía no se ha calculado sobre esta base de datos.' : 'The ARIA pipeline has not run against this database yet.'}
          lede={down ? t('connectionError.body') : isEs
            ? 'Cuando termine una corrida de ARIA, esta fila se llenará con los proveedores prioritarios.'
            : 'Once an ARIA run completes, this queue will populate with priority vendors.'}
          lead={<button type="button" className="ct-chip mt-6" onClick={() => refetchStats()}>{down ? t('connectionError.retry') : isEs ? 'Reintentar' : 'Retry'}</button>}
        />
      </Sheet>
    )
  }

  const n = (v: number | null | undefined) => (v != null && !statsLoading ? formatNumber(v) : '—')
  const t1Fig = t1Total ?? (statsLoading ? null : tierCounts[1])
  const novelT2 = queueSummary?.novel_leads_t2 ?? 0
  const patternsSorted = Object.entries(patternCounts).sort(([, a], [, b]) => b - a)
  const patternsRun = patternsSorted.filter(([, c]) => c > 0).length

  const runMeta = <>{isEs ? 'Corrida' : 'Run'} <b>{runDate ?? '—'}</b> · {isEs ? 'Modelo' : 'Model'} {CURRENT_MODEL_VERSION}</>
  const pageViews = <ViewSwitch lang={isEs ? 'es' : 'en'} value={vista} onChange={setVista} views={[
    { key: 'rayos', es: 'El muro', en: 'The wall' },
    { key: 'lista', es: 'La fila', en: 'The line' },
  ]} />

  return (
    <Sheet>
      {/* El muro carries the trail and this switch in its own one-row toolbar (the El Mapa compaction, owner 2026-11-02) */}
      {vista === 'rayos' ? <FocosWall lang={isEs ? 'es' : 'en'} tierCounts={tierCounts} queueTotal={statsLoading ? null : stats?.queue_total ?? null} t1Split={t1Split}
        trail={trail} views={pageViews} runMeta={runMeta} /> : <>
      <PageHead lang={isEs ? 'es' : 'en'} crumbs={trail} meta={runMeta} tabs={pageViews}
        finding={!t1Error
          ? (isEs
            ? <>{t1Fig != null ? formatNumber(t1Fig) : '—'} proveedores en el nivel 1, todos con registro externo: una lista para revisar, no de culpables.</>
            : <>{t1Fig != null ? formatNumber(t1Fig) : '—'} vendors in tier 1, each with an external record: a list to review, not of wrongdoers.</>)
          : (isEs ? 'La fila priorizada de ARIA: proveedores para revisar, no culpables.' : 'ARIA’s prioritized queue: vendors to review, not wrongdoers.')} />

      {/* La fila en una línea (owner 2026-10-28: «En cifras» took the space the docket needs) —
          tiers are doors into the register; tier 1 splits documented vs unverified from the API. */}
      <p className="aria-strip">
        <span>{isEs ? 'La fila de investigación' : 'The investigation queue'} <b>{n(stats?.queue_total)}</b></span>
        {[1, 2, 3].map((tier) => (
          <button key={tier} type="button" className="aria-strip-t" aria-pressed={tierFilter === tier} onClick={() => { setTierFilter(tierFilter === tier ? null : tier); setPage(1) }}>
            {isEs ? `Nivel ${tier}` : `Tier ${tier}`} <b>{n(tierCounts[tier])}</b>
            {tier === 1 && t1Split ? <small> ({t1Split})</small> : null}
          </button>
        ))}
        <span>{isEs ? 'sin señal' : 'no signal'} <b>{n(tierCounts[4])}</b></span>
      </p>

      <section className="ct-section" aria-labelledby="aria-reg-h" id="aria-investigation-list">
        <h2 id="aria-reg-h" className="sr-only">{isEs ? 'El registro' : 'The register'}</h2>

        <div className="ct-section-body">
          {/* FILTER RAIL — every visible control is server-backed (W5/W10) */}
          <div className="aria-rail">

            {patternsSorted.length > 0 && (() => {
              const PHONE_VISIBLE = 2
              const phoneHidden = (pattern: string, i: number) => i >= PHONE_VISIBLE && !patternsOpen && patternFilter !== pattern
              const hiddenCount = patternsSorted.filter(([pattern], i) => phoneHidden(pattern, i)).length
              return (
                <div className="aria-rail-row">
                  <span className="aria-rail-label">{isEs ? 'Patrón' : 'Pattern'}</span>
                  {patternsSorted.map(([pattern, count], i) => (
                    <Chip
                      key={pattern}
                      on={patternFilter === pattern}
                      hue={PATTERN_COLORS[pattern]}
                      className={phoneHidden(pattern, i) ? 'hidden sm:inline-flex' : undefined}
                      onClick={() => { setPatternFilter(patternFilter === pattern ? null : pattern); setPage(1) }}
                    >
                      <span className="ct-sq" aria-hidden="true" style={{ ['--c' as string]: PATTERN_COLORS[pattern], marginRight: 0 }} />
                      {t(`patterns.${pattern}`)}
                      <small>{formatNumber(count)}</small>
                    </Chip>
                  ))}
                  {!patternCounts.P5 && (
                    <span className="aria-rail-note">{isEs ? 'P5 monto fuera de rango: no se calcula en producción' : 'P5 amount out of range: not computed in production'}</span>
                  )}
                  {patternsSorted.length > PHONE_VISIBLE && (patternsOpen || hiddenCount > 0) && (
                    <button type="button" onClick={() => setPatternsOpen((v) => !v)} aria-expanded={patternsOpen} className="ct-chip is-more sm:hidden">
                      {patternsOpen ? (isEs ? 'Menos patrones' : 'Fewer patterns') : isEs ? `${hiddenCount} patrones más` : `${hiddenCount} more patterns`}
                    </button>
                  )}
                </div>
              )
            })()}

            <div className="aria-rail-row">
              <label className="aria-search">
                <span className="sr-only">{isEs ? 'Buscar en la fila ARIA' : 'Search ARIA queue'}</span>
                <input
                  type="search"
                  placeholder={t('leads.searchPlaceholder')}
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                />
              </label>
              <span className="aria-rail-label">{isEs ? 'Filtros, alcance global' : 'Filters, global scope'}</span>
              <Chip on={reviewStatusFilter === 'needs_review'} onClick={() => { setReviewStatusFilter(reviewStatusFilter === 'needs_review' ? null : 'needs_review'); setPage(1) }} title={isEs ? 'Pendientes de revisión humana' : 'Awaiting human review'}>
                {isEs ? 'Por revisar' : 'To review'}
              </Chip>
              <Chip on={efosOnly} hue="var(--color-risk-critical)" onClick={() => { setEfosOnly(!efosOnly); setPage(1) }} title="SAT EFOS Definitivo">EFOS</Chip>
              <Chip on={newVendorOnly} onClick={() => { setNewVendorOnly(!newVendorOnly); setPage(1) }}>
                {t('filters.newVendorOnly')}
                {stats?.new_vendor_count != null && <small>{formatNumber(stats.new_vendor_count)}</small>}
              </Chip>
              <Chip on={novelOnly} onClick={() => { setNovelOnly(!novelOnly); setPage(1) }} title={t('filters.novelOnlyTooltip')}>
                {isEs ? 'Solo descubrimientos' : 'Discoveries only'}
              </Chip>
              <Chip on={minYears === 10} onClick={() => { setMinYears(minYears === 10 ? null : 10); setPage(1) }} title={isEs ? 'Proveedores con 10+ años de actividad (filtro del servidor)' : 'Vendors with 10+ years active (server filter)'}>
                {isEs ? 'Histórico 10+' : 'Long-running 10+'}
              </Chip>
              <button
                type="button"
                onClick={() => setMoreFiltersOpen((v) => !v)}
                className="ct-chip is-plain ml-auto"
                aria-expanded={moreFiltersOpen}
              >
                {moreFiltersOpen ? '−' : '+'} {isEs ? 'Más filtros' : 'More filters'}
              </button>
            </div>

            {moreFiltersOpen && (
              <>
                <div className="aria-rail-row">
                  <span className="aria-rail-label">{isEs ? 'Sector' : 'Sector'}</span>
                  <select
                    value={sectorFilter ?? ''}
                    onChange={(e) => { const v = e.target.value; setSectorFilter(v === '' ? null : Number(v)); setPage(1) }}
                    className="aria-select"
                    aria-label={isEs ? 'Filtrar por sector' : 'Filter by sector'}
                  >
                    <option value="">{isEs ? 'Todos los sectores' : 'All sectors'}</option>
                    {SECTORS.map((s) => <option key={s.id} value={s.id}>{isEs ? s.name : s.nameEN}</option>)}
                  </select>
                </div>
                <div className="aria-rail-row">
                  <span className="aria-rail-label">{t('table.review')}</span>
                  {([null, 'pending', 'reviewing', 'confirmed', 'dismissed'] as (ReviewStatus | null)[]).map((s) => (
                    <Chip key={s ?? 'all'} on={reviewStatusFilter === s} onClick={() => { setReviewStatusFilter(s); setPage(1) }}>
                      {s ? t('status.' + s) : t('reviewFilter.all')}
                    </Chip>
                  ))}
                </div>
              </>
            )}
          </div>

          {patternFilter === 'P2' && <GhostSuspectsPanel isEs={isEs} />}

          {idsParam != null && (
            <p className="ct-note">
              {isEs
                ? `Selección hecha en El Mapa (Vínculos) · ${idsCount.toLocaleString('es-MX')} proveedores (los que están en la fila aparecen abajo) · `
                : `Selection drawn on The Atlas · ${idsCount.toLocaleString('en-US')} suppliers (those in the queue are listed below) · `}
              <button type="button" onClick={() => { clearIdsParam(); setPage(1) }} className="ct-link min-h-8">
                {isEs ? 'ver toda la fila' : 'show the whole queue'}
              </button>
            </p>
          )}
          {vendorParam != null && (
            <p className="ct-note">
              {isEs ? 'Un solo proveedor, desde su expediente · ' : 'One vendor, from its dossier · '}
              <button type="button" onClick={() => { clearVendorParam(); setPage(1) }} className="ct-link min-h-8">
                {isEs ? 'ver toda la fila' : 'show the whole queue'}
              </button>
            </p>
          )}

          {/* The active combination, removable one by one (2+ filters). */}
          {activeFilterCount >= 2 && (
            <div className="aria-rail-row mt-4">
              <span className="aria-rail-label">{isEs ? 'Filtros activos' : 'Active filters'}</span>
              {tierFilter != null && <FilterChip isEs={isEs} onClear={() => { setTierFilter(null); setPage(1) }}>{isEs ? `Nivel ${tierFilter}` : `Tier ${tierFilter}`}</FilterChip>}
              {patternFilter && <FilterChip isEs={isEs} onClear={() => { setPatternFilter(null); setPage(1) }}>{patternFilter} {t(`patterns.${patternFilter}`)}</FilterChip>}
              {sectorFilter != null && (
                <FilterChip isEs={isEs} onClear={() => { setSectorFilter(null); setPage(1) }}>
                  {(() => { const s = SECTORS.find((x) => x.id === sectorFilter); return s ? (isEs ? s.name : s.nameEN) : `Sector ${sectorFilter}` })()}
                </FilterChip>
              )}
              {efosOnly && <FilterChip isEs={isEs} onClear={() => { setEfosOnly(false); setPage(1) }}>{isEs ? 'Solo EFOS' : 'EFOS only'}</FilterChip>}
              {minYears != null && <FilterChip isEs={isEs} onClear={() => { setMinYears(null); setPage(1) }}>{isEs ? `Histórico ${minYears}+` : `Long-running ${minYears}+`}</FilterChip>}
              {newVendorOnly && <FilterChip isEs={isEs} onClear={() => { setNewVendorOnly(false); setPage(1) }}>{t('filters.newVendorOnly')}</FilterChip>}
              {novelOnly && <FilterChip isEs={isEs} onClear={() => { setNovelOnly(false); setPage(1) }}>{t('filters.novelOnly')}</FilterChip>}
              {reviewStatusFilter && (
                <FilterChip isEs={isEs} onClear={() => { setReviewStatusFilter(null); setPage(1) }}>
                  {reviewStatusFilter === 'needs_review' ? (isEs ? 'Por revisar' : 'To review') : t(`status.${reviewStatusFilter}`)}
                </FilterChip>
              )}
              {search && <FilterChip isEs={isEs} onClear={() => { clearSearch(); setPage(1) }}>“{search}”</FilterChip>}
              <button type="button" onClick={clearAll} className="ct-chip is-plain ml-auto">{t('filterBar.clearAll')}</button>
            </div>
          )}

          <QueueRegisterHeader
            isEs={isEs}
            totalLeads={totalLeads}
            tierFilter={tierFilter}
            novelOnly={novelOnly}
            t1StatusCounts={stats?.t1_status_counts ?? null}
            runDateline={stats?.latest_run?.completed_at ?? stats?.latest_run?.started_at ?? null}
            novelLeadsT2={queueSummary?.novel_leads_t2 ?? null}
            provenance={queueSummary}
            tier4Count={tierCounts[4]}
            t1Count={tierCounts[1]}
            onPickView={(view) => { setTierFilter(view === 't1' ? 1 : 2); setNovelOnly(view === 'disc'); setPage(1) }}
            onFilterNeedsReview={() => { setReviewStatusFilter('needs_review'); setPage(1) }}
            exportData={leadsItems as unknown as Record<string, unknown>[]}
          />

          <div className="aria-reg-scroll">
            <table className="aria-reg ct-stack" aria-busy={leadsLoading || undefined}>
              <caption className="sr-only">{isEs ? 'La fila de investigación, ordenada por el indicador de prioridad (IPS)' : 'ARIA queue register, ordered by IPS'}</caption>
              <RegisterHead isEs={isEs} />
              <tbody>
                {leadsLoading ? (
                  Array.from({ length: 12 }).map((_, i) => (
                    <tr key={i} className="aria-skel" aria-hidden="true">
                      {[40, 220, 200, 32, 72, 72, 88].map((w, j) => <td key={j}><i style={{ width: w }} /></td>)}
                    </tr>
                  ))
                ) : leadsItems.length === 0 ? (
                  <tr className="aria-empty">
                    <td colSpan={REGISTER_COLS}>
                      {search
                        ? t('emptyState.noSearchResults', { query: search })
                        : tierFilter != null
                          ? (isEs ? `Sin proveedores en el nivel ${tierFilter} con estos filtros.` : `No vendors in tier ${tierFilter} with these filters.`)
                          : t('leads.empty')}
                      {activeFilterCount > 0 && (
                        <>
                          {' '}
                          <button type="button" onClick={clearAll} className="ct-link min-h-8">
                            {isEs ? 'Quitar filtros' : 'Clear filters'}
                          </button>
                          <kbd className="ct-mono ml-2 text-[13px] text-text-muted">Esc</kbd>
                        </>
                      )}
                    </td>
                  </tr>
                ) : (
                  leadsItems.map((item, idx) => {
                    const isOpen = expandedId === item.vendor_id
                    const next = isOpen ? nextOpenAfter(item.vendor_id) : null
                    return (
                      <Fragment key={item.vendor_id}>
                        <RegisterRow
                          item={item}
                          isEs={isEs}
                          rank={(page - 1) * PER_PAGE + idx + 1}
                          expanded={isOpen}
                          onToggle={() => setExpandedId(isOpen ? null : item.vendor_id)}
                        />
                        {isOpen && (
                          <tr className="aria-open">
                            {/* the case file grows out of the pulled row (ct-rise, no height animation) */}
                            <td colSpan={REGISTER_COLS} className="ct-row-in">
                              <RowExpand
                                item={item}
                                isEs={isEs}
                                onClose={() => {
                                  setExpandedId(null)
                                  // Focus returns to the row's toggle, not <body>.
                                  requestAnimationFrame(() => document.getElementById(`aria-toggle-${item.vendor_id}`)?.focus())
                                }}
                                onNext={next ? () => openDesglose(next.vendor_id) : null}
                              />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <nav className="ct-pager" aria-label={isEs ? 'Paginación' : 'Pagination'}>
              <button type="button" onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1}>
                ← {t('pagination.previous')}
              </button>
              <span>{t('pagination.pageOf', { page, total: totalPages })}</span>
              <button type="button" onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page === totalPages}>
                {t('pagination.next')} →
              </button>
            </nav>
          )}
        </div>
      </section>

      </>}

      {/* ─── Anexo 1 · El registro — the ledger ─── */}

      {/* ─── La lectura — the former cover prose and declarations, after the object (DESIGN.md §5.1) ─── */}
      <section className="ct-section aria-foot" aria-labelledby="aria-foot-h">
        <h2 id="aria-foot-h">{isEs ? 'La lectura' : 'The reading'}</h2>
        <p className="aria-foot-lede">
            {isEs ? (
          <>
            De {n(stats?.queue_total)} proveedores examinados, el modelo eleva {n(tierCounts[1])} al nivel 1{saldoProvenance ? ` (${saldoProvenance})` : ''}.
            {t1InCases != null && !saldoProvenance ? ` ${formatNumber(t1InCases)} ya estaban en la base de casos de RUBLI.` : ''}
            {novelT2 > 0 ? ` ${formatNumber(novelT2)} descubrimientos propios del modelo esperan en el nivel 2, en calibración.` : ''}
            {' '}Los niveles altos suman {stats ? formatDualCurrency(stats.elevated_value_mxn ?? 0) : '—'} en valor de contratos marcados para revisión.
          </>
        ) : (
          <>
            Of {n(stats?.queue_total)} vendors examined, the model elevates {n(tierCounts[1])} to tier 1{saldoProvenance ? ` (${saldoProvenance})` : ''}.
            {t1InCases != null && !saldoProvenance ? ` ${formatNumber(t1InCases)} were already in RUBLI’s case set.` : ''}
            {novelT2 > 0 ? ` ${formatNumber(novelT2)} of the model’s own discoveries wait in tier 2, in calibration.` : ''}
            {' '}The elevated tiers carry {stats ? formatDualCurrency(stats.elevated_value_mxn ?? 0) : '—'} in contract value flagged for review.
          </>
        )}
          </p>
        <p className="ct-note aria-foot-doors">
          {isEs ? 'Expedientes de patrón' : 'Pattern dossiers'}:{' '}
          {(['P2', 'P6'] as const).map((p, i) => (
            <span key={p}>
              {i > 0 && ' · '}
              <Link to={`/patterns/${p}`} className="ct-link"><span className="ct-sq" aria-hidden="true" style={{ ['--c' as string]: PATTERN_COLORS[p] }} />{p} {t(`patterns.${p}`)}</Link>
            </span>
          ))}
        </p>
        <FootNotes lead={<><b>{isEs ? 'Señal.' : 'Signal.'}</b> {isEs
            ? 'Una señal es un motivo para revisar, no un hallazgo. Cada memo declara su procedencia: IA, analista, plantilla o borrador.'
            : 'A flag is a reason to look, not a finding. Each memo states its provenance: AI, analyst, template or stub.'}</>} lang={isEs ? 'es' : 'en'} items={[
          <><b>{isEs ? 'Orden.' : 'Order.'}</b> {isEs
            ? 'El IPS, indicador de prioridad, ordena la fila. No es una escala de riesgo ni una probabilidad de corrupción.'
            : 'The IPS, a priority indicator, orders the queue. It is not a risk scale nor a probability of corruption.'}</>,
          <><b>{isEs ? 'Corrida.' : 'Run.'}</b> {isEs
            ? <>El IPS suma el indicador de riesgo {CURRENT_MODEL_VERSION} o el contrato más inusual (Mahalanobis), un modelo anterior (v5.2), la escala del dinero y registros externos (casos, EFOS, SFP). Corren {patternsRun} patrones{patternCounts.P5 ? '' : '; P5 (monto fuera de rango) no se calcula en producción'}. Corrida del {runDate ?? '—'}.</>
            : <>The IPS adds risk indicator {CURRENT_MODEL_VERSION} or the most unusual contract (Mahalanobis), an earlier model (v5.2), the money scale and external records (cases, EFOS, SFP). {patternsRun} patterns run{patternCounts.P5 ? '' : '; P5 (amount out of range) is not computed in production'}. Run of {runDate ?? '—'}.</>}{' '}
            <Link to="/methodology#focos-rojos">{isEs ? 'Cómo se ordena la fila' : 'How the queue is ordered'}</Link></>,
          <Link to="/methodology">{isEs ? 'Metodología: alcance y límites' : 'Methodology: scope and limits'}</Link>,
        ]} />
      </section>
    </Sheet>
  )
}
