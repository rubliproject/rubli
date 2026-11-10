import { describe, expect, it } from 'vitest'
import { critLine, findingBig, findingSubs, findingWho, subHref, subVsCat, type CatContract, type CatSub } from './panorama'

const agg = { share_pct: null, da_pct: null, avg_risk: null, hr_pct: null }
const sub = (code: string, m: number, extra: Partial<CatSub> = {}): CatSub => ({ ...agg, code, name_es: code, name_en: code, is_catch_all: false, amount_mxn: m, contracts: 100, ...extra })

describe('findingSubs', () => {
  it('says the catch-all share when ≥ 3 of 10 pesos, and the riskiest named box', () => {
    const t = findingSubs({ amount_mxn: 100, subs: [sub('otros', 70, { is_catch_all: true }), sub('hemo', 30, { hr_pct: 65 })] }, 'es')
    expect(t).toBe('7 de cada 10 pesos no dicen qué se compró. Más riesgo: hemo, 65 de 100 contratos alto o crítico.')
  })
  it('skips the catch-all line under 3 of 10 and boxes under 50 contracts', () => {
    const t = findingSubs({ amount_mxn: 100, subs: [sub('a', 90), sub('otros', 10, { is_catch_all: true }), sub('b', 0, { contracts: 10, hr_pct: 99 })] }, 'en')
    expect(t).toBe('The biggest box: a.')
  })
})

describe('findingWho', () => {
  const s = { ...agg, amount_mxn: 1, contracts: 9, vendor_id: 1, vendor_name: 'ACME', share_pct: 12.4 }
  it('names the top supplier; a pair only at ≥ 50 of the buyer’s pesos', () => {
    const pair = { ...agg, amount_mxn: 1, contracts: 9, vendor_id: 1, vendor_name: 'ACME', institution_id: 5, institution_name: 'IMSS', siglas: 'IMSS', of_buyer_pct: 49 }
    expect(findingWho({ suppliers: [s], pairs: [pair] }, 'es')).toHaveLength(2)
    expect(findingWho({ suppliers: [s], pairs: [{ ...pair, of_buyer_pct: 80 }] }, 'es')).toHaveLength(5)
  })
})

describe('critLine / subVsCat / findingBig', () => {
  it('says money AND count for critical', () => {
    expect(critLine({ crit_value_pct: 41, crit_pct: 0.4 }, 'es')).toBe('41 de cada 100 pesos van a contratos con indicador de riesgo crítico. Por número, <1 de cada 100.')
    expect(critLine({ crit_value_pct: null, crit_pct: 3 }, 'es')).toBeNull()
  })
  it('compares a subcategory with its category', () => {
    expect(subVsCat({ hr_pct: 65 }, { hr_pct: 27 }, 'es')).toBe('65 de 100 contratos alto o crítico. Más del doble que su categoría (27).')
    expect(subVsCat({ hr_pct: 29 }, { hr_pct: 27 }, 'es')).toBe('Como su categoría: 29 de 100 contratos alto o crítico.')
    expect(subVsCat({ hr_pct: 10 }, undefined, 'es')).toBeNull()
  })
  it('largest contract share + direct count', () => {
    const k = (m: number, d: boolean) => ({ id: 1, amount_mxn: m, is_direct_award: d }) as CatContract
    expect(findingBig({ amount_mxn: 1000, top_contracts: [k(200, true), k(10, false)] }, 'es')).toBe('El mayor solo es 20 % del total. 1 de estos 2 fueron sin concurso.')
    // a flagged row 1 is named as flagged (audit A5), and the largest confirmed one is given
    const flag = { ...k(35000, true), amount_flag: 'review' } as CatContract
    expect(findingBig({ amount_mxn: 1000, top_contracts: [flag, k(200, true)] }, 'es')).toBe('El primero está marcado para revisión; el mayor confirmado es 20 % del total. 2 de estos 2 fueron sin concurso.')
  })
  it('subHref uses the code', () => { expect(subHref(20, 'blood_products')).toBe('/categories/20/sub/blood_products') })
})
