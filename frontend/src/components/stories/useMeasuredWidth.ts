// Split out of InlineCharts.tsx so that file exports only components (react-refresh/only-export-components).
import { useRef } from 'react'
import { useMeasuredWidth as useMeasuredRef } from '@/hooks/useMeasuredWidth'

export function useMeasuredWidth<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T | null>(null)
  // One ResizeObserver implementation for the whole app (hooks/useMeasuredWidth).
  // This wrapper keeps the { ref, width } shape its six callers expect, and the
  // 360px phone-width fallback they render against before the first measurement.
  const measured = useMeasuredRef(ref)
  return { ref, width: measured || 360 } as const
}
