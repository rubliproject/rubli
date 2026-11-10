import { describe, it, expect } from 'vitest'
import type { AxiosAdapter } from 'axios'
import { api } from './client'

// CLICKPATH_AUDIT_2026-10-30 #1: the name normaliser turned blob downloads into `{}`.
const reply = (data: unknown): AxiosAdapter => async (config) => ({
  data, status: 200, statusText: 'OK', headers: {}, config,
})

describe('api response interceptor', () => {
  it('passes Blob downloads through untouched', async () => {
    const blob = new Blob(['id,vendor_name\n1,ACME\n'], { type: 'text/csv' })
    const { data } = await api.get('/export/contracts/csv', { responseType: 'blob', adapter: reply(blob) })
    expect(data).toBe(blob)
  })

  it('passes ArrayBuffer through untouched', async () => {
    const buf = new ArrayBuffer(8)
    const { data } = await api.get('/x', { responseType: 'arraybuffer', adapter: reply(buf) })
    expect(data).toBe(buf)
  })

  it('still title-cases vendor names in JSON', async () => {
    const { data } = await api.get('/x', { adapter: reply({ data: [{ vendor_name: 'GRUPO ACME' }] }) })
    expect(data.data[0].vendor_name).not.toBe('GRUPO ACME')
  })
})
