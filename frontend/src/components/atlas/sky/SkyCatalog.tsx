/**
 * SkyCatalog — «Catálogo / Catalog». Spec .claude/designus/atlas-instruments-2026-10-03/spec-draft.md
 * §3.5 (Stellarium object list; F21: it must never read as the Sep 17 ranked register). Two scopes
 * (Este sistema · Sector · Parientes), two sorts, no column headers, no paging. Parientes (I-S3, §3.5 / §4.2)
 * reads the lazy Kin endpoint for the focused planet: its buyers (fly to the star) and its co-bid partners
 * (fly to the body, or to the main buyer when it has none; the rest counted «n socios no dibujados»). Every row is a fly
 * button: a name, one mono line and a 64 × 8 px log-share tick strip — the orrery radius unrolled.
 * Withheld bodies (in `bodies` but not in the ranking-safe `ranked`) print their public label,
 * never a name (F16). ↑ / ↓ move a roving cursor, Enter flies; the cursor rings its body on the
 * plate through `onHover` (SkyApi.hover) without moving the camera.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import { formatEntityName } from '@/lib/entity/format'
import { formatCompactMXN, formatNumber } from '@/lib/utils'
import { skyCopy } from '@/lib/atlas/sky/copy'
import { shareU, type SkyManifest, type SkySystem } from '@/lib/atlas/sky/geometry'
import { useSkyBand, useSkyKin } from '@/lib/atlas/sky/useSky'
import { FONT_MONO, FONT_SERIF } from './SkyLabels'

import { sectorStars, withheldLabel, type CatHover, type CatScope, type CatSort } from '@/lib/atlas/sky/catalog'

const mono: CSSProperties = { fontFamily: FONT_MONO, fontSize: 12, lineHeight: 1.45, color: 'var(--color-text-secondary)' }
const kicker: CSSProperties = { fontFamily: 'var(--font-sc)', fontWeight: 600, fontSize: 12, letterSpacing: 'var(--track-sc)', color: 'var(--color-text-muted)' }
const RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1'

/** 64 × 8 px: decade ticks 100% · 10 · 1 · 0.1 · 0.01 · ≤ 0.001%, core left → rim right; the marker sits at the body's orbit. */
function TickStrip({ share }: { share: number | null }) {
  if (share == null) return <span aria-hidden="true" style={{ width: 64, flex: '0 0 auto' }} />
  const x = 2 + shareU(Math.max(share, 1e-7)) * 60
  return (
    <svg width={64} height={8} aria-hidden="true" style={{ flex: '0 0 auto', display: 'block' }}>
      <line x1={2} x2={62} y1={4} y2={4} stroke="var(--color-border)" strokeWidth={1} />
      {[0, 1, 2, 3, 4, 5].map((k) => <line key={k} x1={2 + k * 12} x2={2 + k * 12} y1={1} y2={7} stroke="var(--color-text-muted)" strokeWidth={0.75} />)}
      <circle cx={x} cy={4} r={2.5} fill="var(--color-text-primary)" />
    </svg>
  )
}

interface Row { key: string; name: string; muted: boolean; line: string; share: number | null; here?: boolean; fly: () => void; hover: CatHover
  /** Kin: the section kicker printed above the row · a red dashed rule for a ranking-safe potential-collusion pair */
  head?: string; red?: boolean }

interface Props {
  manifest: SkyManifest
  star: number
  system: SkySystem | null
  lang: 'en' | 'es'
  scope: CatScope
  sort: CatSort
  onTab: (scope: CatScope, sort: CatSort) => void
  onFlyBody: (vendorId: number) => void
  onFlyStar: (idx: number) => void
  onHover?: (t: CatHover) => void
  /** the pins block (top of the tab) */
  top?: ReactNode
  /** focus the first row on mount (the `c` key) */
  focusFirst?: boolean
  /** the focused planet's vendor id (Z2) — the Kin scope reads it; null leaves the scope with a prompt */
  planet?: number | null
  phone?: boolean
}

export function SkyCatalog({ manifest, star, system, lang, scope, sort, onTab, onFlyBody, onFlyStar, onHover, top, focusFirst, phone, planet = null }: Props) {
  const S = manifest.stars
  const loc = lang === 'en' ? 'en-US' : 'es-MX'
  const pct = (v: number) => `${(v * 100).toLocaleString(loc, { maximumFractionDigits: v < 0.001 ? 4 : v < 0.01 ? 2 : 1 })}%`
  const sys = system && system.star.id === S.id[star] ? system : null
  const sector = manifest.sectors.find((g) => g.id === S.sector[star])
  const stars = useMemo(() => sectorStars(manifest, star), [manifest, star])
  const idxOf = useMemo(() => {
    const ix = new Map(S.id.map((id, i) => [id, i]))
    manifest.inst_map.raw.forEach((r, k) => { const i = ix.get(manifest.inst_map.canon[k]); if (i !== undefined && !ix.has(r)) ix.set(r, i) })
    return ix
  }, [manifest, S])
  // §3.5 F15: lazy — fetched only while the Kin scope is open, one PK call per planet
  const kin = useSkyKin(scope === 'kin' ? planet : null, manifest.layout_version)
  const kd = scope === 'kin' && planet != null && kin.data ? kin.data : null

  // derived in render: ≤ 60 bodies, or one sector's stars (≤ 1,789) — no memo needed
  const rows: Row[] = (() => {
    if (scope === 'sector') {
      const tot = sector?.value || 1
      // both sorts agree for stars (share = V ÷ the sector's V); the line says which one is read
      return stars.map((i) => ({
        key: `s${i}`, name: formatEntityName('institution', S.name[i], 'full'), muted: false, share: S.v[i] / tot, here: i === star,
        line: `${sort === 'share' ? `${pct(S.v[i] / tot)} · ${formatCompactMXN(S.v[i])}` : `${formatCompactMXN(S.v[i])} · ${pct(S.v[i] / tot)}`}${S.siglas[i] ? ` · ${S.siglas[i]}` : ''}`,
        fly: () => onFlyStar(i), hover: { kind: 'star' as const, idx: i },
      }))
    }
    if (scope === 'kin') {
      if (!kd) return []
      const out: Row[] = []
      const buyers = kd.buyers.map((b) => {
        const j = idxOf.get(b.inst_id)
        return { ...b, j, sh: j !== undefined && S.v[j] ? b.value / S.v[j] : null }
      }).sort((a, b) => (sort === 'share' ? (b.sh ?? 0) - (a.sh ?? 0) : b.value - a.value))
      buyers.forEach((b, n) => {
        const lead = sort === 'share' && b.sh != null ? `${pct(b.sh)} · ${formatCompactMXN(b.value)}` : `${formatCompactMXN(b.value)}${b.sh != null ? ` · ${pct(b.sh)}` : ''}`
        out.push({
          key: `b${b.inst_id}`, head: n === 0 ? skyCopy('kinBuyers', lang) : undefined,
          name: formatEntityName('institution', b.name, 'full'), muted: false, share: b.sh, here: b.j === star,
          line: `${lead}${b.first_year ? ` · ${skyCopy('kinSince', lang, { y: b.first_year })}` : ''}${b.siglas ? ` · ${b.siglas}` : ''}`,
          fly: () => { if (b.j !== undefined) onFlyStar(b.j) }, hover: b.j !== undefined ? { kind: 'star' as const, idx: b.j } : null,
        })
      })
      // co-bid partners by shared procedures (both sorts: a partner has no share of this planet)
      kd.cobid.forEach((c, n) => {
        const j = idxOf.get(c.host_id)
        const body = c.drawn && sys ? sys.bodies.find((x) => x.vendor_id === c.vendor_id) : undefined
        out.push({
          key: `c${c.vendor_id}`, head: n === 0 ? skyCopy('kinCobid', lang) : undefined,
          name: c.name ? formatEntityName('vendor', c.name, 'full') : withheldLabel(c.vendor_id, lang), muted: !c.name,
          share: body ? body.share : null, red: c.red,
          line: [skyCopy('kinShared', lang, { n: formatNumber(c.shared) }), c.red ? skyCopy('collusion', lang) : '',
            c.drawn ? '' : skyCopy('kinNoBody', lang)].filter(Boolean).join(' · '),
          fly: () => { if (c.drawn) onFlyBody(c.vendor_id); else if (j !== undefined) onFlyStar(j) },
          hover: c.drawn ? { kind: 'body' as const, vendor: c.vendor_id } : j !== undefined ? { kind: 'star' as const, idx: j } : null,
        })
      })
      return out
    }
    if (!sys) return []
    const safe = new Set(sys.ranked)
    const list = [...sys.bodies].sort((a, b) => (sort === 'share' ? b.share - a.share : b.value_mxn - a.value_mxn))
    return list.map((b) => {
      const pub = safe.has(b.vendor_id) && !!b.name
      const lead = sort === 'share' ? `${pct(b.share)} · ${formatCompactMXN(b.value_mxn)}` : `${formatCompactMXN(b.value_mxn)} · ${pct(b.share)}`
      return {
        key: `p${b.vendor_id}`, name: pub ? formatEntityName('vendor', b.name, 'full') : withheldLabel(b.vendor_id, lang), muted: !pub,
        share: b.share, line: `${lead} · ${b.first_year}–${b.last_year}`,
        fly: () => onFlyBody(b.vendor_id), hover: { kind: 'body' as const, vendor: b.vendor_id },
      }
    })
  })()

  const [cur, setCur] = useState(0)
  const listRef = useRef<HTMLOListElement>(null)
  const hoverRef = useRef(onHover)
  useEffect(() => { hoverRef.current = onHover })
  useEffect(() => () => hoverRef.current?.(null), [])
  useEffect(() => {
    if (focusFirst) listRef.current?.querySelector<HTMLButtonElement>('button[data-row]')?.focus()
  }, [focusFirst, rows.length > 0]) // eslint-disable-line react-hooks/exhaustive-deps
  const onKey = (e: KeyboardEvent<HTMLOListElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    e.stopPropagation()
    const n = Math.max(0, Math.min(rows.length - 1, cur + (e.key === 'ArrowDown' ? 1 : -1)))
    setCur(n)
    listRef.current?.querySelectorAll<HTMLButtonElement>('button[data-row]')[n]?.focus()
  }

  const chip = (on: boolean): CSSProperties => ({
    fontFamily: FONT_MONO, fontSize: 12, letterSpacing: '0.04em', minHeight: phone ? 44 : 28, padding: '0 10px', cursor: 'pointer', marginLeft: -1,
    border: '1px solid var(--color-border)', color: on ? 'var(--color-background)' : 'var(--color-text-secondary)',
    background: on ? 'var(--color-text-primary)' : 'var(--color-background-card)',
  })
  const [scSys, scSec, scKin] = skyCopy('catScopes', lang).split(' · ')
  const [soMoney, soShare] = skyCopy('catSorts', lang).split(' · ')
  const nW = sys ? sys.bodies.length - sys.bodies.filter((b) => b.name && sys.ranked.includes(b.vendor_id)).length : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
      {top}
      <div className="flex flex-wrap items-center gap-3" style={{ padding: phone ? '8px 0' : '8px 16px', borderBottom: '1px solid var(--color-border)' }}>
        <div role="group" aria-label={skyCopy('catScopeLabel', lang)} className="flex">
          <button type="button" aria-pressed={scope === 'system'} onClick={() => onTab('system', sort)} className={RING} style={chip(scope === 'system')}>{scSys}</button>
          <button type="button" aria-pressed={scope === 'sector'} onClick={() => onTab('sector', sort)} className={RING} style={chip(scope === 'sector')}>{scSec}</button>
          <button type="button" aria-pressed={scope === 'kin'} onClick={() => onTab('kin', sort)} className={RING} style={chip(scope === 'kin')}
            title={planet == null ? skyCopy('kinPick', lang) : undefined}>{scKin}</button>
        </div>
        <div role="group" aria-label={skyCopy('catSortLabel', lang)} className="flex">
          <button type="button" aria-pressed={sort === 'money'} onClick={() => onTab(scope, 'money')} className={RING} style={chip(sort === 'money')}>{soMoney}</button>
          <button type="button" aria-pressed={sort === 'share'} onClick={() => onTab(scope, 'share')} className={RING} style={chip(sort === 'share')}>{soShare}</button>
        </div>
      </div>
      <div style={{ ...kicker, padding: phone ? '6px 0 0' : '6px 16px 0', letterSpacing: '0.04em', textTransform: 'none' }}>
        {scope === 'sector'
          ? skyCopy('catSectorLede', lang, { sector: sector ? (lang === 'en' ? sector.name_en : sector.name_es) : '' })
          : scope === 'kin' ? skyCopy('kinBasis', lang) : skyCopy('catBasis', lang)}
      </div>
      <div style={{ overflowY: 'auto', flex: 1, minHeight: 0, padding: phone ? 0 : '0 16px' }}>
        {scope === 'system' && !sys ? (
          <div style={{ ...kicker, padding: '12px 0' }}>{skyCopy('loadingSystem', lang)}</div>
        ) : scope === 'kin' && (!kd || !kd.drawn) ? (
          <div style={{ ...mono, padding: '12px 0' }}>
            {planet == null ? skyCopy('kinPick', lang) : kin.isError ? skyCopy('bandError', lang) : !kd ? skyCopy('kinLoading', lang) : skyCopy('kinUndrawn', lang)}
          </div>
        ) : (
          <ol ref={listRef} onKeyDown={onKey} aria-label={skyCopy('catLabel', lang)} style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {rows.map((r, n) => (
              <li key={r.key} style={{ contentVisibility: 'auto', containIntrinsicSize: `auto ${phone ? 44 : 52}px` }}>
                {r.head && <div style={{ ...kicker, padding: '10px 0 4px' }}>{r.head}</div>}
                <button
                  type="button" data-row tabIndex={n === cur ? 0 : -1}
                  onClick={r.fly}
                  onFocus={() => { setCur(n); onHover?.(r.hover) }}
                  onMouseEnter={() => onHover?.(r.hover)}
                  onMouseLeave={() => onHover?.(null)}
                  aria-current={r.here ? 'location' : undefined}
                  className={RING}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer',
                    borderBottom: '1px solid var(--color-border)',
                    borderLeft: r.here ? '3px solid var(--color-accent)' : r.red ? '3px dashed var(--color-risk-critical)' : '3px solid transparent',
                    padding: '6px 0 6px 6px', minHeight: phone ? 44 : 52,
                  }}
                >
                  <span style={{ display: 'block', fontFamily: r.muted ? FONT_MONO : FONT_SERIF, fontSize: r.muted ? 12 : 15, lineHeight: 1.25, color: r.muted ? 'var(--color-text-muted)' : 'var(--color-text-primary)' }}>
                    {r.name}{r.here ? ` · ${skyCopy('catHere', lang)}` : ''}
                  </span>
                  <span className="flex items-center justify-between gap-2" style={mono}>
                    <span>{r.line}</span>
                    <TickStrip share={r.share} />
                  </span>
                </button>
              </li>
            ))}
            {scope === 'system' && sys?.remainder.map(([y, v, nv]) => (
              <BandYearRow key={`r${y}`} inst={sys.star.id} lv={sys.layout_version} year={y} n={nv} v={v} lang={lang} />
            ))}
          </ol>
        )}
      </div>
      <div style={{ ...mono, padding: phone ? '6px 0' : '6px 16px 22px', borderTop: '1px solid var(--color-border)' }}>
        {scope === 'sector'
          ? skyCopy('catFooterSector', lang, { n: formatNumber(rows.length) })
          : scope === 'kin'
            ? [kd && kd.n_buyers > kd.buyers.length ? skyCopy('kinMore', lang, { n: formatNumber(kd.n_buyers - kd.buyers.length) }) : '',
                kd?.drawn && !kd.cobid.length ? skyCopy('cobidNone', lang) : '',
                kd?.drawn ? skyCopy('kinNotDrawn', lang, { n: formatNumber(kd.n_cobid_not_drawn) }) : '',
                skyCopy('cobidBasis', lang)].filter(Boolean).join(' · ')
            : skyCopy('catFooter', lang, { n: formatNumber(sys?.bodies.length ?? 0), w: formatNumber(nW) })}
      </div>
    </div>
  )
}

/** Weekend E2: a band year is a toggle; opening it fetches /atlas/sky/band and names the members
 *  (ranking-safe, by amount, ≤ 60) instead of only the per-year total. */
export function BandYearRow({ inst, lv, year, n, v, lang }: { inst: number; lv: string; year: number; n: number; v: number; lang: 'en' | 'es' }) {
  const [open, setOpen] = useState(false)
  const band = useSkyBand(open ? inst : null, open ? year : null, lv)
  const listId = `band-${inst}-${year}`
  return (
    <li style={{ borderBottom: '1px solid var(--color-border)' }}>
      <button type="button" aria-expanded={open} aria-controls={listId} onClick={() => setOpen((o) => !o)} className={RING}
        style={{ ...mono, display: 'flex', width: '100%', minHeight: 44, alignItems: 'center', justifyContent: 'space-between', gap: 8, textAlign: 'left', background: 'none', border: 0, padding: '6px 0', cursor: 'pointer' }}>
        <span>{skyCopy('bandYear', lang, { y: year, n: formatNumber(n), v: formatCompactMXN(v) })}</span>
        <span aria-hidden="true">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div id={listId} style={{ padding: '0 0 8px' }}>
          {band.isPending ? (
            <div style={mono}>{skyCopy('bandLoading', lang)}</div>
          ) : band.isError || !band.data ? (
            <div style={mono}>{skyCopy('bandError', lang)}</div>
          ) : (
            <>
              <div style={mono}>{skyCopy('bandNamed', lang, { k: formatNumber(band.data.members.length), n: formatNumber(band.data.n_vendors) })}</div>
              <ol style={{ listStyle: 'none', margin: '4px 0 0', padding: 0 }}>
                {band.data.members.map((m) => (
                  <li key={m.vendor_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <EntityIdentityChip type="vendor" id={m.vendor_id} name={m.name} size="sm" fullName hideIcon />
                    <span style={{ ...mono, whiteSpace: 'nowrap' }}>{formatCompactMXN(m.value_mxn)}</span>
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>
      )}
    </li>
  )
}
