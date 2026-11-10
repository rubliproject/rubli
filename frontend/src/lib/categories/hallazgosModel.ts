/**
 * /categories «Hallazgos» — the model behind the four findings (port of the reviewed concept
 * `_explore/categorias_concepts_2026-10-28/AC.html`, REVIEW_6). The payload comes from
 * GET /categories/hallazgos (scripts/precompute_category_hallazgos.py); every number the page
 * prints is derived here, every «La lectura» claim renders only when its condition holds and has
 * a true/false vitest (hallazgosModel.test.ts).
 *
 * Personas físicas are named as CompraNet publishes them and labelled «persona física» (owner 2026-10-29).
 * Shares are of MONEY, never of contracts. CompraNet excludes the ComprasMX rows; ComprasMX money
 * is the maximum contracted amount. Copy: «indicador de riesgo», never «probabilidad», never «cola».
 */
import { money, num, type Lang } from '@/lib/captura/lectura'
import { formatEntityName } from '@/lib/entity/format'
import { formatVendorName } from '@/lib/vendor/formatName'

export { money, num, type Lang }

// ── payload (JSON: integer dict keys arrive as strings) ──
export interface YearRow { y: number; n: number; m: number; da: number; nv: number; ni: number }
export interface Shift { cat: number; before: number; after: number; m: number }
export interface Big { vid: number | null; name: string | null; pf: boolean; title: string | null; m: number; da: boolean }
export interface Series { id: number; vals: number[]; mx: number }
export interface SlopeRow { cat: number; m: number; v: number | null; n25: number; share: number; share_before: number; top_before: number | null; top_before_share: number }
export interface StripRow { id: number; n: number; m: number; da: number }
export interface MatrixRow { cat: number; m2325: number; extra: boolean; cells: [number, number | null][]; mx: [number, number | null]; top: { v: number | null; share: number } | null }
export interface DrillRow { id: number; d: string | null; t: string | null; vid: number | null; iid: number; m: number; da: boolean; r: number | null }
export interface Payload {
  /** the buyer sector the payload was built for (null = all of government) */
  sector?: number | null
  computed_at: string
  mx_asof: string | null
  n_categories: number
  y0: number
  y1: number
  cats: Record<string, { es: string; en: string }>
  vendors: Record<string, string | null>
  /** vendor ids that are personas físicas: named as CompraNet publishes them, labelled (owner 2026-10-29) */
  persona_fisica: number[]
  institutions: Record<string, { name: string; siglas: string | null }>
  fed: Record<string, { m: number; dam: number; m20: number; dam20: number }>
  f1: { mx_n: number; mx_m: number; mx_da: number; shifts: Record<string, Shift>; down: Shift[] }
  f1_years: YearRow[]
  f2: {
    series: Series[]; mx_total: number; bir_mx_m: number; bir_mx_n: number; bir_mx_da: number; imss_mx_m: number
    bir_life_m: number; bir_life_n: number; bir_life_y0: number; bir_all_mx_m: number; bir_all_mx_n: number
    bir_flag_n: number; bir_flag_m: number; big: Big[]; imss2025: number; imssb2025: number
    insabi_last: number | null; imssb_first: number | null
  }
  f3: { rows: SlopeRow[]; n_all: number; owner_cats: number[]; before40: number[]; mx57: { total: number; broxel: number; toka: number }; toka25: number; toka_before: number }
  f4: { cat: number; rows: StripRow[] }[]
  matrix: MatrixRow[]
  drill: DrillRow[]
}

// ── ids the copy names (stable CompraNet keys) ──
export const ID = { med: 20, curacion: 22, equipo: 21, hosp: 24, lab: 23, fuel: 37, food: 57, ti: 34, meals: 58, imss: 251, issste: 228, imssb: 3780, insabi: 3744, birmex: 2066, sedena: 384, edenred: 44372, toka: 102627, broxel: 147453 } as const

/** «de cada cien pesos, 63» — half-up. */
export const cien = (x: number) => Math.round(x * 100)
export const pct = (x: number, lang: Lang = 'es') => `${cien(x).toLocaleString(lang === 'es' ? 'es-MX' : 'en-US')}%`
const WORDS: Record<Lang, string[]> = {
  es: ['ninguna', 'una', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve'],
  en: ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'],
}
export const word = (n: number, lang: Lang) => WORDS[lang][n] ?? String(n)
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** Short buyer labels for charts: the register's siglas, fixed where the register spells them oddly. */
const SIGLAS_FIX: Record<string, string> = { IMSSBIENESTAR: 'IMSS-Bienestar', CENSIDA: 'Censida', FINANZASGTO: 'Finanzas Gto.' }

export interface Model {
  p: Payload
  catName: (id: number, lang: Lang) => string
  vendorName: (id: number | null) => string | null
  isPF: (id: number | null) => boolean
  instShort: (id: number) => string
  fedDa: (y: number) => number
  fedDaEx: (y: number) => number
  f1: {
    years: YearRow[]; before: number; after: number; mAfter: number; y2023: number; y2024: number; y2025: number; m2025: number
    switchYear: number | null; earlyHalf: number[]; mx: { n: number; m: number; da: number }
    fed13: number; fed24: number; fed13x: number; fed24x: number
    curacion: Shift | null; equipo: Shift | null; down: Shift[]
  }
  f2: Payload['f2'] & { ratio: number; withoutFlag: number; birShareMx: number }
  f3: { rows: SlopeRow[]; owners: SlopeRow[]; nAll: number; n40: number; n40Before: number; before40: SlopeRow[]; byCat: (c: number) => SlopeRow | undefined; ones: SlopeRow[]; mx57: Payload['f3']['mx57']; toka25: number; tokaBefore: number }
  f4: { cat: number; rows: StripRow[]; lo: StripRow; hi: StripRow; m: number }[]
}

const share = (rows: YearRow[], a: number, b: number) => {
  const xs = rows.filter((r) => r.y >= a && r.y <= b)
  const m = xs.reduce((s, r) => s + r.m, 0)
  return { m, da: m ? xs.reduce((s, r) => s + r.m * r.da, 0) / m : 0 }
}

export function buildModel(p: Payload): Model {
  const years = p.f1_years
  const at = (y: number) => years.find((r) => r.y === y)
  const da = (y: number) => at(y)?.da ?? 0
  const fed = (y: number) => p.fed[String(y)]
  const fedDa = (y: number) => { const f = fed(y); return f && f.m ? f.dam / f.m : 0 }
  const fedDaEx = (y: number) => { const f = fed(y); return f && f.m - f.m20 ? (f.dam - f.dam20) / (f.m - f.m20) : 0 }
  const span = years.filter((r) => r.y >= 2013)
  // the switch year: the first year from which every later year is at half or more
  const switchYear = span.find((_r, i) => span.slice(i).every((z) => z.da >= 0.5))?.y ?? null
  const p3 = share(years, 2013, 2018), p5 = share(years, 2023, 2025)

  const f3rows = p.f3.rows
  const owners = f3rows.filter((r) => r.share >= 0.4)
  const f4 = p.f4.filter((s) => s.rows.length).map((s) => ({
    ...s,
    lo: s.rows.reduce((a, b) => (b.da < a.da ? b : a)),
    hi: s.rows.reduce((a, b) => (b.da > a.da ? b : a)),
    m: s.rows.reduce((t, r) => t + r.m, 0),
  }))

  return {
    p,
    catName: (id, lang) => p.cats[String(id)]?.[lang] ?? `#${id}`,
    vendorName: (id) => (id == null ? null : p.vendors[String(id)] ?? null),
    isPF: (id) => id != null && (p.persona_fisica ?? []).includes(id),
    instShort: (id) => {
      const i = p.institutions[String(id)]
      if (!i) return `#${id}`
      return i.siglas ? SIGLAS_FIX[i.siglas] ?? i.siglas : formatEntityName('institution', i.name, 'xs')
    },
    fedDa,
    fedDaEx,
    f1: {
      years, before: p3.da, after: p5.da, mAfter: p5.m, y2023: da(2023), y2024: da(2024), y2025: da(2025), m2025: at(2025)?.m ?? 0,
      switchYear,
      earlyHalf: switchYear ? span.filter((r) => r.y < switchYear && r.da >= 0.5).map((r) => r.y) : [],
      mx: { n: p.f1.mx_n, m: p.f1.mx_m, da: p.f1.mx_da },
      fed13: fedDa(2013), fed24: fedDa(2024), fed13x: fedDaEx(2013), fed24x: fedDaEx(2024),
      curacion: p.f1.shifts[String(ID.curacion)] ?? null, equipo: p.f1.shifts[String(ID.equipo)] ?? null, down: p.f1.down,
    },
    f2: {
      ...p.f2,
      ratio: p.f2.bir_life_m ? p.f2.bir_all_mx_m / p.f2.bir_life_m : 0,
      withoutFlag: p.f2.bir_all_mx_m - p.f2.bir_flag_m,
      birShareMx: p.f2.mx_total ? p.f2.bir_mx_m / p.f2.mx_total : 0,
    },
    f3: {
      rows: f3rows, owners, nAll: p.f3.n_all, n40: owners.length, n40Before: p.f3.before40.length,
      before40: f3rows.filter((r) => p.f3.before40.includes(r.cat)),
      byCat: (c) => f3rows.find((r) => r.cat === c),
      ones: owners.filter((r) => r.n25 === 1),
      mx57: p.f3.mx57, toka25: p.f3.toka25, tokaBefore: p.f3.toka_before,
    },
    f4,
  }
}

// ── «La lectura»: computed claims, shown only when true ──
export type EntKind = 'vendor' | 'institution' | 'category'
/** `anon`: a supplier with no name in the payload (personas físicas are never named or keyed). */
export type Token = string | { b: string } | { anon: true } | { ent: EntKind; id: number; label: string; pf?: boolean }
export interface Bi { es: string; en: string }
export interface Claim { key: string; ch: 1 | 2 | 3 | 4; fig: Bi; color?: boolean; es: Token[]; en: Token[]; src: { es: Token[]; en: Token[] } }

const bi = (f: (l: Lang) => string): Bi => ({ es: f('es'), en: f('en') })
const arrow = (a: number, b: number) => `${cien(a)} → ${cien(b)}%`

export function buildLectura(m: Model): Claim[] {
  const out: Claim[] = []
  const { f1, f2, f3 } = m
  const cat = (id: number, l: Lang): Token => ({ ent: 'category', id, label: m.catName(id, l) })
  const ven = (id: number | null, label?: string): Token => {
    const name = label ?? m.vendorName(id)
    return id != null && name ? { ent: 'vendor', id, label: name, pf: m.isPF(id) } : { anon: true }
  }
  const es = (v: number) => money(v, 'es'), en = (v: number) => money(v, 'en')

  // ── I · medicine ──
  if (f1.switchYear && f1.before < 0.5 && f1.after >= 0.5) {
    const early = f1.earlyHalf
    out.push({
      key: 'giro', ch: 1, color: true, fig: bi(() => arrow(f1.before, f1.after)),
      es: [`del dinero sin concurso, `, { b: '2013–18 contra 2023–25' }, `: ${pct(f1.y2023)} en 2023, ${pct(f1.y2024)} en 2024, ${pct(f1.y2025)} en 2025. ${early.length ? `Antes de ${f1.switchYear}, sólo ${early.join(', ')} había pasado de la mitad.` : `Antes de ${f1.switchYear}, ningún año había pasado de la mitad.`}`],
      en: [`of the money with no tender, `, { b: '2013–18 against 2023–25' }, `: ${pct(f1.y2023, 'en')} in 2023, ${pct(f1.y2024, 'en')} in 2024, ${pct(f1.y2025, 'en')} in 2025. ${early.length ? `Before ${f1.switchYear}, only ${early.join(', ')} had crossed half.` : `Before ${f1.switchYear}, no year had crossed half.`}`],
      src: { es: ['CompraNet: dinero adjudicado directamente ÷ dinero total de la categoría, por año y por periodo.'], en: ['CompraNet: money awarded directly ÷ the category’s total money, by year and by period.'] },
    })
  }
  if (f1.mx.m > 0 && f1.mx.da > f1.after) {
    out.push({
      key: 'mx', ch: 1, fig: bi((l) => pct(f1.mx.da, l)),
      es: [`de ${es(f1.mx.m)} en medicinas en el registro nuevo, `, { b: 'ComprasMX' }, ', sin concurso.'],
      en: [`of ${en(f1.mx.m)} of medicines in the new register, `, { b: 'ComprasMX' }, ', with no tender.'],
      src: { es: ['ComprasMX oct 2025–oct 2026, montos máximos contratados.'], en: ['ComprasMX Oct 2025–Oct 2026, maximum contracted amounts.'] },
    })
  }
  if (f1.fed24x > f1.fed13x && f1.after - f1.before > f1.fed24x - f1.fed13x) {
    out.push({
      key: 'resto', ch: 1, fig: bi(() => arrow(f1.fed13x, f1.fed24x)),
      es: [`subió `, { b: 'el resto del gobierno' }, ` (2013 → 2024) sin contar la medicina; con ella, ${arrow(f1.fed13, f1.fed24)}. La medicina fue mucho más lejos.`],
      en: [`was the rise for `, { b: 'the rest of government' }, ` (2013 → 2024) leaving medicine out; with it, ${arrow(f1.fed13, f1.fed24)}. Medicine went much further.`],
      src: { es: ['el mismo cálculo sobre todas las categorías, con y sin Medicamentos.'], en: ['the same calculation over every category, with and without Medicines.'] },
    })
  }
  const cu = f1.curacion, eq = f1.equipo, d0 = f1.down[0], d1 = f1.down[1]
  if (cu && eq && d0 && d1 && cu.after > cu.before && cu.after >= 0.5 && d0.after < d0.before) {
    out.push({
      key: 'curacion', ch: 1, fig: bi(() => arrow(cu.before, cu.after)),
      es: [cat(ID.curacion, 'es'), ` hizo el mismo giro; `, cat(ID.equipo, 'es'), ` ${arrow(eq.before, eq.after)}. En sentido contrario, `, cat(d0.cat, 'es'), ` volvió a licitar (${arrow(d0.before, d0.after)}).`],
      en: [cat(ID.curacion, 'en'), ` made the same turn; `, cat(ID.equipo, 'en'), ` ${arrow(eq.before, eq.after)}. The other way, `, cat(d0.cat, 'en'), ` went back to tendering (${arrow(d0.before, d0.after)}).`],
      src: { es: ['el mismo cálculo; las dos categorías con mayor baja: ', cat(d0.cat, 'es'), ' y ', cat(d1.cat, 'es'), '.'], en: ['the same calculation; the two categories with the largest drop: ', cat(d0.cat, 'en'), ' and ', cat(d1.cat, 'en'), '.'] },
    })
  }

  // ── II · BIRMEX ──
  if (f2.bir_mx_m > 0 && f2.bir_mx_da >= 0.5) {
    out.push({
      key: 'birmex', ch: 2, color: true, fig: bi((l) => money(f2.bir_mx_m, l)),
      es: [`de medicinas firmó `, { b: 'BIRMEX' }, ` en ComprasMX (${num(f2.bir_mx_n)} contratos); ${pct(f2.bir_mx_da)} del dinero por adjudicación directa: vacunas y medicinas con patente, que sólo vende un laboratorio.`],
      en: [`of medicines signed by `, { b: 'BIRMEX' }, ` in ComprasMX (${num(f2.bir_mx_n, 'en')} contracts); ${pct(f2.bir_mx_da, 'en')} of the money by direct award: vaccines and patented medicines that only one laboratory sells.`],
      src: { es: ['ComprasMX, Medicamentos y Farmacéuticos, procedimiento de cada contrato.'], en: ['ComprasMX, Medicines and Pharmaceuticals, each contract’s procedure.'] },
    })
  }
  if (f2.ratio > 1) {
    const named = f2.big.filter((b) => b.name).map((b) => `${formatVendorName(b.name, 40)}${b.pf ? ' (persona física)' : ''} ${es(b.m)}`)
    const namedEn = f2.big.filter((b) => b.name).map((b) => `${formatVendorName(b.name, 40)}${b.pf ? ' (individual)' : ''} ${en(b.m)}`)
    const anon = f2.big.filter((b) => !b.name)
    const still = f2.withoutFlag > f2.bir_life_m
    out.push({
      key: 'veces', ch: 2, fig: bi((l) => `${f2.ratio.toLocaleString(l === 'es' ? 'es-MX' : 'en-US', { maximumFractionDigits: 1 })} ×`),
      es: [`lo de toda su historia en CompraNet (${f2.bir_life_y0}–2025), en doce meses de ComprasMX.${f2.bir_flag_n ? ` Los ${f2.bir_flag_n} contratos marcados por pasar de 10,000 MDP suman ${es(f2.bir_flag_m)}${named.length ? `: ${named.join(', ')}` : ''}${anon.length ? `${named.length ? ' y ' : ': '}${anon.length === 1 ? 'uno' : anon.length} sin proveedor en el registro, ${anon.map((b) => es(b.m)).join(', ')}` : ''}.` : ''}${f2.bir_flag_n ? (still ? ` Sin ellos siguen siendo ${es(f2.withoutFlag)}, más que los ${es(f2.bir_life_m)} de antes.` : ` Sin ellos quedan ${es(f2.withoutFlag)}.`) : ''}`],
      en: [`its whole CompraNet history (${f2.bir_life_y0}–2025), in twelve months of ComprasMX.${f2.bir_flag_n ? ` The ${f2.bir_flag_n} contracts flagged for exceeding 10,000 million pesos add up to ${en(f2.bir_flag_m)}${namedEn.length ? `: ${namedEn.join(', ')}` : ''}${anon.length ? `${namedEn.length ? ' and ' : ': '}${anon.length === 1 ? 'one' : anon.length} with no supplier in the register, ${anon.map((b) => en(b.m)).join(', ')}` : ''}.` : ''}${f2.bir_flag_n ? (still ? ` Without them it is still ${en(f2.withoutFlag)}, more than the ${en(f2.bir_life_m)} before.` : ` Without them, ${en(f2.withoutFlag)} remain.`) : ''}`],
      src: { es: [`CompraNet ${f2.bir_life_y0}–2025 (las dos claves de BIRMEX, ${num(f2.bir_life_n)} contratos) y ComprasMX, monto máximo contratado.`], en: [`CompraNet ${f2.bir_life_y0}–2025 (BIRMEX’s two keys, ${num(f2.bir_life_n, 'en')} contracts) and ComprasMX, maximum contracted amount.`] },
    })
  }
  if (f2.insabi_last != null && f2.imssb_first === f2.insabi_last) {
    out.push({
      key: 'relevo', ch: 2, fig: bi(() => String(f2.insabi_last)),
      es: [`el año del relevo anterior: último del `, { b: 'INSABI' }, ` con medicinas y primero de `, { b: 'IMSS-Bienestar' }, ` (${es(f2.imssb2025)} en 2025). Tres compradores en seis años.`],
      en: [`the year of the previous hand-over: the last of `, { b: 'INSABI' }, ` buying medicines and the first of `, { b: 'IMSS-Bienestar' }, ` (${en(f2.imssb2025)} in 2025). Three buyers in six years.`],
      src: { es: ['CompraNet, dinero por comprador y año en la categoría.'], en: ['CompraNet, money by buyer and year in the category.'] },
    })
  }
  if (f2.imss_mx_m > 0 && f2.imss_mx_m < f2.imss2025) {
    out.push({
      key: 'imss', ch: 2, fig: bi((l) => money(f2.imss_mx_m, l)),
      es: [`aparece a nombre del `, { b: 'IMSS' }, ` en ComprasMX; en 2025 había comprado ${es(f2.imss2025)} (la compra de todo un año en una sola licitación).`],
      en: [`appears under `, { b: 'IMSS' }, ` in ComprasMX; in 2025 it had bought ${en(f2.imss2025)} (a whole year’s purchase in a single tender).`],
      src: { es: ['CompraNet 2025 y ComprasMX, Medicamentos y Farmacéuticos.'], en: ['CompraNet 2025 and ComprasMX, Medicines and Pharmaceuticals.'] },
    })
  }

  // ── III · owners ──
  if (f3.n40 > 0) {
    const list = (l: Lang) => f3.owners.flatMap((r, i): Token[] => [i ? '; ' : '', ven(r.v), ` ${pct(r.share, l)} ${l === 'es' ? 'de' : 'of'} ${m.catName(r.cat, l).toLowerCase()}`])
    const bef = (l: Lang): Token[] => f3.before40.length
      ? [` (`, ...f3.before40.flatMap((r, i): Token[] => [i ? '; ' : '', `${m.catName(r.cat, l).toLowerCase()}: `, ven(r.top_before), ` ${pct(r.top_before_share, l)}`]), ')']
      : []
    out.push({
      key: 'duenos', ch: 3, color: true, fig: bi((l) => `${f3.n40} ${l === 'es' ? 'de' : 'of'} ${f3.nAll}`),
      es: [`categorías con más de 2,000 MDP en 2025 tienen un proveedor con 40% o más: `, ...list('es'), `. En 2019–24, en las mismas ${f3.nAll}, ${f3.n40Before === 0 ? 'no había ninguna' : f3.n40Before === 1 ? 'era una' : `eran ${f3.n40Before}`}`, ...bef('es'), '.'],
      en: [`categories with more than 2,000 million pesos in 2025 have one supplier with 40% or more: `, ...list('en'), `. In 2019–24, among the same ${f3.nAll}, ${f3.n40Before === 0 ? 'there were none' : f3.n40Before === 1 ? 'there was one' : `there were ${f3.n40Before}`}`, ...bef('en'), '.'],
      src: { es: ['CompraNet, dinero por proveedor dentro de cada categoría, 2025 contra 2019–24.'], en: ['CompraNet, money by supplier within each category, 2025 against 2019–24.'] },
    })
  }
  const fuel = f3.byCat(ID.fuel)
  if (fuel && fuel.share >= 0.4 && fuel.share > fuel.share_before) {
    const ones = f3.ones.filter((r) => r.cat !== ID.fuel)
    out.push({
      key: 'gasolina', ch: 3, fig: bi(() => arrow(fuel.share_before, fuel.share)),
      es: [ven(fuel.v), ` en `, cat(ID.fuel, 'es'), ` (${num(fuel.n25)} contratos en 2025, ${es(fuel.m)} en la categoría).`, ...(ones.length ? [' ', ...ones.flatMap((r, i): Token[] => [i ? ' y ' : '', ven(r.v)]), ones.length === 1 ? ' es una sola compra.' : ' son una sola compra cada uno.'] : [])],
      en: [ven(fuel.v), ` in `, cat(ID.fuel, 'en'), ` (${num(fuel.n25, 'en')} contracts in 2025, ${en(fuel.m)} in the category).`, ...(ones.length ? [' ', ...ones.flatMap((r, i): Token[] => [i ? ' and ' : '', ven(r.v)]), ones.length === 1 ? ' is a single purchase.' : ' are a single purchase each.'] : [])],
      src: { es: ['el mismo cálculo.'], en: ['the same calculation.'] },
    })
  }
  const mx57 = f3.mx57
  if (f3.toka25 < f3.tokaBefore && mx57.total > 0 && mx57.broxel > mx57.toka) {
    out.push({
      key: 'vales', ch: 3, fig: bi(() => arrow(f3.tokaBefore, f3.toka25)),
      es: [ven(ID.toka, 'Toka'), ', el vale de despensa, en ', cat(ID.food, 'es'), ' (CompraNet). En ComprasMX 2025–26 ese vale es de ', ven(ID.broxel, 'Broxel'), `: ${es(mx57.broxel)} de ${es(mx57.total)} (${pct(mx57.broxel / mx57.total)}); Toka, ${pct(mx57.toka / mx57.total)}.`],
      en: [ven(ID.toka, 'Toka'), ', the grocery voucher, in ', cat(ID.food, 'en'), ' (CompraNet). In ComprasMX 2025–26 that voucher belongs to ', ven(ID.broxel, 'Broxel'), `: ${en(mx57.broxel)} of ${en(mx57.total)} (${pct(mx57.broxel / mx57.total, 'en')}); Toka, ${pct(mx57.toka / mx57.total, 'en')}.`],
      src: { es: ['CompraNet y ComprasMX, dinero por proveedor en la categoría.'], en: ['CompraNet and ComprasMX, money by supplier in the category.'] },
    })
  }
  const ti = f3.byCat(ID.ti), meals = f3.byCat(ID.meals)
  if (ti && ti.share > ti.share_before) {
    const tail = (l: Lang): Token[] => (meals && meals.share > meals.share_before ? ['; ', ven(meals.v), ` ${arrow(meals.share_before, meals.share)} ${l === 'es' ? 'de' : 'of'} ${m.catName(ID.meals, l).toLowerCase()}`] : [])
    out.push({
      key: 'ti', ch: 3, fig: bi(() => arrow(ti.share_before, ti.share)),
      es: [ven(ti.v), ' en ', cat(ID.ti, 'es'), ...tail('es'), '.'],
      en: [ven(ti.v), ' in ', cat(ID.ti, 'en'), ...tail('en'), '.'],
      src: { es: ['el mismo cálculo.'], en: ['the same calculation.'] },
    })
  }

  // ── IV · same category, another rule ──
  const strip = (c: number) => m.f4.find((s) => s.cat === c)
  const row = (c: number, id: number) => strip(c)?.rows.find((r) => r.id === id)
  const lab = strip(ID.lab), labIMSS = row(ID.lab, ID.imss), labISSSTE = row(ID.lab, ID.issste)
  if (lab && labIMSS && labISSSTE && labISSSTE.da - labIMSS.da >= 0.2) {
    const gap = cien(labISSSTE.da) - cien(labIMSS.da)
    out.push({
      key: 'lab', ch: 4, color: true, fig: bi(() => `${cien(labIMSS.da)} · ${cien(labISSSTE.da)}%`),
      es: [{ b: 'IMSS' }, ' e ', { b: 'ISSSTE' }, ' en ', cat(ID.lab, 'es'), ` (${es(labIMSS.m)} y ${es(labISSSTE.m)}): ${gap} puntos de distancia para comprar lo mismo${lab.hi.id !== ID.issste ? `; ${m.instShort(lab.hi.id)}, ${pct(lab.hi.da)}` : ''}.`],
      en: [{ b: 'IMSS' }, ' and ', { b: 'ISSSTE' }, ' in ', cat(ID.lab, 'en'), ` (${en(labIMSS.m)} and ${en(labISSSTE.m)}): ${gap} points apart to buy the same thing${lab.hi.id !== ID.issste ? `; ${m.instShort(lab.hi.id)}, ${pct(lab.hi.da, 'en')}` : ''}.`],
      src: { es: ['CompraNet, dinero sin concurso ÷ dinero del comprador en la categoría, 2019–25.'], en: ['CompraNet, money with no tender ÷ the buyer’s money in the category, 2019–25.'] },
    })
  }
  const hIMSS = row(ID.hosp, ID.imss), hISSSTE = row(ID.hosp, ID.issste), hB = row(ID.hosp, ID.imssb)
  if (hIMSS && hISSSTE && hISSSTE.da > hIMSS.da) {
    out.push({
      key: 'hosp', ch: 4, fig: bi(() => `${cien(hIMSS.da)} · ${cien(hISSSTE.da)}%`),
      es: [{ b: 'IMSS' }, ' e ', { b: 'ISSSTE' }, ' en ', cat(ID.hosp, 'es'), ` (${es(hIMSS.m)} y ${es(hISSSTE.m)})${hB ? `; IMSS-Bienestar, ${pct(hB.da)}` : ''}.`],
      en: [{ b: 'IMSS' }, ' and ', { b: 'ISSSTE' }, ' in ', cat(ID.hosp, 'en'), ` (${en(hIMSS.m)} and ${en(hISSSTE.m)})${hB ? `; IMSS-Bienestar, ${pct(hB.da, 'en')}` : ''}.`],
      src: { es: ['el mismo cálculo.'], en: ['the same calculation.'] },
    })
  }
  const cur = strip(ID.curacion), curIMSS = row(ID.curacion, ID.imss)
  if (cur && lab && curIMSS && labIMSS && cur.hi.id === ID.imss && lab.lo.id === ID.imss) {
    out.push({
      key: 'curacion4', ch: 4, fig: bi(() => `${cien(cur.lo.da)} · ${cien(curIMSS.da)}%`),
      es: [{ b: m.instShort(cur.lo.id) }, ' e ', { b: 'IMSS' }, ' en ', cat(ID.curacion, 'es'), '. El IMSS es el que más adjudica directo en curación y el que menos en laboratorio.'],
      en: [{ b: m.instShort(cur.lo.id) }, ' and ', { b: 'IMSS' }, ' in ', cat(ID.curacion, 'en'), '. IMSS awards directly the most in wound-care supplies and the least in laboratory.'],
      src: { es: ['el mismo cálculo.'], en: ['the same calculation.'] },
    })
  }
  return out
}

// ── The four findings, one plain sentence each (owner 11-05: ≤ 15 words, example first). A finding whose
// condition fails is not shown at all: with no clear finding, the block doesn't ship. ──
export type FindingKey = 'medicina' | 'birmex' | 'combustible' | 'laboratorio' | 'dueno'
export interface Finding { key: FindingKey; es: string; en: string; /** the category the finding is about (generic ones) */ cat?: number }

export function buildFindings(m: Model): Finding[] {
  const out: Finding[] = []
  const { f1, f2, f3 } = m
  if (f1.switchYear && f1.before < 0.5 && f1.after >= 0.5) {
    out.push({ key: 'medicina',
      es: `Desde ${f1.switchYear}, más de la mitad del dinero de las medicinas va sin concurso.`,
      en: `Since ${f1.switchYear}, over half the money for medicines goes out with no tender each year.` })
  }
  // BIRMEX: one year of ComprasMX against its whole CompraNet history; must hold even without the flagged > 10,000 MDP contracts
  const years = 2025 - f2.bir_life_y0 + 1
  if (f2.bir_life_m > 0 && f2.withoutFlag > f2.bir_life_m) {
    out.push({ key: 'birmex',
      es: `BIRMEX, la empresa estatal de vacunas, firmó en un año más que en ${years} años.`,
      en: `BIRMEX, the state vaccine maker, signed more in one year than in ${years} years.` })
  }
  const fuel = f3.byCat(ID.fuel)
  if (fuel && fuel.share >= 0.4 && fuel.share > fuel.share_before && m.vendorName(fuel.v)) {
    out.push({ key: 'combustible',
      es: `En 2025, Edenred se llevó ${cien(fuel.share)} de cada 100 pesos de combustible${m.p.sector != null ? ' de este sector' : ' del gobierno'}.`,
      en: `In 2025, Edenred took ${cien(fuel.share)} of every 100 pesos ${m.p.sector != null ? 'this sector' : 'the government'} spent on fuel.` })
  }
  // by sector (owner 11-06): the national fuel story rarely holds inside one sector; the general form of it does —
  // the category of this sector whose largest supplier takes the most in 2025 (≥ 40 %), named
  if (m.p.sector != null && !out.some((f) => f.key === 'combustible')) {
    const top = [...f3.owners].sort((a, b) => b.share - a.share).find((r) => m.vendorName(r.v))
    if (top) {
      const vn = formatVendorName(m.vendorName(top.v), 40) + (m.isPF(top.v) ? ' (persona física)' : '')
      out.push({ key: 'dueno', cat: top.cat,
        es: `En 2025, ${vn} se llevó ${cien(top.share)} de cada 100 pesos de ${m.catName(top.cat, 'es').toLowerCase()}.`,
        en: `In 2025, ${vn} took ${cien(top.share)} of every 100 pesos of ${m.catName(top.cat, 'en').toLowerCase()}.` })
    }
  }
  const lab = m.f4.find((s) => s.cat === ID.lab)
  const imss = lab?.rows.find((r) => r.id === ID.imss), issste = lab?.rows.find((r) => r.id === ID.issste)
  if (imss && issste && imss.da < 0.5 && issste.da >= 0.5) {
    out.push({ key: 'laboratorio',
      es: `En laboratorio, el ISSSTE da sin concurso ${cien(issste.da)} de cada 100 pesos; el IMSS, ${cien(imss.da)}.`,
      en: `In laboratory supplies, ISSSTE awards ${cien(issste.da)} of every 100 pesos with no tender; IMSS, ${cien(imss.da)}.` })
  }
  return out
}
