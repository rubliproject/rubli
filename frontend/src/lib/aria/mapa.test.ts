import { describe, expect, it } from 'vitest'
import type { AriaMapaVendor } from '@/api/types'
import type { SkyManifest } from '@/lib/atlas/sky/geometry'
import { aspectText, filaManifest, softPattern, spanYears, stamps } from './mapa'

const vendor = (p: Partial<AriaMapaVendor> = {}): AriaMapaVendor => ({
  rank: 1, vendor_id: 1, vendor_name: 'X', ips_final: 0.8, ips_tier: 1, avg_risk_score: 0.7, primary_pattern: 'P6', pattern_confidences: null,
  primary_sector_id: 1, total_value_mxn: 400_000_000, total_contracts: 10, top_institution: 'IMSS', top_institution_id: 251, top_institution_ratio: 0.97,
  direct_award_rate: 0.9, single_bid_rate: 0.5, years_active: 2, first_contract_year: 2021, last_contract_year: 2022,
  is_disappeared: false, is_efos_definitivo: false, is_sfp_sanctioned: false, in_ground_truth: false, aspects: [], ...p,
})

describe('aspectText', () => {
  it('phrases the single buyer with its number', () => {
    expect(aspectText({ k: 'ratio', v: 0.97, pct: 0.99 }, vendor(), 'es')).toBe('10 de cada 10 contratos con IMSS')
    expect(aspectText({ k: 'ratio', v: 0.72, pct: 0.9 }, vendor(), 'en')).toBe('7 of every 10 contracts with IMSS')
  })
  it('never prints a saturated indicator: crítico is «≥ 0.60»', () => {
    expect(aspectText({ k: 'risk', v: 0.997, pct: 0.96 }, vendor(), 'es')).toBe('indicador de riesgo ≥ 0.60, crítico')
    expect(aspectText({ k: 'risk', v: 0.45, pct: 0.5 }, vendor(), 'en')).toBe('risk indicator 0.45, high')
  })
  it('the newcomer carries its money and its span', () => {
    const t = aspectText({ k: 'new', v: 2021, pct: 0.9 }, vendor(), 'es')
    expect(t).toMatch(/^apareció en 2021: .* en 2 años$/)
    expect(spanYears(vendor({ first_contract_year: 2024, last_contract_year: 2024 }))).toBe(1)
  })
  it('flags are plain words in both languages', () => {
    expect(aspectText({ k: 'efos', v: 1, pct: 0.98 }, vendor(), 'es')).toContain('69-B')
    expect(aspectText({ k: 'gone', v: 2019, pct: 0.9 }, vendor(), 'en')).toBe('no contracts since 2019')
    expect(aspectText({ k: 'da', v: 0.9, pct: 0.7 }, vendor(), 'es')).toBe('90 % de sus contratos sin licitación')
  })
})

describe('softPattern + stamps', () => {
  it('uses the soft names, never «captura», «fantasma» or «monopolio»', () => {
    for (const c of ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7']) {
      const es = softPattern(c, 'es')!
      expect(es).toBeTruthy()
      expect(es.toLowerCase()).not.toMatch(/captura|fantasma|monopolio/)
    }
    expect(softPattern(null, 'es')).toBeNull()
  })
  it('M is always on; the external stamps follow the flags', () => {
    expect(stamps(vendor({ is_efos_definitivo: true })).filter((s) => s.on).map((s) => s.k)).toEqual(['M', 'SAT'])
  })
})

describe('filaManifest', () => {
  const m = {
    inst_map: { raw: [9, 2], canon: [1, 2] },
    sectors: [{ id: 1, h_p90: 0.4 }, { id: 4, h_p90: 0.3 }],
    stars: { id: [1, 2, 3], name: ['A', 'B', 'C'], siglas: ['a', 'b', 'c'], sector: [1, 1, 4], x: [0, 1, 2], y: [0, 1, 2], r: [1, 1, 1], v: [5, 5, 5], h: [0, 0, 0], nv: [1, 1, 1], drawn: [1, 1, 1], np: [0, 0, 0], rem: [0, 0, 0], linked: [0, 0, 0] },
  } as unknown as SkyManifest
  const inst = (institution_id: number | null, value: number, tier1: number) =>
    ({ siglas: 's', institution_id, name: 'n', sector_id: 1, vendors: 3, value, worst_tier: 1, tier1, top_vendor_id: 1, top_vendor_name: 'v' })

  it('keeps only the buyers in the fila, through the canonical map, and rings the tier-1 holders', () => {
    const { manifest, dropped } = filaManifest(m, [inst(9, 100, 1), inst(3, 50, 0), inst(null, 7, 0), inst(77, 7, 0)])
    expect(manifest.stars.id).toEqual([1, 3])
    expect(manifest.stars.v).toEqual([100, 50])
    expect(manifest.stars.h).toEqual([1, 0])
    expect(manifest.stars.nv).toEqual([3, 3])
    expect(manifest.sectors.every((g) => g.h_p90 === 1)).toBe(true)
    expect(dropped).toBe(2)
  })
})
