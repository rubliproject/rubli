/**
 * El Mapa's page question (docs/PAGE_QUESTIONS.md; memory feedback_explain_what_am_i_seeing) on Vínculos, desktop
 * and phone: the question, how to read the sky, and one finding computed from the manifest (lib/pageQuestion
 * `mapaSectors`, the same Σ h·v ÷ Σ v the sector panel prints).
 */
import { useMemo, type ReactNode } from 'react'
import { PageQuestion } from '@/components/kit/PageQuestion'
import type { SkyManifest } from '@/lib/atlas/sky/geometry'
import { skyCopy } from '@/lib/atlas/sky/copy'
import { formatEntityName } from '@/lib/entity/format'
import { mapaRiesgo, mapaSectors } from '@/lib/pageQuestion'
import { MORE_LENSES } from './SkyArrange'

/** `phone`: the list, not the sky — its own two reading lines (the kit folds them; PhoneAtlas keeps its lede in view).
 *  `lens` (desktop): the arrangement on the canvas — «Riesgo» (1) has its own three lines, computed over every agency
 *  or, with `sector`, over the framed sector's; a «más vistas» lens swaps the reading line for its own sentence. */
export function MapaQuestion({ manifest, lang, phone = false, lens = 0, hues = false, sector = null, aside, onSector }: {
  manifest: SkyManifest | null; lang: 'es' | 'en'; phone?: boolean
  /** owner 11-06 «both lenses»: the sky is drawn in sector hues (the «Sectores» lens), so no red dots to explain */
  hues?: boolean
  lens?: number; sector?: number | null; aside?: ReactNode
  /** rc6: the unified strip's follow-up chip «the top sector's biggest agency» hops the sky there */
  onSector?: (id: number) => void
}) {
  const en = lang === 'en'
  // CYAN 2026-11-04 narration: sentences ≤ 15 words, the example first, short names (siglas) so they fit
  const short = (i: number) => {
    const S = manifest!.stars
    return S.siglas[i] || formatEntityName('institution', S.name[i], 'full')
  }
  const riesgo = useMemo(() => {
    const r = manifest && lens === 1 ? mapaRiesgo(manifest.stars, sector, 1) : null
    if (!manifest || !r || !r.order.length) return null
    const S = manifest.stars, i = r.order[0]
    const loc = en ? 'en-US' : 'es-MX'
    const x = Math.round(S.h[i] * 100).toLocaleString(loc)
    // CYAN-2 11-05: one plain finding — the agency with the most money at high/critical risk (mapaRiesgo order[0])
    const other = sector == null ? '' : (en ? ' in the sector' : ' del sector')
    return en
      ? <><b>{short(i)}</b> has the most money with a high or critical risk indicator{other}. That is {x}% of its spending.</>
      : <><b>{short(i)}</b> tiene más dinero con indicador de riesgo alto o crítico{other}. Es el {x}% de su gasto.</>
  }, [manifest, lens, sector, en]) // eslint-disable-line react-hooks/exhaustive-deps

  const means = useMemo(() => {
    const r = manifest ? mapaSectors(manifest.stars) : null
    if (!manifest || !r) return null
    const name = (id: number) => { const g = manifest.sectors.find((s) => s.id === id); return g ? (en ? g.name_en : g.name_es) : '' }
    const fmt = (v: number) => Math.round(v * 100).toLocaleString(en ? 'en-US' : 'es-MX')
    // owner 11-06 «both lenses»: under «Sectores» the sky shows money by sector, not risk — so the finding is money
    if (hues) {
      return en
        ? <><b>{name(r.top)}</b> takes {fmt(r.topShare)} of every 100 pesos, more than any other sector.</>
        : <><b>{name(r.top)}</b> se lleva {fmt(r.topShare)} de cada 100 pesos. Ningún sector recibe más.</>
    }
    const x = fmt(r.riskShare)
    // BLUE simplify 11-05: one finding, not two
    return en
      ? <><b>{name(r.riskiest)}</b>: {x}% of its spending has a high or critical risk indicator, the most of any sector.</>
      : <><b>{name(r.riskiest)}</b>: el {x}% de su gasto tiene indicador de riesgo alto o crítico. Ningún sector tiene más.</>
  }, [manifest, en, hues])
  if (lens === 1) {
    return (
      <PageQuestion
        lang={lang} aside={phone ? undefined : aside}
        question={en ? 'Which sectors and agencies does the money go to, and where does the risk concentrate?' : '¿En qué sectores y dependencias se va el dinero, y dónde se concentra el riesgo?'}
        see={en ? 'Each dot is an agency.' : 'Cada punto es una dependencia.'}
        read={en ? <>Further right, more spending with a high or critical risk indicator. Red: half or more of its spending.{phone ? ' Tap a dot.' : ''}</>
                 : <>Más a la derecha, más gasto con indicador de riesgo alto o crítico. Rojo: la mitad o más de su gasto.{phone ? ' Toque un punto.' : ''}</>}
        means={riesgo}
      />
    )
  }
  const more = (MORE_LENSES as readonly number[]).indexOf(lens)
  const topSector = manifest && onSector ? mapaSectors(manifest.stars)?.top : undefined
  return (
    <PageQuestion
      lang={lang} aside={phone ? undefined : aside}
      question={en ? 'Which sectors and agencies does the money go to, and where does the risk concentrate?' : '¿En qué sectores y dependencias se va el dinero, y dónde se concentra el riesgo?'}
      see={phone
        ? (en ? 'The twelve sectors, from the one that spends most to the least. The small circle is the sector seen from above.'
              : 'Los doce sectores, del que más gasta al que menos. El círculo pequeño es el sector visto desde arriba.')
        : (en ? 'Each shaded area is a sector. Each circle is an agency.'
              : 'Cada área sombreada es un sector. Cada círculo es una dependencia.')}
      read={!phone && more >= 0 ? skyCopy('lensMoreHint', lang).split(' · ')[more + 1] : phone
        ? (en ? 'Tap a sector to see its agencies.' : 'Toque un sector para ver sus dependencias.')
        : hues
          ? (en ? 'Bigger area, more money. Each colour is a sector. Risk: «Arrange by Risk».'
                : 'Más área, más dinero. Cada color es un sector. El riesgo: «Ordenar por Riesgo».')
          : (en ? 'Bigger area, more money. Red dot: a supplier with a high or critical risk indicator.'
                : 'Más área, más dinero. Punto rojo: proveedor con indicador de riesgo alto o crítico.')}
      means={means}
      followups={[
        ...(topSector != null && onSector ? [{ label: en ? 'Which agency spends most in the top sector?' : '¿Qué dependencia gasta más en el sector que más gasta?', onClick: () => onSector(topSector) }] : []),
        { label: en ? 'How did it change over the years?' : '¿Cómo cambió con los años?', to: '/mapa?vista=cifras' },
      ]}
    />
  )
}
