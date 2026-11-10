import { describe, expect, it } from 'vitest'
import { supplierTipName, withheldLabel } from './catalog'
import type { SkySystem } from './geometry'

// owner 11-07 P0: a dot of a non-located star read «unnamed supplier» — the name must come from its host's system
const sys = {
  bodies: [{ vendor_id: 7, name: 'CONSEER, S. A. DE C. V.' }, { vendor_id: 8, name: '' }],
  ghosts: [{ vendor_id: 9, name: 'DRAGAMEX, S.A. DE C.V.' }],
} as unknown as SkySystem

describe('supplierTipName', () => {
  it('names a body and a ghost from the system', () => {
    expect(supplierTipName(sys, 7, 'es')).toMatch(/CONSEER/i)
    expect(supplierTipName(sys, 9, 'en')).toMatch(/DRAGAMEX/i)
  })
  it('a withheld body prints its public label, never «unnamed»', () => {
    expect(supplierTipName(sys, 8, 'es')).toBe(withheldLabel(8, 'es'))
  })
  it('no system yet reads «loading», not «unnamed»', () => {
    expect(supplierTipName(null, 7, 'en')).toMatch(/loading/)
    expect(supplierTipName(undefined, 7, 'es')).toMatch(/cargando/)
  })
})
