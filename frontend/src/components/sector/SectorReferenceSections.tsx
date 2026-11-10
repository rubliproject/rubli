/**
 * SectorReferenceSections — the enrichment sections for the sector dossier.
 *
 * 2026-06-08 (DESIGNUS — sector data-density pass). The sector dossier sat on
 * top of more reachable data than any sibling (vendors AND institutions AND
 * categories AND cases AND an investigation queue all live under a sector) yet
 * rendered only a hero, a stat strip, a 2×2 diagnostic grid and an institution
 * table. These sections surface the prosecutorial material that was already
 * computed and instant — top vendors, the category baskets, the sexenio
 * trajectory, concentration, the model's own weights, documented cases, and the
 * ARIA queue — all in the shared folio register (mono labels, EB Garamond
 * italics, RISK_COLORS fills, dot-strip primitives, no green for low risk).
 *
 * Every section receives already-fetched data; the page owns the queries. Each
 * reuses the command primitives (Panel / EntityIdentityChip) and the local
 * FullBar / SignedBar full-width proportional bars — none reinvents chrome.
 *
 * 2026-06-08 (DESIGNUS density squadron — SLIPPY). Killed the hollow rows: the
 * fixed-width 22-dot DotBar left a void beside every row-spanning metric, so
 * each metric now uses a full-width <FullBar> that stretches its flex-1 track
 * (mirrors ExposureLedger VaRBar / OecdDeviationPanel). Category composition is
 * a full-width Upshot-style bar list; the sexenio strip and largest contracts
 * are dense full-width bar rows with EB-Garamond anchor numbers; the model
 * ladder uses diverging <SignedBar>; the case roll tiles two-up and fills the
 * middle with fraud-type/administration/years; the ARIA ribbon enlarges the
 * tier counts to 30px Garamond CTAs.
 */
import { Fragment } from 'react'
import { Link } from 'react-router-dom'
import { ContractDrill, DrillToggle, useHot, useLayer } from '@/components/dossier/layers'
import type { VendorTopItem } from '@/api/types'
import type { ScandalListItem } from '@/api/types'
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import { ListHead, COL, NameCell, NumCell, IndicatorCell, SparkCell, yearValues } from '@/components/kit/ListCells'
import { RankCell } from '@/components/kit/ListRow'
import { useRowFold, FoldToggle } from '@/components/contrato/Fold'
import { useIsMobile } from '@/hooks/useIsMobile'
import { EditorialAreaChart } from '@/components/charts/editorial'
import { Panel, EmptyNote } from '@/components/dossier/command/primitives'
import {
  RISK_COLORS,
  RISK_TEXT_COLORS,
  getRiskLevelFromScore,
  PARTIAL_YEAR_NOTE,
} from '@/lib/constants'
import { ADMIN_ORDER, ADMIN_DISPLAY_ACCENTED, type AdministrationKey } from '@/lib/administrations'
import { formatCompactMXN, formatNumber } from '@/lib/utils'
import { formatEntityName } from '@/lib/entity/format'
import { modelFeatureLabel } from '@/lib/model/featureLabels'

const t = (lang: 'en' | 'es', es: string, en: string) => (lang === 'es' ? es : en)

const BIGNUM_STYLE = {
  fontFamily: 'var(--font-serif)',
  fontStyle: 'normal',
  fontWeight: 600,
} as const

// ─── Hairline bar (DESIGN.md §7 «La cifra», 2026-10-21) ──────────────────────
// A 1px rule with a 2px fill — the numbers beside it carry the row; phone hides it
// (dossier.css .cd-hb). `signed` draws from the centre (model coefficients).
function HB({ pct, color, signed, positive, width }: { pct: number; color?: string; signed?: boolean; positive?: boolean; width?: number }) {
  const v = Math.max(0, Math.min(100, pct))
  const half = v / 2
  return (
    <span
      className={signed ? 'cd-hb is-signed' : 'cd-hb'}
      aria-hidden="true"
      style={{
        ['--v' as string]: `${signed ? half : v}%`,
        ['--l' as string]: signed ? `${positive ? 50 : 50 - half}%` : '0%',
        ['--c' as string]: color,
        width,
      }}
    ><i /></span>
  )
}

// ─── 1 · Vendor reference table ──────────────────────────────────────────────
// Mirrors CategoryVendorTable, fed by /vendors/top?sector_id (precomputed).

export function SectorVendorTable({
  vendors,
  totalSpend,
  lang,
  sectorId,
}: {
  vendors: VendorTopItem[]
  totalSpend: number
  lang: 'en' | 'es'
  sectorId: number
}) {
  const fold = useRowFold(vendors, useIsMobile() ? 5 : 10)
  const layer = useLayer()
  const [hot, bind] = useHot()
  const openIdx = layer.sec === 'vendors' ? vendors.findIndex((v) => String(v.vendor_id) === layer.row) : -1
  const shown = openIdx >= fold.shown.length ? vendors : fold.shown
  if (vendors.length === 0) {
    return <EmptyNote text={t(lang, 'Sin proveedores registrados.', 'No vendors on record.')} />
  }
  const top10Share = totalSpend > 0
    ? (vendors.slice(0, 10).reduce((s, v) => s + (v.total_value_mxn ?? 0), 0) / totalSpend) * 100
    : 0
  const years = vendors.flatMap((v) => (v.yearly_amounts ?? []).map((p) => p.year))
  const [y0, y1] = years.length ? [Math.min(...years), Math.max(...years)] : [0, -1]
  const lead = vendors[0]
  const leadShare = totalSpend > 0 ? ((lead.total_value_mxn ?? 0) / totalSpend) * 100 : 0

  return (
    <div>
      <p className="cd-meta mb-2">
        {t(
          lang,
          `Los 10 mayores capturan el ${Math.round(top10Share)}% del gasto sectorial · el mayor, ${leadShare.toFixed(1)}%.`,
          `The top 10 capture ${Math.round(top10Share)}% of sector spend · the largest, ${leadShare.toFixed(1)}%.`,
        )}
      </p>
      <div className="ct-table-wrap">
        <table id="sd-vend-t" className="ct-table ct-stack" aria-label={t(lang, 'Proveedores del sector', 'Sector vendors')}>
          <ListHead lang={lang} ranked cols={[COL.vendor, COL.contracts, COL.amount, { ...COL.share, es: 'Cuota', en: 'Share' }, COL.indicator, COL.trend]} />
          <tbody>
            {shown.map((v, i) => {
              const share = totalSpend > 0 ? ((v.total_value_mxn ?? 0) / totalSpend) * 100 : 0
              const open = layer.isOpen('vendors', v.vendor_id)
              const risk = v.avg_risk_score ?? 0
              return (
                <Fragment key={v.vendor_id}>
                <tr className={`ct-row${fold.rowIn(i)}${hot === `v:${v.vendor_id}` ? ' is-hot' : ''}`} {...bind(`v:${v.vendor_id}`)}>
                  <RankCell n={i + 1} />
                  <NameCell type="vendor" id={v.vendor_id} name={v.vendor_name} />
                  <NumCell label={t(lang, 'contratos', 'contracts')}>{formatNumber(v.total_contracts ?? 0)}</NumCell>
                  <td className="num ct-amt">
                    <DrillToggle sec="vendors" row={v.vendor_id} open={open} onToggle={() => layer.toggle('vendors', v.vendor_id)} lang={lang} what={t(lang, `los contratos de ${formatEntityName('vendor', v.vendor_name, 'full')}`, `the contracts of ${formatEntityName('vendor', v.vendor_name, 'full')}`)}>
                      {formatCompactMXN(v.total_value_mxn ?? 0)}
                    </DrillToggle>
                  </td>
                  {/* the by-year line is the row's one mini-visual (DESIGN.md §8.1): the share reads as its number */}
                  <td className="num" data-l={t(lang, 'cuota', 'share')} style={{ color: share >= 10 ? RISK_TEXT_COLORS.high : undefined, fontWeight: share >= 10 ? 600 : 400 }}>{share.toFixed(1)}%</td>
                  <IndicatorCell value={risk > 0 ? risk : null} />
                  <SparkCell values={yearValues(v.yearly_amounts, y0, y1)} />
                </tr>
                {open && (
                  <tr className="dl-tr"><td colSpan={7}>
                    <ContractDrill sec="vendors" row={v.vendor_id} lang={lang} onClose={layer.close} show="institution"
                      filter={{ sector_id: sectorId, vendor_id: v.vendor_id }}
                      title={t(lang, `Contratos de ${formatEntityName('vendor', v.vendor_name, 'full')} en el sector`, `${formatEntityName('vendor', v.vendor_name, 'full')}'s contracts in the sector`)} />
                  </td></tr>
                )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
      <FoldToggle open={fold.open} rest={fold.rest} onToggle={fold.toggle} controls="sd-vend-t" />
    </div>
  )
}

// ─── 2 · Category composition ────────────────────────────────────────────────

export interface SectorCategoryRow {
  category_id: number
  name_es: string
  name_en: string
  total_value: number
  total_contracts: number
  avg_risk: number
  high_risk_pct?: number
}

export function SectorCategoryComposition({
  categories,
  totalSpend,
  accent,
  lang,
}: {
  categories: SectorCategoryRow[]
  totalSpend: number
  accent: string
  lang: 'en' | 'es'
}) {
  if (categories.length === 0) {
    return <EmptyNote text={t(lang, 'Sin desglose por categoría.', 'No category breakdown.')} />
  }
  const rows = [...categories].sort((a, b) => (b.total_value ?? 0) - (a.total_value ?? 0))

  // One line per basket (DESIGN.md §3 flow): name · share bar · amount · share · contracts · risk; two columns ≥1280.
  return (
    <div className="cd-rows cd-cols" role="list" aria-label={t(lang, 'Categorías del sector', 'Sector categories')}>
      {rows.map((c) => {
        const share = totalSpend > 0 ? ((c.total_value ?? 0) / totalSpend) * 100 : 0
        const risk = c.avg_risk ?? 0
        const lvl = risk > 0 ? getRiskLevelFromScore(risk) : 'low'
        const riskPct = risk > 0 ? Math.round(risk * 100) : null
        const riskEl = riskPct != null && (
          <> · <span style={{ color: RISK_TEXT_COLORS[lvl], fontWeight: 600 }}>{riskPct}</span> {t(lang, 'riesgo', 'risk')}</>
        )
        return (
          <div key={c.category_id} className="cd-row" role="listitem">
            <div>
              <EntityIdentityChip type="category" id={c.category_id} name={lang === 'es' ? c.name_es : c.name_en} size="sm" fullName />
            </div>
            <HB pct={share} color={accent} />
            <span className="cd-v">
              <b>{formatCompactMXN(c.total_value ?? 0)}</b> · <span style={{ color: share >= 20 ? RISK_TEXT_COLORS.high : undefined, fontWeight: share >= 20 ? 600 : 400 }}>{share.toFixed(1)}%</span>
              <span className="cd-hide-sm"> · {formatNumber(c.total_contracts ?? 0)} {t(lang, 'contratos', 'contracts')}{riskEl}</span>
              <span className="cd-sm">{formatNumber(c.total_contracts ?? 0)} {t(lang, 'contratos', 'contracts')}{riskEl}</span>
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ─── 3 · Spend by administration (sexenio) ───────────────────────────────────

interface TrendLike {
  year: number
  total_value_mxn: number
  total_contracts: number
  avg_risk_score: number
}

const ADMIN_YEARS: Record<AdministrationKey, string> = {
  // Six-year terms; Sheinbaum's reads as one partial year (the feed froze 2025-09-28).
  fox: '2002–06', calderon: '2007–12', epn: '2013–18', amlo: '2019–24', sheinbaum: '2025–*',
}

function adminForYear(y: number): AdministrationKey {
  if (y <= 2006) return 'fox'
  if (y <= 2012) return 'calderon'
  if (y <= 2018) return 'epn'
  if (y <= 2024) return 'amlo'
  return 'sheinbaum'
}

export function SectorSexenioStrip({
  trends,
  accent,
  lang,
  sectorId,
}: {
  trends: TrendLike[]
  accent: string
  lang: 'en' | 'es'
  sectorId: number
}) {
  // L3: a sexenio opens its years in place (?sec=administrations&row=amlo); a year opens its contracts (row=amlo-2021).
  const layer = useLayer()
  const [openKey, openYear] = layer.sec === 'administrations' && layer.row ? layer.row.split('-') : [null, null]
  const buckets = new Map<AdministrationKey, { value: number; contracts: number; riskNum: number; riskDen: number }>()
  for (const tr of trends) {
    if (!Number.isFinite(tr.year)) continue
    const key = adminForYear(tr.year)
    const b = buckets.get(key) ?? { value: 0, contracts: 0, riskNum: 0, riskDen: 0 }
    const contracts = tr.total_contracts ?? 0
    b.value += tr.total_value_mxn ?? 0
    b.contracts += contracts
    if (tr.avg_risk_score > 0 && contracts > 0) {
      b.riskNum += tr.avg_risk_score * contracts
      b.riskDen += contracts
    }
    buckets.set(key, b)
  }
  const rows = ADMIN_ORDER.map((k) => {
    const b = buckets.get(k)
    return b && b.value > 0
      ? { key: k, value: b.value, contracts: b.contracts, risk: b.riskDen > 0 ? b.riskNum / b.riskDen : 0 }
      : null
  }).filter(Boolean) as Array<{ key: AdministrationKey; value: number; contracts: number; risk: number }>

  if (rows.length === 0) {
    return <EmptyNote text={t(lang, 'Serie temporal insuficiente.', 'Insufficient time series.')} />
  }
  const maxVal = Math.max(1, ...rows.map((r) => r.value))
  const peak = rows.reduce((mx, r) => (r.value > mx.value ? r : mx), rows[0])

  return (
    <div>
      <div className="cd-rows" role="list" aria-label={t(lang, 'Gasto por sexenio', 'Spend by administration')}>
        {rows.map((r) => {
          const lvl = r.risk > 0 ? getRiskLevelFromScore(r.risk) : 'low'
          const isPeak = r.key === peak.key
          const open = openKey === r.key
          const years = open ? trends.filter((tr) => Number.isFinite(tr.year) && adminForYear(tr.year) === r.key).sort((a, b) => a.year - b.year) : []
          return (
            <Fragment key={r.key}>
            <div className="cd-row is-wide" role="listitem">
              <div>
                <span style={{ fontWeight: isPeak ? 600 : 400 }}>{ADMIN_DISPLAY_ACCENTED[r.key]}</span>
                {isPeak && <span className="ml-1" style={{ color: RISK_TEXT_COLORS.high }} aria-hidden="true">▲</span>}
                {' '}<span className="cd-lbl">{ADMIN_YEARS[r.key]}</span>
                <span className="cd-sm">{formatNumber(r.contracts)} {t(lang, 'contratos', 'contracts')}</span>
              </div>
              <HB pct={(r.value / maxVal) * 100} color={isPeak ? RISK_COLORS.high : accent} />
              <span className="cd-v">
                <DrillToggle sec="administrations" row={r.key} open={open} onToggle={() => (open ? layer.close() : layer.toggle('administrations', r.key))} lang={lang} what={t(lang, `los años de ${ADMIN_DISPLAY_ACCENTED[r.key]}`, `the years of ${ADMIN_DISPLAY_ACCENTED[r.key]}`)}>
                  <b style={{ color: isPeak ? RISK_TEXT_COLORS.high : undefined }}>{formatCompactMXN(r.value)}</b>
                </DrillToggle>
                <span className="cd-hide-sm"> · {formatNumber(r.contracts)} {t(lang, 'contratos', 'contracts')}</span>
                {' · '}
                <span title={t(lang, 'indicador de riesgo', 'risk indicator')} style={{ fontWeight: 600, color: r.risk > 0 ? RISK_TEXT_COLORS[lvl] : undefined }}>
                  {r.risk > 0 ? Math.round(r.risk * 100) : '—'}
                </span>
              </span>
            </div>
            {open && (
              <div className="dl-drill" id={`dl-administrations-${r.key}`} data-drill={`administrations:${r.key}`} role="listitem">
                {years.map((y) => {
                  const yOpen = openYear === String(y.year)
                  const lv = y.avg_risk_score > 0 ? getRiskLevelFromScore(y.avg_risk_score) : 'low'
                  return (
                    <Fragment key={y.year}>
                      <div className="cd-row is-wide">
                        <span className="cd-lbl">{y.year}</span>
                        <span />
                        <span className="cd-v">
                          <DrillToggle sec="administrations" row={`${r.key}-${y.year}`} open={yOpen} onToggle={() => layer.toggle('administrations', yOpen ? r.key : `${r.key}-${y.year}`)} lang={lang} what={t(lang, `los contratos de ${y.year}`, `the contracts of ${y.year}`)}>
                            <b>{formatCompactMXN(y.total_value_mxn ?? 0)}</b>
                          </DrillToggle>
                          <span className="cd-hide-sm"> · {formatNumber(y.total_contracts ?? 0)} {t(lang, 'contratos', 'contracts')}</span>
                          {' · '}<span style={{ fontWeight: 600, color: y.avg_risk_score > 0 ? RISK_TEXT_COLORS[lv] : undefined }}>{y.avg_risk_score > 0 ? Math.round(y.avg_risk_score * 100) : '—'}</span>
                        </span>
                      </div>
                      {yOpen && (
                        <ContractDrill sec="administrations" row={`${r.key}-${y.year}`} lang={lang} show="vendor"
                          onClose={() => layer.toggle('administrations', r.key)}
                          filter={{ sector_id: sectorId, year: y.year }}
                          title={t(lang, `Los contratos más grandes de ${y.year}`, `The largest contracts of ${y.year}`)} />
                      )}
                    </Fragment>
                  )
                })}
              </div>
            )}
            </Fragment>
          )
        })}
      </div>
      <p className="cd-meta mt-2">
        {t(
          lang,
          `Pico de gasto · ${ADMIN_DISPLAY_ACCENTED[peak.key]} (${ADMIN_YEARS[peak.key]}). Última cifra = indicador de riesgo medio. * ${PARTIAL_YEAR_NOTE.es}: una fracción de año frente a sexenios completos.`,
          `Peak spend · ${ADMIN_DISPLAY_ACCENTED[peak.key]} (${ADMIN_YEARS[peak.key]}). Last figure = mean risk indicator. * ${PARTIAL_YEAR_NOTE.en}: a fraction of a year against full six-year terms.`,
        )}
      </p>
    </div>
  )
}

// ─── 4 · Concentration over time (Gini / top-vendor share) ───────────────────

interface ConcentrationPoint {
  year: number
  gini: number
  top_vendor_share: number
}

export function SectorConcentrationPanel({
  history,
  lang,
}: {
  history: ConcentrationPoint[]
  lang: 'en' | 'es'
}) {
  const series = history
    .map((h) => ({ year: h.year, share: (h.top_vendor_share ?? 0) * 100 }))
    .filter((h) => Number.isFinite(h.year) && h.share > 0)
    .sort((a, b) => a.year - b.year)
  const first = series[0]
  const last = series[series.length - 1]
  const lo = series.length ? Math.min(...series.map((s) => s.share)) : 0
  const hi = series.length ? Math.max(...series.map((s) => s.share)) : 0

  return (
    <Panel label={t(lang, 'Concentración en el tiempo', 'Concentration over time')} accent={RISK_COLORS.high}>
      {series.length > 1 ? (
        <>
          {/* risk-critical like its sibling chart: the risk-high series ink measured 2.04:1 (a11y X4). */}
          <EditorialAreaChart
            data={series} xKey="year" yKey="share" colorToken="risk-critical" yFormat="pct" height={216}
            decorative
            ariaLabel={t(
              lang,
              `Concentración en el tiempo, ${first.year}–${last.year}: cuota del mayor proveedor en el valor contratado entre ${lo.toFixed(1)}% y ${hi.toFixed(1)}%, última ${last.share.toFixed(1)}%`,
              `Concentration over time, ${first.year}–${last.year}: largest vendor's share of contract value between ${lo.toFixed(1)}% and ${hi.toFixed(1)}%, latest ${last.share.toFixed(1)}%`,
            )}
          />
          <p className="ct-note mt-2">
            {t(
              lang,
              `Cuota del mayor proveedor en el valor contratado · ${last.share.toFixed(1)}% en ${last.year} (rango ${lo.toFixed(1)}–${hi.toFixed(1)}%). Cuota baja = mercado atomizado.`,
              `Largest vendor's share of contract value · ${last.share.toFixed(1)}% in ${last.year} (range ${lo.toFixed(1)}–${hi.toFixed(1)}%). Low share = atomized market.`,
            )}
          </p>
        </>
      ) : (
        <EmptyNote text={t(lang, 'Sin historial de concentración.', 'No concentration history.')} />
      )}
    </Panel>
  )
}

// ─── 5 · Model coefficient ladder ────────────────────────────────────────────

function featureLabel(key: string, lang: 'en' | 'es'): string {
  const l = modelFeatureLabel(key, lang)
  if (l) return l
  return key.split('_').map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(' ')
}

export function SectorModelLadder({
  coefficients,
  usesGlobal,
  lang,
}: {
  coefficients: Array<{ feature: string; coefficient: number }>
  usesGlobal: boolean
  lang: 'en' | 'es'
}) {
  const rows = [...(coefficients ?? [])]
    .filter((c) => Number.isFinite(c.coefficient) && c.coefficient !== 0)
    .sort((a, b) => Math.abs(b.coefficient) - Math.abs(a.coefficient))
    .slice(0, 12)
  const maxAbs = Math.max(0.01, ...rows.map((c) => Math.abs(c.coefficient)))

  return (
    <Panel label={t(lang, 'Por qué marca riesgo', 'Why it flags risk')} accent={RISK_COLORS.critical}>
      {rows.length > 0 ? (
        <div>
          <div className="cd-rows cd-cols" role="list" aria-label={t(lang, 'Coeficientes del modelo', 'Model coefficients')}>
          {rows.map((c) => {
            const positive = c.coefficient > 0
            const barColor = positive ? RISK_COLORS.critical : 'var(--color-text-muted)'
            const textColor = positive ? RISK_TEXT_COLORS.critical : 'var(--color-text-muted)'
            const sign = positive ? '+' : ''
            const barPct = (Math.abs(c.coefficient) / maxAbs) * 100
            return (
              <div key={c.feature} className="cd-row" role="listitem">
                <span>{featureLabel(c.feature, lang)}</span>
                <HB pct={barPct} signed positive={positive} color={barColor} />
                <span className="cd-v" style={{ fontWeight: 600, color: textColor }}>{sign}{c.coefficient.toFixed(2)}</span>
              </div>
            )
          })}
          </div>
          <p className="cd-meta mt-2">
            {t(lang, 'Modelo v0.9.2 · ', 'v0.9.2 model · ')}
            {usesGlobal
              ? t(lang, 'global (sin modelo sectorial)', 'global (no sector model)')
              : t(lang, 'sectorial', 'sector-specific')}
            {' · '}
            <span style={{ color: RISK_TEXT_COLORS.critical }}>{t(lang, 'derecha/rojo = aumenta riesgo', 'right/red = raises risk')}</span>
            {' · '}
            <span>{t(lang, 'izquierda = protector', 'left = protective')}</span>
          </p>
        </div>
      ) : (
        <EmptyNote text={t(lang, 'Sin coeficientes disponibles.', 'No coefficients available.')} />
      )}
    </Panel>
  )
}

// ─── 6 · Year-by-year anomalies ──────────────────────────────────────────────

interface AnomalyYear {
  year: number
  overall_anomaly_score: number
}

export function SectorAnomalyStrip({
  anomalies,
  lang,
}: {
  anomalies: AnomalyYear[]
  lang: 'en' | 'es'
}) {
  const rows = [...(anomalies ?? [])]
    .filter((a) => Number.isFinite(a.year) && a.overall_anomaly_score > 0)
    .sort((a, b) => a.year - b.year)

  return (
    <Panel label={t(lang, 'Años anómalos', 'Anomalous years')} accent={RISK_COLORS.high}>
      {rows.length > 0 ? (
        <>
          <div className="cd-rows cd-cols-sm" role="list" aria-label={t(lang, 'Años anómalos', 'Anomalous years')}>
            {(() => {
              const maxScore = Math.max(0.5, ...rows.map((r) => r.overall_anomaly_score))
              const worst = rows.reduce((mx, r) => (r.overall_anomaly_score > mx.overall_anomaly_score ? r : mx), rows[0])
              // Show the 8 most recent years to keep the panel compact.
              return rows.slice(-8).map((r) => {
                const isWorst = r.year === worst.year
                const tone = isWorst ? RISK_TEXT_COLORS.critical : undefined
                return (
                  <div key={r.year} className="cd-row is-wide" role="listitem">
                    <span className="cd-lbl" style={{ color: tone, fontWeight: isWorst ? 600 : 400 }}>{r.year}</span>
                    <HB pct={(r.overall_anomaly_score / maxScore) * 100} color={isWorst ? RISK_COLORS.critical : RISK_COLORS.high} />
                    <span className="cd-v" style={{ color: tone, fontWeight: isWorst ? 600 : 400 }}>{r.overall_anomaly_score.toFixed(2)}</span>
                  </div>
                )
              })
            })()}
          </div>
          <p className="cd-meta mt-2">
            {t(lang, 'Desviación |z| media de factores vs. la línea base del sector.', 'Mean |z| deviation of factors vs the sector baseline.')}
          </p>
        </>
      ) : (
        <EmptyNote text={t(lang, 'Sin señal de anomalía temporal.', 'No temporal anomaly signal.')} />
      )}
    </Panel>
  )
}

// ─── 7 · Documented cases ────────────────────────────────────────────────────

const LEGAL_STATUS: Record<string, [string, string]> = {
  investigation: ['En investigación', 'Under investigation'],
  prosecuted: ['Procesado', 'Prosecuted'],
  acquitted: ['Absuelto', 'Acquitted'],
  dismissed: ['Desestimado', 'Dismissed'],
  impunity: ['Impunidad', 'Impunity'],
  unresolved: ['Sin resolución', 'Unresolved'],
}

function legalLabel(status: string, lang: 'en' | 'es'): string {
  const pair = LEGAL_STATUS[status]
  if (pair) return lang === 'es' ? pair[0] : pair[1]
  return status.replace(/_/g, ' ')
}

const FRAUD_TYPE_LABEL: Record<string, [string, string]> = {
  ghost_company: ['Empresa fantasma', 'Ghost company'],
  overpricing: ['Sobreprecio', 'Overpricing'],
  bid_rigging: ['Colusión', 'Bid rigging'],
  embezzlement: ['Desvío', 'Embezzlement'],
  bribery: ['Soborno', 'Bribery'],
  conflict_of_interest: ['Conflicto de interés', 'Conflict of interest'],
  shell_network: ['Red de fachadas', 'Shell network'],
  phantom_delivery: ['Entrega fantasma', 'Phantom delivery'],
  influence_peddling: ['Tráfico de influencias', 'Influence peddling'],
  money_laundering: ['Lavado', 'Money laundering'],
}

function fraudLabel(ft: string | undefined, lang: 'en' | 'es'): string | null {
  if (!ft) return null
  const pair = FRAUD_TYPE_LABEL[ft]
  if (pair) return lang === 'es' ? pair[0] : pair[1]
  return ft.replace(/_/g, ' ')
}

function adminLabel(a: string | undefined): string | null {
  if (!a) return null
  const key = a as AdministrationKey
  return ADMIN_DISPLAY_ACCENTED[key] ?? a.charAt(0).toUpperCase() + a.slice(1)
}

export function SectorCaseRoll({
  cases,
  lang,
}: {
  cases: ScandalListItem[]
  lang: 'en' | 'es'
}) {
  const fold = useRowFold([...cases].sort((a, b) => (b.severity ?? 0) - (a.severity ?? 0)), 4)
  if (cases.length === 0) {
    return <EmptyNote text={t(lang, 'Sin casos documentados ligados al sector.', 'No documented cases linked to the sector.')} />
  }

  // One column (the section sits in a pair); past four, the rest open in place.
  return (
    <>
    <ul id="sd-case-t" className="border-t border-text-primary">
      {fold.shown.map((c, i) => {
        const amount = c.amount_mxn_high ?? c.amount_mxn_low ?? 0
        const years = c.contract_year_start
          ? `${c.contract_year_start}${c.contract_year_end && c.contract_year_end !== c.contract_year_start ? `–${c.contract_year_end}` : ''}`
          : null
        const fraud = fraudLabel(c.fraud_type, lang)
        const admin = adminLabel(c.administration)
        const statusColor = c.legal_status === 'prosecuted' ? RISK_TEXT_COLORS.critical : c.legal_status === 'impunity' ? RISK_TEXT_COLORS.high : 'var(--color-text-muted)'
        return (
          <li key={c.id} className={`py-1 border-b border-border hover:bg-background-elevated transition-colors${fold.rowIn(i)}`}>
            {/* Line 1 — case · amount */}
            <div className="flex items-baseline justify-between gap-3">
              <div className="min-w-0">
                <EntityIdentityChip type="case" id={c.slug} name={lang === 'es' ? c.name_es : c.name_en} size="sm" fullName />
              </div>
              {amount > 0 && (
                <span className="shrink-0 tabular-nums" style={{ ...BIGNUM_STYLE, fontSize: 15, color: 'var(--color-text-primary)' }}>
                  {formatCompactMXN(amount)}
                </span>
              )}
            </div>
            {/* Line 2 — fraud type · administration · years · status */}
            <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 tabular-nums" style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
              {fraud && <span style={{ color: 'var(--color-text-secondary)' }}>{fraud}</span>}
              {admin && (<><span aria-hidden="true" style={{ opacity: 0.5 }}>·</span><span>{admin}</span></>)}
              {years && (<><span aria-hidden="true" style={{ opacity: 0.5 }}>·</span><span>{years}</span></>)}
              <span aria-hidden="true" style={{ opacity: 0.5 }}>·</span>
              <span className="tracking-wider" style={{ fontSize: 13, color: statusColor, fontWeight: statusColor === 'var(--color-text-muted)' ? 400 : 600 }}>
                {legalLabel(c.legal_status, lang)}
              </span>
            </div>
          </li>
        )
      })}
    </ul>
    <FoldToggle open={fold.open} rest={fold.rest} onToggle={fold.toggle} controls="sd-case-t" />
    </>
  )
}

// ─── 8 · ARIA investigation-queue ribbon ─────────────────────────────────────

export interface TierCount { tier: 1 | 2 | 3 | 4; count: number }

const TIER_COLOR: Record<1 | 2 | 3 | 4, string> = {
  1: RISK_COLORS.critical, 2: RISK_COLORS.high, 3: RISK_COLORS.medium, 4: RISK_COLORS.low,
}
const TIER_LABEL: Record<1 | 2 | 3 | 4, [string, string]> = {
  1: ['Prioritario', 'Priority'], 2: ['Elevado', 'Elevated'], 3: ['Medio', 'Medium'], 4: ['Base', 'Baseline'],
}

export function SectorQueueRibbon({
  tiers,
  sectorId,
  lang,
}: {
  tiers: TierCount[]
  sectorId: number
  lang: 'en' | 'es'
}) {
  const total = tiers.reduce((s, x) => s + x.count, 0)
  if (total === 0) {
    return <EmptyNote text={t(lang, 'Sin proveedores en la fila de investigación.', 'No vendors in the investigation queue.')} />
  }

  return (
    <div className="border-t border-text-primary pt-1">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
        <p style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
          <span className="font-mono tabular-nums" style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{formatNumber(total)}</span>
          {' '}{t(lang, 'proveedores en la fila ARIA', 'vendors in the ARIA queue')}
        </p>
        <Link to={`/aria?sector=${sectorId}`} className="ct-more ct-link" style={{ marginTop: 0 }}>
          {t(lang, 'Ver los Focos Rojos', 'Open Red Flags')} →
        </Link>
      </div>
      {/* the four tiers as figures, no bars (owner 2026-10-21: numbers, not rulers) */}
      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 border-t border-border">
        {([1, 2, 3, 4] as const).map((tier) => {
          const count = tiers.find((x) => x.tier === tier)?.count ?? 0
          const sharePct = total > 0 ? (count / total) * 100 : 0
          return (
            <div key={tier} className="flex flex-col-reverse py-1">
              <dt style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
                <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 999, background: TIER_COLOR[tier], display: 'inline-block', marginRight: 6 }} />
                T{tier} · {lang === 'es' ? TIER_LABEL[tier][0] : TIER_LABEL[tier][1]}
              </dt>
              <dd className="ct-fig" style={{ marginTop: 0, color: count > 0 ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>
                {formatNumber(count)} <span className="font-mono" style={{ fontSize: 13, fontWeight: 400, color: 'var(--color-text-muted)' }}>{Math.round(sharePct)}%</span>
              </dd>
            </div>
          )
        })}
      </dl>
    </div>
  )
}

// ─── 9 · Largest single contracts ────────────────────────────────────────────

export interface SectorContractRow {
  contract_id: number
  amount_mxn: number
  year: number | null
  risk_level: string | null
  vendor_id: number | null
  vendor_name: string | null
  /** persona física: named, always labelled (policy 10-29) */
  persona_fisica?: boolean
  institution_id: number | null
  institution_name: string | null
  title: string | null
}

export function SectorLargestContracts({
  contracts,
  lang,
}: {
  contracts: SectorContractRow[]
  lang: 'en' | 'es'
}) {
  // Phone shows five, the rest open in place (DESIGN.md §3 fold); ≥1280 flows ten down two columns.
  const fold = useRowFold(contracts, useIsMobile() ? 5 : 10)
  const [hot, bind] = useHot()
  if (contracts.length === 0) {
    return <EmptyNote text={t(lang, 'Sin contratos registrados.', 'No contracts on record.')} />
  }

  // One record per row, «La cifra» register: rank · vendor → buyer · amount, then year · title.
  return (
    <div>
    <ul id="sd-big-t" className="ct-cols2 border-t border-text-primary" style={{ ['--ct-rows' as string]: Math.ceil(fold.shown.length / 2) }}>
      {fold.shown.map((c, i) => {
        const lvl = c.risk_level && ['critical', 'high', 'medium', 'low'].includes(c.risk_level)
          ? (c.risk_level as 'critical' | 'high' | 'medium' | 'low')
          : 'low'
        return (
          <li key={c.contract_id} className={`py-1 border-b border-border grid gap-x-3${fold.rowIn(i)}${hot != null && (hot === `v:${c.vendor_id}` || hot === `i:${c.institution_id}`) ? ' is-hot' : ''}`} style={{ gridTemplateColumns: '20px minmax(0, 1fr) max-content' }} {...(c.vendor_id != null ? bind(`v:${c.vendor_id}`) : {})}>
            <span className="font-mono tabular-nums text-right" style={{ fontSize: 12, lineHeight: '24px', color: 'var(--color-text-muted)' }}>{String(i + 1).padStart(2, '0')}</span>
            {c.vendor_id != null && c.vendor_name ? (
              <EntityIdentityChip type="vendor" id={c.vendor_id} name={c.vendor_name} personaFisica={c.persona_fisica} size="sm" fullName />
            ) : (
              <span style={{ fontSize: 13, lineHeight: '24px', color: 'var(--color-text-muted)' }}>{t(lang, 'proveedor no identificado', 'unidentified vendor')}</span>
            )}
            <span className="tabular-nums text-right" style={{ ...BIGNUM_STYLE, fontSize: 16, lineHeight: '24px', whiteSpace: 'nowrap', color: RISK_TEXT_COLORS[lvl] }}>
              {formatCompactMXN(c.amount_mxn ?? 0)}
            </span>
            {/* buyer · year · title under the vendor and the amount; the buyer is an inline link in the line */}
            <div style={{ gridColumn: '2 / -1', fontSize: 13, lineHeight: 1.4, color: 'var(--color-text-muted)' }}>
              {c.institution_id != null && c.institution_name && (
                <>→ <EntityIdentityChip type="institution" id={c.institution_id} name={c.institution_name} variant="name" style={{ fontFamily: 'var(--font-serif)', fontSize: 14, color: 'var(--color-text-primary)' }} />{' · '}</>
              )}
              {c.year != null && <span className="font-mono tabular-nums">{c.year}</span>}
              {' · '}<Link to={`/contracts/${c.contract_id}`} className="ct-link" style={{ fontFamily: 'var(--font-serif)', fontSize: 14 }}>{c.title || t(lang, `Contrato #${c.contract_id}`, `Contract #${c.contract_id}`)}</Link>
            </div>
          </li>
        )
      })}
    </ul>
    <FoldToggle open={fold.open} rest={fold.rest} onToggle={fold.toggle} controls="sd-big-t" />
    </div>
  )
}
