/**
 * Captura · «Del comprador al contrato» — the reviewed concept copy (money_paths_2026-10-29 src/pages.js, REVIEW F1–F5)
 * for rungs 2–4, every figure computed from the live payloads. A sentence prints only when it holds (captura.test.ts).
 * The case-specific paragraphs (the COFECE sanction, the RUBLI case file) are about one pair, Hemoser ← IMSS, read and
 * sourced on 2026-10-29; they print only while that pair is the one the frame follows.
 */
import type { CapturaMajority, CapturaPairDetail } from '@/api/captura'
import type { ContractDetail } from '@/api/types'
import { getRiskLevelFromScore } from '@/lib/constants'
import { IMSS, type Relevo } from '@/lib/captura/relevo'
import { dateS, money, moneyDual, monthOf, mxnDual, n, nn, pct, type Lang } from './fmt'
import type { RungK } from './ladder'

/** The pair the sourced paragraphs describe (COFECE-031-2020, DE-011-2016; Milenio 5 Mar 2025). */
export const HEMOSER = 6038

export interface CRail { n: string; t: string; src?: string; seal?: boolean }
export interface CChap { k: RungK; n: string; kicker: string; title: string; prose: string[]; cut?: string; railK: string; rail: CRail[] }

const tenths = (x: number, l: Lang) => { const k = Math.round(x * 10); return l === 'en' ? `${['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'][k]} in ten` : `${['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez'][k]} de cada diez` }

/** The claims the copy makes in words, as booleans (each pinned true and false in captura.test.ts). */
export function capturaHolds(m: Relevo, maj: CapturaMajority | null, pair: CapturaPairDetail | null) {
  const sh = m.chapters.filter((c) => c.a >= 2013).map((c) => c.share)
  const salud = m.bySector.get(1), energia = m.bySector.get(4)
  const all = m.series.filter((s) => s.sector != null)
  const shares = maj ? maj.sex.filter((s) => s.a >= 2013 && s.b <= 2024 && s.buyer_years > 0).map((s) => s.half / s.buyer_years) : []
  const pr = pair?.pair
  const lic = pair?.proc?.find((p) => p.type === 'licitacion')
  return {
    /** «entre uno y tres pesos de cada diez» each administration */
    oneToThreeInTen: sh.length > 0 && sh.every((s) => s >= 0.1 && s < 0.35),
    /** «con Calderón el dinero a proveedores dominantes era de energía» */
    energyLargestEver: !!energia && all.every((s) => s.mAll <= energia.mAll),
    /** «la captura vive en la salud»: health holds over half the current dominant suppliers */
    healthHoldsCurrent: !!salud && m.cur.length > 0 && salud.nCur / m.cur.length > 0.5,
    /** «una parte parecida de los compradores» (La mitad): the shares stay within ten points */
    majoritySimilar: shares.length >= 2 && Math.max(...shares) - Math.min(...shares) <= 0.1,
    /** «más de ocho de cada diez pesos de su ingreso federal vienen de ese comprador» */
    overEightInTen: !!pr && pr.sh > 0.8,
    /** «más de veinte años de un solo cliente» */
    overTwentyYears: !!pr && pr.y1 - pr.y0 >= 20,
    /** «casi todo ese dinero se firmó tras licitaciones públicas» */
    mostlyTendered: !!pr && !!lic && lic.m / pr.m > 0.9,
    /** «es el proveedor dominante vigente con más dinero de todo el registro» */
    topCurrent: !!pr && m.cur.every((c) => c.m <= pr.m) && m.cur.some((c) => c.vendor_id === pr.vendor_id && c.institution_id === pr.institution_id),
  }
}

export function capturaCopy({ m, maj, pair, contract }: { m: Relevo; maj: CapturaMajority | null; pair: CapturaPairDetail | null; contract: ContractDetail | null }, l: Lang): { chapters: CChap[] } {
  const t = (es: string, en: string) => (l === 'en' ? en : es)
  const H = capturaHolds(m, maj, pair)
  const ch = (k: string) => m.chapters.find((c) => c.key === k)
  const epn = ch('epn'), amlo = ch('amlo'), last = m.chapters[m.chapters.length - 1]
  const salud = m.bySector.get(1)
  const imssCur = m.cur.filter((p) => p.institution_id === IMSS), imssPost = imssCur.filter((p) => p.post_n > 0).length
  const shares = maj ? maj.sex.filter((s) => s.a >= 2013 && s.b <= 2024 && s.buyer_years > 0).map((s) => s.half / s.buyer_years) : []
  const out: CChap[] = []

  // ── 2 · the buyers ──
  const p2: string[] = []
  // no comparison across 2010 and no «the capture moved from energy to health» line: Pemex and the CFE left
  // CompraNet, so energy stopped being visible (verdict 2026-11-04, docs/patrones_verdicts/editor.md § 5)
  if (epn && H.oneToThreeInTen) p2.push(t(`Desde Peña Nieto, entre uno y tres pesos de cada diez que gastaron estos compradores fueron a empresas que dependen de ellos: ${pct(epn.share, l)} con Peña Nieto, ${pct(last.share, l)} en lo que va de Sheinbaum. Antes de 2010 los registros apenas identifican al proveedor, así que no se comparan.`,
    `Since Peña Nieto, between one and three pesos in ten that these buyers spent went to companies that depend on them: ${pct(epn.share, l)} under Peña Nieto, ${pct(last.share, l)} so far under Sheinbaum. Before 2010 the records barely identify suppliers, so they are not compared.`))
  if (salud && H.healthHoldsCurrent) p2.push(t(`Hoy ${tenths(salud.nCur / m.cur.length, l)} proveedores dominantes vigentes le venden a un comprador de salud, y ${n(imssCur.length, l)} son del IMSS.${H.majoritySimilar ? ' La otra cara es la mayoría: con Peña Nieto y con AMLO, una parte parecida de los compradores le dio la mitad de su año a una sola empresa.' : ''}`,
    `Today ${tenths(salud.nCur / m.cur.length, l)} current dominant suppliers sell to a health buyer, and ${n(imssCur.length, l)} sell to the IMSS.${H.majoritySimilar ? ' The other side is the majority: under Peña Nieto and under AMLO, a similar share of buyers handed half their year to one company.' : ''}`))
  const r2: CRail[] = []
  if (epn && amlo) r2.push({ n: pct(epn.share, l), t: t(`del gasto de estos compradores fue a proveedores dominantes con Peña Nieto; ${pct(amlo.share, l)} con AMLO.`, `of these buyers’ spend went to dominant suppliers under Peña Nieto; ${pct(amlo.share, l)} under AMLO.`), src: t(`dinero a proveedores dominantes entre gasto de los ${m.buyers} compradores, por sexenio; 2002–2010 es dato de baja calidad`, `money to dominant suppliers over the ${m.buyers} buyers’ spend, by administration; 2002–2010 is weak data`) })
  r2.push({ n: n(imssCur.length, l), t: t(`proveedores dominantes vigentes tiene el IMSS; ${n(imssPost, l)} siguen firmando en ComprasMX.`, `current dominant suppliers belong to the IMSS; ${n(imssPost, l)} are still signing in ComprasMX.`), src: t('proveedor dominante = al menos 80% de su ingreso federal viene del IMSS', 'dominant supplier = at least 80% of its federal income comes from the IMSS') })
  if (shares.length >= 2 && H.majoritySimilar) r2.push({ n: `${Math.round(100 * Math.min(...shares))}–${Math.round(100 * Math.max(...shares))} ${t('de 100', 'in 100')}`, t: t('compradores-año le dieron la mitad de su año a una sola empresa, con Peña Nieto y con AMLO.', 'buyer-years handed half their year to one company, under Peña Nieto and under AMLO.'), src: t('La mitad · compradores-año con gasto ≥ 100 MDP, 2013–2024', 'Half · buyer-years with spend ≥ 100M MXN, 2013–2024') })
  out.push({ k: 2, n: 'II', kicker: t(`§ ${n(m.buyers, l)} compradores federales · cinco sexenios`, `§ ${n(m.buyers, l)} federal buyers · five administrations`), title: t('Los compradores: la cuota sube y baja; cambia quién la cobra', 'The buyers: the share rises and falls; who takes it changes'), prose: p2,
    cut: t('Y aquí lo que no se ve: una dependencia es un hecho del registro de adjudicaciones, no una prueba. El registro dice quién cobró y cuánto; no dice por qué lo eligieron.', 'And here is what cannot be seen: a dependency is a fact of the award record, not proof. The register says who was paid and how much; it does not say why they were chosen.'),
    railK: t('§ lo que dice el registro', '§ what the register says'), rail: r2 })

  // ── 3 · the pair ──
  if (pair) {
    const pr = pair.pair, lic = pair.proc?.find((p) => p.type === 'licitacion'), peak = pr.yrs.reduce((b, r) => (r[1] > b[1] ? r : b), pr.yrs[0])
    const hem = pr.vendor_id === HEMOSER && pr.institution_id === IMSS
    const bs = m.buyer.get(pr.institution_id)?.siglas ?? t('su comprador', 'its buyer')
    const lvl = pr.risk != null ? getRiskLevelFromScore(pr.risk) : null
    const prose: string[] = []
    if (hem && H.overEightInTen && H.topCurrent) prose.push(t(`Hemoser, S.A. de C.V. le vende al IMSS estudios de laboratorio clínico desde ${pr.y0}. Más de ocho de cada diez pesos de su ingreso federal vienen de ese comprador; el resto, de otros ${pr.nbuyers != null ? pr.nbuyers - 1 : '—'} compradores de salud. Es el proveedor dominante vigente con más dinero de todo el registro.`, `Hemoser, S.A. de C.V. has sold clinical laboratory services to the IMSS since ${pr.y0}. More than eight pesos in ten of its federal income come from that buyer; the rest, from ${pr.nbuyers != null ? pr.nbuyers - 1 : '—'} other health buyers. It is the current dominant supplier with the most money in the whole register.`))
    else prose.push(t(`El proveedor dominante vigente con más dinero del registro le vende a ${bs} desde ${pr.y0}; ${pct(pr.sh, l)} de su ingreso federal viene de ese comprador.`, `The current dominant supplier with the most money in the register has sold to the ${bs} since ${pr.y0}; ${pct(pr.sh, l)} of its federal income comes from that buyer.`))
    if (hem && H.mostlyTendered) prose.push(t(`Casi todo ese dinero se firmó tras licitaciones públicas. En agosto de 2020 la Comisión Federal de Competencia Económica multó a Hemoser, a otras diez empresas y a 14 personas físicas por coordinar posturas en licitaciones de laboratorio y banco de sangre del IMSS y del ISSSTE de 2008 a 2015; en marzo de 2025 la Suprema Corte le negó un amparo. El año más grande de la pareja fue ${peak[0]}, el del contrato más grande, licitado en 2019.${pr.post_n > 0 ? ' Sigue firmando después del apagón de CompraNet, ahora en ComprasMX.' : ''}`,
      `Almost all of that money was signed after public tenders. In August 2020 Mexico’s competition authority (COFECE) fined Hemoser, ten other companies and 14 individuals for coordinating bids in IMSS and ISSSTE laboratory and blood-bank tenders of 2008–2015; in March 2025 the Supreme Court denied it an amparo. The pair’s largest year was ${peak[0]}, that of its largest contract, tendered in 2019.${pr.post_n > 0 ? ' It keeps signing after the CompraNet blackout, now in ComprasMX.' : ''}`))
    if (hem && pr.tier != null) prose.push(t(`RUBLI documentó además un caso sobre esta pareja; el expediente lo titula división de contratos el mismo día: doce contratos del 2 de agosto de 2023. La fila de investigación la pone en el ${pr.tier === 1 ? 'primer' : pr.tier === 2 ? 'segundo' : pr.tier === 3 ? 'tercer' : 'cuarto'} nivel. El caso y el indicador son indicadores de riesgo, no acusaciones; la multa de la COFECE es un hecho sancionado.`,
      `RUBLI also documented a case on this pair; the file is titled same-day contract splitting: twelve contracts on August 2, 2023. The investigation queue puts it in the ${['first', 'second', 'third', 'fourth'][pr.tier - 1] ?? 'fourth'} tier. The case and the indicator are risk indicators, not accusations; the COFECE fine is a sanctioned fact.`))
    const r3: CRail[] = [
      { n: pct(pr.sh, l), t: t(`de su ingreso federal viene del ${bs}.`, `of its federal income comes from the ${bs}.`), src: `${money(pr.m, l)} ${t('de', 'of')} ${money(pr.vt, l)} · 2002–2025` },
      { n: money(pr.m, l), t: t(`en ${nn(pr.n, l, 'contrato', 'contratos', 'contract', 'contracts')} con el ${bs} desde ${pr.y0}.`, `in ${nn(pr.n, l, 'contrato', 'contratos', 'contract', 'contracts')} with the ${bs} since ${pr.y0}.`), src: 'CompraNet + ComprasMX' },
    ]
    if (lic && pr.da != null) r3.push({ n: pct(lic.m / pr.m, l), t: t(`de ese dinero se firmó tras licitación pública; ${pct(pr.da, l)} sin concurso.`, `of that money was signed after a public tender; ${pct(pr.da, l)} without one.`), src: t('procedimiento, filas de CompraNet', 'procedure, CompraNet rows') })
    if (hem) r3.push({ n: t('626 millones', '626 million'), t: t('de pesos en multas impuso la COFECE a Hemoser, a otras diez empresas y a 14 personas físicas por coordinar posturas en siete licitaciones de laboratorio y banco de sangre del IMSS y el ISSSTE (2008–2015); la Suprema Corte le negó el amparo en 2025.', 'pesos in fines is what COFECE imposed on Hemoser, ten other companies and 14 individuals for coordinating bids in seven IMSS and ISSSTE laboratory and blood-bank tenders (2008–2015); the Supreme Court denied its amparo in 2025.'), src: t('COFECE-031-2020 · expediente DE-011-2016 · Milenio, 5 mar 2025', 'COFECE-031-2020 · file DE-011-2016 · Milenio, 5 Mar 2025') })
    r3.push({ n: money(peak[1], l), t: t(`firmó en ${peak[0]}, su año más grande.`, `signed in ${peak[0]}, its largest year.`), src: t('contratos por año de firma', 'contracts by year signed') })
    if (pr.risk != null && lvl) r3.push({ n: pr.risk.toFixed(2).replace(/^0/, ''), seal: lvl === 'critical', t: t(`indicador medio de riesgo de la pareja · ${{ critical: 'crítico', high: 'alto', medium: 'medio', low: 'bajo' }[lvl]}${pr.tier != null ? ` · nivel ${pr.tier} de la fila de investigación` : ''}.`, `mean risk indicator of the pair · ${lvl}${pr.tier != null ? ` · tier ${pr.tier} of the investigation queue` : ''}.`), src: t('modelo v0.9.2', 'model v0.9.2') })
    if (pr.post_n > 0) r3.push({ n: n(pr.post_n, l), t: t(`contratos en ComprasMX desde el apagón · ${money(pr.post, l)}.`, `contracts in ComprasMX since the blackout · ${moneyDual(pr.post, l)}.`), src: t('ComprasMX', 'ComprasMX') })
    out.push({ k: 3, n: 'III', kicker: t(`§ ${pct(pr.sh, l)} de su ingreso federal viene del ${bs}${hem ? ' · caso documentado en RUBLI' : ''}`, `§ ${pct(pr.sh, l)} of its federal income comes from the ${bs}${hem ? ' · case documented in RUBLI' : ''}`),
      title: hem && H.overTwentyYears ? t('La pareja: Hemoser y el IMSS, más de veinte años de un solo cliente', 'The pair: Hemoser and the IMSS, more than twenty years of one client') : t('La pareja: el proveedor dominante vigente con más dinero', 'The pair: the current dominant supplier with the most money'),
      prose, cut: t(`Y aquí lo que no se ve: el registro dice cuántos contratos y cuánto dinero; no dice por qué el ${bs} la eligió${pr.lockn ? ` en ${pr.lockn} de sus años` : ''} ni qué precio pagó por estudio.`, `And here is what cannot be seen: the register says how many contracts and how much money; it does not say why the ${bs} chose it${pr.lockn ? ` in ${pr.lockn} of its years` : ''}, nor what price it paid per test.`),
      railK: t('§ la pareja en el registro', '§ the pair in the register'), rail: r3 })
  }

  // ── 4 · the contract ──
  if (pair && contract) {
    const c = contract, lvl = getRiskLevelFromScore(c.risk_score ?? 0), crit = lvl === 'critical'
    const tender = !c.is_direct_award, intl = /internacional/i.test(c.procedure_character ?? '')
    const yrs = c.start_date && c.end_date ? Math.round((Date.parse(c.end_date) - Date.parse(c.start_date)) / (365.25 * 864e5)) : null
    const f = c.risk_factors ?? []
    const price = f.some((x) => x.startsWith('price')), split = f.some((x) => x.startsWith('split'))
    const largest = pair.contracts.every((q) => q.amount_mxn <= (c.amount_mxn ?? 0))
    const prose: string[] = [t(`${largest ? 'Es el contrato más grande que la pareja firmó' : 'Es un contrato de la pareja'}: ${mxnDual(c.amount_mxn ?? 0, l, c.contract_date ? +c.contract_date.slice(0, 4) : undefined)}${c.title ? ` por ${c.title.toLowerCase().includes('laboratorio') ? 'estudios de laboratorio clínico' : 'lo que dice su objeto'}` : ''}, ${tender ? `adjudicado en licitación pública${intl ? ' internacional' : ''}` : 'adjudicado sin concurso'} y firmado en ${c.contract_date ? `${monthOf(c.contract_date, l)} de ${c.contract_date.slice(0, 4)}` : '—'}${yrs ? `, con vigencia de ${yrs === 1 ? 'un año' : yrs === 2 ? 'dos años' : `${yrs} años`}` : ''}.${c.publication_date && c.award_date ? ` La convocatoria se publicó en ${monthOf(c.publication_date, l)} de ${c.publication_date.slice(0, 4)} y el fallo llegó en ${monthOf(c.award_date, l)}.` : ''}`,
      `${largest ? 'It is the largest contract the pair signed' : 'It is one of the pair’s contracts'}: ${mxnDual(c.amount_mxn ?? 0, l, c.contract_date ? +c.contract_date.slice(0, 4) : undefined)}${c.title ? ` for ${c.title.toLowerCase().includes('laboratorio') ? 'clinical laboratory services' : 'what its title says'}` : ''}, ${tender ? `awarded in a${intl ? 'n international' : ''} public tender` : 'awarded without a tender'} and signed in ${c.contract_date ? `${monthOf(c.contract_date, l)} ${c.contract_date.slice(0, 4)}` : '—'}${yrs ? `, valid for ${yrs === 1 ? 'one year' : yrs === 2 ? 'two years' : `${yrs} years`}` : ''}.${c.publication_date && c.award_date ? ` The call was published in ${monthOf(c.publication_date, l)} ${c.publication_date.slice(0, 4)} and the award came in ${monthOf(c.award_date, l)}.` : ''}`)]
    if (crit) prose.push(t(`El modelo lo marca como crítico${price || split ? `: ${[price ? 'su precio queda fuera de rango para su categoría' : '', split ? 'aparece una posible división en contratos del mismo expediente' : ''].filter(Boolean).join(' y ')}` : ''}. Es un indicador de riesgo, no una acusación.`, `The model flags it as critical${price || split ? `: ${[price ? 'its price falls outside the range for its category' : '', split ? 'a possible split across contracts of the same file appears' : ''].filter(Boolean).join(' and ')}` : ''}. A risk indicator, not an accusation.`))
    out.push({ k: 4, n: 'IV', kicker: t(`§ ${tender ? `licitación pública${intl ? ' internacional' : ''}` : 'sin concurso'} · firmado en ${(c.contract_date ?? '').slice(0, 4)} · indicador ${{ critical: 'crítico', high: 'alto', medium: 'medio', low: 'bajo' }[lvl]}`, `§ ${tender ? `${intl ? 'international ' : ''}public tender` : 'no tender'} · signed in ${(c.contract_date ?? '').slice(0, 4)} · ${lvl} indicator`),
      title: largest ? t('El contrato: el más grande de la pareja, y lo que sigue después de la firma', 'The contract: the pair’s largest, and what follows the signature') : t('El contrato, y lo que sigue después de la firma', 'The contract, and what follows the signature'), prose,
      cut: t('Y aquí se acaba el rastro: en lo que RUBLI reúne no hay pago, ni entrega, ni precio por estudio. Lo que sigue a la firma es una página en blanco.', 'And here the trail ends: in what RUBLI gathers there is no payment, no delivery, no price per test. What follows the signature is a blank page.'),
      railK: t('§ el contrato como consta', '§ the contract as recorded'), rail: [
        { n: money(c.amount_mxn ?? 0, l), t: t(`monto firmado · ${tender ? 'licitación pública' : 'sin concurso'}${c.procedure_character ? ` · ${c.procedure_character.toLowerCase()}` : ''}.`, `amount signed · ${tender ? 'public tender' : 'no tender'}${c.procedure_character ? ` · ${c.procedure_character.toLowerCase()}` : ''}.`), src: `${c.contract_number ?? ''} · ${c.procedure_number ?? ''}` },
        ...(c.publication_date ? [{ n: dateS(c.publication_date, l), t: t(`se publicó la convocatoria; fallo el ${dateS(c.award_date, l)}; firma el ${dateS(c.contract_date, l)}; vigencia ${dateS(c.start_date, l)} → ${dateS(c.end_date, l)}.`, `the call was published; award on ${dateS(c.award_date, l)}; signed ${dateS(c.contract_date, l)}; valid ${dateS(c.start_date, l)} → ${dateS(c.end_date, l)}.`), src: t('fechas como constan en CompraNet', 'dates as recorded in CompraNet') }] : []),
        { n: (c.risk_score ?? 0).toFixed(2).replace(/^0/, ''), seal: crit, t: t(`indicador de riesgo · ${{ critical: 'crítico', high: 'alto', medium: 'medio', low: 'bajo' }[lvl]}.`, `risk indicator · ${lvl}.`), src: t('modelo v0.9.2', 'model v0.9.2') },
        { n: '0', t: t('pagos, entregas o precios por estudio ligados a este contrato, en lo que RUBLI reúne.', 'payments, deliveries or unit prices tied to this contract, in what RUBLI gathers.'), src: t('la Cuenta Pública reporta por línea de gasto, no por contrato', 'the federal accounts report by budget line, not by contract') },
      ] })
  }
  return { chapters: out }
}
