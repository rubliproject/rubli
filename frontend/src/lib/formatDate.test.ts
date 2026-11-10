import { describe, expect, it } from 'vitest'
import { formatDate } from './utils'
import { fdate } from '@/components/newtabs/ntShared'

// Mexico is west of UTC: a date-only string read as UTC midnight would print the day before.
process.env.TZ = 'America/Mexico_City'

describe('date-only values are calendar dates, not UTC instants', () => {
  it('formatDate keeps the recorded day', () => {
    expect(formatDate('2023-09-18')).toMatch(/18/)
    expect(formatDate('2023-01-01')).toMatch(/2023/)   // not 31 Dec 2022
    expect(formatDate('2023-01-01')).not.toMatch(/31/)
  })
  it('formatDate still formats timestamps and Date objects', () => {
    expect(formatDate(new Date(2024, 4, 7))).toMatch(/7/)
    expect(formatDate('2024-05-07T12:00:00')).toMatch(/7/)
  })
  it('ntShared fdate reads the string parts (no Date parsing)', () => {
    expect(fdate('2026-01-01', 'es')).toMatch(/^1 /)
    expect(fdate('2026-01-01', 'en')).toMatch(/ 1, 2026$/)
    expect(fdate(null, 'es')).toBe('—')
  })
})
