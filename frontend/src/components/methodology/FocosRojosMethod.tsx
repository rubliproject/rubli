/**
 * /methodology § «Focos Rojos: cómo se ordena la fila» (FLAG_METHODOLOGY_REVIEW_2026-10-28 § 3 D).
 * The live formula (what the IPS is and is not = the section claim, Methodology.tsx), the tiers with live counts (tier 1 split into
 * documented vs unverified from the API's public labels), the patterns, the discounts, the size
 * bias, the limits and the change log. Counts come from /aria/stats and the /aria/queue summary
 * so the page cannot drift from the run; the size-bias figures are the review's, dated.
 */
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ariaApi } from '@/api/client'
import type { AriaStatsResponse } from '@/api/types'
import { PATTERN_DEFS, PATTERNS_OFF_IN_PROD, patternName } from '@/lib/aria/patterns'
import { formatAriaDate } from '@/components/aria/disposition'
import { formatNumber } from '@/lib/utils'

const CODES = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7'] as const

export function FocosRojosMethod({ lang }: { lang: 'en' | 'es' }) {
  const es = lang === 'es'
  const L = (a: string, b: string) => (es ? a : b)
  const stats = useQuery<AriaStatsResponse>({ queryKey: ['aria-stats'], queryFn: () => ariaApi.getStats(), staleTime: 5 * 60_000 })
  // per_page 1: only the global provenance summary is wanted
  const t1 = useQuery({ queryKey: ['aria-queue-summary'], queryFn: () => ariaApi.getQueue({ tier: 1, per_page: 1 }), staleTime: 5 * 60_000 })
  const s = stats.data
  const sum = t1.data?.summary
  const n = (v: number | null | undefined) => (v == null ? '—' : formatNumber(v))
  const tc = (k: '1' | '2' | '3' | '4') => s?.tier_counts?.[k] ?? null
  const run = s?.latest_run
  const runDate = formatAriaDate(run?.completed_at ?? run?.started_at ?? null, es)
  const pc = s?.pattern_counts ?? {}

  return (
    <>
      <h3 className="mt-h3">{L('La fórmula vigente', 'The formula in force')}</h3>
      <pre className="mt-formula">{L(
        'IPS = 0.40 × máx(indicador de riesgo × 1.2, contrato más inusual)\n    + 0.20 × modelo anterior (v5.2)\n    + 0.20 × registros externos\n    + 0.20 × escala del dinero\n    − descuento (hasta 0.40)',
        'IPS = 0.40 × max(risk indicator × 1.2, most unusual contract)\n    + 0.20 × earlier model (v5.2)\n    + 0.20 × external records\n    + 0.20 × money scale\n    − discount (up to 0.40)',
      )}</pre>
      <ul className="mt-list">
        <li><b>{L('Indicador de riesgo', 'Risk indicator')}.</b> {L('El promedio del indicador de riesgo de sus contratos, multiplicado por 1.2 y con tope en 1.', 'The mean risk indicator of its contracts, times 1.2, capped at 1.')}</li>
        <li><b>{L('Contrato más inusual', 'Most unusual contract')}.</b> {L('La distancia de Mahalanobis de su contrato más raro frente a su sector, en 16 dimensiones, pasada a 0–1. El IPS toma el mayor de los dos; esta distancia es la que sube a casi todo el nivel 3.', 'The Mahalanobis distance of its most unusual contract against its sector, across 16 dimensions, mapped to 0–1. The IPS takes the larger of the two; this distance lifts most of tier 3.')}</li>
        <li><b>{L('Modelo anterior (v5.2)', 'Earlier model (v5.2)')}.</b> {L('El indicador de riesgo de una versión anterior del modelo, promediado por sector y escrito entre marzo y mayo de 2026. Antes se llamaba «anomalía estadística»: no mide anomalías.', 'An earlier model version’s risk indicator, averaged by sector and written between March and May 2026. It used to be called «statistical anomaly»: it does not measure anomalies.')}</li>
        <li><b>{L('Registros externos', 'External records')}.</b> {L('1.00 si está ligado a un caso con fuente oficial o de prensa fechada (procedencia A o B). Las pistas del modelo o de ARIA no suman. Si no, suma EFOS definitivo del SAT (0.70), sanción de la SFP (0.40) y señales de empresa fachada (0.25; 0.10 si son menos). Tope: 1.', '1.00 when it is linked to a case with an official or dated press source (provenance A or B). Leads from the model or ARIA add nothing. Otherwise it adds SAT definitive EFOS (0.70), an SFP sanction (0.40) and shell-company signals (0.25; 0.10 if fewer). Cap: 1.')}</li>
        <li><b>{L('Escala del dinero', 'Money scale')}.</b> {L('El logaritmo del monto total del proveedor dividido entre 30. Casi no varía: va de 0 a 0.37, así que nunca aporta más de 0.07.', 'The log of the vendor’s total amount divided by 30. It barely varies: it runs from 0 to 0.37, so it never adds more than 0.07.')}</li>
      </ul>
      <p className="ct-note">{L('Corrida', 'Run')} <span className="ct-mono">{run?.run_id ?? (run as { id?: string } | null | undefined)?.id ?? '—'}</span> · {runDate ?? '—'} · {n(s?.queue_total)} {L('proveedores', 'vendors')}</p>

      <h3 className="mt-h3">{L('Los niveles', 'The tiers')}</h3>
      <dl className="mt-facts">
        <div><dt>{L('Nivel 1 · IPS ≥ 0.80', 'Tier 1 · IPS ≥ 0.80')}</dt><dd className="tabular-nums">{n(tc('1'))}{sum && sum.total_t1 > 0 ? ` · ${L(`${n(sum.documented_t1)} documentados · ${n(sum.lead_t1)} sin verificar`, `${n(sum.documented_t1)} documented · ${n(sum.lead_t1)} unverified`)}` : ''}</dd></div>
        <div><dt>{L('Nivel 2 · IPS ≥ 0.60, o EFOS definitivo', 'Tier 2 · IPS ≥ 0.60, or definitive EFOS')}</dt><dd className="ct-mono">{n(tc('2'))}</dd></div>
        <div><dt>{L('Nivel 3 · IPS ≥ 0.40', 'Tier 3 · IPS ≥ 0.40')}</dt><dd className="ct-mono">{n(tc('3'))}</dd></div>
        <div><dt>{L('Sin señal · IPS < 0.40', 'No signal · IPS < 0.40')}</dt><dd className="ct-mono">{n(tc('4'))}</dd></div>
      </dl>
      <p>{L(
        'Sin registros externos el IPS no pasa de 0.67. Por eso el nivel 1 exige un registro externo. Casi siempre es un caso con fuente oficial o de prensa. Aun así, muchos se marcan «sin verificar»: «documentado» pide además confianza alta y una fuente citada. Todo EFOS definitivo entra al menos al nivel 2.',
        'Without external records the IPS cannot exceed 0.67. So tier 1 requires an external record. It is almost always a case with an official or press source. Even so, many are marked «unverified»: «documented» also asks for high confidence and a cited source. Every definitive EFOS enters at least tier 2.',
      )}</p>

      <h3 className="mt-h3">{L('Las señales', 'The signals')}</h3>
      <div className="ct-table-wrap" tabIndex={0} role="region" aria-label={L('Patrones de ARIA', 'ARIA patterns')}>
        <table className="ct-table">
          <caption className="sr-only">{L('Patrones de ARIA', 'ARIA patterns')}</caption>
          <thead>
            <tr>
              <th scope="col">{L('Patrón', 'Pattern')}</th>
              <th scope="col">{L('Qué calcula', 'What it computes')}</th>
              <th scope="col" className="num">{L('Patrón principal de', 'Primary pattern of')}</th>
            </tr>
          </thead>
          <tbody>
            {CODES.map((c) => (
              <tr key={c}>
                <td className="mt-td-h">{c} · {patternName(c, lang)}</td>
                <td>{PATTERN_DEFS[c][lang]}</td>
                <td className={(PATTERNS_OFF_IN_PROD as readonly string[]).includes(c) ? 'num ls-txt' : 'num'}>{(PATTERNS_OFF_IN_PROD as readonly string[]).includes(c) ? L('no corre en producción', 'does not run in production') : `${n(pc[c] ?? 0)} ${L('proveedores', 'vendors')}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="ct-note">{L('Las confianzas de patrón son puntajes de regla, no probabilidades. Los patrones no entran en el IPS: explican, no ordenan.', 'Pattern confidences are rule scores, not probabilities. Patterns do not enter the IPS: they explain, they do not order.')}</p>

      <h3 className="mt-h3">{L('Lo demás que hace ARIA', 'What else ARIA does')}</h3>
      <ul className="mt-list">
        <li><b>{L('Ráfagas', 'Bursts')}.</b> {L('Mide si el dinero de un proveedor llega de golpe, en pocos meses. Alimenta P3.', 'It measures whether a vendor’s money arrives all at once, in a few months. It feeds P3.')}</li>
        <li><b>{L('Intermediarios', 'Intermediaries')}.</b> {L('Un módulo aparte busca proveedores que revenden lo que otros fabrican. También alimenta P3.', 'A separate module looks for vendors that resell what others make. It also feeds P3.')}</li>
        <li><b>{L('Memos', 'Memos')}.</b> {L('Para los niveles 1 y 2 escribe un memo en español. Lo redacta un modelo de lenguaje con búsqueda web, o una plantilla. Cada memo guarda cómo se hizo. Un memo es un borrador, no una verificación.', 'For tiers 1 and 2 it writes a memo in Spanish. A language model with web search drafts it, or a template does. Each memo records how it was made. A memo is a draft, not a verification.')}</li>
        <li><b>{L('De pista a caso', 'From lead to case')}.</b> {L('Unas reglas proponen proveedores para la base de casos. Por ejemplo: IPS de 0.80 o más y un patrón fuerte. Un analista decide. Así nacen las «pistas del modelo»; por eso la prueba usa solo años posteriores.', 'Some rules propose vendors for the case set. For example: IPS of 0.80 or more and a strong pattern. An analyst decides. That is how «model leads» are born; that is why the test uses later years only.')}</li>
      </ul>

      <h3 className="mt-h3">{L('Lo que descontamos', 'What we discount')}</h3>
      <p>{L(
        'Patentes y licencias (hasta −0.20), monopolios estructurales y empresas del Estado (−0.15), con un tope de −0.40. A los entes públicos no les ponemos patrón. Las personas físicas se nombran con la etiqueta «persona física»; su RFC personal nunca se muestra. Los montos con posible error decimal se marcan al mostrarse.',
        'Patents and licences (up to −0.20), structural monopolies and state companies (−0.15), capped at −0.40. Public bodies get no pattern label. Individuals are named, labelled «persona física»; their personal RFC is never shown. Amounts with a possible decimal error are marked when shown.',
      )}</p>

      <h3 className="mt-h3">{L('El tamaño', 'Size')}</h3>
      <p>{L(
        'Los niveles altos escogen sobre todo proveedores grandes. En la revisión del 28 de octubre de 2026, los proveedores de 100 millones de pesos o más eran el 5.1% de la fila y el 84.5% de los niveles 1 y 2. El tamaño entra por el indicador de riesgo, por la distancia de Mahalanobis (tomada como el máximo de todos sus contratos) y por P1 y P3. Hoy ninguna señal se mide contra proveedores del mismo tamaño.',
        'The upper tiers mostly select large vendors. In the 28 October 2026 review, vendors with 100 million pesos or more were 5.1% of the queue and 84.5% of tiers 1 and 2. Size enters through the risk indicator, through the Mahalanobis distance (taken as the maximum over all its contracts) and through P1 and P3. No signal is yet measured against vendors of the same size.',
      )}</p>

      <h3 className="mt-h3">{L('Límites', 'Limits')}</h3>
      <ul className="mt-list">
        <li>{L('La distancia de Mahalanobis usa variables de la época del modelo v4.', 'The Mahalanobis distance uses v4-era features.')}</li>
        <li>{L('El componente «modelo anterior» lleva dos versiones del modelo sin actualizarse.', 'The «earlier model» component is two model versions out of date.')}</li>
        <li>{L('La búsqueda automática de prensa no es verificación.', 'The automated press search is not verification.')}</li>
        <li>{L('La base de casos está sesgada hacia proveedores grandes.', 'The case set is biased toward large vendors.')}</li>
      </ul>

      <h3 className="mt-h3">{L('Cambios', 'Changes')}</h3>
      <ul className="mt-list">
        <li><span className="ct-mono">2026-10-28</span> {L(
          'Nombres honestos, sin cambiar reglas ni niveles: P1 pasa de «Monopolio institucional» a «Peso en su sector»; «anomalía estadística» pasa a «modelo anterior (v5.2)»; se muestra la distancia de Mahalanobis. Los cambios que mueven niveles esperan un prerregistro.',
          'Honest names, no rule or tier change: P1 goes from «Institutional monopoly» to «Large share of its sector»; «statistical anomaly» becomes «earlier model (v5.2)»; the Mahalanobis distance is shown. Changes that move tiers wait for a pre-registration.',
        )}</li>
        <li><span className="ct-mono">2026-11-02</span> {L(
          'P5 (monto fuera de rango) se calcula también en la base publicada.',
          'P5 (amount out of range) is now computed on the published database too.',
        )}</li>
      </ul>
      <p><Link to="/aria" className="ct-link">{L('Ir a la fila de investigación', 'Go to the investigation queue')}</Link></p>
    </>
  )
}
