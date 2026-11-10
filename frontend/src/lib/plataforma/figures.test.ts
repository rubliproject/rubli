import { describe, expect, it } from 'vitest'
import type { ExecutiveSummaryRisk } from '@/api/types'
import { exportUrl, fmtBytes, riskShares } from './figures'

const risk = {
  critical_count: 164334, critical_pct: 5.17, high_count: 151840, high_pct: 4.78,
  medium_count: 396839, medium_pct: 12.48, low_count: 2465891, low_pct: 77.57,
} as ExecutiveSummaryRisk

describe('riskShares', () => {
  it('true: four shares in order when they add to ~100', () => {
    expect(riskShares(risk)?.map((s) => s.level)).toEqual(['critical', 'high', 'medium', 'low'])
  })
  it('false: null when missing or not adding up', () => {
    expect(riskShares(null)).toBeNull()
    expect(riskShares({ ...risk, low_pct: 20 })).toBeNull()
  })
})

describe('fmtBytes', () => {
  it('reads the 2026.11 files as Zenodo lists them', () => {
    expect(fmtBytes(5_380_792_320)).toBe('5.4 GB')
    expect(fmtBytes(418_004_992)).toBe('418 MB')
  })
})

describe('exportUrl', () => {
  const API = 'https://rubli.xyz/api/v1'
  it('true: builds the filtered contract export', () => {
    expect(exportUrl(API, { format: 'csv', sectorId: 1, year: 2024, riskMin: 'high', limit: 1000 }, 2026))
      .toBe(`${API}/export/contracts/csv?sector_id=1&year=2024&risk_level_min=high&limit=1000`)
  })
  it('false: drops out-of-range filters and caps the rows', () => {
    expect(exportUrl(API, { format: 'excel', sectorId: 1, year: 2030, limit: 500_000 }, 2026))
      .toBe(`${API}/export/contracts/excel?sector_id=1&limit=100000`)
  })
  it('false: an unfiltered export never asks for more than the API allows without a filter', () => {
    expect(exportUrl(API, { format: 'csv', sectorId: 13, limit: 100_000 }, 2026))
      .toBe(`${API}/export/contracts/csv?limit=10000`)
  })
})
