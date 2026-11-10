import { describe, expect, it } from 'vitest'
import { DATA_LAST_YEAR } from '@/lib/constants'
import { N_YEARS, YEAR0, decodeBodies, hasYear, type SkyManifest } from './geometry'

const man = {
  stars: { id: [251], name: ['IMSS'], siglas: ['IMSS'], sector: [1], x: [5000], y: [5000], r: [100], v: [1e12], h: [0],
    nv: [2], drawn: [2], np: [2], rem: [0], linked: [1] },
} as unknown as SkyManifest

/** planets.bin for 2 bodies: SKY2 block (+ the 4 year-mask columns for SKY3). */
function bin(magic: 'SKY2' | 'SKY3', masks: number[]) {
  const n = 2
  const cols: [number, number[]][] = [
    [4, [10, 20]], [2, [0, 0]], [2, [10000, 20000]], [2, [65535, 7000]],
    [1, [19, 20]], [1, [0, 0]], [1, [1, 1]], [1, [22, 25]], [1, [64, 0]], [1, [1, 0]], [1, [0, 0]],
    ...[0, 1, 2, 3, 4].map((): [number, number[]] => [1, [1, 0]]),
  ]
  if (magic === 'SKY3') for (let b = 0; b < 4; b++) cols.push([1, masks.map((m) => (m >>> (8 * b)) & 0xff)])
  const size = 8 + cols.reduce((a, [w]) => a + w * n, 0)
  const dv = new DataView(new ArrayBuffer(size))
  ;[...magic].forEach((c, i) => dv.setUint8(i, c.charCodeAt(0)))
  dv.setUint32(4, n, true)
  let off = 8
  for (const [w, vals] of cols) for (const v of vals) {
    if (w === 4) dv.setUint32(off, v, true)
    else if (w === 2) dv.setUint16(off, v, true)
    else dv.setUint8(off, v)
    off += w
  }
  return dv.buffer
}

describe('planets.bin decoder (instruments §2.6)', () => {
  it('SKY3 decodes the year mask through the last data year (ComprasMX 2026)', () => {
    expect(YEAR0 + N_YEARS - 1).toBe(DATA_LAST_YEAR)
    const m19 = (1 << 19) | (1 << 25) | (1 << 26) | (1 << 2)
    const b = decodeBodies(bin('SKY3', [m19, 1 << 20]), man)
    expect(b.hasYears).toBe(true)
    expect(b.ym[0]).toBe(m19)
    expect(hasYear(b.ym[0], 2019)).toBe(true)
    expect(hasYear(b.ym[0], 2025)).toBe(true)
    expect(hasYear(b.ym[0], 2026)).toBe(true)
    expect(hasYear(b.ym[0], 2004)).toBe(false)
    expect(hasYear(b.ym[1], 2020)).toBe(true)
    expect(b.vendorId[1]).toBe(20)
    expect(b.period[0][0]).toBe(1)
  })
  it('SKY2 shim: same bodies, empty masks, hasYears false', () => {
    const b = decodeBodies(bin('SKY2', []), man)
    expect(b.hasYears).toBe(false)
    expect(b.n).toBe(2)
    expect(Array.from(b.ym)).toEqual([0, 0])
    expect(b.y1[1]).toBe(25)
  })
})
