/**
 * Beat lengths and word cues, from the edge-tts WordBoundary data in vo.json
 * (scripts/gen_relevo_vo.py). A beat lasts lead + its clip + tail; numbers land on
 * the frame their spoken word starts (TEMPLATE § 5.2).
 */
import type { Caption } from '@remotion/captions'
import type { CalculateMetadataFunction } from 'remotion'
import vo from './vo.json'
import type { Lang } from './data'

export const FPS = 30
export const BEATS = ['peak', 'four', 'buyer', 'relay', 'order', 'cliff', 'after', 'return', 'end'] as const
export type BeatId = (typeof BEATS)[number]

type BeatVo = { ms: number; words: [string, number, number][]; captions: Caption[] }
const VO = vo as unknown as Record<Lang, Record<BeatId, BeatVo>>

/** Silence before the voice (relay: the race runs 2003→2010 before "From 2011"; buyer: the seal
 * unrolls into the waffle first) and after it. */
const LEAD: Partial<Record<BeatId, number>> = { relay: 2.8, buyer: 1.6, peak: 0.5 }
const TAIL: Partial<Record<BeatId, number>> = { relay: 1.6, cliff: 1.4, after: 1.0, return: 1.0, end: 5.0 }
export const leadSec = (b: BeatId) => LEAD[b] ?? 0.4
/** Overlap (frames) of the transition that follows each beat: whip-pans 10, the paper wipe 15;
 * light-leak overlays sit on the cut without overlapping (0). */
export const OVERLAP: Record<BeatId, number> = { peak: 10, four: 0, buyer: 10, relay: 15, order: 0, cliff: 10, after: 10, return: 0, end: 0 }

export const beatFrames = (lang: Lang, b: BeatId) =>
  Math.ceil((leadSec(b) + VO[lang][b].ms / 1000 + (TAIL[b] ?? 0.7)) * FPS)
export const clipMs = (lang: Lang, b: BeatId) => VO[lang][b].ms
export const captionsFor = (lang: Lang, b: BeatId) => VO[lang][b].captions

export const totalFrames = (lang: Lang) => BEATS.reduce((a, b) => a + beatFrames(lang, b) - OVERLAP[b], 0)

/**
 * Frame (beat-local) where the n-th spoken token starting with (or containing a word starting with) `match` begins.
 * Throws on a miss, so a re-voiced line that drops a cue word fails the render loudly.
 */
export function cue(lang: Lang, b: BeatId, match: string | Record<Lang, string>, nth = 0): number {
  const m = (typeof match === 'string' ? match : match[lang]).toLowerCase()
  // a TTS token can hold several words ("From 2011"): match its start or any word inside it
  const hits = VO[lang][b].words.filter(([w]) => {
    const t = w.toLowerCase()
    return t.startsWith(m) || t.split(/\s+/).some((x) => x.startsWith(m))
  })
  if (!hits[nth]) throw new Error(`cue miss: ${lang}/${b} "${m}" #${nth}`)
  return Math.round((leadSec(b) + hits[nth][1] / 1000) * FPS)
}

export type RelevoProps = { lang: Lang }

/** calculate-metadata.md: the film's length follows its voice clips. */
export const calculateRelevoMetadata: CalculateMetadataFunction<RelevoProps> = ({ props }) => ({
  durationInFrames: totalFrames(props.lang),
  defaultOutName: `el-relevo-${props.lang}`,
})

export const sceneMetadata =
  (b: BeatId): CalculateMetadataFunction<RelevoProps> =>
  ({ props }) => ({ durationInFrames: beatFrames(props.lang, b) })
