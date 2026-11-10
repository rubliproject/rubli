/**
 * Portada (/dashboard) — instrument skeleton (owner, 2026-10-15 structural reset;
 * concepts `_ui_v4/concepts/portada/{A,B,C3}.html`, plan NIGHT_PLAN § Portada,
 * motion INTERACTION_SCORE § 3.1).
 *
 *   bar → «Última hora» (stepped wire) → «El Firmamento» (3,462 institution stars, the first screen, search over it)
 *       → «Salidas», the week's contracts as a departures board (owner 2026-11-02)
 *       → «El Campo» (the investigation file's suppliers, four lenses on the same dots)
 *       («Los Cauces», the sector → procedure → risk Sankey, retired 2026-10-29: owner «bad presentation»;
 *        the sector split lives in El Campo + the sky, and its risky share by money mostly restated that the largest contracts read high)
 *       → four presentation cards (Focos Rojos · Nuevos, Casos, Sectores, Sexenios)
 *
 * Dense by the owner's rule (2026-10-19): the object fills the first screen, the
 * first screen carries ≤ 40 words outside the marks, no empty bands. Every figure
 * is live; a missing one prints «—». The load beat plays once per session.
 */
import { useDataCut } from '@/lib/useDataCut'
import { lazy, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useSky } from '@/lib/atlas/sky/useSky'
import { useExecutiveData } from '@/hooks/useExecutiveData'
import { useLang } from '@/components/contrato/nav'
import { Firmamento } from '@/components/portada/Firmamento'
import { Tablero } from '@/components/portada/Tablero'
import { Wire } from '@/components/contrato/Wire'
import { Defer } from '@/components/kit/Defer'
import { PageQuestion, jumpTo } from '@/components/kit/PageQuestion'
import { RiskHowTo } from '@/components/portada/RiskHowTo'
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import { institutionShortName } from '@/lib/institutionShortName'
import { topBuyer } from '@/lib/portadaReading'
import { CURRENT_MODEL_VERSION } from '@/lib/constants'
import { formatCut } from '@/lib/nav/toc'
import { formatNumber } from '@/lib/utils'
import { tour } from '@/lib/tours'
import '@/components/kit/kit.css'

// Below the fold: their own chunks, mounted (and fetching) near the viewport or on idle —
// docs/PORTADA_PERF_2026-10-28.md fix 1 (DotField + 240 KB gz of API off the first screen).
const Campo = lazy(() => import('@/components/portada/Campo').then((m) => ({ default: m.Campo })))
const PortadaCards = lazy(() => import('@/components/portada/PortadaCards').then((m) => ({ default: m.PortadaCards })))

const BEAT_KEY = 'rubli_beat_dashboard'
const beatPlayed = () => { try { return sessionStorage.getItem(BEAT_KEY) === '1' } catch { return true } }

export default function Executive() {
  const cut = useDataCut()
  const lang = useLang()
  const en = lang === 'en'
  const L = (es: string, e: string) => (en ? e : es)
  const { manifest } = useSky(false)
  const { executiveSummary: s, caseStats, savedAt } = useExecutiveData()
  const beat = useMemo(() => !beatPlayed() && !window.matchMedia('(prefers-reduced-motion: reduce)').matches, [])
  useEffect(() => { try { sessionStorage.setItem(BEAT_KEY, '1') } catch { /* private mode: a replay is harmless */ } }, [])

  const fig = (v: number | null | undefined, f: (x: number) => string = formatNumber) => (v == null ? '—' : f(v))
  const pct = (x: number) => `${x.toFixed(1)}%`
  const figures = (
    <dl className="pf-figs">
      <div><dt>{L('contratos, 2002–2026', 'contracts, 2002–2026')}</dt><dd>{fig(s?.headline.total_contracts)}</dd></div>
      <div><dt>{L('contratos críticos', 'critical contracts')}</dt><dd className="is-crit">{fig(s?.risk.critical_pct, pct)}</dd></div>
      <div><dt>{L('directas, por contratos', 'direct awards, by contracts')}</dt><dd>{fig(s?.procedures.direct_award_pct, pct)}</dd></div>
      <div><dt>{L('proveedores', 'suppliers')}</dt><dd>{fig(s?.headline.total_vendors)}</dd></div>
      <div className="pf-key">
        <dt className="sr-only">{L('Clave', 'Key')}</dt>
        <dd>
          {savedAt && <span>{L(`cifras guardadas del ${formatCut(savedAt, lang)}: el servidor no respondió`, `figures saved on ${formatCut(savedAt, lang)}: the server did not answer`)}</span>}
          {s && (
            // the headline's money share sits in the largest contracts: say it beside it (CRITIQUE 2026-10-28 § 2)
            <span>
              {L(`alto o crítico: ${Math.round(s.risk.value_at_risk_pct)}% del dinero, pero ${s.risk.high_risk_rate.toFixed(1)}% de los contratos; son los contratos más grandes. `, `high or critical: ${Math.round(s.risk.value_at_risk_pct)}% of the money but ${s.risk.high_risk_rate.toFixed(1)}% of contracts; they are the largest contracts. `)}
              <Link to="/methodology#overview" className="ct-link">{L('Cuánto pesa el tamaño →', 'How much size weighs →')}</Link>
            </span>
          )}
          <span><i className="is-ring" aria-hidden="true" />{L('anillo: concentra el gasto con mayor indicador de riesgo de su sector', "ring: the sector's riskiest money")}</span>
          <span className="sr-only">{L('corte', 'cut')} {formatCut(cut, lang)} · {L('modelo', 'model')} {CURRENT_MODEL_VERSION}</span>
        </dd>
      </div>
    </dl>
  )

  // the page question's finding (docs/PAGE_QUESTIONS.md): who spent the most in the sky, and who received the most
  const top = useMemo(() => topBuyer(manifest?.stars), [manifest])
  const topV = s?.top_vendors?.[0]
  const means = top && topV ? (() => {
    const { short, full } = institutionShortName(top.name, top.siglas)
    const buyer = <EntityIdentityChip type="institution" id={top.id} name={top.name} variant="name" ariaLabel={full}>{short}</EntityIdentityChip>
    const vendor = <EntityIdentityChip type="vendor" id={topV.id} name={topV.name} variant="name" />
    const share = <b>{Math.round(top.share * 100)}{en ? '%' : ' %'}</b>
    return en
      ? <>Spent the most: {buyer}, {share} of all the money. Received the most: {vendor}.</>
      : <>Quien más gastó: {buyer}, {share} de todo el dinero. Quien más recibió: {vendor}.</>
  })() : null
  const years = s ? (en ? `${s.headline.min_year} to ${s.headline.max_year}` : `${s.headline.min_year} a ${s.headline.max_year}`) : (en ? '2002 to 2026' : '2002 a 2026')

  return (
    <article className="ct ct-page pt-page">
      <div className="ct-wrap">
        {/* owner 2026-11-02: El Mapa's sky stays on top («why did we put the map below?»); «Última hora» rides above it,
            the departures board («Salidas») sits right under it */}
        <Wire />
        <PageQuestion
          lang={lang}
          question={L('¿Cuánto se gastó, quién gastó y quién recibió más?', 'How much was spent, who spent it and who received the most?')}
          see={L(`Cada punto del panorama es una institución pública que compró de ${years}; abajo, los contratos más recientes.`, `Each dot in the panorama is a public institution that bought from ${years}; below, the latest contracts.`)}
          read={L('Un punto más grande gastó más; el color es su sector; un anillo rojo marca a las que más gastan con indicador alto o crítico en su sector.', 'A bigger dot spent more; its colour is its sector; a red ring marks those that spend most at a high or critical indicator in their sector.')}
          means={means}
          targets={['.pf-cv', '.pf-cv']}
          {...tour('portada', lang)}
          followups={[
            { label: L('¿Qué se firmó esta semana?', 'What was signed this week?'), onClick: jumpTo('#bd-h') },
            { label: L('¿Cómo se mide el riesgo?', 'How is risk measured?'), onClick: jumpTo('.rh') },
          ]}
        />
        {manifest ? (
          <Firmamento
            manifest={manifest}
            lang={lang}
            totalInstitutions={s?.headline.total_institutions ?? null}
            totalValue={s?.headline.total_value ?? null}
            totalValueUsd={s?.headline.total_value_usd ?? null}
            riskPct={s?.risk.value_at_risk_pct ?? null}
            beat={beat}
            figures={figures}
          />
        ) : (
          <section className="pf" aria-busy="true">
            <div className="pf-head"><p className="pf-claim">{L('Cargando el panorama de instituciones…', 'Loading the panorama of institutions…')}</p></div>
            <div className="pf-sky pf-sky-skel" />
            {figures}
          </section>
        )}
        <Tablero lang={lang} />
        {/* «¿Cómo se mide el riesgo?» under the board's risk legend and its «Cómo se calcula» (WEEK_PLAN 2b) */}
        <RiskHowTo lang={lang} />
        <Defer minHeight={720}><Campo lang={lang} beat={beat} /></Defer>
        <Defer minHeight={420}><PortadaCards lang={lang} summary={s} cases={caseStats} /></Defer>
      </div>
    </article>
  )
}
