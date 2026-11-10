/**
 * Two Worlds — methodology exhibit.
 *
 * Formerly the standalone /intersection page. It was retired (2026-06-08)
 * because as a *tool* it offered nothing ARIA doesn't: one zone duplicated the
 * queue, one listed vendors already on the official list, one listed the
 * model's own misses. But the underlying finding is a strong *credibility
 * argument* — RUBLI's model and the government's official record (SAT EFOS +
 * SFP) barely overlap, so the platform is not redundant with what the state
 * already publishes. That argument belongs here, made once, as an exhibit.
 *
 * Static by design (no drill-down): the leads live in ARIA. The only hypertext
 * is the named-nodes register at the foot.
 *
 * PARALLAX D2b § Change 3: the Venn was replaced by a proportional ledger. The
 * Venn drew the model at ~5× the state's area when the data is 29×, floated its
 * labels on leader lines, and showed nothing of the 46 / 607 / 178 beyond a
 * number. This draws both lists to one linear scale in the Balanza's engraving
 * vocabulary, and magnifies the state's 224 ten times so its split is legible.
 * Spec: docs/parallax/DAY-02b-methodology-plates.md § Change 3.
 */

import { useId, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { intersectionApi, type IntersectionVendor } from '@/api/client'
import { Plate } from './Plate'
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import { cn, formatNumber } from '@/lib/utils'
import './two-worlds.css'
import { tidyNodes, PROSE } from '@/lib/typography'
import { CATEGORICAL, textInk } from '@/lib/constants'
import { useQuery } from '@tanstack/react-query'

const C_MODEL = CATEGORICAL[0] // ink — RUBLI model (red is reserved for crítico)
const INK_RECORD = 'var(--color-text-secondary)' // slate — the official record
const C_OVERLAP = CATEGORICAL[1] // C2 blue — agreement (DESIGN §6.3: amber is reserved for severity)
// type on the plate paper: the high twin must be the on-plate ink (RISK_TEXT_COLORS.high reads 4.45 here)
const ink = (c: string): string => textInk(c, true)

// ── HatchBand — one ruled band of proportional hatch segments ───────────────
// Same 45° engraving vocabulary as BalanzaLedger's HatchBar: `dense` is the
// identical pattern at a heavier weight, `solid` is flat ink. No <circle>.
export type BandFill = 'hatch' | 'dense' | 'solid'
export interface BandSegment {
  /** width as a percentage of the band */
  pct: number
  fill: BandFill
  color: string
}

/**
 * Exported for SD-06's match ledger, which draws the same argument — two
 * lists, one sliver of agreement — at story scale. The vocabulary has to be
 * identical to the plate on /methodology or the reader meets two engravings
 * of the same idea; a fork would guarantee they drift.
 */
export function HatchBand({ segments, height = 16 }: { segments: BandSegment[]; height?: number }) {
  const uid = useId().replace(/:/g, '')
  const placed = segments.map((s, i) => ({
    ...s,
    x: segments.slice(0, i).reduce((sum, p) => sum + p.pct, 0),
    id: `${uid}-${i}`,
  }))
  return (
    <svg
      viewBox="0 0 100 10"
      preserveAspectRatio="none"
      style={{ width: '100%', height, display: 'block' }}
      aria-hidden="true"
    >
      <defs>
        {placed
          .filter((s) => s.fill !== 'solid')
          .map((s) => (
            <pattern
              key={s.id}
              id={s.id}
              width={3}
              height={3}
              patternTransform="rotate(45)"
              patternUnits="userSpaceOnUse"
            >
              <rect width={3} height={3} fill={s.color} fillOpacity={s.fill === 'dense' ? 0.34 : 0.16} />
              <line x1={0} y1={0} x2={0} y2={3} stroke={s.color} strokeWidth={s.fill === 'dense' ? 1.8 : 1.4} />
            </pattern>
          ))}
      </defs>
      {placed.map((s) => (
        <g key={s.id}>
          <rect
            x={s.x}
            y={1}
            width={s.pct}
            height={8}
            fill={s.fill === 'solid' ? s.color : `url(#${s.id})`}
            fillOpacity={s.fill === 'solid' ? 0.85 : undefined}
          />
          <rect
            x={s.x}
            y={1}
            width={s.pct}
            height={8}
            fill="none"
            stroke={s.color}
            strokeOpacity={0.55}
            strokeWidth={0.5}
            vectorEffect="non-scaling-stroke"
          />
          {/* terminal tick at the segment boundary */}
          <line
            x1={Math.min(s.x + s.pct, 99.9)}
            y1={0}
            x2={Math.min(s.x + s.pct, 99.9)}
            y2={10}
            stroke={s.color}
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        </g>
      ))}
    </svg>
  )
}

/** 28×12 legend swatch — the same band, one segment wide. */
function Swatch({ fill, color }: { fill: BandFill; color: string }) {
  return (
    <span style={{ display: 'inline-block', width: 28, flexShrink: 0 }}>
      <HatchBand segments={[{ pct: 100, fill, color }]} height={12} />
    </span>
  )
}

export function TwoWorldsExhibit({ className }: { className?: string }) {
  const { i18n } = useTranslation()
  const lang = i18n.language.startsWith('es') ? 'es' : 'en'
  const { data } = useQuery({
    queryKey: ['intersection', 'exhibit'],
    // top_n = 3 — the register lists the top 3 of each zone.
    queryFn: () => intersectionApi.getSummary(3),
    staleTime: 10 * 60 * 1000,
  })
  const w = data?.worlds
  if (!w || !data) return null

  // ── Proportions, all derived from the payload — never hard-coded ──────────
  const modelFlags = w.model_flags
  const officialRecord = w.official_record
  const overlap = w.overlap
  const ghost = w.ghost_signature
  const blindSpots = w.blind_spots
  const modelOnlyOther = w.model_only - w.ghost_signature

  const pct = (v: number) => (modelFlags > 0 ? (v / modelFlags) * 100 : 0)
  // model_flags and official_record are independent counts — clamp so an inverted dataset can't overrun.
  const stubPct = Math.min(100, pct(officialRecord))
  const lensPct = Math.min(100, stubPct * 10)
  const lensOverlapPct = officialRecord > 0 ? (overlap / officialRecord) * 100 : 0

  const efos = data.registry_breakdown.efos_definitivo
  const sfp = data.registry_breakdown.sfp_sanctioned
  const onBothLists = Math.max(0, efos + sfp - officialRecord)
  const n = formatNumber

  const plateCaption = lang === 'es'
    ? `Lámina III·c — las dos listas a una sola escala, alineadas por la franja que comparten. Debajo, los ${n(officialRecord)} del Estado ampliados diez veces. Registro oficial: ${n(efos)} SAT EFOS 69-B y ${n(sfp)} sanciones SFP${onBothLists > 0 ? `, ${n(onBothLists)} en ambas` : ''}.`
    : `Plate III·c — the two lists at one scale, aligned on the strip they share. Below, the state's ${n(officialRecord)} magnified ten times. Official record: ${n(efos)} SAT EFOS 69-B and ${n(sfp)} SFP sanctions${onBothLists > 0 ? `, ${n(onBothLists)} on both` : ''}.`

  // role="img" removes the chart's HTML text from the accessibility tree, so the label carries every number.
  const ledgerAria = lang === 'es'
    ? `El modelo marca ${n(modelFlags)} proveedores: ${n(overlap)} también en el registro oficial, ${n(ghost)} con huella fantasma y ${n(modelOnlyOther)} solo del modelo. El registro oficial lista ${n(officialRecord)}: esos ${n(overlap)} y ${n(blindSpots)} que el modelo no marca.`
    : `The model flags ${n(modelFlags)} vendors: ${n(overlap)} also on the official record, ${n(ghost)} with a ghost signature and ${n(modelOnlyOther)} model only. The official record lists ${n(officialRecord)}: those ${n(overlap)} and ${n(blindSpots)} the model does not flag.`

  // one order everywhere: the shared strip first, so it lines up across both rows
  const groups: Array<{ label: string; count: number; color: string; fill: BandFill }> = [
    { label: lang === 'es' ? 'Ambos coinciden' : 'Both agree', count: overlap, color: C_OVERLAP, fill: 'solid' },
    { label: lang === 'es' ? 'Huella fantasma' : 'Ghost signature', count: ghost, color: C_MODEL, fill: 'dense' },
    { label: lang === 'es' ? 'Solo el modelo' : 'Model only', count: modelOnlyOther, color: C_MODEL, fill: 'hatch' },
    { label: lang === 'es' ? 'Solo el Estado' : 'State only', count: blindSpots, color: INK_RECORD, fill: 'hatch' },
  ]
  const modelBand: BandSegment[] = [
    { pct: pct(overlap), fill: 'solid', color: C_OVERLAP },
    { pct: pct(ghost), fill: 'dense', color: C_MODEL },
    { pct: pct(modelOnlyOther), fill: 'hatch', color: C_MODEL },
  ]
  const stateBand: BandSegment[] = [
    { pct: lensOverlapPct, fill: 'solid', color: C_OVERLAP },
    { pct: 100 - lensOverlapPct, fill: 'hatch', color: INK_RECORD },
  ]

  const top3 = (vendors: IntersectionVendor[] | undefined) =>
    [...(vendors ?? [])].sort((a, b) => b.avg_risk_score - a.avg_risk_score).slice(0, 3)
  const tableGroups = [
    { group: groups[0].label, vendors: top3(data.zones.confirmed?.vendors) },
    { group: groups[1].label, vendors: top3(data.zones.ghost?.vendors) },
    { group: groups[3].label, vendors: top3(data.zones.blindspot?.vendors) },
  ].filter((g) => g.vendors.length > 0)

  return (
    <section id="two-worlds" className={cn('scroll-mt-20', className)}>
      <Plate caption={plateCaption}>
        <div className="mt-cal-head">
          <h3 className="mt-cal-title">
            {lang === 'es' ? 'Dos formas de ver la corrupción. Casi nunca coinciden.' : 'Two ways of seeing corruption. They almost never agree.'}
          </h3>
          <p className="mt-cal-lede">
            {lang === 'es'
              ? <>El modelo de RUBLI y la lista oficial del Estado (SAT EFOS y SFP) casi no se tocan: comparten <strong className="tabular-nums" style={{ color: ink(C_OVERLAP) }}>{n(overlap)}</strong> proveedores. Si el modelo solo repitiera la lista oficial, sobraría.</>
              : <>RUBLI's model and the state's official list (SAT EFOS and SFP) barely touch: they share <strong className="tabular-nums" style={{ color: ink(C_OVERLAP) }}>{n(overlap)}</strong> suppliers. If the model just echoed the official list, it would be redundant.</>}
          </p>
        </div>

        {/* ── one comparison: both lists at one scale, the state's magnified on an attached inset ── */}
        <div className="tw-chart" role="img" aria-label={ledgerAria}>
          <p className="tw-row-label">
            {lang === 'es' ? 'Modelo RUBLI · indicador ≥ 0.40' : 'RUBLI model · indicator ≥ 0.40'}
            <b style={{ color: ink(C_MODEL) }}>{n(modelFlags)}</b>
          </p>
          <HatchBand segments={modelBand} />

          <p className="tw-row-label tw-row-b">
            {lang === 'es' ? 'Registro oficial · SAT EFOS y SFP' : 'Official record · SAT EFOS and SFP'}
            <b style={{ color: INK_RECORD }}>{n(officialRecord)}</b>
          </p>
          <div style={{ width: `${Math.max(stubPct, 0.6)}%` }}>
            <HatchBand segments={stateBand} />
          </div>
          {/* the inset hangs from the sliver: leaders from its two ends to the inset's two top corners */}
          <svg className="tw-leader hidden sm:block" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true">
            <line x1={0} y1={0} x2={0} y2={10} stroke="var(--color-text-muted)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            <line x1={stubPct} y1={0} x2={lensPct} y2={10} stroke="var(--color-text-muted)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          </svg>
          <svg className="tw-leader block sm:hidden" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true">
            <line x1={0} y1={0} x2={0} y2={10} stroke="var(--color-text-muted)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            <line x1={stubPct} y1={0} x2={100} y2={10} stroke="var(--color-text-muted)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          </svg>
          <div className="tw-inset" style={{ '--lens-w': `${lensPct}%` } as CSSProperties}>
            <p className="tw-inset-title">{lang === 'es' ? `×10 · los ${n(officialRecord)} del Estado` : `×10 · the state's ${n(officialRecord)}`}</p>
            <HatchBand segments={stateBand} />
            <p className="tw-inset-keys">
              <span style={{ color: ink(C_OVERLAP) }}>{n(overlap)} {lang === 'es' ? 'coinciden' : 'agree'}</span>
              <span>{n(blindSpots)} {lang === 'es' ? 'solo el Estado' : 'state only'}</span>
            </p>
          </div>
        </div>

        {/* ── the four counts, one aligned row ── */}
        <dl className="tw-counts">
          {groups.map((g) => (
            <div key={g.label}>
              <dt><Swatch fill={g.fill} color={g.color} />{g.label}</dt>
              <dd style={{ color: ink(g.color) }}>{n(g.count)}</dd>
            </div>
          ))}
        </dl>

        {/* ── examples: one compact table ── */}
        {tableGroups.length > 0 && (
          <div className="ct-table-wrap tw-table">
            <table className="ct-table">
              <caption className="sr-only">{lang === 'es' ? 'Ejemplos de cada grupo: los 3 de mayor indicador' : 'Examples from each group: the top 3 by indicator'}</caption>
              <thead>
                <tr>
                  <th scope="col">{lang === 'es' ? 'Proveedor' : 'Supplier'}</th>
                  <th scope="col" className="num">{lang === 'es' ? 'Contratos' : 'Contracts'}</th>
                </tr>
              </thead>
              {tableGroups.map((g) => (
                <tbody key={g.group}>
                  <tr className="tw-group"><th scope="rowgroup" colSpan={2}>{g.group}</th></tr>
                  {g.vendors.map((v) => (
                    <tr key={v.vendor_id}>
                      <td><EntityIdentityChip type="vendor" id={v.vendor_id} name={v.vendor_name} size="sm" hideIcon fullName inline /></td>
                      <td className="num">{n(v.total_contracts)}</td>
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </div>
        )}

        <p className="tw-close">
          {tidyNodes(lang === 'es'
            ? <>El «registro oficial» son solo SAT EFOS (Art. 69-B) y SFP; <strong className="text-text-primary">no</strong> incluye los casos de RUBLI, que sería circular (el modelo se entrenó con ellos). Los proveedores que solo el modelo ve son pistas de investigación y viven en <Link to="/aria" className="ct-link">Focos Rojos</Link>.</>
            : <>"Official record" is SAT EFOS (Art. 69-B) and SFP only; it does <strong className="text-text-primary">not</strong> include RUBLI's own cases, which would be circular (the model trained on them). The suppliers only the model sees are investigation leads, and they live in <Link to="/aria" className="ct-link">Red Flags</Link>.</>, lang, PROSE)}
        </p>
      </Plate>
    </section>
  )
}
