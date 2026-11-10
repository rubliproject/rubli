/**
 * AtlasSheet — the parts of /atlas (Vínculos) that sit on «El Contrato» around the sky
 * (DESIGN.md §5, §8): the CLÁUSULAS row and the Anexos (Recorridos · Teclas · Colofón).
 * Every figure comes from the sky manifest / planets.bin (`atlas_sky_meta`); a missing one prints «—».
 */
import type { ReactNode } from 'react'
import { Clause } from '@/components/contrato/Clause'
import { RISK_COLORS } from '@/lib/constants'
import { formatNumber } from '@/lib/utils'
import { ATLAS_STORIES } from '@/lib/atlas-stories'
import { SKY_KEYS, skyCopy, type SkyCopyKey } from '@/lib/atlas/sky/copy'
import { N_YEARS, YEAR0, type SkyBodies, type SkyManifest } from '@/lib/atlas/sky/geometry'

/** Some colophon lines are set in capitals at the source; the sheet prints them in sentence case. */
const sentence = (s: string, lang: 'en' | 'es') => {
  if (s !== s.toLocaleUpperCase()) return s
  const l = s.toLocaleLowerCase(lang === 'en' ? 'en-US' : 'es-MX')
  return l.charAt(0).toLocaleUpperCase() + l.slice(1)
}

export function AtlasClauses({ manifest, bodies, lang }: { manifest: SkyManifest | null; bodies: SkyBodies | null; lang: 'en' | 'es' }) {
  const en = lang === 'en'
  const loc = en ? 'en-US' : 'es-MX'
  const doc = en ? 'The Map › Connections' : 'El Mapa › Vínculos'
  const b = manifest?.basis
  // the years the sky carries money: first and last non-zero year_value
  const yv = manifest?.meta?.year_value
  const y0 = yv ? yv.findIndex((v) => v > 0) : -1
  const y1 = yv ? N_YEARS - 1 - [...yv].reverse().findIndex((v) => v > 0) : -1
  const span = y0 >= 0 && y1 >= y0 ? `${YEAR0 + y0} – ${YEAR0 + y1}` : undefined
  let crit: number | null = null
  if (bodies && bodies.n) {
    let c = 0
    for (let i = 0; i < bodies.n; i++) if (bodies.risk[i] === 3) c++
    crit = (c / bodies.n) * 100
  }
  const rem = b ? b.remainder_share * 100 : null
  const pct = (n: number) => n.toLocaleString(loc, { maximumFractionDigits: 1, minimumFractionDigits: 1 })
  const nStars = b ? formatNumber(b.n_stars) : '—'
  const nDrawn = b ? formatNumber(b.n_drawn) : '—'
  const nSky = b ? formatNumber(b.n_sky) : '—'
  return (
    <section className="ct-clauses at-clauses" aria-labelledby="at-cl-h">
      <h2 id="at-cl-h">{en ? 'Clauses' : 'Cláusulas'}</h2>
      <div className="ct-cl-grid">
        <Clause
          id="at-cl-primera" ordinal={en ? 'First' : 'Primera'} title={en ? 'Of the agencies' : 'De las dependencias'}
          fig={nStars}
          count={b ? { value: b.n_stars, format: (n) => formatNumber(Math.round(n)) } : null}
          dim={span}
          note={en ? 'each one a circle, its area sized by its spend' : 'cada una es un círculo; su área, del tamaño de su gasto'}
          cite={en ? `Agencies on the map: ${nStars}` : `Dependencias en el mapa: ${nStars}`}
          doc={doc}
        />
        <Clause
          id="at-cl-segunda" ordinal={en ? 'Second' : 'Segunda'} title={en ? 'Of the suppliers drawn' : 'De los proveedores dibujados'}
          fig={nDrawn}
          count={b ? { value: b.n_drawn, format: (n) => formatNumber(Math.round(n)) } : null}
          ruler={{ value: b && b.n_sky ? b.n_drawn / b.n_sky : 0, mode: 'fill', ends: ['0', en ? 'eligible' : 'elegibles', nSky] }}
          note={en ? 'up to 60 per agency, by spend there' : 'hasta 60 por dependencia, según su gasto ahí'}
          cite={en ? `Suppliers drawn: ${nDrawn} of ${nSky}` : `Proveedores dibujados: ${nDrawn} de ${nSky}`}
          doc={doc}
        />
        <Clause
          id="at-cl-tercera" ordinal={en ? 'Third' : 'Tercera'} title={en ? 'Of critical risk' : 'Del riesgo crítico'}
          fig={crit != null ? pct(crit) : '—'}
          count={crit != null ? { value: crit, format: pct } : null}
          unit="%" critical
          ruler={{ value: (crit ?? 0) / 100, mode: 'fill', color: RISK_COLORS.critical, ends: ['0', en ? 'indicator ≥ 0.60' : 'indicador ≥ 0.60', '100'] }}
          note={en ? 'of the suppliers drawn' : 'de los proveedores dibujados'}
          cite={en
            ? `Suppliers drawn with a critical risk indicator (≥ 0.60): ${crit != null ? pct(crit) : '—'}%`
            : `Proveedores dibujados con indicador de riesgo crítico (≥ 0.60): ${crit != null ? pct(crit) : '—'}%`}
          doc={doc}
        />
        <Clause
          id="at-cl-cuarta" ordinal={en ? 'Fourth' : 'Cuarta'} title={en ? 'Of the spend not drawn' : 'Del gasto no dibujado'}
          fig={rem != null ? pct(rem) : '—'}
          count={rem != null ? { value: rem, format: pct } : null}
          unit="%"
          ruler={{ value: (rem ?? 0) / 100, mode: 'pointer', ends: ['0', en ? 'top-buyer basis' : 'base comprador principal', '100'] }}
          note={en ? 'carried by the «remainder» bands' : 'lo cargan las bandas «resto»'}
          cite={en ? `Spend not drawn: ${rem != null ? pct(rem) : '—'}%` : `Gasto no dibujado: ${rem != null ? pct(rem) : '—'}%`}
          doc={doc}
        />
      </div>
    </section>
  )
}

/** An Anexo: ink rule · h2 (ordinal in small caps + title) · optional lede · body. */
function Anexo({ id, title, lede, children }: { en?: boolean; id: string; n?: number; title: string; lede?: ReactNode; children: ReactNode }) {
  return (
    <section className="ct-section" aria-labelledby={id}>
      <div className="ct-annex-row">
        <h2 id={id} className="ct-h2 scroll-mt-4">{title}</h2>
      </div>
      {lede && <p className="ct-annex-lede">{lede}</p>}
      <div className="ct-section-body">{children}</div>
    </section>
  )
}

export function AtlasAnexos({ manifest, lang, cut, onFlight }: { manifest: SkyManifest | null; lang: 'en' | 'es'; cut: string; onFlight: (id: string) => void }) {
  const en = lang === 'en'
  let colofon: string[] = []
  if (manifest) {
    const b = manifest.basis
    const loc = en ? 'en-US' : 'es-MX'
    const basis = /v[\d.]+/.exec(manifest.risk_basis)?.[0] ?? manifest.risk_basis
    const anomalies = Object.entries(manifest.anomalies)
      .map(([k, n]) => `${skyCopy(`anom_${k}` as SkyCopyKey, lang)} ${formatNumber(n)}`).join(' · ')
    colofon = [
      skyCopy('colDrawn', lang, { n: formatNumber(b.n_drawn), N: formatNumber(b.n_sky) }),
      skyCopy('colRemainder', lang, { x: (b.remainder_share * 100).toLocaleString(loc, { maximumFractionDigits: 1 }) }),
      skyCopy('colRemainderBasis', lang),
      `${skyCopy('colDropped', lang, { n: formatNumber(b.dropped_ties) })} · ${skyCopy('colAnomalies', lang)}: ${anomalies}`,
      skyCopy('colOverlaps', lang, { n: formatNumber(b.residual_overlaps) }),
      skyCopy('colRisk', lang, { basis }),
      `T1 ${formatNumber(b.public_t1)} · T2 ${formatNumber(b.public_t2)} · T3 ${formatNumber(b.public_t3)}`,
      skyCopy('colHalo', lang, { basis }),
      skyCopy('colBackbone', lang, { x: b.backbone_kept_pct.toLocaleString(loc, { maximumFractionDigits: 1 }) }),
      sentence(skyCopy('arbitrary', lang), lang),
      skyCopy('colCut', lang, { cut }),
    ]
  }
  return (
    <>
      <Anexo
        en={en} id="at-a1" n={1} title={en ? 'Guided tours' : 'Recorridos guiados'}
        lede={en
          ? 'Each tour flies the map through one investigation, chapter by chapter. Pause it, take the controls, resume it at any point.'
          : 'Cada recorrido lleva el mapa por una investigación, capítulo por capítulo. Puede pausarlo, tomar los controles y reanudarlo en cualquier momento.'}
      >
        <ol className="at-flights">
          {ATLAS_STORIES.map((st) => (
            <li key={st.id} className="at-flight">
              <h3>{en ? st.title.en : st.title.es}</h3>
              <p title={en ? st.blurb.en : st.blurb.es}>{st.duration} · {en ? st.blurb.en : st.blurb.es}</p>
              <button type="button" className="at-btn" onClick={() => onFlight(st.id)}
                aria-label={`${en ? 'Start the tour' : 'Iniciar el recorrido'} · ${en ? st.title.en : st.title.es}`}>{en ? 'Start ▸' : 'Iniciar ▸'}</button>
            </li>
          ))}
        </ol>
      </Anexo>
      {/* owner 2026-10-29: the keys fold into one line; «?» on the map still opens them over the sky */}
      <details className="ct-notes at-keys-d">
        <summary><span className="ct-notes-t">{en ? 'Keys' : 'Teclas'}</span><span className="ct-notes-n"> · ?</span></summary>
        <p className="ct-annex-lede">{en ? 'The map answers the keyboard; «?» opens this list over the map.' : 'El mapa responde al teclado; «?» abre esta lista sobre el mapa.'}</p>
        <dl className="at-keys">
          {SKY_KEYS.map(([k, es, enTxt]) => (
            <div key={k}><dt>{k}</dt><dd>{en ? enTxt : es}</dd></div>
          ))}
        </dl>
      </details>
      <Anexo
        en={en} id="at-a3" n={3} title={en ? 'Colophon' : 'Colofón'}
        lede={en ? 'What is drawn, what is not, and on what basis. Every value comes from the published map.' : 'Qué se dibuja, qué no y con qué base. Cada valor sale del mapa publicado.'}
      >
        {colofon.length
          ? <ol className="at-colofon">{colofon.map((l) => <li key={l}><span>{l}</span></li>)}</ol>
          : <p className="ct-note">{skyCopy('loading', lang)}</p>}
      </Anexo>
    </>
  )
}
