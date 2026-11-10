/**
 * InstitutionDossier — /institutions/:id, concept B2 «Dos caras · La columna» (owner pick 2026-11-06;
 * docs/PROFILE_CONTENT_INSTITUTION_2026-11-05.md). One page, two tabs (Panorama general · Calificación institucional),
 * «Hoy» (this government) by default and «Historia» beside it. The body lives in components/institution/b2;
 * this route keeps the record lookup, the canonical-id redirect, the not-found state and the Conexiones footer.
 */
import { useEffect, type ReactNode } from 'react'
import { Link, useNavigate, useParams, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { institutionApi, caseLibraryApi } from '@/api/client'
import { institutionDetailQuery } from '@/api/entityQueries'
import { loadAnatomy } from '@/lib/institution/anatomy'
import { HOY_FROM, panoramaApi } from '@/lib/institution/panorama'
import { InstitutionB2 } from '@/components/institution/b2/InstitutionB2'
import { DossierOriginProvider } from '@/lib/nav/WayfindingProviders'
import { formatEntityName } from '@/lib/entity/format'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { formatCompactMXN, formatNumber, STATE_PREFIXES } from '@/lib/utils'
import { cieloHref } from '@/lib/vista'
import { DocHead } from '@/components/contrato/DocHead'
import { Conexiones } from '@/components/contrato/Conexiones'
import { Cover } from '@/components/contrato/Cover'
import { useLang } from '@/components/contrato/nav'
import { NoIndex, clip } from '@/lib/seo/routeMeta'

/** The page frame, also used while loading so the geometry is reserved. */
function Sheet({ children }: { children: ReactNode }) {
  return (
    <article className="ct ct-page ct-sheet inst-dossier" data-frame>
      <div className="ct-wrap">{children}</div>
    </article>
  )
}

export default function InstitutionDossier() {
  const { id } = useParams<{ id: string }>()
  const institutionId = Number(id)
  const validId = Number.isFinite(institutionId) && institutionId > 0
  const navigate = useNavigate()
  const location = useLocation()
  const lang = useLang()
  const en = lang === 'en'

  const { data: institution, isLoading: instLoading, isError: instError, error: instErr } = useQuery({
    ...institutionDetailQuery(institutionId),
    enabled: validId,
    retry: false,
  })

  // An absorbed id (older spelling / CompraNet era) is folded into a canonical institution: move the URL there.
  const canonicalId = institution?.canonical_id
  useEffect(() => {
    if (canonicalId && canonicalId !== institutionId) {
      navigate(`/institutions/${canonicalId}${location.search}`, { replace: true, state: location.state })
    }
  }, [canonicalId, institutionId, navigate, location.search, location.state])

  // v3 grade (2002–2026) with the stored v2 pillars as fallback.
  const { data: anatomy = null } = useQuery({
    queryKey: ['institution-dossier', institutionId, 'anatomy'],
    queryFn: () => loadAnatomy(institutionId),
    enabled: validId,
    staleTime: 10 * 60 * 1000,
  })
  // the footer's doors: its largest suppliers + categories now (shared cache with the body), its documented cases
  const { data: hoy } = useQuery({
    queryKey: ['institution-b2', institutionId, 'panorama', { since: HOY_FROM }],
    queryFn: () => panoramaApi.get(institutionId, { since: HOY_FROM }),
    enabled: validId,
    staleTime: 10 * 60 * 1000,
    retry: 1,
  })
  // the footer's contract count = the body's «Ver sus N contratos, 2002–2026» (same cached query), not
  // institutions.total_contracts, which counts rows without a valid amount (truth audit 2026-11-07: 678,853 vs 678,752)
  const { data: hist } = useQuery({
    queryKey: ['institution-b2', institutionId, 'panorama', {}],
    queryFn: () => panoramaApi.get(institutionId, {}),
    enabled: validId,
    staleTime: 10 * 60 * 1000,
    retry: 1,
  })
  const { data: caseLib } = useQuery({
    queryKey: ['cases', 'library', 'all'],
    queryFn: () => caseLibraryApi.getAll(),
    enabled: validId,
    staleTime: 30 * 60 * 1000,
    retry: false,
  })
  const { data: pool } = useQuery({
    queryKey: ['institution-dossier', institutionId, 'vendor-pool', 50],
    queryFn: () => institutionApi.getVendorPool(institutionId, 50),
    enabled: validId,
    staleTime: 5 * 60 * 1000,
  })

  useDocumentTitle(
    institution ? `${formatEntityName('institution', institution.name, 'full')} — RUBLI` : null,
    institution ? clip(en
      ? `${formatEntityName('institution', institution.name, 'full')}: ${formatNumber(institution.total_contracts ?? 0)} federal contracts worth ${formatCompactMXN(institution.total_amount_mxn ?? 0)}: who it buys from, and its grade.`
      : `${formatEntityName('institution', institution.name, 'full')}: ${formatNumber(institution.total_contracts ?? 0)} contratos federales por ${formatCompactMXN(institution.total_amount_mxn ?? 0)}: a quién le compra y su calificación.`, 160) : null,
  )

  if (!validId || instError || (!instLoading && !institution)) {
    // only a 404 (or a bad id) is «not found»; a timeout or a 5xx would deny a real record
    const notFound = !validId || !instError || (instErr as { response?: { status?: number } } | null)?.response?.status === 404
    return (
      <Sheet>
        {notFound && <NoIndex />}
        <DocHead trail={[{ label: en ? 'Institutions' : 'Instituciones', to: '/institutions' }, { label: notFound ? (en ? 'Not found' : 'No encontrada') : `#${institutionId}` }]} />
        <Cover
          title={!validId ? (en ? 'Invalid institution id' : 'Identificador de institución inválido') : notFound ? (en ? 'Institution not found' : 'Institución no encontrada') : (en ? 'The institution did not load' : 'La institución no cargó')}
          lede={!notFound
            ? (en ? 'The record could not be loaded; the data service may be busy. Reload the page in a moment.' : 'No se pudo cargar el registro; el servicio de datos puede estar ocupado. Recargue la página en un momento.')
            : (en ? 'The record you asked for is not in the register.' : 'El registro que busca no está en el padrón.')}
        >
          <Link to="/institutions" className="ct-more ct-link">{en ? 'Back to the institution ranking' : 'Volver a la clasificación de instituciones'}</Link>
        </Cover>
      </Sheet>
    )
  }

  if (instLoading || !institution) {
    return (
      <Sheet>
        <DocHead trail={[{ label: en ? 'Institutions' : 'Instituciones', to: '/institutions' }, { label: '…' }]} />
        <div className="inst-hold" aria-busy="true" aria-label={en ? 'Loading the record' : 'Cargando el expediente'} />
      </Sheet>
    )
  }

  const poolIds = new Set((pool?.data ?? []).map((v) => v.vendor_id))
  // The wire carries linked_vendor_ids; ScandalListItem does not type it yet.
  const cases = (caseLib ?? []).filter((c) => ((c as { linked_vendor_ids?: number[] }).linked_vendor_ids ?? []).some((vid) => poolIds.has(vid)))
  const queued = (pool?.data ?? []).filter((v) => v.ips_tier != null && v.ips_tier <= 3).map((v) => v.vendor_id)

  return (
    <DossierOriginProvider value={{ route: `/institutions/${institutionId}`, label: formatEntityName('institution', institution.name, 'sm') }}>
      <Sheet>
        <InstitutionB2
          institution={{ id: institutionId, name: institution.name, siglas: institution.siglas && !STATE_PREFIXES[institution.siglas] ? institution.siglas : null, sector_id: institution.sector_id }}
          anatomy={anatomy}
          lang={lang}
        />
        <Conexiones
          lang={lang}
          sectorId={institution.sector_id ?? pool?.sector_id}
          categories={(hoy?.categories ?? []).map((c) => ({ id: c.category_id, name: (en ? c.name_en : c.name_es) ?? `#${c.category_id}` }))}
          vendors={(hoy?.suppliers ?? []).slice(0, 4).map((v) => ({ id: v.vendor_id, name: v.vendor_name ?? '' }))}
          focos={queued.length ? { to: `/aria?ids=${queued.join(',')}`, label: en ? `${formatNumber(queued.length)} of its ${formatNumber(pool?.data?.length ?? 0)} largest suppliers since 2002 in tiers 1–3` : `${formatNumber(queued.length)} de sus ${formatNumber(pool?.data?.length ?? 0)} mayores proveedores desde 2002 en niveles 1–3` } : null}
          cases={cases.map((c) => ({ slug: c.slug, name: en ? c.name_en : c.name_es }))}
          contracts={{ to: `/contracts?institution_id=${institutionId}`, count: hist?.contracts ?? institution.total_contracts ?? null }}
          mapa={cieloHref({ star: institutionId })}
        />
      </Sheet>
    </DossierOriginProvider>
  )
}
