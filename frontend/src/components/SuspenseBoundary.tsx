import { lazy, Suspense, type ReactNode } from 'react'
import { ErrorBoundary } from './ErrorBoundary'
import { PageSkeleton } from './LoadingSkeleton'

// framer-motion's config (MotionScope.tsx). Its import starts when this module evaluates, with the
// shell: a lazy() alone only fetched it at the first render, and nothing under it (the route chunk
// included) could start until it resolved: a ~0.8 s serial hop on a throttled phone (YELLOW 11-04).
const motionScope = import('./MotionScope')
const MotionScope = lazy(() => motionScope)

interface SuspenseBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
  errorFallback?: ReactNode
  onReset?: () => void
}

/**
 * Combined ErrorBoundary + Suspense wrapper for lazy-loaded components.
 * Provides a consistent error handling and loading experience.
 */
export function SuspenseBoundary({
  children,
  fallback = <PageSkeleton />,
  errorFallback,
  onReset,
}: SuspenseBoundaryProps) {
  return (
    <ErrorBoundary fallback={errorFallback} onReset={onReset}>
      <Suspense fallback={fallback}><MotionScope>{children}</MotionScope></Suspense>
    </ErrorBoundary>
  )
}

export default SuspenseBoundary
