/**
 * MoonLedger — sky-dive (2026-10-21) at the vendor level: the key to the satellites, the «Vínculos» switch
 * (threads stay off the chart until asked for, or until the pointer rests on the supplier), and a short ledger
 * of its largest contracts. Linked hover (L1): a row rings its moon on the chart and a hovered moon lights its
 * row; a click opens the contract card in place (L3). Risk as number + level word, never a ruler.
 */
import type { CSSProperties } from 'react'
import { getRiskLevelFromScore, RISK_COLORS } from '@/lib/constants'
import { formatEntityName } from '@/lib/entity/format'
import { formatCompactMXN, formatNumber } from '@/lib/utils'
import { skyCopy } from '@/lib/atlas/sky/copy'
import type { Moon } from '@/lib/atlas/sky/use-vendor-contracts'
import type { MoonSet } from './SkyEngine'

const MONO = 'var(--font-family-archival)'
const SERIF = 'var(--font-family-editorial)'
const sc: CSSProperties = { fontFamily: 'var(--font-sc)', fontWeight: 600, fontSize: 13, letterSpacing: 'var(--track-sc)', color: 'var(--color-text-muted)' }
const ROWS = 6

interface Props {
  moons: MoonSet | null
  lang: 'en' | 'es'
  hovered: number | null
  onHover: (id: number | null) => void
  onOpen: (id: number) => void
  /** desktop only: the threads switch (the phone disc draws no threads) */
  links?: boolean
  onLinks?: () => void
  /** the buyer's short name (siglas on the chart, else the whole name) */
  buyer: (m: Moon) => string
  /** sky-dive layers (desktop): moon distance = amount | risk, and the post-blackout «Apagón» moons */
  moonLens?: 0 | 1
  onMoonLens?: (l: 0 | 1) => void
  apagon?: { n: number; value: number; withheld: boolean } | null
  apagonOn?: boolean
  onApagon?: () => void
  /** badges line: the supplier's new signals by name (from /senales/vendor), EFOS / SFP */
  badges?: string[]
}

/** The glyphs exactly as the engine draws them (2.5 px moon, 3.5 px dashed review ring, ochre single-bid tick). */
function Glyph({ kind }: { kind: 'da' | 'comp' | 'sb' | 'rev' }) {
  const ink = 'var(--color-text-primary)'
  return (
    <svg width="14" height="12" viewBox="0 0 14 12" aria-hidden="true" style={{ flexShrink: 0 }}>
      {kind === 'da' && <circle cx="6" cy="6" r="3" fill={ink} />}
      {kind === 'comp' && <circle cx="6" cy="6" r="3" fill="none" stroke={ink} strokeWidth="1.25" />}
      {kind === 'sb' && <><circle cx="5" cy="6" r="3" fill="none" stroke={ink} strokeWidth="1.25" /><path d="M9 6h4" stroke="var(--color-accent)" strokeWidth="1.5" /></>}
      {kind === 'rev' && <circle cx="6" cy="6" r="4" fill="none" stroke={ink} strokeWidth="1.25" strokeDasharray="2 2" />}
    </svg>
  )
}

const seg = (on: boolean): CSSProperties => ({
  ...sc, minHeight: 32, padding: '0 10px', cursor: 'pointer', border: '1px solid var(--color-text-primary)', margin: '0 -1px -1px 0',
  background: on ? 'var(--color-text-primary)' : 'var(--color-background)', color: on ? 'var(--color-background)' : 'var(--color-text-primary)',
})

export function MoonLedger({ moons, lang, hovered, onHover, onOpen, links, onLinks, buyer, moonLens = 0, onMoonLens, apagon, apagonOn, onApagon, badges }: Props) {
  const loc = lang === 'en' ? 'en-US' : 'es-MX'
  const rows = moons ? [...moons.moons].sort((a, b) => b.amount - a.amount).slice(0, ROWS) : []
  const key = (k: 'da' | 'comp' | 'sb' | 'rev', label: string) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}><Glyph kind={k} />{label}</span>
  )
  return (
    <section style={{ padding: '10px 16px 8px', borderBottom: '1px solid var(--color-border)' }} aria-label={skyCopy('ledgerTitle', lang)}>
      {badges && badges.length > 0 && (
        <div style={{ fontFamily: MONO, fontSize: 13, lineHeight: 1.45, color: 'var(--color-text-primary)', marginBottom: 6 }}>
          <span style={{ ...sc, marginRight: 6 }}>{skyCopy('badgeSignals', lang)}</span>{badges.join(' · ')}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={sc}>{skyCopy('ledgerTitle', lang)}</span>
        {onLinks && <button type="button" aria-pressed={!!links} onClick={onLinks} title={skyCopy('linksHint', lang)} style={{ ...seg(!!links), marginLeft: 'auto' }}>
          {skyCopy('linksBtn', lang)}
        </button>}
      </div>
      {onMoonLens && (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 0, marginTop: 6 }}>
          <span style={{ ...sc, marginRight: 8 }}>{skyCopy('moonLensLabel', lang)}</span>
          <span role="group" aria-label={skyCopy('moonLensLabel', lang)} style={{ display: 'inline-flex' }}>
            {skyCopy('moonLensNames', lang).split(' · ').map((n, k) => (
              <button key={n} type="button" aria-pressed={moonLens === k} onClick={() => onMoonLens(k as 0 | 1)} style={seg(moonLens === k)}>{n}</button>
            ))}
          </span>
          {apagon && apagon.n > 0 && onApagon && (
            <button type="button" aria-pressed={!!apagonOn} onClick={onApagon} style={{ ...seg(!!apagonOn), marginLeft: 8 }}>
              {skyCopy('apagonBtn', lang, { n: apagon.n.toLocaleString(loc) })}
            </button>
          )}
        </div>
      )}
      {apagon && apagon.n > 0 && (
        <p style={{ fontFamily: MONO, fontSize: 12, lineHeight: 1.4, margin: '4px 0 0', color: 'var(--color-text-secondary)' }}>
          {apagon.withheld ? skyCopy('apagonWithheld', lang) : skyCopy('apagonHint', lang, { n: apagon.n.toLocaleString(loc), v: formatCompactMXN(apagon.value) })}
        </p>
      )}
      <p style={{ fontFamily: MONO, fontSize: 12, lineHeight: 1.4, margin: '4px 0 0', color: 'var(--color-text-secondary)' }}>{moonLens ? skyCopy('moonLensHint', lang) : skyCopy('moonKey', lang)}</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 10px', fontFamily: MONO, fontSize: 12, lineHeight: 1.5, color: 'var(--color-text-secondary)', marginTop: 2 }}>
        {key('da', skyCopy('moonKeyDa', lang))}
        {key('comp', skyCopy('moonKeyComp', lang))}
        {key('sb', skyCopy('moonKeySb', lang))}
        {key('rev', skyCopy('moonKeyRev', lang))}
        <span>{skyCopy('moonKeyOther', lang)}</span>
      </div>
      {!moons ? (
        <div style={{ ...sc, marginTop: 6 }}>{skyCopy('loadingSystem', lang)}</div>
      ) : (
        <>
          <ol style={{ listStyle: 'none', margin: '6px 0 0', padding: 0 }} onMouseLeave={() => onHover(null)}>
            {rows.map((m) => {
              const lv = m.riskScore != null ? getRiskLevelFromScore(m.riskScore) : null
              const on = hovered === m.id
              return (
                <li key={m.id}>
                  <button type="button" onClick={() => onOpen(m.id)} onMouseEnter={() => onHover(m.id)} onFocus={() => onHover(m.id)} onBlur={() => onHover(null)}
                    style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '0 8px', width: '100%', textAlign: 'left', cursor: 'pointer', border: 'none',
                      borderTop: '1px solid var(--color-border)', padding: '4px 4px', background: on ? 'var(--color-background-elevated)' : 'transparent',
                      boxShadow: on ? 'inset 2px 0 0 var(--color-text-primary)' : 'none', transition: 'background-color 80ms' }}>
                    <span style={{ fontFamily: SERIF, fontSize: 14, lineHeight: 1.25, color: 'var(--color-text-primary)', minWidth: 0 }}
                      title={formatEntityName('institution', m.institutionName, 'full')}>
                      {buyer(m) || '—'}
                    </span>
                    <span style={{ fontFamily: MONO, fontSize: 13, color: 'var(--color-text-primary)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', textAlign: 'right' }}>
                      {formatCompactMXN(m.amount)}
                    </span>
                    <span style={{ fontFamily: MONO, fontSize: 12, color: 'var(--color-text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                      {m.date.slice(0, 7)} · {m.da ? skyCopy('moonKeyDa', lang) : skyCopy('moonKeyComp', lang)}{m.sb ? ` · ${skyCopy('moonKeySb', lang)}` : ''}
                    </span>
                    <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 600, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', textAlign: 'right',
                      color: !lv || lv === 'low' ? 'var(--color-text-muted)' : RISK_COLORS[lv] }}>
                      {lv ? `${m.riskScore!.toFixed(2)} · ${skyCopy(`risk_${lv}`, lang)}` : '—'}
                    </span>
                  </button>
                </li>
              )
            })}
          </ol>
          {moons.total != null && (
            <div style={{ fontFamily: MONO, fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4 }}>
              {skyCopy('ledgerMore', lang, { n: formatNumber(moons.moons.length), N: moons.total.toLocaleString(loc) })}
            </div>
          )}
        </>
      )}
    </section>
  )
}
