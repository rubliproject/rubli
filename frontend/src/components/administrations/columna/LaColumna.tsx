/**
 * /administrations «La columna» (concept C, GREEN round 2026-11-05) — the explorable column and its panel.
 * Three levels, all in the URL (?g=amlo&y=2020, pushed so the browser's Back walks them):
 *   0  the column · 1  a government (years, top suppliers, top buyers, sectors) · 2  a year (months, suppliers, contracts).
 * The trail (DocHead) and «Volver» / Esc step back one level. One finding sentence per level (lib/sexenios/columna).
 * «Cómo leer esto» = three states of the SAME column (data-lens), never a second drawing.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { analysisApi } from '@/api/client'
import { FootNotes } from '@/components/kit/FootNotes'
import { PageHead, ReadLines } from '@/components/kit/PageHead'
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import { ADMIN_COLORS } from '@/lib/administrations'
import { SECTORS, CURRENT_MODEL_VERSION, getRiskLevelFromScore } from '@/lib/constants'
import { formatCompactMXN, formatContractTitle, formatDualCurrency, formatNumber } from '@/lib/utils'
import {
  backendKeyOf, critShare, destacan, findingColumn, findingCritCount, findingCritPesos, thinYears, type ColTerm, findingTerm, findingYear, levelOf, monthOf, termKey, TERM_SLUGS,
  type Level, type TermSlug,
} from '@/lib/sexenios/columna'
import { ColumnObject, pctLabel, type Lens } from './ColumnObject'
import { Cinco, Perfil, Ranked, vendorRows } from './Perfil'
import { PeriodList, Split } from './YearDrill'
import { MonthLine } from './MonthLine'
import './columna.css'

type Lang = 'es' | 'en'

const FULL: Record<TermSlug, string> = { fox: 'Fox', calderon: 'Calderón', 'pena-nieto': 'Peña Nieto', amlo: 'López Obrador', sheinbaum: 'Sheinbaum' }

function PfTag({ on, lang }: { on: boolean; lang: Lang }) {
  return on ? <span className="sxc-pf">{lang === 'es' ? ' · persona física' : ' · individual (persona física)'}</span> : null
}

export function LaColumna({ switcher, after }: { switcher: ReactNode; after?: ReactNode }) {
  const { i18n } = useTranslation()
  const lang: Lang = i18n.language?.startsWith('en') ? 'en' : 'es'
  const [params, setParams] = useSearchParams()
  const L = (es: string, en: string) => (lang === 'es' ? es : en)
  const q = useQuery({ queryKey: ['sexenios', 'columna'], queryFn: () => analysisApi.getSexeniosColumna(), staleTime: 60 * 60 * 1000, retry: 1 })
  const data = q.data
  const level = useMemo(() => levelOf(params, data), [params, data])
  const [lens, setLens] = useState<Lens>(0)

  const go = useCallback((next: Level) => {
    setParams((p) => {
      const n = new URLSearchParams(p)
      n.delete('g'); n.delete('y'); n.delete('m'); n.delete('cat')
      if (next.g) n.set('g', next.g)
      if (next.y) n.set('y', String(next.y))
      return n
    })
  }, [setParams])
  const back = useCallback(() => go(level.y ? { g: level.g, y: null } : { g: null, y: null }), [go, level])

  // W7: inside the open year, ?m= (a month) and ?cat= (a spending category) filter the contract list under it
  const openYear = data && level.y ? data.years.find((y) => y.year === level.y) : undefined
  const month = monthOf(params, openYear)
  const cat = openYear ? Number(params.get('cat')) || null : null
  const setDrill = useCallback((m: number | null, c: number | null) => {
    setParams((p) => {
      const n = new URLSearchParams(p)
      if (m) n.set('m', String(m)); else n.delete('m')
      if (c) n.set('cat', String(c)); else n.delete('cat')
      return n
    })
  }, [setParams])
  // W7 risk months: the open year's 12 months (critical pesos, the sector that pops out, the largest critical contract)
  const sigQ = useQuery({ queryKey: ['sexenios', 'signals', level.y], queryFn: () => analysisApi.getMonthSignals(level.y as number), enabled: !!level.y, staleTime: 60 * 60 * 1000, retry: 1 })
  const listRef = useRef<HTMLDivElement>(null)
  const onMonth = useCallback((m: number) => {
    setDrill(month === m ? null : m, cat)
    if (month !== m) requestAnimationFrame(() => listRef.current?.scrollIntoView({ block: 'nearest', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }))
  }, [setDrill, month, cat])
  // ✕ / Esc: the list closes, focus goes back to the month (or the category) that opened it
  const closeList = useCallback(() => {
    const sel = month ? `.sxl-m[data-month="${month}"]` : `.sxc-split button[data-cat="${cat}"]`
    setDrill(null, null)
    requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(sel)?.focus())
  }, [setDrill, month, cat])

  // After a level change: on a narrow screen the panel sits under the whole column, so bring it into view and put
  // focus on its heading; going back to the column returns focus to the plate it came from («Volver» unmounts).
  const panelRef = useRef<HTMLElement>(null)
  const prev = useRef<Level | null>(null)
  useEffect(() => {
    const was = prev.current
    prev.current = level
    if (!was || !data || (was.g === level.g && was.y === level.y)) return
    const raf = requestAnimationFrame(() => {
      if (!level.g) {
        if (was.g) document.querySelector<HTMLButtonElement>(`.sxc-plate[data-g="${was.g}"]`)?.focus()
        return
      }
      // a year opens in the column itself (its head sits over the month strip); a government, in the panel
      const target = level.y ? document.querySelector<HTMLElement>('.sxc-yh') : panelRef.current?.querySelector<HTMLElement>('h2')
      const narrow = window.matchMedia('(max-width: 1100px)').matches
      if (!narrow && !level.y) return
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      if (narrow) (level.y ? target : panelRef.current)?.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' })
      target?.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(raf)
  }, [level, data])

  useEffect(() => {
    if (!level.g) return
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (e.key !== 'Escape' || t?.closest('input, textarea, select, [role="dialog"]')) return
      if (month || cat) closeList(); else back()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [level.g, back, month, cat, closeList])

  const names = useMemo(() => Object.fromEntries(TERM_SLUGS.map((s) => [s, FULL[s]])) as Record<TermSlug, string>, [])
  const colors = useMemo(() => Object.fromEntries(TERM_SLUGS.map((s) => [s, ADMIN_COLORS[termKey(backendKeyOf(s)) ?? 'fox']])) as Record<TermSlug, string>, [])
  const ranges = useMemo(() => {
    const out = {} as Record<TermSlug, string>
    for (const s of TERM_SLUGS) {
      const t = data?.terms.find((x) => x.key === backendKeyOf(s))
      const ys = t?.years ?? []
      out[s] = ys.length ? (s === 'sheinbaum' ? `${ys[0]}–` : `${ys[0]}–${String(ys[ys.length - 1]).slice(2)}`) : ''
    }
    return out
  }, [data])

  const sectorName = (id: number) => { const s = SECTORS.find((x) => x.id === id); return s ? (lang === 'es' ? s.name : s.nameEN) : '—' }
  const monthLong = (m: number) => new Intl.DateTimeFormat(lang === 'es' ? 'es-MX' : 'en-US', { month: 'long' }).format(new Date(2001, m - 1, 1))
  const term = data && level.g ? data.terms.find((t) => t.key === backendKeyOf(level.g as TermSlug)) : undefined
  const year = data && level.y ? data.years.find((y) => y.year === level.y) : undefined
  const open = level.g === 'sheinbaum'
  const thin = useMemo(() => (data ? thinYears(data.years) : new Set<number>()), [data])
  const realYears = (t: ColTerm) => t.years.filter((y) => !thin.has(y)).length

  const finding = !data ? null
    : year ? findingYear(year, lang, sigQ.data?.year === year.year ? sigQ.data.crit_n : undefined)
    : term && level.g ? findingTerm(term, FULL[level.g], sectorName, lang, open)
    : findingColumn(data, lang, formatCompactMXN)

  const trail = [{ label: L('Sexenios', 'Administrations'), to: level.g ? '/administrations?vista=todos' : undefined }]
  if (level.g) trail.push({ label: FULL[level.g], to: level.y ? `/administrations?vista=todos&g=${level.g}` : undefined })
  if (level.y) trail.push({ label: String(level.y), to: undefined })

  const STEPS: [string, string][] = [
    [L('El ancho es el dinero de ese año.', 'Width is that year’s money.'), L('Una barra de color marca dónde termina cada gobierno.', 'A coloured bar marks where each government ends.')],
    [L('La barrita de la derecha: el dinero sin concurso.', 'The small bar on the right: money with no tender.'), L('Sin concurso: el gobierno eligió a la empresa sin competir. Antes de 2011 no se anotaba; va rayada.', 'No tender: the government picked the firm. Before 2011 it was not recorded; it is hatched.')],
    [L('Cada punto rojo: un contrato crítico de cada 100.', 'Each red dot: one critical contract in 100.'), L('Indicador de riesgo ≥ 0.60, no una prueba. Diez puntos = 10 o más.', 'Risk indicator ≥ 0.60, not proof. Ten dots = 10 or more.')],
  ]

  // W7 «risk contracts first»: Mariana's three lines; then the year's risk contracts (the board), ONE quiet month line
  // that filters it, «Lo que destaca», and the year card + «¿En qué se gastó?» under it
  const when = year ? (month ? L(`${monthLong(month)} de ${year.year}`, `${monthLong(month)} ${year.year}`) : String(year.year)) : ''
  const sig = sigQ.data && year && sigQ.data.year === year.year ? sigQ.data : undefined
  const yearHead = year && level.g ? (
    <header className="sxc-yhead">
      <button type="button" className="sxc-back" onClick={back}>
        ↩ {L(`Volver a ${FULL[level.g]}`, `Back to ${FULL[level.g]}`)} <kbd className="sxc-esc">Esc</kbd>
      </button>
      <h2 className="sxc-yh" tabIndex={-1}>{year.year} · {FULL[level.g]}</h2>
      <ReadLines lang={lang} className="sxc-ylines" lines={{
        see: L(`Los contratos de ${year.year} con indicador de riesgo crítico, del más grande.`, `The ${year.year} contracts with a critical risk indicator, largest first.`),
        read: L('Crítico = indicador ≥ 0.60, no una prueba. Toque un mes para filtrar.', 'Critical = indicator ≥ 0.60, not proof. Tap a month to filter.'),
        means: (sig && findingCritPesos(sig, lang)) ?? '—',
      }} />
      {sig && <p className="sxc-sub">{findingCritCount(sig, lang)}</p>}
    </header>
  ) : null
  // RED W7: the card reads the picked month (its name in the head) or, with none, the year — never a mix
  const cap = (w: string) => (w ? `${w[0].toUpperCase()}${w.slice(1)}` : w)
  const sm = month && sigQ.data?.year === year?.year ? sigQ.data?.months.find((x) => x.month === month) : undefined
  const sy = sigQ.data?.year === year?.year ? sigQ.data : undefined
  const facts = sm
    ? { value: sm.value, contracts: sm.contracts, da: year?.da_share == null || !sm.value ? null : sm.da_value / sm.value, crit100: sm.contracts ? (100 * sm.crit_n) / sm.contracts : null, critPesos: critShare(sm) }
    : { value: year?.value ?? 0, contracts: year?.contracts ?? 0, da: year?.da_share ?? null, crit100: year?.crit100 ?? null, critPesos: sy?.crit_share ?? null }
  const factsWhen = sm ? when : String(year?.year ?? '')
  const found = sig ? destacan(sig, monthLong, sectorName, lang, (n) => formatDualCurrency(n, sig.year)) : []
  const yearSlot = year && level.g ? (
    <>
      <div ref={listRef}><PeriodList key={`${month}-${cat}`} year={year.year} month={month} when={when} cat={cat} lang={lang} onClose={month || cat ? closeList : undefined} /></div>
      {sigQ.isError && <p className="ct-note" role="alert">{L('Los meses no cargaron.', 'The months did not load.')}</p>}
      {sig && <MonthLine sig={sig} month={month} onMonth={onMonth} lang={lang} />}
      <p className="sxc-sub">{L('Cuenta lo mismo que la columna: CompraNet, sin ComprasMX, contratos de hasta 100 mil MDP.', 'Counts what the column counts: CompraNet without ComprasMX, contracts up to 100B MXN.')}</p>
      {found.length > 0 && (
        <section className="sxc-destaca" aria-labelledby="sxc-destaca-h">
          <h3 id="sxc-destaca-h">{L('Lo que destaca', 'What stands out')}</h3>
          <ul>
            {found.map((f) => (
              <li key={f.kind}>
                {f.kind === 'vendor' && sig?.new_vendor
                  ? <><EntityIdentityChip type="vendor" id={sig.new_vendor.id} name={sig.new_vendor.name} size="inherit" fullName inline /><PfTag on={sig.new_vendor.persona_fisica} lang={lang} /> {f.text}</>
                  : f.text}
                {f.month && f.month !== month && <> <button type="button" className="sxc-linkbtn" onClick={() => onMonth(f.month as number)}>{L(`Ver sus contratos críticos de ${monthLong(f.month)}`, `See ${monthLong(f.month)}’s critical contracts`)} →</button></>}
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="sxc-ygrid">
        <div className="sxc-ycard">
          <div className="sxc-lists">
            <Ranked lang={lang} title={L('Quién ganó más', 'Who won the most')} head={[L('Empresa', 'Company'), L('Del dinero', 'Of money')]} rows={vendorRows(year.vendors, lang)} />
            <Ranked lang={lang} title={L('Los contratos más grandes', 'The largest contracts')} head={[L('Contrato', 'Contract'), L('Monto', 'Amount')]}
              rows={year.top_contracts.map((c) => {
                const crit = c.risk_score != null && getRiskLevelFromScore(c.risk_score) === 'critical'
                return {
                  key: c.id,
                  cells: [
                    <span key="c" className="sxc-name">
                      <Link to={`/contracts/${c.id}`} className="sxc-clamp" title={formatContractTitle(c.title) || undefined}>{formatContractTitle(c.title) || L(`Contrato ${c.id}`, `Contract ${c.id}`)}</Link>
                      {c.vendor && <small className="bd-dim"><EntityIdentityChip type="vendor" id={c.vendor.id} name={c.vendor.name} variant="name" className="bd-chip" fullName /><PfTag on={c.vendor.persona_fisica} lang={lang} /></small>}
                      {(crit || c.flag) && <small>{crit && <span className="bd-st is-critical">{L('crítico (≥ 0.60)', 'critical (≥ 0.60)')}</span>}{c.flag && <span className="bd-tag is-flag">{c.amount_flag === 'suspect_decimal' ? L('posible error de decimales: revisar', 'possible decimal error: check') : L('más de 10 mil MDP: revisar', 'over 10B MXN: check')}</span>}</small>}
                    </span>,
                    formatCompactMXN(c.amount),
                  ],
                }
              })} />
          </div>
        </div>
        <div className="sxc-ycard">
          <h3 className="sxc-facts-h">{cap(factsWhen)}</h3>
          <dl className="sxc-facts" aria-label={cap(factsWhen)}>
            <div><dt>{L('Dinero', 'Money')}</dt><dd>{formatCompactMXN(facts.value)}</dd></div>
            <div><dt>{L('Contratos', 'Contracts')}</dt><dd>{formatNumber(facts.contracts)}</dd></div>
            <div><dt>{L('Sin concurso', 'No tender')}</dt><dd>{pctLabel(facts.da, lang)} <small>{L('del dinero', 'of the money')}</small></dd></div>
            <div><dt>{L('Críticos', 'Critical')}</dt><dd>{facts.crit100 == null ? '—' : <>{facts.crit100.toLocaleString(lang === 'es' ? 'es-MX' : 'en-US', { maximumFractionDigits: 1 })} <small>{L('de cada 100', 'per 100')}</small></>}</dd></div>
            <div><dt>{L('Pesos críticos', 'Critical pesos')}</dt><dd>{pctLabel(facts.critPesos, lang)} <small>{L('del dinero', 'of the money')}</small></dd></div>
          </dl>
          <Split year={year.year} month={month} when={when} cat={cat} lang={lang} onCat={(c) => setDrill(month, c)} />
        </div>
      </div>
    </>
  ) : null

  return (
    <article className="ct ct-page ct-sheet adm-page sxc-page">
      <div className="ct-wrap">
        {/* kit/PageHead (owner 11-06): crumbs + tabs → (deeper levels) the level → h1 = the level's finding → the question */}
        <PageHead lang={lang} crumbs={trail}
          kicker={level.y ? L('Un año', 'One year') : level.g ? (open ? L('El gobierno en curso · solo CompraNet, hasta el 28 sep. 2025', 'The government in office · CompraNet only, to 28 Sep 2025') : L('Un gobierno', 'One government')) : undefined}
          finding={<span aria-live="polite">{finding ?? (q.isError ? L('La columna no cargó.', 'The column did not load.') : L('Cargando la columna…', 'Loading the column…'))}</span>}
          question={L('¿Cómo compró cada gobierno?', 'How did each government buy?')} />
        {/* the government picker sits directly under the head, as on the one-government file */}
        <div className="adm-pickrow">{switcher}</div>

        {q.isLoading && <div className="sxc-hold" aria-busy="true" />}
        {q.isError && <p className="ct-note" role="alert">{L('El servidor no respondió. Vuelva a intentarlo en un momento.', 'The server did not answer. Try again in a moment.')}</p>}

        {data && (
          <div className="sxc-grid" data-level={year ? 2 : undefined}>
            <ColumnObject data={data} level={level} lens={lens} lang={lang} names={names} colors={colors} ranges={ranges}
              onTerm={(g) => go(level.g === g && !level.y ? { g: null, y: null } : { g, y: null })}
              onYear={(y) => go(level.y === y ? { g: level.g, y: null } : { g: level.g, y })}
              yearHead={yearHead} yearSlot={yearSlot} />

            {!year && <aside ref={panelRef} className="sxc-panel" aria-label={L('Lo que muestra este nivel', 'What this level shows')}>
              {level.g && (
                <button type="button" className="sxc-back" onClick={back}>
                  ↩ {level.y ? L(`Volver a ${FULL[level.g]}`, `Back to ${FULL[level.g]}`) : L('Volver a la columna', 'Back to the column')} <kbd className="sxc-esc">Esc</kbd>
                </button>
              )}

              {!level.g && (
                <section className="sxc-how" aria-labelledby="sxc-how-h">
                  <h2 id="sxc-how-h">{L('Cómo leer esto', 'How to read this')}</h2>
                  <div className="sxc-how-steps" role="group" aria-label={L('Pasos sobre la misma columna', 'Steps over the same column')}>
                    {STEPS.map((s, i) => (
                      <button key={i} type="button" aria-pressed={lens === i + 1} onClick={() => setLens(lens === i + 1 ? 0 : (i + 1) as Lens)}>
                        <span className="sxc-n">{i + 1}</span>{s[0]}
                      </button>
                    ))}
                  </div>
                  <p className="ct-note">{lens ? STEPS[lens - 1][1] : L('Toque un paso: la columna enseña solo esa parte.', 'Tap a step: the column shows only that part.')}</p>
                </section>
              )}
              {!level.g && <Cinco terms={data.terms} lang={lang} nYears={realYears} onOpen={(g) => go({ g, y: null })} />}

              {term && level.g && !year && <Perfil term={term} slug={level.g} lang={lang} open={open} cut={data.cut} />}

            </aside>}
          </div>
        )}

        {after}

        <FootNotes lang={lang} lead={L(
          `Datos de CompraNet 2002–2025, en pesos de cada año, sin ajustar por inflación. Quitamos los contratos de más de 100 mil MDP. Crítico = indicador de riesgo ≥ 0.60 (modelo ${CURRENT_MODEL_VERSION}), no una prueba.`,
          `CompraNet data 2002–2025, in each year’s pesos, not adjusted for inflation. We dropped contracts above 100B MXN. Critical = risk indicator ≥ 0.60 (model ${CURRENT_MODEL_VERSION}), not proof.`,
        )} items={[
          L('2002–2010 es el registro más débil; 2004 casi no tiene contratos.', '2002–2010 is the weakest record; 2004 has almost no contracts.'),
          L('Antes de 2011 no se anotaba si hubo concurso: esa barrita va rayada.', 'Before 2011 tendering was not recorded: the bar is hatched.'),
          L('Cada año va con el presidente que gobernó la mayor parte de él.', 'Each year goes to the president who governed most of it.'),
          L('El registro federal se congeló el 28 de septiembre de 2025; ComprasMX no entra aquí.', 'The federal record froze on 28 September 2025; ComprasMX is not included here.'),
          L('Las personas físicas se nombran con su etiqueta; su RFC nunca se muestra.', 'Individuals are named with their label; their RFC is never shown.'),
        ]} />
      </div>
    </article>
  )
}
