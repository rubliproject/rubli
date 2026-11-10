/**
 * SkyDial — «El Cuadrante / The Dial». Spec .claude/designus/atlas-instruments-2026-10-03/spec-draft.md §3.2.
 * Precedent: the Stellarium info panel read as engraved rules. Pair-level readings («this supplier at this
 * star») on the orrery's own scales; every gauge prints its basis. Honesty rules from the audits
 * (instruments-first-data-encoding.md): co-bidding drawn only when non-zero, «único comprador» at 100%
 * dependence, Fuentes remainder = value / dep − host − Σ also (never total_amount_mxn), counts not % under 5
 * contracts, the withheld belt is not marked. Star dial: per-year HHI on the sky basis, 1 800 is a market
 * reference, not a verdict. Ghost dial and «Señales» are cut (no ghost state reaches the dock; §8).
 */
import type { CSSProperties, ReactNode } from 'react'
import { formatDualCurrency, formatNumber } from '@/lib/utils'
import { formatEntityName } from '@/lib/entity/format'
import { skyCopy } from '@/lib/atlas/sky/copy'
import { N_YEARS, YEAR0, type SkyManifest, type SkySystem, type SkySystemBody } from '@/lib/atlas/sky/geometry'
import { FONT_MONO, FONT_SERIF } from './SkyLabels'

interface Props {
  manifest: SkyManifest
  star: number
  system: SkySystem | null
  /** the focused planet's row at its host (Z2); null → the star dial */
  body: SkySystemBody | null
  lang: 'en' | 'es'
  year: number | null
  onYear: (y: number | null) => void
  /** Fuentes segments fly to their star (institution id) */
  onFlyStar: (instId: number) => void
  /** rule width: 340 in the dock, 358 on the phone sheet */
  w?: number
}

const LAST = YEAR0 + N_YEARS - 1
const SPANS: [number, number][] = [[2000, 2006], [2007, 2012], [2013, 2018], [2019, 2024], [2025, LAST]]
const HATCH = 'repeating-linear-gradient(135deg, var(--color-border) 0 1px, transparent 1px 4px)'
const kicker: CSSProperties = { fontFamily: 'var(--font-sc)', fontWeight: 600, fontSize: 12, letterSpacing: 'var(--track-sc)', color: 'var(--color-text-muted)' }
const basisSt: CSSProperties = { fontFamily: FONT_MONO, fontSize: 12, lineHeight: 1.4, color: 'var(--color-text-muted)', marginTop: 2 }
const value: CSSProperties = { fontFamily: FONT_MONO, fontSize: 12, color: 'var(--color-text-primary)' }

function Gauge({ label, read, basis, children }: { label: string; read?: ReactNode; basis: string; children?: ReactNode }) {
  return (
    <div style={{ padding: '9px 0', borderBottom: '1px solid var(--color-border)' }}>
      <div className="flex items-baseline justify-between gap-2">
        <span style={kicker}>{label}</span>
        {read != null && <span style={value}>{read}</span>}
      </div>
      {children && <div style={{ marginTop: 4 }}>{children}</div>}
      <div style={basisSt}>{basis}</div>
    </div>
  )
}

/** An engraved horizontal rule: baseline, ticks with labels under, an ochre ▼ at `at` (0–1) unless null. */
function Rule({ w, ticks, at, belt }: { w: number; ticks: [number, string][]; at: number | null; belt?: [number, string] }) {
  const X = (f: number) => 4 + f * (w - 8)
  return (
    <svg width={w} height={22} role="img" aria-hidden="true" style={{ display: 'block', overflow: 'visible' }}>
      <line x1={X(0)} x2={X(1)} y1={9} y2={9} stroke="var(--color-text-muted)" strokeWidth={1} />
      {ticks.map(([f, t]) => (
        <g key={t}>
          <line x1={X(f)} x2={X(f)} y1={6} y2={12} stroke="var(--color-text-muted)" strokeWidth={1} />
          <text x={X(f)} y={21} fontSize={10} fontFamily={FONT_MONO} fill="var(--color-text-muted)" textAnchor={f <= 0 ? 'start' : f >= 1 ? 'end' : 'middle'}>{t}</text>
        </g>
      ))}
      {belt && <line x1={X(belt[0])} x2={X(belt[0])} y1={2} y2={12} stroke="var(--color-accent)" strokeWidth={1} strokeDasharray="2 2"><title>{belt[1]}</title></line>}
      {at != null && <path d={`M${X(at) - 4},1 L${X(at) + 4},1 L${X(at)},8 Z`} fill="var(--color-accent)" />}
    </svg>
  )
}

export function SkyDial({ manifest, star, system, body, lang, year, onYear, onFlyStar, w = 340 }: Props) {
  const S = manifest.stars
  const loc = lang === 'en' ? 'en-US' : 'es-MX'
  const pct = (v: number, d = 1) => (v * 100).toLocaleString(loc, { maximumFractionDigits: d })
  const sys = system && system.star.id === S.id[star] ? system : null
  const siglas = S.siglas[star] || formatEntityName('institution', S.name[star], 'sm')
  const starIdx = new Map(S.id.map((id, i) => [id, i]))
  const starLabel = (inst: number) => { const i = starIdx.get(inst); return i == null ? `INS ${inst}` : S.siglas[i] || formatEntityName('institution', S.name[i], 'sm') }

  if (!sys) return <div className="p-4" style={kicker}>{skyCopy('loadingSystem', lang)}</div>

  const first = sys.star.first_data_year ?? null
  const head = (
    <div style={{ ...basisSt, padding: '8px 0 4px', borderBottom: '1px solid var(--color-border)' }}>{skyCopy('dialBasis', lang)}</div>
  )

  // ── planet dial ─────────────────────────────────────────────────────────
  if (body) {
    const b = body
    const withheld = !b.name
    // share: 5-decade log rule, 0.001% … 100% (the orrery radius unrolled); the 50% belt tick
    const lg = (s: number) => Math.min(1, Math.max(0, (Math.log10(Math.max(s, 1e-5)) + 5) / 5))
    const sole = b.dep >= 0.9995
    const total = b.dep > 0 ? b.value_mxn / b.dep : b.value_mxn
    const alsoSum = b.also.reduce((t, a) => t + a[1], 0)
    const rest = Math.max(0, total - b.value_mxn - alsoSum)
    const mine = sys.cobid.filter((c) => c[0] === b.vendor_id)
    const n = b.n_contracts_here
    const yx = (y: number) => 4 + ((y - YEAR0) / N_YEARS) * (w - 8)
    const yw = (w - 8) / N_YEARS
    return (
      <div style={{ padding: '0 16px', overflowY: 'auto', flex: 1, minHeight: 0 }}>
        {head}
        <Gauge
          label={skyCopy('dialShare', lang)}
          read={withheld && b.share >= 0.5 ? skyCopy('beltWithheld', lang) : `${pct(b.share, b.share < 0.01 ? 3 : 1)}%`}
          basis={skyCopy('dialShareBasis', lang, { star: siglas })}
        >
          <Rule w={w} at={lg(b.share)} ticks={[[lg(1e-5), '≤0.001'], [lg(1e-4), '0.01'], [lg(1e-3), '0.1'], [lg(1e-2), '1'], [lg(0.1), '10'], [1, '100%']]}
            belt={withheld ? undefined : [lg(0.5), skyCopy('dialBelt', lang)]} />
        </Gauge>
        <Gauge label={skyCopy('dialDep', lang)} read={sole ? skyCopy('soleBuyer', lang) : `${pct(b.dep)}%`} basis={skyCopy('dialDepBasis', lang, { star: siglas })}>
          <Rule w={w} at={sole ? null : b.dep} ticks={[[0, '0'], [0.5, '50'], [1, '100%']]} />
        </Gauge>
        <Gauge
          label={skyCopy('dialTenure', lang)}
          read={`${b.first_year <= 2002 ? '≤ 2002' : b.first_year}–${b.last_year}`}
          basis={first != null && b.first_year === first && first > 2002 ? `${skyCopy('sinceReports', lang, { y: first })} · ${skyCopy('dialTenureBasis', lang)}` : skyCopy('dialTenureBasis', lang)}
        >
          <svg width={w} height={22} aria-label={skyCopy('dialTenure', lang)} style={{ display: 'block', overflow: 'visible' }}>
            {SPANS.map(([a, z], k) => (
              <rect key={a} x={yx(a)} y={4} width={yw * (z - a + 1)} height={10} fill={k % 2 ? 'var(--color-background)' : 'var(--color-background-card)'} stroke="var(--color-border)" strokeWidth={1} />
            ))}
            {b.first_year === b.last_year
              ? <circle cx={yx(b.first_year) + yw / 2} cy={9} r={3} fill="var(--color-accent)" />
              : <line x1={yx(b.first_year) + yw / 2} x2={yx(b.last_year) + yw / 2} y1={9} y2={9} stroke="var(--color-accent)" strokeWidth={3} />}
            {year != null && <line x1={yx(year) + yw / 2} x2={yx(year) + yw / 2} y1={1} y2={17} stroke="var(--color-text-primary)" strokeWidth={1} />}
            {Array.from({ length: N_YEARS }, (_, k) => (
              <rect key={k} x={yx(YEAR0 + k)} y={0} width={yw} height={22} fill="transparent" style={{ cursor: 'pointer' }}
                onClick={() => onYear(year === YEAR0 + k ? null : YEAR0 + k)}><title>{skyCopy('railYear', lang, { y: YEAR0 + k })}</title></rect>
            ))}
            <text x={4} y={22} fontSize={10} fontFamily={FONT_MONO} fill="var(--color-text-muted)">2000</text>
            <text x={w - 4} y={22} fontSize={10} fontFamily={FONT_MONO} fill="var(--color-text-muted)" textAnchor="end">{LAST}</text>
          </svg>
        </Gauge>
        {b.n_also > 0 && (
          <Gauge label={skyCopy('dialSources', lang)} read={formatDualCurrency(total)} basis={skyCopy('dialSourcesBasis', lang)}>
            <div className="flex" style={{ width: w, height: 12, border: '1px solid var(--color-border)' }}>
              {[[S.id[star], b.value_mxn] as const, ...b.also.map((a) => [a[0], a[1]] as const)].map(([inst, v], k) => (
                <button key={inst} type="button" onClick={() => k > 0 && onFlyStar(inst)}
                  title={`${starLabel(inst)} · ${pct(v / total)}%`} aria-label={`${starLabel(inst)} · ${pct(v / total)}%`}
                  style={{ width: `${(v / total) * 100}%`, minWidth: 1, height: '100%', padding: 0, border: 'none', borderRight: '1px solid var(--color-background-card)', cursor: k > 0 ? 'pointer' : 'default',
                    background: k === 0 ? 'var(--color-accent)' : 'var(--color-text-muted)', opacity: k === 0 ? 1 : 0.6 - Math.min(0.35, k * 0.03) }} />
              ))}
              {rest > 0 && <span title={skyCopy('dialOthers', lang)} style={{ flex: 1, background: HATCH }} />}
            </div>
            <div style={{ ...basisSt, color: 'var(--color-text-secondary)' }}>
              {siglas} {pct(b.value_mxn / total)}% · {b.also.slice(0, 3).map((a) => `${starLabel(a[0])} ${pct(a[1] / total)}%`).join(' · ')}
              {rest > 0 ? ` · ${skyCopy('dialOthers', lang)} ${pct(rest / total)}%` : ''}
              {b.n_also > b.also.length ? ` · ${skyCopy('kinMore', lang, { n: formatNumber(b.n_also - b.also.length) })}` : ''}
            </div>
          </Gauge>
        )}
        {mine.length > 0 ? (
          <Gauge label={skyCopy('dialCobid', lang)} basis={skyCopy('cobidBasis', lang)} read={formatNumber(mine.length)}>
            <div style={{ ...value, color: 'var(--color-text-secondary)' }}>
              {skyCopy('dialCobidLine', lang, { n: mine.length, r: mine.filter((c) => c[3]).length, max: formatNumber(Math.max(...mine.map((c) => c[2]))) })}
            </div>
          </Gauge>
        ) : (
          <Gauge label={skyCopy('dialCobid', lang)} basis={skyCopy('cobidNone', lang)} />
        )}
        <Gauge
          label={skyCopy('dialContracts', lang)}
          read={n < 5 ? formatNumber(n) : undefined}
          basis={n < 5
            ? `${skyCopy('countsSmall', lang, { k: b.da_here, n })} · ${skyCopy('countsSmallSb', lang, { k: b.sb_here, n })}`
            : skyCopy('dialContractsLine', lang, { n: formatNumber(n), da: pct(b.da_here / n, 0), sb: pct(b.sb_here / n, 0) })}
        />
      </div>
    )
  }

  // ── star dial ───────────────────────────────────────────────────────────
  const rows = new Map((sys.years ?? []).map((r) => [r.year, r]))
  const gaps = new Set([...(manifest.meta?.year_gaps ?? []), ...(sys.star.gap_years ?? [])])
  const last = sys.star.last_data_year ?? null
  const H = 96, CW = 11, GAP = 2
  const yr = year != null ? rows.get(year) : undefined
  const bodies = new Map(sys.bodies.map((b) => [b.vendor_id, b]))
  const top = sys.ranked.map((v) => bodies.get(v)).find(Boolean)
  return (
    <div style={{ padding: '0 16px', overflowY: 'auto', flex: 1, minHeight: 0 }}>
      {head}
      <Gauge label={skyCopy('dialSpend', lang)} basis={first != null && last != null
        ? (sys.star.gap_years?.length ? skyCopy('dialCoverage', lang, { a: first, b: last, gaps: sys.star.gap_years.join(', ') }) : skyCopy('dialCoverageClean', lang, { a: first, b: last }))
        : skyCopy('dialNoYears', lang)}>
        <div style={{ fontFamily: FONT_SERIF, fontSize: 20, fontWeight: 600, color: 'var(--color-text-primary)' }}>{formatDualCurrency(S.v[star])}</div>
      </Gauge>
      {sys.years ? (
        <Gauge label={skyCopy('dialHhi', lang)} read={yr ? skyCopy('dialNvYear', lang, { y: yr.year, n: formatNumber(yr.n_vendors) }) : undefined} basis={`${skyCopy('hhiBasis', lang)} · ${skyCopy('hhiRef', lang)}`}>
          <div className="relative" style={{ width: N_YEARS * (CW + GAP) - GAP, height: H + 12 }}>
            <div aria-hidden="true" className="absolute" style={{ left: 0, right: 0, top: H - (1800 / 10_000) * H, borderTop: '1px dashed var(--color-text-muted)' }} title={skyCopy('hhiRef', lang)} />
            {Array.from({ length: N_YEARS }, (_, k) => {
              const y = YEAR0 + k, r = rows.get(y)
              const absent = gaps.has(y) || !r || (first != null && y < first) || (last != null && y > last)
              const thin = !absent && (r!.thin || r!.hhi == null)
              const tip = absent ? skyCopy(last != null && y > last ? 'starStopped' : 'starGap', lang, { y: last != null && y > last ? last + 1 : y })
                : thin ? skyCopy('hhiThin', lang, { x: pct(r!.top_share) }) : `${y} · HHI ${formatNumber(Math.round(r!.hhi!))} · ${skyCopy('dialNvYear', lang, { y, n: formatNumber(r!.n_vendors) })}`
              const h = absent ? H : thin ? 6 : Math.max(1, (r!.hhi! / 10_000) * H)
              return (
                <button key={y} type="button" aria-pressed={year === y} aria-label={tip} title={tip} onClick={() => onYear(year === y ? null : y)}
                  className="absolute" style={{ left: k * (CW + GAP), width: CW, top: 0, height: H + 12, padding: 0, border: 'none', background: 'transparent', cursor: 'pointer' }}>
                  <span aria-hidden="true" className="absolute" style={{
                    left: 0, right: 0, bottom: 12, height: h,
                    background: absent ? HATCH : thin ? 'transparent' : year === y ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                    border: thin ? '1px solid var(--color-text-muted)' : undefined,
                    outline: year === y ? '1px solid var(--color-text-primary)' : undefined, outlineOffset: 1,
                  }} />
                  {(k % 5 === 0 || y === LAST) && <span aria-hidden="true" className="absolute" style={{ ...basisSt, left: -4, bottom: -2, marginTop: 0 }}>{String(y).slice(2)}</span>}
                </button>
              )
            })}
          </div>
        </Gauge>
      ) : (
        <Gauge label={skyCopy('dialHhi', lang)} basis={skyCopy('dialNoYears', lang)} />
      )}
      <Gauge label={skyCopy('dialLargest', lang)} read={top ? `${pct(top.share)}%` : undefined}
        basis={sys.capture.length ? `${skyCopy('captureList', lang)}: ${formatNumber(sys.capture.length)}` : skyCopy('topShare', lang)} />
      <Gauge label={skyCopy('dialDrawn', lang)} basis={skyCopy('drawn', lang, { n: formatNumber(S.drawn[star]), N: formatNumber(S.np[star]), x: pct(S.rem[star]) })} />
      <Gauge label={skyCopy('dialHalo', lang)} basis={skyCopy('haloBasis', lang, { x: pct(S.h[star]), basis: /v[\d.]+/.exec(manifest.risk_basis)?.[0] ?? manifest.risk_basis })} />
    </div>
  )
}
