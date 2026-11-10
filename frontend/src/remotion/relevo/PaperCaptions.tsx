/**
 * Remotion's Basic Captions element (remotion.dev/elements/captions/basic-captions),
 * restyled to the film's paper scrim (TEMPLATE § 1.3) with word highlighting: the word
 * being spoken is ink, words already said stay ink, words still to come are dim.
 * One page per sentence (pageBreakAfter from gen_relevo_vo.py), in the bottom 22%.
 */
import type { Caption } from '@remotion/captions'
import { createTikTokStyleCaptions } from '@remotion/captions'
import React, { useMemo } from 'react'
import { Interactive, useCurrentFrame, useVideoConfig, type InteractiveTransformProps, type InteractivitySchema, type SequenceProps } from 'remotion'
import { C } from './data'
import { SERIF_F } from './kit'

type PaperCaptionsProps = InteractiveTransformProps &
  Pick<SequenceProps, 'width'> & {
    readonly captions: Caption[]
    readonly combineTokensWithinMilliseconds?: number
    /** ms the voice starts after the sequence starts (the beat's lead-in) */
    readonly offsetMs?: number
  }

const paperCaptionsSchema = {
  ...Interactive.captionsSchema,
  width: { type: 'number', min: 1, step: 1, default: undefined, description: 'Caption area width', hiddenFromList: false },
  combineTokensWithinMilliseconds: { type: 'number', min: 0, step: 50, default: 6500, description: 'Time between caption pages', hiddenFromList: false },
} as const satisfies InteractivitySchema

const PaperCaptionsContent: React.FC<PaperCaptionsProps> = ({ captions, combineTokensWithinMilliseconds = 6500, offsetMs = 0, style, width = 1500 }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const pages = useMemo(() => createTikTokStyleCaptions({ captions, combineTokensWithinMilliseconds }).pages, [captions, combineTokensWithinMilliseconds])
  const now = (frame / fps) * 1000 - offsetMs
  // a page holds until the next one starts, so the sentence never blinks off mid-beat
  const idx = pages.findIndex((p, i) => now >= p.startMs && (i === pages.length - 1 || now < pages[i + 1].startMs))
  const page = idx >= 0 ? pages[idx] : undefined
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-end', width, ...style }}>
      {page ? (
        <div
          style={{
            backgroundColor: C.scrim,
            borderRadius: 8,
            padding: '14px 28px',
            fontFamily: SERIF_F,
            fontSize: 50,
            fontWeight: 500,
            lineHeight: 1.25,
            textAlign: 'center',
            textWrap: 'balance',
            whiteSpace: 'pre-wrap',
            boxShadow: `0 6px 18px ${C.shade}`,
          }}
        >
          {page.tokens.map((t, i) => (
            <span key={i} style={{ color: now >= t.fromMs ? C.ink : C.dim, fontVariantNumeric: 'tabular-nums' }}>
              {i === 0 ? t.text.trimStart() : t.text}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export const PaperCaptions = Interactive.withSchema({
  Component: PaperCaptionsContent,
  componentName: '<PaperCaptions>',
  schema: paperCaptionsSchema,
  wrapInSequence: true,
})
