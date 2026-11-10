/**
 * SkyLegend — legend + magnitude key. Spec .claude/designs/atlas-2026-10-02-spec.md §3.7
 * (graft G2c from «Uranometría»; Tirion / Uranometria plate conventions).
 * Rows follow the §2.7 channel table (arbitrary rows bold); the magnitude key draws discs
 * at their TRUE screen radii from the same geometry.ts formulas the engine draws with;
 * «escala log» shows on the closed button too (verdict i); the «fórmula» fold prints
 * §2.3 and §2.5 verbatim; the basis line is built from the manifest.
 */
import { Fragment, useState, type CSSProperties } from 'react'
import { RISK_COLORS } from '@/lib/constants'
import { formatCompactMXN } from '@/lib/utils'
import { SKY_CHANNELS, SKY_STATUS, skyCopy } from '@/lib/atlas/sky/copy'
import { planetPx, starPx, type SkyManifest } from '@/lib/atlas/sky/geometry'
import { FONT_MONO, FONT_SERIF } from './SkyLabels'

const FORMULA = `§2.3  punto del proveedor (Z1) · ancla = principal comprador canónico
host(v)  = argmax_i v_iv                     (empates → menor institution_id)
s        = v_iv / V_i                        ∈ (0, 1]; Σ_v s ≤ 1 por dependencia
u        = clamp(−log10(s) / 5, 0, 1)        100% → 0 · 1% → .4 · ≤ 0.001% → 1
r        = R_core + u·(R_sys − R_core)       R_core = 0.12·R_sys
θ(t)     = −π/2 + 2π·(t − 2001)/26           horario desde las 12, 2001.0 → 2027.0
θ_p      = θ(first_year + (slot + 0.5)/n_slots)
r★       = clamp(2 + 2.25·log10(V/1e7), 2, 11) px
r_p      = 3.5 + 1.25·clamp(log10(v_iv/1e7), 0, 4) px
d        = v_iv / total del proveedor   → sólido si d ≥ 0.5

§2.5  punto del contrato (Z2)
R_m = 4 unidades de mundo
φ   = θ(fecha del contrato)
ℓ   = R_m·(0.25 + 0.75·clamp((log10(monto) − 4)/6, 0, 1))   10 K → dentro · 10 B → fuera
> 10 B o decimal sospechoso → hueca punteada «por revisar»; monto ≤ 0 se omite y se cuenta`

const kicker: CSSProperties = {
  fontFamily: 'var(--font-sc)', fontWeight: 600, fontSize: 12, letterSpacing: 'var(--track-sc)', color: 'var(--color-text-muted)',
}
const ink = 'var(--color-text-primary)'

function Disc({ r, fill = true, color = ink }: { r: number; fill?: boolean; color?: string }) {
  const s = Math.ceil(2 * r + 4)
  return (
    <svg width={s} height={s} aria-hidden="true" style={{ display: 'block' }}>
      <circle cx={s / 2} cy={s / 2} r={r} style={fill ? { fill: color } : { fill: 'none', stroke: color, strokeWidth: 1.25 }} />
    </svg>
  )
}

/** `sheet` (§4 phone): the legend opens as a bottom sheet behind a «≡» button instead of a popover. */
export function SkyLegend({ manifest, lang, cut, sheet = false }: { manifest: SkyManifest; lang: 'en' | 'es'; cut: string; sheet?: boolean }) {
  const [open, setOpen] = useState(false)
  const basis = /v[\d.]+/.exec(manifest.risk_basis)?.[0] ?? manifest.risk_basis
  const starKey = [1e8, 1e9, 1e10, 1e11, 1e12]
  const planetKey = [1e7, 1e8, 1e9, 1e10]
  const key = (vals: number[], px: (v: number) => number, plus: boolean) => (
    <div className="flex items-end gap-3" style={{ marginTop: 4 }}>
      {vals.map((v, n) => (
        <div key={v} className="flex flex-col items-center gap-1">
          <Disc r={px(v)} />
          <span style={{ ...kicker, letterSpacing: 0, textTransform: 'none' }}>{formatCompactMXN(v)}{plus && n === vals.length - 1 ? '+' : ''}</span>
        </div>
      ))}
    </div>
  )

  return (
    <div style={{ pointerEvents: 'auto' }}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="at-btn"
      >
        {sheet ? `≡ ${skyCopy('legendOpen', lang)}` : `${skyCopy('legend', lang)} ${open ? '▴' : '▾'}`}
      </button>
      {open && (
        <div
          role="region"
          aria-label={skyCopy('legend', lang)}
          style={sheet
            ? { position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 60, maxHeight: '80dvh', overflowY: 'auto', padding: '12px 16px 24px', background: 'var(--color-background-card)', borderTop: '1px solid var(--color-border)' }
            : { position: 'absolute', top: '100%', right: 0, zIndex: 8, marginTop: 4, width: 380, maxHeight: 'calc(100dvh - 380px)', minHeight: 240, overflowY: 'auto', padding: '10px 14px', background: 'var(--color-background-card)', border: '1px solid var(--color-border)' }}
        >
          {sheet && (
            <div className="flex justify-end">
              <button type="button" aria-label={skyCopy('close', lang)} onClick={() => setOpen(false)} style={{ fontFamily: FONT_MONO, fontSize: 16, minWidth: 44, minHeight: 44, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}>×</button>
            </div>
          )}
          <p style={{ fontFamily: FONT_MONO, fontSize: 12, lineHeight: 1.45, margin: 0, color: 'var(--color-text-secondary)' }}>
            {skyCopy('basisLine', lang, { basis, cut })}
          </p>

          <div style={{ ...kicker, marginTop: 12 }}>{skyCopy('magStars', lang)}</div>
          {key(starKey, starPx, false)}
          <div style={{ ...kicker, marginTop: 10 }}>{skyCopy('magPlanets', lang)}</div>
          {key(planetKey, (v) => planetPx(Math.min(Math.max(Math.log10(v / 1e7), 0), 4) * 63.75), true)}
          <div style={{ fontFamily: FONT_MONO, fontSize: 12, fontWeight: 600, marginTop: 6, color: 'var(--color-text-primary)' }}>{skyCopy('magnitude', lang)}</div>

          <div style={{ ...kicker, marginTop: 12 }}>{skyCopy('glyphs', lang)}</div>
          <div className="grid gap-x-3 gap-y-1" style={{ gridTemplateColumns: 'auto 1fr', marginTop: 4, fontFamily: FONT_SERIF, fontSize: 13, alignItems: 'center' }}>
            {(['critical', 'high', 'medium', 'low'] as const).map((l) => (
              <Fragment key={l}><Disc r={4} color={l === 'critical' || l === 'high' ? RISK_COLORS.critical : l === 'medium' ? 'var(--color-text-muted)' : RISK_COLORS.low} /><span>{skyCopy('riskIndicator', lang)} · {skyCopy(`risk_${l}`, lang)}</span></Fragment>
            ))}
            <Disc r={4} /><span>{lang === 'en' ? 'solid: ≥ 50% of its income from this agency' : 'sólido: ≥ 50% de su ingreso viene de esta dependencia'}</span>
            <Disc r={4} fill={false} /><span>{lang === 'en' ? 'hollow: < 50%' : 'hueco: < 50%'}</span>
            <Disc r={6.5} fill={false} color="var(--color-accent)" /><span>{skyCopy('documented', lang)}</span>
            <Disc r={9} fill={false} /><span>{skyCopy('group', lang)}</span>
            <svg width={18} height={18} aria-hidden="true"><path d="M9 2 L16 9 L9 16 L2 9 Z" style={{ fill: 'none', stroke: ink, strokeWidth: 0.75 }} /></svg><span>{skyCopy('efos', lang)}</span>
            <svg width={18} height={18} aria-hidden="true"><path d="M6 9 H12 M9 6 V12" style={{ stroke: ink, strokeWidth: 1.25 }} /></svg><span>{skyCopy('sfp', lang)}</span>
          </div>

          <div style={{ ...kicker, marginTop: 12 }}>{skyCopy('channels', lang)}</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 4, fontFamily: FONT_SERIF, fontSize: 13 }}>
            <tbody>
              {SKY_CHANNELS.map((c) => {
                const arb = c.status === 'arbitrary'
                return (
                  <tr key={c.en} style={{ borderBottom: '1px solid var(--color-border)', fontWeight: arb ? 700 : 400 }}>
                    <td style={{ padding: '3px 6px 3px 0', color: 'var(--color-text-primary)' }}>{lang === 'en' ? c.en : c.es}</td>
                    <td style={{ padding: '3px 6px', fontFamily: FONT_MONO, fontSize: 12, color: 'var(--color-text-muted)' }}>{c.field}</td>
                    <td style={{ padding: '3px 0', fontFamily: FONT_MONO, fontSize: 12, color: arb ? 'var(--color-text-primary)' : 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                      {SKY_STATUS[c.status][lang]}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <ul style={{ fontFamily: FONT_MONO, fontSize: 12, lineHeight: 1.5, margin: '8px 0 0', paddingLeft: 14, color: 'var(--color-text-secondary)' }}>
            <li><b>{skyCopy('nearRow', lang)}</b></li>
            <li>{skyCopy('nearShare', lang)}</li>
            <li>{skyCopy('rimRow', lang)}</li>
            <li><b>{skyCopy('withinYear', lang)}</b></li>
            <li>{skyCopy('arcRow', lang)}</li>
            <li>{skyCopy('remainder', lang)}</li>
            <li>{skyCopy('nebulaRow', lang)}</li>
            <li>{skyCopy('periodRow', lang)}</li>
            <li>{skyCopy('lassoRow', lang)}</li>
          </ul>

          <details style={{ marginTop: 10 }}>
            <summary style={{ ...kicker, cursor: 'pointer' }}>{skyCopy('formula', lang)}</summary>
            <pre style={{ fontFamily: FONT_MONO, fontSize: 12, lineHeight: 1.45, whiteSpace: 'pre-wrap', margin: '6px 0 0', color: 'var(--color-text-secondary)' }}>{FORMULA}</pre>
          </details>
        </div>
      )}
    </div>
  )
}
