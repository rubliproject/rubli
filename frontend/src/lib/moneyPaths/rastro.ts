/**
 * «El rastreo de un peso» — the reviewed V2 copy (rastro_concepts_2026-10-28, REVIEW_V2 → SHIP; carried verbatim by
 * money_paths_2026-10-29 src/pages.js) with every figure computed from the trail pack (rastro.data.json) and, for the
 * Gasto a ciegas hinge, from GET /no-se-ve/imss. Claims print only when true (rastro.test.ts pins each).
 * Inline marks: **bold**, *italic*. «Cuatro cortes»: presupuesto↔contrato · contrato↔competencia · la firma · los postores.
 */
import pack from './rastro.data.json'
import { cv, date, n, nn, pct, monthOf, type Lang } from './fmt'

export type RastroPack = typeof pack
export const RASTRO: RastroPack = pack
export const MAYPO = pack.maypo.id
export const IMSS = 251

const L = (l: Lang) => (es: string, en: string) => (l === 'en' ? en : es)
const MM = (x: number, l: Lang, d = 0) => (l === 'en' ? `${n(x, l, d)} million` : `${n(x, l, d)} millones`)
const CTR = (x: number, l: Lang) => nn(x, l, 'contrato', 'contratos', 'contract', 'contracts')
const PROV = (x: number, l: Lang) => nn(x, l, 'proveedor', 'proveedores', 'supplier', 'suppliers')
const CON = (y: number, da?: boolean) => `/contracts?institution_id=${IMSS}&category_id=20&year=${y}${da ? '&is_direct_award=true' : ''}`

export interface Stage { k: string; c: number; t: string; d: string; what: [string, string]; cut?: string; lost?: boolean; seal?: boolean; why?: string; href: string; rows: [string, string][] }

/** A trail from GET /rastro/trail (scripts/precompute_rastro.py) replaces the bundled pack only when every claim the
 *  copy makes still holds on it; otherwise the page keeps the bundled figures its words were checked against. */
export function trailOk(p: unknown): p is RastroPack {
  try {
    const R = p as RastroPack
    return Object.values(claimsHold(R)).every(Boolean) && Object.values(despuesHolds(R)).every(Boolean) && R.contract?.id === RASTRO.contract.id && R.maypo.imss24.exc.some((e) => e.s === 'fr. I') && !!R.read && typeof R.close.last_sig === 'string' && typeof R.close.big_sig === 'string'
  } catch { return false }
}

/** The trail must nest: every step a part of the one before (from step 3 on, direct awards only). */
export function nests(R: RastroPack = RASTRO): boolean {
  const c = R.c
  return c.ex === 100 && c.ex > c.reg && c.reg > c.da && c.da > c.t12 && c.t12 > c.maypo && c.maypo > 0
}

export function stages(l: Lang, R: RastroPack = RASTRO): Stage[] {
  const t = L(l), C = R.c, R24 = R.reg24, T12 = R.tiers24['1'].nv + R.tiers24['2'].nv, MPO = R.maypo
  const b24 = MPO.buyers24, imssShare = b24[0].mdp / b24.reduce((a, b) => a + b.mdp, 0)
  return [
    { k: 'ex', c: C.ex, t: t('El gasto', 'The spend'), d: t('El peso completo, como lo anota Hacienda en su libro de cuentas.', 'The whole peso, as the finance ministry enters it in its books.'), what: [MM(R.ex24 / 1e6, l), t('gasto en medicinas', 'spent on medicines')], href: '/gasto-a-ciegas?ente=imss', rows: [[t('Cuenta Pública', 'Public accounts'), t('ramo 50, partida 25301, ejercido 2024', 'branch 50, line 25301, exercised 2024')]] },
    { k: 'reg', c: C.reg, t: t('El contrato', 'The contract'), d: t('Lo que tiene un contrato firmado ese mismo año.', 'What has a contract signed that same year.'), what: [CTR(R24.n, l), PROV(R24.nv, l)], cut: t('aquí lo perdemos · 1', 'we lose it here · 1'), lost: true, why: t('el libro no nombra el contrato y el archivo de contratos no nombra el año del pago', 'the book never names the contract and the contract file never names the year it was paid'), href: CON(2024), rows: [[t('Registro', 'Register'), `${MM(R24.mdp, l)} · ${t('IMSS · medicinas · 2024', 'IMSS · medicines · 2024')}`]] },
    { k: 'da', c: C.da, t: t('Sin rivales', 'No rivals'), d: t('Lo que se firmó sin que nadie más compitiera.', 'What was signed with nobody else bidding.'), what: [t(`${MM(R24.da, l)} directos`, `${MM(R24.da, l)} direct`), t('el resto concursó', 'the rest was tendered')], cut: t('aquí lo perdemos · 2', 'we lose it here · 2'), lost: true, why: t('sin rivales no hay otro precio con qué comparar', 'with no rivals there is no other price to compare'), href: CON(2024, true), rows: R.exc24.slice(0, 4).map((e) => [l === 'en' ? e.s_en : e.s, `${cv(e.cent, l, 1)} ¢ · ${CTR(e.n, l)} · ${l === 'en' ? e.lbl_en : e.lbl}`] as [string, string]) },
    { k: 't12', c: C.t12, t: t('Bajo la lupa', 'Under the lens'), d: t('De eso, lo que fue a los proveedores que RUBLI revisaría primero.', 'Of that, what went to the suppliers RUBLI would look at first.'), what: [PROV(T12, l), t('dos niveles más altos', 'two highest tiers')], cut: t('lo que marca el modelo', 'what the model flags'), lost: false, href: '/aria', rows: [[t('Nivel 1', 'Tier 1'), `${PROV(R.tiers24['1'].nv, l)} · ${MM(R.tiers24['1'].mdp, l)}`], [t('Nivel 2', 'Tier 2'), `${PROV(R.tiers24['2'].nv, l)} · ${MM(R.tiers24['2'].mdp, l)}`]] },
    { k: 'maypo', c: C.maypo, t: 'Maypo', d: t('De eso, lo que firmó Maypo sin concurso.', 'Of that, what Maypo signed without a tender.'), what: [`Maypo · ${CTR(MPO.imss24.n, l)}`, t('nivel más alto', 'highest tier')], cut: t('un nombre', 'one name'), lost: false, seal: true, href: `/vendors/${MPO.id}`, rows: [[t('Compradores 2024', 'Buyers 2024'), `${b24.length} · IMSS ${pct(imssShare, l)}`], [t('Fila de investigación', 'Investigation queue'), t('nivel más alto', 'top tier')]] },
    { k: 'after', c: 0, t: t('Después', 'After'), d: t('Lo que se ve después, en los registros que reunimos.', 'What shows afterwards, in the records we gather.'), what: [t('ni pago ni precio', 'no payment, no price'), t('en nuestros registros', 'in our records')], cut: t('aquí lo perdemos · 3 y 4', 'we lose it here · 3 and 4'), lost: true, why: t('nada une un pago, una entrega o un precio por pieza a un contrato; y desde septiembre de 2025 los contratos llegan sin la lista de postores', 'nothing links a payment, a delivery or a unit price to a contract; and since September 2025 contracts arrive without the bidder list'), href: `/contracts/${R.contract.id}`, rows: [] },
  ]
}

export interface RailItem { n: string; t: string; src?: string; seal?: boolean; href?: string; hrefLabel?: string; todo?: string }
export interface Chap { k: 1 | 2 | 3 | 4; n: string; kicker: string; title: string; prose: string[]; cut?: string; railK: string; rail: RailItem[] }

/** Maypo's last contract date as «finales de octubre» — the part of the month, then the month. */
function partOf(d: string, l: Lang) {
  const day = +d.slice(8, 10)
  return day >= 20 ? (l === 'en' ? 'late ' : 'finales de ') : day <= 10 ? (l === 'en' ? 'early ' : 'principios de ') : (l === 'en' ? 'mid-' : 'mediados de ')
}

/** «¿Y desde entonces?» — the after-beat. Each comparison sentence holds on the counts (rastro.test.ts). */
export function despues(l: Lang, R: RastroPack = RASTRO) {
  const t = L(l), nC = R.close.n, im = R.close.imss, r25 = nC['2025'] / nC['2023']
  const tenth = r25 < 0.13
  // the buyers are named from the pack; «otra vez» / «también» only when they are the IMSS
  const lastI = R.close.last_sig === 'IMSS', bigI = R.close.big_sig === 'IMSS'
  const lastEs = lastI ? 'otra vez con el IMSS' : `con otro comprador (${R.close.last_sig})`, lastEn = lastI ? 'again with the IMSS' : `with ${R.close.last_sig}`
  const bigEs = bigI ? (lastI ? 'también fue con el IMSS' : 'fue con el IMSS') : `fue con otro comprador (${R.close.big_sig})`
  const bigEn = bigI ? (lastI ? 'was with the IMSS too' : 'was with the IMSS') : `was with ${R.close.big_sig}`
  return {
    h: t('¿Y desde entonces?', 'And since then?'),
    p: t(`¿Ha firmado algo Maypo después de aquel 31 de diciembre? Sí. No se fue, pero cada vez firma menos. En 2024 ya firmó menos de la mitad de contratos que el año anterior. En 2025, ${tenth ? 'cerca de una décima parte' : 'mucho menos'} que en 2023. Y en lo que va de 2026, menos todavía. En el mismo registro, el IMSS entero también aparece con menos contratos cada año; los de Maypo caen más rápido. El más reciente que nos llegó es de ${partOf(R.close.last, l)}${monthOf(R.close.last, l)}, ${lastEs}. El más grande de este año ${bigEs}: unos ${n(R.close.big_mdp, l)} millones de pesos, en ${monthOf(R.close.big_date, l)}. El registro dice cuántos contratos firma; no dice por qué firma menos. Esa pregunta sigue abierta.`,
      `Has Maypo signed anything since that December 31? Yes. It hasn’t gone away, but it signs less and less. In 2024 it already signed fewer than half as many contracts as the year before. In 2025, ${tenth ? 'about a tenth as many' : 'far fewer'} as in 2023. And so far in 2026, fewer still. In the same register, the IMSS as a whole also shows fewer contracts every year; Maypo’s numbers fall faster. The latest to reach us is from ${partOf(R.close.last, l)}${monthOf(R.close.last, l)}, ${lastEn}. This year’s largest ${bigEn}: about ${n(R.close.big_mdp, l)} million pesos, in ${monthOf(R.close.big_date, l)}. The record shows how many contracts it signs; it doesn’t say why it signs fewer. That question stays open.`),
    src: `${t('Contratos de Maypo por año en el registro de RUBLI', 'Maypo contracts per year in the RUBLI register')}: 2023 ${n(nC['2023'], l)} · 2024 ${n(nC['2024'], l)} · 2025 ${n(nC['2025'], l)} · 2026 ${n(nC['2026'], l)} ${t(`(al ${date(R.close.last, l)})`, `(to ${date(R.close.last, l)})`)}. ${t('Del IMSS, con cualquier proveedor', 'IMSS, all suppliers')}: ${n(im['2023'], l)} · ${n(im['2024'], l)} · ${n(im['2025'], l)} · ${n(im['2026'], l)}. ${t(`Desde 2025, CompraNet hasta el 28 de septiembre y después ComprasMX; 2026 va incompleto. Los otros registros de Maypo no tienen contratos desde 2023. Consulta del ${date(R.close.read, l)}.`, `From 2025, CompraNet to September 28 and ComprasMX after; 2026 is a partial year. Maypo’s other vendor records have no contracts since 2023. Read on ${date(R.close.read, l)}.`)}`,
  }
}

/** The claims the after-beat makes, as booleans (each must hold for the copy above to be true). */
export function despuesHolds(R: RastroPack = RASTRO) {
  const c = R.close.n, im = R.close.imss
  const ratio = (a: number, b: number) => a / b
  return {
    halfIn2024: c['2024'] < c['2023'] / 2,
    fallsEveryYear: c['2024'] < c['2023'] && c['2025'] < c['2024'] && c['2026'] < c['2025'],
    imssFalls: im['2024'] < im['2023'] && im['2025'] < im['2024'] && im['2026'] < im['2025'],
    maypoFaster: ratio(c['2025'], c['2023']) < ratio(im['2025'], im['2023']) && ratio(c['2026'], c['2023']) < ratio(im['2026'], im['2023']),
  }
}

export interface Head { h1: string; lede: string; verdict: string[]; verdictK: string; defs: string; meta: string }

export function head(l: Lang, contractDate: string, R: RastroPack = RASTRO): Head {
  const t = L(l), C = R.c
  const lastDay = contractDate.slice(5, 10) === '12-31'
  return {
    meta: `IMSS · ${t('medicinas', 'medicines')} · 2024 · ${t('lo que se ve, no quién hizo trampa', 'about what’s visible, not who cheated')}`,
    h1: lastDay
      ? t('El último día de 2024, el IMSS le firmó a Farmacéuticos Maypo su contrato más grande del año. Es lo último que alcanzamos a ver de ese dinero.', 'On the last day of 2024, the IMSS signed Farmacéuticos Maypo’s biggest contract of the year. It’s the last thing we can see of that money.')
      : t(`El ${date(contractDate, l)}, el IMSS le firmó a Farmacéuticos Maypo su contrato más grande del año. Es lo último que alcanzamos a ver de ese dinero.`, `On ${date(contractDate, l)}, the IMSS signed Farmacéuticos Maypo’s biggest contract of the year. It’s the last thing we can see of that money.`),
    lede: t('Rebobinamos. Ese contrato salió de un peso del presupuesto de medicinas del Seguro Social. Lo seguimos por los dos archivos públicos que lo cuentan, para responder una pregunta: ¿cómo llegó hasta esa firma, y por qué ahí se nos acaba?', 'Rewind. That contract came out of one peso of the medicine budget at the IMSS, Mexico’s largest social-security institute. We traced it through the two public files that record it, to answer one question: how did it get to that signature, and why does the trail end there?'),
    verdict: [cv(C.reg, l, 0), cv(C.da, l, 0), cv(C.t12, l, 0), cv(C.maypo, l, 1), '0'],
    verdictK: t('lo que queda a la vista de un peso, en centavos', 'what’s left in view of one peso, in centavos'),
    defs: t('Cuatro veces lo perdemos de vista. Cuando el presupuesto no dice qué contrato pagó. Cuando se compra sin concurso y no hay otro precio. Cuando llega la firma y, en lo que reunimos, no hay nada después. Y desde septiembre de 2025, cuando los contratos ya no nos llegan con la lista de quién compitió.', 'Four times, we lose sight of it. When the budget doesn’t say which contract it paid. When something’s bought without a tender and there’s no other price. When the signature comes and, in what we gather, nothing follows. And since September 2025, when contracts stopped reaching us with the list of who competed.'),
  }
}

/** The four chapters. `imss24` = the IMSS's 2024 purchases+works, exercised and in view (GET /no-se-ve/imss), when loaded. */
export function chapters(l: Lang, imss24: { ex: number; vis: number } | null, R: RastroPack = RASTRO): Chap[] {
  const t = L(l), C = R.c, R24 = R.reg24, MPO = R.maypo
  const FRI = MPO.imss24.exc.find((e) => e.s === 'fr. I')!
  const b24 = MPO.buyers24, imssShare = b24[0].mdp / b24.reduce((a, b) => a + b.mdp, 0)
  const med = (y: '2023' | '2024' | '2025') => R.cp[y].med / 1e6
  const rail1: RailItem[] = [
    { n: `${cv(C.reg, l, 0)} ¢`, t: t('de cada peso sí traen contrato del mismo año.', 'of every peso do come with a same-year contract.'), src: t('contratos del año entre lo gastado en la línea de medicinas', 'contracts of the year over the spend on the medicines line') },
    { n: pct(R.reg_cn['2025'].mdp / med('2025'), l), t: t('en 2025 pasa al revés: se firmó más de lo que se gastó, en buena parte porque la compra conjunta de dos años se firmó de un jalón.', 'in 2025 it runs backwards: more was signed than spent, largely because a two-year joint purchase was signed all at once.'), src: t(`contratos de 2025 en CompraNet entre lo gastado en 2025; con ComprasMX, ${pct(R.reg['2025'].mdp / med('2025'), l)}`, `2025 CompraNet contracts over 2025 spend; with ComprasMX, ${pct(R.reg['2025'].mdp / med('2025'), l)}`) },
    { n: `${cv((R.reg['2023'].mdp / med('2023')) * 100, l, 0)} ¢`, t: t('en 2023, con la misma regla.', 'in 2023, by the same rule.'), src: t('contratos de 2023 entre lo gastado en 2023', '2023 contracts over 2023 spend') },
    { n: pct(R.pp24[0].v / R.ex24, l), t: t('del dinero de medicinas va por un solo programa, *Atención a la Salud*.', 'of the medicine money moves through one programme, *Atención a la Salud*.'), src: t('Cuenta Pública 2024, programa E011', 'federal accounts 2024, programme E011') },
  ]
  if (imss24 && imss24.ex > 0) rail1.push({ n: pct(imss24.vis / imss24.ex, l), t: t('de todo lo que el IMSS ejerció en compras y obra en 2024 tiene un contrato a la vista: el escalón de arriba, en Gasto a ciegas, donde el IMSS es el ente civil que más gasta.', 'of everything the IMSS exercised on purchases and works in 2024 has a contract in view: the step above, in Blind Spending, where the IMSS is the civilian entity that spends most.'), href: '/gasto-a-ciegas?ente=imss', hrefLabel: t('Gasto a ciegas →', 'Blind Spending →') })
  return [
    { k: 1, n: 'I', kicker: t('§ dos archivos que no se hablan', '§ two files that don’t talk to each other'), title: t('El libro de cuentas: más de la mitad del peso no encuentra su contrato', 'The account book: more than half the peso can’t find its contract'),
      prose: [t('Empezamos donde empieza todo peso público: en el libro de cuentas que Hacienda publica cada año. Ahí el gasto en medicinas del IMSS aparece entero, programa por programa. Lo que no aparece es el contrato. Para eso hay otro archivo, el de contratos, que dice qué se firmó y cuándo, pero nunca en qué año se pagó. Son dos archivos que no se hablan. Cuando los cruzamos, más de la mitad del peso de 2024 se queda sin pareja: compras de varios años, contratos firmados antes, acuerdos entre instituciones. El dinero existe. Lo que no existe es el hilo que lo une a su contrato.', 'We start where every public peso starts: in the account book Mexico’s finance ministry publishes each year. There, the IMSS’s medicine spending shows up in full, programme by programme. What doesn’t show up is the contract. For that there’s a second file, the contract register, which says what was signed and when, but never which year it was paid. The two files don’t talk to each other. Cross them, and more than half the 2024 peso is left without a match: purchases spread over several years, contracts signed earlier, deals between agencies. The money is real. What’s missing is the thread that ties it to a contract.')],
      cut: t('Y aquí lo perdemos de vista por primera vez: el libro no nombra el contrato, y el archivo de contratos no nombra el año del pago. Así es en los registros que reunimos.', 'And here we lose sight of it the first time: the book never names the contract, and the contract file never names the year it was paid. That holds in the records we gather.'),
      railK: t('§ lo que dice cada archivo', '§ what each file says'), rail: rail1 },
    { k: 2, n: 'II', kicker: t('§ la razón que da cada contrato · ley de adquisiciones, artículos 41, 42 y 43', '§ the reason each contract gives · procurement law, articles 41, 42 and 43'), title: t('La compra: casi nueve de cada diez pesos con contrato, sin concurso', 'The purchase: nearly nine in ten pesos under contract, no tender'),
      prose: [t('Lo normal, dice la ley, es concursar: varios proveedores ofrecen y gana la mejor oferta. Saltarse el concurso es legal, pero hay que dar una razón: que nadie más lo vende, que esperar costaría más, que una emergencia no da tiempo. En las medicinas del IMSS de 2024, saltárselo fue la regla. La razón que más dinero movió fue la de las pérdidas. La que más se repitió fue la de lo imprevisto: miles de compras chicas, de urgencia. Algunos contratos no dieron ninguna razón. Y aun donde hubo concurso, casi seis de cada diez terminaron con un solo adjudicado.', 'By law, the default is a tender: several suppliers bid and the best offer wins. Skipping the tender is legal, but you have to give a reason: no one else sells it, waiting would cost more, an emergency leaves no time. For the IMSS’s medicines in 2024, skipping it was the norm. The reason that moved the most money was avoiding losses. The one used most often was the unforeseen: thousands of small, urgent buys. Some contracts gave no reason at all. And even where there was a tender, nearly six in ten ended with a single winner.')],
      cut: t('Y aquí lo perdemos de vista otra vez: sin rivales no hay otro precio con qué comparar, y la razón que da el contrato no se puede comprobar desde el registro.', 'And here we lose sight of it again: with no rivals there’s no other price to compare, and the contract’s stated reason can’t be checked from the register.'),
      railK: t('§ cada centavo, por la razón que dio', '§ each centavo, by the reason it gave'), rail: [
        { n: pct(R24.da / R24.mdp, l), t: t('del dinero con contrato, sin concurso.', 'of the money under contract, untendered.'), src: t('compras directas entre lo visible', 'direct awards over the visible money') },
        { n: `${cv(R.exc24[0].cent, l, 1)} ¢`, t: t('con la misma razón: «pérdidas o costos adicionales importantes». Ninguna mueve más.', 'under one reason, “significant losses or additional costs”. None moves more.'), src: t('artículo 41, fracción III', 'article 41, section III') },
        { n: n(R.exc24[2].n, l), t: t('compras por lo imprevisto (caso fortuito o fuerza mayor): la razón más repetida, aunque apenas la tercera por dinero.', 'buys for the unforeseen (force majeure): the most-used reason, though only third by money.'), src: t('artículo 41, fracción V', 'article 41, section V') },
        { n: pct(R.nonda.sb_n / R.nonda.np, l), t: t('de los concursos, con un solo adjudicado.', 'of tenders, with a single winner.'), src: t(`${R.nonda.sb_n} de ${R.nonda.np} procedimientos con un solo adjudicado`, `${R.nonda.sb_n} of ${R.nonda.np} procedures with one winner`) },
      ] },
    { k: 3, n: 'III', kicker: t('§ en el nivel más alto de la fila de investigación · una observación de la Auditoría Superior', '§ top tier of the investigation queue · one federal-audit observation'), title: t('El nombre: dos centavos para un proveedor que lleva más de veinte años vendiéndole al IMSS', 'The name: two centavos for a supplier that has sold to the IMSS for more than twenty years'),
      prose: [t('Volvemos al 31 de diciembre. Farmacéuticos Maypo le vende medicinas al IMSS desde hace más de veinte años. En 2024 fue su tercer proveedor por dinero, y casi todo lo firmó sin concurso. Aquel último contrato del año era un complemento de la compra conjunta de medicinas, y el artículo que citó fue el de pérdidas o costos adicionales. Otra parte de lo que firmó, más chica, se amparó en derechos exclusivos o en que no había sustituto, algo que la ley permite a quien tiene la licencia o la distribución exclusiva.', 'Back to December 31. Farmacéuticos Maypo has sold medicine to the IMSS for more than twenty years. In 2024 it was the institute’s third-largest supplier by money, and almost all of it was signed without a tender. That last contract of the year was a top-up to the joint medicine purchase, and the article it cited was the one for losses or additional costs. A smaller share of what it signed leaned on exclusive rights or the lack of any substitute, which the law allows to whoever holds the licence or exclusive distribution.')],
      cut: t('Y aquí lo perdemos de vista: en lo que reunimos hay firma, pero no hay pago, ni entrega, ni precio por pieza.', 'And here we lose sight of it: in what we gather there’s a signature, but no payment, no delivery, no price per unit.'),
      railK: t('§ el proveedor y sus compradores en 2024', '§ the supplier and its buyers in 2024'), rail: [
        { n: t('el más alto', 'top tier'), seal: true, t: t('nivel de Focos Rojos, la lista de RUBLI de a quién revisar primero. Es un indicador de riesgo, no una acusación.', 'tier of Red Flags, RUBLI’s list of who to check first. A risk indicator, not an accusation.'), src: t(`lectura del ${date(R.read, l)}`, `reading of ${date(R.read, l)}`) },
        { n: MM(R.asf.mdp, l, 1), seal: true, t: t('de pesos le pagó Birmex a Maypo por almacenaje y distribución; Birmex es la empresa del Estado que compra y distribuye medicinas. La Auditoría Superior dejó ese pago «por aclarar»: es una observación, no una falta probada.', 'pesos is what Birmex, the state company that buys and distributes medicines, paid Maypo for storage and distribution. Mexico’s federal audit office left that payment “pending clarification”: an observation, not proven wrongdoing.'), src: t(`ASF · Cuenta Pública ${R.asf.cp} · auditoría ${R.asf.audit} · contrato de servicios ${R.asf.service_contract}`, `ASF · ${R.asf.cp} public accounts · audit ${R.asf.audit} · service contract ${R.asf.service_contract}`), todo: R.asf.result == null ? t('POR COPIAR: número de resultado (ASF 2023_0234_a.pdf)', 'TO COPY: result number (ASF 2023_0234_a.pdf)') : undefined },
        { n: MM(FRI.mdp, l), t: t('de pesos, con el argumento de que nadie más podía venderlo.', 'pesos, on the argument that no one else could sell it.'), src: t(`artículo 41, fracción I · ${CTR(FRI.n, l)}`, `article 41, section I · ${CTR(FRI.n, l)}`) },
        { n: pct(imssShare, l), t: t('del dinero que firmó en 2024 fue con el IMSS; lo demás, con otros hospitales e institutos.', 'of the money it signed in 2024 was with the IMSS; the rest, with other hospitals and institutes.'), src: t(`contratos de 2024 por comprador · ${b24.length} compradores`, `2024 contracts by buyer · ${b24.length} buyers`) },
        { n: t('no', 'not'), t: t('aparece en Captura: para el IMSS, Maypo pesa poco. Captura busca al proveedor que domina a un comprador, y este no es el caso.', 'in Captura: to the IMSS, Maypo is small. Captura looks for a supplier that dominates a buyer, and this isn’t one.'), href: '/captura', hrefLabel: t('sin pareja en Captura · ver Captura →', 'no pair in Captura · see Captura →') },
      ] },
    { k: 4, n: 'IV', kicker: t('§ los cuatro lugares donde lo perdimos', '§ the four places we lost it'), title: t('La página en blanco', 'The blank page'), prose: [],
      railK: t('§ los centavos que se quedan en cada corte', '§ the centavos left behind at each cut'), rail: [
        { n: `${cv(100 - C.reg, l, 0)} ¢`, t: t('se quedan entre un archivo y otro.', 'stay between one file and the other.'), src: t('corte 1', 'cut 1') },
        { n: `${cv(C.da, l, 0)} ¢`, t: t('se firman sin rivales.', 'are signed with no rivals.'), src: t('corte 2', 'cut 2') },
        { n: `${cv(C.maypo, l, 1)} ¢`, seal: true, t: t('se firmaron con un nombre en lo alto de la lista, y ahí se acaba el rastro.', 'were signed with a name at the top of the list, and there the trail runs out.'), src: t('corte 3', 'cut 3') },
        { n: '0 ¢', t: t('quedan a la vista después, en los registros que RUBLI reúne.', 'are left in view afterwards, in the records RUBLI gathers.'), src: t('corte 4: desde septiembre de 2025, la lista de postores ya no nos llega', 'cut 4: since September 2025, the bidder list no longer reaches us') },
      ] },
  ]
}

/** Chapter IV's four cards and its closing paragraph. */
export function cards(l: Lang, R: RastroPack = RASTRO) {
  const t = L(l), C = R.c
  return {
    cards: [
      { h: t('1 · el libro y el contrato', '1 · the book and the contract'), b: t(`Un archivo sabe cuánto se gastó; el otro, qué se firmó. Ninguno sabe las dos cosas. Entre ellos se quedan **${cv(100 - C.reg, l, 0)} centavos** de cada peso.`, `One file knows what was spent; the other, what was signed. Neither knows both. Between them sit **${cv(100 - C.reg, l, 0)} centavos** of every peso.`), src: t('compras de varios años · contratos de otros años · acuerdos entre instituciones', 'multi-year purchases · contracts from other years · agreements between institutions') },
      { h: t('2 · el contrato sin rivales', '2 · the contract with no rivals'), b: t(`Sin concurso no hay con qué comparar el precio, y la razón del contrato no se puede comprobar desde el registro. Así se firmaron **${cv(C.da, l, 0)} centavos de cada peso.**`, `No tender, nothing to compare the price to, and no way to check the contract’s reason from the register. That’s how **${cv(C.da, l, 0)} centavos of every peso** were signed.`), src: t('la mayoría cita un artículo de la ley; algunos, ninguno', 'most cite an article of the law; some cite none') },
      { h: t('3 · la firma', '3 · the signature'), b: t('En lo que RUBLI reúne, nada une un pago, una entrega o un precio por pieza a un contrato. Los **dos centavos** de Maypo se apagan en la firma.', 'In what RUBLI gathers, nothing links a payment, a delivery or a unit price to a contract. Maypo’s **two centavos** go dark at the signature.'), src: t('la Cuenta Pública reporta por línea de gasto, no por contrato', 'the federal accounts report by budget line, not by contract') },
      { h: t('4 · 28 de septiembre de 2025', '4 · September 28, 2025'), b: t(`Ese día se apagó CompraNet, el escaparate donde el gobierno exhibía sus compras. Maypo sigue firmando, ahora en ComprasMX, y esos contratos nos llegan sin la lista de quién compitió. Van **${n(R.cmxp.n, l)}**.`, `That day CompraNet, the shop window where the government displayed its purchases, went dark. Maypo keeps signing, now on ComprasMX, and those contracts reach us without the list of who competed. **${n(R.cmxp.n, l)}** so far.`), src: t(`casi todos citan la nueva ley, artículos 54 y 55 · ${MM(R.cmxp.mdp, l)} de pesos`, `almost all cite the new law, articles 54 and 55 · ${MM(R.cmxp.mdp, l)} pesos`) },
    ],
    close: t('Volvemos al último día de 2024. Sabemos que ese contrato se firmó. No sabemos si se pagó, qué se entregó ni a qué precio. Lo que sigue a la firma es una página en blanco.', 'Back to the last day of 2024. We know that contract was signed. We don’t know if it was paid, what was delivered, or at what price. What follows the signature is a blank page.'),
  }
}

/** The claims the V2 copy asserts in words, as booleans over the pack (rastro.test.ts: each true here, each false on a broken pack). */
export function claimsHold(R: RastroPack = RASTRO) {
  const C = R.c, R24 = R.reg24, MPO = R.maypo
  const daShare = R24.da / R24.mdp
  const sb = R.nonda.sb_n / R.nonda.np
  const byMoney = [...R.exc24].sort((a, b) => b.mdp - a.mdp), byCount = [...R.exc24].sort((a, b) => b.n - a.n)
  const b24 = MPO.buyers24
  return {
    nests: nests(R),
    /** «más de la mitad del peso no encuentra su contrato» */
    overHalfUnmatched: C.reg < 50,
    /** «casi nueve de cada diez pesos con contrato, sin concurso» */
    nearlyNineInTen: daShare >= 0.85 && daShare < 0.9,
    /** «casi seis de cada diez» tenders with a single winner */
    nearlySixInTen: sb >= 0.55 && sb < 0.6,
    /** «la razón que más dinero movió fue la de las pérdidas» (fr. III) */
    lossesTopByMoney: byMoney[0].s === 'fr. III',
    /** «la que más se repitió fue la de lo imprevisto … apenas la tercera por dinero» (fr. V) */
    unforeseenTopByCountThirdByMoney: byCount[0].s === 'fr. V' && byMoney[2].s === 'fr. V',
    /** «algunos contratos no dieron ninguna razón» */
    someGaveNone: R.exc24.some((e) => e.s === 'sin artículo' && e.n > 0),
    /** «2025 pasa al revés: se firmó más de lo que se gastó» */
    signedOverSpent2025: R.reg_cn['2025'].mdp * 1e6 > R.cp['2025'].med,
    /** «casi todo lo firmó sin concurso» (Maypo, IMSS 2024) */
    maypoAlmostAllDirect: MPO.imss24.da / MPO.imss24.mdp > 0.95,
    /** «en 2024 fue su tercer proveedor por dinero» */
    maypoThird: [...R.top24].sort((a, b) => b.mdp - a.mdp).findIndex((v) => v.id === MPO.id) === 2,
    /** «el nivel más alto» of Focos Rojos (chapter III rail, stage 5) */
    maypoTopTier: MPO.tier === 1,
    /** «dos centavos» */
    twoCentavos: Math.round(C.maypo) === 2,
    /** «más de veinte años» */
    overTwentyYears: MPO.imss_life.y1 - MPO.imss_life.y0 > 20,
    /** the IMSS is the largest of Maypo's 2024 buyers */
    imssTopBuyer: b24.every((b) => b.mdp <= b24[0].mdp) && b24[0].sig === 'IMSS',
    /** «casi todos citan la nueva ley» on ComprasMX */
    mostCiteNewLaw: R.cmxp.cite / R.cmxp.n > 0.85,
  }
}
