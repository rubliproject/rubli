/**
 * SkyDiff — «Qué cambió / What changed». Spec .claude/designus/atlas-instruments-2026-10-03/spec-draft.md §3.4,
 * §2.5, F1, F3, F6, F19. Precedent: the blink comparator read as NYT shift arrows on fixed positions.
 * Two native selects (an ordered pair of sexenios), then the pure `periodDiff` result: money A → B, the
 * institution-wide supplier counts, arrivals · departures · stays among the drawn bodies (top 10 as fly rows),
 * the largest share swings among stays only, and the footnotes (successor, decline dagger, the term in progress).
 * A star that stopped reporting is refused — no counts, no marks. The plate's marks are drawn by the engine from
 * the same result; nothing here moves a body. Withheld bodies print their public label (F16).
 */
import type { CSSProperties, ReactElement } from 'react'
import { formatCompactMXN, formatNumber } from '@/lib/utils'
import { formatEntityName } from '@/lib/entity/format'
import { skyCopy } from '@/lib/atlas/sky/copy'
import { withheldLabel } from '@/lib/atlas/sky/catalog'
import type { SkyManifest } from '@/lib/atlas/sky/geometry'
import { yearsLabel, type DiffRow, type PeriodDiff } from '@/lib/atlas/sky/period-diff'
import { PERIOD_KEYS, periodName, type PeriodKey } from '@/lib/atlas/sky/url-state'
import { FONT_MONO, FONT_SERIF } from './SkyLabels'

const kicker: CSSProperties = { fontFamily: 'var(--font-sc)', fontWeight: 600, fontSize: 12, letterSpacing: 'var(--track-sc)', color: 'var(--color-text-muted)' }
const mono: CSSProperties = { fontFamily: FONT_MONO, fontSize: 12, lineHeight: 1.45, color: 'var(--color-text-secondary)' }
const note: CSSProperties = { fontFamily: FONT_MONO, fontSize: 12, lineHeight: 1.45, color: 'var(--color-text-muted)' }
const RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1'
const TOP = 10

interface Props {
  manifest: SkyManifest
  star: number
  diff: PeriodDiff | null
  lang: 'en' | 'es'
  onPair: (a: PeriodKey, b: PeriodKey) => void
  onFlyBody: (vendorId: number) => void
  onFlyStar: (idx: number) => void
  phone?: boolean
  /** the twin plate's spine: no selects (the plate owns the pair) */
  bare?: boolean
}

/** The footnotes shared by the dock tab and the twin plate's spine: successor, daggers, the term in progress. */
export function DiffNotes({ manifest, starId, diff, lang, onFlyStar }: { manifest: SkyManifest; starId: number; diff: PeriodDiff; lang: 'en' | 'es'; onFlyStar: (idx: number) => void }) {
  const S = manifest.stars
  const ix = (id: number) => S.id.indexOf(id)
  const label = (id: number) => { const i = ix(id); return i < 0 ? `INS ${id}` : S.siglas[i] || formatEntityName('institution', S.name[i], 'sm') }
  const loc = lang === 'en' ? 'en-US' : 'es-MX'
  const rows: ReactElement[] = []
  const succ = diff.successor
  if (succ) {
    const j = ix(succ.to)
    rows.push(
      <div key="succ" style={note}>
        {skyCopy('successor', lang, { a: label(starId), b: label(succ.to), y: succ.year })}
        {j >= 0 && <> · <button type="button" onClick={() => onFlyStar(j)} className={RING} style={{ ...note, color: 'var(--color-accent)', background: 'none', border: 0, padding: 0, cursor: 'pointer' }}>{skyCopy('flyTo', lang, { b: label(succ.to) })}</button></>}
      </div>,
    )
  }
  // the successor line replaces this star's own dagger
  const daggers = diff.daggers.filter((d) => !(succ && d.star === starId))
  for (const d of daggers.slice(0, 4)) {
    rows.push(<div key={`d${d.star}`} style={note}>{d.successor != null
      ? skyCopy('successor', lang, { a: label(d.star), b: label(d.successor), y: d.year ?? '' })
      : skyCopy('dagger', lang, { siglas: d.star === starId ? label(d.star) : `${label(d.star)} · INS ${d.star}`, A: periodName(diff.A), B: periodName(diff.B) })}</div>)
  }
  if (daggers.length > 4) rows.push(<div key="dm" style={note}>{skyCopy('diffMore', lang, { n: daggers.length - 4 })}</div>)
  if (diff.current) {
    const f = (n: number) => n.toLocaleString(loc, { maximumFractionDigits: 2 })
    rows.push(<div key="cur" style={note}>{skyCopy('partial', lang)} · {skyCopy('sheinbaum', lang, { a: f(diff.current.lenA), b: f(diff.current.lenB) })}</div>)
  }
  return rows.length ? <div style={{ display: 'grid', gap: 4, padding: '8px 0', borderTop: '1px solid var(--color-border)' }}>{rows}</div> : null
}

export function SkyDiff({ manifest, star, diff, lang, onPair, onFlyBody, onFlyStar, phone, bare }: Props) {
  const S = manifest.stars
  const loc = lang === 'en' ? 'en-US' : 'es-MX'
  const who = S.siglas[star] || formatEntityName('institution', S.name[star], 'sm')
  const pct = (v: number) => (v < 0.0001 ? '< 0.01%' : `${(v * 100).toLocaleString(loc, { maximumFractionDigits: v < 0.01 ? 2 : 1 })}%`)
  const nm = (r: DiffRow) => (r.public ? formatEntityName('vendor', r.name, 'full') : withheldLabel(r.vendor_id, lang))
  const sel: CSSProperties = { fontFamily: FONT_MONO, fontSize: 12, minHeight: phone ? 44 : 28, padding: '0 6px', background: 'var(--color-background-card)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border)' }

  const selects = !bare && diff && (
    <div role="group" aria-label={skyCopy('diffPair', lang)} className="flex flex-wrap items-center gap-2" style={{ padding: '10px 0', borderBottom: '1px solid var(--color-border)' }}>
      <label style={kicker} className="flex items-center gap-2">{skyCopy('diffFrom', lang)}
        <select value={diff.A} onChange={(e) => onPair(e.target.value as PeriodKey, diff.B)} className={RING} style={sel}>
          {PERIOD_KEYS.map((p) => <option key={p} value={p} disabled={p === diff.B}>{periodName(p)}</option>)}
        </select>
      </label>
      <label style={kicker} className="flex items-center gap-2">{skyCopy('diffTo', lang)}
        <select value={diff.B} onChange={(e) => onPair(diff.A, e.target.value as PeriodKey)} className={RING} style={sel}>
          {PERIOD_KEYS.map((p) => <option key={p} value={p} disabled={p === diff.A}>{periodName(p)}</option>)}
        </select>
      </label>
    </div>
  )

  const flyRow = (r: DiffRow, money: number, extra?: string) => bare ? (
    <li key={r.vendor_id} style={{ borderBottom: '1px solid var(--color-border)', padding: '4px 0' }}>
      <span style={{ display: 'block', fontFamily: r.public ? FONT_SERIF : FONT_MONO, fontSize: r.public ? 14 : 12, lineHeight: 1.25, color: r.public ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>{nm(r)}</span>
      <span style={mono}>{formatCompactMXN(money)}{extra ? ` · ${extra}` : ''}</span>
    </li>
  ) : (
    <li key={r.vendor_id}>
      <button type="button" onClick={() => onFlyBody(r.vendor_id)} className={RING}
        style={{ display: 'block', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', borderBottom: '1px solid var(--color-border)', padding: '5px 0', minHeight: phone ? 44 : 0, cursor: 'pointer' }}>
        <span style={{ display: 'block', fontFamily: r.public ? FONT_SERIF : FONT_MONO, fontSize: r.public ? 14 : 12, lineHeight: 1.25, color: r.public ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>{nm(r)}</span>
        <span style={mono}>{formatCompactMXN(money)}{extra ? ` · ${extra}` : ''}</span>
      </button>
    </li>
  )
  const block = (title: string, rows: DiffRow[], money: (r: DiffRow) => number) => rows.length > 0 && (
    <section style={{ paddingTop: 10 }}>
      <div style={kicker}>{title}</div>
      <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>{rows.slice(0, TOP).map((r) => flyRow(r, money(r)))}</ol>
      {rows.length > TOP && <div style={note}>{skyCopy('diffMore', lang, { n: formatNumber(rows.length - TOP) })}</div>}
    </section>
  )

  if (!diff) return <div className={phone ? 'py-3' : 'p-4'} style={note}>{skyCopy('diffNeedYears', lang)}</div>
  const nA = periodName(diff.A), nB = periodName(diff.B)
  const sumOf = (rows: DiffRow[], k: 'a' | 'b') => rows.reduce((t, r) => t + r[k], 0)

  return (
    <div style={{ overflowY: 'auto', flex: 1, minHeight: 0, padding: bare ? 0 : phone ? '0 16px 16px' : '0 16px 22px' }}>
      {selects}
      {diff.refused ? (
        <div style={{ padding: '12px 0' }}>
          <div style={{ fontFamily: FONT_SERIF, fontSize: 15, lineHeight: 1.35, color: 'var(--color-text-primary)' }}>
            {skyCopy('diffRefuse', lang, {
              // the missing years always; the 2019–22 coverage note only when no declared successor explains the stop
              B: `${periodName(diff.refused.period)}${diff.refused.years.length ? `: ${yearsLabel(diff.refused.years)}` : ''}`,
              nota: diff.refused.coverage && !diff.successor ? skyCopy('diffRefuseNote', 'es') : '', note: diff.refused.coverage && !diff.successor ? skyCopy('diffRefuseNote', 'en') : '',
            })}
          </div>
        </div>
      ) : (
        <>
          <section style={{ padding: '10px 0', borderBottom: '1px solid var(--color-border)' }}>
            <div style={kicker}>{skyCopy('diffMoney', lang, { star: who })}</div>
            <div style={{ fontFamily: FONT_MONO, fontSize: 13, color: 'var(--color-text-primary)', marginTop: 2 }}>
              {nA} {formatCompactMXN(diff.moneyA)} → {nB} {formatCompactMXN(diff.moneyB)}
              {diff.moneyA > 0 && ` · ${diff.moneyB >= diff.moneyA ? '+' : '−'}${Math.abs((diff.moneyB / diff.moneyA - 1) * 100).toLocaleString(loc, { maximumFractionDigits: 0 })}%`}
            </div>
            {diff.nvA != null && diff.nvB != null && <div style={mono}>{skyCopy('diffNv', lang, { a: formatNumber(diff.nvA), b: formatNumber(diff.nvB) })}</div>}
          </section>
          <section style={{ padding: '10px 0', borderBottom: '1px solid var(--color-border)' }}>
            <div style={{ fontFamily: FONT_MONO, fontSize: 12, color: 'var(--color-text-primary)' }}>
              {skyCopy('diffCounts', lang, { a: formatNumber(diff.arrivals.length), d: formatNumber(diff.departures.length), s: formatNumber(diff.stays.length) })}
            </div>
            <div style={mono}>
              {skyCopy('diffDrawn', lang, { n: formatNumber(diff.nDrawn) })} · + {formatCompactMXN(sumOf(diff.arrivals, 'b'))} · − {formatCompactMXN(sumOf(diff.departures, 'a'))}
            </div>
            <div style={note}>{skyCopy('diffMarks', lang)}</div>
          </section>
          {(diff.up.length > 0 || diff.down.length > 0) && (
            <section style={{ paddingTop: 10 }}>
              <div style={kicker}>{skyCopy('diffStays', lang)}</div>
              <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {[...diff.up, ...diff.down].map((s) => flyRow(s, s.b, `${skyCopy('diffSwing', lang, {
                  a: pct(s.shareA), b: pct(s.shareB),
                  pp: `${s.dpp >= 0 ? '+' : '−'}${Math.abs(s.dpp).toLocaleString(loc, { maximumFractionDigits: 2 })}`,
                  dec: `${s.decades >= 0 ? '+' : '−'}${Math.abs(s.decades).toLocaleString(loc, { maximumFractionDigits: 2 })}`,
                })}${s.drawn ? '' : ` · ${skyCopy('diffSmall', lang)}`}`))}
              </ol>
              <div style={note}>{skyCopy('whisker', lang, { A: nA, B: nB })}</div>
            </section>
          )}
          {block(skyCopy('diffArrivals', lang, { B: nB }), diff.arrivals, (r) => r.b)}
          {block(skyCopy('diffDepartures', lang, { A: nA }), diff.departures, (r) => r.a)}
          <div style={{ ...note, paddingTop: 8 }}>{skyCopy('remainderOut', lang)}</div>
        </>
      )}
      <DiffNotes manifest={manifest} starId={S.id[star]} diff={diff} lang={lang} onFlyStar={onFlyStar} />
      <div style={{ ...note, padding: '6px 0', borderTop: '1px solid var(--color-border)' }}>{skyCopy('diffBasis', lang)}</div>
    </div>
  )
}
