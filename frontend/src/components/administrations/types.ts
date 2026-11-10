/**
 * Shared types for /administrations and its extracted helpers.
 *
 * Extracted from pages/Administrations.tsx (2026-05-11) so dossier-panel
 * and grade-card components can be split out of the page module without
 * circular imports.
 */
import type { YearOverYearChange } from '@/api/types'

/** Stable string IDs that name each presidential administration. */
export type AdminName = 'Fox' | 'Calderon' | 'Pena Nieto' | 'AMLO' | 'Sheinbaum'

/** Per-administration aggregate metrics. Used by dossier panel + comparison views. */
export interface AdminAgg {
  name: AdminName
  contracts: number
  totalValue: number
  avgRisk: number
  /** null = no procedure type in the term (coded from 2011, DQ1 § 2) — never a fake 0 */
  directAwardPct: number | null
  singleBidPct: number | null
  highRiskPct: number
  /** totalValue × highRiskPct / 100 */
  valueAtRisk: number
  vendorCount: number
  institutionCount: number
  years: YearOverYearChange[]
  /** Derived: contracts / yearCount. Used in comparison tables. */
  contractsPerYear: number
  /** Derived: totalValue / yearCount. */
  valuePerYear: number
  yearCount: number
}

/** Metric selector for the Admin × Sector heatmap matrix. */
export type MatrixMetric = 'risk' | 'da' | 'hr' | 'sb'

/** Static dossier metadata — political context per admin. Scandals come from
 *  the API (useAdminScandals), not from here. */
export interface DossierEntry {
  /** i18n key under `administrations.dossier.contexts.*` */
  contextKey: string
  /** Sector codes ranked by spending priority for this era. */
  topSectorKeys: string[]
}

/** Shape of one entry in the ADMINISTRATIONS constant. */
export interface AdminMeta {
  name: AdminName
  fullName: string
  start: number
  end: number
  dataStart: number
  color: string
  party: string
  wikiArticle: string
}
