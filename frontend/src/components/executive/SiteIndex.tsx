/**
 * SiteIndex — «Índice del sitio», the Portada's map of the whole edition
 * (_polish/portada/SPEC.md § «Índice del sitio» band, § G4).
 *
 * Rows are mapped over the one table of contents (TOC + OFF_NAV), so the
 * numerals come from `numeralOf` and always match the sidebar. Each row prints
 * one live figure from an existing query (shared keys, so react-query dedupes
 * with the sidebar, the bundle and the destination pages): «—» while loading,
 * dropped once loaded without a value — never a typed fallback.
 */
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { analysisApi, captureApi, caseLibraryApi, categoriesApi, gapApi } from '@/api/client'
import { useExecutiveData } from '@/hooks/useExecutiveData'
import { DATA_LAST_YEAR } from '@/components/administrations/data'
import { TOC, OFF_NAV, DATA_QUALITY_QUERY, numeralOf, type TocEntry, type TocSection } from '@/lib/nav/toc'
import { STORY_HEADLINES } from '@/lib/story-index'
import { CURRENT_MODEL_VERSION, FILMS_LIVE, SECTORS } from '@/lib/constants'
import { scopeBuyers } from '@/lib/scope'
import { formatNumber } from '@/lib/utils'
import { cieloHref } from '@/lib/vista'

type Group = TocSection | 'also'
// Three columns: LA HISTORIA (seven rows) balances the other four groups stacked in pairs.
const COLUMNS: Group[][] = [['story'], ['money', 'instrument'], ['trust', 'also']]

const HOUR = 60 * 60 * 1000

export function SiteIndex({ lang }: { lang: 'en' | 'es' }) {
  const { t: tn } = useTranslation('nav')
  const en = lang === 'en'
  const L = (es: string, e: string) => (en ? e : es)

  const { executiveSummary, dashboard, ariaStats, isLoading: bundleLoading } = useExecutiveData()
  const yoy = useQuery({ queryKey: ['analysis', 'year-over-year'], queryFn: () => analysisApi.getYearOverYear(), staleTime: 5 * 60 * 1000, retry: false })
  const gap = useQuery({ queryKey: ['gap-summary'], queryFn: () => gapApi.getSummary(), staleTime: HOUR, retry: false })
  const capture = useQuery({ queryKey: ['capture', 'current'], queryFn: () => captureApi.getCurrent(), staleTime: HOUR, retry: false })
  const cases = useQuery({ queryKey: ['case-library-count'], queryFn: () => caseLibraryApi.getStats(), staleTime: HOUR, retry: 0 })
  const cats = useQuery({ queryKey: ['categories', 'summary'], queryFn: () => categoriesApi.getSummary(), staleTime: 600_000, retry: false })
  const dq = useQuery(DATA_QUALITY_QUERY)
  // The film registry lives in La Galería's chunk; load it on its own, never into this page's bundle.
  const films = useQuery({
    queryKey: ['gallery', 'film-count'],
    queryFn: () => import('@/lib/gallery/films').then((m) => Object.keys(m.FILMS).length),
    staleTime: Infinity,
    enabled: FILMS_LIVE,
  })

  const fig = (v: string | null | undefined, loading: boolean): string | null => v ?? (loading ? '—' : null)
  const n = (x: number | null | undefined) => (typeof x === 'number' ? formatNumber(x) : null)

  const spend = executiveSummary?.headline?.total_value
  const spendTxt = typeof spend === 'number'
    ? (() => {
        const v = (spend / 1e12).toLocaleString(en ? 'en-US' : 'es-MX', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
        return en ? `MX$${v} trillion` : `${v} billones de pesos`
      })()
    : null
  const daLast = yoy.data?.data?.find((y) => y.year === DATA_LAST_YEAR)?.direct_award_pct
  const catCount = (cats.data as { total?: number } | undefined)?.total

  // Keyed by href, so a row the lead adds later (Los Datos) picks its figure up without a code path here.
  const figures: Record<string, string | null> = {
    '/': L('página actual', 'you are here'),
    '/mapa': fig(spendTxt, bundleLoading),
    '/administrations': fig(typeof daLast === 'number' ? L(`${daLast.toFixed(0)}% adj. directa · ${DATA_LAST_YEAR}`, `${daLast.toFixed(0)}% direct award · ${DATA_LAST_YEAR}`) : null, yoy.isLoading),
    '/gap': fig(gap.data?.available ? L(`${n(gap.data.total_contracts)} procedimientos`, `${n(gap.data.total_contracts)} procedures`) : null, gap.isLoading),
    '/captura': fig(capture.data ? L(`${n(capture.data.count)} compradores`, `${n(capture.data.count)} buyers`) : null, capture.isLoading),
    '/cases': fig(typeof cases.data?.total_cases === 'number' ? L(`${n(cases.data.total_cases)} casos`, `${n(cases.data.total_cases)} cases`) : null, cases.isLoading),
    '/gallery': fig(typeof films.data === 'number' ? L(`${films.data} películas`, `${films.data} films`) : null, films.isLoading),
    '/categories': fig(typeof catCount === 'number' ? L(`${n(catCount)} categorías`, `${n(catCount)} categories`) : null, cats.isLoading),
    // every level (overview has no federal count), so it says so in the scope switch's words (lib/scope.ts)
    '/institutions': fig(n(dashboard?.overview?.total_institutions) && L(`${n(dashboard?.overview?.total_institutions)} ${scopeBuyers('all', false)}`, `${n(dashboard?.overview?.total_institutions)} ${scopeBuyers('all', true)}`), bundleLoading),
    '/aria': fig(typeof ariaStats?.tier_counts?.['1'] === 'number' ? L(`${n(ariaStats.tier_counts['1'])} en Nivel 1`, `${n(ariaStats.tier_counts['1'])} in Tier 1`) : null, bundleLoading),
    '/contracts': fig(n(dq.data?.analyzed_contracts) && L(`${n(dq.data?.analyzed_contracts)} contratos`, `${n(dq.data?.analyzed_contracts)} contracts`), dq.isLoading),
    '/methodology': L(`modelo ${CURRENT_MODEL_VERSION}`, `model ${CURRENT_MODEL_VERSION}`),
    '/datos': 'DOI · Zenodo',
    '/press': L('kit de prensa', 'press kit'),
    '/journalists': L(`${STORY_HEADLINES.length} historias`, `${STORY_HEADLINES.length} stories`),
    '/sectors': L(`${SECTORS.length} sectores`, `${SECTORS.length} sectors`),
  }

  const rowsOf = (g: Group): Array<{ href: string; key: string; numeral: string | null }> =>
    g === 'also'
      ? OFF_NAV.map((o) => ({ href: o.href, key: o.key, numeral: null }))
      : TOC.filter((e) => e.section === g).map((e: TocEntry) => ({ href: e.href, key: e.key, numeral: numeralOf(e) }))

  const rowCls =
    'group grid grid-cols-[2rem_auto_minmax(0.75rem,1fr)_auto] items-center gap-x-1.5 min-h-10 rounded-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1'

  const rowBody = (r: { key: string; href: string; numeral: string | null }, extra?: ReactNode) => (
    <>
      <span className="font-mono text-[12px] tabular-nums text-accent-text">{r.numeral ?? '·'}</span>
      <span className="text-[16px] leading-[1.25] whitespace-nowrap text-text-primary group-hover:text-accent-text group-hover:underline underline-offset-2 transition-colors" style={{ fontFamily: 'var(--font-family-editorial)' }}>
        {tn(`toc.${r.key}`)}{extra}
      </span>
      <span aria-hidden="true" className="self-end mb-[5px] border-b border-dotted border-border-hover max-md:self-center max-md:mb-0" />
      <span className="font-mono text-[12px] tabular-nums whitespace-nowrap text-text-muted">{figures[r.href] ?? ''}</span>
    </>
  )

  return (
    <nav aria-label={L('Índice del sitio', 'Site index')} className="mb-10 border-y border-border py-4">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-[12px] font-mono font-semibold uppercase tracking-[0.15em] text-text-muted">
          {L('Índice del sitio', 'Site index')}
        </h2>
        <span className="font-mono text-[12px] text-text-muted">
          {L('cada página, con una cifra en vivo', 'every page, with one live figure')}
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-[1.2fr_1fr_1fr] gap-x-6 gap-y-4">
        {COLUMNS.map((col, ci) => (
          <div key={ci} className="flex flex-col gap-4 min-w-0">
            {col.map((g) => (
              <section key={g} aria-labelledby={`site-index-${g}`}>
                <h3 id={`site-index-${g}`} className="mb-1 text-xs font-mono uppercase tracking-widest text-text-muted">
                  {g === 'also' ? L('También', 'Also') : tn(`sections.${g}`)}
                </h3>
                <ul>
                  {rowsOf(g).map((r) => (
                    <li key={r.href}>
                      {r.href === '/' ? (
                        <div aria-current="page" className={rowCls}>{rowBody(r)}</div>
                      ) : (
                        <Link to={r.href} className={`${rowCls} hover:bg-background-elevated`}>{rowBody(r)}</Link>
                      )}
                      {r.href === '/mapa' && (
                          <Link
                            to={cieloHref()}
                            className="group ml-[2rem] flex items-center gap-1 min-h-10 pl-2 rounded-sm font-mono text-[12px] text-text-secondary hover:text-accent-text transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1"
                          >
                            <span aria-hidden="true">↳</span> {tn('vista.cielo')}
                          </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        ))}
      </div>
    </nav>
  )
}
