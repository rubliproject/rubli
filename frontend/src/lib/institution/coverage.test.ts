import { describe, expect, it } from 'vitest'
import { coverageLine, coverageShort, coverageValue, type CoverageInfo, coverageBandText } from './coverage'

const SEDENA: CoverageInfo = { ratio: 0.309, band: 'parcial', lowerBound: true, years: [2018, 2024] }
const CFE: CoverageInfo = { ratio: 0, band: 'baja', lowerBound: false, years: [2018, 2024] }
const IMSS: CoverageInfo = { ratio: 0.833, band: 'alta', lowerBound: false, years: [2018, 2024] }
const CENSIDA: CoverageInfo = { ratio: 12.97, band: 'alta', lowerBound: false, years: [2018, 2024] }

describe('coverage copy (coverage-badge.md)', () => {
  it('formats lower bounds, caps and plain shares', () => {
    expect(coverageValue(SEDENA, 'es')).toBe('al menos 31%')
    expect(coverageValue(SEDENA, 'en')).toBe('at least 31%')
    expect(coverageValue(IMSS, 'es')).toBe('83%')
    expect(coverageValue(CENSIDA, 'en')).toBe('≥100%')
  })
  it('low coverage reads as visibility, never as a verdict', () => {
    for (const lang of ['es', 'en']) {
      const s = coverageLine(CFE, lang).toLowerCase()
      expect(s).toMatch(/no es un hallazgo|not a finding/)
      expect(s).not.toMatch(/corrup|riesgo|risk|opaco|opaque/)
    }
    expect(coverageLine(SEDENA, 'es')).toContain('sólo una parte de las compras de esta institución')
    expect(coverageLine(SEDENA, 'en')).toContain("the grade sees only part of this institution's buying")
  })
  it('explains ratios above 100% as consolidated or multi-year buying', () => {
    expect(coverageLine(CENSIDA, 'es')).toContain('compras consolidadas')
    // «Por pesos» spec §6: ≥ 100% must not read «alta»/"high".
    expect(coverageShort(CENSIDA, 'en')).toBe('CompraNet coverage: ≥100% · consolidated purchases or trusts')
    expect(coverageShort(CENSIDA, 'es')).toBe('Cobertura CompraNet: ≥100% · compras consolidadas o fideicomisos')
    expect(coverageBandText(CENSIDA, 'es')).toBe('compras consolidadas o fideicomisos')
    expect(coverageBandText(SEDENA, 'es')).toBe('parcial')
    expect(coverageShort(CFE, 'en')).toBe('CompraNet coverage: 0% (low) · the grade sees only a small part of its buying')
    expect(coverageShort(SEDENA, 'es')).toBe('Cobertura CompraNet: al menos 31% (parcial) · la calificación ve sólo una parte de sus compras')
  })
})
