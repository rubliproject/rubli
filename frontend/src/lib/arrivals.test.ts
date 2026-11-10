import { describe, expect, it } from 'vitest'
import { newestDate, newSince } from './arrivals'

type R = { id: number | null; date: string | null }
const rows: R[] = [
  { id: 1, date: '2026-10-28' },
  { id: 2, date: '2026-10-21' },
  { id: 3, date: '2026-10-22' },
  { id: null, date: '2026-10-28' },
  { id: 5, date: null },
]
const k = (r: R) => r.id
const d = (r: R) => r.date

describe('newSince', () => {
  it('a first visit (no stamp) marks nothing new', () => { expect(newSince(rows, k, d, null)).toEqual([]) })
  it('marks only rows dated after the last visit', () => { expect(newSince(rows, k, d, '2026-10-21')).toEqual(['1', '3']) })
  it('a row dated on the stamp day is not new', () => { expect(newSince(rows, k, d, '2026-10-28')).toEqual([]) })
  it('skips rows without a key or a date', () => { expect(newSince(rows, k, d, '2000-01-01')).toEqual(['1', '2', '3']) })
})

describe('newestDate', () => {
  it('is the newest date', () => { expect(newestDate(rows, d)).toBe('2026-10-28') })
  it('is null without dates', () => { expect(newestDate([{ id: 1, date: null }], d)).toBeNull() })
})
