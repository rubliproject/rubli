/**
 * «La lectura» for the institution dossier (owner 2026-10-27): the claims its vendor × year
 * cells support. Each claim is COMPUTED and renders only when its condition holds; nothing
 * is written per institution. Pure: the expediente model in, claim tokens out.
 */
import type { Expediente } from '@/lib/vendor/expediente'
import type { Figure, Inst, Token } from '@/lib/vendor/lectura'
import { formatCompactMXN } from '@/lib/utils'

export interface Claim { key: 'concentration' | 'largest' | 'daShift' | 'oneTerm'; es: Token[]; en: Token[] }
/** «El mayor del año, por sexenio»: the vendor that led the most years of each sexenio. */
export interface Leader { chapter: string; inst: Inst; years: number; of: number; share: number }

const CRIT = 0.6
const pct = (x: number) => `${Math.round(x * 100)}%`

export function buildInstitutionLectura(m: Expediente): { claims: Claim[]; figures: Figure[]; leaders: Leader[] } {
  const d = m.src
  const claims: Claim[] = []
  const total = m.total || 1
  const ent = (e: (typeof d.entities)[number]): Inst => ({ id: e.id, name: e.name, siglas: null, type: 'vendor' })
  // chapters with money, each with its money-weighted top-5 share
  const chapters = m.chapters.filter((c) => c.amount > 0).map((c) => {
    let w = 0, s = 0
    for (const y of d.years) if (y.year >= c.from && y.year <= c.to && y.top5_share != null && m.shareYears.includes(y.year)) { w += y.amount_mxn; s += y.top5_share * y.amount_mxn }
    return { ...c, cr5: w > 0 ? s / w : null }
  })

  // 1 · concentration: the five largest vendors' share of everything; the trend by sexenio when it moved ≥ 5 points.
  if (d.n_entities >= 5) {
    const top5 = d.entities.slice(0, 5).reduce((s, e) => s + e.amount_mxn, 0) / total
    const es: Token[] = ['Sus 5 mayores proveedores se llevaron ', { b: pct(top5) }, ' de su gasto.']
    const en: Token[] = ['Its 5 largest suppliers took ', { b: pct(top5) }, ' of its spend.']
    const withCr = chapters.filter((c) => c.cr5 != null)
    const a = withCr[0], z = withCr[withCr.length - 1]
    if (a && z && a !== z && Math.abs(z.cr5! - a.cr5!) >= 0.05) {
      es.push(' Año por año, los 5 mayores del año pasaron de ', { b: pct(a.cr5!) }, ` con ${a.name} a `, { b: pct(z.cr5!) }, ` con ${z.name}.`)
      en.push(" Year by year, the year's top 5 went from ", { b: pct(a.cr5!) }, ` under ${a.name} to `, { b: pct(z.cr5!) }, ` under ${z.name}.`)
    }
    claims.push({ key: 'concentration', es, en })
  }

  // 2 · the largest vendor: its money, share and years; how often it led the year.
  const top = d.entities[0]
  if (top && top.amount_mxn / total >= 0.01) {
    const led = d.years.filter((y) => y.top_vendor_id === top.id).length
    const span = top.first_year === top.last_year ? `${top.first_year}` : `${top.first_year}–${top.last_year}`
    claims.push({
      key: 'largest',
      es: ['Su mayor proveedor, ', { inst: ent(top), bold: true }, ', recibió ', { b: formatCompactMXN(top.amount_mxn) }, ` (${pct(top.amount_mxn / total)}) en ${span}`,
        ...(led >= 2 ? ['; fue el mayor del año ', { b: `${led} veces` }, '.'] : ['.'])],
      en: ['Its largest supplier, ', { inst: ent(top), bold: true }, ', received ', { b: formatCompactMXN(top.amount_mxn) }, ` (${pct(top.amount_mxn / total)}) in ${span}`,
        ...(led >= 2 ? ['; it led the year ', { b: `${led} times` }, '.'] : ['.'])],
    })
  }

  // 3 · the procedure: the direct-award rate moved ≥ 10 points between the first and last sexenio
  //     (≥ 50 contracts each; only sexenios from DA_RECORDED_FROM (2011) on — chapter.da is null before).
  const daCh = chapters.filter((c) => c.n >= 50 && c.da != null)
  const f = daCh[0], l = daCh[daCh.length - 1]
  if (f && l && f !== l && Math.abs(l.da! - f.da!) >= 0.1) {
    claims.push({
      key: 'daShift',
      es: ['Sin licitación: ', { b: pct(f.da!) }, ` de sus contratos con ${f.name}, `, { b: pct(l.da!) }, ` con ${l.name}.`],
      en: ['Without a tender: ', { b: pct(f.da!) }, ` of its contracts under ${f.name}, `, { b: pct(l.da!) }, ` under ${l.name}.`],
    })
  }

  // 4 · one-term suppliers: large vendors (≥ 0.5%, top 20) whose whole run fits one closed sexenio.
  if (chapters.length >= 2) {
    const big = d.entities.slice(0, 20).filter((e) => e.amount_mxn / total >= 0.005)
    const one = big.flatMap((e) => {
      const c = m.chapters.find((x) => e.first_year >= x.from && e.last_year <= x.to)
      return c && e.last_year < m.end ? [{ e, c }] : []
    })
    if (one.length >= 1 && big.length >= 3) {
      const { e, c } = one[0]
      const span = e.first_year === e.last_year ? `${e.first_year}` : `${e.first_year}–${e.last_year}`
      claims.push({
        key: 'oneTerm',
        es: [{ b: `${one.length} de ${big.length}` }, ' de sus mayores proveedores vendieron en un solo sexenio; el mayor, ', { inst: ent(e) }, `, sólo con ${c.name} (${span}).`],
        en: [{ b: `${one.length} of ${big.length}` }, ' of its largest suppliers sold under one administration only; the largest, ', { inst: ent(e) }, `, only under ${c.name} (${span}).`],
      })
    }
  }

  // 5 · the year's leader, by sexenio (most years led; a tie goes to the larger peak share). Shown from 2 sexenios.
  const leaders: Leader[] = m.chapters.flatMap((c) => {
    const ys = m.shareYears.filter((y) => y >= c.from && y <= c.to)
    const tally = new Map<number, { years: number; share: number; name: string | null }>()
    for (const y of ys) {
      const r = m.byYear[y]
      if (r.top_vendor_id == null) continue
      const t = tally.get(r.top_vendor_id) ?? { years: 0, share: 0, name: r.top_vendor_name ?? null }
      t.years += 1; t.share = Math.max(t.share, r.top_share ?? 0)
      tally.set(r.top_vendor_id, t)
    }
    const best = [...tally].sort((a, z) => z[1].years - a[1].years || z[1].share - a[1].share)[0]
    return best ? [{ chapter: c.name, inst: { id: best[0], name: best[1].name, siglas: null, type: 'vendor' as const }, years: best[1].years, of: ys.length, share: best[1].share }] : []
  })

  const scored = d.years.filter((y) => y.avg_risk_score != null)
  const crit = scored.filter((y) => (y.avg_risk_score as number) >= CRIT).length
  // no «first · last year» row (the head's «Contratos, 2002–2026» says it) and no direct-award row
  // when the claim above already states it
  const figures: Figure[] = [
    { key: 'big', es: 'Proveedores con ≥ 1% del gasto', en: 'Suppliers with ≥ 1% of spend', value: String(d.entities.filter((e) => e.amount_mxn / total >= 0.01).length) },
    { key: 'crit', es: 'Años con indicador ≥ 0.60', en: 'Years with indicator ≥ 0.60', value: `${crit} / ${scored.length}` },
    ...(f && l && f !== l && !claims.some((c) => c.key === 'daShift') ? [{ key: 'da', es: `Sin licitación, ${f.name} → ${l.name}`, en: `No tender, ${f.name} → ${l.name}`, value: `${pct(f.da!)} → ${pct(l.da!)}` }] : []),
  ]
  return { claims, figures, leaders: leaders.length >= 2 ? leaders : [] }
}
