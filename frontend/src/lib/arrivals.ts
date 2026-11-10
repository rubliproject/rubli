/**
 * Row arrivals (DESIGN.md §7 «Arrival», template v3 2026-10-28). A row whose date is newer than the
 * reader's last visit to this table slides in once (`tbody.live tr.is-new.is-arriving`: translateY
 * 8 → 0, 420 ms --ease-out) and keeps an 8% tint for the session. Existing rows never animate.
 * A first visit has nothing to compare with, so nothing is «new». Storage can throw (private mode,
 * blocked site data): every read and write is guarded, and the table renders the same without it.
 */
import { useEffect, useState } from 'react'

const STAMP = (scope: string) => `rubli-seen:${scope}`
const SESSION = (scope: string) => `rubli-arrived:${scope}`

/** The keys of the rows dated after `stamp` (ISO dates compare as strings). No stamp → none. */
export function newSince<T>(rows: T[], key: (r: T) => string | number | null | undefined, date: (r: T) => string | null | undefined, stamp: string | null): string[] {
  if (!stamp) return []
  const out: string[] = []
  for (const r of rows) {
    const d = date(r); const k = key(r)
    if (d && k != null && d > stamp) out.push(String(k))
  }
  return out
}

/** The newest date among the rows (the next visit's stamp). */
export function newestDate<T>(rows: T[], date: (r: T) => string | null | undefined): string | null {
  let m: string | null = null
  for (const r of rows) { const d = date(r); if (d && (!m || d > m)) m = d }
  return m
}

function read(store: () => Storage, k: string): string | null {
  try { return store().getItem(k) } catch { return null }
}
function write(store: () => Storage, k: string, v: string) {
  try { store().setItem(k, v) } catch { /* the table renders the same without it */ }
}

export interface Arrivals {
  /** Rows new since the last visit (tinted for the session). */
  isNew: (key: string | number | null | undefined) => boolean
  /** True only on the render where they were found — the slide plays once, never on a revisit. */
  arriving: boolean
}

export function useArrivals<T>(
  rows: T[] | undefined,
  key: (r: T) => string | number | null | undefined,
  date: (r: T) => string | null | undefined,
  scope: string,
): Arrivals {
  // this session already compared: restore the tint, do not replay the slide
  const [fresh, setFresh] = useState<Set<string> | null>(() => {
    const s = read(() => sessionStorage, SESSION(scope))
    if (s == null) return null
    try { return new Set(JSON.parse(s) as string[]) } catch { return new Set() }
  })
  const [arriving, setArriving] = useState(false)

  useEffect(() => {
    if (fresh || !rows?.length) return
    const keys = newSince(rows, key, date, read(() => localStorage, STAMP(scope)))
    const top = newestDate(rows, date)
    if (top) write(() => localStorage, STAMP(scope), top)
    write(() => sessionStorage, SESSION(scope), JSON.stringify(keys))
    setFresh(new Set(keys))
    setArriving(keys.length > 0)
    // key/date are read once per session by design; rows is the trigger
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, fresh, scope])

  return { isNew: (k) => k != null && !!fresh?.has(String(k)), arriving }
}
