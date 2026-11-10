/**
 * StoryNarrative — Individual story page.
 *
 * Renders a full investigative journalism piece from the static STORIES array.
 * Dark-mode immersive reading experience with scroll-driven animations,
 * chapter banners, data pullquotes, and inline prose stats.
 */

import { cieloHref } from '@/lib/vista'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useCaseCountLabels } from '@/hooks/useGroundTruthCount'
import { useEffect, useState, useCallback, lazy, Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { ArrowLeft, ExternalLink, Share2, ArrowRight, FileText } from 'lucide-react'
import { getStoryBySlug, getRelatedStories, localizeChapter, localizeStory } from '@/lib/story-content'
import type { StoryChapterDef, StoryChartLive, StoryDef, StoryStatus } from '@/lib/story-content'
import type { GapFigureKind } from '@/components/stories/live/GapFigures'
import type { EmergencyFigureKind } from '@/components/stories/live/EmergencyFigures'
import type { VoucherFigureKind } from '@/components/stories/live/VoucherFigures'
import type { CaptureFigureKind } from '@/components/stories/live/CaptureFigures'
import type { IntermediaryFigureKind } from '@/components/stories/live/IntermediaryFigures'
import type { GhostFigureKind } from '@/components/stories/live/GhostFigures'
import type { ThresholdFigureKind } from '@/components/stories/live/ThresholdFigures'
import type { CompetitionFigureKind } from '@/components/stories/live/CompetitionFigures'
import type { DirectAwardFigureKind } from '@/components/stories/live/DirectAwardFigures'
import type { EraFigureKind } from '@/components/stories/live/EraFigures'
import { StickyStepFrame } from '@/components/stories/live/StickyStepFigure'
import { useProseStage } from '@/components/stories/live/useProseStage'
import { findStoryByLongformSlug } from '@/lib/atlas-stories'
import ChapterBanner from '@/components/stories/ChapterBanner'
import DataPullquote, { type PullquoteRole } from '@/components/stories/DataPullquote'
import { StoryCard } from '@/components/stories/StoryCard'
import { ScrollReveal, AnimatedNumber } from '@/components/ui/Reveal'
import { staggerContainer } from '@/lib/motion'
import { cn, localizeAmount } from '@/lib/utils'
import { glueDashes } from '@/lib/typography'
import {
  InlineDotGrid,
  InlineBarChart,
  InlineLineChart,
  InlineAreaChart,
  InlineSpikeChart,
  InlineDivergingBar,
  InlineMultiLine,
  InlineNetwork,
  InlineStackedBar,
  InlineRoster,
  InlineTimeline,
  ThresholdDistribution as EditorialThreshold,
  AnnotatedThermometer as EditorialThermometer,
  ClevelandPairChart as EditorialClevelandPair,
} from '@/components/stories/InlineCharts'
import VendorPriceTrajectory from '@/components/stories/VendorPriceTrajectory'
import VennConvergence from '@/components/stories/VennConvergence'
import type { StoryInlineChartData } from '@/lib/story-content'
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import { DotBar } from '@/components/ui/DotBar'
import { RISK_COLORS, RISK_TEXT_COLORS, getRiskLevelFromScore, SECTORS, CATEGORICAL, CATEGORICAL_TEXT } from '@/lib/constants'
import { DocHead } from '@/components/contrato/DocHead'
import { Cover } from '@/components/contrato/Cover'
import '@/components/stories/story.css'
import { storyInk } from '@/components/stories/storyInk'
import { useIsMobile } from '@/hooks/useIsMobile'

// ---------------------------------------------------------------------------
// Inline chart map — type string → component
// ---------------------------------------------------------------------------

type InlineChartComponent = React.ComponentType<{ data: StoryInlineChartData; title: string; lang?: 'en' | 'es' }>

const INLINE_CHART_MAP: Record<string, InlineChartComponent> = {
  'inline-dot-grid': InlineDotGrid,
  'inline-bar': InlineBarChart,
  'inline-line': InlineLineChart,
  'inline-area': InlineAreaChart,
  'inline-spike': InlineSpikeChart,
  'inline-diverging': InlineDivergingBar,
  'inline-roster': InlineRoster,
  'inline-timeline': InlineTimeline,
  'editorial-threshold':      EditorialThreshold,
  'editorial-thermometer':    EditorialThermometer,
  'editorial-cleveland-pair': EditorialClevelandPair,
}

// ---------------------------------------------------------------------------
// Live figures — API-backed plates (STORY_DAYS principle 2).
//
// One lazy chunk PER STORY, not per figure: a story's figures always render on
// the same page and share their queries, so a chunk each would be N requests
// for one page. A chunk is only fetched by a story that declares a `live` kind
// from its family — an `el-vacio` reader never downloads SD-02's figures.
// ---------------------------------------------------------------------------

const LiveGapFigure = lazy(() => import('@/components/stories/live/GapFigures'))
const LiveEmergencyFigure = lazy(() => import('@/components/stories/live/EmergencyFigures'))
const LiveVoucherFigure = lazy(() => import('@/components/stories/live/VoucherFigures'))
const LiveCaptureFigure = lazy(() => import('@/components/stories/live/CaptureFigures'))
const LiveIntermediaryFigure = lazy(() => import('@/components/stories/live/IntermediaryFigures'))
const LiveGhostFigure = lazy(() => import('@/components/stories/live/GhostFigures'))
const LiveThresholdFigure = lazy(() => import('@/components/stories/live/ThresholdFigures'))
const LiveCompetitionFigure = lazy(() => import('@/components/stories/live/CompetitionFigures'))
const LiveDirectAwardFigure = lazy(() => import('@/components/stories/live/DirectAwardFigures'))
const LiveEraFigure = lazy(() => import('@/components/stories/live/EraFigures'))
// A story whose whole body is one interactive component (StoryDef.component)
const Relevo2018 = lazy(() => import('@/components/stories/relevo2018/Relevo2018'))

/** Route a `chartConfig.live` kind to the story family that owns it. */
function LiveFigure({
  kind,
  lang,
  stage,
}: {
  kind: NonNullable<StoryChartLive>
  lang: 'en' | 'es'
  stage?: number
}) {
  if (kind.startsWith('covid-')) {
    return <LiveEmergencyFigure kind={kind as EmergencyFigureKind} lang={lang} stage={stage} />
  }
  if (kind.startsWith('vales-')) {
    return <LiveVoucherFigure kind={kind as VoucherFigureKind} lang={lang} stage={stage} />
  }
  if (kind.startsWith('capture-')) {
    return <LiveCaptureFigure kind={kind as CaptureFigureKind} lang={lang} stage={stage} />
  }
  if (kind.startsWith('p3-')) {
    return <LiveIntermediaryFigure kind={kind as IntermediaryFigureKind} lang={lang} stage={stage} />
  }
  if (kind.startsWith('p2-')) {
    return <LiveGhostFigure kind={kind as GhostFigureKind} lang={lang} stage={stage} />
  }
  if (kind.startsWith('threshold-')) {
    return <LiveThresholdFigure kind={kind as ThresholdFigureKind} lang={lang} stage={stage} />
  }
  if (kind.startsWith('sb-')) {
    return <LiveCompetitionFigure kind={kind as CompetitionFigureKind} lang={lang} stage={stage} />
  }
  if (kind.startsWith('da-')) {
    return <LiveDirectAwardFigure kind={kind as DirectAwardFigureKind} lang={lang} stage={stage} />
  }
  if (kind.startsWith('era-')) {
    return <LiveEraFigure kind={kind as EraFigureKind} lang={lang} stage={stage} />
  }
  return <LiveGapFigure kind={kind as GapFigureKind} lang={lang} stage={stage} />
}

/** Suspense fallback — holds the ChartCard's shape while the chunk loads. */
function LiveFigureSkeleton({ lang }: { lang: 'en' | 'es' }) {
  return (
    <div
      role="status"
      aria-label={lang === 'es' ? 'Cargando la figura en vivo' : 'Loading the live figure'}
      className="w-full h-[320px] my-8 bg-background-card motion-safe:animate-pulse"
      style={{
        border: '1px solid var(--color-border)',
        borderLeft: '3px solid var(--color-accent)',
        borderRadius: 2,
      }}
    />
  )
}

// ---------------------------------------------------------------------------
// Outlet-level accent colors
// ---------------------------------------------------------------------------

// DESIGN.md §6.3: story-type accents come from the one categorical set by
// index; red and amber are reserved for severity, so no outlet wears them.
const OUTLET_ACCENT: Record<string, string> = {
  longform: CATEGORICAL[0],
  investigative: CATEGORICAL[6],
  data_analysis: CATEGORICAL[1],
  rubli: CATEGORICAL[2],
}

// Text-safe twins for small type set in the outlet accent (weekend D2: the
// investigative ochre read 2.51:1 as 12–13px labels). Fills, rules, borders and
// display numerals keep OUTLET_ACCENT; anything else passes through.
const outletInk = (accent: string): string => {
  const i = (CATEGORICAL as readonly string[]).indexOf(accent)
  return i >= 0 ? CATEGORICAL_TEXT[i] : accent
}

function getEraLabel(era: string, t: ReturnType<typeof useTranslation>['t']): string {
  const map: Record<string, string> = {
    fox: t('era.fox', 'Fox (2000-2006)'),
    calderon: t('era.calderon', 'Calderón (2006-2012)'),
    pena: t('era.pena', 'Peña Nieto (2012-2018)'),
    amlo: t('era.amlo', 'López Obrador (2018-2024)'),
    sheinbaum: t('era.sheinbaum', 'Sheinbaum (2024-)'),
    cross: t('era.cross', 'Multi-administration'),
  }
  return map[era] || era
}

// i18n outlet labels are stored in capitals; the template never sets uppercase (DESIGN.md §2)
const sentenceCase = (v: string): string => (v === v.toUpperCase() ? v.charAt(0) + v.slice(1).toLowerCase() : v)

function getTypeLabel(type: string, t: ReturnType<typeof useTranslation>['t']): string {
  const map: Record<string, string> = {
    era: t('storyType.era', 'Era Analysis'),
    case: t('storyType.case', 'Investigation Case'),
    thematic: t('storyType.thematic', 'Thematic Investigation'),
    year: t('storyType.year', 'Annual Analysis'),
  }
  return map[type] || type
}

// ---------------------------------------------------------------------------
// Parse lead stat for animated counter
// ---------------------------------------------------------------------------

function parseLeadStat(value: string): { numeric: number; prefix: string; suffix: string; decimals: number } | null {
  const match = value.match(/^([^0-9]*)([0-9][0-9,]*\.?[0-9]*)(.*)$/)
  if (!match) return null
  const prefix = match[1]
  const numStr = match[2].replace(/,/g, '')
  const suffix = match[3]
  const numeric = parseFloat(numStr)
  if (isNaN(numeric)) return null
  const dotIdx = numStr.indexOf('.')
  const decimals = dotIdx >= 0 ? numStr.length - dotIdx - 1 : 0
  return { numeric, prefix, suffix, decimals }
}

// ---------------------------------------------------------------------------
// Chapter sources — collapsible citation footnote
// ---------------------------------------------------------------------------

function ChapterSources({ sources, chapterId }: { sources: string[]; chapterId: string }) {
  const [open, setOpen] = useState(false)
  const { t } = useTranslation('common')
  // aria-controls names the list the toggle opens; without it a screen-reader
  // user hears "expanded" with no way to know what expanded.
  const listId = `sources-${chapterId}`
  return (
    <div className="mt-6">
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 min-h-11 sm:min-h-6 text-xs text-text-muted hover:text-text-secondary transition-colors group"
        aria-expanded={open}
        aria-controls={listId}
      >
        <FileText className="h-3 w-3 group-hover:text-text-secondary" aria-hidden="true" />
        <span className="font-mono">{open ? '−' : '+'}</span>
        <span>{t('story.sources', { count: sources.length })}</span>
        <span className="text-text-primary">&mdash; {open ? t('story.collapse') : t('story.viewCitations')}</span>
      </button>
      {open && (
        <ol id={listId} className="mt-3 space-y-1.5 border-l-2 border-border pl-4">
          {sources.map((s, i) => (
            <li key={i} className="text-[13px] text-text-muted font-serif leading-relaxed">
              <span className="text-text-primary mr-2 select-none">[{i + 1}]</span>
              {/* A citation's URL becomes a link (el-modelo-bienestar § 5 cites ASF PDFs). */}
              {s.split(/(https?:\/\/\S+)/).map((part, j) =>
                j % 2 ? (
                  <a key={j} href={part} target="_blank" rel="noopener noreferrer" className="underline break-all hover:text-text-secondary">
                    {part}
                  </a>
                ) : (
                  part
                ),
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Chapter section — variant-aware layouts (news-website style hierarchy).
//
// Same chapter data renders differently depending on which variant the picker
// chooses. This breaks the monotonous "every chapter is a 65ch box" rhythm
// that made /stories feel like a blog post instead of a magazine spread.
// ---------------------------------------------------------------------------

type ChapterVariant =
  | 'hero'              // first chapter: full-width, oversized, drop cap, gradient backdrop
  | 'feature'           // rich chapter: wider, asymmetric pullquote breakout
  | 'data-spotlight'    // chart-driven: chart breaks out wider than text
  | 'quote-spotlight'   // quote-driven: massive Playfair italic
  | 'connective'        // short transitional: narrow column, brief
  | 'closing'           // final chapter: generous closing thesis
  | 'standard'          // default rhythm

function pickChapterVariant(
  chapter: StoryChapterDef,
  index: number,
  total: number,
): ChapterVariant {
  if (index === 0) return 'hero'
  if (index === total - 1) return 'closing'
  const proseLen = chapter.prose?.length ?? 0
  // A live figure added to an existing chapter must not re-flow it: the layout
  // a chapter was authored into is part of the story's rhythm, and SD-01 adds
  // live plates to chapters that were laid out before the plates existed. Only
  // a typed chart — the shape the variants were tuned against — moves a
  // chapter between variants.
  const hasChart = !!chapter.chartConfig && chapter.chartConfig.type !== 'live'
  const hasQuote = !!chapter.pullquote
  // Chapter centered on chart (brief text + chart, no quote)
  if (hasChart && !hasQuote && proseLen <= 2) return 'data-spotlight'
  // Chapter centered on quote (brief text + quote, no chart)
  if (hasQuote && !hasChart && proseLen <= 2) return 'quote-spotlight'
  // Short transitional chapter
  if (!hasChart && !hasQuote && proseLen === 1) return 'connective'
  // Rich content chapter
  if (hasChart && hasQuote && proseLen >= 2) return 'feature'
  return 'standard'
}

// ── Render helpers (shared across variants) ───────────────────────────────

/** The typed inline figure only — `renderChartBlock` adds the live one around it. */
function renderTypedChartBlock(
  chapter: StoryChapterDef,
  className = 'my-8',
  lang: 'en' | 'es' = 'en',
) {
  if (!chapter.chartConfig) return null
  const cfg = chapter.chartConfig
  if (cfg.type === 'live') return null
  // Multi-series and network charts have their own data shapes — dispatch
  // before the InlineChartMap which only handles StoryInlineChartData.
  // Both the title and `lang` go through: these three branches used to pass
  // the English title and, for multi-line and network, no language at all, so
  // a Spanish reader got English chart titles, axis labels and annotations on
  // charts whose renderers already had the Spanish strings.
  const chartTitle = lang === 'es' ? (cfg.title_es ?? cfg.title) : cfg.title
  if (cfg.type === 'inline-multi-line' && cfg.multiSeries) {
    return (
      <ScrollReveal className={className}>
        <InlineMultiLine data={cfg.multiSeries} title={chartTitle} lang={lang} />
      </ScrollReveal>
    )
  }
  if (cfg.type === 'inline-network' && cfg.network) {
    return (
      <ScrollReveal className={className}>
        <InlineNetwork data={cfg.network} title={chartTitle} lang={lang} />
      </ScrollReveal>
    )
  }
  if (cfg.type === 'inline-stacked-bar' && cfg.stacked) {
    return (
      <ScrollReveal className={className}>
        <InlineStackedBar data={cfg.stacked} title={chartTitle} lang={lang} />
      </ScrollReveal>
    )
  }
  // Volatilidad story — two self-contained illustrative charts that carry no
  // data payload in story-content.ts. They used to resolve through the lazy
  // CHART_REGISTRY, which rendered them prop-less and so pinned them to their
  // Spanish default on the English page; dispatching here passes `lang`.
  if (cfg.type === 'vendor-price-trajectory') {
    return (
      <ScrollReveal className={className}>
        <VendorPriceTrajectory lang={lang} />
      </ScrollReveal>
    )
  }
  if (cfg.type === 'venn-convergence') {
    return (
      <ScrollReveal className={className}>
        <VennConvergence lang={lang} />
      </ScrollReveal>
    )
  }
  if (cfg.data) {
    const InlineChart = INLINE_CHART_MAP[cfg.type]
    return (
      <ScrollReveal className={className}>
        {InlineChart ? (
          <InlineChart data={cfg.data} title={lang === 'es' ? (cfg.title_es ?? cfg.title) : cfg.title} lang={lang} />
        ) : (
          <div
            className="bg-background-card rounded-sm p-6 text-text-muted text-sm text-center"
            role="img"
            aria-label={cfg.title}
          >
            {cfg.title}
          </div>
        )}
      </ScrollReveal>
    )
  }
  // No inline renderer matched — keep the labelled placeholder so the chapter
  // still announces the figure it was meant to carry.
  return (
    <ScrollReveal className={className}>
      <div
        className="bg-background-card rounded-sm p-6 text-text-muted text-sm text-center"
        role="img"
        aria-label={cfg.title}
      >
        {cfg.title}
      </div>
    </ScrollReveal>
  )
}

/**
 * A chapter's figures: up to two live plates (`chartConfig.live` and `live2`)
 * and the typed inline chart (when `chartConfig.data` is set). A chapter may
 * carry all three — SD-01 ch3 opens with its typed procedure bar and closes
 * with the live exception catalog (`liveAfter`), while SD-02 ch2 and ch3 each
 * carry two live figures and no typed one.
 *
 * `live2` always renders last: it is the chapter's second exhibit, so it reads
 * after both the first plate and whatever typed figure sits between them.
 */
function renderChartBlock(
  chapter: StoryChapterDef,
  className = 'my-8',
  lang: 'en' | 'es' = 'en',
  stage?: number,
  /**
   * `primary` is the first live plate alone — what a scrolly chapter pins in
   * its sticky frame; `secondary` is everything that follows it, rendered in
   * normal flow below the prose. Omitted, the chapter renders all of it.
   */
  only?: 'primary' | 'secondary',
) {
  const cfg = chapter.chartConfig
  if (!cfg) return null
  const plate = (kind: NonNullable<StoryChartLive>, withStage: boolean) => (
    <ScrollReveal key={kind} className={className}>
      <Suspense fallback={<LiveFigureSkeleton lang={lang} />}>
        <LiveFigure kind={kind} lang={lang} stage={withStage ? stage : undefined} />
      </Suspense>
    </ScrollReveal>
  )
  const live = cfg.live ? plate(cfg.live, true) : null
  if (only === 'primary') return live
  const typed = renderTypedChartBlock(chapter, className, lang)
  const second = cfg.live2 ? plate(cfg.live2, false) : null
  if (only === 'secondary') return second
  if (!live) return typed
  if (!typed && !second) return live
  return (
    <>
      {cfg.liveAfter ? typed : live}
      {cfg.liveAfter ? live : typed}
      {second}
    </>
  )
}

// Derive the pull-quote role from the chapter variant + content shape, so a
// story that shows several figures never stamps the same box twice in a row.
function pickPullquoteRole(
  pq: NonNullable<StoryChapterDef['pullquote']>,
  variant: ChapterVariant,
  isFirst: boolean,
): PullquoteRole {
  if (pq.role) return pq.role
  if (variant === 'closing') return 'verdict'
  if (pq.barValue !== undefined) return 'plate'
  if (variant === 'hero' || (variant === 'feature' && isFirst)) return 'ledger'
  return 'margin'
}

function renderPullquote(
  chapter: StoryChapterDef,
  story: StoryDef,
  className = '',
  isFirst = false,
  variant: ChapterVariant = 'standard',
) {
  if (!chapter.pullquote) return null
  const role = pickPullquoteRole(chapter.pullquote, variant, isFirst)
  return (
    <div className={className}>
      <DataPullquote
        quote={chapter.pullquote.quote}
        stat={chapter.pullquote.stat}
        statLabel={chapter.pullquote.statLabel}
        barValue={chapter.pullquote.barValue}
        barLabel={chapter.pullquote.barLabel}
        barLabel_es={chapter.pullquote.barLabel_es}
        outlet={story.outlet}
        statColor={story.leadStat.color}
        vizTemplate={chapter.pullquote.vizTemplate}
        role={role}
      />
    </div>
  )
}

// ── AtlasLink — CTA that opens /atlas with prefilled state matching the
//   story chapter. Lets readers jump from a story chapter to the live
//   constellation showing the same pattern/year/cluster. ───────────────

function AtlasLink({
  accentColor,
  lens,
  year,
  pin,
  caption,
  lang,
}: {
  accentColor: string
  lens?: 'patterns' | 'sectors' | 'categories' | 'sexenios'
  year?: number
  pin?: string
  caption: { en: string; es: string }
  lang: 'en' | 'es'
}) {
  const params = new URLSearchParams()
  if (lens) params.set('lens', lens)
  if (year) params.set('year', String(year))
  if (pin) params.set('pin', pin)
  const href = cieloHref(params.toString())
  return (
    <ScrollReveal className="my-8">
      <Link
        to={href}
        className="st-cta"
      >
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div
              className="text-[12px] font-mono font-bold ct-sc mb-1.5"
              style={{ color: outletInk(accentColor) }}
            >
              {lang === 'en' ? 'See the connections' : 'Ver los vínculos'}
            </div>
            <p className="text-[13px] text-text-primary leading-[1.55]">
              {caption[lang]}
            </p>
          </div>
          <ArrowRight className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
        </div>
      </Link>
    </ScrollReveal>
  )
}

// ── ObservatoryTrailerCTA — surfaces the matching atlas-tour for stories
//   that have one. Renders inside Act III so the reader, having finished
//   the analytical article, can opt into the 55-second visual trailer of
//   the same investigation. Hidden when no atlas tour is paired. ────────

function ObservatoryTrailerCTA({ longformSlug, lang }: { longformSlug: string; lang: 'en' | 'es' }) {
  const tour = findStoryByLongformSlug(longformSlug)
  if (!tour) return null
  const href = cieloHref({ story: tour.id })
  const headline = lang === 'en'
    ? "Watch this investigation in the Map's connections"
    : 'Mira esta investigación en los vínculos de El Mapa'
  const body = lang === 'en'
    ? `${tour.duration} · ${tour.chapters.length} chapters · the visual trailer for the article you just read.`
    : `${tour.duration} · ${tour.chapters.length} capítulos · el tráiler visual del artículo que acabas de leer.`
  return (
    <ScrollReveal className="my-2">
      <Link
        to={href}
        className="st-cta"
      >
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div
              className="text-[12px] font-mono font-bold ct-sc mb-1.5"
              style={{ color: 'var(--color-text-muted)' }}
            >
              {lang === 'en' ? 'Connections tour' : 'Recorrido por los vínculos'}
            </div>
            <h4 className="text-[17px] font-semibold text-text-primary leading-[1.3] mb-1">
              {headline}
            </h4>
            <p className="text-[12px] font-serif text-text-muted leading-[1.5]">
              {body}
            </p>
          </div>
          <ArrowRight className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
        </div>
      </Link>
    </ScrollReveal>
  )
}

// ── Decorative chapter divider (sits between chapters) ────────────────────

// Sexenio era strip — the chapter divider on "el-sexenio-del-riesgo": a
// neutral five-term timeline at proportional widths (years of coverage).
const SEXENIO_ERA_STRIP_STORY_SLUG = 'el-sexenio-del-riesgo'

function ChapterDivider({
  accentColor,
  storySlug,
}: {
  accentColor: string
  storySlug?: string
}) {
  const { i18n } = useTranslation('common')
  const isEs = i18n.language.startsWith('es')

  if (storySlug === SEXENIO_ERA_STRIP_STORY_SLUG) {
    // Five terms · width proportional to years of register coverage · one
    // neutral tone, no highlighted term and no per-term rate (Neutrality
    // standard §5 rules 2–3: the high-risk ordering flips once labelled
    // contracts are excluded, so it is not chrome material).
    const eras: Array<{ code: string; label: string; years: string; span: number }> = [
      { code: 'fox',       label: 'Fox',       years: '02–06', span: 5 },
      { code: 'calderon',  label: 'Calderón',  years: '07–12', span: 6 },
      { code: 'pena',      label: 'Peña',      years: '13–18', span: 6 },
      { code: 'amlo',      label: 'AMLO',      years: '19–24', span: 6 },
      { code: 'sheinbaum', label: 'Sheinbaum', years: isEs ? '25 (parcial)' : '25 (partial)', span: 1 },
    ]
    const totalSpan = eras.reduce((s, e) => s + e.span, 0)
    return (
      <div className="my-6 st-fig" aria-hidden="true">
        <div className="flex items-center justify-between mb-1.5">
          <span
            className="text-[13px] font-mono ct-sc"
            style={{ color: outletInk(accentColor) }}
          >
            {isEs ? 'Cinco sexenios en el registro' : 'Five terms in the register'}
          </span>
          <span className="text-[13px] font-mono ct-sc text-text-muted">
            {isEs ? '2002 – sep 2025' : '2002 – Sep 2025'}
          </span>
        </div>

        {/* Era segments */}
        <div className="flex w-full gap-0.5 h-2.5">
          {eras.map((e) => (
            <div
              key={e.code}
              className="h-full rounded-sm"
              style={{ flexBasis: `${(e.span / totalSpan) * 100}%`, background: 'var(--color-text-muted)', opacity: 0.45 }}
            />
          ))}
        </div>

        {/* Labels under each segment */}
        <div className="flex w-full gap-0.5 mt-1.5">
          {eras.map((e) => (
            <div
              key={e.code}
              className="flex flex-col items-center min-w-0"
              style={{ flexBasis: `${(e.span / totalSpan) * 100}%` }}
            >
              <span className="text-[12px] font-mono ct-sc text-text-muted">
                {e.label}
              </span>
              <span className="text-[13px] font-mono text-text-muted/70 whitespace-nowrap">
                {e.years}
              </span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="st-divider" aria-hidden="true" />
  )
}

// ── Variant: HERO (chapter 1) ─────────────────────────────────

/** Both stepped figures shipped so far draw in four beats (0–3). */
const STEP_MAX_STAGE = 3

function HeroChapter({ chapter, story, accentColor }: ChapterRenderProps) {
  const { t, i18n } = useTranslation('common')
  const lang: 'en' | 'es' = i18n.language.startsWith('es') ? 'es' : 'en'
  const paddedNumber = String(chapter.number).padStart(2, '0')
  // SD-01 F1 — the blackout diagram is drawn in beats as the hero's prose
  // scrolls past it. Every other hero keeps the figure-below-prose flow.
  const isScrolly = chapter.chartConfig?.scrolly === true
  const narrow = useIsMobile(1023)
  const { stage, register } = useProseStage(
    chapter.prose.length,
    isScrolly && !narrow,
    STEP_MAX_STAGE,
  )
  // A scrolly chapter pinned its first plate above the prose; what is left for
  // the figure column below is only its second exhibit, which may be nothing.
  const belowProse = renderChartBlock(chapter, '', lang, undefined, isScrolly ? 'secondary' : undefined)
  return (
    <section
      id={`chapter-${chapter.id}`}
      aria-label={`${t('storyType.chapter', 'Chapter')} ${chapter.number}: ${chapter.title}`}
      className="mb-8 relative"
    >
      <ScrollReveal>
        <div className="st-read pt-6 pb-2 relative">
          {/* Top eyebrow */}
          <p
            className="text-[13px] ct-sc font-bold mb-4"
            style={{ color: outletInk(accentColor) }}
          >
            {t('storyType.chapter', 'Chapter')} {paddedNumber}
            {story.era && (
              <>
                <span className="mx-2 opacity-50">·</span>
                <span className="text-text-muted">{getEraLabel(story.era, t)}</span>
              </>
            )}
          </p>

          {/* Massive editorial title */}
          <h2
            className="st-h2-open text-text-primary mb-4 text-balance"
          >
            {chapter.title}
          </h2>

          {chapter.subtitle && (
            <p className="text-[17px] text-text-secondary leading-[1.6] text-pretty">
              {chapter.subtitle}
            </p>
          )}
        </div>
      </ScrollReveal>

      {/* The scrolly puts the figure ABOVE the prose and sticks it there, so
          the two share one positioning context; every other hero keeps the
          figure-after-prose flow. */}
      <div className={isScrolly ? 'relative' : undefined}>
        {isScrolly && (
          <StickyStepFrame stage={stage}>
            {renderChartBlock(chapter, '', lang, stage, 'primary')}
          </StickyStepFrame>
        )}

        {/* Lede paragraph with drop cap + remaining body */}
        <div className="st-read">
          {chapter.prose.map((paragraph, i) => (
            <ScrollReveal key={i} staggerIndex={i}>
              <p
                ref={isScrolly ? (el) => register(el, i) : undefined}
                className={cn(
                  'text-text-primary leading-[1.75] mb-6',
                  i === 0 ? 'text-[17px] hero-dropcap' : 'text-[17px] text-text-secondary',
                )}
                style={i === 0 ? { '--dropcap-color': accentColor } as React.CSSProperties : undefined}
              >
                {paragraph}
              </p>
            </ScrollReveal>
          ))}

          {chapter.sources && chapter.sources.length > 0 && (
            <ChapterSources sources={chapter.sources} chapterId={chapter.id} />
          )}

          {/* Hero stat callout — if pullquote exists, render it as a hero-sized
              breakout below the lede. */}
          {chapter.pullquote && (
            renderPullquote(chapter, story, '', false, 'hero')
          )}
        </div>
      </div>

      {/* Chart, if any — its own 760 figure column, centered on the same axis
          as the 640 text above it. Was a negative-margin bleed out of the
          prose div, which made the hero the one chapter whose figure width
          depended on the text column instead of the frame. */}
      {belowProse && (
        <div className="st-fig">{belowProse}</div>
      )}
    </section>
  )
}

// ── Variant: FEATURE (rich content chapter) ───────────────────────────────

function FeatureChapter({ chapter, story, accentColor, isFirst = false }: ChapterRenderProps) {
  const { t, i18n } = useTranslation('common')
  const lang: 'en' | 'es' = i18n.language.startsWith('es') ? 'es' : 'en'
  return (
    <section
      id={`chapter-${chapter.id}`}
      aria-label={`${t('storyType.chapter', 'Chapter')} ${chapter.number}: ${chapter.title}`}
      className="mb-8"
    >
      <ChapterBanner
        number={chapter.number}
        title={chapter.title}
        subtitle={chapter.subtitle}
        era={story.era ? getEraLabel(story.era, t) : undefined}
        color={accentColor}
        ink={outletInk(accentColor)}
      />

      {/* Single measure. The old 12-column grid put feature prose 145px left
          of every other chapter's text; a 640 column inside that grid would
          leave the aside 129px wide, so the aside is gone and the pullquote
          runs in flow below the prose — same axis, same measure. */}
      <div className="st-read">
        {chapter.prose.map((paragraph, i) => {
          const sourceCount = chapter.sources?.length ?? 0
          // Paragraph N → source ref [N] when chapter has at least that
          // many citations. Falls back silently when sources are absent.
          const refs = chapter.sourceRefs
            ? (chapter.sourceRefs[i] ?? [])
            : sourceCount > 0 ? [Math.min(i + 1, sourceCount)] : []
          return (
            <ScrollReveal key={i} staggerIndex={i}>
              <p
                className={cn(
                  'text-text-primary leading-[1.75] mb-5 text-[17px]',
                  i === 0 && 'feature-dropcap',
                )}
                style={i === 0 ? { '--dropcap-color': accentColor } as React.CSSProperties : undefined}
              >
                {paragraph}
                {refs.length > 0 && (
                  <sup className="font-mono text-text-muted text-[12px] ml-0.5 align-super tabular-nums">
                    {refs.map((r) => `[${r}]`).join('')}
                  </sup>
                )}
              </p>
            </ScrollReveal>
          )
        })}
        {chapter.sources && chapter.sources.length > 0 && (
          <ChapterSources sources={chapter.sources} chapterId={chapter.id} />
        )}
      </div>

      {/* Pullquote in flow on the text axis — the 'feature' role (and the
          'ledger' variant the first feature chapter gets) is unchanged; only
          the sticky sidebar it used to sit in is gone. */}
      {chapter.pullquote && (
        <div className="st-read">
          {renderPullquote(chapter, story, '', isFirst, 'feature')}
        </div>
      )}

      {/* Chart in the 760 figure box — 60px of overhang each side of the text */}
      {chapter.chartConfig && (
        <div className="st-fig">
          {renderChartBlock(chapter, '', lang)}
        </div>
      )}
    </section>
  )
}

// ── Variant: DATA-SPOTLIGHT (chart-driven chapter) ────────────────────────

function DataSpotlightChapter({ chapter, story, accentColor, isFirst = false }: ChapterRenderProps) {
  const { t, i18n } = useTranslation('common')
  const lang: 'en' | 'es' = i18n.language.startsWith('es') ? 'es' : 'en'
  return (
    <section
      id={`chapter-${chapter.id}`}
      aria-label={`${t('storyType.chapter', 'Chapter')} ${chapter.number}: ${chapter.title}`}
      className="mb-8"
    >
      <ChapterBanner
        number={chapter.number}
        title={chapter.title}
        subtitle={chapter.subtitle}
        era={story.era ? getEraLabel(story.era, t) : undefined}
        color={accentColor}
        ink={outletInk(accentColor)}
      />

      {/* Brief lede in normal column */}
      <div className="st-read mb-8">
        {chapter.prose.map((paragraph, i) => (
          <ScrollReveal key={i} staggerIndex={i}>
            <p
              className={cn(
                'text-text-primary leading-[1.75] mb-5 text-[17px]',
                i === 0 && 'feature-dropcap',
              )}
              style={i === 0 ? { '--dropcap-color': accentColor } as React.CSSProperties : undefined}
            >
              {paragraph}
            </p>
          </ScrollReveal>
        ))}
        {chapter.sources && chapter.sources.length > 0 && (
          <ChapterSources sources={chapter.sources} chapterId={chapter.id} />
        )}
      </div>

      {/* Chart breakout — the 760 figure box at axis−60. The gradient frame IS
          the box; the chart inside it sits within the frame's own padding. */}
      <div className="st-fig">
        <ScrollReveal>
          <div className="st-figrule">
            {renderChartBlock(chapter, '', lang)}
          </div>
        </ScrollReveal>
      </div>

      {/* Optional pullquote at bottom */}
      {chapter.pullquote && (
        <div className="st-read">
          {renderPullquote(chapter, story, '', isFirst, 'data-spotlight')}
        </div>
      )}

      {/* Connect to live Atlas — readers can manipulate the data themselves */}
      <div className="st-read">
        <AtlasLink
          accentColor={accentColor}
          lens="patterns"
          lang={lang}
          caption={{
            en: 'Explore this chart\'s data live in The Atlas — toggle lenses, scrub years.',
            es: 'Explora los datos de este gráfico en vivo en El Atlas — alterna lentes, desplaza años.',
          }}
        />
      </div>
    </section>
  )
}

// ── Variant: QUOTE-SPOTLIGHT (quote-driven chapter) ───────────────────────

function QuoteSpotlightChapter({ chapter, story, accentColor }: ChapterRenderProps) {
  const { t } = useTranslation('common')
  return (
    <section
      id={`chapter-${chapter.id}`}
      aria-label={`${t('storyType.chapter', 'Chapter')} ${chapter.number}: ${chapter.title}`}
      className="mb-8"
    >
      <ChapterBanner
        number={chapter.number}
        title={chapter.title}
        subtitle={chapter.subtitle}
        era={story.era ? getEraLabel(story.era, t) : undefined}
        color={accentColor}
        ink={outletInk(accentColor)}
      />

      {/* Brief context */}
      <div className="st-read mb-8">
        {chapter.prose.map((paragraph, i) => (
          <ScrollReveal key={i} staggerIndex={i}>
            <p className="text-text-primary leading-[1.75] mb-5 text-[17px]">
              {paragraph}
            </p>
          </ScrollReveal>
        ))}
      </div>

      {/* The quote at h2-to-fig scale — wider breakout */}
      {chapter.pullquote && (
        <ScrollReveal>
          <figure
            className="st-fig my-8"
            aria-label={t('storyType.pullquote', 'Pull quote')}
          >
            <div
              className="relative pl-6 pr-4 py-4"
              style={{ borderLeft: `3px solid ${accentColor}` }}
            >
              <blockquote
                className="text-[22px] md:text-[28px] leading-[1.25] font-medium text-text-primary text-balance"
              >
                {chapter.pullquote.quote}
              </blockquote>
              {chapter.pullquote.stat && (
                <div className="mt-6 pt-4 border-t border-border/60 flex items-baseline gap-4">
                  <div
                    className="font-semibold tabular-nums leading-none flex-shrink-0"
                    style={{
                      fontFamily: "var(--font-serif)",
                      color: accentColor,
                      fontSize: 28,
                    }}
                  >
                    {chapter.pullquote.stat}
                  </div>
                  {chapter.pullquote.statLabel && (
                    <p className="text-sm text-text-muted leading-[1.5]">
                      {chapter.pullquote.statLabel}
                    </p>
                  )}
                </div>
              )}
            </div>
          </figure>
        </ScrollReveal>
      )}

      {/* Source citations remain available */}
      {chapter.sources && chapter.sources.length > 0 && (
        <div className="st-read">
          <ChapterSources sources={chapter.sources} chapterId={chapter.id} />
        </div>
      )}
    </section>
  )
}

// ── Variant: CONNECTIVE (short transitional chapter) ──────────────────────

function ConnectiveChapter({ chapter, story, accentColor }: ChapterRenderProps) {
  const { t } = useTranslation('common')
  return (
    <section
      id={`chapter-${chapter.id}`}
      aria-label={`${t('storyType.chapter', 'Chapter')} ${chapter.number}: ${chapter.title}`}
      className="mb-8"
    >
      {/* Smaller chapter marker, no big banner */}
      <div className="st-read mb-6">
        <ScrollReveal>
          <div className="flex items-baseline gap-3 mb-2">
            <span
              className="text-[12px] ct-sc font-bold"
              style={{ color: outletInk(accentColor) }}
            >
              {t('storyType.chapter', 'Chapter')} {String(chapter.number).padStart(2, '0')}
            </span>
            {story.era && (
              <span className="text-[12px] text-text-muted">
                · {getEraLabel(story.era, t)}
              </span>
            )}
          </div>
          <h2
            className="text-[22px] leading-[1.25] font-semibold text-text-primary mb-4 text-balance"
          >
            {chapter.title}
          </h2>
        </ScrollReveal>
      </div>

      {/* Narrow column for connective tissue */}
      <div className="st-read">
        {chapter.prose.map((paragraph, i) => (
          <ScrollReveal key={i} staggerIndex={i}>
            <p className="text-text-secondary leading-[1.75] mb-5 text-[17px]">
              {paragraph}
            </p>
          </ScrollReveal>
        ))}
        {chapter.sources && chapter.sources.length > 0 && (
          <ChapterSources sources={chapter.sources} chapterId={chapter.id} />
        )}
      </div>
    </section>
  )
}

// ── Variant: CLOSING (final chapter) ──────────────────────────────────────

// ── ClosingCoda — the charter C3 "§ · ADÓNDE IR" exit ramp ────────────────
//
// Charter invariant 13: every story must end with an ADÓNDE IR coda carrying
// ≥1 investigate CTA + ≥2 EntityIdentityChips. The closing chapter already
// had the investigate CTA (AtlasLink) but ZERO chips. This block adds the
// related-entity chips via buildCodaChips() — the layered fallback below —
// so every one of the 12 stories clears the ≥2 floor from its own data.
//
// ROUTING TRAP (deliberate omission): a case chip would have to route by
// scandal SLUG (CaseDossier resolves by slug; a numeric case_id 404s).
// StoryDef carries only numeric caseIds — no verified case slug — so we
// SKIP the case chip rather than mint one that 404s, per the trap rule.

interface CodaChip {
  type: 'vendor' | 'institution' | 'sector' | 'story' | 'pattern'
  id: string | number
  name: string
  riskScore?: number
  ariaTier?: 1 | 2 | 3 | 4
}

// Build up to 3 related-entity chips for the closing coda, drawn ONLY from
// data already on the story. Layered so every story reaches the invariant-13
// floor of ≥2 chips:
//   1. story.entities          — verified vendor/institution dossiers (names
//                                travel with the entity).
//   2. lensTags.sectors        — sector codes → numeric ids via SECTORS
//                                (sector dossiers 1–12 always resolve).
//   3. related stories         — relatedSlugs → headline via getStoryBySlug
//                                (target is guaranteed to be in STORIES).
//   4. lensTags.patterns       — last resort. Pattern code (P1–P7) is both
//                                the route id and the display name; the chip
//                                routes to /patterns/P5 which always resolves.
//                                Code-as-name avoids the inconsistent prose
//                                pattern labels found across the codebase.
// Case chips are intentionally absent: StoryDef has only numeric caseIds and
// no verified case slug, and a numeric case_id 404s on CaseDossier (slug-only).
function buildCodaChips(story: StoryDef, lang: 'en' | 'es'): CodaChip[] {
  const chips: CodaChip[] = []
  const CAP = 3

  // 1. Named vendors/institutions — top by listing order.
  for (const e of story.entities ?? []) {
    if (chips.length >= CAP) break
    chips.push({
      type: e.type,
      id: e.id,
      name: e.name,
      riskScore: e.riskScore,
      ariaTier: e.ariaTier as 1 | 2 | 3 | 4 | undefined,
    })
  }

  // 2. Sectors.
  for (const code of story.lensTags?.sectors ?? []) {
    if (chips.length >= CAP) break
    const sector = SECTORS.find((s) => s.code === code)
    if (!sector) continue
    if (chips.some((c) => c.type === 'sector' && c.id === sector.id)) continue
    chips.push({ type: 'sector', id: sector.id, name: lang === 'es' ? sector.name : sector.nameEN })
  }

  // 3. Related stories (only needed to reach the ≥2 floor).
  if (chips.length < 2) {
    for (const relSlug of story.relatedSlugs ?? []) {
      if (chips.length >= CAP) break
      if (relSlug === story.slug) continue
      const rel = getStoryBySlug(relSlug)
      if (!rel) continue
      chips.push({ type: 'story', id: rel.slug, name: localizeStory(rel, lang).headline })
    }
  }

  // 4. Patterns — last resort, code as both id and name.
  if (chips.length < 2) {
    for (const code of story.lensTags?.patterns ?? []) {
      if (chips.length >= CAP) break
      if (chips.some((c) => c.type === 'pattern' && c.id === code)) continue
      chips.push({ type: 'pattern', id: code, name: code })
    }
  }

  return chips
}

function ClosingCoda({ story, accentColor, lang }: {
  story: StoryDef
  accentColor: string
  lang: 'en' | 'es'
}) {
  const chips = buildCodaChips(story, lang)
  return (
    <div className="st-read">
      {/* § · ADÓNDE IR kicker */}
      <p className="text-[12px] ct-sc text-text-muted mb-4 mt-6">
        {lang === 'es' ? 'Adónde ir' : 'Where to go next'}
      </p>

      {/* Investigate CTA — live Atlas. The story has named patterns / years /
          clusters; the Atlas is where readers can manipulate them live. */}
      <AtlasLink
        accentColor={accentColor}
        lens="patterns"
        lang={lang}
        caption={{
          en: 'Open this story\'s patterns live in The Atlas — scrub years, pin clusters, run your own investigation.',
          es: 'Abre los patrones de esta historia en vivo en El Atlas — desplaza años, fija cúmulos, lleva tu propia investigación.',
        }}
      />

      {/* Related-entity chips — the dossiers this story names. */}
      {chips.length > 0 && (
        <ScrollReveal className="mt-6">
          <p className="text-[12px] ct-sc text-text-muted mb-3">
            {lang === 'es' ? 'Investigar los expedientes' : 'Investigate the dossiers'}
          </p>
          <div className="flex flex-wrap gap-2">
            {chips.map((c) => (
              <EntityIdentityChip
                key={`${c.type}-${c.id}`}
                type={c.type}
                id={c.id}
                name={c.name}
                riskScore={c.riskScore}
                ariaTier={c.ariaTier}
                size="sm"
                fullName
              />
            ))}
          </div>
        </ScrollReveal>
      )}
    </div>
  )
}

function ClosingChapter({ chapter, story, accentColor }: ChapterRenderProps) {
  const { t, i18n } = useTranslation('common')
  const lang: 'en' | 'es' = i18n.language.startsWith('es') ? 'es' : 'en'
  return (
    <section
      id={`chapter-${chapter.id}`}
      aria-label={`${t('storyType.chapter', 'Chapter')} ${chapter.number}: ${chapter.title}`}
      className="mb-8 relative"
    >
      <ScrollReveal>
        <div className="st-read pt-4 pb-4">
          <p
            className="text-[12px] ct-sc font-bold mb-4"
            style={{ color: outletInk(accentColor) }}
          >
            {t('storyType.closing', 'Closing')} · {t('storyType.chapter', 'Chapter')} {String(chapter.number).padStart(2, '0')}
          </p>
          <h2
            className="st-h2-open text-text-primary mb-4 text-balance"
          >
            {chapter.title}
          </h2>
          {chapter.subtitle && (
            <p className="text-lg text-text-secondary leading-[1.55] mb-8 text-pretty">
              {chapter.subtitle}
            </p>
          )}
        </div>
      </ScrollReveal>

      <div className="st-read">
        {chapter.prose.map((paragraph, i) => (
          <ScrollReveal key={i} staggerIndex={i}>
            <p
              className={cn(
                'text-text-primary leading-[1.75] mb-5 text-[17px]',
                i === 0 && 'feature-dropcap',
              )}
              style={i === 0 ? { '--dropcap-color': accentColor } as React.CSSProperties : undefined}
            >
              {paragraph}
            </p>
          </ScrollReveal>
        ))}
        {chapter.sources && chapter.sources.length > 0 && (
          <ChapterSources sources={chapter.sources} chapterId={chapter.id} />
        )}
      </div>

      {/* A live closing figure leads: it is the evidence the verdict quote then
          reads off, so the reader sees the distribution before the number that
          summarises it. A typed closing figure keeps the quote-first order the
          two stories that have one were laid out with. */}
      {chapter.chartConfig?.type === 'live' && (
        <div className="st-fig">
          {renderChartBlock(chapter, '', lang)}
        </div>
      )}

      {chapter.pullquote && (
        <div className="st-fig">
          {renderPullquote(chapter, story, '', false, 'closing')}
        </div>
      )}

      {chapter.chartConfig && chapter.chartConfig.type !== 'live' && (
        <div className="st-fig">
          {renderChartBlock(chapter, '', lang)}
        </div>
      )}

      {/* Closing coda — charter C3 "§ · ADÓNDE IR": investigate CTA (live
          Atlas) + related-entity chips (the dossiers this story names). */}
      <ClosingCoda story={story} accentColor={accentColor} lang={lang} />
    </section>
  )
}

// ── Variant: STANDARD (current default, refined) ──────────────────────────

function StandardChapter({ chapter, story, accentColor, isFirst = false }: ChapterRenderProps) {
  const { t, i18n } = useTranslation('common')
  const lang: 'en' | 'es' = i18n.language.startsWith('es') ? 'es' : 'en'
  // SD-02 F2 — a `standard` chapter can carry the stepped figure too: it goes
  // above the prose and sticks there, exactly as the hero's does.
  const isScrolly = chapter.chartConfig?.scrolly === true
  const narrow = useIsMobile(1023)
  const { stage, register } = useProseStage(
    chapter.prose.length,
    isScrolly && !narrow,
    STEP_MAX_STAGE,
  )
  const belowProse = renderChartBlock(chapter, 'my-8', lang, undefined, isScrolly ? 'secondary' : undefined)
  return (
    <section
      id={`chapter-${chapter.id}`}
      aria-label={`${t('storyType.chapter', 'Chapter')} ${chapter.number}: ${chapter.title}`}
      className="mb-8"
    >
      <ChapterBanner
        number={chapter.number}
        title={chapter.title}
        subtitle={chapter.subtitle}
        era={story.era ? getEraLabel(story.era, t) : undefined}
        color={accentColor}
        ink={outletInk(accentColor)}
      />

      <div className={isScrolly ? 'relative' : undefined}>
        {isScrolly && (
          <StickyStepFrame stage={stage}>
            {renderChartBlock(chapter, '', lang, stage, 'primary')}
          </StickyStepFrame>
        )}

        <div className="st-read">
          {chapter.prose.map((paragraph, i) => (
            <ScrollReveal key={i} staggerIndex={i}>
              <p
                ref={isScrolly ? (el) => register(el, i) : undefined}
                className={cn(
                  'text-text-primary leading-[1.75] mb-5 text-[17px]',
                  i === 0 && 'feature-dropcap',
                )}
                style={i === 0 ? { '--dropcap-color': accentColor } as React.CSSProperties : undefined}
              >
                {paragraph}
              </p>
            </ScrollReveal>
          ))}

          {chapter.sources && chapter.sources.length > 0 && (
            <ChapterSources sources={chapter.sources} chapterId={chapter.id} />
          )}
        </div>
      </div>

      {/* Chart in the 760 figure column — overhangs the 640 text by 60px a
          side, the same overhang every other variant's figure gets. A scrolly
          chapter already rendered its first plate above the prose; only its
          `live2` exhibit lands here. */}
      {belowProse && <div className="st-fig">{belowProse}</div>}

      {chapter.pullquote && (
        <div className="st-read">
          <div>
            {renderPullquote(chapter, story, '', isFirst, 'standard')}
          </div>
        </div>
      )}
    </section>
  )
}

// ── Top-level dispatcher ──────────────────────────────────────────────────

interface ChapterRenderProps {
  chapter: StoryChapterDef
  story: StoryDef
  accentColor: string
  isFirst?: boolean
}

function ChapterSection({
  chapter,
  story,
  accentColor,
  variant,
  isFirst = false,
}: ChapterRenderProps & { variant: ChapterVariant }) {
  // Build a language-localized projection of the chapter, with EN fallback when
  // _es fields are absent. All variant components consume this object's
  // resolved title/subtitle/prose/pullquote — they don't see the raw chapter.
  const { i18n } = useTranslation('common')
  const lang: 'en' | 'es' = i18n.language.startsWith('es') ? 'es' : 'en'
  const localized = localizeChapter(chapter, lang)
  // Wire the resolved fields back onto a chapter-shaped object so existing
  // variant code keeps working without per-variant edits. ChartConfig is
  // now also localized — title, axis labels, point labels, annotations,
  // multi-series names, network anchors, stacked-bar rows all respect
  // the lang setting (April 2026 fix for the chart-translation bug).
  const localizedChapter: StoryChapterDef = {
    ...chapter,
    title: localized.title,
    subtitle: localized.subtitle,
    prose: localized.prose,
    pullquote: localized.pullquote,
    chartConfig: localized.chartConfig,
  }
  switch (variant) {
    case 'hero':            return <HeroChapter            chapter={localizedChapter} story={story} accentColor={accentColor} />
    case 'feature':         return <FeatureChapter         chapter={localizedChapter} story={story} accentColor={accentColor} isFirst={isFirst} />
    case 'data-spotlight':  return <DataSpotlightChapter   chapter={localizedChapter} story={story} accentColor={accentColor} isFirst={isFirst} />
    case 'quote-spotlight': return <QuoteSpotlightChapter  chapter={localizedChapter} story={story} accentColor={accentColor} isFirst={isFirst} />
    case 'connective':      return <ConnectiveChapter      chapter={localizedChapter} story={story} accentColor={accentColor} />
    case 'closing':         return <ClosingChapter         chapter={localizedChapter} story={story} accentColor={accentColor} />
    case 'standard':
    default:                return <StandardChapter        chapter={localizedChapter} story={story} accentColor={accentColor} isFirst={isFirst} />
  }
}

// ---------------------------------------------------------------------------
// Shared status config (used in Hero + Methodology)
// ---------------------------------------------------------------------------

// Tokenized — was 4 dark-mode pill styles (text-color-400 + bg-color-950)
// that read as washed-out muddy patches on the cream broadsheet. Routed
// through canonical risk + accent + OECD tokens.
const STATUS_CONFIG: Record<StoryStatus, { labelKey: string; color: string; bg: string; border: string }> = {
  solo_datos:  { labelKey: 'story.statusSoloDatos', color: 'text-risk-high',                   bg: 'bg-risk-high/10',                                  border: 'border-risk-high/30' },
  reporteado:  { labelKey: 'story.statusReporteado', color: 'text-accent-data', bg: 'bg-accent-data/10',     border: 'border-accent-data/30'   },
  auditado:    { labelKey: 'story.statusAuditado',  color: 'text-oecd',        bg: 'bg-oecd/10',            border: 'border-oecd/30' },
  procesado:   { labelKey: 'story.statusProcesado', color: 'text-risk-critical',                   bg: 'bg-risk-critical/10',                          border: 'border-risk-critical/30'   },
}

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------

const BYLINE_ES: Record<string, string> = {
  'RUBLI Data Analysis Unit': 'Unidad de Análisis de Datos de RUBLI',
  'RUBLI Investigative Data Unit': 'Unidad de Investigación de RUBLI',
}

function StoryHero({ story }: { story: StoryDef; accentColor: string }) {
  const { t, i18n } = useTranslation('common')
  const lang: 'en' | 'es' = i18n.language.startsWith('es') ? 'es' : 'en'
  // V7: pull bilingual headline / subheadline / leadStat label from the story's
  // optional _es fields, falling back to English when missing.
  const ls = localizeStory(story, lang)
  // Then localize the lead stat VALUE itself to Mexican format
  const localizedValue = localizeAmount(story.leadStat.value, lang)
  const localizedSublabel = ls.leadStatSublabel
    ? localizeAmount(ls.leadStatSublabel, lang)
    : undefined
  const parsed = parseLeadStat(localizedValue)
  const sc = story.status ? STATUS_CONFIG[story.status] : null
  const kick = story.kickerStats ?? []

  // DESIGN.md §5.1 read page: the story's hero IS its cover — h1 36, the
  // subheadline as lede, one mono byline, then the hero figure at fig scale.
  return (
    <Cover className="is-story" title={ls.headline} lede={ls.subheadline}>
      <p className="st-byline">
        <span>{lang === 'es' ? (BYLINE_ES[story.byline] ?? story.byline) : story.byline}</span>
        <span>{story.estimatedMinutes} min {t('storyType.readTime', 'read')}</span>
        <span>
          {story.chapters.length}{' '}
          {lang === 'es'
            ? story.chapters.length === 1 ? 'capítulo' : 'capítulos'
            : story.chapters.length === 1 ? 'chapter' : 'chapters'}
        </span>
        <span>{getTypeLabel(story.type, t)}</span>
        <span>{sentenceCase(t(`outletLabels.${story.outlet}`, { defaultValue: story.outlet }))}</span>
        {story.era && <span>{getEraLabel(story.era, t)}</span>}
        {sc && <b className={sc.color}>{t(sc.labelKey, { defaultValue: story.status })}</b>}
      </p>

      {kick.length > 0 ? (
        <div className="st-kick" style={{ '--n': kick.length } as React.CSSProperties}>
          {kick.map((stat, idx) => {
            const valueColor =
              stat.tone === 'critical'
                ? 'var(--color-risk-critical)'
                : 'var(--color-text-primary)'
            const prefix = (lang === 'es' && stat.prefix_es) ? stat.prefix_es : stat.prefix
            const suffix = (lang === 'es' && stat.suffix_es) ? stat.suffix_es : stat.suffix
            return (
              <div key={idx} className="st-kick-cell">
                <span className="ct-fig is-story" style={{ color: valueColor, marginTop: 0 }}>
                  {localizeAmount(stat.value, lang)}
                </span>
                {(prefix || suffix) && (
                  <span className="st-kick-txt">{[prefix, suffix].filter(Boolean).join(' ')}</span>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <div className="st-lead">
          {/* Lead-stat color comes from story-content.ts as a hex string; it is
              applied as an inline style (a hex in className is stripped). */}
          <span className="st-lead-fig" style={{ color: storyInk(story.leadStat.color) }}>
            {parsed ? (
              <AnimatedNumber
                value={parsed.numeric}
                decimals={parsed.decimals}
                prefix={parsed.prefix}
                suffix={parsed.suffix}
              />
            ) : (
              <span>{localizedValue}</span>
            )}
          </span>
          <span className="st-lead-label">{ls.leadStatLabel}</span>
          {localizedSublabel && <span className="st-lead-sub">{localizedSublabel}</span>}
        </div>
      )}
    </Cover>
  )
}

// ---------------------------------------------------------------------------
// Chapter navigation dots (sticky sidebar)
// ---------------------------------------------------------------------------

function ChapterNav({
  chapters,
  accentColor,
  activeChapterId,
}: {
  chapters: StoryChapterDef[]
  accentColor: string
  activeChapterId: string | null
}) {
  const { t, i18n } = useTranslation('common')
  const lang: 'en' | 'es' = i18n.language.startsWith('es') ? 'es' : 'en'
  return (
    <nav
      className="hidden lg:flex fixed right-6 top-1/2 -translate-y-1/2 z-40 flex-col gap-3"
      aria-label={t('storyType.chapterNav', 'Chapter navigation')}
    >
      {chapters.map((ch) => {
        const isActive = ch.id === activeChapterId
        const chapterTitle = lang === 'es' ? (ch.title_es ?? ch.title) : ch.title
        return (
          <a
            key={ch.id}
            href={`#chapter-${ch.id}`}
            className="group relative flex items-center justify-end gap-2 min-h-6"
            aria-label={`${t('storyType.chapter', 'Chapter')} ${ch.number}: ${chapterTitle}`}
            aria-current={isActive ? 'step' : undefined}
          >
            {/* The label is hover/focus-only, including for the active
                chapter: the nav is fixed in the margin and the active label
                printed over the feature aside and the closing column at 1440.
                aria-current + aria-label above keep the active chapter
                announced, so nothing is lost for assistive tech. */}
            <span className="transition-opacity text-xs whitespace-nowrap pr-2 text-text-secondary opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100">
              {chapterTitle}
            </span>
            <span
              className={cn(
                'w-2.5 h-2.5 rounded-full border-2 transition-[transform,background-color]',
                isActive ? 'scale-125' : 'group-hover:scale-110'
              )}
              style={{
                borderColor: accentColor,
                backgroundColor: isActive ? accentColor : 'transparent',
              }}
            />
          </a>
        )
      })}
    </nav>
  )
}

// ---------------------------------------------------------------------------
// Methodology footer
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// DramatisPersonaeSection — entity chips for named subjects in the story
// ---------------------------------------------------------------------------

function DramatisPersonaeSection({ story, accentColor }: { story: StoryDef; accentColor: string }) {
  const { i18n } = useTranslation('common')
  const isEs = i18n.language.startsWith('es')

  if (!story.entities || story.entities.length === 0) return null

  return (
    <ScrollReveal>
      <div className="st-fig ct-section">
        <div className="border-t border-text-primary pt-4">
          {/* Kicker */}
          <p
            className="text-[13px] font-mono ct-sc mb-1"
            style={{ color: outletInk(accentColor) }}
          >
            {isEs ? 'Sujetos de esta investigación' : 'Subjects of this investigation'}
          </p>
          <p
            className="text-[13px] font-serif tabular-nums text-text-muted mb-5"
          >
            {/* The ordering claim only holds when the entities carry a risk score. */}
            {story.entities.some((e) => typeof e.riskScore === 'number')
              ? isEs
                ? `${story.entities.length} entidades nombradas · ordenadas por nivel de riesgo`
                : `${story.entities.length} named entities · ordered by risk level`
              : isEs
                ? `${story.entities.length} entidades nombradas`
                : `${story.entities.length} named entities`}
          </p>

          {/* Numbered editorial roster — one row per subject, full width.
              Layout: 01–NN rank · entity chip · risk readout · "Open dossier →" */}
          <ol className="divide-y divide-border/60">
            {story.entities.map((entity, idx) => {
              const score = typeof entity.riskScore === 'number' ? entity.riskScore : 0
              const level = getRiskLevelFromScore(score)
              const riskColor = RISK_COLORS[level]
              const rank = String(idx + 1).padStart(2, '0')
              const role = isEs ? (entity.role_es ?? entity.role) : entity.role
              return (
                <li
                  key={`${entity.type}-${entity.id}`}
                  className="group grid grid-cols-[auto_1fr_auto] sm:grid-cols-[auto_minmax(0,1.4fr)_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 py-3.5"
                >
                  {/* Rank — mono, muted */}
                  <span className="font-mono text-[13px] tabular-nums select-none text-text-muted" aria-hidden="true">
                    {rank}
                  </span>

                  {/* Entity identity + role caption */}
                  <div className="min-w-0">
                    <EntityIdentityChip
                      type={entity.type}
                      id={entity.id}
                      name={entity.name}
                      riskScore={entity.riskScore}
                      ariaTier={entity.ariaTier as 1 | 2 | 3 | 4 | undefined}
                      size="sm"
                      fullName
                    />
                    {role && (
                      <p className="text-[13px] font-serif text-text-muted pl-1 mt-1 leading-relaxed">
                        {glueDashes(role)}
                      </p>
                    )}
                  </div>

                  {/* Risk readout — DotBar + numeric (hidden on mobile, shown sm+) */}
                  <div className="hidden sm:flex items-center gap-2.5 justify-end">
                    {typeof entity.riskScore === 'number' && (
                      <>
                        <DotBar
                          value={entity.riskScore}
                          max={1}
                          color={riskColor}
                          dots={12}
                          dotR={1.5}
                          dotGap={4}
                          ariaLabel={`Risk ${entity.riskScore.toFixed(2)}`}
                        />
                        <span
                          className="font-mono tabular-nums text-[13px]"
                          style={{ color: RISK_TEXT_COLORS[level] }}
                        >
                          {entity.riskScore.toFixed(2)}
                        </span>
                      </>
                    )}
                  </div>

                  {/* "Open dossier →" link — animated arrow on hover */}
                  <Link
                    to={
                      entity.type === 'vendor'
                        ? `/vendors/${entity.id}`
                        : entity.type === 'institution'
                          ? `/institutions/${entity.id}`
                          : entity.type === 'case'
                            ? `/cases/${entity.id}`
                            : `/${entity.type}/${entity.id}`
                    }
                    className="inline-flex items-center gap-1 min-h-11 sm:min-h-6 text-[12px] font-mono ct-sc text-text-muted hover:text-text-primary transition-colors col-span-3 sm:col-span-1 justify-self-end"
                  >
                    <span>{isEs ? 'Abrir expediente' : 'Open dossier'}</span>
                    <ArrowRight
                      className="h-3 w-3 transition-transform duration-200 group-hover:translate-x-0.5"
                      aria-hidden="true"
                    />
                  </Link>
                </li>
              )
            })}
          </ol>
        </div>
      </div>
    </ScrollReveal>
  )
}

function MethodologySection({ story }: { story: StoryDef }) {
  const { t, i18n } = useTranslation('common')
  const lang: 'en' | 'es' = i18n.language.startsWith('es') ? 'es' : 'en'
  const ls = localizeStory(story, lang)
  const cc = useCaseCountLabels(lang) // weekend F8
  const statusCfg = story.status ? STATUS_CONFIG[story.status] : null

  return (
    <ScrollReveal>
      <div className="st-read ct-section-body">
        {/* Investigation status */}
        {statusCfg && (
          <p className={`ct-sc text-[13px] mb-4 ${statusCfg.color}`}>
            {t('story.statusLabel')}: {t(statusCfg.labelKey)}
          </p>
        )}

        {(lang === 'es' ? story.methodology_es ?? story.methodology : story.methodology) ? (
          <div className="text-[15px] text-text-secondary leading-[1.6] space-y-3">
            {(lang === 'es' ? story.methodology_es ?? story.methodology : story.methodology)!.map((para, i) => (
              <p key={i}>{glueDashes(para)}</p>
            ))}
          </div>
        ) : (
        <div className="text-[15px] text-text-secondary leading-[1.6] space-y-3">
          <p>
            {glueDashes(t('story.methodologyP1'))}{' '}
            {glueDashes(t('story.methodologyP2'))}
          </p>
          <p>
            {glueDashes(t('story.methodologyP3', cc))}
          </p>
          <p>
            {glueDashes(t('story.methodologyP4'))}
          </p>
        </div>
        )}

        {/* Next steps for journalists */}
        {ls.nextSteps && ls.nextSteps.length > 0 && (
          <div className="mt-8 pt-4 border-t border-border">
            <h3 className="ct-sc text-[14px] text-text-primary mb-3">
              {t('story.nextSteps')}
            </h3>
            <ul className="space-y-2">
              {ls.nextSteps.map((step, i) => (
                <li key={i} className="flex gap-2 text-[15px] text-text-secondary leading-[1.6]">
                  <span className="font-mono text-[13px] shrink-0 mt-0.5 text-text-muted">{i + 1}.</span>
                  <span>{step}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* § · CORRECCIONES — the single home for every claim an earlier
            edition made and this one withdraws. Same chrome as the chapter
            sources list, so it reads as provenance rather than as argument. */}
        {ls.corrections && ls.corrections.length > 0 && (
          <div className="mt-8">
            <p className="text-[12px] ct-sc text-text-muted mb-3">
              {lang === 'es' ? 'Correcciones' : 'Corrections'}
            </p>
            <ol className="space-y-1.5 border-l-2 border-border pl-4">
              {ls.corrections.map((c, i) => (
                <li key={i} className="text-[13px] text-text-muted font-serif leading-relaxed">
                  <span className="text-text-primary mr-2 select-none">[{i + 1}]</span>
                  {c}
                </li>
              ))}
            </ol>
          </div>
        )}

        <div className="flex gap-3 mt-6">
          <Link
            to="/methodology"
            className="st-chip"
          >
            {t('story.fullMethodology')}
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </Link>
          <Link
            to="/model"
            className="st-chip"
          >
            {t('story.modelTransparency')}
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </ScrollReveal>
  )
}

// ---------------------------------------------------------------------------
// Related stories
// ---------------------------------------------------------------------------

function RelatedSection({ story }: { story: StoryDef }) {
  const { t, i18n } = useTranslation('common')
  const lang: 'en' | 'es' = i18n.language.startsWith('es') ? 'es' : 'en'
  const navigate = useNavigate()
  const related = getRelatedStories(story.slug)
  if (related.length === 0) return null

  return (
    <ScrollReveal>
      <section className="ct-section" aria-labelledby="st-rel-h">
        <div className="ct-annex-row"><h2 id="st-rel-h" className="ct-h2">{t('story.investigateMore')}</h2></div>
        <motion.div
          variants={staggerContainer}
          initial="initial"
          animate="animate"
          className={`ct-section-body grid grid-cols-1 gap-4 ${related.length >= 3 ? 'md:grid-cols-3' : related.length === 2 ? 'md:grid-cols-2' : ''}`}
        >
          {related.slice(0, 3).map((r) => {
            const loc = localizeStory(r, lang)
            return (
              <StoryCard
                key={r.slug}
                slug={r.slug}
                outlet={r.outlet}
                type={r.type}
                headline={loc.headline}
                subheadline={loc.subheadline}
                leadStatValue={r.leadStat.value}
                leadStatLabel={loc.leadStatLabel}
                leadStatColor={r.leadStat.color}
                estimatedMinutes={r.estimatedMinutes}
                era={r.era ? getEraLabel(r.era, t) : undefined}
                onClick={() => {
                  navigate(`/stories/${r.slug}`)
                  window.scrollTo({ top: 0, behavior: 'smooth' })
                }}
              />
            )
          })}
        </motion.div>
      </section>
    </ScrollReveal>
  )
}

// ---------------------------------------------------------------------------
// Platform links
// ---------------------------------------------------------------------------

function PlatformLinks({ story }: { story: StoryDef }) {
  const { t, i18n } = useTranslation('common')
  const links = [
    { label: t('story.ariaIntelligence'), to: '/aria', description: t('story.ariaDesc') },
    { label: t('story.documentedCases'), to: '/cases', description: t('story.documentedCasesDesc') },
    { label: t('story.exploreContracts'), to: '/contracts', description: t('story.exploreContractsDesc') },
  ]

  if (story.slug === 'el-modelo-bienestar') {
    const es = i18n.language.startsWith('es')
    links.unshift({
      label: es ? 'El Tamiz · instituciones por pesos' : 'El Tamiz · institutions by pesos',
      to: '/institutions?lente=pesos',
      description: es ? 'Las calificaciones v3 de todas las instituciones' : 'The v3 grades of every institution',
    })
  }

  if (story.era === 'amlo' || story.slug.includes('granero')) {
    links.push({ label: t('story.sectorAgricultura'), to: '/sectors/9', description: t('story.sectorAgriculturaDesc') })
  }

  return (
    <ScrollReveal>
      <div className="st-read mt-4">
        <div className="st-links">
          {links.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className="st-link group"
            >
              <div>
                <p className="text-[15px] font-semibold text-text-primary">
                  {link.label}
                </p>
                <p className="text-[13px] font-serif text-text-muted">{link.description}</p>
              </div>
              <ArrowRight className="h-4 w-4 text-text-muted group-hover:text-text-secondary transition-colors shrink-0" aria-hidden="true" />
            </Link>
          ))}
        </div>
      </div>
    </ScrollReveal>
  )
}

// ---------------------------------------------------------------------------
// Share bar
// ---------------------------------------------------------------------------

function ShareBar({ story }: { story: StoryDef }) {
  const { t } = useTranslation('common')
  const handleShare = async () => {
    const url = window.location.href
    const text = `${story.headline} - ${story.leadStat.value} ${story.leadStat.label}`
    if (navigator.share) {
      try {
        await navigator.share({ title: story.headline, text, url })
      } catch {
        // User cancelled
      }
    } else {
      await navigator.clipboard.writeText(url)
    }
  }

  return (
    <div className="st-read ct-section-body">
      <button
        onClick={handleShare}
        className="st-chip"
      >
        <Share2 className="h-4 w-4" aria-hidden="true" />
        {t('story.shareInvestigation')}
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function StoryNarrative() {
  const { t, i18n } = useTranslation('common')
  const lang: 'en' | 'es' = i18n.language.startsWith('es') ? 'es' : 'en'
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  // Keyed by slug so a new story starts with no active chapter without a reset effect.
  const [activeChapter, setActiveChapter] = useState<{ slug: string | undefined; id: string } | null>(null)
  const activeChapterId = activeChapter && activeChapter.slug === slug ? activeChapter.id : null

  const story = slug ? getStoryBySlug(slug) : undefined

  // Scroll to top on slug change
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [slug])

  // Active chapter tracking via IntersectionObserver
  useEffect(() => {
    if (!story) return
    const sections = story.chapters
      .map((ch) => document.getElementById(`chapter-${ch.id}`))
      .filter(Boolean) as HTMLElement[]
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveChapter({ slug, id: entry.target.id.replace('chapter-', '') })
          }
        }
      },
      { rootMargin: '-15% 0px -65% 0px' }
    )
    sections.forEach((s) => observer.observe(s))
    return () => observer.disconnect()
  }, [story, slug])

  // Mark story as read in localStorage
  const markRead = useCallback((s: string) => {
    try { localStorage.setItem(`rubli_read:${s}`, '1') } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    if (slug) markRead(slug)
  }, [slug, markRead])

  if (!story) {
    return (
      <article className="ct ct-page ct-sheet" data-frame>
        <div className="ct-wrap">
          <DocHead trail={[{ label: lang === 'es' ? 'Sala de Redacción' : 'Newsroom', to: '/journalists' }, { label: t('story.notFound', 'Story not found') }]} />
          <Cover
            className="is-op"
            title={t('story.notFound', 'Story not found')}
            lede={t('story.notFoundDetail', 'The story "{{slug}}" could not be found in the RUBLI narrative archive. Return to the journalism index to explore active investigations.', { slug })}
          />
          <button type="button" onClick={() => navigate('/journalists')} className="st-back">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {t('story.allStories')}
          </button>
        </div>
      </article>
    )
  }
  const accentColor = OUTLET_ACCENT[story.outlet] || CATEGORICAL[0]

  return (
    <article className="ct ct-page ct-sheet st-page" data-frame>
      <div className="ct-wrap">
        <div className={story.component ? undefined : 'st-frame'}>
          <DocHead trail={[{ label: lang === 'es' ? 'Sala de Redacción' : 'Newsroom', to: '/journalists' }, { label: localizeStory(story, lang).headline }]} />

          {/* Cover — headline, lede, byline and the hero figure */}
          {!story.component && <StoryHero story={story} accentColor={accentColor} />}
        </div>

        {/* A component story owns its cover and body (StoryDef.component) */}
        {story.component === 'relevo2018' && (
          <Suspense fallback={<LiveFigureSkeleton lang={lang} />}>
            <Relevo2018 />
          </Suspense>
        )}

        {/* Chapter navigation dots */}
        {!story.component && <ChapterNav chapters={story.chapters} accentColor={accentColor} activeChapterId={activeChapterId} />}

        {/* The chapters: hero / feature / data-spotlight variants break out of the reading track */}
        <div className="st-frame st-chapters">
          {story.chapters.map((chapter, idx) => {
            const variant = pickChapterVariant(chapter, idx, story.chapters.length)
            return (
              <div key={chapter.id}>
                <ChapterSection
                  chapter={chapter}
                  story={story}
                  accentColor={accentColor}
                  variant={variant}
                  isFirst={idx === 1}
                />
                {/* Divider between chapters (skip after last) */}
                {idx < story.chapters.length - 1 && variant !== 'hero' && (
                  <ChapterDivider accentColor={accentColor} storySlug={story.slug} />
                )}
              </div>
            )
          })}

          {/* Named subjects with dossier links */}
          {story.entities && story.entities.length > 0 && (
            <DramatisPersonaeSection story={story} accentColor={accentColor} />
          )}

          <section className="ct-section" aria-labelledby="st-method-h">
            <div className="ct-annex-row st-read"><h2 id="st-method-h" className="ct-h2">{t('story.methodology')}</h2></div>
            <MethodologySection story={story} />
          </section>

          <section className="ct-section" aria-labelledby="st-more-h">
            <div className="ct-annex-row st-read"><h2 id="st-more-h" className="ct-h2">{t('story.viewOnPlatform')}</h2></div>
            <ShareBar story={story} />
            <ObservatoryTrailerCTA longformSlug={story.slug} lang={lang} />
            <PlatformLinks story={story} />
          </section>

          <RelatedSection story={story} />
        </div>
      </div>
    </article>
  )
}
