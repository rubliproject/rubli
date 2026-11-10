/**
 * StarDock — «Ficha de la estrella / Star brief». Spec .claude/designs/atlas-2026-10-02-spec.md
 * §3.5 (a) (ICIJ / Linkurious expand-in-place). Everything comes from the system endpoint
 * (top-5 + «Otros proveedores aquí» already through ranking_safe(), capture belts through
 * capture_pair_excluded()). In-sky hops are plain fly buttons (F10); the only
 * EntityIdentityChip is the end-of-chain «Ver dossier de la institución».
 */
import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import { formatEntityName } from '@/lib/entity/format'
import { formatDualCurrency, formatNumber } from '@/lib/utils'
import { SECTORS } from '@/lib/constants'
import { skyCopy } from '@/lib/atlas/sky/copy'
import { withheldLabel } from '@/lib/atlas/sky/catalog'
import type { SkyManifest, SkySystem } from '@/lib/atlas/sky/geometry'
import type { SkyLayers } from '@/lib/atlas/sky/useSky'
import { getRiskLevelFromScore } from '@/lib/constants'
import type { SkyOverlay } from './SkyEngine'
import { FONT_MONO, FONT_SERIF } from './SkyLabels'

interface Props {
  manifest: SkyManifest
  star: number
  system: SkySystem | null
  lang: 'en' | 'es'
  onFlyBody: (vendorId: number) => void
  /** instruments §3.5: «Otros proveedores aquí» is one line that opens the catalog */
  onCatalog: () => void
  /** sky-dive L1: a row rings its planet on the chart */
  onHover?: (vendorId: number | null) => void
  /** sky-dive data layers: the agency's own lines + the overlay switch (one layer at a time on the chart) */
  layers?: SkyLayers | null
  overlay?: SkyOverlay
  onOverlay?: (o: SkyOverlay) => void
  /** drawn bodies hosted here with ARIA tier 1 (counted from planets.bin) */
  /** round 2: vendor ids among the largest whose names were dropped for lack of space (named on hover; listed here) */
  unlabeled?: number[]
}
const OVERLAYS: SkyOverlay[] = [null, 'captura', 'pareja', 'mismo_dia', 'senal']

const kicker: CSSProperties = {
  fontFamily: 'var(--font-sc)', fontWeight: 600, fontSize: 13, letterSpacing: 'var(--track-sc)', color: 'var(--color-text-muted)',
}
const flyBtn: CSSProperties = {
  display: 'flex', width: '100%', gap: 8, alignItems: 'baseline', textAlign: 'left', background: 'transparent',
  border: 'none', borderBottom: '1px solid var(--color-border)', padding: '5px 0', cursor: 'pointer',
  fontFamily: FONT_SERIF, fontSize: 14, lineHeight: 1.25, color: 'var(--color-text-primary)',
}

export function StarDock({ manifest, star, system, lang, onFlyBody, onCatalog, onHover, layers, overlay = null, onOverlay, unlabeled = [] }: Props) {
  const S = manifest.stars
  const id = S.id[star]
  const loc = lang === 'en' ? 'en-US' : 'es-MX'
  const pct = (v: number, d = 1) => (v * 100).toLocaleString(loc, { maximumFractionDigits: d })
  const name = formatEntityName('institution', S.name[star], 'full')
  const sector = SECTORS.find((s) => s.id === S.sector[star])
  const sys = system && system.star.id === id ? system : null
  const rows = new Map((sys?.bodies ?? []).map((b) => [b.vendor_id, b]))
  const ranked = (sys?.ranked ?? []).map((v) => rows.get(v)!).filter(Boolean)
  const vname = (n: string) => formatEntityName('vendor', n, 'full')

  const row = (v: number) => {
    const b = rows.get(v)!
    return (
      <button key={v} type="button" style={flyBtn} onClick={() => onFlyBody(v)} title={skyCopy('levelZ2', lang)}
        onMouseEnter={() => onHover?.(v)} onMouseLeave={() => onHover?.(null)} onFocus={() => onHover?.(v)} onBlur={() => onHover?.(null)}>
        <span style={{ flex: 1 }}>{vname(b.name)}</span>
        <span style={{ fontFamily: FONT_MONO, fontSize: 13, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
          {pct(b.share, b.share < 0.01 ? 2 : 1)}%
        </span>
      </button>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--color-background-card)' }}>
      <div style={{ padding: '12px 16px 10px', borderBottom: '1px solid var(--color-border)', borderTop: '2px solid var(--color-accent)' }}>
        <div style={kicker}>
          <span style={{ color: 'var(--color-accent)', fontWeight: 600 }}>{skyCopy('starBrief', lang)}</span>
        </div>
        <h2 style={{ fontFamily: FONT_SERIF, fontWeight: 600, fontStyle: 'normal', fontSize: 19, lineHeight: 1.2, margin: '4px 0 2px' }}>{name}</h2>
        <div style={{ fontFamily: FONT_MONO, fontSize: 13, color: 'var(--color-text-muted)' }}>
          {S.siglas[star] ? `${S.siglas[star]} · ` : ''}{sector ? (lang === 'en' ? sector.nameEN : sector.name) : ''}
        </div>
        {/* owner 11-07: the way into the agency's own page sits at the top of the card, not only in the foot */}
        <Link to={`/institutions/${id}`} className="hover:underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          style={{ display: 'inline-flex', alignItems: 'center', minHeight: 32, marginTop: 2, fontFamily: FONT_MONO, fontSize: 13, fontWeight: 700, color: 'var(--color-accent-text)' }}>
          {skyCopy('openPage', lang)}
        </Link>
      </div>
      <div style={{ padding: '10px 16px', overflowY: 'auto', flex: 1, minHeight: 0 }}>
        {/* the two figures on one baseline (owner 2026-10-27: the brief was too dense) */}
        <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: '0 10px' }}>
          <span style={{ fontFamily: FONT_SERIF, fontSize: 20, fontWeight: 600, color: 'var(--color-text-primary)', fontVariantNumeric: 'tabular-nums' }}>{formatDualCurrency(S.v[star])}</span>
          <span style={{ fontFamily: FONT_MONO, fontSize: 13, color: 'var(--color-text-secondary)' }}>{formatNumber(S.nv[star])} {skyCopy('suppliers', lang)}</span>
        </div>
        <p style={{ fontFamily: FONT_SERIF, fontSize: 14, lineHeight: 1.4, margin: '8px 0 0', color: 'var(--color-text-secondary)' }}>
          {skyCopy('haloBasis', lang, { x: pct(S.h[star]), basis: /v[\d.]+/.exec(manifest.risk_basis)?.[0] ?? manifest.risk_basis })}
        </p>
        {layers && (() => {
          // sky-dive: the agency's own layers — number + word, never a ruler; a grade is not a risk reading (no red)
          const st = layers.stars, g = st.grade[star], a = st.avg[star]
          const lv = a != null ? getRiskLevelFromScore(a) : null
          return (
            <div style={{ fontFamily: FONT_MONO, fontSize: 13, lineHeight: 1.5, marginTop: 6, color: 'var(--color-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
              {a != null && lv && <div>{skyCopy('avgLine', lang, { x: a.toFixed(2), w: skyCopy(`risk_${lv}`, lang) })}</div>}
              <div style={{ color: 'var(--color-text-primary)' }}>
                {g != null
                  ? skyCopy('gradeLine', lang, { g: g.toLocaleString(loc, { minimumFractionDigits: 1, maximumFractionDigits: 1 }), w: skyCopy(g >= 6 ? 'gradePass' : 'gradeFail', lang) })
                  : skyCopy('gradeNone', lang)}
              </div>
              {st.da[star] != null && <div>{skyCopy('shareLine', lang, { da: pct((st.da[star] ?? 0) / 100), sb: pct((st.sb[star] ?? 0) / 100) })}</div>}
              {/* 2026-11-04 clarity: the internal counters (nivel 1 · captura · parejas · mismo día) left the brief —
                  the «Capa» row below draws them; only the plain «still signing» fact stays */}
              {st.post[star] > 0 && <div>{skyCopy('starLayers', lang, { post: formatNumber(st.post[star]) })}</div>}
            </div>
          )
        })()}
        {layers && onOverlay && (
          // 2026-11-04 (owner: the «Capa» layers «never showed anything»): folded behind «más capas»; open while one is on
          <details style={{ marginTop: 10 }}>
            <summary style={{ ...kicker, cursor: 'pointer', minHeight: 32, display: 'flex', alignItems: 'center' }}>
              {skyCopy('overlayMore', lang)}{overlay != null && overlay !== OVERLAYS[0] ? ` · ${skyCopy('overlayNames', lang).split(' · ')[OVERLAYS.indexOf(overlay)]}` : ''}
            </summary>
            <div role="group" aria-label={skyCopy('overlayLabel', lang)} style={{ display: 'flex', marginTop: 2 }}>
              {skyCopy('overlayNames', lang).split(' · ').map((n, k) => (
                <button key={n} type="button" aria-pressed={overlay === OVERLAYS[k]} onClick={() => onOverlay(OVERLAYS[k])}
                  style={{ ...kicker, flex: '1 1 auto', minHeight: 32, padding: '0 4px', whiteSpace: 'nowrap', cursor: 'pointer', border: '1px solid var(--color-text-primary)', margin: '0 -1px -1px 0',
                    background: overlay === OVERLAYS[k] ? 'var(--color-text-primary)' : 'var(--color-background)', color: overlay === OVERLAYS[k] ? 'var(--color-background)' : 'var(--color-text-primary)' }}>
                  {n}
                </button>
              ))}
            </div>
            {overlay != null && overlay !== OVERLAYS[0] && (
              <p style={{ fontFamily: FONT_MONO, fontSize: 12, lineHeight: 1.4, margin: '4px 0 0', color: 'var(--color-text-muted)' }}>{skyCopy('overlayHints', lang)}</p>
            )}
          </details>
        )}

        {!sys ? (
          <div style={{ ...kicker, marginTop: 14 }}>{skyCopy('loadingSystem', lang)}</div>
        ) : (
          <>
            <div style={{ ...kicker, marginTop: 14 }}>{skyCopy('topShare', lang)}</div>
            <div>{ranked.slice(0, 5).map((b) => row(b.vendor_id))}</div>
            {unlabeled.some((v) => rows.has(v)) && (
              <p style={{ fontFamily: FONT_MONO, fontSize: 12, lineHeight: 1.45, margin: '4px 0 0', color: 'var(--color-text-muted)' }}>
                {skyCopy('unlabeled', lang, { n: unlabeled.filter((v) => rows.has(v)).length })}{' '}
                {unlabeled.filter((v) => rows.has(v)).map((v, k) => (
                  <span key={v}>{k > 0 && ' · '}
                    <button type="button" onClick={() => onFlyBody(v)} onMouseEnter={() => onHover?.(v)} onMouseLeave={() => onHover?.(null)} onFocus={() => onHover?.(v)} onBlur={() => onHover?.(null)}
                      style={{ fontFamily: FONT_SERIF, fontSize: 14, textAlign: 'left', color: 'var(--color-text-primary)', background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' }}>
                      {rows.get(v)!.name ? vname(rows.get(v)!.name) : withheldLabel(v, lang)}
                    </button>
                  </span>
                ))}
              </p>
            )}
            {sys.capture.length > 0 && (
              <>
                <div style={{ ...kicker, marginTop: 14, color: 'var(--color-accent)' }}>{skyCopy('captureList', lang)}</div>
                <div>
                  {sys.capture.map((v) => {
                    const b = rows.get(v)
                    if (!b) return null
                    return (
                      <button key={v} type="button" style={flyBtn} onClick={() => onFlyBody(v)}>
                        <span style={{ flex: 1 }}>{vname(b.name)}</span>
                        <span style={{ fontFamily: FONT_MONO, fontSize: 13, color: 'var(--color-accent)', whiteSpace: 'nowrap' }}>
                          {pct(b.share)}% · {b.first_year}–{b.last_year}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </>
            )}
            {sys.bodies.length > 5 && (
              <button type="button" onClick={onCatalog} style={{ ...flyBtn, ...kicker, marginTop: 14, minHeight: 32, color: 'var(--color-accent)' }}>
                {skyCopy('catOpen', lang, { n: formatNumber(sys.bodies.length) })}
              </button>
            )}
          </>
        )}
      </div>
      <div style={{ padding: '10px 16px', borderTop: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={kicker}>
          {skyCopy('dossierInst', lang)}
        </span>
        <EntityIdentityChip type="institution" id={id} name={S.name[star]} sectorCode={sector?.code} size="sm" fullName />
        {sector && <EntityIdentityChip type="sector" id={sector.id} name={lang === 'en' ? sector.nameEN : sector.name} sectorCode={sector.code} size="sm" />}
      </div>
    </div>
  )
}
