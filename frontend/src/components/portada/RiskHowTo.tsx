/**
 * «¿Cómo se mide el riesgo?» — the Portada's explainer under the board's risk legend (owner-approved 2026-11-03,
 * docs/WEEK_PLAN_2026-11-03.md 2b; frontend/DESIGN.md §7). Three steps over ONE real contract of the week
 * (GET /events, the board's feed: the newest critical one) and its own model reasons (GET /contracts/:id/risk-explain):
 *   1 · the record arrives: amount · buyer · supplier;
 *   2 · it is set against contracts of its sector (owner 2026-11-05 «simplify the wording and redesign… lazy»):
 *       at most three reasons, only those clearly above usual (z ≥ 1), strongest first, each ONE sentence ≤ 15 words
 *       naming the sector (lib/portadaReading `reasonOf`) and, where the data has the numbers, a directly labelled
 *       comparison (`Cmp`): «Este contrato 66.9 MDP / Lo normal en Salud 148.5 mil» with unit dots up to 50×
 *       (one dot = one normal contract, so the dots ARE the «veces»), or «20 de 100» as the 10 × 10 coins (Monedas). Words only otherwise;
 *   3 · the indicator lands on its level on the 0–1 scale (zones at 0.25 / 0.40 / 0.60): «se parece a casos
 *       documentados; no prueba nada».
 * Each mark maps one real value (an amount, a share, the score); nothing else moves. Quiet: ink, greys, the level's own colour on the
 * needle only. Shell, timing, controls and reduced motion: kit/HowToRead.
 */
import { useMemo, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { contractApi } from '@/api/client'
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import { HowToRead } from '@/components/kit/HowToRead'
import { DotBar } from '@/components/ui/DotBar'
import { Monedas } from '@/components/noSeVe/Monedas'
import { RISK_THRESHOLDS, SECTORS, getRiskLevelFromScore } from '@/lib/constants'
import { reasonOf, riskDrivers, type Cmp } from '@/lib/portadaReading'
import { formatCompactMXN, formatCompactUSDByYear } from '@/lib/utils'
import { eventsQuery, weekOf } from '@/lib/wire'
import type { Lang } from '@/components/contrato/nav'

const LEVEL = {
  critical: { es: 'crítico', en: 'critical' }, high: { es: 'alto', en: 'high' },
  medium: { es: 'medio', en: 'medium' }, low: { es: 'bajo', en: 'low' },
} as const
const ZONES = [
  { lv: 'low', from: 0, to: RISK_THRESHOLDS.medium },
  { lv: 'medium', from: RISK_THRESHOLDS.medium, to: RISK_THRESHOLDS.high },
  { lv: 'high', from: RISK_THRESHOLDS.high, to: RISK_THRESHOLDS.critical },
  { lv: 'critical', from: RISK_THRESHOLDS.critical, to: 1 },
] as const
const pct = (x: number) => `${(x * 100).toFixed(1)}%`

export function RiskHowTo({ lang }: { lang: Lang }) {
  const en = lang === 'en'
  const L = (es: string, e: string) => (en ? e : es)
  const { data: feed } = useQuery(eventsQuery)
  // the week's newest critical contract; else any of the week's contracts with an indicator
  const ev = useMemo(() => {
    const wk = weekOf(feed?.events ?? []).filter((e) => e.contract_id != null)
    return wk.find((e) => e.type === 'critical') ?? wk.find((e) => e.risk_level != null) ?? null
  }, [feed])
  const xq = useQuery({
    queryKey: ['risk-explain', ev?.contract_id],
    queryFn: () => contractApi.getRiskExplanation(ev!.contract_id!),
    enabled: ev?.contract_id != null,
    staleTime: 60 * 60_000,
    retry: false,
  })
  const x = xq.data
  const drivers = useMemo(() => riskDrivers(x?.features), [x])
  if (!ev || !x?.explanation_available || typeof x.risk_score !== 'number') return null

  const level = getRiskLevelFromScore(x.risk_score)
  // one decimal in EN too: step 2's two amounts must divide to the «veces» the sentence states
  const money = (v: number) => (en ? formatCompactUSDByYear(v, Number(ev.date.slice(0, 4))) : formatCompactMXN(v))
  const amount = ev.amount != null ? money(ev.amount) : null
  const buyer = ev.institution_id != null && ev.institution
    ? <EntityIdentityChip type="institution" id={ev.institution_id} name={ev.institution} variant="name" />
    : <span>{ev.institution ?? '—'}</span>
  const sec = SECTORS.find((s) => s.id === ev.sector_id)
  const sector = sec ? (en ? sec.nameEN : sec.name) : null
  const reasons = drivers.map((d) => ({ key: d.feature, ...reasonOf(d, ev.amount ?? null, en, sector) }))
  const vendor = ev.vendor_id != null && ev.vendor
    ? <><EntityIdentityChip type="vendor" id={ev.vendor_id} name={ev.vendor} variant="name" />{ev.persona_fisica && <span className="rh-dim">{L(' · persona física', ' · individual')}</span>}</>
    : <span className="rh-dim">{L('Nombre no publicado', 'Name not published')}</span>

  const steps = [
    {
      label: L('Llega un contrato', 'A contract arrives'),
      body: (
        <>
          <dl className="rh-rec">
            {amount && <div style={{ '--i': 0 } as CSSProperties}><dt>{L('Monto', 'Amount')}</dt><dd className="rh-amt">{amount}</dd></div>}
            <div style={{ '--i': 1 } as CSSProperties}><dt>{L('Compra', 'Buyer')}</dt><dd>{buyer}</dd></div>
            <div style={{ '--i': 2 } as CSSProperties}><dt>{L('Vende', 'Supplier')}</dt><dd>{vendor}</dd></div>
          </dl>
          <p className="rh-note">
            {L('Uno de esta semana, tal como lo publicó ComprasMX. ', 'One from this week, as ComprasMX published it. ')}
            <Link to={`/contracts/${ev.contract_id}`} className="ct-link">{L('Ver el contrato', 'Open the contract')}</Link>
          </p>
        </>
      ),
    },
    {
      label: L('Se compara con otros', 'It is compared'),
      body: (
        <>
          {reasons.length ? (
            <ul className="rh-drv">
              {reasons.map((r, i) => (
                <li key={r.key} style={{ '--i': i } as CSSProperties}>
                  <p className="rh-why">{r.pre}{r.b && <b>{r.b}</b>}{r.post}</p>
                  {r.cmp && <Compare cmp={r.cmp} money={money} normal={sector ? L(`Lo normal en ${sector}`, `Normal in ${sector}`) : L('Lo normal en su sector', 'Normal in its sector')} L={L} />}
                </li>
              ))}
            </ul>
          ) : (
            <p className="rh-why">
              {L('Ninguna razón sola sale de lo normal. Pesan varias juntas.', 'No single reason stands out. Several weigh together.')}
            </p>
          )}
          <p className="rh-note">
            {reasons.some((r) => r.key === 'price_ratio')
              ? L('«Lo normal»: el contrato de en medio de su sector en tres años.', '“Normal”: the middle contract in its sector over three years.')
              : L('Solo las razones que más pesan.', 'Only the reasons that weigh most.')}
          </p>
        </>
      ),
    },
    {
      label: L('Recibe un nivel', 'It gets a level'),
      body: (
        <>
          <div className="rh-scale" aria-hidden="true">
            {ZONES.map((z) => (
              <span key={z.lv} className={`rh-zone is-${z.lv}${z.lv === level ? ' is-on' : ''}`} style={{ left: pct(z.from), width: pct(z.to - z.from) }}>
                <span>{L(LEVEL[z.lv].es, LEVEL[z.lv].en)}</span>
              </span>
            ))}
            <span className={`rh-needle is-${level}`} style={{ '--p': pct(Math.min(0.995, x.risk_score)) } as CSSProperties}><i /></span>
          </div>
          <p className="rh-verdict">
            {L('Indicador de riesgo: ', 'Risk indicator: ')}<b className={`is-${level}`}>{L(LEVEL[level].es, LEVEL[level].en)}</b>.{' '}
            {L('Se parece a casos documentados; no prueba nada.', 'It resembles documented cases; it proves nothing.')}
          </p>
          <p className="rh-note">
            {L('El modelo aprendió de casos de corrupción ya documentados y suma las razones de cada contrato. ', 'The model learned from documented corruption cases and adds up each contract’s reasons. ')}
            <Link to="/methodology" className="ct-link">{L('Cómo se calcula →', 'How it is computed →')}</Link>
          </p>
        </>
      ),
    },
  ]

  return (
    <HowToRead
      className="rh"
      lang={lang}
      title={L('¿Cómo se mide el riesgo?', 'How is risk measured?')}
      sub={<>
        {L('Un contrato real de esta semana, en tres pasos.', 'A real contract from this week, in three steps.')}
      </>}
      steps={steps}
    />
  )
}

/** Step 2's comparison, directly labelled (no key). «times»: the two amounts, and up to 50× a dot row each on ONE
 *  scale — lo normal = 1 dot, this contract = N dots, so the dots count the «veces». «per100»: the 10 × 10 coins (Monedas, the approved «de cada cien pesos» form), n filled.
 *  Ink for this contract, muted for the norm; never red (step 3 carries the level). Dots fade in (opacity only). */
/** Unfilled coins: muted ink at 60 % — ≥ 3:1 on paper and on night (WCAG 1.4.11), the «out of 100» stays countable. */
const EMPTY = 'color-mix(in srgb, var(--color-text-muted) 60%, transparent)'

function Compare({ cmp, money, normal, L }: { cmp: Cmp; money: (v: number) => string; normal: string; L: (es: string, en: string) => string }) {
  if (cmp.kind === 'per100') {
    return (
      <div className="rh-cmp is-100">
        <span className="rh-dots" aria-hidden="true"><Monedas share={cmp.n / 100} color="var(--color-text-primary)" empty={EMPTY} label={cmp.label} /></span>
        <span className="rh-cv">{cmp.label}</span>
      </div>
    )
  }
  const rows = [
    { k: 'is-this', label: L('Este contrato', 'This contract'), v: cmp.self, n: cmp.n },
    { k: 'is-typ', label: normal, v: cmp.typical, n: cmp.n == null ? null : 1 },
  ]
  return (
    <dl className="rh-cmp">
      {rows.map((r) => (
        <div key={r.k} className={`rh-cr ${r.k}`}>
          <dt>{r.label}</dt>
          <dd>{money(r.v)}</dd>
          {r.n != null && (
            <dd className="rh-dots" aria-hidden="true">
              {/* rows of 25 so 50 dots fit the 390 column at full size: every dot keeps one width, one scale */}
              {Array.from({ length: Math.ceil(r.n / 25) }, (_, row) => {
                const k = Math.min(25, r.n! - row * 25)
                return <DotBar key={row} value={k} max={k} dots={k} dotR={3} dotGap={8} color={r.k === 'is-this' ? 'var(--color-text-primary)' : 'var(--color-text-muted)'} />
              })}
            </dd>
          )}
        </div>
      ))}
    </dl>
  )
}
