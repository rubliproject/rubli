/**
 * /administrations — «Sexenios» (owner 2026-11-08: «make files the main one… put the bio first. Not the big chart»).
 *
 *   Page head = the government picker: Fox · Calderón · Peña Nieto · López Obrador · Sheinbaum · Todos
 *   One government (default Sheinbaum, ?g=):
 *     bio (portrait, party, dates, short bio) · its figures in small type
 *     § I   La disección          — its money by sector; a sector opens into its categories + doors
 *     § II  La desviación sectorial — sector risk vs the term's own average
 *     § III El expediente         — documented scandals + key events
 *     § IV  Los beneficiarios     — the top-100 ledger
 *     § V   Los compradores       — the agencies that spent the most
 *   Todos (?vista=todos): La columna + the pattern, direct award by term, the survivors, the period comparison.
 */

import { useDataCut } from '@/lib/useDataCut'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ViewSwitch } from '@/components/kit/ViewSwitch'
import { FootNotes } from '@/components/kit/FootNotes'
import { PageHead } from '@/components/kit/PageHead'
import { PageQuestion } from '@/components/kit/PageQuestion'
import { LaColumna } from '@/components/administrations/columna/LaColumna'
import { Retrato, metaOf, termDates } from '@/components/administrations/columna/Perfil'
import { ComparePeriodView } from '@/components/administrations/ComparePeriodView'
import { AdminSurvivorsSlope, type SurvivorColumn } from '@/components/administrations/AdminSurvivorsSlope'
import { SeamStrip, type SeamPoint, type SeamAdmin, type Seam } from '@/components/administrations/SeamStrip'
import { AdminSectorDeviation } from '@/components/administrations/AdminSectorDeviation'
import { ExpedienteSpine } from '@/components/administrations/ExpedienteSpine'
import { AdminVendorsDeepList } from '@/components/administrations/AdminVendorsDeepList'
import { AdminBuyersSection } from '@/components/administrations/AdminBuyersSection'
import { AdminDiseccion, sectorLabel } from '@/components/administrations/AdminDiseccion'
import { useAdminScandals } from '@/components/administrations/useAdminScandals'
import {
  ADMINISTRATIONS,
  ADMIN_DISPLAY_NAMES,
  DATA_LAST_YEAR,
  DOSSIER_DATA,
  termRange,
} from '@/components/administrations/data'
import type { AdminAgg } from '@/components/administrations/types'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { formatDualCurrency, formatNumber } from '@/lib/utils'
import { SECTORS, CURRENT_MODEL_VERSION, MODEL_AUC, MODEL_AUC_LABEL, DATA_CUT_YEAR, PROCEDURE_TYPE_FIRST_YEAR } from '@/lib/constants'
import { formatCut } from '@/lib/nav/toc'
import { analysisApi, categoriesApi, gapApi } from '@/api/client'
import type { YearOverYearChange } from '@/api/types'
import { TableExportButton } from '@/components/TableExportButton'
import { ShareButton } from '@/components/ShareButton'
import { TERM_SLUGS, backendKeyOf, termKey, type TermSlug } from '@/lib/sexenios/columna'
import { findingHalf, findingTop, sectorsOf, type CubeRow } from '@/lib/sexenios/diseccion'

import { BoardList } from '@/components/kit/BoardList'
import '@/components/administrations/administrations.css'
import '@/components/administrations/columna/columna.css'
// =============================================================================
// Constants
// =============================================================================

// Map AdminName to backend era key
const ERA_KEYS: Record<string, string> = {
  Fox: 'fox',
  Calderon: 'calderon',
  'Pena Nieto': 'pena_nieto',
  AMLO: 'amlo',
  Sheinbaum: 'sheinbaum',
}

// =============================================================================
// Helpers
// =============================================================================


/** Contract-weighted share over rows whose share is known: 2002–2010 (Structure A) carry no procedure
 *  type, so their direct-award / single-bid shares are null and must not count as 0 (DQ1 § 2). */
function knownShare<K extends string>(rows: ReadonlyArray<{ contracts: number } & { [k in K]?: number | null }>, key: K): number | null {
  let n = 0
  let s = 0
  for (const r of rows) {
    const v = r[key]
    if (v == null) continue
    n += r.contracts
    s += v * r.contracts
  }
  return n ? s / n : null
}
function aggregateByAdmin(yoyData: YearOverYearChange[]): AdminAgg[] {
  return ADMINISTRATIONS.map((admin) => {
    const years = yoyData.filter(
      (y) => y.year >= admin.dataStart && y.year <= admin.end
    )
    const totalContracts = years.reduce((s, y) => s + y.contracts, 0)
    const totalValue = years.reduce((s, y) => s + y.total_value, 0)
    const yearCount = years.length || 1
    const weightedRisk = totalContracts > 0
      ? years.reduce((s, y) => s + y.avg_risk * y.contracts, 0) / totalContracts
      : 0
    const weightedDA = knownShare(years, 'direct_award_pct')
    const weightedSB = knownShare(years, 'single_bid_pct')
    const weightedHR = totalContracts > 0
      ? years.reduce((s, y) => s + y.high_risk_pct * y.contracts, 0) / totalContracts
      : 0
    const maxVendors = years.length > 0 ? Math.max(...years.map((y) => y.vendor_count)) : 0
    const maxInst = years.length > 0 ? Math.max(...years.map((y) => y.institution_count)) : 0

    return {
      name: admin.name,
      contracts: totalContracts,
      totalValue,
      avgRisk: weightedRisk,
      directAwardPct: weightedDA,
      singleBidPct: weightedSB,
      highRiskPct: weightedHR,
      valueAtRisk: totalValue * weightedHR / 100,
      vendorCount: maxVendors,
      institutionCount: maxInst,
      years,
      contractsPerYear: totalContracts / yearCount,
      valuePerYear: totalValue / yearCount,
      yearCount,
    }
  })
}

/** URL-friendly slug for ?admin= deep links: "Pena Nieto" → "pena-nieto". */
const adminSlug = (name: string) => name.toLowerCase().replace(/\s+/g, '-')

/** Chapter head for § I–V: kicker (SC), h3, one-line dek, actions at the right edge. */
function ChapterHead({
  numeral, es, en, isEs, adminTag, tagColor, headline, dek, actions,
}: {
  numeral: string; es: string; en: string; isEs: boolean; adminTag: string; tagColor: string
  headline: ReactNode; dek?: ReactNode; actions?: ReactNode
}) {
  return (
    <div className="adm-ch-head">
      <div className="min-w-0 flex-1">
        <p className="adm-kicker">
          § {numeral} · {isEs ? es : en}
          <span className="adm-tag"><span className="ct-sq" style={{ ['--c' as string]: tagColor }} aria-hidden="true" />{adminTag}</span>
        </p>
        <h3 className="adm-h3">{headline}</h3>
        {dek && <p className="adm-dek">{dek}</p>}
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </div>
  )
}

/** Act head: an ink rule, then the h2 with its act in small caps (DESIGN.md §5 sections). */
function ActHead({ id, numeral, title }: { id: string; numeral: string; title: string }) {
  return (
    <div className="ct-annex-row">
      <h2 id={id} className="ct-h2 scroll-mt-4"><span className="ct-sc">{numeral}</span> {title}</h2>
    </div>
  )
}

/** The three payloads every view reads (react-query shares the cache between the two views). */
function useAdminData() {
  const yoy = useQuery({ queryKey: ['analysis', 'year-over-year'], queryFn: () => analysisApi.getYearOverYear(), staleTime: 5 * 60 * 1000, retry: false })
  const sy = useQuery({ queryKey: ['analysis', 'sector-year-breakdown'], queryFn: () => analysisApi.getSectorYearBreakdown(), staleTime: 5 * 60 * 1000, retry: false })
  const br = useQuery({ queryKey: ['analysis', 'admin-breakdown'], queryFn: () => analysisApi.getAdminBreakdown(), staleTime: 60 * 60 * 1000, retry: false })
  const yoyData = useMemo(() => yoy.data?.data ?? [], [yoy.data])
  const adminAggs = useMemo(() => aggregateByAdmin(yoyData), [yoyData])
  const allTimeAvg = useMemo(() => {
    const total = yoyData.reduce((s, y) => s + y.contracts, 0)
    if (total === 0) return { da: null, sb: null, hr: 0, risk: 0 }
    return {
      da: knownShare(yoyData, 'direct_award_pct'),
      sb: knownShare(yoyData, 'single_bid_pct'),
      hr: yoyData.reduce((s, y) => s + y.high_risk_pct * y.contracts, 0) / total,
      risk: yoyData.reduce((s, y) => s + y.avg_risk * y.contracts, 0) / total,
    }
  }, [yoyData])
  return { yoy, sy, br, yoyData, adminAggs, allTimeAvg }
}

const FULL: Record<TermSlug, string> = { fox: 'Fox', calderon: 'Calderón', 'pena-nieto': 'Peña Nieto', amlo: 'López Obrador', sheinbaum: 'Sheinbaum' }
type Pick = TermSlug | 'todos'
const NO_ROWS: CubeRow[] = []

/**
 * The file on ONE government (owner 2026-11-08: «make files the main one… just put the bio first. Not the big chart»).
 * Picker (page head) → bio → its figures in small type → § I the dissection → § II–V the existing chapters.
 * Nothing on this view compares the five governments; that lives in «Todos».
 */
function GovernmentFile({ slug, switcher }: { slug: TermSlug; switcher: ReactNode }) {
  const cut = useDataCut()
  const { t, i18n } = useTranslation('administrations')
  const { t: ts } = useTranslation('sectors')
  const isEs = i18n.language?.startsWith('es') ?? false
  const lang = isEs ? 'es' : 'en'
  const L = (es: string, en: string) => (isEs ? es : en)
  const { yoy, sy, br, adminAggs } = useAdminData()
  const selectedMeta = metaOf(slug)
  const selectedAdmin = selectedMeta.name
  const selectedAgg = adminAggs.find((a) => a.name === selectedAdmin)
  const scandals = useAdminScandals(selectedAdmin)
  const who = FULL[slug]
  const open = slug === 'sheinbaum'
  const sx = termKey(backendKeyOf(slug)) ?? 'fox'
  // El apagón (post-CompraNet awards read off the published rulings): one line on the open term, never a panel
  const gap = useQuery({ queryKey: ['gap-summary'], queryFn: () => gapApi.getSummary(), staleTime: 60 * 60 * 1000, retry: false, enabled: open })
  const cube = useQuery({ queryKey: ['categories', 'cube'], queryFn: () => categoriesApi.getCategoryCube(), staleTime: 3_600_000, retry: 1 })
  const cubeRows = (cube.data?.rows ?? NO_ROWS) as CubeRow[]
  const sectors = useMemo(() => sectorsOf(cubeRows, sx), [cubeRows, sx])
  const sectorName = (id: number) => sectorLabel(id, lang)
  const finding = findingTop(sectors, who, sectorName, lang, open)

  const sectorYearData = sy.data?.data ?? []
  const eraExtras = useMemo(() => {
    const era = (br.data?.eras ?? []).find((e) => e.era === ERA_KEYS[selectedAdmin])
    return { gtCaseCount: era?.gt_case_count }
  }, [br.data, selectedAdmin])
  const sectorHeatmap = useMemo(() => {
    if (sectorYearData.length === 0) return []
    const filtered = sectorYearData.filter((r) => r.year >= selectedMeta.dataStart && r.year <= selectedMeta.end)
    return SECTORS.map((sector) => {
      const rows = filtered.filter((r) => r.sector_id === sector.id)
      const n = rows.reduce((s, r) => s + r.contracts, 0)
      return {
        sectorId: sector.id, name: ts(sector.code), color: sector.color, contracts: n,
        da: n ? knownShare(rows, 'direct_award_pct') ?? 0 : 0,
        sb: n ? knownShare(rows, 'single_bid_pct') ?? 0 : 0,
        hr: n ? rows.reduce((s, r) => s + r.high_risk_pct * r.contracts, 0) / n : 0,
        risk: n ? rows.reduce((s, r) => s + r.avg_risk * r.contracts, 0) / n : 0,
      }
    })
  }, [sectorYearData, selectedMeta, ts])

  const folderColor = selectedMeta.color
  const selectedDisplay = ADMIN_DISPLAY_NAMES[selectedAdmin] ?? selectedAdmin
  const adminTag = `${selectedDisplay} · ${termRange(selectedMeta)}`
  const half = findingHalf(sectors, lang)
  const fmtPct = (v: number | null) => (v == null ? '—' : `${v.toLocaleString(isEs ? 'es-MX' : 'en-US', { maximumFractionDigits: 1 })} %`)

  const head = (
    <>
      <PageHead lang={lang}
        crumbs={[{ label: L('Sexenios', 'Administrations'), to: '/administrations?vista=todos' }, { label: who }]}
        kicker={open ? L('El gobierno en curso', 'The government in office') : L('Un gobierno', 'One government')}
        meta={<span className="inline-flex flex-wrap items-center gap-x-3">
          <span>{L('Corte', 'Cut-off')} <b>{formatCut(cut, lang)}</b> · {L('Modelo', 'Model')} {CURRENT_MODEL_VERSION}</span>
          <ShareButton label={t('share', 'Share')} />
        </span>}
        finding={<span aria-live="polite">{finding ?? (cube.isError ? L('El desglose no cargó.', 'The breakdown did not load.') : L('Cargando el expediente…', 'Loading the file…'))}</span>}
        question={L('¿Qué compró este gobierno, a quién y cómo?', 'What did this government buy, from whom, and how?')} />
      {/* the government picker = the first element under the head (owner 11-08/09); the tour control rides on its row */}
      <PageQuestion lang={lang} findingAt=".ph-finding"
        question={switcher}
        targets={['.adm-bio', '#adm-dis-t']}
        cues={{ bio: '.adm-bio', figs: '.adm-figs', dis: '#adm-dis-t' }}
        script={isEs
          ? `### 1\n[#bio] Primero, quién gobernó y cuándo. [#figs] Debajo, sus cifras: cuántos contratos y cuánto dinero.\n### 2\n[#dis] Luego, la disección: el dinero de ${who}, sector por sector. Toque un monto y el sector se abre.`
          : `### 1\n[#bio] First, who governed and when. [#figs] Under it, the figures: how many contracts and how much money.\n### 2\n[#dis] Then the dissection: ${who}'s money, sector by sector. Tap an amount and the sector opens.`}
        means={finding} />
    </>
  )

  if (yoy.isLoading || yoy.isError || (!yoy.isLoading && adminAggs.every((a) => a.contracts === 0))) {
    return (
      <article className="ct ct-page ct-sheet adm-page" aria-busy={yoy.isLoading || undefined}>
        <div className="ct-wrap">
          {head}
          {!yoy.isLoading && <p className="ct-note" role="alert">{t('loadError', 'Data unavailable')}. {t('loadErrorDetail', 'The server may be temporarily unavailable. Administration data will appear once the connection is restored.')}</p>}
          {yoy.isLoading && <div className="adm-hold" aria-hidden="true" />}
        </div>
      </article>
    )
  }

  const figs: [string, string][] = selectedAgg ? [
    [L('Contratos', 'Contracts'), formatNumber(selectedAgg.contracts)],
    [L('Monto', 'Amount'), formatDualCurrency(selectedAgg.totalValue)],
    [L('Sin concurso', 'No tender'), selectedAgg.directAwardPct == null ? '—' : `${fmtPct(selectedAgg.directAwardPct)} ${L('de los contratos', 'of contracts')}`],
    [L('Un solo adjudicado', 'Single award'), selectedAgg.singleBidPct == null ? '—' : `${fmtPct(selectedAgg.singleBidPct)} ${L('de los concursos', 'of tenders')}`],
    [L('Riesgo alto o crítico', 'High or critical risk'), `${fmtPct(selectedAgg.highRiskPct)} ${L('de los contratos', 'of contracts')}`],
  ] : []

  return (
    <article className="ct ct-page ct-sheet adm-page">
      <div className="ct-wrap">
        {head}

        {/* The bio first (owner 11-08), then the term's own figures in small type — no tiles, no deltas */}
        <section className="adm-bio" aria-labelledby="adm-bio-h">
          <div className="adm-bio-top">
          <header className="sxc-bio">
            <Retrato slug={slug} size={72} lang={lang} />
            <div>
              <h2 id="adm-bio-h" tabIndex={-1}>{selectedMeta.fullName}</h2>
              <p className="sxc-bio-meta">{selectedMeta.party} · {termDates(slug, lang)}</p>
            </div>
          </header>
          <p className="adm-bio-text" lang={lang}>{t(`dossier.contexts.${DOSSIER_DATA[selectedAdmin].contextKey}`)}</p>
          </div>
          {figs.length > 0 && (
            <dl className="adm-figs" aria-label={L(`Las cifras de ${who}`, `${who} in figures`)}>
              {figs.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
              <div><dt>{L('Casos documentados', 'Documented cases')}</dt><dd>{scandals.length ? <a href="#expediente" className="ct-link">{formatNumber(scandals.length)}</a> : '0'}</dd></div>
            </dl>
          )}
          <p className="adm-bio-note">{slug === 'fox'
            ? L(`Registro débil: antes de ${PROCEDURE_TYPE_FIRST_YEAR} no se anotaba si hubo concurso, y el indicador de riesgo queda bajo.`, `A weak record: before ${PROCEDURE_TYPE_FIRST_YEAR} tendering was not recorded, and the risk indicator runs low.`)
            : open
              ? L(`En curso. Cuenta desde 2025: CompraNet hasta el 28 sep. 2025 y ComprasMX, que se traslapan en 2025; corte ${formatCut(cut, 'es')}.`, `In office. Counted from 2025: CompraNet to 28 Sep 2025 and ComprasMX, which overlap in 2025; cut-off ${formatCut(cut, 'en')}.`)
              : L(`Cada año cuenta para el presidente que gobernó la mayor parte de él (${termRange(selectedMeta)}).`, `Each year counts for the president who governed most of it (${termRange(selectedMeta)}).`)}</p>
          {open && gap.data?.available && <p className="adm-bio-note">{L(
            `Fuera de estas cifras y del modelo: ${formatNumber(gap.data.total_contracts)} procedimientos posteriores al cierre, recuperados de los fallos publicados.`,
            `Outside these figures and the model: ${formatNumber(gap.data.total_contracts)} later procedures, recovered from the published rulings.`)}</p>}
        </section>

        {/* § I · La disección — the term's money cut like /sectors/:id cuts a sector */}
        <section className="adm-chapter" aria-labelledby="adm-dis-h">
          <div className="adm-ch-head">
            <div className="min-w-0 flex-1">
              <p className="adm-kicker">§ I · {L('La disección', 'The dissection')}
                <span className="adm-tag"><span className="ct-sq" style={{ ['--c' as string]: folderColor }} aria-hidden="true" />{adminTag}</span>
              </p>
              <h3 id="adm-dis-h" className="adm-h3">{half ?? (cube.isError ? L('El desglose no cargó.', 'The breakdown did not load.') : '…')}</h3>
              <p className="adm-dek">{L('Cada fila, un sector y su dinero. Toque el monto: se abre en sus compras.', 'Each row, a sector and its money. Tap the amount: it opens into its purchases.')}</p>
            </div>
          </div>
          {cube.isLoading && <div className="adm-dis-hold" aria-busy="true" />}
          {sectors.length > 0 && <AdminDiseccion sectors={sectors} rows={cubeRows} sx={sx} who={who} lang={lang} />}
          <p className="ct-note">{L('Pesos de cada año. Sin concurso: parte de los contratos adjudicados sin competir (se anota desde 2011).', 'Pesos of each year. No tender: share of contracts awarded without competition (recorded since 2011).')}</p>
        </section>

        {/* § II · La desviación sectorial */}
        <div className="adm-chapter">
          <ChapterHead
            numeral="II" es="La desviación sectorial" en="The sector deviation" isEs={isEs} adminTag={adminTag} tagColor={folderColor}
            headline={isEs ? `Qué sectores corrieron por encima del propio promedio de ${selectedDisplay}` : `Which sectors ran hotter than ${selectedDisplay}'s own average`}
            dek={isEs ? 'Desviación del alto riesgo de cada sector frente al promedio del sexenio: no un semáforo, una medida.' : "Each sector's high-risk rate against the term's own average: not a traffic light, a measure."}
            actions={
              <TableExportButton
                filename="rubli-administraciones-sectores.csv"
                data={sectorHeatmap.filter((s) => s.contracts > 0).map((s) => ({
                  sector: s.name,
                  [isEs ? 'adj_directa_pct' : 'direct_award_pct']: s.da.toFixed(1) + '%',
                  [isEs ? 'lic_unica_pct' : 'single_bid_pct']: s.sb.toFixed(1) + '%',
                  [isEs ? 'alto_riesgo_pct' : 'high_risk_pct']: s.hr.toFixed(1) + '%',
                  [isEs ? 'riesgo_prom' : 'avg_risk']: (s.risk * 100).toFixed(1) + '%',
                }))}
              />
            }
          />
          <AdminSectorDeviation
            rows={sectorHeatmap.map((s) => ({ sectorId: s.sectorId, name: s.name, color: s.color, hrFraction: s.hr / 100, daPct: s.da, contracts: s.contracts }))}
            termBenchmarkFraction={(selectedAgg?.highRiskPct ?? 0) / 100} isEs={isEs} />
        </div>

        {/* § III · El expediente — chronological case-file spine */}
        <div className="adm-chapter" id="expediente">
          <ChapterHead
            numeral="III" es="El expediente" en="The case file" isEs={isEs} adminTag={adminTag} tagColor={folderColor}
            headline={t('keyEvents', { admin: selectedDisplay, start: selectedMeta.dataStart, end: selectedMeta.end > DATA_LAST_YEAR ? '' : selectedMeta.end })}
            dek={t('keyEventsSubtitle')}
            actions={eraExtras.gtCaseCount != null && (
              <p className="ct-note">{formatNumber(eraExtras.gtCaseCount)} {isEs ? 'casos etiquetados (la mayoría surgidos del modelo)' : 'labelled cases (most surfaced by the model)'}</p>
            )}
          />
          <ExpedienteSpine adminName={selectedAdmin} isEs={isEs} gtCaseCount={eraExtras.gtCaseCount} events={HARDCODED_EVENTS[selectedAdmin] ?? []} />
        </div>

        {/* § IV · Los beneficiarios — the top-100 ledger */}
        <div className="adm-chapter">
          <ChapterHead
            numeral="IV" es="Los beneficiarios" en="The beneficiaries" isEs={isEs} adminTag={adminTag} tagColor={folderColor}
            headline={t('vendorSection.subtitle')}
            dek={isEs ? 'Los 100 mayores, ordenables por valor, riesgo o contratos.' : 'The top 100, sortable by value, risk, or contracts.'}
          />
          <div id="beneficiarios-100">
            <AdminVendorsDeepList era={ERA_KEYS[selectedAdmin]} isEs={isEs} selectedDisplay={selectedDisplay} />
          </div>
        </div>

        {/* § V · Los compradores — who signed: the reverse of § IV */}
        <div className="adm-chapter" id="compradores">
          <ChapterHead
            numeral="V" es="Los compradores" en="The buyers" isEs={isEs} adminTag={adminTag} tagColor={folderColor}
            headline={isEs ? 'Las dependencias que más gastaron' : 'The agencies that spent the most'}
            dek={isEs ? 'El reverso de los beneficiarios: quién firmó los contratos.' : 'The flip side of the beneficiaries: who signed the contracts.'}
          />
          <AdminBuyersSection era={ERA_KEYS[selectedAdmin]} isEs={isEs} selectedDisplay={selectedDisplay} />
        </div>

        <section className="ct-section adm-foot" aria-label={isEs ? 'Notas' : 'Notes'}>
          <FootNotes lang={lang} lead={isEs
            ? 'El alto riesgo es un indicador de riesgo del modelo, no un hallazgo: una señal es un motivo para revisar.'
            : 'High risk is a model risk indicator, not a finding: a flag is a reason to look.'} items={[
            isEs
              ? 'Pesos de cada año, sin ajustar por inflación: dentro de un gobierno no hace falta. Las comparaciones entre gobiernos están en «Todos».'
              : 'Pesos of each year, not adjusted for inflation: within one government it is not needed. Comparisons between governments are under «All».',
            isEs
              ? 'La disección cuenta el registro público por año del contrato (CompraNet y ComprasMX, que se traslapan en 2025); los contratos sin categoría (menos de 1 %) quedan fuera.'
              : 'The dissection counts the public register by contract year (CompraNet and ComprasMX, which overlap in 2025); contracts with no category (under 1%) are left out.',
            <>{isEs ? 'Fuente' : 'Source'}: CompraNet + ComprasMX 2002–{DATA_CUT_YEAR} · {isEs ? 'modelo de riesgo' : 'risk model'} {CURRENT_MODEL_VERSION} · {isEs ? MODEL_AUC_LABEL.es : MODEL_AUC_LABEL.en} {MODEL_AUC}.</>,
          ]} />
        </section>
      </div>
    </article>
  )
}

/**
 * «Todos» — everything that compares the five governments (owner 11-08: «we would make an ALL tab to see everything»):
 * La columna on top (its own head, levels ?g=&y= and footnotes), then the pattern, direct award by term, the survivors
 * and the period comparison, unchanged.
 */
function Comparisons({ onOpen }: { onOpen: (s: TermSlug) => void }) {
  const { i18n } = useTranslation('administrations')
  const isEs = i18n.language?.startsWith('es') ?? false
  const { yoyData, adminAggs, allTimeAvg, br } = useAdminData()
  const [compareOpen, setCompareOpen] = useState(false)
  if (yoyData.length === 0) return null
  const PARTY_ABBR: Record<string, string> = { PAN: 'PAN', PRI: 'PRI', MORENA: 'MOR' }
  const openAdmin = (name: string) => {
    const a = ADMINISTRATIONS.find((x) => x.name === name)
    if (a) onOpen(adminSlug(a.name) as TermSlug)
  }
  const survivorColumns: SurvivorColumn[] = ADMINISTRATIONS.map((a) => {
    const era = (br.data?.eras ?? []).find((e) => e.era === ERA_KEYS[a.name])
    return {
      adminName: a.name, displayName: ADMIN_DISPLAY_NAMES[a.name] ?? a.name, yearsLabel: termRange(a), party: a.party, color: a.color,
      seats: (era?.top_vendors ?? []).slice(0, 6).map((v) => ({ name: v.vendor_name, totalMxn: v.total_mxn, contracts: v.contracts, riskPct: (v.avg_risk ?? 0) * 100 })),
    }
  })
  const seamSeries: SeamPoint[] = [...yoyData]
    .filter((y) => y.year >= 2002 && y.year <= DATA_LAST_YEAR)
    .sort((a, b) => a.year - b.year)
    .map((y) => ({ year: y.year, highRiskPct: y.high_risk_pct }))
  const seamAdmins: SeamAdmin[] = ADMINISTRATIONS.map((a) => ({
    name: a.name, displayName: ADMIN_DISPLAY_NAMES[a.name] ?? a.name, abbr: PARTY_ABBR[a.party] ?? a.party, party: a.party, color: a.color,
    start: a.dataStart, end: Math.min(a.end, DATA_LAST_YEAR),
  }))
  const seams: Seam[] = [
    { xYear: 2006.92, fromAdmin: 'Fox', toAdmin: 'Calderon', structureA: true },
    { xYear: 2012.92, fromAdmin: 'Calderon', toAdmin: 'Pena Nieto' },
    { xYear: 2018.92, fromAdmin: 'Pena Nieto', toAdmin: 'AMLO' },
    { xYear: 2024.75, fromAdmin: 'AMLO', toAdmin: 'Sheinbaum', partial: true },
  ]
  // Direct award per term on the EU 10% mark. Only years with a coded procedure type count; Fox has none (Structure A).
  const termRows = ADMINISTRATIONS.map((a) => {
    const rows = yoyData.filter((y) => y.year >= Math.max(a.dataStart, PROCEDURE_TYPE_FIRST_YEAR) && y.year <= Math.min(a.end, DATA_LAST_YEAR))
    return { a, pct: knownShare(rows, 'direct_award_pct') }
  })
  const fmt1 = (v: number) => v.toLocaleString(isEs ? 'es-MX' : 'en-US', { maximumFractionDigits: 1 })
  return (
    <>
      <section className="ct-section" aria-labelledby="adm-seam-h">
        <ActHead id="adm-seam-h" numeral={isEs ? 'El patrón.' : 'The pattern.'} title={isEs ? 'El riesgo a través de cuatro relevos' : 'Risk across four handovers'} />
        <div className="ct-section-body adm-object">
          <SeamStrip series={seamSeries} nationalAvgPct={allTimeAvg.hr} admins={seamAdmins} seams={seams} isEs={isEs} onSelectAdmin={openAdmin} />
        </div>
      </section>

      <section className="ct-section" aria-labelledby="adm-da-h">
        <div className="ct-annex-row">
          <h2 id="adm-da-h" className="ct-h2">{isEs ? 'Adjudicación directa por sexenio' : 'Direct award by term'}</h2>
        </div>
        <div className="ct-section-body">
          <BoardList lang={isEs ? 'es' : 'en'} id="adm-da-t" label={isEs ? 'Adjudicación directa por administración' : 'Direct award by administration'}
            cols={[
              { label: isEs ? 'Gobierno' : 'Government', w: 'minmax(0, 1fr)', cls: 'bd-buyer', phone: true },
              { label: isEs ? 'Sin concurso, por número' : 'No tender, by count', w: '200px', r: true, cls: 'bl-num', phone: true },
              { label: isEs ? 'Frente al 10 % de la UE' : 'Against the EU 10%', w: '180px', r: true, cls: 'bl-num' },
            ]}
            rows={termRows.map(({ a, pct }) => ({
              key: a.name,
              cells: [
                <Link key="g" to={`/administrations?g=${adminSlug(a.name)}`}><span className="ct-sq" style={{ ['--c' as string]: a.color }} aria-hidden="true" />{ADMIN_DISPLAY_NAMES[a.name] ?? a.name}</Link>,
                pct == null ? (isEs ? 'sin dato' : 'no data') : `${fmt1(pct)} %`,
                pct == null ? '—' : `${fmt1(pct / 10)}×`,
              ],
            }))} />
          <p className="ct-note">{isEs
            ? `Parte de los contratos adjudicados sin licitación, por número, por sexenio. Fuente: COMPRANET ${PROCEDURE_TYPE_FIRST_YEAR}–${DATA_CUT_YEAR}. Fox no tiene cifra: la Estructura A no codifica el tipo de procedimiento. El Tablero UE considera insatisfactorio ≥ 10%. ${adminAggs.filter((a) => a.directAwardPct != null && a.directAwardPct > 50).length} de ${ADMINISTRATIONS.length} adjudicaron más de la mitad sin licitación.`
            : `Share of contracts awarded without a tender, by count, per term. Source: COMPRANET ${PROCEDURE_TYPE_FIRST_YEAR}–${DATA_CUT_YEAR}. Fox has no figure: Structure A did not code the procedure type. The EU scoreboard rates ≥ 10% as unsatisfactory. ${adminAggs.filter((a) => a.directAwardPct != null && a.directAwardPct > 50).length} of ${ADMINISTRATIONS.length} awarded over half without a tender.`}</p>
        </div>
      </section>

      <section className="ct-section" aria-labelledby="adm-act3">
        <ActHead id="adm-act3" numeral={isEs ? 'Los que permanecen.' : 'The ones who remain.'} title={isEs ? 'Proveedores que sobreviven al cambio de gobierno' : 'Suppliers that outlast a change of government'} />
        <div className="ct-section-body">
          <AdminSurvivorsSlope columns={survivorColumns} isEs={isEs} onSelectAdmin={openAdmin} />
        </div>
      </section>

      <section className="ct-section adm-compare">
        <button type="button" onClick={() => setCompareOpen((v) => !v)} aria-expanded={compareOpen}>
          <span className="ct-sc">{isEs ? 'Comparar dos periodos' : 'Compare two periods'}</span>
          <span className="ct-mono" aria-hidden="true">{compareOpen ? '−' : '+'}</span>
        </button>
        {compareOpen && <div className="mt-4"><ComparePeriodView /></div>}
      </section>
    </>
  )
}

// Hardcoded key events per administration — sourced from public records.
// Bilingual since 2026-06-07: `title` EN, `titleEs` ES (previously English-only,
// which leaked untranslated strings into the Spanish UI).
// `dupScandal` marks a curated event that restates an admin-scandals API case of
// that slug — ExpedienteSpine drops it when the scandal is present so §III shows
// each affair once (the case-linked scandal wins). DC4.
const HARDCODED_EVENTS: Record<string, Array<{ year: number; title: string; titleEs: string; type: 'reform' | 'scandal' | 'audit' | 'crisis'; impact: 'high' | 'medium' | 'low'; dupScandal?: string }>> = {
  Fox: [
    { year: 2002, title: 'COMPRANET launched as digital procurement platform', titleEs: 'COMPRANET se lanza como plataforma digital de contratación', type: 'reform', impact: 'medium' },
    { year: 2003, title: 'First ASF audit on widespread direct-award contracting', titleEs: 'Primera auditoría de la ASF sobre adjudicación directa generalizada', type: 'audit', impact: 'medium' },
    { year: 2005, title: 'Acquisitions Law reform — new transparency requirements', titleEs: 'Reforma a la Ley de Adquisiciones — nuevos requisitos de transparencia', type: 'reform', impact: 'medium' },
  ],
  Calderon: [
    { year: 2007, title: 'National Security Strategy launched — surge in defense contracts', titleEs: 'Estrategia Nacional de Seguridad — auge de contratos de defensa', type: 'crisis', impact: 'medium' },
    { year: 2008, title: 'Global financial crisis — federal spending contraction', titleEs: 'Crisis financiera global — contracción del gasto federal', type: 'crisis', impact: 'medium' },
    { year: 2009, title: 'AH1N1 flu: emergency procurement with minimal bidding', titleEs: 'Influenza AH1N1: compras de emergencia con licitación mínima', type: 'crisis', impact: 'high' },
    { year: 2010, title: 'PEMEX hires Odebrecht for Etileno XXI — bribery scheme begins', titleEs: 'PEMEX contrata a Odebrecht para Etileno XXI — inicia esquema de sobornos', type: 'scandal', impact: 'high', dupScandal: 'odebrecht-pemex-bribery' },
    { year: 2012, title: 'New Government Procurement Law — broadest reform in 15 years', titleEs: 'Nueva Ley de Contrataciones Públicas — la reforma más amplia en 15 años', type: 'reform', impact: 'high' },
  ],
  'Pena Nieto': [
    { year: 2014, title: 'Casa Blanca scandal — conflict of interest with contractor Grupo Higa', titleEs: 'Escándalo de la Casa Blanca — conflicto de interés con el contratista Grupo Higa', type: 'scandal', impact: 'high', dupScandal: 'grupo-higa-casa-blanca' },
    { year: 2016, title: 'Odebrecht-PEMEX investigation — bribes for infrastructure contracts', titleEs: 'Investigación Odebrecht-PEMEX — sobornos por contratos de infraestructura', type: 'scandal', impact: 'high', dupScandal: 'odebrecht-pemex-bribery' },
    { year: 2017, title: 'La Estafa Maestra: MXN 7.6B diverted through public universities', titleEs: 'La Estafa Maestra: 7,600 MDP desviados a través de universidades públicas', type: 'scandal', impact: 'high', dupScandal: 'estafa-maestra' },
    { year: 2017, title: 'September earthquakes — emergency procurement without bidding', titleEs: 'Sismos de septiembre — compras de emergencia sin licitación', type: 'crisis', impact: 'medium' },
    { year: 2018, title: 'CompraNet 5.0 reform — improved traceability', titleEs: 'Reforma CompraNet 5.0 — mejor trazabilidad', type: 'reform', impact: 'medium' },
  ],
  AMLO: [
    { year: 2019, title: 'Austerity decree — drastic reduction in service contracts', titleEs: 'Decreto de austeridad — reducción drástica de contratos de servicios', type: 'reform', impact: 'high' },
    { year: 2019, title: 'Militarization of megaprojects (AIFA, Tren Maya) — direct awards to Army', titleEs: 'Militarización de megaproyectos (AIFA, Tren Maya) — adjudicaciones directas al Ejército', type: 'reform', impact: 'high' },
    { year: 2020, title: 'COVID-19 pandemic: emergency procurement of ventilators and medicines', titleEs: 'Pandemia de COVID-19: compras de emergencia de ventiladores y medicinas', type: 'crisis', impact: 'high' },
    { year: 2021, title: 'Segalmex scandal — SFP reports MXN 2.7B diverted; ASF observed MXN 8.6B (not final)', titleEs: 'Escándalo Segalmex — la SFP reporta 2,700 MDP desviados; la ASF observó 8,636 MDP (no definitivo)', type: 'scandal', impact: 'high', dupScandal: 'segalmex-food-distribution' },
    { year: 2023, title: 'Tren Maya: FONATUR awards MXN 180M in direct contracts to Sedena', titleEs: 'Tren Maya: FONATUR adjudica 180 MDP en contratos directos a la Sedena', type: 'scandal', impact: 'medium', dupScandal: 'tren-maya-fonatur' },
  ],
  Sheinbaum: [
    { year: 2024, title: "Claudia Sheinbaum inaugurated — Mexico's first female president", titleEs: 'Claudia Sheinbaum toma posesión — primera presidenta de México', type: 'reform', impact: 'low' },
    { year: 2024, title: 'Continuation of militarized infrastructure (AIFA, Dos Bocas refinery)', titleEs: 'Continuación de la infraestructura militarizada (AIFA, refinería Dos Bocas)', type: 'reform', impact: 'medium' },
    { year: 2025, title: 'Preliminary data — analysis ongoing as records accumulate', titleEs: 'Datos preliminares — análisis en curso conforme se acumulan registros', type: 'audit', impact: 'low' },
  ],
}

// AdminSectorMatrix, PoliticalCycleView, ComparePeriodView extracted to components/administrations/ (2026-05-15).
// AdminSummaryCard / AdminTrajectory / AdminVendorBreakdown are no longer mounted here (owner 11-08: bio first, no tiles,
// no chart stack); kept on disk.

const PICK_ORDER: Pick[] = ['fox', 'calderon', 'pena-nieto', 'amlo', 'sheinbaum', 'todos']
const OLD_ADMIN = ['fox', 'calderon', 'pena-nieto', 'amlo', 'sheinbaum'] as const

/**
 * The page head IS the government picker (owner 11-08): Fox · Calderón · Peña Nieto · López Obrador · Sheinbaum · Todos.
 * Default = the government in office (Sheinbaum); ?g= picks another; ?vista=todos = everything cross-government.
 * Old links: ?vista=columna and a La columna year (?y=) land on «Todos»; ?vista=lista&admin=fox lands on Fox's file.
 */
export default function Administrations() {
  const { i18n } = useTranslation('administrations')
  const isEs = i18n.language?.startsWith('es') ?? false
  const [params, setParams] = useSearchParams()
  const vista = params.get('vista')
  const todos = vista === 'todos' || vista === 'columna' || (vista !== 'lista' && params.has('y'))
  const g = params.get('g'), admin = params.get('admin')
  const slug: TermSlug = (TERM_SLUGS as readonly string[]).includes(g ?? '') ? g as TermSlug
    : (OLD_ADMIN as readonly string[]).includes(admin ?? '') ? admin as TermSlug : 'sheinbaum'
  const pick = (k: Pick) => {
    const n = new URLSearchParams()
    if (k === 'todos') n.set('vista', 'todos')
    else if (k !== 'sheinbaum') n.set('g', k)
    setParams(n)
    window.scrollTo({ top: 0 })
    // the picker remounts with its view: keep the reader's focus on the button they pressed
    requestAnimationFrame(() => document.querySelector<HTMLElement>('.adm-pick [aria-pressed="true"]')?.focus({ preventScroll: true }))
  }
  // an old La columna link (?vista=columna, a bare ?y=) becomes ?vista=todos, so the column's own levels keep it
  useEffect(() => {
    if (todos && vista !== 'todos') setParams((p) => { const n = new URLSearchParams(p); n.set('vista', 'todos'); return n }, { replace: true })
  }, [todos, vista, setParams])
  const switcher = (
    <ViewSwitch lang={isEs ? 'es' : 'en'} value={todos ? 'todos' : slug} onChange={pick} label={isEs ? 'Gobierno' : 'Government'}
      className="adm-pick"
      views={PICK_ORDER.map((k) => ({ key: k, es: k === 'todos' ? 'Todos' : FULL[k], en: k === 'todos' ? 'All' : FULL[k] }))} />
  )
  if (todos) return <LaColumna switcher={switcher} after={<Comparisons onOpen={pick} />} />
  return <GovernmentFile key={slug} slug={slug} switcher={switcher} />
}
