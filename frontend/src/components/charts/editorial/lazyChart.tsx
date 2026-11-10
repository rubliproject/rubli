/**
 * PERF launch § 4: the recharts-backed primitives load on demand, so the
 * `vendor-recharts` chunk (≈ 360 KB) never sits on a page's first-load path.
 * The fallback is an empty box of the chart's own height and full width — the
 * same footprint the ResponsiveContainer takes — so nothing shifts on arrival.
 */
import { lazy, Suspense, type ComponentType } from 'react'

type Sized = { height?: number }

/** `C` keeps the wrapped chart's own (generic) prop types for callers. */
export function lazyChart<C>(load: () => Promise<C>, defaultHeight: number): C {
  const Chart = lazy(() => load().then((c) => ({ default: c as unknown as ComponentType<Sized> })))
  const Lazy = (props: Sized) => (
    <Suspense fallback={<div aria-hidden="true" style={{ width: '100%', height: props.height ?? defaultHeight }} />}>
      <Chart {...props} />
    </Suspense>
  )
  return Lazy as unknown as C
}
