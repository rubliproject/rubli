/**
 * RegisterBoard — El Archivo's lists in the Portada board's ROW standard (DESIGN.md §7 «Contratos recientes»;
 * owner 2026-11-04: «make the lists board-style with "Qué se compró"»). Static: a register, not the live board —
 * no split-flap, no cycling, light paper, normal type (no board caps).
 *
 * A row: date · sector (dot + name; ≤ 1279 px the dot leads the buyer) · buyer (institutionShortName) · vendor
 * (a persona física labelled, never by RFC) · «Qué se compró» (lib/categoryShortName, full name in title) ·
 * amount (formatColumnMXN, one unit per column, the row's door) · procedure glyph (■ ● ◐ ○) · indicator chip (getRiskLevelFromScore,
 * low = muted outline) + tags (Caso documentado · Revisar = > 10,000 MDP or a doubtful figure (amount_flag) · ComprasMX). A legend names every symbol
 * on screen. Phone: three lines, as the board.
 */
import { Fragment, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { ContractListItem } from '@/api/types'
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import { RiskExplainTooltip } from '@/components/RiskExplainTooltip'
import { Buyer, Dot, Glyph, LEVEL, PROC, type Level, type Proc } from '@/components/portada/Tablero'
import { fdate } from '@/components/newtabs/ntShared'
import { COMPRASMX_STRUCTURE } from '@/components/contrato/SourceTag'
import { SECTORS, NO_RISK_LABEL, RISK_THRESHOLDS, getRiskLevelFromScore, isUnscored } from '@/lib/constants'
import { categoryShortName } from '@/lib/categoryShortName'
import { cleanContractDescription } from '@/lib/contract-audit'
import { formatColumnMXN } from '@/lib/utils'
import { formatVendorName } from '@/lib/vendor/formatName'
import '@/components/kit/kit.css'
import './contracts.css'   // its own column layouts (no-vendor, quiet): missing on a direct load of a page that is not /contracts

type Lang = 'es' | 'en'
const FLAG_MXN = 10_000_000_000

const procOf = (c: ContractListItem): Proc =>
  c.procedure && c.procedure in PROC ? (c.procedure as Proc) : (c.is_direct_award ? 'directa' : 'concurso')
const levelOf = (c: ContractListItem): Level | null =>
  isUnscored(c.risk_score, c.risk_model_version) ? null : getRiskLevelFromScore(c.risk_score!)
const review = (c: ContractListItem) => c.amount_flag != null || c.amount_mxn > FLAG_MXN
export const contractTitle = (c: ContractListItem, lang: Lang) =>
  (lang === 'en' && c.title_en) || cleanContractDescription(c.title || '', Infinity).objeto || c.contract_number || (lang === 'es' ? `Contrato #${c.id}` : `Contract #${c.id}`)

export type SortKey = 'contract_date' | 'vendor_name' | 'amount_mxn' | 'risk_score'

function Row({ c, lang, lead, picked, explain, hideVendor, quiet }: { c: ContractListItem; lang: Lang; lead?: ReactNode; picked?: boolean; explain?: boolean; hideVendor?: boolean; quiet?: boolean }) {
  const L = (es: string, en: string) => (lang === 'en' ? en : es)
  const sec = c.sector_id ? SECTORS.find((s) => s.id === c.sector_id) : undefined
  const p = procOf(c)
  const lv = levelOf(c)
  const title = contractTitle(c, lang)
  const amt = formatColumnMXN(c.amount_mxn)
  const cat = c.category_id != null && c.category_es ? L(c.category_es, c.category_en || c.category_es) : null
  const sub = L(c.subcategory_es ?? '', c.subcategory_en ?? c.subcategory_es ?? '')
  const chip = lv && (
    <span className={quiet ? `rg-q is-${lv}` : `bd-st is-${lv}`}>
      <span className="sr-only">{L('Indicador de riesgo: ', 'Risk indicator: ')}</span>
      {L(LEVEL[lv].es, LEVEL[lv].en)}
    </span>
  )
  return (
    <li className={`bd-row${picked ? ' is-picked' : ''}`}>
      {lead && <span className="bd-c rg-sel">{lead}</span>}
      <span className="bd-c bd-age">
        <time dateTime={c.contract_date ?? undefined}>{c.contract_date ? fdate(c.contract_date, lang) : c.contract_year ?? '—'}</time>
      </span>
      <span className="bd-c bd-sec">{sec ? <span><Dot id={sec.id} lang={lang} />{L(sec.name, sec.nameEN)}</span> : '—'}</span>
      <span className="bd-c bd-buyer">
        {c.institution_name
          ? <Buyer b={{ id: c.institution_id ?? null, name: c.institution_name, siglas: c.institution_siglas, sector: c.sector_id ?? null }} lang={lang} />
          : '—'}
      </span>
      {!hideVendor && <span className="bd-c bd-vendor">
        {/* one line: the name gives way («…»), the «persona física» label never does */}
        <span className="rg-v">
          {c.vendor_id && c.vendor_name
            ? <EntityIdentityChip type="vendor" id={c.vendor_id} name={c.vendor_name} variant="name" className="bd-chip" />
            : <span>{formatVendorName(c.vendor_name, Infinity) || '—'}</span>}
          {/* owner policy 2026-10-29: a persona física's published name, labelled; never an RFC */}
          {c.vendor_is_individual && <span className="bd-dim rg-pf">{L(' · persona física', ' · individual')}</span>}
        </span>
      </span>}
      <span className="bd-c bd-cat" title={cat ? `${cat}${sub ? ` · ${sub}` : ''}` : undefined}>
        {cat
          ? <EntityIdentityChip type="category" id={c.category_id!} name={cat} variant="name" className="bd-chip" ariaLabel={cat}>{categoryShortName(c.category_id!, cat, lang)}</EntityIdentityChip>
          : <span className="bd-dim" title={L('El registro no trae categoría', 'The record carries no category')}>—</span>}
      </span>
      <span className="bd-c bd-amt r">
        <Link to={`/contracts/${c.id}`} state={{ from: 'archive' }} className="bd-go" title={title} aria-label={`${title}, ${amt} — ${L('ver contrato', 'open contract')}`}>{amt}</Link>
      </span>
      <span className="bd-c bd-proc" title={L(PROC[p].long.es, PROC[p].long.en)}>
        <span><Glyph p={p} /><span className="bd-pn">{L(PROC[p].es, PROC[p].en)}</span></span>
      </span>
      <span className="bd-c bd-risk">
        {chip
          ? explain && c.risk_score != null
            ? <RiskExplainTooltip contractId={c.id} riskScore={c.risk_score} riskLevel={lv!}><span className="rg-tip" tabIndex={0}>{chip}</span></RiskExplainTooltip>
            : chip
          : <span className="bd-dim" title={L(NO_RISK_LABEL.es, NO_RISK_LABEL.en)}>—</span>}
        {c.is_documented_case && c.case_slug && (
          <EntityIdentityChip type="case" id={c.case_slug} name={L(c.case_name_es || c.case_name_en || '', c.case_name_en || c.case_name_es || '')} variant="name" className="bd-chip bd-tag is-case">{L('Caso', 'Case')}</EntityIdentityChip>
        )}
        {review(c) && <span className="bd-tag is-flag" title={L('Más de 10,000 MDP o cifra dudosa: marcado para revisión manual', 'Above MXN 10B or a doubtful figure: flagged for manual review')}>{L('Revisar', 'Review')}</span>}
        {c.source_structure === COMPRASMX_STRUCTURE && <span className="bd-tag is-src" title={L('Fuente: ComprasMX (registro 2025–26)', 'Source: ComprasMX (2025–26 feed)')}>ComprasMX</span>}
      </span>
    </li>
  )
}

/** The legend: only the symbols on screen. */
function Legend({ rows, lang, quiet }: { rows: ContractListItem[]; lang: Lang; quiet?: boolean }) {
  const L = (es: string, en: string) => (lang === 'en' ? en : es)
  const procs = (['directa', 'licitacion', 'invitacion', 'concurso', 'otro'] as Proc[]).filter((p) => rows.some((c) => procOf(c) === p))
  const levels = (['critical', 'high', 'medium', 'low'] as Level[]).filter((l) => rows.some((c) => levelOf(c) === l))
  if (!rows.length) return null
  return (
    <ul className="bd-legend" aria-label={L('Cómo leer la lista', 'How to read the list')}>
      {procs.map((p) => (
        <li key={p}><Glyph p={p} />{p === 'concurso' ? L('Con concurso (tipo sin dato)', 'Tendered (kind not recorded)') : L(PROC[p].long.es, PROC[p].long.en)}</li>
      ))}
      {rows.some((c) => c.sector_id) && <li className="bd-lg-gap"><i className="bd-dot is-key" aria-hidden="true" />{L('Color = sector del comprador', 'Colour = the buyer’s sector')}</li>}
      {levels.length > 0 && <li className="bd-lg-gap">
        {levels.map((l) => (
          <span key={l} className={quiet ? `rg-q is-${l}` : `bd-st is-${l}`}>{L(LEVEL[l].es, LEVEL[l].en)}{l === 'low' ? ` < ${RISK_THRESHOLDS.medium.toFixed(2)}` : ` ≥ ${RISK_THRESHOLDS[l].toFixed(2)}`}</span>
        ))}
        {L('= indicador de riesgo', '= risk indicator')}
      </li>}
      {rows.some((c) => levelOf(c) == null) && <li className="bd-lg-gap"><span className="bd-dim rg-k">—</span>{L('sin indicador aún', 'no indicator yet')}</li>}
      {rows.some((c) => c.is_documented_case && c.case_slug) && <li className="bd-lg-gap"><span className="bd-tag is-case">{L('Caso', 'Case')}</span>{L('en un caso documentado', 'in a documented case')}</li>}
      {rows.some(review) && <li className="bd-lg-gap"><span className="bd-tag is-flag">{L('Revisar', 'Review')}</span>{L('más de 10,000 MDP o cifra dudosa', 'above MXN 10B or a doubtful figure')}</li>}
      {rows.some((c) => c.source_structure === COMPRASMX_STRUCTURE) && <li className="bd-lg-gap"><span className="bd-tag is-src">ComprasMX</span>{L('registro 2025–26', '2025–26 feed')}</li>}
    </ul>
  )
}

export function RegisterBoard({
  rows, lang, label, sort, onSort, lead, picked, after, status, explain = false, hideVendor = false, quietLevels = false, riskHead,
}: {
  rows: ContractListItem[]
  lang: Lang
  label: string
  /** Sortable headers (the main register); omit for a fixed list (the flagged band). */
  sort?: { by: string; order: 'asc' | 'desc' }
  onSort?: (k: SortKey) => void
  /** A leading cell per row (the register's compare box + quick look). */
  lead?: (c: ContractListItem) => ReactNode
  picked?: (c: ContractListItem) => boolean
  /** Content under a row (the opened card): an <li className="rg-open"> or null. */
  after?: (c: ContractListItem) => ReactNode
  /** Loading / empty / error line in place of rows. */
  status?: ReactNode
  /** Hovering the chip explains the indicator (fetches per contract: the register only). */
  explain?: boolean
  /** Every row is one supplier's (a vendor's own list): drop the repeated supplier column. */
  hideVendor?: boolean
  /** The level as a quiet word per row (a small red mark only for crítico), not a filled chip: for a list where
   *  most rows share one level, which the page states once (`riskHead`). Default: the chips. */
  quietLevels?: boolean
  /** The indicator column's head, e.g. «Indicador · 224 críticos» (the level said once). */
  riskHead?: string
}) {
  const L = (es: string, en: string) => (lang === 'en' ? en : es)
  // a plain function, not a component: a component defined here would remount (and drop focus) on every render
  const H = (label: string, k?: SortKey, className?: string) => {
    if (!k || !onSort || !sort) return <span className={className}>{label}</span>
    const on = sort.by === k
    const dir = on ? (sort.order === 'desc' ? L('descendente', 'descending') : L('ascendente', 'ascending')) : ''
    return (
      <span className={className}>
        <button type="button" className="rg-sort" aria-pressed={on} onClick={() => onSort(k)}
          aria-label={`${L('Ordenar por', 'Sort by')} ${label.toLowerCase()}${dir ? ` (${dir})` : ''}`}>
          {label}<span aria-hidden="true">{on ? (sort.order === 'desc' ? ' ↓' : ' ↑') : ''}</span>
        </button>
      </span>
    )
  }
  return (
    <div className={`bd rg${lead ? ' has-sel' : ''}${hideVendor ? ' no-vendor' : ''}`}>
      <div className="bd-grid">
        <div className="bd-row bd-cols">
          {lead && <span className="rg-sel" />}
          {H(L('Fecha', 'Date'), 'contract_date')}
          <span className="bd-sec">{L('Sector', 'Sector')}</span>
          <span>{L('Comprador', 'Buyer')}</span>
          {!hideVendor && H(L('Proveedor', 'Supplier'), 'vendor_name')}
          <span className="bd-cat" title={L('Categoría de gasto: el tipo de bien o servicio contratado', 'Spending category: the kind of good or service contracted')}>{L('Qué se compró', 'What was bought')}</span>
          {H(L('Monto', 'Amount'), 'amount_mxn', 'r')}
          <span className="bd-hp">{L('Procedimiento', 'Procedure')}</span>
          {H(riskHead ?? L('Indicador', 'Indicator'), 'risk_score', 'bd-hr')}
        </div>
        <ul className="bd-list" aria-label={label}>
          {status != null
            ? <li className="rg-msg">{status}</li>
            : rows.map((c) => [
              <Row key={c.id} c={c} lang={lang} lead={lead?.(c)} picked={picked?.(c)} explain={explain} hideVendor={hideVendor} quiet={quietLevels} />,
              after ? <Fragment key={`${c.id}-open`}>{after(c)}</Fragment> : null,
            ])}
        </ul>
      </div>
      {status == null && <Legend rows={rows} lang={lang} quiet={quietLevels} />}
    </div>
  )
}
