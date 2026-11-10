import { describe, expect, it } from 'vitest'
import { critShare, destacan, findingColumn, findingCritCount, findingCritPesos, fullMonth, standout, findingSplit, findingTerm, findingYear, levelOf, monthOf, profileOf, slugOf, splitRows, thinYears, words, type ColTerm, type ColYear, type Columna, type MonthSignals, type PeriodSplit, type SigMonth } from './columna'

const months = (v: number[]) => v.map((value, i) => ({ month: i + 1, contracts: value ? 10 : 0, value, crit100: value ? 5 : null }))
const yr = (year: number, term: string, value: number, contracts = 100): ColYear => ({
  year, term, value, contracts, da_share: year >= 2011 ? 0.4 : null, crit100: 5,
  months: months([value / 2, 0, 0, 0, 0, value / 2, 0, 0, 0, 0, 0, 0]), vendors: [], top_contracts: [],
})
const data: Columna = {
  cut: '2025-09-28', first_year: 2003, last_year: 2025,
  years: [yr(2003, 'fox', 100), yr(2004, 'fox', 1, 5), yr(2005, 'fox', 120), yr(2020, 'amlo', 500), yr(2025, 'sheinbaum', 700)],
  terms: [],
}
const term: ColTerm = {
  key: 'amlo', years: [2019, 2020], contracts: 10, value: 1000, value_per_year: 500, da_share: 0.39, da_years: [2019, 2020], crit100: 6,
  vendors: [], institutions: [], sectors: [{ sector_id: 1, value: 430, share: 0.43 }, { sector_id: 4, value: 200, share: 0.2 }],
}
const money = (n: number) => `${n} MDP`
const q = (s: string) => new URLSearchParams(s)
const salud = { sector_id: 1, share: 0.4, year_share: 0.2, lift: 0.2 }
const sm = (month: number, value: number, crit_value: number, top_sector: SigMonth['top_sector'], crit_n = crit_value ? 3 : 0): SigMonth =>
  ({ month, contracts: value ? 10 : 0, value, crit_n, crit_value, da_value: 0, top_sector })
const sn = (id: number) => (id === 1 ? 'Salud' : 'Otro')
const sig: MonthSignals = {
  year: 2024, value: 1002, contracts: 200, crit_n: 13, crit_value: 552, crit_share: 0.551, source: 'compranet', new_vendor: null,
  months: [sm(1, 300, 200, null, 2), sm(2, 200, 0, salud, 2), sm(3, 0, 0, null), sm(10, 2, 2, { ...salud, lift: 0.9 }, 1), sm(12, 500, 350, null, 8)],
}

describe('levelOf', () => {
  it('reads a term and a year that belongs to it', () => {
    expect(levelOf(q('g=amlo&y=2020'), data)).toEqual({ g: 'amlo', y: 2020 })
  })
  it('a year alone opens its own term', () => {
    expect(levelOf(q('y=2025'), data)).toEqual({ g: 'sheinbaum', y: 2025 })
  })
  it('drops a year outside the named term, an unknown year, and a bad slug', () => {
    expect(levelOf(q('g=fox&y=2020'), data)).toEqual({ g: 'fox', y: null })
    expect(levelOf(q('g=amlo&y=1999'), data)).toEqual({ g: 'amlo', y: null })
    expect(levelOf(q('g=nadie'), data)).toEqual({ g: null, y: null })
  })
  it('maps backend keys to slugs', () => {
    expect(slugOf('pena_nieto')).toBe('pena-nieto')
    expect(slugOf('nope')).toBeNull()
  })
})

describe('thinYears', () => {
  it('flags only the near-empty year', () => {
    expect([...thinYears(data.years)]).toEqual([2004])
  })
})

describe('findings (≤ 15 words, true to the payload)', () => {
  it('column: names the widest year', () => {
    const s = findingColumn(data, 'es', money)
    expect(s).toBe('2025 ya es el año con más dinero, y solo llega a septiembre: 700 MDP.')
    expect(words(s)).toBeLessThanOrEqual(15)
    expect(findingColumn({ ...data, cut: '2026-01-31' }, 'es', money)).toBe('2025 es el año con más dinero contratado: 700 MDP.')
    expect(findingColumn(data, 'en', money)).toContain('only runs to September')
  })
  it('term: the top sector share, the open term names its year', () => {
    const name = (id: number) => (id === 1 ? 'Salud' : 'Energía')
    const closed = findingTerm(term, 'López Obrador', name, 'es', false)
    expect(closed).toBe('Con López Obrador, salud se llevó 43 de cada 100 pesos.')
    expect(findingTerm(term, 'Sheinbaum', name, 'es', true)).toMatch(/^Con Sheinbaum, en \d{4}, /)
    expect(words(closed ?? '')).toBeLessThanOrEqual(15)
    expect(findingTerm({ ...term, sectors: [] }, 'x', name, 'es', false)).toBeNull()
  })
  it('year: its critical contracts by count (not the biggest month)', () => {
    expect(findingYear(data.years[3], 'es')).toBe('En 2020, 5 contratos tuvieron indicador de riesgo crítico.')
    expect(words(findingYear(data.years[3], 'es')!)).toBeLessThanOrEqual(15)
    expect(findingYear({ ...data.years[3], crit100: null }, 'es')).toBeNull()
    expect(findingYear(data.years[3], 'es', 7675)).toBe('En 2020, 7,675 contratos tuvieron indicador de riesgo crítico.')
  })
})

describe('profileOf', () => {
  it('a closed term: money per year, direct awards, critical, top sector — every sentence ≤ 15 words', () => {
    const p = profileOf({ ...term, da_contracts: 7, da_base: 10 }, 'amlo', 'es', money, false)
    expect(p.spent).toMatch(/^Entre \d{4} y \d{4} contrató 1000 MDP\.$/)
    expect(p.noTender).toBe('39 de cada 100 pesos se dieron sin concurso.')
    expect(p.noTenderCount).toBe('Por número, 70 de cada 100 contratos fueron sin concurso.')
    expect(p.crit).toBe('6 de cada 100 contratos tienen indicador crítico.')
    for (const s of Object.values(p)) if (s) expect(words(s)).toBeLessThanOrEqual(15)
  })
  it('the running term speaks of its first year; no direct-award record → says so, no count', () => {
    const p = profileOf({ ...term, da_share: null, da_contracts: null, da_base: null }, 'sheinbaum', 'en', money, true)
    expect(p.spent).toBe("In 2020 it contracted 1000 MDP, up to the record's cut-off.")
    expect(p.noTender).toMatch(/^Before 2011/)
    expect(p.noTenderCount).toBeNull()
  })
  it('counts only the years with a real record', () => {
    expect(profileOf({ ...term, value: 900, years: [2002, 2003, 2004, 2005, 2006] }, 'fox', 'es', money, false).spent).toBe('Entre 2002 y 2006 contrató 900 MDP.')
  })
  it('Calderón carries the 2011–12 caveat', () => {
    expect(profileOf(term, 'calderon', 'es', money, false).noTender).toMatch(/solo 2011 y 2012/)
  })
})

describe('W7: the open year — months and categories', () => {
  const y = yr(2020, 'amlo', 500)
  const mn = (m: number) => ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'][m - 1]
  const split: PeriodSplit = {
    year: 2020, month: null, contracts: 30, value: 1000,
    rows: [
      { category_id: null, name_es: null, name_en: null, contracts: 5, value: 400 },
      { category_id: 20, name_es: 'Medicamentos', name_en: 'Medicines', contracts: 10, value: 300 },
      { category_id: 26, name_es: 'Obra pública', name_en: 'Public works', contracts: 10, value: 200 },
      { category_id: 45, name_es: 'Alimentos', name_en: 'Food', contracts: 5, value: 100 },
    ],
  }
  it('monthOf: a month with contracts only', () => {
    expect(monthOf(q('m=6'), y)).toBe(6)
    expect(monthOf(q('m=2'), y)).toBeNull() // no contracts in February
    expect(monthOf(q('m=13'), y)).toBeNull()
    expect(monthOf(q('m=6'), undefined)).toBeNull()
  })
  it('findingCritPesos + findingCritCount: tenths of pesos, then the count (true, ≤ 15 words)', () => {
    expect(findingCritPesos(sig, 'es')).toBe('6 de cada 10 pesos fueron a contratos con indicador de riesgo crítico.')
    expect(findingCritCount(sig, 'es')).toBe('Los contratos grandes pesan más: por número, solo 7 de cada 100 son críticos.')
    expect(words(findingCritPesos(sig, 'es')!)).toBeLessThanOrEqual(15)
    expect(words(findingCritCount(sig, 'es')!)).toBeLessThanOrEqual(15)
    expect(findingCritPesos({ ...sig, value: 0 }, 'es')).toBeNull()
    expect(findingCritCount({ ...sig, contracts: 0 }, 'es')).toBeNull()
  })
  it('standout: needs ≥ 20 % of the month AND ≥ 10 points over the year; fullMonth drops stray weeks', () => {
    expect(standout(sm(1, 100, 0, salud))?.sector_id).toBe(1)
    expect(standout(sm(1, 100, 0, { ...salud, lift: 0.05 }))).toBeNull()
    expect(standout(sm(1, 100, 0, { ...salud, share: 0.15, year_share: 0.02, lift: 0.13 }))).toBeNull()
    expect(fullMonth(sig.months[3], sig)).toBe(false)
    expect(critShare(sm(1, 0, 0, null))).toBeNull()
  })
  it('destacan: sector jump (not from a stray month), spike ≥ 1.5× the monthly average, new vendor ≥ 0.5 %', () => {
    const d = destacan(sig, mn, sn, 'es', money)
    expect(d.map((x) => x.kind)).toEqual(['sector', 'spike'])
    expect(d[0]).toEqual({ kind: 'sector', month: 2, text: 'En febrero, Salud subió a 40 de cada 100 pesos; en el año, 20.' })
    expect(d[1]).toEqual({ kind: 'spike', month: 12, text: 'Diciembre tuvo 8 contratos críticos: 2 veces el promedio mensual.' })
    for (const x of d) expect(words(x.text)).toBeLessThanOrEqual(15)
    const nv = { id: 1, name: 'X', persona_fisica: false, value: 50, share: 0.05, crit_n: 1 }
    expect(destacan({ ...sig, new_vendor: nv }, mn, sn, 'es', money).at(-1)?.text).toBe('ganó 50 MDP en 2024, su primer año con contratos federales.')
    expect(destacan({ ...sig, new_vendor: { ...nv, share: 0.001 } }, mn, sn, 'es', money).some((x) => x.kind === 'vendor')).toBe(false)
    // false: no standout, flat months → nothing
    const flat = { ...sig, months: [sm(1, 300, 100, null, 3), sm(2, 300, 100, null, 3), sm(3, 400, 100, null, 4)] }
    expect(destacan(flat, mn, sn, 'es', money)).toEqual([])
  })
  it('splitRows: top named categories, the rest summed, uncategorised apart', () => {
    const r = splitRows(split, 2)
    expect(r.top.map((x) => x.category_id)).toEqual([20, 26])
    expect(r.rest).toEqual({ n: 1, value: 100 })
    expect(r.none).toBe(400)
  })
  it('findingSplit: the largest NAMED category (not the uncategorised money)', () => {
    const s = findingSplit(split, '2020', 'es')!
    expect(s).toBe('Medicamentos se llevó 30 de cada 100 pesos en 2020.')
    expect(s).not.toContain('40')
    expect(words(findingSplit(split, 'marzo de 2020', 'es')!)).toBeLessThanOrEqual(15)
    expect(findingSplit(split, '2020', 'en')).toBe('Medicines took 30 of every 100 pesos in 2020.')
    expect(findingSplit({ ...split, rows: [split.rows[0]] }, '2020', 'es')).toBeNull()
  })
})
