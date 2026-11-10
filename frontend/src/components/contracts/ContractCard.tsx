/**
 * ContractCard — «La ficha» (archive README 2026-10-28, direction A; OWNER_REVIEW 2026-10-28 «Archive»).
 * One card for the ladder's dot and the list's row: amount · published → signed (day gap) · validity ·
 * procedure + exception article · sector + category · buyer and supplier · risk indicator + the
 * model's top-3 factors · «La lectura» · layers (Las partes / El procedimiento / Los 3 más parecidos)
 * · dossier · ← → walk. Data: GET /contracts/:id, /:id/context, /:id/risk-explain, and the
 * nearest = GET /contracts (same sector, procedure and year, amount ÷3…×3) ranked client-side.
 */
import { forwardRef, useEffect, useId, useMemo, type CSSProperties, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'
import { contractApi } from '@/api/client'
import { RISK_TEXT_COLORS, SECTORS, THIN_HISTORY_LABEL, THIN_HISTORY_NOTE, getRiskLevelFromScore, isThinHistoryLow } from '@/lib/constants'
import { formatCompactMXN, formatDualCurrency, formatNumber } from '@/lib/utils'
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import { buildFichaLectura, dayGap, factorLabel, gapPhrase, pickNearest, topFactors } from '@/lib/contracts/ficha'
import './contracts.css'

type Lang = 'es' | 'en'
const LEVEL = { critical: ['crítico', 'critical'], high: ['alto', 'high'], medium: ['medio', 'medium'], low: ['bajo', 'low'] } as const
const fmts = new Map<string, Intl.DateTimeFormat>()
/** ISO day → «31 mar 2020», read in UTC so a date never slides a day. */
const fdate = (d: string | null | undefined, lang: Lang) => {
  if (!d || !/^\d{4}-\d{2}-\d{2}/.test(d)) return '—'
  let f = fmts.get(lang)
  if (!f) fmts.set(lang, (f = new Intl.DateTimeFormat(lang === 'es' ? 'es-MX' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })))
  return f.format(new Date(`${d.slice(0, 10)}T00:00:00Z`)).replace('.', '')
}
const ordEn = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`
const indTxt = (r: number) => (getRiskLevelFromScore(r) === 'critical' ? '≥ 0.60' : r.toFixed(2))

export interface CardWalk { label: string; canPrev: boolean; canNext: boolean; onPrev: () => void; onNext: () => void }
interface Props {
  id: number
  lang: Lang
  onClose: () => void
  walk?: CardWalk
  /** The three nearest, once known (the ladder draws hairlines to them). */
  onNearest?: (ids: number[]) => void
  /** Re-dock on a neighbour; without it the neighbour opens its dossier. */
  onPickNear?: (id: number) => void
  /** Extra row actions (the list keeps its feedback / save buttons). */
  actions?: ReactNode
  className?: string
  style?: CSSProperties
}

export const ContractCard = forwardRef<HTMLElement, Props>(function ContractCard({ id, lang, onClose, walk, onNearest, onPickNear, actions, className, style }, ref) {
  const en = lang === 'en'
  const L = (es: string, e: string) => (en ? e : es)
  const hid = useId()
  const stale = 30 * 60 * 1000
  const dq = useQuery({ queryKey: ['contract', id], queryFn: () => contractApi.getById(id), staleTime: stale })
  const xq = useQuery({ queryKey: ['contract-context', id], queryFn: () => contractApi.getContext(id), staleTime: stale })
  const rq = useQuery({ queryKey: ['contract-risk-explain', id], queryFn: () => contractApi.getRiskExplanation(id), staleTime: stale })
  const c = dq.data, ctx = xq.data
  const nq = useQuery({
    queryKey: ['contract-nearest', id],
    enabled: !!c && c.amount_mxn > 0 && !!c.sector_id,
    staleTime: stale,
    queryFn: async () => {
      const a = c!.amount_mxn
      const r = await contractApi.getAll({ sector_id: c!.sector_id, is_direct_award: c!.is_direct_award, year: c!.contract_year, min_amount: a / 3, max_amount: Math.min(a * 3, 1e11), per_page: 25, sort_by: 'amount_mxn', sort_order: 'desc' })
      return pickNearest(r.data, c!)
    },
  })
  const near = nq.data
  useEffect(() => { if (near) onNearest?.(near.map((n) => n.id)) }, [near]) // eslint-disable-line react-hooks/exhaustive-deps

  const lectura = useMemo(() => (c ? buildFichaLectura(c, ctx) : []), [c, ctx])
  const top = topFactors(rq.data?.features)
  const gap = c ? dayGap(c.publication_date, c.contract_date) : null
  const sec = SECTORS.find((s) => s.id === c?.sector_id)
  const lvl = c?.risk_score != null ? getRiskLevelFromScore(c.risk_score) : null
  const art = ctx?.official?.exception_article
  const cat = en ? ctx?.official?.category_name_en : ctx?.official?.category_name_es
  const proc = !c ? '' : c.is_direct_award ? L('adjudicación directa', 'direct award') : c.is_single_bid ? L('procedimiento con un solo adjudicado', 'single-award procedure') : (c.procedure_type_normalized || c.procedure_type || L('licitación', 'tender')).toLowerCase()
  const src = c?.source_structure === 'E' ? 'ComprasMX' : c?.source_structure ? `CompraNet · ${L('estructura', 'structure')} ${c.source_structure}` : 'CompraNet'
  const pair = ctx?.pair, st = ctx?.vendor_standing
  const title = c?.title?.replace(/_/g, ' ').replace(/\s+/g, ' ').trim() || c?.contract_number || `${L('Contrato', 'Contract')} #${id}`

  return (
    <section ref={ref} tabIndex={-1} aria-labelledby={hid} className={`cf${className ? ` ${className}` : ''}`} style={style}
      onKeyDown={(e) => { if (e.key === 'Escape' && !walk) { e.stopPropagation(); onClose() } }}>
      <header className="cf-h">
        <h2 id={hid} className="cf-t">{c ? title : L('Cargando contrato…', 'Loading contract…')}</h2>
        <button type="button" className="cf-x" onClick={onClose} aria-label={L('Cerrar la ficha (Esc)', 'Close the card (Esc)')}><X aria-hidden="true" /></button>
      </header>

      {dq.isError ? <p role="alert" className="cf-note">{L('No se pudo cargar el contrato.', 'The contract failed to load.')} <button type="button" className="ct-link" onClick={() => dq.refetch()}>{L('Reintentar', 'Retry')}</button></p>
        : !c ? <div className="cf-skel" aria-busy="true" />
        : <>
          <div className="cf-chain">
            <span className="cf-who"><small>{L('Proveedor', 'Supplier')}</small>{c.vendor_id ? <EntityIdentityChip type="vendor" id={c.vendor_id} name={c.vendor_name} size="sm" fullName inline hideIcon /> : <span>{L('sin dato', 'no data')}</span>}</span>
            <span className="cf-arrow" aria-hidden="true">→</span>
            <span className="cf-who"><small>{L('Comprador', 'Buyer')}</small>{c.institution_id ? <EntityIdentityChip type="institution" id={c.institution_id} name={c.institution_name} size="sm" fullName inline hideIcon /> : <span>{L('sin dato', 'no data')}</span>}</span>
          </div>

          <div className="cf-body">
            <dl className="cf-ledger">
              <div className="cf-row">
                <dt>{L('Monto', 'Amount')}</dt>
                <dd><span className="cf-fig">{c.amount_mxn > 0 ? formatDualCurrency(c.amount_mxn, c.contract_year ?? undefined) : '—'}</span>
                  {c.amount_flag === 'suspect_decimal' ? <span className="cf-crit"> · {L('posible error decimal', 'possible decimal error')}</span>
                    : c.amount_flag === 'review' || c.amount_mxn > 1e10 ? <span className="cf-dim"> · {L('en revisión', 'under review')}</span> : null}
                  {ctx?.size_vs_p99 != null && ctx.size_vs_p99 >= 2 && <span className="cf-dim"> · {formatNumber(Math.round(ctx.size_vs_p99))}× p99</span>}
                </dd>
              </div>
              <div className="cf-row">
                <dt>{L('Fechas', 'Dates')}</dt>
                <dd>
                  {c.publication_date && <span className="cf-ln"><span className="cf-dim">{L('publicado', 'published')}</span> {fdate(c.publication_date, lang)}</span>}
                  <span className="cf-ln"><span className="cf-dim">{L('firmado', 'signed')}</span> {fdate(c.contract_date, lang)}{gap != null && <b> · {gapPhrase(gap, lang)}</b>}</span>
                </dd>
              </div>
              <div className="cf-row">
                <dt>{L('Vigencia', 'Validity')}</dt>
                <dd>{c.start_date || c.end_date ? `${fdate(c.start_date, lang)} → ${fdate(c.end_date, lang)}` : <span className="cf-dim">{L('sin dato', 'no data')}</span>}</dd>
              </div>
              <div className="cf-row">
                <dt>{L('Procedimiento', 'Procedure')}</dt>
                <dd>{proc}{c.is_direct_award && <span className="cf-ln cf-dim">{art || L('sin artículo de excepción registrado', 'no exception article recorded')}</span>}</dd>
              </div>
              <div className="cf-row">
                <dt>{L('Sector', 'Sector')}</dt>
                <dd>{sec ? (en ? sec.nameEN : sec.name) : '—'}{cat && <span className="cf-dim"> · {cat}</span>}</dd>
              </div>
              <div className="cf-row">
                <dt>{L('Indicador de riesgo', 'Risk indicator')}</dt>
                <dd>
                  {c.risk_score != null && lvl
                    ? <span className="cf-ind" style={{ color: lvl === 'low' ? undefined : RISK_TEXT_COLORS[lvl] }}>{indTxt(c.risk_score)} · {isThinHistoryLow(c.risk_score, c.thin_history)
                        ? <abbr title={THIN_HISTORY_NOTE[lang]}>{THIN_HISTORY_LABEL[lang]}</abbr>
                        : LEVEL[lvl][en ? 1 : 0]}</span>
                    : <span className="cf-dim">{L('sin indicador de riesgo aún', 'no risk indicator yet')}</span>}
                  {c.risk_model_version && c.risk_score != null && <span className="cf-dim"> · {c.risk_model_version}</span>}
                  {top.length > 0 && (
                    <ul className="cf-why" aria-label={L('Lo que más movió el indicador', 'What moved the indicator most')}>
                      {top.map((f) => <li key={f.feature}><b>{f.contribution > 0 ? '+' : '−'}{Math.abs(f.contribution).toFixed(2)}</b>{factorLabel(f, lang)}</li>)}
                    </ul>
                  )}
                </dd>
              </div>
            </dl>

            {lectura.length > 0 && (
              <div className="cf-lectura">
                <p className="cf-k">{L('La lectura', 'The reading')}</p>
                <ul>{lectura.map((k) => <li key={k.key} className={k.crit ? 'cf-crit' : undefined}>{en ? k.en : k.es}</li>)}</ul>
              </div>
            )}
          </div>
          <div className="cf-layers">
              <details className="cf-lay">
                <summary>{L('Las partes', 'The parties')}{pair?.total_contracts ? <small> · {pair.total_contracts === 1 ? L('su único contrato', 'their only contract') : `${formatNumber(pair.total_contracts)} ${L('contratos entre ambos', 'contracts between them')}`}</small> : null}</summary>
                <ul>
                  <li>{L('Proveedor', 'Supplier')}: <b>{formatNumber(ctx?.vendor_total_contracts ?? 0)}</b> {L('contratos en el registro', 'contracts on record')}{ctx?.vendor_rank ? <>; {L('este es el', 'this is its')} <b>{en ? ordEn(ctx.vendor_rank) : `${ctx.vendor_rank}.º`}</b> {L('mayor', 'largest')}</> : null}</li>
                  {st?.ips_tier && <li>{L('Fila de investigación', 'Investigation line')}: <b>{L('nivel', 'tier')} {st.ips_tier}</b>{st.primary_pattern ? ` · ${L('patrón', 'pattern')} ${st.primary_pattern}` : ''}</li>}
                  {pair && pair.total_contracts > 0 && <li>{L('Con este comprador', 'With this buyer')}: <b>{formatNumber(pair.total_contracts)}</b> {L('contratos por', 'contracts for')} <b>{formatDualCurrency(pair.total_amount_mxn)}</b>{pair.first_year ? ` (${pair.first_year}–${pair.last_year})` : ''}</li>}
                </ul>
              </details>
              <details className="cf-lay">
                <summary>{L('El procedimiento', 'The procedure')}{c.procedure_number ? <small> · {c.procedure_number}</small> : null}</summary>
                <ul>
                  <li>{L('Expediente', 'Procedure no.')}: <b>{c.procedure_number || '—'}</b> · {L('contrato', 'contract no.')} <b>{c.contract_number || '—'}</b></li>
                  <li>{L('Tipo', 'Type')}: {(c.procedure_type || '—').toLowerCase()}</li>
                  <li>{L('Fuente', 'Source')}: {src} · {L('corte', 'cut')} {c.source_structure === 'E' ? L('semanal', 'weekly') : L('28 sep 2025', '28 Sep 2025')}</li>
                </ul>
              </details>
              <details className="cf-lay" open>
                <summary>{L('Los 3 más parecidos', 'The 3 nearest')}<small> · {L('mismo sector, procedimiento y año; monto y fecha más cercanos', 'same sector, procedure and year; nearest amount and date')}</small></summary>
                {near == null ? <p className="cf-dim">{nq.isError ? L('No se pudieron cargar.', 'Could not load them.') : L('Buscando…', 'Searching…')}</p>
                  : near.length === 0 ? <p className="cf-dim">{L('Ninguno en su banda de monto ese año.', 'None in its amount band that year.')}</p>
                  : <ul className="cf-near">{near.map((n) => {
                    const nl = n.risk_score != null ? getRiskLevelFromScore(n.risk_score) : null
                    const line = <>{formatCompactMXN(n.amount_mxn)} · {fdate(n.contract_date, lang)}{n.risk_score != null && nl ? <> · <span style={{ color: nl === 'low' ? undefined : RISK_TEXT_COLORS[nl] }}>{indTxt(n.risk_score)}</span></> : null}</>
                    return (
                      <li key={n.id}>
                        {onPickNear
                          ? <button type="button" className="cf-nb" onClick={() => onPickNear(n.id)} aria-label={L(`Abrir aquí el contrato de ${formatCompactMXN(n.amount_mxn)}`, `Open the ${formatCompactMXN(n.amount_mxn)} contract here`)}>{line}</button>
                          : <Link to={`/contracts/${n.id}`} className="ct-link">{line}</Link>}
                        <span className="cf-nw">{n.vendor_id ? <EntityIdentityChip type="vendor" id={n.vendor_id} name={n.vendor_name} size="xs" fullName inline hideIcon /> : null}<span aria-hidden="true">→</span>{n.institution_id ? <EntityIdentityChip type="institution" id={n.institution_id} name={n.institution_name} size="xs" fullName inline hideIcon /> : null}</span>
                      </li>
                    )
                  })}</ul>}
              </details>
          </div>
        </>}

      <footer className="cf-acts">
        <Link to={`/contracts/${id}`} state={{ from: 'archive' }} className="ct-btn is-ink">{L('Abrir expediente', 'Open dossier')} →</Link>
        {actions}
        {walk && (
          <span className="cf-walk">
            <button type="button" onClick={walk.onPrev} disabled={!walk.canPrev} aria-label={L('Contrato anterior (mayor)', 'Previous contract (larger)')}><ChevronLeft aria-hidden="true" /></button>
            <span aria-live="polite">{walk.label}</span>
            <button type="button" onClick={walk.onNext} disabled={!walk.canNext} aria-label={L('Contrato siguiente (menor)', 'Next contract (smaller)')}><ChevronRight aria-hidden="true" /></button>
          </span>
        )}
      </footer>
    </section>
  )
})
