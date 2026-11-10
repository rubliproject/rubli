/**
 * /rastro — «El rastreo de un peso» (owner pick 2026-10-29: money paths «El muro» B, Rastro = A's travelling coins).
 * One 2024 IMSS peso on medicines, followed from the Cuenta Pública through the contract register to Farmacéuticos
 * Maypo's last contract of the year, and the four places sight is lost. Copy = the reviewed V2 (REVIEW_V2 → SHIP),
 * figures computed from GET /rastro/trail (weekly, scripts/precompute_rastro.py; bundled lib/moneyPaths/rastro.data.json as fallback) + live
 * GET /contracts/{id} and GET /no-se-ve/imss. The old carve (institution → category → vendor → contract) is /rastro/registro.
 */
import { MoreLine } from '@/components/kit/MoreLine'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api, contractApi } from '@/api/client'
import { noSeVeApi } from '@/api/noSeVe'
import type { ContractDetail } from '@/api/types'
import { DocHead } from '@/components/contrato/DocHead'
import { useLang } from '@/components/contrato/nav'
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import { ChapHead, Escalera, Frame, Md, Objeto, Rail, scrollToRung, type FrameChap } from '@/components/moneyPaths/MoneyPaths'
import { HOLDS, type RungK } from '@/lib/moneyPaths/ladder'
import { rastroSpec } from '@/lib/moneyPaths/muro'
import { IMSS, MAYPO, RASTRO, cards, chapters, despues, head, trailOk, type RastroPack } from '@/lib/moneyPaths/rastro'
import { cv, date } from '@/lib/moneyPaths/fmt'
import '@/components/kit/kit.css'

export default function Rastro() {
  const lang = useLang()
  const en = lang === 'en'
  const t = (es: string, e: string) => (en ? e : es)
  const [on, setOn] = useState<RungK>(1)
  // the weekly trail (GET /rastro/trail); the bundled pack while it loads, on 404, or if a claim no longer holds on it
  const tq = useQuery({ queryKey: ['rastro', 'trail'], queryFn: () => api.get<RastroPack>('/rastro/trail').then((r) => r.data), staleTime: 60 * 60 * 1000, retry: false })
  const R = useMemo(() => (trailOk(tq.data) ? tq.data : RASTRO), [tq.data])
  const cq = useQuery({ queryKey: ['contract', R.contract.id], queryFn: () => contractApi.getById(R.contract.id), staleTime: 60 * 60 * 1000, retry: 1 })
  const iq = useQuery({ queryKey: ['no-se-ve', 'ente', 'imss'], queryFn: () => noSeVeApi.entity('imss'), staleTime: 60 * 60 * 1000, retry: 1 })
  // the live record; the pack's copy of it (read 2026-10-29) only while it loads or if the API is down
  const contract = (cq.data ?? R.contract) as ContractDetail
  const imss24 = useMemo(() => { const y = iq.data?.years.find((r) => r.year === 2024); return y?.exercised_cap2356 ? { ex: y.exercised_cap2356, vis: y.contracts_visible_mxn } : null }, [iq.data])
  const phone = typeof window !== 'undefined' && window.innerWidth < 640
  const spec = useMemo(() => rastroSpec(contract, lang, phone, R), [contract, lang, phone, R])
  const H = head(lang, contract.contract_date ?? R.contract.contract_date, R)
  const CH = chapters(lang, imss24, R)
  const K = cards(lang, R), D = despues(lang, R)
  const C = R.c
  const go = (k: RungK) => { setOn(k); scrollToRung(HOLDS.rastro[k]) }
  const inst: Partial<Record<RungK, string>> = {
    1: t('un peso del IMSS en medicinas, 2024', 'one IMSS peso on medicines, 2024'),
    2: `${t('la compra', 'the purchase')}: ${cv(C.reg, lang, 0)} → ${cv(C.da, lang, 0)} → ${cv(C.t12, lang, 0)} ¢`,
    3: `IMSS ← Maypo · ${cv(C.maypo, lang, 1)} ¢`,
    4: `${contract.contract_number} · IMSS ← Maypo · ${(contract.contract_date ?? '').slice(0, 4)}`,
  }

  const frameChaps: FrameChap[] = CH.map((c) => {
    const id = HOLDS.rastro[c.k]!
    return {
      k: c.k, id,
      head: <ChapHead id={id} n={c.n} kicker={c.kicker} title={c.title} />,
      body: (
        <>
          {(c.prose.length > 0 || c.cut) && <div className="mp-prose">{c.prose.map((p, i) => <p key={i}>{p}</p>)}{c.cut && <p className="mp-cut">{c.cut}</p>}</div>}
          {c.k === 3 && (
            <p className="mp-door">
              <EntityIdentityChip type="vendor" id={MAYPO} name={R.maypo.name} size="sm" /> ← <EntityIdentityChip type="institution" id={IMSS} name="Instituto Mexicano del Seguro Social" size="sm" /> · <Link className="ct-link" to={`/contracts/${contract.id}`}>{contract.contract_number} →</Link>
            </p>
          )}
          {c.k === 4 && (
            <>
              <div className="mp-cards">{K.cards.map((k) => <div key={k.h} className="mp-card"><h4 aria-level={3}>{k.h}</h4><Md s={k.b} /><span className="mp-src">{k.src}</span></div>)}</div>
              <div className="mp-prose"><p>{K.close}</p></div>
              <div className="mp-despues" aria-labelledby="mp-despues-h"><h3 id="mp-despues-h">{D.h}</h3><div className="mp-prose"><p>{D.p}</p></div><p className="mp-srcline">{D.src}</p></div>
            </>
          )}
          <Rail k={c.railK} lang={lang} rows={c.rail.map((r) => ({ n: r.n, t: r.t, seal: r.seal, todo: r.todo, src: r.href ? <Link className="ct-link" to={r.href}>{r.hrefLabel}</Link> : r.src }))} />
        </>
      ),
    }
  })

  return (
    <article className="ct ct-page ct-sheet mp-page">
      <div className="ct-wrap">
        <DocHead trail={[{ label: t('Análisis', 'Analysis') }, { label: t('El rastreo de un peso', 'Following one peso') }]} meta={H.meta} />
        <header className="cr-head mp-head">
          <div>
            <h1>{H.h1}</h1>
            <MoreLine className="cr-lede">{H.lede}</MoreLine>
            <p className="mp-verdict"><span>{H.verdict.map((v, i) => <span key={i}>{i > 0 && ' → '}<b className={i === 3 ? 'mp-seal' : undefined}>{v}</b></span>)}</span><span>{H.verdictK}</span></p>
            <MoreLine className="mp-defs">{H.defs}</MoreLine>
          </div>
        </header>
        <Escalera page="rastro" inst={inst} on={on} onRung={go} lang={lang} />
        <Frame object={<Objeto spec={spec} focus={String(on)} lang={lang} />} chapters={frameChaps} onChapter={setOn} cap={spec.cap} lang={lang} />
        <details className="mp-notas">
          <summary>{t('Notas, método y fuentes', 'Notes, method and sources')}</summary>
          <p><Md s={t('Esta página sigue un peso del IMSS gastado en medicinas en 2024 por dos registros públicos: la **Cuenta Pública** (SHCP, ramo 50, partida 25301, monto ejercido en los tres años; el archivo de 2025 es el publicado en datos abiertos con otra estructura) y el **registro de contratos** (CompraNet al 28 de septiembre de 2025 y ComprasMX). Un contrato se cuenta en su año de firma; un peso gastado, en su año de pago. Del tercer paso en adelante se cuentan solo compras sin concurso, para que cada paso sea parte del anterior. Los contratos de 2025 se cuentan en CompraNet; con ComprasMX la cifra sube un poco. Que después de la firma no haya pago, entrega ni precio por pieza describe los registros que RUBLI reúne, no toda la información pública. Mide **visibilidad**, no irregularidades: una compra sin concurso con artículo citado es legal; un lugar en la fila de investigación es un **indicador de riesgo**, no una acusación. Montos de más de cien mil millones de pesos excluidos. Pesos corrientes.', 'This page follows one IMSS peso spent on medicines in 2024 through two public records: the **federal accounts** (SHCP Cuenta Pública, branch 50, budget line 25301, amount spent in all three years; the 2025 file is the open-data release with a different structure) and the **contract register** (CompraNet to September 28, 2025, plus ComprasMX). A contract counts in the year it was signed; a peso spent, in the year it was paid. From the third step on, only direct awards are counted, so that each step is part of the one before. 2025 contracts are counted in CompraNet; with ComprasMX the figure rises slightly. That nothing after the signature shows a payment, a delivery or a unit price describes the records RUBLI gathers, not all public information. It measures **visibility**, not wrongdoing: a direct award with a cited article is legal; a place in the investigation queue is a **risk indicator**, not an accusation. Amounts above one hundred billion pesos excluded. Current pesos.')} /> {t('Si una persona física aparece, se nombra y se marca «persona física»; los RFC no se publican. En esta página no aparece ninguna.', 'Where an individual appears, they are named and labelled “persona física”; RFCs are not published. None appears on this page.')}</p>
          <ul>
            <li>{t(`Trayecto leído el ${date(R.read, lang)} (Cuenta Pública 2023–2025 y el registro de RUBLI); el contrato se lee en vivo de`, `Trail read on ${date(R.read, lang)} (federal accounts 2023–2025 and the RUBLI register); the contract is read live from`)} <Link className="ct-link" to={`/contracts/${contract.id}`}>/contracts/{contract.id}</Link>.</li>
            <li>ASF · {t(`Cuenta Pública ${R.asf.cp}, auditoría ${R.asf.audit} (Birmex), contrato de servicios ${R.asf.service_contract}: monto «${R.asf.status_es}»`, `${R.asf.cp} public accounts, audit ${R.asf.audit} (Birmex), service contract ${R.asf.service_contract}: amount “${R.asf.status_en}”`)} · <a className="ct-link" href="https://www.asf.gob.mx/Trans/Informes/IR2023c/Documentos/Auditorias/2023_0234_a.pdf" target="_blank" rel="noopener noreferrer">2023_0234_a.pdf</a></li>
            <li>{t(`ARIA · lectura del ${date(R.read, lang)} · modelo v0.9.2`, `ARIA · reading of ${date(R.read, lang)} · model v0.9.2`)}</li>
            <li><Link className="ct-link" to="/rastro/registro">{t('Recorrer el registro por categoría, proveedor y contrato →', 'Walk the register by category, supplier and contract →')}</Link></li>
          </ul>
        </details>
      </div>
    </article>
  )
}
