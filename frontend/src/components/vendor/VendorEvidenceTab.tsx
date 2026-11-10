/**
 * VendorEvidenceTab — why the model reached its verdict.
 *
 * Risk waterfall, full SHAP breakdown, peer comparison, methodology link.
 * Single-purpose: no activity, no network, no external registries.
 */
import { useTranslation } from 'react-i18next'
import type {
  VendorDetailResponse,
  VendorGroundTruthStatus,
  VendorWaterfallContribution,
  VendorPeerComparisonResponse,
  AriaQueueItem,
} from '@/api/types'
import { AriaMemoPanel } from '@/components/widgets/AriaMemoPanel'
import { ComparisonScales, SignalDiagram, SpecialistTerms } from './ModelReads'
import { buildScales, multipleWords, pickSignals, signalClaims, strongestScale } from '@/lib/vendor/modelReads'
import { formatRegistryDate, type VendorStanding } from './buildFlags'
import { formatVendorName } from '@/lib/vendor/formatName'
import { NO_RISK_LABEL, getRiskLevelFromScore, getSectorName } from '@/lib/constants'
import { formatNumber } from '@/lib/utils'
import { glueDashes } from '@/lib/typography'
import { SecCite } from '@/components/dossier/layers'

interface VendorEvidenceTabProps {
  vendor: VendorDetailResponse
  waterfall?: VendorWaterfallContribution[] | null
  waterfallLoading?: boolean
  aria?: AriaQueueItem | null
  groundTruth?: VendorGroundTruthStatus | null
  peerComparison?: VendorPeerComparisonResponse | null
  /** The one EFOS / SFP / GT standing (D13b § Change 7). */
  standing?: VendorStanding
  /** What the decomposition averages over (stored features vs the v5.2 engine). */
  waterfallBasis?: { n: number; source: 'z_features' | 'v52' | null } | null
}

export function VendorEvidenceTab({
  vendor,
  waterfall,
  waterfallLoading,
  aria,
  peerComparison,
  standing,
  waterfallBasis,
}: VendorEvidenceTabProps) {
  const { i18n } = useTranslation(['vendors'])
  const isEs = i18n.language.startsWith('es')
  const lang = isEs ? 'es' : 'en'

  // The model's terms as one connected figure (2026-11-04 remake): the few signals that matter in plain words,
  // their weight, what the weights come from, the indicator. Raw z / coefficients: «Para especialistas».
  const nBasis = waterfallBasis?.n ?? null
  const basis = nBasis
    ? waterfallBasis?.source === 'v52'
      ? (isEs ? `motor v5.2, ${formatNumber(nBasis)} contratos` : `v5.2 engine, ${formatNumber(nBasis)} contracts`)
      : (isEs ? `media de ${formatNumber(nBasis)} contratos` : `mean of ${formatNumber(nBasis)} contracts`)
    : null
  const efos = standing ? standing.efos : !!aria?.is_efos_definitivo
  const sfp = standing ? standing.sfp.length > 0 : !!aria?.is_sfp_sanctioned
  const sector = vendor.primary_sector_name ? getSectorName(vendor.primary_sector_name.toLowerCase(), lang) : null
  const nm = formatVendorName(vendor.name, 300)
  const picked = pickSignals(waterfall)
  const top = picked.up[0]
  const score = vendor.avg_risk_score ?? null
  const claims = signalClaims(waterfall, score, score != null ? getRiskLevelFromScore(score) : null)
  const scales = buildScales(peerComparison?.metrics, vendor)
  const foco = strongestScale(scales)

  return (
    <>
      <section className="vd-sub" aria-labelledby="waterfall-title">
        <h3 id="waterfall-title" className="vd-h3" data-sec="descomposicion">
          {isEs ? 'Qué lee el modelo y cuánto pesa cada señal' : 'What the model reads and how much each signal weighs'}
          {top && (
            <SecCite sec="descomposicion" lang={lang} text={isEs
              ? `${nm}: ${vendor.avg_risk_score != null ? `indicador de riesgo ${vendor.avg_risk_score.toFixed(2)}` : NO_RISK_LABEL.es}; la señal que más lo sube: «${top.es.toLowerCase()}» (RUBLI, modelo v0.9.2).`
              : `${nm}: ${vendor.avg_risk_score != null ? `risk indicator ${vendor.avg_risk_score.toFixed(2)}` : NO_RISK_LABEL.en}; the signal that raises it most: "${top.en.toLowerCase()}" (RUBLI, model v0.9.2).`} />
          )}
        </h3>
        {waterfallLoading ? (
          <div className="vd-hold" aria-busy="true" />
        ) : waterfall && waterfall.length > 0 && (top || picked.down) ? (
          <>
            {/* the finding first (owner 11-03): each sentence only when its data condition holds (modelReads.test.ts) */}
            <p className="vd-trend-read">{claims.map((c) => (isEs ? c.es : c.en)).join(' ')}</p>
            <p className="mr-key">{isEs
              ? <><b>Qué ves:</b> las señales que más mueven su indicador, en orden, hasta el resultado. <b>Cómo se lee:</b> cuanto más gruesa la línea, más pesa. La continua lo sube; la punteada lo baja. El % es su parte de todo el empuje. Los anillos marcan la más fuerte.</>
              : <><b>What you see:</b> the signals that move its indicator most, in order, down to the result. <b>How to read it:</b> the thicker the line, the more it weighs. Solid raises it; dashed lowers it. The % is its part of the whole push. The rings mark the strongest.</>}</p>
            <SignalDiagram terms={waterfall} score={score} nContracts={nBasis} lang={lang} />
            <SpecialistTerms terms={waterfall} basis={basis} lang={lang} />
          </>
        ) : waterfall && waterfall.length > 0 ? (
          <>
            <p className="vd-trend-read">{isEs ? 'Ninguna señal mueve mucho su indicador: todas quedan cerca de lo habitual.' : 'No signal moves its indicator much: all of them sit near the usual.'}</p>
            <SpecialistTerms terms={waterfall} basis={basis} lang={lang} />
          </>
        ) : (
          <p className="ct-note">
            {glueDashes(isEs
              ? 'El modelo no puede desglosar este indicador. A sus contratos les faltan las variables que necesita. Es típico de los registros CompraNet de 2002–2010. Sin desglose no significa sin riesgo.'
              : 'The model cannot break this indicator down. Its contracts lack the variables it needs. That is typical of 2002–2010 CompraNet records. No breakdown does not mean no risk.')}
          </p>
        )}
      </section>

      <section className="vd-sub" aria-labelledby="peer-title" data-sec="habitual">
        <h3 id="peer-title" className="vd-h3">
          {isEs ? 'Frente a lo habitual' : 'Against the usual'}
          {foco && (
            <SecCite sec="habitual" lang={lang} text={isEs
              ? `${nm}: ${foco.es.toLowerCase()}, ${multipleWords(foco, 'es')} en su sector (RUBLI, datos CompraNet).`
              : `${nm}: ${foco.en.toLowerCase()}, ${multipleWords(foco, 'en')} in its sector (RUBLI, CompraNet data).`} />
          )}
        </h3>
        <p className="mr-key">{isEs
          ? <><b>Qué ves:</b> una regla por medida, de 0 al máximo. <b>Cómo se lee:</b> la raya corta gris es lo típico de su sector (la mediana de sus empresas). La raya alta es esta empresa. A la derecha, cuántas veces lo habitual.</>
          : <><b>What you see:</b> one ruler per measure, from 0 to the top. <b>How to read it:</b> the short grey tick is typical of its sector (the median of its companies). The tall tick is this company. On the right, how many times the usual.</>}</p>
        <ComparisonScales scales={scales} sectorName={sector} lang={lang} />
      </section>

      {/* The ARIA memo (docs/VENDOR_DOSSIER_SCHEME.md § 1): nothing at all when there is none */}
      <div className="vd-sub vd-memo">
        <AriaMemoPanel
          vendorId={Number(vendor.id)}
          vendorName={vendor.name}
          tier={aria?.ips_tier ?? (vendor as { tier?: number; aria_tier?: number }).aria_tier ?? (vendor as { tier?: number }).tier}
          isFalsePositive={Boolean(aria?.fp_structural_monopoly ?? (vendor as { is_false_positive?: boolean | number }).is_false_positive)}
          fpReason={(vendor as { fp_reason?: string }).fp_reason}
          gtUnverified={standing?.gt === 'unverified'}
          hideEmpty
        />
      </div>

      {/* Los signos — external registries (EFOS, SFP); documented cases have their own section */}
      {(efos || sfp) && (
        <section className="vd-sub" aria-labelledby="signos-title">
          <h3 id="signos-title">{isEs ? 'Registros externos' : 'External registries'}</h3>
          <dl className="vd-dl">
            {efos && (
              <div>
                <dt>EFOS</dt>
                <dd>{isEs
                  ? 'Registrado en la lista de EFOS definitivos del SAT: empresa que factura operaciones simuladas.'
                  : 'Listed on the SAT definitive EFOS register: a company that invoices simulated operations.'}</dd>
              </div>
            )}
            {sfp && (
              <div>
                <dt>SFP</dt>
                <dd>{(() => {
                  // Dated (D13b § 7): "banned" only while the end date is ahead.
                  const s = standing?.sfp[0]
                  const byName = s && s.basis !== 'rfc'
                  const lead = byName
                    ? (isEs ? 'Posible coincidencia solo por nombre en el Registro de Proveedores Sancionados de la SFP' : 'Possible name-only match in the SFP Sanctioned Vendors Registry')
                    : (isEs ? 'Sanción en el Registro de Proveedores Sancionados de la SFP' : 'Sanction in the SFP Sanctioned Vendors Registry')
                  if (!s) return `${lead}.`
                  if (!s.from || !s.to) return s.plazoMonths
                    ? (isEs ? `${lead}: inhabilitación de ${s.plazoMonths} meses; el registro no trae la fecha.` : `${lead}: ${s.plazoMonths}-month debarment; the registry gives no date.`)
                    : (isEs ? `${lead}: multa, sin inhabilitación.` : `${lead}: a fine, no debarment.`)
                  const span = `${formatRegistryDate(s.from, lang)} – ${formatRegistryDate(s.to, lang)}`
                  return s.active
                    ? (isEs ? `${lead}, ${span}: inhabilitada para contratar con el gobierno federal hasta el ${formatRegistryDate(s.to, lang)}.` : `${lead}, ${span}: banned from federal contracting until ${formatRegistryDate(s.to, lang)}.`)
                    : (isEs ? `${lead}, ${span} (vencida).` : `${lead}, ${span} (expired).`)
                })()}</dd>
              </div>
            )}
          </dl>
        </section>
      )}

    </>
  )
}

// ─── GT enum localization (§ 7 Los Signos) ──────────────────────────────────
// ground_truth_vendors.role / .evidence_strength carry mixed snake_case enums
// plus occasional analyst free text. Known enums get a proper ES label; unknown
// values fall back to underscore-cleaned raw text (free text renders as-is).

export const GT_ROLE_ES: Record<string, string> = {
  primary: 'Principal',
  secondary: 'Secundario',
  beneficiary: 'Beneficiario',
  primary_beneficiary: 'Beneficiario principal',
  direct_beneficiary: 'Beneficiario directo',
  primary_suspect: 'Sospechoso principal',
  shell_company: 'Empresa fantasma',
  shell_vendor: 'Empresa fantasma',
  suspected_shell: 'Presunta empresa fantasma',
  ghost_company: 'Empresa fantasma',
  intermediary: 'Intermediario',
  'co-conspirator': 'Coconspirador',
  co_conspirator: 'Coconspirador',
  bribing_vendor: 'Proveedor sobornante',
  captured_vendor: 'Proveedor capturado',
  corporate_sibling: 'Filial corporativa',
  sanctioned_individual: 'Persona sancionada',
  sole_supplier: 'Proveedor único',
}

export const GT_EVIDENCE_ES: Record<string, string> = {
  high: 'Alta',
  strong: 'Fuerte',
  medium: 'Media',
  moderate: 'Moderada',
  low: 'Baja',
  weak: 'Débil',
  direct: 'Directa',
  circumstantial: 'Circunstancial',
  statistical: 'Estadística',
  confirmed_corrupt: 'Corrupción documentada',
}

export function localizeGtEnum(raw: string, isEs: boolean, esMap: Record<string, string>): string {
  const key = raw.trim().toLowerCase()
  if (isEs && esMap[key]) return esMap[key]
  // EN (or unmapped ES): clean snake_case → spaces; CSS uppercases for display.
  return key.length <= 32 ? raw.replace(/_/g, ' ') : raw
}
