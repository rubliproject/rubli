import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { IntroOverlay, shouldPlayIntro } from './IntroOverlay'

const motion = (reduce: boolean) =>
  vi.spyOn(window, 'matchMedia').mockImplementation((q: string) => ({ matches: reduce && q.includes('reduce'), media: q } as MediaQueryList))

const mount = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { enabled: false } } })}>
    <IntroOverlay />
  </QueryClientProvider>,
)

afterEach(() => { vi.restoreAllMocks(); sessionStorage.clear() })

describe('intro gate', () => {
  it('plays on the first visit of a session, then never again', () => {
    motion(false)
    expect(shouldPlayIntro()).toBe(true)
    const { container, unmount } = mount()
    expect(container.querySelector('.ct-intro')).not.toBeNull()
    unmount()
    expect(shouldPlayIntro()).toBe(false)
    expect(mount().container.querySelector('.ct-intro')).toBeNull()
  })

  it('never plays under prefers-reduced-motion', () => {
    motion(true)
    expect(shouldPlayIntro()).toBe(false)
    expect(mount().container.querySelector('.ct-intro')).toBeNull()
  })

  it('types no count it does not have, and is gone at 2 s', () => {
    motion(false)
    vi.useFakeTimers()
    const { container } = mount()
    act(() => { vi.advanceTimersByTime(1100) })
    const line = container.querySelector('.ct-intro-line')?.textContent ?? ''
    expect(line).toMatch(/^2002–\d{4}$/)
    expect(line).not.toMatch(/contratos|contracts/)
    act(() => { vi.advanceTimersByTime(900) })
    expect(container.querySelector('.ct-intro')).toBeNull()
    vi.useRealTimers()
  })

  it('does not play when sessionStorage throws', () => {
    motion(false)
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    expect(shouldPlayIntro()).toBe(false)
  })
})
