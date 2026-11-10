import { describe, expect, it } from 'vitest'
import { catsOf, findingCat, findingHalf, findingTop, sectorsOf, type CubeRow } from './diseccion'

const rows: CubeRow[] = [
  [20, 1, 'amlo', 10, 600, 8, 10],
  [21, 1, 'amlo', 5, 100, 5, 5],
  [30, 3, 'amlo', 4, 300, 1, 4],
  [40, 4, 'amlo', 1, 0, 0, 0],
  [20, 1, 'fox', 9, 999, 0, 0],
]
const name = (id: number) => ({ 1: 'Salud', 3: 'Infraestructura', 20: 'Medicinas', 21: 'Material' } as Record<number, string>)[id] ?? '?'

describe('diseccion', () => {
  it('folds one government by sector, shares of its money, zero-money sectors dropped', () => {
    const s = sectorsOf(rows, 'amlo')
    expect(s.map((x) => x.id)).toEqual([1, 3])
    expect(s[0]).toMatchObject({ value: 700, contracts: 15, share: 0.7, da: 13 / 15 })
  })
  it('folds a sector by category, shares of the sector', () => {
    const c = catsOf(rows, 'amlo', 1)
    expect(c.map((x) => [x.id, x.share])).toEqual([[20, 600 / 700], [21, 100 / 700]])
  })
  it('no procedure coded → da null (Fox)', () => {
    expect(sectorsOf(rows, 'fox')[0].da).toBeNull()
  })
  it('sentences only when true', () => {
    const s = sectorsOf(rows, 'amlo')
    expect(findingTop(s, 'López Obrador', name, 'es', false)).toBe('Con López Obrador, salud se llevó 70 de cada 100 pesos.')
    expect(findingTop([], 'x', name, 'es', false)).toBeNull()
    expect(findingHalf(s, 'es')).toBe('La mitad del dinero fue a un solo sector.')
    expect(findingHalf(s.slice(0, 1), 'es')).toBeNull()
    const even = [{ id: 1, contracts: 1, value: 1, share: 0.3, da: null }, { id: 2, contracts: 1, value: 1, share: 0.3, da: null }, { id: 3, contracts: 1, value: 1, share: 0.4, da: null }]
    expect(findingHalf(even, 'en')).toBe('Half the money went to 2 of 3 sectors.')
    expect(findingCat(catsOf(rows, 'amlo', 1), 'Salud', name, 'es')).toBe('En salud, «Medicinas» se llevó 86 de cada 100 pesos.')
  })
})
