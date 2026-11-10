/**
 * Focos Rojos · «El mapa de la fila» (/aria?ver=mapa; owner 2026-11-02, final Fable round:
 * «use the concept of maps … but a new spin on it»). El Mapa's sky, with the fila de investigación
 * on it instead of spending:
 *   L0  the sky — only the institutions that hold flagged vendors; size = their flagged money,
 *       colour = sector, red ring = one of them is tier 1 — and the fila's top 10 under it
 *   L1  a sector name flies the camera (Firmamento L3) and the list becomes the sector's top 10
 *   L2  an institution star (or a row's buyer) → its top 10, names first, each with 2–3 aspects
 *   L3  a row → the vendor's card: aspects with their numbers, the radar as its fingerprint, stamps
 * Ranking = ARIA's priority (ips_final), stated in words. Pattern = soft name + P-code tag + gloss.
 * State lives in the URL (?sector=1&inst=251&v=4325): Enter opens, Esc closes and returns focus,
 * Back keeps the place. Data: GET /aria/mapa and /aria/mapa/vendors (live, cached 1 h per run).
 */
import { useEffect, useMemo, useRef } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ariaApi } from '@/api/client'
import type { AriaMapaVendor } from '@/api/types'
import { VendorCard as Card } from '@/components/aria/VendorCard'
import { DocHead } from '@/components/contrato/DocHead'
import { useLang } from '@/components/contrato/nav'
import { FieldCard } from '@/components/kit/Field'
import { ViewSwitch } from '@/components/kit/ViewSwitch'
import { Firmamento, esc, type Star } from '@/components/portada/Firmamento'
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import { useSky } from '@/lib/atlas/sky/useSky'
import { PATTERN_DEFS, PATTERNS_OFF_IN_PROD, patternName } from '@/lib/aria/patterns'
import { LEVEL_WORD, RULE, aspectText, filaManifest, softPattern, tr } from '@/lib/aria/mapa'
import { CURRENT_MODEL_VERSION, RISK_TEXT_COLORS, SECTORS, getRiskLevelFromScore } from '@/lib/constants'
import { formatCut } from '@/lib/nav/toc'
import { formatEntityName } from '@/lib/entity/format'
import { formatVendorName } from '@/lib/vendor/formatName'
import { formatCompactMXN, formatNumber } from '@/lib/utils'
import '@/components/contrato/contrato.css'
import '@/components/kit/kit.css'
import '@/components/aria/mapa.css'

const BEAT_KEY = 'rubli_beat_aria_mapa'
const sectorOf = (id: number | null | undefined) => SECTORS.find((s) => s.id === id) ?? SECTORS[SECTORS.length - 1]
const N = 10

export default function AriaMapa() {
  const lang = useLang()
  const en = lang === 'en'
  const L = (es: string, e: string) => (en ? e : es)
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  // ?sector= is the sky's own (Firmamento); ?inst= and ?v= are this page's, pushed so Back keeps the place
  const sector = (() => { const v = Number(params.get('sector')); return v >= 1 && v <= 12 ? v : null })()
  const inst = Number(params.get('inst')) || null
  const vid = Number(params.get('v')) || null
  const go = (patch: { inst?: number | null; v?: number | null }, replace = false) => setParams((cur) => {
    const n = new URLSearchParams(cur)
    n.set('ver', 'mapa')
    for (const [k, val] of Object.entries(patch)) { if (val == null) n.delete(k); else n.set(k, String(val)) }
    if ('inst' in patch && !('v' in patch)) n.delete('v')
    return n
  }, { replace })

  const { manifest } = useSky(false)
  const mapa = useQuery({ queryKey: ['aria-mapa'], queryFn: () => ariaApi.getMapa(), staleTime: 3_600_000 })
  const scope = inst ? { institution_id: inst } : sector ? { sector_id: sector } : {}
  const list = useQuery({ queryKey: ['aria-mapa-vendors', scope], queryFn: () => ariaApi.getMapaVendors({ ...scope, limit: N }), staleTime: 3_600_000, placeholderData: (prev) => prev })
  const fm = useMemo(() => (manifest && mapa.data ? filaManifest(manifest, mapa.data.institutions) : null), [manifest, mapa.data])
  const beat = useMemo(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false
    try { if (sessionStorage.getItem(BEAT_KEY)) return false; sessionStorage.setItem(BEAT_KEY, '1'); return true } catch { return false }
  }, [])

  const rows = list.data?.data ?? []
  const vendor = vid ? rows.find((r) => r.vendor_id === vid) ?? null : null
  const picked = inst ? mapa.data?.institutions.find((d) => d.institution_id === inst) ?? null : null
  const sec = sector ? mapa.data?.sectors.find((s) => s.sector_id === sector) ?? null : null
  const totals = mapa.data?.totals
  const runDay = mapa.data?.run?.completed_at ? formatCut(mapa.data.run.completed_at.slice(0, 10), lang) : null

  useEffect(() => { document.title = `${L('El mapa de la fila · Focos rojos', 'The map of the line · Red flags')} · RUBLI` }, [lang]) // eslint-disable-line react-hooks/exhaustive-deps
  // the card unmounts on close (FieldCard hands focus to its opener); a scope change lands focus on the list head
  const first = useRef(true)
  useEffect(() => {
    if (first.current) { first.current = false; return }
    const el = document.getElementById('am-h')
    if (!el) return
    el.focus({ preventScroll: true })
    // a star picked up in the sky: bring its names into view (no jump when they already are)
    el.scrollIntoView({ block: 'nearest', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  }, [inst, sector])

  const money = (v: number) => formatCompactMXN(v)
  const sName = (id: number) => (en ? sectorOf(id).nameEN : sectorOf(id).name)
  const words = useMemo(() => ({
    root: L('Toda la fila', 'The whole line'),
    vendorSearch: false as const,
    radius: (v: number) => Math.max(3, Math.min(14, 3 + 2.6 * Math.log10(Math.max(v, 1) / 1e7))),
    claim: (focus: number | null): [React.ReactNode, React.ReactNode] => [claimLine(focus), null],
  }), [totals, mapa.data, inst, vid, en])  // eslint-disable-line react-hooks/exhaustive-deps
  function claimLine(focus: number | null): React.ReactNode {
      if (!totals) return L('Cargando la fila de investigación…', 'Loading the investigation line…')
      const s = focus != null ? mapa.data?.sectors.find((x) => x.sector_id === focus) : null
      if (focus != null && s) {
        return en
          ? <><b>{sName(focus)}</b>: <b>{formatNumber(s.vendors)}</b> flagged suppliers, <b>{money(s.value)}</b>, in <b>{formatNumber(s.institutions)}</b> institutions; <b>{formatNumber(s.tier1)}</b> at tier 1.</>
          : <><b>{sName(focus)}</b>: <b>{formatNumber(s.vendors)}</b> proveedores con señal, <b>{money(s.value)}</b>, en <b>{formatNumber(s.institutions)}</b> instituciones; <b>{formatNumber(s.tier1)}</b> en el nivel 1.</>
      }
      return en
        ? <>The investigation line: <b>{formatNumber(totals.vendors)}</b> flagged suppliers, <b>{money(totals.value)}</b>, in <b>{formatNumber(totals.institutions)}</b> institutions; <b>{formatNumber(totals.tier1)}</b> at tier 1.</>
        : <>La fila de investigación: <b>{formatNumber(totals.vendors)}</b> proveedores con señal, <b>{money(totals.value)}</b>, en <b>{formatNumber(totals.institutions)}</b> instituciones; <b>{formatNumber(totals.tier1)}</b> en el nivel 1.</>
  }
  const words2 = useMemo(() => ({
    tip: (s: Star) => {
      const sig = s.sig && !s.name.startsWith(s.sig) ? `<b>${esc(s.sig)}</b> ` : ''
      const n = s.nv === 1 ? L('proveedor en la fila', 'supplier in the line') : L('proveedores en la fila', 'suppliers in the line')
      return `${sig}<b>${esc(s.name)}</b> · ${sName(s.sec)} · <b>${formatNumber(s.nv)}</b> ${n} · ${money(s.v)}${s.lit ? ` · ${L('tiene nivel 1', 'holds a tier 1')}` : ''}`
    },
    pick: { id: inst, set: (id: number | null) => { if (id == null && vid) return; go({ inst: id }) } },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [totals, mapa.data, inst, vid, en])
  const skyWords = useMemo(() => ({ ...words, ...words2 }), [words, words2])

  const fig = (v: number | null | undefined, f: (x: number) => string = formatNumber) => (v == null ? '—' : f(v))
  const figures = (
    <dl className="pf-figs">
      <div><dt>{L('proveedores en la fila', 'suppliers in the line')}</dt><dd>{fig(totals?.vendors)}</dd></div>
      <div><dt>{L('en el nivel 1', 'at tier 1')}</dt><dd className="is-crit">{fig(totals?.tier1)}</dd></div>
      <div><dt>{L('instituciones', 'institutions')}</dt><dd>{fig(totals?.institutions)}</dd></div>
      <div><dt>{L('su dinero, 2002–2026', 'their money, 2002–2026')}</dt><dd>{fig(totals?.value, money)}</dd></div>
      <div className="pf-key">
        <dt className="sr-only">{L('Clave', 'Key')}</dt>
        <dd>
          <span>{L('tamaño: el dinero de sus proveedores en la fila (no su gasto)', 'size: the money of its flagged suppliers (not its spending)')}</span>
          <span><i className="is-ring" aria-hidden="true" />{L('anillo: tiene un proveedor de nivel 1', 'ring: holds a tier-1 supplier')}</span>
          {fm && fm.dropped > 0 && <span>{L(`${fm.dropped} compradores sin punto en el panorama`, `${fm.dropped} buyers without a dot in the panorama`)}</span>}
          {runDay && <span>{L('corrida ARIA del', 'ARIA run of')} {runDay} · {L('modelo', 'model')} {CURRENT_MODEL_VERSION}</span>}
          {PATTERNS_OFF_IN_PROD.map((c) => <span key={c}>{softPattern(c, lang)} ({c}): {L('no se calcula en producción: compara montos con la mediana de su partida, un dato que la base publicada aún no trae', 'not computed in production: it compares amounts with their line-item median, which the published database lacks')}</span>)}
        </dd>
      </div>
    </dl>
  )

  const trail = [
    { label: L('Investigar', 'Investigate') },
    { label: L('Focos rojos', 'Red flags'), to: '/aria' },
    { label: L('El mapa de la fila', 'The map of the line') },
  ]
  const views = <ViewSwitch lang={lang} value={'mapa' as 'lista' | 'mapa'} onChange={(k) => { if (k === 'lista') navigate('/aria') }} views={[
    { key: 'lista', es: 'La fila', en: 'The line' },
    { key: 'mapa', es: 'El mapa', en: 'The map' },
  ]} />

  // the ←/→ walk follows the ranking
  const i = vendor ? rows.findIndex((r) => r.vendor_id === vendor.vendor_id) : -1
  const prev = i > 0 ? rows[i - 1] : null
  const next = i >= 0 && i < rows.length - 1 ? rows[i + 1] : null

  const scopeHead = picked ? (
    <>
      <EntityIdentityChip type="institution" id={picked.institution_id!} name={picked.name ?? picked.siglas} size="inherit" sectorCode={sectorOf(picked.sector_id).code} fullName inline />
      <span className="am-scope"><b>{formatNumber(picked.vendors)}</b> {L('proveedores en la fila', 'suppliers in the line')} · <b>{money(picked.value)}</b>{picked.tier1 > 0 && <> · <b style={{ color: RISK_TEXT_COLORS.critical }}>{picked.tier1}</b> {L('en el nivel 1', 'at tier 1')}</>}</span>
      <button type="button" className="am-open" onClick={() => go({ inst: null })}>{L('cerrar ×', 'close ×')}</button>
    </>
  ) : sector && sec ? (
    <>
      <i style={{ background: sectorOf(sector).color }} aria-hidden="true" />{sName(sector)}
      <span className="am-scope"><b>{formatNumber(sec.vendors)}</b> {L('en la fila', 'in the line')} · <b>{formatNumber(sec.institutions)}</b> {L('instituciones', 'institutions')}</span>
    </>
  ) : (
    <span className="am-scope">{L('toda la fila', 'the whole line')}{totals && <> · <b>{formatNumber(totals.vendors)}</b> {L('proveedores', 'suppliers')}</>}</span>
  )

  return (
    <article className={`ct ct-page am${inst || sector ? ' is-in' : ''}`}>
      <div className="ct-wrap">
        <DocHead trail={trail} views={views} />
        {fm ? (
          <Firmamento manifest={fm.manifest} lang={lang} totalInstitutions={null} totalValue={null} riskPct={null} beat={beat} figures={figures} words={skyWords} />
        ) : (
          <section className="pf" aria-busy="true">
            <div className="pf-head"><p className="pf-claim">{mapa.isError ? L('No se pudo cargar la fila de investigación. Recargue la página.', 'The investigation line did not load. Reload the page.') : L('Cargando el panorama de la fila…', 'Loading the panorama of the line…')}</p></div>
            <div className="pf-sky pf-sky-skel" />
            {figures}
          </section>
        )}

        <section className="am-rank" aria-labelledby="am-h">
          <div className="am-head">
            <h2 id="am-h" className="am-h" tabIndex={-1}>
              <span>{L('Los que más destacan', 'The ones that stand out')}</span>
              <span className="kf-mono">{L(`top ${N}`, `top ${N}`)}{list.data ? ` ${L('de', 'of')} ${formatNumber(list.data.total)}` : ''}</span>
              {scopeHead}
            </h2>
          </div>
          <p className="am-rule"><b>{L('Orden', 'Order')}</b> · {tr(RULE, lang).replace(/^(Orden|Order): /, '')} {L('Aspectos: lo que distingue a cada proveedor — su comprador, su llegada o su salida, un registro externo, licitaciones con un solo adjudicado; nunca de relleno.', 'Aspects: what sets each supplier apart — its buyer, its arrival or exit, an external record, sole-bidder tenders; never padding.')}</p>
          {list.isLoading && !list.data ? (
            <ol className="am-list am-skel" aria-busy="true">{Array.from({ length: N }, (_, k) => <li key={k} />)}</ol>
          ) : rows.length === 0 ? (
            <p className="am-empty">{L('Ningún proveedor de la fila tiene aquí a su comprador principal.', 'No supplier in the line has its main buyer here.')}</p>
          ) : (
            <ol className="am-list" key={`${inst ?? ''}-${sector ?? ''}`}>
              {rows.map((v, k) => <Row key={v.vendor_id} v={v} k={k} lang={lang} on={v.vendor_id === vid} open={() => go({ v: v.vendor_id })} pickInst={(id) => go({ inst: id })} />)}
            </ol>
          )}
          <p className="am-foot">
            {vid && !vendor && list.data
              ? <span>{L('El proveedor del enlace no está entre los diez de esta vista.', 'The linked supplier is not among this view’s ten.')} <Link className="ct-link" to={`/aria/caso/${vid}`}>{L('Abrir su expediente', 'Open its dossier')} ›</Link></span>
              : <span>{L('Un indicador no es prueba: cada nombre lleva a su expediente y a los contratos detrás.', 'An indicator is not proof: every name leads to its dossier and the contracts behind it.')}</span>}
            <Link className="ct-link" to={`/aria${sector ? `?sector_id=${sector}` : ''}`}>{L('Toda la fila, en lista', 'The whole line, as a list')} ›</Link>
          </p>
        </section>

        {vendor && (
          <FieldCard title={<>#{vendor.rank} · {L('nivel', 'tier')} {vendor.ips_tier} · IPS {vendor.ips_final.toFixed(2)}</>} onClose={() => go({ v: null })} lang={lang} focusKey={vendor.vendor_id}>
            <Card v={vendor} lang={lang} prev={prev} next={next} go={(id) => go({ v: id }, true)} />
          </FieldCard>
        )}
      </div>
    </article>
  )
}

/* ── one ranked name: rank · name + pattern tag · its aspects · money / indicator · open ── */
function Row({ v, k, lang, on, open, pickInst }: { v: AriaMapaVendor; k: number; lang: 'es' | 'en'; on: boolean; open: () => void; pickInst: (id: number) => void }) {
  const en = lang === 'en'
  const L = (es: string, e: string) => (en ? e : es)
  const s = sectorOf(v.primary_sector_id)
  const lvl = v.avg_risk_score == null ? null : getRiskLevelFromScore(v.avg_risk_score)
  const soft = softPattern(v.primary_pattern, lang)
  return (
    <li className={`am-row is-in${on ? ' is-on' : ''}`} data-id={v.vendor_id} style={{ '--d': `${Math.min(k, 9) * 40}ms` } as React.CSSProperties} onClick={(e) => { if (!(e.target as HTMLElement).closest('a, button')) open() }}>
      <span className={`am-rk${v.ips_tier === 1 ? ' is-t1' : ''}`}>{v.rank}</span>
      <span className="am-nm">
        <EntityIdentityChip type="vendor" id={v.vendor_id} name={formatVendorName(v.vendor_name, 60)} size="inherit" sectorCode={s.code} fullName inline hideIcon />
        {v.persona_fisica && <small>{L('persona física', 'natural person')}</small>}
        {soft && v.primary_pattern && (
          <span className="am-tag" title={`${patternName(v.primary_pattern, lang)}. ${en ? PATTERN_DEFS[v.primary_pattern]?.en : PATTERN_DEFS[v.primary_pattern]?.es}`}>
            {soft}<span className="kf-mono">{v.primary_pattern}</span>
          </span>
        )}
      </span>
      <span className="am-asp">
        {v.aspects.map((a) => (
          <span key={a.k}>
            {a.k === 'ratio' && v.top_institution_id
              ? <>{aspectText(a, v, lang).replace(/ (con|with) .*$/, '')} {L('con', 'with')} <button type="button" className="ct-link" onClick={() => pickInst(v.top_institution_id!)}>{formatEntityName('institution', v.top_institution, 'md')}</button></>
              : aspectText(a, v, lang)}
          </span>
        ))}
      </span>
      <span className="am-fig">
        <span>{formatCompactMXN(v.total_value_mxn)} · {formatNumber(v.total_contracts)} {v.total_contracts === 1 ? L('contrato', 'contract') : L('contratos', 'contracts')}</span>
        <small>{L('indicador', 'indicator')} {v.avg_risk_score == null ? '—' : <b style={{ color: lvl ? RISK_TEXT_COLORS[lvl] : undefined }}>{lvl === 'critical' ? '≥ 0.60' : v.avg_risk_score.toFixed(2)} {lvl ? tr(LEVEL_WORD[lvl], lang) : ''}</b>} · IPS {v.ips_final.toFixed(2)}</small>
      </span>
      <button type="button" className="am-open" aria-expanded={on} onClick={open}>{L('ficha', 'card')}</button>
    </li>
  )
}
