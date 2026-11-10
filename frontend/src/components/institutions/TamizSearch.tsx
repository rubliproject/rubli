/**
 * TamizSearch — «¿Dónde está mi institución?» («Por pesos» spec §3).
 * A WAI-ARIA combobox over every graded institution (name or siglas, accent-
 * insensitive). Picking one hands its index to the caller, which flies the
 * field to its dot or waffle block and opens the drawer.
 */
import { useId, useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { formatEntityName } from '@/lib/entity/format'
import type { FieldInst } from '@/lib/institutions/field'
import { gradeOutOf10 } from '@/lib/tiers'

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function TamizSearch({ insts, lang, onPick }: { insts: FieldInst[]; lang: string; onPick: (idx: number) => void }) {
  const en = lang === 'en'
  const id = useId()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const index = useMemo(() => insts.map((i, k) => ({ k, key: `${fold(i.name)} ${fold(i.siglas ?? '')}` })), [insts])
  const hits = useMemo(() => {
    const f = fold(q.trim())
    if (f.length < 2) return []
    // Biggest buyers first among matches — what a reporter usually means.
    return index.filter((x) => x.key.includes(f))
      .sort((a, b) => insts[b.k].total_amount_mxn - insts[a.k].total_amount_mxn)
      .slice(0, 8).map((x) => x.k)
  }, [q, index, insts])
  const pick = (k: number) => { onPick(k); setQ(''); setOpen(false) }
  return (
    <div className="relative w-full sm:w-[280px]">
      <label htmlFor={`${id}-q`} className="sr-only">{en ? 'Find an institution' : 'Buscar una institución'}</label>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" aria-hidden="true" />
      <input
        id={`${id}-q`}
        type="search"
        role="combobox"
        aria-expanded={open && hits.length > 0}
        aria-controls={`${id}-list`}
        aria-activedescendant={open && hits.length ? `${id}-o${active}` : undefined}
        autoComplete="off"
        spellCheck={false}
        value={q}
        placeholder={en ? 'Where is… (IMSS, SEDENA)' : '¿Dónde está…? (IMSS, SEDENA)'}
        onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(0) }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(hits.length - 1, a + 1)) }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)) }
          else if (e.key === 'Enter' && hits[active] != null) { e.preventDefault(); pick(hits[active]) }
          else if (e.key === 'Escape') { setOpen(false) }
        }}
        className="min-h-11 w-full rounded-sm border border-border bg-background pl-8 pr-3 text-[13px] font-mono text-text-primary placeholder:text-text-muted focus:border-text-primary focus:outline-none"
      />
      {open && hits.length > 0 && (
        <ul id={`${id}-list`} role="listbox" className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-sm border border-border bg-background-elevated py-1 sm:w-[360px]">
          {hits.map((k, j) => (
            <li
              key={k}
              id={`${id}-o${j}`}
              role="option"
              aria-selected={j === active}
              onMouseDown={(e) => { e.preventDefault(); pick(k) }}
              onMouseEnter={() => setActive(j)}
              className={`flex min-h-11 cursor-pointer items-baseline justify-between gap-2 px-3 py-1.5 text-[13px] ${j === active ? 'bg-background-elevated text-text-primary' : 'text-text-secondary'}`}
              style={{ maxWidth: 'none' }}
            >
              <span className="min-w-0 truncate">{formatEntityName('institution', insts[k].name, 'full')}</span>
              <span className="shrink-0 font-mono text-[12px] text-text-muted">{gradeOutOf10(insts[k].total_score)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
