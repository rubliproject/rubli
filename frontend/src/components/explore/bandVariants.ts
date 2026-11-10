// Split out of ZPrimitives.tsx so that file exports only components (react-refresh/only-export-components).
import type { Variants } from 'framer-motion'
import { T } from '@/lib/motion'
import { Z_BAND_S, Z_CASCADE_STEP_S, Z_EASE } from './ZPrimitives'

/**
 * Returns the canonical band variants: opacity + 8px lift (or opacity-only
 * under reduced-motion). Each band caller passes `custom={index}` where
 * index 0 = first band, index 1 = second, etc. Cascade step is
 * Z_CASCADE_STEP_S between consecutive bands.
 */
export function useBandVariants(prefersReducedMotion: boolean): Variants {
  return {
    hidden: prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 8 },
    visible: (custom: number) => ({
      opacity: 1,
      y: 0,
      transition: prefersReducedMotion
        ? T.none
        : { duration: Z_BAND_S, delay: custom * Z_CASCADE_STEP_S, ease: Z_EASE },
    }),
  }
}
