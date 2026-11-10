/**
 * The night edition (DESIGN.md §5 / §6.7, template v3 2026-10-28): `<html data-theme="night">`
 * re-values the same tokens in index.css. The reader's choice persists in localStorage
 * (`rubli-edition`). Night is OPT-IN only (owner, sampler pick 2026-10-28): with nothing stored
 * the edition is day, whatever `prefers-color-scheme` says. The retired
 * `useTheme` store (`rubli-theme`, html.dark) is not read: its stale «dark» default would put
 * every old visitor in night without asking.
 */
import { useSyncExternalStore } from 'react'
import { setPaletteEdition } from '@/lib/constants'

export type Edition = 'day' | 'night'
const KEY = 'rubli-edition'
const listeners = new Set<() => void>()

function stored(): Edition | null {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'day' || v === 'night' ? v : null
  } catch {
    return null
  }
}

let current: Edition = typeof window === 'undefined' ? 'day' : stored() ?? 'day'

function apply(e: Edition) {
  setPaletteEdition(e)
  if (typeof document === 'undefined') return
  if (e === 'night') document.documentElement.dataset.theme = 'night'
  else delete document.documentElement.dataset.theme
  // the browser chrome follows the paper (index.html ships the day value)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', e === 'night' ? '#000000' : '#ffffff')
}

/** Set the edition and remember it. */
export function setEdition(e: Edition) {
  if (e === current) return
  current = e
  let saved = true
  try { localStorage.setItem(KEY, e) } catch { saved = false /* private mode: the choice lasts the tab */ }
  apply(e)
  // ponytail: charts and module-level copies of the TS palettes read their hexes once, so a live
  // swap would leave them in the old edition; a reload re-evaluates them. Per-chart subscriptions
  // to useEdition would avoid the reload if it ever matters.
  if (saved) { location.reload(); return }
  listeners.forEach((l) => l())
}

export function useEdition(): Edition {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => { listeners.delete(l) } },
    () => current,
    () => 'day',
  )
}

// Applied at import (main.tsx imports this before the first render) so the first paint has the
// right paper.
if (typeof window !== 'undefined') apply(current)
