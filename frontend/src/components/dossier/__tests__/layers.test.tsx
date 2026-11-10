import { describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { MemoryRouter, useSearchParams } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useLayer } from '../layers'

const wrap = (url: string) => ({ children }: { children: ReactNode }) => <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>

describe('useLayer (?sec=&row=)', () => {
  it('opens, closes and keeps the other params', () => {
    const { result } = renderHook(() => ({ l: useLayer(), p: useSearchParams()[0] }), { wrapper: wrap('/vendors/1?page=3') })
    act(() => result.current.l.toggle('compradores', 251))
    expect(result.current.l.isOpen('compradores', 251)).toBe(true)
    expect(result.current.p.get('page')).toBe('3')
    act(() => result.current.l.toggle('compradores', 251))
    expect(result.current.l.isOpen('compradores', 251)).toBe(false)
    expect(result.current.p.get('row')).toBeNull()
  })

  it('Citar points the URL at a section and keeps its opened row only', () => {
    const { result } = renderHook(() => ({ l: useLayer(), p: useSearchParams()[0] }), { wrapper: wrap('/sectors/1?sec=vendors&row=9') })
    act(() => result.current.l.point('vendors'))
    expect(result.current.p.get('row')).toBe('9')
    act(() => result.current.l.point('contracts'))
    expect(result.current.p.get('sec')).toBe('contracts')
    expect(result.current.p.get('row')).toBeNull()
  })
})
