/**
 * /categories/:id and /categories/:id/sub/:code — the category profile in the B2 family (owner 11-06;
 * docs/PROFILE_CONTENT_CATEGORY_2026-11-05.md § 1–5 + § «Subcategory profile»). ONE template, two modes:
 *
 *   PageHead   crumbs · h1 = the ficha's finding · the question · three lines · Hoy/Historia
 *   Panorama   ledger · 2 Qué hay adentro (the piso of La bodega: area = money, tone = sin concurso; a box opens its
 *              subcategory) — in subcategory mode «Qué es» (example titles + the comparison with its category) ·
 *              3 Quién vende y quién compra (two Portada boards) · 4 Los contratos más grandes
 *              («Cómo se compra» dropped, owner 11-07)
 *   «Si sigue así» callout at the top (docs/PREDICTIONS_SPECIFIC_2026-11-07.md; owner 11-07: in the page, no tab).
 * One column at every width; the institution B2 sheet (b2.css) is the shared voice. URL: ?vista=historia.
 */
import { useId, useRef, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { categoriesApi, predictionsApi } from '@/api/client'
import { PredictionCallout } from '@/components/kit/PredictionCallout'
import { categoryPredictionText } from '@/lib/predictions'
import { PageHead, ReadLines, type Lines } from '@/components/kit/PageHead'
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import { Glyph } from '@/components/portada/Tablero'
import { RiskChip } from '@/components/institution/b2/B2Card'
import { cleanSubs, layoutSubs, wrap } from '@/components/categories/CategoryBodega'
import { useMeasuredWidth } from '@/hooks/useMeasuredWidth'
import { familyMeta, familyOf } from '@/lib/categories/families'
import { hueTone } from '@/lib/institution/panorama'
import {
  catFilterOf, catFilterSearch, catPanoramaApi, critLine, findingBig, findingSubs, findingWho, HOY_FROM, subHref, subVsCat, sxYears, withSearch,
  type CatPanorama, type Lang, type Seg, type Vista,
} from '@/lib/categories/panorama'
import { formatCut } from '@/lib/nav/toc'
import { useDataCut } from '@/lib/useDataCut'
import { formatColumnMXN, formatCompactMXN, formatDualCurrency, formatNumber } from '@/lib/utils'
import { SECTORS } from '@/lib/constants'
import { SEXENIOS } from '@/lib/aria/escenario'
import '@/components/institution/b2/b2.css'
import '@/components/kit/kit.css'
import './cb2.css'

export interface CatHead { id: number; name_es: string; name_en: string; rank: number | null; of: number }

function Say({ segs, lang }: { segs: Seg[]; lang: Lang }) {
  return <>{segs.map((s, i) => (typeof s === 'string' ? <span key={i}>{s}</span> : (
    <span key={i}><EntityIdentityChip type={s.kind} id={s.id} name={s.name} variant="name" size="inherit" fullName />{s.pf && <span className="ib2-pf">{lang === 'en' ? ' · individual' : ' · persona física'}</span>}</span>
  )))}</>
}

function Block({ id, sec, title, aside, lines, lang, children }: { id: string; sec: string; title: string; aside?: ReactNode; lines: Lines; lang: Lang; children?: ReactNode }) {
  return (
    <section className="ib2-blk" id={id} aria-labelledby={`${id}-h`}>
      <div className="ib2-blk-h"><h2 id={`${id}-h`}><span className="ib2-sec">{sec}</span>{title}</h2>{aside && <span className="ib2-aside">{aside}</span>}</div>
      <ReadLines lines={lines} lang={lang} className="ib2-read" />
      {children}
    </section>
  )
}

const of100 = (v: number | null | undefined, en: boolean) => (v == null ? '—' : en ? `${Math.round(v)} of 100` : `${Math.round(v)} de 100`)

/** Block 2: the piso of La bodega — the category opened, one box per subcategory; area = money, tone = sin concurso. */
function Piso({ p, categoryId, phone, lang, fq }: { p: CatPanorama; categoryId: number; phone: boolean; lang: Lang; fq: string }) {
  const en = lang === 'en'
  const hue = familyMeta(familyOf(categoryId)).color
  const pid = useId().replace(/:/g, '')
  const subs = cleanSubs(p.subs.filter((s) => s.code).map((s) => ({
    ...s, code: s.code as string, name_es: s.name_es ?? s.code!, name_en: s.name_en ?? s.code!, total_value: s.amount_mxn, total_contracts: s.contracts, direct_award_pct: s.da_pct,
  }))).map((s, i) => ({ ...s, subcategory_id: i }))
  if (!subs.length) return <p className="ib2-note ib2-center">{en ? 'No mini-category with money in this period.' : 'Ninguna minicategoría con dinero en este periodo.'}</p>
  const GW = phone ? 400 : 1100, GH = phone ? 560 : 440
  const boxes = layoutSubs(subs, familyOf(categoryId), GW, GH)
  return (
    <>
    <svg className="cb2-piso" viewBox={`0 0 ${GW} ${GH}`} role="group" aria-label={en ? `${boxes.length} boxes, one per mini-category: area = money, tone = no tender` : `${boxes.length} cajas, una por minicategoría: área = dinero, tono = sin concurso`}>
      <defs><pattern id={`${pid}-h`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" className="cb2-hbg" /><line x1="0" y1="0" x2="0" y2="6" className="cb2-hln" /></pattern></defs>
      {boxes.map((b) => {
        const s = subs[b.id]
        const nm = en ? s.name_en : s.name_es
        const tip = `${nm}: ${formatCompactMXN(s.amount_mxn)} · ${formatNumber(s.contracts)} ${en ? 'contracts' : 'contratos'} · ${of100(s.da_pct, en)} ${en ? 'with no tender' : 'sin concurso'}`
        const lines = b.w > 90 && b.h > 44 ? wrap(nm, Math.floor((b.w - 12) / 7.4)) : []
        const dark = !s.is_catch_all && (s.da_pct ?? 0) >= 60
        return (
          <Link key={b.key} to={withSearch(subHref(categoryId, s.code!), fq)} className={`cb2-box${dark ? ' is-dark' : ''}`} aria-label={tip}>
            <title>{tip}</title>
            <rect x={b.x + 1} y={b.y + 1} width={Math.max(0.5, b.w - 2)} height={Math.max(0.5, b.h - 2)} style={{ fill: s.is_catch_all ? `url(#${pid}-h)` : hueTone(hue, s.da_pct) ?? undefined }} />
            {lines.length > 0 && <text x={b.x + 8} y={b.y + 18} className="nm">{lines.map((ln, i) => <tspan key={i} x={b.x + 8} dy={i ? 15 : 0}>{ln}</tspan>)}</text>}
            {lines.length > 0 && b.h > 44 + lines.length * 15 && <text x={b.x + 8} y={b.y + 22 + lines.length * 15}>{formatCompactMXN(s.amount_mxn)}</text>}
          </Link>
        )
      })}
    </svg>
    <details className="cb2-all">
      <summary>{en ? `See all ${subs.length} as a list` : `Ver las ${subs.length} en lista`}</summary>
      <ol>{[...subs].sort((a, b) => b.amount_mxn - a.amount_mxn).map((s) => (
        <li key={s.code}><Link to={withSearch(subHref(categoryId, s.code), fq)}>{en ? s.name_en : s.name_es}</Link><span>{formatCompactMXN(s.amount_mxn)} · {of100(s.da_pct, en)} {en ? 'no tender' : 'sin concurso'}</span></li>
      ))}</ol>
    </details>
    </>
  )
}

export function CategoryB2({ cat, sub, lang }: { cat: CatHead; sub: string | null; lang: Lang }) {
  const en = lang === 'en'
  const id = cat.id
  const [sp, setSp] = useSearchParams()
  // the /categories filters carried in (AUDIT_JOURNALIST 11-07 P0): a sexenio replaces Hoy / Historia; a buyer sector cuts both
  const filter = catFilterOf(sp)
  const fq = catFilterSearch(filter)
  // with a filter the default is the whole period, as in La bodega («en cualquier año»); ?vista=hoy opts in
  const vq = sp.get('vista')
  const vista: Vista = filter.sx || vq === 'historia' || (fq && vq !== 'hoy') ? 'historia' : 'hoy'
  const predQ = useQuery({ queryKey: ['prediction-category', id], queryFn: () => predictionsApi.category(id), staleTime: 30 * 60 * 1000, retry: false })
  const set = (patch: Record<string, string | null>) => setSp((prev) => {
    const n = new URLSearchParams(prev)
    for (const [k, v] of Object.entries(patch)) { if (v == null) n.delete(k); else n.set(k, v) }
    return n
  }, { replace: true, preventScrollReset: true })
  const cutTxt = formatCut(useDataCut(), lang)
  const since = vista === 'hoy' ? HOY_FROM : undefined

  const q = (s: string | null) => ({ queryKey: ['category-b2', id, s, since ?? 'all', ...(fq ? [fq] : [])], queryFn: () => catPanoramaApi.get(id, { since, sub: s, filter }), staleTime: 10 * 60 * 1000, retry: 1, placeholderData: keepPreviousData })
  const pq = useQuery(q(sub))
  const catQ = useQuery({ ...q(null), enabled: sub != null }) // the comparison for a subcategory
  const subsQ = useQuery({ queryKey: ['categories', 'subcategories', id], queryFn: () => categoriesApi.getSubcategories(id), staleTime: 600_000, enabled: sub != null })
  const p = pq.data
  const subRow = sub ? subsQ.data?.data.find((x) => x.code === sub) : undefined

  const wrapRef = useRef<HTMLDivElement>(null)
  const width = useMeasuredWidth(wrapRef)
  const phone = width > 0 && width < 640

  const catName = en ? cat.name_en || cat.name_es : cat.name_es
  const subName = p?.sub ? (en ? p.sub.name_en || p.sub.name_es : p.sub.name_es) : null
  const name = subName ?? catName
  const fam = familyMeta(familyOf(id))
  const sxMeta = filter.sx ? SEXENIOS.find((x) => x.key === filter.sx)! : null
  const secMeta = filter.sector != null ? SECTORS.find((x) => x.id === filter.sector)! : null
  const sxSpan = filter.sx ? sxYears(filter.sx) : null
  const period = sxMeta ? (en ? `Under ${sxMeta.short}` : `Con ${sxMeta.short}`) : vista === 'hoy' ? (en ? 'Under this government' : 'Con este gobierno') : (en ? 'From 2002 to 2026' : 'De 2002 a 2026')
  const filterTxt = [sxMeta ? (en ? `under ${sxMeta.short} (${sxMeta.years})` : `con ${sxMeta.short} (${sxMeta.years})`) : null,
    secMeta ? (en ? `bought by ${secMeta.nameEN.toLowerCase()}` : `comprado por ${secMeta.name.toLowerCase()}`) : null].filter(Boolean).join(' · ')
  const finding: ReactNode = p
    ? (en
      ? <>{name}: {formatDualCurrency(p.amount_mxn)} in {formatNumber(p.contracts)} contracts. {p.da_pct == null ? '' : `${Math.round(p.da_pct)} of every 100, no tender.`}</>
      : <>{name}: {formatDualCurrency(p.amount_mxn)} en {formatNumber(p.contracts)} contratos. {p.da_pct == null ? '' : `${Math.round(p.da_pct)} de cada 100, sin concurso.`}</>)
    : <span className="ib2-hold-line" aria-busy="true">{name}</span>
  const rankTxt = !sub && cat.rank ? (en ? `Place ${cat.rank} of ${cat.of} by money, 2002–2026.` : `Lugar ${cat.rank} de ${cat.of} por dinero, 2002–2026.`) : null
  const headLines: Lines = {
    see: sub
      ? (en ? `${period}: what was spent on this one thing, and how.` : `${period}: lo que se gastó en esta cosa, y cómo.`)
      : (en ? `${period}: what was spent on this kind of purchase, and how.` : `${period}: lo que se gastó en este tipo de compra, y cómo.`),
    read: [en ? `Family: ${fam.en}.` : `Familia: ${fam.es}.`, rankTxt, en ? 'CompraNet and ComprasMX together.' : 'CompraNet y ComprasMX juntos.'].filter(Boolean).join(' '),
    means: p ? (critLine(p, lang) ?? '—') : '…',
  }

  const toolbar = (
    <>
      {fq && (
        <span className="ib2-chip cb2-filter" role="status">
          {en ? 'Filter: ' : 'Filtro: '}<b>{filterTxt}</b>
          <button type="button" className="ct-link" onClick={() => set({ sx: null, sector: null, vista: vista === 'historia' ? 'historia' : null })}>{en ? 'Clear filter' : 'Quitar el filtro'}</button>
        </span>
      )}
      {!filter.sx && <span className="ib2-vista" role="group" aria-label={en ? 'Period' : 'Periodo'}>
        <button type="button" aria-pressed={vista === 'hoy'} onClick={() => { set({ vista: fq ? 'hoy' : null }) }}>{en ? 'Today · Sheinbaum (Oct 2024 →)' : 'Hoy · Sheinbaum (oct 2024 →)'}</button>
        <button type="button" aria-pressed={vista === 'historia'} onClick={() => { set({ vista: fq ? null : 'historia' }) }}>{en ? 'History · 2002–2026' : 'Historia · 2002–2026'}</button>
      </span>}
      <span className="ib2-cut">{sxSpan ? (en ? `${sxSpan[0]}–${Math.min(sxSpan[1], 2026)} · data to ${cutTxt}` : `${sxSpan[0]}–${Math.min(sxSpan[1], 2026)} · datos hasta ${cutTxt}`) : vista === 'hoy' ? (en ? `since Oct 1, 2024 · data to ${cutTxt}` : `desde el 1 oct 2024 · datos hasta ${cutTxt}`) : (en ? `2002–2026 · data to ${cutTxt}` : `2002–2026 · datos hasta ${cutTxt}`)}</span>
      <span className="ib2-chip"><i className="ib2-dot" style={{ background: fam.color }} aria-hidden="true" />{en ? fam.en : fam.es}</span>
    </>
  )
  const crumbs = [{ label: en ? 'Categories' : 'Categorías', to: withSearch('/categories', fq) }, sub ? { label: catName, to: withSearch(`/categories/${id}`, fq) } : { label: catName }, ...(sub ? [{ label: subName ?? sub }] : [])]

  const SUP = 'minmax(36px, auto) minmax(0, 1.6fr) 100px 110px 100px 140px'
  const KCOLS = '92px minmax(0, 1.3fr) minmax(0, 1fr) 110px 110px 140px'
  const head = (cols: string, cells: string[]) => <li className="ib2-row ib2-cols" style={{ gridTemplateColumns: cols }} aria-hidden="true">{cells.map((c, i) => <span key={i} className={i > 1 ? 'r' : undefined}>{c}</span>)}</li>
  const scopeTxt = [sxSpan ? `${sxSpan[0]}–${Math.min(sxSpan[1], 2026)}` : vista === 'hoy' ? (en ? 'since Oct 2024' : 'desde oct 2024') : '2002–2026',
    secMeta ? (en ? secMeta.nameEN.toLowerCase() : secMeta.name.toLowerCase()) : null].filter(Boolean).join(' · ')

  return (
    <div className="ib2 cb2" ref={wrapRef}>
      <PageHead lang={lang} crumbs={crumbs}
        kicker={sub ? <>{en ? 'Mini-category of ' : 'Minicategoría de '}<EntityIdentityChip type="category" id={id} name={catName} variant="name" size="inherit" /></> : <>{en ? 'Category · ' : 'Categoría · '}{en ? fam.en : fam.es}</>}
        finding={finding}
        question={sub ? (en ? 'What exactly is this, and who sells it?' : '¿Qué es esto exactamente y quién lo vende?') : (en ? 'What is bought here, from whom, and how?' : '¿Qué se compra aquí, a quién y cómo?')}
        lines={headLines} toolbar={toolbar} />

      {p && (
        <dl className="ib2-ledger" aria-label={en ? 'The record in figures' : 'La ficha en cifras'}>
          <div><dt>{en ? `Contracts · ${scopeTxt}` : `Contratos · ${scopeTxt}`}</dt><dd>{formatNumber(p.contracts)}</dd></div>
          <div><dt>{en ? 'Suppliers' : 'Proveedores'}</dt><dd>{formatNumber(p.vendors_n)}</dd></div>
          <div><dt>{en ? 'Buying agencies' : 'Dependencias compradoras'}</dt><dd>{formatNumber(p.buyers_n)}</dd></div>
          <div><dt>{en ? 'No tender' : 'Sin concurso'}</dt><dd>{p.da_pct == null ? '—' : en ? `${Math.round(p.da_pct)} of every 100 contracts` : `${Math.round(p.da_pct)} de cada 100 contratos`}</dd></div>
          <div><dt>{en ? 'High or critical indicator' : 'Indicador alto o crítico'}</dt><dd>{p.hr_pct == null ? '—' : en ? `${Math.round(p.hr_pct)} of every 100 contracts` : `${Math.round(p.hr_pct)} de cada 100 contratos`}</dd></div>
        </dl>
      )}
      {pq.isError && <p className="ib2-note" role="alert">{en ? 'This record did not load; reload in a moment.' : 'Este registro no cargó; recargue en un momento.'}</p>}

      <div id="cb2-panel-p" className={pq.isPlaceholderData ? 'is-stale' : undefined}>
        <PredictionCallout text={categoryPredictionText(predQ.data, !en, !!sub)} />
        {!sub ? (
          <Block id="c2" sec="2" lang={lang} title={en ? "What's inside" : 'Qué hay adentro'}
            aside={p ? (en ? `${p.subs.filter((s) => s.code).length} mini-categories · ${scopeTxt}` : `${p.subs.filter((s) => s.code).length} minicategorías · ${scopeTxt}`) : undefined}
            lines={{
              see: en ? 'The category opened: each box is one concrete thing bought.' : 'La categoría abierta: cada caja es una cosa concreta que se compró.',
              read: en ? 'Area is money. Strong tone: more contracts with no tender.' : 'El área es el dinero. Tono fuerte: más contratos sin concurso.',
              means: p ? findingSubs(p, lang) : '…',
            }}>
            <div className="ib2-stage">{p ? <Piso p={p} categoryId={id} phone={phone} lang={lang} fq={fq} /> : <div className="ib2-hold-col" aria-hidden="true" />}</div>
            <p className="ib2-key">
              <span><i style={{ background: hueTone(fam.color, 0) ?? undefined }} aria-hidden="true" />{en ? 'light = tendered' : 'claro = con concurso'} · <i style={{ background: hueTone(fam.color, 100) ?? undefined }} aria-hidden="true" />{en ? 'strong = no tender' : 'fuerte = sin concurso'}</span>
              <span><i className="is-hatch" aria-hidden="true" />{en ? '«other», no more detail' : '«otros», sin más detalle'}</span>
              <span>{en ? 'Tap a box: its own page opens.' : 'Toque una caja: se abre su propia página.'}</span>
            </p>
          </Block>
        ) : (
          <Block id="s1" sec="1" lang={lang} title={en ? 'What it is' : 'Qué es'}
            aside={subRow?.year_min && subRow.year_max ? (en ? `bought ${subRow.year_min}–${subRow.year_max}` : `se compró ${subRow.year_min}–${subRow.year_max}`) : undefined}
            lines={{
              see: en ? 'One concrete thing the government buys, with real examples.' : 'Una cosa concreta que compra el gobierno, con ejemplos reales.',
              read: en ? 'Contract titles as written in the record, in Spanish.' : 'Títulos de contratos tal como están en el registro.',
              means: p ? (subVsCat(p, catQ.data, lang) ?? (en ? `${formatCompactMXN(p.amount_mxn)} in ${formatNumber(p.contracts)} contracts.` : `${formatCompactMXN(p.amount_mxn)} en ${formatNumber(p.contracts)} contratos.`)) : '…',
            }}>
            {(subRow?.example_titles?.length ?? 0) > 0 && (
              <ul className="cb2-ex">{subRow!.example_titles.slice(0, 3).map((t, i) => <li key={i} lang="es">«{t.toLowerCase()}»</li>)}</ul>
            )}
            {p?.sub?.is_catch_all && <p className="ib2-note">{en ? 'This box gathers contracts whose text does not say what was bought.' : 'Esta caja junta contratos cuyo texto no dice qué se compró.'}</p>}
            <p className="ib2-doors"><Link className="ib2-chip" to={withSearch(`/categories/${id}${vista === 'historia' && !filter.sx ? '?vista=historia' : ''}`, fq)}>{en ? `← All of ${catName}` : `← Toda la categoría ${catName}`}</Link></p>
          </Block>
        )}

        <Block id="c3" sec={sub ? '2' : '3'} lang={lang} title={en ? 'Who sells and who buys' : 'Quién vende y quién compra'}
          aside={p ? (en ? `top ${p.suppliers.length} of ${formatNumber(p.vendors_n)} suppliers · ${scopeTxt}` : `${p.suppliers.length} mayores de ${formatNumber(p.vendors_n)} proveedores · ${scopeTxt}`) : undefined}
          lines={{
            see: en ? 'The firms that sell the most, and the agencies that buy the most.' : 'Las empresas que más venden y las dependencias que más compran.',
            read: en ? 'Each name opens its file. Indicator = average of its contracts here.' : 'Cada nombre abre su expediente. Indicador = promedio de sus contratos aquí.',
            means: p ? <Say segs={findingWho(p, lang)} lang={lang} /> : '…',
          }}>
          <div className="bd ib2-bd">
            <div className="bd-head"><h3 className="bd-h">{en ? 'Who sells' : 'Quién vende'}</h3><p className="bd-when">{en ? 'by money' : 'por dinero'}</p></div>
            <ol className="ib2-list">
              {head(SUP, ['Nº', en ? 'Company' : 'Empresa', en ? 'Contracts' : 'Contratos', en ? 'Amount' : 'Monto', en ? 'No tender' : 'Sin concurso', en ? 'Indicator' : 'Indicador'])}
              {(p?.suppliers ?? []).map((s, k) => (
                <li key={s.vendor_id} className="ib2-row" style={{ gridTemplateColumns: SUP }}>
                  <span className="bd-rk">{String(k + 1).padStart(3, '0')}</span>
                  <span className="ib2-name"><EntityIdentityChip type="vendor" id={s.vendor_id} name={s.vendor_name} variant="name" size="inherit" fullName />
                    {s.persona_fisica && <span className="ib2-dim"> {en ? '· individual' : '· persona física'}</span>}
                    <span className="ib2-sub">{en ? `${(s.share_pct ?? 0).toFixed(1)} of every 100 pesos` : `${(s.share_pct ?? 0).toFixed(1)} de cada 100 pesos`}</span></span>
                  <span className="r ib2-c">{formatNumber(s.contracts)}</span>
                  <span className="r bd-amt">{formatColumnMXN(s.amount_mxn)}</span>
                  <span className="r ib2-c">{of100(s.da_pct, en)}</span>
                  <span className="r"><RiskChip score={s.avg_risk} lang={lang} /></span>
                </li>
              ))}
            </ol>
          </div>
          <div className="bd ib2-bd">
            <div className="bd-head"><h3 className="bd-h">{en ? 'Who buys' : 'Quién compra'}</h3><p className="bd-when">{p ? (en ? `top ${p.buyers.length} of ${formatNumber(p.buyers_n)} agencies` : `${p.buyers.length} mayores de ${formatNumber(p.buyers_n)} dependencias`) : ''}</p></div>
            <ol className="ib2-list">
              {head(SUP, ['Nº', en ? 'Agency' : 'Dependencia', en ? 'Contracts' : 'Contratos', en ? 'Amount' : 'Monto', en ? 'No tender' : 'Sin concurso', en ? 'Indicator' : 'Indicador'])}
              {(p?.buyers ?? []).map((b, k) => (
                <li key={b.institution_id} className="ib2-row" style={{ gridTemplateColumns: SUP }}>
                  <span className="bd-rk">{String(k + 1).padStart(3, '0')}</span>
                  <span className="ib2-name"><EntityIdentityChip type="institution" id={b.institution_id} name={b.name} variant="name" size="inherit" fullName />
                    <span className="ib2-sub">{en ? `${(b.share_pct ?? 0).toFixed(1)} of every 100 pesos` : `${(b.share_pct ?? 0).toFixed(1)} de cada 100 pesos`}</span></span>
                  <span className="r ib2-c">{formatNumber(b.contracts)}</span>
                  <span className="r bd-amt">{formatColumnMXN(b.amount_mxn)}</span>
                  <span className="r ib2-c">{of100(b.da_pct, en)}</span>
                  <span className="r"><RiskChip score={b.avg_risk} lang={lang} /></span>
                </li>
              ))}
            </ol>
            <p className="bd-note">{en ? '«Indicator» is the average risk indicator of its contracts here: a signal, not proof.' : '«Indicador» es el promedio del indicador de riesgo de sus contratos aquí: una señal, no una prueba.'}</p>
          </div>
        </Block>

        <Block id="c5" sec={sub ? '3' : '4'} lang={lang} title={en ? 'The largest contracts' : 'Los contratos más grandes'}
          aside={p ? (en ? `the ${p.top_contracts.length} largest · ${scopeTxt}` : `los ${p.top_contracts.length} más grandes · ${scopeTxt}`) : undefined}
          lines={{
            see: en ? 'The largest contracts here, one per row.' : 'Los contratos más grandes de aquí, uno por fila.',
            read: en ? 'Each row opens its contract. Big contracts score higher.' : 'Cada fila abre su contrato. Los contratos grandes puntúan más alto.',
            means: p ? findingBig(p, lang) : '…',
          }}>
          <div className="bd ib2-bd">
            <div className="bd-head"><h3 className="bd-h">{en ? 'The register' : 'El registro'}</h3><p className="bd-when">{en ? '■ direct · ● tendered' : '■ directa · ● con concurso'}</p></div>
            <ol className="ib2-list">
              {head(KCOLS, [en ? 'Date' : 'Fecha', en ? 'Company' : 'Empresa', en ? 'What' : 'Qué', en ? 'Amount' : 'Monto', en ? 'How' : 'Cómo', en ? 'Indicator' : 'Indicador'])}
              {(p?.top_contracts ?? []).map((k) => (
                <li key={k.id} className="ib2-row is-k" style={{ gridTemplateColumns: KCOLS }}>
                  <span className="bd-rk">{k.contract_date?.slice(0, 10) ?? k.contract_year}</span>
                  <span className="ib2-name">{k.vendor_id ? <EntityIdentityChip type="vendor" id={k.vendor_id} name={k.vendor_name} variant="name" size="inherit" fullName /> : '—'}
                    {k.persona_fisica && <span className="ib2-dim"> {en ? '· individual' : '· persona física'}</span>}
                    {k.source_structure === 'E' && <span className="bd-tag is-flag">ComprasMX</span>}
                    {k.amount_flag && <span className="bd-tag is-flag" title={en ? 'Amount to verify: kept out of totals and leaders' : 'Monto por verificar: fuera de totales y líderes'}>{en ? 'Review' : 'Revisar'}</span>}
                    {k.institution_id && <span className="ib2-sub"><EntityIdentityChip type="institution" id={k.institution_id} name={k.institution_name} variant="name" size="inherit" /></span>}</span>
                  <span className="ib2-say"><Link to={`/contracts/${k.id}`}>{(k.title ?? '—').toLowerCase()}</Link></span>
                  <span className="r bd-amt">{formatColumnMXN(k.amount_mxn)}</span>
                  <span>{k.is_direct_award == null ? '—' : <><Glyph p={k.is_direct_award ? 'directa' : 'concurso'} />{k.is_direct_award ? (en ? 'direct' : 'directa') : (en ? 'tender' : 'concurso')}</>}</span>
                  <span className="r"><RiskChip score={k.risk_score} lang={lang} avg={false} /></span>
                </li>
              ))}
            </ol>
            {!sub && <Link className="bd-link ib2-more" to={`/contracts?category_id=${id}${filter.sector != null ? `&sector_id=${filter.sector}` : ''}`}>{en ? 'See all its contracts →' : 'Ver todos sus contratos →'}</Link>}
          </div>
        </Block>
      </div>

    </div>
  )
}
