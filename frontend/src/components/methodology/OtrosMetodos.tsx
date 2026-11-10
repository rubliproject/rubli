/**
 * /methodology § «¿Qué más medimos?» — every method besides the indicator (docs/METHODOLOGY_COVERAGE_2026-11-05.md,
 * rows marked missing/partial). Mariana's rules (TEAMS.md, owner 11-05): opens with qué ves · cómo se lee · qué
 * significa; ≤15 words a sentence; each term glossed once. Five plain blocks for what readers confuse, then one
 * line per remaining method in a fold. Internal-only items (ARIA QA module, RFCs, scorer paths) stay off the page.
 */
import { Link } from 'react-router-dom'
import { PfProse } from '@/components/plataforma/Plataforma'
import { AnnexFold } from '@/components/methodology/DictamenChrome'

type Line = { k: [string, string]; v: [string, string] }

const ONE_LINERS: Line[] = [
  { k: ['Proveedores repetidos', 'Duplicate vendors'], v: ['Unimos dos registros si tienen el mismo RFC o el mismo nombre exacto. Los parecidos no se unen: solo se ligan.', 'Two records merge when they share an RFC or the exact same name. Look-alikes are linked, not merged.'] },
  { k: ['Dependencias', 'Agencies'], v: ['Cada comprador tiene un solo número. Si una dependencia sucede a otra, se ligan; no se mezclan.', 'Each buyer has one number. When one agency succeeds another, they are linked, not mixed.'] },
  { k: ['ComprasMX sin duplicar', 'ComprasMX without duplicates'], v: ['Un contrato de ComprasMX se salta si CompraNet ya lo tiene: mismo procedimiento, y monto casi igual o mismo proveedor.', 'A ComprasMX contract is skipped if CompraNet already has it: same procedure, and nearly the same amount or the same vendor.'] },
  { k: ['Sanciones (SFP)', 'Sanctions (SFP)'], v: ['Cruzamos por RFC o por el nombre completo idéntico. Nunca por una parte del nombre.', 'We match on RFC or on the identical full name. Never on part of a name.'] },
  { k: ['Lista del SAT (EFOS)', 'SAT list (EFOS)'], v: ['EFOS son empresas que el SAT declaró de operaciones simuladas. Cruzamos solo la etapa «definitivo», por RFC o, si falta, por nombre.', 'EFOS are firms the SAT declared to fake transactions. We match only the «definitive» stage, by RFC or, failing that, by name.'] },
  { k: ['Persona física', 'Natural person'], v: ['Un RFC de 13 letras es de una persona; uno de 12, de una empresa. Sin RFC, lo estima un modelo.', 'A 13-letter RFC belongs to a person; a 12-letter one to a company. Without an RFC, a model estimates it.'] },
  { k: ['Categorías', 'Categories'], v: ['Leemos el título del contrato y lo ponemos en una de 70 categorías de gasto.', 'We read the contract title and place it in one of 70 spending categories.'] },
  { k: ['Pasajes de avión', 'Airfare'], v: ['La categoría «pasajes aéreos» guarda solo boletos de pasajeros. Radares, horas de vuelo, simuladores, carga y renta de aeronaves quedan fuera.', 'The «airfare» category keeps passenger tickets only. Radar, flight hours, simulators, cargo and aircraft leasing stay out.'] },
  { k: ['Minicategorías', 'Mini-categories'], v: ['Reglas en orden: palabras del título, claves del cuadro de salud, partida y, al final, «otros».', 'Rules in order: title words, health-catalogue codes, budget line and, last, «other».'] },
  { k: ['Monto sospechoso', 'Suspect amount'], v: ['Un monto mil veces mayor que lo normal del proveedor se marca. No entra en los rankings.', 'An amount a thousand times the vendor’s usual is marked. It stays out of rankings.'] },
  { k: ['Concentración', 'Concentration'], v: ['Qué parte del dinero de una dependencia se lleva cada proveedor. Guardamos las de 10 % o más.', 'What share of an agency’s money each vendor takes. We keep those of 10 % or more.'] },
  { k: ['Red de coadjudicación', 'Co-award network'], v: ['Dos proveedores se unen si ganaron en el mismo procedimiento. Ganar juntos no prueba un acuerdo.', 'Two vendors connect when they won in the same procedure. Winning together does not prove a deal.'] },
  { k: ['Capa de anomalías', 'Anomaly layer'], v: ['Dos métodos sin casos (Isolation Forest y COPOD) miden qué tan raro es un contrato.', 'Two methods without cases (Isolation Forest and COPOD) measure how unusual a contract is.'] },
  { k: ['Señales nuevas', 'New signals'], v: ['Reglas simples, sin el modelo, sobre proveedores sin caso activos desde 2019. Hacen falta dos señales.', 'Simple rules, without the model, on vendors with no case active since 2019. Two signals are needed.'] },
  { k: ['Baja huella', 'Low footprint'], v: ['Once señales separan a los proveedores P2 en tres grupos: confirmado, varias señales o solo conducta.', 'Eleven signals split P2 vendors into three groups: confirmed, several signals or behaviour only.'] },
  { k: ['Nivel del comprador', 'Buyer level'], v: ['Federal, estatal o municipal, según el catálogo del INEGI. Si no se sabe, queda vacío.', 'Federal, state or municipal, from the INEGI catalogue. If unknown, it stays blank.'] },
  { k: ['Origen de los casos', 'Where cases come from'], v: ['Cada caso trae una procedencia: A, registro oficial; B, prensa fechada; C, pista de analista o del modelo.', 'Each case carries a provenance: A, official record; B, dated press; C, analyst or model lead.'] },
]

export function OtrosMetodos({ lang }: { lang: 'en' | 'es' }) {
  const es = lang === 'es'
  const L = (a: string, b: string) => (es ? a : b)
  return (
    <>
      <PfProse>
        <p><b>{L('Qué ve.', 'What you see.')}</b> {L('Los otros métodos de RUBLI, aparte del indicador de riesgo.', 'RUBLI’s other methods, besides the risk indicator.')}</p>
        <p><b>{L('Cómo se lee.', 'How to read it.')}</b> {L('Cinco bloques cortos para lo que más se confunde. Lo demás, una línea cada uno.', 'Five short blocks for what gets confused most. The rest, one line each.')}</p>
        <p><b>{L('Qué significa.', 'What it means.')}</b> {L('Cada cifra del sitio sale de una regla escrita aquí. Ninguna prueba un delito.', 'Every figure on the site comes from a rule written here. None proves a crime.')}</p>
      </PfProse>

      <PfProse>
        <div className="mt-block">
          <h3 id="m-direct" className="mt-h3">{L('Adjudicación directa y un solo adjudicado', 'Direct award and single award')}</h3>
        <p>{L('Una adjudicación directa no pasa por concurso: la dependencia elige a la empresa.', 'A direct award skips the contest: the agency picks the company.')} {L('La reconocemos porque el tipo de procedimiento dice «directa» o «adjudicación».', 'We spot it when the procedure type says «direct» or «award».')} {L('Si el tipo viene vacío, no la contamos como directa.', 'If the type is blank, we do not count it as direct.')} {L('Solo se puede comparar desde 2011.', 'It is only comparable from 2011.')}</p>
        <p>{L('Un solo adjudicado es otra cosa: hubo concurso, pero lo ganó una sola empresa.', 'A single award is different: there was a contest, but one company won it.')} {L('CompraNet y ComprasMX registran ganadores, no a todos los que ofertaron: un concurso con un ganador pudo tener una oferta o diez.', 'CompraNet and ComprasMX record winners, not everyone who bid: a contest with one winner may have drawn one offer or ten.')}</p>
        </div>

        <div className="mt-block">
          <h3 id="m-label" className="mt-h3">{L('Qué es una etiqueta', 'What a label is')}</h3>
        <p>{L('Para aprender, el modelo necesita ejemplos marcados. Los llamamos «etiquetas».', 'To learn, the model needs marked examples. We call them «labels».')} {L('Una etiqueta es todo contrato de un proveedor ligado a un caso, en los años del caso.', 'A label is every contract of a vendor tied to a case, in the case years.')} {L('Cuenta aunque el comprador sea otro.', 'It counts even when the buyer is a different one.')}</p>
        <p>{L('Una etiqueta no dice que ese contrato fue corrupto.', 'A label does not say that contract was corrupt.')} {L('Casi tres de cada cuatro vienen de casos sin fuente independiente.', 'Nearly three in four come from cases without an independent source.')}</p>
        </div>

        <div className="mt-block">
          <h3 id="m-captura" className="mt-h3">{L('Tres reglas de «un solo comprador»', 'Three «single buyer» rules')}</h3>
        <p>{L('Se parecen, pero miden cosas distintas:', 'They look alike, but measure different things:')}</p>
        <ul className="mt-list">
          <li><b>{L('Cautiva', 'Captive')}.</b> {L('La empresa sacó de un solo comprador el 80 % o más de todo su dinero.', 'The company got 80 % or more of all its money from one buyer.')} {L('Además: 50 millones de pesos o más y al menos tres años distintos.', 'Also: 50 million pesos or more and at least three different years.')}</li>
          <li><b>{L('Mayoría', 'Majority')}.</b> {L('En un año, una empresa se llevó la mitad o más del gasto de una dependencia.', 'In one year, one company took half or more of an agency’s spending.')} {L('Solo dependencias con 100 millones de pesos o más ese año.', 'Only agencies with 100 million pesos or more that year.')}</li>
          <li><b>{L('P6 de Focos Rojos', 'Red Flags P6')}.</b> {L('Más del 80 % de sus contratos, contados uno por uno, vienen de un comprador.', 'Over 80 % of its contracts, counted one by one, come from one buyer.')} {L('Y más de 10 contratos.', 'And more than 10 contracts.')}</li>
        </ul>
        <p>{L('Las dos primeras están en', 'The first two are in')} <Link to="/captura" className="ct-link">{L('Captura', 'Capture')}</Link>. {L('La tercera, en', 'The third, in')} <Link to="/aria" className="ct-link">{L('Focos Rojos', 'Red Flags')}</Link>.</p>
        </div>

        <div className="mt-block">
          <h3 id="m-dinero" className="mt-h3">{L('Cómo contamos el dinero', 'How we count money')}</h3>
        <ul className="mt-list">
          <li><b>{L('Dólares', 'Dollars')}.</b> {L('Usamos el promedio anual del tipo de cambio FIX del Banco de México: el del año del contrato o, si no hay año, el del último año.', 'We use the yearly average of the Bank of Mexico FIX rate: the contract’s year, or the latest year when there is none.')} {L('Tampoco se ajustan por inflación.', 'They are not adjusted for inflation either.')}</li>
          <li><b>{L('Pesos de cada año', 'Pesos of each year')}.</b> {L('Los montos se muestran como los publica CompraNet: en pesos del año en que se firmó cada contrato, sin ajustar por inflación.', 'Amounts are shown as CompraNet publishes them: in pesos of the year each contract was signed, not adjusted for inflation.')} {L('Un peso de 2002 valía unas 2.6 veces uno de 2024, así que las sumas de muchos años pesan menos los primeros años.', 'A 2002 peso was worth about 2.6 times a 2024 peso, so multi-year totals understate the early years.')}</li>
          <li><b>{L('Títulos en inglés', 'English titles')}.</b> {L('En la versión en inglés, los títulos de los contratos son una traducción automática; el título en español es el registro oficial. Los contratos de personas físicas se quedan en español.', 'In the English version, contract titles are a machine translation; the Spanish title is the official record. Contracts of personas físicas stay in Spanish.')}</li>
          <li><b>{L('Pesos de 2024', '2024 pesos')}.</b> {L('Solo las comparaciones entre sexenios se ajustan por inflación, con el INPC del INEGI.', 'Only the comparisons between presidential terms are adjusted for inflation, with INEGI’s consumer price index.')} {L('Si falta un año, se muestra sin ajustar.', 'If a year is missing, it is shown unadjusted.')}</li>
          <li><b>{L('Sexenios', 'Presidential terms')}.</b> {L('Cada sexenio empieza el 1 de diciembre.', 'Each term starts on 1 December.')} {L('Por eso el año de cambio cuenta para el presidente que sale.', 'So the handover year counts for the outgoing president.')}</li>
          <li><b>{L('Monto fuera de rango (propuesta)', 'Amount out of range (proposal)')}.</b> {L('Aún no se usa en el sitio: falta la decisión final.', 'Not used on the site yet: the final decision is pending.')} {L('Ordenaríamos los montos de una categoría y miraríamos la mitad central.', 'We would sort a category’s amounts and look at the middle half.')} {L('Un monto muy por encima de esa mitad quedaría «fuera de rango».', 'An amount far above that half would be «out of range».')} {L('La regla se llama cerca de Tukey; la medimos en escala de 10 en 10.', 'The rule is called a Tukey fence; we measure it in steps of ten.')} {L('Habla de montos, no de precios unitarios.', 'It speaks of amounts, not unit prices.')}</li>
        </ul>
        <p className="ct-note">{L(
          'Detalle: límite = 10^(Q3 + 1.5 × (Q3 − Q1)), con Q1 y Q3 de log₁₀(monto) dentro de la categoría. Probamos «20 veces la mediana» y lo descartamos: marcaba el 82 % del dinero.',
          'Detail: limit = 10^(Q3 + 1.5 × (Q3 − Q1)), with Q1 and Q3 of log₁₀(amount) within the category. We tried «20 times the median» and dropped it: it flagged 82 % of the money.',
        )}</p>
        </div>

        <div className="mt-block">
          <h3 id="m-grades" className="mt-h3">{L('Calificaciones de dependencias', 'Agency grades')}</h3>
        <p>{L('Calificamos a cada dependencia en tres pilares: competencia, proceso y concentración.', 'We grade each agency on three pillars: competition, process and concentration.')} {L('La comparamos mitad con todo el país y mitad con dependencias parecidas.', 'We compare it half with the whole country and half with similar agencies.')} {L('Las sanciones y el indicador se muestran al lado, sin mezclarse.', 'Sanctions and the indicator are shown alongside, not mixed in.')}</p>
        <p>{L('Las boletas de proveedores son otra cosa: solo agrupan su indicador en cuatro niveles.', 'Vendor scorecards are different: they only group the indicator into four levels.')}</p>
        </div>
      </PfProse>

      <AnnexFold id="m-lines" title={{ es: `Los demás métodos, ${ONE_LINERS.length} en una línea cada uno`, en: `The other methods, ${ONE_LINERS.length} in one line each` }}>
        <dl className="plt-ledger">
          {ONE_LINERS.map((r) => (
            <div key={r.k[1]}><dt>{es ? r.k[0] : r.k[1]}</dt><dd>{es ? r.v[0] : r.v[1]}</dd></div>
          ))}
        </dl>
        <p className="ct-note">
          {L('«Gasto a ciegas» compara el gasto de la Cuenta Pública con los contratos visibles. No es un indicador de riesgo:', '«Spending in the dark» compares Public Account spending with visible contracts. It is not a risk indicator:')}{' '}
          <Link to="/gasto-a-ciegas" className="ct-link">{L('vea su página', 'see its page')}</Link>.
        </p>
      </AnnexFold>
    </>
  )
}
