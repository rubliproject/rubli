/**
 * SelfCaptureBand — §C of /sectors WHO: "LA INTENSIDAD — lo que el tamaño
 * esconde / INTENSITY — what size hides".
 *
 * ProPublica Bailout-Tracker accountability rows + NYT Upshot named callout:
 * the three sectors whose intensity rank most exceeds their VaR rank, lifted
 * out of the buried middle of the money ledger and named. Selection is
 * computed (rankByVaR − rankByOwnSpendShare), never hardcoded — if the data
 * shifts, the honor roll shifts.
 *
 * One line per sector (2026-10-21, owner: numbers, not drawn tracks — the
 * OwnSpendTrack ruler went), institution via EntityIdentityChip
 * in a plain <div> row + a separate "ver sector ↗" link (no nested anchors),
 * rank-delta chip ochre when the jump ≥ 2.
 */
import { useMemo } from 'react'
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import type { LedgerRow } from './ExposureLedger'
import { intensityTextColor, ownSpendShare, rankDeltas } from './confoundScales'

export function SelfCaptureBand({ rows, lang }: { rows: LedgerRow[]; lang: 'en' | 'es' }) {
  const isEs = lang === 'es'

  const picks = useMemo(() => {
    const deltas = rankDeltas(rows)
    return rows
      .map((r) => ({ row: r, d: deltas.get(r.sectorId)! }))
      .filter((x) => x.d && x.d.delta >= 1)
      .sort((a, b) => b.d.delta - a.d.delta || ownSpendShare(b.row) - ownSpendShare(a.row))
      .slice(0, 3)
  }, [rows])

  if (picks.length === 0) return null

  return (
    // «El Contrato» (DESIGN.md §5): an open section; nothing waits behind a click.
    <section className="ct-section" aria-labelledby="sx-suben">
      <div className="ct-annex-row">
        <h2 id="sx-suben" className="ct-h2">
          <span className="ct-sc">{isEs ? 'Los que suben.' : 'The climbers.'}</span>{' '}
          {isEs ? 'Lo que el tamaño esconde' : 'What size hides'}
        </h2>
      </div>
      <p className="ct-measure ct-annex-lede">
        {isEs
          ? 'Estos sectores pesan poco en la mesa del dinero pero queman caliente en su propia gaveta. El orden por monto los entierra; la saturación los expone.'
          : 'These sectors weigh little on the money table but burn hot in their own drawer. The amount ranking buries them; saturation exposes them.'}
      </p>

      <div role="list" className="ct-section-body border-t border-text-primary">
        {picks.map(({ row, d }) => {
          const share = ownSpendShare(row)
          const hot = d.delta >= 2
          const cap = row.topInstitution

          return (
            // One line per sector («La cifra», owner 2026-10-21): rank jump · name, buyer, link · the share — no drawn track.
            <div
              key={row.sectorId}
              role="listitem"
              className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 py-1 border-b border-border last:border-b-0"
            >
              <span className="font-mono tabular-nums whitespace-nowrap" style={{ fontSize: 13 }}>
                <b style={{ fontWeight: 700, color: hot ? 'var(--color-accent-hover)' : 'var(--color-text-secondary)' }}>
                  {String(d.rankVar).padStart(2, '0')}→{String(d.rankIntensity).padStart(2, '0')}
                </b>
                <span style={{ color: 'var(--color-text-muted)' }}> ▲{d.delta}</span>
              </span>
              <div className="min-w-0 flex items-baseline gap-x-2 flex-wrap">
                <span style={{ fontFamily: 'var(--font-family-editorial)', fontWeight: 600, fontSize: 15, color: 'var(--color-text-primary)' }}>
                  {row.name}
                </span>
                {cap && (
                  <span className="inline-flex flex-wrap items-baseline gap-x-2 min-w-0">
                    <EntityIdentityChip type="institution" id={cap.id} name={cap.siglas || cap.name} size="sm" hideIcon fullName className="inline-flex w-auto" />
                    <span className="font-mono tabular-nums whitespace-nowrap" style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
                      {cap.sharePct.toFixed(0)}% {isEs ? 'del sector' : 'of sector'}
                    </span>
                  </span>
                )}
                <EntityIdentityChip
                  type="sector"
                  id={row.sectorId}
                  name={row.name}
                  variant="name"
                  className="py-1 font-mono underline decoration-1 underline-offset-2 hover:opacity-70 transition-opacity whitespace-nowrap focus-visible:ring-accent focus-visible:ring-offset-1"
                  style={{ fontSize: 13, letterSpacing: '0.04em', color: 'var(--color-text-secondary)' }}
                >
                  {isEs ? 'ver sector ↗' : 'view sector ↗'}
                </EntityIdentityChip>
              </div>
              <span className="text-right whitespace-nowrap">
                <span className="tabular-nums" style={{ fontFamily: 'var(--font-family-editorial)', fontWeight: 600, fontSize: 18, color: intensityTextColor(row.avgRiskScore) }}>
                  {(share * 100).toFixed(0)}%
                </span>
                <span className="font-mono" style={{ fontSize: 12, color: 'var(--color-text-muted)' }}> {isEs ? 'del gasto propio' : 'of own spend'}</span>
              </span>
            </div>
          )
        })}
      </div>

    </section>
  )
}
