/**
 * Cover — h1 + lede + optional lead search | side column, 7fr 5fr (DESIGN.md §4).
 * Compact chrome (DESIGN.md §3.1, owner 2026-11-02 «every tab» after El Mapa): an optional kicker
 * rides the h1's line, and the lede is ONE line with «más» when it is cut (`MoreLine`).
 * `fullLede` keeps the lede wrapped (document pages whose lede is the reading itself).
 */
import type { ReactNode } from 'react'
import { MoreLine } from '@/components/kit/MoreLine'

export function Cover({ pre, kicker, title, lede, fullLede, lead, side, children, className }: {
  /** Before the h1 (the dashboard puts the search first). */
  pre?: ReactNode
  /** A short label set on the h1's own line (label face 12), never its own row. */
  kicker?: ReactNode
  className?: string
  /** Omit under a kit/PageHead (it owns the h1): the cover is then the page's first content block (lead | side). */
  title?: ReactNode
  lede?: ReactNode
  /** Keep the lede wrapped instead of one line + «más». */
  fullLede?: boolean
  /** The lead search (landings). Sits after the lede. */
  lead?: ReactNode
  /** The side column: record chain → mini Atlas → Declaraciones I–II. */
  side?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className={['ct-cover', className, side ? null : 'is-solo'].filter(Boolean).join(' ')}>
      <div>
        {pre}
        {title == null ? null : kicker ? <div className="ct-cover-line"><span className="ct-kicker">{kicker}</span><h1>{title}</h1></div> : <h1>{title}</h1>}
        {lede && (fullLede ? <p className="ct-lede">{lede}</p> : <MoreLine className="ct-lede">{lede}</MoreLine>)}
        {lead}
        {children}
      </div>
      {side && <div className="ct-side">{side}</div>}
    </div>
  )
}
