/**
 * Catalog helpers — spec .claude/designus/atlas-instruments-2026-10-03/spec-draft.md §3.5, §4.1, F16.
 */
import { formatEntityName } from '@/lib/entity/format'
import { skyCopy } from './copy'
import type { SkyManifest, SkySystem } from './geometry'

export type CatScope = 'system' | 'sector' | 'kin'
export type CatSort = 'money' | 'share'
export type CatHover = { kind: 'body'; vendor: number } | { kind: 'star'; idx: number } | null

/** `tab=cat.{scope}.{sort}` → its parts. */
export function catOf(tab: string | null): { scope: CatScope; sort: CatSort } | null {
  const m = tab ? /^cat\.(system|sector|kin)\.(money|share)$/.exec(tab) : null
  return m ? { scope: m[1] as CatScope, sort: m[2] as CatSort } : null
}

/** The public label of a withheld body (F16) — the only way such a body is ever listed. */
export const withheldLabel = (v: number, lang: 'en' | 'es') => skyCopy('catWithheldRow', lang, { id: v })

/** A hovered dot's supplier name, read from its OWN host's system (owner 11-07 P0: every dot of a star that
 *  was not the located one read «unnamed supplier»). No system yet → «loading»; a withheld body → its public label. */
export function supplierTipName(sys: SkySystem | null | undefined, v: number, lang: 'en' | 'es'): string {
  if (!sys) return lang === 'en' ? 'loading the name…' : 'cargando el nombre…'
  const name = sys.bodies.find((b) => b.vendor_id === v)?.name ?? sys.ghosts.find((g) => g.vendor_id === v)?.name
  return name ? formatEntityName('vendor', name, 'full') : withheldLabel(v, lang)
}

/** The located star's sector, its stars by V desc (the J/K stepper's list too). */
export const sectorStars = (m: SkyManifest, star: number) => starsOfSector(m, m.stars.sector[star])
export function starsOfSector(m: SkyManifest, g: number): number[] {
  const S = m.stars
  const out: number[] = []
  for (let i = 0; i < S.id.length; i++) if (S.sector[i] === g) out.push(i)
  return out.sort((a, b) => S.v[b] - S.v[a])
}

