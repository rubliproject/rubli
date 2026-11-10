/**
 * AskBar — the Focos Rojos question as ONE sentence the reader builds (owner 2026-11-04: the four native selects «must
 * be designed better, they are too simple»; «we need to dumb it down»). Each blank is a token in the sentence; a token
 * opens its own picker: the term = the sexenio strip (kit bands: the government's colour on top), the sector = the
 * twelve colour-dotted chips, the buyer = a searchable list by acronym, the kind = each plain pattern name with one
 * everyday line of what it means. Popover on a desktop, a bottom sheet on a phone (44px targets); Esc and a click
 * outside close and give focus back to the token. A chosen token reads in the board's voice (mono caps) with its own
 * «quitar». State stays in the URL (the page's `go`).
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { ADMIN_COLORS } from '@/lib/administrations'
import { PATTERN_SOFT, tr } from '@/lib/aria/mapa'
import { SEXENIOS, type Scenario } from '@/lib/aria/escenario'
import { SECTORS } from '@/lib/constants'
import { institutionShortName } from '@/lib/institutionShortName'
import { formatNumber } from '@/lib/utils'

/** Each pattern in one everyday sentence (≤ 15 words, for someone who never read a contract). */
export const PATTERN_PLAIN: Record<string, [string, string]> = {
  P6: ['Casi todo lo que vende va a una sola dependencia.', 'Almost everything it sells goes to one agency.'],
  P3: ['Gana mucho en poco tiempo y luego deja de vender.', 'It wins a lot in a short time, then stops selling.'],
  P2: ['Es nueva y de pronto recibe contratos grandes.', 'It is new and suddenly gets big contracts.'],
  P4: ['Compite siempre contra las mismas empresas.', 'It always competes against the same companies.'],
  P1: ['Se lleva una parte muy grande del dinero de su sector.', 'It takes a very large part of its sector’s money.'],
  P5: ['Sus montos son mucho más altos de lo normal.', 'Its amounts are far higher than usual.'],
  P7: ['Ya aparece en una lista oficial o en la prensa.', 'It already appears on an official list or in the press.'],
}

type Key = 'sx' | 'sector' | 'inst' | 'pat'

export function AskBar({ sc, lang, buyers, pats, go }: {
  sc: Scenario
  lang: 'es' | 'en'
  buyers: readonly { id: number; name: string; n: number }[]
  pats: readonly { code: string; n: number }[]
  go: (patch: Record<string, string | number | null>) => void
}) {
  const en = lang === 'en'
  const L = (es: string, e: string) => (en ? e : es)
  const [open, setOpen] = useState<Key | null>(null)
  const close = useCallback(() => setOpen(null), []) // stable: Token's open effect must not re-run (and re-focus) on every render
  const sec = sc.sector != null ? SECTORS.find((s) => s.id === sc.sector) : null
  const sx = sc.sx ? SEXENIOS.find((s) => s.key === sc.sx) : null
  const buyer = sc.inst != null ? buyers.find((b) => b.id === sc.inst) : null
  const short = (name: string) => institutionShortName(name, null).short
  const pick = (k: Key, v: string | number | null) => { setOpen(null); go({ [k]: v, v: null }) }

  const tokens: { k: Key; set: boolean; label: string; panel: () => ReactNode }[] = [
    { k: 'sx', set: !!sx, label: sx ? L(`con ${sx.short}`, `under ${sx.short}`) : L('en cualquier año', 'in any year'),
      panel: () => (
        <div className="ask-sx" role="group" aria-label={L('Elija un gobierno', 'Pick a government')}>
          <button type="button" className="ask-opt ask-sxb" aria-pressed={!sc.sx} onClick={() => pick('sx', null)}>
            <b>{L('Cualquier año', 'Any year')}</b><span>2002–2026</span>
          </button>
          {SEXENIOS.map((s) => (
            <button key={s.key} type="button" className="ask-opt ask-sxb" aria-pressed={sc.sx === s.key} style={{ ['--band' as string]: ADMIN_COLORS[s.key] }} onClick={() => pick('sx', s.key)}>
              <b>{s.short}</b><span>{s.years}</span>
            </button>
          ))}
        </div>
      ) },
    { k: 'sector', set: !!sec, label: sec ? L(`en ${sec.name.toLowerCase()}`, `in ${sec.nameEN.toLowerCase()}`) : L('en cualquier sector', 'in any sector'),
      panel: () => (
        <div className="ask-chips" role="group" aria-label={L('Elija un sector', 'Pick a sector')}>
          <button type="button" className="ask-opt ask-chip" aria-pressed={sc.sector == null} onClick={() => pick('sector', null)}>{L('Todos', 'All')}</button>
          {SECTORS.map((s) => (
            <button key={s.id} type="button" className="ask-opt ask-chip" aria-pressed={sc.sector === s.id} onClick={() => pick('sector', s.id)}>
              <i aria-hidden="true" style={{ background: s.color }} />{en ? s.nameEN : s.name}
            </button>
          ))}
        </div>
      ) },
    { k: 'inst', set: !!buyer, label: buyer ? L(`a ${short(buyer.name)}`, `to ${short(buyer.name)}`) : L('a cualquier dependencia', 'to any agency'),
      panel: () => <BuyerList buyers={buyers} cur={sc.inst} lang={lang} onPick={(id) => pick('inst', id)} /> },
    { k: 'pat', set: !!sc.pat, label: sc.pat ? L(`del tipo «${tr(PATTERN_SOFT[sc.pat], lang).toLowerCase()}»`, `of the kind “${tr(PATTERN_SOFT[sc.pat], lang).toLowerCase()}”`) : L('de cualquier tipo', 'of any kind'),
      panel: () => (
        <ul className="ask-pats" aria-label={L('Elija un tipo de señal', 'Pick a kind of signal')}>
          <li><button type="button" className="ask-opt ask-pat" aria-pressed={!sc.pat} onClick={() => pick('pat', null)}><b>{L('Cualquier tipo', 'Any kind')}</b></button></li>
          {pats.map((p) => PATTERN_SOFT[p.code] && (
            <li key={p.code}>
              <button type="button" className="ask-opt ask-pat" aria-pressed={sc.pat === p.code} onClick={() => pick('pat', p.code)}>
                <b>{tr(PATTERN_SOFT[p.code], lang)}</b> <span className="ask-n">{formatNumber(p.n)}</span>
                {PATTERN_PLAIN[p.code] && <span className="ask-mean">{tr(PATTERN_PLAIN[p.code], lang)}</span>}
              </button>
            </li>
          ))}
        </ul>
      ) },
  ]
  const head = L('¿Quién muestra más señales de alerta', 'Who shows the most warning signs')
  const any = tokens.some((t) => t.set)

  return (
    <form className="ask" onSubmit={(e) => e.preventDefault()} aria-label={L('La pregunta', 'The question')}>
      <p className="ask-line">
        <span>{head}</span>
        {tokens.map((t) => (
          <Token key={t.k} label={t.label} set={t.set} open={open === t.k} lang={lang}
            onToggle={() => setOpen((o) => (o === t.k ? null : t.k))} onClose={close} onClear={() => pick(t.k, null)}>
            {t.panel()}
          </Token>
        ))}
        <span>{sc.caso ? '?' : L('sin caso público?', 'with no public case?')}</span>
      </p>
      <p className="ask-gloss">
        {L('Señal de alerta: algo que se parece a casos de corrupción ya documentados. Por ejemplo, venderle casi todo a una sola dependencia.',
          'Warning sign: something that looks like corruption cases already proven. For example, selling almost everything to one agency.')}
      </p>
      <p className="ask-more">
        <button type="button" className="ask-toggle" aria-pressed={!!sc.caso} onClick={() => go({ caso: sc.caso ? null : 1, v: null })}>
          <i aria-hidden="true">{sc.caso ? '✓' : '+'}</i>{L('Incluir también a los que ya tienen caso', 'Also include those with a case')}
        </button>
        {any && <button type="button" className="ask-reset" onClick={() => go({ sx: null, sector: null, inst: null, pat: null, v: null })}>{L('Quitar todo', 'Clear all')}</button>}
      </p>
    </form>
  )
}

export function Token({ label, set, open, lang, onToggle, onClose, onClear, children }: {
  label: string; set: boolean; open: boolean; lang: 'es' | 'en'; onToggle: () => void; onClose: () => void; onClear: () => void; children: ReactNode
}) {
  const en = lang === 'en'
  const id = useId()
  const btn = useRef<HTMLButtonElement>(null)
  const pop = useRef<HTMLDivElement>(null)
  const wrap = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!open) return
    const first = pop.current?.querySelector<HTMLElement>('input, [aria-pressed="true"], button')
    first?.focus({ preventScroll: true })
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); btn.current?.focus() } }
    const onDown = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) onClose() }
    document.addEventListener('keydown', onKey, true)
    document.addEventListener('pointerdown', onDown)
    return () => { document.removeEventListener('keydown', onKey, true); document.removeEventListener('pointerdown', onDown) }
  }, [open, onClose])
  return (
    <span ref={wrap} className="ask-w">
      <button ref={btn} type="button" className={`ask-tok${set ? ' is-set' : ''}`} aria-haspopup="dialog" aria-expanded={open} aria-controls={id} onClick={onToggle}>
        {label}<span aria-hidden="true" className="ask-caret">▾</span>
      </button>
      {set && <button type="button" className="ask-x" onClick={onClear} aria-label={en ? `Remove: ${label}` : `Quitar: ${label}`}>{en ? 'remove' : 'quitar'}</button>}
      {open && (
        <div ref={pop} id={id} className="ask-pop" role="dialog" aria-label={label}>
          <div className="ask-pop-h">
            <span>{label}</span>
            <button type="button" className="ask-close" onClick={() => { onClose(); btn.current?.focus() }} aria-label={en ? 'Close' : 'Cerrar'}>×</button>
          </div>
          {children}
        </div>
      )}
    </span>
  )
}

function BuyerList({ buyers, cur, lang, onPick }: { buyers: readonly { id: number; name: string; n: number }[]; cur: number | null; lang: 'es' | 'en'; onPick: (id: number | null) => void }) {
  const en = lang === 'en'
  const [q, setQ] = useState('')
  const rows = useMemo(() => {
    const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
    const k = norm(q.trim())
    return buyers.map((b) => ({ ...b, short: institutionShortName(b.name, null).short }))
      .filter((b) => !k || norm(b.name).includes(k) || norm(b.short).includes(k)).slice(0, 60)
  }, [buyers, q])
  return (
    <div className="ask-buy">
      <label className="ask-search">
        <span className="sr-only">{en ? 'Find an agency' : 'Busque una dependencia'}</span>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={en ? 'Find an agency: IMSS, CFE…' : 'Busque una dependencia: IMSS, CFE…'} />
      </label>
      <ul>
        {!q && <li><button type="button" className="ask-opt ask-brow" aria-pressed={cur == null} onClick={() => onPick(null)}><b>{en ? 'Any agency' : 'Cualquier dependencia'}</b></button></li>}
        {rows.map((b) => (
          <li key={b.id}>
            <button type="button" className="ask-opt ask-brow" aria-pressed={cur === b.id} onClick={() => onPick(b.id)}>
              <b>{b.short}</b>{b.short !== b.name && <span className="ask-full">{b.name}</span>}
              <span className="ask-n">{formatNumber(b.n)} {en ? (b.n === 1 ? 'supplier' : 'suppliers') : (b.n === 1 ? 'proveedor' : 'proveedores')}</span>
            </button>
          </li>
        ))}
        {!rows.length && <li className="ask-none">{en ? 'No agency by that name in this question.' : 'Ninguna dependencia con ese nombre en esta pregunta.'}</li>}
      </ul>
    </div>
  )
}
