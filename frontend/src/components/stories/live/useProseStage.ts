// Split out of StickyStepFigure.tsx so that file exports only components (react-refresh/only-export-components).
import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * useProseStage — drive a figure's beat from which paragraph the reader is on.
 *
 * The figure sticks at the top of the chapter and steps as each paragraph
 * crosses the middle 20% of the viewport. `-40% 0px -40%` is that band.
 *
 * `enabled` is false below `lg`, where the figure is not sticky and stepping a
 * drawing the reader has already scrolled past would be noise: the caller pins
 * the last beat instead.
 */
export function useProseStage(count: number, enabled: boolean, maxStage: number) {
  // `observed` is written only by the observer; the static cases (not sticky,
  // nothing to observe, no IntersectionObserver) derive the last beat in render.
  const [observed, setStage] = useState<number | null>(null)
  const live = enabled && count > 0 && typeof IntersectionObserver !== 'undefined'
  const stage = live ? (observed ?? 0) : maxStage
  const nodes = useRef<(HTMLElement | null)[]>([])

  const register = useCallback((el: HTMLElement | null, i: number) => {
    nodes.current[i] = el
  }, [])

  useEffect(() => {
    if (!live) return
    const els = nodes.current.slice(0, count).filter(Boolean) as HTMLElement[]
    if (!els.length) return
    const visible = new Set<number>()
    // Nothing in the band: either the chapter is still below the reader (beat
    // 0) or they have scrolled past it, in which case the drawing stays
    // finished rather than snapping back to blank.
    const settleOutOfBand = () => {
      if (visible.size) return
      const first = els[0].getBoundingClientRect()
      setStage(first.top > window.innerHeight * 0.6 ? 0 : maxStage)
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const i = els.indexOf(e.target as HTMLElement)
          if (i < 0) continue
          if (e.isIntersecting) visible.add(i)
          else visible.delete(i)
        }
        if (visible.size) setStage(Math.min(Math.max(...visible) + 1, maxStage))
        else settleOutOfBand()
      },
      { rootMargin: '-40% 0px -40% 0px' },
    )
    els.forEach((el) => io.observe(el))

    // A jump — a chapter-nav anchor, a restored scroll position, back-to-top —
    // can move the reader from past the chapter to above it without any
    // observed paragraph crossing the band, so the observer never fires and
    // the beat would stay stale. This settles it. While a paragraph IS in the
    // band, which is the whole time the chapter is being read, it costs one
    // Set lookup and reads no layout.
    let raf = 0
    const onScroll = () => {
      if (visible.size || raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        settleOutOfBand()
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      io.disconnect()
      window.removeEventListener('scroll', onScroll)
      if (raf) cancelAnimationFrame(raf)
      setStage(null)
    }
  }, [live, count, maxStage])

  return { stage, register }
}
