/**
 * CategoryAnaquel — «El Anaquel / The Shelves», the /categories centerpiece
 * (2026-10-08; replaces the ranked bars of «El Escalafón»).
 *
 * A thin adapter over the kit `<Field>` (components/kit/Field.tsx, 2026-10-15):
 * one dot = one institution buying in one category (~2,900 pairs with 100+
 * contracts — see lib/categories/field.ts). The page's sort keys are LAYOUTS
 * the same dots tween between (NYT Upshot object constancy):
 *   Gasto      x = pair spend (log) · lit = the few dots holding half the money
 *   Riesgo     x = risk indicator · lit = high/critical dots (they hold little money)
 *   Contratos  x = contract count (log) · lit = half the contracts · hollow = thin sample
 *   Adj. dir.  x = direct-award % · the EU 10% line · lit = dots over it
 * Rows are CATEGORIES (what was bought): the top 12 under the current sort,
 * re-ranked per layout; every other dot folds onto one rail. A sector chip
 * narrows the top 12 to that sector's categories.
 */
import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { categoriesApi } from '@/api/client'
import { Field, FieldCard, type FieldAxis, type FieldBand, type FieldRow } from '@/components/kit/Field'
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import { Skeleton } from '@/components/ui/skeleton'
import { FootNotes } from '@/components/kit/FootNotes'
import { formatEntityName } from '@/lib/entity/format'
import {
  buildRows, decodeField, findingOf, litLevel, litSet, DA_LINE, THIN_BELOW,
  type FieldSort, type Pair,
  MIN_RATE_DOTS,
} from '@/lib/categories/field'
import { RISK_COLORS, RISK_THRESHOLDS, SECTOR_COLORS, getSectorName } from '@/lib/constants'
import { formatCompactMXN, formatNumber } from '@/lib/utils'
import type { CategorySummaryItem } from './types'

const ACCENT = '--color-text-primary' // C1 ink: the lit set (DESIGN.md §6.3); red stays reserved
const pct0 = (v: number) => `${Math.round(v * 100)}%`
const SPEND_TICKS = [7, 8, 9, 10, 11, 12]
const MONEY_ES = ['1 MDP', '≤10 MDP', '100 MDP', '1,000 MDP', '10,000 MDP', '100,000 MDP', '1 billón']
const MONEY_EN = ['1M', '≤10M', '100M', '1B', '10B', '100B', '1T']

interface Props {
  items: CategorySummaryItem[]
  sortKey: FieldSort
  activeSector: string | null
  onSector: (code: string | null) => void
  lang: 'en' | 'es'
  /** Register row hover: that category's dots stay lit, the rest fade. */
  focusCategory: number | null
  /** Every category gets a row (the page's «Ver las 72» toggle, ?todas=1). */
  showAll?: boolean
  /** When given, the field prints its own sort chips (the /categories page owns them). */
  onSortKey?: (key: FieldSort) => void
}

export function CategoryAnaquel({ items, sortKey, activeSector, onSector, lang, focusCategory, showAll = false, onSortKey }: Props) {
  const en = lang === 'en'
  const L = (es: string, e: string) => (en ? e : es)
  const { data, isLoading, isError } = useQuery({
    queryKey: ['categories', 'field'],
    queryFn: () => categoriesApi.getField(),
    staleTime: 600_000,
  })
  const pairs = useMemo(() => (data ? decodeField(data, items) : []), [data, items])
  const catById = useMemo(() => new Map(items.map((c) => [c.category_id, c])), [items])
  const catName = (id: number) => {
    const c = catById.get(id)
    return c ? (en ? c.name_en : c.name_es) : String(id)
  }

  // ── Model ────────────────────────────────────────────────────────────────
  const bandRows = useMemo(() => buildRows(pairs, sortKey, activeSector, showAll), [pairs, sortKey, activeSector, showAll])
  const focusMembers = useMemo(
    () => pairs.flatMap((p, i) => (!activeSector || p.sector_code === activeSector ? [i] : [])),
    [activeSector, pairs],
  )
  const lit = useMemo(() => new Set(litSet(pairs, focusMembers, sortKey)), [pairs, focusMembers, sortKey])
  const finding = useMemo(() => findingOf(pairs, focusMembers, sortKey), [pairs, focusMembers, sortKey])
  // A sparse lit set (the 26 dots that hold half the money) is the finding — draw it larger.
  const sparse = lit.size < pairs.length * 0.15
  const rows: FieldRow[] = useMemo(
    () => pairs.map((p, i) => ({
      id: String(i),
      label: `${p.institution_name} · ${p.category_id}`,
      bandId: String(p.category_id),
      x: { spend: p.value, risk: (p.risk ?? 0) * 100, contracts: p.contracts, direct_award: p.da ?? 0 },
      lit: !lit.has(i) ? null : sortKey === 'risk' ? litLevel(p) : 'lit',
      // Hollow = thin sample. Spend is a sum, not an estimate, so its layout draws every dot solid.
      hollow: sortKey !== 'spend' && p.contracts < THIN_BELOW,
      size: sparse && lit.has(i) ? 1.7 : undefined,
    })),
    [pairs, lit, sortKey, sparse],
  )

  const fmtAgg = (v: number) => {
    switch (sortKey) {
      case 'spend': return formatCompactMXN(v)
      case 'risk': return v.toFixed(0)
      case 'contracts': return formatNumber(Math.round(v))
      case 'direct_award': return `${v.toFixed(0)}%`
    }
  }
  const litWord = {
    spend: L('la mitad del gasto', 'half the spend'),
    risk: L('crítico (≥ 60)', 'critical (≥ 60)'),
    contracts: L('la mitad de los contratos', 'half the contracts'),
    direct_award: L(`adj. directa > ${DA_LINE}% (línea UE)`, `direct award > ${DA_LINE}% (EU line)`),
  }[sortKey]
  const aggHead = {
    spend: L('Gasto en el campo', 'Spend in the field'),
    risk: L('Indicador medio', 'Mean indicator'),
    contracts: L('Contratos en el campo', 'Contracts in the field'),
    direct_award: L('Adj. directa', 'Direct award'),
  }

  const axes: FieldAxis[] = useMemo(() => {
    const riskTick = (t: number) => {
      if (t === 0 || t === 100) return String(t)
      return t === RISK_THRESHOLDS.medium * 100 ? L('medio 25', 'medium 25') : t === RISK_THRESHOLDS.high * 100 ? L('alto 40', 'high 40') : L('crítico 60', 'critical 60')
    }
    const riskTicks = [0, RISK_THRESHOLDS.medium * 100, RISK_THRESHOLDS.high * 100, RISK_THRESHOLDS.critical * 100, 100]
    return [
      {
        key: 'spend', label: { es: 'Gasto', en: 'Spend' }, scale: 'log10', domain: [1e7, 1e12],
        // phone: every other money tick, or «1,000 MDP» and «10,000 MDP» collide
        ticks: SPEND_TICKS.map((t) => ({ at: 10 ** t, label: (en ? MONEY_EN : MONEY_ES)[t - 6], phone: t % 2 === 0 })),
        rules: SPEND_TICKS.map((t) => ({ at: 10 ** t })),
        note: L('Cada punto: una institución comprando en una categoría. Más a la derecha, más dinero; cada raya = 10 veces más.', 'Each dot: one institution buying in one category. Further right, more money; each line = 10 times more.'),
        readoutHead: aggHead.spend,
      },
      {
        key: 'risk', label: { es: 'Riesgo', en: 'Risk' }, scale: 'linear', domain: [0, 100],
        ticks: riskTicks.map((t) => ({ at: t, label: riskTick(t), tone: t >= RISK_THRESHOLDS.high * 100 && t < 100 ? 'crit' as const : undefined })),
        // High-risk wash right of the 40 line; tiers 25 / 40 / 60.
        rules: [
          { at: RISK_THRESHOLDS.medium * 100, alpha: 0.8 },
          { at: RISK_THRESHOLDS.high * 100, tone: 'crit', alpha: 0.6, wash: 'risk' },
          { at: RISK_THRESHOLDS.critical * 100, tone: 'crit', alpha: 0.9 },
        ],
        note: L('eje: indicador de riesgo medio del par (0–100)', 'axis: the pair’s mean risk indicator (0–100)'),
        readoutHead: aggHead.risk,
      },
      {
        key: 'contracts', label: { es: 'Contratos', en: 'Contracts' }, scale: 'log10', domain: [100, 10 ** 5.5],
        ticks: [2, 3, 4, 5].map((t) => ({ at: 10 ** t, label: formatNumber(10 ** t) })),
        rules: [2, 3, 4, 5].map((t) => ({ at: 10 ** t })),
        note: L('Más a la derecha, más contratos; cada raya = 10 veces más.', 'Further right, more contracts; each line = 10 times more.'),
        readoutHead: aggHead.contracts,
      },
      {
        key: 'direct_award', label: { es: 'Adj. directa', en: 'Direct award' }, scale: 'linear', domain: [0, 100],
        ticks: [DA_LINE, 25, 50, 75, 100].map((t) => ({ at: t, label: t === DA_LINE ? L(`${DA_LINE}% UE`, `${DA_LINE}% EU`) : `${t}%`, tone: t === DA_LINE ? 'crit' as const : undefined })),
        rules: [...[25, 50, 75, 100].map((t) => ({ at: t })), { at: DA_LINE, tone: 'crit' as const, alpha: 0.9 }],
        note: L('eje: % de contratos por adjudicación directa', 'axis: % of contracts directly awarded'),
        readoutHead: aggHead.direct_award,
      },
    ]
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [en])

  const railRow = bandRows.find((r) => r.rail)
  const railName = railRow
    ? activeSector
      ? L(`${railRow.cats} categorías de los otros sectores`, `${railRow.cats} categories in the other sectors`)
      : L(`${railRow.cats} categorías más`, `${railRow.cats} more categories`)
    : ''
  const bands: FieldBand[] = bandRows.filter((r) => !r.rail).map((r, i, all) => {
    const cat = catById.get(Number(r.key))
    const name = catName(Number(r.key))
    return {
      id: r.key,
      name,
      sortValue: all.length - i,
      aggregate: fmtAgg(r.agg),
      label: (mobile: boolean) => (
        <span className="flex items-baseline gap-1.5">
          <span aria-hidden="true" className="ct-sq flex-shrink-0" style={{ ['--c' as string]: (cat && SECTOR_COLORS[cat.sector_code]) ?? SECTOR_COLORS.otros }} />
          <EntityIdentityChip
            type="category"
            id={Number(r.key)}
            name={name}
            variant="name"
            fullName
            className="text-text-primary hover:underline underline-offset-2"
            style={{ fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: mobile ? 13 : 15 }}
          />
          {r.thin && (
            <span
              className="flex-shrink-0 whitespace-nowrap font-mono text-[12px] text-text-muted"
              title={L(`Menos de ${MIN_RATE_DOTS} puntos: se muestra, pero se ordena al final`, `Fewer than ${MIN_RATE_DOTS} dots: shown, but ranked last`)}
            >
              n={r.members.length}
            </span>
          )}
        </span>
      ),
    }
  })
  const railLabel = !railRow ? null : activeSector ? (
    <button
      type="button"
      onClick={() => onSector(null)}
      aria-label={L('Volver a todas las categorías', 'Back to all categories')}
      className="text-left text-[12px] leading-tight text-text-muted underline decoration-dotted underline-offset-2 hover:decoration-solid focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      ← {railName}
    </button>
  ) : (
    <span className="text-[12px] leading-tight text-text-muted">+ {railName} · {formatNumber(railRow.members.length)} {L('puntos', 'dots')}</span>
  )

  // ── Interaction ──────────────────────────────────────────────────────────
  const [pinned, setPinned] = useState<number | null>(null)
  // The dots spread from the axis once per session (one dot = one pair; the spread is the axis).
  const [enter] = useState(() => {
    try {
      if (window.sessionStorage.getItem('rubli_enter_anaquel')) return false
      window.sessionStorage.setItem('rubli_enter_anaquel', '1')
      return true
    } catch { return false }
  })
  useEffect(() => { setPinned(null) }, [data])

  // ── Copy ─────────────────────────────────────────────────────────────────
  const sectorLabel = activeSector ? getSectorName(activeSector, lang) : null
  const where = sectorLabel ? L(` en ${sectorLabel}`, ` in ${sectorLabel}`) : ''
  const topPair = finding.top != null ? pairs[finding.top] : null
  const who = (p: Pair) => `${p.siglas || formatEntityName('institution', p.institution_name, 'sm')} · ${catName(p.category_id)}`
  const sentence = (() => {
    const f = finding
    if (!f.n) return ''
    switch (sortKey) {
      case 'spend':
        return L(
          `Sólo ${formatNumber(f.lit)} de ${formatNumber(f.n)} puntos${where} —los marcados— reúnen la mitad del dinero de estos puntos. El mayor: ${topPair ? who(topPair) : '—'}, ${topPair ? formatCompactMXN(topPair.value) : '—'}.`,
          `Just ${formatNumber(f.lit)} of ${formatNumber(f.n)} dots${where} — the highlighted ones — hold half the money in these dots. The largest: ${topPair ? who(topPair) : '—'}, ${topPair ? formatCompactMXN(topPair.value) : '—'}.`,
        )
      case 'risk':
        return L(
          `${formatNumber(f.lit)} puntos${where} marcan un indicador de riesgo alto o crítico (40 o más) y juntos pesan apenas ${pct0(f.value ? f.litValue / f.value : 0)} del gasto de los puntos: el riesgo no arde donde se apila el dinero.`,
          `${formatNumber(f.lit)} dots${where} carry a high or critical risk indicator (40 or more), and together weigh just ${pct0(f.value ? f.litValue / f.value : 0)} of the dots' spend: risk does not burn where the money piles.`,
        )
      case 'contracts':
        return L(
          `${formatNumber(f.lit)} puntos${where} reúnen la mitad de los ${formatNumber(f.contracts)} contratos que cubren los puntos. Los ${formatNumber(f.thin)} puntos huecos tienen menos de ${THIN_BELOW} contratos: su indicador descansa en una muestra delgada.`,
          `${formatNumber(f.lit)} dots${where} hold half of the ${formatNumber(f.contracts)} contracts the dots cover. The ${formatNumber(f.thin)} hollow dots have fewer than ${THIN_BELOW} contracts: their indicator rests on a thin sample.`,
        )
      case 'direct_award':
        return L(
          `${pct0(f.n ? f.lit / f.n : 0)} de los puntos${where} adjudica directo más del ${DA_LINE}% —la línea del marcador del mercado único de la UE— y pesan ${pct0(f.value ? f.litValue / f.value : 0)} del gasto de los puntos. Sin datos de adjudicación directa 2002–2010: es un mínimo.`,
          `${pct0(f.n ? f.lit / f.n : 0)} of the dots${where} award more than ${DA_LINE}% directly — the EU single-market scoreboard line — and weigh ${pct0(f.value ? f.litValue / f.value : 0)} of the dots' spend. No direct-award data for 2002–2010: this is a lower bound.`,
        )
    }
  })()

  const litLegend = sortKey === 'risk'
    ? [
        { key: 'critical', label: litWord, color: RISK_COLORS.critical },
        { key: 'high', label: L('alto (40–60)', 'high (40–60)'), color: RISK_COLORS.high },
      ]
    : [{ key: 'lit', label: litWord, color: sortKey === 'direct_award' ? RISK_COLORS.high : ACCENT }]
  const legend = [
    { label: L('el resto', 'the rest'), color: '--color-border' },
    ...(sortKey !== 'spend' ? [{ label: L(`hueco = menos de ${THIN_BELOW} contratos`, `hollow = fewer than ${THIN_BELOW} contracts`), mark: 'hollow' as const }] : []),
  ]

  const totals = data?.totals
  const coverage = totals && pairs.length
    ? L(
        `${formatNumber(pairs.length)} puntos: cada par institución × categoría con ${data?.min_contracts ?? 100} contratos o más (y el mayor de cada categoría) — ${pct0(pairs.reduce((s, p) => s + p.value, 0) / totals.value_mxn)} del gasto y ${pct0(pairs.reduce((s, p) => s + p.contracts, 0) / totals.contracts)} de los contratos clasificados.`,
        `${formatNumber(pairs.length)} dots: every institution × category pair with ${data?.min_contracts ?? 100}+ contracts (and each category’s largest) — ${pct0(pairs.reduce((s, p) => s + p.value, 0) / totals.value_mxn)} of classified spend and ${pct0(pairs.reduce((s, p) => s + p.contracts, 0) / totals.contracts)} of contracts.`,
      )
    : ''

  if (isLoading) return <Skeleton className="h-[560px] w-full" />
  if (isError || !pairs.length) {
    return (
      <p className="font-serif text-sm text-text-muted">
        {L('No se pudo cargar el anaquel. El registro de abajo sigue completo.', 'The shelves could not load. The register below is complete.')}
      </p>
    )
  }

  const pinnedPair = pinned != null ? pairs[pinned] : null

  return (
    <>
      <Field
        rows={rows}
        bands={bands}
        axes={axes}
        sortKey={sortKey}
        onSortKey={onSortKey ? (k) => onSortKey(k as FieldSort) : undefined}
        litLegend={litLegend}
        legend={legend}
        finding={sentence}
        enter={enter}
        hover={(row) => <PairLines p={pairs[Number(row.id)]} catName={catName} lang={lang} />}
        onPick={(row) => setPinned(row ? Number(row.id) : null)}
        picked={pinned != null ? String(pinned) : null}
        maxRows={Infinity}
        lang={lang}
        railLabel={railLabel}
        railName={railName}
        focusBand={focusCategory != null ? String(focusCategory) : null}
        table={{ caption: L('Filas visibles del campo', 'Visible rows of the field'), band: L('Categoría', 'Category'), n: L('Puntos', 'Dots'), lit: litWord, agg: aggHead[sortKey] }}
        footer={
          // owner phone review 2026-10-29 («a long mono wall»): the field's reading notes fold to one line
          <FootNotes
            lang={lang}
            className="kf-notes"
            title={{ es: 'Cómo se lee el anaquel', en: 'How to read the shelves' }}
            items={[
              coverage,
              L('Los totales de la derecha son del campo; los completos, en «La hoja de conteo».', 'The totals at right are for the field; full totals are in “The count sheet”.'),
              activeSector
                ? L(`Las ${bands.length} categorías del sector, cada una en su fila; la línea de abajo devuelve el inventario completo.`, `All ${bands.length} of the sector's categories, one row each; the bottom line returns to the full inventory.`)
                : showAll
                  ? L(`Las ${bandRows.length} categorías, cada una en su fila, en el orden elegido.`, `All ${bandRows.length} categories, one row each, in the chosen order.`)
                  : L('Filas: las 12 categorías que encabezan el orden elegido (en riesgo y adjudicación directa, sólo las de 8 o más puntos); las demás comparten la línea de abajo. Un sector muestra todas sus categorías.', 'Rows: the 12 categories that top the chosen order (for risk and direct award, only those with 8+ dots); the rest share the bottom line. A sector shows all its categories.'),
              bandRows.some((r) => r.thin) && L(
                `n=… al final: categorías con menos de ${MIN_RATE_DOTS} puntos, cuyo promedio no se ordena con el resto.`,
                `n=… at the end: categories with fewer than ${MIN_RATE_DOTS} dots, whose mean is not ranked with the rest.`,
              ),
            ]}
          />
        }
      />

      {pinnedPair && (
        <FieldCard title={L('Ficha rápida', 'Quick card')} onClose={() => setPinned(null)} lang={lang} focusKey={pinned}>
          <div className="mt-1 space-y-1">
            <EntityIdentityChip type="institution" id={pinnedPair.institution_id} name={pinnedPair.institution_name} variant="name" fullName className="text-[17px] text-text-primary hover:underline underline-offset-2" />
            <p className="text-[13px] font-serif text-text-muted">
              {L('compra en', 'buying in')}{' '}
              <EntityIdentityChip type="category" id={pinnedPair.category_id} name={catName(pinnedPair.category_id)} variant="name" className="text-text-secondary hover:underline underline-offset-2" />
            </p>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-[13px] font-mono tabular-nums">
            <dt className="text-text-muted">{L('Gasto', 'Spend')}</dt><dd className="text-right text-text-primary">{formatCompactMXN(pinnedPair.value)}</dd>
            <dt className="text-text-muted">{L('Contratos', 'Contracts')}</dt><dd className="text-right text-text-primary">{formatNumber(pinnedPair.contracts)}</dd>
            <dt className="text-text-muted">{L('Indicador de riesgo', 'Risk indicator')}</dt><dd className="text-right text-text-primary">{pinnedPair.risk != null ? Math.round(pinnedPair.risk * 100) : '—'}</dd>
            <dt className="text-text-muted">{L('Contratos en riesgo alto', 'High-risk contracts')}</dt><dd className="text-right text-text-primary">{formatNumber(pinnedPair.high_risk)}</dd>
            <dt className="text-text-muted">{L('Adj. directa', 'Direct award')}</dt><dd className="text-right text-text-primary">{pinnedPair.da != null ? `${pinnedPair.da.toFixed(0)}%` : '—'}</dd>
          </dl>
          {pinnedPair.contracts < THIN_BELOW && (
            <p className="ct-note mt-2">{L(`Menos de ${THIN_BELOW} contratos: muestra delgada.`, `Fewer than ${THIN_BELOW} contracts: thin sample.`)}</p>
          )}
        </FieldCard>
      )}
    </>
  )
}

function PairLines({ p, catName, lang }: { p: Pair; catName: (id: number) => string; lang: 'en' | 'es' }) {
  const en = lang === 'en'
  return (
    <>
      <span className="block text-text-primary">{formatEntityName('institution', p.institution_name, 'full')}</span>
      <span className="block text-text-secondary">{catName(p.category_id)}</span>
      <span className="font-mono tabular-nums text-text-muted">
        {formatCompactMXN(p.value)} · {formatNumber(p.contracts)} {en ? 'contracts' : 'contratos'} · {en ? 'risk indicator' : 'indicador de riesgo'} {p.risk != null ? Math.round(p.risk * 100) : '—'} · {en ? 'DA' : 'AD'} {p.da != null ? `${p.da.toFixed(0)}%` : '—'}
      </span>
    </>
  )
}

export default CategoryAnaquel
