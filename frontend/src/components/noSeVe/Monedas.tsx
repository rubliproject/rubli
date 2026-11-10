/**
 * «De cada cien pesos» (concept A): 100 coins, the visible pesos filled, bottom row first. Ten rows of the
 * canonical <DotBar> (CLAUDE.md rule 11: dot charts only through it), each row ten coins of one peso.
 * Over 100% (multi-year signatures booked at signing) every coin fills; the numeral beside it says how much.
 * `hollow` = no register at all (Pemex, CFE): dashed empty coins.
 * `empty` = the unfilled coins' colour (default the border token).
 * `upTo` = an upper bound (a share, like `share`): the coins between `share` and it are hatched —
 * «could be covered, at most» (the cover: 2020–21 contracts that may pay for 2022–24 work).
 */
import { DotBar } from '@/components/ui/DotBar'

export function Monedas({ share, color, size = 'sm', hollow, label, upTo, empty = 'var(--color-border)' }: { share: number; color: string; size?: 'sm' | 'md' | 'lg'; hollow?: boolean; label: string; upTo?: number; empty?: string }) {
  const r = size === 'lg' ? 6 : size === 'md' ? 4 : 3, gap = size === 'lg' ? 15 : size === 'md' ? 10 : 8
  const pesos = Math.max(0, Math.min(100, share * 100))
  const top = upTo == null ? null : Math.max(pesos, Math.min(100, Math.round(upTo * 100)))
  return (
    <span className={`nsv-coins is-${size}`} role="img" aria-label={label}>
      {Array.from({ length: 10 }, (_, i) => 9 - i).map((row) => (
        <DotBar key={row} value={Math.max(0, Math.min(10, pesos - row * 10))} max={10} dots={10} dotR={r} dotGap={gap}
          rangeTo={top == null ? undefined : Math.max(0, Math.min(10, top - row * 10))}
          color={color} emptyColor={hollow ? 'transparent' : empty} emptyStroke={hollow ? 'var(--color-text-muted)' : undefined} />
      ))}
    </span>
  )
}
