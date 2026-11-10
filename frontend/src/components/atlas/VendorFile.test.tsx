// Regression: the card printed «contrato máximo 1.1 mil MXN» for GRUPO FARMACOS ESPECIALIZADOS
// (vendor 29277, 133,172 MDP over 6,303 contracts). peak_amount is the most-repeated amount, not the max.
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { VendorFile } from './VendorFile'

vi.mock('@/api/client', () => ({
  vendorApi: {
    getShap: () => new Promise(() => {}),
    getInstitutions: () => new Promise(() => {}),
    getGroundTruthStatus: () => new Promise(() => {}),
    getExternalFlags: () => new Promise(() => {}),
    // prod /vendors/29277/contract-aggregate, 2026-11-03
    getContractAggregate: async () => ({
      vendor_id: 29277, total_contracts: 6303, total_value_mxn: 133172211765.23, no_competition: 5121,
      direct_award: 4979, single_bid: 142, year_min: 2007, year_max: 2020, by_year: [{ year: 2015, count: 600, amount: 12e9, avg_risk: 0.5 }],
      repeat_rows: 2595, repeat_distinct: 524, peak_amount: 1100.0, peak_mult: 19,
    }),
  },
}))

const item = {
  vendor_id: 29277, name: 'GRUPO FARMACOS ESPECIALIZADOS, S.A. DE C.V.', size_category: null, risk_score: 0.7,
  risk_level: 'critical' as const, tier: 1, total_contracts: 6303, total_amount_mxn: 133172211765.23,
  primary_sector_code: 'salud', primary_sector_name: 'Salud', is_gt: false,
}

describe('VendorFile peak amount', () => {
  it('labels peak_amount as the most-repeated amount with its multiplicity, never «contrato máximo»', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <VendorFile item={item} lens="patterns" currentCode={null} codeLabels={{}} lang="es" accent="#dc2626" onOpenVendor={() => {}} />
        </MemoryRouter>
      </QueryClientProvider>,
    )
    expect(await screen.findByText(/monto más repetido .*×19/)).toBeTruthy()
    expect(screen.queryByText(/contrato máximo/)).toBeNull()
  })
})
