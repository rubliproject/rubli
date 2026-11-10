/**
 * BuyersLedger — «Los Compradores» (gap redesign, 2026-07-03).
 *
 * The buyers are the only counterparty this dataset reliably names — extracted OUT
 * of the methodology block into their own named ledger (NYT-Upshot mechanic: names
 * ON the chart). A single amber tone across all rows — the 0–100 score is a
 * STRUCTURAL indicator, not the v0.9.2 model; ladder colors would falsely claim it.
 * Row click filters the register by siglas (the /gap/contracts `q` param LIKE-matches
 * institution_siglas today — no backend change).
 */
import type { GapSummaryResponse } from '@/api/types'
import { RISK_COLORS, textInk } from '@/lib/constants'
import { formatNumber } from '@/lib/utils'
import { DotBar } from '@/components/ui/DotBar'

/** ComprasMX siglas arrive with stray whitespace (a leading tab) and, for some
 *  buying units, as a bare numeric unit code — trim the one, label the other. */
function cleanSiglas(raw: string): string {
  return raw.trim()
}
function displaySiglas(siglas: string, es: boolean): string {
  return /^\d+$/.test(siglas) ? `${es ? 'Unidad' : 'Unit'} ${siglas}` : siglas
}

export function BuyersLedger({ items, lang, onPick }: {
  items: GapSummaryResponse['worst_institutions']; lang: 'en' | 'es'; onPick: (siglas: string) => void
}) {
  if (!items.length) return null
  const es = lang === 'es'
  return (
    <div>
      <div className="text-[10.5px] font-bold tracking-[0.18em] uppercase text-text-muted font-mono mb-3">
        {es ? 'LOS COMPRADORES · MAYOR CONCENTRACIÓN DE ALERTAS' : 'THE BUYERS · HIGHEST ALERT CONCENTRATION'}
      </div>
      <div className="divide-y divide-border">
        {items.map((raw, i) => {
          const inst = { ...raw, siglas: cleanSiglas(raw.siglas) }
          const label = displaySiglas(inst.siglas, es)
          return (
          <button key={inst.siglas} onClick={() => onPick(inst.siglas)}
            className="w-full grid grid-cols-[1.4rem_1fr_auto] items-center gap-x-3 py-2 text-left cursor-pointer hover:bg-surface-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset"
            aria-label={es ? `Filtrar el registro por ${label}` : `Filter the register by ${label}`}>
            <span className="font-mono text-[11px] text-text-muted tabular-nums text-right">{i + 1}</span>
            {/* The siglas ARE the ranking — a truncated one ranks nothing. The
                22-dot strip beside them is ~198px of fixed width, which at 390
                left this 1fr column about one character wide and `truncate`
                cut every row to "I…" / "A…" / "B…". The strip drops below `sm`
                and the code reads in full; the score and the count, the two
                quantities, stay at every width. */}
            <span className="font-mono text-[14px] font-semibold text-text-primary whitespace-nowrap">{label}</span>
            <span className="flex items-center gap-2 justify-self-end">
              <span className="hidden sm:block">
                <DotBar value={inst.avg_score} max={100} dots={22} color={RISK_COLORS.high} ariaLabel={`${label}: ${inst.avg_score}`} />
              </span>
              <span className="font-mono text-xs tabular-nums" style={{ color: textInk(RISK_COLORS.high, true) }}>{inst.avg_score.toFixed(1)}</span>
              <span className="font-mono text-[10px] text-text-muted w-14 text-right">({formatNumber(inst.count)})</span>
            </span>
          </button>
          )
        })}
      </div>
      <div className="mt-3 text-[10px] text-text-muted font-mono leading-snug">
        {es
          ? 'Indicador estructural 0–100 (promedio por institución, mínimo 50 procedimientos) — no es el modelo v0.9.2. Clic en una fila para filtrar el registro.'
          : 'Structural indicator 0–100 (per-institution average, min. 50 procedures) — not the v0.9.2 model. Click a row to filter the register.'}
      </div>
    </div>
  )
}
