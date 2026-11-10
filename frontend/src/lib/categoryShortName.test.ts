import { describe, expect, it } from 'vitest'
import { CATEGORY_SHORT, CATEGORY_SHORT_MAX, categoryShortName } from './categoryShortName'

// the 72 active categories: categories.is_active = 1 (ids 20–93; 35 and 36 do not exist)
const ACTIVE = Array.from({ length: 74 }, (_, i) => i + 20).filter((id) => id !== 35 && id !== 36)

describe('categoryShortName', () => {
  it('covers all 72 active categories, and only them', () => {
    expect(ACTIVE).toHaveLength(72)
    expect(Object.keys(CATEGORY_SHORT).map(Number).sort((a, b) => a - b)).toEqual(ACTIVE)
  })
  it('keeps every label, both languages, within the limit and non-empty', () => {
    for (const { es, en } of Object.values(CATEGORY_SHORT)) {
      for (const s of [es, en]) {
        expect(s.trim().length).toBeGreaterThan(0)
        expect(s.length).toBeLessThanOrEqual(CATEGORY_SHORT_MAX)
      }
    }
  })
  it('falls back to the full name for an unknown id', () => {
    expect(categoryShortName(20, 'Medicamentos y Farmacéuticos', 'es')).toBe('Medicamentos')
    expect(categoryShortName(20, 'Medications & Pharma', 'en')).toBe('Medicines')
    expect(categoryShortName(999, 'Nueva categoría', 'es')).toBe('Nueva categoría')
  })
})
