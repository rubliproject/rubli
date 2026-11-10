import { describe, expect, it } from 'vitest'
import { sectorLine } from './sectorLines'

// prod /sectors/treemap, 2026-11-03 (value MXN · critical share % · critical contracts)
const row = (sector_code: string, total_value_mxn: number, critical_share_pct: number, critical_risk_count: number) =>
  ({ sector_code, total_value_mxn, critical_share_pct, critical_risk_count })
const PROD = [
  row('salud', 3346.5e9, 9.69, 90000), row('infraestructura', 2561.3e9, 1.44, 3000),
  row('energia', 1888.8e9, 2.79, 4000), row('defensa', 334.4e9, 4.69, 2000), row('otros', 44.4e9, 2.08, 100),
]

describe('sectorLine', () => {
  it('drops «Mayor gasto. Menor riesgo.» when Energía is #3 by spend', () => {
    expect(sectorLine('energia', PROD, true)).toBe('PEMEX · CFE · SENER')
  })
  it('keeps the energy paradox only when Energía is #1 by spend AND lowest critical share', () => {
    const rows = [row('energia', 9e12, 1, 10), row('salud', 3e12, 9, 90)]
    expect(sectorLine('energia', rows, true)).toBe('Mayor gasto. Menor riesgo. La paradoja energética.')
  })
  it('Salud keeps its critical-risk line only while it has the most critical contracts', () => {
    expect(sectorLine('salud', PROD, true)).toBe('Donde se concentra el riesgo crítico del país.')
    expect(sectorLine('salud', [...PROD, row('energia2', 1, 1, 1e6)], true)).toBe('IMSS · ISSSTE · medicamentos')
  })
  it('non-ranking lines and tags pass through', () => {
    expect(sectorLine('defensa', PROD, false)).toBe('SEDENA and SEMAR, under national-security exceptions.')
    expect(sectorLine('otros', PROD, true)).toBe('Sin clasificar · misceláneos')
  })
})
