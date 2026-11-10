/**
 * VendorHero — cover slug for the unified vendor dossier.
 *
 * Redesigned 2026-05-22 (DESIGNUS round 6, component 1/10). NYT/ICIJ
 * investigation aesthetic: typographic restraint, asymmetric balance,
 * generous negative space, two-color architectural thread (sector accent
 * + risk-tier accent). Replaces the previous 13-block hero that bundled
 * everything into one place — now the hero just IDENTIFIES, DECLARES,
 * and POINTS TO sections below. SHAP drivers, stat row, verdict sentence,
 * Build Investigation Thread CTA are all dropped (their content lives in
 * the dossier sections below, not in the cover slug).
 *
 * Composition:
 *   6px sector rail · index strip · § kicker · headline + verdict-card
 *   · priority alerts (if any) · drop-cap lede · "ON THE PAGE" TOC
 *
 * Five typographic registers, used exclusively:
 *   1. Headline serif (EB Garamond italic)        — vendor name
 *   2. Editorial serif (EB Garamond italic)        — lede paragraph
 *   3. Display num (Playfair Italic 800)          — verdict number, drop cap
 *   4. Mono kicker (IBM Plex Mono)                — index, §, metadata, TOC
 *   5. Body sans (system)                         — chips, controls
 *
 * Two chromatic colors:
 *   • Sector accent — 6px rail, § kicker, lede left rule, drop cap,
 *                     TOC roman numerals, metadata rule
 *   • Risk-tier color — verdict card top bar, big number, tier label,
 *                       chip tints
 */
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Copy, Check } from 'lucide-react'
import type {
  VendorDetailResponse,
} from '@/api/types'
import {
  PriorityAlert,
  type PriorityFlag,
} from '@/components/ui/PriorityAlert'
import {
  RISK_COLORS,
  RISK_TEXT_COLORS,
  SECTOR_COLORS,
  getRiskLevelFromScore,
  getSectorName,
} from '@/lib/constants'
import { formatEntityName } from '@/lib/entity/format'
import {
  formatCompactMXN,
  formatCompactUSD,
  formatNumber,
  plural,
} from '@/lib/utils'
import { formatVendorName } from '@/lib/vendor/formatName'
import type { VendorScorecardData } from '@/components/ui/ScorecardWidgets'
import { PageMasthead } from '@/components/layout/PageMasthead'

// Dossier section anchors — must match the id="..." attributes on the
// VendorDossier shell. The six narrative chapters were removed in the 2026-06-03
// operational rebuild; these are the real reference sections (no roman numerals).
const TOC_ANCHORS: Array<{ id: string; en: string; es: string; numeral?: string }> = [
  { id: 'evidence',    en: 'Evidence',    es: 'Evidencia'    },
  { id: 'activity',    en: 'Activity',    es: 'Actividad'    },
  { id: 'network',     en: 'Network',     es: 'Red'          },
  { id: 'methodology', en: 'Methodology', es: 'Metodología'  },
]

interface VendorHeroProps {
  vendor: VendorDetailResponse
  scorecard?: VendorScorecardData | null
  flags: PriorityFlag[]
  /** Weekend F3: the co-bidders query (seconds slower than the rest) is still in flight. */
  flagsPending?: boolean
  /** Right-aligned action buttons (Watch / Share / Export). */
  actions?: ReactNode
  /** ARIA investigative tier — 1=critical, 4=low. */
  ariaTier?: 1 | 2 | 3 | 4 | null
  /** Ground-truth confirmed corruption case. Drives the GT chip. */
  isGroundTruth?: boolean
  /** The one EFOS / SFP standing (buildFlags deriveVendorStanding); falls back
   *  to the vendor row's flags when not passed (the legacy print view). */
  isEfos?: boolean
  isSfpActive?: boolean
  /** Show the "ON THE PAGE" TOC strip. Default true (unified dossier);
   *  pass false in the legacy /print/vendors/:id context where the
   *  surrounding chrome is tabs, not scroll sections. */
  showTOC?: boolean
}

export function VendorHero({
  vendor,
  flags,
  flagsPending = false,
  actions,
  ariaTier,
  isGroundTruth,
  isEfos,
  isSfpActive,
  showTOC = true,
}: VendorHeroProps) {
  const { i18n } = useTranslation()
  const isEs = i18n.language?.startsWith('es')
  const lang: 'en' | 'es' = isEs ? 'es' : 'en'

  const sectorCode = vendor.primary_sector_name?.toLowerCase() ?? 'otros'
  const sectorAccent = SECTOR_COLORS[sectorCode] ?? SECTOR_COLORS.otros

  const score = vendor.avg_risk_score ?? 0
  const riskLevel = score > 0 ? getRiskLevelFromScore(score) : 'low'
  const riskColor = score > 0 ? RISK_COLORS[riskLevel] : 'var(--color-text-muted)'
  const riskPct = score > 0 ? Math.round(score * 100) : null

  // Lede paragraph — data-driven, picks the strongest frame.
  const lede = buildVendorLede(vendor, { lang, isGroundTruth: !!isGroundTruth })

  // Editorial vendor name + legal-form split. Mexican vendors typically
  // end in "S.A. de C.V.", "S.C.", "S. de R.L.", etc. Split for typographic
  // hierarchy: name big, legal form quiet beneath it.
  const { displayName, legalForm } = splitNameAndLegalForm(vendor.name)
  // Hero headline gets the full editorial name (no maxLength truncation).
  // formatVendorName defaults to maxLength=28 for compact UI — that's the
  // wrong contract for a magazine cover slug, so pass 300 explicitly.
  const editorialName = formatVendorName(displayName, 300)

  // Slot 3 — the vendor's active years (one year when it opened and closed in the same one).
  const range = vendor.first_contract_year && vendor.last_contract_year
    ? (vendor.first_contract_year === vendor.last_contract_year
        ? `${vendor.first_contract_year}`
        : `${vendor.first_contract_year}–${vendor.last_contract_year}`)
    : undefined
  const dom = dominantBuyerTag(vendor, lang)

  return (
    <div className="relative">
      {/* Face § 3.7 — EXPEDIENTE masthead: 6 px sector rail (the one coloured
          element) · one eyebrow (printed id · kicker · years, actions right) ·
          the name · meta rows · the verdict card as aside (stacks below 640). */}
      <PageMasthead
        variant="expediente"
        rail={sectorAccent}
        railLabel={getSectorName(sectorCode, lang)}
        folio={`EXP · D-${String(vendor.id).padStart(5, '0')}`}
        kicker={isEs ? 'EL EXPEDIENTE · PROVEEDOR' : 'THE FILE · VENDOR DOSSIER'}
        range={range}
        actions={actions}
        // last two words glued (≤ 24 chars ≈ 315px at 32px, box 334 at 390) — no one-word stub (weekend D3)
        title={editorialName}
        titleMax={24}
        aside={
          <VerdictCard
            riskPct={riskPct}
            riskLevel={riskLevel}
            riskColor={riskColor}
            ariaTier={ariaTier ?? null}
            isGroundTruth={!!isGroundTruth}
            isEfos={isEfos ?? !!vendor.is_efos_ghost}
            isSfp={isSfpActive ?? !!vendor.is_sfp_sanctioned}
            lang={lang}
          />
        }
      >
        {legalForm && (
          <div
            className="mt-1.5"
            style={{
              fontFamily: 'var(--font-family-editorial)',
              fontSize: 16,
              fontWeight: 400,
              color: 'var(--color-text-muted)',
              letterSpacing: '0.01em',
            }}
          >
            {legalForm}
          </div>
        )}

        {/* Metadata rule — RFC + tags under a hairline left rule */}
        <div
          className="mt-4"
          style={{
            borderLeft: '2px solid var(--color-border)',
            paddingLeft: 14,
          }}
        >
          <VendorMetaRule
            vendor={vendor}
            lang={lang}
          />
        </div>

        {/* Under lg the dominant buyer's full name (no sigla) gets its own
            full-width line here instead of wrapping the narrow meta column. */}
        {dom && !dom.sigla && (
          <p
            className="lg:hidden mt-3 font-mono"
            style={{ fontSize: 12, letterSpacing: '0.04em', color: 'var(--color-text-secondary)', borderLeft: '2px solid var(--color-border)', paddingLeft: 14 }}
          >
            {dom.tag}
          </p>
        )}
      </PageMasthead>

      <div className="pb-6">
        {/* ─── Row 4: priority alerts (if any), repositioned above lede */}
        {flags.length > 0 && (
          <aside
            aria-labelledby="vendor-marginal-note"
            className="mt-5"
            style={{
              borderLeft: `2px solid var(--color-accent)`,
              paddingLeft: 14,
              paddingTop: 6,
              paddingBottom: 6,
            }}
          >
            <p
              id="vendor-marginal-note"
              className="font-mono"
              style={{
                fontSize: 13,
                fontStyle: 'normal',
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                color: 'var(--color-accent-text)',
                fontWeight: 500,
                marginBottom: 6,
              }}
            >
              {isEs ? 'Nota al margen' : 'Marginal note'}
            </p>
            <PriorityAlert
              flags={flags}
              pendingLabel={flagsPending ? (isEs ? 'Revisando co-licitación…' : 'Checking co-bidding…') : null}
            />
          </aside>
        )}

        {/* ─── Row 5: the editorial lede. The "what this sum could have funded"
            companion was removed (weekend #10 round 8): on a named vendor it
            implied the money was lost. ──────────────── */}
        <div className="mt-6">
          <Lede text={lede} sectorAccent={sectorAccent} />
        </div>

        {/* ─── Row 6: ON THE PAGE TOC strip ─────────────────────────── */}
        {showTOC && (
          <OnThePageStrip sectorAccent={sectorAccent} lang={lang} />
        )}
      </div>
    </div>
  )
}

// ───────────────────────── subcomponents ────────────────────────────────────

/**
 * The verdict card seal — risk number + tier + signal chips. Visual
 * anchor on the right column of the headline row. ~160px wide.
 */
function VerdictCard({
  riskPct,
  riskLevel,
  riskColor,
  ariaTier,
  isGroundTruth,
  isEfos,
  isSfp,
  lang,
}: {
  riskPct: number | null
  riskLevel: 'critical' | 'high' | 'medium' | 'low'
  riskColor: string
  ariaTier: 1 | 2 | 3 | 4 | null
  isGroundTruth: boolean
  isEfos: boolean
  isSfp: boolean
  lang: 'en' | 'es'
}) {
  // The number, tier word and chip labels take the AA reading ink; the top bar
  // and the chip fills/borders keep the vivid risk colour.
  const riskInk = riskPct == null ? 'var(--color-text-muted)' : RISK_TEXT_COLORS[riskLevel]
  // Build chips inline — only show ones that actually fire
  const chips: Array<{ label: string; color: string; ink: string; title: string }> = []
  if (isGroundTruth) {
    chips.push({
      label: 'GT',
      color: RISK_COLORS.critical,
      ink: RISK_TEXT_COLORS.critical,
      title: lang === 'es' ? 'Consta en un caso documentado' : 'Named in a documented case (Ground Truth)',
    })
  }
  if (ariaTier != null && ariaTier <= 2) {
    chips.push({
      label: `T${ariaTier}`,
      color: ariaTier === 1 ? RISK_COLORS.critical : RISK_COLORS.high,
      ink: ariaTier === 1 ? RISK_TEXT_COLORS.critical : RISK_TEXT_COLORS.high,
      title: lang === 'es' ? `Nivel ${ariaTier} de ARIA` : `ARIA Tier-${ariaTier} cohort`,
    })
  }
  if (isEfos) {
    chips.push({
      label: 'EFOS',
      color: RISK_COLORS.critical,
      ink: RISK_TEXT_COLORS.critical,
      title: lang === 'es' ? 'Empresa fantasma confirmada (SAT)' : 'Confirmed shell company (SAT)',
    })
  }
  if (isSfp) {
    chips.push({
      label: 'SFP',
      color: RISK_COLORS.critical,
      ink: RISK_TEXT_COLORS.critical,
      title: lang === 'es' ? 'Sancionada por la SFP' : 'Sanctioned by the SFP',
    })
  }

  return (
    <aside
      aria-label={lang === 'es' ? 'Veredicto de riesgo' : 'Risk verdict'}
      className="flex-shrink-0 relative"
      style={{
        width: 168,
        paddingTop: 6,
        paddingBottom: 8,
        paddingLeft: 18,
        paddingRight: 18,
      }}
    >
      {/* 2px risk-tier top bar */}
      <div
        aria-hidden="true"
        className="absolute top-0 left-0 right-0"
        style={{ height: 2, background: riskColor }}
      />

      {/* Big number */}
      <div className="text-center">
        <div
          className="tabular-nums"
          style={{
            fontFamily: '"Playfair Display", Georgia, serif',
            fontStyle: 'normal',
            fontWeight: 800,
            fontSize: 46,
            lineHeight: 1,
            color: riskInk,
            letterSpacing: '-0.02em',
          }}
        >
          {riskPct ?? '—'}
        </div>
        <div
          className="font-mono tabular-nums mt-1"
          style={{
            fontSize: 12,
            color: 'var(--color-text-muted)',
            letterSpacing: '0.04em',
          }}
        >
          / 100
        </div>
      </div>

      {/* Hairline divider */}
      <div
        aria-hidden="true"
        className="my-3 mx-auto"
        style={{
          height: 1,
          width: '60%',
          background: 'var(--color-border)',
        }}
      />

      {/* Tier label */}
      <div
        className="font-mono text-center"
        style={{
          fontSize: 12,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          color: riskInk,
          fontWeight: 700,
        }}
      >
        {riskPct == null
          ? (lang === 'es' ? 'Sin puntuación' : 'Not scored')
          : (lang === 'es' ? localizeRiskLevel(riskLevel, 'es') : riskLevel.toUpperCase())}
      </div>

      {/* Chips inline */}
      {chips.length > 0 && (
        <div className="flex flex-wrap items-center justify-center gap-1 mt-2">
          {chips.map((c, i) => (
            <span
              key={i}
              className="font-mono"
              style={{
                fontSize: 13,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                fontWeight: 700,
                color: c.ink,
                background: `${c.color}1f`,
                border: `1px solid ${c.color}44`,
                padding: '2px 5px',
                borderRadius: 2,
              }}
              title={c.title}
            >
              {c.label}
            </span>
          ))}
        </div>
      )}
    </aside>
  )
}

/** «X dominant» when one buyer holds ≥ 35% of the vendor's value. The
 *  institution's own name — real siglas like IMSS come through as-is, never
 *  invented from initials ("PEP" was PEMEX Exploración y Producción). */
function dominantBuyerTag(vendor: VendorDetailResponse, lang: 'en' | 'es'): { tag: string; sigla: boolean } | null {
  const topInst = vendor.top_institutions?.[0]
  if (!topInst || !(vendor.total_value_mxn > 0)) return null
  if ((topInst.total_amount_mxn / vendor.total_value_mxn) * 100 < 35) return null
  const sigla = institutionSigla(topInst.institution_name)
  const name = sigla ?? formatEntityName('institution', topInst.institution_name, 'full')
  return { tag: lang === 'es' ? `${name} dominante` : `${name} dominant`, sigla: !!sigla }
}

/** A sigla the institution's own name carries — "(IMSS)" or a bare ≤ 8-letter
 *  acronym. Never invented from initials ("PEP" was PEMEX Exploración y Producción). */
function institutionSigla(raw: string | null | undefined): string | null {
  if (!raw) return null
  const paren = raw.match(/\(([A-ZÁÉÍÓÚÑ]{2,10})\)\s*$/)
  if (paren) return paren[1]
  const bare = raw.trim()
  return /^[A-ZÁÉÍÓÚÑ]{2,8}$/.test(bare) ? bare : null
}

/**
 * Vendor metadata rule — RFC + tags line under the headline. Lives inside
 * a sector-accent left rule. Mono register so it reads as document
 * metadata, not as voice.
 */
function VendorMetaRule({
  vendor,
  lang,
}: {
  vendor: VendorDetailResponse
  lang: 'en' | 'es'
}) {
  const [rfcCopied, setRfcCopied] = useState(false)

  async function copyRfc() {
    if (!vendor.rfc) return
    try {
      await navigator.clipboard.writeText(vendor.rfc)
      setRfcCopied(true)
      setTimeout(() => setRfcCopied(false), 1500)
    } catch {
      /* clipboard unavailable */
    }
  }

  // Tag fragments — build dynamically, hide gracefully when missing
  const tagFragments: string[] = []
  // The dominant buyer: its sigla inline when the name carries one; otherwise the
  // full name inline at lg+, and under lg on its own full-width line below the
  // headline row (VendorHero) — in the 126 px column beside the verdict card a
  // long name wrapped the block to 6 lines at 390 (PARALLAX D13b § 2, R5).
  const dominant = dominantBuyerTag(vendor, lang)
  let dominantLine: string | null = null
  let dominantAt = -1
  if (vendor.primary_sector_name) {
    tagFragments.push(getSectorName(vendor.primary_sector_name.toLowerCase(), lang))
  }
  if (dominant?.sigla) tagFragments.push(dominant.tag)
  else if (dominant) { dominantLine = dominant.tag; dominantAt = tagFragments.length }
  if (vendor.first_contract_year && vendor.last_contract_year) {
    if (vendor.first_contract_year === vendor.last_contract_year) {
      tagFragments.push(`${vendor.first_contract_year}`)
    } else {
      tagFragments.push(`${vendor.first_contract_year}–${vendor.last_contract_year}`)
    }
  }
  if (vendor.total_institutions > 1) {
    tagFragments.push(
      lang === 'es'
        ? `${formatNumber(vendor.total_institutions)} instituciones`
        : `${formatNumber(vendor.total_institutions)} institutions`
    )
  }
  const metaItems: Array<{ text: string; lgOnly?: boolean }> = tagFragments.map((text) => ({ text }))
  if (dominantLine) metaItems.splice(dominantAt, 0, { text: dominantLine, lgOnly: true })
  const sep = (cls = '') => (
    <span aria-hidden="true" className={`mx-2 ${cls}`} style={{ color: 'var(--color-text-muted)' }}>·</span>
  )

  return (
    <div className="space-y-1.5">
      {vendor.rfc && (
        <div
          className="font-mono tabular-nums flex items-center gap-1.5"
          style={{
            fontSize: 12,
            letterSpacing: '0.04em',
            color: 'var(--color-text-secondary)',
          }}
        >
          <span style={{ color: 'var(--color-text-muted)' }}>RFC ·</span>
          <button
            type="button"
            onClick={copyRfc}
            className="inline-flex min-h-6 items-center gap-1 rounded-sm relative after:absolute after:inset-x-0 after:-inset-y-2.5 after:content-[''] hover:text-text-primary transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1"
            aria-label={lang === 'es' ? 'Copiar RFC' : 'Copy RFC'}
            title={lang === 'es' ? 'Copiar RFC' : 'Copy RFC'}
            style={{ background: 'none', border: 'none', padding: 0, color: 'inherit' }}
          >
            <span>{vendor.rfc}</span>
            {rfcCopied ? (
              <Check className="h-3 w-3" aria-hidden="true" />
            ) : (
              <Copy className="h-3 w-3 opacity-50" aria-hidden="true" />
            )}
          </button>
          {rfcCopied && (
            <span
              className="font-mono ml-1"
              style={{
                fontSize: 13,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                color: 'var(--color-accent-text)',
              }}
              role="status"
              aria-live="polite"
            >
              {lang === 'es' ? 'Copiado' : 'Copied'}
            </span>
          )}
        </div>
      )}
      {vendor.rfc && vendor.rfc_recovered_source && (
        <div className="font-mono" style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
          {vendor.rfc_recovered_source === 'rupc'
            ? lang === 'es' ? 'RFC recuperado del padrón RUPC.' : 'Tax ID recovered from the RUPC registry.'
            : lang === 'es'
              ? 'RFC recuperado de los registros fuente de CompraNet.'
              : 'Tax ID recovered from CompraNet source records.'}
        </div>
      )}
      {(vendor.merged_record_count ?? 1) > 1 && (
        <div className="font-mono" style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
          {lang === 'es'
            ? `Misma empresa — ${vendor.merged_record_count} registros de CompraNet unificados (mismo RFC o razón social idéntica).`
            : `Same company — ${vendor.merged_record_count} CompraNet records unified (identical tax ID or identical registered name).`}
        </div>
      )}
      {metaItems.length > 0 && (
        <div
          className="font-mono"
          style={{
            fontSize: 12,
            letterSpacing: '0.04em',
            color: 'var(--color-text-secondary)',
          }}
        >
          {metaItems.map((item, i) => {
            // Under lg the dominant name leaves the row; a separator is lg-only
            // when its own item is, or when the only item before it is.
            const lgOnlySep = item.lgOnly || (i === 1 && metaItems[0].lgOnly)
            return (
              <span key={i} className={item.lgOnly ? 'hidden lg:inline' : undefined}>
                {i > 0 && sep(lgOnlySep ? 'hidden lg:inline' : '')}
                <span className="whitespace-nowrap">{item.text}</span>
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}

/**
 * The lede — single paragraph in EB Garamond with a Playfair
 * drop cap on the first letter. Sector-accent left rule. The signature
 * editorial gesture of the hero.
 */
function Lede({ text, sectorAccent }: { text: string; sectorAccent: string }) {
  if (!text) return null
  const firstChar = text.charAt(0)
  const rest = text.slice(1)
  return (
    <div
      style={{
        borderLeft: `2px solid ${sectorAccent}`,
        paddingLeft: 20,
      }}
    >
      <p
        style={{
          fontFamily: 'var(--font-family-editorial)',
          fontStyle: 'normal',
          fontSize: 17,
          lineHeight: 1.55,
          color: 'var(--color-text-secondary)',
          letterSpacing: '0.005em',
          /* Hanging punctuation: ❡ pilcrow appears before drop cap as
             a quiet typographic flourish at low opacity. */
        }}
      >
        <span
          aria-hidden="true"
          style={{
            fontFamily: '"Playfair Display", Georgia, serif',
            fontStyle: 'normal',
            fontWeight: 800,
            fontSize: '3.5em',
            float: 'left',
            lineHeight: 0.85,
            color: sectorAccent,
            marginRight: '0.08em',
            marginTop: '0.05em',
            marginBottom: '-0.05em',
          }}
        >
          {firstChar}
        </span>
        {rest}
      </p>
    </div>
  )
}

/**
 * The "ON THE PAGE" TOC strip — foreshadowing anchor list. Hairline rules
 * flank the label; section names render in slim mono uppercase with
 * roman numerals (for narrative chapters) in sector accent.
 */
function OnThePageStrip({ sectorAccent, lang }: { sectorAccent: string; lang: 'en' | 'es' }) {
  return (
    <nav
      aria-label={lang === 'es' ? 'En esta página' : 'On this page'}
      className="mt-8"
    >
      {/* Label with flanking hairlines */}
      <div className="flex items-center justify-center gap-3 mb-3">
        <div
          aria-hidden="true"
          style={{ height: 1, width: 80, background: 'var(--color-border)' }}
        />
        <span
          className="font-mono"
          style={{
            fontSize: 12,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            color: 'var(--color-text-muted)',
            fontWeight: 500,
          }}
        >
          {lang === 'es' ? 'En esta página' : 'On this page'}
        </span>
        <div
          aria-hidden="true"
          style={{ height: 1, width: 80, background: 'var(--color-border)' }}
        />
      </div>

      {/* Anchor list */}
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5">
        {TOC_ANCHORS.map((a, i) => (
          <a
            key={a.id}
            href={`#${a.id}`}
            className="group font-mono inline-flex items-baseline gap-1.5 transition-colors"
            style={{
              fontSize: 13,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              color: 'var(--color-text-secondary)',
              textDecoration: 'none',
            }}
          >
            {i > 0 && (
              <span
                aria-hidden="true"
                className="-ml-1.5 mr-1"
                style={{ color: 'var(--color-text-muted)', opacity: 0.4 }}
              >
                ·
              </span>
            )}
            {a.numeral && (
              <span
                style={{
                  color: sectorAccent,
                  fontWeight: 700,
                  fontVariant: 'small-caps',
                }}
              >
                {a.numeral}.
              </span>
            )}
            <span
              className="group-hover:text-text-primary transition-colors"
              style={{
                borderBottom: '1px solid transparent',
                paddingBottom: 2,
              }}
            >
              {lang === 'es' ? a.es : a.en}
            </span>
          </a>
        ))}
      </div>

      {/* Closing hairline */}
      <div
        aria-hidden="true"
        className="mt-4"
        style={{ height: 1, background: 'var(--color-border)' }}
      />
    </nav>
  )
}

// ───────────────────────── helpers ──────────────────────────────────────────

/**
 * Split a Mexican vendor name into display name + legal form.
 * "GRUPO FARMACOS ESPECIALIZADOS, S.A. DE C.V." → { display, legal }.
 */
function splitNameAndLegalForm(raw: string): { displayName: string; legalForm: string | null } {
  if (!raw) return { displayName: raw, legalForm: null }
  // Match common Mexican corporate suffixes
  const patterns = [
    /,?\s*S\.?A\.?\s*DE\s*C\.?V\.?/i,
    /,?\s*S\.?\s*DE\s*R\.?L\.?\s*DE\s*C\.?V\.?/i,
    /,?\s*S\.?\s*DE\s*R\.?L\.?/i,
    /,?\s*S\.?A\.?P\.?I\.?\s*DE\s*C\.?V\.?/i,
    /,?\s*S\.?C\.?/i,
    /,?\s*A\.?C\.?/i,
    /,?\s*S\.?A\.?B\.?\s*DE\s*C\.?V\.?/i,
  ]
  for (const re of patterns) {
    const m = raw.match(re)
    if (m && m.index !== undefined && m.index > 4) {
      return {
        displayName: raw.slice(0, m.index).trim().replace(/,$/, '').trim(),
        legalForm: m[0].replace(/^,?\s*/, '').trim(),
      }
    }
  }
  return { displayName: raw, legalForm: null }
}

function localizeRiskLevel(level: 'critical' | 'high' | 'medium' | 'low', lang: 'en' | 'es'): string {
  if (lang !== 'es') return level.toUpperCase()
  return level === 'critical' ? 'CRÍTICO'
    : level === 'high' ? 'ALTO'
    : level === 'medium' ? 'MEDIO'
    : 'BAJO'
}

/**
 * Build the lede paragraph — single sentence, data-driven. Picks the
 * strongest frame from the vendor's data. Same template philosophy as
 * the Z3 pull-line: name the finding, don't recite the dashboard.
 */
export function buildVendorLede(
  vendor: VendorDetailResponse,
  { lang, isGroundTruth }: { lang: 'en' | 'es'; isGroundTruth: boolean },
): string {
  // Lede prose uses the full editorial name — no compact-UI truncation.
  // Split off the legal form first so the lede reads naturally.
  const { displayName: ledeDisplay } = splitNameAndLegalForm(vendor.name)
  const name = formatVendorName(ledeDisplay, 300)
  const spend = formatCompactMXN(vendor.total_value_mxn)
  // USD aside only in English (Spanish reads MXN natively — CLAUDE.md currency convention)
  const usdNote = lang === 'en' ? ` (≈${formatCompactUSD(vendor.total_value_mxn)})` : ''
  const contracts = formatNumber(vendor.total_contracts)
  const da = Math.round(vendor.direct_award_pct ?? 0)
  const hr = Math.round(vendor.high_risk_pct ?? 0)
  const span = vendor.first_contract_year && vendor.last_contract_year
    ? (vendor.last_contract_year - vendor.first_contract_year + 1)
    : (vendor.years_active ?? 0)
  const topInst = vendor.top_institutions?.[0]
  const topName = topInst?.institution_name
    ? formatEntityName('institution', topInst.institution_name, 'full')
    : null
  const sectorName = vendor.primary_sector_name ? getSectorName(vendor.primary_sector_name.toLowerCase(), lang) : null
  const dominant = topInst && vendor.total_value_mxn > 0
    ? (topInst.total_amount_mxn / vendor.total_value_mxn) * 100
    : 0

  // Plurals: "1 contract", "active 1 year", "1 institution" (and ES twins).
  const nC = vendor.total_contracts ?? 0, nI = vendor.total_institutions ?? 0
  const contractsEn = plural(nC, 'contract', 'contracts'), contractsEs = plural(nC, 'contrato', 'contratos')
  const yearsEn = plural(span, 'year', 'years'), yearsEs = plural(span, 'año', 'años')
  const instEn = plural(nI, 'institution', 'institutions'), instEs = plural(nI, 'institución', 'instituciones')

  // Frame 1: GT-confirmed + dominant client
  if (isGroundTruth && dominant >= 35 && topName) {
    return lang === 'en'
      ? `${name} received ${spend}${usdNote} from ${topName} over ${span} ${yearsEn} across ${contracts} ${contractsEn}. ${da}% were direct-award; ${hr}% flagged high or critical by the risk model. Named in a documented case.`
      : `${name} recibió ${spend}${usdNote} de ${topName} a lo largo de ${span} ${yearsEs} en ${contracts} ${contractsEs}. ${da}% fueron adjudicación directa; ${hr}% marcados alto o crítico por el modelo de riesgo. Consta en un caso documentado.`
  }
  // Frame 2: GT-confirmed, no single dominant client
  if (isGroundTruth) {
    return lang === 'en'
      ? `${name} holds ${contracts} ${contractsEn} worth ${spend}${usdNote} across ${formatNumber(vendor.total_institutions)} ${instEn}. ${da}% were direct-award; ${hr}% flagged high or critical. Named in a documented case.`
      : `${name} tiene ${contracts} ${contractsEs} por ${spend}${usdNote} con ${formatNumber(vendor.total_institutions)} ${instEs}. ${da}% fueron adjudicación directa; ${hr}% marcados alto o crítico. Consta en un caso documentado.`
  }
  // Frame 3: High HR%, no GT
  if (hr >= 80) {
    return lang === 'en'
      ? `${name} holds ${contracts} ${contractsEn} worth ${spend}${usdNote} — ${hr}% of them flagged high or critical by the risk model. ${da}% awarded without an open bid.${topName && dominant >= 35 ? ` ${topName} accounts for ${Math.round(dominant)}% of the total.` : ''}`
      : `${name} tiene ${contracts} ${contractsEs} por ${spend}${usdNote} — ${hr}% marcados alto o crítico por el modelo. ${da}% otorgados sin licitación pública.${topName && dominant >= 35 ? ` ${topName} representa el ${Math.round(dominant)}% del total.` : ''}`
  }
  // Frame 4: Dominant client, moderate risk
  if (dominant >= 50 && topName) {
    return lang === 'en'
      ? `${name} earned ${spend}${usdNote} across ${contracts} ${contractsEn} over ${span} ${yearsEn} — ${Math.round(dominant)}% from ${topName} alone.`
      : `${name} ganó ${spend}${usdNote} en ${contracts} ${contractsEs} a lo largo de ${span} ${yearsEs} — el ${Math.round(dominant)}% solo de ${topName}.`
  }
  // Frame 5: Standard
  return lang === 'en'
    ? `${name} is a ${sectorName ?? 'public-procurement'} supplier active ${span} ${yearsEn}, with ${contracts} ${contractsEn} worth ${spend}${usdNote} across ${formatNumber(vendor.total_institutions)} ${instEn}.`
    : `${name} es un proveedor del sector ${sectorName ?? 'público'} activo durante ${span} ${yearsEs}, con ${contracts} ${contractsEs} por ${spend}${usdNote} en ${formatNumber(vendor.total_institutions)} ${instEs}.`
}
