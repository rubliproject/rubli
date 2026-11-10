/**
 * MajorityLedger — /captura § I «Pasada la mitad» (captura-mitad spec, base
 * cap-geometry § 4 + cap-dossier § 4 fields).
 * 2026-10-15 (UI 1.0 «El Contrato», W3): the supplier's slice is ink (C1), the half line
 * is the one red reference rule (DESIGN.md §6.3, §7.x); geometry unchanged.
 *
 * One 100% bar per buyer: the supplier's slice in ochre with its name inside,
 * a red rule at half, ◆ its 2024 share and ● its 2025 share riding the bar.
 * Bars are share-normalised (not money-length); the 64px stub under the money
 * column carries size on one shared scale. Each row opens a short «ficha»
 * built only from the payload; row 01 is open on load, one open at a time.
 */

import { useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { CaptureCurrentPair, CaptureCurrentResponse } from '@/api/client'
import { formatCompactMXN } from '@/lib/utils'
import { formatVendorName } from '@/lib/vendor/formatName'
import { cleanContractDescription } from '@/lib/contract-audit'
import { glueDashes } from '@/lib/typography'
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'

type Lang = 'en' | 'es'

const pct = (n: number | null | undefined) => (n == null ? '—' : `${n.toFixed(1)}%`)
const keyOf = (p: CaptureCurrentPair) => `${p.institution_id}-${p.vendor_id}`
const shareIn = (p: CaptureCurrentPair, year: number) => p.years.find((y) => y.year === year)?.share_pct ?? null

const GRID = 'lg:grid-cols-[44px_minmax(200px,2fr)_minmax(0,6fr)_72px_minmax(176px,1.4fr)_minmax(156px,1.2fr)]'

interface Props {
  data: CaptureCurrentResponse
  lang: Lang
}

export function MajorityLedger({ data, lang }: Props) {
  const pairs = data.pairs
  const [openKey, setOpenKey] = useState<string | null>(pairs[0] ? keyOf(pairs[0]) : null)
  const maxMxn = pairs[0]?.window_vendor_mxn ?? 1
  const partial = data.window.partial_year
  const toggle = (k: string) => setOpenKey((o) => (o === k ? null : k))

  return (
    <div>
      <p className="mb-3 max-w-none text-[13px] leading-snug text-text-secondary">
        {lang === 'en'
          ? <>Filled = the one supplier’s share of the buyer’s 2024–25 spend. <Mark kind="y24" inline /> its share in 2024 · <Mark kind="y25" inline /> in 2025 (to 28 Sep) · the red line marks half. Bars are shares, not sizes — the stub under the money shows size.</>
          : <>Relleno = la participación del proveedor en el gasto 2024–25 del comprador. <Mark kind="y24" inline /> su participación en 2024 · <Mark kind="y25" inline /> en 2025 (al 28 sep) · la línea roja marca la mitad. Las barras son participaciones, no tamaños — la marca bajo el dinero muestra el tamaño.</>}
      </p>

      {/* Header — desktop only */}
      <div className={`hidden lg:grid ${GRID} gap-x-4 pb-1.5 border-b border-border ct-sc text-[13px] text-text-muted`}>
        <span>#</span>
        <span>{lang === 'en' ? 'Buyer' : 'Comprador'}</span>
        <span className="relative">
          <span>0</span>
          <span className="absolute left-1/2 -translate-x-1/2" style={{ color: 'var(--color-risk-critical)' }}>50%</span>
          <span className="absolute right-0">100%</span>
        </span>
        <span className="text-right">{lang === 'en' ? 'Share' : 'Part.'}</span>
        <span>{lang === 'en' ? 'Supplier / buyer' : 'Proveedor / comprador'}</span>
        <span>{lang === 'en' ? 'Seals' : 'Sellos'}</span>
      </div>

      <ol>
        {pairs.map((p, i) => {
          const k = keyOf(p)
          const open = openKey === k
          const rank = String(i + 1).padStart(2, '0')
          const panel = `ficha-${k}`
          // the row toggles, except clicks on the chip links inside it
          const onRow = (e: MouseEvent) => {
            if (!(e.target as HTMLElement).closest('a')) toggle(k)
          }
          return (
            <li key={k} className="border-b border-border/40">
              {/* Desktop row */}
              <div onClick={onRow} className={`hidden lg:grid ${GRID} gap-x-4 items-center min-h-[38px] py-1 cursor-pointer ct-row`}>
                <RowButton rank={rank} open={open} panel={panel} onToggle={() => toggle(k)} lang={lang} p={p} />
                <div className="min-w-0">
                  <EntityIdentityChip type="institution" id={p.institution_id} name={p.institution_name} size="sm" fullName />
                </div>
                <Bar p={p} nameInside />
                <Share p={p} lang={lang} />
                <Money p={p} maxMxn={maxMxn} />
                <Seals p={p} lang={lang} />
              </div>

              {/* Mobile block */}
              <div onClick={onRow} className="lg:hidden py-2.5 cursor-pointer">
                <div className="flex items-start gap-2">
                  <RowButton rank={rank} open={open} panel={panel} onToggle={() => toggle(k)} lang={lang} p={p} />
                  <div className="min-w-0 flex-1">
                    <EntityIdentityChip type="institution" id={p.institution_id} name={p.institution_name} size="sm" fullName />
                  </div>
                  <Share p={p} lang={lang} />
                </div>
                <p className="mt-1.5 text-[14px] font-semibold text-text-primary">
                  {formatVendorName(p.vendor_name, Infinity)}
                </p>
                <div className="mt-1"><Bar p={p} /></div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <Money p={p} maxMxn={maxMxn} />
                  <Seals p={p} lang={lang} />
                </div>
              </div>

              {open && <Ficha id={panel} p={p} partial={partial} lang={lang} />}
            </li>
          )
        })}
      </ol>

      <p className="mt-3 text-[13px] text-text-secondary">
        {lang === 'en' ? 'Not listed? Every buyer’s full record is in ' : '¿No aparece? El registro completo de cada comprador está en '}
        <Link to="/institutions" className="underline underline-offset-2 hover:text-text-primary">
          {lang === 'en' ? 'Institutions' : 'Instituciones'}
        </Link>
        {lang === 'en' ? '.' : '.'}
      </p>
    </div>
  )
}

function RowButton({ rank, open, panel, onToggle, lang, p }: {
  rank: string; open: boolean; panel: string; onToggle: () => void; lang: Lang; p: CaptureCurrentPair
}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={panel}
      aria-label={`${rank} · ${p.institution_name} ← ${formatVendorName(p.vendor_name, 60)} · ${lang === 'en' ? (open ? 'close file' : 'open file') : (open ? 'cerrar ficha' : 'abrir ficha')}`}
      onClick={(e) => { e.stopPropagation(); onToggle() }}
      className="flex-shrink-0 min-h-6 max-lg:min-h-11 inline-flex items-center gap-1 font-mono text-[12px] tabular-nums text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-primary"
    >
      {rank}
      <span aria-hidden="true" className="text-text-primary">{open ? '▴' : '▾'}</span>
    </button>
  )
}

/** ◆ = 2024, ● = 2025. Ink with a paper halo so it reads on ochre and grey. */
function Mark({ kind, inline }: { kind: 'y24' | 'y25'; inline?: boolean }) {
  const base: CSSProperties = {
    width: 7, height: 7, background: 'var(--color-text-primary)',
    outline: '1px solid var(--color-background)',
    borderRadius: kind === 'y25' ? '50%' : 0,
    transform: kind === 'y24' ? 'rotate(45deg)' : undefined,
  }
  return inline
    ? <span aria-hidden="true" className="inline-block align-middle mx-0.5" style={base} />
    : <span aria-hidden="true" className="absolute top-1/2" style={{ ...base, marginTop: -3.5, marginLeft: -3.5 }} />
}

function Bar({ p, nameInside }: { p: CaptureCurrentPair; nameInside?: boolean }) {
  const s24 = shareIn(p, 2024)
  const s25 = shareIn(p, 2025)
  const label = `${pct(p.window_share_pct)} · 2024 ${pct(s24)} · 2025 ${pct(s25)}`
  return (
    <div className="relative h-[18px]" role="img" aria-label={label}>
      <div className="absolute inset-x-0 top-[2px] h-[14px] bg-border/50" />
      <div
        className="absolute left-0 top-[2px] h-[14px] overflow-hidden flex items-center"
        style={{ width: `${Math.min(100, p.window_share_pct)}%`, background: 'var(--color-text-primary)' }}
      >
        {nameInside && (
          <span
            className="pl-1.5 pr-1 text-[12px] font-semibold leading-none whitespace-nowrap overflow-hidden text-ellipsis"
            style={{ color: 'var(--color-background)' }}
            title={p.vendor_name}
          >
            {formatVendorName(p.vendor_name, 60)}
          </span>
        )}
      </div>
      <span aria-hidden="true" className="absolute top-0 bottom-0 left-1/2 w-px" style={{ background: 'var(--color-risk-critical)' }} />
      {s24 != null && <span className="absolute inset-0"><span className="absolute top-0 bottom-0" style={{ left: `${Math.min(100, s24)}%` }}><Mark kind="y24" /></span></span>}
      {s25 != null && <span className="absolute inset-0"><span className="absolute top-0 bottom-0" style={{ left: `${Math.min(100, s25)}%` }}><Mark kind="y25" /></span></span>}
    </div>
  )
}

function Money({ p, maxMxn }: { p: CaptureCurrentPair; maxMxn: number }) {
  return (
    <div className="font-mono text-[13px] tabular-nums leading-tight whitespace-nowrap">
      <span className="font-bold text-text-primary">{formatCompactMXN(p.window_vendor_mxn).replace(/ (MXN|MDP)$/, '')}</span>
      <span className="text-text-muted"> / {formatCompactMXN(p.window_inst_mxn)}</span>
      <span aria-hidden="true" className="block mt-1 h-[3px] w-16">
        <span className="block h-full" style={{ width: `${Math.max(2, (64 * p.window_vendor_mxn) / maxMxn)}px`, background: 'var(--color-text-muted)' }} />
      </span>
    </div>
  )
}

/** Share figure, with "↓ year" when the supplier fell below half in the buyer's latest year. */
function Share({ p, lang }: { p: CaptureCurrentPair; lang: Lang }) {
  return (
    <span className="text-right leading-tight">
      <span className="block font-serif font-bold tabular-nums text-[15px] text-text-primary">{pct(p.window_share_pct)}</span>
      {!p.holding && (
        <span className="block font-mono text-[12px] text-text-secondary" title={lang === 'en' ? `Below half in ${p.latest_year}` : `Debajo de la mitad en ${p.latest_year}`}>
          ↓ {p.latest_year}
        </span>
      )}
    </span>
  )
}

function Tag({ children, accent, title }: { children: ReactNode; accent?: boolean; title?: string }) {
  return (
    <span
      title={title}
      className="ct-sc text-[13px] px-1 py-px whitespace-nowrap"
      style={{
        color: accent ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
        border: `1px solid ${accent ? 'var(--color-text-primary)' : 'var(--color-border)'}`,
      }}
    >
      {children}
    </span>
  )
}

function Seals({ p, lang }: { p: CaptureCurrentPair; lang: Lang }) {
  const s = p.seal
  return (
    <div className="flex flex-wrap gap-1">
      {p.da_pct >= 50 && <Tag title={lang === 'en' ? 'Share of contracts awarded directly' : 'Contratos por adjudicación directa'}>{lang === 'en' ? 'DA' : 'AD'} {Math.round(p.da_pct)}%</Tag>}
      {s.gt && (
        <Tag accent title={s.gt === 'documented'
          ? (lang === 'en' ? 'Documented case in RUBLI’s base' : 'Caso documentado en la base de RUBLI')
          : (lang === 'en' ? 'Case label in RUBLI’s base (lead, not adjudicated)' : 'Etiqueta de caso en la base de RUBLI (indicio, no resolución)')}>
          {lang === 'en' ? 'Case' : 'Caso'}
        </Tag>
      )}
      {s.ips_tier != null && s.ips_tier <= 2 && <Tag title={lang === 'en' ? 'ARIA tier (risk indicator)' : 'Nivel ARIA (indicador de riesgo)'}>T{s.ips_tier}</Tag>}
      {s.efos && <Tag accent>EFOS</Tag>}
      {s.sfp && <Tag accent>SFP</Tag>}
    </div>
  )
}

function daPhrase(p: CaptureCurrentPair, lang: Lang): string {
  const all = p.da_pct >= 100
  const none = p.da_pct <= 0
  if (lang === 'en') {
    if (p.n_contracts === 1) return all ? 'awarded directly' : 'through a tender'
    if (all) return p.n_contracts === 2 ? 'both awarded directly' : 'all awarded directly'
    if (none) return p.n_contracts === 2 ? 'both through tenders' : 'all through tenders'
    return `${Math.round(p.da_pct)}% of them awarded directly`
  }
  if (p.n_contracts === 1) return all ? 'por adjudicación directa' : 'por licitación'
  if (all) return p.n_contracts === 2 ? 'ambos por adjudicación directa' : 'todos por adjudicación directa'
  if (none) return p.n_contracts === 2 ? 'ambos por licitación' : 'todos por licitación'
  return `${Math.round(p.da_pct)}% de ellos por adjudicación directa`
}

function lede(p: CaptureCurrentPair, lang: Lang): string {
  const buyer = p.institution_name
  const vendor = formatVendorName(p.vendor_name, 60)
  const s24 = shareIn(p, 2024)
  const s25 = shareIn(p, 2025)
  const n = p.n_contracts
  const en = lang === 'en'
  const parts = [
    en
      ? `In 2024–25 ${buyer} spent ${formatCompactMXN(p.window_inst_mxn)}. ${vendor} received ${formatCompactMXN(p.window_vendor_mxn)} of it (${pct(p.window_share_pct)}) through ${n} contract${n === 1 ? '' : 's'}, ${daPhrase(p, lang)}.`
      : `En 2024–25 ${buyer} gastó ${formatCompactMXN(p.window_inst_mxn)}. ${vendor} recibió ${formatCompactMXN(p.window_vendor_mxn)} (${pct(p.window_share_pct)}) en ${n} contrato${n === 1 ? '' : 's'}, ${daPhrase(p, lang)}.`,
  ]
  if (s24 != null && s25 != null) {
    parts.push(en ? `Its share went from ${pct(s24)} in 2024 to ${pct(s25)} in 2025.` : `Su participación pasó de ${pct(s24)} en 2024 a ${pct(s25)} en 2025.`)
  } else if (s24 != null) {
    parts.push(en ? `It held ${pct(s24)} of 2024; it has no 2025 contracts with this buyer on record.` : `Tuvo ${pct(s24)} de 2024; no tiene contratos de 2025 con este comprador en el registro.`)
  } else if (s25 != null) {
    parts.push(en ? `All of it came in 2025, ${pct(s25)} of that year’s spend.` : `Todo llegó en 2025: ${pct(s25)} del gasto de ese año.`)
  }
  if (p.consecutive_majority_years >= 3) {
    parts.push(en ? `It has held the majority ${p.consecutive_majority_years} years running.` : `Ha tenido la mayoría ${p.consecutive_majority_years} años seguidos.`)
  }
  if (p.other_vendors > 0) {
    parts.push(en
      ? `${p.other_vendors} other supplier${p.other_vendors === 1 ? '' : 's'} shared the rest; the next largest took ${pct(p.runner_up_share_pct)}.`
      : `${p.other_vendors} proveedor${p.other_vendors === 1 ? '' : 'es'} más se repartieron el resto; el siguiente se llevó ${pct(p.runner_up_share_pct)}.`)
  }
  return glueDashes(parts.join(' '))
}

function Ficha({ id, p, partial, lang }: { id: string; p: CaptureCurrentPair; partial: number; lang: Lang }) {
  const en = lang === 'en'
  const s = p.seal
  const kicker = 'ct-sc text-[13px] text-text-muted'
  const caveats = [
    p.latest_year === partial && (en ? `${partial} is a partial year (to 28 Sep).` : `${partial} es un año parcial (al 28 sep).`),
    p.n_contracts === 1 && (en ? 'Single contract: one award is most of this buyer’s two years.' : 'Un solo contrato: una adjudicación es la mayor parte de los dos años de este comprador.'),
    !p.holding && (en ? `Share fell below half in ${p.latest_year}.` : `La participación cayó debajo de la mitad en ${p.latest_year}.`),
    p.flagged_amount && (en ? 'Includes a contract over 10B MXN, flagged for review.' : 'Incluye un contrato de más de 10,000 MDP, marcado para revisión.'),
  ].filter(Boolean) as string[]

  return (
    <div id={id} className="mb-3 mt-1 border-t border-border px-4 py-4 grid grid-cols-1 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-6 lg:gap-8">
      <div className="min-w-0">
        <p style={{ fontFamily: 'var(--font-serif)', fontSize: 15, lineHeight: 1.6, color: 'var(--color-text-primary)', textWrap: 'pretty' }}>
          {lede(p, lang)}
        </p>
        {p.top_titles.length > 0 && (
          <>
            <h4 className={`${kicker} mt-4 mb-1.5`}>{en ? 'What was bought' : 'Lo que se compró'}</h4>
            <ul className="space-y-1.5">
              {p.top_titles.map((t) => (
                <li key={t.contract_id} className="text-[14px] leading-snug">
                  <span className="font-mono text-[13px] tabular-nums text-text-muted">
                    {t.year} · {formatCompactMXN(t.amount_mxn)} · {t.is_direct_award ? (en ? 'direct award' : 'adj. directa') : (en ? 'tender' : 'licitación')} ·{' '}
                  </span>
                  <Link to={`/contracts/${t.contract_id}`} className="text-text-primary underline decoration-border underline-offset-2 hover:decoration-text-primary">
                    {cleanContractDescription(t.title ?? '', Infinity).objeto ?? (en ? 'Untitled contract' : 'Contrato sin título')}
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
        <h4 className={`${kicker} mt-4 mb-1`}>{en ? 'Share by year' : 'Participación por año'}</h4>
        <p className="max-w-none font-mono text-[13px] tabular-nums text-text-secondary">
          {p.years.map((y, i) => (
            <span key={y.year}>
              {i > 0 && ' · '}
              <span className="whitespace-nowrap">
                {y.year} <span className={(y.share_pct ?? 0) >= 50 ? 'font-bold text-text-primary' : undefined}>{y.share_pct == null ? '—' : pct(y.share_pct)}</span>
                {y.year === partial ? '*' : ''}
              </span>
            </span>
          ))}
        </p>
      </div>

      <div className="min-w-0 space-y-3">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <EntityIdentityChip type="vendor" id={p.vendor_id} name={p.vendor_name} size="sm" fullName />
            <Link to={`/vendors/${p.vendor_id}`} className="ct-sc text-[13px] text-text-muted hover:text-text-primary">{en ? 'dossier →' : 'expediente →'}</Link>
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <EntityIdentityChip type="institution" id={p.institution_id} name={p.institution_full_name ?? p.institution_name} size="sm" fullName />
            <Link to={`/institutions/${p.institution_id}`} className="ct-sc text-[13px] text-text-muted hover:text-text-primary">{en ? 'dossier →' : 'expediente →'}</Link>
          </div>
        </div>
        <dl className="grid grid-cols-[minmax(96px,auto)_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-[14px]">
          <dt className="text-[13px] text-text-muted">{en ? 'How awarded' : 'Cómo se adjudicó'}</dt>
          <dd className="text-text-primary">
            {p.n_contracts} {en ? (p.n_contracts === 1 ? 'contract' : 'contracts') : (p.n_contracts === 1 ? 'contrato' : 'contratos')} · {Math.round(p.da_pct)}% {en ? 'direct award' : 'adj. directa'} · {p.n_single_bid} {en ? 'single-award' : 'con un solo adjudicado'}
          </dd>
          <dt className="text-[13px] text-text-muted">{en ? 'Case base' : 'Base de casos'}</dt>
          <dd className="text-text-primary">
            {s.case_slug ? (
              <EntityIdentityChip type="case" id={s.case_slug} name={`#${s.gt_case_id}`} size="sm" />
            ) : s.gt === 'documented' ? (
              en ? `Documented case #${s.gt_case_id}` : `Caso documentado #${s.gt_case_id}`
            ) : s.gt === 'lead' ? (
              en ? `Case label #${s.gt_case_id} — a lead, not an adjudication` : `Etiqueta de caso #${s.gt_case_id} — indicio, no resolución`
            ) : (
              <span className="text-text-muted">{en ? 'Not in the case base' : 'No está en la base de casos'}</span>
            )}
          </dd>
          <dt className="text-[13px] text-text-muted">ARIA</dt>
          <dd className="text-text-primary">
            {s.ips_tier != null ? (
              <Link to={`/aria?vendor=${p.vendor_id}`} className="underline decoration-border underline-offset-2 hover:decoration-text-primary">
                {en ? 'Tier' : 'Nivel'} {s.ips_tier}{s.pattern ? ` · ${s.pattern}` : ''}
              </Link>
            ) : (
              <span className="text-text-muted">{en ? 'Not in the queue' : 'Fuera de la fila'}</span>
            )}
            <span className="text-text-muted text-[13px]"> · {en ? 'risk indicator' : 'indicador de riesgo'}</span>
          </dd>
          {(s.efos || s.sfp) && (
            <>
              <dt className="text-[13px] text-text-muted">EFOS / SFP</dt>
              <dd className="text-text-primary">{[s.efos && 'EFOS', s.sfp && (en ? 'SFP sanction' : 'Sanción SFP')].filter(Boolean).join(' · ')}</dd>
            </>
          )}
        </dl>
        {caveats.length > 0 && (
          <p className="max-w-none text-[13px] leading-snug text-text-muted">{caveats.join(' ')}</p>
        )}
      </div>
    </div>
  )
}
