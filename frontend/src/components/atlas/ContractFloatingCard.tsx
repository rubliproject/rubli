/**
 * ContractFloatingCard — «Ficha del contrato / Contract card», Z3 «La Luna».
 * Spec .claude/designs/atlas-2026-10-02-spec.md §3.5 (c) (ICIJ / Linkurious expand-in-place).
 *
 * Resurrected from `0134c659^` (the pre-sky Atlas P6 card), never the local copy, and
 * amended: it replaces the dock body at Z3; names are whole (`formatEntityName`, the old
 * `formatVendorName(v.name, 22)` is gone); «Volar a esta institución» is a plain fly
 * button whose target is the canonical star from the manifest map (F13); «Otros
 * proveedores aquí» comes from that star's prefetched system payload and flies (F10);
 * the one exit is the full contract at the foot; a > 10 B or suspect-decimal amount
 * shows its «por revisar» state. Upright type only, 12 px floor.
 * sky-dive (2026-10-21): a compact specimen — amount (formatCompactMXN) as the figure, then date · buyer chip ·
 * procedure · indicator as number + level word on four rows; small caps instead of tracked uppercase.
 */
import type { CSSProperties, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { FileText } from 'lucide-react'
import { getRiskLevelFromScore, RISK_COLORS } from '@/lib/constants'
import { formatEntityName } from '@/lib/entity/format'
import { formatCompactMXN } from '@/lib/utils'
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import { skyCopy } from '@/lib/atlas/sky/copy'
import type { Moon } from '@/lib/atlas/sky/use-vendor-contracts'
import type { SkyContractSignals } from '@/lib/atlas/sky/useSky'
import { FONT_MONO, FONT_SERIF } from './sky/SkyLabels'

/** A supplier at the contract's institution — retyped locally (the old hook is gone). */
export interface RelatedVendor { vendor_id: number; name: string; share: number }

interface Props {
  moon: Moon
  lang: 'en' | 'es'
  /** the buyer's canonical star, when it is on the chart */
  starName: string | null
  onFlyInst: (() => void) | null
  /** null while the star's system is loading */
  related: RelatedVendor[] | null
  onFlyVendor: (vendorId: number) => void
  onClose: () => void
  /** sky-dive: the contract's same-day lot, when it is one of its pieces */
  lot?: { n: number; sum: number } | null
  /** sky-dive round 2: GET /atlas/sky/contract-signals — antes del fallo · plazo reducido (readings, not offences) */
  signals?: SkyContractSignals | null
}

const kicker: CSSProperties = {
  fontFamily: 'var(--font-sc)', fontWeight: 600, fontSize: 13, letterSpacing: 'var(--track-sc)', color: 'var(--color-text-muted)',
}
const flyBtn: CSSProperties = {
  display: 'flex', width: '100%', gap: 8, alignItems: 'baseline', textAlign: 'left', background: 'transparent',
  border: 'none', borderBottom: '1px solid var(--color-border)', padding: '5px 0', cursor: 'pointer',
  fontFamily: FONT_SERIF, fontSize: 14, lineHeight: 1.25, color: 'var(--color-text-primary)',
}

function formatDate(iso: string, lang: 'en' | 'es'): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(lang === 'es' ? 'es-MX' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' })
}

export function ContractFloatingCard({ moon, lang, starName, onFlyInst, related, onFlyVendor, onClose, lot, signals }: Props) {
  const level = moon.riskScore != null ? getRiskLevelFromScore(moon.riskScore) : null
  const riskColor = level ? RISK_COLORS[level] : 'var(--color-text-muted)'
  const institution = moon.institutionName ? formatEntityName('institution', moon.institutionName, 'full') : '—'
  const loc = lang === 'en' ? 'en-US' : 'es-MX'
  const pct = (v: number) => (v * 100).toLocaleString(loc, { maximumFractionDigits: v < 0.01 ? 2 : 1 })
  const row = (label: string, value: ReactNode) => (
    <>
      <dt style={{ ...kicker, paddingTop: 2 }}>{label}</dt>
      <dd style={{ margin: 0, fontFamily: FONT_SERIF, fontSize: 14, lineHeight: 1.3, color: 'var(--color-text-primary)', minWidth: 0 }}>{value}</dd>
    </>
  )

  return (
    <div
      role="region"
      aria-label={`${skyCopy('contractCard', lang)} ${moon.id}`}
      style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--color-background-card)' }}
    >
      <div style={{ padding: '12px 16px 10px', borderBottom: '1px solid var(--color-border)', borderTop: `2px solid ${riskColor}` }}>
        <div className="flex items-start justify-between gap-2">
          <div style={kicker}>
            <span style={{ color: 'var(--color-accent)', fontWeight: 600 }}>{skyCopy('contractCard', lang)}</span> · #{moon.id}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={skyCopy('close', lang)}
            style={{ ...kicker, fontSize: 14, letterSpacing: 0, background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' }}
          >
            ×
          </button>
        </div>
        <div style={{ fontFamily: FONT_SERIF, fontWeight: 600, fontSize: 20, lineHeight: 1.1, margin: '4px 0 0', fontVariantNumeric: 'tabular-nums', color: 'var(--color-text-primary)' }}>
          {formatCompactMXN(moon.amount)}
        </div>
        <h2 style={{ fontFamily: FONT_SERIF, fontWeight: 500, fontStyle: 'normal', fontSize: 15, lineHeight: 1.3, margin: '2px 0 0', color: 'var(--color-text-primary)' }}>
          {moon.title || skyCopy('untitled', lang)}
        </h2>
      </div>

      <div style={{ padding: '10px 16px', overflowY: 'auto', flex: 1, minHeight: 0 }}>
        {moon.review && (
          <div style={{ fontFamily: FONT_MONO, fontSize: 12, color: 'var(--color-text-muted)', border: '1px dashed var(--color-border)', padding: '4px 6px', marginBottom: 8 }}>
            {skyCopy(moon.suspect ? 'reviewDecimal' : 'reviewOver', lang)}
          </div>
        )}
        <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px', margin: 0, alignItems: 'baseline' }}>
          {row(skyCopy('date', lang), formatDate(moon.date, lang))}
          {row(skyCopy('institution', lang), moon.inst != null
            ? <EntityIdentityChip type="institution" id={moon.inst} name={moon.institutionName} size="sm" fullName />
            : institution)}
          {row(skyCopy('procedure', lang), `${moon.procedure ? moon.procedure.charAt(0) + moon.procedure.slice(1).toLowerCase() : moon.da ? skyCopy('directAward', lang) : skyCopy('competitive', lang)}${moon.sb ? ` · ${skyCopy('singleBid', lang)}` : ''}`)}
          {row(skyCopy('riskIndicator', lang), level
            ? <span style={{ fontFamily: FONT_MONO, fontSize: 13, fontWeight: 700, color: level === 'low' ? 'var(--color-text-muted)' : riskColor, fontVariantNumeric: 'tabular-nums' }}>{moon.riskScore!.toFixed(2)} · {skyCopy(`risk_${level}`, lang)}</span>
            : '—')}
        </dl>

        {signals && (signals.antes_del_fallo || signals.plazo_reducido) && (
          <div style={{ marginTop: 10 }}>
            <div style={kicker}>{skyCopy('sigLabel', lang)}</div>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, fontFamily: FONT_MONO, fontSize: 13, lineHeight: 1.45, color: 'var(--color-text-primary)', fontVariantNumeric: 'tabular-nums' }}>
              {signals.antes_del_fallo && <li>{skyCopy('sigAntes', lang, { d: signals.antes_del_fallo.days })}</li>}
              {signals.plazo_reducido && <li>{skyCopy('sigPlazo', lang, { d: signals.plazo_reducido.days, m: signals.plazo_reducido.minimum })}</li>}
            </ul>
            <div style={{ fontFamily: FONT_MONO, fontSize: 12, lineHeight: 1.4, color: 'var(--color-text-muted)' }}>{skyCopy('sigNote', lang)}</div>
          </div>
        )}
        {lot && lot.n > 1 && (
          <p style={{ fontFamily: FONT_MONO, fontSize: 13, lineHeight: 1.45, margin: '10px 0 0', color: 'var(--color-text-primary)' }}>
            {skyCopy('lotLine', lang, { n: lot.n, v: formatCompactMXN(lot.sum) })}
          </p>
        )}
        {onFlyInst ? (
          <button
            type="button"
            onClick={onFlyInst}
            style={{ ...kicker, marginTop: 12, minHeight: 32, color: 'var(--color-text-primary)', background: 'transparent', border: '1px solid var(--color-text-primary)', padding: '4px 10px', cursor: 'pointer', textAlign: 'left' }}
          >
            {skyCopy('flyInst', lang)} › <span style={{ fontFamily: FONT_SERIF, fontWeight: 500, fontSize: 14 }}>{starName}</span>
          </button>
        ) : (
          <p style={{ fontFamily: FONT_MONO, fontSize: 12, color: 'var(--color-text-muted)', marginTop: 12 }}>{skyCopy('notStar', lang)}</p>
        )}

        {onFlyInst && (
          <>
            <div style={{ ...kicker, marginTop: 14 }}>{skyCopy('related', lang)}</div>
            {related == null ? (
              <div style={{ ...kicker, marginTop: 6 }}>{skyCopy('loadingSystem', lang)}</div>
            ) : (
              <div>
                {related.map((v) => (
                  <button key={v.vendor_id} type="button" style={flyBtn} onClick={() => onFlyVendor(v.vendor_id)}>
                    <span style={{ flex: 1 }}>{formatEntityName('vendor', v.name, 'full')}</span>
                    <span style={{ fontFamily: FONT_MONO, fontSize: 13, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
                      {pct(v.share)}%
                    </span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <div style={{ padding: '10px 16px', borderTop: '1px solid var(--color-border)' }}>
        {/* The hand-off. EntityIdentityChip has no contract type (and X10/X11 forbid editing it), so this
            plain link wears the chip's visual class — icon, hover wash, focus outline — to read as one. */}
        <Link
          to={`/contracts/${moon.id}`}
          className="inline-flex items-center gap-1.5 rounded-sm px-1.5 h-7 transition-colors hover:bg-background-elevated/60 focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-1"
          style={{ fontFamily: 'var(--font-sc)', fontSize: 14, letterSpacing: 'var(--track-sc)', fontWeight: 600, color: 'var(--color-text-primary)' }}
        >
          <FileText className="h-3.5 w-3.5 flex-shrink-0 text-text-muted" aria-hidden="true" />
          {skyCopy('openContract', lang)} · {formatCompactMXN(moon.amount)} ↗
        </Link>
      </div>
    </div>
  )
}
