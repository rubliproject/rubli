/**
 * /captura evidence: «Casos» (the current dominant pairs to look at — documented, leads, model only — a lock strip each),
 * and «El registro» (every buyer).
 * Every company opens its pair dissection, every buyer its own (components/captura/Diseccion.tsx).
 */
import { rankNo } from '@/components/kit/ListRow'
import { Link } from 'react-router-dom'
import type { CapturaPair, CasoEvidence } from '@/api/captura'
import { FoldToggle, useRowFold } from '@/components/contrato/Fold'
import { useMediaQuery } from '@/hooks/useIsMobile'
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import { formatEntityName } from '@/lib/entity/format'
import { RISK_TEXT_COLORS, SECTORS, getRiskLevelFromScore } from '@/lib/constants'
import { formatVendorName } from '@/lib/vendor/formatName'
import type { Relevo } from '@/lib/captura/relevo'
import type { Caso, CasoStatus } from '@/lib/captura/casos'
import { money, num, pct, type Lang } from '@/lib/captura/lectura'
import { useDissect } from './dissect'
import { instLabel } from './LaMitad'

const sectorOf = (id: number) => SECTORS.find((s) => s.id === id) ?? SECTORS[SECTORS.length - 1]
/** The indicator as a numeral: red only at crítico, muted when low (no green), ink otherwise. */
export function Ind({ r }: { r: number | null | undefined }) {
  if (r == null) return <span className="cr-ind">—</span>
  const l = getRiskLevelFromScore(r)
  return <span className={`cr-ind is-${l}`} style={l === 'critical' ? { color: RISK_TEXT_COLORS.critical } : undefined}>{r.toFixed(2)}</span>
}

/** Tenure 2002–2025 (thin), the locked years (≥ 80% of that year's income from the buyer, thick), then the ComprasMX cell. */
export function LockStrip({ p, color }: { p: Pick<CapturaPair, 'y0' | 'y1' | 'lock0' | 'lock1' | 'post_n'>; color: string }) {
  const W = 300, n = 24, cw = (W - 24) / n, X = (y: number) => (y - 2002) * cw
  return (
    <svg viewBox={`0 0 ${W} 14`} preserveAspectRatio="none" aria-hidden="true" className="cr-strip">
      <rect x={0} y={6} width={X(2026)} height={2} className="cr-track" />
      <rect x={X(p.y0)} y={5} width={X(p.y1 + 1) - X(p.y0)} height={4} fill={color} fillOpacity={0.4} />
      {p.lock0 != null && p.lock1 != null && <rect x={X(p.lock0)} y={2} width={X(p.lock1 + 1) - X(p.lock0)} height={10} fill={color} />}
      <line x1={X(2026) + 4} x2={X(2026) + 4} y1={0} y2={14} className="cg-seam" />
      <rect x={X(2026) + 9} y={3} width={13} height={8} className={p.post_n ? 'cg-ink' : 'cr-hollow'} />
    </svg>
  )
}

const STATUS: Record<CasoStatus, [string, string]> = {
  doc: ['caso documentado', 'documented case'], lead: ['pista', 'lead'], model: ['solo el modelo', 'model only'],
}

/** «Casos»: one current dominant pair per line — company · buyer · years · share of its income, the lock strip,
 *  money, direct award, indicator, and its evidence status with the doors (case, dossier, buyer, ARIA). */
export function Casos({ m, casos, ev, lang }: { m: Relevo; casos: Caso[]; ev: Map<string, CasoEvidence> | undefined; lang: Lang }) {
  const en = lang === 'en'
  const open = useDissect()
  // every documented case stays above the fold, however many the register holds (10 today, 15 after the rerun)
  const phone = useMediaQuery('(max-width: 760px)')
  const nDoc = casos.filter((c) => c.status === 'doc').length
  const fold = useRowFold(casos, Math.max(nDoc, phone ? 6 : 8)) // owner 11-07 «compact»: 8 on desktop, the rest one click away
  return (
    <>
      <ul className="cr-pr cr-cs" id="cr-cs">
        <li className="cr-hd" aria-hidden="true">
          <span>{en ? 'Company · buyer · years · share of its income' : 'Empresa · comprador · años · parte de su ingreso'}</span>
          <span className="cr-hm">{en ? 'under lock (≥ 80% of the year) · ComprasMX' : 'bajo candado (≥ 80% del año) · ComprasMX'}</span>
          <span className="cr-r">{en ? 'money' : 'dinero'}</span><span className="cr-r cr-hm">{en ? 'DA' : 'AD'}</span>
          <span className="cr-r">{en ? 'ind.' : 'ind.'}</span><span>{en ? 'evidence' : 'evidencia'}</span>
        </li>
        {fold.shown.map(({ p, status }, i) => {
          const b = m.buyer.get(p.institution_id)
          const color = m.colorOf(b?.sector_id)
          const e = ev?.get(`${p.vendor_id}-${p.institution_id}`)
          const nm = formatVendorName(p.name, 60), buyer = instLabel(b?.name, b?.siglas)
          return (
            <li key={`${p.vendor_id}-${p.institution_id}`} className={`${status === 'doc' ? 'is-doc' : ''}${fold.rowIn(i)}`.trim() || undefined}>
              <span className="cr-who2">
                <span className="cr-who">
                  <span className="cr-rk">{i + 1}</span><i style={{ background: color }} aria-hidden="true" />
                  <EntityIdentityChip type="vendor" id={p.vendor_id} name={p.name} variant="name" fullName />
                </span>
                <span className="cr-sub">
                  <EntityIdentityChip type="institution" id={p.institution_id} name={b?.name ?? buyer} variant="name" className="cr-of"
                    ariaLabel={formatEntityName('institution', b?.name ?? buyer, 'full')}>{buyer}</EntityIdentityChip>
                  <span className="cr-m cr-gray"> · {p.y0}–{String(p.y1).slice(2)} · <span className="cr-nw"><b>{p.ny}</b> {en ? 'yrs' : 'años'}</span><span className="cr-nw"> · <b>{pct(p.sh, lang)}</b> {en ? 'of its income' : 'de su ingreso'}</span></span>
                </span>
              </span>
              <span className="cr-hm"><LockStrip p={p} color={color} /></span>
              <span className="cr-r cr-m"><span className="sr-only">{en ? 'Money with the buyer: ' : 'Dinero con el comprador: '}</span><b>{money(p.m, lang)}</b>{p.flag ? ' †' : ''}{p.post_n > 0 && <><br />+{money(p.post, lang)}</>}</span>
              <span className="cr-r cr-m cr-hm"><span className="sr-only">{en ? 'Direct award: ' : 'Adjudicación directa: '}</span>{p.da == null ? '—' : pct(p.da, lang)}</span>
              <span className="cr-r"><span className="sr-only">{en ? 'Risk indicator: ' : 'Indicador de riesgo: '}</span><Ind r={p.risk} /></span>
              <span className="cr-ev">
                <span className="cr-seals"><em className={`is-${status}`}>{STATUS[status][en ? 1 : 0]}</em></span>
                <span className="cr-cdoor">
                  {e?.slug && <Link to={`/cases/${e.slug}`} aria-label={en ? `Documented case of ${nm}` : `Caso documentado de ${nm}`}>{en ? 'case' : 'caso'}</Link>}
                  <button type="button" onClick={() => open({ inst: p.institution_id, pair: p.vendor_id })} aria-label={en ? `Dissect ${nm} and ${buyer}` : `Diseccionar ${nm} y ${buyer}`}>{en ? 'dissect' : 'diseccionar'}</button>
                  {e?.tier != null && <Link to={`/aria/caso/${p.vendor_id}`}>ARIA {en ? 'T' : 'N'}{e.tier}<span className="sr-only">{en ? ` · tier ${e.tier} case file of ${nm}` : ` · expediente nivel ${e.tier} de ${nm}`}</span></Link>}
                </span>
              </span>
            </li>
          )
        })}
      </ul>
      <FoldToggle open={fold.open} rest={fold.rest} onToggle={fold.toggle} controls="cr-cs" />
    </>
  )
}

export function Registro({ m, lang }: { m: Relevo; lang: Lang }) {
  const en = lang === 'en'
  const open = useDissect()
  const fold = useRowFold(m.register, 8)
  return (
    <>
      <ul className="cr-reg" id="cr-reg">
        <li className="cr-hd" aria-hidden="true">
          <span className="cr-no">Nº</span>
          <span>{en ? 'Buyer' : 'Comprador'}</span><span className="cr-hm">{en ? 'Sector' : 'Sector'}</span>
          <span className="cr-r">{en ? 'Dominant suppliers' : 'Proveedores dominantes'}</span><span className="cr-r">{en ? 'Current' : 'Vigentes'}</span>
          <span className="cr-r cr-hm">{en ? 'Signing' : 'Siguen'}</span><span className="cr-r">{en ? 'Money to dominant suppliers' : 'Dinero a dominantes'}</span>
          <span className="cr-hm">{en ? 'Of its 2024–25 spend' : 'De su gasto 2024–25'}</span><span className="cr-r cr-hm">{en ? 'Cases · leads' : 'Casos · pistas'}</span>
        </li>
        {fold.shown.map((b, i) => {
          const sec = sectorOf(b.sector_id), color = m.colorOf(b.sector_id)
          return (
            <li key={b.institution_id} className={fold.rowIn(i).trim() || undefined}>
              <span className="cr-no">{rankNo(i + 1)}</span>
              <button type="button" className="cr-who" onClick={() => open({ inst: b.institution_id })}>
                <i style={{ background: color }} aria-hidden="true" />{instLabel(b.name, b.siglas)}
              </button>
              <span className="cr-hm cr-gray">{(en ? sec.nameEN : sec.name).toLowerCase()}</span>
              <span className="cr-r cr-m">{num(b.n, lang)}</span>
              <span className="cr-r cr-m"><b>{num(b.cur, lang)}</b></span>
              <span className="cr-r cr-m cr-hm">{b.post_n ? num(b.post_n, lang) : '—'}</span>
              <span className="cr-r cr-m">{money(b.cap, lang)}</span>
              <span className="cr-hm cr-ruler2">
                <svg viewBox="0 0 120 12" preserveAspectRatio="none" aria-hidden="true">
                  <rect x={0} y={5} width={120} height={2} className="cr-track" />
                  {b.share2425 != null && <rect x={0} y={2} width={Math.max(1, 120 * Math.min(1, b.share2425))} height={8} fill={color} />}
                  <line x1={60} x2={60} y1={0} y2={12} className="cr-halfmark" />
                </svg>
                <span className="cr-m cr-gray">{b.share2425 == null ? (en ? 'no spend' : 'sin gasto') : pct(b.share2425, lang)}</span>
              </span>
              <span className="cr-r cr-m cr-hm">{b.n_doc ? <b className="cr-docn">{b.n_doc}</b> : null}{b.n_doc ? ' · ' : ''}{num(b.n_lead, lang)}</span>
            </li>
          )
        })}
      </ul>
      <FoldToggle open={fold.open} rest={fold.rest} onToggle={fold.toggle} controls="cr-reg" />
    </>
  )
}
