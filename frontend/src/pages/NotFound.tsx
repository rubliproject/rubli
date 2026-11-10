/**
 * NotFound — the catch-all route on «El Contrato» (DESIGN.md §5.1 read page):
 * kit/PageHead (404 in the meta) → the search as the object →
 * «Por dónde seguir», the six main doors as a hairline grid.
 */
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { PageHead } from '@/components/kit/PageHead'
import { STORIES_LIVE } from '@/lib/constants'
import { NoIndex } from '@/lib/seo/routeMeta'

const DOORS = [
  { to: '/', es: ['Portada', 'El registro de un vistazo: monto, contratos y el caso en vivo.'], en: ['Front page', 'The record at a glance: value, contracts and the live case.'] },
  { to: '/aria', es: ['Focos Rojos', 'La fila de investigación ARIA: proveedores ordenados por prioridad.'], en: ['Red Flags', 'The ARIA investigation queue: vendors ranked by priority.'] },
  { to: '/contracts', es: ['El Archivo', 'Cada contrato federal desde 2002, con filtros y exportación.'], en: ['The Archive', 'Every federal contract since 2002, with filters and export.'] },
  { to: '/sectors', es: ['Sectores', 'Los doce sectores del gasto y su parte señalada.'], en: ['Sectors', 'The twelve spending sectors and their flagged share.'] },
  { to: '/institutions', es: ['Instituciones', 'Las dependencias compradoras, calificadas y comparadas.'], en: ['Institutions', 'The buying agencies, graded and compared.'] },
  ...(STORIES_LIVE ? [{ to: '/journalists', es: ['Historias', 'Las investigaciones publicadas con datos del registro.'], en: ['Stories', 'The investigations published from the record.'] }] : []),
] as const

export function NotFound() {
  const navigate = useNavigate()
  const { t, i18n } = useTranslation('common')
  const isEs = !i18n.language?.startsWith('en')
  const [query, setQuery] = useState('')

  function handleSearch(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const q = query.trim()
    if (q) navigate(`/explore?q=${encodeURIComponent(q)}`)
  }

  return (
    <article className="ct ct-page ct-sheet" data-frame>
      {/* a path nginx did not 404 (soft 404): keep it out of the index (joker review 09 #1) */}
      <NoIndex />
      <div className="ct-wrap">
        <PageHead lang={isEs ? 'es' : 'en'} crumbs={[{ label: isEs ? 'Sin registro' : 'No record' }]} meta={<>{isEs ? 'Código' : 'Code'} <b>404</b></>}
          finding={t('notFound.title')} question={t('notFound.description')} />

        <form className="ct-lead" role="search" onSubmit={handleSearch} data-object>
          <label htmlFor="nf-q">{isEs ? 'Buscar en el registro' : 'Search the record'}</label>
          <div className="ct-field">
            <input id="nf-q" type="search" autoComplete="off" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('notFound.searchPlaceholder')} />
            <button type="submit" disabled={!query.trim()}>{isEs ? 'Buscar' : 'Search'}</button>
          </div>
        </form>

        <section className="ct-section" aria-labelledby="nf-doors-h">
          <div className="ct-annex-row"><h2 id="nf-doors-h" className="ct-h2">{isEs ? 'Por dónde seguir' : 'Where to go next'}</h2></div>
          <ul className="ct-section-body">
            {DOORS.map((d) => {
              const [name, note] = isEs ? d.es : d.en
              return (
                <li key={d.to} className="grid grid-cols-1 items-baseline gap-x-12 border-t border-border py-3 md:grid-cols-[240px_minmax(0,1fr)]">
                  <Link to={d.to} className="ct-link font-semibold">{name}</Link>
                  <p className="text-text-secondary">{note}</p>
                </li>
              )
            })}
          </ul>
        </section>
      </div>
    </article>
  )
}
