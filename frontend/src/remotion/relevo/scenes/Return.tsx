/**
 * Beat 8 · return — the PISA name slams in; chart 8: PISA's contracts per year 2002–2025 climb
 * to 19.5 B, just under Grupo Fármacos's 2017 marker (19.9, unspoken); chart 9: a donut of who
 * bought from PISA in 2025 builds, 71% of it IMSS.
 */
import { evolvePath } from '@remotion/paths'
import { Pie } from '@remotion/shapes'
import { AbsoluteFill, Easing, useCurrentFrame } from 'remotion'
import { C, CO_COLOR, CO_WASH, GF_PEAK, IMSS_COLOR, IMSS_WASH, PISA_BUYERS, PISA_YEARS, T } from '../data'
import { punch } from '../fx'
import { Hero, MONO_F, Mono, NamePlate, Paper, SERIF_F, ease, easeBack, useFonts } from '../kit'
import { scene, type SceneProps } from '../scene'
import { cue } from '../timing'

const X0 = 170
const X1 = 1130
const Y0 = 780
const Y1 = 330 // 22 B
const x = (yr: number) => X0 + ((yr - 2002) / 23) * (X1 - X0)
const y = (b: number) => Y0 - (b / 22) * (Y0 - Y1)
const LINE = 'M ' + PISA_YEARS.map(([yr, b]) => `${x(yr)},${y(b)}`).join(' L ')
const END = [x(2025), y(19.46)] as const
const DX = 1530
const DY = 500
const DR = 210
const TOTAL = PISA_BUYERS.reduce((a, b) => a + b.v, 0)
const FILL = [IMSS_COLOR, 'rgba(109,40,217,0.45)', C.ink, C.rule]

const ReturnInner: React.FC<SceneProps> = ({ lang }) => {
  const f = useCurrentFrame()
  const ready = useFonts()
  if (!ready) return <Paper />
  const grow = cue(lang, 'return', { en: 'By', es: 'Para' })
  const num = cue(lang, 'return', { en: '19.5', es: '19,500' })
  const near = cue(lang, 'return', { en: 'nearly', es: 'casi' })
  const draw = ease(f, 8, grow, 0, 0.9, Easing.inOut(Easing.quad)) + ease(f, grow, num, 0, 0.1, Easing.in(Easing.cubic))
  let start = 0
  return (
    <Paper>
      <AbsoluteFill style={{ scale: punch(f, num, 1.07) }}>
        <div style={{ position: 'absolute', left: DX - 330, top: DY - 330, width: 660, height: 660, borderRadius: '50%', backgroundColor: IMSS_WASH, scale: ease(f, near - 8, near + 10, 0.6, 1, easeBack), opacity: ease(f, near - 8, near, 0, 1) }} />
        <div style={{ position: 'absolute', left: -120, top: 640, width: 420, height: 420, borderRadius: '50%', backgroundColor: CO_WASH.pisa, scale: ease(f, 0, 18, 0.6, 1, easeBack) }} />
        <NamePlate co="pisa" width={1640} cap={84} style={{ position: 'absolute', left: 140, top: 46, scale: ease(f, 0, 14, 2.2, 1, easeBack), opacity: ease(f, 0, 4, 0, 1) }} />
        <Mono size={24} style={{ position: 'absolute', left: X0, top: 196 }}>
          {lang === 'en' ? 'Laboratorios PISA · federal contracts per year · B MXN' : 'Laboratorios PISA · contratos federales por año · mil millones'}
        </Mono>
        <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
          {[0, 5, 10, 15, 20].map((v) => (
            <g key={v} opacity={ease(f, 6, 16, 0, 1)}>
              <line x1={X0} x2={X1} y1={y(v)} y2={y(v)} stroke={v === 0 ? C.ink : C.rule} strokeWidth={v === 0 ? 3 : 2} />
              <text x={X0 - 12} y={y(v) + 8} textAnchor="end" fontFamily={MONO_F} fontSize={22} fill={C.dim}>
                {v}
              </text>
            </g>
          ))}
          {[2002, 2010, 2019, 2025].map((yr) => (
            <text key={yr} x={x(yr)} y={Y0 + 36} textAnchor="middle" fontFamily={MONO_F} fontSize={22} fill={C.dim} opacity={ease(f, 6, 16, 0, 1)}>
              {yr}
            </text>
          ))}
          {/* Grupo Fármacos's 2017 — the marker the line climbs toward */}
          <line x1={X0} x2={X1 + 20} y1={y(GF_PEAK)} y2={y(GF_PEAK)} stroke={CO_COLOR.gf} strokeWidth={3} strokeDasharray="12 10" opacity={ease(f, 10, 20, 0, 1)} />
          <text x={X0 + 6} y={y(GF_PEAK) - 12} fontFamily={MONO_F} fontSize={24} fill={C.dim} opacity={ease(f, 10, 20, 0, 1)}>
            {T.gf2017[lang]}
          </text>
          <path d={LINE} fill="none" stroke={CO_COLOR.pisa} strokeWidth={7} strokeLinejoin="round" {...evolvePath(draw, LINE)} />
          <circle cx={END[0]} cy={END[1]} r={ease(f, num, num + 18, 10, 70)} fill="none" stroke={C.alert} strokeWidth={5} opacity={ease(f, num, num + 18, 1, 0)} />
          <circle cx={END[0]} cy={END[1]} r={12} fill={C.alert} stroke={C.ink} strokeWidth={2.5} opacity={f >= num ? 1 : 0} />
        </svg>
        <Hero at={num} size={96} color={CO_COLOR.pisa} scope={T.pisaScope[lang]} scopeSize={26} style={{ position: 'absolute', left: X0 + 40, top: 380, scale: ease(f, num, num + 10, 1.5, 1, easeBack), transformOrigin: 'left center' }}>
          {T.pisaHero[lang]}
        </Hero>

        {/* chart 9 — who bought from PISA in 2025 */}
        <Mono size={24} style={{ position: 'absolute', left: DX - DR, top: DY - DR - 70, opacity: ease(f, near - 6, near, 0, 1) }}>
          {lang === 'en' ? 'PISA 2025 · by buyer' : 'PISA 2025 · por comprador'}
        </Mono>
        {PISA_BUYERS.map((b, i) => {
          const share = b.v / TOTAL
          const s = start
          start += share
          const p = ease(f, near + i * 5, near + i * 5 + 16, 0, 1, Easing.out(Easing.cubic))
          return (
            <Pie
              key={b.key}
              radius={DR}
              progress={Math.max(0.0001, share * p)}
              rotation={s * Math.PI * 2}
              fill={FILL[i]}
              stroke={C.paperHi}
              strokeWidth={4}
              style={{ position: 'absolute', left: DX - DR, top: DY - DR, opacity: p > 0 ? 1 : 0 }}
            />
          )
        })}
        <div style={{ position: 'absolute', left: DX - 120, top: DY - 120, width: 240, height: 240, borderRadius: '50%', backgroundColor: C.bg, scale: ease(f, near, near + 12, 0.85, 1, easeBack), opacity: ease(f, near, near + 6, 0, 1), display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ fontFamily: SERIF_F, fontWeight: 800, fontSize: 84, color: IMSS_COLOR, lineHeight: 1, fontVariantNumeric: 'lining-nums' }}>71%</div>
          <Mono size={28} color={C.ink} style={{ fontWeight: 700 }}>IMSS</Mono>
        </div>
        {PISA_BUYERS.slice(1).map((b, i) => (
          <Mono key={b.key} size={22} style={{ position: 'absolute', left: DX - DR, top: DY + DR + 24 + i * 30, opacity: ease(f, near + 20 + i * 4, near + 26 + i * 4, 0, 1) }}>
            <span style={{ display: 'inline-block', width: 14, height: 14, marginRight: 10, backgroundColor: FILL[i + 1] }} />
            {b.label[lang]} · {Math.round((b.v / TOTAL) * 100)}%
          </Mono>
        ))}
      </AbsoluteFill>
    </Paper>
  )
}

export const Return = scene(ReturnInner, 'Return')
