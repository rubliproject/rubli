/**
 * El panorama — the pure model behind /institutions' own frame on El Mapa's sky (owner 2026-11-08: «the front page
 * maps and Red Flags are the best … include the institutions … each section needs its own separate frame»).
 * The sky's manifest already carries one star per buyer (size = money `v`, colour = sector, `h` = share of its money
 * at indicador ≥ 0.40, ring = `h` at or above its sector's p90). This file only cuts it by level of government and
 * computes the frame's sentences; nothing here is typed by hand.
 */
import type { SkyManifest } from '@/lib/atlas/sky/geometry'

export type Nivel = 'federal' | 'estatal' | 'municipal' | 'todos'
export const NIVELES: readonly Nivel[] = ['federal', 'estatal', 'municipal', 'todos']
/** manifest `stars.lvl`: 0 federal · 1 estatal · 2 municipal · 3 otro (the «otro» 11 ride with «todos» only). */
const LVL: Record<Exclude<Nivel, 'todos'>, number> = { federal: 0, estatal: 1, municipal: 2 }

export const parseNivel = (s: string | null): Nivel => (NIVELES.includes(s as Nivel) ? (s as Nivel) : 'federal')

/** A sector rings only with this many buyers at `h > 0` in the frame: below it «the riskiest tenth» is one buyer. */
export const RING_MIN_BUYERS = 10

/** The stars of one level of government, every column kept aligned; a manifest without `lvl` is returned whole.
 *  The ring rule is re-cut inside the frame (each sector's p90 of `h` among ITS buyers at this level): the whole
 *  sky's p90 would ring a third of the federal buyers, the big spenders — a ring must stay the riskiest tenth. */
export function pickLevel(m: SkyManifest, nivel: Nivel): SkyManifest {
  const lvl = m.stars.lvl
  if (nivel === 'todos' || !lvl) return m
  const want = LVL[nivel]
  const keep: number[] = []
  for (let i = 0; i < lvl.length; i++) if (lvl[i] === want) keep.push(i)
  const s = m.stars as unknown as Record<string, unknown[]>
  const stars = Object.fromEntries(Object.entries(s).map(([k, col]) => [k, Array.isArray(col) ? keep.map((i) => col[i]) : col])) as unknown as SkyManifest['stars']
  const sectors = m.sectors.map((g) => {
    const hs = stars.h.filter((h, i) => h > 0 && stars.sector[i] === g.id).sort((a, b) => a - b)
    // nearest-rank p90; a thin sector (or none) cannot ring (h ≤ 1 < 2)
    return { ...g, h_p90: hs.length >= RING_MIN_BUYERS ? hs[Math.ceil(0.9 * hs.length) - 1] : 2 }
  })
  return { ...m, stars, sectors }
}

export interface PanoramaFacts {
  /** buyers drawn · buyers with the red ring · their money · buyers with no money at indicador ≥ 0.40 */
  n: number; lit: number; value: number; none: number
  /** the biggest buyer (by money) and its share of `value`; null on an empty frame */
  top: { i: number; share: number } | null
}

/** The frame's figures over its stars (or over one sector's), with the sky's own ring rule (h ≥ sector p90). */
export function panoramaFacts(m: SkyManifest, sector: number | null = null): PanoramaFacts | null {
  const S = m.stars
  const p90 = new Map(m.sectors.map((g) => [g.id, g.h_p90]))
  let n = 0, lit = 0, value = 0, none = 0, top = -1
  for (let i = 0; i < S.id.length; i++) {
    if (sector != null && S.sector[i] !== sector) continue
    n++
    value += S.v[i]
    if (S.h[i] > 0 && S.h[i] >= (p90.get(S.sector[i]) ?? 1)) lit++
    if (!(S.h[i] > 0)) none++
    if (top < 0 || S.v[i] > S.v[top]) top = i
  }
  if (n === 0) return null
  return { n, lit, value, none, top: top >= 0 && value > 0 ? { i: top, share: S.v[top] / value } : null }
}
