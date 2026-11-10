/**
 * The vendor's card on the Focos Rojos skies (/aria?ver=mapa and ?ver=concept): aspects with their numbers,
 * the rosette as its fingerprint, the stamps, the dossier door; ← → walk the ranking it was opened from.
 */
import { useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { vendorApi } from '@/api/client'
import type { AriaMapaVendor } from '@/api/types'
import { Rosette, type Tuple } from '@/components/aria/RayosX'
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import { PATTERN_DEFS, patternName } from '@/lib/aria/patterns'
import { LEVEL_WORD, aspectText, softPattern, spanYears, stamps, tr } from '@/lib/aria/mapa'
import { ipsShown } from '@/lib/aria/escenario'
import { RISK_TEXT_COLORS, SECTORS, getRiskLevelFromScore } from '@/lib/constants'
import { formatVendorName } from '@/lib/vendor/formatName'
import { formatCompactMXN, formatNumber } from '@/lib/utils'
import '@/components/aria/mapa.css'

const sectorOf = (id: number | null | undefined) => SECTORS.find((s) => s.id === id) ?? SECTORS[SECTORS.length - 1]

/* ── the vendor's card: aspects with their numbers, the radar as fingerprint, the stamps ── */
export function VendorCard({ v, lang, prev, next, go, lead, split, splitPeriod, brief }: { v: AriaMapaVendor; lang: 'es' | 'en'; prev: AriaMapaVendor | null; next: AriaMapaVendor | null; go: (id: number) => void; /** the scenario's own figure first (label · value), when the card was opened from one */ lead?: { label: string; value: string }; /** its money split across sectors in the period, largest first (a vendor sells in several) */ split?: Array<{ sector: number; money: number }>; /** the period the split covers, in words */ splitPeriod?: string; /** /aria's drill: the page says the finding; the card drops its long glosses */ brief?: boolean }) {
  const en = lang === 'en'
  const L = (es: string, e: string) => (en ? e : es)
  const s = sectorOf(v.primary_sector_id)
  const lvl = v.avg_risk_score == null ? null : getRiskLevelFromScore(v.avg_risk_score)
  const ct = useQuery({ queryKey: ['pz-ros', v.vendor_id], queryFn: () => vendorApi.getContracts(v.vendor_id, { sort_by: 'amount_mxn', sort_order: 'desc', per_page: 100 }), staleTime: 300_000, enabled: !brief })
  const dots: Tuple[] = useMemo(() => (ct.data?.data ?? []).filter((c) => c.contract_year && c.amount_mxn > 0).map((c) => [c.contract_year!, c.amount_mxn, c.risk_score ?? null, c.is_direct_award ? 1 : 0]), [ct.data])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || (e.target as HTMLElement | null)?.closest?.('input, textarea, select')) return
      if (e.key === 'ArrowRight' && next) go(next.vendor_id)
      if (e.key === 'ArrowLeft' && prev) go(prev.vendor_id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, next, prev])
  const span = spanYears(v)
  const st = stamps(v)
  const soft = softPattern(v.primary_pattern, lang)

  return (
    <div className="am-card">
      <p className="am-kick"><i style={{ background: s.color }} aria-hidden="true" />{en ? s.nameEN : s.name}{v.first_contract_year && <> · {v.first_contract_year}–{v.last_contract_year}{span ? ` · ${span} ${L(span === 1 ? 'año' : 'años', span === 1 ? 'year' : 'years')}` : ''}</>}</p>
      <h3 className="am-ch">
        <EntityIdentityChip type="vendor" id={v.vendor_id} name={formatVendorName(v.vendor_name, 80)} size="inherit" sectorCode={s.code} fullName inline hideIcon />
        {v.persona_fisica && <small>{L('persona física', 'natural person')}</small>}
      </h3>
      {soft && v.primary_pattern && (
        <p className="am-gloss"><b className="am-tag">{soft}<span className="kf-mono">{v.primary_pattern}</span></b> · {patternName(v.primary_pattern, lang)}.{!brief && <> {en ? PATTERN_DEFS[v.primary_pattern]?.en : PATTERN_DEFS[v.primary_pattern]?.es}</>}</p>
      )}
      <ul className="am-aspl" aria-label={L('Lo que destaca', 'What stands out')}>
        {v.aspects.map((a) => <li key={a.k}><span>{aspectText(a, v, lang)}</span><span className="kf-mono">{L('supera al', 'above')} {Math.round(a.pct * 100)} %</span></li>)}
      </ul>
      <dl className="fw-dl kf-mono mt-3">
        {lead && <><dt>{lead.label}</dt><dd>{lead.value}</dd></>}
        <dt>{lead ? L('en todo el periodo', 'over the whole period') : L('monto', 'amount')}</dt><dd>{formatCompactMXN(v.total_value_mxn)}</dd>
        <dt>{L('contratos', 'contracts')}</dt><dd>{formatNumber(v.total_contracts)}</dd>
        <dt>{L('indicador de riesgo', 'risk indicator')}</dt><dd style={{ color: lvl ? RISK_TEXT_COLORS[lvl] : undefined }}>{v.avg_risk_score == null ? '—' : `${lvl === 'critical' ? '≥ 0.60' : v.avg_risk_score.toFixed(2)} ${lvl ? tr(LEVEL_WORD[lvl], lang) : ''}`}</dd>
        <dt>{L('prioridad', 'priority')}</dt><dd>{ipsShown(v).toFixed(2)} · {L('nivel', 'tier')} {v.ips_tier}</dd>
        {v.top_institution && v.top_institution_id != null && (
          <><dt>{L('comprador principal', 'main buyer')}</dt><dd><EntityIdentityChip type="institution" id={v.top_institution_id} name={v.top_institution} size="inherit" hideIcon /></dd></>
        )}
      </dl>
      {split && split.length > 0 && (
        <figure className="am-split">
          <figcaption>{L('dónde vende', 'where it sells')}{splitPeriod ? ` · ${splitPeriod}` : ''}</figcaption>
          <div className="am-split-bar" role="img" aria-label={split.map((t) => `${en ? sectorOf(t.sector).nameEN : sectorOf(t.sector).name} ${formatCompactMXN(t.money)}`).join(', ')}>
            {split.map((t) => <i key={t.sector} style={{ flexGrow: t.money, background: sectorOf(t.sector).color }} title={`${en ? sectorOf(t.sector).nameEN : sectorOf(t.sector).name} · ${formatCompactMXN(t.money)}`} />)}
          </div>
          <ul>
            {split.slice(0, 4).map((t) => { const total = split.reduce((a, b) => a + b.money, 0); return (
              <li key={t.sector}><i style={{ background: sectorOf(t.sector).color }} aria-hidden="true" />{en ? sectorOf(t.sector).nameEN : sectorOf(t.sector).name}<span className="kf-mono">{formatCompactMXN(t.money)} · {Math.round((t.money / total) * 100)} %</span></li>
            ) })}
            {split.length > 4 && <li><span>{L(`y ${split.length - 4} más`, `and ${split.length - 4} more`)}</span></li>}
          </ul>
        </figure>
      )}
      {!brief && <p className="am-note">{L('Prioridad: el orden en la fila de investigación, de 0 a 1. Nivel 1 desde 0.80, nivel 2 desde 0.60, nivel 3 desde 0.40. Suma indicador de riesgo, anomalía, registros externos y dinero.', 'Priority: the order in the investigation line, 0 to 1. Tier 1 from 0.80, tier 2 from 0.60, tier 3 from 0.40. It adds risk indicator, anomaly, external records and money.')}</p>}
      {/* brief: the contracts are one click away (the drill's level 3), so no fingerprint here */}
      {!brief && <div className="am-huella">
        <figure>
          {dots.length ? <Rosette list={dots} size={160} labels beat={v.vendor_id} ms={800} /> : <div className="am-ros-skel" aria-busy={ct.isLoading} />}
          <figcaption>{L('huella', 'fingerprint')}</figcaption>
        </figure>
        <p className="am-note">{L(`Un punto por contrato (sus ${dots.length || ''} mayores); ↑ 2002 y gira con el reloj; más lejos, más dinero; ● directa ○ otra; color = indicador.`, `One dot per contract (its ${dots.length || ''} largest); ↑ 2002, clockwise; farther out, more money; ● direct ○ other; colour = indicator.`)}</p>
      </div>}
      <p className="am-note">
        <span className="am-stamps" aria-label={L('Registros', 'Records')}>{st.map((x) => <i key={x.k} className={x.on ? 'is-on' : ''}>{x.k}</i>)}</span>
        {' '}{L('M = sólo el modelo; SAT, SFP y R son registros externos. Un indicador no es prueba.', 'M = the model only; SAT, SFP and R are external records. An indicator is not proof.')}
      </p>
      <div className="am-cfoot">
        <Link className="ct-link" to={`/aria/caso/${v.vendor_id}`}>{L('Abrir el expediente', 'Open the dossier')} ›</Link>
        <span className="am-np">
          <button type="button" disabled={!prev} onClick={() => prev && go(prev.vendor_id)}>‹ {L('anterior', 'previous')}</button>
          <button type="button" disabled={!next} onClick={() => next && go(next.vendor_id)}>{L('siguiente', 'next')} ›</button>
        </span>
      </div>
    </div>
  )
}
