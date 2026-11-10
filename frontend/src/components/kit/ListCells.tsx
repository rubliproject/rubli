/**
 * Column presets for the one list standard (DESIGN.md §8.1 «Listas»; owner 2026-10-29: «implement this in ALL the
 * tables on the website, with some special columns depending on what we are showing»).
 *
 * A table picks its preset (`PRESET.vendor` …), may add its own special columns, and renders:
 *   <table className="ct-table ct-stack"><ListHead cols={[...PRESET.vendor, special]} lang ranked /> <tbody>…cells…</tbody></table>
 * Every cell below is a <td> with the standard classes, so the row anatomy, numbering, alignment, hover and the
 * phone stacking (two lines, one left edge) come from contrato.css. Mono only for figures; names in the body face.
 */
import type { ReactNode } from 'react'
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import { RiskGauge, RiskGaugeScale } from '@/components/contrato/RiskGauge'
import { formatCompactMXN, formatCompactUSD } from '@/lib/utils'
import { inferSiglasFromName } from '@/lib/entity/siglas'
import { formatEntityName } from '@/lib/entity/format'
import { useLang } from '@/components/contrato/nav'
import { RankTh } from './ListRow'

type Lang = 'es' | 'en'

/** A column head: a known key, or a page's special column. `num` = right-aligned figure. */
export type Col = { key: string; es: string; en: string; num?: boolean; gauge?: boolean }

const C = {
  name: { key: 'name', es: 'Nombre', en: 'Name' },
  vendor: { key: 'vendor', es: 'Proveedor', en: 'Supplier' },
  institution: { key: 'institution', es: 'Institución', en: 'Institution' },
  buyer: { key: 'buyer', es: 'Comprador', en: 'Buyer' },
  category: { key: 'category', es: 'Categoría', en: 'Category' },
  contract: { key: 'contract', es: 'Contrato', en: 'Contract' },
  case: { key: 'case', es: 'Caso', en: 'Case' },
  term: { key: 'term', es: 'Sexenio', en: 'Term' },
  pair: { key: 'pair', es: 'Comprador ↔ proveedor', en: 'Buyer ↔ supplier' },
  date: { key: 'date', es: 'Fecha', en: 'Date', num: true },
  years: { key: 'years', es: 'Años', en: 'Years', num: true },
  contracts: { key: 'contracts', es: 'Contratos', en: 'Contracts', num: true },
  amount: { key: 'amount', es: 'Monto', en: 'Amount', num: true },
  da: { key: 'da', es: 'Sin concurso', en: 'No tender', num: true },
  share: { key: 'share', es: 'Parte', en: 'Share', num: true },
  highcrit: { key: 'highcrit', es: 'Alto o crítico', en: 'High or critical', num: true },
  indicator: { key: 'indicator', es: 'Indicador de riesgo', en: 'Risk indicator', gauge: true },
  trend: { key: 'trend', es: 'Por año', en: 'By year' },
  procedure: { key: 'procedure', es: 'Procedimiento', en: 'Procedure' },
  flags: { key: 'flags', es: 'Señales', en: 'Flags' },
  level: { key: 'level', es: 'Nivel', en: 'Level' },
  grade: { key: 'grade', es: 'Calificación', en: 'Grade', num: true },
  topVendor: { key: 'topVendor', es: 'Proveedor principal', en: 'Top supplier' },
  dependence: { key: 'dependence', es: 'Dependencia', en: 'Dependence', num: true },
  status: { key: 'status', es: 'Estado', en: 'Status' },
  fraud: { key: 'fraud', es: 'Tipo', en: 'Type' },
  outcome: { key: 'outcome', es: 'Desenlace', en: 'Outcome' },
} satisfies Record<string, Col>

export const COL = C

/** The presets the owner named (2026-10-29). A page may drop a column it has no data for, or add a special one. */
export const PRESET = {
  vendor: [C.vendor, C.contracts, C.amount, C.da, C.indicator, C.trend],
  contract: [C.date, C.contract, C.procedure, C.amount, C.indicator, C.flags],
  institution: [C.institution, C.level, C.amount, C.grade, C.topVendor],
  category: [C.category, C.amount, C.da, C.topVendor],
  pair: [C.pair, C.dependence, C.years, C.status],
  case: [C.case, C.fraud, C.years, C.outcome, C.amount],
  term: [C.term, C.amount, C.da, C.highcrit],
} satisfies Record<string, Col[]>

export function ListHead({ cols, lang, ranked, role }: { cols: Col[]; lang: Lang; ranked?: boolean; role?: 'rowgroup' }) {
  return (
    <thead role={role}>
      <tr role={role ? 'row' : undefined}>
        {ranked && <RankTh lang={lang} role={role ? 'columnheader' : undefined} />}
        {cols.map((c) => (
          <th key={c.key} role={role ? 'columnheader' : undefined} scope="col" className={c.num ? 'num' : c.gauge ? 'gauge' : undefined}>
            {lang === 'en' ? c.en : c.es}
            {c.gauge && <RiskGaugeScale />}
          </th>
        ))}
      </tr>
    </thead>
  )
}

type CellRole = { role?: 'cell' }

/** The name cell: the entity chip at row size (full name, never truncated); a vendor with no public name reads
 *  «Nombre no publicado» (an RFC-shaped or missing name). `siglas` = the buyer of a contract row: the chip reads the siglas when they are known
 *  (full name on hover), so the meta line holds date · buyer · procedure on a phone; `sub` is a muted line. */
export function NameCell({ type, id, name, sub, siglas, role }: CellRole & {
  type: 'vendor' | 'institution' | 'category' | 'case' | 'sector' | 'pattern'
  id: number | string | null | undefined
  name: string | null | undefined
  sub?: ReactNode
  siglas?: boolean
}) {
  const lang = useLang()
  const sg = siglas && type === 'institution' && name ? inferSiglasFromName(name) : null
  return (
    <td role={role} className="ct-key" title={sg && name ? name : undefined}>
      {id != null
        ? <EntityIdentityChip type={type} id={id} name={sg ?? name} size="inherit" fullName hideIcon inline />
        : <span className="ls-anon">{type === 'vendor' && !name ? (lang === 'en' ? 'Name not published' : 'Nombre no publicado') : formatEntityName(type, name, 'full')}</span>}
      {sub != null && <small>{sub}</small>}
    </td>
  )
}

/** A figure cell. `label` = the phone meta-line label (data-l). */
export function NumCell({ children, label, role, amt }: CellRole & { children: ReactNode; label?: string; amt?: boolean }) {
  return <td role={role} className={amt ? 'num ct-amt' : 'num'} data-l={label}>{children}</td>
}

/** Money, compact (MDP / billones in ES); † above 10,000 MDP (CLAUDE.md data rule: flag > 10B). */
export function AmountCell({ value, role, label }: CellRole & { value: number | null | undefined; label?: string }) {
  // USD as a hover title in the English edition only: cells keep MXN (CLAUDE.md rule 10)
  const es = useLang() === 'es'
  return <td role={role} className="num ct-amt" data-l={label} title={value == null || es ? undefined : `≈${formatCompactUSD(value)}`}>{value == null ? '—' : `${formatCompactMXN(value)}${value > 10_000_000_000 ? ' †' : ''}`}</td>
}

/** A share. `of` = the scale of `value` (1 for 0–1, 100 for percents). */
export function PctCell({ value, of = 1, role, label }: CellRole & { value: number | null | undefined; of?: 1 | 100; label?: string }) {
  return <NumCell role={role} label={label}>{value == null ? '—' : `${Math.round((value * 100) / of)}%`}</NumCell>
}

export function IndicatorCell({ value, role }: CellRole & { value: number | null | undefined }) {
  return <td role={role} className="gauge"><RiskGauge value={value} /></td>
}

/** A word cell (procedure, status, outcome, type): body face, muted. */
export function TextCell({ children, label, role }: CellRole & { children: ReactNode; label?: string }) {
  return <td role={role} className="ls-txt" data-l={label}>{children}</td>
}

/** A sparse {year, amount} series on one shared span (missing years = 0), so every row's line reads on the same axis. */
export function yearValues(points: { year: number; amount_mxn: number }[] | undefined, from: number, to: number): number[] {
  const by = new Map((points ?? []).map((p) => [p.year, p.amount_mxn]))
  return Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => by.get(from + i) ?? 0)
}

/** The inline mini-visual: amounts by year as one ink line (64 × 16), the last year marked. */
export function SparkCell({ values, role, label }: CellRole & { values: (number | null | undefined)[]; label?: string }) {
  const v = values.map((x) => (x == null || !Number.isFinite(x) ? 0 : x))
  const max = Math.max(0, ...v)
  if (v.length < 2 || max <= 0) return <td role={role} className="ls-spark" aria-hidden="true" />
  const W = 64, H = 16, dx = W / (v.length - 1)
  const pts = v.map((x, i) => `${(i * dx).toFixed(1)},${(H - 1 - (x / max) * (H - 2)).toFixed(1)}`)
  const [lx, ly] = pts[pts.length - 1].split(',')
  return (
    <td role={role} className="ls-spark" data-l={label}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden="true">
        <polyline points={pts.join(' ')} />
        <circle cx={lx} cy={ly} r={1.75} />
      </svg>
    </td>
  )
}
