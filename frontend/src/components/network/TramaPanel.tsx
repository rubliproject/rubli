/**
 * TramaPanel — «La Trama · co-adjudicación», the co-award mesh inside El Mapa's
 * Vínculos view (merge spec _polish/merge/SPEC.md § 5, step 2).
 *
 * It takes the sky's 380px dock slot (desktop) or a full-width sheet (phone):
 *   1  header + the gloss (CompraNet records winners, not bidders)
 *   2  MeshPlano, compact (~150px) — the community picker (kept: the best-graded
 *      part of /network)
 *   3  the ledger — the most-flagged rate first; the market-plumbing giants under a divider
 *   4  the chosen community: connected-only force graph, the isolates line, the
 *      totals and the pagerank roster; a roster row flies the sky to that planet
 *
 * Named precedent: ICIJ Aleph entity-flow / OCCRP shell-company diagrams (plate),
 * NYT Upshot annotated ranking (ledger). Never prints «GT» (glossary § 2.3).
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { networkApi, type CommunityIndexItem } from '@/api/client'
import { PATTERN_COLORS, RISK_TEXT_COLORS, getRiskLevelFromScore } from '@/lib/constants'
import { formatCompactMXN, formatNumber } from '@/lib/utils'
import { formatEntityName } from '@/lib/entity/format'
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import { MeshPlano } from '@/components/network/MeshPlano'
import { sortTrama, type TramaSort } from '@/lib/network/trama-sort'
import { CommunityForceGraph } from '@/components/network/CommunityForceGraph'


const MONO = 'var(--font-family-archival)'
const SERIF = 'var(--font-family-editorial)'
const RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1'
const eyebrow = { fontFamily: MONO, fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase' as const, color: 'var(--color-text-muted)' }
const ROSTER_N = 12

const SORTS: ReadonlyArray<[TramaSort, string, string]> = [
  ['rate', 'más señalados', 'most flagged'],
  ['documented', 'documentados', 'documented'],
  ['risk', 'riesgo', 'risk'],
  ['size', 'tamaño', 'size'],
  ['value', 'valor', 'value'],
]

const firms = (n: number, es: boolean) => (es ? `${formatNumber(n)} ${n === 1 ? 'firma' : 'firmas'}` : `${formatNumber(n)} ${n === 1 ? 'firm' : 'firms'}`)

/** «N con caso documentado · M sancionadas (SFP)» — only the parts that are non-zero. */
function evidenceLine(gt: number, sanc: number, es: boolean): string | null {
  const parts = [
    gt > 0 ? (es ? `${formatNumber(gt)} con caso documentado` : `${formatNumber(gt)} with a documented case`) : null,
    sanc > 0 ? (es ? `${formatNumber(sanc)} ${sanc === 1 ? 'sancionada' : 'sancionadas'} (SFP)` : `${formatNumber(sanc)} SFP-sanctioned`) : null,
  ].filter(Boolean)
  return parts.length ? parts.join(' · ') : null
}

function PatternMix({ c }: { c: CommunityIndexItem }) {
  const total = c.pattern_mix.reduce((s, m) => s + m.count, 0)
  if (total === 0 || c.size === 0 || c.labeled_count / c.size < 0.3) return null
  return (
    <span className="mt-1 flex h-[4px] w-full overflow-hidden rounded-full bg-border/40" aria-hidden="true">
      {c.pattern_mix.map((m) => (
        <span key={m.pattern} style={{ width: `${(m.count / total) * 100}%`, background: PATTERN_COLORS[m.pattern] ?? 'var(--color-text-muted)' }} />
      ))}
    </span>
  )
}

export interface TramaPanelProps {
  lang: 'en' | 'es'
  /** the chosen community (`tab=trama.N`), null = the ledger only */
  comm: number | null
  onComm: (id: number) => void
  onClose: () => void
  /** fly the sky to this vendor's planet */
  onFlyVendor: (vendorId: number) => void
  /** full-width phone sheet: no inner scroll box, the graph only at ≥ 360px */
  phone?: boolean
}

export default function TramaPanel({ lang, comm, onComm, onClose, onFlyVendor, phone = false }: TramaPanelProps) {
  const es = lang === 'es'
  const [sort, setSort] = useState<TramaSort>('rate')
  const [all, setAll] = useState(false)

  const indexQ = useQuery({ queryKey: ['trama-index'], queryFn: () => networkApi.getCommunitiesIndex(), staleTime: 60 * 60 * 1000 })
  const graphQ = useQuery({
    queryKey: ['trama-graph', comm],
    queryFn: () => networkApi.getCommunityGraph(comm as number),
    enabled: comm != null,
    staleTime: 60 * 60 * 1000,
  })
  const communities = useMemo(() => indexQ.data?.communities ?? [], [indexQ.data])
  const ledger = useMemo(() => sortTrama(communities, sort), [communities, sort])
  const sel = comm != null ? communities.find((c) => c.community_id === comm) ?? null : null
  const graph = graphQ.data && graphQ.data.community_id === comm ? graphQ.data : null

  const drawn = useMemo(() => {
    if (!graph) return null
    const ids = new Set(graph.nodes.map((n) => n.vendor_id))
    const tied = new Set<number>()
    let edges = 0
    for (const e of graph.edges) {
      if (!ids.has(e.a) || !ids.has(e.b)) continue
      edges++
      tied.add(e.a)
      tied.add(e.b)
    }
    return { edges, isolates: graph.nodes.length - tied.size }
  }, [graph])
  const roster = useMemo(() => (graph ? [...graph.nodes].sort((a, b) => b.pagerank - a.pagerank) : []), [graph])
  const row = (c: CommunityIndexItem) => {
    const on = c.community_id === comm
    const ev = evidenceLine(c.gt_vendor_count, c.sanctioned_count, es)
    return (
      <li key={c.community_id} className="px-4 py-2" style={{ borderBottom: '1px solid var(--color-border)', background: on ? 'var(--color-background)' : undefined, borderLeft: on ? '2px solid var(--color-accent)' : '2px solid transparent' }}>
        <button
          type="button" onClick={() => onComm(c.community_id)} aria-pressed={on}
          className={`flex w-full items-baseline justify-between gap-2 rounded-sm text-left ${RING}`}
          style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', minHeight: phone ? 44 : 24 }}
        >
          <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>
            C-{c.community_id} · {firms(c.size, es)}
          </span>
          <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>{formatCompactMXN(c.total_value_mxn)}</span>
        </button>
        <div className="mt-0.5 flex items-center gap-1.5" style={{ fontFamily: MONO, fontSize: 10, color: 'var(--color-text-muted)' }}>
          <span style={{ whiteSpace: 'nowrap' }}>{es ? 'eje' : 'hub'}</span>
          <EntityIdentityChip type="vendor" id={c.hub_vendor_id} name={c.hub_vendor_name} size="xs" fullName />
        </div>
        {ev && <div className="mt-0.5" style={{ fontFamily: MONO, fontSize: 11, color: 'var(--color-accent-text)' }}>{ev}</div>}
        <PatternMix c={c} />
      </li>
    )
  }

  // A chosen mesh (click or deep link) brings its section to the top of the panel's scroller.
  const sectionRef = useRef<HTMLElement>(null)
  const ready = !!indexQ.data
  useEffect(() => {
    const el = sectionRef.current
    const box = el?.closest<HTMLElement>('aside, [role="dialog"]')
    if (el && box) box.scrollTop = el.offsetTop - 8
  }, [comm, ready])
  const showGraph = !phone || (typeof window !== 'undefined' && window.innerWidth >= 360)

  return (
    // flex: none — inside the dock's flex column the panel must not shrink (the aside scrolls instead)
    <div className="flex flex-col" style={{ flex: 'none' }} lang={lang}>
      {/* 1 · header */}
      <div className="flex items-center justify-between gap-2 px-4" style={{ height: 32, flex: '0 0 32px', borderBottom: '1px solid var(--color-border)' }}>
        <span style={{ ...eyebrow, fontSize: 11, color: 'var(--color-text-primary)' }}>
          La Trama <span style={{ color: 'var(--color-text-muted)' }}>· {es ? 'co-adjudicación' : 'co-awarded'}</span>
        </span>
        <button
          type="button" onClick={onClose} aria-label={es ? 'Cerrar La Trama' : 'Close La Trama'}
          className={`inline-flex items-center justify-center rounded-sm ${phone ? 'h-11 w-11' : 'h-7 w-7'} ${RING}`}
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', fontFamily: MONO, fontSize: 12 }}
        >✕</button>
      </div>
      <p className="px-4 pt-2" style={{ fontFamily: MONO, fontSize: 11, lineHeight: 1.45, color: 'var(--color-text-muted)', margin: 0 }}>
        {es
          ? 'Firmas que ganaron partes del mismo procedimiento, ≥ 3 veces. CompraNet registra ganadores, no licitantes: un vínculo no es prueba.'
          : 'Firms that won parts of the same procedure, ≥ 3 times. CompraNet records winners, not bidders: a tie is not proof.'}
      </p>

      {indexQ.isError ? (
        <p className="px-4 py-3" style={eyebrow}>{es ? 'No se pudo cargar La Trama.' : 'La Trama could not load.'}</p>
      ) : !indexQ.data ? (
        <p className="px-4 py-3" style={eyebrow}>{es ? 'Cargando La Trama…' : 'Loading La Trama…'}</p>
      ) : (
        <>
          {/* 2 · the picker */}
          <div className="px-3 pt-2">
            <MeshPlano communities={communities} selectedId={comm} onSelect={onComm} lang={lang} />
          </div>

          {/* 3 · the ledger */}
          <div className="flex items-center justify-between gap-2 px-4 pt-2 pb-1">
            <span style={eyebrow}>{es ? `${formatNumber(communities.length)} tramas` : `${formatNumber(communities.length)} meshes`}</span>
            <label className="flex items-center gap-1.5" style={eyebrow}>
              {es ? 'ordenar' : 'sort'}
              <select
                value={sort} onChange={(e) => setSort(e.target.value as TramaSort)}
                className={`rounded-sm ${RING}`}
                style={{ fontFamily: MONO, fontSize: 11, textTransform: 'none', letterSpacing: 0, color: 'var(--color-text-primary)', background: 'var(--color-background-card)', border: '1px solid var(--color-border)', padding: phone ? '8px 6px' : '2px 4px' }}
              >
                {SORTS.map(([k, e2, en]) => <option key={k} value={k}>{es ? e2 : en}</option>)}
              </select>
            </label>
          </div>
          <ol
            aria-label={es ? 'Tramas de co-adjudicación' : 'Co-award meshes'}
            style={{ listStyle: 'none', margin: 0, padding: 0, borderTop: '1px solid var(--color-border)', ...(phone ? {} : { maxHeight: comm != null ? 190 : 'none', overflowY: 'auto' as const }) }}
          >
            {ledger.main.map(row)}
            {ledger.giants.length > 0 && (
              <li className="px-4 pt-3 pb-1" style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-background)' }}>
                <span style={{ ...eyebrow, color: 'var(--color-text-secondary)' }}>
                  {es ? 'Plomería de mercado — demasiado grandes para leerse como un grupo' : 'Market plumbing — too big to read as one group'}
                </span>
              </li>
            )}
            {ledger.giants.map(row)}
          </ol>

          {/* 4 · the chosen mesh */}
          {comm != null && (
            <section ref={sectionRef} aria-label={sel ? `C-${sel.community_id}` : `C-${comm}`} className="px-4 pt-3 pb-4" style={{ borderTop: '1px solid var(--color-border)' }}>
              <h3 style={{ fontFamily: SERIF, fontSize: 17, lineHeight: 1.2, fontWeight: 500, margin: '0 0 6px', color: 'var(--color-text-primary)' }}>
                C-{comm}{sel ? ` · ${es ? 'órbita de' : 'orbit of'} ${formatEntityName('vendor', sel.hub_vendor_name, 'full')}` : ''}
              </h3>
              {graphQ.isError ? (
                <p style={eyebrow}>{es ? 'No se pudo cargar esta trama.' : 'This mesh could not load.'}</p>
              ) : !graph || !drawn ? (
                <p style={eyebrow}>{es ? 'Cargando la trama…' : 'Loading the mesh…'}</p>
              ) : (
                <>
                  {drawn.edges === 0 ? (
                    <p style={{ fontFamily: SERIF, fontSize: 15, lineHeight: 1.45, color: 'var(--color-text-secondary)', margin: '0 0 8px' }}>
                      {es ? 'Sin aristas de ≥ 3 procedimientos entre sus miembros.' : 'No ties of ≥ 3 procedures among its members.'}
                    </p>
                  ) : showGraph ? (
                    <CommunityForceGraph data={graph} lang={lang} viewW={phone ? 400 : 420} viewH={phone ? 380 : 300} connectedOnly legend={false} onSelectVendor={(v) => { if (v != null) onFlyVendor(v) }} />
                  ) : null}
                  {drawn.edges > 0 && drawn.isolates > 0 && (
                    <p style={{ fontFamily: MONO, fontSize: 11, color: 'var(--color-text-muted)', margin: '4px 0 0' }}>
                      {es ? `${firms(drawn.isolates, true)} sin arista dibujada → en la lista` : `${firms(drawn.isolates, false)} with no drawn tie → in the list`}
                    </p>
                  )}
                  <p style={{ fontFamily: MONO, fontSize: 11, lineHeight: 1.5, color: 'var(--color-text-primary)', margin: '8px 0 6px' }}>
                    {[
                      firms(graph.total_members, es),
                      es ? `${formatNumber(drawn.edges)} ${drawn.edges === 1 ? 'arista' : 'aristas'}` : `${formatNumber(drawn.edges)} ${drawn.edges === 1 ? 'tie' : 'ties'}`,
                      evidenceLine(graph.stats.gt_vendor_count, graph.stats.sanctioned_count, es),
                      formatCompactMXN(graph.stats.total_value_mxn),
                    ].filter(Boolean).join(' · ')}
                    {graph.truncated && (es ? ` · se dibujan ${formatNumber(graph.rendered_members)} por PageRank` : ` · ${formatNumber(graph.rendered_members)} drawn by PageRank`)}
                  </p>
                  <span style={eyebrow}>{es ? 'por centralidad · toque para volar' : 'by centrality · click to fly'}</span>
                  <ol style={{ listStyle: 'none', margin: '4px 0 0', padding: 0 }}>
                    {(all ? roster : roster.slice(0, ROSTER_N)).map((n, i) => (
                      <li key={n.vendor_id}>
                        <button
                          type="button" onClick={() => onFlyVendor(n.vendor_id)}
                          className={`flex w-full items-baseline gap-2 rounded-sm text-left ${RING}`}
                          style={{ background: 'transparent', border: 'none', borderBottom: '1px solid var(--color-border)', padding: '4px 0', cursor: 'pointer', minHeight: phone ? 44 : 26 }}
                        >
                          <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--color-text-muted)', width: 18, flex: '0 0 18px', textAlign: 'right' }}>{i + 1}</span>
                          <span className="min-w-0 truncate" style={{ fontFamily: SERIF, fontSize: 14, color: 'var(--color-text-primary)', flex: 1 }}>
                            {formatEntityName('vendor', n.name, 'full')}
                          </span>
                          {n.is_sanctioned && <span style={{ fontFamily: MONO, fontSize: 10, color: RISK_TEXT_COLORS.critical }}>SFP</span>}
                          {n.gt_case_count > 0 && <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--color-accent-text)' }}>{es ? 'caso' : 'case'}</span>}
                          {n.risk_score != null && (
                            <span style={{ fontFamily: MONO, fontSize: 11, color: RISK_TEXT_COLORS[getRiskLevelFromScore(n.risk_score)], flex: '0 0 auto' }}>{Math.round(n.risk_score * 100)}</span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ol>
                  {roster.length > ROSTER_N && (
                    <button type="button" onClick={() => setAll((a) => !a)} className={`mt-1 rounded-sm ${RING}`}
                      style={{ ...eyebrow, color: 'var(--color-accent-text)', background: 'transparent', border: 'none', padding: '4px 0', cursor: 'pointer', minHeight: phone ? 44 : 24 }}>
                      {all ? (es ? 'ver menos' : 'show fewer') : (es ? `ver las ${formatNumber(roster.length)}` : `show all ${formatNumber(roster.length)}`)}
                    </button>
                  )}
                </>
              )}
            </section>
          )}
        </>
      )}
    </div>
  )
}
