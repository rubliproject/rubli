import { describe, expect, it } from 'vitest'
import { buildScales, multipleWords, peakReading, pickSignals, sharePct, signalClaims, strongestScale, whyLine } from './modelReads'

// Shape of /vendors/17455/risk-waterfall (Jet Van, 2026-11-04, trimmed). Since 11-05 the v0.9.2 z_score is
// centred (entity mean − all-contract mean), so a negative z is «menos que lo habitual»; these numbers are pre-centring.
const JET = [
  { feature: 'rt4_log', z_score: 4.489, coefficient: 0.5916, contribution: 2.6555 },
  { feature: 'price_volatility', z_score: 1.1825, coefficient: 0.8108, contribution: 0.9588 },
  { feature: 'sector_spread', z_score: 2.5697, coefficient: -0.187, contribution: -0.4805 },
  { feature: 'vendor_concentration', z_score: 1.2343, coefficient: 0.173, contribution: 0.2135 },
  { feature: 'price_ratio', z_score: 0.3881, coefficient: 0.4563, contribution: 0.1771 },
  { feature: 'inst_hhi_prior', z_score: 0.0412, coefficient: 0.771, contribution: 0.0318 },
  { feature: 'cobid_herfindahl', z_score: 0.0849, coefficient: -0.3038, contribution: -0.0258 },
]

describe('pickSignals', () => {
  it('keeps the raising terms above the noise floor, largest first, and the main lowering one', () => {
    const { up, down } = pickSignals(JET)
    expect(up.map((s) => s.feature)).toEqual(['rt4_log', 'price_volatility', 'vendor_concentration', 'price_ratio'])
    expect(down?.feature).toBe('sector_spread')
    expect(up[0].es).toBe('Vende a más dependencias que lo habitual')
    expect(up[0].weight).toBe('strong')
    expect(up[3].weight).toBe('light')
  })
  it('words follow the side of the baseline, not the push (negative z, negative coef = raises)', () => {
    const { up } = pickSignals([{ feature: 'recency_z', z_score: -0.9, coefficient: -0.2, contribution: 0.18 }])
    expect(up[0].es).toBe('Su actividad es menos reciente que lo habitual')
  })
  it('v0.9.2 centred gap: below the usual + positive coef = lowers, worded «menos» (SILVER 11-05)', () => {
    const { up, down } = pickSignals([
      { feature: 'rt4_log', z_score: -0.62, coefficient: 0.5916, contribution: -0.3668 },
      { feature: 'inst_hhi_prior', z_score: -0.2, coefficient: 0.771, contribution: -0.1542 },
      { feature: 'price_ratio', z_score: 1.1, coefficient: 0.4563, contribution: 0.5019 },
    ])
    expect(down?.es).toBe('Vende a menos dependencias que lo habitual')
    expect(up.map((s) => s.feature)).toEqual(['price_ratio'])
    expect(pickSignals([{ feature: 'inst_hhi_prior', z_score: -0.2, coefficient: 0.771, contribution: -0.1542 }]).down?.es)
      .toBe('Antes vendía a más compradores que lo habitual')
  })
  it('no lowering term above the floor → down is null; empty input → nothing', () => {
    expect(pickSignals(JET.filter((t) => t.contribution > 0)).down).toBeNull()
    expect(pickSignals(null)).toEqual({ up: [], down: null })
  })
  it('never says «precio»', () => {
    const { up, down } = pickSignals(JET)
    for (const s of [...up, down!]) expect(`${s.es} ${s.en}`.toLowerCase()).not.toMatch(/precio|price/)
  })
})

const PEER = [
  { metric: 'avg_risk_score', value: 0.6974, peer_median: 0.1066 },
  { metric: 'direct_award_pct', value: 76.57, peer_median: 11.11 },
  { metric: 'price_per_contract', value: 21234047, peer_median: 1266712 },
  { metric: 'single_bid_competitive_pct', value: 75.1, peer_median: 100 },
]

describe('buildScales + multipleWords', () => {
  const s = buildScales(PEER, { high_risk_pct: 81.5 })
  const by = (k: string) => s.find((x) => x.key === k)!
  it('direct award: 6.9 veces lo habitual (es-MX decimal point)', () => {
    expect(multipleWords(by('direct_award'), 'es')).toBe('6.9 veces lo habitual')
    expect(multipleWords(by('direct_award'), 'en')).toBe('6.9 times the usual')
  })
  it('below the usual reads as a percentage less', () => {
    expect(multipleWords(by('single_bid'), 'es')).toBe('25 % menos que lo habitual')
  })
  it('high/critical is compared with every contract, not the sector', () => {
    expect(by('high_risk').typicalIs).toBe('all')
  })
  it('a missing rate is sin dato with its own words', () => {
    const e = buildScales([{ metric: 'single_bid_competitive_pct', value: null, peer_median: 20 }], {})
    expect(multipleWords(e[0], 'es')).toBe('no participó en licitaciones')
  })
  it('the foco goes to the largest multiple; none under 1.5×', () => {
    expect(strongestScale(s)?.key).toBe('amount')
    expect(strongestScale(buildScales([{ metric: 'direct_award_pct', value: 12, peer_median: 11 }], {}))).toBeNull()
  })
  it('no label says «precio»', () => {
    for (const x of s) expect(`${x.es} ${x.en}`.toLowerCase()).not.toMatch(/precio|price/)
  })
})

describe('peakReading', () => {
  it('names the peak year, its sexenio and the last year', () => {
    expect(peakReading([{ year: 2014, avg: 0.5 }, { year: 2016, avg: 0.82 }, { year: 2020, avg: 0.6 }], 'es'))
      .toBe('Su indicador más alto fue 0.82 en 2016, en el sexenio de Enrique Peña Nieto. En 2020 quedó en 0.60.')
  })
  it('flags a 2002–2010 peak as weak data; under two points there is no reading', () => {
    expect(peakReading([{ year: 2006, avg: 0.9 }, { year: 2012, avg: 0.3 }], 'en')).toContain('weak data')
    expect(peakReading([{ year: 2012, avg: 0.3 }], 'es')).toBeNull()
  })
})

describe('signalClaims (each sentence only when its condition holds)', () => {
  const keys = (...a: Parameters<typeof signalClaims>) => signalClaims(...a).map((c) => c.key)
  it('raises: true with a raising term above the floor, false without', () => {
    const c = signalClaims(JET, 0.7, 'critical').find((x) => x.key === 'raises')!
    expect(c.es).toBe('Lo que más sube su indicador: vende a más dependencias que lo habitual (58 % del peso total).')
    expect(keys(JET.filter((t) => t.contribution < 0.05), 0.2, 'low')).not.toContain('raises')
  })
  it('alone: true when the top term is over half of the push, false at or under half', () => {
    expect(keys(JET, 0.7, 'critical')).toContain('alone') // 2.6555 / 4.5430 = 58 %
    // GFE (29277): two big terms share the push
    const gfe = [
      { feature: 'price_volatility', z_score: 4.26, coefficient: 0.729, contribution: 3.106 },
      { feature: 'vendor_concentration', z_score: 10.11, coefficient: 0.2422, contribution: 2.4486 },
      { feature: 'rt4_log', z_score: 1.99, coefficient: 0.2897, contribution: 0.5753 },
      { feature: 'price_ratio', z_score: 0.44, coefficient: 0.4493, contribution: 0.1972 },
      { feature: 'cobid_herfindahl', z_score: 0.86, coefficient: 0.1927, contribution: 0.1665 },
      { feature: 'industry_mismatch', z_score: 2.47, coefficient: 0.0324, contribution: 0.0799 },
      { feature: 'win_rate', z_score: 1.7, coefficient: -0.0446, contribution: -0.0757 },
    ] // top share 3.106 / 6.65 = 47 %
    expect(keys(gfe, 0.9971, 'critical')).toEqual(['raises', 'lowers', 'level'])
  })
  it('lowers: true with a lowering term above the floor, false without', () => {
    expect(signalClaims(JET, 0.7, 'critical').find((x) => x.key === 'lowers')!.en).toBe('What lowers it most: sells in more sectors than usual (11%).')
    expect(keys(JET.filter((t) => t.contribution > 0), 0.7, 'critical')).not.toContain('lowers')
  })
  it('only lowering terms: no «raises» sentence, the lowering one still reads', () => {
    const k = keys([{ feature: 'sector_spread', z_score: 2, coefficient: -0.2, contribution: -0.4 }], 0.1, 'low')
    expect(k).toEqual(['lowers', 'level'])
  })
  it('level: true with a score, false without one', () => {
    expect(signalClaims(JET, 0.6974, 'critical').find((x) => x.key === 'level')!.es).toBe('Resultado: 0.70, nivel crítico.')
    expect(keys(JET, null, null)).not.toContain('level')
  })
  it('sharePct: whole percent, «<1 %» for a sliver', () => {
    expect(sharePct(0.456, 'es')).toBe('46 %')
    expect(sharePct(0.004, 'en')).toBe('<1%')
  })
  it('no claim says «precio» or «probabilidad»', () => {
    for (const c of signalClaims(JET, 0.7, 'critical')) expect(`${c.es} ${c.en}`.toLowerCase()).not.toMatch(/precio|price|probabil/)
  })
})

describe('whyLine — one sentence for the vendor and the contract page', () => {
  const t = (feature: string, contribution: number, z = 1) => ({ feature, z_score: z, coefficient: 1, contribution })
  it('names the top two raising terms in the shared words', () => {
    expect(whyLine([t('price_volatility', 0.5), t('price_ratio', 0.3), t('rt4_log', -0.4)], 'es'))
      .toBe('Lo que más pesa en su indicador: sus montos cambian más que lo habitual; después, contratos más grandes que la mediana de su sector.')
  })
  it('is null when nothing raises it', () => {
    expect(whyLine([t('rt4_log', -0.4)], 'en')).toBeNull()
  })
})
