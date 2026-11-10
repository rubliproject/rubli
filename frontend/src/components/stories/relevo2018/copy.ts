/**
 * «El relevo de 2018» — data contract + the published sentences (ES first, EN twin).
 * Ported from `_ui_v4/concepts/relevo2018/_relevo.js` (concept A «El pulso»). Every number in the
 * copy is interpolated from the extracted data so text and instrument cannot drift. Facts are fixed by
 * `_explore/2018/VERIFY.md` («Lo que podemos decir» / «What we must not say»).
 * Bold runs are marked `**…**` and rendered by `rich()` in Relevo2018.tsx.
 */

/** A drill row: [contract id, date, amount MXN, institution id, vendor id, vendor name, direct award 0/1, …procedure, publication, award] */
export type Row = [number, string, number, number | null, number | null, string | null, number, string?, string?, string?]
export interface Week { w: string; v: number; n: number; vx: number; nx: number; s: number[] }
export interface Surv { t: string; c_n: number; c_y1: number | null; c_y2: number | null; rfc_n: number; rfc_y1: number | null; rfc_y2: number | null }
export interface InstYear { n: number; below: number; median: number; r: [number, number][] }
export interface InstName { s: string | null; n: string; c: number; w18: number; base: number; k: { n: number; v: number; k: Row[] } }
export type Dist = 'gfe' | 'dimesa' | 'maypo'
export type Phase = 'p1' | 'p2' | 'p3' | 'p4'
export interface Proc { id: string; phase: Phase; buyer: string; bn: number; n: number; pub: string | null; award: string | null; start: string; da: number; split: Partial<Record<Dist, number>> }
export interface RelevoData {
  built: string
  horizon: string
  flagged: number
  weeks: Week[]
  freeze: Record<string, { v: number; n: number; vx: number; nx: number; h1v: number; h1vx: number }>
  freeze_base: { v: number; n: number; vx: number; nx: number }
  freeze_ratio: { v: number; n: number; vx: number; nx: number }
  within: Record<string, number>
  rush: Record<string, { n: number; v: number; da?: number }>
  inst: Record<string, InstYear>
  inst_names: Record<string, InstName>
  surv: Surv[]
  active: Record<string, number>
  coda: { sheinbaum_y1: number; sheinbaum_y2: number; midamlo_y1: number; midamlo_y2: number; midepn_y2: number; epnamlo_y2: number; cohort: number }
  meds: {
    total_bn: number
    dist: Record<Dist, { bn: number; buyers: Record<string, number>; phases: Partial<Record<Phase, number>> }>
    phases: Record<Phase, number>
    procs: Proc[]
    drill: Record<Dist, { vid: number; n: number; k: Row[] }>
  }
  drill_week: Record<string, Row[]>
  inst_lbl: Record<string, string>
  sources: { circular: string[]; naim: string; cfe: string[]; veto: string[] }
}

export type Lang = 'es' | 'en'
export type EraKey = 'epn' | 'amlo' | 'shein'
export interface LedgerRow { k: string; s: number | null; v: string; mk?: string; inst?: number }
export interface Chapter {
  key: 'cierre' | 'instituciones' | 'barrido' | 'medicinas' | '2024'
  num: string
  kick: string
  era: EraKey
  claim: { a: string; n?: number; b: string }
  sents: string[]
  ledger: LedgerRow[]
  src: [string, string][]
}

// ── eras (DESIGN.md §6.3): Peña Nieto C7 · López Obrador C4 · Sheinbaum C5 — indexes into CATEGORICAL
export const ERAS: { k: EraKey; n: string; t0: string; t1: string; c: number }[] = [
  { k: 'epn', n: 'Peña Nieto', t0: '2012-12-01', t1: '2018-12-01', c: 6 },
  { k: 'amlo', n: 'López Obrador', t0: '2018-12-01', t1: '2024-10-01', c: 3 },
  { k: 'shein', n: 'Sheinbaum', t0: '2024-10-01', t1: '2026-01-01', c: 4 },
]
// distributors, one categorical hue each: blue · teal · magenta (indexes into CATEGORICAL)
export const DISTS: { k: Dist; n: string; c: number }[] = [
  { k: 'gfe', n: 'Grupo Fármacos Especializados', c: 1 },
  { k: 'dimesa', n: 'Distribuidora Internacional de Medicamentos y Equipo Médico', c: 2 },
  { k: 'maypo', n: 'Farmacéuticos Maypo', c: 4 },
]

const MONTHS_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const MON_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const MON_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const D = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10) || 1)
export const f0 = (v: number) => Math.round(v).toLocaleString('en-US')
export const pcInt = (x: number) => Math.round(100 * x)

/** Formatters bound to one language. */
export function fmt(lang: Lang) {
  const en = lang === 'en'
  const T = (es: string, e: string) => (en ? e : es)
  const dlong = (s: string) => {
    const d = new Date(D(s))
    return en ? d.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : `${d.getUTCDate()} de ${MONTHS_ES[d.getUTCMonth()]} de ${d.getUTCFullYear()}`
  }
  const dshort = (s: string) => { const d = new Date(D(s)); return en ? `${MON_EN[d.getUTCMonth()]} ${d.getUTCDate()}` : `${d.getUTCDate()} ${MON_ES[d.getUTCMonth()]}` }
  const mon = (m: number) => (en ? MON_EN : MON_ES)[m]
  // money in prose: «mil millones» (es) / «billion» (en), one decimal
  const bn = (v: number, dec = 1) => { const b = v / 1e9; return (dec === 0 ? f0(b) : (Math.round(b * 10) / 10).toFixed(1).replace(/\.0$/, '')) + ' ' + T('mil millones', 'billion') }
  return { en, T, dlong, dshort, mon, bn }
}

/** The figures the copy prints, computed once from the data. */
export function facts(R: RelevoData) {
  const FZ = R.freeze['2018'], FB = R.freeze_base
  const S18 = R.surv.find((s) => s.t === '2018-12-01')!, S24 = R.surv.find((s) => s.t === '2024-10-01')!
  const I18 = R.inst['2018'], instR = Object.fromEntries(I18.r) as Record<number, number>
  const placeboY1 = R.surv.filter((s) => s.t !== '2018-12-01' && s.t !== '2024-10-01' && s.c_y1 != null).map((s) => s.c_y1!)
  const rfcLate = R.surv.filter((s) => s.t >= '2019' && s.t < '2024' && s.rfc_y1 != null).map((s) => s.rfc_y1!)
  return {
    FZ, FB,
    win18: FZ.vx, winBase: FB.vx, winRatio: FZ.vx / FB.vx, winRatioN: FZ.nx / FB.nx, within18: R.within['2018'],
    rush18: R.rush['2018'].n, rush17: R.rush['2017'].n, rush19: R.rush['2019'].n, rushDA: R.rush['2018'].da ?? 0, jul1: R.rush.jul1_2018.v,
    instN: I18.n, instBelow: Math.round(I18.n * I18.below), instMedian: I18.median,
    placeboBelow: [2016, 2017, 2019, 2021].map((y) => R.inst[String(y)].below),
    sct: instR[345], imss: instR[251], issste: instR[228], gacm: instR[2682],
    cohort18: S18.c_n, surv18: S18.c_y1!, surv18rfc: S18.rfc_y1!, survLo: Math.min(...placeboY1), survHi: Math.max(...placeboY1),
    rfcLo: Math.min(...rfcLate), rfcHi: Math.max(...rfcLate),
    ctl17: R.surv.find((s) => s.t === '2017-12-01')!.c_y1!, act: R.active,
    surv24: S24.c_y1!, cohort24: S24.c_n, coda: R.coda,
  }
}
export type Facts = ReturnType<typeof facts>

export const CHAPTER_KEYS: Chapter['key'][] = ['cierre', 'instituciones', 'barrido', 'medicinas', '2024']

export function buildCopy(R: RelevoData, lang: Lang) {
  const { T, bn } = fmt(lang)
  const F = facts(R)
  const p2 = (x: number) => x.toFixed(2)
  const pb = F.placeboBelow.map(pcInt)
  const chapters: Chapter[] = [
    {
      key: 'cierre', num: 'I', era: 'epn', kick: T('El cierre anticipado', 'The early shutdown'),
      claim: {
        a: T('Hacienda ordenó en julio de 2018 un cierre anticipado; del 23 de agosto al 30 de noviembre se contrató ', 'The Treasury ordered an early shutdown in July 2018; from 23 August to 30 November the government contracted '),
        n: pcInt(F.winRatio),
        b: T('% de lo normal: menos de la mitad.', '% of normal: less than half.'),
      },
      sents: [
        T('La circular de Hacienda del **29 de junio de 2018** prohibió nuevas adjudicaciones directas desde el 16 de julio y exigió firmar los compromisos a más tardar el 31 de julio.',
          'The Treasury circular of **29 June 2018** banned new direct awards from 16 July and required commitments to be signed by 31 July.'),
        T(`En la segunda quincena de julio se registraron **${f0(F.rush18)} contratos**, contra ${f0(F.rush17)} en 2017 y ${f0(F.rush19)} en 2019; ${pcInt(F.rushDA)} de cada 100 fueron adjudicaciones directas.`,
          `The second half of July recorded **${f0(F.rush18)} contracts**, against ${f0(F.rush17)} in 2017 and ${f0(F.rush19)} in 2019; ${pcInt(F.rushDA)} of every 100 were direct awards.`),
        T(`Del 23 de agosto al 30 de noviembre se contrataron **${bn(F.win18)} de pesos**, contra ${bn(F.winBase, 0)} en el mismo tramo de 2013 a 2017. Sin CFE ni PEMEX, que dejaron CompraNet en 2017 y 2015; con ellas el cociente baja a ${pcInt(R.freeze_ratio.v)}%.`,
          `From 23 August to 30 November the government contracted **${bn(F.win18)} pesos**, against ${bn(F.winBase, 0)} in the same stretch of 2013–2017. CFE and PEMEX excluded, as they left CompraNet in 2017 and 2015; with them the ratio drops to ${pcInt(R.freeze_ratio.v)}%.`),
      ],
      ledger: [
        { k: T('Dinero, 23 ago – 30 nov', 'Money, 23 Aug – 30 Nov'), s: F.winRatio, v: `**${bn(F.win18)}** · ${bn(F.winBase, 0)} ${T('normal', 'normal')}`, mk: 'win' },
        { k: T('Contratos, mismo tramo', 'Contracts, same stretch'), s: F.winRatioN, v: `**${f0(F.FZ.nx)}** · ${f0(F.FB.nx)}`, mk: 'win' },
        { k: T('Tramo ÷ enero–julio del mismo año', 'Stretch ÷ January–July of the same year'), s: F.within18 / 0.55, v: `**${p2(F.within18)}** · 0.38–0.55 ${T('en 2013–2022 (0.25 en 2020, pandemia)', 'in 2013–2022 (0.25 in 2020, pandemic)')}`, mk: 'env' },
        { k: T('Carrera del 16 al 31 de julio', 'Rush, 16–31 July'), s: 1, v: `**${f0(F.rush18)}** ${T('contratos', 'contracts')} · ${pcInt(F.rushDA)}% ${T('directa', 'direct')}`, mk: 'rush' },
        { k: T('1 de julio de 2018, un solo día', '1 July 2018, a single day'), s: null, v: `**${bn(F.jul1)}** · ${T('carreteras de la SCT', 'SCT roads')}`, mk: 'wk:2018-06-25' },
      ],
      src: [['Circular SHCP · Zeta Tijuana', R.sources.circular[0]], [T('Oficio SHCP · El Universal', 'SHCP oficio · El Universal'), R.sources.circular[1]], [T('Licitaciones del NAIM suspendidas · Expansión', 'NAIM tenders suspended · Expansión'), R.sources.naim], ['CFE Proveedores · Factor Energético', R.sources.cfe[0]], ['ASF 2018-0507', R.sources.cfe[1]]],
    },
    {
      key: 'instituciones', num: 'I', era: 'epn', kick: T('No fueron unas pocas dependencias', 'Not just a few agencies'),
      claim: {
        a: '', n: F.instBelow,
        b: T(` de ${F.instN} instituciones compraron ese otoño muy por debajo de su propio ritmo: tres de cada cuatro.`, ` of ${F.instN} institutions bought that autumn far below their own pace: three in four.`),
      },
      sents: [
        T('Para cada institución comparamos lo contratado del 23 de agosto al 30 de noviembre con lo contratado de enero a julio del mismo año, y ese cociente con su propia mediana de 2013 a 2017.',
          'For each institution we compare what it contracted from 23 August to 30 November with what it contracted from January to July of the same year, and that ratio with its own 2013–2017 median.'),
        T(`En 2018, **${F.instBelow} de ${F.instN}** quedaron por debajo de 0.7 de su ritmo; en 2016, 2017, 2019 y 2021 fueron entre ${Math.min(...pb)} y ${Math.max(...pb)} de cada 100. La mediana cayó a ${p2(F.instMedian)}.`,
          `In 2018, **${F.instBelow} of ${F.instN}** fell below 0.7 of their pace; in 2016, 2017, 2019 and 2021 it was between ${Math.min(...pb)} and ${Math.max(...pb)} in every 100. The median fell to ${p2(F.instMedian)}.`),
        T(`La Secretaría de Comunicaciones y Transportes bajó a **${p2(F.sct)}**, el Grupo Aeroportuario de la Ciudad de México a ${p2(F.gacm)} tras la suspensión de las licitaciones del aeropuerto, el ISSSTE a ${p2(F.issste)} y el IMSS a ${p2(F.imss)}. CFE no cuenta: dejó CompraNet en septiembre de 2017.`,
          `The Secretaría de Comunicaciones y Transportes fell to **${p2(F.sct)}**, Grupo Aeroportuario de la Ciudad de México to ${p2(F.gacm)} after the airport tenders were suspended, ISSSTE to ${p2(F.issste)} and IMSS to ${p2(F.imss)}. CFE does not count: it left CompraNet in September 2017.`),
      ],
      ledger: [
        { k: 'Secretaría de Comunicaciones y Transportes', s: F.sct, v: `**${p2(F.sct)}**`, mk: 'inst:345', inst: 345 },
        { k: 'Grupo Aeroportuario de la Ciudad de México', s: F.gacm, v: `**${p2(F.gacm)}**`, mk: 'inst:2682', inst: 2682 },
        { k: 'ISSSTE', s: F.issste, v: `**${p2(F.issste)}**`, mk: 'inst:228', inst: 228 },
        { k: 'IMSS', s: F.imss, v: `**${p2(F.imss)}**`, mk: 'inst:251', inst: 251 },
        { k: T(`Mediana de las ${F.instN}`, `Median of the ${F.instN}`), s: F.instMedian, v: `**${p2(F.instMedian)}** · 0.87–1.21 ${T('en años placebo', 'in placebo years')}`, mk: 'pile:2018' },
      ],
      src: [[T('Licitaciones del NAIM suspendidas · Expansión', 'NAIM tenders suspended · Expansión'), R.sources.naim], ['Circular SHCP · Zeta Tijuana', R.sources.circular[0]]],
    },
    {
      key: 'barrido', num: 'II', era: 'amlo', kick: T('El barrido de proveedores', 'The vendor sweep'),
      claim: {
        a: T('En el primer año de López Obrador, ', 'In López Obrador’s first year, '), n: 100 - pcInt(F.surv18),
        b: T(` de cada 100 proveedores con más de un millón de pesos dejaron de venderle al gobierno; en años comparables, entre ${100 - pcInt(F.survHi)} y ${100 - pcInt(F.survLo)}.`,
          ` of every 100 vendors with more than a million pesos stopped selling to the government; in comparable years, between ${100 - pcInt(F.survHi)} and ${100 - pcInt(F.survLo)}.`),
      },
      sents: [
        T(`Tomamos a los proveedores con más de un millón de pesos en los doce meses previos a cada 1 de diciembre y contamos cuántos vuelven a firmar en los doce siguientes. Al 1 de diciembre de 2018 eran **${f0(F.cohort18)}**; siguió vendiendo el ${pcInt(F.surv18)} por ciento. En los cortes de 2014 a 2017 y de 2019 a 2023 siguió entre el ${pcInt(F.survLo)} y el ${pcInt(F.survHi)}.`,
          `We take the vendors with more than a million pesos in the twelve months before each 1 December and count how many sign again in the following twelve. On 1 December 2018 there were **${f0(F.cohort18)}**; ${pcInt(F.surv18)} percent kept selling. At the 2014–2017 and 2019–2023 cuts, between ${pcInt(F.survLo)} and ${pcInt(F.survHi)} percent did.`),
        T(`La caída sobrevive al cotejo por RFC de empresa (**${pcInt(F.surv18rfc)}** contra ${pcInt(F.rfcLo)}–${pcInt(F.rfcHi)} en 2019–2023) y no la explica el cambio de formato de CompraNet: el corte de diciembre de 2017, con el mismo cambio y todo bajo Peña Nieto, dio ${pcInt(F.ctl17)}.`,
          `The drop survives a check by company tax id (**${pcInt(F.surv18rfc)}** against ${pcInt(F.rfcLo)}–${pcInt(F.rfcHi)} in 2019–2023) and is not explained by CompraNet’s format change: the December 2017 cut, with the same change and all under Peña Nieto, gave ${pcInt(F.ctl17)}.`),
        T(`Los proveedores activos pasaron de ${f0(F.act['2018'])} en 2018 a ${f0(F.act['2019'])} en 2019 y ${f0(F.act['2020'])} en 2020. El segundo año se cruza con la pandemia y no se compara. Energía no se muestra: sus proveedores salieron con CFE en 2017.`,
          `Active vendors went from ${f0(F.act['2018'])} in 2018 to ${f0(F.act['2019'])} in 2019 and ${f0(F.act['2020'])} in 2020. The second year overlaps the pandemic and is not compared. Energy is not shown: its vendors left with CFE in 2017.`),
      ],
      ledger: [
        { k: T('Siguieron vendiendo, corte dic 2018', 'Kept selling, Dec 2018 cut'), s: F.surv18, v: `**${pcInt(F.surv18)}%** ${T('de', 'of')} ${f0(F.cohort18)}`, mk: 'cut:2018-12-01' },
        { k: T('Cortes 2014–2017 y 2019–2023', '2014–2017 and 2019–2023 cuts'), s: F.survHi, v: `**${pcInt(F.survLo)}–${pcInt(F.survHi)}%**`, mk: 'cut:placebo' },
        { k: T('Con RFC de empresa, dic 2018', 'By company tax id, Dec 2018'), s: F.surv18rfc, v: `**${pcInt(F.surv18rfc)}%** · ${pcInt(F.rfcLo)}–${pcInt(F.rfcHi)} ${T('en 2019–2023', 'in 2019–2023')}`, mk: 'cut:2018-12-01' },
        { k: T('Control: corte dic 2017 (cambio de formato)', 'Control: Dec 2017 cut (format change)'), s: F.ctl17, v: `**${pcInt(F.ctl17)}%**`, mk: 'cut:2017-12-01' },
        { k: T('Proveedores activos 2018 · 2019 · 2020', 'Active vendors 2018 · 2019 · 2020'), s: null, v: `**${f0(F.act['2018'])}** · ${f0(F.act['2019'])} · ${f0(F.act['2020'])}` },
      ],
      src: [['CFE Proveedores · Factor Energético', R.sources.cfe[0]]],
    },
    {
      key: 'medicinas', num: 'III', era: 'amlo', kick: T('Las medicinas de 2019', 'The 2019 medicines'),
      claim: {
        a: T('Las medicinas de 2019: casi la mitad licitada por el gobierno saliente; el entrante la adjudicó y firmó en sus primeras semanas, sumó 8.2 mil millones por adjudicación directa y tres meses después vetó a las tres distribuidoras.',
          'The 2019 medicines: nearly half tendered by the outgoing government; the incoming one awarded and signed it in its first weeks, added 8.2 billion in direct awards and vetoed the three distributors three months later.'), b: '',
      },
      sents: [
        T(`Grupo Fármacos Especializados, Distribuidora Internacional de Medicamentos y Equipo Médico y Farmacéuticos Maypo firmaron **${bn(R.meds.total_bn * 1e9)} de pesos** entre el 1 de diciembre de 2018 y el 10 de marzo de 2019: 22.2 con el IMSS (11.1, 5.8 y 5.3), 7.5 con el ISSSTE y 0.75 con la SEDENA.`,
          `Grupo Fármacos Especializados, Distribuidora Internacional de Medicamentos y Equipo Médico and Farmacéuticos Maypo signed **${bn(R.meds.total_bn * 1e9)} pesos** between 1 December 2018 and 10 March 2019: 22.2 with IMSS (11.1, 5.8 and 5.3), 7.5 with ISSSTE and 0.75 with SEDENA.`),
        T('Unos 14 mil millones venían de licitaciones publicadas en octubre y noviembre bajo Peña Nieto; **12 mil millones se fallaron del 11 al 14 de diciembre** y 8.2 mil millones se adjudicaron de manera directa el 19 de diciembre, ya bajo López Obrador. Los contratos arrancan el 1 y el 17 de enero de 2019.',
          'Some 14 billion came from tenders published in October and November under Peña Nieto; **12 billion were awarded on 11–14 December** and 8.2 billion were directly awarded on 19 December, already under López Obrador. The contracts start on 1 and 17 January 2019.'),
        T('El 20 de marzo de 2019 la Presidencia ordenó no contratar a las tres distribuidoras, que en 2018 habían vendido 34.28 mil millones al IMSS y al ISSSTE (62.4 por ciento de sus compras de medicamentos); el 19 de agosto un juez federal concedió a Grupo Fármacos Especializados un amparo contra esa orden (573/2019), que Hacienda impugnó. Continuidad antes de la ruptura, no prueba de favoritismo.',
          'On 20 March 2019 the Presidency ordered that the three distributors not be contracted; in 2018 they had sold 34.28 billion to IMSS and ISSSTE (62.4 percent of their medicine purchases). On 19 August a federal judge granted Grupo Fármacos Especializados an amparo against that order (573/2019), which the Treasury appealed. Continuity before the break, not proof of favouritism.'),
      ],
      ledger: [
        { k: T('Licitadas bajo Peña Nieto, falladas después del 1 dic', 'Tendered under Peña Nieto, awarded after 1 Dec'), s: 11.9 / 31, v: `**11.9** ${T('mil millones', 'bn')}`, mk: 'ph:p1' },
        { k: T('Publicadas y falladas bajo Peña Nieto (licitación 1.9 + directa 0.5)', 'Published and awarded under Peña Nieto (tender 1.9 + direct 0.5)'), s: 2.4 / 31, v: '**2.4**', mk: 'ph:p2' },
        { k: T('Adjudicación directa publicada bajo López Obrador', 'Direct award published under López Obrador'), s: 8.2 / 31, v: '**8.2**', mk: 'ph:p3' },
        { k: T('Consolidadas ISSSTE y otros procedimientos de 2019', 'ISSSTE consolidated and other 2019 procedures'), s: 8.4 / 31, v: '**8.4**', mk: 'ph:p4' },
        { k: T('Vetadas 20 mar 2019 · amparo a Grufesa 19 ago 2019', 'Vetoed 20 Mar 2019 · amparo granted to Grufesa 19 Aug 2019'), s: null, v: `**34.28** ${T('mil millones a IMSS e ISSSTE en 2018 · 62.4%', 'bn to IMSS and ISSSTE in 2018 · 62.4%')}`, mk: 'veto' },
      ],
      src: [[T('Presidencia ordena vetar · Vanguardia', 'Presidency orders veto · Vanguardia'), R.sources.veto[0]], [T('Juez declara ilegal el veto · Vanguardia', 'Judge rules veto illegal · Vanguardia'), R.sources.veto[1]], [T('Revés al veto · Expansión', 'Veto reversed · Expansión'), R.sources.veto[2]]],
    },
    {
      key: '2024', num: 'IV', era: 'shein', kick: T('Coda · El relevo de 2024', 'Coda · The 2024 handover'),
      claim: { a: T('El relevo de 2024 no trajo un barrido así.', 'The 2024 handover brought no such sweep.'), b: '' },
      sents: [
        T(`De los proveedores con más de un millón de pesos en los 24 meses previos al 1 de octubre de 2024, el **${(100 * F.coda.sheinbaum_y2).toFixed(1)} por ciento** seguía vendiendo en el segundo año, contra ${(100 * F.coda.midamlo_y2).toFixed(1)} en el corte intermedio de 2021; en 2018 había sido ${(100 * F.coda.epnamlo_y2).toFixed(1)}, con un segundo año que cae en la pandemia. El seguimiento usa ComprasMX hasta octubre de 2026.`,
          `Of the vendors with more than a million pesos in the 24 months before 1 October 2024, **${(100 * F.coda.sheinbaum_y2).toFixed(1)} percent** were still selling in year two, against ${(100 * F.coda.midamlo_y2).toFixed(1)} at the mid-term 2021 cut; in 2018 it had been ${(100 * F.coda.epnamlo_y2).toFixed(1)}, with a second year that falls in the pandemic. The follow-up uses ComprasMX to October 2026.`),
        T(`En el primer año, solo con CompraNet (hasta el 28 de septiembre de 2025, dos días antes de cerrar el año), siguió el ${pcInt(F.surv24)} por ciento del corte de doce meses, contra ${pcInt(F.survLo)}–${pcInt(F.survHi)} en años normales y ${pcInt(F.surv18)} en 2018.`,
          `In year one, on CompraNet alone (to 28 September 2025, two days short of the year), ${pcInt(F.surv24)} percent of the twelve-month cut kept selling, against ${pcInt(F.survLo)}–${pcInt(F.survHi)} in normal years and ${pcInt(F.surv18)} in 2018.`),
        T(`No encontramos para 2024 una circular equivalente a la de 2018: no está verificado ni descartado. Los últimos 100 días de López Obrador corrieron a 0.70 del ritmo de sus otros años; los de Peña Nieto, a ${p2(F.winRatio)} sin CFE ni PEMEX.`,
          `We found no 2024 circular equivalent to 2018’s: neither verified nor ruled out. López Obrador’s final 100 days ran at 0.70 of the pace of his other years; Peña Nieto’s at ${p2(F.winRatio)} without CFE and PEMEX.`),
      ],
      ledger: [
        { k: T('Siguieron en el segundo año, corte oct 2024', 'Kept selling in year two, Oct 2024 cut'), s: F.coda.sheinbaum_y2, v: `**${(100 * F.coda.sheinbaum_y2).toFixed(1)}%** ${T('de', 'of')} ${f0(F.coda.cohort)}`, mk: 'cut:2024-10-01' },
        { k: T('Corte intermedio dic 2021', 'Mid-term Dec 2021 cut'), s: F.coda.midamlo_y2, v: `**${(100 * F.coda.midamlo_y2).toFixed(1)}%**`, mk: 'cut:2021-12-01' },
        { k: T('Corte dic 2018 (segundo año con pandemia)', 'Dec 2018 cut (second year in the pandemic)'), s: F.coda.epnamlo_y2, v: `**${(100 * F.coda.epnamlo_y2).toFixed(1)}%**`, mk: 'cut:2018-12-01' },
        { k: T('Primer año, corte oct 2024, solo CompraNet', 'Year one, Oct 2024 cut, CompraNet only'), s: F.surv24, v: `**${pcInt(F.surv24)}%** ${T('de', 'of')} ${f0(F.cohort24)}`, mk: 'cut:2024-10-01' },
        { k: T('Últimos 100 días · 2024 frente a 2018', 'Final 100 days · 2024 vs 2018'), s: 0.7, v: `**0.70** · ${p2(F.winRatio)}` },
      ],
      src: [['Circular SHCP 2018 · Zeta Tijuana', R.sources.circular[0]]],
    },
  ]
  const nContracts = R.weeks.reduce((s, w) => s + w.n, 0)
  return {
    F,
    chapters,
    title: T('El relevo de 2018', 'The 2018 handover'),
    kicker: T('Historia · La compra federal en el cambio de gobierno', 'Story · Federal buying at the change of government'),
    lede: T('Qué pasó con la compra federal cuando Peña Nieto entregó a López Obrador. Un cierre ordenado por Hacienda, un otoño a la mitad, un barrido de proveedores y las medicinas de 2019. CompraNet 2013–2025, por fecha de contrato.',
      'What happened to federal buying when Peña Nieto handed over to López Obrador. A shutdown ordered by the Treasury, an autumn at half pace, a vendor sweep and the 2019 medicines. CompraNet 2013–2025, by contract date.'),
    foot: T(`Fuente: CompraNet 2013–2025 por fecha de contrato (${f0(nContracts)} contratos), ComprasMX 2025–2026 para el seguimiento de 2024. Montos nominales en pesos. Se excluyen contratos mayores a 100,000 MDP; ${R.flagged} contratos mayores a 10,000 MDP se conservan y se marcan †. CFE dejó CompraNet en septiembre de 2017 y PEMEX en 2015–2016; donde se indica, se excluyen. El indicador de riesgo no se usa en esta historia.`,
      `Source: CompraNet 2013–2025 by contract date (${f0(nContracts)} contracts), ComprasMX 2025–2026 for the 2024 follow-up. Nominal pesos. Contracts above 100,000 M MXN are excluded; ${R.flagged} contracts above 10,000 M MXN are kept and marked †. CFE left CompraNet in September 2017 and PEMEX in 2015–2016; they are excluded where stated. The risk indicator is not used in this story.`),
  }
}
