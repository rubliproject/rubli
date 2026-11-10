/**
 * Beat 3 · buyer — the IMSS seal stamps, its ring unrolls into a rule, and the rule drops
 * a 10×10 waffle (chart 3: one square = 1% of everything IMSS contracted, 2002–2025).
 * On "one" a full row of ten fills red, plus 0.9 of the next square (10.9%); the rest dims.
 */
import { interpolatePaths } from '@remotion/paths'
import { AbsoluteFill, Easing, useCurrentFrame, useVideoConfig } from 'remotion'
import { C, CO_COLOR, IMSS_COLOR, IMSS_PCT, IMSS_WASH, NAMES, ORDER, T } from '../data'
import { punch } from '../fx'
import { Hero, MONO_F, Mono, Paper, SERIF_F, ease, easeBack, useFonts } from '../kit'
import { scene, type SceneProps } from '../scene'
import { cue } from '../timing'

const CELL = 50
const GAP = 6
const WX = 250
const WY = 220
const SIDE = 10 * CELL + 9 * GAP
const CX = WX + SIDE / 2
const CY = WY + SIDE / 2
const R = 200
const RING = `M ${CX - R},${CY} A ${R},${R} 0 1,0 ${CX + R},${CY} A ${R},${R} 0 1,0 ${CX - R},${CY}`
const LINE = `M ${WX},${WY - 14} L ${WX + SIDE / 2},${WY - 14} L ${WX + SIDE},${WY - 14} L ${WX + SIDE / 2},${WY - 14} L ${WX},${WY - 14}`

// 10.9 squares split by company: GF 4.40 · Maypo 2.39 · PISA 2.20 · Dimesa 1.94 (of 100)
const SEGS = (() => {
  let acc = 0
  return ORDER.map((co) => {
    const a = acc
    acc += IMSS_PCT[co]
    return { co, a, b: acc }
  })
})()
/** The colour stops for square i (covering [i, i+1]), revealed left to right by `p`. */
function cellGradient(i: number, p: number) {
  const stops: string[] = []
  for (const { co, a, b } of SEGS) {
    const lo = Math.max(a, i) - i
    const hi = Math.min(b, i + 1) - i
    if (hi <= lo) continue
    const l = Math.min(lo, p) * 100
    const h = Math.min(hi, p) * 100
    stops.push(`${CO_COLOR[co]} ${l}%`, `${CO_COLOR[co]} ${h}%`)
  }
  const end = Math.min(SEGS[SEGS.length - 1].b - i, p) * 100
  return `linear-gradient(90deg, ${stops.join(', ')}, transparent ${end}%, transparent 100%)`
}

const BuyerInner: React.FC<SceneProps> = ({ lang }) => {
  const f = useCurrentFrame()
  const { durationInFrames } = useVideoConfig()
  const ready = useFonts()
  if (!ready) return <Paper />
  const one = cue(lang, 'buyer', { en: 'one', es: 'uno' })
  const unroll = ease(f, 12, 34, 0, 1, Easing.inOut(Easing.cubic))
  return (
    <Paper>
      <AbsoluteFill style={{ scale: punch(f, one, 1.05) * ease(f, 0, durationInFrames, 1.03, 1) }}>
        <div style={{ position: 'absolute', left: 1320 - 430, top: 470 - 430, width: 860, height: 860, borderRadius: '50%', backgroundColor: IMSS_WASH, scale: ease(f, one - 6, one + 12, 0.6, 1, easeBack), opacity: ease(f, one - 6, one + 2, 0, 1) }} />
        {/* the seal: ring → rule (interpolatePaths), lettering fades as it unrolls */}
        <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
          <path
            d={interpolatePaths(f, [12, 34], [RING, LINE], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic) })}
            fill="none"
            stroke={IMSS_COLOR}
            strokeWidth={8}
            style={{ scale: ease(f, 0, 10, 1.4, 1, easeBack), transformOrigin: `${CX}px ${CY}px`, opacity: ease(f, 0, 3, 0, 1) }}
          />
          <g style={{ opacity: (1 - unroll * 3) * ease(f, 0, 3, 0, 1), scale: ease(f, 0, 10, 1.4, 1, easeBack), transformOrigin: `${CX}px ${CY}px` }}>
            <circle cx={CX} cy={CY} r={R - 58} fill={IMSS_WASH} stroke={IMSS_COLOR} strokeWidth={3} />
            <path id="relevo-seal-ring" d={`M ${CX - (R - 30)},${CY} a ${R - 30},${R - 30} 0 1,1 ${2 * (R - 30)},0 a ${R - 30},${R - 30} 0 1,1 ${-2 * (R - 30)},0`} fill="none" />
            <text fontFamily={MONO_F} fontWeight={700} fontSize={28} fill={IMSS_COLOR} letterSpacing={2}>
              <textPath href="#relevo-seal-ring">INSTITUTO MEXICANO DEL SEGURO SOCIAL ·</textPath>
            </text>
            <text x={CX} y={CY + 26} textAnchor="middle" fontFamily={SERIF_F} fontWeight={800} fontSize={76} fill={IMSS_COLOR}>
              IMSS
            </text>
          </g>
        </svg>
        {/* chart 3 — the waffle drops from the rule, row by row */}
        {Array.from({ length: 100 }, (_, i) => {
          const row = Math.floor(i / 10)
          const col = i % 10
          const drop = 30 + row * 2.2 + col * 0.8
          const fill = ease(f, one + i * 1.5, one + i * 1.5 + 6, 0, 1) // the four's squares fill in order
          const dim = i > 10 ? ease(f, one + 4, one + 16, 1, 0.32) : 1
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: WX + col * (CELL + GAP),
                top: WY + row * (CELL + GAP),
                width: CELL,
                height: CELL,
                backgroundColor: C.paperHi,
                outline: `2px solid ${C.ink}`,
                opacity: ease(f, drop, drop + 6, 0, 1) * dim,
                translate: `0px ${ease(f, drop, drop + 10, -60, 0, easeBack)}px`,
                rotate: `${ease(f, drop, drop + 10, (col - 4.5) * 4, 0)}deg`,
                backgroundImage: i < 11 ? cellGradient(i, fill) : undefined,
              }}
            />
          )
        })}
        <Mono size={24} style={{ position: 'absolute', left: 980, top: 740, opacity: ease(f, 56, 66, 0, 1) }}>
          {lang === 'en' ? '1 square = 1% of all IMSS contracts' : '1 cuadro = 1% de lo contratado por el IMSS'}
        </Mono>
        <div style={{ position: 'absolute', left: 980, top: 690, display: 'flex', gap: 22, opacity: ease(f, one + 18, one + 26, 0, 1) }}>
          {ORDER.map((co) => (
            <Mono key={co} size={22} color={C.ink}>
              <span style={{ display: 'inline-block', width: 16, height: 16, marginRight: 8, backgroundColor: CO_COLOR[co] }} />
              {co === 'gf' ? 'Grupo Fármacos' : NAMES[co].short.replace('Farmacéuticos ', '').replace('Laboratorios ', '')} {IMSS_PCT[co].toFixed(1)}
            </Mono>
          ))}
        </div>
        <Mono size={30} style={{ position: 'absolute', left: 980, top: 230, opacity: ease(f, 40, 50, 0, 1) }}>
          {T.imssRibbon[lang]}
        </Mono>
        <Hero at={one} size={230} color={IMSS_COLOR} scope={T.oneInTenScope[lang].split(' · ').map((l) => <div key={l}>{l}</div>)} style={{ position: 'absolute', left: 980, top: 300, scale: ease(f, one, one + 10, 1.5, 1, easeBack) }}>
          {T.oneInTen[lang]}
        </Hero>
      </AbsoluteFill>
    </Paper>
  )
}

export const Buyer = scene(BuyerInner, 'Buyer')
