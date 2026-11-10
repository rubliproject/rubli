/**
 * /_dev/patterns — the kit's six patterns (DESIGN.md § Patrones), each with its one meaning,
 * plus one composite figure. Dev builds only (App.tsx registers it under import.meta.env.DEV).
 * The composite uses SAMPLE values, labelled as such; it is a specimen, not a finding.
 */
import { useId, useRef, type ReactNode } from 'react'
import { useMeasuredWidth } from '@/hooks/useMeasuredWidth'
import { DocHead } from '@/components/contrato/DocHead'
import { useLang } from '@/components/contrato/nav'
import { Foco, PATTERN_MEANING, PatternDefs, PatternSwatch, SexenioBands, patUrl, type PatternKind } from '@/components/kit/patterns/Patterns'
import { setEdition, useEdition } from '@/lib/theme'
import '@/components/contrato/contrato.css'
import '@/components/kit/kit.css'

type Key = keyof typeof PATTERN_MEANING
const W = 320, H = 96

const RULE: Record<Key, { es: string; en: string }> = {
  'sin-dato': { es: 'Rellena la marca que no tiene valor o no tiene clase. Nunca un tono de rampa.', en: 'Fills the mark that has no value or no class. Never a ramp tone.' },
  estimado: { es: 'Sobre la marca cuyo valor es estimado o de una fuente débil (Estructura A, 2002–2010).', en: 'On the mark whose value is estimated or weakly sourced (Structure A, 2002–2010).' },
  consolidada: { es: 'Solo el tramo comprado de forma consolidada (una compra para varias dependencias).', en: 'Only the slice bought as a consolidated purchase (one purchase for several agencies).' },
  campo: { es: 'Fondo detrás del área del gráfico. No es dato: nunca dentro de una marca.', en: 'Background behind the plot area. Not data: never inside a mark.' },
  foco: { es: 'Un solo foco por figura, sobre el hallazgo que nombra la frase.', en: 'One focus per figure, on the finding the sentence names.' },
  sexenio: { es: 'Bandas por sexenio detrás de un eje de años; un tono por medio, de Fox en adelante.', en: 'Term bands behind a year axis; every other term tinted, from Fox on.' },
}

function Specimen({ k }: { k: Key }) {
  const uid = `pv${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const tile = k !== 'foco' && k !== 'sexenio'
  return (
    <svg width={W} height={H} role="img" aria-label={PATTERN_MEANING[k].es} className="block max-w-full">
      {tile && <PatternDefs uid={uid} kinds={[k as PatternKind]} />}
      {tile && <rect width={W} height={H} fill={patUrl(uid, k as PatternKind)} />}
      {k === 'foco' && <><rect x={W / 2 - 3} y={H / 2 - 3} width={6} height={6} className="pat-i" /><Foco cx={W / 2} cy={H / 2} r={40} /></>}
      {k === 'sexenio' && <SexenioBands x={(y) => ((y - 2002) / 24) * W} y={0} height={H} from={2002} to={2025} />}
    </svg>
  )
}

/** Composite: sample bars 2002–2025 with every pattern in its one job. */
function Composite({ en }: { en: boolean }) {
  // drawn at its rendered width (no viewBox scaling), so every tile lands on whole pixels at 1× and 2×
  const ref = useRef<HTMLDivElement>(null)
  const w = useMeasuredWidth(ref)
  const uid = 'pvc', Y0 = 2002, N = 24, cw = Math.floor(w / N), PW = N * cw, PH = 160, top = 12
  const v = [3, 4, 3, 5, 4, 6, 7, 6, 8, 7, 9, 8, 10, 11, 0, 9, 10, 12, 11, 13, 16, 12, 14, 13]
  const x = (y: number) => (y - Y0) * cw
  const h = (n: number) => Math.round((n / 16) * PH)
  const base = top + PH
  const peak = v.indexOf(Math.max(...v))
  if (!w) return <div ref={ref} style={{ height: base + 28 }} />
  return (
    <div ref={ref}>
    <svg width={PW} height={base + 28} role="img" aria-label={en ? 'Sample figure using every pattern' : 'Figura de muestra con cada patrón'} className="block">
      <PatternDefs uid={uid} />
      <rect x={0} y={top} width={PW} height={PH} fill={patUrl(uid, 'campo')} />
      <SexenioBands x={x} y={top} height={PH} from={Y0} to={Y0 + N - 1} />
      {v.map((n, i) => {
        const y = Y0 + i, bx = x(y) + Math.round(cw * 0.2), bw = cw - 2 * Math.round(cw * 0.2)
        if (n === 0) return <rect key={y} x={bx} y={top} width={bw} height={PH} fill={patUrl(uid, 'sin-dato')} />
        const weak = y <= 2010
        const cons = y >= 2019 ? Math.round(n * 0.35) : 0
        return (
          <g key={y}>
            <rect x={bx} y={base - h(n)} width={bw} height={h(n)} fill={weak ? patUrl(uid, 'estimado') : 'var(--color-text-primary)'} stroke={weak ? 'var(--color-text-primary)' : undefined} strokeWidth={weak ? 1 : undefined} />
            {cons > 0 && <rect x={bx} y={base - h(n)} width={bw} height={h(cons)} fill="var(--color-background)" />}
            {cons > 0 && <rect x={bx} y={base - h(n)} width={bw} height={h(cons)} fill={patUrl(uid, 'consolidada')} stroke="var(--color-text-primary)" strokeWidth={1} />}
          </g>
        )
      })}
      <Foco cx={x(Y0 + peak) + cw / 2} cy={base - h(v[peak])} r={22} />
      <line x1={0} x2={PW} y1={base} y2={base} stroke="var(--color-text-primary)" />
      {[2002, 2007, 2013, 2019, 2025].map((y) => <text key={y} x={y === 2002 ? 0 : y === 2025 ? PW : x(y) + cw / 2} y={base + 18} textAnchor={y === 2002 ? 'start' : y === 2025 ? 'end' : 'middle'} className="kf-mono" fill="var(--color-text-muted)" fontSize={12}>{y}</text>)}
    </svg>
    </div>
  )
}

export default function DevPatterns() {
  const lang = useLang()
  const en = lang === 'en'
  const ed = useEdition()
  const L = (es: string, e: string) => (en ? e : es)
  const card = (k: Key, swatch: ReactNode) => (
    <li key={k} className="min-w-0 border-t border-border pt-3">
      <Specimen k={k} />
      <p className="mt-3 flex items-baseline gap-2" style={{ font: '600 15px/1.35 var(--font-serif)' }}>
        {swatch}<span>{en ? PATTERN_MEANING[k].en : PATTERN_MEANING[k].es}</span>
        <code className="kf-mono ml-auto">{k}</code>
      </p>
      <p className="kf-mono mt-1">{en ? RULE[k].en : RULE[k].es}</p>
    </li>
  )
  return (
    <article className="ct ct-page ct-sheet">
      <div className="ct-wrap pb-12">
        <DocHead
          trail={[{ label: L('Patrones', 'Patterns') }]}
          meta={L('Interno · kit/patterns · un patrón, un significado', 'Internal · kit/patterns · one pattern, one meaning')}
          actions={<button type="button" className="ct-chip" aria-pressed={ed === 'night'} onClick={() => setEdition(ed === 'night' ? 'day' : 'night')}>{ed === 'night' ? L('Día', 'Day') : L('Noche', 'Night')}</button>}
        />
        <ul className="mt-6 grid list-none gap-x-12 gap-y-8 p-0 md:grid-cols-2 xl:grid-cols-3">
          {(['sin-dato', 'estimado', 'consolidada', 'campo'] as const).map((k) => card(k, <PatternSwatch kind={k} />))}
          {card('foco', null)}
          {card('sexenio', null)}
        </ul>
        <section className="mt-10 border-t border-border pt-3" aria-labelledby="pv-comp">
          <h2 id="pv-comp" className="ct-h2">{L('Juntos, cada uno en su papel', 'Together, each in its one job')}</h2>
          <p className="kf-mono mt-1">{L('Valores de muestra. Campo detrás · bandas por sexenio · 2002–2010 estimado · un año sin dato · tramo consolidado desde 2019 · foco en el máximo.', 'Sample values. Field behind · term bands · 2002–2010 estimated · one year with no data · consolidated slice from 2019 · focus on the peak.')}</p>
          <div className="mt-4 max-w-[760px]"><Composite en={en} /></div>
        </section>
      </div>
    </article>
  )
}
