/**
 * Los patrones § Gasto a ciegas (docs/BACKLOG_LOS_PATRONES.md § Gasto a ciegas, MAGENTA build 2026-11-05) — the board.
 * One row per budget entity GET /no-se-ve measures (every entity the budget↔register map covers): spent (Cuenta Pública,
 * chapters 2000/3000/5000/6000) against what shows in a public contract, six years together. A project's own units
 * (Tren Maya S.A., FONATUR Tren Maya) are inside the project row and are not listed twice.
 */
import type { Ent, Model } from '@/lib/noSeVe/model'

export type Tag = 'ciegas' | 'visible' | 'nocomp' | 'singasto' | 'fuera'
export interface EnteRow { e: Ent; y0: number; y1: number; n: number; ratio: number | null; tag: Tag }

export const BLIND_BELOW = 0.5

export function tagOf(e: Ent): Tag {
  if (e.grp === 'ley') return 'fuera'
  if (e.share == null) return 'singasto'  // no spending on record: not «its own law» (SILVER 11-05)
  if (e.share > 1) return 'nocomp'
  return e.share < BLIND_BELOW ? 'ciegas' : 'visible'
}

/** Contracts ÷ spent, six years together: two totals with different timing, never a peso-by-peso match (ICIJ
 *  fact-check 2026-11-05). Null when not comparable (> 1: multi-year contracts signed ahead) or out by law. */
export const ratioOf = (e: Ent) => (e.share == null || e.share > 1 || e.grp === 'ley' ? null : e.share)

const ORDER: Record<Tag, number> = { ciegas: 0, visible: 0, nocomp: 1, singasto: 1, fuera: 2 }

export function enteRows(m: Model): EnteRow[] {
  const projIds = new Set(m.proj.ids)
  const rows = m.ents
    .filter((e) => e.grp === 'proj' || !(e.ids.length > 0 && e.ids.every((id) => projIds.has(id))))
    .map((e): EnteRow => {
      const live = m.years.filter((_, k) => e.live[k])
      return { e, y0: live[0] ?? m.years[0], y1: live[live.length - 1] ?? m.years[m.years.length - 1], n: e.n.reduce((s, v) => s + v, 0), ratio: ratioOf(e), tag: tagOf(e) }
    })
  // the project leads; then the comparable rows, blindest first; then not comparable; then out by law
  return rows.sort((a, b) => (b.e.grp === 'proj' ? 1 : 0) - (a.e.grp === 'proj' ? 1 : 0)
    || ORDER[a.tag] - ORDER[b.tag]
    || (a.e.share ?? 0) - (b.e.share ?? 0))
}

/** «2020–25» / «2024». */
export const span = (r: EnteRow) => (r.y0 === r.y1 ? String(r.y0) : `${r.y0}–${String(r.y1).slice(2)}`)

/** Chapter I's one finding (owner 11-07: the wall's bars → rows): of the entities with a comparable share (spent > 0,
 *  contracts ≤ spent, not out by law), how many show under half in contracts; plus the civilian median and the Navy. */
export function quienFinding(m: Model) {
  const comp = m.ents.filter((e) => ratioOf(e) != null)
  const semar = m.by.get('semar')
  return {
    n: comp.length,
    blind: comp.filter((e) => (e.share as number) < BLIND_BELOW).length,
    civMedian: m.civMedian,
    semar: semar && semar.share != null ? Math.min(1, semar.share) : null,
  }
}
