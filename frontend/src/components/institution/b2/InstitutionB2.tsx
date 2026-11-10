/**
 * /institutions/:id — concept B2 «Dos caras · La columna» (owner pick 2026-11-06; _explore/instituciones_concepts_2026-11-06
 * on concept/instituciones-fable; content doc docs/PROFILE_CONTENT_INSTITUTION_2026-11-05.md).
 *
 *   PageHead   crumbs + the two tabs · h1 = the ficha's finding · the tab's question · the three lines · Hoy/Historia
 *   Panorama   P1 ficha (ledger) · P2 ¿A quién le adjudica? (the column + toggles + lenses + board) · P3 Homenaje al
 *              cuadrado · P4 Qué compra · P5 Sus contratos
 *   Calificación  C1 the grade in a sentence · C2 the pillars · C3 who drags it down (→ the column, lit) · C4 how
 * One column at every width; every chart centred; ONE inline card under the chart a click came from.
 * URL: ?vista=historia · ?tab=calificacion · ?ano= · ?gob= · ?cat= · ?lente= · ?pilar=.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { institutionApi, predictionsApi, scorecardApi } from '@/api/client'
import { windowScore } from '@/lib/institutions/tiempo'
import { PredictionCallout } from '@/components/kit/PredictionCallout'
import { institutionPredictionText } from '@/lib/predictions'
import type { ContractListItem } from '@/api/types'
import { PageHead, ReadLines, type Lines } from '@/components/kit/PageHead'
import { headTour } from '@/lib/tours'
import { PageQuestion } from '@/components/kit/PageQuestion'
import { useLang } from '@/components/contrato/nav'
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import { InstitutionNameText } from '@/components/ui/InstitutionNameText'
import { Glyph } from '@/components/portada/Tablero'
import { useMeasuredWidth } from '@/hooks/useMeasuredWidth'
import { FAMILIES, familyMeta, familyOf } from '@/lib/categories/families'
import { ADMIN_COLORS, ADMIN_ORDER } from '@/lib/administrations'
import { SECTORS } from '@/lib/constants'
import { formatEntityName } from '@/lib/entity/format'
import { formatCut } from '@/lib/nav/toc'
import { gradeOutOf10, gradeWord } from '@/lib/tiers'
import { useDataCut } from '@/lib/useDataCut'
import { formatCompactMXN, formatColumnMXN, formatDualCurrency, formatNumber, STATE_PREFIXES } from '@/lib/utils'
import { cieloHref } from '@/lib/vista'
import { itemShort, type AnatomyView } from '@/lib/institution/anatomy'
import {
  findingC3, findingP2, findingP3, findingP4, GOB_NAME, leaderShare, splitDigits, gobYears, HOY_FROM, HOY_YEAR, hueTone, inactiveSince, isNew, isPillar3,
  LENSES, lensRows, panoramaApi, PILLAR_RULE, queryOf, scopeLabel, squaresOf, type GobKey, type Lang, type LensKey,
  type PanoramaSupplier, type PillarKey3, type Scope, type Seg, type Vista,
} from '@/lib/institution/panorama'
import { Albers, Columna, Pilares } from './B2Objects'
import { CategoryCard, RiskChip, SexStrip, SquareCard, VendorCard } from './B2Card'
import './b2.css'

interface Inst { id: number; name: string; siglas?: string | null; sector_id?: number | null }
type Host = 'col' | 'board' | 'alb' | 'cat' | 'c3'
type Open = { host: Host; kind: 'vendor'; id: number } | { host: Host; kind: 'cat'; id: number } | { host: Host; kind: 'square'; key: string }

const LENS_KEYS = LENSES.map((l) => l.key)
const isGob = (x: string | null): x is GobKey => !!x && (ADMIN_ORDER as readonly string[]).includes(x)

/** A sentence with suppliers in it (lib/institution/panorama Seg): names render as identity chips. */
function Say({ segs, search }: { segs: Seg[]; search?: string }) {
  const lang = useLang()
  return <>{segs.map((s, i) => (typeof s === 'string' ? <span key={i}>{s}</span> : (
    <span key={i}><EntityIdentityChip type="vendor" id={s.id} name={s.name} variant="name" size="inherit" fullName search={search} />{s.pf && <span className="ib2-pf">{lang === 'en' ? ' · individual' : ' · persona física'}</span>}</span>
  )))}</>
}

/** «Sin concurso» with its unit (AUDIT_JOURNALIST 11-07 P1): «71 de cada 100 contratos», and the peso share below when
 *  every year in the row has its procedure on record (≥ 2011), so the pesos are not diluted by uncoded years. */
function NoTender({ s, en }: { s: PanoramaSupplier; en: boolean }) {
  if (s.da_pct == null) return <span className="r ib2-c">—</span>
  const pesos = s.first_year >= 2011 && s.amount_mxn > 0 ? Math.round((100 * s.da_amount_mxn) / s.amount_mxn) : null
  return (
    <span className="r ib2-c ib2-nt">
      {en ? `${Math.round(s.da_pct)} of every 100 contracts` : `${Math.round(s.da_pct)} de cada 100 contratos`}
      {pesos != null && <span className="ib2-sub">{en ? `${pesos} of every 100 pesos` : `${pesos} de cada 100 pesos`}</span>}
    </span>
  )
}

function Block({ id, sec, title, aside, lines, lang, children }: { id: string; sec: string; title: string; aside?: ReactNode; lines: Lines; lang: Lang; children: ReactNode }) {
  return (
    <section className="ib2-blk" id={id} aria-labelledby={`${id}-h`}>
      <div className="ib2-blk-h"><h2 id={`${id}-h`}><span className="ib2-sec">{sec}</span>{title}</h2>{aside && <span className="ib2-aside">{aside}</span>}</div>
      <ReadLines lines={lines} lang={lang} className="ib2-read" />
      {children}
    </section>
  )
}

export function InstitutionB2({ institution, anatomy, lang }: { institution: Inst; anatomy: AnatomyView | null; lang: Lang }) {
  const en = lang === 'en'
  const id = institution.id
  const cut = useDataCut()
  const cutYear = Number(cut.slice(0, 4)) || 2026
  const [sp, setSp] = useSearchParams()
  const vista: Vista = sp.get('vista') === 'historia' ? 'historia' : 'hoy'
  /** a vendor link opens the vendor in this page's scope (AUDIT_JOURNALIST 11-07 P1): the vendor page defaults to Historia */
  const vq = vista === 'hoy' ? 'vista=hoy' : undefined
  const tab = sp.get('tab') === 'calificacion' ? 'calificacion' : 'panorama'
  // «Si sigue así»: next year's direct-award share ± the back-tested band (docs/PREDICTIONS_RESEARCH_2026-11-06.md)
  const predQ = useQuery({ queryKey: ['prediction-institution', id], queryFn: () => predictionsApi.institution(id), enabled: tab === 'panorama', staleTime: 30 * 60 * 1000, retry: false })
  const ano = Number(sp.get('ano')) || null
  const gobRaw = sp.get('gob')
  const gob = vista === 'historia' && isGob(gobRaw) ? gobRaw : null
  const cat = Number(sp.get('cat')) || null
  const lensRaw = sp.get('lente') as LensKey | null
  const lens: LensKey = lensRaw && LENS_KEYS.includes(lensRaw) ? lensRaw : 'dinero'
  const pilarRaw = sp.get('pilar')
  const pilar: PillarKey3 | null = isPillar3(pilarRaw) ? pilarRaw : null
  const set = useCallback((patch: Record<string, string | null>) => {
    setSp((prev) => {
      const n = new URLSearchParams(prev)
      for (const [k, v] of Object.entries(patch)) { if (v == null) n.delete(k); else n.set(k, v) }
      return n
    }, { replace: true, preventScrollReset: true })
  }, [setSp])

  // ── data: this government (Hoy), 2002–2026 (Historia, also the grade's suppliers), and the column's own cut ──
  const scope: Scope = { vista, year: ano, gob, cat }
  const pq = (q: ReturnType<typeof queryOf>) => ({ queryKey: ['institution-b2', id, 'panorama', q], queryFn: () => panoramaApi.get(id, q), staleTime: 10 * 60 * 1000, retry: 1 })
  const hoyQ = useQuery(pq(queryOf({ vista: 'hoy', year: null, gob: null, cat: null })))
  // the league's per-government grade (same query key as /institutions' TamizTiempo)
  const sexQ = useQuery({ queryKey: ['institution-sexenios'], queryFn: () => scorecardApi.getInstitutionSexenios(), staleTime: 3_600_000, enabled: tab === 'calificacion' && vista === 'hoy' })
  const nowScore = sexQ.data ? windowScore(sexQ.data, id, 'sheinbaum') : null
  const histQ = useQuery(pq({}))
  // nothing under this government → open on History instead of an empty «Hoy» (owner 11-07)
  useEffect(() => {
    if (vista === 'hoy' && !sp.has('vista') && hoyQ.data && hoyQ.data.contracts === 0) set({ vista: 'historia' })
  }, [vista, sp, hoyQ.data, set])
  const scopedQ = useQuery({ ...pq(queryOf(scope)), placeholderData: keepPreviousData })
  const base = vista === 'hoy' ? hoyQ.data : histQ.data
  const scoped = scopedQ.data
  const allById = useMemo(() => new Map((histQ.data?.suppliers ?? []).map((s) => [s.vendor_id, s])), [histQ.data])

  const recentQ = useQuery({
    queryKey: ['institution-b2', id, 'contracts', vista],
    queryFn: () => institutionApi.getContracts(id, vista === 'hoy'
      ? { per_page: 10, sort_by: 'contract_date', sort_order: 'desc', since: HOY_FROM }
      : { per_page: 10, sort_by: 'amount_mxn', sort_order: 'desc' }),
    staleTime: 10 * 60 * 1000,
  })

  // ── the ONE card + focus return ──
  const [open, setOpen] = useState<Open | null>(null)
  const opener = useRef<Element | null>(null)
  const close = useCallback(() => {
    setOpen(null)
    const el = opener.current as HTMLElement | SVGElement | null
    opener.current = null
    if (el && 'focus' in el && document.contains(el)) el.focus({ preventScroll: true })
  }, [])
  const pick = useCallback((o: Open, el: Element | null) => {
    setOpen((cur) => (cur && cur.host === o.host && cur.kind === o.kind && ('id' in cur ? cur.id === (o as { id: number }).id : cur.key === (o as { key: string }).key) ? null : o))
    // a click inside an open card hands off to the next card: focus returns to what opened the FIRST one
    if (!(el && el.closest('.ib2-card') && opener.current)) opener.current = el
  }, [])
  const [tokOpen, setTokOpen] = useState<'ano' | 'gob' | 'cat' | null>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (tokOpen) { setTokOpen(null); return }
      if (open) close()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, tokOpen, close])
  // a new cut closes the card (its numbers would no longer match)
  useEffect(() => { setOpen(null) }, [vista, tab, ano, gob, cat, lens, pilar])

  const wrapRef = useRef<HTMLDivElement>(null)
  const width = useMeasuredWidth(wrapRef)
  const phone = width > 0 && width < 640
  const [more, setMore] = useState(false)

  // ── figures ──
  const sector = SECTORS.find((s) => s.id === institution.sector_id)
  const name = formatEntityName('institution', institution.name, 'full')
  const short = (institution.siglas && !STATE_PREFIXES[institution.siglas] ? institution.siglas : null) || formatEntityName('institution', institution.name, 'sm')
  const on100 = anatomy ? (anatomy.score * 100) / anatomy.ceiling : null
  const gradeTxt = on100 != null ? gradeOutOf10(on100) : null
  const label = scopeLabel(scope, lang, cat != null ? (scoped?.categories.find((c) => c.category_id === cat) ?? base?.categories.find((c) => c.category_id === cat))?.[en ? 'name_en' : 'name_es'] : null)
  const cutTxt = formatCut(cut, lang)
  const periodTxt = vista === 'hoy'
    ? (en ? `CompraNet + ComprasMX since Oct 1, 2024 · data to ${cutTxt}` : `CompraNet + ComprasMX desde el 1 oct 2024 · datos hasta ${cutTxt}`)
    : (en ? `CompraNet 2002–Sep 2025 + ComprasMX · data to ${cutTxt}` : `CompraNet 2002–sep 2025 + ComprasMX · datos hasta ${cutTxt}`)

  const finding: ReactNode = base
    ? (en
      ? <>{vista === 'hoy' ? 'Under this government it bought ' : 'From 2002 to 2026 it bought '}{formatDualCurrency(base.amount_mxn)} from {formatNumber(base.vendors)} suppliers. {base.da_pct == null ? '' : `${Math.round(base.da_pct)} of every 100 contracts had no tender.`}</>
      : <>{vista === 'hoy' ? 'Con este gobierno compró ' : 'De 2002 a 2026 compró '}{formatDualCurrency(base.amount_mxn)} a {formatNumber(base.vendors)} proveedores. {base.da_pct == null ? '' : `${Math.round(base.da_pct)} de cada 100 contratos, sin concurso.`}</>)
    : <span className="ib2-hold-line" aria-busy="true">{name}</span>
  const top1 = base?.suppliers[0]
  const headLines: Lines = {
    see: vista === 'hoy' ? (en ? 'What it bought under this government, and from how many suppliers.' : 'Lo que compró con este gobierno, y a cuántos proveedores.') : (en ? 'What it bought from 2002 to 2026, and from how many suppliers.' : 'Lo que compró de 2002 a 2026, y a cuántos proveedores.'),
    read: en ? 'Contracts with a valid amount, CompraNet and ComprasMX together.' : 'Contratos con monto válido; CompraNet y ComprasMX juntos.',
    means: top1 ? <Say search={vq} segs={[{ id: top1.vendor_id, name: top1.vendor_name ?? '—', pf: top1.persona_fisica }, en ? ' is its largest supplier' : ' es su mayor proveedor', ...leaderShare(base!.suppliers, lang)]} /> : '—',
  }

  // ── P2: lit plates (lens or pillar) and the board ──
  const pool = scoped?.suppliers ?? []
  const pillarIds = useMemo(() => (pilar && histQ.data ? PILLAR_RULE[pilar].rows(histQ.data.suppliers).slice(0, 8).map((s) => s.vendor_id) : null), [pilar, histQ.data])
  const lit = useMemo(() => (pillarIds ? new Set(pillarIds) : lens === 'dinero' ? null : new Set(lensRows(pool, lens, cutYear).map((s) => s.vendor_id))), [pillarIds, lens, pool, cutYear])
  const boardRows = lensRows(pool, lens, cutYear)
  const shownRows = boardRows.slice(0, more ? 50 : 10)

  const vistaLabel = scopeLabel({ vista, year: null, gob: null, cat: null }, lang)
  const slot = (host: Host, rows: PanoramaSupplier[], scopeTxt: string = vistaLabel) => {
    if (!open || open.host !== host) return null
    if (open.kind === 'vendor') {
      const row = rows.find((s) => s.vendor_id === open.id)
      return <VendorCard key={`${host}-${open.id}`} id={open.id} row={row} all={allById.get(open.id)} fallback={row ?? hoyQ.data?.suppliers.find((s) => s.vendor_id === open.id)}
        institutionId={id} vista={vista} scope={scopeTxt} cutYear={cutYear} lang={lang} onClose={close} />
    }
    if (open.kind === 'cat') {
      const c = base?.categories.find((x) => x.category_id === open.id)
      return c ? <CategoryCard c={c} institutionId={id} vista={vista} lang={lang} onClose={close}
        onVendor={(vid, el) => pick({ host, kind: 'vendor', id: vid }, el)}
        onColumn={(cid) => { set({ cat: String(cid), ano: null, pilar: null }); document.getElementById('p2')?.scrollIntoView({ block: 'start' }) }} /> : null
    }
    const sq = base ? squaresOf(base, vista, lang).find((s) => s.key === open.key) : undefined
    return sq ? <SquareCard s={sq} lang={lang} onClose={close} onVendor={(vid, el) => pick({ host, kind: 'vendor', id: vid }, el)} /> : null
  }

  // ── toggles: «¿A quién le adjudica [inst] en [año] · [gobierno] · [categoría]?» ──
  const years = (vista === 'hoy' ? hoyQ.data : histQ.data)?.years.map((y) => y.year)
    .filter((y) => (vista === 'hoy' ? y >= HOY_YEAR : !gob || (y >= gobYears(gob)[0] && y <= gobYears(gob)[1]))) ?? []
  const cats = (base?.categories ?? []).slice(0, 12)
  const tok = (kind: 'ano' | 'gob' | 'cat', text: string, isSet: boolean, body: ReactNode, disabled?: boolean) => (
    <span className="ib2-w">
      <button type="button" className={`ib2-tok${isSet ? ' is-set' : ''}`} aria-expanded={disabled ? undefined : tokOpen === kind} disabled={disabled}
        title={disabled ? (en ? 'In «Today» the government is the current one' : 'En «Hoy» el gobierno es el actual') : undefined}
        onClick={() => setTokOpen((t) => (t === kind ? null : kind))}>{text}{!disabled && <span className="ib2-caret" aria-hidden="true">▾</span>}</button>
      {isSet && !disabled && <button type="button" className="ib2-clear" onClick={() => { set({ [kind]: null }); setTokOpen(null) }}>{en ? 'clear' : 'quitar'}</button>}
      {tokOpen === kind && <div className="ib2-pop" role="dialog" aria-label={text}>{body}</div>}
    </span>
  )
  const choose = (patch: Record<string, string | null>) => { set({ ...patch, pilar: null }); setTokOpen(null) }
  const toggles = (
    <p className="ib2-tg">
      {en ? 'Who does ' : '¿A quién le adjudica '}{short}{en ? ' award to ' : ' '}
      {tok('ano', ano ? (en ? `in ${ano}` : `en ${ano}`) : (en ? 'in any year' : 'en cualquier año'), ano != null, (
        <><h4>{en ? 'Pick a year' : 'Elija un año'}</h4><div className="ib2-opts is-grid">{years.map((y) => (
          <button key={y} type="button" className="ib2-opt" aria-pressed={ano === y} onClick={() => choose({ ano: String(y) })}>{y}{vista === 'hoy' && y === HOY_YEAR ? (en ? ' Oct–Dec' : ' oct–dic') : ''}</button>
        ))}</div></>
      ))}
      {' '}
      {vista === 'hoy'
        ? tok('gob', en ? 'under Sheinbaum' : 'con Sheinbaum', true, null, true)
        : tok('gob', gob ? (en ? `under ${GOB_NAME[gob]}` : `con ${GOB_NAME[gob]}`) : (en ? 'under any government' : 'con cualquier gobierno'), gob != null, (
          <><h4>{en ? 'Pick a government' : 'Elija un gobierno'}</h4><div className="ib2-opts is-grid">{ADMIN_ORDER.map((k) => (
            <button key={k} type="button" className="ib2-opt is-sx" style={{ borderTopColor: ADMIN_COLORS[k] }} aria-pressed={gob === k} onClick={() => choose({ gob: k, ano: null })}>
              <b>{GOB_NAME[k]}</b><span>{Math.max(2002, gobYears(k)[0])}–{Math.min(cutYear, gobYears(k)[1])}</span></button>
          ))}</div></>
        ))}
      {' '}
      {tok('cat', cat ? label : (en ? 'in any category' : 'en cualquier categoría'), cat != null, (
        <><h4>{en ? 'Pick a category of what it buys' : 'Elija una categoría de lo que compra'}</h4><div className="ib2-opts">{cats.map((c) => (
          <button key={c.category_id} type="button" className="ib2-opt" aria-pressed={cat === c.category_id} onClick={() => choose({ cat: String(c.category_id) })}>
            <i style={{ background: familyMeta(familyOf(c.category_id)).color }} aria-hidden="true" />{(en ? c.name_en : c.name_es) ?? `#${c.category_id}`}<span>{formatCompactMXN(c.amount_mxn)}</span></button>
        ))}</div><p className="ib2-gloss">{en ? 'Mini-categories live in La bodega: open a category there.' : 'Las minicategorías viven en La bodega: abra ahí una categoría.'}</p></>
      ))}
      ?
    </p>
  )

  const tabs = (
    <div className="ib2-tabs" role="tablist" aria-label={en ? 'The two faces' : 'Las dos caras'}
      onKeyDown={(e) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return
        e.preventDefault()
        const next = e.key === 'Home' ? 'panorama' : e.key === 'End' ? 'calificacion' : tab === 'panorama' ? 'calificacion' : 'panorama'
        set({ tab: next === 'panorama' ? null : next })
        requestAnimationFrame(() => document.getElementById(next === 'panorama' ? 'ib2-tab-p' : 'ib2-tab-c')?.focus())
      }}>
      <button type="button" role="tab" id="ib2-tab-p" aria-controls="ib2-panel-p" aria-selected={tab === 'panorama'} tabIndex={tab === 'panorama' ? 0 : -1} onClick={() => set({ tab: null })}>{en ? 'Overview' : 'Panorama general'}</button>
      <button type="button" role="tab" id="ib2-tab-c" aria-controls="ib2-panel-c" aria-selected={tab === 'calificacion'} tabIndex={tab === 'calificacion' ? 0 : -1} onClick={() => set({ tab: 'calificacion' })}>
        {en ? 'Institutional grade' : 'Calificación institucional'}{gradeTxt && <span className="ib2-n">{gradeTxt} {en ? 'of 10' : 'de 10'}</span>}
      </button>
    </div>
  )
  const toolbar = (
    <>
      <span className="ib2-vista" role="group" aria-label={en ? 'Period' : 'Periodo'}>
        <button type="button" aria-pressed={vista === 'hoy'} onClick={() => set({ vista: null, ano: null, gob: null, cat: null, pilar: null })}>{en ? 'Today · Sheinbaum (Oct 2024 →)' : 'Hoy · Sheinbaum (oct 2024 →)'}</button>
        <button type="button" aria-pressed={vista === 'historia'} onClick={() => set({ vista: 'historia', ano: null, gob: null, cat: null })}>{en ? 'History · 2002–2026' : 'Historia · 2002–2026'}</button>
      </span>
      <span className="ib2-cut">{periodTxt}</span>
      {sector && <Link className="ib2-chip" to={cieloHref({ star: id })}><i className="ib2-dot" style={{ background: sector.color }} aria-hidden="true" />{en ? sector.nameEN : sector.name} · El Mapa</Link>}
    </>
  )

  // ── Calificación ──
  const pillars = anatomy?.pillars ?? []
  const lead = anatomy?.dragging ?? null
  const leadP = pillars.find((p) => p.key === lead)
  const hrv = anatomy?.badges.find((b) => b.key === 'model_hr_value_share')?.value
  // RED 11-07 rule: a money-weighted share always comes with the by-count line (grade = 2002–2026 → Historia base)
  const hrCount = histQ.data?.hr_pct != null ? Math.round(histQ.data.hr_pct) : null
  const c3key: PillarKey3 | null = pilar ?? (isPillar3(lead) ? lead : null)
  const c3rows = c3key && histQ.data ? PILLAR_RULE[c3key].rows(histQ.data.suppliers).slice(0, 8) : []
  const seeInColumn = (k: PillarKey3) => {
    set({ vista: 'historia', tab: null, ano: null, gob: null, cat: null, pilar: k, lente: PILLAR_RULE[k].lens === 'dinero' ? null : PILLAR_RULE[k].lens })
    requestAnimationFrame(() => document.getElementById('p2')?.scrollIntoView({ block: 'start' }))
  }

  const boardHead = (cols: string, cells: string[]) => (
    <li className="ib2-row ib2-cols" style={{ gridTemplateColumns: cols }} aria-hidden="true">{cells.map((c, i) => <span key={i} className={i > 1 && i !== cells.length - 2 ? 'r' : undefined}>{c}</span>)}</li>
  )
  const supplierRow = (s: PanoramaSupplier, k: number, host: Host, cols: string, val: string, sub: string, total = true) => {
    const gone = vista === 'historia' ? inactiveSince(allById.get(s.vendor_id) ?? s) : null
    const opened = open?.host === host && open.kind === 'vendor' && open.id === s.vendor_id
    const hurt = !!pillarIds?.includes(s.vendor_id)
    return (
      <li key={s.vendor_id} className={`ib2-row${opened ? ' is-pick' : ''}${hurt && host === 'board' ? ' is-hurt' : ''}`} style={{ gridTemplateColumns: cols }}
        title={`${formatEntityName('vendor', s.vendor_name, 'full')} · ${formatCompactMXN(s.amount_mxn)} · ${s.da_pct == null ? '—' : `${Math.round(s.da_pct)} ${en ? 'of 100 with no tender' : 'de 100 sin concurso'}`}`}
        onClick={(e) => { if (!(e.target as Element).closest('a, button')) pick({ host, kind: 'vendor', id: s.vendor_id }, e.currentTarget.querySelector('button')) }}>
        <button type="button" className="bd-rk ib2-open" aria-expanded={opened} onClick={(e) => pick({ host, kind: 'vendor', id: s.vendor_id }, e.currentTarget)}
          aria-label={en ? `Open the card of ${formatEntityName('vendor', s.vendor_name, 'full')}` : `Abrir la tarjeta de ${formatEntityName('vendor', s.vendor_name, 'full')}`}>{String(k + 1).padStart(3, '0')}</button>
        <span className="ib2-name">
          <EntityIdentityChip type="vendor" id={s.vendor_id} name={s.vendor_name} variant="name" size="inherit" fullName search={host === 'board' || host === 'col' ? vq : undefined} />
          {s.persona_fisica && <span className="ib2-dim"> {en ? '· individual' : '· persona física'}</span>}
          {s.in_ground_truth && <span className="bd-tag is-flag">{en ? 'case' : 'caso'}</span>}
          {(s.efos || s.sfp) && <span className="bd-tag is-flag">{[s.efos && 'SAT 69-B', s.sfp && 'SFP'].filter(Boolean).join(' · ')}</span>}
          {isNew(s, cutYear) && <span className="bd-tag is-new">{en ? 'new' : 'nuevo'}</span>}
          {s.primary_pattern === 'P6' && <Link className="bd-tag is-flag" to={`/captura?inst=${id}`}>{en ? 'capture' : 'captura'}</Link>}
          {gone && <span className="bd-tag is-flag">{en ? `no contracts since ${gone}` : `sin contratos desde ${gone}`}</span>}
          <span className="ib2-sub">{sub}</span>
        </span>
        <span className="r bd-amt">{val}</span>
        {total && <span className="r ib2-c">{formatCompactMXN(s.amount_mxn)}</span>}
        <NoTender s={s} en={en} />
        <span className="ib2-c"><SexStrip years={(allById.get(s.vendor_id) ?? s).years} first={s.first_year_all} last={s.last_year_all} lang={lang} /></span>
        <span className="r"><RiskChip score={s.avg_risk} lang={lang} /></span>
      </li>
    )
  }
  const SUPCOLS = 'minmax(36px, auto) minmax(0, 1.6fr) 110px 110px 128px 72px 140px'
  /** «por dinero»: the lens value IS the amount, so no second money column */
  const SUPCOLS_M = 'minmax(36px, auto) minmax(0, 1.6fr) 110px 128px 72px 140px'
  const oneMoney = lens === 'dinero'
  const lensVal = (s: PanoramaSupplier, prev?: PanoramaSupplier, next?: PanoramaSupplier): [string, string] => {
    switch (lens) {
      case 'directo': return [formatCompactMXN(s.da_amount_mxn), en ? `${Math.round(s.da_pct ?? 0)} of every 100 contracts` : `${Math.round(s.da_pct ?? 0)} de cada 100 contratos`]
      case 'siempre': return [`${s.first_year_all}–${s.last_year_all}`, en ? `${s.last_year_all - s.first_year_all + 1} years with this buyer` : `${s.last_year_all - s.first_year_all + 1} años con este comprador`]
      case 'nuevos': return [String(s.first_year_all), en ? `first contract here in ${s.first_year_all}` : `primer contrato aquí en ${s.first_year_all}`]
      case 'listas': return [[s.in_ground_truth && (en ? 'case' : 'caso'), s.efos && 'SAT 69-B', s.sfp && 'SFP'].filter(Boolean).join(' · '), formatCompactMXN(s.amount_mxn)]
      default: {
        // a tie with a neighbour at one decimal prints one more (AUDIT_JOURNALIST 11-07)
        const d = s.share_pct == null ? 1 : Math.max(splitDigits(s.share_pct, prev?.share_pct, 1), splitDigits(s.share_pct, next?.share_pct, 1))
        const sh = s.share_pct == null ? '—' : s.share_pct.toFixed(d)
        return [formatCompactMXN(s.amount_mxn), en ? `${sh} of every 100 pesos` : `${sh} de cada 100 pesos`]
      }
    }
  }
  const lensCol = { dinero: en ? 'Amount' : 'Monto', directo: en ? 'No tender' : 'Sin concurso', siempre: en ? 'Years' : 'Años', nuevos: en ? 'Since' : 'Desde', listas: en ? 'List' : 'Lista' }[lens]
  const squares = base ? squaresOf(base, vista, lang) : []
  const recent: ContractListItem[] = recentQ.data?.data ?? []
  const direct = recent.filter((k) => k.is_direct_award).length

  return (
    <div className="ib2" ref={wrapRef}>
      <PageHead lang={lang}
        crumbs={[{ label: en ? 'Institutions' : 'Instituciones', to: '/institutions' }, { label: short }]}
        tabs={tabs}
        actions={tab === 'panorama' && <PageQuestion bare {...headTour('institution', lang)} />}
        kicker={<InstitutionNameText name={name} />}
        finding={finding}
        question={tab === 'panorama' ? (en ? 'Who does this agency buy from, and how?' : '¿A quién le compra esta dependencia, y cómo?') : (en ? 'How well does it buy, next to similar agencies?' : '¿Qué tan bien compra, comparada con las demás?')}
        lines={headLines}
        toolbar={toolbar} />

      {base && (
        <dl className="ib2-ledger" aria-label={en ? 'The record in figures' : 'La ficha en cifras'}>
          <div><dt>{vista === 'hoy' ? (en ? 'Contracts since Oct 2024' : 'Contratos desde oct 2024') : (en ? 'Contracts 2002–2026' : 'Contratos 2002–2026')}</dt><dd>{formatNumber(base.contracts)}</dd></div>
          <div><dt>{en ? 'Distinct suppliers' : 'Proveedores distintos'}</dt><dd>{formatNumber(base.vendors)}</dd></div>
          <div><dt>{en ? 'Largest supplier' : 'Mayor proveedor'}</dt><dd>{top1?.share_pct == null ? '—' : en ? `${top1.share_pct.toFixed(1)} of every 100 pesos` : `${top1.share_pct.toFixed(1)} de cada 100 pesos`}</dd></div>
          <div><dt>{en ? 'High or critical indicator' : 'Indicador alto o crítico'}</dt><dd>{base.hr_pct == null ? '—' : en ? `${Math.round(base.hr_pct)} of every 100 contracts` : `${Math.round(base.hr_pct)} de cada 100 contratos`}</dd></div>
          <div><dt>{en ? 'Place among peers' : 'Lugar entre pares'}</dt><dd>{anatomy && anatomy.peer.rank > 0 ? (en ? `${anatomy.peer.rank} of ${anatomy.peer.n}` : `${anatomy.peer.rank} de ${anatomy.peer.n}`) : '—'}{gradeTxt && <button type="button" className="ib2-linkbtn" onClick={() => set({ tab: 'calificacion' })}>{' · '}{gradeTxt} {en ? 'of 10 →' : 'de 10 →'}</button>}</dd></div>
        </dl>
      )}
      {(hoyQ.isError || histQ.isError) && <p className="ib2-note" role="alert">{en ? 'Part of this record did not load; reload in a moment.' : 'Parte de este registro no cargó; recargue en un momento.'}</p>}

      <div id="ib2-panel-p" role="tabpanel" aria-labelledby="ib2-tab-p" hidden={tab !== 'panorama'}>
        <PredictionCallout text={predQ.data ? institutionPredictionText(predQ.data, !en) : null} />
        <Block id="p2" sec="P2" lang={lang} title={en ? 'Who does it award to?' : '¿A quién le adjudica?'}
          aside={scoped ? (en ? `its ${scoped.suppliers.length} largest of ${formatNumber(scoped.vendors)} suppliers · data to ${cutTxt}` : `sus ${scoped.suppliers.length} mayores de ${formatNumber(scoped.vendors)} proveedores · datos hasta ${cutTxt}`) : undefined}
          lines={{
            see: en ? 'Its money in one column: one plate per supplier, the largest on top.' : 'Su dinero en una columna: una placa por proveedor, el mayor arriba.',
            read: en ? 'Height: its share of 100 pesos. Colour: what it sells. Tone: no tender.' : 'Altura: su parte de cada 100 pesos. Color: qué vende. Tono: sin concurso.',
            means: scoped ? <Say search={vq} segs={findingP2(scoped, lens, label, cutYear, lang)} /> : '…',
          }}>
          {toggles}
          <div className="ib2-lens" role="group" aria-label={en ? 'The lens' : 'La mirada'}>
            {LENSES.map((l) => (
              <button key={l.key} type="button" aria-pressed={lens === l.key} onClick={() => set({ lente: l.key === 'dinero' ? null : l.key, pilar: null })}>
                {en ? l.en : l.es}<span className="ib2-n">{lensRows(pool, l.key, cutYear).length}</span>
              </button>
            ))}
          </div>
          {pilar && (
            <div className="ib2-back">
              <span>{en ? <>Pillar <b>{pillars.find((p) => p.key === pilar)?.label_en ?? pilar}</b>: lit, the suppliers that {PILLAR_RULE[pilar].why[1]} (grade 2002–2026).</> : <>Pilar <b>{pillars.find((p) => p.key === pilar)?.label_es ?? pilar}</b>: encendidas las placas de los proveedores que {PILLAR_RULE[pilar].why[0]} (calificación 2002–2026).</>}</span>
              <button type="button" className="ib2-chip" onClick={() => set({ tab: 'calificacion' })}>{en ? '← back to the grade' : '← volver a la calificación'}</button>
              <button type="button" className="ib2-chip" onClick={() => set({ pilar: null, lente: null })}>{en ? 'clear' : 'quitar'}</button>
            </div>
          )}
          <div className={`ib2-stage${scopedQ.isPlaceholderData ? ' is-stale' : ''}`} aria-busy={scopedQ.isFetching}>
            {scoped ? <Columna p={scoped} lit={lit} picked={open?.host === 'col' && open.kind === 'vendor' ? open.id : null} phone={phone} vista={vista} label={label} lang={lang}
              onPick={(vid, el) => pick({ host: 'col', kind: 'vendor', id: vid }, el)} /> : <div className="ib2-hold-col" aria-hidden="true" />}
          </div>
          <p className="ib2-key">
            {FAMILIES.map((f) => <span key={f.key}><i style={{ background: f.color }} aria-hidden="true" />{en ? f.en : f.es}</span>)}
            <span><i className="is-hatch" aria-hidden="true" />{en ? 'no category on record' : 'sin categoría conocida'}</span>
            <span><i style={{ background: hueTone('var(--color-fam-salud)', 0) ?? undefined }} aria-hidden="true" />{en ? 'light = tendered' : 'claro = con concurso'} · <i style={{ background: hueTone('var(--color-fam-salud)', 100) ?? undefined }} aria-hidden="true" />{en ? 'strong = no tender' : 'fuerte = sin concurso'}</span>
            <span><i className="is-gt" aria-hidden="true" />{en ? 'documented case' : 'caso documentado'}</span>
          </p>
          {slot('col', pool, label)}
          <div className="bd ib2-bd">
            <div className="bd-head"><h3 className="bd-h">{en ? LENSES.find((l) => l.key === lens)!.en : LENSES.find((l) => l.key === lens)!.es}</h3>
              <p className="bd-when">{boardRows.length ? (en ? `${boardRows.length} of its ${pool.length} largest suppliers` : `${boardRows.length} de sus ${pool.length} mayores proveedores`) : (en ? 'none among its largest suppliers' : 'ninguno entre sus mayores proveedores')}</p></div>
            {boardRows.length > 0 && (
              <ol className="ib2-list">
                {boardHead(oneMoney ? SUPCOLS_M : SUPCOLS, ['Nº', en ? 'Company' : 'Empresa', lensCol, ...(oneMoney ? [] : [en ? 'Total' : 'Monto total']), en ? 'No tender' : 'Sin concurso', 'Sexenios', en ? 'Indicator' : 'Indicador'])}
                {shownRows.map((s, k) => { const [val, sub] = lensVal(s, shownRows[k - 1], shownRows[k + 1]); return supplierRow(s, k, 'board', oneMoney ? SUPCOLS_M : SUPCOLS, val, sub, !oneMoney) })}
              </ol>
            )}
            {boardRows.length > 10 && <button type="button" className="bd-link ib2-more" aria-expanded={more} onClick={() => setMore((m) => !m)}>{more ? (en ? 'Show 10' : 'Ver 10') : (en ? `Show all ${boardRows.length}` : `Ver los ${boardRows.length}`)}</button>}
            <p className="bd-note">{en ? 'Tap a row: its card opens here; the name opens its file. «Indicator» = average risk indicator of its contracts here; a signal, not proof.' : 'Toque una fila: su tarjeta se abre aquí; el nombre abre su expediente. «Indicador» = promedio del indicador de riesgo de sus contratos aquí; una señal, no una prueba.'}</p>
          </div>
          {slot('board', pool, label)}
        </Block>

        <Block id="p3" sec="P3" lang={lang} title={vista === 'hoy' ? (en ? 'This government, year by year' : 'Este gobierno, año por año') : (en ? 'By administration: Homage to the Square' : 'Por sexenio: Homenaje al cuadrado')}
          aside={vista === 'hoy' ? (en ? `Sheinbaum · since Oct 2024 · data to ${cutTxt}` : `Sheinbaum · desde oct 2024 · datos hasta ${cutTxt}`) : (en ? `${squares.length} administrations · 2002–2026` : `${squares.length} sexenios · 2002–2026`)}
          lines={{
            see: vista === 'hoy' ? (en ? 'One square per year of this government. Inside, its three largest suppliers.' : 'Un cuadrado por año de este gobierno. Dentro, sus tres mayores proveedores.') : (en ? 'One square per administration. Inside, its three largest suppliers.' : 'Un cuadrado por sexenio. Dentro, sus tres mayores proveedores.'),
            read: en ? 'Area is money. Tone, how many contracts had no tender.' : 'El área es el dinero. El tono, cuántos contratos fueron sin concurso.',
            means: base ? findingP3(squares, vista, lang) : '…',
          }}>
          <div className="ib2-stage">
            <Albers squares={squares} phone={phone} lang={lang} picked={open?.host === 'alb' && open.kind === 'square' ? open.key : null}
              onSquare={(key, el) => pick({ host: 'alb', kind: 'square', key }, el)} onVendor={(vid, el) => pick({ host: 'alb', kind: 'vendor', id: vid }, el)} />
          </div>
          {vista === 'hoy' && base && !squares.some((q) => q.from === cutYear) && (
            <p className="ib2-note ib2-center">{en ? `No ${cutYear} contracts in this copy of the record yet.` : `Aún no hay contratos de ${cutYear} en esta copia del registro.`}</p>
          )}
          <p className="ib2-key"><span>{en ? 'Colour = the administration; tone: light = almost all tendered · strong = almost none · hatched = before 2011, no procedure on record. After Josef Albers.' : 'Color = el gobierno; tono: claro = casi todo con concurso · fuerte = casi nada · rayado = antes de 2011, sin procedimiento registrado. Según Josef Albers.'}</span></p>
          {slot('alb', base?.suppliers ?? [])}
        </Block>

        <Block id="p4" sec="P4" lang={lang} title={en ? 'What it buys' : 'Qué compra'}
          aside={base ? (en ? `its ${base.categories.length} largest categories` : `sus ${base.categories.length} mayores categorías`) : undefined}
          lines={{
            see: en ? 'What it buys most, from the category with most money down.' : 'Lo que más compra, de la categoría con más dinero a la de menos.',
            read: en ? 'Each row opens its card; from there, its box in La bodega.' : 'Cada fila abre su tarjeta; desde ahí, su caja en La bodega.',
            means: base ? findingP4(base.categories, lang) : '…',
          }}>
          <div className="bd ib2-bd">
            <div className="bd-head"><h3 className="bd-h">{en ? 'What it buys most' : 'Lo que más compra'}</h3><p className="bd-when">{en ? 'category › its card' : 'categoría › su tarjeta'}</p></div>
            <ol className="ib2-list">
              {boardHead('minmax(36px, auto) minmax(0, 1.6fr) 100px 110px 110px 140px', ['Nº', en ? 'Category' : 'Categoría', en ? 'Contracts' : 'Contratos', en ? 'Amount' : 'Monto', en ? 'No tender' : 'Sin concurso', en ? 'Indicator' : 'Indicador'])}
              {(base?.categories ?? []).map((c, k) => {
                const f = familyMeta(familyOf(c.category_id)), nm = (en ? c.name_en : c.name_es) ?? `#${c.category_id}`
                const opened = open?.host === 'cat' && open.kind === 'cat' && open.id === c.category_id
                return (
                  <li key={c.category_id} className={`ib2-row${opened ? ' is-pick' : ''}`} style={{ gridTemplateColumns: 'minmax(36px, auto) minmax(0, 1.6fr) 100px 110px 110px 140px' }}
                    onClick={(e) => { if (!(e.target as Element).closest('a, button')) pick({ host: 'cat', kind: 'cat', id: c.category_id }, e.currentTarget.querySelector('button')) }}>
                    <button type="button" className="bd-rk ib2-open" aria-expanded={opened} aria-label={en ? `Open the card of ${nm}` : `Abrir la tarjeta de ${nm}`} onClick={(e) => pick({ host: 'cat', kind: 'cat', id: c.category_id }, e.currentTarget)}>{String(k + 1).padStart(3, '0')}</button>
                    <span className="ib2-name"><i className="ib2-sw" style={{ background: f.color }} aria-hidden="true" /><EntityIdentityChip type="category" id={c.category_id} name={nm} variant="name" size="inherit" /><span className="ib2-sub">{en ? f.en : f.es} · {Math.round(c.share_pct ?? 0)} {en ? 'of 100 pesos' : 'de 100 pesos'}</span></span>
                    <span className="r ib2-c">{formatNumber(c.contracts)}</span>
                    <span className="r bd-amt">{formatColumnMXN(c.amount_mxn)}</span>
                    <span className="r ib2-c">{c.da_pct == null ? '—' : en ? `${Math.round(c.da_pct)} of 100` : `${Math.round(c.da_pct)} de 100`}</span>
                    <span className="r"><RiskChip score={c.avg_risk} lang={lang} /></span>
                  </li>
                )
              })}
            </ol>
            <p className="bd-note">{en ? '«Indicator» is the average risk indicator of its contracts: a signal, not proof.' : '«Indicador» es el promedio del indicador de riesgo de sus contratos: una señal, no una prueba.'}</p>
          </div>
          {slot('cat', base?.suppliers ?? [])}
        </Block>

        <Block id="p5" sec="P5" lang={lang} title={en ? 'Its contracts' : 'Sus contratos'}
          aside={vista === 'hoy' ? (en ? `the ${recent.length} most recent · since Oct 2024` : `los ${recent.length} más recientes · desde oct 2024`) : (en ? `the ${recent.length} largest · 2002–2026` : `los ${recent.length} más grandes · 2002–2026`)}
          lines={{
            see: vista === 'hoy' ? (en ? 'Its most recent contracts under this government, one per row.' : 'Sus contratos más recientes con este gobierno, uno por fila.') : (en ? 'Its largest contracts from 2002 to 2026, one per row.' : 'Sus contratos más grandes de 2002 a 2026, uno por fila.'),
            read: en ? 'Date, company, amount, how it was awarded and its risk indicator.' : 'Fecha, empresa, monto, cómo se adjudicó y su indicador de riesgo.',
            means: recent.length ? (en ? `${direct} of these ${recent.length} had no tender.` : `${direct} de estos ${recent.length} fueron sin concurso.`) : '…',
          }}>
          <div className="bd ib2-bd">
            <div className="bd-head"><h3 className="bd-h">{en ? 'The register' : 'El registro'}</h3><p className="bd-when">{en ? '■ direct · ● tendered' : '■ directa · ● con concurso'}</p></div>
            <ol className="ib2-list">
              {boardHead('92px minmax(0, 1.3fr) minmax(0, 1fr) 110px 110px 140px', [en ? 'Date' : 'Fecha', en ? 'Company' : 'Empresa', en ? 'What' : 'Qué', en ? 'Amount' : 'Monto', en ? 'How' : 'Cómo', en ? 'Indicator' : 'Indicador'])}
              {recent.map((k) => (
                <li key={k.id} className="ib2-row is-k" style={{ gridTemplateColumns: '92px minmax(0, 1.3fr) minmax(0, 1fr) 110px 110px 140px' }}>
                  <span className="bd-rk">{k.contract_date?.slice(0, 10) ?? k.contract_year}</span>
                  <span className="ib2-name">{k.vendor_id ? <EntityIdentityChip type="vendor" id={k.vendor_id} name={k.vendor_name} variant="name" size="inherit" fullName search={vq} /> : '—'}
                    {k.vendor_is_individual && <span className="ib2-dim"> {en ? '· individual' : '· persona física'}</span>}
                    {k.source_structure === 'E' && <span className="bd-tag is-flag">ComprasMX</span>}</span>
                  <span className="ib2-say"><Link to={`/contracts/${k.id}`}>{(k.title ?? '—').toLowerCase()}</Link></span>
                  <span className="r bd-amt">{formatColumnMXN(k.amount_mxn)}</span>
                  <span><Glyph p={k.is_direct_award ? 'directa' : 'concurso'} />{k.is_direct_award ? (en ? 'direct' : 'directa') : (en ? 'tendered' : 'con concurso')}</span>
                  <span className="r"><RiskChip score={k.risk_score} lang={lang} avg={false} /></span>
                </li>
              ))}
            </ol>
            <Link className="bd-link ib2-more" to={`/contracts?institution_id=${id}`}>{histQ.data ? (en ? `See all its ${formatNumber(histQ.data.contracts)} contracts, 2002–2026 →` : `Ver sus ${formatNumber(histQ.data.contracts)} contratos, 2002–2026 →`) : (en ? 'See all its contracts →' : 'Ver todos sus contratos →')}</Link>
          </div>
        </Block>
      </div>

      <div id="ib2-panel-c" role="tabpanel" aria-labelledby="ib2-tab-c" hidden={tab !== 'calificacion'}>
        {vista === 'hoy' && (sexQ.data || sexQ.isError) && <p className="ib2-note ib2-gnote"><b>{nowScore != null
          ? (en ? `The grade below looks at 2002–2026. For this government alone: ${gradeOutOf10(nowScore)} of 10 (few years yet).` : `La calificación de abajo mira 2002–2026. Solo con este gobierno: ${gradeOutOf10(nowScore)} de 10 (aún pocos años).`)
          : (en ? 'The grade looks at 2002–2026. There is no grade for this government alone yet.' : 'La calificación mira 2002–2026. Aún no hay una solo para este gobierno.')}</b></p>}
        {!anatomy ? <p className="ib2-note">{en ? 'No grade on record for this institution.' : 'Sin calificación registrada para esta institución.'}</p> : (
          <>
            <Block id="c1" sec="C1" lang={lang} title={en ? 'The grade, in one sentence' : 'La calificación, en una frase'}
              aside={en ? `2002–2026 · ${anatomy.peer.n} peers (${anatomy.peer.label_en}) · grade ${anatomy.methodVersion}` : `periodo 2002–2026 · ${anatomy.peer.n} pares (${anatomy.peer.label_es}) · calificación ${anatomy.methodVersion}`}
              lines={{
                see: en ? 'How well it buys, next to similar agencies.' : 'Qué tan bien compra, frente a dependencias parecidas.',
                read: en ? 'From 0 to 10; it passes at 6. The place is among its peers.' : 'De 0 a 10; aprueba con 6. El puesto es entre sus pares.',
                means: en
                  ? `It scores ${gradeTxt} of 10: ${gradeWord(on100, 'en')}. Place ${anatomy.peer.rank} of ${anatomy.peer.n} similar agencies.`
                  : `Saca ${gradeTxt} de 10: ${gradeWord(on100, 'es')}. Puesto ${anatomy.peer.rank} de ${anatomy.peer.n} dependencias parecidas.`,
              }}>
              {anatomy.peer.median != null && <p className="ib2-note">{en ? `Its peers' median is ${gradeOutOf10((anatomy.peer.median * 100) / anatomy.ceiling)}.` : `La mediana de sus pares es ${gradeOutOf10((anatomy.peer.median * 100) / anatomy.ceiling)}.`}{anatomy.provisional ? (en ? ' Provisional grade (few contracts).' : ' Calificación provisional (pocos contratos).') : ''}</p>}
            </Block>

            <Block id="c2" sec="C2" lang={lang} title={en ? 'Where it loses points' : 'Dónde pierde puntos'} aside={en ? '2002–2026' : 'periodo 2002–2026'}
              lines={{
                see: en ? `${pillars.length} pillars; each is an equal share of the grade.` : `${pillars.length} pilares; cada uno vale una parte igual de la calificación.`,
                read: en ? 'The dashed part is what it lost. The rule, its peers.' : 'La parte punteada es lo que perdió. La raya, sus pares.',
                means: leadP ? (en
                  ? `It loses most on ${leadP.label_en.toLowerCase()}: ${leadP.lossPts.toFixed(1)} points.${typeof hrv === 'number' ? ` ${Math.round(hrv * 100)} of every 100 pesos go to high or critical contracts.${hrCount != null ? ` By count, only ${hrCount} of every 100 are.` : ''}` : ''}`
                  : `Pierde más por ${isPillar3(leadP.key) ? PILLAR_RULE[leadP.key].word[0] : leadP.label_es.toLowerCase()}: ${leadP.lossPts.toFixed(1)} puntos.${typeof hrv === 'number' ? ` ${Math.round(hrv * 100)} de cada 100 pesos van a contratos con indicador alto o crítico.${hrCount != null ? ` Por número, solo ${hrCount} de cada 100 lo son.` : ''}` : ''}`) : '—',
              }}>
              <div className="ib2-stage"><Pilares pillars={pillars} phone={phone} lead={lead} picked={c3key} onPick={(k) => set({ pilar: k })} lang={lang} /></div>
              <ul className="ib2-ledg">
                {pillars.map((p) => (
                  <li key={p.key} data-on={c3key === p.key}>
                    <h4><button type="button" className="ib2-linkbtn" aria-pressed={c3key === p.key} onClick={() => set({ pilar: p.key })}>{en ? p.label_en : p.label_es}</button><b>−{p.lossPts.toFixed(1)}</b></h4>
                    <ul>{(p.items ?? []).filter((it) => Math.abs(it.points) >= 0.05).map((it) => (
                      <li key={it.key}><span>{itemShort(it.key, lang)}{it.key !== 'ajuste_pares' && it.rate != null && it.peerMedian != null ? (en ? ` · ${Math.round(it.rate * 100)} vs peers ${Math.round(it.peerMedian * 100)}` : ` · ${Math.round(it.rate * 100)} vs pares ${Math.round(it.peerMedian * 100)}`) : ''}</span><span className="ib2-num">{it.points > 0 ? '+' : '−'}{Math.abs(it.points).toFixed(1)}</span></li>
                    ))}</ul>
                  </li>
                ))}
              </ul>
            </Block>

            {c3key && (
              <Block id="c3" sec="C3" lang={lang} title={en ? 'Who drags the grade down' : 'Quién le baja la calificación'} aside={en ? 'the bridge to «Who does it award to?» · 2002–2026' : 'el puente a «¿A quién le adjudica?» · 2002–2026'}
                lines={{
                  see: en ? 'The suppliers behind the chosen pillar, from 2002 to 2026.' : 'Los proveedores detrás del pilar elegido, de 2002 a 2026.',
                  read: en ? 'Each row opens its card; the button lights them in the column.' : 'Cada fila abre su tarjeta; el botón los enciende en la columna.',
                  means: histQ.data ? <Say segs={findingC3(histQ.data.suppliers, c3key, lang)} /> : '…',
                }}>
                <div className="bd ib2-bd">
                  <div className="bd-head"><h3 className="bd-h">{en ? 'Pillar · ' : 'Pilar · '}{(() => { const p = pillars.find((x) => x.key === c3key); return p ? (en ? p.label_en : p.label_es) : c3key })()}</h3>
                    <p className="bd-when">{en ? `the suppliers that ${PILLAR_RULE[c3key].why[1]}` : `los proveedores que ${PILLAR_RULE[c3key].why[0]}`}</p></div>
                  <ol className="ib2-list">
                    {boardHead(SUPCOLS, ['Nº', en ? 'Company' : 'Empresa', c3key === 'competencia' ? (en ? 'No tender' : 'Sin concurso') : c3key === 'proceso' ? (en ? 'Contracts' : 'Contratos') : (en ? 'Of 100 pesos' : 'De 100 pesos'), en ? 'Total' : 'Monto total', en ? 'No tender' : 'Sin concurso', 'Sexenios', en ? 'Indicator' : 'Indicador'])}
                    {c3rows.map((s, k) => supplierRow(s, k, 'c3', SUPCOLS,
                      c3key === 'competencia' ? formatCompactMXN(s.da_amount_mxn) : c3key === 'proceso' ? formatNumber(s.contracts) : (s.share_pct ?? 0).toFixed(1),
                      `${s.first_year_all}–${s.last_year_all}`))}
                  </ol>
                  <p className="bd-note">{en ? 'A row here accuses no one: it shows where the agency loses points against its peers.' : 'Una fila aquí no acusa a nadie: muestra dónde la dependencia pierde puntos frente a sus pares.'}</p>
                </div>
                {slot('c3', histQ.data?.suppliers ?? [], scopeLabel({ vista: 'historia', year: null, gob: null, cat: null }, lang))}
                <p className="ib2-doors"><button type="button" className="ib2-chip" onClick={() => seeInColumn(c3key)}>{en ? 'See these suppliers in the column →' : 'Ver estos proveedores en la columna →'}</button></p>
              </Block>
            )}

            <Block id="c4" sec="C4" lang={lang} title={en ? 'How it is computed' : 'Cómo se calcula'} aside={en ? `grade ${anatomy.methodVersion}` : `calificación ${anatomy.methodVersion}`}
              lines={{
                see: en ? 'Six measures, compared with agencies of the same size and kind.' : 'Seis medidas, comparadas con dependencias del mismo tamaño y tipo.',
                read: en ? 'Each pillar starts at its maximum and loses points where it does worse.' : 'Cada pilar empieza en su máximo y pierde puntos donde sale peor.',
                means: en ? 'It grades how it buys, not whether there is corruption.' : 'Califica cómo compra, no si hay corrupción.',
              }}>
              <p className="ib2-note">{en ? 'Documented cases and sanctions are shown apart, never inside the grade. ' : 'Los casos documentados y las sanciones se muestran aparte, nunca dentro de la nota. '}<Link className="ct-link" to="/methodology">{en ? 'Grade methodology →' : 'Metodología de la calificación →'}</Link></p>
            </Block>
          </>
        )}
      </div>
    </div>
  )
}
