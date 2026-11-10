import { describe, expect, it } from 'vitest'
import type { LinkedVendor, ScandalListItem } from '@/api/types'
import { caseSeen, exampleCase, modelSaw } from './casesRead'

const c = (slug: string, y0?: number, y1?: number, dy?: number) => ({ slug, contract_year_start: y0, contract_year_end: y1, discovery_year: dy } as ScandalListItem)
const v = (id: number | null, n: number, s: number | null) => ({ vendor_id: id, contract_count: n, avg_risk_score: s } as LinkedVendor)

describe('exampleCase', () => {
  it('picks the longest silence after the last contract year', () => {
    expect(exampleCase([c('a', 2013, 2014, 2017), c('l12', 2008, 2012, 2021), c('s', 2020, 2022, 2022)])?.slug).toBe('l12')
  })
  it('skips cases CompraNet cannot see (Línea 12)', () => {
    const l12 = { ...c('l12', 2008, 2012, 2021), compranet_visibility: 'none' } as ScandalListItem
    expect(exampleCase([c('a', 2013, 2014, 2017), l12])?.slug).toBe('a')
  })
  it('is null when every case came to light inside its contract years', () => {
    expect(exampleCase([c('s', 2020, 2022, 2022), c('t', 2019, 2023, 2022), c('x', undefined, 2020, 2021)])).toBeNull()
  })
})

describe('caseSeen', () => {
  it('counts vendors with contracts averaging alto or crítico', () => {
    expect(caseSeen([v(1, 40, 0.91), v(2, 1, 0.19), v(3, 0, null), v(null, 0, null)])).toEqual({ n: 2, seen: 1 })
  })
  it('uses the 0.40 threshold (medium does not count)', () => {
    expect(caseSeen([v(1, 3, 0.39), v(2, 3, 0.40)])).toEqual({ n: 2, seen: 1 })
  })
  it('is null when no vendor has CompraNet contracts', () => {
    expect(caseSeen([v(null, 0, null), v(5, 0, null)])).toBeNull()
  })
})

describe('modelSaw', () => {
  it('counts cases with contracts and cases with a flagged vendor', () => {
    const d = [{ linked_vendors: [v(1, 4, 0.13)] }, { linked_vendors: [v(2, 12, 0.93)] }, { linked_vendors: [v(null, 0, null)] }]
    expect(modelSaw(d)).toEqual({ withContracts: 2, seen: 1 })
  })
  it('waits for every detail', () => {
    expect(modelSaw([{ linked_vendors: [v(2, 12, 0.93)] }, undefined])).toBeNull()
  })
  it('leaves out cases CompraNet cannot see (Línea 12: only via ICA federal contracts)', () => {
    const d = [{ linked_vendors: [v(2, 12, 0.93)], compranet_visibility: 'none' as const }, { linked_vendors: [v(1, 4, 0.13)] }]
    expect(modelSaw(d)).toEqual({ withContracts: 1, seen: 0 })
  })
  it('is null when no case has contracts', () => {
    expect(modelSaw([{ linked_vendors: [] }])).toBeNull()
  })
})
