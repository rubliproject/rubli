/**
 * Conexiones — the standard doors out of a dossier (owner 2026-10-27: «interconnect stuff from the
 * website with other stuff»; spec _explore/interconnection_audit_2026-10-27.md § Feeds). One
 * hairline ledger, a door per row: Sector · Categorías · Instituciones · Proveedores · Focos Rojos ·
 * Patrón · Casos documentados · Contratos · Captura (slot) · El Mapa. A door renders only when its
 * data exists — never an empty door; with no doors the block renders nothing. Entities go through
 * EntityIdentityChip (rule 1); the rest are plain links with a count where the page knows it.
 * The last section before the colophon on every dossier.
 */
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import { patternLabels } from '@/components/atlas/sky/expediente-adapter'
import { PATTERN_COLORS, SECTORS } from '@/lib/constants'

type Lang = 'en' | 'es'
type Ent = { id: number; name: string | null | undefined }

/** Entity doors show this many names; the count says how many there are. */
const SHOWN = 3

export interface ConexionesProps {
  lang: Lang
  sectorId?: number | null
  categories?: Ent[]
  institutions?: Ent[]
  vendors?: Ent[]
  /** /aria/caso/:id when the vendor is queued, else the queue filtered. */
  focos?: { to: string; label: string } | null
  pattern?: string | null
  cases?: { slug: string; name: string | null | undefined }[]
  contracts?: { to: string; count?: number | null; label?: string } | null
  /** Reserved for the Captura doors (ui/captura-relevo); absent = no row. */
  captura?: ReactNode
  mapa?: string | null
}

export function Conexiones({ lang, sectorId, categories, institutions, vendors, focos, pattern, cases, contracts, captura, mapa }: ConexionesProps) {
  const en = lang === 'en'
  const sector = sectorId != null ? SECTORS.find((s) => s.id === sectorId) : undefined
  const n = (x: number) => x.toLocaleString(en ? 'en-US' : 'es-MX')

  const list = (type: 'category' | 'institution' | 'vendor', rows: Ent[] | undefined) => {
    const ok = (rows ?? []).filter((r) => r.id != null && r.name)
    if (!ok.length) return null
    return (
      <>
        {ok.slice(0, SHOWN).map((r) => (
          <EntityIdentityChip key={r.id} type={type} id={r.id} name={r.name} variant="name" fullName />
        ))}
        {ok.length > SHOWN && <span className="ct-mono cx-more">+{n(ok.length - SHOWN)}</span>}
      </>
    )
  }

  const doors: [string, ReactNode][] = []
  const add = (label: string, body: ReactNode) => { if (body) doors.push([label, body]) }

  add(en ? 'Sector' : 'Sector', sector && (
    <span>
      <span className="ct-sq" aria-hidden="true" style={{ ['--c' as string]: sector.color }} />
      <EntityIdentityChip type="sector" id={sector.id} name={en ? sector.nameEN : sector.name} variant="name" />
    </span>
  ))
  add(en ? 'Categories' : 'Categorías', list('category', categories))
  add(en ? 'Institutions' : 'Instituciones', list('institution', institutions))
  add(en ? 'Top vendors' : 'Proveedores principales', list('vendor', vendors))
  add(en ? 'Red Flags' : 'Focos Rojos', focos && <Link to={focos.to}>{focos.label}</Link>)
  add(en ? 'Pattern' : 'Patrón', pattern && (
    <span>
      <span className="ct-sq" aria-hidden="true" style={{ ['--c' as string]: PATTERN_COLORS[pattern] }} />
      <EntityIdentityChip type="pattern" id={pattern} name={`${pattern} · ${patternLabels(lang)[pattern] ?? pattern}`} variant="name" />
    </span>
  ))
  add(en ? 'Documented cases' : 'Casos documentados', (cases ?? []).length > 0 && (
    <>
      {(cases ?? []).slice(0, SHOWN).map((c) => (
        <EntityIdentityChip key={c.slug} type="case" id={c.slug} name={c.name} variant="name" fullName />
      ))}
      {(cases ?? []).length > SHOWN && <span className="ct-mono cx-more">+{n((cases ?? []).length - SHOWN)}</span>}
    </>
  ))
  add(en ? 'Contracts' : 'Contratos', contracts && (
    <Link to={contracts.to}>
      {contracts.label ?? (contracts.count != null
        ? (en ? `${n(contracts.count)} in the Archive` : `${n(contracts.count)} en El Archivo`)
        : (en ? 'Open them in the Archive' : 'Verlos en El Archivo'))}
    </Link>
  ))
  add('Captura', captura)
  add(en ? 'The Map' : 'El Mapa', mapa && <Link to={mapa}>{en ? 'See it in Links' : 'Verlo en Vínculos'}</Link>)

  if (!doors.length) return null
  return (
    <section id="conexiones" className="ct-section ct-cx scroll-mt-14" aria-labelledby="cx-h">
      <div className="ct-annex-row">
        <h2 id="cx-h" className="ct-h2"><span className="ct-sc">{en ? 'Connections' : 'Conexiones'}</span></h2>
      </div>
      <dl>
        {doors.map(([label, body]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{body}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
