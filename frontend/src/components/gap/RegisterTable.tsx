/**
 * The register — one row per post-blackout procedure. The whole row
 * expands in place (zero fetch: every field is on the row). Ledger table at
 * ≥ sm, ruled card list below. gap-relevo spec § 5 / § 8.
 */
import { useState, type ReactNode } from 'react'
import { ChevronDown, ChevronRight, Copy, Check, ExternalLink } from 'lucide-react'
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import { DoorTag } from '@/components/gap/DoorTag'
import { VendorCell } from '@/components/gap/VendorCell'
import { doorOf } from '@/lib/gap/doors'
import { RISK_COLORS, textInk } from '@/lib/constants'
import { formatCompactMXN } from '@/lib/utils'
import type { GapContractItem } from '@/api/types'

/** Hash-routed public detail page — verified in a browser 2026-10-07 (renders the expedient + procedure number). */
const COMPRASMX_DETAIL = (uuid: string) => `https://comprasmx.buengobierno.gob.mx/sitiopublico/#/sitiopublico/detalle/${uuid}/procedimiento`

const LEVEL: Record<string, { en: string; es: string }> = {
  critical: { en: 'critical', es: 'crítico' }, high: { en: 'high', es: 'alto' },
  medium: { en: 'medium', es: 'medio' }, low: { en: 'low', es: 'bajo' },
}

function AlertPill({ level, isEs }: { level: GapContractItem['risk_level']; isEs: boolean }) {
  if (!level) return <span className="text-text-muted ct-mono">—</span>
  // Bible §3.10: low = muted gray, never green
  const t = level === 'low' ? undefined : textInk(RISK_COLORS[level])
  return <span className="gap-lvl" style={t ? { ['--t' as string]: t } : undefined}>{isEs ? LEVEL[level].es : LEVEL[level].en}</span>
}

function Amount({ item, isEs }: { item: GapContractItem; isEs: boolean }) {
  if (!item.amount_best) {
    const t = isEs ? 'El oficio no tiene un monto legible' : 'No readable amount in the letter'
    return <span className="text-text-muted ct-mono" title={t} aria-label={t}>—</span>
  }
  const est = item.amount_source === 'estimated'
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <span className="ct-mono whitespace-nowrap">{formatCompactMXN(item.amount_best)}</span>
      <span className="gap-tag" style={est ? { ['--t' as string]: textInk(RISK_COLORS.medium), ['--c' as string]: RISK_COLORS.medium } : undefined}
        title={est ? (isEs ? 'Estimado por ComprasMX, no leído del oficio' : 'ComprasMX estimate, not read from the letter') : (isEs ? 'Leído por OCR del oficio' : 'Read by OCR from the letter')}>
        {est ? 'EST' : 'OCR'}
      </span>
    </span>
  )
}

function BuyerCell({ item }: { item: GapContractItem }) {
  return item.institution_id
    ? <EntityIdentityChip type="institution" id={item.institution_id} name={item.institution_siglas || item.institution} variant="name" size="inherit" fullName />
    : <span className="ls-anon">{item.institution_siglas || item.institution}</span>
}

function CopyButton({ text, isEs }: { text: string; isEs: boolean }) {
  const [ok, setOk] = useState(false)
  return (
    <button type="button" className="ml-1 inline-flex h-10 w-10 items-center justify-center align-middle text-text-muted hover:text-text-primary"
      aria-label={isEs ? 'Copiar el número de procedimiento' : 'Copy the procedure number'}
      onClick={(e) => { e.stopPropagation(); navigator.clipboard?.writeText(text).then(() => { setOk(true); setTimeout(() => setOk(false), 1200) }).catch(() => {}) }}>
      {ok ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
    </button>
  )
}

function Field({ k, children }: { k: string; children: ReactNode }) {
  if (children == null || children === '') return null
  return <div><dt>{k}</dt><dd>{children}</dd></div>
}

function Expansion({ item, isEs, preDa }: { item: GapContractItem; isEs: boolean; preDa?: number | null }) {
  const d = doorOf(item.exception_article)
  const emergencyArt = item.exception_article === 'Art. 54 fr. II' || item.exception_article === 'Art. 54 fr. V'
  const provenance = item.amount_source === 'fallo_ocr'
    ? (isEs ? 'leído del oficio' : 'read from the letter')
    : item.amount_source === 'datos' ? (isEs ? 'datos abiertos de ComprasMX' : 'ComprasMX open data')
    : item.amount_source === 'estimated' ? (isEs ? 'estimación de ComprasMX' : 'ComprasMX estimate') : (isEs ? 'ninguno' : 'none')
  return (
    <div className="gap-exp">
      <section>
        <h4>{isEs ? 'El procedimiento' : 'The procedure'}</h4>
        <p>{item.title}</p>
        <dl className="gap-facts">
          <Field k={isEs ? 'Número' : 'Number'}><span className="ct-mono">{item.procedure_number}</span><CopyButton text={item.procedure_number} isEs={isEs} /></Field>
          <Field k={isEs ? 'Expediente' : 'Expedient'}><span className="ct-mono">{item.expedient_code}</span></Field>
          <Field k={isEs ? 'Unidad' : 'Unit'}>{item.contracting_unit}</Field>
          <Field k={isEs ? 'Documento' : 'Document'}>{item.award_doc_type}</Field>
          <Field k={isEs ? 'Fechas' : 'Dates'}>
            <span className="ct-mono">{item.publication_date?.slice(0, 10)}{item.opening_date ? ` · ${isEs ? 'apertura' : 'opening'} ${item.opening_date.slice(0, 10)}` : ''}</span>
          </Field>
          <Field k="CUCOP"><span className="ct-mono">{item.cucop}</span></Field>
        </dl>
      </section>
      <section>
        <h4>{isEs ? 'La puerta' : 'The door'}</h4>
        <DoorTag art={item.exception_article} isEs={isEs} row />
        <p>{isEs ? d.meaning.es : d.meaning.en}</p>
        {d.read && <p>{isEs ? d.read.es : d.read.en}</p>}
        <dl className="gap-facts">
          <Field k={isEs ? 'Carácter' : 'Character'}>{item.character}</Field>
        </dl>
        {emergencyArt && !item.is_emergency && (
          <p className="ct-note">
            {isEs ? 'Cita la fracción de emergencia, pero el campo «emergencia» de ComprasMX vale 0: verificar.' : 'Cites the emergency fraction, but the ComprasMX "emergency" field reads 0: verify.'}
          </p>
        )}
      </section>
      <section>
        <h4>{isEs ? 'La contraparte y el dinero' : 'The counterparty and the money'}</h4>
        <VendorCell item={item} isEs={isEs} />
        <dl className="gap-facts">
          <Field k={isEs ? 'Tal como se leyó' : 'As read'}>{item.vendor}</Field>
          <Field k="RFC">{item.vendor_rfc && <span className="ct-mono">{item.vendor_rfc}</span>}</Field>
          <Field k={isEs ? 'Constitución' : 'Incorporated'}>{item.vendor_incorp_year}</Field>
          <Field k={isEs ? 'Monto' : 'Amount'}>
            {item.amount_best ? `${formatCompactMXN(item.amount_best)} · ${provenance}` : provenance}
            {item.amount_review_flag === 'over_10b_review' && <span className="ct-mono" style={{ color: textInk(RISK_COLORS.high) }}> {isEs ? '>10,000 MDP · revisar' : '>10B · review'}</span>}
          </Field>
        </dl>
      </section>
      <div className="gap-exp-foot">
        {item.uuid && (
          <a href={COMPRASMX_DETAIL(item.uuid)} target="_blank" rel="noopener noreferrer" className="ct-link inline-flex min-h-10 items-center gap-1">
            {isEs ? 'Abrir en ComprasMX' : 'Open on ComprasMX'}<ExternalLink className="h-4 w-4" aria-hidden="true" />
          </a>
        )}
        <span>{isEs ? 'oficio de fallo: pestaña Anexos' : 'award letter: see the Anexos tab'}</span>
        {item.institution_id && (
          <EntityIdentityChip type="institution" id={item.institution_id} name={item.institution} variant="name" fullName />
        )}
        {preDa != null && <span>{isEs ? `antes del apagón: ${preDa.toFixed(1)}% adjudicación directa` : `before the blackout: ${preDa.toFixed(1)}% direct award`}</span>}
      </div>
    </div>
  )
}

export function RegisterTable({ items, isEs, openId, onToggle, preDa }: {
  items: GapContractItem[]; isEs: boolean; openId: string | null; onToggle: (uuid: string) => void; preDa: Map<number, number | null>
}) {
  if (!items.length) {
    return <p className="gap-empty">{isEs ? 'Sin resultados con los filtros actuales.' : 'No results with current filters.'}</p>
  }
  const key = (it: GapContractItem) => it.uuid ?? it.procedure_number
  return (
    <div className="gap-reg">
      {/* ≥ sm: the ledger table */}
      <div className="hidden sm:block"><div className="ct-table-wrap"><table className="ct-table ct-stack" aria-label={isEs ? 'Registro de procedimientos posteriores al apagón' : 'Register of post-blackout procedures'}>
        <thead>
          <tr>
            <th scope="col" className="gap-w-date">{isEs ? 'Fecha' : 'Date'}</th>
            <th scope="col">{isEs ? 'Qué' : 'What'}</th>
            <th scope="col" className="gap-w-buyer">{isEs ? 'Comprador' : 'Buyer'}</th>
            <th scope="col" className="gap-w-door hidden md:table-cell">{isEs ? 'Puerta' : 'Door'}</th>
            <th scope="col" className="gap-w-co hidden lg:table-cell">{isEs ? 'Empresa' : 'Company'}</th>
            <th scope="col" className="gap-w-amt num">{isEs ? 'Monto' : 'Amount'}</th>
            <th scope="col" className="gap-w-lvl">{isEs ? 'Alerta' : 'Alert'}</th>
            <th scope="col" className="gap-w-x"><span className="sr-only">{isEs ? 'Detalle' : 'Detail'}</span></th>
          </tr>
        </thead>
        {items.map((it) => {
          const open = openId === key(it)
          return (
            <tbody key={key(it)} id={`row-${key(it)}`} className={open ? 'is-open' : undefined}>
              <tr className="gap-row" onClick={() => onToggle(key(it))}>
                <td className="mono">{it.publication_date?.slice(0, 10)}</td>
                <td className="ct-key">
                  <span className="gap-title" title={it.title}>{it.title}</span>
                  <span className="gap-sub">{[it.cucop, it.procedure_number].filter(Boolean).join(' · ')}</span>
                  <span className="lg:hidden mt-1 block" onClick={(e) => e.stopPropagation()}><VendorCell item={it} isEs={isEs} /></span>
                </td>
                <td className="ct-key" onClick={(e) => e.stopPropagation()}><BuyerCell item={it} /></td>
                <td className="hidden md:table-cell"><DoorTag art={it.exception_article} isEs={isEs} row /></td>
                <td className="hidden lg:table-cell" onClick={(e) => e.stopPropagation()}><VendorCell item={it} isEs={isEs} /></td>
                <td className="num ct-amt"><Amount item={it} isEs={isEs} /></td>
                <td data-l={isEs ? 'alerta' : 'alert'}><AlertPill level={it.risk_level} isEs={isEs} /></td>
                <td>
                  <button type="button" aria-expanded={open} onClick={(e) => { e.stopPropagation(); onToggle(key(it)) }}
                    aria-label={isEs ? 'Ver el detalle del procedimiento' : 'Show procedure detail'}
                    className="inline-flex h-10 w-10 items-center justify-center text-text-muted hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-primary">
                    {open ? <ChevronDown className="h-4 w-4" aria-hidden="true" /> : <ChevronRight className="h-4 w-4" aria-hidden="true" />}
                  </button>
                </td>
              </tr>
              {open && (
                <tr><td colSpan={8}><Expansion item={it} isEs={isEs} preDa={it.institution_id ? preDa.get(it.institution_id) : null} /></td></tr>
              )}
            </tbody>
          )
        })}
      </table></div></div>

      {/* < sm: ruled card list, no horizontal scroll */}
      <div className="sm:hidden"><ul className="gap-cards">
        {items.map((it) => {
          const open = openId === key(it)
          return (
            <li key={key(it)} id={`card-${key(it)}`}>
              {/* §8.1 phone row: line 1 = what · amount; line 2 = date · buyer · door · alert (company in the drawer) */}
              <div className="gap-card-top">
                <button type="button" aria-expanded={open} onClick={() => onToggle(key(it))} className="gap-title">
                  {it.title}
                </button>
                <Amount item={it} isEs={isEs} />
              </div>
              <div className="gap-card-meta">
                <span className="tabular-nums">{it.publication_date?.slice(0, 10)}</span>
                <BuyerCell item={it} />
                <DoorTag art={it.exception_article} isEs={isEs} row />
                <AlertPill level={it.risk_level} isEs={isEs} />
              </div>
              {open && <Expansion item={it} isEs={isEs} preDa={it.institution_id ? preDa.get(it.institution_id) : null} />}
            </li>
          )
        })}
      </ul></div>
    </div>
  )
}
