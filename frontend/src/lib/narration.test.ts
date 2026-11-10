import { describe, expect, it } from 'vitest'
import { narrate } from './narration'
import script from '@/components/portada/RiskHowToB.script.md?raw'

const CUES = { registro: ['amt', 'buyer', 'vendor'], comparacion: ['rows', 'band', 'mark', 'far'], nivel: ['needle', 'caveat'] }

describe('RiskHowToB script', () => {
  for (const lang of ['es', 'en']) {
    const n = narrate(script, lang)
    it(`${lang}: ≤ 45 words, 10–15 s, three scenes with every cue the pictures use`, () => {
      expect(n.words).toBeLessThanOrEqual(45)
      expect(n.total).toBeGreaterThanOrEqual(10_000)
      expect(n.total).toBeLessThanOrEqual(15_000)
      expect(n.scenes.map((s) => s.id)).toEqual(Object.keys(CUES))
      for (const s of n.scenes) for (const c of CUES[s.id as keyof typeof CUES]) {
        expect(s.cues[c], `${s.id}#${c}`).toBeGreaterThanOrEqual(s.t0)
        expect(s.cues[c]).toBeLessThan(s.t1)
      }
    })
    it(`${lang}: never «precio» / price, never probability`, () => {
      const text = n.scenes.map((s) => s.text).join(' ').toLowerCase()
      expect(text).not.toMatch(/precio|price|probab/)
    })
  }
  it('a cue fires with the word after it; words never overlap', () => {
    const n = narrate('## es\n### a\nUno [#x] dos, tres.\n> nota\n', 'es')
    const [s] = n.scenes
    expect(s.words.map((w) => w.w)).toEqual(['Uno', 'dos,', 'tres.'])
    expect(s.cues.x).toBe(s.words[1].t0)
    for (let i = 1; i < s.words.length; i++) expect(s.words[i].t0).toBeGreaterThanOrEqual(s.words[i - 1].t1)
  })
})
