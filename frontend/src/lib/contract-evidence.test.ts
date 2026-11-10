import { describe, expect, it } from 'vitest'
import { recordedValue } from './contract-format'

describe('recordedValue', () => {
  it('keeps the recorded text verbatim (trimmed)', () => {
    expect(recordedValue('ART. 41 FR. V')).toBe('ART. 41 FR. V')
    expect(recordedValue('  NO ')).toBe('NO')
  })
  it('returns null for an empty record, so the page prints «sin dato»', () => {
    expect(recordedValue(null)).toBeNull()
    expect(recordedValue(undefined)).toBeNull()
    expect(recordedValue('   ')).toBeNull()
  })
})
