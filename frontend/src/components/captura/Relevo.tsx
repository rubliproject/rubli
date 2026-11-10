/**
 * «El relevo» — /captura's object (concept A, _explore/captura_concepts_2026-10-27): the sexenio spine
 * with one ribbon = money to dominant suppliers of the year, stacked by the buyer's sector (energy at the bottom, so
 * the handover to health reads as one shape sliding under another), the ComprasMX column after the seam,
 * the numeral row (share of the buyers' spend that went to dominant suppliers) and a facts row.
 * Every band and every named buyer opens the in-page dissection (components/captura/Diseccion.tsx).
 * HTML owns the clickable words, SVG owns the geometry (measured px).
 */
import { useRef } from 'react'
import { useMeasuredWidth } from '@/hooks/useMeasuredWidth'
import { SECTORS, textInk } from '@/lib/constants'
import { smooth } from '@/lib/vendor/expediente'
import { CFE, IMSS, PEP, YEARS, type Relevo as Model, type Series } from '@/lib/captura/relevo'
import { lastYear, money, num, pct, type Lang } from '@/lib/captura/lectura'
import { useDissect } from './dissect'

const TOP = 44, FACT_ROW = 20
const secName = (s: Series, en: boolean) => {
  if (s.sector == null) return en ? 'other sectors' : 'otros sectores'
  const x = SECTORS.find((q) => q.id === s.sector)
  return x ? (en ? x.nameEN : x.name).toLowerCase() : '—'
}

type Fact = { y: number; label: string; inst?: number; mx?: boolean }

export function Relevo({ m, lang }: { m: Model; lang: Lang }) {
  const ref = useRef<HTMLDivElement>(null)
  const width = useMeasuredWidth(ref)
  const en = lang === 'en'
  const open = useDissect()
  const phone = width > 0 && width < 640

  const facts: Fact[] = []
  if (m.peak) facts.push({ y: m.peak.y, label: `${en ? 'peak' : 'tope'}: ${pct(m.peak.share, lang)}` })
  const pep = lastYear(m, PEP), cfe = lastYear(m, CFE), bp = m.buyerPeak(IMSS)
  if (pep != null) facts.push({ y: pep, label: en ? 'PEP: last year' : 'PEP: último año', inst: PEP })
  if (cfe != null) facts.push({ y: cfe, label: en ? 'CFE: last year' : 'CFE: último año', inst: CFE })
  if (bp && bp.share >= 0.4) facts.push({ y: bp.y, label: `IMSS: ${pct(bp.share, lang)}`, inst: IMSS })
  facts.push({ y: 2025, label: en ? 'blackout: 28 Sep' : 'cierre de CompraNet: 28 sep' })
  if (m.post > 0) facts.push({ y: 2026, label: en ? `${num(m.post, lang)} still signing · ${money(m.postM, lang)}` : `${num(m.post, lang)} siguen · ${money(m.postM, lang)}`, mx: true })
  facts.sort((a, b) => a.y - b.y)

  return (
    <div ref={ref} className="cr-relevo" style={width ? undefined : { minHeight: 420 }}>
      {width > 0 && (phone ? <Phone m={m} width={width} facts={facts} lang={lang} open={open} /> : <Desk m={m} width={width} facts={facts} lang={lang} open={open} />)}
    </div>
  )
}

type P = { m: Model; width: number; facts: Fact[]; lang: Lang; open: ReturnType<typeof useDissect> }

function geometry(m: Model, width: number, phone: boolean) {
  const L = phone ? 0 : 104, R = phone ? 30 : 150
  const span = width - L - R, cw = span / (YEARS.length + 0.9)
  const X = (y: number) => L + (y - 2002) * cw
  const XM = (y: number) => X(y) + cw / 2
  const RIB = phone ? 168 : 220
  const yRib = TOP, yAx = yRib + RIB
  const vmax = Math.max(1, ...YEARS.map((_, k) => m.series.reduce((s, x) => s + x.vals[k], 0)), m.postM)
  const yS = (v: number) => yAx - (v / vmax) * (RIB - 6)
  const base = YEARS.map(() => 0)
  const bands = m.series.map((s) => {
    const up: [number, number][] = [], dn: [number, number][] = []
    YEARS.forEach((y, k) => { const b = base[k], v = s.vals[k]; up.push([XM(y), yS(b + v)]); dn.push([XM(y), yS(b)]); base[k] = b + v })
    const k = YEARS.length - 1, mid = yS(base[k] - s.vals[k] / 2)
    return { s, d: `${smooth(up)} L${dn.reverse().map((p) => p.join(',')).join(' L')} Z`, mid, last: s.vals[k] }
  })
  const xMX = X(2026) + 4, wMX = phone ? 14 : 28
  const med = [...m.years.map((r) => r.total)].sort((a, b) => a - b)[Math.floor(m.years.length / 2)]
  const nums = m.years.map((r) => (r.total > 0.15 * med ? { s: String(Math.round(r.share * 100)), b: r.share >= 0.25 } : null))
  return { L, R, span, cw, X, XM, RIB, yRib, yAx, vmax, yS, bands, xMX, wMX, nums }
}

function Chapters({ m, g, H, phone, lang }: { m: Model; g: ReturnType<typeof geometry>; H: number; phone: boolean; lang: Lang }) {
  const en = lang === 'en'
  return <>{m.chapters.map((c, i) => {
    const x0 = g.X(c.a), w = g.X(c.b + 1) - x0, last = i === m.chapters.length - 1
    const ax = last ? g.X(c.b + 1) - 2 : x0 + 5, anchor = last ? 'end' : 'start'
    const name = phone ? c.name.split(' ')[0].replace('Sheinbaum', '25') : c.name
    return (
      <g key={c.key}>
        <rect className={i % 2 ? 'vd-exp-chap is-alt' : 'vd-exp-chap'} x={x0} y={0} width={w} height={H} />
        {/* a narrow last chapter right-aligns its label across its own start: its tick would cut the name («SHEINBA|UM») */}
        {!(last && w < 90) && <line className="vd-exp-cut" x1={x0 + 0.5} y1={2} x2={x0 + 0.5} y2={18} />}
        {(!phone || w > 30) && <>
          <text className="vd-exp-ch" x={ax} y={14} textAnchor={anchor}>{name}</text>
          <text className="vd-exp-chf" x={ax} y={32} textAnchor={anchor}>
            <tspan className="cr-b">{pct(c.share, lang)}</tspan>{!phone && w > 90 ? (en ? ' to dominant' : ' a dominantes') : ''}
          </text>
        </>}
      </g>
    )
  })}</>
}

function Bands({ g, lang, open }: { g: ReturnType<typeof geometry>; lang: Lang; open: P['open'] }) {
  const en = lang === 'en'
  return <>{g.bands.map(({ s, d }) => (
    <path key={s.sector ?? 0} d={d} fill={s.color} fillOpacity={0.85} className="cr-band"
      onClick={() => open({ sector: s.sector ?? 0 })}>
      <title>{`${secName(s, en)} · ${money(s.mAll, lang)} · ${num(s.nAll, lang)} ${en ? 'dominant suppliers' : 'proveedores dominantes'} (${num(s.nCur, lang)} ${en ? 'current' : 'vigentes'})`}</title>
    </path>
  ))}</>
}

function Desk({ m, width, facts, lang, open }: P) {
  const en = lang === 'en'
  const g = geometry(m, width, false)
  const yNum = g.yAx + 22, yFacts = yNum + 26
  // facts: greedy rows so no two labels overlap (mono 13 ≈ 7.8 px a character); right third end-anchored
  const rows: { f: Fact; row: number; x: number; end: boolean; x0: number; x1: number }[] = []
  const fx = (f: Fact) => (f.mx ? g.xMX + g.wMX / 2 : g.XM(f.y))
  facts.forEach((f, i) => {
    const x = fx(f), w = f.label.length * 7.8 + 10, next = facts[i + 1]
    // a label points away from the next fact when it would cover it (its leader would cross the label)
    const end = (next ? fx(next) - x < w + 8 : x > g.L + g.span * 0.62) && x - w >= g.L
    const x0 = end ? x - w : x, x1 = end ? x : x + w
    // a row where the label overlaps no label, its leader crosses no label above, and no leader below crosses it
    const row = [0, 1, 2, 3, 4].find((r) => rows.every((o) => (o.row !== r || o.x1 + 8 < x0 || x1 + 8 < o.x0)
      && (o.row >= r || x < o.x0 - 4 || x > o.x1 + 4) && (o.row <= r || o.x < x0 - 4 || o.x > x1 + 4))) ?? 4
    rows.push({ f, row, x, end, x0, x1 })
  })
  const FACTS = (Math.max(0, ...rows.map((r) => r.row)) + 1) * FACT_ROW + 6
  const H = yFacts + FACTS
  // keys at the right edge, beside their band at 2025; staggered ≥ 24 px apart (WCAG 2.5.8 target spacing)
  const keys = g.bands.filter((b) => b.last > 0 || b.s.nAll > 0).map((b) => ({ b, y: b.last > 0 ? b.mid : g.yAx - 4 }))
  keys.sort((a, b) => b.y - a.y)
  let floor = g.yAx + 6
  keys.forEach((k) => { k.y = Math.min(k.y, floor - 24); floor = k.y })
  return (
    <div className="cr-plot" style={{ height: H }}>
      <svg width={width} height={H} viewBox={`0 0 ${width} ${H}`} role="img"
        aria-label={en ? 'Money to dominant suppliers by year, stacked by the buyer’s sector, 2002–2025 and ComprasMX' : 'Dinero a dominantes por año, apilado por sector del comprador, 2002–2025 y ComprasMX'}>
        <Chapters m={m} g={g} H={H} phone={false} lang={lang} />
        <Bands g={g} lang={lang} open={open} />
        <line className="vd-exp-axis" x1={g.L} y1={g.yAx + 0.5} x2={g.X(2026)} y2={g.yAx + 0.5} />
        <line className="cg-seam" x1={g.X(2026) + 1} y1={TOP - 6} x2={g.X(2026) + 1} y2={g.yAx} />
        {YEARS.filter((y) => y % 4 === 2 || y === 2025).map((y) => <text key={y} className="vd-exp-yr" x={g.XM(y)} y={g.yAx + 15} textAnchor="middle">{y}</text>)}
        {m.postM > 0 && <>
          <rect x={g.xMX} y={g.yS(m.postM)} width={g.wMX} height={g.yAx - g.yS(m.postM)} className="cg-ink" />
          <text className="vd-exp-yr" x={g.xMX} y={g.yAx + 15}>MX</text>
        </>}
        <text className="cr-rowk" x={0} y={g.yRib + 12}>{en ? 'Money to dominant suppliers' : 'Dinero a dominantes'}</text>
        <text className="vd-exp-chf" x={0} y={g.yRib + 28}>{en ? 'top' : 'tope'} {money(g.vmax, lang)}</text>
        <text className="cr-rowk" x={0} y={yNum + 12}>{en ? '% to dominant' : '% a dominantes'}</text>
        {g.nums.map((n, k) => n && <text key={k} className={n.b ? 'vd-exp-ind' : 'vd-exp-yr'} x={g.XM(YEARS[k])} y={yNum + 12} textAnchor="middle">{n.s}</text>)}
        <text className="cr-rowk" x={0} y={yFacts + 13}>{en ? 'Facts' : 'Hechos'}</text>
        {rows.map(({ f, row, x }) => <line key={f.label} className="vd-exp-evl" x1={x} y1={yFacts - 2} x2={x} y2={yFacts + row * FACT_ROW + 16} />)}
      </svg>
      <div className="cr-keys" role="group" aria-label={en ? 'Sectors of the buyers' : 'Sectores de los compradores'}>
        {keys.map(({ b, y }) => (
          <button key={b.s.sector ?? 0} type="button" style={{ top: y - 9, left: g.xMX + g.wMX + 8, color: textInk(b.s.color) }}
            onClick={() => open({ sector: b.s.sector ?? 0 })}>
            <i style={{ background: b.s.color }} aria-hidden="true" />{secName(b.s, en)}
          </button>
        ))}
      </div>
      <div className="vd-exp-facts" style={{ top: yFacts, height: FACTS }}>
        {rows.map(({ f, row, x, end }) => (
          <span key={f.label} className={end ? 'is-end' : undefined} style={{ left: x, top: row * FACT_ROW + 2 }}>
            {f.inst ? <button type="button" className="cr-inst" onClick={() => open({ inst: f.inst! })}>{f.label}</button> : f.label}
          </span>
        ))}
      </div>
    </div>
  )
}

function Phone({ m, width, facts, lang, open }: P) {
  const en = lang === 'en'
  const g = geometry(m, width, true)
  const yNum = g.yAx + 22, H = yNum + 20
  return (
    <div>
      <svg width={width} height={H} viewBox={`0 0 ${width} ${H}`} role="img"
        aria-label={en ? 'Money to dominant suppliers by year, stacked by the buyer’s sector' : 'Dinero a dominantes por año, apilado por sector del comprador'}>
        <Chapters m={m} g={g} H={H} phone lang={lang} />
        <Bands g={g} lang={lang} open={open} />
        <line className="vd-exp-axis" x1={0} y1={g.yAx + 0.5} x2={g.X(2026)} y2={g.yAx + 0.5} />
        {[2002, 2010, 2018, 2025].map((y) => <text key={y} className="vd-exp-yr" x={g.XM(y)} y={g.yAx + 15} textAnchor="middle">{String(y).slice(2)}</text>)}
        {m.postM > 0 && <rect x={g.xMX} y={g.yS(m.postM)} width={g.wMX} height={g.yAx - g.yS(m.postM)} className="cg-ink" />}
        {g.nums.map((n, k) => n && YEARS[k] % 3 === 1 && <text key={k} className={n.b ? 'vd-exp-ind' : 'vd-exp-yr'} x={g.XM(YEARS[k])} y={yNum + 12} textAnchor="middle">{n.s}</text>)}
      </svg>
      <div className="cr-keys-ph">
        {g.bands.map(({ s }) => (
          <button key={s.sector ?? 0} type="button" onClick={() => open({ sector: s.sector ?? 0 })}>
            <i style={{ background: s.color }} aria-hidden="true" />{secName(s, en)}
          </button>
        ))}
      </div>
      <ul className="vd-exp-ph-facts" aria-label={en ? 'Facts' : 'Hechos'}>
        {facts.map((f) => (
          <li key={f.label}><span>{f.mx ? 'MX' : f.y}</span><span>{f.inst ? <button type="button" className="cr-inst" onClick={() => open({ inst: f.inst! })}>{f.label}</button> : f.label}</span></li>
        ))}
      </ul>
    </div>
  )
}
