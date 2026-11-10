/**
 * FocosField — Focos Rojos as a kit `<Field>` (KIT_AUDIT.md reuse map):
 * one dot = one vendor in the investigation line, tiers 1–3 (tier 4 is
 * counted on the rail, never drawn). x = IPS (0–1, rules .25/.40/.60, wash
 * right of .40) · value (log) · contracts (log). Bands = primary pattern
 * P1–P7, «sin patrón» on the rail. Size = value; fill = tier (T1 ink, T2 C2
 * blue, T3 gray — DESIGN.md §6); ring = the active lit set (documented case
 * or EFOS); hollow = fewer than 20 contracts.
 *
 * Data: `/aria/queue` caps per_page at 100, so tiers 1–3 arrive as ~100 pages
 * fetched 8 at a time. ponytail: a columnar `/aria/field` endpoint replaces
 * this when the field ships on /aria.
 */
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ariaApi } from '@/api/client'
import type { AriaQueueItem } from '@/api/types'
import { Field, FieldCard, type FieldAxis, type FieldBand, type FieldRow } from '@/components/kit/Field'
import { PATTERN_LABELS as PATTERN_NAMES } from '@/lib/aria/patterns'
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import { Skeleton } from '@/components/ui/skeleton'
import { formatEntityName } from '@/lib/entity/format'
import { PATTERN_COLORS, RISK_THRESHOLDS } from '@/lib/constants'
import { formatCompactMXN, formatNumber } from '@/lib/utils'

export type FocosSort = 'ips' | 'value' | 'contracts'
export type FocosLit = 'case' | 'efos'
export const FOCOS_SORTS: FocosSort[] = ['ips', 'value', 'contracts']

const THIN = 20
const PATTERNS = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7']
const TIER_FILL: Record<number, string | null> = { 1: '--color-text-primary', 2: '--color-cat-blue', 3: null }
const MONEY_ES = ['1 MDP', '10 MDP', '100 MDP', '1,000 MDP', '10,000 MDP', '100,000 MDP', '1 billón']
const MONEY_EN = ['1M', '10M', '100M', '1B', '10B', '100B', '1T']

type Vendor = AriaQueueItem & { first_contract_year?: number | null }

/** One page, retried on the edge's rate limit (429/5xx) with a linear backoff. */
async function getPage(tier: number, page: number): ReturnType<typeof ariaApi.getQueue> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await ariaApi.getQueue({ tier, per_page: 100, page })
    } catch (e) {
      const status = (e as { response?: { status?: number } }).response?.status
      if (attempt >= 8 || !(status === 429 || (status ?? 0) >= 500)) throw e
      await new Promise((r) => setTimeout(r, 1000 * attempt))
    }
  }
}

async function fetchTiers(): Promise<{ vendors: Vendor[]; tier4: number }> {
  const firsts = await Promise.all([1, 2, 3].map((tier) => getPage(tier, 1)))
  const jobs: Array<[number, number]> = []
  firsts.forEach((r, i) => {
    for (let page = 2; page <= (r.pagination?.total_pages ?? 1); page++) jobs.push([i + 1, page])
  })
  const out: Vendor[] = firsts.flatMap((r) => r.data as Vendor[])
  // ponytail: 2 pages in flight (the edge rate-limits bursts); a columnar /aria/field makes this one request.
  let next = 0
  await Promise.all(Array.from({ length: 2 }, async () => {
    while (next < jobs.length) {
      const [tier, page] = jobs[next++]
      out.push(...((await getPage(tier, page)).data as Vendor[]))
    }
  }))
  const seen = new Set<number>()
  const vendors = out.filter((v) => (seen.has(v.vendor_id) ? false : (seen.add(v.vendor_id), true))).sort((a, b) => a.vendor_id - b.vendor_id)
  const run = firsts[0].run_summary as unknown as { tier4_count?: number } | null
  return { vendors, tier4: run?.tier4_count ?? 0 }
}

interface Props {
  lang: 'en' | 'es'
  sortKey: FocosSort
  onSortKey: (k: FocosSort) => void
  litKey: FocosLit | null
  onLitKey: (k: FocosLit | null) => void
  picked: string | null
  onPick: (id: string | null) => void
}

export function FocosField({ lang, sortKey, onSortKey, litKey, onLitKey, picked, onPick }: Props) {
  const en = lang === 'en'
  const L = (es: string, e: string) => (en ? e : es)
  const { data, isLoading, isError } = useQuery({ queryKey: ['aria', 'field', 't1-3'], queryFn: fetchTiers, staleTime: 600_000, retry: false })
  const vendors = useMemo(() => data?.vendors ?? [], [data])
  const byId = useMemo(() => new Map(vendors.map((v) => [String(v.vendor_id), v])), [vendors])
  const pName = (p: string) => (PATTERN_NAMES[p] ? (en ? PATTERN_NAMES[p].en : PATTERN_NAMES[p].es) : p)

  const isLit = (v: Vendor) => (litKey === 'case' ? v.in_ground_truth : litKey === 'efos' ? v.is_efos_definitivo : false)
  const rows: FieldRow[] = useMemo(
    () => vendors.map((v) => ({
      id: String(v.vendor_id),
      label: v.vendor_name ?? (en ? 'Name not published' : 'Nombre no publicado'),
      bandId: v.primary_pattern ?? '',
      x: { ips: v.ips_final, value: v.total_value_mxn, contracts: v.total_contracts },
      fill: TIER_FILL[v.ips_tier] ?? null,
      hollow: v.total_contracts < THIN,
      lit: isLit(v) ? litKey : null,
      // Size = money, gently: 0.7× at 10 MDP to 1.8× at 1 billón.
      size: Math.min(1.8, Math.max(0.7, 0.7 + 0.22 * (Math.log10(Math.max(1, v.total_value_mxn)) - 7))),
    })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [vendors, litKey],
  )

  // Band aggregates per sort.
  const byPattern = useMemo(() => {
    const m = new Map<string, Vendor[]>()
    for (const v of vendors) {
      const k = v.primary_pattern ?? ''
      const list = m.get(k)
      if (list) list.push(v)
      else m.set(k, [v])
    }
    return m
  }, [vendors])
  const agg = (vs: Vendor[]) => sortKey === 'ips'
    ? vs.reduce((s, v) => s + v.ips_final, 0) / Math.max(1, vs.length)
    : sortKey === 'value' ? vs.reduce((s, v) => s + v.total_value_mxn, 0) : vs.reduce((s, v) => s + v.total_contracts, 0)
  const fmtAgg = (x: number) => (sortKey === 'ips' ? x.toFixed(2) : sortKey === 'value' ? formatCompactMXN(x) : formatNumber(x))

  const bands: FieldBand[] = PATTERNS.filter((p) => byPattern.has(p)).map((p) => {
    const a = agg(byPattern.get(p) ?? [])
    return {
      id: p,
      name: `${p} · ${pName(p)}`,
      sortValue: a,
      aggregate: fmtAgg(a),
      label: (mobile: boolean) => (
        <span className="flex items-baseline gap-1.5">
          <span aria-hidden="true" className="ct-sq flex-shrink-0" style={{ ['--c' as string]: PATTERN_COLORS[p] }} />
          <EntityIdentityChip
            type="pattern"
            id={p}
            name={`${p} · ${pName(p)}`}
            variant="name"
            fullName
            className="text-text-primary hover:underline underline-offset-2"
            style={{ fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: mobile ? 13 : 15 }}
          />
        </span>
      ),
    }
  })

  const ipsTicks = [0, RISK_THRESHOLDS.medium, RISK_THRESHOLDS.high, RISK_THRESHOLDS.critical, 1]
  const axes: FieldAxis[] = [
    {
      key: 'ips', label: { es: 'IPS', en: 'IPS' }, scale: 'linear', domain: [0, 1],
      ticks: ipsTicks.map((t) => ({ at: t, label: t === 0 || t === 1 ? String(t) : t.toFixed(2), tone: t >= RISK_THRESHOLDS.high && t < 1 ? 'crit' as const : undefined })),
      rules: [
        { at: RISK_THRESHOLDS.medium, alpha: 0.8 },
        { at: RISK_THRESHOLDS.high, tone: 'crit', alpha: 0.6, wash: 'risk' },
        { at: RISK_THRESHOLDS.critical, tone: 'crit', alpha: 0.9 },
      ],
      note: L('eje: IPS, la puntuación de prioridad de investigación (0–1)', 'axis: IPS, the investigation priority score (0–1)'),
      readoutHead: L('IPS medio', 'Mean IPS'),
    },
    {
      key: 'value', label: { es: 'Valor', en: 'Value' }, scale: 'log10', domain: [1e6, 1e12],
      ticks: [6, 7, 8, 9, 10, 11, 12].map((t) => ({ at: 10 ** t, label: (en ? MONEY_EN : MONEY_ES)[t - 6], phone: t % 2 === 0 })),
      rules: [6, 7, 8, 9, 10, 11, 12].map((t) => ({ at: 10 ** t })),
      note: L('eje: valor contratado del proveedor (escala log; bajo 1 MDP, en el borde)', 'axis: the vendor’s contracted value (log scale; under 1M sits on the edge)'),
      readoutHead: L('Valor en el campo', 'Value in the field'),
    },
    {
      key: 'contracts', label: { es: 'Contratos', en: 'Contracts' }, scale: 'log10', domain: [1, 1e5],
      ticks: [0, 1, 2, 3, 4, 5].map((t) => ({ at: 10 ** t, label: formatNumber(10 ** t) })),
      rules: [0, 1, 2, 3, 4, 5].map((t) => ({ at: 10 ** t })),
      note: L('eje: contratos del proveedor (escala log)', 'axis: the vendor’s contracts (log scale)'),
      readoutHead: L('Contratos en el campo', 'Contracts in the field'),
    },
  ]

  // ── The finding, computed live ───────────────────────────────────────────
  const finding = useMemo(() => {
    if (!vendors.length) return ''
    const litWord = litKey === 'case' ? L('con caso documentado', 'with a documented case') : litKey === 'efos' ? L('en la lista EFOS definitiva', 'on the final EFOS list') : null
    const litN = litKey ? vendors.filter(isLit).length : 0
    const ring = litWord ? L(` ${formatNumber(litN)} de los ${formatNumber(vendors.length)} llevan anillo: ${litWord}.`, ` ${formatNumber(litN)} of the ${formatNumber(vendors.length)} carry a ring: ${litWord}.`) : ''
    if (sortKey === 'ips') {
      const t1 = vendors.filter((v) => v.ips_tier === 1)
      const counts = new Map<string, number>()
      for (const v of t1) if (v.primary_pattern) counts.set(v.primary_pattern, (counts.get(v.primary_pattern) ?? 0) + 1)
      const [topP, topN] = [...counts].sort((a, b) => b[1] - a[1])[0] ?? ['', 0]
      const docs = t1.filter((v) => v.in_ground_truth).length
      return L(
        `${formatNumber(t1.length)} proveedores en nivel 1; ${formatNumber(topN)} llevan el patrón ${topP} (${pName(topP)}) y ${formatNumber(docs)} ya figuran en un caso documentado.${ring}`,
        `${formatNumber(t1.length)} vendors in tier 1; ${formatNumber(topN)} carry pattern ${topP} (${pName(topP)}) and ${formatNumber(docs)} already sit in a documented case.${ring}`,
      )
    }
    const f = (v: Vendor) => (sortKey === 'value' ? v.total_value_mxn : v.total_contracts)
    const sorted = [...vendors].sort((a, b) => f(b) - f(a))
    const total = sorted.reduce((s, v) => s + f(v), 0)
    let cum = 0
    let k = 0
    while (k < sorted.length && cum < total / 2) cum += f(sorted[k++])
    if (sortKey === 'value') {
      const top = sorted[0]
      const name = formatEntityName('vendor', top.vendor_name, 'sm')
      return L(
        `${formatNumber(k)} de ${formatNumber(vendors.length)} proveedores concentran la mitad de los ${formatCompactMXN(total)} del campo; el mayor, ${name}, suma ${formatCompactMXN(top.total_value_mxn)}.${ring}`,
        `${formatNumber(k)} of ${formatNumber(vendors.length)} vendors hold half of the field's ${formatCompactMXN(total)}; the largest, ${name}, adds up to ${formatCompactMXN(top.total_value_mxn)}.${ring}`,
      )
    }
    const thin = vendors.filter((v) => v.total_contracts < THIN).length
    return L(
      `La mitad de los ${formatNumber(total)} contratos del campo está en ${formatNumber(k)} proveedores; ${formatNumber(thin)} puntos huecos tienen menos de ${THIN} contratos.${ring}`,
      `Half of the field's ${formatNumber(total)} contracts sit with ${formatNumber(k)} vendors; ${formatNumber(thin)} hollow dots have fewer than ${THIN} contracts.${ring}`,
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendors, sortKey, litKey, en])

  if (isLoading) return <Skeleton className="h-[560px] w-full" />
  if (isError || !vendors.length) {
    return <p className="font-serif text-sm text-text-muted">{L('No se pudo cargar la fila de investigación.', 'The investigation line could not load.')}</p>
  }

  const noPattern = byPattern.get('')?.length ?? 0
  const pv = picked != null ? byId.get(picked) ?? null : null
  const years = (v: Vendor) => (v.first_contract_year && v.last_contract_year ? `${v.first_contract_year}–${v.last_contract_year}` : v.years_active ? L(`${v.years_active} años`, `${v.years_active} yrs`) : '—')
  const tierWord = (t: number) => L(`nivel ${t}`, `tier ${t}`)

  return (
    <>
      <Field
        rows={rows}
        bands={bands}
        axes={axes}
        sortKey={sortKey}
        onSortKey={(k) => onSortKey(k as FocosSort)}
        litLegend={[
          { key: 'case', label: L('caso documentado', 'documented case'), color: '--color-accent', mark: 'ring' },
          { key: 'efos', label: L('EFOS definitivo', 'final EFOS'), color: '--color-accent', mark: 'ring' },
        ]}
        litKey={litKey}
        onLitKey={(k) => onLitKey(k as FocosLit | null)}
        legend={[
          { label: tierWord(1), color: '--color-text-primary' },
          { label: tierWord(2), color: '--color-cat-blue' },
          { label: tierWord(3) },
          { label: L(`hueco = menos de ${THIN} contratos`, `hollow = fewer than ${THIN} contracts`), mark: 'hollow' },
        ]}
        finding={finding}
        hover={(row) => {
          const v = byId.get(row.id)
          if (!v) return null
          return (
            <>
              <span className="block text-text-primary">{formatEntityName('vendor', v.vendor_name, 'full')}</span>
              <span className="font-mono tabular-nums text-text-muted">
                IPS {v.ips_final.toFixed(2)} · {tierWord(v.ips_tier)} · {v.primary_pattern ?? L('sin patrón', 'no pattern')} · {formatCompactMXN(v.total_value_mxn)} · {years(v)}
              </span>
            </>
          )
        }}
        onPick={(row) => onPick(row ? row.id : null)}
        picked={picked}
        lang={lang}
        unit={{ es: 'proveedores', en: 'vendors' }}
        maxColK={9}
        railLabel={<span className="text-[12px] leading-tight text-text-muted">+ {L('sin patrón', 'no pattern')} · {formatNumber(noPattern)} {L('proveedores', 'vendors')}</span>}
        railName={L('Sin patrón', 'No pattern')}
        railAggregate={L(`nivel 4: ${formatNumber(data?.tier4 ?? 0)} sin dibujar`, `tier 4: ${formatNumber(data?.tier4 ?? 0)} not drawn`)}
        table={{ caption: L('Patrones del campo', 'Patterns in the field'), band: L('Patrón', 'Pattern'), n: L('Proveedores', 'Vendors'), lit: L('Con anillo', 'Ringed'), agg: axes.find((a) => a.key === sortKey)?.readoutHead as string }}
        footer={
          <p className="ct-note mt-3 max-sm:order-1">
            {L(
              `${formatNumber(vendors.length)} puntos: cada proveedor de los niveles 1 a 3 de la fila de investigación. Los ${formatNumber(data?.tier4 ?? 0)} del nivel 4 no se dibujan; su cuenta va en la línea de abajo.`,
              `${formatNumber(vendors.length)} dots: every vendor in tiers 1 to 3 of the investigation line. The ${formatNumber(data?.tier4 ?? 0)} tier-4 vendors are not drawn; their count sits on the bottom line.`,
            )}
          </p>
        }
      />

      {pv && (
        <FieldCard title={L('Ficha rápida', 'Quick card')} onClose={() => onPick(null)} lang={lang} focusKey={picked}>
          <div className="mt-1 space-y-1">
            <EntityIdentityChip type="vendor" id={pv.vendor_id} name={pv.vendor_name} variant="name" fullName className="text-[17px] text-text-primary hover:underline underline-offset-2" />
            {pv.primary_pattern && (
              <p className="text-[13px] text-text-muted">{pv.primary_pattern} · {pName(pv.primary_pattern)}</p>
            )}
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-[13px] font-mono tabular-nums">
            <dt className="text-text-muted">IPS</dt><dd className="text-right text-text-primary">{pv.ips_final.toFixed(2)}</dd>
            <dt className="text-text-muted">{L('Nivel', 'Tier')}</dt><dd className="text-right text-text-primary">{pv.ips_tier}</dd>
            <dt className="text-text-muted">{L('Valor', 'Value')}</dt><dd className="text-right text-text-primary">{formatCompactMXN(pv.total_value_mxn)}</dd>
            <dt className="text-text-muted">{L('Contratos', 'Contracts')}</dt><dd className="text-right text-text-primary">{formatNumber(pv.total_contracts)}</dd>
            <dt className="text-text-muted">{L('Años', 'Years')}</dt><dd className="text-right text-text-primary">{years(pv)}</dd>
            <dt className="text-text-muted">{L('Caso documentado', 'Documented case')}</dt><dd className="text-right text-text-primary">{pv.in_ground_truth ? L('sí', 'yes') : L('no', 'no')}</dd>
            <dt className="text-text-muted">EFOS</dt><dd className="text-right text-text-primary">{pv.is_efos_definitivo ? L('definitivo', 'final') : '—'}</dd>
          </dl>
          {pv.total_contracts < THIN && <p className="ct-note mt-2">{L(`Menos de ${THIN} contratos: muestra delgada.`, `Fewer than ${THIN} contracts: thin sample.`)}</p>}
          <Link to={`/vendors/${pv.vendor_id}`} className="mt-3 inline-block text-[14px] text-text-primary underline underline-offset-2">
            {L('Abrir el expediente →', 'Open the dossier →')}
          </Link>
        </FieldCard>
      )}
    </>
  )
}

export default FocosField
