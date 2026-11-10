import { describe, it, expect } from 'vitest'
import { STORIES } from './story-content'
import { STORY_HEADLINES } from './story-index'

describe('story-index', () => {
  it('mirrors the published STORIES headlines exactly', () => {
    const fromStories = STORIES.map((s) => {
      const o: Record<string, string> = { slug: s.slug, headline: s.headline }
      if (s.headline_es !== undefined) o.headline_es = s.headline_es
      o.subheadline = s.subheadline
      if (s.subheadline_es !== undefined) o.subheadline_es = s.subheadline_es
      return o
    })
    expect(STORY_HEADLINES).toEqual(fromStories)
  })
})
