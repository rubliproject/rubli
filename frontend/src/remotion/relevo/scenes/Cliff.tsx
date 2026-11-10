/**
 * Beat 6 · cliff — chart 5: Grupo Fármacos's contracts per year on a LOG scale (2007–2020).
 * The line draws itself up to 17.6 B in 2019, falls off the cliff to $582,920 in 2020 with a
 * punch-in, then the stub to 2021 snaps and drops off the floor: no contracts after April 2020.
 */
import { evolvePath } from '@remotion/paths'
import { AbsoluteFill, Easing, useCurrentFrame } from 'remotion'
import { C, GF_YEARS, T } from '../data'
import { punch } from '../fx'
import { Hero, MONO_F, Mono, NameText, Paper, ease, easeBack, useFonts } from '../kit'
import { scene, type SceneProps } from '../scene'
import { cue } from '../timing'

const X0 = 200
const X1 = 1300
const Y0 = 800 // log10 = 5 (100 thousand pesos)
const Y1 = 200 // log10 = 11
const x = (yr: number) => X0 + ((yr - 2007) / 14) * (X1 - X0)
const y = (pesos: number) => Y0 - ((Math.log10(pesos) - 5) / 6) * (Y0 - Y1)
const PTS = GF_YEARS.map(([yr, b]) => [x(yr), y(b * 1e9)] as const)
const UP = 'M ' + PTS.slice(0, 13).map(([a, b]) => `${a},${b}`).join(' L ')
const [p19, p20] = [PTS[12], PTS[13]]
const DROP = `M ${p19[0]},${p19[1]} L ${p20[0]},${p20[1]}`
const STUB = `M ${p20[0]},${p20[1]} L ${x(2021)},${Y0 + 40}`
const TICKS: [number, { en: string; es: string }][] = [
  [1e5, { en: '$100K', es: '100 mil' }],
  [1e6, { en: '$1M', es: '1 MDP' }],
  [1e7, { en: '$10M', es: '10 MDP' }],
  [1e8, { en: '$100M', es: '100 MDP' }],
  [1e9, { en: '$1B', es: '1,000 MDP' }],
  [1e10, { en: '$10B', es: '10,000 MDP' }],
]

const CliffInner: React.FC<SceneProps> = ({ lang }) => {
  const f = useCurrentFrame()
  const ready = useFonts()
  if (!ready) return <Paper />
  const big = cue(lang, 'cliff', { en: '17.6', es: '17,600' })
  const half = cue(lang, 'cliff', { en: 'half', es: 'medio' })
  const stop = cue(lang, 'cliff', { en: 'Then', es: 'Después' })
  const [amount, count] = T.cliffR[lang].split(' · ')
  const drop = ease(f, half - 3, half + 3, 0, 1, Easing.in(Easing.cubic))
  const snap = ease(f, stop + 6, stop + 30, 0, 1, Easing.in(Easing.quad))
  return (
    <Paper>
      <AbsoluteFill style={{ scale: punch(f, half, 1.07) }}>
        <div style={{ position: 'absolute', left: 1500, top: 300, width: 760, height: 760, borderRadius: '50%', backgroundColor: C.saludWash, scale: ease(f, 0, 20, 0.6, 1, easeBack), opacity: ease(f, 0, 8, 0, 1) }} />
        <NameText co="gf" width={1300} cap={44} style={{ position: 'absolute', left: X0, top: 50 }} />
        <Mono size={24} style={{ position: 'absolute', left: X0, top: 130 }}>
          {lang === 'en' ? 'federal contracts per year · log scale' : 'contratos federales por año · escala logarítmica'}
        </Mono>
        <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
          {TICKS.map(([v, l]) => (
            <g key={v} opacity={ease(f, 0, 12, 0, 1)}>
              <line x1={X0} x2={X1} y1={y(v)} y2={y(v)} stroke={C.rule} strokeWidth={2} />
              <text x={X0 - 14} y={y(v) + 8} textAnchor="end" fontFamily={MONO_F} fontSize={22} fill={C.dim}>
                {l[lang]}
              </text>
            </g>
          ))}
          {[2007, 2011, 2015, 2019, 2020].map((yr) => (
            <text key={yr} x={x(yr)} y={Y0 + 40} textAnchor="middle" fontFamily={MONO_F} fontSize={22} fill={yr >= 2019 ? C.ink : C.dim} opacity={ease(f, 0, 12, 0, 1)}>
              {yr}
            </text>
          ))}
          <line x1={X0} x2={X1} y1={Y0} y2={Y0} stroke={C.ink} strokeWidth={3} />
          {/* 2007 → 2019 */}
          <path d={UP} fill="none" stroke={C.salud} strokeWidth={7} strokeLinejoin="round" {...evolvePath(ease(f, 4, big, 0, 1, Easing.inOut(Easing.quad)), UP)} />
          {PTS.slice(0, 13).map(([a, b], i) => (
            <circle key={i} cx={a} cy={b} r={i === 12 ? 12 : 6} fill={i === 12 ? C.salud : C.paperHi} stroke={C.ink} strokeWidth={2.5} opacity={ease(f, 4 + ((big - 4) * i) / 12, 8 + ((big - 4) * i) / 12, 0, 1)} />
          ))}
          {/* the cliff */}
          <path d={DROP} fill="none" stroke={C.salud} strokeWidth={7} {...evolvePath(drop, DROP)} />
          <circle cx={p20[0]} cy={p20[1]} r={12} fill={C.paperHi} stroke={C.salud} strokeWidth={4} opacity={drop >= 1 ? 1 : 0} />
          {/* the snap: the stub to 2021 breaks off and falls */}
          <g style={{ translate: `${snap * 40}px ${snap * 380}px`, rotate: `${snap * 50}deg`, transformOrigin: `${p20[0]}px ${p20[1]}px`, opacity: 1 - snap }}>
            <path d={STUB} fill="none" stroke={C.salud} strokeWidth={7} {...(f < stop ? evolvePath(ease(f, half + 10, half + 20, 0, 1), STUB) : {})} />
          </g>
          {/* leader lines to the figures */}
          <line x1={p19[0] + 14} y1={p19[1]} x2={1390} y2={250} stroke={C.ink} strokeWidth={2} opacity={ease(f, big, big + 6, 0, 1)} />
          <line x1={p20[0] + 14} y1={p20[1]} x2={1390} y2={640} stroke={C.ink} strokeWidth={2} opacity={ease(f, half + 4, half + 10, 0, 1)} />
        </svg>
        <Hero at={big} size={80} style={{ position: 'absolute', left: 1400, top: 200, scale: ease(f, big, big + 10, 1.4, 1, easeBack), transformOrigin: 'left center' }}>
          {T.cliffL[lang]}
          <Mono size={28} style={{ marginTop: 8 }}>2019</Mono>
        </Hero>
        <Hero at={half + 4} size={80} color={C.ink} scope={count} style={{ position: 'absolute', left: 1400, top: 590, scale: ease(f, half + 4, half + 14, 1.4, 1, easeBack), transformOrigin: 'left center' }}>
          {amount}
        </Hero>
        <div
          style={{
            position: 'absolute',
            left: 1400,
            top: 752,
            padding: '6px 16px',
            backgroundColor: C.salud,
            color: C.paperHi,
            fontFamily: MONO_F,
            fontWeight: 700,
            fontSize: 28,
            rotate: `${ease(f, stop, stop + 12, 0, -5, easeBack)}deg`,
            opacity: ease(f, stop, stop + 6, 0, 1),
            scale: ease(f, stop, stop + 10, 1.4, 1, easeBack),
          }}
        >
          {T.noneSince[lang]}
        </div>
      </AbsoluteFill>
    </Paper>
  )
}

export const Cliff = scene(CliffInner, 'Cliff')
