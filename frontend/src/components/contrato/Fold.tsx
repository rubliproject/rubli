/**
 * «Ver más» in place for long secondary lists (owner 2026-10-20 compaction): the first
 * rows show, the rest open where they are. Tables can't animate height, so rows that
 * open rise in (`.ct-row-in`); RuledBar folds its own rows with `.ct-fold`.
 * Never hides a single row (a fold of one is just a longer list).
 */
import { useState } from 'react'
import { useLang } from './nav'

export function useRowFold<T>(rows: T[], n: number) {
  const [open, setOpen] = useState(false)
  const cut = rows.length > n + 1 ? n : rows.length
  return {
    shown: open ? rows : rows.slice(0, cut),
    rest: rows.length - cut,
    open,
    toggle: () => setOpen((o) => !o),
    /** Row class for a row that appeared when the fold opened. */
    rowIn: (i: number) => (open && i >= cut ? ' ct-row-in' : ''),
  }
}

export function FoldToggle({ open, rest, onToggle, controls }: { open: boolean; rest: number; onToggle: () => void; controls?: string }) {
  const lang = useLang()
  if (rest <= 0) return null
  return (
    <button type="button" className="ct-more ct-link" aria-expanded={open} aria-controls={controls} onClick={onToggle}>
      {open
        ? (lang === 'en' ? 'Show fewer' : 'Ver menos')
        : (lang === 'en' ? `Show the other ${rest}` : `Ver los ${rest} restantes`)}
    </button>
  )
}
