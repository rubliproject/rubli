import { useRef, useEffect, useState, useMemo } from 'react'
import { DUR, STAGGER, ms } from '@/lib/motion'

/** rAF/setTimeout animations are outside MotionConfig and the CSS media query. */
const prefersReducedMotion = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// Scroll reveal hook — THE reveal-once primitive (IntersectionObserver, disconnects on first hit)
export function useReveal(threshold = 0.05) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) { setVisible(true); observer.disconnect() }
      },
      { threshold, rootMargin: '0px 0px -40px 0px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [threshold])
  return { ref, visible }
}

// Count-up hook — counts a number up ONCE when it first enters view.
// Track B: ease-out (no overshoot: a number must never display a value it
// does not have); later target changes (refetch, filter) snap to the new
// value instead of re-animating; reduced motion shows the value at once.
export function useCountUp(target: number, duration = ms(DUR.story), decimals = 0) {
  const ref = useRef<HTMLSpanElement>(null)
  const [value, setValue] = useState(0)
  const startedRef = useRef(false)
  const inViewRef = useRef(false)

  useEffect(() => {
    // Target 0 = data not loaded: skip (no 0→0 animation) and re-arm, so the
    // next real value counts up as an entrance rather than snapping.
    if (target === 0) {
      startedRef.current = false
      return
    }
    const el = ref.current
    if (!el) return

    function runAnimation() {
      if (startedRef.current) {
        // Already counted once — a new target is a data change, not an entrance.
        setValue(target)
        return
      }
      startedRef.current = true
      if (prefersReducedMotion()) {
        setValue(target)
        return
      }
      let startTime: number
      let frame: number
      const animate = (ts: number) => {
        if (!startTime) startTime = ts
        const progress = Math.min((ts - startTime) / duration, 1)
        const eased = 1 - Math.pow(1 - progress, 3) // ease-out cubic
        setValue(parseFloat((target * eased).toFixed(decimals)))
        if (progress < 1) frame = requestAnimationFrame(animate)
        else setValue(target)
      }
      frame = requestAnimationFrame(animate)
      return () => cancelAnimationFrame(frame)
    }

    // If the element is already in view (e.g. data loaded after mount while
    // element was visible), run immediately instead of waiting for observer.
    if (inViewRef.current) {
      return runAnimation()
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        inViewRef.current = entry.isIntersecting
        if (entry.isIntersecting) {
          runAnimation()
          observer.disconnect()
        }
      },
      { threshold: 0.3 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [target, duration, decimals])
  return { ref, value }
}

// Stagger delay utility — returns an array of delays (ms) for N items
export function useStagger(count: number, baseDelay = 0, step = ms(STAGGER.section)) {
  return useMemo(
    () => Array.from({ length: count }, (_, i) => baseDelay + i * step),
    [count, baseDelay, step]
  )
}
