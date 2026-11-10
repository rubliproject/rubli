/**
 * AriaCase — one case of Focos Rojos at /aria/caso/:vendorId (owner 2026-10-27: «the same new
 * template for vendors and institutions» + «a graphic like the map in the aria cases»).
 *
 *   A case leads with the case, the vendor page with the record (CRITIQUE 2026-10-28 §2: the two
 *   shared a head and readers looped). Each links to the other once: here «El expediente completo →»
 *   in the band, there the tier note in its head.
 *   PageHead    Registro › Focos Rojos › Nivel N › name · kicker = name · h1 = the case (tier · priority · pattern)
 *   Cover       (no h1) the IPS ledger, no risk band | orbit + external signals
 *   CaseBand    the IPS ledger first (how the priority adds up), then disposition · pattern · what the
 *               model reads · memo · the analyst's verdict (components/aria/CaseBand)
 *   Expediente  «El expediente por sexenios» + «La lectura», with the case's facts (indicator crosses
 *               0.60, documented case) and claims (lib/aria/caseLayer) on top
 *   (no «En cifras»: the vendor's figures live on its dossier)
 *
 * The queue keeps its density: the row stays one line, RowExpand stays the compact breakdown, and
 * its «Abrir el caso →» lands here. A vendor outside the queue has no case: it goes to its dossier.
 * /aria is noindex by prefix (lib/seo/routeMeta NOINDEX_PREFIXES), so /aria/caso/* stays out of search and the sitemap.
 */
import { useCallback, useMemo } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { ariaApi, contractApi } from '@/api/client'
import { gateQueries } from '@/hooks/useVendorData'
import { vendorCategoriesQuery } from '@/api/entityQueries'
import { Conexiones } from '@/components/contrato/Conexiones'
import { cieloHref } from '@/lib/vista'
import { SECTORS } from '@/lib/constants'
import { useAuth } from '@/contexts/AuthContext'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { DocHead } from '@/components/contrato/DocHead'
import { PageHead } from '@/components/kit/PageHead'
import { VendorCover } from '@/components/vendor/VendorCover'
import { CapturaDoor } from '@/components/captura/CapturaDoor'
import { Expediente, VendorOrbit, useVendorInstitutionsTimeline } from '@/components/vendor/VendorExpediente'
import { CaseBand, CaseSignals } from '@/components/aria/CaseBand'
import { IpsLedger } from '@/components/aria/IpsLedger'
import { patternLabels } from '@/components/atlas/sky/expediente-adapter'
import { caseClaims, caseFacts, caseYear } from '@/lib/aria/caseLayer'
import { formatEntityName } from '@/lib/entity/format'
import { buildExpediente } from '@/lib/vendor/expediente'
import { boardClaim, boardPins } from '@/lib/aria/tablero'
import { ElTablero } from '@/components/aria/ElTablero'
import { formatCompactMXN, formatDate } from '@/lib/utils'
import type { Expediente as ExpedienteModel } from '@/lib/vendor/expediente'
import '@/components/vendor/vendor.css'
import '@/components/aria/aria.css'
import '@/components/aria/case.css'

/** API titles arrive UPPERCASE; the board never shouts. */
const sentenceCase = (x: string) => (/[a-záéíóúñ]/.test(x) ? x : x.charAt(0) + x.slice(1).toLowerCase())

export default function AriaCase() {
  const { vendorId: raw } = useParams<{ vendorId: string }>()
  const id = Number(raw)
  const ok = Number.isFinite(id) && id > 0
  const { i18n, t } = useTranslation()
  const lang: 'en' | 'es' = i18n.language?.startsWith('es') ? 'es' : 'en'
  const en = lang === 'en'
  const isAnalyst = useAuth().user?.is_admin === true

  const g = gateQueries(id)
  const vendor = useQuery({ ...g.vendor, enabled: ok })
  const aria = useQuery({ ...g.aria, enabled: ok, retry: false })
  const gt = useQuery({ ...g.groundTruthStatus, enabled: ok })
  const waterfall = useQuery({ ...g.waterfall, enabled: ok })
  // same key + fetcher as RowExpand / AriaMemoPanel: opening the memo is a cache hit; null on 404
  const memo = useQuery({ queryKey: ['aria-memo', id], queryFn: () => ariaApi.getMemo(id), staleTime: 600_000, enabled: ok })
  const timeline = useVendorInstitutionsTimeline(id)
  const cats = useQuery({ ...vendorCategoriesQuery(id), enabled: ok, retry: false })

  // «El tablero»: the supplier's three largest contracts (the board's last column)
  const tops = useQuery({
    queryKey: ['aria-case', id, 'top-contracts'],
    queryFn: () => contractApi.getAll({ vendor_id: id, per_page: 3, sort_by: 'amount_mxn', sort_order: 'desc' }),
    enabled: ok, staleTime: 600_000, retry: false,
  })

  const v = vendor.data
  const item = aria.data
  const cases = gt.data?.cases ?? []
  const cy = caseYear(cases[0])
  const extend = useCallback((m: ExpedienteModel) => ({
    facts: caseFacts(m, { caseYear: cy }),
    claims: caseClaims(m, item, (p, l) => patternLabels(l)[p] ?? p),
  }), [cy, item])

  const pins = useMemo(() => {
    // the board waits for every source, so it lays out once (no shift when a column arrives)
    if (!v || !item || timeline.isLoading || tops.isLoading || waterfall.isLoading || gt.isLoading) return []
    const m = timeline.data ? buildExpediente(timeline.data) : null
    const c0 = cases[0]
    return boardPins({
      lanes: (m?.lanes ?? []).map((l) => ({ id: l.id, name: l.name, siglas: l.siglas, share: l.share })),
      gtCase: gt.data?.is_known_bad && c0 ? { name: c0.case_name, type: c0.case_type, typeLabel: t(`common:caseLeadDialog.fraudTypes.${c0.case_type}`, { defaultValue: c0.case_type }).toLowerCase(), from: c0.year_start ?? cy, to: c0.year_end ?? null, slug: c0.scandal_slug ?? null } : null,
      patterns: item.pattern_confidences,
      patternName: (p) => (patternLabels(lang)[p] ?? p).toLowerCase(),
      drivers: (waterfall.data?.items ?? []).map((x) => ({ feature: x.feature, contribution: x.contribution, label: en ? x.label_en : x.label_es })),
      contracts: (tops.data?.data ?? []).map((c) => ({ id: c.id, title: sentenceCase(c.title ?? ''), amount: Number(c.amount_mxn ?? 0), date: c.contract_date ?? null })),
      vendorTotal: Number(v.total_value_mxn ?? 0),
      fmtMoney: formatCompactMXN, fmtDate: formatDate,
      instName: (s) => formatEntityName('institution', s, 'md'),
    }, lang)
  }, [v, item, timeline.data, timeline.isLoading, cases, gt.data, gt.isLoading, cy, waterfall.data, waterfall.isLoading, tops.data, tops.isLoading, lang, en, t])

  useDocumentTitle(v ? `${formatEntityName('vendor', v.name, 'full')} · ${en ? 'ARIA case' : 'caso ARIA'} — RUBLI` : null)

  if (!ok || aria.isError) return <Navigate to={ok ? `/vendors/${id}` : '/aria'} replace />
  if (!v || !item) {
    return (
      <article className="ct ct-page ct-sheet">
        <div className="ct-wrap" aria-busy="true" style={{ minHeight: 900 }}>
          <DocHead trail={[{ label: en ? 'Red Flags' : 'Focos Rojos', to: '/aria' }, { label: `#${id}` }]} />
          {vendor.isError && <p role="alert" className="ct-note">{en ? 'The record did not answer. Try again.' : 'El registro no respondió. Vuelva a intentarlo.'}</p>}
        </div>
      </article>
    )
  }

  return (
    <article className="ct ct-page ct-sheet">
      <div className="ct-wrap">
        <PageHead lang={lang}
          crumbs={[
            { label: en ? 'Red Flags' : 'Focos Rojos', to: '/aria' },
            { label: en ? `Tier ${item.ips_tier}` : `Nivel ${item.ips_tier}`, to: `/aria?tier=${item.ips_tier}` },
            { label: formatEntityName('vendor', v.name, 'sm') },
          ]}
          kicker={formatEntityName('vendor', v.name, 'full')}
          finding={en
            ? <>Tier {item.ips_tier} of the investigation queue, priority {item.ips_final.toFixed(2)} of 1{item.primary_pattern ? <>, pattern {item.primary_pattern} · {(patternLabels(lang)[item.primary_pattern] ?? '').toLowerCase()}</> : null}. A priority indicator orders the review; it is not proof.</>
            : <>Nivel {item.ips_tier} de la fila de investigación, prioridad {item.ips_final.toFixed(2)} de 1{item.primary_pattern ? <>, patrón {item.primary_pattern} · {(patternLabels(lang)[item.primary_pattern] ?? '').toLowerCase()}</> : null}. La prioridad ordena la revisión; no es una prueba.</>} />

        <VendorCover
          headless
          className="ac-cover"
          vendor={v}
          aria={item}
          ariaTier={item.ips_tier}
          isGroundTruth={!!gt.data?.is_known_bad}
          caseName={cases[0]?.case_name ?? null}
          band={false}
          lang={lang}
          side={<>
            {!(timeline.isError || (timeline.isSuccess && !timeline.data.years.length)) && (
              <VendorOrbit data={timeline.data} vendorId={id} className="ac-orbit" lang={lang} />
            )}
            <CaseSignals item={item} cases={cases} lang={lang} />
          </>}
        >
          <div className="ac-lead"><IpsLedger item={item} lang={lang} /></div>
          <CapturaDoor vendorId={id} lang={lang} />
        </VendorCover>

        <CaseBand item={item} factors={waterfall.data?.items} hasMemo={!!memo.data} isAnalyst={isAnalyst} lang={lang} />

        {pins.length > 0 && (
          <section className="ac-board" aria-labelledby="ac-board-h">
            <h2 id="ac-board-h" className="vd-h3">{en ? '§ The board' : '§ El tablero'}<span className="ct-mono">{en ? 'every fact of the case, tied to the supplier' : 'cada hecho del caso, atado al proveedor'}</span></h2>
            {boardClaim(pins, lang) && <p className="ac-board-claim">{boardClaim(pins, lang)}</p>}
            <ElTablero
              pins={pins}
              lang={lang}
              centre={{
                name: `${formatEntityName('vendor', v.name, 'md')}${item.persona_fisica ? (en ? ' (individual)' : ' (persona física)') : ''}`,
                sub: `${en ? 'Tier' : 'Nivel'} ${item.ips_tier}${item.primary_pattern ? ` · ${item.primary_pattern}` : ''} · ${en ? 'mean indicator' : 'indicador medio'} ${Number(v.avg_risk_score ?? 0).toFixed(2)}`,
              }}
            />
          </section>
        )}

        {!timeline.isError && (
          <Expediente data={timeline.data} loading={timeline.isLoading} contractsHref={`/contracts?vendor_id=${id}`} extend={extend} lang={lang} />
        )}

        <Conexiones
          lang={lang}
          sectorId={v.primary_sector_id ?? SECTORS.find((x) => x.code === v.primary_sector_name?.toLowerCase())?.id}
          categories={(cats.data?.categories ?? []).map((c) => ({ id: c.category_id, name: en ? c.name_en : c.name_es }))}
          institutions={(v.top_institutions ?? []).map((i) => ({ id: i.institution_id, name: i.institution_name }))}
          focos={item.primary_pattern ? { to: `/aria?pattern=${item.primary_pattern}&tier=all`, label: en ? `Every case with ${item.primary_pattern}` : `Todos los casos con ${item.primary_pattern}` } : null}
          pattern={item.primary_pattern}
          cases={cases.filter((c) => c.scandal_slug).map((c) => ({ slug: c.scandal_slug ?? '', name: c.case_name }))}
          contracts={{ to: `/contracts?vendor_id=${id}`, count: v.total_contracts }}
          mapa={cieloHref({ planet: id })}
        />
      </div>
    </article>
  )
}
