/**
 * SectorDossier — /sectors/:id on «El Contrato» (frontend/DESIGN.md §5, W2).
 *
 *   PageHead  Registro › Sectores › name (stepper when reached from a list) · kicker = sector · h1 = getSectorLede
 *   Cover     (no h1) lead: top vendors by amount on a ruled
 *             bar, the top-10 mean marked | the verdict (high-risk share) — two tracks
 *   En cifras monto · contratos · proveedores · instituciones · alto riesgo
 *   Sections  the existing dossier sections in their existing order, plain h2 (no ordinals)
 *   Firmas    global (shell)
 *
 * SectorHero is no longer rendered here (SectorProfile keeps it for /print). Charts are the
 * shipped ones, reskinned in place.
 */
import type { ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { sectorApi, atlasApi, vendorApi, categoriesApi, caseLibraryApi, ariaApi } from '@/api/client'
import { sectorDetailQuery } from '@/api/entityQueries'

import {
  SectorDiagnosticGrid,
  SectorInstitutionTable,
} from '@/components/sector/SectorCommandPanel'
import {
  SectorVendorTable,
  SectorCategoryComposition,
  SectorSexenioStrip,
  SectorConcentrationPanel,
  SectorModelLadder,
  SectorAnomalyStrip,
  SectorCaseRoll,
  SectorQueueRibbon,
  SectorLargestContracts,
  type SectorCategoryRow,
  type TierCount,
} from '@/components/sector/SectorReferenceSections'
import { getSectorLede, getSectorVerdict } from '@/components/sector/sectorLede'
import { DossierSection, StepMeta } from '@/components/category/DossierSection'
import { Conexiones } from '@/components/contrato/Conexiones'
import { cieloHref } from '@/lib/vista'
import { moneyFigure } from '@/components/category/money'
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import { useSiblingNav } from '@/lib/nav/wayfinding'
import { DossierOriginProvider } from '@/lib/nav/WayfindingProviders'
import { DocHead } from '@/components/contrato/DocHead'
import { PageHead } from '@/components/kit/PageHead'
import { HotProvider, WithHot, useLayerRestore } from '@/components/dossier/layers'
import { Cover } from '@/components/contrato/Cover'
import { Clause } from '@/components/contrato/Clause'
import { ScopeSwitch } from '@/components/contrato/ScopeSwitch'
import { useBuyerScope, scopeBuyers, SCOPE_LABEL } from '@/lib/scope'
import { RuledBar } from '@/components/contrato/RuledBar'
import { RiskGauge, RiskGaugeScale } from '@/components/contrato/RiskGauge'
import { SECTOR_COLORS, RISK_COLORS, RISK_TEXT_COLORS, DATA_CUT_YEAR, getSectorName, getRiskLevelFromScore } from '@/lib/constants'
import { formatCompactMXN, formatNumber } from '@/lib/utils'
import { formatVendorName } from '@/lib/vendor/formatName'
import { prevalenceCaveat } from '@/lib/sectorRelative'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'

export default function SectorDossier() {
  const { id } = useParams<{ id: string }>()
  const sectorId = Number(id)
  const validId = Number.isFinite(sectorId) && sectorId > 0
  // Buyer scope (docs/PLAN_INSTITUTION_SCOPE_2026-10-22.md): the agency count, the buyer list and the
  // top buyer are federal by default; money, contracts and vendors cover every buyer.
  const [scope, setScope] = useBuyerScope()
  const { i18n } = useTranslation()
  const lang: 'en' | 'es' = i18n.language?.startsWith('es') ? 'es' : 'en'
  const en = lang === 'en'
  const wf = useSiblingNav('sector', id, '/sectors', en ? 'sectors' : 'sectores')
  useLayerRestore()   // ?sec=&row= (a cited link) scrolls to its section / opened row

  const { data: sector, isLoading: sectorLoading, isError: sectorError } = useQuery({
    ...sectorDetailQuery(sectorId, scope),
    enabled: validId,
    retry: false,
    placeholderData: keepPreviousData,
  })

  const { data: institutionsResp } = useQuery({
    queryKey: ['sector-dossier', sectorId, 'institutions', scope],
    queryFn: () => atlasApi.getSectorInstitutionsSpatial({ sectorId, limit: 60, scope }),
    enabled: validId,
    placeholderData: keepPreviousData,
    staleTime: 5 * 60 * 1000,
  })

  // Enrichment queries — every source is precomputed/instant (DESIGNUS sector
  // data-density pass, 2026-06-08). Failures degrade to empty sections, never
  // block the dossier.
  const { data: topVendorsResp } = useQuery({
    queryKey: ['sector-dossier', sectorId, 'top-vendors'],
    queryFn: () => vendorApi.getTop('value', 20, { sector_id: sectorId }),
    enabled: validId,
    staleTime: 5 * 60 * 1000,
  })
  const { data: categoriesResp } = useQuery({
    // Same key as /sectors and the header search: navigation reuses the cache.
    queryKey: ['categories', 'summary'],
    queryFn: () => categoriesApi.getSummary(),
    staleTime: 5 * 60 * 1000,
  })
  const { data: casesResp } = useQuery({
    queryKey: ['sector-dossier', sectorId, 'cases'],
    queryFn: () => caseLibraryApi.getBySector(sectorId),
    enabled: validId,
    staleTime: 5 * 60 * 1000,
    retry: false,
  })
  const { data: concentrationResp } = useQuery({
    queryKey: ['sector-dossier', sectorId, 'concentration'],
    queryFn: () => sectorApi.getConcentrationHistory(sectorId),
    enabled: validId,
    staleTime: 10 * 60 * 1000,
  })
  const { data: coefResp } = useQuery({
    queryKey: ['sector-dossier', sectorId, 'coefficients'],
    queryFn: () => sectorApi.getModelCoefficients(sectorId),
    enabled: validId,
    staleTime: 10 * 60 * 1000,
  })
  const { data: anomalyResp } = useQuery({
    queryKey: ['sector-dossier', sectorId, 'anomaly'],
    queryFn: () => sectorApi.getTemporalAnomaly(sectorId),
    enabled: validId,
    staleTime: 10 * 60 * 1000,
    retry: false,
  })
  const { data: queueTiers } = useQuery({
    queryKey: ['sector-dossier', sectorId, 'aria-tiers'],
    queryFn: async () => {
      const tiers = await Promise.all(
        ([1, 2, 3, 4] as const).map((tier) =>
          ariaApi
            .getQueue({ sector_id: sectorId, tier, per_page: 1 })
            .then((r) => ({ tier, count: r.pagination?.total ?? 0 }))
            .catch(() => ({ tier, count: 0 })),
        ),
      )
      return tiers as TierCount[]
    },
    enabled: validId,
    staleTime: 10 * 60 * 1000,
    retry: false,
  })
  const { data: topContractsResp } = useQuery({
    queryKey: ['sector-dossier', sectorId, 'top-contracts'],
    queryFn: () => sectorApi.getTopContracts(sectorId, 10),
    enabled: validId,
    staleTime: 10 * 60 * 1000,
    retry: false,
  })
  const { data: gtLinkageResp } = useQuery({
    // Same key as the /sectors hover card.
    queryKey: ['sectors', 'gt-linkage', sectorId],
    queryFn: () => sectorApi.getGtLinkage(sectorId),
    enabled: validId,
    staleTime: 10 * 60 * 1000,
    retry: false,
  })


  useDocumentTitle(sector ? `${getSectorName(sector.code, lang)} · sector — RUBLI` : null)

  const crumbs = [{ label: en ? 'Sectors' : 'Sectores', to: '/sectors' }]
  const shell = (title: string, body: ReactNode) => (
    <article className="ct ct-page ct-sheet">
      <div className="ct-wrap">
        <DocHead trail={[...crumbs, { label: title }]} />
        {body}
      </div>
    </article>
  )

  if (!validId || sectorError || (!sectorLoading && !sector)) {
    return shell(en ? 'Not found' : 'No encontrado', (
      <div className="cd-error" role="alert">
        <h1 className="ct-h2">{!validId ? (en ? 'Invalid sector' : 'Sector inválido') : (en ? 'Sector not found' : 'Sector no encontrado')}</h1>
        <Link to="/sectors" className="ct-link">{en ? 'Back to sectors' : 'Volver a sectores'}</Link>
      </div>
    ))
  }
  // Reserve the sheet while the dossier loads (no footer flash, no reflow).
  if (sectorLoading || !sector) return shell('…', <div className="cd-hold" aria-busy="true" />)

  const st = sector.statistics
  const sectorAccent = SECTOR_COLORS[sector.code] ?? SECTOR_COLORS.otros
  const sectorName = getSectorName(sector.code, lang)
  const institutions = institutionsResp?.institutions ?? []
  const totalSpend = st.total_value_mxn ?? 0

  const topVendors = topVendorsResp?.data ?? []
  const sectorCategories: SectorCategoryRow[] = (
    (categoriesResp?.data ?? []) as Array<{
      category_id: number; name_es: string; name_en: string; sector_id: number | null
      total_value: number; total_contracts: number; avg_risk: number; high_risk_pct?: number
    }>
  )
    .filter((c) => c.sector_id === sectorId)
    .map((c) => ({
      category_id: c.category_id,
      name_es: c.name_es,
      name_en: c.name_en,
      total_value: c.total_value ?? 0,
      total_contracts: c.total_contracts ?? 0,
      avg_risk: c.avg_risk ?? 0,
      high_risk_pct: c.high_risk_pct,
    }))
  const sectorCases = casesResp ?? []
  const concentrationHistory = concentrationResp?.history ?? []
  const coefficients = coefResp?.coefficients ?? []
  const usesGlobalModel = Boolean(
    (coefResp as { uses_global_model?: boolean } | undefined)?.uses_global_model ??
      (coefResp?.model_used === 'global'),
  )
  const anomalies = anomalyResp?.anomalies ?? []
  const tiers: TierCount[] = queueTiers ?? []
  const tierTotal = tiers.reduce((s, x) => s + x.count, 0)
  const hasForensics = concentrationHistory.length > 1 || coefficients.length > 0 || anomalies.length > 0
  const largestContracts = topContractsResp?.contracts ?? []
  const gtCases = gtLinkageResp?.cases ?? 0
  const gtVendors = gtLinkageResp?.vendors ?? 0

  // the scope the API actually served (a DB before the scope rerun answers 'all')
  const instScope = institutionsResp?.scope ?? scope
  const instMeta = institutions.length === 0 ? undefined : en ? `Top ${institutions.length} · ${scopeBuyers(instScope, en)}` : `Las ${institutions.length} principales · ${scopeBuyers(instScope, en)}`

  const lede = getSectorLede(sector, lang)
  const verdict = getSectorVerdict(sector, lang)
  const hr = st.high_risk_pct ?? 0
  const avgRisk = st.avg_risk_score ?? 0

  // Lead: the top seven vendors by amount, as a share of the sector amount; the top-10 mean is the mark.
  const shareOf = (v: number | undefined) => (totalSpend > 0 ? ((v ?? 0) / totalSpend) * 100 : 0)
  // Seven in the cover so the rows end with the verdict at 1440 (five left a 46–88 px ragged gap under a
  // one- or two-line lede, proof:ui); the full ranking is «Los proveedores que dominan» (#vendors) below.
  const lead = topVendors.slice(0, 7)
  const top10 = topVendors.slice(0, 10)
  const meanShare = top10.length ? top10.reduce((s, v) => s + shareOf(v.total_value_mxn), 0) / top10.length : 0
  const axisMax = Math.max(5, Math.ceil(Math.max(0, ...lead.map((v) => shareOf(v.total_value_mxn))) / 5) * 5)
  const step = axisMax <= 10 ? 1 : axisMax <= 20 ? 5 : 10
  const fmt1 = (n: number) => n.toLocaleString(en ? 'en-US' : 'es-MX', { maximumFractionDigits: 1 })
  const money = moneyFigure(totalSpend, en)
  const doc = sectorName
  const instCount = st.total_institutions || institutionsResp?.sector_institution_count || null
  const topBuyer = institutions[0] ?? null

  return (
    <DossierOriginProvider value={{ route: `/sectors/${sectorId}`, label: sectorName }}>
    <HotProvider>
    <article className="ct ct-page ct-sheet">
      <div className="ct-wrap">
        <PageHead lang={lang}
          crumbs={[...crumbs, { label: sectorName }]}
          actions={wf.hasContext ? <StepMeta prevTo={wf.prevTo} nextTo={wf.nextTo} index={wf.index} total={wf.total} en={en} /> : undefined}
          kicker={<>{en ? 'Sector' : 'Sector'} · {sectorName}</>}
          finding={lede} />

        <Cover
          side={
            <aside className="cd-verdict" aria-labelledby="sd-v-h">
              <h2 id="sd-v-h">{en ? 'Verdict' : 'Veredicto'}</h2>
              <p className="cd-v-label" style={{ color: RISK_TEXT_COLORS[verdict.level] }}>{verdict.label}</p>
              <p className="cd-v-why">{verdict.rationale}</p>
              <div className="cd-gauge">
                <span className="cd-sub">{en ? 'Mean risk indicator' : 'Indicador de riesgo promedio'}</span>
                <RiskGaugeScale />
                <RiskGauge value={avgRisk} />
              </div>
              <dl>
                <dt>{en ? 'Amount high + critical' : 'Monto alto + crítico'}</dt>
                <dd>{st.high_critical_value_mxn != null ? formatCompactMXN(st.high_critical_value_mxn) : '—'}</dd>
                <dt>{en ? 'Amount critical' : 'Monto crítico'}</dt>
                <dd>{st.critical_value_mxn != null ? formatCompactMXN(st.critical_value_mxn) : '—'}</dd>
                <dt>{en ? 'Direct award' : 'Adjudicación directa'}</dt>
                <dd>{fmt1(st.direct_award_pct ?? 0)}%</dd>
                <dt>{en ? 'Single-award procedures' : 'Procedimientos con un solo adjudicado'}</dt>
                <dd>{fmt1(st.single_bid_pct ?? 0)}%</dd>
                <dt>{en ? 'Documented cases' : 'Casos documentados'}</dt>
                <dd>{gtCases > 0 ? <a href="#cases" className="ct-link">{formatNumber(gtCases)}</a> : formatNumber(gtCases)}</dd>
                <dt>{en ? 'Vendors with a documented link' : 'Proveedores con vínculo documentado'}</dt>
                <dd>{formatNumber(gtVendors)}</dd>
                <dt>{en ? 'Vendors in the ARIA queue' : 'Proveedores en la fila ARIA'}</dt>
                <dd>{tiers.length ? formatNumber(tierTotal) : '—'}</dd>
                <dt>{en ? 'Top buyer' : 'Mayor comprador'}{instScope !== 'all' && <> · {SCOPE_LABEL[instScope][en ? 1 : 0].toLowerCase()}</>}</dt>
                <dd className="cd-wide">{topBuyer ? <EntityIdentityChip type="institution" id={topBuyer.institution_id} name={topBuyer.name} variant="name" /> : '—'}</dd>
              </dl>
            </aside>
          }
        >
          <div className="cd-lead">
            <h2>{en ? 'Top vendors · share of the sector amount' : 'Mayores proveedores · parte del monto del sector'}</h2>
            {lead.length > 0 ? (
              <WithHot>{(hot, bind) => (
              <RuledBar
                label={en ? 'Top vendors by amount' : 'Mayores proveedores por monto'}
                ticks={Array.from({ length: axisMax / step + 1 }, (_, k) => ({ label: `${k * step}%`, at: (k * step) / axisMax }))}
                rows={lead.map((v) => ({
                  name: <EntityIdentityChip type="vendor" id={v.vendor_id} name={v.vendor_name} variant="name" fullName />,
                  sub: `${formatNumber(v.total_contracts ?? 0)} ${en ? 'contracts' : 'contratos'} · ${fmt1(shareOf(v.total_value_mxn))}%`,
                  share: shareOf(v.total_value_mxn) / axisMax,
                  value: formatCompactMXN(v.total_value_mxn ?? 0),
                  critical: v.avg_risk_score != null && getRiskLevelFromScore(v.avg_risk_score) === 'critical',
                  hot: hot === `v:${v.vendor_id}`,
                  bind: bind(`v:${v.vendor_id}`),
                }))}
                mark={top10.length > 1 ? { at: meanShare / axisMax, label: en ? `top-10 mean · ${fmt1(meanShare)}%` : `promedio top 10 · ${fmt1(meanShare)}%` } : undefined}
              />
              )}</WithHot>
            ) : <div className="ct-hold-ledger" aria-busy="true" />}
            {/* phone hides the axis that carries the mark; the mean prints as a line */}
            {top10.length > 1 && <span className="cd-sm" aria-hidden="true">{en ? `Top-10 mean · ${fmt1(meanShare)}%` : `Promedio top 10 · ${fmt1(meanShare)}%`}</span>}
            {topVendors.length > lead.length && (
              <a href="#vendors" className="ct-more ct-link">{en ? `All ${topVendors.length} top vendors in the ledger below` : `Los ${topVendors.length} mayores proveedores en el registro de abajo`}</a>
            )}
          </div>
        </Cover>

        <section className="ct-clauses" aria-labelledby="sd-cl-h">
          <h2 id="sd-cl-h">{en ? 'In figures' : 'En cifras'}</h2>
          <ScopeSwitch scope={scope} onScope={setScope} en={en}
            note={en ? 'Changes the institution count and the buyer list; amounts, contracts and vendors cover every buyer.' : 'Cambie el número de instituciones y la lista de compradores; montos, contratos y proveedores cuentan a todos.'} />
          <div className="ct-cl-grid cd-cl5">
            <Clause id="cl-monto" title={en ? `Amount, 2002–${DATA_CUT_YEAR}` : `Monto, 2002–${DATA_CUT_YEAR}`} fig="—" count={money.count} unit={money.unit} note={en ? 'contracted in the sector' : 'contratado en el sector'} doc={doc} />
            <Clause id="cl-contratos" title={en ? 'Contracts' : 'Contratos'} fig="—" count={{ value: st.total_contracts ?? 0, format: (n) => formatNumber(Math.round(n)) }} note={en ? 'with a valid amount' : 'con monto válido'} doc={doc} />
            <Clause id="cl-proveedores" title={en ? 'Vendors' : 'Proveedores'} fig="—" count={{ value: st.total_vendors ?? 0, format: (n) => formatNumber(Math.round(n)) }} note={en ? 'with at least one contract' : 'con al menos un contrato'} doc={doc} />
            <Clause id="cl-instituciones" title={en ? 'Institutions' : 'Instituciones'} fig="—" count={instCount ? { value: instCount, format: (n) => formatNumber(Math.round(n)) } : null} note={en ? `${scopeBuyers(st.institution_scope ?? 'all', en)} in the sector` : `${scopeBuyers(st.institution_scope ?? 'all', en)} en el sector`} doc={doc} />
            <Clause
              id="cl-riesgo"
              title={en ? 'High-risk contracts' : 'Contratos de alto riesgo'}
              fig="—"
              count={{ value: hr, format: (n) => fmt1(n) }}
              unit="%"
              critical={verdict.level === 'critical'}
              ruler={{ value: hr / 100, mode: 'fill', color: RISK_COLORS[verdict.level], ends: ['0%', en ? 'indicator ≥ 0.40' : 'indicador ≥ 0.40', '100%'] }}
              doc={doc}
            />
          </div>
          {/* BIAS_AUDIT_SECTOR § 8 rec. 2: the high+critical share is not a prevalence */}
          <p className="ct-note">{prevalenceCaveat(sector.code, lang)}</p>
        </section>

        <DossierSection id="diagnosis" title={en ? 'Where the risk sits' : 'Dónde está el riesgo'}
          cite={en
            ? `${sectorName}: ${fmt1(hr)}% of its contracts carry a high or critical risk indicator (RUBLI, model v0.9.2, CompraNet + ComprasMX 2002–${DATA_CUT_YEAR}).`
            : `${sectorName}: ${fmt1(hr)}% de sus contratos tiene un indicador de riesgo alto o crítico (RUBLI, modelo v0.9.2, CompraNet + ComprasMX 2002–${DATA_CUT_YEAR}).`}>
          <SectorDiagnosticGrid stats={st} trends={sector.trends ?? []} lang={lang} sectorId={sectorId} />
        </DossierSection>

        {/* who sells | who buys — the two ten-row ledgers pair at ≥1600 (DESIGN.md §3 pair): with the by-year
            column the vendor rows wrap less than the institution names, so at 1440 the halves can't be balanced */}
        <div className={topVendors.length > 0 ? 'ct-duo ct-duo-wide' : undefined}>
          {topVendors.length > 0 && (
            <DossierSection id="vendors" title={en ? 'The vendors who dominate' : 'Los proveedores que dominan'} meta={en ? `Top ${topVendors.length}` : `Los ${topVendors.length} mayores`}
              cite={topVendors[0] ? (en
                ? `${formatVendorName(topVendors[0].vendor_name, 300)} is the largest vendor in ${sectorName}: ${formatCompactMXN(topVendors[0].total_value_mxn ?? 0)}, ${fmt1(shareOf(topVendors[0].total_value_mxn))}% of the sector amount (RUBLI, COMPRANET data).`
                : `${formatVendorName(topVendors[0].vendor_name, 300)} es el mayor proveedor de ${sectorName}: ${formatCompactMXN(topVendors[0].total_value_mxn ?? 0)}, ${fmt1(shareOf(topVendors[0].total_value_mxn))}% del monto del sector (RUBLI, datos COMPRANET).`) : null}>
              <SectorVendorTable vendors={topVendors} totalSpend={totalSpend} lang={lang} sectorId={sectorId} />
            </DossierSection>
          )}
          <DossierSection id="institutions" title={en ? 'Who spends in the sector' : 'Quién gasta en el sector'} meta={instMeta}>
            <SectorInstitutionTable institutions={institutions} totalSpend={totalSpend} lang={lang} sectorId={sectorId} />
          </DossierSection>
        </div>

        {sectorCategories.length > 0 && (
          <DossierSection id="categories" title={en ? 'What the money buys' : 'En qué se gasta'} meta={en ? `${sectorCategories.length} categories` : `${sectorCategories.length} categorías`}>
            <SectorCategoryComposition categories={sectorCategories} totalSpend={totalSpend} accent={sectorAccent} lang={lang} />
          </DossierSection>
        )}

        {/* the sexenio strip | cases over the queue pair only at ≥1600: the strip is a fixed ~230px and the case list
            runs 100–500px by sector, so at 1280–1599 they stack (proof:ui RAGGED; same call as «What they buy» on institution) */}
        <div className={(sector.trends ?? []).length > 0 && (sectorCases.length > 0 || tierTotal > 0) ? 'ct-duo ct-duo-wide' : undefined}>
        {(sector.trends ?? []).length > 0 && (
          <DossierSection id="administrations" title={en ? 'Spend by administration' : 'El gasto por sexenio'}
            cite={en ? `${sectorName}: federal spend by administration, 2002–${DATA_CUT_YEAR} (RUBLI, COMPRANET data).` : `${sectorName}: gasto federal por sexenio, 2002–${DATA_CUT_YEAR} (RUBLI, datos COMPRANET).`}>
            <SectorSexenioStrip trends={sector.trends ?? []} accent={sectorAccent} lang={lang} sectorId={sectorId} />
          </DossierSection>
        )}
        <div>
        {sectorCases.length > 0 && (
          <DossierSection id="cases" title={en ? 'Documented cases' : 'Casos documentados'} meta={en ? `${sectorCases.length} on file` : `${sectorCases.length} en archivo`}>
            <SectorCaseRoll cases={sectorCases} lang={lang} />
          </DossierSection>
        )}

        {tierTotal > 0 && (
          <DossierSection id="queue" title={en ? 'Who to investigate' : 'A quién investigar'} meta={en ? 'ARIA queue' : 'fila ARIA'}>
            <SectorQueueRibbon tiers={tiers} sectorId={sectorId} lang={lang} />
          </DossierSection>
        )}
        </div>
        </div>

        {hasForensics && (
          <DossierSection id="signals" title={en ? 'What the model sees' : 'Qué ve el modelo'}>
            {/* The two time panels pair; the coefficient ladder (up to 12 terms) takes the full measure below. */}
            <div className="cd-stack">
              {(concentrationHistory.length > 1 || anomalies.length > 0) && (
                <div className={concentrationHistory.length > 1 && anomalies.length > 0 ? 'cd-pair' : undefined}>
                  {concentrationHistory.length > 1 && <SectorConcentrationPanel history={concentrationHistory} lang={lang} />}
                  {anomalies.length > 0 && <SectorAnomalyStrip anomalies={anomalies} lang={lang} />}
                </div>
              )}
              {coefficients.length > 0 && <SectorModelLadder coefficients={coefficients} usesGlobal={usesGlobalModel} lang={lang} />}
            </div>
          </DossierSection>
        )}

        {largestContracts.length > 0 && (
          <DossierSection id="contracts" title={en ? 'The largest single contracts' : 'Los contratos más grandes'} meta={`Top ${largestContracts.length}`}
            cite={en
              ? `The largest single contract in ${sectorName}: ${formatCompactMXN(largestContracts[0].amount_mxn ?? 0)}${largestContracts[0].year ? ` (${largestContracts[0].year})` : ''} (RUBLI, COMPRANET data).`
              : `El contrato más grande de ${sectorName}: ${formatCompactMXN(largestContracts[0].amount_mxn ?? 0)}${largestContracts[0].year ? ` (${largestContracts[0].year})` : ''} (RUBLI, datos COMPRANET).`}>
            <SectorLargestContracts contracts={largestContracts} lang={lang} />
          </DossierSection>
        )}


        <Conexiones
          lang={lang}
          categories={[...sectorCategories].sort((a, b) => b.total_value - a.total_value).map((c) => ({ id: c.category_id, name: en ? c.name_en : c.name_es }))}
          institutions={institutions.map((i) => ({ id: i.institution_id, name: i.name }))}
          vendors={topVendors.map((v) => ({ id: v.vendor_id, name: v.vendor_name }))}
          focos={tierTotal > 0 ? { to: `/aria?sector=${sectorId}&tier=all`, label: en ? `${formatNumber(tierTotal)} vendors in the queue` : `${formatNumber(tierTotal)} proveedores en la fila` } : null}
          cases={sectorCases.map((c) => ({ slug: c.slug, name: en ? c.name_en : c.name_es }))}
          contracts={{ to: `/contracts?sector_id=${sectorId}`, count: st.total_contracts }}
          mapa={cieloHref({ lens: 'sectors', pin: sectorId })}
        />

        <DossierSection id="methodology" title={en ? 'Methodology and provenance' : 'Metodología y procedencia'}>
          <p>
            {en
              ? `COMPRANET data 2002–${DATA_CUT_YEAR}. Sector-level aggregate signals are statistical risk indicators of a procurement pattern, not legal determinations.`
              : `Datos CompraNet + ComprasMX 2002–${DATA_CUT_YEAR}. Las señales agregadas por sector son indicadores de riesgo estadísticos de un patrón de compra, no determinaciones legales.`}
          </p>
          <Link to="/methodology" className="ct-more ct-link">{en ? 'See the full methodology' : 'Ver la metodología completa'}</Link>
        </DossierSection>
      </div>
    </article>
    </HotProvider>
    </DossierOriginProvider>
  )
}
