/**
 * «El Relevo» / "The Relay" — v3 (RELEVO_v3.md), built in Remotion.
 * Nine beats on one TransitionSeries; each beat carries its own voice clip and captions
 * so trimming a beat moves its sound and subtitles with it (display-captions.md).
 * No music (owner). No beat counter, chapter numerals or progress dots (owner).
 */
import { TransitionSeries, linearTiming } from '@remotion/transitions'
import { wipe } from '@remotion/transitions/wipe'
import { Html5Audio, Sequence, staticFile, useVideoConfig } from 'remotion'
import type { Lang } from './data'
import { LeakOverlay, whip } from './fx'
import { PaperCaptions } from './PaperCaptions'
import { After } from './scenes/After'
import { Buyer } from './scenes/Buyer'
import { Cliff } from './scenes/Cliff'
import { End } from './scenes/End'
import { Four } from './scenes/Four'
import { Order } from './scenes/Order'
import { Peak } from './scenes/Peak'
import { Relay } from './scenes/Relay'
import { Return } from './scenes/Return'
import { OVERLAP, beatFrames, captionsFor, clipMs, leadSec, type BeatId, type RelevoProps } from './timing'

/** The beat's voice clip (after its lead-in) and its word-timed subtitles in the bottom 22%. */
function Voice({ lang, beat }: { lang: Lang; beat: BeatId }) {
  const { fps } = useVideoConfig()
  const lead = Math.round(leadSec(beat) * fps)
  return (
    <>
      {/* Html5Audio, not @remotion/media's <Audio>: the latter pulls mediabunny (~690 KB) into the Gallery player chunk */}
      <Sequence name={`Voice · ${beat}`} from={lead} premountFor={fps}>
        <Html5Audio src={staticFile(`gallery-vo/el-monopolio-invisible-v3/${lang}/${beat}.mp3`)} />
      </Sequence>
      <PaperCaptions
        name={`Captions · ${beat}`}
        premountFor={fps}
        durationInFrames={lead + Math.ceil(((clipMs(lang, beat) + 600) / 1000) * fps)}
        captions={captionsFor(lang, beat)}
        offsetMs={leadSec(beat) * 1000}
        width={1640}
        style={{ position: 'absolute', bottom: 64, translate: '140px 0px' }}
      />
    </>
  )
}

export const Relevo: React.FC<RelevoProps> = ({ lang }) => {
  const { fps } = useVideoConfig()
  return (
    <TransitionSeries>
      <TransitionSeries.Sequence name="Peak" durationInFrames={beatFrames(lang, 'peak')} premountFor={fps}>
        <Peak lang={lang} />
        <Voice lang={lang} beat="peak" />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={whip('right')} timing={linearTiming({ durationInFrames: OVERLAP.peak })} />
      <TransitionSeries.Sequence name="Four" durationInFrames={beatFrames(lang, 'four')} premountFor={fps}>
        <Four lang={lang} />
        <Voice lang={lang} beat="four" />
      </TransitionSeries.Sequence>
      <TransitionSeries.Overlay durationInFrames={30} premountFor={fps}>
        <LeakOverlay seed={3} />
      </TransitionSeries.Overlay>
      <TransitionSeries.Sequence name="Buyer" durationInFrames={beatFrames(lang, 'buyer')} premountFor={fps}>
        <Buyer lang={lang} />
        <Voice lang={lang} beat="buyer" />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={whip('up')} timing={linearTiming({ durationInFrames: OVERLAP.buyer })} />
      <TransitionSeries.Sequence name="Relay" durationInFrames={beatFrames(lang, 'relay')} premountFor={fps}>
        <Relay lang={lang} />
        <Voice lang={lang} beat="relay" />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={wipe({ direction: 'from-right' })} timing={linearTiming({ durationInFrames: OVERLAP.relay })} />
      <TransitionSeries.Sequence name="Order" durationInFrames={beatFrames(lang, 'order')} premountFor={fps}>
        <Order lang={lang} />
        <Voice lang={lang} beat="order" />
      </TransitionSeries.Sequence>
      <TransitionSeries.Overlay durationInFrames={30} premountFor={fps}>
        <LeakOverlay seed={7} />
      </TransitionSeries.Overlay>
      <TransitionSeries.Sequence name="Cliff" durationInFrames={beatFrames(lang, 'cliff')} premountFor={fps}>
        <Cliff lang={lang} />
        <Voice lang={lang} beat="cliff" />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={whip('right')} timing={linearTiming({ durationInFrames: OVERLAP.cliff })} />
      <TransitionSeries.Sequence name="After" durationInFrames={beatFrames(lang, 'after')} premountFor={fps}>
        <After lang={lang} />
        <Voice lang={lang} beat="after" />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={whip('left')} timing={linearTiming({ durationInFrames: OVERLAP.after })} />
      <TransitionSeries.Sequence name="Return" durationInFrames={beatFrames(lang, 'return')} premountFor={fps}>
        <Return lang={lang} />
        <Voice lang={lang} beat="return" />
      </TransitionSeries.Sequence>
      <TransitionSeries.Overlay durationInFrames={30} premountFor={fps}>
        <LeakOverlay seed={11} />
      </TransitionSeries.Overlay>
      <TransitionSeries.Sequence name="End" durationInFrames={beatFrames(lang, 'end')} premountFor={fps}>
        <End lang={lang} />
        <Voice lang={lang} beat="end" />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  )
}

