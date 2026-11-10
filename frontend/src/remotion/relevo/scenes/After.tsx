/**
 * Beat 7 · after — chart 6: 2019 vs 2020 paired bars; the 2020 bar starts at its 2019 length
 * and shrinks with overshoot (Dimesa −97%, Maypo −48%) on the spoken figure. Chart 7: the
 * three buying systems as a 2019–2025 timeline whose blocks flip in on "three times".
 */
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from 'remotion'
import { C, CO_COLOR, CO_WASH, DROPS, T } from '../data'
import { punch } from '../fx'
import { MONO_F, Mono, NameText, Paper, SERIF_F, ease, easeBack, useFonts } from '../kit'
import { scene, type SceneProps } from '../scene'
import { cue } from '../timing'

const X = 200
const SCALE = 1100 / 8 // px per B MXN
const ROW = [150, 365]
const TX0 = 200
const TX1 = 1720
const tx = (yr: number) => TX0 + ((yr - 2019) / 7) * (TX1 - TX0)
const SYSTEMS = [
  { from: 2019, to: 2020.58 },
  { from: 2020.58, to: 2022.83 },
  { from: 2023, to: 2025.75 },
]
const overshoot = Easing.bezier(0.3, 1.6, 0.5, 1) // the bar dips past its 2020 length, then settles

const AfterInner: React.FC<SceneProps> = ({ lang }) => {
  const f = useCurrentFrame()
  const ready = useFonts()
  if (!ready) return <Paper />
  const at = { dimesa: cue(lang, 'after', '97'), maypo: cue(lang, 'after', { en: 'half', es: 'mitad' }) }
  const three = cue(lang, 'after', { en: 'three', es: 'tres' })
  return (
    <Paper>
      <AbsoluteFill style={{ scale: punch(f, at.dimesa, 1.05) }}>
        <div style={{ position: 'absolute', left: X, top: 46, display: 'flex', alignItems: 'baseline', gap: 26, opacity: ease(f, 0, 10, 0, 1) }}>
          <NameText co="gf" width={1000} cap={34} color={C.dim} />
          <Mono size={26} color={C.dim}>
            {T.noneSince[lang]}
          </Mono>
        </div>
        {DROPS.map(({ co, y19, y20, label }, i) => {
          const top = ROW[i]
          const a = at[co]
          const w20 = interpolate(f, [a - 2, a + 18], [y19 * SCALE, y20 * SCALE], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: overshoot })
          return (
            <div key={co} style={{ opacity: ease(f, i * 6, i * 6 + 10, 0, 1) }}>
              <NameText co={co} width={1500} cap={36} style={{ position: 'absolute', left: X, top }} />
              {[
                { yr: '2019', w: ease(f, 6 + i * 6, 22 + i * 6, 0, y19 * SCALE, easeBack), y: top + 62, fill: false },
                { yr: '2020', w: Math.max(4, w20) * ease(f, 6 + i * 6, 22 + i * 6, 0, 1), y: top + 128, fill: true },
              ].map((bar) => (
                <div key={bar.yr}>
                  <Mono size={24} style={{ position: 'absolute', left: X - 90, top: bar.y + 14 }}>
                    {bar.yr}
                  </Mono>
                  <div
                    style={{
                      position: 'absolute',
                      left: X,
                      top: bar.y,
                      width: bar.w,
                      height: 56,
                      outline: `2px solid ${C.ink}`,
                      backgroundColor: bar.fill ? CO_COLOR[co] : CO_WASH[co],
                    }}
                  />
                </div>
              ))}
              <div
                style={{
                  position: 'absolute',
                  left: X + y19 * SCALE + 40,
                  top: top + 70,
                  fontFamily: SERIF_F,
                  fontWeight: 800,
                  fontSize: 110,
                  lineHeight: 1,
                  color: CO_COLOR[co],
                  fontVariantNumeric: 'lining-nums',
                  opacity: ease(f, a + 10, a + 14, 0, 1),
                  scale: ease(f, a + 10, a + 20, 1.6, 1, easeBack),
                  transformOrigin: 'left center',
                }}
              >
                {label}
              </div>
            </div>
          )
        })}
        {/* chart 7 — the three buying systems on a timeline */}
        <div style={{ position: 'absolute', left: TX0, top: 760, width: TX1 - TX0, height: 3, backgroundColor: C.ink, scale: `${ease(f, three - 14, three, 0, 1)} 1`, transformOrigin: 'left' }} />
        {[2019, 2020, 2021, 2022, 2023, 2024, 2025].map((yr) => (
          <div key={yr} style={{ position: 'absolute', left: tx(yr) - 40, width: 80, top: 772, textAlign: 'center', fontFamily: MONO_F, fontSize: 22, color: C.dim, opacity: ease(f, three - 10, three, 0, 1) }}>
            {yr}
          </div>
        ))}
        {SYSTEMS.map((s, i) => {
          const t0 = three + i * 8
          const flip = ease(f, t0, t0 + 14, 90, 0, easeBack)
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: tx(s.from) + 4,
                top: 660,
                width: tx(s.to) - tx(s.from) - 8,
                height: 92,
                backgroundColor: i === 2 ? C.paperHi : C.paperDeep,
                outline: `2px solid ${C.ink}`,
                borderTop: `10px solid ${C.ink}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transform: `perspective(900px) rotateX(${flip}deg)`,
                transformOrigin: 'center bottom',
                opacity: f >= t0 ? 1 : 0,
              }}
            >
              <Mono size={30} color={C.ink} style={{ fontWeight: 700 }}>
                {T.books[i][lang]}
              </Mono>
            </div>
          )
        })}
        <div style={{ position: 'absolute', left: tx(2025.75), top: 640, height: 140, borderLeft: `3px dashed ${C.dim}`, opacity: ease(f, three + 20, three + 28, 0, 1) }}>
          <Mono size={20} style={{ position: 'absolute', right: 10, top: -2 }}>{lang === 'en' ? 'record ends Sep 2025' : 'el registro llega a sep 2025'}</Mono>
        </div>
      </AbsoluteFill>
    </Paper>
  )
}

export const After = scene(AfterInner, 'After')
