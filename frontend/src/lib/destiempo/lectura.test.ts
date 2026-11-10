/** Every «La lectura» claim (and each conditional head sentence) of /antes-del-fallo · /mismo-dia · /arranque: one
 *  fixture where it holds (claim present) and one where it does not (claim absent). */
import { describe, expect, it } from 'vitest'
import type { FalloResp } from '@/components/fallo/falloData'
import { arranqueModel, falloModel, mismoModel, type ArrResp, type ArrRow, type Lot, type MismoResp } from './model'
import { arranqueHead, arranqueLectura, falloHead, falloLectura, mismoHead, mismoLectura } from './lectura'

const keys = (cs: { key: string }[]) => cs.map((c) => c.key)
const text = (t: unknown[]) => t.map((x) => (typeof x === 'string' ? x : 'b' in (x as object) ? (x as { b: string }).b : (x as { name: string }).name)).join('')

// ── A · fallo ──
const COLS = ['code', 'proc', 'i', 'v', 'vid', 't', 'lp', 'amt', 'flag', 'fort', 'pub', 'ape', 'ini', 'fir', 'fin', 'fallo', 'jan1', 'cid']
type R = { proc: string; i: number; ini: number; ape?: number | null; pub?: number | null; fallo: string; jan1?: boolean; v?: string; amt?: number }
const row = (r: R, j: number) => [`C-${j}`, r.proc, r.i, r.v ?? 'ACME SA', 10 + r.i, 't', true, r.amt ?? 1, false, false, r.pub ?? -20, r.ape ?? -10, r.ini, 5, 90, r.fallo, !!r.jan1, null]
function fallo(over: { rows?: R[]; inst?: Partial<FalloResp['inst'][number]>[]; fir?: number | null; adLag?: number } = {}): FalloResp {
  const rows: R[] = over.rows ?? [
    ...Array.from({ length: 10 }, (_, k) => ({ proc: `S${k}`, i: 0, ini: -3, fallo: k < 6 ? '2025-04-29' : '2025-08-21' })),
    { proc: 'S0', i: 0, ini: -12, ape: -5, fallo: '2025-04-29' },
    { proc: 'I1', i: 1, ini: -13, fallo: '2025-01-14', jan1: true, v: 'KEDRION' , amt: 900 },
    { proc: 'I1', i: 1, ini: -13, fallo: '2025-01-14', jan1: true, v: 'PISA', amt: 800 },
  ]
  const inst = (over.inst ?? [
    { k: 'SEDENA', sig: 'SEDENA', pop_proc: 100, early_proc: 10, n: 11, pop: 300 },
    { k: 'ISSSTE', sig: 'ISSSTE', pop_proc: 200, early_proc: 1, n: 2, pop: 400 },
  ]).map((x) => ({ name: x.k ?? '', v: 5, iid: 1, sid: 1, n: 1, pop: 10, sig: null, k: 'X', pop_proc: 1, early_proc: 0, ...x })) as FalloResp['inst']
  const lag = { sig: 'IMSS', name: 'IMSS', v: 'PFIZER', vid: 7, iid: 251, amt: 3146, lag: 220, code: 'C', flag: false }
  return {
    available: true, cols: COLS, rows: rows.map(row), inst, dist: [],
    meta: { pop_n: 2000, pop_v: 1, n: rows.length, v: 1, pop_proc: 1000, early_proc: 11, unnamed_n: 0, lp_n: 0, prepub_n: 0, prepub_v: 0, fort_n: 0, jan1_n: 2, nofirma_n: 3, flag_n: 0, signed_before_fallo: 0,
      med: { pub: -24, ape: -10, fir: over.fir === undefined ? 19 : over.fir, ini: -5 }, recon: { n: 12, v: 526, top: ['X', 3] }, ad_lag: Array.from({ length: over.adLag ?? 2 }, () => lag) },
  }
}

describe('fallo · La lectura', () => {
  it('every claim holds on the base fixture', () => {
    expect(keys(falloLectura(falloModel(fallo()), 'es'))).toEqual(['lead', 'issste', 'preape', 'mediana', 'ademas'])
  })
  it('lead: false when the lead rate is not twice the federal rate', () => {
    const d = fallo({ inst: [{ k: 'SEDENA', pop_proc: 1000, early_proc: 10, n: 11 }, { k: 'ISSSTE', pop_proc: 200, early_proc: 1, n: 2 }] })
    d.meta.pop_proc = 12
    expect(keys(falloLectura(falloModel(d), 'es'))).not.toContain('lead')
  })
  it('issste: false when the 1 January contracts have more than one award date', () => {
    const d = fallo({ rows: [{ proc: 'S', i: 0, ini: -3, fallo: '2025-04-29' }, { proc: 'I', i: 1, ini: -13, fallo: '2025-01-14', jan1: true }, { proc: 'I2', i: 1, ini: -14, fallo: '2025-01-15', jan1: true }] })
    expect(keys(falloLectura(falloModel(d), 'es'))).not.toContain('issste')
  })
  it('preape: false when no contract started before bids were opened', () => {
    const d = fallo({ rows: [{ proc: 'S', i: 0, ini: -3, fallo: '2025-04-29' }] })
    expect(keys(falloLectura(falloModel(d), 'es'))).not.toContain('preape')
  })
  it('mediana: false without a median signature after the award', () => {
    expect(keys(falloLectura(falloModel(fallo({ fir: null })), 'es'))).not.toContain('mediana')
  })
  it('ademas: false with fewer than two late-signed direct awards', () => {
    expect(keys(falloLectura(falloModel(fallo({ adLag: 1 })), 'en'))).not.toContain('ademas')
  })
  it('head: «uno de cada diez» and «ninguna otra se le acerca» only when the lead tops every large institution', () => {
    const h = falloHead(falloModel(fallo()), 'es')
    expect(h.h1).toBe('Uno de cada diez concursos de la SEDENA empezó antes del fallo')
    expect(text(h.meta)).toMatch(/^Ninguna otra dependencia/)
    const d = fallo({ inst: [{ k: 'SEDENA', pop_proc: 100, early_proc: 10, n: 11 }, { k: 'ISSSTE', pop_proc: 200, early_proc: 40, n: 2 }] })
    expect(text(falloHead(falloModel(d), 'es').meta)).not.toMatch(/Ninguna otra/)
  })
})

// ── C · mismo día ──
const lot = (o: Partial<Lot>): Lot => ({ institution_id: 9, institution_name: 'X', siglas: 'X', vendor_id: 1, vendor_name: 'V SA', is_pf: false, contract_date: '2024-10-17', year: 2024, cls: 'laassp', n: 3, sum_mxn: 1.5e6, max_mxn: 2e5, low_cap_mxn: 284000, high_cap_mxn: 1050000, contract_ids: [1], ...o })
function mismo(over: { lead?: Partial<Lot>; topLots?: number; maypo?: boolean; y2019?: number; above?: number[]; nearAll?: boolean } = {}): MismoResp {
  const rows: Lot[] = [
    lot({ institution_id: 251, siglas: 'IMSS', vendor_id: 51504, vendor_name: 'DIAGNOCELL LABORATORIOS', n: 56, sum_mxn: 5.9e6, max_mxn: 282240, ...over.lead }),
    ...Array.from({ length: over.topLots ?? 120 }, (_, k) => lot({ institution_id: 1327, siglas: 'DICONSA', vendor_id: 45050, vendor_name: 'ALEN DEL NORTE', contract_date: `2020-01-${(k % 28) + 1}`, year: 2020, low_cap_mxn: 270000, high_cap_mxn: 770000, max_mxn: k < 5 ? 268000 : 150000 })),
    ...(over.maypo === false ? [] : [lot({ institution_id: 251, siglas: 'IMSS', vendor_id: 2873, vendor_name: 'FARMACEUTICOS MAYPO', max_mxn: 280000 })]),
    ...Array.from({ length: over.y2019 ?? 4 }, () => lot({ year: 2019, low_cap_mxn: 270000, high_cap_mxn: 770000 })),
    lot({ year: 2023, low_cap_mxn: 270000, high_cap_mxn: 770000 }),
    lot({ is_pf: true, vendor_id: null, vendor_name: null, contract_ids: [] }),
  ]
  if (over.nearAll === false) rows.forEach((r) => { r.max_mxn = Math.min(r.max_mxn, r.low_cap_mxn * 0.9) })
  return { available: true, total: rows.length, rows, meta: { n: rows.length, contracts: 1, vendors: 1, institutions: 3, years: [2019, 2020, 2021, 2022, 2023, 2024, 2025], by_year: {}, placebo_lots_by_m: { '0.75': 1550, '1.0': 1622, '1.25': 1612, '1.5': 1640, '2.0': 1527 }, n_pf_lots: 1, apf_buyers: 477, lead_above_cap: over.above ?? [335866] } }
}

describe('mismo día · La lectura', () => {
  it('every claim holds on the base fixture', () => {
    expect(keys(mismoLectura(mismoModel(mismo()), 'es'))).toEqual(['gap', 'near', 'topv', 'maypo', 'caida'])
  })
  it('gap: false when no named lot falls in the last two PEF years (a persona-física lot never leads)', () => {
    const d = mismo({ lead: { year: 2020 }, maypo: false })
    d.rows.forEach((r) => { if (r.year >= 2024) Object.assign(r, { is_pf: true, vendor_id: null, vendor_name: null }) })
    expect(keys(mismoLectura(mismoModel(d), 'es'))).not.toContain('gap')
  })
  it('gap: the 57th contract is said only when the API returns one above the cap', () => {
    const t = (above: number[]) => text(mismoLectura(mismoModel(mismo({ above })), 'es').find((c) => c.key === 'gap')!.t)
    expect(t([335866])).toMatch(/quedó fuera del lote/)
    expect(t([])).not.toMatch(/quedó fuera/)
  })
  it('near: false when no lot sits within 2% of the cap', () => {
    expect(keys(mismoLectura(mismoModel(mismo({ nearAll: false })), 'es'))).not.toContain('near')
  })
  it('topv: false when no vendor reaches 100 lots', () => {
    expect(keys(mismoLectura(mismoModel(mismo({ topLots: 20 })), 'es'))).not.toContain('topv')
  })
  it('maypo: false when the followed case has no IMSS lot', () => {
    expect(keys(mismoLectura(mismoModel(mismo({ maypo: false })), 'es'))).not.toContain('maypo')
  })
  it('caida: false when 2019 does not exceed 2024', () => {
    expect(keys(mismoLectura(mismoModel(mismo({ y2019: 0 })), 'es'))).not.toContain('caida')
  })
  it('head: «un laboratorio» only for a laboratory', () => {
    expect(mismoHead(mismoModel(mismo()), 'es').h1).toBe('Un laboratorio, un día, 56 contratos justo bajo el tope')
    expect(mismoHead(mismoModel(mismo({ lead: { vendor_name: 'ACME SA' } })), 'en').h1).toBe('One firm, one day, 56 contracts just under the cap')
  })
})

// ── B · arranque ──
const ar = (o: Partial<ArrRow>): ArrRow => ({ vendor_id: 1, vendor_name: 'FIRM SA', first_date: '2015-01-01', first_year: 2015, first_contract_id: 1, y1_mxn: 2e8, y1_n: 3, y1_da_share: 0.1, days_to_threshold: 10, incorp_bucket: 'ge5y', censored: false, flag_10b: false, ...o })
function arranque(over: { crit?: boolean; post?: number; day0?: boolean; young?: number; peak?: number } = {}): ArrResp {
  const rows: ArrRow[] = [
    ...(over.crit === false ? [] : [ar({ vendor_id: 2, vendor_name: 'WHITEMED', first_year: 2024, first_date: '2024-04-25', y1_mxn: 1.065e9, y1_n: 29, y1_da_share: 1, incorp_bucket: 'lt365' }),
      ar({ vendor_id: 3, vendor_name: 'ELEMENTCO', first_year: 2023, first_date: '2023-02-01', y1_mxn: 8.7e8, y1_n: 76, y1_da_share: 0.99, incorp_bucket: 'lt180' })]),
    ...Array.from({ length: over.peak ?? 6 }, (_, k) => ar({ vendor_id: 10 + k, first_year: 2023, first_date: '2023-05-01', y1_da_share: over.post ?? 0.5 })),
    ...Array.from({ length: 4 }, (_, k) => ar({ vendor_id: 30 + k, first_year: 2014, days_to_threshold: over.day0 === false ? 5 : k ? 5 : 0 })),
    ...Array.from({ length: over.young ?? 0 }, (_, k) => ar({ vendor_id: 50 + k, first_year: 2016, incorp_bucket: 'lt180' })),
  ]
  return { available: true, rows, meta: { n: rows.length, n_persona_fisica: 1, n_dropped_prior_name: 1, n_public_dropped: 9, incorp_dated: rows.length, incorp_lt365: 0, incorp_median_days: 2585, universe_first_ge_min: 1000, money_y1_mxn: 1, n_censored: 0, by_first_year: {} } }
}

describe('arranque · La lectura', () => {
  it('every claim holds on the base fixture', () => {
    expect(keys(arranqueLectura(arranqueModel(arranque()), 'es'))).toEqual(['criticas', 'edad'])  // no SPV in the base fixture → no «spv»
  })
  it('criticas: false without a young, no-bid firm since 2019', () => {
    expect(keys(arranqueLectura(arranqueModel(arranque({ crit: false })), 'es'))).not.toContain('criticas')
  })
  it('finding: before 2019, under 90% direct, or an APP special-purpose company never counts', () => {
    const base = arranque({ crit: false })
    const extra = [
      ar({ vendor_id: 90, first_year: 2018, y1_da_share: 1, incorp_bucket: 'lt365' }),
      ar({ vendor_id: 91, first_year: 2022, y1_da_share: 0.89, incorp_bucket: 'lt365' }),
      ar({ vendor_id: 92, vendor_name: 'APP TAMAULIPAS S A P I DE CV', first_year: 2022, y1_da_share: 1, incorp_bucket: 'lt180' }),
      ar({ vendor_id: 93, vendor_name: 'CONSORCIO CARRETERO CAMPECHE-MERIDA S A P I DE CV', first_year: 2022, y1_da_share: 1, incorp_bucket: 'lt180' }),
    ]
    const M = arranqueModel({ ...base, rows: [...base.rows, ...extra] })
    expect(M.F.crit).toHaveLength(0)
    expect(M.F.spv).toHaveLength(2)
    expect(keys(arranqueLectura(M, 'es'))).toContain('spv')
  })
  it('edad: «solo» only while under a fifth of dated firms were under a year old', () => {
    expect(keys(arranqueLectura(arranqueModel(arranque({ young: 10 })), 'es'))).not.toContain('edad')
  })
  it('head: the count, never a company name; no finding → neutral heading', () => {
    const h = arranqueHead(arranqueModel(arranque()), 'es')
    expect(h.h1).toBe('2 empresas con menos de un año de vida recibieron casi todo su primer año sin licitación')
    expect(text(h.meta)).not.toMatch(/WHITEMED|ELEMENTCO/)
    expect(arranqueHead(arranqueModel(arranque({ crit: false })), 'en').h1).toBe('Firms that arrive big in federal contracting')
  })
})
