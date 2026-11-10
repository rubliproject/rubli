/**
 * The wire's data (DESIGN.md §5, template v3 2026-10-28): GET /events → the week's items.
 * Pure, so the selection and the words are tested (wire.test.ts). Vendors are never named here:
 * the feed does not say which vendors are personas físicas (DESIGN.md §0.6), so a vendor event
 * reads through its buyer and its contract. (The digest below names a vendor only when the feed
 * carries its id: scripts/precompute_events.py nulls the vendor of every persona física.)
 */
import { api } from '@/api/client'

export type EventType = 'award' | 'first_supplier' | 'critical' | 'direct_spike' | 'weekly_refresh' | 'month_close'

export interface FeedEvent {
  type: EventType
  date: string
  title_es: string
  title_en: string
  amount: number | null
  institution_id: number | null
  institution: string | null
  /** The buyer's published siglas (feeds written after 2026-11-03). */
  institution_siglas?: string | null
  vendor_id: number | null
  /** Null for an RFC-shaped name (feeds written before 2026-11-05 also null a persona física). */
  vendor?: string | null
  /** A persona física, named and labelled (owner policy 2026-10-29); absent from older feeds. */
  persona_fisica?: boolean
  contract_id: number | null
  risk_level: string | null
  /** The indicator (0–1); absent from feeds written before 2026-10-29. */
  risk_score?: number | null
  sector_id: number | null
  detail?: Record<string, unknown> | null
}

export interface EventsFeed {
  meta: { cut: string }
  total?: number
  events: FeedEvent[]
}

/** One request serves the wire and the Portada's «Lo más reciente» (same key, one fetch). */
export const EVENTS_LIMIT = 150
export const eventsQuery = {
  queryKey: ['events', 'feed', EVENTS_LIMIT] as const,
  queryFn: async (): Promise<EventsFeed> => (await api.get<EventsFeed>('/events', { params: { limit: EVENTS_LIMIT } })).data,
  staleTime: 10 * 60 * 1000,
  retry: false,
}

export interface WireItem {
  key: string
  type: EventType
  date: string
  institutionId: number | null
  institution: string | null
  sectorId: number | null
  /** The words after the buyer (or the whole item when there is no buyer). */
  text: string
  /** Where the words link: the contract, or the record. */
  href: string
  critical: boolean
}

const DAY = 86_400_000
const pct = (x: unknown) => (typeof x === 'number' ? `${Math.round(x * 100)}%` : '—')

/** The events of the 7 days ending at the newest event (never a stale week dressed as this one). */
export function weekOf(events: FeedEvent[]): FeedEvent[] {
  if (!events.length) return []
  const newest = Math.max(...events.map((e) => Date.parse(e.date)))
  return events.filter((e) => Date.parse(e.date) > newest - 7 * DAY)
}

/** The Portada board's window of `size` rows at step `offset`. The group's first `week` rows (its tab count) stay
 *  pinned on top while only the older rows under the week's rule roll, so the rows above the rule always equal the
 *  count (owner 2026-11-03: «9 in the tab, 8 above the line»). A week that fills the board rolls as one window. */
export function boardWindow<T>(rows: T[], week: number, size: number, offset: number): T[] {
  const off = Math.max(0, Math.min(offset, rows.length - size))
  if (week > 0 && week < size) return [...rows.slice(0, week), ...rows.slice(week + off, off + size)]
  return rows.slice(off, off + size)
}

const RANK: Record<EventType, number> = { weekly_refresh: 0, critical: 1, award: 2, first_supplier: 3, direct_spike: 4, month_close: 5 }
/** Breaking-news order: the newest date first; within a day the load itself, then crítico, then the largest amount. */
export function newestFirst(events: FeedEvent[]): FeedEvent[] {
  return events.slice().sort((a, b) => b.date.localeCompare(a.date) || RANK[a.type] - RANK[b.type] || (b.amount ?? 0) - (a.amount ?? 0))
}

/** «hace 3 días» / «3 days ago» from the item's own date (whole days; the data is weekly, never «ahora»). */
export function ago(iso: string, lang: 'es' | 'en', now = Date.now()): string {
  const t = new Date(now)
  // calendar days between the two local dates (noon to noon: no DST edge)
  const d = Math.max(0, Math.round((new Date(t.getFullYear(), t.getMonth(), t.getDate(), 12).getTime() - Date.parse(`${iso.slice(0, 10)}T12:00:00`)) / DAY))
  if (d === 0) return lang === 'en' ? 'today' : 'hoy'
  if (d === 1) return lang === 'en' ? 'yesterday' : 'ayer'
  return lang === 'en' ? `${d} days ago` : `hace ${d} días`
}

/** How long one wire item holds (stepped feed, DESIGN.md §7): ~15 characters a second read + 1.5 s to find the line, 4–8 s. */
export function dwellMs(chars: number): number {
  return Math.min(8000, Math.max(4000, 1500 + chars * 65))
}

export function wireItems(events: FeedEvent[], lang: 'es' | 'en', money: (n: number) => string, max = 24): WireItem[] {
  const en = lang === 'en'
  const out: WireItem[] = []
  const seen = new Set<number>()  // one contract, one line: its higher-ranked event (crítico before award)
  for (const e of newestFirst(weekOf(events))) {
    if (e.contract_id != null) { if (seen.has(e.contract_id)) continue; seen.add(e.contract_id) }
    const amt = e.amount != null ? money(e.amount) : null
    const toContract = e.contract_id != null ? `/contracts/${e.contract_id}` : null
    let text: string | null = null
    let href: string | null = toContract
    switch (e.type) {
      // one plain what-happened clause after the buyer's chip (owner 2026-11-02: «a breaking news thing»)
      case 'critical':
        if (amt) text = en ? `signed a ${amt} contract with a critical risk indicator (≥ 0.60)` : `firmó un contrato de ${amt} con indicador de riesgo crítico (≥ 0.60)`
        break
      case 'award':
        if (amt) text = (en ? `awarded a ${amt} contract` : `adjudicó un contrato de ${amt}`) + (e.detail?.direct_award ? (en ? ' without a tender' : ' sin concurso') : '')
        break
      case 'first_supplier':
        if (amt) text = en ? `gave a new supplier its first contract: ${amt}` : `dio su primer contrato a un proveedor nuevo: ${amt}`
        break
      case 'direct_spike': {
        const d = e.detail ?? {}
        text = en
          ? `direct awards rose to ${pct(d.recent_share)} of value in 14 days (${pct(d.trailing_share)} over 12 months)`
          : `la adjudicación directa subió a ${pct(d.recent_share)} del valor en 14 días (${pct(d.trailing_share)} en 12 meses)`
        href = e.institution_id != null ? `/institutions/${e.institution_id}` : null
        break
      }
      case 'weekly_refresh':
      case 'month_close':
        // no names in these titles: the feed's own sentence
        text = en ? e.title_en : e.title_es
        href = '/contracts'
        break
    }
    if (!text || !href) continue
    out.push({
      key: `${e.type}-${e.date}-${e.contract_id ?? e.institution_id ?? "x"}-${out.length}`,
      type: e.type,
      date: e.date,
      institutionId: e.institution_id,
      institution: e.institution,
      sectorId: e.sector_id,
      text,
      href,
      critical: e.type === 'critical' || e.risk_level === 'critical',
    })
    if (out.length >= max) break
  }
  return out
}

export type DigestType = 'award' | 'critical' | 'first_supplier' | 'direct_spike'
export interface DigestGroup { type: DigestType; n: number; items: FeedEvent[] }
export interface Digest {
  from: string
  to: string
  /** False when the fetched page may have cut the week short: the counts are then not printed. */
  complete: boolean
  groups: DigestGroup[]
}

const lift = (e: FeedEvent) => Number(e.detail?.recent_share ?? 0) - Number(e.detail?.trailing_share ?? 0)
const byAmount = (a: FeedEvent, b: FeedEvent) => (b.amount ?? 0) - (a.amount ?? 0)

/**
 * «Lo más reciente» (Portada): the week's events grouped by what happened, `max` per group. A contract
 * listed among the large awards is not repeated under «crítico»; an empty group is dropped.
 */
export function digest(feed: EventsFeed, max = 5): Digest | null {
  const week = weekOf(feed.events)
  if (!week.length) return null
  const dates = week.map((e) => e.date).sort()
  const oldest = feed.events.reduce((m, e) => (e.date < m ? e.date : m), feed.events[0].date)
  const complete = feed.total == null || feed.total <= feed.events.length || oldest < dates[0]
  const of = (t: DigestType) => week.filter((e) => e.type === t)
  const award = of('award').sort(byAmount).slice(0, max)
  const shown = new Set(award.map((e) => e.contract_id))
  const groups: DigestGroup[] = [
    { type: 'award', n: of('award').length, items: award },
    { type: 'critical', n: of('critical').length, items: of('critical').filter((e) => !shown.has(e.contract_id)).sort(byAmount).slice(0, max) },
    { type: 'first_supplier', n: of('first_supplier').length, items: of('first_supplier').sort((a, b) => b.date.localeCompare(a.date) || byAmount(a, b)).slice(0, max) },
    { type: 'direct_spike', n: of('direct_spike').length, items: of('direct_spike').sort((a, b) => lift(b) - lift(a)).slice(0, max) },
  ]
  return { from: dates[0], to: dates[dates.length - 1], complete, groups: groups.filter((g) => g.items.length) }
}
