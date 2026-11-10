/**
 * TamizCompare — two institutions side by side (institutions-phase2 § 2).
 *
 * Opened from the drawer's «Comparar» (URL `?inst=A&vs=B`). B is picked by
 * clicking a dot / waffle block or through the search. Each column: grade,
 * score/100, the three pillars, peer set + n, spend, coverage, the three
 * biggest ledger losses and the contract-count trend. Field data paints at
 * once; the peer n and the ledger load lazily from /grade-v3 (no new endpoint).
 * Desktop: a full-width band under the field (two columns would squeeze the
 * beeswarm beside it); phone/tablet: a bottom sheet with A stacked over B.
 */
import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeftRight, X } from 'lucide-react'
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import { DotBarRow } from '@/components/ui/DotBar'
import { TIER_STYLES, gradeToTierKey, gradeOutOf10, gradeWord } from '@/lib/tiers'
import { formatCompactMXN, formatNumber } from '@/lib/utils'
import { anatomyApi, fromV3, formatPoints, itemShort } from '@/lib/institution/anatomy'
import { coverageBandLabel, coverageValue } from '@/lib/institution/coverage'
import { pillarName, type FieldInst, type FieldModel } from '@/lib/institutions/field'
import { TrendChip, TREND_YEARS, trendDetail } from './TrendChip'
import { TamizSearch } from './TamizSearch'

interface Props {
  docked: boolean
  model: FieldModel
  a: FieldInst
  b: FieldInst | null
  lang: string
  onClose: () => void
  onPick: (idx: number) => void
  onSwap: () => void
}

export function TamizCompare({ docked, model, a, b, lang, onClose, onPick, onSwap }: Props) {
  const en = lang === 'en'
  const L = (es: string, e: string) => (en ? e : es)
  const closeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => { closeRef.current?.focus() }, [])
  return (
    <aside
      role="dialog"
      aria-modal="false"
      aria-labelledby="tamiz-compare-title"
      className={docked
        ? 'w-full rounded-sm border border-border bg-background-elevated p-4'
        : 'fixed inset-x-0 bottom-[calc(56px+var(--sab,0px))] z-40 max-h-[75vh] overflow-y-auto rounded-t-md border-t border-border bg-background-elevated p-4 shadow-lg sm:inset-x-auto sm:right-4 sm:w-[560px] sm:rounded-sm sm:border'}
    >
      <div className="flex items-start justify-between gap-2">
        <p id="tamiz-compare-title" className="text-[13px] ct-sc text-text-muted">{L('§ Comparar', '§ Compare')}</p>
        <div className="-m-2 flex">
          {b && (
            <button type="button" onClick={onSwap} aria-label={L('Intercambiar', 'Swap')} title={L('Intercambiar', 'Swap')}
              className="inline-flex min-h-11 min-w-11 items-center justify-center text-text-muted hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
              <ArrowLeftRight className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
          <button ref={closeRef} type="button" onClick={onClose} aria-label={L('Cerrar la comparación', 'Close the comparison')}
            className="inline-flex min-h-11 min-w-11 items-center justify-center text-text-muted hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
      {!b && (
        <div className="mt-2 space-y-2">
          <p className="text-[13px] leading-snug text-text-secondary">
            {L('Elija la segunda institución: haga clic en un punto del campo o búsquela.', 'Pick the second institution: click a dot in the field or search for it.')}
          </p>
          <TamizSearch insts={model.insts} lang={lang} onPick={onPick} />
        </div>
      )}
      <div className={`mt-3 grid gap-4 ${!b ? 'grid-cols-1' : docked ? 'grid-cols-2' : 'grid-cols-1 sm:grid-cols-2'}`}>
        <Column model={model} inst={a} lang={lang} />
        {b && <Column model={model} inst={b} lang={lang} divided={!docked} />}
      </div>
      {b && (
        <p className="mt-3 border-t border-border pt-2 ct-note">
          {L(
            `Pilares 0–100: mitad contra el estándar nacional, mitad contra su grupo de pares. Tendencia: por número de contratos, ${TREND_YEARS}. La calificación mide cómo compra, no si hubo delito.`,
            `Pillars 0–100: half against the national standard, half against the peer group. Trend: by number of contracts, ${TREND_YEARS}. The grade measures how it buys, not whether a crime occurred.`,
          )}
        </p>
      )}
    </aside>
  )
}

function Column({ model, inst, lang, divided = false }: { model: FieldModel; inst: FieldInst; lang: string; divided?: boolean }) {
  const en = lang === 'en'
  const L = (es: string, e: string) => (en ? e : es)
  const v3 = model.method === 'v3'
  const tier = TIER_STYLES[gradeToTierKey(inst.grade)]
  const { data: g, isLoading } = useQuery({
    queryKey: ['institution-grade-v3', inst.id],
    queryFn: () => anatomyApi.gradeV3(inst.id),
    enabled: v3,
    staleTime: 60 * 60 * 1000,
    retry: false,
  })
  const view = g ? fromV3(g, null) : null
  const losses = g ? [...g.ledger].filter((r) => r.points < 0).sort((x, y) => x.points - y.points).slice(0, 3) : []
  const lk = en ? 'en' : 'es'
  return (
    <section aria-label={inst.name} className={`min-w-0 space-y-2 ${divided ? 'border-t border-border pt-3 sm:border-t-0 sm:pt-0' : ''}`}>
      <div className="min-h-[2.75rem]">
        <EntityIdentityChip type="institution" id={inst.id} name={inst.name} variant="name" fullName className="text-[15px] leading-snug text-text-primary hover:underline underline-offset-2" />
      </div>
      <p className="font-mono tabular-nums">
        <span className="text-[22px] font-bold" style={{ color: tier.ink }}>{gradeOutOf10((inst.total_score * 100) / model.xMax)}</span>
        <span className="ml-2 text-[14px] text-text-secondary">{en ? 'out of 10' : 'de 10'} · {gradeWord((inst.total_score * 100) / model.xMax, en ? 'en' : 'es')}</span>
        {inst.provisional && (
          <span className="ml-2 rounded-sm border border-dashed border-text-muted px-1 py-0.5 text-[12px] ct-sc text-text-muted">{L('prov.', 'prov.')}</span>
        )}
      </p>
      <div className="space-y-1.5">
        {model.pillars.map((p) => (
          <DotBarRow key={p.key} label={pillarName(model, p.key, lang)} readout={`${Math.round(inst.pillars[p.key] ?? 0)}/${p.max}`}
            value={inst.pillars[p.key] ?? 0} max={p.max} color={TIER_STYLES.Regular.color} />
        ))}
      </div>
      <dl className="space-y-1 text-[12px] leading-snug">
        <div>
          <dt className="inline text-text-muted">{L('Pares: ', 'Peers: ')}</dt>
          <dd className="inline text-text-secondary">
            {view ? `${en ? view.peer.label_en : view.peer.label_es} · n=${formatNumber(view.peer.n)}` : isLoading ? '…' : [inst.kind, inst.size_band].filter(Boolean).join(' · ') || '—'}
          </dd>
        </div>
        <div>
          <dt className="inline text-text-muted">{L('Gasto: ', 'Spend: ')}</dt>
          <dd className="inline font-mono tabular-nums text-text-primary">{formatCompactMXN(inst.total_amount_mxn)} · {formatNumber(inst.total_contracts)} {L('contratos', 'contracts')}</dd>
        </div>
        {inst.coverage && (
          <div>
            <dt className="inline text-text-muted">{L('Cobertura CompraNet: ', 'CompraNet coverage: ')}</dt>
            <dd className="inline tabular-nums text-text-secondary">{coverageValue(inst.coverage, lk)} ({coverageBandLabel(inst.coverage.band, lk)})</dd>
          </div>
        )}
        {v3 && (
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
            <dt className="text-text-muted">{L('Tendencia:', 'Trend:')}</dt>
            <dd className="flex flex-wrap items-center gap-x-1.5">
              {inst.trend
                ? <><TrendChip trend={inst.trend} slope={inst.trend_slope} lang={lang} /><span className="font-mono text-[13px] tabular-nums text-text-muted">{trendDetail(inst.trend_slope, lang)}</span></>
                : <span className="text-text-muted">{L('sin años suficientes', 'not enough years')}</span>}
            </dd>
          </div>
        )}
      </dl>
      {v3 && (
        <div>
          <p className="text-[13px] ct-sc text-text-muted">{L('Lo que más le resta', 'Biggest losses')}</p>
          {isLoading && <p className="mt-1 h-10 animate-pulse rounded-sm bg-background" aria-hidden="true" />}
          {!isLoading && losses.length === 0 && <p className="mt-1 text-[12px] text-text-muted">{g ? L('Sin pérdidas en el registro de puntos.', 'No losses in the points ledger.') : L('No disponible.', 'Not available.')}</p>}
          {losses.length > 0 && (
            <ol className="mt-1 space-y-0.5 text-[12px]">
              {losses.map((r) => (
                <li key={`${r.pillar}-${r.item}`} className="flex items-baseline justify-between gap-2" style={{ maxWidth: 'none' }}>
                  <span className="min-w-0 truncate text-text-secondary">{pillarName(model, r.pillar, lang)} · {itemShort(r.item, lk)}</span>
                  <span className="shrink-0 font-mono tabular-nums text-text-primary">{formatPoints(r.points)}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </section>
  )
}
