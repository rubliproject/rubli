/**
 * «La lectura» of «A destiempo» (two chapters) and «El arranque» — and the computed head sentences. Every claim is
 * built from the model (./model.ts) and is returned ONLY when its condition holds; each has a true/false vitest
 * (lectura.test.ts). Spanish written first, English written separately (never translated).
 * Copy rules: «indicador de riesgo», never «probabilidad»; a lot is «un indicio, no una conclusión».
 */
import { money, moneyDual, num } from '@/lib/captura/lectura'
import { fdate } from '@/components/newtabs/ntShared'
import { formatVendorName } from '@/lib/vendor/formatName'
import { CAT, SEAL, type ArranqueModel, type FalloModel, type MismoModel } from './model'

export type Lang = 'es' | 'en'
/** A vendor token renders as <EntityIdentityChip variant="name"> when it has an id, else as its formatted name;
 *  `pf` adds «· persona física» (owner 2026-10-29: individuals are named as CompraNet publishes them, and labelled). */
export type Token = string | { b: string } | { vendor: number | null; name: string; pf?: boolean }
export const pfLabel = (lang: Lang) => (lang === 'en' ? ' · individual' : ' · persona física')
export interface Claim { key: string; fig: string; color?: string; t: Token[]; src: string }

export { money, num }
/** A share with d decimals: «9.8%» — figure and sign joined (the site-wide percent style). */
export const pct = (x: number, lang: Lang, d = 0) => `${(x * 100).toLocaleString(lang === 'es' ? 'es-MX' : 'en-US', { minimumFractionDigits: d, maximumFractionDigits: d })}%`
/** Never «0%» for a real share: one decimal under 1%. */
export const pctA = (x: number, lang: Lang) => pct(x, lang, x > 0 && x < 0.01 ? 1 : 0)
/** «1 contrato» / «29 contratos». */
export const n1 = (n: number, one: string, many: string, lang: Lang) => `${num(n, lang)} ${n === 1 ? one : many}`
export const vn = (s: string | null | undefined, max = 40) => formatVendorName(s, max)
export const pesos = (v: number, lang: Lang) => `$${num(v, lang)}`

// ═══════════════════ A · Empezó antes del fallo ═══════════════════
export function falloHead(M: FalloModel, lang: Lang) {
  const { F } = M, en = lang === 'en'
  const oneIn = Math.round(1 / F.lead_proc_rate)
  const word = oneIn === 10 ? (en ? 'ten' : 'diez') : num(oneIn, lang)
  const rest = Math.round(1 / F.rest_proc_rate)
  const nearHalf = F.lead_share >= 0.4 && F.lead_share < 0.5
  return {
    h1: en ? `One in ${word} ${F.lead_k} tenders started before the award` : `Uno de cada ${word} concursos de la ${F.lead_k} empezó antes del fallo`,
    /** «No other agency comes close» only when the lead's tender rate tops every institution with ≥ 100 tenders. */
    meta: [
      F.lead_tops ? (en ? 'No other agency comes close: across' : 'Ninguna otra dependencia se le acerca: en') : (en ? 'Across' : 'En'),
      en ? ' the rest of the federal government it is one tender in ' : ' el resto de la administración federal es uno de cada ',
      { b: num(rest, lang) }, en ? (F.lead_tops ? '' : ' tenders') : ' concursos',
      en ? `, and ${F.lead_k} alone holds ` : `, y la ${F.lead_k} sola pone `,
      { b: nearHalf ? (en ? 'almost half' : 'casi la mitad') : pct(F.lead_share, lang) },
      en ? ' of the contracts that started before the award.' : ' de los contratos que arrancaron antes del fallo.',
    ] as Token[],
  }
}

export function falloLectura(M: FalloModel, lang: Lang): Claim[] {
  const { F, meta: m } = M, en = lang === 'en', out: Claim[] = []
  const dates = F.leadDates.map(([d, k]) => `${k} (${fdate(d, lang)})`).join(', ')
  if (F.lead_proc_rate > 2 * F.proc_rate) {
    const x = (F.lead_proc_rate / F.proc_rate).toFixed(0)
    out.push({ key: 'lead', fig: pct(F.lead_proc_rate, lang, 1), color: CAT[0], /* trace: en ? 'GET /analysis/antes-del-fallo · inst[0] · distinct procedures' : 'GET /analysis/antes-del-fallo · inst[0] · procedimientos distintos */ src: en ? 'Source: CompraNet, contracts with an award date and a start date, counted by tender and by agency.' : 'Fuente: CompraNet, contratos con fecha de fallo y de inicio, contados por concurso y por dependencia.',
      t: en ? [`of `, { b: F.lead_k }, ` tenders with an award and a start date began before the award (${num(F.lead_proc, lang)} of ${num(F.lead_pop_proc, lang)}; ${num(F.lead_n, lang)} contracts of ${num(F.lead_pop, lang)}, ${pct(F.lead_rate, lang, 1)}): ${x}× the federal rate. Three batch awards hold ${dates}.`]
        : [`de los concursos de la `, { b: F.lead_k }, ` con fallo e inicio arrancaron antes del fallo (${num(F.lead_proc, lang)} de ${num(F.lead_pop_proc, lang)}; ${num(F.lead_n, lang)} contratos de ${num(F.lead_pop, lang)}, ${pct(F.lead_rate, lang, 1)}): ×${x} la tasa de la APF. Tres fallos en lote concentran ${dates}.`] })
  }
  if (F.iss_jan > 0 && F.iss_jan_fallo) {
    const top: Token[] = F.issTop.flatMap(([k, a], i) => [i ? ' · ' : '', { vendor: M.R.find((r) => r.v === k)?.vid ?? null, name: k, pf: M.R.find((r) => r.v === k)?.pf }, ` ${num(a, lang)}`])
    out.push({ key: 'issste', fig: num(F.iss_jan, lang), color: CAT[1], /* trace: rows · jan1 ∧ inst = ISSSTE · fallo */ src: en ? 'Source: CompraNet, ISSSTE contracts starting on 1 January, with their award date.' : 'Fuente: CompraNet, contratos del ISSSTE que empiezan el 1 de enero, con su fecha de fallo.',
      t: en ? [`contracts of the `, { b: 'ISSSTE consolidated purchase' }, ` started on 1 January and were awarded on ${fdate(F.iss_jan_fallo, lang)}: ${moneyDual(F.iss_jan_v * 1e6, lang)} supplied for ${n1(F.iss_jan_days, 'day', 'days', lang)} with no winner. The largest: `, ...top, '.']
        : [`contratos de la `, { b: 'compra consolidada del ISSSTE' }, ` empezaron el 1 de enero y se fallaron el ${fdate(F.iss_jan_fallo, lang)}: ${moneyDual(F.iss_jan_v * 1e6, lang)} surtidos ${n1(F.iss_jan_days, 'día', 'días', lang)} sin ganador. Los mayores: `, ...top, '.'] })
  }
  if (F.pre_ape > 0) {
    out.push({ key: 'preape', fig: num(F.pre_ape, lang), color: SEAL, /* trace: rows · ini < ape · ini < pub */ src: en ? 'Source: CompraNet, start date against the bid opening and the publication of the call.' : 'Fuente: CompraNet, fecha de inicio frente a la apertura de propuestas y la publicación de la convocatoria.',
      t: en ? ['contracts started ', { b: 'before bids were opened' }, ` (${moneyDual(F.pre_ape_v * 1e6, lang)}) and ${num(F.pre_pub, lang)} before the call was published: the work was running before anyone had bid.`]
        : ['contratos empezaron ', { b: 'antes de la apertura de propuestas' }, ` (${moneyDual(F.pre_ape_v * 1e6, lang)}) y ${num(F.pre_pub, lang)} antes de que se publicara la convocatoria: el trabajo corría sin que nadie hubiera ofertado.`] })
  }
  if (F.n > 0 && m.med.fir != null && m.med.fir > 0) {
    out.push({ key: 'mediana', fig: n1(F.medDays, en ? 'day' : 'día', en ? 'days' : 'días', lang), /* trace: meta.med · meta.nofirma_n */ src: en ? 'Source: CompraNet, days between the start, the award and the signature of each contract.' : 'Fuente: CompraNet, días entre el inicio, el fallo y la firma de cada contrato.',
      t: en ? [`is the median head start; ${pct(F.within7 / F.n, lang)} begin in the week before the award. Across the population the median signature comes ${m.med.fir} days `, { b: 'after' }, ` the award; ${num(m.nofirma_n, lang)} of the ${num(F.n, lang)} have no signature date.`]
        : [`es la mediana de anticipo; ${pct(F.within7 / F.n, lang)} arrancan en la semana previa al fallo. En la población, la firma mediana llega ${m.med.fir} días `, { b: 'después' }, ` del fallo; ${num(m.nofirma_n, lang)} de los ${num(F.n, lang)} no tienen fecha de firma.`] })
  }
  const [a0, a1] = m.ad_lag
  if (a0 && a1 && m.recon.n > 0) {
    out.push({ key: 'ademas', fig: money(a0.amt * 1e6, lang), /* trace: meta.ad_lag · meta.recon */ src: en ? 'Source: CompraNet, direct awards signed after the start and recognitions of extraordinary works.' : 'Fuente: CompraNet, adjudicaciones directas firmadas después del inicio y reconocimientos de trabajos extraordinarios.',
      t: en ? [{ b: 'Also' }, ': direct awards signed months after the work began — ', { vendor: a0.vid, name: a0.v, pf: a0.pf }, ` with ${a0.sig}, ${a0.lag} days; `, { vendor: a1.vid, name: a1.v, pf: a1.pf }, ` with ${a1.sig}, ${a1.lag} days. ${num(m.recon.n, lang)} «recognitions of extraordinary works» pay for work already done (${money(m.recon.v * 1e6, lang)}).`]
        : [{ b: 'Además' }, ': adjudicaciones directas firmadas meses después de empezar — ', { vendor: a0.vid, name: a0.v, pf: a0.pf }, ` con ${a0.sig}, ${a0.lag} días; `, { vendor: a1.vid, name: a1.v, pf: a1.pf }, ` con ${a1.sig}, ${a1.lag} días. ${num(m.recon.n, lang)} «reconocimientos de trabajos extraordinarios» pagan obra ya hecha (${money(m.recon.v * 1e6, lang)}).`] })
  }
  return out
}

// ═══════════════════ C · El mismo día ═══════════════════
export function mismoHead(M: MismoModel, lang: Lang) {
  const { F } = M, en = lang === 'en', L = F.lead
  if (!L) return { h1: en ? 'Same-day contracts just under the cap' : 'Contratos del mismo día justo bajo el tope', meta: [] as Token[] }
  const lab = /LABORATORI|DIAGN/i.test(L.vendor_name ?? '')
  const buyer = L.siglas || L.institution_name
  return {
    h1: en ? `${lab ? 'One lab' : 'One firm'}, one day, ${num(L.n, lang)} contracts just under the cap` : `${lab ? 'Un laboratorio' : 'Una empresa'}, un día, ${num(L.n, lang)} contratos justo bajo el tope`,
    meta: (en
      ? [`On ${fdate(L.contract_date, lang)} ${buyer} gave `, { vendor: L.vendor_id, name: L.vendor_name ?? '' }, ' one contract after another, each under the cap that allows buying without a tender: together, ', { b: money(L.sum_mxn, lang) }, `. It is the largest lot of ${F.curFrom}–${F.lastY} on a list of `, { b: num(F.n, lang) }, '.']
      : [`El ${fdate(L.contract_date, lang)}, el ${buyer} le dio a `, { vendor: L.vendor_id, name: L.vendor_name ?? '' }, ' un contrato tras otro, cada uno por debajo del tope que permite comprar sin concurso: juntos, ', { b: money(L.sum_mxn, lang) }, `. Es el lote más grande de ${F.curFrom}–${F.lastY} en una lista de `, { b: num(F.n, lang) }, '.']) as Token[],
  }
}

export function mismoLectura(M: MismoModel, lang: Lang): Claim[] {
  const { F, meta } = M, en = lang === 'en', out: Claim[] = [], L = F.lead
  if (L && L.vendor_name && F.lead_gap > 0) {
    const above = F.lead_above[0]
    const tail = above != null ? (en ? ` The same day, one more contract for ${pesos(above, lang)} fell outside the lot for exceeding the cap.` : ` El mismo día, un contrato más por ${pesos(above, lang)} quedó fuera del lote por pasar el tope.`) : ''
    out.push({ key: 'gap', fig: `${num(F.lead_gap, lang)} ${en ? 'pesos' : 'pesos'}`, color: SEAL, /* trace: GET /newtabs/mismo-dia · max_mxn ÷ low_cap_mxn · meta.lead_above_cap */ src: en ? 'Source: CompraNet, no-bid contracts with the same supplier, buyer and day, against that year’s PEF cap.' : 'Fuente: CompraNet, contratos directos del mismo proveedor, comprador y día, frente al tope del PEF de ese año.',
      t: en ? ['short of the cap in the largest of the ', { b: `${num(L.n, lang)} contracts` }, ` ${L.siglas || L.institution_name} gave `, { vendor: L.vendor_id, name: L.vendor_name }, ` on ${fdate(L.contract_date, lang)}: ${pesos(L.max_mxn, lang)} against ${pesos(L.low_cap_mxn, lang)}; together ${money(L.sum_mxn, lang)}, ${(L.sum_mxn / L.high_cap_mxn).toFixed(1)} times the highest cap.${tail}`]
        : ['faltaron para el tope en el mayor de los ', { b: `${num(L.n, lang)} contratos` }, ` que el ${L.siglas || L.institution_name} dio a `, { vendor: L.vendor_id, name: L.vendor_name }, ` el ${fdate(L.contract_date, lang)}: ${pesos(L.max_mxn, lang)} contra ${pesos(L.low_cap_mxn, lang)}; juntos ${money(L.sum_mxn, lang)}, ${(L.sum_mxn / L.high_cap_mxn).toFixed(1)} veces el tope máximo.${tail}`] })
  }
  if (F.near > 0) {
    out.push({ key: 'near', fig: num(F.near, lang), /* trace: rows · max_mxn ≥ 0.98 · low_cap_mxn */ src: en ? 'Source: CompraNet, the largest piece of each lot against the PEF cap.' : 'Fuente: CompraNet, la pieza mayor de cada lote frente al tope del PEF.',
      t: en ? [`lots of ${num(F.n, lang)} have their largest piece `, { b: 'within 2% of the cap' }, `; ${num(F.n95, lang)} within 5%, ${num(F.n90, lang)} within 10%. That is the pattern worth a file. Caution: the largest of a 10-contract lot drifts toward the cap by construction (it is a maximum).`]
        : [`lotes de ${num(F.n, lang)} tienen la pieza mayor a `, { b: '2% del tope o menos' }, `; ${num(F.n95, lang)} a 5%, ${num(F.n90, lang)} a 10%. Es el patrón que vale un expediente. Cautela: la pieza mayor de un lote de 10 contratos tiende al tope por construcción (es un máximo).`] })
  }
  const V = F.topV
  if (V && V.lots >= 100) {
    out.push({ key: 'topv', fig: num(V.lots, lang), color: CAT[0], /* trace: rows · vendor_id ${V.vid} */ src: en ? 'Source: CompraNet, this supplier’s same-day lots.' : 'Fuente: CompraNet, lotes del mismo día de este proveedor.',
      t: en ? [`distinct days on which ${F.topVBuyer} gave `, { vendor: V.vid, name: V.v ?? '', pf: V.pf }, ` ${num(V.pieces, lang)} no-bid contracts under the cap: ${money(V.s, lang)}, ${V.yrs[0]}–${V.yrs[V.yrs.length - 1]}; on ${num(V.near, lang)} of those days the largest piece grazed the cap.`]
        : [`días distintos en que ${F.topVBuyer} dio a `, { vendor: V.vid, name: V.v ?? '', pf: V.pf }, ` ${num(V.pieces, lang)} contratos directos bajo el tope: ${money(V.s, lang)}, ${V.yrs[0]}–${V.yrs[V.yrs.length - 1]}; ${num(V.near, lang)} de esos días la pieza mayor rozó el tope.`] })
  }
  const P = F.maypo
  if (P && P.lots > 0) {
    const other = F.maypoOther ? (en ? ` (plus ${n1(F.maypoOther, 'lot', 'lots', lang)} with other buyers)` : ` (más ${n1(F.maypoOther, 'lote', 'lotes', lang)} con otros compradores)`) : ''
    out.push({ key: 'maypo', fig: num(P.lots, lang), color: CAT[1], /* trace: rows · vendor_id ${MAYPO.vid} ∧ institution ${MAYPO.iid} · /aria/caso/${MAYPO.vid} · /captura */ src: en ? 'Source: CompraNet, this supplier’s lots with the IMSS; cross-checked with Focos Rojos and Captura.' : 'Fuente: CompraNet, lotes de este proveedor con el IMSS; cruzado con Focos Rojos y Captura.',
      t: en ? ['IMSS days with ', { vendor: P.vid, name: P.v ?? '' }, `: ${num(P.pieces, lang)} no-bid contracts, ${moneyDual(P.s, lang)}, ${num(P.near, lang)} at the cap${other}. The same firm sits in the Red Flags investigation line and in Captura: three readings of one supplier.`]
        : ['días del IMSS con ', { vendor: P.vid, name: P.v ?? '' }, `: ${num(P.pieces, lang)} contratos directos, ${moneyDual(P.s, lang)}, ${num(P.near, lang)} al tope${other}. La misma empresa está en la fila de investigación de Focos Rojos y en Captura: tres lecturas de un proveedor.`] })
  }
  const y0 = F.y_first, y24 = F.y2024
  if (y0 && y24 && y0.n > y24.n && F.cap_jump > 0) {
    const pl = meta.placebo_lots_by_m, ks = ['0.75', '1.0', '1.25', '1.5', '2.0'].filter((k) => pl[k] != null)
    out.push({ key: 'caida', fig: `${num(y0.n, lang)} → ${num(y24.n, lang)}`, /* trace: meta.by_year · high_cap_mxn 2023 → 2024 · placebo_lots_by_m */ src: en ? 'Source: CompraNet, lots by year; PEF caps for 2023 and 2024; a test with shifted caps.' : 'Fuente: CompraNet, lotes por año; topes del PEF 2023 y 2024; prueba con topes desplazados.',
      t: en ? [`lots a year, ${y0.y} to 2024${F.y2025 ? ` (${num(F.y2025.n, lang)} in 2025)` : ''}. The fall is not virtue alone: the PEF top cap jumped from ${num(F.hi23 / 1000, lang)} to ${num(F.hi24 / 1000, lang)} thousand pesos in 2024 (${pct(F.cap_jump, lang)}), so a lot needs more pieces to count. And the placebo is flat: caps at ×${ks.join(', ×')} yield ${ks.map((k) => num(pl[k], lang)).join(' · ')} lots.`]
        : [`lotes por año de ${y0.y} a 2024${F.y2025 ? ` (${num(F.y2025.n, lang)} en 2025)` : ''}. La caída no es sola virtud: el tope máximo del PEF saltó de ${num(F.hi23 / 1000, lang)} a ${num(F.hi24 / 1000, lang)} mil pesos en 2024 (${pct(F.cap_jump, lang)}), así que un lote necesita más piezas para contar. Y el placebo es plano: con los topes ×${ks.join(', ×')} salen ${ks.map((k) => num(pl[k], lang)).join(' · ')} lotes.`] })
  }
  return out
}

// ═══════════════════ B · El arranque ═══════════════════
/** The head: the finding as a count, never a company name (verdict 2026-11-04); the meta is the method in two sentences. */
export function arranqueHead(M: ArranqueModel, lang: Lang) {
  const { F } = M, en = lang === 'en', k = F.crit.length
  return {
    h1: k
      ? (en ? `${num(k, lang)} firms under a year old received almost all of their first year without a tender` : `${num(k, lang)} empresas con menos de un año de vida recibieron casi todo su primer año sin licitación`)
      : (en ? 'Firms that arrive big in federal contracting' : 'Empresas que llegan grandes a la contratación federal'),
    meta: (en
      ? ['We take every firm whose first year of federal contracts passed 100 M MXN. We mark the ones that were under a year old when they signed and got 90% or more of that money without a tender.']
      : ['Tomamos cada empresa cuyo primer año de contratos federales pasó de 100 MDP. Marcamos las que tenían menos de un año al firmar y recibieron 90% o más de ese dinero sin licitación.']) as Token[],
  }
}

export function arranqueLectura(M: ArranqueModel, lang: Lang): Claim[] {
  const { F } = M, en = lang === 'en', out: Claim[] = []
  const [a, b] = F.crit
  if (a) {
    // ponytail: the two largest are named as data (checked against SAT 69-B / SFP copies: no match); no adjective
    const firm = (r: typeof a): Token[] => [{ vendor: r.vendor_id, name: r.vendor_name ?? '' }, ` (${r.first_year}): ${money(r.y1_mxn, lang)} ${en ? 'in' : 'en'} ${n1(r.y1_n, en ? 'contract' : 'contrato', en ? 'contracts' : 'contratos', lang)}, ${pctA(r.y1_da_share, lang)} ${en ? 'by direct award' : 'por adjudicación directa'}`]
    out.push({ key: 'criticas', fig: num(F.crit.length, lang), color: SEAL, /* trace: GET /newtabs/arranque · first_year ≥ 2019 ∧ incorp_bucket ∈ {lt180, lt365} ∧ y1_da_share ≥ 0.9 ∧ ¬SPV */ src: en ? 'Source: CompraNet, each firm’s first year of contracts since 2019; age from its company RFC.' : 'Fuente: CompraNet, primer año de contratos de cada empresa desde 2019; antigüedad según su RFC de persona moral.',
      t: en ? ['firms since 2019 were ', { b: 'under a year old' }, ` when they signed and received 90% or more of their first year by direct award: ${moneyDual(F.crit_m, lang)} in all. The largest: `, ...firm(a), ...(b ? ['; ', ...firm(b)] : []), '.']
        : ['empresas desde 2019 tenían ', { b: 'menos de un año de constituidas' }, ` al firmar y recibieron por adjudicación directa 90% o más de su primer año: ${moneyDual(F.crit_m, lang)} en total. Las mayores: `, ...firm(a), ...(b ? ['; ', ...firm(b)] : []), '.'] })
  }
  if (F.spv.length) {
    const m = F.spv.reduce((x, r) => x + r.y1_mxn, 0), da = F.spv.reduce((x, r) => x + r.y1_mxn * r.y1_da_share, 0) / m
    out.push({ key: 'spv', fig: num(F.spv.length, lang), /* trace: young ∧ SPV name pattern (model.ts SPV) */ src: en ? 'Source: CompraNet; identified by name as public-private partnership vehicles.' : 'Fuente: CompraNet; identificadas por nombre como sociedades de asociación público-privada.',
      t: en ? ['special-purpose companies (public-private partnerships) were also under a year old when they signed, with ', { b: money(m, lang) }, ` in their first year. They are left out: the law requires creating them for the contract. ${pctA(da, lang)} of that money was a direct award.`]
        : ['sociedades de propósito específico (asociaciones público-privadas) también tenían menos de un año al firmar, con ', { b: money(m, lang) }, ` en su primer año. Quedan fuera: la ley exige crearlas para el contrato. ${pctA(da, lang)} de ese dinero fue por adjudicación directa.`] })
  }
  if (F.med_years != null && F.dated > 0 && F.lt365 / F.dated < 0.2) {
    const yrs = n1(Math.round(F.med_years), en ? 'year' : 'año', en ? 'years' : 'años', lang)
    out.push({ key: 'edad', fig: yrs, /* trace: meta.incorp_median_days · incorp_dated · incorp_lt365 */ src: en ? 'Source: CompraNet, the firm’s age when it signed, from its company RFC.' : 'Fuente: CompraNet, antigüedad de la empresa al firmar, según su RFC de persona moral.',
      t: en ? [`median age: only ${num(F.lt365, lang)} of the ${num(F.dated, lang)} firms with a company RFC were under a year old when they signed. Most firms that arrive big are `, { b: 'not new firms' }, `. ${num(F.n - F.dated, lang)} have no usable RFC.`]
        : [`de antigüedad mediana: solo ${num(F.lt365, lang)} de ${num(F.dated, lang)} empresas con RFC de persona moral tenían menos de un año al firmar. La mayoría de las que llegan grandes `, { b: 'no son empresas nuevas' }, `. ${num(F.n - F.dated, lang)} no tienen RFC utilizable.`] })
  }
  return out
}
