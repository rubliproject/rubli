/**
 * «La columna» — the profile of one government (owner pick 2026-11-05: C, but each sexenio is a PROFILE, a bio).
 * A museum label: portrait, who and when, then plain sentences (lib/sexenios/columna profileOf), with whom,
 * who bought, the documented cases. Every term is glossed once, here.
 */
import { useState, type ReactNode } from 'react'
import { BoardList, type BoardRow } from '@/components/kit/BoardList'
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import { useWikipediaImage } from '@/hooks/useWikipediaImage'
import { SECTORS } from '@/lib/constants'
import { formatCompactMXN } from '@/lib/utils'
import { backendKeyOf, profileOf, type ColTerm, type ColVendor, type TermSlug } from '@/lib/sexenios/columna'
import { ADMINISTRATIONS } from '../data'
import { useAdminScandals } from '../useAdminScandals'
import type { AdminMeta } from '../types'
import { pctLabel } from './ColumnObject'

type Lang = 'es' | 'en'

const META: Record<TermSlug, AdminMeta['name']> = { fox: 'Fox', calderon: 'Calderon', 'pena-nieto': 'Pena Nieto', amlo: 'AMLO', sheinbaum: 'Sheinbaum' }
/** Real terms in office (the column counts each calendar year for the president who governed most of it). */
const TERM_DATES: Record<TermSlug, [string, string]> = {
  fox: ['dic. 2000 – nov. 2006', 'Dec 2000 – Nov 2006'],
  calderon: ['dic. 2006 – nov. 2012', 'Dec 2006 – Nov 2012'],
  'pena-nieto': ['dic. 2012 – nov. 2018', 'Dec 2012 – Nov 2018'],
  amlo: ['dic. 2018 – sep. 2024', 'Dec 2018 – Sep 2024'],
  sheinbaum: ['desde oct. 2024', 'since Oct 2024'],
}
export const termDates = (s: TermSlug, lang: Lang) => TERM_DATES[s][lang === 'es' ? 0 : 1]
export const metaOf = (s: TermSlug) => ADMINISTRATIONS.find((a) => a.name === META[s]) as AdminMeta

/** Square, grey, ink-framed: the portrait as an archive print. Initials while it loads or if Wikipedia has none. */
export function Retrato({ slug, size, lang, decorative }: { slug: TermSlug; size: number; lang: Lang; decorative?: boolean }) {
  const m = metaOf(slug)
  const { src: raw } = useWikipediaImage(m.wikiArticle)
  const [broken, setBroken] = useState(false)
  const src = broken ? null : raw
  const ini = m.fullName.split(' ').map((w) => w[0]).slice(0, 2).join('')
  return (
    <span className="sxc-portrait" style={{ width: size, height: size, ['--c' as string]: m.color }}>
      {src
        ? <img src={src} alt={decorative ? '' : lang === 'es' ? `Retrato de ${m.fullName}` : `Portrait of ${m.fullName}`} loading="lazy" onError={() => setBroken(true)} />
        : <span aria-hidden="true">{ini}</span>}
    </span>
  )
}

/** A ranked list in the Portada's look (kit/BoardList): a name and one figure per line (owner 11-09). */
export function Ranked({ title, head, rows, lang, sub }: { title: string; head: [string, string]; rows: BoardRow[]; lang: Lang; sub?: ReactNode }) {
  return (
    <BoardList lang={lang} title={title} desc={sub} rows={rows} cols={[
      { label: head[0], w: 'minmax(0, 1fr)', cls: 'bd-buyer', phone: true },
      { label: head[1], w: 'auto', r: true, cls: 'bl-num', phone: true },
    ]} />
  )
}

export const vendorRows = (vendors: ColVendor[], lang: Lang): BoardRow[] => vendors.map((v) => ({
  key: v.id,
  cells: [
    <><EntityIdentityChip type="vendor" id={v.id} name={v.name} variant="name" className="bd-chip" fullName />{v.persona_fisica && <span className="bd-dim">{lang === 'es' ? ' · persona física' : ' · individual (persona física)'}</span>}</>,
    pctLabel(v.share, lang, 1),
  ],
}))

export function Perfil({ term, slug, lang, open, cut }: { term: ColTerm; slug: TermSlug; lang: Lang; open: boolean; cut: string }) {
  const L = (es: string, en: string) => (lang === 'es' ? es : en)
  const m = metaOf(slug)
  const cases = useAdminScandals(m.name)
  const sectorName = (id: number) => { const s = SECTORS.find((x) => x.id === id); return s ? (lang === 'es' ? s.name : s.nameEN) : '—' }
  const p = profileOf(term, slug, lang, formatCompactMXN, open)
  const y0 = term.years[0], y1 = term.years[term.years.length - 1]
  const data = !term.years.length ? '' : y0 === y1 ? `${y0}` : `${y0}–${y1}`
  const cutDay = new Intl.DateTimeFormat(lang === 'es' ? 'es-MX' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${cut}T00:00:00Z`))

  return (
    <div className="sxc-perfil">
      <header className="sxc-bio">
        <Retrato slug={slug} size={72} lang={lang} />
        <div>
          <h2 tabIndex={-1}>{m.fullName}</h2>
          <p className="sxc-bio-meta">{m.party} · {termDates(slug, lang)}</p>
          <p className="sxc-bio-meta">{L(`Su ficha: cuánto gastó, cómo y con quién (${data}).`, `The record: how much was spent, how and with whom (${data}).`)}</p>
        </div>
      </header>
      {(open || slug === 'fox') && <p className="sxc-bio-note">{open
        ? L(`En curso. Oct.–dic. 2024 cuentan con López Obrador. El registro llega al ${cutDay}.`, `In office. Oct–Dec 2024 count under López Obrador. The record ends on ${cutDay}.`)
        : L('2004 casi no tiene contratos.', '2004 has almost no contracts.')}</p>}

      <section className="sxc-said" aria-label={L('Lo que hizo con el dinero', 'What it did with the money')}>
        <p><b>{L('Cuánto', 'How much')}</b><span>{p.spent}</span></p>
        <p><b>{L('Cómo', 'How')}</b><span>{p.noTender}{p.noTenderCount && <> {p.noTenderCount}</>}</span></p>
        {p.crit && <p><b>{L('Señales', 'Signals')}</b><span>{p.crit}</span></p>}
      </section>

      <div className="sxc-lists">
        <Ranked lang={lang} title={L('Con quién', 'With whom')} sub={L('Las empresas que más ganaron: su parte del dinero del sexenio.', 'The firms that won the most: their share of the term’s money.')}
          head={[L('Empresa', 'Company'), L('Del dinero', 'Of money')]} rows={vendorRows(term.vendors, lang)} />
        <Ranked lang={lang} title={L('En qué se gastó', 'What it was spent on')} sub={L('Solo CompraNet, hasta el 28 sep. 2025: no cuenta ComprasMX.', 'CompraNet only, to 28 Sep 2025: ComprasMX not counted.')} head={[L('Sector', 'Sector'), L('Del dinero', 'Of money')]}
          rows={term.sectors.slice(0, 3).map((x) => ({ key: x.sector_id, cells: [<EntityIdentityChip key="s" type="sector" id={x.sector_id} name={sectorName(x.sector_id)} variant="name" className="bd-chip" fullName />, pctLabel(x.share, lang)] }))} />
        <Ranked lang={lang} title={L('Quién compró más', 'Who bought the most')} head={[L('Dependencia', 'Agency'), L('Del dinero', 'Of money')]}
          rows={term.institutions.map((i) => ({ key: i.id, cells: [<EntityIdentityChip key="i" type="institution" id={i.id} name={i.name} variant="name" className="bd-chip" fullName />, pctLabel(i.share, lang, 1)] }))} />
        {cases.length
          ? <Ranked lang={lang} title={L('Casos documentados', 'Documented cases')} head={[L('Caso', 'Case'), L('Año', 'Year')]}
              rows={cases.map((c) => ({ key: c.slug, cells: [<EntityIdentityChip key="c" type="case" id={c.slug} name={lang === 'es' ? c.name_es : c.name_en} variant="name" className="bd-chip" fullName />, String(c.year)] }))} />
          : <p className="sxc-sub">{L('Aún no hay casos documentados que empiecen en estos años.', 'No documented case starts in these years yet.')}</p>}
      </div>

      <dl className="sxc-gloss">
        <div><dt>MDP</dt><dd>{L('Millones de pesos. Un billón son un millón de millones de pesos.', 'Millions of pesos (MDP). A Spanish «billón» is a million million pesos.')}</dd></div>
        <div><dt>{L('Sin concurso', 'No tender')}</dt><dd>{L('Adjudicación directa: el gobierno elige a la empresa sin competencia.', 'Direct award: the government picks the firm with no competition.')}</dd></div>
        <div><dt>{L('Indicador crítico', 'Critical indicator')}</dt><dd>{L('Indicador de riesgo de 0.60 o más. Es una señal, no una prueba.', 'A risk indicator of 0.60 or more. A signal, not proof.')}</dd></div>
        <div><dt>{L('Caso documentado', 'Documented case')}</dt><dd>{L('Un caso que la prensa o una autoridad ya investigó.', 'A case the press or an authority already investigated.')}</dd></div>
      </dl>
      <p className="ct-note">{L('Toque un año de la columna para verlo mes por mes.', 'Tap a year in the column to see it month by month.')}</p>
    </div>
  )
}

/** Level 0: the five governments as small labels (portrait, name, years, one line); each opens its profile. */
export function Cinco({ terms, lang, onOpen, nYears }: { terms: ColTerm[]; lang: Lang; onOpen: (s: TermSlug) => void; nYears: (t: ColTerm) => number }) {
  const L = (es: string, en: string) => (lang === 'es' ? es : en)
  const order: TermSlug[] = ['sheinbaum', 'amlo', 'pena-nieto', 'calderon', 'fox']
  return (
    <section className="sxc-cinco" aria-labelledby="sxc-cinco-h">
      <h2 id="sxc-cinco-h">{L('Los cinco gobiernos', 'The five governments')}</h2>
      <ul>{order.map((s) => {
        const m = metaOf(s)
        const t = terms.find((x) => x.key === backendKeyOf(s))
        if (!t) return null
        const da = t.da_share == null ? L('sin dato de concurso', 'tender not recorded') : L(`${Math.round(100 * t.da_share)} % sin concurso`, `${Math.round(100 * t.da_share)}% no tender`)
        return (
          <li key={s}>
            <button type="button" onClick={() => onOpen(s)} style={{ ['--c' as string]: m.color }}>
              <Retrato slug={s} size={40} lang={lang} decorative />
              <span className="sxc-cinco-t">
                <b>{m.fullName}</b>
                <small>{termDates(s, lang)} · {m.party}</small>
                <small>{s === 'sheinbaum' ? `${formatCompactMXN(t.value)} ${L(`en ${t.years[t.years.length - 1]}, hasta septiembre`, `in ${t.years[t.years.length - 1]}, to September`)}` : `${formatCompactMXN(t.value / Math.max(1, nYears(t)))} ${L('al año', 'a year')}`} · {da}</small>
              </span>
            </button>
          </li>
        )
      })}</ul>
    </section>
  )
}
