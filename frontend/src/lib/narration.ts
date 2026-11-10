/**
 * Word-timed narration from a script.md (the explainroo method, RUBLI-adapted: script first, the pictures cut to its
 * words). Format: `## <lang>` blocks, `### <scene>` headings, narration lines; `>` lines are notes; `[#cue]` before a
 * word names the moment that word appears. Pure; tested in narration.test.ts.
 *
 * ponytail: no audio, so no ASR. Each word's time comes from a reading pace (base + per-letter, pauses after , ; .),
 * not from a voice. If a voice is ever rendered, swap `pace` for the ASR word timings; scene cues stay keyed to words.
 */
export interface NWord { w: string; t0: number; t1: number }
export interface NScene { id: string; text: string; words: NWord[]; cues: Record<string, number>; t0: number; t1: number }
export interface Narration { scenes: NScene[]; total: number; words: number }

const PACE = { base: 110, letter: 18, max: 480, comma: 140, stop: 320, lead: 250, hold: 600 }

export function parseScript(md: string, lang: string): { id: string; text: string }[] {
  const out: { id: string; text: string }[] = []
  let inLang = false
  for (const raw of md.split(/\r?\n/)) {
    const line = raw.trim()
    if (line.startsWith('## ')) { inLang = line.slice(3).trim() === lang; continue }
    if (!inLang || !line || line.startsWith('>')) continue
    if (line.startsWith('### ')) { out.push({ id: line.slice(4).trim(), text: '' }); continue }
    const cur = out[out.length - 1]
    if (cur) cur.text = cur.text ? `${cur.text} ${line}` : line
  }
  return out
}

export function narrate(md: string, lang: string): Narration {
  let t = 0
  let count = 0
  const scenes = parseScript(md, lang).map(({ id, text }) => {
    t += PACE.lead
    const t0 = t
    const words: NWord[] = []
    const cues: Record<string, number> = {}
    let pending: string[] = []
    for (const tok of text.split(/\s+/).filter(Boolean)) {
      const cue = /^\[#([\w-]+)\]$/.exec(tok)
      if (cue) { pending.push(cue[1]); continue }
      for (const c of pending) cues[c] = t
      pending = []
      const d = Math.min(PACE.max, PACE.base + PACE.letter * tok.replace(/[^\p{L}\p{N}]/gu, '').length)
      words.push({ w: tok, t0: t, t1: t + d })
      t += d + (/[.!?]$/.test(tok) ? PACE.stop : /[,;:]$/.test(tok) ? PACE.comma : 0)
    }
    for (const c of pending) cues[c] = t // a cue after the last word fires at the scene's end
    count += words.length
    t += PACE.hold
    return { id, text: words.map((w) => w.w).join(' '), words, cues, t0, t1: t }
  })
  return { scenes, total: t, words: count }
}
