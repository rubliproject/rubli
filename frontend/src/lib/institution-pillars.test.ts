import { describe, it, expect } from 'vitest'
import { INSTITUTION_PILLARS, PILLAR_CEILING } from './institution-pillars'

describe('INSTITUTION_PILLARS (spec institutions-tamiz §0.2)', () => {
  it('carries the observed caps O20/P25/T20/X15/I10, ceiling 90', () => {
    const caps = Object.fromEntries(INSTITUTION_PILLARS.map((p) => [p.dbField, p.max]))
    expect(caps).toEqual({
      pillar_openness: 20, pillar_price: 25, pillar_vendors: 20, pillar_process: 15, pillar_external: 10,
    })
    expect(PILLAR_CEILING).toBe(90)
  })
})
