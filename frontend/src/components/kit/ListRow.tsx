/**
 * The one list standard (DESIGN.md §8.1, owner 2026-10-29: «the one in Red Flags is the best we have … adapt it»).
 * Every register, ranking and record list reads like La fila of /aria: a padded № in mono, the entity name in the
 * body face at row size, figures right in mono tabular, the indicator as a compact reading.
 *
 *   Table form   — a register with columns (≥ 3 figures per row): `.ct-table.ct-stack`, CSS in contrato.css;
 *                  <RankTh> heads the № column, <RankCell> fills it (`rankNo` for the same number anywhere else).
 *   <ListRow>    — a list that is not a grid (a feed, a short ranked list beside a figure), inside `<ul className="ls">`:
 *                  desktop one line  № · name · meta · amount · reading;
 *                  phone two lines   № · name · amount / meta · reading (same left edge, no orphan line).
 */
import type { CSSProperties, ReactNode } from 'react'

/** «001» — the /aria numbering, one width everywhere. */
export const rankNo = (n: number) => String(n).padStart(3, '0')

export function RankCell({ n, tag, tagTitle, tagColor, className, role }: {
  n: number
  /** A short provenance mark beside the number (/aria: gt · lead · disc). */
  tag?: string
  tagTitle?: string
  tagColor?: string
  className?: string
  /** For a table that spells out its ARIA roles (role="table" … role="cell"). */
  role?: 'cell'
}) {
  return (
    <td role={role} className={className ? `ct-rank ${className}` : 'ct-rank'}>
      <b>{rankNo(n)}</b>
      {tag && <small title={tagTitle} style={tagColor ? { color: tagColor } : undefined}>{tag}</small>}
    </td>
  )
}

/** The № column head: «Nº» on screen, a word for screen readers. */
export function RankTh({ lang, role }: { lang: 'es' | 'en'; role?: 'columnheader' }) {
  return <th role={role} scope="col" className="ct-rank" aria-label={lang === 'en' ? 'Rank' : 'Número'}>Nº</th>
}

export function ListRow({ rank, name, meta, amount, reading, className, style }: {
  /** 1-based position; omitted = no № column. */
  rank?: number
  /** The entity (an EntityIdentityChip size="inherit") — takes what the line leaves. */
  name: ReactNode
  /** Buyer · date · procedure — body face 13, muted. */
  meta?: ReactNode
  /** Mono tabular, right, ink. */
  amount?: ReactNode
  /** The risk reading (`<RiskGauge>`). */
  reading?: ReactNode
  className?: string
  style?: CSSProperties
}) {
  const cls = ['ls-row', rank != null && 'has-no', className].filter(Boolean).join(' ')
  return (
    <li className={cls} style={style}>
      {rank != null && <span className="ls-no">{rankNo(rank)}</span>}
      <span className="ls-name">{name}</span>
      {meta != null && <span className="ls-meta">{meta}</span>}
      {amount != null && <span className="ls-amt">{amount}</span>}
      {reading != null && <span className="ls-rd">{reading}</span>}
    </li>
  )
}
