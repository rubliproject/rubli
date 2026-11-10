/**
 * Beat 9 · end — the close, as a chart (factcheck/relevo_concentration.py): IMSS medicine
 * contracts per year, 2002–2025. The ink line is the share of the four largest suppliers that
 * year (whoever they were); the coloured bands are our four companies' shares, stacked.
 * The caveat plays while the line draws; "2012 to 2019" lights the years the three held about
 * half; "Since 2020" lights the years the top four stayed under a quarter. Then the end card.
 */
import { evolvePath } from '@remotion/paths'
import { AbsoluteFill, Easing, useCurrentFrame } from 'remotion'
import { RubliLogoMark } from '../../../components/ui/RubliLogoMark'
import { C, CONC, CO_COLOR, NAMES, T, type Co } from '../data'
import { punch } from '../fx'
import { MONO_F, Mono, Paper, SERIF_F, ease, easeBack, useFonts } from '../kit'
import { scene, type SceneProps } from '../scene'
import { FPS, clipMs, cue, leadSec } from '../timing'

const X0 = 210
const X1 = 1660
const Y0 = 770 // 0%
const Y1 = 230 // 70%
const x = (yr: number) => X0 + ((yr - 2002) / 23) * (X1 - X0)
const y = (pct: number) => Y0 - (pct / 70) * (Y0 - Y1)
const STACK: Co[] = ['gf', 'dimesa', 'maypo', 'pisa']
const COL: Record<Co, number> = { gf: 2, maypo: 3, pisa: 4, dimesa: 5 }
// the top-4 line, broken at the 2004 gap
const TOP4 =
  'M ' +
  CONC.filter((r) => r[0] < 2004).map((r) => `${x(r[0])},${y(r[1])}`).join(' L ') +
  ' M ' +
  CONC.filter((r) => r[0] > 2004).map((r) => `${x(r[0])},${y(r[1])}`).join(' L ')

function band(k: number, g: number) {
  const lo = (r: (typeof CONC)[number]) => STACK.slice(0, k).reduce((a, co) => a + r[COL[co]], 0) * g
  const hi = (r: (typeof CONC)[number]) => lo(r) + r[COL[STACK[k]]] * g
  const top = CONC.map((r) => `${x(r[0])},${y(hi(r))}`).join(' L ')
  const bottom = [...CONC].reverse().map((r) => `${x(r[0])},${y(lo(r))}`).join(' L ')
  return `M ${top} L ${bottom} Z`
}

const EndInner: React.FC<SceneProps> = ({ lang }) => {
  const f = useCurrentFrame()
  const ready = useFonts()
  if (!ready) return <Paper />
  const era = cue(lang, 'end', '2012')
  const names: Partial<Record<Co, number>> = {
    gf: cue(lang, 'end', 'Grupo'),
    maypo: cue(lang, 'end', 'Maypo'),
    dimesa: cue(lang, 'end', 'Dimesa'),
  }
  const half = cue(lang, 'end', { en: 'half', es: 'mitad' })
  const since = cue(lang, 'end', { en: 'Since', es: 'Desde' })
  const quarter = cue(lang, 'end', { en: 'quarter', es: 'cuarta' })
  const card = Math.round((leadSec('end') + clipMs(lang, 'end') / 1000 + 0.8) * FPS)
  const g = ease(f, era - 4, era + 26, 0, 1, Easing.out(Easing.cubic))
  return (
    <Paper>
      <AbsoluteFill style={{ scale: punch(f, half, 1.04) * punch(f, quarter, 1.04) * ease(f, 0, card, 1.06, 1), transformOrigin: '50% 45%' }}>
        {/* colour-blocked punctuation: the four discs roll in */}
        {STACK.map((co, i) => (
          <div
            key={co}
            style={{
              position: 'absolute',
              left: 1730 + (i % 2) * 90,
              top: 210 + Math.floor(i / 2) * 90,
              width: 70,
              height: 70,
              borderRadius: '50%',
              backgroundColor: CO_COLOR[co],
              scale: ease(f, 4 + i * 4, 16 + i * 4, 0.6, 1, easeBack),
              opacity: ease(f, 4 + i * 4, 10 + i * 4, 0, 1) * (names[co] !== undefined && f >= era ? 1 : f >= era ? 0.35 : 1),
            }}
          />
        ))}
        <Mono size={24} style={{ position: 'absolute', left: X0, top: 52 }}>
          {lang === 'en' ? 'IMSS · medicine contracts · share of each year’s pesos' : 'IMSS · contratos de medicamentos · parte de los pesos de cada año'}
        </Mono>
        <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
          {[0, 25, 50].map((v) => (
            <g key={v} opacity={ease(f, 0, 12, 0, 1)}>
              <line x1={X0} x2={X1} y1={y(v)} y2={y(v)} stroke={v === 0 ? C.ink : C.rule} strokeWidth={v === 0 ? 3 : 2} strokeDasharray={v === 25 ? '10 8' : undefined} />
              <text x={X0 - 14} y={y(v) + 8} textAnchor="end" fontFamily={MONO_F} fontSize={22} fill={C.dim}>
                {v}%
              </text>
            </g>
          ))}
          {[2002, 2008, 2012, 2019, 2025].map((yr) => (
            <text key={yr} x={x(yr)} y={Y0 + 36} textAnchor="middle" fontFamily={MONO_F} fontSize={22} fill={C.dim} opacity={ease(f, 0, 12, 0, 1)}>
              {yr}
            </text>
          ))}
          {/* the two eras light up on their spoken years */}
          <rect x={x(2011.5)} y={Y1 - 10} width={x(2019.5) - x(2011.5)} height={Y0 - Y1 + 10} fill={C.saludWash} opacity={ease(f, era, era + 10, 0, 1)} />
          <rect x={x(2019.5)} y={Y1 - 10} width={x(2025.3) - x(2019.5)} height={Y0 - Y1 + 10} fill="rgba(30,27,22,0.06)" opacity={ease(f, since, since + 10, 0, 1)} />
          {STACK.map((co, k) => (
            <path key={co} d={band(k, g)} fill={CO_COLOR[co]} opacity={0.9} />
          ))}
          <path d={TOP4} fill="none" stroke={C.ink} strokeWidth={6} strokeLinejoin="round" {...evolvePath(ease(f, 6, era - 6, 0, 1, Easing.inOut(Easing.quad)), TOP4)} />
          <text x={x(2025) + 14} y={y(CONC[CONC.length - 1][1]) + 8} fontFamily={MONO_F} fontSize={22} fill={C.ink} opacity={ease(f, era - 10, era, 0, 1)}>
            {lang === 'en' ? 'top 4' : 'las 4 mayores'}
          </text>
        </svg>
        {/* the figures land on their words */}
        <div style={{ position: 'absolute', left: x(2012), top: y(64) - 128, opacity: ease(f, half, half + 6, 0, 1), scale: ease(f, half, half + 12, 1.4, 1, easeBack), transformOrigin: 'left bottom' }}>
          <div style={{ fontFamily: SERIF_F, fontWeight: 800, fontSize: 96, lineHeight: 1, color: C.salud, fontVariantNumeric: 'lining-nums' }}>≈ ½</div>
          <Mono size={22} color={C.ink}>{lang === 'en' ? '2012–2019 · Grupo Fármacos + Maypo + Dimesa' : '2012–2019 · Grupo Fármacos + Maypo + Dimesa'}</Mono>
        </div>
        <div style={{ position: 'absolute', left: x(2020) + 6, top: y(25) - 118, opacity: ease(f, quarter, quarter + 6, 0, 1), scale: ease(f, quarter, quarter + 12, 1.4, 1, easeBack), transformOrigin: 'left bottom' }}>
          <div style={{ fontFamily: SERIF_F, fontWeight: 800, fontSize: 96, lineHeight: 1, color: C.ink, fontVariantNumeric: 'lining-nums' }}>&lt; ¼</div>
          <Mono size={22} color={C.ink}>{lang === 'en' ? 'since 2020 · top 4' : 'desde 2020 · las 4 mayores'}</Mono>
        </div>
        {/* legend chips light up as each company is named */}
        <div style={{ position: 'absolute', left: X0, top: 94, display: 'flex', gap: 26 }}>
          {STACK.map((co) => {
            const at = names[co]
            const on = at !== undefined ? ease(f, at, at + 6, 0, 1) : 0
            return (
              <Mono key={co} size={24} color={C.ink} style={{ opacity: ease(f, era, era + 8, 0, 1) * (0.4 + 0.6 * on), scale: 1 + 0.12 * Math.sin(Math.PI * on), fontWeight: on > 0.5 ? 700 : 500 }}>
                <span style={{ display: 'inline-block', width: 18, height: 18, marginRight: 8, backgroundColor: CO_COLOR[co] }} />
                {co === 'gf' ? 'Grupo Fármacos' : NAMES[co].short}
              </Mono>
            )
          })}
        </div>
        <Mono size={20} style={{ position: 'absolute', left: X0, top: Y0 + 62 }}>
          {lang === 'en'
            ? 'Categories 1 and 20 (medicines) · IMSS only · 2004: no medicine records · 2002–2010: the thinnest records'
            : 'Categorías 1 y 20 (medicamentos) · solo IMSS · 2004: sin registros de medicamentos · 2002–2010: los registros más pobres'}
        </Mono>
      </AbsoluteFill>
      {/* end card — a paper disc opens from the centre */}
      <AbsoluteFill
        style={{
          backgroundColor: C.bg,
          clipPath: `circle(${ease(f, card, card + 22, 0, 120)}% at 50% 50%)`,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: 34,
        }}
      >
        {STACK.map((co, i) => (
          <div key={co} style={{ position: 'absolute', left: 960 - 470 + i * 0, top: 540 - 470, width: 940, height: 940, borderRadius: '50%', border: `${6 - i}px solid ${CO_COLOR[co]}`, scale: ease(f, card + 4 + i * 4, card + 30 + i * 4, 0.3, 1 - i * 0.08, easeBack), opacity: 0.55 }} />
        ))}
        {/* the locked mark renders its final (reduced-motion) state: CSS keyframes don't render frame-accurately */}
        <style>{'.relevo-end .rb-file *{animation:none!important}'}</style>
        <div className="relevo-end" style={{ color: C.ink, ['--color-risk-critical' as string]: C.salud }}>
          <RubliLogoMark size={120} />
        </div>
        <div style={{ fontFamily: SERIF_F, fontWeight: 800, fontSize: 140, color: C.ink, lineHeight: 1, scale: ease(f, card + 8, card + 20, 1.2, 1, easeBack) }}>{T.title[lang]}</div>
        <div style={{ fontFamily: MONO_F, fontSize: 30, color: C.dim, maxWidth: 1500, textAlign: 'center' }}>{T.source[lang]}</div>
      </AbsoluteFill>
    </Paper>
  )
}

export const End = scene(EndInner, 'End')
