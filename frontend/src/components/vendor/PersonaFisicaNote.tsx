/**
 * PersonaFisicaNote — the quiet line under a persona física's name (vendor dossier, ARIA case, print
 * dossier): the label, what RUBLI is and is not, homonyms, and the correction / opposition request
 * (docs/LEGAL_RESEARCH_PERSONAS_FISICAS_2026-10-30.md § 5 #2, #10, #14, #15). The request goes to the
 * existing issues channel (POST /issues, category correccion_persona_fisica), private to RUBLI.
 */
import { lazy, Suspense, useState } from 'react'
import { Link } from 'react-router-dom'

const ReportIssueDialog = lazy(() =>
  import('@/components/ReportIssueDialog').then((m) => ({ default: m.ReportIssueDialog })),
)

export function PersonaFisicaNote({ vendorId, lang }: { vendorId: number; lang: 'en' | 'es' }) {
  const en = lang === 'en'
  const [open, setOpen] = useState(false)
  return (
    <p className="ct-note">
      <b>{en ? 'Individual supplier (persona física).' : 'Persona física.'}</b>{' '}
      {en
        ? 'A RUBLI journalistic investigation built on public CompraNet/ComprasMX data; it is not an accusation nor an investigation by any authority. Different people may share a name.'
        : 'Investigación periodística de RUBLI con datos públicos de CompraNet/ComprasMX; no es una acusación ni una investigación de autoridad alguna. Puede haber homónimos.'}{' '}
      <button type="button" className="ct-link" onClick={() => setOpen(true)}>
        {en ? 'Are you this person? Request a correction or object' : '¿Es usted esta persona? Solicite corrección u oposición'}
      </button>
      {' · '}
      <Link className="ct-link" to="/privacy#oposicion">{en ? 'how it is handled' : 'cómo se atiende'}</Link>
      {open && (
        <Suspense fallback={null}>
          <ReportIssueDialog
            open={open}
            onOpenChange={setOpen}
            initialCategory="correccion_persona_fisica"
            initialSubject={en ? `Correction or objection — vendor #${vendorId}` : `Corrección u oposición — proveedor #${vendorId}`}
          />
        </Suspense>
      )}
    </p>
  )
}
