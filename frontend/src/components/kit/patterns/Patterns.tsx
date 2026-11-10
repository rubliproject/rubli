/**
 * RUBLI kit · Patrones (DESIGN.md § Patrones). Our own small set, generated here; nothing copied.
 * Each pattern has ONE meaning. A pattern on a mark says that meaning, so it never decorates data.
 *
 *   sin-dato     diagonal hatch           «sin clasificar / sin dato»
 *   estimado     fine square-dot grid     «estimado / dato débil» (e.g. Structure A, 2002–2010)
 *   consolidada  basket weave             «compra consolidada»
 *   campo        soft flow lines          background field behind a chart (no meaning, very low contrast)
 *   foco         concentric rings         <Foco>: the one thing the reader should look at
 *   sexenio      alternating tint bands   <SexenioBands>: presidential terms on a year axis
 *
 * Cheap: one <pattern> per kind per SVG, shapes reference it with `fill={patUrl(uid, kind)}`.
 * Static (nothing animates), so prefers-reduced-motion needs no branch. Tiles sit on whole pixels.
 */
import { useId } from 'react'
import { ADMINISTRATIONS } from '@/lib/administrations'
import './patterns.css'

export type PatternKind = 'sin-dato' | 'estimado' | 'consolidada' | 'campo'

export const PATTERN_MEANING: Record<PatternKind | 'foco' | 'sexenio', { es: string; en: string }> = {
  'sin-dato': { es: 'sin clasificar / sin dato', en: 'unclassified / no data' },
  estimado: { es: 'estimado / dato débil', en: 'estimated / weak data' },
  consolidada: { es: 'compra consolidada', en: 'consolidated purchase' },
  campo: { es: 'fondo (sin significado)', en: 'background (no meaning)' },
  foco: { es: 'foco: lo que hay que mirar', en: 'focus: what to look at' },
  sexenio: { es: 'sexenio (un tono por medio)', en: 'presidential term (alternating tint)' },
}

export const PATTERN_KINDS: PatternKind[] = ['sin-dato', 'estimado', 'consolidada', 'campo']

export const patId = (uid: string, kind: PatternKind) => `pat-${uid}-${kind}`
export const patUrl = (uid: string, kind: PatternKind) => `url(#${patId(uid, kind)})`

function Tile({ kind }: { kind: PatternKind }) {
  switch (kind) {
    case 'sin-dato': // «/» lines, 6px tile = 4.2px period, ends overdrawn so the seam never shows
      return <><rect className="pat-g" width={6} height={6} /><path className="pat-l" d="M-1 1 L1 -1 M0 6 L6 0 M5 7 L7 5" /></>
    case 'estimado': // 1×1 square every 4px: Agnes Martin's pencil grid, at text size
      return <><rect className="pat-g" width={4} height={4} /><rect className="pat-i" x={1} y={1} width={1} height={1} /></>
    case 'consolidada': // basket weave: 6px cells, two short bars each with air around them, horizontal / vertical in a checker
      return (
        <>
          <rect className="pat-g" width={12} height={12} />
          <path className="pat-i" d="M1 1h4v1H1zM1 4h4v1H1zM7 7h4v1H7zM7 10h4v1H7zM7 1h1v4H7zM10 1h1v4H10zM1 7h1v4H1zM4 7h1v4H4z" />
        </>
      )
    case 'campo': // one sine per 64×16 tile; start and end tangents match, so the line runs on unbroken
      return <path className="pat-f" d="M0 8 C16 2 16 2 32 8 S48 14 64 8" />
  }
}
const SIZE: Record<PatternKind, [number, number]> = { 'sin-dato': [6, 6], estimado: [4, 4], consolidada: [12, 12], campo: [64, 16] }

/** Put inside an <svg>. `uid` must be unique on the page (two SVGs, two uids). */
export function PatternDefs({ uid, kinds = PATTERN_KINDS }: { uid: string; kinds?: PatternKind[] }) {
  return (
    <defs>
      {kinds.map((k) => (
        <pattern key={k} id={patId(uid, k)} width={SIZE[k][0]} height={SIZE[k][1]} patternUnits="userSpaceOnUse">
          <Tile kind={k} />
        </pattern>
      ))}
    </defs>
  )
}

/** A legend key: the pattern in a 16×12 well. Decorative; the legend text carries the meaning. */
export function PatternSwatch({ kind }: { kind: PatternKind }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  return (
    <i className="pat-swatch" aria-hidden="true">
      <svg width={16} height={12}><PatternDefs uid={uid} kinds={[kind]} /><rect width={16} height={12} fill={patUrl(uid, kind)} /></svg>
    </i>
  )
}

/** Foco: concentric rings around ONE point (never per mark). Outer rings fade out. */
export function Foco({ cx, cy, r = 24, rings = 3 }: { cx: number; cy: number; r?: number; rings?: number }) {
  return (
    <g aria-hidden="true" pointerEvents="none">
      {Array.from({ length: rings }, (_, i) => (
        <circle key={i} className="pat-ring" cx={cx} cy={cy} r={(r * (i + 1)) / rings} opacity={1 - i / (rings + 0.5)} />
      ))}
    </g>
  )
}

/** Sexenio bands: every other term tinted, behind a year axis. `x(year)` = left edge of that year's slot.
 *  Parity follows the term's index (Fox = 0), so a term keeps its tone whatever range is shown. */
export function SexenioBands({ x, y, height, from, to }: { x: (year: number) => number; y: number; height: number; from: number; to: number }) {
  return (
    <g aria-hidden="true" pointerEvents="none">
      {ADMINISTRATIONS.map((a, i) => {
        const a0 = Math.max(a.yearStart, from), a1 = Math.min(a.yearEnd, to)
        if (i % 2 === 0 || a1 < a0) return null
        return <rect key={a.key} className="pat-band" x={x(a0)} y={y} width={x(a1 + 1) - x(a0)} height={height} />
      })}
    </g>
  )
}
