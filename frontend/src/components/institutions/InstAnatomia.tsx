/**
 * /institutions ?ver=anatomia (concept 2026-11-04; the default view stays El Tamiz). After the anatomy skill
 * (.claude/skills/anatomy) and the loved Portada figure (exp/explainer-d-anatomy, RiskAnatomy.tsx): each of the
 * biggest active federal buyers is a small case on a plinth, three trays and a lid, that comes apart into what it buys.
 *   tray 1 (bottom) · cómo compra    — the ink block is the share of its pesos awarded WITHOUT a tender
 *   tray 2          · a quién        — the ink block is the share that went to its single biggest supplier
 *   tray 3 (top)    · con qué riesgo — the amber block is the share in contracts whose indicator is alto or crítico
 *   lid             · its sector (the only categorical colour)
 * Every physical property maps one real value: a block's width along the tray = that share; lift = order only.
 * Hover, focus or tap opens a case; the worst grade starts open and carries the «foco» rings (on the floor plane). Reduced motion: every
 * case shown apart, still. Words and numbers live in the DOM under each case, never in the drawing.
 */
import { useMemo, useState, type CSSProperties } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useReducedMotion } from 'framer-motion'
import { anatomyQuery } from './InstDiagrama'
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import { PatternDefs, PatternSwatch, patUrl } from '@/components/kit/patterns/Patterns'
import { gradeWord } from '@/lib/tiers'
import { formatCompactMXN } from '@/lib/utils'
import { formatEntityName } from '@/lib/entity/format'
import { useEdition } from '@/lib/theme'
import { HR_LEVEL, fails, gradeTen, pct, sectorOf, worstOf, type AnatomyRow } from '@/lib/institutions/anatomy'
import './instgraphics.css'

// ── isometric camera (azimuth 45°, elevation 30°): x along the tray, y into depth, z up ─────────────────────────────
const C = Math.cos(Math.PI / 6)
type P3 = [number, number, number]
const pr = ([x, y, z]: P3) => [(x - y) * C, (x + y) / 2 - z] as const
const poly = (ps: P3[]) => ps.map((p) => pr(p).map((v) => v.toFixed(1)).join(',')).join(' ')

function Box({ x, y, z, w, d, h, cls = '', fill }: { x: number; y: number; z: number; w: number; d: number; h: number; cls?: string; fill?: string }) {
  if (w <= 0.05) return null
  const X = x + w, Y = y + d, Z = z + h
  return (
    <g className={`ia-b ${cls}`}>
      <polygon className="ia-f" points={poly([[x, Y, z], [X, Y, z], [X, Y, Z], [x, Y, Z]])} />
      <polygon className="ia-r" points={poly([[X, y, z], [X, Y, z], [X, Y, Z], [X, y, Z]])} />
      <polygon className="ia-t" points={poly([[x, y, Z], [X, y, Z], [X, Y, Z], [x, Y, Z]])} />
      {fill && <polygon className="ia-pat" fill={fill} points={poly([[x, Y, z], [X, Y, z], [X, Y, Z], [x, Y, Z]])} />}
    </g>
  )
}
const Screw = ({ p }: { p: P3 }) => { const [x, y] = pr(p); return <ellipse className="ia-sc" cx={x} cy={y} rx={1.1} ry={0.65} /> }

const W = 100, D = 56, TH = 10, LIFT = 10
const PL = { x: -8, y: -8, w: W + 16, d: D + 16 }
const TRAYS = ['da', 'top', 'hr'] as const
type Part = (typeof TRAYS)[number]
const SHARE: Record<Part, (r: AnatomyRow) => number | null> = { da: (r) => r.da_share, top: (r) => r.top_share, hr: (r) => r.hr_share }
const [FX, FY] = pr([W / 2, D / 2, 0])

function Case({ r, uid, worst }: { r: AnatomyRow; uid: string; worst: boolean }) {
  return (
    <svg viewBox="-68 -76 174 176" className="ia-svg" aria-hidden="true" style={{ '--sc': sectorOf(r.sector_id).color } as CSSProperties}>
      <PatternDefs uid={uid} kinds={['sin-dato']} />
      {/* foco (DESIGN § 7.p, one per figure): its three fading rings, laid on the floor plane around the worst case's plinth */}
      {worst && <g aria-hidden="true" pointerEvents="none">
        {[0, 1, 2].map((i) => <ellipse key={i} className="pat-ring" cx={FX} cy={FY + 4} rx={78 + 10 * i} ry={(78 + 10 * i) * 0.577} opacity={1 - i / 3.5} />)}
      </g>}
      <polygon className="ia-halo" points={poly([[PL.x - 4, PL.y - 4, -12], [PL.x + PL.w + 4, PL.y - 4, -12], [PL.x + PL.w + 4, PL.y + PL.d + 4, -12], [PL.x - 4, PL.y + PL.d + 4, -12]])} />
      {[[PL.x + 3, PL.y + 3], [PL.x + PL.w - 11, PL.y + 3], [PL.x + 3, PL.y + PL.d - 11], [PL.x + PL.w - 11, PL.y + PL.d - 11]].map(([x, y]) => (
        <Box key={`f${x}${y}`} x={x} y={y} z={-10} w={8} d={8} h={3} cls="is-lo" />
      ))}
      <Box x={PL.x} y={PL.y} z={-7} w={PL.w} d={PL.d} h={7} cls="is-lo" />
      <polygon className="ia-gr" points={poly([[PL.x + 4, PL.y + 4, 0], [PL.x + PL.w - 4, PL.y + 4, 0], [PL.x + PL.w - 4, PL.y + PL.d - 4, 0], [PL.x + 4, PL.y + PL.d - 4, 0]])} />
      {[[PL.x + 2, PL.y + 2], [PL.x + PL.w - 2, PL.y + 2], [PL.x + 2, PL.y + PL.d - 2], [PL.x + PL.w - 2, PL.y + PL.d - 2]].map(([x, y]) => <Screw key={`s${x}${y}`} p={[x, y, 0]} />)}
      {/* the label plate on the plinth's front edge: three engraved rules */}
      <Box x={PL.x + PL.w - 40} y={PL.y + PL.d - 3} z={0} w={30} d={2} h={0.8} cls="is-lo" />
      {TRAYS.map((k, i) => {
        const s = SHARE[k](r)
        const z = i * TH
        const a = s == null ? 0 : W * s
        return (
          <g key={k} className="ia-lift" style={{ '--dz': `${-(i + 1) * LIFT}px`, '--i': i } as CSSProperties}>
            {s == null
              ? <Box x={0} y={0} z={z} w={W} d={D} h={TH - 1} cls="is-mid" fill={patUrl(uid, 'sin-dato')} />
              : <>
                <Box x={0} y={0} z={z} w={a} d={D} h={TH - 1} cls={k === 'hr' ? `is-risk is-${HR_LEVEL}` : 'is-ink'} />
                <Box x={a} y={0} z={z} w={W - a} d={D} h={TH - 1} cls="is-mid" />
              </>}
            {[[2, 2], [W - 2, 2], [2, D - 2], [W - 2, D - 2]].map(([x, y]) => <Screw key={`${x}${y}`} p={[x, y, z + TH - 1]} />)}
          </g>
        )
      })}
      <g className="ia-lift" style={{ '--dz': `${-4 * LIFT}px`, '--i': 3 } as CSSProperties}>
        <Box x={-1} y={-1} z={3 * TH} w={W + 2} d={D + 2} h={3} cls="is-lid" />
        <Box x={W / 2 - 9} y={D / 2 - 3} z={3 * TH + 3} w={18} d={6} h={2.5} cls="is-mid" />
      </g>
    </svg>
  )
}

export function InstAnatomia({ lang }: { lang: string }) {
  const en = lang === 'en'
  const L = (es: string, e: string) => (en ? e : es)
  // the ink block is black by day and white by night: the legend names the colour the reader sees
  const night = useEdition() === 'night'
  const inkEs = night ? 'blanco' : 'negro', inkEn = night ? 'white' : 'black'
  const reduce = useReducedMotion() ?? false
  const q = useQuery(anatomyQuery)
  const rows = useMemo(() => q.data?.rows ?? [], [q.data])
  const worst = useMemo(() => worstOf(rows), [rows])
  const [open, setOpen] = useState<number | null>(null)
  const openId = open ?? worst?.id ?? null

  if (q.isError) return <p role="alert" className="ct-note">{L('No se pudo cargar la anatomía de las dependencias.', 'The agencies’ anatomy could not be loaded.')}</p>
  if (!rows.length || !worst) return <div aria-hidden="true" className="lg-hold lg-hold-tm" />

  return (
    <section className={`ia${reduce ? ' is-still' : ''}`} aria-label={L('La anatomía de las dependencias', 'The agencies’ anatomy')}>
      <ul className="ig-key" aria-label={L('Cómo se lee cada pieza', 'How to read each case')}>
        <li><i className="ig-k is-ink" aria-hidden="true" /><b>1</b>{L(`abajo, cómo compra: ${inkEs} = pesos sin licitación`, `bottom, how it buys: ${inkEn} = pesos without a tender`)}</li>
        <li><i className="ig-k is-ink" aria-hidden="true" /><b>2</b>{L(`a quién: ${inkEs} = lo que se llevó su primer proveedor`, `from whom: ${inkEn} = what its top supplier took`)}</li>
        <li><i className={`ig-k is-risk is-${HR_LEVEL}`} aria-hidden="true" /><b>3</b>{L('con qué riesgo: ámbar = pesos con indicador alto o crítico', 'with what risk: amber = pesos with a high or critical indicator')}</li>
        <li><i className="ig-k is-lid" aria-hidden="true" />{L('tapa: el color de su sector', 'lid: its sector colour')}</li>
        <li><PatternSwatch kind="sin-dato" />{L('sin dato', 'no data')}</li>
      </ul>
      <ol className="ia-grid">
        {rows.map((r) => {
          const apart = reduce || openId === r.id
          const g = gradeTen(r.score, lang)
          const tv = r.top_vendor
          const nm = formatEntityName('institution', r.name, 'full')
          return (
            <li key={r.id} className={`ia-cell${apart ? ' is-apart' : ''}${r.id === worst.id ? ' is-worst' : ''}`}
              onMouseEnter={() => !reduce && setOpen(r.id)}>
              <button type="button" className="ia-obj" aria-expanded={apart} aria-controls={`ia-cap-${r.id}`}
                aria-label={L(`Abrir la pieza de ${nm}`, `Open ${nm}’s case`)}
                onClick={() => setOpen(apart && !reduce ? -1 : r.id)} onFocus={() => !reduce && setOpen(r.id)}>
                <Case r={r} uid={`ia${r.id}`} worst={r.id === worst.id} />
              </button>
              <div className="ia-cap" id={`ia-cap-${r.id}`}>
                <p className="ia-name">
                  <i className="ig-sec" style={{ background: sectorOf(r.sector_id).color }} aria-hidden="true" />
                  <EntityIdentityChip type="institution" id={r.id} name={r.name} variant="name" size="inherit" />
                </p>
                <p className="ia-meta">
                  {formatCompactMXN(r.total_value_mxn, 'mdp')} · <span className={fails(r) ? 'is-fail' : undefined}>{g}, {gradeWord(r.score, en ? 'en' : 'es')}</span>
                  {r.id === worst.id && <> · <b>{L('la peor', 'the worst')}</b></>}
                </p>
                <dl className="ia-parts">
                  <div><dt><b>1</b>{L('Sin licitación', 'No tender')}</dt><dd>{pct(r.da_share, lang)}</dd></div>
                  <div><dt><b>2</b>{L('Primer proveedor', 'Top supplier')}</dt><dd>{pct(r.top_share, lang)}</dd></div>
                  <div><dt><b>3</b>{L('Riesgo alto o crítico', 'High or critical risk')}</dt><dd>{pct(r.hr_share, lang)}</dd></div>
                </dl>
                {tv && (
                  <p className={`ia-who${apart ? '' : ' is-shut'}`} aria-hidden={!apart || undefined}>
                    <b>2</b>
                    {tv.id == null || !tv.name
                      ? <span className="ig-dim">{L('un proveedor sin nombre público', 'a supplier with no public name')}</span>
                      : <><EntityIdentityChip type="vendor" id={tv.id} name={tv.name} variant="name" size="inherit" />{tv.kind === 'pf' && <span className="ig-dim">{L(', persona física', ', a natural person')}</span>}</>}
                  </p>
                )}
              </div>
            </li>
          )
        })}
      </ol>
      <p className="ig-note">
        {L(`Las ${rows.length} dependencias federales activas con más pesos contratados y calificación firme, registro 2002–2025. Cada parte es una proporción de sus pesos. Un indicador de riesgo alto señala parecido con casos documentados; no prueba delito.`,
          `The ${rows.length} active federal agencies with the most contracted pesos and a settled grade, 2002–2025 record. Each part is a share of its pesos. A high risk indicator signals resemblance to documented cases; it does not prove a crime.`)}
      </p>
    </section>
  )
}
