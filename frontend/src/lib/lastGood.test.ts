import { describe, expect, it } from 'vitest'
import { renderHook } from '@testing-library/react'
import { readLastGood, useLastGood } from './lastGood'

describe('useLastGood', () => {
  it('serves fresh data as fresh, then the stored copy with its save date', () => {
    localStorage.clear()
    const first = renderHook(() => useLastGood('k', { n: 1 }))
    expect(first.result.current).toEqual({ data: { n: 1 }, savedAt: null })
    const loading = renderHook(() => useLastGood<{ n: number }>('k', undefined))
    expect(loading.result.current).toEqual({ data: { n: 1 }, savedAt: null })  // in flight: no note
    const failed = renderHook(() => useLastGood<{ n: number }>('k', undefined, true))
    expect(failed.result.current.data).toEqual({ n: 1 })
    expect(failed.result.current.savedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
  it('drops copies older than 14 days and returns nothing when empty', () => {
    localStorage.clear()
    renderHook(() => useLastGood('old', { n: 2 }))
    expect(readLastGood('old', Date.now() + 15 * 24 * 3600 * 1000)).toBeUndefined()
    expect(renderHook(() => useLastGood('none', null)).result.current).toEqual({ data: undefined, savedAt: null })
  })
})
