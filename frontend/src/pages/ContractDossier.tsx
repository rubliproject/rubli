/**
 * ContractDossier «El Sumario» — the contract dossier at /contracts/:id on «El Contrato»
 * (frontend/DESIGN.md §5–§8). A READ-mode dossier, read as the record it is:
 *
 *   DocHead   Registro › Contratos › #id
 *   Cover     h1 = what was bought (or the folio) · lede = who bought what from whom,
 *             when, how · lead: the record chain (vendor pulled on the seal-red rule ⇄
 *             institution ⇄ this contract's RiskGauge), three columns that end level
 *   En cifras amount (dual currency; the >10B / implausible flag printed honestly) ·
 *             date · procedure · risk indicator on its ruler
 *   Sections  the risk reading (prose | contributions as a ruled list, never a pill) ·
 *             the annotated record (ActaLedger) · the relationship with this buyer (the
 *             pair chart + the other contracts as a ledger) · flags | cite and export
 *   Firmas    live in the shell.
 *
 * Legacy ContractDetail (958 LOC) moved to /print/contracts/:id.
 */
import { useState, type ReactNode } from 'react'
import { useParams, useLocation, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { MotionConfig } from 'framer-motion'
import { contractApi, predictionsApi } from '@/api/client'
import { PredictionCallout } from '@/components/kit/PredictionCallout'
import { contractPredictionText } from '@/lib/predictions'

import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import { ActaLedger } from '@/components/contract/ActaLedger'
import { CaseSeal } from '@/components/contracts/SenaladosBand'
import { DocHead } from '@/components/contrato/DocHead'
import { Conexiones } from '@/components/contrato/Conexiones'
import { cieloHref } from '@/lib/vista'
import { whyLine } from '@/lib/vendor/modelReads'
import { Cover } from '@/components/contrato/Cover'
import { PageHead } from '@/components/kit/PageHead'
import { headTour } from '@/lib/tours'
import { PageQuestion } from '@/components/kit/PageQuestion'
import { RegisterBoard } from '@/components/contracts/RegisterBoard'
import '@/components/contract/contrato-b2.css'
import { RiskGauge } from '@/components/contrato/RiskGauge'
import { localizeProcedure, describeContractFactor, dedupeFactorsByFamily, sanitizeContractText, riskTagsOf, recordedValue } from '@/lib/contract-format'
import { cleanContractDescription } from '@/lib/contract-audit'
import { formatEntityName } from '@/lib/entity/format'
import { sectorRankText } from '@/lib/sectorRelative'
import { DATASET_DOI, SECTOR_COLORS, SECTORS, getRiskLevelFromScore, isThinHistoryLow, isUnscored } from '@/lib/constants'
import { COMPRASMX_STRUCTURE, SourceTag } from '@/components/contrato/SourceTag'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { formatCompactMXN, formatDate, formatDualCurrency, safeHttpUrl } from '@/lib/utils'
import '@/components/contract/contract-dossier.css'
import { dataQualityWord } from '@/lib/tiers'
import { ElSello } from '@/components/contract/ElSello'
import { LasMonedas } from '@/components/contract/LasMonedas'
import { coinStacks, nearQueries, pickNearest, stampsOf } from '@/lib/contract/objects'
import { NoIndex } from '@/lib/seo/routeMeta'

// ─── Helpers ────────────────────────────────────────────────────────────────

/** COMPRANET source structures → their years (data-validation rules). */
const ERA: Record<string, string> = { A: '2002–2010', B: '2010–2017', C: '2018–2022', D: '2023–2025', E: 'ComprasMX 2025–2026' }

const LEVEL_WORD = {
  critical: { es: 'crítico', en: 'critical' },
  high: { es: 'alto', en: 'high' },
  medium: { es: 'medio', en: 'medium' },
  low: { es: 'bajo', en: 'low' },
} as const

/** API strings arrive UPPERCASE; the sheet never shouts (DESIGN.md §2). */
const sentence = (v?: string | null) => (v ? v.charAt(0).toUpperCase() + v.slice(1).toLowerCase() : '')

/** HTTP status of a failed query (axios error), or null for network errors. */
function httpStatusOf(err: unknown): number | null {
  return (err as { response?: { status?: number } } | null)?.response?.status ?? null
}

function Section({ id, title, aside, children }: { id: string; title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="ct-section" aria-labelledby={id}>
      <div className="ct-annex-row">
        <h2 id={id} className="ct-h2 scroll-mt-4">{title}</h2>
        {aside && <span className="cs-aside">{aside}</span>}
      </div>
      <div className="ct-section-body">{children}</div>
    </section>
  )
}

// ─── Main page ──────────────────────────────────────────────────────────────

export default function ContractDossier() {
  const { id } = useParams<{ id: string }>()
  const contractId = Number(id)
  const validId = Number.isFinite(contractId) && contractId > 0
  const location = useLocation()
  const { i18n, t } = useTranslation(['common', 'aria'])
  const lang: 'en' | 'es' = i18n.language?.startsWith('es') ? 'es' : 'en'
  const es = lang === 'es'

  // Only a 404 means «no encontrado»; any other failure (503 rate limit,
  // network) is retried twice and then offered a retry button (contract § G1).
  const { data: contract, isLoading: contractLoading, error: contractError, refetch: refetchContract, isFetching: contractFetching } = useQuery({
    queryKey: ['contract-dossier', contractId, 'detail'],
    queryFn: () => contractApi.getById(contractId),
    enabled: validId,
    staleTime: 10 * 60 * 1000,
    retry: (count, err) => httpStatusOf(err) !== 404 && count < 2,
  })

  const { data: explanation } = useQuery({
    queryKey: ['contract-dossier', contractId, 'explain'],
    queryFn: () => contractApi.getRiskExplanation(contractId),
    enabled: validId,
    staleTime: 10 * 60 * 1000,
  })

  // Prod-true risk factors (parsed server-side; works without contract_z_features).
  const { data: riskBreakdown } = useQuery({
    queryKey: ['contract-dossier', contractId, 'risk-breakdown'],
    queryFn: () => contractApi.getRiskBreakdown(contractId),
    enabled: validId,
    staleTime: 10 * 60 * 1000,
    retry: false,
  })

  // Size-in-context + relationship + named official, bundled.
  const { data: context } = useQuery({
    queryKey: ['contract-dossier', contractId, 'context'],
    queryFn: () => contractApi.getContext(contractId),
    enabled: validId,
    staleTime: 10 * 60 * 1000,
    retry: false,
  })

  // The pair register — same key as RelationSection's, so one request feeds both.
  const pairCount = context?.pair?.total_contracts ?? 0
  const { data: register } = useQuery({
    queryKey: ['contract-relation', contract?.vendor_id, contract?.institution_id, 'pair'],
    queryFn: () => contractApi.getAll({
      vendor_id: contract?.vendor_id ?? undefined,
      institution_id: contract?.institution_id ?? undefined,
      per_page: 100,
      sort_by: 'amount_mxn',
      sort_order: 'desc',
    }),
    enabled: pairCount > 1 && !!contract?.vendor_id && !!contract?.institution_id,
    staleTime: 10 * 60 * 1000,
  })

  // «Si sigue así» (block 3): the pair's class + its back-tested base rate; never fetched for a persona física
  const { data: pairPred } = useQuery({
    queryKey: ['prediction-pair', contract?.vendor_id, contract?.institution_id],
    queryFn: () => predictionsApi.pair(contract!.vendor_id!, contract!.institution_id!),
    enabled: !!contract?.vendor_id && !!contract?.institution_id && !contract?.vendor_is_individual,
    staleTime: 10 * 60 * 1000,
    retry: false,
  })
  const { data: ctrPred } = useQuery({
    queryKey: ['prediction-contract', contractId],
    queryFn: () => predictionsApi.contract(contractId),
    enabled: validId && !!contract && !contract.vendor_is_individual,
    staleTime: 10 * 60 * 1000,
    retry: false,
  })

  // «Las monedas»: its three nearest (same sector and year, nearest in log-amount and date); the band widens once if thin.
  const nearKey = contract ? [contract.id, contract.sector_id, contract.contract_year, contract.amount_mxn] : null
  const { data: nearRows } = useQuery({
    queryKey: ['contract-dossier', contractId, 'nearest', nearKey],
    queryFn: async () => {
      const c = contract!
      const pages = await Promise.all(nearQueries(Number(c.amount_mxn)).map((q) =>
        contractApi.getAll({ sector_id: c.sector_id, year: c.contract_year, ...q, per_page: 50, sort_by: 'amount_mxn' })))
      return pickNearest(pages.flatMap((p) => p.data), c)
    },
    enabled: !!contract?.sector_id && !!contract?.contract_year && Number(contract?.amount_mxn ?? 0) > 0,
    staleTime: 10 * 60 * 1000,
    retry: false,
  })

  // document.title — amount · vendor → institution (D12b § Change 6).
  useDocumentTitle(
    contract
      ? `${formatCompactMXN(Number(contract.amount_mxn ?? 0))} · ${formatEntityName('vendor', contract.vendor_name, 'full') || '—'} → ${formatEntityName('institution', contract.institution_name, 'full') || '—'} — RUBLI`
      : null,
  )

  const [copied, setCopied] = useState(false)
  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard blocked: the citation stays selectable on the page */
    }
  }

  const fromAria = location.state && (location.state as { from?: string }).from === '/aria'
  const listCrumb = fromAria
    ? { label: t('nav:ariaQueue'), to: '/aria' }
    : { label: es ? 'Contratos' : 'Contracts', to: '/contracts' }
  const shell = (label: string, body: ReactNode) => (
    <article className="ct ct-page ct-sheet contract-page" data-frame>
      <div className="ct-wrap">
        <DocHead trail={[listCrumb, { label }]} />
        {body}
      </div>
    </article>
  )

  if (!validId) {
    return shell(es ? 'ID inválido' : 'Invalid ID', (
      <Cover
        title={es ? 'ID de contrato inválido' : 'Invalid contract ID'}
        lede={<>{es ? 'El enlace no apunta a un contrato del registro. ' : 'The link does not point to a contract in the record. '}<Link to="/contracts" className="ct-link">{es ? 'Volver a contratos' : 'Back to contracts'}</Link></>}
      />
    ))
  }
  // Loading: reserve the cover's geometry (DESIGN.md §7), no spinner.
  if (contractLoading) {
    return shell(`#${contractId}`, (
      <div className="cs-hold" aria-busy="true">
        <span className="sr-only" role="status">{es ? 'Cargando el contrato…' : 'Loading the contract…'}</span>
      </div>
    ))
  }
  if (contractError || !contract) {
    const notFound = httpStatusOf(contractError) === 404
    return shell(`#${contractId}`, (
      <Cover
        title={notFound ? (es ? 'Contrato no encontrado' : 'Contract not found') : (es ? 'No pudimos cargar el contrato' : "We couldn't load the contract")}
        lede={notFound
          ? (es ? `No hay ningún contrato con el número #${contractId} en el registro.` : `There is no contract #${contractId} in the record.`)
          : (es ? 'El servidor no respondió. El contrato puede existir; vuelva a intentarlo en unos segundos.' : 'The server did not respond. The contract may exist; try again in a few seconds.')}
      >
        {notFound && <NoIndex />}
        <p className="cs-actions" role="alert">
          {!notFound && (
            <button type="button" className="cs-btn" onClick={() => refetchContract()} disabled={contractFetching}>
              {contractFetching ? (es ? 'Reintentando…' : 'Retrying…') : (es ? 'Reintentar' : 'Retry')}
            </button>
          )}
          <Link to="/contracts" className="ct-link">{es ? 'Volver a contratos' : 'Back to contracts'}</Link>
        </p>
      </Cover>
    ))
  }

  const sector = SECTORS.find((s) => s.id === contract.sector_id)
  const sectorCode = sector?.code ?? 'otros'
  const sectorAccent = SECTOR_COLORS[sectorCode] ?? SECTOR_COLORS.otros

  const score = Number(contract.risk_score ?? 0)
  const scored = !isUnscored(contract.risk_score, contract.risk_model_version)
  const level = getRiskLevelFromScore(score)
  // the printed score caps at 0.99 (same rule as the B2 chips): a model output, never a certainty
  const shown = Math.min(score, 0.99)
  // a low reading from a vendor with < 3 prior contracts means «no data» (house fix F3)
  const thin = scored && isThinHistoryLow(score, contract.thin_history)
  const riskPct = scored ? Math.floor(Math.min(score, 0.99) * 100) : null
  // where it sits within its own sector (BIAS_AUDIT_SECTOR § 8 rec. 1): the absolute score is not cross-sector
  const sectorRank = sectorRankText(contract.sector_pct, lang)

  const described = dedupeFactorsByFamily(riskTagsOf(riskBreakdown?.factors).map((f) => describeContractFactor(f, lang)))
    .sort((a, b) => b.sortKey - a.sortKey)

  // Vendor standing (D12b § Change 5): only the true facts.
  const standing = context?.vendor_standing
  const queued = standing?.ips_tier != null && standing.ips_tier <= 3
  const standingParts: ReactNode[] = []
  if (standing) {
    if (queued) standingParts.push(es ? `Nivel ${standing.ips_tier} en ${t('nav:ariaQueue')}` : `Tier ${standing.ips_tier} in ${t('nav:ariaQueue')}`)
    if (standing.primary_pattern) {
      const patternName = t(`aria:patterns.${standing.primary_pattern}`, { defaultValue: standing.primary_pattern })
      // the pattern opens its dossier (interconnection audit 2026-10-27: it was plain text)
      standingParts.push(<>{es ? 'patrón: ' : 'pattern: '}<EntityIdentityChip type="pattern" id={standing.primary_pattern} name={patternName} variant="name" className="ct-link" /></>)
    }
    if (standing.in_ground_truth) standingParts.push(es ? 'caso documentado' : 'documented case')
    else if (standing.has_unverified_lead) standingParts.push(es ? 'pista en revisión' : 'lead under review')
    if (standing.is_efos_definitivo) standingParts.push(es ? 'EFOS definitivo (SAT)' : 'EFOS definitive (SAT)')
    if (standing.is_sfp_sanctioned) standingParts.push(es ? 'sanción registrada por la SFP' : 'SFP sanction on record')
  }
  const standingLine = standingParts.map((p, i) => <span key={i}>{i ? ' · ' : ''}{p}</span>)


  // The object of the contract, in full. All-caps records are sentence-cased like the archive.
  const rawDesc = contract.description ?? contract.title ?? ''
  const cleanDesc = sanitizeContractText(
    /[a-záéíóúñ]/.test(rawDesc) ? rawDesc : cleanContractDescription(rawDesc, Infinity).objeto,
  )
  const rawTitle = sanitizeContractText(contract.title ?? '')
  const shortTitle = /[a-záéíóúñ]/.test(rawTitle) ? rawTitle : sentence(rawTitle)
  // h1 = what was bought; a long object goes to the lede and the title (or folio) heads the page.
  const esH1 = cleanDesc && cleanDesc.length <= 140 ? cleanDesc : shortTitle || (es ? `Contrato ${contract.contract_number ?? `#${contract.id}`}` : `Contract ${contract.contract_number ?? `#${contract.id}`}`)
  // EN: the machine-translated title heads the page; the Spanish record follows in the lede, marked
  const mt = !es && contract.title_en ? contract.title_en : null
  const h1 = mt ?? esH1

  // Amount sanity (contract § G6; DESIGN data rule): > 100B is rejected upstream; > 10B is
  // flagged for review; an amount under 1,000 MXN is a likely capture error, not a fact.
  const amount = Number(contract.amount_mxn ?? 0)
  const implausible = contract.amount_flag === 'suspect_decimal' || (amount > 0 && amount < 1000)
  const overTenB = !implausible && (contract.amount_flag === 'review' || amount > 10_000_000_000)
  const amountFlag = implausible
    ? (es ? 'Posible error de captura: el monto no es verosímil para un contrato federal.' : 'Possible data-entry error: the amount is not plausible for a federal contract.')
    : overTenB
      ? (es ? 'Monto superior a 10 mil MDP: revisado como atípico, no como error.' : 'Amount above 10B MXN: reviewed as an outlier, not an error.')
      : null

  const procedureLabel = localizeProcedure(contract.procedure_type_normalized ?? contract.procedure_type, lang)
  const vendorName = formatEntityName('vendor', contract.vendor_name, 'full') || (es ? 'un proveedor sin nombre' : 'an unnamed vendor')
  const instName = formatEntityName('institution', contract.institution_name, 'full') || (es ? 'una institución sin nombre' : 'an unnamed institution')
  // AUDIT_DATA 11-07 A8: «awarded on» = the record's award date (fallo); contract_date is the date the record carries,
  // said as such (2915511: fallo 25 Mar 2024, record date 12 Nov 2024)
  const awardTxt = contract.award_date ? formatDate(contract.award_date) : null
  const dateTxt = contract.contract_date ? formatDate(contract.contract_date) : null
  const recTail = !awardTxt && dateTxt ? (es ? `; fecha del registro: ${dateTxt}` : `; record date: ${dateTxt}`) : ''
  const lede = es
    ? `${instName} adjudicó este contrato a ${vendorName}${awardTxt ? ` el ${awardTxt}` : ''}${procedureLabel !== '—' ? `, por ${procedureLabel.toLowerCase()}` : ''}${recTail}.`
    : `${instName} awarded this contract to ${vendorName}${awardTxt ? ` on ${awardTxt}` : ''}${procedureLabel !== '—' ? `, by ${procedureLabel.toLowerCase()}` : ''}${recTail}.`
  // is_year_end (ETL) = November or December; only December is «the close of the year»
  const ym = contract.contract_date ? Number(contract.contract_date.slice(5, 7)) : null
  const yearEndTag = !contract.is_year_end ? null : ym === 12 ? (es ? 'cierre de año' : 'year-end') : (es ? 'último bimestre del año' : 'last two months of the year')
  const yearEndFact = !contract.is_year_end ? null : ym === 12
    ? (es ? 'Se registró en diciembre, al cierre del año.' : 'It is dated December, at the close of the year.')
    : (es ? 'Se registró en el último bimestre del año.' : 'It is dated in the last two months of the year.')

  // Citation (contract § G3). CompraNet is gone (Apr 2025): never synthesize a link.
  const citeIds = [
    contract.expedient_code ? `${es ? 'expediente' : 'file'} ${contract.expedient_code}` : null,
    contract.procedure_number ? `${es ? 'procedimiento' : 'procedure'} ${contract.procedure_number}` : null,
    contract.contract_number ? `${es ? 'contrato' : 'contract'} ${contract.contract_number}` : null,
  ].filter((c): c is string => c != null)
  const citation = [
    `RUBLI, ${es ? 'contrato' : 'contract'} #${contract.id}`,
    `${es ? 'Fuente' : 'Source'}: ${contract.source_structure === COMPRASMX_STRUCTURE ? 'ComprasMX' : 'CompraNet'} (SHCP)`,
    ...citeIds,
    `https://rubli.xyz/contracts/${contract.id}`,
    `DOI ${DATASET_DOI}`,
  ].join(' · ')
  const grade = contract.data_quality_grade
  const struct = contract.source_structure

  // Model decomposition (β·z), when the calibration carries it for this contract.
  const contributions = [...(explanation?.features ?? [])]
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
    .slice(0, 8)


  const flags: Array<[string, ReactNode]> = [
    ...(amountFlag ? [[es ? 'Monto' : 'Amount', amountFlag] as [string, ReactNode]] : []),
    [es ? 'Proveedor' : 'Vendor', standingParts.length ? standingLine : (es ? 'Sin señalamientos externos registrados' : 'No external flags on record')],
    [es ? 'Procedimiento' : 'Procedure', [
      contract.is_direct_award ? (es ? 'adjudicación directa' : 'direct award') : null,
      contract.is_single_bid ? (es ? 'un solo adjudicado' : 'single award') : null,
      yearEndTag,
      contract.is_threshold_gaming ? (es ? 'cerca del umbral de licitación' : 'near the tender threshold') : null,
    ].filter(Boolean).join(' · ') || (es ? 'competido, sin banderas estructurales' : 'competed, no structural flags')],
    [es ? 'Calidad del registro' : 'Record quality', [
      grade ? dataQualityWord(grade, es ? 'es' : 'en') : null,
      struct && ERA[struct] ? `${es ? 'estructura' : 'structure'} ${struct}, ${ERA[struct]}` : null,
    ].filter(Boolean).join(' · ') || '—'],
  ]

  // Legal basis and term as «El sello» (STORYMAP_L1 § 7): each field verbatim, «sin dato» when empty, never inferred.
  // The context bundle carries the article when the detail row does not (same record, ComprasMX ctx).
  const stampIn = {
    exception_article: recordedValue(contract.exception_article) ?? recordedValue(context?.official?.exception_article),
    caso_fortuito: contract.caso_fortuito, procedure_label: procedureLabel, is_direct_award: contract.is_direct_award,
    start_date: contract.start_date, end_date: contract.end_date, award_date: contract.award_date,
    risk_score: contract.risk_score == null ? null : Math.min(Number(contract.risk_score), 0.99), scored, amount_flag: contract.amount_flag ?? null, // the record's own flag only (the sheet is «as recorded»)
  }
  const stamps = stampsOf(stampIn, lang, formatDate)
  const procNo = recordedValue(contract.procedure_number)
  const coins0 = nearRows?.length ? coinStacks(contract, nearRows, 24) : null
  const coins = coins0 && coins0.stacks.some((s) => s.coins > 0) ? coins0 : null

  // ─── B2 (owner-approved content doc v2, docs/PROFILE_CONTENT_CONTRATO_2026-11-05.md): four questions, one column ───
  const yr = contract.contract_year ?? (contract.contract_date ? Number(contract.contract_date.slice(0, 4)) : null)
  const pf = !!contract.vendor_is_individual
  const pair = context?.pair
  const pairN = pair?.total_contracts ?? 0
  // 2 · the reasons in plain words: the model's top raising variables, else the recorded tags; then the structural facts
  // the same sentence the vendor page prints (lib/vendor/modelReads whyLine, AUDIT_JOURNALIST 11-07 P1)
  const why = whyLine(contributions, lang)
  const reasons = why ? [] : described.slice(0, 3).map((f) => f.label)
  const facts = [
    contract.is_direct_award ? (es ? 'Se adjudicó sin concurso.' : 'It was awarded without a tender.') : null,
    contract.is_single_bid ? (es ? 'Hubo un solo adjudicado en el concurso.' : 'The tender had a single award.') : null,
    yearEndFact,
  ].filter((x): x is string => !!x)
  const riskMeans = !scored
    ? (es ? 'Sin indicador: este contrato entró sin puntuar.' : 'No indicator: this contract was loaded unscored.')
    : thin
      ? (es ? `Indicador ${shown.toFixed(2)}, con poca historia del proveedor.` : `Indicator ${shown.toFixed(2)}, with little vendor history.`)
      : (es ? `Indicador ${LEVEL_WORD[level].es} (${shown.toFixed(2)}).` : `${LEVEL_WORD[level].en[0].toUpperCase()}${LEVEL_WORD[level].en.slice(1)} indicator (${shown.toFixed(2)}).`)
      + (why ? ` ${why}` : reasons[0] ? (es ? ` La razón principal: ${reasons[0].toLowerCase()}.` : ` The main reason: ${reasons[0].toLowerCase()}.`) : '')
  // 3 · who benefited: the pair (this buyer × this vendor), all years
  const pairMeans = pairN > 0
    ? (es
        ? `${vendorName}${pf ? ' (persona física)' : ''} cobró ${formatCompactMXN(pair!.total_amount_mxn)} de este comprador${pair!.first_year ? ` desde ${pair!.first_year}` : ''}, en ${pairN.toLocaleString('es-MX')} ${pairN === 1 ? 'contrato' : 'contratos'}.`
        : `${vendorName}${pf ? ' (individual)' : ''} received ${formatCompactMXN(pair!.total_amount_mxn)} from this buyer${pair!.first_year ? ` since ${pair!.first_year}` : ''}, in ${pairN.toLocaleString('en-US')} ${pairN === 1 ? 'contract' : 'contracts'}.`)
    : (es ? 'Es el único contrato de este proveedor con este comprador.' : 'It is this vendor’s only contract with this buyer.')
  const pairTop = (register?.data ?? []).slice(0, 5)
  // 4 · is it normal: size against the median contract of its sector (context), the parecidos claim when true
  const p50 = context?.sector_p50_mxn ?? null
  const times = p50 && p50 > 0 && amount > 0 ? amount / p50 : null
  // sector_p50_mxn = the median contract of the whole sector, every year (backend contracts.py): said as such
  const xs = (v: number) => (v < 10 ? v.toFixed(1) : Math.round(v).toLocaleString(es ? 'es-MX' : 'en-US'))
  const sizeLine = times == null ? null
    : times >= 1.5
      ? (es ? `Es ${xs(times)} veces la mediana de su sector (2002–2025).` : `It is ${xs(times)} times its sector’s median contract (2002–2025).`)
      : times <= 0.67
        ? (es ? 'Es más chico que la mediana de su sector (2002–2025).' : 'It is smaller than its sector’s median contract (2002–2025).')
        : (es ? 'Es del tamaño de la mediana de su sector (2002–2025).' : 'It is about its sector’s median contract (2002–2025).')
  const catName = context?.official?.category_id ? ((es ? context.official.category_name_es : context.official.category_name_en) ?? context.official.category_name_es ?? null) : null
  return (
    <MotionConfig reducedMotion="user">
      <article className="ct ct-page ct-sheet contract-page cb2" data-frame>
        <div className="ct-wrap">
          <PageHead
            lang={lang}
            crumbs={[listCrumb, { label: `#${contract.id}` }]}
            actions={<PageQuestion bare {...headTour('contract', lang)} />}
            kicker={<>{contract.contract_number ?? `#${contract.id}`} · {struct === COMPRASMX_STRUCTURE ? 'ComprasMX' : 'CompraNet'}<SourceTag struct={contract.source_structure} score={contract.risk_score} ver={contract.risk_model_version} /></>}
            finding={h1}
            question={<>{mt && <span className="block text-text-muted">Machine translation. Spanish record: «{esH1}».</span>}{lede}</>}
          />

          <div id="ctr-panel-contrato">
            {/* 1 · ¿Qué se compró? — four simple stats (the law cell repeated the stamp: AUDIT 11-07 #8); the legal basis and term as recorded (owner KEEP) */}
            <Section id="cs-que" title={es ? '¿Qué se compró?' : 'What was bought?'}>
              <div className="cb2-two is-1">
              <dl className="cb2-stats">
                <div><dt>{es ? 'Monto' : 'Amount'}</dt><dd className={implausible ? 'cs-muted' : undefined}>{formatDualCurrency(amount, yr ?? undefined)}{amountFlag && <small>{amountFlag}</small>}</dd></div>
                <div><dt>{es ? 'Fecha' : 'Date'}</dt><dd>{dateTxt ?? '—'}</dd></div>
                <div><dt>{es ? 'Tipo de compra' : 'Procedure'}</dt><dd>{procedureLabel}{contract.is_direct_award ? <small>{es ? 'sin concurso' : 'no tender'}</small> : null}</dd></div>
                <div><dt>{es ? 'Categoría' : 'Category'}</dt><dd>{context?.official?.category_id && catName
                  ? <EntityIdentityChip type="category" id={context.official.category_id} name={catName} variant="name" className="ct-link" />
                  : <span className="cs-muted">{es ? 'sin categoría' : 'uncategorised'}</span>}</dd></div>
              </dl>
              {(contract.is_multiannual || contract.is_consolidated) && (
                <p className="cb2-note">{[contract.is_multiannual ? (es ? 'Contrato de varios años.' : 'Multi-year contract.') : null, contract.is_consolidated ? (es ? 'Compra consolidada.' : 'Consolidated purchase.') : null].filter(Boolean).join(' ')}</p>
              )}
              <div className="cb2-center"><h3 className="cs-kicker">{es ? 'El fundamento y la vigencia, tal como consta' : 'Legal basis and term, as recorded'}</h3><ElSello
                compact
                stamps={stamps}
                lang={lang}
                head={<><span>{contract.contract_number ?? `#${contract.id}`}</span><span>{struct === COMPRASMX_STRUCTURE ? 'ComprasMX' : 'CompraNet'}{recordedValue(contract.expedient_code) ? ` · ${contract.expedient_code}` : ''}</span></>}
                footer={<>
                  <span>{es ? 'Procedimiento' : 'Procedure'} {procNo
                    ? <Link to={`/contracts?search=${encodeURIComponent(procNo)}`} className="ct-link">{procNo}</Link>
                    : <span className="cs-muted">{es ? 'sin dato' : 'no data'}</span>}</span>
                  <span>{[sentence(contract.procedure_character), sentence(contract.participation_form)].filter(Boolean).join(' · ')}</span>
                </>}
              /></div>
              </div>
            </Section>

            {/* 2 · ¿Por qué podría ser riesgoso? Y por qué lo decimos — no β·z bar (owner cut) */}
            <Section id="cs-riesgo" title={es ? '¿Por qué podría ser riesgoso?' : 'Why might it be risky?'}>
              <p className="cb2-means">{riskMeans}</p>
              <div className="cb2-two is-2"><div>
              <div className="cb2-risk">
                <RiskGauge value={scored ? shown : null} tier={queued ? standing?.ips_tier : null} thinHistory={contract.thin_history} />
                {scored && sectorRank && <p className="cb2-reasons">{sectorRank}</p>}
                {(reasons.length > 0 || facts.length > 0) && (
                  <p className="cb2-reasons">{[...reasons, ...facts.map((f) => f.replace(/\.$/, ''))].join(' · ')}.</p>
                )}
              </div>
              {contract.is_documented_case && contract.case_slug && <div className="cs-seal"><CaseSeal contract={contract} lang={lang} /></div>}
              {contract.is_documented_case && context?.evidence && (
                <figure className="cs-evidence">
                  <figcaption className="cs-kicker">{es ? 'Nota del expediente' : 'Case-file note'}</figcaption>
                  <p lang="en">{context.evidence.kind === 'quote' ? `“${context.evidence.source_reference}”` : context.evidence.source_reference}</p>
                  {context.evidence.source_url && <p className="ct-foot"><a href={safeHttpUrl(context.evidence.source_url)} target="_blank" rel="noopener noreferrer" className="ct-link">{es ? 'fuente' : 'source'}</a></p>}
                </figure>
              )}
              </div><div>
              <p className="cb2-why">
                <b>{es ? 'Por qué lo decimos.' : 'Why we say so.'}</b>{' '}
                {es ? 'El modelo aprendió de casos documentados (la mayoría, por la prensa). Es una señal para revisar, no una prueba.' : 'The model learned from documented cases (most of them reported by the press). It is a signal to review, not proof.'}{' '}
                <Link to="/methodology" className="ct-link">{es ? 'Metodología' : 'Methodology'}</Link>
              </p>
              </div></div>
            </Section>

            {/* 3 · ¿Quién se benefició? — the vendor, its history with this buyer, the Portada board */}
            <Section id="cs-quien" title={es ? '¿Quién se benefició?' : 'Who benefited?'}>
              <p className="cb2-means">{pairMeans}</p>
              <p className="cb2-who">
                {contract.vendor_id
                  ? <EntityIdentityChip type="vendor" id={contract.vendor_id} name={contract.vendor_name} personaFisica={pf} fullName inline />
                  : vendorName}
                {' ← '}
                {contract.institution_id
                  ? <EntityIdentityChip type="institution" id={contract.institution_id} name={contract.institution_name} fullName inline />
                  : instName}
                {standingParts.length > 0 && <span className="cb2-standing"> · {standingLine}</span>}
              </p>
              {pairTop.length > 1 && (
                <RegisterBoard rows={pairTop} lang={lang} hideVendor
                  label={es ? `Los ${pairTop.length} mayores contratos de este proveedor con este comprador` : `This vendor’s ${pairTop.length} largest contracts with this buyer`} />
              )}
              {contract.vendor_id && contract.institution_id && pairN > pairTop.length && (
                <p className="cb2-note"><Link to={`/contracts?vendor_id=${contract.vendor_id}&institution_id=${contract.institution_id}`} className="ct-link">
                  {es ? `Ver los ${pairN.toLocaleString('es-MX')} contratos →` : `See all ${pairN.toLocaleString('en-US')} contracts →`}</Link></p>
              )}
              <PredictionCallout text={contractPredictionText(ctrPred, pairPred, es, pf)} />
            </Section>

            {/* 4 · ¿Es normal? — this contract and its nearest (owner KEEP «Las monedas») */}
            <Section id="cs-normal" title={es ? '¿Es normal en su categoría?' : 'Is it normal for its category?'}>
              <div className="cb2-two is-4">
              <p className="cb2-means">{coins
                  ? (es ? `Este contrato: ${formatCompactMXN(coins.stacks[0].amount)}. Sus parecidos: ${coins.stacks.slice(1).map((s) => formatCompactMXN(s.amount)).join(', ')}.`
                        : `This contract: ${formatCompactMXN(coins.stacks[0].amount)}. Its nearest: ${coins.stacks.slice(1).map((s) => formatCompactMXN(s.amount)).join(', ')}.`)
                  : sizeLine ?? (es ? 'No hay contratos parecidos para comparar.' : 'There are no near contracts to compare.')}</p>
              {coins && <div className="cb2-coins"><LasMonedas compact stacks={coins.stacks} unit={coins.unit} lang={lang} /></div>}
              </div>
            </Section>

            {/* the raw record for journalists (owner: «El acta» → a drawer) */}
            <details className="cb2-drawer">
              <summary>{es ? 'Ver el registro completo' : 'See the full record'}</summary>
              <ActaLedger contract={contract} breakdown={riskBreakdown} explanation={explanation} context={context} riskPct={riskPct} sectorAccent={sectorAccent} lang={lang} />
              <dl className="cs-facts">
                {flags.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
              </dl>
              <h3 className="cs-kicker">{es ? 'Citar este contrato' : 'Cite this contract'}</h3>
              <p className="cs-cite">{citation}</p>
              <p className="cs-actions">
                <button type="button" className="cs-btn" onClick={() => copyText(citation)} aria-live="polite">
                  {copied ? (es ? 'Cita copiada' : 'Citation copied') : (es ? 'Copiar cita' : 'Copy citation')}
                </button>
                <button type="button" className="cs-btn is-ghost" onClick={() => window.print()}>{es ? 'Imprimir / PDF' : 'Print / PDF'}</button>
                {contract.url && <a href={safeHttpUrl(contract.url)} target="_blank" rel="noopener noreferrer" className="ct-link">{es ? 'Documento fuente' : 'Source document'}</a>}
              </p>
            </details>
          </div>

          <Conexiones
            lang={lang}
            sectorId={contract.sector_id}
            categories={context?.official?.category_id ? [{ id: context.official.category_id, name: (es ? context.official.category_name_es : context.official.category_name_en) ?? context.official.category_name_es }] : undefined}
            focos={queued && contract.vendor_id ? { to: `/aria/caso/${contract.vendor_id}`, label: es ? `Nivel ${standing?.ips_tier} · abrir el caso del proveedor` : `Tier ${standing?.ips_tier} · open the vendor's case` } : null}
            pattern={standing?.primary_pattern}
            cases={contract.case_slug ? [{ slug: contract.case_slug, name: (es ? contract.case_name_es : contract.case_name_en) ?? contract.case_name_es ?? contract.case_slug }] : undefined}
            contracts={contract.vendor_id && contract.institution_id
              ? { to: `/contracts?vendor_id=${contract.vendor_id}&institution_id=${contract.institution_id}`, label: pairN ? (es ? `${pairN.toLocaleString('es-MX')} de este proveedor con este comprador` : `${pairN.toLocaleString('en-US')} between this vendor and this buyer`) : (es ? 'Los de este proveedor con este comprador' : 'This vendor with this buyer') }
              : null}
            mapa={contract.institution_id ? cieloHref({ star: contract.institution_id, planet: contract.vendor_id }) : null}
          />
        </div>
      </article>
    </MotionConfig>
  )
}
