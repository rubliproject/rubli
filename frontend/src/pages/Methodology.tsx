/**
 * Metodología / Methodology — Version A «most plain» (docs/METHODOLOGY_REWRITE_DRAFT_2026-10-30.md § 2,
 * fold § 4, mapping § 5): eight reader questions, each answered in plain words beside its h2, then the
 * page's existing tables, plates and folds; the math lives in «Para especialistas»; history unchanged.
 * Usted everywhere. Live figures come from the dashboard bundle and /intersection; a missing one prints «—».
 * Risk copy: «indicador de riesgo», never probability.
 */
import { useState, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Check, Copy } from 'lucide-react'
import { cieloHref } from '@/lib/vista'
import { intersectionApi } from '@/api/client'
import { useCaseCountLabels } from '@/hooks/useGroundTruthCount'
import { useExecutiveData } from '@/hooks/useExecutiveData'
import { useDataCut } from '@/lib/useDataCut'
import { formatCut } from '@/lib/nav/toc'
import { RISK_COLORS, RISK_THRESHOLDS, CURRENT_MODEL_VERSION, MODEL_AUC, MODEL_AUC_CI, MODEL_AUC_SIZE, MODEL_AUC_LABEL, MODEL_FEATURES, GAP_LIVE } from '@/lib/constants'
import { glueDashes } from '@/lib/typography'
import { PfShell, PfSection, PfProse, PfFlow } from '@/components/plataforma/Plataforma'
import { methodologyLectura } from '@/lib/plataforma/lectura'
import { useLang } from '@/components/contrato/nav'
import { OpenDataNote } from '@/components/ui/OpenDataNote'
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import { TwoWorldsExhibit } from '@/components/methodology/TwoWorldsExhibit'
import { BalanzaLedger, HatchBar } from '@/components/methodology/BalanzaLedger'
import { CalibrationRecord } from '@/components/methodology/CalibrationRecord'
import { AnnexFold } from '@/components/methodology/DictamenChrome'
import { RiskFactorTable } from '@/components/RiskExplainer'
import { FocosRojosMethod } from '@/components/methodology/FocosRojosMethod'
import { OtrosMetodos } from '@/components/methodology/OtrosMetodos'
import { FootNotes } from '@/components/kit/FootNotes'
import '@/components/methodology/methodology.css'

// The calibration run behind the active model (model_calibration v0.9.2; KIT_2026-11 § 8, verified on prod 2026-10-26).
const DOC_RUN = 'CAL-v92-asof-20261022'

// Served coefficients (prod /api/v1/analysis/model/calibration, v0.9.2 betas_raw, read 2026-11-03) and the
// v0.9.2 artifact constants (docs/MODEL_CARD_v0.9.2.md § 1, § 3–5; docs/SCORING.md § Display score).
const FOLD = {
  intercept: '−3.633', cpu: '0.436', T: '0.530', C: '0.0037', l1: '0.919',
  sizeCi: '0.687–0.794', moneyOnly: '0.790', marginCi: '+0.008 a +0.086', marginCiEn: '+0.008 to +0.086',
  vendorYears: 174, leads: 989,
}

// The two worked examples (Tier 1 in the live Focos Rojos run 2026-10-22, contracting in 2026; prod read 2026-11-03).
const MAYPO = { id: 2873, name: 'FARMACEUTICOS MAYPO S.A DE C.V' }
const FALCON = { id: 1361, name: 'INSTRUMENTOS Y EQUIPOS FALCON, S.A. DE C.V.' }

const V33_WEIGHTS = [
  { nameKey: 'singleBidding', weight: 18 },
  { nameKey: 'nonOpenProcedure', weight: 18 },
  { nameKey: 'priceAnomaly', weight: 18 },
  { nameKey: 'vendorConcentration', weight: 12 },
  { nameKey: 'shortAdPeriod', weight: 12 },
  { nameKey: 'networkRisk', weight: 8 },
  { nameKey: 'yearEndTiming', weight: 7 },
  { nameKey: 'thresholdSplitting', weight: 7 },
] as const

const LEVELS = [
  { key: 'critical', label: 'Critical', threshold: `≥ ${RISK_THRESHOLDS.critical.toFixed(2)}` },
  { key: 'high', label: 'High', threshold: `≥ ${RISK_THRESHOLDS.high.toFixed(2)}` },
  { key: 'medium', label: 'Medium', threshold: `≥ ${RISK_THRESHOLDS.medium.toFixed(2)}` },
  { key: 'low', label: 'Low', threshold: `< ${RISK_THRESHOLDS.medium.toFixed(2)}` },
] as const

const DATA_STRUCTURES = [
  { s: 'A', years: '2002–2010', rfc: '0.1%' },
  { s: 'B', years: '2010–2017', rfc: '15.7%' },
  { s: 'C', years: '2018–2022', rfc: '30.3%' },
  { s: 'D', years: '2023–2025', rfc: '47.4%' },
  { s: 'E', years: '2025–', rfc: '100%' },
] as const

const EVOLUTION = ['v33', 'v40', 'v50', 'v51', 'v60', 'v52', 'v85', 'v91', 'v92'] as const
const EVOLUTION_LABEL: Record<(typeof EVOLUTION)[number], string> = {
  v33: 'v3.3', v40: 'v4.0', v50: 'v5.0', v51: 'v5.1', v60: 'v6.0', v52: 'v5.2', v85: 'v0.8.5', v91: 'v0.9.1', v92: 'v0.9.2',
}

const REFERENCES = [
  { authors: 'IMF Working Paper 2022/094', title: 'Assessing Vulnerabilities to Corruption in Public Procurement', year: 2022 },
  { authors: 'OECD', title: 'Public procurement performance: A framework for measuring efficiency, compliance and strategic goals (Policy Paper 36)', year: 2023 },
  { authors: 'World Bank INT', title: 'Warning Signs of Fraud and Corruption in Public Procurement', year: 2019 },
  { authors: 'Gallego, J., Rivero, G. & Martínez, J.', title: 'Preventing rather than punishing: An early warning model of malfeasance in public procurement (International Journal of Forecasting)', year: 2021 },
  { authors: 'Mahalanobis, P.C.', title: 'On the Generalized Distance in Statistics', year: 1936 },
  { authors: 'Ledoit, O. & Wolf, M.', title: 'A Well-Conditioned Estimator for Large-Dimensional Covariance Matrices', year: 2004 },
  { authors: 'Elkan, C. & Noto, K.', title: 'Learning Classifiers from Only Positive and Unlabeled Data', year: 2008 },
] as const

function Formula({ children }: { children: React.ReactNode }) {
  return <pre className="mt-formula">{children}</pre>
}

function CopyCitationButton() {
  const { t } = useTranslation('methodology')
  const [copied, setCopied] = useState(false)
  const handleCopy = useCallback(async () => {
    const text = REFERENCES.map((ref, i) => `[${i + 1}] ${ref.authors} (${ref.year}). ${ref.title}.`).join('\n')
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard blocked: the list stays selectable */ }
  }, [])
  return (
    <>
      <button type="button" onClick={() => void handleCopy()} className="plt-btn">
        {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
        {t('copyCitation')}
      </button>
      <span className="sr-only" role="status">{copied ? t('citationCopied') : ''}</span>
    </>
  )
}

export function Methodology() {
  const { t, i18n } = useTranslation('methodology')
  const lang = useLang()
  const es = lang === 'es'
  const cc = useCaseCountLabels(lang)
  const loc = es ? 'es-MX' : 'en-US'
  const cut = formatCut(useDataCut(), lang)
  const { executiveSummary: summary } = useExecutiveData()
  // Same query key as TwoWorldsExhibit, so the fold's three numbers ride on the plate's request.
  const worlds = useQuery({
    queryKey: ['intersection', 'exhibit'],
    queryFn: () => intersectionApi.getSummary(3),
    staleTime: 10 * 60 * 1000,
  }).data?.worlds

  const unavailable = es ? 'cifra no disponible' : 'figure unavailable'
  const limitationRows = useMemo(() => {
    const rows: number[] = []
    for (let n = 1; i18n.exists(`limitationsTable.row${n}_l`, { ns: 'methodology' }); n++) rows.push(n)
    return rows
  }, [i18n])

  const risk = summary?.risk
  const model = summary?.model
  const pctOf = (k: (typeof LEVELS)[number]['key']) => (risk ? risk[`${k}_pct`] : null)
  const countOf = (k: (typeof LEVELS)[number]['key']) => (risk ? risk[`${k}_count`] : null)
  const highPlusCount = risk ? (risk.critical_count + risk.high_count).toLocaleString(loc) : unavailable
  const hr = typeof risk?.high_risk_rate === 'number' ? `${risk.high_risk_rate.toFixed(1)}%` : '—'
  const liveVersion = model?.version ?? CURRENT_MODEL_VERSION
  const levelWord = (k: string) => t(`dataLabels.level${k}`)
  // AUC read as pairs: a case vendor ranked above a vendor with no case, out of 100 pairs.
  const pairs = Math.round(Number(MODEL_AUC) * 100)
  const sizePairs = Math.round(Number(MODEL_AUC_SIZE) * 100)
  const num = (v: number | undefined) => (typeof v === 'number' ? v.toLocaleString(loc) : '—')
  const chip = (v: { id: number; name: string }) => (
    <EntityIdentityChip type="vendor" id={v.id} name={v.name} size="inherit" fullName inline hideIcon />
  )

  const index = [
    { id: 'overview', label: es ? 'Qué mide' : 'What it measures' },
    { id: 'data-sources', label: es ? 'Los datos' : 'The data' },
    { id: 'features', label: es ? 'Qué lo sube' : 'What pushes it up' },
    { id: 'limitations', label: es ? 'Qué no dice' : 'What it does not say' },
    { id: 'validation', label: es ? 'Cómo se probó' : 'How it was tested' },
    { id: 'errors', label: es ? 'Los errores' : 'Mistakes' },
    { id: 'focos-rojos', label: es ? 'La fila' : 'The queue' },
    { id: 'otros', label: es ? 'Qué más medimos' : 'What else we measure' },
    { id: 'quote', label: es ? 'Cómo citarlo' : 'How to quote it' },
    { id: 'specialists', label: es ? 'Para especialistas' : 'For specialists' },
    { id: 'history', label: es ? 'Historia y fuentes' : 'History and sources' },
  ]

  return (
    <PfShell
      className="mt-page"
      title={es ? 'Metodología' : 'Methodology'}
      lede={es
        ? 'Cómo leemos cada contrato del gobierno federal, qué nos dice ese número y qué no.'
        : 'How we read every federal government contract, what that number tells you, and what it doesn’t.'}
      guide={es
        ? { q: '¿Cómo se calcula el indicador de riesgo y qué tan confiable es?', see: 'Nueve preguntas sobre el número de 0 a 1 de cada contrato y los demás métodos.', read: 'Lea la respuesta corta junto a cada título. Lo técnico va plegado.', means: 'Un número alto dice dónde mirar primero. No prueba corrupción.' }
        : { q: 'How is the risk indicator calculated, and how reliable is it?', see: 'Nine questions about the 0-to-1 number every contract gets and the other methods.', read: 'Read the short answer beside each title. The technical part is folded.', means: 'A high number says where to look first. It does not prove corruption.' }}
      index={index}
      lectura={methodologyLectura(lang, { highRate: risk?.high_risk_rate, auc: Number(MODEL_AUC), moneyOnly: Number(FOLD.moneyOnly) })}
      facts={[
        { k: es ? 'Modelo activo' : 'Active model', v: liveVersion },
        { k: es ? MODEL_AUC_LABEL.es : MODEL_AUC_LABEL.en, v: MODEL_AUC, n: es ? `IC 95% ${MODEL_AUC_CI}` : `95% CI ${MODEL_AUC_CI}` },
      ]}
    >
      {/* ── 1 · what the indicator measures ──────────────────────────────── */}
      <PfSection
        id="overview"
        title={es ? '¿Qué mide el indicador?' : 'What does the indicator measure?'}
        claim={es
          ? 'Cada contrato recibe un número entre 0 y 1. Dice cuánto se parece a casos de corrupción ya documentados.'
          : 'Every contract gets a number between 0 and 1. It says how much it looks like corruption cases already documented.'}
      >
        <PfFlow
          label={es ? 'Cómo un contrato se vuelve un indicador, en cinco pasos' : 'How a contract becomes an indicator, in five steps'}
          steps={[
            { name: es ? 'Un contrato' : 'A contract', note: es ? 'Quién compra, quién vende, cuánto, cuándo y cómo.' : 'Who buys, who sells, how much, when and how.' },
            { via: es ? 'se mide' : 'measured', name: es ? `${MODEL_FEATURES} variables` : `${MODEL_FEATURES} features`, note: es ? 'Solo con lo que pasó antes. Cada uno, frente a su sector.' : 'Only from what came before. Each one against its sector.' },
            { via: es ? 'se pesa' : 'weighed', name: es ? 'El modelo' : 'The model', note: /^\d/.test(cc.atTraining) ? (es ? `Aprendió de ${cc.atTraining} casos documentados.` : `Learned from ${cc.atTraining} documented cases.`) : (es ? 'Aprendió de casos documentados.' : 'Learned from documented cases.') },
            { via: es ? 'da' : 'gives', name: es ? 'Un número de 0 a 1' : 'A number from 0 to 1', note: es ? 'Cuánto se parece a esos casos.' : 'How much it looks like those cases.' },
            {
              via: es ? 'se ubica' : 'placed', focal: true, name: es ? 'Un nivel' : 'A level',
              note: es ? 'Crítico, alto, medio o bajo. Los cortes están en la tabla de abajo.' : 'Critical, high, medium or low. The cut-offs are in the table below.',
            },
          ]}
        />
        <h3>{es ? 'Cómo se reparten los contratos' : 'How the contracts fall'}</h3>
        <div className="ct-table-wrap" tabIndex={0} role="region" aria-label={es ? 'Umbrales y distribución del indicador de riesgo' : 'Risk-indicator thresholds and distribution'}>
          <table className="ct-table mt-fit mt-levels">
            <caption className="sr-only">{es ? 'Umbrales y distribución del indicador de riesgo' : 'Risk-indicator thresholds and distribution'}</caption>
            <thead>
              <tr>
                <th scope="col">{t('body.overview.tableColLevel')}</th>
                <th scope="col">{t('body.overview.tableColThreshold')}</th>
                <th scope="col" className="mt-lvl-mcol">{t('body.overview.tableColMeaning')}</th>
                <th scope="col" className="num">{t('body.overview.tableColDistribution')}</th>
                <th scope="col" className="num">{t('body.overview.tableColCount')}</th>
              </tr>
            </thead>
            <tbody>
              {LEVELS.map((l) => {
                const p = pctOf(l.key)
                const c = countOf(l.key)
                return (
                  <tr key={l.key}>
                    <td className="nowrap"><span className="ct-sq" style={{ ['--c' as string]: l.key === 'low' ? 'var(--color-text-muted)' : RISK_COLORS[l.key] }} aria-hidden="true" />{levelWord(l.label)}<small className="mt-lvl-m">{t(`dataLabels.riskMeaning${l.label}`)}</small></td>
                    <td className="mono nowrap">{l.threshold}</td>
                    <td className="mt-lvl-mcol">{t(`dataLabels.riskMeaning${l.label}`)}</td>
                    <td className="num">{p != null ? `${p.toFixed(1)}%` : unavailable}</td>
                    <td className="num">{c != null ? c.toLocaleString(loc) : unavailable}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="ct-note">{t('body.overview.tableFootnote')}</p>
      </PfSection>

      {/* ── 2 · where the data comes from ────────────────────────────────── */}
      <PfSection
        id="data-sources"
        title={es ? '¿De dónde salen los datos?' : 'Where does the data come from?'}
        claim={es
          ? 'Todo sale de registros públicos: CompraNet de 2002 al 28 de septiembre de 2025. Desde entonces, ComprasMX, cada semana.'
          : 'All of it comes from public records: CompraNet from 2002 to 28 September 2025. Since then, ComprasMX, every week.'}
      >
        <PfProse>
          <p>
            {es
              ? 'Los registros viejos son más pobres. Antes de 2010 casi ningún contrato trae el RFC del proveedor. Lo que vea de esos años pesa menos.'
              : 'Older records are thinner. Before 2010 almost no contract carries the supplier’s tax ID. Whatever you see for those years counts for less.'}
          </p>
          <p>
            {es
              ? <>Corte actual: {cut}. Descargas, API y diccionario en <Link to="/datos" className="ct-link">Los datos</Link>.</>
              : <>Current cut: {cut}. Downloads, API and dictionary in <Link to="/datos" className="ct-link">The data</Link>.</>}
          </p>
        </PfProse>
        <div className="ct-table-wrap" tabIndex={0} role="region" aria-label={t('body.dataSources.tableAriaLabel')}>
          <table className="ct-table">
            <caption className="sr-only">{t('body.dataSources.tableAriaLabel')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('body.dataSources.tableColStructure')}</th>
                <th scope="col">{t('body.dataSources.tableColYears')}</th>
                <th scope="col">{t('body.dataSources.tableColQuality')}</th>
                <th scope="col" className="num">{t('body.dataSources.tableColRfc')}</th>
                <th scope="col">{t('body.dataSources.tableColNotes')}</th>
              </tr>
            </thead>
            <tbody>
              {DATA_STRUCTURES.map((ds) => (
                <tr key={ds.s}>
                  <td className="font-semibold">{ds.s}</td>
                  <td className="mono nowrap">{ds.years}</td>
                  <td>{t(`dataLabels.structure${ds.s}_quality`)}</td>
                  <td className="num">{ds.rfc}</td>
                  <td>{t(`dataLabels.structure${ds.s}_desc`)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="ct-note">
          {es
            ? <>«Cobertura RFC»: contratos que traen RFC en el registro original de CompraNet. La parte de contratos cuyo proveedor tiene RFC en el padrón de proveedores, otra medida, está en <Link to="/datos#dt-horizon" className="ct-link">Los datos</Link>.</>
            : <>«RFC coverage»: contracts that carry an RFC in the original CompraNet record. The share of contracts whose vendor has an RFC in the vendor registry, a different measure, is in <Link to="/datos#dt-horizon" className="ct-link">The data</Link>.</>}
        </p>
        <AnnexFold id="record-detail" title={{ es: 'El registro en detalle: horizonte, huecos y fechas', en: 'The record in detail: horizon, gaps and dates' }}>
          <p>{t('body.dataSources.p1Start')}<b>{t('body.dataSources.p1Strong')}</b>{t('body.dataSources.p1End')}</p>
          <h3 className="mt-h3">{t('body.dataSources.horizonLabel')}</h3>
          <p>{t('body.dataSources.horizonBodyStart')}<b>{t('body.dataSources.horizonBodyStrong', { cut })}</b>{t('body.dataSources.horizonBodyEnd')}</p>
          <p>
            {t('body.dataSources.horizonNote', { cut })}
            {GAP_LIVE && <>{' '}<Link to="/gap" className="ct-link">{t('body.dataSources.horizonGapLink')}</Link></>}
          </p>
          <h3 className="mt-h3">{t('body.dataSources.gapsLabel')}</h3>
          <p>{t('body.dataSources.gapsBody')}</p>
          <p><b>{t('body.dataSources.gapsPartialStrong')}</b>{t('body.dataSources.gapsPartialBody')}</p>
          <h3 className="mt-h3">{t('body.dataSources.datingLabel')}</h3>
          <p>{t('body.dataSources.datingBody')}</p>
        </AnnexFold>
        <OpenDataNote lang={lang} />
      </PfSection>

      {/* ── 3 · what pushes it up ─────────────────────────────────────────── */}
      <PfSection
        id="features"
        title={es ? '¿Qué sube el indicador?' : 'What pushes the indicator up?'}
        claim={es
          ? 'El indicador no mira quién es el proveedor; mira cómo se le compró.'
          : 'The indicator doesn’t look at who the supplier is; it looks at how it was bought from.'}
      >
        <PfProse>
          <p>
            {es
              ? <>{chip(MAYPO)} le ha vendido a cerca de 90 dependencias, y eso sube su número. También sube cuando los montos cambian mucho frente a contratos parecidos. Y cuando el proveedor depende de pocos compradores.</>
              : <>{chip(MAYPO)} has sold to close to 90 agencies, and that pushes its number up. It also rises when amounts swing a lot against similar contracts. And when the supplier depends on a few buyers.</>}
          </p>
          <p>
            {es
              ? <>Para usted: un número alto le dice <em>dónde</em> buscar, y la ficha del contrato le dice <em>por qué</em>.</>
              : <>For you: a high number tells you <em>where</em> to look; the contract page tells you <em>why</em>.</>}
          </p>
        </PfProse>
        <BalanzaLedger aside={
          <div className="mt-aside">
            <h3 className="mt-h3">{es ? 'Cómo leer la lámina' : 'How to read the plate'}</h3>
            <p>{t('body.findings.finding1Body')}</p>
            <p>{t('body.findings.breadthLimit')}</p>
          </div>
        } />
      </PfSection>

      {/* ── 4 · what it does not say ─────────────────────────────────────── */}
      <PfSection
        id="limitations"
        title={es ? '¿Qué NO dice?' : 'What does it NOT say?'}
        claim={es ? 'No dice que hubo corrupción.' : 'It does not say there was corruption.'}
      >
        <PfProse>
          <p>
            {es
              ? 'Lee cómo se adjudicó un contrato, no cómo se cumplió. Si una obra se infló después de firmarse, aquí no se ve. Un proveedor con menos de tres contratos previos casi nunca sale alto. Ahí, «Bajo» puede querer decir «sin historial», no «limpio».'
              : 'It reads how a contract was awarded, not how it was carried out. If a project was padded after signing, you won’t see it here. A supplier with fewer than three earlier contracts almost never scores high. There, «Low» can mean «no history», not «clean».'}
          </p>
          <p>
            {es
              ? <>Y no sirve para ver a un proveedor amarrado a una sola dependencia; para eso está la página de <Link to="/captura" className="ct-link">Captura</Link>.</>
              : <>And it can’t see a supplier tied to a single agency; that’s what the <Link to="/captura" className="ct-link">Capture</Link> page is for.</>}
          </p>
        </PfProse>
        <AnnexFold id="limitations-detail" title={{ es: `Las ${limitationRows.length} limitaciones, una por una`, en: `All ${limitationRows.length} limitations, one by one` }}>
          <p>{t('limitations.intro')}</p>
          <div className="ct-table-wrap" tabIndex={0} role="region" aria-label={t('limitations.tableAria')}>
            <table className="ct-table mt-fit mt-lims">
              <caption className="sr-only">{t('limitations.tableAria')}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('limitations.colLimitation')}</th>
                  <th scope="col">{t('limitations.colImpact')}</th>
                  <th scope="col">{t('limitations.colPath')}</th>
                </tr>
              </thead>
              <tbody>
                {limitationRows.map((r) => (
                  <tr key={r}>
                    <td>{t(`limitationsTable.row${r}_l`)}</td>
                    <td>{t(`limitationsTable.row${r}_i`)}</td>
                    <td data-l={t('limitations.colPath')}>{t(`limitationsTable.row${r}_f`)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </AnnexFold>
      </PfSection>

      {/* ── 5 · how we know it works ─────────────────────────────────────── */}
      <PfSection
        id="validation"
        title={es ? '¿Cómo sabemos que funciona?' : 'How do we know it works?'}
        claim={es
          ? 'Lo probamos como si fuera el pasado. Aprendió con años anteriores y adivinó el siguiente.'
          : 'We tested it as if it were the past. It learned from earlier years and guessed the next one.'}
      >
        <PfProse>
          <p>
            {es
              ? `Entre un proveedor con caso y uno sin caso, acierta ${pairs} de cada 100. Pero mucho de eso es tamaño. Ordenar solo por el dinero previo del proveedor acierta casi igual.`
              : `Given one supplier with a case and one without, it put the right one on top ${pairs} times out of 100. But much of that is size. Ranking by the supplier’s earlier money does almost as well.`}
          </p>
          <p>
            {es
              ? 'Para usted: un número alto en una empresa grande dice algo, pero poco más que «es grande».'
              : 'For you: a high number on a big company says something, but not much more than «it’s big».'}
          </p>
        </PfProse>
        <CalibrationRecord />
        <TwoWorldsExhibit />
        <AnnexFold id="test-detail" title={{ es: 'La prueba, con todos sus números', en: 'The test, with all its numbers' }}>
          <p>{t('body.validation.p1Start')}<b>{t('body.validation.p1Strong', cc)}</b>{t('body.validation.p1End')}</p>
          <p>{t('body.overview.pSizeBaseline')}</p>
          <dl className="plt-ledger">
            <div><dt>{t('body.validation.metricTestAuc')}</dt><dd className="ct-mono">{MODEL_AUC} [{MODEL_AUC_CI}]</dd></div>
            <div><dt>{t('body.validation.metricTrainAuc')}</dt><dd className="ct-mono">{MODEL_AUC_SIZE}</dd></div>
            <div><dt>{t('body.validation.metricOecdRate')}</dt><dd className="ct-mono">{hr}</dd></div>
          </dl>
          <p className="ct-note">{es ? `Prueba ${CURRENT_MODEL_VERSION}, corrida ${DOC_RUN}.` : `${CURRENT_MODEL_VERSION} test, run ${DOC_RUN}.`}</p>
          <p>{t('body.validation.technicalNote')}</p>
          <h3 className="mt-h3">{es ? 'Las condiciones firmadas' : 'The signed conditions'}</h3>
          <p>{t('body.validation.gateBBody')}</p>
          <p>{t('body.validation.footnote')}</p>
          <p>{t('body.validation.fpNote')}</p>
        </AnnexFold>
      </PfSection>

      {/* ── 6 · what we do about mistakes ────────────────────────────────── */}
      <PfSection
        id="errors"
        title={es ? '¿Qué hacemos con los errores?' : 'What do we do about mistakes?'}
        claim={es ? 'Los datos oficiales traen errores, y los nuestros también.' : 'Official data has errors, and so do we.'}
      >
        <PfProse>
          <p>
            {es
              ? 'Rechazamos todo contrato de más de 100 mil millones de pesos. Casi siempre es un punto decimal mal puesto.'
              : 'We reject any contract above 100 billion pesos, because it is almost always a misplaced decimal point.'}
          </p>
          <p>
            {es
              ? 'En octubre de 2026 hallamos un error: el modelo anterior miraba años posteriores al contrato. Lo reemplazamos y retiramos su cifra principal. Si citó un número anterior a esa fecha, revíselo contra el de hoy.'
              : 'In October 2026 we found an error: the previous model looked at years after each contract. We replaced it and withdrew its headline figure. If you quoted a number from before then, check it against today’s.'}
          </p>
        </PfProse>
        <AnnexFold id="correccion" title={{ es: 'La corrección de octubre de 2026 y la validación de montos', en: 'The October 2026 correction and amount validation' }}>
          <h3 className="mt-h3">{t('body.validation.lookAheadTitle')}</h3>
          {([1, 2, 3, 4] as const).map((k) => <p key={k}>{t(`body.validation.lookAheadP${k}`)}</p>)}
          <h3 className="mt-h3">{es ? 'Validación de montos' : 'Amount validation'}</h3>
          <p><b>{t('body.dataSources.rejectStrong')}</b>{t('body.dataSources.rejectEnd')}</p>
          <p><b>{t('body.dataSources.flagStrong')}</b>{t('body.dataSources.flagEnd')}</p>
          <p className="ct-note">{t('body.dataSources.context')}</p>
        </AnnexFold>
      </PfSection>

      {/* ── 7 · how the investigation queue is ordered ───────────────────── */}
      <PfSection
        id="focos-rojos"
        title={es ? '¿Cómo se ordena la fila de investigación?' : 'How is the investigation queue ordered?'}
        claim={es
          ? <><Link to="/aria" className="ct-link">Focos Rojos</Link> ordena a los proveedores para que una persona los revise.</>
          : <><Link to="/aria" className="ct-link">Red Flags</Link> orders suppliers for a person to review.</>}
      >
        <PfProse>
          <p>
            {es
              ? 'Junta el indicador con registros externos, como las listas del SAT o un caso ya conocido. Sin un registro externo, nadie llega al primer nivel.'
              : 'It combines the indicator with outside records, such as the tax authority’s lists or a known case. Without an outside record, no one reaches the top tier.'}
          </p>
          <p>
            {es
              ? <>{chip(FALCON)} está en ese primer nivel por un caso que un analista documentó con prensa y auditorías. Aun así, estar arriba es una razón para mirar, no un hallazgo.</>
              : <>{chip(FALCON)} sits in that top tier by a case an analyst documented from press and audits. Even so, being on top is a reason to look, not a finding.</>}
          </p>
        </PfProse>
        <AnnexFold id="ips" title={{ es: 'Cómo se calcula el orden (IPS, niveles y señales)', en: 'How the order is computed (IPS, tiers and signals)' }}>
          <FocosRojosMethod lang={lang} />
        </AnnexFold>
      </PfSection>

      {/* ── 8 · every other method (PURPLE-2: docs/METHODOLOGY_COVERAGE_2026-11-05.md) ── */}
      <PfSection
        id="otros"
        title={es ? '¿Qué más medimos?' : 'What else do we measure?'}
        claim={es
          ? 'Además del indicador: contamos dinero, unimos nombres y cruzamos listas oficiales.'
          : 'Besides the indicator: we count money, join names and cross official lists.'}
      >
        <OtrosMetodos lang={lang} />
      </PfSection>

      {/* ── 9 · how to quote it ──────────────────────────────────────────── */}
      <PfSection
        id="quote"
        title={es ? '¿Cómo debo citarlo?' : 'How should I quote it?'}
        claim={es
          ? 'Diga «indicador de riesgo», nunca «probabilidad de corrupción».'
          : 'Say «risk indicator», never «probability of corruption».'}
      >
        <PfProse>
          <p>
            {es
              ? 'Si solo tiene el número del modelo, diga «patrón estadístico» o «señalado para revisión». Diga «confirmado» solo cuando lo confirmó una autoridad, como el SAT, la SFP o un juez.'
              : 'If all you have is the model’s number, say «statistical pattern» or «flagged for review». Say «confirmed» only when an authority confirmed it — the SAT, the SFP or a court.'}
          </p>
        </PfProse>
        <h3 id="confidence-tiers" className="scroll-mt-12">{es ? 'El valor probatorio: qué se puede decir con cada nivel de certeza' : 'Evidentiary weight: what each level of certainty lets you say'}</h3>
        <PfProse><p>{t('tiers.intro')}</p></PfProse>
        <div className="ct-table-wrap" tabIndex={0} role="region" aria-label={es ? 'Niveles de certeza y el lenguaje que autoriza cada uno' : 'Certainty tiers and the language each licenses'}>
          <table className="ct-table mt-tiers">
            <caption className="sr-only">{es ? 'Niveles de certeza y el lenguaje que autoriza cada uno' : 'Certainty tiers and the language each licenses'}</caption>
            <thead>
              <tr>
                <th scope="col">{es ? 'Nivel' : 'Tier'}</th>
                <th scope="col">{es ? 'Qué significa' : 'What it means'}</th>
                <th scope="col">{es ? 'Fuentes o ejemplos' : 'Sources or examples'}</th>
                <th scope="col">{t('tiers.sayLabel')}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="mt-td-h">{t('tiers.tierITitle')}<small>I</small></td>
                <td>{glueDashes(t('tiers.tierIBody'))}</td>
                <td><ul className="mt-ul">{([1, 2, 3] as const).map((k) => <li key={k}>{t(`tiers.tierISource${k}`).replace(/^[·•]\s*/, '')}</li>)}</ul></td>
                <td>{t('tiers.tierISay')}</td>
              </tr>
              <tr>
                <td className="mt-td-h">{t('tiers.tierIITitle')}<small>II</small></td>
                <td>{glueDashes(t('tiers.tierIIBody'))}</td>
                <td><ul className="mt-ul">{([1, 2, 3] as const).map((k) => <li key={k}>{t(`tiers.tierIIEx${k}`).replace(/^[·•]\s*/, '')}</li>)}</ul></td>
                <td>{t('tiers.tierIISay')}</td>
              </tr>
              <tr>
                <td className="mt-td-h">{t('tiers.tierIIITitle')}<small>III</small></td>
                <td>{t('tiers.tierIIIBodyStart')}<b>{t('tiers.tierIIIBodyStrong')}</b></td>
                <td><ul className="mt-ul">{([1, 2, 3] as const).map((k) => <li key={k}>{t(`tiers.tierIIIEx${k}`, { n: highPlusCount }).replace(/^[·•]\s*/, '')}</li>)}</ul></td>
                <td>{t('tiers.tierIIISay')}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <PfProse><p><b>{t('tiers.criticalRuleLabel')} </b>{glueDashes(t('tiers.criticalRuleBody'))}</p></PfProse>
      </PfSection>

      {/* ── F · for specialists (draft § 4) ──────────────────────────────── */}
      <PfSection
        id="specialists"
        title={es ? 'Para especialistas' : 'For specialists'}
        claim={es ? 'Las matemáticas, dichas en llano. Todo está plegado: ábralo solo si lo necesita.' : 'The math, plainly. Everything is folded: open it only if you need it.'}
      >
        <AnnexFold id="model-notes" title={{ es: 'El modelo en siete notas', en: 'The model in seven notes' }}>
          <ul className="mt-ul">
            <li>{es
              ? <><b>El modelo.</b> Una regresión logística con penalización ElasticNet (C = {FOLD.C}, l1_ratio = {FOLD.l1}), un solo modelo para todo el país. Las diferencias entre sectores entran porque cada variable se compara con su propio sector en los últimos tres años, sin contar el contrato calificado.</>
              : <><b>The model.</b> A logistic regression with an ElasticNet penalty (C = {FOLD.C}, l1_ratio = {FOLD.l1}), one model for the whole country. Sector differences enter because each feature is compared with its own sector over the last three years, leaving out the contract being scored.</>}</li>
            <li>{es
              ? <><b>Lo que pesa más</b>, en las unidades que usa el sistema: montos muy dispares +0.81, concentración previa de compradores +0.77, amplitud (dependencias atendidas antes, en logaritmo) +0.59, monto frente a contratos parecidos +0.46; la concentración de socios de co-adjudicación baja el valor (−0.30). Fin de año queda en cero. Pasar de 3 a 10 dependencias previas suma cerca de +0.60 en la escala interna.</>
              : <><b>What weighs most</b>, in the units the system serves: uneven contract sizes +0.81, prior buyer concentration +0.77, breadth (agencies served before, log) +0.59, amount vs similar contracts +0.46; concentration of co-award partners lowers the value (−0.30). Year-end is at zero. Going from 3 to 10 earlier agencies adds about +0.60 on the internal scale.</>}</li>
            <li>{es
              ? <><b>La corrección por casos que nadie documentó.</b> Los contratos sin caso no son necesariamente limpios. Dividimos entre una constante ({FOLD.cpu}) que corrige eso; pero los casos conocidos son escándalos grandes, no una muestra al azar, así que la constante es una escala, no la fracción real de casos detectados.</>
              : <><b>The correction for cases nobody documented.</b> Contracts with no case aren’t necessarily clean. We divide by a constant ({FOLD.cpu}) to correct for that; but known cases are big scandals, not a random sample, so the constant is a scale, not the true share of cases caught.</>}</li>
            <li>{es
              ? <><b>La escala.</b> El punto de partida ({FOLD.intercept}) se fija para que cerca de 10 % de los contratos llegue a alto o más; un factor T = {FOLD.T} suaviza la pendiente sin cambiar el orden. Por eso el valor de 0 a 1 no es una probabilidad. Arriba de 0.60 el número que se muestra se comprime y no pasa de 0.95; sin eso, 89 mil contratos quedaban empatados en 1.00. El valor sin comprimir se guarda para reproducir el cálculo.</>
              : <><b>The scale.</b> The starting point ({FOLD.intercept}) is set so about 10 % of contracts reach high or above; a factor T = {FOLD.T} flattens the slope without changing the order. That is why the 0–1 value is not a probability. Above 0.60 the displayed number is compressed and never passes 0.95; without that, 89 thousand contracts tied at 1.00. The uncompressed value is stored so the calculation can be reproduced.</>}</li>
            <li>{es
              ? <><b>La prueba.</b> {FOLD.vendorYears} proveedor-año con caso apartado frente a proveedor-año sin caso, 2019–2025; bootstrap por proveedor, 1,000 réplicas. AUC {MODEL_AUC} (IC 95 % {MODEL_AUC_CI}); a igual tamaño {MODEL_AUC_SIZE} ({FOLD.sizeCi}), es decir {sizePairs} de cada 100. Ordenar solo por el dinero previo da {FOLD.moneyOnly}. Condiciones firmadas antes: cota inferior ≥ 0.65 y superar a esa regla a igual tamaño (diferencia {FOLD.marginCi}). Nada se ajustó con esta prueba; el conjunto de prueba ya se había visto una vez (prerregistro 1).</>
              : <><b>The test.</b> {FOLD.vendorYears} held-out case vendor-years against non-case vendor-years, 2019–2025; vendor bootstrap, 1,000 resamples. AUC {MODEL_AUC} (95 % CI {MODEL_AUC_CI}); same-size {MODEL_AUC_SIZE} ({FOLD.sizeCi}), that is {sizePairs} in 100. Ranking by prior money alone gives {FOLD.moneyOnly}. Conditions signed in advance: lower bound ≥ 0.65 and beat that rule at equal size (difference {FOLD.marginCiEn}). Nothing was tuned on this test; the test set had been looked at once before (pre-registration 1).</>}</li>
            <li>{es
              ? <><b>Los casos.</b> {cc.atTraining} casos al entrenar; {FOLD.leads} son pistas que el modelo o ARIA encontró y un analista documentó, así que la exactitud solo se mide con proveedores apartados y en años posteriores.</>
              : <><b>The cases.</b> {cc.atTraining} cases at training; {FOLD.leads} are leads the model or ARIA found and an analyst documented, so accuracy is measured only on held-out vendors in later years.</>}</li>
            <li>{es
              ? <><b>Dos listas que casi no coinciden.</b> El modelo marca {num(worlds?.model_flags)} proveedores; el registro oficial (EFOS definitivo del SAT y sanciones de la SFP) tiene {num(worlds?.official_record)}; solo {num(worlds?.overlap)} están en las dos.</>
              : <><b>Two lists that barely overlap.</b> The model flags {num(worlds?.model_flags)} suppliers; the official record (SAT definitive EFOS and SFP sanctions) has {num(worlds?.official_record)}; only {num(worlds?.overlap)} are on both.</>}</li>
          </ul>
        </AnnexFold>
        <AnnexFold id="findings" title={{ es: 'La fórmula, las variables y lo que encontramos', en: 'The formula, the features and what we found' }}>
          <Formula>{t('body.overview.formulaExpr')}</Formula>
          <p>{t('body.overview.formulaDescStart')}<b>{t('body.overview.formulaDescStrong')}</b>{t('body.overview.formulaDescEnd')}</p>
          <p>{t('body.features.p1')}</p>
          <p>{t('body.overview.highRiskSummaryStart')}<b>{hr}</b>{t('body.overview.highRiskSummaryEnd')}</p>
          <h3 className="mt-h3">{t('body.findings.breadthTitle')}</h3>
          <p>{t('body.findings.breadthBody')}</p>
          <p><b>{t('body.findings.finding3BodyStrong')}</b>{t('body.findings.finding3BodyEnd')}</p>
          <p><b>{t('body.findings.finding4Strong')}</b>{t('body.findings.finding4End')}</p>
        </AnnexFold>
        <AnnexFold id="risk-evidence" title={{ en: 'The evidence base for each factor', es: 'La base de evidencia de cada factor' }}>
          <p>{t('body.riskEvidence.p1')}</p>
          {/* only factors in v0.9.2; the five retired in the as-of rebuild would read as «0.000 in the model» */}
          <RiskFactorTable factors={['price_volatility', 'institution_diversity', 'price_ratio', 'sector_spread', 'vendor_concentration', 'network_member_count', 'same_day_count', 'single_bid', 'direct_award', 'win_rate', 'year_end']} />
        </AnnexFold>
        <AnnexFold id="methods" title={{ en: 'The full math', es: 'Las matemáticas completas' }}>
          <h3 className="mt-h3">{t('body.methods.zScoreTitle')}</h3>
          <p>{t('body.methods.zScoreP1')}</p>
          <Formula>{t('body.methods.zScoreFormula')}</Formula>
          <h3 className="mt-h3">{t('body.methods.logisticTitle')}</h3>
          <p>{t('body.methods.logisticP1')}</p>
          <p className="ct-note">{t('body.methods.logisticNote')}</p>
          <h3 className="mt-h3">{t('body.methods.puTitle')}</h3>
          <p>{t('body.methods.puP1Start')}<span className="ct-mono">S(x) = P(labeled=1|x) / c</span></p>
          <p className="ct-note">{t('body.methods.puNote')}</p>
          <h3 className="mt-h3">{t('body.methods.bootstrapTitle')}</h3>
          <p>{t('body.methods.bootstrapP1')}</p>
        </AnnexFold>
      </PfSection>

      {/* ── H · history and sources ──────────────────────────────────────── */}
      <PfSection
        id="history"
        title={es ? 'Historia y fuentes' : 'History and sources'}
        claim={t('evolution.subtitle')}
      >
        <AnnexFold id="evolution" title={{ en: `Every version, ${EVOLUTION.length} steps`, es: `Cada versión, ${EVOLUTION.length} pasos` }}>
          <div className="ct-table-wrap" tabIndex={0} role="region" aria-label={t('evolution.title')}>
            <table className="ct-table">
              <caption className="sr-only">{t('evolution.title')}</caption>
              <thead>
                <tr>
                  <th scope="col">{es ? 'Versión' : 'Version'}</th>
                  <th scope="col">{es ? 'Qué cambió' : 'What changed'}</th>
                  <th scope="col">{es ? 'Detalle' : 'Detail'}</th>
                </tr>
              </thead>
              <tbody>
                {EVOLUTION.map((k) => (
                  <tr key={k}>
                    <td className="mono nowrap">{EVOLUTION_LABEL[k]}</td>
                    <td className="nowrap">{t(`evolution.steps.${k}Title`)}</td>
                    <td>{t(`evolution.steps.${k}Desc`, cc)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3 className="mt-h3">{t('body.findings.finding2Title')}</h3>
          <ol className="mt-ol">
            {([1, 2, 3] as const).map((k) => (
              <li key={k}>
                <b>{t(`body.findings.finding2Item${k}Strong`)}</b>{' '}
                <span className="ct-mono">{t(`body.findings.finding2Item${k}Mono`)}</span>{t(`body.findings.finding2Item${k}End`)}
              </li>
            ))}
          </ol>
        </AnnexFold>
        <AnnexFold id="v33" title={{ en: `The previous weighted model (v3.3) and its ${V33_WEIGHTS.length} weights`, es: `El modelo ponderado anterior (v3.3) y sus ${V33_WEIGHTS.length} pesos` }}>
          <p>{t('body.v33section.p1Start')}<b>{t('body.v33section.p1Strong')}</b>{t('body.v33section.p1End')}<span className="ct-mono">{t('body.v33section.p1Mono')}</span>{t('body.v33section.p1MonoEnd')}</p>
          <div className="mt-weights" role="list" aria-label={t('dataLabels.ariaRiskFactorWeights')}>
            {[...V33_WEIGHTS].sort((a, b) => b.weight - a.weight).map((w) => (
              <div key={w.nameKey} role="listitem">
                <span>{t(`v33WeightNames.${w.nameKey}`)}</span>
                <HatchBar value={w.weight} max={20} color="var(--ct-ink)" />
                <span className="ct-mono">{w.weight}%</span>
              </div>
            ))}
          </div>
          <p className="ct-note">{t('body.v33section.bonusFactors')}</p>
        </AnnexFold>
        <h3 id="references" className="scroll-mt-12">{es ? 'Referencias' : 'References'}</h3>
        <ol className="mt-refs">
          {REFERENCES.map((ref, i) => (
            <li key={i}><b>{ref.authors}</b> ({ref.year}). {ref.title}.</li>
          ))}
        </ol>
        <CopyCitationButton />
        <p className="ct-note">{t('body.references.footer')}</p>
        <h3 id="next" className="scroll-mt-12">{es ? 'Adónde ir' : 'Where to go next'}</h3>
        <ul className="mt-next">
          <li><Link to="/mapa" className="ct-link">El Mapa</Link><span>{es ? 'El indicador de riesgo en los 12 sectores federales' : 'The risk indicator across the 12 federal sectors'}</span></li>
          <li><Link to={cieloHref({ lens: 'patterns' })} className="ct-link">{es ? 'Patrones' : 'Patterns'}</Link><span>{es ? 'Las 7 huellas que el modelo persigue, en los vínculos de El Mapa' : 'The 7 fingerprints the model chases, in the Map’s connections'}</span></li>
          <li><Link to="/aria" className="ct-link">{es ? 'Focos Rojos (ARIA)' : 'Red Flags (ARIA)'}</Link><span>{es ? 'Los proveedores priorizados en la fila de investigación' : 'Vendors prioritised in the investigation queue'}</span></li>
        </ul>
      </PfSection>

      {/* Declaraciones as the folded foot notes (main 30957c9b system pass § G1) */}
      <FootNotes lang={es ? 'es' : 'en'} lead={es
        ? 'El modelo lee cómo se adjudicaron los contratos, no cómo se ejecutaron. Un indicador de riesgo alto señala anomalías estadísticas en la contratación, no prueba de un delito, que solo los tribunales determinan.'
        : 'The model reads how contracts were awarded, not how they were performed. A high risk indicator marks statistical anomalies in procurement, not proof of wrongdoing, which only courts establish.'} items={[
        es
          ? `Datos de CompraNet 2002–2025 y de ComprasMX hasta el ${cut}. Modelo de riesgo ${CURRENT_MODEL_VERSION} (${DOC_RUN}) entrenado con la base de casos etiquetados de RUBLI (casos registrados al entrenar, octubre de 2026: ${cc.atTraining}; hoy: ${cc.today}; la mayoría documentados por analistas, no resoluciones). El archivo federal de CompraNet se congeló el 28 de septiembre de 2025 tras su abolición. Las señales del modelo son indicadores estadísticos, no determinaciones legales.`
          : `CompraNet data 2002–2025 and ComprasMX data up to ${cut}. ${CURRENT_MODEL_VERSION} risk model (${DOC_RUN}) trained on RUBLI’s labelled case set (cases on record at training, October 2026: ${cc.atTraining}; today: ${cc.today}; most of them analyst write-ups rather than adjudicated findings). CompraNet’s federal feed froze on 28 September 2025 after it was abolished. Model signals are statistical indicators, not legal determinations.`,
        es
          ? 'La marca «Señalado por IA» de la ficha de contrato aparece cuando el indicador es alto o crítico y, aparte, la capa de anomalías (Isolation Forest + COPOD) da 0.5 o más. Es una coincidencia de dos métodos, no una confirmación: «confirmado» queda para el SAT, la SFP o un juez.'
          : 'The «AI-flagged» mark on the contract page appears when the indicator is high or critical and, separately, the anomaly layer (Isolation Forest + COPOD) gives 0.5 or more. It is two methods agreeing, not a confirmation: «confirmed» is kept for the SAT, the SFP or a court.',
      ]} />
    </PfShell>
  )
}

export default Methodology
