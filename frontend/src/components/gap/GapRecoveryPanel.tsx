/**
 * GapRecoveryPanel — "El Apagón" recovery-data supplement (Option C · 2026-06-27).
 *
 * Surfaces the post-CompraNet (Sep 2025+) awards recovered from ComprasMX across
 * the platform's analytical tabs, ALWAYS as a clearly-labeled separate data tier:
 * counts + partial OCR amounts, outside the risk model: v0.9.2 scores ComprasMX's
 * open-data contracts (in `contracts`), not these recovered procedures (`gap_contracts`).
 * The gap data window (2025-09-28 .. 2026-06) lies entirely within the Sheinbaum
 * term, so on /administrations this only renders for that administration.
 *
 * Reads /api/v1/gap/summary (gapApi.getSummary). Renders nothing if the gap
 * staging table is unavailable (e.g. a DB build without it).
 *
 *   variant="full"    — editorial section (Sexenios, Sectors)
 *   variant="compact" — clickable callout tile (Dashboard)
 */
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { FileSearch, ArrowRight } from 'lucide-react'
import { gapApi } from '@/api/client'
import { cn, formatCompactMXN, pctOrDash } from '@/lib/utils'
import { getSectorName, SECTOR_COLORS } from '@/lib/constants'

interface GapRecoveryPanelProps {
  isEs: boolean
  variant?: 'full' | 'compact'
  className?: string
}

function StatBlock({ value, label }: { value: string; label: string }) {
  return (
    <div className="min-w-0">
      <div
        className="text-[18px] leading-none tabular-nums text-text-primary"
        style={{ fontFamily: 'var(--font-family-serif)', fontStyle: 'normal', fontWeight: 700 }}
      >
        {value}
      </div>
      <div className="text-[12px] text-text-muted mt-1 leading-tight">{label}</div>
    </div>
  )
}

export function GapRecoveryPanel({ isEs, variant = 'full', className }: GapRecoveryPanelProps) {
  const { data } = useQuery({
    queryKey: ['gap-summary'],
    queryFn: () => gapApi.getSummary(),
    staleTime: 60 * 60 * 1000,
    retry: false,
  })

  if (!data || !data.available) return null

  const locale = isEs ? 'es-MX' : 'en-US'
  const count = data.total_contracts.toLocaleString(locale)
  const value = formatCompactMXN(data.best_available_sum_mxn)
  const daPct = `${pctOrDash(data.direct_award_pct, 0)}`
  const tierTag = isEs
    ? 'DATOS DE RECUPERACIÓN · FUERA DEL MODELO DE RIESGO'
    : 'RECOVERY DATA · OUTSIDE THE RISK MODEL'

  const stats = (
    <>
      <StatBlock value={count} label={isEs ? 'procedimientos recuperados' : 'recovered procedures'} />
      <StatBlock value={value} label={isEs ? 'valor recuperado · parcial' : 'recovered value · partial'} />
      <StatBlock value={daPct} label={isEs ? 'adjudicación directa' : 'direct award'} />
    </>
  )

  // ── compact callout (dashboard) ──
  if (variant === 'compact') {
    return (
      <Link
        to="/gap"
        className={cn(
          'group block rounded-sm border border-border bg-surface-2/40 p-3 transition-colors hover:bg-surface-2/70',
          className,
        )}
      >
        <div className="mb-2.5 flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 ct-sc text-[12px] text-text-muted">
            <FileSearch className="h-3 w-3" />
            {isEs ? 'EL APAGÓN · POST-COMPRANET' : 'THE BLACKOUT · POST-COMPRANET'}
          </span>
          <ArrowRight className="h-3.5 w-3.5 text-text-muted transition-transform duration-200 group-hover:translate-x-0.5" />
        </div>
        <div className="grid grid-cols-3 gap-3">{stats}</div>
        <div className="mt-2.5 ct-note">{tierTag}</div>
      </Link>
    )
  }

  // ── full editorial section (sexenios / sectors) ──
  const topSectors = data.by_sector.slice(0, 6)
  const sectorMax = Math.max(1, ...topSectors.map((s) => s.count))

  return (
    <div className={cn('border-t border-border/40 px-4 py-4 sm:px-5', className)}>
      <div className="flex items-center gap-2 ct-sc text-[12px] text-text-muted">
        <FileSearch className="h-3 w-3" />
        {isEs ? '§ EL APAGÓN — DATOS RECUPERADOS' : '§ THE BLACKOUT — RECOVERED DATA'}
      </div>

      <p className="mt-2 max-w-2xl text-xs leading-relaxed text-text-secondary">
        {isEs
          ? 'El 28 de septiembre de 2025 el archivo masivo de CompraNet se congeló tras la abolición legal del sistema. Estos procedimientos se recuperaron de su sucesor, ComprasMX, que ya no publica el ganador ni el precio como datos. Se muestran como conteos y montos OCR, fuera del modelo de riesgo: el modelo v0.9.2 califica los contratos de los datos abiertos de ComprasMX, no estos procedimientos recuperados.'
          : 'On September 28 2025 the CompraNet bulk feed froze after the system was legally abolished. These procedures were recovered from its successor, ComprasMX, which no longer publishes the winner and the price as data. They are shown as counts and OCR amounts, outside the risk model: model v0.9.2 scores the contracts in ComprasMX’s open data, not these recovered procedures.'}
      </p>

      <div className="mt-4 grid max-w-lg grid-cols-3 gap-4">{stats}</div>

      <p className="mt-3 max-w-2xl ct-note">
        {tierTag}
        {' · '}
        {isEs
          ? 'monto leído por OCR del fallo en poco más de la mitad de los procedimientos; el resto estimado o sin monto.'
          : 'amount read off the award PDF by OCR for just over half of the procedures; the rest estimated or without an amount.'}
      </p>

      {topSectors.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 ct-sc text-[12px] text-text-muted">
            {isEs ? 'POR SECTOR · CONTEO RECUPERADO' : 'BY SECTOR · RECOVERED COUNT'}
          </div>
          <div className="max-w-md space-y-1.5">
            {topSectors.map((s) => {
              const color = SECTOR_COLORS[s.sector] ?? 'var(--color-text-muted)'
              return (
                <div key={s.sector_id} className="flex items-center gap-2">
                  <span className="w-28 shrink-0 truncate text-[13px] text-text-secondary">
                    {getSectorName(s.sector, isEs ? 'es' : 'en')}
                  </span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                    <span
                      className="block h-full rounded-full"
                      style={{ width: `${(s.count / sectorMax) * 100}%`, backgroundColor: color }}
                    />
                  </span>
                  <span className="w-12 shrink-0 text-right font-mono text-[12px] tabular-nums text-text-muted">
                    {s.count.toLocaleString(locale)}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <Link
        to="/gap"
        className="group mt-4 inline-flex items-center gap-1.5 text-[13px] text-accent hover:underline rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1"
      >
        {isEs ? 'Ver el registro completo de El Apagón' : 'See the full El Apagón register'}
        <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
      </Link>
    </div>
  )
}
