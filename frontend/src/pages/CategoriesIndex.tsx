/**
 * CategoriesIndex — «El Inventario» / The Stocktake
 *
 * 2026-07-02 (Fable-remake §6). After /sectors «El Arqueo» counts the cash,
 * «El Inventario» counts the goods: 72 anaqueles (shelves = categories), each
 * with its book value, dominant supplier, and descuadre (spend-rank vs
 * risk-rank mismatch). The one finding: the shelves that hold the most money
 * are not the ones that burn hottest on the indicator — proven in a single
 * view (§ El alzado), no lens toggle required.
 *
 * 2026-07-03 (DESIGNUS consolidation). The three-chart proof cluster (§ EL
 * ANAQUEL beeswarm + § EL CONCENTRADO dual-lens plate + § EL DESCUADRE slope)
 * collapsed into ONE bar-mekko — § EL ALZADO (`CategoryAlzado`): width = a
 * category's cumulative slice of spend (concentration), height = its risk
 * indicator on a zero baseline (size≠risk). Both theses on one mark, learned
 * once. The `?lens=` URL param and the SPEND/RISK toggle are retired.
 *
 * 2026-10-07. The bar-mekko read as contrived and ignored the sort. § EL
 * ESCALAFÓN (`CategoryEscalafon`) replaces it: a ranked horizontal bar chart
 * whose bar IS the active sort key, driven by the same URL sort + sector as the
 * register, animating rows to their new ranks. Register columns share one
 * width set; the masthead and body share one left edge.
 *
 * 2026-10-08. The owner: "categories still looks the same" — still a stack of
 * bars. § EL ANAQUEL (`CategoryAnaquel`) replaces El Escalafón with a field in
 * the /institutions «El Tamiz» family (shared DotField engine): one dot per
 * institution × category pair (~2,900), and the sort keys + sector chips are
 * LAYOUTS the dots tween between. The ranked list already lives in the count
 * sheet below, so El Escalafón (a second ranked list) is retired.
 *
 * Anatomy (2026-10-08, tabs — owner: "beautiful, I love it"): compact
 * masthead → a big tab bar (?vista=) with three views: «El Anaquel» (sort +
 * sector controls → dot field, ?todas=1 for all 72 rows) · «La hoja de
 * conteo» (one real table; hover dossier carries top vendor + δ) ·
 * «Tendencias» (?vista=tendencias; old ?vista=hallazgos still opens it — four findings: glyph matrix, chapters,
 * «La lectura», drill layer — 2026-10-28, renamed by the owner 2026-10-29) → provenance footer.
 *
 * 2026-10-15 (UI 1.0 «El Contrato», W3, object-first): reskinned, not rebuilt. DocHead › the h1
 * on one line → the three tabs and the active view at full measure (the object)
 * → «En cifras» → Declaraciones (the old lede + provenance) as the foot. The ten hallazgos are plain h2 sections inside their tab.
 *
 * Runs on categoriesApi.getSummary() + the field's own getField(). No per-row fetches.
 */
import { RankCell, RankTh } from '@/components/kit/ListRow'
import { lazy, Suspense, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { usePublishSiblingList, useOriginRowFlash } from '@/lib/nav/wayfinding'
import { categoriesApi } from '@/api/client'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHead } from '@/components/kit/PageHead'
import type { HeadSlots } from '@/components/categories/CategoryBodega'
import { Clause } from '@/components/contrato/Clause'
import '@/components/categories/categories.css'
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import type { FieldSort as CategorySortKey } from '@/lib/categories/field'
import { parseView, type View } from '@/lib/categories/views'
import { CategoryHoverDossier } from '@/components/categories/CategoryHoverDossier'
import { SortHeaderTh } from '@/components/ui/SortHeaderTh'
import { RiskGauge } from '@/components/contrato/RiskGauge'
import { glueDashes } from '@/lib/typography'
import {
  type CategorySummaryItem,
  CONTRACT_FLOOR,
} from '@/components/categories/types'
import {
  formatCompactMXN,
  formatDualCurrency,
  formatNumber,
  pctOrDash,
} from '@/lib/utils'
import { FootNotes } from '@/components/kit/FootNotes'
import {
  SECTOR_COLORS,
  RISK_TEXT_COLORS,
  EU_DIRECT_AWARD_LIMIT,
  getSectorName,
  SECTORS,
  RISK_COLORS,
  DATA_CUT_YEAR,
  CURRENT_MODEL_VERSION,
} from '@/lib/constants'

// The canvas field + its 2,900-dot payload load in their own chunk, after the page paints.
const CategoryAnaquel = lazy(() => import('@/components/categories/CategoryAnaquel'))
// «El piso → La bodega» (TEAL-4): the default view, its own chunk.
const CategoryBodega = lazy(() => import('@/components/categories/CategoryBodega'))
// «Hallazgos» (four findings + matrix + drill layer, port of the reviewed AC concept) in its own chunk.
const Hallazgos = lazy(() => import('@/components/categories/hallazgos/Hallazgos'))

// ── Types ─────────────────────────────────────────────────────────────────────

interface CategorySummaryResponse {
  data: CategorySummaryItem[]
  total: number
}

type SortKey = CategorySortKey

const SORT_KEYS: SortKey[] = ['spend', 'risk', 'contracts', 'direct_award']

const ALL_SECTOR_CODES = SECTORS.map((s) => s.code)
const DA_LIMIT_PCT = Math.round(EU_DIRECT_AWARD_LIMIT * 100) // 10 — the EU single-market scoreboard line

const COUNT_WORDS: Record<'en' | 'es', string[]> = {
  en: ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'],
  es: ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce'],
}
/** Spell 1–12 as a word (editorial style); numerals above 12. */
function countWord(n: number, lang: 'en' | 'es'): string {
  return n >= 1 && n <= 12 ? COUNT_WORDS[lang][n] : String(n)
}

// Sectors with a single active category — taxonomy expansion pending (S.10–S.12).
const DAGGER_SECTOR_CODES = new Set(['educacion', 'gobernacion', 'trabajo'])



// ── URL state ─────────────────────────────────────────────────────────────────
// Param names match El Hilo P0 (?sort=&sector=) so the eventual merge is trivial.
// Defaults (spend / all / concentration) render with NO params — old bookmarks
// don't break.

function useCategoriesUrlState() {
  const [params, setParams] = useSearchParams()

  const rawSort = params.get('sort')
  const sortKey: SortKey = (SORT_KEYS as string[]).includes(rawSort ?? '') ? (rawSort as SortKey) : 'spend'

  const rawSector = params.get('sector')
  const activeSector: string | null =
    rawSector && (ALL_SECTOR_CODES as string[]).includes(rawSector) ? rawSector : null

  const rawView = params.get('vista')
  const view = parseView(rawView)

  const showAll = params.get('todas') === '1'

  const patch = (next: { sort?: SortKey; sector?: string | null; view?: View; all?: boolean }) => {
    setParams(
      (prev) => {
        const out = new URLSearchParams(prev)
        if (next.sort !== undefined) {
          if (next.sort === 'spend') out.delete('sort')
          else out.set('sort', next.sort)
        }
        if (next.sector !== undefined) {
          if (next.sector === null) out.delete('sector')
          else out.set('sector', next.sector)
        }
        if (next.all !== undefined) {
          if (next.all) out.set('todas', '1')
          else out.delete('todas')
        }
        if (next.view !== undefined) {
          if (next.view === 'bodega') out.delete('vista')
          else out.set('vista', next.view)
        }
        return out
      },
      { replace: true },
    )
  }

  return {
    sortKey,
    activeSector,
    setSortKey: (s: SortKey) => patch({ sort: s }),
    setActiveSector: (s: string | null) => patch({ sector: s }),
    view,
    setView: (v: View) => patch({ view: v }),
    showAll,
    setShowAll: (a: boolean) => patch({ all: a }),
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sortCategories(items: CategorySummaryItem[], key: SortKey): CategorySummaryItem[] {
  const sorted = [...items]
  switch (key) {
    case 'spend':
      return sorted.sort((a, b) => b.total_value - a.total_value)
    case 'risk':
      return sorted.sort((a, b) => b.avg_risk - a.avg_risk)
    case 'contracts':
      return sorted.sort((a, b) => b.total_contracts - a.total_contracts)
    case 'direct_award':
      return sorted.sort((a, b) => b.direct_award_pct - a.direct_award_pct)
  }
}

// ── View tabs — the WAI-ARIA tabs pattern on the Contrato tab bar (DESIGN.md §8) ──

function ViewTabs({ view, onChange, lang, counts }: { view: View; onChange: (v: View) => void; lang: 'en' | 'es'; counts: Partial<Record<View, number>> }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const items: { key: View; es: string; en: string; subEs: string; subEn: string }[] = [
    { key: 'bodega', es: 'La bodega', en: 'The warehouse', subEs: 'cajas: piso = dinero, altura = sin concurso', subEn: 'boxes: floor = money, height = no tender' },
    { key: 'anaquel', es: 'El Anaquel', en: 'The Shelves', subEs: 'un punto por institución y categoría', subEn: 'one dot per institution × category' },
    { key: 'hoja', es: 'La hoja de conteo', en: 'The count sheet', subEs: 'las categorías, ordenables', subEn: 'every category, sortable' },
    { key: 'tendencias', es: 'Tendencias', en: 'Trends', subEs: 'cuatro tendencias y su capa de detalle', subEn: 'four trends and their detail layer' },
  ]
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const n = items.length
    const next = e.key === 'ArrowRight' ? (i + 1) % n : e.key === 'ArrowLeft' ? (i - 1 + n) % n : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : null
    if (next == null) return
    e.preventDefault()
    onChange(items[next].key)
    refs.current[next]?.focus()
  }
  return (
    <div role="tablist" aria-label={lang === 'es' ? 'Vistas de la página' : 'Page views'} className="ct-viewswitch">
      {items.map((it, i) => {
        const active = it.key === view
        return (
          <button
            key={it.key}
            ref={(el) => { refs.current[i] = el }}
            id={`cat-tab-${it.key}`}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={`cat-panel-${it.key}`}
            aria-description={lang === 'es' ? it.subEs : it.subEn}
            tabIndex={active ? 0 : -1}
            className="ct-view"
            onClick={() => onChange(it.key)}
            onKeyDown={(e) => onKey(e, i)}
          >
            <span className="ct-view-t">
              <b>{lang === 'es' ? it.es : it.en}</b>
              {counts[it.key] != null && <small>{formatNumber(counts[it.key] as number)}</small>}
            </span>
          </button>
        )
      })}
    </div>
  )
}

// ── Count-sheet row — a real <tr> of <td>s ───────────────────────────────────

function CountRow({
  item,
  rank,
  lang,
  onHover,
  onLeave,
}: {
  item: CategorySummaryItem
  rank: number
  lang: 'en' | 'es'
  onHover: (id: number, el: HTMLElement) => void
  onLeave: () => void
}) {
  const daOver = item.direct_award_pct > DA_LIMIT_PCT
  const name = lang === 'es' ? item.name_es : item.name_en
  return (
    <tr
      data-wf-row={item.category_id}
      className="ct-row"
      onMouseEnter={(e) => onHover(item.category_id, e.currentTarget)}
      onMouseLeave={onLeave}
      onFocusCapture={(e) => onHover(item.category_id, e.currentTarget)}
      onBlurCapture={onLeave}
    >
      <RankCell n={rank} />
      <td className="ct-key">
        <span className="inline-flex items-baseline min-w-0 max-w-full">
          <EntityIdentityChip
            type="category"
            id={item.category_id}
            name={name}
            size="inherit"
            hideIcon
            fullName
            className="max-w-full h-auto [&>span]:whitespace-normal"
            sectorCode={item.sector_code ?? null}
          />
          {DAGGER_SECTOR_CODES.has(item.sector_code) && (
            <sup className="ml-0.5 font-mono text-[12px] text-text-muted" aria-hidden="true">†</sup>
          )}
        </span>
      </td>
      <td className="num ct-amt">{formatCompactMXN(item.total_value)}</td>
      <td className="num" data-l={lang === 'es' ? 'contratos' : 'contracts'}>{formatNumber(item.total_contracts)}</td>
      {/* the indicator 0–1 with its level, like every ledger (DESIGN.md §8 «Tablas»; was ×100) */}
      <td className="gauge"><RiskGauge value={item.avg_risk} /></td>
      <td className="num" data-l={lang === 'es' ? 'adj. directa' : 'direct award'} style={{ color: daOver ? RISK_TEXT_COLORS.high : 'var(--color-text-secondary)' }}>
        {pctOrDash(item.direct_award_pct, 0)}
      </td>
    </tr>
  )
}

// ── Declaraciones — the page's foot: what the shelves are + provenance (DESIGN.md §5, object-first) ──

function Declaraciones({ lang, children }: { lang: 'en' | 'es'; children?: ReactNode }) {
  const en = lang === 'en'
  return (
    <section className="ct-section cx-foot" aria-label={en ? 'Reading and notes' : 'Lectura y notas'}>
      <p className="cx-foot-lede">{en
        ? 'Categories sort federal purchases by what was bought (medicines, road works, software), not by who bought them. Each shelf carries its book value, its dominant supplier and its risk indicator.'
        : 'Las categorías ordenan las compras federales por lo que se compró (medicamentos, obra carretera, software), no por quién lo compró. Cada anaquel lleva su valor en libros, su proveedor dominante y su indicador de riesgo.'}
        {children ? <> {children}</> : null}</p>
      <FootNotes lead={en
          ? `Risk indicator. A statistical indicator (model ${CURRENT_MODEL_VERSION}), not a fraud estimate.`
          : `Indicador de riesgo. Un indicador estadístico (modelo ${CURRENT_MODEL_VERSION}), no una estimación de fraude.`} lang={lang} items={[
        glueDashes(en
          ? `Source. CompraNet + ComprasMX 2002–${DATA_CUT_YEAR}, Partida/CUCoP codes; 72 active shelves cover 99.73% of classifiable spend. Reliable coverage is 2023–2025; earlier years may be partially classified.`
          : `Fuente. CompraNet + ComprasMX 2002–${DATA_CUT_YEAR}, códigos Partida/CUCoP; 72 anaqueles activos cubren el 99.73% del gasto clasificable. La cobertura confiable es 2023–2025; los años previos pueden tener clasificación parcial.`),
        en
          ? `Direct award. The mark is the EU single-market scoreboard line (${DA_LIMIT_PCT}%); with no direct-award data for 2002–2010, every share is a lower bound.`
          : `Adjudicación directa. La marca es la línea del marcador del mercado único de la UE (${DA_LIMIT_PCT}%); sin datos de adjudicación directa 2002–2010, toda participación es un mínimo.`,
      ]} />
    </section>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CategoriesIndex() {
  const { t, i18n } = useTranslation('categories')
  const lang: 'en' | 'es' = i18n.language?.startsWith('es') ? 'es' : 'en'
  const isEs = lang === 'es'

  const { sortKey, activeSector, setSortKey, setActiveSector, view, setView, showAll, setShowAll } = useCategoriesUrlState()
  const sheetRef = useRef<HTMLDivElement>(null)
  // Raw query string re-exposed for the wayfinding backTo link (El Hilo P1+).
  const [searchParams] = useSearchParams()

  // One floating register dossier instance, keyed by hovered category_id.
  const [hover, setHover] = useState<{ id: number; top: number; bottom: number; containerH: number } | null>(null)

  const { data, isLoading, isError } = useQuery<CategorySummaryResponse>({
    queryKey: ['categories', 'summary'],
    queryFn: () => categoriesApi.getSummary(),
    staleTime: 600_000,
  })

  const totalValue = useMemo(
    () => (data?.data ? data.data.reduce((s, c) => s + c.total_value, 0) : 0),
    [data],
  )
  const totalContracts = useMemo(
    () => (data?.data ? data.data.reduce((s, c) => s + c.total_contracts, 0) : 0),
    [data],
  )
  // «En cifras»: the contract-weighted share flagged high or critical (indicator ≥ 0.40).
  const flaggedPct = useMemo(() => {
    const xs = data?.data?.filter((c) => c.high_risk_pct != null) ?? []
    const n = xs.reduce((s, c) => s + c.total_contracts, 0)
    return n > 0 ? xs.reduce((s, c) => s + (c.high_risk_pct as number) * c.total_contracts, 0) / n : null
  }, [data])
  const loc = isEs ? 'es-MX' : 'en-US'
  const fmt1 = (n: number) => n.toLocaleString(loc, { minimumFractionDigits: 1, maximumFractionDigits: 1 })

  // ── EL SALDO computed leads ─────────────────────────────────────────────────
  const saldo = useMemo(() => {
    if (!data?.data || data.data.length === 0) return null
    const items = data.data
    const total = items.reduce((s, c) => s + c.total_value, 0)
    // k50 / k80 over spend.
    const byValue = [...items].sort((a, b) => b.total_value - a.total_value)
    let cum = 0
    let k50 = 0
    let k80 = 0
    for (let i = 0; i < byValue.length; i++) {
      cum += byValue[i].total_value
      if (k50 === 0 && total > 0 && cum / total >= 0.5) k50 = i + 1
      if (k80 === 0 && total > 0 && cum / total >= 0.8) k80 = i + 1
    }
    const topSpend = byValue[0]
    // Riskiest gated by contract floor.
    const qualified = items.filter((c) => c.total_contracts >= CONTRACT_FLOOR)
    const riskiest = (qualified.length ? qualified : items)
      .slice()
      .sort((a, b) => b.avg_risk - a.avg_risk)[0]
    const meanRisk = items.reduce((s, c) => s + c.avg_risk, 0) / items.length
    const ratio = meanRisk > 0 ? riskiest.avg_risk / meanRisk : 0
    return { total, k50, k80, topSpend, riskiest, ratio }
  }, [data])

  const displayed = useMemo(() => {
    if (!data?.data) return []
    const filtered = activeSector ? data.data.filter((c) => c.sector_code === activeSector) : data.data
    return sortCategories(filtered, sortKey)
  }, [data, activeSector, sortKey])


  // Descuadre map (δ = spend rank − risk rank), computed once over all 72 with
  // ranks scoped to the qualified pool so it agrees with § El descuadre. Sub-floor
  // categories have no risk rank → null → rendered "—" in the register.
  const descuadreMap = useMemo(() => {
    const map = new Map<number, number | null>()
    if (!data?.data) return map
    const qualified = data.data.filter((c) => c.total_contracts >= CONTRACT_FLOOR)
    const spendRank = new Map<number, number>()
    const riskRank = new Map<number, number>()
    ;[...qualified].sort((a, b) => b.total_value - a.total_value).forEach((c, i) => spendRank.set(c.category_id, i + 1))
    ;[...qualified].sort((a, b) => b.avg_risk - a.avg_risk).forEach((c, i) => riskRank.set(c.category_id, i + 1))
    for (const c of data.data) {
      const sr = spendRank.get(c.category_id)
      const rr = riskRank.get(c.category_id)
      map.set(c.category_id, sr != null && rr != null ? sr - rr : null)
    }
    return map
  }, [data])

  // ── Wayfinding (El Hilo P1+) — publish the ranked ledger as the sibling list
  // so a dossier's Prev/Next stepper honours this exact sort/filter, and
  // restore the origin row on browser-back.
  const activeSectorName = activeSector
    ? (lang === 'es'
        ? SECTORS.find((s) => s.code === activeSector)?.name
        : SECTORS.find((s) => s.code === activeSector)?.nameEN) ?? null
    : null
  const search = searchParams.toString()
  usePublishSiblingList(
    displayed.length
      ? {
          kind: 'category',
          items: displayed.map((c) => ({ id: String(c.category_id), label: lang === 'es' ? c.name_es : c.name_en })),
          backTo: search ? `/categories?${search}` : '/categories',
          backLabel:
            (lang === 'es' ? 'categorías' : 'categories') + (activeSectorName ? ` · ${activeSectorName}` : ''),
        }
      : null,
  )
  useOriginRowFlash('category', displayed.length > 0)

  const presentSectorCodes = useMemo(() => {
    if (!data?.data) return ALL_SECTOR_CODES
    const seen = new Set(data.data.map((c) => c.sector_code))
    return ALL_SECTOR_CODES.filter((code) => seen.has(code))
  }, [data])

  // Register hover row + edge-flip geometry.
  const hoverItem = hover ? displayed.find((c) => c.category_id === hover.id) ?? null : null
  const hoverRank = hover ? displayed.findIndex((c) => c.category_id === hover.id) + 1 : 0
  const dossierBelow = hover ? hover.top < hover.containerH / 2 : true
  const captureRect = (el: HTMLElement) => {
    const box = sheetRef.current?.getBoundingClientRect()
    const r = el.getBoundingClientRect()
    const top = box ? r.top - box.top : 0
    return { top, bottom: top + r.height, containerH: box?.height ?? top + r.height }
  }

  const sortButtons: { key: SortKey; labelEs: string; labelEn: string }[] = [
    { key: 'spend', labelEs: 'Gasto', labelEn: 'Spend' },
    { key: 'risk', labelEs: 'Riesgo', labelEn: 'Risk' },
    { key: 'contracts', labelEs: 'Contratos', labelEn: 'Contracts' },
    { key: 'direct_award', labelEs: 'Adj. directa', labelEn: 'Direct award' },
  ]

  // Sort + sector + «ver todas»: ONE line on the tab bar's row (owner 2026-10-20: the two
  // wrapping chip rows and the lone «Show all» were «awfully formatted»). They drive both views.
  const controls = (
    <>
      <div className="ct-ctl">
        <span className="ct-ctl-l" id="cx-sort-l">{isEs ? 'Ordenar' : 'Sort'}</span>
        <div className="ct-viewswitch" role="group" aria-labelledby="cx-sort-l">
          {sortButtons.map(({ key, labelEs, labelEn }) => (
            <button key={key} type="button" className="ct-view" onClick={() => setSortKey(key)} aria-pressed={sortKey === key}>
              <span className="ct-view-t"><b>{isEs ? labelEs : labelEn}</b></span>
            </button>
          ))}
        </div>
      </div>
      <label className="ct-ctl">
        <span className="ct-ctl-l">Sector</span>
        <span className="ct-sel">
          {activeSector && <span className="ct-sq" aria-hidden="true" style={{ ['--c' as string]: SECTOR_COLORS[activeSector] ?? SECTOR_COLORS.otros }} />}
          <select value={activeSector ?? ''} onChange={(e) => setActiveSector(e.target.value || null)}>
            <option value="">{isEs ? 'Todos los sectores' : 'All sectors'}</option>
            {presentSectorCodes.map((code) => <option key={code} value={code}>{getSectorName(code, lang)}</option>)}
          </select>
        </span>
      </label>
      {view === 'anaquel' && data?.data && (
        // Every category as its own row ↔ the top 12 + one rail (?todas=1)
        <div className="ct-viewswitch">
          <button type="button" className="ct-view" onClick={() => setShowAll(!showAll)} aria-pressed={showAll}>
            <span className="ct-view-t"><b>{showAll
              ? (isEs ? 'Ver las 12 principales' : 'Top 12 only')
              : (isEs ? `Ver las ${data.data.length} categorías` : `Show all ${data.data.length} categories`)}</b></span>
          </button>
        </div>
      )}
    </>
  )

  const doc = isEs ? 'Categorías' : 'Categories'
  const ready = !isLoading && !isError && !!data?.data && data.data.length > 0
  const tabs = <>
    {ready && view !== 'tendencias' && view !== 'bodega' && <div className="ct-ctlbar">{controls}</div>}
    <ViewTabs view={view} onChange={setView} lang={lang} counts={{ hoja: data?.data?.length, tendencias: 4 }} />
  </>
  const head = (slots: HeadSlots) => <PageHead lang={lang} crumbs={[{ label: doc }]} tabs={tabs} {...slots} />
  const pageQ = isEs ? '¿Qué compra el gobierno y a quién?' : 'What does the government buy, and from whom?'
  const coverTitle = (
      <>
        {isEs ? `El gobierno compra en ${data?.data?.length || 72} categorías:` : `The government buys in ${data?.data?.length || 72} categories:`}
        {saldo && totalValue > 0 ? (
          <>
            {' '}
            <span className="whitespace-nowrap">{formatDualCurrency(totalValue)}</span>
            {isEs ? `; la mitad va a ${countWord(saldo.k50, 'es')}.` : `; half goes to ${countWord(saldo.k50, 'en')}.`}
          </>
        ) : isLoading ? (
          // Same shape as the loaded clause, unpainted: the h1 never gains a line when the saldo lands (CLS).
          <span className="invisible" aria-hidden="true">
            {isEs ? ' 9.9 billones MXN; la mitad va a seis.' : ' 9.9T MXN; half goes to six.'}
          </span>
        ) : (
          isEs ? ' así se reparte el dinero.' : ' here is where the money goes.'
        )}
      </>
  )

  return (
    <article className="ct ct-page ct-sheet">
      <div className="ct-wrap">
        {/* One page head (kit/PageHead, owner 11-06): crumbs + tabs → h1 = the one finding → the question → (bodega) the
            three lines → toolbar + legend. La bodega fills its own slots (filtered finding, the ARIA question). */}
        {ready && view === 'bodega' ? (
          <Suspense fallback={<>{head({ finding: coverTitle, question: pageQ })}<Skeleton className="h-[640px] w-full" /></>}>
            <CategoryBodega items={data.data} lang={lang} head={head} />
          </Suspense>
        ) : head({ finding: coverTitle, question: pageQ })}

        {/* The lead element at full measure: the three tabs and the active view. Geometry is held while loading. */}
        <div className="cx-lead">
          {isLoading && <Skeleton className="h-[640px] w-full" />}

          {isError && (
            <p role="alert" className="ct-note">
              {isEs ? 'No se pudieron cargar las categorías. Vuelva a intentarlo.' : 'Unable to load categories. Please try again.'}
            </p>
          )}

          {/* ── El Anaquel — the dot field ── */}
          {ready && view === 'anaquel' && (
            <div role="tabpanel" id="cat-panel-anaquel" aria-labelledby="cat-tab-anaquel">
              <div>
                <Suspense fallback={<Skeleton className="h-[560px] w-full" />}>
                  <CategoryAnaquel
                    items={data.data}
                    sortKey={sortKey}
                    activeSector={activeSector}
                    onSector={setActiveSector}
                    lang={lang}
                    focusCategory={null}
                    showAll={showAll}
                  />
                </Suspense>
              </div>
            </div>
          )}

          {/* ── La hoja de conteo — every category, one real table ── */}
          {ready && view === 'hoja' && (
            <div role="tabpanel" id="cat-panel-hoja" aria-labelledby="cat-tab-hoja">
              <div ref={sheetRef} className="cx-sheet" onMouseLeave={() => setHover(null)}>
                <div className="ct-table-wrap">
                  <table className="ct-table ct-stack">
                    <caption className="sr-only">
                      {isEs ? 'Las categorías: gasto, contratos, indicador de riesgo y adjudicación directa' : 'The categories: spend, contracts, risk indicator and direct award'}
                    </caption>
                    <thead>
                      <tr>
                        <RankTh lang={isEs ? 'es' : 'en'} />
                        <th scope="col">{isEs ? 'Categoría' : 'Category'}</th>
                        <SortHeaderTh<SortKey> field="spend" label={isEs ? 'Gasto' : 'Spend'} activeField={sortKey} order="desc" onSort={setSortKey} className="num w-36" />
                        <SortHeaderTh<SortKey> field="contracts" label={isEs ? 'Contratos' : 'Contracts'} activeField={sortKey} order="desc" onSort={setSortKey} className="num w-32" />
                        <SortHeaderTh<SortKey> field="risk" label={isEs ? 'Indicador de riesgo' : 'Risk indicator'} activeField={sortKey} order="desc" onSort={setSortKey} className="gauge" />
                        <SortHeaderTh<SortKey> field="direct_award" label={isEs ? 'Adj. directa' : 'Direct award'} activeField={sortKey} order="desc" onSort={setSortKey} className="num w-32" />
                      </tr>
                    </thead>
                    <tbody>
                      {displayed.map((item, idx) => (
                        <CountRow
                          key={item.category_id}
                          item={item}
                          rank={idx + 1}
                          lang={lang}
                          onHover={(id, el) => setHover({ id, ...captureRect(el) })}
                          onLeave={() => setHover(null)}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* Floating dossier (desktop): dominant supplier, δ, single award. Edge-flips at the midline. */}
                {hoverItem && hover && (
                  <div
                    aria-hidden="true"
                    className="hidden md:block pointer-events-none absolute z-20"
                    style={{ right: 12, ...(dossierBelow ? { top: hover.bottom + 6 } : { bottom: hover.containerH - hover.top + 6 }) }}
                  >
                    <div className="cx-dossier">
                      <CategoryHoverDossier item={hoverItem} rank={hoverRank} totalValue={totalValue} descuadre={descuadreMap.get(hoverItem.category_id) ?? null} lang={lang} />
                    </div>
                  </div>
                )}
              </div>
              <p className="ct-note">
                {isEs
                  ? `Pase el cursor por una fila para ver su proveedor dominante y su δ (puesto por gasto − puesto por riesgo). Adjudicación directa en color: sobre la línea de la UE (${DA_LIMIT_PCT}%); es un mínimo. † Sectores con una sola categoría activa: expansión de taxonomía pendiente.`
                  : `Hover a row for its dominant supplier and its δ (spend rank − risk rank). Direct award in colour: over the EU line (${DA_LIMIT_PCT}%); a lower bound. † Sectors with a single active category: taxonomy expansion pending.`}
              </p>
            </div>
          )}

          {/* ── Tendencias — four findings, the glyph matrix and the drill layer ── */}
          {ready && view === 'tendencias' && (
            <div role="tabpanel" id="cat-panel-tendencias" aria-labelledby="cat-tab-tendencias">
              <Suspense fallback={<Skeleton className="h-[900px] w-full" />}>
                <Hallazgos lang={lang} />
              </Suspense>
            </div>
          )}
        </div>

        {/* ─── EN CIFRAS — the inventory's four figures (DESIGN.md §4.2) ─── */}
        <section className="ct-clauses" aria-labelledby="cx-cl-h">
          <h2 id="cx-cl-h">{isEs ? 'En cifras' : 'In figures'}</h2>
          <div className="ct-cl-grid">
            <Clause
              id="cx-cl-cat"
              title={isEs ? 'Categorías activas' : 'Active categories'}
              fig={data?.data ? String(data.data.length) : '—'}
              count={data?.data ? { value: data.data.length, format: (n) => String(Math.round(n)) } : null}
              note={isEs ? '99.73% del gasto clasificable' : '99.73% of classifiable spend'}
            />
            <Clause
              id="cx-cl-con"
              title={isEs ? `Contratos clasificados, 2002–${DATA_CUT_YEAR}` : `Contracts classified, 2002–${DATA_CUT_YEAR}`}
              fig={totalContracts > 0 ? formatNumber(totalContracts) : '—'}
              count={totalContracts > 0 ? { value: totalContracts, format: (n) => formatNumber(Math.round(n)) } : null}
              note={isEs ? 'la suma de los anaqueles' : 'the sum over the shelves'}
            />
            <Clause
              id="cx-cl-monto"
              title={isEs ? 'Monto en los anaqueles' : 'Amount on the shelves'}
              fig={totalValue > 0 ? fmt1(totalValue / 1e12) : '—'}
              count={totalValue > 0 ? { value: totalValue / 1e12, format: fmt1 } : null}
              unit={isEs ? 'billones MXN' : 'trillion MXN'}
              note={isEs ? 'pesos de cada año, sin ajustar' : 'pesos of each year, unadjusted'}
            />
            <Clause
              id="cx-cl-flag"
              title={isEs ? 'Contratos con indicador alto o crítico' : 'Contracts with a high or critical indicator'}
              fig={flaggedPct != null ? fmt1(flaggedPct) : '—'}
              count={flaggedPct != null ? { value: flaggedPct, format: fmt1 } : null}
              unit="%"
              ruler={{ value: (flaggedPct ?? 0) / 100, mode: 'fill', color: RISK_COLORS.high, ends: ['0%', isEs ? 'indicador de riesgo ≥ 0.40' : 'risk indicator ≥ 0.40', '100%'] }}
            />
          </div>
        </section>

        <Declaraciones lang={lang}>
          <Link to="/aria" className="ct-more ct-link">
            {isEs ? 'Ir a' : 'Open'} {t('nav:ariaQueue')}
          </Link>
        </Declaraciones>
      </div>
    </article>
  )
}
