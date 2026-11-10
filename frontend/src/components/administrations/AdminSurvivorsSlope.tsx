/**
 * AdminSurvivorsSlope — §A LOS SOBREVIVIENTES / THE SURVIVORS.
 *
 * FT slope-chart exhibit: 5 era columns (Fox→Sheinbaum) × top-6 supplier
 * roster. A connector joins two occurrences of the same normalized vendor
 * name in different eras — the connector IS the datum (persistence across a
 * change of government). Ochre = the joined eras belong to different
 * parties; zinc = same party. Zero fetch — the page hands this component the
 * 30-slot roster it already holds in memory.
 *
 * Layout (SEXENIOS_TIGHTEN_BRIEF): names are HTML sans labels, ≤ 2 lines, in
 * fixed-height rows; connectors live only in the gutters between columns —
 * an edge that skips a term drops into a lane under the grid instead of
 * crossing the column it skips. Motion: on viewport enter the columns fade
 * in left→right, then each connector draws term→term in sequence and the
 * survivor label it reaches lights up. Reduced motion → final state.
 *
 * Named precedent: FT Visual Vocabulary slope chart + NYT Upshot named-
 * outlier discipline (names printed ON the chart, not in a legend).
 */

import { useRef, useState } from 'react'
import { motion, useInView, useReducedMotion } from 'framer-motion'
import { useMeasuredWidth } from '@/hooks/useMeasuredWidth'
import { formatDualCurrency, formatCompactMXN } from '@/lib/utils'
import { formatVendorName } from '@/lib/vendor/formatName'
import { DUR, EASE, T } from '@/lib/motion'

export interface SurvivorSeat {
  name: string
  totalMxn: number
  contracts: number
  riskPct: number
}

export interface SurvivorColumn {
  adminName: string
  displayName: string
  yearsLabel: string
  party: string
  color: string
  seats: SurvivorSeat[]
}

export interface AdminSurvivorsSlopeProps {
  columns: SurvivorColumn[]
  isEs: boolean
  onSelectAdmin: (adminName: string) => void
}

export interface SurvivorBridge {
  norm: string
  displayName: string
  adminNames: string[]
  crossParty: boolean
  totalMxn: number
}

// ── Geometry — columns take 16% of the plate each, the four gutters share
// the rest (≈5% each); connectors are drawn only inside gutters / lanes.
const COL_FRAC = 0.16
const HEADER_H = 44
const ROW_H = 52
const N_ROWS = 6
const TICK_W = 3
const LABEL_PAD = 9
const LANE_GAP = 12
const LANE_STEP = 10

// ── Motion choreography (seconds).
const COL_STEP = 0.12
const DRAW_START = 5 * COL_STEP + DUR.base
const DRAW_DUR = DUR.story
const DRAW_STEP = DUR.slow

const OCHRE = 'var(--color-accent)'
const ZINC = 'var(--color-risk-low)'

const SERIF = 'var(--font-family-editorial)'

/**
 * Normalize a raw COMPRANET vendor name for cross-era matching:,
 * strip accents, strip punctuation, strip common corporate suffixes,
 * collapse whitespace. Two seats with equal norm() in different eras are
 * the same supplier surviving a government change.
 */
function norm(name: string): string {
  return name
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[.,]/g, ' ')
    .replace(/\b(S\s?A(\s?P\s?I)?|DE|C\s?V|S\s?DE\s?R\s?L|SA|CV|SAPI|SRL)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Client-side O(30²) intersection — a bridge is a norm() name appearing in ≥2 columns. */
function computeSurvivorBridges(columns: SurvivorColumn[]): SurvivorBridge[] {
  const byNorm = new Map<
    string,
    { displayName: string; admins: Set<string>; parties: Set<string>; totalMxn: number }
  >()

  for (const col of columns) {
    for (const seat of col.seats) {
      const key = norm(seat.name)
      if (!key) continue
      let entry = byNorm.get(key)
      if (!entry) {
        entry = { displayName: seat.name, admins: new Set(), parties: new Set(), totalMxn: 0 }
        byNorm.set(key, entry)
      }
      if (!entry.admins.has(col.adminName)) {
        entry.admins.add(col.adminName)
        entry.totalMxn += seat.totalMxn
      }
      entry.parties.add(col.party)
    }
  }

  const bridges: SurvivorBridge[] = []
  for (const [key, entry] of byNorm) {
    if (entry.admins.size >= 2) {
      bridges.push({
        norm: key,
        displayName: entry.displayName,
        adminNames: Array.from(entry.admins),
        crossParty: entry.parties.size >= 2,
        totalMxn: entry.totalMxn,
      })
    }
  }
  return bridges
}

interface Edge {
  key: string
  colA: number
  rowA: number
  colB: number
  rowB: number
  crossParty: boolean
  /** Index of the under-grid lane for edges that skip a term; -1 = adjacent. */
  lane: number
  /** Seconds after the plate enters view at which this connector starts drawing. */
  delay: number
  dur: number
}

export function AdminSurvivorsSlope({ columns, isEs, onSelectAdmin }: AdminSurvivorsSlopeProps) {
  const [hoveredKey, setHoveredKey] = useState<string | null>(null)
  const plate = useRef<HTMLDivElement>(null)
  const W = useMeasuredWidth(plate)
  const inView = useInView(plate, { once: true, amount: 0.35 })
  const reduce = useReducedMotion() ?? false
  const play = reduce || inView
  const initial = reduce ? false : 'initial'
  const state = play ? 'animate' : 'initial'

  if (!columns.length) return null

  const bridges = computeSurvivorBridges(columns)
  const bridgeByKey = new Map(bridges.map((b) => [b.norm, b]))

  // Occurrences per norm key, and the bridge key of each seat ("ci:ri").
  const occurrences = new Map<string, { col: number; row: number }[]>()
  const seatKey = new Map<string, string>()
  columns.forEach((col, ci) => {
    col.seats.slice(0, N_ROWS).forEach((seat, ri) => {
      const key = norm(seat.name)
      if (!bridgeByKey.has(key)) return
      const list = occurrences.get(key) ?? []
      list.push({ col: ci, row: ri })
      occurrences.set(key, list)
      seatKey.set(`${ci}:${ri}`, key)
    })
  })

  // One connector per CONSECUTIVE pair of occurrences — a name appearing in
  // 3 eras chains into 2 edges. Edges draw in term order: everything leaving
  // column c starts at DRAW_START + c·DRAW_STEP.
  const edges: Edge[] = []
  let lanes = 0
  for (const [key, occ] of occurrences) {
    const sorted = [...occ].sort((a, b) => a.col - b.col)
    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i]
      const b = sorted[i + 1]
      const span = b.col - a.col
      edges.push({
        key,
        colA: a.col,
        rowA: a.row,
        colB: b.col,
        rowB: b.row,
        crossParty: columns[a.col].party !== columns[b.col].party,
        lane: span > 1 ? lanes++ : -1,
        delay: DRAW_START + a.col * DRAW_STEP,
        dur: DRAW_DUR * Math.min(span, 2),
      })
    }
  }

  // When each survivor label lights: the first occurrence when its curve
  // leaves, every later one when a curve arrives.
  const lightAt = new Map<string, number>()
  for (const e of edges) {
    const a = `${e.colA}:${e.rowA}`
    const b = `${e.colB}:${e.rowB}`
    lightAt.set(a, Math.min(lightAt.get(a) ?? Infinity, e.delay))
    lightAt.set(b, Math.min(lightAt.get(b) ?? Infinity, e.delay + e.dur))
  }

  // Plate geometry from the measured width.
  const COL_W = W * COL_FRAC
  const GUTTER = (W - 5 * COL_W) / 4
  const colX = (ci: number) => ci * (COL_W + GUTTER)
  const rowMid = (ri: number) => HEADER_H + ri * ROW_H + ROW_H / 2
  const gridBottom = HEADER_H + N_ROWS * ROW_H
  const plateH = gridBottom + (lanes ? LANE_GAP + lanes * LANE_STEP : 0) + 4

  function edgePath(e: Edge): string {
    const x1 = colX(e.colA) + COL_W + 2
    const x2 = colX(e.colB) - 2
    const y1 = rowMid(e.rowA)
    const y2 = rowMid(e.rowB)
    if (e.lane < 0) {
      const k = (x2 - x1) * 0.55
      return `M${x1},${y1} C${x1 + k},${y1} ${x2 - k},${y2} ${x2},${y2}`
    }
    // Skip edge: down the gutter after colA, along a lane under the grid,
    // up the gutter before colB — never across the term it skips.
    const r = Math.min(8, GUTTER / 4)
    const xa = x1 + GUTTER / 2 - 2
    const xb = x2 - GUTTER / 2 + 2
    const ly = gridBottom + LANE_GAP + e.lane * LANE_STEP
    return [
      `M${x1},${y1}`,
      `Q${xa},${y1} ${xa},${y1 + r}`,
      `L${xa},${ly - r}`,
      `Q${xa},${ly} ${xa + r},${ly}`,
      `L${xb - r},${ly}`,
      `Q${xb},${ly} ${xb},${ly - r}`,
      `L${xb},${y2 + r}`,
      `Q${xb},${y2} ${x2},${y2}`,
    ].join(' ')
  }

  const seatsCount = 30
  const N = bridges.length
  const M = bridges.filter((b) => b.crossParty).length

  const sheinbaumIdx = columns.findIndex((c) => c.adminName.toLowerCase() === 'sheinbaum')
  const hasSheinbaumBridge =
    sheinbaumIdx >= 0 && bridges.some((b) => b.adminNames.includes(columns[sheinbaumIdx].adminName))

  const erasOf = (b: SurvivorBridge) =>
    columns
      .map((c, i) => (b.adminNames.includes(c.adminName) ? i : -1))
      .filter((i) => i >= 0)
      .sort((x, y) => x - y)

  // Largest survivor — the bridge with the biggest combined value.
  const topBridge = bridges.length ? [...bridges].sort((a, b) => b.totalMxn - a.totalMxn)[0] : null
  const topIdxs = topBridge ? erasOf(topBridge) : []
  const topBridgeEraA = columns[topIdxs[0]]?.displayName ?? ''
  const topBridgeEraB = columns[topIdxs[topIdxs.length - 1]]?.displayName ?? ''

  const ariaLabel = isEs
    ? `Padrón de los seis mayores proveedores por sexenio; ${N} nombres se repiten entre administraciones.`
    : `Roster of the six largest suppliers per term; ${N} names repeat across administrations.`

  const stats = [
    { value: String(N), label: isEs ? 'nombres se repiten' : 'names repeat' },
    { value: String(M), label: isEs ? 'cruzan un cambio de partido' : 'cross a change of party' },
    { value: `${seatsCount}`, label: isEs ? 'asientos · cinco gobiernos' : 'seats · five governments' },
  ]

  return (
    <div>
      {/* Dek at a ~68ch measure, paired with a compact stat stack. */}
      <div className="lg:grid lg:grid-cols-[minmax(0,68ch)_1fr] lg:gap-12 lg:items-end">
        <div>
          <p
            style={{
              fontFamily: SERIF,
              fontStyle: 'normal',
              fontWeight: 500,
              fontSize: 22,
              lineHeight: 1.25,
              color: 'var(--color-text-primary)',
            }}
          >
            {N === 0 ? (
              isEs
                ? 'Ninguno de los seis mayores proveedores se repite entre sexenios en el padrón actual.'
                : 'None of the six largest suppliers repeats across terms in the current roster.'
            ) : (
              <>
                {isEs ? `De ${seatsCount} asientos en cinco gobiernos, ` : `Of ${seatsCount} seats across five governments, `}
                <span style={{ fontStyle: 'normal', fontWeight: 600, color: OCHRE }}>
                  {isEs
                    ? `${N} nombres se repiten — ${M} a través de un cambio de partido`
                    : `${N} names repeat — ${M} across a change of party`}
                </span>
                .
              </>
            )}
          </p>
          {topBridge && (
            <p
              lang={isEs ? 'es' : 'en'}
              className="prose-just mt-2 text-text-secondary"
              style={{ fontFamily: SERIF, fontStyle: 'normal', fontSize: 15, lineHeight: 1.6 }}
            >
              {isEs
                ? `El mayor: ${formatVendorName(topBridge.displayName, 48)}, ${formatDualCurrency(topBridge.totalMxn)} entre ${topBridgeEraA} y ${topBridgeEraB}. Cada curva une el mismo proveedor en dos sexenios; léase de izquierda a derecha.`
                : `The largest: ${formatVendorName(topBridge.displayName, 48)}, ${formatDualCurrency(topBridge.totalMxn)} across ${topBridgeEraA} and ${topBridgeEraB}. Each curve joins the same supplier in two terms; read left to right.`}
            </p>
          )}
        </div>
        {N > 0 && (
          <ul className="mt-3 lg:mt-0 flex flex-wrap gap-x-6 gap-y-1 lg:justify-end">
            {stats.map((s) => (
              <li key={s.label} className="flex items-baseline gap-1.5">
                <span className="font-mono tabular-nums text-text-primary" style={{ fontSize: 20, fontWeight: 600 }}>
                  {s.value}
                </span>
                <span className="text-[12px] text-text-muted">{s.label}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Desktop — slope chart drawn at 1:1 against the measured plate width. */}
      <div className="hidden md:block mt-5">
        <div ref={plate} className="relative" style={{ height: plateH }}>
          {W > 0 && (
            <>
              <svg
                width={W}
                height={plateH}
                viewBox={`0 0 ${W} ${plateH}`}
                role="img"
                aria-label={ariaLabel}
                className="absolute inset-0"
                style={{ display: 'block' }}
              >
                {/* Faint row rules so the six ranks read as a grid. */}
                {columns.map((col, ci) =>
                  Array.from({ length: N_ROWS - 1 }, (_, ri) => (
                    <line
                      key={`${col.adminName}-rule-${ri}`}
                      x1={colX(ci)}
                      x2={colX(ci) + COL_W}
                      y1={HEADER_H + (ri + 1) * ROW_H}
                      y2={HEADER_H + (ri + 1) * ROW_H}
                      style={{ stroke: 'var(--color-border)' }}
                      strokeWidth={1}
                      opacity={0.5}
                    />
                  )),
                )}

                {edges.map((edge, i) => {
                  const isHovered = hoveredKey === edge.key
                  const dimmed = hoveredKey !== null && !isHovered
                  const stroke = edge.crossParty ? OCHRE : ZINC
                  const d = edgePath(edge)
                  const width = edge.crossParty ? (isHovered ? 3 : 2.25) : 1.5
                  const lineT = { pathLength: { duration: edge.dur, ease: EASE.emphasized, delay: edge.delay }, opacity: { duration: DUR.fast, delay: edge.delay } }
                  return (
                    <g
                      key={`${edge.key}-${i}`}
                      opacity={dimmed ? 0.2 : 1}
                      style={{ transition: 'opacity 200ms' }}
                    >
                      {edge.crossParty && (
                        <motion.path
                          d={d}
                          fill="none"
                          style={{ stroke: OCHRE }}
                          strokeWidth={7}
                          strokeLinecap="round"
                          initial={initial}
                          animate={state}
                          variants={{ initial: { pathLength: 0, opacity: 0 }, animate: { pathLength: 1, opacity: 0.14, transition: lineT } }}
                        />
                      )}
                      <motion.path
                        data-connector=""
                        d={d}
                        fill="none"
                        style={{ stroke }}
                        strokeWidth={width}
                        strokeLinecap="round"
                        initial={initial}
                        animate={state}
                        variants={{
                          initial: { pathLength: 0, opacity: 0 },
                          animate: { pathLength: 1, opacity: edge.crossParty ? 1 : 0.6, transition: lineT },
                        }}
                      />
                    </g>
                  )
                })}
              </svg>

              {/* Column headers — real buttons (onSelectAdmin), fade in left→right. */}
              {columns.map((col, ci) => (
                <motion.div
                  key={col.adminName}
                  data-slope-col=""
                  className="absolute"
                  style={{ left: colX(ci), top: 0, width: COL_W, height: HEADER_H }}
                  initial={initial}
                  animate={state}
                  variants={{ initial: { opacity: 0 }, animate: { opacity: 1, transition: { ...T.base, delay: ci * COL_STEP } } }}
                >
                  <button
                    type="button"
                    onClick={() => onSelectAdmin(col.adminName)}
                    className="w-full h-full flex flex-col justify-center gap-0.5 text-left border-b border-border hover:border-text-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1"
                    aria-label={isEs ? `Ver expediente de ${col.displayName}` : `Open ${col.displayName}'s file`}
                  >
                    <span className="flex items-center gap-1.5 min-w-0">
                      <span className="flex-shrink-0" style={{ width: 8, height: 8, backgroundColor: col.color }} />
                      <span style={{ fontFamily: SERIF, fontStyle: 'normal', fontSize: 14, color: 'var(--color-text-primary)', lineHeight: 1.1 }}>
                        {col.displayName}
                      </span>
                    </span>
                    <span className="font-mono tabular-nums text-[12px] text-text-muted">{col.yearsLabel}</span>
                  </button>
                </motion.div>
              ))}

              {/* Seat labels — sans 12.5px, ≤ 2 lines, one fixed row height. */}
              <div aria-hidden="true">
                {columns.map((col, ci) =>
                  col.seats.slice(0, N_ROWS).map((seat, ri) => {
                    const key = seatKey.get(`${ci}:${ri}`) ?? null
                    const bridge = key ? bridgeByKey.get(key) : undefined
                    const lit = lightAt.get(`${ci}:${ri}`)
                    const isBridged = bridge != null && lit != null
                    const lightDelay = lit ?? 0
                    const crossParty = bridge?.crossParty ?? false
                    const accent = crossParty ? OCHRE : ZINC
                    const showDagger = isBridged && ci === sheinbaumIdx
                    const colDelay = ci * COL_STEP
                    return (
                      <motion.div
                        key={`${col.adminName}-${ri}`}
                        data-slope-label=""
                        title={`${formatVendorName(seat.name, 120)} · ${formatCompactMXN(seat.totalMxn)}`}
                        className="absolute flex items-center"
                        style={{ left: colX(ci), top: HEADER_H + ri * ROW_H, width: COL_W, height: ROW_H }}
                        onMouseEnter={() => key && setHoveredKey(key)}
                        onMouseLeave={() => setHoveredKey(null)}
                        initial={initial}
                        animate={state}
                        variants={{
                          initial: { opacity: 0 },
                          animate: { opacity: 1, transition: { ...T.base, delay: colDelay + 0.02 * ri } },
                        }}
                      >
                        {isBridged && (
                          <motion.span
                            className="absolute left-0"
                            style={{ top: 8, bottom: 8, width: TICK_W, backgroundColor: accent, originY: 0.5 }}
                            initial={initial}
                            animate={state}
                            variants={{ initial: { scaleY: 0 }, animate: { scaleY: 1, transition: { ...T.base, delay: lightDelay } } }}
                          />
                        )}
                        <motion.div
                          className="min-w-0"
                          style={{ paddingLeft: LABEL_PAD, paddingRight: 4 }}
                          initial={initial}
                          animate={state}
                          variants={
                            isBridged
                              ? { initial: { opacity: 0.45 }, animate: { opacity: 1, transition: { ...T.base, delay: lightDelay } } }
                              : { initial: { opacity: 1 }, animate: { opacity: 1 } }
                          }
                        >
                          <div
                            className={isBridged ? 'line-clamp-2 font-semibold text-text-primary' : 'line-clamp-2 text-text-muted'}
                            style={{ fontSize: 12.5, lineHeight: '16px' }}
                          >
                            {formatVendorName(seat.name, 80)}
                            {showDagger && <sup style={{ fontSize: 12, marginLeft: 1 }}>†</sup>}
                          </div>
                          {isBridged && (
                            <div className="font-mono tabular-nums text-[13px] leading-4" style={{ color: crossParty ? 'var(--color-accent-text)' : 'var(--color-text-secondary)' }}>
                              {formatCompactMXN(seat.totalMxn)}
                            </div>
                          )}
                        </motion.div>
                      </motion.div>
                    )
                  }),
                )}
              </div>
            </>
          )}
        </div>

        {/* Visually-hidden bridge list — the SVG is role="img" and opaque to a screen reader. */}
        <ul className="sr-only">
          {bridges.map((b) => {
            const eraLabels = erasOf(b).map((i) => columns[i].displayName).join(isEs ? ' y ' : ' and ')
            return (
              <li key={b.norm}>
                {formatVendorName(b.displayName, 60)}
                {' — '}
                {eraLabels}
                {' · '}
                {formatCompactMXN(b.totalMxn)}
                {b.crossParty ? (isEs ? ' (cambio de partido)' : ' (change of party)') : ''}
              </li>
            )
          })}
        </ul>
      </div>

      {/* Mobile — computed bridge cards, same data as the slope chart. */}
      <div className="md:hidden mt-4 space-y-2">
        {bridges.length === 0 && (
          <p className="text-xs text-text-muted">
            {isEs
              ? 'Ninguno de los seis mayores proveedores se repite entre sexenios en el padrón actual.'
              : 'None of the six largest suppliers repeats across terms in the current roster.'}
          </p>
        )}
        {bridges
          .slice()
          .sort((a, b) => b.totalMxn - a.totalMxn)
          .map((b) => {
            const idxs = erasOf(b)
            const eraA = columns[idxs[0]]?.displayName ?? ''
            const eraB = columns[idxs[idxs.length - 1]]?.displayName ?? ''
            const isSheinbaumBridge = sheinbaumIdx >= 0 && idxs.includes(sheinbaumIdx)
            return (
              <div
                key={b.norm}
                className="pl-2.5 py-1.5"
                style={{ borderLeft: `2px solid ${b.crossParty ? 'var(--color-accent)' : ZINC}` }}
              >
                <div className="flex items-center gap-1 mb-0.5">
                  {idxs.map((i) => (
                    <span
                      key={columns[i].adminName}
                      className="rounded-full flex-shrink-0"
                      style={{ width: 6, height: 6, backgroundColor: columns[i].color }}
                    />
                  ))}
                </div>
                <div className="text-[13px] font-medium text-text-primary">
                  {formatVendorName(b.displayName, 40)}
                  {isSheinbaumBridge && <span style={{ color: 'var(--color-accent-text)' }}>†</span>}
                </div>
                <div className="text-[12px] font-mono tabular-nums text-text-muted mt-0.5">
                  {eraA} → {eraB} · {formatCompactMXN(b.totalMxn)}
                </div>
              </div>
            )
          })}
      </div>

      {/* Legend — one 12px line spanning the plate. */}
      {N > 0 && (
        <p className="mt-3 text-[12px] leading-5 text-text-muted">
          <span aria-hidden="true" className="inline-block align-middle mr-1.5" style={{ width: 16, height: 2, backgroundColor: OCHRE }} />
          {isEs ? 'sobrevive un cambio de partido' : 'survives a change of party'}
          <span aria-hidden="true" className="inline-block align-middle ml-4 mr-1.5" style={{ width: 16, height: 2, backgroundColor: ZINC }} />
          {isEs ? 'mismo partido' : 'same party'}
          {hasSheinbaumBridge && (
            <span className="ml-4">{isEs ? '† sexenio en curso — padrón parcial' : '† term in progress — partial roster'}</span>
          )}
        </p>
      )}
    </div>
  )
}

export default AdminSurvivorsSlope
