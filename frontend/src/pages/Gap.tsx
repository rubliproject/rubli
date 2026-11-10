/**
 * El Apagón · «El Relevo» — the public record of federal purchasing after the
 * CompraNet feed froze (28 Sep 2025), continued by RUBLI from the award letters
 * ComprasMX publishes as scanned PDFs. Spec: .claude/designs/gap-relevo-2026-10-07-spec.md
 *
 * Masthead → I the relay (how we read it) → II the doors (legal grammar) →
 * III findings → IV buyers → V the register (the instrument) → coda.
 * Every number upstream is a filter on the register.
 *
 * View switch (owner 2026-10-15 / 2026-10-20): «Visualización» = «La placa» (GapPlate:
 * ¿por qué puerta salió el dinero sin CompraNet?), the default; «Lista» = the register
 * and its sections below.
 */

import { useState, useMemo, useEffect, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react'
import { gapApi } from '@/api/client'
import { SECTORS, RISK_COLORS } from '@/lib/constants'
import { formatNumber, formatDualCurrency, clampPage } from '@/lib/utils'
import type { GapContractFilterParams } from '@/api/types'
import { useDebouncedValue } from '@/hooks/useDebouncedSearch'
import { ShareButton } from '@/components/ShareButton'
import { DocHead } from '@/components/contrato/DocHead'
import { ViewSwitch } from '@/components/kit/ViewSwitch'
import { FootNotes } from '@/components/kit/FootNotes'
import { Cover } from '@/components/contrato/Cover'
import { Clause } from '@/components/contrato/Clause'
import { RelayAct } from '@/components/gap/RelayAct'
import { DoorsTable } from '@/components/gap/DoorsTable'
import { Findings } from '@/components/gap/Findings'
import { BuyersTable } from '@/components/gap/BuyersTable'
import { RegisterTable } from '@/components/gap/RegisterTable'
import { doorOf } from '@/lib/gap/doors'
import { GapPlate } from '@/components/gap/GapPlate'
import '@/components/kit/kit.css'
import '@/components/gap/gap.css'

/** A plain section (DESIGN.md §5): ink rule · h2 · optional lede · body. */
function Section({ id, title, aside, lede, children }: { id: string; title: string; aside?: ReactNode; lede?: ReactNode; children: ReactNode }) {
  return (
    <section className="ct-section" aria-labelledby={id}>
      <div className="ct-annex-row">
        <h2 id={id} className="ct-h2 scroll-mt-4">{title}</h2>
        {aside}
      </div>
      {lede && <p className="ct-annex-lede">{lede}</p>}
      <div className="ct-section-body">{children}</div>
    </section>
  )
}

const FILTER_KEYS = ['q', 'art', 'inst', 'src', 'flag', 'vend', 'sector', 'risk', 'page', 'row', 'da', 'rec', 'young']

// ─── La Coda · Adónde ir ──────────────────────────────────────────────────────
// Charter C3 exit ramp: section-level surfaces, not entity instances, so plain
// links are the correct primitive (no EntityIdentityChip).

function GapCoda({ lang }: { lang: 'en' | 'es' }) {
  const isEs = lang === 'es'
  const ramps: { to: string; label: string; sub: string }[] = [
    { to: '/methodology#data-sources', label: isEs ? 'La cadena de custodia' : 'Chain of custody',
      sub: isEs ? 'Por qué el registro se congeló el 28 de septiembre de 2025' : 'Why the record froze on 28 September 2025' },
    { to: '/administrations', label: isEs ? 'Sexenios' : 'Administrations',
      sub: isEs ? 'El sexenio de Sheinbaum, donde caen estos procedimientos' : 'The Sheinbaum term, where these procedures fall' },
    { to: '/institutions', label: isEs ? 'Instituciones' : 'Institutions',
      sub: isEs ? 'El historial calificado de los compradores antes del apagón' : "The buyers' scored history before the blackout" },
  ]
  return (
    <Section id="gap-coda" title={isEs ? 'Adónde ir' : 'Where to go next'}>
      <nav className="gap-coda" aria-label={isEs ? 'Adónde ir' : 'Where to go next'}>
        {ramps.map((r) => (
          <Link key={r.to} to={r.to}><b>{r.label}</b><span>{r.sub}</span></Link>
        ))}
      </nav>
    </Section>
  )
}

// ─── pagination ───────────────────────────────────────────────────────────────

function buildPageRange(page: number, totalPages: number): Array<number | '...'> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1)
  }
  const range: Array<number | '...'> = [1]
  if (page > 3) range.push('...')
  for (let p = Math.max(2, page - 1); p <= Math.min(totalPages - 1, page + 1); p++) {
    range.push(p)
  }
  if (page < totalPages - 2) range.push('...')
  range.push(totalPages)
  return range
}

interface PaginationProps {
  page: number
  totalPages: number
  total: number
  onPage: (p: number) => void
  lang: string
}

function Pagination({ page, totalPages, total, onPage, lang }: PaginationProps) {
  if (totalPages <= 1) return null
  const es = lang === 'es'
  return (
    <div className="gap-pager">
      <span>{formatNumber(total)} {es ? 'registros' : 'records'} · {es ? `página ${formatNumber(page)} de ${formatNumber(totalPages)}` : `page ${formatNumber(page)} of ${formatNumber(totalPages)}`}</span>
      <nav aria-label={es ? 'Páginas del registro' : 'Register pages'}>
        <button type="button" onClick={() => onPage(page - 1)} disabled={page <= 1} aria-label={es ? 'Página anterior' : 'Previous page'}>
          <ChevronLeft className="h-4 w-4 mx-auto" aria-hidden="true" />
        </button>
        {buildPageRange(page, totalPages).map((p, i) =>
          p === '...'
            ? <span key={`e-${i}`} aria-hidden="true">…</span>
            : <button key={p} type="button" onClick={() => onPage(p)} aria-current={p === page ? 'page' : undefined}>{p}</button>,
        )}
        <button type="button" onClick={() => onPage(page + 1)} disabled={page >= totalPages} aria-label={es ? 'Página siguiente' : 'Next page'}>
          <ChevronRight className="h-4 w-4 mx-auto" aria-hidden="true" />
        </button>
      </nav>
    </div>
  )
}

// ─── main page ────────────────────────────────────────────────────────────────

const RISK_LABEL = {
  en: { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' },
  es: { critical: 'Crítica', high: 'Alta', medium: 'Media', low: 'Baja' },
} as const

const DOOR_GROUP_LABEL: Record<string, { en: string; es: string }> = {
  a54: { en: 'Art. 54 doors (LAASSP)', es: 'Puertas del Art. 54 (LAASSP)' },
  a55: { en: 'Art. 55 amount threshold', es: 'Art. 55 umbral de monto' },
  works: { en: 'Public works (LOPSRM)', es: 'Obra pública (LOPSRM)' },
  unv: { en: 'Unverified', es: 'Sin verificar' },
}

export default function Gap() {
  const { i18n } = useTranslation()
  const lang = i18n.language
  const isEs = lang === 'es'
  const L: 'en' | 'es' = isEs ? 'es' : 'en'
  const [searchParams, setSearchParams] = useSearchParams()

  // URL state. Legacy da / rec / young links map onto art / src / flag.
  const get = (k: string) => searchParams.get(k) ?? undefined
  const q = searchParams.get('q') ?? ''
  const art = get('art') ?? (get('da') === '1' ? 'any-da' : get('da') === '0' ? 'tender' : undefined)
  const inst = get('inst') ? Number(get('inst')) : undefined
  const src = (get('src') ?? (get('rec') === '1' ? 'ocr' : undefined)) as GapContractFilterParams['src']
  const flag = (get('flag') ?? (get('young') === '1' ? 'young' : undefined)) as GapContractFilterParams['flag']
  const vend = get('vend') as GapContractFilterParams['vend']
  const sectorId = get('sector') ? Number(get('sector')) : undefined
  const riskLevel = get('risk') as GapContractFilterParams['risk_level']
  const sort = (get('sort') ?? 'risk') as 'amount' | 'date' | 'risk'
  const page = clampPage(Number(get('page') ?? '1'), 1)
  const openRow = searchParams.get('row')
  const vista: 'visual' | 'lista' = searchParams.get('vista') === 'lista' ? 'lista' : 'visual'
  const setVista = (v: 'visual' | 'lista') => {
    const next = new URLSearchParams(searchParams)
    if (v === 'lista') next.set('vista', 'lista'); else next.delete('vista')
    setSearchParams(next, { replace: true })
  }

  const [inputQ, setInputQ] = useState(q)
  const debouncedQ = useDebouncedValue(inputQ, 300)
  useEffect(() => {
    if ((debouncedQ || null) === searchParams.get('q')) return
    const next = new URLSearchParams(searchParams)
    if (debouncedQ) next.set('q', debouncedQ); else next.delete('q')
    next.delete('page')
    setSearchParams(next)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQ])

  const setFilter = (key: string, value: string | undefined) => {
    const next = new URLSearchParams(searchParams)
    if (value === undefined || value === '') next.delete(key); else next.set(key, value)
    if (key === 'art') next.delete('da')
    if (key === 'src') next.delete('rec')
    if (key === 'flag') next.delete('young')
    next.delete('page')
    next.delete('row')
    setSearchParams(next)
  }
  const scrollToRegister = () => document.getElementById('registro')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  /** Upstream numbers → the register: replace every filter with `f`, keep the sort. */
  const applyFilter = (f: Record<string, string>) => {
    const next = new URLSearchParams(searchParams)
    FILTER_KEYS.forEach((k) => next.delete(k))
    Object.entries(f).forEach(([k, v]) => next.set(k, v))
    setInputQ(f.q ?? '')
    setSearchParams(next)
    scrollToRegister()
  }
  const toggleRow = (id: string) => {
    const next = new URLSearchParams(searchParams)
    if (openRow === id) next.delete('row'); else next.set('row', id)
    setSearchParams(next, { replace: true })
  }
  const hasActiveFilters = !!(art || inst || src || flag || vend || sectorId || debouncedQ || riskLevel || sort !== 'risk')
  const clearFilters = () => { setInputQ(''); setSearchParams(new URLSearchParams()) }

  const { data: summary, isLoading: summaryLoading, isError: summaryError } = useQuery({
    queryKey: ['gap-summary'],
    queryFn: () => gapApi.getSummary(),
    staleTime: 10 * 60 * 1000,
  })

  const contractParams: GapContractFilterParams = {
    q: debouncedQ || undefined, art, inst, src, flag, vend,
    sector_id: sectorId, risk_level: riskLevel, sort, page, per_page: 50,
  }
  const { data: contractsData, isLoading: contractsLoading, isFetching } = useQuery({
    queryKey: ['gap-contracts', contractParams],
    queryFn: () => gapApi.getContracts(contractParams),
    staleTime: 5 * 60 * 1000,
    enabled: vista === 'lista',
  })
  const contracts = contractsData?.data ?? []
  const pagination = contractsData?.pagination

  // ?row=<uuid> deep link: scroll the opened row (table ≥ sm, card < sm) into view once rendered.
  useEffect(() => {
    if (!openRow || !contractsData) return
    const row = document.getElementById(`row-${openRow}`)
    const el = row?.offsetParent ? row : document.getElementById(`card-${openRow}`)
    el?.scrollIntoView({ block: 'center' })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractsData])

  const ok = summary?.available ? summary : undefined
  const f = ok?.funnel
  const preDa = useMemo(() => new Map((ok?.top_buyers ?? []).map((b) => [b.institution_id, b.pre_da_pct])), [ok])
  const doors = useMemo(() => ok?.by_exception_article ?? [], [ok])
  const totalRead = doors.reduce((s, a) => s + (a.ocr_sum_mxn ?? 0), 0)
  const topTwo = [...doors].map((a) => a.ocr_sum_mxn ?? 0).sort((a, b) => b - a).slice(0, 2).reduce((s, v) => s + v, 0)
  const topTwoShare = totalRead ? Math.round((100 * topTwo) / totalRead) : null

  // Door select: grouped, from the live catalogue
  const doorGroups = useMemo(() => {
    const g: Record<string, typeof doors> = { a54: [], a55: [], works: [], unv: [] }
    doors.forEach((a) => {
      if (doorOf(a.article).tone === 'unverified') g.unv.push(a)
      else if (a.article.startsWith('Art. 54')) g.a54.push(a)
      else if (a.article.startsWith('Art. 55')) g.a55.push(a)
      else g.works.push(a)
    })
    return g
  }, [doors])
  const buyerName = inst
    ? (ok?.top_buyers?.find((b) => b.institution_id === inst)?.siglas ?? contracts[0]?.institution_siglas ?? `#${inst}`)
    : null
  const rl = ok?.by_risk_level

  const fed = ok?.by_buyer_level?.federal
  const fedPct = ok?.federal_direct_award_pct
  const lede = isEs
    ? 'Desde el 28 de septiembre de 2025 México ya no publica, como datos, quién gana sus contratos federales ni por cuánto.'
    : 'Since 28 September 2025 Mexico no longer publishes, as data, who wins its federal contracts or for how much.'
  const readingShort = isEs
    ? 'Los oficios de fallo siguen apareciendo, como PDF escaneados, uno por procedimiento.'
    : 'The award letters are still posted, as scanned PDFs, one per procedure.'
  const reading = ok && fed != null && fedPct != null
    ? (isEs
      ? `${readingShort} RUBLI los lee todos. Este es el único registro público estructurado de los ${formatNumber(ok.total_contracts)} procedimientos desde entonces: ${formatNumber(fed)} federales, ${fedPct.toFixed(1)}% adjudicados sin licitación.`
      : `${readingShort} RUBLI reads every one. This is the only structured public ledger of the ${formatNumber(ok.total_contracts)} procedures since: ${formatNumber(fed)} federal, ${fedPct.toFixed(1)}% of them awarded without a tender.`)
    : readingShort
  const letters = f?.letters_read ?? f?.letters_found
  const windowTxt = ok?.data_window?.replace(' .. ', ' – ')
  const allPct = ok && ok.total_contracts ? (100 * ok.direct_award_count) / ok.total_contracts : null


  return (
    <article className="ct ct-page ct-sheet gap-page" data-frame>
      <div className="ct-wrap">
        <DocHead
          trail={[{ label: isEs ? 'Análisis' : 'Analysis' }, { label: isEs ? 'El Apagón' : 'The Blackout' }]}
          meta={<>{isEs ? 'Ventana' : 'Window'} <b>{windowTxt ?? '—'}</b> · {isEs ? 'Fuente' : 'Source'} ComprasMX</>}
          views={<ViewSwitch lang={isEs ? 'es' : 'en'} value={vista} onChange={setVista} views={[
            { key: 'visual', es: 'Las puertas', en: 'The doors' },
            { key: 'lista', es: 'El registro', en: 'The register' },
          ]} />}
        />

        {vista === 'visual' ? (
          <GapPlate lang={L} />
        ) : (<>

        <Cover className="is-op" title={isEs ? 'Murió el feed. Nosotros leímos los oficios.' : 'The feed died. We read the letters.'} />

        {/* ─── The object: the reading, measured — every row opens its rows in the register ─── */}
        {ok ? <RelayAct part="funnel" summary={ok} isEs={isEs} onFilter={applyFilter} /> : summaryLoading ? <div className="ct-hold-ledger" aria-hidden="true" /> : null}

        {summary && !summary.available && (
          <p role="status" className="ct-note">
            {isEs
              ? 'Los datos de ComprasMX no están disponibles actualmente. La recuperación puede estar en curso o los datos aún no se han cargado.'
              : 'ComprasMX data is not currently available. The recovery pipeline may still be running or the data has not yet been ingested.'}
          </p>
        )}
        {summaryError && (
          <p role="alert" className="ct-note">{isEs ? 'No se pudo cargar el resumen del apagón.' : 'Could not load the blackout summary.'}</p>
        )}
        
        {ok && (
          <>
            {/* ─── En cifras ─── */}
            <section className="ct-clauses" aria-labelledby="gap-cl-h">
              <h2 id="gap-cl-h">{isEs ? 'En cifras' : 'In figures'}</h2>
              <div className="ct-cl-grid">
                <Clause id="gap-cl-1" title={isEs ? 'Procedimientos desde el apagón' : 'Procedures since the blackout'}
                  fig={formatNumber(ok.total_contracts)}
                  count={{ value: ok.total_contracts, format: (n) => formatNumber(Math.round(n)) }}
                  dim={windowTxt} />
                <Clause id="gap-cl-2" title={isEs ? 'Oficios de fallo leídos' : 'Award letters read'}
                  fig={letters != null ? formatNumber(letters) : '—'}
                  count={letters != null ? { value: letters, format: (n) => formatNumber(Math.round(n)) } : null}
                  note={isEs ? 'por OCR, hasta 2 páginas por oficio' : 'by OCR, up to 2 pages per letter'} />
                <Clause id="gap-cl-3" title={isEs ? 'Monto leído del oficio' : 'Amount read off the letter'}
                  fig={f ? formatDualCurrency(f.amounts_read_sum) : '—'}
                  note={f ? (isEs ? `en ${formatNumber(f.amounts_read)} oficios; sin estimaciones` : `on ${formatNumber(f.amounts_read)} letters; no estimates`) : undefined} />
                <Clause id="gap-cl-4" title={isEs ? 'Federales sin licitación' : 'Federal, no tender'}
                  fig={fedPct != null ? fedPct.toFixed(1) : '—'}
                  count={fedPct != null ? { value: fedPct, format: (n) => n.toFixed(1) } : null}
                  unit="%"
                  ruler={{ value: (fedPct ?? 0) / 100, mode: 'fill', color: RISK_COLORS.high, ends: ['0%', isEs ? 'adjudicación directa' : 'direct award', '100%'] }}
                  note={allPct != null ? (isEs ? `todos los compradores: ${allPct.toFixed(1)}%` : `all buyers: ${allPct.toFixed(1)}%`) : undefined} />
              </div>
            </section>

            <Section id="gap-relay" title={isEs ? 'El relevo' : 'The relay'}
              aside={<Link to="/methodology#data-sources" className="ct-more ct-link">{isEs ? 'Método' : 'Method'}</Link>}>
              <RelayAct part="text" summary={ok} isEs={isEs} onFilter={applyFilter} />
            </Section>

            {doors.length > 0 && (
              <Section id="gap-doors" title={isEs ? 'Las puertas' : 'The doors'}
                lede={isEs
                  ? `${formatNumber(doors.length)} puertas legales; dos de ellas cargan ${topTwoShare ?? '—'}% del dinero leído.`
                  : `${formatNumber(doors.length)} legal doors; two of them carry ${topTwoShare ?? '—'}% of the money read.`}>
                <DoorsTable items={doors} daCount={ok.direct_award_count} isEs={isEs} onPick={(a) => applyFilter({ art: a })} />
              </Section>
            )}

            <Section id="gap-findings" title={isEs ? 'Lo que dice el expediente' : 'What the file says'}>
              <Findings isEs={isEs} onFilter={applyFilter} />
            </Section>

            {ok.top_buyers && ok.top_buyers.length > 0 && (
              <Section id="gap-buyers" title={isEs ? 'Los compradores' : 'The buyers'}
                lede={isEs ? 'Quién compra a oscuras, y si antes lo hacía.' : 'Who buys in the dark, and whether they did before.'}>
                <BuyersTable items={ok.top_buyers} isEs={isEs} onPick={(id) => applyFilter({ inst: String(id) })} />
                <p className="ct-note">
                  {isEs
                    ? 'Antes = proporción de adjudicación directa en su historial de CompraNet (misma institución); después = los procedimientos posteriores al apagón. ▲ cuando subió 5 puntos o más.'
                    : 'Before = direct-award share in their CompraNet history (same institution); after = the post-blackout procedures. ▲ when it rose 5 points or more.'}
                </p>
              </Section>
            )}
          </>
        )}

        {/* ── The register ── */}
        <div id="registro" className="scroll-mt-8">
          <Section id="gap-register" title={isEs ? 'El registro' : 'The register'}
            aside={pagination ? <span className="ct-mono ct-note">{formatNumber(pagination.total)} {isEs ? 'registros · 50 por página' : 'records · 50 per page'}</span> : undefined}
            lede={f ? (isEs
              ? `${formatNumber(f.companies_rfc)} empresas identificadas por RFC; los demás nombres son texto de OCR. Cada fila se abre en su lugar.`
              : `${formatNumber(f.companies_rfc)} companies identified by RFC; the other names are OCR text. Each row opens in place.`) : undefined}>
            <div className="gap-filters">
              <label className="gap-search">
                <Search className="h-4 w-4" aria-hidden="true" />
                <input type="text" name="q" autoComplete="off" spellCheck={false} value={inputQ}
                  onChange={(e) => setInputQ(e.target.value)}
                  placeholder={isEs ? 'Título, empresa, comprador o número…' : 'Title, company, buyer or number…'}
                  aria-label={isEs ? 'Buscar en el registro' : 'Search the register'} />
              </label>
              <select value={art ?? ''} onChange={(e) => setFilter('art', e.target.value || undefined)}
                aria-label={isEs ? 'Filtrar por puerta legal' : 'Filter by legal door'}>
                <option value="">{isEs ? 'Todas las puertas' : 'All doors'}</option>
                <option value="any-da">{isEs ? 'Adjudicaciones directas' : 'Direct awards'}</option>
                <option value="tender">{isEs ? 'Solo licitaciones' : 'Tenders only'}</option>
                {Object.entries(doorGroups).filter(([, v]) => v.length).map(([k, v]) => (
                  <optgroup key={k} label={isEs ? DOOR_GROUP_LABEL[k].es : DOOR_GROUP_LABEL[k].en}>
                    {v.map((a) => {
                      const d = doorOf(a.article)
                      return <option key={a.article} value={a.article}>{`${d.code} · ${isEs ? d.short.es : d.short.en} (${formatNumber(a.count)})`}</option>
                    })}
                  </optgroup>
                ))}
              </select>
              <select value={src ?? ''} onChange={(e) => setFilter('src', e.target.value || undefined)}
                aria-label={isEs ? 'Filtrar por origen del monto' : 'Filter by amount source'}>
                <option value="">{isEs ? 'Cualquier monto' : 'Any amount'}</option>
                <option value="ocr">{isEs ? 'Leído del oficio' : 'Read from the letter'}</option>
                <option value="est">{isEs ? 'Estimado' : 'Estimated'}</option>
                <option value="none">{isEs ? 'Sin monto' : 'No amount'}</option>
              </select>
              <select value={vend ?? ''} onChange={(e) => setFilter('vend', e.target.value || undefined)}
                aria-label={isEs ? 'Filtrar por identificación de la empresa' : 'Filter by company identification'}>
                <option value="">{isEs ? 'Cualquier empresa' : 'Any company'}</option>
                <option value="rfc">{isEs ? 'Identificada por RFC' : 'Identified by RFC'}</option>
                <option value="linked">{isEs ? 'Con expediente en RUBLI' : 'Linked to a dossier'}</option>
                <option value="illegible">{isEs ? 'Ilegible' : 'Illegible'}</option>
              </select>
              <select value={flag ?? ''} onChange={(e) => setFilter('flag', e.target.value || undefined)}
                aria-label={isEs ? 'Filtrar por señal' : 'Filter by flag'}>
                <option value="">{isEs ? 'Cualquier señal' : 'Any flag'}</option>
                <option value="young">{isEs ? 'Empresa joven' : 'Young company'}</option>
                <option value="efos">EFOS</option>
                <option value="review">{isEs ? '>10,000 MDP · revisar' : '>10B · review'}</option>
                <option value="self_buyer">{isEs ? 'El oficio nombra al comprador' : 'Buyer named as vendor'}</option>
              </select>
              <select value={sectorId ?? ''} onChange={(e) => setFilter('sector', e.target.value || undefined)}
                aria-label={isEs ? 'Filtrar por sector' : 'Filter by sector'}>
                <option value="">{isEs ? 'Todos los sectores' : 'All sectors'}</option>
                {SECTORS.map((s) => <option key={s.id} value={s.id}>{isEs ? s.name : s.nameEN}</option>)}
              </select>
              <select value={riskLevel ?? ''} onChange={(e) => setFilter('risk', e.target.value || undefined)}
                aria-label={isEs ? 'Filtrar por nivel de alerta estructural' : 'Filter by structural alert level'}>
                <option value="">{isEs ? 'Cualquier alerta' : 'Any alert'}</option>
                {(['critical', 'high', 'medium', 'low'] as const).map((k) => (
                  <option key={k} value={k}>{`${RISK_LABEL[L][k]}${rl ? ` (${formatNumber(rl[k])})` : ''}`}</option>
                ))}
              </select>
              <select value={sort} onChange={(e) => setFilter('sort', e.target.value)}
                aria-label={isEs ? 'Ordenar por' : 'Sort by'}>
                <option value="risk">{isEs ? 'Mayor alerta' : 'Highest alert'}</option>
                <option value="amount">{isEs ? 'Mayor monto' : 'Highest amount'}</option>
                <option value="date">{isEs ? 'Más recientes' : 'Most recent'}</option>
              </select>
              {buyerName && (
                <span className="gap-chip">
                  {isEs ? 'Comprador' : 'Buyer'}: {buyerName}
                  <button type="button" onClick={() => setFilter('inst', undefined)}
                    aria-label={isEs ? 'Quitar el filtro de comprador' : 'Remove the buyer filter'}>
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </span>
              )}
              {hasActiveFilters && (
                <button type="button" className="gap-clear" onClick={clearFilters}>
                  <X className="h-4 w-4" aria-hidden="true" />{isEs ? 'Limpiar' : 'Clear'}
                </button>
              )}
              <span role="status" aria-live="polite" className="sr-only">{isFetching ? (isEs ? 'Cargando…' : 'Loading…') : ''}</span>
            </div>

            {contractsLoading ? (
              <div className="gap-hold-rows" aria-busy="true" />
            ) : (
              <RegisterTable items={contracts} isEs={isEs} openId={openRow} onToggle={toggleRow} preDa={preDa} />
            )}

            {pagination && (
              <Pagination page={pagination.page} totalPages={pagination.total_pages} total={pagination.total} lang={lang}
                onPage={(p) => {
                  const next = new URLSearchParams(searchParams)
                  next.set('page', String(p))
                  next.delete('row')
                  setSearchParams(next)
                  scrollToRegister()
                }} />
            )}
          </Section>
        </div>

        <GapCoda lang={L} />
        </>)}

        {/* ─── Declaraciones — the page's foot: the old lede + provenance (DESIGN.md §5.1) ─── */}
        <Section id="gap-dec" title={isEs ? 'Lectura' : 'Reading'}
          aside={<ShareButton label={isEs ? 'Compartir' : 'Share'} />}
          lede={<>{lede} {reading}</>}>
          <FootNotes lang={isEs ? 'es' : 'en'} items={[
            isEs ? 'Fuente. Procedimientos listados en ComprasMX; los oficios de adjudicación directa se descargaron y se leyeron por OCR. Leído por RUBLI; no es el corpus calificado por el modelo.' : 'Source. Procedures listed on ComprasMX; direct-award letters downloaded and read by OCR. Read by RUBLI; not the model-scored corpus.',
            <>{isEs ? 'Ventana. ' : 'Window. '}{windowTxt ?? '—'}{isEs ? '. Lo que se publicó después del 28 de septiembre de 2025 nunca se suma a los totales de CompraNet.' : '. What was published after 28 September 2025 is never added to CompraNet totals.'}</>,
            <Link to="/methodology#data-sources">{isEs ? 'Método: cómo se leyó' : 'Method: how it was read'}</Link>,
          ]} />
        </Section>
      </div>
    </article>
  )
}
