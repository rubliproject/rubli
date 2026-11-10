/**
 * VendorDossier — canonical unified dossier at /vendors/:id.
 *
 * 2026-06-03 (DESIGNUS — operational rebuild). Reclassified from a long-form
 * narrative (six full-viewport story chapters, ~18,000px) into a dense
 * OPERATIONAL dossier an investigator can triage without scrolling:
 *
 *   Hero            — identity + verdict seal (name · score · tier · flags)
 *   Command panel   — VendorStatStrip + VendorDiagnosticGrid (the at-a-glance:
 *                     the decisive numbers, why flagged, EU-scoreboard deviation, top
 *                     clients, risk-over-time). Replaces the six narrative
 *                     chapters, which merely duplicated the reference tabs.
 *   Evidence        — full SHAP / waterfall / peer / external signals
 *   Activity        — risk timeline + institutions + paginated contracts table
 *   Network         — ARIA / external registries / linked cases / co-bidders
 *   Methodology     — provenance footer
 *
 * The Red Thread narrative (/thread/:vendorId) was RETIRED 2026-06-07 and
 * folded into this single dossier — its six chapters duplicated the reference
 * sections below. /thread/:vendorId now redirects here; its one additive
 * element (civic-scale equivalences) was ported here and later removed (weekend #10).
 * /print/vendors/:id retains the legacy VendorProfile.
 */

import { lazy, Suspense, useEffect, useState } from 'react'
import { useCaseCountLabels } from '@/hooks/useGroundTruthCount'
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { vendorCategoriesQuery } from '@/api/entityQueries'
import type { VendorLinkedScandalsResponse } from '@/api/types'

import { useVendorData } from '@/hooks/useVendorData'
import { deriveVendorStanding } from '@/components/vendor/buildFlags'
import { useVendorInstitutionsTimeline } from '@/components/vendor/VendorExpediente'
import { DocHead } from '@/components/contrato/DocHead'
import { Conexiones } from '@/components/contrato/Conexiones'
import { cieloHref } from '@/lib/vista'
import { caseYear } from '@/lib/aria/caseLayer'
import '@/components/vendor/vendor.css'
import { VendorB2 } from '@/components/vendor/b2/VendorB2'

import { Cover } from '@/components/contrato/Cover'
import { FoldToggle } from '@/components/contrato/Fold'
import { WayfindingSpine } from '@/components/nav/WayfindingSpine'
import { useSiblingNav, type WayfindingLinkState } from '@/lib/nav/wayfinding'
import { DossierOriginProvider } from '@/lib/nav/WayfindingProviders'
import { formatEntityName } from '@/lib/entity/format'
import { formatVendorName } from '@/lib/vendor/formatName'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { NO_RISK_LABEL, SECTORS, SECTOR_COLORS } from '@/lib/constants'
import { formatCompactMXN, formatNumber, plural } from '@/lib/utils'
import { NoIndex, clip } from '@/lib/seo/routeMeta'

const NetworkGraphModal = lazy(() =>
  import('@/components/NetworkGraphModal').then((m) => ({ default: m.NetworkGraphModal })),
)

// ─── Main page ──────────────────────────────────────────────────────────────


// Longest the hero waits for the four flag queries before painting without them.
const FLAG_WAIT_MS = 1500

export default function VendorDossier() {
  const { id } = useParams<{ id: string }>()
  const vendorId = Number(id)
  const navigate = useNavigate()
  const location = useLocation()
  const { i18n } = useTranslation(['vendors', 'common'])
  const lang: 'en' | 'es' = i18n.language?.startsWith('es') ? 'es' : 'en'
  // No index page publishes a vendor list yet except the Atlas cohort
  // register (CohortRegister) — wf.hasContext stays false everywhere else,
  // so this call must run unconditionally (hook rule) even though most
  // arrivals are out of context.
  const wf = useSiblingNav('vendor', id, '/aria', 'ARIA')

  const [networkOpen, setNetworkOpen] = useState(false)
  const data = useVendorData(vendorId, { contractsPage: 1, contractsPerPage: 1 })
  const timeline = useVendorInstitutionsTimeline(vendorId)   // the expediente + the orbit (owner 2026-10-27)
  const vendor = data.vendor.data
  const cats = useQuery({ ...vendorCategoriesQuery(vendorId), enabled: Number.isFinite(vendorId) && vendorId > 0, retry: false })
  // An absorbed id (name variant / older CompraNet record) is folded into a
  // canonical vendor: the API serves that dossier and names it — move the URL there.
  // Only on the requested vendor's own payload: `keepPreviousData` (global) serves
  // the previous vendor as a placeholder while the new one loads, and its
  // canonical_id would bounce 48 → 8002 straight back to 48 (PARALLAX D13b § 2, N1).
  const canonicalId = data.vendor.isPlaceholderData ? undefined : vendor?.canonical_id

  // The cap counts from the vendor row's arrival, not from mount: on a cold API the
  // row alone can take >1.5s, and the flags then deserve their own short window.
  const vendorReady = data.vendor.isSuccess && !data.vendor.isPlaceholderData
  const [flagWaitOver, setFlagWaitOver] = useState(false)
  useEffect(() => {
    setFlagWaitOver(false)
    if (!vendorReady) return
    const t = setTimeout(() => setFlagWaitOver(true), FLAG_WAIT_MS)
    return () => clearTimeout(t)
  }, [vendorId, vendorReady])
  useEffect(() => {
    if (canonicalId && canonicalId !== vendorId) {
      navigate(`/vendors/${canonicalId}${location.search}`, { replace: true, state: location.state })
    }
  }, [canonicalId, vendorId, navigate, location.search, location.state])

  // document.title — name · indicator · contracts (the D12c hook).
  useDocumentTitle(
    vendor
      ? `${formatVendorName(vendor.name, 300)} · ${vendor.avg_risk_score != null ? `${lang === 'es' ? 'indicador' : 'indicator'} ${Math.min(vendor.avg_risk_score, 0.99).toFixed(2)}` : NO_RISK_LABEL[lang === 'es' ? 'es' : 'en']} · ${(vendor.total_contracts ?? 0).toLocaleString(lang === 'es' ? 'es-MX' : 'en-US')} ${plural(vendor.total_contracts ?? 0, lang === 'es' ? 'contrato' : 'contract', lang === 'es' ? 'contratos' : 'contracts')} — RUBLI`
      : null,
    // the share card (launch re-audit S7): name, contracts, amount, never the score — a named firm's risk
    // number must not travel on a social card without its context (legal memo, coordinator 2026-11-02)
    vendor
      ? clip(lang === 'es'
        ? `${formatVendorName(vendor.name, 300)}: ${formatNumber(vendor.total_contracts ?? 0)} contratos federales por ${formatCompactMXN(vendor.total_value_mxn ?? 0)}${vendor.first_contract_year ? `, ${vendor.first_contract_year}–${vendor.last_contract_year ?? vendor.first_contract_year}` : ''}. Su indicador de riesgo, en RUBLI.`
        : `${formatVendorName(vendor.name, 300)}: ${formatNumber(vendor.total_contracts ?? 0)} federal contracts worth ${formatCompactMXN(vendor.total_value_mxn ?? 0)}${vendor.first_contract_year ? `, ${vendor.first_contract_year}–${vendor.last_contract_year ?? vendor.first_contract_year}` : ''}. Its risk indicator, on RUBLI.`, 160)
      : null,
    vendor ? `${formatVendorName(vendor.name, 300)} — RUBLI` : null,
  )

  const sectorCode = vendor?.primary_sector_name?.toLowerCase() ?? 'otros'
  const sectorAccent = SECTOR_COLORS[sectorCode] ?? SECTOR_COLORS.otros

  // Weekend F3: the marginal note above the lede grew from one row to three as
  // four flag queries landed ~0.3 s after the vendor row (CLS 0.03–0.19). The
  // hero now paints once they settle; co-bidders (seconds slower) holds a
  // placeholder pill in the note instead (VendorHero flagsPending).
  // …but never longer than FLAG_WAIT_MS: a slow or failing flag query (retries on
  // 5xx) must not hold the whole dossier on a skeleton (joker review 07 #1).
  if (data.vendor.isLoading || (!flagWaitOver && [data.aria, data.groundTruthStatus, data.externalFlags, data.waterfall].some((q) => q.isLoading))) {
    return <DossierSkeleton />
  }
  if (data.vendor.error || !vendor) {
    // Only a 404 means the vendor does not exist; a timeout or a 5xx is a slow
    // or failing request, and saying "not found" would deny a real record.
    const status = (data.vendor.error as { response?: { status?: number } } | null)?.response?.status
    const notFound = status === 404 || (!data.vendor.error && !vendor)
    return (
      <article className="ct ct-page ct-sheet">
        <div className="ct-wrap">
          {notFound && <NoIndex />}
          <DocHead trail={[{ label: lang === 'es' ? 'Proveedores' : 'Vendors' }, { label: `#${vendorId}` }]} />
          <div role="alert">
            <Cover
              className="vd-cover"
              title={notFound
                ? (lang === 'es' ? 'Proveedor no encontrado' : 'Vendor not found')
                : (lang === 'es' ? 'El expediente de este proveedor está tardando más de lo habitual.' : "This vendor's record is taking longer than usual.")}
              lede={notFound
                ? (lang === 'es'
                  ? 'No hay un proveedor con este número en el registro. Puede que el enlace sea antiguo o que el expediente se haya fusionado con otro.'
                  : 'There is no vendor with this number in the register. The link may be old, or the record may have been merged into another.')
                : (lang === 'es' ? 'La consulta no respondió a tiempo. El registro existe; vuelva a intentarlo.' : 'The request did not answer in time. The record exists; try again.')}
            >
              <div className="vd-meta">
                {notFound ? (
                  <button type="button" onClick={() => navigate('/contracts')}>{lang === 'es' ? 'Buscar en El Archivo' : 'Search the Archive'}</button>
                ) : (
                  <button type="button" onClick={() => data.vendor.refetch()} disabled={data.vendor.isFetching}>
                    {data.vendor.isFetching ? (lang === 'es' ? 'Reintentando…' : 'Retrying…') : (lang === 'es' ? 'Reintentar' : 'Retry')}
                  </button>
                )}
              </div>
            </Cover>
          </div>
        </div>
      </article>
    )
  }

  // One standing (EFOS / SFP / GT / review) for every surface — D13b § Change 7.
  const standing = deriveVendorStanding({
    vendor,
    aria: data.aria.data,
    externalFlags: data.externalFlags.data,
    groundTruthStatus: data.groundTruthStatus.data,
  })
  const en = lang === 'en'
  const caseDoors = [
    ...(data.groundTruthStatus.data?.cases ?? []).map((c) => ({ slug: c.scandal_slug ?? '', name: c.case_name })),
    ...((data.linkedScandals.data as VendorLinkedScandalsResponse | null | undefined)?.scandals ?? []).map((c) => ({ slug: c.scandal_slug, name: c.scandal_title ?? c.case_name })),
  ].filter((c, i, all) => c.slug && all.findIndex((o) => o.slug === c.slug) === i)

  return (
    <DossierOriginProvider value={{ route: `/vendors/${vendorId}`, label: formatEntityName('vendor', vendor.name, 'sm') }}>
    <article className="ct ct-page ct-sheet">
      <div className="ct-wrap">
        {wf.hasContext && <WayfindingSpine nav={wf} origin={(location.state as WayfindingLinkState | null)?.wfOrigin ?? null} lang={lang} accent={sectorAccent} />}
        <VendorB2
          vendorId={vendorId}
          vendor={vendor}
          timeline={timeline.isError ? undefined : timeline.data}
          timelineLoading={timeline.isLoading}
          caseYear={caseYear(data.groundTruthStatus.data?.cases?.[0]) ?? null}
          aria={data.aria.data}
          waterfall={data.waterfall.data}
          tags={{ gt: standing.gt === 'documented', efos: standing.efos, sfp: standing.sfpActive }}
          onNetwork={() => setNetworkOpen(true)}
          lang={lang}
        />
        <Conexiones
          lang={lang}
          sectorId={vendor.primary_sector_id ?? SECTORS.find((x) => x.code === sectorCode)?.id}
          categories={(cats.data?.categories ?? []).map((c) => ({ id: c.category_id, name: en ? c.name_en : c.name_es }))}
          institutions={(vendor.top_institutions ?? []).map((i) => ({ id: i.institution_id, name: i.institution_name }))}
          focos={data.aria.data?.primary_pattern ? { to: `/aria?pattern=${data.aria.data.primary_pattern}&tier=all`, label: en ? `Every case with ${data.aria.data.primary_pattern}` : `Todos los casos con ${data.aria.data.primary_pattern}` } : null}
          pattern={data.aria.data?.primary_pattern}
          cases={caseDoors}
          contracts={{ to: `/contracts?vendor_id=${vendorId}`, count: vendor.total_contracts }}
          mapa={cieloHref({ planet: vendorId })}
        />
        <DossierLimits lang={lang} />
      </div>

      {networkOpen && (
        <Suspense fallback={null}>
          <NetworkGraphModal open={networkOpen} onOpenChange={setNetworkOpen} centerType="vendor" centerId={vendorId} centerName={vendor.name} />
        </Suspense>
      )}
    </article>
    </DossierOriginProvider>
  )
}

/** What this dossier cannot say: two columns of prose that fill their tracks. */
function DossierLimits({ lang }: { lang: 'en' | 'es' }) {
  const cc = useCaseCountLabels(lang) // weekend F8: computed, never typed
  const { t } = useTranslation('vendors')
  const en = lang === 'en'
  const [open, setOpen] = useState(false) // phone: the second column opens in place
  return (
    <section id="methodology" className="ct-section scroll-mt-14" aria-labelledby="methodology-h">
      <div className="ct-annex-row">
        <h2 id="methodology-h" className="ct-h2">{en ? "What this dossier can't tell you" : 'Lo que este expediente no puede decir'}</h2>
        <Link to="/methodology" className="ct-more ct-link">{en ? 'Methodology' : 'Metodología'}</Link>
      </div>
      <div className="vd-limits">
        <div>
          <p>{en
            ? 'This dossier reads how contracts were awarded, not how they were performed. A high risk indicator marks statistical anomalies in procurement, not proof of wrongdoing, which only courts establish.'
            : 'Este expediente analiza cómo se adjudicaron los contratos, no cómo se ejecutaron. Un indicador de riesgo alto señala anomalías estadísticas en la contratación, no prueba de un delito, que solo los tribunales determinan.'}</p>
          <p>{en
            ? 'Execution-phase fraud, off-book arrangements and legitimate sole-source needs are invisible to this data; coverage thins before 2010 and freezes at September 2025.'
            : 'Estos datos no muestran el fraude en la ejecución, los acuerdos que no quedan registrados ni los casos legítimos en que solo un proveedor puede surtir; la cobertura disminuye antes de 2010 y se congela en septiembre de 2025.'}</p>
        </div>
        <div className={open ? undefined : 'ct-phone-cut'}>
          <p>{en
            ? `COMPRANET data 2002–2026. The v0.9.2 risk model was trained on RUBLI's labelled case set (cases on record at training: ${cc.atTraining}; most are analyst write-ups, not adjudicated findings).`
            : `Datos CompraNet + ComprasMX 2002–2026. El modelo de riesgo v0.9.2 se entrenó con la base de casos etiquetados de RUBLI (casos registrados al entrenar: ${cc.atTraining}; la mayoría documentados por analistas, no resoluciones).`}</p>
          <p>{t('flags.disclaimer')}</p>
        </div>
      </div>
      <div className="ct-phone-only">
        <FoldToggle open={open} rest={2} onToggle={() => setOpen((o) => !o)} />
      </div>
    </section>
  )
}

// ─── Skeleton — the shell's geometry, held while the record loads ─────────────

function DossierSkeleton() {
  return (
    <article className="ct ct-page ct-sheet" aria-busy="true">
      <div className="ct-wrap">
        <div className="ct-dochead" style={{ minHeight: 41 }} />
        <div className="ct-cover vd-cover" aria-hidden="true">
          <div>
            <div style={{ height: 24, width: '60%', background: 'var(--ct-tint)' }} />
            <div style={{ height: 24, marginTop: 4, background: 'var(--ct-tint)' }} />
            <div className="vd-band" style={{ height: 72 }} />
          </div>
        </div>
        <div className="ct-clauses vd-cifras" aria-hidden="true">
          <div className="ct-cl-grid">
            {[0, 1, 2, 3, 4].map((i) => <div key={i} className="ct-clause" style={{ height: 96 }} />)}
          </div>
        </div>
        <span className="sr-only" role="status">Cargando expediente / Loading dossier</span>
      </div>
    </article>
  )
}
