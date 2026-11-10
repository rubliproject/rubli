/**
 * «La disección» on /administrations (owner 2026-11-08: «dissecting that whole sectors page… that's the dissection I want»):
 * one government's money cut by sector, and each sector by its categories — folded from GET /categories/cube
 * (rows [category_id, sector_id, sexenio, contracts, value, direct, known]; sexenio by contract year; the public register).
 * Every sentence is shown only when true (diseccion.test.ts).
 */
export type CubeRow = [number, number, string, number, number, number, number]
export interface Slice { id: number; contracts: number; value: number; share: number; da: number | null }
type Lang = 'es' | 'en'

function fold(rows: CubeRow[], sx: string, sector: number | null): Slice[] {
  const by = new Map<number, { n: number; v: number; d: number; k: number }>()
  for (const [cat, sec, x, n, v, d, k] of rows) {
    if (x !== sx || (sector != null && sec !== sector)) continue
    const id = sector == null ? sec : cat
    const a = by.get(id) ?? { n: 0, v: 0, d: 0, k: 0 }
    a.n += n; a.v += v; a.d += d; a.k += k
    by.set(id, a)
  }
  const total = [...by.values()].reduce((s, a) => s + a.v, 0)
  return [...by].filter(([, a]) => a.v > 0)
    .map(([id, a]) => ({ id, contracts: a.n, value: a.v, share: total > 0 ? a.v / total : 0, da: a.k ? a.d / a.k : null }))
    .sort((a, b) => b.value - a.value)
}

/** The government's money by buyer sector, largest first; `share` = of the government's money. */
export const sectorsOf = (rows: CubeRow[], sx: string) => fold(rows, sx, null)
/** One sector's money by category under the government; `share` = of that sector's money. */
export const catsOf = (rows: CubeRow[], sx: string, sector: number) => fold(rows, sx, sector)

const of100 = (x: number) => Math.round(100 * x)

/** h1: the sector that took the most. `open` = the term still running. */
export function findingTop(xs: Slice[], who: string, name: (id: number) => string, lang: Lang, open: boolean): string | null {
  const s = xs[0]
  if (!s) return null
  const n = of100(s.share), sec = name(s.id).toLowerCase()
  if (lang === 'es') return open ? `Con ${who}, hasta hoy, ${sec} se lleva ${n} de cada 100 pesos.` : `Con ${who}, ${sec} se llevó ${n} de cada 100 pesos.`
  return open ? `Under ${who}, so far, ${sec} takes ${n} of every 100 pesos.` : `Under ${who}, ${sec} took ${n} of every 100 pesos.`
}

/** How few sectors hold half the money: «La mitad del dinero fue a 2 de 12 sectores.» */
export function findingHalf(xs: Slice[], lang: Lang): string | null {
  if (xs.length < 2) return null
  let acc = 0
  const k = xs.findIndex((x) => (acc += x.share) >= 0.5) + 1
  if (k < 1) return null
  return lang === 'es'
    ? `La mitad del dinero fue a ${k === 1 ? 'un solo sector' : `${k} de ${xs.length} sectores`}.`
    : `Half the money went to ${k === 1 ? 'a single sector' : `${k} of ${xs.length} sectors`}.`
}

/** Inside an opened sector: its largest category. */
export function findingCat(xs: Slice[], sector: string, name: (id: number) => string, lang: Lang): string | null {
  const c = xs[0]
  if (!c) return null
  const n = of100(c.share)
  return lang === 'es'
    ? `En ${sector.toLowerCase()}, «${name(c.id)}» se llevó ${n} de cada 100 pesos.`
    : `In ${sector.toLowerCase()}, «${name(c.id)}» took ${n} of every 100 pesos.`
}
