/**
 * KardexPosicion — § 0 "LA POSICIÓN EN EL INVENTARIO" of the category
 * dossier: where THIS shelf ranks among its peers on five measures, one line
 * each (value · rank · median; the hairline fill is the percentile). The
 * 72-tick strips went on 2026-10-21 (owner: numbers, not drawn rulers). Fed
 * entirely by the summary array the page already fetches — zero new queries.
 *
 * Content-only: no self-rendered § kicker. The page wraps this in its own
 * DossierSectionHeader (matching CategoryDiagnosticGrid / ProcedureSplit /
 * SeasonalityTell, all of which take `accent` + `lang` and let the page own
 * the section chrome) — kicker text per spec: "§ La posición · este anaquel
 * entre los 72" / "§ The position · this shelf among the 72".
 *
 * Hex colours ONLY as direct SVG/style attributes — never via className
 * (stripped). No green for low risk (Bible §3.10); the fill uses the
 * caller's `accent` (the category's sector color), never intensityColor —
 * this is a position instrument, not a risk-severity one.
 */
import { useMemo } from 'react'
import { EU_DIRECT_AWARD_LIMIT } from '@/lib/constants'
import { formatCompactMXN } from '@/lib/utils'
import type { CategorySummaryItem } from '@/components/categories/types'
import { CONTRACT_FLOOR } from '@/components/categories/types'

export interface KardexPosicionProps {
  category: CategorySummaryItem
  all: CategorySummaryItem[]
  accent: string
  lang: 'en' | 'es'
}

const DA_LIMIT_PCT = EU_DIRECT_AWARD_LIMIT * 100

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

/** 1-based rank of `id` within `pool`, sorted desc by `getValue`. Null if absent. */
function rankOf(pool: CategorySummaryItem[], id: number, getValue: (c: CategorySummaryItem) => number): number | null {
  const sorted = [...pool].sort((a, b) => getValue(b) - getValue(a))
  const idx = sorted.findIndex((c) => c.category_id === id)
  return idx === -1 ? null : idx + 1
}

interface RowConfig {
  key: string
  label: string
  pool: CategorySummaryItem[]
  getValue: (c: CategorySummaryItem) => number
  euTick?: number
  formatReadout: (v: number) => string
  /** short form for the median label (row unit, no currency suffix) */
  formatTick: (v: number) => string
}

function GapRow({ label, note }: { label: string; note: string }) {
  return (
    <div className="cd-row" role="listitem">
      <span>{label}</span>
      <span className="cd-hb" aria-hidden="true" />
      <span className="cd-v">{note}</span>
    </div>
  )
}

/**
 * One line per measure («La cifra», owner 2026-10-21 — the 72-tick strips went): label ·
 * a hairline whose fill is this shelf's percentile among its peers · value · rank · median.
 */
function Row({ cfg, category, accent, isEs }: { cfg: RowConfig; category: CategorySummaryItem; accent: string; isEs: boolean }) {
  const values = cfg.pool.map(cfg.getValue)
  const med = median(values)
  const rank = rankOf(cfg.pool, category.category_id, cfg.getValue)

  if (rank === null) {
    return <GapRow label={cfg.label} note={isEs ? 's/d — muestra insuficiente' : 'n/a — sample too small'} />
  }

  const n = cfg.pool.length
  const subjectValue = cfg.getValue(category)
  // Remarkable = this shelf sits in the top or bottom five of its pool.
  const emphasis = rank <= 5 || rank > n - 5
  const rankText = isEs ? `№ ${rank} de ${n}` : `no. ${rank} of ${n}`
  const medText = `${isEs ? 'mediana' : 'median'} ${cfg.formatTick(med)}${cfg.euTick != null ? ` · ${isEs ? 'UE' : 'EU'} ${cfg.euTick}%` : ''}`
  const pctile = n > 1 ? ((n - rank) / (n - 1)) * 100 : 100

  return (
    <div className="cd-row" role="listitem" aria-label={`${cfg.label}: ${cfg.formatReadout(subjectValue)}, ${rankText}, ${medText}`}>
      <div>
        {cfg.label}
        <span className="cd-sm">{rankText} · {medText}</span>
      </div>
      <span className="cd-hb" aria-hidden="true" style={{ ['--v' as string]: `${pctile}%`, ['--c' as string]: accent }}><i /></span>
      <span className="cd-v">
        <b style={{ color: emphasis ? undefined : 'var(--color-text-secondary)' }}>{cfg.formatReadout(subjectValue)}</b>
        <span className="cd-hide-sm"> · {rankText} · {medText}</span>
      </span>
    </div>
  )
}

export function KardexPosicion({ category, all, accent, lang }: KardexPosicionProps) {
  const isEs = lang === 'es'

  const rows = useMemo<RowConfig[]>(() => {
    const qualified = all.filter((c) => c.total_contracts >= CONTRACT_FLOOR)
    const hrPool = all.filter((c) => c.high_risk_pct != null)
    // Single award on the competitive base (D20); categories with no competitive procedure drop out.
    const saPool = all.filter((c) => c.single_award_pct != null)
    return [
      {
        key: 'value',
        label: isEs ? 'Valor en libros' : 'Book value',
        pool: all,
        getValue: (c) => c.total_value,
        formatReadout: (v) => formatCompactMXN(v),
        formatTick: (v) => formatCompactMXN(v).replace(/ MXN$/, ''),
      },
      {
        key: 'risk',
        label: isEs ? 'Indicador de riesgo' : 'Risk indicator',
        pool: qualified,
        getValue: (c) => c.avg_risk,
        formatReadout: (v) => `${Math.round(v * 100)}`,
        formatTick: (v) => `${Math.round(v * 100)}`,
      },
      {
        key: 'da',
        label: isEs ? 'Adjudicación directa' : 'Direct award',
        pool: all,
        getValue: (c) => c.direct_award_pct,
        euTick: Math.round(DA_LIMIT_PCT),
        formatReadout: (v) => `${v.toFixed(0)}%`,
        formatTick: (v) => `${v.toFixed(0)}%`,
      },
      {
        key: 'sb',
        label: isEs ? 'Un solo adjudicado · competitivos' : 'Single award · competitive',
        pool: saPool,
        getValue: (c) => c.single_award_pct ?? 0,
        formatReadout: (v) => `${v.toFixed(0)}%`,
        formatTick: (v) => `${v.toFixed(0)}%`,
      },
      {
        key: 'hr',
        label: isEs ? 'Alto riesgo' : 'High-risk',
        pool: hrPool,
        getValue: (c) => c.high_risk_pct ?? 0,
        formatReadout: (v) => `${v.toFixed(0)}%`,
        formatTick: (v) => `${v.toFixed(0)}%`,
      },
    ]
  }, [all, isEs])

  // THIS category's own high_risk_pct is null (Structure-A, pre-2010) — the
  // spec-mandated exact wording, distinct from the generic "sample too small"
  // gap other rows fall back to.
  const hrIsGap = category.high_risk_pct == null

  return (
    <div className="cd-rows" role="list" aria-label={isEs ? 'Posición entre los anaqueles' : 'Position among the shelves'}>
      {rows.map((cfg) => {
        if (cfg.key === 'hr' && hrIsGap) {
          return <GapRow key="hr" label={cfg.label} note={isEs ? 's/d — Estructura A' : 'n/a — Structure A'} />
        }
        return <Row key={cfg.key} cfg={cfg} category={category} accent={accent} isEs={isEs} />
      })}
    </div>
  )
}
