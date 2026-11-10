/**
 * Beat 5 · order — the presidential order drops onto the desk, ILLEGAL slams onto it, and on
 * "But" it tears in two and falls away; the SFP resolution whips in, the red stamp slams
 * with a punch-in, and an ink ring draws itself around the two years (evolvePath).
 */
import { evolvePath } from '@remotion/paths'
import { AbsoluteFill, Easing, useCurrentFrame, useVideoConfig } from 'remotion'
import { C, CO_COLOR, T, type Co } from '../data'
import { punch } from '../fx'
import { Hero, Mono, NameText, Paper, Stamp, breathe, ease, easeBack, useFonts } from '../kit'
import { scene, type SceneProps } from '../scene'
import { cue, type BeatId } from '../timing'
import type { Lang } from '../data'

const LISTED: Co[] = ['gf', 'maypo', 'dimesa']
// the tear: a jagged vertical line across the sheet (percent of its width, top → bottom)
const TEAR = [52, 47, 55, 49, 57, 50, 54, 46, 53, 48, 56]
const half = (side: 'l' | 'r') => {
  const pts = TEAR.map((x, i) => `${x}% ${(i / (TEAR.length - 1)) * 100}%`)
  return side === 'l' ? `polygon(0% 0%, ${pts.join(', ')}, 0% 100%)` : `polygon(100% 0%, ${pts.join(', ')}, 100% 100%)`
}
const RING = 'M 52,4 C 86,3 99,24 98,50 C 97,79 70,97 45,96 C 17,95 2,77 3,50 C 4,22 26,7 60,9'

function Memo({ lang, f, typed, illegal }: { lang: Lang; f: number; typed: Record<string, number>; illegal: number }) {
  return (
    <>
      <Mono size={30} color={C.dim}>{T.memo[lang]}</Mono>
      <Mono size={40} color={C.ink} style={{ marginTop: 10, fontWeight: 700 }}>
        {T.memoRef}
      </Mono>
      <div style={{ marginTop: 50, borderTop: `2px solid ${C.rule}` }} />
      {LISTED.map((co, i) => (
        <div key={co} style={{ display: 'flex', gap: 18, marginTop: 26, clipPath: `inset(-10px ${(1 - ease(f, typed[co], typed[co] + 14, 0, 1, (x) => x)) * 100}% -10px -10px)` }}>
          <div style={{ width: 22, height: 22, marginTop: 12, backgroundColor: CO_COLOR[co] }} />
          <Mono size={34} color={C.ink} style={{ width: 40, paddingTop: 4 }}>
            {i + 1}.
          </Mono>
          <NameText co={co} width={1020} cap={42} />
        </div>
      ))}
      <Stamp at={illegal} size={96} rotate={-9} style={{ left: 120, top: 430 }}>
        {T.illegal[lang]}
      </Stamp>
    </>
  )
}

const OrderInner: React.FC<SceneProps> = ({ lang }) => {
  const f = useCurrentFrame()
  const { fps } = useVideoConfig()
  const ready = useFonts()
  if (!ready) return <Paper />
  const b: BeatId = 'order'
  const typed: Record<string, number> = {
    gf: cue(lang, b, { en: 'ordered', es: 'ordenó' }),
    maypo: cue(lang, b, 'Maypo'),
    dimesa: cue(lang, b, 'Dimesa'),
  }
  const illegal = cue(lang, b, { en: 'illegal', es: 'ilegal' })
  const tear = cue(lang, b, { en: 'But', es: 'Pero' })
  const barred = cue(lang, b, { en: 'barred', es: 'inhabilitó' })
  const two = cue(lang, b, { en: 'two', es: 'dos' })
  const fall = ease(f, tear + 4, tear + 20, 0, 1, Easing.in(Easing.quad)) // gravity: ease-in is physics here
  const split = ease(f, tear, tear + 6, 0, 1)
  const inB = ease(f, tear + 8, tear + 20, 0, 1, easeBack)
  const sheetA = (side: 'l' | 'r' | 'full') => (
    <div
      style={{
        position: 'absolute',
        left: 280,
        top: 100,
        width: 1240,
        height: 620,
        backgroundColor: C.paperHi,
        boxShadow: `0 18px 40px ${C.shade}`,
        padding: '44px 50px',
        clipPath: side === 'full' ? undefined : half(side),
        rotate: `${-1 + ease(f, 0, 14, -8, 0, easeBack) + (side === 'l' ? -14 : 16) * fall}deg`,
        translate: `${(side === 'l' ? -40 : side === 'r' ? 40 : 0) * split + (side === 'l' ? -380 : 420) * fall}px ${ease(f, 0, 14, -800, 0, easeBack) + 900 * fall}px`,
        transformOrigin: side === 'r' ? '70% 100%' : '30% 100%',
      }}
    >
      <Memo lang={lang} f={f} typed={typed} illegal={illegal} />
    </div>
  )
  return (
    <Paper>
      <AbsoluteFill style={{ scale: punch(f, illegal, 1.06) * punch(f, barred, 1.08) }}>
        {/* punctuation: a red bar slashes across behind the desk on the tear */}
        <div style={{ position: 'absolute', left: -100, top: 470, width: 2200, height: 120, backgroundColor: C.saludWash, rotate: '-8deg', scale: `${ease(f, tear, tear + 10, 0, 1)} 1`, transformOrigin: 'left' }} />
        {/* one sheet until the tear (no seam), two halves after */}
        {f < tear && sheetA('full')}
        {f >= tear && f < tear + 30 && sheetA('l')}
        {f >= tear && f < tear + 30 && sheetA('r')}
        {/* the SFP resolution whips in */}
        <div
          style={{
            position: 'absolute',
            left: 420,
            top: 90,
            width: 1080,
            height: 660,
            backgroundColor: C.paperHi,
            boxShadow: `0 22px 48px ${C.shade}`,
            rotate: `${1.2 - (1 - inB) * 6}deg`,
            padding: '44px 56px',
            opacity: f >= tear + 8 ? 1 : 0,
            translate: `${(1 - inB) * 1300}px 0px`,
            filter: `blur(${(1 - ease(f, tear + 8, tear + 16, 0, 1)) * 18}px)`,
            scale: breathe(f, fps, 3),
          }}
        >
          <Mono size={30}>{T.sfp[lang]}</Mono>
          <Mono size={40} color={C.ink} style={{ marginTop: 10, fontWeight: 700 }}>
            {T.sfpDate[lang]}
          </Mono>
          <div style={{ marginTop: 40, borderTop: `2px solid ${C.rule}` }} />
          <NameText co="gf" width={960} cap={48} style={{ marginTop: 30 }} />
          <div style={{ position: 'relative', display: 'inline-block', marginTop: 56 }}>
            <Hero at={two} size={150} color={C.ink} scope={T.sfpSource[lang]} style={{ scale: ease(f, two, two + 10, 1.4, 1, easeBack), transformOrigin: 'left center' }}>
              {T.twoYears[lang]}
            </Hero>
            {/* an ink ring draws itself around the two years */}
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', left: -40, top: -36, width: 'calc(100% + 80px)', height: 'calc(100% + 60px)', overflow: 'visible' }}>
              <path d={RING} fill="none" stroke={C.alert} strokeWidth={5} vectorEffect="non-scaling-stroke" strokeLinecap="round" opacity={f >= two + 6 ? 1 : 0} {...evolvePath(ease(f, two + 6, two + 24, 0, 1), RING)} />
            </svg>
          </div>
          <Stamp at={barred} color={C.alert} size={64} rotate={-7} style={{ left: 560, top: 30 }}>
            {T.barred[lang]}
          </Stamp>
        </div>
      </AbsoluteFill>
    </Paper>
  )
}

export const Order = scene(OrderInner, 'Order')
