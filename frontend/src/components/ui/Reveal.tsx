// Reveal-once components built on the hooks in @/hooks/useAnimations.
import { DUR, EASE, STAGGER, cssEase, ms, stagger } from '@/lib/motion'
import { useCountUp, useReveal } from '@/hooks/useAnimations'

// ScrollReveal — story chapter / section reveal (Track B: DUR.story, 12 px rise,
// opacity + transform only so it never shifts layout; reveals once).
export function ScrollReveal({ children, delay = 0, direction = 'up', className, staggerIndex }: {
  children: React.ReactNode
  /** Extra delay in ms. Prefer `staggerIndex` for lists. */
  delay?: number
  direction?: 'up' | 'left' | 'right' | 'fade'
  className?: string
  /** Position in a list — staggered by STAGGER.section, capped at 12. */
  staggerIndex?: number
}) {
  const { ref, visible } = useReveal()
  const computedDelay = staggerIndex !== undefined ? ms(stagger(staggerIndex, STAGGER.section)) : delay
  const transforms: Record<string, string> = {
    up: 'translateY(12px)',
    left: 'translateX(-12px)',
    right: 'translateX(12px)',
    fade: 'none',
  }
  return (
    <div
      ref={ref}
      className={className}
      style={{
        transitionProperty: 'opacity, transform',
        transitionDuration: `${ms(DUR.story)}ms`,
        transitionDelay: `${computedDelay}ms`,
        transitionTimingFunction: cssEase(EASE.emphasized),
        opacity: visible ? 1 : 0,
        transform: visible ? 'none' : transforms[direction],
      }}
    >
      {children}
    </div>
  )
}

// AnimatedNumber — standalone scroll-triggered counter component
export function AnimatedNumber({ value, duration = ms(DUR.story), decimals = 0, prefix = '', suffix = '', className }: {
  value: number
  duration?: number
  decimals?: number
  prefix?: string
  suffix?: string
  className?: string
}) {
  const { ref, value: animatedValue } = useCountUp(value, duration, decimals)
  return (
    <span ref={ref} className={className}>
      {prefix}{animatedValue.toLocaleString()}{suffix}
    </span>
  )
}

// AnimatedFill — slim progress bar that fills once on reveal (Track B: no
// overshoot past the true value; the delay lives in transition-delay only).
export function AnimatedFill({ pct, color, delay = 0 }: {
  pct: number
  color: string
  /** ms */
  delay?: number
  height?: string
}) {
  const { ref, visible } = useReveal(0.1)
  // Slim continuous progress bar. The dot-strip rewrite of this used:
  //   1. preserveAspectRatio="none" -> circles stretched to ovals
  //   2. fill='#2d2926' (forbidden dark-mode hex) -> black dots on cream
  //   3. Math.max(1, …) floor -> 1 dot for any sub-3% input, meaningless
  // For sub-percent stats like "0.7% officially detected" a continuous
  // bar reads the proportion against the empty track. Discrete dots only
  // make sense when the user can count to ~22 of 30; below that the
  // visual lies.
  const widthPct = visible ? Math.max(0, Math.min(100, pct)) : 0
  // Sub-pixel slivers disappear; ensure at least 0.5% renders so the
  // value is visible. Number itself remains accurate via the label.
  const visualPct = widthPct > 0 && widthPct < 0.5 ? 0.5 : widthPct
  return (
    <div ref={ref} className="flex-1 relative w-full overflow-hidden rounded-full bg-[var(--color-border)]" style={{ height: 6 }}>
      <div
        className="absolute inset-y-0 left-0 rounded-full"
        style={{
          width: `${visualPct}%`,
          backgroundColor: color,
          transition: `width ${ms(DUR.story)}ms ${cssEase(EASE.emphasized)} ${delay}ms`,
        }}
      />
    </div>
  )
}
