/**
 * Beat 1 · peak — 19.9 B slams in, then pours as peso coins into the 2017 column of
 * Grupo Fármacos's yearly bar chart (chart 1); the full name slams down on its spoken word.
 */
import { AbsoluteFill, Easing, interpolate, random, useCurrentFrame, useVideoConfig } from 'remotion'
import { C, CO_COLOR, GF_PEAK, GF_YEARS, T } from '../data'
import { Coin, Wedge, punch } from '../fx'
import { Hero, MONO_F, Mono, NamePlate, Paper, ease, easeBack, useFonts } from '../kit'
import { scene, type SceneProps } from '../scene'
import { cue } from '../timing'

const BX = 1010 // chart left
const BW = 780 // chart width
const BASE = 800 // baseline y
const BH = 400 // height of the 2017 peak
const YEARS = GF_YEARS.filter(([y]) => y <= 2019)
const COL = BW / YEARS.length
const COINS = 34
const I2017 = YEARS.findIndex(([y]) => y === 2017)

const PeakInner: React.FC<SceneProps> = ({ lang }) => {
  const f = useCurrentFrame()
  const { durationInFrames } = useVideoConfig()
  const ready = useFonts()
  if (!ready) return <Paper />
  const num = cue(lang, 'peak', { en: '19.9', es: '19,900' })
  const pour = num + 26
  const name = cue(lang, 'peak', 'Grupo')
  const nameEnd = cue(lang, 'peak', 'Especializados') + 10
  const landed = (i: number) => pour + i * 0.7 + 18
  const filled = Array.from({ length: COINS }, (_, i) => i).filter((i) => f >= landed(i)).length / COINS
  const x17 = BX + I2017 * COL + COL / 2
  const top17 = BASE - BH * filled
  return (
    <Paper>
      <AbsoluteFill style={{ scale: punch(f, num, 1.07) * ease(f, 0, durationInFrames, 1, 1.04), transformOrigin: '30% 40%' }}>
        {/* punctuation: a salud disc opens and a wedge sweeps behind the chart */}
        <div style={{ position: 'absolute', left: 1330 - 520, top: 560 - 520, width: 1040, height: 1040, borderRadius: '50%', backgroundColor: C.saludWash, scale: ease(f, 0, 24, 0.6, 1, easeBack), opacity: ease(f, 0, 10, 0, 1) }} />
        {/* colour-blocked punctuation: the other three, waiting at the edges */}
        {(['maypo', 'pisa', 'dimesa'] as const).map((co, i) => (
          <div key={co} style={{ position: 'absolute', left: [60, 820, 1770][i], top: [690, 900, -120][i], width: [150, 110, 200][i], height: [150, 110, 200][i], borderRadius: '50%', backgroundColor: CO_COLOR[co], scale: ease(f, 8 + i * 5, 22 + i * 5, 0.6, 1, easeBack), opacity: ease(f, 8 + i * 5, 14 + i * 5, 0, 0.9) }} />
        ))}
        <Wedge r={330} progress={ease(f, 6, durationInFrames, 0.05, 0.62)} rotation={ease(f, 0, durationInFrames, -1.2, 0.6)} style={{ position: 'absolute', left: 1330 - 330, top: 560 - 330, opacity: 0.9 }} />
        <Mono size={34} style={{ position: 'absolute', left: 140, top: 56, opacity: ease(f, 0, 10, 0, 1) }}>
          {T.contracts2017[lang]}
        </Mono>

        {/* chart 1 — Grupo Fármacos, contracts per year */}
        <Mono size={24} style={{ position: 'absolute', right: 1920 - (BX + BW), top: BASE - BH - 140, textAlign: 'right', lineHeight: 1.4, opacity: ease(f, 10, 20, 0, 1) }}>
          <div>{lang === 'en' ? 'Grupo Fármacos · federal contracts per year' : 'Grupo Fármacos · contratos federales por año'}</div>
          <div>{lang === 'en' ? 'B MXN' : 'mil millones'}</div>
        </Mono>
        <div style={{ position: 'absolute', left: BX - 10, top: BASE, width: BW + 20, height: 3, backgroundColor: C.ink, scale: `${ease(f, 4, 22, 0, 1)} 1`, transformOrigin: 'left' }} />
        {YEARS.map(([y, v], i) => {
          const is17 = i === I2017
          const h = is17 ? BH * filled : ease(f, 14 + i * 3, 34 + i * 3, 0, (v / GF_PEAK) * BH, easeBack)
          return (
            <div key={y}>
              <div
                style={{
                  position: 'absolute',
                  left: BX + i * COL + 8,
                  top: BASE - h,
                  width: COL - 16,
                  height: h,
                  backgroundColor: is17 ? C.salud : C.gfLight,
                  outline: h > 0.5 ? `2px solid ${C.ink}` : undefined,
                }}
              />
              <div style={{ position: 'absolute', left: BX + i * COL, width: COL, top: BASE + 12, textAlign: 'center', fontFamily: MONO_F, fontSize: 22, color: is17 ? C.salud : C.dim, fontWeight: is17 ? 700 : 500 }}>
                {String(y).slice(2)}
              </div>
            </div>
          )
        })}
        <Mono size={30} color={C.salud} style={{ position: 'absolute', left: x17 - 40, top: BASE - BH - 46, fontWeight: 800, opacity: ease(f, landed(COINS - 1), landed(COINS - 1) + 6, 0, 1) }}>
          19.9
        </Mono>

        {/* the hero lands whole, then pours out as coins */}
        <Hero
          at={num}
          size={110}
          scope={T.peakScope[lang]}
          style={{
            position: 'absolute',
            left: 130,
            top: 300,
            scale: interpolate(f, [num, num + 10], [1.5, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(0.34, 1.56, 0.64, 1) }),
            opacity: ease(f, pour, pour + 30, 1, 0.22),
            filter: `blur(${ease(f, pour, pour + 30, 0, 1.5)}px)`,
          }}
        >
          {T.peak[lang]}
        </Hero>
        {Array.from({ length: COINS }, (_, i) => {
          const s = pour + i * 0.7
          const t = ease(f, s, s + 18, 0, 1, Easing.in(Easing.quad))
          if (f < s || t >= 1) return null
          const sx = 150 + random(`cx${i}`) * 620
          const sy = 320 + random(`cy${i}`) * 130
          const ex = x17 - 18 + (random(`ex${i}`) - 0.5) * 20
          const ey = top17 - 30
          return (
            <Coin
              key={i}
              r={20}
              style={{
                position: 'absolute',
                left: sx + (ex - sx) * t,
                top: sy + (ey - sy) * t - Math.sin(Math.PI * t) * (180 + random(`ch${i}`) * 140),
                rotate: `${t * 540 * (random(`cr${i}`) > 0.5 ? 1 : -1)}deg`,
                scale: `${Math.abs(Math.cos(t * 6 + i))} 1`,
              }}
            />
          )
        })}

        <NamePlate
          co="gf"
          width={1640}
          cap={92}
          reveal={ease(f, name, nameEnd, 0, 1)}
          style={{ position: 'absolute', left: 140, top: 112, translate: `0px ${ease(f, name, name + 10, -160, 0, easeBack)}px`, rotate: `${ease(f, name, name + 10, -3, 0)}deg` }}
        />
      </AbsoluteFill>
    </Paper>
  )
}

export const Peak = scene(PeakInner, 'Peak')
