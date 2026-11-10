/**
 * Terms — terms of use in the Plataforma shell (h1 + the one sentence that matters, sibling pages,
 * sticky index) → numbered sections, two prose columns. Bilingual ES/EN (ES primary).
 */
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { PfShell } from '@/components/plataforma/Plataforma'
import { LegalSection as Section } from '@/components/legal/LegalSection'

export default function Terms() {
  const { i18n } = useTranslation()
  const isEs = !i18n.language?.startsWith('en')

  return (
    <PfShell
      fullLede
      title={isEs ? 'Términos de uso' : 'Terms of use'}
      lede={isEs
        ? 'Lo más importante: los indicadores de riesgo no son prueba de irregularidades.'
        : 'Most important: risk indicators are not proof of wrongdoing.'}
      meta={<>{isEs ? 'Versión 1.1 · octubre de 2026 · ' : 'Version 1.1 · October 2026 · '}<Link to="/privacy">{isEs ? 'Aviso de privacidad' : 'Privacy notice'}</Link></>}
      index={[
        { id: 'purpose', label: isEs ? 'Propósito y alcance' : 'Purpose and Scope' },
        { id: 'permitted', label: isEs ? 'Usos permitidos' : 'Permitted Uses' },
        { id: 'prohibited', label: isEs ? 'Usos prohibidos' : 'Prohibited Uses' },
        { id: 'risk-scores', label: isEs ? 'Los indicadores' : 'The indicators' },
        { id: 'sources', label: isEs ? 'Fuentes de datos y atribución' : 'Data Sources and Attribution' },
        { id: 'warranty', label: isEs ? 'Sin garantía' : 'No Warranty' },
        { id: 'license', label: isEs ? 'Licencia de código abierto' : 'Open Source Licence' },
        { id: 'disclosure', label: isEs ? 'Divulgación responsable' : 'Responsible Disclosure' },
        { id: 'changes', label: isEs ? 'Cambios a estos términos' : 'Changes to These Terms' },
      ]}
    >
        <Section id="purpose" title={isEs ? '1. Propósito y alcance' : '1. Purpose and Scope'}>
          <p>
            {isEs
              ? <>RUBLI (Red de Utilidad para la Búsqueda de Licitaciones Irregulares) es una plataforma de investigación de código abierto y sin fines comerciales que analiza datos de contrataciones del gobierno federal mexicano para apoyar la transparencia, el periodismo de rendición de cuentas y la investigación académica.</>
              : <>RUBLI (Red de Utilidad para la Búsqueda de Licitaciones Irregulares) is a non-commercial, open-source research platform that analyses Mexican federal government procurement data to support transparency, accountability journalism, and academic research.</>}
          </p>
          <p>
            {isEs
              ? 'Estos términos rigen su uso de la plataforma web RUBLI y cualquier dato o resultado derivado de ella. Al acceder a RUBLI, usted acepta estos términos.'
              : 'These terms govern your use of the RUBLI web platform and any data or outputs derived from it. By accessing RUBLI, you agree to these terms.'}
          </p>
        </Section>

        <Section id="permitted" title={isEs ? '2. Usos permitidos' : '2. Permitted Uses'}>
          <p>{isEs ? 'Puede usar RUBLI y sus resultados para:' : 'You may use RUBLI and its outputs for:'}</p>
          <ul role="list">
            {isEs ? (
              <>
                <li>Investigación periodística y reportajes sobre contrataciones gubernamentales</li>
                <li>Investigación académica y no comercial</li>
                <li>Monitoreo del gasto público desde la sociedad civil</li>
                <li>Trabajo personal, educativo o sin fines de lucro relacionado con transparencia</li>
                <li>Desarrollo de herramientas de código abierto basadas en las mismas fuentes públicas</li>
              </>
            ) : (
              <>
                <li>Journalistic investigation and reporting on government procurement</li>
                <li>Academic and non-commercial research</li>
                <li>Civil society monitoring of public spending</li>
                <li>Personal, educational, or non-profit transparency work</li>
                <li>Developing open-source tools that build on the same public data sources</li>
              </>
            )}
          </ul>
        </Section>

        <Section id="prohibited" title={isEs ? '3. Usos prohibidos' : '3. Prohibited Uses'}>
          <p>{isEs ? <>Usted <strong>no puede</strong>:</> : <>You may <strong>not</strong>:</>}</p>
          <ul role="list">
            {isEs ? (
              <>
                <li>Redistribuir o revender datos o resultados de RUBLI con fines comerciales sin obtener una licencia separada</li>
                <li>Usar puntuaciones de riesgo o hallazgos para hacer acusaciones legales contra individuos o entidades sin corroboración independiente</li>
                <li>Presentar las puntuaciones de RUBLI como determinaciones oficiales del gobierno o como prueba de corrupción, fraude u otra actividad ilegal</li>
                <li>Hacer scraping de la plataforma de manera que degrade el servicio para otros usuarios</li>
                <li>Intentar reidentificar o desanonimizar cualquier dato personal enmascarado</li>
              </>
            ) : (
              <>
                <li>Redistribute or resell RUBLI data or outputs for commercial gain without obtaining a separate licence</li>
                <li>Use risk scores or findings to make legal accusations against individuals or entities without independent corroboration</li>
                <li>Present RUBLI risk scores as official government determinations or as proof of corruption, fraud, or any other illegal activity</li>
                <li>Scrape the platform in a manner that degrades service for other users</li>
                <li>Attempt to re-identify or deanonymise any masked personal data</li>
              </>
            )}
          </ul>
        </Section>

        <Section id="risk-scores" title={isEs ? '4. Naturaleza de las puntuaciones e indicadores' : '4. Nature of Risk Scores and Statistical Indicators'}>
          <p>
            {isEs
              ? 'Todas las puntuaciones de riesgo, indicadores estadísticos, alertas de anomalías y clasificaciones por niveles producidas por RUBLI son:'
              : 'All risk scores, statistical indicators, anomaly flags, and tier classifications produced by RUBLI are:'}
          </p>
          <ul role="list">
            <li>
              <strong>{isEs ? 'Estadísticas, no determinantes' : 'Statistical, not determinative'}</strong>{' '}
              {isEs ? '— miden el parecido con casos documentados; no son una probabilidad de corrupción ni hallazgos de mala conducta.' : '— they measure resemblance to documented cases; they are not a probability of corruption or findings of misconduct.'}
            </li>
            <li>
              <strong>{isEs ? 'Entrenadas con proveedores de casos documentados' : 'Trained on vendors of documented cases'}</strong>{' '}
              {isEs ? '— el modelo aprendió de los contratos de proveedores que después aparecen vinculados a casos documentados, dentro de los años de cada caso; la mayoría de esos casos no tiene una fuente independiente verificable, y el modelo puede no capturar todas las formas de irregularidad.' : '— the model learned from the contracts of vendors later linked to documented cases, within the years of each case; most of those cases lack an independently verifiable source, and the model may not capture every form of procurement irregularity.'}
            </li>
            <li>
              <strong>{isEs ? 'Sujetas a limitaciones conocidas' : 'Subject to known limitations'}</strong>{' '}
              {isEs ? '— consulte la página de ' : '— see the '}
              <Link to="/methodology" className="ct-link">
                {isEs ? 'Metodología' : 'Methodology'}
              </Link>{' '}
              {isEs ? 'para una discusión completa de limitaciones, puntos ciegos y advertencias sobre la calidad de los datos.' : 'page for a full discussion of model limitations, blind spots, and data quality caveats.'}
            </li>
            <li>
              <strong>{isEs ? 'No son opiniones legales' : 'Not legal opinions'}</strong>{' '}
              {isEs ? '— nada en esta plataforma constituye asesoramiento legal o un hallazgo formal de auditoría.' : '— nothing on this platform constitutes legal advice or a formal audit finding.'}
            </li>
          </ul>
          <p>
            {isEs
              ? 'Los indicadores estadísticos de RUBLI miden la similitud con irregularidades documentadas. Una puntuación alta significa que las características del contrato se parecen a patrones problemáticos conocidos — no significa que el contrato, proveedor o institución sea corrupto. Las puntuaciones son herramientas para priorizar investigaciones, no veredictos.'
              : 'RUBLI\'s statistical risk indicators measure similarity to documented procurement irregularities. A high risk score means a contract\'s characteristics resemble known problematic patterns — it does not mean the contract, vendor, or institution is corrupt. Risk scores are tools for investigation triage, not verdicts.'}
          </p>
        </Section>

        <Section id="sources" title={isEs ? '5. Fuentes de datos y atribución' : '5. Data Sources and Attribution'}>
          <p>
            {isEs ? 'Los datos subyacentes de RUBLI provienen de fuentes gubernamentales públicas:' : 'RUBLI\'s underlying data originates from publicly available government sources:'}
          </p>
          <ul role="list">
            <li><strong>COMPRANET</strong> — Sistema Electrónico de Contrataciones Gubernamentales (SHCP / SFP), {isEs ? '2002 al 28 de septiembre de 2025' : '2002 to 28 September 2025'}</li>
            <li><strong>ComprasMX</strong> — {isEs ? 'datos abiertos de contratos de la plataforma que reemplazó a CompraNet, desde el 28 de septiembre de 2025' : 'open contract data from the platform that replaced CompraNet, from 28 September 2025'}</li>
            <li><strong>SAT EFOS</strong> — Empresas que Facturan Operaciones Simuladas (SAT)</li>
            <li><strong>{isEs ? 'Sanciones SFP' : 'SFP Sanctions'}</strong> — Registro de Servidores Públicos Sancionados</li>
            <li><strong>RUPC</strong> — Registro Único de Proveedores y Contratistas</li>
            <li><strong>ASF</strong> — {isEs ? 'Reportes públicos de auditoría de la Auditoría Superior de la Federación' : 'Auditoría Superior de la Federación public audit reports'}</li>
          </ul>
          <p>
            {isEs
              ? 'Cuando publique hallazgos basados en datos de RUBLI, atribuya los datos originales a la fuente gubernamental correspondiente junto con una referencia a RUBLI.'
              : 'When publishing findings that rely on RUBLI data, please attribute the original data to the respective government source alongside a reference to RUBLI.'}
          </p>
        </Section>

        <Section id="warranty" title={isEs ? '6. Sin garantía' : '6. No Warranty'}>
          <p>
            {isEs
              ? <>RUBLI se proporciona <strong>"tal cual"</strong>, sin garantía de ningún tipo, expresa o implícita. Los mantenedores no hacen declaraciones sobre la exactitud, integridad o idoneidad para un propósito de cualquier dato o análisis presentado. Los datos pueden contener errores heredados de las fuentes gubernamentales originales.</>
              : <>RUBLI is provided <strong>"as is"</strong>, without warranty of any kind, express or implied. The maintainers make no representations about the accuracy, completeness, or fitness for purpose of any data or analysis presented. Data may contain errors inherited from the original government sources.</>}
          </p>
          <p>
            {isEs
              ? 'Usted usa RUBLI por su propia cuenta y riesgo. Los mantenedores no son responsables de ninguna pérdida o daño derivado de la confianza en la información presentada en esta plataforma.'
              : 'You use RUBLI at your own risk. The maintainers are not liable for any loss or damage arising from reliance on information presented on this platform.'}
          </p>
        </Section>

        <Section id="license" title={isEs ? '7. Licencia de código abierto' : '7. Open Source Licence'}>
          <p>
            {isEs ? 'El ' : 'RUBLI\'s '}
            <a href="/datos" className="ct-link">
              {isEs ? 'código fuente de RUBLI' : 'source code'}
</a>
            {isEs ? ' se publica bajo la ' : ' is released under the '}
            <strong>{isEs ? 'Licencia Apache 2.0' : 'Apache License 2.0'}</strong>.{' '}
            {isEs
              ? 'Es libre de inspeccionar, hacer fork y construir sobre el código de acuerdo con esa licencia. Consulte el '
              : 'You are free to inspect, fork, and build upon the codebase in accordance with that licence. See the '}
            <a href="https://www.apache.org/licenses/LICENSE-2.0" target="_blank" rel="noopener noreferrer" className="ct-link">
              {isEs ? 'texto oficial de la licencia Apache 2.0' : 'official Apache 2.0 licence text'}
            <span className="sr-only">{isEs ? " (se abre en otra pestaña)" : " (opens in new tab)"}</span></a>.
          </p>
          <p>
            {isEs
              ? 'Los datos de contrataciones subyacentes son propiedad del gobierno federal mexicano y están sujetos a sus términos de datos abiertos. Los resultados derivados de RUBLI (puntuaciones, clasificaciones, análisis estadísticos) se publican bajo la licencia Creative Commons Atribución-NoComercial 4.0 (CC BY-NC 4.0); el uso comercial requiere una licencia aparte. Las versiones 2026.10 y 2026.11 en Zenodo se publicaron bajo CC BY 4.0 y conservan esa licencia.'
              : 'The underlying procurement data is owned by the Mexican federal government and is subject to its open data terms. RUBLI\'s derived outputs (risk scores, classifications, statistical analyses) are released under the Creative Commons Attribution-NonCommercial 4.0 licence (CC BY-NC 4.0); commercial use requires a separate licence. Releases 2026.10 and 2026.11 on Zenodo were published under CC BY 4.0 and keep that licence.'}
          </p>
        </Section>

        <Section id="disclosure" title={isEs ? '8. Divulgación responsable' : '8. Responsible Disclosure'}>
          <p>
            {isEs
              ? 'Si identifica errores en los datos, problemas metodológicos o preocupaciones de privacidad, escríbanos a '
              : 'If you identify data errors, methodological issues, or privacy concerns, please write to '}
            <a href="mailto:rubli-project@proton.me" className="ct-link">rubli-project@proton.me</a>.{' '}
            {isEs
              ? 'Tomamos en serio la calidad de los datos y nos esforzamos por atender los reportes sustantivos con prontitud.'
              : 'We take data quality seriously and aim to address substantive reports promptly.'}
          </p>
        </Section>

        <Section id="changes" title={isEs ? '9. Cambios a estos términos' : '9. Changes to These Terms'}>
          <p>
            {isEs
              ? 'Podemos actualizar estos términos para reflejar cambios en la funcionalidad de la plataforma o en la legislación aplicable. La fecha en la parte superior de esta página indica la revisión más reciente. El uso continuado de RUBLI después de las actualizaciones constituye aceptación de los términos revisados.'
              : 'We may update these terms to reflect changes in platform functionality or applicable law. The date at the top of this page indicates the most recent revision. Continued use of RUBLI after updates constitutes acceptance of the revised terms.'}
          </p>
        </Section>

    </PfShell>
  )
}
