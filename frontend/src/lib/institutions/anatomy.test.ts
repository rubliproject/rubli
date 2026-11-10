import { describe, expect, it } from 'vitest'
import { HR_LEVEL, byGrade, fails, failing, pct, widestPart, worstOf, type AnatomyRow } from './anatomy'

const row = (id: number, score: number, v: number, da: number | null = 0.3, top: number | null = 0.1, hr: number | null = 0.5): AnatomyRow => ({
  id, name: `I${id}`, siglas: null, sector_id: 1, score, grade: 'C', n_contracts: 10, total_value_mxn: v, last_year: 2025,
  da_share: da, top_share: top, hr_share: hr, top_vendor: null,
})

describe('anatomy model', () => {
  it('worstOf picks the lowest score, the bigger buyer on a tie, null when empty', () => {
    expect(worstOf([row(1, 50, 9), row(2, 38.8, 5), row(3, 39.2, 7)])?.id).toBe(2)
    expect(worstOf([row(1, 40, 9), row(2, 40, 5)])?.id).toBe(1)
    expect(worstOf([])).toBeNull()
  })
  it('byGrade reads worst first and leaves the input alone', () => {
    const rs = [row(1, 80, 9), row(2, 30, 5), row(3, 55, 7)]
    expect(byGrade(rs).map((r) => r.id)).toEqual([2, 3, 1])
    expect(rs[0].id).toBe(1)
  })
  it('fails at a rounded score under 60, so 59.6 passes and 59.4 fails', () => {
    expect(fails({ score: 59.6 })).toBe(false)
    expect(fails({ score: 59.4 })).toBe(true)
    expect(failing([row(1, 59.4, 1), row(2, 60, 1), row(3, 20, 1)])).toBe(2)
  })
  it('pct never rounds a small real share to zero and follows the language', () => {
    expect(pct(0.003, 'es')).toBe('0.3 %')
    expect(pct(0.35, 'en')).toBe('35%')
    expect(pct(null, 'es')).toBe('—')
    expect(pct(0, 'es')).toBe('0 %')
  })
  it('widestPart names the largest share and skips missing ones', () => {
    expect(widestPart(row(1, 50, 1, 0.8, 0.1, 0.4))).toBe('da')
    expect(widestPart(row(1, 50, 1, null, 0.6, 0.4))).toBe('top')
    expect(widestPart(row(1, 50, 1, null, null, null))).toBeNull()
  })
  it('the risk part is the alto level through the one ladder', () => {
    expect(HR_LEVEL).toBe('high')
  })
})

describe('gradeTen', () => {
  it('prints the es-MX decimal point in Spanish and rounds the 0–100 score first', async () => {
    const { gradeTen } = await import('./anatomy')
    expect(gradeTen(30.9, 'es')).toBe('3.1 de 10')
    expect(gradeTen(30.9, 'en')).toBe('3.1 out of 10')
    expect(gradeTen(null, 'es')).toBe('—')
  })
})

describe('hrLevel', () => {
  it('reads the share of alto/crítico pesos on the stated 0.9 / 0.6 rule', async () => {
    const { hrLevel } = await import('./anatomy')
    expect(hrLevel(0.91)).toBe('critical')
    expect(hrLevel(0.9)).toBe('critical')
    expect(hrLevel(0.89)).toBe('high')
    expect(hrLevel(0.6)).toBe('high')
    expect(hrLevel(0.4)).toBe('medium')
    expect(hrLevel(null)).toBeNull()
  })
})
