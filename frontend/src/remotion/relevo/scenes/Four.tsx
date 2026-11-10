/**
 * Beat 2 · four — each name plate slams in on its spoken name, then morphs into its bar:
 * a ranked bar chart of the four totals (chart 2). On "326" the bars collapse end to end
 * into one bar and the total punches in.
 */
import { AbsoluteFill, Easing, useCurrentFrame } from 'remotion'
import { Pie } from '@remotion/shapes'
import { C, CO_COLOR, NAMES, ORDER, T, type Co } from '../data'
import { punch } from '../fx'
import { Mono, NameText, Paper, SERIF_F, ease, easeBack, fitName, useFonts } from '../kit'
import { scene, type SceneProps } from '../scene'
import { cue } from '../timing'

const W = 1300
const X = 130
const PITCH = 165
const TOP = 70
const BAR_H = 66
const JOIN_Y = 745
const SUM = ORDER.reduce((a, c) => a + NAMES[c].total, 0)
const io = Easing.inOut(Easing.cubic)
const DCX = 1640
const DCY = 400

const FourInner: React.FC<SceneProps> = ({ lang }) => {
  const f = useCurrentFrame()
  const ready = useFonts()
  if (!ready) return <Paper />
  const land: Record<Co, number> = {
    gf: 2,
    maypo: cue(lang, 'four', 'Maypo'),
    pisa: cue(lang, 'four', 'PISA'),
    dimesa: cue(lang, 'four', 'Dimesa'),
  }
  const join = cue(lang, 'four', '326')
  const t = ease(f, join, join + 22, 0, 1, io)
  let cum = 0
  return (
    <Paper>
      <AbsoluteFill style={{ scale: punch(f, join, 1.06) }}>
        {/* punctuation: a rule sweeps the chart's left edge */}
        <div style={{ position: 'absolute', left: X - 30, top: TOP, width: 6, height: ease(f, 0, 30, 0, 700), backgroundColor: C.ink }} />
        {ORDER.map((co, i) => {
          const fit = fitName(co, W - 56, 56, 36)
          const plateH = fit.lines.length * fit.size * 1.12 + 28
          const rowTop = TOP + i * PITCH
          const lab = fitName(co, W, 36, 36)
          const off = lab.lines.length * lab.size * 1.12 + 10 // the bar sits under its (possibly two-line) label
          const barW = (NAMES[co].total / NAMES.gf.total) * W
          const k = 1 / (SUM / NAMES.gf.total)
          const x0 = cum
          cum += barW * k
          const l = land[co]
          const m = ease(f, l + 20, l + 40, 0, 1, io)
          const top = rowTop + off * m
          const width = W + (barW - W) * m
          const height = plateH + (BAR_H - plateH) * m
          const isGf = co === 'gf'
          return (
            <div key={co}>
              {/* the label the plate leaves behind */}
              <NameText co={co} width={W} cap={36} color={isGf ? C.ink : C.dim} style={{ position: 'absolute', left: X, top: rowTop - 4, opacity: ease(f, l + 30, l + 42, 0, 1) * (1 - t * 0.35) }} />
              <div
                style={{
                  position: 'absolute',
                  left: X + x0 * t,
                  top: top + (JOIN_Y - top) * t,
                  width: width + (barW * k - width) * t,
                  height,
                  outline: `2px solid ${C.ink}`,
                  boxShadow: `0 ${10 * (1 - m)}px ${24 * (1 - m)}px ${C.shade}`,
                  overflow: 'hidden',
                  opacity: f >= l ? 1 : 0,
                  clipPath: `inset(-20px ${(1 - ease(f, l, l + 10, 0, 1)) * 100}% -20px -20px)`,
                  translate: `${ease(f, l, l + 10, 120, 0, easeBack)}px 0px`,
                }}
              >
                <div style={{ position: 'absolute', inset: 0, backgroundColor: C.paperHi, opacity: 1 - m }} />
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    opacity: m,
                    backgroundColor: CO_COLOR[co],
                  }}
                />
                <NameText co={co} width={W - 56} cap={56} style={{ position: 'absolute', left: 28, top: 14, opacity: 1 - m * 2.5 }} />
              </div>
              <Mono size={30} color={C.ink} style={{ position: 'absolute', left: X + barW + 18, top: rowTop + off + 16, opacity: ease(f, l + 38, l + 46, 0, 1) * (1 - t) }}>
                {NAMES[co].total.toFixed(1)} {T.billions[lang]}
              </Mono>
            </div>
          )
        })}
        {/* the total — chart: a donut of the four totals builds around it */}
        {(() => {
          let acc = 0
          return ORDER.map((co, i) => {
            const share = NAMES[co].total / SUM
            const s0 = acc
            acc += share
            const p = ease(f, join + 4 + i * 4, join + 18 + i * 4, 0, 1, Easing.out(Easing.cubic))
            return <Pie key={co} radius={250} progress={Math.max(0.0001, share * p)} rotation={s0 * Math.PI * 2} fill={CO_COLOR[co]} stroke={C.bg} strokeWidth={5} style={{ position: 'absolute', left: DCX - 250, top: DCY - 250, opacity: p > 0 ? 1 : 0 }} />
          })
        })()}
        <div style={{ position: 'absolute', left: DCX - 178, top: DCY - 178, width: 356, height: 356, borderRadius: '50%', backgroundColor: C.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', scale: ease(f, join, join + 12, 0.7, 1, easeBack), opacity: ease(f, join, join + 4, 0, 1) }}>
          <div style={{ fontFamily: SERIF_F, fontWeight: 800, fontSize: 150, lineHeight: 1, color: C.ink, fontVariantNumeric: 'lining-nums' }}>326</div>
          <Mono size={34} color={C.ink} style={{ fontWeight: 700 }}>{T.billions[lang]}</Mono>
        </div>
        <Mono size={26} style={{ position: 'absolute', left: DCX - 250, top: DCY + 270, width: 500, textAlign: 'center', opacity: ease(f, join + 20, join + 28, 0, 1) }}>
          {T.fourScope[lang]}
        </Mono>
      </AbsoluteFill>
    </Paper>
  )
}

export const Four = scene(FourInner, 'Four')
