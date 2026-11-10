import { describe, expect, it } from 'vitest'
import { climb, drillLevel } from './drill'

describe('drillLevel', () => {
  it('reads the level from the URL state', () => {
    expect(drillLevel({ sector: null, vendor: false, nivel: null })).toBe(0)
    expect(drillLevel({ sector: 1, vendor: false, nivel: null })).toBe(1)
    expect(drillLevel({ sector: 1, vendor: true, nivel: null })).toBe(2)
    expect(drillLevel({ sector: null, vendor: true, nivel: 'contratos' })).toBe(3)
  })
  it('contracts need a vendor', () => {
    expect(drillLevel({ sector: 3, vendor: false, nivel: 'contratos' })).toBe(1)
  })
})

describe('climb', () => {
  it('clears every deeper level', () => {
    expect(climb(0)).toEqual({ nivel: null, v: null, sector: null })
    expect(climb(1)).toEqual({ nivel: null, v: null })
    expect(climb(2)).toEqual({ nivel: null })
    expect(climb(3)).toEqual({})
  })
})
