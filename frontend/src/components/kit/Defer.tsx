/**
 * Defer — mount below-fold work only when it is near the viewport (600px ahead) or the main thread
 * is idle, whichever comes first (docs/PORTADA_PERF_2026-10-28.md fix 1). Children mount — and their
 * queries fire — after the first screen's work, not in competition with it. The placeholder keeps a
 * reserved height so nothing jumps when the block arrives. Pair with React.lazy so the code leaves
 * the page chunk too.
 */
import { Suspense, useEffect, useRef, useState, type ReactNode } from 'react'

type IdleWindow = Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (h: number) => void }

export function Defer({ children, minHeight, idleTimeout = 4000 }: { children: ReactNode; minHeight: number; idleTimeout?: number }) {
  const [on, setOn] = useState(false)
  const hold = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (on) return
    const el = hold.current
    const go = () => setOn(true)
    const io = el && 'IntersectionObserver' in window
      ? new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) go() }, { rootMargin: '600px 0px' })
      : null
    if (io && el) io.observe(el)
    const w = window as IdleWindow
    const idle = w.requestIdleCallback ? w.requestIdleCallback(go, { timeout: idleTimeout }) : window.setTimeout(go, 1500)
    return () => {
      io?.disconnect()
      if (w.cancelIdleCallback) w.cancelIdleCallback(idle)
      else window.clearTimeout(idle)
    }
  }, [on, idleTimeout])

  const placeholder = <div ref={hold} style={{ minHeight }} aria-hidden="true" />
  return on ? <Suspense fallback={<div style={{ minHeight }} aria-hidden="true" />}>{children}</Suspense> : placeholder
}
