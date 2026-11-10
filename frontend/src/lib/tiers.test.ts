import { describe, expect, it } from 'vitest'
import { formatGrade, gradeBandFromLetter, gradeOutOf10, gradeWord } from './tiers'

describe('Mexican grade scale', () => {
  it('divides by ten with one decimal', () => {
    expect(gradeOutOf10(32)).toBe('3.2')
    expect(gradeOutOf10(null)).toBe('—')
  })
  it('passes from 6.0, on the rounded number', () => {
    expect(gradeWord(59.4, 'es')).toBe('reprobada')
    expect(gradeWord(59.6, 'es')).toBe('aprobada')
    expect(formatGrade(59.6, 'en')).toBe('6.0 · passed')
    expect(formatGrade(32, 'es')).toBe('3.2 · reprobada')
  })
  it('maps letter-only data to its band', () => {
    expect(gradeBandFromLetter('A', 'es')).toBe('7.6 o más · aprobada')
    expect(gradeBandFromLetter('C+', 'en')).toBe('4.4–5.9 · failed')
    expect(gradeBandFromLetter('F-', 'es')).toBe('menos de 2.8 · reprobada')
  })
})

import { dataQualityLevel, dataQualityWord } from './tiers'
describe('data-quality words', () => {
  it('maps letters to alta / media / baja', () => {
    expect(['A', 'B', 'C', 'D', 'F'].map((g) => dataQualityLevel(g, 'es'))).toEqual(['alta', 'alta', 'media', 'baja', 'baja'])
    expect(dataQualityWord('C', 'en')).toBe('medium data quality')
    expect(dataQualityWord('B', 'es')).toBe('calidad alta')
  })
})
