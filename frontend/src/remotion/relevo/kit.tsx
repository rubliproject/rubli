/**
 * Shared pieces for «El Relevo»: fonts, the paper ground with its ambient life
 * (TEMPLATE § 3.1), name plates fitted with @remotion/layout-utils (owner: names are
 * never truncated), the IMSS seal, number landings and mono labels.
 */
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { loadFont } from '@remotion/fonts'
import { measureText } from '@remotion/layout-utils'
import { AbsoluteFill, Easing, interpolate, random, staticFile, useCurrentFrame, useVideoConfig } from 'remotion'
import { C, CO_COLOR, NAMES, ORDER, type Co } from './data'

// local-fonts.md — the site's own OFL woff2 files (variable weight), under film-only family
// names so measurement never picks up a fallback face.
export const SERIF_F = 'RelevoSerif'
export const MONO_F = 'RelevoMono'
const fontsReady = Promise.all([
  loadFont({ family: SERIF_F, url: staticFile('fonts/playfair-display-latin.woff2'), weight: '400 900' }),
  loadFont({ family: MONO_F, url: staticFile('fonts/jetbrains-mono-latin.woff2'), weight: '100 800' }),
])
/** measuring-text.md: measure only after the fonts are in. */
export function useFonts() {
  const [ok, setOk] = useState(false)
  useEffect(() => {
    let live = true
    fontsReady.then(() => live && setOk(true))
    return () => {
      live = false
    }
  }, [])
  return ok
}

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const
export const easeOut = Easing.bezier(0.16, 1, 0.3, 1)
export const easeBack = Easing.bezier(0.34, 1.56, 0.64, 1)
export const ease = (f: number, a: number, b: number, from: number, to: number, e = easeOut) =>
  interpolate(f, [a, b], [from, to], { ...clamp, easing: e })

/** Paper ground + light drift + grain + dust. Driven by the absolute frame so it never resets. */
export function Paper({ children, frameOffset = 0 }: { children?: ReactNode; frameOffset?: number }) {
  const f = useCurrentFrame() + frameOffset
  const { fps, width, height } = useVideoConfig()
  const t = f / fps
  const lx = 50 + 6 * Math.sin((2 * Math.PI * t) / 23)
  const ly = 38 + 6 * Math.sin((2 * Math.PI * t) / 31)
  return (
    <AbsoluteFill style={{ backgroundColor: C.bg, overflow: 'hidden' }}>
      <AbsoluteFill style={{ background: `radial-gradient(60% 70% at ${lx}% ${ly}%, ${C.light}, transparent 70%)` }} />
      <AbsoluteFill style={{ background: `radial-gradient(120% 90% at 50% 45%, transparent 60%, ${C.shade} 100%)` }} />
      {children}
      <svg width={width} height={height} style={{ position: 'absolute', inset: 0, mixBlendMode: 'multiply', opacity: 0.09, pointerEvents: 'none' }}>
        <filter id="relevo-grain" x="0" y="0">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed={3} />
          <feColorMatrix values="0 0 0 0 0.12  0 0 0 0 0.1  0 0 0 0 0.08  0 0 0 0.6 0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#relevo-grain)" />
      </svg>
      {Array.from({ length: 22 }, (_, i) => {
        const x = random(`dx${i}`) * width
        const y = (((random(`dy${i}`) * height - t * (4 + random(`dv${i}`) * 4) * 1.5) % height) + height) % height
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: x + 6 * Math.sin(t * 0.7 + i),
              top: y,
              width: 2 + random(`dr${i}`) * 2,
              height: 2 + random(`dr${i}`) * 2,
              borderRadius: 9,
              backgroundColor: C.paperHi,
              opacity: 0.5,
            }}
          />
        )
      })}
    </AbsoluteFill>
  )
}

/** Idle breathing (TEMPLATE § 3.1): nothing sits perfectly still. */
export const breathe = (f: number, fps: number, seed = 0, amp = 0.004) => 1 + amp * Math.sin((2 * Math.PI * f) / (5 * fps) + seed)

/**
 * Fit a CompraNet name into `width` (RELEVO § 4 T1): one line at the largest size ≤ cap;
 * if that would drop below `floor`, two word-balanced lines. Never an ellipsis, never a clip.
 * The legal suffix rides at the end of the last line in mono at 0.42× the name size.
 */
export function fitName(co: Co, width: number, cap: number, floor: number) {
  const { name, suffix } = NAMES[co]
  const wOf = (s: string, font: string, size: number, weight: number) =>
    measureText({ text: s, fontFamily: font, fontSize: size, fontWeight: String(weight), validateFontIsLoaded: true }).width
  const per = (line: string, last: boolean) =>
    (wOf(line, SERIF_F, 100, 700) + (last ? wOf(' ' + suffix, MONO_F, 42, 500) : 0)) / 100
  const one = Math.min(cap, (width * 0.98) / per(name, true))
  if (one >= floor) return { lines: [name], size: Math.floor(one) }
  const words = name.split(' ')
  let best = { lines: [name], size: one }
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' ')
    const b = words.slice(i).join(' ')
    const size = Math.min(cap, (width * 0.98) / Math.max(per(a, false), per(b, true)))
    if (size > best.size) best = { lines: [a, b], size }
  }
  return { lines: best.lines, size: Math.floor(best.size) }
}

const PLATE_PAD_Y = 14
const PLATE_PAD_X = 28

/** Vertical stack of the four plates (beats 2, 7, 9): explicit tops so bars can travel between rows. */
export function stackLayout(width: number, cap: number, top: number, gap: number, below = 0) {
  let y = top
  return ORDER.map((co) => {
    const fit = fitName(co, width - PLATE_PAD_X * 2, cap, 36)
    const h = fit.lines.length * fit.size * 1.12 + PLATE_PAD_Y * 2
    const row = { co, top: y, height: h, bottom: y + h }
    y += h + below + gap
    return row
  })
}

/** A company is its name (owner: no buildings): a paper strip with the full CompraNet name. */
export function NamePlate({
  co,
  width,
  cap = 84,
  floor = 36,
  dim = false,
  reveal = 1,
  style,
}: {
  co: Co
  width: number
  cap?: number
  floor?: number
  dim?: boolean
  reveal?: number
  style?: CSSProperties
}) {
  return (
    <div
      style={{
        width,
        padding: `${PLATE_PAD_Y}px ${PLATE_PAD_X}px`,
        backgroundColor: C.paperHi,
        outline: `2px solid ${dim ? C.rule : C.ink}`,
        borderLeft: `16px solid ${dim ? C.rule : CO_COLOR[co]}`,
        boxShadow: `0 10px 24px ${C.shade}`,
        clipPath: reveal >= 1 ? undefined : `inset(-40px ${(1 - reveal) * 100}% -40px -40px)`,
        opacity: reveal > 0 ? 1 : 0,
        ...style,
      }}
    >
      <NameText co={co} width={width - PLATE_PAD_X * 2} cap={cap} floor={floor} color={dim ? C.dim : C.ink} />
    </div>
  )
}

/** The fitted name alone (no plate) — for names typed on a document. */
export function NameText({ co, width, cap, floor = 36, color = C.ink, style }: { co: Co; width: number; cap: number; floor?: number; color?: string; style?: CSSProperties }) {
  const { lines, size } = fitName(co, width, cap, floor)
  return (
    <div style={style}>
      {lines.map((l, i) => (
        <div key={i} style={{ fontFamily: SERIF_F, fontWeight: 700, fontSize: size, lineHeight: 1.12, color, whiteSpace: 'nowrap' }}>
          {l}
          {i === lines.length - 1 && (
            <span style={{ fontFamily: MONO_F, fontWeight: 500, fontSize: size * 0.42, color: C.dim }}> {NAMES[co].suffix}</span>
          )}
        </div>
      ))}
    </div>
  )
}

/** Mono label (labels, dates, scopes). */
export function Mono({ children, size = 34, color = C.dim, style }: { children: ReactNode; size?: number; color?: string; style?: CSSProperties }) {
  return (
    <div style={{ fontFamily: MONO_F, fontWeight: 500, fontSize: size, letterSpacing: '0.04em', color, whiteSpace: 'nowrap', ...style }}>
      {children}
    </div>
  )
}

/** A number lands whole on its word: scale 0.96→1 + opacity over 8 frames (TEMPLATE § 3.3 / § 5.2). */
export function Hero({
  at,
  children,
  size = 150,
  color = C.salud,
  scope,
  scopeSize = 30,
  style,
}: {
  at: number
  children: ReactNode
  size?: number
  color?: string
  scope?: ReactNode
  scopeSize?: number
  style?: CSSProperties
}) {
  const f = useCurrentFrame()
  return (
    <div style={{ opacity: ease(f, at, at + 8, 0, 1), scale: ease(f, at, at + 8, 0.96, 1), transformOrigin: 'left bottom', ...style }}>
      <div style={{ fontFamily: SERIF_F, fontWeight: 800, fontSize: size, lineHeight: 1, color, fontVariantNumeric: 'lining-nums tabular-nums', whiteSpace: 'nowrap' }}>
        {children}
      </div>
      {scope && <Mono size={scopeSize} style={{ marginTop: 12, lineHeight: 1.35 }}>{scope}</Mono>}
    </div>
  )
}

/** A stamp lands with weight (easeBack, 12 frames), slightly rotated. */
export function Stamp({ at, children, color = C.ink, rotate = -8, size = 72, style }: { at: number; children: ReactNode; color?: string; rotate?: number; size?: number; style?: CSSProperties }) {
  const f = useCurrentFrame()
  return (
    <div
      style={{
        position: 'absolute',
        opacity: ease(f, at, at + 3, 0, 1),
        scale: ease(f, at, at + 12, 1.6, 1, easeBack),
        rotate: `${rotate}deg`,
        border: `6px solid ${color}`,
        padding: '8px 26px',
        fontFamily: MONO_F,
        fontWeight: 800,
        fontSize: size,
        letterSpacing: '0.08em',
        color,
        whiteSpace: 'nowrap',
        mixBlendMode: 'multiply',
        ...style,
      }}
    >
      {children}
    </div>
  )
}

/** IMSS as a typographic seal (owner: no buildings), not the official logo. */
export function Seal({ r = 150, color = C.ink, style }: { r?: number; color?: string; style?: CSSProperties }) {
  const d = r * 2
  const tr = r - 34
  return (
    <svg width={d} height={d} viewBox={`0 0 ${d} ${d}`} style={style}>
      <circle cx={r} cy={r} r={r - 4} fill="none" stroke={color} strokeWidth={5} />
      <circle cx={r} cy={r} r={r - 62} fill="none" stroke={color} strokeWidth={2.5} />
      <path id={`seal-path-${r}`} d={`M ${r - tr},${r} a ${tr},${tr} 0 1,1 ${tr * 2},0 a ${tr},${tr} 0 1,1 ${-tr * 2},0`} fill="none" />
      <text fontFamily={MONO_F} fontWeight={700} fontSize={r * 0.15} fill={color} letterSpacing={r * 0.012}>
        <textPath href={`#seal-path-${r}`} startOffset="0">
          INSTITUTO MEXICANO DEL SEGURO SOCIAL ·
        </textPath>
      </text>
      <text x={r} y={r + r * 0.12} textAnchor="middle" fontFamily={SERIF_F} fontWeight={800} fontSize={r * 0.36} fill={color}>
        IMSS
      </text>
    </svg>
  )
}

/** A ledger bar: ink-ruled, salud for the subject, hatched dim for the others. */
export function Bar({ w, h = 22, subject = false, color, style }: { w: number; h?: number; subject?: boolean; color?: string; style?: CSSProperties }) {
  return (
    <div
      style={{
        width: Math.max(0, w),
        height: h,
        backgroundColor: color ?? (subject ? C.saludSoft : undefined),
        backgroundImage: subject || color ? undefined : `repeating-linear-gradient(135deg, ${C.dim} 0 2px, transparent 2px 9px)`,
        outline: `2px solid ${C.ink}`,
        opacity: w < 1 ? 0 : 1,
        ...style,
      }}
    />
  )
}
