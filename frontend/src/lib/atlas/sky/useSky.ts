/**
 * «El Atlas» sky data — the only two eager calls (spec §2.9, F12):
 * GET /atlas/sky/manifest (JSON) and, on desktop only, GET /atlas/sky/planets.bin.
 * Both are immutable per layout_version (ETag). The manifest is fresh for 5 min, then served stale while it
 * revalidates (max-age=300, stale-while-revalidate=86400); the bin is revalidated every visit. The bin is decoded
 * once; bodies arrive pre-sorted by host star (V desc) then share desc, which is
 * the label priority order S2 consumes.
 */
import { useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { SECTOR_NAMES_ES } from '@/lib/constants'
import { decodeBodies, type SkyBodies, type SkyManifest, type SkySystem } from './geometry'

const DAY = 24 * 60 * 60 * 1000

/** Set by a planets.bin 409: the next manifest fetch must bypass the browser's cached copy. */
let manifestOutdated = false

/** Shared with App.tsx, which starts the manifest on landing at `/`, before the Portada chunk loads. */
export const skyManifestQuery = {
  queryKey: ['atlas-sky', 'manifest'],
  // The browser's HTTP cache answers within max-age (no round trip). After a bin 409 the cached copy is from
  // another layout_version, so that one refetch REVALIDATES (ETag → 304 or the new version) instead of
  // reusing it — otherwise the chart never loads (seen on prod 2026-10-02 after the S3 cache change).
  queryFn: async () => {
    const r = await fetch(`${api.defaults.baseURL ?? '/api/v1'}/atlas/sky/manifest`, {
      cache: manifestOutdated ? 'no-cache' : 'default',
    })
    if (!r.ok) throw new Error(`manifest ${r.status}`)
    manifestOutdated = false
    const m = (await r.json()) as SkyManifest
    // the manifest's name_es is ASCII («Energia»); restore the accents from the canonical names, keep «Medio Ambiente»
    const bare = (x: string) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    for (const g of m.sectors) { const es = SECTOR_NAMES_ES[g.code]; if (es && bare(es) === bare(g.name_es)) g.name_es = es }
    return m
  },
  staleTime: DAY,
}

export function useSky(withBodies: boolean) {
  const qc = useQueryClient()
  const manifest = useQuery(skyManifestQuery)
  const lv = manifest.data?.layout_version
  const bin = useQuery({
    queryKey: ['atlas-sky', 'planets', lv],
    // fetch, not axios: the shared instance's response pipeline does not hand back a raw ArrayBuffer.
    // `?lv=` pins the bin to this manifest; 409 = the chart was recomputed → refetch the manifest.
    queryFn: async () => {
      const r = await fetch(`${api.defaults.baseURL ?? '/api/v1'}/atlas/sky/planets.bin?lv=${encodeURIComponent(lv!)}`, { cache: 'no-cache' })
      if (r.status === 409) {
        manifestOutdated = true
        void qc.invalidateQueries({ queryKey: ['atlas-sky', 'manifest'] })
      }
      if (!r.ok) throw new Error(`planets.bin ${r.status}`)
      return r.arrayBuffer()
    },
    structuralSharing: false,
    staleTime: DAY,
    enabled: withBodies && !!lv,
  })
  const bodies = useMemo<SkyBodies | null>(
    () => (manifest.data && bin.data ? decodeBodies(bin.data, manifest.data) : null),
    [manifest.data, bin.data],
  )
  return { manifest: manifest.data ?? null, bodies, error: manifest.error ?? bin.error ?? null }
}

/**
 * GET /atlas/sky/system?inst= — lazy, one per located star (F12: only after the
 * flight `end`, never during). Immutable per layout_version.
 */
export const skySystemQuery = (inst: number | null, lv: string | undefined) => ({
  queryKey: ['atlas-sky', 'system', lv, inst],
  queryFn: async () => (await api.get<SkySystem>('/atlas/sky/system', { params: { inst } })).data,
  staleTime: DAY,
})
export function useSkySystem(inst: number | null, lv: string | undefined) {
  return useQuery({ ...skySystemQuery(inst, lv), enabled: inst != null && !!lv })
}

/** GET /atlas/sky/band — one star's «resto» members for one arrival year (weekend E2). */
export interface SkyBand {
  inst: number
  year: number
  n_vendors: number
  value_mxn: number
  members: { vendor_id: number; name: string; value_mxn: number; n_contracts: number; first_year: number | null; last_year: number | null }[]
}

/** Lazy: fetched only when a band row is opened (phone) or hovered (desktop). */
export function useSkyBand(inst: number | null, year: number | null, lv: string | undefined) {
  return useQuery({
    queryKey: ['atlas-sky', 'band', lv, inst, year],
    queryFn: async () => (await api.get<SkyBand>('/atlas/sky/band', { params: { inst, year } })).data,
    enabled: inst != null && year != null && !!lv,
    staleTime: DAY,
  })
}

/** GET /atlas/sky/kin/{planet} — instruments §3.5 «Parientes»: buyers, years at the host, co-bid partners.
 *  Names are null for withheld vendors (ranking_safe); partners with no body carry their main buyer as host_id. */
export interface SkyKin {
  vendor_id: number; drawn: boolean; host_id: number; withheld: boolean
  years_here: [number, number, number][]
  buyers: { inst_id: number; name: string; siglas: string; value: number; first_year: number | null }[]
  n_buyers: number
  cobid: { vendor_id: number; name: string | null; shared: number; red: boolean; drawn: boolean; host_id: number }[]
  n_cobid_not_drawn: number
}

/** Lazy: fired only when the Kin scope is open (never per J/K step). */
export function useSkyKin(vendor: number | null, lv: string | undefined) {
  return useQuery({
    queryKey: ['atlas-sky', 'kin', lv, vendor],
    queryFn: async () => (await api.get<SkyKin>(`/atlas/sky/kin/${vendor}`)).data,
    enabled: vendor != null && !!lv,
    staleTime: DAY,
  })
}

/** GET /atlas/sky/system?vendor= — a search hit's host, sky membership and band year (§3.9). */
export const fetchSystemForVendor = async (vendor: number) =>
  (await api.get<SkySystem>('/atlas/sky/system', { params: { vendor } })).data

/** sky-dive: GET /atlas/sky/layers — per-star arrays in manifest order + bits per drawn body (LAYERS.md). */
export interface SkyLayersPayload {
  layout_version: string
  bits: { sigue: number; captura: number; pareja: number; mismo_dia: number; senal: number; arranque: number }
  stars: { avg: (number | null)[]; grade: (number | null)[]; da: (number | null)[]; sb: (number | null)[]; post: number[]; cap: number[]; pareja: number[]; mismo_dia: number[]; senal: number[] }
  bodies: { id: number[]; bits: number[] }
}
/** Decoded: `bodyBits[bodyIdx]` (0 = none) next to the star columns. */
export interface SkyLayers {
  stars: SkyLayersPayload['stars']; bits: SkyLayersPayload['bits']; bodyBits: Uint8Array
  /** the same bits by vendor id (the phone has no bin) */
  byVendor: Map<number, number>
}

export function useSkyLayers(manifest: SkyManifest | null | undefined, bodies: SkyBodies | null | undefined) {
  const q = useQuery({
    queryKey: ['atlas-sky', 'layers', manifest?.layout_version],
    queryFn: async () => (await api.get<SkyLayersPayload>('/atlas/sky/layers')).data,
    enabled: !!manifest,
    staleTime: DAY,
  })
  return useMemo<SkyLayers | null>(() => {
    const d = q.data
    if (!d || !manifest || d.layout_version !== manifest.layout_version) return null
    const bodyBits = new Uint8Array(bodies?.n ?? 0)
    if (bodies) d.bodies.id.forEach((v, k) => { const i = bodies.index.get(v); if (i !== undefined) bodyBits[i] = d.bodies.bits[k] })
    return { stars: d.stars, bits: d.bits, bodyBits, byVendor: new Map(d.bodies.id.map((v, k) => [v, d.bodies.bits[k]])) }
  }, [q.data, manifest, bodies])
}

/** sky-dive: GET /atlas/sky/apagon — a supplier's post-blackout ComprasMX contracts (unscored). */
export interface SkyApagon {
  vendor_id: number; n_contracts: number; value_mxn: number; n_review: number; withheld: boolean; scored: false
  contracts: { code: string; date: string; amount_mxn: number; review: boolean; institution_id: number | null; procedure: string | null; direct_award: boolean; institution_name: string; siglas: string; early_days: number | null }[]
}
export function useSkyApagon(vendor: number | null) {
  return useQuery({
    queryKey: ['atlas-sky', 'apagon', vendor],
    queryFn: async () => (await api.get<SkyApagon>('/atlas/sky/apagon', { params: { vendor } })).data,
    // Off since 2026-10-27: the ComprasMX contracts are scored moons in the main corpus now, so the grey
    // «Apagón» squares only drew them twice. With no data the toggle hides (desktop and phone).
    enabled: false,
    staleTime: DAY,
  })
}

/** sky-dive: GET /atlas/sky/contract-signals — the contract card's antes del fallo / plazo reducido. */
export interface SkyContractSignals {
  contract_id: number
  antes_del_fallo: { days: number } | null
  plazo_reducido: { days: number; minimum: number; international: boolean } | null
}
export function useContractSignals(id: number | null) {
  return useQuery({
    queryKey: ['atlas-sky', 'contract-signals', id],
    queryFn: async () => (await api.get<SkyContractSignals>('/atlas/sky/contract-signals', { params: { id } })).data,
    enabled: id != null,
    staleTime: DAY,
    retry: false,
  })
}
