import { describe, expect, it } from 'vitest'
import type { CategoryCoverData } from '@/api/categoryCover'
import { categoryVerdict, p100, periodDirect } from './verdict'

const base = (over: Partial<CategoryCoverData['totals']>, sup: number[], years: CategoryCoverData['years']): CategoryCoverData => ({
  category: { id: 1, name_es: 'X', name_en: 'X', sector_id: 1, sector_code: 'salud' },
  totals: { n: 100, v: 1000, da_v: 0, da_n: 0, hr_n: 10, comp_n: 50, sb_n: 5, flagged: 0, vendors: 9, buyers: 3, y0: 2002, y1: 2025, ...over },
  years,
  suppliers: sup.map((v, i) => ({ id: i, name: `V${i}`, n: 1, v, da_v: 0, da_n: 0, flagged: 0, y0: 2010, y1: 2020, risk: 0.3, primary_sector_id: 1, buyers: [], years: [] })),
  post: { n: 0, v: 0, da_v: 0, da_n: 0, no_amount: 0, flagged: 0, k: 0, suppliers: [], pf: { n: 0, v: 0 } },
  ranks: { money: null, contracts: null, da_money: null, da_count: null, top3: null, hr: null, post: null },
})
const yr = (y: number, v: number, da_v: number | null) => ({ y, n: 1, v, hr_n: 0, flagged: 0, da_v, da_n: da_v == null ? null : 1 })

describe('category verdict engine', () => {
  it('concentration by top-3 money share', () => {
    expect(categoryVerdict(base({}, [300, 150, 60], []), false).conc).toBe('tres')
    expect(categoryVerdict(base({}, [200, 80, 40], []), false).conc).toBe('pocos')
    expect(categoryVerdict(base({}, [100, 50, 20], []), false).conc).toBe('muchos')
  })
  it('procedure: money first, then contracts', () => {
    expect(categoryVerdict(base({ da_v: 610, da_n: 93 }, [1], []), false).proc).toBe('directa')
    expect(categoryVerdict(base({ da_v: 430, da_n: 70 }, [1], []), false).proc).toBe('chica')
    expect(categoryVerdict(base({ da_v: 330, da_n: 54 }, [1], []), true).kicker).toContain('the money is tendered')
  })
  it('trend skips years without a procedure flag (Structure A)', () => {
    const years = [yr(2007, 1000, null), yr(2012, 100, 20), yr(2022, 100, 60)]
    expect(periodDirect(years, 2007, 2018)).toBeCloseTo(0.2)
    const v = categoryVerdict(base({}, [1], years), false)
    expect(v.trend).toBe('up')
    expect(v.kicker).toContain('la directa va a más')
  })
  it('flat trend stays silent', () => {
    const v = categoryVerdict(base({}, [1], [yr(2012, 100, 50), yr(2022, 100, 55)]), false)
    expect(v.trend).toBe('flat')
    expect(v.kicker.split(' · ')).toHaveLength(2)
  })
  it('p100 never prints 0 for a real share', () => {
    expect(p100(0.001)).toBe('<1')
    expect(p100(0)).toBe('0')
    expect(p100(0.613)).toBe('61')
  })
})
