/**
 * El panorama — /institutions' own frame on El Mapa's sky (owner 2026-11-08: «the front page maps and Red Flags are
 * the best … include the institutions … replicate everything in there in terms of representation … each section
 * needs its own separate frame»). The Firmamento engine with the institutions' words:
 *   one circle = one buyer (federal by default; estatal · municipal · todos on the chips) · size = its spending ·
 *   colour = its sector · red ring = it holds its sector's riskiest money (the sky's p90 rule) ·
 *   hover = one line with its El tamiz grade · click = the docked card → «Abrir el expediente» (/institutions/:id).
 * State in the URL: ?nivel= · ?dep= (the picked buyer) · ?sector= (the sky's own camera).
 * The explanation is the page question's tour (kit/PageQuestion: ring + note, opened by the reader), never a second
 * graphic. Model: lib/institutions/panorama.ts (tested).
 */
import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Firmamento, esc, type Star } from '@/components/portada/Firmamento'
import { FieldCard } from '@/components/kit/Field'
import { PageQuestion } from '@/components/kit/PageQuestion'
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import type { SkyManifest } from '@/lib/atlas/sky/geometry'
import { formatEntityName } from '@/lib/entity/format'
import { starPx } from '@/lib/atlas/sky/geometry'
import { RISK_COLORS, SECTORS } from '@/lib/constants'
import type { FieldModel } from '@/lib/institutions/field'
import { NIVELES, RING_MIN_BUYERS, panoramaFacts, parseNivel, pickLevel, type Nivel } from '@/lib/institutions/panorama'
import { formatGradeOfTen } from '@/lib/tiers'
import { cieloHref } from '@/lib/vista'
import { formatCompactMXN, formatNumber } from '@/lib/utils'

const BEAT_KEY = 'rubli_beat_instituciones'
const NIVEL_WORD: Record<Nivel, [string, string]> = {
  federal: ['Federal', 'Federal'], estatal: ['Estatal', 'State'], municipal: ['Municipal', 'Municipal'], todos: ['Todos', 'All'],
}
const sectorOf = (id: number) => SECTORS.find((s) => s.id === id) ?? SECTORS[SECTORS.length - 1]
// fewer stars take more room: a federal frame (~440) reads as objects, the whole sky keeps El Mapa's radius
const bigPx = (v: number) => Math.max(3, Math.min(16, 3 + 2.8 * Math.log10(Math.max(v, 1) / 1e7)))

export function Panorama({ manifest, model, lang }: { manifest: SkyManifest; model: FieldModel | null; lang: 'es' | 'en' }) {
  const en = lang === 'en'
  const L = (es: string, e: string) => (en ? e : es)
  const [sp, setSp] = useSearchParams()
  const nivel = parseNivel(sp.get('nivel'))
  const dep = Number(sp.get('dep')) || null
  const sector = (() => { const v = Number(sp.get('sector')); return v >= 1 && v <= 12 ? v : null })()
  // read from the live URL, not the hook's closure: a search pick writes ?dep= and Firmamento writes ?sector= in the
  // same tick, and react-router's functional setter would base the second write on stale params (dropping the first)
  const patch = (u: Record<string, string | null>, replace = false) => {
    const n = new URLSearchParams(window.location.search)
    for (const [k, v] of Object.entries(u)) { if (v == null) n.delete(k); else n.set(k, v) }
    setSp(n, { replace, preventScrollReset: true })
  }

  // the four cuts once per manifest (three real cuts of 3,761 stars, a few ms); the chips print every level's figures
  const skies = useMemo(() => Object.fromEntries(NIVELES.map((k) => [k, pickLevel(manifest, k)])) as Record<Nivel, SkyManifest>, [manifest])
  const sky = skies[nivel]
  const byLevel = useMemo(() => Object.fromEntries(NIVELES.map((k) => [k, panoramaFacts(skies[k])])) as Record<Nivel, ReturnType<typeof panoramaFacts>>, [skies])
  const facts = byLevel[nivel]
  // El tamiz's grade beside the sky's risk share: the two honest readings of one buyer (graded = federal, 2002–2025)
  const graded = useMemo(() => new Map((model?.insts ?? []).map((i) => [i.id, i])), [model])
  const xMax = model?.xMax ?? 100
  const grade = (id: number) => { const g = graded.get(id); return g ? { text: formatGradeOfTen((g.total_score * 100) / xMax, lang), prov: g.provisional, fail: g.fail } : null }
  const failing = useMemo(() => { const g = model?.insts.filter((i) => i.level === 'federal') ?? []; return { n: g.length, fail: g.filter((i) => i.fail).length } }, [model])
  const pickTimer = useRef(0)
  useEffect(() => () => window.clearTimeout(pickTimer.current), [])
  const beat = useMemo(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false
    try { if (sessionStorage.getItem(BEAT_KEY)) return false; sessionStorage.setItem(BEAT_KEY, '1'); return true } catch { return false }
  }, [])

  const money = (v: number) => formatCompactMXN(v)
  const sName = (id: number) => (en ? sectorOf(id).nameEN : sectorOf(id).name)
  const nivelWord = (k: Nivel) => NIVEL_WORD[k][en ? 1 : 0]
  // the noun the sentence counts: «dependencias federales» · «compradores estatales» …
  const buyers = (k: Nivel, n: number) => en
    ? `${formatNumber(n)} ${k === 'federal' ? 'federal agencies' : k === 'estatal' ? 'state buyers' : k === 'municipal' ? 'municipal buyers' : 'public buyers'}`
    : `${formatNumber(n)} ${k === 'federal' ? 'dependencias federales' : k === 'estatal' ? 'compradores estatales' : k === 'municipal' ? 'compradores municipales' : 'compradores públicos'}`
  const short = (i: number) => sky.stars.siglas[i] || formatEntityName('institution', sky.stars.name[i], 'full')

  // the thesis (h1) and its base, recomputed for a sector focus — ≤ 15 words each (reader rule)
  const claim = (focus: number | null): [ReactNode, ReactNode] => {
    const f = focus != null ? panoramaFacts(sky, focus) : facts
    if (!f) return [L('Ningún comprador en este nivel.', 'No buyer at this level.'), null]
    const who = focus != null ? <b>{sName(focus)}</b> : null
    const top = f.top ? <>{short(f.top.i)}, {en ? '' : 'el '}<b>{Math.round(f.top.share * 100)}%</b></> : null
    const h1 = focus != null
      ? (en ? <>{who}: <b>{formatNumber(f.lit)}</b> of <b>{formatNumber(f.n)}</b> buyers hold the money with the sector's highest risk indicator.</>
            : <>{who}: <b>{formatNumber(f.lit)}</b> de <b>{formatNumber(f.n)}</b> compradores concentran el gasto con mayor indicador de riesgo del sector.</>)
      : (en ? <>Of <b>{buyers(nivel, f.n)}</b>, <b>{formatNumber(f.lit)}</b> hold the money with their sector's highest risk indicator.</>
            : <>De <b>{buyers(nivel, f.n)}</b>, <b>{formatNumber(f.lit)}</b> concentran el gasto con mayor indicador de riesgo de su sector.</>)
    const lede = en
      ? <>They spent <b>{money(f.value)}</b>{top && <>; the biggest, {top} of it</>}.</>
      : <>Gastaron <b>{money(f.value)}</b>{top && <>; la mayor, {top} de ese dinero</>}.</>
    return [h1, lede]
  }

  const words = useMemo(() => ({
    root: L('Todas', 'All'),
    vendorSearch: false as const,
    label: L(`Panorama de ${formatNumber(sky.stars.id.length)} compradores públicos, nivel ${nivelWord(nivel).toLowerCase()}, en 12 sectores`, `Panorama of ${formatNumber(sky.stars.id.length)} public buyers, ${nivelWord(nivel).toLowerCase()} level, in 12 sectors`),
    seek: L('Busque una dependencia', 'Find an agency'),
    radius: sky.stars.id.length <= 800 ? bigPx : starPx,
    claim,
    tip: (s: Star) => {
      const sig = s.sig && !s.name.startsWith(s.sig) ? `<b>${esc(s.sig)}</b> ` : ''
      const g = grade(s.id)
      return `${sig}<b>${esc(formatEntityName('institution', s.name, 'full'))}</b> · ${sName(s.sec)} · ${money(s.v)} · <b>${Math.round(s.h * 100)}%</b> ${L('del dinero con indicador alto o crítico', 'of the money at high or critical indicator')}${g ? ` · ${L('calificación', 'grade')} ${g.text}` : ''}`
    },
    // ponytail: one task later, so the sky's own ?sector= write (search → seek) lands first and both survive
    pick: { id: dep, set: (id: number | null) => { window.clearTimeout(pickTimer.current); pickTimer.current = window.setTimeout(() => patch({ dep: id == null ? null : String(id) }, id == null), 0) } },
    // the level chips before the sky: the frame's own control (the current page's three leagues)
    intro: (
      <div className="ip-levels" role="group" aria-label={L('Nivel de gobierno', 'Level of government')}>
        {NIVELES.map((k) => {
          const f = byLevel[k]
          return (
            <button key={k} type="button" className="ct-chip" aria-pressed={nivel === k}
              onClick={() => patch({ nivel: k === 'federal' ? null : k, dep: null, sector: null }, true)}>
              {nivelWord(k)}{f && <small>{formatNumber(f.n)} · {money(f.value)}</small>}
            </button>
          )
        })}
      </div>
    ),
    // the camera's crumb, with this page's doors (the sector's league, worst first; what it bought)
    crumb: sector != null ? (
      <nav className="pf-crumb" style={{ animation: 'ct-rise var(--dur-state) var(--ease-out)' }} aria-label={L('Ruta', 'Path')}>
        <button type="button" onClick={() => patch({ sector: null, dep: null }, true)}>{L('Todas', 'All')}</button>
        <span aria-hidden="true">›</span>
        <b>{sName(sector)}</b>
        <span className="kf-mono">{L('Esc para volver', 'Esc to go back')}</span>
        <Link className="pf-door" to={`/institutions?vista=lista&group=sector:${sector}&sort=total_score&order=asc`}>{L('Su liga, de peor a mejor →', 'Its league, worst first →')}</Link>
        <Link className="pf-door" to={`/categories?sector=${sector}`}>{L('Qué compró este sector →', 'What this sector bought →')}</Link>
      </nav>
    ) : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `claim`, `grade`, `patch` and `L` are closures over these
  }), [sky, facts, byLevel, graded, xMax, nivel, dep, sector, lang])

  const fig = (v: number | null | undefined, f: (x: number) => string = formatNumber) => (v == null ? '—' : f(v))
  const figures = (
    <dl className="pf-figs">
      <div><dt>{L('compradores en el panorama', 'buyers in the panorama')}</dt><dd>{fig(facts?.n)}</dd></div>
      <div><dt>{L('con anillo rojo', 'with a red ring')}</dt><dd className="is-crit">{fig(facts?.lit)}</dd></div>
      {nivel === 'federal'
        ? <div><dt>{L('reprueban en El tamiz, 2002–2025', 'fail in The sieve, 2002–2025')}</dt><dd>{model ? L(`${formatNumber(failing.fail)} de ${formatNumber(failing.n)} calificadas`, `${formatNumber(failing.fail)} of ${formatNumber(failing.n)} graded`) : '—'}</dd></div>
        : <div><dt>{L('sin dinero con indicador alto o crítico', 'no money at high or critical indicator')}</dt><dd>{fig(facts?.none)}</dd></div>}
      <div><dt>{L('su gasto, 2002–2026', 'their spending, 2002–2026')}</dt><dd>{fig(facts?.value, money)}</dd></div>
      <div className="pf-key">
        <dt className="sr-only">{L('Clave', 'Key')}</dt>
        <dd>
          <span>{L('tamaño: lo que gastó · color: su sector', 'size: what it spent · colour: its sector')}</span>
          <span><i className="is-ring" aria-hidden="true" />{L('anillo rojo: entre los de su sector en este nivel, el décimo con mayor indicador de riesgo', 'red ring: among its sector at this level, the tenth with the highest risk indicator')}</span>
          <span>{L('calificación (El tamiz, 2002–2025): cómo compra, por competencia, proceso y concentración; no prueba delito', 'grade (The sieve, 2002–2025): how it buys, by competition, process and concentration; it does not prove a crime')}</span>
        </dd>
      </div>
    </dl>
  )

  const picked = dep != null ? (() => { const i = sky.stars.id.indexOf(dep); return i < 0 ? null : i })() : null
  const pSec = picked != null ? sectorOf(sky.stars.sector[picked]) : null
  const pG = picked != null ? grade(dep!) : null
  const p90 = picked != null ? (sky.sectors.find((g) => g.id === sky.stars.sector[picked])?.h_p90 ?? 2) : 2
  const pLit = picked != null && sky.stars.h[picked] > 0 && sky.stars.h[picked] >= p90

  return (
    <>
      <PageQuestion
        lang={lang}
        question={L('¿Qué dependencias compran con más riesgo?', 'Which agencies buy with the most risk?')}
        means={claim(sector)[0]}
        findingAt=".pf-claim"
        targets={['.pf-cv', '.pf-cv']}
        cues={{ sky: '.pf-cv', key: '.pf-key', levels: '.ip-levels' }}
        script={L(
          '### 1\n[#sky] Cada círculo es una dependencia pública que compró bienes o servicios. Toque uno: su ficha y su expediente.\n### 2\nMás grande, más gastó. El color es su sector. [#key] Anillo rojo: concentra el gasto con señales de alerta de su sector. [#levels] Aquí se cambia a estados y municipios.',
          '### 1\n[#sky] Each circle is a public agency that bought goods or services. Tap one: its card and its dossier.\n### 2\nBigger, it spent more. The colour is its sector. [#key] Red ring: it holds its sector\'s money with warning signs. [#levels] Here you switch to states and municipalities.',
        )}
        followups={[
          { label: L('¿Quién reprueba, y por qué?', 'Who fails, and why?'), to: '/institutions?vista=tamiz' },
          { label: L('La lista, de peor a mejor', 'The list, worst first'), to: '/institutions?vista=lista&rnivel=federal&sort=total_score&order=asc' },
        ]}
      />
      <Firmamento key={lang} manifest={sky} lang={lang} totalInstitutions={null} totalValue={null} riskPct={null} beat={beat} figures={figures} words={words} />
      {picked != null && pSec && (
        <FieldCard title={en ? pSec.nameEN : pSec.name} onClose={() => patch({ dep: null })} lang={lang} focusKey={dep}>
          <div className="mt-2"><EntityIdentityChip type="institution" id={dep!} name={sky.stars.name[picked]} size="md" sectorCode={pSec.code} fullName /></div>
          <dl className="fw-dl kf-mono mt-3">
            <dt>{L('gastó', 'spent')}</dt><dd>{money(sky.stars.v[picked])}</dd>
            <dt>{L('proveedores', 'suppliers')}</dt><dd>{formatNumber(sky.stars.nv[picked])}</dd>
            <dt>{L('alto o crítico', 'high or critical')}</dt><dd>{Math.round(sky.stars.h[picked] * 100)}% {L('del dinero', 'of the money')}</dd>
            {pG && <><dt>{L('calificación', 'grade')}</dt><dd>{pG.text}{pG.prov && <> · {L('provisional', 'provisional')}</>}</dd></>}
          </dl>
          {pLit && <p className="ct-note mt-2" style={{ color: RISK_COLORS.critical }}>{L('Anillo rojo: entre los de su sector en este nivel, está en el décimo con mayor indicador de riesgo.', 'Red ring: among its sector at this level, it is in the tenth with the highest risk indicator.')}</p>}
          <p className="mt-3 flex flex-wrap gap-4 text-[14px]">
            <Link className="ct-link" to={`/institutions/${dep}`}><b>{L('Abrir el expediente →', 'Open the dossier →')}</b></Link>
            <Link className="ct-link" to={cieloHref({ star: dep })}>{L('Sus proveedores en El Mapa', 'Its suppliers on El Mapa')}</Link>
            {pG && <Link className="ct-link" to={`/institutions?vista=tamiz&inst=${dep}`}>{L('Verla en El tamiz', 'See it in The sieve')}</Link>}
          </p>
        </FieldCard>
      )}
      <p className="ct-note ip-foot">
        {L(
          `Cada círculo es un comprador público con gasto en CompraNet y ComprasMX, 2002–2026. El anillo se corta por sector y nivel, solo con ${RING_MIN_BUYERS} o más compradores con dinero en riesgo. Un indicador no es prueba: cada nombre lleva a su expediente.`,
          `Each circle is a public buyer with spending on CompraNet and ComprasMX, 2002–2026. The ring is cut per sector and level, only with ${RING_MIN_BUYERS} or more buyers holding money at risk. An indicator is not proof: every name leads to its dossier.`,
        )}
      </p>
    </>
  )
}

export default Panorama
