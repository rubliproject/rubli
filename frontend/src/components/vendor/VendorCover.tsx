/**
 * VendorCover + VendorCifras + VendorFlagRow — the vendor dossier's head on «El Contrato»
 * (frontend/DESIGN.md §4.2, §5.1 read pages; docs/VENDOR_DOSSIER_SCHEME.md § 1, § 8).
 *
 *   Cover   h1 = the full registered name · one-line lede (sector, years, largest buyer) ·
 *           meta (record notes; no RFC in the head, DESIGN §0.6) · ONE band: the risk reading | the
 *           verdict, one row. The ARIA case passes its own lede and no band (it leads with the IPS).
 *   Cifras  contracts · amount · institutions · direct-award share · years active, a ruled
 *           row of figures (column rules, no cards).
 *   Flags   the ARIA / registry signals as a ruled list, one signal per row (was a run-on
 *           paragraph of bullets, owner 2026-10-27).
 */
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { AriaQueueItem, VendorDetailResponse } from '@/api/types'
import type { AlertSeverity, PriorityFlag } from '@/components/ui/PriorityAlert'
import { Cover } from '@/components/contrato/Cover'
import { Clause } from '@/components/contrato/Clause'
import { RiskGauge } from '@/components/contrato/RiskGauge'
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import { RISK_COLORS, SECTORS, getSectorName } from '@/lib/constants'
import { formatEntityName } from '@/lib/entity/format'
import { getVerdictFor } from '@/lib/entity/verdict'
import { formatCompactMXN, formatCompactUSD, formatNumber, plural } from '@/lib/utils'
import { ratePct } from '@/components/dossier/command/pct'
import { PersonaFisicaNote } from '@/components/vendor/PersonaFisicaNote'

/** The buyer with the largest awarded amount (the list may be ordered by contract count). */
function largestBuyer(vendor: VendorDetailResponse) {
  const top = (vendor.top_institutions ?? []).reduce<VendorDetailResponse['top_institutions'][number] | null>(
    (best, i) => (!best || (i.total_amount_mxn ?? 0) > (best.total_amount_mxn ?? 0) ? i : best), null)
  const share = top && vendor.total_value_mxn > 0 ? (top.total_amount_mxn ?? 0) / vendor.total_value_mxn : 0
  return { top, share }
}

export function VendorCover({ vendor, aria, ariaTier, isGroundTruth, caseName, side, className, children, lede: ledeOverride, band = true, caseHref, headless, lang }: {
  vendor: VendorDetailResponse
  aria?: AriaQueueItem | null
  ariaTier?: number | null
  isGroundTruth: boolean
  caseName?: string | null
  /** The head's right column: the buyers' orbit (owner 2026-10-27, concept A small). */
  side?: ReactNode
  /** Extra cover class (the ARIA case view widens the side column for its orbit). */
  className?: string
  /** After the band, in the cover's text column (the ARIA case layer). */
  children?: ReactNode
  /** The ARIA case's own one-line lede (the case page leads with the case, not the vendor). */
  lede?: ReactNode
  /** false: no risk band (the ARIA case leads with its IPS ledger instead). */
  band?: boolean
  /** The one door from the vendor's record to its ARIA case (the tier note becomes the link). */
  caseHref?: string | null
  /** Under a kit/PageHead (the ARIA case): no h1, no lede — the head prints the name and `lede`. */
  headless?: boolean
  lang: 'en' | 'es'
}) {
  const en = lang === 'en'
  const score = vendor.avg_risk_score
  const hr = ratePct(vendor.high_risk_pct)
  const { top: topInst, share: topShare } = largestBuyer(vendor)
  const verdict = getVerdictFor('vendor', {
    avg_risk_score: score ?? null,
    total_value_mxn: vendor.total_value_mxn ?? 0,
    total_contracts: vendor.total_contracts ?? 0,
    direct_award_pct: vendor.direct_award_pct ?? 0,
    is_false_positive: aria?.fp_structural_monopoly ?? false,
    in_ground_truth: aria?.in_ground_truth ?? isGroundTruth,
    case_name: caseName ?? undefined,
    // The top buyer's VALUE share (aria.top_institution_ratio is a contract-count share).
    top_institution_pct: topShare,
    ghost_companion_score: 0,
    thin_history: vendor.thin_history,
  })
  const sector = vendor.primary_sector_name ? getSectorName(vendor.primary_sector_name.toLowerCase(), lang) : null
  // the sector links to its dossier (interconnection audit 2026-10-27: it was plain text)
  const sectorId = vendor.primary_sector_id ?? SECTORS.find((x) => x.code === vendor.primary_sector_name?.toLowerCase())?.id
  const sectorLink = sector && sectorId != null
    ? <EntityIdentityChip type="sector" id={sectorId} name={sector} variant="name" className="vd-lede-link" />
    : sector
  const years = vendor.first_contract_year && vendor.last_contract_year
    ? (vendor.first_contract_year === vendor.last_contract_year ? `${vendor.first_contract_year}` : `${vendor.first_contract_year}–${vendor.last_contract_year}`)
    : null
  const pct = Math.round(topShare * 100)

  // provenance rides the lede (DESIGN.md §3.1: no notes row in the head)
  const merged = (vendor.merged_record_count ?? 1) > 1 && (en
    ? ` ${vendor.merged_record_count} CompraNet records unified (same tax ID or identical name).`
    : ` ${vendor.merged_record_count} registros de CompraNet unificados (mismo RFC o razón social idéntica).`)

  // One line: who it is (sector, years), who it sells to, whether a case names it.
  // The counts and amounts live in the figures row below — the lede no longer repeats them.
  const lede = (
    <>
      {sector
        ? <>{en ? '' : 'Proveedor del sector '}{sectorLink}{en ? ' supplier' : ''}{years ? `, ${years}` : ''}.</>
        : `${en ? 'Federal supplier' : 'Proveedor federal'}${years ? `, ${years}` : ''}.`}
      {topInst && pct >= 1 && (
        <>
          {en ? ' Its largest buyer, ' : ' Su mayor comprador, '}
          <EntityIdentityChip type="institution" id={topInst.institution_id} name={topInst.institution_name} variant="name" fullName className="vd-lede-link" />
          {en ? `, accounts for ${pct}% of the amount.` : `, concentra el ${pct}% del monto.`}
        </>
      )}
      {isGroundTruth && (en ? ' Named in a documented case.' : ' Consta en un caso documentado.')}
      {merged}
    </>
  )


  return (
    <Cover className={className ? `vd-cover ${className}` : 'vd-cover'} title={headless ? undefined : formatEntityName('vendor', vendor.name, 'full')} lede={headless ? merged || undefined : ledeOverride ? <>{ledeOverride}{merged}</> : lede} fullLede={!!ledeOverride} side={side}>
      {(vendor.persona_fisica || aria?.persona_fisica) && <PersonaFisicaNote vendorId={vendor.id} lang={lang} />}
      {/* the risk reading and the verdict: one band, one row (was two headed blocks) */}
      {band && <section className="vd-band" aria-label={en ? 'Risk indicator and reading' : 'Indicador de riesgo y lectura'}>
        <div className="vd-band-score">
          <h2>{en ? 'Risk indicator' : 'Indicador de riesgo'}</h2>
          <RiskGauge value={score != null && score > 0 ? score : null} tier={ariaTier} thinHistory={vendor.thin_history} vendor />
        </div>
        <div className="vd-band-read">
          {verdict && (
            <p>
              <b className={`vd-verdict-l${verdict.bucket === 'critical' || verdict.bucket === 'high' ? ` is-${verdict.bucket}` : ''}`}>
                {en ? verdict.label_en : verdict.label_es}.
              </b>{' '}
              {en ? verdict.rationale_en : verdict.rationale_es}
            </p>
          )}
          {(hr != null || ariaTier != null) && (
            <p className="ct-note">
              {hr != null && (en
                ? `${Math.round(hr)}% of its contracts read high or critical.`
                : `El ${Math.round(hr)}% de sus contratos tiene un indicador de riesgo alto o crítico.`)}
              {ariaTier != null && (caseHref
                ? <> <Link className="ct-link" to={caseHref}>{en ? `Tier ${ariaTier} of the investigation queue: open the case →` : `Nivel ${ariaTier} de la fila de investigación: abrir el caso →`}</Link></>
                : (en ? ` Tier ${ariaTier} of the investigation queue.` : ` Nivel ${ariaTier} de la fila de investigación.`))}
            </p>
          )}
        </div>
      </section>}
      {children}
    </Cover>
  )
}

export function VendorCifras({ vendor, lang }: { vendor: VendorDetailResponse; lang: 'en' | 'es' }) {
  const en = lang === 'en'
  const da = ratePct(vendor.direct_award_pct)
  const span = vendor.first_contract_year && vendor.last_contract_year
    ? vendor.last_contract_year - vendor.first_contract_year + 1
    : vendor.years_active ?? null
  const { top, share } = largestBuyer(vendor)
  const topShare = top && share > 0 ? Math.round(share * 100) : null
  const nInst = vendor.total_institutions ?? 0
  return (
    <section className="ct-clauses vd-cifras" aria-labelledby="vd-cifras-h">
      <h2 id="vd-cifras-h" className="sr-only">{en ? 'In figures' : 'En cifras'}</h2>
      <div className="ct-cl-grid">
        <Clause
          id="vd-contratos"
          title={en ? 'Contracts' : 'Contratos'}
          fig={formatNumber(vendor.total_contracts ?? 0)}
          count={{ value: vendor.total_contracts ?? 0, format: (n) => formatNumber(Math.round(n)) }}
          note={en ? 'in the federal register' : 'en el registro federal'}
        />
        <Clause
          id="vd-monto"
          title={en ? 'Amount awarded' : 'Monto adjudicado'}
          fig={formatCompactMXN(vendor.total_value_mxn ?? 0)}
          note={en ? `≈${formatCompactUSD(vendor.total_value_mxn ?? 0)}` : 'con monto válido'}
        />
        <Clause
          id="vd-instituciones"
          title={en ? 'Institutions served' : 'Instituciones atendidas'}
          fig={formatNumber(nInst)}
          count={{ value: nInst, format: (n) => formatNumber(Math.round(n)) }}
          note={topShare != null
            ? (en ? `${topShare}% from its largest buyer` : `${topShare}% con su mayor comprador`)
            : undefined}
        />
        <Clause
          id="vd-directa"
          title={en ? 'Direct award' : 'Adjudicación directa'}
          fig={da != null ? `${Math.round(da)}` : '—'}
          unit={da != null ? '%' : undefined}
          ruler={da != null ? { value: da / 100, mode: 'pointer', color: RISK_COLORS.high, ends: ['0%', en ? 'of its contracts' : 'de sus contratos', '100%'] } : undefined}
        />
        <Clause
          id="vd-anos"
          title={en ? 'Years active' : 'Años con contratos'}
          fig={span != null ? `${span}` : '—'}
          unit={span != null ? (en ? plural(span, 'year', 'years') : plural(span, 'año', 'años')) : undefined}
          dim={vendor.first_contract_year && vendor.last_contract_year ? `${vendor.first_contract_year} – ${vendor.last_contract_year}` : undefined}
        />
      </div>
    </section>
  )
}

const SEVERITY_WORD: Record<AlertSeverity, { es: string; en: string }> = {
  critical: { es: 'Crítico', en: 'Critical' },
  high: { es: 'Alto', en: 'High' },
  medium: { es: 'Medio', en: 'Medium' },
  info: { es: 'Nota', en: 'Note' },
}

/** The signals on record: the first flag leads (headline + its detail on one line), the rest
 *  run as a ruled list, one signal per row, severity word in its level color. */
export function VendorFlagRow({ flags, pendingLabel, lang }: { flags: PriorityFlag[]; pendingLabel?: string | null; lang: 'en' | 'es' }) {
  if (!flags.length) return null
  const [primary, ...rest] = flags
  const asList = rest.length >= 3
  const line = (f: PriorityFlag) => (f.linkTo ? <Link to={f.linkTo}>{f.headline}</Link> : f.headline)
  return (
    <section className="vd-flagrow" aria-label={lang === 'en' ? 'Signals on record' : 'Señales en el registro'}>
      <p className={`vd-flag-lead is-${primary.severity}`}>
        <span className="vd-sev">{SEVERITY_WORD[primary.severity][lang]}</span>
        <b>{line(primary)}</b>
        {primary.detail && <span className="vd-flag-detail">{primary.detail}</span>}
        {/* one or two more signals ride the lead line; a list of one would sit alone in a third of the row */}
        {!asList && rest.map((f) => (
          <span key={f.key} className={`vd-flag-inline is-${f.severity}`}>
            <span className="vd-sev">{SEVERITY_WORD[f.severity][lang]}</span> {line(f)}
          </span>
        ))}
        {!asList && pendingLabel && <span className="vd-flag-detail" aria-live="polite">{pendingLabel}</span>}
      </p>
      {asList && (
        <ul className="vd-flag-list">
          {rest.map((f) => (
            <li key={f.key} className={`is-${f.severity}`}>
              <span className="vd-sev">{SEVERITY_WORD[f.severity][lang]}</span>
              <span>{line(f)}</span>
            </li>
          ))}
          {pendingLabel && (
            <li className="is-info" aria-live="polite">
              <span className="vd-sev">…</span>
              <span>{pendingLabel}</span>
            </li>
          )}
        </ul>
      )}
    </section>
  )
}
