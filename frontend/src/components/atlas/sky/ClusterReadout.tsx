/**
 * ClusterReadout — sky-dive (2026-10-21) L2 at the cluster level: the framed sector's own figures in one
 * compact panel over the canvas (top right, where the dock opens one level down). Numbers + level words, no
 * rulers (DESIGN.md §3 «La cifra»). The arrangement row moved above the canvas (SkyArrange, 2026-11-04); a buyer row
 * rings its star on hover (L1) and flies on click (F10: in-sky hops are plain buttons; the sector dossier is the one chip).
 */
import { useState, type CSSProperties } from 'react'
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import { formatEntityName } from '@/lib/entity/format'
import { formatCompactMXN, formatNumber } from '@/lib/utils'
import { RISK_COLORS, SECTORS, MAPA_SECTOR_COLORS as SECTOR_COLORS } from '@/lib/constants'
import { skyCopy } from '@/lib/atlas/sky/copy'
import type { SkyBodies, SkyManifest } from '@/lib/atlas/sky/geometry'
import type { SkyLayers } from '@/lib/atlas/sky/useSky'

const SERIF = 'var(--font-family-editorial)'
const MONO = 'var(--font-family-archival)'
const sc: CSSProperties = { fontFamily: 'var(--font-sc)', fontWeight: 600, fontSize: 13, letterSpacing: 'var(--track-sc)', color: 'var(--color-text-muted)' }
const LEVELS = [['critical', 3], ['high', 2], ['medium', 1], ['low', 0]] as const

interface Props {
  manifest: SkyManifest
  bodies: SkyBodies | null
  sector: number
  lang: 'en' | 'es'
  onFlyStar: (idx: number) => void
  onHoverStar: (idx: number | null) => void
  /** sky-dive data layers (null until fetched): grade mix, sigue firmando, captura, T1 */
  layers?: SkyLayers | null
  /** round 2: star indices whose names were dropped for lack of space (named on hover; counted here) */
  unlabeled?: number[]
  /** owner 11-06 «both lenses»: «Sectores» — the sector's hue, no red, no star-fill key (the stars keep the hue) */
  hues?: boolean
}

export function ClusterReadout({ manifest, bodies, sector, lang, onFlyStar, onHoverStar, layers, unlabeled = [], hues = false }: Props) {
  const [more, setMore] = useState(false)
  const g = manifest.sectors.find((s) => s.id === sector)
  if (!g) return null
  const S = manifest.stars
  const loc = lang === 'en' ? 'en-US' : 'es-MX'
  const meta = SECTORS.find((s) => s.id === sector)
  let v = 0, hv = 0
  const top: number[] = []
  for (let i = 0; i < S.id.length; i++) {
    if (S.sector[i] !== sector) continue
    v += S.v[i]; hv += S.h[i] * S.v[i]
    if (top.length < 5) top.push(i) // stars are sorted by V desc
  }
  const mix = [0, 0, 0, 0]
  let drawn = 0
  if (bodies) for (let i = 0; i < bodies.n; i++) if (S.sector[bodies.hostIdx[i]] === sector) { mix[bodies.risk[i]]++; drawn++ }
  const pct = (x: number) => (x * 100).toLocaleString(loc, { maximumFractionDigits: 1 })
  // round 2: never scrolls at 1440×900 — the figures as a 2-col label · number table, the key as one glyph line.
  // 2026-11-04 clarity: the internal counters (ARIA nivel 1 · aprobadas/reprobadas · siguen firmando · con captura)
  // left the panel — the 2-second test; the risk mix and the money share answer the page question
  const cells: [string, string, string?][] = [
    ...LEVELS.map(([lv, c]): [string, string, string] => [skyCopy(`risk_${lv}`, lang), formatNumber(mix[c]), !hues && (lv === 'critical' || lv === 'high') ? RISK_COLORS.critical : 'var(--color-text-muted)']),
  ]
  const shown = top.slice(0, more ? 5 : 3)

  return (
    <section aria-label={`${skyCopy('clusterKicker', lang)} ${lang === 'en' ? g.name_en : g.name_es}`}
      style={{ background: 'var(--color-background)', border: '1px solid var(--color-text-primary)', padding: '8px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span aria-hidden="true" style={{ width: 10, height: 10, flexShrink: 0, background: hues ? SECTOR_COLORS[meta?.code ?? 'otros'] ?? SECTOR_COLORS.otros : 'var(--color-text-muted)' }} />
        <h2 style={{ fontFamily: SERIF, fontWeight: 600, fontSize: 17, lineHeight: 1.2, margin: 0, color: 'var(--color-text-primary)' }}>
          {lang === 'en' ? g.name_en : g.name_es}
        </h2>
        <span style={{ fontFamily: SERIF, fontWeight: 600, fontSize: 17, lineHeight: 1.2, marginLeft: 'auto', fontVariantNumeric: 'tabular-nums', color: 'var(--color-text-primary)', whiteSpace: 'nowrap' }}>
          {formatCompactMXN(v)}
        </span>
      </div>
      <div style={{ fontFamily: MONO, fontSize: 13, lineHeight: 1.45, color: 'var(--color-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
        {skyCopy('clusterLine', lang, { n: formatNumber(g.n_stars), v: formatNumber(drawn) })}
      </div>
      <p style={{ fontFamily: SERIF, fontSize: 14, lineHeight: 1.35, margin: '2px 0', color: 'var(--color-text-primary)' }}>{skyCopy('roHigh', lang, { x: pct(v ? hv / v : 0) })}</p>
      <p style={{ fontFamily: MONO, fontSize: 12, lineHeight: 1.4, margin: 0, color: 'var(--color-text-muted)' }}>{skyCopy('clusterBasis', lang)}</p>

      <dl style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr) auto', gap: '0 8px', margin: '4px 0 0', fontSize: 13, lineHeight: 1.4, fontVariantNumeric: 'tabular-nums' }}>
        {cells.map(([k, n, c], j) => (
          <div key={k} style={{ display: 'contents' }}>
            <dt style={{ fontFamily: SERIF, color: c ?? 'var(--color-text-secondary)', paddingLeft: j % 2 ? 8 : 0, borderLeft: j % 2 ? '1px solid var(--color-border)' : undefined, whiteSpace: 'nowrap' }}>{k}</dt>
            <dd style={{ margin: 0, fontFamily: MONO, textAlign: 'right', whiteSpace: 'nowrap', color: c ?? 'var(--color-text-primary)' }}>{n}</dd>
          </div>
        ))}
      </dl>
      {layers && !hues && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2, fontFamily: MONO, fontSize: 12, lineHeight: 1.4, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
          <span aria-hidden="true" style={{ display: 'inline-flex', gap: 2, flexShrink: 0 }}>
            {[...LEVELS].reverse().map(([lv]) => <span key={lv} style={{ width: 8, height: 8, borderRadius: '50%', background: lv === 'critical' || lv === 'high' ? RISK_COLORS.critical : 'var(--color-text-muted)' }} />)}
          </span>
          {skyCopy('roKeyFill', lang)} ·
          <span aria-hidden="true" style={{ width: 9, height: 9, flexShrink: 0, borderRadius: '50%', border: '1px solid var(--color-text-primary)' }} />
          {skyCopy('roKeyRing', lang)}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'baseline', marginTop: 6 }}>
        <span style={sc}>{skyCopy('clusterTop', lang)}</span>
        {top.length > 3 && (
          <button type="button" onClick={() => setMore((x) => !x)} aria-expanded={more}
            style={{ marginLeft: 'auto', fontFamily: MONO, fontSize: 12, color: 'var(--color-accent-data)', background: 'transparent', border: 'none', padding: '0 0 0 8px', cursor: 'pointer' }}>
            {skyCopy('topMore', lang, { n: more ? 3 : top.length })}
          </button>
        )}
      </div>
      <ol style={{ listStyle: 'none', margin: 0, padding: 0 }} onMouseLeave={() => onHoverStar(null)}>
        {shown.map((i) => (
          <li key={i}>
            <button type="button" onClick={() => onFlyStar(i)} onMouseEnter={() => onHoverStar(i)} onFocus={() => onHoverStar(i)} onBlur={() => onHoverStar(null)}
              style={{ display: 'flex', width: '100%', gap: 8, alignItems: 'baseline', textAlign: 'left', background: 'transparent', border: 'none', borderTop: '1px solid var(--color-border)', padding: '3px 0', cursor: 'pointer', fontFamily: SERIF, fontSize: 14, lineHeight: 1.25, color: 'var(--color-text-primary)' }}>
              <span style={{ flex: 1, minWidth: 0 }} title={formatEntityName('institution', S.name[i], 'full')}>{S.siglas[i] || formatEntityName('institution', S.name[i], 'full')}</span>
              <span style={{ fontFamily: MONO, fontSize: 13, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                {formatCompactMXN(S.v[i])} · {pct(S.h[i])}%
              </span>
            </button>
          </li>
        ))}
      </ol>
      {unlabeled.length > 0 && (
        // one line, so the panel (which the labels avoid) keeps its height; the names are on hover over the dots
        <p title={unlabeled.map((i) => formatEntityName('institution', S.name[i], 'full')).join(' · ')}
          style={{ fontFamily: MONO, fontSize: 12, lineHeight: 1.4, margin: '2px 0 0', color: 'var(--color-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden' }}>
          {skyCopy('unlabeledN', lang, { n: unlabeled.length })}
        </p>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0 8px', marginTop: 4 }}>
        {meta && <EntityIdentityChip type="sector" id={meta.id} name={lang === 'en' ? meta.nameEN : meta.name} sectorCode={meta.code} size="sm" />}
        <span style={{ fontFamily: MONO, fontSize: 12, color: 'var(--color-text-muted)' }}>{skyCopy('clusterHint', lang)}</span>
      </div>
    </section>
  )
}
