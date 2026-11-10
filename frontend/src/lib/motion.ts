/**
 * RUBLI motion tokens — the ONE place a duration, easing or stagger is a number.
 * docs/FRONTEND_WEEKEND_2026-10-03.md § Track B.
 *
 * Every framer-motion `transition`, every WAAPI/CSS-in-JS timing and every
 * CSS keyframe stagger reads from here (CSS mirrors live in index.css as
 * `--dur-*` / `--ease-*`; keep the two in sync). Values follow the
 * ui-ux-pro-max "subtle" tier for informational UI: 250–350 ms base,
 * 0.02–0.04 s per-row stagger, no overshoot (back-out) on data surfaces.
 *
 * Reduced motion is handled once, by `<MotionConfig reducedMotion="user">` in
 * components/MotionScope.tsx (loaded per route by SuspenseBoundary), plus the `prefers-reduced-motion` block in index.css for CSS.
 */
import type { Transition, Variants } from 'framer-motion'

/** Durations in seconds (framer-motion's unit). */
export const DUR = {
  /** 120 ms — hover/press feedback, tooltips. */
  instant: 0.12,
  /** 200 ms — colour/transform feedback, exits, small popovers. */
  fast: 0.2,
  /** 320 ms — the default: page entrance, section reveal, drawers' content. */
  base: 0.32,
  /** 500 ms — chart draws, sheets/drawers, layout re-pivots. */
  slow: 0.5,
  /** 700 ms — story chapter reveals, hero pull-stats. */
  story: 0.7,
} as const

type Bezier = readonly [number, number, number, number]

/** Cubic-bezier easings (framer-motion arrays). */
export const EASE = {
  /** Default for everything that enters or changes. */
  standard: [0.2, 0, 0, 1] as Bezier,
  /** Decelerate harder — draws, large travel, story reveals. */
  emphasized: [0.3, 0, 0, 1] as Bezier,
  /** Accelerate out — exits only. */
  exit: [0.4, 0, 1, 1] as Bezier,
} as const

/** Per-item delays in seconds. */
export const STAGGER = {
  /** Dense marks inside one chart (dot cells, treemap tiles). */
  cell: 0.004,
  /** Table/register rows, list items, bars. */
  row: 0.03,
  /** Page sections, header cascade bands. */
  section: 0.08,
} as const

/** Rows beyond this index reveal together with the last staggered one. */
export const STAGGER_CAP = 12

/** Delay for item `i`: `base + min(i, cap) * step`. */
export function stagger(i: number, step: number = STAGGER.row, base = 0, cap = STAGGER_CAP): number {
  return base + Math.min(i, cap) * step
}

/** Seconds → milliseconds, for WAAPI / setTimeout / d3 timings. */
export const ms = (seconds: number): number => Math.round(seconds * 1000)

/** Bezier array → CSS `cubic-bezier()` string, for inline `transition:` styles. */
export const cssEase = (e: Bezier): string => `cubic-bezier(${e.join(', ')})`

/** Inline CSS transition string: `css('opacity', DUR.fast)`; several props comma-joined. */
export function css(props: string | string[], dur: number = DUR.fast, ease: Bezier = EASE.standard, delay = 0): string {
  const list = Array.isArray(props) ? props : [props]
  const d = delay ? ` ${ms(delay)}ms` : ''
  return list.map((p) => `${p} ${ms(dur)}ms ${cssEase(ease)}${d}`).join(', ')
}

/** Shorthand transition objects. */
export const T = {
  instant: { duration: DUR.instant, ease: EASE.standard },
  fast: { duration: DUR.fast, ease: EASE.standard },
  base: { duration: DUR.base, ease: EASE.standard },
  slow: { duration: DUR.slow, ease: EASE.emphasized },
  story: { duration: DUR.story, ease: EASE.emphasized },
  exit: { duration: DUR.fast, ease: EASE.exit },
  /** No animation — e.g. a deliberate cut. */
  none: { duration: 0 },
} as const satisfies Record<string, Transition>

/** Layout re-pivots (sort toggles, filters): "data was re-asked a different question". */
export const layoutTransition: Transition = T.slow

// ─── Variants (keys: initial / animate / exit — the codebase convention) ────

export const fade: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: T.base },
  exit: { opacity: 0, transition: T.exit },
}

/** Opacity + 8 px rise. Transform only — never shifts layout. */
export const fadeUp: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: T.base },
  exit: { opacity: 0, transition: T.exit },
}

export const scaleIn: Variants = {
  initial: { opacity: 0, scale: 0.96 },
  animate: { opacity: 1, scale: 1, transition: T.base },
  exit: { opacity: 0, scale: 0.98, transition: T.exit },
}

/** SVG path draw-on (`pathLength`). */
export const drawLine: Variants = {
  initial: { pathLength: 0, opacity: 0 },
  animate: { pathLength: 1, opacity: 1, transition: { pathLength: T.slow, opacity: T.fast } },
}

/** Story chapter reveal — same shape as fadeUp, at story pace. */
export const storyReveal: Variants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: T.story },
}

/** Pull-stat arrival (the number itself counts via its own hook, once). */
export const countUp: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: T.story },
}

/** Parent that staggers fadeUp/fade children by section. */
export const staggerContainer: Variants = {
  initial: {},
  animate: { transition: { staggerChildren: STAGGER.section, delayChildren: STAGGER.section } },
}

/**
 * Register/list row reveal with the house cap: pass the row index as
 * `custom={i}`; rows past STAGGER_CAP (12) arrive with the 12th, the rest
 * of a long list never waits. Use instead of staggerChildren on lists of
 * unknown length.
 */
export const rowReveal: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: (i: number = 0) => ({ opacity: 1, y: 0, transition: { ...T.base, delay: stagger(i) } }),
}

/** Parent that staggers row children (lists, registers). */
export const staggerRows: Variants = {
  initial: {},
  animate: { transition: { staggerChildren: STAGGER.row } },
}

/** Route-change entrance in MainLayout. */
export const pageVariants: Variants = fadeUp

/** Card hover lift — spread onto a motion element. */
export const hoverLift = {
  whileHover: { y: -2, transition: T.fast },
  whileTap: { scale: 0.98, transition: T.instant },
} as const
