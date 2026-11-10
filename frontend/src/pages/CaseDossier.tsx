/**
 * CaseDossier — the case dossier at /cases/:slug on «El Contrato» (frontend/DESIGN.md §5–§8).
 * A READ-mode dossier, read as a public record (top to bottom):
 *
 *   PageHead  Registro › Casos › name — prev / next in the docket ([ / ] keys) when the
 *             reader came from the published list · kicker = case name · h1 = the summary's first sentence
 *   Cover     (no h1) the rest of the summary · lead: the outcome
 *             (disposition, what it means, the legal note, the computed charge) beside the
 *             facts list (folio, type with its colour square, sexenio, years, uncovered,
 *             documented loss, COMPRANET reach, provenance) — two columns that end together
 *   En cifras documented loss · vendors linked · their contracts · severity on its ruler
 *   Sections  the account (rest of the summary | the amount note) · actors · linked vendors
 *             ledger · sources ledger with provenance type · related cases ledger
 *   Firmas    live in the shell.
 *
 * No new API calls: everything is a pure function of ScandalDetail + the case list.
 * Every label renders through casesVocab with a humanized fallback (no raw enums).
 */
import { useEffect, useMemo, type ReactNode } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { MotionConfig } from 'framer-motion'
import { caseLibraryApi } from '@/api/client'
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import { ListHead, COL, NumCell, TextCell } from '@/components/kit/ListCells'
import { CASE_FRAUD_TYPE_COLORS, RISK_COLORS, SECTORS } from '@/lib/constants'
import { formatCompactMXN, formatCompactUSD, formatNumber, safeHttpUrl } from '@/lib/utils'
import type { ScandalDetail, ScandalListItem, ScandalSource, KeyActor, LinkedVendor } from '@/api/types'

import { useSiblingNav } from '@/lib/nav/wayfinding'
import { DossierOriginProvider } from '@/lib/nav/WayfindingProviders'
import { DocHead } from '@/components/contrato/DocHead'
import { PageHead, splitFinding } from '@/components/kit/PageHead'
import { Conexiones } from '@/components/contrato/Conexiones'
import { cieloHref } from '@/lib/vista'
import { Cover } from '@/components/contrato/Cover'
import { Clause } from '@/components/contrato/Clause'

import {
  folio,
  fraudLabel,
  impunityGap,
  leadFinding,
  sexenioLabel,
  visibilityMeta,
  SEVERITY_MAX,
  type Lang,
} from '@/components/cases/casesVocab'
import { DispositionSeal } from '@/components/cases/CasesShared'
import {
  CompranetVisibilityBanner,
  KeepReadingFooter,
  LinkedVendorList,
  relatedCases,
} from '@/components/cases/DossierBlocks'
import '@/components/cases/case-dossier.css'

/** Lowercase + strip accents/punctuation — actor↔vendor name-match join. */
function normalizeVendorName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

// ─── Legal-status callout body copy ─────────────────────────────────────────

function legalStatusBody(status: string, lang: Lang): string {
  const es = lang === 'es'
  switch (status) {
    case 'convicted':
      return es
        ? 'Un tribunal emitió sentencia condenatoria contra al menos un actor vinculado a este caso.'
        : 'A court of law returned a guilty verdict against at least one actor tied to this case.'
    case 'prosecuted':
      return es
        ? 'Se han presentado cargos formales; el proceso judicial está en marcha.'
        : 'Formal charges have been filed; trial proceedings are under way.'
    case 'investigation':
      return es
        ? 'Autoridades están investigando, sin cargos formales hasta la fecha.'
        : 'Authorities are investigating; no formal charges yet on record.'
    case 'ongoing':
      return es
        ? 'El proceso sigue abierto; sin sentencia firme hasta la fecha.'
        : 'Proceedings remain open; no final ruling to date.'
    case 'impunity':
      return es
        ? 'Caso documentado por auditoría o investigación periodística; ningún actor enfrentó consecuencias penales pese a la evidencia disponible.'
        : 'Case documented by audit or investigative journalism; no actor faced criminal consequences despite available evidence.'
    case 'settled':
      return es
        ? 'El caso se cerró mediante acuerdo, sin sentencia penal.'
        : 'The case closed by settlement, without a criminal verdict.'
    case 'acquitted':
      return es
        ? 'Los actores señalados fueron absueltos en el proceso judicial.'
        : 'Implicated actors were acquitted in court.'
    case 'dismissed':
      return es
        ? 'El caso fue desestimado por autoridad judicial.'
        : 'The case was dismissed by judicial authority.'
    default:
      return es
        ? 'Estado judicial no determinado en fuentes disponibles.'
        : 'Judicial status not determined in available sources.'
  }
}

/** True when every 3+-digit figure in `note` already appears in `body` — the
 *  note restates § I (cases § G8: Segalmex printed «156 denuncias» three times).
 *  ponytail: number-overlap heuristic; a note with no figures always renders. */
function restates(note: string, body: string): boolean {
  const nums = note.match(/\d[\d,]{2,}/g)
  return !!nums && nums.every((n) => body.includes(n))
}


// ─── Section — plain h2 over an ink rule, optional aside (DESIGN.md §5) ─────

function Section({ id, title, aside, children }: { id: string; title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="ct-section" aria-labelledby={id}>
      <div className="ct-annex-row">
        <h2 id={id} className="ct-h2 scroll-mt-4">{title}</h2>
        {aside && <span className="cd-aside">{aside}</span>}
      </div>
      <div className="ct-section-body">{children}</div>
    </section>
  )
}

// ─── Cover lead — the outcome beside the facts ──────────────────────────────

function Outcome({ scandal, summary, allCases, lang }: { scandal: ScandalDetail; summary: string; allCases: ScandalListItem[] | undefined; lang: Lang }) {
  const es = lang === 'es'
  const legalNote = (es && scandal.legal_status_note_es) || scandal.legal_status_note
  const amountNote = (es && scandal.amount_note_es) || scandal.amount_note
  const finding = leadFinding(scandal, allCases, lang)
  return (
    <section className="cd-outcome" aria-labelledby="cd-out-h">
      <h2 id="cd-out-h" className="cd-kicker">{es ? 'Desenlace' : 'Outcome'}</h2>
      <div className="cd-seal"><DispositionSeal status={scandal.legal_status} lang={lang} size="md" /></div>
      <p>{legalStatusBody(scandal.legal_status, lang)}</p>
      {legalNote && !restates(legalNote, summary) && (
        // Spanish note when authored; the English fallback keeps lang="en" for screen readers.
        <p lang={es && scandal.legal_status_note_es ? 'es' : 'en'} className="cd-out-note">{legalNote}</p>
      )}
      {amountNote && !restates(amountNote, summary) && (
        <p lang={es && scandal.amount_note_es ? 'es' : 'en'} className="cd-out-note"><b className="ct-sc">{es ? 'La cifra.' : 'The figure.'}</b> {amountNote}</p>
      )}
      <p className="cd-out-finding">
        <b className="ct-sc">{es ? 'El hallazgo.' : 'The finding.'}</b>{' '}
        {finding.primaryText.charAt(0).toUpperCase() + finding.primaryText.slice(1)}
        {finding.secondaryText ? `; ${finding.secondaryText}` : ''}.
      </p>
    </section>
  )
}

function CaseFacts({ scandal, lang }: { scandal: ScandalDetail; lang: Lang }) {
  const es = lang === 'es'
  const vis = visibilityMeta(scandal.compranet_visibility)
  const gap = impunityGap(scandal)
  const amount = scandal.amount_mxn_high ?? scandal.amount_mxn_low ?? null
  const low = scandal.amount_mxn_low ?? null
  const high = scandal.amount_mxn_high ?? null
  const s = scandal.contract_year_start
  const e = scandal.contract_year_end
  const sector = SECTORS.find((x) => x.id === (scandal.sector_id ?? scandal.sector_ids?.[0]))
  const prov = [
    scandal.is_verified ? (es ? 'Verificado' : 'Verified') : (es ? 'Sin verificar' : 'Unverified'),
    scandal.ground_truth_case_id != null ? (es ? 'caso de entrenamiento del modelo' : 'model training case') : null,
  ].filter(Boolean).join(' · ')
  const rows: Array<[string, ReactNode]> = [
    [es ? 'Folio' : 'File', <span className="ct-mono">{folio(scandal.id)}</span>],
    [es ? 'Tipo' : 'Type', <><span className="ct-sq" aria-hidden="true" style={{ ['--c' as string]: CASE_FRAUD_TYPE_COLORS[scandal.fraud_type] ?? CASE_FRAUD_TYPE_COLORS.other }} />{fraudLabel(scandal.fraud_type, lang)}</>],
    [es ? 'Sexenio' : 'Administration', sexenioLabel(scandal, lang)],
    ...(sector ? [[es ? 'Sector' : 'Sector', <EntityIdentityChip type="sector" id={sector.id} name={es ? sector.name : sector.nameEN} variant="name" />] as [string, ReactNode]] : []),
    [es ? 'Años de los contratos' : 'Contract years', <span className="ct-mono">{s ? (e && e !== s ? `${s}–${e}` : s) : '—'}</span>],
    [es ? 'Descubierto' : 'Uncovered', <span className="ct-mono">{scandal.discovery_year ?? '—'}{gap?.open ? (es ? ` · ${gap.years} años sin resolución firme` : ` · ${gap.years} years without disposition`) : ''}</span>],
    [es ? 'Pérdida documentada' : 'Documented loss', <span className="ct-mono">{amount == null ? (es ? 'sin monto documentado' : 'no documented amount') : low != null && high != null && low !== high ? `${formatCompactMXN(low)} – ${formatCompactMXN(high)}` : formatCompactMXN(amount)}</span>],
    ['COMPRANET', `${es ? 'Cobertura' : 'Coverage'} ${vis.label[lang].toLowerCase()}`],
    [es ? 'Procedencia' : 'Provenance', prov],
  ]
  return (
    <section className="cd-facts" aria-labelledby="cd-facts-h">
      <h2 id="cd-facts-h" className="cd-kicker">{es ? 'Ficha del expediente' : 'Case record'}</h2>
      <dl>
        {rows.map(([k, v]) => (
          <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
        ))}
      </dl>
    </section>
  )
}

// ─── Actors ─────────────────────────────────────────────────────────────────

function ActorList({ actors, linkedVendors, lang }: { actors: KeyActor[]; linkedVendors: LinkedVendor[]; lang: Lang }) {
  const es = lang === 'es'
  const ROLE_LABEL: Record<string, { en: string; es: string }> = {
    vendor: { en: 'Vendor', es: 'Proveedor' },
    official: { en: 'Official', es: 'Funcionario' },
    institution: { en: 'Institution', es: 'Institución' },
    journalist: { en: 'Journalist', es: 'Periodista' },
  }
  return (
    <div className="ct-table-wrap">
      <table className="ct-table ct-stack">
        <ListHead lang={lang} cols={[COL.name, { key: 'role', es: 'Papel', en: 'Role' }, { key: 'note', es: 'Cargo y nota', en: 'Position and note' }]} />
        <tbody>
          {actors.map((actor, i) => {
            const match = actor.role === 'vendor'
              ? linkedVendors.find((v) => normalizeVendorName(v.vendor_name) === normalizeVendorName(actor.name))
              : undefined
            const note = es ? actor.note_es : actor.note
            return (
              <tr key={`${actor.name}-${i}`} className="ct-row">
                <td className="ct-key">
                  {match?.vendor_id != null
                    ? <EntityIdentityChip type="vendor" id={match.vendor_id} name={actor.name} variant="name" size="inherit" fullName />
                    : (es && actor.name_es) || actor.name}
                  {actor.role === 'vendor' && match?.vendor_id == null && (
                    <small>{es ? 'sin registro COMPRANET' : 'no COMPRANET record'}</small>
                  )}
                </td>
                <TextCell>{ROLE_LABEL[actor.role]?.[lang] ?? actor.role}</TextCell>
                <td className="ls-txt">
                  {/* Titles are authored in Spanish; notes in English with a Spanish `note_es` twin. */}
                  {actor.title && <span lang="es" className="cd-title">{(es && actor.title_es) || actor.title}</span>}
                  {note && <span lang={lang} className="cd-sub">{note}</span>}
                  {!actor.title && !note && '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── Sources — with their provenance type ───────────────────────────────────

function SourceList({ sources, lang }: { sources: ScandalSource[]; lang: Lang }) {
  const es = lang === 'es'
  const TYPE_LABEL: Record<string, { en: string; es: string }> = {
    journalism: { en: 'Journalism', es: 'Periodismo' },
    audit: { en: 'Audit', es: 'Auditoría' },
    legal: { en: 'Legal', es: 'Documento legal' },
    academic: { en: 'Academic', es: 'Académico' },
    official: { en: 'Official', es: 'Oficial' },
    report: { en: 'Report', es: 'Informe' },
  }
  return (
    <div className="ct-table-wrap">
      <table className="ct-table ct-stack">
        <ListHead lang={lang} cols={[{ key: 'source', es: 'Fuente', en: 'Source' }, { ...COL.fraud, es: 'Tipo', en: 'Type' }, { key: 'outlet', es: 'Medio', en: 'Outlet' }, COL.date]} />
        <tbody>
          {sources.map((s, i) => (
            <tr key={`${s.title}-${i}`} className="ct-row">
              <td className="ct-key">
                {s.url
                  ? <a href={safeHttpUrl(s.url)} target="_blank" rel="noopener noreferrer" className="ct-link">{s.title}<span className="sr-only"> {es ? '(abre en otra pestaña)' : '(opens in a new tab)'}</span></a>
                  : s.title}
              </td>
              <TextCell>{TYPE_LABEL[s.type]?.[lang] ?? s.type}</TextCell>
              <TextCell>{s.outlet || '—'}</TextCell>
              <NumCell label={es ? 'fecha' : 'date'}>{s.date || '—'}</NumCell>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Main page ──────────────────────────────────────────────────────────────

export default function CaseDossier() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const { i18n } = useTranslation()
  const lang: Lang = i18n.language?.startsWith('es') ? 'es' : 'en'
  const es = lang === 'es'

  const validSlug = typeof slug === 'string' && slug.length > 0

  const { data: scandal, isLoading, isError } = useQuery({
    queryKey: ['case-dossier', slug],
    queryFn: () => caseLibraryApi.getBySlug(slug!),
    enabled: validSlug,
    staleTime: 10 * 60 * 1000,
    retry: false,
  })

  // Full docket — severity-in-archive context + related cases.
  // Same key as the index's unfiltered list, so it is usually cache-warm.
  const { data: allCases } = useQuery({
    queryKey: ['cases', 'list', {}],
    queryFn: () => caseLibraryApi.getAll({}),
    staleTime: 5 * 60 * 1000,
  })

  // El Hilo — prev / next follow the order the index published.
  const nav = useSiblingNav('case', slug, '/cases', es ? 'Casos' : 'Cases')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      if (e.key === '[' && nav.prevTo) navigate(nav.prevTo)
      if (e.key === ']' && nav.nextTo) navigate(nav.nextTo)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [nav.prevTo, nav.nextTo, navigate])

  const severityDistribution = useMemo(() => {
    const dist: Record<number, number> = {}
    for (const c of allCases ?? []) dist[c.severity] = (dist[c.severity] ?? 0) + 1
    return dist
  }, [allCases])

  const casesCrumb = { label: es ? 'Casos' : 'Cases', to: nav.backTo || '/cases' }
  const shell = (title: string, body: ReactNode) => (
    <article className="ct ct-page ct-sheet case-page" data-frame>
      <div className="ct-wrap">
        <DocHead trail={[casesCrumb, { label: title }]} />
        {body}
      </div>
    </article>
  )

  if (!validSlug || isError || (!isLoading && !scandal)) {
    return shell(es ? 'Caso no encontrado' : 'Case not found', (
      <Cover
        title={es ? 'Caso no encontrado' : 'Case not found'}
        lede={<>{es ? 'Este expediente no existe o ya no está publicado. ' : 'This case file does not exist or is no longer published. '}<Link to="/cases" className="ct-link">{es ? 'Volver a los casos' : 'Back to the cases'}</Link></>}
      />
    ))
  }

  // Loading: reserve the cover's geometry (DESIGN.md §7), no spinner.
  if (isLoading || !scandal) {
    return shell('…', (
      <div className="cd-hold" aria-busy="true">
        <span className="sr-only" role="status">{es ? 'Cargando el expediente…' : 'Loading the case file…'}</span>
      </div>
    ))
  }

  const name = es && scandal.name_es ? scandal.name_es : scandal.name_en
  const summary = (es && scandal.summary_es ? scandal.summary_es : scandal.summary_en) ?? ''
  // the head's h1 is the summary's first sentence (the finding); the rest reads under it, beside the facts.
  // No short first sentence: the case name is the h1 and the whole summary the lede.
  const split = splitFinding(summary)

  const vendors = scandal.linked_vendors ?? []
  const verified = vendors.filter((v) => v.match_method !== 'orphaned_no_match' && v.match_method !== 'placeholder_case_label')
  const linkedContracts = verified.reduce((a, v) => a + (v.contract_count ?? 0), 0)
  const amount = scandal.amount_mxn_high ?? scandal.amount_mxn_low ?? null
  const ghostVendors = (scandal.key_actors ?? []).filter(
    (a) => a.role === 'vendor' && !vendors.some((v) => normalizeVendorName(v.vendor_name) === normalizeVendorName(a.name)),
  )
  const totalCases = Object.values(severityDistribution).reduce((a, b) => a + b, 0)
  const graver = Object.entries(severityDistribution).filter(([lvl]) => Number(lvl) > scandal.severity).reduce((a, [, n]) => a + n, 0)
  const related = relatedCases(scandal, allCases)
  const linkedIds = [...verified].filter((v) => v.vendor_id != null).sort((a, b) => (b.contract_count ?? 0) - (a.contract_count ?? 0))
  const caseSectorId = scandal.sector_id ?? scandal.sector_ids?.[0] ?? null
  const visLabel = visibilityMeta(scandal.compranet_visibility).label[lang].toLowerCase()
  // The case window the backend counts linked contracts in (cases.py: contract_year BETWEEN start AND end).
  const years = scandal.contract_year_start
    ? (scandal.contract_year_end && scandal.contract_year_end !== scandal.contract_year_start ? `${scandal.contract_year_start}–${scandal.contract_year_end}` : String(scandal.contract_year_start))
    : null
  // A zero is never shown bare: say why the register holds no contract for this case (CRITIQUE 2026-10-28 §4b).
  const unmatched = vendors.length - verified.length
  const noContractsWhy = es
    ? verified.length === 0
      ? (vendors.length ? `ninguna de las ${vendors.length} empresas del expediente coincide aún con el registro de proveedores` : 'el expediente aún no tiene empresas vinculadas al registro')
      : `${unmatched ? `${unmatched} de ${vendors.length} empresas sin coincidencia en el registro; ` : ''}${verified.length === 1 ? 'la vinculada no tiene' : `las ${verified.length} vinculadas no tienen`} contratos en ${years ?? 'los años del caso'}`
    : verified.length === 0
      ? (vendors.length ? `none of the file's ${vendors.length} companies matches the supplier registry yet` : 'the file has no companies linked to the registry yet')
      : `${unmatched ? `${unmatched} of ${vendors.length} companies unmatched in the registry; ` : ''}${verified.length === 1 ? 'the linked one has' : `the ${verified.length} linked have`} no contracts in ${years ?? 'the case years'}`

  return (
    <DossierOriginProvider value={{ route: `/cases/${scandal.slug}`, label: name }}>
      <MotionConfig reducedMotion="user">
        <article className="ct ct-page ct-sheet case-page" data-frame>
          <div className="ct-wrap">
            <PageHead lang={lang} crumbs={[casesCrumb, { label: name }]}
              actions={nav.hasContext ? (
                <span className="cd-step">
                  {nav.prevTo ? <Link to={nav.prevTo} aria-keyshortcuts="[">‹ {es ? 'Anterior' : 'Previous'}</Link> : <span aria-hidden="true">‹ {es ? 'Anterior' : 'Previous'}</span>}
                  <span className="ct-mono">{nav.index + 1} / {nav.total}</span>
                  {nav.nextTo ? <Link to={nav.nextTo} aria-keyshortcuts="]">{es ? 'Siguiente' : 'Next'} ›</Link> : <span aria-hidden="true">{es ? 'Siguiente' : 'Next'} ›</span>}
                </span>
              ) : undefined}
              kicker={split ? name : undefined}
              finding={split ? split[0] : name} />

            <Cover fullLede lede={split ? split[1] : summary || null} side={<CaseFacts scandal={scandal} lang={lang} />}>
              <Outcome scandal={scandal} summary={summary} allCases={allCases} lang={lang} />
            </Cover>

            <section className="ct-clauses" aria-labelledby="cd-cl-h">
              <h2 id="cd-cl-h">{es ? 'En cifras' : 'In figures'}</h2>
              <div className="ct-cl-grid">
                <Clause
                  id="cd-loss"
                  title={es ? 'Pérdida documentada' : 'Documented loss'}
                  fig={amount != null ? formatCompactMXN(amount) : '—'}
                  note={amount == null
                    ? (es ? 'las fuentes no documentan un monto' : 'the sources document no amount')
                    : es ? 'según las fuentes citadas' : `per the cited sources, ≈${formatCompactUSD(amount)}`}
                />
                <Clause
                  id="cd-vendors"
                  title={es ? 'Proveedores vinculados' : 'Vendors linked'}
                  fig={formatNumber(verified.length)}
                  count={{ value: verified.length, format: (n) => formatNumber(Math.round(n)) }}
                  note={es ? 'con coincidencia verificada en el registro' : 'with a verified registry match'}
                />
                <Clause
                  id="cd-contracts"
                  title={es ? `Sus contratos en COMPRANET${years ? `, ${years}` : ''}` : `Their COMPRANET contracts${years ? `, ${years}` : ''}`}
                  fig={linkedContracts > 0 ? formatNumber(linkedContracts) : '—'}
                  count={linkedContracts > 0 ? { value: linkedContracts, format: (n) => formatNumber(Math.round(n)) } : undefined}
                  note={linkedContracts > 0
                    ? (es ? `cobertura ${visLabel}: un piso, no un total` : `${visLabel} coverage: a floor, not a total`)
                    : noContractsWhy}
                />
                <Clause
                  id="cd-severity"
                  title={es ? 'Gravedad' : 'Severity'}
                  fig={String(scandal.severity)}
                  unit={es ? `de ${SEVERITY_MAX}` : `of ${SEVERITY_MAX}`}
                  ruler={{ value: scandal.severity / SEVERITY_MAX, mode: 'fill', color: RISK_COLORS.critical, ends: ['0', totalCases ? (es ? `${graver} de ${totalCases} casos son más graves` : `${graver} of ${totalCases} cases are graver`) : '', String(SEVERITY_MAX)] }}
                />
              </div>
            </section>

            {(scandal.key_actors ?? []).length > 0 && (
              <Section id="cd-actores" title={es ? 'Los actores' : 'The actors'} aside={es ? `${scandal.key_actors.length} en el expediente` : `${scandal.key_actors.length} in the file`}>
                <ActorList actors={scandal.key_actors} linkedVendors={vendors} lang={lang} />
              </Section>
            )}

            <Section id="cd-proveedores" title={es ? 'Los proveedores vinculados' : 'The linked vendors'} aside={es ? `${verified.length} con registro` : `${verified.length} on record`}>
              {vendors.length > 0 || ghostVendors.length > 0
                ? <LinkedVendorList vendors={vendors} ghostActors={ghostVendors} years={years} lang={lang} />
                : <p>{es ? 'Sin proveedores vinculados al expediente en la base de casos documentados.' : 'No vendors linked to this file in the documented-case base.'}</p>}
              <CompranetVisibilityBanner scandal={scandal} lang={lang} />
            </Section>

            {(scandal.sources ?? []).length > 0 && (
              <Section id="cd-fuentes" title={es ? 'Las fuentes' : 'The sources'} aside={es ? `${scandal.sources.length} citadas` : `${scandal.sources.length} cited`}>
                <SourceList sources={scandal.sources} lang={lang} />
              </Section>
            )}

            {related.length > 0 && (
              <Section id="cd-relacionados" title={es ? 'Casos relacionados' : 'Related cases'} aside={<Link to="/cases" className="ct-link">{es ? `Ver los ${allCases?.length ?? ''} casos` : `See all ${allCases?.length ?? ''} cases`}</Link>}>
                <KeepReadingFooter current={scandal} allCases={allCases} lang={lang} />
              </Section>
            )}

            <Conexiones
              lang={lang}
              sectorId={caseSectorId}
              vendors={linkedIds.map((v) => ({ id: v.vendor_id as number, name: v.vendor_name }))}
              focos={linkedIds.length ? { to: `/aria?ids=${linkedIds.map((v) => v.vendor_id).join(',')}`, label: es ? `Buscar sus ${formatNumber(linkedIds.length)} proveedores en la fila de investigación` : `Look up its ${formatNumber(linkedIds.length)} vendors in the investigation queue` } : null}
              cases={related.map((c) => ({ slug: c.slug, name: es ? c.name_es : c.name_en }))}
              contracts={linkedIds.length === 1 ? { to: `/contracts?vendor_id=${linkedIds[0].vendor_id}`, count: linkedIds[0].contract_count } : null}
              mapa={caseSectorId != null ? cieloHref({ lens: 'sectors', pin: caseSectorId }) : null}
            />

            <p className="ct-foot cd-method">
              {es
                ? 'Casos compilados de periodismo de investigación, auditorías de la ASF y procesos judiciales públicos. Los vínculos a proveedores se construyen por coincidencia de RFC, ID de proveedor o nombre; el método de cada vínculo aparece al pasar el cursor sobre su papel. La presencia en este archivo no constituye una determinación de culpabilidad. '
                : "Cases compiled from investigative journalism, ASF audits and public judicial proceedings. Vendor links are built by RFC, vendor ID or name match; hover a vendor's role to see its method. Inclusion in this archive is not a determination of guilt. "}
              <Link to="/methodology" className="ct-link">{es ? 'Metodología' : 'Methodology'}</Link>
            </p>
          </div>
        </article>
      </MotionConfig>
    </DossierOriginProvider>
  )
}
