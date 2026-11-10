/**
 * House fix F1 (_explore/investigation_desk_2026-10-28/EDITOR_RANKING.md § 2): the site printed
 * «v0.8.5 · AUC 0.785» and «0.852» next to the live v0.9.2. The live model's facts live ONCE in
 * lib/constants.ts (CURRENT_MODEL_VERSION, MODEL_AUC, MODEL_AUC_CI, MODEL_AUC_SIZE); this test keeps
 * them equal to the model card and keeps retired figures out of current claims.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CURRENT_MODEL_VERSION, MODEL_AUC, MODEL_AUC_CI, MODEL_AUC_SIZE } from '@/lib/constants'

const SRC = resolve(__dirname, '..')
const ROOT = resolve(SRC, '..', '..')

// Not rendered at launch: unrouted pages, unimported charts, stories behind STORIES_LIVE=false.
const NOT_LIVE = new Set([
  'lib/story-content.ts',
  'pages/ModelTransparency.tsx',
  'components/executive/ChapterTiles.tsx',
])

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) return files(p)
    return /\.(tsx?|json)$/.test(n) && !/\.test\.tsx?$/.test(n) ? [p] : []
  })
}

describe('model facts (F1)', () => {
  it('constants match the model card (README + docs/SCORING.md)', () => {
    const readme = readFileSync(join(ROOT, 'README.md'), 'utf8')
    const scoring = readFileSync(join(ROOT, 'docs', 'SCORING.md'), 'utf8')
    expect(scoring).toContain(`Active model: ${CURRENT_MODEL_VERSION}`)
    expect(readme).toContain(`**${CURRENT_MODEL_VERSION}**`)
    expect(readme).toContain(`**${MODEL_AUC}** (95% CI ${MODEL_AUC_CI}`)
    expect(readme).toContain(`**${MODEL_AUC_SIZE}**`)
  })

  it('no live surface prints a retired AUC as current', () => {
    const bad: string[] = []
    for (const f of files(SRC)) {
      const rel = relative(SRC, f).replace(/\\/g, '/')
      if (NOT_LIVE.has(rel)) continue
      readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
        // v0.8.5's 0.785 is gone everywhere; v0.9.1's 0.852 only inside a sentence that names v0.9.1.
        if (/\b0\.785(?!\d)/.test(line) || (/\b0\.852(?!\d)/.test(line) && !/v0\.9\.1|v91Desc/.test(line))) bad.push(`${rel}:${i + 1}`)
      })
    }
    expect(bad).toEqual([])
  })
})
