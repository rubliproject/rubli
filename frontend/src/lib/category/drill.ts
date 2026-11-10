/**
 * The category dossier drill — Sector › Categoría › Subcategoría › Proveedores.
 *
 * Subcategories are stored per contract by classify_subcategories.py (title + description regexes,
 * Compendio supply-group codes, partidas; first rule that decides wins, a catch-all takes the rest). Where the catch-all swallows the shelf the level
 * says nothing, so the drill skips it and goes straight to the vendors.
 */

export interface DrillSub {
  subcategory_id: number
  is_catch_all: boolean
  total_value: number
}

/** Named (non catch-all) subcategories must hold at least this share of the value… */
export const MIN_NAMED_SHARE = 0.25
/** …spread over at least this many named subcategories with money in them. */
export const MIN_NAMED_SUBS = 2

export interface SubSplit<T extends DrillSub = DrillSub> {
  /** true = the subcategory level carries meaning; false = skip to vendors. */
  useful: boolean
  total: number
  /** share (0–1) of the value in named subcategories */
  namedShare: number
  /** the catch-all row, when there is one */
  catchAll: T | null
}

/** Shelves whose name says only patent / generic, not which medicine: grouped with the remainders, never «the largest kind». */
const UNSTATED_CODES = new Set(['branded_drugs', 'generic_drugs'])
export function isUnstated(r: { code?: string }): boolean {
  return UNSTATED_CODES.has(r.code ?? '')
}

export function subcategorySplit<T extends DrillSub>(rows: T[] | null | undefined): SubSplit<T> {
  const list = rows ?? []
  const total = list.reduce((s, r) => s + Math.max(0, r.total_value || 0), 0)
  const named = list.filter((r) => !r.is_catch_all && r.total_value > 0)
  const namedValue = named.reduce((s, r) => s + r.total_value, 0)
  const namedShare = total > 0 ? namedValue / total : 0
  return {
    useful: total > 0 && named.length >= MIN_NAMED_SUBS && namedShare >= MIN_NAMED_SHARE,
    total,
    namedShare,
    catchAll: list.find((r) => r.is_catch_all) ?? null,
  }
}

/** 0 = a named kind · 1 = a shelf that says only patent / generic · 2 = the catch-all */
function tier(r: DrillSub & { code?: string }): number {
  return r.is_catch_all ? 2 : isUnstated(r) ? 1 : 0
}

/** Named kinds first by value, then the «sin clase» shelves, the catch-all last (remainders, not kinds of thing). */
export function orderSubs<T extends DrillSub & { code?: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => tier(a) - tier(b) || b.total_value - a.total_value)
}

/** Value not covered by the listed items (the «el resto» segment); never negative. */
export function restOf(total: number, values: number[]): number {
  return Math.max(0, total - values.reduce((s, v) => s + v, 0))
}

/** The category is the root the page opens on; Esc from the sector or a subcategory returns to it. */
export type DrillLevel = 'sector' | 'category' | 'sub'

/** Value-weighted share (0–100) bought through «compras consolidadas» across rows; null when no row reports it. */
export function consolidatedShare(rows: { total_value: number; consolidated_value_pct?: number | null }[]): number | null {
  const known = rows.filter((r) => r.consolidated_value_pct != null && r.total_value > 0)
  const total = known.reduce((s, r) => s + r.total_value, 0)
  if (!known.length || total <= 0) return null
  return known.reduce((s, r) => s + r.total_value * (r.consolidated_value_pct as number), 0) / total
}

/**
 * Zoom out: the parent level's strip starts magnified so the segment we came from (at, size — fractions of the
 * strip, origin at the strip's start) fills it, then shrinks to rest. Returns the start transform as
 * translate fraction + scale: point p maps to at' + size' · p, and at → 0, at + size → 1.
 */
export function zoomFrom(at: number, size: number): { at: number; size: number } {
  return size > 0 ? { at: -at / size, size: 1 / size } : { at: 0, size: 1 }
}

/** The largest subcategory that names a kind (rows already ordered by value). */
export function largestKind<T extends DrillSub & { code?: string }>(rows: T[]): T | null {
  return rows.find((r) => tier(r) === 0 && r.total_value > 0) ?? null
}

/**
 * DESIGN.md §8.1 fold for a long shelf: the first `n` named rows, then the catch-all (a remainder that is often
 * the largest money, so it never hides); the rest open in place. A fold of one is not a fold.
 */
export function foldSubs<T extends DrillSub & { code?: string }>(rows: T[], n: number, open: boolean): { shown: T[]; hidden: number } {
  const named = rows.filter((r) => tier(r) === 0)
  if (open || named.length <= n + 1) return { shown: rows, hidden: 0 }
  return { shown: [...named.slice(0, n), ...rows.filter((r) => tier(r) > 0)], hidden: named.length - n }
}
