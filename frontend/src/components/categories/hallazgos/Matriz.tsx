/**
 * «La huella» — the glyph matrix: 16 categories × 2010–2025 + ComprasMX. Square = most of the year's money
 * with no tender (darker = larger share), circle = tendered, size = the year's money against the row's own peak.
 * HTML rows (so names are real entity links); one SVG glyph per cell. Rows of a finding wear its hue and
 * link to their chapter; the rest are ink. Entrance: the glyphs sweep in by year, once (≤ 1 s).
 */
import { formatCompactMXN } from '@/lib/utils'
import { formatVendorName } from '@/lib/vendor/formatName'
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import { pct, type Lang, type Model } from '@/lib/categories/hallazgosModel'
import { HUE } from './charts'

const SEX: [number, number, string][] = [[2010, 2012, 'Calderón'], [2013, 2018, 'Peña Nieto'], [2019, 2024, 'AMLO'], [2025, 2025, 'Sheinbaum']]
const ROMAN = ['I', 'II', 'III', 'IV']

export function Matriz({ m, lang, phone, hues, chapters }: { m: Model; lang: Lang; phone: boolean; hues: Record<number, string>; chapters: Record<number, number> }) {
  const en = lang === 'en'
  const years = phone ? [2022, 2023, 2024, 2025] : Array.from({ length: 16 }, (_, k) => 2010 + k)
  const size = phone ? [14, 8] : [10, 10]
  const cols = `${phone ? 'minmax(0,1.9fr)' : 'minmax(0,220px) 96px'} repeat(${years.length}, minmax(0,${phone ? '0.36fr' : '1fr'})) 10px minmax(0,${phone ? '0.36fr' : '1fr'})${phone ? '' : ' 236px'}`
  const glyph = (mval: number, da: number | null, peak: number, color: string, op: number, title: string, k: number) => {
    if (!mval || da == null) return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="1.5" className="nil" /></svg>
    const s = size[0] + size[1] * Math.sqrt(mval / peak)
    return (
      <svg viewBox="0 0 24 24" style={{ ['--k' as string]: k }} className="gl">
        <title>{title}</title>
        {da >= 0.5
          ? <rect x={12 - s / 2} y={12 - s / 2} width={s} height={s} style={{ fill: color }} fillOpacity={op * (0.3 + 0.7 * da)} />
          : <circle cx="12" cy="12" r={s / 2} fill="none" style={{ stroke: color }} strokeWidth={1.5} strokeOpacity={op} />}
      </svg>
    )
  }
  return (
    <div className="hz-mx" role="table" aria-label={en
      ? `Sixteen categories by year (${phone ? '2022–2025' : '2010–2025'} and ComprasMX): square = most of the money with no tender, circle = tendered; size = the year’s money against the row’s peak`
      : `Dieciséis categorías por año (${phone ? '2022–2025' : '2010–2025'} y ComprasMX): cuadrado = la mayor parte del dinero sin concurso, círculo = con concurso; tamaño = dinero del año respecto al tope de la fila`}>
      {!phone && (
        <div className="hz-mx-sex" style={{ gridTemplateColumns: cols }} aria-hidden="true">
          <span className="k">{en ? 'category · money 2023–25' : 'categoría · dinero 2023–25'}</span><span />
          {SEX.map((c, i) => <span key={c[2]} className={i % 2 === 0 ? 'band on' : 'band'} style={{ gridColumn: `span ${c[1] - c[0] + 1}` }}>{c[1] - c[0] >= 2 ? c[2] : ''}</span>)}
          <span /><span className="birmex"><i style={{ background: HUE.birmex }} />BIRMEX</span>
          <span className="k r">{en ? 'largest supplier in 2025' : 'mayor proveedor en 2025'}</span>
        </div>
      )}
      <div className="hz-mx-row hd" role="row" style={{ gridTemplateColumns: cols }}>
        <span role="columnheader"><span className="sr-only">{en ? 'Category' : 'Categoría'}</span></span>
        {!phone && <span role="columnheader"><span className="sr-only">{en ? 'Money 2023–25' : 'Dinero 2023–25'}</span></span>}
        {years.map((y, k) => <span role="columnheader" key={y} className={!phone && k % 2 ? 'yr odd' : 'yr'}>{phone ? `’${String(y).slice(2)}` : y}</span>)}
        <span aria-hidden="true" />
        <span role="columnheader" className="yr">MX{phone && <i className="sw" style={{ background: HUE.birmex }} title="BIRMEX" />}</span>
        {!phone && <span role="columnheader"><span className="sr-only">{en ? 'Largest supplier 2025' : 'Mayor proveedor 2025'}</span></span>}
      </div>
      {m.p.matrix.map((r, i) => {
        const hue = hues[r.cat], color = hue ?? 'var(--color-text-primary)', op = hue ? 1 : 0.55
        const name = m.catName(r.cat, lang)
        const peak = Math.max(...r.cells.map((c) => c[0]), r.mx[0] || 0)
        const ch = chapters[r.cat]
        const tip = (y: string, mv: number, da: number | null) => `${name} · ${y} · ${formatCompactMXN(mv)}${da != null ? ` · ${pct(da, lang)} ${en ? 'no tender' : 'sin concurso'}` : ''}`
        const vname = r.top ? m.vendorName(r.top.v) : null
        const sup = r.top && (
          <span className={r.top.share >= 0.4 ? 'sup b' : 'sup'}>
            <span className="n">{pct(r.top.share, lang)}</span>{' '}
            {vname && r.top.v != null
              ? <EntityIdentityChip type="vendor" id={r.top.v} name={vname} variant="name" className="hz-link">{formatVendorName(vname, 40)}</EntityIdentityChip>
              : <span>{en ? 'no name in the register' : 'sin nombre en el registro'}</span>}
            {m.isPF(r.top.v) && <span>{en ? ' · individual' : ' · persona física'}</span>}
          </span>
        )
        return (
          <div key={r.cat} className={hue ? 'hz-mx-row on' : 'hz-mx-row'} role="row" style={{ gridTemplateColumns: cols, ['--i' as string]: i }}>
            <span role="rowheader" className="nm">
              <EntityIdentityChip type="category" id={r.cat} name={name} variant="name" className="hz-link" style={hue ? { color: 'var(--color-text-primary)', fontWeight: 600 } : undefined}>{name}</EntityIdentityChip>
              {hue && <i className="sw" style={{ background: hue }} aria-hidden="true" />}
              {ch != null && <a className="ch" href={`#hal-${ch + 1}`} aria-label={en ? `Open finding ${ch + 1}` : `Abrir el hallazgo ${ch + 1}`}>§ {ROMAN[ch]}</a>}
              {phone && sup}
            </span>
            {!phone && <span role="cell" className="mn">{formatCompactMXN(r.m2325)}</span>}
            {years.map((y, k) => { const c = r.cells[y - 2010]; return <span role="cell" key={y} className={!phone && SEX.findIndex((s) => y >= s[0] && y <= s[1]) % 2 === 0 ? 'cell band' : 'cell'}>{glyph(c[0], c[1], peak, color, op, tip(String(y), c[0], c[1]), k)}</span> })}
            <span aria-hidden="true" className="seam" />
            <span role="cell" className="cell">{glyph(r.mx[0], r.mx[1], peak, r.cat === 20 ? HUE.birmex : color, r.cat === 20 ? 1 : op, tip('ComprasMX 2025–26', r.mx[0], r.mx[1]), years.length)}</span>
            {!phone && <span role="cell">{sup}</span>}
          </div>
        )
      })}
    </div>
  )
}
