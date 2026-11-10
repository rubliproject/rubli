/**
 * Story Content — 10 original investigations derived from RUBLI data analysis.
 *
 * These stories START from what RUBLI's algorithms discovered in 3,051,294 contracts
 * (2002-2025). External sources are cited to CORROBORATE findings — not the other way.
 *
 * Risk scores from v0.9.1 model (restated 2026-10-14). v0.9.1 was replaced 2026-10-22 by v0.9.2 (look-ahead,
 * _v10/RESULT_2.md); its 0.852 is withdrawn. Figures below are v0.9.1 readings until each story is re-run.
 * All statistics are verified against RUBLI_NORMALIZED.db (verified Apr 2026).
 */

import type { VizTemplate } from '@/components/stories/DataPullquote'
import { glueDashes, noOrphan, tidy } from './typography'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type StoryOutlet = 'longform' | 'investigative' | 'data_analysis' | 'rubli'
export type StoryType = 'era' | 'case' | 'thematic' | 'year'
export type StoryEra = 'fox' | 'calderon' | 'pena' | 'amlo' | 'sheinbaum' | 'cross'

export interface StoryChapterDef {
  id: string
  number: number
  title: string
  /** Optional Spanish translation of `title`. Falls back to English when unset. */
  title_es?: string
  subtitle?: string
  /** Optional Spanish translation of `subtitle`. */
  subtitle_es?: string
  prose: string[]
  /**
   * Optional Spanish translation of `prose`. When present (and same length as
   * `prose`), Spanish UI renders this instead of the English original.
   * When absent, Spanish UI falls back to English with no badge — better than
   * blocking the read.
   */
  prose_es?: string[]
  sources?: string[]
  /**
   * Optional per-paragraph citation numbers (1-based into `sources`), aligned
   * with `prose`. Overrides the default paragraph N → source [N] footnote.
   */
  sourceRefs?: number[][]
  pullquote?: {
    quote: string
    quote_es?: string
    stat: string
    statLabel: string
    statLabel_es?: string
    barValue?: number
    barLabel?: string
    barLabel_es?: string
    vizTemplate?: VizTemplate
    /** Optional explicit pull-quote role (else auto-derived from chapter variant). */
    role?: 'ledger' | 'plate' | 'margin' | 'verdict'
  }
  chartConfig?: {
    type:
      | 'da-trend'
      | 'sector-bar'
      | 'year-bar'
      | 'vendor-list'
      | 'comparison'
      | 'sunburst'
      | 'racing'
      | 'network'
      | 'pyramid'
      | 'scatter'
      | 'breakdown'
      | 'fingerprint'
      | 'radar'
      | 'trends'
      | 'calendar'
      | 'inline-bar'
      | 'inline-line'
      | 'inline-area'
      | 'inline-dot-grid'
      | 'inline-diverging'
      | 'inline-spike'
      | 'inline-multi-line'
      | 'inline-network'
      | 'inline-stacked-bar'
      | 'inline-roster'
      | 'inline-timeline'
      | 'editorial-slope'
      | 'editorial-treemap'
      | 'editorial-beeswarm'
      | 'editorial-swimlane'
      | 'editorial-dumbbell'
      | 'vendor-price-trajectory' // n-P3 Volatilidad ch.2
      | 'venn-convergence' // n-P3 Volatilidad ch.4
      | 'editorial-threshold' // P2 ThresholdDistribution
      | 'editorial-thermometer' // P2 AnnotatedThermometer
      | 'editorial-cleveland-pair' // P2 ClevelandPairChart
      | 'inline-roster' // n-ejercito ch3 — roster list of named vendors
      | 'inline-timeline' // n-ejercito ch4 — detection-pipeline timeline
      | 'live' // SD-01 el-vacio — the figure is an API-backed plate, see `live`
    /**
     * An API-backed figure rendered from a live endpoint instead of the typed
     * `data` payload (STORY_DAYS principle 2). `renderChartBlock` lazy-loads
     * the matching component; a chapter may carry BOTH this and a typed chart,
     * in which case `liveAfter` decides the order.
     */
    live?: StoryChartLive
    /**
     * A chapter's second live exhibit, always rendered last. SD-02 ch2 pairs
     * the 36-month line with HEMOSER's award calendar; ch3 pairs the ratchet
     * with the sector dumbbell.
     */
    live2?: StoryChartLive
    /** Render the live figure AFTER the typed one (default: before). */
    liveAfter?: boolean
    /**
     * Step `live` as the chapter's paragraphs cross mid-viewport, with the
     * figure pinned above them at `lg` (`StickyStepFigure`). `live2` and any
     * typed figure stay in normal flow below the prose.
     */
    scrolly?: boolean
    highlight?: string
    title: string
    /** Optional Spanish translation of `title`. */
    title_es?: string
    chartId?: string
    data?: StoryInlineChartData
    multiSeries?: StoryMultiSeriesData
    network?: StoryNetworkData
    stacked?: StoryStackedBarData
  }
}

export interface StoryChartPoint {
  label: string
  /** Optional Spanish translation of `label`. */
  label_es?: string
  /** Optional English translation of `label` — use when `label` is the
   *  Spanish default (sector names, common categories) and the EN
   *  reader needs a translated version. Falls back to `label`. */
  label_en?: string
  value: number
  value2?: number
  color?: string
  highlight?: boolean
  annotation?: string
  /** Optional Spanish translation of `annotation`. */
  annotation_es?: string
  /** Optional risk score (0.0–1.0). When present and `color` is not set,
   *  bar renderers bind the fill color to RISK_COLORS via
   *  getRiskLevelFromScore (critical ≥0.60, high ≥0.40, low <0.40 — never
   *  green per Bible §3.10). Scoped opt-in: only points that supply this
   *  field get risk-tier coloring; everything else keeps its current
   *  palette path. */
  riskScore?: number
  /** Optional delta callout (e.g. "+37.1pp vs Calderón"). ThresholdDistribution
   *  renders this below the dot for the point that supplies it — used to bake
   *  the climb/gap into the chart instead of leaving it in the prose. */
  delta?: string
  /** Optional Spanish translation of `delta`. */
  delta_es?: string
}

export interface StoryInlineChartData {
  points: StoryChartPoint[]
  referenceLine?: { value: number; label: string; label_es?: string; color?: string }
  referenceLine2?: { value: number; label: string; label_es?: string; color?: string }
  unit?: string
  /** Optional Spanish `unit` (e.g. 'mil MDP' for 'B MXN'). */
  unit_es?: string
  maxValue?: number
  yLabel?: string
  /** Optional Spanish translation of `yLabel`. */
  yLabel_es?: string
  annotation?: string
  /** Optional Spanish translation of `annotation`. */
  annotation_es?: string
  /** ClevelandPairChart-only: switch from dual-dot+line to excess-only bars
   *  starting at value2 (baseline) and extending to the gap.
   *  InlineBarChart-only: 'dominance' draws the FT-bullet single-band path
   *  (one anchor share vs an OECD reference rule + a stacked minor register). */
  mode?: 'pair' | 'excess' | 'dominance'
  /** InlineBarChart/InlineRoster (dominance + roster): a small archival
   *  provenance stamp rendered in the ChartCard chrome (e.g. recovery date). */
  stamp?: { en: string; es: string }
  /** ClevelandPairChart-only (default mode): how to format the right-column
   *  readout. 'signed' (default) shows the raw value-minus-value2 gap with
   *  a + prefix for positives. 'ratio' shows (value / value2) as a
   *  percentage — used when value is a subset of value2 (e.g. single award
   *  wins out of total wins) and the gap is always negative + meaningless. */
  gapFormat?: 'signed' | 'ratio'
  /** InlineLineChart-only: zoom the y-axis to a non-zero floor so a series
   *  that lives in a narrow band (e.g. DA rate 71–87% on a 0–90 scale) shows
   *  its variation instead of hugging the top. Default 0. */
  yMin?: number
  /** ClevelandPairChart-only (pair mode): rank rows by the value/value2 ratio
   *  descending instead of the default absolute gap — use when the editorial
   *  metric IS the share (gapFormat 'ratio'), so the most-distorted row reads
   *  at the top. Opt-in so charts ranking by magnitude are unaffected. */
  sortBy?: 'gap' | 'ratio'
  /** ClevelandPairChart ratio mode: label for the row's own 100% track (the
   *  denominator, e.g. "sector's high-risk spend"). Falls back to a generic
   *  "of the row total" when absent. */
  trackLabel?: string
  trackLabel_es?: string
  /** ThresholdDistribution-only: draw a faint ordered connector through the
   *  dots (e.g. the rising "water line" across administrations) so the
   *  trajectory reads as a single climb rather than disconnected points. */
  connectDots?: boolean
  /** ThresholdDistribution-only: a vertical "riser" bracket from the
   *  referenceLine up to the dot at `index`, captioned with the multiple
   *  (e.g. "≈6×") — makes "N times the threshold" a visible measure rather
   *  than a footer sentence. Requires `referenceLine`. */
  riser?: {
    index: number
    multipleLabel: string
    multipleLabel_es?: string
    color?: string
  }
}

/**
 * Multi-series time-series data for InlineMultiLine. Each series is a
 * separate vendor / category / line on the same axis. Used to compare
 * trajectories where the editorial point is "look how they hand off".
 */
export interface StoryMultiSeriesData {
  /** Shared x-axis labels (years, months, etc.). */
  xLabels: string[]
  /** One entry per series. `values` must be the same length as xLabels. */
  series: Array<{
    name: string
    /** Optional Spanish translation of `name`. */
    name_es?: string
    color: string
    values: number[]
    /** Optional callout: marker + text on a specific x index. */
    annotation?: { xIndex: number; text: string; text_es?: string }
    /** Optional total caption beside the legend ("88.0B over 23 years"). */
    totalCaption?: string
    /** Optional Spanish translation of `totalCaption`. */
    totalCaption_es?: string
  }>
  unit?: string
  yLabel?: string
  yLabel_es?: string
  annotation?: string
  annotation_es?: string
  /** Optional vertical event markers (e.g. the 2020 INSABI/BIRMEX break that
   *  cut Grupo Fármacos to zero). Each draws a dashed vertical rule at the
   *  x index with a top label — baking the structural cause of a cliff into
   *  the chart instead of leaving it only in the prose. */
  eventLines?: Array<{ xIndex: number; label: string; label_es?: string; color?: string }>
}

/**
 * Network diagram data for InlineNetwork. Edge weights drive line
 * thickness so the "thicker = more shared activity" reads instantly.
 * Used for the cartel-cobidding lattice.
 */
export interface StoryNetworkData {
  nodes: Array<{
    id: string
    label: string
    /** Sub-label rendered as caption (e.g. amount, contract count). */
    sublabel?: string
    sublabel_es?: string
    color: string
    /** Optional emphasis — bigger node radius. */
    highlight?: boolean
  }>
  edges: Array<{
    from: string
    to: string
    /** Numeric weight; line thickness scales with this. */
    weight: number
    /** Label shown along the edge. */
    label?: string
  }>
  /** Top-of-card anchor stat. */
  anchor?: { value: string; label: string; label_es?: string }
  annotation?: string
  annotation_es?: string
}

/**
 * Stacked-bar comparison for InlineStackedBar. Each row is a vendor /
 * category; each row is split into two segments (e.g. "main customer"
 * vs "all others") so the dominant share reads as a band.
 */
export interface StoryStackedBarData {
  rows: Array<{
    label: string
    label_es?: string
    /** Optional English translation of `label` — fallback to `label`. */
    label_en?: string
    /** Total bar value. */
    total: number
    /** Sub-segment that gets the highlight color (e.g. IMSS portion). */
    highlight: number
    /** Optional row-level color override. */
    color?: string
    /** Sub-text shown right of the bar (e.g. "60.1% IMSS"). */
    annotation?: string
    annotation_es?: string
    /** Optional sector code — when set in `comparison` mode, the right-hand
     *  AMLO bar paints with SECTOR_COLORS[sectorCode]. */
    sectorCode?: string
    /** Optional comparator value rendered as the left-hand bar in mirror mode
     *  (e.g. Peña-era spend when total = AMLO-era spend). */
    compareTotal?: number
  }>
  unit?: string
  /** Mirror / back-to-back layout. When set, `compareTotal` per row becomes
   *  the left-hand bar (muted), `total` becomes the right-hand bar
   *  (sector-coded). The shared midline is the editorial axis. */
  comparison?: {
    leftLabel: string
    leftLabel_es?: string
    rightLabel: string
    rightLabel_es?: string
  }
  /** Top-of-card anchor stat. */
  anchor?: { value: string; label: string; label_es?: string }
  annotation?: string
  annotation_es?: string
  /** Color used for the highlighted (e.g. IMSS) portion of every row. */
  highlightColor?: string
  /** Color used for the remaining portion. */
  baseColor?: string
  /** Legend label for the highlighted segment (default "concentrated portion"). */
  highlightLabel?: string
  highlightLabel_es?: string
  /** Legend label for the base/remainder segment (default "remainder"). */
  baseLabel?: string
  baseLabel_es?: string
}

/**
 * Investigation status — how far this lead has been taken.
 * solo_datos: RUBLI identified the pattern; no external reporting yet.
 * reporteado: The case has been reported by journalists.
 * auditado: An oversight body (ASF, OIC, SFP) has reviewed.
 * procesado: Criminal or civil proceedings have begun.
 */
export type StoryStatus = 'solo_datos' | 'reporteado' | 'auditado' | 'procesado'

export interface StoryDef {
  slug: string
  outlet: StoryOutlet
  type: StoryType
  era?: StoryEra
  headline: string
  /** Optional Spanish translation of `headline`. */
  headline_es?: string
  subheadline: string
  /** Optional Spanish translation of `subheadline`. */
  subheadline_es?: string
  byline: string
  estimatedMinutes: number
  leadStat: {
    value: string
    label: string
    /** Optional Spanish translation of `label`. */
    label_es?: string
    sublabel?: string
    /** Optional Spanish translation of `sublabel`. */
    sublabel_es?: string
    color: string
  }
  /**
   * Optional per-story hero override. When present, StoryHero renders a 3-row
   * kicker-stat punchline INSTEAD of the default leadStat block. Use when the
   * story is built around a comparison (e.g. SAT confirmed 126 / RUBLI flagged
   * 6,118 / 5,992 still doing business).
   */
  kickerStats?: Array<{
    /** Optional verb prefix shown in muted serif before the number (e.g. "SAT confirmed") */
    prefix?: string
    prefix_es?: string
    /** The number itself — rendered enormous */
    value: string
    /** Tail text after the number (e.g. "ghosts.") — same line, smaller */
    suffix?: string
    suffix_es?: string
    /** Visual emphasis: 'critical' = red callout, 'data' = amber, 'muted' = neutral */
    tone?: 'critical' | 'data' | 'muted'
  }>
  chapters: StoryChapterDef[]
  relatedSlugs?: string[]
  caseIds?: number[]
  status?: StoryStatus
  nextSteps?: string[]
  nextSteps_es?: string[]
  /**
   * Published corrections — one dated line each, newest first. This is the
   * single home for every claim an earlier edition of the story made and this
   * one withdraws. Chapters state the corrected fact and nothing about the
   * edition that got it wrong; the retraction lives here, where readers look
   * for it. Rendered at the foot of StoryNarrative beside the methodology
   * block. Never delete an entry — corrections only accumulate.
   */
  corrections?: string[]
  corrections_es?: string[]
  /**
   * Story-specific methodology paragraphs. When present they replace the
   * generic risk-model block (story.methodologyP1–P4) — for stories built on
   * a different method, e.g. the v3 institution grades.
   */
  methodology?: string[]
  methodology_es?: string[]
  /**
   * A story whose body is one custom interactive component instead of chapters
   * (StoryNarrative renders it in place of the hero, chapter nav and chapters;
   * methodology, links and related stories still follow). `chapters` stays [].
   */
  component?: 'relevo2018'
  /**
   * Cross-surface filter tags. These let Newsroom filter stories by ARIA
   * pattern / sector / year that match the active Observatory lens, and
   * let Observatory list "stories matching this view" for the current
   * lens+year+pin. Tags name the central editorial concern of the story,
   * not exhaustive coverage; one story may legitimately tag 1–3 patterns
   * and 1–3 sectors.
   */
  lensTags?: {
    /** ARIA patterns this story illuminates ('P1' through 'P7'). */
    patterns?: AriaPattern[]
    /** Sector codes from constants.ts SECTOR_COLORS keys. */
    sectors?: SectorCode[]
    /** Years the story's analysis centers on (representative, not range). */
    years?: number[]
    /** Free-text terms surfaced in the constellation TERMS lens. */
    terms?: string[]
  }
  /**
   * Dramatis Personae — named entities (vendors / institutions) that
   * appear in this story. Each entry renders as an EntityIdentityChip
   * in the "Subjects" panel between Act I and Act II. Only populate
   * when RUBLI has a confirmed vendor_id or institution_id so the chip
   * links to an actual dossier.
   */
  entities?: Array<{
    type: 'vendor' | 'institution'
    id: number
    name: string
    riskScore?: number
    ariaTier?: number
    /** Short role descriptor shown beneath the chip (e.g. "Principal suspect", "Contracting authority"). */
    role?: string
    role_es?: string
  }>
}

/**
 * The API-backed figures a chapter can ask for, one family per story day.
 * `StoryNarrative` routes the prefix to the lazy chunk that owns it.
 */
export type StoryChartLive =
  // SD-01 `el-vacio` — /gap/summary
  | 'gap-blackout'
  | 'gap-funnel'
  | 'gap-exceptions'
  | 'gap-buyers'
  | 'gap-grade'
  // SD-02 `el-ano-de-la-emergencia` — year-over-year, monthly-breakdown,
  // vendor contracts, sectors-by-year
  | 'covid-floor'
  | 'covid-months'
  | 'covid-hemoser-calendar'
  | 'covid-ratchet'
  | 'covid-sectors'
  // SD-03 `el-cartel-de-los-vales` — vendor detail, risk-timeline, ARIA queue
  | 'vales-stream'
  | 'vales-doors'
  | 'vales-roster'
  | 'vales-sexenios'
  // SD-04 `captura-institucional` — the ARIA pattern aggregate, the capture
  // landscape census, and the verified case library
  | 'capture-imss'
  | 'capture-institutions'
  | 'capture-intermediaries'
  | 'capture-estafa'
  | 'capture-queue'
  // SD-05 `la-industria-del-intermediario` — the P3 slice of the ARIA pattern
  // aggregate, the Tier-1 queue band, and the sector statistics
  | 'p3-sectors'
  | 'p3-flows'
  | 'p3-ticket'
  | 'p3-file'
  | 'p3-queue'
  // SD-06 `el-ejercito-fantasma` — vendor risk timelines, the ghost-signal
  // ranking, the EFOS-confirmed slice of the queue, and the P2 cohort block
  | 'p2-lifecycle'
  | 'p2-population'
  | 'p2-signals'
  | 'p2-match'
  | 'p2-roster'
  // SD-07 `el-umbral-de-los-300k` — the amount histogram, coarse and fine
  | 'threshold-histogram'
  | 'threshold-exact'
  | 'threshold-institutions'
  | 'threshold-years'
  // SD-08 `la-ilusion-competitiva` — the annual single-award series, the sector
  // statistics, and the vendors that win competitions unopposed
  | 'sb-years'
  | 'sb-mirage'
  | 'sb-sectors'
  | 'sb-vendors'
  | 'sb-count'
  // SD-10 `el-sexenio-del-riesgo` — the annual high-risk series rolled up per
  // administration, the sector ledger across two terms, SEDENA's share, and
  // the category risk indicator
  | 'era-terms'
  | 'era-sectors'
  | 'era-sedena'
  | 'era-categories'
  | 'era-years'
  // SD-09 `marea-de-adjudicaciones` — the annual direct-award series rolled up
  // per administration, zoomed on the emergency, and cut by sector
  | 'da-terms'
  | 'da-line'
  | 'da-emergency'
  | 'da-sectors'
  | 'da-count'

/** ARIA pattern codes from the queue typology (P1–P7). */
export type AriaPattern = 'P1' | 'P2' | 'P3' | 'P4' | 'P5' | 'P6' | 'P7'

/** 12-sector taxonomy keys — kept in sync with constants.ts SECTOR_COLORS. */
export type SectorCode =
  | 'salud'
  | 'educacion'
  | 'infraestructura'
  | 'energia'
  | 'defensa'
  | 'tecnologia'
  | 'hacienda'
  | 'gobernacion'
  | 'agricultura'
  | 'ambiente'
  | 'trabajo'
  | 'otros'

// ---------------------------------------------------------------------------
// Stories — derived from RUBLI data analysis
// ---------------------------------------------------------------------------

/**
 * Stories pulled from every public list and route while under editorial review
 * (weekend #10 round 8). Remove a slug here to republish it; its content below
 * is untouched. el-cartel-de-los-vales: names five issuers, four of them GT
 * false positives; the owner decides its future.
 */
export const UNDER_EDITORIAL_REVIEW: ReadonlySet<string> = new Set(['el-cartel-de-los-vales'])

const ALL_STORIES: StoryDef[] = [
  // === STORY 0: The Gap — recovering the procurement the government stopped publishing ===
  {
    slug: 'el-vacio',
    outlet: 'investigative',
    type: 'thematic',
    era: 'sheinbaum',
    byline: 'RUBLI Investigative Data Unit',
    status: 'solo_datos',
    estimatedMinutes: 9,
    headline: "Mexico Stopped Publishing Its Contracts as Data. We Rebuilt 98,290 Procedures From the Portal.",
    headline_es: "México dejó de publicar sus contratos como datos. Reconstruimos 98,290 procedimientos desde el portal.",
    subheadline:
      "In 2025 Mexico abolished CompraNet, and its federal bulk file stops at September 28. The successor portal still lists what the government buys, but the winner and the price now sit inside scanned award documents rather than data fields. RUBLI rebuilt the 98,290 procedures published after the freeze. 78.3 percent were direct awards. For 52,537 a price could be read off the scans; two in five carry no amount of any kind.",
    subheadline_es:
      "En 2025 México abolió CompraNet, y su archivo masivo federal se detiene el 28 de septiembre. El portal sucesor todavía lista lo que compra el gobierno, pero el ganador y el precio ahora están dentro de documentos de adjudicación escaneados, no en campos de datos. RUBLI reconstruyó los 98,290 procedimientos publicados tras el congelamiento. El 78.3 por ciento fueron adjudicaciones directas. En 52,537 pudo leerse un precio de los escaneos; dos de cada cinco no llevan monto de ningún tipo.",
    leadStat: {
      value: '98,290',
      label: "procedures published after the federal feed froze",
      label_es: "procedimientos publicados tras el congelamiento del flujo federal",
      sublabel: "78.3% direct awards",
      sublabel_es: "78.3% adjudicación directa",
      color: '#b45309',
    },
    kickerStats: [
      {
        prefix: "The feed froze, and after it the portal published",
        prefix_es: "El flujo se congeló, y después el portal publicó",
        value: '98,290',
        suffix: "procedures.",
        suffix_es: "procedimientos.",
        tone: 'data',
      },
      {
        prefix: "Of those,",
        prefix_es: "De ellos,",
        value: '78.3%',
        suffix: "were direct awards — no public tender.",
        suffix_es: "fueron adjudicación directa — sin licitación pública.",
        tone: 'critical',
      },
      {
        prefix: "And",
        prefix_es: "Y el",
        value: '39.7%',
        suffix: "carry no amount of any kind.",
        suffix_es: "no lleva monto de ningún tipo.",
        tone: 'muted',
      },
    ],
    relatedSlugs: ['el-ejercito-fantasma', 'la-ilusion-competitiva', 'captura-institucional'],
    lensTags: {
      patterns: ['P2', 'P5'],
      sectors: ['salud'],
      years: [2025, 2026],
      terms: ['ComprasMX', 'CompraNet', 'adjudicación directa', 'transparencia'],
    },
    nextSteps: [
      'File transparency requests for the unredacted award files of the largest direct awards in the recovered record, starting with those that cite the discretionary Art. 54 grounds.',
      'Cross-reference every recovered vendor RFC against SAT\'s 69-B (EFOS) list as the long-tail OCR completes.',
      'Check the vendors the /gap register flags as incorporated less than three years before their award against company registries before drawing any conclusion — a young firm is a reason to look, not a finding.',
      'Request the written justificación de excepción from the buyers that cite discretionary sole-source grounds (Art. 54 fr. I/II/III) most often.',
      'Compare each buyer\'s direct-award share here with its own 2023–24 CompraNet procedures — procedures against procedures — before reading any change into it.',
    ],
    nextSteps_es: [
      'Solicitar vía transparencia los expedientes sin testar de las adjudicaciones directas más grandes del registro recuperado, empezando por las que citan las causales discrecionales del Art. 54.',
      'Cruzar cada RFC de proveedor recuperado contra la lista 69-B (EFOS) del SAT conforme termine el OCR del rezago.',
      'Contrastar con los registros mercantiles a los proveedores que el registro de /gap marca como constituidos menos de tres años antes de su adjudicación, antes de sacar cualquier conclusión — una empresa joven es razón para mirar, no un hallazgo.',
      'Solicitar la justificación de excepción por escrito a los compradores que más citan causales discrecionales de proveedor único (Art. 54 fr. I/II/III).',
      'Comparar la proporción de adjudicación directa de cada comprador aquí con sus propios procedimientos de CompraNet de 2023–24 — procedimientos contra procedimientos — antes de leer cualquier cambio en ella.',
    ],
    chapters: [
      {
        id: 'ch1',
        number: 1,
        title: "The Year the Feed Stopped",
        title_es: "El año en que se detuvo el flujo",
        subtitle: "Mexico abolished CompraNet, dissolved its transparency institute, and its bulk procurement file stopped",
        subtitle_es: "México abolió CompraNet, disolvió su instituto de transparencia, y su archivo masivo de compras se detuvo",
        prose: [
          "Mexico spent twenty years building a record of who its government pays and why. In 2025 that record changed shape. In March, the autonomous transparency institute, INAI, was dissolved. In April, CompraNet — the federal procurement system that for two decades published a yearly bulk file of vendor, amount, date, and procedure type — was legally abolished. The last record in its bulk file is dated September 28; the file was updated for the last time the next day.",
          "ComprasMX, run by the new Secretaría Anticorrupción, still lists each procedure: who is buying, what, by which method, under which legal exception. What it no longer publishes as data is who won and for how much. That now sits inside scanned award documents, read one at a time, with no bulk export.",
          "The contracts didn't stop, and the record didn't vanish. Nothing was classified or deleted; the winner and the price moved from a data field into a picture of a page. For anyone trying to follow the money across thousands of procedures, that is a different and much harder problem. This story is about reading it anyway.",
        ],
        prose_es: [
          "México tardó veinte años en construir un registro de a quién le paga su gobierno y por qué. En 2025 ese registro cambió de forma. En marzo, el instituto autónomo de transparencia, el INAI, fue disuelto. En abril, CompraNet — el sistema de compras federales que durante dos décadas publicó un archivo masivo anual con proveedor, monto, fecha y tipo de procedimiento — fue abolido legalmente. El último registro de su archivo masivo tiene fecha del 28 de septiembre; el archivo se actualizó por última vez al día siguiente.",
          "ComprasMX, operado por la nueva Secretaría Anticorrupción, todavía lista cada procedimiento: quién compra, qué, por qué método y bajo qué excepción legal. Lo que ya no publica como datos es quién ganó y por cuánto. Eso ahora está dentro de documentos de adjudicación escaneados, que se leen uno a la vez, sin exportación masiva.",
          "Los contratos no se detuvieron, y el registro no desapareció. Nada se clasificó ni se borró; el ganador y el precio pasaron de un campo de datos a la imagen de una página. Para quien intenta seguir el dinero a través de miles de procedimientos, ese es un problema distinto y mucho más difícil. Esta historia trata de leerlo de todos modos.",
        ],
        chartConfig: {
          type: 'live',
          live: 'gap-blackout',
          scrolly: true,
          chartId: 'gap-blackout',
          title: 'Twenty-three years of record, then silence',
          title_es: 'Veintitrés años de registro, luego silencio',
        },
        pullquote: {
          quote: "The contracts didn't stop, and nothing was deleted. The winner and the price moved from a data field into a picture of a page.",
          quote_es: "Los contratos no se detuvieron, y nada se borró. El ganador y el precio pasaron de un campo de datos a la imagen de una página.",
          stat: 'Sep 28 2025',
          statLabel: "the date of the last record in the federal procurement file",
          statLabel_es: "la fecha del último registro en el archivo federal de contratación",
        },
      },
      {
        id: 'ch2',
        number: 2,
        title: "We Read the Silence",
        title_es: "Leímos el silencio",
        subtitle: "The successor portal guarded each request with a signature — and that signature could be reproduced",
        subtitle_es: "El portal sucesor protegía cada petición con una firma — y esa firma pudo reproducirse",
        prose: [
          "A portal that shows you one procedure at a time is not the same as a portal that hides them. ComprasMX guarded every request with a cryptographic signature that ordinary automated tools cannot produce. That signature turned out to be a self-contained scheme — no human-verification gate behind it — and it could be reproduced. Once it was, the whole catalogue became queryable again, exactly as the old bulk file used to be.",
          "The recovery ran in two passes. The first enumerated every procedure published after the freeze: 98,290 of them, complete with who bought what, by which method, when, and under which legal exception. The second went after the part the portal does not publish as data — the winning vendor and the price — which survive only inside scanned award documents, images rather than text. Optical character recognition pulled those back off the page, one notification of award at a time.",
          "None of this is privileged. Every figure here was published by the Mexican state in 2025 and 2026 — just in a form that is very hard to read whole. Reassembled, it is the closest thing that exists to a record of what Mexico has bought since the feed stopped.",
        ],
        prose_es: [
          "Un portal que muestra un procedimiento a la vez no es lo mismo que un portal que los esconde. ComprasMX protegía cada petición con una firma criptográfica que las herramientas automatizadas comunes no pueden producir. Esa firma resultó ser un esquema autocontenido — sin verificación humana detrás — y pudo reproducirse. Una vez hecho, todo el catálogo volvió a ser consultable, igual que el viejo archivo masivo.",
          "La recuperación corrió en dos etapas. La primera enumeró cada procedimiento publicado tras el congelamiento: 98,290, con quién compró qué, por qué método, cuándo y bajo qué excepción legal. La segunda fue por lo que el portal no publica como datos — el proveedor ganador y el precio — que sobreviven solo dentro de documentos de adjudicación escaneados, imágenes en lugar de texto. El reconocimiento óptico de caracteres los sacó de la página, una notificación de adjudicación a la vez.",
          "Nada de esto es información privilegiada. Cada cifra aquí fue publicada por el Estado mexicano en 2025 y 2026 — solo que en una forma muy difícil de leer completa. Reensamblada, es lo más parecido que existe a un registro de lo que México ha comprado desde que se detuvo el flujo.",
        ],
        chartConfig: {
          type: 'live',
          live: 'gap-funnel',
          chartId: 'gap-funnel',
          title: 'The recovery, in three cuts',
          title_es: 'La recuperación, en tres cortes',
        },
        pullquote: {
          quote: "Every figure here was published by the Mexican state — just in a form that is very hard to read whole.",
          quote_es: "Cada cifra aquí fue publicada por el Estado mexicano — solo que en una forma muy difícil de leer completa.",
          stat: '98,290',
          statLabel: "procedures reassembled from the successor portal",
          statLabel_es: "procedimientos reensamblados del portal sucesor",
        },
      },
      {
        id: 'ch3',
        number: 3,
        title: "Four in Five, No Tender",
        title_es: "Cuatro de cada cinco, sin licitación",
        subtitle: "The recovered record runs on direct awards — and is silent on what two in five procedures cost",
        subtitle_es: "El registro recuperado funciona con adjudicación directa — y calla cuánto cuestan dos de cada cinco procedimientos",
        prose: [
          "Of the 98,290 procedures, 76,996 were direct awards with no public tender: adjudicación directa, 78.3 percent. Mexican procurement law treats direct award as an exception to open bidding, allowed on specific grounds and requiring a written justification for each one. Four in five is not an exception regime. It is the default, and the chart below shows how lopsided it is — every other route together accounts for the remaining 21,294.",
          "Then there is the silence on cost. Two of every five procedures — 38,974 — carry no amount of any kind: not a final price, not even an estimate. The record shows that the state bought something, from someone, and not for how much. About 31,000 procedures cite the low-value threshold (Art. 55), legitimate small purchases that sit below the bidding floor. The discretionary sole-source grounds — Art. 54, the fractions that let a buyer name its supplier outright — carry the big-ticket contracts, the ones worth hundreds of millions where competition was waived.",
          "No rival bids to compare and, for two in five procedures, no price at all: whatever the reason, the public record can no longer be checked the way CompraNet's file could.",
        ],
        prose_es: [
          "De los 98,290 procedimientos, 76,996 fueron adjudicaciones directas sin licitación pública: adjudicación directa, 78.3 por ciento. La ley mexicana de adquisiciones trata la adjudicación directa como una excepción a la licitación abierta, permitida por causales específicas y con una justificación escrita exigida para cada una. Cuatro de cada cinco no es un régimen de excepción. Es la regla, y la gráfica de abajo muestra qué tan desbalanceado está — todas las demás vías juntas suman los 21,294 restantes.",
          "Luego está el silencio sobre el costo. Dos de cada cinco procedimientos — 38,974 — no llevan monto de ningún tipo: ni precio final, ni siquiera un estimado. El registro muestra que el Estado compró algo, a alguien, y no por cuánto. Unos 31,000 procedimientos citan el umbral de bajo monto (Art. 55), compras pequeñas legítimas que están por debajo del piso de licitación. Las causales discrecionales de proveedor único — Art. 54, las fracciones que permiten a una dependencia nombrar a su proveedor sin concurso — cargan los contratos de gran valor, los de cientos de millones donde se renunció a la competencia.",
          "Sin ofertas rivales que comparar y, en dos de cada cinco procedimientos, sin precio alguno: sea cual sea la razón, el registro público ya no puede revisarse como se revisaba el archivo de CompraNet.",
        ],
        chartConfig: {
          type: 'inline-bar',
          title: 'How the 98,290 procedures were run',
          title_es: 'Cómo se llevaron a cabo los 98,290 procedimientos',
          chartId: 'gap-procedure-types',
          highlight: 'Adjudicación directa',
          // Both rows come straight out of /gap/summary: `direct_award_count`
          // and `total_contracts − direct_award_count`. The endpoint publishes
          // no per-procedure-type breakdown, so the other side stays a single
          // honest row rather than a split this cut cannot support.
          live: 'gap-exceptions',
          liveAfter: true,
          data: {
            points: [
              {
                label: 'Adjudicación directa',
                label_en: 'Direct award (no tender)',
                value: 76996,
                annotation: '78.3% — NO PUBLIC TENDER',
                annotation_es: '78.3% — SIN LICITACIÓN PÚBLICA',
                highlight: true,
              },
              {
                label: 'Otras vías',
                label_en: 'Every other route',
                value: 21294,
                annotation: '21.7% — TENDER, INVITATION TO 3, FRAMEWORK AND OTHERS',
                annotation_es: '21.7% — LICITACIÓN, INVITACIÓN A 3, ACUERDO MARCO Y OTRAS',
              },
            ],
            unit: 'procedures',
            mode: 'dominance',
            stamp: { en: 'RECOVERED · OCR', es: 'RECUPERADO · OCR' },
            annotation:
              'Procedure type for all 98,290 procedures recovered after the Sep 28 2025 freeze. Direct award — no public tender — accounts for 78.3%. Every other route combined takes the remaining 21,294.',
            annotation_es:
              'Tipo de procedimiento para los 98,290 procedimientos recuperados tras el congelamiento del 28 de septiembre de 2025. La adjudicación directa — sin licitación pública — representa el 78.3%. Todas las demás vías juntas se llevan los 21,294 restantes.',
          },
        },
        pullquote: {
          quote: "The record shows that the state bought something, from someone, and not for how much.",
          quote_es: "El registro muestra que el Estado compró algo, a alguien, y no por cuánto.",
          stat: '39.7%',
          statLabel: "of procedures carry no amount of any kind",
          statLabel_es: "de los procedimientos no llevan monto de ningún tipo",
        },
      },
      {
        id: 'ch4',
        number: 4,
        title: "What the Scans Hold",
        title_es: "Lo que guardan los escaneos",
        subtitle: "Read off the images: 356.0 billion pesos across 52,537 direct awards",
        subtitle_es: "Leído de las imágenes: 356,000 millones de pesos en 52,537 adjudicaciones directas",
        prose: [
          "For 52,537 procedures — 53.5 percent — optical recognition read a price off the scanned award document: 356.0 billion pesos that appear in no structured public dataset. The recovery covered direct awards only, and the total is lopsided: four contracts account for about 74 billion of it. It is what could be read, not an estimate of what was spent.",
          "Some winners are young. The register flags 354 vendors whose tax ID shows they were incorporated less than three years before their award. A young company is a reason to look, not a finding: many legitimate firms win their first federal contract early.",
          "Nothing here was classified; most of it is nominally public. Reading it meant reproducing a signature, downloading an image and running it through character recognition — a technical barrier most reporters cannot clear.",
        ],
        prose_es: [
          "En 52,537 procedimientos — el 53.5 por ciento — el reconocimiento óptico leyó un precio del documento de adjudicación escaneado: 356,000 millones de pesos que no aparecen en ningún conjunto de datos público estructurado. La recuperación abarcó solo adjudicaciones directas, y el total está cargado: cuatro contratos suman unos 74,000 millones. Es lo que pudo leerse, no un estimado de lo que se gastó.",
          "Algunos ganadores son jóvenes. El registro marca 354 proveedores cuyo RFC indica que se constituyeron menos de tres años antes de su adjudicación. Una empresa joven es razón para mirar, no un hallazgo: muchas empresas legítimas ganan pronto su primer contrato federal.",
          "Nada de esto se clasificó; la mayor parte es nominalmente pública. Leerlo exigía reproducir una firma, descargar una imagen y pasarla por reconocimiento de caracteres — una barrera técnica que la mayoría de los reporteros no puede superar.",
        ],
        chartConfig: {
          type: 'live',
          live: 'gap-buyers',
          chartId: 'gap-buyers',
          title: 'Who bought in the dark',
          title_es: 'Quién compró a oscuras',
        },
        pullquote: {
          quote: "Nothing here was classified. Reading it meant reproducing a signature, downloading an image and running it through character recognition.",
          quote_es: "Nada de esto se clasificó. Leerlo exigía reproducir una firma, descargar una imagen y pasarla por reconocimiento de caracteres.",
          stat: '356.0B MXN',
          statLabel: "in direct awards, read off scanned award documents",
          statLabel_es: "en adjudicaciones directas, leídos de documentos de adjudicación escaneados",
          barValue: 0.535,
          vizTemplate: 'dot-ratio',
          barLabel: '52,537 of 98,290 procedures · price read off scans',
          barLabel_es: '52,537 de 98,290 procedimientos · precio leído de escaneos',
        },
      },
      {
        id: 'ch5',
        number: 5,
        title: "Grading the Dark",
        title_es: "Calificar la oscuridad",
        subtitle: "Where the record stopped being data, an outside record can still grade what it shows",
        subtitle_es: "Donde el registro dejó de ser datos, un registro externo todavía puede calificar lo que muestra",
        prose: [
          "A list of recovered procedures is not yet an accountability tool. So RUBLI assigns each of the 98,290 procedures a structural red-flag grade — exactly that, not a probability of corruption. It cannot be the platform's trained risk model, because post-freeze data lacks the features that model needs. Instead it weighs what can be observed: absence of competition, absence of a disclosed price, a discretionary sole-source justification, a very young or SAT-listed vendor, single-vendor concentration, and contract size. Routine low-value purchases score low, so the flag means something when it is raised.",
          "Graded that way, 13.6 percent of the recovered procedures land in the high or critical bands, 297 of them critical. The grade counts structural flags; it is not a finding about any buyer or vendor, and it will move as the long-tail recovery reads more documents.",
          "Mexico's procurement record changed shape in a single year, and the spending did not pause for it. Where the winner and the price stopped being published as data, an outside record can read them back, price what it can and grade what it shows — not to replace the state's accountability, but to keep its absence from being the end of the story.",
        ],
        prose_es: [
          "Una lista de procedimientos recuperados todavía no es una herramienta de rendición de cuentas. Por eso RUBLI asigna a cada uno de los 98,290 procedimientos una calificación estructural de banderas — etiquetada honestamente como tal, no como una probabilidad de corrupción. No puede ser el modelo de riesgo entrenado de la plataforma, porque los datos posteriores al congelamiento carecen de las variables que ese modelo necesita. En cambio, pondera lo observable: ausencia de competencia, ausencia de un precio revelado, una justificación discrecional de proveedor único, un proveedor muy joven o listado por el SAT, concentración en un solo proveedor, y el tamaño del contrato. Las compras rutinarias de bajo monto califican bajo, de modo que la bandera significa algo cuando se levanta.",
          "Calificados así, el 13.6 por ciento de los procedimientos recuperados caen en las bandas alta o crítica, 297 de ellos en crítica. La calificación cuenta banderas estructurales; no es un hallazgo sobre ningún comprador ni proveedor, y se moverá conforme la recuperación del rezago lea más documentos.",
          "El registro de compras de México cambió de forma en un solo año, y el gasto no se detuvo por ello. Donde el ganador y el precio dejaron de publicarse como datos, un registro externo puede leerlos de vuelta, poner precio a lo que puede y calificar lo que muestra — no para reemplazar la rendición de cuentas del Estado, sino para que su ausencia no sea el final de la historia.",
        ],
        chartConfig: {
          type: 'live',
          live: 'gap-grade',
          chartId: 'gap-grade',
          title: 'The dark, graded',
          title_es: 'La oscuridad, calificada',
        },
        pullquote: {
          quote: "Where the winner and the price stopped being published as data, an outside record can read them back.",
          quote_es: "Donde el ganador y el precio dejaron de publicarse como datos, un registro externo puede leerlos de vuelta.",
          stat: '13.6%',
          statLabel: "of recovered procedures carry high or critical structural flags",
          statLabel_es: "de los procedimientos recuperados con banderas rojas estructurales altas o críticas",
        },
      },
    ],
  },
  // === STORY 1: The Man Who Won 370 Million Pesos and Disappeared ===
  {
    slug: 'el-ejercito-fantasma',
    outlet: 'investigative',
    type: 'thematic',
    era: 'cross',
    byline: 'RUBLI Investigative Data Unit',
    status: 'solo_datos',
    estimatedMinutes: 11,
    headline: "The Man Who Won 370 Million Pesos and Disappeared",
    headline_es: "El hombre que ganó 370 millones de pesos y desapareció",
    subheadline:
      "One vendor in the record is a sole trader (persona física) — one person, not a company — holding two federal contracts worth roughly 370 million pesos, with no record before and none after. RUBLI's algorithm flagged that vendor on its ghost-company pattern in May 2026. After the October 2026 run on the retrained risk model, RUBLI's public queue lists 3,024 vendors under the pattern across 23 years; it leaves out private individuals and vendors cleared on review, and that vendor is not among them. Mexico's tax authority has officially confirmed 203 of the 3,024. The other 2,821 are still contracting with the government.",
    subheadline_es:
      "Un proveedor del registro es una persona física — un individuo, no una empresa — con dos contratos federales por unos 370 millones de pesos, sin registro antes ni después. El algoritmo de RUBLI lo marcó con el patrón de empresa fantasma en mayo de 2026. Tras la corrida de octubre de 2026 sobre el modelo de riesgo reentrenado, la fila pública de RUBLI lista a 3,024 proveedores con el patrón a lo largo de 23 años; deja fuera a personas físicas y a proveedores descartados en revisión, y ese proveedor no está entre ellos. La autoridad fiscal mexicana ha confirmado oficialmente a 203 de los 3,024. Los otros 2,821 siguen contratando con el gobierno.",
    leadStat: {
      value: '3,024',
      label: "vendors in the public queue matching the ghost pattern, October 2026 run",
      label_es: "proveedores de la fila pública con el patrón fantasma, corrida de octubre de 2026",
      sublabel: "6.7% officially confirmed",
      sublabel_es: "6.7% confirmados oficialmente",
      color: '#dc2626',
    },
    kickerStats: [
      {
        prefix: "One person, not a company, won",
        prefix_es: "Una persona, no una empresa, ganó",
        value: '370M MXN',
        suffix: "pesos — then vanished from the record.",
        suffix_es: "de pesos — y luego desapareció del registro.",
        tone: 'critical',
      },
      {
        prefix: "The pattern he was flagged on now covers",
        prefix_es: "El patrón con el que se le marcó ahora abarca",
        value: '3,024',
        suffix: "vendors.",
        suffix_es: "proveedores.",
        tone: 'data',
      },
      {
        prefix: "Official enforcement has confirmed only",
        prefix_es: "La autoridad fiscal solo ha confirmado a",
        value: '203',
        suffix: "of them.",
        suffix_es: "de ellos.",
        tone: 'muted',
      },
    ],
    relatedSlugs: [
      'el-umbral-de-los-300k',
      'la-industria-del-intermediario',
      'captura-institucional',
    ],
    lensTags: {
      patterns: ['P2'],
      terms: ['fantasma', 'ghost', 'SAT', 'Art. 69-B'],
    },
    nextSteps: [
      "File freedom-of-information requests to SFP for the complete vendor investigation queue — do any of RUBLI's 2,821 unconfirmed P2 vendors appear?",
      'Cross-reference the top 50 P2-pattern vendors by value against RUPC (Registro Único de Proveedores y Contratistas) to verify business registration and physical address.',
      "Request SAT disclosure of the Art. 69-B investigation pipeline — how many vendors are currently in provisional status and how does the pipeline's priority ranking compare to RUBLI's?",
      'Interview procurement officials at the top five institutions that awarded contracts to the highest-value P2 vendors; request meeting records and bid evaluation documents.',
      'File UIF financial intelligence request for bank transaction tracing on the top 20 individual-person P2 contractors (those with physical persons rather than companies as vendor names).',
      'Pursue criminal complaint under Art. 222 del Código Penal Federal (cohecho) for specific vendor-official pairs where RUBLI flags systematic repetition.',
    ],
    nextSteps_es: [
      'Solicitar por transparencia a la SFP la fila completa de investigaciones de proveedores — ¿aparecen algunos de los 2,821 proveedores P2 sin confirmar de RUBLI?',
      'Cruzar los 50 proveedores P2 de mayor valor contra el RUPC para verificar registro mercantil y domicilio fiscal.',
      'Solicitar al SAT la divulgación de la fila de investigación del Art. 69-B — ¿cuántos proveedores están en estatus provisional y cómo se compara la prioridad del SAT con la de RUBLI?',
      'Entrevistar a funcionarios de compras en las cinco instituciones que adjudicaron contratos a los proveedores P2 de mayor valor; solicitar actas de reunión y documentos de evaluación.',
      'Presentar solicitud de inteligencia financiera a la UIF para rastrear transacciones bancarias de los 20 contratistas personas físicas P2 de mayor valor.',
      'Interponer denuncia penal bajo el Art. 222 del Código Penal Federal (cohecho) para pares proveedor-funcionario donde RUBLI detecta repetición sistemática.',
    ],
    // Weekend #10 round 8: the named roster was removed. No vendor in it had a
    // documented (tier A/B, non-FP) case link; the story keeps cohort statistics.
    entities: [
    ],
    corrections: [
      "2026-09-19 — An earlier edition of chapter four called a named individual's registration \"the shell\". The register supports calling it a flagged vendor; the story asserts nothing more about him.",
      "2026-09-30 — Earlier editions named three private individuals (personas físicas) flagged by the P2 algorithm. They are on no SAT or SFP list, in no documented case and charged with nothing; their names have been removed. The pattern analysis is unchanged.",
      "2026-09-19 — An earlier edition closed chapter four with \"1,954 vendors sanctioned\" beside the 99 SFP matches named in the sentence before it. The 1,954 is the SFP's whole docket for 2002-2025; 99 is what matches the P2-flagged cohort.",
      "2026-10-14 — RUBLI retrained its risk model (v0.8.5 to v0.9.1) and re-ran ARIA on 13 October 2026. RUBLI's public queue, which leaves out private individuals, public entities and vendors cleared on review, now lists 3,024 vendors under the ghost pattern, not 6,118; SAT's definitive list confirms 203 of them (6.7 percent, one in 15), not 126 (2.1 percent, one in 49); the cohort holds 19.6 billion pesos, not 39.6; and one P2 vendor matches an SFP sanction, not 99. None of the five vendors chapter 1 names appears under the ghost pattern in the public queue after the re-run; the story says so where it names them.",
    ],
    corrections_es: [
      "2026-09-19 — Una edición anterior del capítulo cuatro llamaba «la fachada» al registro de una persona con nombre. El registro sostiene llamarlo proveedor marcado; la historia no afirma nada más sobre él.",
      "2026-09-30 — Ediciones anteriores nombraban a tres personas físicas marcadas por el algoritmo P2. No aparecen en ninguna lista del SAT ni de la SFP, en ningún caso documentado y no se les ha imputado nada; sus nombres se retiraron. El análisis del patrón no cambia.",
      "2026-09-19 — Una edición anterior cerraba el capítulo cuatro con «1,954 proveedores sancionados» junto a los 99 empates de la SFP nombrados en la frase anterior. Los 1,954 son el expediente completo de la SFP de 2002 a 2025; 99 es lo que empata con la población marcada por P2.",
      "2026-10-14 — RUBLI reentrenó su modelo de riesgo (de v0.8.5 a v0.9.1) y volvió a correr ARIA el 13 de octubre de 2026. La fila pública de RUBLI, que deja fuera a personas físicas, entidades públicas y proveedores descartados en revisión, lista ahora a 3,024 proveedores con el patrón fantasma, no 6,118; la lista definitiva del SAT confirma a 203 (6.7 por ciento, uno de cada 15), no a 126 (2.1 por ciento, uno de cada 49); la cohorte suma 19,600 millones de pesos, no 39,600; y un solo proveedor P2 empata con una sanción de la SFP, no 99. Ninguno de los cinco proveedores que nombra el capítulo 1 aparece con el patrón fantasma en la fila pública tras la nueva corrida; la historia lo dice donde los nombra.",
    ],
    chapters: [
      {
        id: 'ch1',
        number: 1,
        title: "The Vendor With No Past and No Future",
        title_es: "El proveedor sin pasado ni futuro",
        subtitle: "One person, two contracts, 370 million pesos, then nothing",
        subtitle_es: "Una persona, dos contratos, 370 millones de pesos, y después nada",
        prose: [
          "One vendor exists in the federal procurement record as a single line. It is a sole trader, a persona física — a physical person, not a company — and he holds two contracts worth approximately 370 million pesos, between 18 and 25 million US dollars. No contracting history precedes the registration; none follows. The activity concentrates inside one institution across one year, and then it stops. One person, two contracts, 370 million pesos, and then nothing. RUBLI withholds the name: this is a private individual, and nothing in the public record goes beyond a contracting shape.",
          "The shape is not unique. A second sole trader holds two contracts worth roughly 370 million pesos and then disappears from the record. A third repeats the line exactly: 370 million pesos, two contracts, a single person rather than a company, gone afterward. Three identical rows. Mexican law does let individuals win federal contracts, and legitimate cases exist — specialized consulting, artistic commissions, small local services — but none of them obviously explains 370 million pesos awarded to a single person. What must be said plainly: none of the three appears on SAT's Art. 69-B list, none carries an SFP sanction, none is a documented corruption case, and none has been charged with anything. RUBLI's flag is a description of a contracting shape and an invitation to report, not a finding against any of them.",
          "RUBLI found the first of them with a lens that reads behavior, not names or domiciles. Its Pattern 2 (P2) algorithm weighs a sudden single-year appearance, contract values 10 to 50 times the sector median, no prior or subsequent activity, an RFC that resolves to nothing in the Registro Único de Proveedores y Contratistas, and bursts measured in weeks rather than years. That is why the chart below sets two foreign-domiciled companies — RAPISCAN SYSTEMS INC at 2,509 MDP, APIS FOOD BV at 732 MDP — beside three personas físicas, names withheld, each between 373 and 376 MDP. The algorithm flagged all five on conduct alone in its May 2026 run. After the October 2026 run none of the five appears under the ghost pattern in RUBLI's public queue: three were re-filed under the intermediary pattern, and the public lists leave out private individuals and vendors cleared on review. A flag describes a contracting record, never a finding about the person.",
        ],
        prose_es: [
          "Un proveedor aparece en el registro federal de contrataciones como una sola línea. Es una persona física — un individuo, no una empresa — y tiene dos contratos por aproximadamente 370 millones de pesos, entre 18 y 25 millones de dólares. No hay historial de contratación antes del registro; tampoco después. Su actividad se concentra en una sola institución durante un solo año, y luego se detiene. Una persona, dos contratos, 370 millones de pesos, y después nada. RUBLI omite el nombre: es un particular, y nada en el registro público va más allá de una forma de contratación.",
          "La forma no es única. Una segunda persona física tiene dos contratos por unos 370 millones de pesos y después desaparece del registro. Una tercera repite la línea idéntica: 370 millones de pesos, dos contratos, una persona y no una empresa, esfumada después. Tres renglones idénticos. La ley mexicana sí permite que personas físicas ganen contratos federales, y existen casos legítimos — consultoría especializada, comisiones artísticas, pequeños servicios locales — pero ninguno explica a simple vista 370 millones de pesos adjudicados a una sola persona. Lo que hay que decir con todas sus letras: ninguno de los tres aparece en la lista del Art. 69-B del SAT, ninguno carga una sanción de la SFP, ninguno es un caso de corrupción documentado y a ninguno se le ha imputado nada. La marca de RUBLI describe una forma de contratación e invita a reportear; no es un hallazgo en contra de ninguno de ellos.",
          "RUBLI encontró a la primera con un lente que lee conducta, no nombres ni domicilios. Su algoritmo de Patrón 2 (P2) pondera una aparición súbita en un solo año, montos de 10 a 50 veces la mediana del sector, sin actividad previa ni posterior, un RFC que no resuelve a nada en el Registro Único de Proveedores y Contratistas, y ráfagas medidas en semanas y no en años. Por eso la gráfica coloca a dos empresas de domicilio extranjero — RAPISCAN SYSTEMS INC con 2,509 MDP, APIS FOOD BV con 732 MDP — junto a tres personas físicas, con nombre omitido, cada una entre 373 y 376 MDP. El algoritmo marcó a los cinco solo por su conducta en su corrida de mayo de 2026. Tras la corrida de octubre de 2026 ninguno de los cinco aparece con el patrón fantasma en la fila pública de RUBLI: tres pasaron al patrón de intermediario, y las listas públicas dejan fuera a personas físicas y a proveedores descartados en revisión. Una marca describe un registro de contratación, nunca un hallazgo sobre la persona.",
        ],
        chartConfig: {
          // SD-06: the typed five-row roster is now two live plates. F1 draws
          // each named vendor's whole contracting life against the 24-year
          // record and steps with the prose; F5 is the wider live roster with
          // every review disposition printed.
          type: 'live',
          live: 'p2-lifecycle',
          scrolly: true,
          live2: 'p2-roster',
          chartId: 'p2-lifecycle',
          title: 'Five contracting lives, drawn against the whole record',
          title_es: 'Cinco vidas de contratación, sobre todo el registro',
        },
        pullquote: {
          quote:
            "One person — not a company — winning federal contracts worth 370 million pesos, then disappearing from the record entirely.",
          quote_es:
            "Una sola persona — no una empresa — ganando contratos federales por 370 millones de pesos, y luego desapareciendo del registro por completo.",
          stat: '370M MXN',
          statLabel: "won by one individual, two contracts, then gone",
          statLabel_es: "ganados por un individuo, dos contratos, y después nada",
        },
        sources: [
          'RUBLI vendor_stats and aria_queue tables, queried April 2026.',
          'COMPRANET (SHCP). Federal procurement records 2002-2025.',
          'RUBLI ARIA Pipeline v1.1. Pattern 2 (P2) classification, run ID 28d5c453, March 25 2026.',
        ],
      },
      {
        id: 'ch2',
        number: 2,
        title: "Pull Back the Camera",
        title_es: "Abramos el plano",
        subtitle: "From one anomaly to a population of 3,024",
        subtitle_es: "De una anomalía a una población de 3,024",
        prose: [
          "Official enforcement has confirmed 203 of the 3,024 vendors that match the pattern — a detection rate of 6.7 percent, one in 15. Across the 3,051,294 scored federal contracts from 2002 through 2025, RUBLI's P2 algorithm, re-run on 13 October 2026, flags those 3,024 vendors, representing 19.6 billion pesos in contract value; cross-checking them against Mexico's definitive ghost-company registry returns exactly 203 matches. The other 14 in every 15 are still under contract. That single ratio, not any one vendor, is the story.",
          "The benchmark behind it is Mexico's gold standard. The Servicio de Administración Tributaria (SAT) maintains the definitive list of confirmed ghost companies under Article 69-B of the Código Fiscal de la Federación — the EFOS registry. As of April 2026 it holds 13,960 entities and reaches back to 2014. The list took a decade to assemble, each case proven individually with simulated invoices and sworn testimony. Against RUBLI's live P2 field, that decade of work produces 126 matches.",
          "The split is stark: 203 confirmed, 2,821 not. That is not proof every flagged vendor is a ghost — P2 classifies behavior, and some will prove legitimate, specialized or foreign suppliers, since foreign domicile is routine in Mexican contracting and never the signal. How many of the 2,821 are real ghosts is not something this data can answer, and no published study RUBLI can cite puts a rate on it. What the ratio establishes is the size of the gap between an official list built case by case over a decade and a behavioural screen that runs in under an hour. SAT has confirmed 203.",
        ],
        prose_es: [
          "La autoridad fiscal ha confirmado a 203 de los 3,024 proveedores que coinciden con el patrón — una tasa de detección de 6.7 por ciento, uno de cada 15. Sobre los 3,051,294 contratos federales calificados de 2002 a 2025, el algoritmo P2 de RUBLI, corrido de nuevo el 13 de octubre de 2026, marca a esos 3,024 proveedores, que representan 19,600 millones de pesos en valor contratado; el cruce contra el registro definitivo de empresas fantasma de México arroja exactamente 203 coincidencias. Los otros 14 de cada 15 siguen contratando. Esa sola proporción, y no un proveedor en particular, es la historia.",
          "El referente detrás es el estándar de oro de México. El Servicio de Administración Tributaria (SAT) mantiene la lista definitiva de empresas fantasma confirmadas bajo el Artículo 69-B del Código Fiscal de la Federación — el registro EFOS. A abril de 2026 reúne 13,960 entidades y se remonta a 2014. La lista tardó una década en armarse, cada caso probado uno por uno con facturas simuladas y declaraciones bajo protesta de decir verdad. Frente al campo vivo de P2 de RUBLI, esa década de trabajo produce 126 coincidencias.",
          "La división es contundente: 203 confirmados, 2,821 no. Eso no prueba que cada proveedor marcado sea una fantasma — P2 clasifica conducta, y algunos resultarán legítimos, proveedores especializados o extranjeros, porque el domicilio extranjero es rutina en la contratación mexicana y nunca es la señal. Cuántos de los 2,821 son fantasmas reales no es algo que estos datos puedan responder, y no hay un estudio publicado que RUBLI pueda citar con una tasa. Lo que el cociente sí establece es el tamaño de la brecha entre una lista oficial armada caso por caso durante una década y un tamiz conductual que corre en menos de una hora. El SAT ha confirmado 203.",
        ],
        chartConfig: {
          // SD-06 F2: the cohort as a distribution over lifetime value, never
          // a grid tally of circles.
          type: 'live',
          live: 'p2-population',
          chartId: 'p2-population',
          title: 'A crowd of small vendors, and a tail with five names on it',
          title_es: 'Una multitud de proveedores chicos, y un resto con cinco nombres',
        },
        pullquote: {
          quote:
            "One in 15 vendors the algorithm flags on the ghost pattern has been officially confirmed by SAT. The other 14 keep contracting with the government.",
          quote_es:
            "Uno de cada 15 proveedores que el algoritmo marca con el patrón fantasma ha sido confirmado oficialmente por el SAT. Los otros 14 siguen contratando con el gobierno.",
          stat: '6.7%',
          statLabel: "official detection rate against the P2 population",
          statLabel_es: "tasa de detección oficial frente a la población P2",
          barValue: 0.0671,
          barLabel: '6.7% officially detected',
          barLabel_es: '6.7% detectados oficialmente',
          vizTemplate: 'mass-sliver',
        },
        sources: [
          'SAT. (2026). Listado definitivo de contribuyentes que facturaron operaciones simuladas (Art. 69-B LISR). Servicio de Administración Tributaria.',
          'RUBLI SAT EFOS cross-reference table, April 2026.',
          'RUBLI ARIA pipeline, Pattern 2 (P2) classification, run 0fe1409e, 13 October 2026 (/aria/queue?pattern=P2, with and without efos_only).',
          'OECD (2023). Public procurement performance: A framework for measuring efficiency, compliance and strategic goals. OECD Public Governance Policy Papers No. 36.',
        ],
      },
      {
        id: 'ch3',
        number: 3,
        title: "Why the Official List Is Always Late",
        title_es: "Por qué la lista oficial siempre llega tarde",
        subtitle: "Tax enforcement is retrospective; procurement fraud is prospective",
        subtitle_es: "La fiscalización mira al pasado; el fraude en contrataciones mira al futuro",
        prose: [
          "SAT's fastest definitive listing takes six months; its worst case runs past three years. RUBLI's last full pipeline run scored every vendor in the register in under an hour. A genuine shell company can collect hundreds of millions of pesos and dissolve long before any official list reaches it — and it can keep contracting the entire time, because the definitive listing is the only trigger for procurement exclusion.",
          "The procedure dictates the delay. Article 69-B requires SAT to prove, with simulated invoices and operational records, that an entity issued fiscal receipts without underlying economic activity — proof built from bank records, third-party testimony, and on-site visits. A provisional listing then publishes in the Diario Oficial de la Federación with a 30-day rebuttal period, and only after it expires does the definitive listing go live. That sequence is why the official clock runs in months and not in days: six at SAT's fastest, twelve to eighteen in the typical case, thirty-six or more when a vendor litigates.",
          "The OECD's 2023 framework for measuring procurement performance describes this same gap and treats independent, behaviour-based red-flag indicators as a parallel line of defence — because tax enforcement is retrospective while procurement fraud is prospective. World Bank research on Eastern European procurement reached the identical conclusion in 2019. P2 is that recommendation operationalized: pattern-based, procurement-native, fast. It does not replace SAT; it adds the one thing tax enforcement cannot deliver at scale — speed.",
        ],
        prose_es: [
          "El listado definitivo más rápido del SAT tarda seis meses; en el peor caso rebasa los tres años. La última corrida completa de RUBLI puntuó a todo el padrón en menos de una hora. Una empresa fachada real puede cobrar cientos de millones de pesos y disolverse mucho antes de que cualquier lista oficial lo alcance — y puede seguir contratando todo ese tiempo, porque el listado definitivo es el único disparador de la exclusión en contrataciones.",
          "El procedimiento dicta la demora. El Artículo 69-B obliga al SAT a probar, con facturas simuladas y registros operativos, que una entidad emitió comprobantes fiscales sin actividad económica real — prueba construida con estados de cuenta, testimonios de terceros y visitas en sitio. Luego se publica un listado provisional en el Diario Oficial de la Federación con un plazo de 30 días para desvirtuar, y solo cuando vence entra el listado definitivo. Esa secuencia es la razón de que el reloj oficial corra en meses y no en días: seis en el mejor caso del SAT, de doce a dieciocho en el típico, treinta y seis o más cuando un proveedor litiga.",
          "El marco de la OCDE de 2023 para medir el desempeño en contratación pública describe esta misma brecha y trata los indicadores conductuales independientes de bandera roja como una línea de defensa paralela — porque la fiscalización mira al pasado mientras el fraude en contrataciones mira al futuro. La investigación del Banco Mundial sobre contrataciones en Europa del Este llegó a la misma conclusión en 2019. P2 es esa recomendación hecha operación: basada en patrones, nativa de la contratación, rápida. No reemplaza al SAT; aporta lo único que la fiscalización no puede entregar a escala — velocidad.",
        ],
        chartConfig: {
          // SD-06 F3 replaces the typed SAT-vs-RUBLI Cleveland pair. The SAT
          // side carried a source line; the RUBLI side — a flat "0.5 months"
          // — carried none, and /aria/stats contradicts it: the last full run
          // scored 248,944 vendors in 4 min 57 s. The live signal matrix
          // carries the chapter instead, and prints the measured run.
          type: 'live',
          live: 'p2-signals',
          chartId: 'p2-signals',
          title: 'The top of the evidence ranking, signal by signal',
          title_es: 'La cima del ranking de evidencia, señal por señal',
        },
        pullquote: {
          quote:
            "SAT confirms a ghost company in six months at best and three years at worst. RUBLI's P2 flags the same behavior in a single pipeline run.",
          quote_es:
            "El SAT confirma una empresa fantasma en seis meses en el mejor caso y tres años en el peor. El P2 de RUBLI marca la misma conducta en una sola corrida.",
          stat: "4m 57s",
          statLabel: "one ARIA run over 248,944 vendors, against SAT's 6-to-36-month wait",
          statLabel_es: "una corrida de ARIA sobre 248,944 proveedores, frente a la espera de 6 a 36 meses del SAT",
        },
        sources: [
          'OECD (2023). Public procurement performance: A framework for measuring efficiency, compliance and strategic goals. OECD Public Governance Policy Papers No. 36.',
          'World Bank. (2019). Warning Signs of Fraud and Corruption in Procurement. Integrity Vice Presidency.',
          'Código Fiscal de la Federación, Art. 69-B. Procedimiento de operaciones simuladas.',
          'RUBLI ARIA pipeline run d4e7b665, 3 May 2026 — 248,944 vendors scored in 4 min 57 s (/aria/stats).',
        ],
      },
      {
        id: 'ch4',
        number: 4,
        title: "The Name We Have, the Name We Don't",
        title_es: "El nombre que tenemos, el que no",
        subtitle: "The vendor is on the record; the official who signed is anonymous",
        subtitle_es: "El proveedor está en el registro; el funcionario que firmó queda en el anonimato",
        prose: [
          "The flagged vendor has a name in the record; RUBLI withholds it because it belongs to a private individual. The official who signed the two contracts has no name in the record at all. Where a ghost company exists, it is a two-sided transaction: someone creates the shell, and someone inside the government signs the approval. The record names only the first half. Across the register, RUBLI's cross-reference matches only one of the 3,024 P2-flagged vendors to an SFP sanction — and the sanctions record names almost none of the approving officials. The chart's zero bar is that absence itself: vendors are sanctioned, and almost none of the officials who approved them are named or sanctioned.",
          "RUBLI is silent on the signer by necessity: COMPRANET does not reliably link approving officials to specific contracts. That linkage lives in internal procurement-unit records and is not systematically published. The Secretaría de la Función Pública (SFP) holds the authority to audit those approvals and sanction officials; the 1,954 figure is what it has used. Even among the 203 confirmed EFOS vendors in the procurement records, public records show criminal prosecution for only a fraction; most receive fiscal sanctions and procurement exclusion, nothing more — and that asymmetry guarantees the next ghost faces no deterrent.",
          "The unconfirmed 2,821 are ranked by ARIA's Integrated Priority Score, and the top 100 are the highest-yield targets. Three checks can be completed in days: RUPC registration, a real physical address, and whether one procurement unit awarded several P2 vendors at once. Any of them can move a case to the UIF, which can subpoena bank records but has no pre-investigated pipeline to work from. RUBLI cannot prosecute or sanction. It forces the question it cannot answer: of 3,024 vendors whose conduct mirrors documented ghost companies, which officials signed their contracts, and why were those officials never investigated?",
        ],
        prose_es: [
          "El proveedor marcado tiene nombre en el registro; RUBLI lo omite porque es un particular. El funcionario que firmó los dos contratos no tiene nombre en el registro. Donde existe una empresa fantasma, es una transacción de dos partes: alguien crea la fachada y alguien dentro del gobierno firma la autorización. El registro nombra solo a la primera mitad. Sobre el registro, el cruce de RUBLI empata apenas a uno de los 3,024 proveedores marcados por P2 con una sanción de la SFP — y el expediente de sanciones casi no nombra a ninguno de los funcionarios que autorizaron. La barra en cero de la gráfica es esa ausencia misma: se sanciona a los proveedores, y casi ninguno de los funcionarios que los aprobaron queda nombrado o sancionado.",
          "RUBLI calla sobre el firmante por necesidad: COMPRANET no liga de forma confiable a los funcionarios que autorizan con contratos específicos. Ese vínculo vive en registros internos de las unidades compradoras y no se publica de manera sistemática. La Secretaría de la Función Pública (SFP) tiene la facultad de auditar esas autorizaciones y sancionar funcionarios; la cifra de 1,954 es la que ha ejercido. Incluso entre los 203 proveedores EFOS confirmados que aparecen en los registros de contratación, los registros públicos muestran proceso penal solo para una fracción; la mayoría recibe sanciones fiscales y exclusión y nada más — y esa asimetría garantiza que el siguiente fantasma no enfrente disuasión alguna.",
          "Los 2,821 sin confirmar están jerarquizados por el Índice de Prioridad Integrada de ARIA, y los primeros 100 son los blancos de mayor rendimiento; tres verificaciones realizables en días — registro en el RUPC, un domicilio físico real, y si una misma unidad compradora adjudicó a varios proveedores P2 a la vez — pueden llevar un caso a la UIF, que puede requerir estados de cuenta bancarios pero carece de una línea de casos ya investigados. RUBLI no puede procesar ni sancionar. Obliga a la pregunta que no puede responder: de 3,024 proveedores cuya conducta refleja la de empresas fantasma documentadas, ¿qué funcionarios firmaron sus contratos, y por qué nunca se investigó a esos funcionarios?",
        ],
        chartConfig: {
          // SD-06 F4: the Two-Worlds proportional ledger from /methodology,
          // drawn for this cohort. Never a dot field.
          type: 'live',
          live: 'p2-match',
          chartId: 'p2-match',
          title: 'Two lists of ghosts, and the sliver where they meet',
          title_es: 'Dos listas de fantasmas, y la astilla donde coinciden',
        },
        pullquote: {
          quote:
            "A ghost company is a two-sided transaction. Mexico names the shell. Mexico does not name the official who signed.",
          quote_es:
            "Una empresa fantasma es una transacción de dos partes. México nombra a la fachada. México no nombra al funcionario que firmó.",
          stat: '1,954',
          statLabel: "SFP vendor sanctions (2002-2025)",
          statLabel_es: "sanciones a proveedores de la SFP (2002-2025)",
          barValue: 0,
          vizTemplate: 'zero-bar',
        },
        sources: [
          'SFP. (2025). Directorio de servidores públicos sancionados. Unidad de Responsabilidades Administrativas.',
          'RUBLI SFP sanctions cross-reference, April 2026.',
          'UIF/SHCP. (2024). Informe Anual de Actividades 2024. Unidad de Inteligencia Financiera.',
          'RUBLI ARIA Integrated Priority Score methodology, docs/ARIA_SPEC.md.',
        ],
      },
    ],
  },

  // === STORY 2: The Contracts No One Is Watching Are the Biggest Ones ===
  {
    slug: 'el-gran-precio',
    outlet: 'data_analysis',
    type: 'thematic',
    era: 'cross',
    headline: "The Contracts No One Is Watching Are the Biggest Ones",
    headline_es: "Los contratos que nadie vigila son los más grandes",
    subheadline:
      "Mexico audits its smallest contracts hardest and its largest least — the exact inverse of where the corruption risk sits. RUBLI's risk model scores risk that climbs almost step by step with value — partly by construction, since one of its inputs, price_ratio, compares each contract's amount with its sector median: 0.26 at the bottom, 0.97 at the top. All 40 contracts above 10 billion pesos, worth 819 billion combined, are high-risk. Just 33 vendors hold them. The mega-contract universe is a directory of recurring names, audited least where the money is largest.",
    subheadline_es:
      "México audita con más fuerza sus contratos más chicos y con menos sus más grandes — exactamente al revés de donde está el riesgo de corrupción. El modelo de RUBLI asigna un riesgo que sube casi escalón por escalón con el valor — en parte por construcción, porque una de sus variables, price_ratio, compara el monto de cada contrato con la mediana de su sector: 0.26 abajo, 0.97 arriba. Los 40 contratos por encima de 10 mil millones de pesos, con valor combinado de 819 mil millones, son todos de alto riesgo. Apenas 33 proveedores los controlan. El universo de mega-contratos es un directorio de nombres recurrentes, auditado menos donde el dinero es mayor.",
    byline: 'RUBLI Data Analysis Unit',
    estimatedMinutes: 16,
    status: 'reporteado',
    leadStat: {
      value: '819B MXN',
      label: "40 contracts above 10B MXN — and oversight runs thinnest exactly here",
      label_es:
        "40 contratos por encima de 10 mil millones — y la supervisión es más débil justo aquí",
      sublabel: "Every one high-risk · just 33 vendors behind them",
      sublabel_es: "Todos de alto riesgo · solo 33 proveedores detrás de ellos",
      color: '#dc2626',
    },
    relatedSlugs: ['el-monopolio-invisible', 'marea-de-adjudicaciones', 'el-sexenio-del-riesgo'],
    lensTags: {
      patterns: ['P5'],
      terms: ['sobreprecio', 'overpricing', 'large contracts'],
    },
    kickerStats: [
      {
        value: '0.26 → 0.97',
        suffix: "average risk, smallest to largest contract bracket",
        suffix_es: "riesgo promedio, del rango más chico al más grande",
        tone: 'data',
      },
      {
        value: '40 / 40',
        suffix: "contracts above 10B MXN that are high-risk",
        suffix_es: "contratos de más de 10 mil millones de pesos son de alto riesgo",
        tone: 'critical',
      },
      {
        value: '84.8B MXN',
        suffix: "the register's largest single contract — Operadora CICSA, 2017, scored 1.00",
        suffix_es: "el contrato individual más grande del registro — Operadora CICSA, 2017, con indicador 1.00",
        tone: 'data',
      },
    ],
    corrections: [
      "2026-09-19 — An earlier edition described Mantenimiento Express Marítimo, Urbanissa and Constructora Arhnos as single-contract vendors. ARIA files all three as false positives: Mantenimiento Express holds nine contracts at a mean indicator of 0.251, Urbanissa fifty-two.",
      "2026-09-19 — An earlier edition printed an estimated audit-coverage rate of 5 percent above 5 billion pesos, and the 95 percent of contracts that followed from it. RUBLI cannot measure audit coverage; both figures are withdrawn.",
      "2026-10-14 — RUBLI retrained its risk model, from v0.8.5 to v0.9.1, and every score in this story is restated on it. The size ladder now runs from 0.26 to 0.97; the 40 contracts above 10 billion pesos average 1.00 and all remain critical. The top-12 vendor chart is restated on the current register: Ingenieros Civiles Asociados (27.1 billion pesos, cleared by ARIA) replaces Mota-Engil México in twelfth place, and the band above one billion pesos holds 793 contracts, not 795.",
    ],
    corrections_es: [
      "2026-09-19 — Una edición anterior describía a Mantenimiento Express Marítimo, Urbanissa y Constructora Arhnos como proveedores de un solo contrato. ARIA clasifica a los tres como falsos positivos: Mantenimiento Express tiene nueve contratos con un indicador medio de 0.251; Urbanissa, cincuenta y dos.",
      "2026-09-19 — Una edición anterior imprimía una tasa estimada de cobertura de auditoría del 5 por ciento por encima de 5 mil millones de pesos, y el 95 por ciento de contratos que se seguía de ella. RUBLI no puede medir la cobertura de auditoría; ambas cifras quedan retiradas.",
      "2026-10-14 — RUBLI reentrenó su modelo de riesgo, de v0.8.5 a v0.9.1, y cada calificación de esta historia se reexpresa con él. La escalera por tamaño va ahora de 0.26 a 0.97; los 40 contratos por encima de 10 mil millones de pesos promedian 1.00 y siguen todos en nivel crítico. La gráfica de los 12 mayores proveedores se reexpresa con el registro actual: Ingenieros Civiles Asociados (27,100 millones de pesos, descartado por ARIA) sustituye a Mota-Engil México en el lugar doce, y la banda por encima de mil millones de pesos tiene 793 contratos, no 795.",
    ],
    chapters: [
      {
        id: 'ch1',
        number: 1,
        title: "Risk Climbs With the Money",
        title_es: "El riesgo sube con el dinero",
        subtitle: "A model that weighs price against the sector norm found a ladder",
        subtitle_es: "Un modelo que compara el precio con la norma del sector encontró una escalera",
        prose: [
          "Everyone assumes the biggest contracts are the safest. A deal worth tens of billions of pesos should draw the most bidders, the hardest scrutiny from the federal auditor, the most coverage, the steepest political cost if it fails. Size, the intuition runs, buys oversight. RUBLI's risk model found the opposite, and it found it without ever being told how large a single contract was.",
          "The v0.9.1 model scores every federal contract on a 0-to-1 scale, trained on RUBLI's labelled case set (replaced in October 2026 by v0.9.2, which uses only information from before each contract; the figures here are v0.9.1 readings). It reads vendor concentration, price volatility and procurement mechanism, and it also reads price_ratio — each contract's amount against its sector median, the model's second-largest weight (+0.449) — so part of the size gradient below is built in. Group the 3,051,294 scored contracts by size afterward and the climb is unmistakable. Contracts under 100,000 pesos average 0.26. From 1 to 10 million, 0.30. From 10 to 50 million, 0.40 — already at the high-risk line. From 50 to 500 million, 0.66. From 500 million to 5 billion, 0.92. Above 5 billion, 0.97.",
          "The relationship is one the model discovered, not one built into it. The 112 contracts in the top bracket — each a single procurement worth more than 5 billion pesos, 1.32 trillion pesos in all — average 0.97, deep inside the critical tier where 0.60 is the line above which an investigation is warranted. The thing intuition says should be safest is, on the evidence, the riskiest in government.",
        ],
        prose_es: [
          "Todos suponen que los contratos más grandes son los más seguros. Un trato por decenas de miles de millones de pesos debería atraer a más oferentes, el escrutinio más duro de la auditoría federal, la mayor cobertura, el costo político más alto si fracasa. El tamaño, dice la intuición, compra supervisión. El modelo de RUBLI encontró lo contrario, y lo encontró sin que jamás le dijeran cuán grande era un contrato.",
          "El modelo v0.9.1 califica cada contrato federal en una escala de 0 a 1, entrenada con la base de casos etiquetados de RUBLI (reemplazado en octubre de 2026 por v0.9.2, que solo usa información previa a cada contrato; las cifras de aquí son lecturas de v0.9.1). Lee la concentración de proveedores, la volatilidad de precios y el mecanismo de contratación, y también lee price_ratio — el monto de cada contrato frente a la mediana de su sector, el segundo peso más grande del modelo (+0.449) — así que parte de la escalera por tamaño de abajo viene incorporada. Agrupe después los 3,051,294 contratos calificados por tamaño y la subida es inconfundible. Los contratos por debajo de 100,000 pesos promedian 0.26. De 1 a 10 millones, 0.30. De 10 a 50 millones, 0.40 — ya en la línea de alto riesgo. De 50 a 500 millones, 0.66. De 500 millones a 5 mil millones, 0.92. Por encima de 5 mil millones, 0.97.",
          "La relación es algo que el modelo descubrió, no algo que tenga incorporado. Los 112 contratos del rango más alto — cada uno una sola contratación por más de 5 mil millones de pesos, 1.32 billones de pesos en total — promedian 0.97, muy adentro del nivel crítico, donde 0.60 es la línea a partir de la cual se justifica una investigación. Lo que la intuición dice que debería ser lo más seguro es, según la evidencia, lo más riesgoso del gobierno.",
        ],
        chartConfig: {
          type: 'editorial-threshold',
          title: 'Risk Climbs With Size — a Ladder the Model Was Never Told to Build',
          title_es:
            'El riesgo sube con el tamaño — una escalera que el modelo nunca recibió la orden de construir',
          chartId: 'risk-by-size-ladder',
          data: {
            points: [
              {
                label: '<100K',
                value: 0.2575,
              },
              {
                label: '100K-500K',
                value: 0.2568,
              },
              {
                label: '500K-1M',
                value: 0.2767,
              },
              {
                label: '1M-10M',
                value: 0.2959,
              },
              {
                label: '10M-50M',
                value: 0.404,
                annotation: 'HIGH',
                annotation_es: 'ALTO',
              },
              {
                label: '50M-500M',
                value: 0.6568,
                highlight: true,
                annotation: 'CRITICAL',
                annotation_es: 'CRÍTICO',
              },
              {
                label: '500M-5B',
                value: 0.9226,
                highlight: true,
                color: '#dc2626',
              },
              {
                label: '>5B MXN',
                value: 0.9733,
                highlight: true,
                color: '#dc2626',
              },
            ],
            referenceLine: {
              value: 0.6,
              label: 'Critical threshold',
              label_es: 'Umbral crítico',
              color: '#dc2626',
            },
            referenceLine2: {
              value: 0.4,
              label: 'High risk threshold',
              label_es: 'Umbral de alto riesgo',
              color: '#f97316',
            },
            unit: 'risk score',
            maxValue: 1,
            connectDots: true,
            yLabel: 'Average v0.9.1 risk score',
            yLabel_es: 'Riesgo promedio v0.9.1',
            annotation:
              'The largest contracts in Mexican federal procurement are, on average, the riskiest.',
            annotation_es:
              'Los contratos más grandes de la contratación federal mexicana son, en promedio, los más riesgosos.',
          },
        },
        pullquote: {
          quote:
            "The 112 largest contracts in the dataset carry an average risk score of 0.97. In RUBLI's framework, 0.60 is the line above which investigation is warranted. Intuition says these should be the safest contracts in government.",
          quote_es:
            "Los 112 contratos más grandes en la base de datos tienen una calificación de riesgo promedio de 0.97. En el marco de RUBLI, 0.60 es el umbral a partir del cual se justifica una investigación. La intuición dice que estos deberían ser los contratos más seguros del gobierno.",
          stat: '0.97',
          statLabel: "avg risk, contracts above 5B MXN",
          statLabel_es: "riesgo prom., contratos por encima de 5 mil millones de pesos",
          barValue: 0.97,
          barLabel: 'critical threshold: 0.60',
          vizTemplate: 'redline-gauge',
        },
        sources: [
          'RUBLI v0.9.1 risk model. Contract-level scoring, 3,051,294 scored records of a 3,055,817-row register. Bracket means recomputed on the register, 14 October 2026.',
          'COMPRANET (SHCP). Federal procurement records 2002-2025.',
        ],
      },
      {
        id: 'ch2',
        number: 2,
        title: "Why the Curve Runs Backwards",
        title_es: "Por qué la curva corre al revés",
        subtitle: "Big contracts shed their guardrails for three structural reasons",
        subtitle_es:
          "Los contratos grandes pierden sus controles por tres razones estructurales",
        prose: [
          "The climb is not a model artifact. It tracks structural realities of procurement fraud that international research has documented for two decades, through three compounding mechanisms. First: large contracts skip competition — but not the way the headline number suggests. In RUBLI's data, 23.2 percent of the 105,011 contracts above 10 million pesos are direct awards, against 74.2 percent across the register as a whole; the largest contracts are competed on paper far more often than small ones, and end with a single winner instead. Direct award strips out three of the four integrity controls open tendering provides — competitive pricing pressure, public advertising, and systematic bid evaluation with an audit trail. The EU Single Market Scoreboard treats a direct-award share at or above 10 percent as unsatisfactory; at 23.2 percent the big-contract band more than doubles it, and the register as a whole runs seven times it.",
          "Second: large contracts concentrate enough money to pay for sophisticated fraud. Inventing a ghost company, staging a fake competition, securing an official — each carries fixed costs in time, relationships, and risk. Below a break-even point those costs exceed the return; above it, they turn profitable. The Infrastructure Overpricing Network RUBLI tracks in ARIA runs contracts averaging 645 million pesos each — well past any plausible break-even.",
          "Third: the biggest contracts pool where capture is already entrenched. PEMEX, CFE, IMSS, ISSSTE, and SCT — the five largest procuring entities — generate the majority of contracts above 500 million pesos, and all five carry decades of documented corruption. The more-money-more-scrutiny intuition fails because the money flows precisely to the places where the guardrails are already gone.",
        ],
        prose_es: [
          "La subida no es un artefacto del modelo. Refleja realidades estructurales del fraude en contratación que la investigación internacional ha documentado por dos décadas, mediante tres mecanismos que se combinan. Primero: los contratos grandes se saltan la competencia — pero no como sugiere la cifra de cabecera. En los datos de RUBLI, el 23.2 por ciento de los 105,011 contratos por encima de 10 millones de pesos son adjudicaciones directas, frente al 74.2 por ciento del registro completo; los contratos más grandes se concursan en el papel mucho más que los chicos, y en cambio atraen a un solo adjudicado. La adjudicación directa elimina tres de los cuatro controles de integridad que aporta la licitación abierta — la presión de precios competitivos, la publicidad pública y la evaluación sistemática de ofertas con historial de auditoría. El Tablero del Mercado Único de la UE considera insatisfactoria una proporción de adjudicación directa igual o superior al 10 por ciento; con 23.2 por ciento la banda de contratos grandes la duplica con creces, y el registro completo la multiplica por siete.",
          "Segundo: los contratos grandes concentran suficiente dinero para pagar el fraude sofisticado. Inventar una empresa fantasma, simular una competencia, conseguir a un funcionario — cada cosa tiene costos fijos de tiempo, relaciones y riesgo. Por debajo de un punto de equilibrio esos costos superan el beneficio; por encima, se vuelven rentables. La Red de Sobreprecio en Infraestructura que RUBLI rastrea en ARIA maneja contratos que promedian 645 millones de pesos cada uno — muy por encima de cualquier punto de equilibrio plausible.",
          "Tercero: los contratos más grandes se acumulan donde la captura ya está arraigada. PEMEX, CFE, IMSS, ISSSTE y SCT — las cinco entidades contratantes más grandes — generan la mayoría de los contratos por encima de 500 millones de pesos, y las cinco cargan décadas de corrupción documentada. La intuición de a-más-dinero-más-escrutinio falla porque el dinero fluye justo hacia los lugares donde los controles ya desaparecieron.",
        ],
        pullquote: {
          quote:
            "Large contracts remove three of the four integrity controls open tendering provides: competitive pricing, public advertising, and systematic evaluation. The EU scoreboard's direct-award line is 10 percent.",
          quote_es:
            "Los contratos grandes eliminan tres de los cuatro controles de integridad que aporta la licitación abierta: precios competitivos, publicidad pública y evaluación sistemática. La línea de adjudicación directa del Tablero UE es del 10 por ciento.",
          stat: '23.2%',
          statLabel: "direct-award rate for the 105,011 contracts above 10M MXN — against 65.3% across the whole register",
          statLabel_es: "tasa de adjudicación directa de los 105,011 contratos por encima de 10 MDP — contra 65.3% en todo el registro",
          barValue: 0.9,
          barLabel: 'EU scoreboard · ≥10% direct award = unsatisfactory',
          vizTemplate: 'breach-ceiling',
        },
        sources: [
          'OECD. (2015). Recommendation of the Council on Public Procurement.',
          'IMF Working Paper 2022/094. Assessing Vulnerabilities to Corruption in Public Procurement.',
                                                                                                      'European Commission. Single Market Scoreboard — Public procurement (single bidder and direct awards indicators).',
        ],
      },
      {
        id: 'ch3',
        number: 3,
        title: "A Directory, Not a Market",
        title_es: "Un directorio, no un mercado",
        subtitle: "793 contracts above one billion — held by 466 vendors, in four sectors",
        subtitle_es:
          "793 contratos por encima de mil millones — en manos de 466 proveedores, en cuatro sectores",
        prose: [
          "Above 10 billion pesos sit 40 contracts, held by 33 vendors, every one scored high-risk, average score 1.00. Read that band with the register's own rule attached: RUBLI rejects any contract above 100 billion pesos as a data error and flags everything above 10 billion for manual review, so every contract in this tier is one the platform requires a human to verify before it counts as a finding. Reviewers have since cleared several of the largest. Cross the one-billion-peso line and the field thins to 793 contracts out of 3,051,294, worth 2.66 trillion pesos, held by just 466 vendors, about 0.15 percent of the active vendor universe. Above 5 billion: 112 contracts, 93 vendors. The mega-contract tier is not a market. It is a directory.",
          "The cast is not random. It clusters into five recognizable types: pharmaceutical distributors with multi-decade IMSS relationships — Grupo Fármacos, Maypo, PISA, Dimesa, whose combined share of IMSS spending is examined in “Concentration in IMSS Medicine Purchasing”; Tren Maya contractors awarded after 2019 — Operadora CICSA, ICA Constructora; Pemex and CFE infrastructure providers — Cotemar; military-construction operators such as Coconal; and card-and-voucher welfare operators such as TOKA Internacional. Several names that belong to this list by value do not belong to it by finding: ARIA has reviewed and cleared Dowell Schlumberger, ICA Fluor and Constructora Arhnos, and treats Repsol Exploración and Alstom Transport as structural-monopoly exceptions rather than risk cases.",
          "The extremes are where the pattern breaks down. The three largest single-vendor totals in this band have all been reviewed and ruled out: ARIA files Mantenimiento Express Marítimo, Urbanissa and Constructora Arhnos as false positives: Mantenimiento Express holds nine contracts at a mean indicator of 0.298, Urbanissa fifty-two. Above ten billion pesos, RUBLI's own data rules require every amount to be flagged for manual review before it is read as a finding. The mega-contract tier is where the model is least reliable, not most.",
          "These vendors match the pattern RUBLI flags — concentration, sole-source awards, perfect risk scores; the model classifies behavior, not proven crime. The chart below ranks the top 12 by pesos in contracts above one billion, each annotated with its contract count and score, with single-contract and perfect-score outliers marked. Together those 12 capture 620 billion pesos, 23 percent of the mega-contract universe. The four sectors that absorb 92 percent of all mega-pesos are the four with the longest documented corruption histories. No published oversight programme assigns dedicated teams to the four sectors that hold 92 percent of the mega-contract pesos.",
        ],
        prose_es: [
          "Por encima de 10 mil millones de pesos hay 40 contratos, en manos de 33 proveedores, todos calificados de alto riesgo, con promedio de 1.00. Lee esa banda con la regla del propio registro puesta al lado: RUBLI rechaza como error de captura cualquier contrato por encima de 100 mil millones de pesos y marca para revisión manual todo lo que pase de 10 mil millones, así que cada contrato de este nivel exige verificación humana antes de contar como hallazgo. Desde entonces los revisores han descartado a varios de los mayores. Cruce la línea de mil millones de pesos y el campo se reduce a 793 contratos de 3,051,294, con valor de 2.66 billones de pesos, en manos de solo 466 proveedores, alrededor del 0.15 por ciento del universo activo. Por encima de 5 mil millones: 112 contratos, 93 proveedores. El nivel de mega-contratos no es un mercado. Es un directorio.",
          "El reparto no es aleatorio. Se agrupa en cinco tipos reconocibles: distribuidoras farmacéuticas con relaciones de varias décadas con el IMSS — Grupo Fármacos, Maypo, PISA, Dimesa, cuya participación conjunta en el gasto del IMSS examina «Concentración en las compras de medicamentos del IMSS»; contratistas del Tren Maya adjudicados después de 2019 — Operadora CICSA, ICA Constructora; proveedores de infraestructura de Pemex y CFE como Cotemar; operadores de construcción militar como Coconal; y operadores de tarjetas y vales de bienestar como TOKA Internacional. Varios nombres que pertenecen a esta lista por monto no le pertenecen por hallazgo: ARIA revisó y descartó a Dowell Schlumberger, ICA Fluor y Constructora Arhnos, y trata a Repsol Exploración y Alstom Transport como excepciones de monopolio estructural y no como casos de riesgo.",
          "En los extremos es donde el patrón se rompe. Los tres mayores totales por proveedor de esta banda ya fueron revisados y descartados: ARIA clasifica a Mantenimiento Express Marítimo, Urbanissa y Constructora Arhnos como falsos positivos: Mantenimiento Express tiene nueve contratos con un indicador medio de 0.298; Urbanissa, cincuenta y dos. Por encima de los diez mil millones de pesos, las propias reglas de datos de RUBLI obligan a marcar cada monto para revisión manual antes de leerlo como hallazgo. El nivel de los mega-contratos es donde el modelo es menos confiable, no el más.",
          "Estos proveedores coinciden con el patrón que RUBLI marca — concentración, adjudicaciones a proveedor único, calificaciones de riesgo perfectas; el modelo clasifica comportamiento, no delito probado. La gráfica de abajo ordena los 12 primeros por pesos en contratos por encima de mil millones, cada uno anotado con su número de contratos y su calificación, con los atípicos de un solo contrato y de calificación perfecta marcados. Juntos esos 12 capturan 620 mil millones de pesos, 23 por ciento del universo de mega-contratos. Los cuatro sectores que absorben el 92 por ciento de todos los mega-pesos son los cuatro con las historias de corrupción mejor documentadas. Ningún programa de fiscalización publicado asigna equipos dedicados a los cuatro sectores que concentran el 92 por ciento de los pesos en mega-contratos.",
        ],
        chartConfig: {
          type: 'inline-bar',
          title: 'The Mega-Contract Directory — Top 12 Vendors, Pesos in Contracts ≥1B MXN',
          title_es:
            'El directorio de mega-contratos — los 12 mayores proveedores, pesos en contratos ≥1,000 millones',
          chartId: 'mega-vendors',
          data: {
            points: [
              {
                label: 'Operadora CICSA',
                value: 139,
                riskScore: 1,
                highlight: true,
                annotation: '5 contracts',
                annotation_es: '5 contratos',
              },
              {
                label: 'Mantenimiento Express',
                value: 69.9,
                riskScore: 1,
                annotation: '1 contract · ARIA: false positive',
                annotation_es: '1 contrato · ARIA: falso positivo',
              },
              {
                label: 'Dowell Schlumberger',
                value: 64.8,
                riskScore: 1,
                annotation: '9 contracts · ARIA: false positive',
                annotation_es: '9 contratos · ARIA: falso positivo',
              },
              {
                label: 'Grupo Fármacos',
                value: 62.9,
                riskScore: 1,
                highlight: true,
                annotation: '29 contracts',
                annotation_es: '29 contratos',
              },
              {
                label: 'Urbanissa',
                value: 58,
                riskScore: 1,
                annotation: '1 contract · ARIA: false positive',
                annotation_es: '1 contrato · ARIA: falso positivo',
              },
              {
                label: 'ICA Constructora',
                value: 41.8,
                riskScore: 1,
                annotation: '3 contracts · Tren Maya',
                annotation_es: '3 contratos · Tren Maya',
              },
              {
                label: 'Alstom Transport',
                value: 37.9,
                riskScore: 1,
                annotation: '2 contracts · Tren Maya · ARIA: not pursued',
                annotation_es: '2 contratos · Tren Maya · ARIA: no perseguido',
              },
              {
                label: 'Constructora Arhnos',
                value: 31.9,
                riskScore: 1,
                annotation: '1 contract · ARIA: false positive',
                annotation_es: '1 contrato · ARIA: falso positivo',
              },
              {
                label: 'ICA Fluor Daniel',
                value: 31.2,
                riskScore: 1,
                annotation: '6 contracts · ARIA: false positive',
                annotation_es: '6 contratos · ARIA: falso positivo',
              },
              {
                label: 'Grupo Constructor Marhnos',
                value: 28,
                riskScore: 1,
                annotation: '2 contracts · ARIA: false positive',
                annotation_es: '2 contratos · ARIA: falso positivo',
              },
              {
                label: 'Repsol Exploración',
                value: 27.2,
                riskScore: 1,
                annotation: '1 contract · ARIA: false positive',
                annotation_es: '1 contrato · ARIA: falso positivo',
              },
              {
                label: 'Ingenieros Civiles Asociados',
                value: 27.1,
                riskScore: 1,
                annotation: '6 contracts · ARIA: false positive',
                annotation_es: '6 contratos · ARIA: falso positivo',
              },
            ],
            unit: 'B MXN',
            annotation:
              "Each vendor's total only counts contracts ≥1B MXN. Nine of the twelve have already been reviewed and cleared — their ARIA disposition is printed on the row, and they are listed here as the largest counterparties in the band, not as suspects. The highlighted rows are the two that remain open.",
            annotation_es:
              'El total de cada proveedor solo cuenta contratos ≥1,000 millones. Nueve de los doce ya fueron revisados y descartados — su estatus en ARIA aparece en la fila, y figuran aquí como las mayores contrapartes de la banda, no como sospechosos. Las filas resaltadas son las dos que siguen abiertas.',
          },
        },
        pullquote: {
          quote:
            "A single contract for 69.9 billion pesos at a 1.000 risk score. A single contract for 58 billion. A single contract for 31.9 billion. The mega-contract tier in Mexican federal procurement is not a market. It is a directory.",
          quote_es:
            "Un solo contrato por 69.9 mil millones de pesos con calificación de riesgo 1.000. Otro por 58 mil millones. Otro por 31.9 mil millones. El nivel de mega-contratos en la contratación federal mexicana no es un mercado. Es un directorio.",
          stat: '40',
          statLabel: "contracts above 10B MXN — average risk score 1.00, every one critical",
          statLabel_es:
            "contratos por encima de 10 mil millones — riesgo promedio 1.00, todos críticos",
          barValue: 1,
          barLabel: '100% of contracts >10B MXN are flagged high-risk',
          barLabel_es: '100% de los contratos >10 mil millones marcados de alto riesgo',
          vizTemplate: 'mosaic-tile',
        },
        sources: [
          'RUBLI contracts table aggregated by vendor with amount_mxn ≥ 1e9. April 2026.',
          'COMPRANET (SHCP). Federal procurement records 2002-2025, mega-contract universe.',
          'RUBLI contracts × sectors aggregation, mega-contract subset (amount_mxn ≥ 1e9). April 2026.',
        ],
      },
      {
        id: 'ch4',
        number: 4,
        title: "The Sectors Where the Giants Live",
        title_es: "Los sectores donde viven los gigantes",
        subtitle: "92 percent of mega-pesos in the four most-documented sectors",
        subtitle_es: "92 por ciento de los mega-pesos en los cuatro sectores más documentados",
        prose: [
          "The giants live at four addresses. Energía takes 917.3 billion pesos, 34.5 percent across 250 contracts. Salud, 638.6 billion, 24.0 percent across 258. Infraestructura, 552.4 billion, 20.8 percent across 100. Hacienda, 349.6 billion, 13.1 percent across 92. Together they hold 92 percent of every peso awarded above one billion. An equal share for one of ten sectors would be 265.3 billion pesos; the top four each blow past it.",
          "The bottom of the ledger indicts as loudly as the top. Educación, the third-largest line in the federal budget, draws only 2 percent of mega-contract pesos. Medio Ambiente, Gobernación, Defensa — in civilian COMPRANET, with military procurement on separate channels — Agricultura and Trabajo trail far behind. The money pools precisely where institutional capture is best documented. Scrutiny that tracked risk would concentrate here. As the next chapter shows, the audit map points almost everywhere else.",
        ],
        prose_es: [
          "Los gigantes viven en cuatro direcciones. Energía se lleva 917.3 mil millones de pesos, 34.5 por ciento en 250 contratos. Salud, 638.6 mil millones, 24.0 por ciento en 258. Infraestructura, 552.4 mil millones, 20.8 por ciento en 100. Hacienda, 349.6 mil millones, 13.1 por ciento en 92. Juntos concentran el 92 por ciento de cada peso adjudicado por encima de mil millones. Una parte igual para uno de diez sectores sería de 265.3 mil millones de pesos; los cuatro primeros la rebasan por mucho.",
          "El fondo del registro acusa tan fuerte como la cima. Educación, tercera línea más grande del presupuesto federal, capta solo el 2 por ciento de los pesos en mega-contratos. Medio Ambiente, Gobernación, Defensa — en el COMPRANET civil, con la contratación militar por canales separados — Agricultura y Trabajo quedan muy rezagados. El dinero se acumula justo donde la captura institucional está mejor documentada. Un escrutinio que siguiera el riesgo se concentraría aquí. Como muestra el siguiente capítulo, el mapa de auditoría apunta a casi cualquier otra parte.",
        ],
        chartConfig: {
          type: 'editorial-thermometer',
          title: 'Where the Giants Live — Mega-Contract Pesos (≥1B MXN) by Sector',
          title_es:
            'Dónde viven los gigantes — Pesos en mega-contratos (≥1 mil millones) por sector',
          chartId: 'mega-by-sector',
          data: {
            points: [
              {
                label: 'Energía',
                value: 917.3,
                color: '#eab308',
                highlight: true,
                annotation: '34.5% · 250 contracts',
                annotation_es: '34.5% · 250 contratos',
              },
              {
                label: 'Salud',
                value: 638.6,
                color: '#dc2626',
                highlight: true,
                annotation: '24.0% · 258 contracts',
                annotation_es: '24.0% · 258 contratos',
              },
              {
                label: 'Infraestructura',
                value: 552.4,
                color: '#ea580c',
                highlight: true,
                annotation: '20.8% · 100 contracts',
                annotation_es: '20.8% · 100 contratos',
              },
              {
                label: 'Hacienda',
                value: 349.6,
                color: '#16a34a',
                annotation: '13.1% · 92 contracts',
                annotation_es: '13.1% · 92 contratos',
              },
              {
                label: 'Educación',
                value: 52.9,
                color: '#3b82f6',
                annotation: '2.0%',
                annotation_es: '2.0%',
              },
              {
                label: 'Medio Ambiente',
                value: 51.1,
                color: '#10b981',
                annotation: '1.9%',
                annotation_es: '1.9%',
              },
              {
                label: 'Gobernación',
                value: 47.1,
                color: '#be123c',
                annotation: '1.8%',
                annotation_es: '1.8%',
              },
              {
                label: 'Defensa (civil)',
                value: 24.9,
                color: '#1e3a5f',
                annotation: '0.9% (mil. via separate channels)',
                annotation_es: '0.9% (mil. vía canales aparte)',
              },
              {
                label: 'Agricultura',
                value: 12.4,
                color: '#22c55e',
                annotation: '0.5%',
                annotation_es: '0.5%',
              },
              {
                label: 'Trabajo',
                value: 6.2,
                color: '#f97316',
                annotation: '0.2%',
                annotation_es: '0.2%',
              },
            ],
            referenceLine: {
              value: 265.3,
              label: 'Equal share (1 of 10 sectors)',
              label_es: 'Parte igual (1 de 10 sectores)',
              color: 'var(--color-sector-tecnologia)',
            },
            unit: 'B MXN',
            annotation:
              'Mega-contract pesos by sector. Top 4 sectors absorb 92 percent of the universe. The four sectors are also the four with the longest documented corruption histories.',
            annotation_es:
              'Pesos en mega-contratos por sector. Los 4 sectores principales absorben el 92 por ciento del universo. Estos cuatro sectores son los mismos cuatro con las historias de corrupción mejor documentadas.',
          },
        },
        pullquote: {
          quote:
            "The sectors that absorb Mexico's biggest contracts are the same four with the longest documented corruption histories. Concentrated capture, by definition.",
          quote_es:
            "Los sectores que absorben los contratos más grandes de México son los mismos cuatro con las historias de corrupción mejor documentadas. Captura concentrada, por definición.",
          stat: '92%',
          statLabel:
            "mega-contract pesos concentrated in 4 sectors (Energía, Salud, Infra, Hacienda)",
          statLabel_es:
            "pesos en mega-contratos concentrados en 4 sectores (Energía, Salud, Infra, Hacienda)",
          barValue: 0.92,
          barLabel: 'Educación, Trabajo, Defensa-civil, Medio Ambiente, Agricultura combined: < 8%',
          barLabel_es: 'Educación, Trabajo, Defensa-civil, Ambiente, Agricultura combinados: < 8%',
          vizTemplate: 'mosaic-tile',
        },
        sources: [
          'RUBLI contracts × sectors aggregation, mega-contract subset (amount_mxn ≥ 1e9). April 2026.',
          'OECD (2023). Public procurement performance: A framework for measuring efficiency, compliance and strategic goals. OECD Public Governance Policy Papers No. 36.',
        ],
      },
      {
        id: 'ch5',
        number: 5,
        title: "The Ladder Runs Backwards",
        title_es: "La escalera corre al revés",
        subtitle: "Mexico scrutinizes its safest contracts hardest and its riskiest least",
        subtitle_es:
          "México vigila con mayor rigor sus contratos más seguros y con el menor los más riesgosos",
        prose: [
          "By law, no significant contract should escape. Four institutions split the duty: ASF audits federal accounts after the fact, SFP polices the integrity of the procurement process, COFECE investigates anticompetitive behavior, UIF tracks suspicious financial flows. The law assigns oversight to every rung of the ladder.",
          "At the top, the institutions stop functioning. The 40 contracts above 10 billion pesos — every one high-risk, average score 1.00 — are also the 40 most likely to involve politically connected vendors and presidential-priority institutions. Auditing a 10-billion-peso contract is a political confrontation, and confrontations are rationed. Those 40 are not a workload for ASF; they are a list of conversations the political system has chosen not to have.",
          "At the bottom, the same institutions are visibly busy. SFP and ASF review thousands of small-value contracts a year — cheaper, easier, press-release-generating. Audit intensity ends up inversely correlated with corruption risk: the cleanest contracts get the most scrutiny, the riskiest the least. The risk ladder and the audit ladder are the same ladder, turned upside down.",
          "RUBLI can name the gap even where it cannot measure the audits. 819 billion pesos of contracting sits in the above-10-billion tier, held by 33 vendors, at an average risk indicator of 1.00. Closing it needs no new laws and no new technology — only naming the 33 vendors and the 40 contracts and assigning each to a specific investigation, regardless of which ministry signed.",
        ],
        prose_es: [
          "Por ley, ningún contrato significativo debería escapar. Cuatro instituciones se reparten el deber: la ASF audita las cuentas federales a posteriori, la SFP vigila la integridad del proceso de contratación, la COFECE investiga comportamientos anticompetitivos, la UIF rastrea flujos financieros sospechosos. La ley asigna supervisión a cada peldaño de la escalera.",
          "En la cima, las instituciones dejan de funcionar. Los 40 contratos por encima de 10 mil millones de pesos — todos de alto riesgo, calificación promedio 1.00 — son también los 40 con mayor probabilidad de involucrar a proveedores políticamente conectados e instituciones cercanas a las prioridades presidenciales. Auditar un contrato de 10 mil millones de pesos es una confrontación política, y las confrontaciones se racionan. Esos 40 no son una carga de trabajo para la ASF; son una lista de conversaciones que el sistema político ha decidido no tener.",
          "En la parte baja, las mismas instituciones están visiblemente ocupadas. La SFP y la ASF revisan miles de contratos de bajo valor al año — más baratos, más fáciles, generadores de comunicados. La intensidad de auditoría termina inversamente correlacionada con el riesgo de corrupción: los contratos más limpios reciben el mayor escrutinio, los más riesgosos el menor. La escalera de riesgo y la escalera de auditoría son la misma escalera, puesta de cabeza.",
          "RUBLI puede nombrar la brecha aunque no pueda medir las auditorías. 819,000 millones de pesos de contratación están en el nivel por encima de 10 mil millones, en manos de 33 proveedores, con un indicador de riesgo promedio de 1.00. Cerrarla no requiere nuevas leyes ni nueva tecnología — solo nombrar a los 33 proveedores y los 40 contratos y asignar cada uno a una investigación específica, sin importar qué secretaría los firmó.",
        ],
        pullquote: {
          quote:
            "Mexico audits its cleanest contracts the most and its riskiest contracts the least. The accountability gap grows with every peso of contract value.",
          quote_es:
            "México audita sus contratos más limpios con la mayor intensidad y los más riesgosos con la menor. La brecha de rendición de cuentas crece con cada peso contratado.",
          stat: '1.00',
          statLabel: "average risk indicator across the 40 contracts above 10B MXN",
          statLabel_es:
            "indicador de riesgo promedio de los 40 contratos por encima de 10 mil millones",
          barValue: 1,
          barLabel: 'every one of the 40 scored high-risk',
          barLabel_es: 'los 40, todos calificados de alto riesgo',
          vizTemplate: 'dot-ratio',
        },
        sources: [
          'ASF. (2024). Programa Anual de Auditorías para la Fiscalización Superior de la Cuenta Pública.',
          'OECD (2023). Public procurement performance: A framework for measuring efficiency, compliance and strategic goals. OECD Public Governance Policy Papers No. 36.',
        ],
      },
    ],
    nextSteps: [
      "Request from SFP the complete list of contracts above 100M MXN awarded via direct adjudication in 2023-2025; cross-reference against RUBLI's P2 and P6 vendor lists.",
      'File ASF audit requests for the top 20 contracts above 500M MXN that RUBLI flags as critical-risk, naming the specific contract IDs.',
      "Compare Mexico's large-contract audit coverage against peer countries using the indicator set in the OECD's 2023 procurement-performance framework.",
      'Investigate whether procurement thresholds under LAASSP Art. 42 have been adjusted for inflation since 2012; compute the real-value erosion.',
      'Request from Congress (Cámara de Diputados) the complete list of contracts above 5B MXN approved in each fiscal year and cross-reference with RUBLI risk scores.',
      'Open dedicated case files on the four dominant IMSS pharmaceutical vendors (Grupo Fármacos, Maypo, PISA, Dimesa) with focus on 2018-2025 contract awards.',
    ],
    nextSteps_es: [
      'Solicitar a la SFP la lista completa de contratos superiores a 100 MDP adjudicados directamente en 2023-2025; cruzarlos con los listados P2 y P6 de RUBLI.',
      'Presentar solicitudes de auditoría a la ASF para los 20 contratos superiores a 500 MDP que RUBLI califica como riesgo crítico, citando las claves de contrato específicas.',
      'Comparar la cobertura de auditoría de México en contratos de gran valor contra países pares usando el conjunto de indicadores del marco de desempeño en contratación de la OCDE (2023).',
      'Investigar si los umbrales de contratación del Art. 42 de la LAASSP han sido ajustados por inflación desde 2012; calcular la erosión en valor real.',
      'Solicitar a la Cámara de Diputados la lista completa de contratos superiores a 5,000 MDP aprobados en cada ejercicio fiscal y cruzar con los puntajes de riesgo de RUBLI.',
      'Abrir expedientes de investigación sobre los cuatro proveedores farmacéuticos dominantes en el IMSS (Grupo Fármacos, Maypo, PISA, Dimesa), con énfasis en contratos 2018-2025.',
    ],
  },

  // === STORY 3: Concentration in IMSS Medicine Purchasing ===
  {
    slug: 'el-monopolio-invisible',
    outlet: 'investigative',
    type: 'thematic',
    era: 'cross',
    byline: 'RUBLI Investigative Data Unit',
    status: 'reporteado',
    estimatedMinutes: 17,
    headline: "Concentration in IMSS Medicine Purchasing",
    headline_es: "Concentración en las compras de medicamentos del IMSS",
    subheadline:
      "Grupo Fármacos Especializados collected 133.2 billion pesos from Mexico's federal government. It is one of four pharmaceutical distributors that took 326.2 billion pesos between 2002 and 2025, funneled it through a single customer, and the lead among them changed as the procurement rules changed three times. Four named suppliers. One concentrated market.",
    subheadline_es:
      "Grupo Fármacos Especializados recibió 133,200 millones de pesos del gobierno federal mexicano. Es una de cuatro distribuidoras farmacéuticas que se llevaron 326,200 millones de pesos entre 2002 y 2025, los canalizaron por un solo cliente y el liderazgo entre ellas cambió mientras las reglas de contratación cambiaban tres veces. Cuatro proveedoras con nombre. Un mercado concentrado.",
    leadStat: {
      value: '326.2B MXN',
      label: "collected by four vendors in a single pharmaceutical market",
      label_es: "recaudados por cuatro proveedores en un solo mercado farmacéutico",
      sublabel: "Grupo Fármacos · Maypo · PISA · Dimesa, 2003-2025",
      sublabel_es: "Grupo Fármacos · Maypo · PISA · Dimesa, 2003-2025",
      color: '#dc2626',
    },
    corrections: [
      "2026-10-14 — RUBLI retrained its risk model (v0.8.5 to v0.9.1) and re-ran ARIA on 13 October 2026. The four distributors' risk indicators are restated (Grupo Fármacos 1.00, Maypo 0.94, PISA 0.93, Dimesa 0.97; all four remain critical). An earlier edition placed all four at Tier 1 of the ARIA queue beside 40 other P1 vendors; after the re-run two sit at Tier 1 and two at Tier 2, and the public queue lists 27 non-pharmaceutical P1 vendors.",
    ],
    corrections_es: [
      "2026-10-14 — RUBLI reentrenó su modelo de riesgo (de v0.8.5 a v0.9.1) y volvió a correr ARIA el 13 de octubre de 2026. Se reexpresan los indicadores de riesgo de las cuatro distribuidoras (Grupo Fármacos 1.00, Maypo 0.94, PISA 0.93, Dimesa 0.97; las cuatro siguen en nivel crítico). Una edición anterior colocaba a las cuatro en el Nivel 1 de la fila de ARIA junto a otros 40 proveedores P1; tras la nueva corrida dos están en el Nivel 1 y dos en el Nivel 2, y la fila pública lista 27 proveedores P1 no farmacéuticos.",
    ],
    kickerStats: [
      {
        value: '326.2B MXN',
        suffix: "to four vendors, one product line",
        suffix_es: "a cuatro proveedores, una sola línea",
        tone: 'critical',
      },
      {
        value: '10.4%',
        suffix: "of every peso IMSS spent on anyone",
        suffix_es: "de cada peso que el IMSS gastó en cualquiera",
        tone: 'data',
      },
      {
        value: '5,285',
        suffix: "tenders where the four meet",
        suffix_es: "licitaciones donde se encuentran los cuatro",
        tone: 'data',
      },
    ],
    relatedSlugs: ['captura-institucional', 'el-gran-precio', 'la-ilusion-competitiva'],
    lensTags: {
      patterns: ['P1', 'P5', 'P6'],
      sectors: ['salud'],
      years: [2014, 2018, 2024],
      terms: ['concentración', 'farmacéutico', 'IMSS', 'PISA', 'Maypo'],
    },
    entities: [
      {
        type: 'vendor',
        id: 29277,
        name: 'Grupo Fármacos Especializados',
        riskScore: 1,
        role: 'ARIA pattern P1 · 133.2B MXN across 6,303 contracts · current tier in the vendor dossier',
        role_es: 'Patrón ARIA P1 · 133,200 MDP en 6,303 contratos · nivel vigente en el expediente del proveedor',
      },
      {
        type: 'vendor',
        id: 2873,
        name: 'Farmacéuticos Maypo',
        riskScore: 0.94,
        role: 'ARIA pattern P1 · 86.2B MXN across 18,216 contracts · current tier in the vendor dossier',
        role_es: 'Patrón ARIA P1 · 86,200 MDP en 18,216 contratos · nivel vigente en el expediente del proveedor',
      },
      {
        type: 'vendor',
        id: 4335,
        name: 'Laboratorios PISA',
        riskScore: 0.93,
        role: 'ARIA pattern P1 · 55.4B MXN across 9,173 contracts · current tier in the vendor dossier',
        role_es: 'Patrón ARIA P1 · 55,400 MDP en 9,173 contratos · nivel vigente en el expediente del proveedor',
      },
      {
        type: 'vendor',
        id: 13885,
        name: 'Distribuidora Internacional de Medicamentos y Equipo Médico (Dimesa)',
        riskScore: 0.97,
        role: 'ARIA pattern P1 · 51.4B MXN across 4,305 contracts · current tier in the vendor dossier',
        role_es: 'Patrón ARIA P1 · 51,400 MDP en 4,305 contratos · nivel vigente en el expediente del proveedor',
      },
    ],
    nextSteps: [
      'Request that COFECE review concentration in IMSS pharmaceutical procurement (Art. 53 of the Ley Federal de Competencia Económica), starting from the market-share and single-award figures in the register.',
      'Request from IMSS a complete breakdown of pharmaceutical procurement contracts 2007-2020, including competing bidders at each tender — how many genuinely competitive procedures were there?',
      'Investigate the 2025 spike in Laboratorios PISA contracting: what specific contracts drove the 19.46B MXN annual figure, and under what procurement mechanism?',
      'Cross-reference the 40 non-pharmaceutical P1 vendors with RUPC records to identify declared shareholders, legal representatives, and physical addresses.',
      'Identify which IMSS procurement directors approved the 2013-2019 Grupo Fármacos contracts using SIPOT declarations of interests and meeting records.',
      'Track the AMLO-era transition of pharmaceutical contracting from IMSS-direct to BIRMEX/INSABI: did the same P1 vendors continue dominating under the new architecture?',
    ],
    nextSteps_es: [
      'Solicitar a la COFECE que revise la concentración en la contratación farmacéutica del IMSS (Art. 53 de la LFCE), a partir de las cifras de participación de mercado y de procedimientos con un solo adjudicado del registro.',
      'Solicitar al IMSS el desglose completo de contratos farmacéuticos 2007-2020, incluyendo licitantes competidores en cada convocatoria — ¿cuántos procedimientos fueron genuinamente competitivos?',
      'Investigar el repunte de contratos de Laboratorios PISA en 2025: ¿qué contratos específicos impulsaron los 19,460 MDP anuales y bajo qué mecanismo de contratación?',
      'Cruzar los 40 proveedores P1 no farmacéuticos contra el RUPC para identificar accionistas declarados, representantes legales y domicilios físicos.',
      'Identificar qué directores de compras del IMSS aprobaron los contratos con Grupo Fármacos 2013-2019 usando declaraciones de intereses del SIPOT y actas de reunión.',
      'Rastrear la transición del sexenio de AMLO en la contratación farmacéutica del IMSS hacia BIRMEX/INSABI: ¿los mismos proveedores P1 continuaron dominando bajo la nueva arquitectura?',
    ],
    chapters: [
      {
        id: 'ch1',
        number: 1,
        title: "The Surface",
        title_es: "La superficie",
        subtitle: "Four named competitors, one buyer",
        subtitle_es: "Cuatro competidoras con nombre, un solo comprador",
        prose: [
          "Grupo Fármacos Especializados collected 133.2 billion pesos from the Mexican federal government, all of it between 2007 and 2020. It is not alone. Farmacéuticos Maypo took 86.2 billion. Laboratorios PISA took 55.4 billion. Dimesa — Distribuidora Internacional de Medicamentos y Equipo Médico — took 51.4 billion. Combined: 326.2 billion pesos.",
          "RUBLI's risk indicator scores all four high. The score is a risk indicator, not a verdict — the model flags statistical patterns that resemble its labelled cases, not proof of anything, and it rises with contract size, so suppliers this large score high partly on size alone. What the register shows directly is four distributors holding 326.2 billion pesos in a single product line.",
          "The framework that produced these contracts mutated three times: IMSS-direct procurement under Calderón, INSABI/BIRMEX consolidation under AMLO, IMSS-Bienestar consolidated tendering under Sheinbaum. Three sets of rules. Grupo Fármacos Especializados records its last federal contract in 2020; the other three are still contracting in 2025. The next layers cut the market open.",
        ],
        prose_es: [
          "Grupo Fármacos Especializados recibió 133,200 millones de pesos del gobierno federal mexicano, todos entre 2007 y 2020. No está sola. Farmacéuticos Maypo se llevó 86,200 millones. Laboratorios PISA se llevó 55,400 millones. Dimesa — Distribuidora Internacional de Medicamentos y Equipo Médico — se llevó 51,400 millones. En conjunto: 326,200 millones de pesos.",
          "El indicador de riesgo de RUBLI califica alto a las cuatro. La calificación es un indicador de riesgo, no un veredicto — el modelo señala patrones estadísticos parecidos a los de sus casos etiquetados, no prueba nada, y sube con el tamaño de los contratos, así que proveedores de este tamaño califican alto en parte solo por su tamaño. Lo que el registro muestra directamente es a cuatro distribuidoras que concentran 326,200 millones de pesos en una sola línea de producto.",
          "El marco que produjo estos contratos mutó tres veces: contratación directa del IMSS bajo Calderón, consolidación vía INSABI/BIRMEX bajo AMLO, licitación consolidada IMSS-Bienestar bajo Sheinbaum. Tres conjuntos de reglas. Grupo Fármacos Especializados registra su último contrato federal en 2020; las otras tres siguen contratando en 2025. Las capas siguientes abren el mercado.",
        ],
        pullquote: {
          quote:
            'Four named competitors. Two decades of tenders. On paper, a market. Cut into it and a single structure appears.',
          quote_es:
            'Cuatro competidoras con nombre. Dos décadas de licitaciones. En el papel, un mercado. Córtalo y aparece una sola estructura.',
          stat: '326.2B MXN',
          statLabel: 'four-vendor pharmaceutical concentration, 2002-2025',
          statLabel_es: 'concentración farmacéutica de cuatro proveedores, 2002-2025',
          barValue: 0.103,
          barLabel: '10.4% of all federal IMSS contracting (any sector, any year)',
          barLabel_es:
            '10.4% de toda la contratación federal del IMSS (cualquier sector, cualquier año)',
          vizTemplate: 'mass-sliver',
        },
        chartConfig: {
          type: 'inline-bar',
          title: 'The Surface — Four Vendors, 326.2 Billion Pesos',
          title_es: 'La superficie — Cuatro proveedores, 326.2 mil millones de pesos',
          chartId: 'big-four-totals',
          data: {
            points: [
              {
                label: 'Grupo Fármacos',
                value: 133.2,
                riskScore: 1,
                annotation: 'risk 1.00',
                annotation_es: 'riesgo 1.00',
              },
              {
                label: 'Maypo',
                value: 86.2,
                riskScore: 0.94,
                annotation: 'risk 0.94',
                annotation_es: 'riesgo 0.94',
              },
              {
                label: 'PISA',
                value: 55.4,
                riskScore: 0.93,
                annotation: 'risk 0.93',
                annotation_es: 'riesgo 0.93',
              },
              {
                label: 'Dimesa',
                value: 51.4,
                riskScore: 0.97,
                annotation: 'risk 0.97',
                annotation_es: 'riesgo 0.97',
              },
            ],
            unit: 'B MXN',
            annotation:
              'Total federal contracting per vendor, 2002-2025. Combined: 326.2B MXN. All four carry critical-tier risk scores.',
            annotation_es:
              'Contratación federal total por proveedor, 2002-2025. Combinado: 326.2 mil millones de pesos. Los cuatro tienen calificaciones de riesgo de nivel crítico.',
          },
        },
        sources: [
          'RUBLI vendor_stats and contracts tables. P1 pattern classification, April 2026.',
          'COMPRANET (SHCP). Federal procurement records 2003-2025, vendor_id IN (29277, 2873, 4335, 13885).',
        ],
      },
      {
        id: 'ch2',
        number: 2,
        title: "The Customer",
        title_es: "El cliente",
        subtitle: "One buyer underwrites up to three-quarters of each vendor",
        subtitle_es: "Un comprador sostiene hasta tres cuartas partes de cada proveedor",
        prose: [
          "One customer underwrites this entire market. The Instituto Mexicano del Seguro Social — Mexico's largest single-payer health institution — supplies 79.3 percent of Laboratorios PISA's lifetime federal revenue, 68.5 percent of Dimesa's, 60.1 percent of Grupo Fármacos', and 50.9 percent of Maypo's. Four sellers, one buyer of consequence.",
          "Read it from the customer's side and the concentration sharpens. The four collected 202.9 billion pesos in IMSS contracting alone — 10.4 percent of every peso IMSS spent on any contractor in any sector across 23 years, against a 1,957-billion-peso lifetime baseline. Four pharmaceutical distributors take one peso in every ten. No competitive supplier base produces that shape on its own.",
          "The wall that keeps competitors out is written into law. Article 41 of the Ley de Adquisiciones lets an agency award directly on the basis of an existing supplier relationship — the clause that converts past dependence into present preference. Each contract makes the next one easier to award to the same four hands.",
        ],
        prose_es: [
          "Un solo cliente sostiene todo este mercado. El Instituto Mexicano del Seguro Social — la institución de salud de pagador único más grande de México — aporta el 79.3 por ciento de los ingresos federales acumulados de Laboratorios PISA, el 68.5 por ciento de los de Dimesa, el 60.1 por ciento de los de Grupo Fármacos y el 50.9 por ciento de los de Maypo. Cuatro vendedoras, un solo comprador de peso.",
          "Visto desde el lado del comprador, la concentración se afila. Los cuatro recaudaron 202,900 millones de pesos solo en contratación con el IMSS — el 10.4 por ciento de cada peso que el IMSS gastó en cualquier contratista, de cualquier sector, en 23 años, frente a una base acumulada de 1.957 billones de pesos. Cuatro distribuidoras farmacéuticas se llevan uno de cada diez pesos. Ninguna base de proveedores competitiva produce esa forma por sí sola.",
          "El muro que mantiene fuera a los competidores está escrito en la ley. El Artículo 41 de la Ley de Adquisiciones permite adjudicar directamente con base en una relación de proveedor existente — la cláusula que convierte la dependencia pasada en preferencia presente. Cada contrato vuelve más fácil adjudicar el siguiente a las mismas cuatro manos.",
        ],
        chartConfig: {
          type: 'inline-stacked-bar',
          title: 'The Customer — How Much of Each Vendor Lives Inside One Buyer',
          title_es: 'El cliente — Cuánto de cada proveedor vive dentro de un solo comprador',
          stacked: {
            rows: [
              {
                label: 'Grupo Fármacos',
                total: 133.2,
                highlight: 80,
                annotation: '60.1% IMSS',
                annotation_es: '60.1% IMSS',
              },
              {
                label: 'Maypo',
                total: 86.2,
                highlight: 43.9,
                annotation: '50.9% IMSS',
                annotation_es: '50.9% IMSS',
              },
              {
                label: 'PISA',
                total: 55.4,
                highlight: 43.9,
                annotation: '79.3% IMSS',
                annotation_es: '79.3% IMSS',
              },
              {
                label: 'Dimesa',
                total: 51.4,
                highlight: 35.2,
                annotation: '68.5% IMSS',
                annotation_es: '68.5% IMSS',
              },
            ],
            unit: 'B MXN',
            anchor: {
              value: '202.9B MXN',
              label: 'BIG FOUR · IMSS CONTRACTING ONLY · 2002-2025',
              label_es: 'LAS CUATRO GRANDES · SOLO CONTRATACIÓN IMSS · 2002-2025',
            },
            annotation:
              "Solid bar = IMSS portion. Faded portion = all other federal customers combined. Each vendor's dependency on IMSS is between 51% and 79%.",
            annotation_es:
              'Barra sólida = porción IMSS. Porción atenuada = todos los demás clientes federales juntos. La dependencia de cada proveedor respecto del IMSS va de 51% a 79%.',
            highlightColor: '#dc2626',
            highlightLabel: 'IMSS portion',
            highlightLabel_es: 'porción IMSS',
            baseLabel: 'all other clients',
            baseLabel_es: 'todos los demás clientes',
          },
        },
        pullquote: {
          quote:
            "Four pharmaceutical vendors. One customer. One in every ten pesos IMSS spent on any contractor across 23 years.",
          quote_es:
            "Cuatro proveedores farmacéuticos. Un solo cliente. Uno de cada diez pesos que el IMSS gastó en cualquier contratista en 23 años.",
          stat: '10.4%',
          statLabel: "Big Four share of all federal IMSS contracting, 2002-2025",
          statLabel_es:
            "participación de las Cuatro Grandes en toda la contratación federal del IMSS, 2002-2025",
          barValue: 0.793,
          barLabel: 'PISA reaches 79.3% IMSS dependency — highest of the four',
          barLabel_es: 'PISA alcanza 79.3% de dependencia del IMSS — la más alta de las cuatro',
          vizTemplate: 'mosaic-tile',
        },
        sources: [
          'RUBLI contracts table joined with institutions, vendor_id IN (29277, 2873, 4335, 13885), institution name LIKE "%MEXICANO DEL SEGURO%".',
          'IMSS total contracting 2002-2025 derived from COMPRANET. Big-Four share calculated against 1,956B MXN IMSS lifetime spend.',
        ],
      },
      {
        id: 'ch3',
        number: 3,
        title: "The Lattice",
        title_es: "El entramado",
        subtitle: "The four meet in 5,285 of the same procurement procedures",
        subtitle_es: "Los cuatro se encuentran en 5,285 de los mismos procedimientos",
        prose: [
          "Maypo and PISA appear together in 1,436 of the same procurement procedures — distinct tenders where both companies show up as bidders or contract recipients. Grupo Fármacos and Maypo share 1,258. Grupo Fármacos and Dimesa, 810. Maypo and Dimesa, 478. Grupo Fármacos and PISA, 257. PISA and Dimesa, 46. In total: 5,285 shared procurement procedures across 23 years.",
          "Independent competitors chasing distinct contracts do not usually overlap this way. A bidding record shows that they meet; it cannot say why.",
          "A second number sharpens it: 69 percent of every peso the four collected came through direct award — nearly seven times the 10 percent line the EU Single Market Scoreboard treats as unsatisfactory. More than two in three pesos bypassed open competition. None of this, on its own, says why. If the lattice is the organism's shape, the next layer shows it breathing.",
        ],
        prose_es: [
          "Maypo y PISA aparecen juntas en 1,436 de los mismos procedimientos de contratación — licitaciones distintas donde ambas figuran como licitantes o destinatarias de contratos. Grupo Fármacos y Maypo comparten 1,258. Grupo Fármacos y Dimesa, 810. Maypo y Dimesa, 478. Grupo Fármacos y PISA, 257. PISA y Dimesa, 46. En total: 5,285 procedimientos compartidos en 23 años.",
          "Competidores independientes que persiguen contratos distintos no suelen solaparse así. Un registro de licitaciones muestra que se encuentran; no puede decir por qué.",
          "Un segundo dato lo afila: el 69 por ciento de cada peso que recaudaron los cuatro llegó por adjudicación directa — casi siete veces la línea del 10 por ciento que el Tablero del Mercado Único de la UE considera insatisfactoria. Más de dos de cada tres pesos eludieron la competencia abierta. Nada de esto, por sí solo, dice por qué. Si el entramado es la forma del organismo, la capa siguiente lo muestra respirando.",
        ],
        chartConfig: {
          type: 'inline-network',
          title: 'The Lattice — Shared Bidding Procedures Among the Four',
          title_es: 'El entramado — Procedimientos de licitación compartidos entre los cuatro',
          chartId: 'big-four-network',
          network: {
            nodes: [
              {
                id: 'gf',
                label: 'Grupo F.',
                sublabel: '133.4B',
                color: '#dc2626',
                highlight: true,
              },
              {
                id: 'maypo',
                label: 'Maypo',
                sublabel: '88.0B',
                color: '#a06820',
              },
              {
                id: 'pisa',
                label: 'PISA',
                sublabel: '55.6B',
                color: '#3b82f6',
              },
              {
                id: 'dimm',
                label: 'Dimesa',
                sublabel: '51.6B',
                color: '#8b5cf6',
              },
            ],
            edges: [
              {
                from: 'maypo',
                to: 'pisa',
                weight: 1436,
                label: '1,436',
              },
              {
                from: 'gf',
                to: 'maypo',
                weight: 1258,
                label: '1,258',
              },
              {
                from: 'gf',
                to: 'dimm',
                weight: 810,
                label: '810',
              },
              {
                from: 'maypo',
                to: 'dimm',
                weight: 478,
                label: '478',
              },
              {
                from: 'gf',
                to: 'pisa',
                weight: 257,
                label: '257',
              },
              {
                from: 'pisa',
                to: 'dimm',
                weight: 46,
                label: '46',
              },
            ],
            anchor: {
              value: '5,285',
              label: 'TOTAL SHARED PROCUREMENT PROCEDURES',
              label_es: 'TOTAL DE PROCEDIMIENTOS COMPARTIDOS',
            },
            annotation:
              'Edge thickness scales with the number of bidding procedures both vendors appear in. Maypo↔PISA (1,436) and Grupo Fármacos↔Maypo (1,258) carry most of the overlap — exactly the pairs that dominated IMSS pharmaceutical contracting through the 2010s.',
            annotation_es:
              'El grosor de cada conexión es proporcional al número de procedimientos de licitación en los que ambos proveedores aparecen. Maypo↔PISA (1,436) y Grupo Fármacos↔Maypo (1,258) cargan la mayor parte del traslape — exactamente las parejas que dominaron la contratación farmacéutica del IMSS durante la década de 2010.',
          },
        },
        pullquote: {
          quote:
            "Maypo and PISA appear in 1,436 of the same procurement procedures. Repeated co-bidding among a small supplier set is one of the patterns the OECD advises procurement agencies to screen for.",
          quote_es:
            "Maypo y PISA aparecen en 1,436 de los mismos procedimientos. La co-licitación repetida entre pocos proveedores es uno de los patrones que la OCDE recomienda a las compras públicas vigilar.",
          stat: '5,285',
          statLabel: "shared bidding procedures among the Big Four (combined)",
          statLabel_es: "procedimientos de licitación compartidos entre las Cuatro Grandes (en conjunto)",
          barValue: 0.69,
          barLabel: 'Direct-award rate across all Big-Four contracts: 69% — EU scoreboard line 10%',
          barLabel_es:
            'Tasa de adjudicación directa en todos los contratos de las Cuatro Grandes: 69% — línea del Tablero UE 10%',
          vizTemplate: 'breach-ceiling',
        },
        sources: [
          'RUBLI co-bidding analysis: COUNT(DISTINCT procedure_number) where both vendor_a and vendor_b appear in contracts for the same procedure_number.',
          'OECD. (2012). Recommendation on Fighting Bid Rigging in Public Procurement.',
          'Ley Federal de Competencia Económica, Art. 53 (prácticas monopólicas absolutas).',
                                                                                            'European Commission. Single Market Scoreboard — Public procurement (single bidder and direct awards indicators).',
        ],
      },
      {
        id: 'ch4',
        number: 4,
        title: "The Pulse",
        title_es: "El pulso",
        subtitle: "Dominance passes vendor to vendor as the rules change",
        subtitle_es: "El dominio pasa de proveedor en proveedor mientras cambian las reglas",
        prose: [
          "In 2020, Grupo Fármacos went from 17.64 billion pesos the year before to zero — not reduced, not redirected to other clients, zero — and has stayed there every year since. Dimesa collapsed 97 percent in the same year. Maypo was cut in half. The cause is documented: the AMLO administration dissolved IMSS-direct pharmaceutical procurement and consolidated buying through INSABI and BIRMEX, expressly to break what it called \"the cartel of distributors.\"",
          "Plotted across 2003-2025, the four series read as a relay. The early years belonged to PISA, peaking at 2.97 billion in 2009 — about one and a half times its nearest rival — then going quiet, never crossing 3.5 billion a year through the 2010s. In its place rose Grupo Fármacos: 1.07 billion in 2007, climbing to a 19.94-billion peak in 2017, a single-year figure larger than the annual budget of several federal ministries. Maypo peaked at 10.05 billion and Dimesa at 7.96 billion, both in 2018. Three of the four hit their all-time annual peaks inside a 12-month window.",
          "The spend never vanished after the 2020 cliff — it changed hands. PISA, quiet for a decade, resurged: 6.42 billion in 2020, then 2.56, 3.77, 0.13, 0.67 across the COVID years. Then in 2025, under Sheinbaum's IMSS-Bienestar consolidated tendering, PISA contracted 19.46 billion pesos in a single year — almost exactly Grupo Fármacos' 2017 peak. The architecture changed three times. The dominant vendor changed identity. The dependency did not.",
        ],
        prose_es: [
          "En 2020, Grupo Fármacos pasó de 17,640 millones de pesos el año anterior a cero — no reducido, no redirigido a otros clientes, cero — y ahí ha permanecido cada año desde entonces. Dimesa colapsó un 97 por ciento el mismo año. Maypo se redujo a la mitad. La causa está documentada: la administración de AMLO disolvió la contratación farmacéutica directa del IMSS y consolidó las compras vía INSABI y BIRMEX, expresamente para romper lo que llamó \"el cártel de los distribuidores\".",
          "Graficados a lo largo de 2003-2025, los cuatro trazos se leen como un relevo. Los primeros años fueron de PISA, con un pico de 2,970 millones en 2009 — cerca de una vez y media su rival más cercano — y luego silencio, sin cruzar los 3,500 millones al año durante la década de 2010. En su lugar se alzó Grupo Fármacos: 1,070 millones en 2007, escalando a un pico de 19,940 millones en 2017, una cifra de un solo año mayor que el presupuesto anual de varios ministerios federales. Maypo alcanzó su pico en 10,050 millones y Dimesa en 7,960 millones, ambos en 2018. Tres de los cuatro registraron sus máximos históricos en una ventana de 12 meses.",
          "El gasto nunca desapareció tras el precipicio de 2020 — cambió de manos. PISA, silenciosa una década, resurgió: 6,420 millones en 2020, luego 2,560, 3,770, 130, 670 a lo largo de los años de la COVID. Y en 2025, bajo la licitación consolidada de IMSS-Bienestar de Sheinbaum, PISA contrató 19,460 millones de pesos en un solo año — casi exactamente el pico de 2017 de Grupo Fármacos. La arquitectura cambió tres veces. El proveedor dominante cambió de identidad. La dependencia no.",
        ],
        chartConfig: {
          type: 'inline-multi-line',
          title: 'The Pulse — The Big Four, Annual Contracting 2003-2025',
          title_es: 'El pulso — las Cuatro Grandes, contratación anual 2003-2025',
          chartId: 'big-four-relay',
          multiSeries: {
            xLabels: [
              '2003',
              '2004',
              '2005',
              '2006',
              '2007',
              '2008',
              '2009',
              '2010',
              '2011',
              '2012',
              '2013',
              '2014',
              '2015',
              '2016',
              '2017',
              '2018',
              '2019',
              '2020',
              '2021',
              '2022',
              '2023',
              '2024',
              '2025',
            ],
            unit: 'B MXN',
            yLabel: 'Annual contract value',
            yLabel_es: 'Valor de contratación anual',
            series: [
              {
                name: 'Grupo Fármacos',
                color: '#dc2626',
                values: [
                  0, 0, 0, 0, 1.07, 2.81, 2.01, 1.22, 4.93, 13.5, 14.94, 13.23, 13.31, 12.93,
                  19.94, 15.64, 17.64, 0, 0, 0, 0, 0, 0,
                ],
                annotation: {
                  xIndex: 14,
                  text: '19.94 peak (2017)',
                  text_es: '19.94 pico (2017)',
                },
                totalCaption: '· 133.4B total',
                totalCaption_es: '· 133.4B total',
              },
              {
                name: 'Maypo',
                color: '#a06820',
                values: [
                  0.36, 0, 0.43, 1.04, 2.08, 1.62, 1.73, 1.42, 3.65, 5.85, 6.3, 4.69, 6.46, 4.57,
                  9.77, 10.05, 7.98, 4.17, 4.5, 3.87, 2.37, 2.86, 0.31,
                ],
                annotation: {
                  xIndex: 15,
                  text: '10.05 (2018)',
                  text_es: '10.05 (2018)',
                },
                totalCaption: '· 88.0B total',
                totalCaption_es: '· 88.0B total',
              },
              {
                name: 'PISA',
                color: '#3b82f6',
                values: [
                  1.18, 0, 2.41, 0.56, 1.39, 0.73, 2.97, 0.29, 0.57, 1.25, 0.71, 0.94, 2.6, 0.96,
                  1.23, 0.47, 3.5, 6.42, 2.56, 3.77, 0.13, 0.67, 19.46,
                ],
                annotation: {
                  xIndex: 22,
                  text: '19.46 (2025)',
                  text_es: '19.46 (2025)',
                },
                totalCaption: '· 55.6B total',
                totalCaption_es: '· 55.6B total',
              },
              {
                name: 'Distribuidora Internacional de Medicamentos y Equipo Médico (Dimesa)',
                color: '#8b5cf6',
                values: [
                  0.01, 0, 0.02, 0, 0, 0, 0, 0.13, 0.86, 3.38, 4.56, 4.26, 5.66, 6.53, 7.4, 7.96,
                  7.51, 0.18, 0.24, 0.3, 0.24, 1.05, 1.09,
                ],
                annotation: {
                  xIndex: 15,
                  text: '7.96 (2018)',
                  text_es: '7.96 (2018)',
                },
                totalCaption: '· 51.6B total',
                totalCaption_es: '· 51.6B total',
              },
            ],
            annotation:
              "Read the relay: PISA dominates 2003-2009 → Grupo Fármacos / Maypo / Dimesa dominate 2010-2019 → 2020 cliff (Grupo F. + Dimesa collapse) → PISA returns and explodes in 2025 (19.46B, matching Grupo F.'s 2017 all-time peak). The architecture that produced these contracts changed three times. The dependency did not.",
            annotation_es:
              'Lee el relevo: PISA domina 2003-2009 → Grupo Fármacos / Maypo / Dimesa dominan 2010-2019 → desplome 2020 (Grupo F. + Dimesa colapsan) → PISA regresa y explota en 2025 (19.46B, igualando el pico histórico de 2017 de Grupo F.). La arquitectura que produjo estos contratos cambió tres veces. La dependencia no.',
            eventLines: [
              {
                xIndex: 17,
                label: '2020 · INSABI/BIRMEX',
                label_es: '2020 · INSABI/BIRMEX',
                color: '#64748b',
              },
            ],
          },
        },
        pullquote: {
          quote:
            "From 17.64 billion in 2019 to zero in 2020. Not slowed. Not reduced. Zero. Then PISA — quiet for a decade — resurged to 19.46 billion.",
          quote_es:
            "De 17,640 millones en 2019 a cero en 2020. No frenado. No reducido. Cero. Y entonces PISA — silenciosa una década — resurgió a 19,460 millones.",
          stat: '19.46B MXN',
          statLabel: "PISA 2025 — matches Grupo Fármacos' all-time 2017 peak almost exactly",
          statLabel_es:
            "PISA 2025 — iguala casi exactamente el pico histórico de Grupo Fármacos en 2017",
        },
        sources: [
          'RUBLI per-year aggregation: SUM(amount_mxn) GROUP BY contract_year, vendor_id for the four vendors.',
          'DOF. (2019). Decreto de creación del Instituto de Salud para el Bienestar (INSABI).',
          'DOF. (2024). Reformas a la Ley de IMSS-Bienestar y consolidación de compra federal.',
        ],
      },
      {
        id: 'ch5',
        number: 5,
        title: "The Void at the Core",
        title_es: "El vacío en el centro",
        subtitle: "Where oversight should be, the record is empty",
        subtitle_es: "Donde debería estar la fiscalización, el registro está vacío",
        prose: [
          "Grupo Fármacos Especializados took 133 billion pesos over 13 years, and RUBLI found no published ASF audit focused on it. No public investigation RUBLI could locate has named all four together. Dimesa is virtually unknown to the public; Maypo surfaces in periodic procurement features but never a sustained inquiry; PISA, the most-covered of the four, drew no published regulatory response when its 2025 contracting exploded to 19.46 billion pesos.",
          "That 2025 spike demands immediate scrutiny. A distributor that had not crossed 3.5 billion pesos a year in over a decade booked 19.46 billion in one — including a 6.69-billion-peso consolidated medicine contract awarded in February 2025 and a 4.82-billion-peso direct-award contract for \"claves del sector salud\" in June 2025. The direct-award status is a flag; the size is unprecedented; the vendor's prior absence from consolidated tendering is conspicuous.",
          "The instruments to examine all of this already exist. COFECE can open Art. 53 investigations into prácticas monopólicas absolutas under the Ley Federal de Competencia Económica. RUBLI supplies the detection: it classifies the four under its P1 pattern and places two of them at Tier 1 of the ARIA queue and two at Tier 2; its public queue lists 27 non-pharmaceutical P1 vendors awaiting the same scrutiny. COFECE has repeatedly identified pharmaceutical distribution as a market where tendering conditions favour incumbents; its competition studies in the sector are the natural starting point for the monitoring this analysis calls for.",
          "What is missing is the will to convert flags into formal investigations. The specimen has been opened. Its structure is visible in the data, traceable in the bidding records, unconcealed in the financials. Until that void fills, the concentration will regenerate around whatever architecture Mexican health procurement adopts next — and no one with the authority to look has looked.",
        ],
        prose_es: [
          "Grupo Fármacos Especializados se llevó 133,000 millones de pesos en 13 años, y RUBLI no encontró una auditoría publicada de la ASF enfocada en la empresa. Ninguna investigación pública que RUBLI haya podido localizar ha nombrado a las cuatro juntas. Dimesa es prácticamente desconocida para el público; Maypo aparece en reportajes esporádicos de contratación pero nunca como sujeto de una indagatoria sostenida; PISA, la más cubierta de las cuatro, no provocó respuesta regulatoria publicada cuando su contratación de 2025 explotó a 19,460 millones de pesos.",
          "Ese pico de 2025 exige escrutinio inmediato. Una distribuidora que no había cruzado los 3,500 millones de pesos al año en más de una década registró 19,460 millones en uno — incluyendo un contrato de medicamentos consolidados por 6,690 millones adjudicado en febrero de 2025 y un contrato de adjudicación directa por 4,820 millones para \"claves del sector salud\" en junio de 2025. La adjudicación directa es una bandera; el tamaño es sin precedentes; la ausencia previa del proveedor en la licitación consolidada es llamativa.",
          "Los instrumentos para examinar todo esto ya existen. La COFECE puede abrir investigaciones del Art. 53 sobre prácticas monopólicas absolutas bajo la Ley Federal de Competencia Económica. RUBLI aporta la detección: clasifica a las cuatro bajo su patrón P1 y coloca a dos en el Nivel 1 de la fila de ARIA y a dos en el Nivel 2; su fila pública lista 27 proveedores P1 no farmacéuticos a la espera del mismo escrutinio. La COFECE ha señalado repetidamente la distribución farmacéutica como un mercado donde las condiciones de licitación favorecen a los proveedores establecidos; sus estudios de competencia en el sector son el punto de partida natural para el monitoreo que este análisis propone.",
          "Lo que falta es la voluntad de convertir las señales en investigaciones formales. El espécimen ya está abierto. Su estructura es visible en los datos, rastreable en los registros de licitación y no está oculta en las finanzas. Hasta que ese vacío se llene, la concentración se regenerará en torno a cualquier arquitectura que adopte después la contratación de salud mexicana — y nadie con la autoridad para mirar ha mirado.",
        ],
        pullquote: {
          quote:
            "133 billion pesos. Thirteen years. And not one published ASF audit.",
          quote_es:
            "133,000 millones de pesos. Trece años. Y ni una sola auditoría publicada de la ASF.",
          stat: '19.46B MXN',
          statLabel: "Laboratorios PISA, 2025 — under Sheinbaum's IMSS-Bienestar architecture",
          statLabel_es:
            "Laboratorios PISA, 2025 — bajo la arquitectura de IMSS-Bienestar de Sheinbaum",
        },
        sources: [
          'RUBLI ARIA queue, P1 classification and tiers for the four distributors — run 0fe1409e, 13 October 2026 (/aria/queue).',
          'COMPRANET. PISA 2025 contract records (vendor_id 4335), 391 contracts totalling 19.46B MXN; largest two awarded 2025-02-21 and 2025-06-18.',
          'Ley Federal de Competencia Económica, Art. 53 (prácticas monopólicas absolutas).',
        ],
      },
    ],
  },

  // === STORY 4: Now You See Competition ===
  {
    slug: 'la-ilusion-competitiva',
    outlet: 'data_analysis',
    type: 'thematic',
    era: 'cross',
    headline: "Now You See Competition",
    headline_es: "Ahora usted ve competencia",
    subheadline:
      "A competitive tender promises a room full of bidders. For fourteen straight years, more than 45% of the contracts in Mexico's \"competitive\" federal procedures came from a procedure with exactly one winner. CompraNet records winners, not bidders, so this is not the EU's single-bidder indicator and is not measured against its line. Here is how it works — and why every step is legal.",
    subheadline_es:
      "Una licitación competitiva promete una sala llena de oferentes. Durante catorce años seguidos, más del 45% de los contratos de procedimientos \"competitivos\" federales de México vinieron de un procedimiento con exactamente un ganador. CompraNet registra ganadores, no oferentes, así que esta no es la tasa de un solo oferente de la UE ni se mide contra su línea. Así funciona — y por qué cada paso es legal.",
    byline: 'RUBLI Data Analysis Unit',
    estimatedMinutes: 16,
    status: 'reporteado',
    leadStat: {
      value: '65.65%',
      label: "peak single-award rate",
      label_es: "pico de tasa con un solo adjudicado",
      sublabel: "2014 — share of contracts in competitive procedures with one winner",
      sublabel_es: "2014 — proporción de los contratos de procedimientos competitivos con un solo adjudicado",
      color: '#f59e0b',
    },
    kickerStats: [
      {
        value: '45%+',
        suffix: "single-award for 14 straight years",
        suffix_es: "un solo adjudicado durante 14 años seguidos",
        tone: 'data',
      },
      {
        value: '362,000',
        suffix: "contracts in competitive procedures, one winner",
        suffix_es: "contratos de procedimientos competitivos, un solo adjudicado",
        tone: 'critical',
      },
      {
        value: '89.0%',
        suffix: "single-award in civilian infrastructure",
        suffix_es: "un solo adjudicado en infraestructura civil",
        tone: 'critical',
      },
    ],
    relatedSlugs: ['marea-de-adjudicaciones', 'el-monopolio-invisible', 'captura-institucional'],
    lensTags: {
      patterns: ['P5', 'P7'],
      sectors: ['infraestructura', 'hacienda'],
      terms: ['un solo adjudicado', 'single award', 'vales', 'voucher'],
    },
    entities: [
    ],
    nextSteps: [
      "Request from SFP the official single-award statistics for 2020-2025 and compare against RUBLI's independent calculation from COMPRANET microdata.",
      'Identify the 100 procedures with the highest contract values that ended with a single winner in 2023 and request full bid evaluation records.',
      "File COFECE investigation reports for the top 20 vendor co-bidding pairs identified in RUBLI's ARIA queue P5 pattern.",
      'Research which industries in Mexico have COFECE "effective competition" certification and cross-reference their single-award rates against uncertified sectors.',
      'Map single-award rates by procurement institution to identify the worst-offending procurement units for prioritized audit.',
      'Pursue a journalistic investigation of the 2014 single-award peak (65.65% of contracts in competitive procedures) — what specific procurement category or institution drove the annual figure?',
    ],
    nextSteps_es: [
      'Solicitar a la SFP las estadísticas oficiales con un solo adjudicado 2020-2025 y comparar con el cálculo independiente de RUBLI a partir de los microdatos de COMPRANET.',
      'Identificar los 100 procedimientos de mayor valor contractual con un solo adjudicado en 2023 y solicitar las actas completas de evaluación de propuestas.',
      'Presentar denuncias de investigación ante la COFECE para los 20 pares de proveedores co-licitantes identificados en el patrón P5 de la fila ARIA de RUBLI.',
      'Investigar qué industrias en México cuentan con certificación de "competencia efectiva" de la COFECE y cruzar sus tasas con un solo adjudicado con sectores no certificados.',
      'Mapear las tasas con un solo adjudicado por institución compradora para identificar las unidades de compra con peor desempeño y priorizar la auditoría.',
      'Realizar una investigación periodística sobre el pico con un solo adjudicado de 2014 (65.65% de los contratos de procedimientos competitivos) — ¿qué categoría de compra o institución específica impulsó esa cifra anual?',
    ],
    corrections: [
      "2026-09-19 — An earlier edition read the 2010 fall in single-award procedures as CompraNet's launch working. COMPRANET does not code procedure type before 2010, so the fall is the denominator changing rather than the market; chapter two now sets out the correction.",
      "2026-09-30 — RUBLI now counts each contract in the year of its contract date. 175,767 contracts from COMPRANET's 2010 file that were signed in 2011 or 2012 had been counted in 2010, which inflated 2010. The comparable window now starts in 2011: the run above 45 percent is fourteen years, not fifteen, it holds about 362,000 single-award procedures rather than 376,000, and the jump chapter two describes falls in 2011.",
    ],
    corrections_es: [
      "2026-09-19 — Una edición anterior leía la caída de 2010 en la proporción con un solo adjudicado como el efecto del arranque de CompraNet. CompraNet no codifica el tipo de procedimiento antes de 2010, así que la caída es el denominador que cambia, no el mercado; el capítulo dos expone ahora la corrección.",
      "2026-09-30 — RUBLI cuenta ahora cada contrato en el año de su fecha de contrato. 175,767 contratos del archivo 2010 de CompraNet firmados en 2011 o 2012 se contaban en 2010, lo que inflaba ese año. La ventana comparable empieza ahora en 2011: la racha arriba del 45 por ciento es de catorce años, no quince, suma unos 362,000 procedimientos con un solo adjudicado y no 376,000, y el salto que describe el capítulo dos cae en 2011.",
    ],
    chapters: [
      {
        id: 'ch1',
        number: 1,
        title: "One Winner, 362,000 Times",
        title_es: "Un solo adjudicado, 362,000 veces",
        subtitle: "A competitive procedure that ends with a single winner is the rule, not the exception",
        subtitle_es: "Una licitación competitiva con un solo adjudicado es la regla, no la excepción",
        prose: [
          "About 362,000 times between 2011 and 2024, a Mexican federal contract came from a procedure run as competitive that ended with exactly one winner. Each one met the legal requirement for competitive sourcing on paper. Each was a predetermined award dressed as an open contest.",
          "A competitive procedure is, by law, an open invitation: any qualified vendor may submit a bid. It is the opposite of a direct award, where no contest is called at all and the buyer simply names its supplier. The theory is clean. Competition pushes prices down, lifts quality, and reveals what the government is actually paying for. The whole thing depends on one condition — that more than one bidder shows up.",
          "The register cannot say how many showed up. CompraNet records who won, not who bid, so a procedure with one winner may have drawn one offer or ten. That is why RUBLI does not set this rate against the EU's single-bidder line, which counts bidders. What the register can show is how often a competitive procedure ended with a single winner.",
          "The register codes procedure type only from COMPRANET's 2010 files onward, and 2011 is the first year it covers in full — before that nearly every contract is filed as competitive, which is why this story begins in 2011 and the next chapter explains it. From 2011 to 2024 the annual rate ran between 45.89 and 65.65 percent of contracts in competitive procedures: fourteen consecutive years above 45 percent. 2011 was the first year above 60 percent; the peak came in 2014. In 2024, the most recent complete year, it was 47.8 percent, and the partial 2025 cut stands at 40.3. At that level, the absence of competition is not an anomaly. It is standard practice.",
        ],
        prose_es: [
          "Unas 362,000 veces entre 2011 y 2024, un contrato federal mexicano vino de un procedimiento tramitado como competitivo que terminó con exactamente un ganador. Cada uno cumplió en el papel con el requisito legal de contratación competitiva. Cada uno fue una adjudicación predeterminada disfrazada de concurso abierto.",
          "Un procedimiento competitivo es, por ley, una invitación abierta: cualquier proveedor calificado puede presentar oferta. Es lo contrario de una adjudicación directa, donde no se convoca concurso alguno y el comprador simplemente nombra a su proveedor. La teoría es impecable. La competencia baja precios, eleva la calidad y revela cuánto está pagando realmente el gobierno. Todo depende de una condición — que se presente más de un oferente.",
          "El registro no puede decir cuántos se presentaron. CompraNet registra quién ganó, no quién ofertó, así que un procedimiento con un solo ganador pudo atraer una oferta o diez. Por eso RUBLI no compara esta tasa con la línea de un solo oferente de la UE, que cuenta oferentes. Lo que el registro sí muestra es con qué frecuencia un procedimiento competitivo terminó con un solo ganador.",
          "El registro codifica el tipo de procedimiento sólo a partir de los archivos 2010 de CompraNet, y 2011 es el primer año que cubre completo — antes de eso casi todo contrato aparece como competitivo, y por eso esta historia empieza en 2011 y el siguiente capítulo lo explica. De 2011 a 2024 la tasa anual corrió entre 45.89 y 65.65 por ciento de los contratos de procedimientos competitivos: catorce años consecutivos por encima del 45 por ciento. 2011 fue el primer año por encima del 60 por ciento; el pico llegó en 2014. En 2024, el año completo más reciente, fue 47.8 por ciento, y el corte parcial de 2025 está en 40.3. A ese nivel, la ausencia de competencia no es una anomalía. Es la práctica estándar.",
        ],
        chartConfig: {
          type: 'live',
          live: 'sb-years',
          scrolly: true,
          title: 'Fourteen Years Above 45 Percent: Single-award Rate 2011-2024',
          title_es: 'Catorce años arriba del 45 por ciento: tasa con un solo adjudicado 2011-2024',
          chartId: 'sb-years',
        },
        pullquote: {
          quote:
            "Fourteen years. Every year above 45 percent. When \"competitive\" means a single winner, the word has lost its meaning.",
          quote_es:
            "Catorce años. Cada año por encima del 45 por ciento. Cuando \"competitivo\" significa que hubo un solo adjudicado, la palabra ha perdido su sentido.",
          stat: '65.65%',
          statLabel: "peak single-award rate (2014)",
          statLabel_es: "pico de tasa con un solo adjudicado (2014)",
          barValue: 0.6565,
          barLabel: 'share of contracts in competitive procedures with one winner',
          barLabel_es: 'proporción de los contratos de procedimientos competitivos con un solo adjudicado',
          vizTemplate: 'dot-ratio',
        },
        sources: [
          'RUBLI analysis of contracts table, is_single_bid flag over contracts in competitive procedures, 2011-2025. Live from /analysis/year-over-year; queried September 2026.',
        ],
      },
      {
        id: 'ch2',
        number: 2,
        title: "The Reform That Was a Denominator",
        title_es: "La reforma que era un denominador",
        subtitle: "The jump every account cites is the register learning to tell two things apart",
        subtitle_es: "El salto que todos citan es el registro aprendiendo a distinguir dos cosas",
        prose: [
          "The obvious reading of this series is that electronic bidding made single-award contracts worse. Between 2009 and 2011, as CompraNet became mandatory, the rate jumps from 37.4 percent to 62.7 and never comes back down. Digitization was sold as transparency; the number says it delivered the opposite. It is a clean story and the register does not support it.",
          "2011 is also the first year the data records, across the whole year, what kind of procedure a contract came from. For every year from 2002 to 2009, COMPRANET's oldest archive — the files RUBLI calls Structure A — reports direct awards at 0.00 percent, not because none happened, but because the field is not there. 2010 is a seam: most of its contracts still come from Structure A, and only one in nine is coded as a direct award. So the rate up to 2010 is single-award contracts divided by nearly every contract, while from 2011 it is single-award contracts divided by competitive ones only. In 2011 that bottom number is 34,857 of 122,378 contracts, under a third. Hold the top of a fraction still and cut the bottom by more than two thirds and the fraction rises on its own. That is what happened.",
          "Count it the other way and the direction reverses. As a share of all federal contracts, single-award contracts fall from 37.4 percent in 2009 to 17.9 percent in 2011 — the dashed line in the figure below. Both lines are arithmetic on the same rows. Neither is evidence about what CompraNet did to the market, because the thing that changed between 2009 and 2011 was the record, not the behaviour it records.",
          "What survives the correction is everything after. From 2011 the denominator is stable and the rate still holds between 45.89 and 65.65 percent for fourteen years, across four presidential administrations, indifferent to who is in office. The 2019 drop to 46.5 percent is mostly not arithmetic. Contracts in competitive procedures fell by 2,384 that year, from 45,234 to 42,850, while single-award ones fell by 6,513, from 26,442 to 19,929; even if every contract that disappeared had been a single-award one, at least 4,129 of the drop, 63 percent, is fewer lone winners in contests that were still held. The register records winners, not bidders, so it cannot say whether more firms showed up.",
        ],
        prose_es: [
          "La lectura obvia de esta serie es que la licitación electrónica empeoró la proporción con un solo adjudicado. Entre 2009 y 2011, mientras CompraNet se volvía obligatorio, la tasa salta de 37.4 por ciento a 62.7 y nunca vuelve a bajar. La digitalización se vendió como transparencia; el número dice que entregó lo contrario. Es una historia limpia y el registro no la sostiene.",
          "2011 es también el primer año en que el dato registra, en todo el año, de qué tipo de procedimiento vino un contrato. Para cada año de 2002 a 2009, la Estructura A de COMPRANET reporta adjudicación directa en 0.00 por ciento — no porque no hubiera, sino porque el campo no existe. 2010 es una costura: la mayoría de sus contratos aún viene de la Estructura A, y apenas uno de cada nueve está codificado como adjudicación directa. Así que la tasa hasta 2010 son contratos con un solo adjudicado divididos entre casi todos los contratos, y desde 2011 son contratos con un solo adjudicado divididos solo entre los de procedimientos competitivos. En 2011 ese denominador es de 34,857 de 122,378 contratos, menos de un tercio. Un cociente cuyo denominador se desploma más de dos tercios sube aunque nada más se mueva.",
          "Contado de la otra forma, la dirección se invierte. Como proporción de todos los contratos federales, la proporción con un solo adjudicado cae de 37.4 por ciento en 2009 a 17.9 en 2011 — la línea punteada de la figura. Ambas líneas son aritmética sobre las mismas filas. Ninguna es evidencia de lo que CompraNet le hizo al mercado, porque lo que cambió entre 2009 y 2011 fue el registro, no la conducta que registra.",
          "Lo que sobrevive a la corrección es todo lo que vino después. Desde 2011 el denominador es estable y la tasa se sostiene entre 45.89 y 65.65 por ciento durante catorce años, a través de cuatro administraciones presidenciales, indiferente a quién gobierne. La caída de 2019 al 46.5 por ciento no es, en su mayoría, aritmética. Los contratos de procedimientos competitivos bajaron en 2,384 ese año, de 45,234 a 42,850, mientras los con un solo adjudicado bajaron en 6,513, de 26,442 a 19,929; aun si cada contrato que desapareció hubiera sido con un solo adjudicado, al menos 4,129 de la caída, el 63 por ciento, son menos ganadores solitarios en concursos que sí se celebraron. El registro anota ganadores, no oferentes, así que no puede decir si se presentaron más empresas.",
        ],
        chartConfig: {
          type: 'live',
          live: 'sb-mirage',
          title: 'The Reform Mirage: the same single-award contracts under two denominators, 2002-2025',
          title_es: 'El espejismo de la reforma: los mismos contratos con un solo adjudicado bajo dos denominadores, 2002-2025',
          chartId: 'sb-mirage',
        },
        pullquote: {
          quote:
            "The rate did not jump in 2011 because the market changed. It jumped because the denominator did — and counted the other way, it falls.",
          quote_es:
            "La tasa no saltó en 2011 porque cambiara el mercado. Saltó porque cambió el denominador — y contada de la otra forma, baja.",
          stat: '2011',
          statLabel: "first full year the register codes procedure type",
          statLabel_es: "primer año completo en que el registro codifica el tipo de procedimiento",
        },
        sources: [
          'DOF. (2012). Reformas a la Ley de Adquisiciones para la obligatoriedad de CompraNet.',
          'RUBLI single_bid and direct_award series by year, live from /analysis/year-over-year. September 2026.',
          'COMPRANET Structure A (2002-2009) carries no procedure-type field; see /methodology, Data sources.',
        ],
      },
      {
        id: 'ch3',
        number: 3,
        title: "The Only Winner Who Keeps Winning",
        title_es: "El único adjudicado que sigue ganando",
        subtitle: "Five welfare-voucher operators won 6,236 contracts in \"competitive\" tenders as the lone winner",
        subtitle_es: "Cinco operadores de vales ganaron 6,236 contratos de licitaciones \"competitivas\" como único adjudicado",
        prose: [
          "Rank every federal vendor by single-award wins and the top of the list is one coherent cluster: welfare-program voucher operators. The two largest each won more than 1,200 contracts in \"competitive\" federal tenders as the only winner, at rates above 95 percent of their competitive contracts; a third won 2,267 across three registry identities.",
          "The mechanism is structural. Voucher operators run incompatible payment networks. Once a federal program adopts one, switching costs effectively bar competitors from the next tender. The procedure runs as competitive on paper while the incumbent is the only supplier who can make it work.",
          "Adjacent markets show the same shape with different mechanics: industrial gas (PRAXAIR and INFRA, both of which RUBLI excludes as structural false positives given genuinely limited hospital-gas suppliers), telecommunications (Teléfonos de México, 460 wins), postal logistics (Servicio Postal, Estafeta), and specific medical supply categories (Productos Hospitalarios, 511 wins). The figure below ranks them by wins and prints the rate beside each — the share of the competitions that vendor actually entered which it won as the only winner. On that measure almost nobody near the top is diversified. State-owned Liconsa looks moderate at 17 percent of its total contracting, but it is a direct-award house: strip the direct awards out and 998 of the 1,004 competitions it entered, 99.4 percent, came back with one bid.",
          "The scale is the point. The register holds 505,219 single-award contracts across twenty-four years, 16.6 percent of everything in it and 48.0 percent of every contract from a competitive procedure. None of them is evidence of fraud, and none is offered here as such. The finding is that this is the standard operating mode of Mexican federal procurement: the named vendors match the pattern, and the pattern is the system, not the exception inside it.",
        ],
        prose_es: [
          "Ordene a cada proveedor federal por victorias con un solo adjudicado y la parte alta de la lista es un solo bloque coherente: operadores de vales de programas sociales. Los dos mayores ganaron cada uno más de 1,200 contratos de licitaciones federales \"competitivas\" como único adjudicado, con tasas superiores al 95 por ciento de sus contratos competitivos; un tercero ganó 2,267 a través de tres identidades registrales.",
          "El mecanismo es estructural. Los operadores de vales manejan redes de pago incompatibles. Una vez que un programa federal adopta a uno, los costos de cambio excluyen efectivamente a los competidores de la siguiente licitación. El procedimiento corre como competitivo en el papel mientras el proveedor existente es el único que puede hacerlo funcionar.",
          "Mercados adyacentes muestran la misma forma con mecánica distinta: gas industrial (PRAXAIR e INFRA, a las dos RUBLI las excluye como falsos positivos estructurales dada la oferta genuinamente limitada de gas hospitalario), telecomunicaciones (Teléfonos de México, 460 victorias), logística postal (Servicio Postal, Estafeta) y categorías específicas de insumo médico (Productos Hospitalarios, 511 victorias). La figura de abajo los ordena por victorias e imprime la tasa junto a cada uno — la proporción de los concursos que ese proveedor efectivamente disputó y ganó como único adjudicado. Bajo esa medida casi nadie en la cima está diversificado. La paraestatal Liconsa parece moderada con 17 por ciento de toda su contratación, pero es una casa de adjudicación directa: quite las adjudicaciones directas y 998 de los 1,004 concursos que disputó, el 99.4 por ciento, terminaron con un solo adjudicado.",
          "La escala es el punto. El registro tiene 505,219 contratos con un solo adjudicado en veinticuatro años: 16.6 por ciento de todo lo que contiene y 48.0 por ciento de los contratos de procedimientos competitivos. Ninguno de ellos es evidencia de fraude, y aquí no se presenta como tal. El hallazgo es que este es el modo de operación estándar de la contratación federal mexicana: los proveedores nombrados coinciden con el patrón, y el patrón es el sistema, no la excepción dentro de él.",
        ],
        chartConfig: {
          type: 'live',
          live: 'sb-vendors',
          title: 'The Single-Award Winners: federal vendors ranked by contracts in competitive procedures won as the only winner',
          title_es: 'Los ganadores con un solo adjudicado: proveedores federales por contratos de procedimientos competitivos ganados como único adjudicado',
          chartId: 'sb-vendors',
        },
        pullquote: {
          quote:
            "Five firms. 6,236 contracts in \"competitive\" procedures won as the only winner — 94.2 percent of their competitive contracts. The welfare-voucher market is structurally non-competitive.",
          quote_es:
            "Cinco firmas. 6,236 contratos de procedimientos \"competitivos\" ganados como único adjudicado — 94.2 por ciento de sus contratos competitivos. El mercado de vales del bienestar es estructuralmente no competitivo.",
          stat: '94.2%',
          statLabel: "of the voucher cluster's contracts in competitive procedures, won as the only winner",
          statLabel_es: "de los contratos de procedimientos competitivos del bloque de vales, ganados como único adjudicado",
          barValue: 0.942,
          barLabel: '6,236 of 6,623 contracts in competitive procedures, across five firms',
          barLabel_es: '6,236 de 6,623 contratos de procedimientos competitivos, en cinco firmas',
          vizTemplate: 'mosaic-tile',
        },
        sources: [
          'RUBLI vendor ranking by single_bid_count over contracts in competitive procedures, live from /vendors. September 2026.',
          'OECD. (2009). Guidelines for Fighting Bid Rigging in Public Procurement.',
        ],
      },
      {
        id: 'ch4',
        number: 4,
        title: "Nine of Ten Road Tenders",
        title_es: "Nueve de cada diez licitaciones de obra",
        subtitle: "Civilian infrastructure runs single-award at 89.0% of the contracts in its competitive tenders",
        subtitle_es: "La infraestructura civil corre un solo adjudicado en el 89.0% de los contratos de sus licitaciones competitivas",
        prose: [
          "In civilian infrastructure, 196,649 of 220,969 contracts in competitive tenders came from a procedure with a single winner — 89.0 percent. Roads, water systems, drainage, and urban works are not specialized equipment with one supplier. They are markets with hundreds of qualified Mexican construction firms. At 89.0 percent, this is not market scarcity. It is market allocation.",
          "The national rate, 48.0 percent pooled across the register, hides that spread. Six of the twelve sectors sit above half. Below infrastructure come Medio Ambiente at 79.7 percent (40,828 of 51,240), Trabajo at 71.6 percent (8,335 of 11,648) and Hacienda at 69.8 percent (17,816 of 25,527, pulled up by the voucher cluster). Then Energía at 57.5 percent (79,886 of 139,004, where Pemex and CFE genuinely face thin supplier markets), Otros at 54.7 percent, Agricultura at 48.6 percent, Gobernación at 47.3 percent, Tecnología at 44.6 percent and Educación at 38.7 percent. At the floor, Defensa at 26.8 percent and Salud at 18.9 percent (74,316 of 392,923).",
          "Buyer concentration is the tell. Where procurement concentrates in a few large institutional buyers — IMSS, SEDENA — aggregated tenders force competition and the rate stays low. Where it fragments across many small units — state infrastructure, rural water systems, federal districts — each one runs on its own established vendor relationships and the rate climbs.",
          "Infrastructure at 89.0 percent is the most consequential finding, because the COVID-era stimulus, the AMLO national projects, and the post-Sheinbaum decentralized water and roads programs all flow through it. Across more than a decade of stimulus and megaprojects, the vast majority of \"competitively\" awarded contracts had no competition at all.",
        ],
        prose_es: [
          "En infraestructura civil, 196,649 de 220,969 contratos de licitaciones competitivas vinieron de un procedimiento con un solo adjudicado — 89.0 por ciento. Carreteras, sistemas de agua, drenaje y obra urbana no son equipo especializado con un solo proveedor. Son mercados con cientos de constructoras mexicanas calificadas. Al 89.0 por ciento, esto no es escasez de mercado. Es reparto de mercado.",
          "La tasa nacional, 48.0 por ciento agregada sobre el registro, oculta esa dispersión. Seis de los doce sectores están arriba de la mitad. Debajo de infraestructura vienen Medio Ambiente con 79.7 por ciento (40,828 de 51,240), Trabajo con 71.6 por ciento (8,335 de 11,648) y Hacienda con 69.8 por ciento (17,816 de 25,527, jalada hacia arriba por el cluster de vales). Luego Energía con 57.5 por ciento (79,886 de 139,004, donde Pemex y CFE enfrentan mercados de suministradores genuinamente delgados), Otros con 54.7 por ciento, Agricultura con 48.6 por ciento, Gobernación con 47.3 por ciento, Tecnología con 44.6 por ciento y Educación con 38.7 por ciento. En el piso, Defensa con 26.8 por ciento y Salud con 18.9 por ciento (74,316 de 392,923).",
          "La concentración de compradores es la señal. Donde la contratación se concentra en unos pocos grandes compradores institucionales — IMSS, SEDENA — las licitaciones agregadas fuerzan la competencia y la tasa se mantiene baja. Donde se fragmenta entre muchas unidades pequeñas — infraestructura estatal, sistemas de agua rurales, distritos federales — cada una opera con sus propias relaciones de proveedor establecidas y la tasa trepa.",
          "La infraestructura al 89.0 por ciento es el hallazgo más consecuente, porque el estímulo de la era COVID, los proyectos nacionales de AMLO y los programas descentralizados de agua y carreteras pos-Sheinbaum fluyen todos por ahí. A lo largo de más de una década de estímulo y grandes proyectos, la gran mayoría de los contratos adjudicados \"competitivamente\" no tuvieron competencia alguna.",
        ],
        chartConfig: {
          type: 'live',
          live: 'sb-sectors',
          title: 'Where the Illusion Is Staged: Single-award Rate by Sector',
          title_es: 'Dónde se monta la ilusión: tasa con un solo adjudicado por sector',
          chartId: 'sb-sectors',
        },
        pullquote: {
          quote:
            "Civilian infrastructure runs at 89 percent single award. Out of every ten contracts in \"competitive\" tenders for roads, water, drainage, and urban works, nine come from a procedure with only one winner.",
          quote_es:
            "La infraestructura civil opera al 89 por ciento con un solo adjudicado. De cada diez contratos de licitaciones \"competitivas\" para carreteras, agua, drenaje y obra urbana, nueve vienen de un procedimiento con un solo adjudicado.",
          stat: '6/12',
          statLabel: "sectors above 50% single award, of contracts in competitive procedures",
          statLabel_es:
            "sectores arriba del 50% de un solo adjudicado, sobre los contratos de procedimientos competitivos",
        },
        sources: [
          'RUBLI sector aggregation: single_bid_count over (total_contracts - direct_award_count), live from /sectors. September 2026.',
        ],
      },
      {
        id: 'ch5',
        number: 5,
        title: "The Trick Nobody Can Stop",
        title_es: "El truco que nadie puede detener",
        subtitle: "Every step is legal, which is exactly why no institution can touch it",
        subtitle_es: "Cada paso es legal, y por eso justamente ninguna institución puede tocarlo",
        prose: [
          "Nobody breaks a rule when a competitive procedure ends with one winner. The official ran the tender. The vendor filed a bid. The award followed procedure. Every individual action is defensible. Whatever is wrong lives in the pattern across 362,000 contracts, not in any single transaction — and that is exactly what makes it unstoppable.",
          "It also falls outside what each accountability institution is built to see. The ASF audits individual contracts; it produces no systemic findings on aggregated bidding patterns. The SFP investigates individual officials, not industry-wide cartels. COFECE pursues anticompetitive conduct but limits its procurement cases to clear-cut cartel documentation, not behavioral pattern evidence. The structural failure RUBLI's data shows has no institution assigned to it.",
          "The single-award rate is not a secret. Transparencia Mexicana and IMCO have reported it for years. What is missing is follow-through: naming the vendor clusters in the P5 cover-bidding pattern, pulling their financial records, prosecuting documented co-bidding, and imposing consequences on officials who accept single-award outcomes as normal. That requires either a new institutional capacity for structural procurement patterns or the redirection of COFECE and SFP resources toward the analysis RUBLI already performs. Neither has happened.",
          "Until consequences exist, reform means procedural tweaks, not structural change. The rate will keep sitting above 45 percent of contracts in competitive procedures, year after year — the same trick, performed for an audience that already knows how it is done.",
        ],
        prose_es: [
          "Nadie rompe una regla cuando un procedimiento competitivo termina con un solo ganador. El funcionario corrió la licitación. El proveedor presentó una oferta. La adjudicación se hizo conforme al procedimiento. Cada acción individual es defendible. Lo que esté mal vive en el patrón a lo largo de 362,000 contratos, no en una sola transacción — y eso es justo lo que la vuelve imparable.",
          "También queda fuera de lo que cada institución de fiscalización está hecha para ver. La ASF audita contratos individuales; no produce hallazgos sistémicos sobre patrones agregados de licitación. La SFP investiga a funcionarios individuales, no cárteles que abarcan un sector completo. La COFECE persigue conducta anticompetitiva pero limita sus casos de contratación a documentación clara de cártel, no a evidencia conductual por patrón. La falla estructural que muestran los datos de RUBLI no tiene institución asignada.",
          "La tasa con un solo adjudicado no es un secreto. Transparencia Mexicana e IMCO la han reportado durante años. Lo que falta es seguimiento: nombrar los clusters de proveedores en el patrón P5 de oferta de cobertura, solicitar sus registros financieros, procesar la co-licitación documentada e imponer consecuencias a los funcionarios que aceptan los resultados con un solo adjudicado como normales. Eso requiere o una nueva capacidad institucional para patrones estructurales de contratación, o la redirección de recursos de la COFECE y la SFP hacia el análisis que RUBLI ya realiza. Ninguna ha ocurrido.",
          "Hasta que existan consecuencias, la reforma significa ajustes procedimentales, no cambio estructural. La tasa seguirá por encima del 45 por ciento de los contratos de procedimientos competitivos, año tras año — el mismo truco, representado para un público que ya sabe cómo se hace.",
        ],
        chartConfig: {
          type: 'live',
          live: 'sb-count',
          title: 'What Fourteen Years Above 45 Percent Adds Up To',
          title_es: 'A cuánto suman catorce años arriba del 45 por ciento',
          chartId: 'sb-count',
        },
        pullquote: {
          quote:
            "Nobody is individually breaking the rules. The corruption lies in the pattern across 362,000 contracts, not in any single transaction.",
          quote_es:
            "Nadie rompe individualmente las reglas. La corrupción reside en el patrón a lo largo de 362,000 contratos, no en una sola transacción.",
          stat: '362,000',
          statLabel: "single-award contracts in competitive procedures 2011-2024",
          statLabel_es: "contratos de procedimientos competitivos con un solo adjudicado 2011-2024",
        },
        sources: [
          'IMCO. (2024). Índice de Riesgos de Corrupción en Compras Públicas.',
          'RUBLI aggregate single_bid analysis over contracts in competitive procedures, 2011-2024, live from /analysis/year-over-year.',
        ],
      },
    ],
  },

  // === STORY 5: The Building That Capture Built ===
  {
    slug: 'captura-institucional',
    outlet: 'investigative',
    type: 'thematic',
    era: 'cross',
    headline: "The Suppliers Who Cannot Leave",
    headline_es: "Los proveedores que no pueden irse",
    subheadline:
      "RUBLI's queue flags 8,586 companies that send four fifths or more of everything they sell to a single government buyer. The average is ninety-five percent. At IMSS, Mexico's social-security institute, 2,068 of them are anchored to one address, holding 313.4 billion pesos of lifetime federal contracts between them — and no single supplier comes close to dominating the institute in return. The dependence runs one way. Beneath it, 2,537 intermediaries that win contracts and subcontract the work carry another 448.8 billion. None of it is illegal. That is the problem.",
    subheadline_es:
      "La fila de RUBLI marca a 8,586 empresas que le venden cuatro quintas partes o más de todo lo suyo a un solo comprador de gobierno. El promedio es noventa y cinco por ciento. En el IMSS hay 2,068 ancladas a una sola dirección, con 313.4 mil millones de pesos en contratos federales de por vida entre todas — y ningún proveedor se acerca a dominar al instituto a cambio. La dependencia corre en un solo sentido. Debajo, 2,537 intermediarios que ganan contratos y subcontratan el trabajo cargan otros 448.8 mil millones. Nada de esto es ilegal. Ese es el problema.",
    byline: 'RUBLI Investigative Data Unit',
    estimatedMinutes: 15,
    status: 'auditado',
    leadStat: {
      value: '8,586',
      label: "vendors that route most of their work to one buyer",
      label_es: "proveedores que canalizan casi todo su trabajo a un solo comprador",
      sublabel: "448.8B MXN in P3 intermediary contracting beneath them",
      sublabel_es: "448,800 millones de pesos en contratación de intermediarios P3 por debajo",
      color: '#8b5cf6',
    },
    kickerStats: [
      {
        value: '95%',
        suffix: "the average share of a flagged vendor's work that goes to one buyer",
        suffix_es: "la porción promedio del trabajo de un proveedor marcado que va a un solo comprador",
        tone: 'data',
      },
      {
        value: '863B MXN',
        suffix: "MXN held by the vendors anchored at the top seven buyers",
        suffix_es: "MXN en manos de los proveedores anclados en los siete compradores principales",
        tone: 'critical',
      },
      {
        value: '10,546',
        suffix: "P3 + P6 vendors no reviewer has opened",
        suffix_es: "proveedores P3 + P6 que ningún revisor ha abierto",
        tone: 'critical',
      },
    ],
    corrections: [
      "2026-09-19 — An earlier edition printed an implied overhead of 83 to 167 billion pesos, modelled at a 15 to 30 percent intermediation margin. The public record stops at the federal payment to the intermediary, so the margin cannot be measured and the range is withdrawn.",
      "2026-09-19 — An earlier edition said the pattern's structural successors run \"seventy-three times\" La Estafa Maestra. That divides a 23-year stock by a two-year flow; the multiple is withdrawn.",
      "2026-10-14 — RUBLI retrained its risk model (v0.8.5 to v0.9.1) and re-ran ARIA on 13 October 2026, and every queue figure in this story is restated on that run, as RUBLI's public queue shows it (private individuals, public entities and vendors cleared on review are left out). The dependence pattern (P6) now lists 8,586 vendors, not 15,939, averaging 95 percent of their contracting at one buyer; IMSS anchors 2,068 of them with 313.4 billion pesos, not 3,468 with 405.3 billion; the top seven buyers hold 863 billion, not 1.08 trillion, and SEDENA replaces CONAGUA in seventh place. The intermediary pattern (P3) flags 2,537 vendors with 448.8 billion pesos, not 2,972 with 556.5 billion. Of the 11,123 P3 and P6 vendors, 10,546 have not been opened, not 18,242. The two Estafa Maestra vendors in the register score 0.67 and 0.25, not 0.55 to 0.65.",
    ],
    corrections_es: [
      "2026-09-19 — Una edición anterior imprimía un sobrecosto implícito de 83 a 167 mil millones de pesos, modelado con un margen de intermediación de 15 a 30 por ciento. El registro público se detiene en el pago federal al intermediario, así que el margen no puede medirse y el rango queda retirado.",
      "2026-09-19 — Una edición anterior decía que los sucesores estructurales del patrón corren «setenta y tres veces» La Estafa Maestra. Eso divide un acumulado de 23 años entre un flujo de dos años; el múltiplo queda retirado.",
      "2026-10-14 — RUBLI reentrenó su modelo de riesgo (de v0.8.5 a v0.9.1) y volvió a correr ARIA el 13 de octubre de 2026, y cada cifra de la fila en esta historia se reexpresa con esa corrida, tal como la muestra la fila pública de RUBLI (que deja fuera a personas físicas, entidades públicas y proveedores descartados en revisión). El patrón de dependencia (P6) lista ahora a 8,586 proveedores, no 15,939, con un promedio de 95 por ciento de su contratación en un solo comprador; el IMSS ancla a 2,068 con 313,400 millones de pesos, no a 3,468 con 405,300 millones; los siete compradores principales concentran 863,000 millones, no 1.08 billones, y la SEDENA sustituye a la CONAGUA en el séptimo lugar. El patrón de intermediario (P3) marca a 2,537 proveedores con 448,800 millones de pesos, no a 2,972 con 556,500 millones. De los 11,123 proveedores P3 y P6, 10,546 no se han abierto, no 18,242. Los dos proveedores de La Estafa Maestra en el registro califican 0.67 y 0.25, no de 0.55 a 0.65.",
    ],
    chapters: [
      {
        id: 'ch1',
        number: 1,
        title: "The Worst Address",
        title_es: "La peor dirección",
        subtitle: "2,068 companies send most of what they sell to one institute",
        subtitle_es: "2,068 empresas le venden casi todo lo suyo a un solo instituto",
        chartConfig: {
          type: 'live',
          live: 'capture-imss',
          scrolly: true,
          title: 'Who depends on IMSS, and by how much',
          title_es: 'Quién depende del IMSS, y cuánto',
          chartId: 'capture-imss',
        },
        prose: [
          "More companies are tied to the Instituto Mexicano del Seguro Social than to any other buyer in the federal register. RUBLI's queue flags 2,068 of them, and between them they hold 313.4 billion pesos of federal contracts over the life of the record. No other address in the country gathers as many.",
          "Read that sentence carefully, because the obvious reading is the wrong one. The 313.4 billion is not a bite taken out of the institute's budget. It is the combined lifetime contracting of the suppliers anchored there — money they earned across the whole federal government, almost all of it from this one buyer. The pattern is a property of the seller, not of the purchaser.",
          "RUBLI's Pattern 6 measures exactly that: what share of a vendor's own contracting goes to a single institution. Across the 8,586 companies it flags, that share never drops below eighty percent and averages ninety-five. These are firms with one customer. Lose the account and there is no business left to lose it from.",
          "That dependence is not a crime, and often not even a surprise — a company built to supply one hospital system has nowhere else to sell. But it is the condition under which a buyer stops being a customer and starts being a patron. The supplier cannot walk away from a bad price, cannot refuse a rushed delivery, cannot report the official who signs the contract. Officials award to the \"reliable\" supplier; nothing pressures the price down; over years the arrangement hardens into something indistinguishable from policy.",
          "Turn the measurement around and IMSS looks ordinary. Of the federal buyers with enough recorded spend to measure, IMSS is not among those where one supplier has climbed to half the institution's business. Nobody owns IMSS. Thousands of companies simply cannot survive without it.",
          "The auditors have already stood at this door. The Auditoría Superior de la Federación's 2022 Cuenta Pública review found IMSS pharmaceutical procurement showed \"patterns of concentration inconsistent with market competition\" in 15 specific categories. RUBLI quantifies at scale what the inspector flagged by hand.",
        ],
        prose_es: [
          "Hay más empresas amarradas al Instituto Mexicano del Seguro Social que a cualquier otro comprador del registro federal. La fila de RUBLI marca a 2,068 de ellas, y entre todas acumulan 313.4 mil millones de pesos en contratos federales a lo largo del registro. Ninguna otra dirección del país junta tantas.",
          "Conviene leer bien esa frase, porque la lectura obvia es la equivocada. Los 313,400 millones no son un tajo al presupuesto del instituto. Son la contratación acumulada de los proveedores anclados ahí — dinero que ganaron en todo el gobierno federal, casi todo de este único comprador. El patrón es una propiedad del que vende, no del que compra.",
          "El Patrón 6 de RUBLI mide precisamente eso: qué porción de la contratación propia de un proveedor va a una sola institución. En las 8,586 empresas que marca, esa porción nunca baja del ochenta por ciento y promedia noventa y cinco. Son empresas de un solo cliente. Si pierden la cuenta, no les queda negocio del cual perderla.",
          "Esa dependencia no es un delito, y muchas veces ni siquiera una sorpresa — una empresa hecha para surtir a un sistema hospitalario no tiene a quién más venderle. Pero es la condición bajo la cual un comprador deja de ser cliente y se vuelve patrón. El proveedor no puede irse ante un mal precio, no puede negarse a una entrega apresurada, no puede denunciar al funcionario que firma el contrato. Los funcionarios adjudican al proveedor \"confiable\"; nada presiona el precio a la baja; con los años el arreglo se endurece hasta volverse indistinguible de una política.",
          "Voltee la medición y el IMSS se ve común y corriente. Entre los compradores federales con gasto registrado suficiente para medirlos, el IMSS no está entre aquellos donde un solo proveedor escaló hasta la mitad del negocio de la institución. Nadie es dueño del IMSS. Miles de empresas simplemente no sobreviven sin él.",
          "Los auditores ya estuvieron en esta puerta. La revisión de la Cuenta Pública 2022 de la Auditoría Superior de la Federación encontró que la contratación farmacéutica del IMSS mostraba \"patrones de concentración inconsistentes con la competencia de mercado\" en 15 categorías específicas. RUBLI cuantifica a escala lo que el auditor marcó a mano.",
        ],
        pullquote: {
          quote:
            "These are firms with one customer. Lose the account and there is no business left to lose it from. Across the 8,586 companies the pattern flags, the share never drops below eighty percent.",
          quote_es:
            "Son empresas de un solo cliente. Si pierden la cuenta, no les queda negocio del cual perderla. En las 8,586 empresas que marca el patrón, la porción nunca baja del ochenta por ciento.",
          stat: '95%',
          statLabel: "the average share of a flagged vendor's work that goes to one buyer",
          statLabel_es: "la porción promedio del trabajo de un proveedor marcado que va a un solo comprador",
        },
        sources: [
          'RUBLI ARIA P6 and P3 pattern analysis, run 0fe1409e, 13 October 2026 — /aria/queue?pattern=P6 (top_institution_ratio: min 0.80, mean 0.95) and /aria/patterns/P6/institutions.',
          'IMSS. (2024). Informe al Ejecutivo Federal y al Congreso de la Unión.',
        ],
      },
      {
        id: 'ch2',
        number: 2,
        title: "863 Billion Pesos",
        title_es: "863,000 millones de pesos",
        subtitle: "Seven buyers hold most of the dependent suppliers in the country",
        subtitle_es: "Siete compradores concentran a casi todos los proveedores dependientes del país",
        prose: [
          "IMSS is the largest of seven addresses, not the only one. The vendors anchored at those seven hold 863 billion pesos of lifetime federal contracting between them — more than four fifths of what the whole flagged cohort holds. IMSS leads at 313.4 billion across 2,068 vendors. CFE follows with 219.3 billion across 1,899. PEMEX carries 132.6 billion through just 275 companies — by far the largest average ticket in the set. Then SCT (72.5 billion, 358 vendors), DICONSA (52.4 billion, 391), ISSSTE (47.5 billion, 523), and SEDENA (25.3 billion, 248).",
          "The seven average 123.3 billion. IMSS runs 2.5 times that. Health — IMSS plus ISSSTE — accounts for 360.9 billion pesos; energy — CFE plus PEMEX — for 351.9 billion. Between them, two sectors hold more than four fifths of the total.",
          "Dependence is rarely there at the start, which is why audits keep missing it. A flagged vendor typically begins as a legitimate competitive winner with a spread of customers. Year one looks normal. By year three the other customers have thinned out. By year five the company is selling almost nothing to anyone else, and the buyer it is left with knows it.",
          "Every contract in that arc is individually defensible — the vendor has a track record, the official can cite past performance, the cost of running a fresh competitive process is real. The distortion lives nowhere in a single award. It lives in the shape of a supplier base where thousands of firms have exactly one place to sell.",
        ],
        prose_es: [
          "El IMSS es la mayor de siete direcciones, no la única. Los proveedores anclados en esas siete acumulan entre todos 863,000 millones de pesos de contratación federal acumulada — más de cuatro quintas partes de lo que acumula toda la cohorte marcada. El IMSS encabeza con 313,400 millones en 2,068 proveedores. La CFE sigue con 219,300 millones en 1,899. PEMEX carga 132,600 millones con apenas 275 empresas — con mucho, el monto promedio más alto del grupo. Luego la SCT (72,500 millones, 358 proveedores), DICONSA (52,400 millones, 391), el ISSSTE (47,500 millones, 523) y la SEDENA (25,300 millones, 248).",
          "Las siete promedian 123.3 mil millones. El IMSS corre 2.5 veces eso. Salud — IMSS más ISSSTE — suma 360.9 mil millones de pesos; energía — CFE más PEMEX — suma 351.9 mil millones. Entre los dos sectores tienen más de cuatro quintas partes del total.",
          "La dependencia rara vez está ahí desde el inicio, y por eso las auditorías la siguen pasando por alto. Un proveedor marcado suele empezar como ganador competitivo legítimo, con varios clientes. El primer año se ve normal. Para el tercero los demás clientes ya se redujeron. Para el quinto la empresa ya casi no le vende a nadie más, y el comprador que le queda lo sabe.",
          "Cada contrato de ese arco es defendible por separado — el proveedor tiene historial, el funcionario invoca el desempeño pasado, el costo de correr un nuevo proceso competitivo es real. La distorsión no vive en ninguna adjudicación individual. Vive en la forma de un padrón donde miles de empresas tienen exactamente un lugar donde vender.",
        ],
        chartConfig: {
          type: 'live',
          live: 'capture-institutions',
          title: 'Where the flagged vendors are anchored',
          title_es: 'Dónde están anclados los proveedores marcados',
          chartId: 'capture-institutions',
        },
        pullquote: {
          quote:
            "Every contract in that arc is individually defensible. The distortion lives in the shape of a supplier base where thousands of firms have exactly one place to sell.",
          quote_es:
            "Cada contrato de ese arco es defendible por separado. La distorsión vive en la forma de un padrón donde miles de empresas tienen exactamente un lugar donde vender.",
          stat: '863B MXN',
          statLabel: "held by the vendors anchored at the top seven federal buyers",
          statLabel_es:
            "en manos de los proveedores anclados en los siete compradores federales principales",
        },
        sources: [
          'RUBLI ARIA queue, P6-classified vendors grouped by top_institution — /api/v1/aria/patterns/P6/institutions.',
        ],
      },
      {
        id: 'ch3',
        number: 3,
        title: "The Toll Booths",
        title_es: "Las casetas de cobro",
        subtitle: "Infrastructure runs 12.1% of its flagged spend through intermediaries",
        subtitle_es: "Infraestructura corre 12.1% de su gasto marcado por intermediarios",
        prose: [
          "Beneath the dependent suppliers sits a second pattern, and it has a sharper edge. RUBLI's Pattern 3 flags intermediaries — vendors that win a contract and subcontract the actual work, taking a fee at each tier. The model identifies 2,537 of them, holding 448.8 billion pesos, concentrated in infrastructure (172.4 billion, 969 vendors), energy (85.9 billion, 366 vendors), and health (76.9 billion, 429 vendors).",
          "These are the sectors with the largest contracts, the thinnest oversight, and the most technical cover. Real specialized complexity hides fraudulent layering. In infrastructure the intermediary subcontracts civil works to actual builders and keeps 15 to 30 percent overhead — a highway uses dozens of trades, so the markup reads as routine. In energy it marks up imported equipment across the chain; in health it collects margins distributing medicine from a handful of real manufacturers. Hacienda (40.9 billion), education (19.1 billion), agriculture (18.8 billion), gobernación (17.8 billion), and defense (15.9 billion) fill out the rest.",
          "Raw value understates the damage, but it also flatters the wrong sector. Health has the largest flagged footprint of any sector by far, so its 104.3 billion of intermediary contracting is a small slice of it: 4.1 percent. Infrastructure's 179.5 billion is 12.1 percent of everything RUBLI flags in that sector — nearly three times health's share, and the highest of any sector with a base large enough to measure. The figure sorts on that ratio, so the most distorted sector reads at the top.",
          "One note on the denominator: each share is measured against every vendor ARIA flags in that sector under any pattern, not against the sector's total spend, and the four smallest sectors are drawn in grey because one company moves their percentage by whole points.",
        ],
        prose_es: [
          "Debajo de los proveedores dependientes hay un segundo patrón, y tiene un filo más afilado. El Patrón 3 de RUBLI marca a los intermediarios — proveedores que ganan un contrato y subcontratan el trabajo real, cobrando una comisión en cada nivel. El modelo identifica 2,537, con 448.8 mil millones de pesos, concentrados en infraestructura (172.4 mil millones, 969 proveedores), energía (85.9 mil millones, 366 proveedores) y salud (76.9 mil millones, 429 proveedores).",
          "Son los sectores con los contratos más grandes, la fiscalización más débil y el mayor blindaje técnico. La complejidad especializada real esconde la estratificación fraudulenta. En infraestructura el intermediario subcontrata la obra civil a constructoras reales y se queda con 15 a 30 por ciento de sobrecosto — una carretera usa decenas de oficios, así que el margen parece rutina. En energía aplica un sobreprecio al equipo importado a lo largo de la cadena; en salud cobra márgenes distribuyendo medicamentos de un puñado de fabricantes reales. Hacienda (40,900 millones), educación (19,100 millones), agricultura (18,800 millones), gobernación (17,800 millones) y defensa (15,900 millones) completan el resto.",
          "El valor bruto subestima el daño, pero también favorece al sector equivocado. Salud tiene con mucho la huella marcada más grande de todos los sectores, así que sus 104,300 millones de intermediación son una tajada chica de ella: 4.1 por ciento. Los 179,500 millones de infraestructura son 12.1 por ciento de todo lo que RUBLI marca en ese sector — casi el triple de la porción de salud, y la más alta de cualquier sector con base suficiente para medirse. La figura se ordena por esa proporción, de modo que el sector más distorsionado se lee arriba.",
          "Una nota sobre el denominador: cada porción se mide contra todos los proveedores que ARIA marca en ese sector bajo cualquier patrón, no contra el gasto total del sector, y los cuatro sectores más chicos van en gris porque una sola empresa mueve su porcentaje puntos enteros.",
        ],
        chartConfig: {
          type: 'live',
          live: 'capture-intermediaries',
          title: 'Where intermediaries take the biggest cut of flagged spend',
          title_es: 'Dónde los intermediarios se llevan la mayor tajada de lo marcado',
          chartId: 'capture-intermediaries',
        },
        pullquote: {
          quote:
            "Infrastructure alone moves 172 billion pesos through intermediary structures. What that middle position costs is the one thing the public record does not publish.",
          quote_es:
            "Solo infraestructura mueve 172 mil millones de pesos por estructuras de intermediación. Lo que cuesta esa posición intermedia es justo lo que el registro público no publica.",
          stat: '172.4B MXN',
          statLabel: "P3 intermediary contracts in infraestructura",
          statLabel_es: "contratos intermediarios P3 en infraestructura",
        },
        sources: [
          'RUBLI ARIA queue, P3-classified vendors grouped by primary sector — /api/v1/aria/patterns/P3/institutions?group=sector.',
          'OECD (2023). Public procurement performance: A framework for measuring efficiency, compliance and strategic goals. OECD Public Governance Policy Papers No. 36.',
        ],
      },
      {
        id: 'ch4',
        number: 4,
        title: "Mexico Tried This Case and Lost",
        title_es: "México llevó este caso a juicio y lo perdió",
        subtitle: "La Estafa Maestra was the blueprint. Nobody was convicted. The successors are still contracting.",
        subtitle_es: "La Estafa Maestra fue el plano. Nadie fue condenado. Los sucesores siguen contratando.",
        prose: [
          "La Estafa Maestra moved 7.67 billion pesos through an intermediary structure in two years, and it ended in an acquittal. Between 2013 and 2014, eleven federal agencies contracted public universities, which subcontracted 186 fictitious companies, which returned money to officials at the originating agencies. Animal Político and MCCI documented the scheme in 2017. The minister at the centre of it was arrested in 2019 and acquitted by the Supreme Court in 2024. Not one conviction came out of it.",
          "The exploit was structural. Procurement law carried a carve-out exempting contracts with public universities from competitive bidding, on the fiction that universities are trusted public institutions. The universities became the intermediary layer between the law and a shadow market. Below them sat phantom companies whose RFCs matched nothing in the Registro Federal de Contribuyentes — paper entities built to receive money and pass it on. Only the top half of that chain is visible in the public record: agency-to-university contracts appear in COMPRANET; the university-to-shell subcontracts do not.",
          "RUBLI's ground truth includes La Estafa Maestra; its two linked vendors in the register score 0.67 and 0.25 — elevated at most, nowhere near the ceiling, because the thin contract counts of phantom firms limit what the behavioral model can see. The mechanism, though, is unmistakable. The 2,537 P3 vendors in today's queue share its shape: different entities, different institutions, the same paid pass-through between budget and delivery. 140 of them already appear in RUBLI's case set in their own right.",
          "And the design may carry a price, though this register cannot put a number on it. The public record stops at the first contract: the federal payment to the intermediary is published, the intermediary's payment to whoever did the work is not. Any overhead figure applied to RUBLI's 448.8 billion pesos of P3 contracting would be an assumption multiplied by a total, not a measurement. La Estafa Maestra ran 7.67 billion pesos over two years and the state could not make a case stick. The pattern it belonged to is still running, and the queue that matches its shape holds 10,546 companies no reviewer has opened.",
        ],
        prose_es: [
          "La Estafa Maestra movió 7.67 mil millones de pesos por una estructura de intermediación en dos años, y terminó en absolución. Entre 2013 y 2014, once dependencias federales contrataron con universidades públicas, que subcontrataban 186 empresas ficticias, que devolvían el dinero a funcionarios de las dependencias originales. Animal Político y MCCI documentaron el esquema en 2017. La secretaria en el centro del caso fue detenida en 2019 y absuelta por la Suprema Corte en 2024. No salió de ahí una sola condena.",
          "El resquicio era estructural. La ley de adquisiciones tenía una excepción que eximía de licitación competitiva los contratos con universidades públicas, bajo la ficción de que las universidades son instituciones públicas confiables. Las universidades se volvieron la capa intermediaria entre la ley y un mercado en la sombra. Debajo estaban las empresas fantasma cuyos RFC no coincidían con nada en el Registro Federal de Contribuyentes — entidades de papel hechas para recibir dinero y pasarlo. Solo la mitad de arriba de esa cadena es visible en el registro público: los contratos dependencia-universidad aparecen en COMPRANET; los subcontratos universidad-empresa fantasma no.",
          "La verdad-base de RUBLI incluye La Estafa Maestra; sus dos proveedores vinculados en el registro califican 0.67 y 0.25 — elevados a lo sumo, lejos del techo, porque las cuentas raquíticas de contratos de las empresas fantasma limitan lo que el modelo conductual alcanza a ver. El mecanismo, sin embargo, es inconfundible. Los 2,537 proveedores P3 de la fila de hoy comparten su forma: distintas entidades, distintas instituciones, el mismo paso pagado entre el presupuesto y la entrega. 140 de ellos ya aparecen por cuenta propia en la base de casos de RUBLI.",
          "Y el diseño puede tener un precio, aunque este registro no puede ponerle cifra. El registro público se detiene en el primer contrato: el pago federal al intermediario se publica; el pago del intermediario a quien hizo el trabajo, no. Cualquier cifra de sobrecosto aplicada a los 448.8 mil millones de pesos de contratación P3 de RUBLI sería un supuesto multiplicado por un total, no una medición. La Estafa Maestra corrió 7,670 MDP en dos años y el Estado no pudo sostener el caso. El patrón al que pertenecía sigue corriendo, y la fila que repite su forma guarda 10,546 empresas que ningún revisor ha abierto.",
        ],
        chartConfig: {
          type: 'live',
          live: 'capture-estafa',
          title: 'The case Mexico documented, and the population that matches its shape',
          title_es: 'El caso que México documentó, y la población que repite su forma',
          chartId: 'capture-estafa',
        },
        pullquote: {
          quote:
            "La Estafa Maestra moved 7.67 billion pesos in two years and the state could not make a case stick. The queue that matches its shape holds 10,546 companies no reviewer has opened.",
          quote_es:
            "La Estafa Maestra movió 7,670 MDP en dos años y el Estado no pudo sostener el caso. La fila que repite su forma guarda 10,546 empresas que ningún revisor ha abierto.",
          stat: '448.8B MXN',
          statLabel: "P3 intermediary contracting the register can measure — the spread on it, it cannot",
          statLabel_es: "contratación intermediaria P3 que el registro sí puede medir — la diferencia sobre ella, no",
        },
        sources: [
          'Animal Político / MCCI. (2017). La Estafa Maestra: Graduados en desaparecer dinero público.',
          'OECD (2023). Public procurement performance: A framework for measuring efficiency, compliance and strategic goals. OECD Public Governance Policy Papers No. 36.',
        ],
      },
      {
        id: 'ch5',
        number: 5,
        title: "The Keys Hang Unused",
        title_es: "Las llaves cuelgan sin usar",
        subtitle: "11,123 flagged vendors, and 10,546 nobody has opened",
        subtitle_es: "11,123 proveedores marcados, y 10,546 que nadie ha abierto",
        chartConfig: {
          type: 'live',
          live: 'capture-queue',
          title: 'What the queue holds, and what anyone has opened',
          title_es: 'Lo que guarda la fila, y lo que alguien ha abierto',
          chartId: 'capture-queue',
        },
        prose: [
          "Both patterns resist prosecution for one reason: each rests on legal procurement actions whose aggregate effect is harmful. Subcontracting is legal. Selling to one customer is legal. Direct adjudication of specialized procurement is legal. A prosecutor cannot easily build a case against a single contract, and Mexican procurement law offers no vehicle to charge a pattern.",
          "The keys exist, and almost none of them have been turned. The 8,586 P6 and 2,537 P3 vendors — 11,123 in all — are a ready starting point. 351 already appear in RUBLI's case set. 577 have been given any review disposition at all, and 12 of those were confirmed. That leaves 10,546 companies that no reviewer has opened, and 16 of them sit in the two tiers the queue itself marks as priority.",
          "There is no shortage of institutions that could open them. The public-administration ministry, SFP, can audit procurement-unit performance and, in theory, sanction officials whose award patterns indicate favoritism; in practice its sanctions docket focuses on documented individual misconduct. The financial-intelligence unit, UIF, could subpoena bank records on the top-value P3 intermediaries to test whether the spread between government payment and subcontract payment is systematic. The competition regulator, COFECE, could investigate the dependency relationships as relative monopolistic practices. And the federal audit office, ASF, could audit the procurement units with the most dependent suppliers.",
          "None of this is happening systematically. The accountability gap is not legal — Mexico has the statutes, the oversight bodies, and, with RUBLI, the analytical capacity. What is missing is the decision to open rooms that have stayed locked for two decades.",
        ],
        prose_es: [
          "Ambos patrones resisten el proceso penal por una razón: cada uno se apoya en acciones legales de contratación cuyo efecto agregado es dañino. Subcontratar es legal. Venderle a un solo cliente es legal. La adjudicación directa de contratación especializada es legal. Un fiscal no puede construir fácilmente un caso contra un contrato individual, y la ley mexicana de adquisiciones no ofrece vehículo para imputar un patrón.",
          "Las llaves existen, y casi ninguna se ha girado. Los 8,586 proveedores P6 y 2,537 proveedores P3 — 11,123 en total — son un punto de partida listo. 351 ya aparecen en la base de casos de RUBLI. 577 tienen alguna disposición de revisión, y 12 de esos quedaron confirmados. Eso deja 10,546 empresas que ningún revisor ha abierto, y 16 de ellas están en los dos niveles que la propia fila marca como prioridad.",
          "No faltan instituciones que pudieran abrirlas. La SFP puede auditar el desempeño de las unidades compradoras y, en teoría, sancionar a funcionarios cuyos patrones de adjudicación indiquen favoritismo; en la práctica sus expedientes de sanción se enfocan en conducta indebida individual documentada. La UIF podría requerir los estados de cuenta de los intermediarios P3 de mayor valor para probar si la diferencia entre el pago del gobierno y el del subcontrato es sistemática. La COFECE podría investigar las relaciones de dependencia como prácticas monopólicas relativas. La ASF podría auditar las unidades compradoras con más proveedores dependientes.",
          "Nada de esto está pasando sistemáticamente. La brecha de rendición de cuentas no es jurídica — México tiene las leyes, los órganos de fiscalización y, con RUBLI, la capacidad analítica. Lo que falta es la decisión de abrir puertas que llevan dos décadas cerradas.",
        ],
        pullquote: {
          quote:
            "Mexico has the statutes, the oversight bodies, and the analytical capacity. What is missing is the decision to open rooms that have stayed locked for two decades.",
          quote_es:
            "México tiene las leyes, los órganos de fiscalización y la capacidad analítica. Lo que falta es la decisión de abrir salas que han permanecido cerradas durante dos décadas.",
          stat: '10,546',
          statLabel: "P3 + P6 vendors no reviewer has opened",
          statLabel_es: "proveedores P3 + P6 que ningún revisor ha abierto",
        },
        sources: [
          'SFP. (2025). Programa de Auditoría a Unidades Compradoras 2025.',
          'UIF/SHCP. (2024). Informe Anual de Actividades 2024.',
          'RUBLI /aria/queue?pattern=P3 and ?pattern=P6, paged in full, and /aria/patterns/{P3,P6}/institutions cohorts — run 0fe1409e, 13 October 2026.',
        ],
      },
    ],
    relatedSlugs: ['el-monopolio-invisible', 'marea-de-adjudicaciones', 'el-ejercito-fantasma'],
    lensTags: {
      patterns: ['P3', 'P6'],
      sectors: ['salud', 'energia', 'infraestructura'],
      terms: ['captura', 'IMSS', 'CFE', 'PEMEX'],
    },
    nextSteps: [
      'Request from SFP the results of any audits of IMSS pharmaceutical procurement in 2023-2025 involving recurring direct-award vendors.',
      'File UIF financial intelligence request for bank transaction data on the top 20 P3-classified intermediary vendors in infrastructure by contract value.',
      'Use COMPRANET to identify which IMSS procurement officials signed the highest-value P6-pattern contracts — cross-reference with SIPOT conflict-of-interest declarations.',
      'Investigate whether any of the 2,068 IMSS-anchored P6 vendors were listed on the RUPC as recently established entities at the time of first contract.',
      'File information requests to ASF for the complete findings of the 2022 IMSS pharmaceutical audit, including vendor names and institutional findings.',
      "Research whether Mexico's 2022 procurement law reform addressed the university subcontracting carve-out that enabled La Estafa Maestra.",
    ],
    nextSteps_es: [
      'Solicitar a la SFP los resultados de cualquier auditoría de compras farmacéuticas del IMSS en 2023-2025 que involucre proveedores recurrentes de adjudicación directa.',
      'Presentar solicitud de inteligencia financiera a la UIF para datos de transacciones bancarias de los 20 proveedores intermediarios P3 de mayor valor en infraestructura.',
      'Usar COMPRANET para identificar qué funcionarios de compras del IMSS firmaron los contratos de mayor valor con patrón P6 — cruzar con declaraciones de conflicto de interés del SIPOT.',
      'Investigar si alguno de los 2,068 proveedores P6 anclados en el IMSS estaba registrado en el RUPC como entidad de reciente creación al momento de su primer contrato.',
      'Solicitar a la ASF los hallazgos completos de la auditoría farmacéutica del IMSS de 2022, incluyendo nombres de proveedores y conclusiones institucionales.',
      'Investigar si la reforma a la ley de contrataciones de 2022 atendió el vacío legal de subcontratación universitaria que posibilitó La Estafa Maestra.',
    ],
  },

  // === STORY 6: High Water ===
  {
    slug: 'marea-de-adjudicaciones',
    outlet: 'data_analysis',
    type: 'era',
    era: 'cross',
    headline: "The 82 Percent Rule",
    headline_es: "La regla del 82 por ciento",
    subheadline:
      "In 2023 Mexico's federal government awarded 82 percent of its contracts without a contest — its highest reading on record. In 2024 it awarded 79. The rate has not fallen below 60 percent in the fourteen full years COMPRANET has coded procedure type, across three administrations and three parties, and the pandemic barely moved it. Mexican procurement law makes open bidding the default and direct award the exception. Non-competition is not the exception here. It is the rule, four to one.",
    subheadline_es:
      "En 2023 el gobierno federal mexicano adjudicó el 82 por ciento de sus contratos sin concurso — su lectura más alta registrada. En 2024 adjudicó 79. La tasa no baja del 60 por ciento en los catorce años completos que CompraNet lleva codificando el tipo de procedimiento, a lo largo de tres administraciones y tres partidos, y la pandemia apenas la movió. La ley mexicana de adquisiciones hace de la licitación abierta la regla y de la adjudicación directa la excepción. Aquí la no-competencia no es la excepción. Es la regla, con razón de cuatro a uno.",
    byline: 'RUBLI Data Analysis Unit',
    estimatedMinutes: 15,
    status: 'reporteado',
    leadStat: {
      value: '82.2%',
      label: "the share of all federal contracts awarded without a contest in 2023 — the high-water mark of the fourteen years the register can score",
      label_es: "la proporción de contratos federales adjudicados sin concurso en 2023 — el nivel más alto de los catorce años que el registro puede calificar",
      sublabel: "14 consecutive years above 60% — the EU scoreboard line is 10%",
      sublabel_es: "14 años consecutivos arriba del 60% — la línea del Tablero UE es del 10%",
      color: '#ea580c',
    },
    kickerStats: [
      {
        value: '82.2%',
        suffix: "of all contracts, the 2023 high-water mark",
        suffix_es: "de todos los contratos, el máximo de 2023",
        tone: 'critical',
      },
      {
        value: '10%',
        suffix: "the EU scoreboard line Mexico has never met",
        suffix_es: "la línea del Tablero UE que México nunca ha cumplido",
        tone: 'muted',
      },
      {
        value: '14 yrs',
        suffix: "never once below 60%",
        suffix_es: "ni una sola vez bajo el 60%",
        tone: 'data',
      },
    ],
    relatedSlugs: ['la-ilusion-competitiva', 'el-sexenio-del-riesgo', 'captura-institucional'],
    lensTags: {
      patterns: ['P5'],
      years: [2011, 2019, 2023],
      terms: ['adjudicación directa', 'direct award', 'Art. 41'],
    },
    nextSteps: [
      'Request from SFP the official justification categories used for direct awards in 2023 — what fraction cite "emergency," "sole source," or "small value"?',
      "Analyze whether BIRMEX's post-2019 procurement shows competitive pricing versus pre-reform IMSS pharmaceutical prices for the same drug categories.",
      'File audit requests with ASF for the largest 50 direct-award contracts in 2024 — are any awarded to RUBLI T1/T2 ARIA-queue vendors?',
      'Research which procurement officials are authorized to approve direct awards above 10M MXN — how has that authority concentrated since 2019?',
      'Compile a dataset of Art. 41 justification documents for 2023-2024 and code the cited legal basis to identify which exception clauses are used most frequently.',
      'Interview former SFP auditors who have worked on direct-award pattern reviews about the institutional constraints they encountered.',
    ],
    nextSteps_es: [
      'Solicitar a la SFP las categorías oficiales de justificación de adjudicaciones directas en 2023 — ¿qué fracción cita "emergencia", "fuente única" o "pequeño valor"?',
      'Analizar si las compras de BIRMEX posteriores a 2019 muestran precios competitivos frente a los precios farmacéuticos previos del IMSS para las mismas categorías de medicamentos.',
      'Presentar solicitudes de auditoría a la ASF para los 50 contratos de adjudicación directa más grandes de 2024 — ¿alguno fue adjudicado a proveedores T1/T2 de la fila ARIA de RUBLI?',
      'Investigar qué funcionarios están autorizados para aprobar adjudicaciones directas superiores a 10 MDP — ¿cómo se ha concentrado esa facultad desde 2019?',
      'Compilar un conjunto de datos de documentos de justificación del Art. 41 para 2023-2024 y codificar el fundamento legal citado para identificar las cláusulas de excepción más utilizadas.',
      'Entrevistar a ex auditores de la SFP que hayan trabajado en revisiones de patrones de adjudicación directa sobre las limitaciones institucionales que encontraron.',
    ],
    corrections: [
      "2026-09-19 — An earlier edition carried an OECD direct-award ceiling of 25 to 30 percent. That benchmark could not be traced to any published OECD instrument; the story now uses the EU Single Market Scoreboard's published 10 percent line.",
      "2026-09-19 — An earlier edition gave Calderón a 42.3 percent direct-award rate by averaging across the 2010 seam, where Structure A codes every year from 2002 to 2009 at 0.0 percent. Measured only where the register codes procedure type, the gap between the first complete term and the last is 17.5 points, not 37.1.",
      "2026-09-19 — An earlier edition said the centralized pharmaceutical buyers awarded directly at rates near 100 percent. Across their whole records BIRMEX and INSABI award 71.13 and 57.81 percent of their contracts directly, both below their own administration's 79.41 percent average.",
      "2026-09-30 — RUBLI now counts each contract in the year of its contract date. 175,767 contracts from COMPRANET's 2010 file that were signed in 2011 or 2012 had been counted in 2010, which made 2010 look like the first coded year. The comparable window now starts in 2011: Calderón's scoreable years are 2011-2012 (69.21 percent, not 61.90), the gap to AMLO is 10.2 points rather than 17.5, the run above 60 percent is fourteen years, and health's rise is measured from 2011 (+25.3 points, not +46.9).",
    ],
    corrections_es: [
      "2026-09-19 — Una edición anterior cargaba un techo OCDE de adjudicación directa del 25 al 30 por ciento. Esa referencia no pudo rastrearse a ningún instrumento publicado de la OCDE; la historia usa ahora la línea publicada del 10 por ciento del Tablero del Mercado Único de la UE.",
      "2026-09-19 — Una edición anterior le atribuía a Calderón una tasa de adjudicación directa de 42.3 por ciento al promediar sobre la costura de 2010, donde la Estructura A codifica en 0.0 por ciento todos los años de 2002 a 2009. Medida solo donde el registro codifica el tipo de procedimiento, la distancia entre el primer mandato completo y el último es de 17.5 puntos, no de 37.1.",
      "2026-09-19 — Una edición anterior decía que los compradores farmacéuticos centralizados adjudicaban de manera directa a tasas cercanas al 100 por ciento. En todo su registro, BIRMEX e INSABI adjudican directamente el 71.13 y el 57.81 por ciento de sus contratos, ambos por debajo del 79.41 por ciento que promedió su propia administración.",
      "2026-09-30 — RUBLI cuenta ahora cada contrato en el año de su fecha de contrato. 175,767 contratos del archivo 2010 de CompraNet firmados en 2011 o 2012 se contaban en 2010, lo que hacía parecer a 2010 el primer año codificado. La ventana comparable empieza ahora en 2011: los años calificables de Calderón son 2011-2012 (69.21 por ciento, no 61.90), la distancia con AMLO es de 10.2 puntos y no de 17.5, la racha arriba del 60 por ciento es de catorce años, y el ascenso de salud se mide desde 2011 (+25.3 puntos, no +46.9).",
    ],
    chapters: [
      {
        id: 'ch1',
        number: 1,
        title: "Every Government Promised Competition. Every Government Used Less of It.",
        title_es: "Cada gobierno prometió competencia. Cada gobierno usó menos.",
        subtitle: "Three complete terms, one direction",
        subtitle_es: "Tres mandatos completos, una dirección",
        prose: [
          "Every Mexican government since 2010 promised procurement transparency. Every one that finished its term awarded a larger share of contracts without a contest than the one before it. The numbers do not bend to who governed. Calderón, across the two years of his term the register can score, ran a direct-award share of 69.21 percent over 287,473 contracts worth 690.1 billion pesos. Peña Nieto reached 73.10 percent over 1,228,625 contracts worth 3.06 trillion. AMLO reached 79.41 percent over 1,050,552 contracts worth 2.76 trillion. Three parties, one direction.",
          "Set those shares against the law's own design. The Ley de Adquisiciones makes open bidding the default under Art. 26 and direct award the exception under Art. 41 — real emergencies, genuine sole-source contracts, small-value buys where running a tender costs more than it saves. A system in which the exception carries four contracts in five has inverted its own statute. The one international line published with a number is the EU Single Market Scoreboard, which rates a direct-award share at or above 10 percent as unsatisfactory.",
          "Mexico does not approach that line — it clears it by a factor of six to eight, in every term and every year on record. What the scoreboard calls unsatisfactory, Mexico treats as a floor. Sheinbaum's first months read 68.26 percent on 92,631 contracts, but that is nine months of a single year rather than a term: the federal feed froze on 28 September 2025. Fox does not appear at all, and Calderón enters only in 2011, because COMPRANET does not code procedure type before 2010 — Structure A records a direct-award rate of 0.0 percent for every year from 2002 to 2009, and most of 2010's contracts still come from it. Averaging across that seam inflates any term that straddles it, so this story does not. Measured only where the register can see, the gap between the first term and the last complete one is 10.2 points. The direction is the same. The rule in Mexican federal contracting is non-competition, by a ratio of roughly four to one.",
        ],
        prose_es: [
          "Todo gobierno mexicano desde 2010 prometió transparencia en la contratación. Todos los que terminaron su mandato adjudicaron sin concurso una proporción mayor de contratos que el anterior. Los números no cambian según quién gobierne. Calderón, en los dos años de su sexenio que el registro puede calificar, registró una proporción de adjudicación directa de 69.21 por ciento sobre 287,473 contratos por 690,100 millones de pesos. Peña Nieto alcanzó 73.10 por ciento sobre 1,228,625 contratos por 3.06 billones. AMLO alcanzó 79.41 por ciento sobre 1,050,552 contratos por 2.76 billones. Tres partidos, una sola dirección.",
          "Pon esas proporciones frente al diseño de la propia ley. La Ley de Adquisiciones hace de la licitación abierta la regla en su Art. 26 y de la adjudicación directa la excepción en su Art. 41 — emergencias reales, contratos genuinos de única fuente, compras de bajo valor donde licitar cuesta más de lo que ahorra. Un sistema donde la excepción se lleva cuatro de cada cinco contratos invirtió su propio estatuto. La única línea internacional que se publica con número es el Tablero del Mercado Único de la UE, que califica como insatisfactoria una proporción de adjudicación directa igual o superior al 10 por ciento.",
          "México no se acerca a esa línea — la rebasa por un factor de seis a ocho, en cada mandato y en cada año del registro. Lo que el tablero califica de insatisfactorio, México lo trata como piso. Los primeros meses de Sheinbaum marcan 68.26 por ciento sobre 92,631 contratos, pero son nueve meses de un solo año, no un mandato: el flujo federal se congeló el 28 de septiembre de 2025. Fox no aparece, y Calderón entra apenas en 2011, porque CompraNet no codifica el tipo de procedimiento antes de 2010 — la Estructura A registra una tasa de adjudicación directa de 0.0 por ciento en todos los años de 2002 a 2009, y de ella viene todavía la mayoría de los contratos de 2010. Promediar sobre esa costura infla cualquier sexenio que la cruce, así que esta historia no lo hace. Medida solo donde el registro alcanza a ver, la distancia entre el primer mandato y el último completo es de 10.2 puntos. La dirección es la misma. La regla en la contratación federal mexicana es la no-competencia, en una proporción de aproximadamente cuatro a uno.",
        ],
        chartConfig: {
          type: 'live',
          live: 'da-terms',
          scrolly: true,
          title: 'The Water Line, per Administration',
          title_es: 'La línea de marea, por administración',
        },
        pullquote: {
          quote:
            "In Mexico's federal procurement, competitive bidding is the exception. Direct awards are the rule, by a ratio of four to one.",
          quote_es:
            "En la contratación federal mexicana, la licitación competitiva es la excepción. La adjudicación directa es la regla, con razón de cuatro a uno.",
          stat: '82.2%',
          statLabel: "high-water mark, direct-award rate, 2023",
          statLabel_es: "máximo histórico, tasa de adjudicación directa, 2023",
          barValue: 0.822,
          barLabel: 'EU scoreboard · ≥10% direct award = unsatisfactory',
          barLabel_es: 'Tablero UE · ≥10% de adjudicación directa = insatisfactorio',
          vizTemplate: 'breach-ceiling',
        },
        sources: [
          'RUBLI /analysis/year-over-year, direct_award_pct and contracts by year, 2011-2025. Queried September 2026.',
          'RUBLI per-administration rollup: Σ direct awards ÷ Σ contracts over each term’s scoreable years, clipped to 2011 (Calderón 2011-12, Peña Nieto 2013-18, AMLO 2019-24, Sheinbaum 2025 partial). Fox excluded — no scoreable year. Supersedes an earlier edition that averaged Calderón across 2007-12 and gave his term 42.3 percent.',
          'European Commission. Single Market Scoreboard — Public procurement (single bidder and direct awards indicators). External benchmark, not a RUBLI measurement.',
        ],
      },
      {
        id: 'ch2',
        number: 2,
        title: "Fourteen Years, One Direction",
        title_es: "Catorce años, una sola dirección",
        subtitle: "The year-by-year record, 2011-2024",
        subtitle_es: "El registro año por año, 2011-2024",
        prose: [
          "The line starts in 2011 at 71.52 percent — already more than seven times the EU scoreboard line, and the earliest full-year reading the COMPRANET archive can produce. It does not climb every year: 2012, 2014, 2018, 2022 and 2024 each closed below the year before them. What it never does is come back down. Its floor is 67.50 percent, in 2012. Its peak is 82.18 percent, in 2023. The last complete year, 2024, settles at 79.35. The figure below walks the rest.",
          "This is a ratchet, not a policy. No single administration drove it; no single reform reversed it. The rate rose through both partisan transitions in the record — 67.50 to 68.40 when Peña Nieto took over, 76.21 to 77.80 when AMLO did — so the trend ignores who holds power. Mexico has stayed at or above 60 percent for every one of the fourteen years the register can score, and above 75 percent since 2017, exceeding the EU scoreboard line by six to eight times in each of them.",
          "The gap between the 10 percent EU line and the 60-plus percent Mexican floor is where competitive procurement used to live. The next chapters fill that gap: first the peak — which arrives not during the emergency everyone expects, but after it — then the sectors where the tide rose furthest.",
        ],
        prose_es: [
          "La línea arranca en 2011 en 71.52 por ciento — ya más de siete veces la línea del Tablero UE, y la lectura de año completo más temprana que el archivo CompraNet puede producir. No sube todos los años: 2012, 2014, 2018, 2022 y 2024 cerraron por debajo del año anterior. Lo que nunca hace es volver a bajar. Su piso es 67.50 por ciento, en 2012. Su pico es 82.18 por ciento, en 2023. El último año completo, 2024, se asienta en 79.35. La figura de abajo recorre el resto.",
          "Esto es un trinquete, no una política. Ninguna administración por sí sola lo impulsó; ninguna reforma por sí sola lo revirtió. La tasa subió en las dos transiciones partidistas del registro — de 67.50 a 68.40 cuando entró Peña Nieto, de 76.21 a 77.80 cuando entró AMLO — de modo que la tendencia ignora quién tiene el poder. México se mantuvo en 60 por ciento o más en cada uno de los catorce años que el registro puede calificar, y arriba de 75 por ciento desde 2017, rebasando la línea del Tablero UE por seis u ocho veces en todos ellos.",
          "La distancia entre la línea UE del 10 por ciento y el piso mexicano de más del 60 es donde solía vivir la contratación competitiva. Los capítulos siguientes llenan esa distancia: primero el pico — que llega no durante la emergencia que todos esperan, sino después de ella — y luego los sectores donde la marea subió más.",
        ],
        chartConfig: {
          type: 'live',
          live: 'da-line',
          title: 'The Tide Chart: Direct-Award Rate by Year, 2011-2024',
          title_es: 'La carta de marea: tasa de adjudicación directa por año, 2011-2024',
        },
        pullquote: {
          quote:
            "The EU scoreboard line is 10 percent. Mexico's floor is 60 percent. The distance between them is where competitive procurement used to live.",
          quote_es:
            "La línea del Tablero UE es del 10 por ciento. El piso mexicano es del 60. La distancia entre ambos es donde solía vivir la contratación competitiva.",
          stat: '14',
          statLabel: "consecutive years at or above a 60% direct-award rate, 2011–2024",
          statLabel_es: "años consecutivos con tasa de adjudicación directa de 60% o más, 2011–2024",
        },
        sources: [
          'RUBLI /analysis/year-over-year, direct_award_pct by year, 2011-2024. Queried September 2026.',
          'European Commission. Single Market Scoreboard — Public procurement (single bidder and direct awards indicators).',
        ],
      },
      {
        id: 'ch3',
        number: 3,
        title: "The Peak Came After the Emergency, Not During It",
        title_es: "El pico llegó después de la emergencia, no durante ella",
        subtitle: "COVID barely moved the rate. The years that followed crested it.",
        subtitle_es: "La COVID apenas movió la tasa. Los años siguientes la coronaron.",
        prose: [
          "Everyone expects 2020 — the COVID year — to be the surge, the moment emergency procurement broke the dam. It isn't. The pandemic moved the rate by 0.3 percentage points: 77.80 percent in 2019, before COVID, to 78.09 percent in 2020, on the thinnest contract volume of the window. The real swell came after the emergency ended. The three years that followed added 4.1 points, cresting at 82.18 percent in 2023 — the highest of the fourteen full years the register codes procedure type.",
          "The pandemic did not create Mexico's direct-award culture. It was an accelerant on a condition that already existed. The Ley de Adquisiciones, Art. 41, lists the legitimate grounds for skipping competition — emergencies, sole source, continuity with an existing contractor — with small-value contracts allowed under Art. 42 and open bidding the default under Art. 26. But when 82 percent of contracts invoke an exception, the statute's architecture is inverted. The exception is now the rule.",
          "The 2023 peak is not an inheritance, and it is not explained by the reform usually blamed for it. The AMLO administration centralized pharmaceutical buying under BIRMEX and INSABI, a change framed explicitly as anti-corruption and meant to strip discretion from institutional buyers with vendor ties. Across their whole records on the register, those two buyers award 71.13 percent and 57.81 percent of their contracts directly. Both are far above the EU scoreboard line. Both are also below the 79.41 percent their own administration averaged. Centralization did not produce the peak. Whatever lifted 2023 is spread across the register rather than concentrated in the two institutions built to replace the buyers they displaced. The next chapter shows where it is thickest.",
        ],
        prose_es: [
          "Todos esperan que 2020 — el año de la COVID — sea la marejada, el momento en que la contratación de emergencia rompió el dique. No lo es. La pandemia movió la tasa 0.3 puntos porcentuales: 77.80 por ciento en 2019, antes de la COVID, a 78.09 por ciento en 2020, sobre el volumen de contratos más bajo del periodo. La verdadera crecida llegó después de que terminó la emergencia. Los tres años siguientes sumaron 4.1 puntos, culminando en 82.18 por ciento en 2023 — la más alta de los catorce años completos en que el registro codifica el tipo de procedimiento.",
          "La pandemia no creó la cultura de adjudicación directa en México. Fue un acelerante sobre una condición que ya existía. La Ley de Adquisiciones, Art. 41, enumera los fundamentos legítimos para saltarse la competencia — emergencias, única fuente, continuidad con un contratista existente — con los contratos de bajo valor permitidos bajo el Art. 42 y la licitación abierta como regla bajo el Art. 26. Pero cuando el 82 por ciento de los contratos invoca una excepción, la arquitectura del estatuto se invierte. La excepción es ahora la regla.",
          "El pico de 2023 no es una herencia, y tampoco lo explica la reforma a la que suele culparse. La administración de AMLO centralizó la compra farmacéutica bajo BIRMEX e INSABI, un cambio planteado explícitamente como anticorrupción y pensado para quitar discrecionalidad a compradores institucionales ligados a proveedores. En todo su registro, esos dos compradores adjudican de manera directa el 71.13 y el 57.81 por ciento de sus contratos. Ambos están muy por encima de la línea del Tablero UE. Ambos están también por debajo del 79.41 por ciento que promedió su propia administración. La centralización no produjo el pico. Lo que sea que levantó 2023 está repartido por el registro, no concentrado en las dos instituciones creadas para sustituir a los compradores que desplazaron. El siguiente capítulo muestra dónde es más denso.",
        ],
        chartConfig: {
          type: 'live',
          live: 'da-emergency',
          title: 'The peak arrived after the emergency, not during it',
          title_es: 'El pico llegó después de la emergencia, no durante ella',
        },
        pullquote: {
          quote:
            "The pandemic did not create Mexico's direct-award culture. It was an accelerant applied to a pre-existing structural condition.",
          quote_es:
            "La pandemia no creó la cultura de adjudicación directa en México. Fue un acelerante aplicado a una condición estructural preexistente.",
          stat: '78.1%',
          statLabel: "direct-award rate in 2020, the pandemic year — up just +0.3pp from 2019",
          statLabel_es: "tasa de adjudicación directa en 2020, el año pandémico — apenas +0.3pp sobre 2019",
          barValue: 0.781,
          barLabel: 'was already 77.8% in 2019 pre-pandemic',
          barLabel_es: 'ya era 77.8% en 2019 prepandemia',
          vizTemplate: 'breach-ceiling',
        },
        sources: [
          'Ley de Adquisiciones, Arrendamientos y Servicios del Sector Público, Art. 41.',
        ],
      },
      {
        id: 'ch4',
        number: 4,
        title: "Where the Tide Rose Highest",
        title_es: "Dónde subió más la marea",
        subtitle:
          "Ten of twelve sectors are less competitive than in 2011 — and health rose furthest",
        subtitle_es:
          "Diez de doce sectores son menos competitivos que en 2011 — y salud subió más",
        prose: [
          "One national rate hides twelve different stories. Cut the register by sector at the first year it can be scored and at the year the rate peaked, and ten of the twelve sectors award a larger share of their contracts without a contest in 2023 than they did in 2011. The moves are not small. Health rises 25.3 points, from 58.40 percent to 83.70. Infrastructure rises 18.7, Environment 15.8, Education and Labor 15.4 each. Treasury, which was already high at 80.40 percent in 2011, ends at 91.10 — second in 2023 only to Agriculture's 93.40.",
          "Health is the one to sit with. In 2011 it was one of the more competitive sectors on the register: fewer than three in five of its contracts skipped the contest, against a federal average of 71.52 percent that year. By 2023 it awards 83.70 percent of 81,031 contracts directly — above the national rate, and the largest single-sector rise anywhere in the data. This is the sector that buys medicine, vaccines and hospital equipment. It is also the sector the centralization described in the previous chapter was applied to. Whatever that reform was meant to do to discretion, the sector it landed on now holds less competition than in any year the register can compare it with.",
          "Two sectors moved the other way, and neither is a recovery. Agriculture fell 2.9 points from 96.30 percent, which is close enough to the ceiling that there was nothing left to climb. Defense fell 29.7, from 83.90 to 54.20 — the only genuine retreat of the twelve, and it still awards more than half of its contracts without a contest. A high direct-award rate is not proof of wrongdoing: proprietary software, real emergencies and genuine sole-source supply all live inside that number. Nor can the cost of the rest be priced from here. The register publishes each year's total contract value — 413 billion pesos for the whole of 2023, every procedure type included — but does not split that value by procedure type, so no peso figure for direct awards can be built from it. What the sector cut does mark is the ground where a challenge is impossible, because there was never a second bid to measure the first against.",
        ],
        prose_es: [
          "Una sola tasa nacional esconde doce historias distintas. Si se corta el registro por sector en el primer año calificable y en el año del pico, diez de los doce sectores adjudican sin concurso una proporción mayor de sus contratos en 2023 que en 2011. Los movimientos no son pequeños. Salud sube 25.3 puntos, de 58.40 por ciento a 83.70. Infraestructura sube 18.7, Medio Ambiente 15.8, Educación y Trabajo 15.4 cada uno. Hacienda, que ya estaba alta en 80.40 por ciento en 2011, termina en 91.10 — sólo por debajo del 93.40 de Agricultura en 2023.",
          "Salud es el caso para detenerse. En 2011 era uno de los sectores más competitivos del registro: menos de tres de cada cinco de sus contratos se saltaban el concurso, frente a un promedio federal de 71.52 por ciento ese año. Para 2023 adjudica de manera directa el 83.70 por ciento de 81,031 contratos — por encima de la tasa nacional, y el mayor ascenso de un solo sector en todos los datos. Este es el sector que compra medicamentos, vacunas y equipo hospitalario. Es también el sector sobre el que se aplicó la centralización descrita en el capítulo anterior. Lo que sea que esa reforma pretendía hacerle a la discrecionalidad, el sector donde aterrizó tiene hoy menos competencia que en cualquier año con el que el registro pueda compararlo.",
          "Dos sectores se movieron en sentido contrario, y ninguno es una recuperación. Agricultura bajó 2.9 puntos desde 96.30 por ciento, lo bastante cerca del techo como para que no quedara nada por subir. Defensa bajó 29.7, de 83.90 a 54.20 — el único retroceso genuino de los doce, y aun así adjudica más de la mitad de sus contratos sin concurso. Una tasa alta de adjudicación directa no es prueba de irregularidad: el software propietario, las emergencias reales y el suministro genuinamente de única fuente viven dentro de ese número. Tampoco puede valuarse aquí el costo del resto. El registro publica el valor total de cada año — 413 mil millones de pesos para todo 2023, con cualquier tipo de procedimiento — pero no lo separa por tipo de procedimiento, así que ninguna cifra en pesos de adjudicación directa puede construirse desde él. Lo que sí marca el corte por sector es el terreno donde impugnar es imposible, porque nunca hubo una segunda oferta contra la cual medir la primera.",
        ],
        chartConfig: {
          type: 'live',
          live: 'da-sectors',
          title: 'Direct-Award Rate by Sector, 2011 → 2023',
          title_es: 'Tasa de adjudicación directa por sector, 2011 → 2023',
        },
        pullquote: {
          quote:
            "In 2011 health was more competitive than the federal average. By 2023 it awards 83.7 percent of its contracts without a contest.",
          quote_es:
            "En 2011 salud era más competitiva que el promedio federal. Para 2023 adjudica el 83.7 por ciento de sus contratos sin concurso.",
          stat: '+25.3 pp',
          statLabel: "health's rise in direct-award share, 2011 to 2023 — the largest rise of the twelve sectors",
          statLabel_es: "el ascenso de salud en adjudicación directa, de 2011 a 2023 — el mayor ascenso de los doce sectores",
          barValue: 0.837,
          barLabel: "health's 2023 direct-award share",
          barLabel_es: 'proporción de adjudicación directa de salud en 2023',
          vizTemplate: 'breach-ceiling',
        },
        sources: [
          'RUBLI /analysis/sector-year-breakdown, direct_award_pct by sector and year, 2011 and 2023. Queried September 2026. Its twelve sectors sum to the contract count /analysis/year-over-year reports for each year.',
        ],
      },
      {
        id: 'ch5',
        number: 5,
        title: "The Oversight That Exists in Law and Nowhere Else",
        title_es: "La fiscalización que existe en la ley y en ningún otro lado",
        subtitle: "The architecture to constrain direct awards was written, then never operated",
        subtitle_es: "La arquitectura para limitar las adjudicaciones directas se escribió, y nunca se operó",
        prose: [
          "On paper, the controls exist. Every direct award under Art. 41 requires a written justification naming the specific legal basis — emergency, sole source, continuity — the vendor chosen, and the rationale. Those justifications are public under transparency law. The SFP is empowered to audit the pattern of justifications at each procurement unit. The ASF is empowered to review individual high-value direct awards under Art. 41 and Art. 42 during Cuenta Pública audits. Three layers of oversight, fully authorized.",
          "In practice, none of it operates at scale. Justification documents are published inconsistently. The SFP's pattern-audit function runs at a small fraction of its legal capacity. ASF reviews reach only a tiny share of high-value direct awards. The 82 percent rate is not what happens when a system tries to constrain direct awards and fails. It is what happens when a system accepts them as normal and builds no real constraint at all.",
          "Three fixes are technically feasible today, and RUBLI's data makes each possible: publish Art. 41 justifications in machine-readable form; have the SFP run pattern-based audits of procurement units whose direct-award rates exceed sector norms; and monitor risk in real time, so a suspect award can be challenged before it executes, not after. CompraNet has the data architecture. RUBLI has the methodology. What is missing is the institutional will to run oversight against fourteen years of dependency. The cost of that absence cannot be priced from this register — it publishes no value split by procedure type — but it can be counted. Between 2011 and 2024 the Mexican federal government awarded 1,931,317 contracts without a contest, 75.2 percent of everything it can be scored on, and not one of them had a competing offer to be measured against.",
        ],
        prose_es: [
          "En el papel, los controles existen. Cada adjudicación directa bajo el Art. 41 requiere una justificación escrita que nombre la base legal específica — emergencia, única fuente, continuidad — el proveedor elegido y la motivación. Esas justificaciones son públicas bajo la ley de transparencia. La SFP está facultada para auditar el patrón de justificaciones en cada unidad compradora. La ASF está facultada para revisar adjudicaciones directas individuales de alto valor bajo el Art. 41 y el Art. 42 durante las auditorías de la Cuenta Pública. Tres capas de fiscalización, plenamente autorizadas.",
          "En la práctica, ninguna opera a escala. Los documentos de justificación se publican de manera irregular. La función de auditoría por patrones de la SFP opera a una pequeña fracción de su capacidad legal. Las revisiones de la ASF alcanzan apenas una porción minúscula de las adjudicaciones directas de alto valor. La tasa de 82 por ciento no es lo que ocurre cuando un sistema intenta limitar las adjudicaciones directas y falla. Es lo que ocurre cuando un sistema las acepta como normales y no construye límite real alguno.",
          "Tres remedios son técnicamente factibles hoy, y los datos de RUBLI hacen posible cada uno: publicar las justificaciones del Art. 41 en formato legible por máquina; que la SFP corra auditorías basadas en patrones a las unidades compradoras cuyas tasas de adjudicación directa excedan las normas sectoriales; y monitorear el riesgo en tiempo real, para que una adjudicación sospechosa pueda impugnarse antes de ejecutarse, no después. CompraNet tiene la arquitectura de datos. RUBLI tiene la metodología. Lo que falta es la voluntad institucional de operar la fiscalización contra catorce años de dependencia. El costo de esa ausencia no puede valuarse desde este registro — no publica el valor separado por tipo de procedimiento — pero sí puede contarse. Entre 2011 y 2024 el gobierno federal mexicano adjudicó 1,931,317 contratos sin concurso, el 75.2 por ciento de todo lo que puede calificarse, y ninguno de ellos tuvo una oferta rival contra la cual medirse.",
        ],
        pullquote: {
          quote:
            "Mexico built an oversight architecture in law and never built it in practice. The 82% direct-award rate is the visible shape of that absence.",
          quote_es:
            "México construyó una arquitectura de fiscalización en la ley y nunca la construyó en la práctica. La tasa de adjudicación directa del 82% es la forma visible de esa ausencia.",
          stat: '1,931,317',
          statLabel: "federal contracts awarded without a contest, 2011–2024 — 75.2% of everything the register can score",
          statLabel_es: "contratos federales adjudicados sin concurso, 2011–2024 — el 75.2% de todo lo que el registro puede calificar",
          barValue: 0.752,
          barLabel: 'share of all scoreable federal contracts, 2011–2024',
          barLabel_es: 'proporción de todos los contratos federales calificables, 2011–2024',
          vizTemplate: 'mosaic-tile',
        },
        chartConfig: {
          type: 'live',
          live: 'da-count',
          title: 'Direct Awards by Year, as a Count',
          title_es: 'Adjudicaciones directas por año, en número',
        },
        sources: [
          'Ley de Adquisiciones, Arrendamientos y Servicios del Sector Público, Art. 41, Art. 42.',
          'RUBLI /analysis/year-over-year — direct awards reconstructed as contracts × direct_award_pct per year, 2011-2024. Queried September 2026.',
          'OECD (2023). Public procurement performance: A framework for measuring efficiency, compliance and strategic goals. OECD Public Governance Policy Papers No. 36.',
        ],
      },
    ],
  },

  // === STORY 7: The Ledger of Five Administrations ===
  {
    slug: 'el-sexenio-del-riesgo',
    outlet: 'data_analysis',
    type: 'era',
    era: 'cross',
    headline: "The Ledger of Five Administrations",
    headline_es: "El libro mayor de cinco sexenios",
    subheadline:
      "Mexico's procurement risk indicator reads higher under every administration than the one before, and under the model RUBLI retrained in October 2026 the order holds even with the contracts the model learned from set aside: 6.34 percent for Peña Nieto, 7.84 for López Obrador, 11.40 for Sheinbaum's first nine months. The register also grew richer term by term, and the model reads some of that, so the climb is a reading, not a verdict. What did change under López Obrador is where the money went — defence up 203 percent, infrastructure down 45 — and how it was awarded: more direct awards by value, but fewer single-award procedures.",
    subheadline_es:
      "El indicador de riesgo de la contratación pública mexicana es más alto en cada sexenio que en el anterior, y con el modelo que RUBLI reentrenó en octubre de 2026 el orden se sostiene aun sin los contratos de los que aprendió el modelo: 6.34 por ciento con Peña Nieto, 7.84 con López Obrador, 11.40 en los primeros nueve meses de Sheinbaum. El registro también se volvió más rico sexenio tras sexenio, y el modelo lee parte de esa riqueza, así que la subida es una lectura, no un veredicto. Lo que sí cambió con López Obrador es a dónde fue el dinero —defensa subió 203 por ciento, infraestructura cayó 45— y cómo se adjudicó: más adjudicación directa por valor, pero menos procedimientos con un solo adjudicado.",
    byline: 'RUBLI Data Analysis Unit',
    estimatedMinutes: 17,
    status: 'reporteado',
    leadStat: {
      value: '6.3 · 7.8 · 11.4%',
      label: "high-risk rate outside labelled contracts — Peña Nieto · AMLO · Sheinbaum (partial) · v0.9.1",
      label_es:
        "tasa de alto riesgo fuera de los contratos etiquetados — Peña Nieto · AMLO · Sheinbaum (parcial) · v0.9.1",
      sublabel: "higher under each term · the same order under the previous model",
      sublabel_es: "más alta en cada sexenio · el mismo orden con el modelo anterior",
      color: '#dc2626',
    },
    kickerStats: [
      {
        value: '6.34 · 7.84 · 11.40',
        suffix: "percent high-risk outside labelled contracts: Peña Nieto, AMLO, Sheinbaum — the same order under both models, wider gaps under v0.9.1.",
        suffix_es:
          "por ciento de alto riesgo fuera de los contratos etiquetados: Peña Nieto, AMLO, Sheinbaum — el mismo orden con ambos modelos, distancias mayores con v0.9.1.",
        tone: 'data',
      },
      {
        value: '27.8% → 38.5%',
        suffix: "share of contracted value awarded directly, Peña Nieto to AMLO.",
        suffix_es: "proporción del valor contratado por adjudicación directa, de Peña Nieto a AMLO.",
        tone: 'data',
      },
      {
        value: '62.0% → 47.4%',
        suffix: "single-award share of contracts in competitive procedures, Peña Nieto to AMLO.",
        suffix_es: "proporción de los contratos de procedimientos competitivos con un solo adjudicado, de Peña Nieto a AMLO.",
        tone: 'data',
      },
    ],
    corrections: [
      "2026-09-19 — An earlier edition described SEDENA's rise as a straight line. The army's share of federal contracting fell in 2017 and again in 2022, and its contracted value fell in 2019 against 2018.",
      "2026-09-19 — An earlier edition printed per-category high-risk percentages — food at 32.4 percent, pharmaceuticals at 22.4 — set against the model's 2-to-15-percent calibration band. The register publishes no high-risk rate per category per term; those figures are withdrawn.",
      "2026-09-19 — An earlier edition printed a peso total for AMLO-era direct awards. The register publishes each year's total contracted value but does not split it by procedure type, so that figure cannot be rebuilt and is withdrawn.",
      "2026-10-06 — RUBLI reassigned 168,351 contracts to more specific categories, using the government's own partida codes and contract descriptions. The category figures in chapters 2 and 4 are restated on the new classification. The earlier edition's category risk readings also did not match the register: three of the ten largest lines of AMLO's term read higher than under Peña Nieto, not nine.",
      "2026-10-07 — A keyword-matching fault in RUBLI's category classifier filed contracts whose titles merely contained the letters \"res\" (prestador, respuesta, residuos) under food, and similar fragments sent \"productos\" to oil and gas and \"administración\" to catering. Correcting it moved 382,810 contracts. Food and provisions under AMLO falls from 252.2 to 129.4 billion pesos and from the third-largest line of the term to the eighth; the chapter 2 and 4 figures are restated. The finding of three higher lines and seven lower is unchanged.",
      "2026-10-14 — RUBLI retrained its risk model, from v0.8.5 to v0.9.1. The earlier edition's finding — one step up between Calderón and Peña Nieto, then flat, with Peña Nieto, AMLO and Sheinbaum within 0.3 points once labelled contracts were set aside — does not hold under the new model. Raw rates now rise every term (6.74, 6.98, 8.91, 12.46 and 16.21 percent); outside labelled contracts the three latest terms read 6.34, 7.84 and 11.40 percent. Both models put those three in the same order. Chapter 4 is restated: six of the ten largest AMLO-era categories now read higher than under Peña Nieto, not three, and Segalmex reads 0.423 on 530 contracts, 193 of them high-risk.",
    ],
    corrections_es: [
      "2026-09-19 — Una edición anterior describía el ascenso de la SEDENA como una línea recta. La participación del ejército en la contratación federal cayó en 2017 y otra vez en 2022, y su valor contratado cayó en 2019 frente a 2018.",
      "2026-09-19 — Una edición anterior imprimía porcentajes de alto riesgo por partida — alimentos en 32.4 por ciento, medicamentos en 22.4 — contrastados con la banda de calibración de 2 a 15 por ciento del modelo. El registro no publica una tasa de alto riesgo por partida y por sexenio; esas cifras quedan retiradas.",
      "2026-09-19 — Una edición anterior imprimía un total en pesos de las adjudicaciones directas del sexenio de AMLO. El registro publica el valor contratado total de cada año pero no lo separa por tipo de procedimiento, así que esa cifra no puede reconstruirse y queda retirada.",
      "2026-10-06 — RUBLI reasignó 168,351 contratos a partidas más específicas, con las claves de partida del propio gobierno y la descripción de cada contrato. Las cifras por partida de los capítulos 2 y 4 se reexpresan con la nueva clasificación. Las lecturas de riesgo por partida de la edición anterior tampoco coincidían con el registro: tres de las diez partidas mayores del sexenio de AMLO se leen más alto que con Peña Nieto, no nueve.",
      "2026-10-07 — Una falla de coincidencia de palabras en el clasificador de partidas de RUBLI archivaba como alimentos contratos cuyo título solo contenía las letras \"res\" (prestador, respuesta, residuos), y fragmentos similares mandaban \"productos\" a petróleo y gas y \"administración\" a servicios de alimentación. Corregirla movió 382,810 contratos. Alimentos y víveres en el sexenio de AMLO baja de 252.2 a 129.4 mil millones de pesos y pasa de la tercera partida del sexenio a la octava; las cifras de los capítulos 2 y 4 se reexpresan. El hallazgo de tres partidas más altas y siete más bajas no cambia.",
      "2026-10-14 — RUBLI reentrenó su modelo de riesgo, de v0.8.5 a v0.9.1. El hallazgo de la edición anterior —un solo escalón entre Calderón y Peña Nieto y después plano, con Peña Nieto, AMLO y Sheinbaum a 0.3 puntos entre sí sin los contratos etiquetados— no se sostiene con el nuevo modelo. Las tasas en bruto ahora suben en cada sexenio (6.74, 6.98, 8.91, 12.46 y 16.21 por ciento); sin los contratos etiquetados, los tres sexenios más recientes marcan 6.34, 7.84 y 11.40 por ciento. Ambos modelos ponen a los tres en el mismo orden. El capítulo 4 se reexpresa: seis de las diez partidas mayores del sexenio de AMLO se leen ahora más alto que con Peña Nieto, no tres, y Segalmex marca 0.423 en 530 contratos, 193 de ellos de alto riesgo.",
    ],
    chapters: [
      {
        id: 'ch1',
        number: 1,
        title: "Opening the Books",
        title_es: "Abrir los libros",
        subtitle: "Five administrations: a reading that rises term by term",
        subtitle_es: "Cinco sexenios: una lectura que sube sexenio tras sexenio",
        prose: [
          "Post the five terms in the order they governed. A contract counts as high-risk when RUBLI's model scores it 0.40 or above on a 0-to-1 scale — close enough to the contracts of vendors linked to documented cases to be worth a second look. Fox: 6.74 percent of contracts flagged high-risk, 13,899 of 206,307. Calderón: 6.98 percent, 33,591 of 481,450. Peña Nieto: 8.91 percent, 109,479 of 1,228,625. AMLO: 12.46 percent, 130,626 of 1,048,160. Sheinbaum's partial account: 16.21 percent. Read raw, the column climbs every term. Read carefully, part of the climb is the record, not the governments.",
          "The first caveat is the data. Fox governed under Structure A coverage, where COMPRANET records a tax ID for one contract in a thousand, so 6.74 percent is a floor rather than a measurement. The register changed shape around 2010, again in 2018 and again in 2023, each time recording more about every contract, and the current model reads some of that richness: one of its inputs adds weight wherever a budget-line code is recorded, which is every contract since 2023.",
          "The second caveat is the model's own labels. RUBLI's v0.9.1 model (replaced in October 2026 by v0.9.2) trained on RUBLI's labelled case set, most of it analyst write-ups rather than adjudicated findings, and it scores the contracts it learned from high. 14.7 percent of AMLO-era contracts belong to a labelled vendor, against 7.1 percent under Peña Nieto, because labelling followed better tax-ID coverage. Set the labelled contracts aside and the three most recent terms read 6.34 percent for Peña Nieto, 7.84 for AMLO and 11.40 for Sheinbaum. Under v0.8.5, the model this story was first reported on, the same three read 9.32, 9.38 and 9.56: the same order, a third of a point apart. Both models rank the terms the same way; the retrained one spreads them wider.",
          "What did change under AMLO is how the money was awarded. Direct awards took 38.5 percent of contracted value, up from 27.8 percent under Peña Nieto, and 79.4 percent of contracts, up from 73.1. In the other direction, contracts from competitive procedures with a single winner fell from 62.0 to 47.4 percent of all contracts in competitive procedures. Sheinbaum's column is nine months of a single year, and the federal feed froze on 28 September 2025 before that year finished; it cannot carry a verdict either way.",
        ],
        prose_es: [
          "Asentados los cinco sexenios en el orden en que gobernaron. Un contrato cuenta como de alto riesgo cuando el modelo de RUBLI lo califica en 0.40 o más en una escala de 0 a 1 — lo bastante cerca de los contratos de proveedores vinculados a casos documentados como para merecer una segunda mirada. Fox: 6.74 por ciento de contratos marcados como de alto riesgo, 13,899 de 206,307. Calderón: 6.98 por ciento, 33,591 de 481,450. Peña Nieto: 8.91 por ciento, 109,479 de 1,228,625. AMLO: 12.46 por ciento, 130,626 de 1,048,160. La cuenta parcial de Sheinbaum: 16.21 por ciento. Leída en bruto, la columna sube en cada sexenio. Leída con cuidado, parte de la subida es del registro, no de los gobiernos.",
          "La primera salvedad son los datos. Fox gobernó con cobertura de Estructura A, donde CompraNet registra un RFC por cada mil contratos, así que el 6.74 por ciento es un piso y no una medición. El registro cambió de forma hacia 2010, otra vez en 2018 y otra en 2023, y cada vez anotó más de cada contrato; el modelo actual lee parte de esa riqueza: una de sus variables suma peso donde hay una clave de partida, y la hay en todos los contratos desde 2023.",
          "La segunda salvedad son las propias etiquetas del modelo. El modelo v0.9.1 de RUBLI (reemplazado en octubre de 2026 por v0.9.2) se entrenó con la base de casos etiquetados de RUBLI, en su mayoría documentados por analistas y no resoluciones, y califica alto los contratos de los que aprendió. El 14.7 por ciento de los contratos del sexenio de AMLO es de un proveedor etiquetado, frente al 7.1 por ciento con Peña Nieto, porque el etiquetado siguió a la mejor cobertura de RFC. Sin los contratos etiquetados, los tres sexenios más recientes marcan 6.34 por ciento con Peña Nieto, 7.84 con AMLO y 11.40 con Sheinbaum. Con v0.8.5, el modelo con el que se reportó esta historia por primera vez, los mismos tres marcaban 9.32, 9.38 y 9.56: el mismo orden, a un tercio de punto entre sí. Ambos modelos ordenan los sexenios igual; el reentrenado los separa más.",
          "Lo que sí cambió con AMLO es cómo se adjudicó el dinero. La adjudicación directa se llevó el 38.5 por ciento del valor contratado, contra 27.8 por ciento con Peña Nieto, y el 79.4 por ciento de los contratos, contra 73.1. En sentido contrario, los contratos de procedimientos competitivos con un solo adjudicado bajaron del 62.0 al 47.4 por ciento de todos los contratos de procedimientos competitivos. La columna de Sheinbaum son nueve meses de un solo año, y el flujo federal se congeló el 28 de septiembre de 2025 antes de que ese año terminara; no puede cargar un veredicto en ninguna dirección.",
        ],
        chartConfig: {
          type: 'live',
          live: 'era-terms',
          scrolly: true,
          chartId: 'era-terms',
          title: 'Five administrations: a reading that rises term by term',
          title_es: 'Cinco sexenios: una lectura que sube sexenio tras sexenio',
        },
        pullquote: {
          quote:
            "Risk reads higher under every term, and the order survives setting aside the contracts the model learned from: Peña Nieto 6.34%, AMLO 7.84%, Sheinbaum 11.40%. The previous model put the same three a third of a point apart.",
          quote_es:
            "El riesgo es más alto en cada sexenio, y el orden se sostiene sin los contratos de los que aprendió el modelo: Peña Nieto 6.34%, AMLO 7.84%, Sheinbaum 11.40%. El modelo anterior ponía a los mismos tres a un tercio de punto entre sí.",
          stat: '6.3 · 7.8 · 11.4%',
          statLabel: "high-risk rate outside labelled contracts — Peña Nieto · AMLO · Sheinbaum (partial) · v0.9.1",
          statLabel_es:
            "tasa de alto riesgo fuera de los contratos etiquetados — Peña Nieto · AMLO · Sheinbaum (parcial) · v0.9.1",
          barValue: 0.0784,
          barLabel: 'AMLO 7.84% — between Peña Nieto 6.34% and Sheinbaum 11.40%',
          barLabel_es: 'AMLO 7.84% — entre Peña Nieto 6.34% y Sheinbaum 11.40%',
          vizTemplate: 'dot-ratio',
        },
        sources: [
          'RUBLI /analysis/year-over-year — per-term rate as Σ (contracts × high_risk_pct) ÷ Σ contracts across the term years in lib/administrations.ts. Queried 14 October 2026, under v0.9.1.',
          'Outside-labelled rates: contracts of vendors in RUBLI ground_truth_vendors (false positives excluded) set aside; computed on the register under v0.9.1, 14 October 2026. The v0.8.5 comparison is the September 2026 edition of this story.',
          'RUBLI risk model v0.9.1 — calibration target for the flagged share (2–15%), /methodology.',
        ],
      },
      {
        id: 'ch2',
        number: 2,
        title: "The Largest Entry: AMLO's Books, Reorganized",
        title_es: "La partida mayor: los libros de AMLO, reorganizados",
        subtitle: "Where every peso moved between sectors",
        subtitle_es: "A dónde se movió cada peso entre sectores",
        prose: [
          "Set AMLO's sector ledger beside Peña Nieto's as debits and credits and two things show at once. The books were reorganized — five sectors were contracted more heavily and seven less — and they were also smaller. Peña Nieto's six years contracted 3.06 trillion pesos; AMLO's contracted 2.76 trillion, 306 billion less. The money did not simply move between lines and leave the total still.",
          "Count the credits that fell. Energía dropped 85 percent, from 444.4 billion pesos to 67.9, as Pemex and CFE pulled work in-house. Infraestructura fell 45 percent, from 1,024.4 billion to 559.7 — the single largest movement of pesos on the page, larger than every increase combined. Medio Ambiente fell 26 percent, Trabajo 21, Educación 16. What rose rose from a smaller base: Defensa 203 percent, from 56.4 billion to 170.8; Gobernación 64 percent, from 85.1 to 139.4; Hacienda 20 percent; Agricultura 16.",
          "Salud is the exception in size, up 45 percent — 823.7 billion pesos to 1,194.7, the largest line in either term's book. The growth was not clinics, equipment, or staff; it was pharmaceutical centralization through INSABI, BIRMEX, and ultimately IMSS-Bienestar. The single largest category inside it is \"Medicamentos y Farmacéuticos\" at 403.5 billion pesos. The second largest category of the term, \"Construcción de Edificios\" at 324.3 billion, holds the military-construction surge. Both hand straight to the next chapters.",
          "Every figure in this chapter is drawn from the register on each page load rather than typed, and the sources note below records the hand-run aggregate it supersedes.",
        ],
        prose_es: [
          "Puesto el libro sectorial de AMLO junto al de Peña Nieto, como cargos y abonos, aparecen dos cosas a la vez. Los libros se reorganizaron —cinco sectores recibieron más contratación y siete menos— y además encogieron. Los seis años de Peña Nieto contrataron 3.06 billones de pesos; los de AMLO, 2.76 billones: 306,000 millones menos. El dinero no se movió de una línea a otra dejando el total quieto.",
          "Contemos los abonos que cayeron. Energía se desplomó 85 por ciento, de 444,400 millones de pesos a 67,900, cuando Pemex y CFE internalizaron el trabajo. Infraestructura cayó 45 por ciento, de 1,024,400 millones a 559,700 — el mayor movimiento de pesos de la página, más grande que todos los aumentos juntos. Medio Ambiente bajó 26 por ciento, Trabajo 21, Educación 16. Lo que subió, subió desde una base menor: Defensa 203 por ciento, de 56,400 millones a 170,800; Gobernación 64 por ciento, de 85,100 a 139,400; Hacienda 20; Agricultura 16.",
          "Salud es la excepción por tamaño, con un alza del 45 por ciento — de 823.7 mil millones de pesos a 1,194.7, la línea mayor de los libros de cualquiera de los dos sexenios. El crecimiento no fue clínicas, equipo ni personal; fue centralización farmacéutica vía INSABI, BIRMEX y, al final, IMSS-Bienestar. La partida mayor dentro de ella es \"Medicamentos y Farmacéuticos\", con 403.5 mil millones de pesos. La segunda partida del sexenio, \"Construcción de Edificios\" con 324.3 mil millones, guarda el auge de la construcción militar. Ambas conectan directo con los capítulos siguientes.",
          "Cada cifra de este capítulo se dibuja del registro en cada carga de la página en lugar de estar escrita, y la nota de fuentes de abajo deja constancia de la consulta manual a la que sustituye.",
        ],
        chartConfig: {
          type: 'live',
          live: 'era-sectors',
          chartId: 'era-sectors',
          title: 'The reorganized ledger: sector contracting, AMLO (2019-24) vs Peña Nieto (2013-18)',
          title_es:
            'El libro reorganizado: contratación sectorial, AMLO (2019-24) vs Peña Nieto (2013-18)',
        },
        pullquote: {
          quote:
            "Defense contracting grew 203 percent. Civilian infrastructure fell 45 percent — 465 billion pesos, more than every increase on the page combined. The books were reorganized, and they were also 306 billion pesos smaller.",
          quote_es:
            "La contratación de defensa creció 203 por ciento. La infraestructura civil cayó 45 por ciento — 465 mil millones de pesos, más que todos los aumentos de la página juntos. Los libros se reorganizaron, y además encogieron 306 mil millones.",
          stat: '+203%',
          statLabel: "Defensa contracting, AMLO vs Peña Nieto — 56.4B to 170.8B MXN",
          statLabel_es:
            "contratación en Defensa, AMLO frente a Peña Nieto — de 56,400 a 170,800 MDP",
          barValue: 0.062,
          barLabel: "Defensa's share of all federal contract value, 2019-24 (1.8% in 2013-18)",
          barLabel_es: 'participación de Defensa en el valor contratado federal, 2019-24 (1.8% en 2013-18)',
          vizTemplate: 'dot-ratio',
        },
        sources: [
          'RUBLI /analysis/sector-year-breakdown — Σ total_value per sector across 2013-2018 and 2019-2024. Queried September 2026; supersedes the April 2026 hand-run aggregate, whose sector mapping did not match the register.',
          'SHCP. (2024). Cuenta Pública: comparativo sexenios 2013-2018 / 2019-2024.',
        ],
      },
      {
        id: 'ch3',
        number: 3,
        title: "The Army's Climb, and Its Two Steps Back",
        title_es: "La escalada del ejército, y sus dos escalones atrás",
        subtitle: "How national-security cover moved civilian works to SEDENA",
        subtitle_es: "Cómo la cobertura de seguridad nacional trasladó la obra civil a la SEDENA",
        prose: [
          "In 2018, SEDENA — the army — took 2.23 percent of everything the federal government contracted. By 2024 it took 5.43 percent, which is 5.1 times the share it held back in 2015. The peso figures move with it: 9.94 billion in 2018, 22.43 billion in 2024. Contracting across the defence sector as a whole grew 203 percent between the two terms, from 56.4 billion pesos to 170.8. But the climb is not a straight line. The army's share fell in 2017 and again in 2022, when it dropped from 3.62 percent to 2.18 and its contracted value fell from 18.00 billion pesos to 12.49. Contracted value also fell in 2019, the first year of the term, against 2018. Two of the nine years step backwards; the destination is what holds.",
          "This was not weapons modernization. It was mission expansion. The same six years saw SEDENA take operational control of the AIFA civilian airport, the Tren Maya tourist railway, customs administration, social-program logistics, and public works previously contracted through SCT and CONAGUA — a civilian portfolio absorbed by the army.",
          "The mechanism was legal. Presidential decrees beginning in 2019 reclassified ever-broader public works as national security, moving contracting authority from civilian agencies to SEDENA. Articles 41 and 42 of the Ley de Adquisiciones, with Article 32 of the Ley de Obras Públicas, permit the executive to declare national-security exceptions to competitive bidding. The register records which exception a contract used only from 2023 on, so it cannot say how often each term invoked this one.",
          "Reclassification cost visibility. Search the register for contracts whose titles name the Tren Maya and 465 come back, worth 125.3 billion pesos. The federal audit office puts the project's real budget past 500 billion. The difference sits in trust funds the army controls — FONATUR, Tren Maya and SEDENA-Bienestar — which publish far less than the civilian COMPRANET file. That 465-contract count was run against the register in April 2026 and cannot be reproduced through the public interface, which does not search contract titles. In 2023 Animal Político, MCCI and Aristegui Noticias reported that Tren Maya and AIFA contractors were required to route a percentage of contract value through designated intermediary firms — the same shape as RUBLI's P3 intermediary pattern. RUBLI cannot verify those allegations from procurement data alone, but the structural conditions match: concentrated awards, intermediary vendors, classified procurement, limited visibility.",
        ],
        prose_es: [
          "En 2018 la SEDENA —el ejército— se llevó el 2.23 por ciento de todo lo que contrató el gobierno federal. Para 2024 se llevó el 5.43 por ciento, que son 5.1 veces la participación que tenía en 2015. Las cifras en pesos avanzan con ella: 9.94 mil millones en 2018, 22.43 mil millones en 2024. La contratación del sector defensa en conjunto creció 203 por ciento entre los dos sexenios, de 56.4 mil millones de pesos a 170.8. Pero la escalada no es una línea recta. La participación del ejército cayó en 2017 y otra vez en 2022, cuando bajó del 3.62 por ciento al 2.18 y su valor contratado pasó de 18.00 mil millones de pesos a 12.49. El valor contratado también cayó en 2019, el primer año del sexenio, frente a 2018. Dos de los nueve años retroceden; lo que se sostiene es el punto de llegada.",
          "No fue modernización armamentista. Fue expansión de misión. En esos mismos seis años la SEDENA tomó el control operativo del aeropuerto civil AIFA, el ferrocarril turístico Tren Maya, la administración aduanera, la logística de programas sociales y obras públicas que antes se contrataban por la SCT y la CONAGUA — una cartera civil absorbida por el ejército.",
          "El mecanismo fue legal. Decretos presidenciales a partir de 2019 reclasificaron obras públicas cada vez más amplias como seguridad nacional, trasladando la autoridad de contratación de las dependencias civiles a la SEDENA. Los Artículos 41 y 42 de la Ley de Adquisiciones, con el Artículo 32 de la Ley de Obras Públicas, permiten al ejecutivo declarar excepciones de seguridad nacional a la licitación competitiva. El registro anota qué excepción usó cada contrato solo a partir de 2023, así que no puede decir con qué frecuencia la invocó cada sexenio.",
          "La reclasificación costó visibilidad. Los 465 contratos cuyos títulos nombran \"Tren Maya\" suman 125,300 millones de pesos —un conteo hecho sobre el registro en abril de 2026, y que la API pública no puede reproducir porque el endpoint de contratos no busca por título—, pero los hallazgos de la ASF colocan el presupuesto real por encima de los 500,000 millones — la mayoría ejecutado por fideicomisos controlados por la SEDENA (FONATUR/Tren Maya/SEDENA-Bienestar) que publican menos que el COMPRANET civil. En 2023 Animal Político, MCCI y Aristegui Noticias reportaron que a los contratistas del Tren Maya y el AIFA se les exigía canalizar un porcentaje del valor del contrato por empresas intermediarias designadas — un patrón que encaja con el perfil P3 de captura de intermediario de RUBLI. RUBLI no puede verificar esos señalamientos solo con datos de contratación, pero las condiciones estructurales coinciden: adjudicaciones concentradas, proveedores intermediarios, contratación clasificada, visibilidad limitada.",
        ],
        chartConfig: {
          type: 'live',
          live: 'era-sedena',
          chartId: 'era-sedena',
          title: 'SEDENA annual contracting and its share of the federal total, 2015-2025',
          title_es:
            'Contratación anual de la SEDENA y su participación en el total federal, 2015-2025',
        },
        pullquote: {
          quote:
            "SEDENA went from 2.23 percent of federal contracting in 2018 to 5.43 percent in 2024 — 5.1 times its 2015 share. It did not get there every year: 2017 and 2022 both closed below the year before them.",
          quote_es:
            "La SEDENA pasó del 2.23 por ciento de la contratación federal en 2018 al 5.43 por ciento en 2024 — 5.1 veces su participación de 2015. No llegó subiendo todos los años: 2017 y 2022 cerraron por debajo del año anterior.",
          stat: '5.43%',
          statLabel: "SEDENA share of all federal contracted value, 2024",
          statLabel_es: "participación de la SEDENA en el valor contratado federal, 2024",
          barValue: 0.0543,
          barLabel: 'up from 1.07% in 2015 — 5.1x in nine years',
          barLabel_es: 'desde 1.07% en 2015 — 5.1 veces en nueve años',
          vizTemplate: 'mosaic-tile',
        },
        sources: [
          'RUBLI /institutions/384/risk-timeline (SEDENA) over /analysis/year-over-year total_value, 2015-2025. Queried September 2026. 2025 is partial — the federal feed froze 2025-09-28.',
          'RUBLI contracts table, title search for "Tren Maya". Run April 2026; not reproducible through the public contract-list endpoint, which does not filter on title.',
          'DOF. (2019-2024). Decretos clasificando obra pública como de seguridad nacional.',
          'ASF. (2024). Auditorías a Tren Maya y obra militar 2022-2023.',
        ],
      },
      {
        id: 'ch4',
        number: 4,
        title: "Reading the Hot Lines",
        title_es: "Leer las partidas calientes",
        subtitle:
          "The category entries where the risk indicator runs hottest — and who occupies them",
        subtitle_es:
          "Las partidas donde el indicador de riesgo está más alto — y quién las ocupa",
        prose: [
          "Drop from the term column into the line items and the ledger keeps its shape. Of the ten categories AMLO's government contracted most heavily, six carry a higher mean risk indicator than they did under Peña Nieto and four a lower one. Hospital services rose furthest, from 0.238 to 0.282, across 219.4 billion pesos and 32,625 contracts. Road and highway works went from 0.276 to 0.302, laboratory and diagnostics from 0.282 to 0.301, building construction from 0.256 to 0.268. Food and provisions, 129.4 billion pesos across 99,652 contracts, barely moved, from 0.285 to 0.283.",
          "Two different measurements are easy to confuse here, so keep them apart. The chapters above counted contracts: what share of a term's contracts crossed the high-risk line. This chapter scores them instead. The indicator runs from 0 to 1 and says how closely a category's contracts resemble known-bad structures on average, so a 0.369 is not 36.9 percent of anything, and it does not belong on the 2-to-15-percent calibration band, which counts contracts rather than scoring them. The register publishes no high-risk rate per category per term, so this chapter prints none.",
          "The largest line in the book moved furthest. Medicamentos y Farmacéuticos, 403.5 billion pesos across 164,496 contracts, still reads highest of the ten, but it fell from 0.428 under Peña Nieto to 0.369, the largest drop among them. It sits beside the consolidation this story has already described — INSABI, BIRMEX, IMSS-Bienestar — so it is a finding rather than a verdict. Whatever centralization did to pharmaceutical procurement, it did not raise the average structural risk of the line.",
          "Two names sit under these entries, and the register reads both more soberly than the headlines do. Seguridad Alimentaria Mexicana — Segalmex, the subject of what prosecutors have called the largest financial-corruption case of the current government — holds 530 contracts worth 19.71 billion pesos in RUBLI at a mean indicator of 0.423, with 193 contracts scored high-risk. The largest welfare-voucher issuer holds 1,944 contracts worth 51.81 billion pesos across 2013 to 2025, spread over some 290 institutions, two thirds of them won as the only winner. Neither reading can be narrowed to a single administration: the vendor endpoint publishes no per-term split. These vendors match a pattern. RUBLI scores structure, not proven guilt.",
        ],
        prose_es: [
          "Baja de la columna sexenal a las partidas y el libro mantiene su forma. De las diez partidas que más contrató el gobierno de AMLO, seis cargan un indicador de riesgo medio más alto que con Peña Nieto y cuatro uno más bajo. Servicios hospitalarios es la que más subió, de 0.238 a 0.282, sobre 219.4 mil millones de pesos y 32,625 contratos. Caminos y carreteras pasó de 0.276 a 0.302, laboratorio y diagnóstico de 0.282 a 0.301, y construcción de edificios de 0.256 a 0.268. Alimentos y víveres, 129.4 mil millones de pesos en 99,652 contratos, casi no se movió, de 0.285 a 0.283.",
          "Aquí se confunden con facilidad dos mediciones distintas, así que conviene separarlas. Los capítulos anteriores contaban contratos: qué proporción de los contratos de un sexenio cruzó la línea de alto riesgo. Este capítulo los califica. El indicador va de 0 a 1 y dice qué tanto se parecen en promedio los contratos de una partida a estructuras conocidas de riesgo, de modo que un 0.369 no es el 36.9 por ciento de nada, y no pertenece a la banda de calibración de 2 a 15 por ciento, que cuenta contratos en lugar de calificarlos. El registro no publica una tasa de alto riesgo por partida y por sexenio, así que este capítulo no imprime ninguna.",
          "La partida mayor del libro es la que más se movió. Medicamentos y Farmacéuticos, 403.5 mil millones de pesos en 164,496 contratos, sigue siendo la más alta de las diez, pero bajó de 0.428 con Peña Nieto a 0.369, la mayor caída entre ellas. Convive con la centralización que esta historia ya describió —INSABI, BIRMEX, IMSS-Bienestar—, así que es un hallazgo y no un veredicto. Lo que sea que la centralización le haya hecho a la compra de medicamentos, no subió el riesgo estructural promedio de la línea.",
          "Dos nombres viven debajo de estas partidas, y el registro los lee con más sobriedad que los titulares. Seguridad Alimentaria Mexicana —Segalmex, materia de lo que la fiscalía ha llamado el mayor caso de corrupción financiera del gobierno actual— tiene en RUBLI 530 contratos por 19,710 MDP con un indicador medio de 0.423, y 193 contratos calificados de alto riesgo. La mayor emisora de vales del bienestar tiene 1,944 contratos por 51,810 MDP entre 2013 y 2025, repartidos en unas 290 instituciones y dos tercios ganados como único adjudicado. Ninguna de las dos lecturas puede acotarse a un solo sexenio: el endpoint de proveedores no publica un corte por administración. Estos proveedores coinciden con un patrón. RUBLI evalúa la estructura, no culpa probada.",
        ],
        chartConfig: {
          type: 'live',
          live: 'era-categories',
          chartId: 'era-categories',
          title: "The hot lines: risk indicator by category, Peña Nieto → AMLO",
          title_es:
            'Las partidas calientes: indicador de riesgo por partida, Peña Nieto → AMLO',
        },
        pullquote: {
          quote:
            "Six of the ten largest categories of AMLO's term read higher on the risk indicator than they did under Peña Nieto, four lower. The largest of them all moved furthest, and down: pharmaceuticals, 403.5 billion pesos, 0.428 to 0.369.",
          quote_es:
            "Seis de las diez partidas mayores del sexenio de AMLO se leen más alto en el indicador de riesgo que con Peña Nieto, cuatro más bajo. La mayor de todas es la que más se movió, y hacia abajo: medicamentos, 403.5 mil millones de pesos, de 0.428 a 0.369.",
          stat: '0.369',
          statLabel: "mean risk indicator, \"Medicamentos y Farmacéuticos\" under AMLO — highest of the ten largest lines",
          statLabel_es:
            "indicador de riesgo medio, \"Medicamentos y Farmacéuticos\" con AMLO — el más alto de las diez partidas mayores",
          barValue: 0.37,
          barLabel: 'down from 0.428 under Peña Nieto · indicator, not a flagged-contract rate',
          barLabel_es:
            'desde 0.428 con Peña Nieto · indicador, no una tasa de contratos marcados',
          vizTemplate: 'breach-ceiling',
        },
        sources: [
          'RUBLI /categories/sexenio — value, contract count and mean risk indicator per category per administration. Queried 14 October 2026, after the 2026-10-06 category reclassification, the 2026-10-07 keyword correction and the v0.9.1 rescore. The endpoint carries no high-risk rate per category per term.',
          'RUBLI /institutions/3667 (Segalmex) and vendor_stats for the largest welfare-voucher issuer, lifetime readings. Queried 14 October 2026, under v0.9.1; Segalmex high-risk count computed on the register.',
        ],
      },
      {
        id: 'ch5',
        number: 5,
        title: "The Account Still Open",
        title_es: "La cuenta aún abierta",
        subtitle: "Sheinbaum's partial books — and the liabilities carried forward",
        subtitle_es: "Los libros parciales de Sheinbaum — y los pasivos heredados",
        prose: [
          "Seventy-nine point four percent of AMLO's contracts were awarded without a contest — 2.76 trillion pesos of federal contracting, four fifths of it handed out rather than competed for. The rate is a count, not a sum: the register publishes each year's total value but does not split it by procedure type, so no peso figure for direct awards can be built from it. What the count says is enough. That is the hardest line on the inherited balance sheet, and it does not bend easily. The officials who learned to work that way did not retire on October 1, 2024. The vendors who built businesses around AMLO-era programs did not find new customers. Articles 41 and 42 remain on the books, ready to be invoked.",
          "Sheinbaum took office in October 2024. RUBLI holds 92,574 of her contracts at 16.21 percent high-risk — the highest reading of any term. Set the labelled contracts aside and her 11.40 percent still sits above AMLO's 7.84 and Peña Nieto's 6.34, but the account is much too thin to call a trajectory: nine months of a single year, recorded entirely under the register's richest data structure, against terms of six. The architecture she inherited is not thin, though, and three liabilities carry forward like unamortized obligations: pharmaceutical procurement under IMSS-Bienestar, where the 2025 consolidated medicine tender awarded 19.46 billion pesos to PISA in a single year; welfare logistics through voucher operators, one issuer's 51.81 billion pesos of lifetime contracting among them; and civilian infrastructure absorbed by SEDENA under national-security cover.",
          "Beneath all five columns runs one institutional argument. The OECD's 2023 framework for measuring procurement performance argues for analytical capacity built into oversight rather than bolted on after the fiscal year closes. RUBLI is a working version of it: ASF audits the previous fiscal year each spring; RUBLI's pipeline updates monthly. That gap — between real-time visibility and formal accountability — is what a tool like RUBLI is built to narrow. Whether the fifth term operationalizes that visibility, or becomes the fifth administration to promise transparency while direct-award dependency climbs, is a verdict the open account will return one quarter at a time.",
        ],
        prose_es: [
          "El 79.4 por ciento de los contratos de AMLO se adjudicó sin concurso — 2.76 billones de pesos de contratación federal, cuatro quintas partes entregadas en lugar de competidas. La tasa es un conteo, no una suma: el registro publica el valor total de cada año pero no lo separa por tipo de procedimiento, así que ninguna cifra en pesos de adjudicación directa puede construirse desde él. Con el conteo basta. Esa es la línea más dura del balance heredado, y no se dobla fácilmente. Los funcionarios que aprendieron a trabajar así no se jubilaron el 1 de octubre de 2024. Los proveedores que armaron negocios alrededor de los programas de la era AMLO no encontraron nuevos clientes. Los Artículos 41 y 42 siguen en los libros, listos para invocarse.",
          "Sheinbaum tomó posesión en octubre de 2024. RUBLI tiene 92,574 de sus contratos con 16.21 por ciento de alto riesgo — la lectura más alta de cualquier sexenio. Sin los contratos etiquetados, su 11.40 por ciento sigue por encima del 7.84 de AMLO y del 6.34 de Peña Nieto, pero la cuenta es demasiado delgada para llamarla trayectoria: nueve meses de un solo año, registrados por completo con la estructura de datos más rica del registro, contra mandatos de seis. La arquitectura que heredó no es delgada, en cambio, y tres pasivos se arrastran como obligaciones no amortizadas: la contratación farmacéutica bajo IMSS-Bienestar, donde la licitación consolidada de medicamentos de 2025 adjudicó 19.46 mil millones de pesos a PISA en un solo año; la logística del bienestar vía operadores de vales, entre ellos los 51.81 mil millones de pesos de contratación histórica de una sola emisora; y la infraestructura civil absorbida por la SEDENA bajo cobertura de seguridad nacional.",
          "Por debajo de las cinco columnas corre un solo argumento institucional. El marco de la OCDE de 2023 para medir el desempeño en contratación pública defiende una capacidad analítica integrada en la supervisión, no añadida cuando el ejercicio fiscal ya cerró. RUBLI es una versión funcional de eso: la ASF audita el año fiscal anterior cada primavera; el proceso de RUBLI se actualiza cada mes. Esa brecha —entre la visibilidad en tiempo real y la rendición de cuentas formal— es la que una herramienta como RUBLI busca estrechar. Si el quinto sexenio pone esa visibilidad en operación, o se vuelve la quinta administración en prometer transparencia mientras la dependencia de la adjudicación directa sigue subiendo, es un veredicto que la cuenta abierta devolverá trimestre a trimestre.",
        ],
        chartConfig: {
          type: 'live',
          live: 'era-years',
          chartId: 'era-years',
          title: 'The annual high-risk rate, 2002-2025, and the five terms that divide it',
          title_es: 'La tasa anual de alto riesgo, 2002-2025, y los cinco sexenios que la dividen',
        },
        pullquote: {
          quote:
            "Four fifths of AMLO's contracts were awarded without a contest. The officials, the vendors, and the legal exceptions all carried over October 1, 2024. The hardest line on the inherited balance sheet does not bend easily.",
          quote_es:
            "Cuatro quintas partes de los contratos de AMLO se adjudicaron sin concurso. Los funcionarios, los proveedores y las excepciones legales se heredaron todos el 1 de octubre de 2024. La línea más dura de la hoja de balance heredada no se dobla fácilmente.",
          stat: '79.4%',
          statLabel: "AMLO direct-award rate — the liability carried into the open account",
          statLabel_es:
            "tasa de adjudicación directa de AMLO — el pasivo heredado a la cuenta abierta",
          barValue: 0.794,
          barLabel: 'a share of contracts — the register does not split value by procedure type',
          barLabel_es:
            'proporción de contratos — el registro no separa el valor por tipo de procedimiento',
          vizTemplate: 'breach-ceiling',
        },
        sources: [
          'RUBLI /analysis/year-over-year — the annual high-risk rate 2002-2025 and the per-term rollups. Queried 14 October 2026, under v0.9.1. 2025 holds 92,574 contracts and is partial: the federal feed froze 2025-09-28.',
          'OECD (2023). Public procurement performance: A framework for measuring efficiency, compliance and strategic goals. OECD Public Governance Policy Papers No. 36.',
        ],
      },
    ],
    relatedSlugs: ['marea-de-adjudicaciones', 'la-ilusion-competitiva', 'el-gran-precio'],
    lensTags: {
      patterns: ['P3', 'P5', 'P6'],
      sectors: ['salud', 'defensa'],
      years: [2019, 2020, 2024],
      terms: ['AMLO', 'SEDENA', 'Tren Maya', 'vales', 'Segalmex'],
    },
    nextSteps: [
      'Request from ASF the audit coverage rate for AMLO-era emergency procurement contracts in health and infrastructure.',
      "Analyze BIRMEX and INSABI contracts 2019-2022 for vendor overlap with RUBLI's P1 and P6 pattern vendors.",
      'Track Sheinbaum administration procurement risk scores quarterly using COMPRANET data — RUBLI can update in real time.',
      'Cross-reference AMLO-era direct-award contracts above 500M MXN against the SFP sanctions registry and the SAT EFOS list.',
      'Compile a comprehensive list of the top 1,000 AMLO-era contracts by RUBLI risk score, with procurement institution and approving unit identified.',
      'Pursue academic research collaboration with CIDE, COLMEX, or UNAM to publish a peer-reviewed analysis of the Fox-to-AMLO risk trajectory.',
    ],
    nextSteps_es: [
      'Solicitar a la ASF la tasa de cobertura de auditoría de los contratos de emergencia del sexenio de AMLO en salud e infraestructura.',
      'Analizar contratos de BIRMEX e INSABI 2019-2022 para identificar proveedores que también aparezcan en las listas P1 y P6 de RUBLI.',
      'Dar seguimiento trimestral a los puntajes de riesgo del gobierno de Sheinbaum usando datos de COMPRANET — RUBLI puede actualizar en tiempo real.',
      'Cruzar los contratos de adjudicación directa superiores a 500M MXN del sexenio de AMLO contra el registro de sanciones de la SFP y la lista EFOS del SAT.',
      'Compilar la lista de los 1,000 contratos del sexenio de AMLO con mayor puntaje de riesgo RUBLI, identificando la institución compradora y la unidad aprobadora.',
      'Buscar colaboración académica con CIDE, COLMEX o UNAM para publicar un análisis arbitrado de la trayectoria de riesgo del sexenio de Fox al de AMLO.',
    ],
    entities: [
    ],
  },

  // === STORY 8: Follow the Middleman ===
  {
    slug: 'la-industria-del-intermediario',
    outlet: 'investigative',
    type: 'thematic',
    era: 'cross',
    headline: "Follow the Middleman",
    headline_es: "Sigan al intermediario",
    subheadline:
      "RUBLI's P3 algorithm flags 2,537 vendors as matching the pass-through signature: a burst of very large contracts inside a window of at most three years, and then nothing. Together they hold 448.8 billion pesos, three quarters of it in infrastructure, energy and health. But the pattern's biggest names are not its best leads. More than a third of the money at the top of the list has already been reviewed and ruled out, because a megaproject contractor produces the same burst as a shell. The unambiguous cases sit further down — and 2,306 of the 2,537 have never been opened at all.",
    subheadline_es:
      "El algoritmo P3 de RUBLI marca a 2,537 proveedores por coincidir con la firma de paso: una ráfaga de contratos muy grandes dentro de una ventana de a lo más tres años, y después nada. Juntos acumulan 448.8 mil millones de pesos, tres cuartas partes en infraestructura, energía y salud. Pero los nombres mayores del patrón no son sus mejores pistas. Más de una tercera parte del dinero de la cima de la lista ya fue revisado y descartado, porque un contratista de megaproyecto produce la misma ráfaga que una fachada. Los casos inequívocos están más abajo — y 2,306 de los 2,537 no se han abierto nunca.",
    byline: 'RUBLI Investigative Data Unit',
    estimatedMinutes: 14,
    status: 'solo_datos',
    leadStat: {
      value: '2,537',
      label: "vendors matching the P3 pass-through signature",
      label_es: "proveedores que coinciden con la firma de paso P3",
      sublabel: "448.8B MXN across all 12 sectors",
      sublabel_es: "448,800 millones de pesos en los 12 sectores",
      color: '#8b5cf6',
    },
    kickerStats: [
      {
        value: '2,537',
        suffix: "pass-through-pattern vendors",
        suffix_es: "proveedores con patrón de paso",
        tone: 'data',
      },
      {
        value: '448.8B MXN',
        suffix: "MXN held by the pattern, 12 sectors",
        suffix_es: "MXN en manos del patrón, 12 sectores",
        tone: 'critical',
      },
      {
        value: '2,306',
        suffix: "of them with no review disposition",
        suffix_es: "de ellos sin disposición de revisión",
        tone: 'critical',
      },
    ],
    relatedSlugs: ['el-ejercito-fantasma', 'captura-institucional', 'el-umbral-de-los-300k'],
    corrections: [
      "2026-10-14 — RUBLI retrained its risk model (v0.8.5 to v0.9.1) and re-ran ARIA on 13 October 2026; every queue figure in this story is restated on that run, as RUBLI's public queue shows it (private individuals, public entities and vendors cleared on review are left out). The pass-through pattern now lists 2,537 vendors holding 448.8 billion pesos, not 2,972 with 556.5 billion; 2,306 have never been opened, not 2,691. The Tier-1 band holds four vendors, not thirteen, and all four have disappeared and sit in RUBLI's ground truth. Six of the thirty-six largest vendors have been ruled out, holding more than a third of their money — not more than half — and only the first of the two largest has been cleared.",
    ],
    corrections_es: [
      "2026-10-14 — RUBLI reentrenó su modelo de riesgo (de v0.8.5 a v0.9.1) y volvió a correr ARIA el 13 de octubre de 2026; cada cifra de la fila en esta historia se reexpresa con esa corrida, tal como la muestra la fila pública de RUBLI (que deja fuera a personas físicas, entidades públicas y proveedores descartados en revisión). El patrón de paso lista ahora a 2,537 proveedores con 448,800 millones de pesos, no a 2,972 con 556,500 millones; 2,306 no se han abierto nunca, no 2,691. La banda del nivel 1 tiene cuatro proveedores, no trece, y los cuatro desaparecieron y están en la verdad-base de RUBLI. Seis de los treinta y seis proveedores mayores fueron descartados y concentran más de una tercera parte de su dinero — no más de la mitad — y de los dos mayores solo el primero fue descartado.",
    ],
    caseIds: [],
    lensTags: {
      patterns: ['P3'],
      sectors: ['infraestructura', 'energia', 'salud'],
      terms: ['intermediario', 'La Estafa Maestra', 'subcontratación'],
    },
    entities: [
      {
        type: 'institution',
        id: 146,
        name: 'COMPAÑÍA MEXICANA DE EXPLORACIONES, S.A. DE C.V.',
        role: 'The buyer on both of those contracts',
        role_es: 'El comprador de esos dos contratos',
      },
      {
        type: 'vendor',
        id: 267977,
        name: 'PNPDMI SA DE CV',
        riskScore: 0.5212,
        ariaTier: 1,
        role: 'Marked confirmed in RUBLI internal review (no public ruling) — 1.4B through SEGALMEX in a single year',
        role_es: 'Marcado como confirmado en la revisión interna de RUBLI (sin resolución pública) — 1,400 millones de pesos vía SEGALMEX en un solo año',
      },
      {
        type: 'institution',
        id: 251,
        name: 'INSTITUTO MEXICANO DEL SEGURO SOCIAL',
        role: 'Largest address for the pattern by vendor count — 284 P3 vendors',
        role_es: 'Primera dirección del patrón por número de proveedores — 284 proveedores P3',
      },
    ],
    nextSteps: [
      'File UIF intelligence request for bank transaction data on the top 20 P3-classified vendors in infrastructure by contract value.',
      'Identify which public universities continue to be used as procurement intermediaries after La Estafa Maestra — cross-reference with COMPRANET university contracts 2018-2025.',
      'Request from SFP the complete list of vendors sanctioned for improper subcontracting and cross-reference with RUBLI P3 list.',
      "Research whether Mexico's 2022 procurement law reform addressed the university subcontracting carve-out that enabled La Estafa Maestra.",
      'Open a journalistic investigation of the top 5 P3 vendors in infrastructure — interview actual subcontractors to identify the price spreads.',
      'File COFECE complaint requesting dedicated investigation of intermediary patterns in public works procurement.',
    ],
    nextSteps_es: [
      'Presentar solicitud de inteligencia financiera a la UIF para datos de transacciones bancarias de los 20 proveedores P3 de mayor valor en infraestructura.',
      'Identificar qué universidades públicas siguen siendo utilizadas como intermediarias de compras después de La Estafa Maestra — cruzar con contratos universitarios en COMPRANET 2018-2025.',
      'Solicitar a la SFP la lista completa de proveedores sancionados por subcontratación indebida y cruzar con la lista P3 de RUBLI.',
      'Investigar si la reforma a la ley de contrataciones de 2022 atendió el vacío legal de subcontratación universitaria que hizo posible La Estafa Maestra.',
      'Abrir una investigación periodística sobre los 5 principales proveedores P3 en infraestructura — entrevistar a subcontratistas reales para identificar los márgenes de precio.',
      'Presentar denuncia ante la COFECE solicitando una investigación dedicada a los patrones de intermediarismo en la obra pública.',
    ],
    chapters: [
      {
        id: 'ch1',
        number: 1,
        title: "The Peso and the Broker",
        title_es: "El peso y el intermediario",
        subtitle: "Three signals describe a firm built to do nothing",
        subtitle_es: "Tres señales describen una firma hecha para no hacer nada",
        prose: [
          "A peso leaves the federal treasury as a contract payment and lands in a company's account. The company subcontracts the actual work — the road, the hospital wing, the oilfield service — to another firm for less. The difference stays behind. That spread is the entire business. The company built nothing, shipped nothing, and produced only a contract.",
          "Not every middleman is a problem. A distributor with real supply chains can deliver goods cheaper than the factory; a general contractor coordinating dozens of trades earns its fee. The fraud variant is narrower: the intermediary adds no value beyond the act of contracting, yet the government pays more than it would have paid the firm that does the work. The mechanism survives a single-contract audit and runs at scale for decades.",
          "RUBLI's Pattern 3 does not look for a business model. It looks for a burst. The algorithm takes every vendor whose entire contracting life fits inside three years and scores it on six terms. Three are about the money: how far its value per contract runs above its sector's median, how fast the contracts arrived, and whether established suppliers were already selling the same thing to the same buyer. Three are about the clock: how short the window was, whether the vendor has stopped contracting altogether, and how new its tax registration was when the first contract landed. Score above 0.50 and the vendor is filed under P3. Not one of the six is evidence of anything. Together they describe a shape: arrive, win big, disappear.",
          "The shape repeats 2,537 times, and it gathers where the contracts are largest. Infrastructure leads with 969 flagged vendors holding 172.4 billion pesos. Energy follows at 366 vendors and 85.9 billion, health at 429 and 76.9 billion. Those three hold 335.2 billion between them, three quarters of everything the pattern touches, and the remaining nine sectors divide the rest. But the ranking by money and the ranking by density are not the same list. Infrastructure's 172.4 billion is 14.9 per cent of everything ARIA flags in that sector; health's 76.9 billion is 3.6 per cent of a far larger flagged base. Where the pattern is thickest is not where it is biggest.",
        ],
        prose_es: [
          "Un peso sale de la Tesorería federal como pago de un contrato y aterriza en la cuenta de una empresa. La empresa subcontrata el trabajo real — la carretera, el ala del hospital, el servicio petrolero — con otra firma a un precio menor. La diferencia se queda en medio. Esa diferencia es todo el negocio. La empresa no construyó nada, no entregó nada y solo produjo un contrato.",
          "No todo intermediario es un problema. Un distribuidor con cadenas de suministro reales entrega bienes más baratos que la fábrica; un contratista general que coordina decenas de oficios se gana su comisión. La variante de fraude es más estrecha: el intermediario no agrega valor más allá del acto de contratar, y aun así el gobierno paga más de lo que habría pagado a la firma que ejecuta. El mecanismo sobrevive a una auditoría contrato por contrato y opera a escala durante décadas.",
          "El Patrón 3 de RUBLI no busca un modelo de negocio. Busca una ráfaga. El algoritmo toma a cada proveedor cuya vida entera de contratación cabe en tres años y lo califica con seis factores: cuánto se eleva su valor por contrato sobre la mediana de su sector, qué tan rápido llegaron los contratos, si dejó de contratar por completo, si había proveedores establecidos vendiéndole ya lo mismo al mismo comprador, qué tan corto fue el lapso y qué tan nuevo era el registro fiscal cuando cayó el primer contrato. Arriba de 0.50, el proveedor queda archivado como P3. Ninguno de los seis prueba nada por sí solo. Juntos describen una forma: llegar, ganar en grande, desaparecer.",
          "La forma se repite 2,537 veces, y se junta donde los contratos son más grandes. Infraestructura encabeza con 969 proveedores marcados que acumulan 172.4 mil millones de pesos. Energía sigue con 366 proveedores y 85.9 mil millones; salud con 429 y 76.9 mil millones. Esos tres acumulan 335.2 mil millones entre los tres, tres cuartas partes de todo lo que el patrón toca, y los otros nueve sectores se reparten el resto. Pero el orden por dinero y el orden por densidad no son la misma lista. Los 172.4 mil millones de infraestructura son 14.9 por ciento de todo lo que ARIA marca en ese sector; los 76.9 mil millones de salud son 3.6 por ciento de una base marcada mucho mayor. Donde el patrón es más espeso no es donde es más grande.",
        ],
        chartConfig: {
          type: 'live',
          live: 'p3-sectors',
          scrolly: true,
          title: 'Where the pass-through pattern puts its money',
          title_es: 'Dónde pone su dinero el patrón de paso',
          chartId: 'p3-sectors',
        },
        pullquote: {
          quote:
            "A peso enters, a peso leaves, and a firm in between produces only a contract. The shape repeats 2,537 times, and three sectors carry 335.2 billion pesos of the contracting it holds.",
          quote_es:
            "Entra un peso, sale un peso, y una firma en medio solo produce un contrato. La forma se repite 2,537 veces, y tres sectores cargan 335.2 mil millones de pesos de la contratación que acumula.",
          stat: '335.2B MXN',
          statLabel: "P3 contracting in infrastructure + energy + health",
          statLabel_es: "contratación P3 en infraestructura + energía + salud",
          barValue: 0.747,
          barLabel: 'share of all P3-pattern contracting',
          barLabel_es: 'porción de toda la contratación con patrón P3',
          vizTemplate: 'breach-ceiling',
        },
        sources: [
          'RUBLI ARIA queue, primary_pattern = P3, grouped by primary sector. Live at /aria/patterns/P3/institutions?group=sector.',
          'RUBLI ARIA specification § Module 3 — single-use intermediary detection, burst-score terms and weights.',
          'COMPRANET procurement records, sector classification via RUBLI 12-sector taxonomy.',
        ],
      },
      {
        id: 'ch2',
        number: 2,
        title: "The Channels the Money Runs Through",
        title_es: "Los canales por donde corre el dinero",
        subtitle: "Where the broker layer is thickest",
        subtitle_es: "Dónde es más espesa la capa de intermediación",
        prose: [
          "Sectors say what is being bought; addresses say who is buying. Rank the pattern's vendors by the buyer each one sends most of its work to, and three names sit far above the rest: the Secretaría de Comunicaciones y Transportes, where 268 flagged vendors hold 80.2 billion pesos; PEMEX, with 255 vendors and 48.2 billion; IMSS, with 284 and 45.4 billion. Between them those three anchor 807 flagged vendors and 173.8 billion pesos. Then the step down is steep — ISSSTE at 20.9 billion, IMSS-Bienestar at 15.4, CONAGUA at 15.4 — and the tail runs out through state governments and small federal buyers.",
          "Read the direction before reading the numbers, because it runs the opposite way to the obvious one. For each flagged vendor the register records the buyer it sends most of its own contracting to, and what share of its work that is. A row's value is therefore the lifetime contracting of the vendors anchored at that address, not a slice of that address's budget: 80.2 billion pesos of SCT-anchored contracting is a fact about the vendors, not about the ministry. The channel figures below are those two fields multiplied — an estimate, printed beside both of its factors, not a summed contract ledger.",
          "What the spread looks like depends on the sector. In infrastructure the intermediary subcontracts the civil work to firms that own the plant, and the overhead disappears into a road that uses dozens of trades, so the margin reads as coordination. In energy it rides on imported equipment and specialist services priced through a local partner, where a genuine localisation cost and pure rent are indistinguishable on the face of the contract. In health it is the easiest to test: the manufacturers are globally known and their direct-to-government prices are published elsewhere, so a benchmark exists.",
          "None of this is illegal by itself. Article 5 of the Ley de Obras Públicas permits subcontracting outright, and the public register stops at the first contract: the federal payment to the intermediary is published, the intermediary's payment to whoever did the work is not. That is the structural limit on every number in this story. The pattern can say who occupies the middle position. It cannot say what the middle position cost.",
        ],
        prose_es: [
          "Los sectores dicen qué se compra; las direcciones dicen quién compra. Si se ordena a los proveedores del patrón por el comprador al que cada uno manda casi todo su trabajo, tres nombres quedan muy por encima del resto: la Secretaría de Comunicaciones y Transportes, donde 268 proveedores marcados acumulan 80,200 millones de pesos; PEMEX, con 255 proveedores y 48,200 millones; el IMSS, con 284 y 45,400 millones. Entre los tres anclan 807 proveedores marcados y 173,800 millones de pesos. Después el escalón cae fuerte — el ISSSTE con 20,900 millones, el IMSS-Bienestar con 15,400, la CONAGUA con 15,400 — y la fila se deshilacha entre gobiernos estatales y compradores federales chicos.",
          "Conviene leer la flecha antes de leer las cifras. De cada proveedor marcado el padrón registra el comprador al que manda la mayor parte de su propia contratación, y qué porción de su trabajo es esa. El valor de una fila es entonces la contratación acumulada de los proveedores anclados en esa dirección, no una tajada del presupuesto de esa dirección: 80,200 millones anclados en la SCT son un dato sobre los proveedores, no sobre la Secretaría. Las cifras de canal de abajo son esos dos campos multiplicados — una estimación, impresa junto a sus dos factores, no una suma contrato por contrato.",
          "Cómo se ve el margen depende del sector. En infraestructura el intermediario subcontrata la obra civil con firmas que sí tienen la maquinaria, y el sobrecosto se pierde dentro de una carretera que ocupa decenas de oficios, así que el margen se lee como coordinación. En energía viaja sobre equipo importado y servicios especializados cotizados a través de un socio local, donde un costo legítimo de localización y la renta pura son indistinguibles a simple vista en el contrato. En salud es el más fácil de medir y aun así el más difícil de probar: los fabricantes son conocidos en todo el mundo y sus precios de venta directa a gobiernos se publican en otras partes, así que el referente existe.",
          "Nada de esto es ilegal por sí mismo. El Art. 5 de la Ley de Obras Públicas permite subcontratar de forma expresa, y el registro público se detiene en el primer contrato: el pago federal al intermediario se publica; el pago del intermediario a quien hizo el trabajo, no. Ese es el límite estructural de cada cifra de esta historia. El patrón puede decir quién ocupa la posición intermedia. No puede decir cuánto costó esa posición.",
        ],
        chartConfig: {
          type: 'live',
          live: 'p3-flows',
          title: 'One buyer, one broker: the largest channel at each address',
          title_es: 'Un comprador, un intermediario: el canal mayor en cada dirección',
          chartId: 'p3-flows',
        },
        pullquote: {
          quote:
            "A transport ministry, a health institute and an oil company. Between them, three addresses anchor 807 of the pattern's flagged vendors and 173.8 billion pesos of contracting.",
          quote_es:
            "Una secretaría de transportes, un instituto de salud y una petrolera. Esas tres direcciones anclan 807 de los proveedores marcados del patrón y 173,800 millones de pesos de contratación.",
          stat: '173.8B MXN',
          statLabel: "anchored at SCT, IMSS and PEMEX",
          statLabel_es: "anclados en la SCT, el IMSS y PEMEX",
        },
        sources: [
          'RUBLI ARIA queue, primary_pattern = P3, grouped by top_institution. Live at /aria/patterns/P3/institutions.',
          'Ley de Obras Públicas y Servicios Relacionados con las Mismas (LOPSRM), Art. 5 — subcontracting provisions.',
        ],
      },
      {
        id: 'ch3',
        number: 3,
        title: "Where the Margin Is Skimmed",
        title_es: "Donde se descrema el margen",
        subtitle: "The ticket, the prototype, and what review actually found",
        subtitle_es: "El ticket, el prototipo y lo que la revisión encontró en realidad",
        prose: [
          "The flow becomes a number: the ticket, a vendor's total contracting divided by the number of contracts it took to collect it. In 2014 a single consulting firm won two contracts from Compañía Mexicana de Exploraciones, the Pemex-group survey company, both described as specialised services. One was a public tender; the other was a direct award. Together they came to 6.31 billion pesos — an average ticket of 3.15 billion, around 504 times the average energy-sector contract, and just under a quarter of everything COMESA has recorded in its entire history. The firm never contracted again. ARIA files it at Tier 1 with a P3 confidence of 0.79, and RUBLI's ground truth already holds it.",
          "It is the largest ticket in the pattern's priority band — Tier 1, the top of RUBLI's investigation queue — and the band is small: four vendors out of 2,537. What those four share is not size but shape. All four have disappeared, with no federal contract for at least two years. All four ran their entire contracting life inside two years or less. And every one already sits in RUBLI's ground truth, the library of cases someone else has already documented. That is the strongest thing that can be said about a lead and the weakest thing that can be said about the pattern: at Tier 1 the algorithm is re-finding cases investigators had already found, not turning up new ones.",
          "The structure has a documented prototype. La Estafa Maestra ran eleven federal agencies through public universities, which subcontracted to shell companies, which returned the money to the officials who had sent it. Animal Político and MCCI documented 7.67 billion pesos moving through it across 2013 and 2014. It worked because Article 1 of the Ley de Adquisiciones exempted contracts with public universities from competitive bidding. The case ended in acquittal: the minister at its centre was detained in 2019 and cleared by the Supreme Court in 2024. Not one conviction came out of it.",
          "Which is why the top of the P3 list has to be read slowly. Rank the pattern's largest vendors by value and the first has been reviewed and ruled out; so have six of the thirty-six largest, holding more than a third of their money between them. These are not data-entry errors. They are megaproject contractors and specialist oilfield firms whose two or three enormous contracts inside a single year produce exactly the burst the algorithm is built to notice. The pattern cannot separate a firm that won a refinery from a firm that won nothing and sold the contract onward. Only a reviewer can — and reviewers have reached 231 of 2,537.",
        ],
        prose_es: [
          "El flujo se vuelve un número: el monto por contrato, la contratación total de un proveedor dividida entre el número de contratos que le tomó juntarla. En 2014 una sola firma de consultoría ganó dos contratos de la Compañía Mexicana de Exploraciones, la empresa de prospección del grupo Pemex, los dos descritos como servicios especializados. Uno fue licitación pública; el otro, adjudicación directa. Juntos sumaron 6,310 millones de pesos — un promedio de 3,150 millones por contrato, alrededor de 504 veces el contrato promedio del sector energía, y poco menos de una cuarta parte de todo lo que COMESA ha registrado en su historia. La firma no volvió a contratar. ARIA la archiva en el nivel 1 con una confianza P3 de 0.79, y la base de casos etiquetados de RUBLI ya la tiene.",
          "Es el mayor ticket de la banda prioritaria del patrón — el nivel 1, la cima de la fila de investigación de RUBLI — y la banda es chica: cuatro proveedores de 2,537. Lo que comparten esos cuatro no es el tamaño sino la forma. Los cuatro desaparecieron, sin contrato federal desde hace al menos dos años. Los cuatro corrieron toda su vida de contratación en dos años o menos. Y todos, sin excepción, ya están en la verdad-base de RUBLI, la biblioteca de casos que alguien más ya documentó. Eso es lo más fuerte que puede decirse de una pista y lo más débil que puede decirse del patrón: en el nivel 1 el algoritmo está reencontrando casos que los investigadores ya habían encontrado, no destapando nuevos.",
          "La estructura tiene un prototipo documentado. La Estafa Maestra pasó once dependencias federales por universidades públicas, que subcontrataban con empresas fachada, que devolvían el dinero a los funcionarios que lo habían mandado. Animal Político y MCCI documentaron 7.67 mil millones de pesos moviéndose por ahí entre 2013 y 2014. Funcionó porque el Art. 1 de la Ley de Adquisiciones eximía de licitación competitiva a los contratos con universidades públicas. El caso terminó en absolución: la secretaria en su centro fue detenida en 2019 y absuelta por la Suprema Corte en 2024. No salió de ahí una sola condena.",
          "Por eso la cima de la lista P3 hay que leerla despacio. Ordenados los proveedores mayores del patrón por valor, el primero ya fue revisado y descartado; también seis de los treinta y seis mayores, que entre ellos concentran más de una tercera parte de su dinero. No son errores de captura. Son contratistas de megaproyecto y firmas especializadas de servicios petroleros cuyos dos o tres contratos enormes dentro de un mismo año producen exactamente la ráfaga que el algoritmo está hecho para notar. El patrón no puede separar a una firma que ganó una refinería de una firma que no ganó nada y revendió el contrato. Solo un revisor puede — y los revisores han llegado a 231 de 2,537.",
        ],
        chartConfig: {
          type: 'live',
          live: 'p3-ticket',
          live2: 'p3-file',
          title: 'What one contract is worth to a Tier-1 broker',
          title_es: 'Cuánto vale un solo contrato para un intermediario de nivel 1',
          chartId: 'p3-ticket',
        },
        pullquote: {
          quote:
            "Two contracts for specialised services, 6.31 billion pesos, one buyer, one year — and then the firm stops appearing in the record at all.",
          quote_es:
            "Dos contratos por servicios especializados, 6.31 mil millones de pesos, un comprador, un año — y después la firma deja de aparecer en el registro.",
          stat: '504×',
          statLabel: "the average energy-sector contract, in one broker's ticket",
          statLabel_es: "el contrato promedio del sector energía, en el ticket de un intermediario",
        },
        sources: [
          'RUBLI ARIA queue, primary_pattern = P3, ips_tier = 1. Live at /aria/queue?pattern=P3&tier=1.',
          'RUBLI sector statistics — avg_contract_value per sector, all years. Live at /sectors.',
          'Animal Político / MCCI. (2017). La Estafa Maestra: Graduados en desaparecer dinero público.',
          'Suprema Corte de Justicia de la Nación (2024) — acquittal in the La Estafa Maestra prosecution.',
        ],
      },
      {
        id: 'ch4',
        number: 4,
        title: "Where It Lands",
        title_es: "Dónde aterriza",
        subtitle: "The flow dead-ends in an enforcement void",
        subtitle_es: "El flujo termina en un vacío de fiscalización",
        prose: [
          "Follow the peso to its destination and it dead-ends. Subcontracting is legal; the crime, if there is one, lives in the spread, and the spread lives in bank records no one has subpoenaed. Proving inflation, laundering, or rigged competition means tracing money through multiple corporate structures — forensic work Mexican agencies rarely complete at scale.",
          "The tools exist but sit idle. The UIF has jurisdiction over money-laundering flows but does not monitor procurement payment chains, and it already drowns under roughly 20,000 suspicious-activity reports a year across the whole economy. Mexico ratified the UN Convention Against Corruption in 2004, committing to criminalize 'abuse of functions' — broad enough to cover systematic overpriced intermediation — yet that provision has never been applied to procurement at scale.",
          "The void has a precise shape, and the shape is made of mandates. The UIF traces flows, not payment chains. The SFP audits procurement units and the officials inside them. The ASF audits individual contracts, not the aggregate density of one pattern across a sector. The one body with jurisdiction over anticompetitive procurement is COFECE, whose docket runs to telecoms, banking and retail. Even if it took the case, the statute may not fit: Article 53 of the competition law requires proof of coordination between competing bidders, and a pure pass-through, bidding against no one, may fall outside it altogether.",
          "That is the mismatch the data exposes. Mexico's architecture targets one contract, one bribe, one official; the pattern runs at the scale of 2,537 vendors and 448.8 billion pesos. The pre-filter that could change the arithmetic is already built, and largely unread: 231 of those vendors carry any review disposition at all, 5 have been confirmed, and 2,306 have never been opened. The list names them and asks the same three questions of each — who did the actual work, what was the spread, and was that spread coordination or rent. Until someone answers them, the answer stays where the register cannot reach it.",
        ],
        prose_es: [
          "Si se sigue el peso hasta su destino, se topa con un muro. Subcontratar es legal; el delito, si lo hay, vive en la diferencia, y la diferencia vive en estados de cuenta que nadie ha requerido. Probar sobreprecio, lavado o competencia amañada significa rastrear el dinero por varias estructuras corporativas — trabajo forense que las dependencias mexicanas rara vez completan a escala.",
          "Las herramientas existen pero permanecen ociosas. La UIF tiene jurisdicción sobre flujos de lavado pero no monitorea las cadenas de pago de la contratación, y ya se ahoga bajo unos 20,000 reportes de actividad sospechosa al año en toda la economía. México ratificó la Convención de las Naciones Unidas contra la Corrupción en 2004, comprometiéndose a tipificar el 'abuso de funciones' — categoría amplia para cubrir la intermediación sistemática con sobreprecio — y aun así esa disposición nunca se ha aplicado a la contratación a escala.",
          "El vacío tiene una forma precisa, y esa forma está hecha de mandatos. La UIF rastrea flujos, no cadenas de pago. La SFP audita unidades compradoras y a los funcionarios que están dentro. La ASF audita contratos individuales, no la densidad agregada de un patrón a lo largo de un sector. El único organismo con jurisdicción sobre la contratación anticompetitiva es la COFECE, cuya agenda va de telecom a banca y comercio. Aun si tomara el caso, la ley puede no encajar: el Art. 53 de la ley de competencia exige prueba de coordinación entre licitantes competidores, y una estructura pura de paso, que no licita contra nadie, puede quedar por completo fuera.",
          "Ese es el desajuste que los datos exponen. La arquitectura mexicana ataca un contrato, un soborno, un funcionario; el patrón corre a escala de 2,537 proveedores y 448.8 mil millones de pesos. El pre-filtro que podría cambiar la cuenta ya está construido, y en buena medida sin leer: 231 de esos proveedores llevan alguna disposición de revisión, 5 quedaron confirmados y 2,306 no se han abierto nunca. La lista los nombra y le hace a cada uno las mismas tres preguntas — quién hizo el trabajo, cuál fue la diferencia y si esa diferencia fue coordinación o renta. Hasta que alguien las responda, la respuesta se queda donde el padrón no alcanza.",
        ],
        chartConfig: {
          type: 'live',
          live: 'p3-queue',
          title: 'The cohort, and everything anyone has done with it',
          title_es: 'La cohorte, y todo lo que alguien ha hecho con ella',
          chartId: 'p3-queue',
        },
        pullquote: {
          quote:
            "Mexico's architecture targets one contract, one bribe, one official. The pattern runs at the scale of 2,537 vendors — and 2,306 of them have never been opened.",
          quote_es:
            "La arquitectura mexicana ataca un contrato, un soborno, un funcionario. El patrón corre a escala de 2,537 proveedores — y 2,306 de ellos no se han abierto nunca.",
          stat: '2,306',
          statLabel: "P3 vendors with no review disposition",
          statLabel_es: "proveedores P3 sin disposición de revisión",
          barValue: 0.905,
          barLabel: 'of the cohort, never opened',
          barLabel_es: 'de la cohorte, nunca abiertos',
          vizTemplate: 'mosaic-tile',
        },
        sources: [
          'RUBLI ARIA queue cohort, primary_pattern = P3 — review dispositions and tier split. Live at /aria/patterns/P3/institutions.',
          'UNODC. (2012). Legislative Guide for the Implementation of the United Nations Convention against Corruption (2nd rev. ed.). Article 19 (abuse of functions).',
          'UIF/SHCP. (2024). Informe Anual de Actividades 2024.',
          'OECD (2023). Public procurement performance: A framework for measuring efficiency, compliance and strategic goals. OECD Public Governance Policy Papers No. 36.',
          'Ley Federal de Competencia Económica, Art. 53 (prácticas monopólicas absolutas).',
        ],
      },
    ],
  },

  // === STORY 9: The Prices That End in Zeros ===
  {
    slug: 'el-umbral-de-los-300k',
    outlet: 'data_analysis',
    type: 'thematic',
    era: 'cross',
    headline: "The Prices That End in Zeros",
    headline_es: "Los precios que terminan en ceros",
    subheadline:
      "22,263 federal contracts between 200,000 and 400,000 pesos are written on an exact multiple of ten thousand — a figure a market almost never produces on its own. Every one of those twenty values stands three to twenty-nine times above the thousand-peso carpet around it, and four in five of the contracts on them were handed to a vendor without a contest, against seven in ten across the band. The habit peaked in 2014 and has roughly halved since. Art. 17 of the procurement law bans sizing a purchase to dodge a procedure; in twenty-three years of record it has produced no systemic enforcement case anyone can point to.",
    subheadline_es:
      "22,263 contratos federales de 200 mil a 400 mil pesos están escritos sobre un múltiplo exacto de diez mil — una cifra que un mercado casi nunca produce por sí solo. Cada uno de esos veinte valores se levanta entre tres y veintinueve veces sobre la alfombra de mil pesos que lo rodea, y cuatro de cada cinco de esos contratos se entregaron sin competencia, contra siete de cada diez en la banda entera. El hábito llegó a su máximo en 2014 y desde entonces casi se dividió a la mitad. El Art. 17 de la ley de adquisiciones prohíbe dimensionar una compra para evadir un procedimiento; en veintitrés años de registro no ha producido un solo caso sistémico de fiscalización que alguien pueda señalar.",
    byline: 'RUBLI Data Analysis Unit',
    estimatedMinutes: 8,
    status: 'solo_datos',
    leadStat: {
      value: '22,263',
      label: "contracts written on an exact multiple of 10,000 MXN",
      label_es: "contratos escritos sobre un múltiplo exacto de diez mil pesos",
      sublabel: "81.5% of them awarded directly, against 70.8% of the band",
      sublabel_es: "81.5% adjudicados directamente, contra 70.8% de la banda",
      color: '#f59e0b',
    },
    kickerStats: [
      {
        value: '2,796',
        suffix: "contracts written for exactly 300,000 pesos",
        suffix_es: "contratos escritos en exactamente 300 mil pesos",
        tone: 'critical',
      },
      {
        value: '19.2×',
        suffix: "the count a thousand pesos to either side",
        suffix_es: "el conteo a mil pesos de cualquier lado",
        tone: 'data',
      },
      {
        value: 'Art. 17',
        suffix: "bans the splitting; the spikes say otherwise",
        suffix_es: "prohíbe el fraccionamiento; los picos dicen otra cosa",
        tone: 'critical',
      },
    ],
    relatedSlugs: [
      'el-ejercito-fantasma',
      'la-ilusion-competitiva',
      'la-industria-del-intermediario',
    ],
    lensTags: {
      patterns: ['P5'],
      sectors: ['salud'],
      terms: ['umbral', 'threshold', 'fragmentación', 'Art. 17', 'DICONSA'],
    },
    nextSteps: [
      "File INAI information request for SFP's records of any Art. 17 LAASSP investigations for contract fragmentation in the last 5 years.",
      'Identify the top 20 institutions with the highest concentration of exactly-300K and exactly-210K contracts and request their procurement records for those awards.',
      'Compare threshold values across years against the spike bucket sizes — does the cluster shift when UMA-denominated thresholds change?',
      'Contact SHCP/SFP policy unit to ask whether automated threshold-clustering detection has been considered for CompraNet.',
      'File criminal complaints under Art. 17 LAASSP for specific procurement units showing systematic same-day, same-vendor, threshold-value contract splitting.',
      "Compile a journalistic investigation of the 10 most egregious same-day contract splitting cases identified by RUBLI's z-score analysis.",
    ],
    nextSteps_es: [
      'Solicitar vía INAI a la SFP los registros de cualquier investigación del Art. 17 de la LAASSP por fragmentación de contratos en los últimos 5 años.',
      'Identificar las 20 instituciones con mayor concentración de contratos por exactamente 300 mil y 210 mil pesos y solicitar sus expedientes de compra para esas adjudicaciones.',
      'Comparar los valores de umbral a lo largo del tiempo contra los tamaños de los picos — ¿se desplaza el clúster cuando los umbrales denominados en UMA cambian?',
      'Contactar a la unidad de política de la SHCP/SFP para preguntar si se ha considerado la detección automatizada de agrupamiento en umbrales para COMPRANET.',
      'Interponer denuncias penales bajo el Art. 17 de la LAASSP para unidades de compra específicas que muestren fraccionamiento sistemático de contratos en el mismo día, mismo proveedor, mismo valor umbral.',
      'Compilar una investigación periodística sobre los 10 casos más flagrantes de fraccionamiento de contratos en el mismo día identificados por el análisis z-score de RUBLI.',
    ],
    corrections: [
      "2026-09-19 — An earlier edition presented 300,000, 250,000 and 210,000 pesos as the band's sharpest spikes. 240,000 pesos is sharper: 1,568 contracts against a neighbourhood average of 54.",
    ],
    corrections_es: [
      "2026-09-19 — Una edición anterior presentaba 300 mil, 250 mil y 210 mil pesos como los picos más agudos de la banda. El de 240 mil pesos es más agudo: 1,568 contratos frente a un promedio vecino de 54.",
    ],
    chapters: [
      {
        id: 'ch1',
        number: 1,
        title: "Stand at the Line",
        title_es: "Párate en la línea",
        subtitle: "The same 200K-400K band at two resolutions, and what the coarse one hides",
        subtitle_es: "La misma banda de 200 a 400 mil pesos en dos resoluciones, y lo que esconde la gruesa",
        prose: [
          "There are 386,852 federal contracts written for between 200,000 and 400,000 pesos. Sorted into buckets ten thousand pesos wide, they come back unremarkable: the tallest bucket is the first, 30,441 contracts starting at 200,000, and from there the curve eases down to 11,700 in the last one. Larger contracts thin out. That is what the shape says, and for years it is all anyone read in it.",
          "Now cut the same band at a thousand pesos instead of ten thousand, and the smooth slope turns out to have teeth. The carpet underneath runs to a few dozen contracts per thousand-peso step. Standing out of it, at regular intervals, are twenty spikes — one at every multiple of ten thousand. At exactly 300,000 pesos sit 2,796 contracts. At 299,000, 236. At 301,000, 55. The spike is 19.2 times the average of its two neighbours.",
          "Walk the comb. 250,000 pesos carries 2,404 contracts against a neighbourhood of 154, a factor of 15.6. 210,000 carries 1,613 against 125, a factor of 12.9. The sharpest tooth in the band is not one of the three round numbers above: 240,000 pesos holds 1,568 contracts where its neighbours hold an average of 54 — twenty-nine times over. Every round number is a spike, and the spikes are not small.",
          "A vendor delivering 300,000 pesos of goods is no likelier to invoice exactly 300,000 than 299,000 or 301,000. Real prices spread out. A price that lands on a closed figure did not come from a market; it came from somebody choosing it. That choice is legal, common, and by itself proves nothing — until you look at how those contracts were awarded. Across the band, 70.8 percent of contracts are direct awards. On the round numbers, 81.5 percent are.",
        ],
        prose_es: [
          "Toma cada contrato federal escrito por entre 200 mil y 400 mil pesos — 386,852 en todo el registro — y ordénalos en intervalos de diez mil pesos de ancho. Lo que regresa no llama la atención. El intervalo más alto es el primero, 30,441 contratos a partir de 200 mil, y de ahí la curva baja suave hasta 11,700 en el último. Los contratos grandes escasean. Eso dice la forma, y durante años es todo lo que alguien leyó en ella.",
          "Ahora corta la misma banda a mil pesos en vez de diez mil, y la pendiente lisa resulta tener dientes. La alfombra de abajo se mueve en unas decenas de contratos por escalón de mil pesos. Levantándose de ella, a intervalos regulares, hay veinte picos — uno en cada múltiplo de diez mil. En exactamente 300 mil pesos se acumulan 2,796 contratos. En 299 mil, 236. En 301 mil, 55. El pico es 19.2 veces el promedio de sus dos vecinos.",
          "Recorre el peine. 250 mil pesos carga 2,404 contratos frente a un entorno de 154, un factor de 15.6. 210 mil carga 1,613 frente a 125, un factor de 12.9. El diente más agudo de la banda no es ninguno de los tres números redondos anteriores: 240 mil pesos guarda 1,568 contratos donde sus vecinos guardan un promedio de 54 — veintinueve veces más. Cada número redondo es un pico, y los picos no son chicos.",
          "Un proveedor que entrega 300 mil pesos en bienes no tiene más probabilidad de facturar exactamente 300 mil que 299 mil o 301 mil. Los precios reales se reparten. Un precio que aterriza sobre una cifra cerrada no salió de un mercado; salió de que alguien lo eligió. Esa elección es legal, común, y por sí sola no prueba nada — hasta que miras cómo se adjudicaron esos contratos. En la banda entera, el 70.8 por ciento son adjudicaciones directas. Sobre los números redondos, el 81.5 por ciento.",
        ],
        chartConfig: {
          type: 'live',
          live: 'threshold-histogram',
          live2: 'threshold-exact',
          scrolly: true,
          title: 'The Line and the Crowd: Contract Volume, 200K-400K MXN',
          title_es: 'La línea y la multitud: volumen de contratos, de 200 mil a 400 mil pesos',
          chartId: 'threshold-spikes',
        },
        pullquote: {
          quote:
            "2,796 contracts written for exactly 300,000 pesos. 236 for 299,000, and 55 for 301,000. A price that lands on a closed figure is not a price. It is a decision.",
          quote_es:
            "2,796 contratos escritos en exactamente 300 mil pesos. 236 en 299 mil, y 55 en 301 mil. Un precio que aterriza sobre una cifra cerrada no es un precio. Es una decisión.",
          stat: '19.2×',
          statLabel: "the count a thousand pesos to either side",
          statLabel_es: "el conteo a mil pesos de cualquier lado",
          barValue: 0.815,
          barLabel: 'of them awarded directly',
          barLabel_es: 'adjudicados directamente',
          vizTemplate: 'breach-ceiling',
        },
        sources: [
          'RUBLI contracts table, GET /analysis/amount-histogram, 200K-400K band at 10,000 and 1,000 peso resolution. Queried September 2026.',
          'Exact-value counts are equality matches on amount_mxn over the whole register; bucket counts are half-open on [from, to).',
          'Ley de Adquisiciones, Arrendamientos y Servicios del Sector Público, Art. 42 (simplified procedures).',
        ],
      },
      {
        id: 'ch2',
        number: 2,
        title: "Why the Crowd Forms",
        title_es: "Por qué se forma la multitud",
        subtitle: "The legal magnet, the fragmentation ban, and the buyers that write closed figures",
        subtitle_es: "El imán legal, la prohibición de fraccionar y las dependencias que escriben cifras cerradas",
        prose: [
          "Count the round-numbered contracts by buyer and the comb gets names. The Comisión Federal de Electricidad writes the most — 2,346 of them, 7.4 percent of everything it contracts in this band, and 77.9 percent awarded directly. The Instituto Mexicano del Seguro Social is second with 2,165, the ISSSTE third with 1,889. DICONSA, the state food distributor, writes 1,015 and hands out 93.3 percent of them without a contest. Nacional Financiera writes 847 out of only 1,812 contracts in the whole band — 46.7 percent of its mid-sized purchasing lands on a closed figure.",
          "The pull is written in law. Below certain values a buyer may use \"invitación a cuando menos tres personas\" — a simplified three-vendor invitation under Art. 42 of the Ley de Adquisiciones — instead of full competitive bidding; below others, direct adjudication with no procedure at all. The 300,000-peso value has historically sat near the invitación-a-tres threshold; 210,000 and 250,000 map to subdivision and small-value limits. Those limits are not fixed pesos: the law sets them in UMA, an inflation-linked unit the government restates every February, so the exact figures drift from year to year. The structure of Art. 43, and the bunching just beneath it, hold constant. To hand a predetermined vendor a contract without competition, sizing it just under the line is the reliable legal route.",
          "Art. 17 of the same law forbids the trick: the procurement of one good or service may not be fragmented to evade required procedures. Whether the round numbers in this band are that fragmentation is the question this story cannot close. RUBLI's same-day splitting detector — same vendor, same day, same institution — has not been run: the endpoint that would serve it returns no flagged contracts and reports that the underlying feature pipeline has not been computed. Until it is, the comb in the histogram is a pattern in prices, not a count of evaded procedures, and no peso figure should be built on top of it.",
          "The editorial finding is healthcare. The IMSS and the ISSSTE together write 4,054 round-numbered contracts in this band, more than any other pair of buyers, and 72.2 percent of what the two of them put on a closed figure went out as a direct award. Buying medical supplies almost never produces a closed figure on its own: a consignment of syringes or reagents prices out to whatever the unit cost times the quantity comes to. When it comes to exactly 300,000 pesos, the quantity was chosen to reach the price rather than the price arrived at from the quantity. Add every round value in the band and 22,263 contracts were written that way — each one a purchase where somebody picked the number first.",
        ],
        prose_es: [
          "Cuenta por dependencia los contratos escritos sobre un número redondo y el peine cobra nombres. La Comisión Federal de Electricidad escribe más que nadie — 2,346, el 7.4 por ciento de todo lo que contrata en esta banda, y el 77.9 por ciento adjudicado directamente. El Instituto Mexicano del Seguro Social va segundo con 2,165, el ISSSTE tercero con 1,889. DICONSA, la distribuidora estatal de alimentos, escribe 1,015 y entrega el 93.3 por ciento de ellos sin competencia. Nacional Financiera escribe 847 de apenas 1,812 contratos en toda la banda — el 46.7 por ciento de sus compras de monto medio aterriza sobre una cifra cerrada.",
          "El imán está escrito en la ley. Por debajo de ciertos valores una unidad compradora puede usar la \"invitación a cuando menos tres personas\" — procedimiento simplificado de tres proveedores bajo el Art. 42 de la Ley de Adquisiciones — en vez de licitación competitiva plena; por debajo de otros, adjudicación directa sin procedimiento alguno. El valor de 300,000 pesos ha estado históricamente cerca del umbral de invitación a tres; 210,000 y 250,000 corresponden a límites de subdivisión y de bajo valor. Esos límites no son pesos fijos: la ley los fija en UMA, una unidad ligada a la inflación que el gobierno actualiza cada febrero, así que los números exactos se desplazan año con año. La estructura del Art. 43, y el agrupamiento justo debajo, se mantienen constantes. Para entregar a un proveedor predeterminado un contrato sin competencia, dimensionarlo justo por debajo de la línea es la ruta legal confiable.",
          "El Art. 17 de la misma ley prohíbe el truco: la contratación de un bien o servicio no podrá fragmentarse para evadir los procedimientos exigidos. Si los números redondos de esta banda son esa fragmentación es la pregunta que esta historia no puede cerrar. El detector de fraccionamiento del mismo día de RUBLI — mismo proveedor, mismo día, misma institución — no se ha corrido: el endpoint que lo serviría devuelve cero contratos marcados y reporta que el pipeline de variables detrás no se ha calculado. Hasta que se corra, el peine del histograma es un patrón de precios, no un conteo de procedimientos evadidos, y ninguna cifra en pesos debe construirse encima.",
          "El hallazgo editorial es el sector salud. El IMSS y el ISSSTE juntos escriben 4,054 contratos sobre un número redondo en esta banda, más que cualquier otro par de compradores, y el 72.2 por ciento de lo que los dos pusieron sobre una cifra cerrada salió por adjudicación directa. La compra de insumos médicos casi nunca produce una cifra cerrada por sí sola: un lote de jeringas o de reactivos da el precio que dé el costo unitario por la cantidad. Cuando da exactamente 300 mil pesos, la cantidad se eligió para llegar al precio y no al revés. Suma cada valor redondo de la banda y son 22,263 contratos escritos así — cada uno una compra donde alguien eligió primero el número.",
        ],
        chartConfig: {
          type: 'live',
          live: 'threshold-institutions',
          title: 'Who Stands on the Line: Round-Numbered Contracts by Buyer',
          title_es: 'Quién se para en la línea: contratos con número redondo por dependencia',
          chartId: 'threshold-institutions',
        },
        pullquote: {
          quote:
            "Nacional Financiera writes 847 round-numbered contracts out of 1,812 in the whole band. Nearly half of its mid-sized purchasing lands on a closed figure.",
          quote_es:
            "Nacional Financiera escribe 847 contratos con número redondo de 1,812 en toda la banda. Casi la mitad de sus compras de monto medio aterriza sobre una cifra cerrada.",
          stat: '46.7%',
          statLabel: "of NAFIN's band purchasing sits on a round number",
          statLabel_es: "de las compras de NAFIN en la banda cae sobre un número redondo",
        },
        sources: [
          'Ley de Adquisiciones, Arrendamientos y Servicios del Sector Público. Art. 42 and Art. 43 threshold structure.',
          'Ley de Adquisiciones, Arrendamientos y Servicios del Sector Público. Art. 17 (fragmentation prohibition).',
          'RUBLI contracts table, GET /analysis/amount-histogram top_institutions, 200K-400K band. Queried September 2026.',
        ],
      },
      {
        id: 'ch3',
        number: 3,
        title: "Visible to Everyone, Enforced by No One",
        title_es: "Visible para todos, fiscalizado por nadie",
        subtitle: "Easy to detect, hard to prosecute, audited at neither end",
        subtitle_es: "Fácil de detectar, difícil de imputar, sin auditoría en ningún extremo",
        prose: [
          "Across twenty-three years of record, round-number clustering has produced no systemic enforcement case anyone can point to. The pattern is one of the easiest procurement irregularities to detect — counting contracts at fixed values against their neighbours runs in seconds on the full CompraNet dataset — and one of the hardest to prosecute. Each contract on its own is a legitimate, documented, defensible purchase. Whatever is wrong lives in the aggregate decision, which is the only place it could be proven and the one place nobody looks.",
          "Among the round-numbered contracts, 81.5 percent are direct awards — no competition, no public tender — against 70.8 percent across the band. Both are far above what the statute treats as exceptional; the gap between them is the part that is a choice.",
          "The enforcement geography explains the silence. Small sub-threshold contracts fall outside the federal audit net: the ASF spends its limited capacity on large contracts, and SFP pattern audits, when they happen, hit high-profile units rather than the diffuse municipal and decentralized bodies where splitting concentrates. It mirrors the failure at the top. Five-billion-peso contracts escape audit because they are politically dangerous to touch; 210,000-peso contracts escape because they are individually too small to be worth investigating. Opposite ends of the value spectrum, the same result — procurement without meaningful oversight.",
          "And yet the habit is receding. In 2002, 3.2 percent of the band's contracts were written on a round number. By 2014 it was 8.0 percent, the high-water mark. By 2025 it is back to 4.2 percent — roughly half the peak, without a single prosecution to explain it. Something changed: the 2010 CompraNet overhaul, the shift to electronic procedure records, the slow professionalisation of purchasing units. The decline is real and it deserves saying, because a story that only shouts loses the right to be believed when the number moves.",
          "What remains is still large, and what is missing is still will rather than capability. 578 contracts in the latest year were written on a closed figure. The remedies are well established: flag round-numbered awards at data entry, require an explanation when same-vendor same-day awards aggregate above a threshold, and treat a series of related contracts as one procurement. The EU's Directive 2014/24/EU already requires that last rule in Art. 5; Mexican law has not adopted it, even though Art. 17 already supplies the prohibition. CompraNet holds every byte needed. The question is no longer whether this happens at scale — it does, less than it did — but whether anyone will read a number that has been printed in public for twenty-three years.",
        ],
        prose_es: [
          "A lo largo de veintitrés años de registro, el agrupamiento en números redondos no ha producido un solo caso sistémico de fiscalización que alguien pueda señalar. El patrón es de las irregularidades en contratación más fáciles de detectar — contar contratos en valores fijos frente a sus vecinos toma segundos sobre toda la base de CompraNet — y de las más difíciles de imputar. Cada contrato por separado es una compra legítima, documentada y defendible. Lo que esté mal vive en la decisión agregada, el único lugar donde podría probarse y el único donde nadie mira.",
          "Entre los contratos con número redondo, el 81.5 por ciento son adjudicaciones directas — sin competencia, sin licitación pública — contra el 70.8 por ciento de la banda entera. Ambas rebasan por mucho lo que el estatuto trata como excepcional; la diferencia entre las dos es la parte que es una elección.",
          "La geografía de la fiscalización explica el silencio. Los contratos chicos por debajo del umbral caen fuera de la red de auditoría federal: la ASF gasta su capacidad limitada en contratos grandes, y las auditorías de patrón de la SFP, cuando ocurren, golpean unidades de alto perfil en vez de los organismos municipales y descentralizados donde se concentra la fragmentación. Es el espejo de la falla en el extremo alto. Los contratos de cinco mil millones de pesos escapan a la auditoría porque son políticamente peligrosos de tocar; los de 210 mil pesos escapan porque son individualmente demasiado chicos para investigarlos. Extremos opuestos del espectro de valor, el mismo resultado — contratación sin fiscalización significativa.",
          "Y sin embargo el hábito retrocede. En 2002, el 3.2 por ciento de los contratos de la banda se escribía sobre un número redondo. Para 2014 era el 8.0 por ciento, el punto más alto. Para 2025 vuelve a 4.2 por ciento — cerca de la mitad del máximo, sin una sola imputación que lo explique. Algo cambió: la renovación de CompraNet en 2010, el paso al registro electrónico de procedimientos, la lenta profesionalización de las unidades compradoras. La caída es real y merece decirse, porque un relato que solo grita pierde el derecho a que le crean cuando el número se mueve.",
          "Lo que queda sigue siendo grande, y lo que falta sigue siendo voluntad y no capacidad. En el último año 578 contratos se escribieron sobre una cifra cerrada. Los remedios están bien establecidos — marcado automático de las adjudicaciones con número redondo al momento de la captura, explicación obligatoria cuando las adjudicaciones del mismo día al mismo proveedor suman por encima de un umbral, auditorías de la SFP priorizadas algorítmicamente, y reglas de agregación que tratan una serie de contratos relacionados como una sola contratación. La Directiva 2014/24/UE ya exige esa agregación en su Art. 5; la ley mexicana no la ha adoptado plenamente, aunque el Art. 17 ya contiene la prohibición. CompraNet guarda cada byte necesario. Contar contratos en valores fijos frente a sus vecinos toma una consulta. La pregunta ya no es si esto ocurre a escala — sí ocurre, menos que antes — sino si alguien leerá un número que lleva veintitrés años impreso en público.",
        ],
        chartConfig: {
          type: 'live',
          live: 'threshold-years',
          title: 'The Line in Time: Round-Numbered Contracts as a Share of the Band',
          title_es: 'La línea en el tiempo: contratos con número redondo como proporción de la banda',
          chartId: 'threshold-years',
        },
        pullquote: {
          quote:
            "The number is printed in public data for anyone able to read it. In twenty-three years it has produced no systemic enforcement case — and it halved anyway.",
          quote_es:
            "El número está impreso en datos públicos para cualquiera capaz de leerlo. En veintitrés años no ha producido un solo caso sistémico de fiscalización — y aun así se dividió a la mitad.",
          stat: '4.2%',
          statLabel: "of the band written on a round number in 2025, down from 8.0% in 2014",
          statLabel_es:
            "de la banda escrito sobre un número redondo en 2025, desde 8.0% en 2014",
        },
        sources: [
          'OECD. (2015). Recommendation of the Council on Public Procurement.',
          'EU Procurement Directive 2014/24/EU. Art. 5 (aggregation rules and anti-splitting).',
          'RUBLI contracts table, GET /analysis/amount-histogram by_year, 200K-400K band. Queried September 2026. Procedure type is not coded before 2010 (COMPRANET Structure A).',
        ],
      },
    ],
  },

  // === STORY 10: The Smoking Gun Is a Number ===
  {
    slug: 'volatilidad-el-precio-del-riesgo',
    outlet: 'data_analysis',
    type: 'thematic',
    era: 'cross',
    headline: "The Smoking Gun Is a Number",
    headline_es: "La pistola humeante es un número",
    subheadline:
      "A pharmaceutical distributor billed the IMSS nine times its own price inside one acquisition category in four months. Then an algorithm, handed twenty-seven candidate signals, chose to watch exactly that.",
    subheadline_es:
      "Un distribuidor farmacéutico le facturó al IMSS nueve veces su propio precio dentro de una misma categoría de adquisición en cuatro meses. Después un algoritmo, con veintisiete señales candidatas, eligió vigilar precisamente eso.",
    byline: 'RUBLI Unidad de Análisis de Datos',
    estimatedMinutes: 12,
    status: 'solo_datos',
    leadStat: {
      value: '+0.729',
      label: "the weight the v0.9.1 model gives price volatility",
      label_es: "el peso que el modelo v0.9.1 le da a la volatilidad de precios",
      sublabel: "the model's strongest signal · 62% ahead of the next feature",
      sublabel_es: "la señal más fuerte del modelo · 62% por encima de la siguiente",
      color: '#dc2626',
    },
    kickerStats: [
      {
          suffix_es: "su propio precio.",
          prefix_es: "Un distribuidor facturó",
        prefix: "One distributor billed",
        value: '9×',
        suffix: "its own price.",
        tone: 'critical',
      },
      {
          prefix_es: "Con 27 señales candidatas, el modelo eligió",
        prefix: "Given 27 candidate signals, the model chose",
        value: 'price volatility',
        suffix: "",
        tone: 'data',
      },
      {
          suffix_es: ".",
          prefix_es: "Superó a todas las demás señales por",
        prefix: "It outranked every other signal by",
        value: '62%',
        suffix: ".",
        tone: 'muted',
      },
    ],
    corrections: [
      "2026-09-19 — An earlier edition's dek said the model was handed \"eighteen ways to detect fraud\". The eighteen are candidate signals offered to v0.8.5 during calibration, not detection methods.",
      "2026-10-14 — RUBLI retrained its risk model, from v0.8.5 to v0.9.1. Price volatility is still the strongest signal; its weight is now +0.729 (was +0.558), 62 percent ahead of price ratio (+0.449). The institution-concentration index chapter 3 described (−0.388) now carries no weight; a count of the institutions a vendor had already sold to before the contract year (+0.290) carries the same effect. Chapter 4 printed an illustrative 4,200-contract overlap between the model and an anomaly detector; it now prints the measured overlap. An earlier edition also put price volatility's lead at 43 percent in chapter 2 and 56 percent elsewhere; 56 was the correct v0.8.5 figure.",
    ],
    corrections_es: [
      "2026-09-19 — El sumario de una edición anterior decía que al modelo se le dieron «dieciocho formas de detectar el fraude». Las dieciocho son señales candidatas ofrecidas a v0.8.5 durante la calibración, no métodos de detección.",
      "2026-10-14 — RUBLI reentrenó su modelo de riesgo, de v0.8.5 a v0.9.1. La volatilidad de precios sigue siendo la señal más fuerte; su peso es ahora +0.729 (era +0.558), 62 por ciento por encima de la razón de precios (+0.449). El índice de concentración institucional que describía el capítulo 3 (−0.388) ya no tiene peso; un conteo de las instituciones a las que el proveedor ya le había vendido antes del año del contrato (+0.290) carga el mismo efecto. El capítulo 4 imprimía un traslape ilustrativo de 4,200 contratos entre el modelo y un detector de anomalías; ahora imprime el traslape medido. Una edición anterior además fijaba la ventaja de la volatilidad en 43 por ciento en el capítulo 2 y en 56 en otras partes; 56 era la cifra correcta de v0.8.5.",
    ],
    chapters: [
      {
        id: 'ch1',
        number: 1,
        title: "Three Million in February. Twenty-Seven Million in June.",
        title_es: "3 millones de pesos en febrero. 27 millones en junio.",
        subtitle: "One distributor, one IMSS category, the same goods — and a price that rose ninefold in four months",
        subtitle_es: "Un distribuidor, una categoría del IMSS, los mismos bienes — y un precio que se multiplicó por nueve en cuatro meses",
        prose: [
          "In February 2020, a pharmaceutical distributor billed the IMSS three million pesos for a delivery. In June, in the same acquisition category, with the same institution, for structurally comparable goods, it billed twenty-seven million. The price rose ninefold in four months. The contract was a direct award. The public record carries no specifications and no scope justification for either delivery, so nothing in it explains the difference. This chapter does not name the distributor.",
          "A price set by competition moves inside a narrow band; stable costs make stable prices. This one did not move — it jumped. The twenty-seven-million figure did not come from the market. It came from a number an approving official was willing to sign.",
          "This single invoice is not proof of a crime. It is proof that the price was negotiated, not competed. The question that drives everything below is whether it is one bad contract or the visible edge of a pattern. The chart is the exhibit: this distributor's own IMSS contract history, 2019 through 2022.",
        ],
        prose_es: [
          "En febrero de 2020, un distribuidor farmacéutico le facturó al IMSS tres millones de pesos por una entrega. En junio, en la misma categoría de adquisición, con la misma institución, por bienes estructuralmente comparables, le facturó veintisiete millones. El precio se multiplicó por nueve en cuatro meses. El contrato fue adjudicación directa. El registro público no trae especificaciones ni justificación de alcance para ninguna de las dos entregas, así que nada en él explica la diferencia. Este capítulo no nombra al distribuidor.",
          "Un precio fijado por la competencia se mueve dentro de un rango estrecho; los costos estables producen precios estables. Este no se movió — saltó. Los 27 millones no salieron del mercado. Salieron de un número que un funcionario estuvo dispuesto a firmar.",
          "Esta sola factura no prueba un delito. Prueba que el precio se negoció, no se compitió. La pregunta que mueve todo lo de abajo es si se trata de un contrato malo o del borde visible de un patrón. La gráfica es la prueba: el historial de contratos de este distribuidor con el IMSS, de 2019 a 2022.",
        ],
        chartConfig: {
          type: 'vendor-price-trajectory',
          title: 'The exhibit: pharmaceutical distributor, IMSS contract history 2019–2022',
          title_es: 'La prueba: distribuidor farmacéutico, historial de contratos IMSS 2019–2022',
        },
        pullquote: {
          quote:
            "Three million in February. Twenty-seven million in June. Same category, direct award, no spec change. That is the trace of a negotiated price.",
          quote_es:
            "3 MDP en febrero. 27 MDP en junio. Misma categoría, adjudicación directa, sin cambio de especificaciones. Esa es la huella de un precio negociado.",
          stat: '9×',
          statLabel: "price swing within one vendor, one category, one year",
          statLabel_es: "variación de precio en un mismo proveedor, misma categoría, mismo año",
        },
        sources: [
          'Análisis SHAP RUBLI, contribuciones de price_volatility para proveedores P1, mayo 2026.',
          'OECD. (2009). OECD Principles for Integrity in Public Procurement.',
        ],
      },
      {
        id: 'ch2',
        number: 2,
        title: "The Algorithm Reached the Same Scene",
        title_es: "El algoritmo llegó a la misma escena",
        subtitle: "Handed twenty-seven features, RUBLI's model made price_volatility its strongest signal — 62% ahead of the next one",
        subtitle_es: "Con veintisiete variables, el modelo de RUBLI hizo de price_volatility su señal más fuerte — 62% por encima de la siguiente",
        prose: [
          "Out of twenty-seven candidate features, RUBLI's v0.9.1 model made price_volatility its single strongest predictor of the documented-case label — +0.729, and 62% ahead of the next feature, price_ratio at +0.449. Nobody told it to. The model never saw the June invoice as anything special.",
          "It learned from the record. v0.9.1 trained on RUBLI's labelled case set — most of them analyst write-ups of model-surfaced leads, alongside press-reported cases such as IMSS ghost-company networks, the Segalmex fraud, COVID irregularities, the university Estafa Maestra — using ElasticNet logistic regression. The contest was open: twenty-seven features, equal footing, free to weight by the data. Six of them (co_bid_rate, price_hyp_confidence, institution_risk, amendment_flag, partida_single_bid_z_loo, inst_hhi_prior) were regularized to exactly zero; twenty-one survived. The model it replaced in October 2026, v0.8.5, had made the same choice, at +0.558.",
          "This is corroboration. An algorithm arrived at the same scene by a different road — aggregate statistics over millions of contracts, not one June delivery — and pointed at the same evidence. The +0.729 coefficient is a compressed judgment about what RUBLI's labelled cases share: inconsistent prices for comparable work. The roster below is the structure the model built.",
        ],
        prose_es: [
          "De veintisiete variables candidatas, el modelo v0.9.1 de RUBLI hizo de price_volatility su predictor más fuerte de la etiqueta de caso documentado — +0.729, y un 62% por encima de la siguiente, price_ratio con +0.449. Nadie se lo pidió. El modelo nunca vio la factura de junio como algo especial.",
          "Aprendió del registro. v0.9.1 se entrenó con la base de casos etiquetados de RUBLI — la mayoría documentación de analistas sobre pistas surgidas del modelo, junto con casos reportados por la prensa como las redes de empresas fantasma del IMSS, el fraude de Segalmex, irregularidades del COVID, La Estafa Maestra universitaria — con regresión logística ElasticNet. El concurso fue abierto: veintisiete variables, en igualdad de condiciones, libres de ponderarse según los datos. Seis de ellas (co_bid_rate, price_hyp_confidence, institution_risk, amendment_flag, partida_single_bid_z_loo, inst_hhi_prior) quedaron regularizadas a exactamente cero; veintiuna sobrevivieron. El modelo al que sustituyó en octubre de 2026, v0.8.5, había hecho la misma elección, con +0.558.",
          "Esto es corroboración. Un algoritmo llegó a la misma escena por otro camino — estadística agregada sobre millones de contratos, no una entrega de junio — y apuntó a la misma evidencia. El coeficiente de +0.729 es un juicio comprimido sobre lo que comparten los casos etiquetados de RUBLI: precios inconsistentes para trabajo comparable. El roster de abajo es la estructura que el modelo construyó.",
        ],
        chartConfig: {
          type: 'inline-roster',
          title: "The model's verdict: 21 weighted features — price_volatility on top",
          title_es:
            'El veredicto del modelo: 21 variables con peso — price_volatility en la cima',
          chartId: 'model-coefficients-full',
          data: {
            points: [
              {
                label: 'Price volatility',
                label_es: 'Volatilidad de precios',
                value: 0.729,
                highlight: true,
                annotation: 'PRICE FAMILY · señal más fuerte · +62% vs siguiente',
                annotation_es: 'FAMILIA PRECIO · señal más fuerte · +62% vs siguiente',
              },
              {
                label: 'Price ratio',
                label_es: 'Razón de precios',
                value: 0.449,
                annotation: 'PRICE FAMILY',
                annotation_es: 'FAMILIA PRECIO',
              },
              {
                label: 'Breadth (institutions served before)',
                label_es: 'Amplitud (instituciones atendidas antes)',
                value: 0.29,
                annotation: 'NETWORK FAMILY · as-of count',
                annotation_es: 'FAMILIA RED · conteo previo al contrato',
              },
              {
                label: 'Vendor concentration',
                label_es: 'Concentración de proveedor',
                value: 0.242,
                annotation: 'NETWORK FAMILY',
                annotation_es: 'FAMILIA RED',
              },
              {
                label: 'Co-bidding concentration',
                label_es: 'Concentración entre co-licitantes',
                value: 0.193,
                annotation: 'NETWORK FAMILY',
                annotation_es: 'FAMILIA RED',
              },
              {
                label: 'Network member count',
                label_es: 'Tamaño de red',
                value: 0.061,
                annotation: 'NETWORK FAMILY',
                annotation_es: 'FAMILIA RED',
              },
              {
                label: 'Ad period (days)',
                label_es: 'Periodo publicación (días)',
                value: 0.053,
                annotation: 'STRUCTURAL FAMILY',
                annotation_es: 'FAMILIA ESTRUCTURAL',
              },
              {
                label: 'Sector spread',
                label_es: 'Dispersión sectorial',
                value: -0.052,
                annotation: 'NETWORK FAMILY · protector menor',
                annotation_es: 'FAMILIA RED · protector menor',
              },
              {
                label: 'Recency z-score',
                label_es: 'Recencia (z)',
                value: -0.092,
                annotation: 'STRUCTURAL FAMILY · protector menor',
                annotation_es: 'FAMILIA ESTRUCTURAL · protector menor',
              },
              {
                label: 'Amount residual z',
                label_es: 'Residual de monto (z)',
                value: -0.142,
                highlight: true,
                annotation: 'PRICE FAMILY · el protector mayor',
                annotation_es: 'FAMILIA PRECIO · el protector mayor',
              },
            ],
            unit: 'β',
            annotation:
              'Roster ranked by coefficient; the ten largest weights shown. Of 27 candidate features, 21 carry weight in v0.9.1: 14 with positive β, 7 with negative β. 6 were regularized to zero.',
            annotation_es:
              'Listado ordenado por coeficiente; se muestran los diez pesos mayores. De 27 variables candidatas, 21 tienen peso en v0.9.1: 14 con β positivo y 7 con β negativo. 6 quedaron regularizadas a cero.',
          },
        },
        pullquote: {
          quote:
            "Of twenty-seven candidate features the algorithm chose price_volatility unprompted. That choice is the model's judgment about what the vendors in RUBLI's labelled cases have in common — cases that are mostly analyst write-ups, not adjudicated findings.",
          quote_es:
            "De veintisiete variables candidatas el algoritmo eligió price_volatility sin que nadie se lo pidiera. Esa elección es el juicio del modelo sobre lo que comparten los proveedores de los casos etiquetados de RUBLI — casos que en su mayoría son documentación de analistas, no resoluciones.",
          stat: '+0.729',
          statLabel: "price_volatility · v0.9.1 (replaced Oct 2026)",
          statLabel_es: "price_volatility · v0.9.1 (reemplazado oct 2026)",
        },
        sources: [
          'RUBLI v0.9.1 model. Run ID CAL-v91-202610131004. High-risk rate 9.9%. Replaced in October 2026 by v0.9.2 after a pre-registered test found look-ahead in its features; its published AUC 0.852 is withdrawn (see /methodology).',
          'RUBLI /analysis/model/calibration — tabla de coeficientes de v0.9.1, consultada el 14 de octubre de 2026.',
        ],
      },
      {
        id: 'ch3',
        number: 3,
        title: "The Architecture of Suspicion",
        title_es: "La arquitectura de la sospecha",
        subtitle: "Fourteen signals push the score up, seven pull it down — and six the model dropped",
        subtitle_es: "Catorce señales suben la puntuación, siete la bajan — y seis que el modelo descartó",
        prose: [
          "The weight that changes how to read this ladder is the third: breadth, at +0.290 — a count of the federal institutions a vendor had already sold to before the contract year. Among suppliers of similar size, those selling to many agencies score higher, so the model scores single-buyer vendors LOWER: the opposite of the institutional-capture pattern RUBLI tracks elsewhere, and a known limitation of the model. The model before it, v0.8.5, carried the same effect through an all-time institution-concentration index at -0.388; v0.9.1 measures it directly, and only from the past. Seven coefficients lean negative — amount_residual_z at -0.142 and recency_z at -0.092 the largest — and none carries even a fifth of price volatility's weight. Everything else on the right of the ladder is an alarm — price volatility on top, then price ratio, breadth, concentration in few contracts and co-bidding networks.",
          "The smallest features carry their own verdict: single bid, year-end timing, industry mismatch, win_rate and sector_spread all sit below 0.06 either way. Earlier versions — v3.3, v4.0 — treated some as primary indicators. v0.9.1, like v0.8.5 before it, found that once price_volatility and price_ratio are in the model they add little; direct_award itself survives only at -0.016, and the amendment flag was dropped to zero. Single bid is not irrelevant to corruption — it is already captured by the dominant price signals.",
          "The empirical finding is plain, and it is a finding about the labels, not about corruption itself. What separates the vendors inside RUBLI's 1,417 labelled cases from those outside them is price, not the award mechanism or the timing — and the inconsistency of that price, billing 9× for comparable work, is the trace that separates them most reliably. The June invoice is exactly what the top of this ladder is built to see.",
        ],
        prose_es: [
          "El peso que cambia la lectura de esta escalera es el tercero: la amplitud, en +0.290 — un conteo de las instituciones federales a las que el proveedor ya le había vendido antes del año del contrato. Entre proveedores de tamaño parecido, los que le venden a muchas dependencias puntúan más alto, así que el modelo puntúa MÁS BAJO a los proveedores de un solo comprador: lo contrario del patrón de captura institucional que RUBLI sigue en otras secciones, y una limitación conocida del modelo. El modelo anterior, v0.8.5, cargaba el mismo efecto con un índice de concentración institucional de toda la historia, en -0.388; v0.9.1 lo mide directamente y solo con el pasado. Siete coeficientes se inclinan en negativo — amount_residual_z en -0.142 y recency_z en -0.092 los mayores — y ninguno carga ni la quinta parte del peso de la volatilidad de precios. Todo lo demás a la derecha de la escalera es una alarma — la volatilidad de precios arriba, luego la razón de precios, la amplitud, la concentración en pocos contratos y las redes de co-licitación.",
          "Las variables más pequeñas traen su propio veredicto: un solo adjudicado, momento de fin de año, desajuste de industria, win_rate y sector_spread quedan todas por debajo de 0.06 en cualquier sentido. Versiones anteriores — v3.3, v4.0 — trataban algunas como indicadores principales. v0.9.1, como v0.8.5 antes, encontró que una vez que price_volatility y price_ratio están en el modelo aportan poco; el propio direct_award sobrevive apenas en -0.016, y la marca de modificaciones quedó en cero. Un solo adjudicado no es irrelevante para la corrupción — ya está capturado por las señales dominantes de precio.",
          "El hallazgo empírico es claro, y es un hallazgo sobre las etiquetas, no sobre la corrupción misma. Lo que distingue a los proveedores dentro de los 1,417 casos etiquetados de RUBLI de los que están fuera es el precio, no el mecanismo de adjudicación ni el momento — y la inconsistencia de ese precio, facturar 9× por trabajo comparable, es la huella que los separa con mayor consistencia. La factura de junio es exactamente lo que la cima de esta escalera está construida para ver.",
        ],
        chartConfig: {
          type: 'inline-diverging',
          title: 'The architecture of suspicion: risk signals vs the protective ones',
          title_es: 'La arquitectura de la sospecha: señales de riesgo vs las protectoras',
          data: {
            points: [
              {
                label: 'Price volatility',
                label_es: 'Volatilidad de precios',
                value: 0.729,
                highlight: true,
                annotation: '+62% vs next',
                annotation_es: '+62% vs siguiente',
              },
              {
                label: 'Price ratio',
                label_es: 'Razón de precios',
                value: 0.449,
              },
              {
                label: 'Breadth (institutions served before)',
                label_es: 'Amplitud (instituciones atendidas antes)',
                value: 0.29,
                color: '#3b82f6',
                annotation: 'lowers single-buyer vendors',
                annotation_es: 'baja a los de un solo comprador',
              },
              {
                label: 'Vendor concentration',
                label_es: 'Concentración proveedor',
                value: 0.242,
              },
              {
                label: 'Cobid herfindahl',
                label_es: 'Herfindahl co-licitación',
                value: 0.193,
              },
              {
                label: 'Network member count',
                label_es: 'Tamaño red',
                value: 0.061,
              },
              {
                label: 'Ad period (days)',
                label_es: 'Periodo publicación',
                value: 0.053,
              },
              {
                label: 'Direct award',
                label_es: 'Adjudicación directa',
                value: -0.016,
              },
              {
                label: 'Sector spread',
                label_es: 'Dispersión sectorial',
                value: -0.052,
              },
              {
                label: 'Recency z-score',
                label_es: 'Recencia (z)',
                value: -0.092,
              },
              {
                label: 'Amount residual z',
                label_es: 'Residual monto (z)',
                value: -0.142,
              },
            ],
            referenceLine: {
              value: 0,
              label: '',
              color: '#64748b',
            },
            unit: 'coefficient',
            annotation:
              'Ghost rows: 6 features regularized to zero (co_bid_rate, price_hyp_confidence, institution_risk, amendment_flag, partida_single_bid_z_loo, inst_hhi_prior).',
            annotation_es:
              'Filas fantasma: 6 variables regularizadas a cero (co_bid_rate, price_hyp_confidence, institution_risk, amendment_flag, partida_single_bid_z_loo, inst_hhi_prior).',
          },
        },
        pullquote: {
          quote:
            "The third-largest weight, breadth, counts the institutions a vendor already sells to: the model scores single-buyer vendors lower, not higher.",
          quote_es:
            "El tercer peso más grande, la amplitud, cuenta las instituciones a las que el proveedor ya le vende: el modelo puntúa más bajo, no más alto, a los proveedores de un solo comprador.",
          stat: '+0.290',
          statLabel: "breadth (institutions served before the contract year) — v0.9.1",
          statLabel_es: "amplitud (instituciones atendidas antes del año del contrato) — v0.9.1",
        },
        sources: [
          'Zou, H., & Hastie, T. (2005). Regularization and variable selection via the elastic net.',
          'RUBLI v0.9.1 coefficient table, /analysis/model/calibration and /methodology § findings, octubre 2026.',
        ],
      },
      {
        id: 'ch4',
        number: 4,
        title: "Two Algorithms, the Same 150,727 Contracts",
        title_es: "Dos algoritmos, los mismos 150,727 contratos",
        subtitle: "A model trained on case vendors and a model that never saw a single case both flag the same population",
        subtitle_es:
          "Un modelo entrenado con proveedores de casos y un modelo que nunca vio un solo caso marcan la misma población",
        prose: [
          "Two independent algorithms, sharing no labels and no mathematics, flag the same 150,727 contracts. The first is the supervised v0.9.1 model, trained on RUBLI's labelled case set; it scores 302,640 contracts high or critical. The second is a PyOD anomaly-detection ensemble that uses no corruption labels at all — it flags the 271,763 contracts that are statistically unusual within the universe of 3.1 million. Half of what the model flags, the anomaly detector flags too, against fewer than one in eleven contracts overall.",
          "This is the second witness who never spoke to the first. Build a case on a single instrument and a defense attacks the instrument. When two instruments with nothing in common point at the same contracts, the signal is real, not a training artifact.",
          "The simplest explanation is that price_volatility is visible from both vantage points. A contract billed 9× above its own baseline is anomalous in pure statistics, so the anomaly detector sees it — and it resembles the contracts of vendors linked to documented cases, so the supervised model sees it too. Same signal, same trace. The Venn below shows the overlap.",
        ],
        prose_es: [
          "Dos algoritmos independientes, sin etiquetas compartidas y sin matemáticas en común, marcan los mismos 150,727 contratos. El primero es el modelo supervisado v0.9.1, entrenado con la base de casos etiquetados de RUBLI; califica 302,640 contratos con riesgo alto o crítico. El segundo es un ensemble de detección de anomalías de PyOD que no usa etiqueta de corrupción alguna — marca los 271,763 contratos estadísticamente inusuales dentro del universo de 3.1 millones. La mitad de lo que marca el modelo también lo marca el detector de anomalías, frente a menos de uno de cada once contratos en el total.",
          "Este es el segundo testigo que nunca habló con el primero. Un caso construido sobre un solo instrumento deja que la defensa ataque el instrumento. Cuando dos instrumentos sin nada en común apuntan a los mismos contratos, la señal es real, no un artefacto del entrenamiento.",
          "La explicación más simple es que price_volatility se ve desde ambos puntos de vista. Un contrato facturado 9 veces por encima de su propia línea base es anómalo en estadística pura, y por eso lo detecta el detector de anomalías — y se parece a los contratos de proveedores vinculados a casos documentados, y por eso lo detecta también el modelo supervisado. La misma señal, la misma huella. El diagrama de Venn de abajo muestra el traslape.",
        ],
        chartConfig: {
          type: 'venn-convergence',
          title: 'The second witness: two algorithms, the same 150,727 contracts',
          title_es: 'El segundo testigo: dos algoritmos, los mismos 150,727 contratos',
        },
        pullquote: {
          quote:
            "Two independent analytic approaches — supervised scoring and unsupervised anomaly detection — converge on the same 150,727 contracts — half of everything the model flags.",
          quote_es:
            "Dos enfoques analíticos independientes — calificación de riesgo supervisada y detección de anomalías no supervisada — convergen en los mismos 150,727 contratos — la mitad de todo lo que marca el modelo.",
          stat: '150,727',
          statLabel: "contracts flagged by both algorithms independently",
          statLabel_es: "contratos marcados por ambos algoritmos de forma independiente",
        },
        sources: [
          'Elkan, C., & Noto, K. (2008). Learning classifiers from only positive and unlabeled data. ACM SIGKDD.',
          'RUBLI validación cruzada de modelos, v0.9.1 (riesgo alto o crítico) vs ensemble PyOD (ensemble_anomaly_score ≥ 0.2598, el umbral de /analysis/pyod-agreement), medida sobre el registro el 14 de octubre de 2026.',
        ],
      },
      {
        id: 'ch5',
        number: 5,
        title: "Three Fingerprints on One Axis",
        title_es: "Tres huellas en un mismo eje",
        subtitle: "The shape of the volatility tells the reporter which case they are looking at — overpricing or capture",
        subtitle_es: "La forma de la volatilidad le dice al periodista qué caso tiene enfrente — sobreprecio o captura",
        prose: [
          "Volatility is not one number — it is a fingerprint, and its shape names the case. The low-footprint vendor pattern (P2) leaves the sharpest mark: few contracts, extreme variance, prices that jump 5 to 10 times with no market logic. The capture vendor (P6) leaves a different one: many contracts with a single institution, moderate but persistent variance — it never competes, it always negotiates. The legitimate vendor leaves almost none: many contracts across many institutions, narrow variance, prices that track market cost.",
          "The model separates these without ever labeling them. In the illustrative fingerprints below, drawn from RUBLI's May 2026 analysis under v0.8.5, price_volatility, institution_diversity and vendor_concentration combine into a distinct vector for each pattern; v0.9.1 dropped the institution-concentration index to zero and measures breadth instead, so the middle bar of each fingerprint reads the earlier model. The ghost scores high on volatility; the capture vendor high on concentration; the legitimate vendor low on all three. The three SHAP fingerprints below are illustrative — their proportions reflect RUBLI's analysis patterns, not a single audited contract.",
          "For a reporter the shape is a route. A high-risk vendor dominated by price_volatility is a pricing-manipulation case — compare invoices against market prices. One dominated by vendor_concentration is an institutional-capture case — trace the relationship between the vendor and the signing official. The coefficient signature dictates the investigation.",
        ],
        prose_es: [
          "La volatilidad no es un número — es una huella, y su forma nombra el caso. El patrón de proveedor de baja huella (P2) deja la marca más nítida: pocos contratos, varianza extrema, precios que saltan de 5 a 10 veces sin lógica de mercado. El proveedor de captura (P6) deja otra: muchos contratos con una sola institución, varianza moderada pero persistente — nunca compite, siempre negocia. El proveedor legítimo casi no deja ninguna: muchos contratos con muchas instituciones, varianza estrecha, precios que reflejan el costo de mercado.",
          "El modelo los separa sin etiquetarlos nunca. En las huellas ilustrativas de abajo, tomadas del análisis de RUBLI de mayo de 2026 con v0.8.5, price_volatility, institution_diversity y vendor_concentration se combinan en un vector distinto para cada patrón; v0.9.1 dejó en cero el índice de concentración institucional y mide la amplitud en su lugar, así que la barra de en medio de cada huella lee el modelo anterior. El fantasma puntúa alto en volatilidad; el de captura, alto en concentración; el legítimo, bajo en los tres. Las tres huellas SHAP de abajo son ilustrativas — sus proporciones reflejan los patrones del análisis de RUBLI, no un solo contrato auditado.",
          "Para un periodista la forma es una ruta. Un proveedor de riesgo alto dominado por price_volatility es un caso de manipulación de precios: hay que comparar facturas con precios de mercado. Uno dominado por vendor_concentration es un caso de captura institucional: hay que rastrear la relación entre el proveedor y el funcionario que firma. El perfil de coeficientes dicta la investigación.",
        ],
        chartConfig: {
          type: 'inline-diverging',
          title: 'Three fingerprints on one axis: ghost, capture, legitimate',
          title_es: 'Tres huellas en un mismo eje: fantasma, captura, legítimo',
          data: {
            points: [
              {
                label: 'P2 Ghost — price_volatility',
                label_es: 'P2 Fantasma — volatilidad precios',
                value: 0.82,
                highlight: true,
                annotation: 'ghost signature · 5–10× price jumps',
                annotation_es: 'firma fantasma · saltos de 5–10×',
              },
              {
                label: 'P2 Ghost — institution_diversity',
                label_es: 'P2 Fantasma — diversidad institucional',
                value: 0.12,
              },
              {
                label: 'P2 Ghost — vendor_concentration',
                label_es: 'P2 Fantasma — concentración proveedor',
                value: 0.38,
              },
              {
                label: 'P6 Capture — price_volatility',
                label_es: 'P6 Captura — volatilidad precios',
                value: 0.31,
              },
              {
                label: 'P6 Capture — institution_diversity',
                label_es: 'P6 Captura — diversidad institucional',
                value: -0.45,
                color: '#3b82f6',
              },
              {
                label: 'P6 Capture — vendor_concentration',
                label_es: 'P6 Captura — concentración proveedor',
                value: 0.71,
                highlight: true,
                annotation: 'capture signature · one buyer',
                annotation_es: 'firma de captura · un solo comprador',
              },
              {
                label: 'Legit — price_volatility',
                label_es: 'Legítimo — volatilidad precios',
                value: 0.04,
              },
              {
                label: 'Legit — institution_diversity',
                label_es: 'Legítimo — diversidad institucional',
                value: -0.38,
                color: '#3b82f6',
              },
              {
                label: 'Legit — vendor_concentration',
                label_es: 'Legítimo — concentración proveedor',
                value: 0.02,
              },
            ],
            referenceLine: {
              value: 0,
              label: '',
              color: '#64748b',
            },
            unit: 'SHAP φ',
            annotation:
              'Illustrative. Each bar shows how far one signal pushes a typical vendor of that kind above or below the average score. The proportions come from RUBLI\'s analysis patterns, not from one audited contract (v0.8.5, May 2026).',
            annotation_es:
              'Valores SHAP ilustrativos — proporciones reflejan patrones del análisis RUBLI (v0.8.5, mayo 2026).',
          },
        },
        pullquote: {
          quote:
            "Three vendor patterns, three distinct fingerprints on one axis. The signature tells the investigator which case they have — overpricing or institutional capture.",
          quote_es:
            "Tres patrones de proveedor, tres huellas distintas en un mismo eje. La firma le dice al investigador qué caso tiene — sobreprecio o captura institucional.",
          stat: '3',
          statLabel: "vendor patterns — three distinct fingerprints on the same axis",
          statLabel_es: "patrones de proveedor — tres firmas distintas en el mismo eje",
        },
        sources: [
          'RUBLI análisis SHAP v0.8.5, tabla vendor_shap_v52, mayo 2026.',
          'RUBLI ARIA pipeline, P2/P6 pattern classification, mayo 2026.',
        ],
      },
      {
        id: 'ch6',
        number: 6,
        title: "How a Reporter Closes the Case the Algorithm Opened",
        title_es: "Cómo un periodista cierra el caso que abrió el algoritmo",
        subtitle: "Three forensic steps — transparency request, full contract text, price benchmark — and an honest limit",
        subtitle_es: "Tres pasos forenses — solicitud de transparencia, texto completo del contrato, comparación de precios — y un límite honesto",
        prose: [
          "The algorithm opens the file; the reporter closes it. For any vendor at the top of RUBLI's price_volatility ranking, the forensic route is three steps. First, pull the highest-variance contracts through INAI transparency requests — typical response 20 business days. Second, obtain the full contract text: specification, quantities, unit prices, delivery terms. Third, benchmark those unit prices against domestic comparators — other CompraNet contracts for the same goods — and international ones, the Open Contracting Partnership's datasets and the EU's TED database.",
          "This needs no forensic-accounting expertise. It needs access to public documents and systematic comparison. The ASF already applies this methodology to pharmaceutical procurement, a practice established after the Maypo / Grupo Fármacos / PISA concentration. RUBLI extends it algorithmically across 3.1 million contracts and 12 sectors, and the risk indicator simply flags which vendor-institution pairs deserve the first information request.",
          "The output is not a criminal charge — that requires the Ministerio Público or the UIF. It is published evidence of overpricing in specific named contracts, verified by independent benchmarking, the kind of pressure that charges ultimately require. The lineage is clear: MCCI and Animal Político on La Estafa Maestra, El Universal on IMSS pharma — now made systematically faster. The June invoice was the clue. This is how you turn it into a case.",
        ],
        prose_es: [
          "El algoritmo abre el expediente; el periodista lo cierra. Para cualquier proveedor en la cima de la lista de price_volatility de RUBLI, la ruta forense tiene tres pasos. Primero, sacar los contratos de mayor varianza mediante solicitudes de transparencia al INAI — respuesta típica de 20 días hábiles. Segundo, obtener el texto completo del contrato: especificación, cantidades, precios unitarios, condiciones de entrega. Tercero, comparar esos precios unitarios con referentes nacionales — otros contratos de CompraNet por los mismos bienes — e internacionales, los datos del Open Contracting Partnership y la base TED de la UE.",
          "Esto no requiere expertise forense contable. Requiere acceso a documentos públicos y comparación sistemática. La ASF ya aplica esta metodología a las adquisiciones farmacéuticas, una práctica establecida tras la concentración Maypo / Grupo Fármacos / PISA. RUBLI la extiende algorítmicamente a 3.1 millones de contratos y 12 sectores, y el indicador de riesgo simplemente señala cuáles pares proveedor-institución merecen la primera solicitud de información.",
          "El resultado no es una imputación penal — eso requiere al Ministerio Público o a la UIF. Es evidencia publicada de sobreprecio en contratos específicos, identificados por nombre, verificada con benchmarking independiente, el tipo de presión que las imputaciones en última instancia requieren. El linaje es claro: MCCI y Animal Político en La Estafa Maestra, El Universal en la farmacéutica del IMSS — ahora sistemáticamente más rápido. La factura de junio fue la pista. Así se convierte en un caso.",
        ],
        sources: [
          'INAI. (2024). Guía de Solicitudes de Información sobre Compras Públicas.',
        ],
      },
    ],
    relatedSlugs: ['el-monopolio-invisible', 'el-gran-precio', 'captura-institucional'],
    lensTags: {
      patterns: ['P5'],
      terms: ['volatilidad', 'price volatility', 'coefficient', 'ElasticNet', 'v0.9.1'],
    },
    nextSteps: [
      'Solicitar a la ASF la metodología y lista de proveedores de sus auditorías de benchmarking de precios farmacéuticos — ¿se traslapan con los proveedores de alta price_volatility en RUBLI?',
      'Presentar solicitudes INAI de registros de facturas para los 20 proveedores de mayor price_volatility en la fila T1 de ARIA de RUBLI — comparar contra bases de precios de mercado para los mismos bienes.',
      'Cruzar los proveedores de alta volatilidad de RUBLI contra la base de investigaciones de cárteles de COFECE — ¿alguna empresa está bajo investigación de competencia?',
      'Investigar si la estructura de datos de CompraNet permite monitoreo automatizado de consistencia de precios entre rondas de contratación — ¿cuáles son las barreras legales para publicar tales alertas?',
      'Publicar un listado ordenado de los 100 principales pares proveedor-institución de mayor volatilidad de precios con desglose por contrato para seguimiento investigativo.',
    ],
  },

  // === STORY 11: 2020: The Line in Time ===
  {
    slug: 'el-ano-de-la-emergencia',
    outlet: 'investigative',
    type: 'case',
    era: 'amlo',
    headline: "The Ratchet: Four Years Without a Way Back",
    headline_es: "El trinquete: cuatro años sin camino de regreso",
    subheadline:
      "A March 2020 emergency decree let federal health authorities buy what the epidemic required without a public tender. The direct-award rate barely moved — it was already 77.8%. Every full year from 2020 to 2024 was more direct than any year before it; the partial 2025 record, at 68.2%, is the first to fall back below.",
    subheadline_es:
      "Un decreto de emergencia de marzo de 2020 permitió a las autoridades federales de salud comprar lo que exigía la epidemia sin licitación pública. La tasa de adjudicación directa apenas se movió: ya estaba en 77.8%. Cada año completo de 2020 a 2024 fue más directo que cualquier año anterior; el registro parcial de 2025, con 68.2%, es el primero que vuelve a quedar por debajo.",
    byline: 'RUBLI Unidad de Análisis de Datos',
    estimatedMinutes: 10,
    status: 'reporteado',
    leadStat: {
      value: '79.1%',
      label: "the lowest direct-award year of 2021–24 · 2022",
      label_es: "el año con menos adjudicación directa de 2021–24 · 2022",
      sublabel: "higher than every year CompraNet recorded before the pandemic",
      sublabel_es: "más alto que cualquier año que CompraNet registró antes de la pandemia",
      color: '#dc2626',
    },
    kickerStats: [
      {
        prefix: "In 2019, competition still won",
        prefix_es: "En 2019, la competencia todavía ganaba en",
        value: '22.2%',
        suffix: "of contracts.",
        suffix_es: "de los contratos.",
        tone: 'muted',
      },
      {
        prefix: "In 2020 that barely moved, to",
        prefix_es: "En 2020 eso apenas se movió, a",
        value: '21.9%',
        suffix: "— while awarded value rose 44%.",
        suffix_es: "— mientras el monto adjudicado subía 44%.",
        tone: 'critical',
      },
      {
        prefix: "HEMOSER, a health supplier in RUBLI's analyst-labelled case set (no public ruling), booked",
        prefix_es: "HEMOSER, proveedor de salud en la base de casos etiquetada por analistas de RUBLI (sin resolución pública), facturó",
        value: '4.5B MXN',
        suffix: "in 2020 — 97% of it from IMSS.",
        suffix_es: "en 2020 — el 97% del IMSS.",
        tone: 'data',
      },
    ],
    lensTags: {
      patterns: ['P5', 'P7'],
      sectors: ['salud'],
      years: [2020, 2021],
    },
    corrections: [
      "2026-09-19 — An earlier edition read the April 2020 emergency decree as opening a surge of direct awards. The register holds 158,319 federal contracts in 2020, 18 percent fewer than 2019, at a direct-award rate of 78.1 percent against 77.8 the year before; what changed was the money, not the procedure mix.",
    ],
    corrections_es: [
      "2026-09-19 — Una edición anterior leía el decreto de emergencia de abril de 2020 como la apertura de una ola de adjudicaciones directas. El registro guarda 158,319 contratos federales en 2020, 18 por ciento menos que en 2019, con una tasa de adjudicación directa de 78.1 por ciento frente a 77.8 el año anterior; lo que cambió fue el dinero, no la mezcla de procedimientos.",
    ],
    chapters: [
      {
        id: 'ch1',
        number: 1,
        title: "The System Before",
        title_es: "El sistema de antes",
        subtitle:
          "Already non-competitive — but every shortcut still had to be written down",
        subtitle_es:
          "Ya era poco competitivo — pero cada atajo aún tenía que quedar por escrito",
        prose: [
          "Mexican federal procurement was tilted against competition long before COVID. In 2019, 77.8% of federal contracts were handed out as direct awards, no bidding. That was not a bad year — it was the normal one, and the highest of a decade that had climbed almost without interruption. CompraNet only began recording the award procedure with its 2010 files, and 2011 is the first year it covers in full; since then, the direct-award rate has never dropped below 67.5%. Against the EU Single Market Scoreboard, which treats a direct-award share at or above 10% as unsatisfactory, the entire Mexican record is an outlier.",
          "But the pre-COVID system had one thing the post-COVID system lost: a tripwire. The Ley de Adquisiciones requires competitive bidding by default and treats direct award as the exception — one that demands a written justification. A purchasing officer who wanted to skip the bidding still had to put on paper why. In 2019, 22.2% of contracts were competitive. A minority, but a defended one: every direct award stood on the record as a documented departure from the rule.",
          "That distinction is the whole story: the system was strained, not open. What kept it from tipping over was procedural, not statistical — the obligation to explain. What happened in 2020 was not the corruption of something clean. It was the removal of the one thing holding a tilted system in place.",
        ],
        prose_es: [
          "La contratación federal mexicana estaba amañada contra la competencia mucho antes del COVID. En 2019, el 77.8% de los contratos federales se entregaron por adjudicación directa, sin licitar. No fue un mal año: fue el año normal, y el más alto de una década que había subido casi sin interrupción. CompraNet apenas empezó a registrar el tipo de procedimiento con sus archivos de 2010, y 2011 es el primer año que cubre completo; desde entonces, la tasa de adjudicación directa nunca ha bajado del 67.5%. El Tablero del Mercado Único de la UE considera insatisfactoria una proporción de adjudicación directa igual o superior al 10%. Con esa vara, todo el registro mexicano es un caso atípico.",
          "Pero el sistema pre-COVID tenía algo que el sistema post-COVID perdió: un candado. La Ley de Adquisiciones exige licitación competitiva por defecto y trata la adjudicación directa como la excepción — una que obliga a justificarse por escrito. El funcionario de compras que quisiera saltarse la licitación todavía tenía que dejar por escrito el porqué. En 2019, el 22.2% de los contratos fueron competitivos. Una minoría, pero defendida: cada adjudicación directa quedaba en el registro como una desviación documentada de la regla.",
          "Esa distinción es toda la historia. El sistema estaba tensionado, no abierto. Lo que evitaba que se desbordara era de procedimiento, no estadístico: la obligación de explicar. Lo que pasó en 2020 no fue la corrupción de algo limpio. Fue la eliminación de lo único que sostenía en su lugar a un sistema ya inclinado.",
        ],
        pullquote: {
          quote:
            "The pre-COVID system was non-competitive, but it carried a tripwire: every direct award was an exception that had to be justified.",
          quote_es:
            "El sistema pre-COVID era poco competitivo, pero llevaba un candado: cada adjudicación directa era una excepción que tenía que justificarse.",
          stat: '77.8%',
          statLabel: "Direct-award rate · 2019 · the before-state baseline",
          statLabel_es: "Tasa de adjudicación directa · 2019 · línea base del estado anterior",
        },
        chartConfig: {
          type: 'live',
          live: 'covid-floor',
          chartId: 'covid-floor',
          title: 'The years above the line',
          title_es: 'Los años por encima de la línea',
        },
        sources: [
          'RUBLI. Módulo year-over-year. Tasas de adjudicación directa 2011–2024; las estructuras 2002–2009 de CompraNet no traen tipo de procedimiento y 2010 es una costura.',
                                                                                                                                                                'European Commission. Single Market Scoreboard — Public procurement (single bidder and direct awards indicators).',
        ],
      },
      {
        id: 'ch2',
        number: 2,
        title: "The Day the Rule Vanished",
        title_es: "El día que la regla desapareció",
        subtitle:
          "March 30, 2020 — the rule suspended, and what the numbers did next",
        subtitle_es:
          "30 de marzo de 2020 — la regla suspendida, y lo que hicieron los números después",
        prose: [
          "On March 30, 2020, the federal government declared a national health emergency, and the tripwire was cut. The Ley de Adquisiciones' competitive-bidding requirements were suspended for COVID procurement; any agency could now award contracts directly, with no process and no justification. The rule that had forced an explanation simply stopped applying.",
          "What came through the gap was not what the headlines promised. RUBLI records 158,319 federal contracts in 2020 — eighteen percent fewer than 2019, not more. The direct-award rate barely registered the decree at all: 78.1%, against 77.8% the year before, a difference of about 460 contracts. What did change was the money. Federal buyers awarded 509 billion pesos in 2020 against 352 billion in 2019, a 45% rise on a shrinking contract count.",
          "That is the shape of the year, and it is not the one the emergency was blamed for. The suspension did not throw a door open. The door was already open — 2019 handed out more than three contracts in four without a tender. Fewer contracts, far more money.",
          "Emergency speed is not automatically corruption — the early pandemic was a real supply shock, and speed can beat process. The question is who the suspension let move. One name that keeps surfacing is HEMOSER, a health-supplies vendor in Tier 2 of RUBLI's ARIA queue. RUBLI's analysts have placed it in the platform's ground-truth set on the strength of press reports on IMSS COVID-era purchasing; that is RUBLI's own label, not a finding by any court, auditor or sanctioning authority, and no public ruling against the company is on record. In 2020 it booked 4.48 billion pesos across 54 awards — 97% of that money from IMSS, against 89 million the year before.",
          "The pattern inside that year is stranger than the emergency story allows. Forty-six of HEMOSER's 54 awards were direct — 85% of them — and those 46 carry under 5% of its money. The two awards that carry 95% of it went through public tenders, in August, months after the decree; RUBLI's model scores both at the top of its scale. The suspension is not where this vendor's money moved. What the calendar below shows is concentration: a single award on 13 August is 71% of HEMOSER's entire year.",
        ],
        prose_es: [
          "El 30 de marzo de 2020, el gobierno federal declaró emergencia sanitaria nacional, y el candado se abrió. Los requisitos de licitación competitiva de la Ley de Adquisiciones quedaron suspendidos para las compras COVID; cualquier dependencia podía ahora adjudicar contratos directamente, sin proceso y sin justificación. La regla que obligaba a explicar simplemente dejó de aplicarse.",
          "Lo que pasó por la brecha no fue lo que prometieron los titulares. RUBLI registra 158,319 contratos federales en 2020 — un 18% menos que en 2019, no más. La tasa de adjudicación directa apenas registró el decreto: 78.1%, contra 77.8% el año anterior, una diferencia de unos 460 contratos. Lo que sí cambió fue el dinero. Las dependencias federales adjudicaron 509 mil millones de pesos en 2020 contra 352 mil millones en 2019, un alza del 45% sobre un conteo de contratos a la baja.",
          "Esa es la forma del año, y no es la que se le achacó a la emergencia. La suspensión no abrió una puerta de golpe. La puerta ya estaba abierta — en 2019 más de tres de cada cuatro contratos se entregaron sin licitar. Menos contratos, mucho más dinero.",
          "La velocidad de emergencia no es corrupción automática — los primeros meses de la pandemia fueron un choque de oferta real, y la velocidad puede ganarle al proceso. La pregunta es a quién dejó moverse la suspensión. Un nombre que reaparece es HEMOSER, proveedor de insumos de salud que está en el nivel 2 de la fila ARIA de RUBLI. Los analistas de RUBLI lo incluyeron en la base de casos de la plataforma a partir de reportajes sobre las compras del IMSS durante la pandemia; es una etiqueta propia de RUBLI, no una resolución de un tribunal, auditor o autoridad sancionadora, y no hay resolución pública en contra de la empresa. En 2020 facturó 4,480 millones de pesos en 54 adjudicaciones — el 97% de ese dinero del IMSS, frente a 89 millones el año anterior.",
          "El patrón dentro de ese año es más extraño de lo que admite el relato de la emergencia. Cuarenta y seis de las 54 adjudicaciones de HEMOSER fueron directas — el 85% — y esas 46 llevan menos del 5% de su dinero. Las dos adjudicaciones que llevan el 95% restante salieron por licitación pública, en agosto, meses después del decreto; el modelo de RUBLI califica ambas en el tope de su escala. La suspensión no es por donde se movió el dinero de este proveedor. El calendario de abajo marca la fecha en que se firmó cada adjudicación, la única fecha que guarda el registro; el agrupamiento de \"mismo día\" que califica ARIA viene de otro campo y no puede dibujarse aquí. Lo que el calendario sí muestra es concentración: una sola adjudicación del 13 de agosto es el 71% de todo el año de HEMOSER.",
        ],
        chartConfig: {
          type: 'live',
          live: 'covid-months',
          live2: 'covid-hemoser-calendar',
          scrolly: true,
          chartId: 'covid-months',
          title: 'The month competition was supposed to stop',
          title_es: 'El mes en que la competencia debía detenerse',
        },
        pullquote: {
          quote:
            "Eighty-five percent of HEMOSER's 2020 awards were direct. They carry under five percent of its money. The rest arrived through public tenders.",
          quote_es:
            "El 85% de las adjudicaciones de HEMOSER en 2020 fueron directas. Llevan menos del 5% de su dinero. El resto llegó por licitación pública.",
          stat: '4.5B MXN',
          statLabel: "HEMOSER · 54 awards in 2020 · 97% from IMSS",
          statLabel_es: "HEMOSER · 54 adjudicaciones en 2020 · 97% del IMSS",
        },
        sources: [
          'Diario Oficial de la Federación. "Acuerdo por el que se declara como emergencia sanitaria." 30 marzo 2020.',
          'RUBLI. Módulo year-over-year y monthly-breakdown. 158,319 contratos — 2020.',
          'RUBLI ARIA pipeline. HEMOSER: IPS tier 2, patrón primario P7 (etiqueta interna de revisión; sin resolución pública).',
          'COMPRANET registros de contratos. Proveedor HEMOSER (id 6038). Adjudicaciones 2020.',
        ],
      },
      {
        id: 'ch3',
        number: 3,
        title: "What Did Not Come Back",
        title_es: "Lo que no regresó",
        subtitle:
          "The emergency ended in 2021. The rate didn't.",
        subtitle_es:
          "La emergencia terminó en 2021. La tasa no.",
        prose: [
          "The COVID emergency was lifted in 2021. The direct-award rate should have fallen back toward its pre-COVID level. It didn't. It was 80.0% in 2021, 79.1% in 2022, then climbed to 82.3% in 2023 and settled at 79.2% in 2024 — and the lowest of those four years is higher than every year CompraNet recorded before 2020. For four years, emergency procurement behaved like a ratchet. The partial 2025 record, at 68.2%, is the first year to break it.",
          "The chart makes the shift impossible to miss — though not where you would expect it. The line sits on a 2015–2019 average of 75.8%, barely flinches in 2020 at 78.1%, and then steps onto a 2021–24 floor of 79.1%. The rupture is not the spike; there was no spike. It is the step: 3.3 points above the old average at its lowest, 6.5 at its highest, with no full year returning to the pre-pandemic band until the partial 2025 record.",
          "The verdict is structural, and it spans three administrations and every year CompraNet records the procedure for. The rate has climbed from 71.5% in 2011 to the low eighties, and no administration has delivered a sustained cut. By that measure, 2020 is not an anomaly. It is the hinge in a curve that was already bending — and the second figure shows where the hinge actually turned, in one sector rather than across the board.",
          "The emergency did not corrupt the system, and it did not start the climb. It came in the middle of a curve that was already bending, and for four years the curve did not bend back. Whether the partial 2025 figure marks a turn or a reporting gap, the register cannot yet say.",
        ],
        prose_es: [
          "La emergencia COVID se levantó en 2021. La tasa de adjudicación directa debió regresar hacia su nivel pre-COVID. No lo hizo. Fue del 80.0% en 2021, del 79.1% en 2022, luego subió al 82.3% en 2023 y se quedó en 79.2% en 2024 — y el más bajo de esos cuatro años está por encima de cualquier año que CompraNet registró antes de 2020. Durante cuatro años, la contratación de emergencia se comportó como un trinquete. El registro parcial de 2025, con 68.2%, es el primer año que lo rompe.",
          "La gráfica hace imposible no ver el cambio — aunque no donde uno lo esperaría. La línea se apoya en un promedio 2015–2019 de 75.8%, apenas se inmuta en 2020 con 78.1%, y luego sube un escalón a un piso 2021–24 de 79.1%. La ruptura no es el pico; no hubo pico. Es el escalón: 3.3 puntos sobre el promedio anterior en su punto más bajo, 6.5 en el más alto, sin que ningún año completo regrese a la banda pre-pandemia hasta el registro parcial de 2025.",
          "Es un veredicto estructural que abarca tres administraciones y todos los años en que CompraNet registra el procedimiento. La tasa subió del 71.5% en 2011 a los ochenta y tantos, y ninguna administración ha logrado un recorte sostenido. Con esa medida, 2020 no es una anomalía. Es la bisagra de una curva que ya venía doblándose — y la segunda figura muestra dónde giró de verdad esa bisagra: en un sector, no en todos.",
          "La emergencia no corrompió el sistema, ni inició la subida. Llegó a la mitad de una curva que ya venía doblándose, y durante cuatro años la curva no se enderezó. Si la cifra parcial de 2025 marca un giro o un hueco en el reporte, el registro todavía no lo puede decir.",
        ],
        // The typed `inline-line` this chapter carried (chartId
        // 'covid-da-rate-annual') is retired: its 2015-2024 points were hand
        // authored and every one of them disagreed with /analysis/year-over-year
        // — 2019 at 72.3 against 77.8, 2020 at 87 against 78.1. The live series
        // replaces it, and the sector dumbbell follows as the chapter's second
        // exhibit.
        chartConfig: {
          type: 'live',
          live: 'covid-ratchet',
          live2: 'covid-sectors',
          chartId: 'covid-ratchet',
          title: 'Four years without a way back',
          title_es: 'Cuatro años sin regreso',
        },
        pullquote: {
          quote:
            "For four years, emergency procurement worked like a ratchet: removing a barrier to direct award did not create a path back.",
          quote_es:
            "Durante cuatro años, la contratación de emergencia funcionó como un trinquete: quitar una barrera a la adjudicación directa no creó un camino de regreso.",
          stat: '79.1%',
          statLabel: "The lowest year of 2021–24 — above every year on record before 2020",
          statLabel_es: "El año más bajo de 2021–24 — sobre cualquier año registrado antes de 2020",
        },
        sources: [
          'RUBLI. Módulo year-over-year. Tasas de adjudicación directa 2011–2024.',
          'RUBLI. Endpoint /sectors con filtro de año. Adjudicación directa por sector, 2019 y 2020.',
          'IMCO. (2021). "Índice de transparencia presupuestaria." Adjudicación directa post-COVID.',
        ],
      },
    ],
    nextSteps: [
      "Cross-reference the contracts awarded directly during the COVID emergency against the SAT's EFOS blacklist — how many of those vendors appear on the fiscal blacklist?",
      'Map the increase by agency: only Salud and Otros got more direct in 2020 — which IMSS and ISSSTE units inside Salud account for the +3.3 points?',
      'Obtain the tender files for the two August 2020 public tenders that carry 95% of HEMOSER\'s year — how many bidders did each attract?',
    ],
    nextSteps_es: [
      'Cruzar los contratos adjudicados directamente durante la emergencia COVID con el listado EFOS del SAT — ¿cuántos de esos proveedores están en la lista negra fiscal?',
      'Analizar la distribución por dependencia: solo Salud y Otros se volvieron más directos en 2020 — ¿qué unidades del IMSS y del ISSSTE dentro de Salud explican esos +3.3 puntos?',
      'Obtener los expedientes de las dos licitaciones públicas de agosto de 2020 que concentran el 95% del año de HEMOSER — ¿cuántos licitantes atrajo cada una?',
    ],
    caseIds: [],
    relatedSlugs: ['el-modelo-bienestar'],
    entities: [
      {
        type: 'vendor',
        id: 6038,
        name: 'HEMOSER, S.A. DE C.V.',
        riskScore: 0.6816,
        ariaTier: 2,
        role: 'Health-supplies vendor · 54 awards in 2020, 97% from IMSS',
        role_es: 'Proveedor de insumos de salud · 54 adjudicaciones en 2020, 97% del IMSS',
      },
    ],
  },

  // === STORY 12: Five voucher issuers, a closed market, and a lead that keeps
  // changing hands. Rewritten SD-03 (2026-09-18) from /vendors/:id,
  // /vendors/:id/risk-timeline and /aria/queue/:id — the previous version's
  // 240B market, 96.7% Edenred direct-award rate, 2,210 / 2,868 single award
  // counts and "P5 · VOUCHER CARTEL" label had no source in the register.
  // See docs/story-days/SD-03-el-cartel-de-los-vales.md.
  {
    slug: 'el-cartel-de-los-vales',
    outlet: 'investigative',
    type: 'case',
    era: 'cross',
    byline: 'RUBLI Unidad de Análisis de Datos',
    status: 'auditado',
    estimatedMinutes: 8,
    headline: "Five Firms, a Closed Market, and a Winner That Keeps Changing",
    headline_es:
      "Cinco empresas, un mercado cerrado y un ganador que no deja de cambiar",
    subheadline:
      "Mexico's federal payment-card contracts run through five issuers: Toka, Edenred, Efectivale, Si Vale and Sodexo. Between 2001 and 2025 they took 142.6 billion pesos across 10,786 contracts, and 96.4 percent of those contracts arrived by one of two routes no rival could contest — a direct award, or a tender that ended with a single winner. What the register does not show is a fixed cast. The firm taking the most money changed three times in five administrations, and the largest of them today, Toka, has no federal contract on file before 2013. ARIA files all five under systematic overpricing: a reading of market structure, not a finding of fraud.",
    subheadline_es:
      "Los contratos federales de tarjetas de pago en México pasan por cinco emisoras: Toka, Edenred, Efectivale, Si Vale y Sodexo. Entre 2001 y 2025 se llevaron 142,600 millones de pesos en 10,786 contratos, y el 96.4 por ciento de esos contratos entró por una de dos rutas que ningún competidor podía disputar: la adjudicación directa o una licitación a la que se presentó un solo adjudicado. Lo que el registro no muestra es un reparto fijo. La empresa que se lleva más dinero cambió tres veces en cinco administraciones, y la más grande de hoy, Toka, no tiene un solo contrato federal antes de 2013. ARIA clasifica a las cinco bajo sobreprecio sistemático: una lectura de estructura de mercado, no una acusación de fraude.",
    leadStat: {
      value: '96.4%',
      label: "of the five issuers' contracts skipped an open contest",
      label_es: "de los contratos de las cinco emisoras no pasaron por un concurso abierto",
      sublabel: "10,786 contracts · direct award or a single-award procedure · 2001–2025",
      sublabel_es: "10,786 contratos · adjudicación directa o procedimiento con un solo adjudicado · 2001–2025",
      color: '#dc2626',
    },
    kickerStats: [
      {
        prefix: "Five voucher issuers hold",
        prefix_es: "Cinco emisoras de vales concentran",
        value: '142.6B MXN',
        suffix: "in federal contracts.",
        suffix_es: "en contratos federales.",
        tone: 'data',
      },
      {
        prefix: "Toka has led every complete year since",
        prefix_es: "Toka encabeza cada año completo desde",
        value: '2019',
        suffix: "— and holds no contract before 2013.",
        suffix_es: "— y no tiene contrato alguno antes de 2013.",
        tone: 'critical',
      },
      {
        prefix: "The lead changed hands",
        prefix_es: "El liderazgo cambió de manos",
        value: '3',
        suffix: "times in five administrations.",
        suffix_es: "veces en cinco administraciones.",
        tone: 'critical',
      },
    ],
    lensTags: {
      patterns: ['P5'],
      sectors: ['hacienda'],
      years: [2013, 2016, 2019, 2020, 2022, 2024],
    },
    corrections: [
      "2026-10-14 — RUBLI retrained its risk model (v0.8.5 to v0.9.1) and re-ran ARIA on 13 October 2026. An earlier edition said four of the five issuers sat at Tier 1 of the investigation queue and four were documented cases; after the re-run all five sit at Tier 2, and RUBLI's case set marks its links to four of them as false positives. The issuers' risk indicators on their chips are restated.",
    ],
    corrections_es: [
      "2026-10-14 — RUBLI reentrenó su modelo de riesgo (de v0.8.5 a v0.9.1) y volvió a correr ARIA el 13 de octubre de 2026. Una edición anterior decía que cuatro de las cinco emisoras estaban en el nivel 1 de la fila de investigación y que cuatro eran casos documentados; tras la nueva corrida las cinco están en el nivel 2, y la base de casos de RUBLI marca como falsos positivos sus vínculos con cuatro de ellas. Se reexpresan los indicadores de riesgo de sus fichas.",
    ],
    chapters: [
      {
        id: 'ch1',
        number: 1,
        title: "Five Names, and the Biggest Is the Newest",
        title_es: "Cinco nombres, y el más grande es el más nuevo",
        subtitle: "142.6 billion pesos of federal card contracts, 2001 to 2025",
        subtitle_es: "142,600 millones de pesos en contratos federales de tarjetas, de 2001 a 2025",
        prose: [
          "Federal money for food, fuel and welfare reaches the people it is meant for on a payment card, and five firms issue those cards. For the first eight years of this register there were only two. Efectivale and Sodexo hold every peso before 2010, and nobody else appears on the chart at all.",
          "Edenred arrives in 2010 and Si Vale with it, and the lead starts moving between them. Then, in 2013, a fifth firm appears that no account of this market has included: Toka Internacional, which holds no federal contract before that year and now holds more than any of the others — 51.8 billion pesos across 1,944 contracts.",
          "Toka has led every complete year since 2019. The register does not show it winning that position in a contest: 66.4 percent of its contracts came from tenders in which it was the only firm to appear. The firms it passed did not lose the market. They gave up a place inside it.",
          "Read as each year's share rather than each year's total, the shape is plainer: the names at the top rotate, and the market never opens. What everyone outside these five holds is not on the chart, because the federal classification has no voucher category to measure it against.",
        ],
        prose_es: [
          "El dinero federal para despensa, gasolina y bienestar llega a su destinatario en una tarjeta de pago, y cinco empresas la emiten. Los primeros ocho años de este registro sólo hubo dos. Efectivale y Sodexo se quedan con cada peso anterior a 2010, y nadie más aparece en la gráfica.",
          "Edenred entra en 2010 y Si Vale con ella, y el liderazgo empieza a moverse entre las dos. Luego, en 2013, aparece una quinta empresa que ningún relato de este mercado había incluido: Toka Internacional, que no tiene contrato federal antes de ese año y hoy tiene más que cualquiera de las otras — 51,800 millones de pesos en 1,944 contratos.",
          "Toka encabeza cada año completo desde 2019. El registro no la muestra ganando ese lugar en un concurso: el 66.4 por ciento de sus contratos salió de licitaciones en las que fue la única empresa que se presentó. Las firmas a las que rebasó no perdieron el mercado. Cedieron un lugar dentro de él.",
          "Leída como reparto de cada año y no como monto, la figura es más clara: los nombres de arriba rotan, y el mercado nunca se abre. Lo que tienen los que no son estas cinco no está en la gráfica, porque la clasificación federal no tiene una categoría de vales contra la cual medirlo.",
        ],
        chartConfig: {
          type: 'live',
          live: 'vales-stream',
          scrolly: true,
          title: 'Annual value by issuer, stacked — with a share lens',
          title_es: 'Valor anual por emisora, apilado — con lente de reparto',
        },
        pullquote: {
          quote:
            "The register does not show a market held still by a fixed set of names. It shows a queue, with a different firm at the front of it every few years.",
          quote_es:
            "El registro no muestra un mercado sostenido por un elenco fijo de nombres. Muestra una fila, y cada pocos años otra empresa al frente.",
          stat: '142.6B MXN',
          statLabel: "Five issuers · federal contracts · 2001–2025",
          statLabel_es: "Cinco emisoras · contratos federales · 2001–2025",
        },
        sources: [
          'RUBLI. /vendors/:id y /vendors/:id/risk-timeline — cinco emisoras de vales, 2001–2025. Efectivale suma sus tres registros (45016, 64, 3403).',
          'RUBLI. /categories/summary — 72 categorías activas, ninguna de vales: el tamaño del mercado completo no es medible aquí.',
        ],
      },
      {
        id: 'ch2',
        number: 2,
        title: "Two Ways to Keep Competition Out",
        title_es: "Dos formas de dejar fuera a la competencia",
        subtitle: "The direct award, the empty tender, and which firm prefers which",
        subtitle_es:
          "La adjudicación directa, la licitación vacía, y quién prefiere cuál",
        prose: [
          "Two routes carry almost everything these five firms hold. The first is the direct award: no tender is called, and the buyer names the supplier. The second is a tender that is called, published and formally run, and ends with exactly one winner. RUBLI counts a contract as single-award only under that second definition — the procedure was not a direct award, and exactly one vendor won it. Between them, the two routes account for 96.4 percent of the five firms' 10,786 contracts.",
          "The direct award is the route this market is usually described by, and the vendor record does not carry that reading. Edenred's direct-award rate is 39.8 percent across 2,898 contracts; its single-award rate is 57.9. The bypass is not the main door here. The empty tender is.",
          "Four of the five lean the same way. Toka takes 66.4 percent of its contracts from single-award procedures against 30.6 percent by direct award; Efectivale 59.5 against 36.4; Sodexo 54.7 against 37.9. Only Si Vale inverts it — 61.6 percent direct award against 36.6 single award — and Si Vale holds the fewest contracts of the five.",
          "One caution the data imposes on itself: CompraNet did not record the award procedure before 2010, so across the part of Efectivale's and Sodexo's record that predates it, a direct award cannot be distinguished from anything else. Their direct-award shares below are floors, not measurements. For Toka, Edenred and Si Vale, whose records begin in 2010 or later, the split is what the register says it is.",
        ],
        prose_es: [
          "Dos rutas cargan con casi todo lo que tienen estas cinco empresas. La primera es la adjudicación directa: no se convoca licitación y el comprador nombra al proveedor. La segunda es una licitación que sí se convoca, se publica y se desahoga formalmente, y que termina con exactamente un adjudicado. La bandera de RUBLI es precisa: is_single_bid se activa cuando el procedimiento no es adjudicación directa y aparece una sola empresa. Entre las dos rutas suman el 96.4 por ciento de los 10,786 contratos de las cinco.",
          "La adjudicación directa es la ruta con la que suele describirse este mercado, y el registro del proveedor no sostiene esa lectura. La tasa de adjudicación directa de Edenred es del 39.8 por ciento en 2,898 contratos; su tasa con un solo adjudicado es del 57.9. El atajo no es la puerta principal aquí. La licitación vacía sí.",
          "Cuatro de las cinco se inclinan igual. Toka saca el 66.4 por ciento de sus contratos de procedimientos con un solo adjudicado, frente a un 30.6 por ciento por adjudicación directa; Efectivale, 59.5 frente a 36.4; Sodexo, 54.7 frente a 37.9. Solo Si Vale lo invierte — 61.6 por ciento de adjudicación directa frente a 36.6 con un solo adjudicado — y Si Vale es la que menos contratos tiene de las cinco.",
          "Una advertencia que los propios datos imponen: CompraNet no anotaba el tipo de procedimiento antes de 2010, así que en la parte del registro de Efectivale y de Sodexo anterior a esa fecha, una adjudicación directa no se distingue de nada más. Sus porcentajes de adjudicación directa aquí abajo son pisos, no mediciones. Para Toka, Edenred y Si Vale, cuyos registros empiezan en 2010 o después, el reparto es el que dice el registro.",
        ],
        chartConfig: {
          type: 'live',
          live: 'vales-doors',
          live2: 'vales-roster',
          title: 'Direct award against single-award procedure, per firm',
          title_es: 'Adjudicación directa frente a procedimiento con un solo adjudicado, por empresa',
        },
        pullquote: {
          quote:
            "A tender was published, a process was run, and one firm turned up. That is 6,236 of these 10,786 contracts.",
          quote_es:
            "Se publicó una convocatoria, se llevó a cabo un proceso y se presentó una sola empresa. Eso son 6,236 de estos 10,786 contratos.",
          stat: '66.4%',
          statLabel: "Toka · contracts won from tenders with a single winner",
          statLabel_es: "Toka · contratos ganados en procedimientos con un solo adjudicado",
        },
        sources: [
          'RUBLI. Bandera is_single_bid: procedure_type != direct_award AND vendor_count_per_procedure = 1.',
          'RUBLI. /vendors/:id — direct_award_count y single_bid_count de las cinco emisoras, 2001–2025.',
        ],
      },
      {
        id: 'ch3',
        number: 3,
        title: "Five Governments, Three Handoffs, One Door",
        title_es: "Cinco gobiernos, tres relevos, una sola puerta",
        subtitle: "The occupant changes; the way in never does",
        subtitle_es: "Cambia el ocupante; la forma de entrar nunca",
        prose: [
          "Five administrations and three parties have governed Mexico across this record, and the claim that all of them bought from the same firms does not hold. Efectivale led under Fox and under Calderón. Si Vale led under Peña Nieto. Toka led under López Obrador, taking 64.9 percent of everything the five firms were awarded in that term. The lead changed hands three times.",
          "What did not change is the way in. Every one of these firms, under every one of these governments, arrived through the same two routes, and 96.4 percent of the contracts between them came through one or the other. A change of occupant is visible in the register. A change of method is not.",
          "The explanation always offered for this market's closure is infrastructure: the point-of-sale network, the beneficiary databases and the card-issuance systems cost more to build than any single contract can justify, so no challenger enters. That account fits a market with fixed occupants. It fits this one less well — because a challenger did enter. Toka appeared in 2013 and led within six years, and the door it came through was the one that was supposed to be shut.",
          "RUBLI has no evidence that any of these firms committed fraud in the legal sense. ARIA files all five under P5, systematic overpricing, which is a pricing indicator rather than a finding of collusion; its collusion-network pattern, P7, never rises above 0.5 confidence for any of them. After the October 2026 run all five sit at Tier 2 of the investigation queue, and RUBLI's case set marks its links to four of them as false positives. What this market needs is a procurement redesign, not a prosecution. No government on the list has reached for it.",
        ],
        prose_es: [
          "Cinco administraciones y tres partidos han gobernado México a lo largo de este registro, y la afirmación de que todos le compraron a las mismas empresas no se sostiene. Efectivale encabezó con Fox y con Calderón. Si Vale encabezó con Peña Nieto. Toka encabezó con López Obrador, y se llevó el 64.9 por ciento de todo lo adjudicado a las cinco en ese sexenio. El liderazgo cambió de manos tres veces.",
          "Lo que no cambió es la forma de entrar. Cada una de estas empresas, bajo cada uno de estos gobiernos, llegó por las mismas dos rutas, y el 96.4 por ciento de los contratos entre todas ellas entró por una o por la otra. El cambio de ocupante se ve en el registro. El cambio de método, no.",
          "La explicación que siempre se ofrece para el cierre de este mercado es la infraestructura: la red de puntos de venta, las bases de datos de beneficiarios y los sistemas de emisión de tarjetas cuestan más de lo que un solo contrato justifica, así que ningún retador entra. Ese relato encaja con un mercado de ocupantes fijos. Con este encaja menos — porque sí entró un retador. Toka apareció en 2013 y encabezaba seis años después, y la puerta por la que entró es la que se suponía cerrada.",
          "RUBLI no tiene evidencia de que ninguna de estas empresas haya cometido fraude en el sentido legal. ARIA clasifica a las cinco bajo P5, sobreprecio sistemático, que es un indicador de precio y no una acusación de colusión; su patrón de red de colusión, el P7, no rebasa 0.5 de confianza en ninguna de ellas. Tras la corrida de octubre de 2026 las cinco están en el nivel 2 de la fila de investigación, y la base de casos de RUBLI marca como falsos positivos sus vínculos con cuatro de ellas. Lo que este mercado necesita es un rediseño de la contratación, no una acusación penal. Ningún gobierno de la lista lo ha intentado.",
        ],
        chartConfig: {
          type: 'live',
          live: 'vales-sexenios',
          title: 'Share of the five-firm total, by administration',
          title_es: 'Reparto del total de las cinco, por sexenio',
        },
        pullquote: {
          quote:
            "Toka entered in 2013 and led by 2019. It did not force the market open — it walked in through the same door as everyone already inside.",
          quote_es:
            "Toka entró en 2013 y para 2019 encabezaba. No abrió el mercado — entró por la misma puerta que todos los que ya estaban dentro.",
          stat: '3',
          statLabel: "Changes of leader across five administrations",
          statLabel_es: "Cambios de líder en cinco administraciones",
        },
        sources: [
          'RUBLI. /vendors/:id/risk-timeline agregado por sexenio con lib/administrations.ts (el año de transición se atribuye al gobierno saliente).',
          'RUBLI ARIA. /aria/queue/:id — nivel IPS, ground truth, patrón primario y confianzas P1–P7.',
          'OCDE. (2022). "Integridad en las contrataciones públicas de México."',
        ],
      },
    ],
    nextSteps: [
      'Reconstruct Toka’s single-award procedures between 2019 and 2024 — who called them, on what timeline, against what specifications. 66.4% of its contracts came out of them.',
      'Trace what happened to Sodexo, which has no federal contract after 2024, and to Si Vale, whose share of the last term rounds to zero: exit from the market, or a change of registration?',
      'Confirm against the commercial register that Efectivale’s three vendor records (45016, 64, 3403) are one company, and why the 2002–2010 one carries no award procedure.',
      'Cross the awarded amounts against the number of social-programme beneficiaries — has the cost per beneficiary risen in real terms since 2010?',
      'Check whether any official who approved these contracts now works for one of the five issuers (revolving door).',
    ],
    nextSteps_es: [
      'Reconstruir los procedimientos con un solo adjudicado de Toka entre 2019 y 2024: quién convocó, con qué plazo y con qué especificaciones — 66.4% de sus contratos salieron de ahí.',
      'Rastrear qué pasó con Sodexo, que no tiene contrato federal después de 2024, y con Si Vale, que cae a 0.0% del reparto en el último sexenio: ¿salida del mercado o cambio de registro?',
      'Confirmar si los tres registros de Efectivale (45016, 64, 3403) son la misma empresa ante el registro mercantil, y por qué el de 2002–2010 no trae tipo de procedimiento.',
      'Cruzar los montos contra el número de beneficiarios de programas sociales — ¿el costo por beneficiario subió en términos reales desde 2010?',
      'Verificar si algún funcionario que aprobó estos contratos trabaja hoy para alguna de las cinco emisoras (puerta giratoria).',
    ],
    // Ordered by lifetime value. `riskScore` and `ariaTier` are the chip
    // registration's own — never a sibling entity's: Efectivale's 2002–2010
    // registration (64) is the ground-truth case, and 45016, the one still
    // trading and the one this chip opens, is the chip. Scores and tiers: run
    // 0fe1409e (13 Oct 2026, v0.9.1) — all five Tier 2.
    entities: [
      {
        type: 'vendor',
        id: 102627,
        name: 'TOKA INTERNACIONAL S A P I DE CV',
        riskScore: 0.9617,
        ariaTier: 2,
        role: 'Largest of the five · 51.8B MXN · has led every complete year since 2019',
        role_es: 'La más grande de las cinco · 51,800 MDP · encabeza cada año completo desde 2019',
      },
      {
        type: 'vendor',
        id: 44372,
        name: 'EDENRED MEXICO SA DE CV',
        riskScore: 0.8884,
        ariaTier: 2,
        role: 'Second by value · 38.6B MXN · 57.9% of its contracts from single-award procedures',
        role_es: 'Segunda por valor · 38,600 MDP · 57.9% de sus contratos en procedimientos con un solo adjudicado',
      },
      {
        type: 'vendor',
        id: 45016,
        name: 'EFECTIVALE S DE RL DE CV',
        riskScore: 0.8013,
        ariaTier: 2,
        role: 'Three registrations, one firm · 27.6B MXN · first in the record, 2001',
        role_es: 'Tres registros, una empresa · 27,600 MDP · la primera del registro, 2001',
      },
      {
        type: 'vendor',
        id: 44362,
        name: 'SI VALE MEXICO SA DE CV',
        riskScore: 0.692,
        ariaTier: 2,
        role: 'The only one of the five that leans on direct award · 61.6%',
        role_es: 'La única de las cinco que se apoya en la adjudicación directa · 61.6%',
      },
      {
        type: 'vendor',
        id: 474,
        name: 'SODEXO MOTIVATION SOLUTIONS MÉXICO, S.A. DE C.V.',
        riskScore: 0.7472,
        ariaTier: 2,
        role: 'Smallest by value · 8.7B MXN · no federal contract after 2024',
        role_es: 'La más pequeña por valor · 8,700 MDP · sin contrato federal después de 2024',
      },
    ],
  },
  // === STORY: El relevo de 2018 — federal buying at the EPN → AMLO handover (concept A «El pulso», 2026-10-20) ===
  // Facts fixed by _explore/2018/VERIFY.md; data frontend/public/data/relevo2018.json from
  // backend/scripts/extract_relevo2018.py. Body = components/stories/relevo2018 (one sticky instrument).
  {
    slug: 'el-relevo-de-2018',
    component: 'relevo2018',
    outlet: 'data_analysis',
    type: 'year',
    era: 'cross',
    byline: 'RUBLI Investigative Data Unit',
    status: 'reporteado',
    estimatedMinutes: 7,
    headline: 'The 2018 handover',
    headline_es: 'El relevo de 2018',
    subheadline: 'What happened to federal buying when Peña Nieto handed over to López Obrador: a shutdown ordered by the Treasury, an autumn at half pace, a vendor sweep and the 2019 medicines.',
    subheadline_es: 'Qué pasó con la compra federal cuando Peña Nieto entregó a López Obrador: un cierre ordenado por Hacienda, un otoño a la mitad, un barrido de proveedores y las medicinas de 2019.',
    leadStat: {
      value: '44%',
      label: 'of normal federal buying, 23 Aug – 30 Nov 2018 (excl. CFE and PEMEX)',
      label_es: 'de la compra federal normal, 23 ago – 30 nov 2018 (sin CFE ni PEMEX)',
      color: '#d0021b',
    },
    chapters: [],
    lensTags: { sectors: ['salud', 'infraestructura'], years: [2018, 2019, 2024], terms: ['relevo', 'transición', 'circular de Hacienda', 'veto'] },
    methodology: [
      'Everything is dated by contract date (the start date in the CompraNet source file), January 2013 to 28 September 2025. Amounts are nominal pesos. Contracts above 100 billion pesos are excluded; those above 10 billion are kept and marked †. CFE left CompraNet in September 2017 and PEMEX in 2015–2016, so the shutdown window, the weekly pulse and the institutions are measured without them, and the copy says so where it matters.',
      'The shutdown window is 23 August to 30 November. Its 2018 money is compared with the mean of the same stretch in 2013–2017. An institution’s own pace is what it contracted in that window divided by what it contracted from January to July of the same year, against its own 2013–2017 median; institutions with fewer than 30 contracts from January to July are left out. 2016, 2017, 2019 and 2021 are the placebo years.',
      'The vendor sweep takes, at each 1 December, the vendors with more than one million pesos in the previous twelve months and counts how many sign a new federal contract in the following twelve, by canonical vendor and by company tax id. Year two is shown only with its pandemic caveat. The 2024 coda quotes a 24-month cohort followed into ComprasMX. The medicine phases are the verified totals of the three distributors’ contracts signed from 1 December 2018 to 10 March 2019. The risk indicator is not used in this story.',
    ],
    methodology_es: [
      'Todo se fecha por fecha de contrato (la fecha de inicio del archivo fuente de CompraNet), de enero de 2013 al 28 de septiembre de 2025. Los montos son pesos nominales. Se excluyen los contratos mayores a 100 mil millones de pesos; los mayores a 10 mil millones se conservan y se marcan †. CFE dejó CompraNet en septiembre de 2017 y PEMEX en 2015–2016, así que el tramo del cierre, el pulso semanal y las instituciones se miden sin ellas, y el texto lo dice donde importa.',
      'El tramo del cierre va del 23 de agosto al 30 de noviembre. Su dinero de 2018 se compara con el promedio del mismo tramo en 2013–2017. El ritmo propio de una institución es lo que contrató en ese tramo entre lo que contrató de enero a julio del mismo año, contra su propia mediana de 2013 a 2017; se dejan fuera las instituciones con menos de 30 contratos de enero a julio. 2016, 2017, 2019 y 2021 son los años placebo.',
      'El barrido de proveedores toma, en cada 1 de diciembre, a los proveedores con más de un millón de pesos en los doce meses previos y cuenta cuántos firman un contrato federal nuevo en los doce siguientes, por proveedor canónico y por RFC de empresa. El segundo año solo se muestra con su salvedad de la pandemia. La coda de 2024 cita una cohorte de 24 meses seguida en ComprasMX. Las fases de las medicinas son los totales verificados de los contratos de las tres distribuidoras firmados del 1 de diciembre de 2018 al 10 de marzo de 2019. El indicador de riesgo no se usa en esta historia.',
    ],
  },
  // === STORY: El modelo Bienestar — twelve «Bienestar» entities and how they buy ===
  // Text: owner-approved Spanish (2026-10-13) + its English translation. Every
  // figure comes from the read-only SQL in the draft's appendix (12 entities with
  // Liconsa, re-run 2026-10-13; v3 grades, calibration CAL-GV3-20261008060330):
  // D:\Python\yangwenli\.claude\designus\institutions-macro-2026-10-08\story-bienestar-draft.md
  {
    slug: 'el-modelo-bienestar',
    methodology: [
      'This story uses RUBLI’s v3 institution grade, not the contract risk model. The grade measures how each institution buys on CompraNet with three pillars scored 0–100: Competition (how much of its contracts and pesos were awarded without a real contest), Process (short tender notices, purchases bunched into December, same-day splitting with the same supplier) and Concentration (dependence on a few suppliers compared with institutions of its type and size).',
      'Half of each pillar is measured against the national standard and half against institutions of the same level, type and size. Grades are read out of 10 (the 0–100 score divided by ten): 6.0 or more passes, under 6.0 fails; colours cut at 7.6, 6.0, 4.4 and 2.8 (calibration CAL-GV3-20261008060330). With few contracts the grade is provisional and carries an interval.',
      'Buying from investigated suppliers does not lower the grade, and neither does the risk model; both are reported separately. The grade does not see theft, payments without delivery or diversion of funds. That is what the ASF audits cited in chapter 5 are for, with their presumed or pending amounts.',
      'Spending and direct-award figures come from CompraNet 2002–2025 (the federal feed froze on 28 September 2025). The set of twelve entities was chosen by name and by function.',
    ],
    methodology_es: [
      'Esta historia usa la calificación de instituciones v3 de RUBLI, no el modelo de riesgo de contratos. La calificación mide cómo compra cada institución en CompraNet con tres pilares de 0 a 100: Competencia (qué parte de sus contratos y de sus pesos se adjudicó sin concurso real), Proceso (convocatorias cortas, compras concentradas en diciembre, fraccionamiento el mismo día con el mismo proveedor) y Concentración (dependencia de pocos proveedores frente a instituciones de su tipo y tamaño).',
      'La mitad de cada pilar se mide contra el estándar nacional y la otra mitad contra instituciones del mismo nivel, tipo y tamaño. Las calificaciones se leen sobre 10 (el puntaje de 0 a 100 entre diez): 6.0 o más aprueba, menos de 6.0 reprueba; los colores cortan en 7.6, 6.0, 4.4 y 2.8 (calibración CAL-GV3-20261008060330). Con pocos contratos la calificación es provisional y lleva un intervalo.',
      'Haber comprado a proveedores investigados no baja la calificación, y el modelo de riesgo tampoco; ambos se reportan aparte. La calificación no ve robo, pagos sin entrega ni desvíos. Para eso están las auditorías de la ASF que se citan en el capítulo 5, con sus montos presuntos o pendientes por aclarar.',
      'Las cifras de gasto y de adjudicación directa vienen de CompraNet 2002–2025 (el registro federal se congeló el 28 de septiembre de 2025). El conjunto de doce entidades se armó por nombre y por función.',
    ],
    outlet: 'data_analysis',
    type: 'thematic',
    era: 'cross',
    byline: 'RUBLI Investigative Data Unit',
    status: 'auditado',
    estimatedMinutes: 8,
    headline: 'Buying at the pace of urgency: twelve «Bienestar» entities and how they buy',
    headline_es: 'Comprar a la medida de la urgencia: doce entidades del aparato «Bienestar» y cómo compran',
    subheadline:
      'The entities that distribute food, provide health care to the uninsured and lend in the countryside buy in much the same way: almost all their contracts by direct award, in thousands of small purchases. None of the twelve passes: the best scores 5.4 out of 10. The grade measures how they buy, not whether anyone stole, which is why Segalmex, one of the best-documented fraud cases of the period, scores 5.4 and fails.',
    subheadline_es:
      'Las entidades que reparten comida, atienden la salud de quien no tiene seguro y prestan dinero en el campo compran de una manera muy parecida: casi todos sus contratos por adjudicación directa, en miles de compras pequeñas. Ninguna de las doce aprueba: la mejor saca 5.4 de 10. La calificación mide cómo compran, no si alguien robó, y por eso Segalmex, uno de los casos de fraude mejor documentados del periodo, saca 5.4 y reprueba.',
    leadStat: {
      value: '100%',
      label: "of the set's pesos went through entities that fail (under 6 out of 10)",
      label_es: 'del dinero del conjunto pasó por entidades reprobadas (menos de 6 de 10)',
      sublabel: 'federal government as a whole: 56%',
      sublabel_es: 'todo el gobierno federal: 56%',
      color: '#2563eb',
    },
    kickerStats: [
      {
        prefix: 'Of the 578 billion pesos the twelve spent,',
        prefix_es: 'De los 578 mil millones de pesos de las doce,',
        value: '100%',
        suffix: 'went through entities that fail (under 6 out of 10).',
        suffix_es: 'pasó por entidades reprobadas (menos de 6 de 10).',
        tone: 'critical',
      },
      {
        prefix: 'For the federal government as a whole the figure is',
        prefix_es: 'Para todo el gobierno federal la cifra es',
        value: '56%',
        suffix: '.',
        suffix_es: '.',
        tone: 'muted',
      },
      {
        prefix: 'Of the twelve, the number that pass (6.0 or more):',
        prefix_es: 'De las doce, las que aprueban (6.0 o más):',
        value: '0',
        suffix: '.',
        suffix_es: '.',
        tone: 'data',
      },
    ],
    relatedSlugs: ['marea-de-adjudicaciones', 'el-ano-de-la-emergencia', 'captura-institucional'],
    lensTags: {
      sectors: ['agricultura', 'salud', 'hacienda'],
      years: [2019, 2021, 2023],
      terms: ['Bienestar', 'Segalmex', 'Diconsa', 'Liconsa', 'adjudicación directa', 'ASF'],
    },
    chapters: [
      {
        id: 'ch1',
        number: 1,
        title: 'The set',
        title_es: 'El conjunto',
        prose: [
          'Twelve federal entities: 578 billion pesos across 396,547 contracts recorded in CompraNet, 6.8% of graded federal pesos.',
          'By grade: 3 under 2.8 (210 billion pesos), 3 from 2.8 to 4.3 (106 billion), 6 from 4.4 to 5.9 (262 billion). Not one passes: the best scores 5.4.',
          "By pesos: all of the set's money went through entities that fail (under 6 out of 10). For the federal government as a whole the figure is 56% (79% counting only the buyers that are still active). By count, all 12 fail, against 62% of federal buyers (73% of active ones).",
          'INSABI (43.6 points out of 100, read as 4.4) sits just below the 44-point cut: its interval, 42.1 to 44.9, crosses the line. Innovabienestar is tiny (147 contracts) and its band is wide.',
        ],
        prose_es: [
          'Doce entidades federales, 578 mil millones de pesos en 396,547 contratos registrados en CompraNet: 6.8% de los pesos federales calificados.',
          'Por calificación: 3 con menos de 2.8 (210 mil MDP), 3 de 2.8 a 4.3 (106 mil MDP), 6 de 4.4 a 5.9 (262 mil MDP). Ninguna aprueba: la mejor saca 5.4.',
          'Por pesos: todo el dinero del conjunto pasó por entidades reprobadas (menos de 6 de 10). Para todo el gobierno federal la cifra es 56% (79% si se cuentan sólo los compradores que siguen activos). Por número, las 12 reprueban, contra 62% de los federales (73% de los activos).',
          'INSABI (43.6 puntos de 100, que se leen 4.4) queda justo debajo del corte de 44 puntos: su intervalo, de 42.1 a 44.9, cruza la línea. Innovabienestar es diminuto (147 contratos) y su banda es amplia.',
        ],
        chartConfig: {
          type: 'inline-bar',
          chartId: 'bienestar-grades',
          title: "The set's spending by grade",
          title_es: 'Gasto del conjunto por calificación',
          // Appendix Q1 re-run: 4.4-5.9 x6 / 262.1 · 2.8-4.3 x3 / 106.0 · under 2.8 x3 / 210.3 (billion MXN).
          data: {
            points: [
              {
                label: 'Under 2.8 · 3 entities',
                label_es: 'Menos de 2.8 · 3 entidades',
                value: 210.3,
                highlight: true,
                annotation: 'DICONSA · BANCO DEL BIENESTAR · ALIMENTACIÓN PARA EL BIENESTAR',
              },
              {
                label: '2.8–4.3 · 3 entities',
                label_es: '2.8–4.3 · 3 entidades',
                value: 106.0,
                color: '#f59e0b',
                annotation: 'INSABI · BIRMEX · INNOVABIENESTAR',
              },
              {
                label: '4.4–5.9 · 6 entities',
                label_es: '4.4–5.9 · 6 entidades',
                value: 262.1,
                color: '#a16207',
                annotation: 'IMSS-BIENESTAR · LICONSA · SEC. BIENESTAR · SEGALMEX · CNBBBJ · FINABIEN',
              },
            ],
            unit: 'B MXN',
            unit_es: 'mil MDP',
            annotation:
              'None of the twelve passes (6.0 or more). Grades are out of 10; colour cut-offs at 7.6, 6.0, 4.4 and 2.8. The twelve entities, with score, pillars, spending and trend, are listed under «Subjects of this investigation» at the foot of the story; trend is by number of contracts, 2018–2025 (non-competitive share), and does not weight pesos.',
            annotation_es:
              'Ninguna de las doce aprueba (6.0 o más). Calificaciones sobre 10; cortes de color en 7.6, 6.0, 4.4 y 2.8. Las doce entidades, con puntuación, pilares, gasto y tendencia, están en «Sujetos de esta investigación», al pie de la historia; la tendencia es por número de contratos, 2018–2025 (proporción no competitiva), y no pondera pesos.',
          },
        },
        pullquote: {
          quote: "By pesos: all of the set's money went through entities that fail (under 6 out of 10).",
          quote_es: 'Por pesos: todo el dinero del conjunto pasó por entidades reprobadas (menos de 6 de 10).',
          stat: '100%',
          statLabel: "of the set's pesos, through failing entities (federal: 56%)",
          statLabel_es: 'del dinero del conjunto, por entidades reprobadas (federal: 56%)',
          barValue: 1,
          vizTemplate: 'dot-ratio',
          barLabel: "Failing · share of the set's 578 billion pesos",
          barLabel_es: 'Reprobadas · proporción de los 578 mil millones de pesos del conjunto',
        },
      },
      {
        id: 'ch2',
        number: 2,
        title: 'What they share: direct award',
        title_es: 'Lo que tienen en común: la adjudicación directa',
        prose: [
          'Between 2019 and 2025 the set awarded 63% of its pesos and 91% of its contracts directly. The rest of the federal buyers, over the same years: 38% of pesos and 79% of contracts.',
          'The pillar that costs them most is Competition, in ten of the twelve (at Diconsa it ties with Process, both at 0; the exceptions: Birmex, on concentration, and Alimentación para el Bienestar, on process). At Diconsa and at Alimentación para el Bienestar the single heaviest item is contract splitting: 59% and 63% of their contracts belong to groups of three or more contracts with the same supplier on the same day. The median for their peer group (federal, executive branch, large) is 2%. For a network that supplies thousands of rural stores, buying that way may be structural. To the grade it is just as visible.',
        ],
        prose_es: [
          'Entre 2019 y 2025, el conjunto adjudicó directamente 63% de sus pesos y 91% de sus contratos. El resto de los compradores federales, en los mismos años: 38% de los pesos y 79% de los contratos.',
          'El pilar que más les resta es Competencia en diez de las doce (en Diconsa empata con Proceso, ambos en 0; las excepciones: Birmex, por concentración, y Alimentación para el Bienestar, por proceso). En Diconsa y en Alimentación para el Bienestar la partida individual que más pesa es el fraccionamiento: 59% y 63% de sus contratos forman parte de grupos de tres o más contratos con el mismo proveedor el mismo día. La mediana de su grupo de pares (federales, ejecutivo, grandes) es 2%. Para una red que surte a miles de tiendas rurales, esa forma de comprar puede ser estructural. Para la calificación es igual de visible.',
        ],
        chartConfig: {
          type: 'inline-bar',
          chartId: 'bienestar-direct-award',
          title: 'Direct award, 2019–2025',
          title_es: 'Adjudicación directa, 2019–2025',
          // Appendix Q6 re-run: set (0.626 pesos, 0.914 contracts) vs other
          // federal (0.376, 0.785). Rounded to the whole percent the text uses.
          data: {
            points: [
              { label: 'The set · pesos', label_es: 'Conjunto · pesos', value: 63, highlight: true },
              { label: 'Rest of federal · pesos', label_es: 'Resto federal · pesos', value: 38, color: 'var(--color-text-muted)' },
              { label: 'The set · contracts', label_es: 'Conjunto · contratos', value: 91, highlight: true },
              { label: 'Rest of federal · contracts', label_es: 'Resto federal · contratos', value: 79, color: 'var(--color-text-muted)' },
            ],
            unit: '%',
            maxValue: 100,
            annotation:
              'Share awarded directly, 2019–2025: the twelve entities against every other federal buyer, by pesos and by number of contracts.',
            annotation_es:
              'Proporción adjudicada directamente, 2019–2025: las doce entidades contra el resto de los compradores federales, por pesos y por número de contratos.',
          },
        },
        pullquote: {
          quote: 'For a network that supplies thousands of rural stores, buying that way may be structural. To the grade it is just as visible.',
          quote_es: 'Para una red que surte a miles de tiendas rurales, esa forma de comprar puede ser estructural. Para la calificación es igual de visible.',
          stat: '91%',
          statLabel: "of the set's 2019–2025 contracts, by direct award (rest of federal: 79%)",
          statLabel_es: 'de los contratos del conjunto en 2019–2025, por adjudicación directa (resto federal: 79%)',
        },
      },
      {
        id: 'ch3',
        number: 3,
        title: 'Diconsa did not start with the brand',
        title_es: 'Diconsa no empezó con el sello',
        prose: [
          "Diconsa's 2.7 is not from this administration. Of its 131 billion pesos, 18 billion date from 2002–2012, 73 billion from 2013–2018 and 40 billion from 2019–2022. Its successor, Alimentación para el Bienestar (2023–2025, 35 billion pesos), inherited the model and the grade: 1.9 out of 10, with Competition 3 and Process 0. What the new name did not change was the way it buys.",
          'Liconsa did not start with the brand either: 34 of its 62 billion pesos predate 2019. Between 2019 and 2025 it awarded 59% of its pesos and 66% of its contracts directly.',
        ],
        prose_es: [
          'El 2.7 de Diconsa no es de este sexenio. De sus 131 mil MDP, 18 mil son de 2002–2012, 73 mil de 2013–2018 y 40 mil de 2019–2022. Su sucesora, Alimentación para el Bienestar (2023–2025, 35 mil MDP), heredó el modelo y la calificación: 1.9 de 10, con Competencia 3 y Proceso 0. Lo que el nombre nuevo no cambió fue la manera de comprar.',
          'Liconsa tampoco empezó con el sello: 34 de sus 62 mil MDP son anteriores a 2019. Entre 2019 y 2025 adjudicó directo 59% de sus pesos y 66% de sus contratos.',
        ],
        chartConfig: {
          type: 'inline-bar',
          chartId: 'bienestar-diconsa-periods',
          title: "Diconsa's spending by period",
          title_es: 'Gasto de Diconsa por periodo',
          // Appendix Q11: Diconsa (1327) → (17.8, 73.1, 40.4) billion MXN.
          data: {
            points: [
              { label: '2002–2012', value: 17.8, color: 'var(--color-text-secondary)' },
              { label: '2013–2018', value: 73.1, highlight: true },
              { label: '2019–2022', value: 40.4, color: 'var(--color-text-muted)' },
            ],
            unit: 'B MXN',
            unit_es: 'mil MDP',
            annotation: "69% of Diconsa's money predates 2019.",
            annotation_es: '69% del dinero de Diconsa es anterior a 2019.',
          },
        },
      },
      {
        id: 'ch4',
        number: 4,
        title: 'Health: three names for one job',
        title_es: 'Salud: tres nombres para una misma tarea',
        prose: [
          'INSABI (4.4, 2019–2023) and IMSS-Bienestar (4.9, 2023–2025) are stages of the same function: buying health care for people without social security. Birmex (3.1), the state distributor of vaccines and medicines, shares the pattern: 97% of its 2019–2025 pesos went by direct award, and its largest supplier takes 40% of what it buys (its peers’ median is 13%). IMSS-Bienestar has only three years of data: its trend cannot be measured yet.',
        ],
        prose_es: [
          'INSABI (4.4, 2019–2023) e IMSS-Bienestar (4.9, 2023–2025) son etapas de la misma función: comprar salud para quien no tiene seguro social. Birmex (3.1), la distribuidora estatal de vacunas y medicamentos, comparte el patrón: 97% de sus pesos de 2019–2025 por adjudicación directa, y su mayor proveedor concentra 40% de lo que compra (la mediana de sus pares es 13%). IMSS-Bienestar tiene apenas tres años de datos: su tendencia todavía no se puede medir.',
        ],
        pullquote: {
          quote: 'INSABI and IMSS-Bienestar are stages of the same function: buying health care for people without social security.',
          quote_es: 'INSABI e IMSS-Bienestar son etapas de la misma función: comprar salud para quien no tiene seguro social.',
          stat: '97%',
          statLabel: "of Birmex's 2019–2025 pesos, by direct award",
          statLabel_es: 'de los pesos de Birmex en 2019–2025, por adjudicación directa',
          barValue: 0.969,
          vizTemplate: 'dot-ratio',
          barLabel: 'Birmex · direct award, share of pesos',
          barLabel_es: 'Birmex · adjudicación directa, proporción de los pesos',
        },
      },
      {
        id: 'ch5',
        number: 5,
        title: 'Segalmex: why the grade says 5.4 and fails',
        title_es: 'Segalmex: por qué la calificación dice 5.4 y reprueba',
        // The mandatory sentence (draft § 5), stated up top as well as at the close.
        subtitle: 'The grade measures buying behaviour, not theft.',
        subtitle_es: 'La calificación mide el comportamiento de compra, no el robo.',
        prose: [
          "Segalmex is one of the best-documented fraud cases of the period. In RUBLI's case register it carries provenance tier A, an estimate of 15 billion pesos, and the ASF (Public Accounts 2019–2021) as its source. And yet its grade is 5.4 out of 10, failed.",
          'That is not an acquittal. It is the limit of what the grade measures. It measures how an institution buys in CompraNet: whether it tenders or awards directly, whether it splits purchases, whether it concentrates on a few suppliers. Segalmex fails on Competition (13 out of 100: 84% of its contracts were non-competitive) and does well on Process (74) and Concentration (75).',
          'CompraNet records 530 contracts for 19.7 billion pesos under its name. The documented case spans its subsidiaries (Diconsa, graded 2.7, and Liconsa, graded 5.3). What the ASF observed is, for the most part, what happens after the purchasing procedure or outside it.',
          'In the 2020 Public Accounts, the audit of Segalmex’s financial management (no. 327) left 5,640.6 million pesos pending clarification, among them a 185.2-million-peso shortfall of maize and beans between physical inventories and the records, and 910.0 million pesos for failing to show that a «specialised service in support of institutional activities» was provided. The forensic audit of Liconsa (no. 330) observed 518.4 million pesos paid to five companies with no documentation showing that the fresh milk and the drying (maquila) service were received, under contracts formalised by direct award, and 620.6 million pesos in dairy-transport services whose receipt was not shown.',
          'In the 2021 Public Accounts, the forensic audit of Segalmex’s purchases of goods and services (no. 356) left 1,386.7 million pesos pending clarification; the largest observation, 621.8 million pesos, was for payments for professional personnel-administration services with no documentation showing they were provided as contracted. These are presumed amounts or amounts pending clarification, not confirmed damage. A grade of purchasing procedures cannot see whether what was paid for was delivered.',
          'The grade does not see theft, payments without delivery or diversions of funds. A 5.4 says «buys like its peers, and badly», not «nothing happened here».',
          'The grade measures buying behaviour, not theft.',
        ],
        prose_es: [
          'Segalmex es uno de los casos de fraude mejor documentados del periodo. En el registro de casos de RUBLI aparece con nivel de procedencia A, una estimación de 15 mil MDP y como fuente la ASF (Cuenta Pública 2019–2021). Y aun así su calificación es 5.4 de 10, reprobada.',
          'No es una absolución. Es el límite de lo que mide la calificación. Mide cómo compra una institución en CompraNet: si concursa o adjudica directo, si fracciona, si concentra en pocos proveedores. Segalmex reprueba en Competencia (13 de 100: 84% de sus contratos fueron no competitivos) y sale bien en Proceso (74) y Concentración (75).',
          'CompraNet le registra 530 contratos por 19.7 mil MDP. El caso documentado abarca a sus filiales (Diconsa, con 2.7, y Liconsa, con 5.3). Lo que la ASF observó es, en su mayoría, lo que pasa después del procedimiento de compra o fuera de él.',
          'En la Cuenta Pública 2020, la auditoría a la gestión financiera de Segalmex (núm. 327) dejó 5,640.6 MDP pendientes por aclarar, entre ellos un faltante de maíz y frijol de 185.2 MDP entre los inventarios físicos y los registros, y 910.0 MDP por no acreditar que se prestó un «servicio especializado en apoyo de actividades institucionales». La auditoría forense a Liconsa (núm. 330) observó 518.4 MDP pagados a cinco empresas sin documentación que acredite la recepción de la leche fresca y del servicio de maquila de secado, en contratos formalizados por adjudicación directa, y 620.6 MDP en servicios de transporte de productos lácteos cuya recepción no se acreditó.',
          'En la Cuenta Pública 2021, la auditoría forense a las compras de bienes y servicios de Segalmex (núm. 356) dejó 1,386.7 MDP pendientes por aclarar; la observación mayor, 621.8 MDP, por pagos de servicios profesionales de administración de personal sin documentación que acredite que se prestaron conforme a lo contratado. Son montos presuntos o pendientes por aclarar, no daño confirmado. Una calificación de procedimientos de compra no puede ver si lo pagado se entregó.',
          'La calificación no ve robo, pagos sin entrega ni desvíos. Un 5.4 dice «compra como sus pares, y mal», no «aquí no pasó nada».',
          'La calificación mide el comportamiento de compra, no el robo.',
        ],
        // p1 case register · p2 grades · p3 the three audits · p4 nos. 327 + 330 · p5 no. 356
        sourceRefs: [[4], [4], [1, 2, 3], [1, 2], [3], [], []],
        sources: [
          'ASF. Cuenta Pública 2020. Auditoría de cumplimiento 2020-1-08JBP-19-0327-2021, «Gestión Financiera Seguridad Alimentaria Mexicana». https://www.asf.gob.mx/Trans/Informes/IR2020c/Documentos/Auditorias/2020_0327_a.pdf',
          'ASF. Cuenta Pública 2020. Auditoría de cumplimiento forense 2020-2-08VST-23-0330-2021, «Gestión Financiera LICONSA». https://www.asf.gob.mx/Trans/Informes/IR2020c/Documentos/Auditorias/2020_0330_a.pdf',
          'ASF. Cuenta Pública 2021. Auditoría de cumplimiento forense 2021-1-08JBP-23-0356-2022, «Gestión Financiera de las Erogaciones por la Adquisición de Bienes y Prestación de Servicios». https://www.asf.gob.mx/Trans/Informes/IR2021c/Documentos/Auditorias/2021_0356_a.pdf',
          'RUBLI. Registro de casos (ground_truth_cases), caso SEGALMEX; calificaciones v3 de instituciones (institution_grades_v3), calibración CAL-GV3-20261008060330.',
        ],
        chartConfig: {
          type: 'inline-roster',
          chartId: 'bienestar-asf',
          title: 'What the ASF observed, in million pesos',
          title_es: 'Lo que observó la ASF, en millones de pesos',
          // ASF informes individuales, verified against the PDFs 2026-10-13
          // (draft appendix, «ASF sources for § 5»).
          data: {
            points: [
              {
                label: "Segalmex · no. 327 · total",
                label_es: "Segalmex · núm. 327 · total",
                value: 5640.6,
                highlight: true,
                annotation: '2020 ACCOUNTS · PENDING CLARIFICATION',
                annotation_es: 'CP 2020 · PENDIENTE POR ACLARAR',
              },
              {
                label: "Unproven «specialised service»",
                label_es: "«Servicio especializado» sin acreditar",
                value: 910.0,
                annotation: 'SEGALMEX · NO. 327',
                annotation_es: 'SEGALMEX · NÚM. 327',
              },
              {
                label: "Maize and bean shortfall",
                label_es: "Faltante de maíz y frijol",
                value: 185.2,
                annotation: 'SEGALMEX · NO. 327 · INVENTORY VS RECORDS',
                annotation_es: 'SEGALMEX · NÚM. 327 · INVENTARIO VS REGISTROS',
              },
              {
                label: "Milk and drying, receipt unproven",
                label_es: "Leche y secado sin recepción acreditada",
                value: 518.4,
                annotation: 'LICONSA · NO. 330 · FIVE FIRMS · DIRECT AWARD',
                annotation_es: 'LICONSA · NÚM. 330 · CINCO EMPRESAS · ADJ. DIRECTA',
              },
              {
                label: "Dairy transport, receipt unproven",
                label_es: "Transporte de lácteos sin recepción acreditada",
                value: 620.6,
                annotation: 'LICONSA · 2020 ACCOUNTS · NO. 330 (FORENSIC)',
                annotation_es: 'LICONSA · CP 2020 · NÚM. 330 (FORENSE)',
              },
              {
                label: "Segalmex · no. 356 · total",
                label_es: "Segalmex · núm. 356 · total",
                value: 1386.7,
                highlight: true,
                annotation: '2021 ACCOUNTS · FORENSIC, PURCHASES · PENDING CLARIFICATION',
                annotation_es: 'CP 2021 · FORENSE, COMPRAS · PENDIENTE POR ACLARAR',
              },
              {
                label: "Personnel services, delivery unproven",
                label_es: "Servicios de personal sin acreditar",
                value: 621.8,
                annotation: 'SEGALMEX · NO. 356',
                annotation_es: 'SEGALMEX · NÚM. 356',
              },
            ],
            unit: 'M MXN',
            unit_es: 'MDP',
            annotation:
              'These are presumed amounts or amounts pending clarification, not confirmed damage. Totals carry an amber rail; the rows below each total are its largest observations.',
            annotation_es:
              'Son montos presuntos o pendientes por aclarar, no daño confirmado. Los totales llevan riel ámbar; las filas debajo de cada total son sus observaciones mayores.',
          },
        },
        pullquote: {
          quote: 'The grade measures buying behaviour, not theft.',
          quote_es: 'La calificación mide el comportamiento de compra, no el robo.',
          stat: '5.4',
          statLabel: "Segalmex's grade: 5.4 out of 10, with Competition at 13 out of 100",
          statLabel_es: 'calificación de Segalmex: 5.4 de 10, con Competencia en 13 de 100',
          role: 'verdict',
        },
      },
      {
        id: 'ch6',
        number: 6,
        title: 'What this story does not say',
        title_es: 'Lo que esta historia no dice',
        prose: [
          'It does not say that the «Bienestar» brand causes bad purchasing. The set was assembled by name (plus Liconsa and Birmex, by function), and Diconsa, which weighs most in the model’s history, spent 69% of its money before 2019.',
          'It does not say a crime occurred at any of these entities, except where an outside source documents one (Segalmex, ASF).',
          'It does not compare parties. That would require grading by administration, and v3 gives a single grade per institution and window.',
          'The set mixes two criteria: name («Bienestar» and its predecessors) and function (Liconsa and Birmex). Under a strictly functional criterion (food / health / social banking) other entities would come in and the figures would change.',
        ],
        prose_es: [
          'No dice que el sello «Bienestar» cause malas compras. El conjunto se armó por nombre (más Liconsa y Birmex, por función), y Diconsa, que más pesa en la historia del modelo, compró 69% de su dinero antes de 2019.',
          'No dice que hubo delito en ninguna de estas entidades salvo donde una fuente externa lo documenta (Segalmex, ASF).',
          'No compara partidos. Para eso habría que calificar por sexenio, y v3 da una sola calificación por institución y ventana.',
          'El conjunto mezcla dos criterios: nombre («Bienestar» y sus antecesoras) y función (Liconsa y Birmex). Con un criterio estrictamente por función (alimentos / salud / banca social) entrarían otras entidades y las cifras cambiarían.',
        ],
      },
    ],
    // The draft's 12-entity table (appendix Q0, re-run 2026-10-13), ordered by
    // spending; one row per entity, linked to its dossier.
    entities: [
      { type: 'institution', id: 3780, name: 'IMSS-Bienestar', role: '4.9 out of 10 · failed (48.6 points; 47.3–49.7) · Competition 19 · Process 48 · Concentration 78 · 137,600 M MXN · 11,299 contracts · 2023–2025 · trend: not enough years', role_es: '4.9 de 10 · reprobada (48.6 puntos; 47.3–49.7) · Competencia 19 · Proceso 48 · Concentración 78 · 137,600 MDP · 11,299 contratos · 2023–2025 · tendencia: sin años suficientes' },
      { type: 'institution', id: 1327, name: 'Diconsa', role: '2.7 out of 10 · failed (27.1 points; 27.1–27.2) · Competition 0 · Process 0 · Concentration 81 · 131,300 M MXN · 301,393 contracts · 2001–2022 · trend: stable', role_es: '2.7 de 10 · reprobada (27.1 puntos; 27.1–27.2) · Competencia 0 · Proceso 0 · Concentración 81 · 131,300 MDP · 301,393 contratos · 2001–2022 · tendencia: estable' },
      { type: 'institution', id: 3744, name: 'INSABI', role: '4.4 out of 10 · failed (43.6 points; 42.1–44.9) · Competition 20 · Process 39 · Concentration 72 · 65,700 M MXN · 3,560 contracts · 2019–2023 · trend: stable', role_es: '4.4 de 10 · reprobada (43.6 puntos; 42.1–44.9) · Competencia 20 · Proceso 39 · Concentración 72 · 65,700 MDP · 3,560 contratos · 2019–2023 · tendencia: estable' },
      { type: 'institution', id: 297, name: 'Liconsa', role: '5.3 out of 10 · failed (53.2 points; 52.5–53.9) · Competition 15 · Process 74 · Concentration 70 · 62,000 M MXN · 17,648 contracts · 2002–2025 · trend: improving', role_es: '5.3 de 10 · reprobada (53.2 puntos; 52.5–53.9) · Competencia 15 · Proceso 74 · Concentración 70 · 62,000 MDP · 17,648 contratos · 2002–2025 · tendencia: mejora' },
      { type: 'institution', id: 3714, name: 'Banco del Bienestar', role: '2.5 out of 10 · failed (24.9 points; 20.7–30.7) · Competition 13 · Process 42 · Concentration 19 · 44,300 M MXN · 748 contracts · 2019–2025 · trend: stable', role_es: '2.5 de 10 · reprobada (24.9 puntos; 20.7–30.7) · Competencia 13 · Proceso 42 · Concentración 19 · 44,300 MDP · 748 contratos · 2019–2025 · tendencia: estable' },
      { type: 'institution', id: 2066, name: 'Birmex', role: '3.1 out of 10 · failed (30.6 points; 29.9–31.2) · Competition 8 · Process 84 · Concentration 0 · 40,200 M MXN · 2,838 contracts · 2002–2025 · trend: stable', role_es: '3.1 de 10 · reprobada (30.6 puntos; 29.9–31.2) · Competencia 8 · Proceso 84 · Concentración 0 · 40,200 MDP · 2,838 contratos · 2002–2025 · tendencia: estable' },
      { type: 'institution', id: 1324, name: 'Secretaría de Bienestar', role: '5.3 out of 10 · failed (53.4 points; 52.4–54.6) · Competition 16 · Process 77 · Concentration 68 · 37,700 M MXN · 14,455 contracts · 2010–2025 · trend: stable', role_es: '5.3 de 10 · reprobada (53.4 puntos; 52.4–54.6) · Competencia 16 · Proceso 77 · Concentración 68 · 37,700 MDP · 14,455 contratos · 2010–2025 · tendencia: estable' },
      { type: 'institution', id: 3785, name: 'Alimentación para el Bienestar', role: '1.9 out of 10 · failed (18.7 points; 18.4–18.9) · Competition 3 · Process 0 · Concentration 53 · 34,700 M MXN · 41,246 contracts · 2023–2025 · trend: not enough years', role_es: '1.9 de 10 · reprobada (18.7 puntos; 18.4–18.9) · Competencia 3 · Proceso 0 · Concentración 53 · 34,700 MDP · 41,246 contratos · 2023–2025 · tendencia: sin años suficientes' },
      { type: 'institution', id: 3667, name: 'Segalmex', role: '5.4 out of 10 · failed (53.8 points; 51.3–56.2) · Competition 13 · Process 74 · Concentration 75 · 19,700 M MXN · 530 contracts · 2004–2025 · trend: improving', role_es: '5.4 de 10 · reprobada (53.8 puntos; 51.3–56.2) · Competencia 13 · Proceso 74 · Concentración 75 · 19,700 MDP · 530 contratos · 2004–2025 · tendencia: mejora' },
      { type: 'institution', id: 3503, name: 'Becas para el Bienestar (CNBBBJ)', role: '5.4 out of 10 · failed (53.8 points; 51.9–56.4) · Competition 18 · Process 79 · Concentration 64 · 2,700 M MXN · 1,680 contracts · 2017–2025 · trend: stable', role_es: '5.4 de 10 · reprobada (53.8 puntos; 51.9–56.4) · Competencia 18 · Proceso 79 · Concentración 64 · 2,700 MDP · 1,680 contratos · 2017–2025 · tendencia: estable' },
      { type: 'institution', id: 3678, name: 'Financiera para el Bienestar', role: '5.4 out of 10 · failed (54.4 points; 52.7–56.7) · Competition 20 · Process 85 · Concentration 58 · 2,500 M MXN · 1,003 contracts · 2018–2025 · trend: stable', role_es: '5.4 de 10 · reprobada (54.4 puntos; 52.7–56.7) · Competencia 20 · Proceso 85 · Concentración 58 · 2,500 MDP · 1,003 contratos · 2018–2025 · tendencia: estable' },
      { type: 'institution', id: 3794, name: 'Innovabienestar de México', role: '4.3 out of 10 · failed (42.6 points; 36.6–48.9) · Competition 22 · Process 57 · Concentration 49 · 60 M MXN · 147 contracts · 2023–2025 · trend: not enough years', role_es: '4.3 de 10 · reprobada (42.6 puntos; 36.6–48.9) · Competencia 22 · Proceso 57 · Concentración 49 · 60 MDP · 147 contratos · 2023–2025 · tendencia: sin años suficientes' },
    ],
  },
]

/** Published stories: every list, lookup and route reads this. */
export const STORIES: StoryDef[] = ALL_STORIES.filter((s) => !UNDER_EDITORIAL_REVIEW.has(s.slug))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function getStoryBySlug(slug: string): StoryDef | undefined {
  return STORIES.find((s) => s.slug === slug)
}

/**
 * Filter stories by Observatory lens tags. Used by both Newsroom (when
 * arriving from /atlas with lens/year/pin URL state) and by an inline
 * "stories matching this view" panel on /atlas itself.
 *
 * Match semantics: a story matches if ANY of its lensTags overlap with the
 * provided filter. Partial filters (only patterns, only sectors) are
 * supported. An empty filter returns all stories.
 */
export function getStoriesByLensTag(filter: {
  pattern?: AriaPattern
  sector?: SectorCode
  year?: number
}): StoryDef[] {
  if (!filter.pattern && !filter.sector && filter.year == null) return STORIES
  return STORIES.filter((s) => {
    const tags = s.lensTags
    if (!tags) return false
    if (filter.pattern && !(tags.patterns ?? []).includes(filter.pattern)) return false
    if (filter.sector && !(tags.sectors ?? []).includes(filter.sector)) return false
    if (filter.year != null && !(tags.years ?? []).includes(filter.year)) return false
    return true
  })
}

/**
 * Pick the localized version of a string field, falling back to English when
 * the Spanish version is absent.
 */
export function pickLang<T extends string | string[]>(
  en: T | undefined,
  es: T | undefined,
  lang: 'en' | 'es'
): T | undefined {
  if (lang === 'es' && es != null) return es
  return en
}

/**
 * Localize a chartConfig for the given language. Walks every translatable
 * text field (title, axis labels, annotations, point labels, multi-series
 * names, network anchors, stacked-bar rows) and swaps in the `_es` value
 * when present and lang is es. Falls back to English otherwise.
 *
 * This is what makes Spanish-mode story pages render charts in Spanish
 * — without it, chart titles and captions stay English even when the
 * surrounding prose translates correctly. (Bug discovered and fixed
 * April 2026.)
 */
function localizeChartConfig(
  cfg: StoryChapterDef['chartConfig'],
  lang: 'en' | 'es'
): StoryChapterDef['chartConfig'] {
  if (!cfg) return cfg
  const title = tidy(pickLang(cfg.title, cfg.title_es, lang) as string, lang)
  return {
    ...cfg,
    title,
    data: cfg.data
      ? {
          ...cfg.data,
          unit: pickLang(cfg.data.unit, cfg.data.unit_es, lang),
          yLabel: pickLang(cfg.data.yLabel, cfg.data.yLabel_es, lang),
          annotation: pickLang(cfg.data.annotation, cfg.data.annotation_es, lang),
          referenceLine: cfg.data.referenceLine
            ? {
                ...cfg.data.referenceLine,
                label: pickLang(
                  cfg.data.referenceLine.label,
                  cfg.data.referenceLine.label_es,
                  lang
                ) as string,
              }
            : cfg.data.referenceLine,
          referenceLine2: cfg.data.referenceLine2
            ? {
                ...cfg.data.referenceLine2,
                label: pickLang(
                  cfg.data.referenceLine2.label,
                  cfg.data.referenceLine2.label_es,
                  lang
                ) as string,
              }
            : cfg.data.referenceLine2,
          points: cfg.data.points.map((p) => ({
            ...p,
            label: pickLang(p.label, p.label_es, lang) as string,
            annotation: pickLang(p.annotation, p.annotation_es, lang),
          })),
        }
      : cfg.data,
    multiSeries: cfg.multiSeries
      ? {
          ...cfg.multiSeries,
          yLabel: pickLang(cfg.multiSeries.yLabel, cfg.multiSeries.yLabel_es, lang),
          annotation: pickLang(cfg.multiSeries.annotation, cfg.multiSeries.annotation_es, lang),
          series: cfg.multiSeries.series.map((s) => ({
            ...s,
            name: pickLang(s.name, s.name_es, lang) as string,
            totalCaption: pickLang(s.totalCaption, s.totalCaption_es, lang),
            annotation: s.annotation
              ? {
                  ...s.annotation,
                  text: pickLang(s.annotation.text, s.annotation.text_es, lang) as string,
                }
              : s.annotation,
          })),
        }
      : cfg.multiSeries,
    network: cfg.network
      ? {
          ...cfg.network,
          annotation: pickLang(cfg.network.annotation, cfg.network.annotation_es, lang),
          anchor: cfg.network.anchor
            ? {
                ...cfg.network.anchor,
                label: pickLang(
                  cfg.network.anchor.label,
                  cfg.network.anchor.label_es,
                  lang
                ) as string,
              }
            : cfg.network.anchor,
          nodes: cfg.network.nodes.map((n) => ({
            ...n,
            sublabel: pickLang(n.sublabel, n.sublabel_es, lang),
          })),
        }
      : cfg.network,
    stacked: cfg.stacked
      ? {
          ...cfg.stacked,
          annotation: pickLang(cfg.stacked.annotation, cfg.stacked.annotation_es, lang),
          anchor: cfg.stacked.anchor
            ? {
                ...cfg.stacked.anchor,
                label: pickLang(
                  cfg.stacked.anchor.label,
                  cfg.stacked.anchor.label_es,
                  lang
                ) as string,
              }
            : cfg.stacked.anchor,
          rows: cfg.stacked.rows.map((r) => ({
            ...r,
            label: pickLang(r.label, r.label_es, lang) as string,
            annotation: pickLang(r.annotation, r.annotation_es, lang),
          })),
        }
      : cfg.stacked,
  }
}

/** Resolve a chapter's display fields per language, with EN fallback. */
/** Lining glue (Weekend Track A) on optional strings. */
const mapStr = (v: string | undefined, f: (t: string) => string) => (v === undefined ? v : f(v))

export function localizeChapter(
  chapter: StoryChapterDef,
  lang: 'en' | 'es'
): {
  title: string
  subtitle: string | undefined
  prose: string[]
  pullquote: StoryChapterDef['pullquote']
  chartConfig: StoryChapterDef['chartConfig']
} {
  return {
    title: noOrphan(tidy(pickLang(chapter.title, chapter.title_es, lang) as string, lang)),
    subtitle: mapStr(pickLang(chapter.subtitle, chapter.subtitle_es, lang), (t) => tidy(t, lang)),
    prose: ((pickLang(chapter.prose, chapter.prose_es, lang) as string[]) ?? chapter.prose).map(glueDashes),
    pullquote: chapter.pullquote
      ? {
          ...chapter.pullquote,
          quote: noOrphan(tidy(pickLang(chapter.pullquote.quote, chapter.pullquote.quote_es, lang) as string, lang)),
          statLabel: pickLang(
            chapter.pullquote.statLabel,
            chapter.pullquote.statLabel_es,
            lang
          ) as string,
          barLabel: pickLang(chapter.pullquote.barLabel, chapter.pullquote.barLabel_es, lang),
        }
      : undefined,
    chartConfig: localizeChartConfig(chapter.chartConfig, lang),
  }
}

/** Resolve a story's display fields per language, with EN fallback. */
export function localizeStory(
  story: StoryDef,
  lang: 'en' | 'es'
): {
  headline: string
  subheadline: string
  leadStatLabel: string
  leadStatSublabel: string | undefined
  nextSteps: string[] | undefined
  corrections: string[] | undefined
} {
  return {
    headline: noOrphan(tidy(pickLang(story.headline, story.headline_es, lang) as string, lang)),
    // deck is running prose: dash glue only — word glue made long decks ragged (Track A)
    subheadline: glueDashes(pickLang(story.subheadline, story.subheadline_es, lang) as string),
    leadStatLabel: pickLang(story.leadStat.label, story.leadStat.label_es, lang) as string,
    leadStatSublabel: pickLang(story.leadStat.sublabel, story.leadStat.sublabel_es, lang),
    nextSteps: lang === 'es' ? (story.nextSteps_es ?? story.nextSteps) : story.nextSteps,
    corrections: lang === 'es' ? (story.corrections_es ?? story.corrections) : story.corrections,
  }
}

export function getRelatedStories(slug: string): StoryDef[] {
  const story = getStoryBySlug(slug)
  if (!story?.relatedSlugs) return []
  return story.relatedSlugs
    .map((s) => getStoryBySlug(s))
    .filter((s): s is StoryDef => s !== undefined)
}
