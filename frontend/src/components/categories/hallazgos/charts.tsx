/**
 * The six forms of /categories «Hallazgos» (port of the reviewed concept AC.html; dataviz form heuristic):
 * Medicina (share over time → connected dots, area = money, the ComprasMX cell past the seam) ·
 * Relevo (composition over time → one stacked stream + the ComprasMX column) · Duenos (before/after → slope) ·
 * Reglas (buyers along a share → positional strips) · Carriles (the drill: buyers × years).
 * The glyph matrix is HTML (Matriz.tsx) so its names can be real entity links.
 * Colour = CSS tokens only (index.css --color-cat-*); text wears ink tokens, never the series colour.
 */
import { formatCompactMXN } from '@/lib/utils'
import { formatVendorName } from '@/lib/vendor/formatName'
import { cien, pct, type Lang, type Model } from '@/lib/categories/hallazgosModel'

export const HUE = {
  med: 'var(--color-cat-blue)',
  birmex: 'var(--color-cat-cyan)',
  owner: 'var(--color-cat-violet)',
  rule: 'var(--color-cat-teal)',
  other: 'var(--color-ramp-ink-3)',
} as const
/** One hue per buyer, the same in every chart (II's stream and IV's strips): it follows the entity, never its rank.
 *  Stack order blue · brown · teal · violet · cyan passes the dataviz validator, light and dark. */
const BUYER: Record<number, string> = { 251: 'var(--color-cat-blue)', 3780: 'var(--color-cat-brown)', 228: 'var(--color-cat-teal)', 3744: 'var(--color-cat-violet)', 2066: HUE.birmex }
export const seriesHue = (id: number) => BUYER[id] ?? HUE.other

/** «Cómo leer esto» marker: the step's number, drawn ON the chart where that step points (anatomy callout). */
export function Pin({ x, y, n }: { x: number; y: number; n: number }) {
  return <g className="pin" aria-hidden="true"><circle cx={x} cy={y} r={9} /><text x={x} y={y + 4} textAnchor="middle">{n}</text></g>
}

const SEX: [number, number, string][] = [[2010, 2012, 'Calderón'], [2013, 2018, 'Peña Nieto'], [2019, 2024, 'AMLO'], [2025, 2025, 'Sheinbaum']]
const smooth = (pts: [number, number][]) => pts.map((p, i) => {
  if (i === 0) return `M${p[0]},${p[1]}`
  const q = pts[i - 1], dx = (p[0] - q[0]) / 2
  return `C${q[0] + dx},${q[1]} ${p[0] - dx},${p[1]} ${p[0]},${p[1]}`
}).join('')
const T = (es: string, en: string, lang: Lang) => (lang === 'es' ? es : en)
interface ChartProps { m: Model; w: number; lang: Lang; /** extra px the layout can give the plot (desktop rows) */ grow?: number }

// ── I · medicine: share of the year's money with no tender ──
export function Medicina({ m, w, lang, grow = 0 }: ChartProps) {
  const phone = w < 600, H = (phone ? 220 : 240) + grow
  const L = phone ? 36 : 40, R = phone ? 34 : 110, Tp = phone ? 30 : 44, B = 26, cw = (w - L - R) / 16.8
  const X = (y: number) => L + (y - 2010) * cw + cw / 2, Y = (s: number) => Tp + (1 - s) * (H - Tp - B)
  const xMX = L + 16.4 * cw + (phone ? 10 : 18)
  const ys = m.f1.years, mx = m.f1.mx, mmax = Math.max(...ys.map((r) => r.m), mx.m)
  const rad = (v: number) => (phone ? 3 : 4) + (phone ? 10 : 16) * Math.sqrt(v / mmax)
  const fed = ys.map((r): [number, number] => [X(r.y), Y(m.fedDa(r.y))])
  const rmx = rad(mx.m), sw = m.f1.switchYear
  return (
    <svg className="hz-g" viewBox={`0 0 ${w} ${H}`} width={w} height={H} role="img"
      aria-label={T('Medicamentos: parte del dinero del año adjudicada sin concurso, 2010–2025 y ComprasMX 2025–26', 'Medicines: share of each year’s money awarded with no tender, 2010–2025 and ComprasMX 2025–26', lang)}>
      {SEX.map((c, i) => {
        const x0 = L + (c[0] - 2010) * cw, cwid = (c[1] - c[0] + 1) * cw
        return <g key={c[2]}>{i % 2 === 0 && <rect className="chap" x={x0} y={Tp - 18} width={cwid} height={H - Tp + 18 - B} />}{cwid > 60 && <text className="ch" x={x0 + 4} y={Tp - 6}>{phone ? c[2].split(' ')[0] : c[2]}</text>}</g>
      })}
      {[0, 0.25, 0.5, 0.75, 1].map((s) => (
        <g key={s}><line className={s === 0.5 ? 'half' : 'grid'} x1={L} x2={xMX + 24} y1={Y(s)} y2={Y(s)} /><text className="labsm" x={L - 4} y={Y(s) + 4} textAnchor="end">{cien(s)}{s === 1 ? '%' : ''}</text></g>
      ))}
      <path d={smooth(fed)} className="ref" />
      <Pin n={3} x={X(2017)} y={Y(m.fedDa(2017)) + 13} />
      {!phone && <text className="lab mute" x={X(2025) + 8} y={Y(m.fedDa(2025)) + 4}>{T('todo el gobierno', 'all of government', lang)}</text>}
      <path d={smooth(ys.map((r): [number, number] => [X(r.y), Y(r.da)]))} className="line" style={{ stroke: HUE.med }} />
      {ys.map((r) => (
        <g key={r.y}>
          <g><title>{`${r.y} · ${pct(r.da, lang)} ${T('sin concurso', 'no tender', lang)} · ${formatCompactMXN(r.m)} · ${r.n.toLocaleString(lang === 'es' ? 'es-MX' : 'en-US')} ${T('contratos', 'contracts', lang)}`}</title><circle className="dot" cx={X(r.y)} cy={Y(r.da)} r={rad(r.m)} style={{ fill: HUE.med }} /></g>
          {(!phone || r.y % 3 === 0) && <text className={r.da >= 0.5 ? 'num b' : 'num mute'} x={X(r.y)} y={Y(r.da) - rad(r.m) - 4} textAnchor="middle">{cien(r.da)}</text>}
        </g>
      ))}
      {ys.filter((r) => r.y % (phone ? 4 : 2) === 0).map((r) => <text key={r.y} className="labsm" x={X(r.y)} y={H - B + 14} textAnchor="middle">{r.y}</text>)}
      <line className="seam" x1={xMX - 8} x2={xMX - 8} y1={Tp - 18} y2={H - B} />
      {mx.m > 0 && <>
        <g><title>{`ComprasMX 2025–26 · ${pct(mx.da, lang)} · ${formatCompactMXN(mx.m)}`}</title><circle cx={xMX + 10} cy={Y(mx.da)} r={rmx} className="ink-fill" /></g>
        <text className="num b" x={xMX + 10} y={Y(mx.da) - rmx - 4} textAnchor="middle">{cien(mx.da)}</text>
        {!phone && <><text className="lab" x={xMX + 16 + rmx} y={Y(mx.da) + 4}>ComprasMX</text><text className="labsm" x={xMX + 16 + rmx} y={Y(mx.da) + 18}>2025–26</text></>}
      </>}
      <text className="labsm" x={xMX + 10} y={H - B + 14} textAnchor="middle">MX</text>
      {(() => { const r14 = ys.find((r) => r.y === 2014); return r14 && <Pin n={1} x={X(2014) - rad(r14.m) - 12} y={Y(r14.da)} /> })()}
      {(() => { const rs = sw ? ys.find((r) => r.y === sw) : null; return rs && <Pin n={2} x={X(sw!) - rad(rs.m) - 12} y={Y(rs.da)} /> })()}
      {mx.m > 0 && <Pin n={4} x={xMX + 10 - rmx - 12} y={Y(mx.da)} />}
      {!phone && sw && <>
        <line className="evl" x1={X(sw)} x2={X(sw)} y1={Y(0.5) - 2} y2={Y(0.17)} />
        <text className="ev" x={X(sw) - 4} y={Y(0.14)} textAnchor="end">{T(`desde ${sw}: la mitad o más`, `from ${sw}: half or more`, lang)}</text>
      </>}
    </svg>
  )
}

// ── II · who buys the medicines ──
export function Relevo({ m, w, lang, grow = 0 }: ChartProps) {
  const phone = w < 600, H = (phone ? 220 : 220) + grow, S = m.f2.series
  const L = phone ? 0 : 56, R = phone ? 66 : 245, Tp = 30, B = 24, cw = (w - L - R) / 7.6
  const X = (k: number) => L + k * cw + cw / 2, xMX = L + 7.2 * cw + 10, wMX = phone ? 22 : 40
  const wG = phone ? 12 : 20, xC = xMX + wG + 6   // the ghost bar (BIRMEX 2002–25 in CompraNet), then the ComprasMX column
  const tot = [0, 1, 2, 3, 4, 5, 6].map((k) => S.reduce((a, s) => a + s.vals[k], 0)), mxT = S.reduce((a, s) => a + s.mx, 0)
  const life = m.f2.bir_life_m, vmax = Math.max(...tot, mxT, life), PH = H - Tp - B, Yv = (v: number) => Tp + PH - (v / vmax) * PH
  const label = (id: number) => (id === 0 ? T('otros compradores', 'other buyers', lang) : m.instShort(id))
  const base = [0, 0, 0, 0, 0, 0, 0]
  const bands = S.map((s) => {
    const up: [number, number][] = [], dn: [number, number][] = []
    s.vals.forEach((v, k) => { up.push([X(k), Yv(base[k] + v)]); dn.push([X(k), Yv(base[k])]); base[k] += v })
    return { s, d: `${smooth(up)} L${dn.reverse().map((q) => q.join(',')).join(' L')} Z` }
  })
  let acc = 0
  const col = S.map((s) => { const y0 = acc; acc += s.mx; return { s, y: Yv(y0 + s.mx), h: (s.mx / vmax) * PH, mid: Yv(y0 + s.mx / 2) } }).filter((c) => c.s.mx > 0)
  // keys at the right of the MX column, pushed apart
  let floor = Tp + PH + 2
  const keys = col.slice().sort((a, b) => b.mid - a.mid).map((c) => { const y = Math.max(Tp + 14, Math.min(c.mid, floor - 15)); floor = y; return { ...c, ky: y } })
  const ins = S.findIndex((s) => s.id === 3744)
  return (
    <>
      <svg className="hz-g" viewBox={`0 0 ${w} ${H}`} width={w} height={H} role="img"
        aria-label={T('Quién compra las medicinas: dinero por comprador y año, 2019–2025, y en ComprasMX 2025–26', 'Who buys the medicines: money by buyer and year, 2019–2025, and in ComprasMX 2025–26', lang)}>
        {bands.map(({ s, d }) => <g key={s.id}><title>{label(s.id)}</title><path d={d} className="band" style={{ fill: seriesHue(s.id) }} /></g>)}
        {col.map(({ s, y, h }) => <g key={s.id}><title>{`${label(s.id)} · ${formatCompactMXN(s.mx)} · ComprasMX`}</title><rect x={xC} y={y} width={wMX} height={h} className="band" style={{ fill: seriesHue(s.id) }} /></g>)}
        <line className="seam" x1={xMX - 6} x2={xMX - 6} y1={Tp} y2={Tp + PH} />
        <line className="base" x1={L} x2={xC + wMX} y1={Tp + PH} y2={Tp + PH} />
        {life > 0 && <g><title>{`BIRMEX · CompraNet ${m.f2.bir_life_y0}–2025 · ${formatCompactMXN(life)}`}</title><rect x={xMX} y={Yv(life)} width={wG} height={Tp + PH - Yv(life)} className="ghost" style={{ stroke: HUE.birmex }} /></g>}
        {tot.map((_t, k) => <text key={k} className="labsm" x={X(k)} y={Tp + PH + 14} textAnchor="middle">{2019 + k}</text>)}
        <text className="labsm" x={xC + wMX / 2} y={Tp + PH + 14} textAnchor="middle">MX</text>
        {!phone && <text className="num b" x={xC + wMX / 2} y={Tp - 6} textAnchor="middle">{formatCompactMXN(mxT)}</text>}
        {!phone && keys.map((k) => <g key={k.s.id}><rect x={xC + wMX + 8} y={k.ky - 5} width={9} height={9} style={{ fill: seriesHue(k.s.id) }} /><text className="key" x={xC + wMX + 22} y={k.ky + 4}>{k.s.id === 0 ? T('otros', 'others', lang) : label(k.s.id)} {formatCompactMXN(k.s.mx)}</text></g>)}
        {!phone && ins >= 0 && <><line className="evl" x1={X(2)} x2={X(2)} y1={Yv(tot[2]) - 16} y2={Yv(tot[2]) - 2} /><text className="key" x={X(2)} y={Yv(tot[2]) - 20} textAnchor="middle">{T('INSABI, hasta 2023', 'INSABI, until 2023', lang)}</text></>}
        {S[0] && <Pin n={1} x={X(1)} y={Yv(S[0].vals[1] / 2)} />}
        {life > 0 && <Pin n={2} x={xMX + wG / 2} y={Yv(life) - 13} />}
        {(() => { const b = col.find((c) => c.s.id === 2066); return b && <Pin n={3} x={xC + wMX / 2} y={b.y - 13} /> })()}
        <Pin n={4} x={X(6) - 22} y={Yv(tot[6]) + 12} />
      </svg>
      <div className="hz-legend">{S.map((s) => <span key={s.id}><i style={{ background: seriesHue(s.id) }} />{label(s.id)}{phone && s.mx ? ` · MX ${formatCompactMXN(s.mx)}` : ''}</span>)}</div>
    </>
  )
}

// ── III · the largest supplier's share, 2019–24 against 2025 ──
export function Duenos({ m, w, lang, grow = 0, hi = 37 }: ChartProps & { hi?: number }) {
  const phone = w < 600, wide = w >= 900, H = (phone ? 300 : 240) + grow, rows = m.f3.rows
  const L = phone ? 48 : 250, R = phone ? 150 : 344, Tp = 30, B = 18, PH = H - Tp - B, x0 = L, x1 = w - R
  const top = Math.max(0.75, ...rows.map((r) => Math.max(r.share, r.share_before) + 0.05))
  const Y = (s: number) => Tp + (1 - s / top) * PH
  const story = new Set([hi])
  const stagger = (ys: { cat: number; y: number }[]) => { let floor = Tp + PH + 8; const out = new Map<number, number>(); ys.slice().sort((a, b) => b.y - a.y).forEach((it) => { const ly = Math.min(it.y, floor - 15); floor = ly; out.set(it.cat, ly) }); return out }
  const ll = stagger(rows.map((r) => ({ cat: r.cat, y: Y(r.share_before) }))), rl = stagger(rows.map((r) => ({ cat: r.cat, y: Y(r.share) })))
  const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)
  return (
    <svg className="hz-g" viewBox={`0 0 ${w} ${H}`} width={w} height={H} role="img"
      aria-label={T('Parte del dinero de la categoría que se queda su mayor proveedor, 2019–2024 contra 2025', 'Share of each category’s money kept by its largest supplier, 2019–2024 against 2025', lang)}>
      {[0, 0.25, 0.5, 0.75].map((s) => <line key={s} className="grid" x1={x0} x2={x1} y1={Y(s)} y2={Y(s)} />)}
      <line className="base" x1={x0} x2={x0} y1={Tp} y2={Tp + PH} /><line className="base" x1={x1} x2={x1} y1={Tp} y2={Tp + PH} />
      <text className="ch" x={x0} y={Tp - 12} textAnchor="middle">2019–24</text><text className="ch" x={x1} y={Tp - 12} textAnchor="middle">2025</text>
      <text className="labsm" x={x0 + 0.25 * (x1 - x0)} y={Y(0.5) - 4} textAnchor="middle">{T('la mitad', 'half', lang)}</text>
      <Pin n={1} x={x0 - 40} y={Tp - 16} /><Pin n={2} x={x1 - 28} y={Tp - 16} />
      {(() => { const f = rows.find((r) => r.cat === hi); return f && <Pin n={3} x={x0 + 0.7 * (x1 - x0)} y={Y(f.share_before + 0.7 * (f.share - f.share_before)) - 14} /> })()}
      {rows.map((r) => {
        const on = story.has(r.cat), c = on ? HUE.owner : 'var(--color-text-primary)'
        const vn = (formatVendorName(m.vendorName(r.v), phone ? 15 : 20) || T('sin nombre', 'no name', lang)) + (m.isPF(r.v) ? T(' · persona física', ' · individual', lang) : '')
        const full = `${m.catName(r.cat, lang)} · ${m.vendorName(r.v) ?? ''}${m.isPF(r.v) ? T(' · persona física', ' · individual', lang) : ''}`
        const right = phone ? (on ? vn : cut(m.catName(r.cat, lang), 14)) : vn   // BLUE simplify: the supplier only; the category sits at the line's left end
        return (
          <g key={r.cat}>
            <line x1={x0} y1={Y(r.share_before)} x2={x1} y2={Y(r.share)} style={{ stroke: c }} strokeWidth={on ? 2.5 : 1.25} strokeOpacity={on ? 1 : 0.55} />
            {[[x0, r.share_before], [x1, r.share]].map(([x, s]) => <circle key={x} cx={x} cy={Y(s)} r={on ? 4.5 : 3} className="ring" style={{ fill: c }} />)}
            <text className={on ? 'num b' : 'num mute'} x={x0 - 8} y={(ll.get(r.cat) ?? 0) + 4} textAnchor="end">{pct(r.share_before, lang)}</text>
            {!phone && <text className={on ? 'lab' : 'lab mute'} x={x0 - 50} y={(ll.get(r.cat) ?? 0) + 4} textAnchor="end"><title>{full}</title>{cut(m.catName(r.cat, lang), wide ? 24 : 22)}</text>}
            <text className={on ? 'num b' : 'num'} x={x1 + 8} y={(rl.get(r.cat) ?? 0) + 4}>{pct(r.share, lang)}</text>
            <text className={on ? 'lab b' : 'lab mute'} x={x1 + 44} y={(rl.get(r.cat) ?? 0) + 4}><title>{full}</title>{right}</text>
          </g>
        )
      })}
    </svg>
  )
}

// ── IV · buyers of one category placed by their share without tender ──
const KEY = new Set([251, 228])   // IMSS, ISSSTE: the pair the finding compares
export function Reglas({ m, w, lang, grow = 0 }: ChartProps) {
  const phone = w < 600, S = m.f4, RH = phone ? 64 : Math.max(48, 54 + Math.floor(grow / Math.max(1, S.length))), H = S.length * RH + 24
  const L = phone ? 0 : 160, R = phone ? 10 : 30, x = (s: number) => L + s * (w - L - R)
  const mmax = Math.max(...S.flatMap((s) => s.rows.map((r) => r.m)))
  const rad = (v: number) => 3 + 9 * Math.sqrt(v / mmax)
  const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)
  return (
    <svg className="hz-g" viewBox={`0 0 ${w} ${H}`} width={w} height={H} role="img"
      aria-label={T('Para cada categoría, sus compradores colocados según la parte de su dinero adjudicada sin concurso', 'For each category, its buyers placed by the share of their money awarded with no tender', lang)}>
      {[0, 0.25, 0.5, 0.75, 1].map((s) => <g key={s}><line className={s === 0.5 ? 'half' : 'grid'} x1={x(s)} x2={x(s)} y1={14} y2={H - 10} /><text className="labsm" x={x(s)} y={10} textAnchor={s === 1 ? 'end' : s === 0 ? 'start' : 'middle'}>{cien(s)}{s === 1 ? '%' : ''}</text></g>)}
      {S.map((s, i) => {
        const yc = 24 + i * RH + RH / 2 + (phone ? 6 : 0), rows = s.rows.slice().sort((a, b) => b.m - a.m)
        const named = KEY; let lastx = -99
        return (
          <g key={s.cat}>
            {phone ? <text className="lab" x={0} y={24 + i * RH + 6}>{m.catName(s.cat, lang)}</text>
              : <><text className="lab" x={0} y={yc - 4}><title>{m.catName(s.cat, lang)}</title>{cut(m.catName(s.cat, lang), 20)}</text><text className="labsm" x={0} y={yc + 11}>{formatCompactMXN(s.m)} · 2019–25</text></>}
            <line className="range" x1={x(s.lo.da)} x2={x(s.hi.da)} y1={yc} y2={yc} />
            {rows.map((r) => <g key={r.id}><title>{`${m.instShort(r.id)} · ${pct(r.da, lang)} ${T('sin concurso', 'no tender', lang)} · ${formatCompactMXN(r.m)}`}</title><circle cx={x(r.da)} cy={yc} r={rad(r.m)} className="dot" style={{ fill: KEY.has(r.id) ? seriesHue(r.id) : HUE.other }} /></g>)}
            {i === 0 && <Pin n={1} x={x((s.lo.da + s.hi.da) / 2)} y={yc - 14} />}
            {i === 0 && rows.filter((r) => KEY.has(r.id)).map((r) => <Pin key={r.id} n={r.id === 251 ? 2 : 3} x={x(r.da)} y={yc + rad(r.m) + 13} />)}
            {rows.filter((r) => named.has(r.id)).sort((a, b) => a.da - b.da).map((r) => {
              const end = r.da > 0.8, xx = end ? x(r.da) - rad(r.m) - 4 : x(r.da) + rad(r.m) + 4
              const yy = Math.abs(x(r.da) - lastx) < 90 ? yc + rad(r.m) + 14 : yc - rad(r.m) - 5; lastx = x(r.da)
              return <text key={r.id} className="lab b" x={xx} y={yy} textAnchor={end ? 'end' : 'start'}>{m.instShort(r.id)} {pct(r.da, lang)}</text>
            })}
          </g>
        )
      })}
    </svg>
  )
}

// ── the drill: buyers × years (cell height ∝ money) ──
export function Carriles({ m, w, lang }: ChartProps) {
  const phone = w < 600, S = m.f2.series, RH = 22, L = phone ? 84 : 110, R = phone ? 78 : 100, H = S.length * RH + 20
  const cw = (w - L - R) / 8.4, X = (k: number) => L + k * cw
  const vmax = Math.max(...S.flatMap((s) => [...s.vals, s.mx]))
  const label = (id: number) => (id === 0 ? T('otros', 'others', lang) : m.instShort(id))
  return (
    <svg className="hz-g" viewBox={`0 0 ${w} ${H}`} width={w} height={H} role="img" aria-label={T('Compradores de medicinas por año', 'Medicine buyers by year', lang)}>
      {[0, 1, 2, 3, 4, 5, 6].map((k) => <text key={k} className="labsm" x={X(k) + cw / 2} y={10} textAnchor="middle">{String(2019 + k).slice(2)}</text>)}
      <text className="labsm" x={X(7.4) + cw / 2} y={10} textAnchor="middle">MX</text>
      <text className="labsm" x={w} y={10} textAnchor="end">{T('total 2019–26', 'total 2019–26', lang)}</text>
      {S.map((s, i) => {
        const y = 16 + i * RH
        return (
          <g key={s.id}>
            <rect x={0} y={y + 6} width={8} height={8} style={{ fill: seriesHue(s.id) }} />
            <text className="lab b" x={12} y={y + 14}>{label(s.id)}</text>
            {[...s.vals, null, s.mx].map((v, k) => {
              if (v == null) return null
              const xx = k === 8 ? X(7.4) : X(k), h = v ? 3 + 15 * Math.sqrt(v / vmax) : 0
              return v
                ? <g key={k}><title>{`${label(s.id)} · ${k === 8 ? 'ComprasMX' : 2019 + k} · ${formatCompactMXN(v)}`}</title><rect x={xx + 1} y={y + 10 - h / 2} width={cw - 2} height={h} style={{ fill: seriesHue(s.id) }} fillOpacity={k === 8 ? 1 : 0.75} /></g>
                : <line key={k} className="grid" x1={xx + 3} x2={xx + cw - 3} y1={y + 10} y2={y + 10} />
            })}
            <text className="num mute" x={w} y={y + 14} textAnchor="end">{formatCompactMXN(s.vals.reduce((a, b) => a + b, 0) + s.mx)}</text>
          </g>
        )
      })}
      <line className="seam" x1={X(7.2)} x2={X(7.2)} y1={0} y2={H} />
    </svg>
  )
}
