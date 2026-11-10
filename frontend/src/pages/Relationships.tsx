/**
 * Relationships — Institutional Capture «PASADA LA MITAD» / "Past the Half"
 * (captura-mitad spec 2026-10-07; base cap-geometry, grafts from cap-dossier).
 *
 * One question: which federal buyers spend most of their money with one
 * private company right now, and who is the company?
 *
 * 2026-10-15 (UI 1.0 «El Contrato», W3): reskinned, not rebuilt.
 *  · DocHead › the h1 on one line (Cover is-op; owner 2026-10-15: object first)
 *  · the object at full measure: the ledger-chart — one 100% bar per buyer crossing
 *    the red half-line, each row opening a short «ficha» (row 01 open on load)
 *  · «En cifras»: buyers past half · pesos held · case labels · ARIA tiers 1–2
 *  · La Línea: the strict year-by-year climbs past half (open; /capture/top eager)
 *  · Cómo se lee: what a majority share is not | the pairs left out on purpose
 *  · Declaraciones (foot): the finding as prose + source, scope, model
 * One eager call (/capture/current). Arithmetic on award amounts; the ARIA and
 * case seals are cross-references, never the finding.
 */

import { useCaseCountLabels } from '@/hooks/useGroundTruthCount'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Skeleton } from '@/components/ui/skeleton'
import { captureApi } from '@/api/client'
import { formatCompactMXN, formatCompactUSD, formatNumber } from '@/lib/utils'
import { formatVendorName } from '@/lib/vendor/formatName'
import { CaptureFilm } from '@/components/capture/CaptureFilm'
import { MajorityLedger } from '@/components/capture/MajorityLedger'
import { glueDashes } from '@/lib/typography'
import { DocHead } from '@/components/contrato/DocHead'
import { Cover } from '@/components/contrato/Cover'
import { Clause } from '@/components/contrato/Clause'
import { RISK_COLORS } from '@/lib/constants'
import type { ReactNode } from 'react'
import '@/components/capture/capture.css'
import { FootNotes } from '@/components/kit/FootNotes'

/** `head` = the /captura view switch (pages/Captura.tsx), rendered under the DocHead. */
export default function Relationships({ head }: { head?: ReactNode } = {}) {
  const { i18n } = useTranslation()
  const lang = (i18n.language.startsWith('es') ? 'es' : 'en') as 'en' | 'es'
  const en = lang === 'en'
  const cc = useCaseCountLabels(lang) // weekend F8: computed, never typed

  const { data: now, isLoading, isError } = useQuery({
    queryKey: ['capture', 'current'],
    queryFn: () => captureApi.getCurrent(),
    staleTime: 30 * 60 * 1000,
  })
  const { data: capData, isLoading: capLoading } = useQuery({
    queryKey: ['capture', 'top', 50],
    queryFn: () => captureApi.getTop({ limit: 50 }),
    staleTime: 30 * 60 * 1000,
  })

  const labelled = now
    ? (now.n_documented === now.n_labelled
        ? (en ? `${now.n_labelled} of the companies are in our documented-case base` : `${now.n_labelled} de esas empresas están en nuestra base de casos documentados`)
        : (en ? `${now.n_labelled} of the companies already carry a case label in RUBLI’s base` : `${now.n_labelled} de esas empresas ya tienen una etiqueta de caso en la base de RUBLI`))
    : ''
  const dek = now
    ? (en
        ? `In 2024 and 2025, ${now.count} of the ${formatNumber(now.field_count)} largest federal buyers spent more than half their money with one private company: ${formatCompactMXN(now.held_mxn)} of ${formatCompactMXN(now.buyers_total_mxn)}. Usually it happened through one or two large awards, not years of creep. ${labelled}; ${now.n_aria_t12} sit in ARIA’s top two tiers. A majority share is a fact about the award record, not proof of wrongdoing.`
        : `En 2024 y 2025, ${now.count} de los ${formatNumber(now.field_count)} mayores compradores federales gastaron más de la mitad de su dinero con una sola empresa privada: ${formatCompactMXN(now.held_mxn)} de ${formatCompactMXN(now.buyers_total_mxn)}. Casi siempre ocurrió con una o dos adjudicaciones grandes, no con años de avance gradual. ${labelled}; ${now.n_aria_t12} están en los dos niveles más altos de ARIA. Una participación mayoritaria es un hecho del registro de adjudicaciones, no prueba de irregularidad.`)
    : (en
        ? 'Which federal buyers spend most of their money with one private company right now, and who is the company? Each row is one buyer, its bar the share that went to one supplier.'
        : '¿Qué compradores federales gastan hoy la mayor parte de su dinero con una sola empresa privada, y cuál es? Cada fila es un comprador; su barra, la parte que fue a un solo proveedor.')
  const heldShare = now && now.buyers_total_mxn > 0 ? now.held_mxn / now.buyers_total_mxn : null

  return (
    <article className="ct ct-page ct-sheet">
      <div className="ct-wrap">
        <DocHead trail={[{ label: en ? 'Analysis' : 'Análisis' }, { label: en ? 'Capture' : 'Captura' }]} />
        {head}

        <Cover className="is-op" title={en ? 'One buyer, one supplier.' : 'Un comprador, un proveedor.'} />

        {/* The lead at full measure: the ledger-chart, each bar crossing the red half-line. */}
        <section className="cap-lead" aria-label={en ? 'Past the half: buyers and their majority supplier' : 'Pasada la mitad: compradores y su proveedor mayoritario'}>
          <div>
            {isLoading ? (
              <div className="space-y-2" aria-busy="true">
                {Array.from({ length: 10 }, (_, i) => <Skeleton key={i} className="h-8 w-full" />)}
              </div>
            ) : isError || !now ? (
              <p role="alert" className="ct-note">
                {en ? 'The register is not available right now. Try again shortly.' : 'El registro no está disponible en este momento. Intente de nuevo en breve.'}
              </p>
            ) : (
              <MajorityLedger data={now} lang={lang} />
            )}
          </div>
        </section>

        {/* ─── EN CIFRAS (DESIGN.md §4.2) ─── */}
        <section className="ct-clauses" aria-labelledby="cap-cl-h">
          <h2 id="cap-cl-h">{en ? 'In figures' : 'En cifras'}</h2>
          <div className="ct-cl-grid">
            <Clause
              id="cap-cl-buyers"
              title={en ? 'Buyers past half, 2024–25' : 'Compradores pasada la mitad, 2024–25'}
              fig={now ? String(now.count) : '—'}
              count={now ? { value: now.count, format: (n) => String(Math.round(n)) } : null}
              unit={now ? `/ ${formatNumber(now.field_count)}` : undefined}
              ruler={now ? { value: now.count / Math.max(1, now.field_count), mode: 'fill', ends: ['0', en ? 'largest federal buyers' : 'mayores compradores federales', formatNumber(now.field_count)] } : undefined}
            />
            <Clause
              id="cap-cl-held"
              title={en ? 'Held by the one supplier' : 'En manos del único proveedor'}
              fig={now ? formatCompactMXN(now.held_mxn) : '—'}
              ruler={heldShare != null && now ? { value: heldShare, mode: 'fill', ends: ['0', en ? `of ${formatCompactMXN(now.buyers_total_mxn)}` : `de ${formatCompactMXN(now.buyers_total_mxn)}`, '100%'] } : undefined}
              note={now && en ? `≈${formatCompactUSD(now.held_mxn)}` : undefined}
            />
            <Clause
              id="cap-cl-cases"
              title={en ? 'Suppliers with a case label' : 'Proveedores con etiqueta de caso'}
              fig={now ? String(now.n_labelled) : '—'}
              count={now ? { value: now.n_labelled, format: (n) => String(Math.round(n)) } : null}
              note={en ? 'in RUBLI’s case base; most are leads' : 'en la base de casos de RUBLI; la mayoría son indicios'}
            />
            <Clause
              id="cap-cl-aria"
              title={en ? 'In ARIA tiers 1–2' : 'En los niveles ARIA 1–2'}
              fig={now ? String(now.n_aria_t12) : '—'}
              count={now ? { value: now.n_aria_t12, format: (n) => String(Math.round(n)) } : null}
              ruler={now ? { value: now.n_aria_t12 / Math.max(1, now.count), mode: 'fill', color: RISK_COLORS.high, ends: ['0', en ? 'risk indicator' : 'indicador de riesgo', String(now.count)] } : undefined}
            />
          </div>
        </section>

        {/* ─── La Línea — the strict year-by-year climbs past half, open (owner 2026-10-15: object first) ─── */}
        <section className="ct-section cap-line" aria-labelledby="pelicula-heading">
          {capLoading || !capData ? (
            <Skeleton className="h-[640px] w-full" />
          ) : (
            <CaptureFilm data={capData.data} thresholds={capData.thresholds} lang={lang} />
          )}
        </section>

        {/* ─── Cómo se lee — honesty beside the pairs left out ─── */}
        <section className="ct-section" aria-labelledby="cap-read-h">
          <div className="ct-annex-row">
            <h2 id="cap-read-h" className="ct-h2">{en ? 'How to read it' : 'Cómo se lee'}</h2>
          </div>
          <div className="ct-section-body cap-two">
            <Honesty lang={lang} now={now} />
            <div className="min-w-0">
              <h3 className="cap-h3">
                {en ? 'Left out on purpose' : 'Fuera a propósito'}
                {now ? <span className="ct-mono"> {now.excluded_pairs.length}</span> : null}
              </h3>
              <p className="cap-p">
                {en
                  ? 'These buyers also gave one supplier over half of 2024–25 spend, but the supplier is a state company, a public body or a structural supplier. They are listed, not ranked.'
                  : 'Estos compradores también dieron a un proveedor más de la mitad del gasto 2024–25, pero el proveedor es una empresa del Estado, un organismo público o un proveedor estructural. Se listan, no se clasifican.'}
                {now && now.excluded.persona_fisica > 0 && (en
                  ? ` ${now.excluded.persona_fisica} more are held by individuals, counted apart and not named in this list.`
                  : ` ${now.excluded.persona_fisica} más los tienen personas físicas, que se cuentan aparte y no se nombran en esta lista.`)}
              </p>
              <ul className="cap-out">
                {now?.excluded_pairs.map((x) => (
                  <li key={`${x.institution_id}-${x.vendor_id}`}>
                    <span className="min-w-0">
                      {x.institution_name} <span className="text-text-muted">→</span> {formatVendorName(x.vendor_name, Infinity)}
                    </span>
                    <span className="ct-mono cap-num">
                      {x.share_pct.toFixed(1)}% · {formatCompactMXN(x.vendor_mxn)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
            {now && (
              <dl className="cap-dl">
                <dt>{en ? 'Window' : 'Ventana'}</dt>
                <dd>{now.window.from_year} – {now.window.data_horizon}</dd>
                <dt>{en ? 'Buyers' : 'Compradores'}</dt>
                <dd>≥ {formatCompactMXN(now.thresholds.min_inst_window_mxn)} {en ? 'in the window' : 'en la ventana'} · {formatNumber(now.field_count)}</dd>
                <dt>{en ? 'Majority' : 'Mayoría'}</dt>
                <dd>≥ {now.thresholds.majority_pct}% {en ? 'to one supplier' : 'a un proveedor'} · {now.majority_count_all} → {now.count} {en ? 'private' : 'privados'}</dd>
                <dt>{en ? 'Amounts' : 'Montos'}</dt>
                <dd>{en ? '> 100B MXN rejected · > 10B flagged' : '> 100,000 MDP rechazados · > 10,000 MDP marcados'}</dd>
              </dl>
            )}
        </section>


        <section className="ct-section cap-foot" aria-label={en ? 'Reading and notes' : 'Lectura y notas'}>
          <p className="cap-foot-lede">{glueDashes(dek)}</p>
          <FootNotes lead={en
              ? 'What it is. A majority share describes how contracts were awarded, not how they were performed; only courts establish an offence.'
              : 'Qué es. Una participación mayoritaria describe cómo se adjudicaron los contratos, no cómo se ejecutaron; solo los tribunales establecen un delito.'} lang={en ? 'en' : 'es'} items={[
            en
              ? 'Source. COMPRANET award amounts, 1 Jan 2024 to 28 Sep 2025; 2025 is a nine-month year.'
              : 'Fuente. Montos adjudicados en COMPRANET, del 1 de enero de 2024 al 28 de septiembre de 2025; 2025 es un año de nueve meses.',
            en
              ? `Model. Risk model trained on RUBLI’s labelled case set (cases on record at training: ${cc.atTraining}; most are analyst write-ups, not adjudicated findings). Its signals are statistical indicators, not legal determinations.`
              : `Modelo. Modelo de riesgo entrenado con la base de casos etiquetados de RUBLI (casos registrados al entrenar: ${cc.atTraining}; la mayoría documentados por analistas, no resoluciones). Sus señales son indicadores estadísticos, no determinaciones legales.`,
            <Link to="/methodology">{en ? 'See the full methodology' : 'Ver la metodología completa'}</Link>,
          ]} />
        </section>
      </div>
    </article>
  )
}

// ─── Cómo se lee, left column — what a majority share is and is not ───────────
function Honesty({ lang, now }: { lang: 'en' | 'es'; now?: { excluded: { public_or_structural: number; persona_fisica: number } } }) {
  const items: Array<[string, string]> = lang === 'en'
    ? [
        ['What “past half” means.', 'The supplier received over 50% of everything this buyer awarded (contract amounts) between 1 Jan 2024 and 28 Sep 2025. It describes how contracts were awarded, not how they were performed; only courts establish an offence. Some majorities are legitimate — a sole licensed operator, a single qualified shipyard.'],
        ['Lumpy by nature.', 'One multi-year contract lands in a single year: a 96% year can be one award. That is why the page uses two years, and why some rows already fell back below half in 2025 (↓).'],
        ['Awarded value, not payments.', 'COMPRANET records signed amounts; amendments and actual disbursements are not here.'],
        ['2025 is partial.', 'The federal feed stopped on 28 Sep 2025, so every 2025 share is a nine-month figure (marked *).'],
        ['Absence is not innocence.', 'Buyer ids are not continuous across the 2018 and 2023 data-format changes; only about a third of large historical buyers have 2024–25 records at all.'],
        ['Who is left out.', `${now ? now.excluded.public_or_structural : 'Some'} buyers whose majority holder is a state entity or a structural supplier are listed at right, not ranked; individuals are counted apart and not named here, and their RFC, CURP or address is never shown.`],
        ['Seals are cross-references.', 'Case labels come from RUBLI’s case base (most are leads, not adjudications); ARIA tiers are a risk indicator, never a probability of corruption.'],
      ]
    : [
        ['Qué significa «más de la mitad».', 'El proveedor recibió más del 50% de todo lo que este comprador adjudicó (montos de contrato) entre el 1 de enero de 2024 y el 28 de septiembre de 2025. Describe cómo se adjudicaron los contratos, no cómo se ejecutaron; solo los tribunales establecen un delito. Algunas mayorías son legítimas — un único operador con licencia, un solo astillero calificado.'],
        ['Irregular por naturaleza.', 'Un contrato plurianual cae en un solo año: un año de 96% puede ser una sola adjudicación. Por eso la página usa dos años, y por eso algunas filas ya bajaron de la mitad en 2025 (↓).'],
        ['Valor adjudicado, no pagos.', 'COMPRANET registra montos firmados; los convenios modificatorios y los pagos reales no están aquí.'],
        ['2025 es parcial.', 'El flujo federal se detuvo el 28 de septiembre de 2025; toda participación de 2025 es una cifra de nueve meses (marcada con *).'],
        ['La ausencia no es inocencia.', 'Los identificadores de compradores no son continuos entre los cambios de formato de 2018 y 2023; solo cerca de un tercio de los grandes compradores históricos tiene registros 2024–25.'],
        ['Quién queda fuera.', `${now ? now.excluded.public_or_structural : 'Algunos'} compradores cuyo proveedor mayoritario es una entidad del Estado o un proveedor estructural se listan a la derecha, sin clasificarse; las personas físicas se cuentan aparte y aquí no se nombran, y su RFC, CURP o domicilio nunca se muestran.`],
        ['Los sellos son referencias cruzadas.', 'Las etiquetas de caso vienen de la base de casos de RUBLI (la mayoría son indicios, no resoluciones); los niveles ARIA son un indicador de riesgo, nunca una probabilidad de corrupción.'],
      ]
  return (
    <div className="min-w-0">
      <h3 className="cap-h3">
        {lang === 'en' ? 'What a majority share is not' : 'Lo que una participación mayoritaria no es'}
      </h3>
      <ul className="cap-honesty">
        {items.map(([head, body]) => (
          <li key={head}>
            <strong className="text-text-primary font-semibold">{head}</strong> {glueDashes(body)}
          </li>
        ))}
      </ul>
    </div>
  )
}
