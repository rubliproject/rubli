/**
 * LeadSearch — the journalist arrives with a name (DESIGN.md §8): 2px ink field,
 * 44px Spectral 17 input, ink button, example chips. Ctrl K lands here (#ct-lead-q).
 * Results come from the federated search, each through its entity chip.
 */
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { searchApi } from '@/api/client'
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import { LEAD_SEARCH_ID } from './TopBar'
import { useLang } from './nav'

export interface LeadExample { type: 'vendor' | 'institution'; id: number; name: string }

export function LeadSearch({ examples }: { examples: LeadExample[] }) {
  const lang = useLang()
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [term, setTerm] = useState('')
  useEffect(() => {
    const t = window.setTimeout(() => setTerm(q.trim()), 300)
    return () => window.clearTimeout(t)
  }, [q])
  const { data, isFetching, isError, isPlaceholderData } = useQuery({
    queryKey: ['search', 'federated', term],
    placeholderData: keepPreviousData,
    queryFn: () => searchApi.federated(term, 4),
    enabled: term.length >= 3,
    staleTime: 5 * 60 * 1000,
  })
  const vendors = data?.vendors ?? []
  const institutions = data?.institutions ?? []
  const contracts = data?.contracts ?? []
  const cases = data?.cases ?? []
  const any = vendors.length + institutions.length + contracts.length + cases.length > 0

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    // Enter within the 300ms debounce (or while the previous query's results are
    // still shown) must not open the old first hit — search the typed text instead.
    if (q.trim() !== term || isFetching || isPlaceholderData) { setTerm(q.trim()); return }
    const first = vendors[0] ? `/vendors/${vendors[0].id}`
      : institutions[0] ? `/institutions/${institutions[0].id}`
      : cases[0] ? `/cases/${cases[0].slug}`
      : contracts[0] ? `/contracts/${contracts[0].id}` : null
    if (first) navigate(first)
    else setTerm(q.trim())
  }

  return (
    <form className="ct-lead" role="search" aria-label={lang === 'en' ? 'Search the record' : 'Buscar en el registro'} onSubmit={onSubmit}>
      <label htmlFor={LEAD_SEARCH_ID} className="sr-only">{lang === 'en' ? 'Look up a record' : 'Buscar un expediente'}</label>
      <div className="ct-field">
        <input
          id={LEAD_SEARCH_ID}
          type="search"
          autoComplete="off"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={lang === 'en' ? 'Vendor, institution or case…' : 'Proveedor, institución o caso…'}
          aria-describedby="ct-lead-status"
        />
        <button type="submit">{lang === 'en' ? 'Search' : 'Buscar'}</button>
      </div>
      <p id="ct-lead-status" className="ct-note" role="status" aria-live="polite">
        {term.length >= 3 && (isFetching
          ? (lang === 'en' ? 'Searching…' : 'Buscando…')
          : isError ? (lang === 'en' ? 'Search is not responding right now. Try again.' : 'La búsqueda no responde ahora. Vuelva a intentarlo.')
          : !any ? (lang === 'en' ? `No record matches «${term}».` : `Ningún registro coincide con «${term}».`) : null)}
      </p>
      {any && (
        <ul className="ct-eg" aria-label={lang === 'en' ? 'Results' : 'Resultados'}>
          {vendors.map((v) => <li key={`v${v.id}`}><EntityIdentityChip type="vendor" id={v.id} name={v.name} variant="name" /></li>)}
          {institutions.map((i) => <li key={`i${i.id}`}><EntityIdentityChip type="institution" id={i.id} name={i.name} variant="name" /></li>)}
          {cases.map((c) => <li key={`c${c.slug}`}><EntityIdentityChip type="case" id={c.slug} name={c.title} variant="name" /></li>)}
          {contracts.map((c) => <li key={`k${c.id}`}><Link to={`/contracts/${c.id}`}>{c.title || `${lang === 'en' ? 'Contract' : 'Contrato'} ${c.id}`}</Link></li>)}
        </ul>
      )}
      {!any && (
        <div className="ct-eg">
          <span>{lang === 'en' ? 'For example' : 'Por ejemplo'}</span>
          {examples.map((x) => <EntityIdentityChip key={`${x.type}${x.id}`} type={x.type} id={x.id} name={x.name} variant="name" />)}
        </div>
      )}
    </form>
  )
}
