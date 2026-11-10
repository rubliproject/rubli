/**
 * CategoryDossierSections — the enrichment sections for the category dossier.
 *
 * 2026-06-09 (DESIGNUS — category data-density pass). The category dossier sat
 * on top of far more reachable data than it rendered: it read only /summary,
 * /trends and /top-vendors-fast (3 of 10 endpoints) and stopped at a 2×2
 * diagnostic grid. These sections surface the prosecutorial material that was
 * already computed and instant — the procedure split (the category's signature
 * tell: direct-award dominates the COUNT of contracts while licitación
 * dominates the VALUE), the December year-end tell, the ARIA corruption-pattern
 * fingerprint, subcategory composition, and the vendor×institution capture
 * pairs — all in the shared folio register (mono labels, EB Garamond italics,
 * RISK_COLORS fills, full-width proportional bars, no green for low risk).
 *
 * Every section receives already-fetched data; the page (CategoryDossier) owns
 * the queries and renders the DossierSectionHeader. Each reuses the command
 * primitives (Panel / EmptyNote / EntityIdentityChip) and a local FullBar — none
 * reinvents chrome. getPriceDistribution is deliberately absent (it times out
 * >30s live); getVendorInstitution is strictly lazy (~14s).
 */
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import { ListHead, COL, NameCell, NumCell, IndicatorCell } from '@/components/kit/ListCells'
import { RankCell } from '@/components/kit/ListRow'
import { useRowFold, FoldToggle } from '@/components/contrato/Fold'
import { useIsMobile } from '@/hooks/useIsMobile'
import { EditorialComposedChart } from '@/components/charts/editorial'
import { EmptyNote } from '@/components/dossier/command/primitives'
import {
  RISK_COLORS,
  RISK_TEXT_COLORS,
  getRiskLevelFromScore,
  textInk,
} from '@/lib/constants'
import { formatCompactMXN, formatNumber, shortenContractName, stripEncodingArtifacts } from '@/lib/utils'

const t = (lang: 'en' | 'es', es: string, en: string) => (lang === 'es' ? es : en)

const BIGNUM_STYLE = {
  fontFamily: 'var(--font-serif)',
  fontStyle: 'normal',
  fontWeight: 600,
} as const

// ─── Hairline bar (DESIGN.md §7 «La cifra», 2026-10-21) — a 1px rule with a 2px
//     fill; the numbers beside it carry the row, phone hides it (dossier.css .cd-hb).
function HB({ pct, color }: { pct: number; color?: string }) {
  return <span className="cd-hb" aria-hidden="true" style={{ ['--v' as string]: `${Math.max(0, Math.min(100, pct))}%`, ['--c' as string]: color }}><i /></span>
}

const FINDING_STYLE = {
  fontFamily: 'var(--font-serif)',
  fontStyle: 'normal' as const,
  fontSize: 14,
  lineHeight: 1.5,
  color: 'var(--color-text-secondary)',
}

// ════════════════════════════════════════════════════════════════════════════
// § I — THE PROCEDURE SPLIT (LA COMPETENCIA) — the category's signature tell.
// ════════════════════════════════════════════════════════════════════════════

export interface CompetitionData {
  procedure_breakdown: { type: string; count: number; pct_contracts: number; value: number; pct_value: number }[]
  /** sb_pct divides by all contracts; sa_pct by competitive procedures (D20) — sa_pct is drawn. */
  yearly_trend: { year: number; contracts: number; da_pct: number; sb_pct: number; sa_pct?: number | null }[]
  sector_da_avg: number | null
  sector_sb_avg: number | null
  total_contracts: number
}

// Procedure palette — direct award is the risk-bearing leg, licitación the
// competitive one. Never green (Bible §3.10).
function procedureColor(type: string, accent: string): string {
  const k = type.toLowerCase()
  if (k.startsWith('direct')) return RISK_COLORS.high
  if (k.startsWith('licit')) return accent
  if (k.startsWith('invit')) return RISK_COLORS.medium
  return 'var(--color-text-muted)'
}
function procedureLabel(type: string, lang: 'en' | 'es'): string {
  const k = type.toLowerCase()
  if (k.startsWith('direct')) return t(lang, 'Adjudicación directa', 'Direct award')
  if (k.startsWith('licit')) return t(lang, 'Licitación', 'Open tender')
  if (k.startsWith('invit')) return t(lang, 'Invitación', 'Invitation')
  return t(lang, 'Otro', 'Other')
}

function SegmentedBar({ segments }: { segments: { pct: number; color: string }[] }) {
  return (
    <div className="flex overflow-hidden" style={{ height: 16, borderRadius: 3, background: 'var(--color-border)' }} aria-hidden="true">
      {segments.map((s, i) => (
        <div key={i} style={{ width: `${Math.max(0, Math.min(100, s.pct))}%`, background: s.color, borderRight: i < segments.length - 1 ? '1px solid var(--color-background)' : undefined }} />
      ))}
    </div>
  )
}

export function ProcedureSplit({ data, accent, lang }: { data: CompetitionData; accent: string; lang: 'en' | 'es' }) {
  const order = ['directa', 'licitacion', 'invitacion', 'otro']
  // `desconocido` and `otro` both read "Other" — fold them into one row so the
  // bars and the legend carry a single "Other".
  const folded: CompetitionData['procedure_breakdown'] = []
  for (const p of data.procedure_breakdown ?? []) {
    const type = p.type.toLowerCase() === 'desconocido' ? 'otro' : p.type
    const into = folded.find((q) => q.type.toLowerCase() === type.toLowerCase())
    if (into) {
      into.count += p.count
      into.pct_contracts += p.pct_contracts
      into.value += p.value
      into.pct_value += p.pct_value
    } else folded.push({ ...p, type })
  }
  const pb = folded.sort(
    (a, b) => order.indexOf(a.type.toLowerCase()) - order.indexOf(b.type.toLowerCase()),
  )
  if (pb.length === 0) return <EmptyNote text={t(lang, 'Sin desglose de procedimiento.', 'No procedure breakdown.')} />

  const contractSegs = pb.map((p) => ({ pct: p.pct_contracts, color: procedureColor(p.type, accent) }))
  const valueSegs = pb.map((p) => ({ pct: p.pct_value, color: procedureColor(p.type, accent) }))
  const directa = pb.find((p) => p.type.toLowerCase().startsWith('direct'))
  const tender = pb.find((p) => p.type.toLowerCase().startsWith('licit'))
  const gap = directa ? Math.abs((directa.pct_contracts ?? 0) - (directa.pct_value ?? 0)) : 0

  // Drift: yearly DA / SB in percent (0–100, as the API sends them) — the
  // shared 'pct' formatter prints its input as-is.
  const drift = (data.yearly_trend ?? [])
    .filter((d) => Number.isFinite(d.year))
    .map((d) => ({ year: d.year, da: d.da_pct ?? 0, sb: d.sa_pct ?? 0 }))
    .sort((a, b) => a.year - b.year)
  const secDa = data.sector_da_avg

  return (
    // bars | the gap | the drift chart — one row ≥1280 (DESIGN.md §3 pair), stacked below
    <div className="cd-proc">
      {/* The inversion — two stacked 100% bars: contracts vs value */}
      <div className="contents">
        <div className="space-y-3">
          <div>
            <div className="flex items-baseline justify-between mb-1.5" style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
              <span>{t(lang, 'Cuota de contratos', 'Share of contracts')}</span>
              {directa && <span className="font-mono tabular-nums" style={{ color: RISK_TEXT_COLORS.high, fontWeight: 600 }}>{Math.round(directa.pct_contracts)}% {t(lang, 'directa', 'direct')}</span>}
            </div>
            <SegmentedBar segments={contractSegs} />
          </div>
          <div>
            <div className="flex items-baseline justify-between mb-1.5" style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
              <span>{t(lang, 'Cuota del valor', 'Share of value')}</span>
              {directa && <span className="font-mono tabular-nums" style={{ color: directa.pct_value < (directa.pct_contracts ?? 0) ? 'var(--color-text-muted)' : RISK_TEXT_COLORS.high, fontWeight: 600 }}>{Math.round(directa.pct_value)}% {t(lang, 'directa', 'direct')}</span>}
            </div>
            <SegmentedBar segments={valueSegs} />
          </div>
          {/* Legend */}
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 pt-1">
            {pb.map((p) => (
              <div key={p.type} className="flex items-center gap-1.5" style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
                <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 2, background: procedureColor(p.type, accent), flexShrink: 0 }} />
                {procedureLabel(p.type, lang)}
              </div>
            ))}
          </div>
        </div>

        {/* Pull-stat — the gap */}
        {directa && (
          <div>
            <div className="ct-fig" style={{ marginTop: 0, color: gap >= 15 ? RISK_TEXT_COLORS.critical : 'var(--color-text-primary)' }}>
              {Math.round(directa.pct_contracts)}<span className="ct-unit">%</span>
              <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}> → </span>
              {Math.round(directa.pct_value)}<span className="ct-unit">%</span>
            </div>
            <div className="mt-1.5" style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
              {t(lang, 'adjudicación directa · contratos → valor', 'direct award · contracts → value')}
            </div>
            <p className="mt-2" style={FINDING_STYLE}>
              {gap >= 15
                ? t(
                    lang,
                    `La adjudicación directa absorbe el ${Math.round(directa.pct_contracts)}% de los contratos pero solo el ${Math.round(directa.pct_value)}% del dinero${tender ? `: las licitaciones, el ${Math.round(tender.pct_contracts)}% de los contratos, mueven el ${Math.round(tender.pct_value)}% del valor` : ''}. Los grandes montos se licitan; los pequeños se reparten.`,
                    `Direct award absorbs ${Math.round(directa.pct_contracts)}% of contracts but only ${Math.round(directa.pct_value)}% of the money${tender ? `: open tenders — ${Math.round(tender.pct_contracts)}% of contracts — move ${Math.round(tender.pct_value)}% of the value` : ''}. The big sums are tendered; the small ones are handed out.`,
                  )
                : t(
                    lang,
                    `La adjudicación directa representa el ${Math.round(directa.pct_contracts)}% de los contratos y el ${Math.round(directa.pct_value)}% del valor — sin una brecha marcada entre conteo y monto.`,
                    `Direct award is ${Math.round(directa.pct_contracts)}% of contracts and ${Math.round(directa.pct_value)}% of value — no sharp count-vs-value gap.`,
                  )}
            </p>
          </div>
        )}
      </div>

      {/* The drift — DA / SB over time vs the sector benchmark */}
      {drift.length > 1 && (
        <div>
          <div className="mb-1.5" style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
            {t(lang, 'Adjudicación directa y un solo adjudicado en el tiempo', 'Direct award & single-award over time')}
          </div>
          <EditorialComposedChart
            data={drift}
            xKey="year"
            yFormat="pct"
            yDomain={[0, 100]}
            height={120}
            layers={[
              { kind: 'line', key: 'da', label: t(lang, 'Adj. directa', 'Direct award'), colorToken: 'risk-critical', emphasis: 'primary' },
              { kind: 'line', key: 'sb', label: t(lang, 'Un solo adjudicado (de competitivos)', 'Single award (of competitive)'), colorToken: 'risk-high', emphasis: 'secondary' },
            ]}
            annotations={secDa != null ? [{ kind: 'hrule', y: secDa, label: t(lang, 'media del sector', 'sector avg'), tone: 'info' }] : undefined}
          />
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// § — THE DECEMBER TELL (LA SEÑAL DE DICIEMBRE) — year-end budget-flush.
// ════════════════════════════════════════════════════════════════════════════

export interface SeasonalityData {
  monthly: { month: number; month_name: string; contracts: number; value: number; pct_contracts: number; pct_value: number }[]
  december_pct_value: number
  december_index: number
}

const MONTH_INITIALS_ES = ['E', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']
const MONTH_INITIALS_EN = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']

export function SeasonalityTell({ data, accent, lang }: { data: SeasonalityData; accent: string; lang: 'en' | 'es' }) {
  const months = [...(data.monthly ?? [])].sort((a, b) => a.month - b.month)
  if (months.length === 0) return <EmptyNote text={t(lang, 'Sin datos de estacionalidad.', 'No seasonality data.')} />
  const initials = lang === 'es' ? MONTH_INITIALS_ES : MONTH_INITIALS_EN
  const maxPct = Math.max(...months.map((m) => m.pct_value), 8.34)
  const idx = data.december_index ?? 0
  const decPct = data.december_pct_value ?? months.find((m) => m.month === 12)?.pct_value ?? 0
  const severe = idx >= 1.5
  const decColor = idx >= 2 ? RISK_COLORS.critical : idx >= 1.5 ? RISK_COLORS.high : accent
  const uniformPct = 8.333 // 1/12

  return (
    <div className="grid gap-5 sm:grid-cols-[1.6fr_1fr] items-end">
      {/* 12-column monthly strip, height ∝ pct_value, reference line at uniform 8.3% */}
      <div>
        <div className="relative flex items-end gap-[3px]" style={{ height: 92 }}>
          {/* uniform-share reference line */}
          <div aria-hidden="true" className="absolute left-0 right-0" style={{ bottom: `${(uniformPct / maxPct) * 92}px`, height: 1, background: 'var(--color-text-muted)', opacity: 0.4 }} />
          {months.map((m) => {
            const h = Math.max(2, (m.pct_value / maxPct) * 92)
            const isDec = m.month === 12
            return (
              <div key={m.month} className="flex-1 flex flex-col items-center justify-end" style={{ height: 92 }} role="img" aria-label={`${m.month_name}: ${m.pct_value.toFixed(1)}%`} title={`${m.month_name}: ${m.pct_value.toFixed(1)}%`}>
                <div style={{ width: '100%', height: h, background: isDec ? decColor : 'var(--color-border)', borderRadius: '2px 2px 0 0', opacity: isDec ? 1 : 0.85 }} />
              </div>
            )
          })}
        </div>
        <div className="flex gap-[3px] mt-1">
          {months.map((m) => (
            <div key={m.month} className="flex-1 text-center font-mono" style={{ fontSize: 12, color: m.month === 12 ? textInk(decColor) : 'var(--color-text-muted)', fontWeight: m.month === 12 ? 700 : 400 }}>
              {initials[m.month - 1]}
            </div>
          ))}
        </div>
        <div className="mt-1.5" style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
          {/* each clause is one unbreakable token; the line wraps only at the dot */}
          <span className="whitespace-nowrap">{t(lang, 'línea = cuota uniforme (8.3%)', 'line = even share (8.3%)')}</span>
          {' · '}
          <span className="whitespace-nowrap">{t(lang, 'altura = % del valor anual', 'height = % of annual value')}</span>
        </div>
      </div>

      {/* Anchor + verdict */}
      <div className="sm:border-l sm:pl-5" style={{ borderColor: 'var(--color-border)' }}>
        <div className="ct-fig" style={{ marginTop: 0, color: severe ? RISK_TEXT_COLORS[idx >= 2 ? 'critical' : 'high'] : 'var(--color-text-primary)' }}>
          {idx > 0 ? `${idx.toFixed(1)}×` : '—'}
        </div>
        <div className="mt-1.5" style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
          {t(lang, 'diciembre vs mes promedio', 'December vs average month')}
        </div>
        <p className="mt-3" style={FINDING_STYLE}>
          {severe
            ? t(
                lang,
                `Diciembre concentra el ${decPct.toFixed(0)}% del valor anual — ${idx.toFixed(1)}× la cuota esperada. El gasto se avalancha a fin de año.`,
                `December holds ${decPct.toFixed(0)}% of the annual value — ${idx.toFixed(1)}× the expected share. Spending avalanches into year-end.`,
              )
            : t(
                lang,
                `Diciembre concentra el ${decPct.toFixed(0)}% del valor anual — sin un pico marcado de fin de año.`,
                `December holds ${decPct.toFixed(0)}% of the annual value — no sharp year-end spike.`,
              )}
        </p>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// § — THE ARIA FINGERPRINT (LA HUELLA ARIA) — corruption-pattern profile.
// ════════════════════════════════════════════════════════════════════════════

export interface PatternsData {
  total_vendors: number
  vendors_in_aria: number
  dominant_pattern: string | null
  patterns: { pattern: string; label_es: string; label_en: string; color: string; vendor_count: number; pct_of_aria: number; high_tier_count: number }[]
}

export function AriaFingerprint({ data, lang }: { data: PatternsData; lang: 'en' | 'es' }) {
  const pats = [...(data.patterns ?? [])].filter((p) => p.vendor_count > 0).sort((a, b) => b.vendor_count - a.vendor_count)
  if (data.vendors_in_aria === 0 || pats.length === 0) {
    return <EmptyNote text={t(lang, 'Ningún proveedor de esta categoría está en la fila de investigación ARIA.', 'No vendors from this category are in the ARIA investigation queue.')} />
  }
  const maxCount = Math.max(...pats.map((p) => p.vendor_count))
  const cov = data.total_vendors > 0 ? (data.vendors_in_aria / data.total_vendors) * 100 : 0

  return (
    <div>
      <p className="cd-meta mb-2">
        {t(
          lang,
          `${formatNumber(data.vendors_in_aria)} de ${formatNumber(data.total_vendors)} proveedores (${cov.toFixed(0)}%) están en la fila ARIA.`,
          `${formatNumber(data.vendors_in_aria)} of ${formatNumber(data.total_vendors)} vendors (${cov.toFixed(0)}%) are in the ARIA queue.`,
        )}
      </p>
      <div className="cd-rows" role="list">
        {pats.slice(0, 6).map((p) => {
          const label = lang === 'es' ? p.label_es : p.label_en
          return (
            <div key={p.pattern} className="cd-row" role="listitem">
              <span>
                <span aria-hidden="true" style={{ display: 'inline-block', width: 7, height: 7, borderRadius: 999, background: p.color, marginRight: 6, verticalAlign: 'middle' }} />
                <span className="cd-lbl">{p.pattern}</span> {label}
              </span>
              <HB pct={(p.vendor_count / maxCount) * 100} color={p.color} />
              <span className="cd-v"><b>{formatNumber(p.vendor_count)}</b> · {p.pct_of_aria.toFixed(0)}%</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// COMPRANET titles arrive ALL-CAPS; sentence-case those through the shared
// caser (no length cap — the line wraps). Mixed-case titles pass untouched.
// The pre-2010 "ý" encoding artifact is stripped first: a lower-case "ý" inside
// an ALL-CAPS title made the caps test fail, and mixed-case titles kept it.
export function sentenceCaseCaps(raw: string): string {
  const title = stripEncodingArtifacts(raw)
  return title === title.toUpperCase() ? shortenContractName(title, Infinity) : title
}

// ════════════════════════════════════════════════════════════════════════════
// § — CAPTURE PAIRS (PARES DE CAPTURA) — vendor × institution.
// 2026-06-09: now served from a precomputed table (instant) — the old "Load
// capture pairs" button is gone; the section fetches eagerly like its siblings.
// ════════════════════════════════════════════════════════════════════════════

export interface CapturePairRow {
  vendor_id: number
  vendor_name: string
  institution_id: number
  institution_name: string
  contract_count: number
  total_value: number
  avg_risk: number
  max_risk: number
  direct_award_pct: number
  single_bid_pct: number
  /** Single-award share of competitive procedures (D20) — the displayed rate. */
  single_award_pct?: number | null
}

export function CapturePairs({
  rows,
  isLoading,
  lang,
}: {
  rows: CapturePairRow[]
  isLoading: boolean
  lang: 'en' | 'es'
}) {
  const items = [...(rows ?? [])].sort((a, b) => b.total_value - a.total_value).slice(0, 12)
  // seven beside the largest contracts so the pair ends together (DESIGN.md §3); four on phone
  const fold = useRowFold(items, useIsMobile() ? 4 : 7)
  if (isLoading) {
    return (
      <div className="space-y-2" aria-live="polite">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-9 rounded-sm" style={{ background: 'var(--color-background-elevated)' }} />
        ))}
        <p className="ct-note">{t(lang, 'Consultando… puede tardar.', 'Querying… may take a moment.')}</p>
      </div>
    )
  }
  if (items.length === 0) {
    return <EmptyNote text={t(lang, 'Sin pares recurrentes proveedor × institución.', 'No recurring vendor × institution pairs.')} />
  }
  return (
    <div>
    <div className="ct-table-wrap">
      <table id="cd-pairs-t" className="ct-table ct-stack" aria-label={t(lang, 'Pares proveedor × institución', 'Vendor × institution pairs')}>
        <ListHead lang={lang} ranked cols={[COL.vendor, COL.institution, COL.contracts, COL.amount, { ...COL.da, es: 'AD', en: 'DA' }, COL.indicator]} />
        <tbody>
          {fold.shown.map((r, i) => (
            <tr key={`${r.vendor_id}-${r.institution_id}`} className={`ct-row${fold.rowIn(i)}`}>
              <RankCell n={i + 1} />
              <NameCell type="vendor" id={r.vendor_id} name={r.vendor_name} />
              <NameCell type="institution" id={r.institution_id} name={r.institution_name} />
              <NumCell label={t(lang, 'contratos', 'contracts')}>{formatNumber(r.contract_count)}</NumCell>
              <NumCell amt>{formatCompactMXN(r.total_value)}</NumCell>
              <td className="num" data-l={t(lang, 'AD', 'DA')} style={{ color: r.direct_award_pct > 80 ? RISK_TEXT_COLORS.high : undefined }}>{Math.round(r.direct_award_pct)}%</td>
              <IndicatorCell value={r.avg_risk > 0 ? r.avg_risk : null} />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    <FoldToggle open={fold.open} rest={fold.rest} onToggle={fold.toggle} controls="cd-pairs-t" />
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// § — CONTRACT SIZE / OUTLIERS (EL TAMAÑO DEL CONTRATO) — the shape of spending:
// a typical contract is small, but a handful of mega-contracts hold the money.
// ════════════════════════════════════════════════════════════════════════════

export interface PriceSpreadData {
  n: number
  p25: number | null
  p50: number | null
  p75: number | null
  mean: number | null
  mean_median_ratio: number | null
  outlier_count: number
  mega_count?: number
  mega_value?: number
  mega_value_pct?: number
  total_value?: number
}

export function PriceSpread({ data, accent, lang }: { data: PriceSpreadData; accent: string; lang: 'en' | 'es' }) {
  const { p25, p50, p75, mean } = data
  if (!p50 || !p75 || !mean) return <EmptyNote text={t(lang, 'Sin distribución de precios.', 'No price distribution.')} />
  const lo = p25 ?? 0
  const scaleMax = Math.max(p75, mean) * 1.12
  const x = (v: number) => `${Math.max(0, Math.min(100, (v / scaleMax) * 100))}%`
  const ratio = data.mean_median_ratio ?? (mean / p50)
  const megaPct = data.mega_value_pct ?? 0
  const megaN = data.mega_count ?? 0
  const skewed = ratio >= 3
  const anchorColor = megaPct >= 30 ? RISK_TEXT_COLORS.critical : megaPct >= 15 ? RISK_TEXT_COLORS.high : 'var(--color-text-primary)'

  return (
    <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr] items-start">
      {/* Quartile scale — IQR box, median line, mean marker (right-skew made visible) */}
      <div>
        <div className="relative" style={{ height: 56 }}>
          {/* baseline track */}
          <div aria-hidden="true" className="absolute left-0 right-0" style={{ top: 26, height: 3, background: 'var(--color-border)', borderRadius: 999 }} />
          {/* IQR box P25→P75 */}
          <div aria-hidden="true" className="absolute" style={{ left: x(lo), width: `calc(${x(p75)} - ${x(lo)})`, top: 18, height: 19, background: `${accent}33`, border: `1px solid ${accent}`, borderRadius: 3 }} />
          {/* median line */}
          <div aria-hidden="true" className="absolute" style={{ left: x(p50), top: 14, height: 27, width: 2, background: accent }} />
          {/* mean marker */}
          <div aria-hidden="true" className="absolute" style={{ left: x(mean), top: 10, height: 35, width: 2, background: anchorColor }} />
          {/* labels */}
          <div className="absolute font-mono tabular-nums" style={{ left: x(p50), top: 0, transform: 'translateX(-50%)', fontSize: 13, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
            {t(lang, 'mediana', 'median')} {formatCompactMXN(p50)}
          </div>
          <div className="absolute font-mono tabular-nums" style={{ left: x(mean), top: 44, transform: mean / scaleMax > 0.7 ? 'translateX(-100%)' : 'translateX(-50%)', fontSize: 13, color: anchorColor, whiteSpace: 'nowrap', fontWeight: 600 }}>
            {t(lang, 'promedio', 'mean')} {formatCompactMXN(mean)}
          </div>
        </div>
        <div className="font-mono mt-1 flex justify-between" style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
          <span>P25 {p25 != null ? formatCompactMXN(p25) : '—'}</span>
          <span>P75 {formatCompactMXN(p75)}</span>
        </div>
        <p className="mt-3" style={FINDING_STYLE}>
          {skewed
            ? t(
                lang,
                `La mitad de los contratos vale menos de ${formatCompactMXN(p50)}, pero el promedio (${formatCompactMXN(mean)}) lo supera ${ratio.toFixed(1)}× — unos pocos contratos gigantes inflan la media.`,
                `Half the contracts are worth less than ${formatCompactMXN(p50)}, yet the mean (${formatCompactMXN(mean)}) runs ${ratio.toFixed(1)}× higher — a handful of giant contracts pull the average up.`,
              )
            : t(
                lang,
                `La mediana es ${formatCompactMXN(p50)} y el promedio ${formatCompactMXN(mean)} (${ratio.toFixed(1)}×) — sin una fila de valores extremos marcada.`,
                `The median is ${formatCompactMXN(p50)} and the mean ${formatCompactMXN(mean)} (${ratio.toFixed(1)}×) — no pronounced extreme-value tail.`,
              )}
        </p>
      </div>

      {/* Mega-contract concentration anchor */}
      <div className="lg:border-l lg:pl-5" style={{ borderColor: 'var(--color-border)' }}>
        <div className="ct-fig" style={{ marginTop: 0, color: anchorColor }}>
          {megaPct > 0 ? `${megaPct.toFixed(0)}` : '—'}<span className="ct-unit">%</span>
        </div>
        <div className="mt-1.5" style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
          {t(lang, 'del valor · en contratos ≥ 1,000 MDP', 'of value · in contracts ≥ 1B MXN')}
        </div>
        <p className="mt-3" style={FINDING_STYLE}>
          {megaN > 0
            ? t(
                lang,
                `${formatNumber(megaN)} ${megaN === 1 ? 'contrato concentra' : 'contratos concentran'} el ${megaPct.toFixed(0)}% del dinero de la categoría — de ${formatNumber(data.n)} contratos en total.`,
                `${formatNumber(megaN)} ${megaN === 1 ? 'contract holds' : 'contracts hold'} ${megaPct.toFixed(0)}% of the category's money — out of ${formatNumber(data.n)} contracts in all.`,
              )
            : t(lang, `Ningún contrato supera los 1,000 MDP en esta categoría.`, `No single contract exceeds 1B MXN in this category.`)}
        </p>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// § — LARGEST CONTRACTS (LOS GRANDES CONTRATOS) — named, datable, clickable.
// ════════════════════════════════════════════════════════════════════════════

export interface LargeContractRow {
  contract_id: number
  amount_mxn: number
  year: number | null
  risk_level: string | null
  risk_score: number | null
  vendor_id: number | null
  vendor_name: string | null
  /** persona física: named, always labelled (policy 10-29) */
  persona_fisica?: boolean
  institution_id: number | null
  institution_name: string | null
  title: string | null
}

export function LargestContracts({ rows, lang }: { rows: LargeContractRow[]; lang: 'en' | 'es' }) {
  const items = (rows ?? []).filter((r) => (r.amount_mxn ?? 0) > 0)
  // Four on phone, five beside the pairs table (the rest open in place, DESIGN.md §3 fold).
  const fold = useRowFold(items, useIsMobile() ? 4 : 5)
  if (items.length === 0) return <EmptyNote text={t(lang, 'Sin contratos destacados.', 'No standout contracts.')} />

  // One record per row, «La cifra» register: rank · vendor · amount, then → buyer · year · risk · title.
  return (
    <div>
    <ol id="cd-big-t" className="ct-cols2 border-t border-text-primary" style={{ ['--ct-rows' as string]: Math.ceil(fold.shown.length / 2) }}>
      {fold.shown.map((r, i) => {
        const lvl = r.risk_score != null && r.risk_score > 0 ? getRiskLevelFromScore(r.risk_score) : 'low'
        const riskPct = r.risk_score != null && r.risk_score > 0 ? Math.round(r.risk_score * 100) : null
        return (
          <li key={r.contract_id} className={`py-1 border-b border-border grid gap-x-3${fold.rowIn(i)}`} style={{ gridTemplateColumns: '20px minmax(0, 1fr) max-content' }}>
            <span className="font-mono tabular-nums text-right" style={{ fontSize: 12, lineHeight: '24px', color: 'var(--color-text-muted)' }}>{String(i + 1).padStart(2, '0')}</span>
            {r.vendor_id != null && r.vendor_name ? (
              <EntityIdentityChip type="vendor" id={r.vendor_id} name={r.vendor_name} personaFisica={r.persona_fisica} size="sm" fullName />
            ) : (
              <span style={{ fontSize: 13, lineHeight: '24px', color: 'var(--color-text-muted)' }}>{t(lang, 'proveedor no identificado', 'unidentified vendor')}</span>
            )}
            <span className="tabular-nums text-right" style={{ ...BIGNUM_STYLE, fontSize: 16, lineHeight: '24px', whiteSpace: 'nowrap' }}>
              {formatCompactMXN(r.amount_mxn)}
            </span>
            <div style={{ gridColumn: '2 / -1', fontSize: 13, lineHeight: 1.4, color: 'var(--color-text-muted)' }}>
              {r.institution_id != null && r.institution_name && (
                <>→ <EntityIdentityChip type="institution" id={r.institution_id} name={r.institution_name} variant="name" style={{ fontFamily: 'var(--font-serif)', fontSize: 14, color: 'var(--color-text-primary)' }} />{' · '}</>
              )}
              {r.year != null && <span className="font-mono tabular-nums">{r.year}</span>}
              {riskPct != null && <> · <span style={{ color: RISK_TEXT_COLORS[lvl], fontWeight: 600 }} title={t(lang, 'indicador de riesgo', 'risk indicator')}>{riskPct}</span></>}
              {r.title && <span style={{ fontFamily: 'var(--font-serif)', fontSize: 14 }}> · {sentenceCaseCaps(r.title)}</span>}
            </div>
          </li>
        )
      })}
    </ol>
    <FoldToggle open={fold.open} rest={fold.rest} onToggle={fold.toggle} controls="cd-big-t" />
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// § — TOP BUYERS (QUIÉN COMPRA) — the institutions that SPEND in this category.
// ════════════════════════════════════════════════════════════════════════════

export interface TopBuyerRow {
  institution_id: number
  name: string
  full_name: string
  contract_count: number
  value_mxn: number
  share_pct: number
  avg_risk: number | null
}

export function TopBuyers({ rows, lang }: { rows: TopBuyerRow[]; lang: 'en' | 'es' }) {
  const items = (rows ?? []).filter((r) => (r.value_mxn ?? 0) > 0)
  if (items.length === 0) return <EmptyNote text={t(lang, 'Sin desglose por institución compradora.', 'No buying-institution breakdown.')} />
  const maxShare = Math.max(...items.map((r) => r.share_pct), 1)
  const top3 = items.slice(0, 3).reduce((s, r) => s + (r.share_pct ?? 0), 0)

  return (
    <div>
      <p className="cd-meta mb-2">
        {t(
          lang,
          `Las 3 mayores instituciones colocan el ${Math.round(top3)}% del gasto de la categoría.`,
          `The top 3 institutions place ${Math.round(top3)}% of the category's spend.`,
        )}
      </p>
      <div className="cd-rows" role="list">
        {items.map((r) => {
          const lvl = r.avg_risk != null && r.avg_risk > 0 ? getRiskLevelFromScore(r.avg_risk) : 'low'
          const riskPct = r.avg_risk != null && r.avg_risk > 0 ? Math.round(r.avg_risk * 100) : null
          const hot = r.share_pct >= 40
          return (
            <div key={r.institution_id} className="cd-row" role="listitem">
              <EntityIdentityChip type="institution" id={r.institution_id} name={r.name} size="sm" hideIcon fullName />
              <HB pct={(r.share_pct / maxShare) * 100} color={hot ? RISK_COLORS.high : 'var(--color-text-secondary)'} />
              <span className="cd-v">
                <b>{formatCompactMXN(r.value_mxn)}</b> · <span style={{ color: hot ? RISK_TEXT_COLORS.high : undefined, fontWeight: hot ? 600 : 400 }}>{r.share_pct.toFixed(0)}%</span>
                {' · '}<span style={{ color: riskPct != null ? RISK_TEXT_COLORS[lvl] : undefined, fontWeight: 600 }} title={t(lang, 'indicador de riesgo', 'risk indicator')}>{riskPct ?? '—'}</span>
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
