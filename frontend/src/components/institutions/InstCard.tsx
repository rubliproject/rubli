/**
 * InstCard — the click layer of «El Tamiz en el tiempo» (owner 2026-10-16:
 * concept B, SIMPLIFIED). One institution in plain words: its grade in each
 * sexenio, then «de cada 100 pesos» — how many went without competition and
 * how many to its largest supplier — each beside the typical institution.
 * Rates come from the v3 ledger (/grade-v3, 2002–2025); no new endpoint.
 * L3: the name opens the dossier; its riskiest large category opens that
 * category's dossier.
 */
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { X } from 'lucide-react'
import { anatomyApi } from '@/lib/institution/anatomy'
import { institutionApi } from '@/api/client'
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import { TIER_STYLES, gradeToTierKey, gradeOutOf10, gradeWord } from '@/lib/tiers'
import { formatCompactMXN } from '@/lib/utils'
import { DATA_LAST_YEAR } from '@/lib/constants'
import { institutionTypeLabel, type FieldInst } from '@/lib/institutions/field'
import { winColor, winName, TOTAL_STOP, type Tiempo } from '@/lib/institutions/tiempo'

interface TopCat { category_id: number; name_es: string; name_en: string; total_value_mxn: number; avg_risk_score: number | null; direct_award_pct: number | null }

const LEVEL: Record<string, [string, string]> = { federal: ['Federal', 'Federal'], state: ['Estatal', 'State'], municipal: ['Municipal', 'Municipal'] }

export function InstCard({ inst, k, t, stop, lang, onClose, onCompare, comparing }: {
  inst: FieldInst
  k: number
  t: Tiempo
  stop: number
  lang: string
  onClose: () => void
  /** Present on the first card only, while no second card is open. */
  onCompare?: () => void
  comparing?: boolean
}) {
  const en = lang === 'en'
  const L = (es: string, e: string) => (en ? e : es)
  const g = useQuery({ queryKey: ['institution-grade-v3', inst.id], queryFn: () => anatomyApi.gradeV3(inst.id), staleTime: 3_600_000, retry: false })
  const cats = useQuery({
    queryKey: ['inst-topcat', inst.id],
    queryFn: () => institutionApi.getTopCategories(inst.id, { limit: 5 }) as Promise<{ data: TopCat[] }>,
    staleTime: 3_600_000,
    retry: false,
  })
  const rate = (pillar: string, item: string) => g.data?.ledger.find((r) => r.pillar === pillar && r.item === item)
  const per100 = (v: number | null | undefined) => (v == null ? '—' : String(Math.round(v * 100)))
  const nc = rate('competencia', 'nc_value')
  const top1 = rate('concentracion', 'top1')
  const split = rate('proceso', 'split')
  const ncN = nc?.rate != null ? Math.round(nc.rate * 100) : null
  const worstCat = (cats.data?.data ?? []).slice().sort((a, b) => (b.avg_risk_score ?? 0) - (a.avg_risk_score ?? 0))[0]

  const sc = (s: number) => (s >= TOTAL_STOP ? inst.total_score : t.score[s][k])
  const gr = (s: number) => (s >= TOTAL_STOP ? inst.grade : t.grade[s][k])
  const mx = (s: number) => (s >= TOTAL_STOP ? inst.total_amount_mxn : t.mxn[s][k])
  const g0 = gr(stop)
  const s0 = sc(stop)
  const tier = g0 ? TIER_STYLES[gradeToTierKey(g0)] : null
  const stopLabel = stop >= TOTAL_STOP ? '2002–2025' : winName(t.wins[stop].key)

  return (
    <section className="tm-card" aria-label={inst.name} tabIndex={-1}>
      <div className="tm-card-h">
        <EntityIdentityChip type="institution" id={inst.id} name={inst.name} variant="name" fullName className="tm-card-name" />
        <button type="button" className="tm-x" onClick={onClose} aria-label={L(`Cerrar ${inst.name}`, `Close ${inst.name}`)}><X aria-hidden="true" /></button>
      </div>
      <p className="tm-card-meta">
        {L(...LEVEL[inst.level])} · {institutionTypeLabel(inst.kind ?? 'other', lang)} · {formatCompactMXN(inst.total_amount_mxn)} {L(`de 2002 a ${DATA_LAST_YEAR}`, `2002–${DATA_LAST_YEAR}`)}
      </p>

      <div className="tm-card-grade">
        <span className="tm-big" style={tier ? { color: tier.ink } : undefined}>{g0 ? gradeOutOf10(s0) : '—'}</span>
        <span className="tm-card-gl">
          <b>{L('Calificación', 'Grade')} · {stopLabel}</b>
          <span>{Number.isNaN(s0) ? L('menos de 10 contratos: sin calificación', 'under 10 contracts: no grade') : `${L('de 10', 'out of 10')} · ${gradeWord(s0, en ? 'en' : 'es')} · ${formatCompactMXN(mx(stop))} ${L('en el periodo', 'in the period')}`}</span>
        </span>
      </div>
      <ol className="tm-seals" aria-label={L('Calificación en cada sexenio', 'Grade in each term')}>
        {[0, 1, 2, 3, 4, TOTAL_STOP].map((s) => {
          const gl = gr(s)
          const ts = gl ? TIER_STYLES[gradeToTierKey(gl)] : null
          const weak = s < TOTAL_STOP && (t.wins[s].coverage === 'weak' || t.wins[s].coverage === 'mixed')
          const name = s >= TOTAL_STOP ? '2002–25' : winName(t.wins[s].key)
          return (
            <li key={s} className={`${s === stop ? 'is-on' : ''}${weak ? ' is-weak' : ''}`}
              title={weak ? L('Sin marca de adjudicación directa antes de 2011: la competencia no se mide', 'No direct-award flag before 2011: competition is not measured') : undefined}>
              <i style={{ borderColor: s >= TOTAL_STOP ? undefined : winColor(t.wins[s].key), color: ts?.ink }}>{gl ? gradeOutOf10(sc(s)) : '·'}</i>
              <span>{name}</span>
              <span className="sr-only">{gl ? `${gradeOutOf10(sc(s))}, ${gradeWord(sc(s), en ? 'en' : 'es')}` : L('sin calificación', 'no grade')}</span>
            </li>
          )
        })}
      </ol>

      <h4 className="tm-card-k">{L('De cada 100 pesos que gastó, 2002–2025', 'Of every 100 pesos it spent, 2002–2025')}</h4>
      <div className="tm-hundred" role="img" aria-label={ncN == null ? L('Cargando', 'Loading') : L(`${ncN} de cada 100 pesos sin competencia`, `${ncN} of every 100 pesos without competition`)}>
        {Array.from({ length: 100 }, (_, i) => <i key={i} className={ncN != null && i < ncN ? 'is-nc' : undefined} />)}
      </div>
      <dl className="tm-plain">
        <div>
          <dt><b className="tm-nc">{per100(nc?.rate)}</b> {L('sin competencia', 'without competition')}</dt>
          <dd title={L('Adjudicación directa o licitación con un solo ganador; las invitaciones restringidas cuentan la mitad', 'Direct award or a tender with one winner; restricted invitations count half')}>
            {L('adjudicación directa o un solo ganador', 'direct award or a single winner')} · {L('típica', 'typical')} {per100(nc?.national_median)}
          </dd>
        </div>
        <div>
          <dt><b>{per100(top1?.rate)}</b> {L('a su mayor proveedor', 'to its largest supplier')}</dt>
          <dd>{L('institución típica', 'typical institution')} {per100(top1?.national_median)}</dd>
        </div>
        <div>
          <dt><b>{per100(split?.rate)}</b> {L('de cada 100 contratos, repartidos', 'of every 100 contracts, split up')}</dt>
          <dd>{L('3 o más al mismo proveedor el mismo día', '3+ to the same supplier on one day')} · {L('típica', 'typical')} {per100(split?.national_median)}</dd>
        </div>
      </dl>
      {g.isError && <p className="tm-card-meta">{L('El desglose no cargó.', 'The breakdown did not load.')}</p>}

      <div className="tm-card-acts">
        <Link to={`/institutions/${inst.id}`} className="tm-act is-main">{L('Abrir expediente', 'Open dossier')} →</Link>
        {onCompare && !comparing && <button type="button" className="tm-act" onClick={onCompare}>{L('Comparar', 'Compare')}</button>}
      </div>
      {worstCat && (
        <p className="tm-card-cat">
          <span>{L('Su rubro grande con indicador de riesgo más alto', 'Its large category with the highest risk indicator')}</span>
          <EntityIdentityChip type="category" id={worstCat.category_id} name={en ? worstCat.name_en : worstCat.name_es} variant="name" fullName className="tm-cat-name" />
          <span className="ct-mono">{L('indicador', 'indicator')} {worstCat.avg_risk_score?.toFixed(2) ?? '—'} · {worstCat.direct_award_pct != null ? `${Math.round(worstCat.direct_award_pct)}% ${L('directa', 'direct')}` : ''}</span>
        </p>
      )}
    </section>
  )
}
