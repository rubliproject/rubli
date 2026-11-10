/**
 * PairLedger — «LÁMINA · EL FLUJO DEL PAR» / "PLATE · THE PAIR'S FLOW".
 *
 * Act II centerpiece exhibit for the contract dossier («La Prueba»). Replaces
 * RelationRibbon's per-contract spike thumbnail with a per-YEAR ledger: one
 * linear-peso column per year (Reuters *Time of Evidence* accumulation
 * grammar), a cumulative step-line climbing to the pair total, and this
 * contract inked as a named bottom slice inside its own year column (NYT
 * Upshot named-outlier mechanic). Each year column is a fused drill-in
 * trigger — clicking it expands that year's register rows directly beneath
 * the plate, zero new fetch (rows arrive via props from the mount-time pair
 * register query already fired by RelationSection).
 *
 * Amendment 1 (audit fix — encoding-math): year columns, the cumulative
 * step-line, and the peso gridlines all share ONE LINEAR peso y-axis.
 * `colH = MAX_H * (yearSum / maxYearSum)` — no sqrt anywhere on this plate.
 *
 * Amendment 2 (graft from El Libro Mayor): the register lives INSIDE the
 * exhibit. Each year column is `<button aria-expanded>`; one year open at a
 * time, subject pinned + highlighted, `max-h-[240px] overflow-y-auto`. A
 * `⌄ Ver los N contratos` control expands the full top-100 list as the
 * all-years fallback.
 *
 * Zero <circle> by design (platform dot-grid ban) — rects, lines, and H/V-only
 * <path> segments for the step-line.
 *
 * Spec: contract-dossier-2026-07-04 spec-draft.md §II + narrative-first.md §II.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * Props contract (frozen for the orchestrator wiring `RelationSection`):
 *
 *   rows           ContractListItem[]   the pair register (top-100 by amount,
 *                                       already fetched mount-time by the
 *                                       parent in relationship mode). Used for
 *                                       year aggregation AND the drill-in rows.
 *   subject        ContractDetail       the contract this dossier page is for.
 *   pair           ContractContextResponse['pair']
 *   p99            number | null        sector p99 (unused directly here —
 *                                       carried for future gridline parity
 *                                       with RatioBullet fallback; kept in the
 *                                       interface so the caller doesn't branch).
 *   sizeVsP99      number | null        ditto.
 *   sectorAccent   string               hex — subject slice + leader fill.
 *   sectorName     string               unused directly (parity w/ ribbon
 *                                       interface); kept for caller symmetry.
 *   captionProse   string               rankProse, built upstream (verbatim
 *                                       honesty clauses) — rendered as the
 *                                       figcaption, with the linear-scale note
 *                                       appended here.
 *   lang           'en' | 'es'
 * ─────────────────────────────────────────────────────────────────────────
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import type { ContractContextResponse, ContractDetail, ContractListItem } from '@/api/types'
import { getRiskLevelFromScore, RISK_COLORS, RISK_TEXT_COLORS, CATEGORICAL } from '@/lib/constants'
import { formatCompactMXN } from '@/lib/utils'
import { formatEntityName } from '@/lib/entity/format'
import { measureLabel, placeLabels, type LabelBox } from '@/lib/plateLabels'

export interface PairLedgerProps {
  rows: ContractListItem[]
  subject: ContractDetail
  pair: ContractContextResponse['pair']
  p99: number | null
  sizeVsP99: number | null
  sectorAccent: string
  sectorName: string
  captionProse: string
  lang: 'en' | 'es'
}

// ── geometry ─────────────────────────────────────────────────────────────
const MOBILE_BREAK = 640
const ZINC = RISK_COLORS.low
const OCHRE = CATEGORICAL[6]
const MONO = '"IBM Plex Mono", "JetBrains Mono", monospace'
// The cumulative line shares the column scale while the pair total is at most
// this multiple of the tallest year; beyond it the line gets its own labelled
// right-hand axis (D12b § Change 4b).
const SHARED_SCALE_MAX_RATIO = 3

function dateOf(c: { contract_date?: string; contract_year?: number }): Date | null {
  if (c.contract_date) {
    const d = new Date(c.contract_date)
    if (!Number.isNaN(d.getTime())) return d
  }
  if (c.contract_year) {
    return new Date(Date.UTC(c.contract_year, 6, 1)) // Jul 1 mid-year fallback
  }
  return null
}

interface YearAgg {
  year: number
  sum: number
  count: number
  level: 'critical' | 'high' | 'medium' | 'low'
  cumulative: number
}

export function PairLedger({
  rows,
  subject,
  pair,
  sectorAccent,
  captionProse,
  lang,
}: PairLedgerProps) {
  const isEs = lang === 'es'
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(960)
  const [hoverYear, setHoverYear] = useState<number | null>(null)
  const [openYear, setOpenYear] = useState<number | null>(null)
  const [allOpen, setAllOpen] = useState(false)

  useEffect(() => {
    if (!containerRef.current) return
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width
      if (w && w > 0) setWidth(w)
    })
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  const isMobile = width < MOBILE_BREAK
  const HEIGHT = isMobile ? 180 : 220
  const PAD_R = isMobile ? 16 : 24
  const BASELINE_Y = HEIGHT - 36
  const TOP_PAD = 30
  // 36px band above the tallest column: a two-line subject label (33px) fits
  // between the cumulative label and the step-line's top run (D12c § 3).
  const MAX_H = BASELINE_Y - TOP_PAD - 36

  const subjectYear = subject.contract_year ?? dateOf(subject)?.getUTCFullYear() ?? new Date().getUTCFullYear()
  const subjectAmount = subject.amount_mxn ?? 0
  const subjectInRows = rows.some((r) => r.id === subject.id)
  const pairTotal = pair.total_contracts ?? 0
  const pairRank = pair.this_rank ?? null

  const byYearApi = pair.by_year
  const layout = useMemo(() => {
    const rank: Record<string, number> = { critical: 3, high: 2, medium: 1, low: 0 }
    const byYear = new Map<number, { sum: number; count: number; maxRisk: 'critical' | 'high' | 'medium' | 'low' }>()
    // Complete per-year aggregate from /context (any pair size). An older
    // backend without `by_year` falls back to the top-100 register rows.
    const fromApi = !!byYearApi && byYearApi.length > 0
    if (fromApi) {
      for (const y of byYearApi!) {
        byYear.set(y.year, {
          sum: y.sum,
          count: y.n,
          maxRisk: y.max_risk != null ? getRiskLevelFromScore(y.max_risk) : 'low',
        })
      }
    } else {
      for (const r of rows) {
        const d = dateOf(r)
        const year = r.contract_year ?? d?.getUTCFullYear()
        if (year == null) continue
        const level = r.risk_score != null ? getRiskLevelFromScore(r.risk_score) : 'low'
        const entry = byYear.get(year) ?? { sum: 0, count: 0, maxRisk: 'low' as const }
        entry.sum += r.amount_mxn ?? 0
        entry.count += 1
        if (rank[level] > rank[entry.maxRisk]) entry.maxRisk = level
        byYear.set(year, entry)
      }
    }
    if (!byYear.has(subjectYear)) {
      byYear.set(subjectYear, { sum: 0, count: 0, maxRisk: 'low' })
    }
    // Register fallback only: the subject may sit below the top-100 cut.
    const subjectEntry = byYear.get(subjectYear)!
    if (!fromApi && !subjectInRows) {
      subjectEntry.sum += subjectAmount
      subjectEntry.count += 1
    }

    // Years with no contract are slots (zero column, no cap), never skipped —
    // the axis is time, not a category list.
    const known = Array.from(byYear.keys())
    const y0 = Math.min(...known)
    const y1 = Math.max(...known)
    for (let y = y0; y <= y1; y++) {
      if (!byYear.has(y)) byYear.set(y, { sum: 0, count: 0, maxRisk: 'low' })
    }
    const years = Array.from(byYear.keys()).sort((a, b) => a - b)
    const maxYearSum = Math.max(...years.map((y) => byYear.get(y)!.sum), 1)

    const aggs: YearAgg[] = []
    let running = 0
    for (const year of years) {
      const e = byYear.get(year)!
      running += e.sum
      aggs.push({ year, sum: e.sum, count: e.count, level: e.maxRisk, cumulative: running })
    }
    const grandTotal = running
    const complete = fromApi || (rows.length >= pairTotal && pairTotal > 0)
    // One scale for columns + cumulative when the total fits (<= 3x the
    // tallest year); else the cumulative line gets a right-hand axis.
    const sharedScale = grandTotal <= SHARED_SCALE_MAX_RATIO * maxYearSum
    const scaleMax = sharedScale ? Math.max(grandTotal, maxYearSum) : maxYearSum

    const nYears = years.length
    // Left pad fits the widest 11px mono gridline label (`168.0 mil MXN`):
    // ~0.62em per glyph + a 4px gap + 4px air. On phones the gridline labels
    // sit inside the plot, on paper above their line (D12c § Change 3), so the
    // plate keeps >= 85% of its width for the columns.
    const padL = isMobile ? 12 : Math.max(48, Math.ceil(formatCompactMXN(scaleMax).length * 11 * 0.62) + 8)
    // The right axis prints only its "0" beside the axis line; the total is
    // the cumulative label above it — so the right pad never grows.
    const padR = PAD_R
    const innerW = Math.max(80, width - padL - padR)
    const slotW = innerW / Math.max(1, nYears)

    // Dominant year = argmax, named only when it holds >= 50% of the pair.
    const top = aggs.reduce((m, a) => (a.sum > m.sum ? a : m), aggs[0])
    const topShare = grandTotal > 0 ? top.sum / grandTotal : 0
    const dominantYear = topShare >= 0.5 ? { year: top.year, share: topShare } : null

    // Year ticks — all when <=12, else thinned; first/last always present.
    // Thinned by room: a 4-digit year at the axis size needs ~34px (phones) / ~40px.
    const tickEvery = Math.max(1, Math.ceil((isMobile ? 34 : 40) / slotW), nYears <= 12 ? 1 : Math.ceil(nYears / 8))

    return { aggs, scaleMax, sharedScale, complete, grandTotal, nYears, innerW, slotW, dominantYear, tickEvery, padL, padR }
  }, [rows, byYearApi, subjectYear, subjectAmount, subjectInRows, pairTotal, width, isMobile, PAD_R])

  const { aggs, scaleMax, sharedScale, grandTotal, nYears, slotW, tickEvery, padL: PAD_L, padR: PAD_RR } = layout
  const registerComplete = layout.complete

  const xOf = (i: number) => PAD_L + i * layout.slotW + layout.slotW / 2
  const colHOf = (sum: number) => (sum > 0 ? Math.max(3, MAX_H * (sum / scaleMax)) : 0)
  const colW = slotW * 0.62

  const subjectIdx = aggs.findIndex((a) => a.year === subjectYear)
  const subjectColH = subjectIdx >= 0 ? colHOf(aggs[subjectIdx].sum) : 0
  const subjectYearSum = subjectIdx >= 0 ? aggs[subjectIdx].sum : 1
  const sliceH = Math.max(3, subjectColH * (subjectAmount / Math.max(subjectYearSum, 1)))
  const subjectX = subjectIdx >= 0 ? xOf(subjectIdx) : PAD_L

  // Cumulative step-line: on the column scale (shared) or on its own
  // right-hand axis whose 0 and total ticks are labelled — never unlabelled.
  const cumYOf = (cum: number) =>
    sharedScale
      ? BASELINE_Y - MAX_H * (cum / scaleMax)
      : BASELINE_Y - MAX_H * (grandTotal > 0 ? cum / grandTotal : 0)
  let stepPath = ''
  if (registerComplete && aggs.length > 0) {
    aggs.forEach((a, i) => {
      const x = xOf(i)
      const y = cumYOf(a.cumulative)
      stepPath += i === 0 ? `M ${PAD_L} ${BASELINE_Y} H ${x} V ${y}` : ` H ${x} V ${y}`
    })
  }

  const lastX = nYears > 0 ? xOf(nYears - 1) : PAD_L
  const plotRight = width - PAD_RR

  // Gridlines — 2 dashed lines at scaleMax and scaleMax/2, on the same
  // linear peso axis as the columns.
  const gridTop = BASELINE_Y - MAX_H
  const gridMid = BASELINE_Y - MAX_H / 2

  const vendorName = formatEntityName('vendor', subject.vendor_name, 'full') || (isEs ? 'el proveedor' : 'the vendor')
  const instName = formatEntityName('institution', subject.institution_name, 'full') || (isEs ? 'la institución' : 'the institution')
  const ariaLabel = isEs
    ? `El flujo del par ${vendorName} ↔ ${instName}: ${nYears} años, ${pairTotal.toLocaleString('es-MX')} contratos, ${formatCompactMXN(grandTotal || pair.total_amount_mxn)} acumulados. Este contrato, ${formatCompactMXN(subjectAmount)}, es el #${pairRank ?? '—'} por monto.`
    : `The ${vendorName} ↔ ${instName} pair's flow: ${nYears} years, ${pairTotal.toLocaleString('en-US')} contracts, ${formatCompactMXN(grandTotal || pair.total_amount_mxn)} accumulated. This contract, ${formatCompactMXN(subjectAmount)}, ranks #${pairRank ?? '—'} by value.`

  const subjectLabel1 = `${isEs ? 'ESTE' : 'THIS'} · ${formatCompactMXN(subjectAmount)}`
  const subjectLabel2 = pairRank != null ? `#${pairRank}/${pairTotal}` : null

  // ── Label seating (D12b § Change 4d, D12c § Change 3): the cumulative label
  // sits in the band above TOP_PAD (columns and the step-line never rise above
  // gridTop); the subject label is seated by placeLabels against every column
  // rect, the gridline labels, the cumulative label and every segment of the
  // step-line — for any pair size. Zero overprint.
  const cumLabelText = formatCompactMXN(grandTotal)
  const cumWord = isEs ? 'ACUMULADO' : 'CUMULATIVE'
  const cumLabelW = Math.max(
    measureLabel(cumLabelText, `700 12.5px ${MONO}`, 400, 14).width,
    measureLabel(cumWord, `400 11px ${MONO}`, 400, 13).width,
  )
  // With its own axis the cumulative label names the axis top, so it sits
  // over the right axis; on the shared scale it sits over the last column.
  const cumAnchorRight = sharedScale ? lastX > plotRight - cumLabelW - 6 : true
  const cumLabelX = sharedScale ? (cumAnchorRight ? lastX : lastX + 6) : width - 2
  const cumBox: LabelBox = cumAnchorRight
    ? { x0: cumLabelX - cumLabelW, y0: TOP_PAD - 31, x1: cumLabelX, y1: TOP_PAD + 1 }
    : { x0: cumLabelX, y0: TOP_PAD - 31, x1: cumLabelX + cumLabelW, y1: TOP_PAD + 1 }
  const colRects: LabelBox[] = aggs.map((a, i) => {
    const h = colHOf(a.sum)
    return { x0: xOf(i) - colW / 2, y0: BASELINE_Y - h, x1: xOf(i) + colW / 2, y1: BASELINE_Y }
  })
  // Gridline labels: left of the axis on desktop; inside the plot, on paper
  // above their line, on phones.
  const gridLabels = [
    { y: gridTop, text: formatCompactMXN(scaleMax) },
    ...(isMobile ? [] : [{ y: gridMid, text: formatCompactMXN(scaleMax / 2) }]),
  ]
  const gridLabelBoxes: LabelBox[] = gridLabels.map((g) => {
    const w = measureLabel(g.text, `400 11px ${MONO}`, 400, 13).width
    return isMobile
      ? { x0: PAD_L + 2, y0: g.y - 16, x1: PAD_L + 2 + w, y1: g.y - 1 }
      : { x0: PAD_L - 4 - w, y0: g.y - 8, x1: PAD_L - 4, y1: g.y + 7 }
  })
  // Step-line segments (horizontal runs + risers) as thin obstacle boxes.
  const stepSegs: LabelBox[] = []
  if (registerComplete) {
    let px = PAD_L
    let py = BASELINE_Y
    aggs.forEach((a, i) => {
      const x = xOf(i)
      const y = cumYOf(a.cumulative)
      stepSegs.push({ x0: Math.min(px, x), y0: py - 1.5, x1: Math.max(px, x), y1: py + 1.5 })
      stepSegs.push({ x0: x - 1.5, y0: Math.min(py, y), x1: x + 1.5, y1: Math.max(py, y) })
      px = x
      py = y
    })
  }
  const subjW = Math.max(
    measureLabel(subjectLabel1, `400 12px ${MONO}`, 400, 14).width,
    subjectLabel2 ? measureLabel(subjectLabel2, `700 12px ${MONO}`, 400, 14).width : 0,
  ) + 4
  // Box = the glyph boxes of both lines (baselines at +12 / +28); two lines
  // fit the band between the cumulative label (ends TOP_PAD + 1) and gridTop.
  const subjH = subjectLabel2 ? 33 : 17
  const subjectLate = subjectIdx >= 0 && subjectIdx >= nYears - 2
  const subjTopY = BASELINE_Y - subjectColH
  const leftX = subjectX - colW / 2 - 4 - subjW / 2
  const rightX = subjectX + colW / 2 + 4 + subjW / 2
  const besideY = Math.max(TOP_PAD + 2, subjTopY) + subjH
  const beside = [
    { id: 'left', x: leftX, y: besideY, width: subjW, height: subjH, above: 0 },
    { id: 'right', x: rightX, y: besideY, width: subjW, height: subjH, above: 0 },
  ]
  const bandLeft = isMobile && gridLabelBoxes[0] ? gridLabelBoxes[0].x1 + 6 : PAD_L
  const bandX = Math.min(Math.max(subjectX, bandLeft + subjW / 2), width - subjW / 2)
  const subjPlaced = subjectIdx >= 0
    ? placeLabels(
        [
          ...(subjectLate ? beside : []),
          { id: 'above', x: subjectX, y: subjTopY, width: subjW, height: subjH, above: 6 },
          ...(subjectLate ? [] : beside),
          // the band between TOP_PAD and gridTop (= subjH) — nothing rises into it
          { id: 'above-high', x: subjectX, y: TOP_PAD + 1 + subjH, width: subjW, height: subjH, above: 0 },
          // anywhere in that band clear of the gridline label, nearest the column
          { id: 'band', x: bandX, y: TOP_PAD + 1 + subjH, width: subjW, height: subjH, above: 0 },
          { id: 'left-low', x: leftX, y: BASELINE_Y - 4, width: subjW, height: subjH, above: 0 },
          { id: 'right-low', x: rightX, y: BASELINE_Y - 4, width: subjW, height: subjH, above: 0 },
        ],
        [...colRects, cumBox, ...gridLabelBoxes, ...stepSegs],
        { x0: 0, y0: TOP_PAD, x1: width, y1: BASELINE_Y },
      )[0] ?? null
    : null
  const subjLabel = subjPlaced
    ? {
        x: subjPlaced.align === 'center' ? (subjPlaced.box.x0 + subjPlaced.box.x1) / 2 : subjPlaced.align === 'left' ? subjPlaced.box.x0 : subjPlaced.box.x1,
        top: subjPlaced.box.y0,
        anchor: (subjPlaced.align === 'center' ? 'middle' : subjPlaced.align === 'left' ? 'start' : 'end') as 'middle' | 'start' | 'end',
        leader: subjPlaced.id === 'above' || subjPlaced.id === 'above-high'
          || (subjPlaced.id === 'band' && subjectX >= subjPlaced.box.x0 && subjectX <= subjPlaced.box.x1),
      }
    : { x: subjectX, top: subjTopY - 6 - subjH, anchor: 'middle' as const, leader: true }

  const yearRows = openYear != null ? aggs.find((a) => a.year === openYear) : null
  const drillInRows = useMemo(() => {
    if (openYear == null) return []
    return rows
      .filter((r) => {
        const d = dateOf(r)
        const year = r.contract_year ?? d?.getUTCFullYear()
        return year === openYear
      })
      .sort((a, b) => (b.amount_mxn ?? 0) - (a.amount_mxn ?? 0))
  }, [rows, openYear])
  const showSyntheticInYear = openYear === subjectYear && !subjectInRows

  const allRows = useMemo(() => [...rows].sort((a, b) => (b.amount_mxn ?? 0) - (a.amount_mxn ?? 0)), [rows])

  const figureStyle: CSSProperties = { padding: '12px 0 0', borderTop: '1px solid var(--color-text-primary)' }
  const caption = (
    <figcaption
      className="mt-2 pt-2"
      style={{
        borderTop: '1px solid var(--color-border)',
        fontFamily: 'var(--font-serif)',
        fontSize: '13px',
        lineHeight: 1.5,
        color: 'var(--color-text-secondary, var(--color-text-muted))',
      }}
    >
      {captionProse}
      {captionProse && !captionProse.trim().endsWith('.') ? '.' : ''}
    </figcaption>
  )

  // Two or three contracts are a ledger, not a chart (contract § G7): 550px
  // of plate for two bars said less than three rows do.
  if (pairTotal > 0 && pairTotal <= 3 && allRows.length > 0) {
    return (
      <figure className="relative" style={figureStyle} data-pair-ledger-rows>
        <div className="divide-y divide-border/30">
          {!subjectInRows && pairRank != null && (
            <RegisterRow rank={pairRank} c={subject as unknown as ContractListItem} isSubject sectorAccent={sectorAccent} lang={lang} />
          )}
          {allRows.map((c, i) => (
            <RegisterRow key={c.id} rank={i + 1} c={c} isSubject={c.id === subject.id} sectorAccent={sectorAccent} lang={lang} />
          ))}
        </div>
        {caption}
      </figure>
    )
  }

  return (
    <figure className="relative" style={figureStyle}>

      {/* The register toggle takes the kicker's row (the section header
          already names the plate) — one row instead of two (contract § G7). */}
      <button
        type="button"
        onClick={() => setAllOpen((v) => !v)}
        aria-expanded={allOpen}
        aria-controls="pair-register"
        className="min-h-6 rounded-sm font-mono hover:opacity-70 transition-opacity cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1"
        style={{ fontSize: 12, color: 'var(--color-accent-text)', background: 'none', border: 'none', padding: 0 }}
      >
        {allOpen
          ? (isEs ? '⌃ Ocultar el registro' : '⌃ Hide the register')
          : (isEs ? `⌄ Ver los ${pairTotal.toLocaleString('es-MX')} contratos` : `⌄ See the ${pairTotal.toLocaleString('en-US')} contracts`)}
      </button>

      <div ref={containerRef} className="relative w-full">
        <svg
          width={width}
          height={HEIGHT}
          viewBox={`0 0 ${width} ${HEIGHT}`}
          role="img"
          aria-label={ariaLabel}
          style={{ display: 'block' }}
        >
          {/* peso gridlines — shared linear axis */}
          <g>
            <line x1={PAD_L} x2={plotRight} y1={gridTop} y2={gridTop} stroke="var(--color-text-muted)" strokeWidth={1} strokeDasharray="3,3" opacity={0.5} />
            {!isMobile && (
              <line x1={PAD_L} x2={plotRight} y1={gridMid} y2={gridMid} stroke="var(--color-text-muted)" strokeWidth={1} strokeDasharray="3,3" opacity={0.35} />
            )}
            {gridLabels.map((g) => (
              <text
                key={g.y}
                data-grid
                x={isMobile ? PAD_L + 2 : PAD_L - 4}
                y={isMobile ? g.y - 4 : g.y + 4}
                textAnchor={isMobile ? 'start' : 'end'}
                fontFamily={MONO}
                fontSize={12}
                fill="var(--color-text-muted)"
                paintOrder="stroke"
                stroke="var(--color-background)"
                strokeWidth={3}
              >
                {g.text}
              </text>
            ))}
          </g>

          {/* baseline */}
          <line x1={PAD_L} x2={plotRight} y1={BASELINE_Y} y2={BASELINE_Y} stroke="var(--color-border)" strokeWidth={1} />

          {/* year columns */}
          {aggs.map((a, i) => {
            const x = xOf(i)
            const h = colHOf(a.sum)
            const isSubjectCol = a.year === subjectYear
            const capColor = a.level === 'critical' || a.level === 'high' ? RISK_COLORS[a.level] : ZINC
            const isHover = hoverYear === a.year
            const isOpen = openYear === a.year
            return (
              <g key={a.year}>
                <rect
                  x={x - colW / 2}
                  y={BASELINE_Y - h}
                  width={colW}
                  height={h}
                  fill={ZINC}
                  opacity={isHover || isOpen ? 0.42 : 0.3}
                />
                {a.sum > 0 && (
                  <rect x={x - colW / 2} y={BASELINE_Y - h} width={colW} height={3} fill={capColor} opacity={0.9} />
                )}
                {isSubjectCol && (
                  <rect
                    x={x - colW / 2}
                    y={BASELINE_Y - sliceH}
                    width={colW}
                    height={sliceH}
                    fill={sectorAccent}
                    opacity={0.95}
                  />
                )}
              </g>
            )
          })}

          {/* cumulative step-line — column scale, or its own labelled right axis */}
          {registerComplete && stepPath && (
            <>
              <path d={stepPath} fill="none" stroke={OCHRE} strokeWidth={1.5} opacity={0.85} />
              {!sharedScale && (
                <g data-cum-axis>
                  {/* Own axis line with its two ticks (0 / total); the total's
                      value is the cumulative label above the top tick — no
                      gridline ever prints two numbers (D12c § Change 3, N5). */}
                  <line x1={plotRight + 4} x2={plotRight + 4} y1={BASELINE_Y - MAX_H} y2={BASELINE_Y} stroke="var(--color-accent-hover)" strokeWidth={1} opacity={0.6} />
                  <line x1={plotRight + 1} x2={plotRight + 7} y1={BASELINE_Y - MAX_H} y2={BASELINE_Y - MAX_H} stroke="var(--color-accent-hover)" strokeWidth={1} opacity={0.8} />
                  <line x1={plotRight + 4} x2={plotRight + 4} y1={TOP_PAD + 2} y2={BASELINE_Y - MAX_H} stroke="var(--color-accent-hover)" strokeWidth={0.75} strokeDasharray="1,2" opacity={0.6} />
                  <text x={plotRight + 8} y={BASELINE_Y + 4} textAnchor="start" fontFamily={MONO} fontSize={12} fill="var(--color-accent-hover)">
                    0
                  </text>
                </g>
              )}
              <text
                data-cumulative-label
                x={cumLabelX}
                y={TOP_PAD - 17}
                textAnchor={cumAnchorRight ? 'end' : 'start'}
                fontFamily={MONO}
                fontSize={12.5}
                fontWeight={700}
                fill="var(--color-accent-hover)"
                paintOrder="stroke"
                stroke="var(--color-background)"
                strokeWidth={3}
              >
                {cumLabelText}
              </text>
              <text
                data-cumulative-label
                x={cumLabelX}
                y={TOP_PAD - 2}
                textAnchor={cumAnchorRight ? 'end' : 'start'}
                fontFamily={MONO}
                fontSize={12}
                letterSpacing={0.08}
                fill="var(--color-accent-hover)"
                paintOrder="stroke"
                stroke="var(--color-background)"
                strokeWidth={3}
              >
                {cumWord}
              </text>
            </>
          )}

          {/* subject leader + label, seated by placeLabels */}
          {subjectIdx >= 0 && (
            <g data-subject-label data-seat={subjPlaced?.id ?? 'fallback'}>
              {subjLabel.leader && (
                <line
                  x1={subjectX}
                  x2={subjectX}
                  y1={subjTopY}
                  y2={subjLabel.top + subjH}
                  stroke="var(--color-accent)"
                  strokeWidth={0.75}
                  opacity={0.5}
                />
              )}
              <text
                x={subjLabel.x}
                y={subjLabel.top + 12}
                textAnchor={subjLabel.anchor}
                fontFamily={MONO}
                fontSize={12}
                fill="var(--color-text-secondary)"
                paintOrder="stroke"
                stroke="var(--color-background)"
                strokeWidth={3}
              >
                {subjectLabel1}
              </text>
              {subjectLabel2 && (
                <text
                  x={subjLabel.x}
                  y={subjLabel.top + 28}
                  textAnchor={subjLabel.anchor}
                  fontFamily={MONO}
                  fontSize={12}
                  fontWeight={700}
                  fill={RISK_TEXT_COLORS.critical}
                  paintOrder="stroke"
                  stroke="var(--color-background)"
                  strokeWidth={3}
                >
                  {subjectLabel2}
                </text>
              )}
            </g>
          )}

          {/* hit targets — one per year column, keyboard + pointer */}
          {aggs.map((a, i) => (
            <rect
              key={`hit-${a.year}`}
              x={PAD_L + i * slotW}
              y={TOP_PAD}
              width={slotW}
              height={BASELINE_Y - TOP_PAD + 20}
              fill="transparent"
              onPointerEnter={() => setHoverYear(a.year)}
              onPointerLeave={() => setHoverYear((v) => (v === a.year ? null : v))}
              onClick={() => setOpenYear((v) => (v === a.year ? null : a.year))}
              style={{ cursor: 'pointer' }}
            />
          ))}
        </svg>

        {/* pointer tooltip */}
        {hoverYear != null && (
          <div
            className="pointer-events-none absolute z-10 rounded-sm border border-border bg-background px-2.5 py-2 text-[13px] shadow-lg"
            style={{
              left: Math.min(Math.max(xOf(aggs.findIndex((a) => a.year === hoverYear)), 90), width - 90),
              top: 4,
              transform: 'translateX(-50%)',
              fontFamily: MONO,
              minWidth: 150,
            }}
            role="status"
          >
            {(() => {
              const a = aggs.find((x) => x.year === hoverYear)
              if (!a) return null
              return (
                <p className="text-text-primary">
                  {a.year} · {a.count.toLocaleString(isEs ? 'es-MX' : 'en-US')} {isEs ? 'contratos' : 'contracts'} · {formatCompactMXN(a.sum)}
                </p>
              )
            })()}
          </div>
        )}

        {/* Year axis — the tick labels ARE the drill-in buttons (D12b § 4f).
            Every year gets a button; thinned years keep a hairline tick and
            an sr-only label. */}
        <div role="group" aria-label={isEs ? 'Años del par' : 'Years of the pair'}>
          {aggs.map((a, i) => {
            const labelled = i === 0 || ((aggs.length - 1 - i) % tickEvery === 0 && i >= tickEvery)
            const isOpen = openYear === a.year
            return (
              <button
                key={a.year}
                type="button"
                data-year-tick
                aria-expanded={isOpen}
                aria-label={labelled ? undefined : String(a.year)}
                onClick={() => setOpenYear((v) => (v === a.year ? null : a.year))}
                onPointerEnter={() => setHoverYear(a.year)}
                onPointerLeave={() => setHoverYear((v) => (v === a.year ? null : v))}
                className="absolute font-mono tabular-nums rounded-sm cursor-pointer hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1"
                style={{
                  // ≥ 24×24 target even when the year slot is narrower (390)
                  left: xOf(i) - Math.max(24, slotW) / 2,
                  width: Math.max(24, slotW),
                  top: BASELINE_Y + 4,
                  height: 24,
                  fontSize: 12,
                  lineHeight: '24px',
                  textAlign: 'center',
                  padding: 0,
                  background: isOpen ? `${sectorAccent}14` : 'transparent',
                  border: isOpen ? `1px solid ${sectorAccent}` : '1px solid transparent',
                  color: isOpen ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                }}
              >
                {labelled ? a.year : <span aria-hidden="true" style={{ display: 'inline-block', width: 1, height: 6, background: 'var(--color-border)', verticalAlign: 'top', marginTop: 2 }} />}
              </button>
            )
          })}
        </div>
      </div>

      {/* fused year drill-in */}
      {openYear != null && yearRows && (
        <div className="mt-2 border border-border rounded-sm overflow-hidden">
          <div
            className="px-3 py-1.5 font-mono flex items-baseline justify-between"
            style={{ fontSize: 13, color: 'var(--color-text-muted)', borderBottom: '1px solid var(--color-border)' }}
          >
            <span>
              {openYear} · {yearRows.count.toLocaleString(isEs ? 'es-MX' : 'en-US')} {isEs ? 'contratos' : 'contracts'}
              {drillInRows.length + (showSyntheticInYear ? 1 : 0) < yearRows.count
                ? (isEs ? ` · se listan ${drillInRows.length + (showSyntheticInYear ? 1 : 0)} de los 100 mayores del par` : ` · ${drillInRows.length + (showSyntheticInYear ? 1 : 0)} listed from the pair's 100 largest`)
                : ''}
            </span>
            <span>{formatCompactMXN(yearRows.sum)}</span>
          </div>
          <div className="max-h-[240px] overflow-y-auto divide-y divide-border/30">
            {showSyntheticInYear && pairRank != null && (
              <RegisterRow rank={pairRank} c={subject as unknown as ContractListItem} isSubject sectorAccent={sectorAccent} lang={lang} />
            )}
            {drillInRows.map((c, i) => (
              <RegisterRow key={c.id} rank={i + 1} c={c} isSubject={c.id === subject.id} sectorAccent={sectorAccent} lang={lang} />
            ))}
          </div>
        </div>
      )}

      {/* all-years register — toggled from the plate's top row */}
      <div id="pair-register">
        {allOpen && (
          <div className="mt-2 border border-border rounded-sm overflow-hidden">
            {allRows.length > 0 ? (
              <div className="max-h-[420px] overflow-y-auto divide-y divide-border/30">
                {!subjectInRows && pairRank != null && (
                  <>
                    <RegisterRow rank={pairRank} c={subject as unknown as ContractListItem} isSubject sectorAccent={sectorAccent} lang={lang} />
                    <div className="px-3 py-1 text-center font-mono" style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                      ⋮ {isEs ? 'mayores del par' : 'largest of the pair'}
                    </div>
                  </>
                )}
                {allRows.map((c, i) => (
                  <RegisterRow key={c.id} rank={i + 1} c={c} isSubject={c.id === subject.id} sectorAccent={sectorAccent} lang={lang} />
                ))}
              </div>
            ) : (
              <div className="px-3 py-6 text-center font-mono" style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
                {isEs ? 'Sin contratos comparables.' : 'No comparable contracts.'}
              </div>
            )}
          </div>
        )}
      </div>

      <figcaption
        className="mt-2 pt-2"
        style={{
          borderTop: '1px solid var(--color-border)',
          fontFamily: 'var(--font-serif)',
          fontSize: '13px',
          lineHeight: 1.5,
          color: 'var(--color-text-secondary, var(--color-text-muted))',
        }}
      >
        {captionProse}
        {captionProse && !captionProse.trim().endsWith('.') ? '.' : ''}
        {!registerComplete && pairTotal <= 100
          ? (isEs ? ' Línea acumulada omitida — registro incompleto.' : ' Cumulative line omitted — incomplete register.')
          : ''}
      </figcaption>
    </figure>
  )
}

// ── RegisterRow — grafted verbatim (RelationSection.tsx L130–186) ──────────
function RegisterRow({
  rank,
  c,
  isSubject,
  sectorAccent,
  lang,
}: {
  rank: number
  c: ContractListItem
  isSubject: boolean
  sectorAccent: string
  lang: 'en' | 'es'
}) {
  const isEs = lang === 'es'
  const flags: string[] = []
  if (c.is_direct_award) flags.push(isEs ? 'AD' : 'DA')
  if (c.is_single_bid) flags.push(isEs ? 'UP' : 'SB')
  const year = c.contract_year ?? (c.contract_date ? new Date(c.contract_date).getUTCFullYear() : '—')

  const inner = (
    <div
      className="flex items-baseline gap-3 px-3 py-1.5"
      style={{
        borderLeft: `2px solid ${isSubject ? sectorAccent : 'transparent'}`,
        background: isSubject ? `${sectorAccent}0f` : undefined,
      }}
    >
      <span className="font-mono tabular-nums flex-shrink-0" style={{ fontSize: 13, color: 'var(--color-text-muted)', minWidth: 38 }}>
        #{rank}
      </span>
      <span className="font-mono tabular-nums flex-shrink-0" style={{ fontSize: 13, color: 'var(--color-text-secondary)', minWidth: 36 }}>
        {year}
      </span>
      <span
        className="font-mono tabular-nums flex-1 text-right"
        style={{ fontSize: 12, color: isSubject ? sectorAccent : 'var(--color-text-primary)', fontWeight: isSubject ? 700 : 400 }}
      >
        {formatCompactMXN(c.amount_mxn ?? 0)}
      </span>
      <span className="font-mono flex-shrink-0" style={{ fontSize: 13, letterSpacing: '0', color: 'var(--color-text-muted)', minWidth: 44, textAlign: 'right' }}>
        {flags.join(' ')}
      </span>
      {isSubject && (
        <span className="font-mono flex-shrink-0" style={{ fontSize: 13, letterSpacing: '0', color: sectorAccent, fontWeight: 700 }}>
          {isEs ? '◀ este' : '◀ this'}
        </span>
      )}
    </div>
  )

  if (isSubject) return inner
  return (
    <Link to={`/contracts/${c.id}`} className="block hover:bg-background-elevated transition-colors focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-[-2px]">
      {inner}
    </Link>
  )
}
