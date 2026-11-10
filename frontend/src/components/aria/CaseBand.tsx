/**
 * CaseBand — the ARIA case layer in the vendor cover on /aria/caso/:id (owner 2026-10-27:
 * «the same new template for vendors and institutions» + a case layer;
 * _explore/dossier_concepts_2026-10-27 README § B, ARIA payload). The case leads with the IPS ledger
 * (how the priority adds up, open — CRITIQUE 2026-10-28 §2), then three ruled cells: tier ·
 * disposition · pattern · what the model reads (top factors as signed numerals, not bars); the
 * external signals ride under the orbit (CaseSignals). Then the exits, the memo on demand, and the
 * analyst's verdict bar (shared with the queue's RowExpand).
 */
import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { AriaQueueItem, VendorGroundTruthCaseInfo, VendorWaterfallContribution } from '@/api/types'
import { AriaMemoPanel } from '@/components/widgets/AriaMemoPanel'
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import { VerdictBar } from '@/components/aria/VerdictBar'
import { PatternList } from '@/components/aria/IpsLedger'
import { bucketStatus, corroboration, DISPOSITION_META, VERDICT_LABEL } from '@/components/aria/disposition'
import { patternLabels } from '@/components/atlas/sky/expediente-adapter'
import { PATTERN_COLORS, RISK_INK_ON_PLATE, RISK_TEXT_COLORS } from '@/lib/constants'

type Lang = 'en' | 'es'

const memoKindOf = (k: string | null | undefined, en: boolean) =>
  k === 'llm_narrative' ? (en ? 'AI' : 'IA')
    : k === 'analyst' ? (en ? 'analyst' : 'analista')
      : k === 'template' || k === 'duplicate' ? (en ? 'template' : 'plantilla')
        : k === 'stub' ? (en ? 'stub' : 'borrador') : null

export function CaseBand({ item, factors, hasMemo, isAnalyst, lang }: {
  item: AriaQueueItem
  factors: VendorWaterfallContribution[] | undefined
  hasMemo: boolean
  isAnalyst: boolean
  lang: Lang
}) {
  const en = lang === 'en'
  const [memoOpen, setMemoOpen] = useState(false)
  const [patsOpen, setPatsOpen] = useState(false)
  const pNames = patternLabels(lang)
  const dispo = DISPOSITION_META[bucketStatus(item.review_status)]
  const p = item.primary_pattern
  // the other patterns the model reads at ≥ 0.50 confidence
  const also = Object.entries(item.pattern_confidences ?? {})
    .filter(([k, c]) => k !== p && (c ?? 0) >= 0.5)
    .sort((a, b) => b[1] - a[1])
  const top = [...(factors ?? [])].sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution)).slice(0, 4)
  const memoKind = memoKindOf(item.memo_provenance, en)
  const id = item.vendor_id

  return (
    <section className="aria-x ac-band" aria-labelledby="ac-band-h">
      <h2 id="ac-band-h" className="sr-only">{en ? 'The case' : 'El caso'}</h2>
      <div className="ac-cells">
        <div>
          <h3>{en ? 'Priority' : 'Prioridad'}</h3>
          <p className="ac-fig">{item.ips_final.toFixed(2)} <span>IPS</span></p>
          <p>{en ? `Tier ${item.ips_tier} of the investigation queue` : `Nivel ${item.ips_tier} de la fila de investigación`}</p>
          <p>{en ? 'Disposition: ' : 'Disposición: '}<b style={{ color: dispo.color }}>{en ? dispo.en : dispo.es}</b></p>
        </div>

        <div>
          <h3>{en ? 'Pattern' : 'Patrón'}</h3>
          {p ? (
            <>
              <p className="ac-fig"><span className="ct-sq" aria-hidden="true" style={{ ['--c' as string]: PATTERN_COLORS[p] }} />{p}</p>
              <p><EntityIdentityChip type="pattern" id={p} name={pNames[p] ?? p} variant="name" className="ct-link" /> <span className="ac-mono">· {en ? 'rule score' : 'puntaje de regla'} {item.pattern_confidence.toFixed(2)}</span></p>
              {also.length > 0 && (
                <p className="ac-mute">{en ? 'also ' : 'también '}{also.map(([k, c]) => `${k} ${pNames[k] ?? ''} (${c.toFixed(2)})`).join(' · ')}</p>
              )}
            </>
          ) : <p className="ac-mute">{en ? 'No primary pattern' : 'Sin patrón principal'}</p>}
        </div>

        <div>
          <h3>{en ? 'What the model reads' : 'Lo que lee el modelo'}</h3>
          {top.length > 0 ? (
            <dl className="ac-factors" aria-label={en ? 'Largest contributions to the risk indicator' : 'Mayores aportes al indicador de riesgo'}>
              {top.map((f) => (
                <div key={f.feature}>
                  <dt>{en ? f.label_en : f.label_es}</dt>
                  <dd style={f.contribution > 0 ? { color: 'var(--ct-ink)' } : undefined}>
                    <span aria-hidden="true">{f.contribution > 0 ? '▲' : '▽'}</span> {f.contribution > 0 ? '+' : '−'}{Math.abs(f.contribution).toFixed(2)}
                  </dd>
                </div>
              ))}
            </dl>
          ) : <p className="ac-mute">{en ? 'No factor breakdown' : 'Sin desglose de factores'}</p>}
        </div>
      </div>

      {/* rendered only when open: a closed <details> still lays its content out in Chrome */}
      <details className="ac-why" onToggle={(e) => setPatsOpen(e.currentTarget.open)}>
        <summary>{en ? 'Every pattern the rules read' : 'Todos los patrones que leen las reglas'}</summary>
        {patsOpen && <PatternList confidences={item.pattern_confidences} lang={lang} />}
      </details>

      <p className="ac-acts">
        {hasMemo && (
          <button type="button" onClick={() => setMemoOpen((v) => !v)} aria-expanded={memoOpen} aria-controls={`ac-memo-${id}`} className="aria-x-act">
            {memoOpen ? (en ? 'Close memo' : 'Cerrar memo') : (en ? 'Read the ARIA memo' : 'Leer el memo ARIA')}
            {memoKind ? ` · ${memoKind}` : ''}
          </button>
        )}
        <Link to={`/vendors/${id}`} state={{ from: '/aria' }} className="aria-x-act">{en ? "The vendor's full dossier →" : 'El expediente completo →'}</Link>
        <Link to={`/aria?vendor=${id}`} className="aria-x-act">{en ? 'Back to the queue' : 'Volver a la fila'}</Link>
        <span className="ac-mute">{en ? 'A priority indicator, not a probability of corruption.' : 'Indicador de prioridad, no probabilidad de corrupción.'}</span>
      </p>

      {hasMemo && memoOpen && (
        <div id={`ac-memo-${id}`} className="ct-row-in vd-memo mt-3">
          <AriaMemoPanel vendorId={id} vendorName={item.vendor_name ?? ''} tier={item.ips_tier ?? undefined}
            gtUnverified={!item.in_ground_truth && !!item.gt_lead} className="!p-0 !border-0 !bg-transparent" />
        </div>
      )}

      {isAnalyst && <VerdictBar item={item} isEs={!en} reviewerName={item.reviewer_name} reviewedAt={item.reviewed_at} />}
    </section>
  )
}

/** The external signals — documented case (seal red), EFOS, SFP, press. On the case view they sit
 *  under the orbit in the cover's side column, so both columns end together (proof:ui RAGGED). */
export function CaseSignals({ item, cases, lang }: { item: AriaQueueItem; cases: VendorGroundTruthCaseInfo[]; lang: Lang }) {
  const en = lang === 'en'
  const ticks = corroboration(item)
  const verdict = item.web_evidence_verdict && item.web_evidence_verdict !== 'NEGATIVE' ? VERDICT_LABEL[item.web_evidence_verdict] : null
  return (
    <div className="aria-x ac-side">
      <h3 aria-level={2}>{en ? 'External signals' : 'Señales externas'}</h3>
      <ul className="ac-signals">
        {cases.map((c) => (
          <li key={c.case_id}>
            <span className="ac-seal">{en ? 'Documented case' : 'Caso documentado'}</span>{' '}
            {c.scandal_slug
              ? <EntityIdentityChip type="case" id={c.scandal_slug} name={c.case_name} variant="name" fullName />
              : <span>{c.case_name}</span>}
          </li>
        ))}
        {!cases.length && item.gt_lead && <li className="ac-mute">{en ? 'Case link · unverified' : 'Vínculo a un caso · sin verificar'}</li>}
        {ticks.e && <li style={{ color: RISK_TEXT_COLORS.critical }}>{en ? 'SAT EFOS definitive' : 'SAT EFOS definitivo'}</li>}
        {item.is_sfp_sanctioned && <li style={{ color: RISK_INK_ON_PLATE.high }}>{en ? 'SFP sanctioned' : 'Sancionado por la SFP'}</li>}
        {verdict && <li>{en ? 'Press: ' : 'Prensa: '}{en ? verdict.en : verdict.es}</li>}
        {!cases.length && !item.gt_lead && !ticks.e && !item.is_sfp_sanctioned && !verdict && (
          <li className="ac-mute">{en ? 'No external record' : 'Sin registro externo'}</li>
        )}
      </ul>
    </div>
  )
}
