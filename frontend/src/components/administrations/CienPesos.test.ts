import { describe, expect, it } from 'vitest'
import type { SectorYearItem } from '@/api/types'
import { cienPesos } from './CienPesos'

const r = (year: number, sector_id: number, total_value: number, contracts = 1) =>
  ({ year, sector_id, total_value, contracts }) as SectorYearItem

describe('cienPesos', () => {
  const { terms, n2004, nEarly } = cienPesos([
    r(2001, 1, 999, 20), // before the register: out
    r(2004, 1, 0.42, 7), // health 2004 → 1 peso of 2024
    r(2005, 4, 2), // energy: out of the hundred, counted in its own share
    r(2005, 3, 0.58),
    r(2025, 1, 51.9), r(2025, 3, 48.1), // INPC 2025 = 1.038
    r(2027, 1, 10), // no INPC yet → nominal
  ])
  const fox = terms.find((t) => t.key === 'fox')!
  const shb = terms.find((t) => t.key === 'sheinbaum')!

  it('takes health over money without energy, energy over the raw register', () => {
    expect(fox.share).toBeCloseTo(0.42)
    expect(fox.energy).toBeCloseTo(2 / 3)
    expect(fox.y0).toBe(2002)
  })
  it('deflates with INPC where it exists and flags nominal years', () => {
    expect(fox.health).toBeCloseTo(1)
    expect(fox.nominal).toBe(false)
    expect(shb.health).toBeCloseTo(51.9 / 1.038 + 10)
    expect(shb.nominal).toBe(true)
    expect(shb.share).toBeCloseTo(61.9 / 110)
  })
  it('counts the sparse 2004 and the pre-2002 rows for the note', () => {
    expect(n2004).toBe(7)
    expect(nEarly).toBe(20)
  })
})
