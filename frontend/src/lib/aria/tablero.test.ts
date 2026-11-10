import { describe, expect, it } from 'vitest'
import { boardClaim, boardPins, capPins, LABEL_U, layoutBoard, threadRadius, type BoardInput } from './tablero'

const input: BoardInput = {
  lanes: [
    { id: 228, name: 'ISSSTE LARGO', siglas: 'ISSSTE', share: 0.23 },
    { id: 251, name: 'INSTITUTO MEXICANO DEL SEGURO SOCIAL', siglas: 'IMSS', share: 0.5 },
  ],
  gtCase: { name: 'BIRMEX Medicine Overpricing Ring 2025', type: 'overpricing', typeLabel: 'sobreprecio', from: 2020, to: 2025, slug: null },
  patterns: { P1: 0.65, P2: 0, P7: 0.5, P3: 0.29 },
  patternName: (p) => p,
  drivers: [
    { feature: 'rt4_log', contribution: 2.537, label: 'Instituciones atendidas antes' },
    { feature: 'sector_spread', contribution: -0.266, label: 'Dispersión sectorial' },
    { feature: 'tiny', contribution: 0.001, label: 'tiny' },
  ],
  contracts: [{ id: 9, title: 'MEDICAMENTOS', amount: 2_077_000_000, date: '2024-01-02' }],
  vendorTotal: 86_947_504_224,
  fmtMoney: (n) => `${Math.round(n / 1e6)} MDP`,
  fmtDate: (s) => s,
  instName: (s) => s ?? '',
}

describe('boardPins', () => {
  const pins = boardPins(input, 'es')
  it('buyers by share, patterns ≥ .30 only, model |β·z| share, tiny drivers dropped', () => {
    expect(pins.filter((p) => p.group === 'buyers').map((p) => p.label)).toEqual(['IMSS', 'ISSSTE'])
    expect(pins.filter((p) => p.group === 'pattern').map((p) => p.key)).toEqual(['pP1', 'pP7'])
    const m = pins.filter((p) => p.group === 'model')
    expect(m.map((p) => p.key)).toEqual(['mrt4_log', 'msector_spread'])
    expect(m[0].w).toBeCloseTo(2.537 / (2.537 + 0.266 + 0.001), 6)
    expect(m[1].neg).toBe(true)
  })
  it('one scale: the case is fixed and red; contract weight = amount / total', () => {
    const c = pins.find((p) => p.group === 'case')!
    expect(c.w).toBeNull(); expect(c.red).toBe(true)
    expect(pins.find((p) => p.group === 'contracts')!.w).toBeCloseTo(2_077_000_000 / 86_947_504_224, 8)
    expect(threadRadius(0)).toBeCloseTo(0.06); expect(threadRadius(1)).toBeCloseTo(0.28); expect(threadRadius(2)).toBeCloseTo(0.28)
  })
  it('phone caps send the rest to the list', () => {
    const { shown, rest } = capPins(pins, true)
    expect(shown.filter((p) => p.group === 'pattern')).toHaveLength(1)
    expect(rest.map((p) => p.key)).toContain('pP7')
  })
})

describe('boardClaim (one group, one quantity)', () => {
  it('names the largest buyer share, never a cross-group «thickest»', () => {
    expect(boardClaim(boardPins(input, 'es'), 'es')).toBe('El hilo más grueso de los compradores va a IMSS: 50% del ingreso del proveedor; el caso documentado está atado en rojo.')
  })
  it('falls back to the model, then the contracts; no case → no red tail', () => {
    const p = boardPins({ ...input, gtCase: null, lanes: [], patterns: {} }, 'en')
    expect(boardClaim(p, 'en')).toBe('Of what the model reads, the thickest thread is “Instituciones atendidas antes”: 90% of the total.')
    const q = boardPins({ ...input, gtCase: null, lanes: [], drivers: [], patterns: {} }, 'es')
    expect(boardClaim(q, 'es')).toBe('Su contrato mayor en el tablero pesa 2% de todo su dinero.')
  })
  it('null when nothing has a share', () => {
    expect(boardClaim([], 'es')).toBeNull()
  })
})

describe('layoutBoard', () => {
  const inside = (L: ReturnType<typeof layoutBoard>) => {
    for (const p of L.placed) {
      expect(Math.abs(p.z)).toBeLessThan(L.h / 2)
      if (p.side === 'r') expect(p.x + LABEL_U).toBeLessThanOrEqual(L.w / 2)
      else expect(p.x - LABEL_U).toBeGreaterThanOrEqual(-L.w / 2)
      // the label sits away from the supplier's pin
      if (p.pin.group !== 'case') expect(p.side === 'l' ? p.x < L.centre.x : p.x >= L.centre.x || L.w < 30).toBe(true)
    }
  }
  it('desk: every label has room on its side; no column right under the supplier; the case hangs below every other pin', () => {
    const d = layoutBoard(capPins(boardPins(input, 'es'), false).shown, false)
    inside(d)
    const cs = d.placed.find((p) => p.pin.group === 'case')!
    expect(cs.x).toBe(d.centre.x)
    for (const p of d.placed.filter((q) => q.pin.group !== 'case')) {
      expect(Math.abs(p.x - d.centre.x)).toBeGreaterThanOrEqual(5)
      expect(cs.z - p.z).toBeGreaterThanOrEqual(7) // its label band is below every other thread's end and label
    }
  })
  it('phone: one pin per row, labels right, inside the board', () => {
    const ph = layoutBoard(capPins(boardPins(input, 'es'), true).shown, true)
    inside(ph)
    const zs = ph.placed.map((p) => p.z)
    expect(new Set(zs).size).toBe(zs.length)
  })
})
