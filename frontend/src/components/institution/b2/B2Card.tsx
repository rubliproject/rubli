/**
 * The ONE inline card of concept B2 (owner 11-06: «if I click one vendor I get data»): it opens under the chart the
 * click came from — a plate, a board row, a supplier square, a C3 row — and carries the same facts everywhere:
 * money in the current filter, years with this buyer (a strip in the administration colours), de cada 100 sin
 * concurso, the indicator chip, the persona-física label, its three largest contracts, and two doors.
 * Esc / ✕ close it; the page returns focus to what was clicked.
 */
import { useEffect, useRef, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { institutionApi } from '@/api/client'
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import { LEVEL } from '@/components/portada/Tablero'
import { ADMIN_COLORS, ADMIN_ORDER } from '@/lib/administrations'
import { familyMeta, familyOf } from '@/lib/categories/families'
import { getRiskLevelFromScore } from '@/lib/constants'
import { formatEntityName } from '@/lib/entity/format'
import { formatCompactMXN, formatDualCurrency, formatNumber } from '@/lib/utils'
import {
  GOB_NAME, GOB_YEARS, HOY_FROM, inactiveSince, isNew, panoramaApi, type Lang, type PanoramaCategory, type PanoramaSupplier,
  type Square, type Vista,
} from '@/lib/institution/panorama'

export function RiskChip({ score, lang, avg = true }: { score: number | null | undefined; lang: Lang; /** false = one contract's own score */ avg?: boolean }) {
  if (score == null) return <span className="bd-dim">—</span>
  const l = getRiskLevelFromScore(score)
  return (
    <span className={`bd-st is-${l}`}>
      <span className="sr-only">{lang === 'en' ? (avg ? 'average risk indicator: ' : 'risk indicator: ') : (avg ? 'indicador de riesgo promedio: ' : 'indicador de riesgo: ')}</span>
      {/* printed at most 0.99: a display score is a similarity, never a certainty (owner/RED 11-06) */}
      {LEVEL[l][lang]} {Math.min(score, 0.99).toFixed(2)}
    </span>
  )
}

/** One box per administration: filled = it had contracts with this buyer then. */
export function SexStrip({ years, first, last, lang }: { years?: [number, number][]; first: number; last: number; lang: Lang }) {
  return (
    <span className="ib2-strip" role="img" aria-label={lang === 'en' ? 'administrations with contracts' : 'sexenios con contratos'}>
      {ADMIN_ORDER.map((k) => {
        const [a, b] = GOB_YEARS[k] // year-level: a 2024 contract reads as AMLO's here (the card has no dates)
        const on = years ? years.some(([y, m]) => y >= a && y <= b && m > 0) : first <= b && last >= a
        return <i key={k} title={GOB_NAME[k]} style={{ background: on ? ADMIN_COLORS[k] : 'transparent', borderColor: on ? ADMIN_COLORS[k] : 'var(--color-border)' }} />
      })}
    </span>
  )
}

export function Frame({ title, onClose, label, lang, children }: { title: ReactNode; onClose: () => void; label: string; lang: Lang; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const head = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    head.current?.focus({ preventScroll: true })
    ref.current?.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' })
  }, [])
  return (
    <div ref={ref} className="ib2-card" role="region" aria-label={label}>
      <h3 ref={head} tabIndex={-1}>{title}<button type="button" className="ib2-x" onClick={onClose} aria-label={lang === 'en' ? 'close' : 'cerrar'}>✕</button></h3>
      {children}
    </div>
  )
}

export function VendorCard({ id, row, all, fallback, institutionId, vista, scope, cutYear, lang, onClose }: {
  id: number
  /** its row under the current filter (absent = not in this cut) */
  row: PanoramaSupplier | undefined
  /** its row over 2002–2026 (years, span), when it is among the 50 largest */
  all: PanoramaSupplier | undefined
  /** any row for it (e.g. this government's), when it is in neither of the above */
  fallback?: PanoramaSupplier
  institutionId: number
  vista: Vista
  scope: string
  cutYear: number
  lang: Lang
  onClose: () => void
}) {
  const en = lang === 'en'
  const any = row ?? all ?? fallback
  const since = vista === 'hoy' ? HOY_FROM : undefined
  const { data: top } = useQuery({
    queryKey: ['institution-b2', institutionId, 'vendor-contracts', id, since ?? 'all'],
    queryFn: () => institutionApi.getContracts(institutionId, { vendor_id: id, per_page: 3, sort_by: 'amount_mxn', sort_order: 'desc', ...(since ? { since } : {}) }),
    staleTime: 10 * 60 * 1000,
  })
  if (!any) return null
  const f = any.main_category_id != null ? familyMeta(familyOf(any.main_category_id)) : null
  const gone = all ? inactiveSince(all) : null
  const first = (all ?? any).first_year_all, last = (all ?? any).last_year_all
  const Cap = scope.charAt(0).toUpperCase() + scope.slice(1)
  return (
    <Frame lang={lang} onClose={onClose} label={any.vendor_name ?? String(id)} title={<>
      <EntityIdentityChip type="vendor" id={id} name={any.vendor_name} variant="name" fullName search={vista === 'hoy' ? 'vista=hoy' : undefined} />
      {any.persona_fisica && <span className="ib2-dim">{en ? '· individual' : '· persona física'}</span>}
      {f && <span className="ib2-dim"><i className="ib2-sw" style={{ background: f.color }} aria-hidden="true" />{en ? f.en : f.es}</span>}
      {any.in_ground_truth && <span className="bd-tag is-flag">{en ? 'documented case' : 'caso documentado'}</span>}
      {isNew(any, cutYear) && <span className="bd-tag is-new">{en ? 'new' : 'nuevo'}</span>}
      {vista === 'historia' && gone && <span className="bd-tag is-flag">{en ? `no contracts since ${gone}` : `sin contratos desde ${gone}`}</span>}
    </>}>
      <div className="ib2-cgrid">
        <dl>
          <div><dt>{Cap}</dt><dd>{row ? `${formatDualCurrency(row.amount_mxn)} · ${formatNumber(row.contracts)} ${en ? 'contracts' : 'contratos'}` : <span className="ib2-dim">{en ? 'not in this cut' : 'no aparece con este filtro'}</span>}</dd></div>
          {row?.share_pct != null && <div><dt>{en ? 'Of every 100 pesos' : 'De cada 100 pesos'}</dt><dd>{row.share_pct < 1 ? row.share_pct.toFixed(1) : Math.round(row.share_pct)}</dd></div>}
          {all && row !== all && <div><dt>{en ? '2002–2026' : 'De 2002 a 2026'}</dt><dd>{formatDualCurrency(all.amount_mxn)} · {formatNumber(all.contracts)} {en ? 'contracts' : 'contratos'}</dd></div>}
          <div><dt>{en ? 'Years with this buyer' : 'Años con este comprador'}</dt><dd>{first}–{last} <SexStrip years={all?.years} first={first} last={last} lang={lang} /></dd></div>
          <div><dt>{en ? 'Without a tender' : 'Sin concurso'}</dt><dd>{any.da_pct == null ? '—' : en ? `${Math.round(any.da_pct)} of every 100 contracts` : `${Math.round(any.da_pct)} de cada 100 contratos`}</dd></div>
          <div><dt>{en ? 'Risk indicator' : 'Indicador de riesgo'}</dt><dd><RiskChip score={any.avg_risk} lang={lang} /> <span className="ib2-dim">{en ? 'average of its contracts here' : 'promedio de sus contratos aquí'}</span></dd></div>
        </dl>
        <div>
          <p className="ib2-k">{en ? `Its 3 largest contracts${vista === 'hoy' ? ' under this government' : ''}` : `Sus 3 contratos mayores${vista === 'hoy' ? ' con este gobierno' : ''}`}</p>
          {top?.data.length ? (
            <ul className="ib2-klist">
              {top.data.map((k) => (
                <li key={k.id}>
                  <Link to={`/contracts/${k.id}`} title={k.title ?? undefined}><span className="ib2-num">{k.contract_date?.slice(0, 10) ?? k.contract_year}</span> {(k.title ?? '').toLowerCase()}</Link>
                  <span className="ib2-num">{formatCompactMXN(k.amount_mxn)}{k.is_direct_award ? (en ? ' · direct' : ' · directa') : ''}</span>
                  <RiskChip score={k.risk_score} lang={lang} avg={false} />
                </li>
              ))}
            </ul>
          ) : top ? <p className="ib2-note">{en ? 'No contracts in this period: its earlier ones are in its dossier.' : 'Sin contratos en este periodo: los anteriores están en su expediente.'}</p> : <div className="ib2-hold" aria-hidden="true" />}
          <p className="ib2-doors">
            <Link className="ib2-chip" to={`/vendors/${id}${vista === 'hoy' ? '?vista=hoy' : ''}`}>{en ? 'Open the dossier →' : 'Ver expediente →'}</Link>
            <Link className="ib2-chip" to={`/contracts?institution_id=${institutionId}&vendor_id=${id}`}>{en ? 'Its contracts here →' : 'Ver sus contratos aquí →'}</Link>
          </p>
        </div>
      </div>
    </Frame>
  )
}

export function CategoryCard({ c, institutionId, vista, lang, onClose, onVendor, onColumn }: {
  c: PanoramaCategory
  institutionId: number
  vista: Vista
  lang: Lang
  onClose: () => void
  onVendor: (id: number, el: Element) => void
  onColumn: (id: number) => void
}) {
  const en = lang === 'en'
  const name = (en ? c.name_en : c.name_es) ?? `#${c.category_id}`
  const f = familyMeta(familyOf(c.category_id))
  const q = { ...(vista === 'hoy' ? { since: HOY_FROM } : {}), category_id: c.category_id }
  const { data } = useQuery({ queryKey: ['institution-b2', institutionId, 'panorama', q], queryFn: () => panoramaApi.get(institutionId, q), staleTime: 10 * 60 * 1000 })
  return (
    <Frame lang={lang} onClose={onClose} label={name} title={<>
      <EntityIdentityChip type="category" id={c.category_id} name={name} variant="name" />
      <span className="ib2-dim"><i className="ib2-sw" style={{ background: f.color }} aria-hidden="true" />{en ? f.en : f.es}</span>
    </>}>
      <div className="ib2-cgrid">
        <dl>
          <div><dt>{vista === 'hoy' ? (en ? 'Under this government' : 'Con este gobierno') : (en ? '2002–2026' : 'De 2002 a 2026')}</dt><dd>{formatDualCurrency(c.amount_mxn)} · {formatNumber(c.contracts)} {en ? 'contracts' : 'contratos'}</dd></div>
          <div><dt>{en ? 'Without a tender' : 'Sin concurso'}</dt><dd>{c.da_pct == null ? '—' : en ? `${Math.round(c.da_pct)} of every 100 contracts` : `${Math.round(c.da_pct)} de cada 100 contratos`}</dd></div>
          <div><dt>{en ? 'Average indicator' : 'Indicador promedio'}</dt><dd><RiskChip score={c.avg_risk} lang={lang} /></dd></div>
          {data && <div><dt>{en ? 'Suppliers' : 'Proveedores'}</dt><dd>{formatNumber(data.vendors)}</dd></div>}
        </dl>
        <div>
          <p className="ib2-k">{en ? 'Who sells it the most here' : 'Quién le vende más aquí'}</p>
          {data ? (
            <ul className="ib2-klist">
              {data.suppliers.slice(0, 3).map((s) => (
                <li key={s.vendor_id}>
                  <button type="button" className="ib2-linkbtn" onClick={(e) => onVendor(s.vendor_id, e.currentTarget)}>{formatEntityName('vendor', s.vendor_name, 'full')}</button>
                  {s.persona_fisica && <span className="ib2-dim">{en ? '· individual' : '· persona física'}</span>}
                  <span className="ib2-num">{formatCompactMXN(s.amount_mxn)}</span>
                </li>
              ))}
            </ul>
          ) : <div className="ib2-hold" aria-hidden="true" />}
          <p className="ib2-doors">
            <Link className="ib2-chip" to={`/categories/${c.category_id}`}>{en ? 'Open its box in La bodega →' : 'Abrir su caja en La bodega →'}</Link>
            <button type="button" className="ib2-chip" onClick={() => onColumn(c.category_id)}>{en ? 'See the column in this category →' : 'Ver la columna en esta categoría →'}</button>
          </p>
        </div>
      </div>
    </Frame>
  )
}

export function SquareCard({ s, lang, onClose, onVendor }: { s: Square; lang: Lang; onClose: () => void; onVendor: (id: number, el: Element) => void }) {
  const en = lang === 'en'
  return (
    <Frame lang={lang} onClose={onClose} label={s.label} title={<><span className="ib2-band" style={{ background: ADMIN_COLORS[s.admin] }} aria-hidden="true" />{s.label}{s.from !== s.to ? ` · ${s.from}–${s.to}` : ''}</>}>
      <div className="ib2-cgrid">
        <dl>
          <div><dt>{en ? 'Money' : 'Dinero'}</dt><dd>{formatDualCurrency(s.amount, s.from === s.to ? s.from : undefined)}</dd></div>
          <div><dt>{en ? 'Contracts' : 'Contratos'}</dt><dd>{formatNumber(s.contracts)}</dd></div>
          <div><dt>{en ? 'Without a tender' : 'Sin concurso'}</dt><dd>{s.da == null || s.partial ? (en ? 'no data before 2011' : 'sin dato antes de 2011') : en ? `${Math.round(s.da)} of 100` : `${Math.round(s.da)} de 100`}</dd></div>
        </dl>
        <div>
          <p className="ib2-k">{en ? 'Its three largest suppliers' : 'Sus tres mayores proveedores'}</p>
          <ul className="ib2-klist">
            {s.top3.map((t) => (
              <li key={t.vendor_id}>
                <button type="button" className="ib2-linkbtn" onClick={(e) => onVendor(t.vendor_id, e.currentTarget)}>{formatEntityName('vendor', t.vendor_name, 'full')}</button>
                {t.persona_fisica && <span className="ib2-dim">{en ? '· individual' : '· persona física'}</span>}
                <span className="ib2-num">{formatCompactMXN(t.amount_mxn)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Frame>
  )
}
