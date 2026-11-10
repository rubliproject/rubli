/**
 * Sectors — 12 Sectors of Mexican Federal Procurement
 *
 * WHO view — page VIII «El Arqueo»: ArqueoMesa Marimekko (finding 1) → the
 * confound headline heading ConfoundPlate (default) / ExposureLedger (toggle,
 * ?reg=register) (finding 2) → SelfCaptureBand + FeDeArqueo, both collapsed
 * disclosures.
 *
 * WHAT view (?view=categories): ArqueoMesaCategorias → CategoryCaptureDumbbell
 * → catalog list / CategoryTreeView (?cview=) → FeDeArqueo.
 */

import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router-dom'
import { useQueryStates, parseAsStringLiteral } from 'nuqs'
import { categoriesApi } from '@/api/client'
import { useQuery } from '@tanstack/react-query'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCompactMXN, formatCompactUSD, formatNumber, pctOrDash } from '@/lib/utils'
import { tidyNodes } from '@/lib/typography'
import { sectorApi } from '@/api/client'
import {
  SECTOR_COLORS,
  RISK_COLORS,
  RISK_TEXT_COLORS,
  getRiskLevelFromScore,
  getSectorName,
  DATA_CUT_YEAR,
  singleAwardOfCompetitive,
} from '@/lib/constants'
import type { SectorStatistics } from '@/api/types'
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import { ArqueoMesa } from '@/components/sectors/ArqueoMesa'
import { ArqueoMesaCategorias } from '@/components/sectors/ArqueoMesaCategorias'
import { FeDeArqueo } from '@/components/sectors/FeDeArqueo'
import { CategoryCaptureDumbbell } from '@/components/sectors/CategoryCaptureDumbbell'
import { ExposureLedger } from '@/components/sectors/ExposureLedger'
import type { LedgerRow } from '@/components/sectors/ExposureLedger'
import { ConfoundPlate } from '@/components/sectors/ConfoundPlate'
import { SelfCaptureBand } from '@/components/sectors/SelfCaptureBand'
import { ownSpendShare } from '@/components/sectors/confoundScales'
import type { PlateLens } from '@/components/sectors/confoundScales'
import { usePublishSiblingList, useOriginRowFlash } from '@/lib/nav/wayfinding'
import { DocHead } from '@/components/contrato/DocHead'
import { Cover } from '@/components/contrato/Cover'
import { Clause } from '@/components/contrato/Clause'
import '@/components/sectors/sectors.css'

// ── helpers ───────────────────────────────────────────────────────────────────

// Locale-aware compact MXN. Delegates to canonical helper which renders
// ES as "3.1 billones MXN" / "X,XXX MDP" (Mexican media convention).
function formatSpend(value: number): string {
  return formatCompactMXN(value)
}


// URL literals for the page's five query keys (see the nuqs block in Sectors).
const VIEW_KEYS = ['sectors', 'categories'] as const
const REG_KEYS = ['plate', 'register'] as const
const LENS_KEYS = ['var', 'saturation', 'intensity'] as const
const CVIEW_KEYS = ['list', 'tree'] as const
const CAT_SORT_KEYS = ['risk', 'spend', 'name', 'capture'] as const


// ── CategoryTreeView ─────────────────────────────────────────────────────────
// Collapsible sector → category tree for the WHAT tab "Tree" mode.

interface CatSummary {
  category_id: number
  name_es: string
  name_en: string
  sector_id: number | null
  sector_code: string | null
  total_contracts: number
  total_value: number
  avg_risk: number
  direct_award_pct: number
  single_bid_pct: number
  /** Single-award share of competitive procedures (D20) — the displayed rate. */
  single_award_pct?: number | null
  top_vendor: { id: number; name: string } | null
  top_institution: { id: number; name: string } | null
}

interface SectorRow {
  sector_code: string
  total_value_mxn: number
  total_contracts: number
  avg_risk_score: number
  sector_id: number
}

interface CategoryTreeViewProps {
  orderedSectors: string[]
  sectorGroups: Map<string, CatSummary[]>
  sectors: SectorRow[]
  lang: string
}

function CategoryTreeView({ orderedSectors, sectorGroups, sectors, lang }: CategoryTreeViewProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const isEs = lang === 'es'

  const toggle = (code: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
  }

  const sectorMap = useMemo(() => {
    const m = new Map<string, SectorRow>()
    for (const s of sectors) m.set(s.sector_code, s)
    return m
  }, [sectors])

  const maxSpend = useMemo(() => {
    let max = 0
    for (const cats of sectorGroups.values()) {
      for (const c of cats) { if (c.total_value > max) max = c.total_value }
    }
    return max
  }, [sectorGroups])

  return (
    <div className="border-t border-text-primary">
      {orderedSectors.map((sectorCode) => {
        const cats = sectorGroups.get(sectorCode) ?? []
        const color = SECTOR_COLORS[sectorCode] ?? SECTOR_COLORS.otros
        const sectorData = sectorMap.get(sectorCode)
        const isOpen = !collapsed.has(sectorCode)

        return (
          <div key={sectorCode}>
            {/* Sector header row */}
            <button
              type="button"
              className="ct-row w-full flex items-center gap-3 px-3 py-2 min-h-11 border-b border-border text-left"
              onClick={() => toggle(sectorCode)}
              aria-expanded={isOpen}
              aria-label={`${getSectorName(sectorCode, isEs ? 'es' : 'en')} — ${isEs ? (isOpen ? 'contraer' : 'expandir') : (isOpen ? 'collapse' : 'expand')}`}
            >
              <span className="text-[13px] font-mono text-text-muted w-4 flex-shrink-0">
                {isOpen ? '▼' : '▶'}
              </span>
              <span className="sx-sc flex-1 text-[15px] text-text-primary">
                <span className="ct-sq" aria-hidden="true" style={{ ['--c' as string]: color }} />
                {getSectorName(sectorCode, isEs ? 'es' : 'en')}
              </span>
              <span className="text-[13px] font-mono text-text-muted">
                {cats.length} {isEs ? 'categorías' : 'categories'}
              </span>
              {sectorData && (
                <span className="text-[13px] font-mono tabular-nums text-text-secondary">
                  {formatSpend(sectorData.total_value_mxn)}
                </span>
              )}
            </button>

            {/* Category leaves */}
            {isOpen && cats.map((cat, idx) => {
              const riskLevel = getRiskLevelFromScore(cat.avg_risk)
              const barWidth = maxSpend > 0 ? Math.min(100, (cat.total_value / maxSpend) * 100) : 0

              return (
                <div
                  key={cat.category_id}
                  className="ct-row flex items-center gap-3 pl-12 pr-3 py-2 border-b border-border"
                >
                  <span className="flex-shrink-0 w-6 font-mono text-[13px] text-text-muted tabular-nums">
                    {String(idx + 1).padStart(2, '0')}
                  </span>
                  <div className="flex-1 min-w-0">
                    <EntityIdentityChip
                      type="category"
                      id={cat.category_id}
                      name={isEs ? cat.name_es : cat.name_en}
                      size="sm"
                      fullName
                      sectorCode={cat.sector_code ?? null}
                      riskScore={cat.avg_risk ?? null}
                    />
                    {/* Spend bar */}
                    <div className="mt-1 h-px bg-border overflow-hidden w-full max-w-[160px]">
                      <div
                        className="h-full"
                        style={{ width: `${barWidth}%`, backgroundColor: 'var(--color-text-primary)' }}
                      />
                    </div>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <div className="font-mono text-[13px] tabular-nums text-text-primary">
                      {formatSpend(cat.total_value)}
                    </div>
                  </div>
                  <div
                    className="flex-shrink-0 font-mono text-[13px] font-bold tabular-nums w-14 text-right"
                    style={{ color: RISK_TEXT_COLORS[riskLevel] }}
                  >
                    {(cat.avg_risk * 100).toFixed(1)}%
                  </div>
                  <div className="flex-shrink-0 flex items-center gap-1 w-10 justify-end">
                    <span className="font-mono text-[13px] tabular-nums text-text-secondary">
                      {pctOrDash(cat.direct_award_pct, 0)}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function Sectors() {
  const { t, i18n } = useTranslation('sectors')

  // ── URL state — one nuqs writer for the five keys (PARALLAX D7b § Change 1;
  // the platform pattern since Day 6b). `clearOnDefault` keeps defaults out of
  // the URL; switching view clears the other view's keys, so ?lens= never
  // leaks into WHAT and ?sort= / ?cview= never into WHO.
  //   view  WHO (default) / WHAT        reg   Plate (default) / Register
  //   lens  var · saturation (Plate) · intensity (Register)
  //   cview list / tree (WHAT)          sort  risk · spend · name · capture (WHAT)
  const [q, setQ] = useQueryStates(
    {
      view: parseAsStringLiteral(VIEW_KEYS).withDefault('sectors'),
      reg: parseAsStringLiteral(REG_KEYS).withDefault('plate'),
      lens: parseAsStringLiteral(LENS_KEYS).withDefault('var'),
      cview: parseAsStringLiteral(CVIEW_KEYS).withDefault('list'),
      sort: parseAsStringLiteral(CAT_SORT_KEYS).withDefault('risk'),
    },
    { history: 'replace', clearOnDefault: true },
  )
  const view = q.view
  const setView = (v: (typeof VIEW_KEYS)[number]) =>
    setQ(v === 'categories' ? { view: v, lens: null, reg: null } : { view: v, sort: null, cview: null })

  // cat-P3: quiet ?sort= for the categories list.
  const catSortKey = view === 'categories' ? q.sort : 'risk'

  // Category list display: 'list' (ranked flat) or 'tree' (grouped by sector)
  const cview = q.cview
  const setCview = (v: (typeof CVIEW_KEYS)[number]) => setQ({ cview: v })

  // Registry sort lens — each view orders by the lens it offers (the Plate:
  // VaR / saturation; the Register: VaR / intensity) and shows VaR otherwise.
  const lens: PlateLens = q.lens
  const setLens = (l: PlateLens) => setQ({ lens: l })

  // Registry display mode — the Plate and the Register render the SAME
  // 12-sector data; one at a time behind a toggle. Default 'plate'.
  const regView = q.reg
  const setRegView = (v: (typeof REG_KEYS)[number]) => setQ({ reg: v })

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['sectors', 'list'],
    queryFn: () => sectorApi.getAll(),
    staleTime: 5 * 60 * 1000,
    retry: 2,
  })

  // Category summary — only fetched when the user is on the WHAT tab.
  const { data: categoryData, isLoading: categoryLoading } = useQuery<{
    data: Array<{
      category_id: number
      name_es: string
      name_en: string
      sector_id: number | null
      sector_code: string | null
      total_contracts: number
      total_value: number
      avg_risk: number
      direct_award_pct: number
      single_bid_pct: number
      top_vendor: { id: number; name: string } | null
      top_institution: { id: number; name: string } | null
    }>
    total: number
  }>({
    queryKey: ['categories', 'summary'],
    queryFn: () => categoriesApi.getSummary(),
    staleTime: 5 * 60 * 1000,
    enabled: view === 'categories',
  })

  // WHO-view enrichment — capture (treemap top institutions) + trajectory (bundled
  // trends). Both bundled & cached server-side; only fetched on the WHO tab.
  const { data: treemapData } = useQuery({
    queryKey: ['sectors', 'treemap'],
    queryFn: () => sectorApi.getTreemap(),
    staleTime: 5 * 60 * 1000,
    enabled: view === 'sectors',
  })
  const { data: trendsBundle } = useQuery({
    queryKey: ['sectors', 'trends-bundle'],
    queryFn: () => sectorApi.getTrendsBundle(),
    staleTime: 5 * 60 * 1000,
    enabled: view === 'sectors',
  })

  const sectors: SectorStatistics[] = data?.data ?? []

  // For tree view: sectors ordered by spend (replaces the old `sorted` memo that
  // used SORT_KEYS — removed per spec §'What dies'). Only used by CategoryTreeView.
  const bySpend = useMemo(
    () => [...sectors].sort((a, b) => b.total_value_mxn - a.total_value_mxn),
    [sectors],
  )

  // ── Language helper ──────────────────────────────────────────────────────────
  const lang: 'en' | 'es' = i18n.language?.startsWith('es') ? 'es' : 'en'

  // ── WHO view: build LedgerRows ────────────────────────────────────────────────
  // Typed to handle optional SLIPPY fields gracefully — if not present yet,
  // high_critical_value_mxn will be undefined (→ filtered out by != null check).
  const ledgerRows: LedgerRow[] = useMemo(() => {
    // Capture: sector_id → top institution (first of the treemap's top_institutions).
    const capBySector = new Map<number, { id: number; name: string; siglas?: string | null; sharePct: number }>()
    for (const ts of treemapData?.sectors ?? []) {
      const top = ts.top_institutions?.[0]
      if (top) {
        capBySector.set(ts.sector_id, {
          id: top.institution_id,
          name: top.name,
          siglas: top.siglas ?? null,
          sharePct: top.share_pct ?? 0,
        })
      }
    }
    const trajBySector = trendsBundle?.sectors ?? {}

    return sectors
      .filter((s) => (s as SectorStatistics & { high_critical_value_mxn?: number | null }).high_critical_value_mxn != null)
      .map((s) => {
        const ext = s as SectorStatistics & {
          high_critical_value_mxn?: number | null
          critical_value_mxn?: number | null
        }
        return {
          sectorId: s.sector_id,
          sectorCode: s.sector_code,
          name: t(s.sector_code) as string,
          varMxn: ext.high_critical_value_mxn!,
          criticalMxn: ext.critical_value_mxn ?? 0,
          totalMxn: s.total_value_mxn,
          scoredMxn: s.scored_value_mxn ?? undefined,
          daPct: s.direct_award_pct,  // null = not recorded (pre-2011 only), never 0
          sbPct: singleAwardOfCompetitive(s.single_bid_pct, s.direct_award_pct),
          contracts: s.total_contracts,
          scoredContracts: (s.low_risk_count ?? 0) + (s.medium_risk_count ?? 0) + (s.high_risk_count ?? 0) + (s.critical_risk_count ?? 0),
          vendors: s.total_vendors ?? 0,
          avgRiskScore: s.avg_risk_score ?? 0,
          criticalCount: s.critical_risk_count ?? 0,
          highCount: s.high_risk_count ?? 0,
          topInstitution: capBySector.get(s.sector_id) ?? null,
          trajectory: trajBySector[String(s.sector_id)] ?? [],
        }
      })
      .sort((a, b) => b.varMxn - a.varMxn)
  }, [sectors, t, treemapData, trendsBundle])

  // ── Wayfinding (El Hilo P1+) — publish the exposure ledger as the sector
  // sibling list (Prev/Next stepper honours this VaR order); flash the origin
  // row on browser-back.
  const sectorSearch = useLocation().search.replace(/^\?/, '')
  usePublishSiblingList(
    ledgerRows.length
      ? {
          kind: 'sector',
          items: ledgerRows.map((r) => ({ id: String(r.sectorId), label: r.name })),
          backTo: sectorSearch ? `/sectors?${sectorSearch}` : '/sectors',
          backLabel: lang === 'es' ? 'sectores' : 'sectors',
        }
      : null,
  )
  useOriginRowFlash('sector', ledgerRows.length > 0)

  // ── WHO lede strip computations ───────────────────────────────────────────────
  const ledeStats = useMemo(() => {
    if (ledgerRows.length === 0) return null
    const top3 = ledgerRows.slice(0, 3)
    const sumVar = ledgerRows.reduce((acc, r) => acc + r.varMxn, 0)
    const sumTotal = ledgerRows.reduce((acc, r) => acc + r.totalMxn, 0)
    // shares over scored spend / scored contracts (ComprasMX loads unscored)
    const sumScored = ledgerRows.reduce((acc, r) => acc + (r.scoredMxn || r.totalMxn), 0)
    const valuePct = sumScored > 0 ? ((sumVar / sumScored) * 100).toFixed(1) : '0'

    // countPct: (high+critical counts) / total contracts across all sectors
    const sumHighCritCount = sectors.reduce(
      (acc, s) => acc + (s.high_risk_count ?? 0) + (s.critical_risk_count ?? 0),
      0,
    )
    const sumContracts = sectors.reduce((acc, s) => acc + s.total_contracts, 0)
    const sumScoredN = ledgerRows.reduce((acc, r) => acc + (r.scoredContracts || r.contracts), 0)
    const countPct = sumScoredN > 0 ? ((sumHighCritCount / sumScoredN) * 100).toFixed(1) : '0'

    // Intensity leader — the §A headline subject (computed argmax of
    // own-spend share; today Hacienda, but never hardcoded).
    const intLeader = ledgerRows.reduce(
      (best, r) => (ownSpendShare(r) > ownSpendShare(best) ? r : best),
      ledgerRows[0],
    )
    const intLeaderPct = (ownSpendShare(intLeader) * 100).toFixed(0)

    return {
      top3, sumTotal, sumContracts, valuePct, countPct, intLeader, intLeaderPct,
    }
  }, [ledgerRows, sectors])

  // Grand total model-flagged exposure for masthead anchor
  const totalVarMxn = useMemo(
    () => ledgerRows.reduce((acc, r) => acc + r.varMxn, 0),
    [ledgerRows],
  )

  // ── Masthead finding (chair-plan § 4, B-2) — every figure from the sectors payload.
  const finding = useMemo(() => {
    if (sectors.length === 0) return null
    const total = sectors.reduce((acc, s) => acc + (s.total_value_mxn ?? 0), 0)
    const top = [...sectors].sort((a, b) => (b.total_value_mxn ?? 0) - (a.total_value_mxn ?? 0))[0]
    const infra = sectors.find((s) => s.sector_code === 'infraestructura')
    return {
      total,
      top,
      infraSa: infra ? singleAwardOfCompetitive(infra.single_bid_pct, infra.direct_award_pct) : null,
    }
  }, [sectors])
  const totalTrillions = finding
    ? (finding.total / 1e12).toLocaleString(lang === 'es' ? 'es-MX' : 'en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
    : '—'

  // ── Per-view deck (masthead subtitle) — «El Arqueo» reinvention ────────────────
  // The headline is now constant («El Arqueo»); each lens carries its own deck.
  const sectorsDeckFirst = finding
    ? (lang === 'es'
        ? `${getSectorName(finding.top.sector_code, 'es')} se llevó ${formatCompactMXN(finding.top.total_value_mxn)} de ${formatCompactMXN(finding.total)} en todo el registro, la mayor parte del valor contratado federal.`
        : `${getSectorName(finding.top.sector_code, 'en')} took ${formatCompactMXN(finding.top.total_value_mxn)} of ${formatCompactMXN(finding.total)} across the register, the largest share of federal contract value.`)
    : null
  const deckText =
    view === 'categories'
      ? (lang === 'es'
          ? 'Setenta y dos categorías de gasto — qué compró el Estado, y dónde arde el catálogo.'
          : 'Seventy-two spending categories — what the State bought, and where the catalog runs hot.')
      : sectorsDeckFirst && finding?.infraSa != null
        ? (lang === 'es'
            ? `${sectorsDeckFirst} En infraestructura, el ${finding.infraSa.toFixed(0)}% de los contratos de procedimientos competitivos viene de un procedimiento con un solo adjudicado: eso dice cómo se licitan los lotes, no que haya colusión.`
            : `${sectorsDeckFirst} In infrastructure, ${finding.infraSa.toFixed(0)}% of contracts in competitive procedures come from a procedure with a single winner, which tells us how lots are tendered, not that there was collusion.`)
        : (lang === 'es'
            ? 'Doce sectores, un solo corte. Cuánto dinero observa el modelo en cada uno — y qué parte del gasto propio de cada quien está en la mesa.'
            : 'Twelve sectors, one count. How much money the model flags in each — and how much of each one’s own spend is on the table.')

  const en = lang === 'en'
  const loc = en ? 'en-US' : 'es-MX'
  const doc = view === 'categories' ? (en ? 'Categories' : 'Categorías') : (en ? 'Sectors' : 'Sectores')

  // ── WHAT view derived rows (catalog) ──────────────────────────────────────────
  const cats: CatSummary[] = useMemo(() => categoryData?.data ?? [], [categoryData])
  const sortedByRisk = useMemo(() => [...cats].sort((a, b) => b.avg_risk - a.avg_risk), [cats])
  const topByRisk = sortedByRisk[0] ?? null
  const topByValue = useMemo(() => [...cats].sort((a, b) => b.total_value - a.total_value)[0] ?? null, [cats])
  const catRows = useMemo(() => {
    const nm = (c: CatSummary) => (lang === 'es' ? c.name_es : c.name_en)
    if (catSortKey === 'spend') return [...cats].sort((a, b) => b.total_value - a.total_value)
    if (catSortKey === 'name') return [...cats].sort((a, b) => nm(a).localeCompare(nm(b)))
    if (catSortKey === 'capture') return [...cats].sort((a, b) => b.direct_award_pct - a.direct_award_pct)
    return sortedByRisk
  }, [cats, catSortKey, lang, sortedByRisk])
  const tree = useMemo(() => {
    const sectorGroups = new Map<string, CatSummary[]>()
    for (const cat of sortedByRisk) {
      const key = cat.sector_code ?? 'otros'
      if (!sectorGroups.has(key)) sectorGroups.set(key, [])
      sectorGroups.get(key)!.push(cat)
    }
    const orderedSectors = bySpend.map((s) => s.sector_code).filter((sc) => sectorGroups.has(sc))
    if (sectorGroups.has('otros') && !orderedSectors.includes('otros')) orderedSectors.push('otros')
    return { sectorGroups, orderedSectors }
  }, [sortedByRisk, bySpend])

  const valuePct = ledeStats ? Number(ledeStats.valuePct) : null
  const countPct = ledeStats ? Number(ledeStats.countPct) : null
  const sumContracts = ledeStats?.sumContracts ?? null
  const fmt1 = (n: number) => n.toLocaleString(loc, { minimumFractionDigits: 1, maximumFractionDigits: 1 })

  return (
    <article className="ct ct-page ct-sheet">
      <div className="ct-wrap">
        <DocHead trail={[{ label: en ? 'Explore' : 'Explorar' }, { label: doc }]} />

        <Cover
          title={en
            ? <><span className="whitespace-nowrap">{totalTrillions} trillion pesos</span> on the table, by sector.</>
            : <><span className="whitespace-nowrap">{totalTrillions} billones de pesos</span> sobre la mesa, por sector.</>}
          lede={deckText}
          lead={
            /* WHO / WHAT — one page, two lenses: who bought (12 sectors) · what was bought (72 categories) */
            <div className="ct-viewswitch" role="group" aria-label={en ? 'Who or what' : 'Quién o qué'}>
              {([
                { key: 'sectors', es: 'Quién compró · sectores', en: 'Who bought · sectors', n: sectors.length || '—' },
                { key: 'categories', es: 'Qué se compró · categorías', en: 'What was bought · categories', n: categoryData?.total ?? '—' },
              ] as const).map((b) => (
                <button key={b.key} type="button" aria-pressed={view === b.key} className="ct-view" onClick={() => setView(b.key)}>
                  <span className="ct-view-t">
                    <b>{en ? b.en : b.es}</b>
                    <small>{b.n}</small>
                  </span>
                </button>
              ))}
            </div>
          }
        />

        {/* The lead element at full measure: the view's Marimekko («La mesa»). */}
        <div className="sx-lead">
          {view === 'sectors' ? (
            error ? (
              <div role="alert" className="border-t border-text-primary pt-4 text-text-primary">
                {t('page.failedToLoad')}{' '}
                <button type="button" onClick={() => refetch()} className="ct-link ml-2">
                  {en ? 'Retry' : 'Reintentar'}
                </button>
              </div>
            ) : isLoading ? (
              <Skeleton className="h-[460px] w-full" />
            ) : ledgerRows.length === 0 ? (
              <p aria-live="polite" className="ct-note">
                {en ? 'Model-flagged exposure unavailable: model data updating.' : 'Exposición señalada no disponible: actualizando datos del modelo.'}
              </p>
            ) : (
              <ArqueoMesa rows={ledgerRows} lang={lang} />
            )
          ) : categoryLoading ? (
            <Skeleton className="h-[460px] w-full" />
          ) : cats.length > 0 ? (
            <ArqueoMesaCategorias categories={cats} lang={lang} />
          ) : (
            <p className="ct-note">{en ? 'No categories available.' : 'No hay categorías disponibles.'}</p>
          )}
        </div>

        {/* ─── CLÁUSULAS — the page's figures, each citable ─── */}
        <section className="ct-clauses" aria-labelledby="sx-cl-h">
          <h2 id="sx-cl-h">{en ? 'In figures' : 'En cifras'}</h2>
          <div className="ct-cl-grid">
            <Clause
              id="cl-primera"
              ordinal={en ? 'First' : 'Primera'}
              title={en ? 'Of the amount contracted' : 'Del monto contratado'}
              fig={totalTrillions}
              count={finding ? { value: finding.total / 1e12, format: fmt1 } : null}
              unit={en ? 'trillion MXN' : 'billones MXN'}
              note={finding ? (en ? `12 sectors · ≈${formatCompactUSD(finding.total)}` : `12 sectores · 2002–${DATA_CUT_YEAR}`) : undefined}
              cite={en ? `Amount contracted 2002–${DATA_CUT_YEAR}: ${totalTrillions} trillion MXN` : `Monto contratado 2002–${DATA_CUT_YEAR}: ${totalTrillions} billones MXN`}
              doc={doc}
            />
            <Clause
              id="cl-segunda"
              ordinal={en ? 'Second' : 'Segunda'}
              title={en ? 'Of the contracts' : 'De los contratos'}
              fig={sumContracts != null ? formatNumber(sumContracts) : '—'}
              count={sumContracts != null ? { value: sumContracts, format: (n) => formatNumber(Math.round(n)) } : null}
              note={en ? 'across the 12 sectors' : 'en los 12 sectores'}
              cite={en ? `Contracts: ${sumContracts != null ? formatNumber(sumContracts) : '—'}` : `Contratos: ${sumContracts != null ? formatNumber(sumContracts) : '—'}`}
              doc={doc}
            />
            <Clause
              id="cl-tercera"
              ordinal={en ? 'Third' : 'Tercera'}
              title={en ? 'Of the flagged amount' : 'Del monto observado'}
              fig={valuePct != null ? fmt1(valuePct) : '—'}
              count={valuePct != null ? { value: valuePct, format: fmt1 } : null}
              unit="%"
              ruler={{ value: (valuePct ?? 0) / 100, mode: 'fill', color: RISK_COLORS.high, ends: ['0', totalVarMxn > 0 ? formatCompactMXN(totalVarMxn) : (en ? 'indicator ≥ 0.40' : 'indicador ≥ 0.40'), '100'] }}
              note={en ? 'of value, risk indicator ≥ 0.40' : 'del valor, indicador de riesgo ≥ 0.40'}
              cite={en ? `Share of value with a high or critical risk indicator (≥ 0.40): ${valuePct ?? '—'}%` : `Valor con indicador de riesgo alto o crítico (≥ 0.40): ${valuePct ?? '—'}%`}
              doc={doc}
            />
            <Clause
              id="cl-cuarta"
              ordinal={en ? 'Fourth' : 'Cuarta'}
              title={en ? 'Of the flagged contracts' : 'De los contratos señalados'}
              fig={countPct != null ? fmt1(countPct) : '—'}
              count={countPct != null ? { value: countPct, format: fmt1 } : null}
              unit="%"
              ruler={{ value: (countPct ?? 0) / 100, mode: 'fill', color: RISK_COLORS.high, ends: ['0', en ? 'indicator ≥ 0.40' : 'indicador ≥ 0.40', '100'] }}
              note={en ? 'of contracts carry that value' : 'de los contratos cargan ese valor'}
              cite={en ? `Contracts with a high or critical risk indicator (≥ 0.40): ${countPct ?? '—'}%` : `Contratos con indicador de riesgo alto o crítico (≥ 0.40): ${countPct ?? '—'}%`}
              doc={doc}
            />
          </div>
        </section>

        {view === 'sectors' && ledeStats && ledgerRows.length > 0 && (
          <>
            {/* The confound: the finding is the section heading; the Lámina stays the DEFAULT,
                the Registro is a toggle away; both render in full (never behind hover). */}
            <section className="ct-section" aria-labelledby="registro-heading">
              <div className="ct-annex-row">
                <h2 id="registro-heading" className="ct-h2">
                  <span className="ct-sc">{en ? 'Finding.' : 'Hallazgo.'}</span>{' '}
                  {tidyNodes(en ? (
                    <>The amount crowns {ledeStats.top3[0].name}; saturation crowns {ledeStats.intLeader.name}: {ledeStats.intLeaderPct}% of its own spend flagged, {pctOrDash(ledeStats.intLeader.daPct, 0)} of its contracts awarded without competition.</>
                  ) : (
                    <>El monto corona a {ledeStats.top3[0].name}; la saturación corona a {ledeStats.intLeader.name}: {ledeStats.intLeaderPct}% de su propio gasto observado, con {pctOrDash(ledeStats.intLeader.daPct, 0)} de sus contratos adjudicados sin competencia.</>
                  ), lang)}
                </h2>
                <div className="ct-viewswitch" role="group" aria-label={en ? 'Switch registry view' : 'Cambiar vista del registro'}>
                  {([
                    { key: 'plate', es: 'Lámina', en: 'Plate' },
                    { key: 'register', es: 'Registro', en: 'Register' },
                  ] as const).map((b) => (
                    <button key={b.key} type="button" aria-pressed={regView === b.key} className="ct-view" onClick={() => setRegView(b.key)}>
                      <span className="ct-view-t"><b>{en ? b.en : b.es}</b></span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="ct-section-body">
                {regView === 'plate' ? (
                  <ConfoundPlate rows={ledgerRows} lang={lang} lens={lens} onLensChange={setLens} />
                ) : (
                  <ExposureLedger rows={ledgerRows} lang={lang} lens={lens} onLensChange={setLens} />
                )}
              </div>
            </section>

            <SelfCaptureBand rows={ledgerRows} lang={lang} />

            <FeDeArqueo
              view="sectores"
              lang={lang}
              totals={{
                totalMxn: ledeStats.sumTotal,
                varMxn: totalVarMxn,
                contracts: ledeStats.sumContracts,
                flaggedSharePct: Number(ledeStats.valuePct),
                countPct: Number(ledeStats.countPct),
              }}
            />
          </>
        )}

        {view === 'categories' && topByRisk && topByValue && (
          <>
            <section className="ct-section" aria-labelledby="sx-cat-h">
              <div className="ct-annex-row">
                <h2 id="sx-cat-h" className="ct-h2">
                  <span className="ct-sc">{en ? 'Finding.' : 'Hallazgo.'}</span>{' '}
                  {en
                    ? <>{topByRisk.name_en} runs hottest in the catalog, {(topByRisk.avg_risk * 100).toFixed(1)}% mean risk, and among the smaller by value: {formatCompactMXN(topByRisk.total_value)}.</>
                    : <>{topByRisk.name_es} es la categoría más caliente del catálogo, con {(topByRisk.avg_risk * 100).toFixed(1)}% de riesgo promedio, y de las más chicas por valor: {formatCompactMXN(topByRisk.total_value)}.</>}
                </h2>
              </div>
              <p className="ct-measure ct-annex-lede">
                {en ? (
                  <>Categories group <b>what</b> the State bought (medicines, works, insurance) regardless of who. By volume, <b>{topByValue.name_en}</b> leads ({formatCompactMXN(topByValue.total_value)} at {(topByValue.avg_risk * 100).toFixed(1)}% risk, under the rule). The catalog repeats the sector confound: the big is almost never the hottest.</>
                ) : (
                  <>Las categorías agrupan <b>qué</b> compró el Estado (medicamentos, obra, seguros) sin importar quién. Por volumen manda <b>{topByValue.name_es}</b> ({formatCompactMXN(topByValue.total_value)}, {(topByValue.avg_risk * 100).toFixed(1)}% de riesgo, debajo de la regla). El catálogo repite el confundido de los sectores: lo grande casi nunca es lo más caliente.</>
                )}
              </p>
            </section>

            <section className="ct-section" aria-labelledby="sx-cap-h">
              <div className="ct-annex-row">
                <h2 id="sx-cap-h" className="ct-h2">
                  <span className="ct-sc">{en ? 'The capture.' : 'La captura.'}</span>{' '}
                  {en ? 'How much the leader of each category holds' : 'Cuánto controla el líder de cada categoría'}
                </h2>
                <span className="sx-meta">{en ? 'the 12 largest categories by spend' : 'las 12 categorías de mayor gasto'}</span>
              </div>
              <div className="ct-section-body">
                <CategoryCaptureDumbbell categories={cats} />
              </div>
            </section>

            <section className="ct-section" aria-labelledby="sx-catalog-h">
              <div className="ct-annex-row">
                <h2 id="sx-catalog-h" className="ct-h2">
                  <span className="ct-sc">{en ? 'The catalog.' : 'El catálogo.'}</span>{' '}
                  {en ? `${categoryData?.total ?? cats.length} categories, entry by entry` : `${categoryData?.total ?? cats.length} categorías, asiento por asiento`}
                </h2>
                <div className="ct-annex-aside">
                  {cview === 'list' && (
                    <div className="ct-viewswitch" role="group" aria-label={en ? 'Sort the catalog' : 'Ordenar el catálogo'}>
                      {([
                        { key: 'risk', es: 'Riesgo', en: 'Risk' },
                        { key: 'spend', es: 'Gasto', en: 'Spend' },
                        { key: 'capture', es: 'Captura', en: 'Capture' },
                        { key: 'name', es: 'Nombre', en: 'Name' },
                      ] as const).map((b) => (
                        <button key={b.key} type="button" aria-pressed={catSortKey === b.key} className="ct-view" onClick={() => setQ({ sort: b.key })}>
                          <span className="ct-view-t"><b>{en ? b.en : b.es}</b></span>
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="ct-viewswitch" role="group" aria-label={en ? 'List or tree' : 'Lista o árbol'}>
                    {(['list', 'tree'] as const).map((v) => (
                      <button key={v} type="button" aria-pressed={cview === v} className="ct-view" onClick={() => setCview(v)}>
                        <span className="ct-view-t"><b>{v === 'list' ? (en ? 'List' : 'Lista') : (en ? 'Tree' : 'Árbol')}</b></span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="ct-section-body">
                {cview === 'tree' ? (
                  <CategoryTreeView orderedSectors={tree.orderedSectors} sectorGroups={tree.sectorGroups} sectors={bySpend} lang={i18n.language} />
                ) : (
                  /* Anexo table (DESIGN.md §8): th SC 13, ink rule under, td 8 × 12, numerals right mono.
                     Phones scroll the columns inside the frame instead of clipping them. */
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[680px] border-collapse text-left">
                      <thead>
                        <tr className="border-b border-text-primary">
                          <th scope="col" className="sx-th px-3 py-2 w-10">#</th>
                          <th scope="col" className="sx-th px-3 py-2">{en ? 'Category' : 'Categoría'}</th>
                          <th scope="col" className="sx-th px-3 py-2 text-right">{en ? 'Spend' : 'Gasto'}</th>
                          <th scope="col" className="sx-th px-3 py-2 text-right">{en ? 'Mean risk' : 'Riesgo promedio'}</th>
                          <th scope="col" className="sx-th px-3 py-2 text-right">{en ? 'Direct award' : 'Adj. directa'}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {catRows.map((cat, idx) => {
                          const riskLevel = getRiskLevelFromScore(cat.avg_risk)
                          return (
                            <tr key={cat.category_id} className="ct-row border-b border-border align-top">
                              <td className="ct-mono px-3 py-2 text-[13px] text-text-muted">{String(idx + 1).padStart(2, '0')}</td>
                              <td className="px-3 py-2">
                                <EntityIdentityChip
                                  type="category"
                                  id={cat.category_id}
                                  name={en ? cat.name_en : cat.name_es}
                                  size="sm"
                                  hideIcon
                                  fullName
                                  sectorCode={cat.sector_code ?? null}
                                  riskScore={cat.avg_risk ?? null}
                                  className="inline-flex w-auto"
                                />
                                {(cat.top_vendor || cat.top_institution) && (
                                  <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-text-muted">
                                    {cat.top_vendor && (
                                      <EntityIdentityChip type="vendor" id={cat.top_vendor.id} name={cat.top_vendor.name} size="sm" hideIcon fullName inline sectorCode={cat.sector_code ?? null} />
                                    )}
                                    {cat.top_institution && (
                                      <EntityIdentityChip type="institution" id={cat.top_institution.id} name={cat.top_institution.name} size="sm" hideIcon fullName inline />
                                    )}
                                  </span>
                                )}
                              </td>
                              <td className="ct-mono px-3 py-2 text-right text-sm text-text-primary whitespace-nowrap">
                                {formatCompactMXN(cat.total_value)}
                                <div className="text-[13px] text-text-muted">{formatNumber(cat.total_contracts)} {en ? 'contracts' : 'contratos'}</div>
                              </td>
                              <td className="ct-mono px-3 py-2 text-right text-sm font-bold whitespace-nowrap" style={{ color: RISK_TEXT_COLORS[riskLevel] }}>
                                {(cat.avg_risk * 100).toFixed(1)}%
                              </td>
                              <td className="ct-mono px-3 py-2 text-right text-sm text-text-secondary whitespace-nowrap">{pctOrDash(cat.direct_award_pct, 0)}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </section>

            <FeDeArqueo view="categorias" lang={lang} totals={null} />
          </>
        )}
            <section className="ct-section ct-declara sx-declara-foot" aria-labelledby="sx-dec-h">
              <h2 id="sx-dec-h">{en ? 'Declarations' : 'Declaraciones'}</h2>
              <ol>
                <li><span>I.</span><div><b>{en ? 'Source.' : 'Fuente.'}</b> CompraNet, <span className="ct-mono">2002–{DATA_CUT_YEAR}</span>{en ? ', grouped into 12 sectors by budget branch.' : ', agrupado en 12 sectores por ramo presupuestal.'}</div></li>
                <li><span>II.</span><div><b>{en ? 'Flagged amount.' : 'Monto observado.'}</b> {en ? 'Pesos in contracts at the high or critical level of the risk indicator. It is not a fraud estimate.' : 'Pesos en contratos de nivel alto o crítico del indicador de riesgo. No es una estimación de fraude.'}</div></li>
                <li><span>III.</span><div><b>{en ? 'Reading the table.' : 'Cómo leer la mesa.'}</b> {view === 'sectors'
                  ? (en ? 'Column width is a sector’s spend; hatch height is the share of its own spend flagged, so the hatched area is the flagged pesos.' : 'El ancho de cada columna es el gasto del sector; la altura del rayado es la parte de su propio gasto señalada, así que el área rayada son los pesos señalados.')
                  : (en ? 'Column width is a category’s spend; hatch height is its mean risk indicator, with the medium level ruled.' : 'El ancho de cada columna es el gasto de la categoría; la altura del rayado es su indicador de riesgo promedio, con el nivel medio marcado.')}</div></li>
              </ol>
            </section>
      </div>
    </article>
  )
}

export default Sectors
