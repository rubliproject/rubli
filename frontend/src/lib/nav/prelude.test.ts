import { describe, expect, it } from 'vitest'
import { PRELUDE, preludeFor } from './prelude'

describe('preludeFor', () => {
  it('folds ids, drops a trailing slash, and misses unknown pages', () => {
    expect(preludeFor('/vendors/312747')).toBe(PRELUDE['/vendors/:id'])
    expect(preludeFor('/categories/')).toBe(PRELUDE['/categories'])
    expect(preludeFor('/nope')).toBeUndefined()
  })
  it('every line is short (Mariana: ≤ 15 words) in both languages', () => {
    for (const p of Object.values(PRELUDE)) for (const l of [...p.es, ...p.en]) expect(l.split(/\s+/).length).toBeLessThanOrEqual(15)
  })
})
