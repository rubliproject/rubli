import { describe, expect, it } from 'vitest'
import { prevalenceCaveat, sectorRankText } from './sectorRelative'

describe('sectorRankText', () => {
  it('renders nothing when the API has no sector_pct (prod before the precompute)', () => {
    expect(sectorRankText(undefined, 'es')).toBeNull()
    expect(sectorRankText(null, 'en')).toBeNull()
  })
  it('says top X % from the PERCENT_RANK, never «top 0 %»', () => {
    expect(sectorRankText(0.97, 'es')).toBe('top 3 % de su sector')
    expect(sectorRankText(0.97, 'en')).toBe('top 3% of its sector')
    expect(sectorRankText(1, 'es')).toBe('top 1 % de su sector')
    expect(sectorRankText(0.995, 'en')).toBe('top 1% of its sector')
    expect(sectorRankText(0.5, 'es')).toBe('top 50 % de su sector')
  })
  it('below the median is said as such, not «top 80 %»', () => {
    expect(sectorRankText(0.2, 'es')).toBe('en la mitad baja de su sector')
    expect(sectorRankText(0, 'en')).toBe('in the lower half of its sector')
  })
})

describe('prevalenceCaveat', () => {
  it('names the documented-vendor effect only for salud', () => {
    expect(prevalenceCaveat('salud', 'es')).toBe('Indicador de riesgo, no prevalencia; en salud, buena parte de las señales son de proveedores ya documentados.')
    expect(prevalenceCaveat('energia', 'es')).toBe('Indicador de riesgo, no prevalencia.')
    expect(prevalenceCaveat('energia', 'en')).toBe('A risk indicator, not a prevalence.')
  })
})
