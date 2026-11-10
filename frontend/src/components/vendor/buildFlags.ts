/**
 * buildVendorFlags — pure function that collapses every "this vendor is
 * suspicious" signal on a Vendor dossier into a single priority-sorted
 * flag list, ready to hand to <PriorityAlert>.
 *
 * This replaces:
 *   - 5 stacked alert banners in VendorProfile (Critical/EFOS/ARIA/GT/Sanctions)
 *   - the inline "Why is this vendor risky?" block at L1673
 *   - the PlainLanguageRiskCard pills
 *
 * All three rendered variants of the same underlying facts, producing
 * 4-5× repetition of EFOS/GT status on one page. Now there is one
 * computation feeding one component.
 */
import type {
  AriaQueueItem,
  SFPSanction,
  CoBiddersResponse,
  VendorDetailResponse,
  VendorExternalFlags,
  VendorGroundTruthStatus,
  VendorWaterfallContribution,
} from '@/api/types'
import type { AlertSeverity, PriorityFlag } from '@/components/ui/PriorityAlert'
import { RISK_THRESHOLDS, CURRENT_MODEL_VERSION } from '@/lib/constants'
import { featurePlain } from '@/lib/model/featureLabels'

export interface BuildFlagsInput {
  vendor: VendorDetailResponse
  externalFlags?: VendorExternalFlags | null
  groundTruthStatus?: VendorGroundTruthStatus | null
  coBidders?: CoBiddersResponse | null
  aria?: AriaQueueItem | null
  waterfall?: VendorWaterfallContribution[] | null
  /**
   * i18n translator — pass the `t` function from useTranslation().
   * Falls back to English defaults when a key is missing so the function is
   * unit-testable without a real i18n runtime.
   */
  t: (key: string, vars?: Record<string, string | number>) => string
  /** The one standing (EFOS / SFP / GT); derived here when not passed. */
  standing?: VendorStanding
  lang?: 'en' | 'es'
}

// ─── One standing, read by every surface (PARALLAX D13b § Change 7) ─────────
// The hero chips, the marginal note, § Network and § Signals used to read
// three EFOS sources and three GT/review statuses (29277 carried four).

export interface SfpRecordStanding {
  from: Date | null
  to: Date | null
  /** end date in the future — "banned until"; otherwise a dated, expired record */
  active: boolean
  /** ban length in months (null = a fine with no inhabilitación) */
  plazoMonths: number | null
  basis: SFPSanction['match_basis']
}

export interface VendorStanding {
  /** SAT EFOS definitivo — the ARIA flag OR the RFC registry record OR the vendor flag */
  efos: boolean
  efosPresunto: boolean
  sfp: SfpRecordStanding[]
  sfpActive: boolean
  /** the PUBLIC ground-truth label (DOCUMENTED_LINK_SQL via /ground-truth-status) */
  gt: 'documented' | 'unverified' | null
  /** the internal queue review status — shown only when gt is not 'unverified' */
  review: string | null
}

/** "16/07/2019" (SFP registry) or ISO → Date; null when unparseable. */
export function parseRegistryDate(raw: string | null | undefined): Date | null {
  if (!raw) return null
  const dmy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  const d = dmy ? new Date(Date.UTC(+dmy[3], +dmy[2] - 1, +dmy[1])) : new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d
}

export function deriveVendorStanding(input: {
  vendor: Pick<VendorDetailResponse, 'is_efos_ghost'>
  aria?: AriaQueueItem | null
  externalFlags?: VendorExternalFlags | null
  groundTruthStatus?: VendorGroundTruthStatus | null
  now?: Date
}): VendorStanding {
  const { vendor, aria, externalFlags, groundTruthStatus } = input
  const now = input.now ?? new Date()
  const stage = externalFlags?.sat_efos?.stage
  const sfp = (externalFlags?.sfp_sanctions ?? []).map((s) => {
    const to = parseRegistryDate(s.sanction_end)
    return {
      from: parseRegistryDate(s.sanction_start), to, active: !!to && to.getTime() >= now.getTime(),
      plazoMonths: s.plazo_months ?? null, basis: s.match_basis,
    }
  })
  return {
    efos: !!aria?.is_efos_definitivo || stage === 'definitivo' || !!vendor.is_efos_ghost,
    efosPresunto: stage === 'presunto',
    sfp,
    sfpActive: sfp.some((s) => s.active),
    gt: groundTruthStatus?.is_known_bad ? 'documented' : groundTruthStatus?.has_unverified_lead ? 'unverified' : null,
    review: aria?.review_status ?? null,
  }
}

/** "20 Nov 2020" / "20 nov 2020" — UTC so a registry date never shifts a day. */
const REGISTRY_DATE = {
  en: new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }),
  es: new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }),
}

export function formatRegistryDate(d: Date | null, lang: 'en' | 'es'): string {
  if (!d) return '—'
  return REGISTRY_DATE[lang].format(d)
}

/**
 * Single-award procedures as a share of the vendor's COMPETITIVE procedures — the base the
 * "in competitive procedures" label is defined on.
 * `vendor_stats.single_bid_pct` divides by ALL contracts (248612: 65% vs a true
 * 100%). `pct` is null when the vendor has no competitive procedure.
 * PARALLAX D13b § Change 4.
 */
export function singleBidCompetitive(
  vendor: Pick<VendorDetailResponse, 'total_contracts' | 'direct_award_count' | 'single_bid_count'>,
): { pct: number | null; sb: number; comp: number } {
  const sb = vendor.single_bid_count ?? 0
  const comp = Math.max(0, (vendor.total_contracts ?? 0) - (vendor.direct_award_count ?? 0))
  return { pct: comp > 0 ? (sb / comp) * 100 : null, sb, comp }
}

/**
 * Returns flags ordered by severity (critical → high → medium → info).
 * Multiple flags of the same severity preserve insertion order.
 */
export function buildVendorFlags(input: BuildFlagsInput): PriorityFlag[] {
  const { vendor, externalFlags, groundTruthStatus, coBidders, aria, waterfall, t } = input
  const standing = input.standing ?? deriveVendorStanding({ vendor, aria, externalFlags, groundTruthStatus })
  const lang = input.lang ?? 'en'
  const flags: PriorityFlag[] = []

  // ─── Ground truth (confirmed cases from model training) ────────────────
  if (groundTruthStatus?.is_known_bad) {
    const caseCount = groundTruthStatus.cases?.length ?? 0
    const firstSlug = groundTruthStatus.cases?.[0]?.scandal_slug
    flags.push({
      key: 'gt-confirmed',
      severity: 'critical',
      headline: t('vendorFlags.groundTruth.headline'),
      detail:
        caseCount > 0
          // i18next plural — count drives detail_one vs detail_other so the
          // string never reads "1 caso(s)" / "1 cases" again. Also threads
          // the active model version through ({{version}}) so we don't have
          // to reissue translations every time the active model bumps.
          ? t('vendorFlags.groundTruth.detail', {
              count: caseCount,
              version: CURRENT_MODEL_VERSION,
            })
          : undefined,
      // § 7 dossier spec: GT case flag must be clickable → /cases/:slug
      linkTo: firstSlug ? `/cases/${firstSlug}` : undefined,
    })
  } else if (groundTruthStatus?.has_unverified_lead) {
    flags.push({
      key: 'gt-unverified-lead',
      severity: 'info',
      headline: t('vendorFlags.unverifiedLead.headline'),
      detail: t('vendorFlags.unverifiedLead.detail'),
    })
  }

  // ─── SAT EFOS (tax-authority ghost-company registry) ───────────────────
  if (standing.efos) {
    flags.push({
      key: 'efos-definitivo',
      severity: 'critical',
      headline: t('vendorFlags.efosDefinitivo.headline'),
      detail: t('vendorFlags.efosDefinitivo.detail'),
    })
  } else if (standing.efosPresunto) {
    flags.push({
      key: 'efos-presunto',
      severity: 'high',
      headline: t('vendorFlags.efosPresunto.headline'),
      detail: t('vendorFlags.efosPresunto.detail'),
    })
  }

  // ─── SFP sanctions ──────────────────────────────────────────────────────
  // Critical only when the RFC confirms identity. RFC is missing at source for
  // most records, so a name-only match is surfaced as "possible", never as fact.
  const sfp = externalFlags?.sfp_sanctions ?? []
  if (sfp.length > 0) {
    const rfcVerified = sfp.some((s) => s.match_basis === 'rfc')
    const allAmbiguous = sfp.every((s) => s.match_basis === 'name_ambiguous')
    flags.push({
      key: 'sfp',
      severity: rfcVerified ? 'critical' : 'high',
      headline: rfcVerified
        ? t('vendorFlags.sfp.headline', { n: sfp.length })
        : t('vendorFlags.sfp.headlineName', { n: sfp.length }),
      detail: [
        rfcVerified
          ? t('vendorFlags.sfp.detail')
          : allAmbiguous
            ? t('vendorFlags.sfp.detailAmbiguous')
            : t('vendorFlags.sfp.detailName'),
        // Dated: an expired record is not a current ban (261748: 2020, expired).
        // start = notification, end = notification + plazo (registry snapshot Jan 2021).
        ...standing.sfp.slice(0, 1).map((s) => s.from && s.to
          ? t(s.active ? 'vendorFlags.sfp.activeUntil' : 'vendorFlags.sfp.expired', { from: formatRegistryDate(s.from, lang), to: formatRegistryDate(s.to, lang) })
          : s.plazoMonths
            ? t('vendorFlags.sfp.undated', { n: s.plazoMonths })
            : t('vendorFlags.sfp.fineOnly')),
      ].join(' '),
    })
  }

  // ─── ARIA investigation tier ───────────────────────────────────────────
  if (aria?.ips_tier === 1) {
    flags.push({
      key: 'aria-t1',
      severity: 'critical',
      headline: t('vendorFlags.ariaT1.headline'),
      detail: aria.primary_pattern
        ? t('vendorFlags.ariaT1.detail', { pattern: aria.primary_pattern })
        : undefined,
      linkTo: `/aria/caso/${vendor.id}`, // the case page (owner 2026-10-27: interconnect); it redirects to /vendors/:id when not queued
    })
  } else if (aria?.ips_tier === 2) {
    flags.push({
      key: 'aria-t2',
      severity: 'high',
      headline: t('vendorFlags.ariaT2.headline'),
      detail: aria.primary_pattern
        ? t('vendorFlags.ariaT2.detail', { pattern: aria.primary_pattern })
        : undefined,
      linkTo: `/aria/caso/${vendor.id}`, // the case page (owner 2026-10-27: interconnect); it redirects to /vendors/:id when not queued
    })
  }

  // ─── § 8 False-positive guard — structural monopoly (BAXTER/FRESENIUS etc) ──
  // When set, ARIA/risk flags above are noise, not signal. Surface explicitly
  // so a journalist doesn't draw a false corruption inference.
  if (aria?.fp_structural_monopoly) {
    flags.push({
      key: 'fp-structural',
      severity: 'info',
      headline: t('vendorFlags.fpStructural.headline'),
      detail: t('vendorFlags.fpStructural.detail'),
    })
  }

  // ─── Model risk score ──────────────────────────────────────────────────
  const score = vendor.avg_risk_score ?? 0
  if (score >= RISK_THRESHOLDS.critical) {
    flags.push({
      key: 'risk-critical',
      severity: 'critical',
      headline: t('vendorFlags.riskCritical.headline', { pct: (score * 100).toFixed(0) }),
    })
  } else if (score >= RISK_THRESHOLDS.high) {
    flags.push({
      key: 'risk-high',
      severity: 'high',
      headline: t('vendorFlags.riskHigh.headline', { pct: (score * 100).toFixed(0) }),
    })
  }

  // ─── Institutional capture (post S.1 backfill) ────────────────────────
  // When a vendor's top institution represents ≥ 80% of total award value,
  // it signals potential regulatory capture (P6 pattern). Don't double-fire
  // if an ARIA T1/T2 flag already covers this.
  const topInstRatio = aria?.top_institution_ratio ?? 0
  const topInst = aria?.top_institution
  const ariaAlreadyCovered = aria?.ips_tier === 1 || aria?.ips_tier === 2
  if (topInstRatio >= 0.8 && topInst && !ariaAlreadyCovered && !aria?.fp_structural_monopoly) {
    flags.push({
      key: 'institutional-capture',
      severity: 'high',
      headline: t('vendorFlags.institutionalCapture.headline', {
        pct: (topInstRatio * 100).toFixed(0),
        inst: topInst,
      }),
      detail: t('vendorFlags.institutionalCapture.detail'),
    })
  }

  // ─── Procurement patterns ──────────────────────────────────────────────
  const daPct = vendor.direct_award_rate_corrected ?? vendor.direct_award_pct ?? 0
  if (daPct > 70) {
    flags.push({
      key: 'direct-award',
      severity: 'high',
      headline: t('vendorFlags.highDirectAward.headline', { pct: daPct.toFixed(0) }),
    })
  }
  // No single-award flag: CompraNet records winners, not bidders, so a high
  // single-award rate is not a red flag (D20, chair-plan C7).

  // ─── Co-bidding clustering ─────────────────────────────────────────────
  const clustering = vendor.cobid_clustering_coeff ?? 0
  if (clustering > 0.6) {
    flags.push({
      key: 'clustering',
      severity: 'high',
      headline: t('vendorFlags.highClustering.headline', { pct: (clustering * 100).toFixed(0) }),
    })
  }
  const strongCoBid =
    coBidders?.co_bidders?.some(
      (cb) =>
        cb.relationship_strength === 'very_strong' ||
        cb.relationship_strength === 'strong'
    ) || (coBidders?.suspicious_patterns?.length ?? 0) > 0
  if (strongCoBid && clustering <= 0.6) {
    // Don't double-count if clustering flag already fired.
    flags.push({
      key: 'co-bidding',
      severity: 'medium',
      headline: t('vendorFlags.coBidding.headline'),
    })
  }

  // ─── Model primary driver (if waterfall available) ─────────────────────
  if (waterfall && waterfall.length > 0) {
    const topDriver = [...waterfall]
      .filter((f) => f.contribution > 0)
      .sort((a, b) => b.contribution - a.contribution)[0]
    if (topDriver && topDriver.z_score > 2) {
      flags.push({
        key: 'primary-driver',
        severity: 'medium',
        // plain words, no σ: several terms (RT-4 breadth, the HHI terms) are not in SD units (2026-11-04)
        headline: t('vendorFlags.primaryDriver.headline', {
          factor: featurePlain(topDriver.feature, topDriver.z_score, lang).replace(/^./, (c) => c.toLowerCase()),
        }),
      })
    }
  }

  return sortFlagsByPriority(flags)
}

/**
 * SEVERITY_RANK — use this to sort raw flags before passing to PriorityAlert.
 * Higher number = higher priority.
 */
const SEVERITY_RANK: Record<AlertSeverity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  info: 1,
}

export function sortFlagsByPriority(flags: PriorityFlag[]): PriorityFlag[] {
  return [...flags].sort(
    (a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]
  )
}
