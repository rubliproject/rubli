/**
 * RastroPlate — «El Rastro de un Peso» (concept `_ui_v4/concepts/newtabs/B.html`, definition
 * docs/NEWTABS_DEFINITIONS.md § 4). A carve: each band is the previous selection opened to full width —
 * institution → category → vendor → contract — and the wedge between bands prints the multiplier
 * (× 41.6% · × 10% · × 5.2%). The walk ends on a citable record.
 *
 *   L0 the bands open top to bottom, each squeezing out of its parent's span (clip-path, 450 ms, staggered)
 *   L1 segment hover → card; contract segment ⇄ record-ledger row
 *   L2 the record card: breadcrumb, the contract, «X de cada 100 pesos», chips, «Citar registro»
 *   L3 the last band is the vendor's contracts; each opens /contracts/:id
 *   L4 click any segment: the carve re-roots in place below it and walks to its largest record ·
 *      Monto ⇄ Contratos re-widths the same segments
 *   L5 ?inst=&cat=&v=&c=&medida= · Esc closes the deepest band
 * Shares are pure arithmetic on stored data: no inference of wrongdoing from a share.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion, useReducedMotion } from 'framer-motion'
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import { RankCell, RankTh } from '@/components/kit/ListRow'
import { CATEGORICAL } from '@/lib/constants'
import { formatEntityName } from '@/lib/entity/format'
import { formatDualCurrency } from '@/lib/utils'
import { CiteBtn, fdate, mxn, nf, ntGet, useCite, useEscLadder, type Lang } from './ntShared'

export interface RaRow { id: number; name_es?: string | null; name_en?: string | null; name?: string | null; is_pf?: boolean; amount_mxn: number; n?: number; share: number
  contract_number?: string | null; title?: string | null; contract_date?: string | null; is_direct_award?: number; procedure_type_normalized?: string | null; flag_10b?: boolean }
export interface RaMeta { level: 'category' | 'vendor' | 'contract'; parent_mxn: number; parent_n: number; truncated: boolean
  institution: { id: number; name: string; siglas: string | null }; category: { id: number; name_es: string | null; name_en: string | null } | null
  vendor: { id: number; name: string | null; is_pf: boolean } | null }
export interface RaResp { available: boolean; rows: RaRow[]; meta: RaMeta }

export type Medida = 'monto' | 'contratos'
const HUE = [CATEGORICAL[2], CATEGORICAL[1], CATEGORICAL[3]]
const tint = (hex: string, p: number) => `color-mix(in srgb, ${hex} ${p}%, var(--color-background))`
const BEAT_KEY = 'rubli_beat_rastro'
/** L0 plays once per session (never under reduced motion). */
export function useBeat(reduced: boolean) {
  const [beat] = useState(() => { if (reduced) return false; try { if (sessionStorage.getItem(BEAT_KEY)) return false; sessionStorage.setItem(BEAT_KEY, '1') } catch { /* private */ } return true })
  return beat
}

export const rastroQuery = (inst: number, cat?: number | null, v?: number | null) => ({
  queryKey: ['newtabs', 'rastro', inst, cat ?? null, v ?? null],
  queryFn: () => ntGet<RaResp>('rastro', { institution_id: inst, category_id: cat ?? undefined, vendor_id: cat != null ? v ?? undefined : undefined }),
  staleTime: 60 * 60_000,
})
export const catName = (r: { name_es?: string | null; name_en?: string | null }, en: boolean) => (en ? r.name_en || r.name_es : r.name_es || r.name_en) || (en ? 'Uncategorized' : 'Sin categoría')
export const pfTag = (en: boolean) => (en ? ' (individual)' : ' (persona física)')
export const venName = (r: { name?: string | null; is_pf?: boolean }, en: boolean) => (r.name ? formatEntityName('vendor', r.name, 'full') + (r.is_pf ? pfTag(en) : '') : (en ? 'Name withheld (it is an RFC)' : 'Nombre no publicado (es un RFC)'))
export const conName = (r: RaRow, en: boolean) => r.contract_number || (en ? `record ${r.id}` : `registro ${r.id}`)
export const instLabel = (i: RaMeta['institution']) => i.siglas || formatEntityName('institution', i.name, 'full')
/** «per 100 pesos» with a sensible precision: 41.6 · 4.2 · 0.22 */
export const per100 = (x: number) => { const v = x * 100; return v >= 10 ? v.toFixed(1) : v >= 1 ? v.toFixed(1) : v >= 0.1 ? v.toFixed(2) : v.toFixed(3) }

const PROC: Record<string, [string, string]> = {
  licitacion: ['licitación pública', 'public tender'], invitacion: ['invitación a cuando menos tres', 'invitation to at least three'],
  adjudicacion_directa: ['adjudicación directa', 'direct award'],
}
export const procTxt = (r: RaRow, en: boolean) => {
  if (r.is_direct_award) return en ? 'direct award' : 'adjudicación directa'
  const p = r.procedure_type_normalized ? PROC[r.procedure_type_normalized] : null
  return p ? p[en ? 1 : 0] : r.procedure_type_normalized ? r.procedure_type_normalized.replace(/_/g, ' ') : en ? 'procedure not recorded' : 'procedimiento sin registro'
}

export interface Path { inst: number; cat: number | null; v: number | null; c: number | null }

export function RastroPlate({ path, medida, lang, onPick, onBack, levels, beat }: {
  path: Path; medida: Medida; lang: Lang; beat: boolean
  onPick: (level: 0 | 1 | 2, id: number) => void
  onBack: () => boolean
  levels: [RaResp | undefined, RaResp | undefined, RaResp | undefined]
}) {
  const en = lang === 'en'
  const L = (es: string, e: string) => (en ? e : es)
  const reduced = !!useReducedMotion()
  // The tip re-renders only when the segment under the pointer changes; its position rides a ref.
  const [tip, setTip] = useState<{ k: number; r: RaRow } | null>(null)
  const tipRef = useRef<HTMLDivElement>(null)
  const tipXY = useRef({ x: 0, y: 0 })
  const tipT = (x: number, y: number) => `translate(${Math.min(x + 14, (wrap.current?.clientWidth ?? 600) - 330)}px, ${y + 16}px)`
  const [hotC, setHotC] = useState<number | null>(null)
  const [copied, cite] = useCite()
  const wrap = useRef<HTMLDivElement>(null)
  const [W, setW] = useState(1200)
  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  useEscLadder([onBack])

  const sel = [path.cat, path.v, path.c]
  const shareOf = (r: RaRow, m: RaMeta) => (medida === 'monto' ? r.share : (r.n ?? 1) / Math.max(1, m.parent_n))
  /** Segment spans (0–1) per level, in order; the hatched rest takes what the top 15 leave. */
  const [l0, l1, l2] = levels
  const spans = useMemo(() => [l0, l1, l2].map((d) => {
    if (!d?.available) return null
    let x = 0
    const segs = d.rows.map((r) => { const w = medida === 'monto' ? r.share : (r.n ?? 1) / Math.max(1, d.meta.parent_n); const s = { r, x0: x, x1: x + w }; x += w; return s })
    return { segs, rest: Math.max(0, 1 - x) }
  }), [l0, l1, l2, medida])
  const selSpan = (k: number) => spans[k]?.segs.find((s) => s.r.id === sel[k]) ?? null

  const rec = levels[2]?.available ? levels[2].rows.find((r) => r.id === path.c) ?? null : null
  const m0 = levels[0]?.meta, m2 = levels[2]?.meta
  const s0 = selSpan(0)?.r, s1 = selSpan(1)?.r
  // Chain of money shares: 100 → cat → vendor → contract
  const chain = [1, s0?.share ?? null, s0 && s1 ? s0.share * s1.share : null, s0 && s1 && rec ? s0.share * s1.share * rec.share : null]

  const head = (k: number) => {
    const d = levels[k]
    if (!d?.available) {
      const parent = k === 1 ? s0 && catName(s0, en) : k === 2 ? s1 && venName(s1, en) : null
      return parent ? <div className="nt-ra-head"><b>{parent}</b><span>{L('leyendo los contratos…', 'reading the contracts…')}</span></div> : null
    }
    const mm = d.meta
    const title = k === 0 ? `${instLabel(mm.institution)} · ${mxn(mm.parent_mxn)} · ${nf(mm.parent_n)} ${L('contratos', 'contracts')}`
      : k === 1 ? `${catName(mm.category ?? {}, en)} · ${mxn(mm.parent_mxn)} · ${nf(mm.parent_n)} ${L('contratos', 'contracts')}`
        : `${venName(mm.vendor ?? {}, en)} ${L('en', 'at')} ${instLabel(mm.institution)} · ${mxn(mm.parent_mxn)} · ${nf(mm.parent_n)} ${L('contratos', 'contracts')}`
    const right = k === 0 ? L('100 de cada 100 pesos', '100 of every 100 pesos') : `${per100(chain[k]!)}% ${L('de', 'of')} ${instLabel(mm.institution)}`
    return <div className="nt-ra-head"><b>{title}</b><span>{right}</span></div>
  }

  const segLabel = (k: number, r: RaRow) => (k === 0 ? catName(r, en) : k === 1 ? venName(r, en) : conName(r, en))
  const wedge = (k: number) => {
    const sp = selSpan(k)
    const d = levels[k]
    if (!sp || !d?.available) return null
    const W = 1000, H = 64
    const share = shareOf(sp.r, d.meta)
    const what = k === 0 ? L(`a ${catName(sp.r, false).toLowerCase()}`, `to ${catName(sp.r, true).toLowerCase()}`) : k === 1 ? L('a un proveedor', 'to one vendor') : L('en un contrato', 'in one contract')
    return (
      <div className="nt-ra-wedge" aria-hidden="true">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
          <motion.polygon
            initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3, delay: 0.15 }}
            points={`${sp.x0 * W},0 ${sp.x1 * W},0 ${W},${H} 0,${H}`} className="nt-ra-poly" />
        </svg>
        <p><b>× {per100(share)}%</b> <span>{what}{medida === 'contratos' ? L(' · de los contratos', ' · of the contracts') : ''} → {medida === 'monto' ? mxn(sp.r.amount_mxn) : `${nf(sp.r.n ?? 1)} ${L('contratos', 'contracts')}`}</span></p>
      </div>
    )
  }

  const band = (k: 0 | 1 | 2) => {
    const sp = spans[k]
    const d = levels[k]
    if (!sp || !d) return <div className="nt-ra-bar is-load" aria-busy="true"><span>{L('Abriendo esta parte del gasto: hasta unos segundos la primera vez.', 'Opening this part of the spending: a few seconds the first time.')}</span></div>
    const parentSpan = k > 0 ? selSpan(k - 1) : null
    const from = parentSpan ? `inset(0 ${(1 - parentSpan.x1) * 100}% 0 ${parentSpan.x0 * 100}%)` : 'inset(0 100% 0 0%)'
    return (
      <motion.div
        key={`${k}-${k === 0 ? path.inst : k === 1 ? path.cat : path.v}`}
        className="nt-ra-bar"
        initial={reduced ? false : { clipPath: from }}
        animate={{ clipPath: 'inset(0 0% 0 0%)' }}
        transition={{ duration: beat ? 0.55 : 0.45, ease: [0.32, 0.72, 0, 1] }}
        onPointerLeave={() => { setTip(null); setHotC(null) }}
      >
        {sp.segs.map((s) => {
          const on = s.r.id === sel[k]
          const w = (s.x1 - s.x0) * 100
          const hot = k === 2 && hotC === s.r.id
          return (
            <button key={s.r.id} type="button"
              className={`nt-ra-seg${on ? ' is-on' : ''}${hot ? ' is-hot' : ''}`}
              style={{ width: `max(2px, ${w}%)`, background: on ? HUE[k] : tint(HUE[k], hot ? 40 : 18), color: on ? 'var(--color-background)' : 'var(--color-text-primary)' }}
              onClick={() => onPick(k, s.r.id)}
              onPointerMove={(e) => {
                const b = wrap.current!.getBoundingClientRect(), x = e.clientX - b.left, y = e.clientY - b.top
                tipXY.current = { x, y }
                if (tipRef.current) tipRef.current.style.transform = tipT(x, y)
                if (tip?.k !== k || tip.r !== s.r) setTip({ k, r: s.r })
                if (k === 2 && hotC !== s.r.id) setHotC(s.r.id)
              }}
              onFocus={() => k === 2 && setHotC(s.r.id)}
              aria-pressed={on}
              aria-label={`${segLabel(k, s.r)}: ${per100(s.r.share)}% · ${mxn(s.r.amount_mxn)}`}>
              {(w / 100) * W >= (k === 2 ? 72 : 104) && (
                <span className="nt-ra-seg-t">
                  <b>{k === 2 ? mxn(s.r.amount_mxn) : segLabel(k, s.r)}</b>
                  <small>{k === 2 ? (s.r.contract_date ?? '').slice(0, 4) : `${per100(medida === 'monto' ? s.r.share : shareOf(s.r, d.meta))}%`}</small>
                </span>
              )}
            </button>
          )
        })}
        {sp.rest > 0.004 && (
          <span className="nt-ra-rest" style={{ width: `${sp.rest * 100}%` }}>
            {sp.rest > 0.08 && <small>{k === 2
              ? L(`${nf(d.meta.parent_n - d.rows.length)} contratos más · ${per100(sp.rest)}%`, `${nf(d.meta.parent_n - d.rows.length)} more contracts · ${per100(sp.rest)}%`)
              : L(`${k === 0 ? 'categorías' : 'proveedores'} más · ${per100(sp.rest)}%`, `more ${k === 0 ? 'categories' : 'vendors'} · ${per100(sp.rest)}%`)}</small>}
          </span>
        )}
      </motion.div>
    )
  }

  const citeRec = () => {
    if (!rec || !m0 || !s0 || !s1) return
    cite('rec', L(
      `De cada peso de ${instLabel(m0.institution)}, ${per100(s0.share)}% fue a ${catName(s0, false)}; de eso, ${per100(s1.share)}% a ${venName(s1, false)}; su contrato mayor ahí es ${conName(rec, false)}, ${fdate(rec.contract_date, 'es')}, ${mxn(rec.amount_mxn)}. RUBLI con datos de CompraNet.`,
      `Of every peso spent by ${instLabel(m0.institution)}, ${per100(s0.share)}% went to ${catName(s0, true)}; of that, ${per100(s1.share)}% to ${venName(s1, true)}; its largest contract there is ${conName(rec, true)}, ${fdate(rec.contract_date, 'en')}, ${mxn(rec.amount_mxn)}. RUBLI, CompraNet data.`))
  }

  return (
    <section className="nt-obj nt-ra" aria-label={L('El rastro de un peso', 'The trail of a peso')} ref={wrap}>
      {head(0)}
      {band(0)}
      {path.cat != null && <>{wedge(0)}{head(1)}{band(1)}</>}
      {path.v != null && <>{wedge(1)}{head(2)}{band(2)}</>}
      {path.c != null && wedge(2)}

      {tip && (
        <div ref={tipRef} className="nt-tip" style={{ transform: tipT(tipXY.current.x, tipXY.current.y) }} role="status">
          <b>{segLabel(tip.k, tip.r)}</b>
          {tip.k === 2 && tip.r.title && <span>{tip.r.title.charAt(0) + tip.r.title.slice(1).toLowerCase()}</span>}
          <span className="nt-tip-m">{mxn(tip.r.amount_mxn)}{tip.r.flag_10b ? ' †' : ''} · {per100(tip.r.share)}% {L('del dinero', 'of the money')}{tip.r.n != null ? ` · ${nf(tip.r.n)} ${L('contratos', 'contracts')}` : ''}</span>
          <span className="nt-tip-h">{tip.r.id === sel[tip.k] ? L('ya elegido', 'already chosen') : L('clic: abrir debajo', 'click: open below')}</span>
        </div>
      )}

      {rec && m0 && m2 && s0 && s1 && (
        <motion.div className="nt-ra-rec" initial={reduced ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.32, delay: 0.15 }}>
          <div className="nt-ra-rec-main">
            <p className="nt-ra-crumb">{instLabel(m0.institution)} › {catName(s0, en)} › {venName(s1, en)} › {L('contrato', 'contract')} {conName(rec, en)}</p>
            <p className="nt-ra-rec-t">{rec.title ? rec.title.charAt(0) + rec.title.slice(1).toLowerCase() : conName(rec, en)}</p>
            <p className="nt-ra-rec-f"><b>{formatDualCurrency(rec.amount_mxn, rec.contract_date ? +rec.contract_date.slice(0, 4) : undefined)}{rec.flag_10b ? ' †' : ''}</b> · {fdate(rec.contract_date, lang)} · {procTxt(rec, en)}</p>
            <div className="nt-chips is-row">
              {m2.vendor && m2.vendor.name && <><EntityIdentityChip type="vendor" id={m2.vendor.id} name={m2.vendor.name} size="sm" fullName />{m2.vendor.is_pf && <span className="nt-lg-muted">{pfTag(en)}</span>}</>}
              <EntityIdentityChip type="institution" id={m0.institution.id} name={formatEntityName('institution', m0.institution.name, 'full')} size="sm" fullName />
            </div>
          </div>
          <div className="nt-ra-rec-side">
            <p className="nt-ra-per"><b>{per100(chain[3]!)}</b> {L('de cada 100 pesos', 'of every 100 pesos')}</p>
            <p className="nt-ra-chain">100 → {per100(chain[1]!)} → {per100(chain[2]!)} → {per100(chain[3]!)}</p>
            <div className="nt-act">
              <Link className="nt-cite is-ink" to={`/contracts/${rec.id}`}>{L('Abrir el registro', 'Open the record')}</Link>
              <CiteBtn on={copied === 'rec'} onClick={citeRec} lang={lang} label={L('Citar registro', 'Cite record')} />
            </div>
          </div>
        </motion.div>
      )}

      {levels[2]?.available && (
        <div className="ct-table-wrap nt-ledger">
          <table className="ct-table ct-stack" aria-label={L('Contratos del proveedor en la institución', 'The vendor’s contracts at the institution')}>
            <thead>
              <tr>
                <RankTh lang={lang} />
                <th scope="col">{L('Contrato', 'Contract')}</th>
                <th scope="col">{L('Objeto', 'Purpose')}</th>
                <th scope="col" className="num">{L('Fecha', 'Date')}</th>
                <th scope="col" className="num">{L('Monto', 'Amount')}</th>
                <th scope="col">{L('Del proveedor', 'Of the vendor')}</th>
              </tr>
            </thead>
            <tbody>
              {levels[2].rows.map((r, i) => (
                <tr key={r.id} className={hotC === r.id || path.c === r.id ? 'is-on' : undefined}
                  onPointerEnter={() => setHotC(r.id)} onPointerLeave={() => setHotC(null)}>
                  <RankCell n={i + 1} />
                  <td className="ct-key"><Link className="ct-link" to={`/contracts/${r.id}`}>{conName(r, en)}</Link></td>
                  <td className="ls-txt">{r.title ? r.title.charAt(0) + r.title.slice(1).toLowerCase() : '—'}</td>
                  <td className="num" data-l={L('fecha', 'date')}>{fdate(r.contract_date, lang)}</td>
                  <td className="num ct-amt">{mxn(r.amount_mxn)}{r.flag_10b ? ' †' : ''}</td>
                  <td className="nt-lg-bar"><span><i style={{ width: `${(r.share / (levels[2]!.rows[0]?.share || 1)) * 100}%`, background: HUE[2] }} /><b>{per100(r.share)}%</b></span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

/** Fetch the three levels for a path (each cached 6 h server-side). */
export function useRastroLevels(path: Path): [RaResp | undefined, RaResp | undefined, RaResp | undefined] {
  const q0 = useQuery(rastroQuery(path.inst))
  const q1 = useQuery({ ...rastroQuery(path.inst, path.cat), enabled: path.cat != null })
  const q2 = useQuery({ ...rastroQuery(path.inst, path.cat, path.v), enabled: path.cat != null && path.v != null })
  // the app-wide keepPreviousData would hand a new level its parent's rows: a placeholder is «not loaded»
  const d0 = q0.isPlaceholderData ? undefined : q0.data
  const d1 = path.cat != null && !q1.isPlaceholderData ? q1.data : undefined
  const d2 = path.v != null && !q2.isPlaceholderData ? q2.data : undefined
  return useMemo(() => [d0, d1, d2], [d0, d1, d2])
}

/** Walk: fill the next missing step with its largest child as data arrives (initial load, a new institution, a click). */
export function useWalk(path: Path, levels: ReturnType<typeof useRastroLevels>, walking: boolean, set: (patch: Record<string, number | null>) => void, slow: boolean) {
  useEffect(() => {
    if (!walking) return
    if (path.c != null) return
    const step = path.cat == null ? 0 : path.v == null ? 1 : 2
    const d = levels[step]
    if (!d?.available || !d.rows.length) return
    const id = d.rows[0].id
    const t = window.setTimeout(() => set(step === 0 ? { cat: id } : step === 1 ? { v: id } : { c: id }), slow ? 650 : 0)
    return () => window.clearTimeout(t)
  }, [walking, path, levels, set, slow])
}
