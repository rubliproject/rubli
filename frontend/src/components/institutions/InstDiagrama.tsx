/**
 * /institutions El diagrama (default view). One picture, one reading, left to right:
 *   dependencia → sin licitación → su mayor proveedor → con riesgo alto o crítico,
 * one row per big federal buyer, worst grade first; a ruled line separates who fails (under 6 de 10).
 * BLUE simplify 2026-11-05 (owner: «I get lost within all those keys and chains»): one ink for every bar, no sector
 * tint or grade colours, no per-row connectors or keys — the head row carries the reading. Detail on tap: the
 * «sin licitación» cell opens «¿a quién?», the buyer's top direct-award recipients (API, EntityIdentityChip).
 * The worst-graded row opens first, so the «who» is on screen without a tap.
 */
import { Fragment, useMemo, useState, type CSSProperties } from 'react'
import { useQuery } from '@tanstack/react-query'
import { scorecardApi } from '@/api/client'
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import { formatCompactMXN } from '@/lib/utils'
import { byGrade, fails, failing, gradeTen, pct, type AnatomyRow } from '@/lib/institutions/anatomy'
import { gradeWord } from '@/lib/tiers'
import './instgraphics.css'

/** One query for the diagram, the anatomy and the page's finding (same key = one request). */
export const anatomyQuery = { queryKey: ['institution-anatomy', 12], queryFn: () => scorecardApi.getInstitutionAnatomy(12), staleTime: 60 * 60_000 } as const

/** A share bar: one ink, length = share of the buyer's pesos. Hatched = no data. */
function Bar({ share }: { share: number | null }) {
  if (share == null) return <span className="idg-bar pat-sin-dato" aria-hidden="true" />
  return <span className="idg-bar" aria-hidden="true"><i style={{ width: `${Math.max(0, Math.min(1, share)) * 100}%` } as CSSProperties} /></span>
}

/** «¿A quién?»: the buyer's top recipients of pesos without a tender, fetched on open. */
function Quien({ r, lang }: { r: AnatomyRow; lang: string }) {
  const en = lang === 'en'
  const L = (es: string, e: string) => (en ? e : es)
  const q = useQuery({ queryKey: ['institution-da-top', r.id], queryFn: () => scorecardApi.getInstitutionDaTop(r.id, 3), staleTime: 60 * 60_000 })
  return (
    <div className="idg-who" id={`idg-who-${r.id}`}>
      <b>{q.data ? L(`De sus ${formatCompactMXN(q.data.da_value_mxn, 'mdp')} sin concurso, sobre todo a:`, `Of its ${formatCompactMXN(q.data.da_value_mxn, 'mdp')} without a tender, mostly to:`) : L('Sin licitación, sobre todo a:', 'Without a tender, mostly to:')}</b>{' '}
      {q.isError ? <span className="ig-dim">{L('no se pudo cargar.', 'could not be loaded.')}</span>
        : !q.data ? <span className="ig-dim">{L('cargando…', 'loading…')}</span>
        : !q.data.top.length ? <span className="ig-dim">{L('sin dato.', 'no data.')}</span>
        : q.data.top.map((t, k) => (
          <span key={t.id} className="idg-who-i">
            {k > 0 && ' · '}
            {t.name ? <EntityIdentityChip type="vendor" id={t.id} name={t.name} variant="name" size="inherit" /> : <span className="ig-dim">{L('sin nombre público', 'no public name')}</span>}
            {t.kind === 'pf' && <span className="ig-dim">{L(', persona física', ', a natural person')}</span>}
            {' '}<b className="idg-n">{pct(t.share, lang)}</b>
          </span>
        ))}
    </div>
  )
}

export function InstDiagrama({ lang }: { lang: string }) {
  const en = lang === 'en'
  const L = (es: string, e: string) => (en ? e : es)
  const q = useQuery(anatomyQuery)
  const rows = useMemo(() => byGrade(q.data?.rows ?? []), [q.data])
  const [open, setOpen] = useState<number | null>(null)

  if (q.isError) return <p role="alert" className="ct-note">{L('No se pudo cargar el diagrama de las dependencias.', 'The agencies’ diagram could not be loaded.')}</p>
  if (!rows.length) return <div aria-hidden="true" className="lg-hold lg-hold-tm" />

  const nf = failing(rows)
  const shown = open ?? rows[0].id   // the worst-graded row starts open
  const passAt = rows.findIndex((r) => !fails(r))
  return (
    <section className="idg" aria-labelledby="idg-h">
      <h2 id="idg-h" className="ig-h1">{L(`Las ${rows.length} dependencias que más gastan, de la peor a la mejor calificada`, `The ${rows.length} agencies that spend the most, worst grade first`)}</h2>
      {/* the head row carries the reading, left to right; nothing else to decode */}
      <div className="idg-heads" aria-hidden="true">
        <span className="idg-hd">{L('Dependencia · calificación', 'Agency · grade')}</span>
        <span className="idg-hd">→ {L('sin concurso', 'without a tender')}</span>
        <span className="idg-hd">→ {L('su mayor proveedor', 'its top supplier')}</span>
        <span className="idg-hd">→ {L('indicador alto o crítico', 'high or critical indicator')}</span>
      </div>
      <ol className="idg-rows" aria-label={L(`${rows.length} dependencias, de peor a mejor calificación`, `${rows.length} agencies, worst grade first`)}>
        {rows.map((r, i) => {
          const tv = r.top_vendor
          const isOpen = shown === r.id
          return (
            <Fragment key={r.id}>
              {i === passAt && i > 0 && (
                <li className="idg-rule"><span>{L(`arriba, ${nf} reprueban · abajo, aprueban`, `above, ${nf} fail · below, they pass`)}</span></li>
              )}
              <li className={`idg-row${i === 0 ? ' is-key' : ''}${isOpen ? ' is-open' : ''}`}>
                <div className="idg-dep">
                  <p className="idg-name"><EntityIdentityChip type="institution" id={r.id} name={r.name} variant="name" size="inherit" /></p>
                  <p className={`idg-meta${fails(r) ? ' is-fail' : ''}`}>{gradeTen(r.score, lang)}, {gradeWord(r.score, en ? 'en' : 'es')}</p>
                </div>
                <button type="button" className="idg-cell idg-da" aria-expanded={isOpen} aria-controls={isOpen ? `idg-who-${r.id}` : undefined}
                  title={L('¿A quién? Toque para ver', 'To whom? Tap to see')}
                  onClick={() => setOpen(isOpen ? -1 : r.id)}>
                  <Bar share={r.da_share} />
                  <span className="idg-v"><b>{pct(r.da_share, lang)}</b><span className="sr-only"> {L('sin concurso', 'without a tender')}</span> <span className="idg-ask">{L('¿a quién?', 'to whom?')} {isOpen ? '▴' : '▾'}</span></span>
                </button>
                <div className="idg-cell">
                  <Bar share={r.top_share} />
                  <p className="idg-v"><b>{pct(r.top_share, lang)}</b>{' '}
                    {!tv ? L('sin dato', 'no data')
                      : tv.id == null || !tv.name ? <span className="ig-dim">{L('sin nombre público', 'no public name')}</span>
                        : <><EntityIdentityChip type="vendor" id={tv.id} name={tv.name} variant="name" size="inherit" />{tv.kind === 'pf' && <span className="ig-dim">{L(', persona física', ', a natural person')}</span>}</>}
                  </p>
                </div>
                <div className="idg-cell" title={L('pesos con indicador de riesgo alto o crítico', 'pesos with a high or critical risk indicator')}>
                  <Bar share={r.hr_share} />
                  <p className="idg-v"><b>{pct(r.hr_share, lang)}</b><span className="sr-only"> {L('con indicador de riesgo alto o crítico', 'with a high or critical risk indicator')}</span></p>
                </div>
                {isOpen && <Quien r={r} lang={lang} />}
              </li>
            </Fragment>
          )
        })}
      </ol>
      <p className="ig-note">
        {L('Registro 2002–2025. Cada barra es una parte de sus pesos. Un indicador de riesgo alto no prueba delito.',
          'Record 2002–2025. Each bar is a share of its pesos. A high risk indicator does not prove a crime.')}
      </p>
    </section>
  )
}
