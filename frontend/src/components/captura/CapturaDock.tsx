/**
 * CapturaDock — L2 of /captura: the dominant supplier's card (EntityIdentityChip), its dependency, years,
 * money, direct-award share by money (2011+), the CompraNet risk indicator, the still-signing badge,
 * a year strip ending in the ComprasMX column, and its 6 largest contracts with the buyer (→ /contracts/:id).
 */
import { useRef } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { capturaApi, type CapturaBuyer, type CapturaPair } from '@/api/captura'
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import { RISK_COLORS, SECTORS, getRiskLevelFromScore } from '@/lib/constants'
import { formatCompactMXN, formatNumber } from '@/lib/utils'
import { usePanelFocus } from '@/hooks/useModal'

const Y0 = 2002
const Y1 = 2025
const RISK_WORD = { critical: ['crítico', 'critical'], high: ['alto', 'high'], medium: ['medio', 'medium'], low: ['bajo', 'low'] } as const

export function CapturaDock({ lang, pair: p, buyer: b, onClose, onCite }: {
  lang: 'en' | 'es'; pair: CapturaPair; buyer: CapturaBuyer; onClose: () => void; onCite: () => void
}) {
  const en = lang === 'en'
  const L = (es: string, e: string) => (en ? e : es)
  const q = useQuery({ queryKey: ['captura', 'pair', p.vendor_id, p.institution_id], queryFn: () => capturaApi.pair(p.vendor_id, p.institution_id), staleTime: 3_600_000 })
  const close = useRef<HTMLButtonElement>(null)
  usePanelFocus(close)
  const sec = SECTORS.find((s) => s.id === b.sector_id) ?? SECTORS[SECTORS.length - 1]
  const full = q.data?.pair
  const pct = (x: number) => `${Math.round(100 * x)}%`
  const lvl = p.risk != null ? getRiskLevelFromScore(p.risk) : null

  // year strip: bars 2002–2025 on one scale, the seam, then the ComprasMX bar (ink)
  const yrs = new Map(full?.yrs ?? [])
  const mx = Math.max(1, ...(full?.yrs ?? []).map((y) => y[1]), p.post)
  const n = Y1 - Y0 + 1, w = 100 / (n + 2.2)

  return (
    <motion.aside className="cg-dock" aria-labelledby="cg-dock-h"
      // leaves the way it came: a side panel on desktop, a bottom sheet (cg-up) on phones
      exit={{ ...(window.matchMedia('(max-width: 640px)').matches ? { y: '100%' } : { x: '104%' }), transition: { duration: 0.2, ease: [0.4, 0, 1, 1] } }}>
      <div className="cg-dock-top">
        <i style={{ background: sec.color }} aria-hidden="true" />
        <span>{L('Proveedor dominante', 'Dominant supplier')} · {en ? sec.nameEN : sec.name}</span>
        <button ref={close} type="button" onClick={onClose}>{L('Cerrar', 'Close')} <kbd>Esc</kbd></button>
      </div>
      <h2 id="cg-dock-h" className="cg-dock-h">
        <EntityIdentityChip type="vendor" id={p.vendor_id} name={p.name} variant="name" fullName riskScore={p.risk} />
      </h2>
      <p className="cg-dock-of">
        {L('vive de', 'lives off')}{' '}
        <EntityIdentityChip type="institution" id={b.institution_id} name={b.name} variant="name" fullName sectorCode={sec.code} />
      </p>
      <div className="cg-dock-big">
        <div><b>{pct(p.sh)}</b><span>{L('de su ingreso federal', 'of its federal income')}</span></div>
        <div><b>{formatCompactMXN(p.m)}{p.flag ? ' †' : ''}</b><span>{L('con este comprador', 'with this buyer')}</span></div>
      </div>
      {p.post_n > 0 && <p className="cg-dock-still">{L('Sigue firmando desde el cierre de CompraNet (28 sep 2025)', 'Still signing after the blackout')} · {formatNumber(p.post_n)} {L('contratos en ComprasMX', 'contracts in ComprasMX')}{p.post ? ` · ${formatCompactMXN(p.post)}` : ''}</p>}
      <dl className="cg-dock-dl kf-mono">
        <dt>{L('Años con el comprador', 'Years with the buyer')}</dt><dd>{p.y0}–{p.y1} · {p.ny}</dd>
        <dt>{L('Bajo candado (≥ 80% del año)', 'Under lock (≥ 80% of the year)')}</dt><dd>{p.lock0 ? `${p.lock0}–${p.lock1} · ${p.lockrun} ${L('seguidos', 'in a row')}` : L('ningún año completo', 'no full year')}</dd>
        <dt>{L('Adjudicación directa', 'Direct award')}</dt><dd>{p.da == null ? L('sin dato (2002–2010)', 'no data (2002–2010)') : `${pct(p.da)} ${L('del dinero 2011+', 'of 2011+ money')}`}</dd>
        {full && <><dt>{L('Contratos', 'Contracts')}</dt><dd>{formatNumber(full.n)}</dd></>}
        {full && full.nbuyers != null && <><dt>{L('Otros compradores', 'Other buyers')}</dt><dd>{formatNumber(Math.max(0, full.nbuyers - 1))} · {formatCompactMXN(Math.max(0, full.vt - p.m))}</dd></>}
        <dt>{L('Indicador de riesgo', 'Risk indicator')}</dt>
        <dd>{lvl ? <><b style={{ color: lvl === 'low' ? undefined : RISK_COLORS[lvl] }}>{p.risk!.toFixed(2)}</b> {RISK_WORD[lvl][en ? 1 : 0]}</> : '—'}</dd>
      </dl>
      {(p.gt || full?.tier || full?.p6 || full?.efos || full?.sfp) ? (
        <p className="cg-dock-seals">
          {p.gt === 'doc' && <em className="is-doc">{L('caso documentado', 'documented case')}</em>}
          {p.gt === 'lead' && <em>{L('pista', 'case lead')}</em>}
          {full?.tier ? <em>ARIA {L('nivel', 'tier')} {full.tier}</em> : null}
          {full?.p6 ? <em>P6 · {L('dependencia de un comprador', 'single-buyer dependence')}</em> : null}
          {full?.efos ? <em>EFOS</em> : null}
          {full?.sfp ? <em>SFP</em> : null}
        </p>
      ) : null}
      <div className="cg-dock-yrs" aria-hidden="true">
        <svg viewBox="0 0 100 48" preserveAspectRatio="none">
          {Array.from({ length: n }, (_, k) => {
            const v = yrs.get(Y0 + k) ?? 0, h = v ? Math.max(1.5, (44 * v) / mx) : 1
            return <rect key={k} x={k * w} y={46 - h} width={w * 0.82} height={h} style={{ fill: v ? sec.color : 'var(--color-border)' }} />
          })}
          <line x1={n * w + w * 0.5} x2={n * w + w * 0.5} y1={0} y2={48} className="cg-seam" />
          <rect x={n * w + w} width={w * 1.1} y={p.post ? 46 - Math.max(1.5, (44 * p.post) / mx) : 45} height={p.post ? Math.max(1.5, (44 * p.post) / mx) : 1} className={p.post_n ? 'cg-ink' : 'cg-none'} />
        </svg>
        <div className="kf-mono"><span>{Y0}</span><span>{Y1}*</span><span>ComprasMX</span></div>
      </div>
      <div className="cg-dock-cts">
        <h3>{L('Mayores contratos con el comprador', 'Largest contracts with the buyer')}</h3>
        {q.isLoading && <p className="ct-note">{L('Cargando…', 'Loading…')}</p>}
        {q.isError && <p className="ct-note">{L('No se pudieron cargar los contratos.', 'The contracts failed to load.')}</p>}
        {q.data?.contracts.map((c) => (
          <Link key={c.id} to={`/contracts/${c.id}`}>
            <span className="kf-mono">{c.year}</span>
            <span className="kf-mono cg-num"><b>{formatCompactMXN(c.amount_mxn)}</b>{c.is_direct_award ? <i> · {L('AD', 'DA')}</i> : null}</span>
            <span className="cg-t">{c.title ? c.title.charAt(0).toUpperCase() + c.title.slice(1).toLowerCase() : L('(sin título)', '(untitled)')}</span>
          </Link>
        ))}
      </div>
      <div className="cg-dock-acts">
        <Link className="is-pri" to={`/vendors/${p.vendor_id}`}>{L('Abrir expediente', 'Open dossier')}</Link>
        <Link to={`/institutions/${b.institution_id}`}>{L('Comprador', 'Buyer')}</Link>
        <button type="button" onClick={onCite}>{L('Citar', 'Cite')}</button>
      </div>
    </motion.aside>
  )
}
