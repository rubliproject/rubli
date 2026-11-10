/**
 * The bold cut's motion vocabulary: punch-ins on impacts (no camera shake — owner, Oct 14), a whip-pan
 * transition with directional blur, light-leak overlays on three cuts, peso-coin discs and
 * big geometric punctuation (circles, wedges, rules).
 */
import { lightLeak } from '@remotion/effects/light-leak'
import { Pie } from '@remotion/shapes'
import type { TransitionPresentation, TransitionPresentationComponentProps } from '@remotion/transitions'
import type { CSSProperties } from 'react'
import { AbsoluteFill, Easing, interpolate, Solid, useCurrentFrame, useVideoConfig } from 'remotion'
import { C } from './data'
import { SERIF_F } from './kit'

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const

/** Punch-in: a quick scale bump on an impact (1 → peak → settle). */
export const punch = (f: number, at: number, peak = 1.08) =>
  interpolate(f, [at, at + 3, at + 16], [1, peak, 1], { ...clamp, easing: Easing.out(Easing.cubic) })

// ── whip-pan: the scene slides a full frame with a directional blur peaking mid-move ─────────
type WhipProps = { direction: 'left' | 'right' | 'up' }
const WhipPresentation: React.FC<TransitionPresentationComponentProps<WhipProps>> = ({
  children,
  presentationDirection,
  presentationProgress: p,
  passedProps: { direction },
}) => {
  const sign = direction === 'left' ? -1 : 1
  const off = presentationDirection === 'entering' ? (1 - p) * sign * 100 : -p * sign * 100
  const blur = Math.sin(Math.PI * p) * 18
  const style: CSSProperties =
    direction === 'up'
      ? { translate: `0px ${presentationDirection === 'entering' ? (1 - p) * 100 : -p * 100}%`, filter: `blur(${blur}px)` }
      : { translate: `${off}% 0px`, filter: `blur(${blur}px)` }
  return <AbsoluteFill style={style}>{children}</AbsoluteFill>
}
export const whip = (direction: WhipProps['direction'] = 'right'): TransitionPresentation<WhipProps> => ({
  component: WhipPresentation,
  props: { direction },
})

/** light-leaks.md: a warm leak over a cut (WebGL2 via @remotion/effects). */
export const LeakOverlay: React.FC<{ seed: number }> = ({ seed }) => {
  const f = useCurrentFrame()
  const { durationInFrames, width, height } = useVideoConfig()
  return (
    <Solid
      width={width}
      height={height}
      style={{ mixBlendMode: 'multiply' }}
      effects={[lightLeak({ seed, hueShift: 330, progress: interpolate(f, [0, durationInFrames - 1], [0, 1], clamp) })]}
    />
  )
}

/** A peso coin, value side only (TEMPLATE § 4): gold-tone face, ink rim, "$". */
export function Coin({ r = 22, style }: { r?: number; style?: CSSProperties }) {
  return (
    <svg width={r * 2} height={r * 2} viewBox="-50 -50 100 100" style={style}>
      <circle r={47} fill={C.coin} stroke={C.ink} strokeWidth={5} />
      <circle r={36} fill="none" stroke={C.coinDeep} strokeWidth={4} />
      <text y={17} textAnchor="middle" fontFamily={SERIF_F} fontWeight={800} fontSize={50} fill={C.ink}>
        $
      </text>
    </svg>
  )
}

/** A rotating wedge (Pie from @remotion/shapes) — graphic punctuation behind a figure. */
export function Wedge({ r, progress, rotation = 0, color = C.saludWash, style }: { r: number; progress: number; rotation?: number; color?: string; style?: CSSProperties }) {
  return <Pie radius={r} progress={Math.max(0.0001, progress)} rotation={rotation} fill={color} style={style} />
}
