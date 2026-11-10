import { act, renderHook } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import type { ReactNode } from 'react'
import { ToastProvider } from '../toast'
import { useToast } from '../toastContext'

// archive § G1: a new useToast() object per render made `useEffect(…, [toast])`
// re-fire after every toast it raised → React #185 (max update depth).
describe('useToast', () => {
  it('keeps the same identity across renders, including after a toast', () => {
    const wrapper = ({ children }: { children: ReactNode }) => <ToastProvider>{children}</ToastProvider>
    const { result, rerender } = renderHook(() => useToast(), { wrapper })
    const first = result.current
    rerender()
    expect(result.current).toBe(first)
    act(() => first.error('x'))
    expect(result.current).toBe(first)
  })
})
