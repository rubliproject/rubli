import { useCallback, useSyncExternalStore } from 'react'

/**
 * useMediaQuery — live `matchMedia(query).matches`.
 *
 * matchMedia is an external system, so it is read through useSyncExternalStore:
 * the first render already has the right value (no desktop→mobile flash) and
 * there is no effect that copies it into state. `false` where matchMedia is absent.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => {}
      const mq = window.matchMedia(query)
      mq.addEventListener?.('change', onChange)
      return () => mq.removeEventListener?.('change', onChange)
    },
    [query],
  )
  const get = () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(query).matches
  return useSyncExternalStore(subscribe, get, () => false)
}

/**
 * useIsMobile — true when the viewport is at or below a phone-width breakpoint.
 *
 * The default 767px matches the `md:hidden` boundary used by MobileBottomNav, so
 * the mobile-native layouts (compact register cards, etc.) switch in lockstep
 * with the bottom navigation bar — one mental model for "what is mobile".
 */
export function useIsMobile(maxWidth = 767): boolean {
  return useMediaQuery(`(max-width: ${maxWidth}px)`)
}
