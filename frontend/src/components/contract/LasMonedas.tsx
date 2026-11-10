/**
 * «Las monedas» — this contract against its three nearest, as Judd stacks of identical coins
 * (owner pick, contract-coins.html → the comparison block of El sello, Round 3d/3e).
 * One coin = one unit for all four stacks (lib/contract/objects `coinStacks`, 1-2-5 ladder; 500 MDP on a
 * 35,175 MDP contract); under half a coin nothing is struck; darker seam every 5 coins; red top coin =
 * crítico; dashed outline = the stack if a flagged decimal slipped. Volume = MonedasScene (lazy three.js);
 * no WebGL or «ver en plano» = the same stacks in SVG. Labels live in ONE DOM grid under the stacks
 * (shared rows, so every line aligns; short names, the full name in the tooltip). Click / Enter opens.
 */
import { lazy, Suspense, useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { hasWebGL, type GlStatus as SceneStatus } from '@/components/kit/motion/gl'
import { MotionTable } from '@/components/kit/motion/MotionTable'
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import { formatVendorName } from '@/lib/vendor/formatName'
import { shortVendor, unitWord, type CoinStack } from '@/lib/contract/objects'
import { formatCompactMXN, formatDate } from '@/lib/utils'
import '@/components/kit/motion/motion.css'
import './objects.css'

const MonedasScene = lazy(() => import('./MonedasScene'))

/** World geometry shared by the scene and the SVG twin (so both read the same). */
export const COIN = { R: 1.25, H: 0.11, GAP: 5.6, AZ: 0.3, EL: 0.32 }

/** The stage's width / height: n columns of the label grid over the tallest stack seen at the hero angle
 *  (+ the rise of the row across the turned view, + a margin). */
export function coinAspect(stacks: CoinStack[]): number {
  const { R, H, GAP, AZ, EL } = COIN, n = stacks.length
  const tall = Math.max(1, ...stacks.map((s) => Math.max(s.coins, s.ghost ?? 0)))
  return (n * GAP * Math.cos(AZ)) / (tall * H * Math.cos(EL) + 2 * R * 1.2 * Math.sin(EL) + (n - 1) * GAP * Math.sin(AZ) * Math.sin(EL) + 1.2)
}

/** The same stacks in SVG, in the stage's own aspect so column k sits over label column k. */
function FlatCoins({ stacks, unitLabel, aspect }: { stacks: CoinStack[]; unitLabel: string; aspect: number }) {
  const max = Math.max(1, ...stacks.map((s) => Math.max(s.coins, s.ghost ?? 0)))
  const CW = 100, H = (stacks.length * CW) / aspect, CH = (H - 12) / max
  return (
    <svg className="mn-svg" viewBox={`0 0 ${stacks.length * CW} ${H}`} preserveAspectRatio="xMidYMax meet" role="img" aria-label={unitLabel}>
      {stacks.map((s, k) => {
        const cx = k * CW + CW / 2
        return (
          <g key={s.id}>
            {s.ghost != null && <rect className="mn-ghost" x={cx - 40} y={H - 6 - s.ghost * CH} width={22} height={Math.max(1, s.ghost * CH)} />}
            {Array.from({ length: s.coins }, (_, j) => (
              <rect key={j} className={`mn-c${(j + 1) % 5 === 0 ? ' is-seam' : ''}${s.critical && j === s.coins - 1 ? ' is-crit' : ''}`} x={cx - 16} y={H - 6 - (j + 1) * CH} width={32} height={Math.max(1, CH - 0.8)} rx={1} />
            ))}
            <line className="mn-base" x1={cx - 24} x2={cx + 24} y1={H - 5} y2={H - 5} />
          </g>
        )
      })}
    </svg>
  )
}

export function LasMonedas({ stacks, unit, lang, compact = false }: { stacks: CoinStack[]; unit: number; lang: 'es' | 'en'; /** no hint bar or legend paragraph (the contract page, owner 11-06) */ compact?: boolean }) {
  const aspect = coinAspect(stacks)
  const es = lang === 'es'
  const nav = useNavigate()
  const [gl] = useState(hasWebGL)
  const [flat, setFlat] = useState(false)
  const [status, setStatus] = useState<SceneStatus>('idle')
  const [read, setRead] = useState('')
  const vol = gl && !flat && status !== 'nogl'
  const coinsW = (n: number) => `${n.toLocaleString(es ? 'es-MX' : 'en-US')} ${es ? (n === 1 ? 'moneda' : 'monedas') : (n === 1 ? 'coin' : 'coins')}`
  const readOf = useCallback((k: number) => {
    const s = stacks[k]
    return `${s.self ? (es ? 'Este contrato' : 'This contract') : formatVendorName(s.vendorName, Infinity)} · ${coinsW(s.coins)} · ${formatCompactMXN(s.amount)}${s.date ? ` · ${formatDate(s.date)}` : ''}${s.critical ? ` · ${es ? 'indicador crítico' : 'critical indicator'}` : ''}`
  }, [stacks, es]) // eslint-disable-line react-hooks/exhaustive-deps
  const open = useCallback((k: number) => { const s = stacks[k]; if (s && !s.self) nav(`/contracts/${s.id}`) }, [stacks, nav])
  const onStatus = useCallback((s: SceneStatus) => setStatus(s), [])
  const onHot = useCallback((k: number | null, walk?: boolean) => setRead(k == null ? '' : `${walk ? `${k + 1}/${stacks.length} · ` : ''}${readOf(k)}`), [readOf, stacks.length])
  const unitLabel = `${es ? 'una moneda' : 'one coin'} = ${unitWord(unit, lang)}`
  const n = stacks.length

  return (
    <div className="obj-coins" style={{ ['--mn-max' as string]: `${stacks.length * (compact ? 150 : 230)}px` }}>
      <p className="mn-unit"><b>{unitLabel}</b>{stacks[0]?.ghost != null ? <span> · {es ? 'contorno punteado = la pila si el decimal corrió' : 'dashed outline = the stack if the decimal slipped'}</span> : null}</p>
      <div className="mn-stage" style={{ aspectRatio: String(aspect) }}>
        {vol
          ? <Suspense fallback={null}><MonedasScene stacks={stacks} label={`${es ? 'Pilas de monedas en volumen' : 'Coin stacks in volume'}: ${unitLabel}; ${es ? '↑ ↓ recorren las pilas, Enter abre el contrato' : '↑ ↓ walk the stacks, Enter opens the contract'}`} onStatus={onStatus} onHot={onHot} onOpen={open} /></Suspense>
          : <FlatCoins stacks={stacks} aspect={aspect} unitLabel={`${es ? 'Pilas de monedas' : 'Coin stacks'}: ${unitLabel}`} />}
      </div>
      <div className="mn-row" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
        {stacks.map((s, k) => {
          const full = formatVendorName(s.vendorName, Infinity)
          return [
            <b key={`a${k}`} className="mn-n" style={{ gridColumn: k + 1, gridRow: 1 }}>{coinsW(s.coins)}</b>,
            <span key={`b${k}`} className="mn-amt" style={{ gridColumn: k + 1, gridRow: 2 }}>{formatCompactMXN(s.amount)}</span>,
            <span key={`c${k}`} className="mn-who" style={{ gridColumn: k + 1, gridRow: 3 }} title={full}>
              {s.self
                ? <em>{es ? 'este contrato' : 'this contract'}</em>
                : <>
                    {s.individual && <span className="cx-person">{es ? 'persona física' : 'individual'}</span>}
                    {s.vendorId ? <EntityIdentityChip type="vendor" id={s.vendorId} name={shortVendor(s.vendorName)} variant="name" ariaLabel={full} /> : shortVendor(s.vendorName) || '—'}
                  </>}
            </span>,
            <span key={`d${k}`} className="mn-date" style={{ gridColumn: k + 1, gridRow: 4 }}>
              {s.self ? (s.date ? formatDate(s.date) : '—') : <a className="ct-link" href={`/contracts/${s.id}`} onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; e.preventDefault(); open(k) }}>{s.date ? formatDate(s.date) : `#${s.id}`}</a>}
            </span>,
            <span key={`e${k}`} className="mn-ghost-t" style={{ gridColumn: '1 / -1', gridRow: 5 }}>
              {s.ghost != null ? `${es ? 'si el decimal corrió' : 'if the decimal slipped'}: ${coinsW(s.ghost)}` : ''}
            </span>,
          ]
        })}
      </div>
      {!compact && <><div className="obj-bar">
        <p className="obj-read" aria-live="polite">{read || (es ? 'Señale una pila para leerla; clic o Enter abre el contrato.' : 'Point at a stack to read it; click or Enter opens the contract.')}</p>
        {gl && status !== 'nogl' && (
          <button type="button" className="obj-tog" onClick={() => setFlat((f) => !f)}>
            {flat ? (es ? 'ver en volumen ↑' : 'see it in volume ↑') : (es ? 'ver en plano ↓' : 'see it flat ↓')}
          </button>
        )}
      </div>
      <p className="obj-key">
        {es
          ? <><b>{unitLabel}</b> del monto registrado, igual para las {n} pilas (se redondea; menos de media moneda no se acuña) · <b>raya oscura</b> cada 5 monedas, para contar · <b>moneda roja</b> arriba = indicador crítico{stacks[0]?.ghost != null ? <> · <b>contorno punteado</b> = la pila si el decimal del monto marcado corrió</> : null}. Parecidos = mismo sector y año, los más cercanos en monto y fecha. Según Donald Judd, «Stacks».</>
          : <><b>{unitLabel}</b> of the recorded amount, the same for all {n} stacks (rounded; under half a coin nothing is struck) · <b>dark seam</b> every 5 coins, to count · <b>red top coin</b> = critical indicator{stacks[0]?.ghost != null ? <> · <b>dashed outline</b> = the stack if the flagged amount's decimal slipped</> : null}. Nearest = same sector and year, closest in amount and date. After Donald Judd, “Stacks”.</>}
      </p></>}
      <div className="mk-sr">
      <MotionTable
        visible
        caption={`${es ? 'Las monedas' : 'The coins'} · ${unitLabel}`}
        head={[es ? 'Contrato' : 'Contract', es ? 'Monedas' : 'Coins', es ? 'Monto' : 'Amount', es ? 'Fecha' : 'Date']}
        rows={stacks.map((s) => [s.self ? (es ? 'Este contrato' : 'This contract') : formatVendorName(s.vendorName, Infinity), s.coins, formatCompactMXN(s.amount), s.date ? formatDate(s.date) : '—'])}
      />
      </div>
    </div>
  )
}
