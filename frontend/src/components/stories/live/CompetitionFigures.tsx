/**
 * CompetitionFigures — the five live figures of «Ahora ve usted la competencia»
 * (SD-08).
 *
 * The story arrived with three numbers that the endpoints do not support and
 * one chapter whose thesis the register contradicts. `useCompetitionData`
 * carries the full note; the short version:
 *
 *  - The peak is **2014 at 65.65%**, not 2011 at 64.4%. 2011 is the first year
 *    above 60, which is the hook the prose actually wanted.
 *  - The run above 45% is **fourteen** years (2011-2024), and its floor is
 *    45.89% in 2022. (It read fifteen, 2010-2024, until the 2026-09-30
 *    contract_year migration moved 175,767 contracts out of 2010.)
 *  - "800,000+ single-award procedures" is off by a factor of two. The window
 *    holds about **362,000** single-award contracts; the whole register, across
 *    twenty-four years, holds 505,219. The story said both — 800,000 in ch1 and
 *    ch5, 504,903 in ch3 — and only the second was close.
 *  - ch2 said electronic bidding *raised* the single-award rate, from the high
 *    30s to over 50%. It did not. 2011 is the first full year the register
 *    codes procedure type (2010 is a seam, mostly Structure A), so it is the
 *    first year the denominator excludes direct awards. Measured the old way —
 *    against every contract — the same series **falls** from 37.4% (2009) to
 *    17.9% (2011). F2 draws both lines.
 *
 * Rules inherited from SD-01..07: HTML owns every glyph — there is no <text> in
 * this file — no label or value is truncated, a number never breaks across a
 * line, and a figure whose query fails says so in one mono line rather than
 * falling back to a typed number.
 */
import { Link } from 'react-router-dom'
import { ChartCard } from '@/components/stories/InlineCharts'
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import { formatCompactMXN, formatNumber } from '@/lib/utils'
import { SeriesLine, type SeriesPoint } from './SeriesLine'
import {
  BAND_FLOOR,
  DETAIL_DEPTH,
  EFECTIVALE_LEGACY,
  EFECTIVALE_PRIMARY,
  LAST_FULL_YEAR,
  MONTHLY_CROSSCHECK_2011_2024,
  WINDOW_FROM,
  inWindow,
  provableDepth,
  readSectors,
  readWinner,
  readYears,
  readPeak,
  readRun,
  sumSingleBid,
  useSectorStats,
  useWinnerDetails,
  useWinnerPool,
  useYearSeries,
  type WinnerReading,
  type YearReading,
} from './useCompetitionData'

export type CompetitionFigureKind =
  | 'sb-years'
  | 'sb-mirage'
  | 'sb-sectors'
  | 'sb-vendors'
  | 'sb-count'

/** The argument — a competitive procedure that ended with one winner. */
const EMPHASIS = 'var(--color-risk-critical)'
/** The second series in F2. */
const REFERENCE = 'var(--color-sector-tecnologia)'
/** Zinc — everything ordinary. Low is never green (Bible § 3.10). */
const FIELD = '#71717a'

const STAMP = { en: 'LIVE · COMPRANET', es: 'EN VIVO · COMPRANET' } as const

const pct2 = (v: number) => `${v.toFixed(2)}%`
const pct1 = (v: number) => `${v.toFixed(1)}%`

// ── shared card states ────────────────────────────────────────────────────

function Loading({ eyebrow, title, lang }: { eyebrow: string; title: string; lang: 'en' | 'es' }) {
  return (
    <ChartCard eyebrow={eyebrow} title={title} lang={lang} stamp={STAMP}>
      <div
        role="status"
        aria-label={lang === 'es' ? 'Cargando la figura en vivo' : 'Loading the live figure'}
        className="h-40 rounded-sm bg-surface-2 motion-safe:animate-pulse"
      />
    </ChartCard>
  )
}

function Unavailable({ eyebrow, title, lang }: { eyebrow: string; title: string; lang: 'en' | 'es' }) {
  return (
    <ChartCard eyebrow={eyebrow} title={title} lang={lang} stamp={STAMP}>
      <p className="px-2 py-8 font-serif text-[12px] leading-relaxed text-text-muted">
        {lang === 'es' ? 'Figura en vivo no disponible — ver ' : 'Live figure unavailable — see '}
        <Link to="/methodology" className="underline underline-offset-2 hover:text-text-secondary">
          /methodology
        </Link>
      </p>
    </ChartCard>
  )
}

/**
 * A row of facts under a figure.
 *
 * Each cell is its own unbreakable unit with a break opportunity between cells,
 * so the line wraps between facts and never inside one (STORY_DAYS § 7).
 */
function FactLine({ items, className = '' }: { items: React.ReactNode[]; className?: string }) {
  return (
    <div
      className={`flex flex-wrap items-baseline gap-x-3 gap-y-0.5 font-mono tabular-nums text-text-muted ${className}`}
      style={{ fontSize: 12 }}
    >
      {items.filter(Boolean).map((node, i) => (
        <span key={i} className="whitespace-nowrap">
          {node}
        </span>
      ))}
    </div>
  )
}

/** A closing line under a figure — the sum, the caveat, the rollup. */
function Footline({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="w-full pt-4 font-serif"
      style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--color-text-muted)', textWrap: 'pretty' }}
    >
      {children}
    </p>
  )
}

/**
 * A horizontal track with a rule on it — F3's bar and F4's bar are the same
 * object at two scales. Geometry is HTML boxes, not SVG, so there is no viewBox
 * to clip and no glyph inside it to shrink.
 */
function Track({
  fill,
  color,
  rule,
  height = 10,
}: {
  /** 0–1. */
  fill: number
  color: string
  /** 0–1 — a reference mark drawn across the track. */
  rule?: number
  height?: number
}) {
  return (
    <span className="relative block w-full" style={{ height, background: 'var(--color-border)', borderRadius: 1 }}>
      <span
        className="absolute inset-y-0 left-0 block"
        style={{ width: `${Math.max(fill * 100, 0.6)}%`, background: color, opacity: 0.9, borderRadius: 1 }}
      />
      {rule !== undefined ? (
        <span
          className="absolute inset-y-0 block"
          style={{ left: `${rule * 100}%`, width: 1.5, background: REFERENCE }}
        />
      ) : null}
    </span>
  )
}

// ── F1 · fourteen years above the line ─────────────────────────────────────

const F1_CHROME = {
  en: {
    eyebrow: 'FIGURE I · EVERY FULL YEAR ABOVE 45 PERCENT',
    title: 'Since procedure type was first recorded, no full year has dropped below 45 percent',
  },
  es: {
    eyebrow: 'FIGURA I · CADA AÑO COMPLETO ARRIBA DEL 45 POR CIENTO',
    title: 'Desde que se registra el tipo de procedimiento, ningún año completo ha bajado del 45 por ciento',
  },
}

function YearLine({ years, lang, stage = 3 }: { years: YearReading[]; lang: 'en' | 'es'; stage?: number }) {
  const es = lang === 'es'
  const c = F1_CHROME[lang]
  const window = years.filter(inWindow)
  const peak = readPeak(years)
  const run = readRun(years)
  const latestFull = window.filter((r) => !r.partial).at(-1)
  const partial = window.find((r) => r.partial)

  const points: SeriesPoint[] = window.map((r) => ({
    key: String(r.year),
    axis: String(r.year),
    value: r.rate,
    callout: stage >= 2 && peak && r.year === peak.year ? pct2(r.rate) : undefined,
    calloutSub: stage >= 2 && peak && r.year === peak.year ? String(r.year) : undefined,
    // No `emphasis` here, deliberately. SeriesLine draws the emphasis run as
    // the TAIL from the first marked point, so marking the peak reddened
    // 2014-2025 and drew the eye to a decline this chapter is not about. The
    // argument is the band, and the band is what carries the colour.
  }))

  return (
    <ChartCard
      eyebrow={c.eyebrow}
      title={c.title}
      lang={lang}
      stamp={STAMP}
      anchor={
        peak
          ? {
              value: pct2(peak.rate),
              label: es
                ? `de los contratos de procedimientos competitivos de ${peak.year} vinieron de un procedimiento con un solo adjudicado — el punto más alto del registro`
                : `of ${peak.year}'s contracts in competitive procedures came from a procedure with exactly one winner — the register's high-water mark`,
              color: EMPHASIS,
            }
          : undefined
      }
      annotation={
        es
          ? `Contratos con un solo adjudicado como proporción de los contratos de procedimientos competitivos de cada año: el denominador excluye la adjudicación directa, que por construcción atrae a un solo proveedor. La serie arranca en ${WINDOW_FROM} porque es el primer año en que el registro codifica el tipo de procedimiento en todo el año — antes no hay competitivos que separar, y ${WINDOW_FROM - 1} es una costura que en su mayoría aún se archiva sin tipo de procedimiento (F2). ${partial ? `${partial.year} está incompleto: el feed federal se congeló el 28 de septiembre de 2025.` : ''}`
          : `Single-award contracts as a share of each year's contracts in competitive procedures: the denominator excludes direct awards, which draw one vendor by construction. The series starts in ${WINDOW_FROM} because that is the first year the register codes procedure type across the whole year — before it there are no competitive procedures to separate out, and ${WINDOW_FROM - 1} is a seam still mostly filed without a procedure type (F2). ${partial ? `${partial.year} is incomplete: the federal feed froze on 28 September 2025.` : ''}`
      }
    >
      <div className="px-4 pb-2 sm:px-5">
        <SeriesLine
          points={points}
          yMin={0}
          yMax={70}
          yTicks={[0, 15, 30, 45, 60]}
          formatTick={(v) => `${v}%`}
          bands={
            stage >= 3 && run
              ? [
                  {
                    from: BAND_FLOOR,
                    to: 70,
                    label: es ? `${run.length} años ≥ ${BAND_FLOOR}%` : `${run.length} years ≥ ${BAND_FLOOR}%`,
                    color: EMPHASIS,
                  },
                ]
              : []
          }
          ariaSummary={
            es
              ? `Tasa anual con un solo adjudicado sobre procedimientos competitivos, ${window[0]?.year} a ${window.at(-1)?.year}: ${window.map((r) => `${r.year} ${pct2(r.rate)}`).join('; ')}.`
              : `Annual single-award rate over competitive procedures, ${window[0]?.year} to ${window.at(-1)?.year}: ${window.map((r) => `${r.year} ${pct2(r.rate)}`).join('; ')}.`
          }
        />

        {stage >= 1 && latestFull ? (
          <FactLine
            className="mt-3"
            items={[
              <>
                {latestFull.year}: {pct2(latestFull.rate)}
              </>,
              <>
                {formatNumber(latestFull.singleBid)} {es ? 'de' : 'of'} {formatNumber(latestFull.competitive)}{' '}
                {es ? 'procedimientos' : 'procedures'}
              </>,
            ]}
          />
        ) : null}

        {stage >= 3 && run ? (
          <Footline>
            {es
              ? `${run.length} años seguidos, ${run.from}–${run.to}, por encima del ${BAND_FLOOR}%. El piso de esa racha es ${pct2(run.floor.rate)} en ${run.floor.year}. Una edición anterior situaba el pico en 64.4% en 2011; el pico es ${peak ? `${pct2(peak.rate)} en ${peak.year}` : '—'}. 2011 es el primer año por encima del 60%.`
              : `${run.length} straight years, ${run.from}–${run.to}, above ${BAND_FLOOR}%. The floor of that run is ${pct2(run.floor.rate)} in ${run.floor.year}. An earlier edition put the peak at 64.4% in 2011; the peak is ${peak ? `${pct2(peak.rate)} in ${peak.year}` : '—'}. 2011 is the first year above 60%.`}
          </Footline>
        ) : null}
      </div>
    </ChartCard>
  )
}

// ── F2 · the reform mirage ────────────────────────────────────────────────

const F2_CHROME = {
  en: {
    eyebrow: 'FIGURE II · THE REFORM MIRAGE',
    title: 'The 2011 jump is the denominator changing, not the market',
  },
  es: {
    eyebrow: 'FIGURA II · EL ESPEJISMO DE LA REFORMA',
    title: 'El salto de 2011 es el denominador que cambia, no el mercado',
  },
}

function Mirage({ years, lang }: { years: YearReading[]; lang: 'en' | 'es' }) {
  const es = lang === 'es'
  const c = F2_CHROME[lang]
  const before = years.filter((r) => r.uncoded).at(-1)
  const after = years.find((r) => r.year === WINDOW_FROM)
  const breakIdx = years.findIndex((r) => r.year === WINDOW_FROM)

  const points: SeriesPoint[] = years.map((r) => ({
    key: String(r.year),
    axis: String(r.year),
    value: r.rate,
    callout: before && after && (r.year === before.year || r.year === after.year) ? pct1(r.rate) : undefined,
    emphasis: r.year >= WINDOW_FROM,
  }))

  return (
    <ChartCard
      eyebrow={c.eyebrow}
      title={c.title}
      lang={lang}
      stamp={STAMP}
      anchor={
        before && after
          ? {
              value: `${pct1(before.shareOfAll)} → ${pct1(after.shareOfAll)}`,
              label: es
                ? `medida contra todos los contratos, la proporción con un solo adjudicado CAE entre ${before.year} y ${after.year} — mientras la tasa publicada sube de ${pct1(before.rate)} a ${pct1(after.rate)}`
                : `measured against every contract, single-award contracts FALL between ${before.year} and ${after.year} — while the published rate climbs from ${pct1(before.rate)} to ${pct1(after.rate)}`,
              color: EMPHASIS,
            }
          : undefined
      }
      annotation={
        es
          ? `Dos formas de contar lo mismo. La línea sólida es la tasa publicada: contratos con un solo adjudicado sobre contratos de procedimientos competitivos. La línea punteada las cuenta sobre todos los contratos del año. Hasta 2009 las dos coinciden, porque el registro marca cero adjudicaciones directas en toda la Estructura A (2002–2009) y entonces «competitivo» significa «todo». ${WINDOW_FROM - 1} es una costura: la mayoría de sus contratos todavía viene de la Estructura A y apenas uno de cada nueve está codificado como adjudicación directa, así que las líneas apenas empiezan a separarse. Desde ${WINDOW_FROM} el tipo de procedimiento se codifica todo el año, el denominador de la línea sólida se encoge a menos de un tercio y la tasa salta. Nada en el mercado se movió entonces: cambió lo que el registro sabe.`
          : `Two ways of counting the same thing. The solid line is the published rate: single-award contracts over contracts in competitive procedures. The dashed line counts them over every contract that year. Through 2009 the two coincide, because the register records zero direct awards across the whole of Structure A (2002–2009), so "competitive" means "all of it". ${WINDOW_FROM - 1} is a seam: most of its contracts still come from Structure A and only one in nine is coded as a direct award, so the lines barely part. From ${WINDOW_FROM} procedure type is coded all year, the solid line's denominator shrinks to under a third, and the rate jumps. Nothing in the market moved: what moved is what the register knows.`
      }
    >
      <div className="px-4 pb-2 sm:px-5">
        <SeriesLine
          points={points}
          yMin={0}
          yMax={70}
          yTicks={[0, 15, 30, 45, 60]}
          formatTick={(v) => `${v}%`}
          markers={
            breakIdx > 0
              ? [
                  {
                    afterIndex: breakIdx - 1,
                    label: es ? `${WINDOW_FROM} · SE CODIFICA` : `${WINDOW_FROM} · TYPE CODED`,
                  },
                ]
              : []
          }
          overlay={{
            values: years.map((r) => r.shareOfAll),
            color: FIELD,
            endLabel: es ? 'de todo' : 'of all',
          }}
          ariaSummary={
            es
              ? `Dos series, ${years[0]?.year} a ${years.at(-1)?.year}. Sobre procedimientos competitivos: ${years.map((r) => `${r.year} ${pct1(r.rate)}`).join('; ')}. Sobre todos los contratos: ${years.map((r) => `${r.year} ${pct1(r.shareOfAll)}`).join('; ')}.`
              : `Two series, ${years[0]?.year} to ${years.at(-1)?.year}. Over competitive procedures: ${years.map((r) => `${r.year} ${pct1(r.rate)}`).join('; ')}. Over all contracts: ${years.map((r) => `${r.year} ${pct1(r.shareOfAll)}`).join('; ')}.`
          }
        />

        {before && after ? (
          <FactLine
            className="mt-3"
            items={[
              <>
                {before.year} → {after.year}
              </>,
              <>
                {es ? 'competitivos' : 'competitive'}: {pct1(before.rate)} → {pct1(after.rate)}
              </>,
              <>
                {es ? 'todos los contratos' : 'all contracts'}: {pct1(before.shareOfAll)} → {pct1(after.shareOfAll)}
              </>,
              <>
                {es ? 'adjudicación directa' : 'direct award'}: {pct1(before.directAwardPct)} →{' '}
                {pct1(after.directAwardPct)}
              </>,
              <>
                {es ? 'denominador' : 'denominator'} {after.year}: {formatNumber(after.competitive)}{' '}
                {es ? 'de' : 'of'} {formatNumber(after.contracts)}
              </>,
            ]}
          />
        ) : null}

        <Footline>
          {es
            ? `Por eso ninguna figura de esta historia compara un año anterior a ${WINDOW_FROM} con uno posterior, y por eso la afirmación de que la licitación electrónica empeoró la proporción con un solo adjudicado no se sostiene: es indistinguible de que el registro empezara a separar la adjudicación directa. Lo que sí se sostiene es lo que pasó después — catorce años sin volver a bajar.`
            : `This is why no figure in this story compares a year before ${WINDOW_FROM} with one after it, and why the claim that electronic bidding made single-award contracts worse does not stand: it is indistinguishable from the register starting to separate direct awards out. What does stand is what happened next — fourteen years without coming back down.`}
        </Footline>
      </div>
    </ChartCard>
  )
}

// ── F3 · where the tender runs alone ──────────────────────────────────────

const F3_CHROME = {
  en: {
    eyebrow: 'FIGURE III · WHERE THE TENDER RUNS ALONE',
    title: 'Half the sectors end most competitive tenders with one winner; infrastructure nine in ten',
  },
  es: {
    eyebrow: 'FIGURA III · DÓNDE SE LICITA A SOLAS',
    title: 'La mitad de los sectores cierra la mayoría de sus licitaciones con un solo adjudicado; infraestructura, nueve de cada diez',
  },
}

function Sectors({ rows, lang }: { rows: ReturnType<typeof readSectors>; lang: 'en' | 'es' }) {
  const es = lang === 'es'
  const c = F3_CHROME[lang]
  const top = rows[0]
  const totalSingleBid = rows.reduce((s, r) => s + r.singleBid, 0)
  const totalCompetitive = rows.reduce((s, r) => s + r.competitive, 0)
  const totalContracts = rows.reduce((s, r) => s + r.contracts, 0)
  const pooled = totalCompetitive > 0 ? (totalSingleBid / totalCompetitive) * 100 : 0

  return (
    <ChartCard
      eyebrow={c.eyebrow}
      title={c.title}
      lang={lang}
      stamp={STAMP}
      anchor={
        top
          ? {
              value: pct1(top.rate),
              label: es
                ? `de los contratos de procedimientos competitivos de ${top.name} vinieron de un procedimiento con un solo adjudicado — ${formatNumber(top.singleBid)} de ${formatNumber(top.competitive)}, en un mercado con cientos de constructoras mexicanas calificadas`
                : `of ${top.name}'s contracts in competitive procedures came from a procedure with a single winner — ${formatNumber(top.singleBid)} of ${formatNumber(top.competitive)}, in a market with hundreds of qualified Mexican construction firms`,
              color: EMPHASIS,
            }
          : undefined
      }
      annotation={
        es
          ? `Cada barra es la proporción de los contratos de procedimientos competitivos de ese sector que vinieron de un procedimiento con un solo adjudicado, sobre el registro completo. No se dibuja una línea externa: la línea de un solo oferente de la UE cuenta oferentes, y CompraNet registra ganadores. El segundo número de cada fila, «de todos», cuenta los mismos contratos con un solo adjudicado sobre TODOS los contratos del sector, adjudicación directa incluida: es la cifra que publica /analysis/single-bid-rate y es por eso que infraestructura aparece a veces como ${pct1(top?.shareOfAll ?? 0)}. Los dos son correctos; miden mundos distintos y no deben compararse entre sí.`
          : `Each bar is the share of that sector's contracts in competitive procedures which came from a procedure with a single winner, across the whole register. No external line is drawn: the EU's single-bidder line counts bidders, and CompraNet records winners. The second number on each row, "of all", counts the same single-award contracts over EVERY contract in the sector, direct awards included: it is the figure /analysis/single-bid-rate publishes, and it is why infrastructure is sometimes quoted at ${pct1(top?.shareOfAll ?? 0)}. Both are right; they measure different worlds and must not be read against each other.`
      }
    >
      <ol className="px-2 pb-2">
        {rows.map((r) => (
          <li key={r.sectorId} className="border-b border-border py-3">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <EntityIdentityChip type="sector" id={r.sectorId} name={r.name} size="sm" fullName />
            </div>

            <div className="mt-2 flex items-center gap-2">
              <span className="min-w-0 flex-1">
                <Track fill={r.rate / 100} color={r.color} />
              </span>
              <span
                className="w-[52px] shrink-0 whitespace-nowrap text-right font-mono tabular-nums text-text-primary"
                style={{ fontSize: 12 }}
              >
                {pct1(r.rate)}
              </span>
            </div>

            <FactLine
              className="mt-2"
              items={[
                <>
                  {formatNumber(r.singleBid)} {es ? 'de' : 'of'} {formatNumber(r.competitive)}{' '}
                  {es ? 'competitivos' : 'competitive'}
                </>,
                <>
                  {pct1(r.shareOfAll)} {es ? 'de todos los contratos' : 'of all contracts'}
                </>,
              ]}
            />
          </li>
        ))}
      </ol>

      <div className="px-2 pb-2">
        <Footline>
          {es
            ? `Los doce sectores. ${formatNumber(totalSingleBid)} contratos con un solo adjudicado sobre ${formatNumber(totalCompetitive)} contratos de procedimientos competitivos — ${pct1(pooled)} del total, sobre ${formatNumber(totalContracts)} contratos registrados.`
            : `All twelve sectors. ${formatNumber(totalSingleBid)} single-award contracts over ${formatNumber(totalCompetitive)} contracts in competitive procedures — ${pct1(pooled)} pooled, out of ${formatNumber(totalContracts)} contracts on the register.`}
        </Footline>
      </div>
    </ChartCard>
  )
}

// ── F4 · the winners of the unopposed tender ──────────────────────────────

const F4_CHROME = {
  en: {
    eyebrow: 'FIGURE IV · THE SINGLE-AWARD WINNERS',
    title: 'Rank the register by competitive procedures won as the only winner and the top is one trade',
  },
  es: {
    eyebrow: 'FIGURA IV · LOS GANADORES CON UN SOLO ADJUDICADO',
    title: 'Ordene el registro por procedimientos competitivos ganados como único adjudicado y la cima es un solo giro',
  },
}

function Winners({
  ranked,
  poolCut,
  lang,
}: {
  ranked: WinnerReading[]
  poolCut: number
  lang: 'en' | 'es'
}) {
  const es = lang === 'es'
  const c = F4_CHROME[lang]
  const depth = provableDepth(ranked, poolCut)
  const shown = ranked.slice(0, Math.max(depth, 5))
  const peak = shown[0]
  const efectivale = shown.filter((w) => w.id === EFECTIVALE_PRIMARY || w.id === EFECTIVALE_LEGACY)

  return (
    <ChartCard
      eyebrow={c.eyebrow}
      title={c.title}
      lang={lang}
      stamp={STAMP}
      anchor={
        peak
          ? {
              value: formatNumber(peak.singleBid),
              label: es
                ? `licitaciones «competitivas» federales ganadas por ${peak.name} como único adjudicado — ${pct1(peak.rate)} de todas las que disputó`
                : `federal "competitive" tenders won by ${peak.name} as the only winner — ${pct1(peak.rate)} of every one it entered`,
              color: EMPHASIS,
            }
          : undefined
      }
      annotation={
        es
          ? `Los ${shown.length} proveedores del registro con más victorias con un solo adjudicado. La lista es exhaustiva, no una selección: las victorias de un proveedor nunca pueden exceder su número de contratos, así que quien no esté entre los ${formatNumber(poolCut)}+ contratos que forman el grupo tiene menos de ${formatNumber(poolCut)} victorias y no puede desplazar a ninguna de estas filas. «Disputó» son los procedimientos competitivos del proveedor; la adjudicación directa se cuenta aparte porque no hay nada que ganar en ella. Coincidir con el patrón no es una acusación.`
          : `The ${shown.length} vendors on the register with the most single-award wins. The list is exhaustive rather than a selection: a vendor's wins can never exceed its contract count, so anyone outside the ${formatNumber(poolCut)}+ contract pool holds fewer than ${formatNumber(poolCut)} wins and cannot displace a row here. "Entered" is the vendor's competitive procedures; direct awards are counted separately because there is nothing to win in one. Matching the pattern is not an allegation.`
      }
    >
      <ol className="px-2 pb-2">
        {shown.map((w, i) => (
          <li key={w.id} className="border-b border-border py-3">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="whitespace-nowrap font-mono tabular-nums text-text-muted" style={{ fontSize: 12 }}>
                {String(i + 1).padStart(2, '0')}
              </span>
              <EntityIdentityChip type="vendor" id={w.id} name={w.name} size="sm" fullName />
            </div>

            <div className="mt-2 flex items-center gap-2">
              <span className="min-w-0 flex-1">
                <Track fill={peak ? w.singleBid / peak.singleBid : 0} color={EMPHASIS} />
              </span>
              <span
                className="w-[52px] shrink-0 whitespace-nowrap text-right font-mono tabular-nums text-text-primary"
                style={{ fontSize: 12 }}
              >
                {formatNumber(w.singleBid)}
              </span>
            </div>

            <FactLine
              className="mt-2"
              items={[
                <>
                  {pct1(w.rate)} {es ? 'de las que disputó' : 'of those it entered'}
                </>,
                <>
                  {formatNumber(w.competitive)} {es ? 'competitivos' : 'competitive'}
                </>,
                <>
                  {pct1(w.directAwardPct)} {es ? 'adjudicación directa' : 'direct award'}
                </>,
                <>{formatCompactMXN(w.value)}</>,
                w.firstYear && w.lastYear ? (
                  <>
                    {w.firstYear}–{w.lastYear}
                  </>
                ) : null,
              ]}
            />
          </li>
        ))}
      </ol>

      <div className="px-2 pb-2">
        <Footline>
          {efectivale.length === 2
            ? es
              ? `Dos de estas filas son la misma firma bajo dos identidades registrales: EFECTIVALE ${EFECTIVALE_LEGACY} corre de 2002 a 2010 y ${EFECTIVALE_PRIMARY} de 2010 en adelante. La historia imprimía la suma de ambas contra la entidad ${EFECTIVALE_LEGACY} sola, cuya cifra propia es ${formatNumber(efectivale.find((w) => w.id === EFECTIVALE_LEGACY)?.singleBid ?? 0)}. Se mantiene el ordenamiento por entidad, que es lo único que el registro permite verificar fila por fila; el capítulo suma la firma completa.`
              : `Two of these rows are the same firm under two registry identities: EFECTIVALE ${EFECTIVALE_LEGACY} runs 2002 to 2010, ${EFECTIVALE_PRIMARY} from 2010 on. The story printed their combined wins against entity ${EFECTIVALE_LEGACY} alone, whose own figure is ${formatNumber(efectivale.find((w) => w.id === EFECTIVALE_LEGACY)?.singleBid ?? 0)}. The ranking stays per entity, which is the only thing the register lets a reader check row by row; the chapter adds the firm up.`
            : es
              ? `Conteos en vivo; cada nombre resuelve a su expediente.`
              : `Counts live; each name resolves to its dossier.`}
        </Footline>
      </div>
    </ChartCard>
  )
}

// ── F5 · the count ────────────────────────────────────────────────────────

const F5_CHROME = {
  en: {
    eyebrow: 'FIGURE V · THE COUNT',
    title: 'What fourteen years above the line adds up to',
  },
  es: {
    eyebrow: 'FIGURA V · EL CONTEO',
    title: 'A cuánto suman catorce años arriba de la línea',
  },
}

const COUNT_H = 132

function Count({ years, lang }: { years: YearReading[]; lang: 'en' | 'es' }) {
  const es = lang === 'es'
  const c = F5_CHROME[lang]
  const run = readRun(years)
  const from = run?.from ?? WINDOW_FROM
  const to = run?.to ?? LAST_FULL_YEAR
  const bars = years.filter((r) => r.year >= from && r.year <= to)
  const total = sumSingleBid(years, from, to)
  const peak = bars.reduce((a, b) => (b.singleBid > a.singleBid ? b : a), bars[0])
  const tallest = peak?.singleBid ?? 1

  return (
    <ChartCard
      eyebrow={c.eyebrow}
      title={c.title}
      lang={lang}
      stamp={STAMP}
      anchor={{
        value: formatNumber(total),
        label: es
          ? `procedimientos competitivos federales que atrajeron exactamente una oferta, ${from}–${to}. La historia decía «más de 800,000»; el registro completo, de 2002 a 2025, tiene 505,219`
          : `federal competitive procedures that ended with exactly one winner, ${from}–${to}. The story said "more than 800,000"; the entire register, 2002 to 2025, holds 505,219`,
        color: EMPHASIS,
      }}
      annotation={
        es
          ? `Contratos con un solo adjudicado por año. Cada barra se reconstruye del mismo corte anual que dibuja la Figura I — contratos × la proporción competitiva × la tasa — de modo que las barras y la línea no pueden discrepar. La suma de los desgloses mensuales del registro, que cuenta las mismas filas directamente, da ${formatNumber(MONTHLY_CROSSCHECK_2011_2024)}: una diferencia de ${formatNumber(Math.abs(MONTHLY_CROSSCHECK_2011_2024 - total))} contratos sobre ${formatNumber(total)}, el redondeo de dos decimales.`
          : `Single-award contracts by year. Each bar is reconstructed from the same annual cut that draws Figure I — contracts × the competitive share × the rate — so the bars and the line cannot disagree. Summing the register's monthly breakdowns, which count the same rows directly, gives ${formatNumber(MONTHLY_CROSSCHECK_2011_2024)}: a difference of ${formatNumber(Math.abs(MONTHLY_CROSSCHECK_2011_2024 - total))} contracts in ${formatNumber(total)}, which is the two-decimal rounding.`
      }
    >
      <div className="px-4 pb-2 sm:px-5">
        <div className="flex items-end gap-[3px]" style={{ height: COUNT_H }} aria-hidden="true">
          {bars.map((r) => (
            <span
              key={r.year}
              className="min-w-0 flex-1"
              style={{
                height: `${Math.max((r.singleBid / tallest) * 100, 1)}%`,
                background: r.year === peak?.year ? EMPHASIS : FIELD,
                opacity: r.year === peak?.year ? 0.95 : 0.55,
                borderRadius: 1,
              }}
            />
          ))}
        </div>

        <div className="mt-1 flex items-baseline justify-between font-mono tabular-nums text-text-muted" style={{ fontSize: 12 }}>
          <span className="whitespace-nowrap">{from}</span>
          <span className="whitespace-nowrap">{to}</span>
        </div>

        <span className="sr-only">
          {es
            ? `Contratos con un solo adjudicado por año: ${bars.map((r) => `${r.year} ${formatNumber(r.singleBid)}`).join('; ')}.`
            : `Single-award contracts by year: ${bars.map((r) => `${r.year} ${formatNumber(r.singleBid)}`).join('; ')}.`}
        </span>

        {peak ? (
          <FactLine
            className="mt-3"
            items={[
              <>
                {es ? 'máximo' : 'peak'} {peak.year}: {formatNumber(peak.singleBid)}
              </>,
              <>
                {bars.at(-1)?.year}: {formatNumber(bars.at(-1)?.singleBid ?? 0)}
              </>,
              <>
                {es ? 'suma' : 'total'} {from}–{to}: {formatNumber(total)}
              </>,
            ]}
          />
        ) : null}

        <Footline>
          {es
            ? `La cuenta baja porque el gobierno federal licita cada vez menos, no porque compita más: entre ${from} y ${to} los procedimientos competitivos pasan de ${formatNumber(bars[0]?.competitive ?? 0)} a ${formatNumber(bars.at(-1)?.competitive ?? 0)}, mientras la adjudicación directa sube de ${pct1(bars[0]?.directAwardPct ?? 0)} a ${pct1(bars.at(-1)?.directAwardPct ?? 0)} de todo lo contratado. La proporción que atrae una sola oferta apenas se mueve.`
            : `The count falls because the federal government runs fewer contests, not because it holds more: between ${from} and ${to} competitive procedures drop from ${formatNumber(bars[0]?.competitive ?? 0)} to ${formatNumber(bars.at(-1)?.competitive ?? 0)}, while direct award climbs from ${pct1(bars[0]?.directAwardPct ?? 0)} to ${pct1(bars.at(-1)?.directAwardPct ?? 0)} of everything contracted. The single-award share barely moves.`}
        </Footline>
      </div>
    </ChartCard>
  )
}

// ── entry point ───────────────────────────────────────────────────────────

export default function LiveCompetitionFigure({
  kind,
  lang,
  stage = 3,
}: {
  kind: CompetitionFigureKind
  lang: 'en' | 'es'
  /** F1 only — the scroll beat (0–3). */
  stage?: number
}) {
  // Each figure enables only the pulls it needs. F1, F2 and F5 share one query
  // key, so the three of them cost the page a single request.
  const needsYears = kind === 'sb-years' || kind === 'sb-mirage' || kind === 'sb-count'
  const yearQ = useYearSeries(needsYears)
  const sectorQ = useSectorStats(kind === 'sb-sectors')
  const poolQ = useWinnerPool(kind === 'sb-vendors')

  // The ranking is decided from the pool's rounded products and printed from
  // the details, so the ids are known before the details resolve.
  const pool = poolQ.data ?? []
  const detailIds = pool
    .map((v) => ({ id: v.id, est: (v.total_contracts * (v.single_bid_pct ?? 0)) / 100 }))
    .sort((a, b) => b.est - a.est)
    .slice(0, DETAIL_DEPTH)
    .map((v) => v.id)
  const detailQs = useWinnerDetails(detailIds, kind === 'sb-vendors')

  const chrome =
    kind === 'sb-years'
      ? F1_CHROME[lang]
      : kind === 'sb-mirage'
        ? F2_CHROME[lang]
        : kind === 'sb-sectors'
          ? F3_CHROME[lang]
          : kind === 'sb-vendors'
            ? F4_CHROME[lang]
            : F5_CHROME[lang]

  if (kind === 'sb-sectors') {
    if (sectorQ.isPending) return <Loading {...chrome} lang={lang} />
    if (sectorQ.isError || !sectorQ.data?.data?.length) return <Unavailable {...chrome} lang={lang} />
    return <Sectors rows={readSectors(sectorQ.data.data)} lang={lang} />
  }

  if (kind === 'sb-vendors') {
    if (poolQ.isPending || detailQs.some((q) => q.isPending)) return <Loading {...chrome} lang={lang} />
    if (poolQ.isError || detailQs.some((q) => q.isError) || !pool.length)
      return <Unavailable {...chrome} lang={lang} />
    const ranked = detailQs
      .map((q) => q.data)
      .filter((d): d is NonNullable<typeof d> => Boolean(d))
      .map(readWinner)
      .sort((a, b) => b.singleBid - a.singleBid)
    if (!ranked.length) return <Unavailable {...chrome} lang={lang} />
    const poolCut = Math.min(...pool.map((v) => v.total_contracts))
    return <Winners ranked={ranked} poolCut={poolCut} lang={lang} />
  }

  if (yearQ.isPending) return <Loading {...chrome} lang={lang} />
  if (yearQ.isError || !yearQ.data?.data?.length) return <Unavailable {...chrome} lang={lang} />
  const years = readYears(yearQ.data.data)
  if (!years.filter(inWindow).length) return <Unavailable {...chrome} lang={lang} />

  if (kind === 'sb-years') return <YearLine years={years} lang={lang} stage={stage} />
  if (kind === 'sb-mirage') return <Mirage years={years} lang={lang} />
  return <Count years={years} lang={lang} />
}
