/**
 * About — «Acerca de RUBLI»: what it is, what for, what it is not, where to start (owner 11-07 night, after a
 * first reader with no context could not find a way in). Copy: docs/ABOUT_DRAFT_2026-11-07.md. One screen, no charts.
 */
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { PfShell } from '@/components/plataforma/Plataforma'
import { LegalSection as Section } from '@/components/legal/LegalSection'
import { DATA_CUT_YEAR, DATASET_DOI } from '@/lib/constants'

export default function About() {
  const { i18n } = useTranslation()
  const es = !i18n.language?.startsWith('en')
  const L = (a: string, b: string) => (es ? a : b)

  return (
    <PfShell
      fullLede
      title={L('Acerca de RUBLI', 'About RUBLI')}
      lede={L(
        `RUBLI lee los contratos públicos del gobierno federal de México, de 2002 a ${DATA_CUT_YEAR}, y señala cuáles merecen una segunda mirada.`,
        `RUBLI reads the Mexican federal government’s public contracts, 2002 to ${DATA_CUT_YEAR}, and points to the ones worth a second look.`,
      )}
      index={[
        { id: 'what', label: L('Qué es', 'What it is') },
        { id: 'not', label: L('Qué no es', 'What it is not') },
        { id: 'start', label: L('Por dónde empezar', 'Where to start') },
        { id: 'data', label: L('Qué datos usa', 'What data it uses') },
        { id: 'who', label: L('Quién', 'Who') },
      ]}
    >
      <Section id="what" title={L('Qué es', 'What it is')}>
        <p>{L(
          'Más de tres millones de contratos, todos datos oficiales y públicos de CompraNet y ComprasMX. RUBLI busca entre ellos los pocos que merecen otra mirada: dinero sin concurso, un solo proveedor que se queda con todo, empresas nuevas con contratos enormes.',
          'More than three million contracts, all official public data from CompraNet and ComprasMX. RUBLI searches them for the few worth another look: money with no tender, one supplier taking everything, new companies with huge contracts.',
        )}</p>
      </Section>
      <Section id="not" title={L('Qué no es', 'What it is not')}>
        <p>{L(
          'No acusa a nadie. Un indicador de riesgo alto dice que un contrato se parece a casos documentados, no que haya corrupción. Cada pista se verifica con reporteo.',
          'It accuses no one. A high risk indicator says a contract resembles documented cases, not that there was corruption. Every lead is checked by reporting.',
        )}</p>
      </Section>
      <Section id="start" title={L('Por dónde empezar', 'Where to start')}>
        <ol>
          <li><Link to="/">{L('El Mapa', 'The Map')}</Link>{L(': todo el gasto de un vistazo. Cada círculo es una institución; haz clic para entrar.', ': all spending at a glance. Each circle is a government agency; click to go in.')}</li>
          <li><Link to="/aria">{L('Focos Rojos', 'Red Flags')}</Link>{L(': los proveedores con más señales de riesgo.', ': the suppliers with the most risk signals.')}</li>
          <li><Link to="/cases">{L('Casos', 'Cases')}</Link>{L(': escándalos documentados y lo que RUBLI veía en sus contratos.', ': documented scandals and what RUBLI saw in their contracts.')}</li>
        </ol>
      </Section>
      <Section id="data" title={L('Qué datos usa', 'What data it uses')}>
        <p>{L(
          'Los registros oficiales de compras del gobierno federal: CompraNet de 2002 a septiembre de 2025 y ComprasMX desde entonces. Se actualiza cada semana; la fecha de corte está en el encabezado de cada página.',
          'The federal government’s official purchase records: CompraNet from 2002 to September 2025 and ComprasMX since. It updates weekly; the cut-off date is in every page header.',
        )}</p>
      </Section>
      <Section id="who" title={L('Quién', 'Who')}>
        <p>
          {L('Un proyecto independiente y abierto. El método está en ', 'An independent, open project. The method is in ')}
          <Link to="/methodology">{L('Metodología', 'Methodology')}</Link>
          {L('; los datos, en ', '; the data, on ')}
          <a href={`https://doi.org/${DATASET_DOI}`} target="_blank" rel="noopener noreferrer">Zenodo</a>
          {L('. Correcciones: ', '. Corrections: ')}
          <Link to="/press#contact">{L('Prensa › Contacto', 'Press › Contact')}</Link>.
        </p>
      </Section>
    </PfShell>
  )
}
