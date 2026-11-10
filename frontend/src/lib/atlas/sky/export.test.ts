import { describe, expect, it } from 'vitest'
import { csvText, pinsPart, starPart, systemPart } from './export'
import type { SkyManifest, SkySystem, SkySystemBody } from './geometry'

const RFC = /\b[A-ZÑ&]{3,4}\d{6}[A-Z\d]{3}\b/
const meta = { layout_version: '20261002T134300Z', data_cut: '2025-09-28', risk_basis: 'v0.8.5', view_url: 'https://rubli.xyz/atlas?star=251' }
const body = (vendor_id: number, name: string, share: number, value_mxn: number) =>
  ({ vendor_id, name, share, value_mxn, first_year: 2010, last_year: 2020, n_contracts_here: 3, risk_here: 0.3 }) as SkySystemBody
const sys = {
  layout_version: meta.layout_version,
  star: { id: 251, name: 'INSTITUTO MEXICANO DEL SEGURO SOCIAL', siglas: 'IMSS', sector_id: 1, value_mxn: 1e12, n_vendors: 9, h: 0.1, n_drawn: 3, drawn_share: 0.5 },
  // the second body is withheld (not in ranked) even though a name reached the client; the third arrives nameless
  bodies: [body(1, 'ACME, S.A. DE C.V.', 0.3, 3e11), body(2, 'JUAN PEREZ LOPEZ PELJ800101AB1', 0.1, 1e11), body(3, '', 0.05, 5e10)],
  ranked: [1, 3], capture: [], ghosts: [], n_ghosts: 0, cobid: [], remainder: [[2015, 1e9, 4], [2016, 2e9, 2]], focus: null,
} as unknown as SkySystem

describe('CSV export (spec §3.8, F16, F24)', () => {
  it('system scope: public basis only, withheld dropped and counted, no RFC', () => {
    const csv = csvText(meta, systemPart(sys))
    const lines = csv.split('\n')
    expect(lines[0].toLowerCase()).not.toContain('rfc')
    expect(lines[0].startsWith('layout_version,data_cut,risk_basis,view_url,')).toBe(true)
    expect(csv).not.toMatch(RFC)
    expect(csv).not.toContain('JUAN PEREZ')
    expect(lines).toHaveLength(3) // header + 1 public row + counts
    expect(lines[1]).toContain('"ACME, S.A. DE C.V."')
    expect(lines[2]).toBe('n_requested,3,n_public,1,n_withheld,2,n_not_drawn,6')
  })

  it('star rows use manifest columns only', () => {
    const m = { sectors: [{ id: 1, code: 'salud' }], stars: { id: [251], name: ['IMSS'], siglas: ['IMSS'], sector: [1], v: [1e12], h: [0.1], nv: [9], drawn: [3] } } as unknown as SkyManifest
    const csv = csvText(meta, starPart(m, [0]))
    expect(csv.split('\n')[0]).toBe('layout_version,data_cut,risk_basis,view_url,institution_id,name,siglas,sector,value_mxn,halo_h,n_vendors,n_drawn')
    expect(csv.split('\n')[1]).toContain(',251,IMSS,IMSS,salud,')
  })

  it('pins: a withheld pin is dropped and counted, never named', () => {
    const csv = csvText(meta, pinsPart([
      { institution_id: 251, institution_name: 'IMSS', vendor_id: 1, vendor_name: 'ACME', contract_id: null },
      { institution_id: 251, institution_name: 'IMSS', vendor_id: 2, vendor_name: null, contract_id: null },
    ]))
    expect(csv).not.toMatch(/rfc/i)
    expect(csv.split('\n').at(-1)).toBe('n_requested,2,n_public,1,n_withheld,1,n_not_drawn,0')
  })
})
