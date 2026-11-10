/**
 * Configuración / Settings — a tool page (Operate mode) on «El Contrato» (DESIGN.md §5, §5.1).
 *
 * kit/PageHead (h1 = the page) → THE OBJECT: three tabs (general ·
 * export · data quality) and the active panel, at full measure → «En cifras» (the
 * database counts) → foot «Declaraciones» (what the page is, the platform note).
 * Lists are `.ct-table`; buttons are outlined `.ct-chip`; shares are RuledBar.
 */
import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Download, Loader2 } from 'lucide-react'
import { formatNumber, formatCompactMXN, formatDualCurrency } from '@/lib/utils'
import { dataQualityBand, dataQualityLetterOf, dataQualityLevel, dataQualityWord, type DataQualityBand } from '@/lib/tiers'
import { CATEGORICAL, RAMP_INK, RISK_COLORS, CURRENT_MODEL_VERSION } from '@/lib/constants'
import { analysisApi, exportApi, contractApi, sectorApi, statsApi } from '@/api/client'
import { PageHead } from '@/components/kit/PageHead'
import { Clause } from '@/components/contrato/Clause'
import { RuledBar } from '@/components/contrato/RuledBar'
import '@/components/settings/settings.css'

interface DatabaseStats {
  total_contracts: number
  total_vendors: number
  total_institutions: number
  total_value_mxn: number
  year_range: string
  database_name: string
  data_source: string
}

const EXPORT_LIMITS = { contracts: 10000, vendors: 10000 }

const TABS = ['general', 'export', 'quality'] as const
type TabId = (typeof TABS)[number]

const SEVERITY: Record<string, string> = {
  critical: RISK_COLORS.critical, high: RISK_COLORS.high, medium: RISK_COLORS.medium, low: 'var(--color-text-muted)',
}

const SEV_ES: Record<string, string> = { critical: 'crítica', high: 'alta', medium: 'media', low: 'baja' }
const SEV_EN: Record<string, string> = { critical: 'critical', high: 'high', medium: 'medium', low: 'low' }

/** Quality bands on the ink ramp (a scale, not categories): darker = better quality. */
const BAND_INK: Record<DataQualityBand, string> = { high: RAMP_INK[4], medium: RAMP_INK[2], low: RISK_COLORS.high }

function useEs() {
  const { i18n } = useTranslation()
  return !i18n.language.startsWith('en')
}

function useDbStats() {
  return useQuery<DatabaseStats>({
    queryKey: ['stats', 'database'],
    queryFn: () => statsApi.getDatabase() as Promise<DatabaseStats>,
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
  })
}

/** A plain section (DESIGN.md §5): ink rule · h2 · body. */
function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section className="ct-section" aria-labelledby={id}>
      <div className="ct-annex-row"><h2 id={id} className="ct-h2">{title}</h2></div>
      <div className="ct-section-body st-body">{children}</div>
    </section>
  )
}

export function Settings() {
  const { t } = useTranslation('settings')
  const es = useEs()
  const [searchParams, setSearchParams] = useSearchParams()
  const raw = searchParams.get('tab')
  const activeTab: TabId = (TABS as readonly string[]).includes(raw ?? '') ? (raw as TabId) : 'general'
  const { data: stats } = useDbStats()

  const setActiveTab = (tab: TabId) => {
    const next = new URLSearchParams(searchParams)
    if (tab === 'general') next.delete('tab')
    else next.set('tab', tab)
    setSearchParams(next, { replace: true })
  }

  return (
    <article className="ct ct-page ct-sheet st-page" data-frame>
      <div className="ct-wrap">
        <PageHead lang={es ? 'es' : 'en'} crumbs={[{ label: es ? 'Plataforma' : 'Platform' }, { label: es ? 'Configuración' : 'Settings' }]}
          finding={t('pageTitle')} />

        <div className="st-object" data-object>
          <div className="ct-tabs" role="tablist" aria-label={t('pageTitle')}>
            {TABS.map((id) => (
              <button
                key={id}
                type="button"
                role="tab"
                id={`st-tab-${id}`}
                aria-selected={activeTab === id}
                aria-controls={`st-panel-${id}`}
                tabIndex={activeTab === id ? 0 : -1}
                onClick={() => setActiveTab(id)}
                onKeyDown={(e) => {
                  if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
                  const i = TABS.indexOf(activeTab) + (e.key === 'ArrowRight' ? 1 : -1)
                  const next = TABS[(i + TABS.length) % TABS.length]
                  setActiveTab(next)
                  document.getElementById(`st-tab-${next}`)?.focus()
                }}
              >
                {t(`tabs.${id}`)}
              </button>
            ))}
          </div>
          <div role="tabpanel" id={`st-panel-${activeTab}`} aria-labelledby={`st-tab-${activeTab}`} className="st-panel">
            {activeTab === 'general' && <GeneralTab />}
            {activeTab === 'export' && <ExportTab />}
            {activeTab === 'quality' && <DataQualityTab />}
          </div>
        </div>

        <section className="ct-clauses" aria-labelledby="st-cl-h">
          <h2 id="st-cl-h">{es ? 'En cifras' : 'In figures'}</h2>
          <div className="ct-cl-grid">
            <Clause id="st-cl-1" title={es ? 'Contratos en la base' : 'Contracts in the database'}
              fig={stats ? formatNumber(stats.total_contracts) : '—'}
              note={stats?.year_range ? `${stats.year_range.replace('-', '–')} · ${stats.data_source}` : undefined} />
            <Clause id="st-cl-2" title={es ? 'Proveedores' : 'Vendors'} fig={stats ? formatNumber(stats.total_vendors) : '—'} />
            <Clause id="st-cl-3" title={es ? 'Instituciones compradoras' : 'Buying institutions'} fig={stats ? formatNumber(stats.total_institutions) : '—'} />
            <Clause id="st-cl-4" title={es ? 'Valor contratado' : 'Contracted value'} fig={stats ? formatDualCurrency(stats.total_value_mxn) : '—'}
              note={es ? 'contratos de más de 100 mil millones excluidos' : 'contracts above 100B MXN excluded'} />
          </div>
        </section>

        <Section id="st-declara" title={es ? 'Declaraciones' : 'Declarations'}>
          <p>{t('pageDescription')}.</p>
          <p>{t('general.about.description')}</p>
          <p className="ct-note">
            {es
              ? `Modelo de riesgo ${CURRENT_MODEL_VERSION}, ElasticNet global · taxonomía de 12 sectores · FastAPI + SQLite · React + TypeScript. Las puntuaciones son indicadores de riesgo, no pruebas.`
              : `Risk model ${CURRENT_MODEL_VERSION}, global ElasticNet · 12-sector taxonomy · FastAPI + SQLite · React + TypeScript. Scores are risk indicators, not proof.`}
          </p>
        </Section>
      </div>
    </article>
  )
}

// ─── General ────────────────────────────────────────────────────────────────

function GeneralTab() {
  const { t } = useTranslation('settings')
  const es = useEs()
  const { data: stats, isLoading, error, refetch } = useDbStats()
  const v = (x: string | undefined) => (isLoading ? '…' : x ?? '—')
  const rows: Array<[string, string]> = [
    [t('general.dataInfo.database'), v(stats?.database_name)],
    [t('general.dataInfo.totalContracts'), v(stats ? formatNumber(stats.total_contracts) : undefined)],
    [t('general.dataInfo.totalVendors'), v(stats ? formatNumber(stats.total_vendors) : undefined)],
    [t('general.dataInfo.totalInstitutions'), v(stats ? formatNumber(stats.total_institutions) : undefined)],
    [t('general.dataInfo.totalValue'), v(stats ? formatCompactMXN(stats.total_value_mxn) : undefined)],
    [t('general.dataInfo.timeRange'), v(stats?.year_range?.replace('-', '–'))],
    [t('general.dataInfo.source'), v(stats?.data_source)],
    [es ? 'Modelo de riesgo' : 'Risk model', CURRENT_MODEL_VERSION],
  ]
  return (
    <div className="st-body">
      <div className="st-bar">
        <p>{t('general.dataInfo.description')}</p>
        <button type="button" className="ct-chip" onClick={() => void refetch()} disabled={isLoading}>
          {t('general.dataInfo.refreshLabel')}
        </button>
      </div>
      {error ? (
        <p className="ct-note" role="alert">{t('general.dataInfo.loadError')}</p>
      ) : (
        <dl className="st-facts" aria-busy={isLoading}>
          {rows.map(([k, val]) => (
            <div key={k}><dt>{k}</dt><dd className="ct-mono">{val}</dd></div>
          ))}
        </dl>
      )}
    </div>
  )
}

// ─── Export ─────────────────────────────────────────────────────────────────

function getTimestamp() {
  return new Date().toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '_')
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function escapeCSV(val: unknown): string {
  if (val === null || val === undefined) return ''
  const str = String(val)
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str
}

function ExportTab() {
  const { t } = useTranslation('settings')
  const es = useEs()
  const [busy, setBusy] = useState<string | null>(null)
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null)

  const run = useCallback(async (key: string, label: string, job: () => Promise<number | void>) => {
    setBusy(key)
    setStatus(null)
    try {
      const n = await job()
      setStatus({ ok: true, msg: es ? `Descargado: ${label}${typeof n === 'number' ? ` (${formatNumber(n)} filas)` : ''}.` : `Downloaded: ${label}${typeof n === 'number' ? ` (${formatNumber(n)} rows)` : ''}.` })
    } catch (e) {
      setStatus({ ok: false, msg: `${es ? 'La exportación falló' : 'Export failed'}: ${e instanceof Error ? e.message : '—'}` })
    } finally {
      setBusy(null)
    }
  }, [es])

  const jobs: Array<{ key: string; title: string; desc: string; rows: string; format: string; job: () => Promise<number | void> }> = [
    {
      key: 'contracts', title: t('export.contracts.title'), desc: t('export.contracts.description'),
      rows: `≤ ${formatNumber(EXPORT_LIMITS.contracts)}`, format: 'CSV',
      job: async () => downloadBlob(await exportApi.exportContracts({ per_page: EXPORT_LIMITS.contracts }), `contracts_${getTimestamp()}.csv`),
    },
    {
      key: 'vendors', title: t('export.vendors.title'), desc: t('export.vendors.description'),
      rows: `≤ ${formatNumber(EXPORT_LIMITS.vendors)}`, format: 'CSV',
      job: async () => downloadBlob(await exportApi.exportVendors({ per_page: EXPORT_LIMITS.vendors }), `vendors_${getTimestamp()}.csv`),
    },
    {
      key: 'critical', title: es ? 'Contratos con indicador crítico' : 'Critical-indicator contracts',
      desc: es ? 'Los 100 primeros contratos con indicador de riesgo crítico, con proveedor, institución y monto' : 'The first 100 contracts at the critical risk indicator, with vendor, institution and amount',
      rows: '100', format: 'CSV',
      job: async () => {
        const result = await contractApi.getAll({ risk_level: 'critical', per_page: 100, page: 1 })
        const rows = Array.isArray(result.data) ? result.data : []
        if (!rows.length) throw new Error(es ? 'sin contratos críticos' : 'no critical contracts')
        const headers = ['id', 'vendor_name', 'institution_name', 'amount_mxn', 'risk_score', 'risk_level', 'contract_date', 'sector_id'] as const
        const csv = [headers.join(','), ...rows.map((r) => headers.map((h) => escapeCSV((r as unknown as Record<string, unknown>)[h])).join(','))].join('\n')
        downloadBlob(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }), `rubli_critical_contracts_${getTimestamp()}.csv`)
        return rows.length
      },
    },
    {
      key: 'sectors', title: es ? 'Resumen por sector' : 'Sector summary',
      desc: es ? 'Los 12 sectores con contratos, montos y distribución del indicador de riesgo' : 'The 12 sectors with contracts, values and risk-indicator distribution',
      rows: '12', format: 'JSON',
      job: async () => downloadBlob(new Blob([JSON.stringify(await sectorApi.getAll(), null, 2)], { type: 'application/json' }), `rubli_sector_summary_${getTimestamp()}.json`),
    },
  ]

  return (
    <div className="st-body">
      <div className="ct-table-wrap">
        <table className="ct-table">
          <caption className="sr-only">{t('tabs.export')}</caption>
          <thead>
            <tr>
              <th scope="col">{es ? 'Conjunto' : 'Dataset'}</th>
              <th scope="col">{es ? 'Contenido' : 'Contents'}</th>
              <th scope="col" className="num">{es ? 'Filas' : 'Rows'}</th>
              <th scope="col" className="num">{es ? 'Descargar' : 'Download'}</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((j) => (
              <tr key={j.key}>
                <td className="font-semibold nowrap">{j.title}</td>
                <td>{j.desc}</td>
                <td className="num">{j.rows}</td>
                <td className="num">
                  <button type="button" className="ct-chip" disabled={busy !== null} onClick={() => void run(j.key, j.title, j.job)}
                    aria-label={`${es ? 'Descargar' : 'Download'} ${j.title} ${j.format}`}>
                    {busy === j.key ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Download aria-hidden="true" />}
                    {j.format}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="ct-note" role="status" aria-live="polite">
        {status
          ? status.msg
          : es
            ? `${t('export.limitsTitle')}: hasta ${formatNumber(EXPORT_LIMITS.contracts)} filas por archivo. Para más, usa la API pública o el conjunto abierto en Los datos.`
            : `${t('export.limitsTitle')}: up to ${formatNumber(EXPORT_LIMITS.contracts)} rows per file. For more, use the public API or the open dataset in The data.`}
      </p>
    </div>
  )
}

// ─── Data quality ───────────────────────────────────────────────────────────

const BAND_TEXT: Record<DataQualityBand, { r: string; es: string; en: string }> = {
  high: { r: '75–100', es: 'Calidad alta: casi todos los campos críticos presentes, fechas validadas, datos consistentes', en: 'High data quality: almost all critical fields present, validated dates, consistent data' },
  medium: { r: '60–74', es: 'Calidad media: faltan algunos campos; puede haber inconsistencias de fecha o monto', en: 'Medium data quality: some missing fields; may have date or amount inconsistencies' },
  low: { r: '0–59', es: 'Calidad baja: faltan campos críticos; confiabilidad limitada o inservible para la mayoría de los análisis', en: 'Low data quality: critical fields missing; limited reliability, unfit for most analyses' },
}
const BAND_ORDER: DataQualityBand[] = ['high', 'medium', 'low']

function DataQualityTab() {
  const es = useEs()
  const loc = es ? 'es-MX' : 'en-US'
  const { data, isLoading, error } = useQuery({
    queryKey: ['data-quality'],
    queryFn: () => analysisApi.getDataQuality(),
    staleTime: Infinity,
    gcTime: 60 * 60 * 1000,
    retry: 1,
  })

  if (isLoading) return <div className="st-body"><div className="ct-hold-ledger st-hold" aria-busy="true" /></div>
  if (error || !data) return <p className="ct-note" role="alert">{es ? 'No se pudieron cargar las métricas de calidad.' : 'Data quality metrics failed to load.'}</p>
  if (!data.last_calculated && data.grade_distribution.length === 0) {
    return <p className="ct-note">{es ? `Métricas aún no calculadas para ${formatNumber(data.total_contracts)} contratos.` : `Metrics not yet computed for ${formatNumber(data.total_contracts)} contracts.`}</p>
  }

  const lang = es ? 'es' : 'en'
  const level = dataQualityLevel(dataQualityLetterOf(data.overall_score), lang)
  const pctOf = (b: DataQualityBand) => data.grade_distribution.filter((g) => dataQualityBand(g.grade) === b).reduce((a, g) => a + g.percentage, 0)
  const highPct = pctOf('high')
  return (
    <div className="st-body">
      <dl className="st-facts st-facts-4">
        <div><dt>{es ? 'Puntuación global' : 'Overall score'}</dt><dd className="st-fig">{data.overall_score.toFixed(1)}<small>{es ? `calidad ${level}` : `${level} quality`}</small></dd></div>
        <div><dt>{es ? 'Contratos evaluados' : 'Contracts assessed'}</dt><dd className="st-fig">{formatNumber(data.total_contracts)}</dd></div>
        <div><dt>{es ? 'Registros de calidad alta' : 'High-quality records'}</dt><dd className="st-fig">{highPct.toFixed(1)}<small>%</small></dd></div>
        <div><dt>{es ? 'Problemas señalados' : 'Issues flagged'}</dt><dd className="st-fig">{data.key_issues.length}</dd></div>
      </dl>
      {data.last_calculated && (
        <p className="ct-note">{es ? 'Calculado' : 'Computed'} {new Date(data.last_calculated).toLocaleString(loc)}</p>
      )}

      <div className="st-stack">
        <div>
          <h3 className="ct-annex-h">{es ? 'Registros por nivel de calidad' : 'Records by quality level'}</h3>
          <div className="ct-rb-compact">
            <RuledBar
              label={es ? 'Parte de los registros por nivel de calidad' : 'Share of records by quality level'}
              ticks={[0, 50, 100].map((k) => ({ label: `${k}%`, at: k / 100 }))}
              rows={BAND_ORDER.map((b) => ({
                name: <>{dataQualityWord(b === 'high' ? 'A' : b === 'medium' ? 'C' : 'F', lang)}</>,
                share: pctOf(b) / 100,
                value: `${pctOf(b).toFixed(1)}%`,
                color: BAND_INK[b] ?? CATEGORICAL[7],
              }))}
            />
          </div>
        </div>
        <div>
          <h3 className="ct-annex-h">{es ? 'Puntuación por periodo de CompraNet' : 'Score by CompraNet period'}</h3>
          <div className="ct-rb-compact">
            <RuledBar
              label={es ? 'Puntuación media de calidad por estructura' : 'Mean quality score by structure'}
              ticks={[0, 50, 100].map((k) => ({ label: String(k), at: k / 100 }))}
              rows={data.by_structure.map((s) => ({
                name: <>{es ? 'Estructura' : 'Structure'} {s.structure}<small>{s.years.replace('-', '–')} · RFC {s.rfc_coverage}%</small></>,
                share: s.avg_quality_score / 100,
                value: s.avg_quality_score.toFixed(1),
                color: RAMP_INK[4],
              }))}
            />
          </div>
        </div>
      </div>

      <h3 className="st-h3">{es ? 'Campos completos' : 'Field completeness'}</h3>
      <div className="ct-table-wrap">
        <table className="ct-table">
          <caption className="sr-only">{es ? 'Porcentaje de registros con cada campo' : 'Share of records with each field'}</caption>
          <thead>
            <tr>
              <th scope="col">{es ? 'Campo' : 'Field'}</th>
              <th scope="col" className="num">{es ? 'Completos' : 'Filled'}</th>
              <th scope="col" className="num">{es ? 'Vacíos' : 'Empty'}</th>
            </tr>
          </thead>
          <tbody>
            {data.field_completeness.map((f) => (
              <tr key={f.field_name}>
                <td>{f.field_name}</td>
                <td className="num">{f.fill_rate.toFixed(1)}%</td>
                <td className="num">{f.null_count.toLocaleString(loc)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="st-h3">{es ? 'Problemas señalados' : 'Issues flagged'}</h3>
      {data.key_issues.length === 0 ? (
        <p className="ct-note">{es ? 'Sin problemas críticos detectados.' : 'No critical issues detected.'}</p>
      ) : (
        <div className="ct-table-wrap">
          <table className="ct-table">
            <caption className="sr-only">{es ? 'Problemas de calidad' : 'Quality issues'}</caption>
            <thead>
              <tr>
                <th scope="col">{es ? 'Campo' : 'Field'}</th>
                <th scope="col">{es ? 'Severidad' : 'Severity'}</th>
                <th scope="col">{es ? 'Descripción' : 'Description'}</th>
                <th scope="col" className="num">{es ? 'Registros' : 'Records'}</th>
              </tr>
            </thead>
            <tbody>
              {data.key_issues.map((k, i) => (
                <tr key={`${k.field}-${i}`}>
                  <td className="font-semibold">{k.field}</td>
                  <td className="nowrap"><span className="ct-sq" style={{ ['--c' as string]: SEVERITY[k.severity] ?? 'var(--color-text-muted)' }} aria-hidden="true" />{(es ? SEV_ES : SEV_EN)[k.severity] ?? k.severity}</td>
                  <td>{k.description}</td>
                  <td className="num">{k.affected_count.toLocaleString(loc)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h3 className="st-h3">{es ? 'Cómo leer la calidad de los datos' : 'How to read data quality'}</h3>
      <div className="ct-table-wrap">
        <table className="ct-table">
          <caption className="sr-only">{es ? 'Niveles de calidad' : 'Quality levels'}</caption>
          <thead>
            <tr>
              <th scope="col">{es ? 'Nivel' : 'Level'}</th>
              <th scope="col">{es ? 'Puntuación' : 'Score'}</th>
              <th scope="col">{es ? 'Significado' : 'Meaning'}</th>
            </tr>
          </thead>
          <tbody>
            {BAND_ORDER.map((g) => (
              <tr key={g}>
                <td className="font-semibold">{es ? { high: 'Alta', medium: 'Media', low: 'Baja' }[g] : { high: 'High', medium: 'Medium', low: 'Low' }[g]}</td>
                <td className="mono nowrap">{BAND_TEXT[g].r}</td>
                <td>{es ? BAND_TEXT[g].es : BAND_TEXT[g].en}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default Settings
