/**
 * Prensa / Press — the press kit (Plataforma remake, 2026-10-28).
 *
 * What RUBLI is (with the live distribution strip) → what is verified, each finding with the page
 * that shows it and the day it was checked on prod (docs/press/KIT_2026-11.md § 8) → how to cite →
 * the data → how to use it → the model → the limits to cite → contact. Live counts come from the
 * dashboard bundle (the Portada's request); a missing figure prints «—», never a typed number.
 * Pseudonymous: no author name, no personal repository link. «indicador de riesgo», never probability.
 */
import { Link } from 'react-router-dom'
import { useCaseCountLabels } from '@/hooks/useGroundTruthCount'
import { useExecutiveData } from '@/hooks/useExecutiveData'
import { DATA_CUT_YEAR, DATASET_DOI, DATASET_RELEASE, DATASET_VERSION, CURRENT_MODEL_VERSION, MODEL_AUC, MODEL_AUC_CI, MODEL_AUC_SIZE, MODEL_AUC_LABEL, MODEL_FEATURES } from '@/lib/constants'
import { formatNumber, formatDualCurrency } from '@/lib/utils'
import { tidy } from '@/lib/typography'
import { fmtBytes as fmtGB, riskShares } from '@/lib/plataforma/figures'
import { useLang } from '@/components/contrato/nav'
import { CAPTURA_TITLE } from '@/lib/captura/title'
import { PfShell, PfSection, PfProse, PfFlow, RiskStrip } from '@/components/plataforma/Plataforma'
import { pressLectura } from '@/lib/plataforma/lectura'

/** Findings re-verified on prod 2026-10-26 (KIT_2026-11 § 8); all three rows re-checked against prod 2026-11-07 (/captura/plates, /contracts?min_amount=1e9: 871, 2.699T of 10.458T) (rerun precompute_captura on prod → update these), with the wording the kit makes mandatory. */
const VERIFIED = [
  {
    to: '/captura',
    page: CAPTURA_TITLE,
    es: '3,957 proveedores reciben el 80% o más de su dinero federal de un solo comprador. Son 150 compradores y 1.79 billones de pesos (2002–2025). 847 siguen firmando contratos federales después del 28 de septiembre de 2025.',
    en: '3,957 suppliers get 80% or more of their federal money from a single buyer. That is 150 buyers and 1.79 trillion pesos (2002–2025). 847 still sign federal contracts after 28 September 2025.',
  },
  {
    to: '/captura',
    page: { es: `${CAPTURA_TITLE.es} · IMSS`, en: `${CAPTURA_TITLE.en} · IMSS` },
    es: 'IMSS: 24 de cada 100 pesos van a 1,127 proveedores que dependen de él.',
    en: 'IMSS: 24 of every 100 pesos go to 1,127 suppliers that depend on it.',
  },
  {
    to: '/contracts',
    page: { es: 'El Archivo', en: 'The Archive' },
    es: '871 contratos de más de 1,000 millones de pesos se llevan el 25.8% del dinero (CompraNet y ComprasMX).',
    en: '871 contracts above 1,000 million pesos take 25.8% of the money (CompraNet and ComprasMX).',
  },
] as const


export default function Press() {
  const es = useLang() === 'es'
  const cc = useCaseCountLabels(es ? 'es' : 'en') // computed, never typed
  const { ariaStats, executiveSummary } = useExecutiveData()

  const total = executiveSummary?.headline?.total_contracts ?? null
  const value = executiveSummary?.headline?.total_value ?? null
  const risk = executiveSummary?.risk
  const tc = ariaStats?.tier_counts
  const tier = (k: string) => (typeof tc?.[k] === 'number' ? (tc[k] as number) : null)
  const t1 = tier('1')
  const t2 = tier('2')

  return (
    <PfShell
      className="press-page"
      title={es ? 'Prensa' : 'Press'}
      lede={es
        ? 'RUBLI es una plataforma independiente de código abierto que analiza el gasto en contratación pública federal de México. Aquí, lo que puede citar y cómo.'
        : 'RUBLI is an independent, open-source platform that analyzes Mexican federal procurement spending. Here, what you can cite and how.'}
      guide={es
        ? { q: '¿Qué puedo citar de RUBLI y cómo debo decirlo?', see: 'Qué es RUBLI, las cifras verificadas y la frase para citarlo.', read: 'Cada cifra trae la página que la muestra. Revísela en vivo.', means: 'Cite «indicador de riesgo». Un número alto no prueba nada.' }
        : { q: 'What can I quote from RUBLI, and how should I say it?', see: 'What RUBLI is, the verified figures and the sentence to quote it.', read: 'Each figure comes with the page that shows it. Check it live.', means: 'Quote «risk indicator». A high number proves nothing.' }}
      lectura={pressLectura(es ? 'es' : 'en', { highRate: risk?.high_risk_rate })}
      index={[
        { id: 'what', label: es ? 'Qué es' : 'What it is' },
        { id: 'verified', label: es ? 'Lo verificado' : 'What is verified' },
        { id: 'cite', label: es ? 'Cómo citar' : 'How to cite' },
        { id: 'data', label: es ? 'Los datos' : 'The data' },
        { id: 'use', label: es ? 'Cómo usarlo' : 'How to use it' },
        { id: 'method', label: es ? 'El modelo' : 'The model' },
        { id: 'limits', label: es ? 'Limitaciones' : 'Limitations' },
        { id: 'contact', label: es ? 'Contacto' : 'Contact' },
      ]}
      facts={[
        { k: es ? `Contratos federales, 2002–${DATA_CUT_YEAR}` : `Federal contracts, 2002–${DATA_CUT_YEAR}`, v: total != null ? formatNumber(total) : '—', n: 'CompraNet + ComprasMX' },
        { k: es ? 'Valor validado' : 'Validated value', v: value != null ? formatDualCurrency(value) : '—' },
        { k: es ? MODEL_AUC_LABEL.es : MODEL_AUC_LABEL.en, v: MODEL_AUC, n: es ? `modelo ${CURRENT_MODEL_VERSION}` : `model ${CURRENT_MODEL_VERSION}` },
      ]}
    >
      <PfSection
        id="what"
        title={es ? 'Qué es RUBLI' : 'What RUBLI is'}
        claim={es
          ? 'Indica dónde mirar; no reemplaza la investigación periodística. Un indicador alto no es prueba de nada.'
          : 'It indicates where to look; it does not replace reporting. A high indicator is not proof of anything.'}
      >
        <PfProse>
          <p>
            {es
              ? `RUBLI ordena por riesgo más de tres millones de contratos federales, de 2002 a ${DATA_CUT_YEAR}. Usa los datos públicos de CompraNet y, desde septiembre de 2025, de ComprasMX. Cada contrato y proveedor recibe un indicador de riesgo de 0 a 1. Mide cuánto se parecen sus montos, sus compradores y su historial a casos documentados. No busca empresas fantasma ni la captura por una sola dependencia. Eso se busca en Focos Rojos y en «${CAPTURA_TITLE.es}».`
              : `RUBLI ranks more than three million federal contracts by risk, from 2002 to ${DATA_CUT_YEAR}. It uses the public data of CompraNet and, since September 2025, of ComprasMX. Every contract and vendor gets a risk indicator from 0 to 1. It measures how much its amounts, its buyers and its history resemble documented cases. It does not look for ghost companies or capture by a single agency. Those are looked for in Red Flags and in “${CAPTURA_TITLE.en}”.`}
          </p>
          <p>
            {es
              ? <>Los proveedores con más señales a la vez forman la fila de investigación de <Link to="/aria" className="ct-link">Focos Rojos</Link>: {t1 != null ? formatNumber(t1) : '—'} en el nivel 1 y {t2 != null ? formatNumber(t2) : '—'} en el nivel 2.</>
              : <>The vendors with the most signals at once make up the <Link to="/aria" className="ct-link">Red Flags</Link> investigation queue: {t1 != null ? formatNumber(t1) : '—'} in tier 1 and {t2 != null ? formatNumber(t2) : '—'} in tier 2.</>}
          </p>
        </PfProse>
        <h3>{es ? `Contratos por indicador de riesgo, 2002–${DATA_CUT_YEAR}` : `Contracts by risk indicator, 2002–${DATA_CUT_YEAR}`}</h3>
        <RiskStrip shares={riskShares(risk)} />
      </PfSection>

      <PfSection
        id="verified"
        title={es ? 'Lo verificado' : 'What is verified'}
        claim={es
          ? 'Cifras revisadas en producción del 26 de octubre al 5 de noviembre de 2026. Cada una trae la página que la muestra. Revísela en vivo antes de publicar.'
          : 'Figures checked in production from 26 October to 5 November 2026. Each comes with the page that shows it. Check it live before you publish.'}
      >
        <dl className="plt-ledger">
          {VERIFIED.map((f) => (
            <div key={f.es}>
              <dt><Link to={f.to} className="ct-link">{es ? f.page.es : f.page.en}</Link></dt>
              <dd>{es ? f.es : f.en}</dd>
            </div>
          ))}
          <div>
            <dt><Link to="/methodology" className="ct-link">{es ? 'Metodología' : 'Methodology'}</Link></dt>
            <dd>
              {es
                ? `Modelo ${CURRENT_MODEL_VERSION}, ${MODEL_FEATURES} variables medidas antes de cada contrato; AUC encadenado hacia adelante ${MODEL_AUC} (IC 95% ${MODEL_AUC_CI}), ${MODEL_AUC_SIZE} a igual tamaño de proveedor. No es comparable con el 0.852 de v0.9.1.`
                : `Model ${CURRENT_MODEL_VERSION}, ${MODEL_FEATURES} features measured before each contract; forward-chained AUC ${MODEL_AUC} (95% CI ${MODEL_AUC_CI}), ${MODEL_AUC_SIZE} at equal vendor size. Not comparable with v0.9.1’s 0.852.`}
            </dd>
          </div>
        </dl>
        <p className="ct-note">
          {es
            ? 'Fuente de cada cifra: la verificación en producción del kit de prensa 2026.11. Una cifra que no está aquí no está verificada para citarse.'
            : 'Source of each figure: the 2026.11 press kit’s production check. A figure not listed here is not verified for quoting.'}
        </p>
      </PfSection>

      <PfSection
        id="cite"
        title={es ? 'Cómo citar los indicadores' : 'How to cite the indicators'}
        claim={es
          ? 'Diga «indicador de riesgo», nunca «probabilidad de corrupción». Añada siempre que no es prueba.'
          : 'Say "risk indicator," never "probability of corruption." Always add that it is not proof.'}
      >
        <blockquote className="plt-pull">
          {tidy(es
            ? '«Según el sistema de detección de patrones RUBLI, que analiza datos públicos de contratación federal, este proveedor presenta un indicador de riesgo de [X], es decir, sus contratos comparten características estadísticas con casos documentados de irregularidades. Esto no constituye prueba de conducta ilícita.»'
            : '"According to the RUBLI pattern-detection system, which analyzes public federal procurement data, this vendor shows a risk indicator of [X], meaning its contracts share statistical characteristics with documented irregularity cases. This does not constitute proof of wrongdoing."', es ? 'es' : 'en')}
        </blockquote>
      </PfSection>

      <PfSection
        id="data"
        title={es ? 'Descargar los datos' : 'Download the data'}
        claim={es
          ? `Toda la base que usa este sitio, versión ${DATASET_VERSION}. El sitio y lo que venga: CC BY-NC 4.0. Las versiones 2026.10 y 2026.11 conservan CC BY 4.0.`
          : `The whole database behind this site, release ${DATASET_VERSION}. The site and what comes next: CC BY-NC 4.0. Releases 2026.10 and 2026.11 keep CC BY 4.0.`}
      >
        <dl className="plt-ledger">
          <div><dt>DOI</dt><dd><a href={`https://doi.org/${DATASET_DOI}`} target="_blank" rel="noopener noreferrer" className="ct-link ct-mono">{DATASET_DOI}</a></dd></div>
          <div><dt>{es ? 'Archivos' : 'Files'}</dt><dd>{es ? `SQLite completa (${fmtGB(DATASET_RELEASE.dbBytes)}) y versión ligera (${fmtGB(DATASET_RELEASE.liteBytes)}) · ${DATASET_RELEASE.csvTables} tablas en CSV · hoja de datos y diccionario` : `full SQLite (${fmtGB(DATASET_RELEASE.dbBytes)}) and lite version (${fmtGB(DATASET_RELEASE.liteBytes)}) · ${DATASET_RELEASE.csvTables} tables as CSV · datasheet and data dictionary`}</dd></div>
          <div><dt>{es ? 'Privacidad' : 'Privacy'}</dt><dd>{es ? 'sin RFC; en el conjunto descargable los proveedores que son personas físicas aparecen como «PERSONA FISICA <id>»' : 'no RFCs; in the downloadable set individual suppliers appear as «PERSONA FISICA <id>»'}</dd></div>
          <div><dt>{es ? 'Ficha técnica' : 'Data sheet'}</dt><dd><Link to="/datos" className="ct-link">{es ? 'Los datos: archivos, exportaciones, API y calidad' : 'The data: files, exports, API and quality'}</Link></dd></div>
        </dl>
      </PfSection>

      <PfSection
        id="use"
        title={es ? 'Cómo usarlo en una investigación' : 'How to use it in an investigation'}
        claim={es ? 'Del indicador al documento: buscar, priorizar, comparar y verificar en la fuente.' : 'From the indicator to the document: search, prioritise, compare and verify at the source.'}
      >
        <PfFlow
          label={es ? 'Cómo usar RUBLI en una investigación, en cuatro pasos' : 'How to use RUBLI in an investigation, in four steps'}
          steps={[
            { name: es ? 'Busque' : 'Search', note: es ? 'Un proveedor o una dependencia. Su expediente dice a quién vende y su indicador.' : 'A vendor or an agency. Its dossier shows who it sells to and its indicator.' },
            { name: <>{es ? 'Priorice en ' : 'Prioritise in '}<Link to="/aria" className="ct-link">{es ? 'Focos Rojos' : 'Red Flags'}</Link></>, note: es ? 'Los proveedores con más señales, filtrables por patrón.' : 'The vendors with the most signals, filterable by pattern.' },
            { name: <>{es ? 'Compare en ' : 'Compare in '}<Link to="/mapa" className="ct-link">{es ? 'El Mapa' : 'The Map'}</Link>{es ? ' e ' : ' and '}<Link to="/institutions" className="ct-link">{es ? 'Instituciones' : 'Institutions'}</Link></>, note: es ? 'Dónde se concentra el gasto señalado.' : 'Where flagged spending piles up.' },
            { focal: true, name: es ? 'Verifique en la fuente' : 'Verify at the source', note: es ? 'Baje el expediente en datos.gob.mx. Pida documentos por transparencia (SIPOT).' : 'Download the record on datos.gob.mx. Request documents through transparency (SIPOT).' },
          ]}
        />
      </PfSection>

      <PfSection
        id="method"
        title={es ? 'Cómo funciona el modelo' : 'How the model works'}
        claim={es
          ? `Una regresión logística sobre ${MODEL_FEATURES} señales medidas antes de cada contrato. En años que no vio, AUC ${MODEL_AUC}.`
          : `A logistic regression over ${MODEL_FEATURES} signals measured before each contract. On years it never saw, AUC ${MODEL_AUC}.`}
      >
        <PfProse>
          <p>
            {es
              ? `RUBLI usa una regresión logística ElasticNet con corrección PU-learning (Elkan y Noto, 2008). Lee ${MODEL_FEATURES} señales. El historial del proveedor solo mira años anteriores al contrato. Cada señal se compara con su sector en los últimos tres años. Así, una adjudicación directa en Defensa no pesa igual que en Educación.`
              : `RUBLI uses an ElasticNet logistic regression with PU-learning correction (Elkan & Noto 2008). It reads ${MODEL_FEATURES} signals. The vendor’s history looks only at years before the contract. Each signal is compared with its sector over the last three years, leaving the contract out. So a direct award in Defense, where it is the norm, does not weigh like one in Education.`}
          </p>
          <p>
            {es
              ? `Se entrenó con ${cc.atTraining} casos etiquetados; la mayoría los documentó un analista, no un juez. Se probó hacia adelante, de 2019 a 2025: cada año, con lo aprendido antes. Su AUC es ${MODEL_AUC} (de cada 100 pares caso/no-caso, acierta ${Math.round(Number(MODEL_AUC) * 100)}; IC 95% ${MODEL_AUC_CI}); a igual tamaño de proveedor, ${MODEL_AUC_SIZE}. El modelo anterior, v0.9.1, miraba años posteriores al contrato. Lo reemplazamos tras una prueba prerregistrada; su 0.852 no es comparable.`
              : `It was trained on ${cc.atTraining} labelled cases; most were written up by an analyst, not a judge. It was tested forward: trained on earlier years and evaluated on the next, 2019 to 2025. Its AUC is ${MODEL_AUC} (right in ${Math.round(Number(MODEL_AUC) * 100)} of 100 case/no-case pairs; 95% CI ${MODEL_AUC_CI}); at equal vendor size, ${MODEL_AUC_SIZE}. The previous model, v0.9.1, looked at years after each contract. We replaced it after a pre-registered test; its 0.852 is not comparable.`}
          </p>
        </PfProse>
        <p className="ct-note">
          {es ? 'Metodología completa, coeficientes y limitaciones: ' : 'Full methodology, coefficients, and limitations: '}
          <Link to="/methodology" className="ct-link">rubli.xyz/methodology</Link>
        </p>
      </PfSection>

      <PfSection
        id="limits"
        title={es ? 'Limitaciones que deben citarse' : 'Limitations that must be cited'}
        claim={es ? 'Los límites que acompañan cualquier cifra del modelo.' : 'The limits that go with any figure from the model.'}
      >
        <dl className="plt-ledger">
          <div><dt>{es ? 'El fraude en ejecución es invisible.' : 'Fraud during execution is invisible.'}</dt><dd>{es ? 'RUBLI ve la adjudicación, no la obra. Infraestructura y construcción están subestimados.' : 'RUBLI sees the award, not the work. Infrastructure and construction are underestimated.'}</dd></div>
          <div><dt>{es ? 'Correlación no es causalidad.' : 'Correlation is not causation.'}</dt><dd>{es ? 'Un indicador alto no es determinación de responsabilidad ni prueba de conducta ilícita.' : 'A high indicator is not a determination of liability or proof of wrongdoing.'}</dd></div>
          <div><dt>{es ? 'Las etiquetas vienen de escándalos de alto perfil.' : 'Training labels come from high-profile scandals.'}</dt><dd>{es ? 'El modelo detecta bien patrones similares a casos públicos; puede pasar por alto corrupción de pequeña escala.' : 'The model detects patterns similar to public cases well; it can miss small-scale corruption.'}</dd></div>
          <div><dt>{es ? 'La calidad de datos varía por periodo.' : 'Data quality varies by period.'}</dt><dd>{es ? 'Los registros 2002–2010 son los más pobres: sin fecha de publicación y con pocos identificadores; sus puntajes son menos confiables.' : '2002–2010 records are the poorest: no publication date and few identifiers; their scores are less reliable.'}</dd></div>
          <div><dt>{es ? 'Mide sobre todo el historial del proveedor.' : 'It mostly tracks vendor history.'}</dt><dd>{es ? 'Con menos de tres contratos previos un proveedor casi nunca llega a alto: un «Bajo» ahí significa «historial insuficiente», no riesgo bajo.' : 'With fewer than three prior contracts a vendor almost never reaches high: a “Low” there means “insufficient history”, not low risk.'}</dd></div>
          <div><dt>{es ? 'No detecta la captura.' : 'It misses capture.'}</dt><dd>{es ? <>Un proveedor que depende de un solo comprador casi nunca llega a alto; la captura se mide aparte en <Link to="/captura" className="ct-link">{CAPTURA_TITLE.es}</Link> (patrón P6 de Focos Rojos).</> : <>A vendor that depends on a single buyer almost never reaches high; capture is measured separately in <Link to="/captura" className="ct-link">{CAPTURA_TITLE.en}</Link> (Red Flags pattern P6).</>}</dd></div>
          <div><dt>{es ? 'El tamaño ya ordena casi igual.' : 'Size alone ranks almost as well.'}</dt><dd>{es ? `Ordenar solo por el dinero que el proveedor ganó antes obtiene un AUC de 0.790, frente a ${MODEL_AUC} del modelo.` : `Ranking only by the money the vendor won before scores AUC 0.790, against the model's ${MODEL_AUC}.`}</dd></div>
          <div><dt>{es ? 'No hay identificación definitiva de proveedores.' : 'No definitive vendor identity.'}</dt><dd>{es ? 'El mismo proveedor puede aparecer bajo distintas grafías entre años.' : 'The same vendor can appear under different spellings across years.'}</dd></div>
        </dl>
      </PfSection>

      <PfSection
        id="contact"
        title={es ? 'Acceso y contacto' : 'Access and contact'}
        claim={es ? 'Gratuito y sin registro. Un proyecto independiente que publica de forma seudónima.' : 'Free, no sign-up. An independent project that publishes pseudonymously.'}
      >
        <dl className="plt-ledger">
          <div><dt>{es ? 'Prensa' : 'Press'}</dt><dd><a href="mailto:prensa@rubli.xyz" className="ct-link ct-mono">prensa@rubli.xyz</a></dd></div>
          <div><dt>{es ? 'Plataforma' : 'Platform'}</dt><dd><a href="https://rubli.xyz" className="ct-link">rubli.xyz</a>, {es ? 'gratuita y sin registro' : 'free, no sign-up'}</dd></div>
          <div><dt>{es ? 'Licencias' : 'Licences'}</dt><dd>{es ? 'Código: Apache 2.0 · datos: CC BY-NC 4.0 (sitio y próximas versiones); 2026.10 y 2026.11 en Zenodo: CC BY 4.0' : 'Code: Apache 2.0 · data: CC BY-NC 4.0 (site and future releases); 2026.10 and 2026.11 on Zenodo: CC BY 4.0'}</dd></div>
          <div><dt>{es ? 'Independencia' : 'Independence'}</dt><dd>{es ? 'sin financiamiento de partidos ni de dependencias gubernamentales; el equipo publica de forma seudónima para proteger la independencia del trabajo' : 'no funding from political parties or government agencies; the team publishes pseudonymously to protect the independence of the work'}</dd></div>
        </dl>
      </PfSection>
    </PfShell>
  )
}
