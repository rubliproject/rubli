import { describe, expect, it } from 'vitest'
import { ago, boardWindow, digest, dwellMs, newestFirst, weekOf, wireItems, type FeedEvent } from './wire'

const ev = (o: Partial<FeedEvent>): FeedEvent => ({
  type: 'critical', date: '2026-10-27', title_es: 't', title_en: 't', amount: 12_000_000,
  institution_id: 370, institution: 'SEP', vendor_id: 31832, contract_id: 1, risk_level: 'critical', sector_id: 2, detail: null, ...o,
})
const money = (n: number) => `${Math.round(n / 1e6)} MDP`

describe('weekOf', () => {
  it('keeps the 7 days ending at the newest event', () => {
    const out = weekOf([ev({ date: '2026-10-28' }), ev({ date: '2026-10-22' }), ev({ date: '2026-10-21' })])
    expect(out.map((e) => e.date)).toEqual(['2026-10-28', '2026-10-22'])
  })
  it('is empty for an empty feed', () => { expect(weekOf([])).toEqual([]) })
})

describe('wireItems', () => {
  it('never puts the vendor name in the words', () => {
    const items = wireItems([ev({ type: 'first_supplier', title_es: 'Proveedor nuevo: JUAN PÉREZ recibe…', risk_level: 'medium' })], 'es', money)
    expect(items[0].text).not.toMatch(/JUAN/)
    expect(items[0].href).toBe('/contracts/1')
  })
  it('prints «≥ 0.60» for a critical reading, never a probability', () => {
    const [it0] = wireItems([ev({})], 'es', money)
    expect(it0.text).toContain('≥ 0.60')
    expect(it0.text).toContain('indicador de riesgo')
    expect(it0.critical).toBe(true)
  })
  it('a direct-award spike links its institution and reads both shares', () => {
    const [it0] = wireItems([ev({ type: 'direct_spike', contract_id: null, risk_level: null, detail: { recent_share: 0.683, trailing_share: 0.428 } })], 'es', money)
    expect(it0.href).toBe('/institutions/370')
    expect(it0.text).toContain('68%')
    expect(it0.text).toContain('43%')
    expect(it0.critical).toBe(false)
  })
  it('drops a vendor event with no amount (nothing true to say)', () => {
    expect(wireItems([ev({ amount: null })], 'en', money)).toEqual([])
  })
  it('caps the line', () => {
    expect(wireItems(Array.from({ length: 40 }, (_, i) => ev({ contract_id: i })), 'en', money, 24)).toHaveLength(24)
  })
})

describe('digest', () => {
  const feed = (events: FeedEvent[], total?: number) => ({ meta: { cut: '2026-10-28' }, total, events })
  it('groups the week, biggest award first, and does not repeat an award under crítico', () => {
    const d = digest(feed([
      ev({ type: 'award', contract_id: 1, amount: 2e8 }), ev({ type: 'award', contract_id: 2, amount: 9e8 }),
      ev({ type: 'critical', contract_id: 2, amount: 9e8 }), ev({ type: 'critical', contract_id: 3, amount: 3e7 }),
      ev({ type: 'critical', contract_id: 4, date: '2026-10-01' }),
    ]))!
    expect(d.groups.map((g) => g.type)).toEqual(['award', 'critical'])
    expect(d.groups[0].items.map((e) => e.contract_id)).toEqual([2, 1])
    expect(d.groups[1].items.map((e) => e.contract_id)).toEqual([3])
    expect(d.groups[1].n).toBe(2) // the week's count, before the de-duplication
    expect(d.complete).toBe(true)
  })
  it('a page cut inside the week is not complete (counts withheld)', () => {
    expect(digest(feed([ev({ date: '2026-10-28' }), ev({ date: '2026-10-25' })], 400))!.complete).toBe(false)
  })
  it('the largest direct-award lift leads', () => {
    const d = digest(feed([
      ev({ type: 'direct_spike', institution_id: 1, detail: { recent_share: 0.7, trailing_share: 0.43 } }),
      ev({ type: 'direct_spike', institution_id: 2, detail: { recent_share: 0.93, trailing_share: 0.06 } }),
    ]))!
    expect(d.groups[0].items.map((e) => e.institution_id)).toEqual([2, 1])
  })
  it('nothing in the feed → null', () => { expect(digest(feed([]))).toBeNull() })
})

describe('the stepped feed (última hora)', () => {
  it('orders newest first; within a day crítico before an award, then the larger amount', () => {
    const out = newestFirst([
      ev({ type: 'award', date: '2026-10-30', amount: 9e8, contract_id: 1 }),
      ev({ type: 'critical', date: '2026-11-01', amount: 1e7, contract_id: 2 }),
      ev({ type: 'award', date: '2026-11-01', amount: 2e8, contract_id: 3 }),
      ev({ type: 'award', date: '2026-11-01', amount: 5e8, contract_id: 4 }),
    ])
    expect(out.map((e) => e.contract_id)).toEqual([2, 4, 3, 1])
  })
  it('dates in whole days, never «now»', () => {
    const now = Date.parse('2026-11-02T09:00:00')
    expect(ago('2026-11-02', 'es', now)).toBe('hoy')
    expect(ago('2026-11-01', 'es', now)).toBe('ayer')
    expect(ago('2026-10-28', 'es', now)).toBe('hace 5 días')
    expect(ago('2026-10-28', 'en', now)).toBe('5 days ago')
  })
  it('holds a line long enough to read it: 4 s floor, 8 s ceiling, longer text longer', () => {
    expect(dwellMs(10)).toBe(4000)
    expect(dwellMs(70)).toBeGreaterThan(dwellMs(50))
    expect(dwellMs(400)).toBe(8000)
  })
  it('an award without a tender says so', () => {
    const [it0] = wireItems([ev({ type: 'award', amount: 2e8, detail: { direct_award: 1 } })], 'es', money)
    expect(it0.text).toBe('adjudicó un contrato de 200 MDP sin concurso')
  })
})

describe('wire dedupe', () => {
  it('shows a contract once, as its higher-ranked event', () => {
    const items = wireItems([ev({ type: 'award', amount: 2e8, contract_id: 7 }), ev({ type: 'critical', amount: 2e8, contract_id: 7 })], 'es', money)
    expect(items).toHaveLength(1)
    expect(items[0].type).toBe('critical')
  })
})

describe('boardWindow (the Portada board: tab count = rows above the week rule)', () => {
  // 9 rows of the week (w0…w8), then older ones (o0…): the 2026-11-03 «Contratos grandes» case
  const rows = [...Array.from({ length: 9 }, (_, i) => `w${i}`), ...Array.from({ length: 15 }, (_, i) => `o${i}`)]
  const above = (shown: string[]) => shown.filter((r) => r.startsWith('w')).length
  it('keeps every week row on the board at every step', () => {
    for (let off = 0; off <= rows.length - 12; off++) {
      const shown = boardWindow(rows, 9, 12, off)
      expect(shown).toHaveLength(12)
      expect(above(shown)).toBe(9)
      expect(shown.slice(0, 9)).toEqual(rows.slice(0, 9))
    }
  })
  it('rolls the older rows under the rule, one per step', () => {
    expect(boardWindow(rows, 9, 12, 0).slice(9)).toEqual(['o0', 'o1', 'o2'])
    expect(boardWindow(rows, 9, 12, 1).slice(9)).toEqual(['o1', 'o2', 'o3'])
    expect(boardWindow(rows, 9, 12, 99).slice(9)).toEqual(['o12', 'o13', 'o14'])
  })
  it('rolls as one window when the week fills the board (phone: 8 rows)', () => {
    expect(boardWindow(rows, 9, 8, 1)).toEqual(rows.slice(1, 9))
  })
  it('matches weekOf on a real-shaped feed', () => {
    const feed = [...['2026-11-01', '2026-10-30', '2026-10-28'].map((d) => ev({ type: 'award', date: d })), ev({ type: 'award', date: '2026-10-24' }), ev({ type: 'award', date: '2026-10-20' })]
    const n = weekOf(feed).length
    expect(n).toBe(3)
    expect(boardWindow(feed, n, 4, 1).slice(0, n)).toEqual(feed.slice(0, 3))
  })
  it('is empty-safe', () => { expect(boardWindow([], 0, 12, 3)).toEqual([]) })
})
