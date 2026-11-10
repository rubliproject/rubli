import { describe, it, expect } from 'vitest'
import type { SkyManifest } from '@/lib/atlas/sky/geometry'
import { panoramaFacts, parseNivel, pickLevel } from './panorama'

// five buyers: three federal (sector 1: h .6 and .1; sector 2: none), one estatal, one otro — plus ten thin federal
// buyers in sector 1 with rising h, so sector 1 clears the ring floor and sector 2 does not
const thin = Array.from({ length: 10 }, (_, k) => k)
const m = {
  sectors: [{ id: 1, h_p90: 0.5 }, { id: 2, h_p90: 0.3 }],
  stars: {
    id: [10, 20, 30, 40, 50, ...thin.map((k) => 100 + k)], name: ['A', 'B', 'C', 'D', 'E', ...thin.map(String)], siglas: Array(15).fill(''),
    sector: [1, 1, 2, 2, 1, ...thin.map(() => 1)],
    v: [100, 300, 50, 10, 20, ...thin.map(() => 1)], h: [0.6, 0, 0.2, 0.3, 0.1, ...thin.map((k) => 0.01 * (k + 1))],
    nv: [1, 2, 3, 4, 5, ...thin.map(() => 1)], lvl: [0, 0, 1, 3, 0, ...thin.map(() => 0)],
  },
} as unknown as SkyManifest

describe('pickLevel', () => {
  it('keeps only that level, every column aligned', () => {
    const f = pickLevel(m, 'federal')
    expect(f.stars.id.slice(0, 3)).toEqual([10, 20, 50])
    expect(f.stars.id).toHaveLength(13)
    expect(f.stars.v.slice(0, 3)).toEqual([100, 300, 20])
    expect(new Set(f.stars.lvl)).toEqual(new Set([0]))
    expect(pickLevel(m, 'estatal').stars.id).toEqual([30])
    expect(pickLevel(m, 'municipal').stars.id).toEqual([])
  })
  it('re-cuts each sector’s ring threshold inside the frame (nearest-rank p90 of h; a thin sector cannot ring)', () => {
    const f = pickLevel(m, 'federal')
    // sector 1: 12 buyers with h > 0, sorted [.01 … .10, .1, .6]; nearest rank ceil(10.8) = 11 → .1
    expect(f.sectors.map((g) => g.h_p90)).toEqual([0.1, 2])
    // A (.6), E (.1) and the thin .10 ring; sector 2 has no federal buyer → h_p90 = 2, no ring possible
    expect(panoramaFacts(f)).toMatchObject({ n: 13, lit: 3 })
    // under the floor: only two risky buyers in sector 2 across the whole sky → no ring
    expect(pickLevel({ ...m, stars: { ...m.stars, lvl: m.stars.lvl!.map(() => 1) } } as SkyManifest, 'estatal').sectors[1].h_p90).toBe(2)
  })
  it('«todos» and a manifest without lvl come back whole', () => {
    expect(pickLevel(m, 'todos')).toBe(m)
    const bare = { ...m, stars: { ...m.stars, lvl: undefined } } as unknown as SkyManifest
    expect(pickLevel(bare, 'federal')).toBe(bare)
  })
})

describe('panoramaFacts', () => {
  it('counts the rings with the sky rule (h ≥ sector p90), the money and the biggest buyer', () => {
    const f = panoramaFacts(pickLevel(m, 'federal'))!
    expect(f).toMatchObject({ n: 13, lit: 3, value: 430, none: 1 })
    expect(f.top).toEqual({ i: 1, share: 300 / 430 })
  })
  it('scopes to one sector; an empty frame is null', () => {
    expect(panoramaFacts(m, 2)).toMatchObject({ n: 2, lit: 1, value: 60, none: 0 })
    expect(panoramaFacts(m, 9)).toBeNull()
  })
})

describe('parseNivel', () => {
  it('defaults to federal', () => {
    expect(parseNivel(null)).toBe('federal')
    expect(parseNivel('x')).toBe('federal')
    expect(parseNivel('todos')).toBe('todos')
  })
})
