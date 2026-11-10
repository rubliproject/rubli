/**
 * DossierBlocks — the case dossier (/cases/:slug) ledgers on «El Contrato»
 * (frontend/DESIGN.md §8 table, §6 palette).
 *
 *   CompranetVisibilityBanner — the evidentiary-reach note under the vendors.
 *   LinkedVendorList          — `.ct-table` ledger: chip · role · evidence · contracts ·
 *                               risk indicator; ghost rows for named-but-unlinked vendors.
 *   KeepReadingFooter         — related cases (same sector) as a `.ct-table` ledger.
 */
import { Link } from 'react-router-dom'
import { formatCompactMXN } from '@/lib/utils'
import { formatVendorName } from '@/lib/vendor/formatName'
import { formatEntityName } from '@/lib/entity/format'
import { CASE_FRAUD_TYPE_COLORS, SECTORS } from '@/lib/constants'
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import { ListHead, COL, NameCell, NumCell, IndicatorCell, TextCell } from '@/components/kit/ListCells'
import { RankCell } from '@/components/kit/ListRow'
import type { KeyActor, LinkedVendor, ScandalDetail, ScandalListItem } from '@/api/types'
import {
  dispositionFor,
  dispositionLabel,
  evidenceLabel,
  fraudLabel,
  matchMethodLabel,
  vendorRoleLabel,
  visibilityMeta,
  type Lang,
} from './casesVocab'

// ─── CompranetVisibilityBanner ──────────────────────────────────────────────

export function CompranetVisibilityBanner({ scandal, lang }: { scandal: ScandalDetail; lang: Lang }) {
  const vis = visibilityMeta(scandal.compranet_visibility)
  const note = (lang === 'es' && scandal.compranet_note_es) || scandal.compranet_note
  return (
    <p className="ct-foot">
      <b className="ct-sc">COMPRANET · {vis.label[lang]}.</b> {vis.body[lang]}
      {note && (
        <>
          {' '}
          {/* Spanish note when authored; the English fallback keeps lang="en" for screen readers. */}
          <span lang={lang === 'es' && scandal.compranet_note_es ? 'es' : 'en'}>{note}</span>
        </>
      )}
    </p>
  )
}

// ─── LinkedVendorList ───────────────────────────────────────────────────────
// Top 10 by contracts; the rest behind a native <details>. Ghost rows follow:
// vendor-role actors named in the file but absent from linked_vendors.

const VENDOR_TOP = 10

function VendorRow({ v, n, years, lang }: { v: LinkedVendor; n: number; years?: string | null; lang: Lang }) {
  const method = matchMethodLabel(v.match_method, lang)
  return (
    <tr className="ct-row">
      <RankCell n={n} />
      <td className="ct-key">
        {v.vendor_id != null ? (
          <>
            <EntityIdentityChip type="vendor" id={v.vendor_id} name={v.vendor_name} variant="name" size="inherit" fullName />
            {v.ips_tier != null && v.ips_tier <= 3 && (
              <Link to={`/aria/caso/${v.vendor_id}`} className="ct-link" style={{ marginLeft: 8, fontSize: 13, fontWeight: 400 }}>{lang === 'es' ? `Nivel ${v.ips_tier} · el caso` : `Tier ${v.ips_tier} · the case`}</Link>
            )}
          </>
        ) : (
          <span className="ls-anon">{formatVendorName(v.vendor_name, 300)}</span>
        )}
      </td>
      <td className="ls-txt" title={method ? `${lang === 'es' ? 'Vínculo' : 'Match'}: ${method}` : undefined}>{vendorRoleLabel(v.role, lang) || '—'}</td>
      <TextCell>{evidenceLabel(v.evidence_strength, lang) || '—'}</TextCell>
      <NumCell label={lang === 'es' ? 'contratos' : 'contracts'}>
        {/* the count opens the vendor's contracts in the Archive (interconnection audit 2026-10-27) */}
        {v.vendor_id != null && (v.contract_count ?? 0) > 0
          ? <Link to={`/contracts?vendor_id=${v.vendor_id}`} className="ct-link">{v.contract_count.toLocaleString(lang === 'es' ? 'es-MX' : 'en-US')}</Link>
          : '—'}
      </NumCell>
      {v.avg_risk_score != null
        ? <IndicatorCell value={v.avg_risk_score} />
        : <TextCell>{lang === 'es' ? `sin contratos${years ? ` en ${years}` : ''}` : `no contracts${years ? ` in ${years}` : ''}`}</TextCell>}
    </tr>
  )
}

export function LinkedVendorList({
  vendors,
  ghostActors = [],
  years,
  lang,
}: {
  vendors: LinkedVendor[]
  ghostActors?: KeyActor[]
  /** The case window the contract counts cover («2013–2014»). */
  years?: string | null
  lang: Lang
}) {
  const es = lang === 'es'
  // Editorial call (owner-delegated, 2026-10-08): rows with no registry match or only a placeholder
  // case label are not shown as named suppliers on a public case page; they are counted instead.
  const UNVERIFIED = new Set(['orphaned_no_match', 'placeholder_case_label'])
  const hidden = vendors.filter((v) => UNVERIFIED.has(v.match_method ?? '')).length
  const shown = vendors.filter((v) => !UNVERIFIED.has(v.match_method ?? ''))
  if (shown.length === 0 && ghostActors.length === 0 && hidden === 0) return null
  const sorted = [...shown].sort((a, b) =>
    (b.contract_count ?? 0) - (a.contract_count ?? 0) || (b.avg_risk_score ?? 0) - (a.avg_risk_score ?? 0))
  const top = sorted.slice(0, VENDOR_TOP)
  const rest = sorted.slice(VENDOR_TOP)
  const key = (v: LinkedVendor, i: number) => `${v.vendor_id ?? 'unmatched'}-${i}`
  const head = <ListHead lang={lang} ranked cols={[COL.vendor, { key: 'role', es: 'Papel', en: 'Role' }, { key: 'evidence', es: 'Evidencia', en: 'Evidence' }, COL.contracts, COL.indicator]} />
  return (
    <div>
      {(sorted.length > 0 || ghostActors.length > 0) && (
        <div className="ct-table-wrap">
          <table className="ct-table ct-stack">
            {head}
            <tbody>
              {top.map((v, i) => <VendorRow key={key(v, i)} v={v} n={i + 1} years={years} lang={lang} />)}
              {ghostActors.map((a, i) => (
                <tr key={`ghost-${a.name}-${i}`} className="ct-row">
                  <td className="ct-rank" aria-hidden="true" />
                  <td className="ct-key"><span className="ls-anon">{formatEntityName('vendor', a.name, 'full')}</span></td>
                  <td className="ls-txt" colSpan={4}>{es ? 'Nombrado entre los actores, sin registro en COMPRANET' : 'Named among the actors, no COMPRANET record'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rest.length > 0 && (
        <details className="cd-more">
          <summary className="ct-link">
            {es ? `Ver los otros ${rest.length} proveedores` : `Show the other ${rest.length} vendors`}
          </summary>
          <div className="ct-table-wrap">
            <table className="ct-table ct-stack">
              {head}
              <tbody>{rest.map((v, i) => <VendorRow key={key(v, i + VENDOR_TOP)} v={v} n={i + VENDOR_TOP + 1} years={years} lang={lang} />)}</tbody>
            </table>
          </div>
        </details>
      )}
      {hidden > 0 && (
        <p className="ct-foot">
          {es
            ? `${hidden} ${hidden === 1 ? 'nombre' : 'nombres'} del expediente sin coincidencia verificada en el registro de proveedores: no se listan.`
            : `${hidden} ${hidden === 1 ? 'name' : 'names'} in the file with no verified supplier-registry match: not listed.`}
        </p>
      )}
    </div>
  )
}

// ─── KeepReadingFooter — related cases ──────────────────────────────────────

export function relatedCases(current: ScandalDetail, allCases: ScandalListItem[] | undefined): ScandalListItem[] {
  const sectorId = current.sector_id ?? current.sector_ids?.[0] ?? null
  return (allCases ?? [])
    .filter((c) => c.id !== current.id)
    .filter((c) => (sectorId != null ? c.sector_id === sectorId || (c.sector_ids ?? []).includes(sectorId) : true))
    .sort((a, b) => (b.amount_mxn_low ?? 0) - (a.amount_mxn_low ?? 0))
    .slice(0, 5)
}

export function KeepReadingFooter({
  current,
  allCases,
  lang,
}: {
  current: ScandalDetail
  allCases: ScandalListItem[] | undefined
  lang: Lang
}) {
  const es = lang === 'es'
  const related = relatedCases(current, allCases)
  if (related.length === 0) return null
  const sectorId = current.sector_id ?? current.sector_ids?.[0] ?? null
  const sector = sectorId != null ? SECTORS.find((s) => s.id === sectorId) : null
  return (
    <div className="ct-table-wrap">
      <table className="ct-table ct-stack">
        {sector && (
          <caption className="cd-caption">
            {es ? 'Mismo sector: ' : 'Same sector: '}
            <EntityIdentityChip type="sector" id={sector.id} name={es ? sector.name : sector.nameEN} variant="name" />
          </caption>
        )}
        <ListHead lang={lang} ranked cols={[COL.case, COL.fraud, COL.years, { ...COL.outcome, es: 'Situación', en: 'Status' }, { ...COL.amount, es: 'Pérdida documentada', en: 'Documented loss' }]} />
        <tbody>
          {related.map((c, i) => {
            const meta = dispositionFor(c.legal_status)
            const s = c.contract_year_start
            const e = c.contract_year_end
            const amount = c.amount_mxn_high ?? c.amount_mxn_low
            return (
              <tr key={c.id} className="ct-row">
                <RankCell n={i + 1} />
                <NameCell type="case" id={c.slug} name={es && c.name_es ? c.name_es : c.name_en} />
                <TextCell><span className="nowrap"><span className="ct-sq" aria-hidden="true" style={{ ['--c' as string]: CASE_FRAUD_TYPE_COLORS[c.fraud_type] ?? CASE_FRAUD_TYPE_COLORS.other }} />{fraudLabel(c.fraud_type, lang)}</span></TextCell>
                <NumCell label={es ? 'años' : 'years'}>{s ? (e && e !== s ? `${s}–${e}` : s) : '—'}</NumCell>
                <TextCell><span className="cd-status" style={{ ['--c' as string]: meta.fill, color: meta.ink }}><i className={meta.ring ? 'is-ring' : undefined} aria-hidden="true" />{dispositionLabel(c.legal_status, lang)}</span></TextCell>
                <NumCell amt>{amount ? formatCompactMXN(amount) : '—'}</NumCell>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
