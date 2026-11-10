/**
 * W7 «risk contracts first» (owner 2026-11-06): under the year's risk contracts, ONE quiet object for the year —
 * the twelve months as one continuous strip, no frames, no slabs. Only the critical share is drawn: a thin red line
 * through each month's share of pesos in contracts with indicador de riesgo ≥ 0.60 (0–100 %, honest scale), over a
 * dashed ink line at the year's share. Month labels small; a month is a button that filters the board above (?m=).
 * The stray weeks past the record's cut are not a month: no point, the line breaks.
 */
import { critShare, fullMonth, type MonthSignals } from '@/lib/sexenios/columna'
import { pctLabel } from './ColumnObject'

type Lang = 'es' | 'en'
const H = 56 // drawing height in px; y = H − share·H

export function MonthLine({ sig, month, onMonth, lang }: { sig: MonthSignals; month: number | null; onMonth: (m: number) => void; lang: Lang }) {
  const L = (es: string, en: string) => (lang === 'es' ? es : en)
  const loc = lang === 'es' ? 'es-MX' : 'en-US'
  const name = (m: number, f: 'long' | 'short' | 'narrow') => new Intl.DateTimeFormat(loc, { month: f }).format(new Date(2001, m - 1, 1)).replace('.', '')
  const pts = sig.months.map((m) => ({ m, c: fullMonth(m, sig) ? critShare(m) : null }))
  const avg = sig.crit_share ?? 0
  const top = pts.reduce<(typeof pts)[number] | null>((a, b) => (b.c != null && (a?.c == null || b.c > a.c) ? b : a), null)
  // one polyline per run of real months (the line breaks where a month is missing)
  const runs: string[] = []
  let cur: string[] = []
  pts.forEach((p, i) => {
    if (p.c == null) { if (cur.length) runs.push(cur.join(' ')); cur = []; return }
    cur.push(`${(i + 0.5) * 100},${H - p.c * H}`)
  })
  if (cur.length) runs.push(cur.join(' '))

  return (
    <div className="sxl">
      <div className="sxl-plot">
        <svg className="sxl-svg" viewBox={`0 0 1200 ${H}`} preserveAspectRatio="none" aria-hidden="true">
          <line className="sxl-base" x1="0" x2="1200" y1={H} y2={H} />
          <line className="sxl-avg" x1="0" x2="1200" y1={H - avg * H} y2={H - avg * H} />
          {runs.map((r) => <polyline key={r} className="sxl-line" points={r} />)}
        </svg>
        <ol className="sxl-months" aria-label={L(`${sig.year}, mes por mes: toque un mes para filtrar los contratos`, `${sig.year}, month by month: tap a month to filter the contracts`)}>
          {pts.map(({ m, c }) => {
            const on = month === m.month
            const show = c != null && (on || m === top?.m)
            const label = `${name(m.month, 'long')} ${sig.year}: ${c == null
              ? (m.contracts ? L('muy poco dinero para leer este mes (p. ej., tras el corte del registro)', 'too little money to read this month (e.g. after the record’s cut-off)') : L('sin contratos', 'no contracts'))
              : `${pctLabel(c, lang)} ${L('de los pesos en contratos críticos', 'of the pesos in critical contracts')}, ${m.crit_n.toLocaleString(loc)} ${L('contratos críticos', 'critical contracts')}`}`
            return (
              <li key={m.month}>
                <button type="button" className="sxl-m" data-month={m.month} aria-pressed={on} disabled={c == null} onClick={() => onMonth(m.month)} aria-label={label} title={label}>
                  <span className="sxl-track" aria-hidden="true">
                    {c != null && <i className="sxl-pt" style={{ bottom: `${100 * c}%` }}>{show && <b>{pctLabel(c, lang)}</b>}</i>}
                  </span>
                  <span className="sxl-lbl" aria-hidden="true"><span className="sxl-wide">{name(m.month, 'short')}</span><span className="sxl-narrow">{name(m.month, 'narrow')}</span></span>
                </button>
              </li>
            )
          })}
        </ol>
      </div>
      <p className="sxl-key" aria-hidden="true">
        <span><i className="sxl-key-line" />{L('pesos de cada mes en contratos críticos (≥ 0.60)', 'each month’s pesos in critical contracts (≥ 0.60)')}</span>
        <span><i className="sxl-key-avg" />{L(`el año: ${pctLabel(avg, lang)}`, `the year: ${pctLabel(avg, lang)}`)}</span>
      </p>
    </div>
  )
}
