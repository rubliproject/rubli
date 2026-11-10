/**
 * CaptureFilm — /captura § III «Cómo se construye» (collapsed by default)
 *
 * The strict monotonic captures as a small-multiples grid of Reuters threshold-
 * crossing trajectories, faceted into "still captive today" vs "rose and fell"
 * on a shared 0–100% y-domain. GT/Tier seals render AT REST from the folded
 * `aria` field; clicks add the money ledger. Exhibit A left with the
 * captura-mitad remake (its role is row 01 of the MajorityLedger).
 */

import { useMemo } from 'react'
import { useQueryStates, parseAsString, parseAsStringLiteral } from 'nuqs'
import {
  type CaptureItem,
  type CaptureTopResponse,
  type CaptureLandscapeResponse,
} from '@/api/client'
import { formatCompactMXN } from '@/lib/utils'
import { RISK_TEXT_COLORS } from '@/lib/constants'
import { formatEntityName } from '@/lib/entity/format'
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import { CaptureTrajectory } from './CaptureTrajectory'
import { CaptureExpand } from './CaptureExpand'

type SortKey = 'cruce' | 'pico' | 'valor' | 'vigencia'
const SORT_KEYS: SortKey[] = ['cruce', 'pico', 'valor', 'vigencia']
const SORT_LABEL: Record<SortKey, { es: string; en: string }> = {
  cruce: { es: 'Año de cruce', en: 'Crossing year' },
  pico: { es: 'Pico', en: 'Peak' },
  valor: { es: 'MXN acumulado', en: 'Cumulative MXN' },
  vigencia: { es: 'Persistencia', en: 'Persistence' },
}

/** The URL key for one (institution, vendor) pair — the ?open= value. */
const keyOf = (c: CaptureItem) => `${c.institution_id}-${c.vendor_id}`

/** The panel a card's disclosure button controls (aria-controls target). */
const panelId = (c: CaptureItem) => `recibos-${c.institution_id}-${c.vendor_id}`

/** Short affordance on a card. */
const receiptsLabel = (lang: 'en' | 'es', expanded: boolean) =>
  lang === 'en'
    ? expanded
      ? 'receipts ↑'
      : 'receipts ↓'
    : expanded
      ? 'recibos ↑'
      : 'recibos ↓'

const crossingYear = (c: CaptureItem, ceil: number) =>
  [...c.timeline].sort((a, b) => a.year - b.year).find((p) => p.share_pct >= ceil)?.year ??
  c.peak_year

interface Props {
  data: CaptureItem[]
  thresholds: CaptureTopResponse['thresholds']
  landscape?: CaptureLandscapeResponse
  lang: 'en' | 'es'
}

export function CaptureFilm({ data, thresholds, landscape, lang }: Props) {
  const ceil = thresholds.ceil_share_pct
  // The film's two URL keys. nuqs writes them together, so two writes in one
  // tick cannot clobber each other the way a searchParams closure did, and
  // `clearOnDefault` keeps a default out of the URL entirely.
  const [{ sort, open: openKey }, setFilmState] = useQueryStates(
    {
      sort: parseAsStringLiteral(SORT_KEYS).withDefault('cruce'),
      open: parseAsString,
    },
    { history: 'replace', clearOnDefault: true },
  )

  /** One toggle for every card. */
  const toggle = (c: CaptureItem) => setFilmState({ open: openKey === keyOf(c) ? null : keyOf(c) })

  const { held, fell } = useMemo(() => {
    const bySort = (a: CaptureItem, b: CaptureItem) => {
      if (sort === 'pico') return b.peak_share_pct - a.peak_share_pct
      if (sort === 'valor') return b.cumulative_value_mxn - a.cumulative_value_mxn
      if (sort === 'vigencia') return b.latest_share_pct - a.latest_share_pct
      return crossingYear(a, ceil) - crossingYear(b, ceil) // earliest crossers first
    }
    return {
      held: data.filter((c) => c.latest_share_pct >= ceil).sort(bySort),
      fell: data.filter((c) => c.latest_share_pct < ceil).sort(bySort),
    }
  }, [data, sort, ceil])

  return (
    <section id="la-pelicula" aria-labelledby="pelicula-heading" className="mt-8 scroll-mt-14">
      {/* ── §C — the film: 13 threshold-crossing trajectories ── */}
      <h2
        id="pelicula-heading"
        className="ct-h2 mb-3"
      >
        {lang === 'en'
          ? `La Línea: ${data.length} lines crossing one line`
          : `La Línea: ${data.length} líneas que cruzan una línea`}
      </h2>
      {/* Standfirst — the legal-honesty sentence (frozen contract, kept once) */}
      <div>
        <p
          className="mb-2"
          style={{ fontSize: 15, lineHeight: 1.6, color: 'var(--color-text-secondary)', textWrap: 'pretty' }}
        >
          {lang === 'en'
            ? 'Institutional capture is not proof of wrongdoing. Some legitimate concentrations emerge from technical certification, regional exclusivity, or single-source regulatory dependency. Each line warrants investigation — not accusation.'
            : 'La captura institucional no es prueba de irregularidad. Algunas concentraciones legítimas emergen de certificación técnica, exclusividad regional, o dependencia regulatoria de proveedor único. Cada línea merece investigación — no acusación.'}
        </p>
        <p className="mb-3 ct-sc text-[13px] text-text-muted">
          {(lang === 'en'
            ? [
                `dashed rule = the ${ceil}% capture ceiling`,
                'zinc below',
                'red above',
                'faint dashes = years without data',
                '* 2025 partial, to Sep 28',
              ]
            : [
                `regla punteada = el techo de captura del ${ceil}%`,
                'zinc abajo',
                'rojo arriba',
                'punteado tenue = años sin datos',
                '* 2025 parcial, al 28 sep',
              ]
          ).map((term, i) => (
            // The separator is glued to the term's first word with a
            // non-breaking space, so a `·` can never orphan at a line end.
            // A whitespace-nowrap span round the WHOLE term overflows 390:
            // "dashed rule = the 50% capture ceiling" is wider than the column.
            <span key={term}>
              {i > 0 ? '· ' : ''}
              {term}
              {' '}
            </span>
          ))}
        </p>
      </div>

      {/* Sort control — wraps instead of scrolling (D6 C3) */}
      <div role="group" aria-labelledby="pelicula-sort" className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-3">
        <span
          id="pelicula-sort"
          className="ct-sc text-[13px] text-text-muted flex-shrink-0"
        >
          {lang === 'en' ? 'Order' : 'Ordenar'}
        </span>
        {SORT_KEYS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setFilmState({ sort: k })}
            aria-pressed={sort === k}
            className={`flex-shrink-0 min-h-6 max-sm:min-h-11 px-1 inline-flex items-center ct-sc text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-primary focus-visible:ring-offset-1 ${
              sort === k ? 'underline underline-offset-4' : 'text-text-muted hover:text-text-secondary'
            }`}
            style={sort === k ? { color: 'var(--color-text-primary)' } : undefined}
          >
            {SORT_LABEL[k][lang]}
          </button>
        ))}
      </div>

      <FacetRow
        title={lang === 'en' ? 'STILL CAPTIVE TODAY' : 'AÚN CAUTIVAS HOY'}
        sub={lang === 'en' ? `latest share ≥ ${ceil}%` : `participación actual ≥ ${ceil}%`}
        rows={held}
        ceil={ceil}
        lang={lang}
        openKey={openKey}
        onToggle={toggle}
        thresholds={thresholds}
        landscape={landscape}
      />
      <FacetRow
        title={lang === 'en' ? 'ROSE AND FELL' : 'SUBIERON Y CAYERON'}
        sub={lang === 'en' ? `built a majority, then receded below ${ceil}%` : `construyeron una mayoría y luego cayeron del ${ceil}%`}
        rows={fell}
        ceil={ceil}
        lang={lang}
        openKey={openKey}
        onToggle={toggle}
        thresholds={thresholds}
        landscape={landscape}
      />
    </section>
  )
}

// ─── Seal (at rest, from the folded aria field) ──────────────────────────────
function CrossSeal({ c, lang }: { c: CaptureItem; lang: 'en' | 'es' }) {
  if (!c.aria) return null
  // 10px seals are small text: the ink is the AA-safe reading colour, the
  // border keeps the vivid mark colour (D6 C4 — "inks for type, marks vivid").
  const badges: Array<{ t: string; ink: string; edge: string }> = []
  if (c.aria.in_ground_truth)
    badges.push({
      t: lang === 'en' ? 'documented' : 'documentado',
      ink: RISK_TEXT_COLORS.critical,
      edge: 'var(--color-risk-critical)',
    })
  if (c.aria.ips_tier === 1)
    badges.push({ t: 'ARIA T1', ink: 'var(--color-text-primary)', edge: 'var(--color-text-primary)' })
  if (badges.length === 0) return null
  return (
    <span className="inline-flex gap-1.5 align-middle">
      {badges.map((b) => (
        <span
          key={b.t}
          className="ct-sc text-[13px] px-1 py-0.5"
          style={{ color: b.ink, border: `1px solid ${b.edge}` }}
        >
          {b.t}
        </span>
      ))}
    </span>
  )
}

// ─── Faceted row of small trajectory cards ───────────────────────────────────
function FacetRow({
  title,
  sub,
  rows,
  ceil,
  lang,
  openKey,
  onToggle,
  thresholds,
  landscape,
}: {
  title: string
  sub: string
  rows: CaptureItem[]
  ceil: number
  lang: 'en' | 'es'
  openKey: string | null
  onToggle: (c: CaptureItem) => void
  thresholds: CaptureTopResponse['thresholds']
  landscape?: CaptureLandscapeResponse
}) {
  if (rows.length === 0) return null
  return (
    <div className="mb-6">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 mb-2">
        <h3 className="ct-sc text-[13px] text-text-secondary">
          {title}
        </h3>
        <span className="ct-sc text-[13px] text-text-muted">· {sub}</span>
      </div>
      {/* a list of trajectories, read row by row (role=list: one card per climb) */}
      <div role="list" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 min-[1700px]:grid-cols-4 gap-x-8 gap-y-6">
        {rows.map((c) => {
          const expanded = openKey === keyOf(c)
          const delta = c.peak_share_pct - c.earliest_share_pct
          return (
            <div
              key={keyOf(c)}
              role="listitem"
              style={expanded ? { gridColumn: '1 / -1' } : undefined}
              className="border-t border-text-primary"
            >
              {/* The figure and its numbers are ONE disclosure button; the two
                  chips are links after it, never inside it (D6 C3). */}
              <div className="pt-3">
                <button
                  type="button"
                  onClick={() => onToggle(c)}
                  aria-expanded={expanded}
                  aria-controls={panelId(c)}
                  className="block w-full text-left cursor-pointer hover:bg-background-elevated transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-primary focus-visible:ring-offset-1"
                >
                  <span className="sr-only">
                    {`${formatEntityName('vendor', c.vendor_name, 'full')} · ${formatEntityName('institution', c.institution_name, 'full')}: `}
                  </span>
                  <span className={expanded ? 'block max-w-[380px]' : 'block'}>
                    <CaptureTrajectory
                      timeline={c.timeline}
                      ceil={ceil}
                      peakYear={c.peak_year}
                      peakSharePct={c.peak_share_pct}
                      latestSharePct={c.latest_share_pct}
                      lang={lang}
                    />
                  </span>
                  <span className="mt-1 font-mono text-[13px] text-text-muted tabular-nums flex items-center gap-1.5 flex-wrap">
                    <span>+{delta.toFixed(0)}pp</span>
                    <span>·</span>
                    <span>{formatCompactMXN(c.cumulative_value_mxn)}</span>
                    <CrossSeal c={c} lang={lang} />
                  </span>
                  <span
                    className="mt-1 inline-block ct-sc text-[13px] text-text-primary underline underline-offset-[3px] hover:opacity-80"
                  >
                    {receiptsLabel(lang, expanded)}
                  </span>
                </button>
                <div className="mt-1.5">
                  <EntityIdentityChip type="vendor" id={c.vendor_id} name={c.vendor_name} size="sm" fullName />
                </div>
                <div className="mt-1 flex items-baseline gap-1.5 flex-wrap">
                  <span className="ct-sc text-[13px] text-text-muted flex-shrink-0">
                    {lang === 'en' ? `crossed ${ceil}% of the spend of` : `superó el ${ceil}% del gasto de`}
                  </span>
                  <EntityIdentityChip type="institution" id={c.institution_id} name={c.institution_name} size="sm" fullName />
                </div>
              </div>
              {expanded && (
                <CaptureExpand id={panelId(c)} c={c} lang={lang} thresholds={thresholds} landscape={landscape} />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
