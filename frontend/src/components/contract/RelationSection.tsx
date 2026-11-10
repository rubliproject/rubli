/**
 * RelationSection — §2 LA RELACIÓN, the time-ribbon centerpiece (P5).
 *
 * Replaces ContractCotejo as the §2 body. Two modes:
 *   - Relationship mode: the vendor↔institution pair register is hoisted to
 *     fetch ON MOUNT (not behind a disclosure) and feeds RelationRibbon — the
 *     plate itself is the primary body now. The register table (RegisterRow,
 *     lifted verbatim from ContractCotejo) is demoted to a collapsed
 *     disclosure below the plate.
 *   - Size-only fallback: RatioBullet (lifted verbatim) + a single prose line,
 *     used when the pair has <=1 contract or party ids are missing.
 *
 * Spec: contract-el-cotejo-fable-2026-07-02-spec.md §2.3 · §5-P5.
 */
import type { CSSProperties } from 'react'
import { useQuery } from '@tanstack/react-query'
import { contractApi } from '@/api/client'
import type { ContractContextResponse, ContractDetail } from '@/api/types'
import { formatCompactMXN } from '@/lib/utils'
import { formatEntityName } from '@/lib/entity/format'
import { RISK_COLORS } from '@/lib/constants'
import { PairLedger } from '@/components/contract/PairLedger'

const CRIMSON = RISK_COLORS.critical
const REF_ZINC = RISK_COLORS.low

// ── Section title/meta helper — page reads this to build DossierSectionHeader ──
export interface RelationSectionMeta {
  mode: 'relationship' | 'fallback' | 'none'
  eyebrow: { es: string; en: string }
  title: { es: string; en: string }
  meta: { es: string; en: string } | null
}

// ── SizeTrack — the no-pair exhibit (D12b § Change 4e): a log track from the
// sector MEDIAN to its 99th percentile with the contract as a mark, so the
// plate says where the contract sits even when it is below p99. ────────────

const fmtMult = (m: number) => (m >= 100 ? `×${Math.round(m)}` : m >= 10 ? `×${m.toFixed(0)}` : `×${m.toFixed(1)}`)

function SizeTrack({
  amount,
  p50,
  p99,
  sectorName,
  sectorAccent,
  lang,
}: {
  amount: number
  p50: number | null
  p99: number
  sectorName: string
  sectorAccent: string
  lang: 'en' | 'es'
}) {
  const isEs = lang === 'es'
  const above = amount >= p99
  const med = p50 != null && p50 > 0 && p50 < p99 ? p50 : null
  // Log domain with a little air on both sides of the extremes.
  const lo = Math.min(med ?? p99 / 100, amount) / 1.6
  const hi = Math.max(p99, amount) * 1.6
  const pos = (v: number) => ((Math.log10(v) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo))) * 100
  const xAmt = pos(Math.max(amount, lo))
  const xP99 = pos(p99)
  const xMed = med != null ? pos(med) : null
  const readout = above
    ? (isEs ? `${fmtMult(amount / p99)} el p99` : `${fmtMult(amount / p99)} the p99`)
    : med != null
      ? (amount >= med
          ? (isEs ? `${fmtMult(amount / med)} la mediana` : `${fmtMult(amount / med)} the median`)
          : (isEs ? `${fmtMult(med / amount)} bajo la mediana` : `${fmtMult(med / amount)} below the median`))
      : (isEs ? `${fmtMult(p99 / amount)} bajo el p99` : `${fmtMult(p99 / amount)} below the p99`)
  const markColor = above ? CRIMSON : sectorAccent
  const tickLabel: CSSProperties = { fontSize: 12, color: REF_ZINC, letterSpacing: '0.04em', whiteSpace: 'nowrap' }

  return (
    <figure data-size-track>
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <span
          className="font-mono"
          style={{ fontSize: 12, letterSpacing: '0', color: 'var(--color-text-muted)' }}
        >
          {isEs ? `Tamaño en el sector ${sectorName}` : `Size within ${sectorName}`}
        </span>
        <span
          className="tabular-nums"
          style={{
            fontFamily: 'var(--font-serif)',
            fontStyle: 'normal',
            fontWeight: 600,
            fontSize: 22,
            lineHeight: 1,
            color: above ? CRIMSON : 'var(--color-text-primary)',
          }}
        >
          {readout}
        </span>
      </div>
      {/* Track: hairline over the whole log domain, a heavier segment from
          the median to p99, the contract as a vertical mark. */}
      <div className="relative" style={{ height: 30 }} aria-hidden="true">
        <div className="absolute inset-x-0" style={{ top: 14, height: 1, background: 'var(--color-border)' }} />
        {xMed != null && (
          <div className="absolute" style={{ top: 12, height: 5, left: `${xMed}%`, width: `${xP99 - xMed}%`, background: REF_ZINC, opacity: 0.35 }} />
        )}
        {xMed != null && <div className="absolute" style={{ top: 8, height: 13, width: 1, left: `${xMed}%`, background: REF_ZINC }} />}
        <div className="absolute" style={{ top: 8, height: 13, width: 1, left: `${xP99}%`, background: REF_ZINC }} />
        <div data-size-mark className="absolute" style={{ top: 2, height: 26, width: 3, left: `calc(${xAmt}% - 1.5px)`, background: markColor }} />
      </div>
      <div className="relative font-mono tabular-nums" style={{ height: 18 }}>
        {xMed != null && (
          <span className="absolute" style={{ ...tickLabel, left: `${xMed}%` }}>
            {isEs ? 'mediana' : 'median'} {formatCompactMXN(med as number)}
          </span>
        )}
        <span className="absolute" style={{ ...tickLabel, left: `${xP99}%`, transform: 'translateX(-100%)' }}>
          p99 {formatCompactMXN(p99)}
        </span>
      </div>
      <figcaption className="mt-2 font-mono" style={{ fontSize: 12, color: 'var(--color-text-muted)', letterSpacing: '0.04em' }}>
        {isEs ? 'Este contrato' : 'This contract'} · {formatCompactMXN(amount)}
        {' · '}
        {above
          ? (isEs ? 'sobre el percentil 99 del sector' : 'above the sector 99th percentile')
          : (isEs ? 'bajo el percentil 99 del sector' : 'below the sector 99th percentile')}
        {' · '}
        {isEs ? 'escala logarítmica' : 'log scale'}
      </figcaption>
    </figure>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function RelationSection({
  context,
  contract,
  sectorName,
  sectorAccent,
  lang,
}: {
  context: ContractContextResponse | undefined
  contract: ContractDetail
  sectorName: string
  sectorAccent: string
  lang: 'en' | 'es'
}) {
  const isEs = lang === 'es'

  const vendorName = formatEntityName('vendor', contract.vendor_name, 'full') || (isEs ? 'el proveedor' : 'the vendor')
  const instName = formatEntityName('institution', contract.institution_name, 'full') || (isEs ? 'la institución' : 'the institution')
  // Spanish 'y' becomes 'e' only before an /i/ sound (Instituto, Hidalgo…), not before PEMEX.
  const yE = /^h?[ií]/i.test(instName) ? 'e' : 'y'

  const pair = context?.pair
  const pairCount = pair?.total_contracts ?? 0
  const pairRank = pair?.this_rank ?? null
  const pairTied = (pair?.tied ?? 0) > 0
  const vendorRank = context?.vendor_rank ?? null
  const vendorTotal = context?.vendor_total_contracts ?? 0
  const p99 = context?.sector_p99_mxn ?? null
  const p50 = context?.sector_p50_mxn ?? null
  const sizeVsP99 = context?.size_vs_p99 ?? null

  const isRelationship = pairCount > 1 && !!contract.vendor_id && !!contract.institution_id
  const hasBullet = p99 != null && sizeVsP99 != null

  // Hoisted on-mount register fetch (relationship mode only) — same indexed
  // query the old disclosure fired, now the plate's primary data source.
  const { data: register, isLoading: registerLoading } = useQuery({
    queryKey: ['contract-relation', contract.vendor_id, contract.institution_id, 'pair'],
    queryFn: () =>
      contractApi.getAll({
        vendor_id: contract.vendor_id ?? undefined,
        institution_id: contract.institution_id ?? undefined,
        per_page: 100,
        sort_by: 'amount_mxn',
        sort_order: 'desc',
      }),
    enabled: isRelationship,
    staleTime: 10 * 60 * 1000,
  })

  const rows = register?.data ?? []

  // ── Rank prose (verbatim, becomes the plate caption) ───────────────────────
  const rankProse = (() => {
    if (!pair || pairCount === 0) return null
    const parts: string[] = []
    if (pairRank === 1) {
      parts.push(
        isEs
          ? `${pairTied ? 'Empatado como el mayor' : 'El mayor'} de los ${pairCount.toLocaleString('es-MX')} contratos entre ${vendorName} ${yE} ${instName}`
          : `${pairTied ? 'Tied for largest' : 'The largest'} of the ${pairCount.toLocaleString('en-US')} contracts between ${vendorName} and ${instName}`,
      )
    } else if (pairRank != null) {
      parts.push(
        isEs
          ? `${pairTied ? 'Empatado en el No.' : 'No.'} ${pairRank.toLocaleString('es-MX')} por monto de los ${pairCount.toLocaleString('es-MX')} contratos entre ${vendorName} ${yE} ${instName}`
          : `${pairTied ? 'Tied at No.' : 'No.'} ${pairRank.toLocaleString('en-US')} by value of the ${pairCount.toLocaleString('en-US')} contracts between ${vendorName} and ${instName}`,
      )
    }
    if (pair.total_amount_mxn > 0 && pair.first_year) {
      parts.push(
        isEs
          ? `${formatCompactMXN(pair.total_amount_mxn)} desde ${pair.first_year}`
          : `${formatCompactMXN(pair.total_amount_mxn)} since ${pair.first_year}`,
      )
    }
    let prose = parts.join(' — ') + '.'
    if (vendorRank === 1 && vendorTotal > 0) {
      prose += isEs
        ? ` Y ${pairTied ? 'empatado como ' : ''}el mayor de los ${vendorTotal.toLocaleString('es-MX')} contratos de su historia.`
        : ` And ${pairTied ? 'tied for ' : ''}the largest of its ${vendorTotal.toLocaleString('en-US')} contracts on record.`
    }
    // Honesty clause — the register endpoint returns top-100 by amount only.
    if (pairCount > 100) {
      prose += isEs ? ` · mostrando los 100 mayores de ${pairCount.toLocaleString('es-MX')}` : ` · showing the 100 largest of ${pairCount.toLocaleString('en-US')}`
    }
    // Below-p99 clause — appended when the gridline can't be drawn (all values under p99).
    if (p99 != null) {
      const maxAmount = Math.max(contract.amount_mxn ?? 0, ...rows.map((r) => r.amount_mxn ?? 0), 1)
      if (p99 > maxAmount) {
        prose += isEs ? ' · todos bajo el p99 del sector' : ' · all below the sector p99'
      }
    }
    return prose
  })()

  // Context entirely absent → render nothing.
  if (!context) return null

  if (isRelationship) {
    if (registerLoading) {
      return (
        <div
          className="relative animate-pulse"
          style={{
            height: 220,
            padding: '12px 0 0',
            borderTop: '1px solid var(--color-text-primary)',
            
          }}
        >
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 12, // the loaded PairLedger kicker's size; 9.5 was under the 10px floor (weekend D3)
              letterSpacing: '0',
              color: 'var(--color-accent-text)',
              fontStyle: 'normal',
              fontWeight: 500,
            }}
          >
            {isEs ? 'La relación' : 'The relationship'}
          </div>
          <div className="mt-4 h-32 bg-border/20 rounded-sm" />
        </div>
      )
    }

    return (
      <PairLedger
        rows={rows}
        subject={contract}
        pair={context.pair}
        p99={p99}
        sizeVsP99={sizeVsP99}
        sectorAccent={sectorAccent}
        sectorName={sectorName}
        captionProse={rankProse ?? ''}
        lang={lang}
      />
    )
  }

  // ── Size-only fallback mode ─────────────────────────────────────────────
  if (hasBullet) {
    const showSingleLine = !!contract.vendor_id && !!contract.institution_id
    return (
      <div className="space-y-4">
        <SizeTrack amount={contract.amount_mxn ?? 0} p50={p50} p99={p99!} sectorName={sectorName} sectorAccent={sectorAccent} lang={lang} />
        {showSingleLine && (
          <p
            style={{
              fontFamily: 'var(--font-serif)',
              fontStyle: 'normal',
              fontSize: 15,
              lineHeight: 1.55,
              color: 'var(--color-text-secondary)',
              borderLeft: `2px solid ${sectorAccent}`,
              paddingLeft: 16,
            }}
          >
            {isEs
              ? `El único contrato registrado entre ${vendorName} ${yE} ${instName}.`
              : `The only recorded contract between ${vendorName} and ${instName}.`}
          </p>
        )}
      </div>
    )
  }

  return null
}
