/**
 * MotionScope — the house framer-motion config (reducedMotion="user" + T.base), loaded with the page it
 * wraps instead of on every first paint (launch audit 2026-10-28 S1). SuspenseBoundary lazy-loads it next
 * to each route chunk, so nothing under it renders before the config: no remount, same behaviour as the
 * old root MotionConfig. Every framer-motion module sits under a route boundary (no eager importer).
 */
import type { ReactNode } from 'react'
import { MotionConfig } from 'framer-motion'
import { T } from '@/lib/motion'

export default function MotionScope({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user" transition={T.base}>{children}</MotionConfig>
}
