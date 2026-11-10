/** Beat 4 · relay · S6 TRACK — a running bar race 2003→2019; the 1.º chip settles on Grupo Fármacos at 2011. */
import { measureText } from '@remotion/layout-utils'
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from 'remotion'
import { C, CO_COLOR, GF_PEAK, NAMES, ORDER, SERIES, SERIES_Y0, T } from '../data'
import { MONO_F, Mono, Paper, SERIF_F, ease, useFonts } from '../kit'
import { punch } from '../fx'
import { scene, type SceneProps } from '../scene'
import { cue } from '../timing'

const LABEL_W = 680
const BX = 830
const BW = 880
const ROW = 132
const TOP = 250

const RelayInner: React.FC<SceneProps> = ({ lang }) => {
  const f = useCurrentFrame()
  const { durationInFrames } = useVideoConfig()
  const ready = useFonts()
  if (!ready) return <Paper />
  const y2011 = cue(lang, 'relay', '2011')
  const year = interpolate(f, [6, y2011, durationInFrames - 30], [2003, 2011, 2019], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.inOut(Easing.quad),
  })
  const i0 = Math.min(Math.floor(year) - SERIES_Y0, 16)
  const i1 = Math.min(i0 + 1, 16)
  const fr = year - Math.floor(year)
  const val = (co: (typeof ORDER)[number]) => SERIES[co][i0] + (SERIES[co][i1] - SERIES[co][i0]) * fr
  const rankAt = (i: number) => [...ORDER].sort((a, b) => SERIES[b][i] - SERIES[a][i])
  const r0 = rankAt(i0)
  const r1 = rankAt(i1)
  // swaps happen fast in the middle of the year, so crossing labels share a row for ~4 frames only
  const sm = Easing.bezier(0.85, 0, 0.15, 1)(fr)
  const leader = [...ORDER].sort((a, b) => val(b) - val(a))[0]
  // one label size for all four, so the longest short name fits whole (RELEVO § 4 T1)
  const longest = Math.max(...ORDER.map((co) => measureText({ text: NAMES[co].short, fontFamily: SERIF_F, fontSize: 100, fontWeight: '700' }).width))
  const labelSize = Math.min(56, Math.floor((LABEL_W / longest) * 100))
  return (
    <Paper>
      {/* the year, huge and outlined, behind the race */}
      <div
        style={{
          position: 'absolute',
          right: -40,
          top: 330,
          fontFamily: SERIF_F,
          fontWeight: 900,
          fontSize: 560,
          lineHeight: 1,
          color: 'transparent',
          WebkitTextStroke: `3px ${C.rule}`,
          fontVariantNumeric: 'lining-nums tabular-nums',
          translate: `${ease(f, 0, durationInFrames, 80, -80)}px 0px`,
        }}
      >
        {Math.floor(year)}
      </div>
      <AbsoluteFill style={{ translate: `${ease(f, 0, durationInFrames, 40, -40)}px 0px`, scale: punch(f, y2011, 1.05) }}>
        <Mono size={72} color={C.ink} style={{ position: 'absolute', left: BX, top: 110, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
          {Math.floor(year)}
        </Mono>
        <div
          style={{
            position: 'absolute',
            left: BX + BW,
            top: TOP - 40,
            height: ROW * 4 + 20,
            borderLeft: `3px dashed ${C.dim}`,
            opacity: interpolate(year, [2016.4, 2016.9], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
          }}
        >
          <Mono size={28} style={{ position: 'absolute', left: 10, top: -8 }}>
            {T.peakLine[lang]}
          </Mono>
        </div>
        {ORDER.map((co) => {
          const rank = r0.indexOf(co) + (r1.indexOf(co) - r0.indexOf(co)) * sm
          const y = TOP + rank * ROW
          const w = (val(co) / GF_PEAK) * BW
          // mid-swap, the label of a row moving DOWN fades so two names never print on one line
          const sinking = r1.indexOf(co) > r0.indexOf(co)
          const labelOpacity = sinking ? 1 - 0.9 * Math.sin(Math.PI * sm) : 1
          return (
            <div key={co}>
              <div
                style={{
                  position: 'absolute',
                  left: BX - 30 - LABEL_W,
                  width: LABEL_W,
                  top: y + 14,
                  textAlign: 'right',
                  fontFamily: SERIF_F,
                  fontWeight: 700,
                  fontSize: labelSize,
                  color: C.ink,
                  opacity: labelOpacity,
                  whiteSpace: 'nowrap',
                }}
              >
                {NAMES[co].short}
              </div>
              <div
                style={{
                  position: 'absolute',
                  left: BX,
                  top: y,
                  width: Math.max(2, w),
                  height: 88,
                  backgroundColor: CO_COLOR[co],
                  outline: `2px solid ${C.ink}`,
                }}
              />
              {co === leader && (
                <div
                  style={{
                    position: 'absolute',
                    left: BX + w + 14,
                    top: y + 20,
                    padding: '4px 12px',
                    backgroundColor: C.salud,
                    color: C.paperHi,
                    fontFamily: MONO_F,
                    fontWeight: 700,
                    fontSize: 32,
                  }}
                >
                  {lang === 'en' ? '1st' : '1.º'}
                </div>
              )}
            </div>
          )
        })}
      </AbsoluteFill>
    </Paper>
  )
}

export const Relay = scene(RelayInner, 'Relay')
