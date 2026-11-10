/**
 * /vendors/:id — the vendor profile on the parts of /institutions/:id B2 (docs/PROFILE_CONTENT_VENDOR_2026-11-05.md v2,
 * «reuse + compact»; shared rules in PROFILE_CONTENT_CATEGORY § «Shared with Institución B2»).
 *
 *   PageHead  crumbs · h1 = the ficha's finding · «¿Quién le compra, qué vende y cuánto riesgo carga?» · three lines · Hoy/Historia
 *   § 1 ficha  the orbit (head accent) + one ledger line of figures
 *   § 2 ¿Quién le compra?  Historia: the loved expediente, 5 lanes + «ver todos», por dinero / por gobierno · the buyers board
 *   § 3 ¿Qué vende?  categories › subcategories on the Portada board
 *   § 4 El riesgo, en una celda  contracts per level, each a link to § 5 filtered; the top reason; tags only when true
 *   § 5 Sus contratos  the register, filtered by level and government; CSV export here
 * One column at every width; ONE inline card under the board a click came from.
 * URL: ?vista=historia · ?orden=gobierno · ?nivel= · ?gob= · ?page=.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { predictionsApi, vendorApi } from '@/api/client'
import { PredictionCallout } from '@/components/kit/PredictionCallout'
import { vendorPredictionText } from '@/lib/predictions'
import type { AriaQueueItem, ContractListItem, VendorDetailResponse, VendorInstitutionsTimelineResponse, VendorWaterfallContribution } from '@/api/types'
import { PageHead, type Lines } from '@/components/kit/PageHead'
import { headTour } from '@/lib/tours'
import { PageQuestion } from '@/components/kit/PageQuestion'
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import { Glyph, LEVEL } from '@/components/portada/Tablero'
import { Frame, RiskChip, SexStrip } from '@/components/institution/b2/B2Card'
import { sectorRankText } from '@/lib/sectorRelative'
import { Expediente, VendorOrbit } from '@/components/vendor/VendorExpediente'
import { PersonaFisicaNote } from '@/components/vendor/PersonaFisicaNote'
import { cleanSubs } from '@/components/categories/CategoryBodega'
import { ADMIN_COLORS, ADMIN_ORDER, type AdministrationKey } from '@/lib/administrations'
import { familyMeta, familyOf } from '@/lib/categories/families'
import { formatEntityName } from '@/lib/entity/format'
import { formatCut } from '@/lib/nav/toc'
import { useDataCut } from '@/lib/useDataCut'
import { csvCell } from '@/lib/atlas/sky/export'
import { formatCompactMXN, formatColumnMXN, formatDualCurrency, formatNumber, rawText } from '@/lib/utils'
import { cieloHref } from '@/lib/vista'
import { whyLine } from '@/lib/vendor/modelReads'
import { GOB_NAME, HOY_FROM, gobYears, type Lang, type Vista } from '@/lib/institution/panorama'
import {
  LEVELS, buyerMeans, catMeans, compactTimeline, cutOf, fichaFinding, gobWords, yearSpan, peakGob, riskMeans, sortBuyers, vendorPanoramaApi,
  type Level, type Orden, type VBuyer, type VCategory,
} from '@/lib/vendor/panorama'
import '@/components/institution/b2/b2.css'
import './vb2.css'

const PER_PAGE = 10
const isGob = (x: string | null): x is AdministrationKey => !!x && (ADMIN_ORDER as readonly string[]).includes(x)
const isLevel = (x: string | null): x is Level => !!x && (LEVELS as string[]).includes(x)
/** a share of 100 pesos: «<1» under one, never a bare 0 */
const share100 = (x: number | null | undefined) => (x == null ? '—' : x > 0 && x < 1 ? '<1' : String(Math.round(x)))
const share1 = (x: number | null | undefined) => (x == null ? '—' : x > 0 && x < 0.1 ? '<0.1' : x.toFixed(1))
const LEVEL_PL: Record<Level, [string, string]> = { critical: ['críticos', 'critical'], high: ['altos', 'high'], medium: ['medios', 'medium'], low: ['bajos', 'low'] }

function Block({ id, sec, title, aside, lines, children }: { id: string; sec: string; title: string; aside?: ReactNode; lines: Lines; lang: Lang; children: ReactNode }) {
  return (
    <section className="ib2-blk" id={id} aria-labelledby={`${id}-h`}>
      <div className="ib2-blk-h"><h2 id={`${id}-h`}><span className="ib2-sec">{sec}</span>{title}</h2>{aside && <span className="ib2-aside">{aside}</span>}</div>
      {/* one bold finding per § (owner 11-06 rule on the contract page; AUDIT 11-07 #4): the see/read pair lives once, in the head */}
      <p className="vb2-means">{lines.means}</p>
      {children}
    </section>
  )
}

export interface VendorB2Props {
  vendorId: number
  vendor: VendorDetailResponse
  timeline: VendorInstitutionsTimelineResponse | undefined
  timelineLoading: boolean
  caseYear: number | null
  aria: AriaQueueItem | null | undefined
  waterfall: VendorWaterfallContribution[] | null | undefined
  tags: { gt: boolean; efos: boolean; sfp: boolean }
  onNetwork: () => void
  lang: Lang
}

export function VendorB2({ vendorId: id, vendor, timeline, timelineLoading, caseYear, aria, waterfall, tags, onNetwork, lang }: VendorB2Props) {
  const en = lang === 'en'
  const cut = useDataCut()
  const cutTxt = formatCut(cut, lang)
  const qc = useQueryClient()
  const [sp, setSp] = useSearchParams()
  // owner 11-07: suppliers open on Historia (2002–2026); «Hoy · Sheinbaum» is the switch
  const vista: Vista = sp.get('vista') === 'hoy' ? 'hoy' : 'historia'
  const orden: Orden = vista === 'historia' && sp.get('orden') === 'gobierno' ? 'gobierno' : 'dinero'
  const nivelRaw = sp.get('nivel'), nivel = isLevel(nivelRaw) ? nivelRaw : null
  const gobRaw = sp.get('gob'), gob = vista === 'historia' && isGob(gobRaw) ? gobRaw : null
  const page = Math.max(1, Math.floor(Number(sp.get('page'))) || 1)
  const set = useCallback((patch: Record<string, string | null>) => {
    setSp((prev) => {
      const n = new URLSearchParams(prev)
      for (const [k, v] of Object.entries(patch)) { if (v == null) n.delete(k); else n.set(k, v) }
      return n
    }, { replace: true, preventScrollReset: true })
  }, [setSp])

  // ── data ──
  const pq = (q: { since?: string; until?: string }) => ({ queryKey: ['vendor-b2', id, 'panorama', q], queryFn: () => vendorPanoramaApi.get(id, q), staleTime: 10 * 60 * 1000, retry: 1 })
  const baseQ = useQuery(pq(cutOf(vista, null)))
  const base = baseQ.data
  const kcut = cutOf(vista, gob)
  const kq = useQuery({
    queryKey: ['vendor-b2', id, 'contracts', vista, gob, nivel, page],
    queryFn: () => vendorApi.getContracts(id, { page, per_page: PER_PAGE, sort_by: vista === 'hoy' ? 'contract_date' : 'amount_mxn', sort_order: 'desc', ...(nivel ? { risk_level: nivel } : {}), ...kcut }),
    placeholderData: keepPreviousData,
    staleTime: 10 * 60 * 1000,
  })

  // ── the ONE card + focus return ──
  type Open = { host: 'buyers'; id: number } | { host: 'cats'; id: number }
  const [open, setOpen] = useState<Open | null>(null)
  const opener = useRef<Element | null>(null)
  const close = useCallback(() => {
    setOpen(null)
    const el = opener.current as HTMLElement | null
    opener.current = null
    if (el && document.contains(el)) el.focus({ preventScroll: true })
  }, [])
  const pick = (o: Open, el: Element | null) => {
    setOpen((cur) => (cur && cur.host === o.host && cur.id === o.id ? null : o))
    opener.current = el
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // a dialog (network modal, search) or a field owns its own Esc
      if (e.key !== 'Escape' || !open || e.defaultPrevented || (document.activeElement as Element | null)?.closest('[role=dialog], input, textarea, select')) return
      close()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, close])
  useEffect(() => { setOpen(null) }, [vista, orden])
  const [allBuyers, setAllBuyers] = useState(false)
  const [allLanes, setAllLanes] = useState(false)
  const [allCats, setAllCats] = useState(false)

  // ── head ──
  const name = formatEntityName('vendor', vendor.name, 'full')
  const pf = !!(vendor.persona_fisica || aria?.persona_fisica)
  // «Si sigue así» (docs/PREDICTIONS_SPECIFIC_2026-11-07.md): companies only — never fetched for a persona física
  const predQ = useQuery({ queryKey: ['prediction-vendor', id], queryFn: () => predictionsApi.vendor(id), enabled: !pf, staleTime: 30 * 60 * 1000, retry: false })
  const finding = base ? fichaFinding(base, formatDualCurrency(base.amount_mxn), vista, lang) : <span className="ib2-hold-line" aria-busy="true">{name}</span>
  const bm = base ? buyerMeans(base.buyers, lang) : null
  const instChip = (b: VBuyer) => <EntityIdentityChip type="institution" id={b.institution_id} name={b.name} variant="name" size="inherit" fullName />
  const periodTxt = vista === 'hoy'
    ? (en ? `CompraNet + ComprasMX since Oct 1, 2024 · data to ${cutTxt}` : `CompraNet + ComprasMX desde el 1 oct 2024 · datos hasta ${cutTxt}`)
    : (en ? `CompraNet 2002–Sep 2025 + ComprasMX · data to ${cutTxt}` : `CompraNet 2002–sep 2025 + ComprasMX · datos hasta ${cutTxt}`)
  const toolbar = (
    <>
      <span className="ib2-vista" role="group" aria-label={en ? 'Period' : 'Periodo'}>
        <button type="button" aria-pressed={vista === 'hoy'} onClick={() => set({ vista: 'hoy', orden: null, gob: null, page: null })}>{en ? 'Today · Sheinbaum (Oct 2024 →)' : 'Hoy · Sheinbaum (oct 2024 →)'}</button>
        <button type="button" aria-pressed={vista === 'historia'} onClick={() => set({ vista: null, page: null })}>{en ? 'History · 2002–2026' : 'Historia · 2002–2026'}</button>
      </span>
      <span className="ib2-cut">{periodTxt}</span>
    </>
  )

  // ── § 2 buyers ──
  const buyers = useMemo(() => sortBuyers(base?.buyers ?? [], orden), [base, orden])
  const shownBuyers = buyers.slice(0, allBuyers ? 50 : 5)
  const lanesData = useMemo(() => (timeline && base ? compactTimeline(timeline, orden, allLanes ? 8 : 5, base.buyers) : undefined), [timeline, base, orden, allLanes])
  const nTop = timeline?.institutions.filter((i) => i.is_top).length ?? 0
  const BCOLS = 'minmax(36px, auto) minmax(0, 1.6fr) 110px 100px 72px 140px'
  const boardHead = (cols: string, cells: string[]) => (
    <li className="ib2-row ib2-cols" style={{ gridTemplateColumns: cols }} aria-hidden="true">{cells.map((c, i) => <span key={i} className={i > 1 && i < cells.length - 1 ? 'r' : undefined}>{c}</span>)}</li>
  )
  const openBtn = (o: Open, k: number, label: string) => {
    const opened = open?.host === o.host && open.id === o.id
    return <button type="button" className="bd-rk ib2-open" aria-expanded={opened} onClick={(e) => pick(o, e.currentTarget)} aria-label={en ? `Open the card of ${label}` : `Abrir la tarjeta de ${label}`}>{String(k + 1).padStart(3, '0')}</button>
  }
  const rowClick = (o: Open) => (e: React.MouseEvent<HTMLLIElement>) => { if (!(e.target as Element).closest('a, button')) pick(o, e.currentTarget.querySelector('button')) }

  // ── § 3 categories ──
  const cats = useMemo(() => (base?.categories ?? []).map((c) => ({ ...c, subs: cleanSubs(c.subs.map((s) => ({ ...s, total_value: s.amount_mxn, name_es: s.name_es ?? '', name_en: s.name_en ?? '', code: s.code ?? undefined }))) })), [base])
  const shownCats = cats.slice(0, allCats ? 12 : 5)
  const catName = (c: VCategory) => (en ? c.name_en : c.name_es) ?? `#${c.category_id}`
  const CCOLS = 'minmax(36px, auto) minmax(0, 1.8fr) 90px 110px 100px 140px'

  // ── § 4 risk ──
  const levels = base?.levels
  const why = whyLine(waterfall, lang)
  const toLevel = (l: Level | null) => { set({ nivel: l, page: null }); requestAnimationFrame(() => document.getElementById('v5')?.scrollIntoView({ block: 'start' })) }

  // ── § 5 contracts ──
  const rows: ContractListItem[] = kq.data?.data ?? []
  const total = kq.data?.pagination.total ?? 0
  const pages = Math.max(1, Math.ceil(total / PER_PAGE))
  const direct = rows.filter((k) => k.is_direct_award).length
  const [csv, setCsv] = useState<'idle' | 'busy' | 'error'>('idle')
  async function exportCsv() {
    if (csv === 'busy') return
    setCsv('busy')
    try {
      const all: ContractListItem[] = await qc.fetchQuery({
        queryKey: ['vendor-b2', id, 'contracts', 'csv', vista, gob, nivel],
        queryFn: async () => {
          const out: ContractListItem[] = []
          for (let p = 1; ; p++) {
            const res = await vendorApi.getContracts(id, { page: p, per_page: 100, ...(nivel ? { risk_level: nivel } : {}), ...kcut })
            out.push(...res.data)
            if (res.data.length === 0 || out.length >= res.pagination.total) break
          }
          return out
        },
      })
      const head = ['contract_id', 'title', 'amount_mxn', 'procedure_type', 'institution_name', 'contract_date', 'risk_score', 'risk_level', 'source']
      const body = all.map((c) => [c.id, rawText(c, 'title'), c.amount_mxn ?? '', c.procedure_type ?? '', rawText(c, 'institution_name'), c.contract_date ?? c.contract_year ?? '', c.risk_score ?? '', c.risk_level ?? '', c.source_structure === 'E' ? 'ComprasMX' : 'CompraNet'])
      const blob = new Blob([[head.join(','), ...body.map((r) => r.map(csvCell).join(','))].join('\n')], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `vendor-${id}-contracts${vista === 'hoy' ? '-hoy' : gob ? `-${gob}` : ''}${nivel ? `-${nivel}` : ''}.csv`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 100)
      setCsv('idle')
    } catch {
      setCsv('error')
    }
  }
  const KCOLS = '92px minmax(0, 1.3fr) minmax(0, 1fr) 110px 110px 140px'

  return (
    <div className="ib2 vb2">
      <PageHead lang={lang}
        crumbs={[{ label: en ? 'Vendors' : 'Proveedores', to: '/vendors' }, { label: formatEntityName('vendor', vendor.name, 'sm') }]}
        actions={<PageQuestion bare {...headTour('vendor', lang)} />}
        kicker={<>{name}{pf && <span className="ib2-pf">{en ? ' · individual (persona física)' : ' · persona física'}</span>}</>}
        finding={finding}
        question={en ? 'Who buys from it, what does it sell, and how much risk does it carry?' : '¿Quién le compra, qué vende y cuánto riesgo carga?'}
        lines={{
          see: vista === 'hoy' ? (en ? 'What it was paid under this government, in how many contracts.' : 'Cuánto cobró con este gobierno, en cuántos contratos.') : (en ? 'What it was paid, in how many contracts, since when.' : 'Cuánto cobró, en cuántos contratos, desde cuándo.'),
          read: en ? "Pesos of each year, with dollars; CompraNet and ComprasMX together." : 'Montos en pesos de cada año; CompraNet y ComprasMX juntos.',
          means: base ? riskMeans(base.levels, lang) : '…',
        }}
        toolbar={toolbar} />
      {pf && <PersonaFisicaNote vendorId={id} lang={lang} />}

      {/* § 1 la ficha: the orbit (accent) + one line of figures */}
      <div className="vb2-ficha">
        {timeline && timeline.years.length > 0 && <VendorOrbit data={timeline} vendorId={id} lang={lang} className="vb2-orbit" />}
        {base && (
          <dl className="ib2-ledger vb2-ledger" aria-label={en ? 'The record in figures' : 'La ficha en cifras'}>
            <div><dt>{vista === 'hoy' ? (en ? 'Paid since Oct 2024' : 'Cobrado desde oct 2024') : (en ? 'Paid 2002–2026' : 'Cobrado 2002–2026')}</dt><dd>{formatDualCurrency(base.amount_mxn)}</dd></div>
            <div><dt>{en ? 'Contracts' : 'Contratos'}</dt><dd>{formatNumber(base.contracts)}</dd></div>
            <div><dt>{en ? 'Buyers' : 'Compradores'}</dt><dd>{formatNumber(base.buyers_n)}</dd></div>
            <div><dt>{en ? 'Without a tender' : 'Sin concurso'}</dt><dd>{base.da_pct == null ? '—' : en ? `${Math.round(base.da_pct)} of every 100` : `${Math.round(base.da_pct)} de cada 100`}</dd></div>
            <div><dt>{en ? 'Years' : 'Años'}</dt><dd>{base.first_year ? yearSpan(base.first_year, base.last_year) : '—'}</dd></div>
          </dl>
        )}
      </div>
      <PredictionCallout text={vendorPredictionText(predQ.data, !en, pf)} />
      {baseQ.isError && <p className="ib2-note" role="alert">{en ? 'Part of this record did not load; reload in a moment.' : 'Parte de este registro no cargó; recargue en un momento.'}</p>}

      <Block id="v2" sec="§ 2" lang={lang} title={en ? 'Who buys from it?' : '¿Quién le compra?'}
        aside={base ? (en ? `${formatNumber(base.buyers_n)} buyers · ${vista === 'hoy' ? 'since Oct 2024' : '2002–2026'}` : `${formatNumber(base.buyers_n)} compradores · ${vista === 'hoy' ? 'desde oct 2024' : '2002–2026'}`) : undefined}
        lines={{
          see: vista === 'historia' ? (en ? 'Each row is a buyer; each column, a year.' : 'Cada fila es un comprador; cada columna, un año.') : (en ? 'Its buyers under this government, the largest first.' : 'Sus compradores con este gobierno, el mayor primero.'),
          read: vista === 'historia' ? (en ? 'Wider is more money; a square, no tender. Sort by government.' : 'Más ancho, más dinero; el cuadrado, sin concurso. Ordene por gobierno.') : (en ? 'Tap a row: its card opens here.' : 'Toque una fila: su tarjeta se abre aquí.'),
          means: bm?.buyer ? <>{instChip(bm.buyer)}{bm.text}</> : (bm?.text ?? '…'),
        }}>
        {vista === 'hoy' && (
          // RED 11-06: the loved expediente must stay one click away in Hoy
          <p className="vb2-door"><button type="button" className="ct-link" onClick={() => { set({ vista: 'historia', page: null }); requestAnimationFrame(() => document.getElementById('v2')?.scrollIntoView({ block: 'start' })) }}>
            {en ? 'See its history by administration →' : 'Ver su historia por sexenios →'}</button></p>
        )}
        {vista === 'historia' && (
          <div className="ib2-lens" role="group" aria-label={en ? 'Order' : 'Orden'}>
            <button type="button" aria-pressed={orden === 'dinero'} onClick={() => set({ orden: null })}>{en ? 'by money' : 'por dinero'}</button>
            <button type="button" aria-pressed={orden === 'gobierno'} onClick={() => set({ orden: 'gobierno' })}>{en ? 'by government' : 'por gobierno'}</button>
          </div>
        )}
        {vista === 'historia' && (lanesData || timelineLoading) && (
          <div className="vb2-exp">
            <Expediente data={lanesData} loading={timelineLoading || !lanesData} contractsHref={`/contracts?vendor_id=${id}`}
              extend={caseYear != null ? (m) => ({ facts: caseYear >= m.start && caseYear <= m.end ? [{ year: caseYear, kind: 'case' as const }] : [], claims: [] }) : undefined}
              counts={Object.fromEntries((base?.buyers ?? []).map((b) => [b.institution_id, b.contracts]))} lang={lang} />
            {nTop > 5 && (
              <button type="button" className="bd-link ib2-more" aria-expanded={allLanes} onClick={() => setAllLanes((v) => !v)}>
                {allLanes ? (en ? 'Show 5 lanes' : 'Ver 5 carriles') : (en ? `Show all ${nTop} lanes` : `Ver los ${nTop} carriles`)}
              </button>
            )}
          </div>
        )}
        <div className="bd ib2-bd">
          <div className="bd-head"><h3 className="bd-h">{orden === 'gobierno' ? (en ? 'By the government that paid most' : 'Por el gobierno que más le pagó') : (en ? 'Its largest buyers' : 'Sus mayores compradores')}</h3>
            <p className="bd-when">{base ? (en ? `${shownBuyers.length} of ${formatNumber(base.buyers_n)}` : `${shownBuyers.length} de ${formatNumber(base.buyers_n)}`) : ''}</p></div>
          <ol className="ib2-list">
            {boardHead(BCOLS, ['Nº', en ? 'Buyer' : 'Comprador', en ? 'Amount' : 'Monto', en ? 'No tender' : 'Sin concurso', 'Sexenios', en ? 'Indicator' : 'Indicador'])}
            {shownBuyers.map((b, k) => {
              const o: Open = { host: 'buyers', id: b.institution_id }
              const g = peakGob(b)
              return (
                <li key={b.institution_id} className={`ib2-row${open?.host === 'buyers' && open.id === b.institution_id ? ' is-pick' : ''}`} style={{ gridTemplateColumns: BCOLS }} onClick={rowClick(o)}
                  title={`${formatEntityName('institution', b.name, 'full')} · ${formatCompactMXN(b.amount_mxn)}`}>
                  {openBtn(o, k, formatEntityName('institution', b.name, 'full'))}
                  <span className="ib2-name">{instChip(b)}
                    <span className="ib2-sub">{en ? `${share1(b.share_pct)} of every 100 pesos` : `${share1(b.share_pct)} de cada 100 pesos`}{vista === 'historia' && g ? ` · ${gobWords(g, lang)}` : ''}{b.first_year ? ` · ${yearSpan(b.first_year, b.last_year)}` : ''}</span></span>
                  <span className="r bd-amt">{formatColumnMXN(b.amount_mxn)}</span>
                  <span className="r ib2-c">{b.da_pct == null ? '—' : en ? `${Math.round(b.da_pct)} of 100` : `${Math.round(b.da_pct)} de 100`}</span>
                  <span className="ib2-c"><SexStrip years={b.years} first={b.first_year ?? 0} last={b.last_year ?? 0} lang={lang} /></span>
                  <span className="r"><RiskChip score={b.avg_risk} lang={lang} /></span>
                </li>
              )
            })}
          </ol>
          {buyers.length > 5 && <button type="button" className="bd-link ib2-more" aria-expanded={allBuyers} onClick={() => setAllBuyers((v) => !v)}>{allBuyers ? (en ? 'Show 5' : 'Ver 5') : (en ? `Show all ${buyers.length}` : `Ver los ${buyers.length}`)}</button>}
          <p className="bd-note">{en ? '«Indicator» = average risk indicator of its contracts with that buyer; a signal, not proof.' : '«Indicador» = promedio del indicador de riesgo de sus contratos con ese comprador; una señal, no una prueba.'}</p>
        </div>
        {open?.host === 'buyers' && (() => { const b = buyers.find((x) => x.institution_id === open.id); return b ? <BuyerCard key={b.institution_id} b={b} vendorId={id} vista={vista} lang={lang} onClose={close} /> : null })()}
      </Block>

      <Block id="v3" sec="§ 3" lang={lang} title={en ? 'What does it sell?' : '¿Qué vende?'}
        aside={base ? (en ? `${cats.length} categories` : `${cats.length} categorías`) : undefined}
        lines={{
          see: en ? 'What it sells the government, by kind of purchase.' : 'Lo que le vende al gobierno, por tipo de compra.',
          read: en ? 'Under each category, its largest mini-categories. Each row opens its card.' : 'Bajo cada categoría, sus mayores minicategorías. Cada fila abre su tarjeta.',
          means: base ? catMeans(base.categories, lang) : '…',
        }}>
        <div className="bd ib2-bd">
          <div className="bd-head"><h3 className="bd-h">{en ? 'What it sells most' : 'Lo que más vende'}</h3><p className="bd-when">{en ? 'category › mini-categories' : 'categoría › minicategorías'}</p></div>
          <ol className="ib2-list">
            {boardHead(CCOLS, ['Nº', en ? 'Category' : 'Categoría', en ? 'Contracts' : 'Contratos', en ? 'Amount' : 'Monto', en ? 'No tender' : 'Sin concurso', en ? 'Indicator' : 'Indicador'])}
            {shownCats.map((c, k) => {
              const f = familyMeta(familyOf(c.category_id)), nm = catName(c), o: Open = { host: 'cats', id: c.category_id }
              return (
                <li key={c.category_id} className={`ib2-row${open?.host === 'cats' && open.id === c.category_id ? ' is-pick' : ''}`} style={{ gridTemplateColumns: CCOLS }} onClick={rowClick(o)}>
                  {openBtn(o, k, nm)}
                  <span className="ib2-name"><i className="ib2-sw" style={{ background: f.color }} aria-hidden="true" /><EntityIdentityChip type="category" id={c.category_id} name={nm} variant="name" size="inherit" />
                    <span className="ib2-sub">{share100(c.share_pct)} {en ? 'of 100 pesos' : 'de 100 pesos'}{c.subs.length ? ` › ${c.subs.slice(0, 2).map((s) => `${en ? s.name_en : s.name_es} ${share100(s.share_pct)}`).join(' · ')}` : ''}</span></span>
                  <span className="r ib2-c">{formatNumber(c.contracts)}</span>
                  <span className="r bd-amt">{formatColumnMXN(c.amount_mxn)}</span>
                  <span className="r ib2-c">{c.da_pct == null ? '—' : en ? `${Math.round(c.da_pct)} of 100` : `${Math.round(c.da_pct)} de 100`}</span>
                  <span className="r"><RiskChip score={c.avg_risk} lang={lang} /></span>
                </li>
              )
            })}
          </ol>
          {cats.length > 5 && <button type="button" className="bd-link ib2-more" aria-expanded={allCats} onClick={() => setAllCats((v) => !v)}>{allCats ? (en ? 'Show 5' : 'Ver 5') : (en ? `Show all ${cats.length}` : `Ver las ${cats.length}`)}</button>}
        </div>
        {open?.host === 'cats' && (() => { const c = cats.find((x) => x.category_id === open.id); return c ? <CatCard key={c.category_id} c={c} name={catName(c)} vista={vista} lang={lang} onClose={close} /> : null })()}
      </Block>

      <Block id="v4" sec="§ 4" lang={lang} title={en ? 'The risk, in one cell' : 'El riesgo, en una celda'}
        aside={en ? <>indicator v0.9.2 · <Link className="ct-link" to="/methodology">why →</Link></> : <>indicador v0.9.2 · <Link className="ct-link" to="/methodology">por qué →</Link></>}
        lines={{
          see: en ? 'Its contracts by level of the risk indicator.' : 'Sus contratos por nivel del indicador de riesgo.',
          read: en ? 'Each number opens those contracts below. A signal, not proof.' : 'Cada número abre esos contratos abajo. Una señal, no una prueba.',
          means: levels ? riskMeans(levels, lang) : '…',
        }}>
        {levels && base && (
          <div className="vb2-cell">
            <p className="vb2-counts">
              <button type="button" className="vb2-n" aria-pressed={nivel == null} onClick={() => toLevel(null)}><b>{formatNumber(base.contracts)}</b> {en ? 'contracts' : 'contratos'}</button>
              {LEVELS.map((l) => (
                <span key={l}>{' · '}
                  <button type="button" className={`vb2-n is-${l}`} aria-pressed={nivel === l} disabled={!levels[l]} onClick={() => toLevel(l)}>
                    <b>{formatNumber(levels[l])}</b> {en ? LEVEL_PL[l][1] : LEVEL_PL[l][0]}
                  </button>
                </span>
              ))}
              {levels.none > 0 && <span className="ib2-dim">{' · '}{formatNumber(levels.none)} {en ? 'unscored' : 'sin indicador'}</span>}
            </p>
            {vendor.avg_risk_score != null && sectorRankText(vendor.sector_pct, lang) && (
              <p className="vb2-why"><RiskChip score={vendor.avg_risk_score} lang={lang} /> · {sectorRankText(vendor.sector_pct, lang)}</p>
            )}
            {why && <p className="vb2-why">{why}</p>}
            {(tags.gt || tags.efos || tags.sfp || aria?.ips_tier) && (
              <p className="vb2-tags">
                {tags.gt && <span className="bd-tag is-flag">{en ? 'documented case' : 'caso documentado'}</span>}
                {tags.efos && <span className="bd-tag is-flag">SAT 69-B</span>}
                {tags.sfp && <span className="bd-tag is-flag">{en ? 'SFP sanction' : 'sanción SFP'}</span>}
                {aria?.ips_tier && <Link className="bd-tag is-flag" to={`/aria/caso/${id}`}>{en ? `investigation line · tier ${aria.ips_tier}` : `en la fila de investigación · nivel ${aria.ips_tier}`}</Link>}
              </p>
            )}
            <p className="ib2-doors">
              <button type="button" className="ib2-chip" onClick={onNetwork}>{en ? 'Its co-bidders network →' : 'Su red de co-licitantes →'}</button>
              <Link className="ib2-chip" to={cieloHref({ planet: id })}>{en ? 'See it in El Mapa →' : 'Verlo en El Mapa →'}</Link>
            </p>
          </div>
        )}
      </Block>

      <Block id="v5" sec="§ 5" lang={lang} title={en ? 'Its contracts' : 'Sus contratos'}
        aside={en ? `${formatNumber(total)} with this filter · ${vista === 'hoy' ? 'most recent first' : 'largest first'}` : `${formatNumber(total)} con este filtro · ${vista === 'hoy' ? 'los más recientes primero' : 'los más grandes primero'}`}
        lines={{
          see: en ? 'Its contracts, one per row, filtered by level and government.' : 'Sus contratos, uno por fila, filtrados por nivel y gobierno.',
          read: en ? 'Date, buyer, amount, how it was awarded and its indicator.' : 'Fecha, comprador, monto, cómo se adjudicó y su indicador.',
          means: rows.length ? (en ? `${direct} of the ${rows.length} on this page had no tender.` : `${direct} de los ${rows.length} de esta página, sin concurso.`) : (kq.isLoading ? '…' : (en ? 'No contracts with this filter.' : 'Sin contratos con este filtro.')),
        }}>
        <div className="vb2-filters">
          <span className="ib2-lens" role="group" aria-label={en ? 'Level' : 'Nivel'}>
            <button type="button" aria-pressed={nivel == null} onClick={() => set({ nivel: null, page: null })}>{en ? 'all levels' : 'todos los niveles'}</button>
            {LEVELS.map((l) => <button key={l} type="button" aria-pressed={nivel === l} onClick={() => set({ nivel: l, page: null })}>{LEVEL[l][lang]}</button>)}
          </span>
          {vista === 'historia' && (
            <span className="ib2-lens" role="group" aria-label={en ? 'Government' : 'Gobierno'}>
              <button type="button" aria-pressed={gob == null} onClick={() => set({ gob: null, page: null })}>{en ? 'every government' : 'todos los gobiernos'}</button>
              {ADMIN_ORDER.map((g) => <button key={g} type="button" aria-pressed={gob === g} onClick={() => set({ gob: g, page: null })} style={{ ['--gob' as string]: ADMIN_COLORS[g] }} className="vb2-gob">{GOB_NAME[g]}</button>)}
            </span>
          )}
        </div>
        <div className="bd ib2-bd">
          <div className="bd-head"><h3 className="bd-h">{en ? 'The register' : 'El registro'}</h3><p className="bd-when">{en ? '■ direct · ● tendered' : '■ directa · ● con concurso'}</p></div>
          <ol className={`ib2-list${kq.isPlaceholderData ? ' is-stale' : ''}`} aria-busy={kq.isFetching}>
            {boardHead(KCOLS, [en ? 'Date' : 'Fecha', en ? 'Buyer' : 'Comprador', en ? 'What' : 'Qué', en ? 'Amount' : 'Monto', en ? 'How' : 'Cómo', en ? 'Indicator' : 'Indicador'])}
            {rows.map((k) => (
              <li key={k.id} className="ib2-row is-k" style={{ gridTemplateColumns: KCOLS }}>
                <span className="bd-rk">{k.contract_date?.slice(0, 10) ?? k.contract_year}</span>
                <span className="ib2-name">{k.institution_id ? <EntityIdentityChip type="institution" id={k.institution_id} name={k.institution_name} variant="name" size="inherit" fullName /> : '—'}
                  {k.source_structure === 'E' && <span className="bd-tag is-flag">ComprasMX</span>}</span>
                <span className="ib2-say"><Link to={`/contracts/${k.id}`}>{(k.title ?? '—').toLowerCase()}</Link></span>
                <span className="r bd-amt">{formatColumnMXN(k.amount_mxn)}</span>
                <span><Glyph p={k.is_direct_award ? 'directa' : 'concurso'} />{k.is_direct_award ? (en ? 'direct' : 'directa') : (en ? 'tender' : 'concurso')}</span>
                <span className="r"><RiskChip score={k.risk_score} lang={lang} avg={false} /></span>
              </li>
            ))}
          </ol>
          <div className="vb2-pager">
            <button type="button" className="ib2-chip" disabled={page <= 1} onClick={() => set({ page: page <= 2 ? null : String(page - 1) })}>{en ? '← previous' : '← anteriores'}</button>
            <span className="ib2-num">{en ? `page ${page} of ${formatNumber(pages)}` : `página ${page} de ${formatNumber(pages)}`}</span>
            <button type="button" className="ib2-chip" disabled={page >= pages} onClick={() => set({ page: String(page + 1) })}>{en ? 'next →' : 'siguientes →'}</button>
            <button type="button" className="ib2-chip vb2-csv" onClick={exportCsv} disabled={csv === 'busy'} aria-busy={csv === 'busy' || undefined}>
              {csv === 'busy' ? (en ? 'Exporting…' : 'Exportando…') : (en ? `Export these ${formatNumber(total)} (CSV)` : `Exportar estos ${formatNumber(total)} (CSV)`)}
            </button>
            {csv === 'error' && <span role="alert" className="ib2-note">{en ? 'The export failed. Try again.' : 'No se pudo exportar. Vuelva a intentarlo.'}</span>}
          </div>
          <p className="bd-note">{en ? 'ComprasMX rows (after 28 Sep 2025, when CompraNet froze) are labelled in the same list.' : 'Las filas de ComprasMX (desde el 28 sep 2025, cuando CompraNet se congeló) van marcadas en la misma lista.'}</p>
        </div>
      </Block>
    </div>
  )
}

function BuyerCard({ b, vendorId, vista, lang, onClose }: { b: VBuyer; vendorId: number; vista: Vista; lang: Lang; onClose: () => void }) {
  const en = lang === 'en'
  const since = vista === 'hoy' ? HOY_FROM : undefined
  const { data: top } = useQuery({
    queryKey: ['vendor-b2', vendorId, 'buyer-contracts', b.institution_id, since ?? 'all'],
    queryFn: () => vendorApi.getContracts(vendorId, { institution_id: b.institution_id, per_page: 3, sort_by: 'amount_mxn', sort_order: 'desc', ...(since ? { since } : {}) }),
    staleTime: 10 * 60 * 1000,
  })
  const g = peakGob(b)
  return (
    <Frame lang={lang} onClose={onClose} label={b.name ?? String(b.institution_id)} title={<EntityIdentityChip type="institution" id={b.institution_id} name={b.name} variant="name" fullName />}>
      <div className="ib2-cgrid">
        <dl>
          <div><dt>{vista === 'hoy' ? (en ? 'Under this government' : 'Con este gobierno') : (en ? '2002–2026' : 'De 2002 a 2026')}</dt><dd>{formatDualCurrency(b.amount_mxn)} · {formatNumber(b.contracts)} {en ? 'contracts' : 'contratos'}</dd></div>
          <div><dt>{en ? 'Of every 100 pesos' : 'De cada 100 pesos'}</dt><dd>{(b.share_pct ?? 0) < 1 ? share1(b.share_pct) : Math.round(b.share_pct ?? 0)}</dd></div>
          <div><dt>{en ? 'Years with this buyer' : 'Años con este comprador'}</dt><dd>{b.first_year != null && yearSpan(b.first_year, b.last_year)} <SexStrip years={b.years} first={b.first_year ?? 0} last={b.last_year ?? 0} lang={lang} /></dd></div>
          {vista === 'historia' && g && <div><dt>{en ? 'Paid most under' : 'Le pagó más con'}</dt><dd><span className="ib2-band" style={{ background: ADMIN_COLORS[g] }} aria-hidden="true" /> {GOB_NAME[g]} · {Math.max(2002, gobYears(g)[0])}–{Math.min(2026, gobYears(g)[1])}</dd></div>}
          <div><dt>{en ? 'Without a tender' : 'Sin concurso'}</dt><dd>{b.da_pct == null ? '—' : en ? `${Math.round(b.da_pct)} of every 100 contracts` : `${Math.round(b.da_pct)} de cada 100 contratos`}</dd></div>
          <div><dt>{en ? 'Risk indicator' : 'Indicador de riesgo'}</dt><dd><RiskChip score={b.avg_risk} lang={lang} /> <span className="ib2-dim">{en ? 'average with this buyer' : 'promedio con este comprador'}</span></dd></div>
        </dl>
        <div>
          <p className="ib2-k">{en ? `Its 3 largest contracts with this buyer${vista === 'hoy' ? ' under this government' : ''}` : `Sus 3 contratos mayores con este comprador${vista === 'hoy' ? ' con este gobierno' : ''}`}</p>
          {top?.data.length ? (
            <ul className="ib2-klist">
              {top.data.map((k) => (
                <li key={k.id}>
                  <Link to={`/contracts/${k.id}`} title={k.title ?? undefined}><span className="ib2-num">{k.contract_date?.slice(0, 10) ?? k.contract_year}</span> {(k.title ?? '').toLowerCase().slice(0, 70)}{(k.title ?? '').length > 70 ? '…' : ''}</Link>
                  <span className="ib2-num">{formatCompactMXN(k.amount_mxn)}{k.is_direct_award ? (en ? ' · direct' : ' · directa') : ''}</span>
                  <RiskChip score={k.risk_score} lang={lang} avg={false} />
                </li>
              ))}
            </ul>
          ) : top ? <p className="ib2-note">{en ? 'No contracts in this period.' : 'Sin contratos en este periodo.'}</p> : <div className="ib2-hold" aria-hidden="true" />}
          <p className="ib2-doors">
            <Link className="ib2-chip" to={`/institutions/${b.institution_id}`}>{en ? 'Open the institution →' : 'Ver la institución →'}</Link>
            <Link className="ib2-chip" to={`/contracts?vendor_id=${vendorId}&institution_id=${b.institution_id}`}>{en ? 'All their contracts →' : 'Todos sus contratos →'}</Link>
          </p>
        </div>
      </div>
    </Frame>
  )
}

function CatCard({ c, name, vista, lang, onClose }: { c: VCategory; name: string; vista: Vista; lang: Lang; onClose: () => void }) {
  const en = lang === 'en'
  const f = familyMeta(familyOf(c.category_id))
  return (
    <Frame lang={lang} onClose={onClose} label={name} title={<>
      <EntityIdentityChip type="category" id={c.category_id} name={name} variant="name" />
      <span className="ib2-dim"><i className="ib2-sw" style={{ background: f.color }} aria-hidden="true" />{en ? f.en : f.es}</span>
    </>}>
      <div className="ib2-cgrid">
        <dl>
          <div><dt>{vista === 'hoy' ? (en ? 'Under this government' : 'Con este gobierno') : (en ? '2002–2026' : 'De 2002 a 2026')}</dt><dd>{formatDualCurrency(c.amount_mxn)} · {formatNumber(c.contracts)} {en ? 'contracts' : 'contratos'}</dd></div>
          <div><dt>{en ? 'Of every 100 pesos' : 'De cada 100 pesos'}</dt><dd>{share100(c.share_pct)}</dd></div>
          <div><dt>{en ? 'Without a tender' : 'Sin concurso'}</dt><dd>{c.da_pct == null ? '—' : en ? `${Math.round(c.da_pct)} of every 100 contracts` : `${Math.round(c.da_pct)} de cada 100 contratos`}</dd></div>
          <div><dt>{en ? 'Average indicator' : 'Indicador promedio'}</dt><dd><RiskChip score={c.avg_risk} lang={lang} /></dd></div>
        </dl>
        <div>
          <p className="ib2-k">{en ? 'Its largest mini-categories' : 'Sus mayores minicategorías'}</p>
          {c.subs.length ? (
            <ul className="ib2-klist">
              {c.subs.map((s) => (
                <li key={s.subcategory_id}>
                  <span>{en ? s.name_en : s.name_es}</span>
                  <span className="ib2-num">{formatCompactMXN(s.amount_mxn)} · {formatNumber(s.contracts)} {en ? 'contracts' : 'contratos'}</span>
                  <span className="ib2-num">{s.da_pct == null ? '—' : en ? `${Math.round(s.da_pct)} of 100 no tender` : `${Math.round(s.da_pct)} de 100 sin concurso`}</span>
                </li>
              ))}
            </ul>
          ) : <p className="ib2-note">{en ? 'No mini-category on record.' : 'Sin minicategoría registrada.'}</p>}
          <p className="ib2-doors"><Link className="ib2-chip" to={`/categories/${c.category_id}`}>{en ? 'Open its box in La bodega →' : 'Abrir su caja en La bodega →'}</Link></p>
        </div>
      </div>
    </Frame>
  )
}
