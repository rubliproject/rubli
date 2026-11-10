import { describe, expect, it } from 'vitest'
import { liveQuery, mirrorPins, parsePins, parseSkyQuery, parseToken, popLive, posToken, seedPins, skyQuery, type SkyLive } from './url-state'

describe('sky URL codec (spec §3.10)', () => {
  it('round-trips cam, lv, position, trail and period', () => {
    const q = '?cam=943.6,7556.0,750&lv=20261002T134300Z&star=1205&planet=48&moon=77&trail=s1205.p48~s1413~g3~h&period=pena_nieto'
    const st = parseSkyQuery(q)
    expect(st.cam).toEqual({ x: 943.6, y: 7556, k: 750 })
    expect(st.pos).toEqual({ s: 1205, p: 48, m: 77 })
    expect(st.trail).toEqual([{ s: 1205, p: 48 }, { s: 1413 }, { g: 3 }, {}])
    expect(st.period).toBe('pena_nieto')
    expect(parseSkyQuery(skyQuery(st))).toEqual(st)
  })

  it('drops malformed tokens and free text', () => {
    const st = parseSkyQuery('?cam=1,2&star=abc&planet=12&moon=x&trail=s1.p2~<script>~m5~g3.s4~p9.m8&period=epn&vuelo=Hola Mundo')
    expect(st.cam).toBeNull()
    expect(st.pos).toEqual({ p: 12 })
    expect(st.trail).toEqual([{ s: 1, p: 2 }, { p: 9, m: 8 }])
    expect(st.period).toBeNull()
    expect(st.vuelo).toBeNull()
    expect(parseToken('p2.s1')).toBeNull()
    expect(posToken({ s: 5, p: 6, m: 7 })).toBe('s5.p6.m7')
  })

  // ── the four legacy shims ────────────────────────────────────────────
  it('legacy scope=proveedor&vendor=N → planet N', () => {
    const st = parseSkyQuery('?scope=proveedor&vendor=48')
    expect(st.pos).toEqual({ p: 48 })
    expect(st.notice).toBeNull()
    expect(skyQuery(st)).toBe('?planet=48')
  })

  it('legacy patterns (scope=cohorte / lens=patterns) → field + /aria notice', () => {
    for (const q of ['?scope=cohorte&code=P2', '?lens=patterns&pin=P2']) {
      const st = parseSkyQuery(q)
      expect(st.pos).toEqual({})
      expect(st.notice).toBe('patterns')
      expect(st.code).toBe('P2')
    }
  })

  it('legacy lens=sectors&pin=N → sector disc N', () => {
    expect(parseSkyQuery('?lens=sectors&pin=3').pos).toEqual({ g: 3 })
    expect(parseSkyQuery('?lens=sectors&pin=99').pos).toEqual({})
  })

  it('legacy lens=categories&pin= → field + /categories notice; story= → vuelo=', () => {
    const st = parseSkyQuery('?lens=categories&pin=17&story=imss_medicines')
    expect(st.pos).toEqual({})
    expect(st.notice).toBe('categories')
    expect(st.vuelo).toBe('imss_medicines')
    expect(skyQuery(st)).toBe('?vuelo=imss_medicines')
  })

  it('vuelo carries its chapter n; n without vuelo is dropped', () => {
    const st = parseSkyQuery('?vuelo=imss_medicines&n=3&star=251')
    expect(st.n).toBe(3)
    expect(skyQuery(st)).toBe('?star=251&vuelo=imss_medicines&n=3')
    expect(parseSkyQuery('?n=3').n).toBe(0)
    expect(parseSkyQuery('?vuelo=covid_year&n=x9').n).toBe(0)
  })

  // ── instruments §5 (F11) ─────────────────────────────────────────────
  it('round-trips tab, yr, cmp and pins', () => {
    const q = '?star=251&tab=cat.sector.share&yr=2019&cmp=s251-calderon~s251-amlo&pins=s251~s311.p48~s311.p48.m77'
    const st = parseSkyQuery(q)
    expect(st.tab).toBe('cat.sector.share')
    expect(st.yr).toBe(2019)
    expect(st.cmp).toBe('s251-calderon~s251-amlo')
    expect(st.pins).toEqual([{ s: 251 }, { s: 311, p: 48 }, { s: 311, p: 48, m: 77 }])
    expect(parseSkyQuery(skyQuery(st))).toEqual(st)
    for (const t of ['brief', 'dial', 'diff.calderon.amlo', 'cat.system.money', 'cat.kin.share']) expect(parseSkyQuery(`?tab=${t}`).tab).toBe(t)
    for (const t of ['cat.risk.money', 'diff.epn.amlo', 'catXsystemXmoney', 'brief2']) expect(parseSkyQuery(`?tab=${t}`).tab).toBeNull()
    expect(parseSkyQuery('?yr=1999').yr).toBeNull()
    expect(parseSkyQuery('?yr=2026').yr).toBeNull()
    expect(parseSkyQuery('?yr=2000').yr).toBe(2000)
  })

  it('reserved cmp forms parse to null', () => {
    for (const c of ['s251~s311', 'p48~p49', 's251-amlo~s311-amlo', 's251-epn~s251-amlo']) expect(parseSkyQuery(`?cmp=${c}`).cmp).toBeNull()
  })

  it('pins drop h, g*, malformed and the 13th token', () => {
    expect(parsePins('h~g3~s1~x9~p2.s1~p5')).toEqual([{ s: 1 }, { p: 5 }])
    const many = Array.from({ length: 14 }, (_, i) => `s${i + 1}`).join('~')
    expect(parsePins(many)).toHaveLength(12)
    expect(skyQuery({ cam: null, lv: null, pos: {}, trail: [], period: null, vuelo: null, pins: parsePins(many) })).toContain('s12')
  })

  const live: SkyLive = { trail: [{ s: 1413 }], period: 'amlo', tab: 'cat.system.share', yr: 2019, cmp: 's251-calderon~s251-amlo', pins: [{ s: 251 }, { s: 311, p: 48 }] }

  it('a pan preserves tab / yr / cmp / pins (the `end` replace goes through liveQuery)', () => {
    const before = liveQuery(live, { cam: { x: 1, y: 2, k: 3 }, lv: '20261002T134300Z', pos: { s: 251 }, search: '?vuelo=covid_year&n=2' })
    const after = parseSkyQuery(liveQuery(live, { cam: { x: 900, y: 40, k: 7 }, lv: '20261002T134300Z', pos: { s: 251 }, search: before }))
    expect(after.cam).toEqual({ x: 900, y: 40, k: 7 })
    expect(after.tab).toBe('cat.system.share')
    expect(after.yr).toBe(2019)
    expect(after.cmp).toBe('s251-calderon~s251-amlo')
    expect(after.pins).toEqual(live.pins)
    expect(after.trail).toEqual(live.trail)
    expect(after.vuelo).toBe('covid_year')
    expect(after.n).toBe(2)
  })

  it('popstate keeps pins; tab / yr / cmp / trail come from the entry', () => {
    const older = parseSkyQuery('?star=251&tab=brief&pins=s9')
    const next = popLive(live, older)
    expect(next.pins).toEqual(live.pins)
    expect(next.tab).toBe('brief')
    expect(next.yr).toBeNull()
    expect(next.trail).toEqual([])
  })

  it('a reload seeds pins from the session mirror; a fresh tab from the link', () => {
    window.sessionStorage.clear()
    expect(seedPins([{ s: 7 }])).toEqual([{ s: 7 }])
    mirrorPins([{ s: 251 }, { s: 311, p: 48 }])
    expect(seedPins([{ s: 7 }])).toEqual([{ s: 251 }, { s: 311, p: 48 }])
    window.sessionStorage.clear()
  })
})

describe('legacy year param', () => {
  it('reads ?year= as yr', () => {
    expect(parseSkyQuery('?lens=sectors&year=2020').yr).toBe(2020)
    expect(parseSkyQuery('?yr=2019&year=2020').yr).toBe(2019)
  })
})
