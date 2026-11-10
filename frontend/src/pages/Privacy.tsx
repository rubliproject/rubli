/**
 * Privacy — the privacy notice in the Plataforma shell (h1 + one-line lede, sibling pages,
 * sticky index) → numbered sections, two prose columns.
 * Relevant law: LFPDPPP 2025 (DOF 20 mar 2025) and LGTAIP 2025. Legal basis (no journalism
 * exception exists in the 2025 LFPDPPP): public source — LFPDPPP art. 9 fr. II + art. 2 fr. X;
 * LGTAIP art. 65 fr. XXVI and art. 3 fr. VIII; Constitución arts. 6 and 7. ARCO answers: 20 days
 * (art. 31). docs/LEGAL_RESEARCH_PERSONAS_FISICAS_2026-10-30.md § 1–2, § 5 #7–#13.
 */
import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { PfShell, PfFlow } from '@/components/plataforma/Plataforma'
import { privacyLectura } from '@/lib/plataforma/lectura'
import { DATA_CUT_YEAR } from '@/lib/constants'
import { LegalSection as Section, LegalTag as Tag } from '@/components/legal/LegalSection'

export default function Privacy() {
  const { i18n } = useTranslation()
  const isEs = !i18n.language?.startsWith('en')
  // the persona física note links to #oposicion; the SPA does not scroll to a hash on arrival
  useEffect(() => { const h = window.location.hash.slice(1); if (h) document.getElementById(h)?.scrollIntoView() }, [])

  return (
    <PfShell
      fullLede
      title={isEs ? 'Privacidad y protección de datos' : 'Privacy and data protection'}
      lede={isEs
        ? 'RUBLI trata registros públicos de contratación; no recopila datos personales de quienes lo visitan, salvo lo que envíen por el formulario de reportes.'
        : 'RUBLI processes public procurement records; it collects no personal data from its visitors beyond what they send through the report form.'}
      guide={isEs
        ? { q: '¿Qué datos personales usa RUBLI y qué puede hacer usted?', see: 'El aviso de privacidad: quién responde, qué datos tratamos y por qué.', read: 'Nueve apartados numerados. El índice lleva a cada uno.', means: '¿Aparece en un contrato? Puede pedir una corrección u oponerse (apartados 6 y 7).' }
        : { q: 'What personal data does RUBLI process, and what can you do?', see: 'The privacy notice: who is responsible, what data we process and why.', read: 'Nine numbered sections. The index takes you to each one.', means: 'Named in a contract? You can ask for a correction or object (sections 6 and 7).' }}
      lectura={privacyLectura(isEs ? 'es' : 'en')}
      meta={<>{isEs ? 'Versión 1.3 · noviembre de 2026 · ' : 'Version 1.3 · November 2026 · '}<Link to="/terms">{isEs ? 'Términos de uso' : 'Terms of use'}</Link></>}
      index={[
        { id: 'who', label: isEs ? 'Quiénes somos' : 'Who We Are' },
        { id: 'data', label: isEs ? 'Qué datos tratamos' : 'What Data We Process' },
        { id: 'legal-basis', label: isEs ? 'Base legal' : 'Legal Basis' },
        { id: 'visitor-data', label: isEs ? 'Datos de visitantes' : 'Visitor Data' },
        { id: 'retention', label: isEs ? 'Retención y almacenamiento de datos' : 'Data Retention & Storage' },
        { id: 'arco', label: isEs ? 'Sus derechos' : 'Your Rights' },
        { id: 'oposicion', label: isEs ? 'Política de oposición' : 'Objection Policy' },
        { id: 'third-parties', label: isEs ? 'Servicios de terceros' : 'Third-Party Services' },
        { id: 'changes', label: isEs ? 'Cambios a este aviso' : 'Changes to This Policy' },
      ]}
    >
        {/* ------------------------------------------------------------------ */}
        <Section id="who" title={isEs ? '1. Quiénes somos (Responsable del tratamiento)' : '1. Who We Are (Data Controller)'}>
          <p>
            {isEs
              ? <>El responsable del tratamiento de los datos personales es <strong>Proyecto RUBLI</strong>, una plataforma de investigación de código abierto y sin fines de lucro para el análisis de las contrataciones del gobierno federal mexicano. El proyecto lo mantienen colaboradores de forma voluntaria y no está afiliado a ninguna entidad gubernamental, partido político o empresa comercial.</>
              : <>The data controller is <strong>Proyecto RUBLI</strong> (the RUBLI Project), an open-source, non-commercial research platform for the analysis of Mexican federal government procurement. The project is maintained voluntarily by contributors and is not affiliated with any government agency, political party, or commercial entity.</>
            }
          </p>
          {/* TODO(owner, LFPDPPP 2025 art. 15 fr. I): the notice must also give the controller's address.
              Pseudonymous launch: the controller is «Proyecto RUBLI» and the contact is the project mailbox
              below; no personal name, handle or address until the owner decides (representative's or
              P.O. box address, or a partner organisation as controller) —
              docs/LEGAL_RESEARCH_PERSONAS_FISICAS_2026-10-30.md § 5 #9. */}
          <p>
            {isEs ? 'Para cualquier consulta sobre datos personales, escriba a Proyecto RUBLI: ' : 'For any question about personal data, write to Proyecto RUBLI: '}
            <a href="mailto:rubli-project@proton.me" className="ct-link">rubli-project@proton.me</a>
            {isEs ? '. Respondemos en un plazo máximo de 20 días (LFPDPPP).' : '. We answer within 20 days at most (LFPDPPP).'}
          </p>
        </Section>

        {/* ------------------------------------------------------------------ */}
        <Section id="data" title={isEs ? '2. Qué datos tratamos' : '2. What Data We Process'}>
            <div>
            <h3>{isEs ? 'Registros de contrataciones' : 'Procurement Records'}</h3>
              <p>
                {isEs
                  ? <>Más de tres millones de contratos de 2002 a {DATA_CUT_YEAR}: de <strong>COMPRANET</strong> (Sistema Electrónico de Contrataciones Gubernamentales) hasta el 28 de septiembre de 2025 y, desde entonces, de los datos abiertos de <strong>ComprasMX</strong>. Estos datos son publicados por el gobierno federal bajo su programa de datos abiertos y están disponibles gratuitamente en el portal federal de datos abiertos, <a href="https://www.datos.gob.mx" target="_blank" rel="noopener noreferrer" className="ct-link">datos.gob.mx<span className="sr-only"> (se abre en otra pestaña)</span></a>.</>
                  : <>More than three million contract records from 2002 to {DATA_CUT_YEAR}: from <strong>COMPRANET</strong> (the Mexican federal procurement system, Sistema Electrónico de Contrataciones Gubernamentales) up to 28 September 2025 and, since then, from the <strong>ComprasMX</strong> open data. This data is published by the federal government under its open data programme and is freely accessible on the federal open-data portal, <a href="https://www.datos.gob.mx" target="_blank" rel="noopener noreferrer" className="ct-link">datos.gob.mx<span className="sr-only"> (opens in new tab)</span></a>.</>
                }
              </p>
            </div>
            <div>
            <h3>{isEs ? 'Registros públicos de sanciones' : 'Public Sanctions Registries'}</h3>
              <p>
                {isEs
                  ? 'También incorporamos datos del listado SAT EFOS (empresas que facturan operaciones simuladas), el registro de inhabilitados de la SFP (Secretaría de la Función Pública), RUPC (Registro Único de Proveedores y Contratistas) y hallazgos de la ASF — todos ellos registros públicos del gobierno mexicano.'
                  : "We also incorporate data from the SAT EFOS list (empresas que facturan operaciones simuladas), the SFP sanctions registry (Secretaría de la Función Pública), RUPC (registro único de proveedores y contratistas), and ASF audit findings — all of which are public registries published by the Mexican government."
                }
              </p>
            </div>
            <div>
            <h3>{isEs ? 'RFC — Solo personas morales' : 'RFC — Legal Entities Only'}</h3>
              <p>
                {isEs
                  ? <>Los registros de COMPRANET incluyen el <strong>RFC (Registro Federal de Contribuyentes)</strong> de los proveedores e instituciones contratantes. RUBLI solo muestra y procesa RFCs pertenecientes a <strong>personas morales</strong> (empresas, ONG, dependencias gubernamentales).</>
                  : <>COMPRANET records include the <strong>RFC (Registro Federal de Contribuyentes)</strong> — the Mexican tax identifier — of vendors and contracting institutions. RUBLI only displays and processes RFCs belonging to <strong>legal entities</strong> (personas morales: companies, NGOs, government agencies).</>
                }
              </p>
              <p>
                {isEs
                  ? <>Los RFCs de <strong>personas físicas</strong> son <strong>enmascarados o excluidos</strong> del sistema. El RFC de una persona física codifica su fecha de nacimiento e iniciales del nombre, por lo que constituye dato personal conforme a la LFPDPPP. Lo tratamos en consecuencia.</>
                  : <>RFCs belonging to <strong>natural persons</strong> (personas físicas) are <strong>masked or excluded</strong> from display. The RFC of a persona física encodes the holder's birth date and name initials and is therefore personal data under LFPDPPP. We treat it accordingly.</>
                }
              </p>
            </div>
        </Section>

        {/* ------------------------------------------------------------------ */}
        <Section id="legal-basis" title={isEs ? '3. Base legal' : '3. Legal Basis'}>
          <p>{isEs ? 'Nuestro tratamiento de datos públicos de contrataciones se fundamenta en:' : 'Our processing of public procurement data is grounded in:'}</p>
          <ul role="list">
            <li>
              <strong>{isEs ? 'Fuente de acceso público' : 'Publicly accessible source'}</strong>{' '}
              {isEs
                ? 'conforme a la LFPDPPP de 2025: los datos personales que figuran en fuentes de acceso público pueden tratarse sin consentimiento (art. 9, fr. II), y son fuentes de acceso público las bases de datos que por disposición de ley pueden consultarse públicamente (art. 2, fr. X).'
                : 'under the 2025 LFPDPPP: personal data contained in publicly accessible sources may be processed without consent (art. 9, section II), and publicly accessible sources are the databases that the law allows anyone to consult (art. 2, section X).'
              }
            </li>
            <li>
              <strong>{isEs ? 'La obligación de transparencia sobre contrataciones' : 'The procurement transparency obligation'}</strong>{' '}
              {isEs
                ? 'de la Ley General de Transparencia y Acceso a la Información Pública de 2025, que obliga a las dependencias a publicar los resultados de sus adjudicaciones, invitaciones y licitaciones, incluido el nombre de la persona física o moral adjudicada (art. 65, fr. XXVI), y que permite a cualquier persona usar y redistribuir los datos abiertos (art. 3, fr. VIII).'
                : 'of the 2025 General Law on Transparency and Access to Public Information, which requires agencies to publish the results of their direct awards, restricted invitations and tenders, including the name of the natural or legal person awarded the contract (art. 65, section XXVI), and allows anyone to use and redistribute open data (art. 3, section VIII).'
              }
            </li>
            <li>
              {isEs
                ? <><strong>El mandato de datos abiertos</strong> del gobierno federal mexicano (Política de Datos Abiertos, DOF 2015), que obliga a publicar los datos de COMPRANET en formatos reutilizables.</>
                : <>The <strong>open data mandate</strong> of the Mexican federal government (Política de Datos Abiertos, DOF 2015), which requires COMPRANET data to be published in machine-readable formats for reuse.</>
              }
            </li>
            <li>
              <strong>{isEs ? 'Rendición de cuentas y transparencia' : 'Accountability and transparency'}</strong>{' '}
              {isEs
                ? 'y las libertades de expresión e información, reconocidas en los arts. 6 y 7 de la Constitución Mexicana.'
                : 'and the freedoms of expression and information, as recognised in arts. 6 and 7 of the Mexican Constitution.'
              }
            </li>
          </ul>
          <p>
            {isEs
              ? 'La autoridad de protección de datos personales en el sector privado es la Secretaría Anticorrupción y Buen Gobierno.'
              : 'The authority for personal data protection in the private sector is the Secretaría Anticorrupción y Buen Gobierno (Anti-Corruption and Good Government Ministry).'}
          </p>
        </Section>

        {/* ------------------------------------------------------------------ */}
        <Section id="visitor-data" title={isEs ? '4. Datos de visitantes — Lo que NO recopilamos' : '4. Visitor Data — What We Do NOT Collect'}>
          <p>{isEs ? 'No realizamos ninguna de las siguientes acciones:' : 'We do not:'}</p>
          <ul role="list">
            {isEs ? <>
              <li>Requerir registro o inicio de sesión de los usuarios</li>
              <li>Instalar cookies publicitarias o de rastreo</li>
              <li>Usar analíticas de terceros (sin Google Analytics, Mixpanel ni equivalentes)</li>
              <li>Registrar direcciones IP asociadas a la actividad de navegación</li>
              <li>Vender o compartir datos de visitantes con terceros</li>
            </> : <>
              <li>Require user registration or login</li>
              <li>Set advertising or tracking cookies</li>
              <li>Use third-party analytics (no Google Analytics, Mixpanel, or equivalent)</li>
              <li>Record IP addresses in association with browsing activity</li>
              <li>Sell or share visitor data with any third party</li>
            </>}
          </ul>
          <p>
            {isEs
              ? <>Podemos almacenar preferencias funcionales mínimas (idioma, vista guardada) en <Tag>localStorage</Tag> del navegador. No contienen datos personales, permanecen en su dispositivo y nunca se transmiten a nuestros servidores.</>
              : <>We may store minimal functional preferences (language, saved view) in browser <Tag>localStorage</Tag>. These contain no personal data, stay on your device, and are never transmitted to our servers.</>
            }
          </p>
        </Section>

        {/* ------------------------------------------------------------------ */}
        <Section id="retention" title={isEs ? '5. Retención y almacenamiento de datos' : '5. Data Retention & Storage'}>
          <p>
            {isEs
              ? 'Los registros de contrataciones se conservan mientras la plataforma esté en funcionamiento y los datos fuente sigan publicados. La base de datos se reconstruye periódicamente a partir de los archivos fuente. Además de esos registros públicos, guarda lo que RUBLI calcula con ellos: indicadores de riesgo, clasificaciones, casos documentados y la fila de investigación de Focos Rojos. No guarda datos de visitantes.'
              : 'Procurement records are retained as long as the platform is operational and the source data remains published. The database is rebuilt periodically from the source files. Besides those public records, it holds what RUBLI computes from them: risk indicators, classifications, documented cases and the Red Flags investigation queue. It holds no visitor data.'
            }
          </p>
          <p>
            {isEs
              ? 'No se almacenan datos de visitantes en el servidor, salvo lo que usted envíe por el formulario de reportes (el texto y, si lo deja, su correo). Los registros del servidor, en su caso, se conservan por no más de 30 días con fines operativos exclusivamente y no están vinculados a la actividad de navegación.'
              : 'No visitor data is stored server-side, except what you send through the report form (the text and, if you leave it, your email). Server logs, if any, are retained for no longer than 30 days for operational purposes only and are not linked to browsing activity.'
            }
          </p>
        </Section>

        {/* ------------------------------------------------------------------ */}
        <Section id="arco" title={isEs ? '6. Sus derechos (LFPDPPP — ARCO)' : '6. Your Rights (LFPDPPP — ARCO)'}>
          <p>
            {isEs
              ? <> Conforme a la LFPDPPP, usted tiene derecho de <strong>Acceso, Rectificación, Cancelación y Oposición</strong> (derechos ARCO) respecto a sus datos personales.</>
              : <>Under the LFPDPPP you have the right to <strong>Access, Rectification, Cancellation, and Opposition</strong> (ARCO rights) with respect to your personal data.</>
            }
          </p>
          <p>
            {isEs
              ? <>Dado que RUBLI deriva sus datos de fuentes gubernamentales públicas, el mecanismo principal para corregir errores en los registros de contrataciones es la institución contratante correspondiente, que publica sus contratos en ComprasMX (en CompraNet hasta septiembre de 2025). Sin embargo, si considera que RUBLI conserva o muestra datos personales suyos que son inexactos o deben eliminarse, escríbanos a </>
              : <>Because RUBLI derives its data from public government sources, the primary mechanism for correcting errors in procurement records is the relevant contracting institution, which publishes its contracts in ComprasMX (CompraNet up to September 2025). However, if you believe RUBLI holds or displays personal data about you that is inaccurate or should be removed, please write to </>
            }
            <a href="mailto:rubli-project@proton.me" className="ct-link">rubli-project@proton.me</a>{' '}
            {isEs ? <>con el asunto <Tag>privacy</Tag>. Responderemos en un plazo máximo de 20 días (LFPDPPP). El trámite es gratuito.</> : <>with the subject <Tag>privacy</Tag>. We will answer within 20 days at most (LFPDPPP). The request is free of charge.</>}
          </p>
          <h3>{isEs ? 'Cómo solicitar una corrección u oposición' : 'How to request a correction or object'}</h3>
          <p>
            {isEs
              ? <>Si usted es una persona física que aparece como proveedor, use el enlace «¿Es usted esta persona? Solicite corrección u oposición» bajo su nombre en el expediente, o escriba al correo anterior. Indique el número de proveedor (aparece en la dirección de la página, <Tag>/vendors/…</Tag>), qué dato es inexacto o por qué se opone, y la evidencia que tenga. Deje un correo para recibir la respuesta. Las solicitudes se guardan en un registro privado (fecha, tipo, decisión y fecha de respuesta); nunca se publican, ni el nombre de quien las presenta.</>
              : <>If you are an individual (persona física) listed as a supplier, use the link «Are you this person? Request a correction or object» under your name on the dossier, or write to the address above. Give the vendor number (it appears in the page address, <Tag>/vendors/…</Tag>), which data is inaccurate or why you object, and any evidence you have. Leave an email to receive the answer. Requests are kept in a private log (date, type, decision and date answered); they are never published, nor is the name of the person who files them.</>
            }
          </p>
        </Section>

        {/* ------------------------------------------------------------------ */}
        <Section id="oposicion" title={isEs ? '7. Política de oposición' : '7. Objection Policy'}>
          <PfFlow
            label={isEs ? 'Qué pasa con su oposición, en cuatro pasos' : 'What happens to your objection, in four steps'}
            steps={[
              { name: isEs ? 'Usted escribe' : 'You write', note: isEs ? <>Desde el enlace del expediente, o por correo con el asunto <Tag>privacy</Tag>.</> : <>From the dossier’s link, or by email with the subject <Tag>privacy</Tag>.</> },
              { via: isEs ? 'la revisa' : 'reviewed', name: isEs ? 'Una persona' : 'A person', note: isEs ? 'No el modelo.' : 'Not the model.' },
              { via: isEs ? 'responde' : 'answers', name: isEs ? 'En 20 días' : 'Within 20 days', note: isEs ? 'Por escrito, como máximo (LFPDPPP).' : 'In writing, at most (LFPDPPP).' },
              {
                via: isEs ? 'decide' : 'decides', focal: true, name: isEs ? 'Una de dos' : 'One of two',
                children: (
                  <ul className="plt-flow-lv">
                    <li>{isEs ? 'a · Quitamos su nombre del indicador y de la fila de investigación.' : 'a · We take your name off the indicator and the investigation queue.'}</li>
                    <li>{isEs ? 'b · Explicamos por qué pesa el interés público.' : 'b · We explain why the public interest weighs more.'}</li>
                  </ul>
                ),
              },
            ]}
          />
          <p>
            {isEs
              ? 'El indicador de riesgo y la fila de investigación de Focos Rojos ordenan la revisión humana; no son una conclusión automática ni una acusación. Cada objeción la revisa una persona, no el modelo.'
              : 'The risk indicator and the Red Flags investigation queue order human review; they are not an automatic conclusion nor an accusation. Every objection is reviewed by a person, not by the model.'}
          </p>
          <p>
            {isEs
              ? 'Ante una oposición motivada de una persona física (LFPDPPP), en un plazo máximo de 20 días respondemos por escrito con una de dos decisiones: (a) retiramos su nombre del indicador y de la fila de investigación, y conservamos el registro del contrato sin puntaje; o (b) explicamos por qué el interés público de la información prevalece. Si un dato es inexacto, lo corregimos.'
              : 'When an individual (persona física) files a reasoned objection (LFPDPPP), we answer in writing within 20 days at most with one of two decisions: (a) we remove their name from the indicator and the investigation queue, keeping the contract record without a score; or (b) we explain why the public interest in the information prevails. If a fact is inaccurate, we correct it.'}
          </p>
        </Section>

        {/* ------------------------------------------------------------------ */}
        <Section id="third-parties" title={isEs ? '8. Servicios de terceros' : '8. Third-Party Services'}>
          <p>
            {isEs
              ? 'La plataforma RUBLI no integra servicios de terceros que recopilen datos personales (por ejemplo, mapas incrustados, botones de redes sociales o widgets de chat). Todo el procesamiento de datos ocurre en la infraestructura de servidores de RUBLI.'
              : 'The RUBLI platform does not embed third-party services that collect personal data (e.g., embedded maps, social media buttons, or chat widgets). All data processing occurs on the RUBLI server infrastructure.'
            }
          </p>
          <p>
            {isEs
              ? "El código fuente está alojado en GitHub. La política de privacidad propia de GitHub aplica a la actividad en github.com."
              : "The source code is hosted on GitHub. GitHub's own privacy policy applies to activity on github.com."
            }
          </p>
        </Section>

        {/* ------------------------------------------------------------------ */}
        <Section id="changes" title={isEs ? '9. Cambios a este aviso' : '9. Changes to This Policy'}>
          <p>
            {isEs
              ? 'Podemos actualizar este aviso para reflejar cambios en la plataforma o en la legislación aplicable. La fecha en la parte superior de esta página indica la revisión más reciente. Los cambios sustanciales se anunciarán a través del repositorio de GitHub del proyecto.'
              : 'We may update this policy to reflect changes in the platform or applicable law. The date at the top of this page indicates the most recent revision. Material changes will be announced via the project\'s GitHub repository.'
            }
          </p>
        </Section>

    </PfShell>
  )
}
