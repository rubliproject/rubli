/**
 * IpsLedger — «Cómo se suma la prioridad»: the IPS as a ruled decomposition (owner 2026-10-28,
 * «the flagged bar charts can be done way better»; FLAG_METHODOLOGY_REVIEW_2026-10-28 § 3 A1).
 *
 * One 0–1 rule: the four weighted parts laid end to end (part-to-whole of the sum), the tier
 * thresholds 0.40 / 0.60 / 0.80 marked on the rule, the total where the parts end, and the
 * false-positive discount hatched back from it. Under the rule, one ruled row per input with its
 * honest name, value, weight and contribution; every name defines itself on hover and focus.
 * R takes the larger of the risk indicator and the most unusual contract (Mahalanobis), so both
 * rows print and the one that did not count says so — Mahalanobis drives most of tier 3.
 * Replaces AporteBar and the RayosX component bars. Ink shades only: the IPS is an order, not risk.
 */
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import type { AriaQueueItem } from '@/api/types'
import { aporte, aporteSentence, inferMaha, SCALE_CEILING, type AporteKey } from '@/components/aria/disposition'
import { formatCompactMXN } from '@/lib/utils'
import { PATTERN_COLORS } from '@/lib/constants'
import { PATTERN_DEFS, patternName } from '@/lib/aria/patterns'

type Lang = 'en' | 'es'
type Item = Pick<AriaQueueItem, 'ips_final' | 'ips_tier' | 'fp_penalty' | 'total_value_mxn' | 'risk_score_norm' | 'ensemble_norm' | 'financial_scale_norm' | 'external_flags_score'> & {
  ips_raw?: number
  mahalanobis_norm?: number | null
}

const TIERS: [number, string][] = [[0.4, '3'], [0.6, '2'], [0.8, '1']]
/** Ink share per slot (primary ink mixed into the paper): identity rides on the rows, not hue. */
const SHADE: Record<AporteKey, number> = { R: 100, A: 66, X: 42, $: 22 }
const shade = (k: AporteKey) => `color-mix(in srgb, var(--color-text-primary) ${SHADE[k]}%, var(--color-background))`

const DEF: Record<'risk' | 'maha' | 'A' | 'X' | '$' | 'fp', { es: string; en: string }> = {
  risk: {
    es: 'El indicador de riesgo medio de sus contratos, ×1.2 (tope 1). El IPS toma el mayor entre este y el contrato más inusual.',
    en: 'The mean risk indicator of its contracts, ×1.2 (capped at 1). The IPS takes the larger of this and the most unusual contract.',
  },
  maha: {
    es: 'Qué tan raro es su contrato más raro frente a su sector, en 16 dimensiones a la vez (distancia de Mahalanobis). Es lo que sube a casi todo el nivel 3.',
    en: 'How unusual its most unusual contract is against its sector, across 16 dimensions at once (Mahalanobis distance). It is what lifts most of tier 3.',
  },
  A: {
    es: 'El indicador de riesgo de una versión anterior del modelo (v5.2, mar–may 2026), promediado por sector. No es una medida de anomalía.',
    en: 'An earlier model version’s risk indicator (v5.2, Mar–May 2026), averaged by sector. It is not an anomaly measure.',
  },
  X: {
    es: '1.00 si está vinculado a un caso de RUBLI, documentado o sin verificar; si no, suma EFOS definitivo (0.70), sanción de la SFP (0.40) y señales de empresa fachada (hasta 0.25).',
    en: '1.00 when linked to a RUBLI case, documented or unverified; otherwise it adds definitive EFOS (0.70), an SFP sanction (0.40) and shell-company signals (up to 0.25).',
  },
  $: {
    es: `Logaritmo del monto total del proveedor (log₁₀ ÷ 30). Casi no varía: va de 0 a ${SCALE_CEILING.toFixed(2)} y nunca llega a 1.`,
    en: `Log of the vendor’s total amount (log₁₀ ÷ 30). It barely varies: it runs from 0 to ${SCALE_CEILING.toFixed(2)} and never reaches 1.`,
  },
  fp: {
    es: 'Descuento por patentes y licencias, errores de captura o monopolios estructurales.',
    en: 'Discount for patents and licences, data-entry errors or structural monopolies.',
  },
}

/** A name that defines itself on hover and on keyboard focus; Escape hides the definition
 *  (WCAG 1.4.13), the pointer can rest on it, and it is announced once (as the description). */
function Term({ def, children }: { def: string; children: ReactNode }) {
  const id = useId()
  const wrap = useRef<HTMLSpanElement>(null)
  const [hidden, setHidden] = useState(false)
  useEffect(() => {
    if (hidden) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && wrap.current?.matches(':hover, :focus-within')) setHidden(true) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [hidden])
  return (
    <span ref={wrap} className={hidden ? 'ipl-tw is-hid' : 'ipl-tw'} onMouseLeave={() => setHidden(false)} onBlur={() => setHidden(false)}>
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- focus reveals the definition */}
      <dfn className="ipl-term" tabIndex={0} aria-describedby={id}>{children}</dfn>
      <span role="tooltip" id={id} className="ipl-tip">{def}</span>
    </span>
  )
}

const f2 = (n: number) => n.toFixed(2)

export function IpsLedger({ item, lang, sentence = true }: { item: Item; lang: Lang; sentence?: boolean }) {
  const en = lang === 'en'
  const L = (es: string, e: string) => (en ? e : es)
  // the list rows lack mahalanobis_norm: infer it from ips_raw, never mislabel which input counted
  const mh = inferMaha(item)
  const slots = aporte({ ...item, mahalanobis_norm: mh.value })
  const fp = Math.max(0, item.fp_penalty ?? 0)
  const raw = slots.reduce((s, x) => s + x.contrib, 0)
  const total = item.ips_final
  const risk = Math.max(0, Math.min(1, item.risk_score_norm ?? 0))
  const maha = mh.value
  const tie = maha != null && Math.abs(maha - risk) < 0.005
  const R = slots[0]
  // tier above what the sum reaches (the EFOS floor puts every definitive EFOS in tier ≤ 2)
  const byRule = total < (TIERS.find(([, t]) => t === String(item.ips_tier))?.[0] ?? 0)
  const pctOf = (x: number) => `${Math.max(0, Math.min(100, x * 100))}%`

  const label = `${L('Prioridad', 'Priority')} ${f2(total)} = ` +
    slots.map((s) => `${en ? s.en : s.es} ${f2(s.contrib)}`).join(' + ') +
    (fp > 0 ? ` − ${L('descuento', 'discount')} ${f2(fp)}` : '') +
    ` · ${L('nivel', 'tier')} ${item.ips_tier}; ${L('umbrales', 'thresholds')} 0.40 / 0.60 / 0.80`

  let at = 0
  const row = (key: string, swatch: AporteKey | null, name: ReactNode, value: string, weight: string, contrib: string, muted = false, note: string | null = null) => (
    <tr key={key} className={muted ? 'is-off' : undefined}>
      <th scope="row">
        <i className="ipl-sw" aria-hidden="true" style={swatch ? { background: shade(swatch) } : undefined} />
        {name}
        {note && <small className="ipl-note"> · {note}</small>}
      </th>
      <td className="num">{value}</td>
      <td className="num">{weight}</td>
      <td className="num">{contrib}</td>
    </tr>
  )

  return (
    <figure className="ipl">
      <figcaption className="ipl-cap">
        <span>{L('Cómo se suma la prioridad', 'How the priority adds up')}</span>
        <b>{f2(total)} · {L('nivel', 'tier')} {item.ips_tier}</b>
      </figcaption>

      <div className="ipl-rule" role="img" aria-label={label}>
        {TIERS.map(([x, t]) => (
          <span key={t} className="ipl-th" style={{ left: pctOf(x) }} aria-hidden="true"><small>{L('N', 'T')}{t}</small></span>
        ))}
        <div className="ipl-track" aria-hidden="true">
          {slots.map((s) => {
            const left = at
            at += s.contrib
            return s.contrib > 0.0005 ? (
              <span key={s.key} className={left + s.contrib / 2 > 0.5 ? 'ipl-seg is-r' : 'ipl-seg'} style={{ left: pctOf(left), width: pctOf(s.contrib), background: shade(s.key) }}>
                <span className="ipl-tip">{en ? s.en : s.es} · {f2(s.value)} × {f2(s.weight)} = {f2(s.contrib)}</span>
              </span>
            ) : null
          })}
          {fp > 0 && <span className="ipl-fp" style={{ left: pctOf(Math.max(0, raw - fp)), width: pctOf(Math.min(fp, raw)) }} />}
          <span className="ipl-total" style={{ left: pctOf(total) }} />
        </div>
        <div className="ipl-axis" aria-hidden="true"><span>0</span><span>1</span></div>
      </div>

      <table className="ct-table ipl-tab">
        <caption className="sr-only">{L('Componentes de la prioridad', 'Components of the priority')}</caption>
        <thead>
          <tr>
            <th scope="col">{L('Componente', 'Component')}</th>
            <th scope="col" className="num">{L('valor', 'value')}</th>
            <th scope="col" className="num">{L('peso', 'weight')}</th>
            <th scope="col" className="num">{L('aporte', 'adds')}</th>
          </tr>
        </thead>
        <tbody>
          {row('risk', R.src === 'risk' ? 'R' : null,
            <Term def={DEF.risk[lang]}>{L('Indicador de riesgo', 'Risk indicator')}</Term>,
            risk >= 1 ? L('tope', 'at cap') : f2(risk), '× 0.40', R.src === 'risk' ? f2(R.contrib) : L('no cuenta', 'not counted'), R.src !== 'risk')}
          {row('maha', R.src === 'maha' ? 'R' : null,
            <Term def={DEF.maha[lang]}>{L('Contrato más inusual', 'Most unusual contract')}</Term>,
            maha == null ? '—' : f2(Math.max(0, Math.min(1, maha))), '× 0.40',
            R.src === 'maha' ? f2(R.contrib) : tie ? L('empata', 'tie') : maha == null && item.ips_raw == null ? '—' : L('no cuenta', 'not counted'),
            R.src !== 'maha', mh.inferred ? L('deducido del IPS', 'derived from the IPS') : null)}
          {slots.slice(1).map((s) => row(s.key, s.key,
            <Term def={DEF[s.key as 'A' | 'X' | '$'][lang]}>
              {s.key === 'A' ? L('Modelo anterior (v5.2)', 'Earlier model (v5.2)') : s.key === 'X' ? L('Registros externos', 'External records') : L('Escala del dinero', 'Money scale')}
            </Term>,
            f2(s.value), '× 0.20', f2(s.contrib), false,
            s.key === '$' ? formatCompactMXN(item.total_value_mxn) : null))}
          {fp > 0 && row('fp', null, <Term def={DEF.fp[lang]}>{L('Descuento', 'Discount')}</Term>, '', '', `−${f2(fp)}`)}
        </tbody>
        <tfoot>
          <tr className="is-sum">
            <th scope="row">{L('Prioridad (IPS)', 'Priority (IPS)')}</th><td /><td /><td className="num">{f2(total)}</td>
          </tr>
        </tfoot>
      </table>

      {sentence && (
        <p className="ipl-say">
          {aporteSentence(slots, !en)}{' '}
          {byRule && (en ? 'Its tier comes from a rule, not the sum: every definitive EFOS enters at least tier 2. ' : 'Su nivel viene de una regla, no de la suma: todo EFOS definitivo entra al menos al nivel 2. ')}
          <span>{L('Ordena la revisión; no es una probabilidad de corrupción.', 'It orders the review; it is not a probability of corruption.')}</span>
        </p>
      )}
    </figure>
  )
}

/** The patterns the rules read, as one ruled line of names with their rule scores (not bars). */
export function PatternList({ confidences, lang }: { confidences: Record<string, number> | null | undefined; lang: Lang }) {
  const en = lang === 'en'
  const list = Object.entries(confidences ?? {}).filter(([, c]) => (c ?? 0) >= 0.1).sort((a, b) => b[1] - a[1])
  return (
    <div className="ipl-pats">
      <b>{en ? 'Patterns the rules read' : 'Patrones que leen las reglas'}</b>
      {list.length ? (
        <ul>
          {list.map(([p, c]) => (
            <li key={p}>
              <i className="ct-sq" aria-hidden="true" style={{ ['--c' as string]: PATTERN_COLORS[p] }} />
              <Term def={PATTERN_DEFS[p]?.[lang] ?? p}>{p} · {patternName(p, lang)}</Term>
              <span>{c.toFixed(2)}</span>
            </li>
          ))}
        </ul>
      ) : <p>{en ? 'No pattern at 0.10 or more.' : 'Ningún patrón en 0.10 o más.'}</p>}
      <small>{en
        ? 'Rule scores, not probabilities. P5 (amount out of range) is not computed in production.'
        : 'Puntajes de regla, no probabilidades. P5 (monto fuera de rango) no se calcula en producción.'}</small>
    </div>
  )
}
