/**
 * «De cada cien pesos» / «Out of every hundred pesos» — Sexenios › Visualización (owner pick C,
 * _explore/sexenios_concepts_2026-10-28/README.md § C). One question, one sentence, one visual:
 * per term, 100 squares (two lines of 50; 25 a line on a phone) — ink = pesos to health-sector buyers,
 * rule gray = the other sectors; energy (Pemex, CFE) is outside the hundred because it left the register
 * after 2014, and each row says how big it was. Data: GET /analysis/sector-year-breakdown (institution
 * sector × calendar year), summed by term here; a year belongs to the president who governed most of it.
 */
import { useQueries, useQuery } from '@tanstack/react-query'
import { analysisApi } from '@/api/client'
import type { SectorYearItem } from '@/api/types'
import { Cover } from '@/components/contrato/Cover'
import { EntityIdentityChip } from '@/components/ui/EntityIdentityChip'
import { useLang, type Lang } from '@/components/contrato/nav'
import { fdate, nf } from '@/components/newtabs/ntShared'
import { ADMINISTRATIONS, ADMIN_COLORS, ADMIN_DISPLAY_ACCENTED, type AdministrationKey } from '@/lib/administrations'
import { INPC_2024 } from '@/lib/constants'
import { useDataCut } from '@/lib/useDataCut'
import { formatCompactMXN } from '@/lib/utils'
import { topReal } from '@/lib/pageQuestion'
import './cien-pesos.css'

const HEALTH = 1
const ENERGY = 4
/** The register starts in 2002; the handful of rows dated 2000–01 stay out (counted in the note). */
const FIRST_YEAR = 2002

export interface CienRow {
  key: AdministrationKey
  y0: number
  y1: number
  /** health ÷ (all sectors − energy), 0–1 */
  share: number
  /** energy ÷ all sectors, 0–1 */
  energy: number
  /** health money, 2024 pesos where INPC has the year, nominal otherwise */
  health: number
  /** true when some year of the term has no INPC yet (printed as nominal) */
  nominal: boolean
}

export function cienPesos(rows: SectorYearItem[]): { terms: CienRow[]; n2004: number; nEarly: number } {
  const terms = ADMINISTRATIONS.map((a) => {
    const y0 = Math.max(a.yearStart, FIRST_YEAR)
    const own = rows.filter((r) => r.year >= y0 && r.year <= a.yearEnd)
    const sum = (f: (r: SectorYearItem) => boolean, real = false) =>
      own.reduce((s, r) => s + (f(r) ? r.total_value / (real ? INPC_2024[r.year] ?? 1 : 1) : 0), 0)
    const all = sum(() => true)
    const energy = sum((r) => r.sector_id === ENERGY)
    const health = sum((r) => r.sector_id === HEALTH)
    return {
      key: a.key,
      y0,
      y1: own.reduce((m, r) => Math.max(m, r.year), y0),
      share: all - energy > 0 ? health / (all - energy) : 0,
      energy: all > 0 ? energy / all : 0,
      health: sum((r) => r.sector_id === HEALTH, true),
      nominal: own.some((r) => r.sector_id === HEALTH && INPC_2024[r.year] == null),
    }
  })
  const count = (f: (y: number) => boolean) => rows.reduce((s, r) => s + (f(r.year) ? r.contracts : 0), 0)
  return { terms, n2004: count((y) => y === 2004), nEarly: count((y) => y < FIRST_YEAR) }
}

/** lib/administrations keys → the backend's term keys (api/administrations.py). */
const ERA_KEY: Record<AdministrationKey, string> = { fox: 'fox', calderon: 'calderon', epn: 'pena_nieto', amlo: 'amlo', sheinbaum: 'sheinbaum' }

/** The claim above the rows holds only while it is true: health's share rose Peña Nieto → AMLO → Sheinbaum. */
export function risingSince2019(terms: CienRow[]): boolean {
  const at = (k: AdministrationKey) => terms.find((t) => t.key === k)?.share ?? 0
  return at('epn') < at('amlo') && at('amlo') < at('sheinbaum')
}

const pctTxt = (x: number) => `${x >= 0.1 ? Math.round(100 * x) : (100 * x).toFixed(1)}%`

function Pesos({ n, open }: { n: number; open: boolean }) {
  return (
    <div className="cp-pesos" aria-hidden="true">
      {Array.from({ length: 100 }, (_, i) => <i key={i} className={i < n ? 'is-s' : open && i === n ? 'is-p' : undefined} />)}
    </div>
  )
}

export function CienPesos() {
  const lang = useLang()
  const L = (es: string, en: string) => (lang === 'en' ? en : es)
  const cut = fdate(useDataCut(), lang)
  const q = useQuery({
    queryKey: ['sector-year-breakdown'],
    queryFn: () => analysisApi.getSectorYearBreakdown(),
    staleTime: 60 * 60 * 1000,
  })
  const d = q.data ? cienPesos(q.data.data) : null
  // «¿Quién ganó más en cada sexenio?» (docs/PAGE_QUESTIONS.md): each term's top supplier on the rows' own basis —
  // without energy-sector buyers (?sin_energia), CompraNet rows, re-ranked in 2024 pesos with INPC_2024 (topReal).
  const tops = useQueries({
    queries: ADMINISTRATIONS.map((a) => ({
      queryKey: ['analysis', 'admin-vendors-deep', ERA_KEY[a.key], 'sin-energia'],
      queryFn: () => analysisApi.getAdminVendorsDeep(ERA_KEY[a.key], 100, true),
      staleTime: 60 * 60 * 1000,
      retry: false,
    })),
  })
  const topOf = (k: AdministrationKey) => topReal(tops[ADMINISTRATIONS.findIndex((a) => a.key === k)]?.data?.vendors ?? [], INPC_2024)?.v ?? null

  return (
    <>
      <Cover
        title={L('Cinco presidentes, comparados con las mismas reglas.', 'Five presidents, compared by the same rules.')}
        lede={L(
          `Comparamos los sexenios con la misma vara: en pesos de 2024 y sin Pemex ni CFE, que dejaron de informar sus compras en 2014. El sexenio actual llega hasta el ${cut} y se actualiza cada semana; abajo, «El sexenio en curso» lo compara día por día.`,
          `We compare the terms with the same yardstick: in 2024 pesos and without Pemex or CFE, which stopped reporting their purchases in 2014. The current term runs to ${cut} and updates every week; below, «The current term» compares it day for day.`,
        )}
      />
      <section className="ct-section cp" aria-labelledby="cp-h">
        <p className="ct-sc cp-kicker">§ {L('De cada cien pesos', 'Out of every hundred pesos')}</p>
        <h2 id="cp-h" className="cp-claim">{d && risingSince2019(d.terms)
          ? L('Desde 2019, salud se lleva una parte cada vez mayor de cada peso contratado.', 'Since 2019, health takes a growing share of every peso contracted.')
          : L('De cada cien pesos contratados, cuántos fueron a salud.', 'Out of every hundred pesos contracted, how many went to health.')}</h2>
        {!d ? (
          q.isError
            ? <p className="nt-empty">{L('Las cifras no cargaron. Recargue la página.', 'The figures did not load. Reload the page.')}</p>
            : <div className="cp-skel ct-note" aria-busy="true">{L('Sumando los sexenios…', 'Adding up the terms…')}</div>
        ) : (
          <figure className="cp-fig" aria-label={L(
            'Por sexenio, cien cuadros: los negros son los pesos que fueron a dependencias de salud, los grises al resto; energía queda fuera de los cien.',
            'Per term, a hundred squares: the black ones are the pesos that went to health agencies, the gray ones to the rest; energy is left out of the hundred.',
          )}>
            <ol className="cp-rows">
              {d.terms.map((t) => {
                const open = t.key === 'sheinbaum'
                const n = Math.round(100 * t.share)
                const yrs = open ? `${t.y0} – ${cut}` : `${t.y0}–${String(t.y1).slice(2)}`
                return (
                  <li key={t.key} className="cp-row">
                    <div className="cp-who">
                      <b><span className="ct-sq" style={{ ['--c' as string]: ADMIN_COLORS[t.key] }} aria-hidden="true" />{ADMIN_DISPLAY_ACCENTED[t.key]}</b>
                      <small>{yrs} · {L(`Pemex y CFE: ${pctTxt(t.energy)} del registro`, `Pemex and CFE: ${pctTxt(t.energy)} of the record`)}</small>
                      {(() => {
                        const v = topOf(t.key)
                        return v ? <small className="cp-top">{open ? L('Mayor proveedor (a sep 2025): ', 'Top supplier (to Sep 2025): ') : L('Mayor proveedor: ', 'Top supplier: ')}<EntityIdentityChip type="vendor" id={v.vendor_id} name={v.vendor_name} variant="name" size="inherit" /></small> : null
                      })()}
                    </div>
                    <Pesos n={n} open={open} />
                    <div className="cp-num">
                      <b>{L(`${n} de 100`, `${n} of 100`)}</b>
                      <span className="cp-money">
                        <span>{L(`${formatCompactMXN(t.health)} a salud`, `${formatCompactMXN(t.health)} to health`)}</span>
                        <span>{L('pesos de 2024', '2024 pesos')}{t.nominal ? L(' (un año sin INPC, nominal)', ' (a year without INPC, nominal)') : ''}{open ? L(', parcial', ', partial') : ''}</span>
                      </span>
                    </div>
                  </li>
                )
              })}
            </ol>
            <div className="cp-legend">
              <span><i className="is-s" />{L('salud: IMSS, IMSS-Bienestar, ISSSTE, Birmex, Secretaría de Salud y los demás compradores de los ramos 12, 50 y 51', 'health: IMSS, IMSS-Bienestar, ISSSTE, Birmex, the Health Ministry and the other buyers in budget branches 12, 50 and 51')}</span>
              <span><i />{L('los otros diez sectores', 'the other ten sectors')}</span>
              <span><i className="is-p" />{L('sexenio abierto: la cifra cambia con cada corte', 'open term: the figure moves with each cut')}</span>
            </div>
            <figcaption className="ct-note">{L(
              'De cada 100 pesos contratados por dependencias fuera del sector energía, los que fueron a dependencias de salud, por sexenio. Sector según la dependencia que compra. Fuente: CompraNet 2002–sep 2025 · ComprasMX desde sep 2025.',
              'Of every 100 pesos contracted by agencies outside the energy sector, those that went to health agencies, by term. Sector by the buying agency. Source: CompraNet 2002–Sep 2025 · ComprasMX since Sep 2025.',
            )}</figcaption>
          </figure>
        )}
      </section>
    </>
  )
}

/** «How it is counted» — goes to the page's foot notes (OWNER_REVIEW § G1: notes never mid-page). */
export function useCienNote(lang: Lang): string | null {
  const q = useQuery({ queryKey: ['sector-year-breakdown'], queryFn: () => analysisApi.getSectorYearBreakdown(), staleTime: 60 * 60 * 1000 })
  if (!q.data) return null
  const { n2004, nEarly } = cienPesos(q.data.data)
  return lang === 'en'
    ? `Out of every hundred pesos, how it is counted: by calendar year; each year goes to the president who governed most of it, so the terms are close to, not exactly, the six years in office (October–December 2024 counts for AMLO). Amounts in 2024 pesos (INEGI's INPC; 2026 uses the January–September average). 2004 has only ${nf(n2004)} contracts in the record, so Fox's figure rests on four years. The ${nf(nEarly)} contracts dated 2000–01 are left out.`
    : `De cada cien pesos, cómo se cuenta: por año calendario; cada año se asigna al presidente que gobernó la mayor parte de él, así que los sexenios se acercan, sin ser exactos, a los seis años de gobierno (octubre a diciembre de 2024 cuentan para AMLO). Montos en pesos de 2024 (INPC del INEGI; para 2026, el promedio de enero a septiembre). 2004 tiene solo ${nf(n2004)} contratos en el registro, así que la cifra de Fox descansa en cuatro años. Los ${nf(nEarly)} contratos fechados en 2000–01 quedan fuera.`
}
