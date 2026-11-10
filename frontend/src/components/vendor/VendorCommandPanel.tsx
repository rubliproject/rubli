/**
 * VendorRiskTrend — the vendor's yearly risk indicator (frontend/DESIGN.md §7), with the pattern kit (§7.p):
 * sexenio bands, «estimado» for 2002–2010 (Structure A), «sin dato» for years with no contracts, a foco on the peak,
 * and one reading sentence. (2026-11-04: its rates against the reference lines moved into «Frente a lo habitual»,
 * ModelReads.tsx.)
 */
import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { getRiskLevelFromScore } from '@/lib/constants'
import { Foco, PatternDefs, PatternSwatch, SexenioBands, patUrl } from '@/components/kit/patterns/Patterns'
import { ADMINISTRATIONS } from '@/lib/administrations'
import { WEAK_DATA_LAST_YEAR, peakReading } from '@/lib/vendor/modelReads'
import './modelreads.css'
import { ContractDrill, SecCite, useHot, useLayer } from '@/components/dossier/layers'

interface TimelinePoint { year: number; avg_risk_score?: number | null; avg_risk?: number | null }

export function VendorRiskTrend({ timeline, lang, vendorId, vendorName }: { timeline: TimelinePoint[]; lang: 'en' | 'es'; vendorId: number; vendorName: string }) {
  const en = lang === 'en'
  const trend = useMemo(
    () => timeline
      .map((p) => ({ year: p.year, avg: (p.avg_risk_score ?? p.avg_risk ?? null) as number | null }))
      .filter((p): p is { year: number; avg: number } => p.avg != null && Number.isFinite(p.avg))
      .sort((a, b) => a.year - b.year),
    [timeline],
  )
  const layer = useLayer()
  const peak = trend.length ? trend.reduce((m, p) => (p.avg > m.avg ? p : m), trend[0]) : null
  const open = layer.sec === 'anio' ? Number(layer.row) : null
  return (
    <section aria-labelledby="trend-title" data-sec="anio">
      <h3 id="trend-title" className="vd-h3">
        {en ? 'Risk indicator by year' : 'Indicador de riesgo por año'}
        {peak && (
          <SecCite sec="anio" lang={lang} text={en
            ? `${vendorName}: its yearly mean risk indicator peaked at ${peak.avg.toFixed(2)} in ${peak.year} (RUBLI, COMPRANET data).`
            : `${vendorName}: su indicador de riesgo promedio anual llegó a ${peak.avg.toFixed(2)} en ${peak.year} (RUBLI, datos COMPRANET).`} />
        )}
      </h3>
      <RiskTrend points={trend} en={en} open={open} onPick={(yr) => layer.toggle('anio', yr)} />
      {open != null && trend.some((p) => p.year === open) && (
        <ContractDrill sec="anio" row={open} lang={lang} onClose={layer.close} show="institution"
          filter={{ vendor_id: vendorId, year: open }}
          title={en ? `Its contracts in ${open}` : `Sus contratos en ${open}`} />
      )}
    </section>
  )
}

/** Proper names for the band labels (ADMINISTRATIONS.short drops the accents). */
const ADM_LABEL: Record<string, string> = { fox: 'Fox', calderon: 'Calderón', epn: 'Peña Nieto', amlo: 'López Obrador', sheinbaum: 'Sheinbaum' }

/** The yearly mean indicator as a ruled line on the gauge's scale (0 · .25 · .40 · .60 · 1), over sexenio bands. */
function RiskTrend({ points, en, open, onPick }: { points: Array<{ year: number; avg: number }>; en: boolean; open: number | null; onPick: (year: number) => void }) {
  const [hot, bind] = useHot()
  // Drawn at its own pixel width so the 12px ticks stay 12px (a viewBox would scale them below the floor at 390).
  const ref = useRef<HTMLElement>(null)
  const [W, setW] = useState(520)
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(240, Math.round(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  if (points.length < 2) {
    return <figure className="vd-trend" ref={ref}><p className="ct-note">{en ? 'Fewer than two years with contracts: no trend to draw.' : 'Menos de dos años con contratos: no hay tendencia que trazar.'}</p></figure>
  }
  const H = W < 500 ? 156 : 172, L = 32, R = 8, T = 24, B = 24  // phone: shorter (owner 2026-10-21 density); T holds the sexenio names
  const y0 = points[0].year, y1 = points[points.length - 1].year
  const x = (yr: number) => L + ((yr - y0) / Math.max(1, y1 - y0)) * (W - L - R)
  const y = (v: number) => T + (1 - Math.max(0, Math.min(1, v))) * (H - T - B)
  const half = (W - L - R) / Math.max(1, y1 - y0) / 2
  const bx = (yr: number) => Math.max(L, Math.min(W - R, x(yr) - half)) // left edge of a year's slot
  const step = Math.max(1, Math.ceil((y1 - y0) / 6))
  const years: number[] = []
  for (let yr = y0; yr <= y1; yr += step) years.push(yr)
  if (years[years.length - 1] !== y1) years.push(y1)
  // The end-anchored last label shifts ~14px left: drop a step tick that would collide with it.
  if (years.length > 2 && x(y1) - x(years[years.length - 2]) < 44) years.splice(years.length - 2, 1)
  const peak = points.reduce((m, p) => (p.avg > m.avg ? p : m), points[0])
  // runs of consecutive years: the line breaks where a year has no contracts (that slot is hatched «sin dato»)
  const runs: Array<typeof points> = []
  const gaps: Array<[number, number]> = []
  points.forEach((p, i) => {
    const prev = points[i - 1]
    if (!prev || p.year !== prev.year + 1) { runs.push([p]); if (prev) gaps.push([prev.year + 1, p.year - 1]) } else runs[runs.length - 1].push(p)
  })
  const weak = y0 <= WEAK_DATA_LAST_YEAR
  const axisY = H - B
  const terms = ADMINISTRATIONS.filter((a) => a.yearEnd >= y0 && a.yearStart <= y1)
  return (
    <figure className="vd-trend" ref={ref}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="group" aria-label={en
        ? `Yearly mean risk indicator, ${y0}–${y1}; peak ${peak.avg.toFixed(2)} in ${peak.year}`
        : `Indicador de riesgo promedio por año, ${y0}–${y1}; máximo ${peak.avg.toFixed(2)} en ${peak.year}`}>
        <PatternDefs uid={uid} kinds={['sin-dato', 'estimado']} />
        <SexenioBands x={bx} y={T} height={axisY - T} from={y0} to={y1} />
        {terms.map((a) => {
          const l = bx(Math.max(a.yearStart, y0)), r = bx(Math.min(a.yearEnd, y1) + 1), name = ADM_LABEL[a.key] ?? a.short
          return r - l >= name.length * 7 + 8 ? <text key={a.key} x={(l + r) / 2} y={14} textAnchor="middle" className="adm">{name}</text> : null
        })}
        {[0.25, 0.4, 0.6].map((t) => (
          <g key={t}>
            <line className={t === 0.6 ? 'th crit' : 'th'} x1={L} x2={W - R} y1={y(t)} y2={y(t)} />
            <text x={L - 4} y={y(t) + 4} textAnchor="end">{t.toFixed(2).replace(/^0/, '')}</text>
          </g>
        ))}
        {weak && <rect className="strip" x={bx(y0)} y={axisY - 6} width={bx(Math.min(WEAK_DATA_LAST_YEAR, y1) + 1) - bx(y0)} height={6} fill={patUrl(uid, 'estimado')} />}
        {gaps.map(([g0, g1]) => <rect key={g0} className="strip" x={bx(g0)} y={axisY - 6} width={bx(g1 + 1) - bx(g0)} height={6} fill={patUrl(uid, 'sin-dato')} />)}
        <line className="ax" x1={L} x2={W - R} y1={axisY} y2={axisY} />
        <text x={L - 4} y={axisY + 4} textAnchor="end">0</text>
        <text x={L - 4} y={T + 4} textAnchor="end">1</text>
        {/* the last year sits on the right edge: anchor it at its end or it is cut to «201» */}
        {years.map((yr) => <text key={yr} x={x(yr)} y={H - 4} textAnchor={yr === y1 ? 'end' : 'middle'}>{yr}</text>)}
        {runs.map((r) => r.length > 1 && <polyline key={r[0].year} className="ln" points={r.map((p) => `${x(p.year)},${y(p.avg)}`).join(' ')} />)}
        {points.map((p) => <circle key={p.year} className={`${getRiskLevelFromScore(p.avg) === 'critical' ? 'pt crit' : 'pt'}${p.year <= WEAK_DATA_LAST_YEAR ? ' is-weak' : ''}${hot === `y:${p.year}` || open === p.year ? ' is-hot' : ''}`} cx={x(p.year)} cy={y(p.avg)} r={3} />)}
        <Foco cx={x(peak.year)} cy={y(peak.avg)} r={16} />
        {/* L1 / L3: each year is a 20px target — hover lights its contracts in the ledger, a click opens them here */}
        {points.map((p) => (
          <circle
            key={`h${p.year}`} id={`dl-anio-${p.year}-t`} className="hit" cx={x(p.year)} cy={y(p.avg)} r={10}
            role="button" tabIndex={0} aria-expanded={open === p.year}
            aria-label={en ? `${p.year}: ${p.avg.toFixed(2)}. Open its contracts` : `${p.year}: ${p.avg.toFixed(2)}. Abrir sus contratos`}
            {...bind(`y:${p.year}`)}
            onClick={() => onPick(p.year)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(p.year) } }}
          ><title>{`${p.year} · ${p.avg.toFixed(2)}`}</title></circle>
        ))}
        {(() => {
          const h = points.find((p) => hot === `y:${p.year}`)
          return h ? <text x={Math.min(W - R, Math.max(L, x(h.year)))} y={Math.max(12, y(h.avg) - 10)} textAnchor={x(h.year) > W - 60 ? 'end' : 'middle'} className="hv">{`${h.year} · ${h.avg.toFixed(2)}`}</text> : null
        })()}
      </svg>
      <figcaption>
        <p className="vd-trend-read">{peakReading(points, en ? 'en' : 'es')}</p>
        <p className="mr-key">
          <span>{en ? 'Mean of its contracts each year; dashed: medium, high, critical; bands: presidential terms; rings: its highest year.' : 'Promedio de sus contratos cada año; punteadas: medio, alto, crítico; franjas: sexenios; anillos: su año más alto.'}</span>
          {weak && <span><PatternSwatch kind="estimado" /> {en ? '2002–2010, hollow dots: weak data' : '2002–2010, puntos huecos: dato débil'}</span>}
          {gaps.length > 0 && <span><PatternSwatch kind="sin-dato" /> {en ? 'no contracts that year' : 'sin contratos ese año'}</span>}
        </p>
      </figcaption>
    </figure>
  )
}
