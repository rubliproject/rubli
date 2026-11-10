/**
 * /captura · «Del comprador al contrato» — the money-paths frame on Captura (owner pick 2026-10-29, «El muro» B with the
 * fixed Captura encoding: every box FULL = in view; the coloured block = captive money; red only as the top of the
 * crítico contract). Rungs 2 → 4: the buyers, the pair (the current captive with the most money), its largest contract.
 * Copy = the reviewed concept (money_paths_2026-10-29 src/pages.js, REVIEW F1–F5) with every figure computed from
 * GET /captura/plates · /captura/majority · /captura/pair · /contracts/{id}; each claim prints only when it holds
 * (lib/moneyPaths/captura.ts, captura.test.ts). Every piece opens the live dissection drawer.
 */
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { capturaApi, type CapturaMajority } from '@/api/captura'
import { contractApi } from '@/api/client'
import type { Sel } from '@/components/captura/dissect'
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import { RASTRO_LIVE } from '@/lib/constants'
import type { Relevo } from '@/lib/captura/relevo'
import { capturaCopy } from '@/lib/moneyPaths/captura'
import { HOLDS, type RungK } from '@/lib/moneyPaths/ladder'
import { capturaGrid, capturaSpec, type Open } from '@/lib/moneyPaths/muro'
import type { Lang } from '@/lib/moneyPaths/fmt'
import { ChapHead, Frame, Objeto, Rail, type FrameChap } from './MoneyPaths'
import { MuroPlano } from './MuroPlano'

/** The pair the frame follows: the current captive with the most money (top of «Las pruebas»). */
export const framePair = (m: Relevo) => [...m.cur].sort((a, b) => b.m - a.m)[0] ?? null

export function usePairAndContract(m: Relevo) {
  const top = framePair(m)
  const pq = useQuery({ queryKey: ['captura', 'pair', top?.vendor_id, top?.institution_id], queryFn: () => capturaApi.pair(top!.vendor_id, top!.institution_id), enabled: !!top, staleTime: 30 * 60 * 1000 })
  const largest = pq.data?.contracts.length ? [...pq.data.contracts].sort((a, b) => b.amount_mxn - a.amount_mxn)[0] : null
  const cq = useQuery({ queryKey: ['contract', largest?.id], queryFn: () => contractApi.getById(largest!.id), enabled: !!largest, staleTime: 60 * 60 * 1000 })
  return { top, pair: pq.data ?? null, contract: cq.data ?? null }
}

export function CapturaMuro({ m, maj, lang, on, setOn, open }: { m: Relevo; maj: CapturaMajority | undefined; lang: Lang; on: RungK; setOn: (k: RungK) => void; open: (s: Sel | null) => void }) {
  const en = lang === 'en'
  const { top, pair, contract } = usePairAndContract(m)
  const vendorName = pair?.pair.name ?? top?.name ?? ''
  const phone = typeof window !== 'undefined' && window.innerWidth < 640
  const [d3, setD3] = useState(false)
  const spec = useMemo(() => (d3 ? capturaSpec({ m, pair, contract, vendorName }, lang, phone) : null), [d3, m, pair, contract, vendorName, lang, phone])
  const grid = useMemo(() => capturaGrid(m, lang, pair?.pair.institution_id ?? top?.institution_id), [m, lang, pair, top])
  const toggle = <button type="button" className="mpp-3d" onClick={() => setD3(!d3)}>{d3 ? (en ? 'back to the table' : 'volver a la tabla') : (en ? 'see in 3D' : 'ver en 3D')}</button>
  const openO = (o: Open) => { if (o.kind === 'inst') open({ inst: o.inst, pair: o.pair ?? null }) }
  const copy = capturaCopy({ m, maj: maj ?? null, pair, contract }, lang)
  // rung II («los compradores») repeated the ribbon and La mitad above it word for word: on /captura it is the
  // ribbon itself (HOLDS.captura[2] = 'compradores'); the wall walks the pair (III) and its contract (IV) only
  const chaps: FrameChap[] = copy.chapters.filter((c) => c.k !== 2).map((c) => {
    const id = HOLDS.captura[c.k]!
    return {
      k: c.k, id,
      head: <ChapHead id={id} n={c.n} kicker={c.kicker} title={c.title} />,
      body: (
        <>
          {c.k === 3 && pair && (
            <p className="mp-door">
              <EntityIdentityChip type="vendor" id={pair.pair.vendor_id} name={pair.pair.name} size="sm" /> ← <EntityIdentityChip type="institution" id={pair.pair.institution_id} name={m.buyer.get(pair.pair.institution_id)?.name ?? ''} size="sm" />
              {' · '}<button type="button" className="cr-inst" onClick={() => open({ inst: pair.pair.institution_id, pair: pair.pair.vendor_id })}>{en ? 'dissect the pair →' : 'diseccionar la pareja →'}</button>
            </p>
          )}
          {/* owner 11-07 «compact» + 11-08 audit #25: the bold title is the chapter's finding; the case prose AND
              its rail of figures wait one click away (nothing is cut — the rail rows keep every figure and source) */}
          <details className="mp-more">
            <summary>{en ? 'The full case and its figures' : 'El caso completo y sus cifras'}</summary>
            <div className="mp-prose">{c.prose.map((p, i) => <p key={i}>{p}</p>)}{c.cut && <p className="mp-cut">{c.cut}</p>}</div>
            <Rail k={c.railK} lang={lang} rows={c.rail} />
          </details>
          {c.k === 4 && contract && <p className="mp-door"><Link className="ct-link" to={`/contracts/${contract.id}`}>{en ? `Contract ${contract.contract_number} →` : `Contrato ${contract.contract_number} →`}</Link>{RASTRO_LIVE && <> · <Link className="ct-link" to="/rastro">{en ? 'Another IMSS contract, followed from the budget peso to the signature: Following one peso →' : 'Otro contrato del IMSS, seguido desde el peso del presupuesto hasta la firma: El rastreo de un peso →'}</Link></>}</p>}
        </>
      ),
    }
  })
  return (
    <section className="ct-section cr-sec" aria-labelledby="mp-muro-h" id="muro">
      <h2 id="mp-muro-h" className="cr-h2"><span>{en ? 'From the buyer to the contract' : 'Del comprador al contrato'}</span><span className="vd-lec-k">{en ? '§ the wall · the pair, the contract' : '§ el muro · la pareja, el contrato'}</span></h2>
      <Frame object={spec ? <><p className="mp-focus">{toggle}</p><Objeto spec={spec} focus={String(on)} lang={lang} onOpen={openO} /></> : <MuroPlano grid={grid} lang={lang} tools={toggle} onOpen={openO} />} chapters={chaps} onChapter={setOn} cap={spec?.cap} lang={lang} />
    </section>
  )
}
