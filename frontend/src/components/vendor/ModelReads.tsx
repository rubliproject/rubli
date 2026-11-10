/**
 * «Lo que lee el modelo», remade in the diagram language (owner 2026-11-04: «remake these with the graph and pattern
 * skills»; frontend/DESIGN.md §7.p; loved figures exp/explainer-c-diagram, exp/explainer-d-anatomy).
 *
 * SignalDiagram — one connected figure: 1 the signals the model reads (the few that matter, in plain words) →
 *   2 how much each weighs (connector thickness = share of the push; solid raises, dashed lowers) → 3 what the weights
 *   come from (documented cases) → 4 the indicator (its level on the 0–1 scale). Foco rings the strongest signal.
 *   Raw z / coefficients live in «Para especialistas» only.
 * ComparisonScales — one labelled scale per measure: «típico de su sector» (grey tick) vs «esta empresa» (ink tick),
 *   the multiple in words. sin-dato hatch on a measure with no base; foco on the largest multiple.
 * Drawn at the measured pixel width (no viewBox scaling: 12px type stays 12px, pattern tiles stay crisp).
 */
import { useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactElement } from 'react'
import { getRiskLevelFromScore, RISK_THRESHOLDS } from '@/lib/constants'
import { modelFeatureLabel } from '@/lib/model/featureLabels'
import { Foco, PatternSwatch } from '@/components/kit/patterns/Patterns'
import { WEIGHT_WORDS, multipleWords, pickSignals, sharePct, signalClaims, strongestScale, type Scale, type Signal, type Term } from '@/lib/vendor/modelReads'
import { formatCompactMXN, formatNumber } from '@/lib/utils'
import './modelreads.css'

type Lang = 'es' | 'en'
const LEVEL = { critical: { es: 'crítico', en: 'critical' }, high: { es: 'alto', en: 'high' }, medium: { es: 'medio', en: 'medium' }, low: { es: 'bajo', en: 'low' } } as const
const ZONES = [
  { lv: 'low', from: 0, to: RISK_THRESHOLDS.medium }, { lv: 'medium', from: RISK_THRESHOLDS.medium, to: RISK_THRESHOLDS.high },
  { lv: 'high', from: RISK_THRESHOLDS.high, to: RISK_THRESHOLDS.critical }, { lv: 'critical', from: RISK_THRESHOLDS.critical, to: 1 },
] as const

function useWidth<T extends HTMLElement>(initial = 640) {
  const ref = useRef<T>(null)
  const [w, setW] = useState(initial)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setW(Math.round(el.getBoundingClientRect().width) || initial)
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [initial])
  return [ref, w] as const
}

/** Greedy wrap by an estimated glyph width (Source Serif 13px ≈ 6.6px). */
function wrap(s: string, px: number, max = 2, cw = 6.6): string[] {
  const n = Math.max(8, Math.floor(px / cw))
  const out: string[] = []
  let line = ''
  for (const w of s.split(' ')) {
    if (line && (line + ' ' + w).length > n) { out.push(line); line = w } else line = line ? `${line} ${w}` : w
  }
  if (line) out.push(line)
  return out.length > max ? [...out.slice(0, max - 1), out.slice(max - 1).join(' ')] : out
}

const PITCH = 52, NODE_H = 44

export function SignalDiagram({ terms, score, nContracts, lang }: { terms: Term[]; score: number | null; nContracts: number | null; lang: Lang }) {
  const en = lang === 'en'
  const L = (es: string, e: string) => (en ? e : es)
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const [ref, W] = useWidth<HTMLDivElement>()
  const { up, down } = pickSignals(terms)
  const rows: Array<Signal & { dir: 'up' | 'down' }> = [...up.map((s) => ({ ...s, dir: 'up' as const })), ...(down ? [{ ...down, dir: 'down' as const }] : [])]
  if (!rows.length) return null
  const maxC = Math.max(...rows.map((r) => Math.abs(r.contribution)))
  const sw = (c: number) => Math.round((1.5 + 5.5 * (Math.abs(c) / maxC)) * 2) / 2
  const level = score != null ? getRiskLevelFromScore(score) : null
  const wide = W >= 640
  const arrow = `mr-ar-${uid}`
  const labelOf = (r: (typeof rows)[number]) => `${WEIGHT_WORDS[r.weight][r.dir][lang]} · ${sharePct(r.share, lang)}`
  const nameOf = (r: Signal) => (en ? r.en : r.es)
  const cases = L('Casos de corrupción ya documentados: de ellos aprendió el modelo cuánto pesa cada señal.', 'Documented corruption cases: the model learned from them how much each signal weighs.')
  const desc = signalClaims(terms, score, level).map((c) => (en ? c.en : c.es)).join(' ')

  // geometry
  const top = 24
  const n = rows.length
  const groupH = n * PITCH - (PITCH - NODE_H)
  let svg: ReactElement
  let H: number
  if (wide) {
    const a = Math.round(Math.min(320, Math.max(220, W * 0.34)) / 4) * 4
    const gapB = Math.round(Math.min(160, Math.max(116, W * 0.15)) / 4) * 4
    const x3 = a + gapB, w3 = Math.round(Math.min(200, Math.max(156, W * 0.2)) / 4) * 4
    const x4 = x3 + w3 + 56, w4 = Math.min(320, W - x4)
    const caseLines = wrap(cases, w3 - 24, 7, 6.2)
    const h3 = Math.max(groupH, 32 + caseLines.length * 16 + 12)
    const g0 = top + (h3 - groupH) / 2
    const mid = top + h3 / 2
    const h4 = 116
    H = top + Math.max(h3, h4) + 4
    const sx = (s: number) => x4 + 12 + Math.min(0.995, Math.max(0, s)) * (w4 - 24)
    svg = (
      <svg width={W} height={H} role="img" aria-labelledby={`${uid}-t ${uid}-d`}>
        <title id={`${uid}-t`}>{L('Lo que lee el modelo', 'What the model reads')}</title>
        <desc id={`${uid}-d`}>{desc}</desc>
        <defs>
          <marker id={arrow} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" markerUnits="userSpaceOnUse" orient="auto"><path d="M0,0 L8,4 L0,8 z" className="mr-ah" /></marker>
        </defs>
        <g aria-hidden="true">
          <text x={0} y={12} className="mr-col">1 · {L('Qué lee', 'What it reads')}</text>
          <text x={a + 8} y={12} className="mr-col">2 · {L('Cuánto pesa', 'How much it weighs')}</text>
          <text x={x3} y={12} className="mr-col">3 · {L('De dónde sale el peso', 'Where the weight comes from')}</text>
          <text x={x4} y={12} className="mr-col">4 · {L('El indicador', 'The indicator')}</text>
          {/* connectors first, nodes over them */}
          {rows.map((r, i) => {
            const y = g0 + i * PITCH + NODE_H / 2, w = sw(r.contribution), lab = labelOf(r)
            const lx = a + gapB / 2, lw = lab.length * 6.4 + 8
            return (
              <g key={`c${r.feature}`}>
                <line x1={a} y1={y} x2={x3 - 2} y2={y} className={r.dir === 'up' ? 'mr-cn' : 'mr-cn is-down'} strokeWidth={w} markerEnd={`url(#${arrow})`} />
                <rect x={lx - lw / 2} y={y - w / 2 - 22} width={lw} height={15} className="mr-mask" />
                <text x={lx} y={y - w / 2 - 10} textAnchor="middle" className={r.dir === 'up' ? 'mr-cl' : 'mr-cl is-down'}>{lab}</text>
              </g>
            )
          })}
          <line x1={x3 + w3} y1={mid} x2={x4 - 2} y2={mid} className="mr-cn" strokeWidth={1.5} markerEnd={`url(#${arrow})`} />
          <rect x={x3 + w3 + 6} y={mid - 22} width={44} height={15} className="mr-mask" />
          <text x={x3 + w3 + 28} y={mid - 10} textAnchor="middle" className="mr-cl">{L('da', 'gives')}</text>
          {rows.map((r, i) => {
            const y = g0 + i * PITCH
            const lines = wrap(nameOf(r), a - 20)
            return (
              <g key={r.feature}>
                <rect x={0.5} y={y + 0.5} width={a - 1} height={NODE_H - 1} rx={2} className={`mr-node${i === 0 ? ' is-focal' : ''}${r.dir === 'down' ? ' is-down' : ''}`} />
                {lines.map((t, j) => <text key={j} x={10} y={y + (lines.length === 1 ? 27 : 19 + j * 16)} className="mr-why">{t}</text>)}
              </g>
            )
          })}
          <rect x={x3 + 0.5} y={top + 0.5} width={w3 - 1} height={h3 - 1} rx={2} className="mr-node" />
          {caseLines.map((t, j) => <text key={j} x={x3 + 12} y={mid - (caseLines.length * 16) / 2 + 12 + j * 16} className="mr-body">{t}</text>)}
          <rect x={x4 + 0.5} y={mid - h4 / 2 + 0.5} width={w4 - 1} height={h4 - 1} rx={2} className="mr-node" />
          {score != null && level ? (
            <>
              <text x={x4 + 12} y={mid - h4 / 2 + 24} className="mr-lab">{L('Indicador de riesgo', 'Risk indicator')}</text>
              <text x={x4 + 12} y={mid - h4 / 2 + 48} className="mr-score">{score.toFixed(2)}<tspan dx={8} className={`mr-lv is-${level}`}>{L(LEVEL[level].es, LEVEL[level].en)}</tspan></text>
              {ZONES.map((z) => <rect key={z.lv} x={sx(z.from)} y={mid + 4} width={sx(z.to) - sx(z.from)} height={8} className={`mr-zone is-${z.lv}`} />)}
              <line x1={sx(score)} x2={sx(score)} y1={mid - 2} y2={mid + 18} className={`mr-ndl is-${level}`} />
              {nContracts ? <text x={x4 + 12} y={mid + h4 / 2 - 14} className="mr-meta">{L(`promedio de ${formatNumber(nContracts)} contratos`, `mean of ${formatNumber(nContracts)} contracts`)}</text> : null}
            </>
          ) : <text x={x4 + 12} y={mid + 4} className="mr-meta">{L('sin indicador', 'no indicator')}</text>}
          <Foco cx={a} cy={g0 + NODE_H / 2} r={18} />
        </g>
      </svg>
    )
  } else {
    // phone: the signals stack; each one's left rule is its connector stub (thickness = weight), then the flow runs down
    const rowH = 56
    const g0 = top
    const y3 = g0 + n * rowH + 28
    const caseLines = wrap(cases, W - 24, 4, 6.2)
    const h3 = 24 + caseLines.length * 16
    const y4 = y3 + h3 + 32
    const h4 = 92
    H = y4 + h4 + 4
    const w0 = sw(rows[0].contribution) // the focal row's stub: the foco sits on it, left of the words
    const sx = (s: number) => 12 + Math.min(0.995, Math.max(0, s)) * (W - 24)
    svg = (
      <svg width={W} height={H} role="img" aria-labelledby={`${uid}-t ${uid}-d`}>
        <title id={`${uid}-t`}>{L('Lo que lee el modelo', 'What the model reads')}</title>
        <desc id={`${uid}-d`}>{desc}</desc>
        <defs>
          <marker id={arrow} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" markerUnits="userSpaceOnUse" orient="auto"><path d="M0,0 L8,4 L0,8 z" className="mr-ah" /></marker>
        </defs>
        <g aria-hidden="true">
          <text x={0} y={12} className="mr-col">1 · {L('Qué lee y cuánto pesa', 'What it reads and how much it weighs')}</text>
          {rows.map((r, i) => {
            const y = g0 + i * rowH, w = sw(r.contribution)
            const lines = wrap(nameOf(r), W - 48)
            return (
              <g key={r.feature}>
                <rect x={0.5} y={y + 0.5} width={W - 1} height={rowH - 9} rx={2} className={`mr-node${i === 0 ? ' is-focal' : ''}${r.dir === 'down' ? ' is-down' : ''}`} />
                <line x1={w / 2 + 1} x2={w / 2 + 1} y1={y + 1} y2={y + rowH - 9} className={r.dir === 'up' ? 'mr-cn' : 'mr-cn is-down'} strokeWidth={w} />
                {lines.map((t, j) => <text key={j} x={24} y={y + 18 + j * 15} className="mr-why">{t}</text>)}
                <text x={W - 10} y={y + rowH - 15} textAnchor="end" className={r.dir === 'up' ? 'mr-cl' : 'mr-cl is-down'}>{labelOf(r)}</text>
              </g>
            )
          })}
          <line x1={W / 2} y1={g0 + n * rowH - 6} x2={W / 2} y2={y3 - 2} className="mr-cn" strokeWidth={1.5} markerEnd={`url(#${arrow})`} />
          <text x={W / 2 + 10} y={y3 - 12} className="mr-cl">{L('se pesa con', 'weighed by')}</text>
          <rect x={0.5} y={y3 + 0.5} width={W - 1} height={h3 - 1} rx={2} className="mr-node" />
          {caseLines.map((t, j) => <text key={j} x={12} y={y3 + 20 + j * 16} className="mr-body">{t}</text>)}
          <line x1={W / 2} y1={y3 + h3} x2={W / 2} y2={y4 - 2} className="mr-cn" strokeWidth={1.5} markerEnd={`url(#${arrow})`} />
          <text x={W / 2 + 10} y={y4 - 12} className="mr-cl">{L('da', 'gives')}</text>
          <rect x={0.5} y={y4 + 0.5} width={W - 1} height={h4 - 1} rx={2} className="mr-node" />
          {score != null && level ? (
            <>
              <text x={12} y={y4 + 26} className="mr-score">{score.toFixed(2)}<tspan dx={8} className={`mr-lv is-${level}`}>{L(LEVEL[level].es, LEVEL[level].en)}</tspan></text>
              {ZONES.map((z) => <rect key={z.lv} x={sx(z.from)} y={y4 + 44} width={sx(z.to) - sx(z.from)} height={8} className={`mr-zone is-${z.lv}`} />)}
              <line x1={sx(score)} x2={sx(score)} y1={y4 + 38} y2={y4 + 58} className={`mr-ndl is-${level}`} />
              <text x={W - 12} y={y4 + 24} textAnchor="end" className="mr-lab">{L('Indicador de riesgo', 'Risk indicator')}</text>
              {nContracts ? <text x={12} y={y4 + 78} className="mr-meta">{L(`promedio de ${formatNumber(nContracts)} contratos`, `mean of ${formatNumber(nContracts)} contracts`)}</text> : null}
            </>
          ) : <text x={12} y={y4 + 40} className="mr-meta">{L('sin indicador', 'no indicator')}</text>}
          <Foco cx={w0 / 2 + 1} cy={g0 + 14} r={9} />
        </g>
      </svg>
    )
  }

  return (
    <figure className="mr-fig" ref={ref}>
      {svg}
      {/* the words twin for screen readers and text search */}
      <ul className="sr-only">
        {rows.map((r) => <li key={r.feature}>{nameOf(r)}: {labelOf(r)}</li>)}
      </ul>
    </figure>
  )
}

/** The raw terms, for specialists: plain name · model term · z · coefficient · push. */
export function SpecialistTerms({ terms, basis, lang }: { terms: Term[]; basis: string | null; lang: Lang }) {
  const en = lang === 'en'
  const sorted = [...terms].sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
  return (
    <details className="mr-spec">
      <summary>{en ? `For specialists: the model's ${terms.length} terms` : `Para especialistas: los ${terms.length} términos del modelo`}</summary>
      <table className="mr-spec-t">
        <caption className="sr-only">{en ? 'Model terms: z-score, coefficient and contribution' : 'Términos del modelo: z, coeficiente y aporte'}</caption>
        <thead><tr><th scope="col">{en ? 'Term' : 'Término'}</th><th scope="col">z</th><th scope="col">{en ? 'coef.' : 'coef.'}</th><th scope="col">{en ? 'push' : 'aporte'}</th></tr></thead>
        <tbody>
          {sorted.map((t) => (
            <tr key={t.feature}>
              <th scope="row">{modelFeatureLabel(t.feature, lang) ?? t.feature}</th>
              <td>{t.z_score.toFixed(2)}</td><td>{t.coefficient.toFixed(3)}</td><td>{Math.abs(t.contribution) < 0.0005 ? '0.000' : `${t.contribution > 0 ? '+' : ''}${t.contribution.toFixed(3)}`}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="ct-note">{en
        ? `z = how far the vendor's mean sits from the baseline; push = z × coefficient, in log-odds before calibration${basis ? `; ${basis}` : ''}.`
        : `z = qué tan lejos queda su promedio de la referencia; aporte = z × coeficiente, en log-momios antes de calibrar${basis ? `; ${basis}` : ''}.`}</p>
    </details>
  )
}

// ── comparison scales ─────────────────────────────────────────────────────────────────────────────────────────────
const fmt = (s: Scale, v: number, lang: Lang) => (s.kind === 'mxn' ? formatCompactMXN(v) : s.kind === 'score' ? v.toFixed(2) : lang === 'es' ? `${Math.round(v)} %` : `${Math.round(v)}%`)
const domain = (s: Scale) => (s.kind === 'pct' ? 100 : s.kind === 'score' ? 1 : Math.max(s.value ?? 0, s.typical ?? 0, 1) * 1.1)

export function ComparisonScales({ scales, sectorName, lang }: { scales: Scale[]; sectorName: string | null; lang: Lang }) {
  const en = lang === 'en'
  if (!scales.length) return <p className="ct-note">{en ? 'No rates on record.' : 'Sin tasas en el registro.'}</p>
  const foco = strongestScale(scales)
  const hasEmpty = scales.some((s) => s.value == null)
  return (
    <div className="mr-sc">
      <p className="mr-key">
        <span><i className="mr-k is-typ" aria-hidden="true" />{en ? `typical of its sector${sectorName ? ` (${sectorName})` : ''}` : `típico de su sector${sectorName ? ` (${sectorName})` : ''}`}</span>
        <span><i className="mr-k is-this" aria-hidden="true" />{en ? 'this company' : 'esta empresa'}</span>
        {scales.some((s) => s.ref) && <span><i className="mr-k is-ref" aria-hidden="true" />{en ? 'EU line (10%)' : 'línea UE (10 %)'}</span>}
        {foco && <span><i className="mr-k is-foco" aria-hidden="true" />{en ? 'rings: the widest gap' : 'anillos: la mayor diferencia'}</span>}
        {hasEmpty && <span><PatternSwatch kind="sin-dato" /> {en ? 'no data' : 'sin dato'}</span>}
      </p>
      <ul className="mr-sc-list">
        {scales.map((s) => {
          const D = domain(s)
          const p = (v: number) => `${Math.min(100, Math.max(0, (v / D) * 100))}%`
          const words = multipleWords(s, lang)
          const typTxt = s.typical == null ? null : s.typicalIs === 'all'
            ? (en ? `all contracts ${fmt(s, s.typical, lang)}` : `todos los contratos ${fmt(s, s.typical, lang)}`)
            : (en ? `typical ${fmt(s, s.typical, lang)}` : `típico ${fmt(s, s.typical, lang)}`)
          const over = s.ratio != null && s.ratio >= 1.15
          return (
            <li key={s.key} className="mr-sc-row">
              <span className="mr-sc-nm">{en ? s.en : s.es}</span>
              <span className={s.value == null ? 'mr-sc-trk pat-sin-dato' : 'mr-sc-trk'} aria-hidden="true">
                {s.value != null && s.typical != null && (
                  <i className={over ? 'mr-sc-gap is-over' : 'mr-sc-gap'} style={{ left: p(Math.min(s.value, s.typical)), width: `calc(${p(Math.max(s.value, s.typical))} - ${p(Math.min(s.value, s.typical))})` }} />
                )}
                {s.ref && <i className="mr-sc-ref" style={{ left: p(s.ref.at) }} />}
                {s.typical != null && <i className="mr-sc-typ" style={{ left: p(s.typical) }} />}
                {s.value != null && <i className="mr-sc-this" style={{ left: p(s.value) }} />}
                {foco?.key === s.key && s.value != null && <i className="mr-sc-foco pat-foco" style={{ left: p(s.value) } as CSSProperties} />}
              </span>
              <span className="mr-sc-v">
                {s.value != null && <b>{fmt(s, s.value, lang)}</b>}
                <span className={over ? 'is-ink' : undefined}>{words}</span>
                {typTxt && s.value != null && <small>{typTxt}</small>}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
