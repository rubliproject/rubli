/**
 * SkySearch — the verb «Volar» (`/`). Spec .claude/designs/atlas-2026-10-02-spec.md §3.9
 * (graft G4 from «La Bitácora de Vuelo»). Stars match client-side from the manifest;
 * suppliers come from vendorApi.search. A supplier with a body flies to it; a band
 * member flies to its host and pulses its year segment with «El Expediente» open; a
 * supplier off the chart says so, offers its dossier chip (the chain's end) and
 * «Volar a su principal comprador» via /atlas/sky/system?vendor=. Rows are plain
 * buttons with catalog numbers (PV / INS).
 */
import { useEffect, useMemo, useState, type CSSProperties, type RefObject } from 'react'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { vendorApi } from '@/api/client'
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import { formatEntityName } from '@/lib/entity/format'
import { formatCompactMXN } from '@/lib/utils'
import { skyCopy } from '@/lib/atlas/sky/copy'
import { fetchSystemForVendor } from '@/lib/atlas/sky/useSky'
import type { SkyBodies, SkyManifest, SkySystemBody } from '@/lib/atlas/sky/geometry'
import { FONT_MONO, FONT_SERIF } from './SkyLabels'

export interface BandHit { star: number; year: number; row: SkySystemBody }

interface Props {
  manifest: SkyManifest
  bodies: SkyBodies
  lang: 'en' | 'es'
  inputRef: RefObject<HTMLInputElement | null>
  onFlyStar: (idx: number) => void
  onFlyBody: (idx: number) => void
  onBand: (hit: BandHit) => void
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const rowBtn: CSSProperties = {
  display: 'flex', width: '100%', gap: 8, alignItems: 'baseline', textAlign: 'left', background: 'transparent',
  border: 'none', borderBottom: '1px solid var(--color-border)', padding: '5px 10px', cursor: 'pointer',
  fontFamily: FONT_SERIF, fontSize: 14, lineHeight: 1.25, color: 'var(--color-text-primary)',
}
const meta: CSSProperties = { fontFamily: FONT_MONO, fontSize: 12, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }
const head: CSSProperties = { ...meta, fontFamily: 'var(--font-sc)', fontWeight: 600, fontSize: 12, letterSpacing: 'var(--track-sc)', padding: '6px 10px 2px' }

export function SkySearch({ manifest, bodies, lang, inputRef, onFlyStar, onFlyBody, onBand }: Props) {
  const qc = useQueryClient()
  const [q, setQ] = useState('')
  const [dq, setDq] = useState('')
  const [open, setOpen] = useState(false)
  const [off, setOff] = useState<{ id: number; name: string; star: number | null } | null>(null)
  useEffect(() => { const t = window.setTimeout(() => setDq(q.trim()), 250); return () => window.clearTimeout(t) }, [q])

  const S = manifest.stars
  const folded = useMemo(() => S.name.map((n, i) => `${fold(n)} ${fold(S.siglas[i])}`), [S])
  const stars = useMemo(() => {
    if (dq.length < 2) return []
    const f = fold(dq), out: number[] = []
    for (let i = 0; i < folded.length && out.length < 6; i++) if (folded[i].includes(f)) out.push(i) // manifest is V-desc
    return out
  }, [dq, folded])
  const vq = useQuery({
    queryKey: ['atlas-sky-search', dq],
    placeholderData: keepPreviousData,
    queryFn: () => vendorApi.search(dq, 8),
    enabled: dq.length >= 3,
    staleTime: 5 * 60 * 1000,
  })
  const starIdx = useMemo(() => new Map(S.id.map((id, i) => [id, i])), [S])

  const pickVendor = async (id: number, name: string) => {
    setOff(null)
    const i = bodies.index.get(id)
    if (i !== undefined) { setOpen(false); return onFlyBody(i) }
    const sys = await fetchSystemForVendor(id).catch(() => null)
    const f = sys?.focus
    const host = sys ? starIdx.get(sys.star.id) ?? null : null
    if (sys) qc.setQueryData(['atlas-sky', 'system', manifest.layout_version, sys.star.id], { ...sys, focus: null })
    if (f?.drawn && bodies.index.has(f.vendor_id)) { setOpen(false); return onFlyBody(bodies.index.get(f.vendor_id)!) }
    if (f?.sky && f.row && host != null) { setOpen(false); return onBand({ star: host, year: f.year ?? 2002, row: f.row }) }
    setOff({ id, name, star: host })
  }

  const vendors = vq.data?.data ?? []
  const any = stars.length > 0 || vendors.length > 0
  return (
    <div style={{ position: 'relative', width: 340 }} onKeyDown={(e) => { if (e.key === 'Escape') { setOpen(false); inputRef.current?.blur() } }}>
      <input
        ref={inputRef}
        type="search"
        value={q}
        placeholder={`${skyCopy('search', lang)}  ( / )`}
        aria-label={skyCopy('search', lang)}
        onChange={(e) => { setQ(e.target.value); setOpen(true); setOff(null) }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return
          if (stars.length) { setOpen(false); onFlyStar(stars[0]) } else if (vendors.length) void pickVendor(vendors[0].id, vendors[0].name)
        }}
        style={{
          width: '100%', fontFamily: FONT_SERIF, fontSize: 15, padding: '5px 10px', color: 'var(--color-text-primary)',
          background: 'var(--color-background)', border: '1px solid var(--color-border)', borderRadius: 0,
        }}
      />
      {open && dq.length >= 2 && (
        <div
          role="listbox"
          aria-label={skyCopy('search', lang)}
          style={{ position: 'absolute', top: '100%', left: 0, right: 0, maxHeight: 420, overflowY: 'auto', background: 'var(--color-background-card)', border: '1px solid var(--color-border)', borderTop: 'none', zIndex: 6 }}
        >
          {off ? (
            <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontFamily: FONT_SERIF, fontSize: 14 }}>{formatEntityName('vendor', off.name, 'full')} <span style={meta}>PV {off.id}</span></div>
              <div style={{ ...meta, whiteSpace: 'normal', fontSize: 12 }}>{skyCopy('notOnChart', lang)}</div>
              {off.star != null && (
                <button type="button" style={{ ...rowBtn, padding: '4px 0', fontFamily: FONT_MONO, fontSize: 12, color: 'var(--color-accent-text)', textTransform: 'uppercase', letterSpacing: '0.04em' }}
                  onClick={() => { setOpen(false); onFlyStar(off.star!) }}>
                  {skyCopy('flyBuyer', lang)} › {formatEntityName('institution', S.name[off.star], 'full')}
                </button>
              )}
              <span style={head}>{skyCopy('dossierVendor', lang)}</span>
              <EntityIdentityChip type="vendor" id={off.id} name={off.name} size="sm" fullName />
            </div>
          ) : (
            <>
              {stars.length > 0 && <div style={head}>{skyCopy('stars', lang)}</div>}
              {stars.map((i) => (
                <button key={`s${i}`} type="button" role="option" aria-selected={false} style={rowBtn} onClick={() => { setOpen(false); onFlyStar(i) }}>
                  <span style={{ flex: 1 }}>{formatEntityName('institution', S.name[i], 'full')}</span>
                  <span style={meta}>{formatCompactMXN(S.v[i])}</span>
                </button>
              ))}
              {vendors.length > 0 && <div style={head}>{skyCopy('vendors', lang)}</div>}
              {vendors.map((v) => (
                <button key={`v${v.id}`} type="button" role="option" aria-selected={false} style={rowBtn} onClick={() => void pickVendor(v.id, v.name)}>
                  <span style={{ flex: 1 }}>{formatEntityName('vendor', v.name, 'full')}</span>
                  <span style={meta}>PV {v.id}{bodies.index.has(v.id) ? ` · ${skyCopy('onChart', lang)}` : ''}</span>
                </button>
              ))}
              {!any && <div style={{ ...head, textTransform: 'none' }}>{vq.isFetching ? skyCopy('searching', lang) : skyCopy('noResults', lang)}</div>}
            </>
          )}
        </div>
      )}
    </div>
  )
}
